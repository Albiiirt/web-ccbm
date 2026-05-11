/* ── SLIDER FACTORY ── */
export function createSlider({ sliderId, prevId, nextId, cardWidth = 340 }) {
    const slider = document.getElementById(sliderId);
    if (!slider) return { setReady: () => {} };

    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    let position = 0;
    let maxPosition = 0;
    let isDragging = false;
    let startX = 0;
    let startScroll = 0;

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
        const visibleW = slider.parentElement.clientWidth;
        maxPosition = Math.max(0, slider.scrollWidth - visibleW);
        updateButtons();
    }

    if (next) next.addEventListener('click', () => slideTo(position + cardWidth + 16));
    if (prev) prev.addEventListener('click', () => slideTo(position - cardWidth - 16));

    const viewport = slider.parentElement;

    viewport.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.pageX;
        startScroll = position;
        viewport.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        slideTo(startScroll + (startX - e.pageX));
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        viewport.style.cursor = 'grab';
    });
    viewport.addEventListener('touchstart', e => {
        startX = e.touches[0].pageX;
        startScroll = position;
    }, { passive: true });
    viewport.addEventListener('touchmove', e => {
        slideTo(startScroll + (startX - e.touches[0].pageX));
    }, { passive: true });

    window.addEventListener('resize', recalc);

    return { setReady() { recalc(); } };
}

/* ── LIGHTBOX ── */
export function initLightbox(images) {
    const lightbox = document.getElementById('lightbox');
    const img      = document.getElementById('lightbox-img');
    const caption  = document.getElementById('lightbox-caption');
    const closeBtn = document.getElementById('lightbox-close');
    const backdrop = document.getElementById('lightbox-backdrop');
    const prevBtn  = document.getElementById('lightbox-prev');
    const nextBtn  = document.getElementById('lightbox-next');
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
        if (e.key === 'Escape')     hide();
        if (e.key === 'ArrowLeft')  show(current - 1);
        if (e.key === 'ArrowRight') show(current + 1);
    });

    return { show };
}
