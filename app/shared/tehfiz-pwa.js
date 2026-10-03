/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-pwa.js — TehfizPWA — p2
   Loaded by both apps from /app/shared/tehfiz-pwa.js?v=p2.

   Makes each app installable on a phone, tablet or computer:
     · registers the app's own service worker (/app/<app>/sw.js), which keeps
       the app opening offline — see the comment at the top of sw.js
     · holds the browser's install offer (beforeinstallprompt) so the header
       menu can show "Install the app" only when installing is possible
     · on iPhone and iPad, where Safari has no install prompt, shows how to do
       it by hand (Share → Add to Home Screen)

     · notices when a new version has been deployed while the app is open
       and offers a Reload (see UPDATES below)

   Interface: TehfizPWA.register(swUrl, scope) once at boot;
              TehfizPWA.canOffer() / install() for the menu item.
   DOM in #tpwaRoot, CSS prefixed .tpwa-. Nothing is stored.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_PWA_VERSION = 'p2';

let deferred = null, installed = false;

function standalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function ios() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function refreshMenu() { if (window.TehfizHeader) window.TehfizHeader.refreshMenu(); }

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();          // offered from the menu instead of a browser banner
  deferred = e;
  refreshMenu();
});
window.addEventListener('appinstalled', () => {
  deferred = null; installed = true;
  if (typeof window.showToast === 'function') window.showToast('Installed — open Tehfīz from your home screen');
  refreshMenu();
});

function canOffer() {
  if (installed || standalone()) return false;
  return !!deferred || ios();
}

async function install() {
  if (deferred) {
    const d = deferred;
    deferred = null;
    try { d.prompt(); await d.userChoice; } catch {}
    refreshMenu();
    return;
  }
  if (ios()) showIosHelp();
}

/* Service workers need a secure origin; localhost counts, file:// does not. */
function register(swUrl, scope) {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  const go = () => navigator.serviceWorker.register(swUrl, { scope }).catch((e) => console.warn('TehfizPWA: service worker', e));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
}

function showIosHelp() {
  let root = document.getElementById('tpwaRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'tpwaRoot'; document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('[data-tpwa="close"]')) root.innerHTML = ''; });
  }
  if (!document.getElementById('tpwaCss')) {
    const st = document.createElement('style'); st.id = 'tpwaCss';
    st.textContent =
      '.tpwa-wrap{position:fixed;inset:0;z-index:1300;display:flex;align-items:flex-end;justify-content:center;font-family:var(--ui-font);}' +
      '.tpwa-scrim{position:absolute;inset:0;background:rgba(23,25,28,.45);}' +
      '.tpwa-card{position:relative;width:100%;max-width:520px;background:var(--parchment);color:var(--ink);border-radius:16px 16px 0 0;' +
        'padding:20px 20px max(20px, env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;box-shadow:0 -6px 24px rgba(23,25,28,.22);}' +
      '.tpwa-card h2{margin:0;font-size:18px;}' +
      '.tpwa-card ol{margin:0;padding-left:20px;font-size:15px;line-height:1.6;}' +
      '.tpwa-card button{height:48px;border:none;border-radius:10px;background:var(--gold);color:var(--on-gold);font:600 15px var(--ui-font);cursor:pointer;}';
    document.head.appendChild(st);
  }
  const share = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-label="Share" style="vertical-align:-3px;"><path d="M12 3v12M8 7l4-4 4 4"/>' +
    '<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  root.innerHTML = '<div class="tpwa-wrap"><div class="tpwa-scrim" data-tpwa="close"></div>' +
    '<div class="tpwa-card" role="dialog" aria-modal="true" aria-labelledby="tpwaT"><h2 id="tpwaT">Install on iPhone or iPad</h2>' +
    '<ol><li>Open this page in <b>Safari</b>.</li>' +
    '<li>Tap Share ' + share + ' at the bottom of the screen (top right on an iPad).</li>' +
    '<li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>' +
    '<button type="button" data-tpwa="close">Got it</button></div></div>';
}

/* ── UPDATES ───────────────────────────────────────────────────────────────
   Opening the app always loads the current deploy (the service worker is
   network-first). What it cannot reach is an app that is never re-opened: a
   tab left open for days, or an installed app that the phone resumes rather
   than restarts. So the page asks the server about itself — a HEAD request
   for its own address, a few hundred bytes — when it is first loaded, when it
   comes back to the foreground, and every 30 minutes while it is in front.
   If the file's fingerprint (ETag, or Last-Modified + length) differs from
   the one it was loaded with, a banner offers a Reload. It never reloads by
   itself: a teacher may be mid-session.
   Every change to a shared file also changes the app pages' ?v= tags, so
   watching the page covers the shared files and modules too. */
let _fp = null, _lastCheck = 0, _offered = false;
function fingerprint(r) {
  const et = r.headers.get('etag');
  if (et) return et.replace(/^W\//, '');
  const lm = r.headers.get('last-modified'), len = r.headers.get('content-length');
  return lm || len ? (lm || '') + '|' + (len || '') : null;
}
async function checkUpdate() {
  if (_offered || !navigator.onLine) return;
  _lastCheck = Date.now();
  try {
    const r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return;
    const fp = fingerprint(r);
    if (!fp) return;
    if (_fp === null) { _fp = fp; return; }
    if (fp !== _fp) offerUpdate();
  } catch { /* offline or blocked — try again later */ }
}
function offerUpdate() {
  _offered = true;
  if (!document.getElementById('tpwaUpCss')) {
    const st = document.createElement('style'); st.id = 'tpwaUpCss';
    st.textContent =
      '.tpwa-up{position:fixed;left:12px;right:12px;margin:0 auto;width:max-content;max-width:calc(100vw - 24px);' +
        'top:calc(env(safe-area-inset-top) + 68px);z-index:1250;' +
        'display:flex;align-items:center;gap:10px;box-sizing:border-box;padding:8px 8px 8px 16px;' +
        'border-radius:12px;background:var(--chrome,#17191c);color:var(--on-ink,#e8e9ea);font:500 14px var(--ui-font);' +
        'box-shadow:0 6px 24px rgba(23,25,28,.28);}' +
      '.tpwa-up span{flex:1;min-width:0;}' +
      '.tpwa-up button{flex:none;height:36px;padding:0 14px;border:none;border-radius:8px;cursor:pointer;font:600 14px var(--ui-font);}' +
      '.tpwa-up .tpwa-go{background:var(--on-ink,#e8e9ea);color:var(--chrome,#17191c);}' +
      '.tpwa-up .tpwa-later{background:transparent;color:var(--on-ink,#e8e9ea);padding:0 8px;}';
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'tpwa-up'; el.setAttribute('role', 'status');
  el.innerHTML = '<span>Tehfīz has been updated.</span>' +
    '<button type="button" class="tpwa-go">Reload</button>' +
    '<button type="button" class="tpwa-later" aria-label="Not now">Later</button>';
  el.querySelector('.tpwa-go').onclick = () => location.reload();
  /* Later hides it until the app next comes back to the foreground. */
  el.querySelector('.tpwa-later').onclick = () => { el.remove(); _snoozed = true; };
  document.body.appendChild(el);
}
let _snoozed = false;
function watchUpdates() {
  if (location.protocol === 'file:') return;
  setTimeout(checkUpdate, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (_snoozed) { _snoozed = false; _offered = false; offerUpdate(); return; }
    if (Date.now() - _lastCheck > 5 * 60 * 1000) checkUpdate();
  });
  setInterval(() => { if (document.visibilityState === 'visible') checkUpdate(); }, 30 * 60 * 1000);
}
watchUpdates();

window.TehfizPWA = { register, canOffer, install, isStandalone: standalone, checkUpdate, version: TEHFIZ_PWA_VERSION };
})();
