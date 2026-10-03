/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-pwa.js — TehfizPWA — p1
   Loaded by both apps from /app/shared/tehfiz-pwa.js?v=p1.

   Makes each app installable on a phone, tablet or computer:
     · registers the app's own service worker (/app/<app>/sw.js), which keeps
       the app opening offline — see the comment at the top of sw.js
     · holds the browser's install offer (beforeinstallprompt) so the header
       menu can show "Install the app" only when installing is possible
     · on iPhone and iPad, where Safari has no install prompt, shows how to do
       it by hand (Share → Add to Home Screen)

   Interface: TehfizPWA.register(swUrl, scope) once at boot;
              TehfizPWA.canOffer() / install() for the menu item.
   DOM in #tpwaRoot, CSS prefixed .tpwa-. Nothing is stored.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_PWA_VERSION = 'p1';

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

window.TehfizPWA = { register, canOffer, install, isStandalone: standalone, version: TEHFIZ_PWA_VERSION };
})();
