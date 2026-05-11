import { createSlider, initLightbox } from './app.js';

/* Carrega el JSON generat pel GitHub Action (o les dades de mostra) */
async function loadJSON(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
    } catch (err) {
        console.warn(`No s'ha pogut carregar ${path}:`, err.message);
        return null;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── NEWS SLIDER ── */
export async function initNewsSlider() {
    const slider = document.getElementById('news-slider');
    if (!slider) return;

    const data = await loadJSON('data/news.json');

    if (!data || data.length === 0) {
        slider.innerHTML = `
            <div class="slider__empty">
                <span class="material-symbols-outlined">newspaper</span>
                Encara no hi ha notícies publicades.
            </div>`;
        return;
    }

    slider.innerHTML = data.map(item => `
        <article class="news-card" role="article">
            <div class="news-card__media">
                ${item.image
                    ? `<img src="${escHtml(item.image)}" alt="${escHtml(item.title)}" loading="lazy">`
                    : `<div class="news-card__media-placeholder">
                           <span class="material-symbols-outlined">newspaper</span>
                           <span>CCBM</span>
                       </div>`
                }
                ${item.category ? `<span class="news-card__chip">${escHtml(item.category)}</span>` : ''}
            </div>
            <div class="news-card__body">
                ${item.date ? `
                    <p class="news-card__date">
                        <span class="material-symbols-outlined">calendar_today</span>
                        ${formatDate(item.date)}
                    </p>` : ''}
                <h3 class="news-card__title">${escHtml(item.title)}</h3>
                ${item.summary ? `<p class="news-card__summary">${escHtml(item.summary)}</p>` : ''}
                ${item.url ? `
                    <a href="${escHtml(item.url)}" class="news-card__link" target="_blank" rel="noopener">
                        Llegir més <span class="material-symbols-outlined">arrow_forward</span>
                    </a>` : ''}
            </div>
        </article>
    `).join('');

    const ctrl = createSlider({
        sliderId: 'news-slider',
        prevId:   'news-prev',
        nextId:   'news-next',
        cardWidth: 340,
    });
    ctrl.setReady();
}

/* ── GALLERY SLIDER ── */
export async function initGallerySlider() {
    const slider = document.getElementById('gallery-slider');
    if (!slider) return;

    const data = await loadJSON('data/gallery.json');

    if (!data || data.length === 0) {
        slider.innerHTML = `
            <div class="slider__empty">
                <span class="material-symbols-outlined">photo_library</span>
                Encara no hi ha imatges a la galeria.
            </div>`;
        return;
    }

    const images = data.map(item => ({
        src:     item.image,
        caption: item.title || '',
    }));

    slider.innerHTML = data.map((item, i) => `
        <button class="gallery-card" data-index="${i}" aria-label="${escHtml(item.title || 'Obrir imatge')}">
            ${item.image
                ? `<img src="${escHtml(item.image)}" alt="${escHtml(item.title || '')}" loading="lazy">`
                : `<div class="about__image-placeholder" style="height:100%">
                       <span class="material-symbols-outlined">image</span>
                   </div>`
            }
            <div class="gallery-card__overlay">
                <span class="gallery-card__caption">${escHtml(item.title || '')}</span>
            </div>
        </button>
    `).join('');

    const lightbox = initLightbox(images);

    slider.querySelectorAll('.gallery-card').forEach(card => {
        card.addEventListener('click', () => {
            lightbox.show(parseInt(card.dataset.index, 10));
        });
    });

    const ctrl = createSlider({
        sliderId: 'gallery-slider',
        prevId:   'gallery-prev',
        nextId:   'gallery-next',
        cardWidth: 300,
    });
    ctrl.setReady();
}

/* XSS-safe string escaping */
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
