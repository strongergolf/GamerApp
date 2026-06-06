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
    if(raw){ window.STATE = mergeDefaults(JSON.parse(raw)); return; }
  }catch(e){ /* storage unavailable — fall back to in-memory */ }
  window.STATE = deepClone(DEFAULT_DATA);
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
  return Object.assign(base, sv, {
    clubs,
    performance,
    dplane,
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
Object.assign(window, { STORE_KEY, deepClone, loadState, mergeDefaults, saveState });
