import { createSlider, initLightbox } from './slider.js';

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
    return new Date(dateStr).toLocaleDateString('ca-ES', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── WIDGET DESTACATS ── */
export async function initWidget() {
    const widget   = document.getElementById('hero-widget');
    const list     = document.getElementById('widget-list');
    const closeBtn = document.getElementById('widget-close');
    if (!widget || !list) return;

    const data = await loadJSON('data/widget.json');
    if (!data || data.length === 0) return;

    list.innerHTML = data.map(item => {
        const dateStr = item.date
            ? new Date(item.date).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;
        return `
        <li class="widget__item">
            <div class="widget__icon-wrap">
                <span class="material-symbols-outlined">${escHtml(item.icon)}</span>
            </div>
            <div class="widget__text">
                <p class="widget__title">${escHtml(item.title)}</p>
                ${item.description ? `<p class="widget__desc">${escHtml(item.description)}</p>` : ''}
                ${dateStr ? `<p class="widget__date">
                    <span class="material-symbols-outlined">calendar_today</span>${dateStr}
                </p>` : ''}
            </div>
        </li>`;
    }).join('');

    widget.hidden = false;

    closeBtn.addEventListener('click', () => {
        widget.hidden = true;
        sessionStorage.setItem('widget-closed', '1');
    });

    if (sessionStorage.getItem('widget-closed') === '1') widget.hidden = true;
}

/* ── NEWS ── */
export async function initNewsSlider() {
    const slider = document.getElementById('news-slider');
    if (!slider) return;

    const data = await loadJSON('data/news.json');

    if (!data || data.length === 0) {
        slider.innerHTML = `<div class="slider__empty">
            <span class="material-symbols-outlined">newspaper</span>
            Encara no hi ha notícies publicades.
        </div>`;
        return;
    }

    slider.innerHTML = data.map(item => `
        <article class="news-card">
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
                ${item.date ? `<p class="news-card__date">
                    <span class="material-symbols-outlined">calendar_today</span>
                    ${formatDate(item.date)}
                </p>` : ''}
                <h3 class="news-card__title">${escHtml(item.title)}</h3>
                ${item.summary ? `<p class="news-card__summary">${escHtml(item.summary)}</p>` : ''}
                ${item.url ? `<a href="${escHtml(item.url)}" class="news-card__link" target="_blank" rel="noopener">
                    Llegir més <span class="material-symbols-outlined">arrow_forward</span>
                </a>` : ''}
            </div>
        </article>
    `).join('');

    createSlider({ sliderId: 'news-slider', prevId: 'news-prev', nextId: 'news-next', cardWidth: 340 }).setReady();
}

/* ── GALLERY ── */
export async function initGallerySlider() {
    const slider = document.getElementById('gallery-slider');
    if (!slider) return;

    const data = await loadJSON('data/gallery.json');

    if (!data || data.length === 0) {
        slider.innerHTML = `<div class="slider__empty">
            <span class="material-symbols-outlined">photo_library</span>
            Encara no hi ha imatges a la galeria.
        </div>`;
        return;
    }

    const images = data.map(item => ({ src: item.image, caption: item.title || '' }));

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
        card.addEventListener('click', () => lightbox.show(parseInt(card.dataset.index, 10)));
    });

    createSlider({ sliderId: 'gallery-slider', prevId: 'gallery-prev', nextId: 'gallery-next', cardWidth: 300 }).setReady();
}
