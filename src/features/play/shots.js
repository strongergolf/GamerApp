// PLAY: every shot — where it was played from, where it was aimed, how committed, the club and anything not stock.
// Split from play.js; shares its globals through window (see play/core.js).

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
  window.pmPlacing=S.length-1; window.pmPlaceKind='ball'; window.pmSheetOpen=false; window.pmView='map';
  pmShotsChanged(e);
}
function pmShotPlace(i){ window.pmPlacing=i; window.pmPlaceKind='ball'; window.pmSheetOpen=false; window.pmView='map'; buildPlay(); }
function pmShotPlaceDone(){ window.pmPlacing=null; window.pmPlaceKind='ball'; buildPlay(); }
/* ---- WHERE YOU AIMED IT ----
   Optional, one per shot: the spot you were trying to hit. With it the round can be read four
   ways after it is over: OPTIMAL (where the model would have aimed), INTENDED (where you did),
   EXPECTED (what that aim is worth over your whole pattern) and ACTUAL (where it finished).
   Two ways in: tap the spot to measure it before you hit, then "Aim shot N here"; or open a shot
   and drag its aim on the map. Recording an intention is allowed in a tournament round; nothing
   is worked out from it until the round is finished. */
window.pmPlaceKind = window.pmPlaceKind || 'ball';
function pmShotAim(i){
  const h=pmHole(), e=pmCurEntry(); if(!h||!e||!e.shots||!e.shots[i]) return;
  if(!pmShotPt(h, e.shots[i])){ toast('Place this shot on the map first'); return; }
  window.pmPlacing=i; window.pmPlaceKind='target'; window.pmSheetOpen=false; window.pmView='map'; buildPlay();
}
function pmShotAimHere(){
  const h=pmHole(), e=pmCurEntry(), T=window.pmTarget; if(!h||!e||!T) return;
  const S=pmShots(e), i=S.length-1; if(i<0||!pmShotPt(h,S[i])) return;
  S[i].tgt={x:T.x, y:T.y}; window.pmTarget=null; pmTouch(); buildPlay();
  toast(`Shot ${i+1}: aim recorded`);
}
function pmShotAimClear(i){ const e=pmCurEntry(); if(e&&e.shots&&e.shots[i]){ delete e.shots[i].tgt; pmTouch(); buildPlay(); } }
/* ---- HOW COMMITTED YOU WERE ----  one tap: 1 not, 2 partly, 3 fully. Tap again to clear. */
const PM_COMMIT = {1:'Not committed', 2:'Partly committed', 3:'Fully committed'};
function pmShotCommit(i, v){
  const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return;
  const sh=e.shots[i]; if(sh.commit===v) delete sh.commit; else sh.commit=v;
  pmTouch(); buildPlay();
}
/* Dragging or tapping a placed shot: distance and situation follow it. Re-placing overwrites
   both — the drag is the newer, more deliberate input — and they stay editable afterwards. */
function pmShotPlaceAt(pt){
  const h=pmHole(), e=pmCurEntry(), i=window.pmPlacing; if(!h||!e||i==null) return;
  const S=pmShots(e), sh=S[i]; if(!sh) return;
  if(window.pmPlaceKind==='target'){ sh.tgt={x:pt.x, y:pt.y}; pmTouch(); pmRenderBody(); return; }
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

/* ---- THE CLUB, and anything about the shot that was not stock ----
   Optional on every shot, never guessed: a club filled in from the plan would make "you hit
   the planned club" true by default, which is the one thing the review needs to be able to
   tell. A green row with no club is a putt with the putter.
   The drawer records a shot played OFF its stock pattern, in real units where there is one:
     shape   draw | fade, with the curve you intended in yards
     height  low | high
     swing   3/4 | 1/2 (full is stock)
     grip    inches choked down on the shaft
     note    anything else
   Recording what you did is allowed in a tournament round; nothing here advises. */
const PM_CX_SWING = {tq:'¾ swing', half:'½ swing'};
window.pmShotOpen = (window.pmShotOpen==null) ? null : window.pmShotOpen;
function pmBagClub(id){ return (STATE.clubs||[]).find(c=>c.id===id) || null; }
function pmClubName(id){ const c=pmBagClub(id); return c ? c.label : ''; }
function pmShotSetClub(i, id){
  const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return;
  if(id) e.shots[i].club=id; else delete e.shots[i].club;
  pmTouch(); buildPlay();
}
function pmShotCxToggle(i){ window.pmShotOpen = window.pmShotOpen===i ? null : i; buildPlay(); }
function pmShotCx(i, key, val){
  const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return;
  const sh=e.shots[i], cx=Object.assign({}, sh.cx||{});
  if(key==='shape'){ if(!val || cx.shape===val){ delete cx.shape; delete cx.curve; } else { cx.shape=val; if(!(cx.curve>0)) cx.curve=10; } }
  else if(key==='curve'){ const v=Math.max(5, Math.min(60, (cx.curve||10)+val)); if(cx.shape) cx.curve=v; }
  else if(key==='height'){ if(!val || cx.height===val) delete cx.height; else cx.height=val; }
  else if(key==='swing'){ if(!val || cx.swing===val) delete cx.swing; else cx.swing=val; }
  else if(key==='grip'){ const v=Math.round(Math.max(0, Math.min(4, (cx.grip||0)+val))*2)/2; if(v>0) cx.grip=v; else delete cx.grip; }
  if(Object.keys(cx).length) sh.cx=cx; else delete sh.cx;
  pmTouch(); buildPlay();
}
function pmShotCxNote(i, txt){
  const e=pmCurEntry(); if(!e||!e.shots||!e.shots[i]) return;
  const sh=e.shots[i], t=String(txt||'').trim().slice(0,140), cx=Object.assign({}, sh.cx||{});
  if(t) cx.note=t; else delete cx.note;
  if(Object.keys(cx).length) sh.cx=cx; else delete sh.cx;
  pmTouch();
}
function pmFrac(v){ const w=Math.floor(v), f=v-w; return f>=0.5 ? (w?`${w}½`:'½') : String(w); }
/* The tag on the row, and everywhere a non-stock shot is listed afterwards. */
function pmCxTxt(cx, withNote){
  if(!cx) return '';
  const p=[];
  if(cx.shape) p.push(`${cx.shape==='draw'?'Draw':'Fade'} ${ydNum(cx.curve||10)} ${ydUnit()}`);
  if(cx.height) p.push(cx.height==='low'?'Low':'High');
  if(cx.swing) p.push(PM_CX_SWING[cx.swing]);
  if(cx.grip) p.push(`Down ${pmFrac(cx.grip)} in`);
  if(withNote && cx.note) p.push(`“${cx.note}”`);
  return p.join(' · ');
}
function pmCxHTML(sh, i){
  const cx=sh.cx||{};
  const seg=(key, opts)=>`<div class="pm-cx-seg">${opts.map(([v,l])=>{ const on=(cx[key]||'')===v;
      return `<button type="button" class="${on?'on':''}" aria-pressed="${on}" onclick="pmShotCx(${i},'${key}','${v}')">${l}</button>`; }).join('')}</div>`;
  return `<div class="pm-cx">
      <div class="pm-cx-row"><span>Shape</span>${seg('shape',[['draw','Draw'],['','Stock'],['fade','Fade']])}</div>
      ${cx.shape?`<div class="pm-cx-row"><span>Curve</span><div class="pm-cx-step">
          <button type="button" onclick="pmShotCx(${i},'curve',-5)" aria-label="Less curve">−</button>
          <b>${ydNum(cx.curve||10)} ${ydUnit()}</b>
          <button type="button" onclick="pmShotCx(${i},'curve',5)" aria-label="More curve">+</button></div></div>`:''}
      <div class="pm-cx-row"><span>Height</span>${seg('height',[['low','Low'],['','Stock'],['high','High']])}</div>
      <div class="pm-cx-row"><span>Swing</span>${seg('swing',[['','Full'],['tq','¾'],['half','½']])}</div>
      <div class="pm-cx-row"><span>Grip down</span><div class="pm-cx-step">
          <button type="button" onclick="pmShotCx(${i},'grip',-0.5)" aria-label="Grip down less">−</button>
          <b>${cx.grip?pmFrac(cx.grip)+' in':'none'}</b>
          <button type="button" onclick="pmShotCx(${i},'grip',0.5)" aria-label="Grip down half an inch more">+</button></div></div>
      <input type="text" class="pm-cx-note" maxlength="140" placeholder="Anything else about this shot" value="${escapeHtml(cx.note||'')}" onchange="pmShotCxNote(${i}, this.value)">
      ${sh.tgt?`<button type="button" class="pm-shot-btn" onclick="pmShotAimClear(${i})">Clear the aim</button>`:''}
    </div>`;
}

Object.assign(window, {
  PM_LIES, PM_LIE_NAME, PM_ARG_YD, pmCurEntry, pmShots, pmShotsSync, pmShotAuto, pmShotsChanged,
  pmShotAdding, pmMarkBall, pmShotAddOnMap, pmShotPlace, pmShotPlaceDone, pmShotAim, pmShotAimHere,
  pmShotAimClear, PM_COMMIT, pmShotCommit, pmShotPlaceAt, pmShotPt, pmShotSetLie, pmShotSetDist,
  pmShotTogglePen, pmShotDel, pmShotsFill, pmShotsClear, pmHoledOut, pmShotReopen, PM_CX_SWING, pmBagClub,
  pmClubName, pmShotSetClub, pmShotCxToggle, pmShotCx, pmShotCxNote, pmFrac, pmCxTxt, pmCxHTML });
