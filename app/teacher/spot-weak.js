/* ═══════════════════════════════════════════════════════════════════════════
   spot-weak.js — TehfizWeakSpots — ws2 (17 Nov 2026)

   ws2: the choice of Random / Weak places / Mixed is the teacher's, not
        worked out from the ticks, so Weak places and Mixed can always be
        chosen; the sheet then says plainly why there are none or too few
        (no student chosen; no mistakes in this range; only N found). The
        button says how many spots will be random. The weak-place list is
        remembered per student, so choosing one and coming back finds theirs.

   Weak-place spots (stage 6, part 2; mock-ups 3a SpotSetup and 3b SpotCard).

   · Choose spots (was Populate spots) opens a setup sheet first: how many spots, and where they
     go: Random, Weak places or Mixed (the default, half and half). Weak
     places are the verses this student got wrong before, from the last 3
     hearings of each page (as past mistakes count them), most needed first.
     Tick or untick to choose; pin one to always use it; the stepper adds or
     drops the next one down. "Pick a place on the page" (or Test here on a
     past-mistake badge) adds a place by hand; picks are always used.
   · A weak-place spot starts a couple of verses before the weak place (the
     lead-in, 2 by default) so the student runs into it rather than starting
     on it. The rest are spread evenly at random, as before.
   · Each spot records how it was placed (how: random | weak | picked, and
     aim: the verse it was aimed at and why). The spot card says why, and the
     current spot can be swapped for another weak place or a random one, or
     removed, while it has no outcome and no mistakes.
   · The Spot tests tab (tehfiz-report.js) splits the pass rate by how.

   Own namespace, DOM (#wsSheet, #wsPickBar, .ws-*) and CSS. Reads the app's
   globals at run time: segments, spotState, mistakes, startSegmentSpotTest,
   renderSpotList, updateSpotNav, renderSegments, goToSpot, clearSpotHighlights,
   whenJuzIdle, segOrdered, keyAbs, keyValid, verseFromAbs, pageForVerse,
   SURAH_NAMES, allVerseWords, mCorrLabel, isTajweedMistake, tajweedMarkText,
   _sessDate, showToast, TehfizSync, TehfizPast (pm2+).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const VERSION = 'ws2';
const HEARINGS = 3;
const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keyOf = (s, a) => s + ':' + a;
const nameRef = (k) => { const [s] = k.split(':').map(Number); return (SURAH_NAMES[s - 1] || '') + ' ' + k; };
const sevRank = (c) => (window.TehfizPast && TehfizPast.sevRank ? TehfizPast.sevRank(c) : 0);
const uid = () => Math.max(Date.now(), ...spotState.spots.map((x) => +x.id + 1 || 0));
const curSid = () => { const S = window.TehfizSync; return S && S.currentStudentId ? S.currentStudentId() : null; };

/* ── the weak places in a range ─────────────────────────────────────────── */
const cache = new Map();          // segId -> {startKey, endKey, cands}
async function candidates(startKey, endKey) {
  const P = window.TehfizPast, id = curSid();
  if (!P || !P.lessonsFor || !id) return [];
  const lo = keyAbs(startKey), hi = keyAbs(endKey);
  const L = (await P.lessonsFor(id)).map((s) => ({ s, t: +(_sessDate(s) || 0), pages: P.pagesOf(s) })).sort((a, b) => b.t - a.t);
  const order = new Map();        // page -> [lesson index…], newest first, up to HEARINGS
  L.forEach((x, i) => x.pages.forEach((p) => { const a = order.get(p) || order.set(p, []).get(p); if (a.length < HEARINGS) a.push(i); }));
  const by = new Map();
  L.forEach((x, i) => (x.s.mistakes || []).forEach((m) => {
    if (!m || !m.surah || !m.ayah) return;
    const v = keyAbs(keyOf(m.surah, m.ayah)); if (v == null || v < lo || v > hi) return;
    const hear = order.get(pageForVerse(m.surah, m.ayah)) || [];
    const ago = hear.indexOf(i) + 1; if (!ago) return;          // not one of the last hearings of its page
    const k = keyOf(m.surah, m.ayah), cfg = x.s.typeConfig || null, taj = isTajweedMistake(m, cfg);
    let c = by.get(k);
    if (!c) by.set(k, c = { key: k, v, slips: 0, taj: 0, rules: new Set(), worst: null, lessons: new Set(), ago: 99 });
    c.lessons.add(i); c.ago = Math.min(c.ago, ago);
    if (taj) { c.taj++; const r = (tajweedMarkText(m.subrule) || {}).text; if (r) c.rules.add(r); }
    else { c.slips++; if (!c.worst || sevRank(m.correction) > sevRank(c.worst.m.correction)) c.worst = { m, cfg }; }
  }));
  const out = [...by.values()];
  out.forEach((c) => {
    c.score = c.slips ? (c.slips + sevRank(c.worst.m.correction) * 1.5 + (c.lessons.size - 1) * 2 + (HEARINGS + 1 - c.ago)) : c.taj * 0.3;
    c.lvl = c.worst ? String(mCorrLabel(c.worst.m, c.worst.cfg) || '').split(' · ')[0] : '';
  });
  return out.sort((a, b) => b.score - a.score || a.v - b.v);
}
const agoText = (n) => n === 1 ? 'wrong the last time it was heard' : `last wrong ${n} hearings ago`;
function whyText(c) {
  if (!c) return '';
  if (!c.slips) return `${c.taj} tajweed only${c.rules.size ? ' · ' + [...c.rules].join(', ') : ''}`;
  return `${c.slips} slip${c.slips === 1 ? '' : 's'}${c.lvl ? ' · worst ' + c.lvl : ''} · ${agoText(c.ago)}`;
}

/* ── the setup sheet (3a) ───────────────────────────────────────────────── */
let st = null;   // {segId, startKey, endKey, nVerses, count, lead, cands, ticked:Set, pinned:Set, picked:[], loading}
function weakUsed() {              // in the order they'll be used: picks, pins, then ticked by rank
  const out = st.picked.map((k) => ({ key: k, how: 'picked', c: st.cands.find((x) => x.key === k) || null }));
  const take = (c) => { if (out.length < st.count && !out.some((o) => o.key === c.key)) out.push({ key: c.key, how: 'weak', c }); };
  st.cands.filter((c) => st.pinned.has(c.key)).forEach(take);
  st.cands.filter((c) => st.ticked.has(c.key) && !st.pinned.has(c.key)).forEach(take);
  return out;
}
const weakN = () => Math.min(st.count, st.picked.length + st.ticked.size);
const mode = () => st.mode;
const wanted = () => st.mode === 'weak' ? st.count : st.mode === 'mixed' ? Math.ceil(st.count / 2) : 0;
const follow = () => { if (st.mode !== 'random') st.mode = weakN() >= st.count ? 'weak' : 'mixed'; };   // the stepper and ticks move the choice
function setWeak(n) {               // the stepper: tick the next best, or untick the last one that isn't pinned
  n = Math.max(st.picked.length, Math.min(st.count, n));
  const pool = st.cands.filter((c) => c.slips || st.ticked.has(c.key));
  while (weakN() < n) { const c = pool.find((x) => !st.ticked.has(x.key)) || st.cands.find((x) => !st.ticked.has(x.key)); if (!c) break; st.ticked.add(c.key); }
  while (weakN() > n) {
    const c = [...st.cands].reverse().find((x) => st.ticked.has(x.key) && !st.pinned.has(x.key))
           || [...st.cands].reverse().find((x) => st.ticked.has(x.key));
    if (!c) break; st.ticked.delete(c.key); st.pinned.delete(c.key);
  }
}
function setMode(m) {
  st.mode = m;
  if (m === 'random') { st.ticked.clear(); st.pinned.clear(); st.picked = []; return; }
  setWeak(wanted());
}

async function setup(segId, o) {
  const prev = cache.get(segId), sid = curSid();
  st = { segId, startKey: o.startKey, endKey: o.endKey, nVerses: o.verses, count: o.count, lead: 2, mode: 'mixed', sid,
         cands: [], ticked: new Set(), pinned: new Set(), picked: (o.picked || []).slice(), loading: true };
  draw();
  const same = prev && prev.sid === sid && prev.startKey === o.startKey && prev.endKey === o.endKey && prev.cands;
  const cands = same ? prev.cands : await candidates(o.startKey, o.endKey);
  if (!st || st.segId !== segId) return;
  st.cands = cands; st.loading = false;
  cache.set(segId, { sid, startKey: o.startKey, endKey: o.endKey, cands });
  setWeak(wanted());                           // Mixed by default
  draw();
}
function stepBtn(act, label, aria) { return `<button type="button" class="ws-step" data-ws="${act}" aria-label="${aria}">${label}</button>`; }
function draw() {
  let bg = document.getElementById('wsSheet');
  if (!st) { if (bg) bg.remove(); return; }
  if (!bg) {
    bg = document.createElement('div'); bg.id = 'wsSheet'; bg.className = 'ws-bg';
    bg.addEventListener('click', onClick); bg.addEventListener('change', onChange);
    document.body.appendChild(bg);
  }
  const m = mode(), n = weakN(), used = new Set(weakUsed().map((u) => u.key));
  const seg = (k, l) => `<button type="button" class="ws-seg${m === k ? ' on' : ''}" aria-pressed="${m === k}" data-ws="mode:${k}">${l}</button>`;
  const hifz = st.cands.filter((c) => c.slips).length;
  const row = (c) => {
    const on = st.ticked.has(c.key), pin = st.pinned.has(c.key), over = on && !used.has(c.key);
    return `<label class="ws-cand${on ? ' on' : ''}"><input type="checkbox" data-ws-tick="${c.key}" ${on ? 'checked' : ''}>` +
      `<span><b>${E(nameRef(c.key))}</b><br><span class="ws-dim">${E(whyText(c))}${over ? ' · over the number of spots' : ''}</span></span>` +
      `<button type="button" class="ws-pin${pin ? ' on' : ''}" data-ws="pin:${c.key}" aria-pressed="${pin}" aria-label="${pin ? 'Pinned: always used' : 'Pin: always use'}" title="${pin ? 'Pinned: always used' : 'Pin: always use'}">` +
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2v2H6v-2z"/></svg></button></label>`;
  };
  const picks = st.picked.map((k) => `<div class="ws-cand on picked"><span class="ws-tag">Picked</span><span><b>${E(nameRef(k))}</b><br><span class="ws-dim">${E(whyText(st.cands.find((c) => c.key === k)) || 'Picked by you')}</span></span>` +
      `<button type="button" class="ws-pin" data-ws="unpick:${k}" aria-label="Remove ${E(k)}" title="Remove">✕</button></div>`).join('');
  // Why there are no weak places, or fewer than asked for: said at the top of the card, not left to guess.
  const found = st.cands.length + st.picked.length, rnd = st.count - Math.min(st.count, n);
  let notice = '';
  if (m !== 'random' && !st.loading) {
    if (!st.sid) notice = `<div class="ws-notice"><span><b>Choose a student first.</b> Weak places come from the student's earlier lessons, and no student is chosen for this lesson. ` +
      `Cancel, choose them in the Session panel (Student name), then press <b>Choose spots</b> again.` +
      `${st.picked.length ? '' : ' Until then every spot will be random, unless you pick places on the page yourself.'}` +
      `</span><button type="button" class="ws-b" data-ws="student">Choose the student</button></div>`;
    else if (!found) notice = `<div class="ws-notice"><span><b>No weak places here yet.</b> This student has no mistakes in ${E(segLabel())} in the last ${HEARINGS} times each page was recited, or no earlier lessons covered it. ` +
      `Every spot will be random, unless you pick places on the page yourself.</span></div>`;
    else if (found < wanted()) notice = `<div class="ws-notice"><span><b>Only ${found} weak place${found === 1 ? '' : 's'} found</b> in ${E(segLabel())}, so ${rnd} of the ${st.count} spots will be random.</span></div>`;
  }
  const keep = bg.querySelector('.ws-sheet'), top = keep ? keep.scrollTop : 0;   // a tick shouldn't jump the list back to the top
  bg.innerHTML = `<div class="ws-sheet" role="dialog" aria-label="Spot test setup">
    <div class="ws-head"><h2>Spot test · ${E(segLabel())}</h2><span class="ws-dim">${st.nVerses} verses</span></div>
    <label class="ws-lbl">Spots<span class="ws-box">${stepBtn('count:-1', '−', 'Fewer spots')}<span class="ws-num">${st.count}</span>${stepBtn('count:1', '+', 'More spots')}</span></label>
    <div class="ws-lbl">Where the spots go<div class="ws-segs" role="group" aria-label="Where the spots go">${seg('random', 'Random')}${seg('weak', 'Weak places')}${seg('mixed', 'Mixed')}</div></div>
    ${m === 'random' && !st.loading ? `<p class="ws-dim ws-p">Spread evenly at random across the range, as before.${hifz ? ` ${hifz} weak place${hifz === 1 ? '' : 's'} found in this range: choose Mixed or Weak places to aim at them.` : !st.sid ? ' To aim spots at weak places, choose the student for this lesson first.' : ''}</p>` : ''}
    ${m !== 'random' || st.loading ? `<div class="ws-card">
      ${notice}
      <div class="ws-line"><span><b>Weak places</b> <span class="ws-dim">· ${n >= st.count ? 'every spot' : 'the rest random'}</span></span>
        <span class="ws-pair">${stepBtn('weak:-1', '−', 'Fewer weak places')}<span class="ws-of"><b>${n}</b> of ${st.count}</span>${stepBtn('weak:1', '+', 'More weak places')}</span></div>
      <div class="ws-line"><span>Start each one <b>${st.lead} verse${st.lead === 1 ? '' : 's'}</b> before the weak place</span>
        <span class="ws-pair">${stepBtn('lead:-1', '−', 'Start nearer')}${stepBtn('lead:1', '+', 'Start further back')}</span></div>
      <div class="ws-list"><span class="ws-lbl2">Pick from · the last ${HEARINGS} hearings of each page · most needed first</span>
        ${picks}
        ${st.loading ? '<div class="ws-dim ws-p">Looking through earlier lessons…</div>'
          : st.cands.length ? (() => {
              // The top few, plus anything ticked further down; the rest on request.
              const show = st.all ? st.cands : st.cands.filter((c, i) => i < 8 || st.ticked.has(c.key));
              const more = st.cands.length - show.length;
              return show.map(row).join('') + (more ? `<button type="button" class="ws-more" data-ws="all">Show ${more} more</button>` : '');
            })()
          : `<div class="ws-dim ws-p">${st.sid ? 'Nothing to pick from in this range.' : 'No student chosen, so nothing to pick from.'}</div>`}
      </div>
      <button type="button" class="ws-pick" data-ws="pick">+ Pick a place on the page</button>
      <span class="ws-dim ws-small">Tick or untick to choose; pin one to always use it. Places you pick yourself are always used and count as weak places. A past-mistake badge on the page also has <b>Test here</b>.</span>
    </div>` : ''}
    <div class="ws-bottom"><button type="button" class="ws-go" data-ws="go" ${st.loading ? 'disabled' : ''}>Make ${st.count} spot${st.count === 1 ? '' : 's'}${m === 'random' || !n ? (st.count === 1 ? ', random' : ', all random') : ` · ${Math.min(n, st.count)} at weak places`}</button>
    <div class="ws-foot"><span class="ws-dim ws-small">After they are made, any spot can be swapped or removed.</span><button type="button" class="ws-cancel" data-ws="cancel">Cancel</button></div></div>
  </div>`;
  bg.querySelector('.ws-sheet').scrollTop = top;
}
function segLabel() {
  const raw = segments.find((x) => x.id === st.segId);
  return (raw && raw.rangeLabel) || (typeof describeRange === 'function' ? describeRange(st.startKey, st.endKey) : st.startKey + '–' + st.endKey);
}
function onChange(e) {
  const k = e.target.dataset && e.target.dataset.wsTick; if (!k) return;
  if (e.target.checked) {
    if (weakN() >= st.count) { e.target.checked = false; showToast(`All ${st.count} spots are weak places: add a spot first`); return; }
    st.ticked.add(k);
  } else { st.ticked.delete(k); st.pinned.delete(k); }
  follow(); draw();
}
function onClick(e) {
  if (e.target.id === 'wsSheet') { cancel(); return; }
  const b = e.target.closest('[data-ws]'); if (!b) return;
  e.preventDefault();
  const [act, arg] = b.dataset.ws.split(/:(.*)/s);
  if (act === 'cancel') return cancel();
  if (act === 'student') { cancel(); const f = document.getElementById('studentName'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); } return; }
  if (act === 'go') return go();
  if (act === 'pick') return pickArm();
  if (act === 'all') st.all = true;
  if (act === 'mode') setMode(arg);
  if (act === 'count') {
    const n = Math.max(1, Math.min(st.nVerses, Math.min(99, st.count + +arg)));
    if (n === st.count) return;
    const wasAll = weakN() >= st.count; st.count = n;
    if (wasAll && st.ticked.size + st.picked.length) setWeak(n); else if (weakN() > n) setWeak(n);
    const raw = segments.find((x) => x.id === st.segId); if (raw) { raw.spotCount = n; sessionSaved = false; }
  }
  if (act === 'weak') { setWeak(weakN() + +arg); follow(); }
  if (act === 'lead') st.lead = Math.max(0, Math.min(10, st.lead + +arg));
  if (act === 'pin') {
    if (st.pinned.has(arg)) st.pinned.delete(arg);
    else { if (!st.ticked.has(arg) && weakN() >= st.count) { showToast(`All ${st.count} spots are weak places: untick one first`); return; } st.pinned.add(arg); st.ticked.add(arg); }
  }
  if (act === 'unpick') st.picked = st.picked.filter((k) => k !== arg);
  if (act === 'count' || act === 'pin') follow();
  draw();
}
function cancel() { st = null; pickOff(); draw(); }
function addPick(k) {
  if (!st) return false;
  const v = keyAbs(k);
  if (v < keyAbs(st.startKey) || v > keyAbs(st.endKey)) { showToast(`${k} is outside this range (${segLabel()})`); return false; }
  if (!st.picked.includes(k)) {
    if (weakN() >= st.count) {                 // make room: drop the lowest unpinned tick, or add a spot
      const c = [...st.cands].reverse().find((x) => st.ticked.has(x.key) && !st.pinned.has(x.key));
      if (c) st.ticked.delete(c.key); else if (st.count < st.nVerses) st.count++;
    }
    st.picked.push(k); st.ticked.delete(k); st.pinned.delete(k);
    if (st.mode === 'random') st.mode = 'mixed';
    follow();
  }
  return true;
}

/* ── picking a place on the page ────────────────────────────────────────── */
let picking = false;
function pickArm() {
  picking = true;
  const sh = document.getElementById('wsSheet'); if (sh) sh.style.display = 'none';
  let bar = document.getElementById('wsPickBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'wsPickBar'; bar.className = 'ws-pickbar'; document.body.appendChild(bar); }
  bar.innerHTML = `<span>Tap a word in ${E(segLabel())} to test there</span><button type="button" class="ws-b">Cancel</button>`;
  bar.querySelector('button').onclick = () => { pickOff(); draw(); };
}
function pickOff() {
  picking = false;
  const bar = document.getElementById('wsPickBar'); if (bar) bar.remove();
  const sh = document.getElementById('wsSheet'); if (sh) sh.style.display = '';
}
function onPageTap(e) {
  if (!picking || !st) return;
  const w = e.target.closest && e.target.closest('#pageContent [data-surah][data-ayah]'); if (!w) return;
  e.preventDefault(); e.stopPropagation();
  if (addPick(keyOf(+w.dataset.surah, +w.dataset.ayah))) { pickOff(); draw(); }
}

/* ── making the spots ───────────────────────────────────────────────────── */
function spotAt(v, i, how, aim, lead) {
  const r = verseFromAbs(v), vw = allVerseWords[keyOf(r.surah, r.ayah)] || [];
  return { id: Date.now() + 500 + i, index: i, surah: r.surah, ayah: r.ayah, surahName: SURAH_NAMES[r.surah - 1] || '',
           firstWordPos: 1, lastWordPos: vw.length ? vw[vw.length - 1].position : 1,
           outcome: null, note: '', regenerated: false, mistakeCount: 0, how, aim: aim || null, lead: lead == null ? null : lead };
}
const aimOf = (u, lead) => ({ key: u.key, why: u.c ? whyText(u.c) : '', lead });
// The spots for a plan: the weak places first, then random ones spread over what's left.
function build(plan, verses, count, minVerses) {
  const lo = keyAbs(plan.startKey), hi = keyAbs(plan.endKey);
  const weak = [], starts = new Set(), CLOSE = 3;
  // A weak place already inside another weak spot's run (its lead-in up to a
  // few verses past its aim) is tested by that spot: skip it and use the next
  // ticked one instead, so two spots never sit on top of each other.
  const covered = (s, t) => weak.some((w) => { const ws = keyAbs(keyOf(w.surah, w.ayah)), wt = keyAbs(w.aim.key);
    return (t >= ws && t <= wt + CLOSE) || (wt >= s && wt <= t + CLOSE); });
  const queue = plan.weak.slice(), spare = (plan.spare || []).slice();
  while (weak.length < count && (queue.length || spare.length)) {
    const u = queue.length ? queue.shift() : spare.shift();
    const t = keyAbs(u.key); if (t == null || t < lo || t > hi) continue;
    const s = Math.max(lo, t - plan.lead);
    if (u.how !== 'picked' && covered(s, t)) { if (!queue.length && !spare.length) break; continue; }
    if (starts.has(s)) continue;
    starts.add(s); weak.push(spotAt(s, weak.length, u.how, aimOf(u, t - s), t - s));
    if (weak.length >= plan.weak.length && !queue.length) break;
  }
  const rest = Math.max(0, count - weak.length);
  let rnd = [];
  if (rest) {
    const gap = Math.max(1, minVerses);
    const near = (v) => weak.some((w) => { const s = keyAbs(keyOf(w.surah, w.ayah)), t = keyAbs(w.aim.key); return v >= s - gap && v <= t + gap; });
    let free = verses.filter((x) => !near(keyAbs(keyOf(x.surah, x.ayah))));
    if (free.length < rest) free = verses.filter((x) => !starts.has(keyAbs(keyOf(x.surah, x.ayah))));
    const mv = Math.max(1, Math.min(minVerses, Math.floor(free.length / rest)));
    rnd = buildAllSpots(rest, mv, free).map((s) => Object.assign(s, { how: 'random' }));
  }
  const all = weak.concat(rnd).sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  all.forEach((s, i) => { s.index = i; s.id = Date.now() + i; });
  return all;
}
function go() {
  const used = weakUsed();
  const usedKeys = new Set(used.map((u) => u.key));
  const spare = st.cands.filter((c) => st.ticked.has(c.key) && !usedKeys.has(c.key)).map((c) => ({ key: c.key, how: 'weak', c }));
  const plan = { startKey: st.startKey, endKey: st.endKey, lead: st.lead, weak: mode() === 'random' ? [] : used, spare: mode() === 'random' ? [] : spare };
  // (an empty weak list just means all random, whichever was chosen)
  const segId = st.segId, raw = segments.find((x) => x.id === segId);
  if (raw) { raw.spotCount = st.count; sessionSaved = false; }
  const c = cache.get(segId); if (c) c.lead = st.lead;
  st = null; pickOff(); draw();
  startSegmentSpotTest(segId, plan);
}

/* ── during the test: why this spot, swap, remove (3b) ──────────────────── */
const TAG = { weak: 'Weak place', picked: 'Picked', random: 'Random' };
function tagHTML(s) {
  if (!s.how || !spotState.spots.some((x) => x.how === 'weak' || x.how === 'picked')) return '';
  return `<span class="ws-chip ${s.how}">${TAG[s.how] || ''}</span>`;
}
function hasWork(s) { return !!(s.outcome || s.mistakeCount || mistakes.some((m) => m.spotId === s.id)); }
function cardHTML(s, i, active) {
  if (!active) return '';
  let why = '';
  if (s.aim && s.aim.key) {
    const lead = s.aim.lead || 0;
    why = `<div class="ws-why">${s.how === 'picked' ? 'You picked <b>' + E(s.aim.key) + '</b>' : 'Aimed at <b>' + E(s.aim.key) + '</b>'}${s.aim.why ? ': ' + E(s.aim.why) : ''}.` +
      ` ${lead ? `Starts ${lead} verse${lead === 1 ? '' : 's'} before.` : 'Starts on it.'}</div>`;
  }
  const busy = hasWork(s), dis = busy ? ' disabled title="Already marked: set the outcome back or delete its mistakes first"' : '';
  return why + `<div class="ws-acts" onclick="event.stopPropagation()">
    <button type="button" class="ws-act" data-wsa="weak:${i}"${dis}>Another weak place</button>
    <button type="button" class="ws-act" data-wsa="random:${i}"${dis}>A random spot</button>
    <button type="button" class="ws-act" data-wsa="remove:${i}"${dis || (spotState.spots.length < 2 ? ' disabled' : '')}>Remove</button></div>`;
}
function scope() {
  const sv = spotState.scopeVerses; if (!sv) return null;
  return { lo: keyAbs(sv.startKey), hi: keyAbs(sv.endKey), startKey: sv.startKey, endKey: sv.endKey };
}
function commit(focusId, msg) {
  spotState.spots.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  spotState.spots.forEach((x, i) => { x.index = i; });
  const seg = segments.find((x) => x.id === spotState.segId);
  if (seg) { seg.spotsData = spotState.spots; seg.spotIds = spotState.spots.map((x) => x.id); seg.spotCount = spotState.spots.length; }
  sessionSaved = false;
  clearSpotHighlights();
  spotState.currentIndex = -1;
  renderSpotList(); updateSpotNav(); renderSegments();
  if (msg) showToast(msg);
  const j = Math.max(0, spotState.spots.findIndex((x) => x.id === focusId));
  whenJuzIdle(() => goToSpot(Math.min(j, spotState.spots.length - 1)));
}
async function act(kind, i) {
  const s = spotState.spots[i], sc = scope(); if (!s || !sc) return;
  if (hasWork(s)) { showToast('This spot is already marked'); return; }
  if (kind === 'remove') { spotState.spots.splice(i, 1); return commit(spotState.spots[Math.min(i, spotState.spots.length - 1)]?.id, 'Spot removed'); }
  const taken = new Set(spotState.spots.filter((x) => x !== s).map((x) => keyAbs(keyOf(x.surah, x.ayah))));
  const aimed = new Set(spotState.spots.filter((x) => x !== s && x.aim).map((x) => x.aim.key));
  const c0 = cache.get(spotState.segId);
  const lead = c0 && c0.lead != null ? c0.lead : 2;
  let next = null;
  if (kind === 'weak') {
    let cands = c0 && c0.startKey === sc.startKey && c0.endKey === sc.endKey && c0.cands;
    if (!cands) { cands = await candidates(sc.startKey, sc.endKey); cache.set(spotState.segId, { startKey: sc.startKey, endKey: sc.endKey, cands, lead }); }
    const others = spotState.spots.filter((x) => x !== s).map((x) => { const a = keyAbs(keyOf(x.surah, x.ayah)); return [a, x.aim ? keyAbs(x.aim.key) : a]; });
    const clash = (v) => { const sv = Math.max(sc.lo, v - lead); return taken.has(sv) || others.some(([a, t]) => (v >= a && v <= t + 3) || (t >= sv && t <= v + 3)); };
    const c = cands.find((x) => x.slips && x.key !== (s.aim && s.aim.key) && !aimed.has(x.key) && !clash(x.v))
           || cands.find((x) => x.key !== (s.aim && s.aim.key) && !aimed.has(x.key) && !clash(x.v));
    if (!c) { showToast('No other weak places in this range'); return; }
    const sv = Math.max(sc.lo, c.v - lead);
    next = spotAt(sv, i, 'weak', aimOf({ key: c.key, c }, c.v - sv), c.v - sv);
  } else {
    const gap = Math.max(2, spotState.minVerses || 2);
    const near = (v) => spotState.spots.some((x) => x !== s && Math.abs(keyAbs(keyOf(x.surah, x.ayah)) - v) < gap);
    const pool = []; for (let v = sc.lo; v <= sc.hi; v++) if (!near(v) && v !== keyAbs(keyOf(s.surah, s.ayah))) pool.push(v);
    if (!pool.length) { showToast('No room for another random spot in this range'); return; }
    next = spotAt(pool[Math.floor(Math.random() * pool.length)], i, 'random', null, null);
  }
  next.id = uid();
  spotState.spots[i] = next;
  commit(next.id, kind === 'weak' ? `Swapped for ${next.aim.key}` : 'Swapped for a random spot');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-wsa]'); if (!b || b.disabled) return;
  e.stopPropagation();
  const [k, i] = b.dataset.wsa.split(':'); act(k, +i);
}, true);

/* ── Test here, from a past-mistake badge ───────────────────────────────── */
function testHere(surah, ayah) {
  const k = keyOf(surah, ayah), v = keyAbs(k);
  if (st) { if (addPick(k)) { pickOff(); draw(); } return; }
  const sc = scope();
  if (spotState.enabled && spotState.spots.length && sc && v >= sc.lo && v <= sc.hi) {
    const sv = Math.max(sc.lo, v - 2);
    if (spotState.spots.some((x) => x.aim && x.aim.key === k)) { showToast(`${k} already has a spot`); return; }
    const c0 = cache.get(spotState.segId), c = c0 && c0.cands ? c0.cands.find((x) => x.key === k) : null;
    const s = spotAt(sv, spotState.spots.length, 'picked', aimOf({ key: k, c }, v - sv), v - sv);
    s.id = uid();
    spotState.spots.push(s);
    return commit(s.id, `Spot added at ${k}`);
  }
  // No test running here: the spot segment that covers it, if there is one with no spots yet.
  const seg = segments.find((g) => { if (g.mode !== 'spot' || (g.spotsData && g.spotsData.length)) return false;
    const o = segOrdered(g); return keyValid(o.startKey) && keyValid(o.endKey) && keyAbs(o.startKey) <= v && v <= keyAbs(o.endKey); });
  if (seg) { startSegmentSpotTest(seg.id, null, [k]); return; }
  showToast(`Add a spot test segment covering ${k} first`);
}

function init() {
  document.addEventListener('click', onPageTap, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (picking || st)) { if (picking) { pickOff(); draw(); } else cancel(); } });
  if (window.TehfizPast) window.TehfizPast.testHere = testHere;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

window.TehfizWeakSpots = { setup, build, tagHTML, cardHTML, testHere, isOpen: () => !!st, version: VERSION };

/* ── styles (.ws-*) ─────────────────────────────────────────────────────── */
const css = document.createElement('style');
css.textContent = `
.ws-bg{position:fixed;inset:0;z-index:1460;background:rgba(23,25,28,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
.ws-sheet{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;background:var(--parchment,#f5f5f3);color:var(--ink);
  border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:14px;font:14px/1.45 var(--ui-font);}
body.compact-ui .ws-bg{align-items:flex-end;padding:0;}
body.compact-ui .ws-sheet{width:100%;max-height:92vh;border-radius:16px 16px 0 0;}
.ws-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
.ws-head h2{margin:0;font-size:17px;font-weight:600;}
.ws-dim{color:var(--ink3);font-size:12.5px;}
.ws-p{margin:0;}
.ws-small{font-size:12.5px;}
.ws-lbl,.ws-lbl2{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:500;color:var(--ink3);}
.ws-box{display:flex;align-items:center;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);overflow:hidden;max-width:260px;}
.ws-box .ws-step{border:0;border-radius:0;width:44px;height:44px;}
.ws-num{flex:1;text-align:center;font-size:16px;font-weight:600;color:var(--ink);}
.ws-segs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--border2);border-radius:8px;overflow:hidden;}
.ws-seg{min-height:44px;border:0;background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.ws-seg+.ws-seg{border-left:1px solid var(--border);}
.ws-seg.on{background:var(--ink);color:var(--parchment);font-weight:600;}
.ws-card{background:var(--surface,#fff);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:14px;}
.ws-line{display:flex;justify-content:space-between;align-items:center;gap:12px;}
.ws-pair{display:flex;align-items:center;gap:4px;flex:none;}
.ws-of{min-width:64px;text-align:center;font-size:15px;}
.ws-step{width:40px;height:40px;border-radius:8px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font-size:17px;cursor:pointer;}
.ws-list{display:flex;flex-direction:column;gap:6px;}
.ws-cand{display:grid;grid-template-columns:24px minmax(0,1fr) 44px;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;
  background:var(--surface,#fff);border:1px dashed var(--border2);font-size:13.5px;color:var(--ink2);cursor:pointer;}
.ws-cand.on{background:var(--parchment,#f5f5f3);border:1px solid transparent;color:var(--ink);}
.ws-cand input{width:18px;height:18px;accent-color:var(--ink);margin:0;}
.ws-cand.picked{grid-template-columns:auto minmax(0,1fr) 44px;cursor:default;}
.ws-tag{font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;background:var(--ink);color:var(--parchment);}
.ws-pin{width:40px;height:40px;border-radius:8px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink3);display:flex;align-items:center;justify-content:center;cursor:pointer;}
.ws-pin.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.ws-notice{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;border-left:4px solid var(--amber,#8a5a00);
  background:var(--parchment,#f5f5f3);font-size:13px;line-height:1.5;color:var(--ink);}
.ws-warn{font-size:12.5px;color:var(--amber,#8a5a00);font-weight:600;}
.ws-pick{min-height:44px;border-radius:8px;border:1.5px dashed var(--ink);background:var(--surface,#fff);color:var(--ink);font:600 14px var(--ui-font);cursor:pointer;}
.ws-bottom{position:sticky;bottom:-16px;margin:0 -16px -16px;padding:12px 16px 16px;background:var(--parchment,#f5f5f3);border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;}
.ws-more{min-height:38px;border-radius:8px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink2);font:500 13px var(--ui-font);cursor:pointer;}
.ws-go{min-height:48px;border-radius:10px;border:0;background:var(--ink);color:var(--parchment);font:600 15px var(--ui-font);cursor:pointer;}
.ws-go:disabled{opacity:.5;cursor:default;}
.ws-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;}
.ws-cancel,.ws-b{min-height:38px;padding:0 14px;border-radius:8px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;}
.ws-pickbar{position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:1470;display:flex;align-items:center;gap:12px;
  background:var(--ink);color:var(--parchment);border-radius:10px;padding:8px 8px 8px 14px;font:500 14px var(--ui-font);box-shadow:0 6px 20px rgba(23,25,28,.25);}
.ws-chip{font:600 11px var(--ui-font);padding:1px 7px;border-radius:10px;border:1px solid var(--border2);color:var(--ink2);white-space:nowrap;}
.ws-chip.weak,.ws-chip.picked{background:var(--ink);border-color:var(--ink);color:var(--parchment);}
.ws-why{background:var(--parchment,#f5f5f3);border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.5;color:var(--ink2);margin:6px 0;}
.ws-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.ws-act{min-height:34px;padding:0 10px;border-radius:7px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:12.5px var(--ui-font);cursor:pointer;}
.ws-act:disabled{opacity:.45;cursor:default;}
`;
document.head.appendChild(css);
})();
