// Effective-yardage adjusters — a compact slider per Plan-a-Shot equation term,
// embedded under the distance slider on the Approach and Short Game tabs.
// Reuses the coefficient tables from planshot.js (PS_LIE/PS_STANCE/PS_SHOT/PS_NERVES,
// PS_WIND_*, PS_ELEV_K, psAirDelta). Each tab keeps its own independent selections.
//
// Per-context weights (EY_WEIGHT) let us later refine how much each variable impacts
// approach vs short-game shots — all default to 1.0 for now.

const EY = {
  approach:  { situation:'fairway', lieq:'standard', stance:'level', elev:0, firmness:'avg' },
  shortgame: { situation:'fairway', lieq:'standard', stance:'level', elev:0, firmness:'avg' }
};
const EY_DEFAULTS = { situation:'fairway', lieq:'standard', stance:'level', elev:0, firmness:'avg' };
/* Situation = Strokes-Gained status (where you're playing from) → base distance cost (yd).
   Also drives the Expected Strokes / Strokes-Gained lie via approachLie(). */
const EY_SITUATION = { tee:+2, fairway:0, rough:-6, bunker:-8, recovery:-15 };
/* Lie = how the ball sits within that situation → distance modifier (stacks on Situation) */
const EY_LIE = { clean:+2, standard:0, down:-4, buried:-9 };
/* Stance = up/downhill slope you stand on (independent of target elevation). Uphill adds
   loft → shorter → club up (+); downhill delofts → longer (−). Estimates, refine later. */
const EY_STANCE = { welldownhill:-8, downhill:-4, level:0, uphill:+4, welluphill:+8 };
/* Firmness = green firmness → yards added to ROLL-OUT (the carry/roll split in the shot
   cards), via window.approachGreenFirmness. Does not change club selection. */
const EY_FIRMNESS = { vsoft:-2, soft:-1, avg:0, firm:2, vfirm:4 };
/* SG status → strokes-gained lie key (SR table lies: fairway / rough / sand) */
function approachLie(){
  const s=(EY.approach&&EY.approach.situation)||'fairway';
  return s==='rough'?'rough' : s==='bunker'?'sand' : s==='recovery'?'rough' : 'fairway';
}
/* refine later: scale a term's yardage impact per context */
const EY_WEIGHT = {
  approach:  { situation:1, lieq:1, stance:1, elev:1, firmness:1, air:1 },
  shortgame: { situation:1, lieq:1, stance:1, elev:1, firmness:1, air:1 }
};

/* ---- Shot-type (trajectory) model — researched estimates, refine from LM data ----
   distFrac = how the EFFECTIVE (club-selection) yardage shifts as a fraction of distance.
     A knockdown flies shorter for a given club, so you club UP (+); a high shot flies a
     touch farther only to a point, so a small club-down (−).
   launchMult/spinMult/heightMult/rollMult/landMult = applied per club in the Approach
   renderer so the effect scales through the bag (a wedge's 30° launch drops more in
   absolute terms than a long iron's 14°). See report in the commit / chat. */
const EY_SHOT = {
  stock:     { distFrac: 0.00, launchMult:1.00, spinMult:1.00, heightMult:1.00, rollMult:1.00, landMult:1.00 },
  knockdown: { distFrac:+0.07, launchMult:0.60, spinMult:0.80, heightMult:0.68, rollMult:2.10, landMult:0.78 },
  high:      { distFrac:-0.02, launchMult:1.35, spinMult:1.15, heightMult:1.32, rollMult:0.45, landMult:1.20 }
};

/* step = categorical slider (snaps through named options); range = continuous */
const EY_TERMS = [
  { key:'situation', label:'Situation', type:'step', opts:[
      ['tee','Tee'],['fairway','Fairway'],['rough','Rough'],['bunker','Bunker'],['recovery','Recovery']] },
  { key:'lieq', label:'Lie', type:'step', opts:[
      ['clean','Clean / up'],['standard','Standard'],['down','Sitting down'],['buried','Buried / thick']] },
  { key:'stance', label:'Stance', type:'step', opts:[
      ['welldownhill','Well downhill'],['downhill','Downhill'],['level','Level'],['uphill','Uphill'],['welluphill','Well uphill']] },
  { key:'elev', label:'Elevation', type:'range', min:-30, max:30, step:1,
      fmt:v=> v>0?`+${v} yd up`:v<0?`${v} yd down`:'level' },
  { key:'firmness', label:'Firmness', type:'step', noContrib:true, opts:[
      ['vsoft','Very soft'],['soft','Soft'],['avg','Average'],['firm','Firm'],['vfirm','Very firm']] }
];

function eyBase(ctx){
  if(ctx==='approach') return parseInt(document.getElementById('yard-slider')?.value||95);
  if(ctx==='shortgame') return parseInt(document.getElementById('chip-slider')?.value||20);
  return 0;
}
/* per-term yardage delta for a context, given base yardage S */
function eyDelta(ctx,key,S){
  const st=EY[ctx]; const w=(EY_WEIGHT[ctx]&&EY_WEIGHT[ctx][key]!=null)?EY_WEIGHT[ctx][key]:1;
  let d=0;
  switch(key){
    case 'situation': d=EY_SITUATION[st.situation]||0; break;
    case 'lieq':      d=EY_LIE[st.lieq]||0; break;
    case 'stance':    d=EY_STANCE[st.stance]||0; break;
    case 'elev':      d=st.elev*(typeof PS_ELEV_K!=='undefined'?PS_ELEV_K:1.2); break;
    case 'firmness':  d=0; break;   /* changes the roll-out split, not club selection (approachGreenFirmness) */
    case 'air':       d=(typeof psAirDelta==='function'?psAirDelta(S):0)||0; break;
  }
  return d*w;
}
const EY_KEYS=['situation','lieq','stance','elev','firmness','air'];
function eyTotal(ctx,S){ return EY_KEYS.reduce((a,k)=>a+eyDelta(ctx,k,S),0); }
/* effective (plays-like) yardage for a context, given a measured base */
function eyEffective(ctx,measured){ return measured + eyTotal(ctx,measured); }

const eyColor=d=>d>0.5?'#d96070':d<-0.5?'#1a5aaa':'var(--muted)';
const eyFmt=d=>{ const r=Math.round(d); return (r>0?'+':r<0?'−':'')+Math.abs(r); };
function eyTermValLabel(ctx,term){
  if(term.type==='step'){ const o=term.opts.find(x=>x[0]===EY[ctx][term.key]); return o?o[1]:term.opts[0][1]; }
  return term.fmt(EY[ctx][term.key]);
}
function eySummaryHTML(ctx,S){
  const tot=eyTotal(ctx,S), eff=Math.round(S+tot), air=eyDelta(ctx,'air',S);
  return `<span class="ey-meas">${Math.round(S)}</span><span class="ey-arrow">plays</span>`
    +`<span class="ey-eff">${eff} yd</span><span class="ey-adj" style="color:${eyColor(tot)}">${eyFmt(tot)} yd</span>`
    +`<span class="ey-air">air ${eyFmt(air)} (auto)</span>`;
}
function buildEyPanel(ctx){
  const host=document.getElementById('ey-'+ctx); if(!host) return;
  const S=eyBase(ctx);
  const rows=EY_TERMS.map(term=>{
    const d=eyDelta(ctx,term.key,S);
    let control;
    if(term.type==='step'){
      const idx=Math.max(0,term.opts.findIndex(o=>o[0]===EY[ctx][term.key]));
      control=`<input type="range" min="0" max="${term.opts.length-1}" step="1" value="${idx}" oninput="eySet('${ctx}','${term.key}',this.value)">`;
    } else {
      control=`<input type="range" min="${term.min}" max="${term.max}" step="${term.step}" value="${EY[ctx][term.key]}" oninput="eySet('${ctx}','${term.key}',this.value)">`;
    }
    return `<div class="ey-term">
      <div class="ey-term-head">
        <span class="ey-term-label">${term.label}</span>
        <span class="ey-term-val"><span id="ey-${ctx}-${term.key}-v">${eyTermValLabel(ctx,term)}</span>${term.noContrib?'':` <b id="ey-${ctx}-${term.key}-c" style="color:${eyColor(d)}">${eyFmt(d)}</b>`}</span>
      </div>
      ${control}
    </div>`;
  }).join('');
  host.innerHTML=`<div class="ey-panel">
    <div class="ey-head"><span class="ey-title">Situational Info</span><div class="ey-summary" id="ey-${ctx}-summary">${eySummaryHTML(ctx,S)}</div><button type="button" class="ey-reset" onclick="eyReset('${ctx}')">reset</button></div>
    <div class="ey-grid">${rows}</div>
  </div>`;
}
/* Update the live numbers (per-term contribution, value label, summary) without
   rebuilding the sliders — keeps slider focus while dragging, and re-syncs the
   percentage terms (wind/air) when the base distance changes. */
function eyRefreshSummary(ctx){
  if(!document.getElementById('ey-'+ctx+'-summary')) return;
  const S=eyBase(ctx);
  EY_TERMS.forEach(term=>{
    const c=document.getElementById(`ey-${ctx}-${term.key}-c`);
    if(c){ const d=eyDelta(ctx,term.key,S); c.textContent=eyFmt(d); c.style.color=eyColor(d); }
    const v=document.getElementById(`ey-${ctx}-${term.key}-v`); if(v) v.textContent=eyTermValLabel(ctx,term);
  });
  const sum=document.getElementById(`ey-${ctx}-summary`); if(sum) sum.innerHTML=eySummaryHTML(ctx,S);
}
function eyHostRender(ctx){
  if(ctx==='approach'){
    const t=parseInt(document.getElementById('yard-slider')?.value||95);
    if(typeof renderCalc==='function') renderCalc(t);
    if(typeof renderExpectedShots==='function') renderExpectedShots('es-150', t, approachLie());  /* Situation drives SG lie */
    if(typeof buildPartialsTable==='function') buildPartialsTable();                              /* firmness affects the matrix */
  }
  else if(ctx==='shortgame'){ if(typeof renderChipDial==='function') renderChipDial(); }
}
function eySet(ctx,key,raw){
  const term=EY_TERMS.find(t=>t.key===key); if(!term) return;
  if(term.type==='step'){ const i=Math.max(0,Math.min(term.opts.length-1,Math.round(parseFloat(raw)))); EY[ctx][key]=term.opts[i][0]; }
  else { EY[ctx][key]=parseFloat(raw)||0; }
  if(key==='firmness' && ctx==='approach') window.approachGreenFirmness = EY_FIRMNESS[EY.approach.firmness]||0;
  eyRefreshSummary(ctx);
  eyHostRender(ctx);
}
function eyReset(ctx){
  Object.assign(EY[ctx], EY_DEFAULTS);
  if(ctx==='approach') window.approachGreenFirmness = EY_FIRMNESS[EY.approach.firmness]||0;
  buildEyPanel(ctx); eyHostRender(ctx);
}

// Expose for inline handlers and the renderAll orchestrator.
Object.assign(window, { EY, EY_TERMS, EY_WEIGHT, EY_SHOT, EY_STANCE, EY_SITUATION, EY_LIE, EY_FIRMNESS, approachLie, eyDelta, eyTotal, eyEffective, eyBase,
  buildEyPanel, eyRefreshSummary, eyHostRender, eySet, eyReset });
