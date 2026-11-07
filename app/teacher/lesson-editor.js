/* ═══════════════════════════════════════════════════════════════════════
   lesson-editor.js — TehfizLesson — le3
   Loaded by the teacher app only, from /app/teacher/lesson-editor.js?v=le3.

   le3: a lesson already on the schedule (Finish session's next lesson)
   opens as that lesson, so it never clashes with itself; "No next lesson".

   le2: "Time of session" and "What to recite" fold to one line each; tap
   either time readout (yours or the student's) to type a time in that
   person's hours; redraws keep the place in the sheet.

   One editor for one lesson, wherever a lesson is planned: Edit on the
   Profile's next-lesson card, a single lesson on Schedule (and + Add), any
   upcoming lesson in the calendar, and Finish session's next lesson.

     When       a week strip (dots = lessons already that day; ‹ › a week,
                Month for further), then the day as a time bar: drag the
                lesson along it. With the student's time zone set and
                different, a second bar shows the same moments in their
                hours. Night is hatched (10 PM – 7 AM) on each side; with
                teaching hours set (Settings, optional) the teacher's bar
                hatches outside them instead. Other lessons are blocks.
                Readout, then what clashes, then free times for both.
     Length     30 · 45 · 60 or any number
     Recite     the planned segments, laid out like the session panel: a
                stage, Recite or Spot test (with a spot count), a verse range
                from the app's range picker and/or a few words; × removes
                one. Suggest fills them from the memorisation map.
     Note       for the student

   Clashes: the same student already has a lesson that day → "Move that one
   here" (a new lesson only: the existing one moves to this time) or "Keep
   both". Another student's lesson overlapping → a warning; saving is still
   allowed.

   Where a save goes (TehfizProfile does the storing):
     the next lesson (from Finish)  → next_lesson
     a single lesson                → that entry in `lessons`
     a weekly lesson                → a `lessons` entry for that date only,
                                      `replaces` the weekly one if moved
     a new lesson                   → a new `lessons` entry
   In Finish session nothing is stored: the editor hands the lesson back and
   Finish saves it with the session ('draft').

   Self-contained: namespace window.TehfizLesson, DOM #tleRoot, CSS .tle-.
   Calls TehfizTime, TehfizSync.{student, roster, api, isSignedIn},
   TehfizProfile.{ttOf, timetable, setLessons, saveNextLesson, suggestPlan},
   and app: openRangePickerFor, sessionTypesActive, sessionTypeLabel,
   describeRange, showToast.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_LESSON_VERSION = 'le3';
const K_HOURS = 'tehfiz_teach_hours';     // {from:'15:00', to:'21:00'} — optional, set in Settings
const K_PLANS = 'tehfiz_cal_plans';       // the calendar's copy of every student's timetable
const SNAP = 15, DAY = 86400000;
const NIGHT_FROM = 22 * 60, NIGHT_TO = 7 * 60;

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function readJ(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }
function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function T() { return window.TehfizTime; }
function P() { return window.TehfizProfile || null; }
function S() { return window.TehfizSync || null; }
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function compact() { return document.body.classList.contains('compact-ui'); }
function stage(id) { return typeof sessionTypeLabel === 'function' ? sessionTypeLabel(id) : id; }
function stages() { return typeof sessionTypesActive === 'function' ? sessionTypesActive() : [{ id: 'new', label: 'New' }, { id: 'recent', label: 'Recent' }, { id: 'old', label: 'Old' }]; }
function hours() { const h = readJ(K_HOURS, null); return h && /^\d\d:\d\d$/.test(h.from) && /^\d\d:\d\d$/.test(h.to) ? h : null; }
function hm2min(s) { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; }

let ed = null;   // the lesson being edited — see open()

/* ── time helpers (all in the teacher's zone) ───────────────────────────── */
function myZ() { return T().myTz(); }
function dayStart(ms) { const p = T().partsIn(ms, myZ()); return T().zonedToMs(p.y, p.mo, p.d, 0, 0, myZ()); }
function addDays(ms, n) { const p = T().partsIn(ms + 12 * 3600000, myZ()); return T().zonedToMs(p.y, p.mo, p.d + n, 0, 0, myZ()); }
function minOf(ms) { const p = T().partsIn(ms, myZ()); return p.h * 60 + p.mi; }
function atOf(day, min) { const p = T().partsIn(day + 12 * 3600000, myZ()); return T().zonedToMs(p.y, p.mo, p.d, Math.floor(min / 60), min % 60, myZ()); }
function fmtMin(m) {
  m = ((m % 1440) + 1440) % 1440;
  const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function theirZ() {
  const st = S() && S().student ? S().student(ed.sid) : null;
  const z = st && st.tz;
  return z && T().validTz(z) && !T().sameOffset(z, myZ(), ed.at) ? z : '';
}
function nameOf(id) { const st = S() && S().student ? S().student(id) : null; return (st && (st.name || st.code)) || 'Student'; }
function weekdayIdx(ms) { return T().partsIn(ms, myZ()).wd; }

/* ── everyone's lessons, for dots, blocks and clashes ───────────────────── */
function allTimetables() {
  const out = {};
  const cached = readJ(K_PLANS, null);
  ((cached && cached.plans) || []).forEach((p) => { out[p.student_id] = { slots: p.slots || {}, tz: p.tz || null, lessons: p.lessons || [], next_lesson: p.next_lesson || null }; });
  // This device's copies win: they hold changes not sent yet.
  const pr = P();
  (S() && S().roster ? S().roster() : []).forEach((s) => {
    const loc = pr && pr.timetable ? pr.timetable(s.id) : null;
    if (loc && (Object.keys(loc.days || {}).length || (loc.lessons || []).length)) {
      const t = pr.ttOf(s.id); if (!t.next_lesson && out[s.id]) t.next_lesson = out[s.id].next_lesson;
      out[s.id] = t;
    }
  });
  return out;
}
let plansFetched = 0;
function refreshPlans() {
  if (Date.now() - plansFetched < 5 * 60000 || !S() || !S().isSignedIn || !S().isSignedIn()) return;
  plansFetched = Date.now();
  S().api('/api/plans').then((d) => { writeJ(K_PLANS, { at: Date.now(), plans: (d && d.plans) || [] }); if (ed) render(); }).catch(() => {});
}
/* Lessons between two moments, other than the one being edited. */
function busyBetween(from, to) {
  const tts = allTimetables(), out = [];
  Object.keys(tts).forEach((sid) => {
    T().occurrences(tts[sid], from, to).forEach((o) => {
      if (ed.occ && sid === ed.sid && (o.at === ed.occ.at || o.at === ed.moveFrom)) return;
      out.push({ ...o, sid, label: nameOf(sid) });
    });
  });
  return out.sort((a, b) => a.at - b.at);
}

/* ── open / close ───────────────────────────────────────────────────────── */
/* opts: {sid, occ?, mode: 'save' | 'draft', draft?: {at, len, plan, note,
   replaces}, title?, onDone?(result)} — occ is a lesson from
   TehfizTime.occurrences (kind 'set' | 'single' | 'weekly'); none = new. */
function open(opts) {
  injectCss();
  const o = opts.occ || null, d = opts.draft || {};
  const start = d.at || (o && o.at) || defaultStart(opts.sid);
  ed = {
    sid: opts.sid, occ: o, mode: opts.mode || 'save', onDone: opts.onDone || null, title: opts.title || '',
    at: start, len: d.len || (o && o.len) || 45,
    plan: (d.plan ? d.plan.map((x) => ({ ...x })) : T().planOf(o || {})),
    note: d.note != null ? d.note : ((o && o.note) || ''),
    replaces: d.replaces || null,
    weekStart: 0, monthOpen: false, monthAt: 0, keepBoth: false, moveFrom: null,
    fold: { time: false, plan: false }, typing: null,   // typing: 'me' | 'them' while a readout is a field
    onClear: opts.onClear || null,
  };
  // le3: editing a lesson that is already on the schedule (Finish session's
  // next lesson) — it is that lesson, so it never clashes with itself.
  if (opts.moveFrom && opts.moveFrom.at) { ed.moveFrom = opts.moveFrom.at; ed.moveOcc = opts.moveFrom; }
  ed.weekStart = mondayOf(ed.at);
  let root = $('tleRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'tleRoot';
    document.body.appendChild(root);
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange);
  }
  refreshPlans();
  render();
  const first = root.querySelector('.tle-blk') || root.querySelector('.tle-x');
  if (first && !compact()) first.focus({ preventScroll: true });
}
function close() { ed = null; const r = $('tleRoot'); if (r) r.innerHTML = ''; }
function isOpen() { return !!ed; }
function mondayOf(ms) { const d0 = dayStart(ms); return addDays(d0, -((weekdayIdx(d0 + 12 * 3600000) + 6) % 7)); }
/* A new lesson starts at the next free usual time: the student's next weekly
   lesson, else tomorrow at the start of teaching hours (or 5 PM). */
function defaultStart(sid) {
  const pr = P();
  const nl = pr && pr.nextLesson ? pr.nextLesson(sid) : null;
  if (nl) return +nl.at;
  const h = hours();
  return atOf(addDays(Date.now(), 1), h ? hm2min(h.from) : 17 * 60);
}

/* ── render ─────────────────────────────────────────────────────────────── */
function weekHtml() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ed.weekStart, i));
  const today = dayStart(Date.now()), sel = dayStart(ed.at);
  const busy = busyBetween(days[0], addDays(days[6], 1));
  return '<div class="tle-wk"><button type="button" class="tle-nav" data-tle="wprev" aria-label="Previous week">\u2039</button>' + days.map((d) => {
    const p = T().partsIn(d + 12 * 3600000, myZ());
    const n = busy.filter((b) => dayStart(b.at) === d);
    return '<button type="button" class="tle-dd' + (d === sel ? ' on' : '') + (d === today ? ' today' : '') + (d < today ? ' past' : '') + '" data-tle="day" data-d="' + d + '"' +
      ' aria-pressed="' + (d === sel) + '"><small>' + esc(T().weekdayShort(d + 12 * 3600000, myZ())) + '</small><b>' + p.d + '</b>' +
      '<span class="tle-dots">' + n.slice(0, 4).map((b) => '<i class="' + (b.sid === ed.sid ? 'me' : '') + '"></i>').join('') + '</span></button>';
  }).join('') + '<button type="button" class="tle-nav" data-tle="wnext" aria-label="Next week">\u203a</button></div>';
}
function monthHtml() {
  if (!ed.monthOpen) return '';
  const p = T().partsIn(ed.monthAt + 12 * 3600000, myZ());
  const first = T().zonedToMs(p.y, p.mo, 1, 0, 0, myZ());
  const lead = (weekdayIdx(first + 12 * 3600000) + 6) % 7;
  const daysIn = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate();
  const busy = busyBetween(first, addDays(first, daysIn));
  const sel = dayStart(ed.at), today = dayStart(Date.now());
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let d = 1; d <= daysIn; d++) {
    const ds = addDays(first, d - 1), n = busy.filter((b) => dayStart(b.at) === ds).length;
    cells += '<button type="button" class="tle-md' + (ds === sel ? ' on' : '') + (ds === today ? ' today' : '') + (ds < today ? ' past' : '') + '" data-tle="mday" data-d="' + ds + '">' + d +
      (n ? '<i>' + (n > 3 ? '\u2022\u2022\u2022' : '\u2022'.repeat(n)) + '</i>' : '') + '</button>';
  }
  const label = new Date(first + 12 * 3600000).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: myZ() });
  return '<div class="tle-month"><div class="tle-mh"><button type="button" class="tle-nav" data-tle="mprev" aria-label="Previous month">\u2039</button><b>' + esc(label) + '</b>' +
    '<button type="button" class="tle-nav" data-tle="mnext" aria-label="Next month">\u203a</button></div>' +
    '<div class="tle-mg">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => '<span class="tle-mw">' + x + '</span>').join('') + cells + '</div></div>';
}
/* Hatched stretches of one bar: [fromMin, toMin) in the teacher's day. */
function hatches(offsetMin, useHours) {
  const out = []; let open = null;
  const h = useHours ? hours() : null;
  for (let m = 0; m <= 1440; m += 15) {
    const local = ((m + offsetMin) % 1440 + 1440) % 1440;
    const off = m === 1440 ? false
      : h ? !(local >= hm2min(h.from) && local < hm2min(h.to))
      : (local >= NIGHT_FROM || local < NIGHT_TO);
    if (off && open == null) open = m;
    if (!off && open != null) { out.push([open, m]); open = null; }
  }
  return out;
}
function pct(m) { return (m / 1440 * 100) + '%'; }
function laneHtml(id, offsetMin, useHours, busy, who) {
  return '<div class="tle-lane" id="' + id + '">' +
    hatches(offsetMin, useHours).map(([a, b]) => '<i class="tle-ni" style="left:' + pct(a) + ';width:' + pct(b - a) + '"></i>').join('') +
    busy.map((b) => '<span class="tle-busy' + (b.sid === ed.sid ? ' me' : '') + '" style="left:' + pct(minOf(b.at)) + ';width:' + pct(Math.max(b.len || 30, 10)) + '" title="' +
      esc(b.label + ' ' + fmtMin(minOf(b.at))) + '">' + esc(b.label) + '</span>').join('') +
    '<span class="tle-blk' + (id === 'tleLaneMe' ? '' : ' ghost') + '" ' + (id === 'tleLaneMe' ? 'tabindex="0" role="slider" aria-label="Lesson time" aria-valuemin="0" aria-valuemax="1439" ' : '') +
      'style="left:' + pct(minOf(ed.at)) + ';width:' + pct(ed.len) + '"></span>' +
    '</div>' + (who ? '' : '');
}
function axisHtml(who) { return '<div class="tle-ax"><b>' + esc(who) + '</b></div>'; }
/* Hour marks under a bar, in that person's own hours, placed where they fall. */
function marksHtml(offsetMin) {
  return '<div class="tle-marks">' + [0, 360, 720, 1080, 1440].map((m, i) =>
    '<span style="left:' + pct(m) + '" class="' + (i === 0 ? 'first' : i === 4 ? 'last' : '') + '">' +
      esc(fmtMin(m + offsetMin).replace(':00', '').replace(/\s?(AM|PM)/i, (x) => x.trim().toLowerCase()[0])) + '</span>').join('') + '</div>';
}
function clashes() {
  const from = ed.at, to = ed.at + ed.len * 60000;
  const day = dayStart(ed.at);
  const busy = busyBetween(day, addDays(day, 1));
  const same = busy.filter((b) => b.sid === ed.sid && !(ed.moveFrom && b.at === ed.moveFrom));
  const over = busy.filter((b) => b.sid !== ed.sid && b.at < to && from < b.at + (b.len || 30) * 60000);
  return { same: same[0] || null, over, busy };
}
function suggestions(busy) {
  const z = theirZ(), day = dayStart(ed.at), h = hours();
  const lo = h ? hm2min(h.from) : NIGHT_TO, hi = h ? hm2min(h.to) : NIGHT_FROM;
  const out = [];
  for (let m = lo; m + ed.len <= hi; m += SNAP) {
    const a = atOf(day, m), b = a + ed.len * 60000;
    if (a < Date.now()) continue;
    if (z) {
      const sm = (T().partsIn(a, z).h * 60 + T().partsIn(a, z).mi), se = sm + ed.len;
      if (sm < NIGHT_TO || se > NIGHT_FROM) continue;
    }
    if (busy.some((x) => x.at < b && a < x.at + (x.len || 30) * 60000)) continue;
    out.push(m);
  }
  const cur = minOf(ed.at);
  return out.sort((x, y) => Math.abs(x - cur) - Math.abs(y - cur)).slice(0, 4).sort((x, y) => x - y);
}
function flagsHtml(c) {
  const z = theirZ(), html = [];
  if (c.same && !ed.keepBoth) {
    html.push('<div class="tle-flag bad"><span>' + esc(nameOf(ed.sid)) + ' already has a lesson ' + esc(T().whenText(c.same.at, myZ())) + '.</span>' +
      '<span class="tle-acts">' + (!ed.occ ? '<button type="button" class="tle-chip pri" data-tle="movehere">Move that one here</button>' : '') +
      '<button type="button" class="tle-chip" data-tle="keepboth">Keep both</button></span></div>');
  }
  if (c.over.length) {
    html.push('<div class="tle-flag bad"><span>Overlaps ' + c.over.map((b) => esc(b.label) + ' ' + esc(fmtMin(minOf(b.at))) + '\u2013' + esc(fmtMin(minOf(b.at) + (b.len || 30)))).join(', ') + '.</span></div>');
  }
  if (!html.length) {
    const m = minOf(ed.at), h = hours();
    const mine = h ? (m < hm2min(h.from) || m + ed.len > hm2min(h.to)) : (m < NIGHT_TO || m + ed.len > NIGHT_FROM);
    let theirs = false;
    if (z) { const p = T().partsIn(ed.at, z), sm = p.h * 60 + p.mi; theirs = sm < NIGHT_TO || sm + ed.len > NIGHT_FROM; }
    const why = [mine ? (h ? 'outside your teaching hours' : 'night for you') : '', theirs ? 'night for ' + nameOf(ed.sid) : ''].filter(Boolean).join(' and ');
    html.push('<div class="tle-flag ' + (why ? 'warn' : 'ok') + '">' + (why ? 'Free, but ' + esc(why) + '.' : 'Free' + (z ? ' for both of you.' : '.')) + '</div>');
  }
  if (ed.at < Date.now() - 60000) html.push('<div class="tle-flag warn">That time has already passed.</div>');
  return html.join('');
}
function planRowHtml(p, i) {
  const opts = stages().map((s) => '<option value="' + esc(s.id) + '"' + (s.id === p.type ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('');
  const range = p.start ? (p.label || (typeof describeRange === 'function' ? describeRange(p.start, p.end) : '') || p.start + '\u2013' + p.end) : '';
  return '<div class="tle-seg" data-i="' + i + '">' +
    '<div class="tle-segl">' +
      '<select class="tle-in tle-stage" data-tlein="type" data-i="' + i + '" aria-label="Stage">' + opts + '</select>' +
      (p.mode === 'spot'
        ? '<span class="tle-mode spot">Spot test</span><input class="tle-in tle-num" type="number" min="1" max="999" data-tlein="spots" data-i="' + i + '" value="' + esc(p.spots || 8) + '" aria-label="Number of spots"><span class="tle-mut">spots</span>'
        : '<span class="tle-mode">Recite</span>') +
      '<button type="button" class="tle-del" data-tle="segdel" data-i="' + i + '" aria-label="Remove this segment" title="Remove">\u2715</button></div>' +
    '<div class="tle-segl">' +
      '<button type="button" class="tle-range' + (range ? '' : ' empty') + '" data-tle="range" data-i="' + i + '">' +
        (range ? esc(range) + '<small>' + esc(p.start) + ' \u2013 ' + esc(p.end) + '</small>' : 'Set range\u2026') + '</button>' +
      '<input class="tle-in tle-txt" data-tlein="text" data-i="' + i + '" value="' + esc(p.text || '') + '" placeholder="' + (range ? 'Add a note' : 'or describe it') + '" aria-label="Description">' +
    '</div></div>';
}
function render() {
  const root = $('tleRoot');
  if (!root || !ed) { if (root) root.innerHTML = ''; return; }
  const z = theirZ(), name = nameOf(ed.sid);
  const c = clashes(), sug = suggestions(c.busy);
  const dayBusy = c.busy;
  const offTheirs = z ? (T().offsetMin(ed.at, z) - T().offsetMin(ed.at, myZ())) : 0;
  // The sheet's body is what scrolls: keep the place across redraws.
  const oldBody = root.querySelector('.tle-body'), keep = oldBody ? oldBody.scrollTop : 0;
  const kindNote = !ed.occ ? (ed.moveFrom ? (Math.abs(ed.at - ed.moveFrom) < 60000 ? name + '\u2019s lesson as scheduled. Change the time to move it.'
      : 'Moves ' + name + '\u2019s lesson from ' + T().whenText(ed.moveFrom, myZ()) + ' to here.') : 'A new single lesson.')
    : ed.occ.kind === 'weekly' ? 'From the weekly days \u2014 changes here are for this date only.'
    : ed.occ.kind === 'single' ? 'A single lesson.' : '';
  root.innerHTML = '<div class="tle-wrap"><div class="tle-scrim" data-tle="cancel"></div>' +
    '<div class="tle-card" role="dialog" aria-modal="true" aria-labelledby="tleT">' +
      '<div class="tle-head"><b id="tleT">' + esc(ed.title || 'Lesson \u00b7 ' + name) + '</b><button type="button" class="tle-x" data-tle="cancel" aria-label="Close">\u2715</button></div>' +
      '<div class="tle-body">' +
        (ed.fold.time
          ? '<div class="tle-box"><button type="button" class="tle-fold" data-tle="fold" data-k="time" aria-expanded="false"><span class="tle-h">Time of session</span>' +
              '<span class="tle-foldv">' + esc(T().whenText(ed.at, myZ())) + ' \u00b7 ' + ed.len + ' min' + (z ? ' \u00b7 ' + esc(name) + ' ' + esc(T().timeText(ed.at, z)) : '') +
              (c.over.length || (c.same && !ed.keepBoth) ? ' \u00b7 \u26a0' : '') + '</span><span class="tle-chev">\u203a</span></button></div>'
          : '<div class="tle-box"><div class="tle-h"><button type="button" class="tle-fold open" data-tle="fold" data-k="time" aria-expanded="true"><span>Time of session</span><span class="tle-chev">\u203a</span></button>' +
            '<button type="button" class="tle-link" data-tle="month">' + (ed.monthOpen ? 'Week \u25b4' : 'Month \u25be') + '</button></div>' +
          (ed.monthOpen ? monthHtml() : weekHtml()) +
          // le3: the times read first, the bars to change them come after.
          '<div class="tle-read">' + readMeHtml() + (z ? readThemHtml(z, name) : '') + '</div>' +
          '<div class="tle-bars">' +
            axisHtml('You' + (z ? ' \u00b7 ' + T().city(myZ()) : '')) + laneHtml('tleLaneMe', 0, true, dayBusy) + marksHtml(0) +
            (z ? axisHtml(name + ' \u00b7 ' + T().city(z)) + laneHtml('tleLaneThem', offTheirs, false, dayBusy.filter((b) => b.sid === ed.sid)) + marksHtml(offTheirs) : '') +
          '</div>' +
          '<div id="tleFlags">' + flagsHtml(c) + '</div>' +
          (sug.length ? '<div class="tle-sug"><span>Free' + (z ? ' for both' : '') + ':</span>' + sug.map((m) => '<button type="button" class="tle-chip" data-tle="sug" data-m="' + m + '">' + esc(fmtMin(m)) + '</button>').join('') + '</div>' : '') +
          '<div class="tle-row"><span class="tle-mut">Length</span>' + [30, 45, 60].map((n) => '<button type="button" class="tle-chip' + (ed.len === n ? ' on' : '') + '" data-tle="len" data-n="' + n + '">' + n + '</button>').join('') +
            '<input class="tle-in tle-num" type="number" min="5" max="240" step="5" data-tlein="len" value="' + esc(ed.len) + '" aria-label="Length in minutes"><span class="tle-mut">min</span></div>' +
          (kindNote ? '<div class="tle-mut">' + esc(kindNote) + '</div>' : '') +
        '</div>') +
        (ed.fold.plan
          ? '<div class="tle-box"><button type="button" class="tle-fold" data-tle="fold" data-k="plan" aria-expanded="false"><span class="tle-h">What to recite</span>' +
              '<span class="tle-foldv">' + (ed.plan.length ? esc(T().planText({ plan: ed.plan }, stage)) || ed.plan.length + ' segment' + (ed.plan.length === 1 ? '' : 's') : '<span class="tle-mut">Nothing planned</span>') + '</span><span class="tle-chev">\u203a</span></button></div>'
          : '<div class="tle-box"><div class="tle-h"><button type="button" class="tle-fold open" data-tle="fold" data-k="plan" aria-expanded="true"><span>What to recite</span><span class="tle-chev">\u203a</span></button>' +
              (P() && P().suggestPlan ? '<button type="button" class="tle-link" data-tle="suggest">Suggest</button>' : '') + '</div>' +
            (ed.plan.length ? ed.plan.map(planRowHtml).join('') : '<div class="tle-mut">Nothing planned yet. Add what ' + esc(name) + ' should recite, or leave it open.</div>') +
            '<div class="tle-row"><button type="button" class="tle-chip" data-tle="addrec">+ Recite</button><button type="button" class="tle-chip" data-tle="addspot">+ Spot test</button></div>' +
          '</div>') +
        '<div class="tle-box"><div class="tle-h">Note</div><input class="tle-in" data-tlein="note" value="' + esc(ed.note) + '" placeholder="Optional \u2014 shown to ' + esc(name) + '"></div>' +
      '</div>' +
      '<div class="tle-foot">' +
        (ed.occ && ed.occ.kind === 'single' && ed.mode === 'save' ? '<button type="button" class="tle-link danger" data-tle="delete">Delete this lesson</button>' : '') +
        (ed.occ && ed.occ.kind === 'set' && ed.mode === 'save' ? '<button type="button" class="tle-link" data-tle="clearset">Remove these details</button>' : '') +
        (ed.onClear ? '<button type="button" class="tle-link" data-tle="clearnext">No next lesson</button>' : '') +
        '<span class="tle-sp"></span><button type="button" class="tle-btn" data-tle="cancel">Cancel</button>' +
        '<button type="button" class="tle-btn pri" data-tle="save">' + (ed.mode === 'draft' ? 'Done' : 'Save') + '</button></div>' +
    '</div></div>';
  const nb = root.querySelector('.tle-body'); if (nb && keep) nb.scrollTop = keep;
  if (ed.typing) { const f = root.querySelector('[data-tlein="' + (ed.typing === 'them' ? 'ttime' : 'time') + '"]'); if (f) f.focus({ preventScroll: true }); }
}
/* The readouts. Tap one to type a time in that person's own hours. */
function readMeHtml() {
  if (ed.typing === 'me') {
    return '<span class="tle-typ"><input class="tle-in" type="date" data-tlein="date" value="' + esc(ymdIn(ed.at)) + '" aria-label="Date">' +
      '<input class="tle-in" type="time" step="300" data-tlein="time" value="' + esc(hmIn(ed.at)) + '" aria-label="Time, yours">' +
      '<button type="button" class="tle-chip" data-tle="typedone">Done</button></span>';
  }
  return '<button type="button" class="tle-t" id="tleRead" data-tle="typeme" title="Type a time">' + esc(T().whenText(ed.at, myZ())) + ' <span class="tle-pen">\u270e</span></button>';
}
function readThemHtml(z, name) {
  if (ed.typing === 'them') {
    const p = T().partsIn(ed.at, z);
    const ymd = p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'), hm = String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0');
    return '<span class="tle-typ"><span class="tle-mut">' + esc(name) + ' (' + esc(T().city(z)) + ')</span>' +
      '<input class="tle-in" type="date" data-tlein="tdate" value="' + ymd + '" aria-label="Date, ' + esc(name) + '">' +
      '<input class="tle-in" type="time" step="300" data-tlein="ttime" value="' + hm + '" aria-label="Time, ' + esc(name) + '">' +
      '<button type="button" class="tle-chip" data-tle="typedone">Done</button></span>';
  }
  return '<button type="button" class="tle-t2" id="tleReadThem" data-tle="typethem" title="Type a time in ' + esc(name) + '\u2019s hours">' + esc(name) + ': <b>' + esc(T().whenText(ed.at, z)) + '</b> <span class="tle-pen">\u270e</span></button>';
}
function ymdIn(ms) { const p = T().partsIn(ms, myZ()); return p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); }
function hmIn(ms) { const p = T().partsIn(ms, myZ()); return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'); }

/* While dragging only the moving parts change; the rest waits for the drop. */
function paintTime() {
  const z = theirZ(), m = minOf(ed.at);
  document.querySelectorAll('#tleRoot .tle-blk').forEach((b) => { b.style.left = pct(m); b.style.width = pct(ed.len); });
  const r = $('tleRead'); if (r) r.innerHTML = esc(T().whenText(ed.at, myZ())) + ' <span class="tle-pen">\u270e</span>';
  const rt = $('tleReadThem'); if (rt && z) rt.innerHTML = esc(nameOf(ed.sid)) + ': <b>' + esc(T().whenText(ed.at, z)) + '</b> <span class="tle-pen">\u270e</span>';
  const c = clashes();
  const f = $('tleFlags'); if (f) f.innerHTML = flagsHtml(c);
  document.querySelectorAll('#tleRoot .tle-blk').forEach((b) => b.classList.toggle('bad', !!(c.over.length || (c.same && !ed.keepBoth && c.same.at < ed.at + ed.len * 60000 && ed.at < c.same.at + (c.same.len || 30) * 60000))));
  const blk = document.querySelector('#tleLaneMe .tle-blk'); if (blk) blk.setAttribute('aria-valuetext', fmtMin(m));
}
function setMin(m) {
  m = Math.max(0, Math.min(1440 - ed.len, Math.round(m / SNAP) * SNAP));
  ed.at = atOf(dayStart(ed.at), m);
}

/* ── events ─────────────────────────────────────────────────────────────── */
function readText() {
  document.querySelectorAll('#tleRoot [data-tlein="text"]').forEach((el) => { const p = ed.plan[+el.dataset.i]; if (p) p.text = el.value; });
  const n = document.querySelector('#tleRoot [data-tlein="note"]'); if (n) ed.note = n.value;
}
function onClick(e) {
  if (!ed) return;
  const t = e.target.closest('[data-tle]'); if (!t) return;
  const a = t.dataset.tle;
  readText();
  if (a === 'cancel') return close();
  if (a === 'clearnext') { const cb = ed.onClear; close(); if (cb) cb(); return; }
  if (a === 'fold') { ed.fold[t.dataset.k] = !ed.fold[t.dataset.k]; ed.typing = null; return render(); }
  if (a === 'typeme' || a === 'typethem') { ed.typing = a === 'typeme' ? 'me' : 'them'; return render(); }
  if (a === 'typedone') { ed.typing = null; return render(); }
  if (a === 'day' || a === 'mday') {
    const d = +t.dataset.d, m = minOf(ed.at);
    ed.at = atOf(d, m); ed.keepBoth = false;
    if (a === 'mday') { ed.monthOpen = false; ed.weekStart = mondayOf(ed.at); }
    return render();
  }
  if (a === 'wprev' || a === 'wnext') { ed.weekStart = addDays(ed.weekStart, a === 'wprev' ? -7 : 7); return render(); }
  if (a === 'month') { ed.monthOpen = !ed.monthOpen; ed.monthAt = ed.at; return render(); }
  if (a === 'mprev' || a === 'mnext') { const p = T().partsIn(ed.monthAt, myZ()); ed.monthAt = T().zonedToMs(p.y, p.mo + (a === 'mprev' ? -1 : 1), 15, 12, 0, myZ()); return render(); }
  if (a === 'sug') { setMin(+t.dataset.m); return render(); }
  if (a === 'len') { ed.len = +t.dataset.n; return render(); }
  if (a === 'keepboth') { ed.keepBoth = true; return render(); }
  if (a === 'movehere') {
    const c = clashes(); if (!c.same) return;
    // The new lesson becomes that lesson, moved: its details come along unless
    // something was already written here.
    ed.moveFrom = c.same.at; ed.moveOcc = c.same;
    if (!ed.plan.length) ed.plan = T().planOf(c.same);
    if (!ed.note && c.same.note) ed.note = c.same.note;
    return render();
  }
  if (a === 'addrec' || a === 'addspot') {
    const last = ed.plan[ed.plan.length - 1];
    ed.plan.push({ type: last ? last.type : 'new', mode: a === 'addspot' ? 'spot' : 'recite', ...(a === 'addspot' ? { spots: 8 } : {}) });
    return render();
  }
  if (a === 'segdel') { ed.plan.splice(+t.dataset.i, 1); return render(); }
  if (a === 'suggest') {
    const s = P().suggestPlan(ed.sid);
    if (!s || !s.length) { toast('Mark what ' + nameOf(ed.sid) + ' has memorised on the map to get suggestions'); return; }
    ed.plan = s; return render();
  }
  if (a === 'range') {
    const i = +t.dataset.i, p = ed.plan[i];
    if (typeof openRangePickerFor !== 'function') return;
    openRangePickerFor((r, unit, text) => {
      if (!ed || !ed.plan[i]) return;
      Object.assign(ed.plan[i], { start: r.startKey, end: r.endKey, label: unit === 'ayah' ? '' : (r.label || ''), unit, utext: text });
      render();
    }, t, p.unit || 'juz', p.utext || '', { sid: ed.sid, stage: p.type, start: p.start, end: p.end,
      title: (p.mode === 'spot' ? 'Spot test' : stage(p.type)) + ' \u00b7 range' });
    return;
  }
  if (a === 'delete') {
    const pr = P(); if (!pr) return;
    pr.setLessons(ed.sid, pr.timetable(ed.sid).lessons.filter((l) => Date.parse(l.at) !== Date.parse(ed.occ.orig || ed.occ.at)));
    toast('Lesson deleted'); return done(null);
  }
  if (a === 'clearset') { P().saveNextLesson(ed.sid, null); toast('Details removed'); return done(null); }
  if (a === 'save') return save();
}
function onInput(e) {
  if (!ed) return;
  const el = e.target, f = el.dataset && el.dataset.tlein;
  if (f === 'text') { const p = ed.plan[+el.dataset.i]; if (p) p.text = el.value; }
  else if (f === 'note') ed.note = el.value;
}
function onChange(e) {
  if (!ed) return;
  const el = e.target, f = el.dataset && el.dataset.tlein;
  if (!f) return;
  readText();
  if (f === 'date' && el.value) {
    const [y, mo, d] = el.value.split('-').map(Number);
    ed.at = T().zonedToMs(y, mo, d, Math.floor(minOf(ed.at) / 60), minOf(ed.at) % 60, myZ()); ed.weekStart = mondayOf(ed.at); ed.keepBoth = false; return render();
  }
  if (f === 'time' && el.value) { ed.at = atOf(dayStart(ed.at), hm2min(el.value)); return render(); }
  if ((f === 'ttime' || f === 'tdate') && theirZ()) {
    const z = theirZ(), wrap = el.closest('.tle-typ');
    const d = wrap.querySelector('[data-tlein="tdate"]').value, tm = wrap.querySelector('[data-tlein="ttime"]').value;
    if (!d || !tm) return;
    const [y, mo, dd] = d.split('-').map(Number), [h, mi] = tm.split(':').map(Number);
    ed.at = T().zonedToMs(y, mo, dd, h, mi, z); ed.weekStart = mondayOf(ed.at); ed.keepBoth = false;
    return render();
  }
  if (f === 'len') { ed.len = Math.max(5, Math.min(240, parseInt(el.value, 10) || 45)); return render(); }
  if (f === 'type') { const p = ed.plan[+el.dataset.i]; if (p) p.type = el.value; return; }
  if (f === 'spots') { const p = ed.plan[+el.dataset.i]; if (p) p.spots = Math.max(1, Math.min(999, parseInt(el.value, 10) || 8)); }
}
/* Drag the lesson along the bar (either bar); arrows nudge it. */
let drag = null;
document.addEventListener('pointerdown', (e) => {
  if (!ed) return;
  const lane = e.target.closest && e.target.closest('#tleRoot .tle-lane'); if (!lane) return;
  e.preventDefault();
  const r = lane.getBoundingClientRect();
  const onBlk = e.target.classList.contains('tle-blk');
  drag = { r, grab: onBlk ? (e.clientX - r.left) / r.width * 1440 - minOf(ed.at) : ed.len / 2 };
  moveTo(e);
});
function moveTo(e) {
  if (!drag || !ed) return;
  setMin((e.clientX - drag.r.left) / drag.r.width * 1440 - drag.grab);
  paintTime();
}
document.addEventListener('pointermove', (e) => { if (drag) moveTo(e); });
document.addEventListener('pointerup', () => { if (drag) { drag = null; if (ed) render(); } });
document.addEventListener('keydown', (e) => {
  if (!ed) return;
  if (typeof _rangePicker !== 'undefined' && _rangePicker) return;   // the range picker has the keys
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (ed.monthOpen) { ed.monthOpen = false; render(); } else close(); return; }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.classList && e.target.classList.contains('tle-blk')) {
    e.preventDefault(); setMin(minOf(ed.at) + (e.key === 'ArrowRight' ? SNAP : -SNAP)); paintTime();
  }
  if (e.key === 'Enter' && e.target.closest && e.target.closest('#tleRoot .tle-typ')) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); if (ed) { ed.typing = null; render(); } return; }
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.closest('#tleRoot')) { e.preventDefault(); readText(); save(); return; }
  e.stopPropagation();
}, true);

/* ── save ───────────────────────────────────────────────────────────────── */
function cleanPlanOut() {
  return ed.plan.map((p) => {
    const o = { type: p.type || 'unassigned', mode: p.mode === 'spot' ? 'spot' : 'recite' };
    if (p.start && p.end) { o.start = p.start; o.end = p.end; if (p.label) o.label = p.label; }
    if (p.text && p.text.trim()) o.text = p.text.trim();
    if (o.mode === 'spot') o.spots = p.spots || 8;
    if (p.unit) o.unit = p.unit;
    if (p.utext) o.utext = p.utext;
    return o;
  }).filter((p) => p.start || p.text);
}
/* The older New / Recent / Old words, kept for viewers from before plans. */
function legacy(plan) {
  const pick = (t) => plan.filter((p) => p.type === t && p.mode !== 'spot').map((p) => p.label || p.text || (p.start ? p.start + '\u2013' + p.end : '')).join(', ');
  return { new: pick('new').slice(0, 140), recent: pick('recent').slice(0, 140), old: pick('old').slice(0, 140) };
}
function save() {
  if (!ed) return;
  readText();
  const plan = cleanPlanOut();
  const at = ed.at, len = ed.len, note = (ed.note || '').trim();
  const iso = new Date(at).toISOString();
  // "Move that one here": this IS that lesson, moved.
  const occ = ed.moveOcc || ed.occ;
  if (ed.mode === 'draft') {
    const replaces = ed.moveOcc && ed.moveOcc.kind !== 'set' ? new Date(ed.moveOcc.at).toISOString() : (ed.replaces || null);
    return done({ at, len, plan, note, replaces });
  }
  const pr = P(); if (!pr) return;
  const list = pr.timetable(ed.sid).lessons.slice();
  if (occ && occ.kind === 'set') {
    const nx = { at: iso, len, plan, note, ...legacy(plan) };
    if (occ.replaces) nx.replaces = occ.replaces;
    pr.saveNextLesson(ed.sid, nx);
  } else if (occ && occ.kind === 'single') {
    const was = Date.parse(occ.orig || occ.at);
    const keep = list.filter((l) => Date.parse(l.at) !== was);
    const old = list.find((l) => Date.parse(l.at) === was) || {};
    keep.push({ at: iso, len, ...(plan.length ? { plan } : {}), ...(note ? { note } : {}), ...(old.replaces ? { replaces: old.replaces } : {}) });
    pr.setLessons(ed.sid, keep);
  } else if (occ && occ.kind === 'weekly') {
    // For this date only: a single lesson that stands in for the weekly one.
    const keep = list.filter((l) => Date.parse(l.at) !== at);
    keep.push({ at: iso, len, ...(plan.length ? { plan } : {}), ...(note ? { note } : {}), ...(at !== occ.at ? { replaces: new Date(occ.at).toISOString() } : {}) });
    pr.setLessons(ed.sid, keep);
  } else {
    const keep = list.filter((l) => Date.parse(l.at) !== at);
    keep.push({ at: iso, len, ...(plan.length ? { plan } : {}), ...(note ? { note } : {}) });
    pr.setLessons(ed.sid, keep);
  }
  toast('Lesson saved');
  return done({ at, len, plan, note });
}
function done(res) {
  const cb = ed && ed.onDone;
  close();
  if (cb) cb(res);
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if ($('tleCss')) return;
  const el = document.createElement('style');
  el.id = 'tleCss';
  el.textContent = `
.tle-wrap{position:fixed;inset:0;z-index:1270;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--ui-font);color:var(--ink);}
.tle-scrim{position:absolute;inset:0;background:rgba(23,25,28,.5);}
.tle-card{position:relative;width:100%;max-width:560px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--parchment);border-radius:14px;
  overflow:hidden;box-shadow:0 18px 48px rgba(23,25,28,.3);}
body.compact-ui .tle-wrap{padding:0;align-items:flex-end;}
body.compact-ui .tle-card{max-width:none;max-height:94vh;border-radius:16px 16px 0 0;}
.tle-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 8px;}
.tle-head b{font-size:18px;font-weight:600;}
.tle-x{width:38px;height:38px;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;}
.tle-body{flex:1 1 auto;overflow:auto;padding:0 14px 12px;display:flex;flex-direction:column;gap:10px;}
.tle-body > *{flex-shrink:0;}
.tle-box{background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;}
.tle-h{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);}
.tle-link{background:none;border:none;padding:4px 0;font:500 13px var(--ui-font);color:var(--ink2);text-decoration:underline;cursor:pointer;letter-spacing:0;text-transform:none;}
.tle-link.danger{color:var(--red);}
.tle-mut{font-size:12.5px;color:var(--ink3);}
.tle-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.tle-in{height:38px;box-sizing:border-box;padding:0 9px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:14px var(--ui-font);min-width:0;}
.tle-row .tle-in[type="date"],.tle-row .tle-in[type="time"]{flex:1 1 130px;}
.tle-num{width:64px;flex:none;}
.tle-chip{min-height:34px;padding:0 12px;border:1px solid var(--border2);border-radius:999px;background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;}
.tle-chip.on,.tle-chip.pri{background:var(--ink);color:var(--parchment);border-color:var(--ink);}
.tle-wk{display:grid;grid-template-columns:28px repeat(7,minmax(0,1fr)) 28px;gap:4px;align-items:center;}
.tle-nav{height:36px;border:none;background:none;color:var(--ink3);font-size:18px;cursor:pointer;border-radius:8px;}
.tle-nav:hover{background:var(--parchment2);color:var(--ink);}
.tle-dd{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;border:1px solid var(--border);border-radius:9px;padding:4px 0 5px;background:var(--surface,#fff);}
.tle-dd small{display:block;font-size:10.5px;color:var(--ink3);}
.tle-dd b{display:block;font-size:15px;font-weight:600;}
.tle-dd.today b{color:var(--gold);}
.tle-dd.past{opacity:.55;}
.tle-dd.on{background:var(--ink);border-color:var(--ink);color:var(--parchment);opacity:1;}
.tle-dd.on small,.tle-dd.on.today b{color:var(--parchment);}
.tle-dd:focus-visible,.tle-md:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.tle-dots{display:flex;justify-content:center;gap:2px;height:5px;margin-top:2px;}
.tle-dots i{width:5px;height:5px;border-radius:50%;background:var(--ink3);}
.tle-dots i.me{background:var(--teal,#0f5c63);}
.tle-dd.on .tle-dots i{background:var(--parchment3);}
.tle-month{display:flex;flex-direction:column;gap:6px;}
.tle-mh{display:flex;align-items:center;justify-content:space-between;}
.tle-mh b{font-size:14px;}
.tle-mg{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.tle-mw{text-align:center;font-size:11px;color:var(--ink3);}
.tle-md{all:unset;box-sizing:border-box;cursor:pointer;height:36px;border-radius:8px;text-align:center;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;}
.tle-md:hover{background:var(--parchment2);}
.tle-md i{font-style:normal;font-size:9px;color:var(--teal,#0f5c63);letter-spacing:-1px;}
.tle-md.today{color:var(--gold);font-weight:600;}
.tle-md.past{opacity:.5;}
.tle-md.on{background:var(--ink);color:var(--parchment);}
/* the time bars: framed so they stand apart from the card */
.tle-bars{background:var(--parchment2);border:1px solid var(--border2);border-radius:10px;padding:8px 10px 10px;display:flex;flex-direction:column;gap:2px;}
.tle-ax{margin-top:2px;}
.tle-ax b{display:block;font:600 11.5px var(--ui-font);color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-bottom:3px;}
.tle-marks{position:relative;height:15px;font:10.5px 'IBM Plex Mono',monospace;color:var(--ink3);margin-bottom:4px;}
.tle-marks span{position:absolute;top:2px;transform:translateX(-50%);white-space:nowrap;}
.tle-marks span.first{transform:none;}
.tle-marks span.last{transform:translateX(-100%);}
.tle-lane{position:relative;height:34px;border-radius:7px;background:var(--surface,#fff);border:1px solid var(--border2);overflow:hidden;touch-action:none;cursor:pointer;}
.tle-ni{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ink) 13%,transparent) 0 5px,transparent 5px 9px);}
.tle-busy{position:absolute;top:4px;bottom:4px;border-radius:5px;background:var(--parchment3);border:1px solid var(--border2);font-size:10px;line-height:24px;padding:0 3px;overflow:hidden;white-space:nowrap;color:var(--ink2);}
.tle-busy.me{background:color-mix(in srgb,var(--teal,#0f5c63) 18%,var(--surface,#fff));border-color:var(--teal,#0f5c63);}
.tle-blk{position:absolute;top:1px;bottom:1px;min-width:22px;margin-left:-4px;padding:0 4px;box-sizing:content-box;border-radius:7px;background:color-mix(in srgb,var(--gold) 30%,transparent);border:2px solid var(--gold);cursor:grab;z-index:2;}
.tle-blk.ghost{pointer-events:none;}
.tle-blk.bad{background:color-mix(in srgb,var(--red) 24%,transparent);border-color:var(--red);}
.tle-blk:focus-visible{outline:2px solid var(--ink);outline-offset:1px;}
.tle-read{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;}
.tle-t,.tle-t2{all:unset;box-sizing:border-box;cursor:text;border-radius:7px;padding:3px 6px;margin:-3px -6px;font-family:var(--ui-font);}
.tle-t{font-size:18px;font-weight:600;color:var(--ink);}
.tle-t2{font-size:13px;color:var(--ink2);}
.tle-t:hover,.tle-t2:hover{background:var(--parchment2);}
.tle-t:focus-visible,.tle-t2:focus-visible{outline:2px solid var(--gold);}
.tle-pen{font-size:12px;color:var(--ink3);font-weight:400;}
.tle-typ{display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;}
.tle-typ .tle-in[type="date"]{flex:1 1 140px;}
.tle-typ .tle-in[type="time"]{flex:1 1 110px;}
.tle-fold{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;min-height:24px;font-family:var(--ui-font);}
.tle-box > .tle-fold{width:100%;}
.tle-fold .tle-h{flex:none;}
.tle-h .tle-fold{font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;gap:8px;}
.tle-foldv{flex:1;min-width:0;font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tle-chev{flex:none;color:var(--ink3);font-size:16px;line-height:1;transition:transform .15s;display:inline-block;}
.tle-fold.open .tle-chev{transform:rotate(90deg);}
.tle-fold:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:4px;}
.tle-t2 b{color:var(--ink);font-weight:600;}
.tle-flag{border-radius:10px;padding:8px 11px;font-size:13px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;}
.tle-flag:first-child{margin-top:0;}
.tle-flag.bad{background:color-mix(in srgb,var(--red) 12%,var(--surface,#fff));}
.tle-flag.warn{background:var(--amber-bg,#fff3cd);}
.tle-flag.ok{background:var(--green-bg,#e3f4dc);}
.tle-acts{display:flex;gap:6px;flex-wrap:wrap;}
.tle-sug{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.tle-sug span{font-size:12.5px;color:var(--ink3);}
.tle-seg{border:1px solid var(--border);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;background:var(--parchment);}
.tle-segl{display:flex;align-items:center;gap:6px;}
.tle-stage{flex:0 1 140px;height:34px;}
.tle-mode{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--parchment2);color:var(--ink2);}
.tle-mode.spot{background:var(--spot-blue-bg,#e4eef8);color:var(--spot-blue,#2c5d8f);}
.tle-del{margin-left:auto;width:32px;height:32px;flex:none;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink2);cursor:pointer;}
.tle-del:hover{color:var(--red);border-color:var(--red);}
.tle-range{all:unset;box-sizing:border-box;cursor:pointer;flex:1 1 50%;min-width:0;min-height:38px;padding:4px 9px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);
  font-size:13.5px;display:flex;flex-direction:column;justify-content:center;}
.tle-range small{font:11px 'IBM Plex Mono',monospace;color:var(--ink3);}
.tle-range.empty{color:var(--ink3);border-style:dashed;}
.tle-range:focus-visible{outline:2px solid var(--gold);}
.tle-txt{flex:1 1 40%;}
.tle-foot{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--border);background:var(--surface,#fff);}
.tle-sp{flex:1;}
.tle-btn{min-height:42px;padding:0 18px;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);font:600 14px var(--ui-font);cursor:pointer;}
.tle-btn.pri{background:var(--ink);color:var(--parchment);border-color:var(--ink);}
`;
  document.head.appendChild(el);
}

window.TehfizLesson = { open, close, isOpen, version: TEHFIZ_LESSON_VERSION };
})();
