/* sw.js — Tehfiz student viewer app service worker — w1
   Served from /app/student/sw.js, so its scope is /app/student/ and nothing
   else. Registered by TehfizPWA (/app/shared/tehfiz-pwa.js).

   What it is for: the app opens with no signal — in a masjid basement, on a
   train — and installs to the home screen. What it is NOT for: the API, which
   is never cached here (a stale /api response would be wrong, not just old),
   and the Quran page data and QCF fonts, which the app caches itself.

   Strategy
   · Same-origin GETs under /app/ (the page, the shared files, the modules,
     the icons): network first, cache as fallback. Online, every load is the
     current deploy — there is no "refresh twice to update". Offline, the last
     good copy.
   · Google Fonts (the UI faces): cache first — the files are immutable.
   · Everything else, including /api/*: untouched.

   Bump the version below when this file's LOGIC changes; old caches whose
   name starts with this app's prefix are deleted on activate. Caches the app
   itself made (the Quran data) have other names and are never touched. */
const SW_VERSION = 'w1';
const PREFIX = 'tehfiz-sw-student-';
const CACHE = PREFIX + SW_VERSION;
const FONTS = 'tehfiz-sw-fonts';
const START = '/app/student/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(START)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/app/')) return;
  e.respondWith(networkFirst(req));
});

/* A weak signal is worse than none: fetch neither fails nor arrives. For the
   page itself, give the network four seconds when there is a copy to fall
   back to, then use the copy. */
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const have = req.mode === 'navigate' && await cache.match(req, { ignoreSearch: true });
    const res = await (have ? withTimeout(fetch(req), 4000) : fetch(req));
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // An app link opened offline (?review=…, a deep link): serve the app itself.
    if (req.mode === 'navigate') {
      const start = await cache.match(START);
      if (start) return start;
    }
    throw err;
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
