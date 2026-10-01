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
  r.cur=((i%n)+n)%n; window.pmTarget=null; window.pmPlacing=null; pmTouch(); buildPlay(); pmSyncButtons();
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
                      tourn:!!(g('pm-tourn')||{}).checked };
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
      ${c?pmSetupPlanHTML(c):''}
      <label class="pm-tourn-opt"><input type="checkbox" id="pm-tourn" onchange="pmSetupSet()"${sel.tourn?' checked':''}>
        <span><b>Tournament round</b>Distances only, with nothing adjusted for elevation, slope, wind or weather.
        The rest of the app is locked until the round is finished or discarded.</span></label>
      <button type="button" class="btn btn-primary pm-go" onclick="pmStart()">Start round</button>
      <p class="pm-note">Distances, the hole map, your scorecard and the plan you made before you teed off. Nothing on the course works anything out from where your ball is, so it stays inside what the Rules allow. Your round is saved as you go and survives the phone locking.</p>
    </div>`;
}


/* ==================== PLAN MY ROUND, THEN FREEZE IT ====================
   The strategy engine, used the way the Rules allow it: BEFORE the round. Rule 4.3a lets a
   player use information prepared before the round (a yardage book with notes, a club for
   every tee) and forbids working anything out during it from where the ball is. So:

     PLAN    on the setup screen, before Start. Every hole is solved from the tee with your
             clubs, your dispersion and today's pins: the optimal line and the one your Strategy
             Preferences play, chained on to the green (a par 5 is tee shot, lay-up, approach).
             Pick one per hole, add a note. Stored per course in STATE.play.plans.
     FREEZE  at Start, the picked plan is COPIED onto the round as plain numbers: clubs,
             distances, aim points, notes. Nothing re-plans it after that and no screen edits
             it; the plan screen only exists while no round is open.
     PLAY    the frozen plan is shown as written: a line on the map, a strip on the sheet. In a
             tournament round that is all of it; the live optimiser stays off (pmStrategyAllowed).

   The engine uses stock carries and the course's geometry only: no wind, elevation, slope or
   weather. So the plan is distance-only too, which is the tournament rule Mark set. */
const PM_PLAN_MAX_SHOTS = 4;
function pmPlans(){ const P=pmState(); return (P.plans=P.plans||{}); }
function pmCourseKey(c){ return c ? (c.id||c.name) : null; }
function pmSetupCourse(){ const cs=STATE.courses||[]; return cs[(window.pmSetupSel||{}).c||0] || cs[0] || null; }
/* Everything a plan depends on. A plan made before any of it changed says so. */
function pmPlanStamp(c){
  const k=pmCourseKey(c), sh=(typeof cfActiveSheet==='function')?cfActiveSheet(k):null;
  const bag=(typeof aimClubs==='function'?aimClubs():[]).map(x=>`${x.id}:${Math.round(x.carry)}/${Math.round(x.total)}`).join(',');
  return [k, (c.holes||[]).length, typeof stratPosture==='function'?stratPosture():'',
          typeof stratSkillKey==='function'?stratSkillKey():'', sh?sh.id+JSON.stringify(sh.pins||{}):'-',
          JSON.stringify(STATE.strategy||{}), bag].join('|');
}
/* Where a shot is aimed, said the way a caddie would: on the green against the pin, short of
   it against the line to the middle of the green. */
function pmPlanAimTxt(h, from, aim){
  const ypu=cfYardsPerUnit(h)||1, pin=cfPin(h), mid=cfGreenMid(h)||pin;
  const yd=v=>`${ydNum(Math.abs(v))}`;
  if(pin && cfLieAt(h,aim)==='green'){
    const dPin=Math.hypot(aim.x-pin.x,aim.y-pin.y)*ypu, dMid=mid?Math.hypot(aim.x-mid.x,aim.y-mid.y)*ypu:99;
    /* with no pin sheet the "pin" IS the middle of the green, and should be called that */
    const noCut = dMid<99 && Math.hypot(pin.x-mid.x,pin.y-mid.y)*ypu<1;
    if(dMid<3 && (noCut || dPin>=3)) return 'middle of the green';
    if(dPin<3) return 'at the pin';
    if(noCut){
      const L=Math.hypot(mid.x-from.x,mid.y-from.y)||1, dx=(mid.x-from.x)/L, dy=(mid.y-from.y)/L;
      const vx=aim.x-mid.x, vy=aim.y-mid.y, along=(vx*dx+vy*dy)*ypu, lat=(dx*vy-dy*vx)*ypu;
      const parts=[];
      if(Math.abs(along)>=2) parts.push(`${yd(along)} ${along>0?'past':'short'}`);
      if(Math.abs(lat)>=2) parts.push(`${yd(lat)} ${lat>0?'right':'left'}`);
      return parts.length ? `${parts.join(', ')} of the middle` : 'middle of the green';
    }
    const L=Math.hypot(pin.x-from.x,pin.y-from.y)||1, dx=(pin.x-from.x)/L, dy=(pin.y-from.y)/L;
    const vx=aim.x-pin.x, vy=aim.y-pin.y, along=(vx*dx+vy*dy)*ypu, lat=(dx*vy-dy*vx)*ypu;
    const parts=[];
    if(Math.abs(along)>=2) parts.push(`${yd(along)} ${along>0?'past':'short'}`);
    if(Math.abs(lat)>=2) parts.push(`${yd(lat)} ${lat>0?'right':'left'}`);
    return parts.length ? `${parts.join(', ')} of the pin` : 'at the pin';
  }
  if(!mid) return '';
  const L=Math.hypot(mid.x-from.x,mid.y-from.y)||1, dx=(mid.x-from.x)/L, dy=(mid.y-from.y)/L;
  const lat=(dx*(aim.y-from.y)-dy*(aim.x-from.x))*ypu;
  return Math.abs(lat)<4 ? 'on the line to the green' : `${yd(lat)} ${ydUnit()} ${lat>0?'right':'left'} of the line to the green`;
}
/* One hole, played one way, from the tee to the green. Each shot starts where the last was
   aimed: the plan is a sequence of intentions, not a forecast of where the ball will finish. */
function pmPlanChain(h, mode){
  const shots=[]; let from={x:h.tee.x, y:h.tee.y};
  for(let k=1;k<=PM_PLAN_MAX_SHOTS;k++){
    let aim=null;
    if(mode==='opt'){
      const res=optimiseShot(h, from, {posture:stratPosture(), hcp:PLAYER});
      if(!res||res.blocked||!res.best) break;
      aim={x:Math.round(res.best.aim.x), y:Math.round(res.best.aim.y)};
    } else {
      aim=stratPrefAim(h, from, k); if(!aim) break;
    }
    const r=stratScoreShot(h, from, aim); if(!r||r.blocked||r.mean==null) break;
    const onGreen=cfLieAt(h,aim)==='green';
    shots.push({ from:{x:Math.round(from.x),y:Math.round(from.y)}, aim,
                 club:(r.shot&&r.shot.label)||'', yd:Math.round(r.geoYd*10)/10,
                 toPin:r.toPinYd!=null?Math.round(r.toPinYd):null, toMid:r.toMidYd!=null?Math.round(r.toMidYd):null,
                 onGreen, aimTxt:pmPlanAimTxt(h, from, aim), mean:r.mean });
    const left=cfDistToPinYd(h,aim);
    if(onGreen || left==null || left<20) break;
    from=aim;
  }
  return shots;
}
function pmPlanHole(h, i){
  const num=pmHoleNum(h,i), par=+h.par||4;
  const mapped = h.tee && cfHasScale(h) && cfPin(h) && (h.green||[]).length>2;
  const yards = mapped ? Math.round(cfDistYd(h,h.tee,cfPin(h))) : (+h.yards||null);
  if(!mapped){
    return { num, par, yards, method:yards?'baseline':'none',
             exp: yards ? srForPlayer('tee', yards, stratHcpNum(PLAYER,'tee')) : null };
  }
  const opt=pmPlanChain(h,'opt'), mine=pmPlanChain(h,'mine');
  if(!opt.length && !mine.length) return { num, par, yards, method:'baseline', exp:srForPlayer('tee', yards, stratHcpNum(PLAYER,'tee')) };
  const ypu=cfYardsPerUnit(h)||1;
  const same = !!(opt[0] && mine[0] && opt.length===mine.length &&
                  opt.every((s,k)=>Math.hypot(s.aim.x-mine[k].aim.x, s.aim.y-mine[k].aim.y)*ypu<3));
  return { num, par, yards, method:'model', opt, mine:same?[]:mine, same,
           expOpt: opt.length?1+opt[0].mean:null, expMine: (!same&&mine.length)?1+mine[0].mean:null, pick:'opt' };
}
function pmPlanExp(row){
  if(!row) return null;
  if(row.method!=='model') return row.exp;
  return (row.pick==='mine' && row.expMine!=null) ? row.expMine : (row.expOpt!=null ? row.expOpt : row.expMine);
}
/* Solving a course is a few seconds of work on a phone, so it runs a hole at a time and says
   which hole it is on, rather than freezing the screen. */
window.pmPlanJob = window.pmPlanJob || null;
function pmPlanBuild(){
  if(pmRound()){ toast('The plan is frozen once a round starts'); return; }
  if(typeof optimiseShot!=='function'){ toast('The strategy engine is not loaded'); return; }
  const c=pmSetupCourse(); if(!c) return;
  const key=pmCourseKey(c), hs=c.holes||[], prev=pmPlans()[key];
  const job={key, i:0, n:hs.length, holes:{}};
  window.pmPlanJob=job; window.pmPlanView=true; buildPlay();
  const step=()=>{
    if(window.pmPlanJob!==job) return;
    if(job.i>=job.n){
      const sh=(typeof cfActiveSheet==='function')?cfActiveSheet(key):null;
      pmPlans()[key]={ madeAt:Date.now(), courseName:c.name||'Course', stamp:pmPlanStamp(c),
                       sheet:sh?(sh.name||'Pin sheet'):null, posture:stratPosture(),
                       holes:job.holes, notes:(prev&&prev.notes)||{} };
      saveState(); window.pmPlanJob=null; buildPlay(); return;
    }
    const h=hs[job.i]; let row;
    try{ row=pmPlanHole(h, job.i); }catch(e){ row={num:pmHoleNum(h,job.i), par:+h.par||4, method:'none'}; }
    /* a rebuild keeps the choices you already made, where the choice still exists */
    const was=prev&&prev.holes&&prev.holes[row.num];
    if(was && was.pick==='mine' && row.expMine!=null) row.pick='mine';
    job.holes[row.num]=row; job.i++;
    const pr=document.getElementById('pm-plan-prog');
    if(pr) pr.textContent=`Planning hole ${job.i} of ${job.n}…`;
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}
function pmPlanOpen(){ if(pmRound()) return; window.pmPlanView=true; buildPlay(); const el=document.getElementById('play-mode'); if(el) el.scrollTop=0; }
function pmPlanClose(){ window.pmPlanView=false; window.pmPlanJob=null; buildPlay(); }
function pmPlanCur(){ const c=pmSetupCourse(); return c ? pmPlans()[pmCourseKey(c)] || null : null; }
function pmPlanPick(num, which){
  if(pmRound()) return;
  const pl=pmPlanCur(), row=pl&&pl.holes[num]; if(!row||row.method!=='model') return;
  row.pick=which; saveState();
  const el=document.getElementById('play-mode'), y=el?el.scrollTop:0; buildPlay(); if(el) el.scrollTop=y;
}
function pmPlanNote(num, txt){
  if(pmRound()) return;
  const pl=pmPlanCur(); if(!pl) return;
  const t=String(txt||'').trim().slice(0,140);
  if(t) pl.notes[num]=t; else delete pl.notes[num];
  saveState();
}
function pmPlanDelete(){
  if(pmRound()) return;
  const c=pmSetupCourse(); if(!c||!pmPlans()[pmCourseKey(c)]) return;
  if(!confirm('Delete the plan for this course?')) return;
  delete pmPlans()[pmCourseKey(c)]; saveState(); window.pmPlanView=false; buildPlay();
}
/* THE FREEZE: a copy, not a reference. Rebuilding or deleting the course's plan afterwards
   cannot reach the round, and a tournament round records when it was frozen. */
function pmPlanFreeze(c, pl){
  const holes={};
  Object.values(pl.holes||{}).forEach(row=>{
    const pick = row.method==='model' ? ((row.pick==='mine' && row.mine && row.mine.length) ? 'mine' : 'opt') : null;
    holes[row.num]={ num:row.num, par:row.par, yards:row.yards, method:row.method, pick, same:!!row.same,
                     shots: pick ? (row[pick]||[]).map(s=>({club:s.club, yd:s.yd, from:s.from, aim:s.aim, toPin:s.toPin,
                                                              toMid:s.toMid, onGreen:s.onGreen, aimTxt:s.aimTxt})) : [],
                     exp: pmPlanExp(row), note: (pl.notes||{})[row.num]||'' };
  });
  return JSON.parse(JSON.stringify({ madeAt:pl.madeAt, frozenAt:Date.now(), stale:pmPlanStamp(c)!==pl.stamp,
                                     sheet:pl.sheet, posture:pl.posture, holes }));
}
function pmPlanTotal(pl){
  let exp=0, par=0, n=0;
  Object.values(pl.holes||{}).forEach(row=>{ const e=pmPlanExp(row); if(e!=null){ exp+=e; par+=row.par; n++; } });
  return {exp, par, n};
}
function pmWhen(t){
  const d=new Date(t), now=new Date();
  const tm=d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  return d.toDateString()===now.toDateString() ? `${tm} today` : `${d.toLocaleDateString([], {month:'short', day:'numeric'})}, ${tm}`;
}
/* The card on the setup screen: make a plan, or the one you made and whether it still holds. */
function pmSetupPlanHTML(c){
  const pl=pmPlans()[pmCourseKey(c)];
  if(!pl) return `<div class="pm-plancard">
      <div class="pm-plancard-h">Your plan</div>
      <p>Work the round out before you tee off: a club and a line for every hole, with your clubs and today's pins. It is frozen when the round starts and shown as written.</p>
      <button type="button" class="btn pm-plan-btn" onclick="pmPlanBuild()">Plan this round</button>
    </div>`;
  const t=pmPlanTotal(pl), stale=pmPlanStamp(c)!==pl.stamp, d=t.exp-t.par;
  return `<div class="pm-plancard">
      <div class="pm-plancard-h">Your plan <span>made ${pmWhen(pl.madeAt)}</span></div>
      <p>${t.n} hole${t.n===1?'':'s'} · plays <b>${t.exp.toFixed(1)}</b> (${d>=0?'+':''}${d.toFixed(1)} vs par ${t.par})${pl.sheet?` · pins: ${escapeHtml(pl.sheet)}`:' · pins: middle of each green'}</p>
      ${stale?`<p class="pm-warn">Made before your clubs, pins or preferences changed. Rebuild it, or take it as it is.</p>`:''}
      <label class="pm-plan-use"><input type="checkbox" id="pm-plan-use" checked> Take this plan onto the course</label>
      <div class="pm-plan-row">
        <button type="button" class="btn pm-plan-btn" onclick="pmPlanOpen()">View &amp; edit</button>
        <button type="button" class="btn pm-plan-btn" onclick="pmPlanBuild()">Rebuild</button>
      </div>
    </div>`;
}
function pmPlanChainHTML(shots){
  return shots.map(s=>`<span class="pm-ch"><b>${escapeHtml(s.club)}</b> ${ydNum(s.yd)}<i>${escapeHtml(s.aimTxt||'')}</i></span>`).join('<span class="pm-ch-arrow">→</span>');
}
function pmPlanHTML(){
  const c=pmSetupCourse();
  const head=`<div class="pm-pv-top"><button type="button" class="pm-pv-back" onclick="pmPlanClose()">‹ Back</button>
      <h2>Plan · ${escapeHtml(c?c.name||'Course':'')}</h2></div>`;
  if(window.pmPlanJob) return `<div class="pm-setup pm-pv">${head}
      <p class="pm-pv-prog" id="pm-plan-prog">Planning hole ${window.pmPlanJob.i+1} of ${window.pmPlanJob.n}…</p>
      <p class="pm-note">Each hole is solved from the tee with your clubs, your dispersion and today's pins, then on to the green.</p></div>`;
  const pl=c&&pmPlans()[pmCourseKey(c)];
  if(!pl) return `<div class="pm-setup pm-pv">${head}<button type="button" class="btn btn-primary" onclick="pmPlanBuild()">Plan this round</button></div>`;
  const t=pmPlanTotal(pl), f=v=>v==null?'—':v.toFixed(2);
  const holes=Object.values(pl.holes).sort((a,b)=>a.num-b.num).map(row=>{
    const note=`<input type="text" class="pm-ph-note" maxlength="140" placeholder="Note for this hole" value="${escapeHtml((pl.notes||{})[row.num]||'')}" onchange="pmPlanNote(${row.num}, this.value)">`;
    const hd=`<div class="pm-ph-h"><b>${row.num}</b><span>par ${row.par}${row.yards?` · ${ydNum(row.yards)} ${ydUnit()}`:''}</span><em>${f(pmPlanExp(row))}</em></div>`;
    if(row.method!=='model') return `<div class="pm-ph">${hd}<p class="pm-ph-none">${row.method==='baseline'?'No hole map to plan a line on, so this is the score for a hole that long. Re-import or trace it in My Courses.':'Not enough data on this hole to plan.'}</p>${note}</div>`;
    const opt=(k,lbl,shots,exp)=>`<button type="button" class="pm-ph-opt${row.pick===k?' on':''}" onclick="pmPlanPick(${row.num},'${k}')" aria-pressed="${row.pick===k}">
        <span class="pm-ph-k">${lbl}</span><span class="pm-ph-chain">${pmPlanChainHTML(shots)}</span><b>${f(exp)}</b></button>`;
    return `<div class="pm-ph">${hd}
      ${row.opt.length?opt('opt', row.same?'Optimal = yours':'Optimal', row.opt, row.expOpt):''}
      ${row.mine&&row.mine.length?opt('mine','Yours', row.mine, row.expMine):''}
      ${note}</div>`;
  }).join('');
  const d=t.exp-t.par;
  return `<div class="pm-setup pm-pv">${head}
      <div class="pm-pv-sum"><b>${t.exp.toFixed(1)}</b><span>${d>=0?'+':''}${d.toFixed(1)} vs par ${t.par} · made ${pmWhen(pl.madeAt)}${pl.sheet?` · ${escapeHtml(pl.sheet)}`:''}</span></div>
      <p class="pm-note">Pick a line for each hole and add what you want to remember. The numbers are expected strokes for the hole. At Start the plan is frozen onto the round, and nothing on the course works anything out again.</p>
      ${holes}
      <div class="pm-plan-row pm-pv-foot">
        <button type="button" class="btn pm-plan-btn" onclick="pmPlanBuild()">Rebuild</button>
        <button type="button" class="btn pm-plan-btn pm-plan-del" onclick="pmPlanDelete()">Delete plan</button>
      </div>
    </div>`;
}
/* ---- on the course: the frozen plan, as written ---- */
function pmPlanFor(h){
  const r=pmRound(); if(!r||!r.plan||!h) return null;
  return r.plan.holes[pmHoleNum(h, r.cur)] || null;
}
function pmPlanStripHTML(h, e){
  const p=pmPlanFor(h); if(!p) return '';
  const k=(e.shots||[]).length, S=p.shots||[];
  if(!S.length && !p.note) return '';
  const cur=S[k];
  return `<div class="pm-pstrip"><span class="pm-pstrip-k">Plan</span>
      <span class="pm-pstrip-c">${S.map((s,i)=>`<span class="${i===k?'cur':i<k?'done':''}"><b>${escapeHtml(s.club)}</b> ${ydNum(s.yd)}</span>`).join('<i>→</i>')}</span>
      ${cur&&cur.aimTxt?`<span class="pm-pstrip-a">${escapeHtml(cur.aimTxt)}</span>`:''}
      ${p.note?`<span class="pm-pstrip-n">“${escapeHtml(p.note)}”</span>`:''}</div>`;
}
/* The plan drawn on the hole: gold, dashed, each aim marked with its club. Stored points only;
   nothing is computed from where you are. */
function pmPlanSVG(h, pxPerUnit, fs){
  const p=pmPlanFor(h); if(!p||!p.shots||!p.shots.length) return '';
  const sw=2.5/pxPerUnit, rr=6/pxPerUnit, dash=`${(9/pxPerUnit).toFixed(1)},${(6/pxPerUnit).toFixed(1)}`;
  let s='';
  p.shots.forEach(q=>{ s+=`<line x1="${q.from.x}" y1="${q.from.y}" x2="${q.aim.x}" y2="${q.aim.y}" stroke="#f4d47a" stroke-width="${sw.toFixed(1)}" stroke-dasharray="${dash}" stroke-linecap="round"/>`; });
  p.shots.forEach(q=>{
    s+=`<circle cx="${q.aim.x}" cy="${q.aim.y}" r="${rr.toFixed(1)}" fill="#f4d47a" stroke="#14351d" stroke-width="${(1.5/pxPerUnit).toFixed(1)}"/>`;
    s+=`<text x="${(q.aim.x+rr*1.6).toFixed(1)}" y="${(q.aim.y+fs*0.35).toFixed(1)}" font-family="ui-monospace,monospace" font-size="${fs.toFixed(1)}" font-weight="700" fill="#f4d47a" stroke="#14351d" stroke-width="${(4/pxPerUnit).toFixed(1)}" paint-order="stroke">${escapeHtml(q.club)} ${ydNum(q.yd)}</text>`;
  });
  return s;
}
/* The planned shot you are about to hit, if you are where the plan expected you to be: on the
   tee for shot 1, within PM_PLAN_NEAR_YD of the planned spot after that. */
const PM_PLAN_NEAR_YD = 25;
function pmPlanAimFrom(h, P){
  const p=pmPlanFor(h); if(!p||!p.shots) return null;
  const ypu=cfYardsPerUnit(h)||1;
  let best=null, bd=1e9;
  p.shots.forEach(q=>{ const d=Math.hypot(q.from.x-P.x, q.from.y-P.y)*ypu; if(d<bd){ bd=d; best=q; } });
  return (best && bd<=PM_PLAN_NEAR_YD) ? best.aim : null;
}
function pmPlanLogHTML(r){
  if(!r||!r.plan) return '';
  return `<div class="pm-plan-log">Plan made ${pmWhen(r.plan.madeAt)}, frozen at the start of the round (${pmWhen(r.plan.frozenAt)})${r.plan.stale?' · made before the clubs, pins or preferences last changed':''}.</div>`;
}


/* ==================== EVERY SHOT: where it was played from ====================
   Strokes gained needs, for each shot, WHERE IT WAS PLAYED FROM: the situation and the
   distance to the hole. Not the shot's length — that falls out of consecutive starts, and a
   holed ball is zero. So each hole keeps an ordered list of starts:
       { lie, yd, src, pt?, ll?, pen?, edited? }
   lie  tee | fairway | rough | sand | recovery | green   (the six situations the baselines price)
   yd   distance to the hole in YARDS, always — a putt's feet are converted at the edge
   src  how it was captured: 'gps' (Mark ball), 'map' (placed on the hole), 'manual' (typed)
   pen  a penalty stroke AFTER this shot — the water ball, the OB tee shot
   THREE WAYS IN, ONE ROW, ALL EDITABLE: GPS marks your position; placing a shot on the map
   (tap or drag — no GPS needed, only the hole's scale) fills distance and situation from where
   it sits; typing fills them by hand. Whatever filled a field, the field can be changed.
   When a hole has shots, its score, putts and penalties are COUNTED from them, not entered.
   Strokes gained is computed at Finish and never shown during the round. */
const PM_LIES = [['tee','Tee'],['fairway','Fwy'],['rough','Rough'],['sand','Bunker'],['recovery','Recov.'],['green','Green']];
const PM_LIE_NAME = {tee:'Tee', fairway:'Fairway', rough:'Rough', sand:'Bunker', recovery:'Recovery', green:'Green'};
const PM_ARG_YD = 50;          /* around the green: within 50 yd of the hole (~30 from the edge, the Tour's line) */
window.pmPlacing = (window.pmPlacing==null) ? null : window.pmPlacing;
function pmCurEntry(){ const h=pmHole(), r=pmRound(); return (h&&r)?pmEntry(pmHoleNum(h,r.cur)):null; }
function pmShots(e){ return (e.shots=e.shots||[]); }
function pmShotsSync(e){
  const S=e.shots||[];
  if(!S.length) return;
  const pens=S.filter(x=>x.pen).length;
  e.s=S.length+pens; e.p=S.filter(x=>x.lie==='green').length; e.pen=pens;
  /* Fairway hit, from where the second shot was played: the shot list already says it, so
     the golfer should not have to say it twice. Missed left or right from where the ball was
     placed against the tee-to-hole line. A tap on the fairway buttons still wins. */
  const h=pmHole();
  if(h && (h.par||4)>=4 && S.length>=2 && e.fBy!=='hand'){
    const t=S[0], n=S[1], pin=cfPin(h), q=pmShotPt(h,n);
    if(t.pen || n.lie==='rough' || n.lie==='sand' || n.lie==='recovery'){
      let side='miss';
      if(q && h.tee && pin){
        const cr=(pin.x-h.tee.x)*(q.y-h.tee.y)-(pin.y-h.tee.y)*(q.x-h.tee.x);
        side = cr>0 ? 'right' : 'left';
      }
      e.f=side;
    } else if(n.lie==='fairway') e.f='hit';
    else e.f=null;              /* driven onto the green: not a fairway attempt either way */
  }
}
/* What the map says about a spot: the situation, and how far it is from today's hole. */
function pmShotAuto(h, pt, idx){
  const ypu=cfYardsPerUnit(h); if(ypu==null||!pt) return {};
  const onTee = idx===0 && h.tee && Math.hypot(pt.x-h.tee.x, pt.y-h.tee.y)*ypu < PM_AUTO_TEE_YD;
  const m = onTee ? 'tee' : cfLieAt(h, pt);
  const lie = {tee:'tee', fairway:'fairway', green:'green', sand:'sand', trees:'recovery', rough:'rough'}[m] || 'rough';
  const yd = cfDistToPinYd(h, pt);
  return {lie, yd: yd!=null ? Math.round(yd*10)/10 : null};
}
function pmShotsChanged(e){ pmShotsSync(e); pmTouch(); buildPlay(); pmSyncButtons(); }
/* a new shot on a hole marked finished means it was not finished */
function pmShotAdding(e){ if(e&&e.done) e.done=false; }
/* GPS: one tap where the ball lies, before you hit it. */
function pmMarkBall(){
  const h=pmHole(), e=pmCurEntry(), G=window.pmGps; if(!h||!e) return;
  if(!G.fix || !h.geo || G.fix.acc>PM_GPS_MAX_ERR_M){ toast(h.geo?'Waiting for a GPS fix':'This course needs re-importing for GPS'); return; }
  const pt=cfLatLonToField(h, G.fix.lat, G.fix.lon), S=pmShots(e); pmShotAdding(e);
  const a=pmShotAuto(h, pt, S.length);
  S.push({lie:a.lie||'fairway', yd:a.yd, src:'gps', pt, ll:{lat:G.fix.lat, lon:G.fix.lon, acc:G.fix.acc}});
  pmShotsChanged(e);
  if(a.lie==='green') toast(`Marked on the green \u2014 GPS is \u00b1${Math.round(G.fix.acc*3.28)} ft, so check the putt length`);
}
/* MAP: a new shot, placed straight away. It starts where the last one would have gone if you
   know nothing else — the middle of the line from the previous start to the hole. */
function pmShotAddOnMap(){
  const h=pmHole(), e=pmCurEntry(); if(!h||!e) return;
  const S=pmShots(e), prev=S.length?pmShotPt(h,S[S.length-1]):h.tee, pin=cfPin(h); pmShotAdding(e);
  const pt = !S.length ? {x:h.tee.x, y:h.tee.y}
           : (prev&&pin) ? {x:Math.round((prev.x+pin.x)/2), y:Math.round((prev.y+pin.y)/2)} : null;
  const a=pt?pmShotAuto(h, pt, S.length):{};
  S.push({lie:a.lie||'fairway', yd:a.yd, src:'map', pt});
  window.pmPlacing=S.length-1; window.pmSheetOpen=false; window.pmView='map';
  pmShotsChanged(e);
}
function pmShotPlace(i){ window.pmPlacing=i; window.pmSheetOpen=false; window.pmView='map'; buildPlay(); }
function pmShotPlaceDone(){ window.pmPlacing=null; buildPlay(); }
/* Dragging or tapping a placed shot: distance and situation follow it. Re-placing overwrites
   both — the drag is the newer, more deliberate input — and they stay editable afterwards. */
function pmShotPlaceAt(pt){
  const h=pmHole(), e=pmCurEntry(), i=window.pmPlacing; if(!h||!e||i==null) return;
  const S=pmShots(e), sh=S[i]; if(!sh) return;
  const a=pmShotAuto(h, pt, i);
  Object.assign(sh, {pt, lie:a.lie||sh.lie, yd:a.yd, src:'map', edited:false}); delete sh.ll;
  pmShotsSync(e); pmTouch(); pmRenderBody();
}
function pmShotPt(h, sh){
  if(sh.pt) return sh.pt;
  if(sh.ll && h.geo) return cfLatLonToField(h, sh.ll.lat, sh.ll.lon);
  return null;
}
function pmShotSetLie(i, lie){ const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return; e.shots[i].lie=lie; e.shots[i].edited=true; pmShotsChanged(e); }
/* typed in the DISPLAYED unit — feet on the green, yards (or metres) elsewhere — stored in yards */
function pmShotSetDist(i, val){
  const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return;
  const sh=e.shots[i], v=parseFloat(val);
  if(!isFinite(v)||v<0){ sh.yd=null; }
  else sh.yd = sh.lie==='green' ? Math.round(fromDisplay('short', v)/3*100)/100 : Math.round(fromDisplay('distance', v)*10)/10;
  sh.edited=true; pmShotsSync(e); pmTouch(); pmSyncButtons();
}
function pmShotTogglePen(i){ const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return; e.shots[i].pen=!e.shots[i].pen; pmShotsChanged(e); }
function pmShotDel(i){
  const e=pmCurEntry(); if(!e||!e.shots) return;
  e.shots.splice(i,1); if(window.pmPlacing!=null) window.pmPlacing=null;
  if(!e.shots.length){ delete e.shots; }
  pmShotsChanged(e);
}
/* "How many shots?" — the rows built from a count, with what is known filled in: the tee shot
   at the hole's length, the last ones on the green when the putts are known. */
function pmShotsFill(n){
  const h=pmHole(), e=pmCurEntry(); if(!h||!e) return;
  const putts = e.p!=null ? Math.min(e.p, n-1) : Math.min(2, n-1);
  const holeYd = h.tee ? cfDistToPinYd(h, h.tee) : null;
  e.shots=[];
  for(let k=0;k<n;k++){
    if(k===0) e.shots.push({lie:'tee', yd:holeYd!=null?Math.round(holeYd):null, src:'manual'});
    else if(k>=n-putts) e.shots.push({lie:'green', yd:null, src:'manual'});
    else e.shots.push({lie:'fairway', yd:null, src:'manual'});
  }
  pmShotsChanged(e);
}
function pmShotsClear(){
  const e=pmCurEntry(); if(!e||!e.shots) return;
  if(!confirm('Clear every shot logged on this hole?')) return;
  delete e.shots; window.pmPlacing=null; pmTouch(); buildPlay(); pmSyncButtons();
}


/* Holed out: the shot list is complete and the hole counts. Walking off does the same. */
function pmHoledOut(){
  const e=pmCurEntry(); if(!e||!e.shots||!e.shots.length) return;
  e.done=true; window.pmPlacing=null; pmTouch(); buildPlay(); pmSyncButtons();
}
function pmShotReopen(){ const e=pmCurEntry(); if(e){ e.done=false; pmTouch(); buildPlay(); pmSyncButtons(); } }

/* ---- STROKES GAINED, after the round ----
   Per shot: SG = E(start) - E(next start) - 1 - penalty, with E(holed) = 0, priced on the
   app-wide benchmark (Settings). Summed by category the way the Tour reports it: off the tee
   (tee shots on par 4s and 5s), approach, around the green (within PM_ARG_YD), putting.
   A hole counts only when every shot on it has a distance; the rest are reported, not guessed. */
function pmShotE(sh, hcp){
  if(sh.yd==null) return null;
  return srForPlayer(sh.lie, sh.lie==='green' ? Math.max(0.5, sh.yd*3) : Math.max(1, sh.yd), hcp);
}
function pmRoundSG(r){
  const c=(STATE.courses||[]).find(x=>(x.id||x.name)===r.courseKey);
  const hs=(c&&c.holes)||[];
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  const cat={ott:0, app:0, arg:0, putt:0}, n={ott:0, app:0, arg:0, putt:0};
  let holes=0, incomplete=0, total=0, shots=0;
  hs.forEach((h,i)=>{
    const e=(r.holes||{})[pmHoleNum(h,i)]; const S=e&&e.shots;
    if(!S||!S.length) return;
    if(S.some(x=>x.yd==null||!x.lie)){ incomplete++; return; }
    holes++;
    S.forEach((sh,k)=>{
      const a=pmShotE(sh, bench.hcp), nx=S[k+1], b=nx?pmShotE(nx, bench.hcp):0;
      if(a==null||b==null) return;
      const sg=a-b-1-(sh.pen?1:0);
      const k2 = sh.lie==='green' ? 'putt' : (sh.lie==='tee' && (h.par||4)>=4) ? 'ott' : sh.yd<=PM_ARG_YD ? 'arg' : 'app';
      cat[k2]+=sg; n[k2]++; total+=sg; shots++;
      sh.sg=Math.round(sg*1000)/1000; sh.cat=k2;
    });
  });
  return {bench:bench.short, total, cat, n, holes, incomplete, shots};
}
/* Post-Round: the strokes gained from the round just saved, measured shot by shot. */
function pmSgCardHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; const r=R[R.length-1];
  if(!r||!r.sg||!r.sg.holes) return '';
  const g=r.sg, f=x=>`${x>=0?'+':''}${x.toFixed(2)}`;
  const cell=(k,l)=>`<div class="pm-sg-cell"><span>${l}</span><b class="${g.cat[k]<0?'neg':''}">${g.n[k]?f(g.cat[k]):'\u2014'}</b><i>${g.n[k]} shot${g.n[k]===1?'':'s'}</i></div>`;
  return `<div class="profile-card pm-sg-card">
      <h3>Strokes Gained \u2014 ${escapeHtml(r.courseName||'last round')} <span style="font-weight:400">vs ${escapeHtml(g.bench)}</span></h3>
      <div class="pm-sg-total"><b class="${g.total<0?'neg':''}">${f(g.total)}</b> <span>from ${g.shots} shots on ${g.holes} hole${g.holes===1?'':'s'}</span></div>
      <div class="pm-sg-grid">${cell('ott','Off the tee')}${cell('app','Approach')}${cell('arg','Around the green')}${cell('putt','Putting')}</div>
      ${g.incomplete?`<p class="gen-note">${g.incomplete} hole${g.incomplete===1?' has':'s have'} a shot with no distance, so ${g.incomplete===1?'it is':'they are'} left out rather than guessed.</p>`:''}
    </div>`;
}

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

/* ==================== THE MAP — the Play screen ====================
   GPS-CENTRIC: the hole, with you on it, and the three numbers that matter over the top of it.
   Everything else is one gesture away: TAP anywhere on the hole to measure to it — how far
   from you, and how far it leaves to the green.

   TWO DEPTHS, one screen:
     a CASUAL round adds the Hole Overlay's thinking, live from where you stand — the
       optimiser's shot from your position, and the shot you tapped scored against it: club,
       where it lands, shots left, strokes gained against the app-wide benchmark, cover numbers.
     a TOURNAMENT round shows the same map and the same tap, and DISTANCES ONLY. The strategy
       layer is not hidden there; pmStrategyAllowed() is false and none of it is computed. A
       hidden number is one CSS change from shown, which is not a rule a Committee can rely on. */
window.pmTarget = window.pmTarget || null;     /* the tapped spot on this hole, field units */
window.pmSheetOpen = !!window.pmSheetOpen;
if(window.pmStratOn===undefined) window.pmStratOn = true;
function pmStrategyAllowed(){ return !pmTourn() && typeof optimiseShot==='function' && typeof stratScoreShot==='function'; }
function pmSetTarget(pt){ window.pmTarget=pt; pmRenderBody(); }
function pmClearTarget(){ window.pmTarget=null; pmRenderBody(); }
function pmToggleSheet(){ window.pmSheetOpen=!window.pmSheetOpen; pmRenderBody(); }
function pmToggleStrat(){ if(pmTourn()) return; window.pmStratOn=!window.pmStratOn; pmRenderBody(); }

/* The visible area: from where you stand to just past the green, padded to the shape of the box
   it is drawn in. From the tee that is the whole hole; from 150 out it is the last 150 and the
   green, at more than twice the scale. Never closer than PM_MIN_SPAN_YD, or the flag and tee
   markers — drawn in field units — would fill the screen. */
const PM_MIN_SPAN_YD = 200;
function pmMapBox(h, P, extra, ratio){
  const ypu=cfYardsPerUnit(h)||1, u=1/ypu;                 /* field units per yard */
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  const eat=q=>{ if(!q||q.x==null) return; x0=Math.min(x0,q.x); x1=Math.max(x1,q.x); y0=Math.min(y0,q.y); y1=Math.max(y1,q.y); };
  eat(P); (h.green&&h.green.length?h.green:[cfPin(h)]).forEach(eat); (extra||[]).forEach(eat);
  const onTee = h.tee && Math.hypot(P.x-h.tee.x, P.y-h.tee.y) < 3;
  if(onTee){ (h.fairway||[]).forEach(eat); eat(h.tee); }
  let w=x1-x0, hh=y1-y0;
  const pad=Math.max(25*u, 0.12*Math.max(w,hh));
  x0-=pad; x1+=pad; y0-=pad; y1+=pad; w=x1-x0; hh=y1-y0;
  const minSpan=PM_MIN_SPAN_YD*u;
  if(hh<minSpan){ const c=(y0+y1)/2; y0=c-minSpan/2; hh=minSpan; }
  if(w<minSpan*ratio){ const c=(x0+x1)/2; x0=c-minSpan*ratio/2; w=minSpan*ratio; }
  /* Room for what floats OVER the map: front/middle/back across the top, the GPS line along the
     bottom. Without it the panel sat on the green, which is the one thing it is about. */
  const topRes=0.17, botRes=0.07;
  y0-=hh*topRes/(1-topRes-botRes); const nh0=hh/(1-topRes-botRes); hh=nh0;
  if(w/hh>ratio){ const nh=w/ratio; y0-=(nh-hh)*topRes/(topRes+botRes); hh=nh; } else { const nw=hh*ratio; x0-=(nw-w)/2; w=nw; }
  return {x:x0, y:y0, w, h:hh};
}
/* The optimiser from wherever you are, cached by position (2-unit grid) so a GPS fix that
   jitters by a metre does not re-solve the hole every few seconds. */
const PM_OPT_CACHE = new Map();
function pmOptimal(h, P){
  const key=[pmHoleNum(h,(pmRound()||{}).cur||0), Math.round(P.x/2), Math.round(P.y/2), stratPosture(), stratSkillKey(), window.stratCacheEpoch||0].join('|');
  if(PM_OPT_CACHE.has(key)) return PM_OPT_CACHE.get(key);
  let out;
  try{
    const res=optimiseShot(h, P, {posture:stratPosture(), hcp:PLAYER});
    if(res && !res.blocked && res.best){
      const aim={x:Math.round(res.best.aim.x), y:Math.round(res.best.aim.y)};
      out={ r:stratScoreShot(h, P, aim), res };
    } else out={ blocked:(res&&res.blocked)||'none' };
  }catch(e){ out={ blocked:'error' }; }
  if(PM_OPT_CACHE.size>80) PM_OPT_CACHE.clear();
  PM_OPT_CACHE.set(key, out);
  return out;
}
/* Your shot: the spot you tapped; failing that your strategy preferences, but only where they
   are defined from here — a tee shot or an approach. A lay-up preference is anchored to the
   tee-shot chain and would score a line nobody would play from the middle of a par 5. */
function pmYours(h, P){
  let aim=window.pmTarget, src='target';
  if(!aim){ const pa=pmPlanAimFrom(h, P); if(pa){ aim=pa; src='plan'; } }
  if(!aim && typeof stratPrefAim==='function'){
    const onTee = h.tee && Math.hypot(P.x-h.tee.x, P.y-h.tee.y) < 3;
    const kind = typeof stratPrefKind==='function' ? stratPrefKind(h, P) : null;
    if(onTee || kind==='approach'){ aim=stratPrefAim(h, P, 1); src='plan'; }
  }
  if(!aim) return null;
  try{ const r=stratScoreShot(h, P, aim); return r&&!r.blocked ? Object.assign(r,{src}) : null; }catch(e){ return null; }
}
/* What to call where the numbers come from — said every time, and why when it is not GPS. */
function pmSrcText(h, pos){
  const G=window.pmGps;
  return pos.src==='gps' ? `GPS \u00b7 \u00b1${Math.round(pos.acc)} m`
       : pos.src==='shot' ? `From shot ${pos.n}, where you placed it`
       : pos.src==='far' ? `GPS says you are ${pos.away!=null?ydNum(pos.away)+' '+ydUnit():'well'} from this green \u2014 from the tee`
       : pos.src==='coarse' ? `GPS \u00b1${Math.round(pos.acc)} m is too coarse \u2014 from the tee`
       : G.err ? `${G.err} \u2014 from the tee`
       : !h.geo ? 'From the tee \u2014 re-import this course in My Courses for GPS'
       : 'From the tee';
}
function pmMapHTML(h, r){
  const pos=pmPos(h), P=pos.pt, G=window.pmGps;
  const gn=pmGreenNumbers(h, P);
  const n=v=>v==null?'\u2014':ydNum(v);
  const strat = pmStrategyAllowed() && window.pmStratOn;
  const opt  = (strat && gn && !gn.onGreen) ? pmOptimal(h, P) : null;
  let mine = (strat && gn && !gn.onGreen) ? pmYours(h, P) : null;
  /* When your plan IS the optimal shot — common on an approach, where both aim at the middle —
     drawing both put two identical labels on top of each other. Say it once, and say that they
     agree. A tapped target is always shown: you asked about that spot specifically. */
  const ypuM=cfYardsPerUnit(h)||1;
  const same = mine && mine.src==='plan' && opt && opt.r && opt.r.aim &&
               Math.hypot(mine.aim.x-opt.r.aim.x, mine.aim.y-opt.r.aim.y)*ypuM < 3;
  if(same){ opt.r.planMatches=true; mine=null; }
  const T=window.pmTarget;
  /* the box: measured, so the crop is the shape of the screen it is drawn on */
  const vw=Math.min(window.innerWidth||375, 640);
  /* the walk-off score prompt sits above the map while it is open; the map gives up that room
     rather than pushing the sheet off the bottom of the screen */
  const chrome = 60 + (pmTourn()?24:0) + 58 + (strat?112:66) + (window.pmAskScore!=null?212:0) + (pmPlanFor(h)?30:0);
  const vh=Math.max(280, (window.innerHeight||812) - chrome);
  const extra=[T, opt&&opt.r&&opt.r.aim, mine&&mine.aim].filter(Boolean);
  const box=pmMapBox(h, P, extra, vw/vh);
  const pxPerUnit = vw/box.w;
  /* labels at a constant ~14px on screen, whatever the zoom */
  const k = 14/(30*pxPerUnit);
  const fs = 13/pxPerUnit;
  let ov='';
  if(strat){
    const yOf=q=>q&&q.aim?q.aim.y:0;
    const both=opt&&opt.r&&mine;
    if(opt&&opt.r) ov+=stratShotSVG(h, opt.r, 'O', 1, 'full', both&&yOf(opt.r)>yOf(mine)?'below':'above', k);
    if(mine)       ov+=stratShotSVG(h, mine,  'S', 1, 'full', both&&yOf(opt.r)<=yOf(mine)?'below':'above', k);
  } else ov+=pmPlanSVG(h, pxPerUnit, fs);
  if(!strat && T){
    /* TOURNAMENT (or strategy off): measurement only — you to the spot, the spot to the green */
    const mid=cfGreenMid(h)||cfPin(h);
    const d1=cfDistYd(h,P,T), d2=mid?cfDistYd(h,T,mid):null;
    const sw=2.5/pxPerUnit, r0=7/pxPerUnit;
    const tl=(x,y,txt,anchor)=>`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor||'middle'}" font-family="ui-monospace,monospace" font-size="${fs.toFixed(1)}" font-weight="700" fill="#fff" stroke="#14351d" stroke-width="${(4/pxPerUnit).toFixed(1)}" paint-order="stroke">${txt}</text>`;
    ov+=`<line x1="${P.x}" y1="${P.y}" x2="${T.x}" y2="${T.y}" stroke="#fff" stroke-width="${sw.toFixed(1)}" stroke-dasharray="${(8/pxPerUnit).toFixed(1)},${(6/pxPerUnit).toFixed(1)}"/>`;
    if(mid) ov+=`<line x1="${T.x}" y1="${T.y}" x2="${mid.x}" y2="${mid.y}" stroke="#fff" stroke-opacity=".6" stroke-width="${(sw*0.7).toFixed(1)}" stroke-dasharray="${(4/pxPerUnit).toFixed(1)},${(5/pxPerUnit).toFixed(1)}"/>`;
    ov+=`<circle cx="${T.x}" cy="${T.y}" r="${r0.toFixed(1)}" fill="none" stroke="#fff" stroke-width="${sw.toFixed(1)}"/>`;
    ov+=tl(T.x, T.y-r0-fs*0.6, `${n(d1)} ${ydUnit()}`);
    if(d2!=null) ov+=tl(T.x, T.y+r0+fs*1.3, `${n(d2)} to middle`);
  }
  /* THE SHOTS logged on this hole, numbered, joined start to start and on to the hole */
  const Sx=(pmEntry(pmHoleNum(h,r.cur)).shots)||[];
  if(Sx.length){
    const pts=Sx.map(sh=>pmShotPt(h,sh)), pin=cfPin(h), rr=9/pxPerUnit, sw2=2/pxPerUnit;
    let path=''; let prev=null;
    pts.forEach(q=>{ if(q&&prev) path+=`<line x1="${prev.x}" y1="${prev.y}" x2="${q.x}" y2="${q.y}" stroke="#fff" stroke-opacity=".85" stroke-width="${sw2.toFixed(1)}"/>`; if(q) prev=q; });
    if(prev&&pin) path+=`<line x1="${prev.x}" y1="${prev.y}" x2="${pin.x}" y2="${pin.y}" stroke="#fff" stroke-opacity=".45" stroke-width="${sw2.toFixed(1)}" stroke-dasharray="${(4/pxPerUnit).toFixed(1)},${(4/pxPerUnit).toFixed(1)}"/>`;
    ov+=path;
    pts.forEach((q,i)=>{ if(!q) return; const on=window.pmPlacing===i;
      ov+=`<circle cx="${q.x}" cy="${q.y}" r="${(on?rr*1.35:rr).toFixed(1)}" fill="${on?'#f4d47a':'#fff'}" stroke="#14351d" stroke-width="${(2/pxPerUnit).toFixed(1)}"/>
        <text x="${q.x}" y="${(q.y+rr*0.42).toFixed(1)}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="${(11/pxPerUnit).toFixed(1)}" fill="#14351d">${i+1}</text>`; });
  }
  /* you: a blue dot with its accuracy as a ring, the way every map app draws it */
  if(pos.src==='gps'){
    const ypu=cfYardsPerUnit(h)||1, accU=(pos.acc*1.09361)/ypu;
    ov+=`<circle cx="${P.x}" cy="${P.y}" r="${accU.toFixed(1)}" fill="#2f7dff" fill-opacity=".14" stroke="#2f7dff" stroke-opacity=".4" stroke-width="${(1/pxPerUnit).toFixed(1)}"/>
      <circle cx="${P.x}" cy="${P.y}" r="${(8/pxPerUnit).toFixed(1)}" fill="#2f7dff" stroke="#fff" stroke-width="${(3/pxPerUnit).toFixed(1)}"/>`;
  }
  const gpsBtn = (pos.src==='tee' && h.geo && G.watch==null && !G.err)
    ? `<button type="button" class="pm-gps-btn" onclick="pmGpsStart(true)">Use GPS</button>` : '';
  const fmb = (gn&&gn.onGreen) ? `<div class="pm-float pm-float-green">On the green</div>`
    : `<div class="pm-float">
        <div><span>Front</span><b>${n(gn&&gn.front)}</b></div>
        <div class="pm-mid"><span>Middle</span><b>${n(gn&&gn.mid)}</b></div>
        <div><span>Back</span><b>${n(gn&&gn.back)}</b></div>
        ${gn&&gn.pin!=null?`<div class="pm-float-pin">pin ${n(gn.pin)}</div>`:''}
      </div>`;
  const placing = window.pmPlacing!=null && Sx[window.pmPlacing];
  return `<div class="pm-mapwrap${placing?' pm-placing':''}" style="height:${vh}px">
      ${placing?`<div class="pm-place-banner">Shot ${window.pmPlacing+1}: tap or drag on the hole
          <b>${PM_LIE_NAME[Sx[window.pmPlacing].lie]||''} \u00b7 ${Sx[window.pmPlacing].yd==null?'\u2014':(Sx[window.pmPlacing].lie==='green'?ftNum(Sx[window.pmPlacing].yd*3)+' '+ftUnit():ydNum(Sx[window.pmPlacing].yd)+' '+ydUnit())}</b>
          <button type="button" onclick="pmShotPlaceDone()">Done</button></div>`:fmb}
      <div class="pm-map" id="pm-map">${renderHoleSVG(h,{viewBox:box, overlay:ov})}</div>
      <div class="pm-src pm-src-float">${pmSrcText(h,pos)}${gpsBtn}</div>
      ${T?`<button type="button" class="pm-clear" onclick="pmClearTarget()" aria-label="Clear the measured spot">\u2715 target</button>`:
         `<div class="pm-hint">Tap the hole to measure${strat?' and score a shot':''}</div>`}
    </div>
    ${pmSheetHTML(h, r, {gn, pos, opt, mine, strat})}`;
}
/* THE SHEET under the map. Collapsed it is the answer — the two plans side by side in a
   casual round, the score in a tournament one — and expanded it is the working and the card. */
function pmSheetHTML(h, r, c){
  const e=pmEntry(pmHoleNum(h,r.cur)), par=h.par||4, d=pmDerived(h,e);
  const S=e.shots||[];
  const open=!!window.pmSheetOpen;
  const n=v=>v==null?'\u2014':ydNum(v);
  const sgTxt=x=>x==null?'':`${x>=0?'+':''}${x.toFixed(2)}`;
  const plan=(lbl,cls,q)=>{
    if(!q) return '';
    const left=q.sgActual?q.expAfter:q.mean;
    return `<div class="pm-plan ${cls}"><span class="pm-plan-k">${lbl}</span>
      <span class="pm-plan-club">${escapeHtml(q.shot&&q.shot.label||'')}</span>
      <span class="pm-plan-v">${n(q.geoYd)}</span>
      <span class="pm-plan-left">${left!=null?left.toFixed(2):'\u2014'}<i>left</i></span>
      <span class="pm-plan-sg${q.sg!=null&&q.sg<0?' neg':''}">${sgTxt(q.sg)}<i>SG</i></span></div>`;
  };
  const blockedTxt = c.opt&&c.opt.blocked ? ({chip:'Inside 20 \u2014 a chip or pitch', green:'On the green', penalty:'Take relief', range:'Out of range for the bag'}[c.opt.blocked]||'') : '';
  const plans = c.strat ? `${c.opt&&c.opt.r?plan(c.opt.r.planMatches?'Optimal = yours':'Optimal','ln-O',c.opt.r):(blockedTxt?`<div class="pm-plan-note">${blockedTxt}</div>`:'')}
      ${plan(c.mine&&c.mine.src==='target'?'Your target':'Your plan','ln-S',c.mine)}` : '';
  const scoreLine=`<button type="button" class="pm-score-line" onclick="pmToggleSheet()" aria-expanded="${open}">
      ${S.length&&!e.done?`<span>Shots so far <b>${S.length}</b></span>`:`<span>Score <b>${e.s!=null?e.s:'\u2014'}</b></span><span>Putts <b>${e.p!=null?e.p:'\u2014'}</b></span>`}
      <span class="pm-score-caret">${open?'\u25be':'\u25b4'}</span></button>`;
  const G=window.pmGps, gpsOk=!!(G.fix && h.geo && G.fix.acc<=PM_GPS_MAX_ERR_M);
  /* THE SHOT BAR — always there, collapsed or not: the one tap you make standing over the ball */
  const shotBar=`<div class="pm-shotbar">
      ${e.done?`<span class="pm-shotbar-n">Holed in ${e.s} <button type="button" class="pm-reopen" onclick="pmShotReopen()">reopen</button></span>`
       :`<span class="pm-shotbar-n">${S.length?`Shot ${S.length+1}`:'Shot 1'}</span>
      ${gpsOk?`<button type="button" class="pm-mark" onclick="pmMarkBall()">\u25ce Mark ball</button>`:''}
      <button type="button" class="pm-mark pm-mark-map" onclick="pmShotAddOnMap()">\u271a On the map</button>
      ${S.length&&S[S.length-1].lie==='green'?`<button type="button" class="pm-mark pm-holed" onclick="pmHoledOut()">\u2713 Holed</button>`:''}`}
    </div>`;
  const pstrip=pmPlanStripHTML(h, e);
  if(!open) return `<div class="pm-sheet">${plans}${pstrip}${shotBar}${scoreLine}</div>`;
  /* ---- expanded ---- */
  const covers=(c.gn&&!c.gn.onGreen) ? cfCoverNumbers(h, c.pos.pt, cfGreenMid(h)||cfPin(h)).filter(x=>!x.inside&&x.cover>5).slice(0,4) : [];
  const mixOrder=['fairway','green','rough','sand','trees','water','oob'];
  const lands=q=>{ if(!q||!q.lieMix) return ''; const best=mixOrder.filter(k=>q.lieMix[k]>0).sort((a,b)=>q.lieMix[b]-q.lieMix[a])[0];
    return best?`${CF_LIE_LABEL[best]} ${Math.round(q.lieMix[best]*100)}%`:''; };
  const detail = c.strat ? (()=>{
    const rows=[['Optimal',c.opt&&c.opt.r],[c.mine&&c.mine.src==='target'?'Your target':'Your plan',c.mine]].filter(x=>x[1]);
    const cmp=(c.opt&&c.opt.r&&c.mine)? (()=>{ const a=c.opt.r, b=c.mine; const la=a.sgActual?a.expAfter:a.mean, lb=b.sgActual?b.expAfter:b.mean;
        const g=lb-la; return Math.abs(g)<0.03?'The two are level on expected strokes.':g>0?`Your shot costs <b>+${g.toFixed(2)}</b> against the optimal one.`:`Your shot gains <b>${(-g).toFixed(2)}</b> on the optimal one.`; })() : '';
    return `<div class="pm-detail">${rows.map(([l,q])=>`<div class="pm-detail-row"><b>${l}</b>
        <span>${escapeHtml(q.shot&&q.shot.label||'')} \u00b7 ${n(q.geoYd)} ${ydUnit()}</span>
        <span>lands ${lands(q)}</span>
        <span>${q.toMidYd!=null?n(q.toMidYd)+' to middle':''}</span>
        <span>SG vs ${escapeHtml(q.sgBench||'scratch')} ${sgTxt(q.sg)}</span></div>`).join('')}
      ${cmp?`<div class="pm-detail-cmp">${cmp}</div>`:''}</div>`;
  })() : '';
  const step=(key,label,val)=>`<div class="pm-step-row"><span class="pm-step-l">${label}</span>
      <div class="pm-stepper"><button type="button" onclick="pmAdj('${key}',-1)" aria-label="${label} minus one">\u2212</button>
      <span class="pm-step-v">${val==null?'\u2014':val}</span>
      <button type="button" onclick="pmAdj('${key}',1)" aria-label="${label} plus one">+</button></div></div>`;
  return `<div class="pm-sheet open">
      ${plans}${pstrip}${shotBar}${scoreLine}
      ${detail}
      ${covers.length?`<div class="pm-covers">${covers.map(x=>`<div class="pm-cover"><span>${escapeHtml(x.label)}</span>reach <b>${n(x.starts)}</b> \u00b7 carry <b>${n(x.cover)}</b></div>`).join('')}</div>`:''}
      ${pmShotListHTML(h, e)}
      <div class="pm-score">
        ${S.length?`<div class="pm-step-row"><span class="pm-step-l">${e.done?'Score':'So far'}</span><span class="pm-derived">${e.s} <i>counted from ${S.length} shot${S.length===1?'':'s'}${e.pen?` + ${e.pen} penalty`:''}</i></span></div>
          <div class="pm-step-row"><span class="pm-step-l">Putts</span><span class="pm-derived">${e.p}</span></div>`
        :`${step('s','Score',e.s)}
        ${step('p','Putts',e.p)}`}
        ${par>=4?`<div class="pm-step-row"><span class="pm-step-l">Fairway</span><div class="pm-seg">
          ${[['left','\u2190 Left'],['hit','Hit'],['right','Right \u2192']].map(([k,l])=>`<button type="button" class="${e.f===k?'on':''}" onclick="pmSetFw('${k}')" aria-pressed="${e.f===k}">${l}</button>`).join('')}
        </div></div>`:''}
        ${S.length?'':step('pen','Penalties',e.pen==null?0:e.pen)}
        <div class="pm-chips">
          <button type="button" class="pm-chip${e.sand?' on':''}" onclick="pmToggleSand()" aria-pressed="${!!e.sand}">Bunker</button>
          ${d.gir!=null?`<span class="pm-chip ro${d.gir?' on':''}">${d.gir?'GIR':'Missed green'}</span>`:''}
          ${d.udAtt?`<span class="pm-chip ro${d.udMade?' on':''}">${d.udMade?'Up and down':'No up and down'}</span>`:''}
          ${pmTourn()?'':`<button type="button" class="pm-chip${window.pmStratOn?' on':''}" onclick="pmToggleStrat()" aria-pressed="${!!window.pmStratOn}">Strategy</button>`}
        </div>
        <button type="button" class="btn btn-primary pm-next" onclick="pmStep(1)">Next hole \u203a</button>
      </div>
    </div>`;
}

/* The shot list in the expanded sheet: one row per shot, every field editable, the source of
   each shown — GPS, placed on the map, or typed — so a number is never more trusted than it is. */
function pmShotListHTML(h, e){
  const S=e.shots||[];
  if(!S.length){
    const par=h.par||4, opts=[]; for(let v=Math.max(1,par-1); v<=par+4; v++) opts.push(v);
    return `<div class="pm-shots pm-shots-empty">
        <div class="pm-shots-h">Shots <span>for strokes gained after the round</span></div>
        <div class="pm-shots-fill">How many shots? ${opts.map(v=>`<button type="button" onclick="pmShotsFill(${v})">${v}</button>`).join('')}</div>
        <p class="pm-note">Or mark each ball by GPS, or place it on the map, as you go.</p>
      </div>`;
  }
  const srcTxt={gps:'GPS', map:'map', manual:'typed'};
  const rows=S.map((sh,i)=>{
    const green=sh.lie==='green';
    const val = sh.yd==null ? '' : green ? ftNum(sh.yd*3) : ydNum(sh.yd);
    return `<div class="pm-shot${window.pmPlacing===i?' placing':''}${sh.yd==null?' missing':''}">
        <div class="pm-shot-top">
          <span class="pm-shot-n">${i+1}</span>
          <div class="pm-shot-lies">${PM_LIES.map(([k,l])=>`<button type="button" class="${sh.lie===k?'on':''}" onclick="pmShotSetLie(${i},'${k}')">${l}</button>`).join('')}</div>
        </div>
        <div class="pm-shot-bot">
          <label class="pm-shot-d"><input type="number" inputmode="decimal" min="0" step="${green?0.5:1}" value="${val}" placeholder="\\u2014"
            onchange="pmShotSetDist(${i},this.value)"><i>${green?ftUnit():ydUnit()} to hole</i></label>
          <span class="pm-shot-src">${srcTxt[sh.src]||sh.src}${sh.edited?', edited':''}</span>
          <button type="button" class="pm-shot-btn" onclick="pmShotPlace(${i})" title="Place this shot on the map">\u271a map</button>
          <button type="button" class="pm-shot-btn${sh.pen?' on':''}" onclick="pmShotTogglePen(${i})" title="A penalty stroke after this shot">+1 pen</button>
          <button type="button" class="pm-shot-btn pm-shot-del" onclick="pmShotDel(${i})" aria-label="Delete shot ${i+1}">\u2715</button>
        </div>
      </div>`;
  }).join('');
  return `<div class="pm-shots">
      <div class="pm-shots-h">Shots <span>where each was played from</span>
        <button type="button" class="pm-shots-clear" onclick="pmShotsClear()">clear</button></div>
      ${rows}
      <button type="button" class="pm-shot-add" onclick="pmShotsAddTyped()">+ Add a shot</button>
    </div>`;
}
function pmShotsAddTyped(){ const e=pmCurEntry(); if(!e) return; pmShotAdding(e); const S=pmShots(e); const last=S[S.length-1];
  S.push({lie:last&&last.lie==='green'?'green':'fairway', yd:null, src:'manual'}); pmShotsChanged(e); }

/* Tap the hole to measure. A tap, not a drag: the finger has to come up within a few pixels
   of where it went down, so scrolling the sheet or a stray brush is not a measurement. */
if(!window.pmMapHooked){
  window.pmMapHooked=true;
  let down=null;
  const ptAt=(ev)=>{
    const m=document.querySelector('#pm-map'); const svg=m&&m.querySelector('svg'); if(!svg) return null;
    const rc=svg.getBoundingClientRect(); if(!rc.width) return null;
    const vb=(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number); if(vb.length!==4) return null;
    return { x:Math.round(vb[0]+(ev.clientX-rc.left)/rc.width*vb[2]), y:Math.round(vb[1]+(ev.clientY-rc.top)/rc.height*vb[3]) };
  };
  let dragLast=0;
  document.addEventListener('pointerdown', ev=>{
    const m=ev.target.closest&&ev.target.closest('#pm-map'); down=m?{x:ev.clientX, y:ev.clientY, placing:window.pmPlacing!=null}:null;
    /* placing: the shot jumps to the finger at once, then follows it */
    if(down&&down.placing){ const q=ptAt(ev); if(q) pmShotPlaceAt(q); ev.preventDefault(); }
  });
  document.addEventListener('pointermove', ev=>{
    if(!down||!down.placing) return;
    const now=Date.now(); if(now-dragLast<60) return; dragLast=now;
    const q=ptAt(ev); if(q) pmShotPlaceAt(q);
  });
  document.addEventListener('pointerup', ev=>{
    if(!down) return;
    const m=ev.target.closest&&ev.target.closest('#pm-map');
    const moved=Math.hypot(ev.clientX-down.x, ev.clientY-down.y);
    if(down.placing){ const q=ptAt(ev); if(q) pmShotPlaceAt(q); down=null; return; }
    down=null;
    if(!m||moved>10) return;
    const svg=m.querySelector('svg'); if(!svg) return;
    const rc=svg.getBoundingClientRect(); if(!rc.width) return;
    const vb=(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number); if(vb.length!==4) return;
    pmSetTarget({ x:Math.round(vb[0]+(ev.clientX-rc.left)/rc.width*vb[2]),
                  y:Math.round(vb[1]+(ev.clientY-rc.top)/rc.height*vb[3]) });
  });
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

Object.assign(window, { PM_RESUME_HOURS, PM_NEAR_HOLE_YD, PM_GPS_MAX_ERR_M,
  pmState, pmRound, pmCourse, pmHoles, pmHole, pmEntry, pmIsOpen, pmOpen, pmClose, pmStart, pmGo, pmStep,
  pmSetView, pmAdj, pmSetFw, pmToggleSand, pmDerived, pmTotals, pmFmtToPar, pmFinish, pmAbandon,
  pmGpsStart, pmGpsStop, pmPos, pmGreenNumbers, pmSyncButtons, buildPlay, pmRenderBody, pmBoot,
  pmTourn, pmLockDismiss, pmLockHTML, pmBagHTML,
  pmStrategyAllowed, pmSetTarget, pmClearTarget, pmToggleSheet, pmToggleStrat, pmMapBox, pmOptimal, pmYours, pmMapHTML, pmSheetHTML,
  pmToTournament, pmUnlockBegin, pmUnlockCancel, pmUnlockCheck, pmUnlockConfirm, pmUnlockHTML, pmTournHistoryHTML, PM_MIN_SPAN_YD,
  PM_AUTO_TEE_YD, PM_AUTO_NEAR_YD, PM_AUTO_FAR_YD, PM_AUTO_CONFIRM, PM_AUTO_HOLD_MS,
  pmHoleFit, pmRankHoles, pmAutoHold, pmAutoResume, pmAutoDetect, pmAutoBadge, pmAskSet, pmAskDone, pmAskHTML,
  pmSetupSet, pmPlans, pmPlanStamp, pmPlanAimTxt, pmPlanChain, pmPlanHole, pmPlanExp, pmPlanBuild, pmPlanOpen, pmPlanClose,
  pmPlanPick, pmPlanNote, pmPlanDelete, pmPlanFreeze, pmPlanTotal, pmPlanFor, pmPlanAimFrom, pmPlanHTML, pmSetupPlanHTML,
  PM_LIES, PM_LIE_NAME, PM_ARG_YD, pmCurEntry, pmHoledOut, pmShotReopen, pmShotAdding, pmShots, pmShotsSync, pmShotAuto, pmMarkBall, pmShotAddOnMap, pmShotPlace, pmShotPlaceDone,
  pmShotPlaceAt, pmShotPt, pmShotSetLie, pmShotSetDist, pmShotTogglePen, pmShotDel, pmShotsFill, pmShotsClear, pmShotsAddTyped,
  pmShotE, pmRoundSG, pmSgCardHTML, pmShotListHTML });
