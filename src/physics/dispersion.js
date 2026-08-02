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
  /* Below 75 yd, taper linearly to the origin instead of holding flat. A flat 4.9 meant a
     30-yard pitch was modelled as wide as a 75-yard shot, which is not how a face works:
     lateral miss is an ANGLE, so it shrinks with the shot. This line is the same 2.3° of
     face/path error the 75-yd value implies, carried down, with a small floor so a chip
     still has some spread. It joins the old curve exactly at 75. */
  if(carry<=75)  return Math.max(1.2, carry*(4.9/75));
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
  /* Same correction on the depth axis. Holding 6.2 flat below 50 implied a 30-yard pitch
     with a 1σ of 3.8 yd — finishing anywhere from 22 to 38 — because a fixed yardage turns
     into a runaway PERCENTAGE as the shot shortens. Tapering to the origin keeps it at a
     constant ~7.5% of the shot, which is what controlling swing length actually looks like.
     Joins the old curve exactly at 50. */
  if(carry<=50)  return Math.max(1.5, carry*(6.2/50));
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

/* ---------- WHY THE PATTERN LEANS: strike correlation ----------
   A landing pattern is not axis-aligned, because hitting one long and hitting it left are
   not independent events — one miss causes both. A toe strike gears the ball into a draw and
   takes spin off it, so it flies further AND finishes left; a heel strike does the mirror,
   shorter and right. That is a single mechanism, and its strength scales with how much gear
   effect the head can produce: a great deal for a driver, almost none for a wedge.

   So the model is the CORRELATION between the depth error and the lateral error — which is
   what this actually is, a bivariate normal — rather than an angle. The lean then follows
   from the correlation and the two sigmas, so it varies club by club on its own, out of
   sigmas that are already calibrated, instead of being asserted club by club:
        tan θ = ρ · σdep / σlat

   That is the first-order lean, NOT the principal axis of the correlation ellipse. The
   textbook principal-axis angle, ½·atan2(2ρσlσd, σl²−σd²), is ill-conditioned exactly where
   this bag lives: as the pattern approaches circular the angle is barely determined, and it
   was measured swinging from +24° to −3.3° across a few yards of carry either side of the
   lateral/depth crossover — which is the middle of the wedges. The form above is monotone in
   ρ, bounded by atan(ρ), and agrees with the principal axis where the pattern is elongated
   enough for that to mean anything.

   This replaces a flat DISP_SLANT = 15°, applied identically to every club in the bag. That
   constant was never measured, and at driver distance it came to three times the size of the
   real ball-flight landing angle sitting underneath it — so it silently decided the answer
   to every question the app could ask about shot shape.

   PRESUMED, and editable in Locker Room → My App. ρ is the one number here a golfer can
   actually measure: track shots, regress lateral miss on distance miss, and the slope is it.
   ρ = 0 gives an upright pattern with no lean at all, which is the right answer for anyone
   who has no evidence of one. */
const STRIKE_CORR = { wood:0.35, hybrid:0.28, iron:0.18, wedge:0.08, putter:0 };
const DISP_TILT_MAX = 24;          // deg — a near-circular pattern would otherwise swing wildly
function strikeCorr(type){
  const s=(window.STATE&&STATE.dispersion&&STATE.dispersion.strikeCorr)||{};
  const v=s[type];
  if(typeof v==='number'&&isFinite(v)) return Math.max(-0.9, Math.min(0.9, v));
  return STRIKE_CORR[type]!=null ? STRIKE_CORR[type] : 0.2;
}
/* Lean of the landing pattern in degrees, POSITIVE = long-and-left (the right-handed
   pattern; mirrored for a left-hander, because the gear effect causing it mirrors too). */
function dispTilt(type, sigmaLat, sigmaDep){
  const rho=strikeCorr(type);
  if(!rho || !(sigmaLat>0) || !(sigmaDep>0)) return 0;
  let deg=Math.atan2(rho*sigmaDep, sigmaLat)*180/Math.PI;
  deg=Math.max(-DISP_TILT_MAX, Math.min(DISP_TILT_MAX, deg));
  const lh=((window.STATE&&STATE.profile&&STATE.profile.handedness)||'RH')==='LH';
  return lh?-deg:deg;
}
/* The lean for a club, straight from its carry — the form both the ladder ovals and the aim
   optimiser want. `type` falls back to iron for anything unrecognised. */
function dispTiltFor(type, carry){
  return dispTilt(type||'iron', getDispersion(carry), getDepthDispersion(carry));
}
function typeLabel(t){ return t==='wood'?'Woods & Hybrids':t==='iron'?'Irons':t==='wedge'?'Wedges':'Putter'; }
function typeHex(t){ return t==='wood'?'#d96070':t==='iron'?'#1a5aaa':t==='wedge'?'#00853F':t==='putter'?'#6b7280':'#6b7280'; }
function perf(id){ return STATE.performance[id] || {}; }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { MAX_CARRY, getDispersion, disp86, getDepthDispersion, depth86, perf, typeHex, typeLabel,
  STRIKE_CORR, DISP_TILT_MAX, strikeCorr, dispTilt, dispTiltFor });
