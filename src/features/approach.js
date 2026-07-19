// Approach tab (formerly Inside 150): Pitch Shot Options dialler, carry matrix, lookup.

/* ============================================================
   PARTIALS / LOOKUP / CALCULATOR  (single-source)
   ============================================================ */
const PARTIAL_CLUBS=['7i','8i','9i','P','W','S','X'];
function buildPartialsTable(){
  const t=document.getElementById('partials-table');
  const rows=[{label:'11:00 — Full',key:'full',ci:0},{label:'10:00 — ¾',key:'tq',ci:1},{label:'9:00 — ½',key:'half',ci:2}];
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
    const ratio=(pf.carry>0&&pf.total>0)?pf.carry/pf.total:0.97;        // club's carry / total
    rows.forEach(sw=>{
      let total=pr[sw.key], carry;
      if(sw.key==='full'){                                             // full reads Stock Shots total/carry directly
        total = pf.total!=null?pf.total : (pf.carry!=null?pf.carry:total);
        carry = pf.carry!=null?pf.carry : (total!=null?Math.round(total*ratio):null);
      } else {                                                         // ¾/½: total stored, carry derived from the ratio
        carry = total!=null?Math.round(total*ratio):null;
      }
      if(total==null){ html+=`<td><div class="carry-cell empty">—</div></td>`; }
      else{
        const t=Math.round(total)+(window.approachGreenFirmness||0);   // firmness adds rollout to total only
        html+=`<td><div class="carry-cell">${t}<small>${carry!=null?Math.round(carry)+' carry':'—'}</small></div></td>`;
      }
    });
    html+=`</tr>`;
  });
  t.innerHTML=html+'</tbody>';
}
function buildLookupTable(){
  const t=document.getElementById('lookup-table');
  /* derive lookup from partials: collect every (dist -> club/swing) */
  const swingTag={full:'opt-full',tq:'opt-3q',half:'opt-half'};
  const swingName={full:'full',tq:'10:00',half:'9:00'};
  const map={};
  PARTIAL_CLUBS.forEach(id=>{const c=STATE.clubs.find(x=>x.id===id);['full','tq','half'].forEach(k=>{const d=STATE.partials[id][k];if(d==null)return;(map[d]=map[d]||[]).push({label:`${c.label} ${swingName[k]}`,cls:swingTag[k],order:k==='full'?0:k==='tq'?1:2});});});
  const dists=Object.keys(map).map(Number).sort((a,b)=>b-a);
  let html=`<thead><tr><th>Target Distance</th><th>Club Options</th></tr></thead><tbody>`;
  dists.forEach(d=>{const opts=map[d].sort((a,b)=>a.order-b.order);const tags=opts.map(o=>`<span class="opt-tag ${o.cls}">${o.label}</span>`).join(' ');html+=`<tr><td><span class="lookup-dist">${d} yd</span></td><td>${tags}</td></tr>`;});
  t.innerHTML=html+'</tbody>';
}

/* calculator model derived from single source */
const SWINGS=[{key:'half',short:'9:00 ½',effort:75},{key:'tq',short:'10:00 ¾',effort:87},{key:'full',short:'11:00 Full',effort:100}];
function wedgeModel(){
  const partial=PARTIAL_CLUBS.map(id=>{
    const c=STATE.clubs.find(x=>x.id===id); if(!c) return null;
    const p=perf(id); const pr=STATE.partials[id]||{};
    const fl=p.launch||25, fs=p.spin||8000, fh=p.ht||75;
    return {id,label:c.label,loft:c.loft,
      carries:{full:pr.full,tq:pr.tq,half:pr.half},
      launch:{full:fl,tq:Math.max(8,fl-2),half:Math.max(6,fl-4)},
      spin:{full:fs,tq:Math.round(fs*0.88),half:Math.round(fs*0.76)},
      height:{full:fh,tq:Math.round(fh*0.85),half:Math.round(fh*0.70)}};
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
        carries:{full, tq:null, half:null},
        launch:{full:fl,tq:fl,half:fl}, spin:{full:fs,tq:fs,half:fs}, height:{full:fh,tq:fh,half:fh}};
    })
    .filter(x=>x.carries.full!=null);
  return partial.concat(longer);
}
function effortColor(p){ return p<=80?'var(--green)':p<=90?'var(--sky)':'var(--gold)'; }
function interpFlight(club,key,target){
  const i=SWINGS.findIndex(s=>s.key===key), lo=SWINGS[i-1], hi=SWINGS[i+1], a=club.carries[key];
  if(target>a&&hi&&club.carries[hi.key]!=null){const u=club.carries[hi.key],t=Math.min(1,(target-a)/(u-a));return{launch:Math.round(club.launch[key]+t*(club.launch[hi.key]-club.launch[key])),spin:Math.round(club.spin[key]+t*(club.spin[hi.key]-club.spin[key])),height:Math.round(club.height[key]+t*(club.height[hi.key]-club.height[key]))};}
  if(target<a&&lo&&club.carries[lo.key]!=null){const l=club.carries[lo.key],t=Math.min(1,(a-target)/(a-l));return{launch:Math.round(club.launch[key]-t*(club.launch[key]-club.launch[lo.key])),spin:Math.round(club.spin[key]-t*(club.spin[key]-club.spin[lo.key])),height:Math.round(club.height[key]-t*(club.height[key]-club.height[lo.key]))};}
  return{launch:club.launch[key],spin:club.spin[key],height:club.height[key]};
}
function calcSuggestions(target){
  const clubs=wedgeModel(); const out=[];
  clubs.forEach(club=>SWINGS.forEach(sw=>{
    const a=club.carries[sw.key]; if(a==null)return;
    const i=SWINGS.indexOf(sw),lo=SWINGS[i-1],hi=SWINGS[i+1];
    /* a full-only (longer) club has null tq/half neighbours — fall back to a self-window */
    const loHas=lo&&club.carries[lo.key]!=null, hiHas=hi&&club.carries[hi.key]!=null;
    const loC=loHas?club.carries[lo.key]:a*0.85, hiC=hiHas?club.carries[hi.key]:a;
    const wLow=loHas?(a+loC)/2:a-10, wHigh=hiHas?(a+hiC)/2:a*1.04;
    if(target<wLow-2||target>wHigh)return;
    let eff;
    if(target<=a){const lc=loHas?club.carries[lo.key]:a-15;const r=a-lc,pos=target-lc,le=loHas?lo.effort:sw.effort-12;eff=le+(sw.effort-le)*(pos/r);}
    else{const hc=hiHas?club.carries[hi.key]:a+5;const r=hc-a,pos=target-a,ue=hiHas?hi.effort:sw.effort+5;eff=sw.effort+(ue-sw.effort)*(pos/r);}
    eff=Math.min(102,Math.max(70,Math.round(eff)));
    out.push({club,sw,anchor:a,effort:eff,delta:target-a,dist:Math.abs(target-a)});
  }));
  const swingRank={full:0,tq:1,half:2}; /* lower = fuller = preferred when dist is equal */
  out.sort((a,b)=>{
    if(a.dist!==b.dist) return a.dist-b.dist;              /* 1. closest anchor first */
    const sr=swingRank[a.sw.key]-swingRank[b.sw.key];
    if(sr!==0) return sr;                                   /* 2. fuller swing preferred */
    return Math.abs(a.effort-87)-Math.abs(b.effort-87);    /* 3. closest to 87% effort */
  });
  /* Deduplicate: only remove genuinely identical club+swing entries (can't happen
     in practice, but guards against any window overlap). Keying on anchor alone
     was incorrectly removing valid alternatives like P tq vs 9i half at 113yd. */
  const seen=new Set();
  const deduped=out.filter(o=>{
    const key=o.club.id+'-'+o.sw.key;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  /* Secondary dedup: for each club, only keep the single best-ranked option
     (prevents e.g. G full + G tq both appearing when they produce ~identical results) */
  const clubSeen=new Set();
  const final=deduped.filter(o=>{
    if(clubSeen.has(o.club.id)) return false;
    clubSeen.add(o.club.id); return true;
  });
  return final.slice(0,3);   /* at most the three closest options */
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
  const sug=calcSuggestions(playTarget);
  if(!sug.length){box.innerHTML=`<div class="calc-no-result">No clean match for ${target} yd.</div>`;return;}
  const selIdx=window.approachSelectedIdx>=0&&window.approachSelectedIdx<sug.length?window.approachSelectedIdx:0;
  /* Shot-type (trajectory) model — knockdown / stock / high. Distance shift is already in
     playTarget (via the adjuster); here it reshapes launch / spin / height / rollout per club. */
  const shotType=(typeof EY!=='undefined'&&EY.approach)?EY.approach.shot:'stock';
  const stm=(typeof EY_SHOT!=='undefined'&&EY_SHOT[shotType])?EY_SHOT[shotType]:{launchMult:1,spinMult:1,heightMult:1,rollMult:1};
  let flightHTML='';
  box.innerHTML=sug.map((o,i)=>{
    const selected=i===selIdx, color=effortColor(o.effort);
    const swingDesc=o.sw.key==='full'?'Full swing':o.sw.key==='tq'?'¾ swing':'½ swing';
    const effDesc=o.effort>=98?'Full effort — no margin':o.effort>=90?'Near-full — controlled finish':o.effort>=82?'Measured swing — good option':'Easy swing — high control';
    const fl0=interpFlight(o.club,o.sw.key,playTarget);
    const fl={launch:Math.round(fl0.launch*stm.launchMult),spin:Math.round(fl0.spin*stm.spinMult),height:Math.round(fl0.height*stm.heightMult)};
    const p=STATE.performance[o.club.id]||{};
    const checkDesc=(()=>{const hs=fl.spin>=8500,ms=fl.spin>=6500,hh=fl.height>=70,mh=fl.height>=50;if(hs&&hh)return'Stops quickly';if(hs&&mh)return'Checks up';if(hs)return'Bites on landing';if(ms&&hh)return'Some check';if(ms&&mh)return'Moderate release';if(ms)return'Low release';if(hh)return'Soft landing';return'Runs out';})();
    /* Roll from the stock flight × the shot-type rollout multiplier + green firmness; the
       ball lands at the measured target, so Total = target and Carry = target − roll. */
    const baseRoll=approachRolloutYds(fl0.spin,fl0.height);
    const estRoll=Math.max(0,Math.round(baseRoll*stm.rollMult)+(window.approachGreenFirmness||0));
    const estCarry=target-estRoll;
    /* Anchor mini-stat */
    const clockPos=o.sw.key==='full'?'11:00':o.sw.key==='tq'?'10:00':'9:00';
    const diffStr=o.delta===0?'on anchor':`${o.delta>0?'+':''}${o.delta}yd`;
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
        <div style="flex:1;min-width:0">
          <div class="calc-swing-label">${swingDesc}<span style="font-family:ui-monospace,monospace;font-size:.75rem;font-weight:600;color:var(--ink);letter-spacing:.01em"> — Carry ${estCarry} · Roll ${estRoll} · Total ${target} yd</span></div>
        </div>
      </div>
      <div class="calc-card-body">
        <div class="calc-effort-col">
          <div class="calc-effort-label"><span>Effort</span><span class="calc-effort-pct" style="color:${color}">${o.effort}%</span></div>
          <div class="calc-effort-track"><div class="calc-effort-fill" style="width:${o.effort}%;background:${color}"></div></div>
          <div style="font-family:ui-monospace,monospace;font-size:.56rem;color:var(--muted);margin-top:4px;font-style:italic">${effDesc}</div>
        </div>
        <div class="calc-mini-stat"><div class="calc-mini-label">Launch / Spin</div><div class="calc-mini-val">${fl.launch}° · ${(fl.spin/1000).toFixed(1)}k</div></div>
        <div class="calc-mini-stat"><div class="calc-mini-label">Height / Check</div><div class="calc-mini-val">${fl.height}ft · ${checkDesc}</div></div>
        <div class="calc-mini-stat"><div class="calc-mini-label">Anchor / Diff</div><div class="calc-mini-val">${clockPos} · ${diffStr}</div></div>
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
Object.assign(window, { PARTIAL_CLUBS, SWINGS, buildLookupTable, buildPartialsTable, calcSuggestions, effortColor, initCalc, interpFlight, renderCalc, selectApproachResult, wedgeModel });
