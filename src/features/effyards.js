// Effective-yardage adjusters — a compact slider per Plan-a-Shot equation term,
// embedded under the distance slider on the Approach and Short Game tabs.
// Reuses the coefficient tables from planshot.js (PS_LIE/PS_STANCE/PS_SHOT/PS_NERVES,
// PS_WIND_*, PS_ELEV_K, psAirDelta). Each tab keeps its own independent selections.
//
// Per-context weights (EY_WEIGHT) let us later refine how much each variable impacts
// approach vs short-game shots — all default to 1.0 for now.

const EY = {
  approach:  { lie:'fairway', stance:'flat', wind:0, elev:0, shot:'stock', nerves:'none' },
  shortgame: { lie:'fairway', stance:'flat', wind:0, elev:0, shot:'stock', nerves:'none' }
};
const EY_DEFAULTS = { lie:'fairway', stance:'flat', wind:0, elev:0, shot:'stock', nerves:'none' };
/* refine later: scale a term's yardage impact per shot type */
const EY_WEIGHT = {
  approach:  { lie:1, stance:1, wind:1, elev:1, shot:1, nerves:1, air:1 },
  shortgame: { lie:1, stance:1, wind:1, elev:1, shot:1, nerves:1, air:1 }
};

/* step = categorical slider (snaps through named options); range = continuous */
const EY_TERMS = [
  { key:'lie', label:'Lie', type:'step', opts:[
      ['heavyrough','Heavy rough'],['bunker','Bunker'],['hardpan','Hardpan'],['divot','Divot'],
      ['fairway','Fairway'],['tee','Tee'],['lightrough','Light rough · flyer']] },
  { key:'stance', label:'Stance', type:'step', opts:[
      ['uphill','Uphill lie'],['below','Ball below feet'],['flat','Flat'],['above','Ball above feet'],['downhill','Downhill lie']] },
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
    case 'stance': d=(typeof PS_STANCE!=='undefined'?PS_STANCE[st.stance]:0)||0; break;
    case 'wind':   { const hc=(typeof PS_WIND_HEAD!=='undefined'?PS_WIND_HEAD:0.01), tc=(typeof PS_WIND_TAIL!=='undefined'?PS_WIND_TAIL:0.005);
                     d=(st.wind>=0?hc:tc)*st.wind*S*eyWindMult(ctx); break; }   /* + into=longer, − down=shorter */
    case 'elev':   d=st.elev*(typeof PS_ELEV_K!=='undefined'?PS_ELEV_K:1.2); break;
    case 'shot':   d=(typeof PS_SHOT!=='undefined'?PS_SHOT[st.shot]:0)||0; break;
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
    <div class="ey-head"><span class="ey-title">Plays-Like Adjustments</span><button type="button" class="ey-reset" onclick="eyReset('${ctx}')">reset</button></div>
    <div class="ey-summary" id="ey-${ctx}-summary">${eySummaryHTML(ctx,S)}</div>
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
Object.assign(window, { EY, EY_TERMS, EY_WEIGHT, eyDelta, eyTotal, eyEffective, eyBase,
  buildEyPanel, eyRefreshSummary, eyHostRender, eySet, eyReset });
