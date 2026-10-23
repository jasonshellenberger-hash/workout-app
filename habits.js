'use strict';

/* ==========================================================================
   Phase 5a habits (SPEC.md → Habit features)
   Pure functions: no DOM, no storage. app.js passes data in.
   ========================================================================== */
const Habits = (() => {
  const pad2 = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  function addDaysKey(key, n) { const [y, m, d] = key.split('-').map(Number); return keyOf(new Date(y, m - 1, d + n)); }

  /*
   * Skip tax. Every planned day from `since` through yesterday with no show-up is a miss.
   * Excused days aren't planned, so planned() already leaves them out. Today never counts: it isn't over.
   * Miss meals (Phase 5b) cost mealAmount each, from `since` on, counted as soon as they're logged.
   * input: { since, today, planned(key), showedUp: Set<dateKey>, amount, payments: [{ date, at, amount }],
   *          mealMisses: [{ date, at }], mealAmount }
   * returns { misses: [dateKey], mealMisses, charged, paid, owed, lastPaid, lastPaidAt }
   */
  function ledger({ since, today, planned, showedUp, amount, payments = [], mealMisses = [], mealAmount = 0 }) {
    const misses = [];
    if (since) {
      for (let key = since; key < today; key = addDaysKey(key, 1)) {
        if (planned(key) && !showedUp.has(key)) misses.push(key);
      }
    }
    const meals = mealMisses.filter(m => !since || m.date >= since);
    const charged = misses.length * amount + meals.length * mealAmount;
    const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const last = [...payments].sort((a, b) => (a.at || a.date).localeCompare(b.at || b.date)).pop();
    return { misses, mealMisses: meals, charged, paid, owed: Math.max(0, charged - paid), lastPaid: last?.date || null, lastPaidAt: last?.at || null };
  }

  // One notice per threshold crossed since the last payoff. sent: notices already sent since then.
  function noticeDue({ owed, threshold, sent }) {
    return threshold > 0 && Math.floor(owed / threshold) > (sent || 0);
  }

  // Excused skips left in the calendar month of `key`.
  function excusesLeft(excused, key, limit) {
    const month = key.slice(0, 7);
    return Math.max(0, limit - excused.filter(x => x.date.slice(0, 7) === month).length);
  }

  /*
   * Reward bank. awards: [{ date, points }], one or more per day; only the best one each day counts,
   * from `since` on. extras (Win meals, desk breaks) all count, on top of that.
   * returns { earned, spent, balance }
   */
  function bank({ since, awards, extras = [], redemptions = [] }) {
    const best = new Map();
    for (const a of awards) {
      if (since && a.date < since) continue;
      best.set(a.date, Math.max(best.get(a.date) || 0, a.points));
    }
    const bonus = extras.filter(a => !since || a.date >= since).reduce((s, a) => s + a.points, 0);
    const earned = [...best.values()].reduce((s, n) => s + n, 0) + bonus;
    const spent = redemptions.reduce((s, r) => s + (r.cost || 0), 0);
    return { earned, spent, balance: earned - spent };
  }

  /*
   * Upper and lower limits for the scorecard trend (an XmR chart): the average plus or minus
   * 2.66 × the average change from one week to the next, kept within [lo, hi].
   * values: numbers, oldest first. Limits need at least 2 values.
   */
  function limits(values, lo = 0, hi = 100) {
    if (!values.length) return null;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    if (values.length < 2) return { mean, upper: null, lower: null };
    let mr = 0;
    for (let i = 1; i < values.length; i++) mr += Math.abs(values[i] - values[i - 1]);
    mr /= values.length - 1;
    return { mean, upper: Math.min(hi, mean + 2.66 * mr), lower: Math.max(lo, mean - 2.66 * mr) };
  }

  // "Jason's workout IOU just hit {amount}." → "... just hit $20."
  function fillMessage(template, owed) {
    return String(template || '').replace(/\{amount\}/g, `$${owed}`);
  }

  return { ledger, noticeDue, excusesLeft, bank, limits, fillMessage, addDaysKey };
})();

if (typeof module !== 'undefined') module.exports = Habits;
