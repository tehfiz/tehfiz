/* ═══════════════════════════════════════════════════════════════════════════
   tehfiz-range.js — TehfizRange — r1 (16 Nov 2026)

   The progress report for part of the Quran, and the report's one time filter.

   · Range: the whole Quran, one juz, one surah, or any stretch of verses. Every
     lesson is CUT to the range before the report sees it: a part that runs on
     past the edge keeps only its verses inside, its strength is worked out
     again from the mistakes inside (segmentStrengthInputs), and a spot test
     keeps only the spots that start inside. The tabs themselves do not change;
     they are handed fewer, shorter lessons.
   · Time: 4 weeks · 3 months · 6 months · 1 year · All, for the whole report,
     so every number on a screen reads the same window. Remembered on this
     device (tehfiz_range_window). 3 months by default (decided 16 Nov).
   · The juz / surah table on the Overview: one row per memorised juz (or the
     surahs in them), scored from the slices of lessons inside it, weighted by
     pages and by how recent (a lesson counts half as much after 30 days), and
     pulled toward the student's overall score while only a few pages have been
     heard. The teacher's grade, where given, is the score (decided 16 Nov).
     Spot tests are shown beside it and never change it.

   Loaded by the viewer only. It owns no data: everything it reads comes from
   the lessons handed to it and from functions in tehfiz-shared.js and the
   viewer (segOrdered, keyAbs, gradedValue, _sessDate, …), called at render
   time. Narrow interface: apply, barHTML, summaryHTML, tableHTML, isWhole,
   onChange, and the handlers its own buttons call.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const VERSION = 'r1';
const K_WIN = 'tehfiz_range_window';
const WINDOWS = [['4w', '4 weeks', 28], ['3m', '3 months', 91], ['6m', '6 months', 182], ['1y', '1 year', 365], ['all', 'All', 0]];
const HALF_LIFE_DAYS = 30;     // a lesson counts half as much after this many days
const PRIOR_WEIGHT = 2;        // pages' worth of the overall score mixed in
const FEW_PAGES = 5;           // below this many pages heard, the score shows as ≈

let win = (() => { try { const v = localStorage.getItem(K_WIN); return WINDOWS.some((w) => w[0] === v) ? v : '3m'; } catch { return '3m'; } })();
let range = { kind: 'all' };   // {kind:'juz', juz} | {kind:'surah', surah} | {kind:'custom', a, b} (absolute verses)
let customOpen = false, group = 'juz', openRow = null, changed = null;

const E = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));
const redraw = () => { if (changed) changed(); };
const isTeacher = () => !!(window.TehfizReview && TehfizReview.active && TehfizReview.active());

/* ── bounds ─────────────────────────────────────────────────────────────── */
let JB = null;
function juzBounds(j) {      // by the same table juzForVerse uses, so the two always agree
  if (!JB) {
    JB = {};
    for (let a = 1; a <= 6236; a++) {
      const v = verseFromAbs(a); if (!v) continue;
      const jj = juzForVerse(v.surah, v.ayah);
      if (!JB[jj]) JB[jj] = [a, a]; else JB[jj][1] = a;
    }
  }
  return JB[j] || null;
}
const surahBounds = (s) => [absVerse(s, 1), absVerse(s, AYAH_COUNTS[s - 1])];
function boundsOf(r) {
  if (r.kind === 'juz') return juzBounds(r.juz);
  if (r.kind === 'surah') return surahBounds(r.surah);
  if (r.kind === 'custom') return [Math.min(r.a, r.b), Math.max(r.a, r.b)];
  return null;
}
const pagesOf = (b) => [pageForAbs(b[0]), pageForAbs(b[1])];
function labelOf(r) {
  const b = boundsOf(r); if (!b) return 'Whole Quran';
  const [p1, p2] = pagesOf(b), pg = p1 === p2 ? 'page ' + p1 : 'pages ' + p1 + '–' + p2;
  if (r.kind === 'juz') return 'Juz ' + r.juz + ' · ' + pg;
  if (r.kind === 'surah') return (SURAH_NAMES[r.surah - 1] || 'Surah ' + r.surah) + ' · ' + pg;
  return describeRange(keyFromAbs(b[0]), keyFromAbs(b[1])) + ' · ' + pg;
}

/* ── cutting a lesson to a range ────────────────────────────────────────── */
function cutSession(s, lo, hi) {
  const segs = []; let partial = false;
  (s.segments || []).forEach((sg) => {
    const o = segOrdered(sg);
    if (!keyValid(o.startKey) || !keyValid(o.endKey)) { partial = true; return; }
    const a = keyAbs(o.startKey), b = keyAbs(o.endKey);
    if (sg.mode === 'spot') {
      // A spot belongs where it starts: that is the place the student was asked for.
      const all = sg.spots || [];
      const sp = all.filter((x) => { const v = absVerse(x.surah, x.ayah); return v >= lo && v <= hi; });
      if (!sp.length) { partial = true; return; }
      if (sp.length !== all.length || a < lo || b > hi) partial = true;
      segs.push({ ...sg, spots: sp, spotIds: sp.map((x) => x.id),
        startKey: keyFromAbs(Math.max(a, lo)), endKey: keyFromAbs(Math.min(b, hi)) });
      return;
    }
    const na = Math.max(a, lo), nb = Math.min(b, hi);
    if (na > nb) { partial = true; return; }
    if (na === a && nb === b) { segs.push(sg); return; }
    partial = true;
    segs.push({ ...sg, startKey: keyFromAbs(na), endKey: keyFromAbs(nb),
      rangeLabel: describeRange(keyFromAbs(na), keyFromAbs(nb)), strengthInputs: null, _cutFrom: [o.startKey, o.endKey] });
  });
  if (!segs.length) return null;
  if (!partial) return s;
  const mistakes = (s.mistakes || []).filter((m) => { const v = absVerse(m.surah, m.ayah); return v >= lo && v <= hi; });
  for (let i = 0; i < segs.length; i++) {
    if (segs[i]._cutFrom) segs[i] = { ...segs[i], strengthInputs: segmentStrengthInputs(segs, segs[i], mistakes) };
  }
  const out = { ...s, segments: segs, mistakes, _cut: true };
  // Counted for the whole lesson, so meaningless for part of it.
  delete out.opportunities; delete out.spotTest;
  const inp = sessionStrengthInputs(segs, mistakes);
  out.strength = inp ? { model: STRENGTH_MODEL.id, score: strengthFromInputs(inp), inputs: inp } : null;
  return out;
}
const cutAll = (S, b) => S.map((s) => cutSession(s, b[0], b[1])).filter(Boolean);

function inWindow(sessions) {
  const d = (WINDOWS.find((w) => w[0] === win) || [])[2];
  if (!d) return sessions.slice();
  const from = Date.now() - d * 86400000;
  return sessions.filter((s) => { const t = _sessDate(s); return t && +t >= from; });
}
/* The lessons the report should show: in the time window, cut to the range. */
function apply(sessions) {
  const S = inWindow(sessions || []);
  const b = boundsOf(range);
  return b ? cutAll(S, b) : S;
}

/* ── scoring a stretch ──────────────────────────────────────────────────── */
function summarise(S) {
  const now = Date.now();
  let wsum = 0, ssum = 0, lessons = 0, last = null;
  const pages = new Set(), spots = { tests: 0, pass: 0, done: 0 }, rows = [];
  S.forEach((s) => {
    const d = _sessDate(s); let heard = false;
    (s.segments || []).forEach((sg) => {
      if (sg.mode === 'spot') {
        const t = spotTally(sg.spots || []), done = t.pass + t.partial + t.fail;
        spots.tests++; spots.pass += t.pass; spots.done += done;
        const ids = new Set(sg.spotIds || (sg.spots || []).map((x) => x.id));
        rows.push({ d, kind: 'spot', t, n: (sg.spots || []).length, mistakes: (s.mistakes || []).filter((m) => ids.has(m.spotId)) });
        if (!last || d > last) last = d;
        return;
      }
      if (!segmentScorable(sg)) return;
      const inp = inputsWithPages(sg.strengthInputs, sg) || segmentStrengthInputs(s.segments, sg, s.mistakes || []);
      if (!inp || !inp.verses) return;
      const sc = gradedValue(sg, strengthFromInputs(inp));
      const o = segOrdered(sg), a = keyAbs(o.startKey), b = keyAbs(o.endKey);
      const p1 = pageForAbs(a), p2 = pageForAbs(b);
      for (let p = p1; p <= p2; p++) pages.add(p);
      if (sc != null) {
        const w = Math.max(0.1, segPageExtent(sg)) * Math.pow(0.5, Math.max(0, (now - d) / 86400000) / HALF_LIFE_DAYS);
        wsum += w; ssum += w * sc;
      }
      heard = true; if (!last || d > last) last = d;
      rows.push({ d, kind: sg.type || 'unassigned', p1, p2, score: sc, graded: isTeacherGraded(sg), cutFrom: sg._cutFrom || null,
        mistakes: (s.mistakes || []).filter((m) => { const v = absVerse(m.surah, m.ayah); return v >= a && v <= b && !m.spotId; }) });
    });
    if (heard) lessons++;
  });
  return { wsum, ssum, pages, lessons, last, spots, rows };
}
function scoreOf(sum, prior) {
  if (!sum.wsum) return null;
  const p = prior == null ? sum.ssum / sum.wsum : prior;
  return Math.round((sum.ssum + PRIOR_WEIGHT * p) / (sum.wsum + PRIOR_WEIGHT));
}
function priorOf(S) { const s = summarise(S); return s.wsum ? s.ssum / s.wsum : null; }

/* ── words ──────────────────────────────────────────────────────────────── */
function ago(d) {
  if (!d) return '—';
  const n = Math.max(0, Math.floor((Date.now() - d) / 86400000));
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 31) return n + ' days ago';
  if (n < 365) { const m = Math.round(n / 30); return m + ' month' + (m === 1 ? '' : 's') + ' ago'; }
  const y = (n / 365).toFixed(1); return y + ' years ago';
}
const day = (d) => (d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const winText = () => { const w = WINDOWS.find((x) => x[0] === win); return w[0] === 'all' ? 'all time' : 'last ' + w[1]; };
const partName = (k) => (k === 'spot' ? 'Spot test' : (typeof sessionTypeLabel === 'function' ? sessionTypeLabel(k) : k));
function scoreCell(sc, approx) {
  if (sc == null) return '<span class="rg-dim">not heard</span>';
  const b = strengthBand(sc);
  return '<b class="rg-sc">' + (approx ? '≈ ' : '') + sc + '</b> <span class="rg-band" style="color:' + (b.color || 'var(--ink2)') + '">' +
    E(approx ? 'few pages' : b.label) + '</span>';
}
const spotText = (sp) => (sp.tests ? sp.tests + ' test' + (sp.tests === 1 ? '' : 's') + ' · ' + sp.pass + ' of ' + sp.done + ' clean' : '<span class="rg-dim">none</span>');

/* ── the bar: range and time ────────────────────────────────────────────── */
function barHTML(all) {
  const k = range.kind;
  const seg = (kind, label) => '<button type="button" class="rg-b' + (k === kind ? ' on' : '') + '" aria-pressed="' + (k === kind) +
    '" onclick="TehfizRange.pick(\'' + kind + '\')">' + label + '</button>';
  let extra = '';
  if (k === 'juz') {
    extra = '<select class="rg-sel" aria-label="Juz" onchange="TehfizRange.set({kind:\'juz\',juz:+this.value})">' +
      Array.from({ length: 30 }, (_, i) => '<option value="' + (i + 1) + '"' + (range.juz === i + 1 ? ' selected' : '') + '>Juz ' + (i + 1) + '</option>').join('') + '</select>';
  } else if (k === 'surah') {
    extra = '<select class="rg-sel" aria-label="Surah" onchange="TehfizRange.set({kind:\'surah\',surah:+this.value})">' +
      SURAH_NAMES.map((n, i) => '<option value="' + (i + 1) + '"' + (range.surah === i + 1 ? ' selected' : '') + '>' + (i + 1) + ' · ' + E(n) + '</option>').join('') + '</select>';
  }
  let custom = '';
  if (customOpen) {
    const b = k === 'custom' ? boundsOf(range) : null;
    const fv = b ? verseFromAbs(b[0]) : { surah: 1, ayah: 1 }, tv = b ? verseFromAbs(b[1]) : { surah: 1, ayah: 7 };
    const sel = (id, v) => '<select id="' + id + '" class="rg-sel">' + SURAH_NAMES.map((n, i) => '<option value="' + (i + 1) + '"' + (v === i + 1 ? ' selected' : '') + '>' + (i + 1) + ' · ' + E(n) + '</option>').join('') + '</select>';
    custom = '<div class="rg-custom">' +
      '<label class="rg-f">From' + sel('rgFs', fv.surah) + '<input id="rgFa" class="rg-in" inputmode="numeric" aria-label="From verse" value="' + fv.ayah + '"></label>' +
      '<label class="rg-f">To' + sel('rgTs', tv.surah) + '<input id="rgTa" class="rg-in" inputmode="numeric" aria-label="To verse" value="' + tv.ayah + '"></label>' +
      '<button type="button" class="rg-b on" onclick="TehfizRange.applyCustom()">Show</button>' +
      '<button type="button" class="rg-b" onclick="TehfizRange.closeCustom()">Cancel</button></div>';
  }
  return '<div class="rg-bar">' +
    '<div class="rg-grp"><span class="rg-l">Range</span><div class="rg-seg" role="group" aria-label="Range">' +
      seg('all', 'Whole Quran') + seg('juz', 'Juz') + seg('surah', 'Surah') + seg('custom', 'Custom…') + '</div>' + extra + '</div>' +
    '<div class="rg-grp"><span class="rg-l">Time</span><div class="rg-wins" role="group" aria-label="Time">' +
      WINDOWS.map((w) => '<button type="button" class="rg-w' + (win === w[0] ? ' on' : '') + '" aria-pressed="' + (win === w[0]) +
        '" onclick="TehfizRange.setWindow(\'' + w[0] + '\')">' + w[1] + '</button>').join('') + '</div></div>' +
    custom + '</div>';
}

/* The dark band under the bar while a range is set. S = the lessons already cut. */
function summaryHTML(S, all) {
  const b = boundsOf(range); if (!b) return '';
  const [p1, p2] = pagesOf(b), sum = summarise(S);
  const sc = scoreOf(sum, priorOf(inWindow(all || [])));
  const approx = sum.pages.size < FEW_PAGES;
  const bits = [sum.lessons + ' lesson' + (sum.lessons === 1 ? '' : 's') + (sum.spots.tests ? ' and ' + sum.spots.tests + ' spot test' + (sum.spots.tests === 1 ? '' : 's') : ''),
    sum.pages.size + ' of ' + (p2 - p1 + 1) + ' page' + (p2 === p1 ? '' : 's') + ' heard', 'last heard ' + ago(sum.last)];
  return '<div class="rg-band-sum"><div class="rg-band-l"><span class="rg-k">SHOWING ONLY</span>' +
    '<span class="rg-t">' + E(labelOf(range)) + ' · ' + E(winText()) + '</span>' +
    '<span class="rg-s">' + bits.map(E).join(' · ') + '</span></div>' +
    '<div class="rg-band-r">' + (sc != null ? '<span class="rg-big">' + (approx ? '≈ ' : '') + sc + '</span><span class="rg-s">' + E(approx ? 'few pages heard' : strengthBand(sc).label) + '</span>' : '') +
    '<button type="button" class="rg-b light" onclick="TehfizRange.set({kind:\'all\'})">Whole Quran</button></div></div>';
}

/* ── the juz / surah table (Overview, whole Quran only) ─────────────────── */
function tableHTML(S, memSet) {
  const juzList = [...(memSet || [])].filter((j) => j >= 1 && j <= 30).sort((a, b) => a - b);
  if (!juzList.length) return '';
  const prior = priorOf(S);
  let items;
  if (group === 'surah') {
    const seen = new Set(); items = [];
    juzList.forEach((j) => {
      const jb = juzBounds(j); if (!jb) return;
      for (let s = verseFromAbs(jb[0]).surah; s <= verseFromAbs(jb[1]).surah; s++) {
        if (seen.has(s)) continue; seen.add(s);
        items.push({ key: 's' + s, name: (s) + ' · ' + (SURAH_NAMES[s - 1] || ''), r: { kind: 'surah', surah: s }, b: surahBounds(s) });
      }
    });
  } else items = juzList.map((j) => ({ key: 'j' + j, name: String(j), r: { kind: 'juz', juz: j }, b: juzBounds(j) }));

  const head = '<div class="rg-row rg-h"><span>' + (group === 'surah' ? 'SURAH' : 'JUZ') + '</span><span>STRENGTH</span><span>BASED ON</span><span>LAST HEARD</span><span>SPOT TESTS</span><span></span></div>';
  const body = items.map((it) => {
    const C = cutAll(S, it.b), sum = summarise(C), [p1, p2] = pagesOf(it.b);
    const sc = scoreOf(sum, prior), approx = sc != null && sum.pages.size < FEW_PAGES;
    const open = openRow === it.key;
    const based = sum.lessons ? sum.pages.size + ' of ' + (p2 - p1 + 1) + ' pages · ' + sum.lessons + ' lesson' + (sum.lessons === 1 ? '' : 's') : '<span class="rg-dim">no lessons in this time</span>';
    let row = '<button type="button" class="rg-row' + (open ? ' open' : '') + '" aria-expanded="' + open + '" onclick="TehfizRange.toggle(\'' + it.key + '\')">' +
      '<b>' + E(it.name) + '</b><span>' + scoreCell(sc, approx) + '</span><span>' + based + '</span><span>' + E(ago(sum.last)) + '</span><span>' + spotText(sum.spots) + '</span>' +
      '<span class="rg-chev" aria-hidden="true">' + (open ? '⌄' : '›') + '</span></button>';
    if (open) {
      const rows = sum.rows.slice().sort((a, b) => b.d - a.d).slice(0, 12);
      row += '<div class="rg-drill">' + (rows.length ? '<div class="rg-dr rg-h"><span>DATE</span><span>PART</span><span>IN THIS ' + (group === 'surah' ? 'SURAH' : 'JUZ') + '</span><span>SCORE</span><span>MISTAKES</span></div>' +
        rows.map((x) => {
          const hifz = x.mistakes.filter((m) => !(typeof isTajweedMistake === 'function' && isTajweedMistake(m, null)));
          const c3 = hifz.filter((m) => m.correction === 'c3').length;
          const where = x.kind === 'spot' ? x.n + ' spot' + (x.n === 1 ? '' : 's') + ' · ' + x.t.pass + ' pass, ' + x.t.partial + ' partial, ' + x.t.fail + ' fail'
            : (x.p1 === x.p2 ? 'Page ' + x.p1 : 'Pages ' + x.p1 + '–' + x.p2) + (x.cutFrom ? ' <span class="rg-dim">(the lesson went further; only these pages count here)</span>' : '');
          return '<div class="rg-dr"><span>' + E(day(x.d)) + '</span><span>' + E(partName(x.kind)) + '</span><span>' + where + '</span><span>' +
            (x.kind === 'spot' ? '<span class="rg-dim">—</span>' : x.score == null ? '<span class="rg-dim">—</span>' : '<b>' + x.score + '</b>' + (x.graded ? ' <span class="rg-dim">graded</span>' : '')) +
            '</span><span>' + x.mistakes.length + (c3 ? ' · <b class="rg-c3">Lvl 3: ' + c3 + '</b>' : '') + '</span></div>';
        }).join('') : '<div class="rg-dim" style="padding:8px 12px;">Nothing heard here in this time.</div>') +
        '<button type="button" class="rg-b" onclick="TehfizRange.set(' + E(JSON.stringify(it.r)).replace(/"/g, '&quot;') + ')">Open the report for ' + E(it.r.kind === 'juz' ? 'juz ' + it.r.juz : SURAH_NAMES[it.r.surah - 1]) + ' →</button></div>';
    }
    return row;
  }).join('');
  const mapLink = isTeacher() ? '<button type="button" class="rg-b" onclick="TehfizRange.openMap()">Memorisation map ↗</button>' : '';
  return '<div class="ms-sec rg-sec"><div class="rg-top"><div><div class="ms-sec-head" style="margin:0"><span>Memorised portions</span>' +
      '<span class="ms-sec-note">' + E(winText()) + '</span></div><div class="rg-dim" style="font-size:12.5px;">From the memorisation map. Tap a row to see its lessons.</div></div>' +
      '<div class="rg-tools">' + mapLink + '<div class="rg-seg" role="group" aria-label="Group by">' +
      '<button type="button" class="rg-b' + (group === 'juz' ? ' on' : '') + '" onclick="TehfizRange.group(\'juz\')">By juz</button>' +
      '<button type="button" class="rg-b' + (group === 'surah' ? ' on' : '') + '" onclick="TehfizRange.group(\'surah\')">By surah</button></div></div></div>' +
    '<div class="rg-scroll"><div class="rg-tbl">' + head + body + '</div></div>' +
    '<p class="rg-note">Strength: the teacher’s grade wherever one was given, otherwise worked out from the mistakes inside each ' + (group === 'surah' ? 'surah' : 'juz') +
      '. Recent lessons count more (half as much after ' + HALF_LIFE_DAYS + ' days). With only a few pages heard the score leans toward the student’s overall score and shows as ≈. Spot tests are shown beside it and never change it.</p></div>';
}

/* ── handlers ───────────────────────────────────────────────────────────── */
function lastHeardIn(kind) {
  // A sensible first choice when Juz or Surah is pressed: where the latest lesson was.
  try {
    const S = (typeof activeSessions !== 'undefined' && activeSessions ? activeSessions : []).slice().sort((a, b) => _sessDate(b) - _sessDate(a));
    for (const s of S) for (const sg of (s.segments || [])) {
      const o = segOrdered(sg); if (!keyValid(o.startKey)) continue;
      const [su, ay] = o.startKey.split(':').map(Number);
      return kind === 'juz' ? juzForVerse(su, ay) : su;
    }
  } catch (_) {}
  return 1;
}
const API = {
  version: VERSION,
  apply, barHTML, summaryHTML, tableHTML,
  isWhole: () => range.kind === 'all',
  /* The juz the range touches, or null for the whole Quran. */
  juzInRange() {
    const b = boundsOf(range); if (!b) return null;
    const a = verseFromAbs(b[0]), z = verseFromAbs(b[1]), out = new Set();
    for (let j = juzForVerse(a.surah, a.ayah); j <= juzForVerse(z.surah, z.ayah); j++) out.add(j);
    return out;
  },
  onChange(fn) { changed = fn; },
  pick(kind) {
    if (kind === 'custom') { customOpen = true; return redraw(); }
    customOpen = false;
    if (kind === 'all') range = { kind: 'all' };
    else if (kind === 'juz') range = { kind: 'juz', juz: range.kind === 'juz' ? range.juz : lastHeardIn('juz') };
    else if (kind === 'surah') range = { kind: 'surah', surah: range.kind === 'surah' ? range.surah : lastHeardIn('surah') };
    redraw();
  },
  set(r) { customOpen = false; range = r && r.kind ? r : { kind: 'all' }; openRow = null; redraw(); },
  applyCustom() {
    const g = (id) => document.getElementById(id);
    const fs = +g('rgFs').value, ts = +g('rgTs').value;
    const fa = Math.max(1, Math.min(AYAH_COUNTS[fs - 1], parseInt(g('rgFa').value, 10) || 1));
    const ta = Math.max(1, Math.min(AYAH_COUNTS[ts - 1], parseInt(g('rgTa').value, 10) || AYAH_COUNTS[ts - 1]));
    API.set({ kind: 'custom', a: absVerse(fs, fa), b: absVerse(ts, ta) });
  },
  closeCustom() { customOpen = false; redraw(); },
  setWindow(w) { if (!WINDOWS.some((x) => x[0] === w)) return; win = w; try { localStorage.setItem(K_WIN, w); } catch (_) {} redraw(); },
  group(g) { group = g === 'surah' ? 'surah' : 'juz'; openRow = null; redraw(); },
  toggle(key) { openRow = openRow === key ? null : key; redraw(); },
  /* Teachers only. Inside the Profile (the report is a frame over it) this
     goes back to the Profile's map; opened on its own, it opens the teacher
     app at that Profile (profile.js p21 reads ?profile=&ptab=). */
  openMap() {
    try { if (window.parent !== window && window.parent.TehfizProfile && window.parent.TehfizProfile.showMap) { window.parent.TehfizProfile.showMap(); return; } } catch (_) {}
    const id = new URLSearchParams(location.search).get('review');
    if (id) window.open('/app/teacher/?profile=' + encodeURIComponent(id) + '&ptab=memorised', '_blank');
  },
};
window.TehfizRange = API;

/* ── styles, every selector prefixed .rg- ───────────────────────────────── */
const css = document.createElement('style');
css.textContent = `
.rg-bar{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;background:var(--surface,#fff);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin:10px 0;}
.rg-grp{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.rg-l{font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--ink3);text-transform:uppercase;}
.rg-seg{display:flex;border:1px solid var(--border2);border-radius:8px;overflow:hidden;}
.rg-seg .rg-b{border:0;border-radius:0;}
.rg-seg .rg-b+.rg-b{border-left:1px solid var(--border);}
.rg-b,.rg-w{font:500 13px var(--ui-font);padding:8px 12px;min-height:36px;border:1px solid var(--border2);border-radius:7px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;}
.rg-b.on,.rg-w.on{background:var(--ink);color:var(--parchment);border-color:var(--ink);}
.rg-b.light{background:var(--parchment);color:var(--ink);border-color:transparent;font-weight:600;}
.rg-wins{display:flex;flex-wrap:wrap;gap:4px;}
.rg-sel,.rg-in{font:14px var(--ui-font);min-height:36px;border:1px solid var(--border2);border-radius:7px;background:var(--surface,#fff);color:var(--ink);padding:0 8px;}
.rg-in{width:64px;}
.rg-custom{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end;width:100%;}
.rg-f{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink3);}
.rg-band-sum{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;background:var(--chrome,#17191c);color:var(--on-ink,#e8e9ea);border-radius:10px;padding:12px 14px;margin:0 0 10px;}
.rg-band-l{display:flex;flex-direction:column;gap:3px;min-width:0;}
.rg-band-r{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.rg-k{font-size:11px;font-weight:600;letter-spacing:.08em;opacity:.7;}
.rg-t{font-size:16px;font-weight:600;}
.rg-s{font-size:12.5px;opacity:.85;}
.rg-big{font-size:26px;font-weight:600;line-height:1;}
.rg-sec .rg-top{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;align-items:center;margin-bottom:8px;}
.rg-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.rg-scroll{overflow-x:auto;border:1px solid var(--border);border-radius:10px;background:var(--surface,#fff);}
.rg-tbl{min-width:620px;}
.rg-row{display:grid;grid-template-columns:minmax(64px,.6fr) minmax(130px,1.1fr) minmax(150px,1.6fr) minmax(96px,.9fr) minmax(130px,1.2fr) 22px;gap:10px;align-items:center;
  width:100%;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--ink);font:13.5px var(--ui-font);cursor:pointer;}
.rg-row:hover{background:var(--parchment);}
.rg-row.open{background:var(--parchment);box-shadow:inset 3px 0 0 var(--ink);}
.rg-h{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--ink3);cursor:default;}
.rg-h:hover{background:transparent;}
.rg-sc{font-size:15px;}
.rg-band{font-size:12px;font-weight:600;}
.rg-dim{color:var(--ink3);}
.rg-chev{color:var(--ink3);text-align:right;}
.rg-drill{background:var(--parchment);padding:4px 12px 12px 16px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:6px;align-items:flex-start;}
.rg-dr{display:grid;grid-template-columns:70px 90px minmax(0,1fr) 90px 100px;gap:10px;align-items:center;width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface,#fff);border-radius:7px;font-size:12.5px;}
.rg-dr.rg-h{background:transparent;padding-top:4px;padding-bottom:0;}
.rg-c3{color:var(--red);}
.rg-note{margin:8px 0 0;font-size:12px;line-height:1.55;color:var(--ink2);}
`;
document.head.appendChild(css);
})();
