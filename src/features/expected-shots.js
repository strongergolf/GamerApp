// Shared expected-shots strip used by Approach, Short Game, Putting, and Stock Shots.
//
// The strip shows expected strokes-remaining from the start (scratch / hcp / "my actual"),
// plus a TRUE strokes-gained calculator: pick an assumed result with the slider and the
// box computes SG = SR_scratch(start) − SR_scratch(result) − 1 (the stroke taken).
// The benchmark is the scratch baseline (Broadie); the result lands on the green.

/* Strokes-remaining from the end position (always on the green after the shot).
   0 ft = holed (0 strokes). A leave inside 3 ft bridges from ~1.0 (tap-in) to the
   table's 3 ft value; 3 ft+ uses the green baseline directly. */
function esGreenSR(ft){
  ft=+ft||0;
  if(ft<=0) return 0;                                   // holed
  const at3=srInterp('green',3);
  if(ft<3) return 1.0 + (ft/3)*(at3-1.0);               // tap-in bridge
  return srInterp('green',ft);
}
function esResultLabel(res,lie){
  res=+res||0;
  if(res<=0) return 'holed';
  const n=res<10?res.toFixed(1):Math.round(res).toString();
  return `${n} ft ${lie==='green'?'left':'from pin'}`;
}
/* Live-update the SG number + result label + equation without rebuilding the whole strip
   (so the result slider keeps focus while dragging). */
function esUpdateSG(id){
  const ctx=window.esCtx&&window.esCtx[id]; if(!ctx) return;
  const res=window.esResult[id];
  const startSR=srInterp(ctx.lie,ctx.dist);
  const endSR=esGreenSR(res);
  const sg=startSR-endSR-1;
  const sgEl=document.getElementById(id+'-sg');
  if(sgEl){ sgEl.textContent=(sg>=0?'+':'')+sg.toFixed(2); sgEl.style.color=sg>=0?'#5fcf8f':'#e3b25a'; }
  const lblEl=document.getElementById(id+'-res-lbl'); if(lblEl) lblEl.textContent=esResultLabel(res,ctx.lie);
  const eqEl=document.getElementById(id+'-eq'); if(eqEl) eqEl.textContent=`${startSR.toFixed(2)} − ${endSR.toFixed(2)} − 1 stroke`;
}
function esSetResult(id,val){
  window.esResult=window.esResult||{};
  window.esResult[id]=parseFloat(val);
  esUpdateSG(id);
}

/* ============================================================
   EXPECTED SHOTS STRIP + TRUE STROKES-GAINED
   id   = element id of the strip div
   dist = distance (yards for fairway/atg, feet for green)
   lie  = 'fairway' | 'atg' | 'green'
   ============================================================ */
function renderExpectedShots(id, dist, lie){
  const el=document.getElementById(id); if(!el||!dist) return;
  const hcp=parseHcp(STATE.profile.handicap)||0;
  const sr=srForPlayer(lie,dist,hcp);
  if(sr==null){ el.innerHTML=''; return; }
  const srScratch=srInterp(lie,dist);
  const hcpLabel=hcp>=0?String(hcp):'+'+Math.abs(hcp);
  const lieLabel=lie==='green'?`${dist}ft from cup`:lie==='atg'?`${dist}yd (around green)`:`${dist}yd from fairway`;
  /* "my actual" — expected strokes using the per-category effective handicap implied
     by the player's typical-round baselines */
  const myEff=typeof effHcpForLie==='function'?effHcpForLie(lie):null;
  const myActual=myEff!=null?srForPlayer(lie,dist,myEff):null;
  const myStr=myActual!=null?myActual.toFixed(2):'—';
  const myColor=myActual==null?'var(--muted)':myActual<=sr?'#5fcf8f':'#f4f0e8';

  /* Assumed-result slider config (result lands on the green). Persisted per strip so
     it survives the distance-driven re-renders. */
  let rMax,rStep,rDefault;
  if(lie==='green'){ rMax=Math.max(1,Math.round(dist)); rStep=0.5; rDefault=0; }
  else if(lie==='atg'){ rMax=40; rStep=1; rDefault=6; }
  else { rMax=60; rStep=1; rDefault=20; }               // fairway / approach
  window.esResult=window.esResult||{};
  let res=window.esResult[id]; if(res==null) res=rDefault;
  res=Math.max(0,Math.min(rMax,res)); window.esResult[id]=res;
  window.esCtx=window.esCtx||{}; window.esCtx[id]={dist,lie};
  const startSR=srScratch, endSR=esGreenSR(res), sg=startSR-endSR-1;
  const sgStr=(sg>=0?'+':'')+sg.toFixed(2);
  const sgColor=sg>=0?'#5fcf8f':'#e3b25a';

  el.innerHTML=`<div class="es-strip">
    <div class="es-strip-label">${lieLabel}</div>
    <div class="es-strip-body">
      <div class="es-stat">
        <div class="es-val">${srScratch!=null?srScratch.toFixed(2):'—'}</div>
        <div class="es-lbl">scratch avg</div>
      </div>
      <div class="es-stat">
        <div class="es-val">${sr.toFixed(2)}</div>
        <div class="es-lbl">hcp ${hcpLabel} avg</div>
      </div>
      <div class="es-stat">
        <div class="es-val" style="color:${myColor}">${myStr}</div>
        <div class="es-lbl">my actual</div>
      </div>
    </div>
    <div class="es-sg">
      <div class="es-sg-control">
        <div class="es-sg-ctrl-label">Assumed result · <span id="${id}-res-lbl">${esResultLabel(res,lie)}</span></div>
        <input type="range" id="${id}-res" min="0" max="${rMax}" step="${rStep}" value="${res}" oninput="esSetResult('${id}',this.value)">
      </div>
      <div class="es-sg-stat">
        <div class="es-val" id="${id}-sg" style="color:${sgColor}">${sgStr}</div>
        <div class="es-lbl">strokes gained</div>
        <div class="es-sg-eq" id="${id}-eq">${startSR.toFixed(2)} − ${endSR.toFixed(2)} − 1 stroke</div>
      </div>
    </div>
  </div>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { renderExpectedShots, esSetResult, esUpdateSG, esGreenSR, esResultLabel });
