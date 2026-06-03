// Shared expected-shots strip used by Approach, Short Game and Putting.

/* ============================================================
   EXPECTED SHOTS STRIP — shared across Inside 150, Short Game, Putting
   id = element id of the strip div
   distInput = distance (yards for fairway/atg, feet for green)
   lie = 'fairway' | 'atg' | 'green'
   ============================================================ */
function renderExpectedShots(id, dist, lie){
  const el=document.getElementById(id); if(!el||!dist) return;
  const hcp=parseHcp(STATE.profile.handicap)||0;
  const sr=srForPlayer(lie,dist,hcp);
  if(sr==null){ el.innerHTML=''; return; }
  const srScratch=srInterp(lie,dist);
  const sg=srScratch!=null?(srScratch-sr).toFixed(2):null;
  const sgColor=sg==null?'var(--muted)':parseFloat(sg)>=0?'var(--green)':'var(--gold)';
  const sgStr=sg==null?'':parseFloat(sg)>=0?`+${sg}`:sg;
  const lieLabel=lie==='green'?`${dist}ft from cup`:lie==='atg'?`${dist}yd total (around green)`:`${dist}yd from fairway`;
  el.innerHTML=`<div class="es-strip">
    <div class="es-strip-label">${lieLabel}</div>
    <div class="es-strip-body">
      <div class="es-stat">
        <div class="es-val">${sr.toFixed(2)}</div>
        <div class="es-lbl">expected shots</div>
      </div>
      ${sg!=null?`<div class="es-stat">
        <div class="es-val" style="color:${sgColor}">${sgStr}</div>
        <div class="es-lbl">SG vs scratch</div>
      </div>`:''}
      <div class="es-stat">
        <div class="es-val" style="font-size:.88rem">${hcp>=0?hcp:'+'+Math.abs(hcp)}</div>
        <div class="es-lbl">your hcp</div>
      </div>
    </div>
  </div>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { renderExpectedShots });
