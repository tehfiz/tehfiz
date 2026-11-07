/* ═══════════════════════════════════════════════════════════════════════
   journey.js — TehfizJourney — j5
   Loaded by the student viewer only, from /app/student/journey.js?v=j6.

   j6: the map gets the memorised ayahs too, so By surah is exact.

   j5: the memorisation map is shared with the progress report: map()
   returns it, and a 'tehfiz-plan' event fires when a fresh copy arrives.

   j4: a lesson's plan (its segments, each with a verse range) shows as rows;
   tapping one goes to where it starts.

   j3: lesson times come from TehfizTime (shared/tehfiz-time.js), so the
   weekly days the teacher entered in their own time show in the student's
   own time, single lessons appear too, and a next lesson moved by the
   teacher replaces the lesson it came from. "Coming up" lists the next few.

   "My journey": what is coming next and how far the student has come.
   j2: a full-size overlay over the mushaf (it was a narrow left panel, too
   cramped for the map). Opened from the "My journey" button in the bar, the
   strip above the mushaf, or the ☰ menu; ✕ or Esc closes it.
     · the strip   a thin line above the mushaf with the soonest next lesson.
                   Tapping it opens the overlay; tapping the page reference
                   in it jumps there.
     · inside      one next-lesson card per teacher (soonest first), each
                   teacher's lesson days and the progress report on the left;
                   the memorisation map on the right (read-only — tap a juz
                   to see its pages, tap a page to go to it). One column on
                   phones.

   Data: GET /api/student/plan with the student's token; in teacher review
   mode (?review=<id>) GET /api/students/<id>/plan with the teacher's token.
   The student's copy is cached on this device (tehfiz_journey_plan) so the
   strip and the overlay work offline. Review mode writes nothing here, like
   the rest of review mode.

   Closed, the overlay is hidden and inert, and focus goes back to whatever
   opened it — never left on a hidden button.

   Self-contained: namespace window.TehfizJourney, DOM #tjyRoot #tjyStrip,
   CSS prefixed .tjy-. It calls, and nothing else:
     TehfizMap.{render, summary, newText, viewState}, TehfizReview.active,
     TehfizClaim.open, app: openReview, jumpToPageFromInput, goToJuz
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_JOURNEY_VERSION = 'j6';
const KEY_PLAN = 'tehfiz_journey_plan';
const REFRESH_MS = 5 * 60 * 1000;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function readJSON(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }
function review() { return !!(window.TehfizReview && window.TehfizReview.active()); }
const RID = new URLSearchParams(location.search).get('review');
function token() {
  try { return localStorage.getItem(review() ? 'tehfiz_sync_token' : 'tehfiz_claim_token'); } catch { return null; }
}
function apiBase() {
  let o = null;
  try { o = localStorage.getItem(review() ? 'tehfiz_sync_api' : 'tehfiz_claim_api'); } catch {}
  if (o !== null) return o.replace(/\/+$/, '');
  return location.protocol === 'file:' ? 'http://localhost:8788' : '';
}
function compact() { return document.body.classList.contains('compact-ui'); }

/* ── state ──────────────────────────────────────────────────────────────── */
// plan: { map: {pages, recent_auto}, timetables: [{teacher, slots, next_lesson}], at }
let plan = review() ? null : readJSON(KEY_PLAN);
let state = 'idle';                          // idle | loading | ok | error | signedout
let open_ = false;
let lastToken = token();
let mapState = null;

/* ── data ───────────────────────────────────────────────────────────────── */
async function fetchPlan() {
  const t = token();
  if (!t) { state = 'signedout'; if (!review()) { plan = null; try { localStorage.removeItem(KEY_PLAN); } catch {} } render(); return; }
  state = plan ? 'ok' : 'loading'; render();
  const path = review() ? '/api/students/' + encodeURIComponent(RID) + '/plan' : '/api/student/plan';
  try {
    const res = await fetch(apiBase() + path, { headers: { Authorization: 'Bearer ' + t } });
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    const tts = review()
      ? (d.timetable ? [{ teacher: 'Set by you', ...d.timetable }] : [])
      : (d.timetables || []);
    plan = { map: d.map || null, timetables: tts, at: Date.now() };
    if (!review()) { try { localStorage.setItem(KEY_PLAN, JSON.stringify(plan)); } catch {} }
    state = 'ok';
    try { window.dispatchEvent(new CustomEvent('tehfiz-plan')); } catch {}
  } catch {
    state = 'error';
  }
  render();
}

function TT() { return window.TehfizTime || null; }
/* Each teacher's next lesson (one under way still counts), soonest first. */
function upcoming() {
  if (!plan || !plan.timetables || !TT()) return [];
  const out = [];
  plan.timetables.forEach((tt) => {
    const o = TT().next(tt);
    if (o) out.push({ teacher: tt.teacher, at: new Date(o.at), len: o.len || 0, set: o.kind === 'set', kind: o.kind,
                      new: o.new || '', recent: o.recent || '', old: o.old || '', note: o.note || '', plan: o.plan || null });
  });
  return out.sort((a, b) => a.at - b.at);
}
/* The few lessons after those, over the next two weeks. */
function comingUp() {
  if (!plan || !plan.timetables || !TT()) return [];
  const now = Date.now(), firsts = new Set(upcoming().map((l) => +l.at));
  const all = [];
  plan.timetables.forEach((tt) => {
    TT().occurrences(tt, now, now + 14 * 86400000).forEach((o) => { if (!firsts.has(o.at)) all.push({ ...o, teacher: tt.teacher }); });
  });
  return all.sort((a, b) => a.at - b.at).slice(0, 6);
}

/* ── text ───────────────────────────────────────────────────────────────── */
function dayText(d) {
  if (TT()) return TT().dayText(+d);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function timeText(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function slotTime(t) { const [h, m] = String(t || '').split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return timeText(d); }
function agoText(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
/* A page or juz the teacher wrote ("p. 36, second half", "Juz 2"): where a
   tap on it should go. null when the text names neither. */
function target(text) {
  const s = String(text || '');
  let m = /\bp(?:age|g)?\.?\s*(\d{1,3})/i.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 604) return { page: +m[1] };
  m = /\bjuz\s*(\d{1,2})/i.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 30) return { juz: +m[1] };
  return null;
}
function goLink(text) {
  const t = target(text);
  if (!t) return esc(text);
  return '<button type="button" class="tjy-go" data-tjy="go" ' + (t.page ? 'data-p="' + t.page + '"' : 'data-j="' + t.juz + '"') +
    ' title="Go to it in the mushaf">' + esc(text) + '</button>';
}
function go(el) {
  if (el.dataset.k && typeof window.navigateToVerse === 'function') {
    const [s, a] = el.dataset.k.split(':').map(Number);
    close(true); window.navigateToVerse(s, a, null); return;
  }
  if (el.dataset.p && typeof window.jumpToPageFromInput === 'function') window.jumpToPageFromInput(el.dataset.p);
  else if (el.dataset.j && typeof window.goToJuz === 'function') window.goToJuz(+el.dataset.j);
  close(true);
}

/* ── render ─────────────────────────────────────────────────────────────── */
function stageName(id) { return typeof sessionTypeLabel === 'function' ? sessionTypeLabel(id) : id; }
function planRows(plan) {
  return '<div class="tjy-kv">' + plan.map((p) => {
    const k = p.mode === 'spot' ? 'Spot test' : (p.type && p.type !== 'unassigned' ? stageName(p.type) : 'Recite');
    const txt = p.label || p.text || (p.start ? p.start + '\u2013' + p.end : '');
    const v = p.start
      ? '<button type="button" class="tjy-go" data-tjy="go" data-k="' + esc(p.start) + '" title="Go to ' + esc(p.start) + '">' + esc(txt) + '</button>' + (p.label && p.text ? ' <span class="tjy-mut">' + esc(p.text) + '</span>' : '')
      : goLink(txt);
    return '<span>' + esc(k) + '</span><span>' + v + (p.mode === 'spot' && p.spots ? ' <span class="tjy-mut">\u00b7 ' + p.spots + ' spots</span>' : '') + '</span>';
  }).join('') + '</div>';
}
function lessonCard(l, many) {
  if (Array.isArray(l.plan) && l.plan.length) {
    return '<div class="tjy-card tjy-nl">' +
      '<div class="tjy-who"><span>' + esc(l.teacher || 'Your teacher') + '</span><span>' + (l.len ? l.len + ' min' : '') + '</span></div>' +
      '<div class="tjy-big">' + esc(dayText(l.at)) + ' \u00b7 ' + esc(timeText(l.at)) + '</div>' + planRows(l.plan) +
      (l.note ? '<div class="tjy-mut">' + esc(l.note) + '</div>' : '') + '</div>';
  }
  const rows = [['New', l.new], ['Recent', l.recent], ['Old', l.old]].filter(([, v]) => v && String(v).trim());
  return '<div class="tjy-card tjy-nl">' +
    '<div class="tjy-who"><span>' + esc(l.teacher || 'Your teacher') + '</span><span>' + (l.len ? l.len + ' min' : '') + '</span></div>' +
    '<div class="tjy-big">' + esc(dayText(l.at)) + ' · ' + esc(timeText(l.at)) + '</div>' +
    (rows.length ? '<div class="tjy-kv">' + rows.map(([k, v]) => '<span>' + k + '</span><span>' + goLink(v) + '</span>').join('') + '</div>'
      : '<div class="tjy-mut">' + (l.set ? '' : 'From your lesson days. ') + 'Your teacher hasn’t said what it covers yet.</div>') +
    (l.note ? '<div class="tjy-mut">' + esc(l.note) + '</div>' : '') +
  '</div>';
}
function comingHtml() {
  const list = comingUp();
  if (!list.length) return '';
  const many = (plan.timetables || []).length > 1;
  return '<div class="tjy-h">Coming up</div><div class="tjy-card tjy-list">' + list.map((o) =>
    '<div class="tjy-li"><span>' + esc(dayText(new Date(o.at))) + ' \u00b7 ' + esc(timeText(new Date(o.at))) + '</span>' +
      '<small>' + esc([many ? o.teacher : '', TT().planText(o, stageName), o.len ? o.len + ' min' : ''].filter(Boolean).join(' \u00b7 ')) + '</small></div>').join('') + '</div>';
}
function daysHtml() {
  const tts = (plan && plan.timetables || []).filter((tt) => tt.slots && Object.keys(tt.slots).length);
  if (!tts.length) return '';
  const many = tts.length > 1;
  return '<div class="tjy-h">Lesson days</div>' + tts.map((tt) =>
    '<div class="tjy-card tjy-days">' + (many ? '<span class="tjy-who1">' + esc(tt.teacher) + '</span>' : '') +
      DAY_ORDER.filter((d) => tt.slots[d] || tt.slots[String(d)]).map((d) => {
        const s = tt.slots[d] || tt.slots[String(d)];
        // j3: entered in the teacher's time; shown in this device's own time.
        const r = TT() && TT().validTz(tt.tz) ? TT().slotIn(d, s.t, tt.tz, TT().myTz()) : null;
        return r ? { k: r.at, h: '<span class="tjy-day">' + esc(TT().weekdayShort(r.at)) + ' ' + esc(TT().timeText(r.at)) + '</span>' }
                 : { k: d, h: '<span class="tjy-day">' + DAY_SHORT[d] + ' ' + esc(slotTime(s.t)) + '</span>' };
      }).sort((a, b) => a.k - b.k).map((x) => x.h).join('') +
      (TT() && TT().validTz(tt.tz) && !TT().sameOffset(tt.tz, TT().myTz()) ? '<span class="tjy-who1">In your time. ' + esc(tt.teacher) + '\u2019s time is ' + esc(TT().city(tt.tz)) + '.</span>' : '') +
      '</div>').join('');
}
function mapHtml() {
  const M = window.TehfizMap;
  const pages = plan && plan.map && plan.map.pages;
  if (!M) return '';
  const s = M.summary(pages);
  if (!s.memorised) {
    return '<div class="tjy-h">Memorisation</div><div class="tjy-card tjy-pad"><span class="tjy-mut">' +
      (review() ? 'Nothing marked on the map yet.' : 'Your teacher hasn’t marked what you’ve memorised yet.') + '</span></div>';
  }
  const extra = [s.recentJuz.length ? 'Recent: Juz ' + s.recentJuz.join(', ') : '', s.newAt ? 'New lesson: ' + M.newText(s) : '']
    .filter(Boolean).join(' · ');
  return '<div class="tjy-h">Memorisation · ' + esc(s.text) + '</div>' +
    '<div class="tjy-card tjy-pad">' + (extra ? '<span class="tjy-mut">' + esc(extra) + '</span>' : '') +
      '<div id="tjyMap"></div><span class="tjy-mut" id="tjyMapHint">Tap a juz to see its pages, then a page to go to it.</span></div>';
}
function bodyHtml() {
  if (state === 'signedout' && !plan) {
    return '<div class="tjy-col"><div class="tjy-card tjy-pad"><span>' + (review() ? 'Sign in to the teacher app to see this student’s plan.'
      : 'Log in with the code from your teacher to see your next lesson and what you’ve memorised.') + '</span>' +
      (review() ? '' : '<button type="button" class="tjy-btn pri" data-tjy="login">Log in</button>') + '</div></div>';
  }
  if (!plan) {
    return '<div class="tjy-col"><div class="tjy-card tjy-pad"><span class="tjy-mut">' + (state === 'error' ? 'Could not load it. Check your connection.' : 'Loading…') + '</span>' +
      (state === 'error' ? '<button type="button" class="tjy-btn" data-tjy="retry">Try again</button>' : '') + '</div></div>';
  }
  const up = upcoming();
  const many = (plan.timetables || []).length > 1;
  return '<div class="tjy-col">' +
      '<div class="tjy-h">Next lesson</div>' +
      (up.length ? up.map((l) => lessonCard(l, many)).join('')
        : '<div class="tjy-card tjy-pad"><span class="tjy-mut">' + (review() ? 'No next lesson set yet.' : 'Your teacher hasn’t set your next lesson yet.') + '</span></div>') +
      comingHtml() +
      daysHtml() +
      '<div class="tjy-h">Progress</div>' +
      '<button type="button" class="tjy-btn tjy-prog" data-tjy="progress">📈 Progress report<small>Every mistake, how each part is holding up, and what to work on next</small></button>' +
      (state === 'error' ? '<div class="tjy-mut tjy-stale">Offline — showing what was saved ' + esc(agoText(plan.at)) + '.</div>' : '') +
    '</div>' +
    '<div class="tjy-col tjy-colmap">' + mapHtml() + '</div>';
}
function rootHtml() {
  return '<div class="tjy-ov" role="dialog" aria-modal="true" aria-labelledby="tjyTitle">' +
    '<div class="tjy-head"><b id="tjyTitle">' + (review() ? 'Journey' : 'My journey') + '</b>' +
      '<button type="button" class="tjy-x" data-tjy="close" aria-label="Close">✕</button></div>' +
    '<div class="tjy-body" id="tjyBody"><div class="tjy-grid">' + bodyHtml() + '</div></div></div>';
}
function stripHtml() {
  const l = upcoming()[0];
  if (!l) return '';
  const p0 = Array.isArray(l.plan) && l.plan.length ? l.plan[0] : null;
  const what = p0 ? (p0.mode === 'spot' ? 'Spot test ' : stageName(p0.type) + ' ') + (p0.label || p0.text || p0.start || '')
    : l.new ? 'New ' + l.new : l.recent ? 'Recent ' + l.recent : '';
  const t = p0 && p0.start ? { key: p0.start } : target(l.new || l.recent);
  return '<button type="button" class="tjy-sopen" data-tjy="open" aria-label="Open My journey">' +
      '<b>Next lesson</b><span class="tjy-when">' + esc(dayText(l.at)) + ' ' + esc(timeText(l.at)) + '</span></button>' +
    (what ? (t ? '<button type="button" class="tjy-go tjy-swhat" data-tjy="go" ' + (t.key ? 'data-k="' + esc(t.key) + '"' : t.page ? 'data-p="' + t.page + '"' : 'data-j="' + t.juz + '"') + ' title="Go to it in the mushaf">' + esc(what) + '</button>'
              : '<span class="tjy-swhat">' + esc(what) + '</span>') : '') +
    '<button type="button" class="tjy-schev" data-tjy="open" aria-label="Open My journey">›</button>';
}
function renderStrip() {
  const s = $('tjyStrip');
  if (s) { const h = stripHtml(); s.innerHTML = h; s.hidden = !h; }
}

let rendering = false;
function render() {
  if (rendering) return;
  rendering = true;
  try {
    renderStrip();
    const root = $('tjyRoot');
    if (root && open_) {
      const body = $('tjyBody'), keep = body ? body.scrollTop : 0;
      const ms = window.TehfizMap && $('tjyMap') ? window.TehfizMap.viewState($('tjyMap')) : null;
      if (ms) mapState = ms;
      root.innerHTML = rootHtml();
      const m = $('tjyMap');
      if (m && window.TehfizMap) {
        window.TehfizMap.render(m, { pages: plan.map.pages, ayahs: plan.map.ayahs || '', recentAuto: plan.map.recent_auto !== false && plan.map.recent_auto !== 0,
          editable: false, openReadOnly: true, state: mapState || undefined });
      }
      const nb = $('tjyBody'); if (nb && keep) nb.scrollTop = keep;
    }
    layout();
  } finally { rendering = false; }
}

/* ── open / close ───────────────────────────────────────────────────────── */
function layout() {
  const root = $('tjyRoot'), btn = $('tjyBtn');
  if (!root) return;
  /* Closed means hidden AND inert: nothing in it can hold focus or be read
     out. (j1 set aria-hidden on a panel whose ✕ still had focus, which the
     browser rightly refused.) */
  root.hidden = !open_;
  if (open_) root.removeAttribute('inert'); else root.setAttribute('inert', '');
  if (btn) { btn.classList.toggle('on', open_); btn.setAttribute('aria-expanded', String(open_)); }
  document.body.classList.toggle('tjy-open', open_);
}
let opener = null;
function openPanel() {
  if (open_) return;
  opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  open_ = true;
  if (state === 'idle' || !plan || Date.now() - plan.at > 60000) fetchPlan();
  render();
  const x = document.querySelector('#tjyRoot .tjy-x');
  if (x) x.focus({ preventScroll: true });
}
/* `moved`: the student is going somewhere in the mushaf, so focus stays put
   rather than jumping back to the button that opened this. */
function close(moved) {
  if (!open_) return;
  // Focus leaves the overlay BEFORE it is hidden.
  const back = !moved && opener && document.contains(opener) && !opener.closest('#tjyRoot') ? opener : null;
  if (back) back.focus({ preventScroll: true });
  else if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#tjyRoot')) document.activeElement.blur();
  open_ = false; opener = null;
  layout();
  const root = $('tjyRoot'); if (root) root.innerHTML = '';
}
function toggle() { if (open_) close(); else openPanel(); }

/* ── events ─────────────────────────────────────────────────────────────── */
function onClick(e) {
  const t = e.target.closest('[data-tjy]');
  if (t) {
    const a = t.dataset.tjy;
    if (a === 'open') return openPanel();
    if (a === 'close') return close();
    if (a === 'go') { e.stopPropagation(); return go(t); }
    if (a === 'retry') return fetchPlan();
    if (a === 'login') { close(); if (window.TehfizClaim) window.TehfizClaim.open(); return; }
    if (a === 'progress') { close(true); if (typeof window.openReview === 'function') window.openReview(); return; }
    return;
  }
  // A page in the read-only map: go to it.
  const pc = e.target.closest('#tjyMap .tzm-pc[data-pg]');
  if (pc && typeof window.jumpToPageFromInput === 'function') {
    window.jumpToPageFromInput(pc.dataset.pg);
    close(true);
  }
}

function injectCss() {
  if ($('tjyCss')) return;
  const el = document.createElement('style');
  el.id = 'tjyCss';
  el.textContent = `
#tjyRoot[hidden]{display:none;}
/* Above the bar, the panels and the floating buttons; below dialogs (300). */
#tjyRoot{position:fixed;inset:0;z-index:250;}
.tjy-ov{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--parchment);font-family:var(--ui-font);color:var(--ink);}
.tjy-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;height:56px;padding:0 max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left));
  background:var(--chrome);color:var(--on-ink);}
.tjy-head b{font-size:17px;font-weight:600;}
.tjy-x{width:40px;height:40px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(255,255,255,.08);color:var(--on-ink);cursor:pointer;font-size:14px;}
.tjy-x:hover{background:rgba(255,255,255,.18);}
.tjy-x:focus-visible{outline:2px solid var(--chrome-accent);outline-offset:2px;}
.tjy-body{flex:1;min-height:0;overflow:auto;padding:16px max(16px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));}
.tjy-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:24px;align-items:start;}
body.compact-ui .tjy-grid{grid-template-columns:minmax(0,1fr);gap:14px;}
.tjy-col{display:flex;flex-direction:column;gap:8px;min-width:0;}
.tjy-h{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3);padding:8px 2px 0;}
.tjy-col > .tjy-h:first-child{padding-top:0;}
.tjy-card{background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;}
.tjy-pad{padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
.tjy-nl{padding:12px 14px;display:flex;flex-direction:column;gap:6px;font-size:14px;}
.tjy-who{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--ink3);}
.tjy-big{font-size:18px;font-weight:600;}
.tjy-kv{display:grid;grid-template-columns:76px 1fr;gap:4px 8px;}
.tjy-kv > span:nth-child(odd){color:var(--ink3);}
.tjy-mut{font-size:12.5px;color:var(--ink3);}
.tjy-stale{padding:0 2px;}
.tjy-go{all:unset;cursor:pointer;color:var(--ink);text-decoration:underline;text-underline-offset:2px;}
.tjy-go:hover{color:var(--gold);}
.tjy-go:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:3px;}
.tjy-days{padding:10px 12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.tjy-who1{width:100%;font-size:12px;color:var(--ink3);}
.tjy-list{padding:4px 12px;}
.tjy-li{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--border);font-size:13.5px;}
.tjy-li:first-child{border-top:none;}
.tjy-li small{color:var(--ink3);font-size:12px;}
.tjy-day{font-size:13px;border:1px solid var(--border2);border-radius:999px;padding:4px 10px;}
.tjy-btn{min-height:42px;padding:0 16px;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.tjy-btn:hover{background:var(--parchment2);}
.tjy-btn.pri{background:var(--gold);color:var(--on-gold);border-color:var(--gold);font-weight:600;}
.tjy-prog{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 14px;text-align:left;border-radius:12px;}
.tjy-prog small{font-size:12px;font-weight:400;color:var(--ink3);}
#tjyMap .tzm-jgrid{grid-template-columns:repeat(6,minmax(0,1fr));}
#tjyMap .tzm-pgrid{grid-template-columns:repeat(6,minmax(0,1fr));}
body.compact-ui #tjyMap .tzm-jgrid,body.compact-ui #tjyMap .tzm-pgrid{grid-template-columns:repeat(5,minmax(0,1fr));}
@media (min-width:1000px){body:not(.compact-ui) #tjyMap .tzm-jgrid{grid-template-columns:repeat(10,minmax(0,1fr));}
  body:not(.compact-ui) #tjyMap .tzm-pgrid{grid-template-columns:repeat(8,minmax(0,1fr));}}
/* the strip above the mushaf */
#tjyStrip{flex:none;display:flex;align-items:center;gap:8px;margin:8px 10px 0;padding:0 4px 0 12px;min-height:40px;border-radius:10px;
  background:var(--surface,#fff);border:1px solid var(--border);font:13px var(--ui-font);color:var(--ink);}
#tjyStrip[hidden]{display:none;}
.tjy-sopen{all:unset;cursor:pointer;display:flex;gap:8px;min-height:40px;align-items:center;white-space:nowrap;}
.tjy-sopen b{font-weight:600;}
.tjy-when{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink3);}
.tjy-swhat{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tjy-schev{all:unset;cursor:pointer;margin-left:auto;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:18px;}
.tjy-sopen:focus-visible,.tjy-schev:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:6px;}
body.compact-ui #tjyStrip{margin:6px 8px 0;}
/* the bar button */
#tjyBtn.on{background:var(--chrome-accent);color:var(--chrome);border-color:var(--chrome-accent);}
body.tjy-open .panel-fab,body.tjy-open #autoscrollFabWrap{display:none!important;}
@media print{#tjyRoot,#tjyStrip{display:none!important;}}
`;
  document.head.appendChild(el);
}

function mount() {
  injectCss();
  const qp = $('quranPanel');
  if (!qp) return;
  if (!$('tjyRoot')) {
    const r = document.createElement('div');
    r.id = 'tjyRoot'; r.hidden = true; r.setAttribute('inert', '');
    document.body.appendChild(r);
    r.addEventListener('click', onClick);
  }
  if (!$('tjyStrip')) {
    const st = document.createElement('div');
    st.id = 'tjyStrip'; st.hidden = true;
    qp.insertBefore(st, qp.firstChild);
    st.addEventListener('click', onClick);
  }
  render();
  fetchPlan();
  setInterval(() => { if (document.visibilityState === 'visible') fetchPlan(); }, REFRESH_MS);
  // Signing in or out on this device: follow it.
  setInterval(() => { const t = token(); if (t !== lastToken) { lastToken = t; fetchPlan(); } }, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && plan && Date.now() - plan.at > 60000) fetchPlan(); });
  // The bar's Sync button: fetch the plan alongside the sessions.
  const sb = $('tclSyncBtn'); if (sb) sb.addEventListener('click', () => setTimeout(fetchPlan, 300));
  // A lesson time passing changes the strip; re-check each minute.
  setInterval(() => { if (plan) renderStrip(); }, 60000);
  // Esc closes it; while it is open the viewer's own keys stay quiet.
  document.addEventListener('keydown', (e) => {
    if (!open_) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    e.stopPropagation();
  }, true);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

// The teacher's memorisation map, when there is one (null otherwise).
function mapOf() {
  const m = plan && plan.map;
  return m && window.TehfizMap && window.TehfizMap.valid(m.pages) && /[orn]/.test(m.pages) ? m : null;
}
window.TehfizJourney = { open: openPanel, close: () => close(), toggle, isOpen: () => open_, refresh: fetchPlan, map: mapOf, version: TEHFIZ_JOURNEY_VERSION };
})();
