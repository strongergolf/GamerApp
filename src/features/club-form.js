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
    carry: nv('nc-carry'), total: nv('nc-total'),
    bspd: nv('nc-bspd'), cspd: nv('nc-cspd'),
    launch: nv('nc-launch'), spin: nv('nc-spin'),
    ht: nv('nc-ht'), land: nv('nc-land')
  };
  STATE.clubs.push(club);
  STATE.performance[id] = perf;
  /* add to partials only if a wedge or iron */
  if((club.type==='wedge'||club.type==='iron') && perf.carry){
    STATE.partials[id] = {
      full: perf.carry,
      tq: Math.round(perf.carry*0.92),
      half: Math.round(perf.carry*0.84),
      conf: [true,false,false]
    };
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
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { addNewClub, clearNewClubForm });
