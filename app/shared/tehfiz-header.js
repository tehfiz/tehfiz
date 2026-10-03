/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-header.js — TehfizHeader — h2
   Loaded by both apps from /app/shared/tehfiz-header.js?v=h2, after
   tehfiz-shared.js. Styles live in tehfiz-shared.css under .tzh-.

   The one-row header. The bar's own markup is in each app (it has to paint
   before any script runs); this module owns the three things that open from
   it:
     · the menu      — a popover under the Menu button on a wide screen, a
                       drawer from the left on a compact one
     · the View pop  — desktop only; holds the app's existing zoom and
                       auto-scroll controls, moved into #tzhViewPop by markup
     · the Go to sheet — compact only; the position button opens it

   Narrow interface. Each app calls TehfizHeader.init(cfg) once:
     cfg.items()     → [{id, label, icon, run, group:'main'|'tools'|'foot',
                         kbd?, hidden?}]   rebuilt on every open, so an item
                         can depend on state (signed in, installable…)
     cfg.who()       → {name, sub, state:'ok'|'warn'|'off', action?:{label,run}}
     cfg.shortcuts() → [{label, surah, ayah}]   optional, Go to sheet
   and it reads these app globals, all present in both apps:
     SURAH_NAMES, AYAH_COUNTS, JUZ_PAGES (shared), #juzSel, #jumpPageInput,
     jumpToPageFromInput, navigateToVerse, changeMushafZoom,
     fitMushafToScreen, _posNavLast*, _posNavNavigating, _renderPosNavLabel,
     _posNavWaitForScrollArrival, isCompactViewport
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_HEADER_VERSION = 'h2';

let cfg = { items: () => [], who: () => null, shortcuts: () => [] };
let menuOpen = false, viewOpen = false, gotoOpen = false;

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function compact() { return document.body.classList.contains('compact-ui'); }

/* Stroke icons, 24-unit grid. Plain SVG rather than emoji so they take the
   text colour and look the same on every platform. */
const ICONS = {
  students: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 4a4 4 0 0 1 0 8M22 21v-1a5 5 0 0 0-3-4.6"/>',
  sessions: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  invoices: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  import:   '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  help:     '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  tour:     '<path d="M3 11l18-8-8 18-2-8z"/>',
  hide:     '<path d="M18 15l-6-6-6 6"/>',
  install:  '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/>',
  account:  '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/>',
  sync:     '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 3v6h-6M3 21v-6h6"/>',
  panel:    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  external: '<path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  prev:     '<path d="M15 6l-6 6 6 6"/>',
  next:     '<path d="M9 6l6 6-6 6"/>',
};
function icon(name, size) {
  const s = size || 20;
  return '<svg class="tzh-ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* ── shared scaffolding ─────────────────────────────────────────────────── */
function ensureRoot() {
  let r = $('tzhRoot');
  if (!r) {
    r = document.createElement('div');
    r.id = 'tzhRoot';
    document.body.appendChild(r);
    r.addEventListener('click', onRootClick);
    r.addEventListener('change', onRootChange);
    r.addEventListener('keydown', onRootKey);
  }
  return r;
}

function closeAll() {
  if (menuOpen) closeMenu();
  if (viewOpen) closeView();
  if (gotoOpen) closeGoto();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (menuOpen || viewOpen || gotoOpen)) { e.stopPropagation(); closeAll(); }
}, true);

/* An outside press closes a desktop popover. pointerdown, matching the
   position editor, so a press that starts a drag elsewhere still closes it. */
document.addEventListener('pointerdown', (e) => {
  if (viewOpen && !e.target.closest('#tzhViewPop, #tzhViewBtn')) closeView();
  if (menuOpen && !compact() && !e.target.closest('.tzh-menu, #tzhMenuBtn')) closeMenu();
}, true);

/* ── menu ───────────────────────────────────────────────────────────────── */
function menuHtml() {
  const items = (cfg.items() || []).filter((x) => x && !x.hidden);
  const who = cfg.who ? cfg.who() : null;
  const byGroup = (g) => items.filter((x) => (x.group || 'tools') === g);
  const row = (x) =>
    '<button class="tzh-mi" type="button" data-tzh-item="' + esc(x.id) + '">' +
      icon(x.icon || 'next') + '<span class="tzh-mi-l">' + esc(x.label) + '</span>' +
      (x.kbd ? '<kbd class="tzh-kbd">' + esc(x.kbd) + '</kbd>' : '') +
    '</button>';
  const sep = '<div class="tzh-sep-h" role="separator"></div>';

  const head = '<div class="tzh-mh">' +
    '<div class="tzh-mh-top"><span class="tzh-mh-brand">Tehfīz</span>' +
      '<button class="tzh-x" type="button" data-tzh="close" aria-label="Close menu">' + icon('close', 18) + '</button></div>' +
    (who
      ? '<div class="tzh-mh-name">' + esc(who.name || '') + '</div>' +
        (who.sub ? '<div class="tzh-mh-sub"><span class="tzh-dot ' + esc(who.state || 'off') + '"></span>' +
          esc(who.sub) + '</div>' : '') +
        (who.action ? '<button class="tzh-mh-act" type="button" data-tzh="who-action">' +
          esc(who.action.label) + '</button>' : '')
      : '') +
  '</div>';

  const view = compact() ? sep +
    '<div class="tzh-mlabel">View</div>' +
    '<div class="tzh-mrow"><span>Text size</span>' +
      '<button class="tzh-step" type="button" data-tzh="zoom" data-d="-1" aria-label="Smaller">−</button>' +
      '<button class="tzh-step" type="button" data-tzh="zoom" data-d="1" aria-label="Larger">+</button>' +
      '<button class="tzh-step tzh-step-w" type="button" data-tzh="fit">Fit</button></div>' +
    (autoscrollOn()
      ? '<div class="tzh-mrow"><span>Auto-scroll speed</span>' +
          '<button class="tzh-step" type="button" data-tzh="speed" data-d="-1" aria-label="Slower">−</button>' +
          '<span class="tzh-speed" id="tzhSpeed">' + esc(speedText()) + '</span>' +
          '<button class="tzh-step" type="button" data-tzh="speed" data-d="1" aria-label="Faster">+</button></div>'
      : '')
    : '';

  const main = byGroup('main'), tools = byGroup('tools'), foot = byGroup('foot');
  return '<div class="tzh-menu" role="menu" aria-label="Menu">' + head +
    '<div class="tzh-mbody">' +
      main.map(row).join('') + view +
      (tools.length ? sep + tools.map(row).join('') : '') +
    '</div>' +
    (foot.length ? '<div class="tzh-mfoot">' + foot.map((x) =>
      x.href
        ? '<a class="tzh-mf" href="' + esc(x.href) + '" target="_blank" rel="noopener">' + esc(x.label) + ' ' + icon('external', 14) + '</a>'
        : '<button class="tzh-mf" type="button" data-tzh-item="' + esc(x.id) + '">' + esc(x.label) + '</button>'
    ).join('') + '</div>' : '') +
  '</div>';
}

function openMenu() {
  closeView(); closeGoto();
  const root = ensureRoot();
  let wrap = $('tzhMenuWrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'tzhMenuWrap'; root.appendChild(wrap); }
  wrap.className = 'tzh-menu-wrap ' + (compact() ? 'is-drawer' : 'is-pop');
  wrap.innerHTML = (compact() ? '<div class="tzh-scrim" data-tzh="close"></div>' : '') + menuHtml();
  if (!compact()) {
    const b = $('tzhMenuBtn').getBoundingClientRect();
    const m = wrap.querySelector('.tzh-menu');
    m.style.top = Math.round(b.bottom + 6) + 'px';
    m.style.left = Math.round(Math.max(8, b.left)) + 'px';
  }
  menuOpen = true;
  $('tzhMenuBtn').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    wrap.classList.add('on');
    const first = wrap.querySelector('.tzh-mi, .tzh-x');
    if (first) first.focus({ preventScroll: true });
  });
}
function closeMenu() {
  const wrap = $('tzhMenuWrap');
  menuOpen = false;
  const b = $('tzhMenuBtn');
  if (b) b.setAttribute('aria-expanded', 'false');
  if (wrap) { wrap.classList.remove('on'); setTimeout(() => { if (!menuOpen) wrap.innerHTML = ''; }, 200); }
}
function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }
function refreshMenu() { if (menuOpen) openMenu(); }

function autoscrollOn() {
  const w = $('tzhAsWrap');
  return !!w && w.style.display !== 'none';
}
function speedText() {
  const l = $('asSpeedLabel');
  const t = l ? l.textContent.trim() : '';
  return t || '1x';
}

/* ── View popover (desktop) ─────────────────────────────────────────────── */
function openView() {
  closeMenu();
  const pop = $('tzhViewPop'), btn = $('tzhViewBtn');
  if (!pop || !btn) return;
  const r = btn.getBoundingClientRect();
  pop.hidden = false;
  pop.style.top = Math.round(r.bottom + 6) + 'px';
  pop.style.right = Math.round(Math.max(8, window.innerWidth - r.right)) + 'px';
  viewOpen = true;
  btn.setAttribute('aria-expanded', 'true');
}
function closeView() {
  const pop = $('tzhViewPop'), btn = $('tzhViewBtn');
  viewOpen = false;
  if (pop) pop.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function toggleView() { if (viewOpen) closeView(); else openView(); }

/* ── position ───────────────────────────────────────────────────────────── */
function curPage() { const v = parseInt(($('jumpPageInput') || {}).value, 10); return v >= 1 && v <= 604 ? v : 1; }
function curJuz() {
  const v = parseInt(($('juzSel') || {}).value, 10);
  if (v >= 1) return v;
  const pg = curPage();
  for (let j = JUZ_PAGES.length - 1; j >= 0; j--) if (pg >= JUZ_PAGES[j]) return j + 1;
  return 1;
}
function curVerse() {
  const s = (typeof _posNavLastSurah !== 'undefined' && _posNavLastSurah) || 0;
  const a = (typeof _posNavLastAyah !== 'undefined' && _posNavLastAyah) || 0;
  return { s, a };
}

/* Called by _renderPosNavLabel (shared) whenever the live position moves, and
   by the page steppers. Writes the compact position button. */
function syncPosition() {
  const main = $('tzhGotoMain'), sub = $('tzhGotoSub');
  if (!main) return;
  const { s, a } = curVerse();
  main.textContent = s ? (SURAH_NAMES[s - 1] || '') + (a ? ' ' + s + ':' + a : '') : '—';
  if (sub) sub.textContent = 'Juz ' + curJuz() + ' · page ' + curPage();
  if (gotoOpen) {
    const p = $('tzhGtPage');
    if (p && document.activeElement !== p) p.value = curPage();
  }
}

function stepPage(d) {
  const pg = Math.max(1, Math.min(604, curPage() + d));
  if (typeof jumpToPageFromInput === 'function') jumpToPageFromInput(pg);
  const p = $('tzhGtPage'); if (p) p.value = pg;
}

/* Same sequence as confirmPosNavEdit() in the shared file — the label is set to
   the target at once, and live tracking is paused until the scroll arrives. */
async function goVerse(s, a) {
  s = Math.max(1, Math.min(114, s | 0));
  a = Math.max(1, Math.min(AYAH_COUNTS[s - 1] || 1, a | 0));
  _posNavNavigating = true;
  _posNavLastSurah = s;
  _posNavLastAyah = a;
  _renderPosNavLabel(s, a);
  await navigateToVerse(s, a, 1);
  _posNavWaitForScrollArrival(s, a);
  /* Live tracking stays paused until the scroll arrives, and nothing re-reads
     the page once it does — the page number would sit stale until the next
     scroll. Read it once, as soon as tracking resumes. */
  const t0 = Date.now();
  (function settle() {
    if (_posNavNavigating && Date.now() - t0 < 3600) { setTimeout(settle, 150); return; }
    if (typeof updateLivePosition_cheap === 'function') updateLivePosition_cheap();
    syncPosition();
  })();
}

/* ── Go to sheet (compact) ──────────────────────────────────────────────── */
function gotoHtml() {
  const { s, a } = curVerse();
  const surah = s || 1, ayah = a || 1;
  const juzOpts = Array.from(($('juzSel') || { options: [] }).options)
    .filter((o) => o.value)
    .map((o) => '<option value="' + esc(o.value) + '"' + (+o.value === curJuz() ? ' selected' : '') + '>' +
      esc(o.textContent) + '</option>').join('');
  /* Surah is a search box, like the desktop position editor (h2): type a name,
     a number, or a common spelling — surahMatches() in the shared file is the
     same search. The chosen number lives in the hidden #tzhGtSurah. */
  const surBox = '<div class="tzh-sp">' +
    '<input id="tzhGtSurahQ" type="text" autocomplete="off" spellcheck="false" enterkeyhint="next" ' +
      'role="combobox" aria-expanded="false" aria-controls="tzhGtList" aria-label="Surah" ' +
      'placeholder="Type a name or number" value="' + esc(surahText(surah)) + '">' +
    '<input type="hidden" id="tzhGtSurah" value="' + surah + '">' +
    '<div class="tzh-sp-list" id="tzhGtList" role="listbox" hidden></div></div>';
  const sc = (cfg.shortcuts ? cfg.shortcuts() : []) || [];
  return '<div class="tzh-scrim" data-tzh="close"></div>' +
    '<div class="tzh-sheet" role="dialog" aria-modal="true" aria-labelledby="tzhGtTitle">' +
      '<div class="tzh-grab"></div>' +
      '<div class="tzh-sheet-head"><h2 id="tzhGtTitle">Go to</h2>' +
        '<button class="tzh-x tzh-x-light" type="button" data-tzh="close" aria-label="Close">' + icon('close', 16) + '</button></div>' +
      '<label class="tzh-f">Juz<select id="tzhGtJuz">' + juzOpts + '</select></label>' +
      '<div class="tzh-f2">' +
        '<div class="tzh-f"><span>Surah</span>' + surBox + '</div>' +
        '<label class="tzh-f">Ayah<input id="tzhGtAyah" type="number" inputmode="numeric" min="1" max="' +
          (AYAH_COUNTS[surah - 1] || 1) + '" value="' + ayah + '"></label>' +
      '</div>' +
      '<div class="tzh-f"><span>Page</span><div class="tzh-pager">' +
        '<button class="tzh-pg" type="button" data-tzh="page" data-d="-1" aria-label="Previous page">' + icon('prev', 18) + '</button>' +
        '<input id="tzhGtPage" type="number" inputmode="numeric" min="1" max="604" value="' + curPage() + '" aria-label="Page number">' +
        '<button class="tzh-pg" type="button" data-tzh="page" data-d="1" aria-label="Next page">' + icon('next', 18) + '</button>' +
      '</div></div>' +
      (sc.length ? '<div class="tzh-f"><span>This session</span><div class="tzh-chips">' +
        sc.map((x, i) => '<button class="tzh-chip" type="button" data-tzh="sc" data-i="' + i + '">' + esc(x.label) + '</button>').join('') +
        '</div></div>' : '') +
      '<button class="tzh-go" type="button" data-tzh="go" id="tzhGtGo">Go to ' + surah + ':' + ayah + '</button>' +
    '</div>';
}
let _shortcuts = [];
function openGoto() {
  closeMenu(); closeView();
  const root = ensureRoot();
  let wrap = $('tzhGotoWrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'tzhGotoWrap'; wrap.className = 'tzh-goto-wrap'; root.appendChild(wrap); }
  _shortcuts = (cfg.shortcuts ? cfg.shortcuts() : []) || [];
  wrap.innerHTML = gotoHtml();
  gotoOpen = true;
  requestAnimationFrame(() => wrap.classList.add('on'));
}
function closeGoto() {
  const wrap = $('tzhGotoWrap');
  gotoOpen = false;
  if (wrap) { wrap.classList.remove('on'); setTimeout(() => { if (!gotoOpen) wrap.innerHTML = ''; }, 220); }
}
function surahText(n) { return n ? n + '. ' + (SURAH_NAMES[n - 1] || '') : ''; }
let _spHi = 0;
function spRender(q) {
  const list = $('tzhGtList'); if (!list) return;
  const hits = surahMatches(String(q || '').replace(/^\s*\d+\.\s*/, ''), 114);
  _spHi = 0;
  list.innerHTML = hits.length
    ? hits.map((x, i) => '<button type="button" role="option" class="tzh-sp-opt' + (i === 0 ? ' hi' : '') +
        '" data-tzh="sp-pick" data-num="' + x.num + '"><span class="tzh-sp-n">' + x.num + '</span>' +
        '<span class="tzh-sp-name">' + esc(x.name) + '</span><span class="tzh-sp-v">' + AYAH_COUNTS[x.num - 1] + ' v</span></button>').join('')
    : '<div class="tzh-sp-empty">No surah matches</div>';
  list.hidden = false;
  const q2 = $('tzhGtSurahQ'); if (q2) q2.setAttribute('aria-expanded', 'true');
}
function spClose() {
  const list = $('tzhGtList'); if (list) list.hidden = true;
  const q = $('tzhGtSurahQ'), h = $('tzhGtSurah');
  if (q) { q.setAttribute('aria-expanded', 'false'); if (h) q.value = surahText(+h.value); }
}
function spPick(num) {
  const h = $('tzhGtSurah'), a = $('tzhGtAyah');
  if (h) h.value = num;
  if (a) { a.max = AYAH_COUNTS[num - 1] || 1; a.value = 1; }
  spClose(); gotoLabel();
  if (a) { a.focus(); a.select(); }
}
function gotoLabel() {
  const s = +($('tzhGtSurah') || {}).value || 1;
  const a = +($('tzhGtAyah') || {}).value || 1;
  const b = $('tzhGtGo'); if (b) b.textContent = 'Go to ' + s + ':' + a;
}

/* ── events ─────────────────────────────────────────────────────────────── */
function runItem(id) {
  const x = (cfg.items() || []).find((i) => i && i.id === id);
  closeMenu();
  if (x && typeof x.run === 'function') {
    // After the close, so an item that opens a modal is not under the drawer.
    setTimeout(() => { try { x.run(); } catch (e) { console.error('TehfizHeader item', id, e); } }, 0);
  }
}

function onRootClick(e) {
  const it = e.target.closest('[data-tzh-item]');
  if (it) { runItem(it.dataset.tzhItem); return; }
  const t = e.target.closest('[data-tzh]');
  if (!t) return;
  const act = t.dataset.tzh;
  if (act === 'close') { closeAll(); return; }
  if (act === 'who-action') {
    const w = cfg.who && cfg.who();
    closeMenu();
    if (w && w.action && w.action.run) setTimeout(w.action.run, 0);
    return;
  }
  if (act === 'zoom') { changeMushafZoom(+t.dataset.d); return; }
  if (act === 'fit') { fitMushafToScreen(); return; }
  if (act === 'speed') {
    const b = $(+t.dataset.d > 0 ? 'asFaster' : 'asSlower');
    if (b) b.click();
    const sp = $('tzhSpeed'); if (sp) sp.textContent = speedText();
    return;
  }
  if (act === 'page') { stepPage(+t.dataset.d); return; }
  if (act === 'sp-pick') { spPick(+t.dataset.num); return; }
  if (act === 'go') {
    const s = +$('tzhGtSurah').value || 1, a = +$('tzhGtAyah').value || 1;
    closeGoto(); goVerse(s, a); return;
  }
  if (act === 'sc') {
    const x = _shortcuts[+t.dataset.i];
    closeGoto();
    if (x) goVerse(x.surah, x.ayah);
  }
}
function onRootChange(e) {
  const id = e.target.id;
  if (id === 'tzhGtJuz') { closeGoto(); if (typeof goToJuz === 'function') goToJuz(e.target.value); return; }
  if (id === 'tzhGtAyah') { gotoLabel(); return; }
  if (id === 'tzhGtPage') {
    const v = Math.max(1, Math.min(604, parseInt(e.target.value, 10) || 1));
    closeGoto(); jumpToPageFromInput(v);
  }
}
function onRootKey(e) {
  if (e.target.id === 'tzhGtSurahQ') {
    const opts = Array.from(document.querySelectorAll('#tzhGtList .tzh-sp-opt'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!opts.length) return;
      _spHi = Math.max(0, Math.min(opts.length - 1, _spHi + (e.key === 'ArrowDown' ? 1 : -1)));
      opts.forEach((o, i) => o.classList.toggle('hi', i === _spHi));
      opts[_spHi].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opts[_spHi]) spPick(+opts[_spHi].dataset.num);
    }
    return;
  }
  if (e.key !== 'Enter') return;
  if (e.target.id === 'tzhGtAyah') { e.preventDefault(); $('tzhGtGo').click(); }
  if (e.target.id === 'tzhGtPage') { e.preventDefault(); e.target.blur(); }
}
document.addEventListener('input', (e) => {
  if (!e.target) return;
  if (e.target.id === 'tzhGtAyah') gotoLabel();
  if (e.target.id === 'tzhGtSurahQ') spRender(e.target.value);
});
/* Focusing the box empties it and drops the whole list open, so it reads as a
   search rather than a value — the same choice the desktop editor made. */
document.addEventListener('focusin', (e) => {
  if (e.target && e.target.id === 'tzhGtSurahQ') { e.target.value = ''; spRender(''); }
});
/* Leaving without picking puts the current surah back in the box. An option
   tap focuses the option first, so this waits a beat and checks. */
document.addEventListener('focusout', (e) => {
  if (e.target && e.target.id === 'tzhGtSurahQ') setTimeout(() => {
    const a = document.activeElement;
    if (a && a.closest && a.closest('#tzhGtList')) return;
    spClose();
  }, 150);
});

/* Crossing the compact boundary with something open would leave a drawer on
   a desktop or a popover on a phone. Close rather than morph. */
let _wasCompact = null;
window.addEventListener('resize', () => {
  const c = compact();
  if (_wasCompact !== null && c !== _wasCompact) closeAll();
  _wasCompact = c;
});

function init(c) {
  cfg = { ...cfg, ...(c || {}) };
  _wasCompact = compact();
  syncPosition();
}

window.TehfizHeader = {
  init, toggleMenu, openMenu, closeMenu, refreshMenu, toggleView, closeView,
  openGoto, closeGoto, stepPage, goVerse, syncPosition, icon,
  isOpen: () => menuOpen || viewOpen || gotoOpen,
  version: TEHFIZ_HEADER_VERSION,
};
})();
