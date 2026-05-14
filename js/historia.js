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
    const H          = 460;
    const MX         = 48;
    const MY         = 65;
    const PILL_H     = 28;
    const PILL_H_SP  = 34;   /* anniversary pill is taller */
    const PILL_PX    = 14;
    const ARM_BASE   = 68;
    const ARM_STEP   = 42;
    const FONT_SZ    = 11;
    const GAP        = 10;

    /* Color tokens */
    const C_PRIMARY   = '#01758C';
    const C_CONTAINER = '#CCE9EF';
    const C_ANNIV     = '#B45309';   /* amber-700 */
    const C_ANNIV_BG  = '#FEF9C3';   /* yellow-100 */
    const C_TEXT      = '#1A1A1A';
    const C_TEXT_MUT  = '#4A5C60';

    function isSpecial(d) {
        return d.tipus === 'Aniversari' || d.titol.toLowerCase().includes('aniversari');
    }

    /* No truncation: display full title (star prefix for special events) */
    function pillLabel(d) { return isSpecial(d) ? '★  ' + d.titol : d.titol; }
    function pillH(d)     { return isSpecial(d) ? PILL_H_SP : PILL_H; }
    function estW(d)      { return Math.ceil(pillLabel(d).length * FONT_SZ * 0.60) + PILL_PX * 2; }
    function dotR(d)      { return isSpecial(d) ? 8 : 6; }

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

    /* Clip only horizontally; SVG boundary handles top/bottom */
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

    /* ── Greedy lane assignment ── */
    function assignLanes(xScale) {
        const laneR = { above: [], below: [] };
        data.forEach((d, i) => {
            const px   = xScale(d.date);
            const hw   = estW(d) / 2;
            const side = i % 2 === 0 ? 'above' : 'below';
            let lane   = 0;
            while (laneR[side][lane] !== undefined && laneR[side][lane] > px - hw - GAP) lane++;
            laneR[side][lane] = px + hw;
            d._lane = lane;
            d._up   = side === 'above';
        });
    }

    /* ── Main draw ── */
    function draw(xScale) {
        /* Ticks: months or years depending on zoom */
        const pxPerYear = Math.abs(xScale(new Date('2001-01-01')) - xScale(new Date('2000-01-01')));
        const showMonths = pxPerYear > 60;
        const step = pxPerYear > 300 ? d3.timeMonth.every(1)
                   : pxPerYear > 150 ? d3.timeMonth.every(2)
                   : pxPerYear > 60  ? d3.timeMonth.every(3)
                   : pxPerYear > 30  ? d3.timeYear.every(1)
                   : d3.timeYear.every(2);

        const tickArr = xScale.ticks(step);
        const tickMap  = new Map(tickArr.map((d, i) => [d.valueOf(), i]));

        const tick = ticksG.selectAll('.tl-tick').data(tickArr, d => d.valueOf());
        const tEnter = tick.enter().append('g').attr('class', 'tl-tick');
        tEnter.append('line');
        tEnter.append('text').attr('class', 'tl-month').attr('text-anchor', 'middle').attr('y', axisY + 20);
        tEnter.append('text').attr('class', 'tl-year').attr('text-anchor', 'middle').attr('y', axisY + 33);

        const allTicks = tEnter.merge(tick);
        allTicks.attr('transform', d => `translate(${xScale(d)},0)`);

        allTicks.select('line')
            .attr('y1', d => showMonths && d.getMonth() === 0 ? axisY - 9 : axisY - 6)
            .attr('y2', axisY + 6)
            .attr('stroke-width', d => showMonths && d.getMonth() === 0 ? 2 : 1.5);

        /* Month label: abbreviated month or year when zoomed out */
        allTicks.select('.tl-month')
            .attr('font-weight', d => showMonths && d.getMonth() === 0 ? '700' : '400')
            .text(d => showMonths
                ? d.toLocaleDateString('ca', { month: 'short' })
                : d.getFullYear().toString());

        /* Year label: shown below only when the year changes */
        allTicks.select('.tl-year')
            .text(d => {
                if (!showMonths) return '';
                const idx  = tickMap.get(d.valueOf());
                const prev = idx > 0 ? tickArr[idx - 1] : null;
                return (!prev || prev.getFullYear() !== d.getFullYear())
                    ? d.getFullYear().toString() : '';
            });

        tick.exit().remove();

        assignLanes(xScale);

        /* Enter new event groups */
        const ev = eventsG.selectAll('.tl-event').data(data, d => d.id);
        const eEnter = ev.enter().append('g').attr('class', 'tl-event');

        /* Optional ring for special events (behind the dot) */
        eEnter.append('circle').attr('class', 'tl-dot-ring').attr('cy', axisY)
            .attr('fill', 'none')
            .attr('stroke-width', 2);

        eEnter.append('line').attr('class', 'tl-connector');
        eEnter.append('circle').attr('class', 'tl-dot').attr('cy', axisY);

        /* Pill: created once */
        const pillG = eEnter.append('g').attr('class', 'tl-pill');
        pillG.append('rect').each(function(d) {
            d3.select(this)
                .attr('rx', pillH(d) / 2)
                .attr('ry', pillH(d) / 2)
                .attr('height', pillH(d))
                .attr('width', estW(d))
                .attr('fill',   isSpecial(d) ? C_ANNIV_BG : C_CONTAINER)
                .attr('stroke', isSpecial(d) ? C_ANNIV : C_PRIMARY)
                .attr('stroke-width', isSpecial(d) ? 2 : 1.5);
        });
        pillG.append('text')
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'middle')
            .attr('font-size', FONT_SZ + 'px')
            .attr('font-family', "'Poppins', sans-serif")
            .attr('font-weight', '600')
            .attr('pointer-events', 'none')
            .each(function(d) {
                d3.select(this)
                    .attr('x', estW(d) / 2)
                    .attr('y', pillH(d) / 2)
                    .attr('fill', isSpecial(d) ? C_ANNIV : C_TEXT_MUT)
                    .text(pillLabel(d));
            });

        eEnter
            .on('click', (_, d) => showCard(d))
            .on('mouseenter', function(_, d) {
                const sp = isSpecial(d);
                d3.select(this).select('.tl-dot').attr('r', dotR(d) + 3);
                d3.select(this).select('.tl-pill rect').attr('fill', sp ? C_ANNIV : C_PRIMARY);
                d3.select(this).select('.tl-pill text').attr('fill', '#fff');
                d3.select(this).select('.tl-connector').attr('opacity', .7);
            })
            .on('mouseleave', function(_, d) {
                const sp = isSpecial(d);
                d3.select(this).select('.tl-dot').attr('r', dotR(d));
                d3.select(this).select('.tl-pill rect').attr('fill', sp ? C_ANNIV_BG : C_CONTAINER);
                d3.select(this).select('.tl-pill text').attr('fill', sp ? C_ANNIV : C_TEXT_MUT);
                d3.select(this).select('.tl-connector').attr('opacity', .35);
            });

        /* Update all event positions */
        eventsG.selectAll('.tl-event')
            .attr('transform', d => `translate(${xScale(d.date)},0)`)
            .each(function(d) {
                const armLen  = ARM_BASE + d._lane * ARM_STEP;
                const tipY    = d._up ? axisY - armLen : axisY + armLen;
                const pH      = pillH(d);
                const pW      = estW(d);
                const pillTop = d._up ? tipY - pH : tipY;
                const sp      = isSpecial(d);

                d3.select(this).select('.tl-dot-ring')
                    .attr('r',      sp ? dotR(d) + 5 : 0)
                    .attr('stroke', sp ? C_ANNIV : 'none');

                d3.select(this).select('.tl-connector')
                    .attr('x1', 0).attr('x2', 0)
                    .attr('y1', d._up ? axisY - dotR(d) - 2 : axisY + dotR(d) + 2)
                    .attr('y2', tipY)
                    .attr('stroke', sp ? C_ANNIV : C_PRIMARY)
                    .attr('opacity', .35);

                d3.select(this).select('.tl-dot')
                    .attr('r',    dotR(d))
                    .attr('fill', sp ? C_ANNIV : C_PRIMARY);

                d3.select(this).select('.tl-pill')
                    .attr('transform', `translate(${-pW / 2},${pillTop})`);
            });

        ev.exit().remove();
    }

    draw(x0);

    const zoom = d3.zoom()
        .scaleExtent([0.3, 40])
        .on('start', () => svg.style('cursor', 'grabbing'))
        .on('end',   () => svg.style('cursor', 'grab'))
        .on('zoom',  e  => draw(e.transform.rescaleX(x0)));

    svg.call(zoom);

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
