/* ═══════════════════════════════════════════════════════════════════════
   finish-session.js — TehfizFinish — f2
   Loaded by the teacher app only, from /app/teacher/finish-session.js?v=f2.

   Replaces the five-button session footer (Save · Send · Report · Clear ·
   Save & Export) with one decision at the end of a lesson:

     footer      [ Finish session ] [ More ▴ ]
                 More: Save now · Report for a parent · Export .qrs ·
                       Start a new session · Discard this session…
     Finish  →   a sheet: student (needed to send), length — or, if the timer
                 never ran, how long it was — session name, what was heard,
                 a note for the student. Send · Save without sending · Copy report
     Sent    →   what happened (sent / queued offline / saved), then the next
                 move: Start the next student · New session for <name> ·
                 Copy report · Review

   Nothing about saving or sending is new: the sheet writes into the existing
   session form, calls saveSession(), and sends through TehfizSync. Closing the
   sheet with ✕ puts everything back as it was, timer included.

   Self-contained: namespace window.TehfizFinish, DOM in #tfsRoot and the
   footer's #tfsMoreBtn, CSS prefixed .tfs-. It calls, and nothing else:
     TehfizSync.{isSignedIn,isActive,who,roster,currentStudent,pickStudent,
                 createStudent,sendSession,sendState,billing}
     app: saveSession, finalizeSegments, autoSessionName, buildSessionObj,
          buildTextReport, exportCurrentQRS, openShare, clearResume,
          resetCurrent, getSessions, reviewSessionObject, startTimerTicking,
          toggleTimer, setTimerDisplay, formatDate, sessionInstant, showToast,
          and the state it reads: timerSec, timerRunning, mistakes, segments,
          _currentSessionId
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_FINISH_VERSION = 'f2';

let open_ = false, view = 'form', moreOpen = false;
let st = null;   // the sheet's working state, see begin()

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sync() { return window.TehfizSync || null; }
function compact() { return document.body.classList.contains('compact-ui'); }
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function minsText(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if ($('tfsCss')) return;
  const el = document.createElement('style');
  el.id = 'tfsCss';
  el.textContent = `
.tfs-wrap{position:fixed;inset:0;z-index:1150;display:flex;align-items:center;justify-content:center;padding:16px;
  font-family:var(--ui-font);color:var(--ink);}
.tfs-scrim{position:absolute;inset:0;background:rgba(23,25,28,.5);}
.tfs-sheet{position:relative;width:100%;max-width:600px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;
  background:var(--parchment);border:1px solid var(--border2);border-radius:14px;overflow:hidden;
  box-shadow:0 18px 48px rgba(23,25,28,.3);}
body.compact-ui .tfs-wrap{padding:0;align-items:flex-end;}
body.compact-ui .tfs-sheet{max-width:none;max-height:94vh;border-radius:16px 16px 0 0;border:none;}
.tfs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;background:#fff;
  border-bottom:1px solid var(--border);}
body.compact-ui .tfs-head{background:var(--parchment);border-bottom:none;padding:6px 16px 6px;}
.tfs-head h2{margin:0;font-size:19px;font-weight:600;}
.tfs-head.tfs-head-plain{background:transparent;border-bottom:none;padding:10px 12px 0;}
.tfs-grab{display:none;width:40px;height:4px;border-radius:999px;background:var(--parchment3);margin:8px auto 0;}
body.compact-ui .tfs-grab{display:block;}
.tfs-x{width:40px;height:40px;flex:none;border:1px solid var(--border2);border-radius:8px;background:#fff;color:var(--ink);
  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}
.tfs-x:hover{background:var(--parchment2);}
.tfs-body{flex:1 1 auto;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:16px;}
body.compact-ui .tfs-body{padding:4px 16px 14px;gap:14px;}
.tfs-l{font-size:12px;font-weight:500;letter-spacing:.05em;color:var(--ink3);text-transform:uppercase;display:block;margin-bottom:6px;}
.tfs-l b{color:var(--red);font-weight:500;text-transform:none;letter-spacing:0;}
.tfs-in{width:100%;box-sizing:border-box;height:46px;padding:0 12px;border:1px solid var(--border2);border-radius:8px;
  background:#fff;color:var(--ink);font:400 16px var(--ui-font);}
.tfs-in:focus,.tfs-ta:focus{outline:2px solid var(--gold);outline-offset:0;border-color:transparent;}
.tfs-ta{width:100%;box-sizing:border-box;min-height:64px;padding:10px 12px;border:1px solid var(--border2);border-radius:8px;
  background:#fff;color:var(--ink);font:400 15px var(--ui-font);resize:vertical;}
.tfs-stu{position:relative;}
.tfs-bound{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:46px;padding:0 6px 0 12px;
  border:1px solid var(--border2);border-radius:8px;background:#fff;font-size:16px;}
.tfs-code{font:400 12px 'IBM Plex Mono',monospace;background:var(--gold-pale);color:var(--ink2);padding:2px 7px;border-radius:4px;}
.tfs-change{height:36px;padding:0 10px;border:none;background:transparent;color:var(--ink2);font:500 13px var(--ui-font);
  cursor:pointer;border-radius:6px;text-decoration:underline;}
.tfs-ac{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:5;background:#fff;border:1px solid var(--border2);
  border-radius:8px;box-shadow:0 10px 24px rgba(23,25,28,.14);padding:4px;max-height:240px;overflow:auto;}
.tfs-ac button{all:unset;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;width:100%;
  min-height:42px;padding:0 12px;border-radius:6px;font-size:15px;cursor:pointer;color:var(--ink);}
.tfs-ac button:hover,.tfs-ac button.hi{background:var(--gold-pale);}
.tfs-ac .tfs-ac-new{color:var(--ink2);font-size:14px;}
.tfs-ac-empty{padding:10px 12px;font-size:13px;color:var(--ink3);}
.tfs-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tfs-min{width:84px;flex:none;font:500 18px 'IBM Plex Mono',monospace;}
.tfs-dim{font-size:13px;color:var(--ink3);}
.tfs-warn{background:#fff3cd;border:1px solid #c9a227;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;}
.tfs-warn-t{font-size:15px;font-weight:600;color:#5c3a00;}
.tfs-warn .tfs-dim{color:#5c3a00;}
.tfs-chip{height:40px;padding:0 14px;border:1px solid var(--border2);border-radius:999px;background:#fff;color:var(--ink);
  font:500 14px var(--ui-font);cursor:pointer;}
.tfs-chip:hover{background:var(--parchment2);}
.tfs-chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2);cursor:pointer;}
.tfs-chk input{width:18px;height:18px;accent-color:var(--gold);}
.tfs-box{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
.tfs-seg{display:flex;justify-content:space-between;gap:10px;font-size:14px;}
.tfs-seg b{font-weight:600;}
.tfs-seg .tfs-v{font:400 13px 'IBM Plex Mono',monospace;color:var(--ink3);white-space:nowrap;}
.tfs-mk{font-size:13px;color:var(--ink2);}
.tfs-date{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:var(--ink2);}
.tfs-foot{padding:14px 18px 18px;border-top:1px solid var(--border);background:#fff;display:flex;flex-direction:column;gap:10px;}
body.compact-ui .tfs-foot{padding:12px 16px;padding-bottom:max(16px, env(safe-area-inset-bottom));}
.tfs-pri{height:52px;border:none;border-radius:10px;background:var(--gold);color:var(--on-gold);font:600 16px var(--ui-font);cursor:pointer;}
.tfs-pri:disabled{background:var(--parchment3);color:var(--ink2);cursor:default;}
.tfs-sec2{display:flex;gap:10px;}
.tfs-sec{flex:1 1 0;min-height:44px;border:1px solid var(--border2);border-radius:8px;background:#fff;color:var(--ink);
  font:500 14px var(--ui-font);cursor:pointer;padding:0 8px;}
.tfs-sec.strong{border-color:var(--ink);}
.tfs-sec:hover{background:var(--parchment2);}
.tfs-err{font-size:13px;color:var(--red);}
.tfs-done-h{display:flex;align-items:center;gap:14px;}
.tfs-ok{width:48px;height:48px;flex:none;border-radius:50%;background:var(--green-bg);color:var(--green);display:flex;
  align-items:center;justify-content:center;}
.tfs-ok.q{background:#fff3cd;color:#8a5a00;}
.tfs-done-h h2{margin:0;font-size:20px;}
.tfs-done-h p{margin:2px 0 0;font-size:14px;color:var(--ink2);}
.tfs-grid{background:var(--parchment2);border-radius:10px;padding:12px 14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}
.tfs-grid span{display:block;font-size:12px;color:var(--ink3);}
.tfs-grid b{font-size:15px;font-weight:500;}
.tfs-link{align-self:center;background:none;border:none;color:var(--ink);text-decoration:underline;font:400 14px var(--ui-font);
  cursor:pointer;padding:8px;min-height:40px;}
/* Footer: Finish · More */
.tracker-footer.tfs-footer{flex-wrap:nowrap;gap:8px;padding:10px 12px;}
.tfs-footer .tfs-finish{flex:1 1 auto;height:48px;border:none;border-radius:8px;background:var(--gold);color:var(--on-gold);
  font:600 15px var(--ui-font);cursor:pointer;}
.tfs-footer .tfs-finish:hover{filter:brightness(1.12);}
.tfs-footer .tfs-morebtn{flex:none;width:84px;height:48px;border:1px solid var(--ink);border-radius:8px;background:var(--gold-pale);
  color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.tfs-footer .tfs-state{display:block;font:400 12px var(--ui-font);opacity:.8;}
.tfs-more{position:fixed;z-index:1140;width:260px;background:#fff;border:1px solid var(--border2);border-radius:10px;
  box-shadow:0 12px 30px rgba(23,25,28,.2);padding:6px;display:flex;flex-direction:column;font-family:var(--ui-font);}
.tfs-more button{all:unset;box-sizing:border-box;cursor:pointer;padding:10px 12px;font-size:14px;border-radius:6px;color:var(--ink);
  display:flex;flex-direction:column;gap:2px;min-height:44px;justify-content:center;}
.tfs-more button:hover,.tfs-more button:focus-visible{background:var(--parchment2);}
.tfs-more small{font-size:12px;color:var(--ink3);}
.tfs-more .danger{color:var(--red);}
.tfs-more hr{border:none;height:1px;background:var(--border);margin:4px 6px;}
.tfs-confirm{display:flex;flex-direction:column;gap:8px;padding:8px 10px;font-size:13px;color:var(--ink2);}
.tfs-confirm .row{display:flex;gap:6px;}
.tfs-confirm .row button{flex:1;justify-content:center;align-items:center;text-align:center;border:1px solid var(--border2);}
.tfs-confirm .row .danger{border-color:var(--red);}
`;
  document.head.appendChild(el);
}

/* ── state ──────────────────────────────────────────────────────────────── */
function bound() { return sync() && sync().currentStudent ? sync().currentStudent() : null; }
function canSync() { return !!(sync() && sync().isSignedIn && sync().isSignedIn()); }
function rosterList() { return sync() && sync().roster ? sync().roster() : []; }

function begin() {
  const nameEl = $('sessionName'), remEl = $('sessionRemarks');
  st = {
    wasRunning: !!timerRunning,
    timerBefore: timerSec,
    /* Under a minute counts as untimed: the timer auto-starts on the first
       mistake, so a few seconds on the clock usually means it was started by
       that and paused, not that the lesson took seconds. */
    untimed: timerSec < 60,
    ranSome: timerSec > 0 && timerSec < 60,
    minutes: timerSec >= 60 ? Math.max(1, Math.round(timerSec / 60)) : guessMinutes(),
    leaveUntimed: false,
    name: nameEl ? nameEl.value : '',
    autoName: (typeof autoSessionName === 'function' ? autoSessionName(segments) : '') || '',
    note: remEl ? remEl.value : '',
    query: '', acOpen: false, acHi: 0, picking: !bound(),
    typedName: ($('studentName') || {}).value || '',
    error: '', busy: false,
    result: null, report: '', sessId: null, studentAfter: null,
  };
  if (timerRunning) toggleTimer();     // the lesson is over; Resume comes back on ✕
}

/* First mistake to last, as a starting figure for a lesson whose timer never
   ran. Needs two timestamped mistakes; anything less is no evidence at all. */
function guessMinutes() {
  const ts = (mistakes || []).map((m) => Date.parse(m.isoTime)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (ts.length < 2) return null;
  const min = Math.round((ts[ts.length - 1] - ts[0]) / 60000);
  return min >= 1 ? min : null;
}
function guessText() {
  const ts = (mistakes || []).map((m) => Date.parse(m.isoTime)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (ts.length < 2) return '';
  const f = (n) => new Date(n).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return f(ts[0]) + ' → ' + f(ts[ts.length - 1]);
}

function effectiveSec() {
  if (!st.untimed) {
    // Unchanged minutes keep the timer's exact seconds; only an edit rounds.
    if (st.minutes === Math.max(1, Math.round(st.timerBefore / 60))) return st.timerBefore;
    return (st.minutes || 0) * 60;
  }
  if (st.leaveUntimed || !st.minutes) return 0;
  return st.minutes * 60;
}

/* "bills as 45 min" — only when the rounding actually changes the figure. */
function billingNote() {
  const b = bound(), bill = sync() && sync().billing;
  const sec = effectiveSec();
  if (!b || !bill || !sec) return '';
  const step = bill.step(bill.rate(b.id));
  const billed = bill.billedSec(sec, step);
  if (step <= 1 || billed === sec) return '';
  return 'Bills as ' + minsText(billed) + ' · rounded up to ' + bill.stepText(step);
}

/* ── render ─────────────────────────────────────────────────────────────── */
const ICON_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function studentField() {
  const b = bound();
  if (!canSync()) {
    return '<div><label class="tfs-l" for="tfsName">Student</label>' +
      '<input class="tfs-in" id="tfsName" value="' + esc(st.typedName) + '" placeholder="Student name" autocomplete="off">' +
      '<div class="tfs-dim" style="margin-top:6px;">Sign in to send sessions to students. This one will be saved on this device.</div></div>';
  }
  if (b && !st.picking) {
    return '<div><span class="tfs-l">Student</span><div class="tfs-bound"><span>' + esc(b.name || 'Unnamed student') +
      ' <span class="tfs-code">' + esc(b.code) + '</span></span>' +
      '<button class="tfs-change" type="button" data-tfs="change">Change</button></div></div>';
  }
  return '<div class="tfs-stu"><label class="tfs-l" for="tfsStu">Student <b>· needed to send</b></label>' +
    '<input class="tfs-in" id="tfsStu" value="' + esc(st.query) + '" placeholder="Type a name or code" autocomplete="off" ' +
      'role="combobox" aria-expanded="' + st.acOpen + '" aria-controls="tfsAc">' +
    (st.acOpen ? acHtml() : '') + '</div>';
}
function acMatches() {
  const q = st.query.trim().toLowerCase();
  const list = rosterList();
  const hit = (s) => !q || (s.name || '').toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q);
  return list.filter(hit).sort((a, b) => (a.name || '~').localeCompare(b.name || '~')).slice(0, 30);
}
function acHtml() {
  const hits = acMatches();
  const q = st.query.trim();
  return '<div class="tfs-ac" id="tfsAc" role="listbox">' +
    (hits.length ? hits.map((s, i) => '<button type="button" role="option" class="' + (i === st.acHi ? 'hi' : '') +
      '" data-tfs="pick" data-id="' + esc(s.id) + '">' + esc(s.name || 'Unnamed') +
      ' <span class="tfs-code">' + esc(s.code) + '</span></button>').join('')
      : '<div class="tfs-ac-empty">No student matches “' + esc(q) + '”</div>') +
    '<button type="button" class="tfs-ac-new" data-tfs="create">+ Create a code' + (q ? ' for “' + esc(q) + '”' : '') + '</button>' +
  '</div>';
}

function lengthField() {
  if (!st.untimed) {
    const note = billingNote();
    return '<div><label class="tfs-l" for="tfsMin">Length</label><div class="tfs-row">' +
      '<input class="tfs-in tfs-min" id="tfsMin" inputmode="numeric" value="' + esc(st.minutes) + '">' +
      '<span>min · from the timer</span></div>' +
      (note ? '<div class="tfs-dim" id="tfsBill" style="margin-top:6px;">' + esc(note) + '</div>' : '<div id="tfsBill"></div>') + '</div>';
  }
  const g = guessText();
  return '<div class="tfs-warn"><span class="tfs-warn-t">' + (st.ranSome ? 'The timer ran for under a minute.' : 'The timer never ran.') +
      ' How long was this lesson?</span>' +
    '<div class="tfs-row"><input class="tfs-in tfs-min" id="tfsMin" inputmode="numeric" aria-label="Minutes" value="' +
      esc(st.minutes == null ? '' : st.minutes) + '"' + (st.leaveUntimed ? ' disabled' : '') + '><span style="margin-right:6px;">min</span>' +
      [30, 45, 60].map((n) => '<button class="tfs-chip" type="button" data-tfs="mins" data-n="' + n + '"' +
        (st.leaveUntimed ? ' disabled' : '') + '>' + n + '</button>').join('') + '</div>' +
    (g && st.minutes != null ? '<span class="tfs-dim">Prefilled from your first mistake to your last (' + esc(g) + '), as a starting point.</span>' : '') +
    '<label class="tfs-chk"><input type="checkbox" id="tfsUntimed"' + (st.leaveUntimed ? ' checked' : '') +
      '>Leave it untimed (counts as no time on invoices)</label>' +
  '</div>';
}

function heardBox() {
  const segs = (segments || []).map((sg) => segOrdered(sg)).filter((o) => keyValid(o.startKey));
  const rows = segs.map((o) => {
    const range = keyValid(o.endKey) ? describeRange(o.startKey, o.endKey) : o.startKey.split(':').slice(0, 2).join(':') + ' → …';
    const n = segVerseCount(o);
    return '<div class="tfs-seg"><span><b>' + esc(sessionTypeLabel(o.type || 'unassigned')) + '</b>' +
      (o.mode === 'spot' ? ' (spot test)' : '') + ' · ' + esc(range) + '</span>' +
      (n ? '<span class="tfs-v">' + n + ' v</span>' : '') + '</div>';
  }).join('');
  return '<div class="tfs-box"><span class="tfs-l" style="margin:0;">What was heard</span>' +
    (rows || '<div class="tfs-dim">No range marked. The session is named from where the mistakes are.</div>') +
    '<div class="tfs-mk">' + esc(mistakeLine()) + '</div></div>';
}
function mistakeLine() {
  const ms = mistakes || [];
  if (!ms.length) return 'No mistakes — a clean recitation.';
  let taj = 0; const lv = {};
  ms.forEach((m) => {
    const cat = (getType(m.type) || {}).category;
    if (cat === 'tajweed') { taj++; return; }
    lv[m.correction || 'c0'] = (lv[m.correction || 'c0'] || 0) + 1;
  });
  const parts = CORRECTION_TYPES.filter((c) => lv[c.id]).map((c) => c.shortLabel + ' · ' + lv[c.id]);
  if (taj) parts.push('Tajweed · ' + taj);
  return ms.length + ' mistake' + (ms.length === 1 ? '' : 's') + (parts.length ? ' — ' + parts.join(', ') : '');
}

function dateText() {
  try {
    const d = sessionInstant();
    const today = new Date().toDateString() === d.toDateString();
    return (today ? 'Today, ' : '') + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return ''; }
}

function sendLabel() {
  const b = bound();
  if (!canSync()) return null;
  const w = sync().who && sync().who();
  if (w && w.pending) return { text: 'Sending opens once your account is approved', disabled: true };
  if (!b) return { text: 'Send · choose a student first', disabled: true };
  return { text: st.busy ? 'Sending…' : 'Send to ' + (b.name || b.code), disabled: st.busy };
}

function formHtml() {
  const s = sendLabel();
  return '<div class="tfs-grab"></div>' +
    '<div class="tfs-head"><h2 id="tfsTitle">Finish session</h2>' +
      '<button class="tfs-x" type="button" data-tfs="close" aria-label="Back to the session">' + ICON_X + '</button></div>' +
    '<div class="tfs-body">' +
      studentField() +
      lengthField() +
      '<div class="tfs-date"><span>' + esc(dateText()) + '</span></div>' +
      '<div><label class="tfs-l" for="tfsSName">Session name</label>' +
        '<input class="tfs-in" id="tfsSName" value="' + esc(st.name) + '" placeholder="' +
          esc(st.autoName || 'Named from what was recited') + '"></div>' +
      heardBox() +
      '<div><label class="tfs-l" for="tfsNote">Note for the student</label>' +
        '<textarea class="tfs-ta" id="tfsNote" rows="2" placeholder="Optional — shown with this session in their viewer">' +
          esc(st.note) + '</textarea></div>' +
      (st.error ? '<div class="tfs-err" role="alert">' + esc(st.error) + '</div>' : '') +
    '</div>' +
    '<div class="tfs-foot">' +
      (s ? '<button class="tfs-pri" type="button" data-tfs="send"' + (s.disabled ? ' disabled' : '') + '>' + esc(s.text) + '</button>' : '') +
      '<div class="tfs-sec2">' +
        '<button class="tfs-sec' + (s ? ' strong' : '') + '" type="button" data-tfs="save">' + (s ? 'Save without sending' : 'Save session') + '</button>' +
        '<button class="tfs-sec" type="button" data-tfs="copy">Copy report for a parent</button>' +
      '</div>' +
    '</div>';
}

function doneHtml() {
  const r = st.result;
  const who = st.studentAfter;
  const nm = who ? (who.name || who.code) : '';
  const head = r === 'sent' ? { t: 'Sent to ' + nm, p: 'It is in their viewer now, with every mistake on the page.', q: false }
    : r === 'queued' ? { t: 'Saved, will send when online', p: 'It goes to ' + nm + ' by itself once you are back online. Sessions shows it as Queued until then.', q: true }
    : { t: 'Saved on this device', p: nm ? 'Not sent. You can send it later from Sessions.' : 'Not sent — no student was linked.', q: true };
  const okIcon = head.q
    ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
    : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const sess = st.sessObj || {};
  const n = (sess.mistakes || []).length;
  return '<div class="tfs-grab"></div>' +
    '<div class="tfs-head tfs-head-plain"><span></span>' +
      '<button class="tfs-x" type="button" data-tfs="close-done" aria-label="Close">' + ICON_X + '</button></div>' +
    '<div class="tfs-body" style="padding-top:0;">' +
      '<div class="tfs-done-h"><div class="tfs-ok' + (head.q ? ' q' : '') + '">' + okIcon + '</div>' +
        '<div><h2 id="tfsTitle">' + esc(head.t) + '</h2><p>' + esc(head.p) + '</p></div></div>' +
      '<div class="tfs-grid">' +
        '<div><span>Date</span><b>' + esc(st.doneDate || '') + '</b></div>' +
        '<div><span>Length</span><b>' + esc(st.doneSec ? minsText(st.doneSec) : 'untimed') + '</b></div>' +
        '<div><span>Mistakes</span><b>' + n + '</b></div>' +
      '</div>' +
    '</div>' +
    '<div class="tfs-foot">' +
      '<span class="tfs-l" style="margin:0;">Next</span>' +
      '<button class="tfs-pri" type="button" data-tfs="next">Start the next student</button>' +
      '<div class="tfs-sec2">' +
        (who ? '<button class="tfs-sec strong" type="button" data-tfs="again">New session for ' + esc(who.name || who.code) + '</button>' : '') +
        '<button class="tfs-sec" type="button" data-tfs="copy-done">Copy report for a parent</button>' +
      '</div>' +
      '<button class="tfs-link" type="button" data-tfs="review">Review this session</button>' +
    '</div>';
}

function render() {
  const root = $('tfsRoot');
  if (!root) return;
  if (!open_) { root.innerHTML = ''; return; }
  const focusId = document.activeElement && document.activeElement.id;
  const caret = document.activeElement && typeof document.activeElement.selectionStart === 'number'
    ? document.activeElement.selectionStart : null;
  root.innerHTML = '<div class="tfs-wrap"><div class="tfs-scrim" data-tfs="' + (view === 'done' ? 'close-done' : 'close') + '"></div>' +
    '<div class="tfs-sheet" role="dialog" aria-modal="true" aria-labelledby="tfsTitle">' +
    (view === 'done' ? doneHtml() : formHtml()) + '</div></div>';
  if (focusId) {
    const el = $(focusId);
    if (el) { el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch {} }
  }
}

/* ── open / close ───────────────────────────────────────────────────────── */
function open() {
  closeMore();
  injectCss();
  begin();
  open_ = true; view = 'form';
  render();
  const first = $('tfsStu') || $('tfsMin') || $('tfsSName');
  if (first && !compact()) first.focus();
}
/* ✕ on the form: nothing has been committed, so put the clock back the way
   it was — a Finish tapped by mistake mid-lesson must cost nothing. */
function cancel() {
  if (st && st.wasRunning && !timerRunning) startTimerTicking();
  open_ = false; st = null; render();
}
function closeDone() { open_ = false; st = null; render(); }

/* ── commit ─────────────────────────────────────────────────────────────── */
function readForm() {
  const v = (id) => { const el = $(id); return el ? el.value : null; };
  if (v('tfsMin') != null && !st.leaveUntimed) {
    const n = parseInt(v('tfsMin'), 10);
    st.minutes = Number.isFinite(n) && n > 0 ? Math.min(n, 600) : (st.untimed ? null : st.minutes);
  }
  if (v('tfsSName') != null) st.name = v('tfsSName');
  if (v('tfsNote') != null) st.note = v('tfsNote');
  if (v('tfsName') != null) st.typedName = v('tfsName');
}

/* Write the sheet back into the session form, then save through the app. */
function commit() {
  readForm();
  const sec = effectiveSec();
  if (sec !== timerSec && (sec > 0 || st.leaveUntimed)) {
    timerSec = sec;
    setTimerDisplay();
  }
  const nameEl = $('sessionName'), remEl = $('sessionRemarks'), stuEl = $('studentName');
  if (nameEl) nameEl.value = st.name.trim();
  if (remEl) remEl.value = st.note.trim();
  if (stuEl && !canSync() && st.typedName.trim()) {
    stuEl.value = st.typedName.trim();
    stuEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof finalizeSegments === 'function') finalizeSegments();
  saveSession();
  st.sessId = _currentSessionId;
  st.sessObj = (getSessions() || []).find((x) => x.id === _currentSessionId) || buildSessionObj();
  st.report = typeof buildTextReport === 'function' ? buildTextReport(st.sessObj) : '';
  st.doneSec = sec;
  st.doneDate = dateText().replace(/^Today, /, '');
  st.studentAfter = bound();
}

async function doSend() {
  if (st.busy) return;
  readForm();
  if (st.untimed && !st.leaveUntimed && !st.minutes) {
    st.error = 'Enter how long the lesson was, or tick “Leave it untimed”.';
    render(); return;
  }
  st.busy = true; st.error = ''; render();
  commit();
  let r = 'error';
  try { r = await sync().sendSession(st.sessId); } catch (e) { r = 'error'; }
  st.busy = false;
  if (r === 'sent' || r === 'queued') { st.result = r; view = 'done'; render(); return; }
  st.error = r === 'inactive' ? 'Your account is waiting for approval. The session is saved on this device.'
    : r === 'nostudent' ? 'Choose a student first.'
    : 'Could not send. The session is saved on this device — try again from Sessions.';
  render();
}
function doSave() {
  readForm();
  if (st.untimed && !st.leaveUntimed && !st.minutes) {
    st.error = 'Enter how long the lesson was, or tick “Leave it untimed”.';
    render(); return;
  }
  commit();
  st.result = 'saved'; view = 'done'; render();
}
async function copyText(txt) {
  if (!txt) { toast('Nothing to copy'); return; }
  try { await navigator.clipboard.writeText(txt); toast('Report copied'); return; } catch {}
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Report copied'); } catch { toast('Could not copy'); }
  ta.remove();
}
function doCopyForm() {
  readForm();
  const sess = buildSessionObj();
  if (st.name.trim()) sess.sessionName = st.name.trim();
  if (st.note.trim()) sess.remarks = st.note.trim();
  copyText(buildTextReport(sess));
}

/* ── student picking ────────────────────────────────────────────────────── */
function pickId(id) {
  if (sync().pickStudent(id)) { st.picking = false; st.acOpen = false; st.query = ''; st.error = ''; }
  render();
}
async function createFromQuery() {
  const name = st.query.trim();
  st.acOpen = false; st.error = ''; render();
  try {
    const s = await sync().createStudent(name);
    sync().pickStudent(s.id);
    st.picking = false; st.query = '';
    toast('Code ' + s.code + ' created' + (name ? ' for ' + name : ''));
  } catch (e) {
    st.error = 'Could not create a code: ' + ((e && e.message) || 'offline');
  }
  render();
}

/* ── More menu (footer) ─────────────────────────────────────────────────── */
let confirmDiscard = false;
function moreHtml() {
  if (confirmDiscard) {
    const state = sync() && sync().sendState && _currentSessionId != null ? sync().sendState(_currentSessionId) : 'none';
    return '<div class="tfs-confirm"><b style="color:var(--ink);font-size:14px;">Discard this session?</b>' +
      '<span>' + (state === 'sent'
        ? 'It was already sent. This removes it from this device only — to take it back from the student, hide it from Sessions → Student’s view.'
        : 'Its mistakes and timing are deleted from this device. This cannot be undone.') + '</span>' +
      '<div class="row"><button type="button" data-tfsm="discard-no">Keep it</button>' +
      '<button type="button" class="danger" data-tfsm="discard-yes">Discard</button></div></div>';
  }
  return '<button type="button" data-tfsm="save"><span>Save now</span><small>Already saved after every mistake</small></button>' +
    '<button type="button" data-tfsm="report">Report for a parent</button>' +
    '<button type="button" data-tfsm="export">Export .qrs file</button>' +
    '<button type="button" data-tfsm="new"><span>Start a new session</span><small>Keeps this one in Sessions</small></button>' +
    '<hr><button type="button" class="danger" data-tfsm="discard">Discard this session…</button>';
}
function openMore() {
  injectCss();
  const btn = $('tfsMoreBtn');
  if (!btn) return;
  let m = $('tfsMore');
  if (!m) { m = document.createElement('div'); m.id = 'tfsMore'; m.className = 'tfs-more'; m.setAttribute('role', 'menu');
            document.body.appendChild(m); m.addEventListener('click', onMoreClick); }
  m.innerHTML = moreHtml();
  const r = btn.getBoundingClientRect();
  m.style.display = 'flex';
  m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  m.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px';
  m.style.left = 'auto'; m.style.top = 'auto';
  moreOpen = true; btn.setAttribute('aria-expanded', 'true');
}
function closeMore() {
  const m = $('tfsMore'); confirmDiscard = false;
  if (m) m.style.display = 'none';
  moreOpen = false;
  const b = $('tfsMoreBtn'); if (b) b.setAttribute('aria-expanded', 'false');
}
function toggleMore() { if (moreOpen) closeMore(); else openMore(); }

function onMoreClick(e) {
  /* Handled here, not passed on: "Discard…" redraws this menu as a confirm,
     which detaches the button that was clicked, and the page-wide "click
     outside closes the menu" check then saw a target in no menu at all and
     closed it before the confirm could show (f2). */
  e.stopPropagation();
  const t = e.target.closest('[data-tfsm]'); if (!t) return;
  const a = t.dataset.tfsm;
  if (a === 'discard') { confirmDiscard = true; openMore(); return; }
  if (a === 'discard-no') { closeMore(); return; }
  closeMore();
  if (a === 'save') saveSession();
  else if (a === 'report') openShare();
  else if (a === 'export') exportCurrentQRS();
  else if (a === 'new') clearResume();
  else if (a === 'discard-yes') discard();
}
/* Remove the in-progress session from this device and start clean. The
   server copy, if any, is untouched — see the confirm text. */
function discard() {
  const id = _currentSessionId;
  if (id != null) {
    try {
      const list = (getSessions() || []).filter((x) => x.id !== id);
      localStorage.setItem('qrt4_sessions', JSON.stringify(list));
    } catch {}
  }
  resetCurrent();
  if (typeof renderSessionsList === 'function') renderSessionsList();
  toast('Session discarded');
}

/* ── events ─────────────────────────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  if (moreOpen && !e.target.closest('#tfsMore, #tfsMoreBtn')) closeMore();
  const root = $('tfsRoot');
  if (!root || !root.contains(e.target)) return;
  const t = e.target.closest('[data-tfs]');
  if (!t) { if (st && st.acOpen && !e.target.closest('.tfs-stu')) { st.acOpen = false; render(); } return; }
  const a = t.dataset.tfs;
  if (a === 'close') return cancel();
  if (a === 'close-done') return closeDone();
  if (a === 'change') { st.picking = true; st.acOpen = true; render(); const i = $('tfsStu'); if (i) i.focus(); return; }
  if (a === 'pick') return pickId(t.dataset.id);
  if (a === 'create') return createFromQuery();
  if (a === 'mins') { st.minutes = +t.dataset.n; st.error = ''; render(); return; }
  if (a === 'send') return doSend();
  if (a === 'save') return doSave();
  if (a === 'copy') return doCopyForm();
  if (a === 'copy-done') return copyText(st.report);
  if (a === 'next') {
    closeDone(); resetCurrent();
    if (!compact()) { const n = $('studentName'); if (n) n.focus(); }
    toast('Ready for the next student');
    return;
  }
  if (a === 'again') {
    const who = st.studentAfter; closeDone(); resetCurrent();
    if (who) sync().pickStudent(who.id);
    toast('New session' + (who ? ' for ' + (who.name || who.code) : ''));
    return;
  }
  if (a === 'review') {
    const s = (getSessions() || []).find((x) => x.id === st.sessId) || st.sessObj;
    closeDone();
    if (s && typeof reviewSessionObject === 'function') reviewSessionObject(s);
  }
});

document.addEventListener('input', (e) => {
  if (!open_ || !st) return;
  const id = e.target.id;
  if (id === 'tfsStu') { st.query = e.target.value; st.acOpen = true; st.acHi = 0; render(); return; }
  if (id === 'tfsMin') {
    const n = parseInt(e.target.value, 10);
    st.minutes = Number.isFinite(n) && n > 0 ? n : null;
    const b = $('tfsBill'); if (b) b.textContent = billingNote();
  }
});
document.addEventListener('focusin', (e) => {
  if (open_ && st && e.target.id === 'tfsStu' && !st.acOpen) { st.acOpen = true; render(); }
});
document.addEventListener('change', (e) => {
  if (!open_ || !st) return;
  if (e.target.id === 'tfsUntimed') { readForm(); st.leaveUntimed = e.target.checked; st.error = ''; render(); }
});

/* While the sheet is open the app's single-key shortcuts must not fire, and
   Escape closes the sheet. Capture phase, so this runs before the app's own
   document listener. */
document.addEventListener('keydown', (e) => {
  if (moreOpen && e.key === 'Escape') { e.stopPropagation(); closeMore(); return; }
  if (!open_) return;
  if (e.key === 'Escape') {
    e.stopPropagation(); e.preventDefault();
    if (st && st.acOpen) { st.acOpen = false; render(); return; }
    if (view === 'done') closeDone(); else cancel();
    return;
  }
  if (e.target.id === 'tfsStu' && st && st.acOpen) {
    const hits = acMatches();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      st.acHi = Math.max(0, Math.min(hits.length - 1, st.acHi + (e.key === 'ArrowDown' ? 1 : -1)));
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[st.acHi]) pickId(hits[st.acHi].id); else createFromQuery();
    }
  }
  e.stopPropagation();
}, true);

function mount() {
  injectCss();
  if (!$('tfsRoot')) { const r = document.createElement('div'); r.id = 'tfsRoot'; document.body.appendChild(r); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

window.TehfizFinish = { open, toggleMore, closeMore, isOpen: () => open_, version: TEHFIZ_FINISH_VERSION };
})();
