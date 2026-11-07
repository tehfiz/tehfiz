/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-map.js — TehfizMap — mp6
   Loaded by the teacher app (Profile → Memorised, sessions) and, read-only,
   by the student viewer, from /app/shared/tehfiz-map.js?v=mp6.

   mp6: By surah's search is the app's own surah search (other names,
   Arabic, spellings that sound alike).

   mp5: the map also keeps WHICH AYAHS are memorised (student_maps.ayahs,
   ranges of verse numbers 1–6236: "1-7,2134-2173"). A surah's first and last
   half pages are often shared with its neighbours, and in Juz 30 several
   surahs share one half — so ticking a surah now marks exactly its ayahs,
   and the By surah list reads them ("40/110"). The half pages stay what the
   juz view, the stages and old/recent use. The two are kept in step:
     a half page counts as memorised  ⇔  at least one of its ayahs does
   reconcile(pages, ayahs) enforces that — a half marked with no ayahs gets
   all of them (a page ticked on the juz view, a lesson, an older app), and
   ayahs in a half that is not marked are dropped. By surah has a search.

   mp4: halfKeys / juzKeys turn a half page or a juz back into a verse range,
   for planning a lesson from the map.

   mp3: the help lines and the old/recent explainer sit behind a small ?
   beside By juz / By surah; the explainer shows by itself only once old and
   recent are set by hand.

   The memorisation map: 604 pages, each in two halves, each half one of
     '-' not memorised   'o' old (dhor)   'r' recent (sabaq para)   'n' new lesson
   stored as a 1208-character string (page 1 first half first). The same
   string is what the server keeps (student_maps.pages).

   mp2 marks with TICKS. The teacher ticks what is memorised; whether a ticked
   page is old or recent is worked out (derive: recent = what is memorised in
   the juz of the new lesson), unless they choose to set it by hand.
     · by juz    30 cells: a circle to tick the whole juz; tap the juz to open it
     · by surah  114 rows: a box to tick the whole surah; tap the name to tick
                 or clear a range of ayahs
     · one juz   tap a page to tick it (tap again to untick), drag across a run;
                 "Half pages" ticks halves instead. Mark as: Memorised / New
                 lesson / Not yet — and Old / Recent when set by hand

   For a session (phase 4): halvesForRange(start, end) turns a recited range
   into half pages; stageFor() suggests New / Recent / Old from the map;
   withLesson() adds what was recited past the map as the new lesson.

   Self-contained: namespace window.TehfizMap, CSS prefixed .tzm-, state kept
   on the container. Reads JUZ_PAGES, SURAH_PAGES, SURAH_NAMES, AYAH_COUNTS,
   PAGE_FIRST_VERSE_ABS, keyAbs, absVerse from the shared file. The host passes
   onChange(pages, recentAuto) and saves.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_MAP_VERSION = 'mp6';
const PAGES = 604, LEN = PAGES * 2;
const STATES = { '-': 'Not yet', o: 'Old', r: 'Recent', n: 'New lesson' };
const MEMO = (c) => c === 'o' || c === 'r' || c === 'n';

function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function empty() { return '-'.repeat(LEN); }
function valid(p) { return typeof p === 'string' && p.length === LEN && /^[-orn]+$/.test(p); }
function juzStart(j) { return JUZ_PAGES[j - 1]; }
function juzEnd(j) { return j === 30 ? PAGES : JUZ_PAGES[j] - 1; }
function juzOfPage(pg) { let j = 1; for (let i = 0; i < 30; i++) if (JUZ_PAGES[i] <= pg) j = i + 1; return j; }
function surahSpan(i) { return [SURAH_PAGES[i * 2], SURAH_PAGES[i * 2 + 1]]; }
function halvesOf(a, b) { const out = []; for (let pg = a; pg <= b; pg++) out.push((pg - 1) * 2, (pg - 1) * 2 + 1); return out; }
function pageOf(h) { return Math.floor(h / 2) + 1; }
function halfText(n) { const w = Math.floor(n), f = n - w; return ((w ? String(w) : '') + (f ? '½' : '')) || '0'; }
function set(pages, hs, c) { const a = pages.split(''); hs.forEach((h) => { a[h] = c; }); return a.join(''); }

/* ── verses → half pages ────────────────────────────────────────────────── */
function pageFirst(pg) { return PAGE_FIRST_VERSE_ABS[pg - 1]; }
function pageOfAbs(abs) {
  let lo = 0, hi = PAGE_FIRST_VERSE_ABS.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (PAGE_FIRST_VERSE_ABS[mid] <= abs) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans + 1;
}
/* The half pages a verse range covers. A range that starts past the middle
   of a page's verses starts at its second half; one that ends before the
   middle ends at its first half. Verses are not evenly sized, so this is the
   nearest half, not a measurement. */
function halvesForRange(startKey, endKey) {
  let a = keyAbs(startKey), b = keyAbs(endKey);
  if (!a || !b) return [];
  if (a > b) { const t = a; a = b; b = t; }
  const pa = pageOfAbs(a), pb = pageOfAbs(b);
  const span = (pg) => ((pg < PAGES ? pageFirst(pg + 1) : 6237) - pageFirst(pg)) || 1;
  const startSecond = (a - pageFirst(pa)) / span(pa) >= 0.5;
  const endFirst = (b - pageFirst(pb) + 1) / span(pb) <= 0.5;
  const from = (pa - 1) * 2 + (startSecond ? 1 : 0);
  const to = (pb - 1) * 2 + (endFirst ? 0 : 1);
  const out = []; for (let h = from; h <= Math.max(from, to); h++) out.push(h);
  return out;
}
/* A half page as verses: [startKey, endKey]. The first half is the verses in
   the first half of the page; the second half takes the rest (a middle verse
   goes with it, so nothing is left out). */
function halfKeys(h) {
  const pg = pageOf(h);
  const a = pageFirst(pg), end = (pg < PAGES ? pageFirst(pg + 1) : 6237) - 1, span = end - a + 1;
  const cut = a + Math.floor(span / 2);
  const r = span < 2 ? [a, end] : (h % 2 ? [cut, end] : [a, cut - 1]);
  return [keyFromAbs(r[0]), keyFromAbs(r[1])];
}
/* A run of half pages as verses. */
function halvesKeys(h1, h2) { return [halfKeys(Math.min(h1, h2))[0], halfKeys(Math.max(h1, h2))[1]]; }
/* A juz as verses. */
function juzKeys(j) {
  const s = JUZ_START_VERSES[j - 1], e = j < 30 ? JUZ_START_VERSES[j] : null;
  const a = absVerse(s.s, s.a);
  const b = e ? absVerse(e.s, e.a) - 1 : 6236;
  return [keyFromAbs(a), keyFromAbs(b)];
}
function surahRangeKeys(i, a1, a2) {
  const n = AYAH_COUNTS[i];
  a1 = Math.max(1, Math.min(n, a1 | 0 || 1)); a2 = Math.max(1, Math.min(n, a2 | 0 || n));
  return [(i + 1) + ':' + Math.min(a1, a2), (i + 1) + ':' + Math.max(a1, a2)];
}

/* ── ayahs (mp5) ────────────────────────────────────────────────────────── */
const NV = 6236;
function bitsEmpty() { return new Uint8Array(NV + 1); }
/* "1-7,20" → bits; '' → none; anything malformed → null. */
function parseAyahs(str) {
  if (typeof str !== 'string' || !/^(\d{1,4}(-\d{1,4})?(,\d{1,4}(-\d{1,4})?)*)?$/.test(str)) return null;
  const b = bitsEmpty();
  if (!str) return b;
  for (const part of str.split(',')) {
    const [x, y] = part.split('-').map(Number), z = y == null ? x : y;
    if (!(x >= 1 && z <= NV && x <= z)) return null;
    b.fill(1, x, z + 1);
  }
  return b;
}
function ayahsText(b) {
  const out = [];
  for (let v = 1; v <= NV; v++) {
    if (!b[v]) continue;
    let z = v; while (z + 1 <= NV && b[z + 1]) z++;
    out.push(z > v ? v + '-' + z : String(v)); v = z;
  }
  return out.join(',');
}
/* The verses of a half page, as halfKeys splits them. */
function halfAbs(h) {
  const pg = pageOf(h), a = pageFirst(pg), end = (pg < PAGES ? pageFirst(pg + 1) : NV + 1) - 1, span = end - a + 1;
  const cut = a + Math.floor(span / 2);
  return span < 2 ? [a, end] : (h % 2 ? [cut, end] : [a, cut - 1]);
}
/* Every half page holding any of the verses a..z. */
function halvesOfAbs(a, z) {
  const out = [], h0 = (pageOfAbs(a) - 1) * 2, h1 = (pageOfAbs(z) - 1) * 2 + 1;
  for (let h = h0; h <= h1; h++) { const r = halfAbs(h); if (r[0] <= z && r[1] >= a) out.push(h); }
  return out;
}
function countIn(b, a, z) { let n = 0; for (let v = a; v <= z; v++) n += b[v]; return n; }
function reconcileBits(pages, b) {
  const allow = bitsEmpty();
  for (let h = 0; h < LEN; h++) if (MEMO(pages[h])) { const r = halfAbs(h); allow.fill(1, r[0], r[1] + 1); }
  for (let v = 1; v <= NV; v++) if (b[v] && !allow[v]) b[v] = 0;
  for (let h = 0; h < LEN; h++) {
    if (!MEMO(pages[h])) continue;
    const r = halfAbs(h);
    if (!countIn(b, r[0], r[1])) b.fill(1, r[0], r[1] + 1);
  }
  return b;
}
/* The ayahs for these pages: what the host saves next to them. */
function reconcile(pages, ayahs) {
  if (!valid(pages)) return '';
  return ayahsText(reconcileBits(pages, parseAyahs(ayahs || '') || bitsEmpty()));
}
/* Ayahs recited in a lesson join the memorised ones (reconcile with the new
   pages afterwards). ranges: [[startKey, endKey], …] */
function withRanges(ayahs, ranges) {
  const b = parseAyahs(ayahs || '') || bitsEmpty();
  (Array.isArray(ranges) ? ranges : []).forEach(([s0, e0]) => {
    let a = keyAbs(s0), z = keyAbs(e0); if (!a || !z) return;
    if (a > z) { const t = a; a = z; z = t; }
    b.fill(1, a, z + 1);
  });
  return ayahsText(b);
}
function surahAbs(i) { return [absVerse(i + 1, 1), absVerse(i + 1, AYAH_COUNTS[i])]; }

/* "Recent" = everything memorised in the juz of the new lesson (the last half
   marked New). Everything else memorised is Old. No new lesson: unchanged. */
function derive(pages) {
  const last = pages.lastIndexOf('n');
  if (last < 0) return pages;
  const j = juzOfPage(pageOf(last));
  const a = (juzStart(j) - 1) * 2, b = juzEnd(j) * 2 - 1;
  let out = '';
  for (let h = 0; h < LEN; h++) {
    const c = pages[h];
    out += (c === 'o' || c === 'r') ? (h >= a && h <= b ? 'r' : 'o') : c;
  }
  return out;
}

/* What a recited range says about the stage: anything not yet memorised, or
   the new lesson itself → New; mostly recent → Recent; otherwise Old. */
function stageFor(pages, startKey, endKey) {
  if (!valid(pages)) return null;
  const hs = halvesForRange(startKey, endKey);
  if (!hs.length) return null;
  let n = 0, r = 0, o = 0;
  hs.forEach((h) => { const c = pages[h]; if (c === '-' || c === 'n') n++; else if (c === 'r') r++; else o++; });
  if (n) return 'new';
  return r >= o ? 'recent' : 'old';
}

/* After a lesson: what was the new lesson becomes memorised, and every half
   recited that was not memorised becomes the new lesson. Returns the new
   map and the halves added, so the app can say what changed. */
function withLesson(pages, ranges, recentAuto) {
  if (!valid(pages)) pages = empty();
  const fresh = new Set();
  ranges.forEach(([s, e]) => halvesForRange(s, e).forEach((h) => { if (pages[h] === '-' || pages[h] === 'n') fresh.add(h); }));
  if (!fresh.size) return { pages, added: [] };
  let out = pages.replace(/n/g, 'o');               // last lesson's new part is memorised now
  out = set(out, Array.from(fresh), 'n');
  if (recentAuto !== false) out = derive(out);
  return { pages: out, added: Array.from(fresh).sort((a, b) => a - b).filter((h) => pages[h] === '-') };
}

function summary(pages) {
  if (!valid(pages)) pages = empty();
  const cnt = { o: 0, r: 0, n: 0 };
  for (const c of pages) if (cnt[c] != null) cnt[c]++;
  const memo = (cnt.o + cnt.r + cnt.n) / 2;
  let full = 0, inFull = 0;
  for (let j = 1; j <= 30; j++) {
    const hs = halvesOf(juzStart(j), juzEnd(j));
    if (hs.every((h) => pages[h] !== '-')) { full++; inFull += hs.length / 2; }
  }
  const extra = memo - inFull;
  const recentJuz = [];
  for (let j = 1; j <= 30; j++) if (halvesOf(juzStart(j), juzEnd(j)).some((h) => pages[h] === 'r')) recentJuz.push(j);
  const first = pages.indexOf('n'), last = pages.lastIndexOf('n');
  const newAt = first < 0 ? null : { from: first, to: last };
  const text = !memo ? 'Nothing marked yet'
    : (full ? full + ' juz' + (extra ? ' + ' + halfText(extra) + ' page' + (extra === 1 ? '' : 's') : '')
            : halfText(memo) + ' page' + (memo === 1 ? '' : 's'));
  return { memorised: memo, fullJuz: full, extraPages: extra, old: cnt.o / 2, recent: cnt.r / 2, fresh: cnt.n / 2,
           recentJuz, newAt, text };
}
/* "p. 32", "p. 32, second half", "p. 32½–34" (from the middle of 32),
   "p. 32–34 (first half)" (to the middle of 34). */
function halvesText(a, b) {
  const pa = pageOf(a), pb = pageOf(b);
  if (a === b) return 'p. ' + pa + (a % 2 ? ', second half' : ', first half');
  if (pa === pb) return 'p. ' + pa;
  return 'p. ' + pa + (a % 2 ? '\u00bd' : '') + '\u2013' + pb + (b % 2 ? '' : ' (first half)');
}
function newText(s) { return s.newAt ? halvesText(s.newAt.from, s.newAt.to) : ''; }
/* The next half page after the new lesson — what "next ½ page" means. */
function nextHalf(pages) {
  const last = valid(pages) ? pages.lastIndexOf('n') : -1;
  if (last < 0 || last >= LEN - 1) return null;
  return last + 1;
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if (document.getElementById('tzmCss')) return;
  const el = document.createElement('style');
  el.id = 'tzmCss';
  el.textContent = `
.tzm{--tzm-g:#3e9b2f;--tzm-gt:#e3f4dc;--tzm-on:#fff;
  --tzm-o:var(--tzm-g);--tzm-r:color-mix(in srgb,var(--tzm-g) 42%,var(--surface,#fff));--tzm-0:var(--parchment3);
  --tzm-n:repeating-linear-gradient(45deg,var(--ink) 0 2px,var(--surface,#fff) 2px 4px);
  display:flex;flex-direction:column;gap:12px;font-family:var(--ui-font);color:var(--ink);}
:root[data-tz-mode="dark"] .tzm{--tzm-g:#7bc96a;--tzm-gt:#1f3a19;--tzm-on:#10200c;}
.tzm-seg{display:flex;}
.tzm-top{display:flex;align-items:center;gap:8px;}
.tzm-top .tzm-seg{flex:1;min-width:0;}
.tzm-q{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink2);font:600 14px var(--ui-font);cursor:pointer;}
.tzm-q[aria-expanded="true"]{background:var(--ink);color:var(--parchment);border-color:var(--ink);}
.tzm-seg button{flex:1;height:38px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;padding:0 4px;}
.tzm-seg button:first-child{border-radius:8px 0 0 8px;}
.tzm-seg button:last-child{border-radius:0 8px 8px 0;}
.tzm-seg button+button{margin-left:-1px;}
.tzm-seg button[aria-pressed="true"]{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;position:relative;z-index:1;}
.tzm-seg button.g[aria-pressed="true"]{background:var(--tzm-g);border-color:var(--tzm-g);color:var(--tzm-on);}
.tzm-lg{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:var(--ink2);}
.tzm-lg i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:5px;}
.tzm-c-o{background:var(--tzm-o);} .tzm-c-r{background:var(--tzm-r);} .tzm-c-n{background:var(--tzm-n);} .tzm-c--{background:var(--tzm-0);}
.tzm-jgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;}
.tzm-jc{position:relative;border:1px solid var(--border);border-radius:9px;background:var(--surface,#fff);padding:6px 6px 7px;text-align:left;cursor:pointer;
  font:600 12px 'IBM Plex Mono',monospace;color:var(--ink);}
.tzm-jc:hover{border-color:var(--border2);}
.tzm-jc.ro{cursor:default;}
.tzm-ck{position:absolute;top:3px;right:3px;width:26px;height:26px;border-radius:50%;border:none;background:none;padding:0;cursor:pointer;
  display:flex;align-items:center;justify-content:center;}
.tzm-ck i{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--ink3);box-sizing:border-box;display:flex;align-items:center;justify-content:center;
  font:700 12px var(--ui-font);font-style:normal;color:var(--tzm-on);}
.tzm-ck.full i{background:var(--tzm-g);border-color:var(--tzm-g);}
.tzm-ck.part i{border-color:var(--tzm-g);background:conic-gradient(var(--tzm-g) 0 var(--p,50%),transparent 0);}
.tzm-ck.ro{cursor:default;}
.tzm-bar{display:flex;height:8px;border-radius:2px;overflow:hidden;margin-top:12px;background:var(--tzm-0);}
.tzm-bar span{flex:1;}
.tzm-srow{display:flex;align-items:center;gap:8px;padding:5px 2px;border-top:1px solid var(--border);font:400 13px var(--ui-font);}
.tzm-box{width:26px;height:26px;flex:none;border:none;background:none;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.tzm-box i{width:20px;height:20px;border-radius:5px;border:1.5px solid var(--ink3);box-sizing:border-box;display:flex;align-items:center;justify-content:center;
  font:700 12px var(--ui-font);font-style:normal;color:var(--tzm-on);}
.tzm-box.full i{background:var(--tzm-g);border-color:var(--tzm-g);}
.tzm-box.part i{border-color:var(--tzm-g);background:linear-gradient(var(--tzm-g),var(--tzm-g)) center/9px 2px no-repeat;}
.tzm-box.ro{cursor:default;}
.tzm-sn{width:128px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:none;border:none;padding:4px 0;text-align:left;
  font:400 13px var(--ui-font);color:var(--ink);cursor:pointer;}
.tzm-sn:hover{text-decoration:underline;}
.tzm-srow .tzm-bar{flex:1;margin:0;height:9px;}
.tzm-srow .q{width:58px;flex:none;text-align:right;font:12px 'IBM Plex Mono',monospace;color:var(--ink3);}
.tzm-sq{height:38px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:14px var(--ui-font);width:100%;}
.tzm-si[hidden],.tzm-snone[hidden]{display:none;}
.tzm-slist .tzm-si:first-child .tzm-srow{border-top:none;}
.tzm-ayr{background:var(--parchment2);border-radius:10px;padding:10px;margin:2px 0 8px;display:flex;flex-direction:column;gap:8px;font-size:13px;}
.tzm-ayr .r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tzm-ayr input{width:72px;height:36px;box-sizing:border-box;padding:0 8px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);
  color:var(--ink);font:500 14px var(--ui-font);text-align:center;}
.tzm-head{display:flex;align-items:center;gap:10px;}
.tzm-head b{font-size:16px;}
.tzm-back{height:36px;padding:0 12px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;}
.tzm-pgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;touch-action:none;user-select:none;-webkit-user-select:none;}
.tzm-pc{position:relative;height:64px;border:1px solid var(--border2);border-radius:9px;overflow:hidden;display:flex;flex-direction:column;background:var(--surface,#fff);cursor:pointer;}
.tzm-hf{flex:1;}
.tzm-hf+.tzm-hf{border-top:1px dashed var(--border2);}
.tzm-hf.s-o,.tzm-hf.s-r{background:var(--tzm-gt);}
.tzm-hf.s-n{background:var(--tzm-n);}
.tzm.byhand .tzm-hf.s-r{background:color-mix(in srgb,var(--tzm-gt) 45%,var(--surface,#fff));}
.tzm-pn{position:absolute;top:3px;left:5px;z-index:1;font:600 11px 'IBM Plex Mono',monospace;pointer-events:none;
  background:color-mix(in srgb,var(--surface,#fff) 80%,transparent);border-radius:4px;padding:0 3px;}
.tzm-tk{position:absolute;right:4px;bottom:4px;z-index:1;width:18px;height:18px;border-radius:50%;background:var(--tzm-g);color:var(--tzm-on);
  font:700 11px var(--ui-font);display:flex;align-items:center;justify-content:center;pointer-events:none;}
.tzm-rk{position:absolute;right:5px;top:4px;z-index:1;font:600 10px var(--ui-font);color:var(--ink2);pointer-events:none;}
.tzm-acts{display:flex;gap:8px;flex-wrap:wrap;}
.tzm-acts button{flex:1 1 auto;height:40px;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);
  font:500 13px var(--ui-font);cursor:pointer;}
.tzm-acts button.g{background:var(--tzm-g);border-color:var(--tzm-g);color:var(--tzm-on);font-weight:600;}
.tzm-note{font-size:13px;color:var(--ink3);}
.tzm-chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2);}
.tzm-auto{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink2);background:var(--parchment2);border-radius:8px;padding:8px 10px;}
.tzm-auto button{background:none;border:none;padding:0;font:500 13px var(--ui-font);color:var(--ink);text-decoration:underline;cursor:pointer;}
`;
  document.head.appendChild(el);
}

/* ── views ──────────────────────────────────────────────────────────────── */
function bar(pages, a, b) {
  return '<span class="tzm-bar">' + halvesOf(a, b).map((h) => '<span class="tzm-c-' + pages[h] + '"></span>').join('') + '</span>';
}
function legend() {
  return '<div class="tzm-lg">' + ['o', 'r', 'n', '-'].map((k) => '<span><i class="tzm-c-' + k + '"></i>' + STATES[k] + '</span>').join('') + '</div>';
}
function fill(pages, hs) { const m = hs.filter((h) => pages[h] !== '-').length; return { m, of: hs.length }; }
function juzView(st) {
  return '<div class="tzm-jgrid">' + Array.from({ length: 30 }, (_, i) => {
    const j = i + 1, hs = halvesOf(juzStart(j), juzEnd(j)), f = fill(st.pages, hs);
    const cls = f.m === f.of ? 'full' : f.m ? 'part' : '';
    const ck = '<button type="button" class="tzm-ck ' + cls + (st.editable ? '' : ' ro') + '" data-tzm="tickjuz" data-j="' + j + '"' +
      (cls ? ' style="--p:' + Math.round(f.m / f.of * 100) + '%"' : '') +
      ' aria-label="' + (cls === 'full' ? 'Juz ' + j + ' memorised — tap to clear' : 'Mark juz ' + j + ' memorised') + '"' + (st.editable ? '' : ' tabindex="-1"') + '>' +
      '<i>' + (cls === 'full' ? '✓' : '') + '</i></button>';
    return '<div class="tzm-jc' + (st.editable || st.openReadOnly ? '' : ' ro') + '" data-tzm="juz" data-j="' + j + '" role="button" tabindex="0" aria-label="Open juz ' + j + '">' + j + ck +
      bar(st.pages, juzStart(j), juzEnd(j)) + '</div>';
  }).join('') + '</div>';
}
/* mp6: the same search as everywhere else (surahMatches in the shared file:
   other names, Arabic, spellings that sound alike), used here as a filter. */
let _mq = { q: null, set: null, order: null };
function matchInfo(q) {
  const t = String(q || '').trim();
  if (!t) return null;
  if (_mq.q !== t) { const order = surahMatches(t, 114).map((x) => x.num - 1); _mq = { q: t, set: new Set(order), order }; }
  return _mq;
}
function surahMatch(i, q) { const m = matchInfo(q); return !m || m.set.has(i); }
/* Searching lists the best match first; cleared, the list is in surah order. */
function orderSurahs(el, q) {
  const list = el.querySelector('.tzm-slist'); if (!list) return 0;
  const m = matchInfo(q), none = list.querySelector('.tzm-snone');
  const items = new Map([...list.querySelectorAll('.tzm-si')].map((x) => [+x.dataset.s, x]));
  const order = m ? m.order : [...items.keys()].sort((a, b) => a - b);
  items.forEach((x, i) => { x.hidden = !!m && !m.set.has(i); });
  order.forEach((i) => { const x = items.get(i); if (x) list.insertBefore(x, none); });
  if (none) none.hidden = !m || m.order.length > 0;
  return m ? m.order.length : items.size;
}
function surahBar(st, i) {
  const [a, z] = surahAbs(i);
  return '<span class="tzm-bar">' + halvesOfAbs(a, z).map((h) => {
    const r = halfAbs(h), x = Math.max(a, r[0]), y = Math.min(z, r[1]);
    return '<span class="tzm-c-' + (countIn(st.bits, x, y) ? st.pages[h] : '-') + '"></span>';
  }).join('') + '</span>';
}
function surahView(st) {
  const search = '<input type="search" class="tzm-sq" data-tzmin="sq" placeholder="Find a surah: name or number" aria-label="Find a surah" autocomplete="off" value="' + esc(st.sq || '') + '">';
  const items = SURAH_NAMES.map((nm, i) => {
    // mp5: exact to the ayah — a neighbour sharing the page is not touched.
    const [a, z] = surahAbs(i), n = AYAH_COUNTS[i], m = countIn(st.bits, a, z);
    const cls = m === n ? 'full' : m ? 'part' : '';
    const q = !m ? '—' : m === n ? 'all' : m + '/' + n;
    const row = '<div class="tzm-srow">' +
      '<button type="button" class="tzm-box ' + cls + (st.editable ? '' : ' ro') + '" data-tzm="ticksurah" data-s="' + i + '" aria-label="' +
        (cls === 'full' ? esc(nm) + ' memorised — tap to clear' : 'Mark ' + esc(nm) + ' memorised') + '"><i>' + (cls === 'full' ? '✓' : '') + '</i></button>' +
      '<button type="button" class="tzm-sn" data-tzm="surah" data-s="' + i + '">' + (i + 1) + ' · ' + esc(nm) + '</button>' +
      surahBar(st, i) + '<span class="q" title="' + (m && m < n ? m + ' of ' + n + ' ayahs' : '') + '">' + q + '</span></div>';
    let more = '';
    if (st.ayr === i) {
      const p1 = surahSpan(i)[0];
      const fa = Math.max(1, Math.min(n, st.ayrFrom || 1)), ta = Math.max(1, Math.min(n, st.ayrTo || n));
      const hs = halvesForRange(...surahRangeKeys(i, fa, ta));
      more = '<div class="tzm-ayr">' +
        (st.editable
          ? '<div class="r">Ayahs <input type="number" min="1" max="' + n + '" data-tzmin="from" value="' + (st.ayrFrom || 1) + '" aria-label="From ayah"> to ' +
              '<input type="number" min="1" max="' + n + '" data-tzmin="to" value="' + (st.ayrTo || n) + '" aria-label="To ayah"><span class="tzm-note">of ' + n + '</span></div>' +
            '<span class="tzm-note tzm-hs">' + (hs.length ? 'Exactly these ayahs · on the juz view, ' + esc(halvesText(hs[0], hs[hs.length - 1])) : '') + '</span>' +
            '<div class="tzm-acts"><button type="button" class="g" data-tzm="ayrmark">✓ Mark memorised</button><button type="button" data-tzm="ayrclear">Clear these ayahs</button></div>'
          : (m && m < n ? '<span class="tzm-note">' + esc(memoText(st.bits, i)) + '</span>' : '')) +
        '<div class="tzm-acts"><button type="button" data-tzm="juzof" data-p="' + p1 + '">Open juz ' + juzOfPage(p1) + '</button></div></div>';
    }
    return '<div class="tzm-si" data-s="' + i + '"' + (surahMatch(i, st.sq) ? '' : ' hidden') + '>' + row + more + '</div>';
  }).join('');
  return search + '<div class="tzm-slist">' + items + '<div class="tzm-note tzm-snone" hidden>No surah by that name.</div></div>';
}
/* "Ayahs 1–40 memorised" for a surah done in part. */
function memoText(b, i) {
  const [a, z] = surahAbs(i), runs = [];
  for (let v = a; v <= z; v++) {
    if (!b[v]) continue;
    let w = v; while (w + 1 <= z && b[w + 1]) w++;
    runs.push(w > v ? (v - a + 1) + '–' + (w - a + 1) : String(v - a + 1)); v = w;
  }
  return 'Ayahs ' + runs.join(', ') + ' memorised';
}
function juzEditor(st) {
  const j = st.juz, a = juzStart(j), b = juzEnd(j);
  const cells = [];
  for (let pg = a; pg <= b; pg++) {
    const h0 = (pg - 1) * 2, c0 = st.pages[h0], c1 = st.pages[h0 + 1];
    const both = MEMO(c0) && MEMO(c1) && c0 !== 'n' && c1 !== 'n';
    const rk = st.recentAuto ? '' : (c0 === 'r' || c1 === 'r') ? '<span class="tzm-rk">R</span>' : '';
    cells.push('<div class="tzm-pc" data-pg="' + pg + '" title="p. ' + pg + ' · ' + STATES[c0] + (c0 !== c1 ? ' / ' + STATES[c1] : '') + '">' +
      '<span class="tzm-pn">' + pg + '</span>' + rk +
      '<div class="tzm-hf s-' + c0 + '" data-h="' + h0 + '"></div><div class="tzm-hf s-' + c1 + '" data-h="' + (h0 + 1) + '"></div>' +
      (both ? '<span class="tzm-tk">✓</span>' : '') + '</div>');
  }
  const head = '<div class="tzm-head"><button type="button" class="tzm-back" data-tzm="out">‹ All juz</button><b>Juz ' + j + '</b>' +
    '<span class="tzm-note">pages ' + a + '–' + b + '</span></div>';
  if (!st.editable) return head + '<div class="tzm-pgrid" style="touch-action:auto">' + cells.join('') + '</div>' + legend();
  const modes = [['m', '✓ Memorised', 'g'], ['n', 'New lesson', ''], ['-', 'Not yet', '']]
    .concat(st.recentAuto ? [] : [['o', 'Old', ''], ['r', 'Recent', '']]);
  return head +
    '<div class="tzm-seg" role="group" aria-label="Tapping marks">' + modes.map(([k, l, c]) =>
      '<button type="button" class="' + c + '" data-tzm="brush" data-b="' + k + '" aria-pressed="' + (st.brush === k) + '">' + l + '</button>').join('') + '</div>' +
    '<label class="tzm-chk"><input type="checkbox" data-tzmin="halves"' + (st.halves ? ' checked' : '') + '> Half pages — tap the top or bottom half of a page</label>' +
    '<span class="tzm-note">' + (st.brush === 'm' ? 'Tap a page to tick it, tap again to untick. Drag across pages to tick a run.'
      : 'Tap a page to mark it as ' + STATES[st.brush === '-' ? '-' : st.brush].toLowerCase() + '. Drag across pages for a run.') + '</span>' +
    '<div class="tzm-pgrid" data-tzm-grid="1">' + cells.join('') + '</div>' +
    '<div class="tzm-acts"><button type="button" class="g" data-tzm="all" data-b="m">✓ Whole juz memorised</button>' +
      '<button type="button" data-tzm="all" data-b="-">Clear juz</button></div>';
}
function autoNote(st) {
  if (!st.editable || (st.recentAuto && !st.help)) return '';
  const s = summary(st.pages);
  return '<div class="tzm-auto">' + (st.recentAuto
    ? '<span><b>Old or recent?</b> Ticked pages are recent when they are in the new lesson’s juz' +
        (s.recentJuz.length ? ' (Juz ' + s.recentJuz.join(', ') + ')' : '') + ', old otherwise.</span><button type="button" data-tzm="byhand">Set by hand instead</button>'
    : '<span>Old and recent are set by hand (R marks recent pages).</span><button type="button" data-tzm="auto">Follow the new lesson again</button>') + '</div>';
}
function draw(el) {
  const st = el._tzm;
  const body = st.juz ? juzEditor(st)
    : '<div class="tzm-top"><div class="tzm-seg" role="group" aria-label="View"><button type="button" data-tzm="view" data-v="juz" aria-pressed="' + (st.view === 'juz') + '">By juz</button>' +
        '<button type="button" data-tzm="view" data-v="surah" aria-pressed="' + (st.view === 'surah') + '">By surah</button></div>' +
        (st.editable ? '<button type="button" class="tzm-q" data-tzm="help" aria-expanded="' + !!st.help + '" aria-label="How to mark the map" title="How to mark the map">?</button>' : '') + '</div>' +
      (st.editable && st.help ? '<span class="tzm-note">' + (st.view === 'surah'
        ? 'Tick a surah to mark all of it, exactly to the ayah. Tap its name to mark a range of ayahs.'
        : 'Tap ○ to mark a whole juz memorised (tap ✓ again to clear it). Tap the juz itself to mark single pages.') + '</span>' : '') +
      legend() + (st.view === 'surah' ? surahView(st) : juzView(st));
  el.innerHTML = '<div class="tzm' + (st.recentAuto ? '' : ' byhand') + '">' + body + autoNote(st) + '</div>';
  if (!st.juz && st.view === 'surah' && st.sq) orderSurahs(el, st.sq);
}

/* ── editing ────────────────────────────────────────────────────────────── */
// What "memorised" writes: Old (derive() makes it Recent when it belongs there).
function tickValue(st, cur) { return cur === 'r' && !st.recentAuto ? 'r' : 'o'; }
function writeHalves(st, hs, mode) {
  // mp5: marking a half page marks all of its ayahs; clearing it clears them.
  if (st.bits) hs.forEach((h) => { const r = halfAbs(h); st.bits.fill(mode === 'u' ? 0 : 1, r[0], r[1] + 1); });
  const a = st.pages.split('');
  hs.forEach((h) => {
    if (mode === 'm') { if (a[h] === '-') a[h] = 'o'; }
    else if (mode === 'u') a[h] = '-';
    else a[h] = mode;
  });
  st.pages = a.join('');
  if (mode === 'o' || mode === 'r') st.recentAuto = false;
}
function commit(el) {
  const st = el._tzm;
  if (st.recentAuto) st.pages = derive(st.pages);
  st.bits = reconcileBits(st.pages, st.bits);
  draw(el);
  if (st.onChange) st.onChange(st.pages, st.recentAuto, ayahsText(st.bits));
}
/* mp5: after ayahs change, the half pages follow — a half with any ayah
   memorised is memorised, one with none is not. */
function syncHalves(st, hs) {
  const p = st.pages.split('');
  hs.forEach((h) => {
    const r = halfAbs(h), any = countIn(st.bits, r[0], r[1]) > 0;
    if (any && p[h] === '-') p[h] = 'o';
    else if (!any) p[h] = '-';
  });
  st.pages = p.join('');
}
function setAyahs(st, a, z, on) { st.bits.fill(on ? 1 : 0, a, z + 1); syncHalves(st, halvesOfAbs(a, z)); }
function tickAll(st, hs) {
  const full = hs.every((h) => st.pages[h] !== '-');
  writeHalves(st, hs, full ? 'u' : 'm');
}
// The halves a tap reaches: the half under the finger with "Half pages" on,
// otherwise the whole page.
function targetHalves(st, cell, hf) {
  if (st.halves && hf) return [+hf.dataset.h];
  const pg = +cell.dataset.pg; return [(pg - 1) * 2, (pg - 1) * 2 + 1];
}

/* mp5: the ayah fields update the state and the note in place. Redrawing
   here (as mp4 did on change) replaced the panel on blur, so a click on
   "Mark memorised" right after typing could be lost. */
function ayrInput(el, t) {
  const st = el._tzm, n = AYAH_COUNTS[st.ayr];
  if (t.dataset.tzmin === 'from') st.ayrFrom = +t.value || 1; else st.ayrTo = +t.value || n;
  const note = el.querySelector('.tzm-ayr .tzm-hs');
  if (!note) return;
  const fa = Math.max(1, Math.min(n, st.ayrFrom || 1)), ta = Math.max(1, Math.min(n, st.ayrTo || n));
  const hs = halvesForRange(...surahRangeKeys(st.ayr, fa, ta));
  note.textContent = hs.length ? 'Exactly these ayahs · on the juz view, ' + halvesText(hs[0], hs[hs.length - 1]) : '';
}
function attach(el) {
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tzm]'); if (!t || !el.contains(t)) return;
    const st = el._tzm, a = t.dataset.tzm;
    if (a === 'view') { st.view = t.dataset.v; st.ayr = null; return draw(el); }
    if (a === 'help') { st.help = !st.help; return draw(el); }
    if (a === 'tickjuz') { e.stopPropagation(); if (!st.editable) return; tickAll(st, halvesOf(juzStart(+t.dataset.j), juzEnd(+t.dataset.j))); return commit(el); }
    if (a === 'juz') { if (!st.editable && !st.openReadOnly) return; st.juz = +t.dataset.j; return draw(el); }
    if (a === 'ticksurah') { if (!st.editable) return; tickSurah(st, +t.dataset.s); return commit(el); }
    if (a === 'surah') { const i = +t.dataset.s; st.ayr = st.ayr === i ? null : i; st.ayrFrom = 1; st.ayrTo = AYAH_COUNTS[i]; return draw(el); }
    if (a === 'juzof') { st.juz = juzOfPage(+t.dataset.p); st.ayr = null; return draw(el); }
    if (a === 'out') { st.juz = null; return draw(el); }
    if (!st.editable) return;
    if (a === 'brush') { st.brush = t.dataset.b; return draw(el); }
    if (a === 'all') { const hs = halvesOf(juzStart(st.juz), juzEnd(st.juz)); writeHalves(st, hs, t.dataset.b === 'm' ? 'm' : 'u'); return commit(el); }
    if (a === 'ayrmark' || a === 'ayrclear') {
      const [k1, k2] = surahRangeKeys(st.ayr, st.ayrFrom, st.ayrTo);
      setAyahs(st, keyAbs(k1), keyAbs(k2), a === 'ayrmark'); return commit(el);
    }
    if (a === 'auto') { st.recentAuto = true; if (st.brush === 'o' || st.brush === 'r') st.brush = 'm'; return commit(el); }
    if (a === 'byhand') { st.recentAuto = false; return commit(el); }
  });
  // mp5: the surah search filters in place, so typing keeps the focus.
  el.addEventListener('input', (e) => {
    const t = e.target, st = el._tzm;
    if (st && (t.dataset.tzmin === 'from' || t.dataset.tzmin === 'to')) return ayrInput(el, t);
    if (!st || t.dataset.tzmin !== 'sq') return;
    st.sq = t.value;
    orderSurahs(el, st.sq);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.tzmin === 'sq') {
      e.preventDefault();
      // Enter opens the best match.
      const first = [...el.querySelectorAll('.tzm-si')].find((x) => !x.hidden);
      if (first && el._tzm.sq) { const b = first.querySelector('[data-tzm="surah"]'); if (b) b.click(); }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest('.tzm-jc[data-tzm="juz"]'); if (!t || e.target !== t) return;
    e.preventDefault(); t.click();
  });
  el.addEventListener('change', (e) => {
    const t = e.target, st = el._tzm; if (!st) return;
    if (t.dataset.tzmin === 'halves') { st.halves = t.checked; return draw(el); }
    if (t.dataset.tzmin === 'sq') return;
    if (t.dataset.tzmin === 'from' || t.dataset.tzmin === 'to') return ayrInput(el, t);
  });
  /* Press, then drag across pages: the first page decides the action for the
     whole run (tick, or untick if it was already ticked), so a drag never
     flips pages back and forth. One save at the end. */
  let run = null;
  const visit = (cell, hf) => {
    const st = el._tzm, hs = targetHalves(st, cell, hf).filter((h) => !run.done.has(h));
    if (!hs.length) return;
    hs.forEach((h) => run.done.add(h));
    writeHalves(st, hs, run.mode);
    hs.forEach((h) => { const c = el.querySelector('.tzm-hf[data-h="' + h + '"]'); if (c) c.className = 'tzm-hf s-' + st.pages[h]; });
    const tk = cell.querySelector('.tzm-tk'), both = targetHalves({ halves: false }, cell, null).every((h) => MEMO(st.pages[h]) && st.pages[h] !== 'n');
    if (both && !tk) cell.insertAdjacentHTML('beforeend', '<span class="tzm-tk">✓</span>'); else if (!both && tk) tk.remove();
  };
  el.addEventListener('pointerdown', (e) => {
    const st = el._tzm; if (!st || !st.editable) return;
    const cell = e.target.closest('.tzm-pc[data-pg]'); if (!cell || !el.contains(cell)) return;
    e.preventDefault();
    const hf = e.target.closest('.tzm-hf');
    const first = targetHalves(st, cell, hf);
    let mode = st.brush;
    if (mode === 'm') mode = first.every((h) => st.pages[h] !== '-' && st.pages[h] !== 'n') ? 'u' : 'm';
    else if (mode === '-') mode = 'u';
    run = { mode, done: new Set() };
    visit(cell, hf);
  });
  el.addEventListener('pointermove', (e) => {
    if (!run) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const cell = hit && hit.closest && hit.closest('.tzm-pc[data-pg]');
    if (!cell || !el.contains(cell)) return;
    visit(cell, hit.closest('.tzm-hf'));
  });
  const end = () => { if (!run) return; const changed = run.done.size; run = null; if (changed) commit(el); };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
/* A surah's first and last pages are usually shared with its neighbours, so
   ticking it marks its own ayahs (mp5: exactly), not the whole of those
   pages. Ticked again when all of it is memorised, it is cleared. */
function tickSurah(st, i) {
  const [a, z] = surahAbs(i);
  setAyahs(st, a, z, countIn(st.bits, a, z) < z - a + 1);
}

/* Draw the map into `el`. Calling again with new pages keeps the view the
   teacher was in (which juz is open, which mark, half pages). */
function render(el, opts) {
  injectCss();
  const first = !el._tzm;
  el._tzm = {
    view: 'juz', juz: null, brush: 'm', halves: false, ayr: null,
    ...(opts.state || {}),     // the host's copy, when it re-created the container
    ...(el._tzm || {}),
    pages: valid(opts.pages) ? opts.pages : empty(),
    recentAuto: opts.recentAuto !== false,
    bits: null,
    editable: !!opts.editable, openReadOnly: opts.openReadOnly !== false,
    onChange: opts.onChange || null,
  };
  el._tzm.bits = reconcileBits(el._tzm.pages, parseAyahs(opts.ayahs || '') || bitsEmpty());
  if (first) attach(el);
  // Redrawing while the teacher types in the search keeps the field and caret.
  const ae = document.activeElement, typing = ae && el.contains(ae) && ae.dataset && ae.dataset.tzmin === 'sq';
  const caret = typing ? ae.selectionStart : null;
  draw(el);
  if (typing) { const q = el.querySelector('[data-tzmin="sq"]'); if (q) { q.focus({ preventScroll: true }); try { q.setSelectionRange(caret, caret); } catch (_) {} } }
}
// Where the teacher was, for a host that redraws the container.
function viewState(el) {
  const s = el && el._tzm;
  return s ? { view: s.view, juz: s.juz, brush: s.brush, halves: s.halves, ayr: s.ayr, ayrFrom: s.ayrFrom, ayrTo: s.ayrTo, sq: s.sq } : null;
}

window.TehfizMap = { LEN, empty, valid, derive, summary, newText, halvesText, nextHalf, juzOfPage, juzStart, juzEnd, halfKeys, halvesKeys, juzKeys,
                     halvesForRange, stageFor, withLesson, render, viewState,
                     reconcile, withRanges, validAyahs: (x) => parseAyahs(x) !== null, version: TEHFIZ_MAP_VERSION };
})();
