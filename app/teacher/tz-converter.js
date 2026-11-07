/* ═══════════════════════════════════════════════════════════════════════
   tz-converter.js — TehfizTzConv — tc1
   Loaded by the teacher app only, from /app/teacher/tz-converter.js?v=tc1.

   Your time and a student's, side by side. Opened from the blue time on a
   student in the Students list (v4_349). Two strips of 24 hours, yours and
   theirs, night shaded; drag either and both move, five minutes at a time.
   Opens at now; "Now" and "Next lesson" jump back. Read-only — nothing is
   saved; lesson times are still set in the lesson editor.

     TehfizTzConv.open({ name, tz, next })   next: ms of their next lesson, or null
     TehfizTzConv.close()

   Self-contained:
     namespace  TehfizTzConv
     CSS        .tzc-* (injected once)
     DOM        #tzcRoot, appended to <body>
   Needs TehfizTime (shared/tehfiz-time.js).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_TZCONV_VERSION = 'tc1';
const T = () => window.TehfizTime;
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const H = 3600000, STEP = 5 * 60000;

let st = null;   // {name, tz, next, at}

function css() {
  if ($('tzcCss')) return;
  const el = document.createElement('style'); el.id = 'tzcCss';
  el.textContent =
    '#tzcRoot{position:fixed;inset:0;z-index:1250;display:flex;align-items:flex-end;justify-content:center;background:rgba(23,25,28,.38);}' +
    '#tzcRoot[hidden]{display:none;}' +
    '.tzc-sheet{width:100%;max-width:520px;background:var(--parchment);color:var(--ink);border-radius:16px 16px 0 0;padding:10px 16px 18px;' +
      'padding-bottom:max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:14px;box-shadow:0 -8px 28px rgba(0,0,0,.25);font-family:var(--ui-font);}' +
    '@media (min-width:700px){#tzcRoot{align-items:center;}.tzc-sheet{border-radius:14px;}}' +
    '.tzc-grab{width:40px;height:4px;border-radius:9px;background:var(--parchment3);align-self:center;}' +
    '.tzc-h{display:flex;align-items:center;gap:10px;}.tzc-h b{flex:1;font-size:17px;}' +
    '.tzc-x{width:36px;height:36px;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;font-size:15px;}' +
    '.tzc-lane{display:flex;flex-direction:column;gap:5px;}' +
    '.tzc-lh{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}' +
    '.tzc-lh b{font:600 24px "IBM Plex Mono",monospace;}.tzc-lh span{font-size:13px;color:var(--ink3);text-align:right;}' +
    '.tzc-track{position:relative;height:40px;border:1px solid var(--border2);border-radius:9px;overflow:hidden;cursor:ew-resize;touch-action:none;}' +
    '.tzc-track:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}' +
    '.tzc-track canvas{display:block;width:100%;height:100%;}' +
    '.tzc-now{position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:var(--gold);pointer-events:none;}' +
    '.tzc-note{font-size:13px;color:var(--ink2);line-height:1.5;}' +
    '.tzc-btns{display:flex;gap:8px;flex-wrap:wrap;}' +
    '.tzc-btns button{height:38px;padding:0 14px;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}';
  document.head.appendChild(el);
}

function root() {
  let r = $('tzcRoot');
  if (!r) {
    r = document.createElement('div'); r.id = 'tzcRoot'; r.hidden = true;
    document.body.appendChild(r);
    r.addEventListener('click', onClick);
    r.addEventListener('pointerdown', onDown);
    r.addEventListener('keydown', onKey);
  }
  return r;
}

function cssVar(n, d) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; }

/* 24 hours around st.at; daylight (06–20 there) in gold, night in blue. */
function drawStrip(cv, tz) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  const day = cssVar('--gold-pale', '#f3ead4'), night = cssVar('--spot-blue-bg', '#e1eff5'), ink = cssVar('--ink3', '#888');
  const start = st.at - 12 * H, span = 24 * H;
  for (let k = -13; k <= 13; k++) {
    const p = T().partsIn(st.at + k * H, tz);
    const top = st.at + k * H - p.mi * 60000 - p.s * 1000;       // the start of that hour there
    const x0 = (top - start) / span * w, x1 = (top + H - start) / span * w;
    c.fillStyle = p.h >= 6 && p.h < 20 ? day : night;
    c.fillRect(Math.floor(x0), 0, Math.ceil(x1 - x0) + 1, h);
    c.fillStyle = ink;
    c.fillRect(Math.round(x0), 0, Math.max(1, dpr), p.h % 3 === 0 ? h * 0.35 : h * 0.18);
    if (p.h % 3 === 0) {
      c.font = Math.round(11 * dpr) + 'px "IBM Plex Mono", monospace';
      c.fillText(String(p.h).padStart(2, '0'), x0 + 3 * dpr, h - 6 * dpr);
    }
  }
}

function paint() {
  const r = $('tzcRoot'); if (!r || !st) return;
  const me = T().myTz();
  r.querySelector('[data-k="mt"]').textContent = T().timeText(st.at, me);
  r.querySelector('[data-k="md"]').textContent = T().dayText(st.at, me) + ' · you, ' + T().city(me);
  r.querySelector('[data-k="st"]').textContent = T().timeText(st.at, st.tz);
  r.querySelector('[data-k="sd"]').textContent = T().dayText(st.at, st.tz) + ' · ' + st.name + ', ' + T().city(st.tz);
  r.querySelectorAll('canvas').forEach((cv) => drawStrip(cv, cv.dataset.z === 'me' ? me : st.tz));
}

function open(o) {
  if (!T() || !o || !o.tz || !T().validTz(o.tz)) return;
  css();
  st = { name: o.name || 'Student', tz: o.tz, next: o.next || null, at: Math.round(Date.now() / 60000) * 60000 };
  const r = root();
  r.innerHTML =
    '<div class="tzc-sheet" role="dialog" aria-modal="true" aria-label="' + esc('Your time and ' + st.name + '’s') + '">' +
      '<div class="tzc-grab"></div>' +
      '<div class="tzc-h"><b>' + esc('Your time and ' + st.name + '’s') + '</b>' +
        '<button type="button" class="tzc-x" data-tzc="close" aria-label="Close">✕</button></div>' +
      lane('m', 'me') + lane('s', 'them') +
      '<div class="tzc-note">' + esc(T().city(st.tz) + ' is ' + T().diffText(st.tz) + '.') + ' Drag either strip; the shaded part is night there.</div>' +
      '<div class="tzc-btns"><button type="button" data-tzc="now">Now</button>' +
        (st.next ? '<button type="button" data-tzc="next">' + esc('Next lesson · ' + T().dayText(st.next) + ' ' + T().timeText(st.next)) + '</button>' : '') +
      '</div>' +
    '</div>';
  r.hidden = false;
  paint();
  const x = r.querySelector('.tzc-x'); if (x) x.focus({ preventScroll: true });
}
function lane(k, z) {
  return '<div class="tzc-lane"><div class="tzc-lh"><b data-k="' + k + 't"></b><span data-k="' + k + 'd"></span></div>' +
    '<div class="tzc-track" tabindex="0" role="slider" aria-label="' + (z === 'me' ? 'Your time' : 'Their time') + ' — arrow keys move by 15 minutes">' +
      '<canvas data-z="' + z + '"></canvas><div class="tzc-now"></div></div></div>';
}
function close() { const r = $('tzcRoot'); if (r) { r.hidden = true; r.innerHTML = ''; } st = null; }

function onClick(e) {
  if (e.target.id === 'tzcRoot') return close();
  const b = e.target.closest('[data-tzc]'); if (!b) return;
  const a = b.dataset.tzc;
  if (a === 'close') return close();
  if (a === 'now') { st.at = Math.round(Date.now() / 60000) * 60000; paint(); }
  if (a === 'next' && st.next) { st.at = st.next; paint(); }
}
function onDown(e) {
  const tr = e.target.closest('.tzc-track'); if (!tr || !st) return;
  e.preventDefault();
  const x0 = e.clientX, a0 = st.at, w = tr.clientWidth || 1;
  tr.setPointerCapture && tr.setPointerCapture(e.pointerId);
  const move = (ev) => { st.at = Math.round((a0 - (ev.clientX - x0) / w * 24 * H) / STEP) * STEP; paint(); };
  const up = () => { tr.removeEventListener('pointermove', move); tr.removeEventListener('pointerup', up); tr.removeEventListener('pointercancel', up); };
  tr.addEventListener('pointermove', move); tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', up);
}
function onKey(e) {
  if (!st) return;
  if (e.target.classList && e.target.classList.contains('tzc-track') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault(); st.at += (e.key === 'ArrowRight' ? 1 : -1) * 15 * 60000; paint();
  }
}
// Escape closes this first, before the Students panel under it hears it.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && st) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
}, true);
window.addEventListener('resize', () => { if (st) paint(); });

window.TehfizTzConv = { open, close, isOpen: () => !!st, version: TEHFIZ_TZCONV_VERSION };
})();
