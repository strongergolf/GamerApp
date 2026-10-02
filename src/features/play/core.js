// PLAY GOLF NOW — the on-course mode.
//
// A MODE, not a page. The rest of the app is for preparing and reviewing; this is for the
// four and a half hours in between, on a phone, in sunlight, one-handed, between shots. So it
// takes the whole screen, hides the app's navigation, and offers three things only:
//     DISTANCES  front / middle / back of the green, and what has to be carried to get there
//     HOLE       the hole, with the ball on it
//     CARD       the score, entered as you go
// Everything else in the app stays exactly where it was. One button opens this; the same
// button resumes it; exiting puts you back where you were.
//
// TOURNAMENT-SAFE BY CONSTRUCTION. Rule 4.3a allows distance and direction information and
// allows recording the round. It prohibits elevation, measured wind, and anything that
// interprets — a recommended line or club from where the ball lies. Nothing here does any of
// those: it measures, maps and records. The strategy engine, plays-like yardage and the
// putting break calculator are deliberately not reachable from inside Play, and a TOURNAMENT
// round locks the rest of the app away until the round ends (see pmTourn).
//
// THE ROUND IS PERSISTED on every entry, in STATE.play.round. A phone that locks mid-round
// often reloads the tab when it wakes; the round has to be exactly where it was when it does.
//
// THE FILES. Play was one 2,300-line file; it is now split by feature under features/play/:
//     core.js      state, opening/closing, the round, the score, GPS, setup, card, lock, boot
//     plan.js      plan my round, then freeze it
//     shots.js     every shot: lie, aim, commitment, club, non-stock notes
//     patterns.js  on-course distances, dispersion, the lean
//     review.js    shot values, the four-way, plan vs played, strokes gained
//     autohole.js  which hole am I on
//     map.js       the Play screen itself
// Each file puts every top-level function and constant on window, so they call each other
// at run time the way the old single file did. Load order (main.js) only matters for load-time code,
// and there is none that reaches across files.

const PM_RESUME_HOURS = 8;          /* a round left open longer than this is abandoned, not resumed */
const PM_NEAR_HOLE_YD = 700;        /* GPS further than this from the green is not on this hole */
const PM_GPS_MAX_ERR_M = 40;        /* coarser than this and a yardage is worse than none */

/* ---------------- STATE ---------------- */
function pmState(){ STATE.play=STATE.play||{}; STATE.play.rounds=STATE.play.rounds||[]; return STATE.play; }
function pmRound(){ const r=pmState().round; return (r&&!r.done)?r:null; }
function pmCourse(){
  const r=pmRound(); if(!r) return null;
  return (STATE.courses||[]).find(c=>(c.id||c.name)===r.courseKey)||null;
}
function pmHoles(){ const c=pmCourse(); return c?(c.holes||[]):[]; }
function pmHole(){ const r=pmRound(), hs=pmHoles(); if(!r||!hs.length) return null; return hs[Math.min(r.cur,hs.length-1)]; }
function pmHoleNum(h,i){ return (h&&h.num)||(i+1); }
function pmEntry(num){
  const r=pmRound(); if(!r) return {};
  r.holes=r.holes||{};
  return (r.holes[num]=r.holes[num]||{});
}
function pmTouch(){ const r=pmRound(); if(r){ r.touched=Date.now(); saveState(); } }

/* ---------------- TOURNAMENT ROUNDS ----------------
   Chosen when the round starts and LOCKED for it: there is no switch to turn it off mid-round,
   only finishing or discarding the round. A toggle that could be flicked off for one look at
   the strategy engine and back on would make the mode worthless as an assurance, to the
   golfer or to anyone they show it to.
   While it is on, Play is the only screen. The rest of the app is where the tools the Rules
   prohibit during a round live — the aim-point optimiser, plays-like yardage, the putting
   break calculator — so leaving Play is what has to be closed, not each tool in turn.
   DISTANCE-ONLY, at Mark's call: GPS and straight-line distances stay on. What is excluded is
   every ADJUSTMENT (elevation, slope, wind, temperature, humidity, altitude), which is exactly
   the line Rule 4.3a(1) draws. Nothing inside Play adjusts a distance, casual round or not, so
   a tournament round shows the same numbers; what changes is that nothing else is reachable. */
function pmTourn(){ const r=pmRound(); return !!(r&&r.tournament&&r.tournament.on); }
window.pmLockAsk = false;
function pmLockDismiss(){ window.pmLockAsk=false; buildPlay(); }

/* ---------------- OPEN / CLOSE ---------------- */
window.pmView = window.pmView || 'map';
function pmIsOpen(){ return document.body.classList.contains('playing'); }
function pmOpen(){
  document.body.classList.add('playing');
  const el=document.getElementById('play-mode'); if(el) el.hidden=false;
  /* The phone's back button should leave Play, not leave the app. */
  try{ if(!(history.state&&history.state.pm)) history.pushState({pm:1},''); }catch(_){}
  pmWake(true);
  if(pmRound()) pmGpsStart(false);
  buildPlay();
}
function pmClose(fromPop){
  /* A tournament round keeps Play on screen. The back button is pushed back into Play, and
     the close button asks instead — finish the round, or keep playing. */
  if(pmTourn()){
    if(fromPop){ try{ history.pushState({pm:1},''); }catch(_){} }
    window.pmLockAsk=true; buildPlay(); return;
  }
  document.body.classList.remove('playing');
  const el=document.getElementById('play-mode'); if(el) el.hidden=true;
  pmGpsStop(); pmWake(false);
  if(!fromPop){ try{ if(history.state&&history.state.pm) history.back(); }catch(_){} }
  pmSyncButtons();
}
if(!window.pmPopHooked){
  window.pmPopHooked=true;
  window.addEventListener('popstate',()=>{ if(pmIsOpen()) pmClose(true); });
}
/* Keep the screen on while playing. A screen that sleeps between every shot is the first thing
   that makes an on-course app unbearable. Best-effort: not every browser has it. */
let PM_WAKE=null;
async function pmWake(on){
  try{
    if(on && navigator.wakeLock && !PM_WAKE){ PM_WAKE=await navigator.wakeLock.request('screen'); PM_WAKE.addEventListener('release',()=>{PM_WAKE=null;}); }
    if(!on && PM_WAKE){ await PM_WAKE.release(); PM_WAKE=null; }
  }catch(_){ PM_WAKE=null; }
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&pmIsOpen()) pmWake(true); });

/* ---------------- STARTING AND ENDING A ROUND ---------------- */
function pmStart(){
  const cSel=document.getElementById('pm-course'), sSel=document.getElementById('pm-start');
  const cs=STATE.courses||[]; const c=cs[parseInt(cSel?cSel.value:0,10)||0]; if(!c){ toast('Import a course first'); return; }
  const start=parseInt(sSel?sSel.value:0,10)||0;
  const tOn=!!(document.getElementById('pm-tourn')||{}).checked;
  if(tOn && !confirm('Start a TOURNAMENT round?\n\nDistances only, with no adjustments. The rest of the app stays locked until you finish or discard this round.')) return;
  pmState().round={ id:'r'+Date.now(), courseKey:c.id||c.name, courseName:c.name||'Course',
                    startedAt:Date.now(), touched:Date.now(), start, cur:start, holes:{}, done:false,
                    tee:(document.getElementById('pm-tee')||{}).value||null,
                    tournament: tOn ? {on:true, lockedAt:Date.now(), history:[]} : null };
  const pl=pmPlans()[pmCourseKey(c)], usePlan=!!(document.getElementById('pm-plan-use')||{}).checked;
  if(pl && usePlan) pmState().round.plan=pmPlanFreeze(c, pl);
  window.pmPlanView=false; window.pmPlanJob=null;
  saveState(); window.pmView='map'; window.pmLockAsk=false; window.pmTarget=null;
  /* Ask for location HERE, on the Start tap, rather than behind a separate "Use GPS" button.
     The browser needs a user gesture to prompt, and this is the one moment the golfer knows
     exactly why the app wants it. Only when the course can use it — a course with no map
     reference would be asking for nothing. */
  const c0=(c.holes||[])[start];
  pmGpsStart(!!(c0&&c0.geo));
  buildPlay(); pmSyncButtons();
}
function pmGo(i){
  const r=pmRound(), n=pmHoles().length; if(!r||!n) return;
  const leftE=(r.holes||{})[pmHoleNum(pmHoles()[r.cur], r.cur)];
  if(leftE&&leftE.shots&&leftE.shots.length) leftE.done=true;   /* walked off = holed out */
  r.cur=((i%n)+n)%n; window.pmTarget=null; window.pmPlacing=null; window.pmShotOpen=null; pmTouch(); buildPlay(); pmSyncButtons();
}
/* A hole changed BY HAND pauses auto-detection: the golfer's choice outranks the guess. */
function pmStep(d){ const r=pmRound(); if(r){ pmAutoHold(); pmGo(r.cur+d); } }
function pmSetView(v){ window.pmView=v; buildPlay(); }

/* ---------------- THE SCORE ---------------- */
/* The number field reads "—" until touched; the first tap on either button starts from par,
   because par is where most holes end and it saves two taps on every one that does. */
function pmAdj(key, d){
  const h=pmHole(), r=pmRound(); if(!h||!r) return;
  const num=pmHoleNum(h, r.cur), e=pmEntry(num), par=h.par||4;
  /* a hole with shots logged COUNTS its score from them; the steppers would disagree with it */
  if(e.shots&&e.shots.length){ toast('This hole is counted from its shots \u2014 edit the shots'); return; }
  const base={s:par, p:2, pen:0}[key];
  let v=(e[key]==null)?base:(e[key]+d);
  if(key==='s') v=Math.max(1,Math.min(15,v));
  if(key==='p') v=Math.max(0,Math.min(6,v));
  if(key==='pen') v=Math.max(0,Math.min(6,v));
  if(key==='p'&&e.s!=null) v=Math.min(v, e.s);          // cannot putt more than you scored
  e[key]=v;
  if(key==='s'&&e.p!=null&&e.p>v) e.p=v;
  pmTouch(); buildPlay(); pmSyncButtons();
}
function pmSetFw(v){
  const h=pmHole(), r=pmRound(); if(!h||!r) return;
  const e=pmEntry(pmHoleNum(h,r.cur)); e.f=(e.f===v)?null:v;
  e.fBy='hand';                 /* a tap outranks what the shot list implies */
  pmTouch(); buildPlay();
}
function pmToggleSand(){
  const h=pmHole(), r=pmRound(); if(!h||!r) return;
  const e=pmEntry(pmHoleNum(h,r.cur)); e.sand=!e.sand;
  pmTouch(); buildPlay();
}
/* What the card works out from what was entered. This is ARITHMETIC ON THE SCORE — a green
   in regulation is strokes minus putts against par minus two — not an interpretation of play,
   and it is the same thing a pencil and a scorecard would give you. */
function pmDerived(h, e){
  const par=h.par||4, out={};
  if(e.s!=null && e.p!=null){
    out.gir = (e.s - e.p) <= (par - 2);
    out.threePutt = e.p >= 3;
    /* up and down: missed the green, still made par or better */
    out.udAtt = !out.gir;
    out.udMade = !out.gir && e.s <= par;
  }
  return out;
}
function pmTotals(){
  const r=pmRound(), hs=pmHoles(); if(!r) return null;
  const t={strokes:0, par:0, played:0, putts:0, puttHoles:0, fir:0, firAtt:0, gir:0, girAtt:0,
           threePutt:0, udMade:0, udAtt:0, pen:0, out:{s:0,par:0,n:0}, in:{s:0,par:0,n:0}};
  hs.forEach((h,i)=>{
    const e=(r.holes||{})[pmHoleNum(h,i)]; if(!e||e.s==null) return;
    /* a hole being logged shot by shot is still IN PROGRESS until it is holed out or walked
       off: counting its shots so far printed "-2 thru 1" after a drive and an approach */
    if(e.shots&&e.shots.length&&!e.done&&i===r.cur) return;
    const par=h.par||4, d=pmDerived(h,e), half=i<9?t.out:t.in;
    t.strokes+=e.s; t.par+=par; t.played++; half.s+=e.s; half.par+=par; half.n++;
    if(e.p!=null){ t.putts+=e.p; t.puttHoles++; }
    if(par>=4){ t.firAtt++; if(e.f==='hit') t.fir++; }
    if(d.gir!=null){ t.girAtt++; if(d.gir) t.gir++; }
    if(d.threePutt) t.threePutt++;
    if(d.udAtt) t.udAtt++; if(d.udMade) t.udMade++;
    t.pen+=e.pen||0;
  });
  t.toPar=t.strokes-t.par;
  return t;
}
function pmFmtToPar(n){ return n===0?'E':(n>0?'+'+n:String(n)); }

/* Finish: the round is saved, Post-Round's snapshot is filled from it, and the golfer lands
   there to debrief. The snapshot used to be typed in from memory after the round; now it is
   what was recorded during it. */
function pmFinish(){
  const r=pmRound(), t=pmTotals(); if(!r||!t) return;
  if(!t.played){ if(!confirm('No scores entered. End this round anyway?')) return; }
  else if(t.played<pmHoles().length && !confirm(`Only ${t.played} of ${pmHoles().length} holes have a score. End the round?`)) return;
  r.done=true; r.endedAt=Date.now(); r.totals=t;
  /* strokes gained from the shots logged \u2014 computed now, never during the round */
  try{ r.sg=pmRoundSG(r); }catch(_){ r.sg=null; }
  /* and against the frozen plan, priced now on the player model the plan was made with */
  try{ pmShotValues(r); }catch(_){}
  try{ r.planReview=r.plan?pmPlanReview(r):null; }catch(_){ r.planReview=null; }
  if(r.tournament) r.tournament.endedAt=r.endedAt;
  pmState().rounds.push(r); pmState().round=null; saveState();
  if(t.played && window.psRound){
    Object.assign(window.psRound, { score:t.toPar, fir:t.fir, gir:t.gir, putts:t.puttHoles?t.putts:'',
      threePutt:t.threePutt, udMade:t.udMade, udAtt:t.udAtt, pen:t.pen });
  }
  pmClose();
  if(typeof showGroupPage==='function') showGroupPage('gameplan','postround');
  if(typeof buildPostRound==='function') buildPostRound();
  toast(t.played?`Round saved — ${t.strokes} (${pmFmtToPar(t.toPar)}). Snapshot filled in.`:'Round ended');
}
function pmAbandon(){
  if(!confirm('Discard this round? Nothing will be saved.')) return;
  pmState().round=null; saveState(); pmGpsStop(); buildPlay(); pmSyncButtons();
}

/* ---------------- WHERE THE BALL IS ----------------
   GPS when the browser gives a fix good enough to be worth a yardage and the course is
   georeferenced (every OSM import is); otherwise the tee. The source is always shown — a
   number you cannot tell is from the tee or from your feet is worse than no number. */
window.pmGps = window.pmGps || { on:false, fix:null, err:null, watch:null };
function pmGpsStart(ask){
  const G=window.pmGps;
  if(!('geolocation' in navigator)){ G.err='This browser has no location'; return; }
  if(G.watch!=null) return;
  /* Only start without a tap if permission was already granted — prompting for location the
     moment the mode opens, before the golfer knows why, is how permission gets refused. */
  const go=()=>{
    G.on=true;
    G.watch=navigator.geolocation.watchPosition(
      p=>{ G.fix={lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:Date.now()}; G.err=null;
           if(pmIsOpen() && !pmAutoDetect(G.fix)) pmRenderBody(); },
      e=>{ G.err=e.code===1?'Location permission refused':'No GPS fix'; G.on=false; G.watch=null; if(pmIsOpen()) pmRenderBody(); },
      {enableHighAccuracy:true, maximumAge:4000, timeout:20000});
  };
  if(ask) return go();
  try{
    navigator.permissions.query({name:'geolocation'}).then(s=>{ if(s.state==='granted') go(); }).catch(()=>{});
  }catch(_){}
}
function pmGpsStop(){ const G=window.pmGps; if(G.watch!=null){ try{navigator.geolocation.clearWatch(G.watch);}catch(_){} } G.watch=null; G.on=false; }
function pmPos(hole){
  const G=window.pmGps, mid=cfGreenMid(hole)||cfPin(hole);
  if(G.fix && hole.geo){
    /* a coarse fix is reported, not used: a yardage that could be 40 m out is worse than the
       tee number, which is at least exactly what it says it is */
    if(G.fix.acc>PM_GPS_MAX_ERR_M) return {pt:hole.tee, src:'coarse', acc:G.fix.acc};
    const p=cfLatLonToField(hole, G.fix.lat, G.fix.lon);
    const d=p&&mid?cfDistYd(hole,p,mid):null;
    if(d!=null && d<=PM_NEAR_HOLE_YD) return {pt:p, src:'gps', acc:G.fix.acc};
    return {pt:hole.tee, src:'far', acc:G.fix.acc, away:d};
  }
  /* No usable GPS: where the ball is, if you have told us — the latest shot placed on this
     hole. So the numbers and the casual analysis follow your round instead of staying on the
     tee after you have logged the drive in the rough. */
  const r=pmRound(), hs=pmHoles();
  if(r && hs[r.cur]===hole){
    const S=(pmEntry(pmHoleNum(hole,r.cur)).shots)||[];
    for(let k=S.length-1;k>=0;k--){ const q=pmShotPt(hole,S[k]); if(q) return {pt:q, src:'shot', n:k+1}; }
  }
  return {pt:hole.tee, src:'tee'};
}
/* Front, middle and back along the line from the ball THROUGH the green — the numbers a
   yardage book gives, and the ones a sprinkler-head reading gives in the other order. */
function pmGreenNumbers(hole, P){
  const ypu=cfYardsPerUnit(hole), mid=cfGreenMid(hole)||cfPin(hole);
  if(ypu==null||!P||!mid) return null;
  const out={ mid:cfDistYd(hole,P,mid) };
  const pin=cfPin(hole);
  if(pin && (Math.abs(pin.x-mid.x)>0.5||Math.abs(pin.y-mid.y)>0.5)) out.pin=cfDistYd(hole,P,pin);
  const g=hole.green;
  if(g&&g.length>=3){
    if(cfPointInPoly(P,g)){ out.onGreen=true; return out; }
    const L=Math.hypot(mid.x-P.x, mid.y-P.y)||1;
    const ext={ x:P.x+(mid.x-P.x)/L*(L+80/ypu), y:P.y+(mid.y-P.y)/L*(L+80/ypu) };
    const hits=cfSegPolyAllHits(P, ext, g);
    if(hits.length){
      const len=Math.hypot(ext.x-P.x, ext.y-P.y)*ypu;
      out.front=hits[0].t*len; out.back=hits[hits.length-1].t*len;
    }
  }
  return out;
}

/* ---------------- RENDERING ---------------- */
function pmSyncButtons(){
  const r=pmRound(), t=r?pmTotals():null;
  document.querySelectorAll('[data-pm-btn]').forEach(b=>{
    if(r){
      const hs=pmHoles(), h=hs[Math.min(r.cur,hs.length-1)];
      b.classList.add('live');
      b.innerHTML=`<span class="pm-dot"></span>Hole ${h?pmHoleNum(h,r.cur):''}${t&&t.played?` · ${pmFmtToPar(t.toPar)}`:''}`;
      b.setAttribute('aria-label','Resume round');
    } else {
      b.classList.remove('live');
      b.innerHTML='▶ Play';
      b.setAttribute('aria-label','Play golf now');
    }
  });
  /* My Courses has the other door, and it says Resume or Play depending on the same state.
     It was rendered once at load, so it kept offering "Resume round" for a round already
     finished. */
  if(typeof buildRoundTracker==='function') buildRoundTracker();
  if(typeof simSyncButtons==='function') simSyncButtons();
}
function buildPlay(){
  const el=document.getElementById('play-mode'); if(!el) return;
  const r=pmRound();
  if(!r){ el.classList.remove('pm-tourn'); el.innerHTML = window.pmPlanView ? pmPlanHTML() : pmSetupHTML(); return; }
  const hs=pmHoles(), h=pmHole();
  if(!h){ el.innerHTML=pmSetupHTML('That course is no longer in the app.'); return; }
  const t=pmTotals(), T=pmTourn();
  el.classList.toggle('pm-tourn', T);
  el.innerHTML=`
    <div class="pm-top">
      ${T?`<button type="button" class="pm-x pm-lock" onclick="pmClose()" aria-label="Tournament round — the app is locked">&#x1F512;</button>`
         :`<button type="button" class="pm-x" onclick="pmClose()" aria-label="Leave Play — the round stays open">✕</button>`}
      <button type="button" class="pm-arrow" onclick="pmStep(-1)" aria-label="Previous hole">‹</button>
      <div class="pm-hole">
        <div class="pm-hole-t">Hole ${pmHoleNum(h,r.cur)} <span>par ${h.par||4}</span></div>
        <div class="pm-hole-s">${escapeHtml(r.courseName)}${t.played?` · <b>${pmFmtToPar(t.toPar)}</b> thru ${t.played}`:''}${pmAutoBadge(h)}</div>
      </div>
      <button type="button" class="pm-arrow" onclick="pmStep(1)" aria-label="Next hole">›</button>
    </div>
    ${T?`<div class="pm-badge">Tournament · distances only, no adjustments</div>`:''}
    ${T&&window.pmUnlockStep?pmUnlockHTML():(T&&window.pmLockAsk?pmLockHTML():'')}
    ${pmAskHTML()}
    <div class="pm-body" id="pm-body"></div>
    <nav class="pm-tabs" aria-label="Play">
      ${[['map','Map','◎'],['card','Card','☰'],['bag','Bag','≡']].map(([k,l,i])=>
        `<button type="button" class="pm-tab${window.pmView===k?' on':''}" onclick="pmSetView('${k}')" aria-pressed="${window.pmView===k}"><span aria-hidden="true">${i}</span>${l}</button>`).join('')}
    </nav>`;
  pmRenderBody();
}
function pmRenderBody(){
  const body=document.getElementById('pm-body'); if(!body) return;
  const h=pmHole(), r=pmRound(); if(!h||!r) return;
  if(window.pmView==='dist'||window.pmView==='hole') window.pmView='map';   /* the two merged */
  body.classList.toggle('pm-body-map', window.pmView==='map');
  body.innerHTML = window.pmView==='card' ? pmCardHTML() : window.pmView==='bag' ? pmBagHTML() : pmMapHTML(h, r);
  /* MEASURED FIT. The map's height is estimated before anything is drawn; if the collapsed sheet
     still lands under the tab bar (a taller prompt, larger system fonts), the map gives up
     exactly the overflow. The map box behind it is the same green as the turf, so the few
     pixels of letterbox this can leave read as more grass, not a border. */
  const wrap=body.querySelector('.pm-mapwrap'), sheet=body.querySelector('.pm-sheet'), tabs=document.querySelector('.pm-tabs');
  if(wrap && sheet && tabs && !window.pmSheetOpen){
    const over=sheet.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top;
    if(over>1) wrap.style.height=Math.max(220, wrap.getBoundingClientRect().height-over)+'px';
  }
}
function pmSetupSet(){
  const g=id=>document.getElementById(id), was=window.pmSetupSel||{};
  window.pmSetupSel={ c:parseInt((g('pm-course')||{}).value,10)||0, start:parseInt((g('pm-start')||{}).value,10)||0,
                      tourn:!!(g('pm-tourn')||{}).checked, tee:(g('pm-tee')||{}).value||null };
  if(was.c!==window.pmSetupSel.c) buildPlay();      /* the plan card is per course */
}
function pmSetupHTML(note){
  const cs=STATE.courses||[];
  if(!cs.length) return `<div class="pm-setup">
      <button type="button" class="pm-x pm-x-abs" onclick="pmClose()" aria-label="Close">✕</button>
      <h2>Play golf now</h2>
      <p>Import a course first — Strategy → My Courses pulls one from OpenStreetMap in a few seconds.</p>
      <button type="button" class="btn btn-primary" onclick="pmClose();showGroupPage('gameplan','gpcourses')">Go to My Courses</button></div>`;
  const sel=window.pmSetupSel||(window.pmSetupSel={c:(window.stratSel&&window.stratSel.cIdx)||0, start:0, tourn:false});
  if(sel.c>=cs.length) sel.c=0;
  const cur=sel.c, c=cs[cur];
  return `<div class="pm-setup">
      <button type="button" class="pm-x pm-x-abs" onclick="pmClose()" aria-label="Close">✕</button>
      <h2>Play golf now</h2>
      ${note?`<p class="pm-warn">${escapeHtml(note)}</p>`:''}
      <label class="pm-field">Course<select id="pm-course" onchange="pmSetupSet()">${cs.map((c,i)=>`<option value="${i}"${i===cur?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('')}</select></label>
      <label class="pm-field">Starting hole<select id="pm-start" onchange="pmSetupSet()"><option value="0">1st</option><option value="9"${sel.start===9?' selected':''}>10th</option></select></label>
      ${c&&(c.tees||[]).length?`<label class="pm-field">Tees<select id="pm-tee" onchange="pmSetupSet()">${c.tees.map(t=>`<option value="${escapeHtml(t.name)}"${(sel.tee||(STATE.profile&&STATE.profile.usualTee))===t.name?' selected':''}>${escapeHtml(t.name)}${t.rating?` · ${t.rating} / ${t.slope||'?'}`:''}</option>`).join('')}</select></label>`:''}
      ${c?pmSetupPlanHTML(c):''}
      <label class="pm-tourn-opt"><input type="checkbox" id="pm-tourn" onchange="pmSetupSet()"${sel.tourn?' checked':''}>
        <span><b>Tournament round</b>Distances only, with nothing adjusted for elevation, slope, wind or weather.
        The rest of the app is locked until the round is finished or discarded.</span></label>
      <button type="button" class="btn btn-primary pm-go" onclick="pmStart()">Start round</button>
      <p class="pm-note">Distances, the hole map, your scorecard and the plan you made before you teed off. Nothing on the course works anything out from where your ball is, so it stays inside what the Rules allow. Your round is saved as you go and survives the phone locking.</p>
    </div>`;
}


function pmCardHTML(){
  const r=pmRound(), hs=pmHoles(), t=pmTotals();
  const row=(h,i)=>{
    const num=pmHoleNum(h,i), e=(r.holes||{})[num]||{}, par=h.par||4;
    const diff=e.s!=null?e.s-par:null;
    const cls=diff==null?'':diff<=-2?'eagle':diff===-1?'birdie':diff===0?'par':diff===1?'bogey':'dbl';
    return `<button type="button" class="pm-card-row${i===r.cur?' cur':''}" onclick="pmAutoHold();pmGo(${i});pmSetView('map')">
      <span>${num}</span><span>${par}</span><span class="pm-sc ${cls}">${e.s!=null?e.s:'·'}</span>
      <span>${e.p!=null?e.p:''}</span><span>${par>=4?(e.f==='hit'?'✓':e.f==='left'?'←':e.f==='right'?'→':e.f==='miss'?'✗':''):''}</span></button>`;
  };
  /* The nine's FULL par, as a printed card shows it, with the running score beside it. Summing
     par over only the holes played printed "Out 11 / 11" three holes in, which reads as a
     finished nine of 11. */
  const ninePar=(a,b)=>hs.slice(a,b).reduce((sum,h)=>sum+(h.par||4),0);
  const half=(lbl,o,a,b)=>(hs.length>a)?`<div class="pm-card-sub"><span>${lbl}</span><span>${ninePar(a,b)}</span><span class="pm-sc">${o.n?o.s:'·'}</span><span class="pm-thru">${o.n&&o.n<Math.min(9,hs.length-a)?'thru '+o.n:''}</span><span></span></div>`:'';
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
  return `<div class="pm-card">
      <div class="pm-card-h"><span>Hole</span><span>Par</span><span>Score</span><span>Putts</span><span>Fwy</span></div>
      ${hs.slice(0,9).map((h,i)=>row(h,i)).join('')}${half('Out',t.out,0,9)}
      ${hs.slice(9).map((h,i)=>row(h,i+9)).join('')}${half('In',t.in,9,18)}
    </div>
    <div class="pm-stats">
      <div><span>Score</span><b>${t.played?t.strokes:'—'}</b><i>${t.played?pmFmtToPar(t.toPar):''}</i></div>
      <div><span>Putts</span><b>${t.puttHoles?t.putts:'—'}</b></div>
      <div><span>Fairways</span><b>${t.firAtt?`${t.fir}/${t.firAtt}`:'—'}</b><i>${pct(t.fir,t.firAtt)}</i></div>
      <div><span>Greens</span><b>${t.girAtt?`${t.gir}/${t.girAtt}`:'—'}</b><i>${pct(t.gir,t.girAtt)}</i></div>
    </div>
    ${pmTournHistoryHTML(r)}
    ${pmPlanLogHTML(r)}
    <div class="pm-end">
      <button type="button" class="btn btn-primary" onclick="pmFinish()">Finish round</button>
      <button type="button" class="btn" onclick="pmAbandon()">Discard</button>
    </div>
    ${pmTourn()?'':`<button type="button" class="pm-to-tourn" onclick="pmToTournament()">Switch this round to tournament mode</button>`}`;
}
/* ---------------- SWITCHING MODES ----------------
   ON is one confirmation: it only takes things away. OFF is a PROCESS — four deliberate steps
   (the lock, "release", typing UNLOCK, confirming) — and it is recorded on the round for good,
   with the hole and the time. Releasing mid-round is sometimes legitimate (a practice round
   started in the wrong mode, a Committee that suspends play); it must never be casual, and it
   must never be invisible afterwards. */
function pmTournLog(on){
  const r=pmRound(); if(!r) return;
  r.tournament=r.tournament||{on:false};
  r.tournament.history=r.tournament.history||[];
  r.tournament.history.push({on, at:Date.now(), hole:pmHoleNum(pmHole(), r.cur)});
}
function pmToTournament(){
  const r=pmRound(); if(!r||pmTourn()) return;
  if(!confirm('Switch this round to TOURNAMENT mode?\n\nDistances only, no adjustments, and the rest of the app locked. Leaving it again is a deliberate process, and is recorded on the round.')) return;
  r.tournament=Object.assign(r.tournament||{}, {on:true, lockedAt:r.tournament&&r.tournament.lockedAt||Date.now()});
  pmTournLog(true); window.pmTarget=null; window.pmView='map'; pmTouch(); buildPlay(); pmSyncButtons();
}
window.pmUnlockStep = 0;
function pmUnlockBegin(){ window.pmUnlockStep=1; buildPlay(); }
function pmUnlockCancel(){ window.pmUnlockStep=0; window.pmLockAsk=false; buildPlay(); }
function pmUnlockCheck(el){
  const ok=(el.value||'').trim().toUpperCase()==='UNLOCK';
  const b=document.getElementById('pm-unlock-go'); if(b){ b.disabled=!ok; b.classList.toggle('ready',ok); }
}
function pmUnlockConfirm(){
  const el=document.getElementById('pm-unlock-word');
  if(!el || el.value.trim().toUpperCase()!=='UNLOCK') return;
  const r=pmRound(); if(!r||!pmTourn()) return;
  r.tournament.on=false; r.tournament.releasedAt=Date.now();
  pmTournLog(false);
  window.pmUnlockStep=0; window.pmLockAsk=false; pmTouch(); buildPlay(); pmSyncButtons();
  toast('Tournament lock released \u2014 recorded on this round');
}
function pmTournHistoryHTML(r){
  const H=(r&&r.tournament&&r.tournament.history)||[];
  if(!r||!r.tournament||(!r.tournament.lockedAt&&!H.length)) return '';
  const t=x=>new Date(x).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  const evs=[];
  if(r.tournament.lockedAt && !(H[0]&&H[0].on)) evs.push(`locked at the start, ${t(r.tournament.lockedAt)}`);
  H.forEach(x=>evs.push(`${x.on?'locked':'<b>released</b>'} on hole ${x.hole}, ${t(x.at)}`));
  const broken=H.some(x=>!x.on);
  return `<div class="pm-tourn-log${broken?' broken':''}">Tournament mode: ${evs.join(' \u00b7 ')}</div>`;
}

/* The close button during a tournament round. Not a dead button: it says why the app is
   locked and points at the way out, which is ending the round. */
function pmLockHTML(){
  const r=pmRound(), at=r&&r.tournament?new Date(r.tournament.lockedAt):null;
  return `<div class="pm-lock-ask" role="alertdialog" aria-label="Tournament round">
      <p><b>Tournament round in progress.</b> The rest of the app is locked${at?` since ${at.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`:''} —
      it holds tools the Rules do not allow during a round. Finish or discard the round on the card to unlock it.</p>
      <div class="pm-lock-btns">
        <button type="button" class="btn" onclick="pmLockDismiss()">Keep playing</button>
        <button type="button" class="btn btn-primary" onclick="window.pmLockAsk=false;pmSetView('card')">Go to the card</button>
      </div>
      <button type="button" class="pm-unlock-link" onclick="pmUnlockBegin()">Release the tournament lock\u2026</button>
    </div>`;
}
function pmUnlockHTML(){
  const r=pmRound(), h=pmHole();
  return `<div class="pm-lock-ask pm-unlock" role="alertdialog" aria-label="Release the tournament lock">
      <p><b>Release the tournament lock?</b> This reopens the strategy layer, plays-like yardage and the
      rest of the app <b>for the remainder of this round</b>. The round is marked permanently:
      <i>released on hole ${pmHoleNum(h, r.cur)} at ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</i>.</p>
      <label class="pm-unlock-l">Type <b>UNLOCK</b> to confirm
        <input id="pm-unlock-word" autocomplete="off" autocapitalize="characters" spellcheck="false" oninput="pmUnlockCheck(this)"></label>
      <div class="pm-lock-btns">
        <button type="button" class="btn" onclick="pmUnlockCancel()">Keep it locked</button>
        <button type="button" class="btn pm-unlock-go" id="pm-unlock-go" disabled onclick="pmUnlockConfirm()">Release</button>
      </div>
    </div>`;
}
/* YOUR CLUB DISTANCES, as stored: the carry and total from Stock Shots, and nothing done to
   them. Rule 4.3a(3) allows using information gathered BEFORE the round, club distances
   included, and this is the chart a player would otherwise carry on paper. Without it a
   locked app would take that away for the whole round.
   Deliberately the STOCK numbers, never the environmentally adjusted ones: adjusting for
   today's temperature, altitude or air is interpreting conditions, which is the one thing a
   tournament round rules out. */
function pmBagHTML(){
  const rows=(STATE.clubs||[]).filter(c=>c.type!=='putter').map(c=>{
    const p=(typeof perf==='function'?perf(c.id):STATE.performance[c.id])||{};
    return `<div class="pm-bag-row"><span class="spec-club ${c.type}">${escapeHtml(c.label)}</span>
      <span class="pm-bag-loft">${escapeHtml(c.loft||'')}</span>
      <span class="pm-bag-n"><b>${p.carry!=null?ydNum(p.carry):'—'}</b><i>carry</i></span>
      <span class="pm-bag-n"><b>${p.total!=null?ydNum(p.total):'—'}</b><i>total</i></span></div>`;
  }).join('');
  return `<div class="pm-bag">${rows}</div>
    <p class="pm-note">Your stock distances in ${ydUnit()}, as stored — not adjusted for today’s conditions.</p>`;
}

/* On load: a round left open recently is resumed straight into Play, because the most likely
   reason the app is loading mid-round is that the phone locked and the browser reloaded it. */
function pmBoot(){
  const r=pmRound();
  /* A TOURNAMENT round resumes however old it is: the lock has to hold until the golfer ends
     it, and an app that quietly unlocked itself after eight hours would not be a lock. Ending
     it is one tap on the screen it reopens to. */
  if(r && r.tournament && r.tournament.on){ pmOpen(); }
  else if(r && Date.now()-(r.touched||r.startedAt) > PM_RESUME_HOURS*3600e3){ /* stale: leave it, but do not jump into it */ }
  else if(r){ pmOpen(); }
  pmSyncButtons();
}

Object.assign(window, {
  PM_RESUME_HOURS, PM_NEAR_HOLE_YD, PM_GPS_MAX_ERR_M, pmState, pmRound, pmCourse, pmHoles, pmHole, pmHoleNum,
  pmEntry, pmTouch, pmTourn, pmLockDismiss, pmIsOpen, pmOpen, pmClose, pmWake, pmStart, pmGo, pmStep,
  pmSetView, pmAdj, pmSetFw, pmToggleSand, pmDerived, pmTotals, pmFmtToPar, pmFinish, pmAbandon, pmGpsStart,
  pmGpsStop, pmPos, pmGreenNumbers, pmSyncButtons, buildPlay, pmRenderBody, pmSetupSet, pmSetupHTML,
  pmCardHTML, pmTournLog, pmToTournament, pmUnlockBegin, pmUnlockCancel, pmUnlockCheck, pmUnlockConfirm,
  pmTournHistoryHTML, pmLockHTML, pmUnlockHTML, pmBagHTML, pmBoot });
