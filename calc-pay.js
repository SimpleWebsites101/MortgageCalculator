// 24/7 UK Mortgage Calculator — hourly pay conversion maths
//
// Converts an hourly rate into weekly, monthly and annual *gross* pay.
// Pure functions only (window.PayCalc in the browser, module.exports in
// Node for tests). Nothing here deducts tax — that's calc-uk-tax.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // UK workers are entitled to 5.6 weeks' paid holiday a year, so overtime
  // (which isn't paid while on holiday) is assumed to happen in the other
  // 46.4 weeks unless the caller says otherwise.
  const DEFAULT_OVERTIME_WEEKS = 52 - 5.6;

  // inputs:
  //   hourlyRate          £ per hour for contracted hours
  //   hoursPerWeek        contracted / usual hours in a working week
  //   paidWeeks           weeks per year you're paid basic hours for
  //                       (52 if holiday is paid; fewer for unpaid weeks)
  //   overtimeHours       average overtime hours in a week you do overtime
  //   overtimeMultiplier  e.g. 1.5 for time-and-a-half
  //   overtimeWeeks       weeks per year you actually do that overtime
  function hourlyToSalary({
    hourlyRate, hoursPerWeek, paidWeeks = 52,
    overtimeHours = 0, overtimeMultiplier = 1.5, overtimeWeeks = DEFAULT_OVERTIME_WEEKS,
  }) {
    const errors = [];
    if (!(hourlyRate >= 0)) errors.push('Enter an hourly rate of £0 or more.');
    if (!(hoursPerWeek >= 0 && hoursPerWeek <= 168)) errors.push('Hours per week must be between 0 and 168.');
    if (!(paidWeeks >= 0 && paidWeeks <= 52)) errors.push('Paid weeks per year must be between 0 and 52.');
    if (!(overtimeHours >= 0)) errors.push('Overtime hours can’t be negative.');
    if (hoursPerWeek + overtimeHours > 168) errors.push('Contracted and overtime hours together can’t exceed 168 hours in a week.');
    if (!(overtimeMultiplier >= 1 && overtimeMultiplier <= 5)) errors.push('Overtime multiplier must be between 1 and 5.');
    if (!(overtimeWeeks >= 0 && overtimeWeeks <= 52)) errors.push('Overtime weeks must be between 0 and 52.');
    if (errors.length) return { ok: false, errors };

    const overtimeRate = hourlyRate * overtimeMultiplier;
    const basicWeekly = hourlyRate * hoursPerWeek;
    const overtimeWeekly = overtimeRate * overtimeHours;
    const basicAnnual = basicWeekly * paidWeeks;
    const overtimeAnnual = overtimeWeekly * (overtimeHours > 0 ? overtimeWeeks : 0);
    const annual = basicAnnual + overtimeAnnual;
    const annualHours = hoursPerWeek * paidWeeks + overtimeHours * (overtimeHours > 0 ? overtimeWeeks : 0);

    return {
      ok: true,
      overtimeRate,
      basicWeekly,
      overtimeWeekly,
      typicalWeek: basicWeekly + overtimeWeekly,
      basicAnnual,
      overtimeAnnual,
      annual,
      monthlyAverage: annual / 12,
      weeklyAverage: annual / 52,
      annualHours,
      averageHourly: annualHours > 0 ? annual / annualHours : 0,
    };
  }

  return { DEFAULT_OVERTIME_WEEKS, hourlyToSalary };
});
