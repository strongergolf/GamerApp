// Effective-yardage adjusters — a compact slider per Plan-a-Shot equation term,
// embedded under the distance slider on the Approach and Short Game tabs.
// Reuses the coefficient tables from planshot.js (PS_LIE/PS_STANCE/PS_SHOT/PS_NERVES,
// PS_WIND_*, PS_ELEV_K, psAirDelta). Each tab keeps its own independent selections.
//
// Per-context weights (EY_WEIGHT) let us later refine how much each variable impacts
// approach vs short-game shots — all default to 1.0 for now.

const EY = {
  approach:  { lie:'fairway', stance:'level', wind:0, elev:0, shot:'stock', nerves:'none' },
  shortgame: { lie:'fairway', stance:'level', wind:0, elev:0, shot:'stock', nerves:'none' }
};
const EY_DEFAULTS = { lie:'fairway', stance:'level', wind:0, elev:0, shot:'stock', nerves:'none' };
/* Side-hill stance (ball relative to feet) → distance delta (yd). Both directions cost a
   little distance through off-centre contact / choking down; estimates, refine later. */
const EY_STANCE = { wellbelow:-4, below:-2, level:0, above:-2, wellabove:-4 };
/* refine later: scale a term's yardage impact per shot type */
const EY_WEIGHT = {
  approach:  { lie:1, stance:1, wind:1, elev:1, shot:1, nerves:1, air:1 },
  shortgame: { lie:1, stance:1, wind:1, elev:1, shot:1, nerves:1, air:1 }
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
  { key:'lie', label:'Lie', type:'step', opts:[
      ['heavyrough','Heavy rough'],['bunker','Bunker'],['hardpan','Hardpan'],['divot','Divot'],
      ['fairway','Fairway'],['tee','Tee'],['lightrough','Light rough · flyer']] },
  { key:'stance', label:'Stance', type:'step', opts:[
      ['wellbelow','Well below feet'],['below','Below feet'],['level','Level'],['above','Above feet'],['wellabove','Well above feet']] },
  { key:'wind', label:'Wind', type:'range', min:-20, max:20, step:1,
      fmt:v=> v>0?`${v} mph into`:v<0?`${-v} mph down`:'calm' },
  { key:'elev', label:'Elevation', type:'range', min:-30, max:30, step:1,
      fmt:v=> v>0?`+${v} yd up`:v<0?`${v} yd down`:'level' },
  { key:'shot', label:'Trajectory', type:'step', opts:[['knockdown','Knockdown'],['stock','Stock'],['high','High / soft']] },
  { key:'nerves', label:'Adrenaline', type:'step', opts:[['none','None'],['some','Some'],['full','Full send']] }
];

function eyBase(ctx){
  if(ctx==='approach') return parseInt(document.getElementById('yard-slider')?.value||95);
  if(ctx==='shortgame') return parseInt(document.getElementById('chip-slider')?.value||20);
  return 0;
}
function eyWindMult(ctx){ const s=EY[ctx].shot; return s==='knockdown'?0.6 : s==='high'?1.2 : 1.0; }
/* per-term yardage delta for a context, given base yardage S */
function eyDelta(ctx,key,S){
  const st=EY[ctx]; const w=(EY_WEIGHT[ctx]&&EY_WEIGHT[ctx][key]!=null)?EY_WEIGHT[ctx][key]:1;
  let d=0;
  switch(key){
    case 'lie':    d=(typeof PS_LIE!=='undefined'?PS_LIE[st.lie]:0)||0; break;
    case 'stance': d=EY_STANCE[st.stance]||0; break;   /* side-hill stance distance cost */
    case 'wind':   { const hc=(typeof PS_WIND_HEAD!=='undefined'?PS_WIND_HEAD:0.01), tc=(typeof PS_WIND_TAIL!=='undefined'?PS_WIND_TAIL:0.005);
                     d=(st.wind>=0?hc:tc)*st.wind*S*eyWindMult(ctx); break; }   /* + into=longer, − down=shorter */
    case 'elev':   d=st.elev*(typeof PS_ELEV_K!=='undefined'?PS_ELEV_K:1.2); break;
    case 'shot':   d=(EY_SHOT[st.shot]?EY_SHOT[st.shot].distFrac:0)*S; break;   /* club-selection shift */
    case 'nerves': d=(typeof PS_NERVES!=='undefined'?PS_NERVES[st.nerves]:0)||0; break;
    case 'air':    d=(typeof psAirDelta==='function'?psAirDelta(S):0)||0; break;
  }
  return d*w;
}
const EY_KEYS=['lie','stance','wind','elev','shot','nerves','air'];
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
        <span class="ey-term-val"><span id="ey-${ctx}-${term.key}-v">${eyTermValLabel(ctx,term)}</span> <b id="ey-${ctx}-${term.key}-c" style="color:${eyColor(d)}">${eyFmt(d)}</b></span>
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
  if(ctx==='approach'){ const t=parseInt(document.getElementById('yard-slider')?.value||95); if(typeof renderCalc==='function') renderCalc(t); }
  else if(ctx==='shortgame'){ if(typeof renderChipDial==='function') renderChipDial(); }
}
function eySet(ctx,key,raw){
  const term=EY_TERMS.find(t=>t.key===key); if(!term) return;
  if(term.type==='step'){ const i=Math.max(0,Math.min(term.opts.length-1,Math.round(parseFloat(raw)))); EY[ctx][key]=term.opts[i][0]; }
  else { EY[ctx][key]=parseFloat(raw)||0; }
  eyRefreshSummary(ctx);
  eyHostRender(ctx);
}
function eyReset(ctx){ Object.assign(EY[ctx], EY_DEFAULTS); buildEyPanel(ctx); eyHostRender(ctx); }

// Expose for inline handlers and the renderAll orchestrator.
Object.assign(window, { EY, EY_TERMS, EY_WEIGHT, EY_SHOT, EY_STANCE, eyDelta, eyTotal, eyEffective, eyBase,
  buildEyPanel, eyRefreshSummary, eyHostRender, eySet, eyReset });
