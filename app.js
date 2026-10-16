'use strict';

/* ==========================================================================
   Workout PWA, Phase 1 (core)
   Plan generator · workout player · completion logging · settings
   ========================================================================== */

const APP_VERSION = '1.0.1';

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
  schemaVersion: 1,
  equipment: ['db5', 'db10', 'db20', 'trx', 'jband', 'loopband', 'medball6', 'chair', 'bodyweight'],
  quietMode: true,            // always on; shown locked in Settings
  workoutDays: [1, 3, 5],     // Mon / Wed / Fri
  finisherDays: [1, 5],       // Mon / Fri (work-from-home days)
  phase: 1,
  accent: 'orange',
  sound: true,
  flash: true,
  flashStrength: 'bold',      // 'bold' | 'subtle'
  includeStretch: false,
  restBetweenRoundsSec: 60,
  transitionSec: 15,
};

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

// Phase 1: every workout day is Full Body, A and B alternating.
// Both include a push movement (chest every session).
const DAY_TYPES = {
  fullA: { name: 'Full Body A', circuit: ['push', 'squat', 'pull', 'core'], armCare: ['band-er-ir', 'jband-reverse-fly', 'prone-ytw'] },
  fullB: { name: 'Full Body B', circuit: ['push', 'hinge', 'pull', 'chestFly'], armCare: ['band-er-ir', 'jband-reverse-fly', 'scap-pushup'] },
};

// Session length caps. Rounds drop from 3 to 2 to fit; nothing is ever padded.
const CAP_STANDARD_SEC = 18 * 60;
const CAP_FINISHER_SEC = 22 * 60;
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
  lock: '<svg viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  volume: '<svg viewBox="0 0 24 24"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.7"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  utensils: '<svg viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
};

/* ---------- App state ---------- */
const S = {
  ex: null,          // exercises.json
  exById: {},        // exerciseId → { ...exercise, ladderId, rungIndex }
  ladders: {},       // ladderId → ladder
  settings: null,
  progression: {},   // ladderId → progression record
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
function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); return sec >= 60 ? `${Math.floor(sec / 60)}:${pad2(sec % 60)}` : String(sec); }

function workoutDays() { return (S.settings.workoutDays || []).filter(d => d !== SATURDAY).sort(); }
function isWorkoutDay(dow) { return workoutDays().includes(dow); }

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
  const last = logs
    .filter(l => l.status === 'completed' && l.date < beforeDate)
    .sort((a, b) => (a.finishedAt || '').localeCompare(b.finishedAt || ''))
    .pop();
  return last?.dayType === 'fullA' ? 'fullB' : 'fullA';
}

async function generateWorkout(dKey, { scheduled = true } = {}) {
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

  const circuitItems = tpl.circuit.map(lid => {
    const idx = pickRung(lid, dKey);
    if (idx < 0) return null;
    return itemFor(S.exById[S.ladders[lid].rungs[idx].id], S.progression[lid]);
  }).filter(Boolean);
  const circuit = {
    kind: 'circuit', label: 'Main', rounds: MAX_ROUNDS,
    restSec: st.transitionSec, restBetweenRoundsSec: st.restBetweenRoundsSec,
    items: circuitItems,
  };
  blocks.push(circuit);

  const hasFinisher = (st.finisherDays || []).includes(dow);
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
    createdAt: new Date().toISOString(),
  };
  workout.estSec = estimateSec(workout, false);
  workout.estStretchSec = estimateSec({ blocks: workout.blocks.filter(b => b.kind === 'stretch') }, true, true);
  await DB.put('workouts', workout);
  return workout;
}

async function getWorkout(dKey) {
  const w = await DB.get('workouts', dKey);
  if (w) return w;
  if (isWorkoutDay(parseKey(dKey).getDay())) return generateWorkout(dKey);
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
  if (!saved) await DB.put('settings', S.settings);
}

async function saveSettings(patch) {
  Object.assign(S.settings, patch);
  S.settings.workoutDays = S.settings.workoutDays.filter(d => d !== SATURDAY);
  S.settings.finisherDays = (S.settings.finisherDays || []).filter(d => S.settings.workoutDays.includes(d));
  await DB.put('settings', S.settings);
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
  await DB.delete('workouts', today);
  if (existing && !existing.scheduled) await generateWorkout(today, { scheduled: false });
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

async function logsFor(dKey) {
  return (await DB.getAll('logs')).filter(l => l.date === dKey);
}

async function weekSummary(ref = new Date()) {
  const start = weekStart(ref);
  const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
  const logs = (await DB.getAll('logs')).filter(l => l.status === 'completed' && keys.includes(l.date));
  const doneDates = new Set(logs.map(l => l.date));
  return { keys, doneDates, planned: workoutDays().length, done: doneDates.size };
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
  else if (tab === 'food') renderFood();
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
  let workout = await DB.get('workouts', today);
  if (!workout && isWorkoutDay(dow)) workout = await generateWorkout(today);

  let hero = '';
  let dock = '';

  if (doneToday) {
    const log = todaysLogs.filter(l => l.status === 'completed').pop();
    hero = `
      <div class="card hero hero-done">
        <div class="done-icon">${ICONS.check}</div>
        <div class="hero-kicker" style="color:var(--win)">Done for today</div>
        <div class="hero-title">${esc(log.name || DAY_TYPES[log.dayType]?.name || 'Workout')}</div>
        <div class="hero-meta">
          <span class="chip">${ICONS.clock}<span class="num">${fmtMinutes(log.durationSec)}</span></span>
          <span class="chip win">${ICONS.check}<span class="num">${log.setsDone} of ${log.setsPlanned} sets</span></span>
        </div>
      </div>`;
    if (!log.stretchDone && workout?.blocks.some(b => b.kind === 'stretch')) {
      dock = `<button class="btn btn-secondary btn-xl" data-action="stretch">Stretch 5 min</button>`;
    }
  } else if (workout) {
    const circuit = workout.blocks.find(b => b.kind === 'circuit');
    const finisher = workout.blocks.find(b => b.kind === 'finisher');
    const armcare = workout.blocks.find(b => b.kind === 'armcare');
    const resuming = session && session.workoutId === today;
    const exRows = items => items.map(it => {
      const ex = S.exById[it.exerciseId];
      return `<li><span class="ex-name">${esc(ex.name)}</span><span class="ex-target">${esc(targetText(it))}</span></li>`;
    }).join('');
    hero = `
      <div class="card hero">
        <div class="hero-kicker">${workout.scheduled ? "Today's workout" : 'Extra workout'}</div>
        <div class="hero-title">${esc(workout.name)}</div>
        <div class="hero-meta">
          <span class="chip accent">${ICONS.clock}<span class="num">~${fmtMinutes(workout.estSec)}</span></span>
          <span class="chip">${ICONS.list}<span class="num">${circuit?.items.length || 0} exercises</span></span>
          <span class="chip">${ICONS.repeat}<span class="num">${circuit?.rounds || 0} rounds</span></span>
          ${finisher ? `<span class="chip">${ICONS.zap}Finisher</span>` : ''}
        </div>
        <ul class="ex-list">
          ${circuit ? `<li class="ex-block">Main circuit</li>${exRows(circuit.items)}` : ''}
          ${finisher ? `<li class="ex-block">Finisher · 30s on / 30s off</li>${exRows(finisher.items)}` : ''}
          ${armcare ? `<li class="ex-block">Arm care</li>${exRows(armcare.items)}` : ''}
        </ul>
      </div>`;
    dock = `<button class="btn btn-primary btn-xl" data-action="start">${resuming ? 'Resume workout' : 'Start workout'}</button>`;
  } else {
    const next = nextWorkoutDay(now);
    hero = `
      <div class="card hero hero-rest">
        <div class="rest-icon">${ICONS.moon}</div>
        <div class="hero-title">Rest day</div>
        <p>Walk, stretch, or nothing.</p>
        ${next ? `<p style="margin-top:10px">Next workout: <strong style="color:var(--text)">${esc(next)}</strong></p>` : ''}
        <button class="text-btn" data-action="train-anyway">Train anyway</button>
      </div>`;
  }

  const wk = await weekSummary(now);
  const weekHtml = `
    <div class="card">
      <div class="week-head">
        <div class="muted">This week</div>
        <div class="big">${wk.done}<span class="of"> of ${wk.planned}</span></div>
      </div>
      <div class="week">
        ${wk.keys.map((k, i) => {
          const cls = ['week-day'];
          if (isWorkoutDay(i)) cls.push('planned');
          if (wk.doneDates.has(k)) cls.push('done');
          if (k === today) cls.push('today');
          if (i === SATURDAY) cls.push('off');
          return `<div class="${cls.join(' ')}"><span class="wd">${DAY_LETTER[i]}</span><span class="dot">${wk.doneDates.has(k) ? ICONS.check : ''}</span></div>`;
        }).join('')}
      </div>
    </div>`;

  $('#view-today').innerHTML = largeTitle('Today', fmtLongDate(now)) + hero + `<div style="height:12px"></div>` + weekHtml;
  setDock(dock);
}

function nextWorkoutDay(from) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (isWorkoutDay(d.getDay())) return i === 1 ? 'Tomorrow' : DAY_SHORT[d.getDay()];
  }
  return null;
}

/* ---------- History ---------- */
async function renderHistory() {
  const logs = (await DB.getAll('logs')).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  const completed = logs.filter(l => l.status === 'completed');
  const wk = await weekSummary();
  let html = largeTitle('History');
  html += `
    <div class="stat-row">
      <div class="card stat"><div class="stat-num">${wk.done}<span class="muted" style="font-size:20px"> / ${wk.planned}</span></div><div class="stat-label">This week</div></div>
      <div class="card stat"><div class="stat-num">${completed.length}</div><div class="stat-label">All workouts</div></div>
    </div>`;
  if (!logs.length) {
    html += `<div class="empty">${ICONS.history}<strong>No workouts yet</strong>Finished workouts show up here.</div>`;
  } else {
    html += `<div class="section-label">Workouts</div><div class="group">` + logs.map(l => `
      <div class="row log-row">
        <div class="row-main">
          <div class="row-title">${esc(l.name || DAY_TYPES[l.dayType]?.name || 'Workout')}</div>
          <div class="row-sub num">${esc(fmtShortDate(parseKey(l.date)))} · ${fmtMinutes(l.durationSec)} · ${l.setsDone}/${l.setsPlanned} sets${l.stretchDone ? ' · stretch' : ''}</div>
        </div>
        <span class="pill ${l.status === 'completed' ? 'win' : 'caution'}">${l.status === 'completed' ? 'Done' : 'Partial'}</span>
      </div>`).join('') + `</div>`;
  }
  $('#view-history').innerHTML = html;
}

/* ---------- Food (Phase 5) ---------- */
function renderFood() {
  $('#view-food').innerHTML = largeTitle('Food') + `
    <div class="card empty">${ICONS.utensils}<strong>Coming soon</strong>Meal ratings, protein, and the lunch plan arrive in a later phase.</div>`;
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

function renderMe() {
  const st = S.settings;
  const days = workoutDays();
  const html = largeTitle('Me') + `
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
      <button class="row btn-row" data-action="test-cue">${ICONS.volume}<span>Test sound and flash</span></button>
    </div>
    <div class="section-foot" id="audio-debug">${esc(audioDebugText())}</div>

    <div class="section-label">Accent color</div>
    <div class="group">
      <div class="swatches">
        ${ACCENTS.map(a => `<button class="swatch ${st.accent === a.id ? 'on' : ''}" data-accent="${a.id}" aria-label="${esc(a.name)}" style="background:${a.color}"></button>`).join('')}
      </div>
    </div>

    <div class="section-label">Data</div>
    <div class="group">
      <button class="row btn-row" data-action="export">${ICONS.download}<span>Export data</span></button>
    </div>
    <div class="section-foot">Saves everything as one JSON file. Storage: ${esc(DB.backend)} · v${APP_VERSION}</div>
  `;
  $('#view-me').innerHTML = html;
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
    await saveSettings({ [input.dataset.setting]: input.checked });
    if (input.dataset.setting === 'flash') renderMe(); // show or hide Flash strength
  } else if (input.dataset.equip) {
    const set = new Set(S.settings.equipment);
    input.checked ? set.add(input.dataset.equip) : set.delete(input.dataset.equip);
    await saveSettings({ equipment: [...set] });
  }
}

async function exportData() {
  const data = await DB.exportAll();
  const name = `workout-data-${dateKey()}.json`;
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // On iPhone a share sheet is the reliable way to save a file ("Save to Files").
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
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
  toast('Data exported');
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
  P.workout = workout;
  P.includeStretch = true;
  P.steps = buildSteps(workout, true, true);
  P.i = 0;
  P.results = {};
  P.startedAt = new Date().toISOString();
  P.logId = logId;
  openPlayer();
}

function openPlayer() {
  P.active = true;
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
    title: P.mode === 'stretch' ? 'End the stretch?' : (anyDone ? 'End the workout? What you did so far is saved.' : 'End the workout?'),
    actions: [{ label: P.mode === 'stretch' ? 'End stretch' : 'End workout', value: 'end', destructive: true }],
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
  if (anyDone) await saveLog('partial');
  await DB.delete('settings', 'session');
  closePlayer();
  showTab('today');
}

function saveSession() {
  if (P.mode !== 'workout') return;
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
  const alreadyCounted = before.doneDates.has(P.workout.date);
  const log = await saveLog('completed');
  await DB.delete('settings', 'session');
  closePlayer();
  showCompletion(log, before.done, alreadyCounted ? before.done : before.done + 1, before.planned);
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
    kind: 'full',
    status,
    startedAt: P.startedAt,
    finishedAt: finished.toISOString(),
    durationSec: Math.round((finished - new Date(P.startedAt)) / 1000),
    setsPlanned: main.reduce((n, e) => n + e.setsPlanned, 0),
    setsDone: main.reduce((n, e) => n + e.setsDone, 0),
    exercises: list,
    stretchDone: list.some(e => e.block === 'stretch' && e.setsDone > 0),
    checkIn: null, // Phase 2
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
function showCompletion(log, fromCount, toCount, planned) {
  const el = $('#complete');
  $('#c-title').textContent = 'Workout done';
  $('#c-sub').textContent = `${log.name} · ${fmtMinutes(log.durationSec)}`;
  const count = $('#c-count');
  count.textContent = fromCount;
  count.classList.remove('tick');
  $('#c-of').textContent = ` of ${planned}`;
  const stretchBtn = $('#c-stretch');
  const canStretch = !log.stretchDone && P.workout.blocks.some(b => b.kind === 'stretch');
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
  }, 1050);
}

function hideCompletion() {
  const el = $('#complete');
  el.hidden = true;
  el.classList.remove('play');
}

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
      const session = await DB.get('settings', 'session');
      startWorkout({ resume: !!session && session.workoutId === dateKey() });
    } else if (act === 'train-anyway') {
      await generateWorkout(dateKey(), { scheduled: false });
      renderToday();
    } else if (act === 'stretch') {
      const log = (await logsFor(dateKey())).filter(l => l.status === 'completed').pop();
      startStretch(log?.id);
    } else if (act === 'export') {
      exportData();
    } else if (act === 'test-cue') {
      Sound.unlock();
      setTimeout(() => cue('go'), 50);
      setTimeout(() => { const d = $('#audio-debug'); if (d) d.textContent = audioDebugText(); }, 400);
    }
  });

  $('#view-me').addEventListener('click', onMeClick);
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

  $('#c-done').addEventListener('click', () => { hideCompletion(); showTab('today'); });
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
    } else if (S.todayKey && S.todayKey !== dateKey() && S.tab === 'today') {
      renderToday(); // the app was left open overnight
    }
  });
}

async function boot() {
  await DB.init();
  await loadSettings();
  applyAccent();
  await loadExercises();
  await loadProgression();
  await finalizeStaleSession();
  bindEvents();
  await showTab('today');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW registration failed', err));
  }
}

boot().catch(err => {
  console.error(err);
  document.getElementById('view-today').innerHTML =
    `<div class="card" style="margin-top:60px"><strong>Something went wrong loading the app.</strong><p class="muted">${esc(err.message)}</p></div>`;
});
