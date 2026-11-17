/* ═══════════════════════════════════════════════════════════════════════════
   lesson-store.js — TehfizStore — ls1 (17 Nov 2026)

   Where the lessons on this device are kept (A3, second half; stage 8,
   decided 17 Nov).

   Before: every lesson in one browser item (localStorage 'qrt4_sessions'),
   capped by the browser at about 5 MB and rewritten whole after every mark.

   Now two places:
   · QUICK (localStorage 'qrt4_sessions', as before): the lesson open in the
     app, and any lesson changed since it was last filed. Writes are
     synchronous, so a mark is saved before anything else happens, and small,
     so each mark rewrites one lesson, not all of them.
   · ARCHIVE (IndexedDB 'tehfiz', store 'lessons', one record per lesson):
     everything else. When the browser is idle, lessons in QUICK that are not
     the open lesson are filed here; only once IndexedDB confirms the write
     are they taken out of QUICK. That same step moves the lessons of a device
     upgrading from before this (all of them are in QUICK at first), so the
     old copy goes as soon as each lesson is safely filed.
   · The order of the lessons (newest first, as the Sessions list shows them)
     is kept in localStorage 'qrt4_order'; deletions not yet confirmed by
     IndexedDB in 'qrt4_gone', so a deleted lesson cannot come back.

   The app sees one list, as before: all() returns every lesson (fresh
   objects, safe to change) and put(list) saves a whole list. Only the
   lessons that changed are written. Archived lessons are read from IndexedDB
   once and kept in memory, as their text.

   Opening the app: QUICK is there at once, so marking needs no wait; the
   archive loads in the background (ready). Until then a lesson the list does
   not include is never taken for deleted.

   Two tabs: after a write, the other tab is told (BroadcastChannel) and
   reloads. A tab only deletes lessons it has seen, and keeps the other tab's
   new lessons in the order it writes.

   No IndexedDB (some private modes): everything stays in QUICK, as before.
   The browser is asked to keep this site's storage (storage.persist), so it
   is not cleared when the disk runs low.

   Hooks (TehfizStore.use): openId() → the id of the lesson open in the app.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const VERSION = 'ls1';
const K_QUICK = 'qrt4_sessions', K_ORDER = 'qrt4_order', K_GONE = 'qrt4_gone';
const DB_NAME = 'tehfiz', DB_STORE = 'lessons';

const hooks = { openId: () => null, onReady: null };
let mode = 'idb';                 // 'idb' | 'ls' (no IndexedDB)
let db = null, loaded = false;
const arch = new Map();           // id → JSON text, archived lessons
let quick = new Map();            // id → JSON text, lessons in QUICK
let order = [];                   // ids, newest first
let gone = new Set();             // deletions IndexedDB has not confirmed
const seen = new Set();           // ids this tab has seen (only these can be deleted)
let full = false;                 // QUICK refused a write
const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('tehfiz-store') : null;

const K = (id) => String(id);
function readJ(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }

/* ── QUICK ──────────────────────────────────────────────────────────────── */
function loadQuick() {
  quick = new Map();
  let list = [];
  try { list = JSON.parse(localStorage.getItem(K_QUICK) || '[]'); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  list.forEach((s) => { if (s && s.id != null) quick.set(K(s.id), JSON.stringify(s)); });
  const o = readJ(K_ORDER, null);
  // First run: the order is QUICK's own (every lesson is still there).
  order = Array.isArray(o) ? o.map(K) : list.filter((s) => s && s.id != null).map((s) => K(s.id));
  gone = new Set((readJ(K_GONE, []) || []).map(K));
  quick.forEach((_, id) => { if (!order.includes(id)) order.unshift(id); });
  order.forEach((id) => seen.add(id));
}
// QUICK as one array, in list order. true = written.
function writeQuick() {
  const items = order.filter((id) => quick.has(id)).map((id) => quick.get(id));
  quick.forEach((t, id) => { if (!order.includes(id)) items.push(t); });
  try {
    localStorage.setItem(K_QUICK, '[' + items.join(',') + ']');
    localStorage.setItem(K_ORDER, JSON.stringify(order));
    localStorage.setItem(K_GONE, JSON.stringify([...gone]));
    full = false;
    return true;
  } catch (e) { full = true; return false; }
}

/* ── IndexedDB ─────────────────────────────────────────────────────────── */
function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
    let r;
    try { r = indexedDB.open(DB_NAME, 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('open failed'));
    r.onblocked = () => rej(new Error('blocked'));
  });
}
function readArchive() {
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readonly'), req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}
async function loadArchive() {
  const rows = await readArchive();
  arch.clear();
  rows.forEach((r) => { if (r && r.id != null && !gone.has(K(r.id))) arch.set(K(r.id), r.text); });
  arch.forEach((_, id) => { if (!order.includes(id) && !quick.has(id)) order.push(id); seen.add(id); });
}

/* ── the list the app sees ─────────────────────────────────────────────── */
function textOf(id) { return quick.has(id) ? quick.get(id) : arch.get(id); }
function all() {
  const out = [];
  order.forEach((id) => {
    if (gone.has(id)) return;
    const t = textOf(id); if (t == null) return;
    seen.add(id);
    try { out.push(JSON.parse(t)); } catch (_) {}
  });
  return out;
}
function put(list) {
  if (!Array.isArray(list)) return false;
  // Another tab may have written since: keep what it added.
  syncFromOther(false);
  const next = [], nextSet = new Set();
  list.forEach((s) => {
    if (!s || s.id == null) return;
    const id = K(s.id); if (nextSet.has(id)) return;
    nextSet.add(id); next.push(id); seen.add(id);
    const t = JSON.stringify(s);
    if (textOf(id) !== t) quick.set(id, t);       // changed or new: QUICK, until filed
    gone.delete(id);
  });
  // Missing from the list: deleted, but only lessons this tab has seen, and
  // never an archived lesson before the archive has loaded.
  order.forEach((id) => {
    if (nextSet.has(id)) return;
    const known = seen.has(id) && (loaded || quick.has(id) || mode === 'ls');
    if (!known) { next.push(id); return; }
    quick.delete(id);
    if (arch.has(id)) { arch.delete(id); gone.add(id); }
  });
  order = next;
  const ok = writeQuick();
  if (ok) { tell(); fileSoon(); }
  return ok;
}

/* One lesson, put first in the list: what saving a mark does. Writes only
   QUICK (the open lesson and anything not yet filed), never compares the
   other lessons, so a mark costs the same with 10 lessons or 2,000. */
function putOne(s) {
  if (!s || s.id == null) return false;
  syncFromOther(false);
  const id = K(s.id);
  seen.add(id); gone.delete(id);
  const t = JSON.stringify(s);
  if (textOf(id) !== t) quick.set(id, t);
  if (order[0] !== id) { order = order.filter((x) => x !== id); order.unshift(id); }
  const ok = writeQuick();
  if (ok) { tell(); fileSoon(); }
  return ok;
}

/* ── filing: QUICK → IndexedDB, when idle ──────────────────────────────── */
let fileTimer = null, filing = false;
function fileSoon(ms) {
  if (mode !== 'idb' || !loaded || fileTimer) return;
  const run = () => { fileTimer = null; file(); };
  fileTimer = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: ms || 4000 })
    : setTimeout(run, ms || 1500);
}
async function file() {
  if (filing || mode !== 'idb' || !db) return;
  const open = hooks.openId() == null ? null : K(hooks.openId());
  const batch = [];
  quick.forEach((t, id) => { if (id !== open) batch.push([id, t]); });
  const dels = [...gone];
  if (!batch.length && !dels.length) return;
  filing = true;
  try {
    await new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readwrite'), os = tx.objectStore(DB_STORE);
      batch.forEach(([id, t]) => os.put({ id, text: t, at: Date.now() }));
      dels.forEach((id) => os.delete(id));
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('aborted'));
    });
    // Filed. Out of QUICK — unless it changed while we were writing.
    batch.forEach(([id, t]) => { arch.set(id, t); if (quick.get(id) === t) quick.delete(id); });
    dels.forEach((id) => gone.delete(id));
    writeQuick(); tell();
  } catch (e) {
    // Nothing lost: QUICK still has them. Try again later.
    setTimeout(() => fileSoon(), 30000);
  } finally { filing = false; }
}

/* ── other tabs ─────────────────────────────────────────────────────────── */
function tell() { if (bc) try { bc.postMessage({ t: 'changed' }); } catch (_) {} }
// Pick up what another tab wrote: QUICK and the order from localStorage.
// The archive is re-read when told, since another tab may have filed lessons.
function syncFromOther(andArchive) {
  const storedOrder = readJ(K_ORDER, null);
  if (!Array.isArray(storedOrder)) return;
  const mine = new Set(order);
  const theirs = storedOrder.map(K).filter((id) => !mine.has(id) && !seen.has(id));
  let q = [];
  try { q = JSON.parse(localStorage.getItem(K_QUICK) || '[]'); } catch { q = []; }
  (Array.isArray(q) ? q : []).forEach((s) => {
    if (!s || s.id == null) return;
    const id = K(s.id);
    if (!seen.has(id) || !quick.has(id)) quick.set(id, JSON.stringify(s));
  });
  theirs.forEach((id) => order.unshift(id));
  if (andArchive && db) loadArchive().catch(() => {});
}
function onOther() {
  const keepOpen = hooks.openId() == null ? null : K(hooks.openId());
  const openText = keepOpen && quick.get(keepOpen);
  loadQuick();
  if (openText && !quick.has(keepOpen)) quick.set(keepOpen, openText);
  const done = db ? loadArchive() : Promise.resolve();
  done.then(() => { if (typeof hooks.onChange === 'function') hooks.onChange(); }).catch(() => {});
}
if (bc) bc.onmessage = (e) => { if (e && e.data && e.data.t === 'changed') onOther(); };

/* ── start ──────────────────────────────────────────────────────────────── */
loadQuick();
const ready = (async () => {
  try {
    db = await openDb();
    await loadArchive();
    loaded = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
    fileSoon(2500);
  } catch (e) {
    mode = 'ls'; loaded = true;
  }
  if (typeof hooks.onReady === 'function') try { hooks.onReady(); } catch (_) {}
  return mode;
})();
// Before the tab goes, file what can be filed (the open lesson stays in QUICK).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') file(); });

window.TehfizStore = {
  all, put, putOne, ready,
  // An onReady given after the archive has loaded still runs (once, soon).
  use(h) { Object.assign(hooks, h || {}); if (loaded && h && typeof h.onReady === 'function') setTimeout(() => { try { h.onReady(); } catch (_) {} }, 0); },
  isReady: () => loaded,
  mode: () => mode,
  full: () => full,
  // For checks and the Storage settings: how many lessons sit where.
  counts: () => ({ quick: quick.size, archive: arch.size, gone: gone.size, total: order.filter((id) => !gone.has(id) && textOf(id) != null).length }),
  file: () => file(),
  version: VERSION,
};
})();
