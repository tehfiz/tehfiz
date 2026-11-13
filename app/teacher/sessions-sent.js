/* ═══════════════════════════════════════════════════════════════════════
   sessions-sent.js — TehfizSent — m7
   Loaded by the teacher app only, from /app/teacher/sessions-sent.js?v=m7.

   m7: undoing the send of the lesson that is open in the app opens Finish
   session on it, so it can be changed and sent again.

   m6: a sent session's ⋯ menu can move it to another student or undo the
   send (your own sessions only). Undo copies it to this device first if it
   is not here, so nothing is lost. Maps are left as they are.

   Adds two tabs to the Sessions panel:
     · Sent to students   — every session on the server for this teacher's
                            students, for one student or all of them. The
                            panel opens here (m2) whenever the teacher is
                            signed in; signed out, it opens on the device tab.
                            With one student picked, a strip offers that
                            student's progress report and mushaf view.
     · On this device     — the existing local list, untouched

   So a teacher on a new device sees their history instead of "No saved
   sessions yet", and can review a sent session or copy it back onto this
   device.

   Self-contained: namespace window.TehfizSent, storage prefix 'tehfiz_sent_',
   DOM inside #sessionsOverlay (.tss-tabs, #tssPane), CSS prefixed .tss-.
   Narrow interface with the app — it calls, and nothing else:
     TehfizSync.isSignedIn / api / roster / open /
                unsend / moveSession                 (sync module bridge)
     getSessions, importSingle, migrateMistakes,
     reviewSessionObject, renderSessionsList,
     sessionTypeLabel, showToast                     (app globals)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_SENT_VERSION = 'm7';
const KEY_STUDENT = 'tehfiz_sent_student';
const PAGE = 100;

let tab = 'sent';                          // chosen afresh on every open, see mount()
let student = read(KEY_STUDENT) || '';     // '' = all students
let rows = [], offset = 0, more = false, loading = false, error = '', loadedFor = null, busy = null;
let menuFor = null;                        // m5: the card whose ⋯ menu is open
let fix = null;                            // m6: {id, kind:'undo'|'move', busy} — the question being asked on a card

function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function write(k, v) { try { localStorage.setItem(k, v); } catch {} }
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }
function sync() { return window.TehfizSync || null; }
function signedIn() { const s = sync(); return !!(s && s.isSignedIn && s.isSignedIn()); }
function rosterList() { const s = sync(); return (s && s.roster) ? s.roster() : []; }
function localIds() {
  try { return new Set((getSessions() || []).map((x) => String(x.id))); } catch { return new Set(); }
}
function studentLabel(id, code) {
  const s = rosterList().find((x) => x.id === id);
  if (s && s.name) return s.name + ' · ' + s.code;
  return (s && s.code) || code || 'Unknown student';
}
/* m4: when it reached the student, and when it was last sent again. The card
   showed only the lesson's own date and "On this device", which read as if
   nothing said whether — or when — it had gone. */
function sentText(r) {
  const at = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  if (!r.created_at) return '';
  const upd = r.updated_at && r.updated_at - r.created_at > 60000 ? ' \u00b7 updated ' + at(r.updated_at) : '';
  return 'Sent ' + at(r.created_at) + upd;
}
/* m5: the device copies that carry the teacher's own grade. */
function gradedIds() {
  const out = new Set();
  try {
    (getSessions() || []).forEach((s) => {
      const g = (x) => typeof isTeacherGraded === 'function' && isTeacherGraded(x);
      if (g(s) || (s.segments || []).some(g)) out.add(String(s.id));
    });
  } catch {}
  return out;
}
function dateText(r) {
  const ymd = r.date_ymd || (r.started_at ? new Date(r.started_at).toISOString().slice(0, 10) : '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function durText(sec) {
  if (sec == null) return 'untimed';
  const m = Math.round(sec / 60);
  if (m < 1) return 'under a minute';
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
}
function stageText(stages) {
  if (!stages) return '';
  return String(stages).split(',').map((x) => x.trim()).filter(Boolean)
    .map((x) => (typeof sessionTypeLabel === 'function' ? sessionTypeLabel(x) : x)).join(' · ');
}

/* ── panel scaffolding ──────────────────────────────────────────────── */
function injectCss() {
  if (document.getElementById('tssCss')) return;
  const st = document.createElement('style');
  st.id = 'tssCss';
  st.textContent = `
.tss-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border2);margin:2px 0 10px;}
.tss-tab{font:inherit;font-size:13px;padding:8px 12px;min-height:36px;border:none;background:none;color:var(--ink3);
  cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:inline-flex;align-items:center;gap:6px;}
.tss-tab:hover{color:var(--ink);}
.tss-tab.on{color:var(--ink);font-weight:600;border-bottom-color:var(--gold);}
.tss-tab span{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink3);font-weight:400;}
.tss-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}
.tss-bar label{font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px;}
.tss-bar select{font:inherit;font-size:13px;min-height:34px;padding:4px 8px;border:1px solid var(--border2);
  border-radius:6px;background:var(--parchment);color:var(--ink);max-width:260px;}
.tss-note{font-size:13px;color:var(--ink3);padding:18px 4px;text-align:center;}
.tss-err{font-size:13px;color:var(--red);padding:10px 4px;}
.tss-list{display:flex;flex-direction:column;gap:8px;}
.tss-card{border:1px solid var(--border2);border-radius:8px;background:var(--parchment);padding:10px 12px;}
.tss-card.hid{opacity:.7;}
.tss-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;}
.tss-name{font-weight:600;font-size:14px;color:var(--ink);}
.tss-date{font-size:12px;color:var(--ink3);white-space:nowrap;}
.tss-meta{font-size:12px;color:var(--ink2);margin-top:3px;display:flex;flex-wrap:wrap;gap:4px 12px;}
.tss-who{font-weight:600;color:var(--ink);}
.tss-flags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;}
.tss-flag{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--border2);color:var(--ink2);background:var(--parchment2);}
.tss-flag.local{border-color:var(--border2);color:var(--ink2);background:var(--parchment2);}
.tss-flag.sent{border-color:var(--ink2);color:var(--ink);background:transparent;}
.tss-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.tss-card.tap{cursor:pointer;}
.tss-card.tap:hover{border-color:var(--ink3);}
.tss-card.tap:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.tss-card.busy{opacity:.7;pointer-events:none;}
.tss-head .tss-date{margin-left:auto;}
.tss-dots{min-width:34px;font-size:15px;line-height:1;}
.tss-menu{border-top:1px dashed var(--border2);padding-top:8px;}
.tss-more{display:flex;justify-content:center;margin-top:10px;}
.tss-fix{margin-top:8px;padding:10px;border:1px solid var(--border2);border-radius:8px;background:var(--parchment2);font-size:13px;color:var(--ink2);display:flex;flex-direction:column;gap:6px;}
.tss-fix label{font-weight:600;color:var(--ink);}
.tss-fix select{font:inherit;font-size:14px;min-height:40px;padding:4px 8px;border:1px solid var(--border2);border-radius:6px;background:var(--parchment);color:var(--ink);max-width:100%;}
.tss-fix .tss-acts{margin-top:2px;}
.tss-stu{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:10px 12px;
  border:1px solid var(--border2);border-radius:8px;background:var(--parchment2);}
.tss-stu-name{font-weight:600;font-size:14px;color:var(--ink);margin-right:auto;min-width:0;}
.tss-stu-name span{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:400;color:var(--ink3);margin-left:6px;}
.tss-stu a{text-decoration:none;}
`;
  document.head.appendChild(st);
}

function mount() {
  const panel = document.querySelector('#sessionsOverlay .sessions-panel');
  if (!panel) return;
  injectCss();
  const title = panel.querySelector('.sp-title');
  if (title && title.textContent !== 'Sessions') title.textContent = 'Sessions';
  // Sent is the default view; the device list is the fallback when there is
  // no server to ask. Not remembered between opens, on purpose.
  tab = signedIn() ? 'sent' : 'device';
  // Re-read on every open (m3): Invoices' "untimed · fix" hands over a student
  // this way, and a value read once at load would ignore it.
  const want = read(KEY_STUDENT) || '';
  if (want !== student) { student = want; loadedFor = null; }
  let tabs = panel.querySelector('.tss-tabs');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.className = 'tss-tabs'; tabs.setAttribute('role', 'tablist');
    (title || panel.firstChild).insertAdjacentElement('afterend', tabs);
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tss-tab]'); if (!b) return;
      setTab(b.dataset.tssTab);
    });
  }
  let pane = document.getElementById('tssPane');
  if (!pane) {
    pane = document.createElement('div'); pane.id = 'tssPane';
    const list = document.getElementById('sessionsListInner');
    list.insertAdjacentElement('afterend', pane);
    pane.addEventListener('click', onClick);
    pane.addEventListener('change', onChange);
    pane.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tss-card')) { e.preventDefault(); e.target.click(); }
    });
  }
  apply();
}

function setTab(t) {
  tab = t === 'sent' ? 'sent' : 'device';
  apply();
}

function apply() {
  const panel = document.querySelector('#sessionsOverlay .sessions-panel');
  if (!panel) return;
  const n = localIds().size;
  panel.querySelector('.tss-tabs').innerHTML =
    '<button class="tss-tab' + (tab === 'sent' ? ' on' : '') + '" role="tab" aria-selected="' + (tab === 'sent') +
      '" data-tss-tab="sent">Sent to students</button>' +
    '<button class="tss-tab' + (tab === 'device' ? ' on' : '') + '" role="tab" aria-selected="' + (tab === 'device') +
      '" data-tss-tab="device">On this device <span>' + n + '</span></button>';
  const sub = panel.querySelector('.sp-sub'), list = document.getElementById('sessionsListInner');
  const pane = document.getElementById('tssPane');
  const dev = tab === 'device';
  if (sub) sub.style.display = dev ? '' : 'none';
  if (list) list.style.display = dev ? '' : 'none';
  pane.style.display = dev ? 'none' : '';
  if (!dev) {
    // Reload when the filter changed or the list is more than a minute old.
    const key = student + '|' + Math.floor(Date.now() / 60000);
    if (signedIn() && loadedFor !== key && !loading) load(true, key); else render();
  }
}

/* ── data ───────────────────────────────────────────────────────────── */
async function load(reset, key) {
  if (reset) { rows = []; offset = 0; }
  loading = true; error = ''; render();
  try {
    const q = '/api/sessions?limit=' + PAGE + '&offset=' + offset +
      (student ? '&studentId=' + encodeURIComponent(student) : '');
    const d = await sync().api(q);
    const got = (d && d.sessions) || [];
    rows = rows.concat(got);
    offset += got.length;
    more = got.length === PAGE;
    loadedFor = key || loadedFor;
  } catch (err) {
    error = err && err.status === 401 ? 'Signed out — sign in again to see sent sessions.'
      : 'Could not load sent sessions: ' + (err && err.message || 'offline');
  }
  loading = false; render();
}

async function fetchSession(row) {
  const d = await sync().api('/api/sessions/' + encodeURIComponent(row.id) + '/payload');
  const s = d && d.session;
  if (!s) throw new Error('empty session');
  // Names never reach the server; put back the one this device knows.
  if (!s.student) {
    // m6: the server's row says whose it is; the id inside the payload is
    // only the app's note from when it was sent, and is stale after a move.
    const r = rosterList().find((x) => x.id === (row.student_id || s.studentId));
    if (r && r.name) s.student = r.name;
  }
  if (row.student_id) s.studentId = row.student_id;
  if (typeof migrateMistakes === 'function') s.mistakes = migrateMistakes(s.mistakes || []);
  return s;
}

/* ── render ─────────────────────────────────────────────────────────── */
function render() {
  const pane = document.getElementById('tssPane');
  if (!pane || tab !== 'sent') return;
  if (!signedIn()) {
    pane.innerHTML = '<div class="tss-note">Sign in to see the sessions you have sent to students.' +
      '<div style="margin-top:10px;"><button class="btn-tiny accent" data-tss="signin">Sign in</button></div></div>';
    return;
  }
  const ros = rosterList().slice().sort((a, b) => (a.name || '~' + a.code).localeCompare(b.name || '~' + b.code));
  const opts = '<option value="">All students</option>' + ros.map((s) =>
    '<option value="' + esc(s.id) + '"' + (s.id === student ? ' selected' : '') + '>' +
      esc(s.name ? s.name + ' · ' + s.code : s.code) + '</option>').join('');
  const bar = '<div class="tss-bar"><label for="tssStudent">Student</label>' +
    '<select id="tssStudent" data-tss="student">' + opts + '</select>' +
    '<button class="btn-tiny" data-tss="refresh" title="Reload from the server">↻ Refresh</button></div>';
  const stu = student ? studentStrip(student) : '';

  let body;
  if (error) body = '<div class="tss-err">' + esc(error) + '</div>';
  else if (loading && !rows.length) body = '<div class="tss-note">Loading…</div>';
  else if (!rows.length) {
    const who = student ? studentLabel(student) : '';
    body = '<div class="tss-note">' + (who ? 'No sessions sent to ' + esc(who) + ' yet.' : 'No sessions sent yet.') + '</div>';
  } else {
    const local = localIds();
    const graded = gradedIds();
    body = '<div class="tss-list">' + rows.map((r) => {
      const isLocal = local.has(String(r.client_id));
      const flags = [
        r.created_at ? '<span class="tss-flag sent">\u2713 ' + esc(sentText(r)) + '</span>' : '',
        isLocal ? '<span class="tss-flag local">On this device</span>' : '',
        r.hidden_at ? '<span class="tss-flag">Hidden from student</span>' : '',
        r.own ? '' : '<span class="tss-flag">From another teacher</span>',
        graded.has(String(r.client_id)) ? '<span class="tss-flag">\u2713 Graded</span>' : '',
      ].join('');
      const meta = [
        student ? '' : '<span class="tss-who">' + esc(studentLabel(r.student_id, r.student_code)) + '</span>',
        (r.mistake_count != null ? r.mistake_count + ' mistake' + (r.mistake_count === 1 ? '' : 's') : ''),
        durText(r.duration_sec),
        stageText(r.stages),
      ].filter(Boolean).map((x) => x.startsWith('<') ? x : '<span>' + esc(x) + '</span>').join('');
      const b = busy === r.id;
      const m = menuFor === r.id;
      // m5: the card itself opens the review; everything else is in ⋯.
      return '<div class="tss-card tap' + (r.hidden_at ? ' hid' : '') + (b ? ' busy' : '') + '" data-tss="review" data-id="' + esc(r.id) + '" role="button" tabindex="0" title="Tap to review">' +
        '<div class="tss-head"><span class="tss-name">' + esc(r.session_name || 'Untitled session') + '</span>' +
          '<span class="tss-date">' + esc(dateText(r)) + '</span>' +
          '<button class="btn-tiny tss-dots" data-tss="menu" data-id="' + esc(r.id) + '" aria-haspopup="true" aria-expanded="' + m + '" aria-label="More" title="More">\u22ef</button></div>' +
        '<div class="tss-meta">' + meta + (b ? '<span>Opening\u2026</span>' : '') + '</div>' +
        (flags ? '<div class="tss-flags">' + flags + '</div>' : '') +
        (m ? '<div class="tss-acts tss-menu" role="menu">' +
          (isLocal ? '' : '<button class="btn-tiny" data-tss="save" data-id="' + esc(r.id) + '"' + (b ? ' disabled' : '') + '>⇩ Save to this device</button>') +
          // m4: grades are edited on the device copy, then sent again.
          (isLocal && window.TehfizGrades ? '<button class="btn-tiny" data-tss="grade" data-cid="' + esc(r.client_id) + '">Grades</button>' : '') +
          '<a class="btn-tiny" href="/app/student?review=' + encodeURIComponent(r.student_id) + '" target="_blank" rel="noopener">Student’s view ↗</a>' +
          (r.own && sync().unsend ? '<button class="btn-tiny" data-tss="ask-move" data-id="' + esc(r.id) + '">Move to another student…</button>' +
            '<button class="btn-tiny" data-tss="ask-undo" data-id="' + esc(r.id) + '">Undo send</button>' : '') +
        '</div>' + (fix && fix.id === r.id ? fixHtml(r, isLocal) : '') : '') +
        '</div>';
    }).join('') + '</div>' +
      (more ? '<div class="tss-more"><button class="btn-tiny" data-tss="more"' + (loading ? ' disabled' : '') + '>' +
        (loading ? 'Loading…' : 'Show more') + '</button></div>' : '');
  }
  pane.innerHTML = bar + stu + body;
}

/* m6: the question under a card's menu — undo the send, or move it. */
function fixHtml(r, isLocal) {
  const who = studentLabel(r.student_id, r.student_code), dis = fix.busy ? ' disabled' : '';
  if (fix.kind === 'undo') {
    return '<div class="tss-fix"><span>Take it back from ' + esc(who) + '? ' +
      (isLocal ? 'It stays saved on this device.' : 'It is copied to this device first, so nothing is lost.') +
      ' Their map is not changed.</span><div class="tss-acts">' +
      '<button class="btn-tiny accent" data-tss="do-undo" data-id="' + esc(r.id) + '"' + dis + '>' + (fix.busy ? 'Undoing…' : 'Undo send') + '</button>' +
      '<button class="btn-tiny" data-tss="fix-cancel"' + dis + '>Keep it sent</button></div></div>';
  }
  const others = rosterList().filter((s) => s.id !== r.student_id && !s.archived)
    .sort((a, b) => (a.name || '~' + a.code).localeCompare(b.name || '~' + b.code));
  if (!others.length) return '<div class="tss-fix"><span>There is no other student to move it to yet.</span></div>';
  return '<div class="tss-fix"><label for="tssMoveTo">Move it from ' + esc(who) + ' to</label>' +
    '<select id="tssMoveTo">' + others.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name ? s.name + ' · ' + s.code : s.code) + '</option>').join('') + '</select>' +
    '<span>' + esc(who) + ' stops seeing it. Maps are not changed; correct them in each student’s profile if needed.</span><div class="tss-acts">' +
    '<button class="btn-tiny accent" data-tss="do-move" data-id="' + esc(r.id) + '"' + dis + '>' + (fix.busy ? 'Moving…' : 'Move') + '</button>' +
    '<button class="btn-tiny" data-tss="fix-cancel"' + dis + '>Cancel</button></div></div>';
}

/* One student picked: the two ways to see their whole record. Both open the
   student viewer in review mode in a new tab; open=progress asks it to show
   the progress report as soon as the sessions have loaded. */
function studentStrip(id) {
  const s = rosterList().find((x) => x.id === id) || {};
  const base = '/app/student?review=' + encodeURIComponent(id);
  return '<div class="tss-stu">' +
    '<span class="tss-stu-name">' + esc(s.name || s.code || 'This student') +
      (s.name && s.code ? '<span>' + esc(s.code) + '</span>' : '') + '</span>' +
    '<a class="btn-tiny accent" href="' + base + '&open=progress" target="_blank" rel="noopener">📊 Progress report ↗</a>' +
    '<a class="btn-tiny" href="' + base + '" target="_blank" rel="noopener">Mushaf view ↗</a>' +
  '</div>';
}

/* ── events ─────────────────────────────────────────────────────────── */
async function onClick(e) {
  const t = e.target.closest('[data-tss]');
  if (!t) return;
  const act = t.dataset.tss;
  if (act === 'menu') { e.stopPropagation(); menuFor = menuFor === t.dataset.id ? null : t.dataset.id; fix = null; render(); return; }
  if (act === 'review' && e.target.closest('a, .tss-menu, .tss-fix')) return;
  if (act === 'ask-undo' || act === 'ask-move') { fix = { id: t.dataset.id, kind: act.slice(4), busy: false }; render(); return; }
  if (act === 'fix-cancel') { fix = null; render(); return; }
  if (act === 'do-undo' || act === 'do-move') { await doFix(act.slice(3), t.dataset.id); return; }
  if (act === 'signin') { if (typeof closeSessions === 'function') closeSessions(); sync().open(); return; }
  if (act === 'refresh') { load(true, student + '|' + Math.floor(Date.now() / 60000)); return; }
  if (act === 'more') { load(false); return; }
  if (act === 'grade') {
    // The device copy's id is the app's own session id (client_id).
    const id = Number(t.dataset.cid);
    if (window.TehfizGrades) window.TehfizGrades.openEditor(Number.isFinite(id) ? id : t.dataset.cid);
    return;
  }
  const row = rows.find((r) => String(r.id) === t.dataset.id);
  if (!row) return;
  if (act === 'review' || act === 'save') {
    busy = row.id; render();
    try {
      const s = await fetchSession(row);
      if (act === 'review') reviewSessionObject(s);
      else {
        importSingle(s, true);
        if (typeof renderSessionsList === 'function') renderSessionsList();
        toast('Saved to this device');
        apply();
      }
    } catch (err) {
      toast('Could not open that session: ' + (err && err.message || 'offline'));
    }
    busy = null; render();
  }
}
async function doFix(kind, id) {
  const row = rows.find((r) => String(r.id) === id);
  if (!row || !fix || fix.busy) return;
  const sel = document.getElementById('tssMoveTo');
  const to = kind === 'move' ? rosterList().find((s) => sel && s.id === sel.value) : null;
  if (kind === 'move' && !to) return;
  fix.busy = true; render();
  let r = 'error';
  try {
    if (kind === 'undo') {
      // Not on this device: bring it here first, so undoing never loses a lesson.
      if (!localIds().has(String(row.client_id))) {
        importSingle(await fetchSession(row), true);
        if (typeof renderSessionsList === 'function') renderSessionsList();
      }
      r = await sync().unsend(row.client_id, row.id);
    } else {
      r = await sync().moveSession(row.client_id, to.id, row.id);
    }
  } catch (err) { r = 'error'; }
  fix = null;
  if (r === 'undone') {
    rows = rows.filter((x) => x !== row); menuFor = null;
    toast('Send undone — it is saved on this device');
    apply();
    // m7: the lesson open in the app — straight back to Finish session.
    let cur = null; try { cur = typeof _currentSessionId !== 'undefined' ? _currentSessionId : null; } catch (e) { cur = null; }
    if (cur != null && String(cur) === String(row.client_id) && window.TehfizFinish) {
      if (typeof closeSessions === 'function') closeSessions();
      window.TehfizFinish.open();
      return;
    }
  } else if (r === 'moved') {
    row.student_id = to.id; row.student_code = to.code; menuFor = null;
    if (student && student !== to.id) rows = rows.filter((x) => x !== row);
    toast('Moved to ' + (to.name || to.code));
  } else {
    toast(r === 'offline' ? 'No connection — nothing was changed. Try again when you are online.' : 'That did not work. Try again.');
  }
  render();
}
function onChange(e) {
  if (e.target.id !== 'tssStudent') return;
  student = e.target.value || '';
  write(KEY_STUDENT, student);
  load(true, student + '|' + Math.floor(Date.now() / 60000));
}

window.TehfizSent = { mount, version: TEHFIZ_SENT_VERSION };
})();
