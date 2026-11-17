/* ═══════════════════════════════════════════════════════════════════════════
   past.js — TehfizPast — pm4 (17 Nov 2026)

   pm12 (17 Nov): the shade inside the box at 5%.

   pm11 (17 Nov): dots at 85%, and a 10% shade inside the box.

   pm10 (17 Nov): the dots are drawn (SVG): round, 3px, about 8px apart, at
        60%; a CSS dotted border can only make small dots close together.

   pm9 (17 Nov): dotted border, no shade inside; numbers faint until pointed
        at; the pop-up moves with the page and pauses auto-scroll while open.

   pm8 (17 Nov): numbers smaller and further out, past the box's corner;
        the box's border at 50%.

   pm7 (17 Nov): every past mark is a box drawn BEHIND the text (the letters and
        their vowel marks stay on top; an outline drew over them), one box around
        all the words of a mistake across several (one per line where it
        wraps), its number on the box's corner, above the text so it can be
        tapped. Before: a mistake across several words is one box around all of them
        (one per line where it wraps), its number on the box's corner; every
        outline is softer (70% colour) with more room around the word.

   pm6 (17 Nov, found on a real student):
        · a mistake across several words (wordPos…wordPosEnd) outlines every
          word of it, with the number on its first word; before, only the
          first word was marked;
        · a spot test hears the pages of its spots, not its whole range: one
          spot test over a juz no longer counts as reciting all 20 pages and
          pushing real recitations out of "the last 3";
        · a lesson also heard every page it has a mistake on, so mistakes
          outside its segment's range (an end left unset, older lessons) are
          no longer dropped.

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
const VERSION = 'pm12';
const KEY = 'tehfiz_past';
const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let opt = (() => { try { return Object.assign({ on: false, n: 3, hifz: true, taj: true, rep2: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return { on: false, n: 3, hifz: true, taj: true, rep2: false }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch (_) {} };

let sid = null, server = [], index = new Map(), mo = null, poll = null, timer = null, fetching = false;
let spans = new Map();   // pm7: "s:a:from-to" -> {surah, ayah, a, b, lessons:Set, worst}
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
// The pages a lesson heard: a recited part's whole range; a spot test only
// the pages of its spots (pm6); and every page it has a mistake on (pm6).
function pagesOf(s) {
  const out = new Set();
  const spotPages = (spots) => (spots || []).forEach((x) => { if (x && x.surah && x.ayah) out.add(pageForVerse(+x.surah, +x.ayah)); });
  (s.segments || []).forEach((sg) => {
    try {
      if (sg.mode === 'spot') return spotPages(sg.spots);
      const o = segOrdered(sg); if (!keyValid(o.startKey) || !keyValid(o.endKey)) return;
      const [a1, b1] = o.startKey.split(':').map(Number), [a2, b2] = o.endKey.split(':').map(Number);
      for (let p = pageForVerse(a1, b1); p <= pageForVerse(a2, b2); p++) out.add(p);
    } catch (_) {}
  });
  if (s.spotTest && s.spotTest.spots) spotPages(s.spotTest.spots);            // lessons from before segments
  (s.mistakes || []).forEach((m) => { if (m && m.surah && m.ayah) out.add(pageForVerse(+m.surah, +m.ayah)); });
  return out;
}
function build() {
  index = new Map(); spans = new Map();
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
      // pm6: every word of a mistake across several words; the number goes on
      // its first word only (head), the others are outlined.
      const a = +m.wordPos, b = Math.max(a, +(m.wordPosEnd || a));
      {              // pm7: every mark, one word or several, as a box
        const sk = m.surah + ':' + m.ayah + ':' + a + '-' + b;
        let sp = spans.get(sk);
        if (!sp) spans.set(sk, sp = { surah: m.surah, ayah: m.ayah, a, b, lessons: new Set(), worst: null });
        sp.lessons.add(i);
        if (!taj && (!sp.worst || sevRank(m.correction) > sevRank(sp.worst.m.correction))) sp.worst = { m, cfg };
      }
      for (let w = a; w <= b; w++) {
        const k = m.surah + ':' + m.ayah + ':' + w;
        let e = index.get(k);
        if (!e) index.set(k, e = { word: m.word || '', marks: [], lessons: new Set(), heads: new Set(), worst: null, hifz: false });
        e.marks.push({ m, s: x.s, t: x.t, taj, cfg });
        e.lessons.add(i);
        if (a === b) e.single = true;   // pm7: outlined on its own; else inside a box
        if (!taj) { e.hifz = true; if (!e.worst || sevRank(m.correction) > sevRank(e.worst.m.correction)) e.worst = { m, cfg }; }
      }
    });
  });
  if (opt.rep2) {
    for (const [k, e] of index) if (e.lessons.size < 2) index.delete(k);
    for (const [k, sp] of spans) if (sp.lessons.size < 2) spans.delete(k);
  }
}

/* ── drawing ────────────────────────────────────────────────────────────── */
function clear() {
  document.querySelectorAll('[data-pm]').forEach((w) => { w.removeAttribute('data-pm'); w.style.removeProperty('--pm-c'); w.classList.remove('pm-past', 'pm-in'); });
  clearBoxes();
}
const colOf = (worst) => (worst ? sevForMistake(worst.m, worst.cfg).color : 'var(--ink)');
function paint() {
  clear();
  if (!opt.on || !spans.size) return;
  drawBoxes();
}
/* pm7: one box per multi-word mistake (per line where it wraps), drawn over
   the page and never in the way of a tap. Only for pages on screen: measuring
   words on a page the browser has skipped would make it lay that page out. */
function clearBoxes() { document.querySelectorAll('.pm-span-box,.pm-span-n').forEach((b) => b.remove()); }
function drawBoxes() {
  clearBoxes();
  if (!opt.on || !spans.size) return;
  const pc = document.getElementById('pageContent'); if (!pc) return;
  const vr = pc.getBoundingClientRect();
  const onScreen = new Set([...pc.querySelectorAll('.mushaf-page')].filter((pg) => {
    const r = pg.getBoundingClientRect(); return r.bottom > vr.top - 400 && r.top < vr.bottom + 400;
  }));
  spans.forEach((sp) => {
    const words = [];
    for (let w = sp.a; w <= sp.b; w++) {
      const el = pc.querySelector('[data-surah="' + sp.surah + '"][data-ayah="' + sp.ayah + '"][data-pos="' + w + '"]');
      if (el && (!onScreen.size || onScreen.has(el.closest('.mushaf-page')))) words.push(el);
    }
    if (!words.length) return;
    const host = words[0].offsetParent || pc, hr = host.getBoundingClientRect();
    // Group by line, then one box around each line's words.
    const lines = [];
    words.forEach((el) => {
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const L = lines.find((l) => Math.abs(l.top - r.top) < r.height * 0.5);
      if (L) { L.left = Math.min(L.left, r.left); L.right = Math.max(L.right, r.right); L.top = Math.min(L.top, r.top); L.bottom = Math.max(L.bottom, r.bottom); L.els.push(el); }
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, els: [el] });
    });
    const col = colOf(sp.worst), head = words.find((el) => +el.dataset.pos === sp.a) || words[0];
    // Several marks on one word (different spans) stack their numbers.
    lines.forEach((L, li) => {
      const x = L.left - hr.left + host.scrollLeft - 4, y = L.top - hr.top + host.scrollTop - 3;
      const b = document.createElement('div'), bw = L.right - L.left + 8, bh = L.bottom - L.top + 6;
      b.className = 'pm-span-box';
      b.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + bw + 'px;height:' + bh + 'px;--pm-c:' + col;
      // pm10: round dots along a rounded rectangle.
      b.innerHTML = '<svg width="' + bw + '" height="' + bh + '" aria-hidden="true"><rect x="1.5" y="1.5" width="' + Math.max(0, bw - 3) +
        '" height="' + Math.max(0, bh - 3) + '" rx="7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 8"/></svg>';
      host.appendChild(b);
      // The number on the line that holds the mistake's first word, above the text.
      if (L.els.includes(head) || (li === 0 && !lines.some((z) => z.els.includes(head)))) {
        const n = document.createElement('span');
        n.className = 'pm-span-n'; n.textContent = sp.lessons.size;
        // pm8: past the box's bottom-left corner, mostly outside it.
        n.style.cssText = 'left:' + (x - 13) + 'px;top:' + (y + (L.bottom - L.top + 6) - 4) + 'px;--pm-c:' + col;
        n.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); pop(head, sp); });
        host.appendChild(n);
      }
    });
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
  const w = e.target.closest && e.target.closest('[data-pm]'); if (!w || !w.getAttribute('data-pm')) return;   // pm6: no number, no badge
  const r = w.getBoundingClientRect();
  // The badge sits at the word's bottom-left corner (see .pm-past::after).
  const inBadge = e.clientX >= r.left - 13 && e.clientX <= r.left + 15 && e.clientY >= r.bottom - 13 && e.clientY <= r.bottom + 11;
  if (!inBadge) return;
  e.preventDefault(); e.stopPropagation();
  pop(w);
}
function pop(w, sp) {
  close();
  const k = w.dataset.surah + ':' + w.dataset.ayah + ':' + w.dataset.pos, e = index.get(k); if (!e) return;
  // pm7: from a box, the marks of that span; from a word, its own marks.
  const marks = e.marks.filter((x) => {
    const a = +x.m.wordPos, b = Math.max(a, +(x.m.wordPosEnd || a));
    return sp ? (a === sp.a && b === sp.b) : (a === b || !e.single);
  }).sort((a, b) => b.t - a.t);
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
  // pm9: placed against the word, and kept there as the page scrolls; the
  // side (below or above) is chosen once, so it does not jump.
  const pw = el.offsetWidth, ph = el.offsetHeight, r0 = w.getBoundingClientRect();
  const below = r0.bottom + 14 + ph < window.innerHeight;
  const place = () => {
    const r = w.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
    el.style.top = (below ? r.bottom + 14 : r.top - ph - 8) + 'px';
  };
  place();
  const pc = document.getElementById('pageContent');
  if (pc) { pc.addEventListener('scroll', place, { passive: true }); el._unplace = () => pc.removeEventListener('scroll', place); }
  window.addEventListener('resize', place);
  const unplace0 = el._unplace; el._unplace = () => { if (unplace0) unplace0(); window.removeEventListener('resize', place); };
  // pm9: auto-scroll waits while the history is open, as it does for the mark form.
  if (typeof autoScrollState !== 'undefined' && autoScrollState.active) { autoScrollState.pausedQuickForm = true; el._paused = true; }
  el.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-pm-act]'); if (!a) return;
    close();
    if (a.dataset.pmAct === 'mark' && typeof wordTapped === 'function') wordTapped(w, false);
    if (a.dataset.pmAct === 'test' && window.TehfizPast.testHere) window.TehfizPast.testHere(+w.dataset.surah, +w.dataset.ayah);
  });
}
function close() {
  const p = document.getElementById('pmPop'); if (!p) return;
  if (p._unplace) p._unplace();
  // Resume auto-scroll, unless the mark form has taken over the pause.
  if (p._paused && typeof autoScrollState !== 'undefined') {
    const qf = document.getElementById('quickForm');
    if (!qf || qf.classList.contains('hidden')) autoScrollState.pausedQuickForm = false;
  }
  p.remove();
}
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
  if (pc && !mo) {
    const ours = (n) => n.nodeType === 1 && n.classList && (n.classList.contains('pm-span-box') || n.classList.contains('pm-span-n'));
    mo = new MutationObserver((list) => {
      if (list.every((r) => [...r.addedNodes, ...r.removedNodes].every(ours))) return;   // our own boxes
      repaint();
    });
    mo.observe(pc, { childList: true, subtree: true });
    // Boxes follow zoom and the pages coming into view (pm7).
    let bt = null; const later = () => { clearTimeout(bt); bt = setTimeout(drawBoxes, 150); };
    pc.addEventListener('scroll', later, { passive: true });
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(later); ro.observe(pc); if (pc.firstElementChild) ro.observe(pc.firstElementChild); }
  }
  if (!poll) poll = setInterval(() => { if (curSid() !== sid) refresh(); }, 1500);
}
let ro = null;
function stop() { if (ro) { ro.disconnect(); ro = null; } if (mo) { mo.disconnect(); mo = null; } if (poll) { clearInterval(poll); poll = null; } }

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
.pm-past[data-pm=""]::after{display:none;}
.pm-past{position:relative;outline:2px solid color-mix(in srgb,var(--pm-c,var(--ink)) 70%,transparent);outline-offset:3px;border-radius:6px;}
.pm-past.pm-in{outline:none;}
.pm-span-box{position:absolute;pointer-events:none;z-index:-1;border-radius:8px;
  color:color-mix(in srgb,var(--pm-c,var(--ink)) 85%,transparent);background:color-mix(in srgb,var(--pm-c,var(--ink)) 5%,transparent);}
.pm-span-box svg{display:block;overflow:visible;}
.pm-span-n{position:absolute;z-index:4;opacity:.4;transition:opacity .15s;min-width:10px;height:14px;padding:0 3px;pointer-events:auto;cursor:pointer;
  font:600 10px/14px 'IBM Plex Mono',monospace;color:var(--pm-c,var(--ink));background:var(--surface,#fff);
  border:1.5px solid var(--pm-c,var(--ink));border-radius:9px;text-align:center;direction:ltr;}
.pm-span-n:hover,.pm-span-n:focus-visible{opacity:1;}
.pm-past::after{content:attr(data-pm);position:absolute;bottom:-13px;left:-11px;min-width:12px;height:16px;padding:0 4px;
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
