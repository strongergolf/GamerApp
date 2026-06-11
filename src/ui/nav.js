// Navigation, toast, renderAll orchestrator, init.

/* ============================================================
   NAV + TOAST + INIT
   ============================================================ */
/* group → ordered list of {id,label} sub-tabs */
const GROUPS={
  play:[
    {id:'bag',      label:'Stock Shots'},
    {id:'partials', label:'Approach'},
    {id:'shortgame',label:'Short Game'},
    {id:'putting',  label:'Putting'}
  ],
  diagnose:[{id:'assess',label:'Assess'},{id:'improve',label:'Practice'},{id:'tests',label:'Tests'},{id:'resources',label:'Resources'}],
  plan:[{id:'planshot',label:'Plan a Shot'},{id:'courses',label:'Plan a Round'},{id:'longterm',label:'Long Term Plans'}],
  setup:[{id:'specs',label:'My Bag'},{id:'profile',label:'Myself'},{id:'reference',label:'App References'}]
};
let currentGroup='play';

function showGroup(group,el){
  currentGroup=group;
  document.querySelectorAll('.ngroup').forEach(g=>g.classList.remove('active'));
  if(el)el.classList.add('active');
  const sub=document.getElementById('nav-sub');
  const tabs=GROUPS[group];
  /* single-surface groups don't need a sub-strip */
  if(tabs.length<=1){ sub.innerHTML=''; showPage(tabs[0].id); }
  else { sub.innerHTML=tabs.map((t,i)=>`<div class="nav-tab${i===0?' active':''}" onclick="showPage('${t.id}',this)">${t.label}</div>`).join(''); showPage(tabs[0].id); }
}
function showPage(id,tab){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const pg=document.getElementById('page-'+id); if(pg)pg.classList.add('active');
  if(tab)tab.classList.add('active');
}
let toastTimer;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1900); }
function toggleRefMore(el){ const m=el.querySelector('.ref-more'); if(m) m.style.display=m.style.display==='block'?'none':'block'; }
function triggerImportFile(){ document.getElementById('import-file').click(); }

/* Rebuild every data-dependent surface from current STATE — WITHOUT changing the active
   tab. Called after Locker Room edits so changes propagate everywhere relevant. */
function refreshAll(){
  renderConditions();
  buildLadder();
  buildPartialsTable();
  buildShotShaper();
  /* Sync approach stimp control from STATE (values are in static HTML so can't use template literals) */
  const _psv=document.getElementById('partials-stimp-val'); if(_psv) _psv.textContent=STATE.stimp.toFixed(1);
  const _psr=document.getElementById('partials-stimp-range'); if(_psr) _psr.value=STATE.stimp;
  buildShortGame();
  buildPutting();
  renderPuttSG();
  renderExpectedShots('es-150', 95, 'fairway');
  renderExpectedShots('es-short', 20, 'atg');
  renderExpectedShots('es-putting', 15, 'green');
  buildAssess();
  buildImprove();
  buildResources();
  buildTests();
  renderDPlaneVisual();
  buildCourseStrategy();
  buildCourses();
  buildLongTerm();
  computePlanShot();
  buildSpecs();
  buildGapping();
  buildLateralGapping();
  buildProfile();
  renderCalc(95);
  updateDriverOpt();
}
function renderAll(){
  refreshAll();
  showGroup(currentGroup, document.querySelector('.ngroup.active'));
}
function initConditions(){
  ['c-temp','c-alt','c-hum','c-pres'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{ buildLadder(); updateCondSummary(); }));
  document.getElementById('adj-toggle').addEventListener('change',e=>{ window.adjustOn=e.target.checked; buildLadder(); updateCondSummary(); });
}

loadState();
renderAll();
initConditions();
initCalc();


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { GROUPS, currentGroup, initConditions, refreshAll, renderAll, showGroup, showPage, toast, toastTimer, toggleRefMore, triggerImportFile });
