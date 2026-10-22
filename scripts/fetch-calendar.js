#!/usr/bin/env node
/**
 * Sincronitza el Google Calendar privat de la colla (via la seva URL iCal
 * secreta, o un fitxer .ics local exportat a mà) cap al content type
 * "diada" de Strapi.
 * S'executa via GitHub Actions (vegeu .github/workflows/sync-calendar.yml),
 * o manualment contra un fitxer mentre no hi hagi la URL secreta configurada.
 *
 * Substitueix la via antiga Notion → data/diades.json (morta des del
 * 17/06/2026). Ara la font de veritat del calendari és Google Calendar i el
 * destí és Strapi (no es torna a escriure cap JSON local — la web llegeix
 * directament de l'API de Strapi, vegeu js/main.js).
 *
 * El calendari de la colla NO conté només diades: també hi ha assajos,
 * reunions de junta, tallers, peticions privades, etc. Aquest script filtra
 * (vegeu EXCLUDE_RE i CLASS:PRIVATE) per sincronitzar només esdeveniments que
 * semblen diades/actuacions públiques — és una heurística de text, no
 * perfecta: qualsevol fals positiu es pot despublicar a mà des del panell
 * de Strapi, igual que amb qualsevol altra diada.
 *
 * Ús:
 *   node scripts/fetch-calendar.js             → llegeix CALENDAR_ICAL_URL
 *   node scripts/fetch-calendar.js /ruta.ics   → llegeix el fitxer indicat
 *
 * Variables d'entorn necessàries:
 *   CALENDAR_ICAL_URL  — URL secreta "iCal" del Google Calendar de la colla
 *                        (https://calendar.google.com/calendar/ical/...).
 *                        MAI es mostra ni es commiteja enlloc. No cal si es
 *                        passa un fitxer local com a argument.
 *   STRAPI_URL         — URL base de Strapi (sense /api)
 *   STRAPI_TOKEN       — API Token "full access" de Strapi (mateix patró que
 *                        migration/migrate-to-strapi.mjs)
 *
 * Camps que NOMÉS es toquen en CREAR una diada nova (mai en actualitzar-ne
 * una existent, perquè la junta els edita a mà directament al panell de
 * Strapi): colla_amfitriona, colles_convidades, diada_gran.
 *
 * Diades recurrents (RRULE): només se sincronitza la PROPERA ocurrència
 * futura de la sèrie (no tot l'historial ni totes les repeticions). És una
 * limitació coneguda i acceptada — les diades castelleres pròpiament dites
 * gairebé mai són esdeveniments recurrents al calendari.
 *
 * Diades esborrades del calendari: no s'esborren automàticament de Strapi
 * (esborrar dades sol és més arriscat que deixar-ho per revisió manual). En
 * comptes d'això, el script avisa per consola de qualsevol diada que abans
 * venia d'aquest sincronitzador (té `externalId` omplert) i que ja no apareix
 * a l'última descàrrega del calendari, perquè algú de la junta ho revisi.
 */

import ical from 'node-ical';

const CALENDAR_ICS_FILE = process.argv[2] || null;
const CALENDAR_ICAL_URL = process.env.CALENDAR_ICAL_URL;
const STRAPI_URL = process.env.STRAPI_URL?.replace(/\/+$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

if (!CALENDAR_ICS_FILE && !CALENDAR_ICAL_URL) {
    console.error('❌ Falta CALENDAR_ICAL_URL com a variable d\'entorn (o un fitxer .ics com a argument).');
    process.exit(1);
}
if (!STRAPI_URL || !STRAPI_TOKEN) {
    console.error('❌ Falten STRAPI_URL i/o STRAPI_TOKEN com a variables d\'entorn.');
    process.exit(1);
}

// Esdeveniments del calendari que NO són diades: assajos, reunions, tallers,
// vida interna de la colla... Es filtren pel títol abans de tocar Strapi.
const EXCLUDE_RE = new RegExp([
    'assaig', 'assajos',
    'reuni[oó]', 'assemblea',
    'taller',
    'col[oò]nies', 'vacances',
    'calçotada', 'sopar de gala', 'revisió de càrrecs',
    'solicitud',
    '^anul', // "ANUL·LAT ..." (cancel·lats a mà, prefixats al títol)
    'contactar amb', // nota/recordatori intern de la junta
].join('|'), 'i');

const URL_LINE_RE = /https?:\/\/\S+|www\.\S+/i;
const MAX_DESC_LENGTH = 300;
const MADRID_TZ = 'Europe/Madrid';

/* ── HELPERS ── */

async function api(path, options = {}) {
    const res = await fetch(`${STRAPI_URL}/api${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${STRAPI_TOKEN}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${options.method || 'GET'} /api${path} → ${res.status}: ${text}`);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : null;
}

function formatDateMadrid(date) {
    // en-CA dona directament el format YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: MADRID_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function formatHoraMadrid(date) {
    const hhmm = new Intl.DateTimeFormat('ca-ES', {
        timeZone: MADRID_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
    return hhmm.replace(/\s*h\.?$/i, '') + ' h'; // normalitza a "HH:MM h"
}

const AMFITRIO_BLOCK_RE = /(?:Amfitrion(?:s|ia)?|Organitza)[:\s]*<br>?\s*(?:<ul>)?.*?<\/ul>\s*(?:<br>)?\s*(?:Colles?\s*[Cc]onvidades[:\s]*<br>?\s*(?:<ul>)?.*?<\/ul>)?/is;

/** Treu les línies amb URLs, el bloc "Amfitrions/Colles convidades" (ja es
 *  guarda a part, vegeu extractAmfitrioConvidades) i les etiquetes HTML, i
 *  retalla a MAX_DESC_LENGTH caràcters. */
function sanitizeDescription(raw) {
    if (!raw) return '';
    const withoutAmfitrioBlock = raw.replace(AMFITRIO_BLOCK_RE, '');
    const plain = withoutAmfitrioBlock
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li>/gi, '- ').replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    const text = plain
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !URL_LINE_RE.test(line))
        .join('\n')
        .trim();
    if (!text) return '';
    if (text.length <= MAX_DESC_LENGTH) return text;
    return text.slice(0, MAX_DESC_LENGTH).trim() + '…';
}

/** Per a esdeveniments recurrents, calcula la propera ocurrència futura. */
function resolveOccurrenceStart(event) {
    if (!event.rrule) return event.start;
    const next = event.rrule.after(new Date(), true);
    return next || null; // null si la sèrie ja s'ha acabat
}

/** Diades de colles amigues solen portar a la descripció un bloc
 *  "Amfitrions:"/"Organitza:" i un altre "Colles convidades:" (sovint en
 *  HTML amb <ul><li>). Els extraiem per omplir aquests camps en crear una
 *  diada nova — la junta els pot corregir a mà si cal. */
function extractAmfitrioConvidades(rawDescription) {
    if (!rawDescription) return { amfitriona: '', convidades: '' };
    const text = rawDescription.toString();
    const amfMatch = text.match(/(?:Amfitrion(?:s|ia)?|Organitza)[:\s]*<br>?\s*(?:<ul>)?(.*?)(?:<\/ul>|Colles?\s*[Cc]onvidades|$)/is);
    const convMatch = text.match(/Colles?\s*[Cc]onvidades[:\s]*<br>?\s*(?:<ul>)?(.*?)(?:<\/ul>|$)/is);
    const clean = (s) => (s || '')
        .replace(/<li>/gi, '').replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n').map(x => x.trim()).filter(Boolean).join('\n');
    return { amfitriona: clean(amfMatch?.[1]), convidades: clean(convMatch?.[1]) };
}

function mapEventToPayload(event, startDate) {
    const isAllDay = !!event.start?.dateOnly;
    return {
        titol: (event.summary || '').toString().trim(),
        date: formatDateMadrid(startDate),
        lloc: (event.location || '').toString().trim() || null,
        hora: isAllDay ? null : formatHoraMadrid(startDate),
        descripcio: sanitizeDescription(event.description ? event.description.toString() : ''),
    };
}

/* ── STRAPI UPSERT ── */

async function findExistingByExternalId(uid) {
    // Mirem primer entre les publicades i, si no hi és, entre els esborranys
    // (per si algú de la junta l'ha despublicat manualment).
    for (const status of ['published', 'draft']) {
        const query = new URLSearchParams({
            'filters[externalId][$eq]': uid,
            status,
        });
        const res = await api(`/diades?${query.toString()}`);
        if (res?.data?.length) return res.data[0];
    }
    return null;
}

async function upsertDiada(uid, payload, { amfitriona, convidades }) {
    const existing = await findExistingByExternalId(uid);

    if (existing) {
        // Actualitzar NOMÉS els camps que vénen del calendari. Mai tocar
        // colla_amfitriona / colles_convidades / diada_gran d'una diada ja
        // existent — són editables a mà per la junta al panell de Strapi.
        await api(`/diades/${existing.documentId}?status=published`, {
            method: 'PUT',
            body: JSON.stringify({ data: payload }),
        });
        return 'updated';
    }

    // Diada nova: provem d'omplir amfitriona/convidades a partir de la
    // descripció del calendari; la junta els pot corregir a mà si cal.
    await api('/diades?status=published', {
        method: 'POST',
        body: JSON.stringify({
            data: {
                ...payload,
                diada_gran: false,
                colla_amfitriona: amfitriona,
                colles_convidades: convidades,
                externalId: uid,
            },
        }),
    });
    return 'created';
}

/** Diades sincronitzades anteriorment (tenen externalId) que ja no surten al
 *  calendari — probablement cancel·lades o esborrades. No s'esborren soles,
 *  només s'avisa per revisió manual. */
async function warnAboutMissingEvents(seenUids) {
    const query = new URLSearchParams({
        'filters[externalId][$notNull]': 'true',
        'pagination[pageSize]': '100',
        status: 'published',
    });
    const res = await api(`/diades?${query.toString()}`);
    const missing = (res?.data || []).filter(d => d.externalId && !seenUids.has(d.externalId));
    if (missing.length === 0) return;

    console.warn(`⚠️  ${missing.length} diada(es) ja no apareixen al calendari (potser cancel·lades/esborrades) — revisa-les manualment a Strapi:`);
    missing.forEach(d => console.warn(`   - "${d.titol}" (${d.date || 'sense data'}) — externalId: ${d.externalId}`));
}

/* ── MAIN ── */

async function main() {
    console.log(CALENDAR_ICS_FILE
        ? `🔄 Sincronitzant fitxer local "${CALENDAR_ICS_FILE}" → Strapi...`
        : '🔄 Sincronitzant Google Calendar → Strapi...');

    const calendarData = CALENDAR_ICS_FILE
        ? await ical.async.parseFile(CALENDAR_ICS_FILE)
        : await ical.async.fromURL(CALENDAR_ICAL_URL);
    const events = Object.values(calendarData).filter(e => e.type === 'VEVENT');

    let created = 0, updated = 0, skipped = 0, filtered = 0;
    const seenUids = new Set();

    for (const event of events) {
        if (!event.uid || !event.summary) { skipped++; continue; }
        if (event.status && String(event.status).toUpperCase() === 'CANCELLED') {
            console.log(`⏭️  Omesa (cancel·lada): "${event.summary}"`);
            continue;
        }

        const summary = event.summary.toString().trim();
        const isPrivate = event.class && String(event.class).toUpperCase() === 'PRIVATE';
        if (isPrivate || EXCLUDE_RE.test(summary)) {
            filtered++;
            continue; // no és una diada (assaig/reunió/taller/privat...)
        }

        const startDate = resolveOccurrenceStart(event);
        if (!startDate) { skipped++; continue; } // sèrie recurrent ja acabada

        seenUids.add(event.uid);
        const payload = mapEventToPayload(event, startDate);
        if (!payload.titol) { skipped++; continue; }

        try {
            const extra = extractAmfitrioConvidades(event.description);
            const result = await upsertDiada(event.uid, payload, extra);
            if (result === 'created') created++; else updated++;
            console.log(`✅ ${result === 'created' ? 'Creada' : 'Actualitzada'}: "${payload.titol}" (${payload.date})`);
        } catch (err) {
            console.error(`❌ Error sincronitzant "${payload.titol}": ${err.message}`);
        }
    }

    await warnAboutMissingEvents(seenUids);

    console.log(`🎉 Sincronització completada! ${created} creades, ${updated} actualitzades, ${filtered} descartades (no diades), ${skipped} omeses.`);
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
