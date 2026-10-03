// PLAY: the map — the Play screen, the sheet under it, the shot list, and the tap handler.
// Split from play.js; shares its globals through window (see play/core.js).

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
  if(onTee){ (h.fairway||[]).forEach(eat); (h.fairways||[]).forEach(f=>f.forEach(eat)); eat(h.tee); }
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
  /* while a finger is dragging the target the frame holds still, or the crop would follow the
     target and slide the hole out from under the finger; it re-frames on release */
  const box=window.pmDragBox || pmMapBox(h, P, extra, vw/vh);
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
    Sx.forEach((sh,i)=>{ const q=pts[i]; if(!q||!sh.tgt) return;
      const on=window.pmPlacing===i&&window.pmPlaceKind==='target', ra=(on?11:8)/pxPerUnit;
      ov+=`<line x1="${q.x}" y1="${q.y}" x2="${sh.tgt.x}" y2="${sh.tgt.y}" stroke="#f4d47a" stroke-opacity=".9" stroke-width="${(1.5/pxPerUnit).toFixed(1)}" stroke-dasharray="${(3/pxPerUnit).toFixed(1)},${(4/pxPerUnit).toFixed(1)}"/>
        <circle cx="${sh.tgt.x}" cy="${sh.tgt.y}" r="${ra.toFixed(1)}" fill="none" stroke="#f4d47a" stroke-width="${(2.5/pxPerUnit).toFixed(1)}"/>
        <circle cx="${sh.tgt.x}" cy="${sh.tgt.y}" r="${(2/pxPerUnit).toFixed(1)}" fill="#f4d47a"/>`; });
    pts.forEach((q,i)=>{ if(!q) return; const on=window.pmPlacing===i&&window.pmPlaceKind!=='target';
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
  return `<div class="pm-mapwrap${placing?' pm-placing':''}${strat&&!placing?' pm-dragaim':''}" style="height:${vh}px">
      ${placing&&window.pmPlaceKind==='target'?`<div class="pm-place-banner">Shot ${window.pmPlacing+1}: tap or drag where you aimed
          <b>${(()=>{ const a=pmShotPt(h,Sx[window.pmPlacing]), t=Sx[window.pmPlacing].tgt; return a&&t?ydNum(cfDistYd(h,a,t))+' '+ydUnit()+' from the ball':'not set yet'; })()}</b>
          <button type="button" onclick="pmShotPlaceDone()">Done</button></div>`
       :placing?`<div class="pm-place-banner">Shot ${window.pmPlacing+1}: tap or drag on the hole
          <b>${PM_LIE_NAME[Sx[window.pmPlacing].lie]||''} \u00b7 ${Sx[window.pmPlacing].yd==null?'\u2014':(Sx[window.pmPlacing].lie==='green'?ftNum(Sx[window.pmPlacing].yd*3)+' '+ftUnit():ydNum(Sx[window.pmPlacing].yd)+' '+ydUnit())}</b>
          <button type="button" onclick="pmShotPlaceDone()">Done</button></div>`:fmb}
      <div class="pm-map" id="pm-map">${renderHoleSVG(h,{viewBox:box, pxW:vw, overlay:ov})}</div>${typeof imgAttrHTML==='function'?imgAttrHTML(h):''}
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
    </div>
    ${(!e.done && window.pmTarget && S.length && pmShotPt(h,S[S.length-1]) && !S[S.length-1].tgt)
      ? `<button type="button" class="pm-aimhere" onclick="pmShotAimHere()">\u25ce Aim shot ${S.length} here <i>record the spot you measured as where you are aiming</i></button>` : ''}`;
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
          <label class="pm-shot-d"><input type="number" inputmode="decimal" min="0" step="${green?0.5:1}" value="${val}" placeholder="\u2014"
            onchange="pmShotSetDist(${i},this.value)"><i>${green?ftUnit():ydUnit()} to hole</i></label>
          <span class="pm-shot-src">${srcTxt[sh.src]||sh.src}${sh.edited?', edited':''}</span>
          <button type="button" class="pm-shot-btn" onclick="pmShotPlace(${i})" title="Place this shot on the map">\u271a map</button>
          <button type="button" class="pm-shot-btn${sh.pen?' on':''}" onclick="pmShotTogglePen(${i})" title="A penalty stroke after this shot">+1 pen</button>
          <button type="button" class="pm-shot-btn pm-shot-del" onclick="pmShotDel(${i})" aria-label="Delete shot ${i+1}">\u2715</button>
        </div>
        <div class="pm-shot-x">
          <select class="pm-shot-club" onchange="pmShotSetClub(${i}, this.value)" aria-label="Club for shot ${i+1}">
            <option value="">${green?'Putter':'Club'}</option>
            ${(STATE.clubs||[]).map(c=>`<option value="${escapeHtml(c.id)}"${sh.club===c.id?' selected':''}>${escapeHtml(c.label)}${c.loft?` \u00b7 ${String(c.loft).replace(/\u00b0/g,'')}\u00b0`:''}</option>`).join('')}
          </select>
          <div class="pm-commit" role="group" aria-label="How committed to shot ${i+1}">${[1,2,3].map(v=>`<button type="button" class="${sh.commit===v?'on':''}" onclick="pmShotCommit(${i},${v})" aria-pressed="${sh.commit===v}" title="${PM_COMMIT[v]}">${['\u25cb','\u25d0','\u25cf'][v-1]}</button>`).join('')}</div>
          ${green?'':`<button type="button" class="pm-shot-btn pm-aim${sh.tgt?' on':''}" onclick="pmShotAim(${i})" title="Where you aimed this shot">\u25ce ${sh.tgt?'aimed':'aim'}</button>`}
          <button type="button" class="pm-shot-cxbtn${sh.cx?' on':''}" onclick="pmShotCxToggle(${i})" aria-expanded="${window.pmShotOpen===i}">
            ${sh.cx?escapeHtml(pmCxTxt(sh.cx,false)||'Note'):'Stock shot'} <span aria-hidden="true">${window.pmShotOpen===i?'\u25b4':'\u25be'}</span></button>
        </div>
        ${window.pmShotOpen===i?pmCxHTML(sh,i):''}
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
  /* the frame on screen, held for the length of a drag */
  const vbOf=()=>{ const svg=document.querySelector('#pm-map svg'); const v=svg&&(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number);
    return v&&v.length===4 ? {x:v[0], y:v[1], w:v[2], h:v[3]} : null; };
  document.addEventListener('pointerdown', ev=>{
    const m=ev.target.closest&&ev.target.closest('#pm-map');
    /* AIM: in a casual round with the strategy layer on, the target follows the finger, and
       your shot is scored against the optimal one as it moves. Tournament rounds keep the tap
       (distances only): pmStrategyAllowed() is false there. */
    const aim = !!m && window.pmPlacing==null && pmStrategyAllowed() && window.pmStratOn;
    down=m?{x:ev.clientX, y:ev.clientY, placing:window.pmPlacing!=null, aim}:null;
    /* placing: the shot jumps to the finger at once, then follows it */
    if(down&&down.placing){ const q=ptAt(ev); if(q) pmShotPlaceAt(q); ev.preventDefault(); }
    else if(down&&down.aim){ window.pmDragBox=vbOf(); const q=ptAt(ev); if(q) pmSetTarget(q); ev.preventDefault(); }
  });
  document.addEventListener('pointermove', ev=>{
    if(!down||(!down.placing&&!down.aim)) return;
    const now=Date.now(); if(now-dragLast<60) return; dragLast=now;
    const q=ptAt(ev); if(!q) return;
    if(down.placing) pmShotPlaceAt(q); else pmSetTarget(q);
  });
  document.addEventListener('pointercancel', ()=>{ if(down&&down.aim){ window.pmDragBox=null; pmRenderBody(); } down=null; });
  document.addEventListener('pointerup', ev=>{
    if(!down) return;
    const m=ev.target.closest&&ev.target.closest('#pm-map');
    const moved=Math.hypot(ev.clientX-down.x, ev.clientY-down.y);
    if(down.placing){ const q=ptAt(ev); if(q) pmShotPlaceAt(q); down=null; return; }
    if(down.aim){ const q=ptAt(ev); window.pmDragBox=null; down=null; if(q) pmSetTarget(q); else pmRenderBody(); return; }
    down=null;
    if(!m||moved>10) return;
    const svg=m.querySelector('svg'); if(!svg) return;
    const rc=svg.getBoundingClientRect(); if(!rc.width) return;
    const vb=(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number); if(vb.length!==4) return;
    pmSetTarget({ x:Math.round(vb[0]+(ev.clientX-rc.left)/rc.width*vb[2]),
                  y:Math.round(vb[1]+(ev.clientY-rc.top)/rc.height*vb[3]) });
  });
}

Object.assign(window, {
  pmStrategyAllowed, pmSetTarget, pmClearTarget, pmToggleSheet, pmToggleStrat, PM_MIN_SPAN_YD, pmMapBox,
  PM_OPT_CACHE, pmOptimal, pmYours, pmSrcText, pmMapHTML, pmSheetHTML, pmShotListHTML, pmShotsAddTyped });
