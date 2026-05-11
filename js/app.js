import { initNewsSlider, initGallerySlider } from './notion-render.js';

/* ── TOP BAR SCROLL ── */
const topBar = document.getElementById('top-bar');
const onScroll = () => topBar.classList.toggle('scrolled', window.scrollY > 60);
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
mobileDrawer.querySelectorAll('.mobile-drawer__link').forEach(l => l.addEventListener('click', closeDrawer));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ── ACTIVE NAV LINK ON SCROLL ── */
const sections = document.querySelectorAll('main [id]');
const navLinks = document.querySelectorAll('.nav-link');
new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`));
        }
    });
}, { threshold: 0.4 }).observe.bind(null);

const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`));
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
fadeEls.forEach(el => { el.classList.add('fade-in-up'); fadeObserver.observe(el); });

/* ── STAT COUNTER ANIMATION ── */
function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const start = performance.now();
    const tick = (now) => {
        const eased = 1 - Math.pow(1 - Math.min((now - start) / 1400, 1), 3);
        el.textContent = Math.round(eased * target);
        if (eased < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
const statsBlock = document.querySelector('.about__stats');
if (statsBlock) {
    new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
            statsBlock.querySelectorAll('.stat__number').forEach(animateCounter);
        }
    }, { threshold: 0.5 }).observe(statsBlock);
}

/* ── SELECT FLOATING LABEL FIX ── */
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
            const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
            if (res.ok) { form.reset(); showFeedback('success', '✓ Missatge enviat! Et respondrem aviat.'); }
            else showFeedback('error', 'Hi ha hagut un error. Torna-ho a intentar.');
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

/* ── INIT ── */
initNewsSlider();
initGallerySlider();
