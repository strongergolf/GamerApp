// Printable on-course reference card (StrongerGolf-branded cardstock for the scorecard
// holder). Two sides:
//   Side 1 — Partial Approach Shots  +  Chip Carry & Roll Split
//   Side 2 — Full-Swing Stock Shots  +  Chip Carry & Roll Split
// Approach/Stock cells show Total (big) over Carry (small) for the 11:00/10:00/9:00 swings.
// Chip cells show how each club divides a chip into carry and roll. All from live bag data.

/* Full / ¾ / ½ / ⅓ swing table for a set of club ids (Total over Carry per cell). */
function prSwingTable(clubIds){
  const swings=[['11:00','Full','full'],['10:00','¾','tq'],['9:00','½','half'],['8:00','⅓','third']];
  const firm=window.approachGreenFirmness||0;
  let body='';
  clubIds.forEach(id=>{
    const c=(STATE.clubs||[]).find(x=>x.id===id); if(!c) return;
    const p=perf(id), pr=STATE.partials[id]||{};
    const ratio=(p.carry>0&&p.total>0)?p.carry/p.total:0.97;
    const cell=key=>{
      let total,carry;
      if(key==='full'){ total=p.total!=null?p.total:p.carry; carry=p.carry!=null?p.carry:(total!=null?total*ratio:null); }
      else { const fb={tq:0.92,half:0.78,third:0.62}[key]; total=pr[key]!=null?pr[key]:(p.total!=null?p.total*fb:null); carry=total!=null?total*ratio:null; }
      if(total==null) return '<td>&mdash;</td>';
      /* mirror the on-screen tables: when Adjust is on, carry scales with air density
         and roll-out is preserved (adjTotal); firmness still adds on top. */
      const aCarry=(window.adjustOn&&carry!=null)?adjCarry(carry):carry;
      const aTotal=(window.adjustOn&&carry!=null)?adjTotal(carry,total):total;
      return `<td><span class="big">${Math.round(aTotal)+firm}</span><span class="sm">${aCarry!=null?Math.round(aCarry)+firm:'—'}</span></td>`;
    };
    body+=`<tr><td class="club"><span class="big">${c.label}</span><span class="sm">${c.loft||''}</span></td>${cell('full')}${cell('tq')}${cell('half')}${cell('third')}</tr>`;
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
  const head=`<tr><th>Club</th><th>Carry</th><th>TTL</th><th>86% L/R</th></tr>`;
  return `<table class="ref"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
/* CHIP REFERENCE — the carry-to-roll split per club, matching the Short Game tab.
   It used to print the total for a 2 / 5 / 10 yd carry, but roll is proportional to carry, so
   those three columns were the same split restated three times. The split itself is the useful
   thing standing over the ball: what share of the shot flies, and where to land it. */
function prChipTable(){
  const clubs=prPartialIds()
    .map(id=>(STATE.clubs||[]).find(c=>c.id===id)).filter(Boolean);
  let body='';
  clubs.forEach(c=>{
    const R=(typeof chipLiveRollRatio==='function')?chipLiveRollRatio(c.loft):1;
    const carryPct=100/(1+R);
    body+=`<tr><td class="club"><span class="big">${c.label}</span><span class="sm">${c.loft||''}</span></td>`
      +`<td><span class="big">${carryPct.toFixed(0)}%</span></td>`
      +`<td>${(100-carryPct).toFixed(0)}%</td>`
      +`<td>${(typeof chipRatioStr==='function')?chipRatioStr(R):R.toFixed(1)}</td></tr>`;
  });
  const head=`<tr><th>Club</th><th>Carry<span class="thsub">of shot</span></th><th>Roll</th><th>Ratio</th></tr>`;
  return `<table class="ref"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/* The split only holds for the setup it was computed from, so the card carries it too —
   otherwise the numbers look absolute when they are anything but. */
function prChipNote(){
  const txt=(typeof chipSetupSummary==='function')?chipSetupSummary():`stimp ${STATE.stimp.toFixed(1)}`;
  return `<div class="chip-note">Same split at every distance &middot; ${txt}</div>`;
}
/* The partial-swing clubs, from the bag as it stands (see partialClubIds in approach.js) —
   the print card has to show the clubs actually being carried, not a fixed list of ids. */
function prPartialIds(){
  return (typeof partialClubIds==='function') ? partialClubIds() : [];
}
/* Longer clubs (driver / woods / hybrids / long irons) not in the partial set, longest first. */
function prStockClubIds(){
  const partial=new Set(prPartialIds());
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
  const partialIds=prPartialIds();
  return `<section class="card">
    <div class="head">${PR_ARC}${prMark}${prConditionsNote()}</div>
    <div class="cols">
      <div class="col"><div class="mtitle">Full Swing Stock Shots</div>${prFullTable(prAllFullIds())}</div>
      <div class="col">
        <div class="mtitle">Partial Approach Shots</div>${prSwingTable(partialIds)}
        <div class="mtitle" style="margin-top:12px">Chip Carry &amp; Roll Split</div>${prChipNote()}${prChipTable()}
      </div>
    </div>
    <div class="foot">${prMark}<span>Player&rsquo;s App &middot; ${new Date().toLocaleDateString()}</span></div>
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
    .chip-note{font-size:.55rem;font-weight:600;color:#5A6B7B;text-align:center;margin:-2px 0 5px}
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
    .cat th,.cat td{font-size:8.5px;padding:2px 4px}
    .cat td.club .big{font-size:11px}
    .prof .head{padding-bottom:5px;margin-bottom:8px}
    .prof table.ref td{padding:1px 4px}
    .prof table.ref .big{font-size:11px}
    .prof table.ref td.club .big{font-size:11px}
    .prof table.ref .sm{font-size:7px}
    .prof table.ref th{padding:3px 4px}
    .prof .mtitle{margin-bottom:3px}
    .prof .foot{margin-top:8px;padding-top:5px}
    table.ref.plan td{font-size:9px}
    .prof table.tr td.club{font-size:8.5px;font-weight:600;line-height:1.2}
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
/* THE CATALOGUE — every club owned, on paper. Not the on-course reference card: that one is
   yardages for playing, this one is specs for owning — what to hand an insurer, a fitter, or
   whoever is looking in the garage for the 4 iron. Grouped by where the club lives, because
   that is how you go and find it. */
function prCatalogue(){
  const rows=(typeof clubCatalogue==='function')?clubCatalogue():[];
  const groups={};
  rows.forEach(r=>{ (groups[r.where]=groups[r.where]||[]).push(r); });
  const order=Object.keys(groups).sort((a,b)=> a==='Current Bag'?-1 : b==='Current Bag'?1 : a.localeCompare(b));
  const cell=v=>(v==null||v==='')?'&mdash;':String(v);
  const head=`<tr><th>Club</th><th>Make &amp; model</th><th>Loft</th><th>Lie</th><th>Length</th><th>Shaft</th><th>Yr</th><th>Carry</th><th>TTL</th></tr>`;
  const body=order.map(g=>{
    const list=groups[g].slice();
    return `<div class="mtitle" style="margin-top:12px">${g} <span style="font-weight:400">&middot; ${list.length}</span></div>`
      + `<table class="ref cat"><thead>${head}</thead><tbody>` + list.map(r=>
        `<tr><td class="club"><span class="big">${cell(r.label)}</span></td>`
        + `<td style="text-align:left">${cell([r.make,r.model].filter(Boolean).join(' '))}</td>`
        + `<td>${cell(r.loft)}</td><td>${cell(r.lie)}</td><td>${cell(r.length)}</td>`
        + `<td style="text-align:left">${cell(r.shaft)}</td><td>${cell(r.year)}</td>`
        + `<td>${cell(r.carry)}</td><td>${cell(r.total)}</td></tr>`).join('')
      + `</tbody></table>`;
  }).join('');
  return `<section class="card">
    <div class="head">${PR_ARC}${prMark}<div class="sub">Club Catalogue &middot; ${rows.length} clubs</div></div>
    ${body}
    <div class="foot">${prMark}<span>Player&rsquo;s App &middot; ${new Date().toLocaleDateString()}</span></div>
  </section>`;
}
function printClubs(){
  const w=window.open('','_blank');
  if(!w){ if(typeof toast==='function') toast('Allow pop-ups to print the catalogue'); return; }
  w.document.open(); w.document.write(printCardHTML([prCatalogue()])); w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 350);
}
/* All three matrix buttons print the unified two-sided reference card. */
function printMatrix(type){ printCard(); }

Object.assign(window, { printMatrix, printCard, printClubs, prCatalogue, prCard, prConditionsNote, prSwingTable, prFullTable, prChipTable, prChipNote, prStockClubIds, stockShotsPrintTable, printCardHTML });


/* ============================================================
   THE SCORING PROFILE — expected strokes, on paper, before a tournament
   ============================================================
   Page one is the player's own strokes table: expected strokes to hole out from every
   situation and distance that matters, on YOUR player model (big) over the benchmark set in
   Settings (small), the same pairing as Total over Carry on the reference card. Plus the few
   trade-offs a tournament player actually decides on, worked out from that same table, and
   the expected score for a hole of each length.
   Page two, when one exists, is the round plan for the course: clubs, aims, expected score
   and notes per hole, as frozen at Start.
   All of it is prepared before the round and distance-only: no elevation, slope, wind or
   weather anywhere in it, which is the line Rule 4.3a draws and the one this app keeps. */
const PR_PROF_YD = [10,20,30,40,50,60,75,100,125,150,175,200,225,250];
const PR_PROF_FT = [2,3,4,5,6,8,10,12,15,20,30,40,60];
const PR_PROF_TEE = { 3:[130,160,190,220], 4:[340,380,420,460], 5:[500,540,580] };
function prE(lie, d, who){
  if(typeof srForPlayer!=='function') return null;
  const h = who==='bench' ? ((typeof esCmp==='function')?esCmp().hcp:0)
          : (typeof playerHcpFor==='function') ? playerHcpFor(lie==='green'?'green':lie==='tee'?'tee':'off', d) : 0;
  return srForPlayer(lie, d, h);
}
function prProfileSide(){
  const bench=(typeof esCmp==='function')?esCmp():{label:'Scratch'};
  const f2=v=>v==null?'&mdash;':v.toFixed(2);
  const cell=(lie,d)=>{ if(lie==='sand'&&d>100) return '<td>&mdash;</td>'; const y=prE(lie,d,'you'), b=prE(lie,d,'bench');
    return `<td><span class="big">${f2(y)}</span><span class="sm">${f2(b)}</span></td>`; };
  const yu=(typeof ydUnit==='function')?ydUnit():'yd', fu=(typeof ftUnit==='function')?ftUnit():'ft';
  const yd=v=>(typeof ydNum==='function')?ydNum(v):v, ft=v=>(typeof ftNum==='function')?ftNum(v):v;
  const full=`<table class="ref"><thead><tr><th>${yu}</th><th>Fairway</th><th>Rough</th><th>Sand</th><th>Recovery</th></tr></thead><tbody>
    ${PR_PROF_YD.map(d=>`<tr><td class="club"><span class="big">${yd(d)}</span></td>${cell('fairway',d)}${cell('rough',d)}${cell('sand',d)}${cell('recovery',d)}</tr>`).join('')}</tbody></table>`;
  const putts=`<table class="ref"><thead><tr><th>${fu}</th><th>Putts</th></tr></thead><tbody>
    ${PR_PROF_FT.map(d=>`<tr><td class="club"><span class="big">${ft(d)}</span></td>${cell('green',d)}</tr>`).join('')}</tbody></table>`;
  const tee=`<table class="ref"><thead><tr><th>Hole</th><th>Expected</th><th>vs par</th></tr></thead><tbody>
    ${[3,4,5].map(par=>PR_PROF_TEE[par].map(d=>{ const y=prE('tee',d,'you'), b=prE('tee',d,'bench');
      return `<tr><td class="club"><span class="big">${yd(d)}</span><span class="sm">par ${par}</span></td><td><span class="big">${f2(y)}</span><span class="sm">${f2(b)}</span></td><td><span class="big">${y==null?'&mdash;':(y-par>=0?'+':'')+(y-par).toFixed(2)}</span></td></tr>`; }).join('')).join('')}</tbody></table>`;
  /* the trade-offs, each a difference of two numbers in the tables beside it */
  const d=(a,b)=>{ if(a==null||b==null) return '&mdash;'; const v=a-b; return (v>=0?'+':'&minus;')+Math.abs(v).toFixed(2); };
  const T=[
    [`Rough instead of fairway, ${yd(150)} ${yu}`, d(prE('rough',150,'you'), prE('fairway',150,'you'))],
    [`Rough instead of fairway, ${yd(100)} ${yu}`, d(prE('rough',100,'you'), prE('fairway',100,'you'))],
    [`${yd(10)} ${yu} further back in the fairway, from ${yd(150)}`, d(prE('fairway',160,'you'), prE('fairway',150,'you'))],
    [`Trees instead of rough, ${yd(150)} ${yu}`, d(prE('recovery',150,'you'), prE('rough',150,'you'))],
    [`Bunker instead of rough, ${yd(20)} ${yu}`, d(prE('sand',20,'you'), prE('rough',20,'you'))],
    [`Six feet instead of three, to finish`, d(prE('green',6,'you'), prE('green',3,'you'))],
    [`Thirty feet instead of fifteen`, d(prE('green',30,'you'), prE('green',15,'you'))]
  ];
  const trade=`<table class="ref tr"><tbody>${T.map(([l,v])=>`<tr><td class="club" style="text-align:left">${l}</td><td><span class="big">${v}</span></td></tr>`).join('')}</tbody></table>`;
  return `<section class="card prof">
    <div class="head">${PR_ARC}${prMark}<div class="sub">Scoring Profile &middot; expected strokes to hole out</div>
      <div class="cond-note">You (big) over ${bench.label||'the benchmark'} (small) &middot; prepared before the round &middot; distances only, nothing adjusted for elevation, slope or wind</div></div>
    <div class="cols">
      <div class="col" style="flex:1.6"><div class="mtitle">From off the green</div>${full}</div>
      <div class="col" style="flex:.8"><div class="mtitle">Putting</div>${putts}</div>
      <div class="col" style="flex:1.1"><div class="mtitle">A hole that long</div>${tee}
        <div class="mtitle" style="margin-top:12px">What it costs you</div>${trade}</div>
    </div>
    <div class="foot">${prMark}<span>Player&rsquo;s App &middot; ${new Date().toLocaleDateString()}</span></div>
  </section>`;
}
function prPlanSide(course){
  if(!course || typeof pmPlans!=='function') return '';
  const pl=pmPlans()[course.id||course.name]; if(!pl) return '';
  const rows=Object.values(pl.holes).sort((a,b)=>a.num-b.num);
  const yd=v=>(typeof ydNum==='function')?ydNum(v):Math.round(v);
  const exp=r=>(typeof pmPlanExp==='function')?pmPlanExp(r):null;
  let tot=0, par=0;
  const body=rows.map(r=>{
    const shots=r.method==='model'?((r.pick==='mine'&&r.mine&&r.mine.length)?r.mine:r.opt)||[]:[];
    const e=exp(r); if(e!=null){ tot+=e; par+=r.par; }
    const chain=shots.map(s=>`<b>${(typeof pmPlanClubTxt==='function'?pmPlanClubTxt(s):s.club)}</b> ${yd(s.yd)}`).join(' &rarr; ');
    const aim=shots.map(s=>s.aimTxt).filter(Boolean).join('; ');
    return `<tr><td class="club"><span class="big">${r.num}</span></td><td>${r.par}</td><td>${r.yards?yd(r.yards):'&mdash;'}</td>
      <td style="text-align:left">${chain||'<i>no map</i>'}</td><td style="text-align:left;font-size:8px">${aim}</td>
      <td><span class="big">${e!=null?e.toFixed(2):'&mdash;'}</span></td><td style="text-align:left;font-size:8px">${((pl.notes||{})[r.num]||'').replace(/</g,'&lt;')}</td></tr>`;
  }).join('');
  return `<section class="card" style="page-break-before:always">
    <div class="head">${PR_ARC}${prMark}<div class="sub">Round Plan &middot; ${(course.name||'').replace(/</g,'&lt;')}</div>
      <div class="cond-note">Expected <b>${tot.toFixed(1)}</b> (${tot-par>=0?'+':''}${(tot-par).toFixed(1)} vs par ${par}) &middot; made ${new Date(pl.madeAt).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}${pl.sheet?` &middot; pins: ${String(pl.sheet).replace(/</g,'&lt;')}`:''}</div></div>
    <table class="ref plan"><thead><tr><th>Hole</th><th>Par</th><th>${(typeof ydUnit==='function')?ydUnit():'yd'}</th><th>Plan</th><th>Aim</th><th>Exp.</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table>
    <div class="foot">${prMark}<span>Prepared before the round &middot; Player&rsquo;s App &middot; ${new Date().toLocaleDateString()}</span></div>
  </section>`;
}
/* course: the one being planned, if the call comes from the plan screen; otherwise the course
   selected on the Strategy tab */
function printScoringProfile(fromPlan){
  const course = fromPlan && typeof pmSetupCourse==='function' ? pmSetupCourse()
               : (typeof stratCurrent==='function' && stratCurrent()) ? stratCurrent().course : null;
  const w=window.open('','_blank');
  if(!w){ if(typeof toast==='function') toast('Allow pop-ups to print the profile'); return; }
  w.document.open(); w.document.write(printCardHTML([prProfileSide(), prPlanSide(course)])); w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 350);
}
Object.assign(window, { printScoringProfile, prProfileSide, prPlanSide, prE });
