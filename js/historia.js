/* ── TIMELINE HISTÒRIA ── */

function initHistoria() {
    const container = document.getElementById('historia-graph');
    if (!container) return;

    fetch(`data/historia.json?v=${Date.now()}`)
        .then(r => r.json())
        .then(raw => {
            const data = raw
                .map(d => ({ ...d, date: new Date(d.data) }))
                .filter(d => !isNaN(d.date))
                .sort((a, b) => a.date - b.date);
            if (data.length) renderTimeline(container, data);
        })
        .catch(() => {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--md-on-surface-variant)">No hi ha dades disponibles.</p>';
        });
}

function renderTimeline(container, data) {
    const H    = 320;
    const MX   = 48;
    const MY   = 20;
    const ARM  = 90;
    const MAX_LABEL = 22;

    function trunc(s) { return s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + '…' : s; }

    let W      = container.clientWidth || 800;
    let innerW = W - MX * 2;
    const innerH = H - MY * 2;
    const axisY  = innerH / 2;

    const [t0, t1] = d3.extent(data, d => d.date);
    const span = (t1 - t0) || 86400000 * 365;
    const pad  = span * 0.1;

    let x0 = d3.scaleTime()
        .domain([new Date(t0 - pad), new Date(t1 + pad)])
        .range([0, innerW]);

    // SVG
    const svg = d3.select(container).append('svg')
        .attr('width', '100%')
        .attr('height', H)
        .style('cursor', 'grab')
        .style('touch-action', 'none')
        .style('user-select', 'none');

    const defs = svg.append('defs');
    const clipRect = defs.append('clipPath').attr('id', 'tl-clip')
        .append('rect')
        .attr('x', 0).attr('y', 0)
        .attr('width', innerW).attr('height', innerH);

    const root = svg.append('g').attr('transform', `translate(${MX},${MY})`);
    const area = root.append('g').attr('clip-path', 'url(#tl-clip)');

    // Axis (extends wide for panning)
    area.append('line').attr('class', 'tl-axis-line')
        .attr('y1', axisY).attr('y2', axisY)
        .attr('x1', -innerW * 20).attr('x2', innerW * 20);

    const ticksG  = area.append('g');
    const eventsG = area.append('g');

    // Card
    const card       = document.getElementById('tl-card');
    const cardClose  = document.getElementById('tl-card-close');
    const cardTipus  = document.getElementById('tl-card-tipus');
    const cardTitol  = document.getElementById('tl-card-titol');
    const cardData   = document.getElementById('tl-card-data');
    const cardDesc   = document.getElementById('tl-card-desc');
    const fmt = new Intl.DateTimeFormat('ca', { year: 'numeric', month: 'long', day: 'numeric' });

    if (cardClose) {
        cardClose.addEventListener('click', () => { card.hidden = true; });
    }

    function showCard(d) {
        cardTipus.textContent = d.tipus || 'Event';
        cardTipus.className = `tl-card__badge tl-card__badge--${(d.tipus || 'altre').toLowerCase().replace(/\s+/g, '-')}`;
        cardTitol.textContent = d.titol;
        cardData.textContent  = fmt.format(d.date);
        cardDesc.textContent  = d.descripcio || '';
        card.hidden = false;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function draw(xScale) {
        // Ticks: densitat adaptativa
        const pxPerYear = Math.abs(xScale(new Date('2001-01-01')) - xScale(new Date('2000-01-01')));
        const step = pxPerYear > 60 ? d3.timeYear.every(1)
                   : pxPerYear > 30 ? d3.timeYear.every(2)
                   : pxPerYear > 15 ? d3.timeYear.every(5)
                   : d3.timeYear.every(10);
        const ticks = xScale.ticks(step);

        const tick = ticksG.selectAll('.tl-tick').data(ticks, d => d.getFullYear());
        tick.enter().append('g').attr('class', 'tl-tick')
            .call(enter => {
                enter.append('line').attr('y1', axisY - 7).attr('y2', axisY + 7);
                enter.append('text').attr('text-anchor', 'middle').attr('y', axisY + 22);
            });
        ticksG.selectAll('.tl-tick')
            .attr('transform', d => `translate(${xScale(d)},0)`)
            .select('text').text(d => d.getFullYear());
        tick.exit().remove();

        // Events
        const ev = eventsG.selectAll('.tl-event').data(data, d => d.id);
        ev.enter().append('g').attr('class', 'tl-event').style('cursor', 'pointer')
            .call(enter => {
                enter.append('line').attr('class', 'tl-connector');
                enter.append('circle').attr('class', 'tl-dot').attr('cy', axisY);
                enter.append('text').attr('class', 'tl-label');
                enter.on('click', (_, d) => showCard(d));
                enter.on('mouseenter', function() {
                    d3.select(this).select('.tl-dot').attr('r', 10);
                });
                enter.on('mouseleave', function() {
                    d3.select(this).select('.tl-dot').attr('r', 7);
                });
            });

        eventsG.selectAll('.tl-event')
            .attr('transform', d => `translate(${xScale(d.date)},0)`)
            .each(function(d, i) {
                const up   = i % 2 === 0;
                const tipY = axisY + (up ? -ARM : ARM);
                const txtY = up ? tipY - 12 : tipY + 18;
                d3.select(this).select('.tl-connector')
                    .attr('x1', 0).attr('x2', 0)
                    .attr('y1', axisY).attr('y2', tipY);
                d3.select(this).select('.tl-dot').attr('r', 7);
                d3.select(this).select('.tl-label')
                    .attr('y', txtY)
                    .attr('text-anchor', 'middle')
                    .text(trunc(d.titol));
            });

        ev.exit().remove();
    }

    draw(x0);

    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([0.4, 40])
        .on('start', () => svg.style('cursor', 'grabbing'))
        .on('end',   () => svg.style('cursor', 'grab'))
        .on('zoom',  e  => draw(e.transform.rescaleX(x0)));

    svg.call(zoom);

    // Resize
    new ResizeObserver(entries => {
        const nW = entries[0].contentRect.width;
        if (!nW || Math.abs(nW - W) < 4) return;
        W      = nW;
        innerW = W - MX * 2;
        x0     = x0.copy().range([0, innerW]);
        clipRect.attr('width', innerW);
        area.select('.tl-axis-line').attr('x1', -innerW * 20).attr('x2', innerW * 20);
        svg.call(zoom.transform, d3.zoomIdentity);
        draw(x0);
    }).observe(container);
}
