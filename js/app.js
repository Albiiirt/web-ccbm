import { initNewsSlider } from './notion-render.js';
import { initGallerySlider } from './notion-render.js';

/* ── TOP BAR SCROLL ── */
const topBar = document.getElementById('top-bar');
const onScroll = () => {
    topBar.classList.toggle('scrolled', window.scrollY > 60);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

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
mobileDrawer.querySelectorAll('.mobile-drawer__link').forEach(l => {
    l.addEventListener('click', closeDrawer);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
});

/* ── ACTIVE NAV LINK ON SCROLL ── */
const sections = document.querySelectorAll('main [id]');
const navLinks = document.querySelectorAll('.nav-link');

const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
            });
        }
    });
}, { threshold: 0.4 });

sections.forEach(s => sectionObserver.observe(s));

/* ── FADE IN ON SCROLL ── */
const fadeEls = document.querySelectorAll(
    '.value-card, .stat, .about__text, .about__visual, .contact__info, .contact__form'
);
const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 80);
            fadeObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

fadeEls.forEach(el => {
    el.classList.add('fade-in-up');
    fadeObserver.observe(el);
});

/* ── STAT COUNTER ANIMATION ── */
function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1400;
    const start = performance.now();

    const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.querySelectorAll('.stat__number').forEach(animateCounter);
            statObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

const statsBlock = document.querySelector('.about__stats');
if (statsBlock) statObserver.observe(statsBlock);

/* ── GENERIC SLIDER FACTORY ── */
export function createSlider({ sliderId, prevId, nextId, cardWidth = 340 }) {
    const slider = document.getElementById(sliderId);
    if (!slider) return { setReady: () => {} };

    let isDragging = false;
    let startX = 0;
    let startScroll = 0;
    let position = 0;
    let maxPosition = 0;

    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);

    function updateButtons() {
        if (prev) prev.disabled = position <= 0;
        if (next) next.disabled = position >= maxPosition;
    }

    function slideTo(pos) {
        position = Math.max(0, Math.min(pos, maxPosition));
        slider.style.transform = `translateX(-${position}px)`;
        updateButtons();
    }

    function recalc() {
        const gap = 16;
        const visibleW = slider.parentElement.clientWidth;
        const totalW = slider.scrollWidth;
        maxPosition = Math.max(0, totalW - visibleW);
        updateButtons();
    }

    function slideNext() { slideTo(position + cardWidth + 16); }
    function slidePrev() { slideTo(position - cardWidth - 16); }

    if (next) next.addEventListener('click', slideNext);
    if (prev) prev.addEventListener('click', slidePrev);

    /* drag support */
    const viewport = slider.parentElement;
    viewport.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.pageX;
        startScroll = position;
        viewport.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const delta = startX - e.pageX;
        slideTo(startScroll + delta);
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (viewport) viewport.style.cursor = 'grab';
    });

    /* touch support */
    viewport.addEventListener('touchstart', e => {
        startX = e.touches[0].pageX;
        startScroll = position;
    }, { passive: true });
    viewport.addEventListener('touchmove', e => {
        const delta = startX - e.touches[0].pageX;
        slideTo(startScroll + delta);
    }, { passive: true });

    window.addEventListener('resize', recalc);

    return {
        setReady() { recalc(); updateButtons(); }
    };
}

/* ── CONTACT FORM ── */
const form     = document.getElementById('contact-form');
const feedback = document.getElementById('form-feedback');
const submitBtn = document.getElementById('form-submit');

if (form) {
    form.addEventListener('submit', async (e) => {
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
            showFeedback('error', 'Sense connexió. Comprova internet i torna-ho a intentar.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined">send</span> Enviar missatge';
        }
    });
}

function showFeedback(type, msg) {
    feedback.className = `form-feedback ${type}`;
    feedback.textContent = msg;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { feedback.className = 'form-feedback'; }, 6000);
}

/* ── SELECT FLOATING LABEL FIX ── */
document.querySelectorAll('select.field__input').forEach(sel => {
    const updateLabel = () => {
        const label = sel.nextElementSibling;
        if (!label) return;
        if (sel.value) {
            label.style.top = '0';
            label.style.transform = 'translateY(-50%)';
            label.style.fontSize = '.75rem';
            label.style.color = 'var(--md-primary)';
        }
    };
    sel.addEventListener('change', updateLabel);
});

/* ── LIGHTBOX ── */
export function initLightbox(images) {
    const lightbox  = document.getElementById('lightbox');
    const img       = document.getElementById('lightbox-img');
    const caption   = document.getElementById('lightbox-caption');
    const closeBtn  = document.getElementById('lightbox-close');
    const backdrop  = document.getElementById('lightbox-backdrop');
    const prevBtn   = document.getElementById('lightbox-prev');
    const nextBtn   = document.getElementById('lightbox-next');
    let current = 0;

    function show(index) {
        current = (index + images.length) % images.length;
        img.src = images[current].src;
        img.alt = images[current].caption;
        caption.textContent = images[current].caption;
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
    }
    function hide() {
        lightbox.hidden = true;
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', hide);
    backdrop.addEventListener('click', hide);
    prevBtn.addEventListener('click', () => show(current - 1));
    nextBtn.addEventListener('click', () => show(current + 1));
    document.addEventListener('keydown', e => {
        if (lightbox.hidden) return;
        if (e.key === 'Escape')      hide();
        if (e.key === 'ArrowLeft')   show(current - 1);
        if (e.key === 'ArrowRight')  show(current + 1);
    });

    return { show };
}

/* ── INIT ── */
initNewsSlider();
initGallerySlider();
