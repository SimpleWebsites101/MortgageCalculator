// Debt Repayment Calculator — page wiring. Maths lives in calc-debt.js.
(function () {
  'use strict';
  const { gbp, gbp2, readNumber, formatOnBlur, radioValue, setResultsState, FIELD_ERRORS, escapeHtml, yearsMonths, monthFromNow, formatMonthYear, formatShortMonthYear, lineChart, bindDisclosure, resetDisclosure } = window.CalcUI;
  const D = window.DebtCalc;

  const $ = (id) => document.getElementById(id);
  const els = {
    balance: $('balance'), rate: $('rate'), payment: $('payment'), extra: $('extra'),
    headline: $('headline'), compare: $('compare'), savings: $('savings'),
    chart: $('debt-chart'), tooltip: $('debt-chart-tooltip'),
    scheduleSub: $('schedule-sub'), toggle: $('schedule-toggle'), wrap: $('schedule-wrap'), tbody: $('schedule-tbody'),
  };
  const legend = els.chart.closest('.schedule').querySelector('.schedule__legend');
  const TOGGLE = { closed: 'Show month-by-month schedule ↓', open: 'Hide schedule ↑' };
  const SUGGESTED_TERMS = [12, 24, 36, 60];

  function column(title, r, highlight) {
    return `<div class="overpay-compare__col${highlight ? ' overpay-compare__col--highlight' : ''}">
      <h3>${title}</h3>
      <dl class="result__breakdown">
        <div><dt>Time to clear</dt><dd>${yearsMonths(r.months)}</dd></div>
        <div><dt>Debt-free</dt><dd>${formatMonthYear(monthFromNow(r.months))}</dd></div>
        <div><dt>Number of payments</dt><dd>${r.months}</dd></div>
        <div><dt>Total interest</dt><dd>${gbp2.format(r.totalInterest)}</dd></div>
        <div><dt>Total repaid</dt><dd>${gbp2.format(r.totalPaid)}</dd></div>
        <div><dt>Final payment</dt><dd>${gbp2.format(r.finalPayment)}</dd></div>
      </dl></div>`;
  }

  function tooLowMessage(res, balance, rate, rateType) {
    const options = SUGGESTED_TERMS.map((m) => `<li>${yearsMonths(m)}: ${gbp2.format(D.paymentForTerm(balance, rate, rateType, m))} a month</li>`).join('');
    return `<div class="validation-message" role="alert"><p>${escapeHtml(res.errors[0])}</p>
      <p style="margin-top:10px">Payments that would clear ${gbp.format(balance)} at this rate:</p><ul>${options}</ul></div>`;
  }

  function calculate() {
    const v = {
      balance: readNumber(els.balance, { label: 'Outstanding balance', min: 0.01, minLabel: '1p', max: 10000000, maxLabel: '£10,000,000' }),
      rate: readNumber(els.rate, { label: 'Interest rate', min: 0, max: 100, maxLabel: '100%' }),
      payment: readNumber(els.payment, { label: 'Monthly repayment', min: 0.01, minLabel: '1p', max: 10000000, maxLabel: '£10,000,000' }),
      extra: readNumber(els.extra, { label: 'Extra payment', min: 0, max: 10000000, maxLabel: '£10,000,000', allowBlank: true }),
    };
    resetDisclosure(els.toggle, els.wrap, TOGGLE);
    if (Object.values(v).some(Number.isNaN)) return setResultsState([FIELD_ERRORS]);
    const rateType = radioValue('rate-type');

    const base = D.repaySingleDebt({ balance: v.balance, annualRate: v.rate, rateType, payment: v.payment });
    const hasExtra = v.extra > 0;
    const boosted = hasExtra ? D.repaySingleDebt({ balance: v.balance, annualRate: v.rate, rateType, payment: v.payment, extra: v.extra }) : null;

    // The regular payment alone may be too low while the boosted one works.
    if (!base.ok && !(boosted && boosted.ok)) {
      return setResultsState(base.errors, base.reason === 'payment-too-low' ? tooLowMessage(base, v.balance, v.rate, rateType) : null);
    }
    setResultsState([]);
    const main = boosted && boosted.ok ? boosted : base;

    if (base.ok && boosted && boosted.ok) {
      const monthsSaved = base.months - boosted.months;
      const interestSaved = base.totalInterest - boosted.totalInterest;
      els.headline.textContent = `Paying an extra ${gbp.format(v.extra)} a month would clear your debt ${monthsSaved > 0 ? `${yearsMonths(monthsSaved)} sooner` : 'in the same number of months'}, in ${formatMonthYear(monthFromNow(boosted.months))}, and save ${gbp2.format(interestSaved)} in interest.`;
      els.compare.innerHTML = `<div class="overpay-compare">${column('Regular payment only', base)}${column(`With ${gbp.format(v.extra)} extra a month`, boosted, true)}</div>`;
      els.savings.innerHTML = `<div class="overpay-savings">
        <div class="overpay-savings__item"><span>Time saved</span><strong>${monthsSaved > 0 ? yearsMonths(monthsSaved) : '—'}</strong></div>
        <div class="overpay-savings__item"><span>Interest saved</span><strong>${gbp2.format(interestSaved)}</strong></div></div>`;
    } else if (!base.ok) {
      els.headline.textContent = `Your regular ${gbp2.format(v.payment)} doesn’t cover the interest on its own, but with the extra ${gbp.format(v.extra)} you’d be debt-free in ${yearsMonths(boosted.months)} (${formatMonthYear(monthFromNow(boosted.months))}), paying ${gbp2.format(boosted.totalInterest)} in interest.`;
      els.compare.innerHTML = `<div class="overpay-compare">${column(`With ${gbp.format(v.extra)} extra a month`, boosted, true)}<div class="overpay-compare__col"><h3>Regular payment only</h3><p class="calc-section-sub" style="margin:0">${escapeHtml(base.errors[0])}</p></div></div>`;
      els.savings.innerHTML = '';
    } else {
      els.headline.textContent = `At ${gbp2.format(v.payment)} a month you’d be debt-free in ${yearsMonths(base.months)} (${formatMonthYear(monthFromNow(base.months))}), paying ${gbp2.format(base.totalInterest)} in interest.`;
      els.compare.innerHTML = `<div class="overpay-compare">${column('Your repayment plan', base, true)}</div>`;
      els.savings.innerHTML = '';
    }

    const series = [];
    const len = Math.max(base.ok ? base.months : 0, main.months);
    const balances = (r) => Array.from({ length: len + 1 }, (_, i) => (i === 0 ? v.balance : (r.schedule[i - 1] ? r.schedule[i - 1].closing : 0)));
    if (base.ok && main !== base) series.push({ name: 'Regular only', values: balances(base), color: '#6B6E77' });
    series.push({ name: main === base ? 'Balance' : 'With extra', values: balances(main), color: '#F6F7F9', area: true });
    legend.hidden = series.length < 2;
    lineChart(els.chart, els.tooltip, {
      labels: Array.from({ length: len + 1 }, (_, i) => (i === 0 ? 'Today' : `After payment ${i} (${formatMonthYear(monthFromNow(i))})`)),
      tickLabels: Array.from({ length: len + 1 }, (_, i) => (i === 0 ? 'Now' : formatShortMonthYear(monthFromNow(i)))),
      series,
    });

    els.scheduleSub.textContent = `${main === boosted ? `With the extra ${gbp.format(v.extra)} a month` : 'At your regular payment'}: ${main.months} payments, including interest and the final partial payment.`;
    els.tbody.innerHTML = main.schedule.map((m) => `<tr><td>${m.month}</td><td>${formatShortMonthYear(monthFromNow(m.month))}</td><td>${gbp2.format(m.opening)}</td><td>${gbp2.format(m.interest)}</td><td>${gbp2.format(m.payment)}</td><td>${gbp2.format(m.closing)}</td></tr>`).join('')
      + `<tr class="is-total-row"><td>Total</td><td></td><td></td><td>${gbp2.format(main.totalInterest)}</td><td>${gbp2.format(main.totalPaid)}</td><td>${gbp2.format(0)}</td></tr>`;
  }

  bindDisclosure(els.toggle, els.wrap, TOGGLE);
  [els.balance, els.payment, els.extra].forEach((i) => formatOnBlur(i));
  document.querySelectorAll('#calculator input').forEach((i) => i.addEventListener(i.type === 'radio' ? 'change' : 'input', calculate));
  calculate();
})();
