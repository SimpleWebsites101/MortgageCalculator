// SimpleMortgageCalculator — live amortisation logic

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbpDecimal = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });
const gbpCompact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 0 });

const els = {
  principal: document.getElementById('principal'),
  principalRange: document.getElementById('principal-range'),
  rate: document.getElementById('rate'),
  rateRange: document.getElementById('rate-range'),
  term: document.getElementById('term'),
  termRange: document.getElementById('term-range'),
  deposit: document.getElementById('deposit'),
  depositRange: document.getElementById('deposit-range'),
  monthlyPayment: document.getElementById('monthly-payment'),
  totalRepaid: document.getElementById('total-repaid'),
  totalInterest: document.getElementById('total-interest'),
  ltv: document.getElementById('ltv'),
  chart: document.getElementById('balance-chart'),
  tooltip: document.getElementById('chart-tooltip'),
};

function parseNumber(str) {
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatWithCommas(n) {
  return Math.round(n).toLocaleString('en-GB');
}

// Sync a text field with its paired range slider in both directions
function pairField(textEl, rangeEl, { isCurrency = false } = {}) {
  textEl.addEventListener('input', () => {
    const val = parseNumber(textEl.value);
    rangeEl.value = val;
    calculate();
  });
  textEl.addEventListener('blur', () => {
    const val = parseNumber(textEl.value);
    textEl.value = isCurrency ? formatWithCommas(val) : val;
  });
  rangeEl.addEventListener('input', () => {
    const val = parseFloat(rangeEl.value);
    textEl.value = isCurrency ? formatWithCommas(val) : val;
    calculate();
  });
}

pairField(els.principal, els.principalRange, { isCurrency: true });
pairField(els.rate, els.rateRange);
pairField(els.term, els.termRange);
pairField(els.deposit, els.depositRange, { isCurrency: true });

function calculate() {
  const price = parseNumber(els.principal.value);
  const deposit = parseNumber(els.deposit.value);
  const loan = Math.max(price - deposit, 0);
  const annualRate = parseNumber(els.rate.value);
  const years = parseNumber(els.term.value) || 1;

  const monthlyRate = annualRate / 100 / 12;
  const numPayments = years * 12;

  let monthlyPayment;
  if (monthlyRate === 0) {
    monthlyPayment = loan / numPayments;
  } else {
    monthlyPayment = loan * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                      (Math.pow(1 + monthlyRate, numPayments) - 1);
  }
  if (!isFinite(monthlyPayment) || loan === 0) monthlyPayment = 0;

  const totalRepaid = monthlyPayment * numPayments;
  const totalInterest = totalRepaid - loan;
  const ltv = price > 0 ? (loan / price) * 100 : 0;

  els.monthlyPayment.textContent = gbpDecimal.format(monthlyPayment);
  els.totalRepaid.textContent = gbp.format(totalRepaid);
  els.totalInterest.textContent = gbp.format(totalInterest);
  els.ltv.textContent = `${ltv.toFixed(0)}%`;

  // Draw at the chart's real on-screen pixel width, not a fixed unit that
  // then gets scaled by the SVG — keeps axis text a constant, legible size
  // on any device instead of shrinking on narrow phone screens.
  const containerWidth = els.chart.clientWidth || 720;
  drawChart(loan, monthlyRate, monthlyPayment, years, containerWidth);
}

// Chart geometry + data kept here so the hover handler (attached once,
// outside drawChart) can always read the latest state.
const chartState = {
  balancePoints: [],
  interestPoints: [],
  years: 0,
  xFor: null,
  yFor: null,
  padding: null,
};

function drawChart(loan, monthlyRate, monthlyPayment, years, containerWidth) {
  const svg = els.chart;
  svg.innerHTML = '';
  hideTooltip();

  if (loan === 0 || years === 0) {
    chartState.balancePoints = [];
    return;
  }

  const width = Math.max(containerWidth, 260);
  const height = width < 420 ? 240 : 320;
  const padding = {
    top: 16,
    right: width < 420 ? 8 : 16,
    bottom: 32,
    left: width < 420 ? 46 : 60,
  };
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Walk month-by-month, but record one sample per completed year (year 0..years)
  const balancePoints = [loan];
  const interestPoints = [0];
  let balance = loan;
  let cumInterest = 0;
  const numPayments = years * 12;

  for (let m = 1; m <= numPayments; m++) {
    const interestPortion = balance * monthlyRate;
    const principalPortion = monthlyPayment - interestPortion;
    balance = Math.max(balance - principalPortion, 0);
    cumInterest += interestPortion;

    if (m % 12 === 0) {
      balancePoints.push(balance);
      interestPoints.push(cumInterest);
    }
  }
  // Catch any partial final year (e.g. non-integer term edge cases)
  if (balancePoints.length < years + 1) {
    balancePoints.push(balance);
    interestPoints.push(cumInterest);
  }

  const maxVal = Math.max(loan, cumInterest) * 1.05;
  const n = balancePoints.length;

  const xFor = (i) => padding.left + (i / (n - 1)) * plotW;
  const yFor = (v) => padding.top + plotH - (v / maxVal) * plotH;

  chartState.balancePoints = balancePoints;
  chartState.interestPoints = interestPoints;
  chartState.years = years;
  chartState.xFor = xFor;
  chartState.yFor = yFor;
  chartState.padding = padding;
  chartState.width = width;
  chartState.height = height;

  const toPath = (points) => points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ');

  const ns = 'http://www.w3.org/2000/svg';

  // Y-axis gridlines + amount labels
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const v = maxVal * (i / ySteps);
    const y = yFor(v);

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', padding.left);
    line.setAttribute('x2', width - padding.right);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#232429');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', padding.left - 10);
    label.setAttribute('y', y + 3);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'chart-axis-label');
    label.textContent = gbpCompact.format(v);
    svg.appendChild(label);
  }

  // X-axis ticks — wider spacing on narrow screens so labels don't crowd
  const tickStep = width < 420 ? 10 : 5;
  const xTicks = [0];
  for (let y = tickStep; y < years; y += tickStep) xTicks.push(y);
  xTicks.push(years);

  xTicks.forEach((yr) => {
    const x = xFor(yr);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', height - padding.bottom + 20);
    label.setAttribute('text-anchor', yr === 0 ? 'start' : (yr === years ? 'end' : 'middle'));
    label.setAttribute('class', 'chart-axis-label');
    label.textContent = `Yr ${yr}`;
    svg.appendChild(label);
  });

  // Data lines
  const balancePath = document.createElementNS(ns, 'path');
  balancePath.setAttribute('d', toPath(balancePoints));
  balancePath.setAttribute('fill', 'none');
  balancePath.setAttribute('stroke', '#F6F7F9');
  balancePath.setAttribute('stroke-width', '2.5');
  balancePath.setAttribute('stroke-linecap', 'round');
  balancePath.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(balancePath);

  const interestPath = document.createElementNS(ns, 'path');
  interestPath.setAttribute('d', toPath(interestPoints));
  interestPath.setAttribute('fill', 'none');
  interestPath.setAttribute('stroke', '#6B6E77');
  interestPath.setAttribute('stroke-width', '2.5');
  interestPath.setAttribute('stroke-linecap', 'round');
  interestPath.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(interestPath);

  // Hover guide elements (electric blue — interactive only)
  const hoverLine = document.createElementNS(ns, 'line');
  hoverLine.setAttribute('id', 'hover-line');
  hoverLine.setAttribute('class', 'chart-hover-line');
  hoverLine.setAttribute('y1', padding.top);
  hoverLine.setAttribute('y2', height - padding.bottom);
  svg.appendChild(hoverLine);

  const hoverDotBalance = document.createElementNS(ns, 'circle');
  hoverDotBalance.setAttribute('id', 'hover-dot-balance');
  hoverDotBalance.setAttribute('class', 'chart-hover-dot');
  hoverDotBalance.setAttribute('r', 4);
  svg.appendChild(hoverDotBalance);

  const hoverDotInterest = document.createElementNS(ns, 'circle');
  hoverDotInterest.setAttribute('id', 'hover-dot-interest');
  hoverDotInterest.setAttribute('class', 'chart-hover-dot');
  hoverDotInterest.setAttribute('r', 4);
  svg.appendChild(hoverDotInterest);

  // Invisible capture rect for pointer events
  const capture = document.createElementNS(ns, 'rect');
  capture.setAttribute('x', padding.left);
  capture.setAttribute('y', padding.top);
  capture.setAttribute('width', plotW);
  capture.setAttribute('height', plotH);
  capture.setAttribute('fill', 'transparent');
  capture.setAttribute('id', 'chart-capture');
  svg.appendChild(capture);
}

function hideTooltip() {
  els.tooltip.classList.remove('is-visible');
  const line = els.chart.querySelector('#hover-line');
  const dotB = els.chart.querySelector('#hover-dot-balance');
  const dotI = els.chart.querySelector('#hover-dot-interest');
  if (line) line.style.opacity = 0;
  if (dotB) dotB.style.opacity = 0;
  if (dotI) dotI.style.opacity = 0;
}

function handleChartHover(clientX, clientY) {
  const { balancePoints, interestPoints, years, xFor, yFor, padding } = chartState;
  if (!xFor || balancePoints.length === 0) return;

  const rect = els.chart.getBoundingClientRect();
  const scaleX = chartState.width / rect.width;
  const localX = (clientX - rect.left) * scaleX;

  const n = balancePoints.length;
  const relative = (localX - padding.left) / (chartState.width - padding.left - padding.right);
  let index = Math.round(relative * (n - 1));
  index = Math.max(0, Math.min(n - 1, index));

  const x = xFor(index);
  const yB = yFor(balancePoints[index]);
  const yI = yFor(interestPoints[index]);

  const line = els.chart.querySelector('#hover-line');
  const dotB = els.chart.querySelector('#hover-dot-balance');
  const dotI = els.chart.querySelector('#hover-dot-interest');

  line.setAttribute('x1', x);
  line.setAttribute('x2', x);
  line.style.opacity = 1;

  dotB.setAttribute('cx', x);
  dotB.setAttribute('cy', yB);
  dotB.style.opacity = 1;

  dotI.setAttribute('cx', x);
  dotI.setAttribute('cy', yI);
  dotI.style.opacity = 1;

  const rectBounds = els.chart.parentElement.getBoundingClientRect();
  const tooltipX = (x / chartState.width) * rectBounds.width;
  const tooltipY = (yB / chartState.height) * rectBounds.height;

  els.tooltip.style.left = `${tooltipX}px`;
  els.tooltip.style.top = `${tooltipY}px`;
  els.tooltip.innerHTML = `
    <div class="chart-tooltip__year">Year ${index}</div>
    <div class="chart-tooltip__row"><span>Balance</span><strong>${gbp.format(balancePoints[index])}</strong></div>
    <div class="chart-tooltip__row"><span>Interest paid</span><strong>${gbp.format(interestPoints[index])}</strong></div>
  `;
  els.tooltip.classList.add('is-visible');
}

els.chart.addEventListener('mousemove', (e) => handleChartHover(e.clientX, e.clientY));
els.chart.addEventListener('mouseleave', hideTooltip);
els.chart.addEventListener('touchmove', (e) => {
  if (e.touches[0]) {
    handleChartHover(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }
}, { passive: false });
els.chart.addEventListener('touchend', hideTooltip);

// Redraw the chart at the new width on resize / orientation change so text
// and spacing stay correct on phones, tablets, and desktop alike.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(calculate, 120);
});
window.addEventListener('orientationchange', () => setTimeout(calculate, 200));

calculate();
