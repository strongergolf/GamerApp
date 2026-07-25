// Lateral dispersion model (90% CI) and club-type colour/label helpers.

/* ============================================================
   HELPERS
   ============================================================ */
const MAX_CARRY = 270;
/* Lateral dispersion as a 90% CI half-width (≈1.645σ). Calibrated to a typical +3
   handicap (elite amateur — tighter than scratch, a touch wider than Tour):
   1σ L/R ≈ 4yd@100, 5@125, 6.5@150, 8@175, 9.5@200, 11.5@230, 14@260.
   sigma1 (1σ) = this × 0.608. Refine from the player's own multi-session data. */
function getDispersion(carry){
  if(carry<=75)  return 4.9;
  if(carry<=100) return 4.9 + (carry-75)/25  * 1.7;   // → 6.6
  if(carry<=125) return 6.6 + (carry-100)/25 * 1.6;   // → 8.2
  if(carry<=150) return 8.2 + (carry-125)/25 * 2.5;   // → 10.7
  if(carry<=175) return 10.7 + (carry-150)/25 * 2.5;  // → 13.2
  if(carry<=200) return 13.2 + (carry-175)/25 * 2.4;  // → 15.6
  if(carry<=230) return 15.6 + (carry-200)/30 * 3.3;  // → 18.9
  if(carry<=270) return 18.9 + (carry-230)/40 * 4.6;  // → 23.5
  return 23.5;
}
/* Single "86% L/R" lateral half-width — the band that catches ~86% of shots (≈1.48σ).
   getDispersion is the 90% CI (1.645σ), so 86% ≈ ×0.90. Replaces the old 1σ/2σ pair app-wide. */
function disp86(carry){ return Math.round(getDispersion(carry)*0.90*10)/10; }

/* ---- DEPTH (front-back / distance-control) dispersion — 90% CI half-width, yards ----
   Same basis and same +3-handicap calibration as getDispersion above, so the two can be
   used as the two axes of one error ellipse. Replaces the old flat ±8 yd, which was only
   ever right for a mid-iron: it was far too loose for a wedge and far too tight for a driver.

   Shape: distance error is roughly PROPORTIONAL to shot length for full swings (~3% of
   carry, driven by strike quality), but the percentage climbs sharply under ~100 yd where
   you are controlling swing LENGTH rather than repeating one full motion. So the absolute
   1σ grows slowly (≈3.8 → 8.1 yd) while the percentage falls (≈7.5% → 3.0%):
     50yd 7.5% · 75yd 5.5% · 100yd 4.5% · 150yd 3.3% · 200yd 3.1% · 270yd 3.0%
   Deliberately passes through ≈8 yd at 150 so mid-irons match the previous fixed value.

   Consequence, and the reason this matters: depth beats lateral under ~115 yd (short shots
   miss long/short far more than left/right — Broadie finds amateur short-game patterns run
   ~3x longer than wide), and lateral beats depth above it. The oval flips from tall to wide
   at that crossover, which the overhead view already assumed but could not express.

   PRESUMED (research-informed, not measured from this golfer). Refine from a player's own
   multi-session launch-monitor carry data — that promotes it to Captured. */
function getDepthDispersion(carry){
  carry=+carry||0;
  if(carry<=50)  return 6.2;
  if(carry<=75)  return 6.2 + (carry-50)/25  * 0.6;   // → 6.8
  if(carry<=100) return 6.8 + (carry-75)/25  * 0.6;   // → 7.4
  if(carry<=125) return 7.4 + (carry-100)/25 * 0.4;   // → 7.8
  if(carry<=150) return 7.8 + (carry-125)/25 * 0.3;   // → 8.1
  if(carry<=175) return 8.1 + (carry-150)/25 * 1.0;   // → 9.1
  if(carry<=200) return 9.1 + (carry-175)/25 * 1.1;   // → 10.2
  if(carry<=230) return 10.2 + (carry-200)/30 * 1.3;  // → 11.5
  if(carry<=270) return 11.5 + (carry-230)/40 * 1.8;  // → 13.3
  return 13.3;
}
/* 86% depth half-width — the depth twin of disp86(), for the overhead oval. */
function depth86(carry){ return Math.round(getDepthDispersion(carry)*0.90*10)/10; }
function typeLabel(t){ return t==='wood'?'Woods & Hybrids':t==='iron'?'Irons':t==='wedge'?'Wedges':'Putter'; }
function typeHex(t){ return t==='wood'?'#d96070':t==='iron'?'#1a5aaa':t==='wedge'?'#00853F':t==='putter'?'#6b7280':'#6b7280'; }
function perf(id){ return STATE.performance[id] || {}; }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { MAX_CARRY, getDispersion, disp86, getDepthDispersion, depth86, perf, typeHex, typeLabel });
