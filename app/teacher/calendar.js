/* ═══════════════════════════════════════════════════════════════════════
   calendar.js — TehfizCalendar — c7
   Loaded by the teacher app only, from /app/teacher/calendar.js?v=c7.

   c7: removed a check for data-keep, which nothing ever set.

   c6: "Remind…" on a lesson still to come opens a message to copy or send on
   WhatsApp (TehfizRemind, remind.js). "Add to my calendar" in the bar
   subscribes the teacher's own calendar app to every lesson (calendar link,
   server-built, codes not names).

   c5: archived students (v4_349) are not in the calendar or its pickers.

   c4: the week view is a grid of whole hours, each the same height; a
   lesson sits at its real minute, as tall as it is long, with its time on
   it, and lessons at the same time share the width. Two or more empty
   hours fold into a band (tap it to open those hours) unless "Every hour"
   is chosen (06:00 to midnight; remembered on this device,
   tehfiz_cal_fold). Tapping an empty time (or + on a day in List) picks a
   student, then opens the lesson editor at that time — straight to the
   editor when the calendar shows one student. The zone the times are in is
   named next to the dates, and a line marks now.

   c3: every upcoming lesson has Edit (the shared lesson editor), Start a
   session sets up the planned segments, overlapping lessons get a warning sign, and
   days and times follow the teacher's zone (Settings) through TehfizTime.

   c2: a session only stands for a lesson when it started within 3 hours of
   it, and each session stands for one lesson. (c1 matched on the day alone,
   so a morning session hid the evening's lesson.)

   Every student's lessons, a week at a time. Opened from Menu → Calendar;
   nothing else depends on it, so a teacher who never opens it never sees it.

     Week   (default on wide screens) a column per day, a row per start time
            used that week, so empty hours take no room
     List   (default on phones) the same lessons, day by day

   What shows, in the teacher's own time:
     done      a session logged for that student that day — from the sessions
               sent (GET /api/sessions) and the ones on this device
     upcoming  from each student's weekly days and single lessons
     next      the next lesson set in Finish session (or edited)
     missed?   a weekly or single lesson in the past with no session that
               day. "Didn't happen" hides it, on this device only
               (tehfiz_cal_dismissed).

   Tapping a lesson offers what fits it: Review (done), Edit details (the
   student's next lesson — the same editor as the Profile), Remove (a single
   lesson), Open profile, Start a session, Log it now (missed).

   Data: GET /api/plans (every student's timetable from this teacher, codes
   and times only); a copy is kept on this device (tehfiz_cal_plans) so the
   calendar opens offline. Names come from this device's roster.

   Self-contained: namespace window.TehfizCalendar, DOM #tcalRoot, CSS
   prefixed .tcal-. It calls TehfizTime, TehfizSync.{api, roster, isSignedIn,
   pickStudent}, TehfizProfile.{open, ttOf, timetable, editLesson,
   setLessons}, and app: getSessions, reviewSessionObject, migrateMistakes,
   clearResume, resetCurrent, mistakes, showToast.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_CALENDAR_VERSION = 'c7';
const MATCH_MS = 3 * 3600000;
const K_PLANS = 'tehfiz_cal_plans';
const K_DISMISS = 'tehfiz_cal_dismissed';
const K_VIEW = 'tehfiz_cal_view';
const K_FOLD = 'tehfiz_cal_fold';
const K_HOURS = 'tehfiz_teach_hours';
const PX = 64;                // one hour of the week grid, px
const DAY = 86400000;

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function readJ(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }
function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function sync() { return window.TehfizSync || null; }
function P() { return window.TehfizProfile || null; }
function T() { return window.TehfizTime || null; }
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function compact() { return document.body.classList.contains('compact-ui'); }
function signedIn() { return !!(sync() && sync().isSignedIn && sync().isSignedIn()); }

/* ── state ──────────────────────────────────────────────────────────────── */
let open_ = false;
let weekStart = 0;            // Monday 00:00 local, ms
let view = null;              // 'week' | 'list'; null = by screen size
let who = '';                 // '' = all students
let plans = readJ(K_PLANS, null);   // {at, plans: [{student_id, slots, tz, lessons, next_lesson}]}
let sent = [];                // session rows for the week
let loading = false, err = '';
let pick = null;              // the lesson whose actions are showing
let fold = readJ(K_FOLD, true) !== false;   // fold runs of empty hours
let opened = new Set();       // folded runs opened this week (their first hour)
let grid = null;              // the week grid as drawn: {segs, days}
let slot = null;              // a new lesson being placed: {at, x, y}

function Z() { return T().myTz(); }
function addDays(ms, n) { const p = T().partsIn(ms + 12 * 3600000, Z()); return T().zonedToMs(p.y, p.mo, p.d + n, 0, 0, Z()); }
function dayStartOf(ms) { const p = T().partsIn(ms, Z()); return T().zonedToMs(p.y, p.mo, p.d, 0, 0, Z()); }
function mondayOf(ms) { const d = dayStartOf(ms); return addDays(d, -((T().partsIn(d + 12 * 3600000, Z()).wd + 6) % 7)); }
function ymd(ms) { const p = T().partsIn(ms, Z()); return p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); }
function hm(ms) { const p = T().partsIn(ms, Z()); return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'); }
function timeText(ms) { return T().timeText(ms, Z()); }
function dateText(ms, o) { try { return new Date(ms + 12 * 3600000).toLocaleDateString(undefined, { ...o, timeZone: Z() }); } catch { return new Date(ms).toLocaleDateString(undefined, o); } }
function stageLabel(id) { return typeof sessionTypeLabel === 'function' ? sessionTypeLabel(id) : id; }
function names() { const m = {}; (sync() && sync().roster ? sync().roster() : []).forEach((s) => { m[s.id] = s.name || s.code; }); return m; }
// c5: archived students are left out (their past sessions still show, by name).
function roster() { return (sync() && sync().roster ? sync().roster() : []).filter((s) => !s.archived); }
function currentView() { return view || readJ(K_VIEW, null) || (compact() ? 'list' : 'week'); }

/* ── data ───────────────────────────────────────────────────────────────── */
async function load() {
  if (!signedIn()) { err = 'signedout'; render(); return; }
  loading = true; err = ''; render();
  const from = weekStart, to = addDays(weekStart, 7);
  try {
    const [pl, ss] = await Promise.all([
      sync().api('/api/plans'),
      // Bounds are UTC days; a day either side covers every zone.
      sync().api('/api/sessions?limit=500&from=' + ymd(addDays(from, -1)) + '&to=' + ymd(addDays(to, 1))),
    ]);
    plans = { at: Date.now(), plans: (pl && pl.plans) || [] };
    writeJ(K_PLANS, plans);
    sent = (ss && ss.sessions) || [];
  } catch (e) {
    err = (e && e.message) || 'offline';
  }
  loading = false;
  render();
}

/* A student's timetable: this device's copy where the Profile has one (it
   holds changes not sent yet), else the server's. */
function ttFor(p) {
  const id = p.student_id, pr = P();
  const local = pr && pr.timetable ? pr.timetable(id) : null;
  const hasLocal = local && (Object.keys(local.days || {}).length || (local.lessons || []).length);
  if (hasLocal && pr.ttOf) {
    const t = pr.ttOf(id);
    if (!t.next_lesson && p.next_lesson) t.next_lesson = p.next_lesson;
    return t;
  }
  return { slots: p.slots || {}, tz: p.tz || null, lessons: p.lessons || [], next_lesson: p.next_lesson || null };
}

/* Everything for the week: [{at, len, sid, kind, status, ...}] */
function build() {
  const from = weekStart, to = addDays(weekStart, 7), now = Date.now();
  const nm = names(), dismissed = readJ(K_DISMISS, {});
  const out = [];
  // sessions that happened: sent rows plus this device's, once each
  const done = [];
  const seenClient = new Set();
  sent.forEach((r) => {
    const at = r.started_at ? +r.started_at : Date.parse((r.date_ymd || '') + 'T12:00:00');
    if (!Number.isFinite(at) || at < from || at >= to) return;
    if (r.client_id != null) seenClient.add(String(r.client_id));
    done.push({ at, sid: r.student_id, row: r, mistakes: r.mistake_count, dur: r.duration_sec, name: r.session_name });
  });
  (typeof getSessions === 'function' ? getSessions() || [] : []).forEach((s) => {
    if (seenClient.has(String(s.id))) return;
    const at = Date.parse(s.isoDate || '');
    if (!Number.isFinite(at) || at < from || at >= to) return;
    const m = /^(\d+):(\d{2})$/.exec(String(s.duration || ''));
    done.push({ at, sid: s.studentId || null, local: s, mistakes: (s.mistakes || []).length,
                dur: m ? (+m[1]) * 60 + (+m[2]) : null, name: s.sessionName, who: s.student });
  });
  const used = new Set();
  /* The session that stands for a lesson: same student, started within a few
     hours of it, not already used for another — the closest one. */
  const matchFor = (sid, at) => {
    let best = -1, gap = Infinity;
    done.forEach((d, i) => {
      if (used.has(i) || d.sid !== sid) return;
      const g = Math.abs(d.at - at);
      if (g <= MATCH_MS && g < gap) { gap = g; best = i; }
    });
    if (best >= 0) used.add(best);
    return best >= 0;
  };
  done.forEach((d) => out.push({ ...d, kind: 'done', status: 'done', label: (d.sid && nm[d.sid]) || d.who || 'Student' }));

  // scheduled lessons
  if (T()) {
    const ids = new Set(roster().map((s) => s.id));
    const list = ((plans && plans.plans) || []).slice();
    const have = new Set(list.map((p) => p.student_id));
    // c4: a lesson added here before the server has a plan for that student
    roster().forEach((s) => { if (!have.has(s.id)) list.push({ student_id: s.id }); });
    list.forEach((p) => {
      if (!ids.has(p.student_id)) return;
      const tt = ttFor(p);
      const nextO = T().next(tt, now);
      T().occurrences(tt, from, to).forEach((o) => {
        if (matchFor(p.student_id, o.at)) return;   // a session near it: that's the lesson
        const ended = o.at + (o.len || 30) * 60000 < now;
        let status = o.kind === 'set' ? 'next' : 'up';
        if (ended) {
          if (o.kind === 'set' || dismissed[p.student_id + '|' + o.at]) return;
          status = 'missed';
        }
        out.push({ ...o, sid: p.student_id, status, label: nm[p.student_id] || 'Student',
                   isNext: !!(nextO && nextO.at === o.at) });
      });
    });
  }
  // A lesson still to come that overlaps another lesson (any student) is flagged.
  const live = out.filter((e) => e.status === 'up' || e.status === 'next');
  live.forEach((e) => {
    const end = e.at + (e.len || 30) * 60000;
    const hit = out.find((x) => x !== e && x.status !== 'missed' && x.at < end && e.at < x.at + (x.len || 30) * 60000);
    if (hit) e.clash = hit;
  });
  return out.filter((e) => !who || e.sid === who).sort((a, b) => a.at - b.at);
}

/* ── render ─────────────────────────────────────────────────────────────── */
function evText(e) {
  if (e.status === 'done') {
    const n = e.mistakes == null ? '' : e.mistakes + ' mistake' + (e.mistakes === 1 ? '' : 's');
    const d = e.dur && e.dur >= 60 ? Math.round(e.dur / 60) + ' min' : '';
    return '✓ ' + [n, d].filter(Boolean).join(' · ');
  }
  if (e.status === 'missed') return 'No session logged';
  const what = T().planText(e, stageLabel);
  const kind = e.status === 'next' ? 'Next lesson' : e.kind === 'single' ? (e.replaces ? 'Moved' : 'Single lesson') : 'Weekly';
  return kind + (what ? ' · ' + what : (e.len && e.status !== 'next' ? ' · ' + e.len + ' min' : ''));
}
function evHtml(e, i) {
  return '<button type="button" class="tcal-ev ' + e.status + (pick === i ? ' on' : '') + '" data-tcal="ev" data-i="' + i + '">' +
    '<b>' + (e.clash ? '<span class="tcal-warn" title="Overlaps ' + esc(e.clash.label) + '">⚠</span> ' : '') + esc(e.label) + '</b><span>' + esc(evText(e)) + '</span></button>';
}
function pillHtml(e) {
  const t = { done: '✓ Done', missed: 'Missed?', next: 'Next', up: 'Upcoming' }[e.status];
  return '<span class="tcal-pill ' + e.status + '">' + t + '</span>';
}
/* ── week grid (c4) ─────────────────────────────────────────────────────── */
function minOfDay(ms) { const p = T().partsIn(ms, Z()); return p.h * 60 + p.mi; }
function evLen(e) {
  if (e.status === 'done') return e.dur ? Math.max(10, Math.round(e.dur / 60)) : 30;
  return e.len || 30;
}
function teachHours() {
  const h = readJ(K_HOURS, null);
  const m = (x) => { const r = /^(\d{1,2}):(\d{2})$/.exec(String(x || '')); return r ? (+r[1]) * 60 + (+r[2]) : null; };
  const a = h && m(h.from), b = h && m(h.to);
  return a != null && b != null && b > a ? { from: a, to: b } : null;
}
/* Rows of the grid: [{h0, h1, gap?, y, hgt}] — whole hours h0..h1. */
function segments(evs) {
  const spans = evs.map((e) => { const s0 = minOfDay(e.at); return [s0, Math.min(1440, s0 + evLen(e))]; });
  const used = new Set();
  spans.forEach(([a, b]) => { for (let h = Math.floor(a / 60); h < Math.max(Math.ceil(b / 60), Math.floor(a / 60) + 1); h++) used.add(h); });
  let first, last;
  if (fold) {
    if (spans.length) {
      first = Math.max(0, Math.min(...spans.map((x) => Math.floor(x[0] / 60))) - 1);
      last = Math.min(24, Math.max(...spans.map((x) => Math.ceil(x[1] / 60))) + 1);
    } else { const th = teachHours(); first = th ? Math.floor(th.from / 60) : 9; last = th ? Math.ceil(th.to / 60) : 21; }
  } else {
    first = 6; last = 24;
    spans.forEach(([a, b]) => { first = Math.min(first, Math.floor(a / 60)); last = Math.max(last, Math.ceil(b / 60)); });
  }
  const out = [];
  let h = first;
  while (h < last) {
    if (fold && !used.has(h)) {
      let k = h; while (k < last && !used.has(k)) k++;
      if (k - h >= 2 && !opened.has(h)) { out.push({ h0: h, h1: k, gap: true }); h = k; continue; }
    }
    const p = out[out.length - 1];
    if (p && !p.gap && p.h1 === h) p.h1 = h + 1; else out.push({ h0: h, h1: h + 1 });
    h++;
  }
  let y = 0;
  out.forEach((g) => { g.y = y; g.hgt = g.gap ? 30 : (g.h1 - g.h0) * PX; y += g.hgt; });
  return out;
}
function yOf(min) {
  const hh = min / 60;
  for (const g of grid.segs) if (!g.gap && hh >= g.h0 && hh <= g.h1) return g.y + (hh - g.h0) * PX;
  return null;
}
function minAtY(y) {
  for (const g of grid.segs) if (y >= g.y && y < g.y + g.hgt) return g.gap ? null : Math.round(g.h0 * 60 + (y - g.y) / PX * 60);
  return null;
}
/* The moment `min` minutes into day i of the week, in the teacher's zone. */
function slotMs(i, min) {
  const p = T().partsIn(grid.days[i] + 12 * 3600000, Z());
  return T().zonedToMs(p.y, p.mo, p.d, Math.floor(min / 60), min % 60, Z());
}
/* Lessons that overlap share the width: lane and lane count for each. */
function laneOut(items) {
  items.sort((a, b) => a.s - b.s || a.t - b.t);
  let group = [], end = -1;
  const flush = () => {
    const ends = [];
    group.forEach((x) => { let k = ends.findIndex((v) => v <= x.s); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = x.t; x.lane = k; });
    group.forEach((x) => { x.n = ends.length; });
    group = [];
  };
  items.forEach((x) => { if (group.length && x.s >= end) flush(); group.push(x); end = Math.max(end, x.t); });
  if (group.length) flush();
  return items;
}
function hourText(h) {
  const p = T().partsIn(weekStart + 12 * 3600000, Z());
  return timeText(T().zonedToMs(p.y, p.mo, p.d, h, 0, Z()));
}
function weekHtml(evs) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = ymd(Date.now()), now = Date.now();
  const segs = segments(evs);
  grid = { segs, days };
  const H = segs.reduce((n, g) => n + g.hgt, 0);
  const head = '<div class="tcal-dh tcal-corner"></div>' + days.map((d) =>
    '<div class="tcal-dh' + (ymd(d) === today ? ' today' : '') + '">' + esc(dateText(d, { weekday: 'short' })) +
      '<b>' + T().partsIn(d + 12 * 3600000, Z()).d + '</b></div>').join('');
  let gut = '', lines = '', bands = '';
  segs.forEach((g) => {
    if (g.gap) {
      lines += '<div class="tcal-gapbg" style="top:' + g.y + 'px;height:' + g.hgt + 'px"></div>';
      bands += '<button type="button" class="tcal-gap" data-tcal="unfold" data-h="' + g.h0 + '" style="top:' + g.y + 'px;height:' + g.hgt + 'px">' +
        '<span>' + esc(hourText(g.h0)) + ' – ' + esc(g.h1 >= 24 ? hourText(0) : hourText(g.h1)) + ' · no lessons</span></button>';
      return;
    }
    for (let k = g.h0; k < g.h1; k++) {
      const y = g.y + (k - g.h0) * PX;
      gut += '<span class="tcal-hl" style="top:' + y + 'px">' + esc(hourText(k)) + '</span>';
      if (k > g.h0) lines += '<div class="tcal-hr" style="top:' + y + 'px"></div>';
      lines += '<div class="tcal-hr half" style="top:' + (y + PX / 2) + 'px"></div>';
    }
  });
  const cols = days.map((d, di) => {
    const items = laneOut(evs.map((e, i) => ({ e, i })).filter((x) => ymd(x.e.at) === ymd(d)).map((x) => {
      const s0 = minOfDay(x.e.at), t0 = Math.min(1440, s0 + evLen(x.e));
      return { ...x, s: s0, end: t0, t: Math.max(t0, s0 + 23) };
    }));
    const cards = items.map((x) => {
      const top = yOf(x.s); if (top == null) return '';
      const bot = yOf(x.end);
      const h = Math.max((bot != null ? bot : top + (x.end - x.s) / 60 * PX) - top, 24);
      const w = 100 / x.n;
      return '<button type="button" class="tcal-ev ' + x.e.status + (pick === x.i ? ' on' : '') + (h < 40 ? ' short' : '') + '" data-tcal="ev" data-i="' + x.i + '"' +
        ' style="top:' + (top + 1) + 'px;height:' + (h - 2) + 'px;left:calc(' + (w * x.lane) + '% + 3px);width:calc(' + w + '% - 6px)"' +
        ' title="' + esc(x.e.label + ' · ' + timeText(x.e.at) + ' · ' + evText(x.e)) + '">' +
        '<b>' + (x.e.clash ? '<span class="tcal-warn">⚠</span> ' : '') + '<span class="tcal-evt">' + esc(timeText(x.e.at)) + '</span> ' + esc(x.e.label) + '</b>' +
        '<span>' + esc(evText(x.e)) + '</span></button>';
    }).join('');
    let nowLine = '';
    if (ymd(d) === today) { const ny = yOf(minOfDay(now)); if (ny != null) nowLine = '<div class="tcal-now" style="top:' + ny + 'px"></div>'; }
    let ghost = '<div class="tcal-ghost" hidden></div>';
    if (slot && ymd(slot.at) === ymd(d)) {
      const gy = yOf(minOfDay(slot.at));
      if (gy != null) ghost = '<div class="tcal-ghost" style="top:' + gy + 'px">+ ' + esc(timeText(slot.at)) + '</div>';
    }
    const endOfDay = addDays(d, 1);
    return '<div class="tcal-col' + (ymd(d) === today ? ' today' : '') + (endOfDay <= now ? ' past' : '') + '" data-tcal="slot" data-d="' + di + '" style="height:' + H + 'px">' +
      lines + nowLine + cards + ghost + '</div>';
  }).join('');
  return '<div class="tcal-wk">' + head + '</div>' +
    '<div class="tcal-wk tcal-body"><div class="tcal-gut" style="height:' + H + 'px">' + gut + '</div>' + cols + bands + '</div>';
}
/* Where a tap or the pointer is in the grid: {i, min, at, past} or null. */
function slotFrom(col, clientY) {
  if (!grid) return null;
  const i = +col.dataset.d, r = col.getBoundingClientRect();
  let m = minAtY(clientY - r.top);
  if (m == null) return null;
  m = Math.min(Math.floor(m / 15) * 15, 1440 - 15);
  const at = slotMs(i, m);
  return { i, min: m, at, past: at < Date.now() };
}
function onMove(ev) {
  const root = $('tcalRoot'); if (!root || slot) return;
  root.querySelectorAll('.tcal-ghost').forEach((g) => { g.hidden = true; });
  const col = ev.target.closest && ev.target.closest('.tcal-col');
  if (!col || ev.target.closest('.tcal-ev')) return;
  const s0 = slotFrom(col, ev.clientY);
  if (!s0) return;
  const g = col.querySelector('.tcal-ghost'); if (!g) return;
  g.hidden = false; g.style.top = yOf(s0.min) + 'px';
  g.classList.toggle('past', s0.past);
  g.textContent = s0.past ? 'Past' : '+ ' + timeText(s0.at);
}
function onLeave() {
  const root = $('tcalRoot'); if (!root || slot) return;
  root.querySelectorAll('.tcal-ghost').forEach((g) => { g.hidden = true; });
}
/* The student list for a new lesson. */
function pickerHtml(evs) {
  if (!slot) return '';
  const day = ymd(slot.at);
  const hint = (id) => {
    const e = evs.find((x) => x.sid === id && ymd(x.at) === day);
    if (!e) return '';
    return (e.status === 'done' ? 'session ' : 'lesson ') + timeText(e.at);
  };
  const list = roster().slice().sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
  const items = list.map((s) => '<button type="button" class="tcal-pki" data-tcal="pkstu" data-id="' + esc(s.id) + '" data-q="' + esc(String(s.name || s.code).toLowerCase()) + '">' +
    '<span>' + esc(s.name || s.code) + '</span><small>' + esc(hint(s.id)) + '</small></button>').join('');
  let pos = '';
  if (!compact()) {
    const W = 280, x = Math.min(Math.max(8, slot.x + 14), window.innerWidth - W - 8);
    const y = Math.min(Math.max(70, slot.y - 30), window.innerHeight - 380);
    pos = ' style="left:' + x + 'px;top:' + y + 'px"';
  }
  return '<div class="tcal-pk' + (compact() ? ' sheet' : '') + '" role="dialog" aria-label="New lesson"' + pos + '>' +
    '<div class="tcal-acth"><b>New lesson</b><span>' + esc(T().whenText(slot.at, Z())) + '</span>' +
      '<button type="button" class="tcal-x" data-tcal="unslot" aria-label="Close">✕</button></div>' +
    (list.length > 5 ? '<input type="search" class="tcal-pkq" id="tcalPkq" placeholder="Find a student" aria-label="Find a student" autocomplete="off">' : '') +
    '<div class="tcal-pkl">' + (items || '<div class="tcal-agn">Add a student first.</div>') + '</div>' +
    '<div class="tcal-pkn" hidden>No student by that name</div></div>';
}
/* The student's usual lesson length, if their weekly days have one. */
function usualLen(sid) {
  const p = ((plans && plans.plans) || []).find((x) => x.student_id === sid) || { student_id: sid };
  const tt = ttFor(p);
  const l = Object.values((tt && tt.slots) || {}).map((x) => +(x && x.len) || 0).find((n) => n > 0);
  return l || 0;
}
function newLesson(sid, at) {
  if (!window.TehfizLesson) { toast('The lesson editor did not load'); return; }
  const len = usualLen(sid);
  window.TehfizLesson.open({ sid, mode: 'save', draft: { at, ...(len ? { len } : {}) }, onDone: () => { pick = null; render(); } });
}
/* List view's + on a day: that day at the start of teaching hours (5 PM if
   none), or the next quarter hour if that has passed. */
function dayDefault(i) {
  const th = teachHours();
  let at = slotMs(i, th ? th.from : 17 * 60);
  const now = Date.now();
  if (at < now) { const q = 15 * 60000; at = Math.ceil(now / q) * q; }
  return at;
}
function listHtml(evs) {
  const today = ymd(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return '<div class="tcal-ag">' + days.map((d) => {
    const here = evs.map((e, i) => [e, i]).filter(([e]) => ymd(e.at) === ymd(d));
    const label = T().dayText(d + 12 * 3600000, Z());
    const full = dateText(d, { weekday: 'short', day: 'numeric', month: 'short' });
    const canAdd = addDays(d, 1) > Date.now();
    return '<div class="tcal-agd' + (ymd(d) === today ? ' today' : '') + '"><span>' + esc(label === full ? full : label + ' · ' + full) + '</span>' +
      (canAdd ? '<button type="button" class="tcal-agadd" data-tcal="dayadd" data-d="' + days.indexOf(d) + '" aria-label="Add a lesson on ' + esc(full) + '">+ Add</button>' : '') + '</div>' +
      (here.length ? here.map(([e, i]) =>
        '<button type="button" class="tcal-agi' + (pick === i ? ' on' : '') + '" data-tcal="ev" data-i="' + i + '"><span class="tcal-t">' + esc(timeText(e.at)) + '</span>' +
          '<span class="tcal-w"><b>' + (e.clash ? '<span class="tcal-warn" title="Overlaps ' + esc(e.clash.label) + '">⚠</span> ' : '') + esc(e.label) + '</b><small>' + esc(evText(e)) + '</small></span>' + pillHtml(e) + '</button>').join('')
        : '<div class="tcal-agn">No lessons</div>');
  }).join('') + '</div>';
}
function actionsHtml(e) {
  if (!e) return '';
  const when = (T() ? T().whenText(e.at) : new Date(e.at).toLocaleString());
  const their = e.sid && P() && P().theirLine ? P().theirLine(e.sid, e.at) : '';
  const b = (a, l, cls) => '<button type="button" class="tcal-btn' + (cls ? ' ' + cls : '') + '" data-tcal="' + a + '">' + l + '</button>';
  const acts = [];
  if (e.status === 'done') acts.push(b('review', 'Review', 'pri'));
  if (e.status === 'next' || e.status === 'up') {
    acts.push(b('edit', 'Edit', 'pri'));
    acts.push(b('start', 'Start a session'));
    if (e.sid && window.TehfizRemind) acts.push(b('remind', 'Remind…'));
    if (e.kind === 'single' && e.status === 'up') acts.push(b('remove', 'Remove'));
  }
  if (e.status === 'missed') { acts.push(b('log', 'Log it now', 'pri')); acts.push(b('dismiss', 'Didn’t happen')); }
  if (e.sid) acts.push(b('profile', 'Open profile'));
  return '<div class="tcal-act" role="dialog" aria-label="' + esc(e.label) + '">' +
    '<div class="tcal-acth"><b>' + esc(e.label) + '</b><span>' + esc(when) + (e.len ? ' · ' + e.len + ' min' : '') + '</span>' +
      (their ? '<span>' + esc(their) + '</span>' : '') +
      (T().planText(e, stageLabel) ? '<span>' + esc(T().planText(e, stageLabel)) + '</span>' : '') +
      (e.clash ? '<span class="tcal-clash">⚠ Overlaps ' + esc(e.clash.label) + ' ' + esc(timeText(e.clash.at)) + '</span>' : '') +
      '<button type="button" class="tcal-x" data-tcal="unpick" aria-label="Close">✕</button></div>' +
    '<div class="tcal-acts">' + acts.join('') + '</div></div>';
}
let lastEvs = [];
function render() {
  const root = $('tcalRoot');
  if (!root) return;
  if (!open_) { root.innerHTML = ''; root.hidden = true; return; }
  root.hidden = false;
  const evs = build(); lastEvs = evs;
  const v = currentView();
  grid = { segs: [], days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) };
  const end = addDays(weekStart, 6);
  const range = dateText(weekStart, { day: 'numeric', month: 'short' }) + ' – ' + dateText(end, { day: 'numeric', month: 'short', year: 'numeric' });
  const opts = '<option value="">All students</option>' + roster().slice().sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code))
    .map((s) => '<option value="' + esc(s.id) + '"' + (s.id === who ? ' selected' : '') + '>' + esc(s.name || s.code) + '</option>').join('');
  const counts = { missed: evs.filter((e) => e.status === 'missed').length, done: evs.filter((e) => e.status === 'done').length };
  const body = err === 'signedout'
    ? '<div class="tcal-empty">Sign in to see your calendar. It is built from the sessions you send and each student’s schedule.</div>'
    : (err && !plans ? '<div class="tcal-empty">Could not load the calendar: ' + esc(err) + '</div>'
      : (v === 'week' ? weekHtml(evs) : listHtml(evs)));
  const scroller = root.querySelector('.tcal-main'), keep = scroller ? scroller.scrollTop : 0;
  root.innerHTML = '<div class="tcal" role="dialog" aria-modal="true" aria-labelledby="tcalT">' +
    '<div class="tcal-bar"><button type="button" class="tcal-back" data-tcal="close">‹ Back</button><b id="tcalT">Calendar</b>' +
      '<span class="tcal-sp"></span>' + (loading ? '<span class="tcal-mut">Loading…</span>' : '') + '</div>' +
    '<div class="tcal-tools">' +
      '<div class="tcal-nav"><button type="button" class="tcal-ib" data-tcal="prev" aria-label="Previous week">‹</button>' +
        '<span class="tcal-range">' + esc(range) + '</span>' +
        '<button type="button" class="tcal-ib" data-tcal="next" aria-label="Next week">›</button>' +
        '<button type="button" class="tcal-btn sm" data-tcal="today">Today</button></div>' +
      '<div class="tcal-seg" role="group" aria-label="View"><button type="button" data-tcal="view" data-v="week" aria-pressed="' + (v === 'week') + '">Week</button>' +
        '<button type="button" data-tcal="view" data-v="list" aria-pressed="' + (v === 'list') + '">List</button></div>' +
      '<select class="tcal-sel" data-tcal="who" aria-label="Student">' + opts + '</select>' +
      (v === 'week' && !err.startsWith('signed') ? '<div class="tcal-seg" role="group" aria-label="Empty hours"><button type="button" data-tcal="fold" data-f="1" aria-pressed="' + fold + '">Fold empty hours</button>' +
        '<button type="button" data-tcal="fold" data-f="0" aria-pressed="' + !fold + '">Every hour</button></div>' : '') +
      '<span class="tcal-zone">Times in <b>' + esc(T().tzLabel(Z())) + '</b></span>' +
      (window.TehfizCalLink && !String(err).startsWith('signed') ? '<button type="button" class="tcal-btn sm tcal-cl" data-tcal="callink">📅 Add to my calendar</button>' : '') +
    '</div>' +
    '<div class="tcal-main">' + body +
      (err && plans && err !== 'signedout' ? '<div class="tcal-mut tcal-pad">Offline — showing the schedules saved on this device.</div>' : '') + '</div>' +
    '<div class="tcal-lg"><span><i class="done"></i>Done' + (counts.done ? ' · ' + counts.done : '') + '</span><span><i class="up"></i>Upcoming</span><span><i class="next"></i>Next lesson</span>' +
      '<span><i class="missed"></i>No session logged' + (counts.missed ? ' · ' + counts.missed : '') + '</span></div>' +
    (pick != null ? actionsHtml(lastEvs[pick]) : '') +
    pickerHtml(evs) +
  '</div>';
  const nm = root.querySelector('.tcal-main'); if (nm && keep) nm.scrollTop = keep;
  const q = $('tcalPkq'); if (q && !compact()) q.focus({ preventScroll: true });
}

/* ── actions ────────────────────────────────────────────────────────────── */
/* c6: every lesson in the teacher's own calendar app. The link (server-built)
   shows no names or codes; the file, made here, has the names but does not
   follow changes. */
function openCalLink() {
  let api = '', tok = null;
  try { api = localStorage.getItem('tehfiz_sync_api') || ''; tok = localStorage.getItem('tehfiz_sync_token'); } catch (e) {}
  window.TehfizCalLink.open({
    who: 'teacher', api, token: tok, title: 'Add my lessons to my calendar',
    intro: 'Every student’s lessons in your own calendar app, with a reminder before each one.',
    file: {
      label: 'Download with names', button: 'Download (next 8 weeks)',
      note: 'A calendar file made on this device, with each student’s name. It doesn’t follow later changes; download it again after you change lessons.',
      build: (alarm) => {
        const now = Date.now(), nm = names(), ids = new Set(roster().map((x) => x.id)), events = [];
        const list = ((plans && plans.plans) || []).slice(), have = new Set(list.map((p) => p.student_id));
        roster().forEach((x) => { if (!have.has(x.id)) list.push({ student_id: x.id }); });
        list.forEach((p) => {
          if (!ids.has(p.student_id)) return;
          T().occurrences(ttFor(p), now - 3600000, now + 56 * 86400000).forEach((o) => {
            const what = T().planText(o, stageLabel);
            events.push({ uid: 'tehfiz-' + p.student_id + '-' + o.at + '@tehfiz.com', start: o.at, end: o.at + (o.len || 30) * 60000,
              summary: 'Lesson · ' + (nm[p.student_id] || 'Student'), desc: what });
          });
        });
        events.sort((a, b) => a.start - b.start);
        return { name: 'tehfiz-lessons.ics', text: window.TehfizCalLink.eventsIcs({ name: 'Tehfiz lessons', events, alarm }) };
      },
    },
  });
}
async function review(e) {
  if (e.local && typeof reviewSessionObject === 'function') { close(); reviewSessionObject(e.local); return; }
  if (!e.row) return;
  try {
    const d = await sync().api('/api/sessions/' + encodeURIComponent(e.row.id) + '/payload');
    const s = d && d.session;
    if (!s) throw new Error('empty session');
    if (!s.student) s.student = names()[e.row.student_id] || '';
    if (typeof migrateMistakes === 'function') s.mistakes = migrateMistakes(s.mistakes || []);
    close();
    reviewSessionObject(s);
  } catch (x) { toast('Could not open that session: ' + ((x && x.message) || 'offline')); }
}
/* A new session for this student — the one open now stays in Sessions. */
function startFor(e, dated) {
  close();
  const planned = dated ? [] : T().planOf(e);
  if (typeof startSessionFromPlan === 'function') {
    if (!startSessionFromPlan(e.sid, planned)) { toast('Save or clear the current session first'); return; }
  } else if (sync().pickStudent) sync().pickStudent(e.sid);
  if (dated) {
    const el = $('sessionDate');
    if (el) { el.value = ymd(e.at); if (typeof onSessionDateChange === 'function') onSessionDateChange(); }
  }
  toast('New session for ' + e.label + (planned.some((p) => p.start) ? ' · segments set up' : ''));
}
function onClick(ev) {
  const t = ev.target.closest('[data-tcal]');
  if (!t) return;
  const a = t.dataset.tcal;
  if (a === 'who' || a === 'pkq') return;
  if (a === 'close') return close();
  if (a === 'prev' || a === 'next' || a === 'today') {
    weekStart = a === 'today' ? mondayOf(Date.now()) : addDays(weekStart, a === 'prev' ? -7 : 7);
    pick = null; slot = null; opened = new Set(); load(); return;
  }
  if (a === 'fold') { fold = t.dataset.f === '1'; writeJ(K_FOLD, fold); opened = new Set(); slot = null; return render(); }
  if (a === 'unfold') { opened.add(+t.dataset.h); slot = null; return render(); }
  if (a === 'unslot') { slot = null; return render(); }
  if (a === 'pkstu') { const at = slot && slot.at; slot = null; render(); if (at) newLesson(t.dataset.id, at); return; }
  if (a === 'slot' || a === 'dayadd') {
    if (slot || pick != null) { slot = null; pick = null; return render(); }   // a tap outside closes what is open
    let at;
    if (a === 'slot') { const s0 = slotFrom(t, ev.clientY); if (!s0 || s0.past) return; at = s0.at; }
    else at = dayDefault(+t.dataset.d);
    if (who) { newLesson(who, at); return; }
    const r = t.getBoundingClientRect();
    slot = { at, x: a === 'slot' ? r.right : r.left, y: ev.clientY || r.bottom };
    return render();
  }
  if (a === 'view') { view = t.dataset.v; writeJ(K_VIEW, view); pick = null; slot = null; return render(); }
  if (a === 'ev') { const i = +t.dataset.i; slot = null; pick = pick === i ? null : i; return render(); }
  if (a === 'unpick') { pick = null; return render(); }
  if (a === 'callink') { openCalLink(); return; }
  const e = pick != null ? lastEvs[pick] : null;
  if (!e) return;
  if (a === 'review') return review(e);
  if (a === 'profile') { const id = e.sid; close(); if (P()) P().open(id, 'timetable'); return; }
  // c6: the calendar stays open under the message.
  if (a === 'remind') { if (window.TehfizRemind) window.TehfizRemind.open({ sid: e.sid, at: e.at, len: e.len, lesson: e }); return; }
  if (a === 'start') return startFor(e, false);
  if (a === 'log') return startFor(e, true);
  if (a === 'dismiss') {
    const d = readJ(K_DISMISS, {}); d[e.sid + '|' + e.at] = Date.now();
    // Keep the list from growing for ever: drop entries older than a year.
    Object.keys(d).forEach((k) => { if (+k.split('|')[1] < Date.now() - 365 * DAY) delete d[k]; });
    writeJ(K_DISMISS, d); pick = null; toast('Marked as not happening'); return render();
  }
  if (a === 'remove' && P() && P().setLessons) {
    P().setLessons(e.sid, P().timetable(e.sid).lessons.filter((l) => Date.parse(l.at) !== e.at));
    pick = null; toast('Lesson removed'); return render();
  }
  if (a === 'edit' && window.TehfizLesson) { window.TehfizLesson.open({ sid: e.sid, occ: e, mode: 'save', onDone: () => { pick = null; render(); } }); }
}
function onChange(ev) {
  if (ev.target.dataset && ev.target.dataset.tcal === 'who') { who = ev.target.value; pick = null; slot = null; render(); }
}
/* The picker's search: hide students whose name does not match. */
function onInput(ev) {
  if (ev.target.id !== 'tcalPkq') return;
  const q = ev.target.value.trim().toLowerCase(), root = $('tcalRoot');
  let n = 0;
  root.querySelectorAll('.tcal-pki').forEach((b) => { const ok = !q || b.dataset.q.includes(q); b.hidden = !ok; if (ok) n++; });
  const none = root.querySelector('.tcal-pkn'); if (none) none.hidden = n > 0;
}

/* ── open / close ───────────────────────────────────────────────────────── */
function open() {
  injectCss();
  let root = $('tcalRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'tcalRoot'; root.hidden = true;
    document.body.appendChild(root);
    root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput);
    root.addEventListener('mousemove', onMove); root.addEventListener('mouseleave', onLeave);
    // Enter in the search picks the only student left.
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.id !== 'tcalPkq') return;
      const vis = [...root.querySelectorAll('.tcal-pki')].filter((b) => !b.hidden);
      if (vis.length === 1) { e.preventDefault(); vis[0].click(); }
    });
  }
  open_ = true; pick = null; slot = null;
  if (!weekStart) weekStart = mondayOf(Date.now());
  render();
  load();
}
function close() { open_ = false; pick = null; slot = null; render(); }
document.addEventListener('keydown', (e) => {
  if (!open_) return;
  if (window.TehfizLesson && window.TehfizLesson.isOpen()) return;   // the editor has its own keys
  if (window.TehfizRemind && window.TehfizRemind.isOpen()) return;   // c6: so is the message
  if (window.TehfizCalLink && window.TehfizCalLink.isOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (slot) { slot = null; render(); } else if (pick != null) { pick = null; render(); } else close(); return; }
  if (e.key === 'Enter' && e.target && e.target.id === 'tcalPkq') return;   // handled on the root
  e.stopPropagation();   // the app's single-key shortcuts stay quiet behind this page
}, true);
// The Profile may change a schedule while the calendar is open underneath.
window.addEventListener('storage', () => { if (open_) render(); });

function injectCss() {
  if ($('tcalCss')) return;
  const el = document.createElement('style');
  el.id = 'tcalCss';
  el.textContent = `
#tcalRoot[hidden]{display:none;}
.tcal{position:fixed;inset:0;z-index:1100;background:var(--parchment2);color:var(--ink);font-family:var(--ui-font);display:flex;flex-direction:column;}
.tcal-bar{flex:none;background:var(--chrome);color:var(--on-ink);display:flex;align-items:center;gap:12px;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));}
.tcal-bar b{font-size:17px;font-weight:600;}
.tcal-back{height:40px;padding:0 12px;border:1px solid var(--chrome-3);border-radius:8px;background:var(--chrome-2);color:var(--on-ink);font:500 14px var(--ui-font);cursor:pointer;}
.tcal-sp{flex:1;}
.tcal-mut{font-size:13px;color:var(--ink3);}
.tcal-bar .tcal-mut{color:color-mix(in srgb,var(--on-ink) 65%,transparent);}
.tcal-tools{flex:none;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 14px;background:var(--surface,#fff);border-bottom:1px solid var(--border);}
.tcal-nav{display:flex;align-items:center;gap:6px;}
.tcal-range{font-weight:600;font-size:14px;min-width:150px;text-align:center;}
.tcal-ib{width:36px;height:36px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font-size:17px;cursor:pointer;}
.tcal-btn{min-height:40px;padding:0 14px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.tcal-btn.sm{min-height:36px;padding:0 10px;font-size:13px;}
.tcal-btn.pri{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.tcal-btn:hover:not(.pri){background:var(--parchment2);}
.tcal-seg{display:flex;}
.tcal-seg button{height:36px;padding:0 12px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;}
.tcal-seg button:first-child{border-radius:8px 0 0 8px;}
.tcal-seg button:last-child{border-radius:0 8px 8px 0;margin-left:-1px;}
.tcal-seg button[aria-pressed="true"]{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.tcal-sel{height:36px;padding:0 8px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:13px var(--ui-font);max-width:200px;}
.tcal-main{flex:1 1 auto;overflow:auto;}
.tcal-pad{padding:10px 14px;}
.tcal-empty{padding:40px 16px;text-align:center;color:var(--ink3);font-size:14px;}
.tcal-wk{display:grid;grid-template-columns:64px repeat(7,minmax(110px,1fr));min-width:830px;}
.tcal-wk:first-child{position:sticky;top:0;z-index:4;}
.tcal-dh{padding:8px 8px 6px;font-size:12px;color:var(--ink3);background:var(--surface,#fff);border-bottom:1px solid var(--border);border-left:1px solid var(--border);}
.tcal-dh b{display:block;font-size:16px;color:var(--ink);font-weight:600;}
.tcal-dh.today b{color:var(--gold);}
.tcal-corner{border-left:none;}
.tcal-body{position:relative;background:var(--surface,#fff);padding-bottom:12px;}
.tcal-gut{position:relative;}
.tcal-hl{position:absolute;right:8px;transform:translateY(-50%);font:500 11px 'IBM Plex Mono',monospace;color:var(--ink3);white-space:nowrap;}
.tcal-hl:first-child{transform:none;}
.tcal-col{position:relative;border-left:1px solid var(--border);cursor:copy;}
.tcal-col.past{cursor:default;}
.tcal-col.today{background:color-mix(in srgb,var(--gold) 7%,transparent);}
.tcal-hr{position:absolute;left:0;right:0;border-top:1px solid var(--border);pointer-events:none;}
.tcal-hr.half{border-top-style:dotted;opacity:.55;}
.tcal-gapbg{position:absolute;left:0;right:0;pointer-events:none;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ink) 7%,transparent) 0 6px,transparent 6px 12px);
  border-top:1px solid var(--border);border-bottom:1px solid var(--border);}
.tcal-gap{all:unset;box-sizing:border-box;position:absolute;left:64px;right:0;z-index:2;display:flex;align-items:center;justify-content:center;cursor:pointer;}
.tcal-gap span{font-size:11.5px;color:var(--ink3);background:var(--surface,#fff);border:1px solid var(--border);border-radius:999px;padding:1px 10px;}
.tcal-gap:hover span,.tcal-gap:focus-visible span{color:var(--ink);border-color:var(--gold);}
.tcal-now{position:absolute;left:0;right:0;border-top:2px solid var(--red);z-index:3;pointer-events:none;}
.tcal-now::before{content:"";position:absolute;left:-4px;top:-5px;width:8px;height:8px;border-radius:50%;background:var(--red);}
.tcal-ghost{position:absolute;left:3px;right:3px;height:30px;z-index:1;pointer-events:none;border:1.5px dashed var(--gold);border-radius:7px;
  background:color-mix(in srgb,var(--gold) 12%,transparent);font:600 11.5px 'IBM Plex Mono',monospace;color:var(--gold);padding:6px 7px;box-sizing:border-box;}
.tcal-ghost.past{border-color:var(--border2);background:none;color:var(--ink3);}
.tcal-zone{font-size:12.5px;color:var(--ink3);}
.tcal-cl{margin-left:auto;}
.tcal-zone b{color:var(--ink);font-weight:600;}
.tcal-ev{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:1px;padding:4px 7px;border-radius:7px;font-size:12px;line-height:1.3;
  border-left:3px solid;min-width:0;position:absolute;z-index:2;overflow:hidden;}
.tcal-ev.short{flex-direction:row;align-items:center;}
.tcal-ev.short > span{display:none;}
.tcal-evt{font:600 11px 'IBM Plex Mono',monospace;color:var(--ink2);}
.tcal-ev b{font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tcal-ev span{color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tcal-ev:focus-visible,.tcal-agi:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.tcal-ev.on{box-shadow:0 0 0 2px var(--ink);}
.tcal-ev.done{background:var(--green-bg,#e3f4dc);border-color:var(--green,#3e9b2f);}
.tcal-ev.up{background:color-mix(in srgb,var(--teal,#0f5c63) 12%,var(--surface,#fff));border-color:var(--teal,#0f5c63);}
.tcal-ev.next{background:var(--gold-pale,#fbf1cf);border-color:var(--gold);}
.tcal-ev.missed{background:color-mix(in srgb,var(--red) 10%,var(--surface,#fff));border-color:var(--red);border-left-style:dashed;}
.tcal-ag{display:flex;flex-direction:column;padding-bottom:20px;}
.tcal-agd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px 5px;font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);}
.tcal-agd.today{color:var(--ink);}
.tcal-agadd{min-height:32px;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:500 12.5px var(--ui-font);
  letter-spacing:0;text-transform:none;cursor:pointer;}
.tcal-pk{position:fixed;z-index:6;width:280px;max-height:360px;background:var(--parchment);border:1px solid var(--border2);border-radius:14px;
  box-shadow:0 14px 40px rgba(23,25,28,.28);padding:12px 12px 10px;display:flex;flex-direction:column;gap:8px;}
.tcal-pk.sheet{left:50%;bottom:56px;transform:translateX(-50%);width:min(440px,calc(100% - 24px));max-height:60vh;}
.tcal-pkq{height:38px;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:14px var(--ui-font);}
.tcal-pkl{overflow:auto;display:flex;flex-direction:column;gap:2px;min-height:0;}
.tcal-pki{all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:40px;padding:6px 10px;border-radius:8px;font-size:14px;}
.tcal-pki[hidden]{display:none;}
.tcal-pki:hover,.tcal-pki:focus-visible{background:var(--gold-pale,#fbf1cf);}
.tcal-pki small{font-size:12px;color:var(--ink3);}
.tcal-pkn{font-size:13px;color:var(--ink3);padding:4px 10px;}
.tcal-agi{all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:center;padding:10px 14px;
  background:var(--surface,#fff);border-top:1px solid var(--border);font-size:14px;}
.tcal-agi.on{background:var(--parchment);}
.tcal-t{font:500 12.5px 'IBM Plex Mono',monospace;color:var(--ink2);}
.tcal-w{min-width:0;display:flex;flex-direction:column;}
.tcal-w b{font-weight:600;}
.tcal-w small{font-size:12.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tcal-agn{padding:8px 14px;font-size:13px;color:var(--ink3);background:var(--surface,#fff);border-top:1px solid var(--border);}
.tcal-pill{font-size:11.5px;border-radius:999px;padding:2px 9px;white-space:nowrap;}
.tcal-pill.done{background:var(--green-bg,#e3f4dc);color:var(--ink);}
.tcal-pill.up{background:color-mix(in srgb,var(--teal,#0f5c63) 14%,var(--surface,#fff));}
.tcal-pill.next{background:var(--gold-pale,#fbf1cf);}
.tcal-pill.missed{background:color-mix(in srgb,var(--red) 14%,var(--surface,#fff));}
.tcal-lg{flex:none;display:flex;flex-wrap:wrap;gap:6px 16px;padding:8px 14px;padding-bottom:max(8px,env(safe-area-inset-bottom));font-size:12px;color:var(--ink2);background:var(--surface,#fff);border-top:1px solid var(--border);}
.tcal-lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;}
.tcal-lg i.done{background:var(--green,#3e9b2f);}
.tcal-lg i.up{background:var(--teal,#0f5c63);}
.tcal-lg i.next{background:var(--gold);}
.tcal-lg i.missed{background:var(--red);}
.tcal-warn{color:var(--amber,#8a5a00);}
.tcal-clash{color:var(--red);}
.tcal-act{position:absolute;left:50%;bottom:56px;transform:translateX(-50%);width:min(440px,calc(100% - 24px));background:var(--parchment);border:1px solid var(--border2);
  border-radius:14px;box-shadow:0 14px 40px rgba(23,25,28,.28);padding:14px 16px;display:flex;flex-direction:column;gap:10px;z-index:5;}
.tcal-acth{position:relative;display:flex;flex-direction:column;gap:2px;padding-right:44px;font-size:13px;color:var(--ink2);}
.tcal-acth b{font-size:16px;color:var(--ink);}
.tcal-x{position:absolute;top:-4px;right:-4px;width:36px;height:36px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;}
.tcal-acts{display:flex;flex-wrap:wrap;gap:8px;}
`;
  document.head.appendChild(el);
}

window.TehfizCalendar = { open, close, isOpen: () => open_, version: TEHFIZ_CALENDAR_VERSION };
})();
