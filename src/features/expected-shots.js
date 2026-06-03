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
        <div class="es-val" style="color:var(--muted)">—</div>
        <div class="es-lbl">my actual</div>
      </div>
    </div>
  </div>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { renderExpectedShots });
