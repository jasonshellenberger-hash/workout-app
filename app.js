'use strict';

/* ==========================================================================
   Workout PWA, Phase 5a (habits)
   Plan generator · workout player · logging · check-in · progression · weigh-ins · calendar · streak
   · short-on-time · soreness check · backup and import
   · 5-minute minimum · skip tax · wife notice · reward bank · weekly scorecard
   The adaptation rules live in adapt.js; streak, calendar, and weight math in track.js;
   skip tax, points, and scorecard math in habits.js.
   ========================================================================== */

const APP_VERSION = '6.0.0';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SATURDAY = 6;

const ACCENTS = [
  { id: 'orange', name: 'Orange', color: '#FF8A3D' },
  { id: 'blue', name: 'Electric blue', color: '#4C9DFF' },
  { id: 'teal', name: 'Teal', color: '#2EC4C4' },
  { id: 'violet', name: 'Violet', color: '#9B7BFF' },
];

const DEFAULT_SETTINGS = {
  key: 'app',
  schemaVersion: 6,
  equipment: ['db5', 'db10', 'db20', 'trx', 'jband', 'loopband', 'medball6', 'chair', 'bodyweight'],
  quietMode: true,            // always on; shown locked in Settings
  workoutDays: [1, 3, 5],     // Mon / Wed / Fri
  finisherDays: [1, 5],       // Mon / Fri (work-from-home days)
  phase: 1,                   // training phase 1–3: 3, 4, then 5 days a week
  accent: 'orange',
  sound: true,
  flash: true,
  flashStrength: 'bold',      // 'bold' | 'subtle'
  includeStretch: false,
  weighInPrompt: true,        // ask once each Sunday
  weighInSkipped: null,       // the Sunday it was skipped
  sorenessPrompt: true,       // "Sore this morning?" on workout days, before you start
  lastBackup: null,           // date of the last export (Back up now)
  backupSkipped: null,        // the Sunday "Not now" was tapped on the backup card
  restBetweenRoundsSec: 60,
  transitionSec: 15,
  // Phase 5a habits
  skipTax: true,              // $ per unexcused missed workout, on the Today "You owe" card
  skipTaxAmount: 5,
  excuseLimit: 2,             // free excused skips (sick, travel) per calendar month
  notice: true,               // a pre-filled text when the ledger crosses the threshold
  noticeName: '',
  noticePhone: '',
  noticeThreshold: 20,
  noticeMessage: "Jason's workout IOU just hit {amount}. Time to collect.",
  rewardsOn: true,
  scorecard: true,            // Sunday weekly scorecard on Today
  scorecardSeen: null,        // the Sunday "Got it" was tapped
  // Phase 5b food and desk
  proteinTarget: 150,         // g a day
  lunchPrompt: true,          // "What's lunch tomorrow?" in the evening
  lunchPromptHour: 20,        // asks when the app is opened at or after this hour
  lunchPromptSince: null,     // the 4-week trial started (set on first run, or when turned back on)
  lunchReviewed: false,       // the 4-week "Keep the lunch plan prompt?" was answered
  lunchAsked: null,           // the evening the prompt was answered or skipped
  goToLunches: [
    { id: 'g1', name: 'Salad from home' },
    { id: 'g2', name: 'Leftovers' },
    { id: 'g3', name: 'Cafeteria grill plate' },
  ],
  fastFood: [],               // [{ id, name, order }]: the better order for each place
  mealTax: true,              // $ per Miss meal, on the same ledger as the skip tax
  mealTaxAmount: 2,
  deskBreaks: true,           // up to 3 a workday, Mon–Fri
  standGoal: true,            // "Stood 2+ hours" check-off, Mon–Fri
};

// Skip tax state. Owed is worked out from history (Habits.ledger); only payments and excuses are stored.
const DEFAULT_LEDGER = {
  key: 'ledger',
  since: null,          // first day that can be taxed: the day Phase 5a was installed, or the tax turned back on
  payments: [],         // [{ date, amount }]
  excused: [],          // [{ date, reason: 'sick' | 'travel' }]: never a miss, never taxed
  noticesSent: 0,       // notices sent since the last payoff
  noticeOpen: false,    // Messages was opened; waiting for "Sent it"
};

// Reward bank. Points are worked out from logs (Habits.bank); rewards and cash-ins are stored.
const DEFAULT_BANK = {
  key: 'bank',
  since: null,          // points count from the day Phase 5a was installed
  rewards: [],          // [{ id, name, cost }]
  redemptions: [],      // [{ date, at, rewardId, name, cost }]
};

const POINTS_FULL = 10;      // a finished workout
const POINTS_SMALL = 5;      // a 5-minute workout, a mobility day, or a partial with circuit sets
const MINIMUM_CAP_SEC = 5 * 60;
const EXCUSE_TEXT = { sick: 'Sick', travel: 'Travel' };
const POINTS_WIN_MEAL = 5;
const POINTS_DESK = 2;
const DESK_MAX = 3;          // desk breaks a workday
const MAX_GO_TO = 6;         // go-to lunches
const MEAL_TEXT = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const RATING_TEXT = { win: 'Win', ok: 'OK', miss: 'Miss' };
// Office-friendly, no equipment, no sweat (SPEC.md → Workday movement)
const DESK_MOVES = [
  ['Calf raises', '20 slow reps, pause at the top'],
  ['Squats to the chair', '10–15, sit back until you touch, stand without your hands'],
  ['Desk push-ups', '10–15, hands on the desk edge, body in one line'],
  ['Standing hip flexor stretch', '30 s a side, squeeze the back glute'],
  ['Doorway chest stretch', '30 s, elbows at shoulder height'],
  ['Shoulder rolls', '10 back, 10 forward, slow'],
];

// Starting rung and target per ladder, from SPEC.md → Starting assessment.
// Phase 2 moves these with the check-in; Phase 1 only reads them.
const START_PROGRESSION = {
  push:         { rungIndex: 1, repTarget: 12 },                     // Push-up
  chestFly:     { rungIndex: 0, repTarget: 12 },                     // Band chest fly
  pull:         { rungIndex: 1, repTarget: 10 },                     // TRX row, moderate angle
  squat:        { rungIndex: 1, repTarget: 12 },                     // Goblet box squat
  hinge:        { rungIndex: 0, repTarget: 12 },                     // Glute bridge
  kneeSupport:  { rungIndex: 0, repTarget: 15, secondsTarget: 30 },  // Band TKE
  core:         { rungIndex: 0, repTarget: 10, secondsTarget: 30 },  // Dead bug
  conditioning: { rungIndex: 0, secondsTarget: 30 },                 // Squat to press
  armCare:      { rungIndex: 0, repTarget: 12, secondsTarget: 30 },  // J-band routine
};

// Training phase 1: every workout day is Full Body, A and B alternating.
// Phases 2–3 rotate Upper → Lower → Full Body + Conditioning, so back-to-back days never repeat a type.
// Every day type includes a push movement (chest every session).
const ARM_CARE_A = ['band-er-ir', 'jband-reverse-fly', 'prone-ytw'];
const ARM_CARE_B = ['band-er-ir', 'jband-reverse-fly', 'scap-pushup'];
const DAY_TYPES = {
  fullA: { name: 'Full Body A', circuit: ['push', 'squat', 'pull', 'core'], armCare: ARM_CARE_A },
  fullB: { name: 'Full Body B', circuit: ['push', 'hinge', 'pull', 'chestFly'], armCare: ARM_CARE_B },
  upper: { name: 'Upper Body', circuit: ['push', 'chestFly', 'pull', 'core'], armCare: ARM_CARE_A },
  lower: { name: 'Lower Body', circuit: ['squat', 'hinge', 'kneeSupport', 'push'], armCare: ARM_CARE_B },
  fullC: { name: 'Full Body + Conditioning', circuit: ['push', 'squat', 'pull', 'core'], armCare: ARM_CARE_B, alwaysFinisher: true },
};
const ROTATION = ['upper', 'lower', 'fullC'];

// SPEC.md → Equipment and schedule: the 3 → 5 day ramp.
const PHASE_DAYS = { 1: [1, 3, 5], 2: [0, 1, 3, 5], 3: [0, 1, 3, 4, 5] };

// One-time changes the check-in queues for the next workout, plus ramp state.
const DEFAULT_ADAPT = {
  key: 'adapt',
  shortNext: false,     // "No time" → drop one circuit exercise and the finisher
  lightNext: false,     // 2 Hard/Wiped out in a row → −2 reps, no finisher
  lightLegsNext: false, // knees 2+ twice → −2 reps on leg moves
  kneeSwap: [],         // lower-body ladders to swap for Knee support next time
  restDates: [],        // rest days added after a Wiped out session
  soreDates: [],        // "Very sore" mornings: mobility + arm care instead, never a miss
  phaseSince: null,     // when the current training phase started; earlier weeks never count toward the ramp
  rampDismissed: null,  // week start of the last "Not yet"
};

// Session length caps. Rounds drop from 3 to 2 to fit; nothing is ever padded.
const CAP_STANDARD_SEC = 18 * 60;
const CAP_FINISHER_SEC = 22 * 60;
const SHORT_CAP_SEC = 10 * 60;   // Short on time
const BACKUP_STALE_DAYS = 14;    // the backup prompt and "Last backup" turn amber after this
const MIN_ROUNDS = 2;
const MAX_ROUNDS = 3;

const ICONS = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  zap: '<svg viewBox="0 0 24 24"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  volume: '<svg viewBox="0 0 24 24"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.7"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  levelUp: '<svg viewBox="0 0 24 24"><path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  coins: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
  utensils: '<svg viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
};

/* ---------- App state ---------- */
const S = {
  ex: null,          // exercises.json
  exById: {},        // exerciseId → { ...exercise, ladderId, rungIndex }
  ladders: {},       // ladderId → ladder
  settings: null,
  progression: {},   // ladderId → progression record
  adapt: null,       // DEFAULT_ADAPT shape, stored in settings under 'adapt'
  ledger: null,      // DEFAULT_LEDGER shape, stored in settings under 'ledger'
  bank: null,        // DEFAULT_BANK shape, stored in settings under 'bank'
  lastLog: null,     // the log the completion screen is showing
  schedule: null,    // { periods: [{ from, days }] }: which workout days were in effect when
  calMonth: null,    // History calendar: { y, m } shown
  calSel: null,      // History calendar: selected day
  tab: 'today',
  todayKey: null,
};

/* ==========================================================================
   Utilities
   ========================================================================== */
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekStart(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -x.getDay()); }
function fmtLongDate(d) { return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtShortDate(d) { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmtMinutes(sec) { return `${Math.max(1, Math.round(sec / 60))} min`; }
function daysSince(key) { return Math.round((parseKey(dateKey()) - parseKey(key)) / 86400000); }
function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); return sec >= 60 ? `${Math.floor(sec / 60)}:${pad2(sec % 60)}` : String(sec); }

function workoutDays() { return (S.settings.workoutDays || []).filter(d => d !== SATURDAY).sort(); }
function isWorkoutDay(dow) { return workoutDays().includes(dow); }
// A rest day added after a Wiped out session.
function isForcedRest(dKey) { return (S.adapt?.restDates || []).includes(dKey); }
// A "Very sore" morning: the day turns into mobility + arm care and stops being a planned workout day.
function isSoreDay(dKey) { return (S.adapt?.soreDates || []).includes(dKey); }
// An excused skip (sick, travel): not a planned day, so never a miss for the streak, the week, or the tax.
function excuseFor(dKey) { return (S.ledger?.excused || []).find(x => x.date === dKey) || null; }
// Past days use the workout days in effect then, so changing your days never rewrites history.
function isPlannedDay(dKey) {
  const dow = parseKey(dKey).getDay();
  const days = !S.schedule || dKey >= dateKey() ? workoutDays() : Track.daysOn(S.schedule.periods, dKey);
  return dow !== SATURDAY && days.includes(dow) && !isForcedRest(dKey) && !isSoreDay(dKey) && !excuseFor(dKey);
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function actionSheet({ title, actions }) {
  return new Promise(resolve => {
    const root = $('#sheet-root');
    $('#toast').classList.remove('show'); // a leftover toast would sit on top of the sheet
    root.innerHTML = `
      <div class="sheet-backdrop" data-v="__cancel"></div>
      <div class="sheet">
        <div class="sheet-group">
          ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
          ${actions.map(a => `<button class="sheet-btn ${a.destructive ? 'destructive' : ''}" data-v="${esc(a.value)}">${esc(a.label)}</button>`).join('')}
        </div>
        <button class="sheet-btn cancel" data-v="__cancel">Cancel</button>
      </div>`;
    root.hidden = false;
    root.onclick = e => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (!v) return;
      root.hidden = true;
      root.innerHTML = '';
      resolve(v === '__cancel' ? null : v);
    };
  });
}

/* ==========================================================================
   Exercise library
   ========================================================================== */
async function loadExercises() {
  const res = await fetch('exercises.json');
  S.ex = await res.json();
  for (const ladder of S.ex.ladders) {
    S.ladders[ladder.id] = ladder;
    ladder.rungs.forEach((r, i) => { S.exById[r.id] = { ...r, ladderId: ladder.id, rungIndex: i }; });
  }
  for (const w of S.ex.warmup) S.exById[w.id] = { ...w, ladderId: null };
  for (const s of S.ex.stretch) S.exById[s.id] = { ...s, ladderId: null };
}

// "db10|db20" means either one is enough. Quiet mode only allows quiet moves.
function usable(ex) {
  const owned = new Set(S.settings.equipment);
  owned.add('bodyweight');
  const hasGear = (ex.equipment || []).every(req => req.split('|').some(e => owned.has(e)));
  return hasGear && (!S.settings.quietMode || ex.quiet === true);
}

function isHidden(ladderId, exId, today) {
  const until = S.progression[ladderId]?.hidden?.[exId];
  return !!until && until > today;
}

// A different usable rung than `avoid` (easier first), for a second move from the same ladder.
function altRung(ladderId, avoid, today) {
  const ladder = S.ladders[ladderId];
  const ok = i => i !== avoid && usable(ladder.rungs[i]) && !isHidden(ladderId, ladder.rungs[i].id, today);
  for (let i = avoid - 1; i >= 0; i--) if (ok(i)) return i;
  for (let i = avoid + 1; i < ladder.rungs.length; i++) if (ok(i)) return i;
  return -1;
}

// Current rung if usable; otherwise the nearest easier rung, then the nearest harder one.
function pickRung(ladderId, today) {
  const ladder = S.ladders[ladderId];
  const start = S.progression[ladderId]?.rungIndex ?? 0;
  const ok = i => usable(ladder.rungs[i]) && !isHidden(ladderId, ladder.rungs[i].id, today);
  for (let i = start; i >= 0; i--) if (ok(i)) return i;
  for (let i = start + 1; i < ladder.rungs.length; i++) if (ok(i)) return i;
  return -1;
}

function itemFor(ex, prog) {
  const ladder = ex.ladderId ? S.ladders[ex.ladderId] : null;
  const item = { exerciseId: ex.id, ladderId: ex.ladderId || null, rungIndex: ex.ladderId ? ex.rungIndex : null, unit: ex.unit, perSide: !!ex.perSide };
  if (ex.unit === 'seconds') {
    item.seconds = ex.seconds ?? prog?.secondsTarget ?? ladder?.secondsRange?.min ?? ladder?.intervalOn ?? 30;
  } else {
    const range = ladder?.range || { min: 8, max: 15 };
    item.reps = Math.min(range.max, Math.max(range.min, prog?.repTarget ?? range.min));
  }
  return item;
}

/* ==========================================================================
   Plan generator
   ========================================================================== */
async function nextDayType(beforeDate) {
  const logs = await DB.getAll('logs');
  // Any workout with circuit sets done moves the rotation along, including one ended early.
  const last = logs
    .filter(l => countsAsWorkout(l) && l.date < beforeDate)
    .sort((a, b) => (a.finishedAt || '').localeCompare(b.finishedAt || ''))
    .pop();
  if ((S.settings.phase || 1) === 1) return last?.dayType === 'fullA' ? 'fullB' : 'fullA';
  return ROTATION[(ROTATION.indexOf(last?.dayType) + 1) % ROTATION.length];
}

const lowerBody = item => !!S.ladders[item.ladderId]?.lowerBody;
function lighten(item) {
  if (item.unit === 'seconds') item.seconds = Math.max(15, item.seconds - 10);
  else item.reps = Math.max(5, item.reps - 2);
}

// persist: false (Practice) builds the plan in memory: nothing stored, no one-time changes used up.
async function generateWorkout(dKey, { scheduled = true, persist = true } = {}) {
  const date = parseKey(dKey);
  const dow = date.getDay();
  const dayType = await nextDayType(dKey);
  const tpl = DAY_TYPES[dayType];
  const st = S.settings;

  const blocks = [];

  blocks.push({
    kind: 'warmup', label: 'Warm-up', rounds: 1, restSec: 10,
    items: S.ex.warmup.filter(usable).map(w => itemFor(w)),
  });

  // One-time changes from the last check-ins
  const ad = S.adapt;
  const mods = { short: !!ad.shortNext, light: !!ad.lightNext, lightLegs: false, kneeSwap: [] };
  const notes = [];

  // A pain flag on a lower-body move swaps that slot for Knee support. If the day already has
  // Knee support, the swapped slot gets a different rung, marked alt so it doesn't count for progress.
  const native = new Set(tpl.circuit);
  const circuitItems = tpl.circuit.map(lid => {
    const swap = (ad.kneeSwap || []).includes(lid) && !!S.ladders.kneeSupport;
    const useLid = swap ? 'kneeSupport' : lid;
    let idx = pickRung(useLid, dKey);
    const alt = swap && native.has('kneeSupport');
    if (alt && idx >= 0) idx = altRung(useLid, idx, dKey);
    if (idx < 0) return null;
    const item = itemFor(S.exById[S.ladders[useLid].rungs[idx].id], S.progression[useLid]);
    if (swap) {
      item.swappedFrom = lid;
      mods.kneeSwap.push(lid);
      notes.push(`Knee support in place of ${S.ladders[lid].pattern.toLowerCase()} after a pain flag`);
    }
    if (alt) item.alt = true;
    return item;
  }).filter(Boolean);

  // "No time": drop the last circuit exercise that isn't the push (chest stays every session).
  if (mods.short && circuitItems.length > 2) {
    let drop = -1;
    circuitItems.forEach((it, i) => { if (it.ladderId !== 'push') drop = i; });
    if (drop >= 0) circuitItems.splice(drop, 1);
    notes.push('Shorter today: one less exercise and no finisher');
  }
  const legsDay = circuitItems.some(lowerBody);
  if (mods.light) {
    circuitItems.forEach(lighten);
    notes.push('Lighter today after two hard sessions');
  } else if (ad.lightLegsNext && legsDay) {
    circuitItems.filter(lowerBody).forEach(lighten);
    notes.push('Easier on the legs after sore knees');
  }
  mods.lightLegs = !!ad.lightLegsNext && legsDay; // a lighter session covers the legs too
  const circuit = {
    kind: 'circuit', label: 'Main', rounds: MAX_ROUNDS,
    restSec: st.transitionSec, restBetweenRoundsSec: st.restBetweenRoundsSec,
    items: circuitItems,
  };
  blocks.push(circuit);

  const hasFinisher = (tpl.alwaysFinisher || (st.finisherDays || []).includes(dow)) && !mods.short && !mods.light;
  if (hasFinisher) {
    const idx = pickRung('conditioning', dKey);
    if (idx >= 0) {
      const ladder = S.ladders.conditioning;
      const ex = S.exById[ladder.rungs[idx].id];
      blocks.push({
        kind: 'finisher', label: 'Finisher', rounds: 3, restSec: 0,
        restBetweenRoundsSec: ladder.intervalOff,
        items: [itemFor(ex, S.progression.conditioning)],
      });
    }
  }

  blocks.push({
    kind: 'armcare', label: 'Arm care', rounds: 1, restSec: 10,
    items: tpl.armCare.map(id => S.exById[id]).filter(ex => ex && usable(ex)).map(ex => itemFor(ex, S.progression.armCare)),
  });

  blocks.push({
    kind: 'stretch', label: 'Stretch', optional: true, rounds: 1, restSec: 5,
    items: S.ex.stretch.filter(usable).map(s => itemFor(s)),
  });

  // Fit the cap by dropping rounds (never below 2). Short sessions are fine.
  const cap = hasFinisher ? CAP_FINISHER_SEC : CAP_STANDARD_SEC;
  const draft = { blocks };
  while (circuit.rounds > MIN_ROUNDS && estimateSec(draft, false) > cap) circuit.rounds--;

  const workout = {
    id: dKey,
    date: dKey,
    dayOfWeek: dow,
    dayType,
    name: tpl.name,
    scheduled,
    hasFinisher: blocks.some(b => b.kind === 'finisher'),
    blocks: blocks.filter(b => b.items.length),
    mods,
    notes,
    createdAt: new Date().toISOString(),
  };
  workout.estSec = estimateSec(workout, false);
  workout.estStretchSec = estimateSec({ blocks: workout.blocks.filter(b => b.kind === 'stretch') }, true, true);
  if (!persist) return workout;
  // Used up: these applied to this workout. invalidateTodayPlan puts them back if the plan is rebuilt.
  S.adapt.shortNext = false;
  S.adapt.lightNext = false;
  if (mods.lightLegs) S.adapt.lightLegsNext = false;
  S.adapt.kneeSwap = (S.adapt.kneeSwap || []).filter(l => !mods.kneeSwap.includes(l));
  await saveAdapt();
  await DB.put('workouts', workout);
  return workout;
}

/*
 * Short on time: a 10-minute version of a plan. 2 warm-up moves, the circuit at 2 rounds with at most
 * 3 exercises (the push always stays), no finisher or stretch, 2 arm care drills. More circuit
 * exercises drop (never below 2) until it fits. The full plan is kept so you can switch back.
 */
function shortVersion(w) {
  const pick = (kind, n) => { const b = w.blocks.find(x => x.kind === kind); return b && { ...b, items: b.items.slice(0, n) }; };
  const src = w.blocks.find(b => b.kind === 'circuit');
  const circuit = src && { ...src, rounds: MIN_ROUNDS, items: [...src.items] };
  const blocks = [pick('warmup', 2), circuit, pick('armcare', 2)].filter(b => b && b.items.length);
  const draft = { blocks };
  const dropOne = () => {
    let i = -1;
    circuit.items.forEach((it, j) => { if (it.ladderId !== 'push') i = j; });
    if (i >= 0) circuit.items.splice(i, 1);
    return i >= 0;
  };
  while (circuit && circuit.items.length > 3 && dropOne());
  while (circuit && circuit.items.length > 2 && estimateSec(draft, false) > SHORT_CAP_SEC && dropOne());
  return {
    ...w, blocks, short: true, hasFinisher: false,
    full: { blocks: w.blocks, estSec: w.estSec, estStretchSec: w.estStretchSec, hasFinisher: w.hasFinisher, notes: w.notes },
    estSec: estimateSec(draft, false), estStretchSec: 0,
    notes: [...(w.notes || []), '10-minute version'],
  };
}

function fullVersion(w) {
  const { full, short, minimum, ...rest } = w;
  return full ? { ...rest, ...full } : rest;
}

/*
 * "Just show up": a quiet 5-minute version of a plan. 2 warm-up moves, 1 round of the push plus one more
 * circuit move, and 1 arm care drill, trimmed until it fits. It counts for the streak, but never asks for a
 * check-in or changes progression (countsAsWorkout leaves out kind 'minimum').
 * Pure: the caller gives the plan's one-time changes back (toMinimum), since this isn't the next real workout.
 */
function minimumVersion(w) {
  const pick = (kind, n) => { const b = w.blocks.find(x => x.kind === kind); return b && { ...b, items: b.items.slice(0, n) }; };
  const src = w.blocks.find(b => b.kind === 'circuit');
  const push = src?.items.find(it => it.ladderId === 'push');
  const other = src?.items.find(it => it !== push);
  const circuit = src && { ...src, rounds: 1, items: [push, other].filter(Boolean) };
  const warmup = pick('warmup', 2);
  const blocks = [warmup, circuit, pick('armcare', 1)].filter(b => b && b.items.length);
  const draft = { blocks };
  if (warmup && estimateSec(draft, false) > MINIMUM_CAP_SEC) warmup.items = warmup.items.slice(0, 1);
  if (circuit && circuit.items.length > 1 && estimateSec(draft, false) > MINIMUM_CAP_SEC) circuit.items = circuit.items.slice(0, 1);
  const { full, short, ...base } = w;
  return {
    ...base, blocks: blocks.filter(b => b.items.length), minimum: true, hasFinisher: false, mods: {},
    full: { ...(full || { blocks: w.blocks, estSec: w.estSec, estStretchSec: w.estStretchSec, hasFinisher: w.hasFinisher, notes: w.notes }), mods: full?.mods || w.mods },
    estSec: estimateSec(draft, false), estStretchSec: 0,
    notes: ['Just show up: 5 minutes still counts for the streak'],
  };
}

// Switch a plan to the 5-minute version. Its one-time changes (lighter, shorter, knee swap) carry over.
async function toMinimum(w) {
  await giveBackMods(w);
  return minimumVersion(w);
}

// Back to the full plan from the 5-minute version: it uses its one-time changes up again.
async function fromMinimum(w) {
  const m = w.full?.mods;
  if (m) {
    if (m.short) S.adapt.shortNext = false;
    if (m.light) S.adapt.lightNext = false;
    if (m.lightLegs) S.adapt.lightLegsNext = false;
    S.adapt.kneeSwap = (S.adapt.kneeSwap || []).filter(l => !(m.kneeSwap || []).includes(l));
    await saveAdapt();
  }
  return fullVersion(w);
}

// "Very sore": warm-up, arm care and the stretch, about 10 minutes. No circuit, so it never asks
// for a check-in, moves the rotation, or counts toward the week or the ramp. Done, it counts for the streak.
function mobilityVersion(w) {
  const block = kind => w.blocks.find(b => b.kind === kind);
  const stretch = block('stretch');
  const blocks = [block('warmup'), block('armcare'), stretch && { ...stretch, optional: false }].filter(b => b && b.items.length);
  const m = {
    id: w.id, date: w.date, dayOfWeek: w.dayOfWeek, dayType: 'mobility', name: 'Mobility + arm care',
    scheduled: w.scheduled, mobility: true, soreness: 'very', hasFinisher: false, blocks, mods: {},
    notes: ['Very sore this morning, so today is mobility and arm care'],
    createdAt: new Date().toISOString(),
  };
  m.estSec = estimateSec(m, false);
  m.estStretchSec = 0;
  return m;
}

// Put back the one-time changes a plan used, so the next plan built gets them.
async function giveBackMods(workout) {
  const m = workout?.mods;
  if (!m) return;
  S.adapt.shortNext ||= !!m.short;
  S.adapt.lightNext ||= !!m.light;
  S.adapt.lightLegsNext ||= !!m.lightLegs;
  S.adapt.kneeSwap = [...new Set([...(S.adapt.kneeSwap || []), ...(m.kneeSwap || [])])];
  await saveAdapt();
}

async function getWorkout(dKey) {
  const w = await DB.get('workouts', dKey);
  if (w) return w;
  if (isPlannedDay(dKey)) return generateWorkout(dKey);
  return null;
}

/* ---------- Steps: the flattened sequence the player walks through ---------- */
function workSeconds(item) {
  const ex = S.exById[item.exerciseId];
  if (item.unit === 'seconds') return item.seconds;
  const perRep = ex?.secPerRep || 3;
  return item.reps * perRep * (item.perSide ? 2 : 1) + 5; // +5 s to get set up
}

function buildSteps(workout, includeStretch, onlyStretch = false) {
  const steps = [];
  const addRest = (seconds, label) => {
    if (!seconds) return;
    const last = steps[steps.length - 1];
    if (!last) return;
    if (last.type === 'rest') { if (seconds > last.seconds) { last.seconds = seconds; last.label = label; } return; }
    steps.push({ type: 'rest', seconds, label });
  };

  steps.push({ type: 'rest', seconds: 10, label: 'Get ready' });

  const blocks = workout.blocks.filter(b => onlyStretch ? b.kind === 'stretch' : (!b.optional || includeStretch));
  blocks.forEach((block, bi) => {
    if (bi > 0) addRest(Math.max(S.settings.transitionSec, 10), 'Get ready');
    for (let r = 1; r <= block.rounds; r++) {
      if (r > 1) addRest(block.restBetweenRoundsSec || 30, block.kind === 'finisher' ? 'Rest · 30s off' : `Round ${r} next`);
      block.items.forEach((item, ii) => {
        if (ii > 0) addRest(block.restSec, block.kind === 'circuit' ? 'Rest' : 'Next');
        const setKey = `${bi}:${r}:${ii}`;
        const base = { type: 'work', block: block.kind, blockLabel: block.label, round: r, rounds: block.rounds, item, setKey };
        if (item.unit === 'seconds' && item.perSide) {
          steps.push({ ...base, side: 'Left side', seconds: item.seconds });
          steps.push({ type: 'rest', seconds: 5, label: 'Switch sides' });
          steps.push({ ...base, side: 'Right side', seconds: item.seconds });
        } else if (item.unit === 'seconds') {
          steps.push({ ...base, seconds: item.seconds });
        } else {
          steps.push({ ...base, seconds: null, estSec: workSeconds(item) });
        }
      });
    }
  });
  return steps;
}

function estimateSec(workout, includeStretch, onlyStretch = false) {
  return buildSteps(workout, includeStretch, onlyStretch)
    .reduce((sum, s) => sum + (s.type === 'rest' ? s.seconds : (s.seconds ?? s.estSec)), 0);
}

function targetText(item, short = false) {
  if (item.unit === 'seconds') return item.perSide ? `${item.seconds}s / side` : `${item.seconds}s`;
  return item.perSide ? `${item.reps} / side` : `${item.reps}${short ? '' : ' reps'}`;
}

/* ==========================================================================
   Storage helpers
   ========================================================================== */
async function loadSettings() {
  const saved = await DB.get('settings', 'app');
  S.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  S.settings.workoutDays = (S.settings.workoutDays || []).filter(d => d !== SATURDAY);
  S.settings.quietMode = true;
  if (!saved || (saved.schemaVersion || 1) < DEFAULT_SETTINGS.schemaVersion) {
    S.settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion; // 1 → 2 → 3: new defaults merged in above
    await DB.put('settings', S.settings);
  }
}

async function loadAdapt() {
  const saved = await DB.get('settings', 'adapt');
  S.adapt = { ...DEFAULT_ADAPT, ...(saved || {}) };
  // Weeks before Phase 2 was installed only have unrated logs, so they never count toward the ramp.
  if (!S.adapt.phaseSince) S.adapt.phaseSince = dateKey();
  const cutoff = dateKey(addDays(new Date(), -60));
  S.adapt.restDates = (S.adapt.restDates || []).filter(d => d >= cutoff);
  S.adapt.soreDates = (S.adapt.soreDates || []).filter(d => d >= cutoff);
  await saveAdapt();
}

function saveAdapt() { return DB.put('settings', { ...S.adapt, key: 'adapt' }); }

// First run of Phase 5a: the skip tax and the points both start today, so nothing is charged or awarded back.
async function loadHabits() {
  const today = dateKey();
  const ledger = await DB.get('settings', 'ledger');
  const bank = await DB.get('settings', 'bank');
  S.ledger = { ...DEFAULT_LEDGER, ...(ledger || {}) };
  S.bank = { ...DEFAULT_BANK, ...(bank || {}) };
  S.ledger.since ||= today;
  S.bank.since ||= today;
  if (!ledger) await saveLedger();
  if (!bank) await saveBank();
  // First run of Phase 5b: the lunch prompt's 4-week trial starts today.
  if (!S.settings.lunchPromptSince) { S.settings.lunchPromptSince = today; await DB.put('settings', S.settings); }
}
function saveLedger() { return DB.put('settings', { ...S.ledger, key: 'ledger' }); }
function saveBank() { return DB.put('settings', { ...S.bank, key: 'bank' }); }

// One `daily` record per date: meals, protein, the lunch plan, desk breaks, the stand goal.
const emptyDay = date => ({ date, meals: { snacks: [] }, protein: 0, proteinAdds: [], lunchPlan: null, lunchStuck: null, deskBreaks: 0, stood: false });
async function getDay(key) {
  const saved = await DB.get('daily', key);
  const day = { ...emptyDay(key), ...(saved || {}) };
  day.meals = { snacks: [], ...day.meals };
  return day;
}
function saveDay(day) { return DB.put('daily', day); }
const isWorkday = key => { const dow = parseKey(key).getDay(); return dow >= 1 && dow <= 5; };

// First run of Phase 3: today's days stand for all of history (there was no record before).
async function loadSchedule() {
  const saved = await DB.get('settings', 'schedule');
  S.schedule = saved || { key: 'schedule', periods: [{ from: '2000-01-01', days: workoutDays() }] };
  if (!saved) await DB.put('settings', S.schedule);
}

// A change of workout days starts a new period today.
async function recordSchedule() {
  const days = workoutDays();
  const periods = S.schedule.periods;
  const last = periods[periods.length - 1];
  if (JSON.stringify(last.days) === JSON.stringify(days)) return;
  const today = dateKey();
  if (last.from === today) last.days = days;
  else periods.push({ from: today, days });
  await DB.put('settings', S.schedule);
}

async function saveSettings(patch) {
  Object.assign(S.settings, patch);
  S.settings.workoutDays = S.settings.workoutDays.filter(d => d !== SATURDAY);
  S.settings.finisherDays = (S.settings.finisherDays || []).filter(d => S.settings.workoutDays.includes(d));
  await DB.put('settings', S.settings);
  if ('workoutDays' in patch) await recordSchedule();
  applyAccent();
  await invalidateTodayPlan();
}

// Today's plan is fixed once generated, unless settings change before you start it.
async function invalidateTodayPlan() {
  const today = dateKey();
  const session = await DB.get('settings', 'session');
  if (session && session.workoutId === today) return;
  const logs = await logsFor(today);
  if (logs.length) return;
  const existing = await DB.get('workouts', today);
  if (existing?.mobility) return; // a Very sore day keeps its mobility session
  await giveBackMods(existing?.minimum ? null : existing); // so the rebuilt plan gets them too (a 5-minute plan already gave them back)
  await DB.delete('workouts', today);
  // Rebuild now when the plan carries a choice: an extra workout, the 10- or 5-minute version, a soreness answer.
  if (existing && (!existing.scheduled || existing.short || existing.minimum || existing.soreness)) {
    let w = await generateWorkout(today, { scheduled: existing.scheduled });
    if (existing.soreness) w.soreness = existing.soreness;
    if (existing.short) w = shortVersion(w);
    if (existing.minimum) w = await toMinimum(w);
    await DB.put('workouts', w);
  }
}

async function loadProgression() {
  const all = await DB.getAll('progression');
  for (const p of all) S.progression[p.ladderId] = p;
  for (const [ladderId, start] of Object.entries(START_PROGRESSION)) {
    if (S.progression[ladderId]) continue;
    const rec = {
      ladderId,
      rungIndex: start.rungIndex,
      repTarget: start.repTarget ?? null,
      secondsTarget: start.secondsTarget ?? null,
      recentRatings: [],
      painFlags: 0,
      hidden: {},
      history: [],
      updatedAt: new Date().toISOString(),
    };
    S.progression[ladderId] = rec;
    await DB.put('progression', rec);
  }
}

// Full weeks since the current training phase began, oldest first, for Adapt.rampStatus.
async function rampWeeks() {
  const logs = await DB.getAll('logs');
  const thisWeek = weekStart();
  const weeks = [];
  for (let n = 8; n >= 1; n--) {
    const start = addDays(thisWeek, -7 * n);
    if (dateKey(start) < S.adapt.phaseSince) continue;
    const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
    const inWeek = logs.filter(l => keys.includes(l.date));
    weeks.push({
      planned: keys.filter(isPlannedDay).length,
      done: new Set(inWeek.filter(l => l.status === 'completed' && countsAsWorkout(l)).map(l => l.date)).size,
      checks: inWeek.filter(countsAsWorkout).map(l => Adapt.flags(l.checkIn)).filter(f => f.rated),
    });
  }
  return weeks;
}

// A log counts as a workout only if a circuit set was done. One ended after the warm-up never moves
// the rotation, asks for a check-in, or counts toward the week or the ramp.
// Logs without a per-exercise breakdown fall back to their status.
function circuitSetsDone(log) {
  return (log.exercises || []).filter(e => e.block === 'circuit').reduce((n, e) => n + (e.setsDone || 0), 0);
}
function countsAsWorkout(log) {
  if (log.kind === 'minimum') return false;
  if (!log.exercises?.length) return log.status === 'completed';
  return circuitSetsDone(log) > 0;
}

// A Very sore mobility session or a 5-minute "Just show up" is a real show-up: it counts for the streak
// and calendar (and is never taxed), but never for the week, the ramp, or the rotation (those use countsAsWorkout).
function countsForStreak(log) {
  return countsAsWorkout(log) || ((log.kind === 'mobility' || log.kind === 'minimum') && (log.setsDone || 0) > 0);
}

// Reward points for one log: 10 for a finished workout, 5 for a smaller show-up. Habits.bank keeps the best per day.
function logPoints(log) {
  if (countsAsWorkout(log)) return log.status === 'completed' ? POINTS_FULL : POINTS_SMALL;
  return countsForStreak(log) ? POINTS_SMALL : 0;
}

async function bankStatus(logs) {
  logs ||= await DB.getAll('logs');
  const extras = Food.awards(await DB.getAll('daily'), { since: S.bank.since, winPoints: POINTS_WIN_MEAL, deskPoints: POINTS_DESK });
  return Habits.bank({ since: S.bank.since, awards: logs.map(l => ({ date: l.date, points: logPoints(l) })), extras, redemptions: S.bank.redemptions });
}

async function ledgerStatus(facts) {
  const f = facts || await historyFacts();
  return Habits.ledger({
    since: S.ledger.since, today: dateKey(), planned: isPlannedDay,
    showedUp: new Set([...f.done, ...f.partial]), amount: S.settings.skipTaxAmount, payments: S.ledger.payments,
    mealMisses: S.settings.mealTax ? Food.misses(await DB.getAll('daily'), S.ledger.since) : [], mealAmount: S.settings.mealTaxAmount,
  });
}

// What the calendar and streak need, from every log. Only logs with circuit sets (or mobility) count.
async function historyFacts() {
  const logs = await DB.getAll('logs');
  const counted = logs.filter(countsForStreak);
  const done = new Set(counted.filter(l => l.status === 'completed').map(l => l.date));
  const partial = new Set(counted.filter(l => l.status !== 'completed' && !done.has(l.date)).map(l => l.date));
  const first = logs.map(l => l.date).sort()[0] || null;
  return { logs, done, partial, first };
}

async function currentStreak(facts) {
  const f = facts || await historyFacts();
  return Track.streak({ today: dateKey(), first: f.first, done: f.done, partial: f.partial, planned: isPlannedDay });
}

async function logsFor(dKey) {
  return (await DB.getAll('logs')).filter(l => l.date === dKey);
}

async function weekSummary(ref = new Date()) {
  const start = weekStart(ref);
  const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
  const logs = (await DB.getAll('logs')).filter(l => l.status === 'completed' && countsAsWorkout(l) && keys.includes(l.date));
  const doneDates = new Set(logs.map(l => l.date));
  return { keys, doneDates, planned: keys.filter(isPlannedDay).length, done: doneDates.size };
}

/* ==========================================================================
   Accent + sound + flash + wake lock
   ========================================================================== */
function applyAccent() {
  const a = S.settings.accent;
  if (a && a !== 'orange') document.documentElement.dataset.accent = a;
  else delete document.documentElement.dataset.accent;
}

const Sound = {
  ctx: null,
  last: null,  // { at, state } of the last tone attempt, shown on Me for debugging
  // "playback" lets the tone play with the ringer on silent. Set it every time; iOS can drop it.
  setSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  },
  // Must run inside a tap handler. iOS only starts or restarts audio from a user gesture.
  unlock() {
    this.setSession();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      // A context interrupted by another app (YouTube) can stay stuck on iOS. Replace it.
      if (this.ctx && (this.ctx.state === 'closed' || this.ctx.state === 'interrupted')) {
        try { this.ctx.close(); } catch (e) { /* ignore */ }
        this.ctx = null;
      }
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch (e) { /* the flash still works */ }
  },
  // Outside a gesture: try to wake a suspended context (after returning to the app).
  resume() {
    this.setSession();
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      return this.ctx.resume().catch(() => {});
    }
    return Promise.resolve();
  },
  state() { return this.ctx ? this.ctx.state : 'not created'; },
  tone(freq, at, dur, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  },
  play(kind) {
    if (!S.settings.sound || !this.ctx) return;
    const go = () => {
      this.last = { at: new Date(), state: this.state() };
      try {
        const t = this.ctx.currentTime + 0.01;
        if (kind === 'go') { this.tone(660, t, 0.28, 0.2); this.tone(880, t + 0.16, 0.4, 0.2); }
        else if (kind === 'done') { this.tone(880, t, 0.28, 0.18); this.tone(660, t + 0.16, 0.45, 0.18); }
        else if (kind === 'tick') { this.tone(520, t, 0.12, 0.08); }
      } catch (e) { /* ignore */ }
    };
    // Schedule after resume settles; currentTime is frozen while suspended.
    if (this.ctx.state === 'running') go();
    else this.resume().then(go);
  },
};

function flash() {
  if (!S.settings.flash) return;
  const el = $('#flash');
  el.classList.remove('on', 'bold', 'subtle');
  void el.offsetWidth; // restart the animation
  el.classList.add('on', S.settings.flashStrength === 'subtle' ? 'subtle' : 'bold');
}

function cue(kind) { Sound.play(kind); flash(); }

const Wake = {
  lock: null,
  async on() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        this.lock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* fail quietly */ }
  },
  async off() {
    try { if (this.lock) await this.lock.release(); } catch (e) { /* fail quietly */ }
    this.lock = null;
  },
};

/* ==========================================================================
   Tabs + rendering
   ========================================================================== */
function setDock(html) {
  $('#action-dock').innerHTML = html;
  $('#views').classList.toggle('has-dock', !!html);
}

async function showTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== tab; });
  $('#views').scrollTop = 0;
  setDock('');
  if (tab === 'today') await renderToday();
  else if (tab === 'history') await renderHistory();
  else if (tab === 'food') await renderFood();
  else if (tab === 'me') renderMe();
  // Replay the entrance transition
  const v = $(`#view-${tab}`);
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
}

function largeTitle(title, eyebrow = '') {
  return `<header class="large-title">${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(title)}</h1></header>`;
}

/* ---------- Today ---------- */
async function renderToday() {
  const now = new Date();
  const today = dateKey(now);
  S.todayKey = today;
  const dow = now.getDay();
  const session = await DB.get('settings', 'session');
  const todaysLogs = await logsFor(today);
  const doneToday = todaysLogs.some(l => l.status === 'completed');
  const pending = pendingCheckIn(todaysLogs);
  let workout = await DB.get('workouts', today);
  if (!workout && isPlannedDay(today)) workout = await generateWorkout(today);

  let hero = '';
  let dock = '';

  if (doneToday) {
    const log = todaysLogs.filter(l => l.status === 'completed').pop();
    hero = `
      <div class="card hero hero-done">
        <div class="done-icon">${ICONS.check}</div>
        <div class="hero-kicker" style="color:var(--win)">${log.kind === 'minimum' ? 'You showed up' : 'Done for today'}</div>
        <div class="hero-title">${esc(log.name || DAY_TYPES[log.dayType]?.name || 'Workout')}</div>
        <div class="hero-meta">
          <span class="chip">${ICONS.clock}<span class="num">${fmtMinutes(log.durationSec)}</span></span>
          <span class="chip win">${ICONS.check}<span class="num">${log.setsDone} of ${log.setsPlanned} sets</span></span>
        </div>
        ${workout ? `<button class="text-btn" data-action="start">${session && session.workoutId === today ? 'Resume extra session' : workout.minimum ? 'Do the full workout too' : 'Train again'}</button>` : ''}
      </div>`;
    if (pending) {
      dock = `<button class="btn btn-primary btn-xl" data-action="checkin">Check in</button>`;
    } else if (!log.stretchDone && workout?.blocks.some(b => b.kind === 'stretch')) {
      dock = `<button class="btn btn-secondary btn-xl" data-action="stretch">Stretch 5 min</button>`;
    }
  } else if (workout) {
    const circuit = workout.blocks.find(b => b.kind === 'circuit');
    const finisher = workout.blocks.find(b => b.kind === 'finisher');
    const armcare = workout.blocks.find(b => b.kind === 'armcare');
    const resuming = session && session.workoutId === today;
    const untouched = !resuming && !todaysLogs.length; // nothing started today yet
    const exRows = items => items.map(it => {
      const ex = S.exById[it.exerciseId];
      return `<li><span class="ex-name">${esc(ex.name)}</span><span class="ex-target">${esc(targetText(it))}</span></li>`;
    }).join('');
    const block = kind => workout.blocks.find(b => b.kind === kind);
    const askSore = S.settings.sorenessPrompt && untouched && workout.scheduled && isPlannedDay(today)
      && !workout.mobility && !workout.short && !workout.minimum && !workout.soreness;
    const links = !untouched ? []
      : workout.mobility ? [`<button class="text-btn" data-action="unsore">Feeling OK? Use the normal workout</button>`]
      : workout.short || workout.minimum ? [`<button class="text-btn" data-action="full">Use the full workout</button>`]
      : [`<button class="text-btn" data-action="short">Short on time? Do a 10-minute version</button>`,
         `<button class="text-btn" data-action="minimum">Just show up: 5 minutes</button>`];
    if (untouched && workout.scheduled && isPlannedDay(today) && !workout.mobility) {
      links.push(`<button class="text-btn muted-link" data-action="excuse" data-day="${today}">Sick or traveling? Excuse today</button>`);
    }
    const switchLink = links.length ? `<div class="alt-links">${links.join('')}</div>` : '';
    const moves = workout.blocks.filter(b => !b.optional).reduce((n, b) => n + b.items.length, 0);
    const blockTitle = b => b.kind === 'circuit' ? (b.rounds === 1 ? 'Main circuit · 1 round' : 'Main circuit') : b.label;
    hero = `
      <div class="card hero">
        <div class="hero-kicker">${workout.mobility ? 'Recovery' : workout.minimum ? 'Just show up' : workout.scheduled ? "Today's workout" : 'Extra workout'}</div>
        <div class="hero-title">${esc(workout.name)}</div>
        <div class="hero-meta">
          <span class="chip accent">${ICONS.clock}<span class="num">~${fmtMinutes(workout.estSec)}</span></span>
          ${circuit && !workout.minimum ? `<span class="chip">${ICONS.list}<span class="num">${circuit.items.length} exercises</span></span>
          <span class="chip">${ICONS.repeat}<span class="num">${circuit.rounds} rounds</span></span>`
            : `<span class="chip">${ICONS.list}<span class="num">${moves} moves</span></span>`}
          ${finisher ? `<span class="chip">${ICONS.zap}Finisher</span>` : ''}
        </div>
        ${(workout.notes || []).map(n => `<div class="hero-note">${esc(n)}</div>`).join('')}
        ${pending ? `<button class="text-btn" data-action="checkin">Check in on the workout you ended early</button>` : ''}
        ${askSore ? `
        <div class="sore-ask">
          <div class="sore-q">Sore this morning?</div>
          <div class="ci-chips">${[['fine', 'Fine'], ['sore', 'A bit sore'], ['very', 'Very sore']].map(([v, label]) => `
            <button class="ci-chip" data-action="sore" data-sore="${v}">${label}</button>`).join('')}
          </div>
        </div>` : ''}
        ${switchLink}
        <ul class="ex-list">
          ${workout.mobility || workout.minimum ? ['warmup', 'circuit', 'armcare', 'stretch'].map(k => block(k) ? `<li class="ex-block">${esc(blockTitle(block(k)))}</li>${exRows(block(k).items)}` : '').join('') : `
          ${circuit ? `<li class="ex-block">Main circuit</li>${exRows(circuit.items)}` : ''}
          ${finisher ? `<li class="ex-block">Finisher · 30s on / 30s off</li>${exRows(finisher.items)}` : ''}
          ${armcare ? `<li class="ex-block">Arm care</li>${exRows(armcare.items)}` : ''}`}
        </ul>
      </div>`;
    dock = `<button class="btn btn-primary btn-xl" data-action="start">${resuming ? 'Resume workout' : 'Start workout'}</button>`;
  } else {
    const next = nextWorkoutDay(now);
    hero = `
      <div class="card hero hero-rest">
        <div class="rest-icon">${ICONS.moon}</div>
        <div class="hero-title">${excuseFor(today) ? 'Excused today' : 'Rest day'}</div>
        <p>${excuseFor(today) ? `${EXCUSE_TEXT[excuseFor(today).reason]}. It won't count as a miss. Rest up.`
          : isForcedRest(today) && isWorkoutDay(dow) ? 'Recovering from a Wiped out session. Walk, stretch, or nothing.' : 'Walk, stretch, or nothing.'}</p>
        ${next ? `<p style="margin-top:10px">Next workout: <strong style="color:var(--text)">${esc(next)}</strong></p>` : ''}
        <div class="alt-links">
          <button class="text-btn" data-action="train-anyway">Train anyway</button>
          ${excuseFor(today) ? `<button class="text-btn muted-link" data-action="unexcuse" data-day="${today}">Undo excuse</button>` : ''}
        </div>
      </div>`;
  }

  const wk = await weekSummary(now);
  const facts = await historyFacts();
  const sk = await currentStreak(facts);
  const weekHtml = `
    <div class="card">
      <div class="week-head">
        <div class="week-left">
          <div class="muted">This week</div>
          <span class="streak ${sk.count ? '' : 'zero'}" aria-label="Streak: ${sk.count} workouts">${ICONS.flame}<span class="num">${sk.count}</span></span>
        </div>
        <div class="big">${wk.done}<span class="of"> of ${wk.planned}</span></div>
      </div>
      <div class="week">
        ${wk.keys.map((k, i) => {
          const cls = ['week-day'];
          if (isPlannedDay(k)) cls.push('planned');
          if (wk.doneDates.has(k)) cls.push('done');
          else if (facts.done.has(k) || facts.partial.has(k)) cls.push('showed'); // a 5-minute or mobility day
          if (k === today) cls.push('today');
          if (i === SATURDAY) cls.push('off');
          return `<div class="${cls.join(' ')}"><span class="wd">${DAY_LETTER[i]}</span><span class="dot">${wk.doneDates.has(k) ? ICONS.check : ''}</span></div>`;
        }).join('')}
      </div>
    </div>`;

  const updateBanner = Update.waiting
    ? `<button class="update-banner" data-action="update">${ICONS.refresh}<span>Update ready, tap to reload</span></button>`
    : '';
  const scorecard = now.getDay() === 0 && S.settings.scorecard && S.settings.scorecardSeen !== today
    ? await scorecardHtml(today, facts, { actions: true }) : '';
  $('#view-today').innerHTML = updateBanner + largeTitle('Today', fmtLongDate(now)) + scorecard + await rampCard()
    + (scorecard ? '' : backupCard(today)) + await habitCards(facts) + await lunchReviewCard() + hero
    + `<div style="height:12px"></div>` + weekHtml + await dayCard(today);
  setDock(dock);
}

// Sundays: a "Back up now" card, unless there's been a backup in the last 6 days. Amber after 14.
function backupCard(today) {
  const lb = S.settings.lastBackup;
  if (parseKey(today).getDay() !== 0 || S.settings.backupSkipped === today) return '';
  if (lb && daysSince(lb) < 6) return '';
  const stale = backupStale();
  return `
    <div class="card backup-card ${stale ? 'stale' : ''}">
      <div class="backup-title">${ICONS.download}<span>Weekly backup</span></div>
      <p class="muted">${lb ? `Last backup: ${esc(fmtShortDate(parseKey(lb)))}${stale ? ` (${daysSince(lb)} days ago)` : ''}` : 'No backup yet'}. Saves one file to iCloud Drive or Files.</p>
      <div class="ramp-actions">
        <button class="btn btn-secondary" data-action="backup-skip">Not now</button>
        <button class="btn btn-primary" data-action="export">Back up now</button>
      </div>
    </div>`;
}

function backupStale() {
  const lb = S.settings.lastBackup;
  return !lb || daysSince(lb) > BACKUP_STALE_DAYS;
}
const backupDue = () => !S.settings.lastBackup || daysSince(S.settings.lastBackup) >= 6;

/* ---------- Habits: skip tax, wife notice (SPEC.md → Habit features) ---------- */
const money = n => `$${n}`;

// Misses since the last payoff: a payment on a day covers every miss before it.
const unpaid = (led, key) => !led.lastPaid || key >= led.lastPaid;
// A Miss meal is paid for if it was logged before the last payment (older payments have only a date).
const mealUnpaid = (led, m) => !led.lastPaid || (led.lastPaidAt && m.at ? m.at > led.lastPaidAt : m.date > led.lastPaid);
// A recent missed day can still be excused (sick, travel), unless it's already been paid for.
const canExcuse = (led, key) => unpaid(led, key) && daysSince(key) <= 14;

function smsHref(owed) {
  const st = S.settings;
  const body = encodeURIComponent(Habits.fillMessage(st.noticeMessage, owed));
  return `sms:${st.noticePhone.replace(/[^\d+]/g, '')}${isIOS() ? '&' : '?'}body=${body}`;
}

async function habitCards(facts) {
  const st = S.settings;
  if (!st.skipTax) return '';
  const led = await ledgerStatus(facts);
  let html = '';
  if (st.notice && Habits.noticeDue({ owed: led.owed, threshold: st.noticeThreshold, sent: S.ledger.noticesSent })) {
    const who = st.noticeName || 'her';
    const [body, actions] = !st.noticePhone
      ? [`The IOU is at ${money(led.owed)}. Add ${esc(who === 'her' ? 'her' : who + "'s")} number to send the text.`,
         `<button class="btn btn-primary" data-action="notice-setup">Set up</button>`]
      : S.ledger.noticeOpen
      ? ['Did the text send?', `<div class="ramp-actions">
          <a class="btn btn-secondary" href="${esc(smsHref(led.owed))}" data-action="notice-open">Open again</a>
          <button class="btn btn-primary" data-action="notice-sent">Sent it</button></div>`]
      : [`The IOU hit ${money(led.owed)}. One text, then this card goes away.`,
         `<a class="btn btn-primary" href="${esc(smsHref(led.owed))}" data-action="notice-open">Notify ${esc(who)}</a>`];
    html += `
      <div class="card notice-card">
        <div class="backup-title">${ICONS.message}<span>Notify ${esc(who)}</span></div>
        <p class="muted">${body}</p>
        <div class="notice-actions">${actions}</div>
      </div>`;
  }
  if (led.owed > 0) {
    const n = led.misses.filter(k => unpaid(led, k)).length;
    const m = led.mealMisses.filter(x => mealUnpaid(led, x)).length;
    const why = [n ? `${n} missed workout${n === 1 ? '' : 's'} at ${money(st.skipTaxAmount)}` : '',
      m ? `${m} Miss meal${m === 1 ? '' : 's'} at ${money(st.mealTaxAmount)}` : ''].filter(Boolean).join(', ');
    html += `
      <div class="card owe-card">
        <div class="owe-head">
          <div><div class="muted">You owe</div><div class="owe-num num">${money(led.owed)}</div></div>
          <button class="btn btn-secondary owe-paid" data-action="paid">Paid</button>
        </div>
        <p class="muted">${why ? `${why}. ` : ''}Sick or traveling? Excuse the day on the History calendar.</p>
      </div>`;
  }
  return html;
}

/* ---------- Today: protein, desk breaks, stand goal (SPEC.md → Food features, Workday movement) ---------- */
function proteinRing(g, target, size = 56) {
  const r = 24, c = 2 * Math.PI * r;
  const frac = Math.min(1, target > 0 ? g / target : 0);
  return `<svg class="pring ${frac >= 1 ? 'full' : ''}" viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true">
    <circle class="pring-track" cx="28" cy="28" r="${r}"/>
    <circle class="pring-fill" cx="28" cy="28" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(2)}"/>
  </svg>`;
}

async function dayCard(today) {
  const st = S.settings;
  const day = await getDay(today);
  const work = isWorkday(today);
  const desk = st.deskBreaks && work;
  const stand = st.standGoal && work;
  return `
    <div class="card day-card">
      <button class="day-protein" data-action="go-food">
        ${proteinRing(day.protein, st.proteinTarget, 48)}
        <div class="row-main"><div class="muted">Protein</div><div class="day-num num">${day.protein}<span class="of"> / ${st.proteinTarget} g</span></div></div>
        ${ICONS.chevronRight}
      </button>
      ${desk ? `
      <div class="day-row">
        <div class="row-main"><div class="muted">Desk breaks</div><div class="day-num num">${day.deskBreaks}<span class="of"> of ${DESK_MAX}</span></div></div>
        <button class="btn btn-small btn-secondary" data-action="desk-moves">Moves</button>
        <button class="btn btn-small ${day.deskBreaks < DESK_MAX ? 'btn-primary' : 'btn-secondary'}" data-action="desk-log" ${day.deskBreaks < DESK_MAX ? '' : 'disabled'}>Did one</button>
      </div>` : ''}
      ${stand ? `
      <button class="day-row day-stand ${day.stood ? 'on' : ''}" data-action="stand" aria-pressed="${day.stood}">
        <span class="check-box">${day.stood ? ICONS.check : ''}</span>
        <span class="row-main">Stood for 2+ hours</span>
      </button>` : ''}
    </div>`;
}

// After 4 weeks of the evening lunch prompt: keep it or turn it off.
async function lunchReviewCard() {
  const st = S.settings;
  if (!st.lunchPrompt || st.lunchReviewed || !st.lunchPromptSince || daysSince(st.lunchPromptSince) < 28) return '';
  const days = (await DB.getAll('daily')).filter(d => d.date >= st.lunchPromptSince);
  const ls = Food.lunchStats(days);
  return `
    <div class="card ramp-card">
      <div class="hero-kicker">Lunch plan · 4 weeks in</div>
      <div class="ramp-title">Keep the evening lunch prompt?</div>
      <p class="muted">${ls.planned ? `You stuck to the plan ${ls.stuck} of ${ls.planned} times.` : 'No planned lunches were checked yet.'} It's a trial: keep it if it helps.</p>
      <div class="ramp-actions">
        <button class="btn btn-secondary" data-action="lunch-review-off">Turn it off</button>
        <button class="btn btn-primary" data-action="lunch-review-keep">Keep it</button>
      </div>
    </div>`;
}

async function logDeskBreak() {
  const day = await getDay(dateKey());
  if (day.deskBreaks >= DESK_MAX) return toast(`That's all ${DESK_MAX} for today`);
  day.deskBreaks++;
  await saveDay(day);
  toast(`Desk break ${day.deskBreaks} of ${DESK_MAX}${S.settings.rewardsOn ? ` · +${POINTS_DESK} points` : ''}`);
}

// The office moves, about 2 minutes: pick 3, ~40 s each.
function showDeskMoves() {
  const root = $('#fsheet');
  root.innerHTML = `
    <div class="sheet-backdrop" data-f="cancel"></div>
    <div class="wsheet">
      <div class="ws-title">Desk break</div>
      <div class="ws-sub">About 2 minutes. Pick any 3, roughly 40 seconds each. No sweat.</div>
      <ul class="ex-list desk-list">${DESK_MOVES.map(([n, cue]) => `<li><span class="ex-name">${esc(n)}</span><span class="desk-cue">${esc(cue)}</span></li>`).join('')}</ul>
      <div class="ws-actions">
        <button type="button" class="btn btn-secondary" data-f="cancel">Close</button>
        <button type="button" class="btn btn-primary" data-f="log">Did one</button>
      </div>
    </div>`;
  root.hidden = false;
  root.onclick = async e => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (!f) return;
    root.hidden = true; root.innerHTML = '';
    if (f === 'log') { await logDeskBreak(); if (S.tab === 'today') renderToday(); }
  };
}

/* ---------- Weekly scorecard: the 8 full weeks before this one ---------- */
async function scorecardWeeks(today, facts) {
  const thisWeek = weekStart(parseKey(today));
  const firstWeek = facts.first ? Track.weekStartKey(facts.first) : null;
  const weeks = [];
  for (let n = 8; n >= 1; n--) {
    const start = addDays(thisWeek, -7 * n);
    if (!firstWeek || dateKey(start) < firstWeek) continue;
    const wk = await weekSummary(start);
    if (!wk.planned) continue;
    weeks.push({ start: dateKey(start), done: wk.done, planned: wk.planned, pct: Math.min(100, Math.round(wk.done / wk.planned * 100)) });
  }
  return weeks;
}

// Win meal % for the week starting `start` (a date key), or null if nothing was rated.
async function weekWinPct(start) {
  const end = Habits.addDaysKey(start, 7);
  return Food.winPct((await DB.getAll('daily')).filter(d => d.date >= start && d.date < end));
}
const winText = pct => pct == null ? '–' : `${pct}%`;

async function scorecardHtml(today, facts, { actions = false } = {}) {
  const weeks = await scorecardWeeks(today, facts);
  if (!weeks.length) return '';
  const lastStart = dateKey(addDays(weekStart(parseKey(today)), -7));
  const last = weeks.find(w => w.start === lastStart);
  const sk = await currentStreak(facts);
  const st = S.settings;
  const stats = [
    [last ? `${last.done}<span class="of"> / ${last.planned}</span>` : '–', 'Workouts'],
    [`${sk.count}`, 'Streak'],
    [winText(await weekWinPct(lastStart)), 'Win meals'],
    st.skipTax ? [money((await ledgerStatus(facts)).owed), 'Skip tax'] : null,
    st.rewardsOn ? [`${(await bankStatus(facts.logs)).balance}`, 'Points'] : null,
  ].filter(Boolean);
  return `
    <div class="card scorecard ${actions ? 'on-today' : ''}">
      <div class="backup-title">${ICONS.chart}<span>Weekly scorecard</span></div>
      <div class="muted">Week of ${esc(shortDate(lastStart))}</div>
      <div class="sc-stats">${stats.map(([v, l]) => `<div><div class="sc-num num">${v}</div><div class="sc-label">${l}</div></div>`).join('')}</div>
      ${weeks.length >= 2 ? trendChart(weeks) : '<p class="muted sc-wait">The trend chart starts after your second full week.</p>'}
      ${actions && backupDue() ? `<p class="sc-backup ${backupStale() ? 'stale' : ''}">${S.settings.lastBackup
        ? `Last backup: ${esc(fmtShortDate(parseKey(S.settings.lastBackup)))}${backupStale() ? ` (${daysSince(S.settings.lastBackup)} days ago)` : ''}` : 'No backup yet'}</p>` : ''}
      ${actions ? `<div class="ramp-actions ${backupDue() ? '' : 'one'}">
        ${backupDue() ? `<button class="btn btn-secondary" data-action="export">Back up now</button>` : ''}
        <button class="btn btn-primary" data-action="scorecard-seen">Got it</button>
      </div>` : ''}
    </div>`;
}

// Weekly completion % with the average and upper/lower limits (Habits.limits). Plain SVG.
function trendChart(weeks) {
  const W = 320, H = 150, L = 34, R = 10, T = 8, B = 22;
  const lim = Habits.limits(weeks.map(w => w.pct));
  const x = i => L + i * (W - L - R) / (weeks.length - 1);
  const y = v => T + (100 - v) * (H - T - B) / 100;
  const grid = [0, 50, 100].map(v => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-ylab" x="${L - 6}" y="${y(v) + 4}">${v}%</text>`).join('');
  const hline = (v, cls) => v == null ? '' : `<line class="${cls}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w.pct).toFixed(1)}`).join(' ');
  const dots = weeks.map((w, i) => `<circle class="ch-dot ${lim.upper != null && (w.pct > lim.upper || w.pct < lim.lower) ? 'out' : ''}" cx="${x(i)}" cy="${y(w.pct)}" r="4"/>`).join('');
  const last = weeks.length - 1;
  const xlabs = [0, last].map(i => `<text class="ch-xlab" x="${x(i)}" y="${H - 5}" text-anchor="${i ? 'end' : 'start'}">${esc(shortDate(weeks[i].start))}</text>`).join('');
  return `
    <div class="chart">
      <div class="chart-legend"><span><i class="lg-line"></i>Avg ${Math.round(lim.mean)}%</span>${lim.upper != null ? `<span><i class="lg-limit"></i>Limits ${Math.round(lim.lower)}–${Math.round(lim.upper)}%</span>` : ''}</div>
      <svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Workouts done each week, last ${weeks.length} weeks">
        ${grid}${xlabs}
        ${hline(lim.upper, 'ch-limit')}${hline(lim.lower, 'ch-limit')}${hline(lim.mean, 'ch-mean')}
        <path class="ch-pct" d="${line}"/>
        ${dots}
      </svg>
    </div>`;
}

function nextWorkoutDay(from) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (isPlannedDay(dateKey(d))) return i === 1 ? 'Tomorrow' : DAY_SHORT[d.getDay()];
  }
  return null;
}

// Today's newest log that still wants a check-in. Phase 1 logs (no schema) never ask.
function pendingCheckIn(todaysLogs) {
  return todaysLogs
    .filter(l => l.schema >= 2 && !l.checkIn && countsAsWorkout(l))
    .sort((a, b) => (a.finishedAt || '').localeCompare(b.finishedAt || ''))
    .pop() || null;
}

const daysText = days => days.map(d => DAY_SHORT[d]).join(', ');

async function rampCard() {
  const phase = S.settings.phase || 1;
  const ramp = Adapt.rampStatus(await rampWeeks(), phase);
  if (!ramp.offer || S.adapt.rampDismissed === dateKey(weekStart())) return '';
  const to = ramp.offer === 'up' ? phase + 1 : phase - 1;
  const days = PHASE_DAYS[to];
  const [title, body, yes] = ramp.offer === 'up'
    ? [`You earned ${days.length} days a week`, `Two strong weeks in a row. New days: ${daysText(days)}.`, 'Move up']
    : [`Back to ${days.length} days a week?`, `Two rough weeks in a row. Dropping back keeps it doable: ${daysText(days)}.`, 'Drop back'];
  return `
    <div class="card hero ramp-card">
      <div class="hero-kicker">${ramp.offer === 'up' ? 'Level up' : 'Check in'}</div>
      <div class="ramp-title">${esc(title)}</div>
      <p class="muted">${esc(body)}</p>
      <div class="ramp-actions">
        <button class="btn btn-secondary" data-action="ramp-dismiss">Not yet</button>
        <button class="btn btn-primary" data-action="ramp-accept" data-phase="${to}">${yes}</button>
      </div>
    </div>`;
}

/* ---------- History ---------- */
function logRow(l) {
  return `
      <div class="row log-row">
        <div class="row-main">
          <div class="row-title">${esc(l.name || DAY_TYPES[l.dayType]?.name || 'Workout')}</div>
          <div class="row-sub num">${esc(fmtShortDate(parseKey(l.date)))} · ${fmtMinutes(l.durationSec)} · ${l.setsDone}/${l.setsPlanned} sets${l.short ? ' · 10-min version' : ''}${l.kind === 'minimum' ? ' · 5-min version' : ''}${l.stretchDone && l.kind !== 'mobility' ? ' · stretch' : ''}</div>
          ${checkInText(l) ? `<div class="row-sub">${esc(checkInText(l))}</div>` : ''}
          ${levelUpText(l) ? `<div class="row-sub levelup-line">${ICONS.levelUp}${esc(levelUpText(l))}</div>` : ''}
        </div>
        <span class="pill ${l.status === 'completed' ? 'win' : 'caution'}">${l.status === 'completed' ? 'Done' : 'Partial'}</span>
      </div>`;
}

const CAL_TEXT = {
  done: 'Done', partial: 'Partial workout', missed: 'Missed', today: 'Planned for today',
  upcoming: 'Planned', rest: 'Rest day', none: 'Before your first workout',
};

function calendarHtml(f, today) {
  const t = parseKey(today);
  S.calMonth ||= { y: t.getFullYear(), m: t.getMonth() };
  const { y, m } = S.calMonth;
  const first = f.first ? parseKey(f.first) : t;
  const canPrev = y * 12 + m > first.getFullYear() * 12 + first.getMonth();
  const canNext = y * 12 + m < t.getFullYear() * 12 + t.getMonth();
  const title = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const cells = Track.monthGrid(y, m).flat().map(({ key, inMonth }) => {
    const state = Track.dayState({ key, today, first: f.first, done: f.done, partial: f.partial, planned: isPlannedDay });
    const excused = state === 'rest' && !!excuseFor(key);
    const cls = ['cal-day', state, excused ? 'excused' : '', inMonth ? '' : 'out', key === S.calSel ? 'sel' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" data-cal-day="${key}" aria-label="${esc(fmtShortDate(parseKey(key)))}: ${excused ? 'Excused' : CAL_TEXT[state]}">${parseKey(key).getDate()}</button>`;
  }).join('');
  return `
    <div class="card cal">
      <div class="cal-head">
        <button class="cal-nav" data-cal-move="-1" aria-label="Previous month" ${canPrev ? '' : 'disabled'}>${ICONS.chevronLeft}</button>
        <div class="cal-title">${esc(title)}</div>
        <button class="cal-nav" data-cal-move="1" aria-label="Next month" ${canNext ? '' : 'disabled'}>${ICONS.chevronRight}</button>
      </div>
      <div class="cal-grid">
        ${DAY_LETTER.map(l => `<div class="cal-wd">${l}</div>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend">
        <span><i class="lg done"></i>Done</span><span><i class="lg partial"></i>Partial</span>
        <span><i class="lg missed"></i>Missed</span><span><i class="lg upcoming"></i>Planned</span>
      </div>
    </div>`;
}

async function renderHistory() {
  const f = await historyFacts();
  const logs = [...f.logs].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  const completed = logs.filter(l => l.status === 'completed' && countsAsWorkout(l));
  const wk = await weekSummary();
  const sk = await currentStreak(f);
  const today = dateKey();
  let html = largeTitle('History');
  html += `
    <div class="stat-row three">
      <div class="card stat"><div class="stat-num">${wk.done}<span class="muted" style="font-size:18px"> / ${wk.planned}</span></div><div class="stat-label">This week</div></div>
      <div class="card stat"><div class="stat-num streak-num">${ICONS.flame}${sk.count}</div><div class="stat-label">Streak</div>${sk.oneMiss && sk.count ? `<div class="stat-hint">Don't miss next</div>` : ''}</div>
      <div class="card stat"><div class="stat-num">${completed.length}</div><div class="stat-label">All workouts</div></div>
    </div>
    <div class="section-foot">Streak: one missed day is fine, two in a row resets it. Rest days and excused days never count against you.</div>
    <div style="height:12px"></div>` + calendarHtml(f, today);
  if (S.calSel) {
    const dayLogs = logs.filter(l => l.date === S.calSel);
    const state = Track.dayState({ key: S.calSel, today, first: f.first, done: f.done, partial: f.partial, planned: isPlannedDay });
    const ex = excuseFor(S.calSel);
    const led = await ledgerStatus(f);
    const dayRow = ex
      ? `<div class="row"><div class="row-main"><div class="row-title">Excused · ${EXCUSE_TEXT[ex.reason]}</div><div class="row-sub">Not a miss</div></div>
          ${unpaid(led, S.calSel) ? `<button class="btn btn-small btn-secondary" data-action="unexcuse" data-day="${S.calSel}">Undo</button>` : ''}</div>`
      : `<div class="row"><div class="row-main"><div class="row-title">${CAL_TEXT[state]}</div>${state === 'missed' && S.settings.skipTax && S.calSel >= S.ledger.since && unpaid(led, S.calSel) ? `<div class="row-sub">${money(S.settings.skipTaxAmount)} skip tax</div>` : ''}</div>
          ${state === 'missed' && canExcuse(led, S.calSel) ? `<button class="btn btn-small btn-secondary" data-action="excuse" data-day="${S.calSel}">Excuse</button>` : ''}</div>`;
    const foodLine = dayFoodText(await DB.get('daily', S.calSel));
    html += `<div class="section-label">${esc(fmtLongDate(parseKey(S.calSel)))}</div>` + (dayLogs.length
      ? `<div class="group">${dayLogs.map(logRow).join('')}</div>`
      : `<div class="group">${dayRow}</div>`)
      + (foodLine ? `<div class="group" style="margin-top:12px"><div class="row"><div class="row-main"><div class="row-title">Food and desk</div><div class="row-sub">${esc(foodLine)}</div></div></div></div>` : '');
  }
  const card = await scorecardHtml(today, f);
  if (card) html += `<div class="section-label">Last week</div>` + card;
  if (!logs.length) {
    html += `<div class="empty">${ICONS.history}<strong>No workouts yet</strong>Finished workouts show up here.</div>`;
  } else {
    html += `<div class="section-label">Workouts</div><div class="group">` + logs.map(logRow).join('') + `</div>`;
  }
  const cashed = [...S.bank.redemptions].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  if (cashed.length) {
    html += `<div class="section-label">Rewards cashed in</div><div class="group">` + cashed.map(r => `
      <div class="row"><div class="row-main"><div class="row-title">${esc(r.name)}</div><div class="row-sub">${esc(fmtShortDate(parseKey(r.date)))}</div></div>
        <span class="row-value num">−${r.cost} pts</span></div>`).join('') + `</div>`;
  }
  $('#view-history').innerHTML = html;
}

function onHistoryClick(e) {
  const move = e.target.closest('[data-cal-move]');
  if (move && !move.disabled) {
    const { y, m } = S.calMonth;
    const d = new Date(y, m + Number(move.dataset.calMove), 1);
    S.calMonth = { y: d.getFullYear(), m: d.getMonth() };
    return renderHistory();
  }
  const day = e.target.closest('[data-cal-day]');
  if (day) {
    S.calSel = S.calSel === day.dataset.calDay ? null : day.dataset.calDay;
    renderHistory();
  }
}

// "Good · Push-up easy · Box squat didn't finish (pain) · Knees fine", or "" for a log with no check-in
// (every Phase 1 log). Old v1 check-ins show their 1–5 rating, with Brutal now called Wiped out.
function checkInText(log) {
  const ci = log.checkIn;
  if (!ci) return '';
  let how;
  if (ci.v >= 2) {
    const rows = Object.entries(ci.rows || {}).filter(([, v]) => v !== 'fine').map(([id, v]) => {
      const why = v === 'dnf' && ci.reasons?.[id] ? ` (${Adapt.REASONS[ci.reasons[id]].toLowerCase()})` : '';
      return `${exName(id)} ${Adapt.ROWS[v].toLowerCase()}${why}`;
    });
    how = [Adapt.OVERALL[ci.overall], ...rows].filter(Boolean).join(' · ');
  } else {
    const r = ci.rating ? Adapt.RATINGS[ci.rating] : '';
    how = ci.finishedAll === false ? `Not all${r ? `, rest ${r.toLowerCase()}` : ''}` : r;
  }
  const knees = ci.knees != null ? `Knees ${Adapt.KNEES[ci.knees].toLowerCase()}` : '';
  return [how, knees].filter(Boolean).join(' · ');
}

const exName = id => S.exById[id]?.name || id;
function levelUpText(log) {
  const ups = (log.checkIn?.applied || []).filter(c => c.change === 'rungUp');
  return ups.map(c => `${exName(c.from)} → ${exName(c.to)}`).join(', ');
}

/* ---------- Food (SPEC.md → Food features): every action under 10 seconds ---------- */
const planText = plan => plan.pick === 'wing' ? 'Winging it' : plan.name;
const hourText = h => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });

// A meal is addressed as 'breakfast' | 'lunch' | 'dinner' | 'snack:<index>' ('snack:new' adds one).
function mealAt(day, ref) {
  return ref.startsWith('snack:') ? day.meals.snacks[Number(ref.slice(6))] || null : day.meals[ref] || null;
}
function setMeal(day, ref, meal) {
  if (ref.startsWith('snack:')) {
    const i = Number(ref.slice(6));
    if (meal) day.meals.snacks[i] = meal; else day.meals.snacks.splice(i, 1);
  } else if (meal) day.meals[ref] = meal;
  else delete day.meals[ref];
}

// Rate a meal today. Tapping the rating it already has clears it.
async function rateMeal(ref, rating, { fastFood = null } = {}) {
  const day = await getDay(dateKey());
  if (ref === 'snack:new') ref = `snack:${day.meals.snacks.length}`;
  const cur = mealAt(day, ref);
  if (cur?.rating === rating && !fastFood) {
    setMeal(day, ref, cur.note && !ref.startsWith('snack:') ? { ...cur, rating: null, fastFood: null } : null);
    await saveDay(day);
    return;
  }
  setMeal(day, ref, { ...(cur || {}), rating, at: new Date().toISOString(), fastFood: fastFood || (rating === 'ok' ? cur?.fastFood || null : null) });
  await saveDay(day);
  const st = S.settings;
  if (fastFood) toast(`${fastFood}: logged as OK`);
  else if (rating === 'win' && st.rewardsOn) toast(`Win · +${POINTS_WIN_MEAL} points`);
  else if (rating === 'miss' && st.skipTax && st.mealTax) toast(`Miss · ${money(st.mealTaxAmount)} on the ledger`);
}

async function setLunchStuck(v) {
  const day = await getDay(dateKey());
  day.lunchStuck = day.lunchStuck === v ? null : v;
  await saveDay(day);
}

// One-tap log from the dock (the meal for this time of day) or Add a snack. Lunch with a plan asks if you stuck to it.
async function quickMeal(slot) {
  const rating = await actionSheet({ title: `${MEAL_TEXT[slot]}?`, actions: ['win', 'ok', 'miss'].map(r => ({ label: RATING_TEXT[r], value: r })) });
  if (!rating) return;
  await rateMeal(slot === 'snack' ? 'snack:new' : slot, rating);
  const day = await getDay(dateKey());
  if (slot === 'lunch' && day.lunchPlan && day.lunchPlan.pick !== 'wing' && day.lunchStuck == null) {
    const stuck = await actionSheet({ title: `Did you stick to the plan (${day.lunchPlan.name})?`, actions: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] });
    if (stuck) await setLunchStuck(stuck === 'yes');
  }
}

async function editMealNote(ref) {
  const day = await getDay(dateKey());
  const cur = mealAt(day, ref);
  const snack = ref.startsWith('snack:');
  const v = await formSheet({
    title: snack ? 'Snack note' : `${MEAL_TEXT[ref]} note`,
    fields: [{ name: 'note', label: 'Note (optional)', value: cur?.note, placeholder: 'Grilled chicken, skipped the fries' }],
    extra: snack ? 'Delete snack' : cur?.rating ? `Clear ${MEAL_TEXT[ref].toLowerCase()}` : null,
  });
  if (!v) return;
  if (v.extra) setMeal(day, ref, null);
  else setMeal(day, ref, { ...(cur || { rating: null }), note: v.note });
  await saveDay(day);
}

async function addProtein(g) {
  const day = await getDay(dateKey());
  day.protein += g;
  day.proteinAdds.push(g);
  await saveDay(day);
}
async function undoProtein() {
  const day = await getDay(dateKey());
  const g = day.proteinAdds.pop();
  if (g) day.protein = Math.max(0, day.protein - g);
  await saveDay(day);
}

function mealRow(ref, meal, day) {
  const snack = ref.startsWith('snack:');
  const title = snack ? 'Snack' : MEAL_TEXT[ref];
  const plan = ref === 'lunch' ? day.lunchPlan : null;
  const sub = [plan ? `Plan: ${planText(plan)}` : '', meal?.fastFood ? `${meal.fastFood}, from the game plan` : '', meal?.note || ''].filter(Boolean).join(' · ');
  const askStuck = plan && plan.pick !== 'wing' && meal?.rating;
  return `
    <div class="meal">
      <div class="meal-head">
        <div class="row-main"><div class="meal-name">${title}</div>${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}</div>
        <button class="meal-note-btn" data-meal-note="${ref}">${snack ? 'Edit' : meal?.note ? 'Edit note' : 'Note'}</button>
      </div>
      <div class="ci-chips">${['win', 'ok', 'miss'].map(r => `
        <button class="ci-chip rate-${r} ${meal?.rating === r ? 'on' : ''}" data-meal="${ref}" data-rating="${r}">${RATING_TEXT[r]}</button>`).join('')}
      </div>
      ${askStuck ? `
      <div class="meal-stuck"><span>Did you stick to it?</span>
        <div class="seg">${[[true, 'Yes'], [false, 'No']].map(([v, l]) => `<button class="seg-btn ${day.lunchStuck === v ? 'on' : ''}" data-stuck="${v}">${l}</button>`).join('')}</div>
      </div>` : ''}
    </div>`;
}

async function renderFood() {
  const now = new Date();
  const today = dateKey(now);
  const st = S.settings;
  const day = await getDay(today);
  const tomorrow = await getDay(Habits.addDaysKey(today, 1));
  const left = st.proteinTarget - day.protein;
  const meals = [...Food.MEALS.map(m => mealRow(m, day.meals[m], day)), ...day.meals.snacks.map((m, i) => mealRow(`snack:${i}`, m, day))].join('');
  const html = largeTitle('Food', fmtLongDate(now)) + `
    <div class="card protein-card">
      <div class="protein-top">
        ${proteinRing(day.protein, st.proteinTarget, 88)}
        <div class="row-main">
          <div class="muted">Protein today</div>
          <div class="body-num num">${day.protein}<span class="unit"> / ${st.proteinTarget} g</span></div>
          <div class="muted">${left > 0 ? `${left} g to go` : 'Target hit'}</div>
        </div>
      </div>
      <div class="protein-btns">${[20, 30, 40].map(g => `<button class="btn btn-secondary" data-action="protein" data-g="${g}">+${g} g</button>`).join('')}</div>
      ${day.proteinAdds.length ? `<button class="text-btn muted-link protein-undo" data-action="protein-undo">Undo +${day.proteinAdds[day.proteinAdds.length - 1]} g</button>` : ''}
    </div>

    <div class="section-label">Meals</div>
    <div class="card meals-card">
      ${meals}
      <button class="row btn-row meal-add" data-action="snack-add">${ICONS.plus}<span>Add a snack</span></button>
    </div>
    <div class="section-foot">Win, OK, or Miss: no calorie counting.${st.rewardsOn ? ` A Win is ${POINTS_WIN_MEAL} points.` : ''}${st.skipTax && st.mealTax ? ` A Miss adds ${money(st.mealTaxAmount)} to the skip tax.` : ''}</div>

    <div class="section-label">Lunch plan</div>
    <div class="group">
      <button class="row entry-row" data-action="lunch-plan">
        <div class="row-main"><div class="row-title">Tomorrow</div><div class="row-sub">${tomorrow.lunchPlan ? esc(planText(tomorrow.lunchPlan)) : 'Not planned yet'}</div></div>
        <span class="row-value">${tomorrow.lunchPlan ? 'Change' : 'Plan it'}</span>
      </button>
      ${st.goToLunches.map(g => `
      <button class="row entry-row" data-golunch="${esc(g.id)}"><div class="row-main"><div class="row-title">${esc(g.name)}</div></div></button>`).join('')}
      ${st.goToLunches.length < MAX_GO_TO ? `<button class="row btn-row" data-action="golunch-add">${ICONS.plus}<span>Add a go-to lunch</span></button>` : ''}
    </div>
    <div class="section-foot">Go-to lunches are the one-tap picks${st.lunchPrompt ? ` in the evening prompt (after ${esc(hourText(st.lunchPromptHour))})` : ''}. Tap one to change or delete it.</div>

    <div class="section-label">Fast-food game plan</div>
    <div class="group">
      ${st.fastFood.map(f => `
      <button class="row entry-row" data-ff="${esc(f.id)}"><div class="row-main"><div class="row-title">${esc(f.name)}</div><div class="row-sub">${esc(f.order)}</div></div></button>`).join('')}
      <button class="row btn-row" data-action="ff-add">${ICONS.plus}<span>Add a place</span></button>
    </div>
    <div class="section-foot">Stopping anyway? Tap the place to see your order. Ordering from the plan counts as OK, not a Miss.</div>
    ${await mealsWeightHtml(now)}`;
  $('#view-food').innerHTML = html;
  const slot = Food.mealForTime(now);
  setDock(day.meals[slot]?.rating ? '' : `<button class="btn btn-primary btn-xl" data-action="meal-quick" data-slot="${slot}">Log ${slot}</button>`);
}

/* ---------- Meals vs. weight: weekly Win meal % as bars, weekly weigh-ins as a line ---------- */
async function mealsWeightHtml(now) {
  const days = await DB.getAll('daily');
  const first = days.filter(d => Food.rated(d).length).map(d => d.date).sort()[0];
  if (!first) return '';
  const weights = new Map(Track.weeklySeries(await DB.getAll('body')).map(p => [p.week, p.weightLb]));
  const thisWeek = weekStart(now);
  const weeks = [];
  for (let n = 11; n >= 0; n--) {
    const start = dateKey(addDays(thisWeek, -7 * n));
    if (start < Track.weekStartKey(first)) continue;
    const end = Habits.addDaysKey(start, 7);
    weeks.push({ start, pct: Food.winPct(days.filter(d => d.date >= start && d.date < end)), lb: weights.get(start) ?? null });
  }
  return `
    <div class="section-label">Meals vs. weight</div>
    <div class="card">${weeks.length >= 2 ? mealsWeightChart(weeks)
      : `<p class="muted" style="margin:0">Win meals this week: <strong style="color:var(--text)">${winText(weeks[0].pct)}</strong>. The chart starts next week.</p>`}</div>`;
}

function mealsWeightChart(weeks) {
  const W = 320, H = 170, L = 34, R = 40, T = 8, B = 22;
  const n = weeks.length;
  const slot = (W - L - R) / n;
  const x = i => L + slot * (i + 0.5);
  const yp = v => T + (100 - v) * (H - T - B) / 100;
  const lbs = weeks.map(w => w.lb).filter(v => v != null);
  let lo = Math.floor(Math.min(...lbs) - 1), hi = Math.ceil(Math.max(...lbs) + 1);
  if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 2); hi = Math.ceil(mid + 2); }
  const yw = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const grid = [0, 50, 100].map(v => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${yp(v)}" y2="${yp(v)}"/><text class="ch-ylab" x="${L - 6}" y="${yp(v) + 4}">${v}%</text>`).join('');
  const rlab = lbs.length ? [hi, lo].map(v => `<text class="ch-rlab" x="${W - R + 6}" y="${yw(v) + 4}">${v}</text>`).join('') : '';
  const bw = Math.min(18, slot * 0.6);
  const bars = weeks.map((w, i) => w.pct == null ? '' : `<rect class="ch-bar" x="${(x(i) - bw / 2).toFixed(1)}" y="${yp(w.pct).toFixed(1)}" width="${bw.toFixed(1)}" height="${(yp(0) - yp(w.pct)).toFixed(1)}" rx="3"/>`).join('');
  let line = '', pen = 'M';
  weeks.forEach((w, i) => { if (w.lb == null) { pen = 'M'; return; } line += `${pen}${x(i).toFixed(1)} ${yw(w.lb).toFixed(1)} `; pen = 'L'; });
  const dots = weeks.map((w, i) => w.lb == null ? '' : `<circle class="ch-wdot" cx="${x(i).toFixed(1)}" cy="${yw(w.lb).toFixed(1)}" r="3.5"/>`).join('');
  const xlabs = [0, n - 1].map(i => `<text class="ch-xlab" x="${x(i)}" y="${H - 5}" text-anchor="${i ? 'end' : 'start'}">${esc(shortDate(weeks[i].start))}</text>`).join('');
  const last = weeks[n - 1];
  return `
    <div class="chart" style="margin-top:0">
      <div class="chart-legend"><span><i class="lg-bar"></i>Win meal %</span><span><i class="lg-line"></i>Weight (lb)</span></div>
      <div class="chart-tip num">This week: <strong>${winText(last.pct)}</strong> Win meals${last.lb != null ? ` · <strong>${fmtLb(last.lb)} lb</strong>` : ''}</div>
      <svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly Win meal percent and weekly weight, last ${n} weeks">
        ${grid}${rlab}${xlabs}${bars}
        ${line ? `<path class="ch-avg" d="${line.trim()}"/>` : ''}${dots}
      </svg>
      ${lbs.length ? '' : '<p class="muted body-wait">Weekly weigh-ins (Me → Body) show up here as a line.</p>'}
    </div>`;
}

/* ---------- Lunch pre-commit: "What's lunch tomorrow?" ---------- */
async function openLunchSheet({ prompted = false } = {}) {
  const st = S.settings;
  const key = Habits.addDaysKey(dateKey(), 1);
  const plan = (await getDay(key)).lunchPlan;
  const root = $('#fsheet');
  root.innerHTML = `
    <div class="sheet-backdrop" data-l="dismiss"></div>
    <form class="wsheet" autocomplete="off">
      <div class="ws-title">What's lunch tomorrow?</div>
      <div class="ws-sub">One tap. Winging it is fine too.</div>
      <div class="lunch-list">
        ${st.goToLunches.map(g => `<button type="button" class="ci-choice ${plan?.pick === g.id ? 'on' : ''}" data-l="pick" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join('')}
        <button type="button" class="ci-choice lunch-wing ${plan?.pick === 'wing' ? 'on' : ''}" data-l="wing">No plan, I'll wing it</button>
      </div>
      <label class="fs-field"><span>Something else (optional)</span><input name="text" type="text" enterkeyhint="done" placeholder="Turkey wrap from home" value="${esc(plan?.pick === 'text' ? plan.name : '')}"></label>
      <div class="ws-hint error fs-error"></div>
      <div class="ws-actions">
        <button type="button" class="btn btn-secondary" data-l="skip">${prompted ? 'Skip' : 'Cancel'}</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`;
  root.hidden = false;
  const form = root.querySelector('form');
  return new Promise(resolve => {
    const finish = async (newPlan, answered) => {
      document.activeElement?.blur();
      root.hidden = true; root.innerHTML = '';
      if (newPlan) {
        const d = await getDay(key);
        if (d.lunchPlan?.pick !== newPlan.pick || d.lunchPlan?.name !== newPlan.name) d.lunchStuck = null;
        d.lunchPlan = newPlan;
        await saveDay(d);
        toast(newPlan.pick === 'wing' ? 'Winging it. No penalty.' : `Lunch tomorrow: ${newPlan.name}`);
      }
      // Written directly: saveSettings would rebuild today's plan, which this has no reason to touch.
      if (answered && prompted) { st.lunchAsked = dateKey(); await DB.put('settings', st); }
      resolve(newPlan);
    };
    root.onclick = e => {
      const btn = e.target.closest('[data-l]');
      const l = btn?.dataset.l;
      if (l === 'dismiss') finish(null, false); // backdrop: not a skip, so it can ask again next time
      else if (l === 'skip') finish(null, true);
      else if (l === 'wing') finish({ pick: 'wing' }, true);
      else if (l === 'pick') {
        const g = st.goToLunches.find(x => x.id === btn.dataset.id);
        if (g) finish({ pick: g.id, name: g.name }, true);
      }
    };
    form.onsubmit = e => {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) { root.querySelector('.fs-error').textContent = 'Tap one above, or type it in'; return; }
      finish({ pick: 'text', name: text }, true);
    };
  });
}

// Evenings, once: from the prompt hour until you answer or tap Skip. Never while something else is on screen.
async function maybeAskLunch() {
  const st = S.settings;
  const now = new Date();
  if (!st.lunchPrompt || now.getHours() < st.lunchPromptHour || st.lunchAsked === dateKey(now)) return;
  const busy = P.active || ['#checkin', '#complete', '#levelup', '#sheet-root', '#wsheet', '#fsheet'].some(sel => !$(sel).hidden);
  if (busy) return;
  if ((await getDay(Habits.addDaysKey(dateKey(now), 1))).lunchPlan) return;
  await openLunchSheet({ prompted: true });
  if (S.tab === 'food') renderFood();
}

async function editGoToLunch(id) {
  const st = S.settings;
  const g = id ? st.goToLunches.find(x => x.id === id) : null;
  const v = await formSheet({
    title: g ? 'Edit go-to lunch' : 'Add a go-to lunch',
    sub: 'Easy, already-decided options. Three to six is plenty.',
    fields: [{ name: 'name', label: 'Lunch', value: g?.name, placeholder: 'Chicken and rice from home' }],
    extra: g ? 'Delete' : null,
    validate: v => !v.name ? 'Give it a name' : null,
  });
  if (!v) return;
  if (v.extra) st.goToLunches = st.goToLunches.filter(x => x.id !== id);
  else if (g) g.name = v.name;
  else st.goToLunches.push({ id: `g${Date.now().toString(36)}`, name: v.name });
  await DB.put('settings', st);
}

async function editFastFood(id) {
  const st = S.settings;
  const f = id ? st.fastFood.find(x => x.id === id) : null;
  const v = await formSheet({
    title: f ? 'Edit place' : 'Add a place',
    sub: "Decide the better order now, while you're not hungry.",
    fields: [
      { name: 'name', label: 'Place', value: f?.name, placeholder: 'Chick-fil-A' },
      { name: 'order', label: 'Your order', value: f?.order, type: 'textarea' },
    ],
    extra: f ? 'Delete place' : null,
    validate: v => !v.name ? 'Name the place' : !v.order ? 'Write the order' : null,
  });
  if (!v) return;
  if (v.extra) st.fastFood = st.fastFood.filter(x => x.id !== id);
  else if (f) Object.assign(f, { name: v.name, order: v.order });
  else st.fastFood.push({ id: `f${Date.now().toString(36)}`, name: v.name, order: v.order });
  await DB.put('settings', st);
}

// A stop happens anyway: show the saved order, then log the meal for this time of day as OK.
async function showFastFood(id) {
  const f = S.settings.fastFood.find(x => x.id === id);
  if (!f) return;
  const slot = Food.mealForTime(new Date());
  const choice = await actionSheet({
    title: `${f.name}: ${f.order}`,
    actions: [{ label: `Ordered it: ${MEAL_TEXT[slot].toLowerCase()} is OK`, value: 'log' }, { label: 'Edit or delete', value: 'edit' }],
  });
  if (choice === 'log') await rateMeal(slot, 'ok', { fastFood: f.name });
  else if (choice === 'edit') await editFastFood(id);
}

async function onFoodClick(e) {
  const rate = e.target.closest('[data-meal]');
  if (rate) { await rateMeal(rate.dataset.meal, rate.dataset.rating); return renderFood(); }
  const note = e.target.closest('[data-meal-note]');
  if (note) { await editMealNote(note.dataset.mealNote); return renderFood(); }
  const stuck = e.target.closest('[data-stuck]');
  if (stuck) { await setLunchStuck(stuck.dataset.stuck === 'true'); return renderFood(); }
  const ff = e.target.closest('[data-ff]');
  if (ff) { await showFastFood(ff.dataset.ff); return renderFood(); }
  const gl = e.target.closest('[data-golunch]');
  if (gl) { await editGoToLunch(gl.dataset.golunch); return renderFood(); }
}

// History: one line for a day's food and desk, or '' if nothing was logged.
function dayFoodText(d) {
  if (!d) return '';
  const meals = Food.MEALS.filter(m => d.meals?.[m]?.rating).map(m => `${MEAL_TEXT[m]} ${RATING_TEXT[d.meals[m].rating]}`);
  const snacks = (d.meals?.snacks || []).filter(m => m.rating);
  if (snacks.length) meals.push(`${snacks.length} snack${snacks.length === 1 ? '' : 's'} (${snacks.map(m => RATING_TEXT[m.rating]).join(', ')})`);
  const plan = d.lunchPlan ? `Lunch plan: ${planText(d.lunchPlan)}${d.lunchStuck === true ? ', stuck to it' : d.lunchStuck === false ? ", didn't" : ''}` : '';
  return [...meals, plan, d.protein ? `${d.protein} g protein` : '', d.deskBreaks ? `${d.deskBreaks} desk break${d.deskBreaks === 1 ? '' : 's'}` : '', d.stood ? 'Stood 2+ hours' : '']
    .filter(Boolean).join(' · ');
}

/* ---------- Me → Body: weekly weigh-ins (SPEC.md → Weight tracking) ---------- */
const fmtLb = n => n.toFixed(1);
const signedLb = n => n == null ? '–' : `${n > 0.04 ? '+' : n < -0.04 ? '−' : '±'}${Math.abs(n).toFixed(1)} lb`;
const shortDate = key => parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

async function bodyHtml() {
  const entries = (await DB.getAll('body')).filter(e => e.weightLb > 0).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const points = Track.weeklySeries(entries);
  const sum = Track.weightSummary(points);
  const card = sum ? `
    <div class="card body-card">
      <div class="body-num num">${fmtLb(sum.current)}<span class="unit"> lb</span></div>
      <div class="muted">${sum.averaged ? '4-week average' : 'Latest weekly weigh-in'}</div>
      <div class="body-stats">
        <div><div class="body-stat-label">Last 4 weeks</div><div class="body-stat num">${signedLb(sum.change4)}</div></div>
        <div><div class="body-stat-label">Since start</div><div class="body-stat num">${signedLb(sum.sinceStart)}</div></div>
      </div>
      ${points.length >= 2 ? weightChart(points.slice(-12)) : '<p class="muted body-wait">The chart starts after your second weekly weigh-in.</p>'}
    </div>` : `
    <div class="card body-card"><p class="muted" style="margin:0">Weigh in on Sunday mornings, first thing. The trend shows up here.</p></div>`;
  const list = entries.length ? `
    <div class="section-label">Recent weigh-ins</div>
    <div class="group">${entries.slice(0, 8).map(e => `
      <button class="row entry-row" data-body-id="${e.id}">
        <div class="row-main"><div class="row-title num">${fmtLb(e.weightLb)} lb</div><div class="row-sub">${esc(fmtShortDate(parseKey(e.date)))}${e.prompted ? ' · Sunday weigh-in' : ''}</div></div>
      </button>`).join('')}
    </div>
    <div class="section-foot">Tap an entry to delete it.</div>` : '';
  return `
    <div class="section-label">Body</div>
    ${card}
    <div class="group" style="margin-top:12px">
      <button class="row btn-row" data-action="weigh-in">${ICONS.plus}<span>Add weigh-in</span></button>
      ${switchRow('Sunday weigh-in prompt', 'weighInPrompt', { sub: 'Asks once each Sunday when you open the app' })}
    </div>
    ${list}`;
}

// Weekly weigh-ins as dots, the 4-week average as a line. Plain SVG, so it works offline.
function weightChart(points) {
  const W = 320, H = 168, L = 34, R = 10, T = 8, B = 24;
  const vals = points.flatMap(p => [p.weightLb, p.avg]);
  let lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const step = [1, 2, 5, 10, 20].find(s => (hi - lo) / s <= 4) || 50;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1));
  const y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.push(`<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-ylab" x="${L - 6}" y="${y(v) + 4}">${v}</text>`);
  }
  const xl = [0, points.length - 1];
  if (points.length > 4) xl.splice(1, 0, Math.floor((points.length - 1) / 2));
  const xlabs = xl.map(i => `<text class="ch-xlab" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${esc(shortDate(points[i].date))}</text>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.avg).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle class="ch-dot" data-i="${i}" cx="${x(i)}" cy="${y(p.weightLb)}" r="4"/>`).join('');
  const half = points.length > 1 ? (W - L - R) / (points.length - 1) / 2 : (W - L - R) / 2;
  const hits = points.map((p, i) => `<rect class="ch-hit" data-chart-i="${i}" x="${x(i) - half}" y="0" width="${half * 2}" height="${H}"/>`).join('');
  const last = points.length - 1;
  return `
    <div class="chart" data-points="${esc(JSON.stringify(points.map(p => [p.date, p.weightLb, p.avg])))}">
      <div class="chart-legend"><span><i class="lg-dot"></i>Weekly weigh-in</span><span><i class="lg-line"></i>4-week average</span></div>
      <div class="chart-tip num" aria-live="polite">${chartTip(points[last].date, points[last].weightLb, points[last].avg)}</div>
      <svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly weight, last ${points.length} weeks">
        ${grid.join('')}${xlabs}
        <line class="ch-cross" x1="${x(last)}" x2="${x(last)}" y1="${T}" y2="${H - B}"/>
        <path class="ch-avg" d="${line}"/>
        ${dots}${hits}
      </svg>
    </div>`;
}

function chartTip(date, w, avg) {
  return `${esc(shortDate(date))} · <strong>${fmtLb(w)} lb</strong> · avg ${fmtLb(avg)}`;
}

// Tap or hover a week to read its numbers.
function onChartPoint(e) {
  const hit = e.target.closest('[data-chart-i]');
  if (!hit) return;
  const chart = hit.closest('.chart');
  const i = Number(hit.dataset.chartI);
  const [date, w, avg] = JSON.parse(chart.dataset.points)[i];
  chart.querySelector('.chart-tip').innerHTML = chartTip(date, w, avg);
  const cx = chart.querySelector(`.ch-dot[data-i="${i}"]`).getAttribute('cx');
  const cross = chart.querySelector('.ch-cross');
  cross.setAttribute('x1', cx);
  cross.setAttribute('x2', cx);
  chart.querySelectorAll('.ch-dot').forEach(d => d.classList.toggle('on', d.dataset.i === String(i)));
}

/* ---------- Weigh-in sheet ---------- */
const Weigh = {
  prompted: false,
  async open({ prompted = false } = {}) {
    this.prompted = prompted;
    const last = (await DB.getAll('body')).filter(e => e.weightLb > 0).sort((a, b) => (a.at || '').localeCompare(b.at || '')).pop();
    const lastWeek = last && Track.weekStartKey(last.date) < Track.weekStartKey(dateKey());
    $('#ws-title').textContent = prompted ? 'Sunday weigh-in' : 'Add weigh-in';
    $('#ws-sub').textContent = prompted ? 'First thing, same conditions as last week.' : 'Extra entries are fine. The chart uses one per week.';
    $('#ws-hint').textContent = last ? `${lastWeek ? 'Last week' : 'Last entry'}: ${fmtLb(last.weightLb)} lb` : '';
    $('#ws-hint').classList.remove('error');
    $('#ws-skip').textContent = prompted ? 'Skip' : 'Cancel';
    const input = $('#ws-weight');
    input.value = '';
    $('#wsheet').hidden = false;
    input.focus();
  },
  close() {
    $('#ws-weight').blur();
    $('#wsheet').hidden = true;
  },
  async save() {
    const v = parseFloat($('#ws-weight').value.replace(',', '.'));
    if (!(v >= 50 && v <= 700)) {
      const hint = $('#ws-hint');
      hint.textContent = 'Enter your weight in lb, like 204.6';
      hint.classList.add('error');
      return;
    }
    await DB.put('body', { date: dateKey(), at: new Date().toISOString(), weightLb: Math.round(v * 10) / 10, prompted: this.prompted });
    this.close();
    toast('Weigh-in saved');
    if (S.tab === 'me') renderMe();
  },
  async skip() {
    // Written directly: saveSettings would rebuild today's plan, which a skip has no reason to touch.
    if (this.prompted) { S.settings.weighInSkipped = dateKey(); await DB.put('settings', S.settings); }
    this.close();
  },
};

// Sundays only, once: until you save or tap Skip. Never while something else is on screen.
async function maybeAskWeighIn() {
  const today = dateKey();
  if (!S.settings.weighInPrompt || parseKey(today).getDay() !== 0 || S.settings.weighInSkipped === today) return;
  const busy = P.active || ['#checkin', '#complete', '#levelup', '#sheet-root', '#wsheet', '#fsheet'].some(sel => !$(sel).hidden);
  if (busy) return;
  if ((await DB.getAll('body')).some(e => e.date === today)) return;
  Weigh.open({ prompted: true });
}

/* ---------- Me / Settings ---------- */
function switchRow(title, setting, { sub = '', checked, disabled = false, data = '' } = {}) {
  const on = checked ?? !!S.settings[setting];
  return `
    <label class="row">
      <div class="row-main"><div class="row-title">${esc(title)}</div>${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}</div>
      <span class="switch"><input type="checkbox" ${setting ? `data-setting="${setting}"` : ''} ${data} ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span><span class="thumb"></span></span>
    </label>`;
}

async function renderMe() {
  const st = S.settings;
  const days = workoutDays();
  const phase = st.phase || 1;
  const ramp = Adapt.rampStatus(await rampWeeks(), phase);
  const today = dateKey();
  const levels = S.ex.ladders.map(l => {
    const idx = pickRung(l.id, today);
    if (idx < 0) return '';
    const ex = S.exById[l.rungs[idx].id];
    const item = itemFor(ex, S.progression[l.id]);
    const hidden = Object.entries(S.progression[l.id]?.hidden || {}).filter(([, until]) => until > today)
      .map(([id, until]) => `${exName(id)} hidden until ${fmtShortDate(parseKey(until))}`);
    const sub = [`${ex.name}${l.id === 'armCare' ? '' : ` · rung ${idx + 1} of ${l.rungs.length}`}`, ...hidden].join(' · ');
    return `<div class="row"><div class="row-main"><div class="row-title">${esc(l.pattern)}</div><div class="row-sub">${esc(sub)}</div></div><span class="row-value num">${esc(l.id === 'conditioning' ? '30s on' : targetText(item))}</span></div>`;
  }).join('');
  const html = largeTitle('Me') + await bodyHtml() + await rewardsHtml() + habitsSettingsHtml() + foodSettingsHtml() + `
    <div class="section-label">Workout days</div>
    <div class="group">
      <div class="days">
        ${DAY_SHORT.map((n, i) => `<button class="day-btn ${days.includes(i) ? 'on' : ''}" data-day="${i}" ${i === SATURDAY ? 'disabled' : ''}>${n[0]}${n[1]}</button>`).join('')}
      </div>
    </div>
    <div class="section-foot">Saturday is always off.</div>

    <div class="section-label">Finisher days</div>
    <div class="group">
      <div class="days">
        ${DAY_SHORT.map((n, i) => `<button class="day-btn ${st.finisherDays.includes(i) ? 'on' : ''}" data-finisher="${i}" ${!days.includes(i) ? 'disabled' : ''}>${n[0]}${n[1]}</button>`).join('')}
      </div>
    </div>
    <div class="section-foot">A 2–3 minute quiet conditioning block. Those days can run up to about 22 min.</div>

    <div class="section-label">Equipment</div>
    <div class="group">
      ${S.ex.equipment.map(e => e.locked
        ? `<div class="row"><div class="row-main"><div class="row-title">${esc(e.name)}</div></div><span class="lock">${ICONS.lock}Always</span></div>`
        : switchRow(e.name, null, { checked: st.equipment.includes(e.id), data: `data-equip="${e.id}"` })).join('')}
    </div>

    <div class="section-label">Workout</div>
    <div class="group">
      <div class="row">
        <div class="row-main"><div class="row-title">Quiet mode</div><div class="row-sub">No jumping, slams, or dropped weights</div></div>
        <span class="lock">${ICONS.lock}Always on</span>
      </div>
      ${switchRow('Sound cue', 'sound', { sub: 'Soft tone, plays even on silent' })}
      ${switchRow('Screen flash', 'flash', { sub: 'Flashes when a timer ends' })}
      ${st.flash ? `<div class="row">
        <div class="row-main"><div class="row-title">Flash strength</div></div>
        <div class="seg">${['subtle', 'bold'].map(v => `<button class="seg-btn ${st.flashStrength === v ? 'on' : ''}" data-flash-strength="${v}">${v === 'bold' ? 'Bold' : 'Subtle'}</button>`).join('')}</div>
      </div>` : ''}
      ${switchRow('Include stretch', 'includeStretch', { sub: 'Adds the 5-minute stretch to every workout' })}
      ${switchRow('Morning soreness check', 'sorenessPrompt', { sub: 'Very sore turns the day into mobility + arm care' })}
      <button class="row btn-row" data-action="test-cue">${ICONS.volume}<span>Test sound and flash</span></button>
    </div>
    <div class="section-foot" id="audio-debug">${esc(audioDebugText())}</div>

    <div class="section-label">Accent color</div>
    <div class="group">
      <div class="swatches">
        ${ACCENTS.map(a => `<button class="swatch ${st.accent === a.id ? 'on' : ''}" data-accent="${a.id}" aria-label="${esc(a.name)}" style="background:${a.color}"></button>`).join('')}
      </div>
    </div>

    <div class="section-label">Training</div>
    <div class="group">
      <div class="row">
        <div class="row-main">
          <div class="row-title">Phase ${phase} of 3 · ${PHASE_DAYS[phase].length} days a week</div>
          <div class="row-sub">${phase < 3 ? `${ramp.earned} of 2 strong weeks toward ${PHASE_DAYS[phase + 1].length} days` : 'Top phase'}</div>
        </div>
      </div>
      <button class="row btn-row" data-action="practice">${ICONS.play}<span>Start a practice run</span></button>
    </div>
    <div class="section-foot">A strong week: 80%+ of workouts done and no more than one Wiped out. Practice runs never count or save anything.</div>

    <div class="section-label">Current levels</div>
    <div class="group">${levels}</div>
    <div class="section-foot">Easy adds a rep. Past the top of the range, the next exercise up starts at the bottom.</div>

    <div class="section-label">Data</div>
    <div class="group">
      <button class="row btn-row" data-action="export">${ICONS.download}<span>Back up now</span></button>
      <button class="row btn-row" data-action="import">${ICONS.upload}<span>Import data</span></button>
    </div>
    <div class="section-foot"><span class="${backupStale() ? 'stale' : ''}">${st.lastBackup ? `Last backup: ${esc(fmtShortDate(parseKey(st.lastBackup)))}` : 'No backup yet'}</span>.
      Back up saves everything as one dated file. Import replaces all data on this phone. Storage: ${esc(DB.backend)} · v${APP_VERSION}</div>
  `;
  $('#view-me').innerHTML = html;
}

/* ---------- Me → Rewards: the reward bank (SPEC.md → Habit features) ---------- */
async function rewardsHtml() {
  if (!S.settings.rewardsOn) return '';
  const bal = (await bankStatus()).balance;
  const rewards = [...S.bank.rewards].sort((a, b) => a.cost - b.cost);
  return `
    <div class="section-label">Rewards</div>
    <div class="card bank-card">
      <div class="body-num num">${bal}<span class="unit"> points</span></div>
      <div class="muted">${POINTS_FULL} per workout, ${POINTS_SMALL} for a 5-minute or mobility day, ${POINTS_WIN_MEAL} per Win meal, ${POINTS_DESK} per desk break</div>
    </div>
    <div class="group" style="margin-top:12px">
      ${rewards.map(r => `
      <div class="row">
        <button class="row-main reward-edit" data-reward-edit="${esc(r.id)}"><div class="row-title">${esc(r.name)}</div><div class="row-sub num">${r.cost} points</div></button>
        <button class="btn btn-small ${bal >= r.cost ? 'btn-primary' : 'btn-secondary'}" data-reward-cash="${esc(r.id)}" ${bal >= r.cost ? '' : 'disabled'}>Cash in</button>
      </div>`).join('')}
      <button class="row btn-row" data-action="reward-add">${ICONS.plus}<span>Add reward</span></button>
    </div>
    <div class="section-foot">${rewards.length ? 'Tap a reward to change or delete it. Cash-ins show up in History.' : 'Pick rewards and their prices ahead of time, like a new game for 300 points.'}</div>`;
}

/* ---------- Me → Habits: skip tax, notice, rewards, scorecard switches ---------- */
function habitsSettingsHtml() {
  const st = S.settings;
  const who = st.noticeName || 'her';
  return `
    <div class="section-label">Habits</div>
    <div class="group">
      ${switchRow('Skip tax', 'skipTax', { sub: `${money(st.skipTaxAmount)} per missed workout · ${st.excuseLimit} excused skips a month` })}
      ${st.skipTax ? switchRow(`Text ${who} at ${money(st.noticeThreshold)}`, 'notice', { sub: st.noticePhone ? `${st.noticeName ? st.noticeName + ' · ' : ''}${st.noticePhone}` : 'No number yet' }) : ''}
      ${st.skipTax ? `<button class="row btn-row" data-action="notice-setup">${ICONS.message}<span>Skip tax and text settings</span></button>` : ''}
      ${switchRow('Reward points', 'rewardsOn', { sub: 'Points for workouts, cashed in for rewards you pick' })}
      ${switchRow('Sunday scorecard', 'scorecard', { sub: 'Last week at a glance on Sunday mornings' })}
    </div>
    <div class="section-foot">Turning the skip tax back on starts a fresh ledger at $0.</div>`;
}

/* ---------- Me → Food and desk ---------- */
function foodSettingsHtml() {
  const st = S.settings;
  return `
    <div class="section-label">Food and desk</div>
    <div class="group">
      <div class="row"><div class="row-main"><div class="row-title">Protein target</div></div><span class="row-value num">${st.proteinTarget} g a day</span></div>
      ${switchRow('Lunch plan prompt', 'lunchPrompt', { sub: `"What's lunch tomorrow?" after ${hourText(st.lunchPromptHour)}` })}
      ${st.skipTax ? switchRow('Miss-meal tax', 'mealTax', { sub: `${money(st.mealTaxAmount)} per Miss meal, on the skip tax ledger` }) : ''}
      ${switchRow('Desk breaks', 'deskBreaks', { sub: `Up to ${DESK_MAX} a workday on Today${st.rewardsOn ? `, ${POINTS_DESK} points each` : ''}` })}
      ${switchRow('Stand goal', 'standGoal', { sub: 'Check off "Stood for 2+ hours" on workdays' })}
      <button class="row btn-row" data-action="food-settings">${ICONS.utensils}<span>Protein, prompt time, meal tax</span></button>
    </div>
    <div class="section-foot">Desk break reminders: the README shows how to set them up with Clock or Shortcuts.</div>`;
}

async function editFoodSettings() {
  const st = S.settings;
  const v = await formSheet({
    title: 'Food settings',
    fields: [
      { name: 'protein', label: 'Protein target (g a day)', value: st.proteinTarget, type: 'number' },
      { name: 'hour', label: 'Lunch prompt after (hour, 24-hour clock)', value: st.lunchPromptHour, type: 'number' },
      { name: 'tax', label: 'Per Miss meal ($)', value: st.mealTaxAmount, type: 'number' },
    ],
    validate: v => !wholeIn(v.protein, 20, 400) ? 'Protein: 20 to 400 g'
      : !wholeIn(v.hour, 12, 23) ? 'Lunch prompt: an hour from 12 to 23 (20 is 8 p.m.)'
      : !wholeIn(v.tax, 1, 50) ? 'Per Miss meal: $1 to $50' : null,
  });
  if (!v) return;
  // Written directly: saveSettings would rebuild today's plan, which these have no reason to touch.
  Object.assign(st, { proteinTarget: Number(v.protein), lunchPromptHour: Number(v.hour), mealTaxAmount: Number(v.tax) });
  await DB.put('settings', st);
  toast('Saved');
  renderMe();
}

// A small form, anchored to the top so the keyboard never covers it. Resolves to the values, { extra: true }, or null.
function formSheet({ title, sub = '', fields, submit = 'Save', extra = null, validate }) {
  return new Promise(resolve => {
    const root = $('#fsheet');
    root.innerHTML = `
      <div class="sheet-backdrop" data-f="cancel"></div>
      <form class="wsheet" autocomplete="off">
        <div class="ws-title">${esc(title)}</div>
        ${sub ? `<div class="ws-sub">${esc(sub)}</div>` : ''}
        ${fields.map(f => `
        <label class="fs-field"><span>${esc(f.label)}</span>${f.type === 'textarea'
          ? `<textarea name="${f.name}" rows="3">${esc(f.value ?? '')}</textarea>`
          : `<input name="${f.name}" type="${f.type === 'tel' ? 'tel' : 'text'}" ${f.type === 'number' ? 'inputmode="numeric"' : ''} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">`}</label>`).join('')}
        <div class="ws-hint error fs-error"></div>
        <div class="ws-actions">
          <button type="button" class="btn btn-secondary" data-f="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${esc(submit)}</button>
        </div>
        ${extra ? `<button type="button" class="text-btn fs-extra" data-f="extra">${esc(extra)}</button>` : ''}
      </form>`;
    root.hidden = false;
    const form = root.querySelector('form');
    const done = v => { document.activeElement?.blur(); root.hidden = true; root.innerHTML = ''; resolve(v); };
    root.onclick = e => {
      const f = e.target.closest('[data-f]')?.dataset.f;
      if (f === 'cancel') done(null);
      else if (f === 'extra') done({ extra: true });
    };
    form.onsubmit = e => {
      e.preventDefault();
      const values = Object.fromEntries(fields.map(f => [f.name, form.elements[f.name].value.trim()]));
      const problem = validate ? validate(values) : null;
      if (problem) { root.querySelector('.fs-error').textContent = problem; return; }
      done(values);
    };
  });
}

const wholeIn = (v, lo, hi) => /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi;

async function editReward(id) {
  const r = id ? S.bank.rewards.find(x => x.id === id) : null;
  const v = await formSheet({
    title: r ? 'Edit reward' : 'Add reward',
    sub: `${POINTS_FULL} points per workout. About 3 workouts a week is ~120 points a month.`,
    fields: [
      { name: 'name', label: 'Reward', value: r?.name, placeholder: 'New running shoes' },
      { name: 'cost', label: 'Points', value: r?.cost, type: 'number', placeholder: '300' },
    ],
    extra: r ? 'Delete reward' : null,
    validate: v => !v.name ? 'Give it a name' : !wholeIn(v.cost, 1, 100000) ? 'Points: a whole number, like 300' : null,
  });
  if (!v) return;
  if (v.extra) {
    const ok = await actionSheet({ title: `Delete "${r.name}"? Past cash-ins stay in History.`, actions: [{ label: 'Delete', value: 'delete', destructive: true }] });
    if (ok !== 'delete') return;
    S.bank.rewards = S.bank.rewards.filter(x => x.id !== id);
  } else if (r) {
    Object.assign(r, { name: v.name, cost: Number(v.cost) });
  } else {
    S.bank.rewards.push({ id: `r${Date.now().toString(36)}`, name: v.name, cost: Number(v.cost) });
  }
  await saveBank();
  renderMe();
}

async function cashIn(id) {
  const r = S.bank.rewards.find(x => x.id === id);
  if (!r) return;
  const bal = (await bankStatus()).balance;
  if (bal < r.cost) return toast(`${r.cost - bal} more points to go`);
  const ok = await actionSheet({ title: `Cash in ${r.name} for ${r.cost} points? You'll have ${bal - r.cost} left.`, actions: [{ label: 'Cash in', value: 'cash' }] });
  if (ok !== 'cash') return;
  S.bank.redemptions.push({ date: dateKey(), at: new Date().toISOString(), rewardId: r.id, name: r.name, cost: r.cost });
  await saveBank();
  toast(`Enjoy: ${r.name}`);
  renderMe();
}

async function editNotice() {
  const st = S.settings;
  const v = await formSheet({
    title: 'Skip tax and text',
    sub: 'The text opens in Messages, ready to send. {amount} becomes what you owe.',
    fields: [
      { name: 'amount', label: 'Per missed workout ($)', value: st.skipTaxAmount, type: 'number' },
      { name: 'limit', label: 'Excused skips a month', value: st.excuseLimit, type: 'number' },
      { name: 'threshold', label: 'Text her at ($)', value: st.noticeThreshold, type: 'number' },
      { name: 'name', label: 'Her name', value: st.noticeName, placeholder: 'Optional' },
      { name: 'phone', label: 'Her phone number', value: st.noticePhone, type: 'tel', placeholder: '555 123 4567' },
      { name: 'message', label: 'Message', value: st.noticeMessage, type: 'textarea' },
    ],
    validate: v => !wholeIn(v.amount, 1, 100) ? 'Per missed workout: $1 to $100'
      : !wholeIn(v.limit, 0, 10) ? 'Excused skips: 0 to 10'
      : !wholeIn(v.threshold, 1, 1000) ? 'Text her at: $1 to $1000'
      : v.phone && v.phone.replace(/[^\d]/g, '').length < 7 ? 'That phone number looks too short'
      : !v.message ? 'Write a message' : null,
  });
  if (!v) return;
  // Written directly: saveSettings would rebuild today's plan, which these have no reason to touch.
  Object.assign(st, { skipTaxAmount: Number(v.amount), excuseLimit: Number(v.limit), noticeThreshold: Number(v.threshold), noticeName: v.name, noticePhone: v.phone, noticeMessage: v.message });
  await DB.put('settings', st);
  toast('Saved');
  if (S.tab === 'today') renderToday(); else renderMe();
}

// Excuse a planned day (sick, travel): it stops being planned, so it's never a miss or taxed. Limited per month.
async function excuseDay(key) {
  const limit = S.settings.excuseLimit;
  const left = Habits.excusesLeft(S.ledger.excused, key, limit);
  const month = parseKey(key).toLocaleDateString(undefined, { month: 'long' });
  if (!left) return toast(`No excused skips left in ${month}`);
  const isToday = key === dateKey();
  const choice = await actionSheet({
    title: `Excuse ${isToday ? 'today' : fmtShortDate(parseKey(key))}? It won't count as a miss${S.settings.skipTax ? ' or cost anything' : ''}. ${left} of ${limit} left in ${month}.`,
    actions: [{ label: 'Sick', value: 'sick' }, { label: 'Travel', value: 'travel' }],
  });
  if (!choice) return;
  if (isToday) {
    const w = await DB.get('workouts', key);
    if (w && !(await logsFor(key)).length) {
      await giveBackMods(w.minimum ? null : w); // the next workout gets them
      await DB.delete('workouts', key);
    }
  }
  S.ledger.excused = [...S.ledger.excused.filter(x => x.date !== key), { date: key, reason: choice }];
  await saveLedger();
  toast('Excused');
}

async function unexcuseDay(key) {
  S.ledger.excused = S.ledger.excused.filter(x => x.date !== key);
  await saveLedger();
}

// Debug line under Test sound and flash, so the phone can report what iOS is doing.
function audioDebugText() {
  const session = navigator.audioSession
    ? `supported (${navigator.audioSession.type})`
    : 'not supported';
  const last = Sound.last
    ? ` · Last tone ${Sound.last.at.toLocaleTimeString()} (${Sound.last.state})`
    : '';
  return `AudioContext: ${Sound.state()} · audioSession: ${session}${last}`;
}

async function onMeClick(e) {
  const cash = e.target.closest('[data-reward-cash]');
  if (cash) return cashIn(cash.dataset.rewardCash);
  const edit = e.target.closest('[data-reward-edit]');
  if (edit) return editReward(edit.dataset.rewardEdit);
  const entry = e.target.closest('[data-body-id]');
  if (entry) {
    const choice = await actionSheet({ title: 'Delete this weigh-in?', actions: [{ label: 'Delete', value: 'delete', destructive: true }] });
    if (choice === 'delete') { await DB.delete('body', Number(entry.dataset.bodyId)); toast('Deleted'); }
    return renderMe();
  }
  const day = e.target.closest('[data-day]');
  if (day) {
    const d = Number(day.dataset.day);
    const set = new Set(workoutDays());
    set.has(d) ? set.delete(d) : set.add(d);
    await saveSettings({ workoutDays: [...set].sort() });
    return renderMe();
  }
  const fin = e.target.closest('[data-finisher]');
  if (fin) {
    const d = Number(fin.dataset.finisher);
    const set = new Set(S.settings.finisherDays);
    set.has(d) ? set.delete(d) : set.add(d);
    await saveSettings({ finisherDays: [...set].sort() });
    return renderMe();
  }
  const fs = e.target.closest('[data-flash-strength]');
  if (fs) {
    await saveSettings({ flashStrength: fs.dataset.flashStrength });
    renderMe();
    return flash();
  }
  const sw = e.target.closest('[data-accent]');
  if (sw && sw.classList.contains('swatch')) {
    await saveSettings({ accent: sw.dataset.accent });
    return renderMe();
  }
}

async function onMeChange(e) {
  const input = e.target;
  if (input.dataset.setting) {
    const key = input.dataset.setting;
    if (key === 'skipTax' && input.checked) {
      // Back on: a fresh ledger, so the days it was off are never charged.
      Object.assign(S.ledger, { since: dateKey(), payments: [], noticesSent: 0, noticeOpen: false });
      await saveLedger();
    }
    if (key === 'lunchPrompt' && input.checked) Object.assign(S.settings, { lunchPromptSince: dateKey(), lunchReviewed: false });
    await saveSettings({ [key]: input.checked });
    if (['flash', 'skipTax', 'rewardsOn'].includes(key)) renderMe(); // show or hide the rows that depend on it
  } else if (input.dataset.equip) {
    const set = new Set(S.settings.equipment);
    input.checked ? set.add(input.dataset.equip) : set.delete(input.dataset.equip);
    await saveSettings({ equipment: [...set] });
  }
}

async function exportData() {
  const data = await DB.exportAll();
  const name = `workout-backup-${dateKey()}.json`;
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  // On iPhone a share sheet is the reliable way to save a file ("Save to Files").
  if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return markBackedUp(); }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup saved');
  markBackedUp();
}

// Written directly: saveSettings would rebuild today's plan, which a backup has no reason to touch.
async function markBackedUp() {
  S.settings.lastBackup = dateKey();
  await DB.put('settings', S.settings);
  if (S.tab === 'today') renderToday();
  else if (S.tab === 'me') renderMe();
}

// Import: pick a backup file, check it, confirm, then replace everything and restart the app.
function pickImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => { if (input.files[0]) importFile(input.files[0]); });
  input.click();
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't a workout backup"); }
  const problem = DB.checkBackup(data);
  if (problem) return toast(problem);
  const when = data.exportedAt ? fmtShortDate(new Date(data.exportedAt)) : 'an unknown date';
  const workouts = (data.stores.logs || []).filter(l => l.status === 'completed' && countsAsWorkout(l)).length;
  const weighIns = (data.stores.body || []).length;
  const choice = await actionSheet({
    title: `Replace all data with the backup from ${when} (${workouts} workout${workouts === 1 ? '' : 's'}, ${weighIns} weigh-in${weighIns === 1 ? '' : 's'})? Everything on this phone now is replaced. This can't be undone.`,
    actions: [{ label: 'Replace everything', value: 'replace', destructive: true }],
  });
  if (choice !== 'replace') return;
  const keep = S.settings.lastBackup;
  try {
    await DB.importAll(data);
  } catch (err) {
    console.error(err);
    return toast('Import failed. Nothing was changed.');
  }
  // Keep the newer "Last backup" date: the backup's own, or this phone's.
  const st = await DB.get('settings', 'app');
  if (st && keep && !(st.lastBackup >= keep)) { st.lastBackup = keep; await DB.put('settings', st); }
  toast('Data imported');
  setTimeout(() => location.reload(), 700);
}

/* ==========================================================================
   Workout player
   ========================================================================== */
const P = {
  active: false,
  mode: 'workout',      // 'workout' | 'stretch'
  workout: null,
  steps: [],
  i: 0,
  results: {},          // step index → 'done' | 'skipped'
  startedAt: null,
  stepEndsAt: null,     // ms timestamp for timed steps
  pausedRemaining: null,
  lastWhole: null,
  timer: null,
  logId: null,          // stretch mode: the log to update
  practice: false,      // Practice: the full flow, but nothing is saved
  includeStretch: false,
};

const RING_C = 2 * Math.PI * 90;

async function startWorkout({ resume = false } = {}) {
  const today = dateKey();
  const workout = await DB.get('workouts', today) || await getWorkout(today);
  if (!workout) return;
  Sound.unlock(); // inside the Start tap
  const session = resume ? await DB.get('settings', 'session') : null;
  P.mode = 'workout';
  P.practice = false;
  P.workout = workout;
  P.includeStretch = session ? !!session.includeStretch : !!S.settings.includeStretch;
  P.steps = buildSteps(workout, P.includeStretch);
  P.i = session ? Math.min(session.stepIndex, P.steps.length - 1) : 0;
  P.results = session ? session.results || {} : {};
  P.startedAt = session ? session.startedAt : new Date().toISOString();
  P.logId = null;
  openPlayer();
}

async function startStretch(logId) {
  const workout = await DB.get('workouts', dateKey());
  if (!workout) return;
  Sound.unlock();
  P.mode = 'stretch';
  P.practice = false;
  P.workout = workout;
  P.includeStretch = true;
  P.steps = buildSteps(workout, true, true);
  P.i = 0;
  P.results = {};
  P.startedAt = new Date().toISOString();
  P.logId = logId;
  openPlayer();
}

// Practice (won't count): today's plan if there is one, otherwise one built in memory.
// No log, session, plan, or progress is saved.
async function startPractice() {
  const workout = (await DB.get('workouts', dateKey())) || await generateWorkout(dateKey(), { scheduled: false, persist: false });
  P.mode = 'workout';
  P.practice = true;
  P.workout = workout;
  P.includeStretch = !!S.settings.includeStretch;
  P.steps = buildSteps(workout, P.includeStretch);
  P.i = 0;
  P.results = {};
  P.startedAt = new Date().toISOString();
  P.logId = null;
  openPlayer();
}

// A log built in memory for Practice. It never reaches storage.
function practiceLog(status) {
  const log = buildLog(status);
  log.practice = true;
  return log;
}

function openPlayer() {
  P.active = true;
  $('#p-practice').hidden = !P.practice;
  P.pausedRemaining = null;
  const el = $('#player');
  el.classList.remove('is-leaving');
  el.hidden = false;
  $('#p-paused').hidden = true;
  Wake.on();
  enterStep(false);
  clearInterval(P.timer);
  P.timer = setInterval(tick, 100);
}

function closePlayer() {
  P.active = false;
  clearInterval(P.timer);
  Wake.off();
  const el = $('#player');
  el.classList.add('is-leaving');
  setTimeout(() => { el.hidden = true; el.classList.remove('is-leaving'); }, 250);
}

function nextWorkStep(from) {
  for (let j = from + 1; j < P.steps.length; j++) if (P.steps[j].type === 'work') return P.steps[j];
  return null;
}

function enterStep(animate = true) {
  const step = P.steps[P.i];
  P.stepEndsAt = (step.type === 'rest' || step.seconds) ? Date.now() + (step.seconds * 1000) : null;
  P.lastWhole = null;
  renderStep(animate);
  saveSession();
}

function renderStep(animate) {
  const step = P.steps[P.i];
  const el = $('#player');
  const isRest = step.type === 'rest';
  const timed = !!P.stepEndsAt;
  el.classList.toggle('is-rest', isRest);
  el.classList.toggle('is-reps', !timed);

  const workStep = isRest ? nextWorkStep(P.i) : step;
  const ex = workStep ? S.exById[workStep.item.exerciseId] : null;
  const shown = isRest ? workStep : step;

  // Header: block and round
  $('#p-block').textContent = shown
    ? (shown.rounds > 1 ? `${shown.blockLabel} · Round ${shown.round} of ${shown.rounds}` : shown.blockLabel)
    : '';
  $('#p-progress-fill').style.width = `${Math.round((P.i / P.steps.length) * 100)}%`;

  if (isRest) {
    $('#p-label').textContent = ex ? `${step.label} · Next: ${workStep.side ? workStep.seconds + 's ' + workStep.side.split(' ')[0].toLowerCase() : targetText(workStep.item)}` : step.label;
    $('#p-name').textContent = ex ? ex.name : 'Almost done';
    $('#p-unit').textContent = 'seconds';
    $('#p-cue').textContent = ex ? ex.cue : '';
  } else {
    $('#p-label').textContent = step.side || (step.block === 'finisher' ? '30s on' : (step.block === 'warmup' ? 'Warm-up' : step.block === 'armcare' ? 'Arm care' : step.block === 'stretch' ? 'Stretch' : 'Go'));
    $('#p-name').textContent = ex.name;
    $('#p-cue').textContent = ex.cue;
    if (timed) {
      $('#p-unit').textContent = 'seconds';
    } else {
      $('#p-big').textContent = step.item.reps;
      $('#p-unit').textContent = step.item.perSide ? 'reps each side' : 'reps';
    }
  }
  const demo = $('#p-demo');
  if (ex?.video) { demo.href = ex.video; demo.hidden = false; } else demo.hidden = true;

  // Next up: on rest screens, the exercise coming up is already the headline, so preview the one after.
  const preview = isRest ? nextWorkStep(P.steps.indexOf(workStep)) : nextWorkStep(P.i);
  document.querySelector('.p-next-label').textContent = isRest ? 'Then' : 'Next up';
  if (preview) {
    $('#p-next-name').textContent = S.exById[preview.item.exerciseId].name;
    $('#p-next-detail').textContent = preview.side ? `${preview.seconds}s · ${preview.side.split(' ')[0]}` : targetText(preview.item);
  } else {
    $('#p-next-name').textContent = 'Finish';
    $('#p-next-detail').textContent = '';
  }

  // Buttons
  $('#p-skip').textContent = isRest ? '+15s' : 'Skip';
  $('#p-done').textContent = isRest ? 'Skip rest' : 'Done';

  // Ring
  const ring = $('#p-ring-fill');
  ring.style.transition = 'none';
  ring.style.strokeDasharray = RING_C;
  ring.style.strokeDashoffset = 0;
  void ring.offsetWidth;
  ring.style.transition = '';

  if (timed) updateTimer();

  if (animate) {
    const body = $('#p-body');
    body.classList.remove('step-in'); void body.offsetWidth; body.classList.add('step-in');
  }
}

function remainingSec() {
  if (P.pausedRemaining != null) return P.pausedRemaining;
  return Math.max(0, (P.stepEndsAt - Date.now()) / 1000);
}

function updateTimer() {
  const step = P.steps[P.i];
  const rem = remainingSec();
  const total = step.seconds || 1;
  $('#p-big').textContent = fmtClock(rem);
  $('#p-ring-fill').style.strokeDashoffset = RING_C * (1 - rem / total);
  return rem;
}

function tick() {
  if (!P.active || P.pausedRemaining != null || !P.stepEndsAt) return;
  const rem = updateTimer();
  const whole = Math.ceil(rem);
  if (whole !== P.lastWhole) {
    if (P.lastWhole != null && whole >= 1 && whole <= 3) Sound.play('tick');
    P.lastWhole = whole;
  }
  if (rem <= 0) {
    const step = P.steps[P.i];
    if (step.type === 'work') P.results[P.i] = 'done';
    advance(true);
  }
}

function advance(auto) {
  const from = P.steps[P.i];
  P.i++;
  if (P.i >= P.steps.length) return finishPlayer();
  const to = P.steps[P.i];
  if (auto) cue(to.type === 'work' ? 'go' : 'done');
  else if (from.type === 'rest' && to.type === 'work') Sound.play('go');
  enterStep(true);
}

function onDone() {
  const step = P.steps[P.i];
  if (step.type === 'work') P.results[P.i] = 'done';
  advance(false);
}

function onSkip() {
  const step = P.steps[P.i];
  if (step.type === 'rest') {           // +15s
    P.stepEndsAt += 15000;
    step.seconds += 15;
    P.lastWhole = null;
    updateTimer();
    return;
  }
  P.results[P.i] = 'skipped';
  advance(false);
}

function isPaused() { return P.pausedRemaining != null; }

function pausePlayer() {
  if (!P.active || isPaused()) return;
  if (P.stepEndsAt) P.pausedRemaining = remainingSec();
  else { P.pausedRemaining = 0; P._pausedUntimed = true; }
  $('#p-paused').hidden = false;
  saveSession();
}

// Called from a tap, so it can also re-unlock audio.
function resumePlayer() {
  if (!isPaused()) return;
  if (!P._pausedUntimed) P.stepEndsAt = Date.now() + P.pausedRemaining * 1000;
  P._pausedUntimed = false;
  P.pausedRemaining = null;
  P.lastWhole = null;
  $('#p-paused').hidden = true;
  Sound.unlock();
  Wake.on();
}

function togglePause() { isPaused() ? resumePlayer() : pausePlayer(); }

async function onClose() {
  const wasPaused = P.pausedRemaining != null;
  if (!wasPaused) togglePause();
  const anyDone = Object.values(P.results).includes('done');
  const choice = await actionSheet({
    title: P.mode === 'stretch' ? 'End the stretch?'
      : P.practice ? 'End practice? Nothing is saved.'
      : (anyDone ? 'End the workout? What you did so far is saved.' : 'End the workout?'),
    actions: [{ label: P.mode === 'stretch' ? 'End stretch' : P.practice ? 'End practice' : 'End workout', value: 'end', destructive: true }],
  });
  if (choice !== 'end') { if (!wasPaused) togglePause(); return; }
  $('#p-paused').hidden = true;
  P.pausedRemaining = null;
  P._pausedUntimed = false;
  if (P.mode === 'stretch') {
    if (anyDone) await markStretchDone(P.logId);
    closePlayer();
    return showTab(S.tab);
  }
  if (P.practice) {
    const log = anyDone ? practiceLog('partial') : null;
    closePlayer();
    await showTab('today');
    if (log && countsAsWorkout(log)) openCheckIn(log);
    else toast('Practice: nothing saved');
    return;
  }
  const log = anyDone ? await saveLog('partial') : null;
  await DB.delete('settings', 'session');
  closePlayer();
  await showTab('today');
  if (log && countsAsWorkout(log)) openCheckIn(log);
}

function saveSession() {
  if (P.mode !== 'workout' || P.practice) return;
  DB.put('settings', {
    key: 'session',
    workoutId: P.workout.id,
    stepIndex: P.i,
    results: P.results,
    startedAt: P.startedAt,
    includeStretch: P.includeStretch,
  }).catch(() => {});
}

async function finishPlayer() {
  if (P.mode === 'stretch') {
    await markStretchDone(P.logId);
    closePlayer();
    toast('Stretch logged');
    return showTab('today');
  }
  cue('done');
  const before = await weekSummary();
  const streakBefore = (await currentStreak()).count;
  if (P.practice) {
    closePlayer();
    return showCompletion(practiceLog('completed'), before.done, before.done, before.planned, streakBefore, streakBefore);
  }
  const pointsBefore = (await bankStatus()).earned;
  const log = await saveLog('completed');
  await DB.delete('settings', 'session');
  const after = await weekSummary();
  const streakAfter = (await currentStreak()).count;
  const points = (await bankStatus()).earned - pointsBefore;
  closePlayer();
  showCompletion(log, before.done, after.done, before.planned, streakBefore, streakAfter, points);
}

/* ---------- Logging ---------- */
function buildLog(status) {
  const sets = {};      // setKey → { done, skipped }
  const exercises = {}; // block:exerciseId → summary
  P.steps.forEach((step, idx) => {
    if (step.type !== 'work') return;
    const key = `${step.block}:${step.item.exerciseId}`;
    const ex = exercises[key] ||= {
      exerciseId: step.item.exerciseId,
      ladderId: step.item.ladderId,
      rungIndex: step.item.rungIndex,
      block: step.block,
      target: step.item.unit === 'seconds' ? step.item.seconds : step.item.reps,
      unit: step.item.unit,
      perSide: step.item.perSide,
      alt: !!step.item.alt,
      swappedFrom: step.item.swappedFrom || null,
      setsPlanned: 0, setsDone: 0, setsSkipped: 0,
    };
    const set = sets[step.setKey] ||= { ex, done: false, skipped: false, counted: false };
    if (!set.counted) { ex.setsPlanned++; set.counted = true; }
    if (P.results[idx] === 'done') set.done = true;
    if (P.results[idx] === 'skipped') set.skipped = true;
  });
  for (const set of Object.values(sets)) {
    if (set.done) set.ex.setsDone++;
    else if (set.skipped) set.ex.setsSkipped++;
  }
  const list = Object.values(exercises);
  const finished = new Date();
  const main = list.filter(e => e.block !== 'stretch');
  return {
    workoutId: P.workout.id,
    date: P.workout.date,
    dayType: P.workout.dayType,
    name: P.workout.name,
    scheduled: P.workout.scheduled,
    kind: P.workout.mobility ? 'mobility' : P.workout.minimum ? 'minimum' : 'full',
    short: !!P.workout.short,
    status,
    startedAt: P.startedAt,
    finishedAt: finished.toISOString(),
    durationSec: Math.round((finished - new Date(P.startedAt)) / 1000),
    setsPlanned: main.reduce((n, e) => n + e.setsPlanned, 0),
    setsDone: main.reduce((n, e) => n + e.setsDone, 0),
    exercises: list,
    stretchDone: list.some(e => e.block === 'stretch' && e.setsDone > 0),
    schema: 2,     // logs from Phase 1 have no schema and never ask for a check-in
    checkIn: null, // set by the check-in; null means no rating
  };
}

async function saveLog(status) {
  const log = buildLog(status);
  log.id = await DB.put('logs', log);
  return log;
}

async function markStretchDone(logId) {
  if (logId == null) return;
  const log = await DB.get('logs', logId);
  if (!log) return;
  log.stretchDone = true;
  await DB.put('logs', log);
}

/* ---------- Completion moment ---------- */
function showCompletion(log, fromCount, toCount, planned, streakFrom = 0, streakTo = streakFrom, points = 0) {
  S.lastLog = log;
  const el = $('#complete');
  $('#c-title').textContent = log.practice ? 'Practice done' : log.kind === 'minimum' ? 'You showed up' : 'Workout done';
  const pts = points > 0 && S.settings.rewardsOn ? ` · +${points} points` : '';
  $('#c-sub').textContent = `${log.name} · ${fmtMinutes(log.durationSec)}${log.practice ? ' · not saved' : pts}`;
  $('#c-practice').hidden = !log.practice;
  $('#c-done').textContent = countsAsWorkout(log) ? 'Check in' : 'Done';
  const count = $('#c-count');
  count.textContent = fromCount;
  count.classList.remove('tick');
  $('#c-of').textContent = ` of ${planned}`;
  const streak = $('#c-streak');
  streak.textContent = streakFrom;
  streak.classList.remove('tick');
  const stretchBtn = $('#c-stretch');
  const canStretch = !log.practice && !log.stretchDone && P.workout.blocks.some(b => b.kind === 'stretch');
  stretchBtn.hidden = !canStretch;
  stretchBtn.dataset.logId = log.id;
  el.querySelector('.c-actions').classList.toggle('single', !canStretch);
  el.classList.remove('play');
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('play');
  // The count ticks up once the ring has closed and the check has drawn.
  setTimeout(() => {
    if (toCount !== fromCount) {
      count.textContent = toCount;
      void count.offsetWidth;
      count.classList.add('tick');
    }
    if (streakTo !== streakFrom) {
      streak.textContent = streakTo;
      void streak.offsetWidth;
      streak.classList.add('tick');
    }
  }, 1050);
}

function hideCompletion() {
  const el = $('#complete');
  el.hidden = true;
  el.classList.remove('play');
}

/* ==========================================================================
   Check-in: one question per screen, under 30 seconds
   ========================================================================== */
const CI = { log: null, step: null, trail: [], rows: {}, reasons: {}, overall: null, knees: null, preview: null };

function ciPath() {
  const path = ['rows', 'overall', 'knees'];
  if (CI.log.practice) path.push('preview');
  return path;
}

// An ended-early workout uses the same screens, its unstarted rows starting on Didn't finish.
function openCheckIn(log) {
  Object.assign(CI, { log, trail: [], rows: Adapt.defaultRows(log), reasons: {}, overall: null, knees: null });
  hideCompletion();
  const el = $('#checkin');
  el.hidden = false;
  el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
  CI.step = null;
  ciGo(ciPath()[0], false);
}

function closeCheckIn() { $('#checkin').hidden = true; }

function ciGo(step, remember = true) {
  if (remember && CI.step) CI.trail.push(CI.step);
  CI.step = step;
  renderCheckIn();
}

// One exercise: Easy · Fine · Hard · Didn't finish, and the reasons once Didn't finish is picked.
function ciRowHtml(e) {
  const id = e.exerciseId;
  const v = CI.rows[id];
  const sets = e.setsDone < e.setsPlanned ? `${e.setsDone} of ${e.setsPlanned} sets` : `${e.setsPlanned} sets`;
  return `
    <div class="ci-ex" data-row="${esc(id)}">
      <div class="ci-ex-name">${esc(exName(id))}</div>
      <div class="ci-ex-sub num">${e.block === 'finisher' ? 'Finisher · ' : ''}${sets}</div>
      <div class="ci-chips four">${Object.entries(Adapt.ROWS).map(([k, label]) => `
        <button class="ci-chip row-${k} ${v === k ? 'on' : ''}" data-ci-row="${k}" data-ex="${esc(id)}">${label}</button>`).join('')}
      </div>
      ${v === 'dnf' ? `
      <div class="ci-why">
        <div class="ci-why-label">Why? <span class="muted">Optional</span></div>
        <div class="ci-chips">${Object.entries(Adapt.REASONS).map(([k, label]) => `
          <button class="ci-chip ${CI.reasons[id] === k ? 'on' : ''}" data-ci-reason="${k}" data-ex="${esc(id)}">${label}</button>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
}

function renderCheckIn() {
  const path = ciPath();
  const at = path.indexOf(CI.step);
  $('#ci-dots').innerHTML = path.map((_, i) => `<span class="${i <= at ? 'on' : ''}"></span>`).join('');
  $('#ci-back').style.visibility = CI.trail.length && CI.step !== 'preview' ? 'visible' : 'hidden';
  $('#ci-later').style.visibility = CI.step === 'preview' ? 'hidden' : 'visible';
  $('#ci-practice').hidden = !CI.log.practice;

  const q = (title, sub = '') => `<h1 class="ci-q">${esc(title)}</h1>${sub ? `<p class="ci-sub">${esc(sub)}</p>` : ''}`;
  let html = '';
  if (CI.step === 'rows') {
    html = q('How did each one feel?', 'Everything starts on Fine. Tap any that weren’t.') +
      `<div class="ci-list">${Adapt.rowEntries(CI.log).map(ciRowHtml).join('')}</div>
      <button class="btn btn-primary btn-xl ci-next" data-ci-next>Continue</button>`;
  } else if (CI.step === 'overall') {
    html = q('Overall?') + `
      <div class="ci-list">
        <button class="ci-choice overall-good" data-ci-overall="good">Good</button>
        <button class="ci-choice overall-wiped" data-ci-overall="wiped">Wiped out</button>
      </div>`;
  } else if (CI.step === 'knees') {
    html = q('Knees today?') + `<div class="ci-list">${Adapt.KNEES.map((k, i) => `
      <button class="ci-choice knee-${i}" data-ci-knees="${i}">${k}</button>`).join('')}</div>`;
  } else if (CI.step === 'preview') {
    const lines = CI.preview.map(changeText).filter(Boolean);
    html = q('What would change', 'Practice only. Nothing was saved.') + `<div class="ci-list">${
      lines.length ? lines.map(l => `<div class="ci-preview">${esc(l)}</div>`).join('')
        : '<div class="ci-preview muted">No changes. Everything would stay where it is.</div>'}</div>
      <button class="btn btn-primary btn-xl ci-next" data-ci-done>Done</button>`;
  }
  const body = $('#ci-body');
  body.innerHTML = html;
  body.classList.remove('step-in'); void body.offsetWidth; body.classList.add('step-in');
  body.scrollTop = 0;
}

// Redraw one row in place, so tapping chips doesn't replay the screen animation.
function ciRedrawRow(id) {
  const e = Adapt.rowEntries(CI.log).find(x => x.exerciseId === id);
  const el = [...document.querySelectorAll('#ci-body [data-row]')].find(x => x.dataset.row === id);
  if (e && el) el.outerHTML = ciRowHtml(e);
}

function onCheckInClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'ci-back') { if (CI.trail.length) { CI.step = CI.trail.pop(); renderCheckIn(); } return; }
  if (t.id === 'ci-later' || t.hasAttribute('data-ci-done')) {
    closeCheckIn();
    showTab('today');
    return toast(CI.log.practice ? 'Practice: nothing saved' : 'You can check in from Today');
  }
  if (t.dataset.ciRow) {
    const id = t.dataset.ex;
    CI.rows[id] = t.dataset.ciRow;
    if (CI.rows[id] !== 'dnf') delete CI.reasons[id];
    return ciRedrawRow(id);
  }
  if (t.dataset.ciReason) {
    const id = t.dataset.ex;
    if (CI.reasons[id] === t.dataset.ciReason) delete CI.reasons[id];
    else CI.reasons[id] = t.dataset.ciReason;
    return ciRedrawRow(id);
  }
  if (t.hasAttribute('data-ci-next')) return ciGo('overall');
  if (t.dataset.ciOverall) { CI.overall = t.dataset.ciOverall; return ciGo('knees'); }
  if (t.dataset.ciKnees) { CI.knees = Number(t.dataset.ciKnees); return saveCheckIn(); }
}

async function saveCheckIn() {
  // Re-read: the stretch may have updated this log since the check-in opened. Practice logs have no id.
  const log = CI.log.practice ? CI.log : ((await DB.get('logs', CI.log.id)) || CI.log);
  const checkIn = {
    v: 2,
    rows: { ...CI.rows },
    reasons: Object.fromEntries(Object.entries(CI.reasons).filter(([id]) => CI.rows[id] === 'dnf')),
    overall: CI.overall,
    knees: CI.knees,
    at: new Date().toISOString(),
  };
  const earlier = (await DB.getAll('logs'))
    .filter(l => l.id !== log.id && l.checkIn)
    .sort((a, b) => a.checkIn.at.localeCompare(b.checkIn.at));
  const copy = o => JSON.parse(JSON.stringify(o));
  const res = Adapt.applyCheckIn({
    log, checkIn, earlier,
    progression: copy(S.progression), adapt: copy(S.adapt),
    ladders: S.ladders, exById: S.exById, usable,
    dayTypeLadders: DAY_TYPES[log.dayType]?.circuit || [],
  });
  if (log.practice) {
    // Show what this check-in would change, on copies, and stop before anything is stored.
    CI.preview = res.applied;
    return ciGo('preview', false);
  }
  checkIn.applied = res.applied;
  log.checkIn = checkIn;
  await DB.put('logs', log);
  for (const lid of res.changed) {
    const rec = res.progression[lid];
    const mine = res.applied.filter(c => c.ladderId === lid);
    if (mine.length) rec.history = [...(rec.history || []), { date: log.date, logId: log.id, changes: mine }].slice(-50);
    rec.updatedAt = checkIn.at;
    S.progression[lid] = rec;
    await DB.put('progression', rec);
  }
  S.adapt = res.adapt;
  await saveAdapt();

  closeCheckIn();
  await showTab('today');
  const ups = res.applied.filter(c => c.change === 'rungUp');
  if (ups.length) showLevelUp(ups);
  else toast(res.applied.length ? 'Saved. Next workout adjusted.' : 'Saved');
}

// One line per change, for the Practice preview: "Next time: Push-up 13".
function changeText(c) {
  const name = exName(c.exerciseId || c.from);
  switch (c.change) {
    case 'target':
      if (c.field === 'points') return `Next time: ${name}, ${c.to} of 3 points toward the next level`;
      return `Next time: ${name} ${c.field === 'secondsTarget' ? `${c.to}s` : c.to}`;
    case 'rungUp': return `Level up: ${exName(c.from)} → ${exName(c.to)}`;
    case 'rungDown': return `Easier: ${exName(c.from)} → ${exName(c.to)}`;
    case 'hide': return `${name} hidden until ${fmtShortDate(parseKey(c.to))}`;
    case 'swapKnee': return `Knee support in place of ${name} next time`;
    case 'short': return 'Next workout: one less exercise, no finisher';
    case 'light': return 'Next workout: lighter, 2 fewer reps and no finisher';
    case 'lightLegs': return 'Next workout with leg moves: 2 fewer reps on those';
    case 'rest': return `${fmtShortDate(parseKey(c.to))} becomes a rest day`;
    default: return '';
  }
}

/* ---------- Level up: old → new exercise. Silent, under 2 s. ---------- */
function showLevelUp(ups) {
  $('#lu-inner').innerHTML = `
    <div class="lu-badge">${ICONS.levelUp}</div>
    <h1 class="lu-title">Level up</h1>
    ${ups.map(c => `
      <div class="lu-pair">
        <div class="lu-old">${esc(exName(c.from))}</div>
        <div class="lu-arrow">${ICONS.arrowDown}</div>
        <div class="lu-new">${esc(exName(c.to))}</div>
      </div>`).join('')}`;
  const el = $('#levelup');
  el.classList.remove('play');
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('play');
}

/* ---------- Morning soreness: "Very sore" turns today into mobility + arm care ---------- */
async function setSoreness(level) {
  const today = dateKey();
  const w = await DB.get('workouts', today);
  if (!w) return;
  if (level === 'very') {
    await giveBackMods(w); // lighter / shorter / knee swap carry over to the next workout
    S.adapt.soreDates = [...new Set([...(S.adapt.soreDates || []), today])];
    await saveAdapt();
    await DB.put('workouts', mobilityVersion(w));
  } else {
    w.soreness = level;
    await DB.put('workouts', w);
  }
  renderToday();
}

async function undoSoreness() {
  const today = dateKey();
  S.adapt.soreDates = (S.adapt.soreDates || []).filter(d => d !== today);
  await saveAdapt();
  await DB.delete('workouts', today);
  const w = await generateWorkout(today);
  w.soreness = 'undone'; // don't ask again today
  await DB.put('workouts', w);
  renderToday();
}

/* ==========================================================================
   Updates: a new service worker waits until you tap the banner on Today
   ========================================================================== */
const Update = {
  waiting: null,
  applying: false,
  found(worker) {
    this.waiting = worker;
    if (S.tab === 'today') renderToday();
  },
  async register() {
    const reg = await navigator.serviceWorker.register('service-worker.js');
    // Only an update gets the banner. The very first install (no controller yet) just caches.
    const watch = w => w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) this.found(w);
    });
    if (reg.waiting && navigator.serviceWorker.controller) this.found(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // Reload only when the banner asked for it, not when the first install claims the page.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!this.applying) return;
      this.applying = false;
      location.reload();
    });
    // A home-screen app can stay open for days, so look for a new version whenever it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  },
  apply() {
    if (!this.waiting || this.waiting.state === 'redundant') return location.reload();
    this.applying = true;
    this.waiting.postMessage({ type: 'SKIP_WAITING' });
  },
};

/* ==========================================================================
   Boot
   ========================================================================== */
async function finalizeStaleSession() {
  const session = await DB.get('settings', 'session');
  if (!session || session.workoutId === dateKey()) return;
  // A workout left open on an earlier day: save what was done, then clear it.
  const workout = await DB.get('workouts', session.workoutId);
  if (workout && Object.values(session.results || {}).includes('done')) {
    Object.assign(P, { mode: 'workout', workout, steps: buildSteps(workout, !!session.includeStretch), results: session.results, startedAt: session.startedAt });
    const log = buildLog('partial');
    log.finishedAt = log.startedAt;
    log.durationSec = 0;
    await DB.put('logs', log);
  }
  await DB.delete('settings', 'session');
}

// Real or Practice, for any session that isn't today's planned workout.
async function chooseSession(title) {
  const choice = await actionSheet({
    title,
    actions: [{ label: 'Real workout', value: 'real' }, { label: "Practice (won't count)", value: 'practice' }],
  });
  if (choice) Sound.unlock(); // still inside the sheet tap, before any await
  return choice;
}

function bindEvents() {
  $('#tabbar').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.tab !== S.tab) showTab(tab.dataset.tab);
    else if (tab) $('#views').scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.body.addEventListener('click', async e => {
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (!act) return;
    if (act === 'start') {
      const today = dateKey();
      const session = await DB.get('settings', 'session');
      const resume = !!session && session.workoutId === today;
      const doneToday = (await logsFor(today)).some(l => l.status === 'completed');
      const w = await DB.get('workouts', today);
      const planned = w?.scheduled !== false;
      // Today's planned workout (or resuming one) starts straight away. Anything extra asks first.
      if (!resume && (doneToday || !planned)) {
        const choice = await chooseSession(doneToday ? 'Train again' : 'Extra workout');
        if (choice === 'practice') return startPractice();
        if (choice !== 'real') return;
      }
      // After a 5-minute show-up, training again means the full workout.
      if (!resume && doneToday && w?.minimum) await DB.put('workouts', await fromMinimum(w));
      startWorkout({ resume });
    } else if (act === 'train-anyway') {
      const choice = await chooseSession('Train on a rest day');
      if (choice === 'practice') return startPractice();
      if (choice !== 'real') return;
      await generateWorkout(dateKey(), { scheduled: false });
      startWorkout();
    } else if (act === 'practice') {
      Sound.unlock(); // inside the tap
      startPractice();
    } else if (act === 'stretch') {
      const log = (await logsFor(dateKey())).filter(l => l.status === 'completed').pop();
      startStretch(log?.id);
    } else if (act === 'checkin') {
      const log = pendingCheckIn(await logsFor(dateKey()));
      if (log) openCheckIn(log);
    } else if (act === 'ramp-accept') {
      const phase = Number(e.target.closest('[data-phase]').dataset.phase);
      S.adapt.phaseSince = dateKey();
      S.adapt.rampDismissed = null;
      await saveAdapt();
      await saveSettings({ phase, workoutDays: PHASE_DAYS[phase] });
      toast(`Phase ${phase}: ${daysText(PHASE_DAYS[phase])}`);
      renderToday();
    } else if (act === 'ramp-dismiss') {
      S.adapt.rampDismissed = dateKey(weekStart());
      await saveAdapt();
      renderToday();
    } else if (act === 'weigh-in') {
      Weigh.open({ prompted: false });
    } else if (act === 'update') {
      Update.apply();
    } else if (act === 'export') {
      exportData();
    } else if (act === 'import') {
      pickImportFile();
    } else if (act === 'backup-skip') {
      S.settings.backupSkipped = dateKey();
      await DB.put('settings', S.settings);
      renderToday();
    } else if (act === 'short' || act === 'full' || act === 'minimum') {
      const w = await DB.get('workouts', dateKey());
      if (!w) return;
      const next = act === 'short' ? shortVersion(w)
        : act === 'minimum' ? await toMinimum(w)
        : w.minimum ? await fromMinimum(w) : fullVersion(w);
      await DB.put('workouts', next);
      renderToday();
    } else if (act === 'excuse' || act === 'unexcuse') {
      const key = e.target.closest('[data-day]').dataset.day;
      if (act === 'excuse') await excuseDay(key);
      else await unexcuseDay(key);
      showTab(S.tab);
    } else if (act === 'paid') {
      const owed = (await ledgerStatus()).owed;
      if (!owed) return renderToday();
      const choice = await actionSheet({ title: `Mark ${money(owed)} as paid? The ledger goes back to $0.`, actions: [{ label: 'Paid', value: 'paid' }] });
      if (choice !== 'paid') return;
      S.ledger.payments.push({ date: dateKey(), at: new Date().toISOString(), amount: owed });
      Object.assign(S.ledger, { noticesSent: 0, noticeOpen: false });
      await saveLedger();
      toast('Paid. Clean slate.');
      renderToday();
    } else if (act === 'notice-open') {
      // The link itself opens Messages. There's no way to know it was sent, so the card asks afterward.
      S.ledger.noticeOpen = true;
      await saveLedger();
      setTimeout(() => { if (S.tab === 'today') renderToday(); }, 600);
    } else if (act === 'notice-sent') {
      const owed = (await ledgerStatus()).owed;
      S.ledger.noticesSent = Math.max(S.ledger.noticesSent + 1, Math.floor(owed / S.settings.noticeThreshold));
      S.ledger.noticeOpen = false;
      await saveLedger();
      renderToday();
    } else if (act === 'notice-setup') {
      editNotice();
    } else if (act === 'reward-add') {
      editReward(null);
    } else if (act === 'scorecard-seen') {
      S.settings.scorecardSeen = dateKey();
      await DB.put('settings', S.settings);
      renderToday();
    } else if (act === 'sore') {
      setSoreness(e.target.closest('[data-sore]').dataset.sore);
    } else if (act === 'unsore') {
      undoSoreness();
    } else if (act === 'go-food') {
      showTab('food');
    } else if (act === 'protein') {
      await addProtein(Number(e.target.closest('[data-g]').dataset.g));
      renderFood();
    } else if (act === 'protein-undo') {
      await undoProtein();
      renderFood();
    } else if (act === 'meal-quick') {
      await quickMeal(e.target.closest('[data-slot]').dataset.slot);
      renderFood();
    } else if (act === 'snack-add') {
      await quickMeal('snack');
      renderFood();
    } else if (act === 'lunch-plan') {
      await openLunchSheet();
      renderFood();
    } else if (act === 'golunch-add') {
      await editGoToLunch(null);
      renderFood();
    } else if (act === 'ff-add') {
      await editFastFood(null);
      renderFood();
    } else if (act === 'desk-log') {
      await logDeskBreak();
      renderToday();
    } else if (act === 'desk-moves') {
      showDeskMoves();
    } else if (act === 'stand') {
      const day = await getDay(dateKey());
      day.stood = !day.stood;
      await saveDay(day);
      renderToday();
    } else if (act === 'lunch-review-keep' || act === 'lunch-review-off') {
      S.settings.lunchReviewed = true;
      if (act === 'lunch-review-off') S.settings.lunchPrompt = false;
      await DB.put('settings', S.settings);
      toast(act === 'lunch-review-off' ? 'Lunch prompt off. Turn it back on in Me.' : 'Keeping the lunch prompt');
      renderToday();
    } else if (act === 'food-settings') {
      editFoodSettings();
    } else if (act === 'test-cue') {
      Sound.unlock();
      setTimeout(() => cue('go'), 50);
      setTimeout(() => { const d = $('#audio-debug'); if (d) d.textContent = audioDebugText(); }, 400);
    }
  });

  $('#view-me').addEventListener('click', onMeClick);
  $('#view-me').addEventListener('click', onChartPoint);
  $('#view-me').addEventListener('pointermove', onChartPoint);
  $('#view-history').addEventListener('click', onHistoryClick);
  $('#view-food').addEventListener('click', onFoodClick);
  $('#wsheet-form').addEventListener('submit', e => { e.preventDefault(); Weigh.save(); });
  $('#wsheet').addEventListener('click', e => {
    const w = e.target.closest('[data-w]')?.dataset.w;
    if (w === 'skip') Weigh.skip();
    else if (w === 'dismiss') Weigh.close(); // backdrop: not a skip, so it can ask again next time
  });
  $('#view-me').addEventListener('change', onMeChange);

  $('#p-done').addEventListener('click', onDone);
  $('#p-skip').addEventListener('click', onSkip);
  $('#p-pause').addEventListener('click', togglePause);
  $('#p-paused').addEventListener('click', togglePause);
  $('#p-close').addEventListener('click', onClose);
  // Opening the demo leaves the app (YouTube), so stop the clock first. The link still opens.
  $('#p-demo').addEventListener('click', pausePlayer);

  // Re-unlock audio on the next tap if iOS suspended or interrupted it.
  document.addEventListener('touchend', () => {
    if (Sound.ctx && Sound.ctx.state !== 'running') Sound.unlock();
  }, { capture: true, passive: true });

  $('#c-done').addEventListener('click', () => {
    if (countsAsWorkout(S.lastLog)) return openCheckIn(S.lastLog);
    hideCompletion();
    showTab('today');
  });
  $('#checkin').addEventListener('click', onCheckInClick);
  $('#lu-done').addEventListener('click', () => { $('#levelup').hidden = true; });
  $('#c-stretch').addEventListener('click', e => {
    const logId = Number(e.currentTarget.dataset.logId);
    hideCompletion();
    showTab('today');
    startStretch(Number.isNaN(logId) ? null : logId);
  });

  // Leaving the app pauses the workout. Coming back shows Paused until you tap.
  window.addEventListener('pagehide', pausePlayer);
  window.addEventListener('pageshow', () => Sound.resume());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return pausePlayer();
    Sound.resume();
    if (S.tab === 'me') { const d = $('#audio-debug'); if (d) d.textContent = audioDebugText(); }
    if (P.active) {
      Wake.on();
      return;
    }
    if (S.todayKey && S.todayKey !== dateKey() && S.tab === 'today') renderToday(); // the app was left open overnight
    maybeAskWeighIn().then(maybeAskLunch);
  });
}

async function boot() {
  await DB.init();
  await loadSettings();
  await loadAdapt();
  await loadHabits();
  await loadSchedule();
  applyAccent();
  await loadExercises();
  await loadProgression();
  await finalizeStaleSession();
  bindEvents();
  await showTab('today');
  maybeAskWeighIn().then(maybeAskLunch);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    Update.register().catch(err => console.warn('SW registration failed', err));
  }
}

boot().catch(err => {
  console.error(err);
  document.getElementById('view-today').innerHTML =
    `<div class="card" style="margin-top:60px"><strong>Something went wrong loading the app.</strong><p class="muted">${esc(err.message)}</p></div>`;
});
