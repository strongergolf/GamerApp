// AimPoint break model. Includes pace factor (12in past hole = standard) and slope multipliers
// from very-uphill (0.45) to very-downhill (1.85).

/* ============================================================
   PUTTING — AIMPOINT EXPRESS SIMULATOR
   break_in = distFt × grade × 0.145 × (stimp/9.5)^1.2 × slopeFactor
   ============================================================ */
function aimBreakIn(distFt, grade, stimp, slope, paceIn){
  /* paceIn = intended roll-out past hole in inches (12 = standard AimPoint pace)
     Faster pace = narrower effective break (ball less influenced by slope)
     Slower pace = more break (ball reads slope longer) */
  const paceFactor = Math.pow(12 / Math.max(4, paceIn||12), 0.4);
  const sf=Math.pow(stimp/9.5, 1.2);
  const sl = slope==='very-uphill'?0.45
           : slope==='uphill'    ?0.68
           : slope==='downhill'  ?1.42
           : slope==='very-downhill'?1.85
           : 1.0;
  return distFt * grade * 0.145 * sf * sl * paceFactor;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { aimBreakIn });
