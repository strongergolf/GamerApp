// Chip rollout model. Launch = 75% of loft. Roll ratio by archetype.
// rollout = carry x ratio x (stimp/9.5)^1.3 x slopeAdj.

/* ============================================================
   SHORT GAME — CHIP DIALLER
   Mark's rule: 58° wedge · 5yd carry → 7yd rollout (stimp ~9.5, level)
   +1° loft = −1yd rollout per 5yd carry
   rollFactor = 65 − loft  (yd of rollout per 5yd carry at base conditions)
   rollout = rollFactor × (carry/5) × stimpAdj × slopeAdj
   ============================================================ */
/* Roll ratio R = roll/carry, anchored exactly at each club's launch angle (loft × 0.75).
   7i  26.25° → 1:5  (R=5.0)   8i  29.25° → 1:4  (R=4.0)
   9i  32.25° → 1:3  (R=3.0)   P   35.25° → 1:2  (R=2.0)
   G   38.25° → 1:1  (R=1.0)   S   42.0°  → 2:1  (R=0.5)
   X   48.75° → 5:1  (R=0.2) — X kept as-is. */
const CHIP_ROLL_ANCHORS=[
  [20,    6.0],   /* floor below 7i */
  [26.25, 5.0],   /* 7-iron  1:5 */
  [29.25, 4.0],   /* 8-iron  1:4 */
  [32.25, 3.0],   /* 9-iron  1:3 */
  [35.25, 2.0],   /* P-wedge 1:2 */
  [38.25, 1.0],   /* G-wedge 1:1 */
  [42.0,  0.5],   /* S-wedge 2:1 */
  [48.75, 0.2],   /* X-wedge 5:1 */
  [65.0,  0.2]    /* cap */
];
function chipRollRatio(loftDeg){
  const launch=loftDeg*0.75;
  if(launch<=CHIP_ROLL_ANCHORS[0][0]) return CHIP_ROLL_ANCHORS[0][1];
  if(launch>=CHIP_ROLL_ANCHORS[CHIP_ROLL_ANCHORS.length-1][0]) return CHIP_ROLL_ANCHORS[CHIP_ROLL_ANCHORS.length-1][1];
  for(let i=0;i<CHIP_ROLL_ANCHORS.length-1;i++){
    if(launch>=CHIP_ROLL_ANCHORS[i][0]&&launch<=CHIP_ROLL_ANCHORS[i+1][0]){
      const t=(launch-CHIP_ROLL_ANCHORS[i][0])/(CHIP_ROLL_ANCHORS[i+1][0]-CHIP_ROLL_ANCHORS[i][0]);
      return CHIP_ROLL_ANCHORS[i][1]+t*(CHIP_ROLL_ANCHORS[i+1][1]-CHIP_ROLL_ANCHORS[i][1]);
    }
  }
  return 1;
}
function chipArchetype(loftDeg){
  const launch=loftDeg*0.75;
  if(launch<30) return 'Low Runner';
  if(launch<40) return 'Standard Chip';
  if(launch<50) return 'Toss / Soft Pitch';
  return 'Flop / Lob';
}
function chipRollout(carry, loftDeg, stimp, slope){
  const R=chipRollRatio(loftDeg);
  const sa=Math.pow(stimp/9.5, 1.3);
  const sl=slope==='very-uphill'?0.38 : slope==='uphill'?0.62 : slope==='downhill'?1.50 : slope==='very-downhill'?2.20 : 1.0;
  return carry * R * sa * sl;
}
function chipCarryForTotal(total, loftDeg, stimp, slope){
  const R=chipRollRatio(loftDeg);
  const sa=Math.pow(stimp/9.5, 1.3);
  const sl=slope==='very-uphill'?0.38 : slope==='uphill'?0.62 : slope==='downhill'?1.50 : slope==='very-downhill'?2.20 : 1.0;
  return total / (1 + R * sa * sl);
}
function chipClubs(){
  return STATE.clubs
    .filter(c=>{ const l=parseFloat(c.loft); return l>=34&&l<=70; })
    .sort((a,b)=>parseFloat(a.loft)-parseFloat(b.loft));
}
function chipSlopeVal(){ return document.getElementById('chip-slope')?.value||'level'; }
window.chipSelectedIdx = -1; /* −1 = auto-select best match */
function selectChipClub(i){ window.chipSelectedIdx=i; renderChipDial(); }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { CHIP_ROLL_ANCHORS, chipArchetype, chipCarryForTotal, chipClubs, chipRollRatio, chipRollout, chipSlopeVal, selectChipClub });
