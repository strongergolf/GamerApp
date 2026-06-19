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
function typeLabel(t){ return t==='wood'?'Woods & Hybrids':t==='iron'?'Irons':t==='wedge'?'Wedges':'Putter'; }
function typeHex(t){ return t==='wood'?'#d96070':t==='iron'?'#1a5aaa':t==='wedge'?'#00853F':t==='putter'?'#6b7280':'#6b7280'; }
function perf(id){ return STATE.performance[id] || {}; }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { MAX_CARRY, getDispersion, disp86, perf, typeHex, typeLabel });
