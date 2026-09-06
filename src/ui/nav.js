// Navigation, toast, renderAll orchestrator, init.

/* ============================================================
   NAV + TOAST + INIT
   ============================================================ */
/* group → ordered list of {id,label} sub-tabs */
const GROUPS={
  /* Hit Shots (was Play): the four stock-shot tabs, plus D-Plane Lab folded in here
     (was its own main tab) — its two pages keep their ids, just renamed/renested. */
  play:[
    {id:'bag',      label:'Stock Shots'},
    {id:'partials', label:'Approach'},
    {id:'shortgame',label:'Short Game'},
    {id:'putting',  label:'Putting'},
    {id:'dplane',   label:'D-Plane'},
    {id:'dpshots',  label:'Shot Presets'}
  ],
  games:[
    {id:'games',  label:'Practice Games'},
    {id:'rgames', label:'On-Course Games'}
  ],
  /* Strategy (was Gameplan) follows the round arc, one sub-tab per phase — Hole Overlay
     leads because it's the tool actually used, not a reference section. (Was labelled
     "Strategy" itself before the main tab took that name — renamed to avoid the dupe.) */
  gameplan:[
    {id:'gameplan',  label:'Hole Overlay'},
    {id:'preshot',   label:'Pre-Shot'},
    {id:'postshot',  label:'Post-Shot'},
    {id:'postround', label:'Post-Round'},
    {id:'gpcourses', label:'My Courses'}
  ],
  diagnose:[
    {id:'chain',label:'The Chain'},
    {id:'ch1',label:'1 Score'},{id:'ch2',label:'2 Ball Flight'},{id:'ch3',label:'3 Forces'},
    {id:'ch4',label:'4 Sequence'},{id:'ch5',label:'5 Body'},{id:'ch6',label:'6 Mind'},{id:'ch7',label:'7 Strategy'}
  ],
  setup:[{id:'specs',label:'My Bag'},{id:'profile',label:'Myself'},{id:'reference',label:'My App'}]
};
let currentGroup='play';

function showGroup(group,el){
  if(typeof pfMaybeSave==='function') pfMaybeSave();   // commit any unsaved Locker Room edits
  /* deep links pass only the group name — resolve the nav button by data-group so
     links survive main-tab reordering (never reference .ngroup by index) */
  if(!el) el=document.querySelector(`.ngroup[data-group="${group}"]`);
  currentGroup=group;
  document.querySelectorAll('.ngroup').forEach(g=>g.classList.remove('active'));
  if(el)el.classList.add('active');
  const sub=document.getElementById('nav-sub');
  const tabs=GROUPS[group];
  /* single-surface groups don't need a sub-strip */
  if(tabs.length<=1){ sub.innerHTML=''; showPage(tabs[0].id); }
  else { sub.innerHTML=tabs.map((t,i)=>`<div class="nav-tab${i===0?' active':''}" data-tab="${t.id}" onclick="showPage('${t.id}',this)">${t.label}</div>`).join(''); showPage(tabs[0].id); }
  updateSubScrollCue();
}
/* Deep-link into a specific sub-tab of another main group (e.g. The Chain → Hit Shots'
   D-Plane sub-tab) — showGroup alone always lands on that group's first sub-tab. */
function showGroupPage(group,pageId){
  showGroup(group);
  showPage(pageId, document.querySelector(`#nav-sub .nav-tab[data-tab="${pageId}"]`));
}
/* Show the right-edge fade only when the sub-tab strip actually overflows (cue that it scrolls). */
function updateSubScrollCue(){
  const sub=document.getElementById('nav-sub'); if(!sub) return;
  requestAnimationFrame(()=>sub.classList.toggle('is-scroll', sub.scrollWidth>sub.clientWidth+2));
}
function showPage(id,tab){
  if(typeof pfMaybeSave==='function') pfMaybeSave();   // commit any unsaved Locker Room edits
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const pg=document.getElementById('page-'+id); if(pg)pg.classList.add('active');
  if(tab)tab.classList.add('active');
  /* the D-Plane viewer's viewBox is fitted to its host width, which is 0 while the
     page is hidden — refit on first show */
  if(id==='dplane'&&typeof dpRenderScene==='function') setTimeout(dpRenderScene,0);
  /* the overlay depends on the bag, the handicap and the courses — any of which may have
     changed on another tab — so rebuild it on show rather than serving a stale render */
  if(id==='gameplan'&&typeof buildHoleOverlay==='function') setTimeout(buildHoleOverlay,0);
}
let toastTimer;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1900); }
function toggleRefMore(el){ const m=el.querySelector('.ref-more'); if(m) m.style.display=m.style.display==='block'?'none':'block'; }
function triggerImportFile(){ document.getElementById('import-file').click(); }

/* Rebuild every data-dependent surface from current STATE — WITHOUT changing the active
   tab. Called after Locker Room edits so changes propagate everywhere relevant. */
function refreshAll(){
  /* the aim optimiser memoises the bag's shapes and club selections — drop them first, or a
     Locker Room edit re-renders every surface against the previous swing */
  if(typeof aimShapeReset==='function') aimShapeReset();
  buildEnvPanels();
  buildLadder();
  buildPartialsTable();
  if(typeof apSyncUnitLabels==='function') apSyncUnitLabels();
  if(typeof ncSyncUnitLabels==='function') ncSyncUnitLabels();
  /* Sync approach stimp control from STATE (values are in static HTML so can't use template literals) */
  const _psv=document.getElementById('partials-stimp-val'); if(_psv) _psv.textContent=STATE.stimp.toFixed(1);
  const _psr=document.getElementById('partials-stimp-range'); if(_psr) _psr.value=STATE.stimp;
  buildShortGame();
  buildEyPanel('approach');
  buildEyPanel('shortgame');
  buildPutting();
  renderPuttSG();
  renderExpectedShots('es-150', 95, typeof approachLie==='function'?approachLie():'fairway');
  renderExpectedShots('es-short', 20, 'atg');
  renderExpectedShots('es-putting', 15, 'green');
  buildChainLanding();
  buildChainLevels();
  buildDplaneLab();
  buildDpShots();
  buildCourseStrategy();
  buildHoleOverlay();
  buildCourses();
  buildRoundTracker();
  buildLongTerm();
  buildPlanShot();
  buildPostShot();
  buildPostRound();
  buildSpecs();
  buildGapping();
  buildProfile();
  buildMyData();
  buildGames();
  buildRoundGames();
  renderCalc(95);
  updateDriverOpt();
}
function renderAll(){
  refreshAll();
  showGroup(currentGroup, document.querySelector('.ngroup.active'));
}
function initConditions(){ /* Environmental Adjustment panels use inline handlers now (see buildEnvPanels). */ }

loadState();
renderAll();
initConditions();
initCalc();

/* Mobile keyboards: give every numeric input the decimal keypad (spec/yardage entry). A
   debounced observer re-applies after the app's frequent dynamic re-renders. */
function applyInputmode(){ document.querySelectorAll('input[type=number]:not([inputmode])').forEach(i=>i.setAttribute('inputmode','decimal')); }
let _imScheduled=false;
function scheduleInputmode(){ if(_imScheduled) return; _imScheduled=true; requestAnimationFrame(()=>{ _imScheduled=false; applyInputmode(); }); }
try{ new MutationObserver(scheduleInputmode).observe(document.body,{childList:true,subtree:true}); }catch(e){}
applyInputmode();
window.addEventListener('resize', updateSubScrollCue);


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { GROUPS, currentGroup, initConditions, refreshAll, renderAll, showGroup, showPage, showGroupPage, toast, toastTimer, toggleRefMore, triggerImportFile });
