// State load / merge / persist. STATE is the single source of truth, persisted to localStorage.
// mergeDefaults augments saved clubs with new DEFAULT_DATA clubs.
//
// MIGRATION NOTE: STATE lives on `window` (not a module-local `let`) so that the
// reassignments in loadState/importData/resetData are visible to every other module
// that reads `STATE`. When converting to explicit ES exports later, replace this with
// a getState()/setState() accessor pair and import it where needed.

/* ============================================================
   STATE + PERSISTENCE
   ============================================================ */
const STORE_KEY = 'strongergolf_gamersbag_v1';
window.adjustOn = false;

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      window.STATE = mergeDefaults(parsed);
      /* If the merge dropped untouched blank courses, commit it. Pruning only in memory
         leaves the junk in storage for ever — it would merely LOOK gone, and would come
         back the moment anything else wrote the old array. */
      const had = Array.isArray(parsed.courses) ? parsed.courses.length : 0;
      if(had && window.STATE.courses.length !== had) saveState();
      return;
    }
  }catch(e){ /* storage unavailable — fall back to in-memory */ }
  window.STATE = deepClone(DEFAULT_DATA);
}
/* Estimate the 8:00 (⅓) rung for a club from its own measured ladder.
   A single global ratio would be wrong: the drop per rung steepens with loft, because the
   shorter the swing the more of the remaining speed comes from the body rather than the arc
   — the 7i gives up ~9% a rung, the 65° X-wedge ~25%. So continue THIS club's own step,
   with the second-order steepening it already shows between full→¾ and ¾→½:
     step  = half/tq              (its last observed rung ratio)
     accel = step / (tq/full)     (how much the drop is steepening)
   Clamped to a sane band so noisy or hand-typed rungs can't produce a silly number.
   Always Presumed — it is an extrapolation, not a measurement (see the provenance rules). */
function estThirdCarry(p){
  if(!p) return null;
  const full=+p.full||0, tq=+p.tq||0, half=+p.half||0;
  if(!half) return null;
  let ratio=0.75;                                   /* fallback if the ladder is incomplete */
  if(tq&&full){
    const step=half/tq, accel=step/(tq/full);
    ratio=step*accel;
  } else if(tq){ ratio=half/tq; }
  ratio=Math.min(0.88, Math.max(0.55, ratio));
  return Math.round(half*ratio);
}
function mergeDefaults(saved){
  const base = deepClone(DEFAULT_DATA);
  const sv = saved||{};
  // deep-merge swing
  const swingBase = base.swing;
  const swingSaved = sv.swing||{};
  const swing = {};
  for(const k of Object.keys(swingBase)){
    if(typeof swingBase[k]==='object'&&swingBase[k]!==null&&!Array.isArray(swingBase[k])){
      swing[k]=Object.assign({},swingBase[k],swingSaved[k]||{});
    } else { swing[k]=swingSaved[k]!==undefined?swingSaved[k]:swingBase[k]; }
  }
  /* Clubs: keep saved clubs, but append any DEFAULT club not present in saved state.
     This ensures new clubs (e.g. putter) appear even for users with existing saved data. */
  const savedClubs = sv.clubs||base.clubs;
  const savedIds = new Set(savedClubs.map(c=>c.id));
  const clubs = [...savedClubs, ...base.clubs.filter(c=>!savedIds.has(c.id))];
  /* Saved performance: merge with defaults so new clubs get empty perf entries */
  const performance = Object.assign({}, base.performance, sv.performance||{});
  /* Per-club D-plane tendencies: merge so new default clubs get seeded entries
     while preserving the user's edits. */
  const dplane = Object.assign({}, base.dplane, sv.dplane||{});
  /* Courses: keep saved courses as-is (user-authored), minus untouched "New Course" blanks —
     see cfPruneBlankCourses. Guarded because store.js loads before courses.js. */
  const savedCourses = Array.isArray(sv.courses) ? sv.courses : base.courses;
  const courses = (typeof cfPruneBlankCourses==='function') ? cfPruneBlankCourses(savedCourses) : savedCourses;
  /* Strategy preferences: merge so new keys get defaults while keeping the user's picks. */
  const strategy = Object.assign({}, base.strategy, sv.strategy||{});
  /* Short Game Variables: merge so new variables get defaults while keeping the user's picks. */
  const sgVars = Object.assign({}, base.sgVars, sv.sgVars||{});
  /* Short-game calibration: keep saved factors + shots, backfill any new fields. */
  const sgCal = Object.assign({}, base.sgCal, sv.sgCal||{});
  /* Partial-swing ladder: merge PER CLUB, not wholesale. `Object.assign(base, sv, …)` would
     let a saved partials object replace the default outright, so a newly-added rung (the 8:00
     ⅓ swing) would never reach anyone with existing data. Saved rungs always win — they may be
     measured — but a rung the save predates is backfilled from that club's own ladder. */
  const partials = {};
  Object.keys(Object.assign({}, base.partials, sv.partials||{})).forEach(id=>{
    const row = Object.assign({}, base.partials[id]||{}, (sv.partials||{})[id]||{});
    if(row.third==null) row.third = estThirdCarry(row);
    if(!Array.isArray(row.conf)) row.conf=[false,false,false,false];
    while(row.conf.length<4) row.conf.push(false);   /* 4th rung starts Presumed */
    partials[id]=row;
  });
  /* New STATE slices — keep saved if present, else default. */
  const missTendency = Object.assign({}, base.missTendency, sv.missTendency||{});
  const skillsTests = Array.isArray(sv.skillsTests) ? sv.skillsTests : base.skillsTests;
  const hcpHistory  = Array.isArray(sv.hcpHistory)  ? sv.hcpHistory  : base.hcpHistory;
  return Object.assign(base, sv, {
    clubs,
    partials,
    performance,
    dplane,
    courses,
    strategy,
    sgVars,
    sgCal,
    missTendency,
    skillsTests,
    hcpHistory,
    profile:  Object.assign(base.profile,  sv.profile||{}),
    baseline: Object.assign(base.baseline, sv.baseline||{}),
    scoring:  { rounds: (sv.scoring&&sv.scoring.rounds)||[] },
    swing
  });
}
function saveState(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(window.STATE)); }catch(e){}
}

// Expose helpers on window for the staged ES-module migration.
// NOTE: STATE itself is set directly on window by loadState (see note above).
Object.assign(window, { STORE_KEY, deepClone, estThirdCarry, loadState, mergeDefaults, saveState });
