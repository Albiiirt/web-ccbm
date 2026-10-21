#!/usr/bin/env node
/**
 * Sincronitza el Google Calendar privat de la colla (via la seva URL iCal
 * secreta) cap al content type "diada" de Strapi.
 * S'executa via GitHub Actions (vegeu .github/workflows/sync-calendar.yml).
 *
 * Substitueix la via antiga Notion → data/diades.json (morta des del
 * 17/06/2026). Ara la font de veritat del calendari és Google Calendar i el
 * destí és Strapi (no es torna a escriure cap JSON local — la web llegeix
 * directament de l'API de Strapi, vegeu js/main.js).
 *
 * Variables d'entorn necessàries:
 *   CALENDAR_ICAL_URL  — URL secreta "iCal" del Google Calendar de la colla
 *                        (https://calendar.google.com/calendar/ical/...).
 *                        MAI es mostra ni es commiteja enlloc.
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

const CALENDAR_ICAL_URL = process.env.CALENDAR_ICAL_URL;
const STRAPI_URL = process.env.STRAPI_URL?.replace(/\/+$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

if (!CALENDAR_ICAL_URL) {
    console.error('❌ Falta CALENDAR_ICAL_URL com a variable d\'entorn.');
    process.exit(1);
}
if (!STRAPI_URL || !STRAPI_TOKEN) {
    console.error('❌ Falten STRAPI_URL i/o STRAPI_TOKEN com a variables d\'entorn.');
    process.exit(1);
}

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

/** Treu les línies amb URLs i retalla a MAX_DESC_LENGTH caràcters. */
function sanitizeDescription(raw) {
    if (!raw) return '';
    const text = raw
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

async function upsertDiada(uid, payload) {
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

    // Diada nova: deixem els camps editables a mà amb el seu valor per
    // defecte perquè la junta els ompli si vol.
    await api('/diades?status=published', {
        method: 'POST',
        body: JSON.stringify({
            data: {
                ...payload,
                diada_gran: false,
                colla_amfitriona: '',
                colles_convidades: '',
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
    console.log('🔄 Sincronitzant Google Calendar → Strapi...');

    const calendarData = await ical.async.fromURL(CALENDAR_ICAL_URL);
    const events = Object.values(calendarData).filter(e => e.type === 'VEVENT');

    let created = 0, updated = 0, skipped = 0;
    const seenUids = new Set();

    for (const event of events) {
        if (!event.uid || !event.summary) { skipped++; continue; }
        if (event.status && String(event.status).toUpperCase() === 'CANCELLED') {
            console.log(`⏭️  Omesa (cancel·lada): "${event.summary}"`);
            continue;
        }

        const startDate = resolveOccurrenceStart(event);
        if (!startDate) { skipped++; continue; } // sèrie recurrent ja acabada

        seenUids.add(event.uid);
        const payload = mapEventToPayload(event, startDate);
        if (!payload.titol) { skipped++; continue; }

        try {
            const result = await upsertDiada(event.uid, payload);
            if (result === 'created') created++; else updated++;
            console.log(`✅ ${result === 'created' ? 'Creada' : 'Actualitzada'}: "${payload.titol}" (${payload.date})`);
        } catch (err) {
            console.error(`❌ Error sincronitzant "${payload.titol}": ${err.message}`);
        }
    }

    await warnAboutMissingEvents(seenUids);

    console.log(`🎉 Sincronització completada! ${created} creades, ${updated} actualitzades, ${skipped} omeses.`);
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
