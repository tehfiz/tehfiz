/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-versefind.js — TehfizVerseFind — vf2
   Loaded by both apps, from /app/shared/tehfiz-versefind.js?v=vf2.

   vf2: "/" is registered with TehfizKeys by each app, not listened for here.

   "Find a verse": type any part of a verse the way it sounds, in Latin
   letters, spelt however you like ("qul huwallahu ahad", "inna maal usri
   yusra", "fabi ayyi alai rabbikuma tukazziban") — or in Arabic letters — and
   it lists the verses that sound like it, best first. Tap one to go there.

   How it matches. Every verse has, in data/verse-sounds.txt (built once by
   scripts/build-verse-sounds.py from quran.com's text), each word's
   consonants as sound classes: ص/س/ث are one class, ذ/ز/ظ another, ق/ك
   another, vowels, hamza and ʿayn are left out. What is typed goes through the
   same (latinKey: "sh"→c, "kh"→x, "th"→s, "q"→k, vowels dropped, doubled
   letters once). Then the typed key is fitted into each verse's key, anywhere
   in it, allowing for slips (fit): a different letter costs 1, a near one
   (s/z, d/z, t/d, k/x, n/m …) 0.4, a missing or extra h, w, y, n or l 0.5,
   any other 1. A verse is a match when the cost is small for how much was
   typed. Verses that match the same words equally well (55:13 and its
   repeats) are grouped under the first.

   The index (about 400 KB over the wire) is fetched the first time the box
   is used, then the browser keeps it.

     TehfizVerseFind.open()                       the sheet
     TehfizVerseFind.search(q, max) → Promise<[{s, v, cost, from, to, words, also}]>
     TehfizVerseFind.latinKey(q) / .fit(qKey, verseKey)   (for tests)

   Self-contained:
     namespace  TehfizVerseFind
     CSS        .tvf-* (injected once)
     DOM        #tvfRoot, appended to <body>
   Uses AYAH_COUNTS, SURAH_NAMES (shared file) and the app's goVerse /
   TehfizHeader for going to a verse.
   ═══════════════════════════════════════════════════════════════════════ */
/* global module */
(function () {
'use strict';
const TEHFIZ_VERSEFIND_VERSION = 'vf2';
const DATA_URL = '/app/shared/data/verse-sounds.txt?v=1';
const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ── typed text → sound key ────────────────────────────────────────────── */
const AR = { 'ب': 'b', 'ت': 't', 'ط': 't', 'ث': 's', 'س': 's', 'ص': 's', 'ج': 'j', 'ح': 'h', 'ه': 'h', 'خ': 'x', 'د': 'd', 'ض': 'd',
  'ذ': 'z', 'ز': 'z', 'ظ': 'z', 'ر': 'r', 'ش': 'c', 'غ': 'g', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'w', 'ي': 'y', 'ى': '' };
const LAT = { b: 'b', p: 'b', t: 't', s: 's', j: 'j', h: 'h', d: 'd', z: 'z', r: 'r', f: 'f', q: 'k', k: 'k', c: 'k', l: 'l', m: 'm', n: 'n',
  w: 'w', v: 'w', y: 'y', g: 'g', x: 'ks' };
function collapse(s) { let o = ''; for (const ch of s) if (ch !== o[o.length - 1]) o += ch; return o; }
function latinKey(q) {
  let s = String(q || '');
  if (/[؀-ۿ]/.test(s)) {           // typed in Arabic letters
    s = s.replace(/[ً-ْٰۖ-ۭـ]/g, '');
    let o = ''; for (const ch of s) o += ch === ' ' ? ' ' : (AR[ch] || '');
    return collapse(o.replace(/\s+/g, '')).trim();
  }
  s = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[3']/g, '').replace(/7/g, 'h').replace(/5/g, 'x').replace(/9/g, 's').replace(/6/g, 't').replace(/2/g, '')
    .replace(/sh/g, 'C').replace(/ch/g, 'C').replace(/kh/g, 'X').replace(/gh/g, 'G').replace(/th/g, 'S').replace(/dh/g, 'Z').replace(/ph/g, 'f');
  let o = '';
  for (const ch of s) {
    if (ch === 'C') o += 'c'; else if (ch === 'X') o += 'x'; else if (ch === 'G') o += 'g'; else if (ch === 'S') o += 's'; else if (ch === 'Z') o += 'z';
    else if (LAT[ch]) o += LAT[ch];
  }
  return collapse(o);
}

/* ── fitting a key into the whole Quran ────────────────────────────────── */
/* Sound classes as small numbers, so the costs are table look-ups. */
const ABC = 'btsjhxdzrcgfklmnwy';
const CODE = {}; [...ABC].forEach((c, i) => { CODE[c] = i; });
const N = ABC.length;
const CHEAP = 'hwynl';
const NEAR = ['sz', 'zd', 'dt', 'ts', 'kx', 'xh', 'kg', 'gj', 'sc', 'nm', 'bf', 'ty', 'dj'];
const INDEL = new Float32Array(N), SUB = new Float32Array(N * N);
for (let a = 0; a < N; a++) { INDEL[a] = CHEAP.includes(ABC[a]) ? 0.5 : 1; for (let b = 0; b < N; b++) SUB[a * N + b] = a === b ? 0 : 1; }
NEAR.forEach(([x, y]) => { SUB[CODE[x] * N + CODE[y]] = 0.4; SUB[CODE[y] * N + CODE[x]] = 0.4; });
function codes(k) { const o = new Uint8Array(k.length); for (let i = 0; i < k.length; i++) o[i] = CODE[k[i]]; return o; }
/* What a match may cost: about one slip in four sounds, never less than one. */
function allowed(m) { return Math.max(1, m * 0.26); }

/* The cheapest way to read q (codes) inside t (codes), at every place it
   could end: fills end costs in E and where each starts in S. One pass over
   all of t, so a match may run on from one verse into the next. */
let _a = null, _b = null, _sa = null, _sb = null;
function sweep(q, t, E, S) {
  const m = q.length, n = t.length;
  if (!_a || _a.length < n + 1) { _a = new Float32Array(n + 1); _b = new Float32Array(n + 1); _sa = new Int32Array(n + 1); _sb = new Int32Array(n + 1); }
  let prv = _a, cur = _b, ps = _sa, cs = _sb;
  for (let j = 0; j <= n; j++) { prv[j] = 0; ps[j] = j; }
  for (let i = 0; i < m; i++) {
    const a = q[i], di = INDEL[a], row = a * N;
    cur[0] = prv[0] + di; cs[0] = 0;
    for (let j = 1; j <= n; j++) {
      const b = t[j - 1];
      let best = prv[j - 1] + SUB[row + b], st = ps[j - 1];
      const up = prv[j] + di; if (up < best) { best = up; st = ps[j]; }
      const lf = cur[j - 1] + INDEL[b]; if (lf < best) { best = lf; st = cs[j - 1]; }
      cur[j] = best; cs[j] = st;
    }
    let x = prv; prv = cur; cur = x; const y = ps; ps = cs; cs = y;
  }
  E.set(prv.subarray(0, n + 1)); S.set(ps.subarray(0, n + 1));
}
/* Kept for tests: one key inside another. */
function fit(q, t) {
  const E = new Float32Array(t.length + 1), S = new Int32Array(t.length + 1);
  sweep(codes(q), codes(t), E, S);
  let best = Infinity, end = 0;
  for (let j = 1; j <= t.length; j++) if (E[j] < best) { best = E[j]; end = j; }
  return { cost: best, from: S[end], to: end };
}

/* ── the index ─────────────────────────────────────────────────────────── */
/* All 6236 verses' keys end to end (ALL), and for each sound which verse
   (VAT) and which word of it (WAT) it belongs to. */
let DATA = null, _loading = null;
function parse(text) {
  const counts = typeof AYAH_COUNTS !== 'undefined' ? AYAH_COUNTS : null;
  const rows = text.split('\n').filter(Boolean);
  const verses = [];
  let s = 1, v = 1, total = 0;
  for (const r of rows) {
    const tab = r.indexOf('\t');
    const words = r.slice(0, tab).split(' '), keys = r.slice(tab + 1).split(' ');
    verses.push({ s, v, words, keys });
    total += keys.join('').length;
    v++; if (counts && v > counts[s - 1]) { s++; v = 1; }
  }
  const ALL = new Uint8Array(total), VAT = new Uint16Array(total), WAT = new Uint16Array(total);
  let n = 0, last = -1;
  verses.forEach((d, vi) => {
    d.at = n;
    d.keys.forEach((k, w) => {
      if (k === '-') return;
      for (const ch of k) {
        const c = CODE[ch]; if (c === undefined || c === last) continue;   // doubled across words: one sound
        ALL[n] = c; VAT[n] = vi; WAT[n] = w; n++; last = c;
      }
    });
  });
  return { verses, ALL: ALL.subarray(0, n), VAT: VAT.subarray(0, n), WAT: WAT.subarray(0, n), E: new Float32Array(n + 1), S: new Int32Array(n + 1) };
}
function load(fetcher) {
  if (DATA) return Promise.resolve(DATA);
  if (!_loading) {
    _loading = (fetcher || ((u) => fetch(u).then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })))(DATA_URL)
      .then((t) => { DATA = parse(t); return DATA; })
      .catch((e) => { _loading = null; throw e; });
  }
  return _loading;
}
async function search(q, max, fetcher) {
  const qk = latinKey(q);
  if (qk.length < 2) return [];
  const D = await load(fetcher);
  // Two sounds are too few to search with, except for the disjointed letters
  // ("ha meem", "ta ha"): those verses whose first word is exactly that.
  if (qk.length < 3) {
    const out = [];
    D.verses.forEach((d) => { if (d.v <= 2 && d.keys[0] === qk && out.length < (max || 20)) out.push({ s: d.s, v: d.v, cost: 0, from: 0, to: 0, words: d.words, also: [], next: null }); });
    return out;
  }
  const lim = allowed(qk.length), n = D.ALL.length;
  sweep(codes(qk), D.ALL, D.E, D.S);
  // Each place a match is cheapest locally; then the best one per verse it starts in.
  const best = new Map();
  for (let j = 1; j <= n; j++) {
    const c = D.E[j];
    if (c > lim || (j > 1 && D.E[j - 1] < c) || (j < n && D.E[j + 1] < c)) continue;
    // The verse that holds most of the match (the start may be the last sound
    // of the verse before, when it ends the way this one begins).
    const from = D.S[j], v0 = D.VAT[Math.min(from, n - 1)], v1 = D.VAT[Math.max(from, j - 1)];
    let vi = v0;
    if (v1 !== v0) { const cut = D.verses[v1].at; if (j - cut > cut - from) vi = v1; }
    const prev = best.get(vi);
    if (!prev || c < prev.cost) best.set(vi, { vi, cost: c, from, to: j });
  }
  let hits = [...best.values()].sort((a, b) => a.cost - b.cost || a.vi - b.vi);
  // Far behind the best match is noise: "inna maal usri yusra" finds 94:5
  // exactly, and a verse that is two slips away is not what was meant.
  if (hits.length) { const cut = hits[0].cost + Math.max(0.9, qk.length * 0.07); hits = hits.filter((h) => h.cost <= cut); }
  // Repeats of the same words (55:13 …) under the first.
  const out = [], seen = new Map();
  for (const h of hits) {
    const frag = D.ALL.subarray(h.from, h.to).join(',');
    const g = seen.get(frag), d = D.verses[h.vi];
    if (g && Math.abs(g.cost - h.cost) < 0.01) { g.also.push(d.s + ':' + d.v); continue; }
    if (out.length >= (max || 20)) continue;
    const endV = D.VAT[Math.max(h.from, h.to - 1)];
    const startV = D.VAT[h.from];
    const w0 = startV === h.vi ? D.WAT[h.from] : 0;
    const w1 = endV === h.vi ? D.WAT[Math.max(h.from, h.to - 1)] : d.words.length - 1;
    const o = { s: d.s, v: d.v, cost: h.cost, from: w0, to: w1, words: d.words, also: [],
                next: endV > h.vi ? D.verses[endV].s + ':' + D.verses[endV].v : null };
    out.push(o); seen.set(frag, o);
  }
  return out;
}

/* ── the sheet ─────────────────────────────────────────────────────────── */
let st = null;   // {q, res, busy, err, hi}
function css() {
  if ($('tvfCss')) return;
  const el = document.createElement('style'); el.id = 'tvfCss';
  el.textContent =
    '#tvfRoot{position:fixed;inset:0;z-index:1270;display:flex;align-items:flex-end;justify-content:center;background:rgba(23,25,28,.38);}' +
    '#tvfRoot[hidden]{display:none;}' +
    '.tvf-sheet{width:100%;max-width:620px;height:min(86vh,720px);background:var(--parchment);color:var(--ink);border-radius:16px 16px 0 0;' +
      'padding:10px 16px 0;display:flex;flex-direction:column;gap:10px;box-shadow:0 -8px 28px rgba(0,0,0,.25);font-family:var(--ui-font);box-sizing:border-box;}' +
    '@media (min-width:700px){#tvfRoot{align-items:flex-start;padding-top:8vh;}.tvf-sheet{border-radius:14px;height:auto;max-height:80vh;padding:16px 16px 12px;}.tvf-grab{display:none;}}' +
    '.tvf-grab{width:40px;height:4px;border-radius:9px;background:var(--parchment3);align-self:center;flex:none;}' +
    '.tvf-h{display:flex;align-items:center;gap:10px;flex:none;}.tvf-h b{flex:1;font-size:17px;}' +
    '.tvf-x{width:36px;height:36px;flex:none;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;font-size:15px;}' +
    '.tvf-q{flex:none;width:100%;box-sizing:border-box;height:46px;border:1px solid var(--border2);border-radius:11px;background:var(--surface,#fff);color:var(--ink);' +
      'font:16px var(--ui-font);padding:0 14px;}' +
    '.tvf-q:focus{outline:2px solid var(--gold);outline-offset:1px;}' +
    '.tvf-hint{flex:none;font-size:12.5px;line-height:1.45;color:var(--ink3);margin-top:-4px;}' +
    '.tvf-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:6px;padding-bottom:max(14px,env(safe-area-inset-bottom));}' +
    '.tvf-r{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:5px;padding:10px 12px;border:1px solid var(--border2);border-radius:11px;' +
      'background:var(--surface,#fff);cursor:pointer;}' +
    '.tvf-r:hover,.tvf-r.hi{border-color:var(--ink);}' +
    '.tvf-r:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}' +
    '.tvf-rh{display:flex;align-items:baseline;gap:8px;font-size:13.5px;}.tvf-rh b{font-weight:600;}' +
    '.tvf-rh span{color:var(--ink3);font-size:12.5px;margin-left:auto;}' +
    '.tvf-ar{direction:rtl;text-align:right;font-family:"Amiri","Scheherazade New","UthmanicHafs",serif;font-size:20px;line-height:1.9;color:var(--ink2);}' +
    '.tvf-ar mark{background:var(--gold-pale,#f3ead4);color:var(--ink);border-radius:4px;padding:0 2px;}' +
    '.tvf-also{font-size:12.5px;color:var(--ink3);}' +
    '.tvf-msg{font-size:13.5px;color:var(--ink3);padding:8px 2px;line-height:1.5;}';
  document.head.appendChild(el);
}
function root() {
  let r = $('tvfRoot');
  if (!r) {
    r = document.createElement('div'); r.id = 'tvfRoot'; r.hidden = true;
    document.body.appendChild(r);
    r.addEventListener('click', onClick);
    r.addEventListener('input', onInput);
    r.addEventListener('keydown', onKey);
  }
  return r;
}
function name(s) { return typeof SURAH_NAMES !== 'undefined' ? SURAH_NAMES[s - 1] : 'Surah ' + s; }
/* The words around the match: two before, the match marked, two after. */
function snippet(o) {
  const a = Math.max(0, o.from - 2), b = Math.min(o.words.length, o.to + 3);
  return (a > 0 ? '… ' : '') + o.words.slice(a, b).map((w, i) => {
    const k = a + i;
    return k >= o.from && k <= o.to ? '<mark>' + esc(w) + '</mark>' : esc(w);
  }).join(' ') + (b < o.words.length ? ' …' : '');
}
function listHtml() {
  if (st.err) return '<div class="tvf-msg">Couldn’t load the verse list. Check your connection and try again.</div>';
  if (latinKey(st.q).length < 2) return '<div class="tvf-msg">Type a few words of the verse, the way they sound. Any spelling is fine: “inna maal usri yusra”, “qul huwallahu ahad”. Arabic letters work too.</div>';
  if (st.busy && !st.res) return '<div class="tvf-msg">Looking…</div>';
  if (!st.res || !st.res.length) return '<div class="tvf-msg">Nothing sounds like that yet. Try a few more words, or spell a word differently.</div>';
  return st.res.map((o, i) =>
    '<button type="button" class="tvf-r' + (i === st.hi ? ' hi' : '') + '" data-tvf="go" data-i="' + i + '">' +
      '<span class="tvf-rh"><b>' + esc(name(o.s)) + '</b>' + o.s + ':' + o.v + '</span>' +
      '<span class="tvf-ar" lang="ar">' + snippet(o) + '</span>' +
      (o.also.length ? '<span class="tvf-also">The same words are also in ' + esc(o.also.slice(0, 6).join(', ') + (o.also.length > 6 ? ' and ' + (o.also.length - 6) + ' more' : '')) + '</span>' : '') +
    '</button>').join('');
}
function paintList() { const l = $('tvfList'); if (l && st) l.innerHTML = listHtml(); }
function open(q0) {
  if (typeof document === 'undefined') return;
  css();
  st = { q: q0 || '', res: null, busy: false, err: false, hi: 0, seq: 0 };
  const r = root();
  r.innerHTML = '<div class="tvf-sheet" role="dialog" aria-modal="true" aria-labelledby="tvfT"><div class="tvf-grab"></div>' +
    '<div class="tvf-h"><b id="tvfT">Find a verse</b><button type="button" class="tvf-x" data-tvf="close" aria-label="Close">✕</button></div>' +
    '<input id="tvfQ" class="tvf-q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" ' +
      'placeholder="Type how it sounds, e.g. qul huwallahu ahad" aria-label="Words of the verse" value="' + esc(st.q) + '">' +
    '<div class="tvf-list" id="tvfList" role="list"></div></div>';
  r.hidden = false;
  paintList();
  const i = $('tvfQ'); if (i) { i.focus(); if (st.q) run(); }
  load().catch(() => {});                      // start fetching the index straight away
}
function close() { const r = $('tvfRoot'); if (r) { r.hidden = true; r.innerHTML = ''; } st = null; }
let _t = 0;
function run() {
  clearTimeout(_t);
  _t = setTimeout(async () => {
    if (!st) return;
    const seq = ++st.seq; st.busy = true; st.err = false;
    if (!DATA) paintList();
    try {
      const res = await search(st.q, 20);
      if (!st || seq !== st.seq) return;
      st.res = res; st.hi = 0;
    } catch (e) { if (st) st.err = true; }
    if (st) { st.busy = false; paintList(); }
  }, 160);
}
function go(o) {
  close();
  if (window.TehfizHeader && window.TehfizHeader.goVerse) window.TehfizHeader.goVerse(o.s, o.v);
  else if (typeof window.navigateToVerse === 'function') window.navigateToVerse(o.s, o.v);
}
function onInput(e) { if (st && e.target.id === 'tvfQ') { st.q = e.target.value; st.res = latinKey(st.q).length < 2 ? null : st.res; run(); if (!st.res) paintList(); } }
function onClick(e) {
  if (!st) return;
  if (e.target.id === 'tvfRoot') return close();
  const b = e.target.closest('[data-tvf]'); if (!b) return;
  if (b.dataset.tvf === 'close') return close();
  if (b.dataset.tvf === 'go') { const o = st.res && st.res[+b.dataset.i]; if (o) go(o); }
}
function onKey(e) {
  if (!st || !st.res || !st.res.length || e.target.id !== 'tvfQ') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); st.hi = (st.hi + (e.key === 'ArrowDown' ? 1 : -1) + st.res.length) % st.res.length; paintList();
    const h = document.querySelector('.tvf-r.hi'); if (h) h.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') { e.preventDefault(); go(st.res[st.hi]); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && st) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  // "/" opens it: registered with TehfizKeys (tehfiz-keys.js) by each app.
}

const API = { open, close, isOpen: () => !!st, search, latinKey, fit, load, _parse: parse, version: TEHFIZ_VERSEFIND_VERSION };
if (typeof window !== 'undefined') window.TehfizVerseFind = API;
if (typeof module !== 'undefined') module.exports = API;
})();
