/* ═══════════════════════════════════════════════════════════════════════
   invoices.js — TehfizInvoices — i6
   Loaded by the teacher app only, from /app/teacher/invoices.js?v=i7.
   i7: redrawing (a tap on a row, a status change) keeps the place on the page.
   Opened from the header menu (Menu → Invoices), and used by a student's
   Profile (profile.js) for that student's Billing tab.

   i4: a billing PERIOD is either a calendar month or a custom range of days
   (5 Oct – 4 Nov). Status, the reference and the file name follow the period.
   The server still answers by month, so a range fetches the months it spans
   and keeps the sessions whose date falls inside it.

   One period, every student taught in it:
     · a summary — students, sessions, hours billed, total due
     · a row per student — who to bill, sessions, time recorded and billed
       (after rounding), rate, amount, status (Not printed / Printed / Paid)
       with Preview · Print · Mark paid, and the problems that would make an
       invoice wrong ("1 untimed · fix", "Add who to bill")
     · Billing defaults — rate, currency, rounding, payment details, phone,
       days to pay
     · Print all — one print job, one invoice per page

   Where the data comes from:
     · times: GET /api/sessions/hours?detail=1&from=M&to=M — the same rows the
       per-student Hours panel uses, for every student at once
     · the arithmetic, rates and rounding: TehfizSync.billing — the same
       functions the Hours panel's invoice uses, so the two cannot disagree
     · bill-to names, status and payment details: this device only
       (localStorage 'tehfiz_inv_*'), like the per-student rates already are.
       Names of students never leave the device; neither do these.

   Self-contained: namespace window.TehfizInvoices, DOM in #tinvRoot and
   #tinvPrint, storage prefix 'tehfiz_inv_', CSS prefixed .tinv-. It calls:
     TehfizSync.{isSignedIn, api, roster, open, billing}
     app: openSessions, showToast
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_INVOICES_VERSION = 'i7';
const K_BILLTO = 'tehfiz_inv_billto', K_STATUS = 'tehfiz_inv_status', K_PAY = 'tehfiz_inv_payment';
const K_LASTEND = 'tehfiz_inv_lastend';   // {sid: 'YYYY-MM-DD'} end of the last period printed
const K_RANGE = 'tehfiz_inv_range';       // the last custom range used on the list {from, to}

let isOpen = false, month = '', loading = false, error = '';
let period = null;        // {kind:'month', ym} | {kind:'range', from:'YYYY-MM-DD', to:'YYYY-MM-DD'}
let data = null;          // {period, rows:[{sid, seconds, sessions, untimed}], sessions:[...]}
let monthsWithData = [];  // ['2026-09', ...] newest first
let editing = null;       // sid whose settings row is open
let showDefaults = false, preview = null;   // preview: a line (lineFor) to show

const $ = (id) => document.getElementById(id);
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sync() { return window.TehfizSync || null; }
function bill() { return sync() && sync().billing; }
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function readJ(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }
function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

/* ── small helpers ──────────────────────────────────────────────────────── */
function ymNow() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function ymAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(ym) { return bill() ? bill().monthLabel(ym) : ym; }

/* ── periods ────────────────────────────────────────────────────────────── */
function ymdToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ymdAdd(ymd, n) {
  const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function okYmd(x) { return /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')); }
function monthPeriod(ym) { return { kind: 'month', ym }; }
function rangePeriod(from, to) {
  if (!okYmd(from)) from = ymNow() + '-01';
  if (!okYmd(to)) to = ymdToday();
  if (to < from) { const t = from; from = to; to = t; }
  return { kind: 'range', from, to };
}
function pFrom(p) { return p.kind === 'month' ? p.ym + '-01' : p.from; }
function pTo(p) {
  if (p.kind !== 'month') return p.to;
  const [y, m] = p.ym.split('-').map(Number);
  return p.ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
}
// Status keys: a month keeps its old 'YYYY-MM' key, so marks made before i4 still apply.
function pKey(p) { return p.kind === 'month' ? p.ym : p.from + '..' + p.to; }
function dayLabel(ymd, withYear) {
  return new Date(ymd + 'T12:00:00').toLocaleDateString(undefined, withYear
    ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}
function pLabel(p) {
  if (p.kind === 'month') return monthLabel(p.ym);
  const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
  return dayLabel(p.from, !sameYear) + ' \u2013 ' + dayLabel(p.to, true);
}
function pRef(p, code) {
  const c = String(code || '').toUpperCase();
  return 'TF-' + (p.kind === 'month' ? p.ym.replace('-', '') : p.from.replace(/-/g, '')) + '-' + c;
}
function lastEnd(sid) { return readJ(K_LASTEND, {})[sid] || ''; }
function noteEnd(sid, p) {
  const all = readJ(K_LASTEND, {}), end = pTo(p);
  if (!all[sid] || all[sid] < end) { all[sid] = end; writeJ(K_LASTEND, all); }
}
/* A custom range starts the day after the last invoice ended (for one
   student), or after the last range used on the list, and runs to today. */
function defaultRange(sid) {
  const today = ymdToday();
  let from = '';
  if (sid) { const e = lastEnd(sid); if (e) from = ymdAdd(e, 1); }
  else { const r = readJ(K_RANGE, null); if (r && okYmd(r.to)) from = ymdAdd(r.to, 1); }
  if (!from || from > today) from = ymNow() + '-01';
  return rangePeriod(from, today);
}
function hm(sec) {
  const s = Math.max(0, Math.round(sec || 0)), h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (!h && !m) return s ? '< 1 min' : '0 min';
  return (h ? h + ' h ' : '') + (h ? String(m).padStart(2, '0') : m) + ' min';
}
function money(n, cur) {
  if (n == null) return '—';
  const t = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (cur ? cur + ' ' : '') + t;
}
function money2(n, cur) {
  return (cur ? cur + ' ' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dshort(iso) { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch { return ''; } }
function dlong(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }

function student(sid) {
  const r = (sync() && sync().roster ? sync().roster() : []).find((s) => s.id === sid);
  return r || { id: sid, code: '', name: '', removed: true };
}
function payment() {
  return { due: 10, from: '', phone: '', howto: '', ...readJ(K_PAY, {}) };
}
function billTo(sid) { return (readJ(K_BILLTO, {})[sid] || '').trim(); }
function statusOf(sid, p) { return readJ(K_STATUS, {})[pKey(p || period) + '|' + sid] || {}; }
function setStatus(sid, patch, p) {
  const all = readJ(K_STATUS, {});
  const key = pKey(p || period) + '|' + sid;
  const next = { ...(all[key] || {}), ...patch };
  Object.keys(next).forEach((k) => { if (next[k] == null) delete next[k]; });
  all[key] = next; writeJ(K_STATUS, all);
}

/* Everything one invoice needs, computed once — the table, the preview and
   the print all read this, so they cannot drift apart. */
function lineFor(r, d, p) {
  d = d || data; p = p || period;
  const b = bill();
  const rate = b.rate(r.sid);
  const step = b.step(rate);
  const rows = (d.sessions || []).filter((x) => x.student_id === r.sid)
    .sort((a, c) => String(a.date_ymd).localeCompare(String(c.date_ymd)));
  const billed = rows.length
    ? rows.reduce((n, x) => n + b.billedSec(x.duration_sec || 0, step), 0)
    : b.billedSec(r.seconds || 0, step);
  const amt = parseFloat(rate.amount);
  const free = rate.amount != null && String(rate.amount) !== '' && amt === 0;
  const amount = Number.isFinite(amt) && amt > 0 ? (billed / 3600) * amt : (free ? 0 : null);
  const stored = b.stored(r.sid);
  return {
    sid: r.sid, s: student(r.sid), rows, rate, step, billed, amount, free,
    recorded: r.seconds || 0, sessions: r.sessions || 0, untimed: r.untimed || 0,
    currency: rate.currency || '', rateIsDefault: stored.amount == null,
    billTo: billTo(r.sid), status: statusOf(r.sid, p),
    period: p, periodLabel: pLabel(p),
    ref: pRef(p, student(r.sid).code || r.sid.slice(0, 8)),
  };
}

/* ── data ───────────────────────────────────────────────────────────────── */
async function loadMonths() {
  try {
    const d = await sync().api('/api/sessions/hours');
    const set = new Set((d.months || []).map((x) => x.month));
    monthsWithData = Array.from(set).sort().reverse();
  } catch { monthsWithData = []; }
}
/* One period's rows and sessions. A month uses the server's own totals; a
   range is summed from the sessions whose date falls inside it. */
async function fetchPeriod(p) {
  const fm = pFrom(p).slice(0, 7), tm = pTo(p).slice(0, 7);
  const d = await sync().api('/api/sessions/hours?detail=1&from=' + fm + '&to=' + tm);
  if (p.kind === 'month') {
    return {
      period: p,
      rows: (d.months || []).filter((x) => x.month === p.ym && x.student_id).map((x) => ({
        sid: x.student_id, seconds: x.seconds || 0, sessions: x.sessions || 0, untimed: x.untimed || 0 })),
      sessions: d.sessions || [], truncated: !!d.truncated,
    };
  }
  const from = pFrom(p), to = pTo(p);
  const sessions = (d.sessions || []).filter((x) => x.date_ymd && x.date_ymd >= from && x.date_ymd <= to);
  const by = new Map();
  sessions.forEach((x) => {
    if (!x.student_id) return;
    const r = by.get(x.student_id) || { sid: x.student_id, seconds: 0, sessions: 0, untimed: 0 };
    r.sessions += 1;
    if (x.duration_sec == null) r.untimed += 1; else r.seconds += x.duration_sec;
    by.set(x.student_id, r);
  });
  return { period: p, rows: Array.from(by.values()), sessions, truncated: !!d.truncated };
}
async function loadPeriod(p) {
  period = p; month = p.kind === 'month' ? p.ym : month;
  if (p.kind === 'range') writeJ(K_RANGE, { from: p.from, to: p.to });
  loading = true; error = ''; data = null; editing = null; render();
  try { data = await fetchPeriod(p); }
  catch (e) {
    error = e && e.status === 401 ? 'Signed out — sign in again to see invoices.' : 'Could not load ' + pLabel(p) + ': ' + ((e && e.message) || 'offline');
  }
  loading = false; render();
}
function loadMonth(ym) { return loadPeriod(monthPeriod(ym)); }
/* Invoices are raised in arrears: early in a month the one to raise is last
   month's. Otherwise open on the newest month that has any teaching. */
function defaultMonth() {
  const now = ymNow(), prev = ymAdd(now, -1);
  if (new Date().getDate() <= 10 && monthsWithData.includes(prev)) return prev;
  return monthsWithData[0] || now;
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function injectCss() {
  if ($('tinvCss')) return;
  const el = document.createElement('style');
  el.id = 'tinvCss';
  el.textContent = `
#tinvRoot .tinv{position:fixed;inset:0;z-index:1100;background:var(--parchment2);color:var(--ink);font-family:var(--ui-font);
  display:flex;flex-direction:column;overflow:hidden;}
.tinv-bar{height:56px;flex:none;background:var(--chrome);color:var(--on-ink);display:flex;align-items:center;gap:10px;padding:0 10px;
  border-bottom:2px solid var(--chrome-rule);}
.tinv-bar h1{margin:0 0 0 4px;font-size:17px;font-weight:600;}
.tinv-back{height:40px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border:1px solid var(--chrome-3);border-radius:8px;
  background:var(--chrome-2);color:var(--on-ink);font:500 14px var(--ui-font);cursor:pointer;}
.tinv-back:hover{background:var(--chrome-3);}
.tinv-main{flex:1 1 auto;overflow:auto;padding:22px 28px 40px;}
.tinv-inner{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}
.tinv-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.tinv-top h2{margin:0;font-size:24px;font-weight:600;}
.tinv-mon{display:flex;align-items:center;gap:4px;}
.tinv-mon span{min-width:168px;text-align:center;font-size:17px;font-weight:600;}
.tinv-ib{width:40px;height:40px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);cursor:pointer;
  font-size:18px;display:inline-flex;align-items:center;justify-content:center;}
.tinv-ib:hover{background:var(--parchment);}
.tinv-acts{margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;}
.tinv-btn{height:44px;padding:0 16px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);
  font:500 14px var(--ui-font);cursor:pointer;}
.tinv-btn:hover{background:var(--parchment);}
.tinv-btn.pri{background:var(--gold);color:var(--on-gold);border-color:var(--gold);font-weight:600;}
.tinv-btn.pri:hover{filter:brightness(1.1);}
.tinv-btn:disabled{opacity:.5;cursor:default;}
.tinv-sum{display:flex;gap:26px;flex-wrap:wrap;align-items:center;font-size:14px;color:var(--ink2);background:var(--surface,#fff);
  border:1px solid var(--border);border-radius:10px;padding:14px 18px;}
.tinv-sum b{color:var(--ink);font-weight:600;}
.tinv-sum .mono{font-family:'IBM Plex Mono',monospace;}
.tinv-sum .def{margin-left:auto;font-size:13px;}
.tinv-tbl{background:var(--surface,#fff);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.tinv-r{display:grid;grid-template-columns:2.1fr .7fr 1.15fr 1.15fr 1.05fr 1.1fr 1.25fr 2.6fr;align-items:center;gap:0 10px;
  padding:12px 18px;border-bottom:1px solid var(--border);font-size:14px;}
.tinv-r:last-child{border-bottom:none;}
.tinv-r.h{font-size:12px;font-weight:500;color:var(--ink3);letter-spacing:.04em;background:var(--parchment2);text-transform:uppercase;padding:10px 18px;}
.tinv-r.warnrow{background:color-mix(in srgb,var(--amber-bg,#fff3cd) 40%,var(--surface,#fff));}
.tinv-who{display:flex;flex-direction:column;min-width:0;}
.tinv-who b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tinv-code{font:400 12px 'IBM Plex Mono',monospace;color:var(--ink3);font-weight:400;margin-left:6px;}
.tinv-sub{font-size:13px;color:var(--ink3);}
.tinv-fix{font-size:12px;color:var(--coral,#8a3f06);background:none;border:none;padding:0;text-decoration:underline;cursor:pointer;text-align:left;
  font-family:var(--ui-font);min-height:24px;}
.tinv-num{font-family:'IBM Plex Mono',monospace;}
.tinv-r > .c-rec{display:flex;flex-direction:column;align-items:flex-start;}
.tinv-ra{flex-wrap:nowrap;}
.tinv-r .r{text-align:right;}
.tinv-chip{display:inline-block;font-size:12px;padding:3px 9px;border-radius:999px;background:var(--gold-pale);color:var(--ink2);white-space:nowrap;}
.tinv-chip.paid{background:var(--green-bg);color:var(--green);}
.tinv-chip.none{background:none;color:var(--ink3);padding:3px 0;}
.tinv-ra{display:flex;gap:6px;justify-content:flex-end;}
.tinv-sb{height:36px;padding:0 12px;border:1px solid var(--border2);border-radius:6px;background:var(--surface,#fff);color:var(--ink);
  font:500 13px var(--ui-font);cursor:pointer;}
.tinv-sb.strong{border-color:var(--ink);}
.tinv-sb:hover{background:var(--parchment);}
.tinv-edit{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:12px;padding:12px;background:var(--parchment);
  border-radius:8px;}
.tinv-f{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--ink3);font-weight:500;}
.tinv-f input,.tinv-f textarea{height:40px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border2);border-radius:6px;
  background:var(--surface,#fff);color:var(--ink);font:400 14px var(--ui-font);}
.tinv-f textarea{height:auto;min-height:84px;padding:8px 10px;resize:vertical;}
.tinv-f .w1{width:220px;}.tinv-f .w2{width:110px;}.tinv-f .w3{width:80px;}
.tinv-chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2);height:40px;}
.tinv-note{font-size:13px;color:var(--ink3);}
.tinv-empty{padding:40px 20px;text-align:center;color:var(--ink3);font-size:14px;background:var(--surface,#fff);border:1px solid var(--border);border-radius:10px;}
.tinv-err{color:var(--red);font-size:14px;}
/* phone: rows become cards */
@media (max-width:900px){
  .tinv-main{padding:14px 12px 30px;}
  .tinv-top h2{font-size:20px;}
  .tinv-acts{margin-left:0;width:100%;}
  .tinv-acts .tinv-btn{flex:1 1 0;}
  .tinv-sum{gap:8px 18px;}
  .tinv-sum .def{margin-left:0;width:100%;}
  .tinv-r.h{display:none;}
  .tinv-r{grid-template-columns:1fr auto;gap:4px 10px;padding:14px;}
  .tinv-r > .c-who{grid-column:1/2;}
  .tinv-r > .c-amt{grid-column:2/3;grid-row:1;text-align:right;font-size:16px;font-weight:600;}
  .tinv-r > .c-meta{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:2px 12px;font-size:13px;color:var(--ink2);}
  .tinv-r > .c-hide{display:none;}
  .tinv-r > .c-st{grid-column:1/2;}
  .tinv-r > .c-act{grid-column:1/-1;margin-top:6px;}
  .tinv-ra{justify-content:flex-start;}
  .tinv-ra .tinv-sb{flex:1 1 0;height:40px;}
}
@media (min-width:901px){ .tinv-r > .c-meta{display:none;} }
/* dialogs (defaults, preview) */
.tinv-dlg{position:fixed;inset:0;z-index:1260;display:flex;align-items:center;justify-content:center;padding:16px;}
.tinv-dlg .scrim{position:absolute;inset:0;background:rgba(23,25,28,.5);}
.tinv-card{position:relative;background:var(--parchment);border-radius:14px;max-width:560px;width:100%;max-height:calc(100vh - 32px);
  overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 18px 48px rgba(23,25,28,.3);}
.tinv-card h3{margin:0;font-size:18px;}
.tinv-card .row{display:flex;gap:12px;flex-wrap:wrap;}
.tinv-card .tinv-f{flex:1 1 140px;}
.tinv-card .tinv-f input{width:100%;}
.tinv-card .tinv-f textarea{width:100%;}
.tinv-card .foot{display:flex;gap:10px;justify-content:flex-end;}
.tinv-pv{max-width:860px;padding:0;background:#e3e3df;}
.tinv-pv .pvbar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;
  background:var(--parchment);border-bottom:1px solid var(--border);}
.tinv-pv .pvpage{padding:18px;display:flex;justify-content:center;}
.tinv-pv .tinv-doc{box-shadow:0 4px 18px rgba(23,25,28,.18);}
/* the invoice document — screen preview and print share it */
.tinv-doc{width:794px;min-height:1123px;box-sizing:border-box;background:#fff;color:#17191c;padding:64px 64px 48px;
  font-family:'IBM Plex Sans',system-ui,sans-serif;display:flex;flex-direction:column;gap:26px;}
.tinv-doc .brand{display:flex;align-items:center;gap:14px;}
.tinv-doc .brand b{font-size:18px;font-weight:600;letter-spacing:.14em;}
.tinv-doc .brand i{flex:1;border-top:1px solid #a6abb2;}
.tinv-doc .brand span{font-size:14px;letter-spacing:.2em;color:#3f444b;}
.tinv-doc .two{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.tinv-doc .lab{font-size:11px;letter-spacing:.08em;color:#626973;text-transform:uppercase;display:block;margin-top:12px;}
.tinv-doc .lab:first-child{margin-top:0;}
.tinv-doc .big{font-size:18px;font-weight:600;display:block;}
.tinv-doc .t{font-size:14px;color:#3f444b;display:block;}
.tinv-doc .mono{font-family:'IBM Plex Mono',monospace;}
.tinv-doc .rt{text-align:right;}
.tinv-doc table{width:100%;border-collapse:collapse;font-size:13px;}
.tinv-doc th{font-weight:500;font-size:11px;letter-spacing:.06em;color:#3f444b;text-align:left;padding:8px 6px 8px 0;border-bottom:1px solid #17191c;text-transform:uppercase;}
.tinv-doc td{padding:7px 6px 7px 0;border-bottom:1px solid rgba(23,25,28,.13);vertical-align:top;}
.tinv-doc td.n,.tinv-doc th.n{text-align:right;font-family:'IBM Plex Mono',monospace;white-space:nowrap;}
.tinv-doc td .dim{color:#626973;}
.tinv-doc tr{break-inside:avoid;}
.tinv-doc .tot{align-self:flex-end;width:380px;display:flex;flex-direction:column;gap:8px;font-size:14px;break-inside:avoid;}
.tinv-doc .tot div{display:flex;justify-content:space-between;gap:12px;}
.tinv-doc .tot .due{border-top:2px solid #17191c;padding-top:10px;font-size:18px;font-weight:600;}
.tinv-doc .pay{border:1px solid rgba(23,25,28,.25);border-radius:8px;padding:14px 16px;font-size:14px;display:flex;flex-direction:column;gap:6px;
  white-space:pre-line;break-inside:avoid;}
.tinv-doc .warn{font-size:12px;color:#8a3f06;}
.tinv-doc .ft{margin-top:auto;display:flex;justify-content:space-between;font-size:11px;color:#626973;border-top:1px solid rgba(23,25,28,.13);padding-top:10px;}
@media (max-width:860px){ .tinv-pv .pvpage{padding:10px;overflow:auto;justify-content:flex-start;} }
#tinvPrint{display:none;}
/* i4: Month / Custom range, and a name that opens the student's Profile */
.tinv-seg{display:flex;}
.tinv-seg button{height:40px;padding:0 14px;border:1px solid var(--border2);background:var(--surface,#fff);color:var(--ink);font:500 14px var(--ui-font);cursor:pointer;}
.tinv-seg button:first-child{border-radius:8px 0 0 8px;}
.tinv-seg button:last-child{border-radius:0 8px 8px 0;margin-left:-1px;}
.tinv-seg button[aria-pressed="true"]{background:var(--ink);color:var(--parchment);border-color:var(--ink);font-weight:600;}
.tinv-rng{gap:8px;}
.tinv-rng input{height:40px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border2);border-radius:8px;background:var(--surface,#fff);color:var(--ink);font:400 14px var(--ui-font);}
.tinv-to{min-width:0!important;font-size:14px!important;font-weight:400!important;color:var(--ink3);}
.tinv-name{background:none;border:none;padding:0;text-align:left;font:600 14px var(--ui-font);color:var(--ink);cursor:pointer;
  text-decoration:underline;text-decoration-color:var(--border2);text-underline-offset:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tinv-name:hover{text-decoration-color:var(--ink);}
@media print{
  @page{size:A4;margin:0;}
  /* The app is a full-height, overflow-hidden flex column; printed as is,
     only the first invoice would fit. */
  html:has(body.tinv-printing),body.tinv-printing{height:auto!important;min-height:0!important;overflow:visible!important;
    display:block!important;background:#fff!important;}
  body.tinv-printing > *:not(#tinvPrint){display:none!important;}
  body.tinv-printing #tinvPrint{display:block!important;}
  body.tinv-printing .tinv-doc{width:210mm;min-height:297mm;padding:18mm 17mm 14mm;page-break-after:always;break-after:page;}
  body.tinv-printing .tinv-doc:last-child{page-break-after:auto;break-after:auto;}
}
`;
  document.head.appendChild(el);
}

/* ── render ─────────────────────────────────────────────────────────────── */
function rowHtml(L) {
  const s = L.s;
  const name = s.name || (s.removed ? 'Removed student' : 'Unnamed student');
  const st = L.free ? '<span class="tinv-chip none">Not billed</span>'
    : L.status.paid ? '<span class="tinv-chip paid">Paid ' + esc(dshort(L.status.paid)) + '</span>'
    : L.status.printed ? '<span class="tinv-chip">Printed ' + esc(dshort(L.status.printed)) + '</span>'
    : '<span class="tinv-chip">Not printed</span>';
  const rateTxt = L.free ? 'Free · trial'
    : (L.amount == null ? '<button class="tinv-fix" data-tinv="edit" data-sid="' + esc(L.sid) + '">Set a rate</button>'
      : (L.rateIsDefault ? '<span class="tinv-sub">default</span>' : esc(money(parseFloat(L.rate.amount), L.currency))));
  const rec = '<span class="tinv-num">' + hm(L.recorded) + '</span>' +
    (L.untimed ? '<button class="tinv-fix" data-tinv="fix" data-sid="' + esc(L.sid) + '" title="Open this student’s sessions to set the time">' +
      L.untimed + ' untimed · fix</button>' : '');
  const bt = L.billTo ? '<span class="tinv-sub">' + esc(L.billTo) + '</span>'
    : '<button class="tinv-fix" data-tinv="edit" data-sid="' + esc(L.sid) + '">Add who to bill</button>';
  const acts = '<div class="tinv-ra">' +
    '<button class="tinv-sb" data-tinv="preview" data-sid="' + esc(L.sid) + '">Preview</button>' +
    (L.free ? '' : L.status.paid
      ? '<button class="tinv-sb" data-tinv="unpaid" data-sid="' + esc(L.sid) + '" title="Mark as not paid">Undo paid</button>'
      : L.status.printed
        ? '<button class="tinv-sb strong" data-tinv="paid" data-sid="' + esc(L.sid) + '">Mark paid</button>'
        : '<button class="tinv-sb strong" data-tinv="print" data-sid="' + esc(L.sid) + '"' + (L.amount == null ? ' disabled title="Set a rate first"' : '') + '>Print</button>' +
          '<button class="tinv-sb" data-tinv="paid" data-sid="' + esc(L.sid) + '" title="Paid without printing an invoice">Paid</button>') +
    '<button class="tinv-sb" data-tinv="edit" data-sid="' + esc(L.sid) + '" aria-label="Billing for ' + esc(name) + '">Edit</button>' +
  '</div>';
  const warn = !L.billTo || L.untimed || (L.amount == null && !L.free);
  return '<div class="tinv-r' + (warn ? ' warnrow' : '') + '">' +
    '<div class="tinv-who c-who">' +
      (window.TehfizProfile && !s.removed
        ? '<button class="tinv-name" data-tinv="profile" data-sid="' + esc(L.sid) + '" title="Open ' + esc(name) + '\u2019s Profile, on Billing">'
        : '<b>') + esc(name) + (s.code ? '<span class="tinv-code">' + esc(s.code) + '</span>' : '') +
      (window.TehfizProfile && !s.removed ? '</button>' : '</b>') + bt + '</div>' +
    '<div class="c-meta"><span>' + L.sessions + ' sessions</span><span>' + hm(L.billed) + ' billed</span>' +
      (L.untimed ? '<button class="tinv-fix" data-tinv="fix" data-sid="' + esc(L.sid) + '">' + L.untimed + ' untimed · fix</button>' : '') + '</div>' +
    '<div class="c-hide tinv-num">' + L.sessions + '</div>' +
    '<div class="c-hide c-rec">' + rec + '</div>' +
    '<div class="c-hide tinv-num">' + hm(L.billed) + '</div>' +
    '<div class="c-hide">' + rateTxt + '</div>' +
    '<div class="c-amt r tinv-num">' + (L.free ? '0' : (L.amount == null ? '—' : esc(money(Math.round(L.amount * 100) / 100, '')))) + '</div>' +
    '<div class="c-st" style="padding-left:6px;">' + st + '</div>' +
    '<div class="c-act">' + acts + '</div>' +
    (editing === L.sid ? editHtml(L) : '') +
  '</div>';
}
function editHtml(L) {
  const stored = bill().stored(L.sid);
  const d = { ...bill().profileRate(), ...bill().defaults() };
  return '<div class="tinv-edit">' +
    '<label class="tinv-f">Bill to<input class="w1" data-tinvin="billto" data-sid="' + esc(L.sid) + '" value="' + esc(L.billTo) +
      '" placeholder="e.g. Mr Ahmed Khan"></label>' +
    '<label class="tinv-f">Rate / hour<input class="w2" inputmode="decimal" data-tinvin="amount" data-sid="' + esc(L.sid) + '" value="' +
      esc(stored.amount && stored.amount !== '0' ? stored.amount : '') + '" placeholder="' + esc(d.amount ? 'default ' + d.amount : 'e.g. 2000') + '"' +
      (L.free ? ' disabled' : '') + '></label>' +
    '<label class="tinv-f">Currency<input class="w3" data-tinvin="currency" data-sid="' + esc(L.sid) + '" value="' + esc(stored.currency || '') +
      '" placeholder="' + esc(d.currency || 'PKR') + '"></label>' +
    '<label class="tinv-f">Round each session up to (min)<input class="w3" inputmode="numeric" data-tinvin="step" data-sid="' + esc(L.sid) +
      '" value="' + esc(stored.step || '') + '" placeholder="' + esc(bill().step(d)) + '"></label>' +
    '<label class="tinv-chk"><input type="checkbox" data-tinvin="free" data-sid="' + esc(L.sid) + '"' + (L.free ? ' checked' : '') +
      '> Not billed (free or trial)</label>' +
    '<button class="tinv-sb strong" data-tinv="edit-done" data-sid="' + esc(L.sid) + '">Done</button>' +
    '<span class="tinv-note" style="width:100%;">Blank fields follow your billing defaults. Kept on this device.</span>' +
  '</div>';
}

function mainHtml() {
  const b = bill();
  const d = { ...b.profileRate(), ...b.defaults() };
  const defStep = b.step(d);
  const isRange = period.kind === 'range';
  const pick = isRange
    ? '<div class="tinv-mon tinv-rng"><input type="date" data-tinvin="from" value="' + esc(period.from) + '" aria-label="From">' +
        '<span class="tinv-to">to</span><input type="date" data-tinvin="to" value="' + esc(period.to) + '" aria-label="To"></div>'
    : '<div class="tinv-mon"><button class="tinv-ib" data-tinv="prev" aria-label="Previous month">‹</button>' +
        '<span>' + esc(monthLabel(month)) + '</span>' +
        '<button class="tinv-ib" data-tinv="next" aria-label="Next month"' + (month >= ymNow() ? ' disabled' : '') + '>›</button></div>';
  const head = '<div class="tinv-top"><h2>Invoices</h2>' +
    '<div class="tinv-seg" role="group" aria-label="Billing period">' +
      '<button data-tinv="mode-month" aria-pressed="' + !isRange + '">Month</button>' +
      '<button data-tinv="mode-range" aria-pressed="' + isRange + '">Custom range</button></div>' +
    pick +
    '<div class="tinv-acts"><button class="tinv-btn" data-tinv="defaults">Billing defaults</button>';
  if (loading) return head + '</div></div><div class="tinv-empty">Loading ' + esc(pLabel(period)) + '…</div>';
  if (error) return head + '</div></div><div class="tinv-err" role="alert">' + esc(error) + '</div>';
  const lines = (data.rows || []).map((r) => lineFor(r))
    .sort((a, c) => (a.s.name || '~' + a.s.code).localeCompare(c.s.name || '~' + c.s.code));
  const printable = lines.filter((L) => !L.free && L.amount != null);
  const sessions = lines.reduce((n, L) => n + L.sessions, 0);
  const billed = lines.reduce((n, L) => n + L.billed, 0);
  const curs = Array.from(new Set(printable.map((L) => L.currency)));
  const due = printable.filter((L) => !L.status.paid).reduce((n, L) => n + L.amount, 0);
  const actions = head +
    '<button class="tinv-btn pri" data-tinv="printall"' + (printable.length ? '' : ' disabled') + '>Print all ' + printable.length + '</button></div></div>';
  if (!lines.length) {
    return actions + '<div class="tinv-empty">No sessions sent with a date in ' + esc(pLabel(period)) + '.' +
      (monthsWithData.length ? '<br>Months with teaching: ' + monthsWithData.slice(0, 6).map((m) =>
        '<button class="tinv-fix" data-tinv="goto" data-m="' + m + '">' + esc(monthLabel(m)) + '</button>').join(' · ') : '') + '</div>';
  }
  return actions +
    '<div class="tinv-sum"><span><b>' + lines.length + '</b> student' + (lines.length === 1 ? '' : 's') + ' taught</span>' +
      '<span><b>' + sessions + '</b> sessions</span><span><b>' + hm(billed) + '</b> billed</span>' +
      '<span>Still due <b class="mono">' + (curs.length > 1 ? 'mixed currencies' : esc(money(Math.round(due), curs[0] || ''))) + '</b></span>' +
      '<span class="def">Default: ' + (d.amount ? esc(money(parseFloat(d.amount), d.currency || '')) + ' / hour' : 'no rate set') +
        ' · ' + (defStep > 1 ? 'round up to ' + esc(b.stepText(defStep)) + ' per session' : 'billed as recorded') + '</span></div>' +
    '<div class="tinv-tbl" role="table">' +
      '<div class="tinv-r h" role="row"><span>Student · Bill to</span><span>Sessions</span><span>Recorded</span><span>Billed</span>' +
        '<span>Rate / hour</span><span class="r">Amount</span><span style="padding-left:6px;">Status</span><span></span></div>' +
      lines.map(rowHtml).join('') +
    '</div>' +
    '<span class="tinv-note">Times come from sessions you sent, by the date on the session. Rates, “bill to”, payment details and status are kept on this device.' +
      (data.truncated ? ' Only the first 1000 sessions of this period are itemised' + (isRange ? ', so a long range may be missing some.' : '.') : '') + '</span>';
}

function docHtml(L) {
  const p = payment();
  const t = bill().teacher() || {};
  const from = p.from || t.name || '';
  const issued = new Date();
  const dueD = new Date(issued.getTime() + (parseInt(p.due, 10) || 10) * 86400000);
  const cur = L.currency;
  const rateN = parseFloat(L.rate.amount);
  const rows = L.rows.map((x) => {
    const bs = bill().billedSec(x.duration_sec || 0, L.step);
    return '<tr><td>' + esc(x.date_ymd ? new Date(x.date_ymd + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '') + '</td>' +
      '<td>' + esc(x.session_name || 'Lesson') + (x.stages ? ' <span class="dim">' + esc(stageText(x.stages)) + '</span>' : '') + '</td>' +
      '<td class="n">' + (x.duration_sec == null ? '<span class="dim">untimed</span>' : esc(hm(x.duration_sec))) + '</td>' +
      '<td class="n">' + esc(hm(bs)) + '</td></tr>';
  }).join('');
  return '<div class="tinv-doc">' +
    '<div class="brand"><b>TEHFĪZ</b><i></i><span>INVOICE</span></div>' +
    '<div class="two"><div>' +
        '<span class="lab">Bill to</span><span class="big">' + esc(L.billTo || '[Who to bill]') + '</span>' +
        '<span class="t">For ' + esc(L.s.name || 'student') + (L.s.code ? ' · ' + esc(L.s.code) : '') + '</span>' +
        '<span class="lab">Billing period</span><span class="t" style="color:#17191c;font-size:16px;font-weight:500;">' + esc(L.periodLabel) + '</span>' +
        '<span class="t mono">' + esc(L.ref) + '</span>' +
      '</div><div class="rt">' +
        '<span class="lab">From</span><span class="t" style="color:#17191c;font-weight:600;font-size:16px;">' + esc(from) + '</span>' +
        (t.email ? '<span class="t">' + esc(t.email) + '</span>' : '') +
        (p.phone ? '<span class="t">' + esc(p.phone) + '</span>' : '') +
        '<span class="lab">Issued · Due</span><span class="t" style="color:#17191c;">' + esc(dlong(issued)) + ' · ' + esc(dlong(dueD)) + '</span>' +
      '</div></div>' +
    '<table><thead><tr><th>Date</th><th>Lesson</th><th class="n">Recorded</th><th class="n">Billed</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4" class="dim">No individual sessions recorded.</td></tr>') + '</tbody></table>' +
    '<div class="tot">' +
      '<div><span>Sessions</span><span class="mono">' + L.sessions + '</span></div>' +
      '<div><span>Time recorded</span><span class="mono">' + esc(hm(L.recorded)) + '</span></div>' +
      '<div><span>Billed' + (L.step > 1 ? ' <span style="color:#626973;">(each session rounded up to ' + esc(bill().stepText(L.step)) + ')</span>' : '') +
        '</span><span class="mono">' + (L.billed / 3600).toFixed(2) + ' h</span></div>' +
      '<div><span>Rate</span><span class="mono">' + (Number.isFinite(rateN) && rateN > 0 ? esc(money2(rateN, cur)) + ' / hour' : '—') + '</span></div>' +
      '<div class="due"><span>Amount due</span><span class="mono">' + (L.amount == null ? '—' : esc(money2(L.amount, cur))) + '</span></div>' +
    '</div>' +
    (L.untimed ? '<div class="warn">' + L.untimed + ' session' + (L.untimed === 1 ? '' : 's') + ' had no timer running and count as no time.</div>' : '') +
    (p.howto ? '<div class="pay"><span class="lab" style="margin:0;">How to pay</span>' + esc(p.howto) +
      '<span>Please quote <b class="mono" style="font-weight:500;">' + esc(L.ref) + '</b> as the reference.</span></div>' : '') +
    '<div class="ft"><span>Covers sessions sent to this student with a recorded date.</span><span>tehfiz.com</span></div>' +
  '</div>';
}
function stageText(stages) {
  return String(stages || '').split(',').map((x) => x.trim()).filter(Boolean)
    .map((x) => (typeof sessionTypeLabel === 'function' ? sessionTypeLabel(x) : x)).join(' · ');
}

function defaultsHtml() {
  const b = bill(), d = b.defaults(), pr = b.profileRate(), p = payment();
  return '<div class="tinv-dlg"><div class="scrim" data-tinv="dlg-close"></div>' +
    '<div class="tinv-card" role="dialog" aria-modal="true" aria-labelledby="tinvDefT"><h3 id="tinvDefT">Billing defaults</h3>' +
    '<div class="row">' +
      '<label class="tinv-f">Rate / hour<input id="tinvDAmount" inputmode="decimal" value="' + esc(d.amount || '') + '" placeholder="' + esc(pr.amount ? 'profile: ' + pr.amount : 'e.g. 2000') + '"></label>' +
      '<label class="tinv-f">Currency<input id="tinvDCur" value="' + esc(d.currency || '') + '" placeholder="' + esc(pr.currency || 'PKR') + '"></label>' +
      '<label class="tinv-f">Round each session up to (min)<input id="tinvDStep" inputmode="numeric" value="' + esc(d.step || '') + '" placeholder="1 = as recorded"></label>' +
    '</div>' +
    '<div class="row">' +
      '<label class="tinv-f">Your name on invoices<input id="tinvDFrom" value="' + esc(p.from) + '" placeholder="' + esc((b.teacher() || {}).name || '') + '"></label>' +
      '<label class="tinv-f">Phone<input id="tinvDPhone" value="' + esc(p.phone) + '" placeholder="Optional"></label>' +
      '<label class="tinv-f">Days to pay<input id="tinvDDue" inputmode="numeric" value="' + esc(p.due) + '"></label>' +
    '</div>' +
    '<label class="tinv-f">How to pay<textarea id="tinvDHow" placeholder="Bank transfer to [bank] · [account title] · IBAN […]">' + esc(p.howto) + '</textarea></label>' +
    '<span class="tinv-note">Printed on every invoice, with the reference to quote. Kept on this device only.</span>' +
    '<div class="foot"><button class="tinv-btn" data-tinv="dlg-close">Cancel</button><button class="tinv-btn pri" data-tinv="defaults-save">Save</button></div>' +
    '</div></div>';
}
function previewHtml(L) {
  return '<div class="tinv-dlg"><div class="scrim" data-tinv="dlg-close"></div>' +
    '<div class="tinv-card tinv-pv" role="dialog" aria-modal="true" aria-label="Invoice preview">' +
      '<div class="pvbar"><b>' + esc(L.s.name || L.s.code) + ' · ' + esc(L.periodLabel) + '</b><span style="display:flex;gap:8px;">' +
        '<button class="tinv-btn" data-tinv="dlg-close">Close</button>' +
        '<button class="tinv-btn pri" data-tinv="print-preview"' + (L.amount == null || L.free ? ' disabled' : '') + '>Print</button></span></div>' +
      '<div class="pvpage">' + docHtml(L) + '</div>' +
    '</div></div>';
}

function render() {
  let root = $('tinvRoot');
  if (!root) { root = document.createElement('div'); root.id = 'tinvRoot'; document.body.appendChild(root);
               root.addEventListener('click', onClick); root.addEventListener('change', onChange); }
  let dlg = '';
  if (showDefaults) dlg = defaultsHtml();
  else if (preview) dlg = previewHtml(preview);
  // A Profile can open the preview without this screen: then it is all there is.
  if (!isOpen) { root.innerHTML = dlg; return; }
  const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tinvin : null;
  const focusSid = focusId ? document.activeElement.dataset.sid : null;
  const oldMain = root.querySelector('.tinv-main'), keep = oldMain ? oldMain.scrollTop : 0;
  root.innerHTML = '<div class="tinv" role="dialog" aria-modal="true" aria-label="Invoices">' +
    '<div class="tinv-bar"><button class="tinv-back" data-tinv="close">‹ Back</button><h1>Invoices</h1></div>' +
    '<div class="tinv-main"><div class="tinv-inner">' + (bill() ? mainHtml() : '') + '</div></div>' + dlg + '</div>';
  const newMain = root.querySelector('.tinv-main'); if (newMain && keep) newMain.scrollTop = keep;
  if (focusId) {
    const el = root.querySelector('[data-tinvin="' + focusId + '"][data-sid="' + focusSid + '"]');
    if (el) el.focus();
  }
}

/* ── printing ───────────────────────────────────────────────────────────── */
function printLines(lines) {
  if (!lines.length) return;
  let pr = $('tinvPrint');
  if (!pr) { pr = document.createElement('div'); pr.id = 'tinvPrint'; document.body.appendChild(pr); }
  pr.innerHTML = lines.map(docHtml).join('');
  document.body.classList.add('tinv-printing');
  /* i3: the browser names the saved PDF after document.title, so set it to the
     month and the student ("October 2026 - Yusuf"). Set here, on this device
     only, so the name never travels anywhere; restored once printing ends. */
  const prevTitle = document.title;
  const who = lines.length === 1 ? (lines[0].s.name || lines[0].s.code) : (lines.length + ' students');
  document.title = (lines[0].periodLabel + ' - ' + who).replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const done = () => {
    document.body.classList.remove('tinv-printing');
    document.title = prevTitle;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  const now = new Date().toISOString();
  lines.forEach((L) => {
    // The amount is kept with the status so a Profile can list past invoices.
    setStatus(L.sid, { printed: L.status.printed || now, amount: L.amount, cur: L.currency, label: L.periodLabel }, L.period);
    noteEnd(L.sid, L.period);
  });
  if (onChanged) onChanged();
  setTimeout(() => { window.print(); setTimeout(() => { done(); render(); }, 800); }, 60);
}

/* Paid — with or without having printed it (paid in cash, invoiced some other
   way). The amount and label are kept so the Profile's past invoices list it,
   and a paid period counts as invoiced for the next custom range. */
function markPaid(L, on) {
  if (!on) { setStatus(L.sid, { paid: null }, L.period); return; }
  setStatus(L.sid, { paid: new Date().toISOString(), amount: L.amount, cur: L.currency, label: L.periodLabel }, L.period);
  noteEnd(L.sid, L.period);
}

/* ── events ─────────────────────────────────────────────────────────────── */
function onClick(e) {
  const t = e.target.closest('[data-tinv]');
  if (!t) return;
  const a = t.dataset.tinv, sid = t.dataset.sid;
  if (a === 'close') return close();
  if (a === 'mode-month') { if (period.kind !== 'month') loadMonth(month || ymNow()); return; }
  if (a === 'mode-range') { if (period.kind !== 'range') loadPeriod(defaultRange(null)); return; }
  if (a === 'profile') { if (window.TehfizProfile) window.TehfizProfile.open(sid, 'billing'); return; }
  if (a === 'print-preview') {
    const L = preview; if (!L) return;
    if (!L.billTo) { toast('Add who to bill first'); return; }
    preview = null; render(); return printLines([L]);
  }
  if (a === 'prev') return loadMonth(ymAdd(month, -1));
  if (a === 'next') return loadMonth(ymAdd(month, 1));
  if (a === 'goto') return loadMonth(t.dataset.m);
  if (a === 'defaults') { showDefaults = true; return render(); }
  if (a === 'dlg-close') { showDefaults = false; preview = null; return render(); }
  if (a === 'defaults-save') {
    const v = (id) => ($(id) || {}).value || '';
    const step = parseInt(v('tinvDStep'), 10);
    bill().setDefaults({ amount: v('tinvDAmount').trim().replace(/[, ]/g, ''), currency: v('tinvDCur').trim().slice(0, 6),
                         step: Number.isFinite(step) && step >= 1 ? String(Math.min(step, 240)) : '' });
    writeJ(K_PAY, { from: v('tinvDFrom').trim(), phone: v('tinvDPhone').trim(),
                    due: Math.max(0, Math.min(90, parseInt(v('tinvDDue'), 10) || 10)), howto: v('tinvDHow').trim() });
    showDefaults = false; toast('Billing defaults saved'); render(); if (onChanged) onChanged(); return;
  }
  if (a === 'edit') { editing = editing === sid ? null : sid; return render(); }
  if (a === 'edit-done') { editing = null; return render(); }
  if (a === 'preview') { const r = data.rows.find((x) => x.sid === sid); preview = r ? lineFor(r) : null; return render(); }
  if (a === 'paid') { const r = data.rows.find((x) => x.sid === sid); if (r) markPaid(lineFor(r), true); return render(); }
  if (a === 'unpaid') { setStatus(sid, { paid: null }); return render(); }
  if (a === 'fix') {
    try { localStorage.setItem('tehfiz_sent_student', sid); } catch {}
    close();
    if (typeof openSessions === 'function') openSessions();
    toast('Open the untimed session, set the time in the session header, then send it again');
    return;
  }
  if (a === 'print') {
    const r = data.rows.find((x) => x.sid === sid); if (!r) return;
    const L = lineFor(r);
    if (!L.billTo) { editing = sid; preview = null; render(); toast('Add who to bill first'); return; }
    preview = null; render();
    return printLines([L]);
  }
  if (a === 'printall') {
    const lines = data.rows.map((r) => lineFor(r)).filter((L) => !L.free && L.amount != null);
    const missing = lines.filter((L) => !L.billTo).length;
    if (missing) toast(missing + ' invoice' + (missing === 1 ? ' has' : 's have') + ' no “bill to” yet');
    return printLines(lines);
  }
}
function onChange(e) {
  const el = e.target, f = el.dataset.tinvin, sid = el.dataset.sid;
  if (!f) return;
  if (f === 'from' || f === 'to') {
    const from = f === 'from' ? el.value : period.from, to = f === 'to' ? el.value : period.to;
    if (okYmd(from) && okYmd(to)) loadPeriod(rangePeriod(from, to));
    return;
  }
  if (f === 'billto') {
    const all = readJ(K_BILLTO, {}); all[sid] = el.value.trim(); if (!all[sid]) delete all[sid]; writeJ(K_BILLTO, all);
  } else if (f === 'amount') bill().setStored(sid, { amount: el.value.trim().replace(/[, ]/g, '') || undefined });
  else if (f === 'currency') bill().setStored(sid, { currency: el.value.trim().slice(0, 6) || undefined });
  else if (f === 'step') {
    const n = parseInt(el.value, 10);
    bill().setStored(sid, { step: Number.isFinite(n) && n >= 1 ? String(Math.min(n, 240)) : undefined, unit: undefined });
  } else if (f === 'free') bill().setStored(sid, { amount: el.checked ? '0' : undefined });
  render();
}
document.addEventListener('keydown', (e) => {
  if (!isOpen && !preview && !showDefaults) return;
  // A Profile opened from this screen sits on top, unless an invoice preview is over it.
  if (!preview && !showDefaults && window.TehfizProfile && window.TehfizProfile.isOpen()) return;
  if (!isOpen) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); preview = null; showDefaults = false; render(); } return; }
  if (e.key === 'Escape') {
    e.stopPropagation(); e.preventDefault();
    if (showDefaults || preview) { showDefaults = false; preview = null; render(); } else close();
    return;
  }
  e.stopPropagation();   // the app's single-key shortcuts stay quiet behind this screen
}, true);

/* ── open / close ───────────────────────────────────────────────────────── */
async function open() {
  injectCss();
  if (!(sync() && sync().isSignedIn && sync().isSignedIn())) {
    toast('Sign in to see invoices — they are built from the sessions you have sent');
    if (sync()) sync().open();
    return;
  }
  isOpen = true; editing = null; preview = null; showDefaults = false;
  loading = true; month = month || ymNow(); period = period || monthPeriod(month); render();
  await Promise.all([loadMonths(), bill().loadProfile().catch(() => {})]);
  if (period.kind === 'range') await loadPeriod(period);
  else await loadMonth(defaultMonth());
}
function close() { isOpen = false; render(); }

/* ── for one student (the Billing tab of profile.js) ────────────────────── */
let onChanged = null;     // the Profile re-renders after a print or a status change
const forStudent = {
  monthPeriod, rangePeriod, defaultRange, label: pLabel, today: ymdToday, lastEnd,
  // Everything the tab shows for this student in this period, or null when
  // nothing was taught in it. Fetched fresh: the tab is opened rarely.
  async line(sid, p) {
    injectCss();
    const d = await fetchPeriod(p);
    const r = d.rows.find((x) => x.sid === sid);
    return r ? lineFor(r, d, p) : null;
  },
  preview(L) { injectCss(); preview = L; showDefaults = false; render(); },
  print(L) { injectCss(); if (!L.billTo) { toast('Add who to bill first'); return false; } printLines([L]); return true; },
  setPaid(L, on) { markPaid(L, on); if (onChanged) onChanged(); },
  // Past invoices: every period this student has a printed or paid status for.
  history(sid) {
    const all = readJ(K_STATUS, {}), out = [];
    Object.keys(all).forEach((k) => {
      const i = k.lastIndexOf('|'); if (k.slice(i + 1) !== sid) return;
      const key = k.slice(0, i), v = all[k] || {};
      if (!v.printed && !v.paid) return;
      const p = key.includes('..') ? rangePeriod(key.split('..')[0], key.split('..')[1]) : monthPeriod(key);
      out.push({ key, period: p, label: v.label || pLabel(p), printed: v.printed || null, paid: v.paid || null,
                 amount: v.amount == null ? null : v.amount, cur: v.cur || '' });
    });
    return out.sort((a, b) => pTo(b.period).localeCompare(pTo(a.period)));
  },
  billTo, setBillTo(sid, v) {
    const all = readJ(K_BILLTO, {}); all[sid] = String(v || '').trim(); if (!all[sid]) delete all[sid]; writeJ(K_BILLTO, all);
  },
  // Hours by month for one student (newest first), for the tab's month list.
  async months(sid) {
    const d = await sync().api('/api/sessions/hours');
    return (d.months || []).filter((x) => x.student_id === sid).sort((a, b) => b.month.localeCompare(a.month));
  },
  // The Billing defaults dialog on its own, over a Profile (i6).
  openDefaults() { injectCss(); preview = null; showDefaults = true; render(); },
  hm, money, onChange(fn) { onChanged = fn; },
};

window.TehfizInvoices = { open, close, forStudent, version: TEHFIZ_INVOICES_VERSION };
})();
