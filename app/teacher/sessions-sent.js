/* ═══════════════════════════════════════════════════════════════════════
   sessions-sent.js — TehfizSent — m3
   Loaded by the teacher app only, from /app/teacher/sessions-sent.js?v=m3.

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
     TehfizSync.isSignedIn / api / roster / open     (sync module bridge)
     getSessions, importSingle, migrateMistakes,
     reviewSessionObject, renderSessionsList,
     sessionTypeLabel, showToast                     (app globals)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_SENT_VERSION = 'm3';
const KEY_STUDENT = 'tehfiz_sent_student';
const PAGE = 100;

let tab = 'sent';                          // chosen afresh on every open, see mount()
let student = read(KEY_STUDENT) || '';     // '' = all students
let rows = [], offset = 0, more = false, loading = false, error = '', loadedFor = null, busy = null;

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
.tss-flag.local{border-color:var(--green);color:var(--green);background:var(--green-bg);}
.tss-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.tss-more{display:flex;justify-content:center;margin-top:10px;}
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
    const r = rosterList().find((x) => x.id === (s.studentId || row.student_id));
    if (r && r.name) s.student = r.name;
  }
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
    body = '<div class="tss-list">' + rows.map((r) => {
      const isLocal = local.has(String(r.client_id));
      const flags = [
        isLocal ? '<span class="tss-flag local">On this device</span>' : '',
        r.hidden_at ? '<span class="tss-flag">Hidden from student</span>' : '',
        r.own ? '' : '<span class="tss-flag">From another teacher</span>',
      ].join('');
      const meta = [
        student ? '' : '<span class="tss-who">' + esc(studentLabel(r.student_id, r.student_code)) + '</span>',
        (r.mistake_count != null ? r.mistake_count + ' mistake' + (r.mistake_count === 1 ? '' : 's') : ''),
        durText(r.duration_sec),
        stageText(r.stages),
      ].filter(Boolean).map((x) => x.startsWith('<') ? x : '<span>' + esc(x) + '</span>').join('');
      const b = busy === r.id;
      return '<div class="tss-card' + (r.hidden_at ? ' hid' : '') + '">' +
        '<div class="tss-head"><span class="tss-name">' + esc(r.session_name || 'Untitled session') + '</span>' +
          '<span class="tss-date">' + esc(dateText(r)) + '</span></div>' +
        '<div class="tss-meta">' + meta + '</div>' +
        (flags ? '<div class="tss-flags">' + flags + '</div>' : '') +
        '<div class="tss-acts">' +
          '<button class="btn-tiny accent" data-tss="review" data-id="' + esc(r.id) + '"' + (b ? ' disabled' : '') + '>📊 Review</button>' +
          (isLocal ? '' : '<button class="btn-tiny" data-tss="save" data-id="' + esc(r.id) + '"' + (b ? ' disabled' : '') + '>⇩ Save to this device</button>') +
          '<a class="btn-tiny" href="/app/student?review=' + encodeURIComponent(r.student_id) + '" target="_blank" rel="noopener">Student’s view ↗</a>' +
        '</div></div>';
    }).join('') + '</div>' +
      (more ? '<div class="tss-more"><button class="btn-tiny" data-tss="more"' + (loading ? ' disabled' : '') + '>' +
        (loading ? 'Loading…' : 'Show more') + '</button></div>' : '');
  }
  pane.innerHTML = bar + stu + body;
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
  if (act === 'signin') { if (typeof closeSessions === 'function') closeSessions(); sync().open(); return; }
  if (act === 'refresh') { load(true, student + '|' + Math.floor(Date.now() / 60000)); return; }
  if (act === 'more') { load(false); return; }
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
function onChange(e) {
  if (e.target.id !== 'tssStudent') return;
  student = e.target.value || '';
  write(KEY_STUDENT, student);
  load(true, student + '|' + Math.floor(Date.now() / 60000));
}

window.TehfizSent = { mount, version: TEHFIZ_SENT_VERSION };
})();
