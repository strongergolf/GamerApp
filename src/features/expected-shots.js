// Shared expected-shots strip used by Approach, Short Game, Putting, and Stock Shots.

/* ============================================================
   EXPECTED SHOTS STRIP
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
  /* "my actual" — expected strokes from this spot using the per-category
     effective handicap implied by the player's typical-round baselines */
  const myEff=typeof effHcpForLie==='function'?effHcpForLie(lie):null;
  const myActual=myEff!=null?srForPlayer(lie,dist,myEff):null;
  const myStr=myActual!=null?myActual.toFixed(2):'—';
  const myColor=myActual==null?'var(--muted)':myActual<=sr?'var(--green)':'var(--ink)';
  /* SG is measured against scratch; prefer the player's real number when present */
  const sgRef=myActual!=null?myActual:sr;
  const sg=srScratch!=null?srScratch-sgRef:null;
  const sgStr=sg==null?'—':(sg>=0?'+':'')+sg.toFixed(2);
  const sgColor=sg==null?'var(--muted)':sg>=0?'var(--green)':'var(--gold)';
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
      <div class="es-stat">
        <div class="es-val" style="color:${sgColor}">${sgStr}</div>
        <div class="es-lbl">SG vs scratch</div>
      </div>
    </div>
  </div>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { renderExpectedShots });
