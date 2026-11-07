/* ═══════════════════════════════════════════════════════════════════════
   calendar.js — TehfizCalendar — c3
   Loaded by the teacher app only, from /app/teacher/calendar.js?v=c3.

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
const TEHFIZ_CALENDAR_VERSION = 'c3';
const MATCH_MS = 3 * 3600000;
const K_PLANS = 'tehfiz_cal_plans';
const K_DISMISS = 'tehfiz_cal_dismissed';
const K_VIEW = 'tehfiz_cal_view';
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
function roster() { return sync() && sync().roster ? sync().roster() : []; }
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
  if (T() && plans && plans.plans) {
    const ids = new Set(roster().map((s) => s.id));
    plans.plans.forEach((p) => {
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
function weekHtml(evs) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = ymd(Date.now());
  const times = Array.from(new Set(evs.map((e) => hm(e.at)))).sort();
  const head = '<div class="tcal-dh tcal-corner"></div>' + days.map((d) =>
    '<div class="tcal-dh' + (ymd(d) === today ? ' today' : '') + '">' + esc(dateText(d, { weekday: 'short' })) +
      '<b>' + T().partsIn(d + 12 * 3600000, Z()).d + '</b></div>').join('');
  if (!times.length) {
    return '<div class="tcal-wk">' + head + '</div><div class="tcal-empty">No lessons this week.</div>';
  }
  const rows = times.map((tm) => '<div class="tcal-tm">' + esc(timeText(evs.find((e) => hm(e.at) === tm).at)) + '</div>' +
    days.map((d) => {
      const here = evs.map((e, i) => [e, i]).filter(([e]) => ymd(e.at) === ymd(d) && hm(e.at) === tm);
      return '<div class="tcal-cell' + (ymd(d) === today ? ' today' : '') + '">' + here.map(([e, i]) => evHtml(e, i)).join('') + '</div>';
    }).join('')).join('');
  return '<div class="tcal-wk">' + head + rows + '</div>';
}
function listHtml(evs) {
  const today = ymd(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return '<div class="tcal-ag">' + days.map((d) => {
    const here = evs.map((e, i) => [e, i]).filter(([e]) => ymd(e.at) === ymd(d));
    const label = T().dayText(d + 12 * 3600000, Z());
    const full = dateText(d, { weekday: 'short', day: 'numeric', month: 'short' });
    return '<div class="tcal-agd' + (ymd(d) === today ? ' today' : '') + '">' + esc(label === full ? full : label + ' · ' + full) + '</div>' +
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
    '</div>' +
    '<div class="tcal-main">' + body +
      (err && plans && err !== 'signedout' ? '<div class="tcal-mut tcal-pad">Offline — showing the schedules saved on this device.</div>' : '') + '</div>' +
    '<div class="tcal-lg"><span><i class="done"></i>Done' + (counts.done ? ' · ' + counts.done : '') + '</span><span><i class="up"></i>Upcoming</span><span><i class="next"></i>Next lesson</span>' +
      '<span><i class="missed"></i>No session logged' + (counts.missed ? ' · ' + counts.missed : '') + '</span></div>' +
    (pick != null ? actionsHtml(lastEvs[pick]) : '') +
  '</div>';
  const nm = root.querySelector('.tcal-main'); if (nm && keep) nm.scrollTop = keep;
}

/* ── actions ────────────────────────────────────────────────────────────── */
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
  if (a === 'who') return;
  if (a === 'close') return close();
  if (a === 'prev' || a === 'next' || a === 'today') {
    weekStart = a === 'today' ? mondayOf(Date.now()) : addDays(weekStart, a === 'prev' ? -7 : 7);
    pick = null; load(); return;
  }
  if (a === 'view') { view = t.dataset.v; writeJ(K_VIEW, view); pick = null; return render(); }
  if (a === 'ev') { const i = +t.dataset.i; pick = pick === i ? null : i; return render(); }
  if (a === 'unpick') { pick = null; return render(); }
  const e = pick != null ? lastEvs[pick] : null;
  if (!e) return;
  if (a === 'review') return review(e);
  if (a === 'profile') { const id = e.sid; close(); if (P()) P().open(id, 'timetable'); return; }
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
  if (ev.target.dataset && ev.target.dataset.tcal === 'who') { who = ev.target.value; pick = null; render(); }
}

/* ── open / close ───────────────────────────────────────────────────────── */
function open() {
  injectCss();
  let root = $('tcalRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'tcalRoot'; root.hidden = true;
    document.body.appendChild(root);
    root.addEventListener('click', onClick); root.addEventListener('change', onChange);
  }
  open_ = true; pick = null;
  if (!weekStart) weekStart = mondayOf(Date.now());
  render();
  load();
}
function close() { open_ = false; pick = null; render(); }
document.addEventListener('keydown', (e) => {
  if (!open_) return;
  if (window.TehfizLesson && window.TehfizLesson.isOpen()) return;   // the editor has its own keys
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (pick != null) { pick = null; render(); } else close(); return; }
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
.tcal-dh{position:sticky;top:0;z-index:2;padding:8px 8px 6px;font-size:12px;color:var(--ink3);background:var(--surface,#fff);border-bottom:1px solid var(--border);border-left:1px solid var(--border);}
.tcal-dh b{display:block;font-size:16px;color:var(--ink);font-weight:600;}
.tcal-dh.today b{color:var(--gold);}
.tcal-corner{border-left:none;}
.tcal-tm{font:500 11.5px 'IBM Plex Mono',monospace;color:var(--ink3);padding:8px 6px;border-bottom:1px solid var(--border);}
.tcal-cell{min-height:56px;padding:4px;border-left:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:4px;}
.tcal-cell.today{background:color-mix(in srgb,var(--gold) 7%,transparent);}
.tcal-ev{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:1px;padding:5px 7px;border-radius:7px;font-size:12px;line-height:1.3;
  border-left:3px solid;min-width:0;}
.tcal-ev b{font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tcal-ev span{color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tcal-ev:focus-visible,.tcal-agi:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.tcal-ev.on{box-shadow:0 0 0 2px var(--ink);}
.tcal-ev.done{background:var(--green-bg,#e3f4dc);border-color:var(--green,#3e9b2f);}
.tcal-ev.up{background:color-mix(in srgb,var(--teal,#0f5c63) 12%,var(--surface,#fff));border-color:var(--teal,#0f5c63);}
.tcal-ev.next{background:var(--gold-pale,#fbf1cf);border-color:var(--gold);}
.tcal-ev.missed{background:color-mix(in srgb,var(--red) 10%,var(--surface,#fff));border-color:var(--red);border-left-style:dashed;}
.tcal-ag{display:flex;flex-direction:column;padding-bottom:20px;}
.tcal-agd{padding:12px 14px 5px;font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);}
.tcal-agd.today{color:var(--ink);}
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
