/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-keys.js — TehfizKeys — k2
   Loaded by both apps, from /app/shared/tehfiz-keys.js?v=k2.

   The keyboard shortcuts that work anywhere on the mushaf: one list of
   actions, each with its default key, registered once by the app —

     TehfizKeys.register([{ id, label, group, key, alias?, inForm?, when?, run }],
                         { blocked, formKeys, fixed })
       key      'f', '/', '+', 'Shift+T' … (letters lower case, Shift+ upper)
       alias    another key that does the same while the default is in use
                ('=' for '+', so the key does not need Shift)
       inForm   still works while the mistake form is open (auto-scroll, zoom,
                spots); the rest stand aside then
       when     () → bool: only then (the spot keys, while spot testing)
       blocked  () → bool: the app's "not now" — its mistake form is open
       formKeys keys the form owns (1–7, Q–P, `): an inForm action cannot take them
       fixed    [{label, keys, sub}] rows shown in settings, not changeable

   — and listens for. Nothing fires while typing in a box, with Ctrl / ⌘ / Alt
   held, or while another window is open over the page. The keys in each
   app's own handler (arrows, Page Up/Down, Enter, Esc, ?, the mistake form's)
   are not in this list.

   k2: keys can be changed or removed, in Settings → Keyboard
   (TehfizKeys.renderSettings). Choices are kept on this device under
   tehfiz_keys: {id: key}, '' meaning "no key". A key that is taken can be
   swapped; Esc, Enter, Space, Tab, the arrows, Page Up/Down, Home, End,
   Backspace, Delete and ? keep their jobs and cannot be given.

     TehfizKeys.list()               → [{id, label, group, key, def}]
     TehfizKeys.set(id, key|''|null) '' removes, null puts the default back
     TehfizKeys.reset()              every key back
     TehfizKeys.mountHelp(tbody)     help-table rows, kept up to date
     TehfizKeys.renderSettings(el)   the settings list, into el

   Self-contained: namespace TehfizKeys, CSS .tzk-* (injected with the
   settings), no other DOM of its own.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_KEYS_VERSION = 'k2';
const K_STORE = 'tehfiz_keys';
const RESERVED = new Set(['Escape', 'Enter', ' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown',
  'Home', 'End', 'Backspace', 'Delete', '?']);
let actions = [], opts = { formKeys: [], fixed: [] }, helpBodies = [], panes = [];
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function readCustom() { try { return JSON.parse(localStorage.getItem(K_STORE) || '{}') || {}; } catch (e) { return {}; } }
function writeCustom(c) { try { localStorage.setItem(K_STORE, JSON.stringify(c)); } catch (e) {} }
function keyOf(a, c) { c = c || readCustom(); return Object.prototype.hasOwnProperty.call(c, a.id) ? c[a.id] : a.key; }
/* A key press as the list writes it: 'f', '/', '+', 'Shift+T', 'F2'. */
function nameOf(e) {
  const k = e.key;
  if (!k || k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta' || k === 'CapsLock' || k === 'Dead') return '';
  if (k.length === 1) {
    if (/^[a-z]$/i.test(k)) return e.shiftKey ? 'Shift+' + k.toUpperCase() : k.toLowerCase();
    return k === ' ' ? ' ' : k;                    // '/', '+', '[' … already carry their Shift
  }
  return (e.shiftKey && !RESERVED.has(k) ? 'Shift+' : '') + k;
}
function pretty(k) {
  if (k === ' ') return 'Space';
  return String(k || '').replace(/^Shift\+/, 'Shift + ').replace(/^-$/, '−');
}
function reservedName(k) { return RESERVED.has(k) || RESERVED.has(String(k).replace(/^Shift\+/, '')); }

function register(list, o) {
  const have = new Set(actions.map((a) => a.id));
  actions = actions.concat((list || []).filter((a) => a && a.id && !have.has(a.id)));
  Object.assign(opts, o || {});
  repaint();
}
function list() { const c = readCustom(); return actions.map((a) => ({ id: a.id, label: a.label, sub: a.sub || '', group: a.group || '', key: keyOf(a, c), def: a.key })); }
/* Who has this key now (other than `except`). */
function holder(key, except) { const c = readCustom(); return actions.find((a) => a.id !== except && keyOf(a, c) === key) || null; }
function set(id, key) {
  const c = readCustom();
  if (key === null || key === undefined) delete c[id];
  else c[id] = String(key);
  // A custom value equal to the default is no custom value.
  const a = actions.find((x) => x.id === id);
  if (a && c[id] === a.key) delete c[id];
  writeCustom(c); repaint();
}
function reset() { writeCustom({}); repaint(); }

/* ── listening ─────────────────────────────────────────────────────────── */
function editable(t) {
  const tag = t && t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(t && t.isContentEditable);
}
function covered() {
  const open = document.querySelectorAll('.modal-bg.open, .sessions-overlay.open, #tsyOverlay.tsy-on, .tcl-overlay.tcl-on, [aria-modal="true"]');
  for (const el of open) { if (el.getClientRects().length && !el.closest('[hidden]')) return true; }
  return false;
}
let capture = null;                               // settings: waiting for a key
window.addEventListener('keydown', (e) => {
  if (capture) {                                  // the settings list takes the next key
    e.preventDefault(); e.stopImmediatePropagation();
    capture(e); return;
  }
}, true);
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (editable(e.target) || editable(document.activeElement)) return;
  const name = nameOf(e); if (!name) return;
  const c = readCustom();
  const a = actions.find((x) => {
    const k = keyOf(x, c);
    if (k && k === name) return true;
    // the alias, only while the default key is in use
    return !!(x.alias && k === x.key && x.alias === name);
  });
  if (!a) return;
  if (e.repeat && !a.repeat) return;
  if (covered()) return;
  if (!a.inForm && opts.blocked && opts.blocked()) return;
  if (a.when && !a.when()) return;
  e.preventDefault();
  try { a.run(e); } catch (err) { console.error('TehfizKeys', a.id, err); }
});

/* ── help-table rows ───────────────────────────────────────────────────── */
function helpHtml() {
  let last = null, out = '';
  list().forEach((a) => {
    if (!a.key) return;
    if (a.group !== last) {
      last = a.group;
      if (a.group) out += '<tr><td colspan="2" style="padding:10px 8px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);">' + esc(a.group) + '</td></tr>';
    }
    out += '<tr style="border-bottom:.5px solid var(--border);"><td style="padding:6px 8px;font-family:\'IBM Plex Mono\',monospace;background:var(--parchment2);border-radius:3px;color:var(--ink2);white-space:nowrap;">' +
      esc(pretty(a.key)) + '</td><td style="padding:6px 8px;color:var(--ink);">' + esc(a.label) + '</td></tr>';
  });
  return out;
}
function mountHelp(tbody) { if (tbody && !helpBodies.includes(tbody)) { helpBodies.push(tbody); tbody.innerHTML = helpHtml(); } }

/* ── settings: change, remove, swap ────────────────────────────────────── */
let ed = { id: null, msg: null };                 // the row being changed, and what to say about it
function css() {
  if (document.getElementById('tzkCss')) return;
  const el = document.createElement('style'); el.id = 'tzkCss';
  el.textContent =
    '.tzk{display:flex;flex-direction:column;gap:10px;font-family:var(--ui-font);}' +
    '.tzk-sub{font-size:12.5px;color:var(--ink3);line-height:1.5;}' +
    '.tzk-grp{font:600 11px var(--ui-font);letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin:4px 0 -4px;}' +
    '.tzk-list{border:1px solid var(--border2);border-radius:10px;overflow:hidden;background:var(--surface,#fff);}' +
    '.tzk-row{display:flex;align-items:center;gap:8px;padding:7px 10px;min-height:44px;box-sizing:border-box;}' +
    '.tzk-row+.tzk-row,.tzk-warn{border-top:1px solid var(--border);}' +
    '.tzk-row.on{background:var(--gold-pale,#f3ead4);}' +
    '.tzk-l{flex:1;min-width:0;font-size:13.5px;color:var(--ink);line-height:1.35;}' +
    '.tzk-l small{display:block;font-size:12px;color:var(--ink3);}' +
    '.tzk-key{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:28px;padding:0 8px;box-sizing:border-box;' +
      'border:1px solid var(--border2);border-bottom-width:2px;border-radius:6px;background:var(--parchment);color:var(--ink);' +
      'font:600 12.5px "IBM Plex Mono",monospace;white-space:nowrap;}' +
    '.tzk-key.mod{border-color:var(--gold);color:var(--gold);}' +
    '.tzk-key.none{border-style:dashed;color:var(--ink3);font:500 12px var(--ui-font);}' +
    '.tzk-key.wait{border-style:dashed;color:var(--ink2);font:500 12.5px var(--ui-font);}' +
    '.tzk-key.fixed{opacity:.65;}' +
    '.tzk-b{height:28px;padding:0 9px;border:1px solid var(--border2);border-radius:6px;background:var(--parchment);color:var(--ink);' +
      'font:500 12.5px var(--ui-font);cursor:pointer;white-space:nowrap;}' +
    '.tzk-b.pri{background:var(--ink);color:var(--parchment);border-color:var(--ink);}' +
    '.tzk-x{width:28px;padding:0;color:var(--ink3);}' +
    '.tzk-lnk{border:0;background:none;padding:0 2px;color:var(--ink2);text-decoration:underline;font:500 12.5px var(--ui-font);cursor:pointer;}' +
    '.tzk-warn{display:flex;flex-direction:column;gap:8px;padding:9px 10px;font-size:13px;line-height:1.45;color:var(--ink2);background:var(--parchment2);}' +
    '.tzk-warn .tzk-r{display:flex;gap:6px;flex-wrap:wrap;}' +
    '.tzk-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--ink3);}' +
    '.tzk-foot .sp{flex:1;}';
  document.head.appendChild(el);
}
function rowHtml(a) {
  const on = ed.id === a.id, mod = a.key !== a.def;
  let keyBit;
  if (on && !ed.msg) keyBit = '<span class="tzk-key wait">Press a key…</span><button type="button" class="tzk-b" data-tzk="cancel">Cancel</button>';
  else {
    keyBit = (a.key ? '<span class="tzk-key' + (mod ? ' mod' : '') + '">' + esc(pretty(a.key)) + '</span>' : '<span class="tzk-key none">No key</span>') +
      (on ? '' : '<button type="button" class="tzk-b" data-tzk="change" data-id="' + a.id + '">Change</button>' +
        (a.key ? '<button type="button" class="tzk-b tzk-x" data-tzk="remove" data-id="' + a.id + '" title="Remove this key" aria-label="Remove the key for ' + esc(a.label) + '">✕</button>' : '') +
        (mod ? '<button type="button" class="tzk-lnk" data-tzk="undo" data-id="' + a.id + '" title="Back to ' + esc(pretty(a.def)) + '">Undo</button>' : ''));
  }
  let warn = '';
  if (on && ed.msg) {
    const m = ed.msg;
    warn = '<div class="tzk-warn" role="alert"><span>' + m.text + '</span><div class="tzk-r">' +
      (m.swap ? '<button type="button" class="tzk-b pri" data-tzk="swap">Swap them</button>' +
                '<button type="button" class="tzk-b" data-tzk="take">Take it' + (m.swap ? ' (' + esc(m.swap.label) + ' gets no key)' : '') + '</button>' : '') +
      '<button type="button" class="tzk-b" data-tzk="again">Pick another key</button>' +
      '<button type="button" class="tzk-b" data-tzk="cancel">Cancel</button></div></div>';
  }
  return '<div class="tzk-row' + (on ? ' on' : '') + '"><span class="tzk-l">' + esc(a.label) + (a.sub ? '<small>' + esc(a.sub) + '</small>' : '') + '</span>' + keyBit + '</div>' + warn;
}
function settingsHtml() {
  let last = null, out = '<div class="tzk">' +
    '<div class="tzk-sub">Tap Change, then press the key you want. ✕ removes a key, so it is free for something else. Saved on this device.</div>';
  const rows = list(); let open = false;
  rows.forEach((a) => {
    if (a.group !== last) {
      if (open) out += '</div>';
      last = a.group; out += (a.group ? '<div class="tzk-grp">' + esc(a.group) + '</div>' : '') + '<div class="tzk-list">'; open = true;
    }
    out += rowHtml(a);
  });
  if (open) out += '</div>';
  if (opts.fixed && opts.fixed.length) {
    out += '<div class="tzk-grp">While marking a mistake</div><div class="tzk-list">' +
      opts.fixed.map((f) => '<div class="tzk-row"><span class="tzk-l">' + esc(f.label) + (f.sub ? '<small>' + esc(f.sub) + '</small>' : '') + '</span><span class="tzk-key fixed">' + esc(f.keys) + '</span></div>').join('') +
      '</div><div class="tzk-sub">These go by where a key sits, so they work the same on every keyboard layout, and can’t be changed.</div>';
  }
  out += '<div class="tzk-foot"><span>Also fixed: the arrows, Page Up / Down, Esc, Enter and ? (help).</span><span class="sp"></span>' +
    (rows.some((a) => a.key !== a.def) ? '<button type="button" class="tzk-b" data-tzk="reset">Put every key back</button>' : '') + '</div></div>';
  return out;
}
function paintPanes() { panes.forEach((el) => { if (el.isConnected) el.innerHTML = settingsHtml(); }); panes = panes.filter((el) => el.isConnected); }
function repaint() { helpBodies.forEach((tb) => { tb.innerHTML = helpHtml(); }); paintPanes(); }
function stopCapture() { capture = null; }
function startCapture(id) {
  ed = { id, msg: null }; paintPanes();
  capture = (e) => {
    if (e.key === 'Escape') { stopCapture(); ed = { id: null, msg: null }; paintPanes(); return; }
    const k = nameOf(e); if (!k) return;              // a modifier on its own: keep waiting
    if (e.ctrlKey || e.metaKey || e.altKey) { ed.msg = { text: 'Ctrl, ⌘ and Alt combinations are the browser’s. Pick a key on its own, or with Shift.' }; stopCapture(); paintPanes(); return; }
    choose(id, k);
  };
}
function choose(id, k) {
  stopCapture();
  const a = actions.find((x) => x.id === id);
  if (reservedName(k)) { ed.msg = { text: '<b>' + esc(pretty(k)) + '</b> keeps its job everywhere. Pick another key.' }; paintPanes(); return; }
  if (a && a.inForm && (opts.formKeys || []).includes(k)) {
    ed.msg = { text: '<b>' + esc(pretty(k)) + '</b> is used while marking a mistake, and ' + esc(a.label.toLowerCase()) + ' works then too. Pick another key.' };
    paintPanes(); return;
  }
  const h = holder(k, id);
  if (h) {
    ed.msg = { text: '<b>' + esc(pretty(k)) + '</b> is already <b>' + esc(h.label) + '</b>.', swap: { id: h.id, label: h.label }, key: k };
    paintPanes(); return;
  }
  set(id, k); ed = { id: null, msg: null }; paintPanes();
}
function onSettingsClick(e) {
  const b = e.target.closest('[data-tzk]'); if (!b) return;
  const act = b.dataset.tzk, id = b.dataset.id;
  if (act === 'change') { e.preventDefault(); startCapture(id); return; }
  if (act === 'cancel') { stopCapture(); ed = { id: null, msg: null }; paintPanes(); return; }
  if (act === 'again') { startCapture(ed.id); return; }
  if (act === 'remove') { set(id, ''); return; }
  if (act === 'undo') {
    const a = actions.find((x) => x.id === id), h = a && holder(a.key, id);
    if (h) set(h.id, '');                              // the default went to another in the meantime: that one lets go
    set(id, null); return;
  }
  if (act === 'swap' && ed.msg && ed.msg.swap) {
    const mine = list().find((x) => x.id === ed.id).key;
    set(ed.msg.swap.id, mine || ''); set(ed.id, ed.msg.key); ed = { id: null, msg: null }; paintPanes(); return;
  }
  if (act === 'take' && ed.msg && ed.msg.swap) { set(ed.msg.swap.id, ''); set(ed.id, ed.msg.key); ed = { id: null, msg: null }; paintPanes(); return; }
  if (act === 'reset') { reset(); }
}
function renderSettings(el) {
  if (!el) return;
  css();
  if (!panes.includes(el)) { panes.push(el); el.addEventListener('click', onSettingsClick); }
  ed = { id: null, msg: null }; stopCapture();
  el.innerHTML = settingsHtml();
}

window.TehfizKeys = { register, list, set, reset, mountHelp, renderSettings, nameOf, isCapturing: () => !!capture, version: TEHFIZ_KEYS_VERSION };
})();
