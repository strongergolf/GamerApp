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
  let wsum=0, mean=0, pen=0; const rows=[], lieMix={};
  for(let i=0;i<s.length;i++){
    const e=cfExpectedStrokes(hole,s[i].pt,hcp); if(e==null) continue;
    const lie=cfLieAt(hole,s[i].pt), w=s[i].w;
    mean+=e*w; wsum+=w; if(cfIsPenalty(lie)) pen+=w;
    lieMix[lie]=(lieMix[lie]||0)+w;
    rows.push({e,w});
  }
  if(!wsum) return null;
  mean/=wsum;
  rows.sort((a,b)=>a.e-b.e);
  const best25=aimTail(rows,wsum,0.25,false)??mean, worst25=aimTail(rows,wsum,0.25,true)??mean;
  Object.keys(lieMix).forEach(k=>{ lieMix[k]=lieMix[k]/wsum; });
  return { aim, mean, best25, worst25, penaltyRate:pen/wsum, lieMix,
           score:aimObjective(mean,best25,worst25,posture) };
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

/* ---------- overlay + panel ---------- */
window.stratSel = window.stratSel || { cIdx:0, hIdx:0 };
window.stratShot = window.stratShot || { mode:'tee', ball:null };

/* SVG overlay drawn inside renderHoleSVG: the shot line, the dispersion ellipse at the
   recommended aim, the aim marker, and (for an approach) the ball. Field units.
   sig = {sigmaYd, latMult, depthMult} so the drawn ellipse matches the scored one. */
function aimOverlaySVG(hole, from, aim, sig, showBall){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!aim) return '';
  sig=sig||{};
  const dx=aim.x-from.x, dy=aim.y-from.y, L=Math.hypot(dx,dy)||1;
  const ux=-dy/L, uy=dx/L;
  const shotYd=(sig.sigmaYd!=null)?sig.sigmaYd:L*ypu;
  const rx=(aimSigmaLat(shotYd)*(sig.latMult||1)*AIM_CI90)/ypu;    // 90% lateral half-width
  const ry=(aimSigmaDist(shotYd)*(sig.depthMult||1)*AIM_CI90)/ypu; // 90% depth half-width
  const ang=Math.atan2(uy,ux)*180/Math.PI+(window.DISP_SLANT||15);
  const ball=showBall?`<circle cx="${from.x.toFixed(1)}" cy="${from.y.toFixed(1)}" r="11" fill="#fff" stroke="#111" stroke-width="3"/>`:'';
  return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${aim.x.toFixed(1)}" y2="${aim.y.toFixed(1)}" stroke="var(--gold2)" stroke-width="3" stroke-dasharray="14,10" opacity="0.85"/>
    <g transform="rotate(${ang.toFixed(1)} ${aim.x.toFixed(1)} ${aim.y.toFixed(1)})">
      <ellipse cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
        fill="var(--gold2)" fill-opacity="0.22" stroke="var(--gold2)" stroke-opacity="0.9" stroke-width="3"/>
    </g>
    <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="9" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="${aim.x.toFixed(1)}" cy="${aim.y.toFixed(1)}" r="3.5" fill="#fff"/>${ball}`;
}

function stratSetCourse(i){ window.stratSel.cIdx=+i; window.stratSel.hIdx=0; window.stratShot.ball=null; buildHoleOverlay(); }
function stratSetHole(i){ window.stratSel.hIdx=+i; window.stratShot.ball=null; buildHoleOverlay(); }
function stratSetShotMode(m){ window.stratShot.mode=m; buildHoleOverlay(); }
/* Tap the hole to drop the ball anywhere — the lie under it is read straight off the
   mapped polygons, so the advice changes when you land in the rough or a bunker. */
function stratMapClick(evt){
  if(window.stratShot.mode!=='approach') return;
  const svg=evt.currentTarget, r=svg.getBoundingClientRect();
  window.stratShot.ball={ x:Math.round((evt.clientX-r.left)/r.width*CF_W),
                          y:Math.round((evt.clientY-r.top)/r.height*CF_H) };
  buildHoleOverlay();
}

function buildHoleOverlay(){
  const wrap=document.getElementById('hole-overlay-wrap'); if(!wrap) return;
  const courses=(STATE.courses||[]);
  if(!courses.length){
    wrap.innerHTML=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
      <div class="lvl-soon-note">Import a course first (Course Editor below, or the OpenStreetMap importer) — then this shows each hole with your dispersion pattern and the expected-strokes aim point.</div>`;
    return;
  }
  const ci=Math.min(window.stratSel.cIdx, courses.length-1), course=courses[ci];
  const holes=course.holes||[];
  const hi=Math.min(window.stratSel.hIdx, Math.max(0,holes.length-1)), hole=holes[hi];
  const cOpts=courses.map((c,i)=>`<option value="${i}"${i===ci?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('');
  const hOpts=holes.map((h,i)=>`<option value="${i}"${i===hi?' selected':''}>Hole ${h.num||i+1} · par ${h.par||4}</option>`).join('');
  const head=`<div class="section-label">Hole Overlays <span class="proto-badge">prototype</span></div>
    <div class="chain-caption" style="margin-top:4px">Your shot <strong>pattern</strong> — not your best shot — decides the target. Every candidate aim is convolved with that club's dispersion, each sampled landing point is scored against the hole's mapped greens, bunkers and water using the Broadie baselines, and the aim with the lowest risk-weighted expected strokes wins. Risk posture comes from your Strategy Preferences.</div>
    <div class="strat-hole-row">
      <select class="strat-select" style="max-width:210px" onchange="stratSetCourse(this.value)">${cOpts}</select>
      <select class="strat-select" style="max-width:170px" onchange="stratSetHole(this.value)">${hOpts}</select>
      <span class="strat-mode">
        <button type="button" class="strat-mode-btn${window.stratShot.mode==='tee'?' active':''}" onclick="stratSetShotMode('tee')">Tee shot</button>
        <button type="button" class="strat-mode-btn${window.stratShot.mode==='approach'?' active':''}" onclick="stratSetShotMode('approach')">Approach</button>
      </span>
    </div>`;
  if(!hole){ wrap.innerHTML=head+`<div class="lvl-soon-note">This course has no holes yet.</div>`; return; }
  if(!cfHasScale(hole) || !hole.tee || !hole.pin){
    wrap.innerHTML=head+`<div class="lvl-soon-note">Hole ${hole.num||hi+1} needs a tee, a pin and a scale before it can be optimised. Holes imported from OpenStreetMap get all three automatically; a hand-traced hole needs the <b>calibrate</b> tool (or just a tee, a pin and the hole yardage).</div>`;
    return;
  }
  const posture=(STATE.strategy||{}).riskPosture||'balanced';
  const pct=v=>Math.round(v*100);
  const mixOrder=['fairway','green','rough','sand','water','oob'];
  const mixHTML=m=>mixOrder.filter(k=>m[k]>0.004).map(k=>
    `<span class="mix-chip mix-${k}">${CF_LIE_LABEL[k]} ${pct(m[k])}%</span>`).join('');
  const holeYd=cfDistYd(hole,hole.tee,hole.pin);
  const hdr=`<div class="sh-head">Hole ${hole.num||hi+1} · par ${hole.par||4} · ${Math.round(holeYd)} yd</div>`;
  let panel='', overlay='';

  if(window.stratShot.mode==='approach'){
    /* default the ball to where a good tee shot finishes, then let the user drag it around */
    if(!window.stratShot.ball){
      const t=optimiseAim(hole, hole.tee, {posture});
      window.stratShot.ball = t ? {x:Math.round(t.best.aim.x), y:Math.round(t.best.aim.y)} : {...hole.tee};
    }
    const ball=window.stratShot.ball;
    const res=optimiseApproach(hole, ball, {posture});
    if(!res){ panel=`<div class="lvl-soon-note">Could not solve this shot.</div>`; }
    else if(res.blocked){
      const why={ green:'The ball is on the green — that is a putt, not an approach.',
        chip:`Only ${Math.round(res.toPin)} yd to the pin — that is a chip. The short-game model on the Play tab covers it.`,
        penalty:'The ball is in a penalty area. Take relief first, then drop it on the fairway or rough.',
        range:'No club in the bag reaches the green from here.' }[res.blocked];
      panel=`<div class="sh-head">Approach</div><div class="sh-aim" style="margin-top:6px">${why}</div>
        <div class="sh-note">Tap the hole to move the ball.</div>`;
      overlay=`<circle cx="${ball.x}" cy="${ball.y}" r="11" fill="#fff" stroke="#111" stroke-width="3"/>`;
    } else {
      const b=res.best, s=b.shot;
      const lat=b.latYd, dep=b.depthYd;
      const parts=[];
      if(lat!==0) parts.push(`${Math.abs(lat)} yd ${lat<0?'left':'right'}`);
      if(dep!==0) parts.push(`${Math.abs(dep)} yd ${dep<0?'short':'long'}`);
      const spot=parts.length?parts.join(', ')+' of the flag':'right at the flag';
      const gain=res.atFlag?(res.atFlag.mean-b.mean):0;
      overlay=aimOverlaySVG(hole, ball, b.aim, {sigmaYd:b.effYd,latMult:res.mult.lat,depthMult:res.mult.depth}, true);
      panel=hdr
        +`<div class="sh-club">${s.label}<span class="sh-loft">${s.detail}</span></div>
        <div class="sh-aim">Aim <b>${spot}</b></div>
        <div class="sh-row"><span>Lie</span><b>${CF_LIE_LABEL[res.lie]}</b></div>
        <div class="sh-row"><span>To the pin</span><b>${Math.round(res.toPin)} yd</b></div>
        <div class="sh-row"><span>Plays</span><b>${Math.round(b.effYd)} yd${res.cost?` (+${res.cost} lie)`:''}</b></div>
        <div class="sh-row"><span>Expected strokes</span><b>${b.mean.toFixed(2)}</b></div>
        <div class="sh-row"><span>Hits the green</span><b>${pct(b.greenRate)}%</b></div>
        <div class="sh-row"><span>Penalty risk</span><b class="${b.penaltyRate>0.08?'sh-warn':''}">${pct(b.penaltyRate)}%</b></div>
        ${res.atFlag&&Math.abs(gain)>0.004?`<div class="sh-gain">${gain>0?'+':''}${gain.toFixed(2)} strokes vs firing straight at the flag</div>`:''}
        <div class="sh-mix">${mixHTML(b.lieMix)}</div>
        <div class="sh-note">Tap the hole to move the ball · posture <b>${res.posture}</b> · handicap ${res.hcp}</div>`;
    }
  } else {
    const res=optimiseAim(hole, hole.tee, {posture});
    if(!res){ wrap.innerHTML=head+`<div class="lvl-soon-note">Could not solve this hole — check that the bag has carry distances.</div>`; return; }
    const b=res.best;
    const side=b.offsetYd===0?'straight down the line':`${Math.abs(b.offsetYd)} yd ${b.offsetYd<0?'left':'right'} of the flag line`;
    const gain=res.straight?(res.straight.mean-b.mean):0;
    overlay=aimOverlaySVG(hole, hole.tee, b.aim, {sigmaYd:b.alongYd});
    panel=hdr
      +`<div class="sh-club">${b.club.label}<span class="sh-loft">${b.club.loft||''}</span></div>
      <div class="sh-aim">Aim <b>${side}</b></div>
      <div class="sh-row"><span>Expected strokes</span><b>${b.mean.toFixed(2)}</b></div>
      <div class="sh-row"><span>Typical quarter (best)</span><b>${b.best25.toFixed(2)}</b></div>
      <div class="sh-row"><span>Bad quarter (worst)</span><b>${b.worst25.toFixed(2)}</b></div>
      <div class="sh-row"><span>Penalty risk</span><b class="${b.penaltyRate>0.08?'sh-warn':''}">${pct(b.penaltyRate)}%</b></div>
      ${res.straight&&Math.abs(gain)>0.004?`<div class="sh-gain">${gain>0?'+':''}${gain.toFixed(2)} strokes vs aiming straight at the flag with the same club</div>`:''}
      <div class="sh-mix">${mixHTML(b.lieMix)}</div>
      <div class="sh-note">Posture: <b>${posture}</b> · handicap ${res.hcp} · ${AIM_Z.length*AIM_Z.length} samples per aim</div>`;
  }

  wrap.innerHTML=head+`
    <div class="strat-hole-grid">
      <div class="strat-hole-map">${renderHoleSVG(hole,{overlay})}</div>
      <div class="strat-hole-panel">${panel}</div>
    </div>`;
  const svg=wrap.querySelector('.strat-hole-map svg');
  if(svg && window.stratShot.mode==='approach'){
    svg.style.cursor='crosshair';
    svg.addEventListener('click', stratMapClick);
  }
}

Object.assign(window, {
  AIM_Z, AIM_W, AIM_CI90, AIM_LAT_SWEEP, AIM_LAT_STEP,
  aimSigmaLat, aimSigmaDist, aimSamples, aimObjective, aimTail, aimScore, aimClubs,
  optimiseAim, aimOverlaySVG, stratSetCourse, stratSetHole, buildHoleOverlay,
  APPROACH_LIE, approachSituation, approachLieCostYd, approachShotName, optimiseApproach,
  stratSetShotMode, stratMapClick
});
