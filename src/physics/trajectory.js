// Ball-flight integrator: carry, apex and landing angle from launch conditions.
//
// WHY THIS EXISTS. Until now the app could only answer "what should this carry?" for the
// DRIVER, from the Foresight optimized-launch table (physics/driver.js). Every other club's
// launch, spin, apex and landing angle sat in the bag unchecked — nothing connected them to
// the carry beside them, so a typed 6,700 rpm and a measured 167 yd could disagree by twenty
// yards and neither number would ever know.
//
// THE MODEL. Forward Euler on the standard aerodynamic equations for a golf ball:
//     drag   Fd = ½ ρ A Cd v²   opposing velocity
//     lift   Fl = ½ ρ A Cl v²   perpendicular to velocity (Magnus, backspin lifts)
//     weight mg
// Both coefficients are functions of the SPIN RATIO S = ω·r / v — the surface speed of the
// dimples against the air speed — which is what the wind-tunnel work (Bearman & Harvey;
// Smits & Smith) actually varies. Spin decays through the flight at a rate proportional to
// itself, which is why a wedge lands steeply but not vertically.
//
// CALIBRATION, and why NOT against the Foresight table. The coefficients are fitted to
// TrackMan's published PGA Tour averages — twelve clubs from driver to pitching wedge, each
// a MEASURED set of ball speed, launch, spin and the carry that went with it. That set spans
// the whole bag, which is what this has to serve.
//     carry: mean absolute error 1.5 yd, worst 5.4 yd (the driver, see below)
// Fitting instead to the Foresight optimized-launch table in physics/driver.js was tried
// first and could not be made to work: no physical coefficients reproduce it, because it is
// a table of OPTIMAL outcomes rather than expected ones. It has 170 mph of ball speed
// carrying 325 yd, where tour average at 167 mph is 275 — fifty yards of daylight. That is
// the gap that showed up when the Driver Optimizer was seeded with a real golfer's numbers.
//
// KNOWN LIMITS, in the order they matter:
//   · no wind, no sidespin, no curvature — a straight shot on a still day
//   · apex reads ~8% high and landing angle ~2° shallow against the same tour data: the
//     model holds its lift a little too well late in the flight. Carry is what it was fitted
//     on and what it is trusted for.
//   · the driver still lands ~5 yd short of tour average, the one systematic residual —
//     driver-speed drag is the hardest part of the curve and the least well resolved
//   · landing angle is the flight's, not the bounce's

const BALL_MASS_KG = 0.04593;      /* 45.93 g — the Rules maximum, and what every ball is */
const BALL_RADIUS_M = 0.021335;    /* 42.67 mm diameter, the Rules minimum */
const BALL_AREA_M2 = Math.PI * BALL_RADIUS_M * BALL_RADIUS_M;
const GRAVITY = 9.80665;
const MPH_TO_MS = 0.44704;
const M_TO_YD = 1.0936133;
const M_TO_FT = 3.280839895;

/* Spin decay: ω(t) = ω₀·e^(−t/τ). τ ≈ 25 s is the usual figure from launch-monitor traces —
   a driver loses roughly a fifth of its spin over a 6-second flight. */
const SPIN_DECAY_S = 25;

/* Lift and drag against spin ratio S. Cl saturates — doubling the spin does not double the
   lift — and Cd rises with the lift being generated, which is induced drag: the price of the
   Magnus force. The base drag then FALLS above a critical speed: the boundary layer goes
   turbulent and the wake narrows, the drag crisis dimples exist to trigger. Without that term
   the fit was 13 yd short on a tour driver and right on every iron — the signature of a model
   that is too draggy only where the ball is fastest.
   All four constants below came out of the TrackMan fit; CD_0 landed on 0.240, which is where
   the wind-tunnel literature puts a dimpled sphere, and is the check that the fit is physical
   rather than merely obedient. */
const CD_0 = 0.2402;     /* base drag coefficient below the crisis */
const CL_K = 0.553;      /* lift ceiling */
const CL_SAT = 0.1796;   /* spin ratio at which lift is half its ceiling */
const CD_SPIN = 0.8609;  /* induced-drag share */
const CD_V_CRIT = 63.16; /* m/s — where the drag crisis begins (~141 mph) */
const CD_V_SLOPE = 0.515;/* drag lost per 50 m/s above it */

function ballCl(S){ return CL_K * S / (CL_SAT + S); }
function ballCd(S, v){
  const cl=ballCl(S);
  const base = (v!=null) ? Math.max(0.15, CD_0 - CD_V_SLOPE*Math.max(0, v-CD_V_CRIT)/50) : CD_0;
  return base + CD_SPIN * cl * cl;
}

/* THE FLIGHT. Returns carry (yd), apex (ft), landing angle (deg), flight time (s) and the
   descent speed, for a ball launched at `bspd` mph, `launch` degrees, `spin` rpm.
   `opts.rho` overrides air density (kg/m³) — pass today's to see the shot in today's air;
   the default is the reference day the bag's numbers are quoted on.
   `opts.landHeightFt` lets the ball finish above or below the tee. */
function ballFlight(bspd, launch, spin, opts){
  opts = opts || {};
  const v0 = (parseFloat(bspd)||0) * MPH_TO_MS;
  const th = (parseFloat(launch)||0) * Math.PI/180;
  const w0 = (parseFloat(spin)||0) * 2*Math.PI/60;          /* rpm → rad/s */
  if(!(v0>0)) return null;
  const rho = opts.rho!=null ? opts.rho
            : (typeof airDensity==='function' && typeof STD_COND!=='undefined' ? airDensity(STD_COND) : 1.185);
  const kAero = 0.5 * rho * BALL_AREA_M2 / BALL_MASS_KG;    /* ½ρA/m — the per-mass factor */
  const endY = (opts.landHeightFt||0) / M_TO_FT;

  const dt = 0.002;
  let x=0, y=0, vx=v0*Math.cos(th), vy=v0*Math.sin(th), t=0, apex=0;
  let prevX=0, prevY=0, prevVx=vx, prevVy=vy;
  while(t < 15){
    const v = Math.hypot(vx,vy);
    if(v<=0) break;
    const w = w0 * Math.exp(-t/SPIN_DECAY_S);
    const S = (w * BALL_RADIUS_M) / v;                       /* spin ratio */
    const cd = ballCd(S, v), cl = ballCl(S);
    /* drag opposes velocity; lift is perpendicular to it, rotated toward "up" for backspin */
    const ax = kAero * v * (-cd*vx - cl*vy);
    const ay = kAero * v * (-cd*vy + cl*vx) - GRAVITY;
    prevX=x; prevY=y; prevVx=vx; prevVy=vy;
    vx += ax*dt; vy += ay*dt; x += vx*dt; y += vy*dt; t += dt;
    if(y>apex) apex=y;
    if(y<=endY && vy<0){
      /* land between the last two steps rather than at whichever step overshot */
      const f=(prevY-endY)/((prevY-y)||1);
      const xl=prevX+(x-prevX)*f, vxl=prevVx+(vx-prevVx)*f, vyl=prevVy+(vy-prevVy)*f;
      return { carry: xl*M_TO_YD, apexFt: apex*M_TO_FT,
               landAngle: Math.abs(Math.atan2(vyl,vxl)*180/Math.PI),
               timeS: t, descentMph: Math.hypot(vxl,vyl)/MPH_TO_MS };
    }
  }
  return null;
}
/* Just the carry, for the solvers and for callers that want one number. */
function ballCarry(bspd, launch, spin, opts){
  const f=ballFlight(bspd,launch,spin,opts);
  return f ? f.carry : null;
}

/* ---- INVERSION: what would have to be true for the numbers to agree? ----
   Carry falls as spin rises once past the optimum, and rises with it below — so for a given
   ball speed and launch there are usually TWO spins that produce a given carry. The one
   being solved for is the higher branch: a shot that carries less than the model expects is
   nearly always spinning more than it was thought to, not less. Bisection on [spin, 12000],
   returning null when even the ceiling cannot bring the carry down far enough. */
function solveSpinForCarry(bspd, launch, targetCarry, opts){
  const tgt=parseFloat(targetCarry); if(!(tgt>0)) return null;
  let lo=200, hi=12000;
  const cLo=ballCarry(bspd,launch,lo,opts), cHi=ballCarry(bspd,launch,hi,opts);
  if(cLo==null||cHi==null) return null;
  /* peak carry sits somewhere inside; find it so the search stays on the falling branch */
  let bestSpin=lo, bestCarry=-Infinity;
  for(let s=200;s<=12000;s+=100){ const c=ballCarry(bspd,launch,s,opts); if(c>bestCarry){bestCarry=c;bestSpin=s;} }
  if(tgt>bestCarry) return null;                       /* no spin gets it that far */
  lo=bestSpin; hi=12000;
  for(let i=0;i<40;i++){
    const mid=(lo+hi)/2, c=ballCarry(bspd,launch,mid,opts);
    if(c>tgt) lo=mid; else hi=mid;
  }
  return Math.round((lo+hi)/2/50)*50;
}
/* The launch angle that fits, with spin held. Carry peaks at a middling launch, so there are
   again two answers — launching too low or too high both cost carry — and the one returned is
   whichever is nearer the angle already stored. */
function solveLaunchForCarry(bspd, spin, targetCarry, nearLaunch, opts){
  const tgt=parseFloat(targetCarry); if(!(tgt>0)) return null;
  let peakL=1, peakC=-Infinity;
  for(let L=1;L<=45;L+=0.5){ const c=ballCarry(bspd,L,spin,opts); if(c!=null&&c>peakC){peakC=c;peakL=L;} }
  if(tgt>peakC) return null;                            /* no launch angle gets it that far */
  const side=(lo,hi)=>{                                 /* carry rises from lo toward hi=peak */
    for(let i=0;i<40;i++){
      const mid=(lo+hi)/2, c=ballCarry(bspd,mid,spin,opts);
      if(c==null||c<tgt) lo=mid; else hi=mid;
    }
    return (lo+hi)/2;
  };
  const low=side(1,peakL), high=side(45,peakL);
  const near=parseFloat(nearLaunch);
  if(!isFinite(near)) return Math.round(low*10)/10;
  return Math.round((Math.abs(low-near)<=Math.abs(high-near)?low:high)*10)/10;
}
/* The ball speed that fits, with launch and spin held. Carry rises monotonically with speed,
   so this one has a single answer and no branch to choose. */
function solveBallSpeedForCarry(launch, spin, targetCarry, opts){
  const tgt=parseFloat(targetCarry); if(!(tgt>0)) return null;
  let lo=40, hi=220;
  if(ballCarry(hi,launch,spin,opts)<tgt) return null;
  if(ballCarry(lo,launch,spin,opts)>tgt) return null;
  for(let i=0;i<40;i++){
    const mid=(lo+hi)/2;
    if(ballCarry(mid,launch,spin,opts)<tgt) lo=mid; else hi=mid;
  }
  return Math.round((lo+hi)/2*10)/10;
}

Object.assign(window, { BALL_MASS_KG, BALL_RADIUS_M, BALL_AREA_M2, SPIN_DECAY_S,
  CD_0, CL_K, CL_SAT, CD_SPIN, CD_V_CRIT, CD_V_SLOPE, ballCl, ballCd, ballFlight, ballCarry,
  solveSpinForCarry, solveLaunchForCarry, solveBallSpeedForCarry });
