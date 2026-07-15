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

/* ---- Ball-speed estimate for a full swing from loft (fallback when no Bag capture) ---- */
function dpEstBspd(loft){
  loft = parseFloat(loft) || 30;
  return Math.max(55, Math.min(175, Math.round(180 - 1.55 * loft)));
}

/* ---- Spin-rate estimate (rpm) from ball speed + 3D spin loft. Friction-limited fit
   to TrackMan norms (driver ~2.7k, 7i ~7k, PW ~9-10k, chip ~3k, flop ~8-9k);
   calibrate per club against captured Bag spin where available. ---- */
function dpSpinEst(bsMph, spinLoftDeg){
  const sl = Math.max(2, spinLoftDeg);
  const est = bsMph * 145 * Math.sin(sl * DPLANE_DEG) * Math.min(1.25, 0.35 + sl / 45);
  return Math.max(300, Math.min(13000, Math.round(est)));
}

/* ---- Full-range ball-flight integrator (teaching-grade, ~5-200 mph ball speed).
   3-DOF: gravity + drag + Magnus lift; the spin axis tilts the lift vector so
   draw/fade curvature EMERGES rather than being estimated. Coefficient fits after
   Bearman & Harvey (Cd, Cl vs spin factor S = ωr/v). Standard air density.
   Returns yards / feet / degrees + the flight points (metres) for rendering. ---- */
function dpFlightSim(bsMph, vLaunchDeg, hLaunchDeg, spinRpm, axisDeg){
  const DR = DPLANE_DEG, m = 0.04593, dia = 0.04267, A = Math.PI * dia * dia / 4, rho = 1.194, rr = dia / 2;
  const v0 = Math.max(1, bsMph) * 0.44704, vL = vLaunchDeg * DR, hL = hLaunchDeg * DR, phi = axisDeg * DR;
  let vx = v0 * Math.cos(vL) * Math.sin(hL), vy = v0 * Math.sin(vL), vz = v0 * Math.cos(vL) * Math.cos(hL);
  let x = 0, y = 0, z = 0, w = Math.max(0, spinRpm) * Math.PI / 30, apex = 0;
  const dt = 0.02, pts = [{x:0, y:0, z:0}];
  let lvx = vx, lvy = vy, lvz = vz;
  for(let i = 1; i <= 900; i++){
    const sp = Math.hypot(vx, vy, vz) || 0.01;
    const S = w * rr / sp;
    const Cd = 0.25 + 0.20 * Math.min(S, 0.5);
    const Cl = Math.min(0.35, S < 0.1 ? 1.9 * S : 0.19 + 0.48 * (S - 0.1));
    const q = 0.5 * rho * A * sp / m;
    /* lift = perpendicular-up in the velocity's vertical plane, tilted phi toward the axis side */
    const ux = vx / sp, uy = vy / sp, uz = vz / sp;
    let px = -uy * ux, py = 1 - uy * uy, pz = -uy * uz;
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const sx = py * uz - pz * uy, sy = pz * ux - px * uz, sz = px * uy - py * ux;   // right
    const lx = Math.cos(phi) * px + Math.sin(phi) * sx,
          ly = Math.cos(phi) * py + Math.sin(phi) * sy,
          lz = Math.cos(phi) * pz + Math.sin(phi) * sz;
    vx += (-q * Cd * vx + q * Cl * sp * lx) * dt;
    vy += (-q * Cd * vy + q * Cl * sp * ly - 9.81) * dt;
    vz += (-q * Cd * vz + q * Cl * sp * lz) * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    w *= 0.999;                                          // ~5%/s spin decay
    if(y > apex) apex = y;
    if(i % 8 === 0) pts.push({x, y, z});
    if(y <= 0 && vy < 0 && i > 3){ lvx = vx; lvy = vy; lvz = vz; break; }
  }
  pts.push({x, y: 0, z});
  return {
    carry: Math.hypot(x, z) * 1.09361,
    curve: x * 1.09361,
    apex: apex * 3.28084,
    land: Math.atan2(-lvy, Math.hypot(lvx, lvz)) / DR,
    zland: Math.max(z, 1),
    pts
  };
}

/* ---- Rollout estimate (yd) from land angle + spin; capped vs carry for short shots ---- */
function dpRollEst(landDeg, spinRpm, carryYd){
  const base = 0.022 * Math.pow(Math.max(0, 65 - landDeg), 2) * (1 - Math.min(spinRpm, 15000) / 16000);
  return Math.max(0.2, Math.min(35, Math.min(1.2 * (carryYd || 1), base)));
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
  dpEstVPlane, dpEstBspd, dpSpinEst, dpFlightSim, dpRollEst, dpCurveYds, dpSolve
});
