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

/* Weighted landing samples (field units) for a shot from `from` aimed at `aim`.
   The error ellipse is lateral × depth, tilted DISP_SLANT° long-left / short-right.
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
  const th=(window.DISP_SLANT||15)*Math.PI/180, ct=Math.cos(th), st=Math.sin(th);
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
   nearest full club when the distance is outside that engine's window. */
function approachShotName(effYd){
  if(typeof calcSuggestions==='function'){
    const s=calcSuggestions(Math.round(effYd));
    if(s&&s.length){
      const sw=s[0].sw.key==='full'?'full':s[0].sw.key==='tq'?'¾':'½';
      return { label:s[0].club.label, detail:sw+' swing', effort:s[0].effort };
    }
  }
  let best=null,bd=1e9;
  aimClubs().forEach(c=>{ const d=Math.abs(c.total-effYd); if(d<bd){bd=d;best=c;} });
  return best?{label:best.label, detail:'full swing', effort:null}:{label:'—',detail:'',effort:null};
}
const APPROACH_LAT = 24, APPROACH_LONG = 12, APPROACH_SHORT = 24, APPROACH_STEP = 4;

/* Optimise an approach played from `from`. Returns the best aim SPOT relative to the pin
   plus the shot that plays it, or a {blocked} reason when there is nothing to optimise. */
function optimiseApproach(hole, from, opts){
  opts=opts||{};
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!hole.pin) return null;
  const lie=cfLieAt(hole,from);
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
      const r=aimScore(hole,from,aim,hcp,posture,{sigmaYd:eff,latMult:mult.lat,depthMult:mult.depth});
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
  const lie=cfLieAt(hole,from);
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
      const r=aimScore(hole,from,aim,hcp,posture,{sigmaYd:eff,latMult:mult.lat,depthMult:mult.depth});
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
  const naive=aimScore(hole,from,naiveAim,hcp,posture,{sigmaYd:naiveAlong+cost,latMult:mult.lat,depthMult:mult.depth});
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
window.stratShot = window.stratShot || { shotNum:1, lines:{A:[],B:[]}, active:'A' };
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
const SHOT_LINES = ['A','B','O'];
const SHOT_COL = { A:'#ffd24a', B:'#5ad1ff', O:'#79e08d' };
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
function stratClearLines(){ window.stratShot.lines={A:[],B:[]}; window.stratShot.shotNum=1; window.stratOptCache=null; }
function stratSetCourse(i){ window.stratSel.cIdx=+i; window.stratSel.hIdx=0; stratClearLines(); buildHoleOverlay(); }
function stratSetHole(i){ window.stratSel.hIdx=+i; stratClearLines(); buildHoleOverlay(); }
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

/* Score ONE shot: played from `from`, aimed at `aim`. Mode-free — the lie under the ball
   decides the distance cost and the dispersion penalty, wherever on the hole it sits. */
function stratScoreShot(hole, from, aim){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from) return null;
  const lie=cfLieAt(hole,from);
  const toPinFrom=cfDistToPinYd(hole,from);
  if(cfIsPenalty(lie)) return {blocked:'penalty', lie, from, toPinFrom};
  if(lie==='green')    return {blocked:'putt', lie, from, toPinFrom};
  if(!aim) return null;
  const geo=Math.hypot(aim.x-from.x,aim.y-from.y)*ypu;
  if(geo<8) return {blocked:'tap', lie, from, toPinFrom};
  const mult=APPROACH_LIE[lie]||APPROACH_LIE.fairway, cost=approachLieCostYd(lie);
  const sig={sigmaYd:geo+cost, latMult:mult.lat, depthMult:mult.depth};
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
  r.sg=(r.expBefore!=null)?(r.expBefore-r.mean-1):null;
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
    const arr=window.stratShot.lines[line]||[];
    if(arr[n-2]) return arr[n-2];
  }
  const c=stratOChain(hole), prev=c[n-2];
  return (prev&&prev.aim)?prev.aim:null;
}
/* The aim for shot n on a line. O uses the optimiser's chain. An unset A/B shot must be
   re-solved from THAT LINE'S OWN position, not inherited from O — a line that drove into
   the trees cannot play O's approach, and inheriting it proposed a 188-yard blast out of a
   wood. A defaults to the optimiser's answer from where it actually lies; B defaults to
   straight at the flag, capped both by what the player can hit and by what the lie allows. */
function stratLineAim(hole, line, n){
  const c=stratOChain(hole), step=c[n-1];
  if(line==='O') return (step&&step.aim)?step.aim:null;
  const arr=window.stratShot.lines[line]||[];
  if(arr[n-1]) return arr[n-1];
  const from=stratBallFor(hole,line,n); if(!from||!hole.pin) return null;
  if(line==='A'){
    const r=optimiseShot(hole, from, {posture:stratPosture(), hcp:stratSkill()});
    return (r&&!r.blocked)?{x:Math.round(r.best.aim.x), y:Math.round(r.best.aim.y)}:null;
  }
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return null;
  const dx=hole.pin.x-from.x, dy=hole.pin.y-from.y, L=Math.hypot(dx,dy)||1;
  const clubs=aimClubs(); if(!clubs.length) return null;
  const longest=Math.max.apply(null, clubs.map(x=>x.total));
  const lie=cfLieAt(hole,from);
  const cap=cfIsRecovery(lie)?SHOT_RECOVERY_MAX_YD:longest;   // no full shots out of trees
  const d=Math.min(L*ypu, longest, cap);
  return {x:Math.round(from.x+dx/L*(d/ypu)), y:Math.round(from.y+dy/L*(d/ypu))};
}

/* One shot drawn on the hole: line, dispersion ellipse, aim marker, yardages. */
function stratShotSVG(hole, r, line, n, dim){
  if(!r||r.blocked) return '';
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return '';
  const col=SHOT_COL[line], from=r.from, aim=r.aim;
  const dx=aim.x-from.x, dy=aim.y-from.y, L=Math.hypot(dx,dy)||1;
  const ux=-dy/L, uy=dx/L;
  const rx=(aimSigmaLat(r.sig.sigmaYd)*(r.sig.latMult||1)*AIM_CI90)/ypu;
  const ry=(aimSigmaDist(r.sig.sigmaYd)*(r.sig.depthMult||1)*AIM_CI90)/ypu;
  const ang=Math.atan2(uy,ux)*180/Math.PI+(window.DISP_SLANT||15);
  const op=dim?0.4:1;
  const lbl=(txt,off,size)=>dim?'':`<text x="${aim.x.toFixed(1)}" y="${(aim.y+off).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${size}" font-weight="700" fill="${col}" stroke="#14351d" stroke-width="8" paint-order="stroke">${txt}</text>`;
  return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${aim.x.toFixed(1)}" y2="${aim.y.toFixed(1)}" stroke="${col}" stroke-width="${dim?2:3.5}" stroke-dasharray="14,10" opacity="${op*0.9}"/>
    ${dim?'':`<g transform="rotate(${ang.toFixed(1)} ${aim.x.toFixed(1)} ${aim.y.toFixed(1)})">
      <ellipse cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
        fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-opacity="0.95" stroke-width="3.5"/></g>`}
    <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="${dim?5:9}" fill="none" stroke="#fff" stroke-width="${dim?2:3}" opacity="${op}"/>
    <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="3" fill="#fff" opacity="${op}"/>
    ${lbl(`${line}-${n} · ${r.shot.label} · ${Math.round(r.geoYd)} yd`, -ry-20, 31)}
    ${r.toPinYd!=null?lbl(`${Math.round(r.toPinYd)} to pin${r.toMidYd!=null?' · '+Math.round(r.toMidYd)+' to mid':''}`, ry+44, 27):''}`;
}
function stratOverlay(hole, shots, n){
  const S=window.stratShot;
  let s='';
  /* the optimal line's earlier shots, faint, so the path so far is visible */
  const c=stratOChain(hole);
  for(let i=0;i<n-1 && i<c.length;i++){
    const st=c[i]; if(!st||!st.res) continue;
    s+=stratShotSVG(hole, st.res.best.from?st.res.best:Object.assign({},st.res.best,{from:st.from, aim:st.aim, sig:{sigmaYd:st.res.best.effYd, latMult:st.res.mult.lat, depthMult:st.res.mult.depth}, shot:st.res.best.shot, geoYd:st.res.best.geoYd, toPinYd:null}), 'O', st.n, true);
  }
  SHOT_LINES.forEach(l=>{ if(l!==S.active && shots[l]) s+=stratShotSVG(hole,shots[l],l,n,false); });
  if(shots[S.active]) s+=stratShotSVG(hole,shots[S.active],S.active,n,false);   // active on top
  const ball=shots.__ball;
  if(ball) s+=`<circle cx="${ball.x}" cy="${ball.y}" r="13" fill="#fff" stroke="#111" stroke-width="3"/>`;
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
  const ci=Math.min(window.stratSel.cIdx, courses.length-1), course=courses[ci];
  const holes=course.holes||[];
  const hi=Math.min(window.stratSel.hIdx, Math.max(0,holes.length-1)), hole=holes[hi];
  const cOpts=courses.map((c,i)=>`<option value="${i}"${i===ci?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('');
  const hOpts=holes.map((h,i)=>`<option value="${i}"${i===hi?' selected':''}>Hole ${h.num||i+1} · par ${h.par||4}</option>`).join('');
  const S=window.stratShot;
  const head=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
    <div class="chain-caption" style="margin-top:4px">A hole is a sequence, not one decision. <b class="ln-O">Line O</b> is the optimiser's path through it; <b class="ln-A">A</b> and <b class="ln-B">B</b> are yours. Pick a shot number and a line, then drag anywhere on the hole — <b>A-2</b> is the second shot played from wherever <b>A-1</b> finished.</div>
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
  const maxShot=Math.max(1, Math.min(SHOT_MAX, chain.length));
  const n=Math.min(S.shotNum, maxShot); S.shotNum=n;
  const pct=v=>Math.round(v*100);
  const mixOrder=['fairway','green','rough','sand','trees','water','oob'];
  const mixHTML=m=>mixOrder.filter(k=>m[k]>0.004).map(k=>
    `<span class="mix-chip mix-${k}">${CF_LIE_LABEL[k]} ${pct(m[k])}%</span>`).join('');

  /* score every line's shot n */
  const shots={};
  SHOT_LINES.forEach(l=>{
    const from=stratBallFor(hole,l,n), aim=stratLineAim(hole,l,n);
    shots[l]= from ? stratScoreShot(hole, from, aim) : null;
  });
  shots.__ball = (shots[S.active]&&shots[S.active].from) || stratBallFor(hole,S.active,n);

  const holeYd=cfDistYd(hole,hole.tee,hole.pin);
  const shotBtns=Array.from({length:maxShot},(_,i)=>i+1).map(i=>
    `<button type="button" class="strat-pick${i===n?' active':''}" onclick="stratSetShotNum(${i})">Shot ${i}</button>`).join('');
  const lineBtns=SHOT_LINES.map(l=>
    `<button type="button" class="strat-pick${l===S.active?' active':''}" style="--pick:${SHOT_COL[l]}" onclick="stratSetLine('${l}')">${l}${l==='O'?' (best)':''}</button>`).join('');

  /* One table, metrics down the side and the three lines across — far less vertical space
     than three stacked cards, and it lines the numbers up for comparison, which is the
     whole point. Penalty risk is NOT a row: it already lives in the outcome badges
     alongside fairway, rough and bunker, where it belongs. */
  const CHIP_SHORT={fairway:'FW',green:'GRN',rough:'RGH',sand:'SND',trees:'TRE',water:'PEN',oob:'OB'};
  const chipsFor=m=>mixOrder.filter(k=>m[k]>0.004)
    .map(k=>`<span class="mix-chip mix-${k}">${CHIP_SHORT[k]} ${pct(m[k])}</span>`).join('');
  const blockedTxt=r=> r.blocked==='putt' ? `${Math.round((r.toPinFrom||0)*3)} ft putt`
      : r.blocked==='penalty' ? 'take relief' : r.blocked==='tap' ? 'tap-in' : 'no shot';
  const TBL_ROWS=[
    ['Club',        r=>`<b>${r.shot.label}</b>${r.shot.detail?` <span class="tsub">${r.shot.detail}</span>`:''}`],
    ['Length',      r=>Math.round(r.geoYd)+' yd'],
    ['Plays',       r=>r.lieCost?Math.round(r.playsYd)+' yd':'—', 'lieCost'],
    ['From tee',    r=>r.fromTeeYd!=null?Math.round(r.fromTeeYd):'—'],
    ['To pin',      r=>r.toPinYd!=null?Math.round(r.toPinYd):'—'],
    ['To middle',   r=>r.toMidYd!=null?Math.round(r.toMidYd):'—'],
    ['Exp · on target', r=>r.expAtAim!=null?r.expAtAim.toFixed(2):'—'],
    ['Exp · remaining', r=>r.mean.toFixed(2), null, 'key'],
    ['Strokes gained',  r=>r.sg==null?'—':`<span class="${r.sg>0.005?'sg-pos':r.sg<-0.005?'sg-neg':''}">${r.sg>0?'+':''}${r.sg.toFixed(2)}</span>`, null, 'key']
  ];
  const anyLieCost=SHOT_LINES.some(l=>shots[l]&&!shots[l].blocked&&shots[l].lieCost);
  const th=SHOT_LINES.map(l=>`<th class="ln-${l}${l===S.active?' on':''}">${l}-${n}${l==='O'?'<span class="tsub"> best</span>':''}</th>`).join('');
  const body=TBL_ROWS.filter(row=>row[2]!=='lieCost'||anyLieCost).map(row=>{
    const cells=SHOT_LINES.map(l=>{
      const r=shots[l];
      const cls=(l===S.active?' class="on"':'');
      if(!r) return `<td${cls}>—</td>`;
      if(r.blocked) return `<td${cls}>${row[0]==='Club'?`<i>${blockedTxt(r)}</i>`:'—'}</td>`;
      return `<td${cls}>${row[1](r)}</td>`;
    }).join('');
    return `<tr class="${row[3]==='key'?'sh-tbl-key':''}"><th scope="row">${row[0]}</th>${cells}</tr>`;
  }).join('');
  const chipRow=`<tr class="sh-tbl-chips"><th scope="row">Outcome</th>${
    SHOT_LINES.map(l=>{const r=shots[l];
      return `<td${l===S.active?' class="on"':''}>${(r&&!r.blocked)?chipsFor(r.lieMix):'—'}</td>`;}).join('')}</tr>`;
  const table=`<table class="sh-tbl"><thead><tr><th></th>${th}</tr></thead><tbody>${body}${chipRow}</tbody></table>`;
  /* verdict across the three lines that actually produced a shot */
  const live=SHOT_LINES.filter(l=>shots[l]&&!shots[l].blocked);
  let verdict='';
  if(live.length>1){
    /* Compare every line to the BEST, not to the runner-up — with two lines tied at the top
       a runner-up comparison reports "level" while a third sits 0.7 strokes adrift. */
    const sorted=live.slice().sort((a,b)=>shots[a].mean-shots[b].mean);
    const bestMean=shots[sorted[0]].mean;
    const tied=sorted.filter(l=>shots[l].mean-bestMean<0.005);
    const worse=sorted.filter(l=>shots[l].mean-bestMean>=0.005);
    const tag=l=>`<b class="ln-${l}">${l}-${n}</b>`;
    verdict = worse.length===0
      ? `<div class="sh-gain">These lines are level on expected strokes.</div>`
      : `<div class="sh-gain">${tied.map(tag).join(' and ')} ${tied.length>1?'are':'is'} best${
          worse.map(l=>` · ${tag(l)} costs <b>+${(shots[l].mean-bestMean).toFixed(2)}</b>`).join('')}</div>`;
  }
  const ballLie=shots.__ball?cfLieAt(hole,shots.__ball):null;
  const oStep=chain[n-1];
  const oRes=(oStep&&oStep.res)?oStep.res:null;
  wrap.innerHTML=head+`
    <div class="strat-hole-grid">
      <div class="strat-hole-map">${renderHoleSVG(hole,{viewBox:stratViewBox(), overlay:`<g id="strat-overlay">${stratOverlay(hole,shots,n)}</g>`})}</div>
      <div class="strat-hole-panel">
        <div class="sh-head">Hole ${hole.num||hi+1} · par ${hole.par||4} · ${Math.round(holeYd)} yd${ballLie?` · ball in the ${CF_LIE_LABEL[ballLie].toLowerCase()}`:''}</div>
        <div class="strat-picks">${shotBtns}</div>
        <div class="strat-picks">${lineBtns}<button type="button" class="strat-mode-btn" onclick="stratResetAim()">↺ reset</button></div>
        ${oRes&&oRes.best.category?`<div class="sh-cat">${oRes.best.category}</div>`:''}
        ${table}
        ${verdict}
        <div class="sh-note">Dragging moves <b>${S.active}-${n}</b> · scroll to zoom, middle-drag to pan${window.stratView.z>1.01?` · <a href="#" onclick="stratResetView();return false">reset view</a>`:''}<br>Strokes gained is measured against a <b>${(STRAT_SKILLS.find(s=>s[0]===String((STATE.strategy||{}).skillHcp??''))||STRAT_SKILLS[0])[1]}</b> baseline.</div>
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
  let mode=null, last=0, panFrom=null;
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
    const S=window.stratShot;
    if(S.active==='O') return;                       // the optimiser's line is not draggable
    const arr=S.lines[S.active]||(S.lines[S.active]=[]);
    arr[S.shotNum-1]=p; arr.length=S.shotNum;        // later shots stemmed from the old spot
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
  const end=e=>{ if(!mode) return; if(mode==='aim') setAim(e,true); mode=null; panFrom=null; };
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
  SHOT_COL, SHOT_LINES, SHOT_MAX, stratPosture, stratCurrent, stratGreenMid,
  stratClearLines, stratResetAim, stratSetShotNum, stratSetLine,
  stratScoreShot, stratOChain, stratBallFor, stratLineAim,
  stratShotSVG, stratOverlay, stratDragInit
});
