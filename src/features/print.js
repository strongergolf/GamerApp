// Printable on-course reference card (StrongerGolf-branded cardstock for the scorecard
// holder). Two sides:
//   Side 1 — Partial Approach Shots  +  Chip Shot Matrix
//   Side 2 — Full-Swing Stock Shots  +  Chip Shot Matrix
// Approach/Stock cells show Total (big) over Carry (small) for the 11:00/10:00/9:00 swings.
// Chip cells show the total distance for a 2 / 5 / 10 yd carry. All from live bag data.

/* Full / ¾ / ½ swing table for a set of club ids (Total over Carry per cell). */
function prSwingTable(clubIds){
  const swings=[['11:00','Full','full'],['10:00','¾','tq'],['9:00','½','half']];
  const firm=window.approachGreenFirmness||0;
  let body='';
  clubIds.forEach(id=>{
    const c=(STATE.clubs||[]).find(x=>x.id===id); if(!c) return;
    const p=perf(id), pr=STATE.partials[id]||{};
    const ratio=(p.carry>0&&p.total>0)?p.carry/p.total:0.97;
    const cell=key=>{
      let total,carry;
      if(key==='full'){ total=p.total!=null?p.total:p.carry; carry=p.carry!=null?p.carry:(total!=null?total*ratio:null); }
      else { total=pr[key]!=null?pr[key]:(p.total!=null?p.total*(key==='tq'?0.92:0.78):null); carry=total!=null?total*ratio:null; }
      if(total==null) return '<td>&mdash;</td>';
      /* mirror the on-screen tables: when Adjust is on, carry scales with air density
         and roll-out is preserved (adjTotal); firmness still adds on top. */
      const aCarry=(window.adjustOn&&carry!=null)?adjCarry(carry):carry;
      const aTotal=(window.adjustOn&&carry!=null)?adjTotal(carry,total):total;
      return `<td><span class="big">${Math.round(aTotal)+firm}</span><span class="sm">${aCarry!=null?Math.round(aCarry)+firm:'—'}</span></td>`;
    };
    body+=`<tr><td class="club"><span class="big">${c.label}</span><span class="sm">${c.loft||''}</span></td>${cell('full')}${cell('tq')}${cell('half')}</tr>`;
  });
  const head=`<tr><th>Club</th>${swings.map(s=>`<th>${s[0]}<span class="thsub">${s[1]}</span></th>`).join('')}</tr>`;
  return `<table class="ref"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
/* Full-swing reference: Carry · Total · horizontal dispersion (single 86% L/R) per club. */
function prFullTable(clubIds){
  const firm=window.approachGreenFirmness||0;
  let body='';
  clubIds.forEach(id=>{
    const c=(STATE.clubs||[]).find(x=>x.id===id); if(!c||c.type==='putter') return;
    const p=perf(id); if(p.carry==null&&p.total==null) return;
    /* env adjustment: carry scales, roll-out preserved (adjTotal); off ⇒ stock */
    const aCarry=(window.adjustOn&&p.carry!=null)?adjCarry(p.carry):p.carry;
    const aTotal=(window.adjustOn&&p.carry!=null&&p.total!=null)?adjTotal(p.carry,p.total):p.total;
    const carry=aCarry!=null?Math.round(aCarry)+firm:null;
    const total=aTotal!=null?Math.round(aTotal)+firm:carry;
    const d86=(p.carry!=null&&typeof disp86==='function')?disp86(p.carry):null;
    body+=`<tr><td class="club"><span class="big">${c.label}</span><span class="sm">${c.loft||''}</span></td>`
      +`<td>${carry!=null?carry:'&mdash;'}</td>`
      +`<td><span class="big">${total!=null?total:'&mdash;'}</span></td>`
      +`<td>${d86!=null?'&plusmn;'+d86:'&mdash;'}</td></tr>`;
  });
  const head=`<tr><th>Club</th><th>Carry</th><th>Total</th><th>86% L/R</th></tr>`;
  return `<table class="ref"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
/* Chip matrix — total distance (carry + rollout) for a 2 / 5 / 10 yd carry per club. */
function prChipTable(){
  const carries=[2,5,10], stimp=STATE.stimp;
  const clubs=(typeof PARTIAL_CLUBS!=='undefined'?PARTIAL_CLUBS:['7i','8i','9i','P','W','S','X'])
    .map(id=>(STATE.clubs||[]).find(c=>c.id===id)).filter(Boolean);
  let body='';
  clubs.forEach(c=>{
    const loft=parseFloat(c.loft)||35;
    const cells=carries.map(carry=>{ const total=carry+(typeof chipRollout==='function'?chipRollout(carry,loft,stimp,0,true):carry); return `<td>${Math.round(total*10)/10}</td>`; }).join('');
    body+=`<tr><td class="club"><span class="big">${c.label}</span><span class="sm">${c.loft||''}</span></td>${cells}</tr>`;
  });
  const head=`<tr><th>Club</th>${carries.map(y=>`<th>${y} yd<span class="thsub">Carry</span></th>`).join('')}</tr>`;
  return `<table class="ref"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
/* Longer clubs (driver / woods / hybrids / long irons) not in the partial set, longest first. */
function prStockClubIds(){
  const partial=new Set(typeof PARTIAL_CLUBS!=='undefined'?PARTIAL_CLUBS:[]);
  return (STATE.clubs||[]).filter(c=>c.type!=='putter'&&!partial.has(c.id))
    .slice().sort((a,b)=>((perf(b.id).total||perf(b.id).carry||0)-(perf(a.id).total||perf(a.id).carry||0)))
    .map(c=>c.id);
}
/* Every non-putter club, longest first — one continuous full-swing list for the whole bag. */
function prAllFullIds(){
  return (STATE.clubs||[]).filter(c=>c.type!=='putter')
    .slice().sort((a,b)=>((perf(b.id).total||perf(b.id).carry||0)-(perf(a.id).total||perf(a.id).carry||0)))
    .map(c=>c.id);
}
/* Legacy single-matrix export (used nowhere now, kept for safety) */
function stockShotsPrintTable(){ return prSwingTable(prStockClubIds()); }

const PR_ARC=`<svg class="arc" viewBox="0 0 220 30" xmlns="http://www.w3.org/2000/svg"><path d="M 8,26 C 151,16 166,-6 212,26" fill="none" stroke="#F4C2C2" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const prMark=`<div class="mark"><span class="s">Stronger</span><span class="g">Golf</span></div>`;
/* When the Environmental Adjustment is on, the card carries the adjusted numbers — so
   label it, otherwise an adjusted card is indistinguishable from a stock one later. */
function prConditionsNote(){
  if(!window.adjustOn) return `<div class="sub">On-Course Reference</div>`;
  const b=STATE.baseline||{};
  const f=(typeof carryFactor==='function')?carryFactor():1;
  const pct=(f-1)*100, sign=pct>0?'+':'';
  return `<div class="sub">On-Course Reference &middot; Playing Conditions</div>
    <div class="cond-note">${Math.round(b.tempF)}&deg;F &middot; ${Math.round(b.altitudeFt)} ft &middot; ${Math.round(b.humidity)}% RH &middot; ${b.pressureInHg} inHg &nbsp;&mdash;&nbsp; carries play <b>${sign}${pct.toFixed(1)}%</b></div>`;
}
/* Single-sided card: Full-Swing Stock Shots (whole bag) on the left; Partial Approach
   Shots over the Chip Shot Matrix on the right. */
function prCard(){
  const partialIds=(typeof PARTIAL_CLUBS!=='undefined'?PARTIAL_CLUBS:['7i','8i','9i','P','W','S','X']);
  return `<section class="card">
    <div class="head">${PR_ARC}${prMark}${prConditionsNote()}</div>
    <div class="cols">
      <div class="col"><div class="mtitle">Full Swing Stock Shots</div>${prFullTable(prAllFullIds())}</div>
      <div class="col">
        <div class="mtitle">Partial Approach Shots</div>${prSwingTable(partialIds)}
        <div class="mtitle" style="margin-top:12px">Chip Shot Matrix</div>${prChipTable()}
      </div>
    </div>
    <div class="foot">${prMark}<span>Gamer&rsquo;s App &middot; ${new Date().toLocaleDateString()}</span></div>
  </section>`;
}
function printCardHTML(sides){
  const css=`
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;color:#0C2340}
    .card{padding:14px 18px}
    .head{text-align:center;border-bottom:3px solid #00853F;padding-bottom:7px;margin-bottom:12px}
    .head .arc{width:140px;height:17px;display:block;margin:0 auto -1px}
    .mark{font-family:'Arial Narrow',Arial,sans-serif;font-size:1.7rem;font-weight:800;line-height:1}
    .mark .s{color:#00853F}.mark .g{color:#d96070}
    .head .sub{font-size:.62rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#3a5a7a;margin-top:3px}
    .head .cond-note{font-size:.6rem;font-weight:600;color:#0C2340;margin-top:4px}
    .head .cond-note b{color:#00853F}
    .cols{display:flex;gap:18px;align-items:flex-start}
    .col{flex:1;min-width:0}
    .mtitle{font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0C2340;text-align:center;margin-bottom:5px}
    table.ref{width:100%;border-collapse:collapse}
    table.ref th{background:#0C2340;color:#fff;padding:5px 4px;border:1px solid #0C2340;font-size:9px;font-weight:700;letter-spacing:.04em;line-height:1.15}
    table.ref th .thsub{display:block;font-size:7.5px;font-weight:400;color:#9fd0bd;letter-spacing:.06em}
    table.ref td{border:1px solid #c0cedd;padding:3px 4px;text-align:center;vertical-align:middle}
    table.ref tr:nth-child(even) td{background:#f0f4f8}
    table.ref td.club{text-align:left;padding-left:7px}
    table.ref .big{font-weight:800;font-size:12px;display:block;line-height:1.1}
    table.ref td.club .big{font-size:13px}
    table.ref .sm{display:block;font-size:8px;color:#3a5a7a;font-weight:400;line-height:1.1}
    .foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;border-top:1px solid #c0cedd;padding-top:7px}
    .foot .mark{font-size:.95rem}
    .foot span{font-size:9px;color:#3a5a7a;letter-spacing:.04em}
    @page{margin:12mm;size:landscape}@media print{.card{padding:0}}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>StrongerGolf — Reference Card</title><style>${css}</style></head><body>${sides.join('')}</body></html>`;
}
function printCard(){
  const w=window.open('','_blank');
  if(!w){ if(typeof toast==='function') toast('Allow pop-ups to print the card'); return; }
  w.document.open(); w.document.write(printCardHTML([prCard()])); w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 350);
}
/* All three matrix buttons print the unified two-sided reference card. */
function printMatrix(type){ printCard(); }

Object.assign(window, { printMatrix, printCard, prCard, prConditionsNote, prSwingTable, prFullTable, prChipTable, prStockClubIds, stockShotsPrintTable, printCardHTML });
