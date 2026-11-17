/* ═══════════════════════════════════════════════════════════════════════════
   progress.js — TehfizProgress — g3 (17 Nov 2026)

   g3: every lesson on the server, page by page (tehfizListAll, A6), not the first 500.

   The progress report inside the teacher app (stage 7b, mock-ups 6a and 6b).
   The report itself is the shared one (tehfiz-report.js, TehfizReport); this
   module is only the frame round it:

   · a full-screen panel with a student button (type a name or a code; arrows
     and Enter) and ‹ › to step through students in the order of the Students
     list (A–Z, archived left out). On a phone the button opens a sheet; the
     list there, and in the drop-down, puts the most recent lesson first.
     Range, time and tab stay as they are when the student changes.
   · the lessons: this device's, plus the server's for that student (lessons
     recorded on another device), merged by id, the device copy winning. A
     device lesson the server does not have yet is counted and said.
   · the report's hooks, pointed at this app: go to a verse (closes the panel
     and moves the mushaf), a lesson's own report, the Profile's map, help in a
     pop-up, toasts.

   Narrow interface: TehfizProgress.open(studentId), close(), isOpen(). Its own
   DOM (#tprg), CSS (.tprg-*) and storage (none). Needs TehfizSync, TehfizReport
   and TehfizReportRange; TehfizProfile for the map and the Profile button.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const VERSION = 'g3';
const sync = () => window.TehfizSync || null;
const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let el = null, sid = null, lessons = [], unsynced = 0, note = '', pickOpen = false, pickQ = '', pickHi = 0, firstDraw = true;
const cache = {};          // sid -> {lessons, unsynced, note}, for this visit

/* ── students ───────────────────────────────────────────────────────────── */
const label = (s) => (s ? (s.name || s.code || '') : '');
function roster() { const S = sync(); return S && S.roster ? S.roster() : []; }
function ordered() {        // the Students list: A–Z, archived left out (but kept if on screen)
  return roster().filter((s) => !s.archived || s.id === sid)
    .sort((a, b) => label(a).localeCompare(label(b)));
}
function lastLocal(id) {
  const S = sync(); const list = S && S.localSessionsFor ? S.localSessionsFor(id) : [];
  let t = 0; list.forEach((x) => { const d = _sessDate(x); if (d && +d > t) t = +d; });
  return t;
}
function agoText(t) {
  if (!t) return 'no lessons on this device';
  const n = Math.floor((Date.now() - t) / 86400000);
  return n <= 0 ? 'last lesson today' : n === 1 ? 'yesterday' : n < 14 ? n + ' days ago' : n < 60 ? Math.round(n / 7) + ' weeks ago' : Math.round(n / 30) + ' months ago';
}
function matches() {
  const q = pickQ.trim().toLowerCase(), c = q.replace(/[\s-]/g, '');
  return roster().filter((s) => (!s.archived || q) && (!q ||
      (s.name || '').toLowerCase().includes(q) || (c && s.code.replace(/-/g, '').toLowerCase().includes(c))))
    .map((s) => ({ s, t: lastLocal(s.id) }))
    .sort((a, b) => b.t - a.t || label(a.s).localeCompare(label(b.s)));   // most recent lesson first (decided 16 Nov)
}

/* ── lessons: device + server ───────────────────────────────────────────── */
async function load(id) {
  const S = sync();
  if (window.TehfizStore) await TehfizStore.ready;   // g3: the device's filed lessons too
  const local = S && S.localSessionsFor ? S.localSessionsFor(id) : [];
  // The device's lessons at once, so the report is never blank while the server answers.
  if (!cache[id]) cache[id] = { lessons: local, unsynced: 0, note: 'Fetching lessons from other devices…' };
  apply(id);
  if (!S || !S.api) return;
  try {
    const rows = await tehfizListAll(S.api, '/api/sessions?studentId=' + encodeURIComponent(id));   // g3: every page (A6)
    const got = await tehfizFetchPayloads(S.api, rows.map((r) => r.id), '/api/sessions/payloads',
      (x) => '/api/sessions/' + encodeURIComponent(x) + '/payload');
    const byId = new Map();
    rows.forEach((r) => { const p = got.get(r.id); if (p) byId.set(String(p.id != null ? p.id : r.client_id), p); });
    const serverIds = new Set(byId.keys());
    local.forEach((x) => byId.set(String(x.id), x));                // the device copy wins
    const n = local.filter((x) => !serverIds.has(String(x.id))).length;
    cache[id] = { lessons: [...byId.values()], unsynced: n, note: '' };
  } catch (err) {
    cache[id] = { lessons: local, unsynced: 0,
      note: err && err.status === 401 ? 'Signed out: showing the lessons on this device only.' : 'Offline: showing the lessons on this device only.' };
  }
  if (id === sid) apply(id);
}
function apply(id) {
  if (id !== sid || !el) return;
  const c = cache[id] || { lessons: [], unsynced: 0, note: '' };
  lessons = c.lessons; unsynced = c.unsynced; note = c.note;
  draw();
}

/* ── the panel ──────────────────────────────────────────────────────────── */
function frame() {
  el = document.createElement('div');
  el.id = 'tprg'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Progress report');
  el.innerHTML = '<div class="tprg-bar"></div><div class="tprg-scroll"><div class="tprg-note" hidden></div><div class="tprg-body" id="tprgBody"></div></div>';
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);
  el.addEventListener('input', (e) => { if (e.target.id === 'tprgQ') { pickQ = e.target.value; pickHi = 0; drawPick(); } });
  document.body.appendChild(el);
  document.body.classList.add('tprg-open');
}
function drawBar() {
  const s = sync() && sync().student ? sync().student(sid) : null;
  el.querySelector('.tprg-bar').innerHTML =
    '<button type="button" class="tprg-b" data-g="close" aria-label="Back">← <span class="tprg-wide">Back</span></button>' +
    '<span class="tprg-t tprg-wide">Progress report</span>' +
    '<div class="tprg-who">' +
      '<button type="button" class="tprg-b tprg-step" data-g="prev" aria-label="Previous student">‹</button>' +
      '<button type="button" class="tprg-pick" data-g="pick" aria-haspopup="listbox" aria-expanded="' + pickOpen + '">' +
        '<span><b>' + E(label(s) || 'Student') + '</b>' + (s && s.name ? ' <span class="tprg-code">' + E(s.code) + '</span>' : '') + '</span><span aria-hidden="true">▾</span></button>' +
      '<button type="button" class="tprg-b tprg-step" data-g="next" aria-label="Next student">›</button>' +
      '<div class="tprg-list" ' + (pickOpen ? '' : 'hidden') + '></div>' +
    '</div>' +
    '<span class="tprg-sp"></span>' +
    '<button type="button" class="tprg-b tprg-wide" data-g="profile">Profile</button>' +
    '<button type="button" class="tprg-b" data-g="copy" title="Copy the report as text">Copy text</button>';
  if (pickOpen) drawPick();
}
function drawPick() {
  const box = el && el.querySelector('.tprg-list'); if (!box) return;
  const hits = matches();
  pickHi = Math.max(0, Math.min(pickHi, hits.length - 1));
  const had = document.activeElement && document.activeElement.id === 'tprgQ';
  if (!box.querySelector('#tprgQ')) {
    box.innerHTML = '<div class="tprg-sheet-h"><b>Show the report for</b><button type="button" class="tprg-b" data-g="pickclose" aria-label="Close">✕</button></div>' +
      '<input id="tprgQ" class="tprg-q" type="text" autocomplete="off" spellcheck="false" placeholder="Name or code" aria-label="Find a student">' +
      '<div class="tprg-opts" role="listbox"></div><div class="tprg-hint">↑ ↓ to move · Enter to open · type a name or a code</div>';
  }
  const q = box.querySelector('#tprgQ'); if (q.value !== pickQ) q.value = pickQ;
  box.querySelector('.tprg-opts').innerHTML = hits.length ? hits.map((h, i) =>
    '<button type="button" role="option" class="tprg-opt' + (i === pickHi ? ' hi' : '') + (h.s.id === sid ? ' on' : '') + '" aria-selected="' + (i === pickHi) + '" data-g="choose" data-id="' + E(h.s.id) + '">' +
      '<span><b>' + E(label(h.s)) + '</b>' + (h.s.name ? ' <span class="tprg-code">' + E(h.s.code) + '</span>' : '') + (h.s.archived ? ' <em>archived</em>' : '') + '</span>' +
      '<span class="tprg-when">' + (h.s.id === sid ? 'showing now' : E(agoText(h.t))) + '</span></button>').join('')
    : '<div class="tprg-empty">No student matches “' + E(pickQ) + '”.</div>';
  if (!had) q.focus();
}
function draw() {
  if (!el) return;
  drawBar();
  const n = el.querySelector('.tprg-note');
  const bits = [];
  if (unsynced) bits.push('Includes ' + unsynced + ' lesson' + (unsynced === 1 ? '' : 's') + ' on this device that ' + (unsynced === 1 ? 'has' : 'have') + ' not synced yet.');
  if (note) bits.push(note);
  n.hidden = !bits.length; n.textContent = bits.join(' ');
  const body = document.getElementById('tprgBody');
  if (!lessons.length) {
    body.innerHTML = '<div class="empty-hint" style="padding:24px 0;">' + (note && note.startsWith('Fetching') ? 'Loading lessons…' : 'No lessons for this student yet.') + '</div>';
    return;
  }
  // The first time: the report's own entry point (it resets the tab and sets
  // the range's redraw). After that, a redraw, so tab, range and time stay.
  if (firstDraw) { firstDraw = false; openReview(); } else _msRerender();
}

/* ── events ─────────────────────────────────────────────────────────────── */
function go(id) {
  if (!id || id === sid) { pickOpen = false; draw(); return; }
  sid = id; pickOpen = false; pickQ = '';
  // Looking at a student does not change who the current lesson is for.
  apply(id); load(id);
  const sc = el.querySelector('.tprg-scroll'); if (sc) sc.scrollTop = 0;
}
function step(d) {
  const list = ordered(); if (!list.length) return;
  const i = list.findIndex((s) => s.id === sid);
  go(list[(i + d + list.length) % list.length].id);
}
function onClick(e) {
  const b = e.target.closest('[data-g]');
  if (!b) { if (pickOpen && !e.target.closest('.tprg-list')) { pickOpen = false; drawBar(); } return; }
  const g = b.dataset.g;
  if (g === 'close') close();
  else if (g === 'prev') step(-1);
  else if (g === 'next') step(1);
  else if (g === 'pick') { pickOpen = !pickOpen; pickQ = ''; pickHi = 0; drawBar(); }
  else if (g === 'pickclose') { pickOpen = false; drawBar(); }
  else if (g === 'choose') go(b.dataset.id);
  else if (g === 'profile') { const id = sid; close(); if (window.TehfizProfile) TehfizProfile.open(id); }
  else if (g === 'copy') copyText();
}
function onKey(e) {
  if (!pickOpen) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); pickHi += e.key === 'ArrowDown' ? 1 : -1; drawPick();
    const h = el.querySelector('.tprg-opt.hi'); if (h) h.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    const h = el.querySelector('.tprg-opt.hi'); if (h) { e.preventDefault(); go(h.dataset.id); }
  } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pickOpen = false; drawBar(); }
}
function onDocKey(e) {
  if (!el || e.key !== 'Escape' || pickOpen) return;
  if (document.querySelector('.modal-bg.open, #rpHelpPop')) return;   // a lesson report or help over it closes first
  e.preventDefault(); close();
}
async function copyText() {
  const t = TehfizReport.text();   // g2: range and time first, as in the viewer
  try { await navigator.clipboard.writeText(t); showToast('Copied ✓'); } catch (_) { showToast('Could not copy'); }
}

/* ── the report's hooks, for this app ───────────────────────────────────── */
/* The student's map, from the Profile's cache. When it is not cached yet the
   Profile fetches it, and the report is drawn again when it arrives. */
function plan() {
  if (!window.TehfizProfile || !TehfizProfile.planFor) return null;
  const id = sid;
  return TehfizProfile.planFor(id, () => { if (el && id === sid && !firstDraw) _msRerender(); });
}
function hooks() {
  TehfizReport.use({
    lessons: () => lessons,
    root: () => document.getElementById('tprgBody'),
    show: () => {},
    isOpen: () => !!el,
    goto: (s, a) => { close(); if (typeof navigateToVerse === 'function') navigateToVerse(s, a, null); },
    help: (t) => TehfizReport.helpPopover(t),
    map: () => { const p = plan(); return p && p.map && p.map.pages ? p.map : null; },
    mapPages: () => { const p = plan(); return p && p.map ? p.map.pages || null : null; },
    isTeacher: () => true,
    toast: (m) => showToast(m),
    openLesson: (id) => {
      const s = lessons.find((x) => String(x.id) === String(id));
      if (s && typeof reviewSessionObject === 'function') reviewSessionObject(s);
    },
    label: () => { const s = sync() && sync().student ? sync().student(sid) : null; return s ? (s.name ? s.name + ' · ' + s.code : s.code) : ''; },
    openMap: () => { const id = sid; close(); if (window.TehfizProfile) TehfizProfile.open(id, 'memorised'); },
  });
}
function unhook() {
  // The teacher app has no other report; the hooks simply go quiet while closed.
  TehfizReport.use({ lessons: () => [], isOpen: () => false });
}

/* ── open / close ───────────────────────────────────────────────────────── */
function open(id) {
  if (!window.TehfizReport || typeof openReview !== 'function') { showToast('The progress report did not load. Reload the page.'); return; }
  if (el) close();
  sid = id; firstDraw = true; pickOpen = false; pickQ = '';
  hooks(); frame();
  document.addEventListener('keydown', onDocKey);
  apply(id); load(id);
}
function close() {
  if (!el) return;
  el.remove(); el = null; sid = null; lessons = [];
  document.body.classList.remove('tprg-open');
  document.removeEventListener('keydown', onDocKey);
  unhook();
}

window.TehfizProgress = { open, close, isOpen: () => !!el, version: VERSION };

/* ── styles (.tprg-*) ───────────────────────────────────────────────────── */
const css = document.createElement('style');
css.textContent = `
#tprg{position:fixed;inset:0;z-index:1260;background:var(--parchment2);color:var(--ink);font-family:var(--ui-font);display:flex;flex-direction:column;}
body.tprg-open #reviewModal,body.tprg-open #shareModal{z-index:1300;}
.tprg-bar{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 14px;padding-top:env(safe-area-inset-top);background:var(--chrome,#17191c);color:var(--on-ink,#e8e9ea);flex:none;position:relative;}
.tprg-b{height:36px;min-width:36px;padding:0 12px;border-radius:7px;border:1px solid rgba(255,255,255,.22);background:transparent;color:inherit;font:500 13px var(--ui-font);cursor:pointer;}
.tprg-b:hover{border-color:rgba(255,255,255,.5);}
.tprg-t{font-size:16px;font-weight:600;white-space:nowrap;}
.tprg-who{display:flex;align-items:center;gap:4px;position:relative;}
.tprg-step{padding:0;width:36px;font-size:16px;}
.tprg-pick{height:36px;min-width:260px;max-width:46vw;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;border-radius:7px;border:1px solid rgba(255,255,255,.45);background:var(--chrome-2,#26292e);color:#fff;font:500 14px var(--ui-font);cursor:pointer;}
.tprg-pick>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tprg-code{font-family:'IBM Plex Mono',monospace;font-size:12px;opacity:.65;}
.tprg-sp{flex:1;}
.tprg-list{position:absolute;top:calc(100% + 6px);left:40px;width:380px;max-width:calc(100vw - 28px);background:var(--chrome-2,#26292e);color:var(--on-ink,#e8e9ea);border:1px solid rgba(255,255,255,.18);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);z-index:5;overflow:hidden;}
.tprg-sheet-h{display:none;}
.tprg-q{display:block;width:calc(100% - 20px);margin:10px;box-sizing:border-box;height:38px;border-radius:7px;border:1px solid rgba(255,255,255,.35);background:var(--chrome-input,#0f1113);color:#fff;padding:0 10px;font:14px var(--ui-font);}
.tprg-opts{max-height:min(55vh,420px);overflow-y:auto;}
.tprg-opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 14px;border:0;background:none;color:inherit;font:14px var(--ui-font);cursor:pointer;}
.tprg-opt>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tprg-opt.hi,.tprg-opt:hover{background:var(--chrome-3,#32363c);}
.tprg-opt.on .tprg-when{font-weight:600;}
.tprg-when{font-size:12px;opacity:.65;white-space:nowrap;}
.tprg-empty{padding:10px 14px;font-size:13px;opacity:.7;font-style:italic;}
.tprg-hint{font-size:12px;opacity:.55;padding:8px 14px 10px;border-top:1px solid rgba(255,255,255,.1);}
.tprg-scroll{flex:1;overflow-y:auto;}
.tprg-note{max-width:1000px;margin:14px auto 0;padding:8px 12px;box-sizing:border-box;width:calc(100% - 28px);font-size:13px;color:var(--ink2);background:var(--surface,#fff);border:1px dashed var(--border2);border-radius:8px;}
.tprg-body{max-width:1000px;margin:0 auto;padding:6px 14px 40px;}
@media (max-width:640px){
  .tprg-wide{display:none;}
  .tprg-step{display:none;}
  .tprg-who{flex:1;min-width:0;}
  .tprg-pick{min-width:0;max-width:none;flex:1;height:40px;}
  .tprg-list{position:fixed;left:0;right:0;bottom:0;top:auto;width:auto;max-width:none;border-radius:16px 16px 0 0;background:var(--parchment,#f5f5f3);color:var(--ink);padding:6px 4px 14px;box-shadow:0 -10px 30px rgba(0,0,0,.3);}
  .tprg-sheet-h{display:flex;justify-content:space-between;align-items:center;padding:8px 10px 0 14px;font-size:16px;}
  .tprg-sheet-h .tprg-b{border-color:var(--border2);color:var(--ink);width:44px;height:44px;}
  .tprg-q{background:var(--surface,#fff);color:var(--ink);border-color:var(--border2);height:46px;font-size:15px;}
  .tprg-opts{max-height:60vh;}
  .tprg-opt{min-height:52px;}
  .tprg-opt.hi,.tprg-opt:hover{background:var(--parchment2,#ecece8);}
  .tprg-hint{display:none;}
}
`;
document.head.appendChild(css);
})();
