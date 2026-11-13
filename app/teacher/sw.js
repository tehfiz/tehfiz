/* sw.js — Tehfiz teacher app service worker — w2
   Served from /app/teacher/sw.js, so its scope is /app/teacher/ and nothing
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

   Bump SW_VERSION when this file's LOGIC changes. Bump CACHE_VERSION only to
   throw the stored copies away: old caches whose name starts with this app's
   prefix are deleted on activate, and until the next online load there is
   then nothing to open offline. Caches the app itself made (the Quran data)
   have other names and are never touched.

   w2: one copy per file. Every release loads its files under a new ?v=, and
   each was stored beside the old ones for good. After a new copy is stored,
   older copies of the same path are now removed (see prune). The cache keeps
   its w1 name so that this update does not empty it. */
const SW_VERSION = 'w2';
const CACHE_VERSION = 'w1';
const PREFIX = 'tehfiz-sw-teacher-';
const CACHE = PREFIX + CACHE_VERSION;
const FONTS = 'tehfiz-sw-fonts';
const START = '/app/teacher/';

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
    if (res && res.ok && res.type === 'basic') {
      cache.put(req, res.clone()).then(() => prune(cache, req)).catch(() => {});
    } else if (res && res.status === 304) {
      // A reload revalidates: nothing new to store, but the copy held is current.
      prune(cache, req).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // An app link opened offline (?review=…, a deep link): serve the app itself.
    if (req.mode === 'navigate') {
      const start = await cache.match(START, { ignoreSearch: true });
      if (start) return start;
    }
    throw err;
  }
}

/* Same path, different query: an older release's copy (file.js?v=s21 once
   ?v=s22 is stored), or the page under another link's parameters. Runs only
   after the new copy is in, and only if this exact copy is held, so a path
   never loses its last copy. */
async function prune(cache, req) {
  if (!(await cache.match(req))) return;
  const url = new URL(req.url);
  const keys = await cache.keys(req, { ignoreSearch: true });
  await Promise.all(keys
    .filter((k) => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; })
    .map((k) => cache.delete(k)));
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
