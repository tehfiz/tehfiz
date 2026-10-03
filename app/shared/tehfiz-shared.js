/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-shared.js — s4
   Loaded by BOTH apps (teacher /app/teacher/, viewer /app/student/) before
   their own scripts, from /app/shared/tehfiz-shared.js?v=s4.

   What is here: every top-level `function` and `const` that was identical
   (token for token) in the two apps — the tajweed tables and rule helpers,
   mistake types and levels, verse/page/juz arithmetic, ruku tables, strength
   scoring, review charts — plus the theme picker (TehfizTheme).

   What is NOT here: anything the two apps do differently (getType, by design),
   and mutable `let` state, which stays in each app.

   Rules for editing:
   · A change here changes BOTH apps. That is the point; test both.
   · Bump SV below AND the ?v= in both apps' <script>/<link> tags together, or
     browsers keep serving the old copy. vcheck checks they agree.
   · Nothing here may run against the page at load time: this file runs in the
     <head>, before <body> exists. Declarations and pure tables only.
   ═══════════════════════════════════════════════════════════════════════ */
const TEHFIZ_SHARED_VERSION = 's4';

// ── sessionName vs. the legacy `range` key ────────────────────────
// v3 and earlier stored the (optional) session name under `range`, a leftover
// from when that field described the passage covered. Segments own that job
// now, so the key was renamed to `sessionName` in v4.
//
// Migration is deliberately two-sided and not yet finished:
//   READ  — always through sessionNameOf(), which falls back to `range`, so
//           every .qrs ever written keeps working.
//   WRITE — buildSessionObj emits BOTH keys for now. The apps update
//           independently, so a teacher on v4 must not hand a student on an
//           older viewer a file whose label has vanished.
// Drop the `range` mirror only once the viewer in the wild is known to read
// sessionName — until then it is cheap insurance, not dead weight.
function sessionNameOf(s){ return (s && (s.sessionName ?? s.range)) || ''; }

const SURAH_NAMES = ["Al-Fatihah","Al-Baqarah","Ali 'Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus","Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha","Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-'Ankabut","Ar-Rum","Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir","Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf","Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahanah","As-Saf","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij","Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","'Abasa","At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad","Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-'Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-'Adiyat","Al-Qari'ah","At-Takathur","Al-'Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr","Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas"];

const AR_NAMES = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

// Ayahs per surah, Hafs/Kufan numbering. 114 entries summing to 6236 —
// asserted below, because a silent corruption here (this table previously
// held 125 entries with wrong values from surah 78 on) breaks the position
// readout, the jump tool's max validation, and all segment verse maths.
const AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

const JUZ_PAGES = [1,22,42,62,82,102,122,142,162,182,202,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];

// ═══════════════════════════════════════════════════════════════════
// MISTAKE TYPES — curated library + teacher-editable active list
// ═══════════════════════════════════════════════════════════════════
// Stable ids that never change meaning once assigned: sessions reference
// types by id, so enabling/disabling/reordering must never silently repoint
// an existing id at a different type — that's why these aren't m1-m6 anymore;
// a positional scheme breaks the moment the list becomes variable-length.
// "other" is a special always-on catch-all: not part of the curated library,
// not counted against the per-category cap, always shown regardless of
// which category tab is active.
const MISTAKE_TYPE_LIBRARY = [
  {id:'hesitation',      label:'Hesitation', category:'tehfiz'},
  {id:'wrong-word',      label:'Wrong word', category:'tehfiz'},
  {id:'skipped',         label:'Skipped',    category:'tehfiz'},
  {id:'added-word',      label:'Added word', category:'tehfiz'},
  {id:'word-order',      label:'Word order', category:'tehfiz'},
  {id:'harakaat',        label:'Wrong harakah', category:'tehfiz'},
  {id:'makhraj',         label:'Makhraj',    category:'tajweed'},
  {id:'tajweed-general', label:'Tajweed',    category:'tajweed'},
  {id:'madd',            label:'Madd',       category:'tajweed'},
  {id:'ghunnah',         label:'Ghunnah',    category:'tajweed'},
  {id:'qalqalah',        label:'Qalqalah',   category:'tajweed'},
];

const MISTAKE_TYPE_OTHER = {id:'other', label:'Other', category:'other', color:'', bgColor:'var(--parchment3)', borderColor:'var(--border2)'};

// Frozen definitions for the old m1-m6 scheme — kept ONLY so mistakes from
// sessions saved before this feature existed (with no embedded typeConfig at
// all) still resolve to something sensible. Never shown in the active list.
const LEGACY_TYPE_FALLBACK = {
  m1:{id:'m1', label:'Hesitation', category:'tehfiz',  color:'var(--amber)', bgColor:'var(--amber-bg)', borderColor:'var(--amber)'},
  m2:{id:'m2', label:'Wrong word', category:'tehfiz',  color:'var(--red)',   bgColor:'var(--red-bg)',   borderColor:'var(--red)'},
  m3:{id:'m3', label:'Skipped',    category:'tehfiz',  color:'var(--coral)', bgColor:'var(--coral-bg)', borderColor:'var(--coral)'},
  m4:{id:'m4', label:'Makhraj',    category:'tajweed', color:'var(--purple)',bgColor:'var(--purple-bg)',borderColor:'var(--purple)'},
  m5:{id:'m5', label:'Tajweed',    category:'tajweed', color:'var(--teal)',  bgColor:'var(--teal-bg)',  borderColor:'var(--teal)'},
  m6:{id:'m6', label:'Other',      category:'other',   color:'',             bgColor:'var(--parchment3)',borderColor:'var(--border2)'},
};

const CORRECTION_TYPES = [
  {id:'c0', label:'Lvl 0 · No intervention', shortLabel:'Lvl 0', cssClass:'c0'},
  {id:'c1', label:'Lvl 1 · Repeat',          shortLabel:'Lvl 1', cssClass:'c1'},
  {id:'c2', label:'Lvl 2 · Hint',            shortLabel:'Lvl 2', cssClass:'c2'},
  {id:'c3', label:'Lvl 3 · Taught',          shortLabel:'Lvl 3', cssClass:'c3'},
  {id:'c4', label:'◌ Other',                 shortLabel:'Other', cssClass:'c4'},
];

// Migration map — translates old .qrs IDs (pre-dating even the m1-m6 scheme)
// straight to the new stable ids, so very old files benefit from whatever the
// live catalog looks like now rather than being stuck on frozen legacy labels.
const ID_MIGRATION = {
  pause:'hesitation', error:'wrong-word', skip:'skipped',
  makhraj:'makhraj', tajweed:'tajweed-general', other:'other',
  self:'c1', prompted:'c2', teacher:'c3'
};

function getCorr(id)  { return CORRECTION_TYPES.find(c=>c.id===id) || CORRECTION_TYPES[0]; }

function migrateId(id){ return ID_MIGRATION[id] || id; }

function migrateMistakes(mistakes){
  return (mistakes||[]).map(m=>({...m, type:migrateId(m.type), correction:migrateId(m.correction)}));
}

// Resolve a full type object (id/label/color/bgColor) from a session's
// embedded typeConfig first, falling back to the live global catalog — a
// session's own snapshot always wins so historical data keeps displaying
// exactly as it was logged, even after the live catalog changes later.
// `category` only started being serialised into a session's typeConfig at
// v4_252 / v1_129. Every earlier session therefore has entries that match by
// id and then answer `undefined` when asked which category they belong to —
// and resolveType returned them bare, so isTajweedMistake() was false for
// every tajweed mistake in every historical session. Call sites that passed
// NO cfg resolved correctly through the library, so correctness depended on
// whether a cfg happened to be threaded: the opposite of a safe default.
//
// Fill only the gap, per DESIGN_tajweed_split.md §2.2:
//   standard ids  -> the curated library, exact
//   legacy m1-m6  -> LEGACY_TYPE_FALLBACK, exact
//   custom ids    -> 'other', never 'tehfiz'. The category lived only in that
//                    teacher's local catalog and is genuinely gone; guessing
//                    'tehfiz' would fold someone's custom tajweed type into
//                    the hifz score and change a stored number silently.
function _backfillCategory(id){
  const mid = migrateId(id);
  const lib = MISTAKE_TYPE_LIBRARY.find(t => t.id === mid);
  if(lib) return lib.category;
  const leg = LEGACY_TYPE_FALLBACK[mid];
  if(leg && leg.category) return leg.category;
  return 'other';
}

function resolveType(cfg, id){
  if(cfg?.mistakeTypes){
    const t=cfg.mistakeTypes.find(x=>x.id===id);
    // Only ever ADDS a missing category. Label, colour and everything else the
    // session recorded still win, so historical data displays as it was logged.
    if(t) return t.category ? t : {...t, category:_backfillCategory(id)};
  }
  return getType(id);
}

// Resolve labels from a session's embedded typeConfig, falling back to global defaults
function typeLabelFor(cfg, id){ return resolveType(cfg, id).label; }

function corrLabelFor(cfg, id){ if(cfg?.correctionTypes){const c=cfg.correctionTypes.find(c=>c.id===id);if(c)return c.label;} return getCorr(id).label; }

// Use per-mistake overrides (from "Other" text inputs) if present
function mTypeLabel(m, cfg){ return m.typeLabel || typeLabelFor(cfg||m.typeConfig||null, m.type); }

function mCorrLabel(m, cfg){ return m.corrLabel || corrLabelFor(cfg||m.typeConfig||null, m.correction); }

function typeLabel(id){return getType(id).label;}

// Inline-style fragments for a mistake type's color. Types are now a
// variable, teacher-editable list rather than a fixed set with hardcoded
// per-id CSS rules, so color is applied per-instance from the resolved type
// (live or from a session's own embedded config) instead of through a CSS class.
function typeBadgeStyle(cfg, id){
  const t = resolveType(cfg, id);
  return t.id==='other' ? `background:var(--parchment3);color:var(--ink2);` : `background:${t.bgColor};color:${t.color};`;
}

function typeWordStyle(cfg, id){
  const t = resolveType(cfg, id);
  return t.id==='other' ? `border-bottom:2px solid var(--ink3);` : `color:${t.color};border-bottom:2px solid ${t.color};`;
}

function typeDotStyle(cfg, id){
  const t = resolveType(cfg, id);
  return t.id==='other' ? `background:var(--ink3);` : `background:${t.color};`;
}

const corrClass2    = Object.fromEntries(CORRECTION_TYPES.map(c=>[c.id, c.cssClass]));

// ═══════════════════════════════════════════════════════════════════
// DOMAIN HELPERS — pure
// ───────────────────────────────────────────────────────────────────
// Nothing below touches the DOM or mutable app state: every function is a
// pure function of session/mistake data. Keep it that way. If the app is
// later split front/back, this block lifts out as a shared module verbatim
// and can render reports server-side without a browser.
// ═══════════════════════════════════════════════════════════════════

// Single source of truth for how an intervention level presents itself.
// Previously these three facets were four separate literal maps scattered
// across the review builder and the mistakes list, which drifted apart.
const SEVERITY = {
  c0:{cls:'sev-0',     color:'var(--green)',       bg:'var(--green-bg)'},
  c1:{cls:'sev-1',     color:'var(--lvl1-yellow)', bg:'var(--lvl1-yellow-bg)'},
  c2:{cls:'sev-2',     color:'var(--lvl2-orange)', bg:'var(--lvl2-orange-bg)'},
  c3:{cls:'sev-3',     color:'var(--red)',         bg:'var(--red-bg)'},
  c4:{cls:'sev-other', color:'var(--ink3)',        bg:'var(--parchment2)'},
  /* Not a level. Tajweed mistakes carry correction === null because
     intervention does not apply to them, and rendering that as sev-0 said
     "no intervention needed" — a positive claim the teacher never made. */
  tajweed:{cls:'sev-tajweed', color:'var(--tajweed)', bg:'var(--tajweed-bg)'},
};

// Unrecorded/absent correction reads as "no intervention" — matches how the
// tallies below bucket a missing correction.
function sev(corr){ return SEVERITY[corr] || SEVERITY.c0; }

// Count mistakes per intervention level. `c0` deliberately absorbs mistakes
// with no correction recorded at all.
// Intervention levels, for the "how much help was needed" breakdown.
//
// Tajweed mistakes are held out entirely. They carry correction === null
// because intervention does not apply to them, and the old `|| !m.correction`
// swept them into c0 — so a page of tajweed marks read as a page the student
// had recovered from unaided, which is the precise claim the null exists to
// avoid. They are returned as their own count rather than dropped, so the parts
// still add up to the whole.
//
// A LEGACY hifz mistake with no correction stored is still c0: that is a real
// gap in old data, not a tajweed mark.
function corrTally(mistakes){
  const ml = mistakes || [];
  const tj = ml.filter(m => isTajweedMistake(m));
  const hz = ml.filter(m => !isTajweedMistake(m));
  const n = id => hz.filter(m=>m.correction===id).length;
  return {
    total: ml.length,
    scored: hz.length,
    tajweed: tj.length,
    c0: hz.filter(m=>m.correction==='c0' || !m.correction).length,
    c1: n('c1'), c2: n('c2'), c3: n('c3'), c4: n('c4'),
  };
}

// Count spot-test outcomes. `none` = generated but never assessed.
function spotTally(spots){
  const sp = spots || [];
  const n = o => sp.filter(x=>x.outcome===o).length;
  return {
    total: sp.length,
    pass: n('pass'), partial: n('partial'), fail: n('fail'),
    none: sp.filter(x=>!x.outcome).length,
  };
}

// ── SESSION SEGMENTS ──────────────────────────────────────────────
// A session covers one or more continuous passages ("segments"), each tagged
// with what kind of revision it was. Ids are FIXED; only labels vary, so a
// teacher switching presets never rewrites what past sessions meant. Every
// segment carries a type — 'unassigned' is a real value, not a null — which
// keeps the analytics free of null branches and gives legacy files a sane home.
const SESSION_TYPE_PRESETS = {
  plain:       [{id:'unassigned',label:'Unassigned'},{id:'new',label:'New'},{id:'recent',label:'Recent'},{id:'old',label:'Old'}],
  traditional: [{id:'unassigned',label:'Unassigned'},{id:'new',label:'Sabaq'},{id:'recent',label:'Sabqi'},{id:'old',label:'Manzil'}],
};

// Absolute verse index (1..6236) so ranges can be measured across surah and
// juz boundaries with pure arithmetic — no API call, works offline.
const VERSE_CUM = (()=>{ const c=[0]; for(let i=0;i<AYAH_COUNTS.length;i++) c.push(c[i]+AYAH_COUNTS[i]); return c; })();

function absVerse(surah, ayah){ return (VERSE_CUM[surah-1]||0) + (ayah||0); }

function keyAbs(key){ if(!key) return null; const[s,a]=key.split(':').map(Number); return absVerse(s,a); }

function keyValid(key){ const n=keyAbs(key); return Number.isFinite(n) && n>0; }

// Verses spanned, inclusive. Null until both ends are known.
function segVerseCount(sg){
  if(!sg || !keyValid(sg.startKey) || !keyValid(sg.endKey)) return null;
  return Math.abs(keyAbs(sg.endKey) - keyAbs(sg.startKey)) + 1;
}

// A segment marked back-to-front is a teacher marking the end first, not an
// error — store the envelope so downstream code never sees a reversed span.
function segOrdered(sg){
  if(!keyValid(sg.startKey) || !keyValid(sg.endKey)) return sg;
  if(keyAbs(sg.startKey) <= keyAbs(sg.endKey)) return sg;
  return {...sg, startKey:sg.endKey, endKey:sg.startKey, startSrc:sg.endSrc, endSrc:sg.startSrc};
}

// Which segment does a verse belong to? First match wins, in creation order —
// overlapping segments are allowed and simply resolve to the earlier one.
function segForVerse(segs, surah, ayah){
  const v = absVerse(surah, ayah);
  for(const raw of (segs||[])){
    const sg = segOrdered(raw);
    if(!keyValid(sg.startKey) || !keyValid(sg.endKey)) continue;
    if(v >= keyAbs(sg.startKey) && v <= keyAbs(sg.endKey)) return raw;
  }
  return null;
}

// ── RANGE INPUT: units in, verse keys out ─────────────────────────
// Verse keys are the ONLY stored representation of a range. Juz / page / surah
// are input conveniences — a teacher shouldn't type "2:142" to mean "Juz 5" —
// so they're translated the moment they're entered and never persisted as such.
// Everything downstream (segments, spot generation, the gutter, analytics) sees
// verse keys and needs to know nothing about how they were typed.

// Inverse of absVerse(): absolute index → {surah, ayah}
function verseFromAbs(n){
  if(!Number.isFinite(n)) return null;
  n = Math.max(1, Math.min(6236, n));
  let lo=0, hi=113;
  while(lo<hi){ const mid=(lo+hi+1)>>1; if(VERSE_CUM[mid] < n) lo=mid; else hi=mid-1; }
  return {surah: lo+1, ayah: n - VERSE_CUM[lo]};
}

function keyFromAbs(n){ const v=verseFromAbs(n); return v?`${v.surah}:${v.ayah}`:null; }

// Loose match for surah names: case-insensitive and punctuation-blind, so
// "alkahf", "Al-Kahf" and "kahf" all resolve. Names carry apostrophes, hyphens
// and inconsistent transliteration, so exact matching is useless here.
function _normName(x){ return (x||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g,''); }

function surahMatches(query, limit){
  const q=_normName(query);
  const all=SURAH_NAMES.map((n,i)=>({num:i+1, name:n}));
  if(!q) return all.slice(0, limit||114);
  const alias=SURAH_ALIASES[q];
  const starts=[], contains=[];
  const seen=new Set();
  // Range + typeof guard: _normName('constructor') is a live key on
  // Object.prototype, and the bare lookup used to hand back the Object
  // constructor as if it were a surah number.
  const push=(arr,num)=>{ if(typeof num!=='number'||num<1||num>114||seen.has(num)) return;
    seen.add(num); arr.push({num, name:SURAH_NAMES[num-1]}); };
  push(starts, alias);
  all.forEach(x=>{
    if(seen.has(x.num)) return;
    const n=_normName(x.name);
    if(String(x.num)===q.replace(/\D/g,'') && q.replace(/\D/g,'')) push(starts,x.num);
    else if(n.startsWith(q)) push(starts,x.num);
    else if(n.includes(q)) push(contains,x.num);
  });
  // Aliases used to match only in FULL, so typing one walked through a dead
  // zone: "yas" found Ya-Sin by name, then "yase" and "yasee" matched neither
  // the canonical name nor the key "yaseen" and the list read "No match"
  // mid-word — which looks broken enough that you stop typing. Prefix-match the
  // keys as well. Appended last and de-duped through `seen`, so this is strictly
  // additive: it never reorders anything the old ranking already produced.
  const aliasPre=[];
  for(const k in SURAH_ALIASES){ if(k.startsWith(q)) push(aliasPre, SURAH_ALIASES[k]); }
  return [...starts, ...contains, ...aliasPre].slice(0, limit||114);
}

// Transliteration varies wildly; these are the spellings people actually type
// that no substring match on the canonical list would ever catch.
const SURAH_ALIASES = {
  // Null prototype. Without it, _normName('constructor') is a real inherited
  // key, so SURAH_ALIASES[q] hands back the Object constructor as though it
  // were a surah number — resolveSurahToken() passed that straight into
  // parseRangeInput(). Fixing it here covers every lookup site at once,
  // including any added later, rather than guarding each one.
  __proto__: null,
  yaseen:36, yasin:36, yasseen:36, taha:20, tahaa:20, fatiha:1, fateha:1,
  baqara:2, baqarah:2, imran:3, nisa:4, maida:5, anam:6, araf:7, kahaf:18,
  rahman:55, arrahman:55, waqia:56, waqiah:56, mulk:67, tabarak:67,
  naba:78, amma:78, ikhlas:112, falak:113, falaq:113, nas:114, ikhlaas:112,
  jumua:62, jumuah:62, kafirun:109, kaafiroon:109, dhuha:93, duha:93,
};

// ── Naming a range for humans ─────────────────────────────────────
// Verse keys are canonical but unreadable — "4:24 → 5:82" tells a student
// nothing. This finds the most meaningful description a range actually earns,
// in order of how a hafiz thinks about position, and only falls back to raw
// keys when the range genuinely doesn't line up with anything.
//
// Derived, not stored: it works for auto-filled and legacy-inferred ranges that
// never had a typed label, and it can't go stale the way a saved string would.
function _juzStartingAt(abs){
  for(let j=0;j<30;j++){ const v=JUZ_START_VERSES[j]; if(absVerse(v.s,v.a)===abs) return j+1; }
  return null;
}

function _juzEndingAt(abs){
  for(let j=0;j<30;j++){
    const end = j<29 ? absVerse(JUZ_START_VERSES[j+1].s, JUZ_START_VERSES[j+1].a)-1 : 6236;
    if(end===abs) return j+1;
  }
  return null;
}

function describeRange(startKey, endKey){
  if(!keyValid(startKey) || !keyValid(endKey)) return '';
  let a=keyAbs(startKey), b=keyAbs(endKey);
  if(a>b) [a,b]=[b,a];

  // 1. Whole juz — the unit hifz is actually organised around
  const j1=_juzStartingAt(a), j2=_juzEndingAt(b);
  if(j1 && j2 && j1<=j2) return j1===j2 ? `Juz ${j1}` : `Juz ${j1}–${j2}`;

  const v1=verseFromAbs(a), v2=verseFromAbs(b);
  const nm = n => SURAH_NAMES[n-1] || `Surah ${n}`;

  // 2. Whole surah(s)
  if(v1.ayah===1 && v2.ayah===(AYAH_COUNTS[v2.surah-1]||0))
    return v1.surah===v2.surah ? nm(v1.surah) : `${nm(v1.surah)} – ${nm(v2.surah)}`;

  // 3. Part of a single surah — still far more readable than two keys
  if(v1.surah===v2.surah) return `${nm(v1.surah)} ${v1.ayah}–${v2.ayah}`;

  // 4. Genuinely arbitrary: name both ends by surah rather than bare numbers
  return `${nm(v1.surah)} ${v1.ayah} – ${nm(v2.surah)} ${v2.ayah}`;
}

// ── MEMORIZATION STRENGTH ─────────────────────────────────────────
// One number for "how solid was this?", combining how OFTEN the student
// slipped with how much HELP each slip needed.
//
// EVERY constant here is a guess awaiting real data. The whole block is built
// so that guess can be revised later WITHOUT invalidating history:
//
//   1. The model is VERSIONED (STRENGTH_MODEL.id). Any stored score records
//      which model produced it, so an aggregate never silently mixes scales.
//   2. Sessions store the RAW INPUTS (weighted penalty + verse count), not
//      just the score. A score is a lossy summary — you cannot re-derive it
//      under a new formula. The inputs you can, forever, without needing the
//      original mistake list.
//   3. Constants can be overridden at runtime (localStorage now, a backend
//      later) so a recalibrated model can ship without a code release.
const STRENGTH_MODEL_DEFAULT = {
  // v3 = v2's curve and weights, with TAJWEED MISTAKES EXCLUDED.
  //
  // Hifz strength measures retention: whether the memory holds. Tajweed
  // measures acquired skill, and it does not decay over a gap the way memory
  // does — so a score cannot be both. Until now tajweed mistakes were dragging
  // the score down at 0.25 each, not by any decision but because their null
  // correction fell through mistakeWeight's `?? w.c0`. Four tajweed marks on an
  // otherwise clean page cost 22 points.
  //
  // A NEW ID, not a tweak: every score already stored was computed with them
  // included, so v2 and v3 figures are on different footings and must never be
  // averaged. The raw inputs are stored precisely so history can be refit.
  id: 'strength-v3',
  // Lvl 0 is deliberately NOT zero: at zero, a recitation full of
  // self-corrections scores identically to a flawless one.
  weights: {c0:0.25, c1:1, c2:2, c3:3, c4:1},

  // v2 measures mistakes per PAGE, where v1 measured them per verse.
  //
  // A verse is not a unit of quantity. They run from two words to over a
  // hundred, so per-verse flattered short-verse passages — a juz 30 session
  // with many tiny verses got a large denominator and looked far more solid
  // than the same slips over a page of Al-Baqarah. A page is a near-constant
  // amount of text wherever you are in the mushaf, which is the property a
  // denominator needs.
  //
  // v1 and v2 scores are NOT comparable, which is exactly what `id` is for.
  // Existing sessions keep their recorded v1 score and model id; nothing is
  // rewritten. Where a score is recomputed for display, `pages` is derived
  // from the segment's own verse keys, so old sessions still score under v2
  // without their stored data being touched.
  unit: 'page',
  k: 3.44,            // decay constant. v1's 1/3 scaled by the mean verses per
                      // page (6236/604 = 10.32), so a typical session lands in
                      // the same band as before and only the DISTRIBUTION
                      // shifts — which is the point of the change.
  minPages: 0.5,      // below half a page, one mistake swings the score wildly
  minVerses: 10,      // v1 only; kept so an old model object still scores
  bands: [
    {min:90, label:'Very strong', color:'var(--green)',       key:'vstrong'},
    {min:75, label:'Strong',      color:'var(--teal)',        key:'strong'},
    {min:55, label:'Steady',      color:'var(--lvl1-yellow)', key:'steady'},
    {min:35, label:'Shaky',       color:'var(--lvl2-orange)', key:'shaky'},
    {min:0,  label:'Needs work',  color:'var(--red)',         key:'weak'},
  ],
};

// Runtime override. Today it comes from localStorage (so the calibration tool
// can experiment against real sessions); later the backend can serve a model
// fitted to aggregated data and this is the only line that needs to change.
function loadStrengthModel(){   // kept for the legacy path only; see loadCalibration()
  try{
    const raw = localStorage.getItem('tehfiz_strength_model');
    if(raw){
      const o = JSON.parse(raw);
      return {...STRENGTH_MODEL_DEFAULT, ...o,
              weights:{...STRENGTH_MODEL_DEFAULT.weights, ...(o.weights||{})},
              bands: o.bands || STRENGTH_MODEL_DEFAULT.bands};
    }
  }catch{}
  return {...STRENGTH_MODEL_DEFAULT};
}

function saveStrengthModel(m){
  applyCalibration({strength: {...STRENGTH_MODEL_DEFAULT, ...m}});
}

function resetStrengthModel(){
  CALIBRATION.strength = {...STRENGTH_MODEL_DEFAULT};
  applyCalibration({});
}

// ── CALIBRATION ENVELOPE ──────────────────────────────────────────────────
// One object, one storage key, one entry point — so that moving calibration to
// a backend later is a single fetch and a single call, not a hunt through two
// apps for three localStorage keys.
//
// STRENGTH_MODEL and METRICS_MODEL are now VIEWS onto this envelope, refreshed
// together by syncCalibrationViews(). Every existing call site keeps working;
// the envelope is the single source of truth behind them.
//
// Why this is safe to recalibrate retroactively: sessions store the raw
// strengthInputs next to the score, and nothing in either app ever reads the
// stored score back — every displayed figure is recomputed from those inputs
// under the CURRENT model. Change the calibration and the whole history
// re-reads under it, with no migration and no data rewrite. The stored
// `strength.model` id stays as written, as provenance for what a score meant
// when it was captured.
const CALIBRATION_KEY = 'tehfiz_calibration';

const CALIBRATION_ID  = 'calibration-v1';

const CALIBRATION_LEGACY_KEYS = {strength:'tehfiz_strength_model', metrics:'tehfiz_metrics_model'};

// Sections THIS build knows how to apply. Sections it doesn't know are still
// carried through untouched — otherwise opening the teacher app, which has no
// metrics model, would silently strip the viewer's metrics calibration from
// shared storage the next time anything was saved.
function calibrationSections(){
  const s = {strength: STRENGTH_MODEL_DEFAULT};
  // eslint-disable-next-line no-undef -- defined by the viewer only; guarded by typeof
  if(typeof METRICS_MODEL_DEFAULT !== 'undefined') s.metrics = METRICS_MODEL_DEFAULT;
  return s;
}

function loadCalibration(){
  const sec = calibrationSections();
  const out = {id: CALIBRATION_ID};
  for(const k in sec) out[k] = {...sec[k]};
  // Fold in the pre-envelope per-model keys once, so anyone already carrying an
  // override doesn't lose it on upgrade.
  for(const k in CALIBRATION_LEGACY_KEYS){
    if(!out[k]) continue;
    try{
      const raw = localStorage.getItem(CALIBRATION_LEGACY_KEYS[k]);
      if(raw) out[k] = {...out[k], ...JSON.parse(raw)};
    }catch{}
  }
  try{
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if(raw){
      const stored = JSON.parse(raw);
      for(const k in stored){
        if(k === 'id') continue;
        out[k] = out[k] ? {...out[k], ...stored[k]} : stored[k];   // unknown section: verbatim
      }
    }
  }catch{}
  return out;
}

// The only door in. A backend /calibration response can be handed here directly.
// Pass persist=false to preview a calibration without writing it.
function applyCalibration(obj, persist){
  if(obj && typeof obj === 'object'){
    for(const k in obj){
      if(k === 'id') continue;
      CALIBRATION[k] = CALIBRATION[k] ? {...CALIBRATION[k], ...obj[k]} : obj[k];
    }
  }
  syncCalibrationViews();
  if(persist !== false){
    try{ localStorage.setItem(CALIBRATION_KEY, JSON.stringify(CALIBRATION)); }catch{}
  }
  return CALIBRATION;
}

// What to PUT to a backend, or drop into a bug report.
function calibrationPayload(){ return JSON.parse(JSON.stringify(CALIBRATION)); }

function resetCalibration(){
  const sec = calibrationSections();
  CALIBRATION = {id: CALIBRATION_ID};
  for(const k in sec) CALIBRATION[k] = {...sec[k]};
  try{
    localStorage.removeItem(CALIBRATION_KEY);
    for(const k in CALIBRATION_LEGACY_KEYS) localStorage.removeItem(CALIBRATION_LEGACY_KEYS[k]);
  }catch{}
  syncCalibrationViews();
}

function syncCalibrationViews(){
  STRENGTH_MODEL = {...STRENGTH_MODEL_DEFAULT, ...(CALIBRATION.strength||{})};
  if(typeof METRICS_MODEL_DEFAULT !== 'undefined')
    // eslint-disable-next-line no-undef -- defined by the viewer only; guarded by typeof above
    METRICS_MODEL = {...METRICS_MODEL_DEFAULT, ...(CALIBRATION.metrics||{})};
}

function mistakeWeight(m, model){
  const w=(model||STRENGTH_MODEL).weights;
  return w[m?.correction] ?? w.c0;
}

// Stored inputs from before v2 have no `pages`. Rather than leave those
// sessions unscoreable, derive it from the segment's verse keys — exactly the
// same computation that produced it in the first place. The stored object is
// not modified; a copy is returned.

/* Stored inputs are a CACHE, and a cache computed under an older model is
   stale, not merely old.
   strength-v3 excludes tajweed mistakes; v2 counted them into `weighted` and
   into `byLevel.c0`. So a segment scored under v2 reads lower than the same
   segment scored today, and a trend line drawn from stored inputs steps upward
   at the deploy date for a reason no reader can see.
   The fix is not to approximate: `mistakes[]` travels in every payload, so the
   inputs can be recomputed EXACTLY. This follows the pattern already used by
   inputsWithPages() — adapt on read, never rewrite the stored record. */
function inputsAreCurrent(sess){
  const m = sess && sess.strength && sess.strength.model;
  // Absent model = pre-versioning, which predates v2 and certainly v3.
  return m === STRENGTH_MODEL.id;
}

function inputsWithPages(inp, sg){
  if(!inp) return inp;
  if(inp.pages) return inp;
  return {...inp, pages: segPageExtent(sg)};
}

// The session-level equivalent. A session has no single range, so its page
// extent is the sum over its scorable segments — the same sum that produced it
// when the session was saved under v2.
function sessionInputsWithPages(inp, segs){
  if(!inp) return inp;
  if(inp.pages) return inp;
  const pages = (segs||[]).filter(segmentScorable)
                          .reduce((n, sg) => n + segPageExtent(sg), 0);
  return {...inp, pages: +pages.toFixed(4)};
}

// Score from raw inputs — the single place the curve lives. Pure, so a server
// can run it over an aggregate to test a candidate model against history.
function strengthFromInputs(inp, model){
  const M = model||STRENGTH_MODEL;
  if(!inp) return null;
  // The denominator is the model's business, not the caller's. A v1 model
  // object still scores per verse, so a stored model can be replayed exactly.
  if(M.unit === 'page'){
    const p = inp.pages;
    if(!p || p < (M.minPages ?? 0.5)) return null;
    return Math.round(100 * Math.exp(-(inp.weighted/p) / M.k));
  }
  if(!inp.verses || inp.verses < M.minVerses) return null;
  return Math.round(100 * Math.exp(-(inp.weighted/inp.verses) / M.k));
}

function memorizationStrength(mistakes, verseCount, model){
  return strengthFromInputs(strengthInputs(mistakes, verseCount), model);
}

function strengthBand(v, model){
  const M = model||STRENGTH_MODEL;
  if(v==null) return {label:'Not enough recited', color:'var(--ink3)', key:'none'};
  return M.bands.find(b=>v>=b.min) || M.bands[M.bands.length-1];
}

// Mistakes falling inside a segment's own range (first-match-wins containment).
function mistakesInSegment(segs, seg, mistakes){
  return (mistakes||[]).filter(m=>segForVerse(segs, m.surah, m.ayah)?.id === seg.id);
}

// A segment only earns a strength score if it was actually recited in full and
// its extent is trustworthy. Spot segments sample — their honest measure is the
// pass rate. Inferred extents are a lower bound, so any rate built on them is
// inflated exactly for the best sessions.
function segmentScorable(seg){
  return seg && seg.mode!=='spot'
      && seg.startSrc!=='inferred' && seg.endSrc!=='inferred'
      && !!segVerseCount(segOrdered(seg));
}

function segmentStrengthInputs(segs, seg, mistakes){
  if(!segmentScorable(seg)) return null;
  return strengthInputs(mistakesInSegment(segs, seg, mistakes),
                        segVerseCount(segOrdered(seg)),
                        segPageExtent(seg));
}

function segmentStrength(segs, seg, mistakes, model){
  return strengthFromInputs(segmentStrengthInputs(segs, seg, mistakes), model);
}

// Session inputs pool only the scorable segments, weighting by verses so a
// 200-verse passage isn't outvoted by a 12-verse one.
function sessionStrengthInputs(segs, mistakes){
  const usable=(segs||[]).filter(segmentScorable);
  if(!usable.length) return null;
  const acc={verses:0,pages:0,mistakes:0,byLevel:{c0:0,c1:0,c2:0,c3:0,c4:0},weighted:0};
  usable.forEach(sg=>{
    const i=segmentStrengthInputs(segs, sg, mistakes);
    acc.verses+=i.verses; acc.pages+=i.pages||0; acc.mistakes+=i.mistakes; acc.weighted+=i.weighted;
    Object.keys(acc.byLevel).forEach(k=>acc.byLevel[k]+=i.byLevel[k]);
  });
  acc.weighted=+acc.weighted.toFixed(4);
  // Segments are summed, not merged: two segments on the same page contribute
  // their own shares. That is right when they cover different verses, and
  // overcounts only if a teacher records overlapping segments, which the
  // segment editor does not produce.
  acc.pages=+acc.pages.toFixed(4);
  return acc;
}

function sessionStrength(segs, mistakes, model){
  return strengthFromInputs(sessionStrengthInputs(segs, mistakes), model);
}

// Verses with no mistake at all — the most immediately readable figure here.
function cleanVerseStats(segs, seg, mistakes){
  const n = segVerseCount(segOrdered(seg));
  if(!n) return null;
  const hit = new Set(mistakesInSegment(segs, seg, mistakes).map(m=>`${m.surah}:${m.ayah}`));
  return {total:n, clean:n-hit.size, pct: Math.round((n-hit.size)/n*100)};
}

// Registered QCF faces for THIS document.
//
// Deliberately NOT seeded from sessionStorage. sessionStorage survives a
// same-tab navigation (and a reload) but `document.fonts` does not — it belongs
// to the document, and the navigation destroys it. Seeding from storage made
// loadQcfFonts() skip document.fonts.add() for fonts the new document had never
// registered, so every `font-family:'qcf-pN-v2'` resolved to nothing and the
// mushaf rendered blank. It only looked like a cache problem because opening a
// new tab gives a fresh sessionStorage and therefore works.
//
// The .woff2 files are still served from the browser's HTTP cache, so
// re-registering after a navigation costs no network traffic — only a cheap
// FontFace construction. That is the right trade.
const loadedQcfFonts = new Set();

function sessionTypesActive(){ return SESSION_TYPE_PRESETS[_sessionTypePreset] || SESSION_TYPE_PRESETS.plain; }

// Terminology is a READER's preference, not a property of the file. A session
// still records the sessionTypeConfig it was captured under — useful provenance —
// but it no longer dictates display, because otherwise whoever opened the file
// could never change what they see. Stage ids are fixed and only labels vary, so
// relabelling never rewrites what a past session meant.
//
// This is emphatically NOT true of mistake types: resolveType(cfg, id) must keep
// honouring the stored catalog, or a historical mistake gets redefined out from
// under the teacher who logged it. Different config, different rule.
function sessionTypeLabel(id){
  const list = sessionTypesActive();
  return (list.find(t=>t.id===id) || list[0]).label;
}

// ═══════════════════════════════════════════════════════════════════
// COMPACT UI DETECTION — single source of truth for "mobile mode"
// ═══════════════════════════════════════════════════════════════════
// Width alone misses landscape phones (most are 750–930px wide, well past
// the old 680/700px breakpoints). A phone in landscape is short instead of
// narrow, so we also flag anything short AND touch-capable (pointer:coarse
// excludes a desktop user who's just resized a mouse-driven window short).
// CSS keys off body.compact-ui instead of raw @media so this JS check and
// the stylesheet can never disagree, and both react live to rotation.
function isCompactViewport(){
  const shortLandscape = window.innerHeight <= 500 &&
    window.matchMedia('(pointer:coarse)').matches;
  /* Portrait tablets (iPad 768–1024 wide) use the same layout as phones: the
     side panel becomes a drawer and the mistake form a bottom sheet, so the
     page gets the full width. Docked, the 310px panel left the mushaf a third
     of the screen. Landscape tablets keep the docked panel — there is room. */
  const portraitTablet = window.innerWidth <= 1024 && window.innerHeight > window.innerWidth;
  return window.innerWidth <= 700 || shortLandscape || portraitTablet;
}

// Count how many .msl lines are at least partially visible in the panel right now
function _countVisibleMslLines(panel){
  const panelRect = panel.getBoundingClientRect();
  const pages = [...panel.querySelectorAll('.mushaf-page[id^="pg-"]')].filter(el=>{
    const r = el.getBoundingClientRect();
    return r.bottom >= panelRect.top && r.top <= panelRect.bottom;
  });
  // Count only fully visible lines — same standard as PageUp/PageDown anchor detection
  return pages.flatMap(p=>[...p.querySelectorAll('.msl')]).filter(l=>{
    const r = l.getBoundingClientRect();
    return r.top >= panelRect.top - 1 && r.bottom <= panelRect.bottom + 1;
  }).length;
}

// Scroll exactly `lineCount` lines in `direction` (+1 down, -1 up).
// Anchors to fully visible lines only — partial lines at viewport edges are excluded,
// matching the precision of PageUp/PageDown.
function scrollMushafByLines(lineCount, direction){
  const panel = document.getElementById('pageContent');
  if(!panel) return false;
  if(viewMode !== 'mushaf'){
    panel.scrollBy({top: direction>0?panel.clientHeight:-panel.clientHeight, behavior:'smooth'});
    return true;
  }
  const panelRect = panel.getBoundingClientRect();
  const candidatePages = [...panel.querySelectorAll('.mushaf-page[id^="pg-"]')].filter(el=>{
    const r = el.getBoundingClientRect();
    return r.bottom >= panelRect.top - panelRect.height && r.top <= panelRect.bottom + panelRect.height;
  });
  if(!candidatePages.length){
    panel.scrollBy({top: direction>0?panel.clientHeight:-panel.clientHeight, behavior:'smooth'});
    return true;
  }
  const lines = candidatePages.flatMap(p=>[...p.querySelectorAll('.msl')]);
  if(!lines.length){
    panel.scrollBy({top: direction>0?panel.clientHeight:-panel.clientHeight, behavior:'smooth'});
    return true;
  }

  if(direction > 0){
    // Scrolling down: anchor to the first fully visible line from the top
    let anchorIdx = 0;
    for(let i=0; i<lines.length; i++){
      const r = lines[i].getBoundingClientRect();
      if(r.top >= panelRect.top - 1 && r.bottom <= panelRect.bottom + 1){
        anchorIdx = i; break;
      }
    }
    const targetIdx = Math.min(anchorIdx + lineCount, lines.length - 1);
    const r = lines[targetIdx].getBoundingClientRect();
    panel.scrollBy({top: r.top - panelRect.top, behavior:'smooth'});
  } else {
    // Scrolling up: anchor to the last fully visible line from the bottom
    let anchorIdx = 0;
    for(let i=lines.length-1; i>=0; i--){
      const r = lines[i].getBoundingClientRect();
      if(r.top >= panelRect.top - 1 && r.bottom <= panelRect.bottom + 1){
        anchorIdx = i; break;
      }
    }
    const targetIdx = Math.max(anchorIdx - lineCount, 0);
    const r = lines[targetIdx].getBoundingClientRect();
    panel.scrollBy({top: r.bottom - panelRect.bottom, behavior:'smooth'});
  }
  return true;
}

// The teacher's copy of the reference. Letter text comes straight from the
// MAKHRAJ table the sub-rule row is built on — one source, so the guide cannot
// describe a letter one way while the button records it another. The rule text
// is written out here because the rule table holds labels, not explanations.
const TAJWEED_GUIDE = {
  madd_tabee:          'A madd letter carrying no vowel after its matching harakah — alif after fatha, waw after damma, yaa after kasra. Hold it two counts.',
  madda_normal:        'The same two counts, but written as a small alef, waw or yaa above the line rather than as a full letter.',
  madda_permissible:   'Held for two, four or six counts. Whichever you choose, keep it the same throughout.',
  madda_obligatory:    'A madd letter followed by hamza in the same word. Hold it four to five counts.',
  madda_necessary:     'A madd letter followed by a sukoon or shadda. Hold it a full six counts.',
  ghunnah:             'A nasal sound held about two counts, on a noon or meem carrying shadda.',
  ikhafa:              'Hide the noon saakin or tanween into the letter after it, with a light nasal sound.',
  ikhafa_shafawi:      'Meem saakin before a baa: hide it lightly with ghunnah, lips barely meeting.',
  idgham_ghunnah:      'Merge the noon saakin or tanween into the next letter and hold the ghunnah.',
  idgham_wo_ghunnah:   'Merge the noon saakin or tanween into the laam or raa, with no nasal sound.',
  idgham_shafawi:      'Meem saakin before another meem: merge the two and hold the ghunnah.',
  idgham_mutajanisayn: 'Two letters from the same articulation point — the first merges into the second.',
  idgham_mutaqaribayn: 'Two letters from neighbouring points — the first merges into the second.',
  iqlab:               'Noon saakin or tanween before a baa becomes a hidden meem, with ghunnah.',
  qalaqah:             'A slight bounce or echo on the letter when it carries a sukoon.',
  laam_shamsiyah:      'The laam of al- is not pronounced; the letter after it is doubled instead.',
  slnt:                'Written, but not pronounced.',
  ham_wasl:            'Sounded only if you begin here. Joined to the word before, it drops away.',
};

 // phones start near full width (95%); level 0 is 60%, which left Quran words 9px tall on a 390px screen
const MUSHAF_ZOOM_BASE_PCT = 60;

   // level 0 = 60% of viewport width
const MUSHAF_ZOOM_STEP_PCT = 5;

    // each +/- step = 5% of viewport width
const MUSHAF_ZOOM_MIN_PCT  = 15;

   // floor — never below 15% of viewport width
const MUSHAF_ZOOM_MAX_PCT  = 150;

  // ceiling — never above 150% of viewport width
// A pure percentage floor breaks down on narrow windows: 15% of a 1920px screen
// is a workable 288px, but 15% of a 700px screen is an unworkable 105px — too
// narrow for the inner border + padding + chrome to render at all. This absolute
// pixel floor is taken together with the percentage floor (whichever is larger
// wins) so small windows never collapse below a still-readable minimum.
const MUSHAF_ABS_MIN_WIDTH_PX = 240;

const MUSHAF_REF_WIDTH = 680;

      // reference width all existing em/px CSS assumes
const MUSHAF_REF_FONT  = 26;

       // font size at the reference width
// Fixed reference-scale (680px/26px) offsets that must scale together as ONE
// coherent layout, not as independently-floored values — otherwise the hizb
// marker's position relative to the margin drifts at the extremes.
const MUSHAF_REF_INNER_PADDING = 36;

 // .mushaf-page-body padding (left/right) at ref scale
const MUSHAF_REF_GUTTER_MARGIN_L = 48;

 // .mushaf-page-body left margin at ref scale
const MUSHAF_REF_GUTTER_MARGIN_R = 48;

 // .mushaf-page-body right margin at ref scale (teacher app only)
const MUSHAF_REF_HIZB_GAP = 29;

 // hizb marker sits this far OUTSIDE the left margin, at ref scale (77-48)
const MUSHAF_REF_HIZB_SIZE = 34;

const MUSHAF_REF_HIZB_FONT_FULL = 12;

const MUSHAF_REF_HIZB_FONT_HALFQ = 14;

const MUSHAF_REF_HIZB_FONT_BASE = 7.5;

 // true from confirmPosNavEdit() until scroll fully settles

function setupPosNavScrollTracking(){
  const panel = document.getElementById('pageContent');
  if(!panel || _posNavScrollHandlerAttached) return;
  panel.addEventListener('scroll', ()=>{
    if(viewMode !== 'mushaf') return;
    // Cheap fields (page/juz/surah) update on a rAF throttle — tied to the
    // browser's paint cycle, never firing faster than once per frame.
    if(!_posNavRafPending){
      _posNavRafPending = true;
      requestAnimationFrame(()=>{
        _posNavRafPending = false;
        updateLivePosition_cheap();
      });
    }
    // Ayah requires per-line geometry, which is heavier — only recompute once
    // scrolling has settled, not on every frame while actively scrolling.
    clearTimeout(_posNavAyahDebounceTimer);
    _posNavAyahDebounceTimer = setTimeout(updateLivePosition_ayah, 180);
  }, {passive:true});
  _posNavScrollHandlerAttached = true;
}

// Finds whichever .mushaf-page is at the top of the viewport right now.
function _posNavTopPage(){
  const panel = document.getElementById('pageContent');
  if(!panel) return null;
  const panelRect = panel.getBoundingClientRect();
  const pages = panel.querySelectorAll('.mushaf-page[id^="pg-"]');
  for(const el of pages){
    const r = el.getBoundingClientRect();
    if(r.bottom > panelRect.top) return el;
  }
  return pages.length ? pages[pages.length-1] : null;
}

// Cheap update: Page number, Juz, and Surah label — all derivable directly
// from the top page's id/data attributes, no per-line geometry needed.
function updateLivePosition_cheap(){
  if(_posNavEditing || _posNavNavigating) return; // don't fight the user while editing or navigating
  const topEl = _posNavTopPage();
  if(!topEl) return;
  const m = topEl.id.match(/^pg-(\d+)$/);
  if(!m) return;
  const pg = +m[1];
  let pageJuz = 1;
  for(let j=JUZ_PAGES.length-1;j>=0;j--){ if(pg>=JUZ_PAGES[j]){ pageJuz=j+1; break; } }
  const ji = document.getElementById('jumpPageInput');
  if(ji && document.activeElement!==ji) ji.value = pg;
  const juzSelEl = document.getElementById('juzSel');
  if(juzSelEl && document.activeElement!==juzSelEl) juzSelEl.value = pageJuz;
  const surahFirst = +(topEl.dataset.surahFirst||0);
  _posNavLastTopPage = topEl;
  _posNavLastSurah = surahFirst || _posNavLastSurah;
  // Surah-only part of the label updates immediately; ayah is filled in by the
  // debounced pass below (or shown blank momentarily right after a fast scroll).
  _renderPosNavLabel(surahFirst, _posNavLastAyah);
}

function _renderPosNavLabel(surah, ayah){
  // The compact header shows the same position on its Go to button.
  if(window.TehfizHeader) window.TehfizHeader.syncPosition();
  const label = document.getElementById('posNavLabel');
  if(!label) return;
  if(!surah){ label.textContent = '—'; return; }
  const name = SURAH_NAMES[surah-1] || '';
  const maxAyah = AYAH_COUNTS[surah-1] || 1;
  label.textContent = ayah ? `${name}: ${ayah} / ${maxAyah}` : name;
}

// ── CLICK-TO-EDIT ────────────────────────────────────────────────────
function openPosNavEdit(){
  const wrap = document.getElementById('posNav');
  if(!wrap) return;
  _posNavEditing = true;
  const surah = _posNavLastSurah || 1;
  const ayah = _posNavLastAyah || 1;
  const maxAyah = AYAH_COUNTS[surah-1] || 1;
  wrap.innerHTML = `
    <div class="pos-nav-edit">
      <div class="pos-surah-pick">
        <input type="text" class="sel pos-surah-input" id="posNavSurahInput"
          value="${surah}. ${SURAH_NAMES[surah-1]||''}" autocomplete="off" spellcheck="false"
          placeholder="Type surah name or number"
          onfocus="_posNavSurahFocus(this)"
          onblur="_posNavSurahBlur()"
          oninput="_posNavSurahSearch(this.value)"
          onkeydown="_posNavSurahKey(event)"/>
        <div class="pos-surah-list" id="posNavSurahList"></div>
      </div>
      <input type="hidden" id="posNavSurahSel" value="${surah}">
      <input type="number" class="pos-ayah-input" id="posNavAyahInput" min="1" max="${maxAyah}" value="${ayah}"
        onkeydown="if(event.key==='Enter')confirmPosNavEdit()"
        oninput="_posNavAyahInputChanged()"/>
      <span class="pos-nav-ayah-max" id="posNavAyahMax">/ ${maxAyah}</span>
      <button class="pos-go-btn" onclick="confirmPosNavEdit()">Go</button>
    </div>`;
  // Focus the SURAH box, not the ayah box. The ayah field is type="number",
  // so while it took focus on open, typing a surah name went straight into a
  // numeric input that silently discards letters — the search was unreachable
  // unless you happened to click the surah box first. Focusing here fires
  // _posNavSurahFocus, which blanks the field and drops the full list open, so
  // the editor opens already looking like the search box it is.
  // _posNavPickSurah then hands focus on to the ayah box, keeping
  // surah -> Enter -> ayah -> Enter a pure keyboard chain.
  document.getElementById('posNavSurahInput')?.focus();
  // Clicking anywhere outside cancels edit mode without navigating.
  // pointerdown, NOT click: _posNavPickSurah hides the dropdown on mousedown,
  // so by the time click is dispatched the option is out of the layout and the
  // event retargets to <body> - which read as an outside click and dismissed
  // the editor the moment a surah was picked with the mouse.
  setTimeout(()=>document.addEventListener('pointerdown', _posNavOutsideClick), 0);
}

function _posNavSurahSearch(q){
  const list=document.getElementById('posNavSurahList');
  if(!list) return;
  // Ignore the "18. Al-Kahf" prefix the field shows when untouched
  const clean=String(q||'').replace(/^\s*\d+\.\s*/,'');
  const hits=surahMatches(clean, 114);
  _posNavSurahHi=0;
  list.innerHTML = hits.length
    ? hits.map((x,i)=>`<button class="pos-surah-opt${i===0?' hi':''}" data-num="${x.num}"
        onmousedown="event.preventDefault();_posNavPickSurah(${x.num})">
        <span class="pos-surah-n">${x.num}</span>${esc(x.name)}
        <span class="pos-surah-v">${AYAH_COUNTS[x.num-1]}</span></button>`).join('')
    : `<div class="pos-surah-empty">No match</div>`;
  list.classList.add('open');
}

function _posNavPickSurah(num){
  const hid=document.getElementById('posNavSurahSel');
  const inp=document.getElementById('posNavSurahInput');
  const list=document.getElementById('posNavSurahList');
  if(hid) hid.value=num;
  if(inp) inp.value=`${num}. ${SURAH_NAMES[num-1]||''}`;
  if(list) list.classList.remove('open');
  _posNavSurahChanged();
  document.getElementById('posNavAyahInput')?.focus();
  document.getElementById('posNavAyahInput')?.select();
}

// Blank the field on focus so the placeholder shows and the full list drops
// open — the previous select() left "18. Al-Kahf" sitting there looking like
// a value, not a query. The hidden #posNavSurahSel still holds the real
// selection throughout, so confirmPosNavEdit() is unaffected by the blank.
function _posNavSurahFocus(inp){
  inp.value='';
  _posNavSurahSearch('');
}

// Leaving without picking restores the display text from the hidden field,
// so the user never walks away from an empty-looking surah box. Picking with
// the mouse can't hit this first: the option's mousedown preventDefault holds
// focus, and _posNavPickSurah writes the hidden field before moving focus, so
// the restore is idempotent either way.
function _posNavSurahBlur(){
  const hid=document.getElementById('posNavSurahSel');
  const inp=document.getElementById('posNavSurahInput');
  const list=document.getElementById('posNavSurahList');
  list?.classList.remove('open');
  if(hid&&inp){ const n=+hid.value; inp.value = n ? `${n}. ${SURAH_NAMES[n-1]||''}` : ''; }
}

function _posNavSurahKey(e){
  const list=document.getElementById('posNavSurahList');
  const opts=[...(list?.querySelectorAll('.pos-surah-opt')||[])];
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(!opts.length) return;
    _posNavSurahHi=Math.max(0,Math.min(opts.length-1,_posNavSurahHi+(e.key==='ArrowDown'?1:-1)));
    opts.forEach((o,i)=>o.classList.toggle('hi', i===_posNavSurahHi));
    opts[_posNavSurahHi].scrollIntoView({block:'nearest'});
  } else if(e.key==='Enter'){
    e.preventDefault();
    if(opts.length) _posNavPickSurah(+opts[_posNavSurahHi].dataset.num);
  } else if(e.key==='Escape'){
    list?.classList.remove('open');
  }
}

function _posNavAyahInputChanged(){
  const input = document.getElementById('posNavAyahInput');
  const maxEl = document.getElementById('posNavAyahMax');
  if(!input) return;
  const max = parseInt(input.max, 10) || 1;
  const val = parseInt(input.value, 10);
  const over = !isNaN(val) && val > max;
  input.classList.toggle('over-max', over);
  if(maxEl) maxEl.style.color = over ? '#ff9999' : 'rgba(255,255,255,.4)';
}

function _posNavSurahChanged(){
  const sel = document.getElementById('posNavSurahSel');
  const input = document.getElementById('posNavAyahInput');
  const maxEl = document.getElementById('posNavAyahMax');
  if(!sel || !input) return;
  const surah = +sel.value;
  const maxAyah = AYAH_COUNTS[surah-1] || 1;
  input.max = maxAyah;
  input.value = 1;
  input.classList.remove('over-max');
  if(maxEl){ maxEl.textContent = `/ ${maxAyah}`; maxEl.style.color = 'rgba(255,255,255,.4)'; }
}

function _posNavOutsideClick(e){
  const wrap = document.getElementById('posNav');
  if(wrap && !wrap.contains(e.target)){
    closePosNavEdit();
  }
}

function closePosNavEdit(){
  document.removeEventListener('pointerdown', _posNavOutsideClick);
  _posNavEditing = false;
  const wrap = document.getElementById('posNav');
  if(!wrap) return;
  wrap.innerHTML = `<span class="pos-nav-label" id="posNavLabel" onclick="openPosNavEdit()" title="Click to jump to a specific Surah:Ayah">—</span>`;
  _renderPosNavLabel(_posNavLastSurah, _posNavLastAyah);
}

async function confirmPosNavEdit(){
  const sel = document.getElementById('posNavSurahSel');
  const input = document.getElementById('posNavAyahInput');
  if(!sel || !input) return;
  const surah = +sel.value;
  const maxAyah = AYAH_COUNTS[surah-1] || 1;
  let ayah = parseInt(input.value, 10) || 1;
  ayah = Math.max(1, Math.min(maxAyah, ayah));
  document.removeEventListener('pointerdown', _posNavOutsideClick);
  _posNavEditing = false;
  _posNavNavigating = true; // pause live tracking for the full async navigation
  // Update the label to the TARGET immediately so the user sees their
  // selection, not whatever was at the top of the screen before.
  _posNavLastSurah = surah;
  _posNavLastAyah = ayah;
  closePosNavEdit(); // now renders the target surah:ayah in the label
  await navigateToVerse(surah, ayah, 1);
  // Instead of a fixed timeout, poll until the viewport has actually reached
  // the target verse (or a 3-second hard cap in case the verse isn't found).
  _posNavWaitForScrollArrival(surah, ayah);
}

function _posNavWaitForScrollArrival(targetSurah, targetAyah){
  const started = Date.now();
  const HARD_CAP_MS = 3000;
  function check(){
    // Check whether the live-position logic now agrees with our target.
    // Re-use the same first-visible-word walk as updateLivePosition_ayah.
    const panel = document.getElementById('pageContent');
    const topEl = _posNavTopPage();
    if(panel && topEl){
      const panelRect = panel.getBoundingClientRect();
      const words = topEl.querySelectorAll('.qcf-word[data-surah][data-ayah][data-pos]');
      for(const w of words){
        if(+w.dataset.pos !== 1) continue;
        const r = w.getBoundingClientRect();
        if(r.top >= panelRect.top - 2){
          if(+w.dataset.surah === targetSurah && +w.dataset.ayah === targetAyah){
            // Viewport has arrived — resume live tracking
            _posNavNavigating = false;
            return;
          }
          break; // found the first visible word, it's not ours yet
        }
      }
    }
    if(Date.now() - started < HARD_CAP_MS){
      requestAnimationFrame(check);
    } else {
      _posNavNavigating = false; // give up and let live tracking take over
    }
  }
  requestAnimationFrame(check);
}

// Finds whichever .mushaf-page is currently at the top of the viewport and
// records HOW FAR INTO that page (as a fraction of its height, not a pixel
// offset) the viewport's top edge currently sits. A fraction survives the
// page's height changing; a raw pixel offset would not.
function captureMushafScrollAnchor(){
  const panel = document.getElementById('pageContent');
  if(!panel) return null;
  const panelRect = panel.getBoundingClientRect();
  const pages = panel.querySelectorAll('.mushaf-page[id^="pg-"]');
  for(const el of pages){
    const r = el.getBoundingClientRect();
    // The page whose bottom is still below the viewport's top edge (i.e. the
    // page currently spanning or just below the top of the visible area).
    if(r.bottom > panelRect.top){
      const pageHeight = r.height || 1;
      const fraction = (panelRect.top - r.top) / pageHeight; // can be negative if page starts below top
      return {pageId: el.id, fraction};
    }
  }
  return null;
}

// Restores scroll position using a previously captured anchor — finds the same
// page (now resized) and scrolls so the viewport top sits at the same
// fractional position within it.
function restoreMushafScrollAnchor(anchor){
  if(!anchor) return;
  const panel = document.getElementById('pageContent');
  const el = anchor.pageId ? document.getElementById(anchor.pageId) : null;
  if(!panel || !el) return;
  const panelRect = panel.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const targetTopInViewport = anchor.fraction * r.height;
  // Current offset of the page's top relative to the panel's scroll position
  const pageTopInScroll = panel.scrollTop + (r.top - panelRect.top);
  panel.scrollTop = pageTopInScroll + targetTopInViewport;
}

// Applies the page-frame/body sizing (width, font, margin, padding, CSS zoom
// vars, buffer blocks) to a specific set of page elements. Pulled out as its
// own function so applyMushafZoomToDOM can call it twice: once synchronously
// for visible pages, then again in progressive batches for everything else.
function _applyMushafZoomToPages(pages, m){
  pages.forEach(el=>{
    el.style.width = m.width + 'px';
    el.style.transform = '';
    el.style.marginBottom = '32px';
    el.style.setProperty('--mz-header-pad-v', m.headerPadV+'px');
    el.style.setProperty('--mz-header-pad-h', m.headerPadH+'px');
    el.style.setProperty('--mz-header-gap', m.headerGap+'px');
    el.style.setProperty('--mz-header-juz-font', m.headerJuzFont+'px');
    el.style.setProperty('--mz-header-surah-font', m.headerSurahFont+'px');
    el.style.setProperty('--mz-header-surahen-font', m.headerSurahEnFont+'px');
    el.style.setProperty('--mz-header-minwidth', m.headerMinWidth+'px');
    el.style.setProperty('--mz-footer-height', m.footerHeight+'px');
    el.style.setProperty('--mz-footer-orn-pad', m.footerOrnPad+'px');
    el.style.setProperty('--mz-footer-orn-h', m.footerOrnH+'px');
    el.style.setProperty('--mz-footer-num-font', m.footerNumFont+'px');
    /* Without this the readout keeps the size it was built at while the page
       around it rescales — which is the same trap the ruku badge fell into. */
    el.style.setProperty('--mz-footer-prog', m.footerProgFont+'px');
    el.style.setProperty('--mz-footer-num-pad', m.footerNumPad+'px');
    const body = el.querySelector('.mushaf-page-body');
    if(body){
      body.style.fontSize = m.font + 'px';
      body.style.margin = `10px ${m.marginRight}px 10px ${m.marginLeft}px`;
      body.style.padding = `10px ${m.innerPadding}px 8px`;
    }
    el.querySelectorAll('.msl-buffer').forEach(bEl=>{
      const half = parseFloat(bEl.dataset.halfDeficit);
      if(!isNaN(half)) bEl.style.height = Math.round(half * MSL_LINE_HEIGHT_EM * m.font) + 'px';
    });
    el.dataset.zoomApplied = '1'; // marks this page as caught up to the current zoom
  });
}

 // invalidates any in-flight batch when a new zoom change starts

function applyMushafZoomToDOM(m){
  const _zoomAnchor = captureMushafScrollAnchor();
  const panel = document.getElementById('pageContent');
  const allPages = panel ? [...panel.querySelectorAll('.mushaf-page[id^="pg-"]')] : [];

  // Cancel any catch-up batch still running from a previous zoom step — its
  // work is now stale (a newer zoom level has superseded it).
  const myToken = ++_mushafZoomBatchToken;

  // STEP 1 — find which pages are actually visible (or just outside the
  // viewport) RIGHT NOW. This only reads getBoundingClientRect on page-wrapper
  // elements (one per page), not on every word span, so its cost scales with
  // page count, never with content density.
  let visiblePages = allPages, restPages = [];
  if(panel && allPages.length){
    const panelRect = panel.getBoundingClientRect();
    const margin = panelRect.height; // one viewport of slack on each side
    visiblePages = allPages.filter(el=>{
      const r = el.getBoundingClientRect();
      return r.bottom >= panelRect.top - margin && r.top <= panelRect.bottom + margin;
    });
    const visibleSet = new Set(visiblePages);
    restPages = allPages.filter(el=>!visibleSet.has(el));
  }

  // STEP 2 — resize the visible set synchronously. This is what the user is
  // watching, so it must be instant regardless of how many more pages are
  // loaded elsewhere in the document.
  _applyMushafZoomToPages(visiblePages, m);
  updateMushafZoomIndicator();

  // STEP 3 — restore scroll position next frame (after the browser relayouts
  // from the writes above on its own schedule, not forced synchronously now).
  requestAnimationFrame(()=>{
    if(myToken !== _mushafZoomBatchToken) return; // superseded by a newer zoom change
    restoreMushafScrollAnchor(_zoomAnchor);
    _applyHizbZoomToPages(visiblePages, m);

    // STEP 4 — catch up every other loaded page in small batches across
    // subsequent frames, nearest-to-viewport first. Off-screen, so any user
    // scrolling toward them has time (each batch runs ~16ms apart, far faster
    // than a manual scroll covers a page's worth of distance) to catch up
    // before they'd actually see an unresized page.
    if(restPages.length){
      const panelRectNow = panel.getBoundingClientRect();
      const center = (panelRectNow.top + panelRectNow.bottom) / 2;
      restPages.sort((a,b)=>{
        const da = Math.abs((a.getBoundingClientRect().top) - center);
        const db = Math.abs((b.getBoundingClientRect().top) - center);
        return da - db;
      });
      let idx = 0;
      const BATCH_SIZE = 4;
      function nextBatch(){
        if(myToken !== _mushafZoomBatchToken) return; // a newer zoom change took over
        const batch = restPages.slice(idx, idx+BATCH_SIZE);
        idx += BATCH_SIZE;
        _applyMushafZoomToPages(batch, m);
        _applyHizbZoomToPages(batch, m);
        if(idx < restPages.length) requestAnimationFrame(nextBatch);
      }
      requestAnimationFrame(nextBatch);
    }
  });
}

// Keeps the slider's thumb position in sync with mushafZoomLevel, whichever
// path changed it (buttons, keyboard, Fit, or the slider itself). No numeric
// readout — the slider position alone communicates relative size, which avoids
// implying a precision (e.g. "25%") that the absolute pixel floor could
// silently contradict once a narrow window overrides the requested size.
function updateMushafZoomIndicator(){
  const slider = document.getElementById('mushafZoomSlider');
  if(slider && +slider.value !== mushafZoomLevel) slider.value = mushafZoomLevel;
}

// Called directly by the slider's oninput — jumps straight to the dragged level.
function setMushafZoomLevel(level){
  mushafZoomLevel = parseInt(level, 10) || 0;
  applyMushafZoomToDOM(computeMushafZoomMetrics());
}

function changeMushafZoom(delta){
  mushafZoomLevel += delta;
  applyMushafZoomToDOM(computeMushafZoomMetrics());
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-SCROLL — hands-free teleprompter-style scrolling
// ═══════════════════════════════════════════════════════════════════
// Speed is a relative multiplier (like the zoom level), not an absolute
// px/sec — recitation pace varies too much per line-density for a literal
// words-per-minute model to stay accurate anyway.
const AUTOSCROLL_BASE_PXPS = 24;

const AUTOSCROLL_RESUME_DELAY = 1500;

function toggleAutoScroll(){
  if(autoScrollState.active) stopAutoScroll(); else startAutoScroll();
}

function changeAutoScrollSpeed(delta){
  setAutoScrollSpeed(autoScrollState.speed+delta);
}

function _maybeAutoScrollAdvance(panel){
  if(_autoScrollAdvancing) return;
  const nearBottom=panel.scrollHeight-panel.scrollTop-panel.clientHeight<40;
  if(!nearBottom) return;
  _autoScrollAdvancing=true;
  Promise.resolve(_autoScrollAdvance()).then(more=>{
    if(!more){
      stopAutoScroll();
      showToast('Reached the end — auto-scroll stopped');
    }
  }).finally(()=>{
    setTimeout(()=>{_autoScrollAdvancing=false;}, 1500);
  });
}

// ── Manual-scroll interrupt: pause immediately, resume on its own after a
// short quiet period — easy enough to fully stop via the toggle if that's
// what's actually wanted, so we don't require an explicit resume here.
function _onAutoScrollManualInput(){
  if(!autoScrollState.active) return;
  autoScrollState.pausedManual=true;
  clearTimeout(autoScrollState.resumeTimer);
  autoScrollState.resumeTimer=setTimeout(()=>{ autoScrollState.pausedManual=false; }, AUTOSCROLL_RESUME_DELAY);
}

function _autoScrollFabTouch(){
  const wrap=document.getElementById('autoscrollFabWrap');
  if(!wrap) return;
  wrap.classList.remove('idle');
  clearTimeout(_autoScrollFabIdleTimer);
  if(autoScrollState.active){
    _autoScrollFabIdleTimer=setTimeout(()=>wrap.classList.add('idle'), 2500);
  }
}

function reapplyMushafZoomOnResize(){
  if(viewMode!=='mushaf') return;
  applyMushafZoomToDOM(computeMushafZoomMetrics());
}

 // cached DB connection

// A version bump can BLOCK: if another tab still holds the database open at the
// old version, onupgradeneeded never fires and the promise never settles — the
// app then hangs on "Loading Juz…" forever with no error. The cache is an
// optimisation, never a dependency, so give up quickly and run without it.
const QC_OPEN_TIMEOUT_MS = 3000;

// ── Persistent page → first-verse index ───────────────────────────
// pageForVerse() is a linear approximation and _versePageMap only knows pages
// fetched in THIS session, so page-based ranges were approximate far more often
// than they needed to be. Every page we cache already carries its verse list,
// so the exact first verse of that page is free — we just weren't keeping it.
//
// This index survives reloads in the `meta` store (604 entries, a few KB) and
// fills in opportunistically: any page fetched, cached, or background-prefetched
// contributes its own entry. Nothing extra is downloaded for it.
const _pageFirstVerse = new Map();

async function qcMetaGet(key){
  try{
    const db = await qcOpen();
    return new Promise(res=>{
      const tx = db.transaction('meta','readonly');
      const rq = tx.objectStore('meta').get(key);
      rq.onsuccess = ()=>res(rq.result||null);
      rq.onerror   = ()=>res(null);
    });
  }catch{ return null; }
}

async function qcMetaPut(key, value){
  try{
    const db = await qcOpen();
    return new Promise(res=>{
      const tx = db.transaction('meta','readwrite');
      tx.objectStore('meta').put({key, value});
      tx.oncomplete = ()=>res(true);
      tx.onerror    = ()=>res(false);
    });
  }catch{ return false; }
}

async function loadPageIndex(){
  const rec = await qcMetaGet('pageIndex');
  if(rec?.value) Object.entries(rec.value).forEach(([p,k])=>_pageFirstVerse.set(+p,k));
  // Any pages already cached but not yet indexed (e.g. cached by an older build)
  // get picked up the next time they're read through fetchPageCached.
}

function notePageFirstVerse(pageNum, verses){
  if(!verses?.length) return;
  const k = verses[0].verse_key;
  if(!k || _pageFirstVerse.get(pageNum)===k) return;
  _pageFirstVerse.set(pageNum, k);
  _pageIndexDirty = true;
  clearTimeout(notePageFirstVerse._t);
  notePageFirstVerse._t = setTimeout(flushPageIndex, 2000);   // batch bursts of prefetch
}

async function flushPageIndex(){
  if(!_pageIndexDirty) return;
  _pageIndexDirty = false;
  await qcMetaPut('pageIndex', Object.fromEntries(_pageFirstVerse));
}

function pageIndexCoverage(){ return _pageFirstVerse.size; }

// Fetch multiple pages with concurrency limit — returns array in same order as input
async function fetchPagesCached(pageNums, concurrency=8){
  const results = new Array(pageNums.length);
  let next = 0;
  async function worker(){
    while(next < pageNums.length){
      const i = next++;
      results[i] = await fetchPageCached(pageNums[i]);
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, pageNums.length)}, worker));
  return results;
}

// Load QCF V2 per-page fonts from the Quran Foundation CDN
async function loadQcfFonts(pages){
  const CDN='https://verses.quran.foundation';
  await Promise.all(pages.map(async pg=>{
    const fname=`qcf-p${pg}-v2`;
    // Ask the document, not our own bookkeeping: check() is the only thing that
    // knows whether THIS document can actually render the face.
    if(loadedQcfFonts.has(fname) && document.fonts.check(`12px '${fname}'`)) return;
    try{
      const ff=new FontFace(fname,`url('${CDN}/fonts/quran/hafs/v2/woff2/p${pg}.woff2')`);
      ff.display='block';
      await ff.load();
      document.fonts.add(ff);
      loadedQcfFonts.add(fname);
    }catch(e){ console.warn(`QCF font p${pg} failed:`,e); }
  }));
}

// ── SHARED MUSHAF HELPERS ──
function ornamentSVG(id){
  return`<svg viewBox="0 0 400 18" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="orn${id}" x="0" y="0" width="40" height="18" patternUnits="userSpaceOnUse"><line x1="0" y1="9" x2="40" y2="9" stroke="#b8841a" stroke-width=".6" opacity=".4"/><circle cx="20" cy="9" r="3.5" fill="none" stroke="#b8841a" stroke-width=".8" opacity=".6"/><circle cx="0" cy="9" r="1.5" fill="#b8841a" opacity=".35"/><circle cx="40" cy="9" r="1.5" fill="#b8841a" opacity=".35"/><path d="M14,9 Q17,5 20,9 Q23,13 26,9" fill="none" stroke="#b8841a" stroke-width=".7" opacity=".5"/></pattern></defs><rect width="400" height="18" fill="url(#orn${id})"/></svg>`;
}

// Plain spacer block — fills the vertical gap on pages 1-2 (Madinah mushaf's
// ornate, shorter opening layout) so they match the height of a standard page.
// Left as blank space for now; can be restyled with decoration later.
// data-line-deficit stores the HALF-deficit this block represents (in line
// units, not px) so applyMushafZoomToDOM can recompute its height live when
// zoom changes, without needing a full page re-render.
function mushafBufferBlock(pg, heightPx, halfDeficitLines){
  if(heightPx < 6) return '';
  return `<div class="msl-buffer" data-half-deficit="${halfDeficitLines}" style="height:${heightPx}px;"></div>`;
}

// Standard Madinah mushaf layout: 15 text lines per page. Pages 1-2 (Al-Fatihah /
// opening of Al-Baqarah) render fewer due to their ornate, centered layout — the
// buffer panel below fills that visual gap so every page reads as the same height.
const STANDARD_LINES_PER_PAGE = 15;

const MSL_LINE_HEIGHT_EM = 2.55;

 // matches .msl{height:2.55em} in CSS

function mushafPageHeader(pg,juzNum,vv){
  let pageJuz=juzNum;
  for(let j=JUZ_PAGES.length-1;j>=0;j--){if(pg>=JUZ_PAGES[j]){pageJuz=j+1;break;}}
  const sNums=[...new Set(vv.map(v=>+v.verse_key.split(':')[0]))];
  const s0=sNums[0],sL=sNums[sNums.length-1];
  const ar=s0===sL?(AR_NAMES[s0-1]||''):(AR_NAMES[s0-1]||'')+' · '+(AR_NAMES[sL-1]||'');
  const en=s0===sL?`${s0}. ${SURAH_NAMES[s0-1]||''}`:`${s0}. ${SURAH_NAMES[s0-1]||''} – ${sL}. ${SURAH_NAMES[sL-1]||''}`;
  // Arabic running head with the Latin under it; the page style decides the layout.
  return`<div class="mushaf-page-header"><span class="mph-juz"><span class="mph-ar">الجزء ${toAr(pageJuz)}</span><span class="mph-en">Juz ${pageJuz}</span></span><span class="mph-surah">${ar}<span class="mph-surah-en">${en}</span></span><span class="mph-right"></span></div>`;
}

/* Two readouts in the footer: how far to the end of this surah on the left,
   how far to the end of the juz on the right. On by default — it is the
   question a hafiz asks constantly and the page already knows the answer.
   The surah readout is suppressed for surahs of two pages or fewer: "1 page to
   the end of Al-Kawthar" is noise, not information. */
function _pagesLeftText(pg){
  if(appSettings.showPageProgress === false) return {left:'', right:''};
  const s = surahOfPage(pg), sEnd = SURAH_PAGES[(s-1)*2 + 1], sStart = SURAH_PAGES[(s-1)*2];
  const j = juzOfPage(pg), jEnd = JUZ_PAGE_END[j-1];
  const name = (typeof SURAH_NAMES !== 'undefined' && SURAH_NAMES[s-1]) || `Surah ${s}`;
  let left = '';
  if(sEnd - sStart + 1 > 2){
    const n = sEnd - pg;
    left = n <= 0 ? `Last page of ${name}` : `${n} page${n===1?'':'s'} to end of ${name}`;
  }
  const n2 = jEnd - pg;
  const right = n2 <= 0 ? `Last page of Juz ${j}` : `${n2} page${n2===1?'':'s'} to end of Juz ${j}`;
  return {left, right};
}

/* Page numbers follow the verse-number toggle: Arabic-Indic by default, Latin
   when "Latin verse & page numbers" is on — one choice for every numeral on
   the page. */
function _pageNumLatin(){ return typeof appSettings !== 'undefined' && !!appSettings.latinNumerals; }

function mushafPageFooter(pg){
  const p = _pagesLeftText(pg);
  return`<div class="mushaf-page-footer"><span class="mpf-prog mpf-prog-l">${p.left}</span><span class="mpf-prog mpf-prog-r">${p.right}</span><div class="mpf-ornament">${ornamentSVG(pg+'a')}</div><div class="mpf-divider"></div><div class="mpf-num${_pageNumLatin()?'':' ar'}">${_pageNumLatin()?pg:toAr(pg)}</div><div class="mpf-divider"></div><div class="mpf-ornament">${ornamentSVG(pg+'b')}</div></div>`;
}

// Applies the current zoom level's metrics to all rendered pages, and (re)registers
// the resize handler so sizing stays correct as the viewport changes.
function attachMushafScaler(){
  applyMushafZoomToDOM(computeMushafZoomMetrics());
  if(window._mushafResizeHandler) window.removeEventListener('resize',window._mushafResizeHandler);
  window._mushafResizeHandler=reapplyMushafZoomOnResize;
  window.addEventListener('resize',window._mushafResizeHandler);
  // Refresh the live Surah:Ayah/Page readout immediately after a render —
  // otherwise it would show stale data until the user's next scroll.
  if(viewMode==='mushaf'){
    updateLivePosition_cheap();
    clearTimeout(_posNavAyahDebounceTimer);
    _posNavAyahDebounceTimer = setTimeout(updateLivePosition_ayah, 180);
  }
}

function renderTermChoice(){
  const el = document.getElementById('termChoice');
  if(!el) return;
  el.innerHTML = Object.keys(SESSION_TYPE_PRESETS).map(k=>{
    const names = SESSION_TYPE_PRESETS[k].filter(t=>t.id!=='unassigned').map(t=>t.label).join(' / ');
    const on = k===_sessionTypePreset;
    return `<button class="term-opt${on?' on':''}" onclick="setSessionTypePreset('${k}')">${names}</button>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// MAKHARIJ
// ───────────────────────────────────────────────────────────────────
// The articulation points under 5 regions (Ibn al-Jazari's count of 17, the
// majority position; a minority of classical scholars count 14 or 16 by not
// treating al-jawf separately).
//
// This table yields SIXTEEN distinct points, not seventeen, and that is
// correct: the seventeenth is al-khayshum, the nasal cavity, which is where
// ghunnah resonates rather than where any letter is articulated. No letter has
// it as its base makhraj, so it has no row here.
//
// Hardcoded rather than fetched: it is 29 rows,
// it never changes, and no dataset publishes it — the tajweed annotations
// describe recitation RULES, not where a letter is articulated.
//
// waw and ya appear at their CONSONANTAL points here. As madd letters they
// belong to al-jawf, but that depends on the vowel context, and for "which
// letter did he mispronounce" the consonantal point is what the teacher means.
const MAKHRAJ = {
  'ا':{p:'jawf',          r:'Jawf',    label:'Oral cavity'},
  'ء':{p:'halq-aqsa',     r:'Halq',    label:'Deepest throat'},
  'ه':{p:'halq-aqsa',     r:'Halq',    label:'Deepest throat'},
  'ع':{p:'halq-wasat',    r:'Halq',    label:'Middle throat'},
  'ح':{p:'halq-wasat',    r:'Halq',    label:'Middle throat'},
  'غ':{p:'halq-adna',     r:'Halq',    label:'Nearest throat'},
  'خ':{p:'halq-adna',     r:'Halq',    label:'Nearest throat'},
  'ق':{p:'lisan-aqsa',    r:'Lisan',   label:'Deepest tongue · soft palate'},
  'ك':{p:'lisan-aqsa-f',  r:'Lisan',   label:'Deepest tongue · hard palate'},
  'ج':{p:'lisan-wasat',   r:'Lisan',   label:'Middle of tongue'},
  'ش':{p:'lisan-wasat',   r:'Lisan',   label:'Middle of tongue'},
  'ي':{p:'lisan-wasat',   r:'Lisan',   label:'Middle of tongue'},
  'ض':{p:'lisan-hafah',   r:'Lisan',   label:'Edge of tongue · molars'},
  'ل':{p:'lisan-lam',     r:'Lisan',   label:'Edge of tongue · front gums'},
  'ن':{p:'lisan-noon',    r:'Lisan',   label:'Tip of tongue · gums'},
  'ر':{p:'lisan-ra',      r:'Lisan',   label:'Tip of tongue · gums, curled'},
  'ط':{p:'lisan-nita',    r:'Lisan',   label:'Tip of tongue · roots of upper teeth'},
  'د':{p:'lisan-nita',    r:'Lisan',   label:'Tip of tongue · roots of upper teeth'},
  'ت':{p:'lisan-nita',    r:'Lisan',   label:'Tip of tongue · roots of upper teeth'},
  'ص':{p:'lisan-safir',   r:'Lisan',   label:'Tip of tongue · behind front teeth'},
  'س':{p:'lisan-safir',   r:'Lisan',   label:'Tip of tongue · behind front teeth'},
  'ز':{p:'lisan-safir',   r:'Lisan',   label:'Tip of tongue · behind front teeth'},
  'ظ':{p:'lisan-lithawi', r:'Lisan',   label:'Tip of tongue · edges of upper teeth'},
  'ذ':{p:'lisan-lithawi', r:'Lisan',   label:'Tip of tongue · edges of upper teeth'},
  'ث':{p:'lisan-lithawi', r:'Lisan',   label:'Tip of tongue · edges of upper teeth'},
  'ف':{p:'shafah-fa',     r:'Shafah',  label:'Inner lower lip · upper teeth'},
  'ب':{p:'shafah-batn',   r:'Shafah',  label:'Both lips'},
  'م':{p:'shafah-batn',   r:'Shafah',  label:'Both lips'},
  'و':{p:'shafah-batn',   r:'Shafah',  label:'Both lips, rounded'},
};

// Hamza and its seats all resolve to ء; alif maqsura to ya; ta marbuta to ha;
// alif wasla to alif. These are seat/orthography variants, not distinct
// articulation points.
const MAKHRAJ_NORM = {'أ':'ء','إ':'ء','آ':'ء','ؤ':'ء','ئ':'ء','ى':'ي','ة':'ه','ٱ':'ا'};

function makhrajOf(letter){ return MAKHRAJ[MAKHRAJ_NORM[letter] || letter] || null; }

// ═══════════════════════════════════════════════════════════════════
// TAJWEED RULE ANNOTATIONS
// ───────────────────────────────────────────────────────────────────
// api.quran.com returns text_uthmani_tajweed: the verse with <tajweed class=…>
// spans wrapping the affected letters. The class name IS the rule, so the
// cross-word rules — idghaam, ikhfa and iqlab, which depend on the first letter
// of the FOLLOWING word — arrive already resolved. That is the part worth not
// writing ourselves.
//
// A full census of all 6,236 verses: 17 distinct classes, at most 5 on any one
// word, and 41.9% of words carry none at all.
const TAJWEED_RULES = {
  ham_wasl:            {label:'Hamzat al-wasl',   short:'Hamzat wasl'},
  laam_shamsiyah:      {label:'Lam shamsiyyah',   short:'Lam shams.'},
  slnt:                {label:'Silent letter',    short:'Silent'},
  // The upstream annotation calls this "normal madd", but it does NOT mark
  // natural madd in general. Sampled across four surahs, every single span it
  // produces is an UNWRITTEN madd letter — superscript alef (the dagger alif,
  // khara zabar), alef with wavy hamza, small waw, small yeh. Not one ordinary
  // alif, waw or yaa. Which makes sense as a colouring convention: the schemes
  // highlight what a reader might miss, and nobody misses the alif in قَالَ.
  // (It also merges two classical rules — the dagger-alif cases are madd
  // tabee'i written differently, while the small waw and yeh on the pronoun هـ
  // are madd silah sughra. Both run to two counts, so the merge is harmless
  // for our purposes, but the label should not claim more than it knows.)
  // The short form carries a tatweel before the mark. A combining character
  // with no base letter renders as a stray accent or a dotted circle depending
  // on the font; ـٰ gives it something to sit on.
  madda_normal:        {label:'Madd · unwritten', short:'Madd ـٰ'},
  // Derived by us, not by the annotation — see harfMaddPositions(). This is
  // madd asli / madd tabee'i proper: a madd letter carrying no vowel after its
  // matching harakah. It is the commonest madd in the Quran and the annotation
  // marks none of it, which left the commonest madd error impossible to record
  // against the word it happened on.
  madd_tabee:          {label:'Madd · natural',   short:'Madd 2'},
  madda_permissible:   {label:'Madd · permissible', short:'Madd 2-6'},
  madda_obligatory:    {label:'Madd · obligatory',  short:'Madd 4-5'},
  madda_necessary:     {label:'Madd · lazim',     short:'Madd 6'},
  ghunnah:             {label:'Ghunnah',          short:'Ghunnah'},
  ikhafa:              {label:'Ikhfa',            short:'Ikhfa'},
  ikhafa_shafawi:      {label:'Ikhfa shafawi',    short:'Ikhfa shaf.'},
  idgham_ghunnah:      {label:'Idghaam with ghunnah',    short:'Idgh. +gh'},
  idgham_wo_ghunnah:   {label:'Idghaam without ghunnah', short:'Idgh. −gh'},
  idgham_shafawi:      {label:'Idghaam shafawi',  short:'Idgh. shaf.'},
  idgham_mutajanisayn: {label:'Idghaam mutajanisayn', short:'Idgh. mutaj.'},
  idgham_mutaqaribayn: {label:'Idghaam mutaqaribayn', short:'Idgh. mutaq.'},
  iqlab:               {label:'Iqlab',            short:'Iqlab'},
  qalaqah:             {label:'Qalqalah',         short:'Qalqalah'},
};

// ── ONE RECORD, TWO PATHS ───────────────────────────────────────────
// Madd, Ghunnah and Qalqalah exist BOTH as mistake types in the row above and
// as rules in the row below, which meant the same observation could be stored
// two different ways depending on which the teacher tapped.
//
// Resolved by making the type the FAMILY and the rule the specific variant,
// and by keeping them in step automatically in both directions:
//   • picking a family type narrows the rule row to that family
//   • picking a rule retags the type to its family
// So "Madd → Madd 4-5" and "Tajweed → Madd 4-5" produce the identical record.
// The type ids are unchanged, so sessions already recorded still read correctly.
const RULE_FAMILY = {
  madda_normal:'madd', madda_obligatory:'madd', madda_permissible:'madd', madda_necessary:'madd',
  madd_tabee:'madd',
  ghunnah:'ghunnah',
  qalaqah:'qalqalah',
};

/* ── RUKU ─────────────────────────────────────────────────────────────
   api.quran.com's `ruku_number` is GLOBAL — al-Baqarah begins at ruku 2, not
   1 — and what a teacher says out loud is "the third ruku of al-Baqarah". So
   the first global ruku of each surah is needed to convert, and it cannot be
   derived from a loaded page: a page starting mid-surah never contains that
   surah's first verse. Fetched once from the same API and embedded.
   Checked: al-Baqarah 40 rukus, Al-Imran 20, 558 in total. */
const RUKU_FIRST = [
  1, 2, 42, 62, 86, 102, 122, 146, 156, 172, 183, 193, 205, 211, 218, 224, 240, 252, 264,
  270, 278, 285, 295, 301, 310, 316, 327, 334, 343, 350, 356, 360, 363, 372, 378, 383, 388, 393,
  398, 406, 415, 421, 426, 433, 436, 440, 444, 448, 452, 454, 457, 460, 462, 465, 468, 471, 474,
  478, 481, 484, 486, 488, 490, 492, 494, 496, 498, 500, 502, 504, 506, 508, 510, 512, 514, 516,
  518, 520, 522, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539,
  540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558,
];

// Page span of every surah, [start, end] flattened — 114 pairs. From the
// chapters endpoint, which reports it directly.
const SURAH_PAGES = [
  1, 1, 2, 49, 50, 76, 77, 106, 106, 127, 128, 150, 151, 176, 177, 186, 187, 207, 208, 221, 221, 235,
  235, 248, 249, 255, 255, 261, 262, 267, 267, 281, 282, 293, 293, 304, 305, 312, 312, 321, 322, 331, 332, 341,
  342, 349, 350, 359, 359, 366, 367, 376, 377, 385, 385, 396, 396, 404, 404, 410, 411, 414, 415, 417, 418, 427,
  428, 434, 434, 440, 440, 445, 446, 452, 453, 458, 458, 467, 467, 476, 477, 482, 483, 489, 489, 495, 496, 498,
  499, 502, 502, 506, 507, 510, 511, 515, 515, 517, 518, 520, 520, 523, 523, 525, 526, 528, 528, 531, 531, 534,
  534, 537, 537, 541, 542, 545, 545, 548, 549, 551, 551, 552, 553, 554, 554, 555, 556, 557, 558, 559, 560, 561,
  562, 564, 564, 566, 566, 568, 568, 570, 570, 571, 572, 573, 574, 575, 575, 577, 577, 578, 578, 580, 580, 581,
  582, 583, 583, 584, 585, 585, 586, 586, 587, 587, 587, 589, 589, 589, 590, 590, 591, 591, 591, 592, 592, 592,
  593, 594, 594, 594, 595, 595, 595, 596, 596, 596, 596, 596, 597, 597, 597, 597, 598, 598, 598, 599, 599, 599,
  599, 600, 600, 600, 600, 600, 601, 601, 601, 601, 601, 601, 602, 602, 602, 602, 602, 602, 603, 603, 603, 603,
  603, 603, 604, 604, 604, 604, 604, 604,
];

// Page each juz starts and ends on, and the global ruku it starts at.
// Boundaries can share a page: juz 3 ends on 62 and juz 4 begins on 62.
const JUZ_PAGE_START = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];

const JUZ_PAGE_END   = [21, 41, 62, 81, 101, 121, 141, 161, 181, 201, 221, 241, 261, 281, 301, 321, 341, 361, 381, 401, 421, 441, 461, 481, 502, 521, 541, 561, 581, 604];

const JUZ_FIRST_RUKU = [1, 18, 34, 51, 65, 82, 96, 115, 132, 150, 167, 183, 199, 218, 240, 261, 278, 295, 312, 330, 347, 366, 384, 401, 420, 440, 458, 478, 498, 520];

// Which surah a page belongs to: the last one that has begun by then. A page
// can hold the end of one surah and the start of another, and the one the
// reader is in when the page ends is the later one.
function surahOfPage(pg){
  for(let s = 114; s >= 1; s--) if(SURAH_PAGES[(s-1)*2] <= pg) return s;
  return 1;
}

function juzOfPage(pg){
  for(let j = 30; j >= 1; j--) if(JUZ_PAGE_START[j-1] <= pg) return j;
  return 1;
}

function _ord(n){
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

// verseKey -> global ruku number, filled from the page fetch.
const rukuByVerse = Object.create(null);

function surahRuku(surah, globalRuku){
  const base = RUKU_FIRST[surah - 1];
  return (base && globalRuku) ? (globalRuku - base + 1) : null;
}

/* A verse ENDS a ruku when the next verse belongs to a different one — which is
   where the ع sits in a printed mushaf. The last verse of a surah always ends
   one, and that case is decided without needing the next verse loaded. */
/* "1st of 40 in Al-Baqarah · 3rd of 12 in Juz 2".
   The juz figure is approximate at the edges by nature: a ruku can straddle a
   juz boundary, and this counts it in the juz it begins in. */
function rukuInfo(surah, globalRuku){
  const inSurah = surahRuku(surah, globalRuku);
  const surahTotal = (surah < 114 ? RUKU_FIRST[surah] : 559) - RUKU_FIRST[surah-1];
  let j = 30;
  while(j > 1 && JUZ_FIRST_RUKU[j-1] > globalRuku) j--;
  const inJuz    = globalRuku - JUZ_FIRST_RUKU[j-1] + 1;
  const juzTotal = (j < 30 ? JUZ_FIRST_RUKU[j] : 559) - JUZ_FIRST_RUKU[j-1];
  const name = (typeof SURAH_NAMES !== 'undefined' && SURAH_NAMES[surah-1]) || `Surah ${surah}`;
  return `${_ord(inSurah)} of ${surahTotal} ruku in ${name} · ${_ord(inJuz)} of ${juzTotal} in Juz ${j}`;
}

function rukuEndAt(surah, ayah){
  const g = rukuByVerse[`${surah}:${ayah}`];
  if(!g) return null;
  const nextKey = _nextVerseKey(`${surah}:${ayah}`);
  if(!nextKey) return surahRuku(surah, g);
  const [ns] = nextKey.split(':').map(Number);
  if(ns !== surah) return surahRuku(surah, g);      // surah end
  const gn = rukuByVerse[nextKey];
  if(!gn) return null;                              // next verse not loaded yet
  return gn !== g ? surahRuku(surah, g) : null;
}

function _nextVerseKey(key){
  const n = keyAbs(key);
  return Number.isFinite(n) ? keyFromAbs(n + 1) : null;
}

// ── ADDED vs MISSED ─────────────────────────────────────────────────
// Two different errors, and they need two different vocabularies.
//
// The whole reason the rule row is short is that the WORD narrows it: the
// annotation says which rules fall here, so the teacher picks from three or
// four rather than seventeen. That works only while the rule is genuinely
// present. When a student APPLIES a rule where none belongs — lengthens a
// letter that has no madd letter, nasalises a plain noon, bounces a letter
// that is not qalqalah — the annotation is useless by definition. The rule is
// not there; that is the error.
//
// So added mode builds from a fixed list instead. It is nine, not seventeen,
// because most of the distinctions between the seventeen only exist when the
// rule applies. The four madds are told apart by what FOLLOWS the madd letter
// — a hamzah gives muttasil or munfasil, a sukoon gives lazim, neither gives
// tabee'i. A student lengthening a letter with no madd letter at all has no
// hamzah-after and no sukoon-after, because there is nothing to be after.
// "Added madda_obligatory" would be a claim about a structure that is not in
// the text. Four options collapse to one. Idgham and ikhfa likewise: which
// variant applies is fixed by the letters present, so the letters decide it,
// not the teacher.
//
// Note the last three. ham_wasl, slnt and laam_shamsiyah are DEMOTED in missed
// mode as reading aids rather than errors — correct there, and backwards here.
// Pronouncing a silent letter, or a lam that should have assimilated, is
// exactly what a beginner does; and hamzat wasl is the commonest annotation in
// the Quran at 13,251 occurrences, which is 13,251 chances to read it wrongly.
// The ids are `add_*` and are deliberately NOT annotation rule ids.
//
// Reusing them was wrong twice over. `madda_normal` means madd tabee'i: a madd
// letter with no hamzah and no sukoon after it. A madd the student ADDED has no
// madd letter at all, so recording it under that id asserts a structure that is
// not in the text. And it would make the recurrence panel aggregate "shortened
// the natural madd" together with "lengthened something that was never a madd"
// — opposite errors under one heading, which is the `c0` mistake again.
//
// `fam` does two jobs: it retags the type so the record is identical however
// the teacher arrived, and it marks the three that auto-confirm when reached
// from their own family type. It does NOT hide them from the general list —
// all nine are offered under Tajweed, because that is the tab a teacher marking
// tajweed is already sitting in.
const ADDED_RULES = [
  {rule:'add_madd',      fam:'madd',     short:'Madd',        label:'Madd added',              hint:'lengthened where there is no madd letter'},
  {rule:'add_ghunnah',   fam:'ghunnah',  short:'Ghunnah',     label:'Ghunnah added',           hint:'nasalised where there is none'},
  {rule:'add_qalqalah',  fam:'qalqalah', short:'Qalqalah',    label:'Qalqalah added',          hint:'bounced a letter that is not qalqalah'},
  {rule:'add_ikhfa',     fam:null,       short:'Ikhfa',       label:'Ikhfa added',             hint:'hidden where it should be clear'},
  {rule:'add_idgham',    fam:null,       short:'Idghaam',     label:'Idghaam added',           hint:'merged where it should be clear'},
  {rule:'add_iqlab',     fam:null,       short:'Iqlab',       label:'Iqlab added',             hint:'changed where it should be clear'},
  // Silent letter, lam shamsiyyah and hamzat wasl are omitted for now. All
  // three are real added errors — pronouncing something that should not be
  // sounded is exactly what a beginner does — but nine chips made the row long
  // enough to scan rather than hit, which is the thing the row exists to avoid.
  // Add them back if they turn out to be marked often enough to be worth the
  // width; the ids are reserved and nothing else needs to change.
];

const ADDED_BY_FAMILY = {madd:'add_madd', ghunnah:'add_ghunnah', qalqalah:'add_qalqalah'};

// One place that knows about both vocabularies. Every display site goes through
// these rather than indexing TAJWEED_RULES directly — an `add_*` id is not in
// that table, so a direct lookup falls through to the raw id and the reader
// sees "add_madd".
function ruleLabel(id){
  const t = TAJWEED_RULES[id]; if(t) return t.label;
  const a = ADDED_RULES.find(r => r.rule === id); return a ? a.label : id;
}

// Which family a rule belongs to, across BOTH vocabularies.
//
// This is what lets `ghunnah` and `add_ghunnah` be grouped as one subject while
// staying two distinct errors: reporting groups on ruleFamily() and separates
// on subrule.err. It is also why ADDED_RULES still carries `fam` even though
// nothing retags the mistake type any more — the link lives in the data now
// rather than in the type id.
function ruleFamily(id){
  if(RULE_FAMILY[id]) return RULE_FAMILY[id];
  const a = ADDED_RULES.find(r => r.rule === id);
  return (a && a.fam) || null;
}

// The family of a whole sub-rule record, including the family-level entries
// that carry no `rule` at all. Reporting should call this rather than
// ruleFamily(sr.rule), which returns null for those.
function subruleFamily(sr){
  if(!sr) return null;
  if(sr.family) return sr.family;
  return sr.rule ? ruleFamily(sr.rule) : null;
}

// For chips and pills. The added forms return their full label, because it is
// already short and because "Madd" alone would be indistinguishable from the
// natural madd sitting beside it in the same list.
function ruleShort(id){
  const t = TAJWEED_RULES[id]; if(t) return t.short;
  const a = ADDED_RULES.find(r => r.rule === id); return a ? a.label : id;
}

// ═══════════════════════════════════════════════════════════════════
// MISTAKES LIST
// ═══════════════════════════════════════════════════════════════════
// Thin alias kept because it reads better at the ~10 call sites that only
// want the class name. The mapping itself lives in SEVERITY.
function _sevClassForCorr(corr){ return sev(corr).cls; }

// ── HIGHLIGHTING THE MARKED LETTER ──────────────────────────────────
// Finds the idx-th base letter in a display string and returns its character
// span, absorbing the diacritics that follow it so the mark travels with its
// letter rather than being orphaned.
//
// The counting rule MUST match wordLetters(): skip combining marks, skip
// tatweel, count everything else that normalises into the makhraj table — so
// the two agree without the viewer needing a copy of that table.
//
// U+0671 ALIF WASLA is included explicitly and is easy to miss: it sits
// OUTSIDE the U+0621-U+064A block, it opens a very large share of Quranic
// words (ٱلْـ), and wordLetters() folds it to alif. Leaving it out shifted every
// letter index by one on any word beginning with it.
const _AR_BASE = /[\u0621-\u063F\u0641-\u064A\u0671]/;

function letterSpanAt(text, idx){
  const ch = [...(text || '')];
  let n = -1;
  for(let k = 0; k < ch.length; k++){
    if(/\p{Mn}/u.test(ch[k])) continue;
    if(!_AR_BASE.test(ch[k])) continue;
    if(++n === idx){
      let end = k;
      while(end + 1 < ch.length && /\p{Mn}/u.test(ch[end + 1])) end++;
      return [k, end];
    }
  }
  return null;
}

// The word with its marked letter wrapped. Returns escaped HTML either way.
//
// The wrapper carries ONLY colour, background and text-decoration. Anything
// that creates a layout box — padding, margin, border, inline-block — breaks
// Arabic cursive joining across the span boundary and the word visibly falls
// apart. This is why the highlight is an underline and a tint rather than a
// bordered pill.
function wordWithLetter(m){
  const text = m.word || '';
  const sr = m.subrule;
  if(!sr || typeof sr.letterIndex !== 'number') return esc(text);
  const span = letterSpanAt(text, sr.letterIndex);
  if(!span) return esc(text);
  const ch = [...text];
  return esc(ch.slice(0, span[0]).join(''))
       + '<span class="lt-hit">' + esc(ch.slice(span[0], span[1] + 1).join('')) + '</span>'
       + esc(ch.slice(span[1] + 1).join(''));
}

// Severity for a MISTAKE, which is not the same question as severity for a
// correction id. Tajweed types have no intervention level at all, so they get
// their own treatment rather than falling through to sev-0.
//
// Gated on the type's category and NOT merely on a null correction: legacy
// mistakes exist with no correction recorded, and those are ordinary hifz
// mistakes that must keep reading as level 0.
function isTajweedMistake(m, cfg){
  const t = resolveType(cfg || m.typeConfig || null, m.type);
  return !!(t && t.category === 'tajweed');
}

function sevForMistake(m, cfg){
  return isTajweedMistake(m, cfg) ? SEVERITY.tajweed : sev(m.correction);
}

// What the level slot should say. For tajweed that is the rule and, when the
// teacher named one, the letter — which is the information intervention would
// have occupied that space with.
function mLevelText(m, cfg){
  if(!isTajweedMistake(m, cfg)) return mCorrLabel(m, cfg);
  const sr = m.subrule;
  if(sr && sr.letter) return `Tajweed · ${sr.letter}`;
  if(sr && sr.rule)   return sr.label || ruleLabel(sr.rule) || 'Tajweed';
  // Family-level: the teacher tapped Madd/Ghunnah/Qalqalah and committed
  // without naming a rule. The family IS what they said, so it has to show;
  // falling through to a bare 'Tajweed' threw it away.
  if(sr && sr.family) return sr.label || (getType(sr.family)||{}).label || 'Tajweed';
  return 'Tajweed';
}

function rvSetListOpen(v){ _rvListOpen = !!v; }

/* The chart is navigation, not decoration: a bar narrows the list below to that
   page. stopPropagation is not needed — the bars sit inside .seg-stat, whose
   own onclick would otherwise also toggle the segment filter, so the handler
   below is bound on the button and the card's handler is suppressed in CSS via
   pointer-events on .plc. */
function _rvApplyPageFilter(segs, ml){
  if(!_rvPageFilter) return ml;
  const out = ml.filter(m=>pageForVerse(m.surah, m.ayah) === _rvPageFilter);
  /* A page with no mistakes is a legitimate thing to tap — the bar is a visible
     floor, not an absence. Returning an empty list would read as a bug, so the
     filter declines rather than emptying the section. */
  return out.length ? out : ml;
}

/* Two lists, each rendered only when it has entries.
   A teacher who never marks tajweed sees exactly what they saw before — one
   list, one heading — which is most sessions. The split appears only when both
   are present, and when only tajweed is present it appears alone rather than
   hiding under a heading that says "Mistakes by verse" and lists none of the
   memorisation ones a reader would expect. */
function _rvVersesSplit(ml, cfg){
  const hifz = (ml||[]).filter(m=>!isTajweedMistake(m,cfg));
  const taj  = (ml||[]).filter(m=>isTajweedMistake(m,cfg));
  if(!hifz.length && !taj.length) return _rvVerses(ml, cfg);   // empty state
  let h = '';
  if(hifz.length) h += _rvVerses(hifz, cfg, taj.length ? 'Memorisation — by verse' : null);
  if(taj.length)  h += _rvVerses(taj,  cfg, 'Tajweed — by verse', true);
  return h;
}

// ── Strength: the headline number, with per-segment detail underneath ──
/* Absence is not perfection — the rule we wrote for tajweed and never applied
   back to memorisation.
   A tajweed-only session has no memorisation mistakes because none were being
   listened for, and strength-v3 divides by what was recited, so it returns a
   high score for a session that assessed nothing. That is the same invented
   result as reporting a clean tajweed section for a teacher who was not
   marking tajweed.
   Keyed on the session's FOCUS, declared or inferred, never on "there happen to
   be no hifz mistakes" — a genuinely flawless recitation must still score. */
function _rvStrength(s, ml){
  const segs = s.segments || [];
  const hifzAssessed = sessionFocus(s) !== 'tajweed';
  const score = hifzAssessed ? sessionStrength(segs, ml) : null;
  const scorable = segs.filter(segmentScorable);
  const verses = scorable.reduce((n,sg)=>n+segVerseCount(segOrdered(sg)),0);
  /* Without this the dial falls to strengthBand(null) — "Not enough recited" —
     which is the wrong reason. Plenty was recited; memorisation simply was not
     what was being listened for, and a reader told the wrong reason will go
     looking for a fault in the recording. */
  const sub = !hifzAssessed
    ? 'Tajweed session — memorisation was not assessed'
    : scorable.length
      ? `${verses} verses recited across ${scorable.length} segment${scorable.length>1?'s':''}`
      : 'No fully-recited range recorded for this session';

  const segCards = segs.map(sg=>{
    const o = segOrdered(sg);
    const name = sg.rangeLabel || describeRange(o.startKey,o.endKey) || '—';
    const stage = sessionTypeLabel(sg.type);
    if(sg.mode==='spot'){
      const t = spotTally(sg.spots||s.spotTest?.spots||[]);
      const done = t.pass+t.partial+t.fail;
      return `<div class="seg-stat spot${_rvSegFilter===sg.id?' sel':''}" onclick="rvFilterSegment('${sg.id}')"
                   title="Show only this segment's mistakes below">
        <div class="seg-stat-head"><span class="seg-stat-name">${esc(name)}</span><span class="seg-stat-stage">${esc(stage)} · Spot</span></div>
        <div class="seg-stat-body">${done?`<strong>${t.pass}/${done}</strong> passed`:'Not assessed'}${t.none?` · ${t.none} unassessed`:''}</div>
      </div>`;
    }
    const v = segmentStrength(segs, sg, ml);
    const b = strengthBand(v);
    const clean = cleanVerseStats(segs, sg, ml);
    const run   = longestCleanRun(segs, sg, ml);
    /* The chart lives inside this card, whose onclick toggles the segment
       filter. Without stopPropagation on the bars, tapping a page would also
       toggle the segment — and rvFilterSegment() clears _rvPageFilter, so the
       pick would undo itself in the same gesture. */
    return `<div class="seg-stat${_rvSegFilter===sg.id?' sel':''}" onclick="rvFilterSegment('${sg.id}')"
                 title="Show only this segment's mistakes below">
      <div class="seg-stat-head"><span class="seg-stat-name">${esc(name)}</span><span class="seg-stat-stage">${esc(stage)}</span></div>
      <div class="seg-stat-body">
        <span class="seg-stat-score" style="color:${b.color};">${v==null?'—':v+'%'}</span>
        <span class="seg-stat-band" style="color:${b.color};">${b.label}</span>
        ${clean?`<span class="seg-stat-clean">${clean.clean}/${clean.total} clean (${clean.pct}%)</span>`:''}
      </div>
      ${run?`<div class="seg-stat-run" title="Longest unbroken run of mistake-free verses.">
        longest clean run <strong>${run}</strong> of ${clean?clean.total:'?'}
      </div>`:''}
      ${pageLoadChartHTML(segs, sg, ml)}
    </div>`;
  }).join('');

  return strengthCardHTML(score, 'Memorization strength', sub)
       + (segCards?`<div class="seg-stats">${segCards}</div>`:'');
}

// ── Charts: type frequency bars + intervention donut ──────────────
function _rvCharts(ml, cfg, types, t){
  // migrateId on both sides: a session can hold mistakes saved under an older
  // id than its own typeConfig lists, which made every bar read zero.
  const tc   = Object.fromEntries(types.map(id=>[id, ml.filter(m=>migrateId(m.type)===migrateId(id)).length]));
  if(!types.length){
    return `<div class="charts-row"><div class="chart-box"><h4>Mistake types</h4>
      <div class="chart-note">No mistakes recorded</div></div>
      ${_rvDonut(t)}</div>`;
  }
  // Split by category rather than one mixed ranking. A hifz count and a tajweed
  // count are not the same measurement — tajweed errors scale with how many
  // opportunities the passage offered, hifz errors with how much was recalled —
  // so ranking them against each other in one list invites a comparison that
  // isn't there (DECISIONS_metric_split.md, "same question, different subject").
  const catOf = id => resolveType(cfg,id).category || 'other';
  const tajIds  = types.filter(id=>catOf(id)==='tajweed');
  const hifzIds = types.filter(id=>catOf(id)!=='tajweed');
  // Headings appear only when both are present. With one category the chart is
  // byte-for-byte what it was before, which is most sessions.
  const split = tajIds.length>0 && hifzIds.length>0;
  const group = (ids,label)=>{
    if(!ids.length) return '';
    // Normalised within the group: a full bar means "the most of this kind",
    // not "the most overall". Across groups the lengths are not comparable,
    // which is exactly why they are separated.
    const mx = Math.max(1, ...ids.map(id=>tc[id]));
    return (split?`<div class="bar-group-h">${label}</div>`:'') + ids.map(id=>
      `<div class="bar-row"><div class="bar-label">${typeLabelFor(cfg,id)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(tc[id]/mx*100)}%;background:${resolveType(cfg,id).color||'var(--ink3)'};"></div></div><div class="bar-count">${tc[id]}</div></div>`
    ).join('');
  };
  return `<div class="charts-row">
    <div class="chart-box"><h4>Mistake types</h4><div class="bar-chart">
      ${group(hifzIds,'Memorisation')}${group(tajIds,'Tajweed')}
    </div></div>
    ${_rvDonut(t)}
  </div>`;
}

// Pulled out so the empty-state branch above can render it without duplicating.
function _rvDonut(t){
  const corrData = [
    {label:'Lvl 0 · None',   val:t.c0, color:sev('c0').color},
    {label:'Lvl 1 · Repeat', val:t.c1, color:sev('c1').color},
    {label:'Lvl 2 · Hint',   val:t.c2, color:sev('c2').color},
    {label:'Lvl 3 · Taught', val:t.c3, color:sev('c3').color},
    {label:'Other',          val:t.c4, color:'var(--ink2)'},
  ];
  // The ring was drawn against t.total while the slices summed to t.scored, so
  // a session with tajweed marks rendered a ring with an unexplained gap the
  // size of the tajweed count, above a centre number the legend rows did not
  // add up to. Both now count scored mistakes, and the tajweed count is stated
  // beneath rather than being silently absent.
  return `<div class="chart-box"><h4>Teacher intervention</h4><div class="chart-note">How much help was needed per mistake</div>
      <div class="donut-wrap">${donutSVG(corrData,t.scored)}<div class="donut-center"><span class="big">${t.scored}</span><span class="lbl">scored</span></div></div>
      <div class="donut-legend">${corrData.map(d=>`<div class="dl-row"><div class="dl-dot" style="background:${d.color};"></div><span>${d.label} — ${d.val}</span></div>`).join('')}</div>
      ${t.tajweed?`<div class="dl-note">+ ${t.tajweed} tajweed — intervention level does not apply</div>`:''}
    </div>`;
}

// ── Active-filter banner ──────────────────────────────────────────
// Without this the narrowed figures below would look like the session's real
// totals — a filter that changes numbers silently is worse than no filter.
function _rvFilterBar(seg, shown, total){
  if(!seg) return '';
  const o = segOrdered(seg);
  const name = seg.rangeLabel || describeRange(o.startKey, o.endKey) || 'this segment';
  return `<div class="rv-filterbar">
    <span class="rv-filterbar-icon">⧉</span>
    <span>Showing <strong>${esc(name)}</strong> only — ${shown} of ${total} mistakes</span>
    <button onclick="rvFilterSegment(null)">Show all</button>
  </div>`;
}

// ── Work on these next ────────────────────────────────────────────
function _rvFocus(ml, cfg){
  /* Hifz only. The ranking is weight x recurrence x recency, and weight comes
     from the intervention level — which tajweed does not have, so a tajweed
     mistake would enter at the c0 fall-through and be ranked as the mildest
     thing present. Tajweed gets its own list ranked by rule recurrence, which
     is the question actually worth asking of it. */
  const top = focusAyahs((ml||[]).filter(m=>!isTajweedMistake(m, cfg)), 5);
  if(top.length < 2) return '';   // a "top 5" of one is just the mistake list
  return `<div class="rv-focus">
    <div class="rv-focus-title">Work on these next</div>
    <div class="rv-focus-rows">${top.map((f,i)=>{
      const b = sev(f.worst);
      return `<div class="rv-focus-row" onclick="closeModal('reviewModal');navigateToVerse(${f.surah},${f.ayah},1)"
                   title="Jump to ${f.key} in the mushaf">
        <span class="rv-focus-rank">${i+1}</span>
        <span class="rv-focus-ref">${SURAH_NAMES[f.surah-1]||''} <strong>${f.surah}:${f.ayah}</strong></span>
        <span class="rv-focus-words">${esc(f.words.slice(0,3).join(' · '))}</span>
        <span class="rv-focus-n ${b.cls}">${f.hits}&times;</span>
      </div>`;
    }).join('')}</div>
    <div class="rv-focus-note">Ranked by how much help each ayah needed and how often it broke down.</div>
  </div>`;
}

// ── Mistakes grouped by verse, each with its RTL context strip ────
function _rvVerses(ml, cfg, heading, isTajweed){
  const byAyah={};
  ml.forEach(m=>{const k=`${m.surah}:${m.ayah}`;(byAyah[k]=byAyah[k]||[]).push(m);});
  const keys=Object.keys(byAyah).sort((a,b)=>{
    const[as,aa]=a.split(':').map(Number),[bs,ba]=b.split(':').map(Number);
    return as-bs||aa-ba;
  });
  // Collapsed by default: past a handful of mistakes the full list dominates
  // the modal and buries the summary above it. <details> keeps it one tap away
  // with no state to manage and no JS to go stale.
  let h=`<details class="rv-details${isTajweed?' tajweed':''}"${_rvListOpen?' open':''} ontoggle="rvSetListOpen(this.open)"><summary class="rv-summary">
      <span>${esc(heading || 'Mistakes by verse')}</span>
      <span class="rv-summary-n">${ml.length}</span>
      <span class="rv-chev">▾</span>
    </summary><div class="rv-details-body">`;
  keys.forEach(key=>{
    const[sn]=key.split(':').map(Number);
    const ayahM=[...byAyah[key]].sort((a,b)=>a.wordPos-b.wordPos);
    // Header line: just the mistaken words, with … standing in for the gaps
    let wordHtml='', lastPos=0;
    ayahM.forEach(m=>{
      if(m.wordPos>lastPos+1) wordHtml+=`<span class="rv-gap">…</span>`;
      wordHtml+=`<span class="rw-type-tag ${sev(m.correction).cls}" style="font-size:1.1em;font-weight:700;${typeWordStyle(cfg,m.type)}">${m.word}</span> `;
      lastPos=m.wordPos;
    });
    h+=`<div class="review-verse">
      <div class="review-verse-ref">${key} — ${SURAH_NAMES[sn-1]||''}</div>
      <div class="review-verse-arabic">${wordHtml}</div>
      <div>${ayahM.map(m=>_rvMistakeRow(m,cfg)).join('')}</div>
    </div>`;
  });
  return h + `</div></details>`;
}

// ── One mistake: badges, then the word in context ─────────────────
// Severity drives the background (via the shared .sev-N classes) and the
// row's left border; mistake type keeps the text colour and underline as a
// secondary signal. Unlike the mushaf, there's no clash here — this is
// serif text on parchment, not a QCF glyph on a coloured wash.
function _rvMistakeRow(m, cfg){
  const mt   = resolveType(cfg, m.type);
  const tCol = mt.color || 'var(--ink2)';
  const tBdr = mt.borderColor || mt.color || 'var(--border2)';
  const bef  = (m.context?.before||[]).join(' ');
  const aft  = (m.context?.after ||[]).join(' ');
  /* sevForMistake, not sev(m.correction). A tajweed mistake has no correction,
     so sev() falls to SEVERITY.c0 — green, "recovered unaided" — which is a
     claim no teacher made and the exact fall-through this whole feature exists
     to remove. It survived here because the row reads the field directly
     rather than going through the helper that knows better. */
  const target = `<span class="rv-ctx-target ${sevForMistake(m,cfg).cls}" style="color:${tCol};border-bottom-color:${tBdr};">${m.word}</span>`;
  // dir=rtl: `before` is written first but renders rightmost.
  const ctxHtml = `<div class="rv-ctx">`
    + (bef?`<span class="rv-ctx-side">${bef}</span> `:'')
    + target
    + (aft?` <span class="rv-ctx-side">${aft}</span>`:'')
    + `</div>`;
  return `<div class="rv-mistake rml-item" style="border-left-color:${sevForMistake(m,cfg).color};">
    <div class="rv-mistake-top">
      <span class="m-badge" style="${typeBadgeStyle(cfg,m.type)}">${mTypeLabel(m,cfg)}</span>
      <span class="rv-ref">${m.surah}:${m.ayah}</span>
      ${mistakeTimeText(m)?`<span class="rv-time" title="${mistakeTimeTitle(m)}">${mistakeTimeText(m)}</span>`:''}
      <!-- mLevelText: the letter and its makhraj, or the rule name, in the slot
           the intervention level occupies for memorisation. mCorrLabel here
           printed "Lvl 0 · No intervention" against every tajweed mark and
           threw away the specificity the teacher took the trouble to record. -->
      <span class="m-corr ${isTajweedMistake(m,cfg) ? 'c-tajweed' : corrClass2[m.correction]}" style="font-size:12px;margin-left:auto;">${mLevelText(m,cfg)}</span>
    </div>
    ${ctxHtml}
    ${m.note?`<div class="rml-note" style="padding:0 4px;font-size:12px;">${esc(m.note)}</div>`:''}
  </div>`;
}

// ── Strength card ─────────────────────────────────────────────────
// The arc is a dial rather than a bar: it reads as a gauge, and the value's
// own band colour fills it, so the number and the colour say the same thing.
function strengthArcSVG(v, color){
  const pct = v==null ? 0 : Math.max(0, Math.min(100, v));
  const r=30, C=Math.PI*r;                      // half-circle circumference
  return `<svg viewBox="0 0 76 44" class="str-arc">
    <path d="M8 38 A${r} ${r} 0 0 1 68 38" fill="none" stroke="var(--parchment3)" stroke-width="7" stroke-linecap="round"/>
    <path d="M8 38 A${r} ${r} 0 0 1 68 38" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${(pct/100*C).toFixed(1)} ${C.toFixed(1)}"/>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════════
// TEXT REPORT — WhatsApp-friendly format, fixed RTL context order
// ═══════════════════════════════════════════════════════════════════
/* ── WHAT THE SESSION WAS FOR ────────────────────────────────────────
   Inferred from what was marked, overridable by the teacher.

   The inference is right almost always and costs nothing to make. But it
   cannot distinguish the two things an EMPTY category means: a tajweed
   session where nothing went wrong, and a hifz session where tajweed was
   simply not being listened for. Those are opposite, and only the teacher
   knows which.

   So the declaration is what turns absence into evidence. Without it, zero
   tajweed mistakes says nothing and the report must stay silent; with it,
   "this was a tajweed session and nothing was marked" is a clean bill worth
   printing.

   Stored only when it DIFFERS from the inference. A field that merely repeats
   what can be derived goes stale the moment a mistake is edited. */
function inferSessionFocus(s){
  const ml = (s && s.mistakes) || [];
  const cfg = (s && s.typeConfig) || null;
  let hifz = false, taj = false;
  ml.forEach(m => { if(isTajweedMistake(m, cfg)) taj = true; else hifz = true; });
  if(hifz && taj) return 'both';
  if(taj) return 'tajweed';
  if(hifz) return 'hifz';
  return null;                    // nothing logged — the inference has no view
}

function sessionFocus(s){
  return (s && s.focus) || inferSessionFocus(s);
}

const FOCUS_LABEL = {hifz:'Memorisation', tajweed:'Tajweed', both:'Memorisation & tajweed'};

// ── TOPBAR HIDE / SHOW — body.topbar-hidden pattern ──
function setTopbarHidden(hide){
  document.body.classList.toggle('topbar-hidden', hide);
}

// Spot testing is no longer armed from Settings — it is a segment mode, turned
// on by adding a "+ Spot test" segment. spotState.enabled is set by
// startSegmentSpotTest and cleared by closeSpotTesting.


// The topbar Spots button re-opens a panel that a running test already opened,
// so it appears when a test starts and goes when it ends — it is no longer


// Fully turns the feature off — not just hiding the button, since the
// keyboard shortcut ('a') would otherwise still work with no visible control
// left to explain what just happened.
function toggleAutoscrollEnabled(){
  _applyAutoscrollToggle(!appSettings.autoscrollEnabled);
}

// ── GENERATION LOGIC ─────────────────────────────────────────────
// SURAH_START_PAGES[i] = page number where surah (i+1) begins in the standard
// 604-page Medina mushaf, sourced from quran.com. Used to resolve page→surah.
const SURAH_START_PAGES = [
  1,2,50,77,106,128,151,177,187,208,
  221,235,249,255,262,267,282,293,305,312,
  322,332,342,350,359,367,377,385,396,404,
  411,415,418,428,434,440,446,453,458,467,
  477,483,489,496,499,502,507,511,515,518,
  520,523,526,528,531,534,537,542,545,549,
  551,553,554,556,558,560,562,564,566,568,
  570,572,574,575,577,578,580,582,583,585,
  586,587,587,589,590,591,591,592,593,594,
  595,595,596,596,597,597,598,598,599,599,
  600,600,601,601,601,602,602,602,603,603,
  603,604,604,604,
];

// Exact first verse of each juz (authoritative data from quran.com)
const JUZ_START_VERSES = [
  {s:1,a:1},   {s:2,a:142}, {s:2,a:253}, {s:3,a:93},  {s:4,a:24},
  {s:4,a:148}, {s:5,a:82},  {s:6,a:111}, {s:7,a:88},  {s:8,a:41},
  {s:9,a:93},  {s:11,a:6},  {s:12,a:53}, {s:15,a:1},  {s:17,a:1},
  {s:18,a:75}, {s:21,a:1},  {s:23,a:1},  {s:25,a:21}, {s:27,a:56},
  {s:29,a:46}, {s:33,a:31}, {s:36,a:28}, {s:39,a:32}, {s:41,a:47},
  {s:46,a:1},  {s:51,a:31}, {s:58,a:1},  {s:67,a:1},  {s:78,a:1}
];

// Given a surah:ayah, return the juz number (1-30) it belongs to — no network call needed.
function juzForVerse(surah, ayah){
  for(let j=JUZ_START_VERSES.length-1; j>=0; j--){
    const start = JUZ_START_VERSES[j];
    if(surah > start.s || (surah === start.s && ayah >= start.a)) return j+1;
  }
  return 1;
}

// ── NAVIGATION ───────────────────────────────────────────────────
// loadJuz() guards itself with _isFetchingJuz and returns immediately when a
// fetch is already running, so anything that navigates must wait for the
// current one to finish or it quietly does nothing.
function whenJuzIdle(cb, tries){
  tries = tries===undefined ? 240 : tries;   // ~4s at 60fps, then try anyway
  if(!_isFetchingJuz || tries<=0){ cb(); return; }
  requestAnimationFrame(()=>whenJuzIdle(cb, tries-1));
}

// Awaitable form, for async callers. loadJuz() bails silently when a fetch is
// already in flight, so any request made while the infinite scroller is
// appending a juz is dropped without a trace — which is exactly why tapping a
// spot outside the loaded juz appeared to do nothing at all.
function juzIdle(tries){ return new Promise(res => whenJuzIdle(res, tries)); }

// Draw the right-gutter gold track for the active spot.
// Track runs from first word of spot's start verse to last word of scope-end verse.
// Convert a surah:ayah to its approximate mushaf page number using SURAH_START_PAGES.
// Uses the same linear interpolation as randomSpotFromPage (the inverse direction).
// ── EXACT PAGE BOUNDARIES ─────────────────────────────────────────
// Absolute verse index (1-6236) of the first verse of each mushaf page; entry
// n is page n+1. Generated by scripts/build_page_table.py from api.quran.com,
// the same source the apps fetch page content from. See HANDOFF §11.2.
//
// Hardcoded because page boundaries must be exact, identical on every device,
// and available offline. What replaced it was a linear interpolation across
// each surah's page span — near-exact for the 58 surahs of two pages or fewer,
// and materially wrong across the 20 long surahs that hold 347 of the 604
// pages. Memorization strength is measured per page, so a boundary that
// varied by device could never be compared across sessions or re-scored.
const PAGE_FIRST_VERSE_ABS = [
  1,8,13,24,32,37,45,56,65,69,77,84,91,96,101,109,
  113,120,127,134,142,149,153,161,171,177,184,189,194,198,204,210,
  218,223,227,232,238,241,245,253,256,260,264,267,272,277,282,289,
  290,294,303,309,316,323,331,339,346,355,364,371,377,385,394,402,
  409,415,426,434,442,447,451,459,467,474,480,488,494,500,505,508,
  513,517,520,527,531,538,545,553,559,568,573,580,585,588,595,599,
  607,615,621,628,634,641,648,656,664,669,672,675,679,683,687,693,
  701,706,711,715,720,727,734,740,746,752,759,765,773,778,783,790,
  798,808,817,825,834,842,849,858,863,871,880,884,891,900,908,914,
  921,927,932,936,941,947,955,966,977,985,992,998,1006,1012,1022,1028,
  1036,1042,1050,1059,1075,1085,1092,1098,1104,1110,1114,1118,1125,1133,1142,1150,
  1161,1169,1177,1186,1194,1201,1206,1213,1222,1230,1236,1242,1249,1256,1262,1267,
  1272,1276,1283,1290,1297,1304,1308,1315,1322,1329,1335,1342,1347,1353,1358,1365,
  1371,1379,1385,1390,1398,1407,1418,1426,1435,1443,1453,1462,1471,1479,1486,1493,
  1502,1511,1519,1527,1536,1545,1555,1562,1571,1582,1591,1601,1611,1619,1627,1634,
  1640,1649,1660,1666,1675,1683,1692,1700,1708,1713,1721,1726,1736,1742,1750,1756,
  1761,1769,1775,1784,1793,1803,1818,1834,1854,1873,1893,1908,1916,1928,1936,1944,
  1956,1966,1974,1981,1989,1995,2004,2012,2020,2030,2037,2047,2057,2068,2079,2088,
  2096,2105,2116,2126,2134,2145,2156,2161,2168,2175,2186,2194,2202,2215,2224,2238,
  2251,2262,2276,2289,2302,2315,2327,2346,2361,2386,2400,2413,2425,2436,2447,2462,
  2474,2484,2494,2508,2519,2528,2541,2556,2565,2574,2585,2596,2601,2611,2619,2626,
  2634,2642,2651,2660,2668,2674,2691,2701,2716,2733,2748,2763,2778,2792,2802,2812,
  2819,2823,2828,2835,2845,2850,2853,2858,2867,2876,2888,2899,2911,2923,2933,2952,
  2972,2993,3016,3044,3069,3092,3116,3139,3160,3173,3182,3195,3204,3215,3223,3236,
  3248,3258,3266,3274,3281,3288,3296,3303,3312,3323,3330,3337,3347,3355,3364,3371,
  3379,3386,3393,3404,3415,3425,3434,3442,3451,3460,3470,3481,3489,3498,3504,3515,
  3524,3534,3540,3549,3556,3564,3569,3577,3584,3588,3596,3607,3614,3621,3629,3638,
  3646,3655,3664,3672,3679,3691,3699,3705,3718,3733,3746,3760,3776,3789,3813,3840,
  3865,3891,3915,3942,3971,3987,3997,4013,4032,4054,4064,4069,4080,4090,4099,4106,
  4115,4126,4133,4141,4150,4159,4167,4174,4183,4192,4200,4211,4219,4230,4239,4248,
  4257,4265,4273,4283,4288,4295,4304,4317,4324,4336,4348,4359,4373,4386,4399,4415,
  4433,4454,4474,4487,4496,4506,4516,4525,4531,4539,4546,4557,4565,4575,4584,4593,
  4599,4607,4612,4617,4624,4631,4646,4666,4682,4706,4727,4750,4767,4785,4811,4829,
  4853,4874,4896,4918,4942,4969,4996,5030,5056,5079,5087,5094,5100,5105,5111,5116,
  5126,5130,5136,5143,5151,5156,5162,5169,5178,5186,5193,5200,5209,5218,5223,5230,
  5237,5242,5254,5268,5287,5314,5332,5358,5386,5415,5430,5448,5461,5476,5495,5513,
  5543,5571,5597,5617,5642,5673,5703,5728,5759,5801,5830,5855,5883,5910,5932,5964,
  5994,6017,6044,6073,6099,6126,6138,6156,6177,6194,6208,6222,
];

// Page containing an absolute verse index. Exact: a binary search for the last
// page whose first verse is at or before this one.
function pageForAbs(abs){
  if(!abs || abs < 1) return 1;
  let lo = 0, hi = PAGE_FIRST_VERSE_ABS.length - 1, ans = 0;
  while(lo <= hi){
    const mid = (lo + hi) >> 1;
    if(PAGE_FIRST_VERSE_ABS[mid] <= abs){ ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans + 1;
}

function pageForVerse(surah, ayah){ return pageForAbs(absVerse(surah, ayah)); }

// First and last absolute verse index on a page.
function pageBoundsAbs(pg){
  if(pg < 1 || pg > 604) return null;
  return {first: PAGE_FIRST_VERSE_ABS[pg-1],
          last:  pg < 604 ? PAGE_FIRST_VERSE_ABS[pg] - 1 : 6236};
}

// How much of the mushaf a verse range covers, measured in pages, fractionally.
// Each page contributes the share of ITS verses that fall inside the range, so
// a whole page counts 1 and half of one counts 0.5.
//
// Why fractional rather than counting pages touched: a two-verse sabaq and a
// full page would otherwise both count as one page, and the two-verse one would
// score as though it were ten times more solid than it is.
//
// The share is by verse count within the page, not by words. Verse lengths vary
// enormously ACROSS the Quran, which is the whole reason for moving off a
// per-verse measure — but within a single page they are far more even, so this
// is a good approximation and, unlike words, it is exactly computable offline.
function pageExtent(aAbs, bAbs){
  if(!aAbs || !bAbs) return 0;
  let a = aAbs, b = bAbs;
  if(a > b) [a, b] = [b, a];
  const p1 = pageForAbs(a), p2 = pageForAbs(b);
  let sum = 0;
  for(let p = p1; p <= p2; p++){
    const bd = pageBoundsAbs(p);
    if(!bd) continue;
    const lo = Math.max(a, bd.first), hi = Math.min(b, bd.last);
    if(hi >= lo) sum += (hi - lo + 1) / (bd.last - bd.first + 1);
  }
  return +sum.toFixed(4);
}

// Fractional page extent of a segment, from its verse keys.
function segPageExtent(sg){
  const s = segOrdered(sg || {});
  if(!keyValid(s.startKey) || !keyValid(s.endKey)) return 0;
  return pageExtent(keyAbs(s.startKey), keyAbs(s.endKey));
}

/* Colour of a bar: worst intervention on that page, matching the levels used
   everywhere else so the chart needs no legend of its own. */
function _pageLoadColor(worst){
  if(worst === 'c3') return 'var(--red)';
  if(worst === 'c2') return 'var(--lvl2-orange)';
  if(worst === 'c1') return 'var(--lvl1-yellow)';
  if(worst) return 'var(--ink3)';          // c0 / c4 — recorded, but no help given
  return null;
}

function pageLoadChartHTML(segs, seg, mistakes){
  const pages = segPageLoads(segs, seg, mistakes);
  if(!pages || pages.length < 1) return '';
  const max = Math.max(...pages.map(p=>p.load), 1);

  /* Right-to-left, like the mushaf: page numbers advance the way the pages
     turn, so a hafiz reads the chart in the same direction as the text. The
     axis sits on the right for the same reason — it is the origin edge. */
  const bars = pages.map(p=>{
    const pct = p.load > 0 ? Math.max(6, Math.round(p.load / max * 100)) : 0;
    const col = _pageLoadColor(p.worst) || 'var(--border2)';
    const part = p.covered < 0.999 ? ` · ${Math.round(p.covered*100)}% of page in range` : '';
    const tip = p.count
      ? `Page ${p.page} — ${p.count} mistake${p.count===1?'':'s'}, weight ${p.load}${part}`
      : `Page ${p.page} — clean${part}`;
    return `<button class="plc-col${_rvPageFilter===p.page?' sel':''}" title="${esc(tip)}"
              onclick="event.stopPropagation();rvFilterPage(${p.page})">
        <span class="plc-bar-wrap">
          ${p.load>0
            ? `<span class="plc-bar" style="height:${pct}%;background:${col};"></span>`
            : `<span class="plc-clean"></span>`}
        </span>
        <span class="plc-num">${p.page}</span>
      </button>`;
  }).join('');

  const worstPage = pages.reduce((a,p)=>(p.load>(a?a.load:0)?p:a), null);
  const caption = worstPage && worstPage.load > 0
    ? `heaviest on page ${worstPage.page}`
    : 'no mistakes recorded';

  return `<div class="plc" title="Weighted mistakes per page. Bar height uses the same level weights as the strength score; colour is the worst intervention on that page. Pages run right to left, as the mushaf does.">
    <div class="plc-head"><span>MISTAKES PER PAGE</span><span class="plc-cap">${esc(caption)}</span></div>
    <div class="plc-plot">
      <div class="plc-cols">${bars}</div>
      <div class="plc-axis"><span>${max}</span><span>0</span></div>
    </div>
  </div>`;
}

// Both of these render in the READER's own timezone and date format, from the
// stored UTC instant. `dateYMD` (the teacher's calendar day) is still written
// into every session as a stable fallback, but display follows the machine —
// a changed timezone is rare enough that the occasional day shift is expected
// behaviour rather than a bug.
// Clock time the session began, in the reader's zone. Sessions previously
// showed only a date and a duration, so two sessions on the same day were
// indistinguishable.
function sessionTimeText(sess){
  if(!sess?.isoDate) return '';
  const d=new Date(sess.isoDate);
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
}

// Clock time of a single mistake, in the reader's zone.
// `timerStamp` (elapsed time into the session) is recorded on every mistake but
// was never displayed anywhere. It's more meaningful than the wall clock when
// reviewing — "12 minutes in" says something "21:51" doesn't — so it rides
// along in the tooltip.
function mistakeTimeTitle(m){
  const t = mistakeTimeText(m);
  return m?.timerStamp ? `Logged at ${t} · ${m.timerStamp} into the session` : `Logged at ${t}`;
}

function mistakeTimeText(m){
  if(m?.isoTime){
    const d=new Date(m.isoTime);
    if(!isNaN(d)) return d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  }
  return m?.time||'';
}

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════
function toAr(n){return n.toString().replace(/[0-9]/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);}

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

/* ═══ TehfizTheme ════════════════════════════════════════════════════════
   Self-contained: namespace window.TehfizTheme, storage key 'tehfiz_theme',
   DOM container #themeChoice. Shared verbatim between both apps. The key is
   shared too, deliberately: both apps live on tehfiz.com, so a teacher who
   picks a theme sees it in the viewer they open from the students panel. */
(function(){
  var KEY = 'tehfiz_theme';
  var THEMES = [
    { id:'graphite', name:'Graphite', note:'Default',  sw:['#17191c','#626973','#f5f5f3'] },
    { id:'lapis',    name:'Lapis',    note:'Blue accents',  sw:['#17191c','#3a5585','#f5f5f3'] },
    { id:'mulberry', name:'Mulberry', note:'Plum accents',  sw:['#17191c','#6a3f5c','#f5f5f3'] },
    { id:'classic',  name:'Gold',     note:'Gold accents, serif type', sw:['#17191c','#b8841a','#f5f5f3'] }
  ];
  function valid(id){ return THEMES.some(function(t){ return t.id === id; }); }
  function get(){
    var t = null;
    try { t = localStorage.getItem(KEY); } catch(e) {}
    return valid(t) ? t : 'graphite';
  }
  function apply(id){
    // Graphite is bare :root — no attribute, so a stale attribute cannot linger.
    if (id === 'graphite') document.documentElement.removeAttribute('data-tz-theme');
    else document.documentElement.setAttribute('data-tz-theme', id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim());
  }
  function set(id){
    if (!valid(id)) return;
    try { localStorage.setItem(KEY, id); } catch(e) {}
    apply(id); render();
  }
  function esc(x){ return String(x).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function render(){
    var el = document.getElementById('themeChoice');
    if (!el) return;
    var cur = get();
    el.innerHTML = THEMES.map(function(t){
      return '<button type="button" class="tz-theme-opt' + (t.id === cur ? ' on' : '') + '" data-tz="' + t.id + '"' +
        ' aria-pressed="' + (t.id === cur) + '">' +
        '<span class="tz-theme-sw">' + t.sw.map(function(c){ return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' +
        '<span class="tz-theme-name">' + esc(t.name) + '<small>' + esc(t.note) + '</small></span></button>';
    }).join('');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.tz-theme-opt');
    if (b && b.dataset.tz) set(b.dataset.tz);
  });
  // Another tab changed it — follow, so the two apps never disagree for long.
  window.addEventListener('storage', function(e){ if (e.key === KEY) { apply(get()); render(); } });
  apply(get());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
  window.TehfizTheme = { get:get, set:set, render:render, list:function(){ return THEMES.map(function(t){ return t.id; }); } };
})();

/* ═══ TehfizPageStyle ════════════════════════════════════════════════════
   How the mushaf page is framed: 'islimi' (default — the arabesque
   illumination drawn by tehfiz-ornament.js, with a shamsa medallion on the
   opening pages) or 'quiet' (hairline frame, arch openings). 'madani', the
   lattice style of s3, is read as 'islimi'.
   Storage key 'tehfiz_page_style', shared by both apps like the theme.
   Applied as <html data-tz-page>; everything it changes is CSS (see
   tehfiz-shared.css, MUSHAF PAGE STYLE), so switching needs no re-render.
   DOM container #pageStyleChoice. */
(function(){
  var KEY = 'tehfiz_page_style';
  var STYLES = [
    { id:'islimi', name:'Illuminated', note:'Arabesque border' },
    { id:'quiet',  name:'Quiet',  note:'Hairline frame' }
  ];
  function valid(id){ return STYLES.some(function(t){ return t.id === id; }); }
  function get(){
    var t = null;
    try { t = localStorage.getItem(KEY); } catch(e) {}
    if (t === 'madani') t = 'islimi';
    return valid(t) ? t : 'islimi';
  }
  function apply(id){ document.documentElement.setAttribute('data-tz-page', id); }
  function set(id){
    if (!valid(id)) return;
    try { localStorage.setItem(KEY, id); } catch(e) {}
    apply(id); render();
  }
  function render(){
    var el = document.getElementById('pageStyleChoice');
    if (!el) return;
    var cur = get();
    el.innerHTML = STYLES.map(function(t){
      return '<button type="button" class="tz-theme-opt tz-page-opt' + (t.id === cur ? ' on' : '') + '" data-tzp="' + t.id + '"' +
        ' aria-pressed="' + (t.id === cur) + '"><span class="tz-page-sw ' + t.id + '"></span>' +
        '<span class="tz-theme-name">' + t.name + '<small>' + t.note + '</small></span></button>';
    }).join('');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.tz-page-opt');
    if (b && b.dataset.tzp) set(b.dataset.tzp);
  });
  window.addEventListener('storage', function(e){ if (e.key === KEY) { apply(get()); render(); } });
  apply(get());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
  window.TehfizPageStyle = { get:get, set:set, render:render };
})();

/* ═══ TehfizMode ═════════════════════════════════════════════════════════
   Light (default), Dark, or Device (follow the system). Storage key
   'tehfiz_mode', shared by both apps like the theme. Applied as
   <html data-tz-mode="dark"> — absent means light. Each app's <head>
   bootstrap applies it before first paint; this keeps it current and draws
   the picker in #modeChoice. */
(function(){
  var KEY = 'tehfiz_mode';
  var MODES = [
    { id:'light',  name:'Light' },
    { id:'dark',   name:'Dark' },
    { id:'device', name:'Device' }
  ];
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function valid(id){ return MODES.some(function(m){ return m.id === id; }); }
  function get(){
    var t = null;
    try { t = localStorage.getItem(KEY); } catch(e) {}
    return valid(t) ? t : 'light';
  }
  function isDark(){ var m = get(); return m === 'dark' || (m === 'device' && !!(mq && mq.matches)); }
  function apply(){
    if (isDark()) document.documentElement.setAttribute('data-tz-mode', 'dark');
    else document.documentElement.removeAttribute('data-tz-mode');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim() || '#17191c');
  }
  function set(id){
    if (!valid(id)) return;
    try { localStorage.setItem(KEY, id); } catch(e) {}
    apply(); render();
  }
  function render(){
    var el = document.getElementById('modeChoice');
    if (!el) return;
    var cur = get();
    el.innerHTML = MODES.map(function(m){
      return '<button type="button" class="tz-theme-opt tz-mode-opt' + (m.id === cur ? ' on' : '') + '" data-tzm="' + m.id + '"' +
        ' aria-pressed="' + (m.id === cur) + '"><span class="tz-mode-sw ' + m.id + '"></span>' +
        '<span class="tz-theme-name">' + m.name + '</span></button>';
    }).join('');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.tz-mode-opt');
    if (b && b.dataset.tzm) set(b.dataset.tzm);
  });
  window.addEventListener('storage', function(e){ if (e.key === KEY) { apply(); render(); } });
  if (mq) { var on = function(){ if (get() === 'device') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
  window.TehfizMode = { get:get, set:set, isDark:isDark, render:render };
})();

/* Pages 1-2 keep the height of every other page. Their spacer blocks were
   sized from the line count alone, which left the opening pages taller than
   the rest — more so once the medallion or arch took more room than the lines
   it holds. Here the two spacers are resized to whatever makes the body's
   content exactly 15 lines tall, measured, so it holds for either page style,
   any zoom and the surah title above. A ResizeObserver re-fits after zoom or
   font loading; only the spacers change, and only when off by a pixel, so it
   settles at once. Works for every render path (normal, virtualised, upgrade)
   because it watches for .msb-opening bodies rather than being called. */
(function(){
  if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
  function fit(body){
    var bufs = body.querySelectorAll(':scope > .msl-buffer');
    if (!bufs.length || !body.isConnected) return;
    var cs = getComputedStyle(body), font = parseFloat(cs.fontSize) || 26;
    var used = 0;
    for (var i = 0; i < bufs.length; i++) used += bufs[i].getBoundingClientRect().height;
    var inner = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var spare = Math.max(0, STANDARD_LINES_PER_PAGE * MSL_LINE_HEIGHT_EM * font - (inner - used));
    var top = Math.round(spare / 2), want = [top, Math.round(spare - top)];
    for (var j = 0; j < bufs.length && j < 2; j++) {
      if (Math.abs(bufs[j].getBoundingClientRect().height - want[j]) >= 1) bufs[j].style.height = want[j] + 'px';
    }
  }
  var ro = new ResizeObserver(function(entries){ entries.forEach(function(e){ fit(e.target); }); });
  var seen = new WeakSet();
  function scan(root){
    var list = root.querySelectorAll ? root.querySelectorAll('.msb-opening') : [];
    for (var i = 0; i < list.length; i++) if (!seen.has(list[i])) { seen.add(list[i]); ro.observe(list[i]); fit(list[i]); }
  }
  new MutationObserver(function(muts){
    muts.forEach(function(m){ m.addedNodes.forEach(function(n){ if (n.nodeType === 1) { if (n.classList.contains('msb-opening')) scan(n.parentNode); else scan(n); } }); });
  }).observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState !== 'loading') scan(document); else document.addEventListener('DOMContentLoaded', function(){ scan(document); });
})();
