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

/* ---------- overlay + panel: TWO shots, side by side ----------
   Rather than measuring one aim against "the recommendation", place two and compare them
   directly. Shot 1 starts on the optimiser's answer and Shot 2 straight at the flag, then
   drag either one. In approach mode both shots are played from the same ball, which can
   itself be dragged. */
window.stratSel = window.stratSel || { cIdx:0, hIdx:0 };
window.stratShot = window.stratShot || { mode:'tee', ball:null, aims:[null,null], active:0 };
window.stratOptCache = null;
const SHOT_COL = ['#ffd24a','#5ad1ff'];          // fixed: they sit on the green map, not the theme

function stratPosture(){ return (STATE.strategy||{}).riskPosture||'balanced'; }
function stratCurrent(){
  const cs=STATE.courses||[]; if(!cs.length) return null;
  const c=cs[Math.min(window.stratSel.cIdx,cs.length-1)]; if(!c) return null;
  const hs=c.holes||[]; const hi=Math.min(window.stratSel.hIdx,Math.max(0,hs.length-1));
  return hs[hi]?{course:c, hole:hs[hi], hi}:null;
}
/* The optimiser's own answer, cached per hole/posture so dragging stays cheap. */
function stratOptimal(hole){
  const key=window.stratSel.cIdx+'|'+window.stratSel.hIdx+'|'+stratPosture()+'|'+cfHcp();
  if(window.stratOptCache && window.stratOptCache.key===key) return window.stratOptCache.res;
  const res=optimiseAim(hole, hole.tee, {posture:stratPosture()});
  window.stratOptCache={key,res};
  return res;
}
/* Centre of the green — the reference every golfer actually clubs to. */
function stratGreenMid(hole){
  const g=hole&&hole.green; if(!g||!g.length) return hole?hole.pin:null;
  let x=0,y=0; g.forEach(p=>{x+=p.x;y+=p.y;});
  return {x:x/g.length, y:y/g.length};
}
function stratClearAims(){ window.stratShot.ball=null; window.stratShot.aims=[null,null]; window.stratOptCache=null; }
function stratSetCourse(i){ window.stratSel.cIdx=+i; window.stratSel.hIdx=0; stratClearAims(); buildHoleOverlay(); }
function stratSetHole(i){ window.stratSel.hIdx=+i; stratClearAims(); buildHoleOverlay(); }
function stratSetShotMode(m){ window.stratShot.mode=m; window.stratShot.active=0; stratClearAims(); buildHoleOverlay(); }
function stratSetActive(a){ window.stratShot.active=(a==='ball')?'ball':+a; buildHoleOverlay(); }
function stratResetAim(){ stratClearAims(); buildHoleOverlay(); }
/* Writes the SAME STATE.strategy.riskPosture the Strategy Preferences panel uses, through
   the same setter, so the two surfaces can never drift apart. */
function stratSetPosture(p){
  if(typeof setStrategy==='function') setStrategy('riskPosture',p);
  else { STATE.strategy=STATE.strategy||{}; STATE.strategy.riskPosture=p; saveState(); }
  window.stratOptCache=null;
  buildHoleOverlay();
}

/* Score ONE chosen aim in whichever mode is active. Tee: the club is whichever finishes
   nearest the spot, so dragging short becomes a lay-up. Approach: the lie under the ball
   sets both the distance cost and the dispersion penalty. */
function stratScoreAim(hole, aim){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!aim) return null;
  const approach = window.stratShot.mode==='approach';
  const from = approach ? window.stratShot.ball : hole.tee;
  if(!from) return null;
  const geo=Math.hypot(aim.x-from.x,aim.y-from.y)*ypu;
  if(geo<10) return null;
  let sig={sigmaYd:geo}, shot, lie=null, cost=0;
  if(approach){
    lie=cfLieAt(hole,from);
    if(cfIsPenalty(lie)||lie==='green') return null;
    const m=APPROACH_LIE[lie]||APPROACH_LIE.fairway;
    cost=approachLieCostYd(lie);
    sig={sigmaYd:geo+cost, latMult:m.lat, depthMult:m.depth};
    shot=approachShotName(geo+cost);
  } else {
    let c=null,bd=1e9;
    aimClubs().forEach(x=>{ const d=Math.abs(x.total-geo); if(d<bd){bd=d;c=x;} });
    shot={label:c?c.label:'—', detail:c?(c.loft||''):''};
  }
  const r=aimScore(hole,from,aim,cfHcp(),stratPosture(),sig);
  if(!r) return null;
  const mid=stratGreenMid(hole);
  r.shot=shot; r.from=from; r.aim=aim; r.sig=sig; r.lie=lie; r.lieCost=cost;
  r.geoYd=geo; r.playsYd=geo+cost;
  r.fromTeeYd=cfDistYd(hole,hole.tee,aim);
  r.toPinYd=cfDistToPinYd(hole,aim);
  r.toMidYd=mid?cfDistYd(hole,aim,mid):null;
  return r;
}
/* Sensible starting pair: the optimiser's answer, and straight at the flag. */
function stratEnsureAims(hole){
  const S=window.stratShot;
  if(S.mode==='best'){ if(!S.ball) S.ball={...hole.tee}; return; }   // start on the tee shot
  if(S.mode==='approach'){
    if(!S.ball){ const t=stratOptimal(hole); S.ball = t?{x:Math.round(t.best.aim.x),y:Math.round(t.best.aim.y)}:{...hole.tee}; }
    if(!S.aims[0]){ const a=optimiseApproach(hole,S.ball,{posture:stratPosture()});
      S.aims[0]=(a&&!a.blocked)?{x:Math.round(a.best.aim.x),y:Math.round(a.best.aim.y)}:{...hole.pin}; }
    if(!S.aims[1]) S.aims[1]={...hole.pin};                       // fire straight at the stick
  } else {
    const t=stratOptimal(hole); if(!t) return;
    if(!S.aims[0]) S.aims[0]={x:Math.round(t.best.aim.x), y:Math.round(t.best.aim.y)};
    if(!S.aims[1]){ const s=t.straight||t.best; S.aims[1]={x:Math.round(s.aim.x), y:Math.round(s.aim.y)}; }
  }
}

/* Every strategy's answer to the same situation, side by side. This is the point of keeping
   the posture out of the sampling: you can see what a stance actually COSTS you here, in
   strokes, rather than choosing one blind. Tap a row to adopt it app-wide. */
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
/* Target-score inputs. Rounds-after matters: it is what stops the model from gambling on
   day one of a four-round event. */
function stratTourInputs(){
  const T=STATE.tournament||{};
  return `<div class="sh-alt-h">Playing for a number</div>
    <div class="sh-tour-row">
      <label>Target total<input type="number" min="1" value="${T.target!=null?T.target:''}" placeholder="e.g. 72" oninput="stratSetTour('target',this.value)"></label>
      <label>Strokes so far<input type="number" min="0" value="${T.strokesSoFar||0}" oninput="stratSetTour('strokesSoFar',this.value)"></label>
      <label>Rounds after this<input type="number" min="0" max="3" value="${T.roundsRemaining||0}" oninput="stratSetTour('roundsRemaining',this.value)"></label>
    </div>`;
}
function stratSetTour(field,val){
  STATE.tournament=STATE.tournament||{};
  STATE.tournament[field]= (val===''||val==null) ? null : (field==='target'?parseFloat(val):parseInt(val)||0);
  saveState(); window.stratOptCache=null; buildHoleOverlay();
}

/* One shot drawn on the hole: shot line, dispersion ellipse, aim marker and its yardages. */
function stratShotSVG(hole, r, idx){
  if(!r) return '';
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return '';
  const col=SHOT_COL[idx], from=r.from, aim=r.aim;
  const dx=aim.x-from.x, dy=aim.y-from.y, L=Math.hypot(dx,dy)||1;
  const ux=-dy/L, uy=dx/L;
  const rx=(aimSigmaLat(r.sig.sigmaYd)*(r.sig.latMult||1)*AIM_CI90)/ypu;
  const ry=(aimSigmaDist(r.sig.sigmaYd)*(r.sig.depthMult||1)*AIM_CI90)/ypu;
  const ang=Math.atan2(uy,ux)*180/Math.PI+(window.DISP_SLANT||15);
  const on=(window.stratShot.active===idx);
  const lbl=(txt,off,size)=>`<text x="${aim.x.toFixed(1)}" y="${(aim.y+off).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${size}" font-weight="700" fill="${col}" stroke="#14351d" stroke-width="8" paint-order="stroke">${txt}</text>`;
  return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${aim.x.toFixed(1)}" y2="${aim.y.toFixed(1)}" stroke="${col}" stroke-width="${on?4:2.5}" stroke-dasharray="14,10" opacity="${on?0.95:0.6}"/>
    <g transform="rotate(${ang.toFixed(1)} ${aim.x.toFixed(1)} ${aim.y.toFixed(1)})">
      <ellipse cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
        fill="${col}" fill-opacity="${on?0.2:0.1}" stroke="${col}" stroke-opacity="${on?0.95:0.6}" stroke-width="${on?4:2.5}"/>
    </g>
    <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="9" fill="none" stroke="#fff" stroke-width="${on?3.5:2.5}" opacity="${on?1:0.75}"/>
    <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="3.5" fill="#fff" opacity="${on?1:0.75}"/>
    ${lbl(`${idx+1} · ${r.shot.label} · ${Math.round(r.geoYd)} yd`, -ry-20, 31)}
    ${r.toPinYd!=null?lbl(`${Math.round(r.toPinYd)} to pin${r.toMidYd!=null?' · '+Math.round(r.toMidYd)+' to mid':''}`, ry+44, 27):''}`;
}
function stratOverlay(hole, results){
  let s='';
  results.forEach((r,i)=>{ if(i!==window.stratShot.active) s+=stratShotSVG(hole,r,i); });
  const act=results[window.stratShot.active];
  if(act) s+=stratShotSVG(hole,act,window.stratShot.active);      // active shot drawn on top
  const b=window.stratShot.ball;
  if(window.stratShot.mode==='approach'&&b){
    const live=(window.stratShot.active==='ball');
    s+=`<circle cx="${b.x}" cy="${b.y}" r="${live?14:11}" fill="#fff" stroke="#111" stroke-width="3"/>`;
  }
  return s;
}

function buildHoleOverlay(){
  const wrap=document.getElementById('hole-overlay-wrap'); if(!wrap) return;
  const courses=(STATE.courses||[]);
  if(!courses.length){
    wrap.innerHTML=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
      <div class="lvl-soon-note">Import a course first (Course Editor below, or the OpenStreetMap importer) — then this shows each hole with your dispersion pattern and the expected-strokes aim point.</div>`;
    return;
  }
  const cur=stratCurrent();
  const ci=Math.min(window.stratSel.cIdx, courses.length-1), course=courses[ci];
  const holes=course.holes||[];
  const hi=Math.min(window.stratSel.hIdx, Math.max(0,holes.length-1)), hole=holes[hi];
  const cOpts=courses.map((c,i)=>`<option value="${i}"${i===ci?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('');
  const hOpts=holes.map((h,i)=>`<option value="${i}"${i===hi?' selected':''}>Hole ${h.num||i+1} · par ${h.par||4}</option>`).join('');
  const S=window.stratShot;
  const pickBtn=(v,label,col)=>`<button type="button" class="strat-pick${S.active===v?' active':''}"${col?` style="--pick:${col}"`:''} onclick="stratSetActive('${v}')">${label}</button>`;
  const head=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
    <div class="chain-caption" style="margin-top:4px">Two shots, compared head to head. <strong>Shot 1</strong> starts on the optimiser's answer and <strong>Shot 2</strong> straight at the flag — pick one and drag it anywhere on the hole to see every number move. Each candidate aim is convolved with that club's dispersion and every sampled landing point scored against the mapped greens, bunkers and water.</div>
    <div class="strat-hole-row">
      <select class="strat-select" style="max-width:200px" onchange="stratSetCourse(this.value)">${cOpts}</select>
      <select class="strat-select" style="max-width:160px" onchange="stratSetHole(this.value)">${hOpts}</select>
      <span class="strat-mode">
        <button type="button" class="strat-mode-btn${S.mode==='tee'?' active':''}" onclick="stratSetShotMode('tee')">Tee shot</button>
        <button type="button" class="strat-mode-btn${S.mode==='approach'?' active':''}" onclick="stratSetShotMode('approach')">Approach</button>
        <button type="button" class="strat-mode-btn${S.mode==='best'?' active':''}" onclick="stratSetShotMode('best')">Best play</button>
      </span>
      <select class="strat-select" data-strat="riskPosture" style="max-width:150px" title="Risk posture — the same setting as Strategy Preferences" onchange="stratSetPosture(this.value)">
        ${SHOT_POSTURES.map(p=>`<option value="${p}"${p===stratPosture()?' selected':''}>${SHOT_POSTURE_LABEL[p]}</option>`).join('')}
      </select>
    </div>`;
  if(!hole){ wrap.innerHTML=head+`<div class="lvl-soon-note">This course has no holes yet.</div>`; return; }
  if(!cfHasScale(hole) || !hole.tee || !hole.pin){
    wrap.innerHTML=head+`<div class="lvl-soon-note">Hole ${hole.num||hi+1} needs a tee, a pin and a scale before it can be optimised. Holes imported from OpenStreetMap get all three automatically; a hand-traced hole needs the <b>calibrate</b> tool (or just a tee, a pin and the hole yardage).</div>`;
    return;
  }
  stratEnsureAims(hole);
  const pct=v=>Math.round(v*100);
  const mixOrder=['fairway','green','rough','sand','trees','water','oob'];
  const mixHTML=m=>mixOrder.filter(k=>m[k]>0.004).map(k=>
    `<span class="mix-chip mix-${k}">${CF_LIE_LABEL[k]} ${pct(m[k])}%</span>`).join('');
  const holeYd0=cfDistYd(hole,hole.tee,hole.pin);

  /* ---- BEST PLAY: one ball, one answer ---- */
  if(S.mode==='best'){
    const tourCtx=tournamentCtx(course, hi, cfHcp());
    const ball=S.ball, res=optimiseShot(hole, ball, {posture:stratPosture(), tourCtx});
    const ballMark=`<circle cx="${ball.x}" cy="${ball.y}" r="13" fill="#fff" stroke="#111" stroke-width="3"/>`;
    let body, ov=ballMark;
    if(!res){ body=`<div class="lvl-soon-note">Could not solve from here.</div>`; }
    else if(res.blocked){
      const why={ green:'The ball is on the green — that is a putt.',
        chip:`Only ${Math.round(res.toPin)} yd to the pin — that is a chip, covered by the short-game model on the Play tab.`,
        penalty:'The ball is in a penalty area. Take relief first, then drop it on the fairway or in the rough.',
        range:'Nothing in the bag can advance it from here.' }[res.blocked];
      body=`<div class="sh-aim" style="margin-top:6px">${why}</div>`;
    } else {
      const b=res.best;
      const side=Math.abs(b.latYd)<1?'straight at the flag line':`${Math.abs(b.latYd)} yd ${b.latYd<0?'left':'right'} of the flag line`;
      const gain=res.naive?(res.naive.mean-b.mean):0;
      ov=stratShotSVG(hole,{...b, from:ball, sig:{sigmaYd:b.effYd,latMult:res.mult.lat,depthMult:res.mult.depth}},0)+ballMark;
      const alts=res.ranked.slice(1,5).map(r=>`<div class="sh-alt"><span>${r.shot.label} · ${Math.round(r.geoYd)} yd · ${Math.abs(r.latYd)<1?'centre':Math.abs(r.latYd)+(r.latYd<0?'L':'R')}</span><b>${r.mean.toFixed(2)}</b></div>`).join('');
      body=`<div class="sh-cat">${b.category}</div>
        <div class="sh-club">${b.shot.label}<span class="sh-loft">${b.shot.detail||''}</span></div>
        <div class="sh-aim">Play it <b>${Math.round(b.geoYd)} yd</b>, ${side}</div>
        <div class="sh-row"><span>Expected for the hole</span><b>${b.mean.toFixed(2)}</b></div>
        <div class="sh-row"><span>Leaves you about</span><b>${Math.round(b.avgToPin)} yd</b></div>
        <div class="sh-row"><span>Hits the green</span><b>${pct(b.greenRate)}%</b></div>
        <div class="sh-row"><span>Penalty risk</span><b class="${b.penaltyRate>0.08?'sh-warn':''}">${pct(b.penaltyRate)}%</b></div>
        ${b.recoveryRate>0.01?`<div class="sh-row"><span>Back in the trees</span><b class="${b.recoveryRate>0.1?'sh-warn':''}">${pct(b.recoveryRate)}%</b></div>`:''}
        ${res.naive&&gain>0.004?`<div class="sh-gain">Saves <b>${gain.toFixed(2)}</b> strokes vs taking everything you have at the flag (${res.naive.mean.toFixed(2)})</div>`:''}
        <div class="sh-mix">${mixHTML(b.lieMix)}</div>
        ${stratPostureTable(res)}
        ${stratTourInputs()}
        <div class="sh-alt-h">Next best options — ${SHOT_POSTURE_LABEL[res.posture]}</div>${alts}`;
    }
    wrap.innerHTML=head+`
      <div class="strat-hole-grid">
        <div class="strat-hole-map">${renderHoleSVG(hole,{overlay:`<g id="strat-overlay">${ov}</g>`})}</div>
        <div class="strat-hole-panel">
          <div class="sh-head">Hole ${hole.num||hi+1} · par ${hole.par||4} · ${Math.round(holeYd0)} yd${res&&res.lie?` · ball in the ${CF_LIE_LABEL[res.lie].toLowerCase()}`:''}${res&&res.toPin!=null?` · ${Math.round(res.toPin)} yd to pin`:''}</div>
          ${body}
          <div class="sh-note">Drag the ball anywhere on the hole · posture <b>${stratPosture()}</b> · handicap ${cfHcp()}</div>
        </div>
      </div>`;
    stratDragInit(wrap); return;
  }

  const results=[stratScoreAim(hole,S.aims[0]), stratScoreAim(hole,S.aims[1])];
  const holeYd=holeYd0;
  const ballLie=(S.mode==='approach'&&S.ball)?cfLieAt(hole,S.ball):null;
  /* approach played from an impossible spot — say so instead of a broken panel */
  if(S.mode==='approach' && (ballLie==='green'||cfIsPenalty(ballLie))){
    const why = ballLie==='green' ? 'The ball is on the green — that is a putt, not an approach.'
                                  : 'The ball is in a penalty area. Take relief first, then drop it on the fairway or rough.';
    wrap.innerHTML=head+`<div class="strat-hole-grid">
        <div class="strat-hole-map">${renderHoleSVG(hole,{overlay:`<g id="strat-overlay">${stratOverlay(hole,[null,null])}</g>`})}</div>
        <div class="strat-hole-panel"><div class="sh-head">Approach</div>
          <div class="sh-aim" style="margin-top:6px">${why}</div>
          <div class="sh-note">Pick <b>Ball</b> below and drag it somewhere playable.</div>
          <div class="strat-picks" style="margin-top:9px">${pickBtn('ball','Ball')}</div></div>
      </div>`;
    stratDragInit(wrap); return;
  }
  const col=(r,i)=>{
    if(!r) return `<div class="sh-col"><div class="sh-col-h" style="color:${SHOT_COL[i]}">Shot ${i+1}</div>
      <div class="sh-note">Drag it onto the hole.</div></div>`;
    return `<div class="sh-col${S.active===i?' on':''}">
      <div class="sh-col-h" style="color:${SHOT_COL[i]}">Shot ${i+1}</div>
      <div class="sh-club">${r.shot.label}<span class="sh-loft">${r.shot.detail||''}</span></div>
      <div class="sh-row"><span>Shot length</span><b>${Math.round(r.geoYd)} yd</b></div>
      ${r.lieCost?`<div class="sh-row"><span>Plays</span><b>${Math.round(r.playsYd)} yd</b></div>`:''}
      ${S.mode==='approach'?`<div class="sh-row"><span>From tee</span><b>${r.fromTeeYd!=null?Math.round(r.fromTeeYd)+' yd':'—'}</b></div>`:''}
      <div class="sh-row"><span>To pin</span><b>${r.toPinYd!=null?Math.round(r.toPinYd)+' yd':'—'}</b></div>
      <div class="sh-row"><span>To middle</span><b>${r.toMidYd!=null?Math.round(r.toMidYd)+' yd':'—'}</b></div>
      <div class="sh-row"><span>Expected</span><b>${r.mean.toFixed(2)}</b></div>
      <div class="sh-row"><span>Worst quarter</span><b>${r.worst25.toFixed(2)}</b></div>
      <div class="sh-row"><span>Penalty risk</span><b class="${r.penaltyRate>0.08?'sh-warn':''}">${pct(r.penaltyRate)}%</b></div>
      <div class="sh-mix">${mixHTML(r.lieMix)}</div>
    </div>`;
  };
  let verdict='';
  if(results[0]&&results[1]){
    const d=results[1].mean-results[0].mean;
    verdict = Math.abs(d)<0.005
      ? `<div class="sh-gain">The two shots are level on expected strokes.</div>`
      : `<div class="sh-gain"><b style="color:${SHOT_COL[d>0?0:1]}">Shot ${d>0?1:2}</b> is better by <b>${Math.abs(d).toFixed(2)}</b> strokes.</div>`;
  }
  const picks=`<div class="strat-picks">${pickBtn(0,'Shot 1',SHOT_COL[0])}${pickBtn(1,'Shot 2',SHOT_COL[1])}${S.mode==='approach'?pickBtn('ball','Ball'):''}
    <button type="button" class="strat-mode-btn" onclick="stratResetAim()">↺ reset</button></div>`;
  wrap.innerHTML=head+`
    <div class="strat-hole-grid">
      <div class="strat-hole-map">${renderHoleSVG(hole,{overlay:`<g id="strat-overlay">${stratOverlay(hole,results)}</g>`})}</div>
      <div class="strat-hole-panel">
        <div class="sh-head">Hole ${hole.num||hi+1} · par ${hole.par||4} · ${Math.round(holeYd)} yd${ballLie?` · ball in the ${CF_LIE_LABEL[ballLie].toLowerCase()}`:''}</div>
        ${picks}
        <div class="sh-two">${col(results[0],0)}${col(results[1],1)}</div>
        ${verdict}
        <div class="sh-note">Drag on the hole to move the highlighted shot · posture <b>${stratPosture()}</b> · handicap ${cfHcp()}</div>
      </div>
    </div>`;
  stratDragInit(wrap);
}

/* Drag the highlighted shot (or the ball) straight on the hole and watch every number move.
   The listeners live on the WRAPPER, which survives the innerHTML rebuild each move
   triggers — so a drag is never interrupted by its own re-render. */
function stratDragInit(wrap){
  if(!wrap||wrap._stratDrag) return; wrap._stratDrag=true;
  let dragging=false, last=0;
  const ptOf=e=>{
    const svg=wrap.querySelector('.strat-hole-map svg'); if(!svg) return null;
    const r=svg.getBoundingClientRect(); if(!r.width||!r.height) return null;
    return { x:Math.round(Math.max(0,Math.min(CF_W,(e.clientX-r.left)/r.width*CF_W))),
             y:Math.round(Math.max(0,Math.min(CF_H,(e.clientY-r.top)/r.height*CF_H))) };
  };
  const apply=(e,force)=>{
    const p=ptOf(e); if(!p) return;
    const now=Date.now(); if(!force && now-last<50) return; last=now;      // ~20fps is plenty
    const S=window.stratShot;
    if(S.mode==='best'||S.active==='ball'){ S.ball=p; S.aims=[null,null]; } // moving the ball re-seeds the aims
    else S.aims[S.active]=p;
    buildHoleOverlay();
  };
  wrap.addEventListener('pointerdown',e=>{
    if(!e.target.closest||!e.target.closest('.strat-hole-map')) return;
    dragging=true; try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    apply(e,true); e.preventDefault();
  });
  wrap.addEventListener('pointermove',e=>{ if(dragging) apply(e,false); });
  const end=e=>{ if(!dragging) return; dragging=false; apply(e,true); };
  wrap.addEventListener('pointerup',end);
  wrap.addEventListener('pointercancel',end);
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
  SHOT_COL, stratSetShotMode, stratSetActive, stratPosture, stratCurrent, stratOptimal,
  stratGreenMid, stratClearAims, stratResetAim, stratScoreAim, stratEnsureAims,
  stratShotSVG, stratOverlay, stratDragInit
});
