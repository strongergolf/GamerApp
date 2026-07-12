// physics/dplane.js — exact impact-geometry / D-plane engine.
// Single source of truth for ball-flight math. Laws confirmed by StrongerGolf research
// ("Golf's Ball Flight", 2011; D-plane worked examples). All angles in DEGREES.
//
//   Law 1  HPath     = HPlane − VPath/tan(VPlane)        (any 3 of 4 → the 4th)
//   Law 2  SpinAxis  = atan(HDiff / VDiff)               + = right/fade, − = left/draw (RH)
//   Law 3  3D SpinLoft = √(VDiff² + HDiff²)              (magnitude of the differential vector)
//   Law 4  HLaunch   = (1−f)·HPath + f·HFace             f ≈ .75 (.80 driver / .65 wedge)
//   Gear   axis shift ≈ ±16° driver / ±6° iron per 3-dimple offset (toe −, heel +)

const DPLANE_DEG = Math.PI / 180;

/* ---- Plane / Path relationship (any 3 of 4) ---- */
function dpHPath(hPlane, vPath, vPlane){
  const t = Math.tan((vPlane || 45) * DPLANE_DEG);
  return hPlane - vPath / (t || 1);
}
function dpHPlane(vPath, vPlane, hPath){
  return vPath / Math.tan((vPlane || 45) * DPLANE_DEG) + hPath;
}
function dpVPath(hPlane, hPath, vPlane){
  return (hPlane - hPath) * Math.tan((vPlane || 45) * DPLANE_DEG);
}
function dpVPlane(vPath, hPlane, hPath){
  const d = hPlane - hPath;
  return d ? Math.atan(vPath / d) / DPLANE_DEG : 90;
}

/* ---- Differentials & spin ---- */
function dpVDiff(vFace, vPath){ return vFace - vPath; }      // dynamic loft − attack angle
function dpHDiff(hFace, hPath){ return hFace - hPath; }      // face − path (horizontal)
function dp3DSpinLoft(vDiff, hDiff){ return Math.sqrt(vDiff*vDiff + hDiff*hDiff); }
function dpSpinAxis(hDiff, vDiff){
  if(!vDiff) return hDiff > 0 ? 90 : hDiff < 0 ? -90 : 0;
  return Math.atan(hDiff / vDiff) / DPLANE_DEG;             // + right (fade), − left (draw)
}

/* ---- Launch (starts ~75% toward the face; keyed to spin loft) ---- */
function dpFaceFraction(spinLoft3d){
  if(spinLoft3d <= 12) return 0.80;                          // low spin loft (driver)
  if(spinLoft3d >= 35) return 0.66;                          // high spin loft (wedge)
  return 0.80 - (spinLoft3d - 12) / (35 - 12) * (0.80 - 0.66);
}
function dpHLaunch(hPath, hFace, f){ return (1 - f) * hPath + f * hFace; }
function dpVLaunch(vPath, vFace, f){ return (1 - f) * vPath + f * vFace; }

/* ---- Gear effect (off-centre strike, RH; mirror for LH) ----
   strikeDimples: + toward toe, − toward heel. Returns spin-axis shift (deg):
   toe → axis left/draw (negative); heel → axis right/fade (positive). */
function dpGearAxisShift(strikeDimples, clubType){
  const perDimple = clubType === 'wood' ? 5.3 : 2.0;        // driver ~16° / iron ~6° per 3-dimple
  return -strikeDimples * perDimple;
}
/* high(+) on face → less spin; low(−) → more spin (rough deg-of-axis-V proxy / qualitative) */
function dpGearSpinSign(highLowDimples){ return -Math.sign(highLowDimples); }

/* ---- Vertical swing-plane (impact plane) estimate from loft, deg from horizontal.
   Presumed fit to TrackMan norms (driver ≈45°, 6i ≈56°, PW ≈63°); enter a captured
   value in the D-plane grid to override. ---- */
function dpEstVPlane(loft){
  loft = parseFloat(loft) || 30;
  return Math.round(Math.max(42, Math.min(66, 45 + (loft - 10) * 0.5)) * 10) / 10;
}

/* ---- Lateral curve estimate (yds) from spin axis + carry. CALIBRATABLE knob k. ---- */
function dpCurveYds(spinAxis, carryYds, k){
  k = (k == null) ? 0.62 : k;
  return Math.sin(spinAxis * DPLANE_DEG) * (carryYds || 0) * k;
}

/* ---- Convenience: full solve from the core impact variables ----
   Given horizontal face/path + vertical face(dyn loft)/path(AoA) + carry, return the
   derived ball-flight descriptors. */
function dpSolve(hFace, hPath, vFace, vPath, carry){
  const vDiff = dpVDiff(vFace, vPath);
  const hDiff = dpHDiff(hFace, hPath);
  const spinLoft = dp3DSpinLoft(vDiff, hDiff);
  const spinAxis = dpSpinAxis(hDiff, vDiff);
  const f = dpFaceFraction(spinLoft);
  return {
    vDiff, hDiff, spinLoft, spinAxis,
    hLaunch: dpHLaunch(hPath, hFace, f),
    vLaunch: dpVLaunch(vPath, vFace, f),
    curveYds: dpCurveYds(spinAxis, carry),
    shape: spinAxis < -0.5 ? 'Draw' : spinAxis > 0.5 ? 'Fade' : 'Straight'
  };
}

// Expose for the staged ES-module migration.
Object.assign(window, {
  DPLANE_DEG, dpHPath, dpHPlane, dpVPath, dpVPlane, dpVDiff, dpHDiff, dp3DSpinLoft,
  dpSpinAxis, dpFaceFraction, dpHLaunch, dpVLaunch, dpGearAxisShift, dpGearSpinSign,
  dpEstVPlane, dpCurveYds, dpSolve
});
