/* ═══════════════════════════════════════════════════════════════════════
   name-sync.js — TehfizNameSync — n1
   Loaded by the teacher app from /app/teacher/name-sync.js?v=n1, after the
   TehfizSync module.

   Student names live only on the teacher's device; the Tehfiz server has no
   name column and never receives one. This optional feature keeps a copy of
   the name list in the teacher's OWN Google Drive, in the hidden app folder
   Google gives each app (appDataFolder), so names follow the teacher to every
   device they sign in on. The browser talks to Google directly — the names
   still never pass through Tehfiz's server.

   Permission: https://www.googleapis.com/auth/drive.appdata — Tehfiz can see
   only files it created in that hidden folder, nothing else in the Drive.
   Asked for once, when the teacher turns sync on, through Google's token
   popup (Google Identity Services token model). Access tokens last an hour;
   while one is valid every name change is pushed within a couple of seconds.
   When it has expired, the panel shows "Sync now" — Google only allows the
   popup that renews it from a tap.

   Merge: each name carries the time it was last changed. Per student the
   newer one wins, on both sides. A name cleared on purpose is a change too.
   Students removed from this device are left alone in the Drive copy.

   Self-contained:
     namespace      TehfizNameSync
     localStorage   tehfiz_names_*
     CSS classes    .tns-*
     DOM            fills #tnsBox, which TehfizSync puts in the Students panel
   Needs from TehfizSync: roster(), applyNames(), who(), googleClientId,
   and the 'tehfiz:names-changed' event it fires whenever it saves the roster.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_NAMESYNC_VERSION = 'n1';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'tehfiz-student-names.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const K = {
  on: 'tehfiz_names_on',        // '1' when this device syncs
  tok: 'tehfiz_names_tok',      // {t, exp, email}
  meta: 'tehfiz_names_meta',    // {studentId: lastChangedMs}
  snap: 'tehfiz_names_snap',    // {studentId: name} as last seen
  last: 'tehfiz_names_last',    // {at, n} last successful sync
  dirty: 'tehfiz_names_dirty',  // '1' when local changes are waiting
  file: 'tehfiz_names_file',    // Drive file id
};

/* ── helpers ────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const sync = () => window.TehfizSync || null;
function get(k, fb) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch { return fb; } }
function put(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }
function isOn() { return get(K.on, null) === '1'; }
function who() { const s = sync(); return s && s.who ? s.who() : null; }
function rosterNow() { const s = sync(); return s && s.roster ? s.roster() : []; }
function ago(ms) {
  const d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.round(d / 60) + ' min ago';
  if (d < 86400) return Math.round(d / 3600) + ' h ago';
  try { return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch { return ''; }
}

let busy = false, status = '', statusErr = false, pushTimer = null, tokenClient = null, pendingState = null, afterToken = null;

/* ── token (Google Identity Services, token model) ─────────────────── */
function token() {
  const t = get(K.tok, null);
  const me = who();
  if (!t || !t.t || t.exp < Date.now()) return null;
  if (me && t.email && me.email && t.email !== me.email) return null;  // another account signed in
  return t.t;
}

let gisLoading = null;
function loadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve(true);
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(!!(window.google && google.accounts && google.accounts.oauth2));
    s.onerror = () => { gisLoading = null; resolve(false); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

function randomState() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function ensureClient() {
  if (tokenClient) return tokenClient;
  if (!(window.google && google.accounts && google.accounts.oauth2)) return null;
  const s = sync();
  if (!s || !s.googleClientId) return null;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: s.googleClientId,
    scope: SCOPE,
    callback: onToken,
    error_callback: (e) => {
      pendingState = null;
      setStatus(e && e.type === 'popup_closed' ? 'Google sign-in window was closed — names not synced.' : 'Could not reach Google. Try Sync now again.', true);
    },
  });
  return tokenClient;
}

/* Must run inside a tap: Google blocks the popup otherwise. Nothing async may
   come before requestAccessToken, which is why the library is loaded early. */
function requestToken(firstTime, then) {
  const c = ensureClient();
  if (!c) {
    loadGis().then(() => render());
    setStatus('Loading Google… tap again in a moment.', false);
    return;
  }
  const me = who();
  pendingState = randomState();
  afterToken = then || null;
  c.requestAccessToken({ prompt: firstTime ? 'consent' : '', login_hint: me ? me.email : undefined, state: pendingState });
}

function onToken(resp) {
  /* The state we sent must come back unchanged: a response that did not
     start from this tap is ignored (cross-site request forgery guard). */
  if (!resp || !pendingState || resp.state !== pendingState) {
    pendingState = null;
    setStatus('Google sign-in did not complete. Try again.', true);
    return;
  }
  pendingState = null;
  if (resp.error) { setStatus('Google said: ' + resp.error, true); return; }
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
    put(K.on, null);
    setStatus('Drive access was not allowed, so names stay on this device only.', true);
    render();
    return;
  }
  const me = who();
  put(K.tok, { t: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000, email: me ? me.email : null });
  const then = afterToken; afterToken = null;
  if (then) then(); else run();
}

/* ── Drive (appDataFolder only) ─────────────────────────────────────── */
async function drive(url, opts = {}) {
  const t = token();
  if (!t) { const e = new Error('no token'); e.code = 'token'; throw e; }
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  if (res.status === 401) { put(K.tok, null); const e = new Error('expired'); e.code = 'token'; throw e; }
  if (!res.ok) { const e = new Error('Drive ' + res.status); e.code = 'http'; throw e; }
  return res;
}

async function findFile() {
  const cached = get(K.file, null);
  if (cached) return cached;
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await drive(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  const j = await r.json();
  const id = j.files && j.files[0] ? j.files[0].id : null;
  if (id) put(K.file, id);
  return id;
}

async function readRemote(id) {
  try {
    const r = await drive(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`);
    const j = await r.json();
    return j && j.type === 'tehfiz-names' && j.students ? j : null;
  } catch (e) {
    if (e.code === 'http') { put(K.file, null); return null; }   // file gone: start a new one
    throw e;
  }
}

async function writeRemote(id, doc) {
  const body = JSON.stringify(doc);
  if (id) {
    await drive(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
    });
    return id;
  }
  const boundary = 'tns' + randomState();
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await drive(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  const j = await r.json();
  put(K.file, j.id);
  return j.id;
}

/* ── change tracking ────────────────────────────────────────────────── */
/* Called on every roster save. Any name that differs from the last snapshot
   gets "changed now"; that timestamp is what wins a merge. */
function noteChanges() {
  const snap = get(K.snap, null);
  const meta = get(K.meta, {});
  const now = Date.now();
  const next = {};
  let changed = 0;
  rosterNow().forEach((s) => {
    next[s.id] = s.name || '';
    if (snap && (snap[s.id] || '') !== (s.name || '')) { meta[s.id] = now; changed++; }
  });
  put(K.snap, next);
  if (changed) { put(K.meta, meta); put(K.dirty, '1'); }
  return changed;
}

function resnap() {
  const next = {};
  rosterNow().forEach((s) => { next[s.id] = s.name || ''; });
  put(K.snap, next);
}

/* ── the sync ───────────────────────────────────────────────────────── */
async function run() {
  if (!isOn() || busy) return;
  if (!token()) { setStatus(get(K.dirty, null) ? 'Changes waiting — tap Sync now.' : 'Tap Sync now to bring names up to date.', false); return; }
  busy = true; setStatus('Syncing…', false);
  try {
    noteChanges();
    const id = await findFile();
    const remote = id ? await readRemote(id) : null;
    const rStu = (remote && remote.students) || {};
    const meta = get(K.meta, {});
    const local = {};
    rosterNow().forEach((s) => { local[s.id] = { n: s.name || '', c: s.code || '', at: meta[s.id] || 0 }; });

    const out = {};
    const apply = {};
    const ids = new Set([...Object.keys(rStu), ...Object.keys(local)]);
    ids.forEach((sid) => {
      const L = local[sid], R = rStu[sid];
      if (!R) { if (L.n || L.at) out[sid] = L; return; }
      if (!L) { out[sid] = R; return; }               // not on this device: keep it in Drive
      let w;
      if (L.at > R.at) w = L;
      else if (R.at > L.at) w = R;
      else w = R.n ? R : L;                           // tie: keep whichever has a name
      out[sid] = { n: w.n, c: L.c || R.c || '', at: w.at };
      if (w.n !== L.n) { apply[sid] = w.n; meta[sid] = w.at; }
    });

    const changedLocal = Object.keys(apply).length;
    if (changedLocal) {
      sync().applyNames(apply);
      put(K.meta, meta);
      resnap();                                       // these came from Drive: not new edits here
    }
    const doc = { type: 'tehfiz-names', version: 1, updated: Date.now(), students: out };
    const same = remote && JSON.stringify(remote.students) === JSON.stringify(out);
    if (!same) await writeRemote(id, doc);
    put(K.dirty, null);
    put(K.last, { at: Date.now(), n: Object.keys(out).length });
    setStatus('', false);
    if (changedLocal) toast(changedLocal + ' name' + (changedLocal === 1 ? '' : 's') + ' updated from your Google Drive');
  } catch (e) {
    if (e.code === 'token') setStatus('Tap Sync now to reconnect to Google Drive.', false);
    else setStatus('Sync failed (' + e.message + '). Your names are safe on this device; try Sync now.', true);
  } finally {
    busy = false;
    render();
  }
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { if (isOn()) run(); }, 1500);
}

async function removeFromDrive() {
  const id = await findFile();
  if (id) await drive(`${DRIVE}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  put(K.file, null);
}

/* ── UI (inside the Students panel) ─────────────────────────────────── */
function setStatus(msg, err) { status = msg; statusErr = !!err; paintStatus(); }
function paintStatus() {
  const el = $('tnsStatus');
  if (!el) return;
  const last = get(K.last, null);
  el.textContent = status || (last ? 'Synced ' + ago(last.at) : '');
  el.classList.toggle('tns-err', statusErr);
}

function render() {
  const box = $('tnsBox');
  if (!box) return;
  const s = sync();
  const signed = s && s.isSignedIn && s.isSignedIn();
  if (!signed) { box.innerHTML = ''; return; }
  /* The panel's "names are on this device only" warning is untrue while
     syncing is on, so it steps aside. */
  const warn = document.querySelector('#tsyBody .tsy-warnbox');
  if (warn) warn.hidden = isOn();
  if (!isOn()) {
    box.innerHTML =
      '<div class="tns-card">' +
        '<div class="tns-h">Keep names on all your devices</div>' +
        '<p class="tns-p">Names are stored on this device only. Turn on sync to also keep them in a private ' +
        'Tehfīz folder in <strong>your own Google Drive</strong>, so they appear on any device you sign in on. ' +
        'Tehfīz’s server still never receives them, and the folder can’t see anything else in your Drive.</p>' +
        '<div class="tns-row"><button type="button" class="tsy-btn tns-pri" data-tns="on">Turn on name sync</button>' +
        '<span class="tns-status" id="tnsStatus"></span></div>' +
      '</div>';
  } else {
    box.innerHTML =
      '<div class="tns-card tns-on">' +
        '<div class="tns-h">Names sync with your Google Drive</div>' +
        '<p class="tns-p">Kept in a private Tehfīz folder in your Drive and on this device. Tehfīz’s server never receives them.</p>' +
        '<div class="tns-row"><button type="button" class="tsy-btn" data-tns="now">↻ Sync now</button>' +
        '<span class="tns-status" id="tnsStatus"></span>' +
        '<span class="tns-sp"></span>' +
        '<button type="button" class="tsy-chip-btn" data-tns="off">Turn off</button></div>' +
        '<div class="tns-off" id="tnsOff" hidden>' +
          '<p class="tns-p">Turn off sync on this device? Names stay here either way.</p>' +
          '<div class="tns-row"><button type="button" class="tsy-btn" data-tns="off-keep">Turn off, keep the Drive copy</button>' +
          '<button type="button" class="tsy-btn tns-danger" data-tns="off-delete">Turn off and delete the Drive copy</button>' +
          '<button type="button" class="tsy-chip-btn" data-tns="off-cancel">Cancel</button></div>' +
        '</div>' +
      '</div>';
  }
  paintStatus();
  loadGis();      // so a later tap can open Google's popup straight away
}

document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-tns]');
  if (!b) return;
  const act = b.dataset.tns;
  if (act === 'on') {
    requestToken(true, () => { put(K.on, '1'); put(K.snap, null); noteChanges(); render(); run(); });
  } else if (act === 'now') {
    if (token()) run(); else requestToken(false, run);
  } else if (act === 'off') {
    const o = $('tnsOff'); if (o) o.hidden = false;
  } else if (act === 'off-cancel') {
    const o = $('tnsOff'); if (o) o.hidden = true;
  } else if (act === 'off-keep') {
    put(K.on, null); setStatus('', false); render(); toast('Name sync is off on this device');
  } else if (act === 'off-delete') {
    const finish = async () => {
      try { await removeFromDrive(); } catch (err) { setStatus('Could not delete the Drive copy: ' + err.message, true); return; }
      const t = token();
      if (t && google.accounts.oauth2.revoke) google.accounts.oauth2.revoke(t, () => {});
      put(K.tok, null); put(K.on, null); put(K.last, null);
      setStatus('', false); render(); toast('Name sync is off, and the Drive copy is deleted');
    };
    if (token()) finish(); else requestToken(false, finish);
  }
});

window.addEventListener('tehfiz:names-changed', () => {
  if (!isOn()) return;
  if (noteChanges()) { if (token()) schedulePush(); else setStatus('Changes waiting — tap Sync now.', false); }
});

/* Fill the box whenever the Students panel re-renders it. */
function watch() {
  const root = document.getElementById('tsyRoot') || document.body;
  new MutationObserver(() => { const box = $('tnsBox'); if (box && !box.childElementCount) render(); })
    .observe(root, { childList: true, subtree: true });
}

function boot() {
  watch();
  if (isOn()) {
    noteChanges();
    if (token()) run();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

/* Styles: tokens only, so themes and dark mode follow. */
const css = document.createElement('style');
css.textContent =
  '.tns-card{border:1px solid var(--border2);border-radius:8px;padding:10px 12px;margin:8px 0;background:var(--parchment2);}' +
  '.tns-card.tns-on{background:transparent;}' +
  '.tns-h{font-weight:600;font-size:14px;color:var(--ink);}' +
  '.tns-p{margin:4px 0 8px;font-size:13px;line-height:1.5;color:var(--ink2);}' +
  '.tns-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}' +
  '.tns-sp{flex:1;}' +
  '.tns-status{font-size:12px;color:var(--ink3);}' +
  '.tns-status.tns-err{color:var(--red);}' +
  '.tns-pri{background:var(--gold);color:var(--on-gold);border-color:var(--gold);}' +
  '.tns-danger{color:var(--red);border-color:var(--red);}' +
  '.tns-off{margin-top:8px;padding-top:8px;border-top:1px solid var(--border);}';
document.head.appendChild(css);

window.TehfizNameSync = { run, isOn, render, version: TEHFIZ_NAMESYNC_VERSION };
})();
