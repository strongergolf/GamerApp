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
// putting break calculator are deliberately not reachable from inside Play. A Committee using
// Model Local Rule G-5 (no distance-measuring devices) is the one case this does not yet cover
// — that is the tournament toggle, which comes next.
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

/* ---------------- OPEN / CLOSE ---------------- */
window.pmView = window.pmView || 'dist';
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
  pmState().round={ id:'r'+Date.now(), courseKey:c.id||c.name, courseName:c.name||'Course',
                    startedAt:Date.now(), touched:Date.now(), start, cur:start, holes:{}, done:false };
  saveState(); window.pmView='dist'; pmGpsStart(false); buildPlay(); pmSyncButtons();
}
function pmGo(i){
  const r=pmRound(), n=pmHoles().length; if(!r||!n) return;
  r.cur=((i%n)+n)%n; pmTouch(); buildPlay(); pmSyncButtons();
}
function pmStep(d){ const r=pmRound(); if(r) pmGo(r.cur+d); }
function pmSetView(v){ window.pmView=v; buildPlay(); }

/* ---------------- THE SCORE ---------------- */
/* The number field reads "—" until touched; the first tap on either button starts from par,
   because par is where most holes end and it saves two taps on every one that does. */
function pmAdj(key, d){
  const h=pmHole(), r=pmRound(); if(!h||!r) return;
  const num=pmHoleNum(h, r.cur), e=pmEntry(num), par=h.par||4;
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
      p=>{ G.fix={lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:Date.now()}; G.err=null; if(pmIsOpen()) pmRenderBody(); },
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
  if(!r){ el.innerHTML=pmSetupHTML(); return; }
  const hs=pmHoles(), h=pmHole();
  if(!h){ el.innerHTML=pmSetupHTML('That course is no longer in the app.'); return; }
  const t=pmTotals();
  el.innerHTML=`
    <div class="pm-top">
      <button type="button" class="pm-x" onclick="pmClose()" aria-label="Leave Play — the round stays open">✕</button>
      <button type="button" class="pm-arrow" onclick="pmStep(-1)" aria-label="Previous hole">‹</button>
      <div class="pm-hole">
        <div class="pm-hole-t">Hole ${pmHoleNum(h,r.cur)} <span>par ${h.par||4}</span></div>
        <div class="pm-hole-s">${escapeHtml(r.courseName)}${t.played?` · <b>${pmFmtToPar(t.toPar)}</b> thru ${t.played}`:''}</div>
      </div>
      <button type="button" class="pm-arrow" onclick="pmStep(1)" aria-label="Next hole">›</button>
    </div>
    <div class="pm-body" id="pm-body"></div>
    <nav class="pm-tabs" aria-label="Play">
      ${[['dist','Distances','◎'],['hole','Hole','▲'],['card','Card','☰']].map(([k,l,i])=>
        `<button type="button" class="pm-tab${window.pmView===k?' on':''}" onclick="pmSetView('${k}')" aria-pressed="${window.pmView===k}"><span aria-hidden="true">${i}</span>${l}</button>`).join('')}
    </nav>`;
  pmRenderBody();
}
function pmRenderBody(){
  const body=document.getElementById('pm-body'); if(!body) return;
  const h=pmHole(), r=pmRound(); if(!h||!r) return;
  body.innerHTML = window.pmView==='hole' ? pmHoleHTML(h) : window.pmView==='card' ? pmCardHTML() : pmDistHTML(h, r);
}
function pmSetupHTML(note){
  const cs=STATE.courses||[];
  if(!cs.length) return `<div class="pm-setup">
      <button type="button" class="pm-x pm-x-abs" onclick="pmClose()" aria-label="Close">✕</button>
      <h2>Play golf now</h2>
      <p>Import a course first — Strategy → My Courses pulls one from OpenStreetMap in a few seconds.</p>
      <button type="button" class="btn btn-primary" onclick="pmClose();showGroupPage('gameplan','gpcourses')">Go to My Courses</button></div>`;
  const cur=(window.stratSel&&window.stratSel.cIdx)||0;
  return `<div class="pm-setup">
      <button type="button" class="pm-x pm-x-abs" onclick="pmClose()" aria-label="Close">✕</button>
      <h2>Play golf now</h2>
      ${note?`<p class="pm-warn">${escapeHtml(note)}</p>`:''}
      <label class="pm-field">Course<select id="pm-course">${cs.map((c,i)=>`<option value="${i}"${i===cur?' selected':''}>${escapeHtml(c.name||'Course')}</option>`).join('')}</select></label>
      <label class="pm-field">Starting hole<select id="pm-start"><option value="0">1st</option><option value="9">10th</option></select></label>
      <button type="button" class="btn btn-primary pm-go" onclick="pmStart()">Start round</button>
      <p class="pm-note">Distances, the hole map and your scorecard — nothing that recommends a club or a line, so it stays inside what the Rules allow a player to use. Your round is saved as you go and survives the phone locking.</p>
    </div>`;
}
function pmDistHTML(h, r){
  const pos=pmPos(h), G=window.pmGps;
  const gn=pmGreenNumbers(h, pos.pt);
  const n=v=>v==null?'—':ydNum(v);
  const src = pos.src==='gps' ? `GPS · ±${Math.round(pos.acc)} m`
            : pos.src==='far' ? `GPS says you are ${pos.away!=null?ydNum(pos.away)+' '+ydUnit():'well'} from this green — showing from the tee`
            : pos.src==='coarse' ? `GPS only ±${Math.round(pos.acc)} m — too coarse to trust, showing from the tee`
            : G.err ? `${G.err} — showing from the tee`
            /* the sample courses, and any course saved before georeferencing existed, carry no
               lat/lon anchor. A fresh import from OpenStreetMap writes one. */
            : !h.geo ? 'From the tee — re-import this course in My Courses to use GPS'
            : 'From the tee';
  const gpsBtn = (pos.src==='tee' && h.geo && G.watch==null && !G.err)
    ? `<button type="button" class="pm-gps-btn" onclick="pmGpsStart(true)">Use GPS</button>` : '';
  const covers = (gn&&!gn.onGreen) ? cfCoverNumbers(h, pos.pt, cfGreenMid(h)||cfPin(h)).filter(c=>!c.inside && c.cover>5).slice(0,4) : [];
  const e=pmEntry(pmHoleNum(h,r.cur)), par=h.par||4, d=pmDerived(h,e);
  const step=(key,label,val)=>`<div class="pm-step-row"><span class="pm-step-l">${label}</span>
      <div class="pm-stepper"><button type="button" onclick="pmAdj('${key}',-1)" aria-label="${label} minus one">−</button>
      <span class="pm-step-v">${val==null?'—':val}</span>
      <button type="button" onclick="pmAdj('${key}',1)" aria-label="${label} plus one">+</button></div></div>`;
  return `
    <div class="pm-src">${src}${gpsBtn}</div>
    ${gn&&gn.onGreen ? `<div class="pm-ongreen">On the green</div>` : `
    <div class="pm-fmb">
      <div><span>Front</span><b>${n(gn&&gn.front)}</b></div>
      <div class="pm-mid"><span>Middle</span><b>${n(gn&&gn.mid)}</b></div>
      <div><span>Back</span><b>${n(gn&&gn.back)}</b></div>
    </div>
    ${gn&&gn.pin!=null?`<div class="pm-pin">Pin <b>${n(gn.pin)}</b></div>`:''}`}
    ${covers.length?`<div class="pm-covers">${covers.map(c=>`<div class="pm-cover"><span>${escapeHtml(c.label)}</span>reach <b>${n(c.starts)}</b> · carry <b>${n(c.cover)}</b></div>`).join('')}</div>`:''}
    <div class="pm-score">
      ${step('s','Score',e.s)}
      ${step('p','Putts',e.p)}
      ${par>=4?`<div class="pm-step-row"><span class="pm-step-l">Fairway</span><div class="pm-seg">
        ${[['left','← Left'],['hit','Hit'],['right','Right →']].map(([k,l])=>`<button type="button" class="${e.f===k?'on':''}" onclick="pmSetFw('${k}')" aria-pressed="${e.f===k}">${l}</button>`).join('')}
      </div></div>`:''}
      ${step('pen','Penalties',e.pen==null?0:e.pen)}
      <div class="pm-chips">
        <button type="button" class="pm-chip${e.sand?' on':''}" onclick="pmToggleSand()" aria-pressed="${!!e.sand}">Bunker</button>
        ${d.gir!=null?`<span class="pm-chip ro${d.gir?' on':''}">${d.gir?'GIR':'Missed green'}</span>`:''}
        ${d.udAtt?`<span class="pm-chip ro${d.udMade?' on':''}">${d.udMade?'Up and down':'No up and down'}</span>`:''}
      </div>
      <button type="button" class="btn btn-primary pm-next" onclick="pmStep(1)">Next hole ›</button>
    </div>`;
}
/* The hole, cropped to itself, with the ball on it. A map and nothing drawn on it that
   advises — no aim line, no dispersion, no optimal play. */
function pmHoleHTML(h){
  const pos=pmPos(h);
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  const eat=p=>{ if(!p||p.x==null)return; x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); y0=Math.min(y0,p.y); y1=Math.max(y1,p.y); };
  eat(h.tee); eat(h.pin); (h.green||[]).forEach(eat); (h.fairway||[]).forEach(eat); (h.hazards||[]).forEach(z=>(z.pts||[]).forEach(eat));
  if(pos.src==='gps') eat(pos.pt);
  if(x1<x0){ x0=0; x1=CF_W; y0=0; y1=CF_H; }
  const vw=Math.min(window.innerWidth||375, 640), vh=Math.max(300,(window.innerHeight||812)-190);
  const want=vw/vh;
  let w=(x1-x0)*1.4+60, hh=(y1-y0)*1.08+60, cx=(x0+x1)/2, cy=(y0+y1)/2;
  if(w/hh>want) hh=w/want; else w=hh*want;
  const ball = pos.src==='gps' ? `<circle cx="${pos.pt.x}" cy="${pos.pt.y}" r="14" fill="#fff" stroke="#111" stroke-width="4"/>` : '';
  return `<div class="pm-map">${renderHoleSVG(h,{viewBox:{x:cx-w/2,y:cy-hh/2,w,h:hh}, overlay:ball})}</div>
    <div class="pm-src">${pos.src==='gps'?'Your position from GPS':'Showing the hole from the tee'}</div>`;
}
function pmCardHTML(){
  const r=pmRound(), hs=pmHoles(), t=pmTotals();
  const row=(h,i)=>{
    const num=pmHoleNum(h,i), e=(r.holes||{})[num]||{}, par=h.par||4;
    const diff=e.s!=null?e.s-par:null;
    const cls=diff==null?'':diff<=-2?'eagle':diff===-1?'birdie':diff===0?'par':diff===1?'bogey':'dbl';
    return `<button type="button" class="pm-card-row${i===r.cur?' cur':''}" onclick="pmGo(${i});pmSetView('dist')">
      <span>${num}</span><span>${par}</span><span class="pm-sc ${cls}">${e.s!=null?e.s:'·'}</span>
      <span>${e.p!=null?e.p:''}</span><span>${par>=4?(e.f==='hit'?'✓':e.f==='left'?'←':e.f==='right'?'→':''):''}</span></button>`;
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
    <div class="pm-end">
      <button type="button" class="btn btn-primary" onclick="pmFinish()">Finish round</button>
      <button type="button" class="btn" onclick="pmAbandon()">Discard</button>
    </div>`;
}

/* On load: a round left open recently is resumed straight into Play, because the most likely
   reason the app is loading mid-round is that the phone locked and the browser reloaded it. */
function pmBoot(){
  const r=pmRound();
  if(r && Date.now()-(r.touched||r.startedAt) > PM_RESUME_HOURS*3600e3){ /* stale: leave it, but do not jump into it */ }
  else if(r){ pmOpen(); }
  pmSyncButtons();
}

Object.assign(window, { PM_RESUME_HOURS, PM_NEAR_HOLE_YD, PM_GPS_MAX_ERR_M,
  pmState, pmRound, pmCourse, pmHoles, pmHole, pmEntry, pmIsOpen, pmOpen, pmClose, pmStart, pmGo, pmStep,
  pmSetView, pmAdj, pmSetFw, pmToggleSand, pmDerived, pmTotals, pmFmtToPar, pmFinish, pmAbandon,
  pmGpsStart, pmGpsStop, pmPos, pmGreenNumbers, pmSyncButtons, buildPlay, pmRenderBody, pmBoot });
