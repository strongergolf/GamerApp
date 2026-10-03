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
/* Node count per axis. The pattern is integrated on an n x n grid, so cost is n^2 and the
   node SPACING in yards is 4.8*sigma/(n-1) — which is what actually limits the model, because
   the thing being integrated is a step function: a sample is either on the green or it is not,
   and that is half a stroke. Anywhere a lie boundary runs through the pattern, the estimate
   can only resolve to about one node spacing.

   MEASURED at 7 nodes: hold the club, sigma and lean fixed and walk the aim a few field units
   and the estimate steps 0.021 on a 420-yard hole but 0.082 on a 92-yard one — at wedge range
   the outer ring sits almost exactly on the green edge, so a fraction of a yard flips a whole
   row. Gauss-Hermite would not rescue this; fast convergence needs a smooth integrand, and a
   lie boundary is the opposite of smooth. The only lever is more nodes.

   Rebuildable at runtime so the trade-off can be measured rather than guessed. */
let AIM_NODES = 7, AIM_LIMIT = 2.4;
let AIM_Z = [], AIM_W = [], AIM_WSUM = 0;
function aimSetNodes(n, limit){
  AIM_NODES=Math.max(3, Math.min(41, Math.round(n)||7));
  AIM_LIMIT=limit||AIM_LIMIT;
  AIM_Z=[]; AIM_W=[];
  for(let i=0;i<AIM_NODES;i++){
    const z=-AIM_LIMIT + 2*AIM_LIMIT*i/(AIM_NODES-1);
    AIM_Z.push(z); AIM_W.push(Math.exp(-z*z/2));
  }
  AIM_WSUM=AIM_W.reduce((a,b)=>a+b,0);
  window.AIM_Z=AIM_Z; window.AIM_W=AIM_W; window.AIM_WSUM=AIM_WSUM; window.AIM_NODES=AIM_NODES;
  if(typeof window!=='undefined'){ window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; }
}
/* MEASURED, 7 vs 11 vs 17 nodes, on a wedge / mid-iron / driver hole:
     nodes   noise 165yd   noise 420yd   cold overlay   drag frame   18-hole round
       7        0.022         0.025          15 ms         1 ms          272 ms
      11        0.010         0.012          37 ms         3 ms          776 ms
      17        0.009         0.006          63 ms         2 ms         1792 ms
   Eleven halves the noise, keeps a cold overlay rebuild inside the drag handler's own 50 ms
   throttle, and leaves the round view — which is on demand and cached — under a second.
   Seventeen doubles the round cost again for almost nothing at the distances that matter.

   One thing this did NOT fix, recorded so it is not rediscovered: wedge-range noise (~92 yd)
   plateaus around 0.024 whatever the node count, so it is not a sampling artefact. Something
   else steps at that scale — the carry/roll boundary and the rounded-yardage club lookup are
   both suspects. Worth its own investigation; it is the floor on this model's resolution. */
aimSetNodes(11);
const AIM_CI90 = 1.645;                       // getDispersion() is a 90% CI half-width
const AIM_LAT_SWEEP = 30, AIM_LAT_STEP = 5;   // candidate aims, yards either side of the line

function aimSigmaLat(carry){ return getDispersion(carry)/AIM_CI90; }
/* Depth (distance-control) sigma — per-club, same 90% basis as the lateral figure, so the
   two are the axes of one honest error ellipse. Short shots come out depth-dominant and
   long shots lateral-dominant, with the crossover near 115 yd. */
function aimSigmaDist(carry){ return getDepthDispersion(carry)/AIM_CI90; }

/* The lean, as an angle, for DRAWING the pattern. Sampling builds the correlation directly
   (see aimSamples) because a rotation gets the sign wrong; but an ellipse still has to be
   drawn at some angle, and this is the principal axis of that correlated cloud:
       tan(2φ) = −2ρ·σlat·σdep / (σlat² − σdep²)
   Positive ρ leans the pattern long-and-left. Note this DOES swing near 45° when the pattern
   is close to circular — that is honest for a drawing (a round cloud has no strong axis and
   looks the same whichever way it is turned) and is exactly why it is not used for sampling. */
function aimPatternAngle(sigLat, sigDep, rho){
  if(!rho || !(sigLat>0) || !(sigDep>0)) return 0;
  return 0.5*Math.atan2(-2*rho*sigLat*sigDep, sigLat*sigLat - sigDep*sigDep)*180/Math.PI;
}
/* The correlation a stored lean angle implies — one place, so sampling and drawing agree. */
function aimRhoOf(slantDeg){ return Math.max(-0.95, Math.min(0.95, Math.tan((slantDeg||0)*Math.PI/180))); }

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
   tilt sense: positive tilts the long axis LEFT.

   MEASURED — and the answer changed once the model was right. Recorded in full, because the
   first pass concluded the opposite and that conclusion was wrong for two reasons at once:
   the pattern lean was a flat 15° on every club, and the lean was applied by ROTATING the
   error ellipse, which has the sign backwards whenever lateral spread exceeds depth (see
   aimSamples). Both are fixed; here is what the corrected model says, on a 201x201 grid
   rather than the 49-sample scoring grid, so the answer is not quantisation:

     - the best shape DOES track the fairway. A left-bending hole wants a draw, a
       right-bending hole wants a fade, and the preference flips sign exactly at straight;
     - the size of it is small. Over a ±25 yd swing in curve it is worth ~2.3 points of
       fairway on a 12° dogleg, ~2.1 on a 12° bend the other way, and ~0.1 — nothing — on a
       straight hole. Call it 0.06 strokes a round;
     - so the honest statement is that shape and hole can agree or disagree, it is worth
       roughly a tenth of a stroke a round when they do, and it is not a reason to change
       your golf swing. The readout says exactly that and no more.

   The landing heading remains the piece the tree/line-of-sight work will need, where the
   question is what the ball FLIES OVER rather than where it finishes — and there the effect
   should be far larger than a couple of points of fairway. */
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
  window.aimShapeCache={}; window.aimShotNameCache={}; window.stratCacheEpoch=(window.stratCacheEpoch||0)+1;
}

/* Weighted landing samples (field units) for a shot from `from` aimed at `aim`.
   The error ellipse is lateral × depth, tilted long-left / short-right, plus
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
  const roll=+opt.rollYd||0;
  /* ---- The pattern is a CORRELATION, not a rotated ellipse ----
     This used to rotate the (lateral × depth) ellipse by a lean angle, and that quietly had
     the sign backwards for most of the bag. Rotating a wide-shallow ellipse by +θ carries its
     RIGHT-hand end forward, because
         cov(long, right) = sinθ·cosθ·(σlat² − σdep²)
     and σlat > σdep for every wood and long iron — so a lean documented as "long-and-left"
     delivered long-and-RIGHT exactly where it mattered most, and flipped sign again down at
     the wedges where depth dominates. A shape-dependent sign is not a model.

     Built directly instead: ρ is the correlation between hitting it long and hitting it LEFT,
     which is what the golf actually is, and the construction below produces it with no
     dependence on which axis happens to be longer. Marginal spreads stay exactly σlat and
     σdep; only their relationship changes. */
  const slant=(opt.slantDeg!=null)?opt.slantDeg:dispTiltFor(opt.clubType||'iron', shotYd);
  /* both effects are held as angles elsewhere; convert to the correlation they imply */
  const rho=aimRhoOf(slant+(opt.tiltDeg||0));
  const k=Math.sqrt(Math.max(0,1-rho*rho));
  const out=[];
  for(let i=0;i<AIM_Z.length;i++) for(let j=0;j<AIM_Z.length;j++){
    const el=AIM_Z[i], ed=AIM_Z[j]*sDist;          // el in sigmas, ed in yards
    const dist=ed;
    /* +rho leans the pattern LEFT as it runs long; lateral is +right, hence the minus */
    const lat=(-rho*AIM_Z[j] + k*el)*sLat;
    const px=aim.x+(ux*lat+vx*dist)/ypu, py=aim.y+(uy*lat+vy*dist)/ypu;
    /* where it pitched: the finish pulled back down the shot line by this club's roll */
    const land=roll>0 ? { x:px-vx*roll/ypu, y:py-vy*roll/ypu } : null;
    out.push({ pt:{x:px,y:py}, land, w:(AIM_W[i]*AIM_W[j])/(AIM_WSUM*AIM_WSUM) });
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
    const lie=cfCarryLie(hole, s[i].land, s[i].pt), w=s[i].w;
    const e=cfExpectedStrokes(hole,s[i].pt,hcp,lie); if(e==null) continue;
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
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!cfPin(hole)) return null;
  const hcp=cfHcp(opts.hcp), posture=opts.posture||'balanced';
  const dx=cfPin(hole).x-from.x, dy=cfPin(hole).y-from.y, L=Math.hypot(dx,dy);
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
      const sw=s[0].sw.key==='full'?'full':s[0].sw.key==='tq'?'¾':s[0].sw.key==='half'?'½':'⅓';
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
  /* How much of this shot is roll, so the sampler can tell where it PITCHED from where it
     stopped. Scaled to the shot actually being played rather than the club's stock number —
     a three-quarter 8-iron does not release like a full one. */
  const p=(shot&&shot.id&&typeof perf==='function')?perf(shot.id):null;
  let roll=0;
  if(p&&p.total>0&&p.carry>0){
    roll=Math.max(0,p.total-p.carry)*Math.max(0.3, Math.min(1.2, (+effYd||p.total)/p.total));
  }
  return { tiltDeg:sh?sh.tilt:0, clubType:club?club.type:'iron', rollYd:roll };
}
function aimTiltFor(effYd){ return aimShotSig(effYd).tiltDeg; }
const APPROACH_LAT = 24, APPROACH_LONG = 12, APPROACH_SHORT = 24, APPROACH_STEP = 4;

/* Optimise an approach played from `from`. Returns the best aim SPOT relative to the pin
   plus the shot that plays it, or a {blocked} reason when there is nothing to optimise. */
function optimiseApproach(hole, from, opts){
  opts=opts||{};
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!cfPin(hole)) return null;
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
  const dx=cfPin(hole).x-from.x, dy=cfPin(hole).y-from.y, L=Math.hypot(dx,dy);
  const vx=dx/L, vy=dy/L, ux=-vy, uy=vx;
  const results=[];
  for(let lat=-APPROACH_LAT; lat<=APPROACH_LAT; lat+=APPROACH_STEP){
    for(let dep=-APPROACH_SHORT; dep<=APPROACH_LONG; dep+=APPROACH_STEP){
      const aim={ x:cfPin(hole).x+ux*(lat/ypu)+vx*(dep/ypu), y:cfPin(hole).y+uy*(lat/ypu)+vy*(dep/ypu) };
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
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!cfPin(hole)) return null;
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
  const dx=cfPin(hole).x-from.x, dy=cfPin(hole).y-from.y, L=Math.hypot(dx,dy)||1;
  const vx=dx/L, vy=dy/L, ux=-vy, uy=vx;
  /* An evenly-spaced sweep alone is too coarse where it matters most. On a 165-yard par 3
     the eleven steps land 16.5 yd apart — more than a club — and none of them is 165, so the
     optimiser could not aim at the flag at all. It lost to the preference line, which can.
     The distances a golfer would actually name are therefore always candidates: the pin, and
     the middle of the green. Everything else stays a sweep. */
  /* An evenly-spaced sweep is too coarse where it matters most. On a 165-yard par 3 the
     eleven along-steps land 16.5 yd apart — more than a club — and none of them is 165, so
     the optimiser could not aim at the flag at all and lost to a line that could. The
     lateral sweep has the same problem: at 8-yard steps it cannot land on the middle of a
     green that sits 12 yards off the pin line.

     So the two aims every golfer actually considers — the flag, and the middle of the green
     — are added as explicit POINTS, not as distances paired with a coarse lateral grid. */
  const cand=[];
  for(let i=0;i<=SHOT_ALONG_STEPS;i++){
    const along=minGeo+(maxGeo-minGeo)*i/SHOT_ALONG_STEPS;
    for(let lat=-SHOT_LAT_MAX; lat<=SHOT_LAT_MAX; lat+=SHOT_LAT_STEP)
      cand.push({ x:from.x+(vx*along+ux*lat)/ypu, y:from.y+(vy*along+uy*lat)/ypu });
  }
  const named=[cfPin(hole), (typeof cfGreenMid==='function')?cfGreenMid(hole):null];
  named.forEach(p=>{
    if(!p) return;
    const d=Math.hypot(p.x-from.x,p.y-from.y)*ypu;
    if(d>=minGeo && d<=maxGeo) cand.push({x:p.x, y:p.y});
  });
  const results=[];
  for(let i=0;i<cand.length;i++){
    {
      const aim=cand[i];
      const geo=Math.hypot(aim.x-from.x,aim.y-from.y)*ypu;
      const along=geo, lat=((aim.x-from.x)*ux+(aim.y-from.y)*uy)*ypu;
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
/* `active` is always 'S' now. Only S was ever draggable — O is the optimiser's own answer —
   so the S/O switch changed almost nothing except hiding the anchor row, at the cost of a
   mode the golfer had to understand. The field stays because the map and drag code read it. */
window.stratShot = window.stratShot || { shotNum:1, lines:{S:[]}, active:'S' };
/* Solved chains, per hole. An epoch counter invalidates them all at once — cheaper and
   less error-prone than hunting down every cache entry when the bag or a pin changes. */
let STRAT_CHAINS = new WeakMap();
window.stratCacheEpoch = 0;
/* Map view: centre + zoom, so the hole can be scrolled into like the D-Plane viewer. */
window.stratView = window.stratView || { cx:CF_W/2, cy:CF_H/2, z:1 };
const STRAT_ZMIN = 1, STRAT_ZMAX = 8;
/* THE FRAME IS THE HOLE, not the field it is drawn in.
   Holes are traced into a fixed 1000x1400 field, and a hole that runs 388 yards straight up
   the middle used maybe a fifth of the width — so the map was mostly empty green, and it was
   empty on the device with the least room to spare. Cropping to the hole's own extent (plus a
   margin for the miss) lets the same picture live in a much shorter box. Zoom and pan then
   work within that crop rather than the whole field. */
const STRAT_BOX_RATIO = 0.95;      /* width : height of the map box */
/* The CORRIDOR: an imported hole carries every tree polygon and stray fairway piece near it,
   and framing all of them drew a straight hole as a thin strip down the middle of a wide map.
   The frame now takes what is in play: the tee, the green, and the fairway, bunker and water
   points within STRAT_CORRIDOR_YD of the tee-to-pin line, plus a STRAT_MISS_YD margin either
   side for where a miss finishes. Trees are still drawn; they just do not set the zoom. */
const STRAT_CORRIDOR_YD = 70, STRAT_MISS_YD = 35, STRAT_END_YD = 18;
function stratHoleBox(hole){
  if(!hole) return {x:0,y:0,w:CF_W,h:CF_H};
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  const eat=p=>{ if(!p||p.x==null) return; if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; };
  const ypu=(typeof cfYardsPerUnit==='function')?cfYardsPerUnit(hole):null;
  const tee=hole.tee, pin=(typeof cfPin==='function'?cfPin(hole):null)||hole.pin;
  if(ypu && tee && pin){
    const dx=pin.x-tee.x, dy=pin.y-tee.y, L2=(dx*dx+dy*dy)||1;
    const off=p=>{ const t=Math.max(0,Math.min(1,((p.x-tee.x)*dx+(p.y-tee.y)*dy)/L2)); return Math.hypot(p.x-(tee.x+t*dx), p.y-(tee.y+t*dy))*ypu; };
    const near=p=>p && off(p)<=STRAT_CORRIDOR_YD;
    eat(tee); eat(pin); (hole.green||[]).forEach(eat);
    (hole.fairway||[]).filter(near).forEach(eat); (hole.fairways||[]).forEach(f=>f.filter(near).forEach(eat));
    (hole.hazards||[]).filter(h=>h.type!=='trees').forEach(h=>(h.pts||[]).filter(near).forEach(eat));
    const mx=STRAT_MISS_YD/ypu, my=STRAT_END_YD/ypu;
    x0-=mx; x1+=mx; y0-=my; y1+=my;
  } else {
    eat(hole.tee); eat(hole.pin);
    (hole.green||[]).forEach(eat);
    (hole.fairway||[]).forEach(eat); (hole.fairways||[]).forEach(f=>f.forEach(eat));
    (hole.hazards||[]).forEach(h=>(h.pts||[]).forEach(eat));
    if(x1<x0||y1<y0) return {x:0,y:0,w:CF_W,h:CF_H};
    /* no scale to measure a corridor with: the old margin, a share of the hole */
    const padX=Math.max(90,(x1-x0)*0.45), padY=Math.max(70,(y1-y0)*0.10);
    x0-=padX; x1+=padX; y0-=padY; y1+=padY;
  }
  /* The picture must never be STRETCHED — the dispersion ovals and every yardage would then
     be drawn at two different scales — so the crop is padded to a target ratio rather than
     squeezed to it. The target is the box's shape, not the field's: the field is 1000x1400,
     and inheriting that made the map 480px tall on a 375px phone whatever the hole looked
     like. A near-square box is ~20% shorter for the same hole, and the padding lands to the
     SIDES, which is exactly where a miss goes. */
  let w=x1-x0, h=y1-y0;
  /* The target is the shape of the box the map is about to be drawn in, measured by
     stratMapSize — not a constant. Holes are long and thin, and a near-square crop of one on a
     phone left most of the picture empty green beside a hole drawn at two-thirds the scale the
     screen could hold. 0.95 remains the fallback before anything has been measured. */
  const want=window.stratMapRatio||STRAT_BOX_RATIO;
  if(w/h>want){ const nh=w/want; y0-=(nh-h)/2; h=nh; } else { const nw=h*want; x0-=(nw-w)/2; w=nw; }
  return {x:x0, y:y0, w, h};
}
function stratViewBox(){
  const v=window.stratView, B=stratHoleBox(window.stratBoxHole);
  const w=B.w/v.z, h=B.h/v.z;
  if(v.cx==null||v.boxKey!==`${B.x}|${B.y}|${B.w}`){ v.cx=B.x+B.w/2; v.cy=B.y+B.h/2; v.boxKey=`${B.x}|${B.y}|${B.w}`; }
  /* keep the hole on screen — the centre can only roam by what the zoom hides */
  const mx=Math.max(0,(B.w-w)/2), my=Math.max(0,(B.h-h)/2);
  const cx0=B.x+B.w/2, cy0=B.y+B.h/2;
  v.cx=Math.max(cx0-mx, Math.min(cx0+mx, v.cx));
  v.cy=Math.max(cy0-my, Math.min(cy0+my, v.cy));
  return { x:v.cx-w/2, y:v.cy-h/2, w, h };
}
function stratResetView(){ window.stratView={cx:null, cy:null, z:1}; buildHoleOverlay(); }
/* the + and − on the map: zoom about the centre of what is on screen */
function stratZoomBy(f){
  const v=window.stratView; const z=Math.max(STRAT_ZMIN, Math.min(STRAT_ZMAX, v.z*f));
  if(Math.abs(z-v.z)<1e-6) return; v.z=z; buildHoleOverlay();
}

/* ---------- THE MAP'S SIZE, from the screen it is on ----------
   On a phone the title, the map and the collapsed decision sheet are sized to fit ONE screen,
   so the hole and the answer about it are never a scroll apart — they were: the map started
   461px down an 812px screen and the cards began at 836. On a wide screen the sheet sits beside
   the map and the map takes the height. Either way the crop (stratHoleBox) is then padded to
   this exact shape, so nothing is stretched and nothing is letterboxed. */
const STRAT_PHONE_MAX = 700;          /* wrap width below which the sheet goes under the map */
const STRAT_CHROME_PX = 79;           /* the two sticky nav bars */
const STRAT_TITLE_PX = 86;            /* the title line; the layer chips float on the map now */
const STRAT_SHEET_PX = 132;           /* the collapsed sheet: controls + two summary lines, measured */
const STRAT_GAP_PX = 10;              /* map-to-sheet gap in the phone column */
function stratMapSize(wrap){
  const W=Math.max(280, (wrap&&wrap.clientWidth)||375), vh=window.innerHeight||812;
  const phone = W < STRAT_PHONE_MAX;
  let w, h;
  if(phone){
    /* edge to edge: the page's 16px gutters go to the map (see .ho-phone .strat-hole-map) */
    w=W+32;
    h=Math.max(300, Math.min(660, vh-STRAT_CHROME_PX-STRAT_TITLE_PX-STRAT_SHEET_PX-STRAT_GAP_PX-6));
  } else {
    h=Math.max(380, Math.min(860, vh-STRAT_CHROME_PX-STRAT_TITLE_PX-24));
    /* narrower than square: the hole is tall, and the scale is set by the height either way —
       what width the map does not need goes to the sheet beside it */
    w=Math.max(320, Math.min(W-334, Math.round(h*0.66)));
  }
  window.stratMapRatio = w/h;
  return {w, h, phone};
}
/* Rebuild on rotation or a resized window, once the resize has settled. */
if(!window.stratResizeHooked){
  window.stratResizeHooked=true;
  let t=null;
  window.addEventListener('resize',()=>{ clearTimeout(t); t=setTimeout(()=>{
    const pg=document.getElementById('page-gameplan');
    if(pg&&pg.classList.contains('active')) buildHoleOverlay();
  },180); });
}
/* On a phone the page opens with the 137px brand header above the overlay, so the map and its
   answer were sized to a screen the golfer could not see all of. Opening the tab scrolls the
   title up under the sticky nav, once, and never on a rebuild — rebuilds happen on every
   drag, and a page that jumped while you aimed would be unusable. */
function stratScrollToTitle(){
  const wrap=document.getElementById('hole-overlay-wrap'); if(!wrap||!wrap.classList.contains('ho-phone')) return;
  const t=wrap.querySelector('.ho-title'); if(!t) return;
  const y=t.getBoundingClientRect().top + window.scrollY - STRAT_CHROME_PX - 4;
  if(y>0) window.scrollTo({top:y, behavior:'instant'});
}
/* ‹ › — walk the course in order. Wraps, because the 18th leads to the 1st on the way to the
   clubhouse as often as anywhere. */
function stratStepHole(d){
  const cur=stratCurrent(); if(!cur) return;
  const n=(cur.course.holes||[]).length; if(!n) return;
  stratSetHole(((cur.hi+d)%n+n)%n);
}
/* LAYERS: the detail that used to be permanent rows, back on request. Cover numbers, the pin
   sheet and the dispersion ovals were each taken off for clutter; they are each still the right
   thing to look at some of the time. Persisted, because it is a standing preference. */
const STRAT_LAYERS = [
  {key:'disp',  label:'Dispersion', def:true},
  {key:'cover', label:'Cover',      def:false},
  {key:'pin',   label:'Pin',        def:false},
  {key:'photo', label:'Photo',      def:true}     /* only offered with an imagery key — see imgKey */
];
function stratLayers(){
  STATE.strategy=STATE.strategy||{};
  const L=STATE.strategy.layers=STATE.strategy.layers||{};
  STRAT_LAYERS.forEach(l=>{ if(L[l.key]==null) L[l.key]=l.def; });
  return L;
}
function stratToggleLayer(k){
  const L=stratLayers(); L[k]=!L[k];
  /* the pin layer IS pin mode's control panel — closing it leaves pin mode */
  if(k==='pin'&&!L.pin&&window.stratShot.pinMode){ window.stratShot.pinMode=false; window.stratView={cx:null,cy:null,z:1}; }
  saveState(); buildHoleOverlay();
}
/* The phone's bottom sheet: collapsed to the answer, expanded for the working. */
function stratToggleSheet(){ window.stratSheetOpen=!window.stratSheetOpen; buildHoleOverlay(); }

/* ---------- PIN MODE: put the flag where the sheet says ----------
   A pin sheet arrives days before a tournament and is the most concrete piece of preparation
   a golfer gets. Placing it needs the green filling the screen — a 30-yard green is 3% of a
   420-yard hole, and no amount of care with a mouse at that scale is worth anything. */
function stratZoomGreen(hole){
  const g=hole&&hole.green; if(!g||g.length<3) return false;
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  g.forEach(p=>{ if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; });
  /* zoom is relative to the hole's own frame (stratHoleBox), not the whole field */
  const B=stratHoleBox(hole);
  const span=Math.max(x1-x0, (y1-y0)*B.w/B.h, 40)*1.9;   // margin so the surrounds show
  window.stratView={ cx:(x0+x1)/2, cy:(y0+y1)/2, z:Math.max(1, Math.min(STRAT_ZMAX, B.w/span)) };
  return true;
}
function stratPinMode(on){
  const cur=stratCurrent(); if(!cur) return;
  window.stratShot.pinMode=!!on;
  if(on){ if(!stratZoomGreen(cur.hole)) { window.stratShot.pinMode=false; toast('Trace this green first'); return; } }
  else { window.stratView={cx:CF_W/2, cy:CF_H/2, z:1}; }
  buildHoleOverlay();
}
/* Drag or type — both land here. */
function stratSetPinAt(pt){
  const cur=stratCurrent(); if(!cur) return;
  cfSetPin(cur.course.id||cur.course.name, cur.hole.num||cur.hi+1, pt);
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; stratClearLines(); buildHoleOverlay();
}
function stratSetPinPaces(which, val){
  const cur=stratCurrent(); if(!cur) return;
  const p=cfPinPaces(cur.hole); if(!p) return;
  const front = which==='front' ? fromDisplay('distance', val) : p.fromFront;
  const left  = which==='left'  ? fromDisplay('distance', val) : p.fromLeft;
  const pt=cfPinFromPaces(cur.hole, front, left);
  if(pt) stratSetPinAt(pt);
}
function stratPinReset(){
  const cur=stratCurrent(); if(!cur) return;
  cfSetPin(cur.course.id||cur.course.name, cur.hole.num||cur.hi+1, null);
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; stratClearLines(); buildHoleOverlay();
}
function stratSheetSet(id){
  const cur=stratCurrent(); if(!cur) return;
  if(id==='__new'){ const n=prompt('Name this pin sheet (e.g. "Round 1 — Thu"):',''); if(n===null) { buildHoleOverlay(); return; } cfSheetAdd(cur.course.id||cur.course.name, n||undefined); }
  else cfSheetSelect(cur.course.id||cur.course.name, id||null);
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; stratClearLines(); buildHoleOverlay();
}
function stratSheetDelete(){
  const cur=stratCurrent(); if(!cur) return;
  const key=cur.course.id||cur.course.name, s=cfActiveSheet(key); if(!s) return;
  if(!confirm(`Delete the pin sheet "${s.name}" and every pin on it?`)) return;
  cfSheetDelete(key, s.id); window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; stratClearLines(); buildHoleOverlay();
}
/* How many of this course's holes the active sheet has a cut for — the progress a golfer
   transcribing a sheet actually wants to see. */
/* ---------- THE WHOLE SHEET, ON ONE SCREEN ----------
   Transcribing a pin sheet is one sitting, not eighteen visits to a hole picker. Every green
   is drawn the same way up — approach from the bottom — so the eye reads POSITION rather than
   re-learning each shape, which is exactly why real sheets are printed that way.

   It also shows the thing a single hole cannot: the day's PATTERN. Four front-left cuts in a
   row is a setup decision, and knowing it before the round is worth more than any one
   yardage. */
function stratPinSheetHoles(){
  const cur=stratCurrent(); if(!cur) return [];
  return (cur.course.holes||[]).filter(h=>(h.green||[]).length>2 && h.tee && cfHasScale(h));
}
/* Front / middle / back and left / centre / right, as thirds of each green. */
function stratPinZone(hole){
  const p=cfPinPaces(hole); if(!p) return null;
  const dep=p.fromFront+p.fromBack, wid=p.fromLeft+p.fromRight;
  if(!(dep>0)||!(wid>0)) return null;
  const fd=p.fromFront/dep, fl=p.fromLeft/wid;
  return { depth: fd<0.34?'front':fd<0.67?'middle':'back',
           side:  fl<0.34?'left' :fl<0.67?'centre':'right' };
}
function stratPinThumbClick(ev, holeNum){
  const cur=stratCurrent(); if(!cur) return;
  const hole=(cur.course.holes||[]).find(h=>(h.num||0)===holeNum); if(!hole) return;
  const svg=ev.currentTarget, r=svg.getBoundingClientRect();
  const vb=(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number);
  const W=vb[2]||120, H=vb[3]||100;
  const pt=cfGreenThumbPoint(hole, W, H, (ev.clientX-r.left)/r.width*W, (ev.clientY-r.top)/r.height*H);
  if(!pt) return;
  if(!cfPointInPoly(pt, hole.green)){ toast('That is off the green'); return; }
  cfSetPin(cur.course.id||cur.course.name, holeNum, pt);
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; buildHoleOverlay();
}
function stratSheetPaces(holeNum, which, val){
  const cur=stratCurrent(); if(!cur) return;
  const hole=(cur.course.holes||[]).find(h=>(h.num||0)===holeNum); if(!hole) return;
  const p=cfPinPaces(hole); if(!p) return;
  const front = which==='front' ? fromDisplay('distance', val) : p.fromFront;
  const left  = which==='left'  ? fromDisplay('distance', val) : p.fromLeft;
  const pt=cfPinFromPaces(hole, front, left);
  if(pt){ cfSetPin(cur.course.id||cur.course.name, holeNum, pt); window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; buildHoleOverlay(); }
}
function stratSheetClearHole(holeNum){
  const cur=stratCurrent(); if(!cur) return;
  cfSetPin(cur.course.id||cur.course.name, holeNum, null);
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; buildHoleOverlay();
}
function stratPinSheetGrid(){
  const cur=stratCurrent(); if(!cur) return '';
  const key=cur.course.id||cur.course.name, sheet=cfActiveSheet(key);
  const holes=stratPinSheetHoles();
  if(!holes.length) return `<div class="lvl-soon-note">No greens traced on this course yet — import or trace one and every hole appears here.</div>`;
  const zones={front:0,middle:0,back:0,left:0,centre:0,right:0};
  const cells=holes.map(h=>{
    const n=h.num||0, p=cfPinPaces(h), z=stratPinZone(h);
    if(z){ zones[z.depth]++; zones[z.side]++; }
    const cut=!!(sheet&&(sheet.pins||{})[String(n)]);
    /* what today's cut does to the hole, which is the number you actually play */
    const mid=cfGreenMid(h), today=cfPin(h);
    const dYd=(mid&&today)?cfDistYd(h,h.tee,today)-cfDistYd(h,h.tee,mid):0;
    return `<div class="pg-cell${cut?' cut':''}">
      <div class="pg-head"><span class="pg-num">${n}</span><span class="pg-par">par ${h.par||4}</span>
        ${cut?`<button class="pg-clear" title="Back to the middle" onclick="stratSheetClearHole(${n})">✕</button>`:''}</div>
      ${cfGreenThumb(h,120,104,{click:true,cut})}
      <div class="pg-fields">
        <label><span>on</span><input type="number" min="0" step="1" value="${p?ydNum(p.fromFront):''}" oninput="stratSheetPaces(${n},'front',this.value)"></label>
        <label><span>from L</span><input type="number" min="0" step="1" value="${p?ydNum(p.fromLeft):''}" oninput="stratSheetPaces(${n},'left',this.value)"></label>
      </div>
      <div class="pg-note">${z?`${z.depth} ${z.side}`:'—'}${Math.abs(dYd)>=1?` · <b>${dYd>0?'+':'−'}${ydNum(Math.abs(dYd))}</b> ${ydUnit()}`:''}</div>
    </div>`;
  }).join('');
  const n=holes.length;
  const pat=`<div class="pg-pattern"><b>Today's pattern</b>
    <span>${zones.front} front · ${zones.middle} middle · ${zones.back} back</span>
    <span>${zones.left} left · ${zones.centre} centre · ${zones.right} right</span></div>`;
  const filled=sheet?Object.keys(sheet.pins||{}).length:0;
  return `<div class="pg-bar">${sheet?`<b>${escapeHtml(sheet.name)}</b> — ${filled} of ${n} greens set`
      :'<b>No sheet selected</b> — every hole is playing the middle of the green. Type a cut below and one is started for you.'}</div>
    ${pat}<div class="pg-grid">${cells}</div>`;
}
/* ============================================================
   THE ROUND: eighteen holes, one number
   ============================================================
   Every other surface answers one hole. This answers "what does this course cost me, and
   where does my own strategy cost me against the model" — which is what a gameplan is for,
   and what makes today's pin sheet worth transcribing: change the cuts and the total moves.

   Written to survive whatever an import drags in. Courses arrive half-traced, with par 3s
   that have no fairway, holes with no green, hand-entered holes with a yardage and nothing
   else, nine-hole layouts, and 27-hole facilities. So each hole falls down a ladder and says
   which rung it landed on, rather than the whole view failing because hole 7 has no green:

     model     fully mapped — solved against the real geometry, hazards and today's cut
     baseline  yardage only — the handicap-adjusted expected score for a hole that long
     none      not even a yardage — counted, excluded, and named

   A total built partly from baselines is still worth having; a total that silently drops
   three holes is not. So the method counts are always shown next to it. */
const ROUND_METHODS = { model:'from the map', baseline:'from yardage', none:'not enough data' };
/* How finely this model can actually tell two lines apart, per hole.
   MEASURED by holding the club, the sigma and the lean constant and walking the aim across a
   few field units. At 7 nodes per axis the estimate stepped 0.022 at mid-iron range; the grid
   is now 11 (see aimSetNodes) and it steps 0.010. Wedge range is the exception — it sits near
   0.024 whatever the node count, so something other than sampling steps at that scale and it
   sets the floor here. Differences under this are the instrument, not the golf. */
const ROUND_RES = 0.03;
function stratRoundHole(hole, hcp){
  const par=+hole.par||4;
  const out={ num:hole.num||0, par, method:'none', o:null, s:null, yards:null, zone:null, cutYd:0 };
  /* how far this hole plays: mapped tee→pin if we have it, else whatever was typed */
  const mapped = hole.tee && cfHasScale(hole) && cfPin(hole);
  out.yards = mapped ? cfDistYd(hole, hole.tee, cfPin(hole)) : (+hole.yards||null);
  if(mapped && (hole.green||[]).length>2){
    const tee={x:hole.tee.x, y:hole.tee.y};
    const res=optimiseShot(hole, tee, {posture:stratPosture(), hcp});
    if(res && !res.blocked && res.best && res.best.mean!=null){
      /* one shot played, then the expected strokes left from the pattern it lands in */
      out.o=1+res.best.mean;
      const sAim=stratPrefAim(hole, tee, 1);
      const sr=sAim?stratScoreShot(hole, tee, sAim):null;
      if(sr && !sr.blocked && sr.mean!=null) out.s=1+sr.mean;
      out.method='model';
      out.zone=stratPinZone(hole);
      const mid=cfGreenMid(hole), cut=cfPin(hole);
      if(mid&&cut) out.cutYd=cfDistYd(hole,hole.tee,cut)-cfDistYd(hole,hole.tee,mid);
      return out;
    }
  }
  if(out.yards>0 && typeof srForPlayer==='function'){
    out.o=srForPlayer('tee', out.yards, stratHcpNum(hcp,'tee'));   // a hole that long, played to the baseline
    out.method='baseline';
  }
  return out;
}
/* Solving eighteen holes is ~100k point-in-polygon tests, so it is done on demand and kept
   until something it depends on changes. */
let STRAT_ROUND=null;
function stratRoundKey(course){
  const k=course.id||course.name;
  return [k, (course.holes||[]).length, stratPosture(), stratSkillKey(),
          (cfActiveSheet(k)||{}).id||'-', window.stratCacheEpoch||0,
          JSON.stringify(STATE.strategy||{})].join('|');
}
function stratRound(){
  const cur=stratCurrent(); if(!cur) return null;
  const key=stratRoundKey(cur.course);
  if(STRAT_ROUND && STRAT_ROUND.key===key) return STRAT_ROUND;
  const hcp=stratSkill();
  const rows=(cur.course.holes||[]).map(h=>stratRoundHole(h,hcp));
  const counts={model:0,baseline:0,none:0};
  let par=0,o=0,s=0,sFallback=0,scored=0;
  rows.forEach(r=>{
    counts[r.method]++;
    if(r.o==null) return;
    scored++; par+=r.par; o+=r.o;
    if(r.s!=null) s+=r.s; else { s+=r.o; sFallback++; }
  });
  STRAT_ROUND={ key, rows, counts, par, o, s, scored, sFallback,
                holes:(cur.course.holes||[]).length, course:cur.course.name };
  return STRAT_ROUND;
}
function stratRoundTable(){
  const R=stratRound();
  if(!R) return '';
  if(!R.scored) return `<div class="lvl-soon-note">No hole on this course has enough detail to score yet — a hole needs a yardage at minimum, and a traced green to be modelled properly.</div>`;
  const f=v=>v==null?'—':v.toFixed(2);
  const rows=R.rows.map(r=>{
    const d=(r.s!=null&&r.o!=null)?r.s-r.o:null;
    const cut=r.zone?`${r.zone.depth} ${r.zone.side}${Math.abs(r.cutYd)>=1?` <span class="rt-cut">${r.cutYd>0?'+':'−'}${ydNum(Math.abs(r.cutYd))}</span>`:''}`:'—';
    return `<tr class="rt-${r.method}">
      <td class="rt-h">${r.num||'—'}</td><td>${r.par}</td>
      <td>${r.yards?ydNum(r.yards):'—'}</td>
      <td class="rt-cutcell">${cut}</td>
      <td class="rt-num">${f(r.o)}</td>
      <td class="rt-num">${f(r.s)}</td>
      <td class="rt-num ${d==null||Math.abs(d)<ROUND_RES?'':d>0?'rt-worse':'rt-better'}">${
        d==null?'—':Math.abs(d)<ROUND_RES?'<span class="rt-level">level</span>':(d>0?'+':'')+d.toFixed(2)}</td>
      <td class="rt-m" title="${ROUND_METHODS[r.method]}">${r.method==='model'?'●':r.method==='baseline'?'◐':'○'}</td>
    </tr>`;
  }).join('');
  const vsPar=v=>{const d=v-R.par; return (d>0?'+':'')+d.toFixed(1);};
  const note=[];
  if(R.counts.model) note.push(`<b>${R.counts.model}</b> from the map`);
  if(R.counts.baseline) note.push(`<b>${R.counts.baseline}</b> from yardage only`);
  if(R.counts.none) note.push(`<b>${R.counts.none}</b> with too little data to score`);
  const sNote = R.sFallback ? ` Your line could not be solved on ${R.sFallback} hole${R.sFallback===1?'':'s'}, which fall back to the optimal one.` : '';
  return `<div class="rt-tot">
      <div class="rt-tot-cell"><span>Optimal</span><b>${R.o.toFixed(1)}</b><i>${vsPar(R.o)} vs par ${R.par}</i></div>
      <div class="rt-tot-cell"><span>Your strategy</span><b>${R.s.toFixed(1)}</b><i>${vsPar(R.s)} vs par ${R.par}</i></div>
      <div class="rt-tot-cell rt-tot-gap"><span>Costs you</span><b>${Math.abs(R.s-R.o)<ROUND_RES*2?'level':((R.s-R.o)>0?'+':'')+(R.s-R.o).toFixed(2)}</b><i>over ${R.scored} hole${R.scored===1?'':'s'}</i></div>
    </div>
    <div class="rt-note">Scored ${R.scored} of ${R.holes} holes — ${note.join(' · ')}.${sNote}</div>
    <div class="rt-scroll"><table class="rt-tbl">
      <thead><tr><th>Hole</th><th>Par</th><th>${ydUnit()}</th><th>Cut</th><th>Optimal</th><th>Yours</th><th>Δ</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total</th><th>${R.par}</th><th></th><th></th>
        <th class="rt-num">${R.o.toFixed(1)}</th><th class="rt-num">${R.s.toFixed(1)}</th>
        <th class="rt-num">${(R.s-R.o)>0?'+':''}${(R.s-R.o).toFixed(2)}</th><th></th></tr></tfoot>
    </table></div>
    <div class="rt-foot">Each hole is one tee shot played to plan, then the expected strokes from wherever it finishes — so the total already assumes ordinary play after the tee, and today's cuts move it. <b>Optimal</b> is the model's line; <b>Yours</b> is what your Strategy Preferences play. Differences under <b>${ROUND_RES.toFixed(2)}</b> a hole are inside what this model can resolve and read as <i>level</i>.</div>`;
}
function stratSheetProgress(){
  const cur=stratCurrent(); if(!cur) return null;
  const s=cfActiveSheet(cur.course.id||cur.course.name); if(!s) return null;
  const holes=(cur.course.holes||[]).length||18;
  return { name:s.name, set:Object.keys(s.pins||{}).length, holes };
}
/* Which skill level the expected strokes and strokes-gained are measured against.
   null = the golfer's own handicap from their profile. */
/* WHO IS PLAYING THIS HOLE. There is no picker any more, and that is the point: the overlay
   plans the round for the golfer holding the phone. It used to carry its own skill dropdown
   (My handicap / Tour / Scratch / 6 / 12 / 18 / 24), which meant the whole plan — aim points,
   layups, the optimal line — could quietly be a tour pro's plan rather than yours. Worse, it
   was the fourth definition of "the player" in the app, and a 106 yd fairway shot read 2.68
   here against 2.81 on Approach. The comparison benchmark still exists, once, app-wide, in
   Settings, where comparing yourself to scratch belongs; this is not that question. */
function stratSkill(){ return PLAYER; }
/* A cache key for "the player". The sentinel never changes, so on its own it would keep
   serving a plan made before the golfer typed in their GIR. */
function stratSkillKey(){ return PLAYER+'['+playerModelKey()+']'; }
/* srForPlayer wants a number; this turns the player sentinel into one for a given shot. */
function stratHcpNum(hcp, lie, d){ return hcp===PLAYER ? playerHcpFor(lie, d) : hcp; }
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
function stratClearLines(){ if(window.STATE&&STATE.play&&STATE.play.aims) stratAimsPrune(); window.stratShot.lines={S:[]}; window.stratShot.aimKey=null; window.stratShot.shotNum=1; window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; }
/* ---- YOUR LINE, SAVED ----
   The S line you drag is kept per course and hole in STATE.play.aims, keyed like the anchors
   ("<course id>|<hole number>" -> [ {x,y}|null per shot ]), so it is still there when you come
   back, survives a pin-sheet change, and Plan my round plays it as "Your line". lines.S IS the
   stored array, so a drag writes straight into it and the drag's end saves. ↺ reset empties it. */
function stratAimsFor(key){ STATE.play=STATE.play||{}; const A=STATE.play.aims=STATE.play.aims||{}; return (A[key]=A[key]||[]); }
function stratBindAims(){
  const k=stratAnchorKey(), S=window.stratShot;
  if(!k){ S.aimKey=null; return; }
  const arr=stratAimsFor(k);
  if(S.aimKey!==k || S.lines.S!==arr){ S.aimKey=k; S.lines.S=arr; }
}
/* holes looked at but never dragged leave an empty entry behind; drop those before saving */
function stratAimsPrune(){
  const A=(STATE.play||{}).aims||{};
  Object.keys(A).forEach(k=>{ const a=A[k]; if(!Array.isArray(a)||!a.some(Boolean)) delete A[k]; });
}
/* how many holes of a course have a line of yours */
function stratAimsCount(c){
  if(!c) return 0; const A=(STATE.play||{}).aims||{}, pre=(c.id||c.name)+'|';
  return Object.keys(A).filter(k=>k.startsWith(pre) && Array.isArray(A[k]) && A[k].some(Boolean)).length;
}
/* Plan my round for the course on screen, with these lines */
function stratPlanRound(){
  if(typeof pmRound==='function' && pmRound()){ toast('A round is open: the plan is frozen until it ends'); return; }
  stratAimsPrune(); saveState();
  window.pmSetupSel=Object.assign({}, window.pmSetupSel||{}, {c:window.stratSel.cIdx});
  pmOpen(); pmPlanOpen(); pmPlanBuild();
}

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
/* THE COURSE PICKER: your courses, then the sample courses not yet in your list (one tap adds
   one), then a way into the importer. The preset list is fetched once at boot by csPresetSync. */
function stratCoursePickHTML(ci){
  const cs=STATE.courses||[], have=new Set(cs.map(c=>c.id));
  const pre=(window.cfPresetCache||[]).filter(p=>p&&p.id&&!have.has(p.id));
  return `<select class="ho-course" onchange="stratPickCourse(this.value)" aria-label="Course">
      <optgroup label="Your courses">${cs.map((c,i)=>`<option value="c:${i}"${i===ci?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('')}</optgroup>
      ${pre.length?`<optgroup label="Add a sample course">${pre.map(p=>`<option value="p:${escapeHtml(p.id)}">+ ${escapeHtml(p.name)}</option>`).join('')}</optgroup>`:''}
      <optgroup label="Elsewhere"><option value="import">+ Import another course…</option></optgroup>
    </select>`;
}
async function stratPickCourse(v){
  v=String(v||'');
  if(v.startsWith('c:')) return stratSetCourse(+v.slice(2));
  if(v==='import'){
    showGroupPage('setup','gpcourses');
    setTimeout(()=>{ const i=document.getElementById('osm-q'); if(i){ i.scrollIntoView({block:'center'}); i.focus(); } }, 60);
    return;
  }
  if(v.startsWith('p:')){
    const id=v.slice(2);
    let list=window.cfPresetCache;
    if(!list){ try{ list=await cfFetchJSON('/preset-courses.json', 15000); window.cfPresetCache=list; }catch(_){} }
    const p=(list||[]).find(x=>x&&x.id===id);
    if(!p){ toast('Could not load that course'); buildHoleOverlay(); return; }
    const cs=cfCourses(); cs.push(JSON.parse(JSON.stringify(p)));
    STATE.coursePresetsSeen=[...new Set([...(STATE.coursePresetsSeen||[]), id])];
    saveState(); stratSetCourse(cs.length-1);
    if(typeof buildCourses==='function') buildCourses();
    toast(`Added ${p.name}`);
  }
}
function stratSetHole(i){ window.stratSel.hIdx=+i; stratClearLines(); stratSaveSel(true); buildHoleOverlay(); }
function stratSetShotNum(n){ window.stratShot.shotNum=Math.max(1,Math.min(SHOT_MAX,+n)); buildHoleOverlay(); }
function stratSetLine(l){ window.stratShot.active=l; buildHoleOverlay(); }
/* Whether the app tells you which line is better. Optimal is always ON SCREEN — that is the
   recommendation and it is computed whether you ask or not — but being scored against it on
   every glance is a different thing, and that is opt-in. Persisted: it is a standing choice
   about how you want to be talked to, not a per-hole one. */
function stratToggleCompare(){
  STATE.strategy=STATE.strategy||{};
  STATE.strategy.compareOptimal=!STATE.strategy.compareOptimal;
  saveState(); buildHoleOverlay();
}
function stratResetAim(){
  const k=stratAnchorKey(); if(k && STATE.play && STATE.play.aims) delete STATE.play.aims[k];
  stratClearLines(); saveState(); buildHoleOverlay();
}
function stratSetPosture(p){
  if(typeof setStrategy==='function') setStrategy('riskPosture',p);
  else { STATE.strategy=STATE.strategy||{}; STATE.strategy.riskPosture=p; saveState(); }
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; buildHoleOverlay();
}
function stratSetTour(field,val){
  STATE.tournament=STATE.tournament||{};
  STATE.tournament[field]= (val===''||val==null) ? null : (field==='target'?parseFloat(val):parseInt(val)||0);
  saveState(); window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; buildHoleOverlay();
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
    ? srForPlayer('tee', holeYd, playerHcpFor('tee'))
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
  /* STROKES GAINED IS MEASURED AGAINST THE BENCHMARK, not against you.
     The shot's outcome — where the ball goes — comes from YOUR clubs and YOUR dispersion; that
     is the player model and it is what "shots left" reports. But strokes gained prices the
     start and the finish on someone else's baseline, by definition: it was SG against the
     golfer's own expectation, which made an ordinary shot read ~0 every time and meant the
     overlay's "SG" and the Approach tab's "SG" were two different quantities under one name.
     The benchmark is the app-wide one chosen in Settings (scratch unless changed). */
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  r.sgBench=bench.short;
  const sgBefore = (onTee && holeYd!=null) ? srForPlayer('tee', holeYd, bench.hcp)
                                            : cfExpectedStrokes(hole,from,bench.hcp);
  const sgAfter = r.sgActual ? cfExpectedStrokes(hole,end,bench.hcp)
                             : stratBenchMean(hole, from, aim, sig, bench.hcp);
  r.sg=(sgBefore!=null && sgAfter!=null) ? (sgBefore-sgAfter-1) : null;
  r.sgFromTee=!!onTee;
  return r;
}
/* The same dispersion pattern as aimScore, priced on a benchmark's baseline instead of the
   golfer's — the "after" half of strokes gained. Kept separate from aimScore because the
   optimiser calls that thousands of times and never needs this; only a displayed shot does. */
function stratBenchMean(hole, from, aim, sig, hcp){
  const s=aimSamples(hole,from,aim,sig); if(!s.length) return null;
  let sum=0, w=0;
  for(let i=0;i<s.length;i++){
    const lie=cfCarryLie(hole, s[i].land, s[i].pt);
    const e=cfExpectedStrokes(hole,s[i].pt,hcp,lie); if(e==null) continue;
    sum+=e*s[i].w; w+=s[i].w;
  }
  return w ? sum/w : null;
}

/* The optimiser's whole path through the hole, tee to green. Cached per hole/posture so
   dragging a user line never re-solves it. */
function stratOChain(hole){
  /* Keyed by the HOLE OBJECT, not by the selected index. The old key was
     "cIdx|hIdx|posture|skill", which is only correct while the hole being solved is the hole
     on screen — the moment anything iterates the course (the round walkthrough does) it
     hands back the selected hole's plan for every hole in turn. */
  const key=stratPosture()+'|'+stratSkillKey()+'|'+(window.stratCacheEpoch||0);
  const hit=STRAT_CHAINS.get(hole);
  if(hit && hit.key===key) return hit.chain;
  const chain=[]; let from={x:hole.tee.x, y:hole.tee.y};
  for(let n=1;n<=SHOT_MAX;n++){
    const res=optimiseShot(hole, from, {posture:stratPosture(), hcp:stratSkill()});
    if(!res){ break; }
    if(res.blocked){ chain.push({n, from, blocked:res.blocked, toPin:res.toPin, lie:res.lie}); break; }
    const aim={x:Math.round(res.best.aim.x), y:Math.round(res.best.aim.y)};
    chain.push({n, from, res, aim});
    from=aim;
  }
  STRAT_CHAINS.set(hole,{key, chain});
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
  const clubs=aimClubs(); if(!clubs.length||!from||!cfPin(hole)) return null;
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
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!cfPin(hole)) return null;
  const clubs=aimClubs(); if(!clubs.length) return null;
  const P=STATE.strategy||{};
  const dx=cfPin(hole).x-from.x, dy=cfPin(hole).y-from.y, L=Math.hypot(dx,dy)||1;
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
    const ax=(p.x-cfPin(hole).x)*ypu, ay=(p.y-cfPin(hole).y)*ypu;
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
   two midpoints IS the local axis. Returned in the tilt sense — positive means the
   fairway runs LEFT as it goes away from you, the same sign a draw's landing tilt carries,
   so the two numbers can simply be compared. */
const FIT_STEP_YD  = 35;    // how far either side of the landing zone to read the axis
const FIT_MAX_DEG  = 20;    // past this the reading is a dogleg corner, not a landing-zone axis
const FIT_TURN_MAX = 12;    // if the axis swings more than this THROUGH the zone, say nothing
const FIT_LEAN     = 0.6;   // lean toward the hole's line; never try to trace it
const FIT_TOL_DEG  = 2;     // below this a fairway is straight enough to call straight

/* The fairway's own axis through the landing zone, in the tilt sense (positive = the
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
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!cfPin(hole)) return null;
  const clubs=aimClubs(); if(!clubs.length) return null;
  const dx=cfPin(hole).x-from.x, dy=cfPin(hole).y-from.y, L=Math.hypot(dx,dy)||1;
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
function stratShotSVG(hole, r, line, n, mode, place, k){
  if(!r||r.blocked) return '';
  /* k scales the LABELS only, for a caller drawing on a closer crop than the Hole Overlay's
     whole-hole view (Play follows the ball, so its field units are larger on screen and the
     overlay's 30-unit labels would be enormous). The shot geometry is never scaled. */
  k=(k>0)?k:(window.stratLabelK>0?window.stratLabelK:1);
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
  const sLat=aimSigmaLat(r.sig.sigmaYd)*(r.sig.latMult||1), sDep=aimSigmaDist(r.sig.sigmaYd)*(r.sig.depthMult||1);
  const ang=Math.atan2(uy,ux)*180/Math.PI+aimPatternAngle(sLat, sDep, aimRhoOf(slant+(r.sig.tiltDeg||0)));
  /* An ANCHORED shot has no dispersion left to draw — the ball is where it is. The ellipse
     gives way to a solid line to the recorded finish, and the dashed intention stays behind
     it at low opacity so the gap between aim and result is the thing you see. */
  /* Labels go ABOVE the aim, or BELOW it when another full label is already above — see
     stratOverlay. Above and below, not left and right: a hole is tall and thin, so there is
     room along it and none across it, and side labels ran off the edge of a phone-width crop. */
  const below=(place==='below');
  const at=end||aim, top=below ? (end?24*k:ry+13*k) : (end?-24*k:-ry-13*k);
  const lbl=(txt,off,size)=>`<text x="${at.x.toFixed(1)}" y="${(at.y+off).toFixed(1)}" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',Arial,sans-serif" font-size="${(size*k).toFixed(1)}" font-weight="700" fill="${col}" stroke="#14351d" stroke-width="${(8*k).toFixed(1)}" paint-order="stroke">${txt}</text>`;
  /* line weights in screen pixels (non-scaling), so a zoomed-in hole is not drawn in marker pen */
  const NS='vector-effect="non-scaling-stroke"';
  let s=`<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${aim.x.toFixed(1)}" y2="${aim.y.toFixed(1)}" stroke="${col}" stroke-width="${dim?1.5:compact?2:2.5}" ${NS} stroke-dasharray="${(15*k).toFixed(1)},${(10*k).toFixed(1)}" opacity="${(op*(end?0.45:0.9)).toFixed(2)}"/>`;
  if(!dim&&!end&&stratLayers().disp) s+=`<g transform="rotate(${ang.toFixed(1)} ${aim.x.toFixed(1)} ${aim.y.toFixed(1)})">
      <ellipse cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
        fill="${col}" fill-opacity="${compact?0.10:0.18}" stroke="${col}" stroke-opacity="${compact?0.6:0.95}" stroke-width="${compact?1.5:2}" ${NS}/></g>`;
  if(end) s+=`<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${col}" stroke-width="${compact?2:3}" ${NS} opacity="${op}"/>
      <circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="${((compact?9:12)*k).toFixed(1)}" fill="${col}" stroke="#14351d" stroke-width="1.5" ${NS}/>`;
  const aimOp=(op*(end?0.55:1)).toFixed(2);
  s+=`<circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="${((dim?5:compact?7:9)*k).toFixed(1)}" fill="none" stroke="#fff" stroke-width="${dim?1.5:2}" ${NS} opacity="${aimOp}"/>
      <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="${(2.5*k).toFixed(1)}" fill="#fff" opacity="${aimOp}"/>`;
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
  if(compact) return s+lbl(head, below?top+30*k:top-8*k, 27);
  /* 36 units apart, not the 30 the font size suggests: the halo stroke adds ~4 units to each
     glyph box, so a gap set to the font size alone leaves the two lines touching. */
  /* 36 units between the two lines either way; below the aim the first line has to clear the
     oval by its own cap height (~30) before it starts. */
  s+=lbl(head, below?top+30*k:top-36*k, 30);
  const tp=end?r.endToPinYd:r.toPinYd, rem=r.sgActual?r.expAfter:r.mean;
  if(tp!=null&&rem!=null) s+=lbl(`${ydNum(tp)} to pin · ${rem.toFixed(2)} rem`, below?top+64*k:top, 27);
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
  /* the shot being edited, in full, on top. When BOTH lines have a full label for this shot
     their aims are usually close — two answers to the same question — and two two-line labels
     centred above two nearby points printed on top of each other. The line whose aim is
     further up the hole keeps its label above; the other goes below its own aim. */
  const act=(chains[S.active]||[])[n-1];
  const other=SHOT_LINES.filter(l=>l!==S.active).map(l=>({l, r:(chains[l]||[])[n-1]})).filter(o=>o.r&&!o.r.blocked);
  const yOf=r=>((r.end||r.aim)||{}).y;
  const both=act&&!act.blocked&&other.length;
  other.forEach(o=>{
    const place = both && yOf(o.r)>yOf(act) ? 'below' : 'above';
    s+=stratShotSVG(hole,o.r,o.l,n,'full',place);
  });
  if(act){
    const place = both && other.some(o=>yOf(o.r)<=yOf(act)) ? 'below' : 'above';
    s+=stratShotSVG(hole,act,S.active,n,'full',place);
  }
  const kb=window.stratLabelK>0?window.stratLabelK:1;
  if(chains.__ball) s+=`<circle cx="${chains.__ball.x}" cy="${chains.__ball.y}" r="${(10*kb).toFixed(1)}" fill="#fff" stroke="#111" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
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
    wrap.innerHTML=`<div class="section-label">Plan <span class="proto-badge">prototype</span></div>
      <div class="lvl-soon-note">Import a course first — see the <b>My Courses</b> tab, where you can pull one from OpenStreetMap or trace it by hand. Then this shows each hole with your dispersion pattern, the recommended line and the alternatives.</div>`;
    return;
  }
  /* First render of the session: restore the remembered hole, or fall back to the first one
     that is actually mapped. Once only — after that the user's clicks own the selection. */
  if(!window.stratSelRestored){ window.stratSelRestored=true; stratRestoreSel(); }
  stratBindAims();
  const ci=Math.min(window.stratSel.cIdx, courses.length-1), course=courses[ci];
  const holes=course.holes||[];
  const hi=Math.min(window.stratSel.hIdx, Math.max(0,holes.length-1)), hole=holes[hi];
  const hOpts=holes.map((h,i)=>`<option value="${i}"${i===hi?' selected':''}>Hole ${h.num||i+1} · par ${h.par||4}</option>`).join('');
  const S=window.stratShot;
  /* ONE TITLE LINE, where there were a section heading, two dropdowns and a caption repeating
     them. ‹ › walk the holes in order; the hole name IS the dropdown, for jumping; the course
     rides in the second line, because it changes once a round and the hole changes eighteen
     times. The sub-tab already says "Hole Overlay", so the heading was saying it twice. */
  const hYd=(hole&&cfHasScale(hole)&&hole.tee&&cfPin(hole))?cfDistYd(hole,hole.tee,hole.pin):null;
  const head=`<div class="ho-title">
      <button type="button" class="ho-nav" onclick="stratStepHole(-1)" aria-label="Previous hole">‹</button>
      <div class="ho-title-main">
        <div class="ho-t1"><select class="ho-hole" onchange="stratSetHole(this.value)" aria-label="Hole">${hOpts}</select>${hYd!=null?`<span class="ho-yd">${fmtYd(hYd)}</span>`:''}</div>
        <div class="ho-t2">${stratCoursePickHTML(ci)}<span class="ho-t2-x" id="ho-t2-x"></span></div>
      </div>
      <button type="button" class="ho-nav" onclick="stratStepHole(1)" aria-label="Next hole">›</button>
    </div>`;
  if(!hole){ wrap.innerHTML=head+`<div class="lvl-soon-note">This course has no holes yet.</div>`; return; }
  if(!cfHasScale(hole) || !hole.tee || !cfPin(hole)){
    wrap.innerHTML=head+`<div class="lvl-soon-note">Hole ${hole.num||hi+1} needs a tee, a pin and a scale before it can be optimised. Holes imported from OpenStreetMap get all three automatically; a hand-traced hole needs the <b>calibrate</b> tool (or just a tee, a pin and the hole yardage).</div>`;
    return;
  }
  window.stratBoxHole=hole;          /* the crop follows the hole on screen */
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
  /* TWO READINGS, NOT TWO MODES.
     Optimal is computed for every shot whether or not anyone asks, so it is simply shown —
     the recommendation for the situation, taking the dispersion pattern into account. Yours
     sits beside it saying what to expect from the shot you have picked. Each card answers the
     five things a decision turns on and no more: how far the shot is, where it most likely
     finishes, what it is worth in strokes gained, what it leaves to the middle of the green,
     and the shots expected from there. Everything else that used to sit here — "if perfect",
     the dispersion gap, a chip per surface — told one of those five again in another
     currency. A shot that finds the fairway 60% of the time IS its dispersion cost, said in a
     unit you can picture. */
  const CARD_LABEL={O:'Optimal', S:'Your shot'};
  const oStep=chain[n-1];
  const oRes=(oStep&&oStep.res)?oStep.res:null;
  const CARD_ORDER=['O','S'];          /* the recommendation reads first; yours answers it */
  const strip=CARD_ORDER.map(l=>{
    const r=shots[l];
    const head=`<span class="ss-ln ln-${l}">${CARD_LABEL[l]}</span><span class="ss-sub">${l}-${n}</span>`;
    if(!r) return `<div class="sh-strip-line">${head}<span class="ss-none">—</span></div>`;
    if(r.blocked) return `<div class="sh-strip-line">${head}<span class="ss-none"><i>${blockedTxt(r)}</i></span></div>`;
    /* WHERE IT FINISHES. The single most likely surface, named, rather than a row of chips
       for every surface it might touch: standing over the ball you want to know what this shot
       usually does, and the tail is what the SG number already prices in. */
    const m=r.lieMix;
    const best=mixOrder.filter(k=>m[k]>0).sort((x,y)=>m[y]-m[x])[0]||'fairway';
    const bestPct=Math.round((m[best]||0)*100);
    const swing=(r.shot.detail&&r.shot.detail!=='full swing')?` ${r.shot.detail}`:'';
    const sg=r.sgActual
      ? `<span class="ss-pair"><b class="ss-sg${r.sg>=0?'':' neg'}">${r.sg>=0?'+':''}${r.sg.toFixed(2)}</b> <span>SG vs ${escapeHtml(r.sgBench||'scratch')}, measured</span></span>`
      : (r.sg!=null?`<span class="ss-pair"><b class="ss-sg${r.sg>=0?'':' neg'}">${r.sg>=0?'+':''}${r.sg.toFixed(2)}</b> <span>SG vs ${escapeHtml(r.sgBench||'scratch')}</span></span>`:'');
    const left=r.sgActual?r.expAfter:r.mean;
    /* the optimiser minimises a RISK-WEIGHTED score, so it can sit a little behind on raw
       average; naming its decision and posture keeps that from reading as a contradiction */
    const postureShort=stratLabel('riskPosture').split(/\s+\u2014\s+| \(/)[0].toLowerCase();
    const why=(l==='O')
      ? `<span class="ss-why" title="The optimiser minimises a risk-weighted score under your posture \u2014 ${escapeHtml(stratLabel('riskPosture').toLowerCase())} \u2014 so it can sit a little behind on raw average to avoid the big miss.">${
          oRes&&oRes.best&&oRes.best.category?escapeHtml(oRes.best.category.toLowerCase()):'best play'} \u00b7 ${escapeHtml(postureShort)}</span>`
      : '';
    return `<div class="sh-strip-line${l==='O'?' is-opt':''}">${head}
      <span class="ss-club">${r.shot.label}${swing}</span>
      <span class="ss-pair"><b>${fmtYd(r.geoYd)}</b> <span>shot</span></span>
      <span class="ss-pair"><b class="mix-ink mix-${best}">${CF_LIE_LABEL[best]}</b> <span>${bestPct}% lands</span></span>
      ${sg}
      <span class="ss-pair"><b>${r.toMidYd!=null?fmtYd(r.toMidYd):'\u2014'}</b> <span>to middle</span></span>
      <span class="ss-pair"><b>${left!=null?left.toFixed(2):'\u2014'}</b> <span>shots left</span></span>
      ${why}</div>`;
  }).join('');
  const table=`<div class="sh-strip">${strip}</div>`;
  /* verdict across the three lines that actually produced a shot */
  const cmpOn=!!(STATE.strategy||{}).compareOptimal;
  const live=SHOT_LINES.filter(l=>shots[l]&&!shots[l].blocked);
  let verdict='';
  if(cmpOn && live.length>1){
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
  /* ---- PIN ROW: which sheet is live, and the two numbers a pin sheet actually gives ----
     A sheet states a cut as paces on and paces from a side, so those are the fields — typed
     straight off the paper — with dragging as the alternative for anyone working from a
     picture. The green's own depth and width sit beside them, because "8 on" means nothing
     without knowing the green is 32 deep. */
  const pinOn=!!S.pinMode;
  const paces=cfPinPaces(hole);
  const prog=stratSheetProgress();
  const key=course.id||course.name;
  const sheets=cfPinSheets(key).sheets||[];
  const activeId=(cfActiveSheet(key)||{}).id||'';
  const cut=!!(cfActiveSheet(key)&&(cfActiveSheet(key).pins||{})[String(hole.num||hi+1)]);
  const sheetSel=`<select class="strat-select" style="max-width:170px" onchange="stratSheetSet(this.value)">
      <option value=""${activeId?'':' selected'}>Middle of the green</option>
      ${sheets.map(s=>`<option value="${s.id}"${s.id===activeId?' selected':''}>${escapeHtml(s.name)}</option>`).join('')}
      <option value="__new">+ New pin sheet…</option>
    </select>`;
  const pinFields = (pinOn&&paces) ? `<div class="pin-fields">
      <label>On<input type="number" step="1" min="0" max="${ydNum(paces.maxDepth)}" value="${ydNum(paces.fromFront)}" oninput="stratSetPinPaces('front',this.value)"></label>
      <label>From left<input type="number" step="1" min="0" max="${ydNum(paces.maxWidth)}" value="${ydNum(paces.fromLeft)}" oninput="stratSetPinPaces('left',this.value)"></label>
      <span class="pin-green-dim">green here: ${ydNum(paces.depth)} deep · ${ydNum(paces.width)} wide ${ydUnit()}${paces.onGreen?'':' · <b class="pin-off">off the green</b>'}</span>
    </div>` : '';
  const pinRow=`<div class="strat-picks sh-pin-row">
      ${sheetSel}
      <button type="button" class="strat-mode-btn${pinOn?' on':''}" onclick="stratPinMode(${pinOn?'false':'true'})" title="${pinOn?'Back to the whole hole':'Zoom to the green and place the cut for this round'}">⛳ ${pinOn?'done':'place pin'}</button>
      ${cut?`<button type="button" class="strat-mode-btn" onclick="stratPinReset()" title="Back to the middle of the green for this hole">↺ middle</button>`:''}
      ${activeId?`<button type="button" class="strat-mode-btn" onclick="stratSheetDelete()" title="Delete this pin sheet">✕ sheet</button>`:''}
      ${prog?`<span class="sh-anchor-hint">${escapeHtml(prog.name)} · ${prog.set}/${prog.holes} holes</span>`:'<span class="sh-anchor-hint">No sheet — playing the middle</span>'}
    </div>${pinFields}`;
  const prefWhy = anchored
    ? `<b class="ln-S">S-${n}</b> is anchored — its strokes gained is measured off where the ball finished, and S-${n+1} plays from there.`
    : dragged
    ? `<b class="ln-S">S-${n}</b> is your own line, saved for this hole: Plan my round plays it. <a href="#" onclick="stratResetAim();return false">Reset</a> to go back to your preferences.`
    : kind==='approach' ? `<b class="ln-S">S-${n}</b> plays your approach preferences: <b>${stratLabel('approachTarget').toLowerCase()}</b>, ${stratLabel('approachDistance').toLowerCase()}.`
    : kind==='tee'      ? `<b class="ln-S">S-${n}</b> plays your tee preferences: <b>${stratLabel('teeTarget').toLowerCase()}</b>, ${stratLabel('teeClub').toLowerCase()}.`
    : kind==='recovery' ? `<b class="ln-S">S-${n}</b> is a punch-out — no preference applies from the trees.`
    : `<b class="ln-S">S-${n}</b> follows your strategy preferences.`;
  /* ---- COVER NUMBERS: what it takes to fly what is in the way ----
     The yardage to the flag is not the number a golfer needs over a fronting bunker — the
     cover number is. Shown for the shot being edited, with what this club actually carries,
     because "168 to clear" only means something next to "you carry 163". */
  const coverRow=(function(){
    const r=shots.S;
    if(!r||r.blocked||!r.from||!r.aim) return '';
    const cov=cfCoverNumbers(hole, r.from, r.aim).filter(c=>c.cover>8 && !c.inside);
    if(!cov.length) return '';
    const shot=approachShotName(r.sig.sigmaYd);
    const p=(shot&&shot.id&&typeof perf==='function')?perf(shot.id):null;
    const carry=(p&&p.carry)?p.carry*Math.max(0.3,Math.min(1.2,(r.sig.sigmaYd)/(p.total||p.carry))):null;
    const items=cov.slice(0,3).map(c=>{
      const clears=(carry!=null)&&(carry>=c.cover);
      const gap=(carry!=null)?carry-c.cover:null;
      return `<span class="cv-item${carry==null?'':clears?' ok':' short'}">
        <b>${ydNum(c.cover)}</b> to clear the ${c.label}
        <i>starts ${ydNum(c.starts)}${gap==null?'':clears?` · ${ydNum(gap)} spare`:` · ${ydNum(-gap)} short`}</i></span>`;
    }).join('');
    return `<div class="cv-row"><span class="cv-lbl">Cover</span>${items}${
      carry!=null?`<span class="cv-carry">${shot.label} carries <b>${fmtYd(carry)}</b></span>`:''}</div>`;
  })();
  /* Taken off at Mark's call for clutter, and back now as LAYERS rather than permanent rows:
     cover numbers (Cover) and the pin-sheet row (Pin). Still built and exported but not shown:
     the shape-fit sentence, the strategy-preference caption (prefWhy), and the round and
     pin-sheet tables (stratRoundTable, stratPinSheetGrid).

     ROTATION, checked and set aside: rotating each hole so tee-to-pin runs up the screen was
     the obvious fix for a map that was mostly empty green, but every OSM-imported hole is
     ALREADY drawn that way (tee-to-pin at 0 degrees on all 54 holes of the three sample
     courses). The empty green came from cropping a long, thin hole into a near-square box;
     stratMapSize fixes that by matching the crop to the screen. Rotation would only help a
     hand-traced hole drawn at an angle. If that becomes common it is one transform in
     renderHoleSVG, counter-rotated labels and flag, and the inverse in stratDragInit's ptOf. */
  /* ---- THE LAYOUT: title, layers, map, sheet ----
     Measured first, so the crop is padded to the box it is about to be drawn in. */
  const size=stratMapSize(wrap);
  const L=stratLayers();
  const open=!size.phone || !!window.stratSheetOpen;
  /* second title line: the pin, then where the ball is */
  /* Short enough that course, pin and ball fit one line on a phone — the long form wrapped and
     left a separator dangling at the start of the second line. */
  const pinTxt = (cut&&paces) ? `pin ${ydNum(paces.fromFront)} on, ${ydNum(paces.fromLeft)} left`
               : prog ? `${escapeHtml(prog.name)}: middle` : 'pin: middle';
  const t2x = `${pinTxt}${ballWhere}`;   /* sits beside the course picker, or under it on a phone */
  const title = head.replace('<span class="ho-t2-x" id="ho-t2-x"></span>', `<span class="ho-t2-x">${t2x}</span>`);
  const layers=`<div class="ho-layers ho-float-bl" role="group" aria-label="Map layers">${STRAT_LAYERS.filter(l=>l.key!=='photo'||(typeof imgKey==='function'&&(imgKey()||window.sgImageryUrlOverride))&&hole.geo).map(l=>
      `<button type="button" class="ho-chip${L[l.key]?' on':''}" aria-pressed="${!!L[l.key]}" onclick="stratToggleLayer('${l.key}')">${l.label}</button>`).join('')}</div>`;
  /* The stepper: which shot of the plan you are looking at. Not a tap on the map — any touch
     there is an aim drag, and a tap that sometimes selects and sometimes aims is worse than a
     row of three buttons. */
  const stepper=`<div class="ho-steps" role="group" aria-label="Shot"><span class="ho-steps-k">Shot</span>${Array.from({length:maxShot},(_,i)=>i+1).map(i=>
      `<button type="button" class="ho-step${i===n?' on':''}" onclick="stratSetShotNum(${i})" aria-label="Shot ${i}" aria-pressed="${i===n}">${i}</button>`).join('')}</div>`;
  /* THE ANSWER, in two lines: what to hit and what it leaves, for each plan. This is the whole
     sheet when it is collapsed — the rest is the working, one tap away. */
  const sumLine=l=>{
    const r=shots[l];
    const nm = l==='O' ? 'Optimal' : 'Yours';
    if(!r) return `<div class="ho-sum-line ln-${l}"><span class="ho-sum-k">${nm}</span><span class="ho-sum-v">—</span></div>`;
    if(r.blocked) return `<div class="ho-sum-line ln-${l}"><span class="ho-sum-k">${nm}</span><span class="ho-sum-v"><i>${blockedTxt(r)}</i></span></div>`;
    const left=r.sgActual?r.expAfter:r.mean;
    return `<div class="ho-sum-line ln-${l}"><span class="ho-sum-k">${nm}</span>
      <span class="ho-sum-club">${r.shot.label}</span>
      <span class="ho-sum-v">${fmtYd(r.geoYd)}</span>
      <span class="ho-sum-left">${left!=null?left.toFixed(2):'—'} <i>left</i></span></div>`;
  };
  const sheetHead=`<div class="ho-sheet-head">
      ${stepper}
      <div class="ho-sheet-ctl">
        <button type="button" class="ho-icon${cmpOn?' on':''}" onclick="stratToggleCompare()" title="${cmpOn?'Stop scoring your line against the optimal one':'Score your line against the optimal one'}" aria-label="Compare" aria-pressed="${cmpOn}">⇄</button>
        <button type="button" class="ho-icon" onclick="stratResetAim()" title="Reset this hole to your strategy preferences" aria-label="Reset">↺</button>
        <button type="button" class="ho-icon ho-plan" onclick="stratPlanRound()" title="Build the round plan for this course in Play, with the lines you have dragged">Round plan${(()=>{ const n=stratAimsCount(course); return n?` <b>${n}</b>`:''; })()}</button>
        ${size.phone?`<button type="button" class="ho-expand" onclick="stratToggleSheet()" aria-expanded="${open}" aria-label="${open?'Collapse':'Expand'} details">${open?'▾':'▴'}</button>`:''}
      </div>
    </div>`;
  const detail=`<div class="ho-detail">
      ${table}
      ${verdict?`<div class="sh-below-notes">${verdict}</div>`:''}
      ${L.cover&&coverRow?coverRow:''}
      ${anchorRow}
    </div>`;
  wrap.classList.toggle('ho-phone', size.phone);
  /* labels and markers at a constant size on screen, whatever the zoom (stratShotSVG's k) */
  const vbNow=stratViewBox();
  window.stratLabelK = 12/(30*(size.w/vbNow.w));
  const zoomed=window.stratView.z>1.02;
  const zoomCtl=`<div class="ho-zoom ho-float-br" role="group" aria-label="Zoom">
      <button type="button" onclick="stratZoomBy(1.6)" aria-label="Zoom in">+</button>
      <button type="button" onclick="stratZoomBy(1/1.6)" aria-label="Zoom out"${zoomed?'':' disabled'}>−</button>
      ${zoomed?`<button type="button" onclick="stratResetView()" aria-label="Fit the hole" title="Fit the hole">⤢</button>`:''}
    </div>`;
  wrap.innerHTML=title+`
    ${L.pin?`<div class="ho-pin">${pinRow}</div>`:''}
    <div class="strat-hole-grid">
      <div class="strat-hole-map" style="width:${size.w}px">${renderHoleSVG(hole,{viewBox:vbNow, pxW:size.w, overlay:`<g id="strat-overlay">${stratOverlay(hole,chains,n)}</g>`})}${layers}${zoomCtl}${typeof imgAttrHTML==='function'?imgAttrHTML(hole):''}</div>
      <div class="sh-side ho-sheet${open?' open':''}">
        ${sheetHead}
        ${size.phone&&!open?`<div class="ho-sum" onclick="stratToggleSheet()">${['O','S'].map(sumLine).join('')}</div>`:''}
        ${open?detail:''}
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
  let mode=null, last=0, panFrom=null, anchorDirty=false, aimDirty=false;
  /* TOUCH: fingers down, by pointer id. A single touch waits ('pending') until it moves or
     lifts before it aims, so a second finger arriving makes it a PINCH instead of moving the
     shot. A pinch zooms about the point between the fingers and pans with them; mid-pinch only
     the viewBox changes (cheap), and the map is rebuilt once when the last finger lifts. */
  const fingers=new Map(); let pinch=null;
  const mid=()=>{ const [a,b]=[...fingers.values()]; return {clientX:(a.x+b.x)/2, clientY:(a.y+b.y)/2, d:Math.hypot(a.x-b.x,a.y-b.y)||1}; };
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
    /* In pin mode the drag is placing the flag, not aiming a shot. */
    if(S.pinMode){ if(typeof stratSetPinAt==='function') stratSetPinAt(p); return; }
    if(S.active==='O') return;                       // the optimiser's line is not draggable
    /* One drag target at a time, and the panel says which: an anchored shot's finish is the
       thing you are specifying, so the drag moves that; release the anchor to aim again. */
    const anc=stratAnchors();
    if(anc[n-1]){
      anc[n-1]=p; anchorDirty=true; aimDirty=true;
      /* the finish moved, so any aim drawn for a LATER shot came off a position that no
         longer exists — but later ANCHORS are records of what happened, and stand. */
      const arr=S.lines[S.active]||[]; arr.length=Math.min(arr.length,n);
    } else {
      const arr=S.lines[S.active]||(S.lines[S.active]=[]);
      arr[n-1]=p; arr.length=n;                      // later shots stemmed from the old spot
      aimDirty=true;
    }
    buildHoleOverlay();
  };
  const panBy=(e)=>{
    if(!panFrom) return;
    const now=Date.now(); if(now-last<50) return; last=now;
    const svg=wrap.querySelector('.strat-hole-map svg'); if(!svg) return;
    const r=svg.getBoundingClientRect(); const v=window.stratView;
    /* Step through the CROP, not the whole field. The map is framed on the hole now, so
       scaling a drag by the 1000x1400 field made the picture slide faster than the finger. */
    const B=stratHoleBox(window.stratBoxHole);
    v.cx-=(e.clientX-panFrom.x)/r.width*(B.w/v.z);
    v.cy-=(e.clientY-panFrom.y)/r.height*(B.h/v.z);
    panFrom={x:e.clientX,y:e.clientY};
    buildHoleOverlay();
  };
  wrap.addEventListener('pointerdown',e=>{
    if(!e.target.closest||!e.target.closest('.strat-hole-map')) return;
    if(e.target.closest('button')) return;              // the chips and zoom buttons on the map
    if(e.pointerType==='touch'){
      fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
      if(fingers.size>=2){
        const m=mid(); mode='pinch'; pinch={d0:m.d, z0:window.stratView.z, f:ptOf(m)};
        e.preventDefault(); return;
      }
      mode='pending'; panFrom={x:e.clientX,y:e.clientY}; e.preventDefault(); return;
    }
    /* Right-click pans, as in the D-Plane viewer. Left-click places the shot, so the right
       button had no job here, and a zoomed-in map with no way to move is a map of one corner.
       Middle-drag still pans too, for anyone already used to it. */
    if(e.pointerType==='mouse'&&(e.button===1||e.button===2)){ mode='pan'; panFrom={x:e.clientX,y:e.clientY}; }
    else { if(window.stratShot.active==='O'&&!window.stratShot.pinMode) return; mode='aim'; }
    try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    if(mode==='aim') setAim(e,true);
    e.preventDefault();
  });
  wrap.addEventListener('pointermove',e=>{
    if(fingers.has(e.pointerId)) fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(mode==='pinch'){
      if(fingers.size<2||!pinch||!pinch.f) return;
      const now=Date.now(); if(now-last<30) return; last=now;
      const svg=wrap.querySelector('.strat-hole-map svg'); if(!svg) return;
      const r=svg.getBoundingClientRect(), m=mid(), v=window.stratView, B=stratHoleBox(window.stratBoxHole);
      v.z=Math.max(STRAT_ZMIN, Math.min(STRAT_ZMAX, pinch.z0*m.d/pinch.d0));
      const w=B.w/v.z, h=B.h/v.z, fx=(m.clientX-r.left)/r.width, fy=(m.clientY-r.top)/r.height;
      v.cx=pinch.f.x-fx*w+w/2; v.cy=pinch.f.y-fy*h+h/2;
      const vb=stratViewBox(); svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
      return;
    }
    if(mode==='pending'){
      if(Math.hypot(e.clientX-panFrom.x, e.clientY-panFrom.y)<6) return;
      if(window.stratShot.active==='O'&&!window.stratShot.pinMode){ mode=null; return; }
      mode='aim'; panFrom=null; setAim(e,true); return;
    }
    if(mode==='aim') setAim(e,false); else if(mode==='pan') panBy(e);
  });
  const end=e=>{
    fingers.delete(e.pointerId);
    if(mode==='pinch'){ if(fingers.size===0){ mode=null; pinch=null; buildHoleOverlay(); } return; }
    /* a touch that never moved is a tap: the shot goes where it was tapped */
    if(mode==='pending'){ mode=(e.type==='pointerup'&&!(window.stratShot.active==='O'&&!window.stratShot.pinMode))?'aim':null; panFrom=null; }
    if(!mode) return; if(mode==='aim') setAim(e,true); mode=null; panFrom=null;
    if(anchorDirty||aimDirty){ anchorDirty=false; aimDirty=false; stratAimsPrune(); saveState(); } };
  /* ...and the browser menu must not open on top of the pan it just started. */
  wrap.addEventListener('contextmenu',e=>{ if(e.target.closest&&e.target.closest('.strat-hole-map')) e.preventDefault(); });
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

Object.assign(window, { stratScrollToTitle, stratMapSize, stratStepHole, stratLayers, stratToggleLayer, stratToggleSheet, STRAT_LAYERS, STRAT_PHONE_MAX,
  stratBenchMean, stratSkillKey, stratHcpNum,
  AIM_Z, AIM_W, AIM_CI90, AIM_LAT_SWEEP, AIM_LAT_STEP, AIM_NODES, aimSetNodes,
  aimSigmaLat, aimSigmaDist, aimSamples, aimObjective, aimTail, aimScore, aimClubs,
  optimiseAim, stratSetCourse, stratSetHole, buildHoleOverlay,
  APPROACH_LIE, approachSituation, approachLieCostYd, approachShotName, optimiseApproach,
  AIM_AVOID, AIM_AVOID_EPS, aimAvoidance, optimiseShot, shotScoreFor, stratPostureTable,
  SHOT_LAT_MAX, SHOT_LAT_STEP, SHOT_RECOVERY_MAX_YD, SHOT_POSTURES, SHOT_POSTURE_LABEL,
  stratSetPosture, SHOT_HOLE_SD, SHOT_POS_SD, SHOT_TARGET_MIN_GAIN, normCdf, tournamentCtx, shotZ,
  stratTourInputs, stratSetTour,
  stratSkill, stratViewBox, stratHoleBox, STRAT_BOX_RATIO, stratResetView,
  SHOT_COL, SHOT_LINES, SHOT_LABEL, SHOT_MAX, stratPosture, stratCurrent, stratGreenMid,
  stratClearLines, stratResetAim, stratSetShotNum, stratSetLine,
  stratScoreShot, stratOChain, stratBallFor, stratLineAim,
  PREF_TEE_SIDE, PREF_GRN_SIDE, PREF_COMFORT_YD, PREF_FW_WINDOW,
  stratSpan, stratPrefKind, stratPrefAim, stratNaiveAim, aimPatternAngle, aimRhoOf,
  aimLandingTilt, aimClubShape, aimShapeReset, aimTiltFor,
  FIT_STEP_YD, FIT_MAX_DEG, FIT_TURN_MAX, FIT_LEAN, FIT_TOL_DEG, stratFairwayTilt, stratShapeFit,
  stratAnchorKey, stratAnchors, stratAnchorAt, stratAnchorCount, stratToggleAnchor, stratClearAnchors,
  stratSaveSel, stratRestoreSel, stratHoleReady, stratHoleScore, stratBestCourseIdx,
  stratToggleCompare, stratZoomGreen, stratPinMode, stratSetPinAt, stratSetPinPaces, stratPinReset,
  stratPinSheetHoles, stratPinZone, stratPinThumbClick, stratSheetPaces, stratSheetClearHole, stratPinSheetGrid,
  ROUND_METHODS, ROUND_RES, stratRoundHole, stratRound, stratRoundTable,
  stratSheetSet, stratSheetDelete, stratSheetProgress,
  stratShotSVG, stratOverlay, stratDragInit, stratZoomBy, stratCoursePickHTML, stratPickCourse, STRAT_CORRIDOR_YD, STRAT_MISS_YD, STRAT_END_YD, stratAimsFor, stratBindAims, stratAimsPrune, stratAimsCount, stratPlanRound
});
