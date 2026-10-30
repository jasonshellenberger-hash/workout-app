'use strict';

/* ==========================================================================
   Phase 5b food and desk (SPEC.md → Food features, Workday movement)
   Pure functions: no DOM, no storage. app.js passes the `daily` records in.
   A daily record: { date, meals: { breakfast, lunch, dinner, snacks: [] }, protein, proteinAdds,
     lunchPlan, lunchStuck, deskBreaks, stood }. Each meal is { rating: 'win'|'ok'|'miss', note, at, fastFood }.
   ========================================================================== */
const Food = (() => {
  const MEALS = ['breakfast', 'lunch', 'dinner'];

  // The meal that fits the time of day: breakfast until 10:30, lunch until 3:30, then dinner.
  function mealForTime(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    return h < 10.5 ? 'breakfast' : h < 15.5 ? 'lunch' : 'dinner';
  }

  // Every rated meal in a day, snacks included.
  function rated(day) {
    if (!day?.meals) return [];
    return [...MEALS.map(m => day.meals[m]), ...(day.meals.snacks || [])].filter(m => m && m.rating);
  }

  // Win meal %: Wins over rated meals. null when nothing was rated.
  function winPct(days) {
    const all = days.flatMap(rated);
    if (!all.length) return null;
    return Math.round(all.filter(m => m.rating === 'win').length / all.length * 100);
  }

  // Extra reward points from food and desk, one award per Win meal or desk break, from `since` on.
  function awards(days, { since, winPoints, deskPoints }) {
    const out = [];
    for (const day of days) {
      if (since && day.date < since) continue;
      for (const m of rated(day)) if (m.rating === 'win') out.push({ date: day.date, points: winPoints });
      for (let i = 0; i < (day.deskBreaks || 0); i++) out.push({ date: day.date, points: deskPoints });
    }
    return out;
  }

  // Miss meals for the skip tax, from `since` on: [{ date, at }].
  function misses(days, since) {
    return days.filter(d => !since || d.date >= since)
      .flatMap(d => rated(d).filter(m => m.rating === 'miss').map(m => ({ date: d.date, at: m.at || null })));
  }

  // Lunch plans that had a "Did you stick to it?" answer: { planned, stuck }.
  function lunchStats(days) {
    const asked = days.filter(d => d.lunchPlan && d.lunchPlan.pick !== 'wing' && d.lunchStuck != null);
    return { planned: asked.length, stuck: asked.filter(d => d.lunchStuck).length };
  }

  const parse = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  /*
   * Goal mode checkpoint (SPEC.md → 12-week checkpoint). Due `weeks` weeks after the mode started.
   * series: Track.weeklySeries points; logs: saved workout logs.
   * weight: the 4-week average when the mode started (the last point on or before that week, else the first after)
   *   vs the latest one; null until there are two different points. levels: rung-ups since the mode started.
   */
  function checkpoint({ since, today, weeks, series, logs }) {
    const due = daysBetween(since, today) >= weeks * 7;
    const sinceWeek = (() => { const d = parse(since); d.setDate(d.getDate() - d.getDay()); return d; })();
    const before = series.filter(p => parse(p.week) <= sinceWeek);
    const start = before.length ? before[before.length - 1] : series[0];
    const end = series[series.length - 1];
    const weight = start && end && start !== end ? { from: start.avg, to: end.avg, change: end.avg - start.avg } : null;
    const levels = logs.filter(l => l.date >= since)
      .reduce((n, l) => n + (l.checkIn?.applied || []).filter(c => c.change === 'rungUp').length, 0);
    return { due, weight, levels };
  }

  /*
   * Loss-rate guardrail (SPEC.md, Lose fat only): the latest 4-week average vs the one 4 weekly points back.
   * null without 5 points, or when the latest weigh-in is over 14 days old.
   * fast: dropping more than 1% of body weight a week.
   */
  function lossRate(series, today) {
    if (series.length < 5) return null;
    const last = series[series.length - 1];
    const prev = series[series.length - 5];
    if (daysBetween(last.date, today) > 14) return null;
    const perWeek = (prev.avg - last.avg) / (daysBetween(prev.week, last.week) / 7);
    const pct = perWeek / last.avg * 100;
    return { perWeek, pct, fast: pct > 1 };
  }

  return { MEALS, mealForTime, rated, winPct, awards, misses, lunchStats, checkpoint, lossRate };
})();

if (typeof module !== 'undefined') module.exports = Food;
