// 24/7 UK Mortgage Calculator — shared UI helpers for the calculator library
//
// Formatting, input reading/validation and a small accessible SVG line
// chart (same look and hover/keyboard behaviour as the repayment schedule
// chart). Presentation only — all financial maths lives in the calc-*.js
// modules. Exposed as window.CalcUI.
(function () {
  'use strict';

  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gbpCompact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 });

  function pct(n, dp = 1) {
    return `${(n * 100).toFixed(dp)}%`;
  }

  // Unlike the mortgage pages' parser, blank or junk input becomes NaN
  // (not 0) so it can be reported instead of silently calculated with.
  function parseNumber(str) {
    const cleaned = String(str == null ? '' : str).replace(/[£,\s%]/g, '');
    if (cleaned === '') return NaN;
    if (!/^-?\d*\.?\d+$/.test(cleaned) && !/^-?\d+\.$/.test(cleaned)) return NaN;
    return parseFloat(cleaned);
  }

  function formatWithCommas(n, dp = 0) {
    return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function yearsMonths(totalMonths) {
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
    if (m === 0) return `${y} year${y === 1 ? '' : 's'}`;
    return `${y} year${y === 1 ? '' : 's'} ${m} month${m === 1 ? '' : 's'}`;
  }

  // Month `n` after the current month (n = 1 is next month), 1st of month,
  // so adding months never skips a short month.
  function monthFromNow(n) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }

  function formatMonthYear(date) {
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  function formatShortMonthYear(date) {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  // ---- inputs ----

  function errorElFor(input) {
    let el = document.getElementById(`${input.id}-error`);
    if (!el) {
      el = document.createElement('p');
      el.className = 'field__error';
      el.id = `${input.id}-error`;
      const control = input.closest('.field__control') || input;
      control.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function setFieldError(input, message) {
    const el = errorElFor(input);
    const describedBy = (input.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== el.id);
    if (message) {
      el.textContent = message;
      el.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      describedBy.push(el.id);
    } else {
      el.textContent = '';
      el.hidden = true;
      input.removeAttribute('aria-invalid');
    }
    if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  // Reads and validates a numeric input. Returns the number, or NaN after
  // showing an inline error. opts: { label, min, max, integer, allowBlank,
  // blankValue }
  function readNumber(input, opts = {}) {
    const label = opts.label || 'This field';
    const raw = input.value;
    let n = parseNumber(raw);
    if (Number.isNaN(n)) {
      if (String(raw).trim() === '' && opts.allowBlank) {
        setFieldError(input, '');
        return opts.blankValue != null ? opts.blankValue : 0;
      }
      setFieldError(input, String(raw).trim() === '' ? `${label} is required.` : `${label} must be a number.`);
      return NaN;
    }
    if (opts.integer && !Number.isInteger(n)) {
      setFieldError(input, `${label} must be a whole number.`);
      return NaN;
    }
    if (opts.min != null && n < opts.min) {
      setFieldError(input, `${label} must be at least ${opts.minLabel || opts.min}.`);
      return NaN;
    }
    if (opts.max != null && n > opts.max) {
      setFieldError(input, `${label} must be no more than ${opts.maxLabel || opts.max}.`);
      return NaN;
    }
    setFieldError(input, '');
    return n;
  }

  // Tidies a currency field on blur (adds thousands separators) without
  // changing its value.
  function formatOnBlur(input, dp = 0) {
    input.addEventListener('blur', () => {
      const n = parseNumber(input.value);
      if (!Number.isNaN(n)) input.value = formatWithCommas(n, dp);
    });
  }

  function radioValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  }

  function errorBlock(errors) {
    return `<div class="validation-message" role="alert"><p>${errors.length > 1 ? 'Please check the following:' : ''}</p>${errors.length > 1 ? `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : `<p>${escapeHtml(errors[0])}</p>`}</div>`;
  }

  // Shows either the results or an error summary — never both, so invalid
  // inputs can't leave stale figures on screen. Expects #results-error and
  // #results-body; any section marked [data-results] is hidden with the
  // results. Returns true when results should be rendered. `customHtml`
  // replaces the default error list when a richer explanation helps.
  function setResultsState(errors, customHtml) {
    const errorEl = document.getElementById('results-error');
    const bodyEl = document.getElementById('results-body');
    const failed = errors && errors.length > 0;
    errorEl.innerHTML = failed ? (customHtml || errorBlock(errors)) : '';
    errorEl.hidden = !failed;
    bodyEl.hidden = failed;
    document.querySelectorAll('[data-results]').forEach((s) => { s.hidden = failed; });
    return !failed;
  }

  // Key-figure tile, reusing the milestone card styling. Arguments are
  // trusted, already-formatted strings (never raw user text).
  function tile(label, value, sub, highlight) {
    return `<div class="milestone-card result-tile${highlight ? ' result-tile--highlight' : ''}">
      <span class="milestone-card__year">${label}</span>
      <span class="milestone-card__balance-group"><span class="milestone-card__balance">${value}</span>
      <span class="milestone-card__balance-label">${sub}</span></span></div>`;
  }

  const FIELD_ERRORS ='Some of the details above need checking — see the message under each highlighted field.';

  // Disclosure button that shows/hides a long table.
  function bindDisclosure(button, target, labels) {
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      target.hidden = open;
      button.textContent = open ? labels.closed : labels.open;
    });
  }

  function resetDisclosure(button, target, labels) {
    button.setAttribute('aria-expanded', 'false');
    target.hidden = true;
    button.textContent = labels.closed;
  }

  // ---- line chart ----
  //
  // config: {
  //   labels: [x-axis label for each point],
  //   tickLabels: optional [short label for each point],
  //   series: [{ name, values, color, area?: bool, dash?: bool }],
  //   yFormat: fn, tooltipTitle: fn(index) -> string
  // }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const charts = new Set();

  function lineChart(svg, tooltip, config) {
    const state = { svg, tooltip, config, focused: 0, geom: null };
    svg._chartState = state;
    charts.add(state);
    if (!svg._chartBound) bindChart(svg);
    drawChart(state);
  }

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function drawChart(state) {
    const { svg, config } = state;
    svg.innerHTML = '';
    hideTooltip(state);
    const count = config.labels.length;
    if (count < 2) { state.geom = null; return; }

    const width = Math.max(svg.parentElement.clientWidth || 720, 260);
    const narrow = width < 420;
    const height = narrow ? 240 : 300;
    const pad = { top: 16, right: narrow ? 10 : 18, bottom: 32, left: narrow ? 50 : 64 };
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxVal = niceMax(Math.max(...config.series.flatMap((s) => s.values)) * 1.02);
    const x = (i) => pad.left + (i / (count - 1)) * plotW;
    const y = (v) => pad.top + plotH - (v / maxVal) * plotH;
    state.geom = { x, y, width, height, pad, count };

    for (let t = 0; t <= 4; t++) {
      const v = maxVal * (t / 4);
      svg.appendChild(el('line', { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), stroke: '#232429', 'stroke-width': 1 }));
      const label = el('text', { x: pad.left - 10, y: y(v) + 3, 'text-anchor': 'end', class: 'chart-axis-label' });
      label.textContent = (config.yAxisFormat || ((n) => gbpCompact.format(n)))(v);
      svg.appendChild(label);
    }

    const ticks = config.tickLabels || config.labels;
    const maxTicks = narrow ? 4 : 8;
    const every = Math.max(1, Math.ceil((count - 1) / maxTicks));
    for (let i = 0; i < count; i += every) {
      if (i !== 0 && count - 1 - i < every / 2) continue;
      addTick(i);
    }
    addTick(count - 1);
    function addTick(i) {
      const t = el('text', { x: x(i), y: height - pad.bottom + 20, 'text-anchor': i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle', class: 'chart-axis-label' });
      t.textContent = ticks[i];
      svg.appendChild(t);
    }

    config.series.forEach((s) => {
      const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      if (s.area) {
        svg.appendChild(el('path', { d: `${d} L ${x(count - 1).toFixed(1)} ${y(0)} L ${x(0).toFixed(1)} ${y(0)} Z`, fill: s.color, 'fill-opacity': 0.12, stroke: 'none' }));
      }
      const path = el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (s.dash) path.setAttribute('stroke-dasharray', '6 5');
      svg.appendChild(path);
    });

    svg.appendChild(el('line', { class: 'chart-hover-line', 'data-role': 'hover-line', y1: pad.top, y2: height - pad.bottom }));
    config.series.forEach((s, i) => svg.appendChild(el('circle', { class: 'chart-hover-dot', 'data-role': `dot-${i}`, r: 4 })));
    state.focused = Math.min(state.focused, count - 1);
  }

  function hideTooltip(state) {
    state.tooltip.classList.remove('is-visible');
    state.svg.querySelectorAll('.chart-hover-line, .chart-hover-dot').forEach((n) => { n.style.opacity = 0; });
  }

  function showPoint(state, index) {
    const { geom, config, svg, tooltip } = state;
    if (!geom) return;
    const i = Math.max(0, Math.min(geom.count - 1, index));
    state.focused = i;
    const px = geom.x(i);
    const line = svg.querySelector('[data-role="hover-line"]');
    line.setAttribute('x1', px); line.setAttribute('x2', px); line.style.opacity = 1;
    let topY = geom.height;
    config.series.forEach((s, si) => {
      const dot = svg.querySelector(`[data-role="dot-${si}"]`);
      const py = geom.y(s.values[i]);
      topY = Math.min(topY, py);
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.style.opacity = 1;
    });
    const rect = svg.getBoundingClientRect();
    tooltip.style.left = `${(px / geom.width) * rect.width}px`;
    tooltip.style.top = `${(topY / geom.height) * rect.height}px`;
    const fmt = config.yFormat || ((n) => gbp.format(n));
    tooltip.innerHTML = `<div class="chart-tooltip__year">${escapeHtml(config.tooltipTitle ? config.tooltipTitle(i) : config.labels[i])}</div>${
      config.series.map((s) => `<div class="chart-tooltip__row"><span>${escapeHtml(s.name)}</span><strong>${fmt(s.values[i])}</strong></div>`).join('')}`;
    tooltip.classList.add('is-visible');
  }

  function bindChart(svg) {
    svg._chartBound = true;
    const st = () => svg._chartState;
    const fromClientX = (clientX) => {
      const s = st();
      if (!s.geom) return;
      const rect = svg.getBoundingClientRect();
      const vx = (clientX - rect.left) * (s.geom.width / rect.width);
      const ratio = (vx - s.geom.pad.left) / (s.geom.width - s.geom.pad.left - s.geom.pad.right);
      showPoint(s, Math.round(ratio * (s.geom.count - 1)));
    };
    svg.addEventListener('mousemove', (e) => fromClientX(e.clientX));
    svg.addEventListener('mouseleave', () => hideTooltip(st()));
    svg.addEventListener('touchmove', (e) => { if (e.touches[0]) { fromClientX(e.touches[0].clientX); e.preventDefault(); } }, { passive: false });
    svg.addEventListener('touchend', () => hideTooltip(st()));
    svg.addEventListener('focus', () => showPoint(st(), st().focused));
    svg.addEventListener('blur', () => hideTooltip(st()));
    svg.addEventListener('keydown', (e) => {
      const s = st();
      if (!s.geom) return;
      const map = { ArrowRight: s.focused + 1, ArrowLeft: s.focused - 1, Home: 0, End: s.geom.count - 1 };
      if (e.key in map) { e.preventDefault(); showPoint(s, map[e.key]); }
    });
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => charts.forEach((s) => { if (s.svg.isConnected) drawChart(s); }), 150);
  });

  // Carries figures from one calculator to another (e.g. hourly pay into
  // take-home pay) through sessionStorage, which stays in this browser tab.
  // Figures are deliberately never put in the page URL, where they would
  // end up in browser history, shared links and analytics page reports.
  const HANDOFF_KEY = 'calc-handoff';

  function bindHandoff(link, getData) {
    link.addEventListener('click', () => {
      try {
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ to: link.getAttribute('href'), data: getData() }));
      } catch (e) { /* storage unavailable: the target page just opens with its defaults */ }
    });
  }

  // Returns figures handed to this page (once), or null.
  function takeHandoff() {
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      sessionStorage.removeItem(HANDOFF_KEY);
      if (!raw) return null;
      const h = JSON.parse(raw);
      return h && window.location.pathname.endsWith(h.to) ? h.data : null;
    } catch (e) {
      return null;
    }
  }

  // Writes a handed-over number into an input, if it's a valid number.
  function fillNumber(input, value) {
    const n = Number(value);
    if (input && Number.isFinite(n) && n >= 0) input.value = formatWithCommas(n, Number.isInteger(n) ? 0 : 2);
  }

  window.CalcUI = {
    gbp, gbp2, gbpCompact, pct, parseNumber, formatWithCommas, escapeHtml, yearsMonths,
    monthFromNow, formatMonthYear, formatShortMonthYear, setFieldError, readNumber, formatOnBlur,
    radioValue, errorBlock, setResultsState, tile, FIELD_ERRORS, bindDisclosure, resetDisclosure, lineChart, bindHandoff, takeHandoff, fillNumber,
  };
})();
