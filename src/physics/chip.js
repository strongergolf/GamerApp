// Chip rollout model. Roll ratio is keyed directly by club LOFT (the calibrated
// club→roll ladder below); displayed launch is a separate research-based readout
// (chipLaunch, ~0.68×loft). rollout = carry x ratio x (stimp/9.5)^1.3 x slopeAdj.

/* ============================================================
   SHORT GAME — CHIP DIALLER
   Mark's rule: 58° wedge · 5yd carry → 7yd rollout (stimp ~9.5, level)
   +1° loft = −1yd rollout per 5yd carry
   rollFactor = 65 − loft  (yd of rollout per 5yd carry at base conditions)
   rollout = rollFactor × (carry/5) × stimpAdj × slopeAdj
   ============================================================ */
/* Roll ratio R = roll/carry, keyed directly by club LOFT (the standard bump-and-run
   ladder — lower-lofted clubs release more). Same calibrated outputs as before; the
   loft keys are just the old launch keys un-scaled (÷0.75), so the launch factor no
   longer lives inside the roll model.
   7i 35° → 1:5 (R=5.0)   8i 39° → 1:4 (R=4.0)   9i 43° → 1:3 (R=3.0)
   P 47° → 1:2 (R=2.0)    G 51° → 1:1 (R=1.0)    S 56° → 2:1 (R=0.5)
   X 65° → 5:1 (R=0.2). */
const CHIP_ROLL_ANCHORS=[
  [26.7, 6.0],   /* floor below 7i */
  [35.0, 5.0],   /* 7-iron  1:5 */
  [39.0, 4.0],   /* 8-iron  1:4 */
  [43.0, 3.0],   /* 9-iron  1:3 */
  [47.0, 2.0],   /* P-wedge 1:2 */
  [51.0, 1.0],   /* G-wedge 1:1 */
  [56.0, 0.5],   /* S-wedge 2:1 */
  [65.0, 0.2],   /* X-wedge 5:1 */
  [86.7, 0.2]    /* cap */
];
function chipRollRatio(loftDeg){
  const L=parseFloat(loftDeg)||50, A=CHIP_ROLL_ANCHORS;
  if(L<=A[0][0]) return A[0][1];
  if(L>=A[A.length-1][0]) return A[A.length-1][1];
  for(let i=0;i<A.length-1;i++){
    if(L>=A[i][0]&&L<=A[i+1][0]){
      const t=(L-A[i][0])/(A[i+1][0]-A[i][0]);
      return A[i][1]+t*(A[i+1][1]-A[i][1]);
    }
  }
  return 1;
}
function chipArchetype(loftDeg){
  const L=parseFloat(loftDeg)||50;
  if(L<40) return 'Low Runner';
  if(L<53) return 'Standard Chip';
  if(L<67) return 'Toss / Soft Pitch';
  return 'Flop / Lob';
}
/* Displayed launch angle (°). Chips and short pitches launch BELOW static loft — shaft
   lean delofts the face and friction launch pulls the ball down. The FRACTION of loft
   that becomes launch is itself loft-dependent: higher-lofted wedges deloft more and lose
   more to friction launch, so the fraction tapers from ~0.70 at a PW down to ~0.62 at 60°
   (clamped 0.60–0.74 so low-loft runners stay near their dynamic loft and lobs hold a
   floor). Anchored to Andrew Rice / Trackman "Chip Shot Code" / Molinari data — e.g. a
   56° pitches ~36°. Presumed — refine from the player's own LM data. */
function chipLaunch(loftDeg){
  const L=parseFloat(loftDeg)||50;
  const frac=Math.max(0.60, Math.min(0.74, 0.70 - 0.0057*(L-46)));
  return L*frac;
}
/* Short-game / partial-pitch backspin estimate (rpm). Anchored to current LM data for
   urethane balls and clean contact at men's speeds: ~1,500 rpm on a 5 yd chip rising to
   ~6,000–6,500 on a 50 yd pitch (Trackman "Chip Shot Code" / Andrew Rice wedge study).
   Backspin tracks ball speed (≈ carry) far more than loft across this range — higher-lofted
   wedges add only a little. Presumed — refine from the player's own LM session. */
function chipSpin(carryYd, loftDeg){
  const base = 1200 + 105*Math.max(0, carryYd);            // distance (ball speed) is the main driver
  const loftAdj = ((parseFloat(loftDeg)||52) - 52) * 25;   // mild: ~+25 rpm per ° vs a 52° reference
  return Math.round(Math.max(800, base + loftAdj)/50)*50;  // nearest 50 rpm
}
/* Green-slope → rollout multiplier, CALIBRATED AT STIMP 9.5. deg = slope of the run-out,
   + = uphill (less roll), − = downhill (more roll). Piecewise-linear anchors preserve the old
   categorical values: +6→0.38 (very up), +3→0.62 (up), 0→1.0, −3→1.50, −6→2.20. */
const CHIP_SLOPE_ANCHORS=[[-6,2.20],[-3,1.50],[0,1.0],[3,0.62],[6,0.38]];
function chipSlopeMult(deg){
  const e=Math.max(-6,Math.min(6,deg||0)), A=CHIP_SLOPE_ANCHORS;
  if(e<=A[0][0]) return A[0][1];
  if(e>=A[A.length-1][0]) return A[A.length-1][1];
  for(let i=0;i<A.length-1;i++){ if(e>=A[i][0]&&e<=A[i+1][0]){ const t=(e-A[i][0])/(A[i+1][0]-A[i][0]); return A[i][1]+t*(A[i+1][1]-A[i][1]); } }
  return 1.0;
}
function chipSlopeDeg(slope){
  return typeof slope==='number' ? slope
    : slope==='very-uphill'?6 : slope==='uphill'?3 : slope==='downhill'?-3 : slope==='very-downhill'?-6 : 0;
}
/* Slope × green-speed coupling. A slope bites harder on faster greens: friction ∝ 1/stimp, so the
   gravity term g·sinθ is a larger share of the ball's deceleration as the green quickens. We scale
   the slope's DEVIATION-from-flat linearly with stimp — which exactly reproduces the calibrated
   9.5 anchors above, amplifies the effect on fast greens and damps it on slow ones. Clamped so a
   fast downhill can't produce an unphysical runaway. */
function chipSlopeFactor(slope, stimp){
  const base=chipSlopeMult(chipSlopeDeg(slope));
  if(stimp==null) return base;                 /* no green speed given → use the 9.5-calibrated shape */
  const f = 1 + (base - 1) * (stimp/9.5);
  return Math.max(0.12, Math.min(3.2, f));
}
/* ---- Firmness model (check / first bounce / rollout) — research-anchored ----
   Firmness is the green's vertical response, distinct from stimp (its rolling speed): a green can
   be soft & fast or firm & slow. On a SOFT/receptive green the ball lands into the turf — low
   restitution, spin grabs, it checks and sits (short rollout). On a FIRM green it lands hot —
   high restitution, the ball skids before spin can bite, it hops forward and releases (long
   rollout). `roll` is the net rollout multiplier (unchanged calibration); restitution / bounceH /
   bounces / check drive the trajectory drawing + readout. Ball-on-turf COR ≈ 0.15 (plush) to
   ≈ 0.7 (baked) — Presumed, refine from the player's own bounce/roll observations. */
const CHIP_FIRM_MODEL = {
  vsoft:{ roll:0.70, restitution:0.16, bounceH:0.40, bounces:1, check:'grabs & checks' },
  soft: { roll:0.85, restitution:0.27, bounceH:0.70, bounces:2, check:'soft hop, sits' },
  avg:  { roll:1.00, restitution:0.40, bounceH:1.00, bounces:3, check:'lands & releases' },   /* = current drawing */
  firm: { roll:1.30, restitution:0.55, bounceH:1.30, bounces:3, check:'hops on, runs' },
  vfirm:{ roll:1.60, restitution:0.70, bounceH:1.60, bounces:3, check:'skids & runs out' }
};
function chipFirmModel(key){ return CHIP_FIRM_MODEL[key] || CHIP_FIRM_MODEL.avg; }
/* ---- Stance model: the LIE ANGLE you're standing on (NOT the target's elevation, which is its
   own term). Standing on an upslope adds effective loft → higher, softer, less release; a
   downslope delofts → lower, hotter, more release. Effects: launch (°), a rollout multiplier
   (the carry/roll split) and a small plays-like distance. Presumed — refine from LM data. */
const CHIP_STANCE_MODEL = {
  welldownhill:{ launch:-7, roll:1.32, plays:-3 },
  downhill:    { launch:-4, roll:1.15, plays:-1.5 },
  level:       { launch:0,  roll:1.00, plays:0 },
  uphill:      { launch:+4, roll:0.89, plays:+1.5 },
  welluphill:  { launch:+7, roll:0.78, plays:+3 }
};
function chipStance(key){ return CHIP_STANCE_MODEL[key] || CHIP_STANCE_MODEL.level; }
/* Per-shot roll-out multipliers from Short Game Situational Info: firmness (softer → less roll,
   firmer → more), the situation+lie roll-out (rough/bunker run more), and the stance lie. Default
   1.0. The reference matrix / print card pass baseline=true to ignore these per-shot conditions. */
function chipFirm(){ return (typeof window!=='undefined'&&window.chipFirmFactor)?window.chipFirmFactor:1; }
function chipLie(){ return (typeof window!=='undefined'&&window.chipLieRollMult)?window.chipLieRollMult:1; }
function chipStanceRoll(){ return (typeof window!=='undefined'&&window.chipStanceRollMult)?window.chipStanceRollMult:1; }
function chipRollout(carry, loftDeg, stimp, slope, baseline){
  const R=chipRollRatio(loftDeg);
  const sa=Math.pow(stimp/9.5, 1.3);
  const m = baseline ? 1 : chipFirm()*chipLie()*chipStanceRoll();
  return carry * R * sa * chipSlopeFactor(slope, stimp) * m;
}
function chipCarryForTotal(total, loftDeg, stimp, slope, baseline){
  const R=chipRollRatio(loftDeg);
  const sa=Math.pow(stimp/9.5, 1.3);
  const m = baseline ? 1 : chipFirm()*chipLie()*chipStanceRoll();
  return total / (1 + R * sa * chipSlopeFactor(slope, stimp) * m);
}
function chipClubs(){
  return STATE.clubs
    .filter(c=>{ const l=parseFloat(c.loft); return l>=34&&l<=70; })
    .sort((a,b)=>parseFloat(a.loft)-parseFloat(b.loft));
}
/* Green slope now lives in Short Game → Situational Info as the "Level" term (±6°). */
function chipSlopeVal(){
  if(typeof EY!=='undefined' && EY.shortgame && EY.shortgame.level!=null) return parseFloat(EY.shortgame.level)||0;
  const v=document.getElementById('chip-slope')?.value; return (v==null||v==='')?0:parseFloat(v);
}
window.chipSelectedIdx = -1; /* −1 = auto-select best match */
function selectChipClub(i){ window.chipSelectedIdx=i; renderChipDial(); }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { CHIP_ROLL_ANCHORS, CHIP_SLOPE_ANCHORS, CHIP_FIRM_MODEL, CHIP_STANCE_MODEL, chipArchetype, chipCarryForTotal, chipClubs, chipFirm, chipFirmModel, chipLaunch, chipLie, chipRollRatio, chipRollout, chipSlopeDeg, chipSlopeFactor, chipSlopeMult, chipSlopeVal, chipSpin, chipStance, chipStanceRoll, selectChipClub });
