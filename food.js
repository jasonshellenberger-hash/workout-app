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

  return { MEALS, mealForTime, rated, winPct, awards, misses, lunchStats };
})();

if (typeof module !== 'undefined') module.exports = Food;
