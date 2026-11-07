/* ═══════════════════════════════════════════════════════════════════════
   profile.js — TehfizProfile — p14
   Loaded by the teacher app only, from /app/teacher/profile.js?v=p14.

   p14: the student's time zone can be found by country.

   p13: nextOf is exported, for the Students list.

   p12: the map's memorised ayahs (TehfizMap mp5) are saved with its pages —
   queued with them, sent with them, and kept in step after a lesson.

   p11: the next-lesson card skips today's lesson once it has been taught.

   p9: lessons are planned and edited in one editor (lesson-editor.js):
   the next-lesson card's Edit, + Add a single lesson, a single lesson's row.

   One student, one page. Opened from:
     · the Students panel (Profile › on a student's row)
     · the session card (Profile › beside the linked code)
     · Finish session (Profile › beside the student)
     · Menu → Invoices (tapping a student's name opens the Billing tab)

   Tabs:
     Overview   next lesson (from the timetable), what is memorised, last
                session logged on this device, the progress report, and Login:
                code, claimed, Reset PIN, Change code — with the same warnings
     Memorised  the memorisation map (shared/tehfiz-map.js): by juz, by surah,
                one juz in half pages to mark Old / Recent / New
     Schedule   lesson days (a time and a length for each, every week) and
                single lessons on a date — side by side, neither replaces the
                other. Times are entered in the teacher's own time; with the
                student's time zone set, each shows the student's time beside
                it as it is typed (p7)
     Billing    rate, rounding, who to bill; an invoice for a month or a custom
                range (5 Oct – 4 Nov); past invoices; hours by month

   Where the data lives:
     · the student, PIN and code: TehfizSync (server), name on this device
     · map and timetable: the server (GET/PUT /api/students/:id/plan), so the
       student sees them too. Each change is queued on this device first
       ('tehfiz_prof_mapq', 'tehfiz_prof_ttq') and sent; a change made offline
       goes when the connection is back. 'tehfiz_prof_tt' caches the timetable
       so the next lesson can be worked out offline. A timetable set before p2
       (device only) is sent up the first time the student's plan loads empty.
     · billing: TehfizSync.billing and TehfizInvoices.forStudent — the same
       arithmetic and status the Invoices screen uses, so they cannot disagree

   p7: the name can be changed from the bar (✎), and the student's own time
   zone set on the Overview — both local, like names (see TehfizSync.
   setStudentName / setStudentTz). Lesson times use TehfizTime (shared/
   tehfiz-time.js), which the student viewer uses too.

   Self-contained: namespace window.TehfizProfile, DOM in #tpfRoot, storage
   prefix 'tehfiz_prof_', CSS prefixed .tpf-. It calls:
     TehfizSync.{student, localSessionsFor, resetPin, rotateCode, openViewer,
                 isSignedIn, billing}
     TehfizInvoices.forStudent, app: showToast, corrTally, sessionTypeLabel
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_PROFILE_VERSION = 'p14';
const K_TT = 'tehfiz_prof_tt';            // {sid: {days: {'1': {t:'17:00', len:45}, …}, lessons: [{at, len}]}}, 0 = Sunday — a cache
const K_LSQ = 'tehfiz_prof_lsq';          // {sid: true} single lessons not yet on the server (p7)
const K_MAPQ = 'tehfiz_prof_mapq';        // {sid: {pages, recent_auto, ayahs}} not yet on the server
const K_TTQ = 'tehfiz_prof_ttq';          // {sid: true} timetable not yet on the server
const K_NLQ = 'tehfiz_prof_nlq';          // {sid: next lesson | null} not yet on the server
/* p3: the last plan seen per student, so a session can use the map (stage,
   new lesson) and Finish session can suggest the next lesson without waiting
   for the network — or without it at all. */
const K_PLANS = 'tehfiz_prof_plans';      // {sid: {map, timetable, at}}
const PLAN_FRESH_MS = 5 * 60 * 1000;
function cachePlan(id, p) {
  if (!p) return;
  const all = readJ(K_PLANS, {});
  all[id] = { map: p.map || {}, timetable: p.timetable || {}, at: Date.now() };
  writeJ(K_PLANS, all);
}
/* The plan as this device knows it, with changes not yet sent laid over it. */
function cachedPlan(id) {
  const c = readJ(K_PLANS, {})[id] || null;
  const mq = readJ(K_MAPQ, {})[id], nq = readJ(K_NLQ, {});
  if (!c && !mq) return null;
  const p = { map: { ...((c && c.map) || {}) }, timetable: { ...((c && c.timetable) || {}) }, at: c ? c.at : 0 };
  if (mq) { p.map.pages = mq.pages; p.map.recent_auto = mq.recent_auto; if (mq.ayahs != null) p.map.ayahs = mq.ayahs; }
  if (Object.prototype.hasOwnProperty.call(nq, id)) p.timetable.next_lesson = nq[id];
  return p;
}
const DAYS = [1, 2, 3, 4, 5, 6, 0];       // shown Monday first
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// p6: the tabs read Memorisation and Schedule (the keys stay as they were).
const TABS = [['overview', 'Overview'], ['memorised', 'Memorisation'], ['timetable', 'Schedule'], ['billing', 'Billing']];

let isOpen = false, sid = null, tab = 'overview', ask = null, busy = false;
/* p5: folded lines — Login on the Overview, the rate and the monthly hours on Billing. */
let loginOpen = false, rateOpen = false, monthsOpen = false;
/* p7: the name being edited, the time zone line opened, the single-lesson form. */
let nameEdit = false, tzOpen = false, tzQ = '', tzEdit = false;   // p8: tzQ — the zone search; p10: tzEdit — searching to change it
// Billing tab state. `line` is undefined while loading, null when nothing was taught.
let bp = null, bLine, bErr = '', bMonths = null, bSeq = 0;
// The plan (map + timetable) as last read from or written to the server.
// planState: 'idle' | 'loading' | 'ok' | 'error' | 'signedout'
let plan = null, planState = 'idle', planErr = '', mapView = null, saveNote = '';

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sync() { return window.TehfizSync || null; }
function inv() { return window.TehfizInvoices && window.TehfizInvoices.forStudent; }
function bill() { return sync() && sync().billing; }
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function readJ(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }
function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function stu() { return sync() && sync().student ? sync().student(sid) : null; }
function nameOf(s) { return (s && s.name) || 'Unnamed student'; }

/* ── timetable ──────────────────────────────────────────────────────────── */
function timetable(id) {
  const t = readJ(K_TT, {})[id] || {};
  return { days: t.days || {}, lessons: Array.isArray(t.lessons) ? t.lessons : [] };
}
/* What the server sent, into this device's copy — except a part that has a
   change waiting to go up, which stays as it is here. */
function cacheTT(id, tt) {
  if (!tt) return;
  const all = readJ(K_TT, {}), cur = all[id] || {};
  all[id] = {
    days: readJ(K_TTQ, {})[id] ? (cur.days || {}) : (tt.slots || {}),
    lessons: readJ(K_LSQ, {})[id] ? (cur.lessons || []) : (Array.isArray(tt.lessons) ? tt.lessons : []),
  };
  writeJ(K_TT, all);
}
function setLessons(id, list) {
  const all = readJ(K_TT, {});
  const t = all[id] || { days: {} };
  t.lessons = list.slice().sort((a, b) => (a.at < b.at ? -1 : 1));
  all[id] = t; writeJ(K_TT, all);
  const q = readJ(K_LSQ, {}); q[id] = true; writeJ(K_LSQ, q);
  scheduleSave();
}
function T() { return window.TehfizTime || null; }
/* The whole timetable as TehfizTime reads it. Weekly times are this
   device's own time (they are entered here, and saved with this zone). */
function ttOf(id) {
  const t = timetable(id), c = cachedPlan(id);
  return { slots: t.days, tz: T() ? T().myTz() : null, lessons: t.lessons,
           next_lesson: c && c.timetable ? c.timetable.next_lesson || null : null };
}
/* The student's own time zone when it differs from this device's, else ''. */
function theirTz(id, ms) {
  const s = sync() && sync().student ? sync().student(id) : null;
  const z = s && s.tz;
  if (!z || !T() || !T().validTz(z) || T().sameOffset(z, T().myTz(), ms)) return '';
  return z;
}
/* "For Yusuf: Tomorrow · 12:00 PM in London", or '' when it is the same time. */
function theirLine(id, ms) {
  const z = theirTz(id, ms); if (!z || !ms) return '';
  const s = sync().student(id);
  return 'For ' + nameOf(s) + ': ' + T().whenText(ms, z) + ' in ' + T().city(z);
}
function setDay(id, dow, patch) {
  const all = readJ(K_TT, {});
  const t = all[id] || { days: {} };
  t.days = t.days || {};
  if (patch === null) delete t.days[dow];
  else t.days[dow] = { t: '17:00', len: 45, ...(t.days[dow] || {}), ...patch };
  all[id] = t; writeJ(K_TT, all);
  const q = readJ(K_TTQ, {}); q[id] = true; writeJ(K_TTQ, q);
  scheduleSave();
}

/* ── the plan on the server ─────────────────────────────────────────────── */
function signedIn() { return !!(sync() && sync().isSignedIn && sync().isSignedIn()); }
async function loadPlan(id) {
  if (!signedIn()) { planState = 'signedout'; render(); return; }
  planState = 'loading'; planErr = ''; render();
  try {
    let p = await sync().api('/api/students/' + encodeURIComponent(id) + '/plan');
    if (id !== sid) return;
    // A timetable set on this device before it lived on the server goes up once.
    const local = readJ(K_TT, {})[id];
    const hasLocal = local && local.days && Object.keys(local.days).length;
    if (hasLocal && !Object.keys(p.timetable.slots || {}).length) { const q = readJ(K_TTQ, {}); q[id] = true; writeJ(K_TTQ, q); }
    plan = p;
    cachePlan(id, p);
    const mq = readJ(K_MAPQ, {})[id];
    cacheTT(id, p.timetable);
    if (mq) { plan.map = { ...plan.map, pages: mq.pages, recent_auto: mq.recent_auto, ...(mq.ayahs != null ? { ayahs: mq.ayahs } : {}) }; }
    planState = 'ok';
    if (Object.prototype.hasOwnProperty.call(readJ(K_NLQ, {}), id)) plan.timetable = { ...plan.timetable, next_lesson: readJ(K_NLQ, {})[id] };
    if (mq || readJ(K_TTQ, {})[id] || readJ(K_LSQ, {})[id] || Object.prototype.hasOwnProperty.call(readJ(K_NLQ, {}), id)) flush();
  } catch (e) {
    if (id !== sid) return;
    planState = 'error'; planErr = (e && e.message) || 'offline';
    const mq = readJ(K_MAPQ, {})[id];
    if (mq) { plan = { map: { pages: mq.pages, recent_auto: mq.recent_auto, ayahs: mq.ayahs != null ? mq.ayahs : null }, timetable: { slots: timetable(id).days } }; }
  }
  render();
}
let saveTimer = null;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700); }
/* Send whatever is queued, for every student (a change made offline for
   someone else goes too). One request per student. */
let flushing = false;
async function flush() {
  if (flushing || !signedIn()) return;
  flushing = true;
  const mq = readJ(K_MAPQ, {}), tq = readJ(K_TTQ, {}), nq = readJ(K_NLQ, {}), lq = readJ(K_LSQ, {});
  const ids = Array.from(new Set(Object.keys(mq).concat(Object.keys(tq), Object.keys(nq), Object.keys(lq))));
  let failed = false;
  for (const id of ids) {
    const body = {};
    if (mq[id]) { body.pages = mq[id].pages; body.recent_auto = mq[id].recent_auto; if (mq[id].ayahs != null) body.ayahs = mq[id].ayahs; }
    // p7: the weekly times go with the zone they were entered in.
    if (tq[id]) { body.slots = timetable(id).days; if (T()) body.tz = T().myTz(); }
    if (lq[id]) body.lessons = timetable(id).lessons;
    if (Object.prototype.hasOwnProperty.call(nq, id)) body.next_lesson = nq[id];
    if (id === sid) setNote('Saving\u2026');
    try {
      const r = await sync().api('/api/students/' + encodeURIComponent(id) + '/plan', { method: 'PUT', body });
      const m2 = readJ(K_MAPQ, {}), t2 = readJ(K_TTQ, {});
      // Only clear what was sent: a change made while this was in flight stays queued.
      if (m2[id] && mq[id] && m2[id].pages === mq[id].pages && m2[id].recent_auto === mq[id].recent_auto && m2[id].ayahs === mq[id].ayahs) { delete m2[id]; writeJ(K_MAPQ, m2); }
      if (t2[id] && tq[id]) { delete t2[id]; writeJ(K_TTQ, t2); }
      const l2 = readJ(K_LSQ, {});
      if (l2[id] && lq[id] && JSON.stringify(timetable(id).lessons) === JSON.stringify(body.lessons)) { delete l2[id]; writeJ(K_LSQ, l2); }
      const n2 = readJ(K_NLQ, {});
      if (Object.prototype.hasOwnProperty.call(nq, id) && JSON.stringify(n2[id]) === JSON.stringify(nq[id])) { delete n2[id]; writeJ(K_NLQ, n2); }
      cachePlan(id, r);
      if (id === sid) { plan = { ...(plan || {}), ...r }; setNote('Saved'); }
    } catch (e) {
      failed = true;
      if (id === sid) setNote('Not saved yet \u2014 it goes when you are back online');
    }
  }
  flushing = false;
  if (!failed && (Object.keys(readJ(K_MAPQ, {})).length || Object.keys(readJ(K_TTQ, {})).length || Object.keys(readJ(K_NLQ, {})).length || Object.keys(readJ(K_LSQ, {})).length)) scheduleSave();
}
window.addEventListener('online', () => flush());
function setNote(t) { saveNote = t; const el = $('tpfSaveNote'); if (el) el.textContent = t; }
/* p12: the ayahs always go with the pages, in step with them. */
function queueMap(id, pages, recentAuto, ayahs) {
  const M = window.TehfizMap;
  const ay = M && M.reconcile ? M.reconcile(pages, ayahs || '') : undefined;
  const q = readJ(K_MAPQ, {}); q[id] = { pages, recent_auto: recentAuto, ...(ay !== undefined ? { ayahs: ay } : {}) }; writeJ(K_MAPQ, q);
  return ay;
}
function onMapChange(pages, recentAuto, ayahs) {
  const ay = queueMap(sid, pages, recentAuto, ayahs);
  plan = plan || { map: {}, timetable: { slots: {} } };
  plan.map = { ...plan.map, pages, recent_auto: recentAuto, ...(ay !== undefined ? { ayahs: ay } : {}) };
  const sumEl = $('tpfMapSum'); if (sumEl) sumEl.innerHTML = mapSummaryHtml(pages);
  scheduleSave();
}
function mapSummaryHtml(pages) {
  const M = window.TehfizMap; if (!M) return '';
  const s = M.summary(pages);
  return '<span class="tpf-big">' + esc(s.text) + '</span>' +
    (s.memorised ? '<span class="tpf-mut">' + [
      s.recentJuz.length ? 'Recent: Juz ' + s.recentJuz.join(', ') : '',
      s.newAt ? 'New lesson: ' + M.newText(s) : '',
    ].filter(Boolean).join(' \u00b7 ') + '</span>' : '');
}
/* The next scheduled lesson after `from` — a weekly day or a single lesson,
   whichever comes first (p7). The next lesson set in Finish session is left
   out: this is what Finish suggests for the NEXT one. null when none. */
/* p11: the lesson the Overview calls next — one under way that this device
   already has a session for (or that a later next lesson was set after) is
   passed over. */
function nextOf(id) {
  const done = (typeof getSessions === 'function' ? getSessions() || [] : [])
    .filter((x) => x.studentId === id).map((x) => Date.parse(x.isoDate || '')).filter(Number.isFinite);
  return T().next(ttOf(id), Date.now(), done);
}
function nextLesson(id, from) {
  const now = from ? +new Date(from) : Date.now();
  if (!T()) return null;
  const tt = ttOf(id); tt.next_lesson = null;
  const o = T().occurrences(tt, now + 60000, now + 15 * 86400000)[0];
  return o ? { at: new Date(o.at), len: o.len || 0, kind: o.kind } : null;
}
// p6: "Today" and "Tomorrow" instead of the date when it is that close.
function dayText(d) { return T() ? T().dayText(+d) : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
function timeText(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function slotTime(t) {
  const [h, m] = String(t || '').split(':').map(Number);
  const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
  return timeText(d);
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if ($('tpfCss')) return;
  const el = document.createElement('style');
  el.id = 'tpfCss';
  el.textContent = `
#tpfProg{position:fixed;inset:0;z-index:1250;background:var(--parchment2);display:flex;flex-direction:column;}
#tpfProg .tpf-progbar{display:flex;align-items:center;gap:10px;padding:10px 14px;padding-top:max(10px,env(safe-area-inset-top));border-bottom:1px solid var(--border);background:var(--surface,#fff);}
#tpfProg .tpf-progt{flex:1;min-width:0;font:500 15px var(--ui-font);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#tpfProg .tpf-progf{flex:1;width:100%;border:0;background:var(--parchment2);}
#tpfRoot .tpf{position:fixed;inset:0;z-index:1200;background:var(--parchment2);color:var(--ink);font-family:var(--ui-font);
  display:flex;flex-direction:column;overflow:hidden;}
.tpf-bar{flex:none;background:var(--chrome);color:var(--on-ink);display:flex;align-items:center;gap:12px;padding:8px 10px;}
.tpf-back{height:40px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border:1px solid var(--chrome-3);border-radius:8px;
  background:var(--chrome-2);color:var(--on-ink);font:500 14px var(--ui-font);cursor:pointer;flex:none;}
.tpf-back:hover{background:var(--chrome-3);}
.tpf-ttl{display:flex;flex-direction:column;min-width:0;line-height:1.25;}
.tpf-ttl b{font-size:17px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tpf-ttl small{font-size:12px;color:color-mix(in srgb,var(--on-ink) 65%,transparent);}
.tpf-tabs{flex:none;display:flex;background:var(--chrome);padding:0 8px;border-bottom:2px solid var(--chrome-rule);overflow-x:auto;}
.tpf-tab{height:42px;padding:0 14px;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;
  color:color-mix(in srgb,var(--on-ink) 65%,transparent);font:500 14px var(--ui-font);cursor:pointer;white-space:nowrap;}
.tpf-tab[aria-selected="true"]{color:var(--on-ink);border-bottom-color:var(--on-ink);font-weight:600;}
.tpf-main{flex:1 1 auto;overflow:auto;padding:18px 16px 40px;}
.tpf-inner{max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:12px;}
.tpf-card{background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;}
.tpf-card.lead{border-left:4px solid var(--ink);}
.tpf-h{font-size:12px;font-weight:600;color:var(--ink3);letter-spacing:.03em;}
.tpf-big{font-size:19px;font-weight:600;}
.tpf-mut{font-size:13px;color:var(--ink3);}
.tpf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tpf-sp{margin-left:auto;}
.tpf-btn{height:40px;padding:0 14px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);
  font:500 14px var(--ui-font);cursor:pointer;}
.tpf-btn:hover{background:var(--parchment);}
.tpf-btn.pri{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.tpf-btn.danger{border-color:var(--red);color:var(--red);}
.tpf-btn.danger.pri{background:var(--red);color:#fff;}
.tpf-btn:disabled{opacity:.45;cursor:default;}
.tpf-link{background:none;border:none;padding:0;font:500 13px var(--ui-font);color:var(--ink);text-decoration:underline;cursor:pointer;}
.tpf-code{font:600 14px 'IBM Plex Mono',monospace;background:var(--parchment2);border-radius:5px;padding:3px 8px;cursor:pointer;border:none;color:var(--ink);}
.tpf-ok{color:var(--green);font-size:13px;}
.tpf-dim{color:var(--ink3);font-size:13px;}
.tpf-warn{border:1px solid var(--red);border-radius:10px;padding:12px 14px;background:color-mix(in srgb,var(--red) 6%,var(--surface,#fff));
  display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45;}
.tpf-warn p{margin:0;}
.tpf-days{display:flex;gap:6px;flex-wrap:wrap;}
.tpf-day{height:38px;min-width:52px;padding:0 12px;border:1px solid var(--border2);border-radius:999px;background:var(--surface,#fff);color:var(--ink);
  font:500 14px var(--ui-font);cursor:pointer;}
.tpf-day[aria-pressed="true"]{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.tpf-slot{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);}
.tpf-slot b{width:44px;font-weight:600;}
.tpf-in{height:40px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);
  color:var(--ink);font:400 14px var(--ui-font);min-width:0;}
.tpf-f{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--ink3);font-weight:500;flex:1 1 130px;}
.tpf-f .tpf-in{width:100%;}
.tpf-chk{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink2);}
.tpf-seg{display:flex;}
.tpf-seg button{flex:1;height:38px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.tpf-seg button:first-child{border-radius:8px 0 0 8px;}
.tpf-seg button:last-child{border-radius:0 8px 8px 0;margin-left:-1px;}
.tpf-seg button[aria-pressed="true"]{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.tpf-mon{display:flex;align-items:center;gap:6px;}
.tpf-mon span{flex:1;text-align:center;font-weight:600;font-size:15px;}
.tpf-ib{width:40px;height:40px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font-size:18px;cursor:pointer;}
.tpf-ib:disabled{opacity:.4;cursor:default;}
.tpf-kv{display:flex;justify-content:space-between;gap:10px;font-size:14px;}
.tpf-kv.tot{font-weight:600;font-size:16px;border-top:1px solid var(--border);padding-top:8px;}
.tpf-mono{font-family:'IBM Plex Mono',monospace;}
/* p5: a card folded to one line */
.tpf-fold{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;cursor:pointer;min-height:28px;font-family:var(--ui-font);color:var(--ink);}
.tpf-fold .tpf-h{flex:none;}
.tpf-foldv{flex:1;min-width:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tpf-fold.open .tpf-h{flex:1;}
.tpf-chev{flex:none;color:var(--ink3);font-size:17px;line-height:1;transition:transform .15s;}
.tpf-fold.open .tpf-chev{transform:rotate(90deg);}
.tpf-ed{flex:none;font-size:13px;color:var(--ink2);text-decoration:underline;}
.tpf-fold:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:4px;}
.tpf-chip{display:inline-block;font-size:12px;padding:3px 9px;border-radius:999px;background:var(--parchment2);color:var(--ink2);white-space:nowrap;}
.tpf-chip.paid{background:var(--green-bg);color:var(--green);}
.tpf-li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);font-size:14px;}
.tpf-li:first-of-type{border-top:none;}
.tpf-li > span:first-child{flex:none;}
.tpf-li .tpf-sp{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--ink2);text-align:right;}
button.tpf-li{width:100%;background:none;border:none;border-top:1px solid var(--border);text-align:left;color:var(--ink);font:400 14px var(--ui-font);cursor:pointer;}
.tpf-err{color:var(--red);font-size:14px;}
.tpf-cov{font-size:14px;}
.tpf-cov b{display:inline-block;min-width:88px;font-weight:600;font-size:12px;color:var(--ink3);}
.tpf-untimed{color:var(--coral,#8a3f06);font-size:13px;}
/* p7 */
.tpf-pen{background:none;border:1px dashed color-mix(in srgb,var(--on-ink) 40%,transparent);border-radius:6px;color:color-mix(in srgb,var(--on-ink) 75%,transparent);
  font:400 13px var(--ui-font);padding:0 7px;margin-left:4px;cursor:pointer;vertical-align:2px;}
.tpf-pen:hover{color:var(--on-ink);border-style:solid;}
.tpf-nameed{flex:1;min-width:0;display:flex;gap:6px;align-items:center;}
.tpf-nameed .tpf-in{flex:1;min-width:0;font-weight:600;font-size:16px;}
.tpf-their{font-size:13px;color:var(--ink2);}
.tpf-thr{font-size:12.5px;color:var(--ink2);margin-left:auto;white-space:nowrap;}
.tpf-thr b{font-weight:600;color:var(--ink);}
.tpf-thr.shift b{color:var(--red);}
.tpf-slot{flex-wrap:wrap;}
.tpf-sg{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);}
.tpf-sg:first-of-type{border-top:none;}
.tpf-sgw{all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;flex-direction:column;font-size:14px;padding:2px 4px;border-radius:6px;}
.tpf-sgw:hover{background:var(--parchment2);}
.tpf-sgw:focus-visible{outline:2px solid var(--gold);}
.tpf-sgw small{font-size:12.5px;color:var(--ink3);}
#tpfNx{position:fixed;inset:0;z-index:1270;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--ui-font);color:var(--ink);}
.tpf-nxscrim{position:absolute;inset:0;background:rgba(23,25,28,.5);}
.tpf-nxcard{position:relative;width:100%;max-width:480px;max-height:calc(100vh - 32px);overflow:auto;background:var(--parchment);border-radius:14px;
  padding:18px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 48px rgba(23,25,28,.3);}
.tpf-nxcard h3{margin:0;font-size:18px;}
.tpf-nxl{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink2);}
.tpf-nxl span{width:56px;flex:none;}
.tpf-nxl .tpf-in{flex:1;}
body.compact-ui #tpfNx{padding:0;align-items:flex-end;}
body.compact-ui .tpf-nxcard{max-width:none;border-radius:16px 16px 0 0;padding-bottom:max(18px,env(safe-area-inset-bottom));}
.tpf-tzpick{display:flex;flex-direction:column;gap:6px;}
.tpf-tzset{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
.tpf-tzlist[hidden]{display:none;}
.tpf-tzlist{max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:8px;}
.tpf-tzo{all:unset;box-sizing:border-box;display:block;width:100%;padding:8px 10px;font:13px 'IBM Plex Mono',monospace;color:var(--ink);cursor:pointer;border-top:1px solid var(--border);white-space:pre;}
.tpf-tzo:first-child{border-top:none;}
.tpf-tzo:hover,.tpf-tzo:focus-visible{background:var(--parchment2);}
.tpf-tzo.on{background:var(--gold-pale);font-weight:600;}
.tpf-sgform{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border);padding-top:10px;}
@media (min-width:700px){ .tpf-main{padding:24px 24px 48px;} }
`;
  document.head.appendChild(el);
}

/* ── tabs ───────────────────────────────────────────────────────────────── */
function nextCardHtml(s) {
  /* p7: the soonest of the three — the next lesson set in Finish session, a
     single lesson, a weekly day. */
  const o = T() ? nextOf(sid) : null;
  if (!o) {
    return '<div class="tpf-card lead"><span class="tpf-h">Next lesson</span>' +
      '<span class="tpf-mut">No lessons scheduled yet.</span>' +
      '<div><button class="tpf-btn" data-tpf="tab" data-t="timetable">Set up the schedule</button></div></div>';
  }
  const at = new Date(o.at);
  const planned = T().planOf(o);
  const from = o.kind === 'set' ? 'Set in Finish session' : o.kind === 'single' ? 'Single lesson' : 'From ' + nameOf(s) + '’s weekly days';
  const their = theirLine(sid, o.at);
  return '<div class="tpf-card lead"><div class="tpf-row"><span class="tpf-h" style="flex:1">Next lesson</span>' +
      '<button class="tpf-link" data-tpf="nxedit">Edit</button></div>' +
    '<span class="tpf-big">' + esc(dayText(at)) + ' · ' + esc(timeText(at)) + '</span>' +
    (their ? '<span class="tpf-their">' + esc(their) + '</span>' : '') +
    '<span class="tpf-mut">' + esc(from) + (o.len ? ' · ' + o.len + ' min' : '') + '</span>' +
    planned.map((p) => '<span class="tpf-cov"><b>' + esc(p.mode === 'spot' ? 'Spot test' : stageLabel(p.type)) + '</b> ' +
      esc(p.label || p.text || (p.start ? p.start + '\u2013' + p.end : '')) + (p.label && p.text ? ' \u00b7 ' + esc(p.text) : '') + '</span>').join('') +
    '<div class="tpf-row"><button class="tpf-btn" data-tpf="nxstart">Start a session' + (planned.some((p) => p.start) ? ' \u00b7 set up' : '') + '</button></div>' +
    (o.note ? '<span class="tpf-mut">' + esc(o.note) + '</span>' : '') + '</div>';
}
/* p7: the student's time zone — one line until opened. Not set means "same
   as you", and nothing about time zones shows anywhere else. */
function tzCardHtml(s) {
  if (!T()) return '';
  const z = s.tz && T().validTz(s.tz) ? s.tz : '';
  const now = Date.now();
  const sum = z ? esc(T().city(z)) + ' · ' + esc(T().diffText(z, now)) : 'Same as you';
  if (!tzOpen) {
    return '<div class="tpf-card"><button class="tpf-fold" data-tpf="tz" aria-expanded="false"><span class="tpf-h">Time zone</span>' +
      '<span class="tpf-foldv">' + sum + '</span><span class="tpf-chev" aria-hidden="true">›</span></button></div>';
  }
  /* p10: a zone that is set shows plainly; the search (and its list) only
     while changing it, and the list only once something is typed. */
  const off = (() => { const e = tzEntries().find((x) => x.value === z); return e ? (/UTC[+-]\d\d:\d\d/.exec(e.label) || [''])[0] : ''; })();
  const showing = z && !tzEdit;
  return '<div class="tpf-card"><button class="tpf-fold open" data-tpf="tz" aria-expanded="true"><span class="tpf-h">Time zone</span><span class="tpf-chev" aria-hidden="true">›</span></button>' +
    (showing
      ? '<div class="tpf-tzset"><span class="tpf-big">' + esc(T().city(z)) + '</span><span class="tpf-mono">' + esc(off || T().tzLabel(z)) + '</span></div>' +
        '<span class="tpf-their">' + esc(nameOf(s)) + '’s time now: <b>' + esc(T().timeText(now, z)) + '</b> · ' + esc(T().diffText(z, now)) + '</span>' +
        '<div class="tpf-row"><button class="tpf-btn" data-tpf="tzchange">Change</button><button class="tpf-btn" data-tpf="tzpick" data-z="">Same as me</button></div>'
      : '<div class="tpf-tzpick"><input class="tpf-in" data-tpfin="tzq" value="' + esc(tzQ) + '" placeholder="Search a city, country or UTC+5…" autocomplete="off" aria-label="Search time zones">' +
          '<div class="tpf-tzlist" id="tpfTzList" role="listbox"' + (tzQ.trim() ? '' : ' hidden') + '>' + (tzQ.trim() ? tzListHtml(z) : '') + '</div>' +
          (z ? '<div class="tpf-row"><button class="tpf-link" data-tpf="tzcancel">Keep ' + esc(T().city(z)) + '</button></div>' : '') + '</div>') +
    '<span class="tpf-mut">You enter lesson times in your own time; ' + esc(nameOf(s)) + '’s time shows beside them. Kept on your devices' +
      ' (and in your Google Drive with name sync), never on Tehfiz.</span></div>';
}
/* p8: the zone list the app's own Settings → Date & time uses (sorted by
   UTC offset, "UTC+05:00  Karachi · Asia"), searchable, with "Same as you"
   first. Falls back to TehfizTime's list outside the app. */
function tzEntries() {
  if (typeof buildTzEntries === 'function') {
    try { return buildTzEntries().filter((e) => e.value !== 'device'); } catch {}
  }
  return T().zones().map((x) => ({ value: x, label: T().tzLabel(x), search: x.toLowerCase() }));
}
function tzListHtml(cur) {
  const q = tzQ.toLowerCase().trim().replace(/^gmt/, 'utc');
  const all = tzEntries();
  // p14: by country too, whole-word matches first (TehfizTime t4).
  const sc = (e) => Math.max(T().zoneScore ? T().zoneScore(e.value, q) : 0, (e.search.includes(q) || e.label.toLowerCase().includes(q)) ? 1 : 0);
  const hits = q ? all.map((e) => ({ e, s: sc(e) })).filter((x) => x.s).sort((a, b) => b.s - a.s).map((x) => x.e) : all;
  const same = '<button type="button" class="tpf-tzo' + (!cur ? ' on' : '') + '" data-tpf="tzpick" data-z="" role="option" aria-selected="' + !cur + '">Same as you · ' + esc(T().tzLabel(T().myTz())) + '</button>';
  return (q ? '' : same) + hits.slice(0, 60).map((e) =>
    '<button type="button" class="tpf-tzo' + (e.value === cur ? ' on' : '') + '" data-tpf="tzpick" data-z="' + esc(e.value) + '" role="option" aria-selected="' + (e.value === cur) + '">' + esc(e.label) + '</button>').join('') +
    (hits.length ? '' : '<div class="tpf-mut" style="padding:8px 10px">No time zone matches “' + esc(tzQ) + '”</div>');
}
function overviewHtml(s) {
  const next = nextCardHtml(s);

  const list = (sync().localSessionsFor(sid) || []).slice()
    .sort((a, b) => String(b.isoDate || b.dateYMD || '').localeCompare(String(a.isoDate || a.dateYMD || '')));
  const last = list[0];
  let lastHtml;
  if (!last) {
    lastHtml = '<span class="tpf-mut">No sessions logged for ' + esc(nameOf(s)) + ' on this device yet.</span>';
  } else {
    const t = typeof corrTally === 'function' ? corrTally(last.mistakes || []) : null;
    const lv = t ? [['c1', 'Lvl 1'], ['c2', 'Lvl 2'], ['c3', 'Lvl 3']].filter(([k]) => t[k]).map(([k, l]) => t[k] + ' at ' + l) : [];
    if (t && t.tajweed) lv.push(t.tajweed + ' tajweed');
    const stages = Array.from(new Set((last.segments || []).map((g) => g.type).filter(Boolean)))
      .map((x) => (typeof sessionTypeLabel === 'function' ? sessionTypeLabel(x) : x));
    const when = last.dateYMD ? new Date(last.dateYMD + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : (last.date || '');
    const n = (last.mistakes || []).length;
    lastHtml = '<span style="font-size:15px;">' + esc(when) + (stages.length ? ' · ' + esc(stages.join(' + ')) : '') +
        ' · ' + n + ' mistake' + (n === 1 ? '' : 's') + '</span>' +
      (lv.length ? '<span class="tpf-mut">' + esc(lv.join(', ')) + '</span>' : '') +
      '<span class="tpf-mut">' + list.length + ' session' + (list.length === 1 ? '' : 's') + ' on this device · ' +
        (s.session_count || 0) + ' sent</span>';
  }
  const lastCard = '<div class="tpf-card"><span class="tpf-h">Last session</span>' + lastHtml +
    '<div class="tpf-row"><button class="tpf-btn" data-tpf="progress">Progress report</button>' +
      '<button class="tpf-btn" data-tpf="viewer">Open in viewer</button></div></div>';
  const mapCard = '<div class="tpf-card"><span class="tpf-h">Memorised</span>' +
    (planState === 'ok' || (plan && plan.map && plan.map.pages)
      ? mapSummaryHtml(plan.map.pages) + '<div><button class="tpf-btn" data-tpf="tab" data-t="memorised">' +
          (/[orn]/.test(plan.map.pages || '') ? 'Open the map' : 'Mark what ' + esc(nameOf(s)) + ' has memorised') + '</button></div>'
      : '<span class="tpf-mut">' + (planState === 'loading' ? 'Loading\u2026' : planState === 'signedout' ? 'Sign in to see the memorisation map.' : 'Could not load the map.') + '</span>') +
    '</div>';

  let login;
  if (ask === 'pin') {
    login = '<div class="tpf-warn"><strong>Reset the PIN for ' + esc(nameOf(s)) + '?</strong>' +
      '<p>Their current PIN stops working and every device they are signed in on is signed out. Next time they log in they choose a new PIN themselves — so tell them to pick <em>“This is my first time”</em>.</p>' +
      '<p>Their code stays the same, and none of their sessions are affected.</p>' +
      '<div class="tpf-row"><button class="tpf-btn danger pri" data-tpf="do-pin"' + (busy ? ' disabled' : '') + '>Reset PIN</button>' +
      '<button class="tpf-btn" data-tpf="ask-none">Back</button></div></div>';
  } else if (ask === 'code') {
    login = '<div class="tpf-warn"><strong>Change the code for ' + esc(nameOf(s)) + '?</strong>' +
      '<p><code>' + esc(s.code) + '</code> stops working immediately, every paired device is signed out, and <strong>their PIN is cleared too</strong> — a code and its PIN are handed over together, so a code worth changing has to be assumed to have taken the PIN with it.</p>' +
      '<p>You will need to give them the new code, and they log in again as if for the first time. Their sessions are kept.</p>' +
      '<div class="tpf-row"><button class="tpf-btn danger pri" data-tpf="do-code"' + (busy ? ' disabled' : '') + '>Change code</button>' +
      '<button class="tpf-btn" data-tpf="ask-none">Back</button></div></div>';
  } else if (loginOpen) {
    login = '<div class="tpf-row"><button class="tpf-code" data-tpf="copy" title="Tap to copy">' + esc(s.code) + '</button>' +
        (s.claimed ? '<span class="tpf-ok">● claimed</span>' : '<span class="tpf-dim">○ not claimed yet</span>') + '</div>' +
      '<div class="tpf-row"><button class="tpf-btn" data-tpf="ask-pin"' + (s.claimed ? '' : ' disabled title="No PIN set yet — nothing to reset"') + '>Reset PIN</button>' +
        '<button class="tpf-btn" data-tpf="ask-code">Change code</button></div>';
  }
  // p5: one line until it's needed; Reset PIN and Change code open from it.
  const loginCard = ask || loginOpen
    ? '<div class="tpf-card"><button class="tpf-fold open" data-tpf="login" aria-expanded="true"><span class="tpf-h">Login</span><span class="tpf-chev" aria-hidden="true">›</span></button>' + login + '</div>'
    : '<div class="tpf-card"><button class="tpf-fold" data-tpf="login" aria-expanded="false"><span class="tpf-h">Login</span>' +
        '<span class="tpf-foldv"><span class="tpf-mono">' + esc(s.code) + '</span> · ' + (s.claimed ? 'claimed' : 'not claimed yet') + '</span>' +
        '<span class="tpf-chev" aria-hidden="true">›</span></button></div>';
  return next + mapCard + lastCard + tzCardHtml(s) + loginCard;
}

function memorisedHtml(s) {
  if (planState === 'signedout') return '<div class="tpf-card"><span class="tpf-mut">Sign in to see and mark what ' + esc(nameOf(s)) + ' has memorised. The map is kept with their code, so ' + esc(nameOf(s)) + ' sees it too.</span></div>';
  if (planState === 'loading' && !plan) return '<div class="tpf-card"><span class="tpf-mut">Loading\u2026</span></div>';
  if (planState === 'error' && !plan) return '<div class="tpf-card"><span class="tpf-err">Could not load the map: ' + esc(planErr) + '</span>' +
    '<div><button class="tpf-btn" data-tpf="reload">Try again</button></div></div>';
  return '<div class="tpf-card" id="tpfMapSum">' + mapSummaryHtml(plan.map.pages || (window.TehfizMap && TehfizMap.empty())) + '</div>' +
    '<div class="tpf-card"><div id="tpfMap"></div><span class="tpf-mut" id="tpfSaveNote">' + esc(saveNote) + '</span></div>' +
    '<span class="tpf-mut">' + esc(nameOf(s)) + ' sees this map in the student viewer.' +
      (planState === 'error' ? ' Offline \u2014 changes are kept here and sent when you are back online.' : '') + '</span>';
}

/* "Yusuf: Sat 22:00" beside a weekly time, red when it is another day for them. */
function slotTheirHtml(d, time) {
  if (!T() || !theirTz(sid)) return '';
  const z = theirTz(sid), r = T().slotIn(d, time || '17:00', T().myTz(), z);
  if (!r) return '';
  return '<span class="tpf-thr' + (r.dayShift ? ' shift' : '') + '" id="tpfThr' + d + '">' + esc(nameOf(stu())) + ': <b>' +
    DAY_SHORT[r.wd] + ' ' + esc(T().timeText(r.at, z)) + '</b></span>';
}
function timetableHtml(s) {
  const tt = timetable(sid), days = tt.days;
  const chips = DAYS.map((d) => '<button class="tpf-day" data-tpf="day" data-d="' + d + '" aria-pressed="' + !!days[d] + '">' + DAY_SHORT[d] + '</button>').join('');
  const slots = DAYS.filter((d) => days[d]).map((d) =>
    '<div class="tpf-slot"><b>' + DAY_SHORT[d] + '</b>' +
      '<input class="tpf-in" type="time" data-tpfin="t" data-d="' + d + '" value="' + esc(days[d].t || '17:00') + '" aria-label="' + DAY_SHORT[d] + ' time">' +
      '<input class="tpf-in" style="width:76px" type="number" min="5" max="240" step="5" data-tpfin="len" data-d="' + d + '" value="' + esc(days[d].len || '') + '" aria-label="' + DAY_SHORT[d] + ' length in minutes">' +
      '<span class="tpf-mut">min</span>' + slotTheirHtml(d, days[d].t) + '</div>').join('');
  const now = Date.now();
  const upcoming = tt.lessons.filter((l) => Date.parse(l.at) + (l.len || 30) * 60000 > now);
  const singles = upcoming.map((l) => {
    const at = new Date(l.at), their = theirLine(sid, +at), what = T().planText(l, stageLabel);
    return '<div class="tpf-sg"><button class="tpf-sgw" data-tpf="sgedit" data-at="' + esc(l.at) + '" title="Change this lesson"><b>' + esc(dayText(at)) + ' · ' + esc(timeText(at)) +
        (l.replaces ? ' <span class="tpf-chip">moved</span>' : '') + '</b>' +
        '<small>' + esc([l.len ? l.len + ' min' : '', what, their].filter(Boolean).join(' · ')) + '</small></button>' +
      '<button class="tpf-ib" data-tpf="sgdel" data-at="' + esc(l.at) + '" aria-label="Remove this lesson" title="Remove">✕</button></div>';
  }).join('');
  const form = '<div><button class="tpf-btn" data-tpf="sgnew">+ Add a single lesson</button></div>';
  const z = theirTz(sid);
  return '<div class="tpf-card"><span class="tpf-h">Every week' + (z ? ' · in your time' : '') + '</span><div class="tpf-days">' + chips + '</div>' +
      (slots || '<span class="tpf-mut">Tap the days ' + esc(nameOf(s)) + ' has lessons, if there is a regular pattern.</span>') + '</div>' +
    '<div class="tpf-card"><span class="tpf-h">Single lessons</span>' +
      (singles || '<span class="tpf-mut">For a one-off or extra lesson on a date. They sit alongside the weekly days; neither changes the other.</span>') +
      form + '</div>' +
    nextCardHtml(s) +
    '<span class="tpf-mut" id="tpfSaveNote">' + esc(saveNote) + '</span>' +
    '<span class="tpf-mut">' + esc(nameOf(s)) + ' sees these in the student viewer, in ' + esc(nameOf(s)) + '’s own time. Finish session fills in the next lesson from them.</span>';
}

function billingHtml(s) {
  if (!(sync().isSignedIn && sync().isSignedIn()) || !inv()) {
    return '<div class="tpf-card"><span class="tpf-mut">Sign in to see billing — it is built from the sessions you have sent.</span></div>';
  }
  const b = bill(), I = inv();
  const st = b.stored(sid), d = { ...b.profileRate(), ...b.defaults() };
  const free = st.amount != null && String(st.amount) !== '' && parseFloat(st.amount) === 0;
  /* p5: the invoice comes first. The rate folds into one line saying what it
     is and where it comes from; Edit opens the fields. */
  const own = st.amount != null && String(st.amount) !== '' && !free;
  const amt = own ? st.amount : d.amount;
  const cur = st.currency || d.currency || 'PKR';
  const rateText = free ? 'Not billed (free or trial)'
    : amt ? esc(cur) + ' ' + esc(Number(amt).toLocaleString()) + '/h · ' + (own ? 'set for ' + esc(nameOf(s)) : 'from your defaults')
    : 'No rate yet';
  const billTo = I.billTo(sid);
  const rateLine = '<div class="tpf-card"><button class="tpf-fold" data-tpf="rate" aria-expanded="false"><span class="tpf-h">Rate</span>' +
    '<span class="tpf-foldv">' + rateText + (billTo ? ' · bill to ' + esc(billTo) : '') + '</span><span class="tpf-ed">Edit</span></button></div>';
  const rate = !rateOpen ? rateLine : '<div class="tpf-card"><button class="tpf-fold open" data-tpf="rate" aria-expanded="true"><span class="tpf-h">Rate and who to bill</span><span class="tpf-ed">Done</span></button>' +
    '<div class="tpf-row" style="align-items:flex-end">' +
      '<label class="tpf-f">Bill to<input class="tpf-in" data-tpfin="billto" value="' + esc(I.billTo(sid)) + '" placeholder="e.g. Mr Ahmed Khan"></label>' +
      '<label class="tpf-f" style="flex:0 1 120px">Rate / hour<input class="tpf-in" inputmode="decimal" data-tpfin="amount" value="' +
        esc(st.amount && st.amount !== '0' ? st.amount : '') + '" placeholder="' + esc(d.amount ? 'default ' + d.amount : 'e.g. 2000') + '"' + (free ? ' disabled' : '') + '></label>' +
      '<label class="tpf-f" style="flex:0 1 80px">Currency<input class="tpf-in" data-tpfin="currency" value="' + esc(st.currency || '') + '" placeholder="' + esc(d.currency || 'PKR') + '"></label>' +
      '<label class="tpf-f" style="flex:0 1 120px">Round up to (min)<input class="tpf-in" inputmode="numeric" data-tpfin="step" value="' + esc(st.step || '') + '" placeholder="' + esc(b.step(d)) + '"></label>' +
    '</div>' +
    '<label class="tpf-chk"><input type="checkbox" data-tpfin="free"' + (free ? ' checked' : '') + '> Not billed (free or trial)</label>' +
    '<div class="tpf-row"><span class="tpf-mut" style="flex:1">Blank fields follow your billing defaults. Kept on this device.</span>' +
      '<button class="tpf-btn" data-tpf="bdefaults">Billing defaults</button></div></div>';

  const isRange = bp.kind === 'range';
  const le = I.lastEnd(sid);
  const pick = isRange
    ? '<div class="tpf-row"><input class="tpf-in" style="flex:1" type="date" data-tpfin="from" value="' + esc(bp.from) + '" aria-label="From">' +
        '<span class="tpf-mut">to</span><input class="tpf-in" style="flex:1" type="date" data-tpfin="to" value="' + esc(bp.to) + '" aria-label="To"></div>' +
      (le ? '<span class="tpf-mut">Starts the day after the last invoice (ended ' + esc(new Date(le + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + ').</span>' : '')
    : '<div class="tpf-mon"><button class="tpf-ib" data-tpf="bprev" aria-label="Previous month">‹</button><span>' + esc(I.label(bp)) + '</span>' +
        '<button class="tpf-ib" data-tpf="bnext" aria-label="Next month"' + (bp.ym >= I.today().slice(0, 7) ? ' disabled' : '') + '>›</button></div>';
  let sum;
  if (bErr) sum = '<span class="tpf-err">' + esc(bErr) + '</span>';
  else if (bLine === undefined) sum = '<span class="tpf-mut">Loading…</span>';
  else if (!bLine) sum = '<span class="tpf-mut">No lessons sent to ' + esc(nameOf(s)) + ' with a date in ' + esc(I.label(bp)) + '.</span>';
  else {
    const L = bLine, cur = L.currency;
    const stt = L.free ? '<span class="tpf-chip">Not billed</span>'
      : L.status.paid ? '<span class="tpf-chip paid">Paid ' + esc(new Date(L.status.paid).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + '</span>'
      : L.status.printed ? '<span class="tpf-chip">Printed ' + esc(new Date(L.status.printed).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + '</span>'
      : '<span class="tpf-chip">Not printed</span>';
    sum = '<div class="tpf-kv"><span>' + L.sessions + ' lesson' + (L.sessions === 1 ? '' : 's') + '</span><span class="tpf-mono">' + esc(I.hm(L.recorded)) + ' recorded</span></div>' +
      '<div class="tpf-kv"><span>Billed' + (L.step > 1 ? ' <span class="tpf-mut">(rounded up per lesson)</span>' : '') + '</span><span class="tpf-mono">' + esc(I.hm(L.billed)) + '</span></div>' +
      (L.untimed ? '<span class="tpf-untimed">' + L.untimed + ' untimed lesson' + (L.untimed === 1 ? '' : 's') + ' count as no time.</span>' : '') +
      '<div class="tpf-kv tot"><span>Amount</span><span class="tpf-mono">' + (L.free ? '0' : L.amount == null ? 'Set a rate' : esc(I.money(Math.round(L.amount * 100) / 100, cur))) + '</span></div>' +
      '<div class="tpf-row">' + stt + (L.billTo ? '' : '<span class="tpf-untimed">Add who to bill</span>') + '</div>' +
      '<div class="tpf-row"><button class="tpf-btn" data-tpf="bpreview" style="flex:1">Preview</button>' +
        (L.free ? '' : L.status.paid
          ? '<button class="tpf-btn" data-tpf="bunpaid" style="flex:1">Undo paid</button>'
          : '<button class="tpf-btn pri" data-tpf="bprint" style="flex:1"' + (L.amount == null ? ' disabled title="Set a rate first"' : '') + '>Print invoice</button>' +
            // p2: paid without printing — paid in cash, or invoiced some other way.
            '<button class="tpf-btn" data-tpf="bpaid" style="flex:1">Mark paid</button>') +
      '</div>';
  }
  const invCard = '<div class="tpf-card"><span class="tpf-h">Invoice for</span>' +
    '<div class="tpf-seg" role="group" aria-label="Billing period"><button data-tpf="bmonth" aria-pressed="' + !isRange + '">Month</button>' +
      '<button data-tpf="brange" aria-pressed="' + isRange + '">Custom range</button></div>' + pick + sum + '</div>';

  const hist = I.history(sid);
  const histCard = hist.length ? '<div class="tpf-card"><span class="tpf-h">Past invoices</span>' + hist.slice(0, 12).map((h) =>
    '<div class="tpf-li"><span>' + esc(h.label) + '</span><span class="tpf-sp">' + (h.amount == null ? '' : esc(I.money(Math.round(h.amount), h.cur))) + '</span>' +
      (h.paid ? '<span class="tpf-chip paid">Paid</span>' : '<span class="tpf-chip">Printed</span>') + '</div>').join('') + '</div>' : '';

  const monthsCard = bMonths && bMonths.length && !monthsOpen
    ? '<div class="tpf-card"><button class="tpf-fold" data-tpf="months" aria-expanded="false"><span class="tpf-h">Hours by month</span>' +
        '<span class="tpf-foldv">' + bMonths.length + ' month' + (bMonths.length === 1 ? '' : 's') + '</span><span class="tpf-chev" aria-hidden="true">\u203a</span></button></div>'
    : bMonths && bMonths.length ? '<div class="tpf-card"><button class="tpf-fold open" data-tpf="months" aria-expanded="true"><span class="tpf-h">Hours by month</span><span class="tpf-chev" aria-hidden="true">\u203a</span></button>' + bMonths.map((m) =>
    '<button class="tpf-li" data-tpf="bgoto" data-m="' + esc(m.month) + '"><span>' + esc(I.label(I.monthPeriod(m.month))) + '</span>' +
      '<span class="tpf-sp">' + esc(I.hm(m.seconds || 0)) + ' · ' + (m.sessions || 0) + ' lesson' + ((m.sessions || 0) === 1 ? '' : 's') +
      (m.untimed ? ' · ' + m.untimed + ' untimed' : '') + '</span></button>').join('') + '</div>' : '';
  return invCard + rate + histCard + monthsCard;
}

/* ── billing data ───────────────────────────────────────────────────────── */
async function loadBilling() {
  const I = inv(); if (!I || !(sync().isSignedIn && sync().isSignedIn())) return;
  const seq = ++bSeq, p = bp;
  bLine = undefined; bErr = ''; render();
  try {
    const L = await I.line(sid, p);
    if (seq !== bSeq) return;
    bLine = L;
  } catch (e) {
    if (seq !== bSeq) return;
    bErr = 'Could not load ' + I.label(p) + ': ' + ((e && e.message) || 'offline');
  }
  render();
}
async function loadMonths() {
  const I = inv(); if (!I || !(sync().isSignedIn && sync().isSignedIn())) return;
  try { bMonths = await I.months(sid); } catch { bMonths = null; }
  render();
}
function setPeriod(p) { bp = p; loadBilling(); }
function ymShift(ym, n) {
  const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* ── render ─────────────────────────────────────────────────────────────── */
/* Replacing the page removes a focused field, whose blur fires `change`,
   whose handler renders again — inside this innerHTML assignment. Defer it. */
let rendering = false;
function render() {
  if (rendering) { Promise.resolve().then(render); return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
}
function renderNow() {
  let root = $('tpfRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'tpfRoot'; document.body.appendChild(root);
    root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput);
  }
  if (!isOpen) { root.innerHTML = ''; return; }
  const s = stu();
  if (!s) { close(); toast('That student is no longer on this device'); return; }
  const focusIn = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tpfin : null;
  // Redrawing (a tap on the time zone line, a day chip, a band) keeps the place
  // on the page; only changing tab goes back to the top.
  const oldMain = root.querySelector('.tpf-main');
  const keepTop = oldMain && root.dataset.tab === tab ? oldMain.scrollTop : 0;
  const tzScroll = $('tpfTzList') ? $('tpfTzList').scrollTop : 0;
  root.dataset.tab = tab;
  const keep = window.TehfizMap ? TehfizMap.viewState($('tpfMap')) : null;
  if (keep) mapView = keep;
  const body = tab === 'timetable' ? timetableHtml(s) : tab === 'billing' ? billingHtml(s)
    : tab === 'memorised' ? memorisedHtml(s) : overviewHtml(s);
  root.innerHTML = '<div class="tpf" role="dialog" aria-modal="true" aria-label="Profile for ' + esc(nameOf(s)) + '">' +
    '<div class="tpf-bar"><button class="tpf-back" data-tpf="close">‹ Back</button>' +
      (nameEdit
        ? '<div class="tpf-nameed"><input class="tpf-in" data-tpfin="name" value="' + esc(s.name || '') + '" placeholder="Student name" aria-label="Name" autocomplete="off">' +
            '<button class="tpf-btn pri" data-tpf="namesave">Save</button><button class="tpf-btn" data-tpf="namecancel">Cancel</button></div>'
        : '<div class="tpf-ttl"><b>' + esc(nameOf(s)) + ' <button class="tpf-pen" data-tpf="nameedit" aria-label="Change the name" title="Change the name">\u270e</button></b>' +
            '<small>Profile · ' + esc(s.code) + '</small></div>') + '</div>' +
    '<div class="tpf-tabs" role="tablist">' + TABS.map(([k, l]) =>
      '<button class="tpf-tab" role="tab" data-tpf="tab" data-t="' + k + '" aria-selected="' + (tab === k) + '">' + l + '</button>').join('') + '</div>' +
    '<div class="tpf-main"><div class="tpf-inner">' + body + '</div></div></div>';
  if (focusIn) { const el = root.querySelector('[data-tpfin="' + focusIn + '"]'); if (el && el.type !== 'checkbox') el.focus({ preventScroll: true }); }
  if (nameEdit && focusIn !== 'name') { const n = root.querySelector('[data-tpfin="name"]'); if (n) { n.focus({ preventScroll: true }); n.select(); } }
  const newMain = root.querySelector('.tpf-main'); if (newMain && keepTop) newMain.scrollTop = keepTop;
  if (tzScroll && $('tpfTzList')) $('tpfTzList').scrollTop = tzScroll;
  const mapEl = $('tpfMap');
  if (mapEl && window.TehfizMap && plan) {
    TehfizMap.render(mapEl, { pages: plan.map.pages, ayahs: plan.map.ayahs || '', recentAuto: plan.map.recent_auto !== false, editable: true,
                              state: mapView, onChange: onMapChange });
  }
}

/* ── events ─────────────────────────────────────────────────────────────── */
async function onClick(e) {
  const t = e.target.closest('[data-tpf]');
  if (!t) return;
  const a = t.dataset.tpf;
  if (a === 'close') return close();
  if (a === 'tab') { setTab(t.dataset.t); return; }
  if (a === 'copy') {
    const s = stu(); if (!s) return;
    try { await navigator.clipboard.writeText(s.code); toast('Code copied'); } catch { toast(s.code); }
    return;
  }
  if (a === 'viewer') { sync().openViewer(sid); return; }
  if (a === 'progress') { openProgress(sid); return; }
  if (a === 'reload') { loadPlan(sid); return; }
  if (a === 'ask-pin') { ask = 'pin'; return render(); }
  if (a === 'ask-code') { ask = 'code'; return render(); }
  if (a === 'ask-none') { ask = null; return render(); }
  if (a === 'login') { loginOpen = !(loginOpen || ask); ask = null; return render(); }
  if (a === 'rate') { rateOpen = !rateOpen; return render(); }
  if (a === 'months') { monthsOpen = !monthsOpen; return render(); }
  if (a === 'tz') { tzOpen = !tzOpen; tzQ = ''; tzEdit = false; return render(); }
  if (a === 'tzpick') { sync().setStudentTz(sid, t.dataset.z); tzQ = ''; tzEdit = false; return render(); }
  if (a === 'tzchange') { tzEdit = true; tzQ = ''; render(); const q = document.querySelector('#tpfRoot [data-tpfin="tzq"]'); if (q) q.focus({ preventScroll: true }); return; }
  if (a === 'tzcancel') { tzEdit = false; tzQ = ''; return render(); }
  if (a === 'nxedit') { const o = T() && nextOf(sid); if (o) lessonEditor({ sid, occ: o }); return; }
  if (a === 'nameedit') { nameEdit = true; return render(); }
  if (a === 'namecancel') { nameEdit = false; return render(); }
  if (a === 'namesave') { saveName(); return; }
  if (a === 'sgnew') { lessonEditor({ sid, occ: null }); return; }
  if (a === 'sgedit') {
    const l = timetable(sid).lessons.find((x) => x.at === t.dataset.at); if (!l) return;
    lessonEditor({ sid, occ: { at: Date.parse(l.at), len: l.len, kind: 'single', orig: l.at, plan: l.plan, note: l.note, replaces: l.replaces } });
    return;
  }
  if (a === 'nxstart') { startFromPlan(sid); return; }
  if (a === 'sgdel') {
    setLessons(sid, timetable(sid).lessons.filter((l) => l.at !== t.dataset.at));
    return render();
  }
  if (a === 'do-pin' || a === 'do-code') {
    if (busy) return;
    busy = true; render();
    try {
      if (a === 'do-pin') { await sync().resetPin(sid); toast('PIN reset — they set a new one next time they log in'); }
      else { const c = await sync().rotateCode(sid); toast('New code: ' + c + ' — PIN cleared, old code no longer works'); }
      ask = null;
    } catch (err) { toast((a === 'do-pin' ? 'Could not reset the PIN: ' : 'Could not change the code: ') + ((err && err.message) || 'offline')); }
    busy = false; render();
    return;
  }
  if (a === 'day') {
    const d = t.dataset.d, on = !!timetable(sid).days[d];
    // A new day copies the time and length of the last one set, which is
    // usually what a teacher with a regular slot wants.
    const prev = DAYS.map((x) => timetable(sid).days[x]).filter(Boolean).pop();
    setDay(sid, d, on ? null : (prev ? { t: prev.t, len: prev.len } : {}));
    return render();
  }
  if (a === 'bmonth') { if (bp.kind !== 'month') setPeriod(inv().monthPeriod(inv().today().slice(0, 7))); return; }
  if (a === 'brange') { if (bp.kind !== 'range') setPeriod(inv().defaultRange(sid)); return; }
  if (a === 'bprev') { setPeriod(inv().monthPeriod(ymShift(bp.ym, -1))); return; }
  if (a === 'bnext') { setPeriod(inv().monthPeriod(ymShift(bp.ym, 1))); return; }
  if (a === 'bgoto') { setPeriod(inv().monthPeriod(t.dataset.m)); return; }
  if (a === 'bdefaults') { if (inv().openDefaults) inv().openDefaults(); return; }
  if (a === 'bpreview' && bLine) { inv().preview(bLine); return; }
  if (a === 'bprint' && bLine) { inv().print(bLine); return; }
  if (a === 'bpaid' && bLine) { inv().setPaid(bLine, true); return; }
  if (a === 'bunpaid' && bLine) { inv().setPaid(bLine, false); return; }
}
function saveName() {
  const el = document.querySelector('#tpfRoot [data-tpfin="name"]');
  if (el && sync().setStudentName) { sync().setStudentName(sid, el.value); toast('Name saved'); }
  nameEdit = false; render();
}
/* p7: the student's time beside a time, kept up as it is typed. */
function onInput(e) {
  const el = e.target, f = el.dataset && el.dataset.tpfin;
  if (f === 'tzq') { tzQ = el.value; const l = $('tpfTzList'); if (l) { l.hidden = !tzQ.trim(); l.innerHTML = tzQ.trim() ? tzListHtml((stu() || {}).tz || '') : ''; l.scrollTop = 0; } return; }
  if (f === 't') {
    const span = $('tpfThr' + el.dataset.d), z = theirTz(sid);
    if (span && z && el.value) {
      const r = T().slotIn(el.dataset.d, el.value, T().myTz(), z);
      if (r) { span.innerHTML = esc(nameOf(stu())) + ': <b>' + DAY_SHORT[r.wd] + ' ' + esc(T().timeText(r.at, z)) + '</b>'; span.classList.toggle('shift', r.dayShift); }
    }
  }
}
function onChange(e) {
  const el = e.target, f = el.dataset.tpfin;
  if (!f) return;
  if (f === 'tzq') return;
  if (f === 'name') return;
  if (f === 't' || f === 'len') {
    const v = f === 'len' ? Math.max(5, Math.min(240, parseInt(el.value, 10) || 45)) : (el.value || '17:00');
    setDay(sid, el.dataset.d, { [f]: v });
    return render();
  }
  const b = bill(), I = inv();
  if (f === 'billto') I.setBillTo(sid, el.value);
  else if (f === 'amount') b.setStored(sid, { amount: el.value.trim().replace(/[, ]/g, '') || undefined });
  else if (f === 'currency') b.setStored(sid, { currency: el.value.trim().slice(0, 6) || undefined });
  else if (f === 'step') {
    const n = parseInt(el.value, 10);
    b.setStored(sid, { step: Number.isFinite(n) && n >= 1 ? String(Math.min(n, 240)) : undefined, unit: undefined });
  } else if (f === 'free') b.setStored(sid, { amount: el.checked ? '0' : undefined });
  else if (f === 'from' || f === 'to') {
    const from = f === 'from' ? el.value : bp.from, to = f === 'to' ? el.value : bp.to;
    if (from && to) setPeriod(I.rangePeriod(from, to));
    return;
  } else return;
  // Rate, rounding and who to bill all change the invoice, so re-read it.
  loadBilling();
}
document.addEventListener('keydown', (e) => {
  // p9: the lesson editor sits on top and has its own keys.
  if (window.TehfizLesson && window.TehfizLesson.isOpen()) return;
  if (!isOpen) return;
  // The page's own fields get Enter here: this listener stops it reaching them.
  if (e.key === 'Enter' && nameEdit && e.target.dataset && e.target.dataset.tpfin === 'name') { e.preventDefault(); e.stopPropagation(); saveName(); return; }
  if (e.key === 'Escape') {
    e.stopPropagation(); e.preventDefault();
    if (closeProgress()) return;
    if (nameEdit) { nameEdit = false; render(); return; }
    if (ask) { ask = null; render(); } else close();
    return;
  }
  e.stopPropagation();   // the app's single-key shortcuts stay quiet behind this page
}, true);

/* ── open / close ───────────────────────────────────────────────────────── */
function setTab(t) {
  tab = TABS.some(([k]) => k === t) ? t : 'overview';
  ask = null;
  if (tab === 'billing') {
    if (!bp) bp = inv() ? inv().monthPeriod(inv().today().slice(0, 7)) : null;
    if (bp) { loadBilling(); loadMonths(); }
  }
  render();
}
function open(id, t) {
  if (!sync() || !sync().student || !sync().student(id)) { toast('That student is not on this device'); return; }
  injectCss();
  if (sid !== id) { bp = null; bLine = undefined; bMonths = null; plan = null; mapView = null; saveNote = ''; tzOpen = false; tzEdit = false; }
  nameEdit = false;
  sid = id; isOpen = true; busy = false;
  loadPlan(id);
  if (inv()) inv().onChange(() => { if (isOpen && tab === 'billing') loadBilling(); });
  setTab(t || 'overview');
}
function close() {
  isOpen = false; ask = null; render();
  if (inv()) inv().onChange(null);
}

/* ── for a session (phase 4) ────────────────────────────────────────────── */
/* The plan for a student, from this device first; fetched in the background
   when it is missing or more than a few minutes old. `then` is called once a
   fresh copy arrives, so a caller can redraw. */
const fetching = {};
function planFor(id, then) {
  const c = cachedPlan(id);
  if ((!c || Date.now() - (c.at || 0) > PLAN_FRESH_MS) && signedIn() && !fetching[id]) {
    fetching[id] = true;
    sync().api('/api/students/' + encodeURIComponent(id) + '/plan')
      .then((p) => { cachePlan(id, p); cacheTT(id, p.timetable); if (then) then(cachedPlan(id)); })
      .catch(() => {}).finally(() => { fetching[id] = false; });
  }
  return c;
}
/* Which old juz is due: the one with old pages that was heard longest ago in
   this device's sessions (never heard counts as longest). */
function oldRotation(id, pages) {
  const M = window.TehfizMap; if (!M || !M.valid(pages)) return null;
  const cand = [];
  for (let j = 1; j <= 30; j++) {
    const a = (M.juzStart(j) - 1) * 2, b = M.juzEnd(j) * 2 - 1;
    let old = 0; for (let h = a; h <= b; h++) if (pages[h] === 'o') old++;
    if (old) cand.push(j);
  }
  if (!cand.length) return null;
  const last = {};
  (sync().localSessionsFor(id) || []).forEach((s) => {
    const d = s.dateYMD || ''; if (!d) return;
    (s.segments || []).forEach((sg) => {
      if (!sg.startKey || !sg.endKey) return;
      M.halvesForRange(sg.startKey, sg.endKey).forEach((h) => {
        const j = M.juzOfPage(Math.floor(h / 2) + 1);
        if (!last[j] || last[j] < d) last[j] = d;
      });
    });
  });
  cand.sort((x, y) => (last[x] || '').localeCompare(last[y] || '') || x - y);
  return { juz: cand[0], heard: last[cand[0]] || null };
}
/* Progress report inside the teacher app (A): a full-screen layer over the
   Profile with a Back bar and the student viewer's report in a frame. The
   frame reads the session through the same sign-in, so nothing extra is sent.
   Later this moves into a shared file both apps load. */
let progEl = null;
function openProgress(sid) {
  const S = sync(), st = S && S.student ? S.student(sid) : null;
  const sess = S && S.localSessionsFor ? S.localSessionsFor(sid) : [];
  // p6: embed=1 — the viewer hides its own bars, so this overlay's is the only one.
  const url = S && S.viewerUrl ? S.viewerUrl(sid, 'progress') + '&embed=1' : null;
  closeProgress();
  progEl = document.createElement('div');
  progEl.id = 'tpfProg';
  progEl.setAttribute('role', 'dialog');
  progEl.setAttribute('aria-label', 'Progress report');
  progEl.innerHTML = '<div class="tpf-progbar"><button class="tpf-btn" data-tpfp="back">\u2039 Back</button>' +
    '<span class="tpf-progt">Progress report' + (st ? ' \u00b7 ' + esc(st.name || st.code || '') : '') + '</span>' +
    '<button class="tpf-btn" data-tpfp="print" title="Print or save as PDF">Print</button></div>' +
    (url ? '<iframe class="tpf-progf" src="' + esc(url) + '" title="Progress report"></iframe>'
         : '<div class="tpf-empty" style="padding:24px;">No sent sessions for this student yet' + (sess.length ? ' \u2014 send one from Sessions first.' : '.') + '</div>');
  document.body.appendChild(progEl);
  // Esc pressed while the report has focus closes it too (same origin).
  const fr = progEl.querySelector('iframe');
  if (fr) fr.addEventListener('load', () => { try { fr.contentWindow.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProgress(); }); } catch (_) {} });
  progEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpfp]'); if (!b) return;
    if (b.dataset.tpfp === 'back') closeProgress();
    else if (b.dataset.tpfp === 'print') { const f = progEl.querySelector('iframe'); try { f.contentWindow.focus(); f.contentWindow.print(); } catch (_) {} }
  });
}
function closeProgress() { if (progEl) { progEl.remove(); progEl = null; return true; } return false; }

/* What a lesson does to the map: preview first (Finish session shows it),
   then apply when the session is saved. ranges: [[startKey, endKey], …] of
   the non-spot segments recited. */
function previewLesson(id, ranges) {
  const M = window.TehfizMap, c = cachedPlan(id);
  if (!M || !c || !M.valid(c.map.pages)) return null;
  const r = M.withLesson(c.map.pages, ranges, c.map.recent_auto !== false);
  // p12: the ayahs recited join the memorised ones, exactly.
  const ayahs = M.withRanges ? M.reconcile(r.pages, M.withRanges(M.reconcile(c.map.pages, c.map.ayahs || ''), ranges)) : undefined;
  return { pages: r.pages, recentAuto: c.map.recent_auto !== false, added: r.added, ayahs,
           addedText: r.added.length ? M.halvesText(r.added[0], r.added[r.added.length - 1]) : '' };
}
function applyLesson(id, ranges) {
  const pv = previewLesson(id, ranges);
  if (!pv || !pv.added.length) return pv;
  queueMap(id, pv.pages, pv.recentAuto, pv.ayahs);
  scheduleSave();
  return pv;
}
/* The next lesson to suggest after this one: the next timetable slot, the
   next half page after the new lesson, the recent juz, the old juz due. */
function suggestNext(id, pagesAfter) {
  const M = window.TehfizMap;
  const nl = nextLesson(id);
  const out = { at: nl ? nl.at : null, len: nl ? nl.len : 0, fromTimetable: !!nl, new: '', recent: '', old: '' };
  if (M && M.valid(pagesAfter)) {
    const h = M.nextHalf(pagesAfter);
    if (h != null) out.new = M.halvesText(h, h);
    const s = M.summary(pagesAfter);
    if (s.recentJuz.length) out.recent = 'Juz ' + s.recentJuz.join(', ');
    const o = oldRotation(id, pagesAfter);
    if (o) out.old = 'Juz ' + o.juz;
  }
  return out;
}
/* ── planning a lesson (p9) ─────────────────────────────────────────────── */
function stageLabel(id) { return typeof sessionTypeLabel === 'function' ? sessionTypeLabel(id) : id; }
/* The lesson editor (lesson-editor.js), redrawing this page after a save. */
function lessonEditor(opts) {
  if (!window.TehfizLesson) { toast('The lesson editor did not load'); return; }
  const after = opts.onDone;
  window.TehfizLesson.open({ mode: 'save', ...opts, onDone: (r) => { if (isOpen) render(); if (after) after(r); } });
}
function editLesson(id, occ, onDone) { lessonEditor({ sid: id, occ, onDone }); }
/* What to recite next, from the map, as planned segments: the next half page
   as New, the recent juz as Recent, the old juz that is due as Old. */
function suggestPlan(id, pagesAfter) {
  const M = window.TehfizMap, c = cachedPlan(id);
  const pages = pagesAfter || (c && c.map && c.map.pages);
  if (!M || !M.valid(pages) || !M.halfKeys) return [];
  const out = [];
  const h = M.nextHalf(pages);
  if (h != null) { const k = M.halfKeys(h); out.push({ type: 'new', mode: 'recite', start: k[0], end: k[1], label: M.halvesText(h, h), unit: 'page', utext: String(Math.floor(h / 2) + 1) }); }
  const s = M.summary(pages);
  s.recentJuz.forEach((j) => { const k = M.juzKeys(j); out.push({ type: 'recent', mode: 'recite', start: k[0], end: k[1], label: 'Juz ' + j, unit: 'juz', utext: String(j) }); });
  const o = oldRotation(id, pages);
  if (o) { const k = M.juzKeys(o.juz); out.push({ type: 'old', mode: 'recite', start: k[0], end: k[1], label: 'Juz ' + o.juz, unit: 'juz', utext: String(o.juz) }); }
  return out;
}
/* Start a session for the student's next lesson, its segments set up. */
function startFromPlan(id) {
  const o = T() && nextOf(id);
  const planned = o ? T().planOf(o) : [];
  close();
  if (typeof startSessionFromPlan === 'function') {
    if (startSessionFromPlan(id, planned)) toast('New session for ' + nameOf(stu() || sync().student(id)) + (planned.length ? ' \u00b7 ' + planned.length + ' segment' + (planned.length === 1 ? '' : 's') + ' set up' : ''));
  }
}

function saveNextLesson(id, nx) {
  const q = readJ(K_NLQ, {}); q[id] = nx || null; writeJ(K_NLQ, q);
  scheduleSave();
}

window.TehfizProfile = { open, close, isOpen: () => isOpen, nextLesson, nextOf, timetable, theirLine, ttOf, editLesson, setLessons, suggestPlan, startFromPlan,
  isEditing: () => !!(window.TehfizLesson && window.TehfizLesson.isOpen()),
  planFor, previewLesson, applyLesson, suggestNext, saveNextLesson, oldRotation, version: TEHFIZ_PROFILE_VERSION };
})();
