/* ═══════════════════════════════════════════════════════════════════════
   range-picker.js — TehfizRange — rg5
   Loaded by the teacher app only, from /app/teacher/range-picker.js?v=rg5.

   rg5: with only the first page (or half) picked, the end still to come,
   the selected range says so and Set reads "Set only p. 22, first half" —
   a range of half a page had been set by accident when the end tap was
   missed.

   rg4: verse numbers are typed (no verse grid); the surah's pages stay open
   under From/To while typing, and typing updates the tiles and the selected
   range in place, so nothing redraws, loses focus or jumps. Picking a From
   surah selects all of it; Enter in From goes to To, in To sets the range.

   rg3: part of a juz or a surah. Pages has 1st half, 2nd half and quarters
   of the open juz, cut at the mushaf's hizb markers (RUB below: the first
   verse of each of the 240 quarter-hizb, verse numbers through the mushaf,
   from quran.com) — exact verses, not half pages. Surah & verse shows the
   chosen surah's own pages when From and To are in one surah: tap the first
   and last page (or First page, First 2 pages, First half, Second half);
   the range never leaves the surah.

   "Set range" for a session segment or a planned lesson segment. Two tabs,
   both big piece first, then narrow it:

     Juz & page     tap a juz to open its pages (nothing is selected yet);
                    "Select all of Juz N" takes the whole juz. Each page is
                    one block with a dotted line across the middle, coloured
                    from the student's memorisation map. With a mouse, the
                    half under the pointer lights up and a click takes it;
                    the page number takes the whole page. On a touch screen:
                    tap a page for all of it, again for its first half, again
                    for its second half. First pick is the start, the next
                    one the end (which can be in another juz).
     Surah & verse  From and To each get a surah (search by name or number)
                    and then a verse number from a grid.

   The selection is a gold outline drawn over the map colours, never a fill,
   so what is memorised stays visible under it.

   TehfizRange.open({
     title, start, end,            // verse keys of the current range, if any
     unit,                         // 'juz' | 'verses' (older units are mapped)
     pages,                        // the student's map (1208 chars) or null
     stage,                        // 'new' | 'recent' | 'old' | other
     oldJuz,                       // the old juz due in rotation, if known
     mushaf,                       // {juz, surah, page} when the mushaf is open
     onWords,                      // "Tap words instead" (session only)
     onSet(r)                      // r = {startKey, endKey, label, unit, text}
   })

   rg2: Juz and Pages are separate boxes with headings and a line on what
   tapping does; "Select whole juz" mode picks one juz or a run of them.
   The summary at the bottom is labelled "Selected range".

   Self-contained: namespace window.TehfizRange, CSS prefixed .trg-. Reads
   SURAH_NAMES, AYAH_COUNTS, JUZ_PAGES, surahMatches, keyAbs and TehfizMap.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_RANGE_VERSION = 'rg5';
// rg3: the first verse (1–6236) of each quarter-hizb; 8 to a juz.
const RUB = [1,33,51,67,82,99,113,131,149,165,184,196,210,226,240,250,260,270,279,290,308,326,345,368,386,406,426,446,464,479,494,505,517,529,551,567,581,593,607,628,641,656,670,681,696,710,720,736,751,766,778,802,825,848,863,884,900,916,930,940,955,985,1001,1019,1042,1071,1096,1110,1125,1143,1161,1182,1201,1221,1236,1254,1269,1281,1295,1310,1328,1346,1357,1375,1390,1417,1435,1454,1479,1497,1514,1534,1557,1581,1603,1626,1649,1673,1697,1712,1726,1742,1760,1778,1803,1851,1902,1931,1952,1976,1991,2012,2030,2052,2079,2099,2128,2157,2172,2191,2215,2239,2272,2309,2349,2403,2431,2459,2484,2512,2534,2566,2596,2614,2633,2655,2674,2709,2748,2792,2812,2826,2844,2856,2876,2908,2933,2984,3043,3113,3160,3186,3215,3241,3264,3281,3303,3328,3341,3366,3386,3410,3440,3463,3491,3514,3534,3551,3564,3584,3593,3616,3630,3652,3675,3701,3733,3765,3810,3871,3933,3991,4022,4066,4090,4111,4134,4154,4174,4199,4227,4243,4265,4285,4299,4323,4349,4382,4431,4485,4511,4531,4555,4578,4601,4613,4626,4657,4706,4759,4810,4855,4902,4980,5054,5091,5105,5118,5137,5157,5178,5192,5218,5230,5242,5272,5324,5394,5448,5495,5552,5610,5673,5759,5830,5885,5949,6024,6091,6155];
const NV = 6236;
/* Juz j, quarters q1..q2 (1–4, two rub each): verse numbers [a, z]. */
function juzPart(j, q1, q2) {
  const r = (i) => RUB[(j - 1) * 8 + i];
  const a = r((q1 - 1) * 2), z = q2 < 4 ? r(q2 * 2) - 1 : (j < 30 ? RUB[j * 8] - 1 : NV);
  return [a, z];
}
const JPARTS = [[1, 2, '1st half'], [3, 4, '2nd half'], [1, 1, '1st quarter'], [2, 2, '2nd quarter'], [3, 3, '3rd quarter'], [4, 4, '4th quarter']];
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = () => window.TehfizMap;
const H = (p, h) => (p - 1) * 2 + h;               // half-page index; h 0 = first half
const pageOf = (i) => Math.floor(i / 2) + 1;
const jFirst = (j) => JUZ_PAGES[j - 1];
const jLast = (j) => (j === 30 ? 604 : JUZ_PAGES[j] - 1);
function juzOf(p) { let j = 1; for (let i = 0; i < 30; i++) if (JUZ_PAGES[i] <= p) j = i + 1; return j; }
const KIND = { o: 'o', r: 'r', n: 'n' };

let S = null;          // the open picker's state
let lastPointer = 'mouse';

/* ── open / close ───────────────────────────────────────────────────────── */
function open(o) {
  injectCss();
  const pages = M() && M().valid(o.pages) ? o.pages : null;
  S = {
    title: o.title || 'Set range', onSet: o.onSet || null, onWords: o.onWords || null,
    pages, stage: o.stage || '', oldJuz: o.oldJuz || null, mushaf: o.mushaf || null,
    unit: o.unit === 'verses' || o.unit === 'ayah' || o.unit === 'surah' ? 'verses' : 'juz',
    jmode: 'open', jfirst: null, a: null, b: null, tap: 'a', whole: null, cyc: null, before: null, openJuz: 1, exact: null, sptap: 'a',
    from: { s: 1, a: 1 }, to: { s: 1, a: 7 }, act: null, q: '',
  };
  const okKeys = o.start && o.end && keyAbs(o.start) && keyAbs(o.end);
  if (okKeys) {
    // The range already set: shown both ways, opened on the tab it was set in.
    const hs = M() ? M().halvesForRange(o.start, o.end) : [];
    if (hs.length) { S.a = hs[0]; S.b = hs[hs.length - 1]; S.openJuz = juzOf(pageOf(S.a)); }
    const [s1, a1] = o.start.split(':').map(Number), [s2, a2] = o.end.split(':').map(Number);
    S.from = { s: s1, a: a1 }; S.to = { s: s2, a: a2 };
    const j1 = juzOf(pageOf(S.a || 0)), w = M() && M().juzKeys;
    if (w) { for (let j2 = j1; j2 <= 30; j2++) if (w(j1)[0] === o.start && w(j2)[1] === o.end) { S.whole = { f: j1, t: j2 }; break; } }
  } else if (S.mushaf && S.mushaf.juz) {
    S.openJuz = S.mushaf.juz;
  } else if (pages) {
    const h = M().nextHalf(pages), last = pages.lastIndexOf('n');
    S.openJuz = juzOf(pageOf(h != null ? h : Math.max(0, last)));
  }
  if (!okKeys && S.mushaf && S.mushaf.surah) { S.from = { s: S.mushaf.surah, a: 1 }; S.to = { s: S.mushaf.surah, a: 1 }; }
  let root = $('trgRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'trgRoot';
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    // rg4: leaving a verse box tidies what was typed (blank or too big).
    root.addEventListener('focusout', (e) => { if (S && e.target.dataset && e.target.dataset.trgv) liveVerse(e.target, true); });
    root.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; }, true);
    root.addEventListener('keydown', onKey);
  }
  render();
  const first = root.querySelector('.trg-tab.on');
  if (first) first.focus({ preventScroll: true });
}
function close() { S = null; const r = $('trgRoot'); if (r) r.innerHTML = ''; }
function isOpen() { return !!S; }

/* ── result ─────────────────────────────────────────────────────────────── */
function verseCount(f, t) {
  const a = absVerse(f.s, f.a), b = absVerse(t.s, t.a);
  return b >= a ? b - a + 1 : 0;
}
function result() {
  if (S.unit === 'verses') {
    if (!verseCount(S.from, S.to)) return { error: 'To comes before From. Pick a later verse for To.' };
    const sk = S.from.s + ':' + S.from.a, ek = S.to.s + ':' + S.to.a;
    const nm = (n) => SURAH_NAMES[n - 1];
    let label;
    if (S.from.s === S.to.s) label = S.from.a === 1 && S.to.a === AYAH_COUNTS[S.to.s - 1] ? nm(S.from.s) : nm(S.from.s) + ' ' + S.from.a + '–' + S.to.a;
    else label = nm(S.from.s) + ' ' + S.from.a + ' → ' + nm(S.to.s) + ' ' + S.to.a;
    return { startKey: sk, endKey: ek, label, unit: 'verses', text: sk + '-' + ek, sub: sk + ' → ' + ek + ' · ' + verseCount(S.from, S.to) + ' verses' };
  }
  if (S.a == null) return { error: 'Open a juz and pick pages, or select all of it.' };
  const lo = Math.min(S.a, S.b), hi = Math.max(S.a, S.b);
  let keys, label;
  if (S.exact) {
    // rg3: part of a juz, at the hizb markers — exact verses.
    const k1 = keyFromAbs(S.exact.a), k2 = keyFromAbs(S.exact.z);
    return { startKey: k1, endKey: k2, label: S.exact.label, unit: 'juz', text: k1 + '-' + k2,
             sub: k1 + ' → ' + k2 + ' · ' + (S.exact.z - S.exact.a + 1) + ' verses' };
  }
  if (S.whole) {
    keys = [M().juzKeys(S.whole.f)[0], M().juzKeys(S.whole.t)[1]];
    label = S.whole.f === S.whole.t ? 'Juz ' + S.whole.f : 'Juz ' + S.whole.f + '–' + S.whole.t;
  } else {
    keys = M().halvesKeys(lo, hi);
    label = M().halvesText(lo, hi);
  }
  const n = (hi - lo + 1) / 2;
  return { startKey: keys[0], endKey: keys[1], label, unit: 'juz', text: lo + '-' + hi,
           sub: keys[0] + ' → ' + keys[1] + ' · ' + (n % 1 ? n.toFixed(1) : n) + ' page' + (n === 1 ? '' : 's') };
}
/* rg5: a start has been picked on the pages and the end has not. */
function endPending() {
  return !!S && S.unit === 'juz' && S.a != null && S.tap === 'b' && !S.whole && !S.exact;
}
function apply() {
  const r = result();
  if (!r || r.error) return;
  const cb = S.onSet; close();
  if (cb) cb(r);
}

/* ── shortcuts ──────────────────────────────────────────────────────────── */
function shortcuts() {
  const out = [];
  if (S.mushaf) {
    if (S.mushaf.juz) out.push({ id: 'cj', label: 'Current juz' });
    if (S.mushaf.surah) out.push({ id: 'cs', label: 'Current surah' });
    if (S.mushaf.page) out.push({ id: 'cp', label: 'Current page' });
    return out;
  }
  const p = S.pages; if (!p) return out;
  const sum = M().summary(p), h = M().nextHalf(p);
  if (S.stage === 'new' || !S.stage) {
    if (h != null) {
      out.push({ id: 'h', a: h, b: h, label: 'Next: ' + M().halvesText(h, h) });
      if (h + 1 < M().LEN) out.push({ id: 'h', a: h, b: h + 1, label: 'Next page: ' + M().halvesText(h, h + 1) });
      const j = juzOf(pageOf(h)), end = H(jLast(j), 1);
      if (end > h + 1) out.push({ id: 'h', a: h, b: end, label: 'Rest of Juz ' + j });
    }
    if (sum.newAt) out.push({ id: 'h', a: sum.newAt.from, b: sum.newAt.to, label: 'Repeat: ' + M().newText(sum) });
  }
  if (S.stage === 'recent') sum.recentJuz.forEach((j) => out.push({ id: 'j', j, label: 'Recent: Juz ' + j }));
  if (S.stage === 'old' && S.oldJuz) out.push({ id: 'j', j: S.oldJuz, label: 'Next in rotation: Juz ' + S.oldJuz });
  return out;
}
function runShortcut(x) {
  const m = S.mushaf;
  S.act = null;
  if (x.id === 'cs' && m) { S.unit = 'verses'; S.from = { s: m.surah, a: 1 }; S.to = { s: m.surah, a: AYAH_COUNTS[m.surah - 1] }; return; }
  S.unit = 'juz'; S.tap = 'a'; S.cyc = null; S.exact = null;
  if (x.id === 'cj' && m) return selectJuz(m.juz);
  if (x.id === 'cp' && m) { S.whole = null; S.a = H(m.page, 0); S.b = H(m.page, 1); S.openJuz = juzOf(m.page); return; }
  if (x.id === 'j') return selectJuz(x.j);
  S.whole = null; S.a = x.a; S.b = x.b; S.openJuz = juzOf(pageOf(x.a));
}
function selectJuz(j) { S.exact = null; S.whole = { f: j, t: j }; S.a = H(jFirst(j), 0); S.b = H(jLast(j), 1); S.openJuz = j; S.tap = 'a'; S.cyc = null; }

/* ── picking pages ──────────────────────────────────────────────────────── */
/* lo..hi is one pick: a whole page or a half. The first pick is the start,
   the next the end; a later end before the start swaps them. */
function pick(lo, hi) {
  S.whole = null; S.exact = null;
  if (S.tap === 'a' || S.a == null) { S.a = lo; S.b = hi; S.tap = 'b'; return; }
  if (hi < S.a) { S.b = Math.max(S.a, S.b); S.a = lo; } else S.b = hi;
  S.tap = 'a';
}
function snap() { S.before = { a: S.a, b: S.b, tap: S.tap, whole: S.whole, exact: S.exact }; }
/* rg3: part of the open juz at the hizb markers. */
function selectPart(i) {
  const j = S.openJuz, [q1, q2, nm] = JPARTS[i], [a, z] = juzPart(j, q1, q2);
  const hs = M().halvesForRange(keyFromAbs(a), keyFromAbs(z));
  S.whole = null; S.a = hs[0]; S.b = hs[hs.length - 1]; S.tap = 'a'; S.cyc = null;
  S.exact = { a, z, j, i, label: 'Juz ' + j + ', ' + nm };
}
function pagePick(p, half) {
  if (half == null) { snap(); S.cyc = { p, m: 0 }; return pick(H(p, 0), H(p, 1)); }   // the page number: all of it
  if (lastPointer === 'touch') {
    // Touch has no hover: all of the page, then its first half, then its second.
    if (S.cyc && S.cyc.p === p && S.before) { S.cyc.m = (S.cyc.m + 1) % 3; Object.assign(S, S.before); }
    else { snap(); S.cyc = { p, m: 0 }; }
    const m = S.cyc.m;
    return pick(m === 2 ? H(p, 1) : H(p, 0), m === 1 ? H(p, 0) : H(p, 1));
  }
  snap(); S.cyc = null;
  pick(H(p, half), H(p, half));
}

/* ── render ─────────────────────────────────────────────────────────────── */
function kindOf(i) { return S.pages ? (KIND[S.pages[i]] || '0') : '0'; }
function juzGrid() {
  const lo = S.a == null ? -1 : Math.min(S.a, S.b), hi = S.a == null ? -1 : Math.max(S.a, S.b);
  let g = '';
  for (let j = 1; j <= 30; j++) {
    const a = H(jFirst(j), 0), b = H(jLast(j), 1);
    const has = lo >= 0 && hi >= a && lo <= b;
    let bar = '';
    if (S.pages) for (let i = a; i <= b; i += 2) bar += '<span class="trg-k' + kindOf(i) + '"></span>';
    g += '<button type="button" class="trg-j' + (j === S.openJuz ? ' open' : '') + (has ? ' has' : '') + '" data-trg="juz" data-j="' + j + '" aria-pressed="' + (j === S.openJuz) + '"' +
      ' aria-label="Juz ' + j + (has ? ', part of the selection' : '') + '">' + j + (bar ? '<span class="trg-mb">' + bar + '</span>' : '') + '</button>';
  }
  const sel = S.jmode === 'sel';
  const help = sel
    ? (S.jfirst ? 'Juz ' + S.jfirst + ' selected. Tap another juz to select everything up to it, or Set.' : 'Tap a juz to select all of it. Tap a second one to select every juz between them.')
    : 'Tap a juz to show its pages below. Nothing is selected until you pick pages.';
  return '<div class="trg-blk"><div class="trg-bh"><b>Juz</b><div class="trg-mini" role="group" aria-label="What tapping a juz does">' +
      '<button type="button" data-trg="jm" data-m="open" class="' + (sel ? '' : 'on') + '" aria-pressed="' + !sel + '">Show pages</button>' +
      '<button type="button" data-trg="jm" data-m="sel" class="' + (sel ? 'on' : '') + '" aria-pressed="' + sel + '">Select whole juz</button></div></div>' +
    '<p class="trg-help">' + help + '</p><div class="trg-jz">' + g + '</div></div>';
}
function strip() {
  const j = S.openJuz, lo = S.a == null ? -1 : Math.min(S.a, S.b), hi = S.a == null ? -1 : Math.max(S.a, S.b);
  const all = S.whole && S.whole.f === j && S.whole.t === j;
  let h = '';
  for (let p = jFirst(j); p <= jLast(j); p++) {
    const t = H(p, 0), b = H(p, 1), st = t >= lo && t <= hi, sb = b >= lo && b <= hi;
    const sel = st && sb ? '<i class="trg-sel w"></i>' : st ? '<i class="trg-sel t"></i>' : sb ? '<i class="trg-sel b"></i>' : '';
    h += '<div class="trg-pg"><button type="button" class="trg-num' + (st || sb ? ' on' : '') + '" data-trg="pgw" data-p="' + p + '" aria-label="Whole page ' + p + '">' + p + '</button>' +
      '<div class="trg-pc"><button type="button" class="trg-h t trg-k' + kindOf(t) + '" data-trg="half" data-p="' + p + '" data-h="0" aria-label="Page ' + p + ', first half"></button>' +
      '<button type="button" class="trg-h b trg-k' + kindOf(b) + '" data-trg="half" data-p="' + p + '" data-h="1" aria-label="Page ' + p + ', second half"></button>' + sel + '</div></div>';
  }
  return '<div class="trg-blk"><div class="trg-bh"><b>Pages</b><span class="trg-sub">Juz ' + j + ' \u00b7 p. ' + jFirst(j) + '\u2013' + jLast(j) + '</span>' +
      '<button type="button" class="trg-chip' + (all ? ' on' : '') + '" data-trg="all">' + (all ? '\u2713 All of Juz ' + j : 'Select all of Juz ' + j) + '</button></div>' +
    '<div class="trg-parts" role="group" aria-label="Part of Juz ' + j + '">' +
      JPARTS.map(([q1, q2, nm], i) => (i === 2 ? '<span class="trg-pk">Quarter</span>' : '') +
        '<button type="button" class="trg-chip sm' + (S.exact && S.exact.j === j && S.exact.i === i ? ' on' : '') + '" data-trg="part" data-i="' + i + '" title="' +
          esc(keyFromAbs(juzPart(j, q1, q2)[0]) + ' – ' + keyFromAbs(juzPart(j, q1, q2)[1])) + '">' + (i < 2 ? nm : String(i - 1)) + '</button>').join('') +
    '</div>' +
    '<div class="trg-st"><span class="trg-how"></span><span>' + (S.tap === 'a' ? 'Next: the start' : 'Next: the end') + '</span></div>' +
    '<div class="trg-pgs">' + h + '</div>' +
    '<p class="trg-help">The end can be in another juz: show its pages above and pick there.</p>' +
    (S.pages ? '<div class="trg-lg"><span><i class="trg-ko"></i>Old</span><span><i class="trg-kr"></i>Recent</span><span><i class="trg-kn"></i>New lesson</span><span><i class="trg-k0"></i>Not yet</span><span><i class="trg-ksel"></i>Selected</span></div>'
             : '<div class="trg-lg"><span><i class="trg-ksel"></i>Selected</span></div>') + '</div>';
}
function surList(which) {
  const q = S.q.trim();
  const cur = S[which === 'f' ? 'from' : 'to'].s;
  const hits = surahMatches(q.replace(/^\s*\d+\.\s*/, ''), 114);
  return '<input class="trg-in" id="trgQ" type="text" autocomplete="off" spellcheck="false" placeholder="Search a surah by name or number" value="' + esc(S.q) + '" aria-label="Search surahs">' +
    '<div class="trg-list" role="listbox">' + (hits.map((x) => '<button type="button" role="option" class="' + (x.num === cur ? 'on' : '') + '" data-trg="sur" data-s="' + x.num + '"' +
      (which === 't' && x.num < S.from.s ? ' disabled' : '') + '><span class="n">' + x.num + '</span>' + esc(x.name) + '<span class="c">' + AYAH_COUNTS[x.num - 1] + ' v</span></button>').join('') ||
      '<div class="trg-mut" style="padding:6px">No surah matches</div>') + '</div>';
}
/* rg4: a verse number to type. */
function vin(w, e) {
  return '<label class="trg-fld v"><input class="trg-vin" id="trgV' + w + '" data-trgv="' + w + '" type="text" inputmode="numeric" autocomplete="off" maxlength="3" value="' + e.a + '"' +
    ' aria-label="' + (w === 'f' ? 'From' : 'To') + ' verse of ' + esc(SURAH_NAMES[e.s - 1]) + '"><small>/' + AYAH_COUNTS[e.s - 1] + '</small></label>';
}
/* Typing: the state, the page tiles, the chips and the selected range change
   in place — no redraw. */
function liveVerse(inp, final) {
  const w = inp.dataset.trgv, e = S[w === 'f' ? 'from' : 'to'], n = AYAH_COUNTS[e.s - 1];
  const v = parseInt(inp.value, 10);
  if (Number.isFinite(v) && v >= 1) e.a = Math.min(n, v);
  if (final) inp.value = e.a;
  S.sptap = 'a';
  paintLive();
}
function paintLive() {
  const root = $('trgRoot'); if (!root || !S) return;
  const s = S.from.s;
  if (S.to.s === s) {
    const fa = absVerse(S.from.s, S.from.a), ta = absVerse(S.to.s, S.to.a);
    root.querySelectorAll('.trg-spg[data-p]').forEach((b) => {
      const [a, z] = spRange(s, +b.dataset.p);
      b.classList.toggle('in', z >= fa && a <= ta);
      b.classList.toggle('end', (fa >= a && fa <= z) || (ta >= a && ta <= z));
    });
    root.querySelectorAll('[data-trg="spc"]').forEach((b) => {
      b.classList.toggle('on', fa === spRange(s, +b.dataset.x)[0] && ta === spRange(s, +b.dataset.y)[1]);
    });
  }
  const r = result(), pv = root.querySelector('.trg-prev');
  if (pv) {
    pv.classList.toggle('err', !!r.error);
    pv.innerHTML = '<span class="trg-pl">Selected range</span>' + (r.error ? '<b>' + esc(r.error) + '</b>' : '<b>' + esc(r.label) + '</b><span>' + esc(r.sub) + '</span>');
  }
  const set = root.querySelector('[data-trg="set"]'); if (set) set.disabled = !!r.error;
}
function versesHtml() {
  const f = S.from, t = S.to, nm = (s) => s + ' · ' + esc(SURAH_NAMES[s - 1]);
  let h = '<div class="trg-ends">' +
    '<span class="trg-k">From</span><div class="trg-pick"><button type="button" class="trg-fld s' + (S.act === 'fS' ? ' on' : '') + '" data-trg="act" data-k="fS"><span>' + nm(f.s) + '</span><small>▾</small></button>' +
      vin('f', f) + '</div>' +
    '<span class="trg-k">To</span><div class="trg-pick"><button type="button" class="trg-fld s' + (S.act === 'tS' ? ' on' : '') + '" data-trg="act" data-k="tS"><span>' + nm(t.s) + '</span><small>▾</small></button>' +
      vin('t', t) + '</div></div>';
  if (!S.act && f.s === t.s) h += surahPages(f.s);
  if (S.act === 'fS' || S.act === 'tS') h += '<div class="trg-ch"><div class="trg-ct">' + (S.act === 'fS' ? 'From' : 'To') + ': which surah?</div>' + surList(S.act[0]) + '</div>';
  return h;
}
/* rg3: the surah's own pages, each clipped to the surah's verses. */
function spRange(s, p) {
  const sa = absVerse(s, 1), sz = absVerse(s, AYAH_COUNTS[s - 1]);
  const a = PAGE_FIRST_VERSE_ABS[p - 1], z = (p < 604 ? PAGE_FIRST_VERSE_ABS[p] : NV + 1) - 1;
  return [Math.max(a, sa), Math.min(z, sz)];
}
function surahPages(s) {
  const p1 = SURAH_PAGES[(s - 1) * 2], p2 = SURAH_PAGES[(s - 1) * 2 + 1];
  if (!(p2 > p1)) return '';
  const fa = absVerse(S.from.s, S.from.a), ta = absVerse(S.to.s, S.to.a), sa = absVerse(s, 1);
  let tiles = '';
  for (let p = p1; p <= p2; p++) {
    const [a, z] = spRange(s, p), inr = z >= fa && a <= ta, end = (fa >= a && fa <= z) || (ta >= a && ta <= z);
    tiles += '<button type="button" class="trg-spg' + (inr ? ' in' : '') + (end ? ' end' : '') + '" data-trg="spg" data-p="' + p + '" aria-label="Page ' + p + ', ayahs ' + (a - sa + 1) + ' to ' + (z - sa + 1) + '">' +
      '<b>' + p + '</b><small>' + (a - sa + 1) + '–' + (z - sa + 1) + '</small></button>';
  }
  const n = p2 - p1 + 1, half = Math.floor(n / 2);
  const chips = [['First page', p1, p1]].concat(n > 2 ? [['First 2 pages', p1, p1 + 1]] : [])
    .concat(n > 1 ? [['First half', p1, p1 + Math.max(0, half - 1)], ['Second half', p1 + half, p2]] : []);
  const cur = (x, y) => fa === spRange(s, x)[0] && ta === spRange(s, y)[1];
  return '<div class="trg-blk"><div class="trg-bh"><b>Pages of ' + esc(SURAH_NAMES[s - 1]) + '</b><span class="trg-sub">p. ' + p1 + '\u2013' + p2 + '</span></div>' +
    '<p class="trg-help">' + (S.sptap === 'b' ? 'Now tap the last page.' : 'Tap the first page, then the last. Ayahs stay inside ' + esc(SURAH_NAMES[s - 1]) + '.') + '</p>' +
    '<div class="trg-parts">' + chips.map(([l, x, y]) => '<button type="button" class="trg-chip sm' + (cur(x, y) ? ' on' : '') + '" data-trg="spc" data-x="' + x + '" data-y="' + y + '">' + l + '</button>').join('') + '</div>' +
    '<div class="trg-spgs">' + tiles + '</div></div>';
}
function spSet(s, x, y) {
  const sa = absVerse(s, 1), a = spRange(s, Math.min(x, y))[0], z = spRange(s, Math.max(x, y))[1];
  S.from = { s, a: a - sa + 1 }; S.to = { s, a: z - sa + 1 };
}
function render() {
  const root = $('trgRoot');
  if (!root || !S) return;
  const body = root.querySelector('.trg-body'), keep = body ? body.scrollTop : 0;
  const lsKeep = (root.querySelector('.trg-list') || {}).scrollTop || 0;
  const spEl = root.querySelector('.trg-spgs'), spKeep = spEl ? spEl.scrollTop : null;
  const r = result(), sc = shortcuts();
  root.innerHTML = '<div class="trg-wrap"><div class="trg-scrim" data-trg="close"></div>' +
    '<div class="trg-card" role="dialog" aria-modal="true" aria-labelledby="trgT">' +
      '<div class="trg-head"><b id="trgT">' + esc(S.title) + '</b><button type="button" class="trg-x" data-trg="close" aria-label="Close">✕</button></div>' +
      '<div class="trg-body">' +
        '<div class="trg-tabs" role="tablist">' + [['juz', 'Juz & page'], ['verses', 'Surah & verse']].map(([u, l]) =>
          '<button type="button" role="tab" class="trg-tab' + (S.unit === u ? ' on' : '') + '" aria-selected="' + (S.unit === u) + '" data-trg="unit" data-u="' + u + '">' + l + '</button>').join('') + '</div>' +
        (S.unit === 'juz' ? juzGrid() + strip() : versesHtml()) +
        '<div class="trg-prev' + (r.error ? ' err' : '') + (endPending() ? ' wait' : '') + '"><span class="trg-pl">Selected range</span>' + (r.error ? '<b>' + esc(r.error) + '</b>' : '<b>' + esc(r.label) + '</b><span>' + esc(r.sub) + '</span>') +
          (endPending() ? '<em class="trg-wait">That is the start. Tap the last page for the end.</em>' : '') + '</div>' +
        (sc.length ? '<div class="trg-chips">' + sc.map((x, i) => '<button type="button" class="trg-chip" data-trg="sc" data-i="' + i + '">' + esc(x.label) + '</button>').join('') + '</div>' : '') +
      '</div>' +
      '<div class="trg-foot">' + (S.onWords ? '<button type="button" class="trg-btn" data-trg="words">⌖ Tap words instead</button>' : '') +
        '<span class="trg-sp"></span><button type="button" class="trg-btn" data-trg="close">Cancel</button>' +
        '<button type="button" class="trg-btn pri" data-trg="set"' + (r.error ? ' disabled' : '') + '>' + (endPending() && !r.error ? 'Set only ' + esc(r.label) : 'Set') + '</button></div>' +
    '</div></div>';
  const how = root.querySelector('.trg-how');
  if (how) how.textContent = lastPointer === 'touch'
    ? 'Tap a page for all of it; again for its first half, again for its second.'
    : 'Click the top or bottom of a page for that half, or its number for the whole page.';
  const nb = root.querySelector('.trg-body'); if (nb) nb.scrollTop = keep;
  // rg4: the page tiles keep their place; the first time, the selection is
  // brought into view inside the tiles only (the sheet itself does not move).
  const sp = root.querySelector('.trg-spgs');
  if (sp) {
    if (spKeep != null) sp.scrollTop = spKeep;
    else { const c = sp.querySelector('.trg-spg.end'); if (c && c.offsetTop + c.offsetHeight > sp.clientHeight) sp.scrollTop = c.offsetTop - 4; }
  }
  if (S.focusV) { const v = $('trgV' + S.focusV); S.focusV = null; if (v && !$('trgQ')) { v.focus({ preventScroll: true }); v.select(); } }
  const ls = root.querySelector('.trg-list'); if (ls) ls.scrollTop = lsKeep;
  const q = $('trgQ'); if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ── events ─────────────────────────────────────────────────────────────── */
function onClick(e) {
  if (!S) return;
  const t = e.target.closest('[data-trg]'); if (!t || t.disabled) return;
  const a = t.dataset.trg;
  if (a === 'close') return close();
  if (a === 'set') return apply();
  if (a === 'words') { const cb = S.onWords; close(); if (cb) cb(); return; }
  if (a === 'unit') { S.unit = t.dataset.u; S.act = null; S.q = ''; }
  else if (a === 'jm') { S.jmode = t.dataset.m; S.jfirst = null; }
  else if (a === 'juz') {
    const j = +t.dataset.j;
    if (S.jmode === 'sel') {
      // Whole juz: the first tap selects one, the second every juz up to it.
      if (!S.jfirst) { selectJuz(j); S.jfirst = j; }
      else { const f = S.jfirst; selectJuz(Math.min(f, j)); S.whole = { f: Math.min(f, j), t: Math.max(f, j) }; S.b = H(jLast(Math.max(f, j)), 1); S.openJuz = j; S.jfirst = null; }
    } else S.openJuz = j;
  }
  else if (a === 'all') selectJuz(S.openJuz);
  else if (a === 'part') selectPart(+t.dataset.i);
  else if (a === 'spc') { spSet(S.from.s, +t.dataset.x, +t.dataset.y); S.sptap = 'a'; }
  else if (a === 'spg') {
    const p = +t.dataset.p, s = S.from.s;
    if (S.sptap === 'a') { spSet(s, p, p); S.sptap = 'b'; S.spFirst = p; }
    else { spSet(s, S.spFirst, p); S.sptap = 'a'; }
  }
  else if (a === 'pgw') pagePick(+t.dataset.p, null);
  else if (a === 'half') pagePick(+t.dataset.p, +t.dataset.h);
  else if (a === 'sc') { const x = shortcuts()[+t.dataset.i]; if (x) runShortcut(x); }
  else if (a === 'act') { S.act = S.act === t.dataset.k ? null : t.dataset.k; S.q = ''; S.sptap = 'a'; }
  else if (a === 'sur') {
    const s = +t.dataset.s;
    // rg4: a From surah selects all of it; narrow it by typing or by page.
    if (S.act === 'fS') { S.from = { s, a: 1 }; S.to = { s, a: AYAH_COUNTS[s - 1] }; }
    else S.to = { s, a: AYAH_COUNTS[s - 1] };
    S.focusV = S.act === 'tS' ? 't' : 'f'; S.act = null; S.q = ''; S.sptap = 'a';
  } else return;
  render();
}
function onInput(e) {
  if (!S) return;
  if (e.target.id === 'trgQ') { S.q = e.target.value; render(); return; }
  if (e.target.dataset && e.target.dataset.trgv) liveVerse(e.target, false);
}
// Esc closes only this picker, even over the lesson editor: caught on window,
// before the app's own document handlers see it.
// Enter in the surah search takes the first match.
window.addEventListener('keydown', (e) => {
  if (!S) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.trgv) {
    e.preventDefault(); e.stopImmediatePropagation();
    liveVerse(e.target, true);
    if (e.target.dataset.trgv === 'f') { const t = $('trgVt'); if (t) { t.focus(); t.select(); } }
    else if (!result().error) apply();
    return;
  }
  if (e.key === 'Enter' && e.target && e.target.id === 'trgQ') {
    e.preventDefault(); e.stopImmediatePropagation();
    const first = document.querySelector('#trgRoot .trg-list button:not([disabled])');
    if (first) first.click();
  }
}, true);
function onKey() {}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if ($('trgCss')) return;
  const st = document.createElement('style'); st.id = 'trgCss';
  st.textContent = `
.trg-parts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 8px;}
.trg-pk{font-size:12px;color:var(--ink3);margin-left:4px;}
.trg-chip.sm{min-height:32px;padding:0 10px;font-size:12.5px;}
.trg-spgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:6px;max-height:220px;overflow:auto;padding:2px;}
.trg-spg{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 4px;border:1.5px solid var(--border2);border-radius:8px;background:var(--surface,#fff);}
.trg-spg b{font:600 12.5px 'IBM Plex Mono',monospace;color:var(--ink);}
.trg-spg small{font:500 10.5px 'IBM Plex Mono',monospace;color:var(--ink3);}
.trg-spg.in{border-color:var(--trg-sel);background:color-mix(in srgb,var(--trg-sel) 14%,var(--surface,#fff));}
.trg-spg.end{box-shadow:0 0 0 2px var(--trg-sel);}
.trg-spg:focus-visible{outline:2px solid var(--trg-sel);outline-offset:1px;}
#trgRoot{--trg-g:#3e9b2f;--trg-sel:#b8901c;
  --trg-o:var(--trg-g);--trg-r:color-mix(in srgb,var(--trg-g) 42%,var(--surface,#fff));--trg-0:var(--parchment3);
  --trg-n:repeating-linear-gradient(45deg,var(--ink) 0 2px,var(--surface,#fff) 2px 4px);}
:root[data-tz-mode="dark"] #trgRoot{--trg-g:#7bc96a;--trg-sel:#e6c65a;}
.trg-wrap{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--ui-font);color:var(--ink);}
.trg-scrim{position:absolute;inset:0;background:rgba(23,25,28,.5);}
.trg-card{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--parchment);border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(23,25,28,.3);}
body.compact-ui .trg-wrap{padding:0;align-items:flex-end;}
body.compact-ui .trg-card{max-width:none;max-height:94vh;border-radius:16px 16px 0 0;}
.trg-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 8px;}
.trg-head b{font-size:17px;font-weight:600;}
.trg-x{width:36px;height:36px;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;}
.trg-body{flex:1 1 auto;overflow:auto;padding:0 14px 12px;display:flex;flex-direction:column;gap:10px;}
.trg-body > *{flex-shrink:0;}
.trg-tabs{display:flex;background:var(--parchment2);border-radius:10px;padding:3px;gap:2px;}
.trg-tab{flex:1;border:0;background:transparent;border-radius:8px;padding:8px 0;font:500 13.5px var(--ui-font);color:var(--ink2);cursor:pointer;}
.trg-tab.on{background:var(--surface,#fff);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12);}
.trg-jz{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;}
.trg-j{position:relative;border:1px solid var(--border);background:var(--surface,#fff);color:var(--ink);border-radius:7px;padding:5px 0 10px;font:500 12.5px var(--ui-mono,ui-monospace,monospace);cursor:pointer;}
.trg-j.has{border-color:var(--trg-sel);box-shadow:inset 0 0 0 2px var(--trg-sel);}
.trg-j.open{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.trg-mb{position:absolute;left:4px;right:4px;bottom:3px;height:3px;border-radius:2px;display:flex;overflow:hidden;}
.trg-mb span{flex:1;}
.trg-ko{background:var(--trg-o)!important}.trg-kr{background:var(--trg-r)!important}.trg-kn{background:var(--trg-n)!important}.trg-k0{background:var(--trg-0)!important}
.trg-blk{border:1px solid var(--border);background:var(--surface,#fff);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;}
.trg-bh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.trg-bh b{font-size:12.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink2);}
.trg-sub{color:var(--ink3);font:12px var(--ui-mono,ui-monospace,monospace);}
.trg-bh .trg-chip,.trg-bh .trg-mini{margin-left:auto;}
.trg-mini{display:flex;background:var(--parchment2);border-radius:8px;padding:2px;gap:2px;}
.trg-mini button{border:0;background:transparent;border-radius:6px;padding:6px 10px;font:500 12.5px var(--ui-font);color:var(--ink2);cursor:pointer;}
.trg-mini button.on{background:var(--parchment);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.14);}
.trg-help{font-size:12.5px;color:var(--ink2);margin:0;}
.trg-st{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--ink3);}
.trg-st span:last-child{flex:none;}
.trg-pgs{display:grid;grid-template-columns:repeat(10,1fr);gap:3px 4px;}
.trg-pg{display:flex;flex-direction:column;gap:1px;min-width:0;}
.trg-num{border:0;background:transparent;font:11px var(--ui-mono,ui-monospace,monospace);color:var(--ink3);padding:2px 0;cursor:pointer;}
.trg-num.on{color:var(--ink);font-weight:600;}
.trg-pc{position:relative;height:42px;display:grid;grid-template-rows:1fr 1fr;}
.trg-h{position:relative;border:0;padding:0;margin:0;cursor:pointer;}
.trg-h.t{border-radius:4px 4px 0 0;}
.trg-h.b{border-radius:0 0 4px 4px;}
.trg-h.t::after{content:"";position:absolute;left:3px;right:3px;bottom:-1px;border-bottom:1.5px dotted color-mix(in srgb,var(--ink) 45%,transparent);z-index:1;pointer-events:none;}
@media (hover:hover){
  .trg-h:hover::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--trg-sel) 40%,transparent);border-radius:inherit;}
  .trg-pg:has(.trg-num:hover) .trg-h::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--trg-sel) 40%,transparent);border-radius:inherit;}
  .trg-num:hover{color:var(--ink);text-decoration:underline;}
}
.trg-h:focus-visible,.trg-num:focus-visible,.trg-j:focus-visible{outline:2px solid var(--trg-sel);outline-offset:1px;z-index:2;}
.trg-sel{position:absolute;left:-2px;right:-2px;border:2.5px solid var(--trg-sel);border-radius:5px;pointer-events:none;z-index:2;}
.trg-sel.w{top:-2px;bottom:-2px;}.trg-sel.t{top:-2px;height:calc(50% + 2px);}.trg-sel.b{bottom:-2px;height:calc(50% + 2px);}
.trg-lg{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--ink3);}
.trg-lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px;}
.trg-lg i.trg-ksel{background:var(--trg-0);box-shadow:inset 0 0 0 2px var(--trg-sel);}
.trg-mut{font-size:12px;color:var(--ink3);}
.trg-ends{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;}
.trg-k{font-size:12px;font-weight:600;color:var(--ink3);width:34px;}
.trg-pick{display:flex;gap:6px;min-width:0;}
.trg-fld{border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);border-radius:9px;padding:9px 10px;text-align:left;min-width:0;display:flex;justify-content:space-between;align-items:center;gap:6px;font:14px var(--ui-font);cursor:pointer;}
.trg-fld span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.trg-fld small{color:var(--ink3);font-size:11px;flex:none;}
.trg-fld.on{border-color:var(--trg-sel);box-shadow:0 0 0 2px color-mix(in srgb,var(--trg-sel) 30%,transparent);}
.trg-fld.s{flex:1;}
.trg-fld.v{width:92px;flex:none;font-family:var(--ui-mono,ui-monospace,monospace);cursor:text;padding:0 10px 0 0;}
.trg-vin{all:unset;box-sizing:border-box;width:100%;min-width:0;height:40px;padding:0 0 0 10px;font:15px var(--ui-mono,ui-monospace,monospace);color:var(--ink);}
.trg-fld.v:focus-within{border-color:var(--trg-sel);box-shadow:0 0 0 2px color-mix(in srgb,var(--trg-sel) 30%,transparent);}
.trg-ch{border:1px solid var(--border);border-radius:10px;background:var(--surface,#fff);padding:8px;display:flex;flex-direction:column;gap:6px;}
.trg-ct{font-size:12px;color:var(--ink3);}
.trg-in{border:1px solid var(--border2);border-radius:8px;padding:8px 10px;background:var(--parchment);color:var(--ink);font:14px var(--ui-font);width:100%;box-sizing:border-box;}
.trg-list{max-height:200px;overflow:auto;display:flex;flex-direction:column;}
.trg-list button{border:0;background:transparent;color:var(--ink);text-align:left;padding:7px 6px;border-radius:7px;display:flex;gap:8px;align-items:baseline;font:14px var(--ui-font);cursor:pointer;}
.trg-list button:hover{background:var(--parchment2);}
.trg-list button.on{background:var(--gold-pale,var(--parchment2));font-weight:600;}
.trg-list button:disabled{opacity:.35;cursor:default;}
.trg-list .n{font:12px var(--ui-mono,ui-monospace,monospace);color:var(--ink3);width:26px;text-align:right;flex:none;}
.trg-list .c{margin-left:auto;font-size:11px;color:var(--ink3);}
.trg-prev{background:var(--parchment2);border-radius:10px;padding:9px 11px;font-size:13px;display:flex;flex-direction:column;gap:2px;}
.trg-prev b{font-weight:600;}
.trg-prev.wait{box-shadow:inset 0 0 0 1.5px var(--trg-sel);}
.trg-wait{font:600 12.5px var(--ui-font);font-style:normal;color:var(--ink);}
.trg-prev .trg-pl{font:600 11px var(--ui-font);letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);}
.trg-prev span{color:var(--ink3);font:12px var(--ui-mono,ui-monospace,monospace);}
.trg-prev.err{background:color-mix(in srgb,var(--red,#a33b2b) 14%,var(--parchment));}
.trg-chips{display:flex;gap:6px;flex-wrap:wrap;}
.trg-chip{border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);border-radius:999px;padding:7px 12px;font:13px var(--ui-font);cursor:pointer;}
.trg-chip.on{background:var(--ink);color:var(--parchment);border-color:var(--ink);}
.trg-foot{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--border);background:var(--surface,#fff);}
.trg-sp{flex:1;}
.trg-btn{border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);border-radius:10px;padding:9px 16px;font:500 14px var(--ui-font);cursor:pointer;}
.trg-btn.pri{background:var(--ink);border-color:var(--ink);color:var(--parchment);}
.trg-btn:disabled{opacity:.45;cursor:default;}
`;
  document.head.appendChild(st);
}

window.TehfizRange = { open, close, isOpen, version: TEHFIZ_RANGE_VERSION };
})();
