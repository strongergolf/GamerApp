// features/strategy.js — Aim-point optimiser and hole overlays (Gameplan → Pre-Round).
//
// The payoff for the georeferenced hole geometry: sample candidate aim points, convolve
// each with that club's dispersion ellipse, classify every sampled landing point against
// the hole's mapped polygons (cfLieAt, courses.js), score it with the Broadie baselines
// (srForPlayer, sg.js), and keep the aim with the lowest risk-weighted expected strokes.
// This is the Broadie / DECADE idea: aim from your shot PATTERN, not your best shot.
//
// Known simplifications, all flagged where they bite:
//   - landing point uses the club's TOTAL distance (dispersion is sized off carry), so
//     carry-vs-roll interaction with a hazard lip is not modelled;
//   - dispersion is keyed on the SHOT LENGTH (origin→aim) rather than the club's own
//     carry; the two differ by the rollout, which barely moves either sigma;
//   - penalty relief is cfExpectedStrokes' one-stroke-plus-recovery approximation.

/* Deterministic 7-node grid per axis. Deterministic, not Monte-Carlo, so the same hole
   always scores the same (no flicker between renders) — 49 weighted samples per aim. */
const AIM_Z = [-2.4,-1.6,-0.8,0,0.8,1.6,2.4];
const AIM_W = AIM_Z.map(z=>Math.exp(-z*z/2));
const AIM_WSUM = AIM_W.reduce((a,b)=>a+b,0);
const AIM_CI90 = 1.645;                       // getDispersion() is a 90% CI half-width
const AIM_LAT_SWEEP = 30, AIM_LAT_STEP = 5;   // candidate aims, yards either side of the line

function aimSigmaLat(carry){ return getDispersion(carry)/AIM_CI90; }
/* Depth (distance-control) sigma — per-club, same 90% basis as the lateral figure, so the
   two are the axes of one honest error ellipse. Short shots come out depth-dominant and
   long shots lateral-dominant, with the crossover near 115 yd. */
function aimSigmaDist(carry){ return getDepthDispersion(carry)/AIM_CI90; }

/* ---------- SHOT SHAPE: the direction the ball is TRAVELLING when it lands ----------
   A curving ball does not arrive on the line it started on. Model its lateral offset through
   the flight as a parabola in the along-distance — sidespin acts roughly steadily, so the
   offset grows as the square — giving lateral(t) = C·t² over t in 0..1. The TANGENT at
   landing then has slope 2C/L: twice the average deflection. That tangent is the heading the
   ball is travelling on when it touches down, and therefore the heading it ROLLS OUT on.

   Which matters for one very practical reason. A shot's distance error and its roll both run
   along the landing heading rather than the start line, so the long axis of the landing
   pattern is tilted by the curve. Tilt it DOWN a fairway and more of the pattern stays on
   the short grass; tilt it ACROSS and the same shot crosses the fairway and out the far side.
   Nothing here asserts that a draw is better than a fade — only that a shape and a fairway
   can agree or disagree, and that the model should be able to tell which.

   The sign comes from the SPIN AXIS, not the Draw/Fade label, so it is right for either
   hand: a negative axis curves the ball left whoever is holding the club. Returned in the
   same sense as DISP_SLANT — positive tilts the long axis LEFT.

   MEASURED, and it does not do what was hoped — recorded here so nobody rebuilds it:
     - the landing pattern is WIDER THAN IT IS DEEP at every driving distance (lateral 1σ
       14.3 yd vs depth 8.1 yd at 290), so its long axis lies ACROSS the fairway, not along
       it. Laying that axis down a fairway would take a 90° rotation. A 12-yard draw supplies
       5.1°, so "align the shape with the fairway" cannot buy much, whatever the hole does;
     - the pattern's own lean was a fixed 15° on every shot, three times what the shape
       contributes, so it swamped the term entirely. That has since been replaced by a
       per-club strike correlation (dispTilt, physics/dispersion.js) — the driver now leans
       ~11° and a wedge ~4°, derived rather than asserted — but the ordering still holds:
       the pattern's lean is the larger term, and it is the one worth measuring;
     - swept ±10° across a left-running, a right-running and a straight fairway, the best
       tilt came out identical on all three. The 5 points of fairway that sweep moves are
       about un-slanting the pattern, not about the hole.
   So this models a real thing correctly and is worth keeping — the landing heading is what
   the tree/line-of-sight work will need, and it was not covered at all before — but it is
   NOT a fairway-hitting lever, and the readout must not claim to be one. The number to fix
   first was that fixed tilt, and it now is: see STRIKE_CORR in physics/dispersion.js, whose
   ρ is the one quantity here a golfer can genuinely measure from tracked shots. */
function aimLandingTilt(carryYd, curveYd, spinAxis){
  if(!carryYd || !curveYd || Math.abs(spinAxis||0) < 0.5) return 0;
  const deg = Math.atan2(2*Math.abs(curveYd), carryYd)*180/Math.PI;
  return spinAxis < 0 ? deg : -deg;
}
/* This club's stock shape, from the D-Plane Lab row the golfer has filled in. Memoised: the
   optimiser wants it once per candidate aim and it cannot change mid-sweep. */
window.aimShapeCache = window.aimShapeCache || {};
function aimClubShape(clubId){
  if(!clubId || typeof dplaneShape!=='function') return null;
  const cache=window.aimShapeCache;
  if(cache[clubId]!==undefined) return cache[clubId];
  const club=(STATE.clubs||[]).find(c=>c.id===clubId);
  if(!club) return (cache[clubId]=null);
  const d=(STATE.dplane||{})[clubId]||{};
  const p=(typeof perf==='function'&&perf(clubId))||{};
  const carry=p.carry||p.total||150;
  const vFace=(d.vFace!=null)?d.vFace:(parseFloat(club.loft)||30);
  const sh=dplaneShape(d.hFace, d.hPath, vFace, d.aoa, carry);
  return (cache[clubId]={ id:clubId, label:club.label, shape:sh.shape, curve:sh.curve,
    spinAxis:sh.spinAxis, carry, tilt:aimLandingTilt(carry, sh.curve, sh.spinAxis) });
}
/* Both caches key off the bag, the D-Plane rows and the performance table, so anything that
   edits those has to drop them — otherwise the optimiser keeps solving yesterday's swing. */
function aimShapeReset(){
  window.aimShapeCache={}; window.aimShotNameCache={}; window.stratOptCache=null;
}

/* Weighted landing samples (field units) for a shot from `from` aimed at `aim`.
   The error ellipse is lateral × depth, tilted DISP_SLANT° long-left / short-right, plus
   opt.tiltDeg for the club's own landing heading (see aimLandingTilt).
   opt.sigmaYd overrides the length the sigmas are looked up at (an approach from rough
   needs more club, so it disperses like the longer shot it really is); opt.latMult /
   opt.depthMult apply the lie's dispersion penalty. */
function aimSamples(hole, from, aim, opt){
  opt=opt||{};
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!aim) return [];
  const dx=aim.x-from.x, dy=aim.y-from.y, L=Math.hypot(dx,dy);
  if(L<1e-6) return [];
  const vx=dx/L, vy=dy/L, ux=-vy, uy=vx;          // along-shot and lateral unit vectors
  const shotYd=(opt.sigmaYd!=null)?opt.sigmaYd:L*ypu;
  const sLat=aimSigmaLat(shotYd)*(opt.latMult||1), sDist=aimSigmaDist(shotYd)*(opt.depthMult||1);
  /* Pattern lean (strike correlation, per club) + the ball's own landing heading. Both are
     now derived rather than asserted; opt.slantDeg lets the caller pass the club's lean so
     this does not have to guess which club is being hit. */
  const slant=(opt.slantDeg!=null)?opt.slantDeg:dispTiltFor(opt.clubType||'iron', shotYd);
  const th=(slant+(opt.tiltDeg||0))*Math.PI/180, ct=Math.cos(th), st=Math.sin(th);
  const out=[];
  for(let i=0;i<AIM_Z.length;i++) for(let j=0;j<AIM_Z.length;j++){
    const el=AIM_Z[i]*sLat, ed=AIM_Z[j]*sDist;     // ellipse frame, then rotate by the slant
    const lat=el*ct-ed*st, dist=el*st+ed*ct;
    out.push({ pt:{ x:aim.x+(ux*lat+vx*dist)/ypu, y:aim.y+(uy*lat+vy*dist)/ypu },
               w:(AIM_W[i]*AIM_W[j])/(AIM_WSUM*AIM_WSUM) });
  }
  return out;
}

/* Risk posture reshapes the objective (STATE.strategy.riskPosture):
     balanced — the mean: lowest expected score, the all-round play
     protect  — half mean, half the WORST quartile (a CVaR tail): kills big numbers
     chase    — half mean, half the BEST quartile: buys upside
     match    — a touch more aggressive than balanced                              */
/* ---- Avoidance priority, all else being equal ----
   Getting the expected-strokes MAGNITUDES right (courses.js) already makes the optimiser
   avoid trouble in the right order, because it minimises expected strokes and OOB costs
   more than a penalty area, which costs more than a recovery, which costs more than rough.
   This term only settles NEAR-TIES: two aims that score the same on expected strokes should
   not be treated as equal if one of them flirts with OB and the other with light rough.
   Weighted by severity, and scaled by a deliberately tiny epsilon so it can never override
   a real difference in expected strokes — it just breaks the tie the way a golfer would. */
const AIM_AVOID = { oob:8, water:4, trees:2, sand:1, rough:1 };
const AIM_AVOID_EPS = 0.02;
function aimAvoidance(lieMix){
  let a=0; Object.keys(lieMix||{}).forEach(k=>{ a+=(AIM_AVOID[k]||0)*lieMix[k]; });
  return a;
}
function aimObjective(mean, best25, worst25, posture){
  if(posture==='protect') return 0.5*mean+0.5*worst25;
  if(posture==='chase')   return 0.5*mean+0.5*best25;
  if(posture==='match')   return 0.75*mean+0.25*best25;
  return mean;
}
/* Weighted mean of the `frac` tail of a list sorted ascending by expected strokes. */
function aimTail(rows, wsum, frac, fromWorst){
  const seq=fromWorst?rows.slice().reverse():rows;
  let acc=0, val=0; const target=frac*wsum;
  for(let i=0;i<seq.length;i++){
    const take=Math.min(seq[i].w, target-acc); if(take<=1e-12) break;
    val+=seq[i].e*take; acc+=take;
  }
  return acc>0?val/acc:null;
}
/* Score one aim point over its whole landing distribution. */
function aimScore(hole, from, aim, hcp, posture, opt){
  const s=aimSamples(hole,from,aim,opt); if(!s.length) return null;
  let wsum=0, mean=0, pen=0, dsum=0; const rows=[], lieMix={};
  for(let i=0;i<s.length;i++){
    const e=cfExpectedStrokes(hole,s[i].pt,hcp); if(e==null) continue;
    const lie=cfLieAt(hole,s[i].pt), w=s[i].w;
    mean+=e*w; wsum+=w; if(cfIsPenalty(lie)) pen+=w;
    const dp=cfDistToPinYd(hole,s[i].pt); if(dp!=null) dsum+=dp*w;   // where it leaves you
    lieMix[lie]=(lieMix[lie]||0)+w;
    rows.push({e,w});
  }
  if(!wsum) return null;
  mean/=wsum;
  const avgToPin=dsum/wsum;
  /* Spread of the outcome, which is what a tournament objective trades against the mean.
     This is the BETWEEN-position variance — the part the shot choice actually controls. */
  let v=0; for(let i=0;i<rows.length;i++){ const d=rows[i].e-mean; v+=d*d*rows[i].w; }
  const variance=v/wsum;
  rows.sort((a,b)=>a.e-b.e);
  const best25=aimTail(rows,wsum,0.25,false)??mean, worst25=aimTail(rows,wsum,0.25,true)??mean;
  Object.keys(lieMix).forEach(k=>{ lieMix[k]=lieMix[k]/wsum; });
  const avoid=aimAvoidance(lieMix);
  return { aim, mean, best25, worst25, variance, sd:Math.sqrt(variance),
           penaltyRate:pen/wsum, lieMix, avoid, avgToPin,
           recoveryRate:lieMix.trees||0, greenRate:lieMix.green||0,
           score:aimObjective(mean,best25,worst25,posture)+AIM_AVOID_EPS*avoid };
}

/* Clubs that can be hit off the tee / from the turf, longest first, with the distance the
   ball FINISHES (total) and the carry that sizes the dispersion. */
function aimClubs(){
  return (STATE.clubs||[]).filter(c=>c.type!=='putter').map(c=>{
    const p=perf(c.id)||{};
    const carry=p.carry||p.total||0, total=p.total||p.carry||0;
    return {id:c.id,label:c.label,loft:c.loft,type:c.type,carry,total};
  }).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
}

/* Sweep every (club × lateral offset) candidate from `from`, aiming along the tee→pin
   line. Returns the ranked list plus the straight-at-the-flag reference for the winner's
   club, so the UI can show what the AIMING alone is worth. */
function optimiseAim(hole, from, opts){
  opts=opts||{};
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!hole.pin) return null;
  const hcp=cfHcp(opts.hcp), posture=opts.posture||'balanced';
  const dx=hole.pin.x-from.x, dy=hole.pin.y-from.y, L=Math.hypot(dx,dy);
  if(L<1e-6) return null;
  const vx=dx/L, vy=dy/L, ux=-vy, uy=vx;
  const clubs=(opts.clubs||aimClubs());
  const results=[];
  clubs.forEach(c=>{
    for(let off=-AIM_LAT_SWEEP; off<=AIM_LAT_SWEEP; off+=AIM_LAT_STEP){
      const along=Math.min(c.total, (L*ypu)+20)/ypu;      // never aim far past the hole
      const aim={ x:from.x+vx*along+ux*(off/ypu), y:from.y+vy*along+uy*(off/ypu) };
      const r=aimScore(hole,from,aim,hcp,posture);
      if(r){ r.club=c; r.offsetYd=off; r.alongYd=along*ypu; results.push(r); }
    }
  });
  if(!results.length) return null;
  results.sort((a,b)=>a.score-b.score);
  const best=results[0];
  const straight=results.find(r=>r.club.id===best.club.id && r.offsetYd===0)||null;
  return { best, straight, ranked:results.slice(0,8), posture, hcp };
}

/* ---------- APPROACH SHOTS — play it from where the ball actually lies ----------
   A tee shot chooses a club and a line; an approach mostly knows its club and chooses a
   SPOT on and around the green. So the candidates here are a grid of aim points around
   the pin (lateral AND short/long), scored the same way.

   The lie does two things, and cfLieAt already tells us what it is:
     1. costs distance  — reuse the app's own effective-yardage model (EY_SITUATION), so
        a rough lie needs more club and therefore disperses like the longer shot it is;
     2. costs accuracy  — the multipliers below. PRESUMED: rough hurts distance control
        (flyers and grabbers) more than direction, sand more again. Refine from data. */
const APPROACH_LIE = {
  fairway:{ lat:1.00, depth:1.00 },
  rough:  { lat:1.20, depth:1.35 },
  sand:   { lat:1.30, depth:1.50 }
};
/* cfLieAt's vocabulary -> the effective-yardage model's situation key. */
function approachSituation(lie){ return lie==='sand'?'bunker' : lie==='rough'?'rough' : 'fairway'; }
function approachLieCostYd(lie){
  const S=(typeof EY_SITUATION!=='undefined')?EY_SITUATION:{fairway:0,rough:6,bunker:8};
  return S[approachSituation(lie)]||0;
}
/* Name the shot for a required (effective) yardage — reuses the Approach tab's own
   club+swing engine so the wording matches the rest of the app; falls back to the
   nearest full club when the distance is outside that engine's window.
   Carries the club's ID as well as its label, because the optimiser needs to look up that
   club's stock shape (aimClubShape) to tilt the landing pattern. Memoised on the rounded
   yardage: the aim sweep asks for the same distances over and over. */
window.aimShotNameCache = window.aimShotNameCache || {};
function approachShotName(effYd){
  const key=Math.round(effYd);
  const cache=window.aimShotNameCache;
  if(cache[key]) return cache[key];
  let out=null;
  if(typeof calcSuggestions==='function'){
    const s=calcSuggestions(key);
    if(s&&s.length){
      const sw=s[0].sw.key==='full'?'full':s[0].sw.key==='tq'?'¾':'½';
      out={ id:s[0].club.id, label:s[0].club.label, detail:sw+' swing', effort:s[0].effort };
    }
  }
  if(!out){
    let best=null,bd=1e9;
    aimClubs().forEach(c=>{ const d=Math.abs(c.total-effYd); if(d<bd){bd=d;best=c;} });
    out = best?{id:best.id, label:best.label, detail:'full swing', effort:null}
              :{id:null, label:'—', detail:'', effort:null};
  }
  return (cache[key]=out);
}
/* Everything the sampler needs to know about the club that plays this distance: how the
   ball CURVES (its landing heading) and what KIND of club it is (which sets the pattern's
   own lean, via its strike correlation). Two different mechanisms, both per-club. */
function aimShotSig(effYd){
  const shot=approachShotName(effYd);
  const club=shot&&shot.id?(STATE.clubs||[]).find(c=>c.id===shot.id):null;
  const sh=shot&&shot.id?aimClubShape(shot.id):null;
  return { tiltDeg:sh?sh.tilt:0, clubType:club?club.type:'iron' };
}
function aimTiltFor(effYd){ return aimShotSig(effYd).tiltDeg; }
const APPROACH_LAT = 24, APPROACH_LONG = 12, APPROACH_SHORT = 24, APPROACH_STEP = 4;

/* Optimise an approach played from `from`. Returns the best aim SPOT relative to the pin
   plus the shot that plays it, or a {blocked} reason when there is nothing to optimise. */
function optimiseApproach(hole, from, opts){
  opts=opts||{};
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!hole.pin) return null;
  const lie=cfShotLie(hole,from);
  if(cfIsPenalty(lie)) return {blocked:'penalty', lie};
  if(lie==='green')   return {blocked:'green', lie, toPin:cfDistToPinYd(hole,from)};
  const toPin=cfDistToPinYd(hole,from);
  if(toPin==null) return null;
  if(toPin<20) return {blocked:'chip', lie, toPin};
  const hcp=cfHcp(opts.hcp), posture=opts.posture||'balanced';
  const mult=APPROACH_LIE[lie]||APPROACH_LIE.fairway;
  const cost=approachLieCostYd(lie);
  const longest=Math.max(...aimClubs().map(c=>c.total), 0);
  /* shot frame: v along ball→pin, u lateral */
  const dx=hole.pin.x-from.x, dy=hole.pin.y-from.y, L=Math.hypot(dx,dy);
  const vx=dx/L, vy=dy/L, ux=-vy, uy=vx;
  const results=[];
  for(let lat=-APPROACH_LAT; lat<=APPROACH_LAT; lat+=APPROACH_STEP){
    for(let dep=-APPROACH_SHORT; dep<=APPROACH_LONG; dep+=APPROACH_STEP){
      const aim={ x:hole.pin.x+ux*(lat/ypu)+vx*(dep/ypu), y:hole.pin.y+uy*(lat/ypu)+vy*(dep/ypu) };
      const geo=Math.hypot(aim.x-from.x,aim.y-from.y)*ypu;      // real yards to the spot
      const eff=geo+cost;                                        // what you must club for
      if(eff>longest+10) continue;                               // out of range
      const r=aimScore(hole,from,aim,hcp,posture,Object.assign({sigmaYd:eff,latMult:mult.lat,depthMult:mult.depth}, aimShotSig(eff)));
      if(!r) continue;
      r.latYd=lat; r.depthYd=dep; r.geoYd=geo; r.effYd=eff;
      r.greenRate=r.lieMix.green||0;
      results.push(r);
    }
  }
  if(!results.length) return {blocked:'range', lie, toPin};
  results.sort((a,b)=>a.score-b.score);
  const best=results[0];
  const atFlag=results.find(r=>r.latYd===0&&r.depthYd===0)||null;   // straight at the stick
  best.shot=approachShotName(best.effYd);
  return { best, atFlag, ranked:results.slice(0,8), lie, toPin, cost, mult, posture, hcp };
}

/* ---------- THE UNIFIED RECOMMENDATION — "what is the play from here?" ----------
   One optimiser for any ball, any lie, anywhere on the hole. A tee shot picking a line, an
   approach picking a spot, a lay-up and a punch-out are not four different problems — they
   are one search over "where do I try to put it next", scored the same way: the expected
   strokes to finish the HOLE from wherever the ball comes to rest.

   Candidates are swept in the shot's own frame — how far up the hole (along) crossed with
   how far offline (lateral) — so lay-ups, going for it and sideways recoveries all fall out
   of the same grid rather than being special-cased.

   The one genuine constraint: from the TREES you cannot realistically take on a full shot,
   because the model has no line-of-sight test. Trees are modelled as a recovery, so the
   options are capped at a punch-out's range — which is the same assumption the expected-
   strokes model already makes for that lie, keeping the two consistent. */
const SHOT_LAT_MAX = 40, SHOT_LAT_STEP = 8, SHOT_ALONG_STEPS = 10;
const SHOT_RECOVERY_MAX_YD = 70;
/* The app's four strategic stances, in one place. Same keys as STATE.strategy.riskPosture,
   so this panel and the Strategy Preferences elsewhere are the one setting, not two. */
const SHOT_POSTURES = ['balanced','protect','chase','match'];
const SHOT_POSTURE_LABEL = { balanced:'Balanced', protect:'Protecting', chase:'Chasing', match:'Match play' };
/* Re-score an already-sampled candidate under a different strategy. */
function shotScoreFor(r, posture){
  return aimObjective(r.mean, r.best25, r.worst25, posture) + AIM_AVOID_EPS*(r.avoid||0);
}

/* ---- TOURNAMENT / TARGET-SCORE UTILITY ----
   Every objective above minimises EXPECTED strokes, and for ordinary stroke play that is
   correct: expectation is linear, so the lowest expected score on each hole also gives the
   lowest expected round and the lowest expected tournament. Those three levels are one
   objective, not three.

   Playing for a NUMBER is the level that genuinely differs — a cut line, a score to win, a
   match. There the goal stops being the lowest mean and becomes the best CHANCE of reaching
   a target. Under a normal approximation of the remaining total,
        P(total <= T) = Phi( (T - mu) / sigma )
   so maximising that probability is exactly maximising the z-score (T - mu)/sigma. That one
   line reproduces the whole of golf's risk intuition without asserting any of it:
     comfortably ahead of the target (T > mu) -> variance LOWERS z -> protect, play safe
     behind the target              (T < mu) -> variance RAISES z -> gamble, take it on
     exactly on target                        -> collapses to minimising the mean
   The further behind you are, the more variance is worth. No hand-set aggression dial —
   it falls out of the arithmetic. */
const SHOT_HOLE_SD = 0.8;   /* score sd on a hole not yet played (PRESUMED — most holes are
                               par or bogey with the odd birdie/double) */
const SHOT_POS_SD  = 0.5;   /* residual scoring sd from a given position, on top of the
                               between-position spread the shot choice controls (PRESUMED) */
/* How much a deviation must be worth, in probability of reaching the target, before it is
   taken at all. One percentage point: enough to ignore the rounding-error gambles that a
   raw z-maximiser would take with 60 holes still to play. */
const SHOT_TARGET_MIN_GAIN = 0.01;
/* Abramowitz & Stegun 7.1.26 — plenty accurate for a probability readout. */
function normCdf(z){
  const s=z<0?-1:1, x=Math.abs(z)/Math.SQRT2;
  const t=1/(1+0.3275911*x);
  const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
  return 0.5*(1+s*y);
}
/* What is still to play — including LATER ROUNDS, which is what makes the model behave the
   way tournament golf actually should. With three rounds still to come, one shot's variance
   is a rounding error against everything left, so the z-score barely moves and the play
   collapses to the balanced one. Deviating only starts to pay as the holes run out, which
   is Mark's rule — do not change strategy much until the closing stretch — arrived at by
   arithmetic rather than imposed as a gate. */
function tournamentCtx(course, hi, hcp){
  const T=STATE.tournament||{};
  const target=parseFloat(T.target), played=parseFloat(T.strokesSoFar)||0;
  const roundsAfter=Math.max(0, Math.min(3, parseInt(T.roundsRemaining)||0));
  if(!isFinite(target)||target<=0) return null;
  const holes=(course&&course.holes)||[];
  const perHole=(cfHcp(hcp)+2.5)/18;            // Broadie: avg ≈ par + hcp + 2.5 over 18
  let expRem=0, n=0;
  for(let i=hi+1;i<holes.length;i++){ expRem+=(holes[i].par||4)+perHole; n++; }
  const parRound=holes.reduce((s,x)=>s+(x.par||4),0)||72;
  expRem += roundsAfter*(parRound+perHole*18);
  const totalHolesLeft=n+roundsAfter*18;
  return { target, played, holesAfter:n, roundsAfter, totalHolesLeft, expRem,
           varRem:totalHolesLeft*SHOT_HOLE_SD*SHOT_HOLE_SD,
           budget:target-played,
           closingStretch: totalHolesLeft<=9 };   // where deviating starts to be worth it
}
/* z-score for a candidate: how many sd's of headroom it leaves against the target. */
function shotZ(r, ctx){
  if(!ctx||!r) return null;
  const mu=r.mean+ctx.expRem;
  const sd=Math.sqrt(Math.max(1e-6, (r.variance||0)+SHOT_POS_SD*SHOT_POS_SD+ctx.varRem));
  return (ctx.budget-mu)/sd;
}

function optimiseShot(hole, from, opts){
  opts=opts||{};
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!hole.pin) return null;
  const lie=cfShotLie(hole,from);
  const toPin=cfDistToPinYd(hole,from);
  if(cfIsPenalty(lie)) return {blocked:'penalty', lie, toPin};
  if(lie==='green')    return {blocked:'green', lie, toPin};
  if(toPin==null)      return null;
  if(toPin<20)         return {blocked:'chip', lie, toPin};
  const hcp=cfHcp(opts.hcp), posture=opts.posture||'balanced';
  const mult=APPROACH_LIE[lie]||APPROACH_LIE.fairway;
  const cost=approachLieCostYd(lie);
  const clubs=aimClubs(); if(!clubs.length) return null;
  const longest=Math.max.apply(null, clubs.map(c=>c.total));
  const recovery=cfIsRecovery(lie);
  const maxGeo = recovery ? Math.min(SHOT_RECOVERY_MAX_YD, toPin+10)
                          : Math.min(Math.max(30,longest-cost)+10, toPin+25);
  const minGeo = Math.min(recovery?15:25, maxGeo);
  const dx=hole.pin.x-from.x, dy=hole.pin.y-from.y, L=Math.hypot(dx,dy)||1;
  const vx=dx/L, vy=dy/L, ux=-vy, uy=vx;
  const results=[];
  for(let i=0;i<=SHOT_ALONG_STEPS;i++){
    const along=minGeo+(maxGeo-minGeo)*i/SHOT_ALONG_STEPS;
    for(let lat=-SHOT_LAT_MAX; lat<=SHOT_LAT_MAX; lat+=SHOT_LAT_STEP){
      const aim={ x:from.x+(vx*along+ux*lat)/ypu, y:from.y+(vy*along+uy*lat)/ypu };
      const geo=Math.hypot(aim.x-from.x,aim.y-from.y)*ypu;
      const eff=geo+cost;
      if(eff>longest+10) continue;
      const r=aimScore(hole,from,aim,hcp,posture,Object.assign({sigmaYd:eff,latMult:mult.lat,depthMult:mult.depth}, aimShotSig(eff)));
      if(!r) continue;
      r.geoYd=geo; r.effYd=eff; r.latYd=lat; r.alongYd=along;
      r.shot=approachShotName(eff);
      results.push(r);
    }
  }
  if(!results.length) return {blocked:'range', lie, toPin};
  /* A strategy changes the OBJECTIVE, not the sampling — so score every candidate once and
     re-rank the same list per posture. Comparing four strategies costs four passes over an
     array, not four solves, which is what makes live side-by-side comparison affordable. */
  const byPosture={};
  SHOT_POSTURES.forEach(p=>{
    let win=results[0], ws=shotScoreFor(results[0],p);
    for(let i=1;i<results.length;i++){ const s=shotScoreFor(results[i],p); if(s<ws){ws=s;win=results[i];} }
    byPosture[p]=win;
  });
  /* Playing for a number: maximise the z-score instead of minimising the mean.
     But maximising z alone is not enough. Any deficit at all makes the extra variance
     weakly better, so the raw argmax gambles on day one of a four-round event — the size
     of the gain shrinks as holes remain, the DECISION does not. So a deviation has to earn
     its keep: it is only taken when it moves the probability of reaching the target by at
     least SHOT_TARGET_MIN_GAIN. Because that gain scales with how little golf is left, the
     gate opens by itself down the closing stretch and stays shut before it — which is the
     rule (don't change strategy until the final nine) as a consequence, not a hard stop. */
  const tourCtx=opts.tourCtx||null;
  if(tourCtx){
    let win=results[0], wz=shotZ(results[0],tourCtx);
    for(let i=1;i<results.length;i++){ const z=shotZ(results[i],tourCtx); if(z>wz){wz=z;win=results[i];} }
    const base=byPosture.balanced, bz=shotZ(base,tourCtx);
    const gain=normCdf(wz)-normCdf(bz);
    const deviate = gain>=SHOT_TARGET_MIN_GAIN;
    const pick = deviate?win:base, pz = deviate?wz:bz;
    byPosture.target=Object.assign(Object.create(Object.getPrototypeOf(pick)),pick);
    byPosture.target._z=pz; byPosture.target._p=normCdf(pz);
    byPosture.target._gain=gain; byPosture.target._deviates=deviate;
  }
  results.sort((a,b)=>shotScoreFor(a,posture)-shotScoreFor(b,posture));
  const best=byPosture[posture]||results[0];
  /* Name each play the way a golfer would, from what it actually does */
  const categorise=r=>{ r.category = recovery ? 'Recovery — get it back in play'
    : (r.greenRate>0.35 || r.avgToPin<18) ? 'Go for the green' : 'Lay up / position'; return r; };
  Object.keys(byPosture).forEach(p=>categorise(byPosture[p]));
  categorise(best);
  /* The naive alternative: everything you have, straight at the flag. Capped by the SAME
     range limit the optimiser is held to, or the comparison is against a shot it was never
     allowed to pick (from the trees that made the punch-out look worse than a fantasy). */
  const naiveAlong=Math.min(Math.max(30,longest-cost), toPin, maxGeo);
  const naiveAim={ x:from.x+vx*(naiveAlong/ypu), y:from.y+vy*(naiveAlong/ypu) };
  const naive=aimScore(hole,from,naiveAim,hcp,posture,Object.assign({sigmaYd:naiveAlong+cost,latMult:mult.lat,depthMult:mult.depth}, aimShotSig(naiveAlong+cost)));
  if(naive){ naive.geoYd=naiveAlong; naive.shot=approachShotName(naiveAlong+cost); }
  return { best, naive, byPosture, tourCtx, ranked:results.slice(0,5), lie, toPin, cost, mult, posture, hcp, recovery };
}

/* ---------- overlay + panel: LINES A / B / O, shot by shot ----------
   A hole is not one decision, it is a sequence. So the unit here is a LINE — a strategic
   path through the hole — and a SHOT NUMBER within it. A-1 is the A tee shot; A-2 is the
   second shot played from wherever A-1 finished; O-3 is the third shot down the optimal
   line, which on a typical par 4 is the putt.

   Line O is the optimiser's own chain, recomputed from the tee. Lines A and B are yours:
   drag either one and every number moves, including the shots that follow it. */
window.stratSel = window.stratSel || { cIdx:0, hIdx:0 };
window.stratShot = window.stratShot || { shotNum:1, lines:{S:[]}, active:'S' };
window.stratOptCache = null;
/* Map view: centre + zoom, so the hole can be scrolled into like the D-Plane viewer. */
window.stratView = window.stratView || { cx:CF_W/2, cy:CF_H/2, z:1 };
const STRAT_ZMIN = 1, STRAT_ZMAX = 8;
function stratViewBox(){
  const v=window.stratView, w=CF_W/v.z, h=CF_H/v.z;
  /* keep the hole on screen — the centre can only roam by what the zoom hides */
  const mx=Math.max(0,(CF_W-w)/2), my=Math.max(0,(CF_H-h)/2);
  v.cx=Math.max(CF_W/2-mx, Math.min(CF_W/2+mx, v.cx));
  v.cy=Math.max(CF_H/2-my, Math.min(CF_H/2+my, v.cy));
  return { x:v.cx-w/2, y:v.cy-h/2, w, h };
}
function stratResetView(){ window.stratView={cx:CF_W/2, cy:CF_H/2, z:1}; buildHoleOverlay(); }
/* Which skill level the expected strokes and strokes-gained are measured against.
   null = the golfer's own handicap from their profile. */
const STRAT_SKILLS = [['','My handicap'],['-6','Tour (+6)'],['0','Scratch'],['6','6 hcp'],['12','12 hcp'],['18','18 hcp'],['24','24 hcp']];
function stratSkill(){
  const s=(STATE.strategy||{}).skillHcp;
  return (s===''||s==null) ? cfHcp() : parseFloat(s);
}
function stratSetSkill(v){
  STATE.strategy=STATE.strategy||{}; STATE.strategy.skillHcp=(v===''?null:v);
  saveState(); window.stratOptCache=null; buildHoleOverlay();
}
/* Two lines is enough: O is the optimiser's answer, S is whatever you select against it. */
const SHOT_LINES = ['S','O'];
const SHOT_COL = { S:'#ffd24a', O:'#79e08d' };
const SHOT_LABEL = { S:'S (Selected)', O:'O (Optimal)' };
const SHOT_MAX = 6;

function stratPosture(){ return (STATE.strategy||{}).riskPosture||'balanced'; }
function stratCurrent(){
  const cs=STATE.courses||[]; if(!cs.length) return null;
  const c=cs[Math.min(window.stratSel.cIdx,cs.length-1)]; if(!c) return null;
  const hs=c.holes||[]; const hi=Math.min(window.stratSel.hIdx,Math.max(0,hs.length-1));
  return hs[hi]?{course:c, hole:hs[hi], hi}:null;
}
/* Centre of the green — the reference every golfer actually clubs to. */
function stratGreenMid(hole){
  const g=hole&&hole.green; if(!g||!g.length) return hole?hole.pin:null;
  let x=0,y=0; g.forEach(p=>{x+=p.x;y+=p.y;});
  return {x:x/g.length, y:y/g.length};
}
function stratClearLines(){ window.stratShot.lines={S:[]}; window.stratShot.shotNum=1; window.stratOptCache=null; }

/* ---- Which hole the overlay opens on ----
   Remembered as a course ID and a hole NUMBER, never as list indices: indices shift the
   moment a course is imported, pruned or deleted, and an index that silently points at a
   different hole is worse than no memory at all. Same key shape the anchors use. */
/* byHand marks a selection the user made from the picker, which is honoured on the way back
   in whatever state that hole is in — you are allowed to look at a half-traced hole. A
   selection the app resolved for itself carries no such licence and is re-checked. */
function stratSaveSel(byHand){
  const c=(STATE.courses||[])[window.stratSel.cIdx]; if(!c) return;
  const h=(c.holes||[])[window.stratSel.hIdx];
  STATE.play=STATE.play||{};
  STATE.play.sel={ courseId:(c.id||c.name), holeNum:h?(h.num||window.stratSel.hIdx+1):1, byHand:!!byHand };
  saveState();
}
/* How well mapped a hole is, which is NOT the same question as whether it has a tee, a pin
   and a scale. A hole can pass that test and still be useless: with no green there is
   nothing to aim at, and with no fairway every tee shot lands in undifferentiated rough, so
   the picture and the numbers are both worthless. That weaker test is why the overlay opened
   on a hole with no fairway drawn on it. */
function stratHoleScore(h){
  if(!h || !h.tee || !h.pin || !cfHasScale(h)) return 0;
  if(!((h.green||[]).length>2)) return 1;                      // nothing to aim at
  const par3=(h.par||4)<=3;                                     // a par 3 has no fairway to map
  if(!((h.fairway||[]).length>2) && !par3) return 2;
  return 3 + ((h.hazards||[]).length?1:0);
}
function stratHoleReady(h){ return stratHoleScore(h)>=3; }
/* Of everything imported, which course is worth opening on? The one with the most properly
   mapped holes — a principled answer that needs no course to be named in the code, and that
   moves by itself as courses are imported or traced. */
function stratBestCourseIdx(cs){
  let bi=-1, bReady=-1, bTotal=-1;
  (cs||[]).forEach((c,i)=>{
    const scores=(c.holes||[]).map(stratHoleScore);
    const ready=scores.filter(s=>s>=3).length;
    const total=scores.reduce((a,b)=>a+b,0);
    if(ready>bReady || (ready===bReady && total>bTotal)){ bi=i; bReady=ready; bTotal=total; }
  });
  return bReady>0 ? bi : -1;
}
function stratRestoreSel(){
  const cs=STATE.courses||[]; if(!cs.length) return;
  const sel=(STATE.play||{}).sel;
  if(sel){
    const ci=cs.findIndex(c=>(c.id||c.name)===sel.courseId);
    if(ci>=0){
      const hs=cs[ci].holes||[];
      const hi=hs.findIndex(h=>(h.num||0)===sel.holeNum);
      /* Honour a remembered hole only if it is worth opening on. An earlier build picked the
         default with a weaker test and then SAVED it, so a bad landing spot became sticky —
         re-resolve rather than serve it again. A hole the user chose by hand is honoured
         whatever its state; only an unusable one is overridden. */
      if(hi>=0 && (stratHoleReady(hs[hi]) || sel.byHand)){
        window.stratSel={cIdx:ci, hIdx:hi};
        return;
      }
    }
  }
  /* Nothing remembered, that course is gone, or what was remembered is not worth showing. */
  const ci=stratBestCourseIdx(cs); if(ci<0) return;
  const hs=cs[ci].holes||[];
  let hi=0, best=-1;
  hs.forEach((h,i)=>{ const s=stratHoleScore(h); if(s>best){ best=s; hi=i; } });
  window.stratSel={cIdx:ci, hIdx:hi};
  stratSaveSel();   // remember what we resolved to, so it is a choice from here on
}
function stratSetCourse(i){
  window.stratSel.cIdx=+i;
  /* land on the best-mapped hole of the course just chosen, not blindly on its first */
  const hs=((STATE.courses||[])[window.stratSel.cIdx]||{}).holes||[];
  let hi=0,best=-1; hs.forEach((h,k)=>{ const s=stratHoleScore(h); if(s>best){best=s;hi=k;} });
  window.stratSel.hIdx=hi;
  stratClearLines(); stratSaveSel(true); buildHoleOverlay();
}
function stratSetHole(i){ window.stratSel.hIdx=+i; stratClearLines(); stratSaveSel(true); buildHoleOverlay(); }
function stratSetShotNum(n){ window.stratShot.shotNum=Math.max(1,Math.min(SHOT_MAX,+n)); buildHoleOverlay(); }
function stratSetLine(l){ window.stratShot.active=l; buildHoleOverlay(); }
function stratResetAim(){ stratClearLines(); buildHoleOverlay(); }
function stratSetPosture(p){
  if(typeof setStrategy==='function') setStrategy('riskPosture',p);
  else { STATE.strategy=STATE.strategy||{}; STATE.strategy.riskPosture=p; saveState(); }
  window.stratOptCache=null; buildHoleOverlay();
}
function stratSetTour(field,val){
  STATE.tournament=STATE.tournament||{};
  STATE.tournament[field]= (val===''||val==null) ? null : (field==='target'?parseFloat(val):parseInt(val)||0);
  saveState(); window.stratOptCache=null; buildHoleOverlay();
}

/* ---------- ANCHORS: where the ball ACTUALLY finished ----------
   The model chains AIM points because a projection has nothing better to chain. A real round
   supplies FINISHES, and once you have those,
        SG = E[strokes from the start] − E[strokes from the finish] − 1
   stops being a projection and becomes a measurement — your own strokes gained, off your own
   golf, against whichever baseline you have selected.

   So anchoring a shot is not a display convenience. It is the first row of a round record,
   and this store is shaped to grow into one: one finish per shot, per hole, per course,
   persisted. Keyed by course name and HOLE NUMBER rather than by list index, so re-ordering
   or re-importing a course cannot silently attach your round to the wrong hole. */
function stratAnchorKey(){
  const c=(STATE.courses||[])[window.stratSel.cIdx];
  const h=c&&(c.holes||[])[window.stratSel.hIdx];
  if(!c||!h) return null;
  return (c.id||c.name||'course')+'|'+(h.num||window.stratSel.hIdx+1);
}
function stratAnchors(){
  STATE.play=STATE.play||{}; STATE.play.anchors=STATE.play.anchors||{};
  const k=stratAnchorKey(); if(!k) return [];
  return (STATE.play.anchors[k]=STATE.play.anchors[k]||[]);
}
function stratAnchorAt(n){ return stratAnchors()[n-1]||null; }
function stratAnchorCount(){ return stratAnchors().filter(Boolean).length; }
/* Anchor shot n where it is currently aimed — then drag it to where the ball really went. */
function stratToggleAnchor(n){
  const a=stratAnchors(), cur=stratCurrent(); if(!cur) return;
  if(a[n-1]){ a[n-1]=null; }
  else {
    const aim=stratLineAim(cur.hole,'S',n); if(!aim) return;
    a[n-1]={x:aim.x, y:aim.y};
    /* Anchoring shot n fixes the start of shot n+1, so any aim already drawn for the shots
       after it came off a position that no longer exists. */
    const arr=window.stratShot.lines.S||[]; arr.length=Math.min(arr.length,n);
  }
  while(a.length&&a[a.length-1]==null) a.pop();
  saveState(); buildHoleOverlay();
}
function stratClearAnchors(){
  const k=stratAnchorKey(); if(!k) return;
  STATE.play=STATE.play||{}; STATE.play.anchors=STATE.play.anchors||{};
  delete STATE.play.anchors[k]; saveState(); buildHoleOverlay();
}

/* Score ONE shot: played from `from`, aimed at `aim`. Mode-free — the lie under the ball
   decides the distance cost and the dispersion penalty, wherever on the hole it sits.
   `end`, when supplied, is the recorded finish — see stratAnchors above. */
function stratScoreShot(hole, from, aim, end){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from) return null;
  const lie=cfShotLie(hole,from);
  const toPinFrom=cfDistToPinYd(hole,from);
  if(cfIsPenalty(lie)) return {blocked:'penalty', lie, from, toPinFrom};
  if(lie==='green')    return {blocked:'putt', lie, from, toPinFrom};
  if(!aim) return null;
  const geo=Math.hypot(aim.x-from.x,aim.y-from.y)*ypu;
  if(geo<8) return {blocked:'tap', lie, from, toPinFrom};
  const mult=APPROACH_LIE[lie]||APPROACH_LIE.fairway, cost=approachLieCostYd(lie);
  const sig=Object.assign({sigmaYd:geo+cost, latMult:mult.lat, depthMult:mult.depth}, aimShotSig(geo+cost));
  const r=aimScore(hole,from,aim,stratSkill(),stratPosture(),sig);
  if(!r) return null;
  const mid=stratGreenMid(hole);
  r.shot=approachShotName(geo+cost); r.from=from; r.aim=aim; r.sig=sig; r.lie=lie; r.lieCost=cost;
  r.geoYd=geo; r.playsYd=geo+cost;
  r.fromTeeYd=cfDistYd(hole,hole.tee,aim);
  r.toPinYd=cfDistToPinYd(hole,aim);
  r.toMidYd=mid?cfDistYd(hole,aim,mid):null;
  /* Two different questions, and the gap between them IS the cost of your dispersion:
       expAtAim — strokes left if the ball finishes exactly on the target spot
       mean     — strokes left once the whole pattern is accounted for, fairway and rough
                  and bunker and penalty in their real proportions */
  r.expAtAim=cfExpectedStrokes(hole,aim,stratSkill());
  r.dispersionCost=(r.expAtAim!=null)?(r.mean-r.expAtAim):null;
  /* STROKES GAINED for this shot, against the baseline for the selected skill level:
       SG = (expected from where the ball is) − (expected after the shot) − 1
     Positive means the shot beats what a player of that level averages from here; negative
     means it loses ground. Unlike the raw expected number it says whether the shot is good
     in absolute terms, not merely better than the other option on screen. */
  /* From the TEE the baseline is the hole itself, not a distance lookup — the fairway/rough
     tables clamp at 300/250 yd, which understated a full-length hole badly enough to make
     every good drive read as a loss. */
  const onTee = hole.tee && Math.abs(from.x-hole.tee.x)<2 && Math.abs(from.y-hole.tee.y)<2;
  const holeYd = cfDistYd(hole,hole.tee,hole.pin);
  r.expBefore = (onTee && holeYd!=null && typeof srForPlayer==='function')
    ? srForPlayer('tee', holeYd, stratSkill())
    : cfExpectedStrokes(hole,from,stratSkill());
  /* Where the ball FINISHED, if that is on record. Then strokes gained is measured from the
     one position that actually happened rather than averaged over the ones that might
     have — which is the difference between modelling a shot and scoring it. */
  if(end){
    r.end=end; r.endLie=cfShotLie(hole,end);
    r.expAfter=cfExpectedStrokes(hole,end,stratSkill());
    r.endToPinYd=cfDistToPinYd(hole,end);
    r.endYd=Math.hypot(end.x-from.x,end.y-from.y)*ypu;
  }
  r.sgActual = !!(end && r.expAfter!=null);
  r.sg=(r.expBefore!=null)?(r.expBefore-(r.sgActual?r.expAfter:r.mean)-1):null;
  r.sgFromTee=!!onTee;
  return r;
}

/* The optimiser's whole path through the hole, tee to green. Cached per hole/posture so
   dragging a user line never re-solves it. */
function stratOChain(hole){
  const key=window.stratSel.cIdx+'|'+window.stratSel.hIdx+'|'+stratPosture()+'|'+stratSkill();
  if(window.stratOptCache&&window.stratOptCache.key===key) return window.stratOptCache.chain;
  const chain=[]; let from={x:hole.tee.x, y:hole.tee.y};
  for(let n=1;n<=SHOT_MAX;n++){
    const res=optimiseShot(hole, from, {posture:stratPosture(), hcp:stratSkill()});
    if(!res){ break; }
    if(res.blocked){ chain.push({n, from, blocked:res.blocked, toPin:res.toPin, lie:res.lie}); break; }
    const aim={x:Math.round(res.best.aim.x), y:Math.round(res.best.aim.y)};
    chain.push({n, from, res, aim});
    from=aim;
  }
  window.stratOptCache={key, chain};
  return chain;
}
/* Where shot n on a line is played from: the tee, or wherever that line's previous shot
   was aimed. An unplayed A/B shot inherits the optimal line's position at that stage. */
function stratBallFor(hole, line, n){
  if(n<=1) return {x:hole.tee.x, y:hole.tee.y};
  if(line!=='O'){
    /* A recorded finish beats an aim, always — it is what happened, not what was intended. */
    const anc=stratAnchorAt(n-1); if(anc) return anc;
    const arr=window.stratShot.lines[line]||[];
    if(arr[n-2]) return arr[n-2];
    /* An untouched previous shot still has a preference-driven aim of its own. Falling
       through to O here would play S's approach from where the OPTIMISER drove it, which is
       a different line entirely and quietly hid what S's own tee shot leaves behind. */
    const prevAim=stratLineAim(hole,line,n-1); if(prevAim) return prevAim;
  }
  const c=stratOChain(hole), prev=c[n-2];
  return (prev&&prev.aim)?prev.aim:null;
}
/* ---------- WHERE LINE S STARTS: the player's own Strategy Preferences ----------
   O is the model's answer. S should be the PLAYER'S — so an untouched S plays the hole the
   way the Strategy Preferences say this golfer plays it. That is what those five stored
   answers were always for: on their own they are a questionnaire, but turned into a line on
   the map they become measurable, and the interesting question stops being "what does the
   optimiser want" and becomes "what does MY strategy cost me against it".

   Two preferences place the tee shot (target line, club), two place the approach (target on
   the green, depth), and the risk posture is already wired into O's objective. Everything is
   read in the shot's own frame — v along ball→pin, u lateral, u positive to the RIGHT, the
   same sign convention as optimiseShot's latYd. */
const PREF_TEE_SIDE = { 'left-edge':-0.75, 'left-centre':-0.40, centre:0, 'right-centre':0.40, 'right-edge':0.75 };
const PREF_GRN_SIDE = { 'left-edge':-0.70, 'left-centre':-0.35, centre:0, 'right-centre':0.35, 'right-edge':0.70 };
/* "Attack the pin WHEN COMFORTABLE" needs a definition of comfortable. A short iron or less
   — PRESUMED; the natural refinement is the player's own proximity data by distance. */
const PREF_COMFORT_YD = 140;
/* Fairway width is read near the LANDING ZONE, not over the whole hole — a dogleg's fairway
   spans half the map and its average width would mean nothing. */
const PREF_FW_WINDOW = 25;

/* Lateral extent of a polygon ACROSS the shot line at a given along-distance — a true
   cross-section, taken where each polygon EDGE crosses the along = const line.

   It used to collect VERTICES within a window of that distance, which fails badly on a
   sparse shape: a hand-traced fairway can be four points, none of them anywhere near the
   landing zone, and the window then returns nothing at all. Edges are always there.
   Falls back to the whole shape's extent when the line misses the polygon entirely. */
function stratSpan(pts, origin, ypu, f, alongYd, windowYd){
  if(!pts||pts.length<3) return null;
  const P=pts.map(p=>{ const ax=(p.x-origin.x)*ypu, ay=(p.y-origin.y)*ypu;
    return { a:ax*f.vx+ay*f.vy, t:ax*f.ux+ay*f.uy }; });
  const span=(lo,hi)=> (isFinite(lo)&&hi-lo>=4) ? {lo,hi,mid:(lo+hi)/2,half:(hi-lo)/2} : null;
  if(alongYd!=null){
    const xs=[];
    for(let i=0;i<P.length;i++){
      const A=P[i], B=P[(i+1)%P.length];
      if((A.a-alongYd)*(B.a-alongYd)>0) continue;        // this edge does not straddle the line
      const d=B.a-A.a;
      xs.push(Math.abs(d)<1e-9 ? A.t : A.t+(B.t-A.t)*((alongYd-A.a)/d));
    }
    if(xs.length>=2){
      const s=span(Math.min.apply(null,xs), Math.max.apply(null,xs));
      if(s) return s;
    }
  }
  let lo=Infinity, hi=-Infinity;
  for(let i=0;i<P.length;i++){
    if(windowYd!=null && alongYd!=null && Math.abs(P[i].a-alongYd)>windowYd) continue;
    if(P[i].t<lo) lo=P[i].t; if(P[i].t>hi) hi=P[i].t;
  }
  return span(lo,hi);
}

/* Which pair of preferences governs a shot played from `from`. A par-3 tee shot is an
   approach whatever its number, and a punch-out is neither — so the question is not "which
   shot number is this" but "is the green in range". Shared by the aim itself and by the
   caption that tells the player which preferences they are watching. */
function stratPrefKind(hole, from){
  const clubs=aimClubs(); if(!clubs.length||!from||!hole.pin) return null;
  const lie=cfShotLie(hole,from);
  if(cfIsRecovery(lie)) return 'recovery';
  const toPin=cfDistToPinYd(hole,from);
  const g=hole.green||[];
  return (g.length>2 && toPin!=null && toPin+approachLieCostYd(lie)<=clubs[0].total+10)
    ? 'approach' : 'tee';
}

/* The aim the stored preferences imply for a shot played from `from`. Null when the hole or
   the bag can't support one, in which case the caller falls back to the naive line. */
function stratPrefAim(hole, from, n){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!hole.pin) return null;
  const clubs=aimClubs(); if(!clubs.length) return null;
  const P=STATE.strategy||{};
  const dx=hole.pin.x-from.x, dy=hole.pin.y-from.y, L=Math.hypot(dx,dy)||1;
  const f={ vx:dx/L, vy:dy/L, ux:-dy/L, uy:dx/L };
  const toPin=L*ypu, longest=clubs[0].total;             // aimClubs() sorts longest first
  const lie=cfShotLie(hole,from), cost=approachLieCostYd(lie);
  const mk=(along,lat)=>{
    const t=Math.max(-SHOT_LAT_MAX, Math.min(SHOT_LAT_MAX, lat));
    return { x:Math.round(from.x+(f.vx*along+f.ux*t)/ypu),
             y:Math.round(from.y+(f.vy*along+f.uy*t)/ypu) };
  };
  const kind=stratPrefKind(hole,from);
  /* From the trees there is no strategy to express — the model allows a punch-out and
     nothing else, so the preferences have nothing to say about it. */
  if(kind==='recovery') return mk(Math.min(toPin, SHOT_RECOVERY_MAX_YD), 0);

  /* ---- APPROACH: the green is in range, so the preferences pick a SPOT on it. ---- */
  let gLatLo=Infinity,gLatHi=-Infinity,gDepLo=Infinity,gDepHi=-Infinity;
  (hole.green||[]).forEach(p=>{
    const ax=(p.x-hole.pin.x)*ypu, ay=(p.y-hole.pin.y)*ypu;
    const d=ax*f.vx+ay*f.vy, t=ax*f.ux+ay*f.uy;
    if(d<gDepLo)gDepLo=d; if(d>gDepHi)gDepHi=d;
    if(t<gLatLo)gLatLo=t; if(t>gLatHi)gLatHi=t;
  });
  if(kind==='approach' && isFinite(gLatLo) && (gLatHi-gLatLo)>4){
    const cLat=(gLatLo+gLatHi)/2, hLat=(gLatHi-gLatLo)/2, cDep=(gDepLo+gDepHi)/2;
    const tgt=P.approachTarget||'flag-centre', dist=P.approachDistance||'middle';
    let lat, dep;
    if(dist==='middle'){ lat=cLat; dep=cDep; }   // "always play the middle" governs both axes
    else {
      lat = tgt==='at-flag'     ? 0
          : tgt==='flag-centre' ? cLat/2
          : (PREF_GRN_SIDE[tgt]!=null ? cLat+PREF_GRN_SIDE[tgt]*hLat : cLat);
      const comfy=(toPin+cost)<=PREF_COMFORT_YD;
      if(dist==='pin-high')      dep=0;
      else if(dist==='pin-seek'){ dep=comfy?0:cDep; if(comfy) lat*=0.5; }
      else                       dep=cDep;       // 'fat' — centre depth, either pin position
    }
    return mk(toPin+dep, lat);
  }

  /* ---- TEE or LAY-UP: the preferences pick a club and a line down the fairway. ---- */
  const oStep=stratOChain(hole)[n-1];
  const oGeo=(oStep&&oStep.res&&oStep.res.best)?oStep.res.best.geoYd:null;
  const club=P.teeClub||'optimal';
  const along=Math.max(30, Math.min(toPin,
      club==='driver-often'  ? longest-cost
    : club==='conservative'  ? (clubs[1]?clubs[1].total:longest*0.88)-cost
    : (oGeo!=null ? oGeo : longest-cost)));
  const tt=P.teeTarget||'centre';
  let lat=0;
  if(tt!=='shortest'){                            // 'shortest' IS the direct line
    const span=stratSpan(hole.fairway, from, ypu, f, along, PREF_FW_WINDOW)
            || stratSpan(hole.fairway, from, ypu, f, null, null);
    if(span) lat = tt==='widest'
      ? (span.hi > -span.lo ? span.hi/2 : span.lo/2)   // half into the roomier side
      : span.mid + (PREF_TEE_SIDE[tt]||0)*span.half;
  }
  return mk(along, lat);
}
/* ---------- DOES YOUR SHAPE FIT THIS FAIRWAY? ----------
   The fairway has a direction of its own, and near the landing zone it is rarely the
   direction you are standing on. Read its centreline by taking the lateral midpoint of the
   polygon a little short of the landing zone and a little long of it: the line between those
   two midpoints IS the local axis. Returned in the DISP_SLANT sense — positive means the
   fairway runs LEFT as it goes away from you, the same sign a draw's landing tilt carries,
   so the two numbers can simply be compared. */
const FIT_STEP_YD  = 35;    // how far either side of the landing zone to read the axis
const FIT_MAX_DEG  = 20;    // past this the reading is a dogleg corner, not a landing-zone axis
const FIT_TURN_MAX = 12;    // if the axis swings more than this THROUGH the zone, say nothing
const FIT_LEAN     = 0.6;   // lean toward the hole's line; never try to trace it
const FIT_TOL_DEG  = 2;     // below this a fairway is straight enough to call straight

/* The fairway's own axis through the landing zone, in the DISP_SLANT sense (positive = the
   fairway runs LEFT as it goes away from you), so it can be compared with a shape's tilt.

   Read at three cross-sections rather than two, because the failure mode here is geometric:
   at the corner of a sharp dogleg, or on a lumpy traced edge, an axis fitted across the
   whole span is a line through a bend and means nothing. Comparing the back half against
   the front half detects exactly that, and the answer is then to say nothing rather than
   something confident and wrong. What survives is clamped, because no landing zone is
   genuinely angled 40° to the shot you are hitting into it. */
function stratFairwayTilt(hole, from, aim){
  if(!hole||!from||!aim||((hole.fairway||[]).length<3)) return null;
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return null;
  const dx=aim.x-from.x, dy=aim.y-from.y, L=Math.hypot(dx,dy); if(L<1e-6) return null;
  const f={ vx:dx/L, vy:dy/L, ux:-dy/L, uy:dx/L };
  const along=L*ypu;
  const near=stratSpan(hole.fairway, from, ypu, f, along-FIT_STEP_YD, PREF_FW_WINDOW);
  const mid =stratSpan(hole.fairway, from, ypu, f, along,             PREF_FW_WINDOW);
  const far =stratSpan(hole.fairway, from, ypu, f, along+FIT_STEP_YD, PREF_FW_WINDOW);
  if(!near||!mid||!far) return null;
  /* lateral is +right, so a fairway drifting right slopes positive — negate for the tilt sense */
  const deg=(a,b,d)=> -Math.atan2(b.mid-a.mid, d)*180/Math.PI;
  if(Math.abs(deg(near,mid,FIT_STEP_YD)-deg(mid,far,FIT_STEP_YD))>FIT_TURN_MAX) return null;
  return Math.max(-FIT_MAX_DEG, Math.min(FIT_MAX_DEG, deg(near,far,2*FIT_STEP_YD)));
}
/* Does the shot's landing heading work WITH this fairway or against it?
   Deliberately a question about SIGN first and magnitude second. Matching the fairway's angle
   is the wrong target — the ball has to work with the hole, not trace it — and on a bending
   hole an exact-match test would call a perfectly good draw "wrong" for out-curving the
   bend. So the suggested amount is only a fraction of the fairway's own angle (FIT_LEAN),
   and it is offered as a lean rather than a number to hit. */
function stratShapeFit(hole, r){
  if(!r || r.blocked || !r.sig) return null;
  const tilt=r.sig.tiltDeg||0;
  if(Math.abs(tilt)<0.5) return null;                    // a straight ball has no story here
  const fw=stratFairwayTilt(hole, r.from, r.aim);
  if(fw==null) return null;
  const shot=approachShotName(r.sig.sigmaYd), sh=shot&&shot.id?aimClubShape(shot.id):null;
  const straight=Math.abs(fw)<FIT_TOL_DEG;
  return { tilt, fairway:fw, want:FIT_LEAN*fw, straight,
           withHole: !straight && ((tilt>0)===(fw>0)),
           shape:sh?sh.shape:'', curve:sh?sh.curve:0, club:shot?shot.label:'' };
}

/* Everything you have, straight at the flag — the fallback when a hole has no mapped
   fairway or green for the preferences to read. */
function stratNaiveAim(hole, from){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!hole.pin) return null;
  const clubs=aimClubs(); if(!clubs.length) return null;
  const dx=hole.pin.x-from.x, dy=hole.pin.y-from.y, L=Math.hypot(dx,dy)||1;
  const longest=clubs[0].total;
  const cap=cfIsRecovery(cfShotLie(hole,from))?SHOT_RECOVERY_MAX_YD:longest;  // no full shots out of trees
  const d=Math.min(L*ypu, longest, cap);
  return {x:Math.round(from.x+dx/L*(d/ypu)), y:Math.round(from.y+dy/L*(d/ypu))};
}

/* The aim for shot n on a line. O uses the optimiser's chain. An unset S shot must be
   re-solved from THAT LINE'S OWN position, not inherited from O — a line that drove into
   the trees cannot play O's approach, and inheriting it proposed a 188-yard blast out of a
   wood. Untouched, S plays what the Strategy Preferences say, so what is on screen is your
   strategy against the model's rather than against a straw man. */
function stratLineAim(hole, line, n){
  const c=stratOChain(hole), step=c[n-1];
  if(line==='O') return (step&&step.aim)?step.aim:null;
  const arr=window.stratShot.lines[line]||[];
  if(arr[n-1]) return arr[n-1];
  const from=stratBallFor(hole,line,n); if(!from) return null;
  return stratPrefAim(hole,from,n) || stratNaiveAim(hole,from);
}

/* One shot drawn on the hole. Three levels of emphasis: `full` for the shot being edited,
   `compact` for the rest of that line's plan, `dim` for the optimiser's path behind it. */
function stratShotSVG(hole, r, line, n, mode){
  if(!r||r.blocked) return '';
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return '';
  mode=mode||'full';
  const dim=(mode==='dim'), compact=(mode==='compact');
  const col=SHOT_COL[line], from=r.from, aim=r.aim, end=r.end||null;
  const op=dim?0.4:compact?0.8:1;
  const dx=aim.x-from.x, dy=aim.y-from.y, L=Math.hypot(dx,dy)||1;
  const ux=-dy/L, uy=dx/L;
  const rx=(aimSigmaLat(r.sig.sigmaYd)*(r.sig.latMult||1)*AIM_CI90)/ypu;
  const ry=(aimSigmaDist(r.sig.sigmaYd)*(r.sig.depthMult||1)*AIM_CI90)/ypu;
  /* Same tilt the SAMPLING used, or the drawn oval would be a picture of a different shot. */
  const slant=(r.sig.slantDeg!=null)?r.sig.slantDeg:dispTiltFor(r.sig.clubType||'iron', r.sig.sigmaYd);
  const ang=Math.atan2(uy,ux)*180/Math.PI+slant+(r.sig.tiltDeg||0);
  /* An ANCHORED shot has no dispersion left to draw — the ball is where it is. The ellipse
     gives way to a solid line to the recorded finish, and the dashed intention stays behind
     it at low opacity so the gap between aim and result is the thing you see. */
  const at=end||aim, top=end?-24:-ry-13;
  const lbl=(txt,off,size)=>`<text x="${at.x.toFixed(1)}" y="${(at.y+off).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${size}" font-weight="700" fill="${col}" stroke="#14351d" stroke-width="8" paint-order="stroke">${txt}</text>`;
  let s=`<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${aim.x.toFixed(1)}" y2="${aim.y.toFixed(1)}" stroke="${col}" stroke-width="${dim?2:compact?2.5:3.5}" stroke-dasharray="14,10" opacity="${(op*(end?0.45:0.9)).toFixed(2)}"/>`;
  if(!dim&&!end) s+=`<g transform="rotate(${ang.toFixed(1)} ${aim.x.toFixed(1)} ${aim.y.toFixed(1)})">
      <ellipse cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
        fill="${col}" fill-opacity="${compact?0.10:0.18}" stroke="${col}" stroke-opacity="${compact?0.6:0.95}" stroke-width="${compact?2.5:3.5}"/></g>`;
  if(end) s+=`<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${col}" stroke-width="${compact?3:4.5}" opacity="${op}"/>
      <circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="${compact?9:12}" fill="${col}" stroke="#14351d" stroke-width="3"/>`;
  const aimOp=(op*(end?0.55:1)).toFixed(2);
  s+=`<circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="${dim?5:compact?7:9}" fill="none" stroke="#fff" stroke-width="${dim?2:3}" opacity="${aimOp}"/>
      <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="3" fill="#fff" opacity="${aimOp}"/>`;
  if(dim) return s;
  /* Two lines, and only the strokes-gained story:
         298 yd · SG +0.24          what the shot is, and what it was worth
         123 to pin · 2.81 rem      where it leaves you, and what that costs
     The S-1 / O-2 tag and the club are gone. The tag was doing a job the LINE COLOUR already
     does, and repeating it above every marker crowded the picture the labels sit on; the
     strip below still names each line. The club moved down there with it — see .sh-strip. */
  const dist=Math.round(end?r.endYd:r.geoYd);
  const sg = r.sg!=null ? `SG ${r.sg>0?'+':''}${r.sg.toFixed(2)}${r.sgActual?' actual':''}` : '';
  const head = `${end?'⚓ ':''}${ydNum(dist)} ${ydUnit()}${sg?' · '+sg:''}`;
  if(compact) return s+lbl(head, top-8, 27);
  /* 36 units apart, not the 30 the font size suggests: the halo stroke adds ~4 units to each
     glyph box, so a gap set to the font size alone leaves the two lines touching. */
  s+=lbl(head, top-36, 30);
  const tp=end?r.endToPinYd:r.toPinYd, rem=r.sgActual?r.expAfter:r.mean;
  if(tp!=null&&rem!=null) s+=lbl(`${ydNum(tp)} to pin · ${rem.toFixed(2)} rem`, top, 27);
  return s;
}
function stratOverlay(hole, chains, n){
  const S=window.stratShot;
  let s='';
  /* Both WHOLE paths through the hole, not one shot at a time — a lay-up only makes sense
     next to the approach it buys, and a tee shot is judged by what it leaves. */
  SHOT_LINES.forEach(l=>{
    (chains[l]||[]).forEach((r,i)=>{
      if(!r||r.blocked||(i+1)===n) return;
      s+=stratShotSVG(hole,r,l,i+1, l==='O'?'dim':'compact');
    });
  });
  /* the shot being edited, in full, on top */
  SHOT_LINES.filter(l=>l!==S.active).forEach(l=>{
    const r=(chains[l]||[])[n-1]; if(r) s+=stratShotSVG(hole,r,l,n,'full');
  });
  const act=(chains[S.active]||[])[n-1];
  if(act) s+=stratShotSVG(hole,act,S.active,n,'full');
  if(chains.__ball) s+=`<circle cx="${chains.__ball.x}" cy="${chains.__ball.y}" r="13" fill="#fff" stroke="#111" stroke-width="3"/>`;
  return s;
}

/* Every strategy's answer to the same situation, side by side. Tap a row to adopt it. */
function stratPostureTable(res){
  if(!res||!res.byPosture) return '';
  const pct=v=>Math.round(v*100);
  const rows=SHOT_POSTURES.map(p=>{
    const r=res.byPosture[p]; if(!r) return '';
    const on=(p===res.posture);
    const off=Math.abs(r.latYd)>=1?` · ${Math.abs(r.latYd)}${r.latYd<0?'L':'R'}`:'';
    const note=(window.RISK_NOTE&&window.RISK_NOTE[p])?window.RISK_NOTE[p].replace(/<[^>]+>/g,''):'';
    return `<div class="sh-strat-row${on?' on':''}" onclick="stratSetPosture('${p}')" title="${escapeHtml(note)}">
      <span class="ss-name">${on?'● ':''}${SHOT_POSTURE_LABEL[p]}</span>
      <span class="ss-play">${r.shot.label} · ${Math.round(r.geoYd)} yd${off}</span>
      <span class="ss-exp">${r.mean.toFixed(2)}</span>
      <span class="ss-pen${r.penaltyRate>0.08?' sh-warn':''}">${pct(r.penaltyRate)}%</span>
    </div>`;
  }).join('');
  const t=res.byPosture.target, ctx=res.tourCtx;
  let tourRow='', tourNote='';
  if(t&&ctx){
    const off=Math.abs(t.latYd)>=1?` · ${Math.abs(t.latYd)}${t.latYd<0?'L':'R'}`:'';
    tourRow=`<div class="sh-strat-row sh-strat-target">
      <span class="ss-name">Target ${ctx.target}</span>
      <span class="ss-play">${t.shot.label} · ${Math.round(t.geoYd)} yd${off}</span>
      <span class="ss-exp">${t.mean.toFixed(2)}</span>
      <span class="ss-pen">${Math.round(t._p*100)}%</span></div>`;
    const gainPts=Math.abs((t._gain||0)*100);
    tourNote=`<div class="sh-tour-note">${
      t._deviates
        ? `Worth deviating — this play adds <b>${gainPts.toFixed(1)}</b> points of probability with <b>${ctx.totalHolesLeft}</b> hole${ctx.totalHolesLeft===1?'':'s'} left.`
        : `Hold the balanced play. Deviating would move the odds by only <b>${gainPts.toFixed(1)}</b> points with <b>${ctx.totalHolesLeft}</b> hole${ctx.totalHolesLeft===1?'':'s'} still to play — not worth the risk this early.`
    } The last column is the chance of reaching <b>${ctx.target}</b>.</div>`;
  }
  return `<div class="sh-alt-h">Strategy comparison — tap to switch</div>
    <div class="sh-strat-hd"><span>Stance</span><span>Play</span><span>Exp</span><span>${t?'Pen / P':'Pen'}</span></div>
    <div class="sh-strat-tbl">${rows}${tourRow}</div>${tourNote}`;
}
function stratTourInputs(){
  const T=STATE.tournament||{};
  return `<div class="sh-alt-h">Playing for a number</div>
    <div class="sh-tour-row">
      <label>Target total<input type="number" min="1" value="${T.target!=null?T.target:''}" placeholder="e.g. 72" oninput="stratSetTour('target',this.value)"></label>
      <label>Strokes so far<input type="number" min="0" value="${T.strokesSoFar||0}" oninput="stratSetTour('strokesSoFar',this.value)"></label>
      <label>Rounds after this<input type="number" min="0" max="3" value="${T.roundsRemaining||0}" oninput="stratSetTour('roundsRemaining',this.value)"></label>
    </div>`;
}

function buildHoleOverlay(){
  const wrap=document.getElementById('hole-overlay-wrap'); if(!wrap) return;
  const courses=(STATE.courses||[]);
  if(!courses.length){
    wrap.innerHTML=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
      <div class="lvl-soon-note">Import a course first — see the <b>My Courses</b> tab, where you can pull one from OpenStreetMap or trace it by hand. Then this shows each hole with your dispersion pattern, the recommended line and the alternatives.</div>`;
    return;
  }
  /* First render of the session: restore the remembered hole, or fall back to the first one
     that is actually mapped. Once only — after that the user's clicks own the selection. */
  if(!window.stratSelRestored){ window.stratSelRestored=true; stratRestoreSel(); }
  const ci=Math.min(window.stratSel.cIdx, courses.length-1), course=courses[ci];
  const holes=course.holes||[];
  const hi=Math.min(window.stratSel.hIdx, Math.max(0,holes.length-1)), hole=holes[hi];
  const cOpts=courses.map((c,i)=>`<option value="${i}"${i===ci?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('');
  const hOpts=holes.map((h,i)=>`<option value="${i}"${i===hi?' selected':''}>Hole ${h.num||i+1} · par ${h.par||4}</option>`).join('');
  const S=window.stratShot;
  const head=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
    <div class="strat-hole-row">
      <select class="strat-select" style="max-width:200px" onchange="stratSetCourse(this.value)">${cOpts}</select>
      <select class="strat-select" style="max-width:160px" onchange="stratSetHole(this.value)">${hOpts}</select>
      <select class="strat-select" style="max-width:140px" title="Skill level the expected strokes and strokes-gained are measured against" onchange="stratSetSkill(this.value)">
        ${STRAT_SKILLS.map(([v,l])=>`<option value="${v}"${String((STATE.strategy||{}).skillHcp??'')===v?' selected':''}>${l}</option>`).join('')}
      </select>
    </div>`;
  if(!hole){ wrap.innerHTML=head+`<div class="lvl-soon-note">This course has no holes yet.</div>`; return; }
  if(!cfHasScale(hole) || !hole.tee || !hole.pin){
    wrap.innerHTML=head+`<div class="lvl-soon-note">Hole ${hole.num||hi+1} needs a tee, a pin and a scale before it can be optimised. Holes imported from OpenStreetMap get all three automatically; a hand-traced hole needs the <b>calibrate</b> tool (or just a tee, a pin and the hole yardage).</div>`;
    return;
  }
  const chain=stratOChain(hole);
  /* Score every shot on BOTH lines, tee to green, rather than only the one being edited —
     the map shows whole plans now, and the numbers behind them have to exist to be drawn. */
  const chainFor=l=>{
    const out=[];
    for(let i=1;i<=SHOT_MAX;i++){
      const from=stratBallFor(hole,l,i); if(!from) break;
      const r=stratScoreShot(hole, from, stratLineAim(hole,l,i), l==='S'?stratAnchorAt(i):null);
      out.push(r);
      if(!r||r.blocked) break;
    }
    return out;
  };
  const chains={}; SHOT_LINES.forEach(l=>{ chains[l]=chainFor(l); });
  /* However many shots the LONGER plan needs — a line that lays up plays one more than a
     line that goes for it, and capping at the optimiser's count would hide that shot. */
  const maxShot=Math.max(1, Math.min(SHOT_MAX, Math.max.apply(null, SHOT_LINES.map(l=>chains[l].length))));
  const n=Math.min(S.shotNum, maxShot); S.shotNum=n;
  const pct=v=>Math.round(v*100);
  const mixOrder=['fairway','green','rough','sand','trees','water','oob'];
  const mixHTML=m=>mixOrder.filter(k=>m[k]>0.004).map(k=>
    `<span class="mix-chip mix-${k}">${CF_LIE_LABEL[k]} ${pct(m[k])}%</span>`).join('');

  const shots={};
  SHOT_LINES.forEach(l=>{ shots[l]=chains[l][n-1]||null; });
  chains.__ball = (shots[S.active]&&shots[S.active].from) || stratBallFor(hole,S.active,n);

  const holeYd=cfDistYd(hole,hole.tee,hole.pin);
  const shotBtns=Array.from({length:maxShot},(_,i)=>i+1).map(i=>
    `<button type="button" class="strat-pick${i===n?' active':''}" onclick="stratSetShotNum(${i})">Shot ${i}</button>`).join('');
  const lineBtns=SHOT_LINES.map(l=>
    `<button type="button" class="strat-pick${l===S.active?' active':''}" style="--pick:${SHOT_COL[l]}" onclick="stratSetLine('${l}')">${SHOT_LABEL[l]}</button>`).join('');

  /* One table, metrics down the side and the three lines across — far less vertical space
     than three stacked cards, and it lines the numbers up for comparison, which is the
     whole point. Penalty risk is NOT a row: it already lives in the outcome badges
     alongside fairway, rough and bunker, where it belongs. */
  const CHIP_SHORT={fairway:'FWY',green:'GRN',rough:'RGH',sand:'SND',trees:'TRE',water:'PA',oob:'OB'};
  const chipsFor=m=>mixOrder.filter(k=>m[k]>0.004)
    .map(k=>`<span class="mix-chip mix-${k}">${CHIP_SHORT[k]} ${pct(m[k])}</span>`).join('');
  const blockedTxt=r=> r.blocked==='putt' ? `${Math.round((r.toPinFrom||0)*3)} ft putt`
      : r.blocked==='penalty' ? 'take relief' : r.blocked==='tap' ? 'tap-in' : 'no shot';
  /* Ordered by what actually matters when you look up: how far the shot is and what it is
     worth, then where it leaves you and what that costs. Length and from-tee are one line —
     on the tee shot they are the same number, so the second only appears when it differs. */
  /* The four numbers that matter — shot length, its strokes gained, what it leaves to the
     pin and the expected shots from there — now live on the overlay itself. What stays here
     is the supporting detail that would clutter the map. */
  /* The map owns the numbers now — shot length, strokes gained, what it leaves and what that
     costs are all printed beside the ball. What is left below is the two things a map cannot
     say legibly:
       1. the OUTCOME MIX, which is the honest summary of the risk being taken;
       2. expected-if-perfect against expected-in-practice. The GAP between those two IS the
          cost of your dispersion, and until now it was only ever implicit. */
  const strip=SHOT_LINES.map(l=>{
    const r=shots[l], on=(l===S.active);
    /* The line tag lives here now that the map has dropped it, so this row is the key to
       which colour is which. The club comes with it — it left the map in the same change and
       this is the only other place it appears. */
    const head=`<span class="ss-ln ln-${l}">${l}-${n}</span>${l==='O'?'<span class="ss-sub">optimal</span>':''}`;
    if(!r) return `<div class="sh-strip-line${on?' on':''}">${head}<span class="ss-none">—</span></div>`;
    if(r.blocked) return `<div class="sh-strip-line${on?' on':''}">${head}<span class="ss-none"><i>${blockedTxt(r)}</i></span></div>`;
    const gap=(r.expAtAim!=null)?(r.mean-r.expAtAim):null;
    const perfect=r.sgActual
      ? `<span class="ss-pair"><b>${r.expAfter.toFixed(2)}</b> <span>from where it finished</span></span>`
      : `<span class="ss-pair"><b>${r.expAtAim!=null?r.expAtAim.toFixed(2):'—'}</b> <span>if perfect</span></span>
         <span class="ss-pair"><b>${r.mean.toFixed(2)}</b> <span>in practice</span></span>
         ${gap!=null?`<span class="ss-gap${gap<0?' neg':''}" title="${gap>=0
             ? 'What your dispersion costs: the difference between finishing exactly on the target and the whole pattern of where the ball actually goes.'
             : 'Negative: the spread around this target averages BETTER than the target itself — you are aiming at the worst point of a forgiving area.'
           }">${gap>=0?'+':'−'}${Math.abs(gap).toFixed(2)} dispersion</span>`:''}`;
    const swing=(r.shot.detail&&r.shot.detail!=='full swing')?` ${r.shot.detail}`:'';
    return `<div class="sh-strip-line${on?' on':''}">${head}
      <span class="ss-club">${r.shot.label}${swing}</span>${perfect}
      <span class="ss-chips">${chipsFor(r.lieMix)}</span></div>`;
  }).join('');
  const table=`<div class="sh-strip">${strip}</div>`;
  /* verdict across the three lines that actually produced a shot */
  const live=SHOT_LINES.filter(l=>shots[l]&&!shots[l].blocked);
  let verdict='';
  if(live.length>1){
    /* Compare every line to the BEST, not to the runner-up — with two lines tied at the top
       a runner-up comparison reports "level" while a third sits 0.7 strokes adrift. */
    /* Anything inside the avoidance tie-break band is noise, not a difference. O optimises
       a score that includes that term, so without this a line could read as "beating" the
       optimal one by 0.02 — which is the tie-break working, not a better shot. */
    const LEVEL=0.03;
    /* An ANCHORED shot is not a distribution any more, so comparing its dispersion mean
       against the other line's would score it on a shot that did not happen. */
    const rem=l=>shots[l].sgActual?shots[l].expAfter:shots[l].mean;
    const sorted=live.slice().sort((a,b)=>rem(a)-rem(b));
    const bestMean=rem(sorted[0]);
    const tied=sorted.filter(l=>rem(l)-bestMean<LEVEL);
    const worse=sorted.filter(l=>rem(l)-bestMean>=LEVEL);
    const tag=l=>`<b class="ln-${l}">${l}-${n}</b>`;
    verdict = worse.length===0
      ? `<div class="sh-gain">These lines are level on expected strokes.</div>`
      : `<div class="sh-gain">${tied.map(tag).join(' and ')} ${tied.length>1?'are':'is'} best${
          worse.map(l=>` · ${tag(l)} costs <b>+${(rem(l)-bestMean).toFixed(2)}</b>`).join('')}</div>`;
  }
  /* cfShotLie deliberately calls a ball on the tee "fairway" so the shot is not modelled out
     of rough — but reading "ball in the fairway" while standing on the tee is nonsense, so
     the header names the teeing ground for what it is. */
  const b=chains.__ball;
  const onTee = b && hole.tee && Math.abs(b.x-hole.tee.x)<CF_TEE_TOL && Math.abs(b.y-hole.tee.y)<CF_TEE_TOL;
  const ballWhere = !b ? '' : onTee ? ' · on the tee' : ` · ball in the ${CF_LIE_LABEL[cfShotLie(hole,b)].toLowerCase()}`;
  const oStep=chain[n-1];
  const oRes=(oStep&&oStep.res)?oStep.res:null;
  /* S's line comes out of these five answers, so they belong beside the map rather than two
     tabs away — change one and the yellow line moves on the spot. Which PAIR is doing the
     work depends on the shot, so say which, or the caption is a list rather than a reason. */
  const anchored=!!stratAnchorAt(n), nAnch=stratAnchorCount();
  const dragged=!!(window.stratShot.lines.S||[])[n-1];
  const kind=shots.S?stratPrefKind(hole,shots.S.from):null;
  /* Anchoring is the bridge from planning to recording: the shot stops being an intention
     with a dispersion pattern and becomes a result, so its strokes gained stops being a
     projection. Say which of the two you are looking at. */
  const anchorRow=`<div class="strat-picks sh-anchor-row">
      <button type="button" class="strat-mode-btn${anchored?' on':''}" onclick="stratToggleAnchor(${n})" title="${anchored?'Release the recorded finish and go back to modelling this shot':'Record where this shot finished — later shots then play from there, and its strokes gained becomes a measurement'}">${anchored?'⚓ anchored — release':`⚓ anchor S-${n}`}</button>
      ${nAnch?`<button type="button" class="strat-mode-btn" onclick="stratClearAnchors()">clear all ${nAnch}</button>`:''}
      <span class="sh-anchor-hint">${anchored?'Drag to where the ball actually finished.':'Drag to move the aim.'}</span>
    </div>`;
  const prefWhy = anchored
    ? `<b class="ln-S">S-${n}</b> is anchored — its strokes gained is measured off where the ball finished, and S-${n+1} plays from there.`
    : dragged
    ? `<b class="ln-S">S-${n}</b> is your own line — <a href="#" onclick="stratResetAim();return false">reset</a> to go back to your preferences.`
    : kind==='approach' ? `<b class="ln-S">S-${n}</b> plays your approach preferences: <b>${stratLabel('approachTarget').toLowerCase()}</b>, ${stratLabel('approachDistance').toLowerCase()}.`
    : kind==='tee'      ? `<b class="ln-S">S-${n}</b> plays your tee preferences: <b>${stratLabel('teeTarget').toLowerCase()}</b>, ${stratLabel('teeClub').toLowerCase()}.`
    : kind==='recovery' ? `<b class="ln-S">S-${n}</b> is a punch-out — no preference applies from the trees.`
    : `<b class="ln-S">S-${n}</b> follows your strategy preferences.`;
  /* Does the shape fit the fairway? The practical half of the landing-heading model, and the
     one number that settles it: re-score the SAME shot with the tilt taken out, and the
     difference in fairway rate is what this club's curve is worth on this hole. */
  const fit=stratShapeFit(hole, shots.S);
  let fitNote='';
  if(fit){
    const rS=shots.S;
    const flat=aimScore(hole, rS.from, rS.aim, stratSkill(), stratPosture(),
                        Object.assign({}, rS.sig, {tiltDeg:0}));
    const dFwy = flat ? ((rS.lieMix.fairway||0)-(flat.lieMix.fairway||0))*100 : null;
    /* Descriptive, not advisory. The measured worth is the claim; the with/against reading is
       only a description of the geometry. An earlier draft here said an aligned shape "keeps
       more of the pattern on the short grass" — the app's own numbers do not support that
       (see the note on aimLandingTilt), and a readout must not out-run its model. */
    const side=t=>t>0?'left':'right', mag=v=>Math.abs(v).toFixed(1);
    const fwTxt = fit.straight
      ? 'The fairway runs straight through the landing zone, so the shape crosses it.'
      : `The fairway bends <b>${mag(fit.fairway)}° ${side(fit.fairway)}</b> through the landing zone, so the shape works <b>${fit.withHole?'with':'against'}</b> the hole.`;
    const worth = dFwy==null ? ''
      : Math.abs(dFwy)<0.5
        ? ` Against the same shot hit straight it is worth <b>less than half a point</b> of fairway from here.`
        : ` Against the same shot hit straight it is worth <b>${dFwy>0?'+':'−'}${Math.abs(dFwy).toFixed(1)}</b> points of fairway from here.`;
    fitNote=`<div class="sh-fit${fit.withHole?' ok':''}">Your <b>${fit.club}</b> ${
      fit.shape.toLowerCase()}s about <b>${fmtYd(fit.curve)}</b>, landing <b>${mag(fit.tilt)}° ${side(fit.tilt)}</b> of its start line. ${
      fwTxt}${worth}</div>`;
  }
  /* Closed by default: the panel is sized to match the map, and the caption above already
     names the pair in play. Open it only when you want to change one — and since changing
     one rebuilds this whole panel, the open state has to survive that rebuild or the box
     snaps shut under your hand after every edit. */
  const prefBox=`<details class="sh-prefs"${window.stratPrefsOpen?' open':''} ontoggle="window.stratPrefsOpen=this.open">
      <summary>My strategy — what S plays</summary>
      <div class="sh-pref-grid">
        <label><span>Tee target</span>${stratSelect('teeTarget')}</label>
        <label><span>Tee club</span>${stratSelect('teeClub')}</label>
        <label><span>Approach target</span>${stratSelect('approachTarget')}</label>
        <label><span>Approach depth</span>${stratSelect('approachDistance')}</label>
        <label><span>Risk posture</span>${stratSelect('riskPosture')}</label>
      </div>
      <div class="sh-pref-foot">The first four place <b class="ln-S">S</b>. The risk posture is <b class="ln-O">O</b>'s objective — it changes what the optimiser is trying to do, not where you aim.</div>
    </details>`;
  /* Controls span the top, where you reach for them and where they cost the map nothing.
     The map then takes the width its portrait aspect can actually use, and everything else
     goes beside it — which is where the 467px of empty letterbox used to be.

     NOTE for the next pass: the hole is drawn bottom-to-top in a 1000x1400 field, so on a
     landscape screen the picture is height-bound and most of the row is unusable no matter
     how the boxes are arranged. Drawing the hole LEFT-TO-RIGHT would roughly double it. That
     is a renderHoleSVG change — one rotation transform on the scene, counter-rotations on
     the labels and the flag, and the inverse in stratDragInit's ptOf. */
  wrap.innerHTML=head+`
    <div class="sh-bar">
      <div class="sh-head">Hole ${hole.num||hi+1} · par ${hole.par||4} · ${fmtYd(holeYd)}${ballWhere}</div>
      <div class="sh-bar-ctl">
        <div class="strat-picks">${shotBtns}</div>
        <div class="strat-picks">${lineBtns}<button type="button" class="strat-mode-btn" onclick="stratResetAim()">↺ reset</button></div>
        ${S.active==='S'?anchorRow:''}
      </div>
    </div>
    <div class="strat-hole-grid">
      <div class="strat-hole-map">${renderHoleSVG(hole,{viewBox:stratViewBox(), overlay:`<g id="strat-overlay">${stratOverlay(hole,chains,n)}</g>`})}</div>
      <div class="sh-side">
        ${table}
        <div class="sh-below-notes">
          ${oRes&&oRes.best.category?`<div class="sh-cat">${oRes.best.category}</div>`:''}
          ${verdict}
          <div class="sh-pref-note">${prefWhy}</div>
          ${fitNote}
          ${prefBox}
        </div>
      </div>
    </div>`;
  stratDragInit(wrap);
}

/* Drag the active line's shot straight on the hole. Listeners live on the WRAPPER, which
   survives the innerHTML rebuild each move triggers, so a drag is never interrupted by its
   own re-render. Moving shot n discards that line's later shots — they stemmed from a
   position that no longer exists. */
function stratDragInit(wrap){
  if(!wrap||wrap._stratDrag) return; wrap._stratDrag=true;
  /* Anchors persist, but writing the whole STATE to storage 20 times a second while a finger
     is down would stutter — so mark the drag dirty and commit it when the finger lifts. */
  let mode=null, last=0, panFrom=null, anchorDirty=false;
  /* Client pixels → field units THROUGH the live viewBox, so aiming stays accurate at any
     zoom. Reading the viewBox off the element means it is always the one on screen. */
  const ptOf=e=>{
    const svg=wrap.querySelector('.strat-hole-map svg'); if(!svg) return null;
    const r=svg.getBoundingClientRect(); if(!r.width||!r.height) return null;
    const vb=(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number);
    const bx=vb.length===4?vb[0]:0, by=vb.length===4?vb[1]:0;
    const bw=vb.length===4?vb[2]:CF_W, bh=vb.length===4?vb[3]:CF_H;
    return { x:Math.round(bx+(e.clientX-r.left)/r.width*bw),
             y:Math.round(by+(e.clientY-r.top)/r.height*bh) };
  };
  const setAim=(e,force)=>{
    const p=ptOf(e); if(!p) return;
    const now=Date.now(); if(!force && now-last<50) return; last=now;
    const S=window.stratShot, n=S.shotNum;
    if(S.active==='O') return;                       // the optimiser's line is not draggable
    /* One drag target at a time, and the panel says which: an anchored shot's finish is the
       thing you are specifying, so the drag moves that; release the anchor to aim again. */
    const anc=stratAnchors();
    if(anc[n-1]){
      anc[n-1]=p; anchorDirty=true;
      /* the finish moved, so any aim drawn for a LATER shot came off a position that no
         longer exists — but later ANCHORS are records of what happened, and stand. */
      const arr=S.lines[S.active]||[]; arr.length=Math.min(arr.length,n);
    } else {
      const arr=S.lines[S.active]||(S.lines[S.active]=[]);
      arr[n-1]=p; arr.length=n;                      // later shots stemmed from the old spot
    }
    buildHoleOverlay();
  };
  const panBy=(e)=>{
    if(!panFrom) return;
    const now=Date.now(); if(now-last<50) return; last=now;
    const svg=wrap.querySelector('.strat-hole-map svg'); if(!svg) return;
    const r=svg.getBoundingClientRect(); const v=window.stratView;
    v.cx-=(e.clientX-panFrom.x)/r.width*(CF_W/v.z);
    v.cy-=(e.clientY-panFrom.y)/r.height*(CF_H/v.z);
    panFrom={x:e.clientX,y:e.clientY};
    buildHoleOverlay();
  };
  wrap.addEventListener('pointerdown',e=>{
    if(!e.target.closest||!e.target.closest('.strat-hole-map')) return;
    if(e.pointerType==='mouse'&&e.button===1){ mode='pan'; panFrom={x:e.clientX,y:e.clientY}; }
    else { if(window.stratShot.active==='O') return; mode='aim'; }
    try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    if(mode==='aim') setAim(e,true);
    e.preventDefault();
  });
  wrap.addEventListener('pointermove',e=>{
    if(mode==='aim') setAim(e,false); else if(mode==='pan') panBy(e);
  });
  const end=e=>{ if(!mode) return; if(mode==='aim') setAim(e,true); mode=null; panFrom=null;
    if(anchorDirty){ anchorDirty=false; saveState(); } };
  wrap.addEventListener('pointerup',end);
  wrap.addEventListener('pointercancel',end);
  /* Scroll to zoom, anchored on the cursor so the point under the pointer stays put. */
  wrap.addEventListener('wheel',e=>{
    const map=e.target.closest&&e.target.closest('.strat-hole-map'); if(!map) return;
    e.preventDefault();
    const before=ptOf(e); const v=window.stratView;
    const z=Math.max(STRAT_ZMIN, Math.min(STRAT_ZMAX, v.z*Math.exp(-e.deltaY*0.0015)));
    if(Math.abs(z-v.z)<1e-6) return;
    v.z=z;
    const after=ptOf(e);
    if(before&&after){ v.cx+=before.x-after.x; v.cy+=before.y-after.y; }
    buildHoleOverlay();
  },{passive:false});
}

Object.assign(window, {
  AIM_Z, AIM_W, AIM_CI90, AIM_LAT_SWEEP, AIM_LAT_STEP,
  aimSigmaLat, aimSigmaDist, aimSamples, aimObjective, aimTail, aimScore, aimClubs,
  optimiseAim, stratSetCourse, stratSetHole, buildHoleOverlay,
  APPROACH_LIE, approachSituation, approachLieCostYd, approachShotName, optimiseApproach,
  AIM_AVOID, AIM_AVOID_EPS, aimAvoidance, optimiseShot, shotScoreFor, stratPostureTable,
  SHOT_LAT_MAX, SHOT_LAT_STEP, SHOT_RECOVERY_MAX_YD, SHOT_POSTURES, SHOT_POSTURE_LABEL,
  stratSetPosture, SHOT_HOLE_SD, SHOT_POS_SD, SHOT_TARGET_MIN_GAIN, normCdf, tournamentCtx, shotZ,
  stratTourInputs, stratSetTour,
  STRAT_SKILLS, stratSkill, stratSetSkill, stratViewBox, stratResetView,
  SHOT_COL, SHOT_LINES, SHOT_LABEL, SHOT_MAX, stratPosture, stratCurrent, stratGreenMid,
  stratClearLines, stratResetAim, stratSetShotNum, stratSetLine,
  stratScoreShot, stratOChain, stratBallFor, stratLineAim,
  PREF_TEE_SIDE, PREF_GRN_SIDE, PREF_COMFORT_YD, PREF_FW_WINDOW,
  stratSpan, stratPrefKind, stratPrefAim, stratNaiveAim,
  aimLandingTilt, aimClubShape, aimShapeReset, aimTiltFor,
  FIT_STEP_YD, FIT_MAX_DEG, FIT_TURN_MAX, FIT_LEAN, FIT_TOL_DEG, stratFairwayTilt, stratShapeFit,
  stratAnchorKey, stratAnchors, stratAnchorAt, stratAnchorCount, stratToggleAnchor, stratClearAnchors,
  stratSaveSel, stratRestoreSel, stratHoleReady, stratHoleScore, stratBestCourseIdx,
  stratShotSVG, stratOverlay, stratDragInit
});
