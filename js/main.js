/* ============================================================
   CCBM — main.js  (tot en un fitxer, sense mòduls)
   ============================================================ */

/* ── HELPERS ── */

async function loadJSON(path) {
    try {
        const res = await fetch(path + '?v=' + Date.now());
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
    } catch (err) {
        console.warn('CCBM: no s\'ha pogut carregar', path, err.message);
        return null;
    }
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ca-ES', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

/* ── TOP BAR SCROLL ── */

const topBar = document.getElementById('top-bar');
window.addEventListener('scroll', () => {
    topBar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });
topBar.classList.toggle('scrolled', window.scrollY > 60);

/* ── MOBILE DRAWER ── */

const navToggle      = document.getElementById('nav-toggle');
const mobileDrawer   = document.getElementById('mobile-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const drawerClose    = document.getElementById('drawer-close');

function openDrawer() {
    mobileDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
}
function closeDrawer() {
    mobileDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}
navToggle.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
document.querySelectorAll('.mobile-drawer__link').forEach(l => l.addEventListener('click', closeDrawer));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ── ACTIVE NAV ON SCROLL ── */

const navLinks = document.querySelectorAll('.nav-link');
new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id));
    });
}, { threshold: 0.4 }).observe.bind(
    document.querySelectorAll('main [id]').forEach.bind(
        document.querySelectorAll('main [id]')
    )
);
const sectionObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id));
    });
}, { threshold: 0.4 });
document.querySelectorAll('main [id]').forEach(s => sectionObs.observe(s));

/* ── FADE IN ── */

const fadeObs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        fadeObs.unobserve(entry.target);
    });
}, { threshold: 0.15 });
document.querySelectorAll('.value-card, .stat, .about__text, .about__visual, .contact__info, .contact__form')
    .forEach(el => { el.classList.add('fade-in-up'); fadeObs.observe(el); });

/* ── STAT COUNTER ── */

function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const start = performance.now();
    (function tick(now) {
        const t = Math.min((now - start) / 1400, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(eased * target);
        if (t < 1) requestAnimationFrame(tick);
    })(start);
}
const statsBlock = document.querySelector('.about__stats');
if (statsBlock) {
    new IntersectionObserver(([e]) => {
        if (e.isIntersecting) statsBlock.querySelectorAll('.stat__number').forEach(animateCounter);
    }, { threshold: 0.5 }).observe(statsBlock);
}

/* ── SELECT LABEL FIX ── */

document.querySelectorAll('select.field__input').forEach(sel => {
    sel.addEventListener('change', () => {
        const label = sel.nextElementSibling;
        if (!label || !sel.value) return;
        Object.assign(label.style, { top: '0', transform: 'translateY(-50%)', fontSize: '.75rem', color: 'var(--md-primary)' });
    });
});

/* ── CONTACT FORM ── */

const form      = document.getElementById('contact-form');
const feedback  = document.getElementById('form-feedback');
const submitBtn = document.getElementById('form-submit');

if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined rotating">autorenew</span> Enviant…';
        try {
            const res = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' }
            });
            if (res.ok) {
                form.reset();
                showFeedback('success', '✓ Missatge enviat! Et respondrem aviat.');
            } else {
                showFeedback('error', 'Hi ha hagut un error. Torna-ho a intentar.');
            }
        } catch {
            showFeedback('error', 'Sense connexió. Torna-ho a intentar.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined">send</span> Enviar missatge';
        }
    });
}
function showFeedback(type, msg) {
    feedback.className = 'form-feedback ' + type;
    feedback.textContent = msg;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { feedback.className = 'form-feedback'; }, 6000);
}

/* ── SLIDER FACTORY ── */

function createSlider(sliderId, prevId, nextId, cardWidth) {
    cardWidth = cardWidth || 340;
    const slider  = document.getElementById(sliderId);
    const prev    = document.getElementById(prevId);
    const next    = document.getElementById(nextId);
    if (!slider) return;

    let pos = 0, maxPos = 0, dragging = false, startX = 0, startScroll = 0;
    const vp = slider.parentElement;

    function recalc() {
        maxPos = Math.max(0, slider.scrollWidth - vp.clientWidth);
        updateBtns();
    }
    function slideTo(p) {
        pos = Math.max(0, Math.min(p, maxPos));
        slider.style.transform = 'translateX(-' + pos + 'px)';
        updateBtns();
    }
    function updateBtns() {
        if (prev) prev.disabled = pos <= 0;
        if (next) next.disabled = pos >= maxPos;
    }

    if (next) next.addEventListener('click', () => slideTo(pos + cardWidth + 16));
    if (prev) prev.addEventListener('click', () => slideTo(pos - cardWidth - 16));

    vp.addEventListener('mousedown', e => { dragging = true; startX = e.pageX; startScroll = pos; vp.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', e => { if (dragging) slideTo(startScroll + (startX - e.pageX)); });
    window.addEventListener('mouseup', () => { dragging = false; vp.style.cursor = 'grab'; });
    vp.addEventListener('touchstart', e => { startX = e.touches[0].pageX; startScroll = pos; }, { passive: true });
    vp.addEventListener('touchmove', e => { slideTo(startScroll + (startX - e.touches[0].pageX)); }, { passive: true });
    window.addEventListener('resize', recalc);

    recalc();
}

/* ── LIGHTBOX ── */

function initLightbox(images) {
    const lb      = document.getElementById('lightbox');
    const img     = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    const closeEl = document.getElementById('lightbox-close');
    const backdrop= document.getElementById('lightbox-backdrop');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    let cur = 0;

    function show(i) {
        cur = (i + images.length) % images.length;
        img.src = images[cur].src;
        img.alt = images[cur].caption;
        caption.textContent = images[cur].caption;
        lb.hidden = false;
        document.body.style.overflow = 'hidden';
    }
    function hide() {
        lb.hidden = true;
        document.body.style.overflow = '';
    }
    closeEl.addEventListener('click', hide);
    backdrop.addEventListener('click', hide);
    prevBtn.addEventListener('click', () => show(cur - 1));
    nextBtn.addEventListener('click', () => show(cur + 1));
    document.addEventListener('keydown', e => {
        if (lb.hidden) return;
        if (e.key === 'Escape')     hide();
        if (e.key === 'ArrowLeft')  show(cur - 1);
        if (e.key === 'ArrowRight') show(cur + 1);
    });
    return { show };
}

/* ── WIDGET DESTACATS ── */

async function initWidget() {
    const widget   = document.getElementById('hero-widget');
    const list     = document.getElementById('widget-list');
    const closeBtn = document.getElementById('widget-close');
    if (!widget || !list) return;

    const data = await loadJSON('data/widget.json');
    if (!data || data.length === 0) return;

    list.innerHTML = data.map(function(item) {
        const dateStr = item.date
            ? new Date(item.date).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;
        return '<li class="widget__item">' +
            '<div class="widget__icon-wrap">' +
                '<span class="material-symbols-outlined">' + escHtml(item.icon) + '</span>' +
            '</div>' +
            '<div class="widget__text">' +
                '<p class="widget__title">' + escHtml(item.title) + '</p>' +
                (item.description ? '<p class="widget__desc">' + escHtml(item.description) + '</p>' : '') +
                (dateStr ? '<p class="widget__date"><span class="material-symbols-outlined">calendar_today</span>' + dateStr + '</p>' : '') +
            '</div>' +
        '</li>';
    }).join('');

    if (sessionStorage.getItem('widget-closed') !== '1') {
        widget.hidden = false;
    }
    closeBtn.addEventListener('click', function() {
        widget.hidden = true;
        sessionStorage.setItem('widget-closed', '1');
    });
}

/* ── NEWS SLIDER ── */

async function initNewsSlider() {
    const slider = document.getElementById('news-slider');
    if (!slider) return;

    const data = await loadJSON('data/news.json');

    if (!data || data.length === 0) {
        slider.innerHTML = '<div class="slider__empty"><span class="material-symbols-outlined">newspaper</span> Encara no hi ha notícies publicades.</div>';
        return;
    }

    slider.innerHTML = data.map(function(item) {
        return '<article class="news-card">' +
            '<div class="news-card__media">' +
                (item.image
                    ? '<img src="' + escHtml(item.image) + '" alt="' + escHtml(item.title) + '" loading="lazy">'
                    : '<div class="news-card__media-placeholder"><span class="material-symbols-outlined">newspaper</span><span>CCBM</span></div>'
                ) +
                (item.category ? '<span class="news-card__chip">' + escHtml(item.category) + '</span>' : '') +
            '</div>' +
            '<div class="news-card__body">' +
                (item.date ? '<p class="news-card__date"><span class="material-symbols-outlined">calendar_today</span> ' + formatDate(item.date) + '</p>' : '') +
                '<h3 class="news-card__title">' + escHtml(item.title) + '</h3>' +
                (item.summary ? '<p class="news-card__summary">' + escHtml(item.summary) + '</p>' : '') +
                (item.url ? '<a href="' + escHtml(item.url) + '" class="news-card__link" target="_blank" rel="noopener">Llegir més <span class="material-symbols-outlined">arrow_forward</span></a>' : '') +
            '</div>' +
        '</article>';
    }).join('');

    createSlider('news-slider', 'news-prev', 'news-next', 340);
}

/* ── GALLERY SLIDER ── */

async function initGallerySlider() {
    const slider = document.getElementById('gallery-slider');
    if (!slider) return;

    const data = await loadJSON('data/gallery.json');

    if (!data || data.length === 0) {
        slider.innerHTML = '<div class="slider__empty"><span class="material-symbols-outlined">photo_library</span> Encara no hi ha imatges a la galeria.</div>';
        return;
    }

    const images = data.map(function(item) { return { src: item.image, caption: item.title || '' }; });

    slider.innerHTML = data.map(function(item, i) {
        return '<button class="gallery-card" data-index="' + i + '" aria-label="' + escHtml(item.title || 'Obrir imatge') + '">' +
            (item.image
                ? '<img src="' + escHtml(item.image) + '" alt="' + escHtml(item.title || '') + '" loading="lazy">'
                : '<div class="about__image-placeholder" style="height:100%"><span class="material-symbols-outlined">image</span></div>'
            ) +
            '<div class="gallery-card__overlay"><span class="gallery-card__caption">' + escHtml(item.title || '') + '</span></div>' +
        '</button>';
    }).join('');

    const lb = initLightbox(images);
    slider.querySelectorAll('.gallery-card').forEach(function(card) {
        card.addEventListener('click', function() { lb.show(parseInt(card.dataset.index, 10)); });
    });

    createSlider('gallery-slider', 'gallery-prev', 'gallery-next', 300);
}

/* ── DIADA GRAN ── */

async function initDiadaGran() {
    const data = await loadJSON('data/diades.json');
    if (!data) return;

    const gran = data.find(function(d) { return d.diada_gran; });
    if (!gran) return;

    const section  = document.getElementById('diada-gran');
    const titleEl  = document.getElementById('dg-title');
    const metaEl   = document.getElementById('dg-meta');
    if (!section) return;

    titleEl.textContent = gran.titol;

    var metaHtml = '';
    if (gran.date) {
        var dateStr = new Date(gran.date + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        metaHtml += '<div class="diada-gran__meta-item"><span class="material-symbols-outlined">calendar_today</span>' + dateStr + '</div>';
    }
    if (gran.lloc)              metaHtml += '<div class="diada-gran__meta-item"><span class="material-symbols-outlined">location_on</span>' + escHtml(gran.lloc) + '</div>';
    if (gran.hora)              metaHtml += '<div class="diada-gran__meta-item"><span class="material-symbols-outlined">schedule</span>' + escHtml(gran.hora) + '</div>';
    if (gran.colla_amfitriona)  metaHtml += '<div class="diada-gran__meta-item"><span class="material-symbols-outlined">home</span>Amfitriona: ' + escHtml(gran.colla_amfitriona) + '</div>';
    if (gran.colles_convidades) metaHtml += '<div class="diada-gran__meta-item"><span class="material-symbols-outlined">groups</span>Colles: ' + escHtml(gran.colles_convidades) + '</div>';
    metaEl.innerHTML = metaHtml;

    section.hidden = false;

    if (!gran.date) return;
    var target = new Date(gran.date + 'T' + (gran.hora ? gran.hora.replace(' h','') + ':00' : '00:00:00'));

    function tick() {
        var diff = target - Date.now();
        if (diff <= 0) {
            document.getElementById('dg-days').textContent  = '00';
            document.getElementById('dg-hours').textContent = '00';
            document.getElementById('dg-mins').textContent  = '00';
            document.getElementById('dg-secs').textContent  = '00';
            return;
        }
        var d = Math.floor(diff / 86400000);
        var h = Math.floor((diff % 86400000) / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        document.getElementById('dg-days').textContent  = String(d).padStart(2,'0');
        document.getElementById('dg-hours').textContent = String(h).padStart(2,'0');
        document.getElementById('dg-mins').textContent  = String(m).padStart(2,'0');
        document.getElementById('dg-secs').textContent  = String(s).padStart(2,'0');
    }
    tick();
    setInterval(tick, 1000);
}

/* ── PROPERES DIADES ── */

function buildGCalUrl(item) {
    if (!item.date) return null;
    var horaRaw = item.hora ? item.hora.replace(' h', '').trim() : null;
    var start, end;
    if (horaRaw && /^\d{1,2}:\d{2}$/.test(horaRaw)) {
        var parts = horaRaw.split(':');
        var hh = String(parseInt(parts[0])).padStart(2, '0');
        var mm = String(parts[1]).padStart(2, '0');
        var d = item.date.replace(/-/g, '');
        start = d + 'T' + hh + mm + '00';
        var endH = String(parseInt(parts[0]) + 2).padStart(2, '0');
        end = d + 'T' + endH + mm + '00';
    } else {
        var next = new Date(item.date + 'T12:00:00');
        next.setDate(next.getDate() + 1);
        start = item.date.replace(/-/g, '');
        end = next.toISOString().slice(0, 10).replace(/-/g, '');
    }
    var params = new URLSearchParams({ action: 'TEMPLATE', text: item.titol, dates: start + '/' + end });
    if (item.lloc) params.set('location', item.lloc);
    var details = [];
    if (item.descripcio) details.push(item.descripcio);
    if (item.colla_amfitriona) details.push('Amfitriona: ' + item.colla_amfitriona);
    if (item.colles_convidades) details.push('Colles convidades: ' + item.colles_convidades);
    if (details.length) params.set('details', details.join('\n'));
    return 'https://calendar.google.com/calendar/render?' + params.toString();
}

async function initDiades() {
    const grid = document.getElementById('diades-grid');
    if (!grid) return;

    const data = await loadJSON('data/diades.json');
    if (!data || data.length === 0) {
        grid.innerHTML = '<p class="diades__empty">Properament us informarem de les properes diades.</p>';
        return;
    }

    grid.innerHTML = data.map(function(item) {
        var date = item.date ? new Date(item.date + 'T12:00:00') : null;
        var day   = date ? date.getDate() : '';
        var month = date ? date.toLocaleDateString('ca-ES', { month: 'long' }).toUpperCase() : '';
        var year  = date ? date.getFullYear() : '';

        return '<div class="diada-card">' +
            (date
                ? '<div class="diada-card__date-block">' +
                    '<span class="diada-card__day">' + day + '</span>' +
                    '<div class="diada-card__month-year">' +
                        '<span class="diada-card__month">' + month + '</span>' +
                        '<span class="diada-card__year">' + year + '</span>' +
                    '</div>' +
                  '</div>'
                : '') +
            '<h3 class="diada-card__title">' + escHtml(item.titol) + '</h3>' +
            '<div class="diada-card__meta">' +
                (item.lloc              ? '<p class="diada-card__meta-item"><span class="material-symbols-outlined">location_on</span>' + escHtml(item.lloc) + '</p>' : '') +
                (item.hora              ? '<p class="diada-card__meta-item"><span class="material-symbols-outlined">schedule</span>' + escHtml(item.hora) + '</p>' : '') +
                (item.colla_amfitriona  ? '<p class="diada-card__meta-item"><span class="material-symbols-outlined">home</span>Amfitriona: ' + escHtml(item.colla_amfitriona) + '</p>' : '') +
                (item.colles_convidades ? '<p class="diada-card__meta-item"><span class="material-symbols-outlined">groups</span>' + escHtml(item.colles_convidades) + '</p>' : '') +
            '</div>' +
            (item.descripcio ? '<p class="diada-card__desc">' + escHtml(item.descripcio) + '</p>' : '') +
            (buildGCalUrl(item) ? '<a href="' + buildGCalUrl(item) + '" target="_blank" rel="noopener" class="diada-card__gcal"><span class="material-symbols-outlined">calendar_add_on</span>Afegir al calendari</a>' : '') +
        '</div>';
    }).join('');
}

/* ── ABOUT ── */

async function initAbout() {
    const data = await loadJSON('data/about.json');
    if (!data) return;

    const titleEl  = document.getElementById('about-title');
    const bodyEl   = document.getElementById('about-body');
    const statsEl  = document.getElementById('about-stats');
    const valorsEl = document.getElementById('about-values');

    if (data.principal && titleEl) titleEl.textContent = data.principal.titol;
    if (data.principal && bodyEl)  bodyEl.textContent  = data.principal.text;

    if (statsEl && data.stats && data.stats.length) {
        statsEl.innerHTML = data.stats.map(function(s) {
            return '<div class="stat">' +
                '<span class="stat__number" data-target="' + s.numero + '">0</span>' +
                '<span class="stat__label">' + escHtml(s.titol) + '</span>' +
            '</div>';
        }).join('');

        const statsBlock = document.querySelector('.about__stats');
        if (statsBlock) {
            new IntersectionObserver(function(entries) {
                if (entries[0].isIntersecting) {
                    statsBlock.querySelectorAll('.stat__number').forEach(animateCounter);
                }
            }, { threshold: 0.5 }).observe(statsBlock);
        }
    }

    if (valorsEl && data.valors && data.valors.length) {
        valorsEl.innerHTML = data.valors.map(function(v) {
            return '<div class="value-card fade-in-up">' +
                '<div class="value-card__icon-wrap">' +
                    '<span class="material-symbols-outlined">' + escHtml(v.icona) + '</span>' +
                '</div>' +
                '<h3 class="value-card__title">' + escHtml(v.titol) + '</h3>' +
                '<p class="value-card__text">' + escHtml(v.text) + '</p>' +
            '</div>';
        }).join('');

        valorsEl.querySelectorAll('.value-card').forEach(function(el) {
            fadeObs.observe(el);
        });
    }
}

/* ── INIT ── */
initDiadaGran();
initDiades();
initAbout();
initWidget();
initNewsSlider();
initGallerySlider();
