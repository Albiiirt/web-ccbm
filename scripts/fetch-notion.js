#!/usr/bin/env node
/**
 * Sincronitza les bases de dades de Notion amb els JSON estàtics de la web.
 * S'executa via GitHub Actions (vegeu .github/workflows/sync-notion.yml).
 *
 * Variables d'entorn necessàries:
 *   NOTION_TOKEN           — Integration Token de Notion
 *   NOTION_NEWS_DB_ID      — ID de la base de dades "Notícies"
 *   NOTION_GALLERY_DB_ID   — ID de la base de dades "Galeria"
 *   NOTION_WIDGET_DB_ID    — ID de la base de dades "Destacats"
 */

import { Client } from '@notionhq/client';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

/* ── HELPERS ── */

function getRichText(prop) {
    return prop?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function getTitle(prop) {
    return prop?.title?.map(t => t.plain_text).join('') ?? '';
}

function getSelect(prop) {
    return prop?.select?.name ?? '';
}

function getDate(prop) {
    return prop?.date?.start ?? null;
}

function getUrl(prop) {
    return prop?.url ?? null;
}

function getCheckbox(prop) {
    return prop?.checkbox ?? false;
}

function getMultiSelect(prop) {
    return prop?.multi_select?.map(s => s.name) ?? [];
}

function getFile(prop) {
    const files = prop?.files ?? [];
    if (files.length === 0) return null;
    const file = files[0];
    if (file.type === 'external') return file.external.url;
    // Internal Notion uploads produce expiring S3 URLs — skip them
    return null;
}

/* ── FETCH NEWS ── */
async function fetchNews() {
    const dbId = process.env.NOTION_NEWS_DB_ID;
    if (!dbId) throw new Error('NOTION_NEWS_DB_ID no definida');

    const response = await notion.databases.query({
        database_id: dbId,
        filter: {
            property: 'Publicada',
            checkbox: { equals: true },
        },
        sorts: [
            { property: 'Data', direction: 'descending' },
        ],
    });

    // Load existing news to preserve local image paths
    let existing = [];
    try { existing = JSON.parse(readFileSync(join(ROOT, 'data', 'news.json'), 'utf-8')); } catch {}
    const existingImages = Object.fromEntries(existing.map(n => [n.id, n.image]));

    return response.results.map(page => {
        const id    = page.id;
        const image = getFile(page.properties['Imatge']) || getUrl(page.properties['URL Imatge']);
        // Keep existing local path if Notion has no permanent URL
        const finalImage = image || (existingImages[id] && !existingImages[id].startsWith('http') ? existingImages[id] : null);
        return {
            id,
            title:    getTitle(page.properties['Títol']),
            date:     getDate(page.properties['Data']),
            category: getSelect(page.properties['Categoria']),
            summary:  getRichText(page.properties['Resum']),
            image:    finalImage,
            url:      getUrl(page.properties['Enllaç']),
        };
    }).filter(item => item.title);
}

/* ── FETCH GALLERY ── */
async function fetchGallery() {
    // Fotos locals de img/fotos-galeria/
    const localDir = join(ROOT, 'img', 'fotos-galeria');
    let localImages = [];
    try {
        localImages = readdirSync(localDir)
            .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
            .sort()
            .map(f => ({
                id:    'local-' + f,
                title: '',
                image: 'img/fotos-galeria/' + f,
                date:  null,
            }));
    } catch {}

    // Fotos gestionades via Notion (URLs externes)
    const dbId = process.env.NOTION_GALLERY_DB_ID;
    if (!dbId) return localImages;

    const response = await notion.databases.query({
        database_id: dbId,
        sorts: [{ property: 'Data', direction: 'descending' }],
    });

    const notionImages = response.results.map(page => ({
        id:    page.id,
        title: getTitle(page.properties['Títol']),
        image: getFile(page.properties['Imatge']) || getUrl(page.properties['URL Imatge']),
        date:  getDate(page.properties['Data']),
    })).filter(item => item.image);

    return [...localImages, ...notionImages];
}

/* ── FETCH WIDGET ── */
async function fetchWidget() {
    const dbId = process.env.NOTION_WIDGET_DB_ID;
    if (!dbId) throw new Error('NOTION_WIDGET_DB_ID no definida');

    const response = await notion.databases.query({
        database_id: dbId,
        filter: {
            property: 'Actiu',
            checkbox: { equals: true },
        },
        sorts: [
            { property: 'Data', direction: 'ascending' },
        ],
        page_size: 3,
    });

    return response.results.map(page => ({
        id:          page.id,
        title:       getTitle(page.properties['Títol']),
        description: getRichText(page.properties['Descripció']),
        date:        getDate(page.properties['Data']),
        icon:        getSelect(page.properties['Icona']) || 'event',
    })).filter(item => item.title);
}

/* ── FETCH DIADES ── */
async function fetchDiades() {
    const dbId = process.env.NOTION_DIADES_DB_ID;
    if (!dbId) throw new Error('NOTION_DIADES_DB_ID no definida');

    const response = await notion.databases.query({
        database_id: dbId,
        filter: { property: 'Publicada', checkbox: { equals: true } },
        sorts: [{ property: 'Data', direction: 'ascending' }],
    });

    return response.results.map(page => ({
        id:         page.id,
        titol:      getTitle(page.properties['Títol']),
        date:       getDate(page.properties['Data']),
        lloc:       getRichText(page.properties['Lloc']),
        hora:       getRichText(page.properties['Hora']),
        descripcio: getRichText(page.properties['Descripció']),
        diada_gran:        getCheckbox(page.properties['Diada Gran']),
        colla_amfitriona:  getRichText(page.properties['Colla Amfitriona']),
        colles_convidades: getRichText(page.properties['Colles Convidades']),
    })).filter(item => item.titol);
}

/* ── FETCH ABOUT ── */
async function fetchAbout() {
    const dbId = process.env.NOTION_ABOUT_DB_ID;
    if (!dbId) throw new Error('NOTION_ABOUT_DB_ID no definida');

    const response = await notion.databases.query({
        database_id: dbId,
        filter: { property: 'Actiu', checkbox: { equals: true } },
    });
    response.results.sort((a, b) =>
        (a.properties['Ordre']?.number ?? 999) - (b.properties['Ordre']?.number ?? 999)
    );

    const principal = response.results
        .filter(p => getSelect(p.properties['Tipus']) === 'Principal')
        .map(p => ({
            titol: getTitle(p.properties['Títol']),
            text:  getRichText(p.properties['Text']),
        }))[0] || null;

    const STAT_PREFIXES = { 'camises': '+', 'castells descarregats': '+' };
    const stats = response.results
        .filter(p => getSelect(p.properties['Tipus']) === 'Estadística')
        .map(p => {
            const titol = getTitle(p.properties['Títol']);
            const stat = {
                titol,
                numero: p.properties['Número']?.number ?? 0,
            };
            const prefix = STAT_PREFIXES[titol.toLowerCase()];
            if (prefix) stat.prefix = prefix;
            return stat;
        });

    const valors = response.results
        .filter(p => getSelect(p.properties['Tipus']) === 'Valor')
        .map(p => ({
            titol: getTitle(p.properties['Títol']),
            text:  getRichText(p.properties['Text']),
            icona: getRichText(p.properties['Icona']) || 'star',
        }));

    return { principal, stats, valors };
}

/* ── FETCH EQUIP ── */
async function fetchEquip() {
    const dbId = process.env.NOTION_EQUIP_DB_ID;
    if (!dbId) throw new Error('NOTION_EQUIP_DB_ID no definida');

    const response = await notion.databases.query({
        database_id: dbId,
        filter: { property: 'Actiu', checkbox: { equals: true } },
    });
    response.results.sort((a, b) =>
        (a.properties['Ordre']?.number ?? 999) - (b.properties['Ordre']?.number ?? 999)
    );

    const members = response.results.map(page => ({
        nom:       getTitle(page.properties['Nom']),
        foto:      getUrl(page.properties['Foto']),
        carrec:    getRichText(page.properties['Càrrec']),
        comissions: getMultiSelect(page.properties['Comissió']),
    })).filter(m => m.nom && m.comissions.length > 0);

    // Comissions úniques → IDs estables
    const committeeMap = {};
    members.forEach(m => {
        m.comissions.forEach(c => {
            if (!committeeMap[c]) {
                committeeMap[c] = 'c-' + c
                    .toLowerCase()
                    .normalize('NFD').replace(/[̀-ͯ]/g, '')
                    .replace(/[^a-z0-9]+/g, '-');
            }
        });
    });

    const nodes = [
        { id: 'ccbm', label: 'CCBM', type: 'root' },
        ...Object.entries(committeeMap).map(([label, id]) => ({ id, label, type: 'committee' })),
        ...members.map((m, i) => ({
            id:   'm-' + i,
            label: m.nom,
            type:  'member',
            role:  m.carrec,
            foto:  m.foto,
        })),
    ];

    const links = [
        ...Object.values(committeeMap).map(id => ({ source: 'ccbm', target: id })),
        ...members.flatMap((m, i) =>
            m.comissions.map(c => ({ source: committeeMap[c], target: 'm-' + i }))
        ),
    ];

    return { nodes, links };
}

/* ── FETCH HISTORIA ── */
async function fetchHistoria() {
    const dbId = process.env.NOTION_HISTORIA_DB_ID;
    if (!dbId) { console.warn('⚠️  NOTION_HISTORIA_DB_ID no definida, s\'omet historia.json'); return null; }

    const response = await notion.databases.query({
        database_id: dbId,
        sorts: [{ property: 'Data', direction: 'ascending' }],
    });

    // Preserve local entries (id starts with 'local-') from existing file
    let localEntries = [];
    try {
        const existing = JSON.parse(readFileSync(join(ROOT, 'data', 'historia.json'), 'utf-8'));
        localEntries = existing.filter(e => e.id.startsWith('local-'));
    } catch {}

    const notionEntries = response.results.map(page => ({
        id:        page.id,
        titol:     getTitle(page.properties['Títol']),
        data:      getDate(page.properties['Data']),
        tipus:     getSelect(page.properties['Tipus']),
        descripcio: getRichText(page.properties['Descripció']),
    })).filter(item => item.titol && item.data);

    return [...localEntries, ...notionEntries].sort((a, b) => new Date(a.data) - new Date(b.data));
}

/* ── MAIN ── */
async function main() {
    console.log('🔄 Sincronitzant dades de Notion...');

    mkdirSync(join(ROOT, 'data'), { recursive: true });

    const [news, gallery, widget, about, diades, equip] = await Promise.all([
        fetchNews(), fetchGallery(), fetchWidget(), fetchAbout(), fetchDiades(), fetchEquip()
    ]);
    const historia = await fetchHistoria().catch(err => {
        console.warn('⚠️  fetchHistoria error:', err.message, '— s\'omet historia.json');
        return null;
    });

    writeFileSync(join(ROOT, 'data', 'news.json'), JSON.stringify(news, null, 2), 'utf-8');
    console.log(`✅ news.json — ${news.length} notícies`);

    writeFileSync(join(ROOT, 'data', 'gallery.json'), JSON.stringify(gallery, null, 2), 'utf-8');
    console.log(`✅ gallery.json — ${gallery.length} imatges`);

    writeFileSync(join(ROOT, 'data', 'widget.json'), JSON.stringify(widget, null, 2), 'utf-8');
    console.log(`✅ widget.json — ${widget.length} destacats actius`);

    writeFileSync(join(ROOT, 'data', 'about.json'), JSON.stringify(about, null, 2), 'utf-8');
    console.log(`✅ about.json — ${about.stats.length} estadístiques, ${about.valors.length} valors`);

    writeFileSync(join(ROOT, 'data', 'diades.json'), JSON.stringify(diades, null, 2), 'utf-8');
    console.log(`✅ diades.json — ${diades.length} diades`);

    writeFileSync(join(ROOT, 'data', 'equip.json'), JSON.stringify(equip, null, 2), 'utf-8');
    console.log(`✅ equip.json — ${equip.nodes.length} nodes`);

    if (historia !== null) {
        writeFileSync(join(ROOT, 'data', 'historia.json'), JSON.stringify(historia, null, 2), 'utf-8');
        console.log(`✅ historia.json — ${historia.length} events`);
    }

    console.log('🎉 Sincronització completada!');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
