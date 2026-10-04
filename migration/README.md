# Migració de contingut: Notion → Strapi

Aquesta carpeta conté el pas intermedi de la **Fase 1** de modernització de la
web (veure context complet amb Albert): substituir Notion com a "CMS" per una
instància pròpia de [Strapi](https://strapi.io) desplegada a Railway.

El `index.html` / `agenda.html` / JS actuals **no s'han tocat** — segueixen
llegint `/data/*.json`, generats com fins ara pel workflow
`.github/workflows/sync-notion.yml` cada 30 minuts. Això seguirà viu fins que
es faci la **Fase 2** (reescriure el frontend en Next.js consumint Strapi
directament, amb export estàtic al mateix GitHub Pages).

## Què fa `migrate-to-strapi.mjs`

Llegeix els JSON ja publicats a `/data` (news, gallery, widget, about, diades,
equip, historia) — són la font de veritat del contingut actual — i els
escriu a Strapi via la seva API REST:

| JSON actual     | Content type a Strapi          | Notes |
|------------------|---------------------------------|-------|
| `news.json`      | `news` (api `/api/news-items`)  | la imatge local es puja com a media |
| `gallery.json`    | `gallery-photo` (`/api/gallery-photos`) | fotos de `img/fotos-galeria/` pujades com a media |
| `widget.json`     | `destacat` (`/api/destacats`)   | |
| `about.json`      | `about` (single type, `/api/about`) | component `principal` + repeatables `stats`/`valors` |
| `diades.json`     | `diada` (`/api/diades`)         | |
| `historia.json`   | `historia-event` (`/api/historia-events`) | inclou les entrades `local-*` com a normals |
| `equip.json`      | `comissio` (`/api/comissions`) + `membre` (`/api/membres`) | `equip.json` ja és un graf calculat (nodes/links); el script el desfà per reconstruir membres + comissions "planes" amb la relació many-to-many entre elles. El graf (per al D3/force-layout de l'equip) es pot tornar a derivar a la Fase 2 a partir d'aquestes dues col·leccions. |

Cada entrada migrada guarda l'`id` original de Notion (o `local-...`) al camp
`externalId`, per poder fer re-migracions idempotents si cal en el futur.

## Com executar-lo

```bash
STRAPI_URL=https://<el-teu-strapi>.up.railway.app \
STRAPI_TOKEN=<api-token-full-access-de-strapi> \
node migration/migrate-to-strapi.mjs
```

Al final imprimeix una verificació comparant comptes (JSON font vs. Strapi).

No necessita `NOTION_TOKEN` ni cap `NOTION_*_DB_ID`: parteix dels JSON ja
generats, que reflecteixen el contingut publicat avui.

## Variables d'entorn noves per a la Fase 2 (frontend Next.js)

Seguint el mateix patró que `madrid-enoturismo-front` (`lib/strapi.ts`):

| Variable | Ús |
|---|---|
| `STRAPI_URL` | URL base de Strapi (servidor, sense `/api`) — per a fetch amb token |
| `NEXT_PUBLIC_STRAPI_URL` | Igual, exposada al client si cal (p.ex. per construir URLs de media) |
| `STRAPI_TOKEN` | API Token "full access" (o de només lectura) generat a Strapi → Settings → API Tokens. **Mai públic.** |

El codi font de la instància de Strapi (content types, config) viu en un
repo/projecte separat: `~/Documents/GitHub/web-ccbm-strapi` (no forma part
d'aquest repo estàtic). Desplegat a Railway, projecte propi "web-ccbm-strapi"
(independent de qualsevol altra instància de Strapi d'Albert).
