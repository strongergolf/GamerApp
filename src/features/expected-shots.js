// Shared expected-shots strip used by Approach, Short Game, Putting, and Stock Shots.
//
// Shows two expected strokes-remaining numbers — "my actual" (from the player's typical-round
// baselines) and the AVG of a chosen comparison (Tour pro / Scratch / 9 hcp / 18 hcp) — plus a
// TRUE strokes-gained calculator: pick an assumed result and SG = SR(start) − SR(result) − 1,
// benchmarked to that same chosen comparison. When the strip sits inside a distance box
// (.calc-dist-block) it renders "embedded": the redundant distance label is dropped to save space.

/* Selectable comparison benchmark (maps to an effective handicap for srForPlayer). */
const ES_COMPARE = {
  tour:    { label:'Tour pro', short:'tour',   hcp:-5 },
  scratch: { label:'Scratch',  short:'scratch',hcp:0  },
  '9':     { label:'9 hcp',    short:'9 hcp',  hcp:9  },
  '18':    { label:'18 hcp',   short:'18 hcp', hcp:18 }
};
function esCmp(){ return ES_COMPARE[window.esCompare] || ES_COMPARE.scratch; }
function esSetCompare(val){
  window.esCompare = ES_COMPARE[val] ? val : 'scratch';
  const ctx=window.esCtx||{};
  Object.keys(ctx).forEach(id=>{ const c=ctx[id]; renderExpectedShots(id,c.dist,c.lie); });
}

/* Strokes-remaining from the end position (always on the green after the shot), adjusted to the
   chosen comparison's handicap. 0 ft = holed. A leave inside 3 ft bridges from ~1.0 (tap-in)
   to the table's 3 ft value; 3 ft+ uses the green baseline directly. */
function esGreenSR(ft, hcp){
  ft=+ft||0; hcp=hcp||0;
  if(ft<=0) return 0;                                   // holed
  const at3=srInterp('green',3);
  const scr = ft<3 ? 1.0 + (ft/3)*(at3-1.0) : srInterp('green',ft);
  return scr + (hcp*0.012)*(scr-1);                     // same adjustment as srForPlayer
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
  const res=window.esResult[id], h=esCmp().hcp;
  const startSR=srForPlayer(ctx.lie,ctx.dist,h);
  const endSR=esGreenSR(res,h);
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
  window.esCompare=window.esCompare||'scratch';
  const cmp=esCmp();
  const embedded = !!el.closest('.calc-dist-block');     // sitting inside a distance box → save space
  const cmpSR=srForPlayer(lie,dist,cmp.hcp);
  if(cmpSR==null){ el.innerHTML=''; return; }
  const lieLabel=lie==='green'?`${dist}ft from cup`:lie==='atg'?`${dist}yd (around green)`:`${dist}yd from fairway`;
  /* "my actual" — expected strokes using the per-category effective handicap implied
     by the player's typical-round baselines */
  const myEff=typeof effHcpForLie==='function'?effHcpForLie(lie):null;
  const myActual=myEff!=null?srForPlayer(lie,dist,myEff):null;
  const myStr=myActual!=null?myActual.toFixed(2):'—';
  const myColor=myActual==null?'var(--muted)':(myActual<=cmpSR?'#5fcf8f':'#f4f0e8');

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
  const h=cmp.hcp, startSR=srForPlayer(lie,dist,h), endSR=esGreenSR(res,h), sg=startSR-endSR-1;
  const sgStr=(sg>=0?'+':'')+sg.toFixed(2);
  const sgColor=sg>=0?'#5fcf8f':'#e3b25a';
  const cmpSel=`<select class="es-cmp-sel" onchange="esSetCompare(this.value)">`+
    Object.keys(ES_COMPARE).map(k=>`<option value="${k}"${window.esCompare===k?' selected':''}>${ES_COMPARE[k].label} avg</option>`).join('')+`</select>`;

  el.innerHTML=`<div class="es-strip${embedded?' es-embedded':''}">
    ${embedded?'':`<div class="es-strip-label">${lieLabel}</div>`}
    <div class="es-strip-body">
      <div class="es-stat">
        <div class="es-val" style="color:${myColor}">${myStr}</div>
        <div class="es-lbl">my actual</div>
      </div>
      <div class="es-stat">
        <div class="es-val">${cmpSR.toFixed(2)}</div>
        ${cmpSel}
      </div>
    </div>
    <div class="es-sg">
      <div class="es-sg-control">
        <div class="es-sg-ctrl-label">Assumed result · <span id="${id}-res-lbl">${esResultLabel(res,lie)}</span></div>
        <input type="range" id="${id}-res" min="0" max="${rMax}" step="${rStep}" value="${res}" oninput="esSetResult('${id}',this.value)">
      </div>
      <div class="es-sg-stat">
        <div class="es-val" id="${id}-sg" style="color:${sgColor}">${sgStr}</div>
        <div class="es-lbl">SG vs ${cmp.short}</div>
        <div class="es-sg-eq" id="${id}-eq">${startSR.toFixed(2)} − ${endSR.toFixed(2)} − 1 stroke</div>
      </div>
    </div>
  </div>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { renderExpectedShots, esSetResult, esSetCompare, esUpdateSG, esGreenSR, esResultLabel, ES_COMPARE });
