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
import { writeFileSync, mkdirSync, readdirSync } from 'fs';
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

function getFile(prop) {
    const files = prop?.files ?? [];
    if (files.length === 0) return null;
    const file = files[0];
    return file.type === 'external' ? file.external.url : file.file.url;
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

    return response.results.map(page => ({
        id:       page.id,
        title:    getTitle(page.properties['Títol']),
        date:     getDate(page.properties['Data']),
        category: getSelect(page.properties['Categoria']),
        summary:  getRichText(page.properties['Resum']),
        image:    getFile(page.properties['Imatge']) || getUrl(page.properties['URL Imatge']),
        url:      getUrl(page.properties['Enllaç']),
    })).filter(item => item.title);
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
        sorts: [{ property: 'Ordre', direction: 'ascending' }],
    });

    const principal = response.results
        .filter(p => getSelect(p.properties['Tipus']) === 'Principal')
        .map(p => ({
            titol: getTitle(p.properties['Títol']),
            text:  getRichText(p.properties['Text']),
        }))[0] || null;

    const stats = response.results
        .filter(p => getSelect(p.properties['Tipus']) === 'Estadística')
        .map(p => ({
            titol:  getTitle(p.properties['Títol']),
            numero: p.properties['Número']?.number ?? 0,
        }));

    const valors = response.results
        .filter(p => getSelect(p.properties['Tipus']) === 'Valor')
        .map(p => ({
            titol: getTitle(p.properties['Títol']),
            text:  getRichText(p.properties['Text']),
            icona: getRichText(p.properties['Icona']) || 'star',
        }));

    return { principal, stats, valors };
}

/* ── MAIN ── */
async function main() {
    console.log('🔄 Sincronitzant dades de Notion...');

    mkdirSync(join(ROOT, 'data'), { recursive: true });

    const [news, gallery, widget, about, diades] = await Promise.all([
        fetchNews(), fetchGallery(), fetchWidget(), fetchAbout(), fetchDiades()
    ]);

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

    console.log('🎉 Sincronització completada!');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
