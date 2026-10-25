// Hourly Wage to Salary Calculator — page wiring. Maths lives in calc-pay.js.
(function () {
  'use strict';
  const { gbp, gbp2, readNumber, formatWithCommas, setResultsState, FIELD_ERRORS, tile, bindHandoff } = window.CalcUI;
  const P = window.PayCalc;

  // National Living Wage for workers aged 21+ from 1 April 2026 (GOV.UK).
  const NATIONAL_LIVING_WAGE = 12.71;

  const $ = (id) => document.getElementById(id);
  const els = {
    rate: $('rate'), hours: $('hours'), paidWeeks: $('paid-weeks'),
    otHours: $('ot-hours'), otRate: $('ot-rate'), otWeeks: $('ot-weeks'),
    headline: $('headline'), tiles: $('tiles'), notes: $('notes'), breakdown: $('breakdown-tbody'), takehomeLink: $('takehome-link'),
  };

  let handoff = null; // annual pay carried to the take-home calculator

  function calculate() {
    const v = {
      hourlyRate: readNumber(els.rate, { label: 'Hourly rate', min: 0, max: 10000, maxLabel: '£10,000' }),
      hoursPerWeek: readNumber(els.hours, { label: 'Hours per week', min: 0, max: 168 }),
      paidWeeks: readNumber(els.paidWeeks, { label: 'Paid weeks', min: 0, max: 52 }),
      overtimeHours: readNumber(els.otHours, { label: 'Overtime hours', min: 0, max: 168, allowBlank: true }),
      overtimeMultiplier: readNumber(els.otRate, { label: 'Overtime pay rate', min: 1, max: 5, allowBlank: true, blankValue: 1.5 }),
      overtimeWeeks: readNumber(els.otWeeks, { label: 'Weeks with overtime', min: 0, max: 52, allowBlank: true, blankValue: P.DEFAULT_OVERTIME_WEEKS }),
    };
    if (Object.values(v).some(Number.isNaN)) return setResultsState([FIELD_ERRORS]);
    const r = P.hourlyToSalary(v);
    if (!r.ok) return setResultsState(r.errors);
    setResultsState([]);

    const hasOt = v.overtimeHours > 0 && v.overtimeWeeks > 0;
    els.headline.textContent = `${gbp2.format(v.hourlyRate)} an hour for ${v.hoursPerWeek} hours a week${hasOt ? `, plus ${v.overtimeHours} hours’ overtime,` : ''} is about ${gbp.format(r.annual)} a year before tax.`;
    els.tiles.innerHTML = [
      tile('Annual gross pay', gbp.format(r.annual), hasOt ? `including ${gbp.format(r.overtimeAnnual)} overtime` : `${v.paidWeeks} paid weeks`, true),
      tile('Monthly average', gbp2.format(r.monthlyAverage), 'annual ÷ 12, before tax'),
      tile('Typical working week', gbp2.format(r.typicalWeek), hasOt ? `${gbp2.format(r.basicWeekly)} basic + ${gbp2.format(r.overtimeWeekly)} overtime` : `${v.hoursPerWeek} hours`),
      tile('Paid hours per year', formatWithCommas(r.annualHours, r.annualHours % 1 ? 1 : 0), hasOt ? `average ${gbp2.format(r.averageHourly)} an hour` : 'basic hours × paid weeks'),
    ].join('');

    const notes = [];
    if (v.hourlyRate > 0 && v.hourlyRate < NATIONAL_LIVING_WAGE) notes.push(`${gbp2.format(v.hourlyRate)} is below the National Living Wage of ${gbp2.format(NATIONAL_LIVING_WAGE)} an hour for workers aged 21 and over (from 1 April 2026). Lower rates apply to younger workers and apprentices — check the rate for your age on GOV.UK.`);
    if (v.paidWeeks < 52) notes.push(`Based on ${v.paidWeeks} paid weeks, so ${+(52 - v.paidWeeks).toFixed(1)} weeks of the year are unpaid. The monthly and weekly averages spread the year’s pay across all 12 months.`);
    if (hasOt && v.overtimeWeeks > v.paidWeeks) notes.push('You’ve entered more weeks with overtime than paid weeks — check whether that’s right.');
    els.notes.innerHTML = notes.length ? `<div class="validation-message calc-note"><ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>` : '';

    const row = (label, week, annual, cls = '') => `<tr${cls}><td>${label}</td><td>${gbp2.format(week)}</td><td>${gbp2.format(annual / 52)}</td><td>${gbp2.format(annual / 12)}</td><td>${gbp2.format(annual)}</td></tr>`;
    els.breakdown.innerHTML = row('Basic pay', r.basicWeekly, r.basicAnnual)
      + (hasOt ? row(`Overtime at ${gbp2.format(r.overtimeRate)}/hr`, r.overtimeWeekly, r.overtimeAnnual) : '')
      + row('Total gross pay', r.typicalWeek, r.annual, ' class="is-total-row"');

    handoff = { salary: Math.round(r.annual) };
  }

  bindHandoff(els.takehomeLink, () => handoff);
  document.querySelectorAll('#calculator input').forEach((i) => i.addEventListener('input', calculate));
  calculate();
})();
