/* ═══════════════════════════════════════════════════════════════════════════
   tehfiz-report.js — TehfizReport — rp8 (19 Nov 2026)

   rp8: clock times follow Settings → Clock (12-hour unless 24-hour).

   The progress report, moved here from the student viewer so the teacher app
   can run it too (stage 7b, decided 16 Nov).

   · rp1 — the MEASURES: lesson dates, what is memorised, rotation and
     condition, trends, spot tests, persistence, focus. Pure: lessons in,
     numbers out. Top-level names, as in tehfiz-shared.js: they were globals in
     the viewer and none exists in the teacher app (checked 16 Nov).
   · rp2 — the SCREENS: openReview, buildMultiReviewHTML and every tab. What
     they used to take from the viewer goes through hooks (lessons, root,
     show, isOpen, goto, help, map, isTeacher, toast, mapPages), each
     defaulting to what the viewer did. An app sets its own with
     TehfizReport.use({…}).
   · rp3 — the help texts (TehfizReport.HELP) and a pop-up to show them, for an
     app without the viewer's guide; hooks openLesson and label; nbNames and
     tehfizFetchPayloads moved in, so both apps share one copy.

   · rp6 — the Spot tests tab splits the pass rate by how a spot was placed
     (spot.how, from the teacher's spot-weak.js): random spots against weak
     places (aimed at earlier mistakes, or picked by hand). Two lines, two
     cards; a lesson with no weak-place spots draws exactly as before.

   · rp7 — tehfizListAll: a lesson list fetched page by page (A6, stage 8),
     for every place that used to read one batch of 500.

   Moved verbatim from the viewer (v1_202); checked by drawing every tab at
   three ranges and two times on the test student before and after: identical.
   Loaded by both apps after tehfiz-shared.js; reads the app's STRENGTH_MODEL
   and sessionDateText, which both define, at call time.
   ═══════════════════════════════════════════════════════════════════════════ */
const TEHFIZ_REPORT_VERSION = 'rp8';
// var, not const: a top-level const is not a property of window, and the range
// module and the teacher app's panel look for window.TehfizReport.
var TehfizReport = { version: TEHFIZ_REPORT_VERSION, hooks: {} };

// ═══════════════════════════════════════════════════════════════════
// CROSS-SESSION ANALYTICS — pure
// ───────────────────────────────────────────────────────────────────
// Hifz is maintenance, not a climb. A portion decays while it goes unheard and
// recovers when revised, so these functions are built to answer "what condition
// is each portion in NOW, and when was that last verified?" — not "is the line
// going up?". A rising line is not the goal; not letting anything rot is.
// ═══════════════════════════════════════════════════════════════════

function _sessDate(s){ return s?.isoDate ? new Date(s.isoDate) : (s?.dateYMD ? new Date(s.dateYMD+'T12:00:00Z') : null); }
// Period filtering compares YMD strings, not Dates. dateYMD is the teacher's
// LOCAL calendar day — converting it to a timestamp and back reintroduces the
// off-by-one that made late-evening sessions land in the wrong day. Comparing
// 'YYYY-MM-DD' lexicographically is exact and timezone-free.
function _sessYMD(s){
  if(s?.dateYMD) return s.dateYMD;
  if(s?.isoDate){ const d=new Date(s.isoDate); if(!isNaN(d)) return _ymd(d); }
  return null;
}
function _ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function _periodStartYMD(period){
  const d=new Date(); d.setHours(0,0,0,0);
  if(period==='week'){ d.setDate(d.getDate() - ((d.getDay()+6)%7)); return _ymd(d); }  // Monday
  if(period==='month'){ return _ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
  if(period==='year'){  return _ymd(new Date(d.getFullYear(), 0, 1)); }
  return null;
}
const PERIOD_LABEL={week:'This week', month:'This month', year:'This year'};
function sessionsChrono(sessions){
  return [...(sessions||[])].filter(Boolean).sort((a,b)=>(_sessDate(a)||0)-(_sessDate(b)||0));
}
function daysBetween(a,b){ return Math.round((b-a)/86400000); }

// Every segment that earns a rate, flattened with its session context.
// Spot segments and inferred extents are excluded here exactly as in the
// single-session review — they have no trustworthy verse count.
function scorableSegments(sessions){
  const out=[];
  sessionsChrono(sessions).forEach(s=>{
    const d=_sessDate(s);
    (s.segments||[]).forEach(sg=>{
      if(!segmentScorable(sg)) return;
      /* Recomputed rather than read when the session predates the current
         model — this is the trend, so a stale point does not just read low, it
         puts a visible step in the line at the deploy date. */
      const inp = inputsAreCurrent(s)
        ? (inputsWithPages(sg.strengthInputs, sg) || segmentStrengthInputs(s.segments, sg, s.mistakes||[]))
        : segmentStrengthInputs(s.segments, sg, s.mistakes||[]);
      if(!inp || !inp.verses) return;
      out.push({session:s, seg:sg, date:d, stage:sg.type||'unassigned',
                inputs:inp, score:gradedValue(sg, strengthFromInputs(inp)), teacher:isTeacherGraded(sg)});
    });
  });
  return out;
}

// One series per stage. Never pooled: new memorisation runs several times the
// mistake rate of settled revision, so a combined line mostly measures which
// mix the student happened to do that week.
function stageTrend(sessions){
  const by={};
  scorableSegments(sessions).forEach(r=>{
    if(r.score==null) return;
    (by[r.stage]=by[r.stage]||[]).push({date:r.date, score:r.score, verses:r.inputs.verses,
                                        label:r.seg.rangeLabel||describeRange(segOrdered(r.seg).startKey,segOrdered(r.seg).endKey)});
  });
  return by;
}

// ── MEMORISATION PROFILE ──────────────────────────────────────────
// Which portions the student has actually memorised. This CANNOT be inferred
// from session history:
//   · a student who joins mid-hifz only ever revises part of what they know,
//     so the unrevised remainder — the very thing worth surfacing — is invisible
//   · memorisation is often non-contiguous (Juz 30, 29, 28 + Juz 1-3), so any
//     min..max span invents a couple of dozen juz they never memorised
// So it's declared, seeded from what we can observe, and editable. Same shape
// as the segment boundaries: guess, show the guess, let it be corrected.
const MEM_PROFILE_KEY='tehfiz_memorised_juz';

/* What the sessions show has been memorised.
   New memorisation (sabaq) is being learned, not held; a spot test's range is
   where verses were drawn from, not what was recited; a tajweed-only session
   is about pronunciation. None of them is evidence, so none counts — before
   this, one sabaq lesson in Juz 1 marked the whole juz memorised, for good.

   `lockedOnly` narrows further to stages that PROVE it (recent / old). An
   unassigned segment is probably revision, so it seeds the profile, but the
   student can untick it — it no longer locks. */
function observedJuz(sessions, lockedOnly){
  const set=new Set();
  (sessions||[]).forEach(s=>{ if(sessionFocus(s)==='tajweed') return; (s.segments||[]).forEach(sg=>{
    if(sg.mode==='spot') return;
    const st=sg.type||'unassigned';
    if(st==='new') return;
    if(lockedOnly && st==='unassigned') return;
    const o=segOrdered(sg);
    if(!keyValid(o.startKey)||!keyValid(o.endKey)) return;
    const a=juzForVerse(...o.startKey.split(':').map(Number));
    const b=juzForVerse(...o.endKey.split(':').map(Number));
    for(let j=Math.min(a,b); j<=Math.max(a,b); j++) set.add(j);
  }); });
  // Legacy sessions have no segments — fall back to where the mistakes are.
  if(!lockedOnly) (sessions||[]).forEach(s=>{ if(!s.segments?.length)
    (s.mistakes||[]).forEach(m=>{ if(m.surah&&m.ayah) set.add(juzForVerse(m.surah,m.ayah)); }); });
  return set;
}

function loadMemorisedJuz(){
  try{
    const raw=localStorage.getItem(MEM_PROFILE_KEY);
    if(raw) return new Set(JSON.parse(raw));
  }catch{}
  return null;   // null = never declared, caller falls back to observed
}
function saveMemorisedJuz(set){
  try{ localStorage.setItem(MEM_PROFILE_KEY, JSON.stringify([...set].sort((a,b)=>a-b))); }catch{}
}
// Anything heard is memorised by definition, so observed is always unioned in —
// the student can add to the profile but can't accidentally hide real history.
/* v1_178: the teacher's memorisation map (journey.js), when there is one,
   is what the progress report goes by — the same map the teacher sees on the
   Profile. A juz counts when any of it is old or recent; the new lesson is
   still being learned, so it does not. */
function teacherMapPages(){
  // rp1: an app can say where the map is (the teacher app: the Profile's map
  // for the student on screen); otherwise the viewer's journey module.
  if(typeof TehfizReport.hooks.mapPages === 'function'){ try{ return TehfizReport.hooks.mapPages() || null; }catch{ return null; } }
  try{ const m=window.TehfizJourney&&window.TehfizJourney.map&&window.TehfizJourney.map(); return m?m.pages:null; }catch{ return null; }
}
function mapJuz(pages){
  const set=new Set(), M=window.TehfizMap;
  for(let j=1;j<=30;j++){
    const a=(M.juzStart(j)-1)*2, b=M.juzEnd(j)*2-1;
    for(let i=a;i<=b;i++) if(pages[i]==='o'||pages[i]==='r'){ set.add(j); break; }
  }
  return set;
}
function memorisedJuz(sessions){
  const pages=teacherMapPages();
  if(pages && window.TehfizMap){
    const set=mapJuz(pages);
    observedJuz(sessions).forEach(j=>set.add(j));
    return {set, declared:true, fromMap:true};
  }
  const declared=loadMemorisedJuz();
  const obs=observedJuz(sessions);
  if(!declared) return {set:obs, declared:false};
  obs.forEach(j=>declared.add(j));
  return {set:declared, declared:true};
}
function toggleMemorisedJuz(j, sessions){
  if(memorisedJuz(sessions).fromMap) return false;
  const {set}=memorisedJuz(sessions);
  const obs=observedJuz(sessions, true);
  if(set.has(j)){
    if(obs.has(j)) return false;   // heard in a real session — not removable
    set.delete(j);
  } else set.add(j);
  saveMemorisedJuz(set);
  return true;
}

// Condition of each juz: how it scored when last heard, and how long ago that
// was. Both halves are needed — a juz at 90 last heard in February is not in
// good condition, it's unverified.
// ATTENTION = strength decayed by time since it was last verified.
//
// Freshness and strength are both already on the card as text, so the colour
// should not repeat either one — it should say the thing neither number says
// alone: how much this portion needs looking at now. Two portions at 99 are not
// equally safe if one was heard yesterday and one five months ago, and two
// portions heard yesterday are not equally safe if one scored 96 and the other
// 68. One projection captures both.
//
// Hifz is maintenance, so condition decays when unheard. ~4%/week matches the
// decay the sample data was modelled on. The projection is an ESTIMATE and is
// deliberately never printed as a number — the card shows what was measured;
// the colour shows what we think is true now.
// ── CALIBRATION ───────────────────────────────────────────────────────────
// Every number below was chosen from judgement and synthetic data. None has met
// a real student yet, so all of them are provisional and all of them live here
// rather than inline, on the same three rules as STRENGTH_MODEL:
//
//   1. VERSIONED (METRICS_MODEL.id) so a figure can never be compared across
//      two different calibrations without that being visible.
//   2. OVERRIDABLE at runtime (localStorage now, a backend later), so a
//      recalibration ships without a code release.
//   3. RETROACTIVE. Unlike strength, none of these are ever stored on a
//      session — every cross-session metric is recomputed from raw segments and
//      mistakes each time the report opens. Change a constant and the whole
//      history re-reads under the new model immediately, with no migration.
//
// Rule 3 is the reason recalibration is cheap here, and it is worth preserving:
// if a metric ever starts caching its output into a session file, it stops
// being calibratable and needs the versioned-inputs treatment strength has.
const METRICS_MODEL_DEFAULT = {
  id: 'metrics-v1',

  rotation: {
    // Condition decays while unheard. 4%/week is the rate the sample data was
    // modelled on — the single most important number to check against reality.
    decayPerWeek: 0.04,
    // Projected condition -> how much attention the portion needs.
    bands: [
      {min:80, key:'settled', label:'settled'},
      {min:60, key:'due',     label:'due a look'},
      {min:40, key:'overdue', label:'overdue'},
      {min:0,  key:'urgent',  label:'urgent'},
    ],
    // Gap between "last seen" and "last scored" past which the score is marked
    // as stale on the card.
    agedScoreDays: 30,
  },

  sabqi: {
    // Two segments are the same passage when each covers this fraction of the
    // other. Raising it splits passages; lowering it risks chaining.
    overlap: 0.5,
    // Score change across the sabqi sequence that counts as movement.
    climbing: 5,
    declining: -5,
  },

  focus: {
    // Recency half-life for ranking what to work on: a mistake this old counts
    // half as much as one made today. 42d = six weeks.
    halfLifeDays: 42,
    // Severity ranking of intervention levels. c4 ("other") sits just above c0
    // because it carries no intervention information.
    severityOrder: {c0:0, c4:1, c1:2, c2:3, c3:4},
    // Two separate lists: the cross-session 'work on these next' and the
    // single-session one, deliberately different lengths.
    listLimit: 6,
    singleListLimit: 5,
  },

  spot: {
    // A partial recall counts as half a pass in the spot pass rate.
    partialCredit: 0.5,
  },

  pace: {
    // Fallback when a segment starts and ends on the same page: what share of a
    // page its verses represent. Real pages vary from ~4 to ~20 verses.
    versesPerPage: 15,
  },

  persistence: {
    // Later sessions that covered the verse without a mistake before it counts
    // as resolved. Below 2, "not missed lately" just means "not tested lately".
    cleanRuns: 2,
  },

  trend: {
    // Points needed before a direction is drawn rather than a scatter.
    minPointsForLine: 4,
  },
};

let METRICS_MODEL = {...METRICS_MODEL_DEFAULT};

// Decay runs from when the portion was last SCORED, not last seen. A juz
// spot-tested yesterday whose last full recitation was four months ago has not
// been verified in four months, and the colour should say so.
function rotationProjection(lastScore, daysUnverified, model){
  if(lastScore==null || daysUnverified==null) return null;
  const R = (model||METRICS_MODEL).rotation;
  return Math.round(lastScore * Math.exp(-(R.decayPerWeek/7) * Math.max(0, daysUnverified)));
}
function rotationBand(projected, model){
  if(projected==null) return 'unknown';
  const B = (model||METRICS_MODEL).rotation.bands;
  return (B.find(b=>projected>=b.min) || B[B.length-1]).key;
}

function portionCondition(sessions, memSet){
  const chrono=sessionsChrono(sessions);
  /* v1_198 (F2): measured from today. It was measured from the last lesson,
     so a student away for a month still read "today" on whatever was heard last. */
  const now = new Date();
  const by={};
  chrono.forEach(s=>{
    const d=_sessDate(s);
    (s.segments||[]).forEach(sg=>{
      const o=segOrdered(sg);
      if(!keyValid(o.startKey)||!keyValid(o.endKey)) return;
      const j1=juzForVerse(...o.startKey.split(':').map(Number));
      const j2=juzForVerse(...o.endKey.split(':').map(Number));
      for(let j=Math.min(j1,j2); j<=Math.max(j1,j2); j++){
        const e=by[j]||(by[j]={juz:j, heard:0, last:null, lastScore:null, lastStage:null,
                               lastScoredDate:null, lastScoredStage:null, spotOnly:true});
        // v1_198 (F2): lessons, not lesson parts — New and Recent in the same juz were counted twice.
        if(e._sid!==s){ e.heard++; e._sid=s; }
        e.last=d; e.lastStage=sg.type||'unassigned';
        if(segmentScorable(sg)){
          e.spotOnly=false;
          const inp=inputsWithPages(sg.strengthInputs,sg)||segmentStrengthInputs(s.segments,sg,s.mistakes||[]);
          const sc=gradedValue(sg, strengthFromInputs(inp));   // the teacher's grade wins (s13)
          // The score and WHEN + AS WHAT it was earned move together. e.last
          // advances on every segment including spot tests, so without these two
          // a juz spot-tested yesterday renders bright green beside a
          // four-month-old score, with nothing marking the gap.
          if(sc!=null){ e.lastScore=sc; e.lastScoredDate=d; e.lastScoredStage=sg.type||'unassigned'; }
        }
      }
    });
  });
  const out=Object.values(by).map(e=>{
    const daysSince       = e.last          ? daysBetween(e.last, now)          : null;
    const daysSinceScored = e.lastScoredDate ? daysBetween(e.lastScoredDate, now) : null;
    const proj = rotationProjection(e.lastScore, daysSinceScored);
    return {...e, daysSince, daysSinceScored,
      // How much older the score is than the cell's freshness. A positive gap
      // means the two describe different sessions.
      scoreGap: (daysSince!=null && daysSinceScored!=null) ? daysSinceScored - daysSince : null,
      projected: proj, att: rotationBand(proj)};
  });
  // Fill the gaps. A juz inside the student's memorised span that has NEVER
  // been heard is invisible otherwise — and it's the most important row on the
  // page, because nothing about it is known at all.
  // Every memorised juz appears, heard or not. A juz that's been memorised and
  // never revised is the most important row here — and the one that no amount
  // of inference from session history could ever produce.
  const mem = memSet || memorisedJuz(sessions).set;
  mem.forEach(j=>{
    if(!by[j]) out.push({juz:j, heard:0, last:null, lastScore:null, lastStage:null,
                         lastScoredDate:null, lastScoredStage:null, daysSince:null,
                         daysSinceScored:null, scoreGap:null,
                         projected:null, att:'unknown',
                         spotOnly:false, neverHeard:true});
  });
  return out.sort((a,b)=>a.juz-b.juz);
}

// Spot tests can't join the strength trend: they sample rather than recite, so
// there's no verse rate to plot. Pass rate is the honest equivalent.
// rp6: a spot aimed at a weak place (or picked by hand) vs one placed at random.
const _spotAimed = x => x.how==='weak' || x.how==='picked';
const _spotRate = t => { const d=t.pass+t.partial+t.fail; return d ? Math.round((t.pass+METRICS_MODEL.spot.partialCredit*t.partial)/d*100) : null; };
function _spotSplit(spots){
  const r=spotTally(spots.filter(x=>!_spotAimed(x))), w=spotTally(spots.filter(_spotAimed));
  r.done=r.pass+r.partial+r.fail; w.done=w.pass+w.partial+w.fail;
  return {rnd:r, wk:w};
}
function spotTrend(sessions){
  const out=[];
  sessionsChrono(sessions).forEach(s=>{
    const d=_sessDate(s);
    const segs=(s.segments||[]).filter(sg=>sg.mode==='spot' && sg.spots?.length);
    if(segs.length){
      segs.forEach(sg=>{
        const t=spotTally(sg.spots);
        const done=t.pass+t.partial+t.fail;
        if(done) out.push({date:d, ...t, done, rate:Math.round((t.pass+METRICS_MODEL.spot.partialCredit*t.partial)/done*100),
                           label:sg.rangeLabel||describeRange(segOrdered(sg).startKey,segOrdered(sg).endKey),
                           startKey:_spotFirstKey(sg),   // v1_198 (F1): for spotVsRecite
                           ..._spotSplit(sg.spots)});
      });
    } else if(s.spotTest?.spots?.length){
      const t=spotTally(s.spotTest.spots);
      const done=t.pass+t.partial+t.fail;
      if(done) out.push({date:d, ...t, done, rate:Math.round((t.pass+METRICS_MODEL.spot.partialCredit*t.partial)/done*100),
                         label:s.spotTest.scopeInput||'', ..._spotSplit(s.spotTest.spots)});
    }
  });
  return out;
}






// ── Stage-specific metrics ────────────────────────────────────────
// Each stage asks a different question, so each earns different numbers rather
// than the same chart relabelled.

// MANZIL: is the rotation actually rotating? Average gap between hearings of
// the same juz, and the worst offender. A short mean with a huge max means a
// few portions get all the attention while others are quietly rotting.
function cycleTimes(sessions){
  const chrono=sessionsChrono(sessions);
  const hits={};
  chrono.forEach(s=>{
    const d=_sessDate(s);
    (s.segments||[]).forEach(sg=>{
      if((sg.type||'')!=='old') return;
      const o=segOrdered(sg);
      if(!keyValid(o.startKey)||!keyValid(o.endKey)) return;
      const a=juzForVerse(...o.startKey.split(':').map(Number));
      const b=juzForVerse(...o.endKey.split(':').map(Number));
      // v1_198 (F2): once per lesson, as the rotation strip now counts.
      for(let j=Math.min(a,b);j<=Math.max(a,b);j++){ const h=hits[j]=hits[j]||[]; if(h._s!==s){ h.push(d); h._s=s; } }
    });
  });
  const rows=Object.entries(hits).map(([j,ds])=>{
    ds.sort((x,y)=>x-y);
    const gaps=ds.slice(1).map((d,i)=>daysBetween(ds[i],d));
    return {juz:+j, times:ds.length, last:ds[ds.length-1],
            avgGap: gaps.length ? Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length) : null,
            maxGap: gaps.length ? Math.max(...gaps) : null};
  }).sort((a,b)=>a.juz-b.juz);
  const withGap=rows.filter(r=>r.avgGap!=null);
  return {rows, meanCycle: withGap.length ? Math.round(withGap.reduce((n,r)=>n+r.avgGap,0)/withGap.length) : null};
}

// SABAQ → SABQI hand-off. The real test of new memorisation isn't how it scored
// on the day it was learned — it's how it scored when it came back. Matches a
// sabaq segment to the later sabqi segment covering the same verses.
function handoffDeltas(sessions){
  const segs=scorableSegments(sessions);
  const news=segs.filter(r=>r.stage==='new');
  const recents=segs.filter(r=>r.stage==='recent');
  const out=[];
  news.forEach(n=>{
    const o=segOrdered(n.seg);
    const mid=Math.round((keyAbs(o.startKey)+keyAbs(o.endKey))/2);
    const later=recents.filter(r=>{
      if(r.date<=n.date) return false;
      const ro=segOrdered(r.seg);
      return mid>=keyAbs(ro.startKey) && mid<=keyAbs(ro.endKey);
    }).sort((a,b)=>a.date-b.date)[0];
    if(later && n.score!=null && later.score!=null){
      out.push({label:n.seg.rangeLabel||describeRange(o.startKey,o.endKey),
                learned:n.score, returned:later.score, delta:later.score-n.score,
                days:daysBetween(n.date,later.date), date:n.date});
    }
  });
  return out.sort((a,b)=>a.date-b.date);
}

// SABQI: consolidation. A hand-off delta says whether a passage survived its
// first return; it cannot say whether it is still improving. That needs the
// whole sequence of hearings for one passage — which forces the question of
// what "one passage" is, since ranges drift between sessions and no segment
// carries an identity.
//
// Two sabqi segments are the same passage when EACH covers at least half of the
// other. The symmetry is the point: a one-sided test would swallow a short
// passage into any longer one containing it.
function _segSpan(r){ const o=segOrdered(r.seg); return [keyAbs(o.startKey), keyAbs(o.endKey)]; }
function _mutualOverlap(a, b){
  const ov = Math.min(a[1],b[1]) - Math.max(a[0],b[0]) + 1;
  if(ov<=0) return false;
  const f = METRICS_MODEL.sabqi.overlap;
  return ov >= (a[1]-a[0]+1)*f && ov >= (b[1]-b[0]+1)*f;
}
function sabqiPassages(sessions){
  const segs = scorableSegments(sessions);
  const recents = segs.filter(r=>r.stage==='recent'
    && keyValid(segOrdered(r.seg).startKey) && keyValid(segOrdered(r.seg).endKey))
    .sort((a,b)=>a.date-b.date);
  const news = segs.filter(r=>r.stage==='new');
  const olds = segs.filter(r=>r.stage==='old');

  // Each cluster is matched against its ANCHOR — the span of its first hearing —
  // never against the union of what it has absorbed. Growing the target would
  // make overlap transitive, and a sabqi range that slides forward week by week
  // would chain an entire juz into one "passage". Chronological order makes the
  // partition independent of the order sessions were imported in.
  const clusters=[];
  recents.forEach(r=>{
    const sp=_segSpan(r);
    const c = clusters.find(c=>_mutualOverlap(c.anchor, sp));
    if(c) c.items.push(r); else clusters.push({anchor:sp, items:[r]});
  });

  const med = a => { if(!a.length) return null;
    const s=[...a].sort((x,y)=>x-y), m=s.length>>1;
    return s.length%2 ? s[m] : Math.round((s[m-1]+s[m])/2); };

  const rows = clusters.map(c=>{
    const hs=c.items;
    const lo=Math.min(...hs.map(h=>_segSpan(h)[0])), hi=Math.max(...hs.map(h=>_segSpan(h)[1]));
    const mid=Math.round((lo+hi)/2);
    const widest=[...hs].sort((a,b)=>{const x=_segSpan(a),y=_segSpan(b);return (y[1]-y[0])-(x[1]-x[0]);})[0];
    const wo=segOrdered(widest.seg);
    const scores=hs.map(h=>({date:h.date, score:h.score}));
    const f=scores[0], l=scores[scores.length-1];
    const delta = scores.length>1 ? l.score-f.score : null;
    // Where it came from: the latest sabaq covering this passage's midpoint that
    // predates the first sabqi hearing.
    const learned=news.filter(n=>{const o=segOrdered(n.seg);
      return n.date<=f.date && mid>=keyAbs(o.startKey) && mid<=keyAbs(o.endKey);})
      .sort((a,b)=>b.date-a.date)[0]||null;
    // Where it went: the first manzil hearing covering it after sabqi began.
    const grad=olds.filter(o=>{const oo=segOrdered(o.seg);
      return o.date>f.date && mid>=keyAbs(oo.startKey) && mid<=keyAbs(oo.endKey);})
      .sort((a,b)=>a.date-b.date)[0]||null;
    return {label: widest.seg.rangeLabel || describeRange(wo.startKey, wo.endKey),
      scores, hearings:scores.length, days:daysBetween(f.date, l.date), delta,
      status: delta==null ? 'single'
        : delta>=METRICS_MODEL.sabqi.climbing  ? 'climbing'
        : delta<=METRICS_MODEL.sabqi.declining ? 'declining' : 'stalled',
      learnedScore: learned ? learned.score : null,
      gained: learned ? l.score-learned.score : null,
      graduated: !!grad, gradDays: grad ? daysBetween(f.date, grad.date) : null,
      gradHearings: grad ? scores.filter(s=>s.date<=grad.date).length : null};
  }).sort((a,b)=>b.scores[b.scores.length-1].date - a.scores[a.scores.length-1].date);

  const multi=rows.filter(r=>r.delta!=null);
  const grads=rows.filter(r=>r.graduated);
  const open =rows.filter(r=>!r.graduated);
  return {rows, passages:rows.length,
    avgHearings: rows.length ? Math.round(rows.reduce((n,r)=>n+r.hearings,0)/rows.length*10)/10 : null,
    avgDelta: multi.length ? Math.round(multi.reduce((n,r)=>n+r.delta,0)/multi.length) : null,
    climbing: multi.filter(r=>r.status==='climbing').length,
    stalled:  multi.filter(r=>r.status==='stalled').length,
    declining:multi.filter(r=>r.status==='declining').length,
    single:   rows.length-multi.length,
    graduated:{n:grads.length, medDays:med(grads.map(r=>r.gradDays)),
               medHearings:med(grads.map(r=>r.gradHearings))},
    openN: open.length,
    longestOpen: open.length ? Math.max(...open.map(r=>r.days)) : null};
}

// SPOT vs RECITE agreement. If a juz passes its spot checks but scores poorly
// when fully recited, the sampling is missing things — worth knowing before
// trusting a pass rate.
// v1_198: where a spot test was asked for — its first spot. The segment's own
// start can sit a few verses back in the juz before (a test of juz 26 that was
// set up from the end of Al-Jathiyah), which put the test in the wrong juz.
function _spotFirstKey(sg){
  const sp=(sg.spots||[]).filter(x=>x&&x.surah&&x.ayah);
  if(!sp.length) return segOrdered(sg).startKey;
  const f=sp.reduce((m,x)=>absVerse(x.surah,x.ayah)<absVerse(m.surah,m.ayah)?x:m);
  return f.surah+':'+f.ayah;
}
function spotVsRecite(sessions){
  const cond={};
  scorableSegments(sessions).forEach(r=>{
    const o=segOrdered(r.seg);
    const j=juzForVerse(...o.startKey.split(':').map(Number));
    if(r.score!=null) (cond[j]=cond[j]||{recite:[],spot:[]}).recite.push(r.score);
  });
  spotTrend(sessions).forEach(p=>{
    /* v1_198 (F1): the juz the test starts in. It was read out of the name
       ("Juz 28"), so a test named by its surahs, as a juz that begins with a
       surah is (juz 26, Al-Ahqaf), was never compared. */
    let j = null;
    if(p.startKey && keyValid(p.startKey)) j = juzForVerse(...p.startKey.split(':').map(Number));
    else { const m=/Juz\s*(\d+)/i.exec(p.label||''); if(m) j = +m[1]; }
    if(j) (cond[j]=cond[j]||{recite:[],spot:[]}).spot.push(p.rate);
  });
  const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
  return Object.entries(cond).map(([j,v])=>({juz:+j, recite:avg(v.recite), spot:avg(v.spot)}))
    .filter(r=>r.recite!=null && r.spot!=null)
    .sort((a,b)=>a.juz-b.juz);
}

// Pace: verses of new memorisation per week — the sabaq question nothing else answers.
function sabaqPace(sessions){
  const news=scorableSegments(sessions).filter(r=>r.stage==='new');
  if(news.length<2) return null;
  const days=Math.max(1, daysBetween(news[0].date, news[news.length-1].date));
  const verses=news.reduce((n,r)=>n+r.inputs.verses,0);
  // Pages as well as verses: verse length varies enormously (2:282 against
  // 55:64), so verses/week flatters a stretch of short surahs and understates
  // a long one. Page span is closer to how much was actually memorised.
  let pages=0;
  news.forEach(r=>{
    const o=segOrdered(r.seg);
    const [s1,a1]=o.startKey.split(':').map(Number), [s2,a2]=o.endKey.split(':').map(Number);
    const p1=pageForVerse(s1,a1), p2=pageForVerse(s2,a2);
    pages += Math.abs(p2-p1)+ (p2===p1 ? (r.inputs.verses/METRICS_MODEL.pace.versesPerPage) : 1);
  });
  pages=+pages.toFixed(1);
  return {verses, pages, days, sessions:news.length,
          versesPerWeek:+(verses/days*7).toFixed(1),
          pagesPerWeek:+(pages/days*7).toFixed(2)};
}

// Words the student keeps missing, versus words they've stopped missing.
// "Resolved" is the most motivating figure available and nothing computed it.
// A word counts as resolved only once it has survived `cleanRuns` later
// sessions that actually covered its verse — otherwise "not missed lately"
// just means "not tested lately", which is the opposite of reassuring.
function persistence(sessions, cleanRuns){
  const need = cleanRuns ?? METRICS_MODEL.persistence.cleanRuns;
  const chrono = sessionsChrono(sessions);
  const seen = {};                       // wordKey -> [session indexes it was missed in]
  chrono.forEach((s,i)=>{
    // Ayah-level, not word-level: stumbling on a different word of the same
    // ayah is the same weak spot resurfacing, not a new one. Word-level made
    // recurrence look vanishingly rare and "resolved" implausibly large.
    new Set((s.mistakes||[]).map(m=>`${m.surah}:${m.ayah}`)).forEach(k=>{
      (seen[k]=seen[k]||[]).push(i);
    });
  });
  // Which later sessions actually covered a given verse — a clean run only
  // counts if the passage was heard again.
  const covered = (idx, surah, ayah) => {
    const s=chrono[idx];
    if(!s?.segments?.length) return (s?.mistakes||[]).some(m=>m.surah===surah);
    return !!segForVerse(s.segments, surah, ayah);
  };
  const recurring=[], resolved=[], fresh=[];
  Object.entries(seen).forEach(([k,idxs])=>{
    const [su,ay]=k.split(':').map(Number);
    const last=idxs[idxs.length-1];
    const laterCovering = chrono.map((_,i)=>i).filter(i=>i>last && covered(i,su,ay));
    const rec={key:k, surah:su, ayah:ay, times:idxs.length,
               lastIdx:last, lastDate:_sessDate(chrono[last]), retested:laterCovering.length};
    if(idxs.length===1 && last===chrono.length-1) fresh.push(rec);
    else if(laterCovering.length>=need) resolved.push(rec);
    else if(idxs.length>1) recurring.push(rec);
  });
  recurring.sort((a,b)=>b.times-a.times || b.lastIdx-a.lastIdx);
  resolved.sort((a,b)=>b.retested-a.retested);
  return {recurring, resolved, fresh};
}

// Cross-session focus. Recency matters here in a way it doesn't within one
// session: an ayah missed three times but not for two months is fixed, not
// urgent. Weight decays with a ~6-week half-life.
function crossFocus(sessions, limit){
  const chrono=sessionsChrono(sessions);
  if(!chrono.length) return [];
  const now=_sessDate(chrono[chrono.length-1]);
  const by={};
  chrono.forEach(s=>{
    const d=_sessDate(s);
    const age = d? Math.max(0, daysBetween(d, now)) : 0;
    const recency = Math.pow(0.5, age/METRICS_MODEL.focus.halfLifeDays);
    (s.mistakes||[]).forEach(m=>{
      if(!m.surah||!m.ayah) return;
      const k=`${m.surah}:${m.ayah}`;
      const e=by[k]||(by[k]={key:k, surah:m.surah, ayah:m.ayah, hits:0, sessions:new Set(),
                             weight:0, words:new Set(), last:null, worst:'c0'});
      e.hits++; e.sessions.add(s.id); e.weight += mistakeWeight(m)*recency;
      if(m.word) e.words.add(m.word);
      e.last=d;
      const order=METRICS_MODEL.focus.severityOrder;
      if((order[m.correction]??0)>(order[e.worst]??0)) e.worst=m.correction||'c0';
    });
  });
  return Object.values(by)
    .map(e=>({...e, sessions:e.sessions.size, words:[...e.words],
              score:e.weight*Math.sqrt(e.sessions.size)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0, limit||METRICS_MODEL.focus.listLimit);
}

// ═══════════════════════════════════════════════════════════════════
// THE SCREENS (rp2) — moved from the viewer (v1_203), so either app can draw
// the progress report. Everything the screens used to take from the viewer
// goes through these hooks. Each default does what the viewer did, so the
// viewer sets none of them; the teacher app sets its own (TehfizReport.use).
// ═══════════════════════════════════════════════════════════════════
const _RP_DEFAULTS = {
  lessons:   () => [],          // each app says (the viewer: TehfizReport.use({lessons}) beside its list)
  root:      () => document.getElementById('reviewContent'),
  show:      () => { const m = document.getElementById('reviewModal'); if (m) m.classList.add('open'); },
  isOpen:    () => !!(document.getElementById('reviewModal') && document.getElementById('reviewModal').classList.contains('open')),
  goto:      (s, a) => { if (typeof window.closeReviewGoto === 'function') window.closeReviewGoto(s, a); },
  help:      (t) => { if (typeof window.openHelpTopic === 'function') window.openHelpTopic(t); },
  map:       () => (window.TehfizJourney && window.TehfizJourney.map ? window.TehfizJourney.map() : null),
  isTeacher: () => !!(window.TehfizReview && window.TehfizReview.active && window.TehfizReview.active()),
  toast:     (msg) => { if (typeof showToast === 'function') showToast(msg); },
  openLesson:(id) => { if (typeof window.openSingleReview === 'function') window.openSingleReview(id); },
  label:     () => (window.TehfizReviewLabel ? window.TehfizReviewLabel() : ''),
};
const _rpHook = (k) => (typeof TehfizReport.hooks[k] === 'function' ? TehfizReport.hooks[k] : _RP_DEFAULTS[k]);
const _rpLessons  = () => _rpHook('lessons')() || [];
const _rpRoot     = () => _rpHook('root')();
const _rpShow     = () => _rpHook('show')();
const _rpIsOpen   = () => !!_rpHook('isOpen')();
const _rpMap      = () => _rpHook('map')();
const _rpIsTeacher= () => !!_rpHook('isTeacher')();
const _rpToast    = (m) => _rpHook('toast')(m);
TehfizReport.goto = (s, a) => _rpHook('goto')(s, a);
TehfizReport.help = (t) => _rpHook('help')(t);
TehfizReport.openLesson = (id) => _rpHook('openLesson')(id);
/* An app sets its hooks once: TehfizReport.use({lessons, root, show, …}). */
TehfizReport.use = (h) => { Object.assign(TehfizReport.hooks, h || {}); };
// rp4: a range other than the whole Quran is set.
const _rpRangeSet = () => !!(window.TehfizReportRange && !TehfizReportRange.isWhole());
/* rp4: the report as text, for Copy text in either app: what is showing first,
   then the lessons in that range and time — the full report or the short one,
   as chosen on the share screen. Was every selected lesson, whatever the range. */
TehfizReport.text = () => {
  const S = _msReportSessions();
  const ml = []; S.forEach((s) => (s.mistakes || []).forEach((m) => ml.push({ ...m, typeConfig: s.typeConfig || null })));
  const head = window.TehfizReportRange ? 'Showing: ' + TehfizReportRange.describe() + '\n' : '';
  const body = shareMode() === 'full' && typeof window.buildReport === 'function' ? window.buildReport(S, ml) : shortTextReport(S, ml);
  return head + body;
};
// The ? beside a section head; what it opens is the app's (hook: help).
function _rpHelpBtn(topic){
  return `<button class="ms-help" onclick="TehfizReport.help('${topic}')" title="What does this mean?">?</button>`;
}

function openReview(){
  if(!_rpLessons().length){_rpToast('No sessions loaded');return;}
  // The multi-session review takes the sessions themselves — it works from
  // segments, dates and per-session inputs, none of which survive being
  // flattened into one synthetic session the way the old version did.
  _msTab='overview'; _msTrendWindow='all';
  if(window.TehfizReportRange) TehfizReportRange.onChange(_msRerender);   // v1_198
  _rpRoot().innerHTML = buildMultiReviewHTML(_rpLessons());
  _msMountMap();
  _rpShow();
}
// ═══════════════════════════════════════════════════════════════════
// REVIEW — HTML BUILDERS
// ───────────────────────────────────────────────────────────────────
// One builder per section, mirroring the teacher app's split. Everything a
// builder needs arrives as an argument — `sessions` and `repeats` used to be
// read straight off the activeSessions/repeatWordKeys globals — so the whole
// report can be rendered outside a browser once the app is split front/back.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// MULTI-SESSION REVIEW
// ───────────────────────────────────────────────────────────────────
// Answers a different question from the single-session review. That one asks
// "how did that go?"; this asks "what condition is each portion in, and what
// hasn't been checked lately?" — so it leads with rotation and persistence,
// not with a score.
// ═══════════════════════════════════════════════════════════════════
let _msTab = 'overview';
let _msPaceUnit = 'pages';   // rp5: pages first (decided 17 Nov); verse length varies too much
let _msTrendWindow = 'all';

function msToggleJuz(j){
  if(!toggleMemorisedJuz(j, _rpLessons())) { _rpToast('Already revised — cannot be un-memorised'); return; }
  const el=_rpRoot();
  if(el) { el.innerHTML = buildMultiReviewHTML(_rpLessons()); _msMountMap(); }
}
/* v1_178: the map inside "Memorised portions", read-only. */
function _msMountMap(){
  const el=(_rpRoot()||document).querySelector('[data-msmap]'), pages=teacherMapPages();
  if(!el || !pages || !window.TehfizMap) return;
  const m=_rpMap();
  TehfizMap.render(el, { pages, ayahs: (m && m.ayahs) || '', recentAuto: m.recent_auto!==false && m.recent_auto!==0, editable:false, openReadOnly:true });
}
// A fresh copy of the map: redraw the report if it is open.
window.addEventListener('tehfiz-plan', ()=>{
  if(_rpIsOpen()) _msRerender();
});

function buildMultiReviewHTML(sessions){
  /* v1_198: the range and the time window (tehfiz-range.js). Every tab below
     is handed the lessons already in the window and cut to the range, so they
     all read the same thing. What is memorised comes from all the lessons. */
  const R = window.TehfizReportRange;
  const ALL = sessionsChrono(sessions);
  if(!ALL.length) return `<div class="empty-hint">No sessions selected</div>`;
  const S = R ? sessionsChrono(R.apply(ALL)) : ALL;
  const mem = memorisedJuz(ALL);
  const bar = R ? R.barHTML(ALL) + R.summaryHTML(S, ALL) : '';
  if(!S.length) return _msHeader(ALL, mem) + bar +
    `<div class="empty-hint">No lessons in this range and time. Try a longer time, or the whole Quran.</div>`;
  const whole = !R || R.isWhole();
  const by  = stageTrend(S);
  const spots = spotTrend(S);

  // Tabs are built from what the data actually contains — a student with no
  // manzil segments shouldn't be given an empty manzil tab.
  const tabs=[{k:'overview', label:'Overview'}];
  ['new','recent','old','unassigned'].forEach(st=>{
    if(by[st]?.length) tabs.push({k:st, label:sessionTypeLabel(st), n:by[st].length});
  });
  if(spots.length) tabs.push({k:'spot', label:'Spot tests', n:spots.length});
  /* Top-level, NOT a sixth stage. A tajweed error in a sabaq segment and one in
     a manzil segment are the same phenomenon — the stage tells you nothing
     about it — so bucketing tajweed by stage would split one question into
     five answers to nothing. */
  const tjN = _tjMarks(S).length;
  if (tjN) tabs.push({k:'tajweed', label:'Tajweed', n:tjN});
  tabs.push({k:'log', label:'Log'});
  if(!tabs.some(t=>t.k===_msTab)) _msTab='overview';

  const rail=`<div class="ms-tabs">${tabs.map(t=>`<button class="ms-tab${_msTab===t.k?' on':''}" onclick="msSetTab('${t.k}')">
      ${t.k==='overview'?'':`<i style="background:${MS_STAGE_COLORS[t.k]||'var(--ink3)'}"></i>`}${esc(t.label)}${t.n?`<span>${t.n}</span>`:''}
    </button>`).join('')}</div>`;

  let body;
  // The rotation strip and the juz table are about the whole Quran; with a range set they step aside.
  if(_msTab==='overview')      body = (whole ? _msRotation(S, mem) + (R ? R.tableHTML(S, mem.set) : '') : '') +
                                      _msPersistence(S) + _msFocus(S) + _msSessions(S);
  else if(_msTab==='spot')     body = _msSpotTab(S);
  else if(_msTab==='log')      body = _msLogTab(S);
  else if(_msTab==='tajweed')  body = _msTajweedTab(S);
  else                         body = _msStageTab(S, _msTab);

  return _msHeader(S, mem) + bar + rail + body;
}

/* ── TAJWEED ────────────────────────────────────────────────────────
   Counts, not rates — for BOTH missed and added errors, deliberately.
   A missed rule has a real denominator: how many times the passage offered it,
   which the teacher app now counts at save time. An added rule has none — the
   places a ghunnah could WRONGLY be applied is roughly every word — so rating
   one and counting the other would put two numbers side by side that look
   comparable and are not. That is the spot-v1 / strength-v2 problem, which
   needed a tooltip to explain away.
   Opportunities still appear, as context beside a count rather than under it:
   "14 · of 212 madds recited" informs without inviting the division. */

function _tjMarks(S){
  const out = [];
  S.forEach(s => {
    const cfg = s.typeConfig || null;
    (s.mistakes || []).forEach(m => {
      if(!isTajweedMistake(m, cfg)) return;
      const sr = m.subrule || null;
      out.push({
        s, m, ymd: _sessYMD(s), sr,
        // The grouping key: a rule id, a letter, or a family when the teacher
        // named no rule. Null only when nothing was specified at all.
        key:  sr ? (sr.rule || sr.letter || sr.family || null) : null,
        kind: sr && sr.letter ? 'letter' : 'rule',
        added: !!(sr && sr.err === 'added'),
        cond:  !!(sr && sr.cond),
      });
    });
  });
  return out;
}

/* Opportunities summed across the sessions in view. Absent on any session
   recorded before the counter existed, and absent is not zero — a rule with no
   opportunity data shows its count with no denominator rather than "of 0". */
function _tjOpps(S){
  const rules = {}, letters = {};
  let have = 0;
  S.forEach(s => {
    const o = s.opportunities;
    if(!o) return;
    have++;
    for(const k in (o.rules   || {})) rules[k]   = (rules[k]   || 0) + o.rules[k];
    for(const k in (o.letters || {})) letters[k] = (letters[k] || 0) + o.letters[k];
  });
  return { rules, letters, have, total: S.length };
}

/* v1_201 (F10/I8): "in 37,526 chances" read like a mistake count. A chance is
   every time the rule came up in a lesson, so a page heard ten times counts
   ten times: that is right, but it wants saying as a rate. */
function _tjChances(n, chances){
  const pct = n / chances * 100;
  const p = pct >= 10 ? Math.round(pct) + '%' : pct >= 0.1 ? pct.toFixed(1) + '%' : '<0.1%';
  return `${p} of ${chances.toLocaleString()} chances`;
}
/* v1_201 (I7): tap a rule or a letter to see where it happened, newest first;
   each place opens the mushaf at that verse. One open at a time. */
let _tjOpen = null;
function tjToggle(id){ _tjOpen = _tjOpen === id ? null : id; _msRerender(); }
function _tjWhere(list){
  const rows = list.slice().sort((a,b) => (b.ymd||'').localeCompare(a.ymd||'')).slice(0, 12);
  return `<div class="tj-where">${rows.map(x => `<button type="button" class="tj-where-r" onclick="TehfizReport.goto(${x.m.surah},${x.m.ayah})">
      <span class="tj-where-d">${esc(sessionDateText(x.s))}</span>
      <span>${esc(SURAH_NAMES[x.m.surah-1]||'')} <b>${x.m.surah}:${x.m.ayah}</b></span>
      <span class="tj-where-w" dir="rtl">${esc(x.m.word||'')}</span></button>`).join('')}
    ${list.length > rows.length ? `<div class="ms-note">and ${list.length - rows.length} more, earlier</div>` : ''}</div>`;
}
function _tjBar(label, n, max, color, note, id){
  const open = id && _tjOpen === id;
  return `<div class="bar-row tj-bar${id ? ' tj-tap' : ''}${open ? ' open' : ''}"${id ? ` role="button" tabindex="0" aria-expanded="${open}" onclick="tjToggle('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tjToggle('${id}')}"` : ''}>
    <div class="bar-label">${esc(label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/max*100)}%;background:${color};"></div></div>
    <div class="bar-count">${n}</div>
    ${note ? `<div class="tj-of">${esc(note)}</div>` : '<div class="tj-of"></div>'}
  </div>`;
}

/* Improving, flat or worsening — by comparing the first half of the window
   with the second. Requires marks in at least three separate sessions: a
   direction drawn from two points is a line through noise, and the same
   discipline already governs minPointsForLine and the single-hearing dash. */
function _tjTrend(marks, sessionYmds){
  if(sessionYmds.length < 3) return null;
  const cut  = sessionYmds[Math.floor(sessionYmds.length / 2)];
  const early = marks.filter(m => m.ymd && m.ymd <  cut).length;
  const late  = marks.filter(m => m.ymd && m.ymd >= cut).length;
  if(early === 0 && late === 0) return null;
  if(late < early) return {dir:'better', sym:'↓', txt:`${early} → ${late}`};
  if(late > early) return {dir:'worse',  sym:'↑', txt:`${early} → ${late}`};
  return {dir:'flat', sym:'→', txt:`${early} → ${late}`};
}

function _msTajweedTab(S){
  const marks = _tjMarks(S);
  const opps  = _tjOpps(S);
  const ymds  = [...new Set(S.map(s => _sessYMD(s)).filter(Boolean))].sort();
  const withTj = new Set(marks.map(m => m.s)).size;

  const missed = marks.filter(m => !m.added);
  const added  = marks.filter(m =>  m.added);
  const conds  = marks.filter(m =>  m.cond).length;

  const tally = (list, kind) => {
    const t = {};
    list.filter(m => m.kind === kind && m.key).forEach(m => { t[m.key] = (t[m.key] || 0) + 1; });
    return Object.entries(t).sort((a,b) => b[1] - a[1]);
  };

  const missedRules   = tally(missed, 'rule');
  const addedRules    = tally(added,  'rule');
  const letters       = tally(marks,  'letter');
  const unspecified   = marks.filter(m => !m.key).length;

  const head = `<div class="ms-stats">
    <div class="ms-stat"><div class="ms-stat-n">${marks.length}</div><div class="ms-stat-l">marks</div></div>
    <div class="ms-stat"><div class="ms-stat-n">${withTj}<span class="tj-sub">/${S.length}</span></div><div class="ms-stat-l">sessions</div></div>
    <div class="ms-stat"><div class="ms-stat-n">${missedRules.length + addedRules.length}</div><div class="ms-stat-l">rules</div></div>
    <div class="ms-stat"><div class="ms-stat-n">${letters.length}</div><div class="ms-stat-l">letters</div></div>
  </div>`;

  /* Per session over time. Bars, not a line: a line implies a value between
     the points, and there is no tajweed count for a day with no lesson. */
  const perSession = ymds.map(y => ({ y, n: marks.filter(m => m.ymd === y).length }));
  const maxN = Math.max(1, ...perSession.map(p => p.n));
  const overTime = `<div class="ms-sec">
    <div class="ms-sec-head"><span>Marks per session</span>
      <span class="ms-sec-note">${ymds.length} session${ymds.length===1?'':'s'}</span></div>
    <div class="tj-spark">${perSession.map(p =>
      `<span class="tj-spark-b" style="height:${Math.max(2, Math.round(p.n/maxN*28))}px"
         title="${esc(p.y)} — ${p.n} mark${p.n===1?'':'s'}"></span>`).join('')}</div>
    <div class="ms-note">A session with none is a gap, not a zero: it may mean a clean
      recitation or a day tajweed was not listened for, and the two are indistinguishable here.</div>
  </div>`;

  const ruleSec = (title, list, color, useOpps) => {
    if(!list.length) return '';
    const max = list[0][1];
    return `<div class="ms-sec">
      <div class="ms-sec-head"><span>${esc(title)}</span>
        <span class="ms-sec-note">${list.length} distinct</span></div>
      ${list.map(([k, n]) => {
        const chances = useOpps ? opps.rules[k] : null;
        const these = marks.filter(m => m.key === k && (useOpps ? !m.added : m.added));
        const tr = _tjTrend(these, ymds);
        const id = (useOpps ? 'm:' : 'a:') + k;
        // v1_201 (F3/F4): the full name, as in every report; the short forms are for the teacher's buttons.
        return _tjBar(ruleLabel(k), n, max, color,
          (chances ? _tjChances(n, chances) : '') + (tr ? `  ${tr.sym}` : ''), id) + (_tjOpen === id ? _tjWhere(these) : '');
      }).join('')}
    </div>`;
  };

  const letterSec = letters.length ? `<div class="ms-sec">
    <div class="ms-sec-head"><span>Letters by recurrence</span>
      <span class="ms-sec-note">${letters.length} distinct</span></div>
    ${letters.map(([l, n]) => {
      const mk = makhrajOf(l);
      const chances = opps.letters[l];
      const id = 'l:' + l, open = _tjOpen === id;
      return `<div class="bar-row tj-tap${open ? ' open' : ''}" role="button" tabindex="0" aria-expanded="${open}" onclick="tjToggle('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tjToggle('${id}')}">
        <div class="bar-label tj-letter">${esc(l)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/letters[0][1]*100)}%;background:var(--tajweed);"></div></div>
        <div class="bar-count">${n}</div>
        <div class="tj-of">${mk ? esc(mk.label) : ''}${chances ? ` · ${_tjChances(n, chances)}` : ''}</div>
      </div>` + (open ? _tjWhere(marks.filter(m => m.kind === 'letter' && m.key === l)) : '');
    }).join('')}
    <div class="ms-note">Which letters will not sit in the right place — the most
      directly actionable thing here, because it names what to drill.</div>
  </div>` : '';

  const caveats = [];
  if(opps.have && opps.have < opps.total)
    caveats.push(`Opportunity counts cover ${opps.have} of ${opps.total} sessions; the rest predate them.`);
  if(!opps.have)
    caveats.push('No opportunity counts in these sessions, so counts appear without a denominator.');
  if(conds)
    caveats.push(`${conds} mark${conds===1?'':'s'} applied only because a verse was joined to the next — the teacher's judgement, not the annotation's.`);
  if(unspecified)
    caveats.push(`${unspecified} mark${unspecified===1?'':'s'} named no rule or letter, so ${unspecified===1?'it is':'they are'} counted but not ranked.`);

  return head + overTime +
    ruleSec('Rules missed or mistimed', missedRules, 'var(--tajweed)', true) +
    ruleSec('Rules added where they do not belong', addedRules, 'var(--amber)', false) +
    letterSec +
    (addedRules.length ? `<div class="ms-note">Added errors are counted, never rated: there is no
      meaningful number of chances to wrongly apply a rule, so a percentage would be invented.</div>` : '') +
    (caveats.length ? `<div class="ms-sec tj-caveats">${caveats.map(c => `<div>${esc(c)}</div>`).join('')}</div>` : '');
}

/* ── RECITATION LOG ─────────────────────────────────────────────────
   One row per SEGMENT, not per session. The stage lives on the segment, and a
   sitting can hold a sabaq and a manzil — collapsing those to one row would
   make "filter by lesson type" meaningless.
   Duration and notes are session-level and therefore repeat across a session's
   rows. That is right for something you will sort and filter: every row has to
   stand on its own. */
/* `grouped` is the default: a session banner carrying the things that belong to
   the SITTING — time, duration, notes — with its segments beneath it. Those
   three repeated on every segment row, which read as three lessons of 1h 05m
   rather than one sitting of 1h 05m containing three lessons.
   `segments` is the flat view for when the segment is the unit of interest. It
   drops duration and notes entirely rather than repeating them: a value that is
   true of the session but printed against a segment is a claim about the
   segment, and it is the wrong one. */
let _logStage = 'all', _logNotesOnly = false, _logView = 'grouped';

function _logRows(S){
  const rows = [];
  S.forEach(s => {
    const d    = _sessDate(s);
    const ymd  = _sessYMD(s);
    const time = d && !isNaN(d) ? d.toLocaleTimeString([], (typeof tehfizTimeOpts === 'function' ? tehfizTimeOpts() : {hour:'2-digit', minute:'2-digit'})) : '';
    (s.segments || []).forEach(sg => {
      const o    = segOrdered(sg);
      const spot = sg.mode === 'spot';
      // Counts only, per the brief — the by-verse list already carries detail.
      const ml   = mistakesInSegment(s.segments, sg, s.mistakes || []);
      const hifz = ml.filter(m => !isTajweedMistake(m, s.typeConfig || null)).length;
      const taj  = ml.length - hifz;
      let score = null, pages = null;
      if(!spot && segmentScorable(sg)){
        const inp = inputsAreCurrent(s)
          ? (inputsWithPages(sg.strengthInputs, sg) || segmentStrengthInputs(s.segments, sg, s.mistakes||[]))
          : segmentStrengthInputs(s.segments, sg, s.mistakes||[]);
        if(inp && inp.verses){ score = gradedValue(sg, strengthFromInputs(inp)); pages = inp.pages; }
      }
      rows.push({
        sid: s.id || (ymd + '|' + time), sessionName: sessionNameOf(s),
        ymd, date: sessionDateText(s), time,
        // rp4: no length while a range is set — a 30-minute lesson cannot be split by verse.
        duration: _rpRangeSet() ? '' : (s.duration || ''),
        stage: spot ? 'spot' : (sg.type || 'unassigned'),
        stageLabel: spot ? 'Spot test' : sessionTypeLabel(sg.type || 'unassigned'),
        kind: spot ? 'spot' : 'recite',
        range: sg.rangeLabel || describeRange(o.startKey, o.endKey) || sessionNameOf(s),
        pages, hifz, taj, score,
        notes: s.remarks || '',
      });
    });
  });
  return rows.reverse();          // newest first, which is how a log is read
}

function _logFiltered(S){
  /* v1_200: time is the report's own (tehfiz-range.js: 4 weeks … Dates…), and
     S arrives already in that time and range. The Log keeps only what is its
     own: which part (Show) and With notes. Its old time row and the "Recite
     only / Spot only" row repeated those and are gone (mock-up 5a). */
  return _logRows(S).filter(r =>
       (_logStage === 'all' || r.stage === _logStage)
    && (!_logNotesOnly || r.notes));
}
// The lessons the report is showing: in its time, cut to its range.
function _msReportSessions(){
  const all = sessionsChrono(_rpLessons());
  return window.TehfizReportRange ? sessionsChrono(TehfizReportRange.apply(all)) : all;
}

function msSetLogFilter(k, v){
  if(k === 'stage') _logStage = v;
  else if(k === 'notes') _logNotesOnly = !_logNotesOnly;
  else if(k === 'view')  _logView = v;
  _msRerender();
}

function _msLogTab(S){
  const all  = _logRows(S);
  const rows = _logFiltered(S);
  // v1_200: a fixed order (New, Recent, Old, others, Spot tests), not the order the lessons happened to fall in.
  const _ord = st => ({new:0, recent:1, old:2, spot:9})[st] ?? 5;
  const stages = [...new Set(all.map(r => r.stage))].sort((a, b) => _ord(a) - _ord(b));
  const chip = (k, v, label, on) =>
    `<button class="ms-tab${on?' on':''}" onclick="msSetLogFilter('${k}','${v}')">${esc(label)}</button>`;

  // A part that is no longer in this range and time drops out of Show.
  if(_logStage !== 'all' && !stages.includes(_logStage)) _logStage = 'all';
  const cnt = st => all.filter(r => st === 'all' || r.stage === st).length;
  const stName = st => st === 'all' ? 'All' : st === 'spot' ? 'Spot tests' : sessionTypeLabel(st);
  const showOpts = ['all', ...stages];
  const filters = `
    <div class="lg-tools">
      <span class="lg-l">Show</span>
      <div class="lg-segc" role="group" aria-label="Show">${showOpts.map(st =>
        `<button type="button" class="${_logStage===st?'on':''}" aria-pressed="${_logStage===st}" onclick="msSetLogFilter('stage','${st}')">${esc(stName(st))} <span class="lg-c">${cnt(st)}</span></button>`).join('')}</div>
      <select class="lg-show-sel" aria-label="Show" onchange="msSetLogFilter('stage',this.value)">${showOpts.map(st =>
        `<option value="${st}"${_logStage===st?' selected':''}>Show: ${esc(stName(st))} (${cnt(st)})</option>`).join('')}</select>
      <label class="lg-chk"><input type="checkbox"${_logNotesOnly?' checked':''} onchange="msSetLogFilter('notes','')"> With notes</label>
      <span class="lg-sp"></span>
      <div class="lg-segc lg-view" role="group" aria-label="Group by">
        <button type="button" class="${_logView==='grouped'?'on':''}" onclick="msSetLogFilter('view','grouped')">By lesson</button>
        <button type="button" class="${_logView==='segments'?'on':''}" onclick="msSetLogFilter('view','segments')">By part</button>
      </div>
      <details class="lg-exp"><summary>Export <span aria-hidden="true">▾</span></summary><div class="lg-exp-m">
        <button type="button" onclick="this.closest('details').open=false;exportLogCSV()">CSV, opens in Excel</button>
        <button type="button" onclick="this.closest('details').open=false;printLog()">PDF, with Save as PDF</button>
      </div></details>
    </div>`;

  if(!rows.length){
    return filters + `<div class="empty-hint">No lessons match. Try All, or untick With notes.</div>`;
  }

  const cells = r => `
      <td>${esc(r.stageLabel)}</td>
      <td class="lg-range">${nbNames(r.range)}</td>
      <td class="lg-n">${r.pages != null ? r.pages.toFixed(1) : '—'}</td>
      <td class="lg-n">${r.score != null ? r.score + '%' : '—'}</td>
      <td class="lg-n">${r.hifz || '—'}</td>
      <td class="lg-n">${r.taj || '—'}</td>`;

  let head, body;
  if(_logView === 'grouped'){
    head = `<tr><th>Lesson</th><th>Range</th><th>Pages</th><th>Strength</th><th>Mistakes</th><th>Tajweed</th></tr>`;
    // Rows are already newest-first and a session's segments are contiguous,
    // so a running key groups them without sorting or bucketing.
    let last = null; body = '';
    rows.forEach(r => {
      if(r.sid !== last){
        last = r.sid;
        const segs = rows.filter(x => x.sid === r.sid).length;
        body += `<tr class="lg-sess"><td colspan="6">
          <b>${esc(r.date)}</b> <span class="lg-sub-i">${esc(r.time)}</span>
          ${r.duration ? `<span class="lg-dur">${esc(r.duration)}</span>` : ''}
          <span class="lg-segn">${segs} part${segs===1?'':'s'}</span>
          ${r.notes ? `<div class="lg-note-line">${esc(r.notes)}</div>` : ''}
        </td></tr>`;
      }
      body += `<tr class="lg-seg">${cells(r)}</tr>`;
    });
  } else {
    head = `<tr><th>Date</th><th>Lesson</th><th>Range</th><th>Pages</th><th>Strength</th><th>Mistakes</th><th>Tajweed</th></tr>`;
    body = rows.map(r => `<tr>
      <td>${esc(r.date)}<div class="lg-sub">${esc(r.time)}</div></td>${cells(r)}
    </tr>`).join('');
  }

  const sessN = new Set(rows.map(r => r.sid)).size;
  /* v1_200 (F5): on a phone each lesson is a card, so nothing runs off the
     edge; the table stays for wider screens and for print. */
  let cards = '', lastSid = null;
  rows.forEach(r => {
    if(r.sid === lastSid) return; lastSid = r.sid;
    const parts = rows.filter(x => x.sid === r.sid);
    cards += `<div class="lg-card"><div class="lg-card-h"><b>${esc(r.date)}</b><span class="lg-sub-i">${esc(r.time)}</span>${r.duration ? `<span class="lg-dur">${esc(r.duration)}</span>` : ''}</div>
      ${parts.map(x => `<div class="lg-card-p"><div><b>${esc(x.stageLabel)}</b> · ${esc(x.range)}${x.pages != null ? ` · ${x.pages.toFixed(1)} pages` : ''}</div>
        <div class="lg-card-n">${x.score != null ? `<b>${x.score}%</b>` : '<span class="lg-sub-i" style="margin:0">—</span>'}
          <span>${x.hifz ? x.hifz + ' mistake' + (x.hifz===1?'':'s') : 'no mistakes'}${x.taj ? ' · ' + x.taj + ' tajweed' : ''}</span></div></div>`).join('')}
      ${r.notes ? `<div class="lg-note-line">${esc(r.notes)}</div>` : ''}</div>`;
  });
  return filters + `
    <div class="ms-sec" id="logPrintArea">
      <div class="ms-sec-head"><span>Recitation log</span><span class="ms-sec-note">${sessN} lesson${sessN===1?'':'s'} · ${rows.length} part${rows.length===1?'':'s'}${window.TehfizReportRange ? ' · ' + esc(TehfizReportRange.describe()) : ''}</span></div>
      <div class="lg-scroll"><table class="lg-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table></div>
      <div class="lg-cards">${cards}</div>
    </div>`;
}

/* CSV rather than a real .xlsx. An xlsx is a zip container, so writing one
   needs a zip implementation or a CDN library — and this viewer has no external
   scripts at all, which is what lets a student open a .qrs with no network. A
   dependency that fails silently offline is a worse trade than losing column
   widths.
   The BOM is not optional: without it Excel reads the file as its local
   codepage and every Arabic range comes out as mojibake. */
function exportLogCSV(){
  const rows = _logFiltered(_msReportSessions());   // v1_200: what the report shows, not every lesson
  /* Duration and notes are session-level, so in the grouped view they are
     written against the FIRST segment of each session and left blank after —
     the spreadsheet stays flat and sortable without asserting that every
     segment lasted an hour. The segment view omits them entirely, matching
     what is on screen. */
  const grouped = _logView === 'grouped';
  const head = grouped
    ? ['Date','Time','Lesson','Range','Pages','Strength','Mistakes','Tajweed','Duration','Notes']
    : ['Date','Time','Lesson','Range','Pages','Strength','Mistakes','Tajweed'];
  let seen = null;
  const esc2 = v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = [head.join(',')].concat(rows.map(r => {
    const first = r.sid !== seen; seen = r.sid;
    const base = [r.date, r.time, r.stageLabel, r.range,
      r.pages != null ? r.pages.toFixed(1) : '',
      r.score != null ? r.score : '', r.hifz, r.taj];
    return (grouped ? base.concat([first ? r.duration : '', first ? r.notes : '']) : base)
      .map(esc2).join(',');
  }));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `recitation-log-${_ymd(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* window.print() rather than a PDF library. It gives Save as PDF on every
   platform including iOS, and it renders the Arabic with the browser's own
   text engine — jsPDF would need the fonts embedded and still breaks Arabic
   shaping, which would turn every range label into disconnected letters. */
function printLog(){
  document.body.classList.add('printing-log');
  const done = () => { document.body.classList.remove('printing-log'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 60);
}

function msSetPaceUnit(u){ _msPaceUnit=u; _msRerender(); }
function msSetTab(t){ _msTab=t; _msTrendWindow='all'; _msRerender(); }

// ── A stage tab: its trend, plus the metrics that only make sense for it ──
function _msStageTab(S, stage){
  let extra='';
  if(stage==='new'){
    // rp5: pace stays with a range set. It counts verses and dates, not lesson
    // time, so a cut lesson gives the pace of that juz or surah (rp4 hid it).
    const pace=sabaqPace(S), hd=handoffDeltas(S);
    const mean = hd.length ? Math.round(hd.reduce((n,h)=>n+h.delta,0)/hd.length) : null;
    extra = `<div class="ms-sec">
      <div class="ms-sec-head"><span>Pace &amp; retention</span>${_rpHelpBtn('sabaq')}
        <span class="ms-unit">
          <button class="ms-unit-b${_msPaceUnit==='pages'?' on':''}" onclick="msSetPaceUnit('pages')">pages</button>
          <button class="ms-unit-b${_msPaceUnit==='verses'?' on':''}" onclick="msSetPaceUnit('verses')">verses</button>
        </span></div>
      <div class="ms-stats">
        ${pace?(_msPaceUnit==='pages'
          ? `<div class="ms-stat"><span class="ms-stat-n">${pace.pagesPerWeek}</span><span class="ms-stat-l">pages / week</span></div>
             <div class="ms-stat"><span class="ms-stat-n">${pace.pages}</span><span class="ms-stat-l">pages added</span></div>`
          : `<div class="ms-stat"><span class="ms-stat-n">${pace.versesPerWeek}</span><span class="ms-stat-l">verses / week</span></div>
             <div class="ms-stat"><span class="ms-stat-n">${pace.verses}</span><span class="ms-stat-l">verses added</span></div>`):''}
        ${mean!=null?`<div class="ms-stat"><span class="ms-stat-n" style="color:${mean>=0?'var(--green)':'var(--red)'}">${mean>0?'+':''}${mean}</span><span class="ms-stat-l">avg change on return</span></div>`:''}
      </div>
      ${hd.length?`<div class="ms-rows">${hd.slice(-6).reverse().map(h=>`<div class="ms-row">
        <span class="ms-row-ref">${esc(h.label||'')}</span>
        <span class="ms-row-meta">${h.learned} → ${h.returned} after ${h.days}d</span>
        <span class="ms-row-score" style="color:${h.delta>=0?'var(--green)':'var(--red)'};">${h.delta>0?'+':''}${h.delta} pts</span>
      </div>`).join('')}</div>`:''}
    </div>`;
  }
  if(stage==='recent'){
    const sq=sabqiPassages(S);
    const col=st=>st==='climbing'?'var(--green)':st==='declining'?'var(--red)':'var(--ink3)';
    const seq=r=>{
      const shown = r.scores.length>6 ? r.scores.slice(-6) : r.scores;
      const lead  = r.scores.length>6 ? '… ' : '';
      const from  = r.learnedScore!=null
        ? `<span style="color:var(--ink3)" title="score on the day it was learned">${r.learnedScore}</span> &rArr; ` : '';
      return from + lead + shown.map(s=>s.score).join(' &rarr; ');
    };
    extra = `<div class="ms-sec">
      <div class="ms-sec-head"><span>Consolidation</span>${_rpHelpBtn('sabqi')}
        <span class="ms-sec-note">${sq.passages} passage${sq.passages===1?'':'s'}${sq.avgHearings?` · ${sq.avgHearings} hearings each on average`:''}</span></div>
      <div class="ms-stats">
        ${sq.avgDelta!=null?`<div class="ms-stat"><span class="ms-stat-n" style="color:${sq.avgDelta>=0?'var(--green)':'var(--red)'}">${sq.avgDelta>0?'+':''}${sq.avgDelta}</span><span class="ms-stat-l">avg change across hearings</span></div>`:''}
        <div class="ms-stat"><span class="ms-stat-n" style="color:var(--green)">${sq.climbing}</span><span class="ms-stat-l">still improving</span></div>
        <div class="ms-stat"><span class="ms-stat-n">${sq.stalled}</span><span class="ms-stat-l">not moving</span></div>
        <div class="ms-stat"><span class="ms-stat-n" style="color:var(--red)">${sq.declining}</span><span class="ms-stat-l">slipping</span></div>
      </div>
      ${sq.rows.length?`<div class="ms-rows">${sq.rows.slice(0,12).map(r=>`<div class="ms-row">
        <span class="ms-row-ref">${esc(r.label||'')}</span>
        <span class="ms-row-meta">${seq(r)} · ${r.hearings}&times;${r.days?` over ${r.days}d`:''}</span>
        <span class="ms-row-score" style="color:${col(r.status)};">${r.delta==null?'—':(r.delta>0?'+':'')+r.delta+' pts'}</span>
      </div>`).join('')}</div>`:''}
      ${sq.single?`<div class="ms-note" style="margin-top:6px;">${sq.single} passage${sq.single===1?' has':'s have'} been heard
        only once so far — no trajectory yet, shown with a dash.</div>`:''}
    </div>`;
    if(sq.graduated.n || sq.openN){
      extra += `<div class="ms-sec">
        <div class="ms-sec-head"><span>Time to graduate</span>${_rpHelpBtn('graduate')}
          <span class="ms-sec-note">${sq.graduated.n} moved on to ${esc(sessionTypeLabel('old'))}</span></div>
        <div class="ms-stats">
          ${sq.graduated.medDays!=null?`<div class="ms-stat"><span class="ms-stat-n">${sq.graduated.medDays}</span><span class="ms-stat-l">median days in ${esc(sessionTypeLabel('recent'))}</span></div>`:''}
          ${sq.graduated.medHearings!=null?`<div class="ms-stat"><span class="ms-stat-n">${sq.graduated.medHearings}</span><span class="ms-stat-l">median hearings first</span></div>`:''}
          <div class="ms-stat"><span class="ms-stat-n">${sq.openN}</span><span class="ms-stat-l">still here</span></div>
          ${sq.longestOpen?`<div class="ms-stat"><span class="ms-stat-n" style="color:${sq.longestOpen>90?'var(--red)':'var(--ink)'}">${sq.longestOpen}d</span><span class="ms-stat-l">longest running</span></div>`:''}
        </div>
      </div>`;
    }
  }
  if(stage==='old'){
    const ct=cycleTimes(S);
    // v1_198: with a range set, only the juz inside it.
    const _mj=memorisedJuz(S), _in=window.TehfizReportRange&&TehfizReportRange.juzInRange();
    if(_in) _mj.set=new Set([..._mj.set].filter(j=>_in.has(j)));
    extra = _msRotation(S, _mj) + `<div class="ms-sec">
      <div class="ms-sec-head"><span>Rotation cycle</span>${_rpHelpBtn('cycle')}
        <span class="ms-sec-note">${ct.meanCycle!=null?`averaging ${ct.meanCycle} days between hearings`:''}</span></div>
      <div class="ms-rows">${ct.rows.map(r=>`<div class="ms-row">
        <span class="ms-row-ref">Juz <strong>${r.juz}</strong></span>
        <span class="ms-row-meta">${r.times}&times; as ${esc(sessionTypeLabel('old'))} · avg ${r.avgGap==null?'—':r.avgGap+'d'}</span>
        <span class="ms-row-score" style="color:${r.maxGap>90?'var(--red)':r.maxGap>45?'var(--lvl2-orange)':'var(--ink3)'};font-size:12px;">${r.maxGap==null?'—':'worst '+r.maxGap+'d'}</span>
      </div>`).join('')}</div>
    </div>`;
  }
  return _msTrend(S, stage) + extra;
}

// ── Spot tests get the whole tab, not a line on someone else's chart ──
function _msSpotTab(S){
  const sp=spotTrend(S);
  const cmp=spotVsRecite(S);
  const tot=sp.reduce((a,p)=>({pass:a.pass+p.pass, partial:a.partial+p.partial, fail:a.fail+p.fail, done:a.done+p.done}),
                      {pass:0,partial:0,fail:0,done:0});
  const R=sp.reduce((a,p)=>{ ['pass','partial','fail','done'].forEach(k=>{ a.rnd[k]+=p.rnd[k]; a.wk[k]+=p.wk[k]; }); return a; },
                  {rnd:{pass:0,partial:0,fail:0,done:0}, wk:{pass:0,partial:0,fail:0,done:0}});
  const card=(t,name,note,cls)=>`<div class="ms-spot2 ${cls}"><span class="ms-spot2-n">${name}</span>
      <span class="ms-spot2-r">${t.done?_spotRate(t)+'%':'—'}</span>
      <span class="ms-spot2-t">${t.done} assessed · ${t.pass} passed · ${t.partial} partial · ${t.fail} failed</span>
      <span class="ms-spot2-note">${note}</span></div>`;
  const two = R.wk.done ? `<div class="ms-sec"><div class="ms-sec-head"><span>Random and weak places</span>${_rpHelpBtn('spot')}</div>
    <div class="ms-spot2s">${card(R.rnd,'Random spots','How well the portion holds up anywhere.','rnd')}
      ${card(R.wk,'Weak places','Chosen because they went wrong before, so lower is expected. Watch it rise.','wk')}</div></div>` : '';
  return _msTrend(S,'spot') + two + `<div class="ms-sec">
    <div class="ms-sec-head"><span>All spots</span><span class="ms-sec-note">${tot.done} assessed across ${sp.length} tests</span></div>
    <div class="ms-stats">
      <div class="ms-stat"><span class="ms-stat-n" style="color:var(--green)">${tot.pass}</span><span class="ms-stat-l">passed</span></div>
      <div class="ms-stat"><span class="ms-stat-n" style="color:var(--amber)">${tot.partial}</span><span class="ms-stat-l">partial</span></div>
      <div class="ms-stat"><span class="ms-stat-n" style="color:var(--red)">${tot.fail}</span><span class="ms-stat-l">failed</span></div>
    </div>
    ${cmp.length?`<div class="ms-sec-head" style="margin-top:10px;"><span>Spot vs full recitation</span>${_rpHelpBtn('spot')}</div>
      <div class="ms-rows">${cmp.map(r=>`<div class="ms-row">
        <span class="ms-row-ref">Juz <strong>${r.juz}</strong></span>
        <span class="ms-row-meta">recited ${r.recite}% · spot ${r.spot}%</span>
        <span class="ms-row-score" style="color:${r.spot-r.recite<-15?'var(--red)':'var(--ink3)'};font-size:13px;">${r.spot-r.recite>0?'+':''}${r.spot-r.recite} pts</span>
      </div>`).join('')}</div>
      `:''}
  </div>`;
}

function _msHeader(S, mem){
  const first=_sessDate(S[0]), last=_sessDate(S[S.length-1]);
  const span = first&&last ? `${sessionDateText(S[0])} – ${sessionDateText(S[S.length-1])}` : '';
  const days = first&&last ? daysBetween(first,last) : 0;
  const names=[...new Set(S.map(s=>s.student).filter(Boolean))];
  const totalM=S.reduce((n,s)=>n+(s.mistakes||[]).length,0);
  /* Synced sessions carry no name — the server never has one — so counting
     names gave "0 students" on every synced report. Named sessions only exist
     in files imported by hand; everything else is titled by who is looking. */
  /* v1_201 (F8): in teacher review the teacher's own label comes first (the
     name from this device's roster, with the code). Synced lessons carry the
     code in .student, which used to win and hid the name. */
  const _rl = _rpHook('label')() || '';
  const title = _rl && _rl !== 'this student' ? _rl
    : names.length===1 ? names[0]
    : names.length>1 ? `${names.length} students`
    : (_rpHook('label')() ? _rpHook('label')()
    : (localStorage.getItem('tehfiz_claim_token') ? 'Your progress' : 'Progress report'));
  return `<div class="rv-head">
    <h2>${esc(title)}</h2>
    <p class="rv-sub">${S.length} sessions · ${esc(span)}${days?` · ${days} days`:''}</p>
    <div class="rv-badges">
      <span class="m-badge" style="background:var(--parchment3);color:var(--ink2);">${totalM} mistakes</span>
      <span class="m-badge" style="background:var(--parchment3);color:var(--ink2);">${mem.set.size} juz memorised</span>
    </div>
  </div>`;
}

// ── Rotation: the headline. What hasn't been heard lately, and what never has.
function _msRotation(S, mem){
  const rows = portionCondition(S, mem.set);
  if(!rows.length) return '';
  const stale = rows.filter(r=>r.att!=='settled');
  const bandLabel = k => (METRICS_MODEL.rotation.bands.find(b=>b.key===k)||{}).label || 'never verified';
  const cell = r => {
    const aged = r.scoreGap!=null && r.scoreGap > METRICS_MODEL.rotation.agedScoreDays;
    const cls = r.att;
    const ttl = r.neverHeard
      ? `Juz ${r.juz} — memorised but never revised in any recorded session`
      : `Juz ${r.juz} — last heard ${r.daysSince} day${r.daysSince===1?'':'s'} ago, ${r.heard} time${r.heard===1?'':'s'} total`
        + (r.lastScore!=null?`, scored ${r.lastScore} then`:r.spotOnly?', spot-tested only — no full recitation to score':'')
        + (aged?` — but that score is ${r.daysSinceScored} days old; nothing since has been fully recited`:'')
        + (r.projected!=null?`. Unverified for ${r.daysSinceScored} day${r.daysSinceScored===1?'':'s'}, so condition now reads ~${r.projected} — ${bandLabel(r.att)}`:'');
    // Everything legible without hovering: how long ago, how many times, and
    // what it scored. A tooltip is no use on touch and no use when scanning.
    const when = r.neverHeard ? 'never'
      : r.daysSince===0 ? 'today'
      : r.daysSince<31 ? `${r.daysSince}d ago`
      : r.daysSince<365 ? `${Math.round(r.daysSince/30)}mo ago`
      : `${(r.daysSince/365).toFixed(1)}y ago`;
    return `<div class="jz ${cls}" title="${ttl}">
      <div class="jz-top"><span class="jz-n">${r.juz}</span>${r.lastScore!=null?`<span class="jz-s${aged?' aged':''}">${r.lastScore}</span>`:r.spotOnly?`<span class="jz-s spot">🎲</span>`:''}</div>
      <div class="jz-d">${when}</div>
      <div class="jz-c">${r.neverHeard?'not revised':`heard ${r.heard}&times;`}</div>
    </div>`;
  };

  return `<div class="ms-sec">
    <div class="ms-sec-head"><span>Revision rotation</span>${_rpHelpBtn('rotation')}
      <span class="ms-sec-note">${stale.length} of ${rows.length} need attention</span></div>
    <div class="jz-strip">${rows.map(cell).join('')}</div>
    <div class="jz-key">
      <span>needs attention:</span>
      <span><i class="jz settled"></i>settled</span>
      <span><i class="jz due"></i>due a look</span>
      <span><i class="jz overdue"></i>overdue</span>
      <span><i class="jz urgent"></i>urgent</span>
      <span><i class="jz unknown"></i>never verified</span>
      <span><span class="jz-s aged" style="font-size:9px;">99</span> score older than the visit</span>
    </div>
    ${_msProfileEditor(S, mem)}
  </div>`;
}

function _msProfileEditor(S, mem){
  // v1_198: with a map, the juz table (tehfiz-range.js) shows it; teachers get a link to the map itself.
  if(mem.fromMap && window.TehfizReportRange) return '';
  if(mem.fromMap){
    const who = _rpIsTeacher()
      ? 'This is the memorisation map from the student\u2019s Profile. Change it there.'
      : 'Your teacher keeps this map in Tehfiz. It is the same one you see in My journey.';
    return `<details class="ms-prof" open><summary>Memorised portions \u2014 from the memorisation map</summary>
      <div class="ms-note" style="margin:6px 0;">${who}</div>
      <div class="ms-map" data-msmap></div>
    </details>`;
  }
  const obs=observedJuz(S, true);
  return `<details class="ms-prof"><summary>Memorised portions${mem.declared?'':' — inferred from revisions so far'}</summary>
    <div class="ms-note" style="margin:6px 0;">Tap a juz to mark it memorised. Anything already
      revised is locked on. Only declared portions can show up as never-revised.</div>
    <div class="jz-pick">${Array.from({length:30},(_,i)=>i+1).map(j=>{
      const on=mem.set.has(j), lock=obs.has(j);
      return `<button class="jzp${on?' on':''}${lock?' lock':''}" onclick="msToggleJuz(${j})"
        title="${lock?'Revised in a session — always counted':on?'Memorised':'Not memorised'}">${j}</button>`;
    }).join('')}</div>
  </details>`;
}
// ── Trend: tabbed by stage, with a real dated x-axis ──────────────
// Tabs rather than one overlaid chart because the CADENCE differs — sabaq shows
// up almost every session, manzil every few weeks — so on a shared axis manzil
// bunches into clumps while sabaq fills the width. Each stage gets the space.
// Spot tests get their own tab: they sample rather than recite, so they have no
// verse rate and can't share the strength axis at all.
const MS_WINDOWS=[['all','All'],['1y','1y'],['6m','6m'],['3m','3m'],['1m','1m']];
const MS_WIN_DAYS={'1y':365,'6m':182,'3m':91,'1m':31};
const MS_STAGE_COLORS={new:'var(--red)', recent:'var(--lvl2-orange)', old:'var(--teal)',
                       unassigned:'var(--ink3)', spot:'var(--spot-blue)'};

function msSetWindow(w){ _msTrendWindow=w; _msRerender(); }
function _msRerender(){
  const el=_rpRoot();
  if(el) { el.innerHTML=buildMultiReviewHTML(_rpLessons()); _msMountMap(); }
}

// Ticks that stay readable at every window: months when the span is long,
// days when it's short. A bare pixel axis with no labels was the real gap.
function _msTicks(t0,t1){
  const span=(t1-t0)/86400000;
  const out=[];
  if(span<=0){ return [{t:t0,lab:''}]; }
  if(span>200){
    const d=new Date(t0); d.setDate(1);
    const step = span>500 ? 3 : span>320 ? 2 : 1;
    let m=new Date(d.getFullYear(), d.getMonth(), 1);
    while(+m<=t1){ if(+m>=t0) out.push({t:+m, lab:m.toLocaleDateString(undefined,{month:'short'})}); m=new Date(m.getFullYear(), m.getMonth()+step, 1); }
  } else if(span>45){
    const d=new Date(t0); d.setDate(1);
    let m=new Date(d.getFullYear(), d.getMonth(), 1);
    while(+m<=t1){ if(+m>=t0) out.push({t:+m, lab:m.toLocaleDateString(undefined,{month:'short'})}); m=new Date(m.getFullYear(), m.getMonth()+1, 1); }
  } else {
    const n=Math.min(6, Math.max(2, Math.round(span/7)));
    for(let i=0;i<=n;i++){ const t=t0+(t1-t0)*i/n;
      out.push({t, lab:new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short'})}); }
  }
  return out;
}

function _msTrend(S, which){
  // Now a plain chart for ONE series — the tab bar moved up to the review
  // itself, so this no longer decides what it's showing.
  const isSpot = which==='spot';
  // rp6: with any weak-place spots, the main line is random spots only and
  // weak places get their own; otherwise every spot, as before.
  const _sp = isSpot ? spotTrend(S) : [];
  const split = isSpot && _sp.some(p=>p.wk && p.wk.done);
  let pts = isSpot
    ? _sp.map(p=>split
        ? {date:p.date, v:p.rnd.done?_spotRate(p.rnd):null, label:`${p.label} — random ${p.rnd.pass}/${p.rnd.done} passed`}
        : {date:p.date, v:p.rate, label:`${p.label} — ${p.pass}/${p.done} passed`})
    : (stageTrend(S)[which]||[]).map(p=>({date:p.date, v:p.score, label:`${p.label||''} · ${p.verses} verses`}));
  let pts2 = split ? _sp.filter(p=>p.wk.done).map(p=>({date:p.date, v:_spotRate(p.wk), label:`${p.label} — weak places ${p.wk.pass}/${p.wk.done} passed`})) : [];
  pts=pts.filter(p=>p.date && p.v!=null).sort((a,b)=>a.date-b.date);
  pts2=pts2.filter(p=>p.date && p.v!=null).sort((a,b)=>a.date-b.date);
  if(!pts.length && !pts2.length) return '';

  const lastT=Math.max(pts.length?+pts[pts.length-1].date:0, pts2.length?+pts2[pts2.length-1].date:0);
  const winDays=window.TehfizReportRange ? 0 : MS_WIN_DAYS[_msTrendWindow];   // v1_198: the report's own time filter decides
  const cutoff=winDays ? lastT-winDays*86400000 : -Infinity;
  const inWin=pts.filter(p=>+p.date>=cutoff);
  const inWin2=pts2.filter(p=>+p.date>=cutoff);
  const hidden=pts.length-inWin.length;

  const W=560,H=150,PL=28,PR=10,PT=10,PB=30;
  const color=MS_STAGE_COLORS[which]||'var(--ink3)';
  let body;
  if(!inWin.length && !inWin2.length){
    body=`<text x="${W/2}" y="${H/2}" font-size="10" fill="var(--ink3)" text-anchor="middle">Nothing in this window</text>`;
  } else {
    const _all=inWin.concat(inWin2).map(p=>+p.date);
    const t0=Math.min(..._all), t1=Math.max(..._all);
    const x=d=>t1===t0?(PL+(W-PL-PR)/2):PL+(+d-t0)/(t1-t0)*(W-PL-PR);
    const y=v=>PT+(100-v)/100*(H-PT-PB);
    const path=inWin.map((p,i)=>`${i?'L':'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    body=`
      ${[0,25,50,75,100].map(v=>`<line x1="${PL}" x2="${W-PR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-width=".5"/>
         <text x="2" y="${y(v)+3}" font-size="8" fill="var(--ink3)">${v}</text>`).join('')}
      <line x1="${PL}" x2="${W-PR}" y1="${H-PB}" y2="${H-PB}" stroke="var(--border2)" stroke-width=".8"/>
      ${_msTicks(t0,t1).map(t=>`<line x1="${x(t.t).toFixed(1)}" x2="${x(t.t).toFixed(1)}" y1="${H-PB}" y2="${H-PB+3}" stroke="var(--border2)" stroke-width=".8"/>
         <text x="${x(t.t).toFixed(1)}" y="${H-PB+13}" font-size="8" fill="var(--ink3)" text-anchor="middle">${t.lab}</text>`).join('')}
      ${inWin.length>=4?`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" opacity=".85"/>`:''}
      ${inWin.map(p=>`<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.8" fill="${color}"><title>${esc(p.label)} · ${p.v}${isSpot?'% passed':''}</title></circle>`).join('')}
      ${inWin2.length>=METRICS_MODEL.trend.minPointsForLine?`<path d="${inWin2.map((p,i)=>`${i?'L':'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--lvl2-orange)" stroke-width="1.6" stroke-dasharray="5 4" opacity=".9"/>`:''}
      ${inWin2.map(p=>`<rect x="${(x(p.date)-2.8).toFixed(1)}" y="${(y(p.v)-2.8).toFixed(1)}" width="5.6" height="5.6" fill="var(--lvl2-orange)"><title>${esc(p.label)} · ${p.v}% passed</title></rect>`).join('')}`;
  }
  return `<div class="ms-sec">
    <div class="ms-sec-head"><span>${isSpot?'Pass rate over time':'Condition over time'}</span>${_rpHelpBtn('trend')}
      <span class="ms-sec-note">${isSpot?'(pass + ½ partial) ÷ assessed':'memorization strength'}</span></div>
    <svg class="ms-chart" viewBox="0 0 ${W} ${H}">${body}</svg>
    ${split?`<div class="ms-spot-key"><span><i class="rnd"></i>Random spots</span><span><i class="wk"></i>Weak places</span></div>`:''}
    <div class="ms-winrow">
      ${window.TehfizReportRange ? '' : MS_WINDOWS.map(([k,l])=>`<button class="ms-win${_msTrendWindow===k?' on':''}" onclick="msSetWindow('${k}')">${l}</button>`).join('')}
      ${hidden?`<span class="ms-hidden">${hidden} earlier hidden</span>`:''}
    </div>
    ${inWin.length&&inWin.length<METRICS_MODEL.trend.minPointsForLine?`<div class="ms-note">Fewer than four points — shown as points only, too little to call a direction.</div>`:''}
  </div>`;
}

// ── Persistence: what's stuck, what's actually been fixed ─────────
function _msPersistence(S){
  const p=persistence(S);
  if(!p.recurring.length && !p.resolved.length) return '';
  // "missed in 3 sessions" reads as "the last 3", which it isn't — they're 3
  // separate occasions anywhere in the history. Say the count and the recency
  // as two distinct facts, because they mean different things: 3 times ending
  // last week is urgent, 3 times ending in February is probably settled.
  const ago=d=>{
    if(!d) return '';
    const n=daysBetween(d,new Date());
    return n<=0?'today':n===1?'yesterday':n<30?`${n}d ago`:n<365?`${Math.round(n/30)}mo ago`:'over a year';
  };
  const row=(r,kind)=>`<div class="ms-row" onclick="TehfizReport.goto(${r.surah},${r.ayah})">
      <span class="ms-row-ref">${esc(SURAH_NAMES[r.surah-1]||'')} <strong>${r.surah}:${r.ayah}</strong></span>
      <span class="ms-row-meta">${kind==='rec'
        // v1_201 (F9): say whether it has been heard since. A place last wrong
        // five months ago and never heard again is not the same as last week.
        ? (r.retested ? `${r.times}&times; · clean ${r.retested}&times; since` : `${r.times}&times; · wrong ${ago(r.lastDate)}, not heard since`)
        : `clean ${r.retested}&times; since`}</span>
    </div>`;
  return `<div class="ms-sec">
    <div class="ms-sec-head"><span>What's stuck, what's fixed</span>${_rpHelpBtn('persistence')}</div>
    <div class="ms-two">
      <div>
        <div class="ms-col-head bad" title="Ayahs missed on more than one separate occasion, and not yet heard clean twice since">Still going wrong · ${p.recurring.length}</div>
        ${p.recurring.slice(0,6).map(r=>row(r,'rec')).join('') || '<div class="ms-empty">Nothing recurring</div>'}
      </div>
      <div>
        <div class="ms-col-head good">Resolved · ${p.resolved.length}</div>
        ${p.resolved.slice(0,6).map(r=>row(r,'res')).join('') || '<div class="ms-empty">None yet</div>'}
      </div>
    </div>
  </div>`;
}

// ── Focus: recency-weighted, so old fixed problems drop away ──────
function _msFocus(S){
  const top=crossFocus(S,6);
  if(top.length<2) return '';
  return `<div class="ms-sec">
    <div class="ms-sec-head"><span>Work on these next</span>${_rpHelpBtn('focus')}
      <span class="ms-sec-note">weighted by severity, repetition and how recent</span></div>
    <div class="rv-focus-rows">${top.map((f,i)=>{
      const b=sev(f.worst);
      return `<div class="rv-focus-row" onclick="TehfizReport.goto(${f.surah},${f.ayah})">
        <span class="rv-focus-rank">${i+1}</span>
        <span class="rv-focus-ref">${esc(SURAH_NAMES[f.surah-1]||'')} <strong>${f.surah}:${f.ayah}</strong></span>
        <span class="rv-focus-words">${esc(f.words.slice(0,3).join(' · '))}</span>
        <span class="rv-focus-n ${b.cls}" title="Missed in ${f.sessions} separate session${f.sessions>1?'s':''} (${f.hits} mistakes in total)">${f.sessions}&times;</span>
      </div>`;
    }).join('')}</div>
  </div>`;
}

// ── Sessions: each one opens the single-session review ────────────
function _msSessions(S){
  return `<details class="rv-details"><summary class="rv-summary">
      <span>Sessions</span><span class="rv-summary-n">${S.length}</span><span class="rv-chev">▾</span>
    </summary><div class="rv-details-body">
    ${[...S].reverse().map(s=>{
      const sc=gradedValue(s, strengthFromInputs(sessionInputsWithPages(s.strength?.inputs||null, s.segments)));
      const b=gradedBand(s, sc);
      return `<div class="ms-row" onclick="TehfizReport.openLesson(${JSON.stringify(s.id).replace(/"/g,'&quot;')})">
        <span class="ms-row-ref"><strong>${sessionDateText(s)}</strong> ${esc(sessionNameOf(s))}</span>
        <span class="ms-row-meta">${(s.mistakes||[]).length} mistakes</span>
        <span class="ms-row-score" style="color:${b.color};">${sc==null?'—':bandOnly(s)?b.label:sc+'%'}</span>
      </div>`;
    }).join('')}
    </div></details>`;
}

// ═══════════════════════════════════════════════════════════════════
// rp3: SHARED HELPERS AND HELP
// ═══════════════════════════════════════════════════════════════════
/* v1_201 (F11): a surah name is never broken at its hyphen ("Al-" / "Jāthiyah").
   Escapes, then keeps each hyphenated word on one line. */
function nbNames(str){ return esc(str).replace(/([^\s\u2013\u2014]+-[^\s\u2013\u2014]+)/g, '<span class="nb">$1</span>'); }

/* v1_188: many sessions' payloads, quickly. Used by the student's pull
   (TehfizClaim) and the teacher's review (TehfizReview), which used to fetch
   them one after another — forty sessions was forty round trips in a row,
   about ten seconds on a slow connection.

   Now fifty at a time in one request (POST …/payloads {ids}), a few requests
   side by side. The server sends them still gzipped (base64) so the Worker
   does almost no work; the browser unzips them. A browser without
   DecompressionStream, or a server from before this, falls back to one
   request per session, six at a time.

     tehfizFetchPayloads(api, ids, manyPath, onePath) → Promise<Map id → session>
       api       the module's own api(path, opts)
       manyPath  '/api/student/sessions/payloads' or '/api/sessions/payloads'
       onePath   id → that session's single-payload path
   A session that cannot be read is left out, as before. */
/* rp7 (A6): every page of a lesson list. path is the list's own path with
   its query ('/api/sessions?studentId=…' or '/api/student/sessions'); pages
   of 500 are asked for until the server says there are no more (or a short
   page comes back, from a server before `more`). Rows are kept once by id.
   Throws if any page fails, so a caller never takes part of a list for the
   whole of it. A ceiling of 40 pages (20,000 lessons) stops a runaway loop. */
async function tehfizListAll(api, path, page) {
  page = page || 500;
  const sep = path.includes('?') ? '&' : '?';
  const seen = new Set(), rows = [];
  for (let i = 0, offset = 0; i < 40; i++, offset += page) {
    const d = await api(path + sep + 'limit=' + page + '&offset=' + offset);
    const got = (d && d.sessions) || [];
    const before = rows.length;
    got.forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } });
    if (d && d.more === false) break;
    if (rows.length === before) break;          // a server that ignores offset
    if (got.length < page) break;
  }
  return rows;
}

async function tehfizFetchPayloads(api, ids, manyPath, onePath) {
  const out = new Map();
  if (!ids.length) return out;
  const pool = async (items, n, fn) => {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const x = items[i++]; await fn(x); }
    }));
  };
  const one = async (id) => {
    try { const p = await api(onePath(id)); if (p && p.session) out.set(id, p.session); } catch (e) {}
  };
  const unzip = async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(txt);
  };
  let many = typeof DecompressionStream === 'function';
  if (many) {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    const left = [];
    await pool(chunks, 3, async (c) => {
      if (!many) { left.push(...c); return; }
      try {
        const r = await api(manyPath, { method: 'POST', body: { ids: c } });
        const gz = (r && r.gz) || {};
        await Promise.all(c.map(async (id) => {
          if (!gz[id]) return;
          try { out.set(id, await unzip(gz[id])); } catch (e) { left.push(id); }
        }));
      } catch (e) {
        if (e && e.status === 404) many = false;      // a server from before this
        left.push(...c);
      }
    });
    if (left.length) await pool(left, 6, one);
    return out;
  }
  await pool(ids, 6, one);
  return out;
}

/* The ? beside each section, as in the viewer's guide (copied 16 Nov). The viewer
   still opens its own guide; an app without one shows these in a pop-up. */
TehfizReport.HELP = {
 "rotation": "<h4>Revision rotation — what the colours mean</h4> <p>The number and the date on each card are what was <em>measured</em>. The colour is what the portion is estimated to be worth <em>now</em>: the last score decayed by how long it has gone unverified, at roughly 4% a week.</p> <p>That is why a 99 unheard for five months sits in the red, while a 74 heard this week only asks for a look — one is unverified, the other is merely mid. Green means settled, yellow due a look, orange overdue, red urgent. A dashed grey card was never verified at all, so there is nothing to estimate from.</p> <p>Decay counts from the last full recitation, not the last visit, so a spot test does not reset the clock. A score shown with a dotted underline marks exactly that case: the portion was seen more recently than it was scored.</p>",
 "sabaq": "<h4>Pace &amp; retention</h4> <p>The day-one score measures reading as much as recall. What matters is how the same passage scores when it comes back for revision — the <strong>change on return</strong>.</p>",
 "sabqi": "<h4>Consolidation</h4> <p>One return tells you a passage survived. The <strong>sequence</strong> tells you whether it is bedding in. A passage climbing 61 → 73 → 81 is consolidating; one sitting at 77 → 79 → 76 across six weeks is not, and no single number would show the difference.</p> <p>Passages are grouped by overlapping range, so a portion revised across slightly different bounds still reads as one thread.</p>",
 "graduate": "<h4>Time to graduate</h4> <p>Median rather than mean, because one passage that never graduated would drag an average out of shape. A portion running far past the median is the one to look at — it is being revised without settling.</p>",
 "cycle": "<h4>Rotation cycle</h4> <p>Two portions heard the same number of times can be in completely different condition. What matters is the gap between hearings, not the count.</p>",
 "spot": "<h4>Spot tests</h4> <p><strong>Spot and full recitation aren't the same scale.</strong> Being dropped into a random ayah is harder than continuing a flow, so spot scores run lower almost everywhere. Read the gap as a pattern across portions, not as a portion \"failing\".</p> <p><strong>Random and weak places.</strong> A teacher can aim some spots at places that went wrong before (weak places) and leave the rest random. They are counted apart: random spots say how well the portion holds up anywhere; weak places are hard on purpose, so they score lower. What matters there is that the number rises over time.</p>",
 "trend": "<h4>Condition over time</h4> <p>Each point is one passage on one day, scored from the mistakes recorded in it. Stages are never pooled — a first-pass score and a long-settled revision score mean different things, so each has its own line.</p> <p>Fewer than four points is shown as points with no trend line: too little to call a direction.</p>",
 "persistence": "<h4>What's stuck, what's fixed</h4> <p><strong>Resolved</strong> means the ayah was heard again at least twice afterwards without a mistake — not merely that it hasn't come up since.</p>",
 "focus": "<h4>Work on these next</h4> <p>Ranked by severity, how often the same spot recurs, and how recent it is — so a mistake made three times last week outranks a worse one made once, months ago.</p>"
};
TehfizReport.helpPopover = (topic) => {
  const html = TehfizReport.HELP[topic]; if (!html) return;
  let el = document.getElementById('rpHelpPop');
  if (!el) {
    el = document.createElement('div'); el.id = 'rpHelpPop'; el.className = 'rp-help-bg';
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-rpclose]')) el.remove(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape' && document.getElementById('rpHelpPop')) { e.stopPropagation(); document.getElementById('rpHelpPop').remove(); } }, true);
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="rp-help" role="dialog" aria-modal="true">' + html + '<button type="button" class="rp-help-x" data-rpclose>Close</button></div>';
  el.querySelector('.rp-help-x').focus();
};
