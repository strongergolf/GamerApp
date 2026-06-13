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
  if(target<37||target>170){box.innerHTML=`<div class="calc-no-result">Outside partial-swing range (37–170 yd). Use the Bag ladder for longer distances.</div>`;return;}
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
    const checkDesc=(()=>{const hs=fl.spin>=8500,ms=fl.spin>=6500,hh=fl.height>=70,mh=fl.height>=50;if(hs&&hh)return'Stops quickly';if(hs&&mh)return'Checks up';if(hs)return'Bites on landing';if(ms&&hh)return'Some check';if(ms&&mh)return'Moderate release';if(ms)return'Low release';if(hh)return'Soft landing';return'Runs out';})();
    /* Roll from the stock flight × the shot-type rollout multiplier + green firmness; the
       ball lands at the measured target, so Total = target and Carry = target − roll. */
    const baseRoll=approachRolloutYds(fl0.spin,fl0.height);
    const estRoll=Math.max(0,Math.round(baseRoll*stm.rollMult)+(window.approachGreenFirmness||0));
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
    const fl0=interpFlight(pick.club,pick.sw.key,playTarget);
    const fl={launch:Math.round(fl0.launch*stm.launchMult),spin:Math.round(fl0.spin*stm.spinMult),height:Math.round(fl0.height*stm.heightMult)};
    const swingLabel=pick.sw.key==='full'?'Full':pick.sw.key==='tq'?'¾':'½';
    const tRoll=Math.max(0,Math.round(approachRolloutYds(fl0.spin,fl0.height)*stm.rollMult)+(window.approachGreenFirmness||0));
    const tCarry=target-tRoll;
    const tLand=Math.round((p.land||45)*(stm.landMult||1));
    const shotTag=shotType!=='stock'?` · ${shotType}`:'';
    const svgHtml=buildSideSVG(pick.club,{carry:tCarry,total:target,launch:fl.launch,spin:fl.spin,land:tLand,ht:fl.height,bspd:p.bspd||0});
    trajWrap.innerHTML=`<div class="approach-traj-wrap">
      <div class="chip-svg-label" style="font-size:.8rem;font-weight:700;color:var(--ink);letter-spacing:.01em">${pick.club.label} ${swingLabel}${shotTag} — carry ${tCarry} · roll ${tRoll} · total ${target} yds · ${fl.launch}° · ${(fl.spin/1000).toFixed(1)}k</div>
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

/* Panel 1 — D-plane at impact: ground + target line + club path + lofted/angled face
   + face normal + the resulting tilted spin axis. Shows the vertical (loft) AND
   horizontal (face/path) picture that together set the spin-axis tilt. */
function buildDPlane3DSVG(m,az,el){
  const W=252,H=212,pad=24,FL=60;
  const loft=m.loft||31, face=m.face||0, hpath=(m.path||0)*1.5, spinAxis=m.spinAxis||0;
  const rx=(p,a)=>{a*=Math.PI/180;return {x:p.x,y:p.y*Math.cos(a)-p.z*Math.sin(a),z:p.y*Math.sin(a)+p.z*Math.cos(a)};};
  const ry=(p,a)=>{a*=Math.PI/180;return {x:p.x*Math.cos(a)+p.z*Math.sin(a),y:p.y,z:-p.x*Math.sin(a)+p.z*Math.cos(a)};};
  /* face represented as a CIRCULAR plane (disc) — distinct from the Horizontal Swing
     Plane rectangle in Mark's other materials. Sample a circle in the face's local
     plane, then loft- and face-rotate it. */
  const fr=17, facePts=[];
  for(let i=0;i<32;i++){ const th=i/32*2*Math.PI; facePts.push(ry(rx({x:fr*Math.cos(th),y:fr*Math.sin(th),z:0},-loft),face)); }
  let nrm={x:0,y:0,z:1}; nrm=ry(rx(nrm,-loft),face);
  const pr=hpath*Math.PI/180, pathEnd={x:Math.sin(pr)*FL,y:0,z:Math.cos(pr)*FL};
  const sa=-spinAxis*Math.PI/180, axL=26;
  const axA={x:-axL*Math.cos(sa),y:-axL*Math.sin(sa),z:FL*0.62}, axB={x:axL*Math.cos(sa),y:axL*Math.sin(sa),z:FL*0.62};
  const G=34;
  const bounds=[{x:-G,y:0,z:0},{x:G,y:0,z:0},{x:-G,y:0,z:FL},{x:G,y:0,z:FL},{x:0,y:fr+6,z:0},{x:0,y:-axL-6,z:FL*0.62},{x:0,y:axL+6,z:FL*0.62}];
  const T=shaper3DFitter(bounds,az,el,W,H,pad);
  const P=(p)=>T(p.x,p.y,p.z);
  /* ground grid */
  let grid='';
  for(let gz=0;gz<=FL;gz+=FL/3){const a=T(-G,0,gz),b=T(G,0,gz);grid+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border2)" stroke-width="0.6" opacity="0.45"/>`;}
  [-G,0,G].forEach(gx=>{const a=T(gx,0,0),b=T(gx,0,FL);grid+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border2)" stroke-width="0.6" opacity="0.45"/>`;});
  /* target line */
  const t0=T(0,0,0),t1=T(0,0,FL);
  const tline=`<line x1="${t0.x.toFixed(1)}" y1="${t0.y.toFixed(1)}" x2="${t1.x.toFixed(1)}" y2="${t1.y.toFixed(1)}" stroke="var(--gold2)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.7"/>`;
  /* club path */
  const pathArrow=shaper3DArrow(T(0,0,0),P(pathEnd),'var(--sky)',1.8);
  /* face disc + normal */
  const fp=facePts.map(P);
  const faceDisc=`<polygon points="${fp.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')}" fill="rgba(26,90,170,0.20)" stroke="var(--c-iron)" stroke-width="1.5"/>`;
  const nrmArrow=shaper3DArrow(T(0,0,0),T(nrm.x*22,nrm.y*22,nrm.z*22),'var(--c-iron)',1.5);
  /* spin axis (double-headed) */
  const sA=P(axA),sB=P(axB);
  const axis=`<line x1="${sA.x.toFixed(1)}" y1="${sA.y.toFixed(1)}" x2="${sB.x.toFixed(1)}" y2="${sB.y.toFixed(1)}" stroke="${shaperShapeColor(m)}" stroke-width="2.2" stroke-linecap="round"/>`
    +`<circle cx="${sA.x.toFixed(1)}" cy="${sA.y.toFixed(1)}" r="2.6" fill="${shaperShapeColor(m)}"/><circle cx="${sB.x.toFixed(1)}" cy="${sB.y.toFixed(1)}" r="2.6" fill="${shaperShapeColor(m)}"/>`;
  const ball=T(0,0,0);
  const flagTop=T(0,20,FL);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    ${grid}${tline}${pathArrow}${faceDisc}${nrmArrow}${axis}
    ${sgFlagstick(t1.x,t1.y,flagTop.x,flagTop.y,1)}
    ${sgBall(ball.x,ball.y,4)}
    <text x="6" y="13" font-family="ui-monospace,monospace" font-size="6.5" fill="var(--c-iron)">● face / normal</text>
    <text x="6" y="22" font-family="ui-monospace,monospace" font-size="6.5" fill="var(--sky)">▸ club path</text>
    <text x="6" y="31" font-family="ui-monospace,monospace" font-size="6.5" fill="${shaperShapeColor(m)}">— spin axis ${Math.abs(spinAxis).toFixed(1)}°</text>
  </svg>`;
}

/* Panel 2 — 3D ball flight: curving arc with both the lateral shape (draw/fade) and the
   vertical trajectory (launch, apex, descent) visible in perspective. */
function buildShotFlight3DSVG(m,az,el){
  const W=252,H=212,pad=22,Zmax=120,LE=2.6;
  const startSlope=Math.tan((m.start||0)*Math.PI/180);
  const ctrlX=startSlope*Zmax*0.5*LE;
  const loft=m.loft||31;
  const peak=Zmax*(0.18+Math.min(0.34,(loft/60)*0.34));
  const N=28, path=[];
  for(let i=0;i<=N;i++){const u=i/N; path.push({x:2*(1-u)*u*ctrlX, y:peak*Math.sin(Math.PI*Math.pow(u,0.92)), z:u*Zmax});}
  const apex={x:2*0.25*ctrlX,y:peak,z:Zmax*0.5};
  const G=Math.max(20,Math.abs(ctrlX)*1.25);
  const bounds=[{x:-G,y:0,z:0},{x:G,y:0,z:0},{x:-G,y:0,z:Zmax},{x:G,y:0,z:Zmax},{x:0,y:peak,z:Zmax*0.5}];
  const T=shaper3DFitter(bounds,az,el,W,H,pad);
  let grid='';
  for(let gz=0;gz<=Zmax;gz+=Zmax/4){const a=T(-G,0,gz),b=T(G,0,gz);grid+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border2)" stroke-width="0.6" opacity="0.45"/>`;}
  [-G,0,G].forEach(gx=>{const a=T(gx,0,0),b=T(gx,0,Zmax);grid+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border2)" stroke-width="0.6" opacity="0.45"/>`;});
  const t0=T(0,0,0),t1=T(0,0,Zmax);
  const tline=`<line x1="${t0.x.toFixed(1)}" y1="${t0.y.toFixed(1)}" x2="${t1.x.toFixed(1)}" y2="${t1.y.toFixed(1)}" stroke="var(--gold2)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.7"/>`;
  /* start-line reference on the ground (direction the ball sets off) */
  const slPt=T(startSlope*Zmax*LE,0,Zmax);
  const slGround=ctrlX!==0?`<line x1="${t0.x.toFixed(1)}" y1="${t0.y.toFixed(1)}" x2="${slPt.x.toFixed(1)}" y2="${slPt.y.toFixed(1)}" stroke="var(--sky)" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>`:'';
  const col=shaperShapeColor(m);
  const pts=path.map(p=>{const s=T(p.x,p.y,p.z);return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;}).join(' ');
  const ball=T(0,0,0),apexS=T(apex.x,apex.y,apex.z),apexG=T(apex.x,0,apex.z);
  const apexDrop=`<line x1="${apexS.x.toFixed(1)}" y1="${apexS.y.toFixed(1)}" x2="${apexG.x.toFixed(1)}" y2="${apexG.y.toFixed(1)}" stroke="${col}" stroke-width="0.8" stroke-dasharray="2,2" opacity="0.6"/>`;
  const flagTop=T(0,Math.min(30,peak*0.6),Zmax);  /* flagstick at the target */
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    ${grid}${tline}${slGround}${apexDrop}
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${apexS.x.toFixed(1)}" cy="${apexS.y.toFixed(1)}" r="2.6" fill="${col}"/>
    ${sgFlagstick(t1.x,t1.y,flagTop.x,flagTop.y,1)}
    ${sgBall(ball.x,ball.y,5)}
    <text x="${apexS.x.toFixed(1)}" y="${(apexS.y-5).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="${col}">apex</text>
  </svg>`;
}

/* Read the current control values into a shaper model. */
function currentShaperModel(){
  const clubId=document.getElementById('shaper-club')?.value||'7i';
  const shape=document.getElementById('shaper-shape')?.value||'draw';
  const amount=document.getElementById('shaper-amount')?.value||'standard';
  return shaperModel(clubId,shape,amount);
}
/* Re-render only the two 3D panels (used by the rotate/tilt sliders so they keep focus). */
function renderShaper3D(){
  const row=document.getElementById('shaper-3d-row'); if(!row) return;
  const m=currentShaperModel();
  const az=parseFloat(document.getElementById('shaper-az')?.value);
  const el=parseFloat(document.getElementById('shaper-el')?.value);
  const A=isNaN(az)?-28:az, E=isNaN(el)?20:el;
  window.shaper3DAz=A; window.shaper3DEl=E;
  row.innerHTML=`
    <div class="shaper-3d-panel"><div class="shaper-3d-title">D-Plane at impact</div>${buildDPlane3DSVG(m,A,E)}</div>
    <div class="shaper-3d-panel"><div class="shaper-3d-title">Shot shape — 3D ball flight</div>${buildShotFlight3DSVG(m,A,E)}</div>`;
}
function renderShotShaper(){
  const out=document.getElementById('shaper-out'); if(!out) return;
  const shape=document.getElementById('shaper-shape')?.value||'draw';
  const m=currentShaperModel();
  const fmt=v=>Math.abs(v)<0.05?'0.0° square':`${Math.abs(v).toFixed(1)}° ${v>0?'R':'L'}`;
  const az=window.shaper3DAz!=null?window.shaper3DAz:-28, el=window.shaper3DEl!=null?window.shaper3DEl:20;
  let readout;
  if(shape==='straight'){
    readout=`<div class="shaper-readout">
      <div class="shaper-line"><span>3D Face</span><b>0.0° square</b></div>
      <div class="shaper-line"><span>3D Path</span><b>0.0° square</b></div>
      <div class="shaper-line"><span>Start line</span><b>On target</b></div>
      <div class="shaper-line"><span>3D spin loft</span><b>${m.spinLoft.toFixed(0)}°</b></div>
      <div class="shaper-note">Square face, square path — the D-plane is vertical and the ball flies straight. Drag the sliders to rotate; the vertical climb &amp; descent are now part of the picture.</div>
    </div>`;
  } else {
    const side=shape==='draw'?'left':'right';
    const launchNote=m.type==='wood'
      ? 'With the driver, draws launch a touch <b>higher</b> than fades.'
      : 'With irons, draws launch a touch <b>lower</b> than fades.';
    readout=`<div class="shaper-readout">
      <div class="shaper-line"><span>3D Face (HFace)</span><b>${fmt(m.face)}</b></div>
      <div class="shaper-line"><span>3D Path (HPath)</span><b>${fmt(m.path)}</b></div>
      <div class="shaper-line"><span>Start line</span><b>${fmt(m.start)} of target</b></div>
      <div class="shaper-line"><span>Spin axis / 3D loft</span><b>${Math.abs(m.spinAxis).toFixed(1)}° ${m.spinAxis<0?'L':'R'} · ${m.spinLoft.toFixed(0)}°</b></div>
      <div class="shaper-line"><span>Curve</span><b>~${Math.abs(m.curve)} yds ${side}</b></div>
      <div class="shaper-note">Ball starts ${fmt(m.start)} (≈80% toward the face), then curves ${side} back to target via a ${Math.abs(m.spinAxis).toFixed(1)}° spin-axis tilt. Spin axis = atan(HDiff/VDiff) — lower spin loft curves more. ${launchNote}</div>
    </div>`;
  }
  out.innerHTML=`
    ${readout}
    <div class="shaper-rot">
      <label>Rotate<input type="range" id="shaper-az" min="-90" max="90" step="2" value="${az}" oninput="renderShaper3D()"></label>
      <label>Tilt<input type="range" id="shaper-el" min="4" max="62" step="2" value="${el}" oninput="renderShaper3D()"></label>
    </div>
    <div class="shaper-3d-row" id="shaper-3d-row"></div>`;
  renderShaper3D();
}
function buildShotShaper(){
  const wrap=document.getElementById('shot-shaper-wrap'); if(!wrap) return;
  const opts=STATE.clubs.filter(c=>c.type!=='putter').map(c=>`<option value="${c.id}"${c.id==='7i'?' selected':''}>${c.label} — ${c.loft}</option>`).join('');
  wrap.innerHTML=`
    <div class="section-label">Shot Shaper <span class="proto-badge">prototype</span></div>
    <p class="intro-note" style="margin-bottom:10px">D-plane shot-shaping, calibrated to the StrongerGolf draw/fade study. Pick a club and a shape to see the face, path and start line that bend the ball back to target — now in 3D, so the vertical climb &amp; descent read alongside the lateral curve. Rotate and tilt the view with the sliders. Reference defaults — refine with your own launch-monitor data.</p>
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
Object.assign(window, { PARTIAL_CLUBS, SWINGS, buildLookupTable, buildPartialsTable, buildShaperSVG, buildShotShaper, buildDPlane3DSVG, buildShotFlight3DSVG, calcSuggestions, currentShaperModel, effortColor, initCalc, interpFlight, renderCalc, renderShaper3D, renderShotShaper, selectApproachResult, shaper3DProject, shaper3DFitter, shaper3DArrow, shaperModel, shaperStockAoA, wedgeModel });
