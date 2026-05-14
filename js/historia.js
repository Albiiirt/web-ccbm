/* ── TIMELINE HISTÒRIA ── */

function initHistoria() {
    const container = document.getElementById('historia-graph');
    if (!container) return;

    fetch(`data/historia.json?v=${Date.now()}`)
        .then(r => r.json())
        .then(raw => {
            const cutoff = new Date('2016-01-01');
            const data = raw
                .map(d => ({ ...d, date: new Date(d.data) }))
                .filter(d => !isNaN(d.date) && d.date >= cutoff)
                .sort((a, b) => a.date - b.date);
            if (data.length) renderTimeline(container, data);
        })
        .catch(() => {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--md-on-surface-variant)">No hi ha dades disponibles.</p>';
        });
}

function renderTimeline(container, data) {
    const H        = 440;
    const MX       = 48;
    const MY       = 60;
    const PILL_H   = 28;
    const PILL_PX  = 12;
    const ARM_BASE = 64;
    const ARM_STEP = 40;
    const FONT_SZ  = 11;
    const MAX_CH   = 22;
    const GAP      = 8;

    function trunc(s) { return s.length > MAX_CH ? s.slice(0, MAX_CH - 1) + '…' : s; }
    function estW(s)  { return Math.ceil(trunc(s).length * FONT_SZ * 0.57) + PILL_PX * 2; }

    let W      = container.clientWidth || 800;
    let innerW = W - MX * 2;
    const innerH = H - MY * 2;
    const axisY  = innerH / 2;

    const [t0, t1] = d3.extent(data, d => d.date);
    const span = (t1 - t0) || 86400000 * 365;
    const pad  = span * 0.15;

    let x0 = d3.scaleTime()
        .domain([new Date(t0 - pad), new Date(t1 + pad)])
        .range([0, innerW]);

    const svg = d3.select(container).append('svg')
        .attr('width', '100%')
        .attr('height', H)
        .style('cursor', 'grab')
        .style('touch-action', 'none')
        .style('user-select', 'none');

    const defs = svg.append('defs');

    /* Clip only horizontally; let SVG boundary handle top/bottom */
    const clipRect = defs.append('clipPath').attr('id', 'tl-clip')
        .append('rect')
        .attr('x', 0).attr('y', -1000)
        .attr('width', innerW).attr('height', 2000);

    const root = svg.append('g').attr('transform', `translate(${MX},${MY})`);
    const area = root.append('g').attr('clip-path', 'url(#tl-clip)');

    area.append('line').attr('class', 'tl-axis-line')
        .attr('y1', axisY).attr('y2', axisY)
        .attr('x1', -innerW * 20).attr('x2', innerW * 20);

    const ticksG  = area.append('g');
    const eventsG = area.append('g');

    /* ── Detail card ── */
    const card      = document.getElementById('tl-card');
    const cardClose = document.getElementById('tl-card-close');
    const cardTipus = document.getElementById('tl-card-tipus');
    const cardTitol = document.getElementById('tl-card-titol');
    const cardData  = document.getElementById('tl-card-data');
    const cardDesc  = document.getElementById('tl-card-desc');
    const fmt = new Intl.DateTimeFormat('ca', { year: 'numeric', month: 'long', day: 'numeric' });

    if (cardClose) cardClose.addEventListener('click', () => { card.hidden = true; });

    function showCard(d) {
        cardTipus.textContent = d.tipus || 'Event';
        cardTipus.className   = `tl-card__badge tl-card__badge--${(d.tipus || 'altre').toLowerCase().replace(/\s+/g, '-')}`;
        cardTitol.textContent = d.titol;
        cardData.textContent  = fmt.format(d.date);
        cardDesc.textContent  = d.descripcio || '';
        card.hidden = false;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ── Greedy lane assignment: avoids pill overlap ── */
    function assignLanes(xScale) {
        const laneR = { above: [], below: [] };
        data.forEach((d, i) => {
            const px   = xScale(d.date);
            const hw   = estW(d.titol) / 2;
            const side = i % 2 === 0 ? 'above' : 'below';
            let lane   = 0;
            while (laneR[side][lane] !== undefined && laneR[side][lane] > px - hw - GAP) lane++;
            laneR[side][lane] = px + hw;
            d._lane = lane;
            d._up   = side === 'above';
        });
    }

    /* ── Main draw (called on init + every zoom/pan) ── */
    function draw(xScale) {
        /* Year/month ticks */
        const pxPerYear = Math.abs(xScale(new Date('2001-01-01')) - xScale(new Date('2000-01-01')));
        const step = pxPerYear > 150 ? d3.timeMonth.every(3)
                   : pxPerYear > 80  ? d3.timeYear.every(1)
                   : pxPerYear > 40  ? d3.timeYear.every(2)
                   : d3.timeYear.every(5);

        const tick = ticksG.selectAll('.tl-tick').data(xScale.ticks(step), d => d.valueOf());
        const tEnter = tick.enter().append('g').attr('class', 'tl-tick');
        tEnter.append('line').attr('y1', axisY - 6).attr('y2', axisY + 6);
        tEnter.append('text').attr('text-anchor', 'middle').attr('y', axisY + 20);
        ticksG.selectAll('.tl-tick')
            .attr('transform', d => `translate(${xScale(d)},0)`)
            .select('text').text(d => pxPerYear > 80
                ? d.getFullYear()
                : d.toLocaleDateString('ca', { month: 'short', year: '2-digit' }));
        tick.exit().remove();

        /* Assign lanes before positioning */
        assignLanes(xScale);

        /* Enter new event groups */
        const ev = eventsG.selectAll('.tl-event').data(data, d => d.id);
        const eEnter = ev.enter().append('g').attr('class', 'tl-event');

        eEnter.append('line').attr('class', 'tl-connector');
        eEnter.append('circle').attr('class', 'tl-dot').attr('cy', axisY);

        /* Pill: rect + text, created once with fixed dimensions */
        const pillG = eEnter.append('g').attr('class', 'tl-pill');
        pillG.append('rect')
            .attr('rx', PILL_H / 2)
            .attr('ry', PILL_H / 2)
            .attr('height', PILL_H)
            .each(function(d) { d3.select(this).attr('width', estW(d.titol)); });
        pillG.append('text')
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'middle')
            .attr('y', PILL_H / 2)
            .each(function(d) {
                d3.select(this).attr('x', estW(d.titol) / 2).text(trunc(d.titol));
            });

        eEnter
            .on('click',      (_, d) => showCard(d))
            .on('mouseenter', function() { d3.select(this).select('.tl-dot').attr('r', 9); })
            .on('mouseleave', function() { d3.select(this).select('.tl-dot').attr('r', 6); });

        /* Update all event positions */
        eventsG.selectAll('.tl-event')
            .attr('transform', d => `translate(${xScale(d.date)},0)`)
            .each(function(d) {
                const armLen  = ARM_BASE + d._lane * ARM_STEP;
                /* tipY = the pill edge closest to the axis */
                const tipY    = d._up ? axisY - armLen : axisY + armLen;
                const pillW   = estW(d.titol);
                /* pillTop: translate y so the pill sits against tipY */
                const pillTop = d._up ? tipY - PILL_H : tipY;

                d3.select(this).select('.tl-connector')
                    .attr('x1', 0).attr('x2', 0)
                    .attr('y1', d._up ? axisY - 9 : axisY + 9)
                    .attr('y2', tipY);

                d3.select(this).select('.tl-dot').attr('r', 6);

                d3.select(this).select('.tl-pill')
                    .attr('transform', `translate(${-pillW / 2},${pillTop})`);
            });

        ev.exit().remove();
    }

    draw(x0);

    /* ── Zoom / pan ── */
    const zoom = d3.zoom()
        .scaleExtent([0.3, 40])
        .on('start', () => svg.style('cursor', 'grabbing'))
        .on('end',   () => svg.style('cursor', 'grab'))
        .on('zoom',  e  => draw(e.transform.rescaleX(x0)));

    svg.call(zoom);

    /* ── Responsive resize ── */
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
