// Add-a-club form handling.

/* ============================================================
   ADD CLUB
   ============================================================ */
function addNewClub(){
  const gv=id=>document.getElementById(id)?.value?.trim()||'';
  const nv=id=>parseFloat(document.getElementById(id)?.value)||null;
  const label = gv('nc-label');
  if(!label){ toast('Enter a display label first'); return; }
  /* generate a unique id */
  const id = 'custom_' + Date.now();
  const club = {
    id, type: gv('nc-type')||'iron', label,
    make: gv('nc-make'), model: gv('nc-model'),
    shaft: gv('nc-shaft'), length: gv('nc-length'),
    loft: gv('nc-loft')||'—', origLoft: gv('nc-origloft')||'',
    lie: gv('nc-lie')||'—', swt: gv('nc-swt')||'—',
    weight: gv('nc-weight')||'',
    year: parseInt(gv('nc-year'))||new Date().getFullYear()
  };
  const perf = {
    /* typed in the DISPLAYED unit; stored canonical (yd / ft / mph) */
    carry: cv('nc-carry','distance'), total: cv('nc-total','distance'),
    bspd: cv('nc-bspd','speed'), cspd: cv('nc-cspd','speed'),
    launch: nv('nc-launch'), spin: nv('nc-spin'),
    ht: cv('nc-ht','short'), land: nv('nc-land'),
    /* estimated numbers stay Presumed until measured; typed numbers are Input */
    prov: window.ncEstimated ? 'presumed' : 'input'
  };
  STATE.clubs.push(club);
  STATE.performance[id] = perf;
  /* add to partials only if a wedge or iron */
  if((club.type==='wedge'||club.type==='iron') && perf.carry){
    const seeded = {
      full: perf.carry,
      tq: Math.round(perf.carry*0.92),
      half: Math.round(perf.carry*0.84),
      conf: [true,false,false,false]
    };
    seeded.third = estThirdCarry(seeded);   /* 8:00 rung from this club's own ladder */
    STATE.partials[id] = seeded;
  }
  saveState();
  refreshAll();
  clearNewClubForm();
  toast(label + ' added to bag');
}
function clearNewClubForm(){
  ['nc-label','nc-make','nc-model','nc-year','nc-shaft','nc-length',
   'nc-loft','nc-origloft','nc-lie','nc-swt','nc-weight','nc-carry','nc-total',
   'nc-bspd','nc-cspd','nc-launch','nc-spin','nc-ht','nc-land']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  window.ncEstimated=false;
}

/* Prefill the Stock Shot fields from Eff. Loft via the bag's own loft→performance
   interpolation (estimatePerfForLoft — the same engine the replacement matcher uses).
   Turns adding a club into a 30-second job; the numbers save as Presumed until measured. */
/* Read a numeric field that was typed in the user's DISPLAYED unit and return it
   canonical, so storage never depends on what the labels happened to say. */
function cv(id, kind){
  const v=nv(id);
  return (v==null||v==='') ? v : Math.round(fromDisplay(kind, v)*10)/10;
}
/* The estimator fills these fields, and it works in canonical units — so what it writes has
   to be converted OUT to the displayed unit, or a metric user would see yards in the box. */
function ncUnitOf(key){ return ({carry:'distance',total:'distance',ht:'short',bspd:'speed',cspd:'speed'})[key]||null; }
/* Labels around the form live in static HTML; sync them to the current preference. */
function ncSyncUnitLabels(){
  const set=(id,txt)=>{ const e=document.getElementById(id); if(e) e.textContent=txt; };
  set('nc-lbl-carry','Carry ('+ydUnit()+')');
  set('nc-lbl-total','Total ('+ydUnit()+')');
  set('nc-lbl-bspd','Ball Speed ('+mphUnit()+')');
  set('nc-lbl-cspd','Club Speed ('+mphUnit()+')');
  set('nc-lbl-ht','Max Height ('+ftUnit()+')');
}
function estimateNewClubPerf(){
  const loft=parseFloat((document.getElementById('nc-loft')?.value||'').replace(/[^\d.]/g,''));
  if(!loft){ toast('Enter Eff. Loft first (e.g. 24°)'); return; }
  const est=(typeof estimatePerfForLoft==='function')?estimatePerfForLoft(loft):null;
  if(!est){ toast('No club data to estimate from'); return; }
  const map={carry:'nc-carry',total:'nc-total',bspd:'nc-bspd',cspd:'nc-cspd',launch:'nc-launch',spin:'nc-spin',ht:'nc-ht',land:'nc-land'};
  Object.keys(map).forEach(k=>{ const el=document.getElementById(map[k]); if(!el||est[k]==null) return;
    const u=ncUnitOf(k); el.value = u ? toDisplay(u, est[k], 0) : est[k]; });
  window.ncEstimated=true;
  toast('Stock shot estimated from loft — saves as Presumed until measured');
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { cv, ncUnitOf, ncSyncUnitLabels, addNewClub, clearNewClubForm, estimateNewClubPerf });
