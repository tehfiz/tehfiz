/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-time.js — TehfizTime — t2
   Loaded by the teacher app and the student viewer, from
   /app/shared/tehfiz-time.js?v=t2.

   t2: "my" zone can come from the app (window.tehfizMyTz — the teacher app
   passes its Settings time zone), single lessons carry a plan, a note and
   `replaces` like the next lesson does, and a replaced lesson is left out
   wherever the lesson that replaced it is.

   Time zones and lesson times, in one place so both apps agree.

   A timetable (one student, one teacher) has three parts that sit side by
   side and never replace one another:
     slots        weekly lesson days, {"1":{"t":"17:00","len":45}}, 0 = Sunday,
                  as wall times in `tz` (the teacher's zone; null = this
                  device's zone, which is how timetables saved before 0009 read)
     lessons      single lessons the teacher scheduled by hand, [{at, len}],
                  exact moments
     next_lesson  the next lesson set from Finish session (or edited on the
                  Profile or the calendar), {at, len, new, recent, old, note,
                  replaces?}, an exact moment. `replaces` is the weekly or
                  single lesson it was moved from, which is then not shown.
   occurrences() lays all three out between two moments. Two that fall on the
   same minute are one lesson: the next lesson's details win, then the single
   lesson's length, then the weekly slot's.

   No dependencies. Uses Intl only; a browser without a zone database falls
   back to this device's zone.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_TIME_VERSION = 't2';
const DAY = 86400000;

function deviceTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
function myTz() {
  try { if (typeof window.tehfizMyTz === 'function') { const z = window.tehfizMyTz(); if (z && validTz(z)) return z; } } catch {}
  return deviceTz();
}
function validTz(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/* Wall-clock parts of a moment in a zone. */
const fmtCache = {};
function partsFmt(tz) {
  if (!fmtCache[tz]) {
    fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
  }
  return fmtCache[tz];
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function partsIn(ms, tz) {
  if (!validTz(tz)) {
    const d = new Date(ms);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), wd: d.getDay() };
  }
  const o = {};
  partsFmt(tz).formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}
/* Minutes the zone is ahead of UTC at that moment. */
function offsetMin(ms, tz) {
  const p = partsIn(ms, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}
/* The moment a wall time in a zone happens. Two passes settle DST edges. */
function zonedToMs(y, mo, d, h, mi, tz) {
  if (!validTz(tz)) return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetMin(guess, tz) * 60000;
  ms = guess - offsetMin(ms, tz) * 60000;
  return ms;
}

/* ── words ──────────────────────────────────────────────────────────────── */
function city(tz) {
  if (!tz) return '';
  const last = String(tz).split('/').pop();
  return last.replace(/_/g, ' ');
}
function gmt(ms, tz) {
  const m = offsetMin(ms, tz), s = m < 0 ? '−' : '+', a = Math.abs(m);
  return 'GMT' + s + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
}
/* "London (GMT+0)" */
function tzLabel(tz, ms) { return tz ? city(tz) + ' (' + gmt(ms || Date.now(), tz) + ')' : ''; }
/* "5 hours behind you", "the same time as you", "30 min ahead of you" */
function diffText(tz, ms, from) {
  const t = ms || Date.now();
  const d = offsetMin(t, tz) - offsetMin(t, from || myTz());
  if (!d) return 'the same time as you';
  const a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
  const amt = (h ? h + ' hour' + (h === 1 ? '' : 's') : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  return amt + (d < 0 ? ' behind you' : ' ahead of you');
}
function sameOffset(a, b, ms) { return offsetMin(ms || Date.now(), a) === offsetMin(ms || Date.now(), b); }

function timeText(ms, tz) {
  try { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...(validTz(tz) ? { timeZone: tz } : {}) }); }
  catch { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
}
/* "Today", "Tomorrow" or "Mon 9 Nov", for that zone's calendar. */
function dayText(ms, tz, now) {
  const a = partsIn(now || Date.now(), tz), b = partsIn(ms, tz);
  const n = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  try { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(validTz(tz) ? { timeZone: tz } : {}) }); }
  catch { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
}
/* "Tomorrow · 5:00 PM" */
function whenText(ms, tz, now) { return dayText(ms, tz, now) + ' · ' + timeText(ms, tz); }
function weekdayShort(ms, tz) {
  try { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', ...(validTz(tz) ? { timeZone: tz } : {}) }); }
  catch { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ms).getDay()]; }
}

/* Zones to choose from: the browser's full list where it has one. */
let zoneList = null;
function zones() {
  if (zoneList) return zoneList;
  let z = [];
  try { if (Intl.supportedValuesOf) z = Intl.supportedValuesOf('timeZone'); } catch {}
  if (!z.length) z = ['UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'America/Chicago', 'America/Los_Angeles', 'America/New_York',
    'America/Toronto', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Jakarta', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Riyadh',
    'Asia/Singapore', 'Australia/Sydney', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/London', 'Europe/Paris'];
  zoneList = z.slice().sort();
  return zoneList;
}

/* ── lessons ────────────────────────────────────────────────────────────── */
function slotAt(slots, wd) { return slots ? (slots[wd] || slots[String(wd)] || null) : null; }

/* Every lesson of one timetable that STARTS between `from` and `to` (ms). */
function occurrences(tt, from, to) {
  if (!tt) return [];
  const tz = validTz(tt.tz) ? tt.tz : myTz();
  const byMs = new Map();
  // Moments some other lesson was moved away from — wherever that lesson now is.
  const gone = new Set();
  const noteGone = (x) => { const r = x && x.replaces ? Date.parse(x.replaces) : NaN; if (Number.isFinite(r) && r !== Date.parse(x.at)) gone.add(r); };
  (Array.isArray(tt.lessons) ? tt.lessons : []).forEach(noteGone);
  noteGone(tt.next_lesson);
  const add = (o) => {
    const prev = byMs.get(o.at);
    if (!prev) { byMs.set(o.at, o); return; }
    const rank = { set: 3, single: 2, weekly: 1 };
    const hi = rank[o.kind] > rank[prev.kind] ? o : prev, lo = hi === o ? prev : o;
    byMs.set(o.at, { ...lo, ...hi, len: hi.len || lo.len, also: (prev.also || []).concat(prev.kind, o.kind).filter((k) => k !== hi.kind) });
  };
  // weekly: walk the days in the slots' own zone
  if (tt.slots && Object.keys(tt.slots).length) {
    const p0 = partsIn(from - DAY, tz);
    for (let i = 0; i <= Math.ceil((to - from) / DAY) + 2; i++) {
      const base = Date.UTC(p0.y, p0.mo - 1, p0.d + i);
      const dd = new Date(base), wd = dd.getUTCDay();
      const s = slotAt(tt.slots, wd);
      if (!s || !/^\d{1,2}:\d{2}$/.test(String(s.t || ''))) continue;
      const [h, m] = String(s.t).split(':').map(Number);
      const at = zonedToMs(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate(), h, m, tz);
      if (at >= from && at < to && !gone.has(at)) add({ at, len: +s.len || 0, kind: 'weekly', wd });
    }
  }
  (Array.isArray(tt.lessons) ? tt.lessons : []).forEach((l) => {
    const at = Date.parse(l && l.at);
    if (Number.isFinite(at) && at >= from && at < to && !gone.has(at)) {
      add({ at, len: +l.len || 0, kind: 'single', orig: l.at, ...(l.plan ? { plan: l.plan } : {}), ...(l.note ? { note: l.note } : {}),
            ...(l.replaces ? { replaces: l.replaces } : {}) });
    }
  });
  const n = tt.next_lesson;
  if (n && n.at) {
    const at = Date.parse(n.at);
    if (Number.isFinite(at) && at >= from && at < to) {
      add({ at, len: +n.len || 0, kind: 'set', new: n.new || '', recent: n.recent || '', old: n.old || '', note: n.note || '',
            ...(n.plan ? { plan: n.plan } : {}), ...(n.replaces ? { replaces: n.replaces } : {}) });
    }
  }
  return [...byMs.values()].sort((a, b) => a.at - b.at);
}
/* The next lesson that has not finished yet (one under way still counts). */
function next(tt, now) {
  const t = now || Date.now();
  const list = occurrences(tt, t - 4 * 3600000, t + 15 * DAY);
  return list.find((o) => o.at + Math.max(o.len || 30, 1) * 60000 > t) || null;
}
/* A weekly slot as wall time somewhere else: {wd, t, dayShift} for the zone
   `to`, using its next occurrence (so DST is the one in force then). */
function slotIn(wd, t, fromTz, toTz, now) {
  const tt = { slots: { [wd]: { t, len: 0 } }, tz: fromTz };
  const o = occurrences(tt, now || Date.now(), (now || Date.now()) + 8 * DAY)[0];
  if (!o) return null;
  const p = partsIn(o.at, toTz);
  return { at: o.at, wd: p.wd, t: String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'), dayShift: p.wd !== +wd };
}

/* What a lesson covers, in a line: its plan if it has one ("New p. 37 ·
   Recent Juz 2 · Spot test Juz 1"), else the older New/Recent/Old text.
   `stage` names a stage id (the apps pass sessionTypeLabel). */
function planText(o, stage) {
  if (!o) return '';
  const lab = (id) => (typeof stage === 'function' ? stage(id) : id);
  if (Array.isArray(o.plan) && o.plan.length) {
    return o.plan.map((s) => (s.mode === 'spot' ? 'Spot test ' : (s.type && s.type !== 'unassigned' ? lab(s.type) + ' ' : '')) +
      (s.label || s.text || (s.start ? s.start + '\u2013' + s.end : ''))).join(' \u00b7 ');
  }
  return [['New', o.new], ['Recent', o.recent], ['Old', o.old]].filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(' \u00b7 ');
}
/* An older lesson's New/Recent/Old text as a plan, so one editor handles both. */
function planOf(o) {
  if (!o) return [];
  if (Array.isArray(o.plan)) return o.plan.map((s) => ({ ...s }));
  return [['new', o.new], ['recent', o.recent], ['old', o.old]].filter(([, v]) => v && String(v).trim())
    .map(([type, v]) => ({ type, mode: 'recite', text: String(v).trim() }));
}

window.TehfizTime = { myTz, deviceTz, planText, planOf, validTz, partsIn, offsetMin, zonedToMs, city, tzLabel, diffText, sameOffset,
  timeText, dayText, whenText, weekdayShort, zones, occurrences, next, slotIn, version: TEHFIZ_TIME_VERSION };
})();
