'use strict';

/* ==========================================================================
   Phase 2 adaptation rules (SPEC.md → Post-workout check-in)
   Pure functions: no DOM, no storage. app.js passes data in and saves what comes back.
   A log with checkIn: null (every Phase 1 log, or a skipped check-in) is "no rating":
   it never moves anything and is skipped by every "in a row" rule.
   ========================================================================== */
const Adapt = (() => {
  const RATINGS = ['', 'Too easy', 'Easy', 'Just right', 'Hard', 'Brutal'];
  const KNEES = ['Fine', 'Achy', 'Sore', 'Painful'];
  const REASONS = { tooHard: 'Too hard', pain: 'Pain', noTime: 'No time' };

  const SECONDS_STEP = 5;      // one "rep" of progress on a timed hold
  const COND_POINTS_MAX = 2;   // conditioning has no rep range: Easy/Too easy earn points, past 2 is the next rung
  const PAIN_WINDOW_DAYS = 28; // a 2nd pain flag on the same exercise within this window hides it
  const HIDE_DAYS = 14;
  const LADDER_BLOCKS = ['circuit', 'finisher', 'armcare'];

  const pad2 = n => String(n).padStart(2, '0');
  function addDaysKey(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    const x = new Date(y, m - 1, d + n);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }

  // What "one step of progress" means for the exercise actually done.
  function track(ladder, ex) {
    if (ladder.id === 'conditioning') return { field: 'points', min: 0, max: COND_POINTS_MAX, step: 1 };
    if (ex.unit === 'seconds') {
      const r = ladder.secondsRange || { min: 30, max: 45 };
      return { field: 'secondsTarget', min: r.min, max: r.max, step: SECONDS_STEP };
    }
    const r = ladder.range || { min: 8, max: 15 };
    return { field: 'repTarget', min: r.min, max: r.max, step: 1 };
  }

  const mid = r => Math.round((r.min + r.max) / 2);

  function resetTargets(prog, ladder, where) {
    const pick = r => (where === 'min' ? r.min : mid(r));
    if (ladder.range) prog.repTarget = pick(ladder.range);
    if (ladder.secondsRange) prog.secondsTarget = pick(ladder.secondsRange);
    if (ladder.id === 'conditioning') prog.points = 0;
    prog.recentRatings = [];
  }

  // Next usable rung above (dir 1) or below (dir -1) the current one, or -1.
  function findRung(ladder, from, dir, ctx) {
    for (let i = from + dir; i >= 0 && i < ladder.rungs.length; i += dir) {
      if (ctx.usable(ladder.rungs[i])) return i;
    }
    return -1;
  }

  function moveRung(prog, ladder, dir, ctx) {
    if (ladder.id === 'armCare') return null; // arm care drills aren't harder versions of each other
    const to = findRung(ladder, prog.rungIndex, dir, ctx);
    if (to < 0) return null;
    const change = { ladderId: ladder.id, change: dir > 0 ? 'rungUp' : 'rungDown', from: ladder.rungs[prog.rungIndex].id, to: ladder.rungs[to].id };
    prog.rungIndex = to;
    resetTargets(prog, ladder, dir > 0 ? 'min' : 'mid');
    return change;
  }

  // Double progression: add to the target; past the range max, the next rung at the range min.
  function addSteps(prog, ladder, ex, steps, ctx) {
    const t = track(ladder, ex);
    const cur = prog[t.field] ?? t.min;
    const next = cur + steps * t.step;
    if (next > t.max) {
      const moved = moveRung(prog, ladder, 1, ctx);
      if (moved) return moved;
      if (cur === t.max) return null; // top of the ladder (or arm care): stay at the max
      prog[t.field] = t.max;
      return { ladderId: ladder.id, exerciseId: ex.id, change: 'target', field: t.field, from: cur, to: t.max };
    }
    const clamped = Math.max(t.min, next);
    if (clamped === cur) return null;
    prog[t.field] = clamped;
    return { ladderId: ladder.id, exerciseId: ex.id, change: 'target', field: t.field, from: cur, to: clamped };
  }

  // One entry per ladder: the exercise that stands for that ladder's progress this session.
  // Alternates (a second knee support move picked to avoid a duplicate) never count.
  function ladderEntries(log) {
    const seen = new Set();
    return (log.exercises || []).filter(e => {
      if (!e.ladderId || e.alt || !LADDER_BLOCKS.includes(e.block) || seen.has(e.ladderId)) return false;
      seen.add(e.ladderId);
      return true;
    });
  }

  function unfinishedEntries(log) {
    return ladderEntries(log).filter(e => e.setsDone < e.setsPlanned);
  }

  /*
   * input: {
   *   log, checkIn,                 // checkIn: { finishedAll, rating, reasons, knees }
   *   earlier: [log],               // logs checked in before this one, oldest first (null check-ins already removed)
   *   progression: { ladderId: rec }, adapt: {...},   // copies; this function edits them
   *   ladders, exById, usable(ex),
   *   dayTypeLadders: [ladderId],   // circuit ladders of this log's day type
   * }
   * returns { progression, adapt, applied, changed: Set<ladderId> }
   */
  function applyCheckIn(input) {
    const { log, checkIn, earlier, progression, adapt, ladders, exById } = input;
    const ctx = { usable: input.usable };
    const applied = [];
    const changed = new Set();
    const today = log.date;
    const push = (c, ladderId) => { if (c) { applied.push(c); changed.add(ladderId || c.ladderId); } };

    const entries = ladderEntries(log).filter(e => progression[e.ladderId] && ladders[e.ladderId]);
    const reasons = checkIn.finishedAll ? {} : (checkIn.reasons || {});
    const unfinishedIds = new Set(checkIn.finishedAll ? [] : unfinishedEntries(log).map(e => e.exerciseId));

    // 1. Reasons for unfinished exercises
    for (const e of entries) {
      const reason = reasons[e.exerciseId];
      if (!reason) continue;
      const prog = progression[e.ladderId];
      const ladder = ladders[e.ladderId];
      if (reason === 'tooHard') {
        push(moveRung(prog, ladder, -1, ctx), e.ladderId);
      } else if (reason === 'pain') {
        prog.pain = prog.pain || {};
        const since = addDaysKey(today, -PAIN_WINDOW_DAYS);
        const flags = (prog.pain[e.exerciseId] || []).filter(d => d >= since);
        flags.push(today);
        prog.pain[e.exerciseId] = flags;
        prog.painFlags = (prog.painFlags || 0) + 1;
        changed.add(e.ladderId);
        if (flags.length >= 2) {
          prog.hidden = prog.hidden || {};
          prog.hidden[e.exerciseId] = addDaysKey(today, HIDE_DAYS);
          prog.pain[e.exerciseId] = [];
          push({ ladderId: e.ladderId, exerciseId: e.exerciseId, change: 'hide', to: prog.hidden[e.exerciseId] });
        }
        if (ladder.lowerBody && ladder.id !== 'kneeSupport') {
          adapt.kneeSwap = [...new Set([...(adapt.kneeSwap || []), ladder.id])];
          push({ ladderId: ladder.id, exerciseId: e.exerciseId, change: 'swapKnee' });
        } else if (flags.length < 2) {
          push(moveRung(prog, ladder, -1, ctx), e.ladderId); // safer variant
        }
      } else if (reason === 'noTime') {
        if (!adapt.shortNext) push({ change: 'short' }, '_');
        adapt.shortNext = true;
      }
    }

    // 2. The difficulty rating, for every exercise that was finished
    const r = checkIn.rating;
    if (r) {
      const rated = entries.filter(e => !unfinishedIds.has(e.exerciseId) && !reasons[e.exerciseId]);
      const rungMoved = new Set(applied.filter(c => c.change === 'rungUp' || c.change === 'rungDown').map(c => c.ladderId));
      for (const e of rated) {
        const prog = progression[e.ladderId];
        const ladder = ladders[e.ladderId];
        const ex = exById[e.exerciseId];
        if (!ex || rungMoved.has(e.ladderId)) continue;
        prog.recentRatings = [...(prog.recentRatings || []), { date: today, rating: r, exerciseId: e.exerciseId }].slice(-5);
        changed.add(e.ladderId);
        if (r === 1) {
          const [a, b] = prog.recentRatings.slice(-2);
          const twice = a && b && a.rating === 1 && b.rating === 1 && a.exerciseId === b.exerciseId && a !== b;
          push((twice && moveRung(prog, ladder, 1, ctx)) || addSteps(prog, ladder, ex, 2, ctx), e.ladderId);
        } else if (r === 2) {
          push(addSteps(prog, ladder, ex, 1, ctx), e.ladderId);
        } else if (r === 5) {
          push(addSteps(prog, ladder, ex, -2, ctx), e.ladderId);
        }
      }
      if (r === 3) {
        // Hold, and nudge the exercise that sits lowest in its range by one step.
        let best = null;
        for (const e of rated) {
          const ladder = ladders[e.ladderId];
          const ex = exById[e.exerciseId];
          if (!ex || ladder.id === 'conditioning' || rungMoved.has(e.ladderId)) continue;
          const t = track(ladder, ex);
          const prog = progression[e.ladderId];
          const cur = prog[t.field] ?? t.min;
          if (ladder.id === 'armCare' && cur >= t.max) continue;
          const pos = (cur - t.min) / Math.max(1, t.max - t.min);
          if (!best || pos < best.pos) best = { e, ladder, ex, pos };
        }
        if (best) push(addSteps(progression[best.e.ladderId], best.ladder, best.ex, 1, ctx), best.e.ladderId);
      }
    }

    // 3. Workout-level rules, looking back past unrated logs
    const prevRated = [...earlier].reverse().find(l => l.checkIn?.rating);
    const prevSameType = [...earlier].reverse().find(l => l.checkIn?.rating && l.dayType === log.dayType);
    const prevKnees = [...earlier].reverse().find(l => l.checkIn && l.checkIn.knees != null);

    if (r === 5) {
      const restDay = addDaysKey(today, 1);
      adapt.restDates = [...new Set([...(adapt.restDates || []), restDay])];
      push({ change: 'rest', to: restDay }, '_');
      if (prevSameType?.checkIn.rating === 5) {
        for (const lid of input.dayTypeLadders || []) {
          if (!progression[lid] || !ladders[lid]) continue;
          if (applied.some(c => c.ladderId === lid && c.change === 'rungDown')) continue;
          push(moveRung(progression[lid], ladders[lid], -1, ctx), lid);
        }
      }
    }
    if (r >= 4 && prevRated?.checkIn.rating >= 4) {
      adapt.lightNext = true;
      push({ change: 'light' }, '_');
    }
    if (checkIn.knees >= 2 && prevKnees?.checkIn.knees >= 2) {
      adapt.lightLegsNext = true;
      push({ change: 'lightLegs' }, '_');
    }

    changed.delete('_');
    return { progression, adapt, applied, changed };
  }

  /*
   * Ramp from 3 to 5 days. weeks: [{ planned, done, ratings: [1-5] }], oldest first,
   * only weeks that started on or after the current phase began.
   */
  function weekQualifies(w) {
    if (!w.planned || !w.ratings.length) return false; // unrated weeks never count
    const avg = w.ratings.reduce((a, b) => a + b, 0) / w.ratings.length;
    return Math.min(w.done, w.planned) / w.planned >= 0.8 && avg <= 3;
  }
  function weekRough(w) {
    if (!w.planned) return false;
    const avg = w.ratings.length ? w.ratings.reduce((a, b) => a + b, 0) / w.ratings.length : 0;
    return Math.min(w.done, w.planned) / w.planned < 0.6 || avg >= 4;
  }
  function trailing(weeks, test) {
    let n = 0;
    for (let i = weeks.length - 1; i >= 0 && test(weeks[i]); i--) n++;
    return n;
  }
  function rampStatus(weeks, phase) {
    const earned = trailing(weeks, weekQualifies);
    const rough = trailing(weeks, weekRough);
    let offer = null;
    if (phase < 3 && earned >= 2) offer = 'up';
    else if (phase === 3 && rough >= 2) offer = 'down';
    return { earned: Math.min(earned, 2), rough: Math.min(rough, 2), offer };
  }

  return { RATINGS, KNEES, REASONS, applyCheckIn, rampStatus, ladderEntries, unfinishedEntries, addDaysKey, track };
})();

if (typeof module !== 'undefined') module.exports = Adapt;
