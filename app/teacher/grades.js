/* ═══════════════════════════════════════════════════════════════════════
   grades.js — TehfizGrades — g5
   Loaded by the teacher app only, from /app/teacher/grades.js?v=g5.

   The teacher's own memorisation-strength grade, beside the computed one:
     · a row for each recited part of the session (each non-spot segment with
       a range) and one for the whole session — or a single row when the
       session has only one part, which sets both
     · a % and the five bands, each editable; typing a % picks its band,
       tapping a band sets the % to the middle of it, tapping it again clears
     · optional: an untouched row keeps the computed score
   Used in two places:
     · Finish session (finish-session.js): rowsHtml / handle / apply on the
       session being finished
     · Sessions → Edit grades: openEditor(id) on a saved session; saving
       writes it back to this device and, if the session was sent, sends it
       again so the student's copy carries the grade too

   Stored as sg.teacherGrade / sess.teacherGrade = {pct, band, at} — see
   teacherPct, gradeFromBand, gradeFromPct in the shared file. The computed
   inputs are never touched.

   Self-contained: namespace window.TehfizGrades, DOM in #tgrRoot, CSS
   prefixed .tgr-. It calls the shared strength helpers, and from the app:
   getSessions, segments, mistakes, _currentSessionId, renderSessionsList,
   showToast, TehfizSync.{sendState, sendSession}.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_GRADES_VERSION = 'g5';
// g5: the five bands sit on one line beside the % box; a two-word name
// wraps inside its button rather than being cut off.
function shortLabel(b) { return String(b.label); }

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function bands() { return STRENGTH_MODEL.bands; }

/* The parts a session can be graded on. `key` is the segment id, 'session',
   or 'both' (a one-part session: its single row grades both). */
function parts(sess) {
  const segs = sess.segments || [], ml = sess.mistakes || [];
  const out = [];
  segs.forEach((sg) => {
    if (sg.mode === 'spot') return;
    const o = segOrdered(sg);
    if (!keyValid(o.startKey) || !keyValid(o.endKey)) return;
    out.push({ key: String(sg.id), seg: sg,
      title: sessionTypeLabel(sg.type || 'unassigned') + ' · ' + (sg.rangeLabel || describeRange(o.startKey, o.endKey) || ''),
      computed: segmentStrength(segs, sg, ml), grade: sg.teacherGrade || null });
  });
  const hifz = sessionFocus(sess) !== 'tajweed';
  const whole = hifz ? sessionStrength(segs, ml) : null;
  if (out.length === 1) {
    const p = out[0];
    return [{ ...p, key: 'both', title: 'This session · ' + p.title.split(' · ').slice(1).join(' · '),
              grade: sess.teacherGrade || p.grade }];
  }
  if (out.length) out.push({ key: 'session', title: 'Whole session', computed: whole, grade: sess.teacherGrade || null });
  return out;
}

/* draft: {key: grade | null}; a key absent from draft means "as it was". */
function current(p, draft) { return Object.prototype.hasOwnProperty.call(draft, p.key) ? draft[p.key] : p.grade; }

function rowsHtml(ps, draft) {
  if (!ps.length) return '';
  return ps.map((p) => {
    // The % and the band are separate answers: either, both, or neither.
    const g = current(p, draft), pct = teacherSetPct(g), selKey = teacherSetBand(g);
    const comp = p.computed == null ? 'not enough to compute'
      : 'computed ' + p.computed + '%';
    // With a % but no band chosen, outline the band that % falls in.
    const hintKey = !selKey && pct != null ? strengthBand(pct).key : null;
    const mismatch = pct != null && selKey && strengthBand(pct).key !== selKey;
    return '<div class="tgr-row">' +
      '<div class="tgr-top"><b>' + esc(p.title) + '</b><span class="tgr-comp">' + esc(comp) + '</span></div>' +
      '<div class="tgr-line"><input class="tgr-pct" type="number" min="0" max="100" inputmode="numeric" data-tgr-pct="' + esc(p.key) + '" value="' +
        (pct == null ? '' : pct) + '" placeholder="' + (p.computed == null ? '—' : p.computed) + '" aria-label="Your grade for ' + esc(p.title) + ', percent">' +
        '<span class="tgr-pc">%</span>' +
        '<div class="tgr-bands" role="group" aria-label="Band">' + bands().map((b) =>
          '<button type="button" class="tgr-band' + (selKey === b.key ? ' on' : hintKey === b.key ? ' hint' : '') + '" aria-pressed="' + (selKey === b.key) + '" data-tgr="band" data-k="' + esc(p.key) + '" data-b="' + b.key + '"' +
            ' title="' + esc(b.label) + '" aria-label="' + esc(b.label) + '"' +
            (selKey === b.key ? ' style="background:' + b.color + ';border-color:' + b.color + '"' : '') + '>' + esc(shortLabel(b)) + '</button>').join('') +
        '</div></div>' +
      (g || mismatch ? '<div class="tgr-under">' +
        (mismatch ? '<span class="tgr-hint">' + pct + '% usually reads as ' + esc(strengthBand(pct).label) + '. Both are kept.</span>' : '') +
        (g ? '<button type="button" class="tgr-clear" data-tgr="clear" data-k="' + esc(p.key) + '">Use the computed score</button>' : '') +
        '</div>' : '') +
      '</div>';
  }).join('');
}

/* Returns true when the event was a grade control (the host re-renders). */
function handle(e, draft, ps) {
  const t = e.target;
  if (e.type === 'click') {
    const b = t.closest('[data-tgr]'); if (!b) return false;
    const k = b.dataset.k, p = ps.find((x) => x.key === k); if (!p) return false;
    if (b.dataset.tgr === 'clear') { draft[k] = null; return true; }
    if (b.dataset.tgr === 'band') {
      // Tapping a band sets only the band; tapping it again unsets it.
      const g = current(p, draft);
      const band = teacherSetBand(g) === b.dataset.b ? null : b.dataset.b;
      draft[k] = makeGrade(teacherSetPct(g), band);
      return true;
    }
    return false;
  }
  if (e.type === 'change' && t.dataset && t.dataset.tgrPct != null) {
    const k = t.dataset.tgrPct;
    const p = ps.find((x) => x.key === k);
    // Typing a % sets only the %; any band already chosen stays.
    draft[k] = makeGrade(t.value === '' ? null : t.value, p ? teacherSetBand(current(p, draft)) : null);
    return true;
  }
  return false;
}

/* Write a draft onto a session's segments and the session itself. */
function apply(draft, segs, setSessionGrade) {
  Object.keys(draft).forEach((k) => {
    const g = draft[k] ? { ...draft[k] } : null;
    if (k === 'session' || k === 'both') setSessionGrade(g);
    if (k === 'session') return;
    const sg = k === 'both'
      ? (segs || []).find((x) => x.mode !== 'spot' && keyValid(segOrdered(x).startKey) && keyValid(segOrdered(x).endKey))
      : (segs || []).find((x) => String(x.id) === k);
    if (!sg) return;
    if (g) sg.teacherGrade = g; else delete sg.teacherGrade;
  });
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if ($('tgrCss')) return;
  const el = document.createElement('style');
  el.id = 'tgrCss';
  el.textContent = `
.tgr-row{display:flex;flex-direction:column;gap:7px;padding:10px 0;border-top:1px solid var(--border);}
.tgr-row:first-child{border-top:none;padding-top:2px;}
.tgr-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;}
.tgr-top b{font-size:14px;font-weight:600;}
.tgr-comp{font-size:12px;color:var(--ink3);}
.tgr-line{display:flex;align-items:center;gap:6px;}
.tgr-under{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.tgr-pct{width:56px;flex:none;height:36px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);
  color:var(--ink);font:500 15px var(--ui-font);}
.tgr-pc{font-size:14px;color:var(--ink3);}
.tgr-tag{font-size:12px;padding:2px 8px;border:1px dashed var(--border2);border-radius:5px;color:var(--ink2);}
.tgr-hint{font-size:12px;color:var(--ink3);}
.tgr-clear{background:none;border:none;padding:0;font:400 12px var(--ui-font);color:var(--ink2);text-decoration:underline;cursor:pointer;}
.tgr-bands{flex:1;min-width:0;display:flex;gap:3px;}
.tgr-band{flex:1 1 0;min-width:0;height:36px;padding:0 2px;border:1px solid var(--border2);border-radius:7px;background:var(--surface,#fff);color:var(--ink);
  font:500 11.5px/1.1 var(--ui-font);cursor:pointer;white-space:normal;overflow:hidden;overflow-wrap:anywhere;}
.tgr-band.on{color:#fff;font-weight:600;}
.tgr-band.hint{border-style:dashed;border-color:var(--ink3);}
.tgr-band.on[data-b="steady"]{color:#1d1a0c;}
.tgr-dlg{position:fixed;inset:0;z-index:1180;display:flex;align-items:center;justify-content:center;padding:16px;}
.tgr-scrim{position:absolute;inset:0;background:rgba(23,25,28,.5);}
.tgr-card{position:relative;background:var(--parchment);color:var(--ink);border-radius:14px;max-width:560px;width:100%;max-height:calc(100vh - 32px);
  overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 48px rgba(23,25,28,.3);font-family:var(--ui-font);}
.tgr-card h3{margin:0;font-size:18px;}
.tgr-sub{font-size:13px;color:var(--ink3);}
.tgr-foot{display:flex;gap:10px;justify-content:flex-end;}
.tgr-btn{height:42px;padding:0 16px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.tgr-btn.pri{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
body.compact-ui .tgr-dlg{padding:0;align-items:flex-end;}
body.compact-ui .tgr-card{border-radius:16px 16px 0 0;max-height:92vh;}
`;
  document.head.appendChild(el);
}

/* ── Sessions → Edit grades ─────────────────────────────────────────────── */
let ed = null;   // {id, sess, ps, draft, busy}
function openEditor(id) {
  injectCss();
  const sess = (getSessions() || []).find((x) => x.id === id);
  if (!sess) { toast('That session is not on this device'); return; }
  const ps = parts(sess);
  if (!ps.length) { toast('Nothing in this session was recited as a range, so there is nothing to grade'); return; }
  ed = { id, sess, ps, draft: {}, busy: false };
  draw();
}
function close() { ed = null; draw(); }
// Same guard as Finish session: a blur during the redraw can fire "change".
let drawing = false, drawAgain = false;
function draw() {
  if (drawing) { drawAgain = true; return; }
  drawing = true;
  try { drawNow(); } finally { drawing = false; }
  if (drawAgain) { drawAgain = false; Promise.resolve().then(draw); }
}
function drawNow() {
  let root = $('tgrRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'tgrRoot'; document.body.appendChild(root);
    root.addEventListener('click', onEvt); root.addEventListener('change', onEvt);
  }
  if (!ed) { root.innerHTML = ''; return; }
  const s = ed.sess;
  const sent = window.TehfizSync && TehfizSync.sendState && TehfizSync.sendState(s.id) === 'sent';
  const oldCard = root.querySelector('.tgr-card'), keepScroll = oldCard ? oldCard.scrollTop : 0;   // a band tap keeps your place
  root.innerHTML = '<div class="tgr-dlg"><div class="tgr-scrim" data-tgrx="close"></div>' +
    '<div class="tgr-card" role="dialog" aria-modal="true" aria-labelledby="tgrT"><h3 id="tgrT">Memorisation strength</h3>' +
    '<span class="tgr-sub">' + esc(s.student || 'Unnamed student') + ' · ' + esc(typeof sessionNameOf === 'function' ? sessionNameOf(s) : '') +
      (sent ? ' · sent — saving sends it again, so the student sees your grade' : '') + '</span>' +
    '<div>' + rowsHtml(ed.ps, ed.draft) + '</div>' +
    '<span class="tgr-sub">Give a %, a band, or both \u2014 each is kept as you gave it. Reports show your grade where you gave one; the computed score is kept beside it.</span>' +
    '<div class="tgr-foot"><button class="tgr-btn" data-tgrx="close">Cancel</button>' +
      '<button class="tgr-btn pri" data-tgrx="save"' + (ed.busy ? ' disabled' : '') + '>Save</button></div></div></div>';
  const card = root.querySelector('.tgr-card'); if (card && keepScroll) card.scrollTop = keepScroll;
}
async function onEvt(e) {
  if (!ed) return;
  if (handle(e, ed.draft, ed.ps)) { draw(); return; }
  const t = e.type === 'click' && e.target.closest('[data-tgrx]');
  if (!t) return;
  if (t.dataset.tgrx === 'close') return close();
  if (t.dataset.tgrx === 'save') {
    const all = getSessions() || [];
    const s = all.find((x) => x.id === ed.id); if (!s) return close();
    apply(ed.draft, s.segments, (g) => { if (g) s.teacherGrade = g; else delete s.teacherGrade; });
    try { localStorage.setItem('qrt4_sessions', JSON.stringify(all)); } catch { toast('Could not save on this device'); return; }
    // The session open in the app is the same record: keep it in step.
    if (typeof _currentSessionId !== 'undefined' && _currentSessionId === s.id && typeof segments !== 'undefined') {
      (s.segments || []).forEach((x) => { const live = segments.find((y) => String(y.id) === String(x.id)); if (live) { if (x.teacherGrade) live.teacherGrade = { ...x.teacherGrade }; else delete live.teacherGrade; } });
      if (typeof setSessionTeacherGrade === 'function') setSessionTeacherGrade(s.teacherGrade || null);
    }
    const sent = window.TehfizSync && TehfizSync.sendState && TehfizSync.sendState(s.id) === 'sent';
    ed.busy = true; draw();
    if (sent && TehfizSync.sendSession) {
      const r = await TehfizSync.sendSession(s.id).catch(() => 'error');
      toast(r === 'sent' ? 'Grades saved and sent' : r === 'queued' ? 'Grades saved — sending when back online' : 'Grades saved on this device; sending failed');
    } else toast('Grades saved');
    close();
    if (typeof renderSessionsList === 'function') renderSessionsList();
  }
}
document.addEventListener('keydown', (e) => {
  if (!ed || e.key !== 'Escape') return;
  e.stopPropagation(); e.preventDefault(); close();
}, true);

window.TehfizGrades = { parts, rowsHtml, handle, apply, openEditor, injectCss, version: TEHFIZ_GRADES_VERSION };
})();
