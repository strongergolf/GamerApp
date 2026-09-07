// Approach tab (formerly Inside 150): Pitch Shot Options dialler, carry matrix, lookup.

/* ============================================================
   PARTIALS / LOOKUP / CALCULATOR  (single-source)
   ============================================================ */
const PARTIAL_CLUBS=['7i','8i','9i','P','W','S','X'];
/* Approach distance is held in YARDS whatever is displayed — renderCalc and the whole
   club/swing engine read yards. Only the readouts convert. */
function apSetDist(v){
  const yd=Math.max(37, Math.min(200, Math.round(parseFloat(v)||95)));
  const sl=document.getElementById('yard-slider'); if(sl) sl.value=yd;
  const disp=document.getElementById('calc-display'); if(disp) disp.textContent=ydNum(yd);
  const inp=document.getElementById('yard-input');
  if(inp && inp!==document.activeElement){ inp.value=ydNum(yd); inp.min=ydNum(37); inp.max=ydNum(200); }
  renderCalc(yd); renderExpectedShots('es-150', yd, approachLie());
}
/* Unit labels around that control live in static HTML, so they are synced here. */
function apSyncUnitLabels(){
  const set=(id,txt)=>{ const e=document.getElementById(id); if(e) e.textContent=txt; };
  set('ap-total-lbl','total '+ydUnit());
  set('ap-lim-lo', fmtYd(37)); set('ap-lim-hi', fmtYd(200));
  set('ap-manual-lbl', isMetric('distance')?'Metres':'Yards');
  const inp=document.getElementById('yard-input');
  if(inp){ inp.min=ydNum(37); inp.max=ydNum(200); if(inp!==document.activeElement) inp.value=ydNum(parseInt(document.getElementById('yard-slider')?.value)||95); }
  const disp=document.getElementById('calc-display');
  if(disp) disp.textContent=ydNum(parseInt(document.getElementById('yard-slider')?.value)||95);
}
function buildPartialsTable(){
  const t=document.getElementById('partials-table');
  const rows=[{label:'11:00 — Full',key:'full',ci:0},{label:'10:00 — ¾',key:'tq',ci:1},{label:'9:00 — ½',key:'half',ci:2},{label:'8:00 — ⅓',key:'third',ci:3}];
  /* Clubs as rows, swing types as columns */
  let html=`<thead><tr><th style="text-align:left;padding-left:12px;min-width:70px">Club</th>${rows.map(sw=>`<th>${sw.label}</th>`).join('')}</tr></thead><tbody>`;
  PARTIAL_CLUBS.forEach(id=>{
    const c=STATE.clubs.find(x=>x.id===id);
    const pr=STATE.partials[id];
    html+=`<tr><td style="padding-left:12px;white-space:nowrap">
      <span style="font-family:Arial,sans-serif;font-weight:800;font-size:1.05rem;letter-spacing:.02em;color:var(--ink);display:block;line-height:1.1">${c.label}</span>
      <span style="font-family:ui-monospace,monospace;font-size:.64rem;font-weight:700;color:var(--ink2);display:block;margin-top:1px">${c.loft}</span>
    </td>`;
    const pf=STATE.performance[id]||{};
    /* The FULL total is the partials ladder's own number. It used to come from
       performance.total, which disagreed with the ladder the shot-options engine reads —
       G showed 108 here and played as 112 — and fell back to performance.CARRY when total
       was blank, so S and X rendered a full wedge with zero roll (95/95, 72/72).
       Worse, W has carry 110 stored against total 108: a carry longer than its own total.
       That produced a ratio above 1, which then rendered carry > total on EVERY rung of
       that row (108/110 full, 97/99 three-quarter). The ratio is now taken from the pair
       actually shown and clamped at 1, so bad stored data can no longer print a shot that
       rolls backwards. */
    const fullTotal = pr.full!=null ? pr.full : (pf.total!=null?pf.total:pf.carry);
    const fullCarry = pf.carry!=null ? pf.carry : (fullTotal!=null?Math.round(fullTotal*0.97):null);
    /* Carry is NOT clamped to total, and the ratio is NOT clamped to 1. A high-spin wedge
       checks back past its pitch mark, so carry above total is real — the X is 76 / 73. Both
       clamps were added when W read 110 / 108 and that looked impossible; it is not.
       KNOWN LIMITATION: one ratio is applied to every rung, so a club that spins back on a
       full swing is modelled as spinning back on its 8:00 too, which it would not — a shorter
       swing carries less spin and releases. Refining that needs per-rung rollout data. */
    const ratio=(fullCarry>0&&fullTotal>0)?(fullCarry/fullTotal):0.97;  // club's carry / total
    rows.forEach(sw=>{
      let total=pr[sw.key], carry;
      if(sw.key==='full'){
        total = fullTotal;
        carry = fullCarry;
      } else {                                                         // ¾/½/⅓: total stored, carry derived from the ratio
        carry = total!=null?Math.round(total*ratio):null;
      }
      if(total==null){ html+=`<td><div class="carry-cell empty">—</div></td>`; }
      else{
        /* Env adjustment: carry scales with air density, roll-out unchanged; green
           firmness then adds its rollout on top. Matches the Stock Shots ladder. */
        const aCarry=(window.adjustOn&&carry!=null)?adjCarry(carry):carry;
        const aTotal=(window.adjustOn&&carry!=null)?adjTotal(carry,total):Math.round(total);
        const t=aTotal+(window.approachGreenFirmness||0);
        html+=`<td><div class="carry-cell">${t}<small>${aCarry!=null?Math.round(aCarry)+' carry':'—'}</small></div></td>`;
      }
    });
    html+=`</tr>`;
  });
  t.innerHTML=html+'</tbody>';
}
function buildLookupTable(){
  const t=document.getElementById('lookup-table');
  /* derive lookup from partials: collect every (dist -> club/swing) */
  const swingTag={full:'opt-full',tq:'opt-3q',half:'opt-half',third:'opt-third'};
  const swingName={full:'full',tq:'10:00',half:'9:00',third:'8:00'};
  const swingOrder={full:0,tq:1,half:2,third:3};
  const map={};
  PARTIAL_CLUBS.forEach(id=>{const c=STATE.clubs.find(x=>x.id===id);['full','tq','half','third'].forEach(k=>{const d=STATE.partials[id][k];if(d==null)return;(map[d]=map[d]||[]).push({label:`${c.label} ${swingName[k]}`,cls:swingTag[k],order:swingOrder[k]});});});
  const dists=Object.keys(map).map(Number).sort((a,b)=>b-a);
  let html=`<thead><tr><th>Target Distance</th><th>Club Options</th></tr></thead><tbody>`;
  dists.forEach(d=>{const opts=map[d].sort((a,b)=>a.order-b.order);const tags=opts.map(o=>`<span class="opt-tag ${o.cls}">${o.label}</span>`).join(' ');html+=`<tr><td><span class="lookup-dist">${d} yd</span></td><td>${tags}</td></tr>`;});
  t.innerHTML=html+'</tbody>';
}

/* calculator model derived from single source */
/* Ordered SHORTEST → FULLEST: interpFlight and calcSuggestions read SWINGS[i-1] as the
   shorter neighbour and SWINGS[i+1] as the fuller one, so 8:00 has to lead. Effort keeps
   the ladder's ~12-13 point step (62 · 75 · 87 · 100). */
const SWINGS=[{key:'third',short:'8:00 ⅓',effort:62},{key:'half',short:'9:00 ½',effort:75},{key:'tq',short:'10:00 ¾',effort:87},{key:'full',short:'11:00 Full',effort:100}];
function wedgeModel(){
  const partial=PARTIAL_CLUBS.map(id=>{
    const c=STATE.clubs.find(x=>x.id===id); if(!c) return null;
    const p=perf(id); const pr=STATE.partials[id]||{};
    const fl=p.launch||25, fs=p.spin||8000, fh=p.ht||75;
    /* 8:00 flight numbers continue the rung-to-rung steps the ¾/½ model already uses
       (−2° launch, ×0.88 spin, ×0.85 height per rung down). Presumed, like its carry. */
    return {id,label:c.label,loft:c.loft,
      carries:{full:pr.full,tq:pr.tq,half:pr.half,third:pr.third},
      launch:{full:fl,tq:Math.max(8,fl-2),half:Math.max(6,fl-4),third:Math.max(5,fl-6)},
      spin:{full:fs,tq:Math.round(fs*0.88),half:Math.round(fs*0.76),third:Math.round(fs*0.64)},
      height:{full:fh,tq:Math.round(fh*0.85),half:Math.round(fh*0.70),third:Math.round(fh*0.55)}};
  }).filter(Boolean);
  /* Extend through fairway wood: every non-putter, non-driver club not already a partial
     club is added as a FULL-swing option, so a big plays-like number still maps to a club.
     (Driver is excluded — "through fairway wood".) */
  const partialIds=new Set(PARTIAL_CLUBS);
  const longer=STATE.clubs
    .filter(c=>c.type!=='putter'&&c.id!=='D'&&!partialIds.has(c.id))
    .map(c=>{
      const p=perf(c.id); const full=p.total||p.carry||null;
      const fl=p.launch||18, fs=p.spin||5500, fh=p.ht||90;
      return {id:c.id,label:c.label,loft:c.loft,
        carries:{full, tq:null, half:null, third:null},
        launch:{full:fl,tq:fl,half:fl,third:fl}, spin:{full:fs,tq:fs,half:fs,third:fs}, height:{full:fh,tq:fh,half:fh,third:fh}};
    })
    .filter(x=>x.carries.full!=null);
  return partial.concat(longer);
}
function interpFlight(club,key,target){
  const i=SWINGS.findIndex(s=>s.key===key), lo=SWINGS[i-1], hi=SWINGS[i+1], a=club.carries[key];
  if(target>a&&hi&&club.carries[hi.key]!=null){const u=club.carries[hi.key],t=Math.min(1,(target-a)/(u-a));return{launch:Math.round(club.launch[key]+t*(club.launch[hi.key]-club.launch[key])),spin:Math.round(club.spin[key]+t*(club.spin[hi.key]-club.spin[key])),height:Math.round(club.height[key]+t*(club.height[hi.key]-club.height[key]))};}
  if(target<a&&lo&&club.carries[lo.key]!=null){const l=club.carries[lo.key],t=Math.min(1,(a-target)/(a-l));return{launch:Math.round(club.launch[key]-t*(club.launch[key]-club.launch[lo.key])),spin:Math.round(club.spin[key]-t*(club.spin[key]-club.spin[lo.key])),height:Math.round(club.height[key]-t*(club.height[key]-club.height[lo.key]))};}
  return{launch:club.launch[key],spin:club.spin[key],height:club.height[key]};
}
/* A club's usable window: 3 yards under its SHORTEST rung (the 8:00 for a club with the
   partial ladder filled in; the full swing for a full-only long club) up to 3 yards over
   its full maximum. Inside that, the club can physically be asked to produce the number —
   3 yards either end being the slack a golfer genuinely has without changing the swing.
   This replaced a per-rung half-window, which hid clubs that were plainly playable: it only
   ever offered the rung nearest the target, so a shot two rungs down the same club vanished
   even though the club covered it comfortably. */
const CLUB_RANGE_SLACK_YD = 3;
/* A full-only club has no partial ladder to measure down from, so it cannot reach far below
   its own number — but it must still reach down to where the next shorter club stops, or the
   bag develops yardages nothing covers. MEASURED before this guard existed: 174-179 and
   187-193 returned no options at all, because a 7i topped out at 173 and a 6i started at 180.
   Capped so a fairway wood does not claim a 25-yard band it cannot actually hit. */
const FULL_ONLY_MAX_REACH_YD = 15;
function clubRanges(clubs){
  const withFull=clubs.filter(c=>c.carries.full!=null).slice().sort((a,b)=>a.carries.full-b.carries.full);
  const map=new Map();
  withFull.forEach((club,idx)=>{
    const full=club.carries.full;
    /* SWINGS is ordered shortest → fullest, so the first non-null is the shortest rung */
    const shortest=SWINGS.map(s=>club.carries[s.key]).find(v=>v!=null);
    const hasLadder = shortest!=null && shortest!==full;
    let lo;
    if(hasLadder) lo = shortest-CLUB_RANGE_SLACK_YD;
    else {
      const prev=withFull[idx-1];
      const meetPrev = prev ? prev.carries.full+CLUB_RANGE_SLACK_YD : full-CLUB_RANGE_SLACK_YD;
      lo = Math.min(meetPrev, full-CLUB_RANGE_SLACK_YD);
      lo = Math.max(lo, full-FULL_ONLY_MAX_REACH_YD);
    }
    map.set(club.id,{lo,hi:full+CLUB_RANGE_SLACK_YD,full,shortest,hasLadder});
  });
  return map;
}
/* Single-club convenience (kept for callers and for checking one club in isolation). */
function clubUsableRange(club){
  return clubRanges([club]).get(club.id)||null;
}
function calcSuggestions(target){
  const clubs=wedgeModel(); const out=[];
  const ranges=clubRanges(clubs);
  clubs.forEach(club=>{
    const r=ranges.get(club.id);
    if(!r || target<r.lo || target>r.hi) return;
    /* Which rung to play it from: the nearest anchor, because the anchor is the swing the
       golfer has actually practised and the card's headline is how far off it this is. */
    let best=null;
    SWINGS.forEach(sw=>{
      const a=club.carries[sw.key]; if(a==null) return;
      const d=Math.abs(target-a);
      if(!best||d<best.dist) best={sw,anchor:a,dist:d};
    });
    if(!best) return;
    /* Percent of this club's FULL distance the shot asks for — a real ratio, not an
       interpolation between invented effort anchors. 95 yd with a 126 yd P is 75%. */
    const pctFull=Math.round((target/r.full)*100);
    out.push({club,sw:best.sw,anchor:best.anchor,pctFull,
              delta:target-best.anchor,dist:best.dist,
              loft:parseFloat(club.loft)||0});
  });
  /* RANKED first — the recommendation is still "closest to a practised anchor, fuller swing
     preferred" — so renderCalc can mark the best one before re-sorting for display. */
  const swingRank={full:0,tq:1,half:2,third:3}; /* lower = fuller = preferred when dist is equal */
  out.sort((a,b)=>{
    if(a.dist!==b.dist) return a.dist-b.dist;              /* 1. closest anchor first */
    const sr=swingRank[a.sw.key]-swingRank[b.sw.key];
    if(sr!==0) return sr;                                   /* 2. fuller swing preferred */
    return b.loft-a.loft;                                   /* 3. more loft = more margin */
  });
  return out;
}
/* Rollout in yards derived from ball-flight characteristics — makes each shot's carry/roll split
   match its actual behaviour (Stops quickly vs Moderate release vs Runs out). */
function approachRolloutYds(spin,height){
  if(spin>=8500&&height>=70) return 1;  // Stops quickly
  if(spin>=8500) return 2;              // Checks up / Bites
  if(spin>=6500&&height>=70) return 2;  // Some check
  if(spin>=6500&&height>=50) return 4;  // Moderate release
  if(spin>=6500) return 5;             // Low release
  if(height>=70) return 4;             // Soft landing
  return 7;                            // Runs out
}
window.approachSelectedIdx = -1;
/* Per-view aim offsets (px, viewBox units) for the draggable overhead-dispersion views, keyed by
   uid ('appr' here, 'stock' on the Stock Shots tab); reset when the shot changes. */
window.aimOffsets = window.aimOffsets || {};
/* Green firmness offset (yards added to rollout): Very Soft=-2  Soft=-1  Average=0  Firm=+2  Very Firm=+4 */
window.approachGreenFirmness = 0;
function selectApproachResult(i){
  window.approachSelectedIdx=i;
  window.aimOffsets.appr={dx:0,dy:0};   // re-centre the aim oval for the newly selected shot
  renderCalc(parseInt(document.getElementById('yard-slider').value));
}

function renderCalc(target){
  document.getElementById('calc-display').textContent=target;
  /* Plays-like adjusters shift the distance the suggestions solve for; the big number
     stays the measured yardage, the adjuster panel shows the plays-like result. */
  const eyAdj = typeof eyTotal==='function' ? Math.round(eyTotal('approach',target)) : 0;
  /* plays-like can now extend well beyond the measured-input ceiling (up to fairway-wood
     range), so the suggestion target is clamped to the bag, not the 170-yd input cap */
  const playTarget = Math.max(20, Math.min(300, target+eyAdj));
  if(typeof eyRefreshSummary==='function') eyRefreshSummary('approach');
  const box=document.getElementById('calc-results');
  if(target<37||target>200){box.innerHTML=`<div class="calc-no-result">Outside range (37–200 yd). Use the Bag ladder for longer distances.</div>`;return;}
  const ranked=calcSuggestions(playTarget);
  if(!ranked.length){box.innerHTML=`<div class="calc-no-result">No clean match for ${target} yd.</div>`;return;}
  /* Ranked order picks the RECOMMENDATION; display order is by loft, most-lofted at the top
     down to least, because that is how the bag is laid out and how a golfer scans for "the
     next club up". The recommended shot keeps the highlight wherever loft puts it. */
  const recommended=ranked[0];
  const sug=ranked.slice().sort((a,b)=>b.loft-a.loft || a.dist-b.dist);
  const recIdx=Math.max(0, sug.indexOf(recommended));
  const selIdx=window.approachSelectedIdx>=0&&window.approachSelectedIdx<sug.length?window.approachSelectedIdx:recIdx;
  /* Shot-type (trajectory) model — knockdown / stock / high. Distance shift is already in
     playTarget (via the adjuster); here it reshapes launch / spin / height / rollout per club. */
  const shotType=(typeof EY!=='undefined'&&EY.approach)?EY.approach.shot:'stock';
  const stm=(typeof EY_SHOT!=='undefined'&&EY_SHOT[shotType])?EY_SHOT[shotType]:{launchMult:1,spinMult:1,heightMult:1,rollMult:1};
  let flightHTML='';
  box.innerHTML=sug.map((o,i)=>{
    const selected=i===selIdx;
    const fl0=interpFlight(o.club,o.sw.key,playTarget);
    const fl={launch:Math.round(fl0.launch*stm.launchMult),spin:Math.round(fl0.spin*stm.spinMult),height:Math.round(fl0.height*stm.heightMult)};
    const p=STATE.performance[o.club.id]||{};
    const checkDesc=(()=>{const hs=fl.spin>=8500,ms=fl.spin>=6500,hh=fl.height>=70,mh=fl.height>=50;if(hs&&hh)return'Stops quickly';if(hs&&mh)return'Checks up';if(hs)return'Bites on landing';if(ms&&hh)return'Some check';if(ms&&mh)return'Moderate release';if(ms)return'Low release';if(hh)return'Soft landing';return'Runs out';})();
    /* Roll from the stock flight × the shot-type rollout multiplier + green firmness; the
       ball lands at the measured target, so Total = target and Carry = target − roll. */
    const baseRoll=approachRolloutYds(fl0.spin,fl0.height);
    const estRoll=Math.max(0,Math.round(baseRoll*stm.rollMult)+(window.approachGreenFirmness||0));
    const estCarry=target-estRoll;
    /* Anchor / Diff — the headline, and now it sits ON the club line rather than in a row of
       its own. The clock reading already says which swing this is, so the old "⅓ swing —"
       prefix was saying it twice; dropping it is most of the vertical saving.
       The COLOUR lives here now: how far off a practised number you are being asked to play
       is the thing worth flagging. Green = essentially your stock yardage. */
    const clockPos=o.sw.key==='full'?'11:00':o.sw.key==='tq'?'10:00':o.sw.key==='half'?'9:00':'8:00';
    const onAnchor=o.delta===0;
    const ad=Math.abs(o.delta);
    const color=ad<=2?'var(--green)':ad<=6?'var(--sky)':'var(--gold)';
    const diffStr=onAnchor?'on anchor':`${o.delta>0?'+':''}${ydNum(o.delta)} ${ydUnit()}`;
    if(selected){
      flightHTML=`<div class="flight-wrap">
        <div class="flight-row">
          <div class="flight-col-main"><div class="flight-label">Trajectory &amp; Rollout</div><div class="flight-svg-wrap">${buildSideSVG(o.club,{carry:estCarry,total:target,launch:fl.launch,spin:fl.spin,land:Math.round((p.land||45)*(stm.landMult||1)),ht:fl.height,bspd:p.bspd||0})}</div></div>
          <div class="flight-col-top"><div class="flight-label">Overhead — Dispersion</div><div class="flight-svg-wrap">${buildTopSVG(o.club,{carry:estCarry},{draggable:true,uid:'appr'})}</div></div>
        </div>
      </div>`;
    }
    return `<div class="calc-result-card ${selected?'best':''}" onclick="selectApproachResult(${i})" style="cursor:pointer">
      <div class="calc-card-header">
        <div class="calc-club-badge">${o.club.label}<small>${o.club.loft}</small></div>
        <div class="calc-head-main">Carry ${ydNum(estCarry)} <em>+</em> Roll ${ydNum(estRoll)} ${ydUnit()}</div>
        <div class="calc-head-anchor" style="color:${color}">${clockPos}<span>${diffStr}</span></div>
      </div>
      <div class="calc-card-body">
        <div class="calc-mini-stat"><div class="calc-mini-label">Launch / Spin</div><div class="calc-mini-val">${fl.launch}° · ${(fl.spin/1000).toFixed(1)}k</div></div>
        <div class="calc-mini-stat"><div class="calc-mini-label">Height / Check</div><div class="calc-mini-val">${ftNum(fl.height)}${ftUnit()} · ${checkDesc}</div></div>
        <div class="calc-mini-stat"><div class="calc-mini-label">% of Full</div><div class="calc-mini-val">${o.pctFull}%</div></div>
      </div>
    </div>`;
  }).join('');
  const flightWrapEl=document.getElementById('approach-flight-wrap');
  if(flightWrapEl) flightWrapEl.innerHTML=flightHTML;
  /* Wire up the draggable overhead-dispersion aim view on the selected card (no-op otherwise). */
  if(typeof initApproachAimDrag==='function') initApproachAimDrag();
}
function initCalc(){
  const s=document.getElementById('yard-slider'),inp=document.getElementById('yard-input');
  const sync=v=>{window.approachSelectedIdx=-1;window.aimOffsets.appr={dx:0,dy:0};const x=Math.max(37,Math.min(200,parseInt(v)||95));s.value=x;inp.value=x;renderCalc(x);renderExpectedShots('es-150',x,typeof approachLie==='function'?approachLie():'fairway');const pct=((x-37)/163)*100;s.style.background=`linear-gradient(90deg,var(--ink) ${pct}%,var(--bg2) ${pct}%)`;};
  s.addEventListener('input',()=>sync(s.value));
  inp.addEventListener('input',()=>sync(inp.value));
  sync(95);
}


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { apSetDist, apSyncUnitLabels, PARTIAL_CLUBS, SWINGS, CLUB_RANGE_SLACK_YD, buildLookupTable, buildPartialsTable, calcSuggestions, clubRanges, clubUsableRange, FULL_ONLY_MAX_REACH_YD, initCalc, interpFlight, renderCalc, selectApproachResult, wedgeModel });
