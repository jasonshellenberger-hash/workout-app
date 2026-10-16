'use strict';

/* ==========================================================================
   Phase 3 tracking (SPEC.md → Weight tracking, Habit features, Extras → History)
   Pure functions: no DOM, no storage. app.js passes data in.
   ========================================================================== */
const Track = (() => {
  const pad2 = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  function parse(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDaysKey(key, n) { const d = parse(key); d.setDate(d.getDate() + n); return keyOf(d); }
  function weekStartKey(key) { const d = parse(key); d.setDate(d.getDate() - d.getDay()); return keyOf(d); }

  // Workout days in effect on a date. periods: [{ from, days }], oldest first.
  function daysOn(periods, key) {
    let days = periods[0]?.days || [];
    for (const p of periods) if (p.from <= key) days = p.days;
    return days;
  }

  /*
   * "Never miss twice" streak. Walks back from today, one calendar day at a time:
   *   a day with a workout          → +1 (at most one per day), and clears a pending miss
   *   a planned day with no workout → a miss; the second miss in a row ends the streak
   *   a day with only a partial     → no +1, but you showed up, so it clears a pending miss
   *   anything else                 → nothing (rest days, Saturdays, Brutal rest days,
   *                                   today before it's over)
   * input: { today, first, done: Set<dateKey>, partial: Set<dateKey>, planned(key) }
   *   first: the earliest date with any history; nothing before it counts as missed.
   * returns { count, oneMiss }  oneMiss: the most recent planned day was missed, so the next one matters.
   */
  function streak({ today, first, done, partial, planned }) {
    let count = 0;
    let misses = 0;
    let oneMiss = null;
    if (!first) return { count: 0, oneMiss: false };
    for (let key = today; key >= first; key = addDaysKey(key, -1)) {
      if (done.has(key)) { count++; misses = 0; if (oneMiss === null) oneMiss = false; continue; }
      if (partial?.has(key)) { misses = 0; if (oneMiss === null) oneMiss = false; continue; } // showed up
      if (key === today || !planned(key)) continue;
      misses++;
      if (oneMiss === null) oneMiss = true;
      if (misses >= 2) break;
    }
    return { count, oneMiss: !!oneMiss };
  }

  // Calendar state for one day: done | partial | missed | today | upcoming | rest | none
  function dayState({ key, today, first, done, partial, planned }) {
    if (done.has(key)) return 'done';
    if (partial.has(key)) return 'partial';
    const isPlanned = planned(key);
    if (key > today) return isPlanned ? 'upcoming' : 'rest';
    if (key === today) return isPlanned ? 'today' : 'rest';
    if (!first || key < first) return 'none';
    return isPlanned ? 'missed' : 'rest';
  }

  // Month grid (Sunday first): weeks of { key, inMonth }.
  function monthGrid(year, month) {
    const start = new Date(year, month, 1);
    start.setDate(1 - start.getDay());
    const weeks = [];
    const d = new Date(start);
    do {
      const week = [];
      for (let i = 0; i < 7; i++) { week.push({ key: keyOf(d), inMonth: d.getMonth() === month }); d.setDate(d.getDate() + 1); }
      weeks.push(week);
    } while (d.getMonth() === month);
    return weeks;
  }

  /*
   * Weigh-ins → one point per week: the Sunday prompted entry, or else the week's first entry.
   * entries: [{ date, at, weightLb, prompted }] → [{ week, date, weightLb, avg }], oldest first.
   * avg: mean of this point and up to 3 before it (the 4-week average).
   */
  function weeklySeries(entries) {
    const byWeek = new Map();
    for (const e of entries) {
      if (!(e.weightLb > 0)) continue;
      const week = weekStartKey(e.date);
      const cur = byWeek.get(week);
      const better = !cur
        || (e.prompted && !cur.prompted)
        || (e.prompted === cur.prompted && (e.at || e.date) < (cur.at || cur.date));
      if (better) byWeek.set(week, e);
    }
    const points = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, e]) => ({ week, date: e.date, weightLb: e.weightLb }));
    points.forEach((p, i) => {
      const win = points.slice(Math.max(0, i - 3), i + 1);
      p.avg = win.reduce((s, q) => s + q.weightLb, 0) / win.length;
    });
    return points;
  }

  /*
   * Summary for Me → Body. With 5+ weekly points the changes compare 4-week averages, so one
   * salty weekend doesn't look like a trend; before that, latest vs first.
   */
  function weightSummary(points) {
    if (!points.length) return null;
    const last = points[points.length - 1];
    if (points.length < 2) return { current: last.weightLb, averaged: false, change4: null, sinceStart: null };
    if (points.length < 5) {
      const d = last.weightLb - points[0].weightLb;
      return { current: last.weightLb, averaged: false, change4: d, sinceStart: d };
    }
    return {
      current: last.avg,
      averaged: true,
      change4: last.avg - points[points.length - 5].avg,
      sinceStart: last.avg - points[0].weightLb,
    };
  }

  return { daysOn, streak, dayState, monthGrid, weeklySeries, weightSummary, weekStartKey, addDaysKey };
})();

if (typeof module !== 'undefined') module.exports = Track;
