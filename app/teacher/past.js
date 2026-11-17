/* ═══════════════════════════════════════════════════════════════════════════
   past.js — TehfizPast — pm4 (17 Nov 2026)

   pm5: the controls say a tap on the number opens the history and a tap on
        the word marks it (decided 17 Nov).

   pm4: all of the student's lessons, page by page (tehfizListAll), not the first 500.

   pm3: the controls live in Settings → Display and in View (the menu item went,
        decided 17 Nov); bar() is exported so Settings can refresh them.

   pm2: lessonsFor(id) and pagesOf(lesson) for weak-place spots (spot-weak.js),
        which need the same lessons whether or not past mistakes are shown.

   Past mistakes on the teacher's mushaf (stage 6, part 1; mock-ups 2b and 2d,
   option B chosen 16 Nov).

   · A switch, off by default and remembered on this device: View → Past
     mistakes (desktop), Menu → Past mistakes (phone), or the P key. It works
     whenever the lesson has a student, spot test or not (decided 16 Nov).
   · Which: that student's earlier lessons, on this device and on the server
     (lessons from other devices), never the lesson in progress. How far back
     is counted in HEARINGS of each page, not in time (decided 16 Nov): the
     last 1, 3 (default) or 5 lessons that recited that page, or all of them.
     Hifz and Tajweed can each be left out, and "only places wrong 2+ times".
   · How: this lesson's marks stay filled, as now. A word wrong before gets an
     OUTLINE in the worst level it reached (ink for tajweed, which has no
     level) and a badge with the number of separate lessons it was wrong in,
     1 included. Tapping the badge opens the details (as in the student
     viewer) with Mark again; tapping the word itself still marks it.
   · Drawn only. Past marks never enter this lesson's count, strength or
     report, and are never sent: nothing here writes to the lesson.

   Own namespace, storage (tehfiz_past), DOM (#pmPop, #pmSheet, .pm-*) and
   CSS. Reads the app's globals at run time: TehfizSync, wordTapped,
   _currentSessionId, segOrdered, keyAbs, pageForVerse, sevForMistake,
   mTypeLabel, mCorrLabel, isTajweedMistake, tajweedMarkText, sessionDateText,
   sessionNameOf, METRICS_MODEL, tehfizFetchPayloads, showToast.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const VERSION = 'pm5';
const KEY = 'tehfiz_past';
const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let opt = (() => { try { return Object.assign({ on: false, n: 3, hifz: true, taj: true, rep2: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return { on: false, n: 3, hifz: true, taj: true, rep2: false }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch (_) {} };

let sid = null, server = [], index = new Map(), mo = null, poll = null, timer = null, fetching = false;
const sync = () => window.TehfizSync || null;
const curSid = () => { const S = sync(); return S && S.currentStudentId ? S.currentStudentId() : null; };

/* ── the lessons ────────────────────────────────────────────────────────── */
async function fetchRows(id) {
  const S = sync();
  if (!S || !S.api || !id) return [];
  try {
    const rows = await tehfizListAll(S.api, '/api/sessions?studentId=' + encodeURIComponent(id));   // pm4: every page (A6)
    const got = await tehfizFetchPayloads(S.api, rows.map((r) => r.id), '/api/sessions/payloads',
      (x) => '/api/sessions/' + encodeURIComponent(x) + '/payload');
    return [...got.values()];
  } catch (_) { return []; }   /* offline or signed out: this device's lessons only */
}
async function fetchServer(id) {
  server = [];
  if (!id) return;
  fetching = true;
  const rows = await fetchRows(id);
  if (id === sid) server = rows;
  fetching = false;
}
function merge(id, rows) {
  const S = sync(); if (!id || !S) return [];
  const byId = new Map();
  rows.forEach((s) => byId.set(String(s.id), s));
  (S.localSessionsFor ? S.localSessionsFor(id) : []).forEach((s) => byId.set(String(s.id), s));   // device copy wins
  const now = typeof _currentSessionId !== 'undefined' ? String(_currentSessionId) : '';
  byId.delete(now);                                                                                  // never the lesson in progress
  return [...byId.values()];
}
function lessons() { return merge(sid, server); }
// For other modules: this student's earlier lessons, fetched once per student
// whether or not past mistakes are being shown.
let other = { id: null, rows: null };
async function lessonsFor(id) {
  if (!id) return [];
  if (window.TehfizStore) await TehfizStore.ready;   // pm4: the device's filed lessons too
  if (opt.on && id === sid && server.length) return lessons();
  if (other.id !== id || !other.rows) other = { id, rows: await fetchRows(id) };
  return merge(id, other.rows);
}

/* ── which marks, per word ──────────────────────────────────────────────── */
const sevRank = (c) => ((window.METRICS_MODEL && METRICS_MODEL.focus && METRICS_MODEL.focus.severityOrder) || { c0: 0, c4: 1, c1: 2, c2: 3, c3: 4 })[c] ?? 0;
function pagesOf(s) {          // the pages a lesson recited, from its parts
  const out = new Set();
  (s.segments || []).forEach((sg) => {
    try {
      const o = segOrdered(sg); if (!keyValid(o.startKey) || !keyValid(o.endKey)) return;
      const [a1, b1] = o.startKey.split(':').map(Number), [a2, b2] = o.endKey.split(':').map(Number);
      for (let p = pageForVerse(a1, b1); p <= pageForVerse(a2, b2); p++) out.add(p);
    } catch (_) {}
  });
  return out;
}
function build() {
  index = new Map();
  if (!opt.on || !sid) return;
  const L = lessons().map((s) => ({ s, t: +(_sessDate(s) || 0), pages: pagesOf(s) })).sort((a, b) => b.t - a.t);
  // The last N hearings of each page: the lessons allowed to speak for it.
  const allowed = new Map();     // page -> Set(lesson index)
  if (opt.n) {
    const seen = new Map();
    L.forEach((x, i) => x.pages.forEach((p) => {
      const k = seen.get(p) || 0; if (k < opt.n) { seen.set(p, k + 1); (allowed.get(p) || allowed.set(p, new Set()).get(p)).add(i); }
    }));
  }
  L.forEach((x, i) => {
    const cfg = x.s.typeConfig || null;
    (x.s.mistakes || []).forEach((m) => {
      if (!m || !m.surah || !m.ayah || m.wordPos == null) return;
      const taj = isTajweedMistake(m, cfg);
      if (taj ? !opt.taj : !opt.hifz) return;
      const pg = pageForVerse(m.surah, m.ayah);
      if (opt.n && !(allowed.get(pg) && allowed.get(pg).has(i))) return;
      const k = m.surah + ':' + m.ayah + ':' + m.wordPos;
      let e = index.get(k);
      if (!e) index.set(k, e = { word: m.word || '', marks: [], lessons: new Set(), worst: null, hifz: false });
      e.marks.push({ m, s: x.s, t: x.t, taj, cfg });
      e.lessons.add(i);
      if (!taj) { e.hifz = true; if (!e.worst || sevRank(m.correction) > sevRank(e.worst.m.correction)) e.worst = { m, cfg }; }
    });
  });
  if (opt.rep2) for (const [k, e] of index) if (e.lessons.size < 2) index.delete(k);
}

/* ── drawing ────────────────────────────────────────────────────────────── */
function clear() { document.querySelectorAll('[data-pm]').forEach((w) => { w.removeAttribute('data-pm'); w.style.removeProperty('--pm-c'); w.classList.remove('pm-past'); }); }
function paint() {
  clear();
  if (!opt.on || !index.size) return;
  document.querySelectorAll('#pageContent [data-surah][data-ayah][data-pos]').forEach((w) => {
    const e = index.get(w.dataset.surah + ':' + w.dataset.ayah + ':' + w.dataset.pos);
    if (!e) return;
    w.classList.add('pm-past');
    w.setAttribute('data-pm', e.lessons.size);
    w.style.setProperty('--pm-c', e.worst ? sevForMistake(e.worst.m, e.worst.cfg).color : 'var(--ink)');
  });
}
const repaint = () => { clearTimeout(timer); timer = setTimeout(paint, 120); };
async function refresh(force) {
  const now = curSid();
  if (!opt.on) { sid = now; clear(); return; }
  if (now !== sid || force) { sid = now; server = []; build(); paint(); if (sid) { await fetchServer(sid); } }
  build(); paint(); bar();
}

/* ── the badge: a tap on it opens the details, a tap on the word marks it ── */
function onBadge(e) {
  const w = e.target.closest && e.target.closest('[data-pm]'); if (!w) return;
  const r = w.getBoundingClientRect();
  // The badge sits at the word's bottom-left corner (see .pm-past::after).
  const inBadge = e.clientX >= r.left - 10 && e.clientX <= r.left + 18 && e.clientY >= r.bottom - 11 && e.clientY <= r.bottom + 13;
  if (!inBadge) return;
  e.preventDefault(); e.stopPropagation();
  pop(w);
}
function pop(w) {
  close();
  const k = w.dataset.surah + ':' + w.dataset.ayah + ':' + w.dataset.pos, e = index.get(k); if (!e) return;
  const marks = e.marks.slice().sort((a, b) => b.t - a.t);
  const col = e.worst ? sevForMistake(e.worst.m, e.worst.cfg).color : 'var(--ink)';
  const el = document.createElement('div');
  el.id = 'pmPop'; el.className = 'pm-pop'; el.setAttribute('role', 'dialog');
  el.style.setProperty('--pm-c', col);
  el.innerHTML = `<div class="pm-w" dir="rtl">${E(e.word || marks[0].m.word || '')}</div>` +
    (e.lessons.size > 1 ? `<div class="pm-warn">⚠ Wrong here in ${e.lessons.size} separate lessons</div>` : '<div class="pm-sub">Wrong here once before</div>') +
    marks.map((x) => {
      const lvl = x.taj ? '' : String(mCorrLabel(x.m, x.cfg) || '');
      const what = x.taj ? ((tajweedMarkText(x.m.subrule) || {}).text || mTypeLabel(x.m, x.cfg)) : mTypeLabel(x.m, x.cfg);
      return `<div class="pm-item"><span class="pm-type">${E(what)}</span>` +
        (lvl ? `<span class="pm-lvl" style="color:${sevForMistake(x.m, x.cfg).color}">${E(lvl)}</span>` : '<span class="pm-lvl" style="color:var(--tajweed)">Tajweed</span>') +
        (x.m.note ? `<span class="pm-note">“${E(x.m.note)}”</span>` : '') +
        `<span class="pm-when">${E(partOf(x.s, x.m))} · ${E(sessionDateText(x.s))}</span></div>`;
    }).join('') +
    '<div class="pm-btns"><button type="button" class="pm-b dark" data-pm-act="mark">Mark again</button>' +
    (window.TehfizPast.testHere ? '<button type="button" class="pm-b" data-pm-act="test">Test here</button>' : '') + '</div>';
  document.body.appendChild(el);
  const r = w.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
  el.style.top = (r.bottom + 14 + ph < window.innerHeight ? r.bottom + 14 : Math.max(8, r.top - ph - 8)) + 'px';
  el.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-pm-act]'); if (!a) return;
    close();
    if (a.dataset.pmAct === 'mark' && typeof wordTapped === 'function') wordTapped(w, false);
    if (a.dataset.pmAct === 'test' && window.TehfizPast.testHere) window.TehfizPast.testHere(+w.dataset.surah, +w.dataset.ayah);
  });
}
function close() { const p = document.getElementById('pmPop'); if (p) p.remove(); }
// The part of the lesson the mistake was in ("Al-Mulk 1–30", "… (spot test)"), not the whole lesson's name.
function partOf(s, m) {
  try {
    const v = keyAbs(m.surah + ':' + m.ayah);
    const sg = (s.segments || []).find((g) => {
      if (m.spotId) return g.mode === 'spot' && (g.spots || []).some((x) => x.id === m.spotId);
      if (g.mode === 'spot') return false;
      const o = segOrdered(g); return keyValid(o.startKey) && keyValid(o.endKey) && keyAbs(o.startKey) <= v && v <= keyAbs(o.endKey);
    });
    if (sg) return (sg.rangeLabel || describeRange(segOrdered(sg).startKey, segOrdered(sg).endKey)) + (sg.mode === 'spot' ? ' (spot test)' : '');
  } catch (_) {}
  return sessionNameOf(s);
}

/* ── the controls: View pop (desktop) and a sheet (phone) ───────────────── */
function controlsHTML() {
  const seg = [[1, '1 hearing'], [3, '3'], [5, '5'], [0, 'All']].map(([v, l]) =>
    `<button type="button" class="pm-seg${opt.n === v ? ' on' : ''}" aria-pressed="${opt.n === v}" data-pm-n="${v}">${l}</button>`).join('');
  return `<label class="pm-row"><span class="pm-t"><b>Past mistakes</b><span>This student's earlier lessons, drawn on the page · key P</span></span>` +
      `<input type="checkbox" class="pm-on" ${opt.on ? 'checked' : ''} aria-label="Show past mistakes"></label>` +
    `<div class="pm-more"${opt.on ? '' : ' hidden'}>` +
      `<span class="pm-l">From the last</span><div class="pm-segs" role="group" aria-label="How far back">${seg}</div>` +
      `<span class="pm-hint">${opt.n ? `Counted per page: the last ${opt.n === 1 ? 'time' : opt.n + ' times'} each page was recited, however long ago.` : 'Every earlier lesson.'}</span>` +
      `<div class="pm-chks"><label><input type="checkbox" data-pm-f="hifz" ${opt.hifz ? 'checked' : ''}> Hifz</label>` +
      `<label><input type="checkbox" data-pm-f="taj" ${opt.taj ? 'checked' : ''}> Tajweed</label>` +
      `<label><input type="checkbox" data-pm-f="rep2" ${opt.rep2 ? 'checked' : ''}> Only places wrong 2+ times</label></div>` +
      `<span class="pm-status">${status()}</span>` +
      `<span class="pm-note2">Tap the number beside a word to see what happened there; tap the word itself to mark a mistake, as usual.</span>` +
      `<span class="pm-note2">Shown only. Past mistakes never count in this lesson and are never sent to the student.</span>` +
    `</div>`;
}
function status() {
  if (!opt.on) return '';
  if (!curSid()) return 'Choose the student for this lesson to see their past mistakes.';
  if (fetching) return 'Fetching lessons from other devices…';
  let n = 0; index.forEach(() => n++);
  return n ? `${n} place${n === 1 ? '' : 's'} with past mistakes.` : 'No past mistakes with these settings.';
}
function bar() {
  document.querySelectorAll('.pm-box').forEach((b) => { b.innerHTML = controlsHTML(); });
}
function onControl(e) {
  const box = e.target.closest('.pm-box'); if (!box) return;
  if (e.target.classList.contains('pm-on')) { set({ on: e.target.checked }); return; }
  const n = e.target.closest('[data-pm-n]'); if (n) { set({ n: +n.dataset.pmN }); return; }
  const f = e.target.dataset && e.target.dataset.pmF; if (f) set({ [f]: e.target.checked });
}
function set(p) {
  const wasOn = opt.on;
  Object.assign(opt, p); save();
  if (opt.on && !wasOn) { start(); refresh(true); }
  else if (!opt.on && wasOn) { stop(); clear(); close(); }
  else { build(); paint(); }
  bar();
}
function openSheet() {
  let sh = document.getElementById('pmSheet');
  if (sh) { sh.remove(); return; }
  sh = document.createElement('div');
  sh.id = 'pmSheet'; sh.className = 'pm-sheet-bg';
  sh.innerHTML = '<div class="pm-sheet" role="dialog" aria-label="Past mistakes"><div class="pm-box"></div><button type="button" class="pm-b" data-pm-close>Done</button></div>';
  document.body.appendChild(sh);
  bar();
  sh.addEventListener('click', (e) => { if (e.target === sh || e.target.closest('[data-pm-close]')) sh.remove(); });
}

/* ── life ───────────────────────────────────────────────────────────────── */
function start() {
  const pc = document.getElementById('pageContent');
  if (pc && !mo) { mo = new MutationObserver(repaint); mo.observe(pc, { childList: true, subtree: true }); }
  if (!poll) poll = setInterval(() => { if (curSid() !== sid) refresh(); }, 1500);
}
function stop() { if (mo) { mo.disconnect(); mo = null; } if (poll) { clearInterval(poll); poll = null; } }

function init() {
  // Desktop: a block in the View pop-up, beside zoom and auto-scroll.
  const vp = document.getElementById('tzhViewPop');
  if (vp && !vp.querySelector('.pm-box')) {
    const d = document.createElement('div'); d.className = 'view-controls pm-box pm-in-view'; vp.appendChild(d);
  }
  document.addEventListener('change', onControl);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-pm-n]')) onControl(e); });
  document.addEventListener('click', onBadge, true);      // before the word's own tap
  document.addEventListener('click', (e) => { if (!e.target.closest('#pmPop') && !e.target.closest('[data-pm]')) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); const s = document.getElementById('pmSheet'); if (s) s.remove(); return; }
    // P: only when no form or dialog is open and nothing is being typed in.
    if (e.code !== 'KeyP' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    const qf = document.getElementById('quickForm');
    if ((qf && !qf.classList.contains('hidden')) || document.querySelector('.modal-bg.open')) return;
    e.preventDefault();
    set({ on: !opt.on });
    if (typeof showToast === 'function') showToast(opt.on ? 'Past mistakes on' : 'Past mistakes off');
  });
  bar();
  if (opt.on) { start(); refresh(true); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

window.TehfizPast = { set, openSheet, isOn: () => opt.on, refresh: () => refresh(true), version: VERSION, testHere: null, lessonsFor, pagesOf, sevRank, bar };

/* ── styles (.pm-*) ─────────────────────────────────────────────────────── */
const css = document.createElement('style');
css.textContent = `
.pm-past{position:relative;outline:2px solid var(--pm-c,var(--ink));outline-offset:1px;border-radius:4px;}
.pm-past::after{content:attr(data-pm);position:absolute;bottom:-11px;left:-8px;min-width:12px;height:16px;padding:0 4px;
  font:600 11px/16px 'IBM Plex Mono',monospace;color:var(--pm-c,var(--ink));background:var(--surface,#fff);
  border:1.5px solid var(--pm-c,var(--ink));border-radius:9px;text-align:center;z-index:3;cursor:pointer;direction:ltr;}
.pm-pop{position:fixed;z-index:1500;width:290px;max-height:60vh;overflow:auto;background:var(--surface,#fff);color:var(--ink);border:1px solid var(--pm-c);
  border-left:4px solid var(--pm-c);border-radius:8px;padding:8px 12px;font:13px/1.55 var(--ui-font);box-shadow:0 8px 24px rgba(23,25,28,.18);}
.pm-w{font-family:'UthmanicHafs','Scheherazade New',serif;font-size:22px;margin-bottom:2px;}
.pm-warn{font-size:12px;color:var(--amber,#8a5a00);font-weight:700;}
.pm-sub{font-size:12px;color:var(--ink3);}
.pm-item{display:flex;flex-direction:column;border-top:1px solid var(--border);margin-top:6px;padding-top:4px;}
.pm-type{font-weight:600;font-size:12.5px;}
.pm-lvl{font:600 12px 'IBM Plex Mono',monospace;}
.pm-note{font-size:12px;color:var(--ink2);font-style:italic;}
.pm-when{font:11px 'IBM Plex Mono',monospace;color:var(--ink3);}
.pm-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:6px;margin-top:8px;}
.pm-b{min-height:38px;border-radius:7px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;}
.pm-b.dark{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.pm-box{display:flex;flex-direction:column;gap:8px;}
.pm-in-view{border-top:1px solid rgba(255,255,255,.12);padding-top:10px;margin-top:4px;min-width:290px;}
.pm-row{display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;}
.pm-t{display:flex;flex-direction:column;}
.pm-t span{font-size:12px;opacity:.75;}
.pm-on{width:40px;height:22px;accent-color:currentColor;cursor:pointer;}
.pm-more{display:flex;flex-direction:column;gap:7px;}
.pm-more[hidden]{display:none;}
.pm-l{font-size:12px;opacity:.75;}
.pm-segs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid currentColor;border-radius:8px;overflow:hidden;opacity:.95;}
.pm-seg{min-height:34px;border:0;background:transparent;color:inherit;font:13px var(--ui-font);cursor:pointer;}
.pm-seg+.pm-seg{border-left:1px solid rgba(127,127,127,.35);}
.pm-seg.on{color:var(--chrome,#17191c);background:var(--on-ink,#e8e9ea);font-weight:600;}
.pm-hint,.pm-status,.pm-note2{font-size:12px;opacity:.8;}
.pm-note2{opacity:.7;}
.pm-chks{display:flex;flex-wrap:wrap;gap:6px;}
.pm-chks label{display:flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid rgba(127,127,127,.45);border-radius:7px;font-size:12.5px;cursor:pointer;}
.pm-sheet-bg{position:fixed;inset:0;z-index:1450;background:rgba(23,25,28,.45);display:flex;align-items:flex-end;}
.pm-sheet{width:100%;box-sizing:border-box;background:var(--parchment,#f5f5f3);color:var(--ink);border-radius:16px 16px 0 0;padding:16px 16px 20px;display:flex;flex-direction:column;gap:12px;}
.pm-sheet .pm-seg.on,.pm-in-settings .pm-seg.on{background:var(--ink);color:var(--parchment);}
.pm-in-settings{border-top:.5px solid var(--border);padding-top:10px;margin-top:4px;color:var(--ink);}
.pm-in-settings .pm-row{display:flex;flex-direction:row;margin:0;font-weight:400;}
.pm-in-settings .pm-t b{font-size:13px;color:var(--ink);font-weight:600;}
.pm-in-settings .pm-t span{font-size:12px;color:var(--ink3);opacity:1;}
.pm-in-settings .pm-on{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:40px;height:22px;margin:0;border-radius:11px;background:var(--parchment3);transition:background .2s;}
.pm-in-settings .pm-on::before{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s;}
.pm-in-settings .pm-on:checked{background:var(--ink);}
.pm-in-settings .pm-on:checked::before{transform:translateX(18px);}
.pm-in-settings .pm-chks label{display:flex;margin:0;font-weight:400;}
`;
document.head.appendChild(css);
})();
