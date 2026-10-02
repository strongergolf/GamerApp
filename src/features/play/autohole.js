// PLAY: which hole am I on — auto-detection from GPS, and the one-tap score for the hole just left.
// Split from play.js; shares its globals through window (see play/core.js).

/* ==================== WHICH HOLE AM I ON? ====================
   Built on two inputs only — a position and the course map — and deliberately on nothing
   about where either comes from. The position is the phone's own location service (on
   Android that is already Google's fused location; no web API offers a better fix). The map
   is whatever the course was imported from. A better map source later improves this without
   touching it.

   SCORING: for every hole, how far the position is from the line tee -> middle of the green,
   in yards, less a bonus for standing on that hole's tee, fairway or green. Lowest wins.
   SWITCHING is where the care goes, because holes run side by side and a ball in the rough
   between two of them is genuinely ambiguous:
     * stepping onto the NEXT hole's tee switches at once — the clearest signal on a course;
     * anything else needs PM_AUTO_CONFIRM consecutive fixes agreeing, the new hole inside
       PM_AUTO_NEAR_YD of you, and the current one further than PM_AUTO_FAR_YD away;
     * never while you are on the current hole's green — you are putting, not leaving;
     * a manual change (the arrows, the card) pauses all of it for PM_AUTO_HOLD_MS. The
       golfer's choice outranks the guess. */
const PM_AUTO_TEE_YD = 15;
const PM_AUTO_NEAR_YD = 25;
const PM_AUTO_FAR_YD = 45;
const PM_AUTO_CONFIRM = 2;
const PM_AUTO_HOLD_MS = 4*60*1000;
window.pmAuto = window.pmAuto || { on:true, cand:null, n:0, holdUntil:0, last:null };
function pmHoleFit(h, lat, lon){
  if(!h||!h.geo||!h.tee) return null;
  const ypu=cfYardsPerUnit(h); if(ypu==null) return null;
  const pt=cfLatLonToField(h, lat, lon); if(!pt) return null;
  const mid=cfGreenMid(h)||cfPin(h); if(!mid) return null;
  const line=cfDistPtSeg(pt, h.tee, mid)*ypu;
  const onTee=Math.hypot(pt.x-h.tee.x, pt.y-h.tee.y)*ypu < PM_AUTO_TEE_YD;
  const onGreen=!!(h.green&&h.green.length>=3&&cfPointInPoly(pt,h.green));
  const inFw=!!(h.fairway&&h.fairway.length>=3&&cfPointInPoly(pt,h.fairway));
  return { line, onTee, onGreen, inFw, score: line - (inFw?10:0) - (onGreen?25:0) - (onTee?25:0) };
}
/* Every hole's fit for one fix, best first. Exported for testing and for anything else that
   needs to know where on the course a position is. */
function pmRankHoles(lat, lon){
  return pmHoles().map((h,i)=>({i, f:pmHoleFit(h,lat,lon)})).filter(x=>x.f).sort((a,b)=>a.f.score-b.f.score);
}
function pmAutoHold(){ window.pmAuto.holdUntil=Date.now()+PM_AUTO_HOLD_MS; window.pmAuto.cand=null; window.pmAuto.n=0; }
function pmAutoResume(){ window.pmAuto.holdUntil=0; window.pmAuto.on=true; pmRenderBody(); buildPlay(); }
/* Called on every GPS fix. Returns true if it moved the round to another hole. */
function pmAutoDetect(fix){
  const A=window.pmAuto, r=pmRound(); if(!A.on||!r||!fix||fix.acc>PM_GPS_MAX_ERR_M) return false;
  if(Date.now()<A.holdUntil) return false;
  const n=pmHoles().length; if(!n) return false;
  const rank=pmRankHoles(fix.lat, fix.lon); if(!rank.length) return false;
  const best=rank[0], cur=r.cur;
  const curFit=(rank.find(x=>x.i===cur)||{}).f;
  A.last={best:best.i, score:best.f.score};
  if(best.i===cur){ A.cand=null; A.n=0; return false; }
  if(curFit && curFit.onGreen) return false;                          /* putting out */
  const isNext = best.i===((cur+1)%n);
  let go = isNext && best.f.onTee;                                    /* on the next tee: at once */
  if(!go && best.f.line<=PM_AUTO_NEAR_YD && (!curFit || curFit.line>=PM_AUTO_FAR_YD)){
    if(A.cand===best.i) A.n++; else { A.cand=best.i; A.n=1; }
    go = A.n>=PM_AUTO_CONFIRM;
  }
  if(!go) return false;
  /* the hole you just walked off: if it has no score, ask now, while you remember it */
  const left=pmHoles()[cur], le=(r.holes||{})[pmHoleNum(left,cur)];
  if(!le || le.s==null) window.pmAskScore=cur;
  A.cand=null; A.n=0;
  if(le&&le.shots&&le.shots.length) le.done=true;            /* walked off = holed out */
  r.cur=best.i; window.pmTarget=null; window.pmPlacing=null; pmTouch();
  buildPlay(); pmSyncButtons();
  return true;
}
/* ONE-TAP SCORE for the hole just left. Score buttons around par, then putts, both optional,
   because the point is that walking to the next tee should not cost you the last hole. */
window.pmAskScore = (window.pmAskScore==null) ? null : window.pmAskScore;
function pmAskSet(key, v){
  const i=window.pmAskScore; if(i==null) return;
  const h=pmHoles()[i]; if(!h) return;
  const e=pmEntry(pmHoleNum(h,i)); e[key]=v;
  if(key==='s' && e.p!=null && e.p>v) e.p=v;
  if(key==='p' && e.s!=null && v>e.s) e[key]=e.s;
  pmTouch(); buildPlay(); pmSyncButtons();
}
function pmAskDone(){ window.pmAskScore=null; buildPlay(); }
function pmAskHTML(){
  const i=window.pmAskScore; if(i==null) return '';
  const h=pmHoles()[i]; if(!h) return '';
  const par=h.par||4, e=pmEntry(pmHoleNum(h,i));
  const sc=[]; for(let v=Math.max(1,par-2); v<=par+3; v++) sc.push(v);
  return `<div class="pm-ask" role="dialog" aria-label="Score for hole ${pmHoleNum(h,i)}">
      <div class="pm-ask-h">Hole ${pmHoleNum(h,i)} <span>par ${par}</span> \u2014 how many?</div>
      <div class="pm-ask-row">${sc.map(v=>`<button type="button" class="${e.s===v?'on':''}" onclick="pmAskSet('s',${v})">${v}</button>`).join('')}</div>
      <div class="pm-ask-h pm-ask-sub">Putts</div>
      <div class="pm-ask-row">${[0,1,2,3,4].map(v=>`<button type="button" class="${e.p===v?'on':''}" onclick="pmAskSet('p',${v})">${v}</button>`).join('')}</div>
      <button type="button" class="pm-ask-done" onclick="pmAskDone()">${e.s!=null?'Done':'Skip for now'}</button>
    </div>`;
}


/* Whether the hole on screen was found by GPS or chosen by hand — and, when paused, the way
   back to automatic. Only shown when detection is possible at all (GPS on a mapped course). */
function pmAutoBadge(h){
  const G=window.pmGps, A=window.pmAuto;
  if(!h||!h.geo||!G.fix) return '';
  const held=Date.now()<A.holdUntil;
  return held ? ` \u00b7 <button type="button" class="pm-auto off" onclick="pmAutoResume()">manual \u2014 tap for auto</button>`
              : ` \u00b7 <span class="pm-auto">auto</span>`;
}

Object.assign(window, {
  PM_AUTO_TEE_YD, PM_AUTO_NEAR_YD, PM_AUTO_FAR_YD, PM_AUTO_CONFIRM, PM_AUTO_HOLD_MS, pmHoleFit, pmRankHoles,
  pmAutoHold, pmAutoResume, pmAutoDetect, pmAskSet, pmAskDone, pmAskHTML, pmAutoBadge });
