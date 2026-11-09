/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-callink.js — TehfizCalLink — cl1
   Loaded by both apps, from /app/shared/tehfiz-callink.js?v=cl1.

   Lessons in your own calendar app (Apple, Google, Outlook), which then does
   the reminding. Two ways, side by side:

   · a calendar link (server, 0015): the calendar app subscribes to it and
     follows every change the teacher makes. Made on first use; "Make a new
     link" replaces it (the old one stops); "Turn off" removes it. The reminder
     before each lesson is kept with the link (Apple and Outlook use it;
     Google uses the reminder set for that calendar in Google).
   · a calendar file made on this device: the student's weekly lesson times
     once, repeating (weeklyIcs), or the teacher's next eight weeks with
     students' names (eventsIcs). These do not follow later changes.

     TehfizCalLink.open({ who: 'student'|'teacher', api, token, title, intro,
                          file: { label, note, build: () => {name, text} } | null })
     TehfizCalLink.weeklyIcs({ name, timetables:[{slots, tz}], alarm })   → text
     TehfizCalLink.eventsIcs({ name, events:[{uid, start, end, summary, desc}], alarm }) → text

   Times: weekly lessons are written in the teacher's own zone, with that zone
   described in the file (VTIMEZONE, worked out from this browser's time-zone
   data), so a lesson stays at the same wall time for the teacher across
   daylight saving, as in the apps. Single events are exact UTC moments.

   Self-contained:
     namespace  TehfizCalLink
     CSS        .tzcl-* (injected once; not .tcl-*, which is the viewer's login)
     DOM        #tzclRoot, appended to <body>
   Needs TehfizTime (shared/tehfiz-time.js).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_CALLINK_VERSION = 'cl1';
const T = () => window.TehfizTime;
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DAY = 86400000;
const ALARMS = [[0, 'No reminder'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'],
  [60, '1 hour before'], [120, '2 hours before'], [1440, 'A day before']];

/* ── iCalendar text ────────────────────────────────────────────────────── */
function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsUtc(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
const p2 = (n) => String(n).padStart(2, '0');
function icsLocal(p) { return p.y + p2(p.mo) + p2(p.d) + 'T' + p2(p.h) + p2(p.mi) + '00'; }
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function wrap(name, body) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tehfiz//Lessons//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(name)].concat(body, ['END:VCALENDAR']).map(fold).join('\r\n') + '\r\n';
}
function alarmLines(alarm, summary) {
  return alarm > 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(summary), 'TRIGGER:-PT' + alarm + 'M', 'END:VALARM'] : [];
}

/* A zone's offsets from a year back to three years ahead, as VTIMEZONE: one
   part for each change, found to the minute. A zone with no daylight saving
   is a single part. */
function offText(m) { const s = m < 0 ? '-' : '+', a = Math.abs(m); return s + p2(Math.floor(a / 60)) + p2(a % 60); }
function vtimezone(tz) {
  const off = (ms) => T().offsetMin(ms, tz);
  const start = Date.now() - 400 * DAY, end = Date.now() + 3 * 366 * DAY;
  const changes = [];
  let prevMs = start, prev = off(start);
  for (let t = start + DAY; t <= end; t += DAY) {
    const o = off(t);
    if (o === prev) { prevMs = t; continue; }
    let lo = prevMs, hi = t;                      // offset `prev` at lo, `o` at hi
    while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 2 / 60000) * 60000; if (off(mid) === prev) lo = mid; else hi = mid; }
    changes.push({ at: hi, from: prev, to: o });
    prev = o; prevMs = t;
  }
  const first = changes.length ? changes[0].from : off(start);
  const L = ['BEGIN:VTIMEZONE', 'TZID:' + tz,
    'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:' + offText(first), 'TZOFFSETTO:' + offText(first), 'END:STANDARD'];
  changes.forEach((c) => {
    const kind = c.to > c.from ? 'DAYLIGHT' : 'STANDARD';
    const d = new Date(c.at + c.from * 60000);   // the moment, as wall time before the change
    const p = { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
    L.push('BEGIN:' + kind, 'DTSTART:' + icsLocal(p), 'TZOFFSETFROM:' + offText(c.from), 'TZOFFSETTO:' + offText(c.to), 'END:' + kind);
  });
  L.push('END:VTIMEZONE');
  return L;
}

/* Each weekly lesson once, repeating every week, in its teacher's zone. */
function weeklyIcs(o) {
  const body = [], zones = new Set(), now = Date.now(), stamp = icsUtc(now), summary = 'Quran lesson';
  (o.timetables || []).forEach((tt, i) => {
    if (!tt || !tt.slots || !T().validTz(tt.tz)) return;
    Object.keys(tt.slots).forEach((wd) => {
      const s = tt.slots[wd];
      if (!s || !/^\d{1,2}:\d{2}$/.test(String(s.t || ''))) return;
      const first = T().occurrences({ slots: { [wd]: s }, tz: tt.tz }, now - DAY, now + 8 * DAY)[0];
      if (!first) return;
      zones.add(tt.tz);
      const p = T().partsIn(first.at, tt.tz);
      body.push('BEGIN:VEVENT', 'UID:weekly-' + i + '-' + wd + '-' + first.at + '@tehfiz.com', 'DTSTAMP:' + stamp,
        'DTSTART;TZID=' + tt.tz + ':' + icsLocal(p), 'DURATION:PT' + (+s.len || 30) + 'M', 'RRULE:FREQ=WEEKLY',
        'SUMMARY:' + summary, ...alarmLines(o.alarm, summary), 'END:VEVENT');
    });
  });
  if (!body.length) return null;
  let tzs = [];
  zones.forEach((z) => { tzs = tzs.concat(vtimezone(z)); });
  return wrap(o.name || 'Quran lessons', tzs.concat(body));
}
/* Single lessons at exact moments. */
function eventsIcs(o) {
  const stamp = icsUtc(Date.now()), body = [];
  (o.events || []).forEach((e) => {
    body.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stamp, 'DTSTART:' + icsUtc(e.start), 'DTEND:' + icsUtc(e.end),
      'SUMMARY:' + icsText(e.summary), ...(e.desc ? ['DESCRIPTION:' + icsText(e.desc)] : []), ...alarmLines(o.alarm, e.summary), 'END:VEVENT');
  });
  return body.length ? wrap(o.name || 'Lessons', body) : null;
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ── the sheet ─────────────────────────────────────────────────────────── */
let st = null;   // {o, link, busy, err, confirm, copied, alarm}

function css() {
  if ($('tzclCss')) return;
  const el = document.createElement('style'); el.id = 'tzclCss';
  el.textContent =
    '#tzclRoot{position:fixed;inset:0;z-index:1260;display:flex;align-items:flex-end;justify-content:center;background:rgba(23,25,28,.38);}' +
    '#tzclRoot[hidden]{display:none;}' +
    '.tzcl-sheet{width:100%;max-width:480px;max-height:92vh;overflow:auto;background:var(--parchment);color:var(--ink);border-radius:16px 16px 0 0;' +
      'padding:10px 16px 18px;padding-bottom:max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;' +
      'box-shadow:0 -8px 28px rgba(0,0,0,.25);font-family:var(--ui-font);}' +
    '@media (min-width:700px){#tzclRoot{align-items:center;}.tzcl-sheet{border-radius:14px;}}' +
    '.tzcl-grab{width:40px;height:4px;border-radius:9px;background:var(--parchment3);align-self:center;flex:none;}' +
    '.tzcl-h{display:flex;align-items:center;gap:10px;}.tzcl-h b{flex:1;font-size:17px;}' +
    '.tzcl-x{width:36px;height:36px;flex:none;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;font-size:15px;}' +
    '.tzcl-p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink2);}' +
    '.tzcl-opt{display:flex;flex-direction:column;gap:8px;border:1px solid var(--border2);border-radius:12px;padding:12px;background:var(--surface,#fff);}' +
    '.tzcl-opt b{font-size:14.5px;}.tzcl-opt small{font-size:12.5px;line-height:1.45;color:var(--ink3);}' +
    '.tzcl-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}' +
    '.tzcl-btn{display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 14px;border:1px solid var(--border2);border-radius:9px;' +
      'background:var(--parchment);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;text-decoration:none;box-sizing:border-box;line-height:1;}' +
    '.tzcl-btn.pri{background:var(--ink);border-color:var(--ink);color:var(--parchment);}' +
    '.tzcl-btn[disabled]{opacity:.55;cursor:default;}' +
    '.tzcl-sel{height:38px;border:1px solid var(--border2);border-radius:9px;background:var(--parchment);color:var(--ink);font:500 14px var(--ui-font);padding:0 8px;}' +
    '.tzcl-lab{font-size:13.5px;color:var(--ink2);}' +
    '.tzcl-link{border:0;background:none;padding:0;color:var(--ink2);text-decoration:underline;font:inherit;cursor:pointer;}' +
    '.tzcl-foot{font-size:12.5px;line-height:1.5;color:var(--ink3);}' +
    '.tzcl-err{font-size:13px;color:var(--red,#b3261e);}' +
    '.tzcl-warn{display:flex;flex-direction:column;gap:8px;border-left:3px solid var(--red,#b3261e);padding:4px 0 4px 10px;font-size:13px;color:var(--ink2);}';
  document.head.appendChild(el);
}
function root() {
  let r = $('tzclRoot');
  if (!r) {
    r = document.createElement('div'); r.id = 'tzclRoot'; r.hidden = true;
    document.body.appendChild(r);
    r.addEventListener('click', onClick);
    r.addEventListener('change', onChange);
  }
  return r;
}
function endpoint() { return st.o.who === 'teacher' ? '/api/profile/calendar' : '/api/student/calendar'; }
async function call(method, body) {
  const res = await fetch((st.o.api || '') + endpoint(), {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.o.token },
    body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(res.status === 401 ? 'signedout' : 'http ' + res.status);
  return res.json();
}
/* The link's full address: this page's own, in front of the path the server gave. */
function full(path) {
  const base = st.o.api && /^https?:/.test(st.o.api) ? st.o.api : location.origin;
  return base.replace(/\/+$/, '') + path;
}
function webcal(path) { return full(path).replace(/^https?:/, 'webcal:'); }

async function open(o) {
  if (!o || !T()) return;
  css();
  st = { o, link: null, busy: true, err: '', confirm: null, copied: false, alarm: 30 };
  render();
  if (!o.token) { st.busy = false; st.err = 'signedout'; render(); return; }
  try { const r = await call('GET'); if (!st) return; st.link = r.path ? r : null; st.alarm = r.alarm_min; }
  catch (e) { if (!st) return; st.err = String(e.message); }
  st.busy = false; render();
}
function close() { const r = $('tzclRoot'); if (r) { r.hidden = true; r.innerHTML = ''; } st = null; }

function render() {
  const r = root(); if (!st) return;
  const o = st.o, L = st.link;
  const alarmSel = '<label class="tzcl-row"><span class="tzcl-lab">Remind me</span><select class="tzcl-sel" id="tzclAlarm"' + (st.busy ? ' disabled' : '') + '>' +
    ALARMS.map(([m, l]) => '<option value="' + m + '"' + (m === st.alarm ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
  let linkBox;
  if (st.err === 'signedout') {
    linkBox = '<div class="tzcl-err">' + (o.who === 'teacher' ? 'Sign in first to get a calendar link.' : 'Log in with your code first to get a calendar link.') + '</div>';
  } else if (st.busy && !L) {
    linkBox = '<small>Loading…</small>';
  } else if (!L) {
    linkBox = '<small>' + esc(o.who === 'teacher'
      ? 'Your calendar subscribes to a private link and follows every change. It shows "Tehfiz lesson", the time and the plan; never names or codes.'
      : 'Your calendar subscribes to a private link. When your teacher moves or adds a lesson, your calendar changes too.') + '</small>' +
      alarmSel +
      '<div class="tzcl-row"><button type="button" class="tzcl-btn pri" data-tzcl="make"' + (st.busy ? ' disabled' : '') + '>Get my calendar link</button></div>';
  } else {
    linkBox = '<small>' + esc(o.who === 'teacher'
      ? 'Follows every change. Shows "Tehfiz lesson", the time and the plan; never names or codes.'
      : 'Follows your teacher’s changes. Apple and Outlook check about every hour; Google can take up to a day.') + '</small>' +
      '<div class="tzcl-row">' +
        '<a class="tzcl-btn pri" href="' + esc(webcal(L.path)) + '">Add to Apple / Outlook</a>' +
        '<a class="tzcl-btn" target="_blank" rel="noopener" href="' + esc('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal(L.path))) + '">Add to Google</a>' +
        '<button type="button" class="tzcl-btn" data-tzcl="copy">' + (st.copied ? 'Copied ✓' : 'Copy link') + '</button>' +
      '</div>' + alarmSel +
      '<small>Apple and Outlook use this reminder (if your phone asks, keep alerts on). In Google, set the reminder in that calendar’s settings.</small>' +
      (st.confirm
        ? '<div class="tzcl-warn"><span>' + (st.confirm === 'reset'
            ? 'A new link replaces this one. Calendars using the old link stop getting lessons, and need adding again.'
            : 'Calendars using this link stop getting lessons. You can get a new link any time.') + '</span>' +
            '<div class="tzcl-row"><button type="button" class="tzcl-btn pri" data-tzcl="' + st.confirm + 'yes">' + (st.confirm === 'reset' ? 'Make a new link' : 'Turn off') + '</button>' +
            '<button type="button" class="tzcl-btn" data-tzcl="unconfirm">Keep it</button></div></div>'
        : '<div class="tzcl-foot"><button type="button" class="tzcl-link" data-tzcl="reset">Make a new link</button> · ' +
            '<button type="button" class="tzcl-link" data-tzcl="off">Turn off</button> · Treat the link like a password: anyone with it sees your lesson times.</div>');
  }
  const fileBox = o.file
    ? '<div class="tzcl-opt"><b>' + esc(o.file.label) + '</b><small>' + esc(o.file.note) + '</small>' +
        '<div class="tzcl-row"><button type="button" class="tzcl-btn" data-tzcl="file">' + esc(o.file.button || 'Download') + '</button></div>' +
        (st.fileErr ? '<div class="tzcl-err">' + esc(st.fileErr) + '</div>' : '') + '</div>'
    : '';
  r.innerHTML = '<div class="tzcl-sheet" role="dialog" aria-modal="true" aria-label="' + esc(o.title || 'Add to my calendar') + '"><div class="tzcl-grab"></div>' +
    '<div class="tzcl-h"><b>' + esc(o.title || 'Add to my calendar') + '</b><button type="button" class="tzcl-x" data-tzcl="close" aria-label="Close">✕</button></div>' +
    (o.intro ? '<p class="tzcl-p">' + esc(o.intro) + '</p>' : '') +
    '<div class="tzcl-opt"><b>' + esc(o.who === 'teacher' ? 'Keep my calendar up to date' : 'Keep my calendar up to date') + '</b>' + linkBox +
      (st.err && st.err !== 'signedout' ? '<div class="tzcl-err">Couldn’t reach Tehfiz. Check your connection and try again.</div>' : '') + '</div>' +
    fileBox + '</div>';
  r.hidden = false;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(t); t.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  t.remove(); return ok;
}
async function post(body) {
  st.busy = true; st.err = ''; render();
  try { const r = await call('POST', body); if (!st) return; st.link = r.path ? r : null; st.alarm = r.alarm_min; }
  catch (e) { if (!st) return; st.err = String(e.message); }
  st.busy = false; st.confirm = null; render();
}
function onChange(e) {
  if (!st || e.target.id !== 'tzclAlarm') return;
  st.alarm = +e.target.value;
  if (st.link) post({ alarm_min: st.alarm });      // without a link yet, it goes with "Get my calendar link"
}
function onClick(e) {
  if (!st) return;
  if (e.target.id === 'tzclRoot') return close();
  const b = e.target.closest('[data-tzcl]'); if (!b) return;
  const a = b.dataset.tzcl;
  if (a === 'close') return close();
  if (a === 'make') return post({ alarm_min: st.alarm });
  if (a === 'copy') { copyText(full(st.link.path)).then((ok) => { if (st) { st.copied = ok; render(); } }); return; }
  if (a === 'reset' || a === 'off') { st.confirm = a; render(); return; }
  if (a === 'unconfirm') { st.confirm = null; render(); return; }
  if (a === 'resetyes') return post({ reset: true });
  if (a === 'offyes') return post({ off: true });
  if (a === 'file') {
    st.fileErr = '';
    const f = st.o.file && st.o.file.build ? st.o.file.build(st.alarm) : null;
    if (!f || !f.text) { st.fileErr = st.o.file.empty || 'There are no lessons to add yet.'; render(); return; }
    download(f.name, f.text);
  }
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && st) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
}, true);

window.TehfizCalLink = { open, close, isOpen: () => !!st, weeklyIcs, eventsIcs, version: TEHFIZ_CALLINK_VERSION };
})();
