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
    rows.forEach(sw=>{
      const val=pr[sw.key]; const conf=pr.conf[sw.ci];
      if(val==null){ html+=`<td><div class="carry-cell empty">—</div></td>`; }
      else{ const dv=val+(window.approachGreenFirmness||0); html+=`<td><div class="carry-cell">${dv}<span style="font-size:.52rem;font-weight:400;color:var(--muted);margin-left:2px">yds</span></div></td>`; }
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
  return PARTIAL_CLUBS.map(id=>{
    const c=STATE.clubs.find(x=>x.id===id); const p=perf(id); const pr=STATE.partials[id];
    const fl=p.launch||25, fs=p.spin||8000, fh=p.ht||75;
    return {id,label:c.label,loft:c.loft,
      carries:{full:pr.full,tq:pr.tq,half:pr.half},
      launch:{full:fl,tq:Math.max(8,fl-2),half:Math.max(6,fl-4)},
      spin:{full:fs,tq:Math.round(fs*0.88),half:Math.round(fs*0.76)},
      height:{full:fh,tq:Math.round(fh*0.85),half:Math.round(fh*0.70)}};
  });
}
function effortColor(p){ return p<=80?'#00853F':p<=90?'#1a5aaa':'#d96070'; }
function interpFlight(club,key,target){
  const i=SWINGS.findIndex(s=>s.key===key), lo=SWINGS[i-1], hi=SWINGS[i+1], a=club.carries[key];
  if(target>a&&hi){const u=club.carries[hi.key],t=Math.min(1,(target-a)/(u-a));return{launch:Math.round(club.launch[key]+t*(club.launch[hi.key]-club.launch[key])),spin:Math.round(club.spin[key]+t*(club.spin[hi.key]-club.spin[key])),height:Math.round(club.height[key]+t*(club.height[hi.key]-club.height[key]))};}
  if(target<a&&lo){const l=club.carries[lo.key],t=Math.min(1,(a-target)/(a-l));return{launch:Math.round(club.launch[key]-t*(club.launch[key]-club.launch[lo.key])),spin:Math.round(club.spin[key]-t*(club.spin[key]-club.spin[lo.key])),height:Math.round(club.height[key]-t*(club.height[key]-club.height[lo.key]))};}
  return{launch:club.launch[key],spin:club.spin[key],height:club.height[key]};
}
function calcSuggestions(target){
  const clubs=wedgeModel(); const out=[];
  clubs.forEach(club=>SWINGS.forEach(sw=>{
    const a=club.carries[sw.key]; if(a==null)return;
    const i=SWINGS.indexOf(sw),lo=SWINGS[i-1],hi=SWINGS[i+1];
    const loC=lo?club.carries[lo.key]:a*0.85, hiC=hi?club.carries[hi.key]:a;
    const wLow=lo?(a+loC)/2:a-10, wHigh=hi?(a+hiC)/2:a*1.04;
    if(target<wLow-2||target>wHigh)return;
    let eff;
    if(target<=a){const r=a-(lo?club.carries[lo.key]:a-15),pos=target-(lo?club.carries[lo.key]:a-15),le=lo?lo.effort:sw.effort-12;eff=le+(sw.effort-le)*(pos/r);}
    else{const r=(hi?club.carries[hi.key]:a+5)-a,pos=target-a,ue=hi?hi.effort:sw.effort+5;eff=sw.effort+(ue-sw.effort)*(pos/r);}
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
  return final.slice(0,4);
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
/* Green firmness offset (yards added to rollout): Very Soft=-2  Soft=-1  Average=0  Firm=+2  Very Firm=+4 */
window.approachGreenFirmness = 0;
function selectApproachResult(i){
  window.approachSelectedIdx=i;
  renderCalc(parseInt(document.getElementById('yard-slider').value));
}

function renderCalc(target){
  document.getElementById('calc-display').textContent=target;
  const box=document.getElementById('calc-results');
  if(target<37||target>170){box.innerHTML=`<div class="calc-no-result">Outside partial-swing range (37–170 yd). Use the Bag ladder for longer distances.</div>`;return;}
  const sug=calcSuggestions(target);
  if(!sug.length){box.innerHTML=`<div class="calc-no-result">No clean match for ${target} yd.</div>`;return;}
  const selIdx=window.approachSelectedIdx>=0&&window.approachSelectedIdx<sug.length?window.approachSelectedIdx:0;
  box.innerHTML=sug.map((o,i)=>{
    const selected=i===selIdx, color=effortColor(o.effort);
    const swingDesc=o.sw.key==='full'?'Full swing':o.sw.key==='tq'?'¾ swing':'½ swing';
    const effDesc=o.effort>=98?'Full effort — no margin':o.effort>=90?'Near-full — controlled finish':o.effort>=82?'Measured swing — good option':'Easy swing — high control';
    const fl=interpFlight(o.club,o.sw.key,target);
    const checkDesc=(()=>{const hs=fl.spin>=8500,ms=fl.spin>=6500,hh=fl.height>=70,mh=fl.height>=50;if(hs&&hh)return'Stops quickly';if(hs&&mh)return'Checks up';if(hs)return'Bites on landing';if(ms&&hh)return'Some check';if(ms&&mh)return'Moderate release';if(ms)return'Low release';if(hh)return'Soft landing';return'Runs out';})();
    /* Carry/rollout: spin/height check behaviour + green firmness condition */
    const estRoll=Math.max(0,approachRolloutYds(fl.spin,fl.height)+(window.approachGreenFirmness||0));
    const estCarry=target-estRoll;
    /* Anchor mini-stat */
    const clockPos=o.sw.key==='full'?'11:00':o.sw.key==='tq'?'10:00':'9:00';
    const diffStr=o.delta===0?'on anchor':`${o.delta>0?'+':''}${o.delta}yds`;
    return `<div class="calc-result-card ${selected?'best':''}" onclick="selectApproachResult(${i})" style="cursor:pointer">
      <div class="calc-card-header">
        <div class="calc-club-badge">${o.club.label}<small>${o.club.loft}</small></div>
        <div style="flex:1;min-width:0">
          <div class="calc-swing-label">${swingDesc}<span style="font-family:ui-monospace,monospace;font-size:.75rem;font-weight:600;color:var(--ink);letter-spacing:.01em"> — Carry ${estCarry} · Roll ${estRoll} · Total ${target} yds</span></div>
        </div>
        ${selected?'<div class="calc-best-tag">Best Match</div>':''}
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
  /* Trajectory for selected shot */
  const trajWrap=document.getElementById('approach-traj-wrap');
  if(trajWrap && sug.length){
    const pick=sug[selIdx]||sug[0];
    const p=STATE.performance[pick.club.id]||{};
    const fl=interpFlight(pick.club,pick.sw.key,target);
    const swingLabel=pick.sw.key==='full'?'Full':pick.sw.key==='tq'?'¾':'½';
    const tRoll=Math.max(0,approachRolloutYds(fl.spin,fl.height)+(window.approachGreenFirmness||0));
    const tCarry=target-tRoll;
    const svgHtml=buildSideSVG(pick.club,{carry:tCarry,total:target,launch:fl.launch,spin:fl.spin,land:p.land||45,ht:fl.height,bspd:p.bspd||0});
    trajWrap.innerHTML=`<div class="approach-traj-wrap">
      <div class="chip-svg-label" style="font-size:.8rem;font-weight:700;color:var(--ink);letter-spacing:.01em">${pick.club.label} ${swingLabel} — carry ${tCarry} · roll ${tRoll} · total ${target} yds · ${fl.launch}° · ${(fl.spin/1000).toFixed(1)}k</div>
      ${svgHtml}
    </div>`;
  } else if(trajWrap){ trajWrap.innerHTML=''; }
}
function initCalc(){
  const s=document.getElementById('yard-slider'),inp=document.getElementById('yard-input');
  const sync=v=>{window.approachSelectedIdx=-1;const x=Math.max(37,Math.min(170,parseInt(v)||95));s.value=x;inp.value=x;renderCalc(x);renderExpectedShots('es-150',x,'fairway');const pct=((x-37)/133)*100;s.style.background=`linear-gradient(90deg,var(--ink) ${pct}%,var(--bg2) ${pct}%)`;};
  s.addEventListener('input',()=>sync(s.value));
  inp.addEventListener('input',()=>sync(inp.value));
  sync(95);
}

/* ============================================================
   SHOT SHAPER (prototype) — D-plane + StrongerGolf draw/fade study
   Reference (Study 01, 6-iron): draw HFace 2.2°R / HPath 4.7°R;
   fade HFace 2.6°L / HPath 5.4°L. Face ≈ ½ path lands the shape on target.
   Lower loft curves more (spin axis 4.5° wedge vs 15° driver) → less face/path
   needed. All numbers are population defaults — refine with own LM data.
   ============================================================ */
function shaperStockAoA(clubId,type){ return type==='wood'?(clubId==='D'?1:-1):type==='iron'?-4:-6; }
function shaperModel(clubId,shape,amount){
  const c=STATE.clubs.find(x=>x.id===clubId);
  const loft=c?parseFloat(c.loft)||31:31, type=c?c.type:'iron', label=c?c.label:'7';
  const carry=(perf(clubId)||{}).carry||160;
  const aoa=shaperStockAoA(clubId,type);
  if(shape==='straight') return {face:0,path:0,start:0,curve:0,spinAxis:0,spinLoft:+(loft-aoa).toFixed(1),loft,type,label,carry};
  /* Reference face/path that finish on target (Study 01: 6i draw 2.2R/4.7R), loft-scaled.
     Exact spin axis / 3D spin loft / start / curve come from the shared D-plane engine. */
  const refFace=shape==='draw'?2.2:2.6, refPath=shape==='draw'?4.7:5.4;
  const amt=amount==='slight'?0.6:amount==='strong'?1.4:1.0;
  const lf=Math.sqrt(loft/31);                 // lower loft ⇒ less face/path for same curve
  const dir=shape==='draw'?1:-1;               // draw: face/path RIGHT(+) of target
  const face=+(refFace*amt*lf*dir).toFixed(1);
  const path=+(refPath*amt*lf*dir).toFixed(1);
  const r=dpSolve(face,path,loft,aoa,carry);   // exact engine
  return {face,path,
    start:+r.hLaunch.toFixed(1),
    curve:Math.round(Math.abs(r.curveYds)),
    spinAxis:+r.spinAxis.toFixed(1),
    spinLoft:+r.spinLoft.toFixed(1),
    loft,type,label,carry};
}
function buildShaperSVG(start,shape){
  const W=220,H=240,cx=W/2,by=H-22,ty=26;
  const startRad=(start||0)*Math.PI/180,tl=42;
  const tx=cx+Math.sin(startRad)*tl, tyk=by-Math.cos(startRad)*tl;
  const sign=shape==='draw'?1:shape==='fade'?-1:0;
  const bulge=sign*Math.min(64,Math.abs(start)*9+22);
  const pathD=sign===0?`M ${cx},${by} L ${cx},${ty}`:`M ${cx},${by} Q ${(cx+bulge).toFixed(1)},${((by+ty)/2).toFixed(1)} ${cx},${ty}`;
  const col=shape==='draw'?'var(--green)':shape==='fade'?'var(--c-wood)':'var(--ink2)';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:220px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
    <line x1="${cx}" y1="${by}" x2="${cx}" y2="${ty}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="4,4"/>
    <text x="${cx}" y="${ty-8}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" fill="var(--muted)">TARGET</text>
    <polygon points="${cx},${ty-2} ${cx+10},${ty+3} ${cx},${ty+8}" fill="var(--gold2)"/>
    <path d="${pathD}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>
    <line x1="${cx}" y1="${by}" x2="${tx.toFixed(1)}" y2="${tyk.toFixed(1)}" stroke="var(--sky)" stroke-width="1.3" stroke-dasharray="3,2" opacity="0.7"/>
    <text x="${tx.toFixed(1)}" y="${(tyk-3).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6" fill="var(--sky)">start</text>
    <circle cx="${cx}" cy="${by}" r="4" fill="var(--ink)"/>
    <text x="${cx}" y="${H-5}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">overhead · L ◀ ▶ R</text>
  </svg>`;
}
function renderShotShaper(){
  const out=document.getElementById('shaper-out'); if(!out) return;
  const clubId=document.getElementById('shaper-club')?.value||'7i';
  const shape=document.getElementById('shaper-shape')?.value||'draw';
  const amount=document.getElementById('shaper-amount')?.value||'standard';
  const m=shaperModel(clubId,shape,amount);
  const fmt=v=>Math.abs(v)<0.05?'0.0° square':`${Math.abs(v).toFixed(1)}° ${v>0?'R':'L'}`;
  if(shape==='straight'){
    out.innerHTML=`<div class="shaper-grid"><div class="shaper-readout">
      <div class="shaper-line"><span>3D Face</span><b>0.0° square</b></div>
      <div class="shaper-line"><span>3D Path</span><b>0.0° square</b></div>
      <div class="shaper-line"><span>Start line</span><b>On target</b></div>
      <div class="shaper-note">Square face, square path — the D-plane is vertical and the ball flies straight.</div>
    </div><div>${buildShaperSVG(0,'straight')}</div></div>`;
    return;
  }
  const side=shape==='draw'?'left':'right';
  const launchNote=m.type==='wood'
    ? 'With the driver, draws launch a touch <b>higher</b> than fades.'
    : 'With irons, draws launch a touch <b>lower</b> than fades.';
  out.innerHTML=`<div class="shaper-grid">
    <div class="shaper-readout">
      <div class="shaper-line"><span>3D Face (HFace)</span><b>${fmt(m.face)}</b></div>
      <div class="shaper-line"><span>3D Path (HPath)</span><b>${fmt(m.path)}</b></div>
      <div class="shaper-line"><span>Start line</span><b>${fmt(m.start)} of target</b></div>
      <div class="shaper-line"><span>Spin axis / 3D loft</span><b>${Math.abs(m.spinAxis).toFixed(1)}° ${m.spinAxis<0?'L':'R'} · ${m.spinLoft.toFixed(0)}°</b></div>
      <div class="shaper-line"><span>Curve</span><b>~${Math.abs(m.curve)} yds ${side}</b></div>
      <div class="shaper-note">Ball starts ${fmt(m.start)} (≈80% toward the face), then curves ${side} back to target via a ${Math.abs(m.spinAxis).toFixed(1)}° spin-axis tilt. Spin axis = atan(HDiff/VDiff) — lower spin loft curves more. ${launchNote}</div>
    </div>
    <div>${buildShaperSVG(m.start,shape)}</div>
  </div>`;
}
function buildShotShaper(){
  const wrap=document.getElementById('shot-shaper-wrap'); if(!wrap) return;
  const opts=STATE.clubs.filter(c=>c.type!=='putter').map(c=>`<option value="${c.id}"${c.id==='7i'?' selected':''}>${c.label} — ${c.loft}</option>`).join('');
  wrap.innerHTML=`
    <div class="section-label">Shot Shaper <span class="proto-badge">prototype</span></div>
    <p class="intro-note" style="margin-bottom:10px">D-plane shot-shaping, calibrated to the StrongerGolf draw/fade study. Pick a club and a shape to see the face, path and start line that bend the ball back to target. Reference defaults — refine with your own launch-monitor data.</p>
    <div class="shaper-controls">
      <div class="shaper-ctrl"><label>Club</label><select id="shaper-club" onchange="renderShotShaper()">${opts}</select></div>
      <div class="shaper-ctrl"><label>Shape</label><select id="shaper-shape" onchange="renderShotShaper()"><option value="draw">Draw</option><option value="fade">Fade</option><option value="straight">Straight</option></select></div>
      <div class="shaper-ctrl"><label>Amount</label><select id="shaper-amount" onchange="renderShotShaper()"><option value="slight">Slight</option><option value="standard" selected>Standard</option><option value="strong">Strong</option></select></div>
    </div>
    <div id="shaper-out"></div>`;
  renderShotShaper();
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { PARTIAL_CLUBS, SWINGS, buildLookupTable, buildPartialsTable, buildShaperSVG, buildShotShaper, calcSuggestions, effortColor, initCalc, interpFlight, renderCalc, renderShotShaper, selectApproachResult, shaperModel, shaperStockAoA, wedgeModel });
