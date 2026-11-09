/* ═══════════════════════════════════════════════════════════════════════
   remind.js — TehfizRemind — r2
   Loaded by the teacher app only, from /app/teacher/remind.js?v=r2.

   r2: the ticks in the option chips are a drawn shape, not rotated borders,
   so they sit right in every font and in dark mode.

   A message about a lesson, to copy or send on WhatsApp: a reminder, "running
   late", or "cancelled". Opened from a lesson in the Calendar ("Remind…") and
   from a student's ⋯ menu in the Students list ("Remind about next lesson").

   Made here, on this device, from what the app already knows: the student's
   name and time zone (both only on this device, from name sync), the lesson's
   time and length, and its plan. Nothing is sent anywhere by this module and
   no phone numbers are kept: "Open in WhatsApp" opens WhatsApp with the text
   and the teacher picks the chat there.

     TehfizRemind.open({ sid, at, len, lesson })   lesson: the occurrence (plan, new/recent/old)
     TehfizRemind.close()

   The teacher can rewrite each kind's wording once (blanks like {name}); it is
   kept on this device, in localStorage, under tehfiz_remind_tpl.

   Self-contained:
     namespace  TehfizRemind
     CSS        .trm-* (injected once)
     DOM        #trmRoot, appended to <body>
   Needs TehfizTime; uses TehfizSync.student() for the name and time zone, and
   SURAH_NAMES / sessionTypeLabel from the page when they are there.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_REMIND_VERSION = 'r2';
const T = () => window.TehfizTime;
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const K_TPL = 'tehfiz_remind_tpl', K_OPT = 'tehfiz_remind_opts';
const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const KINDS = [['remind', 'Reminder'], ['late', 'Running late'], ['cancel', 'Cancelled']];
const BLANKS = [['{salaam}', 'Assalamu alaikum, with the name'], ['{name}', 'the student’s name'], ['{day}', 'today, tomorrow or the date'],
  ['{time}', 'the time, theirs if they’re in another time zone'], ['{mytime}', 'your time'], ['{len}', 'the length, e.g. 30 minutes'],
  ['{plan}', 'what to prepare, one line each'], ['{minutes}', 'how late (Running late only)']];
/* The wording each kind starts with. {plan} and the lines around it drop out
   when the lesson has no plan; {mytime} only when it is the same time. */
const DEFAULTS = {
  remind: '{salaam}\n\nReminder: your lesson is {day} at {time}, for {len}.\n\nPlease prepare:\n{plan}\n\nJazakAllahu khayran',
  late: '{salaam} I’m running about {minutes} late for {day}’s lesson ({time}). Sorry, I’ll be with you shortly.',
  cancel: '{salaam} I’m sorry, I can’t make {day}’s lesson ({time}). I’ll let you know the new time soon, in sha Allah.',
};

let st = null;   // {sid, at, len, lesson, kind, opts, mins, text, editing}

function css() {
  if ($('trmCss')) return;
  const el = document.createElement('style'); el.id = 'trmCss';
  el.textContent =
    '#trmRoot{position:fixed;inset:0;z-index:1260;display:flex;align-items:flex-end;justify-content:center;background:rgba(23,25,28,.38);}' +
    '#trmRoot[hidden]{display:none;}' +
    '.trm-sheet{width:100%;max-width:460px;max-height:92vh;overflow:auto;background:var(--parchment);color:var(--ink);border-radius:16px 16px 0 0;' +
      'padding:10px 16px 18px;padding-bottom:max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;' +
      'box-shadow:0 -8px 28px rgba(0,0,0,.25);font-family:var(--ui-font);}' +
    '@media (min-width:700px){#trmRoot{align-items:center;}.trm-sheet{border-radius:14px;}}' +
    '.trm-grab{width:40px;height:4px;border-radius:9px;background:var(--parchment3);align-self:center;flex:none;}' +
    '.trm-h{display:flex;align-items:center;gap:10px;}.trm-h b{flex:1;font-size:17px;}' +
    '.trm-x{width:36px;height:36px;flex:none;border:1px solid var(--border2);border-radius:9px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;font-size:15px;}' +
    '.trm-sub{font-size:13px;color:var(--ink3);margin-top:-8px;line-height:1.4;}' +
    '.trm-seg{display:flex;border:1px solid var(--border2);border-radius:9px;overflow:hidden;align-self:flex-start;max-width:100%;}' +
    '.trm-seg button{height:34px;padding:0 12px;border:0;background:var(--surface,#fff);color:var(--ink2);font:500 13.5px var(--ui-font);cursor:pointer;white-space:nowrap;}' +
    '.trm-seg button+button{border-left:1px solid var(--border2);}' +
    '.trm-seg button[aria-pressed="true"]{background:var(--ink);color:var(--parchment);}' +
    '.trm-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}' +
    '.trm-chip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border:1px solid var(--border2);border-radius:99px;' +
      'background:var(--surface,#fff);color:var(--ink);font:500 13px var(--ui-font);cursor:pointer;line-height:1;}' +
    '.trm-chip i{flex:none;width:14px;height:14px;border-radius:4px;border:1.5px solid var(--ink3);box-sizing:border-box;position:relative;}' +
    '.trm-chip[aria-pressed="true"] i{background:var(--ink);border-color:var(--ink);}' +
    // r2: the tick is a drawn shape (a mask), so it sits right in any font and theme.
    '.trm-chip[aria-pressed="true"] i::after{content:"";position:absolute;inset:0;background:var(--parchment);' +
      '-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22%3E%3Cpath d=%22M2.5 6.2l2.4 2.4 4.6-5%22 fill=%22none%22 stroke=%22%23000%22 stroke-width=%221.9%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E") center/100% 100% no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22%3E%3Cpath d=%22M2.5 6.2l2.4 2.4 4.6-5%22 fill=%22none%22 stroke=%22%23000%22 stroke-width=%221.9%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E") center/100% 100% no-repeat;}' +
    '.trm-chip.rad i{border-radius:50%;}' +
    '.trm-chip.rad[aria-pressed="true"] i::after{inset:3px;border-radius:50%;-webkit-mask:none;mask:none;}' +
    '.trm-min{display:inline-flex;align-items:center;gap:6px;height:32px;font-size:13px;color:var(--ink2);}' +
    '.trm-min input{width:56px;height:32px;box-sizing:border-box;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);' +
      'font:600 14px "IBM Plex Mono",monospace;text-align:center;padding:0;}' +
    '.trm-txt{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;border:1px solid var(--border2);border-radius:10px;' +
      'background:var(--surface,#fff);color:var(--ink);font:14.5px/1.5 var(--ui-font);padding:10px 12px;}' +
    '.trm-txt.tpl{font-family:"IBM Plex Mono",monospace;font-size:13px;}' +
    '.trm-row{display:flex;gap:8px;flex-wrap:wrap;}' +
    '.trm-big{flex:1;min-width:110px;height:42px;border-radius:10px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);' +
      'font:600 14px var(--ui-font);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;}' +
    '.trm-big.wa{background:#1f8f4e;border-color:#1f8f4e;color:#fff;}' +
    '.trm-big.ok{border-color:var(--ink);}' +
    '.trm-foot{font-size:12.5px;color:var(--ink3);line-height:1.5;}' +
    '.trm-link{border:0;background:none;padding:0;color:var(--ink2);text-decoration:underline;font:inherit;cursor:pointer;}' +
    '.trm-bl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:12.5px;color:var(--ink2);}' +
    '.trm-bl code{font:500 12px "IBM Plex Mono",monospace;color:var(--ink);background:var(--surface,#fff);border:1px solid var(--border2);border-radius:5px;padding:1px 5px;cursor:pointer;justify-self:start;}';
  document.head.appendChild(el);
}
function root() {
  let r = $('trmRoot');
  if (!r) {
    r = document.createElement('div'); r.id = 'trmRoot'; r.hidden = true;
    document.body.appendChild(r);
    r.addEventListener('click', onClick);
    r.addEventListener('input', onInput);
  }
  return r;
}

/* ── what the message says ─────────────────────────────────────────────── */
function student(sid) {
  const S = window.TehfizSync;
  return (S && S.student && S.student(sid)) || null;
}
function firstName(s) { const n = String((s && s.name) || '').trim(); return n ? n.split(/\s+/)[0] : ''; }
function theirTz(sid) {
  const s = student(sid), z = s && s.tz;
  return z && T().validTz(z) ? z : null;
}
function differs(sid, ms) { const z = theirTz(sid); return !!z && !T().sameOffset(z, T().myTz(), ms); }
function timeIn(ms, tz) { return T().timeText(ms, tz).replace(/\s?([AP])M$/i, (m, a) => ' ' + a.toLowerCase() + 'm'); }
/* "today", "tomorrow (Tuesday)", or "on Thursday 12 November", in their day. */
function dayWords(ms, tz) {
  const d = T().dayText(ms, tz);
  const wd = new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', timeZone: tz || undefined });
  if (/^today$/i.test(d)) return 'today';
  if (/^tomorrow$/i.test(d)) return 'tomorrow (' + wd + ')';
  return 'on ' + new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz || undefined });
}
// SURAH_NAMES is a top-level const in tehfiz-shared.js: global, but not on window.
function surahName(n) { const L = typeof SURAH_NAMES !== 'undefined' ? SURAH_NAMES : null; return (L && L[n - 1]) || ('Surah ' + n); }
function rangeText(a, b) {
  const [s1, v1] = String(a).split(':').map(Number), [s2, v2] = String(b).split(':').map(Number);
  if (!s1) return '';
  if (s1 === s2) return surahName(s1) + ' ' + (v1 === v2 ? v1 : v1 + '–' + v2);
  return surahName(s1) + ' ' + v1 + ' – ' + surahName(s2) + ' ' + v2;
}
function stage(id) {
  if (!id || id === 'unassigned') return '';
  if (typeof window.sessionTypeLabel === 'function') { try { const l = window.sessionTypeLabel(id); if (l) return l; } catch (e) {} }
  return id.charAt(0).toUpperCase() + id.slice(1);
}
/* One line per part of the plan: "• New: Al-Baqarah 204–210". */
function planLines(o) {
  if (!o) return [];
  if (Array.isArray(o.plan) && o.plan.length) {
    return o.plan.map((s) => {
      const what = s.label || s.text || (s.start ? rangeText(s.start, s.end) : '');
      const head = s.mode === 'spot' ? 'Spot test' + (stage(s.type) ? ' (' + stage(s.type) + ')' : '') : stage(s.type);
      return what ? '• ' + (head ? head + ': ' : '') + what : '';
    }).filter(Boolean);
  }
  return [['New', o.new], ['Recent', o.recent], ['Old', o.old]].filter(([, v]) => v && String(v).trim()).map(([k, v]) => '• ' + k + ': ' + String(v).trim());
}
function fill(kind) {
  const o = st, s = student(o.sid), nm = firstName(s), z = theirTz(o.sid) || T().myTz();
  const other = differs(o.sid, o.at), useTheirs = other && o.opts.their;
  const tz = useTheirs ? z : T().myTz();
  let time = timeIn(o.at, tz) + (useTheirs ? ' your time' : '');
  if (other && o.opts.mine) time += useTheirs ? ' (' + timeIn(o.at, T().myTz()) + ' my time)' : ' my time (' + timeIn(o.at, z) + ' your time)';
  const lines = o.opts.plan ? planLines(o.lesson) : [];
  const v = {
    salaam: o.opts.salaam ? 'Assalamu alaikum' + (nm ? ' ' + nm : '') + ',' : (nm ? nm + ',' : ''),
    name: nm, day: dayWords(o.at, tz), time, mytime: timeIn(o.at, T().myTz()),
    len: o.len ? o.len + ' minutes' : '', plan: lines.join('\n'), minutes: o.mins + ' minute' + (o.mins === 1 ? '' : 's'),
  };
  let tpl = (readJ(K_TPL, {})[kind]) || DEFAULTS[kind];
  // A blank with nothing to say takes its own sentence part with it.
  if (!v.plan) tpl = tpl.replace(/\n*[^\n]*\n\{plan\}\n*/, '\n\n').replace(/\{plan\}/, '');
  if (!v.len) tpl = tpl.replace(/,? for \{len\}/, '');
  let out = tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  // "today's" reads oddly once the day is a date: "on Thursday 12 November's lesson".
  out = out.replace(/on ([A-Z][a-z]+ \d+ [A-Z][a-z]+)’s lesson/, 'the lesson on $1').replace(/tomorrow \((\w+)\)’s lesson/, 'tomorrow’s lesson');
  if (!o.opts.salaam && !nm) out = out.replace(/^\s+/, '');
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ── the sheet ─────────────────────────────────────────────────────────── */
function open(o) {
  if (!T() || !o || !o.sid || !Number.isFinite(+o.at)) return;
  css();
  const saved = readJ(K_OPT, {});
  st = { sid: o.sid, at: +o.at, len: +o.len || 0, lesson: o.lesson || null, kind: 'remind', editing: false,
         opts: { salaam: saved.salaam !== false, their: saved.their !== false, mine: !!saved.mine, plan: saved.plan !== false },
         mins: 5, other: false, text: '' };
  // A lesson under way or minutes away: "running late" is the likely one.
  if (st.at <= Date.now() + 10 * 60000 && st.at + (st.len || 30) * 60000 > Date.now()) st.kind = 'late';
  st.text = fill(st.kind);
  render();
}
function close() { const r = $('trmRoot'); if (r) { r.hidden = true; r.innerHTML = ''; } st = null; }

function chip(key, label, on, rad) {
  return '<button type="button" class="trm-chip' + (rad ? ' rad' : '') + '" data-trm="' + key + '" aria-pressed="' + !!on + '"><i aria-hidden="true"></i>' + esc(label) + '</button>';
}
function render() {
  const r = root(); if (!st) return;
  const s = student(st.sid), nm = (s && s.name) || 'student';
  const other = differs(st.sid, st.at);
  const when = T().whenText(st.at) + (st.len ? ' · ' + st.len + ' min' : '');
  let body;
  if (st.editing) {
    const cur = readJ(K_TPL, {})[st.kind];
    body =
      '<div class="trm-h"><b>Wording · ' + esc(KINDS.find((k) => k[0] === st.kind)[1]) + '</b>' +
        '<button type="button" class="trm-x" data-trm="close" aria-label="Close">✕</button></div>' +
      '<div class="trm-sub">Used every time, for every student. Tap a blank to add it where the cursor is.</div>' +
      '<textarea class="trm-txt tpl" id="trmTpl" spellcheck="false" aria-label="Wording">' + esc(cur || DEFAULTS[st.kind]) + '</textarea>' +
      '<div class="trm-bl">' + BLANKS.filter(([b]) => b !== '{minutes}' || st.kind === 'late').map(([b, d]) => '<code data-trm="blank" data-b="' + b + '">' + b + '</code><span>' + esc(d) + '</span>').join('') + '</div>' +
      '<div class="trm-row"><button type="button" class="trm-big ok" data-trm="tplsave">Save</button>' +
        '<button type="button" class="trm-big" data-trm="tplreset">Back to the original</button>' +
        '<button type="button" class="trm-big" data-trm="tplback">Cancel</button></div>';
  } else {
    const share = navigator.share && window.matchMedia && matchMedia('(pointer:coarse)').matches;
    const lateRow = st.kind === 'late'
      ? '<div class="trm-chips" role="group" aria-label="How late">' +
          [5, 10, 15].map((m) => chip('mins', m + ' min', !st.other && st.mins === m, true).replace('data-trm="mins"', 'data-trm="mins" data-m="' + m + '"')).join('') +
          chip('other', 'Other', st.other, true) +
          (st.other ? '<label class="trm-min"><input id="trmMin" type="number" inputmode="numeric" min="1" max="180" value="' + st.mins + '" aria-label="Minutes late"> min</label>' : '') +
        '</div>' : '';
    body =
      '<div class="trm-h"><b>' + esc('Message for ' + nm) + '</b><button type="button" class="trm-x" data-trm="close" aria-label="Close">✕</button></div>' +
      '<div class="trm-sub">' + esc(when) + '</div>' +
      '<div class="trm-seg" role="group" aria-label="Kind">' + KINDS.map(([k, l]) => '<button type="button" data-trm="kind" data-k="' + k + '" aria-pressed="' + (st.kind === k) + '">' + l + '</button>').join('') + '</div>' +
      lateRow +
      '<div class="trm-chips" role="group" aria-label="Include">' +
        chip('opt', 'Salaam', st.opts.salaam).replace('data-trm="opt"', 'data-trm="opt" data-o="salaam"') +
        (other ? chip('opt', 'Their time', st.opts.their).replace('data-trm="opt"', 'data-trm="opt" data-o="their"') +
                 chip('opt', 'My time too', st.opts.mine).replace('data-trm="opt"', 'data-trm="opt" data-o="mine"') : '') +
        (st.kind === 'remind' && planLines(st.lesson).length ? chip('opt', 'What to prepare', st.opts.plan).replace('data-trm="opt"', 'data-trm="opt" data-o="plan"') : '') +
      '</div>' +
      '<textarea class="trm-txt" id="trmTxt" aria-label="Message">' + esc(st.text) + '</textarea>' +
      '<div class="trm-row"><button type="button" class="trm-big" data-trm="copy" id="trmCopy">Copy</button>' +
        '<button type="button" class="trm-big wa" data-trm="wa">Open in WhatsApp</button>' +
        (share ? '<button type="button" class="trm-big" data-trm="share">Share…</button>' : '') + '</div>' +
      '<div class="trm-foot">You can edit the text before sending. WhatsApp opens with it ready; you choose the chat there. Changing an option above rewrites the text. ' +
        '<button type="button" class="trm-link" data-trm="tpl">Change the default wording</button></div>';
  }
  r.innerHTML = '<div class="trm-sheet" role="dialog" aria-modal="true" aria-label="Message"><div class="trm-grab"></div>' + body + '</div>';
  r.hidden = false;
  fit();
}
/* The message box as tall as its text, up to half the screen. */
function fit() {
  const t = $('trmTxt'); if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight + 2, Math.max(170, Math.round(window.innerHeight * 0.5))) + 'px';
}
function refill() { st.text = fill(st.kind); const t = $('trmTxt'); if (t) { t.value = st.text; fit(); } }

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(t); t.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  t.remove(); return ok;
}
function onInput(e) {
  if (!st) return;
  if (e.target.id === 'trmTxt') { st.text = e.target.value; fit(); }
  if (e.target.id === 'trmMin') {
    const n = Math.round(Number(e.target.value));
    if (Number.isFinite(n) && n >= 1 && n <= 180) { st.mins = n; refill(); }
  }
}
function onClick(e) {
  if (!st) return;
  if (e.target.id === 'trmRoot') return close();
  const b = e.target.closest('[data-trm]'); if (!b) return;
  const a = b.dataset.trm;
  if (a === 'close') return close();
  if (a === 'kind') { st.kind = b.dataset.k; st.text = fill(st.kind); render(); return; }
  if (a === 'opt') {
    const k = b.dataset.o; st.opts[k] = !st.opts[k];
    writeJ(K_OPT, st.opts); st.text = fill(st.kind); render(); return;
  }
  if (a === 'mins') { st.other = false; st.mins = +b.dataset.m; st.text = fill(st.kind); render(); return; }
  if (a === 'other') {
    st.other = true; render();
    const i = $('trmMin'); if (i) { i.focus(); i.select(); }
    return;
  }
  if (a === 'copy') {
    copyText(st.text).then((ok) => { const c = $('trmCopy'); if (c) { c.textContent = ok ? 'Copied ✓' : 'Couldn’t copy'; setTimeout(() => { if (c.isConnected) c.textContent = 'Copy'; }, 1800); } });
    return;
  }
  if (a === 'wa') { window.open('https://wa.me/?text=' + encodeURIComponent(st.text), '_blank', 'noopener'); return; }
  if (a === 'share') { navigator.share({ text: st.text }).catch(() => {}); return; }
  if (a === 'tpl') { st.editing = true; render(); const t = $('trmTpl'); if (t) t.focus(); return; }
  if (a === 'tplback') { st.editing = false; render(); return; }
  if (a === 'tplreset') { const all = readJ(K_TPL, {}); delete all[st.kind]; writeJ(K_TPL, all); st.editing = false; st.text = fill(st.kind); render(); return; }
  if (a === 'tplsave') {
    const v = ($('trmTpl').value || '').trim(), all = readJ(K_TPL, {});
    if (!v || v === DEFAULTS[st.kind]) delete all[st.kind]; else all[st.kind] = v.slice(0, 2000);
    writeJ(K_TPL, all); st.editing = false; st.text = fill(st.kind); render(); return;
  }
  if (a === 'blank') {
    const t = $('trmTpl'); if (!t) return;
    const p = t.selectionStart || t.value.length;
    t.value = t.value.slice(0, p) + b.dataset.b + t.value.slice(t.selectionEnd || p);
    t.focus(); t.selectionStart = t.selectionEnd = p + b.dataset.b.length;
  }
}
// Escape closes this first, before the calendar or Students panel under it hears it.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && st) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
}, true);

window.TehfizRemind = { open, close, isOpen: () => !!st, text: () => (st ? st.text : ''), version: TEHFIZ_REMIND_VERSION };
})();
