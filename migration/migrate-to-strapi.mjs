#!/usr/bin/env node
/**
 * Migra el contingut actual de web-ccbm (JSON a /data, font de veritat del
 * contingut publicat avui, generats fins ara des de Notion) cap a una
 * instància nova de Strapi.
 *
 * Content types esperats a Strapi (veure strapi/README.md al repo del CMS):
 *   news (api: news-items), gallery-photo (api: gallery-photos),
 *   destacat (api: destacats), diada (api: diades),
 *   historia-event (api: historia-events), comissio (api: comissions),
 *   membre (api: membres), about (single type, api: about)
 *
 * Variables d'entorn necessàries:
 *   STRAPI_URL    — URL base de la instància de Strapi (sense /api)
 *   STRAPI_TOKEN  — API token "full access" generat a Strapi (Settings → API Tokens)
 *
 * Ús:
 *   STRAPI_URL=https://xxx.up.railway.app STRAPI_TOKEN=xxxxx node migration/migrate-to-strapi.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const STRAPI_URL = process.env.STRAPI_URL?.replace(/\/+$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

if (!STRAPI_URL || !STRAPI_TOKEN) {
    console.error('❌ Falten STRAPI_URL i/o STRAPI_TOKEN com a variables d\'entorn.');
    process.exit(1);
}

/* ── HELPERS ── */

function readJSON(name) {
    return JSON.parse(readFileSync(join(ROOT, 'data', `${name}.json`), 'utf-8'));
}

async function api(path, options = {}) {
    const isForm = options.body instanceof FormData;
    const res = await fetch(`${STRAPI_URL}/api${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${STRAPI_TOKEN}`,
            ...(isForm ? {} : { 'Content-Type': 'application/json' }),
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

async function uploadBytes(bytes, filename) {
    const form = new FormData();
    form.append('files', new Blob([bytes]), filename);
    const data = await api('/upload', { method: 'POST', body: form });
    return data?.[0]?.id ?? null;
}

// Cache per no pujar dues vegades la mateixa imatge (gallery.json i news.json
// comparteixen fotos de img/fotos-galeria/)
const imageCache = new Map();

async function resolveImageId(imagePath) {
    if (!imagePath) return null;
    if (imageCache.has(imagePath)) return imageCache.get(imagePath);

    let id = null;
    try {
        if (/^https?:\/\//i.test(imagePath)) {
            const res = await fetch(imagePath);
            if (!res.ok) throw new Error(`descàrrega ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            const filename = (imagePath.split('/').pop() || 'imatge.jpg').split('?')[0];
            id = await uploadBytes(buf, filename);
        } else {
            const abs = join(ROOT, imagePath);
            const bytes = readFileSync(abs);
            const filename = imagePath.split('/').pop();
            id = await uploadBytes(bytes, filename);
        }
    } catch (err) {
        console.warn(`⚠️  no s'ha pogut pujar la imatge "${imagePath}": ${err.message}`);
        id = null;
    }

    imageCache.set(imagePath, id);
    return id;
}

/* ── MIGRACIONS ── */

async function migrateNews() {
    const items = readJSON('news');
    for (const n of items) {
        const image = await resolveImageId(n.image);
        await api('/news-items', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    title: n.title,
                    date: n.date,
                    category: n.category,
                    summary: n.summary,
                    image,
                    url: n.url,
                    externalId: n.id,
                },
            }),
        });
    }
    console.log(`✅ news → ${items.length} notícies`);
    return items.length;
}

async function migrateGallery() {
    const items = readJSON('gallery');
    for (const g of items) {
        const image = await resolveImageId(g.image);
        if (!image) {
            console.warn(`⚠️  s'omet foto de galeria sense imatge pujada: ${g.id}`);
            continue;
        }
        await api('/gallery-photos', {
            method: 'POST',
            body: JSON.stringify({
                data: { title: g.title || null, image, date: g.date, externalId: g.id },
            }),
        });
    }
    console.log(`✅ gallery → ${items.length} fotos`);
    return items.length;
}

async function migrateDestacats() {
    const items = readJSON('widget');
    for (const w of items) {
        await api('/destacats', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    title: w.title,
                    description: w.description,
                    date: w.date,
                    icon: w.icon,
                    externalId: w.id,
                },
            }),
        });
    }
    console.log(`✅ widget → ${items.length} destacats`);
    return items.length;
}

async function migrateAbout() {
    const about = readJSON('about');
    await api('/about', {
        method: 'PUT',
        body: JSON.stringify({
            data: {
                principal: about.principal
                    ? { titol: about.principal.titol, text: about.principal.text }
                    : null,
                stats: about.stats.map((s) => ({
                    titol: s.titol,
                    numero: s.numero,
                    prefix: s.prefix ?? null,
                })),
                valors: about.valors.map((v) => ({
                    titol: v.titol,
                    text: v.text,
                    icona: v.icona,
                })),
            },
        }),
    });
    console.log(`✅ about → principal + ${about.stats.length} stats + ${about.valors.length} valors`);
    return 1;
}

async function migrateDiades() {
    const items = readJSON('diades');
    for (const d of items) {
        await api('/diades', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    titol: d.titol,
                    date: d.date,
                    lloc: d.lloc,
                    hora: d.hora,
                    descripcio: d.descripcio,
                    diada_gran: d.diada_gran,
                    colla_amfitriona: d.colla_amfitriona,
                    colles_convidades: d.colles_convidades,
                    externalId: d.id,
                },
            }),
        });
    }
    console.log(`✅ diades → ${items.length} diades`);
    return items.length;
}

async function migrateHistoria() {
    const items = readJSON('historia');
    for (const h of items) {
        await api('/historia-events', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    titol: h.titol,
                    data: h.data,
                    tipus: h.tipus,
                    descripcio: h.descripcio,
                    externalId: h.id,
                },
            }),
        });
    }
    console.log(`✅ historia → ${items.length} esdeveniments`);
    return items.length;
}

/**
 * equip.json ja no és el contingut "pla" de Notion (nom + càrrec + comissions)
 * sinó el graf ja calculat (nodes/links). El reconstruïm:
 *   - nodes type "committee" → content type "comissio"
 *   - nodes type "member"    → content type "membre", amb relació a les
 *     comissions trobades seguint els "links" cap al node del membre.
 */
async function migrateEquip() {
    const { nodes, links } = readJSON('equip');

    const committeeNodes = nodes.filter((n) => n.type === 'committee');
    const memberNodes = nodes.filter((n) => n.type === 'member');

    // 1. Comissions
    const committeeStrapiId = new Map(); // node.id ("c-xxx") → id numèric de Strapi
    for (const c of committeeNodes) {
        const created = await api('/comissions', {
            method: 'POST',
            body: JSON.stringify({ data: { nom: c.label } }),
        });
        committeeStrapiId.set(c.id, created.data.id);
    }
    console.log(`✅ equip → ${committeeNodes.length} comissions`);

    // 2. Membres (amb relació a comissions, derivada dels links)
    let count = 0;
    for (let i = 0; i < memberNodes.length; i++) {
        const m = memberNodes[i];
        const comissionIds = links
            .filter((l) => l.target === m.id)
            .map((l) => committeeStrapiId.get(l.source))
            .filter(Boolean);

        const foto = await resolveImageId(m.foto);

        await api('/membres', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    nom: m.label,
                    carrec: m.role || null,
                    foto,
                    comissions: comissionIds,
                    ordre: i,
                },
            }),
        });
        count++;
    }
    console.log(`✅ equip → ${count} membres`);
    return { comissions: committeeNodes.length, membres: count };
}

/* ── VERIFICACIÓ ── */

async function countStrapi(plural) {
    const data = await api(`/${plural}?pagination[pageSize]=1`);
    return data?.meta?.pagination?.total ?? 0;
}

async function verify(expected) {
    console.log('\n🔍 Verificant comptes a Strapi...');
    const checks = [
        ['news-items', expected.news],
        ['gallery-photos', expected.gallery],
        ['destacats', expected.destacats],
        ['diades', expected.diades],
        ['historia-events', expected.historia],
        ['comissions', expected.equip.comissions],
        ['membres', expected.equip.membres],
    ];
    let allOk = true;
    for (const [plural, expectedCount] of checks) {
        const actual = await countStrapi(plural);
        const ok = actual === expectedCount;
        allOk = allOk && ok;
        console.log(`  ${ok ? '✅' : '❌'} ${plural}: esperats ${expectedCount}, trobats ${actual}`);
    }
    const aboutData = await api('/about');
    console.log(`  ${aboutData?.data ? '✅' : '❌'} about: ${aboutData?.data ? 'present' : 'ABSENT'}`);
    console.log(allOk ? '\n🎉 Migració verificada correctament.' : '\n⚠️  Hi ha discrepàncies, revisa els comptes.');
}

/* ── MAIN ── */
async function main() {
    console.log(`🔄 Migrant web-ccbm → Strapi (${STRAPI_URL})...\n`);

    const news = await migrateNews();
    const gallery = await migrateGallery();
    const destacats = await migrateDestacats();
    await migrateAbout();
    const diades = await migrateDiades();
    const historia = await migrateHistoria();
    const equip = await migrateEquip();

    await verify({ news, gallery, destacats, diades, historia, equip });

    console.log('\n🎉 Migració completada!');
}

main().catch((err) => {
    console.error('❌ Error durant la migració:', err.message);
    process.exit(1);
});
