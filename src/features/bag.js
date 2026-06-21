// Stock Shots tab: club ladder with dual-CI dispersion, side-profile and overhead SVGs.
// Trajectory model: ascent handle 0.72, descent 0.28, 42deg landing. Overhead overlays
// fairway (loft <=23) or green (loft >23) with landing-zone ellipse.

/* ============================================================
   BAG / LADDER
   ============================================================ */
/* ---- Environmental Adjustment: one STATE-driven panel rendered into any host (Stock Shots
   + Approach). Both panels read/write the single set of today's conditions (STATE.baseline)
   + density K, and seed every carry across the app via carryFactor(). ---- */
const ENV_HOSTS=['env-bag','env-approach'];
function envPanelHTML(pfx){
  const b=STATE.baseline;
  const fld=(key,label,attrs,val)=>`<div class="cond-field"><label>${label}</label><input id="${pfx}-${key}" type="number" ${attrs} value="${val}" oninput="onEnvInput('${key}',this.value)"></div>`;
  return `<div class="cond-strip">
    <div class="cond-head">
      <div class="cond-title">Environmental Adjustment</div>
      <label class="cond-toggle"><input type="checkbox" id="${pfx}-adj" ${window.adjustOn?'checked':''} onchange="onEnvToggle(this.checked)"> Adjust carries</label>
    </div>
    <div class="cond-body">
      ${fld('tempF','Temp °F','step="1"',b.tempF)}
      ${fld('altitudeFt','Altitude ft','step="50"',b.altitudeFt)}
      ${fld('humidity','Humidity %','min="0" max="100" step="1"',b.humidity)}
      ${fld('pressureInHg','Pressure inHg','step="0.01"',b.pressureInHg)}
      ${fld('densityK','Air Density (k)','step="0.05" min="0" max="2"',STATE.densityK)}
    </div>
    <div class="cond-summary" id="${pfx}-sum"></div>
  </div>`;
}
function buildEnvPanels(){
  ENV_HOSTS.forEach(pfx=>{ const h=document.getElementById(pfx); if(h) h.innerHTML=envPanelHTML(pfx); });
  envSyncSummary();
}
function envSyncSummary(){
  const rhoC=airDensity(currentConditions()), rhoStd=airDensity(STD_COND);
  const f=window.adjustOn?(1+STATE.densityK*(rhoStd/rhoC-1)):1;
  const pct=(f-1)*100, dir=pct>0.05?'up':pct<-0.05?'down':'', sign=pct>0?'+':'';
  const html=`<span>Air density: <b>${rhoC.toFixed(3)}</b> kg/m³</span>
    <span>Standard: <b>${rhoStd.toFixed(3)}</b> kg/m³</span>
    <span>Plays: <b class="${dir}">${window.adjustOn?sign+pct.toFixed(1)+'%':'stock'}</b></span>`;
  ENV_HOSTS.forEach(pfx=>{ const s=document.getElementById(pfx+'-sum'); if(s) s.innerHTML=html; });
}
function envRefreshDeps(){
  buildLadder();
  if(typeof buildPartialsTable==='function') buildPartialsTable();
  if(typeof renderCalc==='function'){ const ys=document.getElementById('yard-slider'); renderCalc(ys?(parseInt(ys.value)||95):95); }
}
function onEnvInput(key,val){
  const v=parseFloat(val);
  if(key==='densityK'){ if(!isNaN(v)) STATE.densityK=Math.max(0,Math.min(2,v)); }
  else if(!isNaN(v)){ STATE.baseline[key]=v; }
  saveState();
  ENV_HOSTS.forEach(pfx=>{ const el=document.getElementById(pfx+'-'+key); if(el && el!==document.activeElement) el.value=(key==='densityK'?STATE.densityK:STATE.baseline[key]); });
  envSyncSummary(); envRefreshDeps();
}
function onEnvToggle(on){
  window.adjustOn=on;
  ENV_HOSTS.forEach(pfx=>{ const el=document.getElementById(pfx+'-adj'); if(el) el.checked=on; });
  envSyncSummary(); envRefreshDeps();
}
/* Back-compat aliases for existing callers (nav refreshAll, saveCalibration). */
function renderConditions(){ buildEnvPanels(); }
function updateCondSummary(){ envSyncSummary(); }

function buildLadder(){
  const wrap = document.getElementById('ladder-wrap');
  wrap.innerHTML='';
  let lastType=null;
  STATE.clubs.forEach(c=>{
    if(c.type==='putter') return; /* putter not in carry ladder */
    if(c.type!==lastType){
      const d=document.createElement('div'); d.className='ladder-divider'; d.textContent=typeLabel(c.type);
      wrap.appendChild(d); lastType=c.type;
    }
    const p=perf(c.id);
    const stock=p.carry||0;
    const shown=window.adjustOn?adjCarry(stock):stock;
    const pct=Math.round((shown/MAX_CARRY)*100);
    const d86=disp86(stock);                                /* single 86% L/R lateral half-width */
    /* Dispersion badges coloured by club type (iron = blue, wood/utility = red,
       wedge = green) for a cleaner read than the old magnitude-based shading. */
    const dcRGB={wood:'217,96,112',iron:'26,90,170',wedge:'0,133,63',putter:'107,114,128'}[c.type]||'107,114,128';
    const dc={ color:typeHex(c.type), bg:`rgba(${dcRGB},.12)`, border:`rgba(${dcRGB},.34)` };
    /* Lateral miss as % of total yardage now lives in Locker Room → My Bag (buildLateralGapping). */
    const adjBit = window.adjustOn && shown!==stock
      ? `<span class="adj">${shown}</span><span class="stock-sm">stock ${stock}</span>`
      : `${stock}`;
    const row=document.createElement('div');
    row.className='ladder-row';
    row.innerHTML=`
      <div class="club-label ${c.type}">${c.label}<small>${c.loft}</small></div>
      <div class="bar-area">
        <div class="bar-meta">
          <span class="bar-carry">${adjBit} <span style="font-size:.62rem;color:var(--ink2);font-family:ui-monospace,monospace;font-weight:500">carry</span></span>
          <span class="bar-total">${p.total?`<strong>${p.total}</strong> <span style="font-weight:400;font-size:.75rem">total</span>`:'—'}</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${c.type}" style="width:${Math.min(100,pct)}%"></div></div>
      </div>
      <div class="disp-badge-wrap">
        <div class="disp-badge-row">
          <span class="disp-ci-label">86%</span>
          <span class="disp-badge" style="background:${dc.bg};color:${dc.color};border:1px solid ${dc.border}">${d86} L/R</span>
        </div>
      </div>
      <div class="ladder-chevron">▾</div>`;
    const group=document.createElement('div'); group.className='ladder-detail-group';
    const inner=document.createElement('div'); inner.className='ladder-detail-inner'; group.appendChild(inner);
    row.onclick=()=>toggleDetail(c,row,group,inner);
    wrap.appendChild(row); wrap.appendChild(group);
  });
}
function buildGapping(){
  /* The per-club gap distances render inline in the Clubs list (see buildSpecs); the
     summary line was removed at the user's request. */
  const wrap=document.getElementById('gapping-wrap');
  if(wrap) wrap.innerHTML='';
}
function toggleDetail(c,row,group,inner){
  const open=group.classList.contains('open');
  document.querySelectorAll('.ladder-row').forEach(r=>r.classList.remove('selected'));
  document.querySelectorAll('.ladder-detail-group').forEach(g=>g.classList.remove('open'));
  if(open) return;
  row.classList.add('selected');
  const p=perf(c.id);
  inner.innerHTML=`
    <div class="detail-header">
      <div class="detail-club-name ${c.type}">${c.label} — ${c.loft}</div>
      <div class="detail-club-spec" style="font-size:.88rem;color:var(--ink2)">${c.make} ${c.model}<br><span style="color:var(--ink2)">${c.shaft} · ${c.length}</span></div>
      <div style="margin-left:auto;align-self:center" title="Data provenance for this club's stock numbers">${typeof sgProv==='function'?sgProv(p.prov||'input'):''}</div>
    </div>
    <div class="detail-stats">
      ${statCell('Carry',p.carry,'yd','hl-carry')}
      ${statCell('Total',p.total||'—','yd','')}
      ${statCell('Ball Speed',p.bspd,'mph','hl-speed')}
      ${statCell('Club Speed',p.cspd,'mph','hl-speed')}
      ${statCell('Vert. Launch',(p.launch!=null?p.launch:'—'),'°','')}
      ${statCell('Spin Rate',(p.spin!=null?p.spin.toLocaleString():'—'),'rpm','hl-spin')}
      ${statCell('Max Height',p.ht,'ft','')}
      ${statCell('Land Angle',(p.land!=null?p.land:'—'),'°','hl-land')}
    </div>
    <div id="es-bag-${c.id}" class="expected-shots-strip"></div>
    <div class="flight-wrap">
      <div class="flight-row">
        <div class="flight-col-main"><div class="flight-label">Trajectory &amp; Rollout</div><div class="flight-svg-wrap">${buildSideSVG(c,p)}</div></div>
        <div class="flight-col-top"><div class="flight-label">Overhead — Dispersion</div><div class="flight-svg-wrap">${buildTopSVG(c,p)}</div></div>
      </div>
    </div>
    ${c.id==='D'?buildDriverOptimizerHTML():''}`;
  renderExpectedShots(`es-bag-${c.id}`, p.total||p.carry, 'fairway');
  if(c.id==='D' && typeof updateDriverOpt==='function') updateDriverOpt();
  group.classList.add('open');
  setTimeout(()=>group.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
}
function statCell(label,val,unit,cls){
  return `<div class="stat-cell ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${val==null?'—':val}</div><div class="stat-unit">${unit}</div></div>`;
}

/* ---- Per-club observed miss tendency ---- */
function missSelect(id,field,opts,cur){
  const ss='font-family:Arial,sans-serif;font-size:.82rem;font-weight:600;padding:5px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--ink);outline:none;width:100%';
  return `<select onchange="setMiss('${id}','${field}',this.value)" style="${ss}">`
    +opts.map(o=>`<option value="${o}"${o===cur?' selected':''}>${o||'—'}</option>`).join('')+`</select>`;
}
function missNote(m){
  if(!m||(!m.dir&&!m.curve&&!m.heelToe&&!m.lowHigh)) return 'Log your typical miss — it will feed the gear-effect model, skew the dispersion ellipse, and pre-fill the D-plane grid (connections coming).';
  const bits=[];
  if(m.heelToe==='Toe'||m.heelToe==='Slight Toe'){ bits.push('toe contact adds <b>draw</b> spin via gear effect'); }
  if(m.heelToe==='Heel'||m.heelToe==='Slight Heel'){ bits.push('heel contact adds <b>fade</b> spin via gear effect'); }
  if(m.curve==='Slice'||m.curve==='Fade'){ bits.push('face open to path'); }
  if(m.curve==='Hook'||m.curve==='Draw'){ bits.push('face closed to path'); }
  if(m.dir==='Pull'||m.dir==='Slight Pull'){ bits.push('face left of target at impact'); }
  if(m.dir==='Push'||m.dir==='Slight Push'){ bits.push('face right of target at impact'); }
  return bits.length?('Reads as: '+bits.join(' · ')+'.'):'Logged.';
}
function buildMissBlock(c){
  const m=(STATE.missTendency&&STATE.missTendency[c.id])||{};
  const fld='font-family:ui-monospace,monospace;font-size:.55rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:3px';
  return `<div style="margin-top:14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
    <div style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:800;font-size:.92rem;color:var(--ink);margin-bottom:8px">Miss Tendency</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 10px">
      <div><label style="${fld}">Start Direction</label>${missSelect(c.id,'dir',['','Pull','Slight Pull','Straight','Slight Push','Push'],m.dir||'')}</div>
      <div><label style="${fld}">Shot Shape</label>${missSelect(c.id,'curve',['','Hook','Draw','Straight','Fade','Slice'],m.curve||'')}</div>
      <div><label style="${fld}">Strike — Heel / Toe</label>${missSelect(c.id,'heelToe',['','Heel','Slight Heel','Centre','Slight Toe','Toe'],m.heelToe||'')}</div>
      <div><label style="${fld}">Strike — Low / High</label>${missSelect(c.id,'lowHigh',['','Fat / Heavy','Low','Centre','High','Thin'],m.lowHigh||'')}</div>
    </div>
    <div id="miss-note-${c.id}" style="font-family:Arial,sans-serif;font-size:.76rem;line-height:1.4;color:var(--muted);margin-top:8px">${missNote(m)}</div>
  </div>`;
}
function setMiss(id,field,value){
  if(!STATE.missTendency) STATE.missTendency={};
  if(!STATE.missTendency[id]) STATE.missTendency[id]={};
  STATE.missTendency[id][field]=value;
  saveState();
  const note=document.getElementById('miss-note-'+id);
  if(note) note.innerHTML=missNote(STATE.missTendency[id]);
}

/* SIDE-VIEW BALL FLIGHT (trajectory + rollout) */
function buildSideSVG(c,p){
  const W=320,H=104,PAD_L=10,PAD_R=8,PAD_T=10,groundY=H-4;
  const tc=typeHex(c.type);
  const carry=p.carry||100, total=p.total||carry;
  const rollout=total-carry, hasRoll=Math.abs(rollout)>1;
  const spanX=W-PAD_L-PAD_R;
  const carryX=PAD_L+spanX*(carry/Math.max(total,carry));
  const totalX=PAD_L+spanX;
  const launchRad=(p.launch||15)*Math.PI/180, landRad=(p.land||45)*Math.PI/180;
  const spinT=Math.min(1,Math.max(0,((p.spin||6000)-2400)/(10000-2400)));
  const x0=PAD_L,y0=groundY,x3=carryX,y3=groundY,bSpan=x3-x0;
  const aH=bSpan*(0.58-spinT*0.16), dH=bSpan*(0.38+spinT*0.16);
  const p1x=x0+aH*Math.cos(launchRad),p1y=y0-aH*Math.sin(launchRad);
  const p2x=x3-dH*Math.cos(landRad),p2y=y3-dH*Math.sin(landRad);
  const flight=`M ${x0},${y0} C ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${x3},${y3}`;
  function bez(t){const m=1-t;return{x:m*m*m*x0+3*m*m*t*p1x+3*m*t*t*p2x+t*t*t*x3,y:m*m*m*y0+3*m*m*t*p1y+3*m*t*t*p2y+t*t*t*y3};}
  let pk=bez(0.5); for(let ti=10;ti<=90;ti+=2){const pt=bez(ti/100);if(pt.y<pk.y)pk=pt;}
  let roll='';
  if(hasRoll){
    const rD=totalX-carryX, n=Math.abs(rollout)<=5?1:Math.abs(rollout)<=12?2:3;
    const bMax=Math.max(2,Math.min(12,Math.abs(rD)*0.18)); let bx=carryX; const step=rD/(n+0.5);
    for(let b=0;b<n;b++){const bh=bMax*Math.pow(0.55,b),bx2=bx+step,bmx=(bx+bx2)/2,bmy=groundY-bh;
      roll+=`<path d="M ${bx.toFixed(1)},${groundY} Q ${bmx.toFixed(1)},${bmy.toFixed(1)} ${bx2.toFixed(1)},${groundY}" fill="none" stroke="${tc}" stroke-width="1.2" opacity="0.5"/>`; bx=bx2;}
    const rc=rollout<0?'#d96070':tc;
    roll+=`<line x1="${bx.toFixed(1)}" y1="${groundY}" x2="${totalX}" y2="${groundY}" stroke="${rc}" stroke-width="1.5" opacity="0.6"/>`;
    roll+=`<circle cx="${totalX}" cy="${groundY}" r="2" fill="${rc}" opacity="0.7"/>`;
    roll+=`<text x="${(totalX-2).toFixed(1)}" y="${groundY+9}" text-anchor="end" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="${rc}" opacity="0.8">${rollout<0?total+'yd (checks back)':total+'yd total'}</text>`;
  }
  const lx2=x0+24*Math.cos(launchRad),ly2=y0-24*Math.sin(launchRad);
  const rx2=carryX-24*Math.cos(landRad),ry2=y3-24*Math.sin(landRad);
  const htLX=Math.min(pk.x+3,W-26),htLY=Math.max(pk.y-3,PAD_T+5);
  return `<svg viewBox="0 0 ${W} ${H+4}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <line x1="4" y1="${groundY}" x2="${W-4}" y2="${groundY}" stroke="#c0d8cf" stroke-width="0.8"/>
    <line x1="${pk.x.toFixed(1)}" y1="${(pk.y+2).toFixed(1)}" x2="${pk.x.toFixed(1)}" y2="${groundY}" stroke="#c0d8cf" stroke-width="0.6" stroke-dasharray="3,2"/>
    <text x="${htLX.toFixed(1)}" y="${htLY.toFixed(1)}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6.5" fill="#3a5a7a">${p.ht||'—'}ft</text>
    <text x="${((PAD_L+carryX)/2).toFixed(1)}" y="${H+10}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="#3a5a7a">${carry}yd carry</text>
    <path d="${flight}" fill="none" stroke="${tc}" stroke-width="1.8" opacity="0.9"/>
    ${roll}
    <line x1="${x0}" y1="${y0}" x2="${lx2.toFixed(1)}" y2="${ly2.toFixed(1)}" stroke="#1a5aaa" stroke-width="1.2" opacity="0.7"/>
    <text x="${x0+2}" y="${groundY-5}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="#1a5aaa">${p.launch||'—'}°</text>
    <line x1="${carryX.toFixed(1)}" y1="${y3}" x2="${rx2.toFixed(1)}" y2="${ry2.toFixed(1)}" stroke="#d96070" stroke-width="1.2" opacity="0.7"/>
    <text x="${(carryX-30).toFixed(1)}" y="${groundY-5}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="#d96070">${p.land||'—'}°</text>
    <circle cx="${x0}" cy="${y0}" r="2.5" fill="${tc}"/>
    <circle cx="${carryX.toFixed(1)}" cy="${y3}" r="2" fill="#d96070"/>
  </svg>`;
}

/* "Typical green" outline — a smooth, near-round organic blob (~30 yd) via Catmull-Rom
   through six gently-varied points. Plain on top — no squiggle. */
function greenBlobPath(cx,cy,rx,ry){
  const ang=[-90,-30,30,90,150,210], rf=[1.0,0.96,1.04,1.0,0.97,1.03];
  const P=ang.map((a,i)=>{const r=a*Math.PI/180;return {x:cx+Math.cos(r)*rx*rf[i], y:cy+Math.sin(r)*ry*rf[i]};});
  const n=P.length; let d=`M ${P[0].x.toFixed(1)},${P[0].y.toFixed(1)} `;
  for(let i=0;i<n;i++){
    const p0=P[(i-1+n)%n],p1=P[i],p2=P[(i+1)%n],p3=P[(i+2)%n];
    const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;
    d+=`C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
  return d+'Z';
}
/* Fairway lane (overhead) — a softly tapered, bowed-edge corridor receding up the frame,
   so it reads as a fairway rather than a hard rectangle. Rough fills behind it. */
function fairwayPath(cx,top,bot,halfPx){
  const tH=halfPx*0.84, bH=halfPx, my=(top+bot)/2, mH=halfPx*1.02;
  const lt=cx-tH, rt=cx+tH, lb=cx-bH, rb=cx+bH, lm=cx-mH, rm=cx+mH;
  return `M ${lt.toFixed(1)},${top} Q ${lm.toFixed(1)},${my.toFixed(1)} ${lb.toFixed(1)},${bot} `
       + `L ${rb.toFixed(1)},${bot} Q ${rm.toFixed(1)},${my.toFixed(1)} ${rt.toFixed(1)},${top} Z`;
}
/* OVERHEAD DISPERSION — single 86% shot oval over the surface you're actually landing on:
   a typical ~30 yd green (organic outline) for irons & wedges, or a 40 yd-wide fairway
   for woods/hybrids. Lateral spread = disp86() (same source as the L/R badges), depth
   capped ≈ ±7 yd, slanted long-left / short-right (a typical miss tilt). */
const DISP_SLANT = 15;   /* deg; tilts the oval long-left / short-right (mirrored) */
function buildTopSVG(c,p){
  const W=120,H=112,cx=W/2,cy=H/2+3,tc=typeHex(c.type);
  const carry=p.carry||100;
  const dispYd=disp86(carry);             // single 86% L/R lateral half-width, yards (matches badges)
  const depthYd=Math.min(dispYd, 7);      // depth (distance control) capped at ≈ ±7 yd
  const isWood=c.type==='wood';

  let bg, ctxLabel, scale;
  if(isWood){
    /* Zoomed out so it reads as a course: the 40 yd fairway, a 10 yd intermediate cut,
       then heavy rough — woods & hybrids finish out here, not on a green. */
    scale=1.5;                                              // ~±40yd visible across the frame
    const top=6, bot=H-6;
    const fwHalf=20*scale, cutHalf=30*scale;                // fairway 40yd · +10yd first cut
    bg=`<rect x="0" y="${top}" width="${W}" height="${(bot-top)}" fill="#1f6e40" fill-opacity="0.22"/>
        <path d="${fairwayPath(cx,top,bot,cutHalf)}" fill="#2f9a55" fill-opacity="0.22"/>
        <path d="${fairwayPath(cx,top,bot,fwHalf)}" fill="#46b56a" fill-opacity="0.26" stroke="#2f9a55" stroke-width="1" stroke-opacity="0.55"/>
        <line x1="${cx}" y1="${top+5}" x2="${cx}" y2="${bot-5}" stroke="#2f9a55" stroke-width="0.6" stroke-dasharray="5,5" opacity="0.4"/>`;
    ctxLabel='40yd FW · 10yd cut · rough';
  } else {
    /* Typical green (~30 yd diameter), smooth organic outline. */
    scale=40/15;                                            // ~15yd radius → 40px
    bg=`<path d="${greenBlobPath(cx,cy,40,36)}" fill="#3aae63" fill-opacity="0.16" stroke="#00853F" stroke-width="1.1" stroke-opacity="0.55"/>`;
    ctxLabel='~30yd green';
  }
  const ovW=dispYd*scale, ovH=depthYd*scale;

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
    <text x="${cx}" y="12" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" font-weight="bold" fill="var(--ink2)">${carry} yd</text>
    ${bg}
    <text x="${cx}" y="21" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5" fill="#00853F" opacity="0.7">${ctxLabel}</text>
    <g transform="rotate(${DISP_SLANT} ${cx} ${cy})">
      <ellipse cx="${cx}" cy="${cy}" rx="${ovW.toFixed(1)}" ry="${ovH.toFixed(1)}" fill="${tc}" fill-opacity="0.28" stroke="${tc}" stroke-opacity="0.75" stroke-width="1.1"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="1.6" fill="var(--ink)"/>
    <text x="${cx}" y="${H-3}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="${tc}">±${dispYd.toFixed(1)} yd L/R · 86%</text>
  </svg>`;
}



/* ============================================================
   GEAR-EFFECT MISS PATTERN (prototype) — Study 01 obs #2 + glossary rules
   Off-centre contact materially shapes ball flight (RH; mirror for LH).
   ============================================================ */
function buildGearFaceSVG(){
  const W=280,H=128,fx=88,fy=26,fw=104,fh=72,cx=fx+fw/2,cy=fy+fh/2;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:300px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
    <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="10" fill="var(--bg2)" stroke="var(--border2)" stroke-width="1.5"/>
    <line x1="${cx}" y1="${fy}" x2="${cx}" y2="${fy+fh}" stroke="var(--border)" stroke-width="0.5"/>
    <line x1="${fx}" y1="${cy}" x2="${fx+fw}" y2="${cy}" stroke="var(--border)" stroke-width="0.5"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="var(--green)"/>
    <text x="${cx}" y="${cy+13}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5.5" fill="var(--muted)">sweet spot</text>
    <text x="${fx+fw+5}" y="${cy-1}" font-family="Arial,sans-serif" font-size="8" font-weight="800" fill="var(--c-wood)">TOE</text>
    <text x="${fx+fw+5}" y="${cy+8}" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">→ hook</text>
    <text x="${fx-5}" y="${cy-1}" text-anchor="end" font-family="Arial,sans-serif" font-size="8" font-weight="800" fill="var(--c-iron)">HEEL</text>
    <text x="${fx-5}" y="${cy+8}" text-anchor="end" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">→ fade</text>
    <text x="${cx}" y="${fy-6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" font-weight="700" fill="var(--ink2)">HIGH → less spin</text>
    <text x="${cx}" y="${fy+fh+13}" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" font-weight="700" fill="var(--ink2)">LOW → more spin</text>
  </svg>`;
}
function buildGearEffectPanel(c){
  const toe=dpGearAxisShift(3,c.type), heel=dpGearAxisShift(-3,c.type);
  const mag=Math.abs(toe).toFixed(0);
  return `<div class="gear-panel">
    <div class="gear-title">Gear-Effect Miss Pattern <span class="proto-badge">prototype</span></div>
    <div class="gear-sub">How off-centre contact bends this shot (RH). StrongerGolf study: strike quality materially shapes ball flight — even for tournament pros. A ~3-dimple miss shifts the spin axis about <b>${mag}°</b> for this club (${c.type==='wood'?'woods gear far more than irons':'irons gear less than woods'}).</div>
    ${buildGearFaceSVG()}
    <div class="nudge-row">
      <div class="nudge-cell"><div class="nudge-val" style="color:var(--c-iron)">${toe.toFixed(0)}°</div><div class="nudge-lbl">toe → axis (draw)</div></div>
      <div class="nudge-cell"><div class="nudge-val" style="color:var(--c-wood)">+${heel.toFixed(0)}°</div><div class="nudge-lbl">heel → axis (fade)</div></div>
    </div>
  </div>`;
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildEnvPanels, buildGapping, buildGearEffectPanel, buildGearFaceSVG, buildLadder, buildMissBlock, buildSideSVG, buildTopSVG, envPanelHTML, envSyncSummary, missNote, missSelect, onEnvInput, onEnvToggle, renderConditions, setMiss, statCell, toggleDetail, updateCondSummary });
