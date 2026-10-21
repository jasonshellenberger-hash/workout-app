'use strict';

/* ==========================================================================
   Adaptation rules (SPEC.md → Post-workout check-in)
   Pure functions: no DOM, no storage. app.js passes data in and saves what comes back.
   A log with checkIn: null (every Phase 1 log, or a skipped check-in) is "no rating":
   it never moves anything and is skipped by every "in a row" rule.
   ========================================================================== */
const Adapt = (() => {
  // Old (v1) check-ins rated the whole workout 1–5. Kept so History can still show them.
  const RATINGS = ['', 'Too easy', 'Easy', 'Just right', 'Hard', 'Wiped out'];
  // v2 check-ins: one chip per circuit and finisher exercise, then the overall feel.
  const ROWS = { easy: 'Easy', fine: 'Fine', hard: 'Hard', dnf: "Didn't finish" };
  const OVERALL = { good: 'Good', wiped: 'Wiped out' };
  const KNEES = ['Fine', 'Achy', 'Sore', 'Painful'];
  const REASONS = { tooHard: 'Too hard', pain: 'Pain', noTime: 'No time' };

  const SECONDS_STEP = 5;      // one "rep" of progress on a timed hold
  const COND_POINTS_MAX = 2;   // conditioning has no rep range: Easy earns a point, past 2 is the next rung
  const PAIN_WINDOW_DAYS = 28; // a 2nd pain flag on the same exercise within this window hides it
  const HIDE_DAYS = 14;
  const LADDER_BLOCKS = ['circuit', 'finisher', 'armcare'];
  const RATED_BLOCKS = ['circuit', 'finisher']; // arm care isn't rated; it moves on its own weekly schedule

  const pad2 = n => String(n).padStart(2, '0');
  function addDaysKey(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    const x = new Date(y, m - 1, d + n);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }
  function weekStartKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return addDaysKey(key, -new Date(y, m - 1, d).getDay());
  }

  /*
   * What a check-in means for the "in a row" rules and the ramp, for old and new check-ins alike.
   *   v1: Brutal (5) → wiped, Hard (4) → hard; any other rating is rated with no special effect;
   *       a null rating (nothing finished) or a null check-in is "no rating".
   *   v2: always rated; hard = any row Hard; wiped = Overall was Wiped out.
   */
  function flags(ci) {
    if (!ci) return { rated: false, hard: false, wiped: false };
    if (ci.v >= 2) {
      return { rated: true, hard: Object.values(ci.rows || {}).includes('hard'), wiped: ci.overall === 'wiped' };
    }
    const r = ci.rating;
    return { rated: !!r, hard: r === 4, wiped: r === 5 };
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

  // The rows the check-in asks about: one per circuit and finisher ladder.
  function rowEntries(log) {
    return ladderEntries(log).filter(e => RATED_BLOCKS.includes(e.block));
  }

  // Every row starts on Fine; one with skipped or unstarted sets starts on Didn't finish.
  function defaultRows(log) {
    const rows = {};
    for (const e of rowEntries(log)) rows[e.exerciseId] = e.setsDone < e.setsPlanned ? 'dnf' : 'fine';
    return rows;
  }

  /*
   * input: {
   *   log, checkIn,                 // checkIn: { v: 2, rows, reasons, overall, knees }
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

    const rows = checkIn.rows || {};
    const reasons = checkIn.reasons || {};
    const now = flags(checkIn);
    const entries = rowEntries(log).filter(e => progression[e.ladderId] && ladders[e.ladderId]);

    // 1. Didn't finish: the reason picked on that row (none picked = no change)
    for (const e of entries) {
      const reason = rows[e.exerciseId] === 'dnf' ? reasons[e.exerciseId] : null;
      if (!reason) continue;
      const prog = progression[e.ladderId];
      const ladder = ladders[e.ladderId];
      if (reason === 'tooHard') {
        push(moveRung(prog, ladder, -1, ctx), e.ladderId);
      } else if (reason === 'pain') {
        prog.pain = prog.pain || {};
        const since = addDaysKey(today, -PAIN_WINDOW_DAYS);
        const painDates = (prog.pain[e.exerciseId] || []).filter(d => d >= since);
        painDates.push(today);
        prog.pain[e.exerciseId] = painDates;
        prog.painFlags = (prog.painFlags || 0) + 1;
        changed.add(e.ladderId);
        if (painDates.length >= 2) {
          prog.hidden = prog.hidden || {};
          prog.hidden[e.exerciseId] = addDaysKey(today, HIDE_DAYS);
          prog.pain[e.exerciseId] = [];
          push({ ladderId: e.ladderId, exerciseId: e.exerciseId, change: 'hide', to: prog.hidden[e.exerciseId] });
        }
        if (ladder.lowerBody && ladder.id !== 'kneeSupport') {
          adapt.kneeSwap = [...new Set([...(adapt.kneeSwap || []), ladder.id])];
          push({ ladderId: ladder.id, exerciseId: e.exerciseId, change: 'swapKnee' });
        } else if (painDates.length < 2) {
          push(moveRung(prog, ladder, -1, ctx), e.ladderId); // safer variant
        }
      } else if (reason === 'noTime') {
        if (!adapt.shortNext) push({ change: 'short' }, '_');
        adapt.shortNext = true;
      }
    }

    // 2. The finished rows. Wiped out overrides them: −2 on each.
    const rungMoved = new Set(applied.filter(c => c.change === 'rungUp' || c.change === 'rungDown').map(c => c.ladderId));
    const rated = entries.filter(e => rows[e.exerciseId] && rows[e.exerciseId] !== 'dnf'
      && exById[e.exerciseId] && !rungMoved.has(e.ladderId));
    const step = (e, n) => push(addSteps(progression[e.ladderId], ladders[e.ladderId], exById[e.exerciseId], n, ctx), e.ladderId);
    if (now.wiped) {
      rated.forEach(e => step(e, -2));
    } else {
      rated.filter(e => rows[e.exerciseId] === 'easy').forEach(e => step(e, 1));
      // All Fine: hold, and nudge the exercise that sits lowest in its range by one step.
      if (entries.length && entries.every(e => rows[e.exerciseId] === 'fine')) {
        let best = null;
        for (const e of rated) {
          const ladder = ladders[e.ladderId];
          if (ladder.id === 'conditioning') continue;
          const t = track(ladder, exById[e.exerciseId]);
          const cur = progression[e.ladderId][t.field] ?? t.min;
          const pos = (cur - t.min) / Math.max(1, t.max - t.min);
          if (!best || pos < best.pos) best = { e, pos };
        }
        if (best) step(best.e, 1);
      }
    }

    // 3. Arm care: +1 at the first check-in of each week where every arm care set was done.
    const arm = (log.exercises || []).filter(e => e.block === 'armcare');
    const armEntry = ladderEntries(log).find(e => e.block === 'armcare');
    const armProg = progression.armCare;
    const week = weekStartKey(today);
    if (armEntry && armProg && ladders.armCare && exById[armEntry.exerciseId] && !now.wiped
        && arm.every(e => e.setsDone >= e.setsPlanned) && armProg.armCareWeek !== week) {
      armProg.armCareWeek = week;
      changed.add('armCare');
      push(addSteps(armProg, ladders.armCare, exById[armEntry.exerciseId], 1, ctx), 'armCare');
    }

    // 4. Workout-level rules, looking back past unrated logs
    const back = [...earlier].reverse();
    const prevRated = back.find(l => flags(l.checkIn).rated);
    const prevSameType = back.find(l => flags(l.checkIn).rated && l.dayType === log.dayType);
    const prevKnees = back.find(l => l.checkIn && l.checkIn.knees != null);

    if (now.wiped) {
      const restDay = addDaysKey(today, 1);
      adapt.restDates = [...new Set([...(adapt.restDates || []), restDay])];
      push({ change: 'rest', to: restDay }, '_');
      if (prevSameType && flags(prevSameType.checkIn).wiped) {
        for (const lid of input.dayTypeLadders || []) {
          if (!progression[lid] || !ladders[lid]) continue;
          if (applied.some(c => c.ladderId === lid && c.change === 'rungDown')) continue;
          push(moveRung(progression[lid], ladders[lid], -1, ctx), lid);
        }
      }
    }
    const tough = f => f.hard || f.wiped;
    if (tough(now) && prevRated && tough(flags(prevRated.checkIn))) {
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
   * Ramp from 3 to 5 days. weeks: [{ planned, done, checks: [flags] }], oldest first,
   * only weeks that started on or after the current phase began. checks: rated check-ins only.
   *   strong: 80%+ done, at least one rated check-in, no more than one Wiped out
   *   rough:  under 60% done, or 2+ Wiped out
   */
  const wipedCount = w => w.checks.filter(f => f.wiped).length;
  function weekQualifies(w) {
    if (!w.planned || !w.checks.length) return false; // unrated weeks never count
    return Math.min(w.done, w.planned) / w.planned >= 0.8 && wipedCount(w) <= 1;
  }
  function weekRough(w) {
    if (!w.planned) return false;
    return Math.min(w.done, w.planned) / w.planned < 0.6 || wipedCount(w) >= 2;
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

  return { RATINGS, ROWS, OVERALL, KNEES, REASONS, flags, applyCheckIn, rampStatus, ladderEntries, rowEntries, defaultRows, addDaysKey, track };
})();

if (typeof module !== 'undefined') module.exports = Adapt;
