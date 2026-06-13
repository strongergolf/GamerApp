// AimPoint break model. Includes pace factor (12in past hole = standard) and slope multipliers
// from very-uphill (0.45) to very-downhill (1.85).

/* ============================================================
   PUTTING — AIMPOINT EXPRESS SIMULATOR
   break_in = distFt × grade × 0.145 × (stimp/9.5)^1.2 × slopeFactor
   ============================================================ */
/* Continuous green-slope (uphill/downhill) → break multiplier.
   elevIn = elevation change over the putt in inches; + = uphill, − = downhill.
   Range ±60" (±5 ft). Piecewise-linear anchors preserve the old categorical values
   (uphill less break, downhill more). */
const SLOPE_ELEV_ANCHORS=[
  [-60, 1.85],   /* 5 ft downhill  (was very-downhill) */
  [-30, 1.42],   /* ~2.5 ft down   (was downhill) */
  [  0, 1.00],   /* level */
  [ 30, 0.68],   /* ~2.5 ft up     (was uphill) */
  [ 60, 0.45]    /* 5 ft uphill    (was very-uphill) */
];
function slopeFactorFromElev(elevIn){
  const e=Math.max(-60,Math.min(60,elevIn||0));
  const A=SLOPE_ELEV_ANCHORS;
  if(e<=A[0][0]) return A[0][1];
  if(e>=A[A.length-1][0]) return A[A.length-1][1];
  for(let i=0;i<A.length-1;i++){
    if(e>=A[i][0]&&e<=A[i+1][0]){
      const t=(e-A[i][0])/(A[i+1][0]-A[i][0]);
      return A[i][1]+t*(A[i+1][1]-A[i][1]);
    }
  }
  return 1.0;
}
function aimBreakIn(distFt, grade, stimp, slope, paceIn){
  /* paceIn = intended roll-out past hole in inches (12 = standard AimPoint pace)
     Faster pace = narrower effective break (ball less influenced by slope)
     Slower pace = more break (ball reads slope longer) */
  const paceFactor = Math.pow(12 / Math.max(4, paceIn||12), 0.4);
  const sf=Math.pow(stimp/9.5, 1.2);
  /* slope may be a numeric elevation (inches, continuous) or a legacy category string */
  const sl = typeof slope==='number'
           ? slopeFactorFromElev(slope)
           : slope==='very-uphill'?0.45
           : slope==='uphill'    ?0.68
           : slope==='downhill'  ?1.42
           : slope==='very-downhill'?1.85
           : 1.0;
  return distFt * grade * 0.145 * sf * sl * paceFactor;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { aimBreakIn, slopeFactorFromElev, SLOPE_ELEV_ANCHORS });
