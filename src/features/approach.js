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
function effortColor(p){ return p<=80?'#00853F':p<=90?'#1a5aaa':'#d96070'; }
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
/* Green firmness offset (yards added to rollout): Very Soft=-2  Soft=-1  Average=0  Firm=+2  Very Firm=+4 */
window.approachGreenFirmness = 0;
function selectApproachResult(i){
  window.approachSelectedIdx=i;
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
      ${selected?`<div class="flight-wrap" style="padding:13px 0 2px;margin-top:10px;background:none">
        <div class="flight-row">
          <div class="flight-col-main"><div class="flight-label">Trajectory &amp; Rollout</div><div class="flight-svg-wrap">${buildSideSVG(o.club,{carry:estCarry,total:target,launch:fl.launch,spin:fl.spin,land:Math.round((p.land||45)*(stm.landMult||1)),ht:fl.height,bspd:p.bspd||0})}</div></div>
          <div class="flight-col-top"><div class="flight-label">Overhead — Dispersion</div><div class="flight-svg-wrap">${buildTopSVG(o.club,{carry:estCarry})}</div></div>
        </div>
      </div>`:''}
    </div>`;
  }).join('');
}
function initCalc(){
  const s=document.getElementById('yard-slider'),inp=document.getElementById('yard-input');
  const sync=v=>{window.approachSelectedIdx=-1;const x=Math.max(37,Math.min(200,parseInt(v)||95));s.value=x;inp.value=x;renderCalc(x);renderExpectedShots('es-150',x,typeof approachLie==='function'?approachLie():'fairway');const pct=((x-37)/163)*100;s.style.background=`linear-gradient(90deg,var(--ink) ${pct}%,var(--bg2) ${pct}%)`;};
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
/* Side-hill lie bias (RH). Ball ABOVE feet → flatter plane, toe-low → starts left and
   draws; ball BELOW feet → upright → starts right and fades. Returns the spin-axis and
   start-line nudges (deg) layered onto the chosen shape. Estimates — tune to the player. */
const SHAPER_LIE = { level:{axis:0,start:0}, above:{axis:-2.5,start:-1.2}, below:{axis:+2.5,start:+1.2} };
function shaperModel(clubId,shape,amount,lie){
  const c=STATE.clubs.find(x=>x.id===clubId);
  const loft=c?parseFloat(c.loft)||31:31, type=c?c.type:'iron', label=c?c.label:'7';
  const carry=(perf(clubId)||{}).carry||160;
  const aoa=shaperStockAoA(clubId,type);
  let res;
  if(shape==='straight'){
    res={face:0,path:0,start:0,curve:0,spinAxis:0,spinLoft:+(loft-aoa).toFixed(1),loft,type,label,carry};
  } else {
    /* Reference face/path that finish on target (Study 01: 6i draw 2.2R/4.7R), loft-scaled.
       Exact spin axis / 3D spin loft / start / curve come from the shared D-plane engine. */
    const refFace=shape==='draw'?2.2:2.6, refPath=shape==='draw'?4.7:5.4;
    const amt=amount==='slight'?0.6:amount==='strong'?1.4:1.0;
    const lf=Math.sqrt(loft/31);                 // lower loft ⇒ less face/path for same curve
    const dir=shape==='draw'?1:-1;               // draw: face/path RIGHT(+) of target
    const face=+(refFace*amt*lf*dir).toFixed(1);
    const path=+(refPath*amt*lf*dir).toFixed(1);
    const r=dpSolve(face,path,loft,aoa,carry);   // exact engine
    res={face,path,
      start:+r.hLaunch.toFixed(1),
      curve:Math.round(Math.abs(r.curveYds)),
      spinAxis:+r.spinAxis.toFixed(1),
      spinLoft:+r.spinLoft.toFixed(1),
      loft,type,label,carry};
  }
  /* layer the side-hill lie bias onto the shape, then recompute curve from the new axis */
  const lb=SHAPER_LIE[lie]||SHAPER_LIE.level;
  if(lb.axis||lb.start){
    res.spinAxis=+(res.spinAxis+lb.axis).toFixed(1);
    res.start=+(res.start+lb.start).toFixed(1);
    res.curve=Math.round(Math.abs(dpCurveYds(res.spinAxis,carry)));
    res.lie=lie;
  }
  return res;
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
/* ============================================================
   3D SHOT SHAPER — orthographic projection + two rotatable panels
   (D-plane impact geometry + 3D ball flight). World axes:
   x = lateral (+right), y = up, z = downrange toward target.
   az = yaw°, el = pitch° (look-down). Built for a later drag-to-rotate upgrade.
   ============================================================ */
function shaper3DProject(x,y,z,az,el){
  const ar=az*Math.PI/180, er=el*Math.PI/180;
  const X = x*Math.cos(ar) + z*Math.sin(ar);
  const Z = -x*Math.sin(ar) + z*Math.cos(ar);
  /* +Z (downrange, toward target) recedes up-and-away → ball sits near/foreground,
     target reads into the distance (down-the-line familiarity). */
  const Y2 = y*Math.cos(er) + Z*Math.sin(er);
  return { x:X, y:-Y2 };
}
/* Fit a scene's bounding points into the viewBox; returns a world→screen mapper. */
function shaper3DFitter(bounds,az,el,W,H,pad){
  const pr=bounds.map(p=>shaper3DProject(p.x,p.y,p.z,az,el));
  const xs=pr.map(p=>p.x), ys=pr.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const spanX=(maxX-minX)||1, spanY=(maxY-minY)||1;
  const s=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY);
  const ox=pad+((W-2*pad)-s*spanX)/2, oy=pad+((H-2*pad)-s*spanY)/2;
  return (x,y,z)=>{ const q=shaper3DProject(x,y,z,az,el); return {x:ox+(q.x-minX)*s, y:oy+(q.y-minY)*s}; };
}
function shaper3DArrow(s,e,col,w){
  const dx=e.x-s.x,dy=e.y-s.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,a=7;
  const hp=th=>({x:e.x-a*(ux*Math.cos(th)-uy*Math.sin(th)), y:e.y-a*(ux*Math.sin(th)+uy*Math.cos(th))});
  const p1=hp(0.42),p2=hp(-0.42);
  return `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${e.x.toFixed(1)}" y2="${e.y.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><polygon points="${e.x.toFixed(1)},${e.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}" fill="${col}"/>`;
}
const shaperShapeColor=m=>m.spinAxis<-0.4?'var(--green)':m.spinAxis>0.4?'var(--c-wood)':'var(--ink2)';

/* Small rotating XYZ axis triad drawn at a fixed screen anchor (ax,ay), rotating with
   the scene so the orientation is always legible. X = lateral, Y = up, Z = downrange. */
function shaperAxisTriad(az,el,ax,ay,len){
  const o=shaper3DProject(0,0,0,az,el);
  const one=(x,y,z,col,lab)=>{
    const p=shaper3DProject(x,y,z,az,el);
    const ex=ax+(p.x-o.x)*len, ey=ay+(p.y-o.y)*len;
    return shaper3DArrow({x:ax,y:ay},{x:ex,y:ey},col,1.2)
      +`<text x="${(ex+(ex-ax>=0?2.5:-2.5)).toFixed(1)}" y="${(ey+(ey-ay>=0?5:-2)).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" font-weight="700" fill="${col}">${lab}</text>`;
  };
  return `<circle cx="${ax}" cy="${ay}" r="1.6" fill="var(--muted)"/>`
    + one(1,0,0,'#d96070','X') + one(0,1,0,'var(--green)','Y') + one(0,0,1,'var(--sky)','Z');
}

/* Combined 3D scene — ONE rotating image: impact geometry (club path, circular face +
   normal, spin axis) at the ball end, plus the full ball flight using the trajectory model
   (carry arc peaking ~72%, then run/roll-out to the pin) with the lateral shape + crosswind.
   Driven by the selected approach shot (shot = {carry,roll,total,heightYd}) so it tracks
   the distance/condition sliders live. World axes x = lateral, y = up, z = downrange (yd). */
function buildShaperScene3D(m,az,el,driftYd,shot){
  const W=300,H=290,pad=26,LE=1.9;
  const rx=(p,a)=>{a*=Math.PI/180;return {x:p.x,y:p.y*Math.cos(a)-p.z*Math.sin(a),z:p.y*Math.sin(a)+p.z*Math.cos(a)};};
  const ry=(p,a)=>{a*=Math.PI/180;return {x:p.x*Math.cos(a)+p.z*Math.sin(a),y:p.y,z:-p.x*Math.sin(a)+p.z*Math.cos(a)};};
  shot=shot||{};
  const carry=Math.max(5,shot.carry||140), roll=Math.max(0,shot.roll||0), total=Math.max(carry,carry+roll);
  const heightYd=Math.max(4,shot.heightYd||carry*0.18);
  const loft=m.loft||31, face=m.face||0, hpath=(m.path||0)*1.5, spinAxis=m.spinAxis||0;
  const startSlope=Math.tan((m.start||0)*Math.PI/180);
  const windYd=(driftYd||0)*LE;                  /* crosswind drift to landing */
  /* Lateral shape: the ball launches roughly STRAIGHT along the start line for the first
     third, the curve builds through the middle third, then it settles back toward target
     while it falls — so the bend is held off early instead of bowing from the very start. */
  const sLat=startSlope*carry*LE;                /* lateral at carry if it flew dead straight */
  const cb=u=>{ const t=Math.max(0,Math.min(1,(u-0.30)/0.70)); return t*t*(3-2*t); };  /* curve-back, ~0 first third */
  const bow=u=> sLat*u*(1-cb(u)) + windYd*Math.pow(u,1.7);   /* start-line travel that curves back; wind builds late */
  /* carry arc — height peaks ~72% of the carry (long climb, steep descent / the "fall") */
  const HK=2.1, uPk=0.72, N=32, fpath=[];
  for(let i=0;i<=N;i++){const u=i/N; fpath.push({x:bow(u), y:heightYd*Math.sin(Math.PI*Math.pow(u,HK)), z:u*carry});}
  const landX=fpath[N].x;
  /* roll-out run along the ground, carry → total, drifting slightly on with the wind */
  const rollPts=[]; if(roll>0.4){ const RN=6; for(let i=1;i<=RN;i++){const t=i/RN; rollPts.push({x:landX+windYd*0.12*t,y:0,z:carry+roll*t});} }
  const stopX=rollPts.length?rollPts[rollPts.length-1].x:landX;
  const apex={x:bow(uPk),y:heightYd,z:carry*uPk};
  /* impact geometry near the ball, scaled to the shot */
  const fr=Math.max(6,total*0.045), facePts=[];
  for(let i=0;i<28;i++){const th=i/28*2*Math.PI; facePts.push(ry(rx({x:fr*Math.cos(th),y:fr*Math.sin(th),z:0},-loft),face));}
  let nrm={x:0,y:0,z:1}; nrm=ry(rx(nrm,-loft),face);
  const FLp=total*0.12, prr=hpath*Math.PI/180, pathEnd={x:Math.sin(prr)*FLp,y:0,z:Math.cos(prr)*FLp};
  const sar=-spinAxis*Math.PI/180, axL=total*0.06, axZ=total*0.1;
  const axA={x:-axL*Math.cos(sar),y:-axL*Math.sin(sar),z:axZ}, axB={x:axL*Math.cos(sar),y:axL*Math.sin(sar),z:axZ};
  const G=Math.max(total*0.16,Math.abs(sLat)*0.55,Math.abs(windYd)*1.2,fr+4);
  const bounds=[{x:-G,y:0,z:0},{x:G,y:0,z:0},{x:-G,y:0,z:total},{x:G,y:0,z:total},{x:0,y:heightYd,z:carry*uPk},{x:0,y:fr+4,z:0},{x:stopX,y:0,z:total}];
  const T=shaper3DFitter(bounds,az,el,W,H,pad);
  const P=p=>T(p.x,p.y,p.z);
  let grid='';
  for(let i=0;i<=4;i++){const gz=total*i/4;const a=T(-G,0,gz),b=T(G,0,gz);grid+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border2)" stroke-width="0.6" opacity="0.4"/>`;}
  [-G,0,G].forEach(gx=>{const a=T(gx,0,0),b=T(gx,0,total);grid+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border2)" stroke-width="0.6" opacity="0.4"/>`;});
  const t0=T(0,0,0),t1=T(0,0,total);
  const tline=`<line x1="${t0.x.toFixed(1)}" y1="${t0.y.toFixed(1)}" x2="${t1.x.toFixed(1)}" y2="${t1.y.toFixed(1)}" stroke="var(--gold2)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.7"/>`;
  const col=shaperShapeColor(m);
  const pts=fpath.map(p=>{const s=P(p);return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;}).join(' ');
  const apexS=P(apex),apexG=T(apex.x,0,apex.z),land=T(landX,0,carry),ball=T(0,0,0);
  const apexDrop=`<line x1="${apexS.x.toFixed(1)}" y1="${apexS.y.toFixed(1)}" x2="${apexG.x.toFixed(1)}" y2="${apexG.y.toFixed(1)}" stroke="${col}" stroke-width="0.8" stroke-dasharray="2,2" opacity="0.55"/>`;
  /* roll-out as a dashed ground run + green tint */
  let rollLine=''; if(rollPts.length){ const rp=[land,...rollPts.map(P)].map(s=>`${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(' '); rollLine=`<polyline points="${rp}" fill="none" stroke="var(--green2)" stroke-width="2" stroke-dasharray="3,2.5" opacity="0.85"/>`; }
  /* impact geometry — kept light: club-path line on the ground, a face RING (no heavy
     plane fill), and the tilted spin axis. Exact numbers are listed in the specs panel. */
  const pathArrow=shaper3DArrow(T(0,0,0),P(pathEnd),'var(--sky)',1.6);
  const fp=facePts.map(P);
  const faceRing=`<polygon points="${fp.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')}" fill="none" stroke="var(--c-iron)" stroke-width="1.8"/>`;
  const sA=P(axA),sB=P(axB);
  const axisLine=`<line x1="${sA.x.toFixed(1)}" y1="${sA.y.toFixed(1)}" x2="${sB.x.toFixed(1)}" y2="${sB.y.toFixed(1)}" stroke="${col}" stroke-width="2" stroke-linecap="round"/><circle cx="${sA.x.toFixed(1)}" cy="${sA.y.toFixed(1)}" r="2.3" fill="${col}"/><circle cx="${sB.x.toFixed(1)}" cy="${sB.y.toFixed(1)}" r="2.3" fill="${col}"/>`;
  const flagTop=T(0,Math.min(heightYd*0.7,total*0.12),total);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    ${grid}${tline}${apexDrop}
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>
    ${rollLine}
    <circle cx="${apexS.x.toFixed(1)}" cy="${apexS.y.toFixed(1)}" r="2.4" fill="${col}"/>
    <circle cx="${land.x.toFixed(1)}" cy="${land.y.toFixed(1)}" r="2.6" fill="var(--green2)"/>
    ${pathArrow}${faceRing}${axisLine}
    ${sgFlagstick(t1.x,t1.y,flagTop.x,flagTop.y,1)}
    ${sgBall(ball.x,ball.y,5)}
    ${shaperAxisTriad(az,el,24,H-20,15)}
    <text x="${apexS.x.toFixed(1)}" y="${(apexS.y-5).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="${col}">apex</text>
    ${roll>0.4?`<text x="${land.x.toFixed(1)}" y="${(land.y+11).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6" fill="var(--green)">land · ${Math.round(roll)}y roll</text>`:''}
  </svg>`;
}

/* Shape + amount combined into one 5-step slider: [id,label,shape,amount] */
const SHAPER_CURVES=[
  ['slice','Slice','fade','strong'],
  ['fade','Fade','fade','standard'],
  ['straight','Straight','straight','standard'],
  ['draw','Draw','draw','standard'],
  ['hook','Hook','draw','strong']
];
/* side-hill stance (was "Lie"): shape bias */
const SHAPER_LIES=[['level','Level'],['above','Ball above feet'],['below','Ball below feet']];
/* clubs available to the shaper, sorted long → short (driver/woods left, wedges right) */
function shaperClubList(){
  return STATE.clubs.filter(c=>c.type!=='putter')
    .slice().sort((a,b)=>(parseFloat(a.loft)||0)-(parseFloat(b.loft)||0))
    .map(c=>c.id);
}
const _clampIdx=(v,n)=>Math.max(0,Math.min(n-1,Math.round(parseFloat(v)||0)));
/* the club the combined image is built around = the currently selected approach shot */
function shaperClubId(){ return (window.approachShot&&window.approachShot.clubId)||'7i'; }
/* Read the current shaping controls into a shaper model for the selected approach club. */
function currentShaperModel(){
  const cv=SHAPER_CURVES[_clampIdx(document.getElementById('shaper-curve')?.value,SHAPER_CURVES.length)];
  const stance=SHAPER_LIES[_clampIdx(document.getElementById('shaper-stance')?.value,3)][0];
  return shaperModel(shaperClubId(),cv[2],cv[3],stance);
}
/* crosswind drift (yd, + = ball pushed right) — read from Situational Info (no duplicate control) */
function shaperCrossDrift(){
  const cross=(typeof EY!=='undefined'&&EY.approach)?(parseFloat(EY.approach.cross)||0):0;
  return Math.round((typeof PS_CROSS_YPM!=='undefined'?PS_CROSS_YPM:2.0)*cross);
}
/* ============================================================
   TRAJECTORY VIEW — stylized 2D multi-panel (NOT physics):
   main side-view arc + overhead dispersion + down-the-line. Club-coloured.
   ============================================================ */
const trajCol=type=>`var(--c-${type==='wood'?'wood':type==='wedge'?'wedge':type==='putter'?'putter':'iron'})`;
const trajApexFrac=type=>type==='wood'?0.30:type==='wedge'?0.20:0.25;   /* apex height / carry */
/* dispersion half-width (yd) — spec anchors: 100→7, 150→10, 200→20, 270→30 */
function trajDisp(carry){
  const A=[[0,4],[100,7],[150,10],[200,20],[270,30],[320,34]];
  const c=Math.max(0,carry||0);
  for(let i=0;i<A.length-1;i++){ if(c>=A[i][0]&&c<=A[i+1][0]){ const t=(c-A[i][0])/(A[i+1][0]-A[i][0]); return A[i][1]+t*(A[i+1][1]-A[i][1]); } }
  return A[A.length-1][1];
}
/* Side view — cubic/quad bezier, ascent ~60% / descent ~40% (steeper landing), apex by club. */
function trajSideSVG(carry,total,apexFrac,col){
  const W=300,H=160,PAD=16,gy=H-30;
  const carryPx=W-PAD-46, x0=PAD, landX=x0+carryPx;
  const apexH=Math.max(22,Math.min(gy-14,apexFrac*carryPx));
  const ax=x0+0.6*carryPx, ay=gy-apexH;
  const rollPx=total>carry?Math.min(38,(total-carry)/Math.max(1,carry)*carryPx*3.2):0;
  const stopX=Math.min(W-6,landX+rollPx);
  const arc=`M ${x0},${gy} Q ${(x0+0.30*carryPx).toFixed(1)},${(gy-apexH*0.98).toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} Q ${(ax+0.16*carryPx).toFixed(1)},${(gy-apexH*0.50).toFixed(1)} ${landX.toFixed(1)},${gy}`;
  const roll=stopX>landX+2?`<line x1="${landX.toFixed(1)}" y1="${gy}" x2="${stopX.toFixed(1)}" y2="${gy}" stroke="${col}" stroke-width="1.6" stroke-dasharray="3,2.5" opacity="0.45"/>`:'';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <line x1="${PAD-6}" y1="${gy}" x2="${W-6}" y2="${gy}" stroke="var(--border2)" stroke-width="1"/>
    <path d="${arc}" fill="none" stroke="${col}" stroke-width="2.8" stroke-linecap="round"/>
    ${roll}
    <circle cx="${x0}" cy="${gy}" r="4" fill="var(--ink)"/>
    <circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.4" fill="${col}" opacity="0.8"/>
    <circle cx="${landX.toFixed(1)}" cy="${gy}" r="3" fill="${col}"/>
    <text x="${landX.toFixed(1)}" y="${gy+14}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="8.5" font-weight="700" fill="${col}">${Math.round(carry)} carry</text>
    ${total>carry+1?`<text x="${stopX.toFixed(1)}" y="${(gy-6).toFixed(1)}" text-anchor="end" font-family="ui-monospace,monospace" font-size="7" fill="var(--muted)">${Math.round(total)} total</text>`:''}
  </svg>`;
}
/* Overhead dispersion — target line + ellipse centred on it at the landing distance. */
function trajOverheadSVG(carry,disp,col){
  const W=150,H=132,cx=W/2,yNear=H-14,yFar=16;
  const landY=yFar+(yNear-yFar)*0.18;
  const rx=Math.max(7,Math.min(W*0.34,disp*1.9));
  const ry=Math.min(landY-yFar+8,rx*1.5);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <line x1="${cx}" y1="${yNear}" x2="${cx}" y2="${yFar}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="4,4"/>
    <ellipse cx="${cx}" cy="${landY.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${yNear}" r="3.5" fill="var(--ink)"/>
    <text x="${cx}" y="${yFar-3}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7.5" font-weight="700" fill="${col}">${Math.round(carry)} yd</text>
    <text x="${cx}" y="${(landY+ry+10).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="var(--muted)">±${Math.round(disp)} L/R</text>
  </svg>`;
}
/* Down-the-line — foreshortened arc from behind + a faint lateral dispersion "window". */
function trajDtlSVG(apexFrac,disp,col){
  const W=150,H=132,cx=W/2,gy=H-16,apexY=20;
  const arc=`M ${cx},${gy} C ${cx-5},${(gy-(gy-apexY)*0.55).toFixed(1)} ${cx-4},${(apexY+9).toFixed(1)} ${cx},${apexY} C ${(cx+4)},${(apexY+9).toFixed(1)} ${(cx+6)},${(gy-(gy-apexY)*0.4).toFixed(1)} ${(cx+2)},${(gy-2).toFixed(1)}`;
  const wW=Math.max(10,Math.min(W*0.6,disp*1.7));
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <rect x="${(cx-wW/2).toFixed(1)}" y="${(apexY-4).toFixed(1)}" width="${wW.toFixed(1)}" height="${(gy-apexY+4).toFixed(1)}" fill="${col}" fill-opacity="0.08"/>
    <line x1="${cx}" y1="${gy}" x2="${cx}" y2="${apexY-3}" stroke="var(--border2)" stroke-width="0.8" stroke-dasharray="3,3" opacity="0.6"/>
    <path d="${arc}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${gy}" r="3.5" fill="var(--ink)"/>
    <text x="${cx}" y="${gy+13}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="var(--muted)">${Math.round(wW>0?disp*2:0)} yd window</text>
  </svg>`;
}
function buildTrajView(shot){
  shot=shot||{};
  const carry=Math.max(20,shot.carry||140), total=Math.max(carry,shot.total||carry+5);
  const club=STATE.clubs.find(c=>c.id===shot.clubId);
  const type=club?club.type:'iron';
  const col=trajCol(type), disp=trajDisp(carry), apexFrac=trajApexFrac(type);
  const panel=(cls,title,svg)=>`<div class="traj-panel ${cls}"><div class="traj-panel-title">${title}</div>${svg}</div>`;
  return `<div class="traj-view">
    ${panel('traj-main','Side view',trajSideSVG(carry,total,apexFrac,col))}
    ${panel('traj-sub','Overhead — dispersion',trajOverheadSVG(carry,disp,col))}
    ${panel('traj-sub','Down the line',trajDtlSVG(apexFrac,disp,col))}
  </div>`;
}
/* Re-render the trajectory view (called by the distance / Situational Info / shaping sliders). */
function renderShaper3D(){
  const scene=document.getElementById('shaper-scene'); if(!scene) return;
  scene.innerHTML=buildTrajView(window.approachShot||null);
}
/* Re-render the Impact & Swing conditions list (left) + control labels + the 3D scene.
   These are the impact conditions that PRODUCE the shot — listed alongside the model. */
function renderShotShaper(){
  const out=document.getElementById('shaper-specs'); if(!out) return;
  const m=currentShaperModel();
  const cv=SHAPER_CURVES[_clampIdx(document.getElementById('shaper-curve')?.value,SHAPER_CURVES.length)];
  const stance=SHAPER_LIES[_clampIdx(document.getElementById('shaper-stance')?.value,3)][0];
  const setV=(id,txt)=>{const e=document.getElementById(id+'-v'); if(e) e.textContent=txt;};
  setV('shaper-curve', cv[1]);
  setV('shaper-stance', SHAPER_LIES[_clampIdx(document.getElementById('shaper-stance')?.value,3)][1]);
  const fmt=v=>Math.abs(v)<0.05?'0.0° sq':`${Math.abs(v).toFixed(1)}° ${v>0?'R':'L'}`;
  const fmtV=v=>`${v>0?'+':''}${v.toFixed(1)}°`;
  const club=STATE.clubs.find(c=>c.id===shaperClubId());
  const p=perf(shaperClubId())||{};
  const aoa=shaperStockAoA(shaperClubId(), club?club.type:'iron');       /* VPath = angle of attack */
  const dynLoft=m.loft;                                                  /* VFace ≈ dynamic loft */
  const cspd=p.cspd;                                                     /* clubhead speed (entered) */
  /* gear effect from the club's recorded miss tendency, if any */
  const mt=(STATE.missTendency||{})[shaperClubId()]||{};
  const gear = mt.heelToe==='toe' ? 'Toe → draw spin' : mt.heelToe==='heel' ? 'Heel → fade spin' : 'Centred (neutral)';
  /* swing-plane estimate: presumed VPlane by club, HPlane from the D-plane relationship */
  const vPlane = club&&club.type==='wood'?47 : club&&club.type==='wedge'?61 : 55;
  const hPlane = (typeof dpHPlane==='function') ? dpHPlane(aoa, vPlane, m.path) : m.path;
  const head=`<div class="shaper-spec-head">Impact &amp; Swing — ${club?club.label:'—'}${club?' · '+club.loft:''} <span class="sg-prov" style="color:#b07d12;background:rgba(196,150,30,.16)">Presumed</span></div>`;
  const line=(k,v)=>`<div class="shaper-line"><span>${k}</span><b>${v}</b></div>`;
  const rows=
    line('3D Path (V·H)', `${fmtV(aoa)} AoA · ${fmt(m.path)}`)
    +line('3D Face (V·H)', `${dynLoft.toFixed(0)}° loft · ${fmt(m.face)}`)
    +line('Spin axis · loft', `${Math.abs(m.spinAxis).toFixed(1)}° ${m.spinAxis<0?'L':m.spinAxis>0?'R':'·'} · ${m.spinLoft.toFixed(0)}°`)
    +line('Start · curve', `${fmt(m.start)} · ~${Math.abs(m.curve)} yd ${m.spinAxis<0?'left':m.spinAxis>0?'right':'straight'}`)
    +line('Clubhead speed', cspd?`${cspd} mph <span class="sg-prov" style="color:#1a5aaa;background:rgba(26,90,170,.12)">Input</span>`:'—')
    +line('Gear effect', gear)
    +line('Swing plane (V·H)', `~${vPlane}° · ${fmtV(hPlane)} <span style="color:var(--muted);font-size:.6rem">est</span>`)
    +(stance!=='level'?line('Stance (side-hill)', stance==='above'?'Above feet → draw':'Below feet → fade'):'');
  const setup = m.spinAxis<-0.4 ? 'Setup for draw: ball slightly back, close stance a touch, swing out to the spin-axis line.'
            : m.spinAxis>0.4 ? 'Setup for fade: ball slightly forward, open stance a touch, hold the face through impact.'
            : 'Setup square: ball centre, square stance, neutral grip pressure.';
  out.innerHTML=`<div class="shaper-readout">${head}${rows}
    <div class="shaper-note">${setup}</div>
    <div class="shaper-axis-key">X lateral · Y up · Z downrange · estimates until launch-monitor data is imported</div></div>`;
  renderShaper3D();
}
function buildShotShaper(){
  const wrap=document.getElementById('shot-shaper-wrap'); if(!wrap) return;
  const stepCtrl=(id,label,max,val)=>`<div class="shaper-ctrl"><label>${label} <span class="shaper-ctrl-v" id="${id}-v">—</span></label><input type="range" id="${id}" min="0" max="${max}" step="1" value="${val}" oninput="renderShotShaper()"></div>`;
  wrap.innerHTML=`
    <div class="section-label">Your Shot — Ball Flight</div>
    <p class="intro-note" style="margin-bottom:10px">A stylised side view, overhead dispersion and down-the-line for the selected shot above. Shape &amp; Stance set the impact conditions listed below. Reference defaults — refine with your own launch-monitor data.</p>
    <div class="shaper-controls">
      ${stepCtrl('shaper-curve','Shape',SHAPER_CURVES.length-1,3)}
      ${stepCtrl('shaper-stance','Stance',2,0)}
    </div>
    <div class="shaper-scene" id="shaper-scene"></div>
    <div class="shaper-specs" id="shaper-specs"></div>`;
  renderShotShaper();
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { PARTIAL_CLUBS, SWINGS, SHAPER_LIE, SHAPER_CURVES, SHAPER_LIES, buildLookupTable, buildPartialsTable, buildShaperSVG, buildShotShaper, buildShaperScene3D, shaperAxisTriad, shaperClubList, calcSuggestions, currentShaperModel, effortColor, initCalc, interpFlight, renderCalc, renderShaper3D, renderShotShaper, shaperCrossDrift, selectApproachResult, shaper3DProject, shaper3DFitter, shaper3DArrow, shaperModel, shaperStockAoA, wedgeModel });
