// Stock Shots tab: club ladder with dual-CI dispersion, side-profile and overhead SVGs.
// Trajectory model: ascent handle 0.72, descent 0.28, 42deg landing. Overhead overlays
// fairway (loft <=23) or green (loft >23) with landing-zone ellipse.

/* ============================================================
   BAG / LADDER
   ============================================================ */
function renderConditions(){
  const b = STATE.baseline;
  ['temp','alt','hum','pres'].forEach((k,i)=>{
    const ids=['c-temp','c-alt','c-hum','c-pres'];
    const vals=[b.tempF,b.altitudeFt,b.humidity,b.pressureInHg];
    const el=document.getElementById(ids[i]);
    if(el && el.value==='') el.value = vals[i];
  });
  updateCondSummary();
}
function updateCondSummary(){
  const cur = currentConditions();
  const rhoB = airDensity(STATE.baseline), rhoC = airDensity(cur);
  const f = window.adjustOn ? (1 + STATE.densityK*(rhoB/rhoC-1)) : 1;
  const pct = (f-1)*100;
  const dir = pct>0.05?'up':pct<-0.05?'down':'';
  const sign = pct>0?'+':'';
  const el = document.getElementById('cond-summary');
  el.innerHTML = `
    <span>Air density: <b>${rhoC.toFixed(3)}</b> kg/m³</span>
    <span>Baseline: <b>${rhoB.toFixed(3)}</b> kg/m³</span>
    <span>Plays: <b class="${dir}">${window.adjustOn?sign+pct.toFixed(1)+'%':'stock'}</b></span>`;
}

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
    const dispBase=getDispersion(stock);                    /* model half-width (90% CI ≈ 1.645σ) */
    const sigma1=Math.round(dispBase*0.608*10)/10;          /* 1σ ≈ 68% lateral half-width */
    const sigma2=Math.round(sigma1*2*10)/10;                /* 2σ ≈ 95% */
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
          <span class="disp-ci-label">2σ</span>
          <span class="disp-badge" style="background:${dc.bg};color:${dc.color};border:1px solid ${dc.border}">${sigma2} L/R</span>
        </div>
        <div class="disp-badge-row">
          <span class="disp-ci-label">1σ</span>
          <span class="disp-badge disp-badge-sm" style="background:${dc.bg};color:${dc.color};border:1px solid ${dc.border};opacity:0.75">${sigma1} L/R</span>
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
  const wrap=document.getElementById('gapping-wrap');
  if(!wrap) return;
  /* Concise summary only — the per-club gap distances now render inline in the
     Club Specifications list (see buildSpecs). */
  const list=STATE.clubs.filter(c=>c.type!=='putter')
    .map(c=>({c,carry:perf(c.id)?.carry||0}))
    .filter(x=>x.carry>0)
    .sort((a,b)=>b.carry-a.carry);
  if(list.length<2){ wrap.innerHTML=''; return; }
  let gapFlags=0, overlapFlags=0;
  for(let i=0;i<list.length-1;i++){
    const gap=list[i].carry-list[i+1].carry;
    if(gap>15) gapFlags++; else if(gap<8) overlapFlags++;
  }
  wrap.innerHTML = (gapFlags||overlapFlags)
    ? `<div style="font-family:Arial,sans-serif;font-size:.74rem;color:var(--muted);padding:0 0 8px">Gapping: ${gapFlags?`<b style="color:var(--gold2,#c4427a)">${gapFlags}</b> gap${gapFlags!==1?'s':''} &gt;15 yd`:''}${gapFlags&&overlapFlags?' · ':''}${overlapFlags?`<b style="color:#d96070">${overlapFlags}</b> overlap${overlapFlags!==1?'s':''} &lt;8 yd`:''} — flagged inline below.</div>`
    : `<div style="font-family:Arial,sans-serif;font-size:.74rem;color:var(--green);padding:0 0 8px">✓ Even gapping — no gaps over 15 yd or overlaps under 8 yd.</div>`;
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
    ${c.id==='D'?buildDriverCarryNudge(p):''}
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

/* OVERHEAD DISPERSION — zoomed shot pattern centred on a typical green.
   Rather than a fan from the tee, we frame a single ~30 yd green and overlay the
   1σ / 2σ dispersion oval on its centre, so you can read at a glance how much of
   the green a stock shot holds. Lateral spread from gd(); depth a touch larger. */
function buildTopSVG(c,p){
  const W=120,H=112;
  const tc=typeHex(c.type);
  const cx=W/2, cy=H/2+3;
  function gd(y){ if(y<=100)return 3.0; if(y<=150)return 3.5+(y-100)/50*1.5; if(y<=200)return 5.0+(y-150)/50*5.0; if(y<=270)return 10.0+(y-200)/70*5.0; return 15.0; }

  const carry=p.carry||100;
  const dispYd=gd(carry);                 // ~1σ lateral half-width, yards
  const depthYd=dispYd*1.4;               // distance control runs a touch deeper than wide

  /* Fixed "typical green": 30 yd across (15 yd radius), drawn to fill the frame.
     Same yards→px scale drives the dispersion oval, so the oval grows/shrinks
     against a constant green. */
  const greenR_yd=15, greenR_px=42;
  const scale=greenR_px/greenR_yd;
  const ovW=dispYd*scale, ovH=depthYd*scale;

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
    <text x="${cx}" y="13" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" font-weight="bold" fill="var(--ink2)">${carry} yd</text>
    <circle cx="${cx}" cy="${cy}" r="${greenR_px}" fill="#00a84f" fill-opacity="0.14" stroke="#00a84f" stroke-width="1" stroke-opacity="0.55"/>
    <text x="${(cx+greenR_px*0.62).toFixed(1)}" y="${(cy-greenR_px*0.62).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5" fill="#00853F" opacity="0.65">30yd green</text>
    <ellipse cx="${cx}" cy="${cy}" rx="${(ovW*2).toFixed(1)}" ry="${(ovH*2).toFixed(1)}" fill="${tc}" fill-opacity="0.10" stroke="${tc}" stroke-opacity="0.4" stroke-width="0.8" stroke-dasharray="3,2"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${ovW.toFixed(1)}" ry="${ovH.toFixed(1)}" fill="${tc}" fill-opacity="0.30" stroke="${tc}" stroke-opacity="0.75" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="1.6" fill="var(--ink)"/>
    <text x="${cx}" y="${H-3}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="${tc}">±${dispYd.toFixed(1)} yd L/R · 1σ⁄2σ</text>
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
function buildDriverCarryNudge(p){
  const carry=p.carry||270, perDeg=2;
  const g3=Math.round(3*perDeg), g5=Math.round(5*perDeg);
  return `<div class="gear-panel">
    <div class="gear-title">Driver Carry Potential — Attack Angle <span class="proto-badge">prototype</span></div>
    <div class="gear-sub">StrongerGolf study: even skilled players average a <b>negative</b> driver attack angle (~−3°). The driver rewards hitting <b>up</b> — at the same ball speed, a positive AoA adds carry.</div>
    <div class="nudge-row">
      <div class="nudge-cell"><div class="nudge-val">${carry}</div><div class="nudge-lbl">carry now (neutral AoA)</div></div>
      <div class="nudge-cell"><div class="nudge-val" style="color:var(--green)">+${g3}</div><div class="nudge-lbl">est. yd at +3° up</div></div>
      <div class="nudge-cell"><div class="nudge-val" style="color:var(--green)">+${g5}</div><div class="nudge-lbl">est. yd at +5° up</div></div>
    </div>
    <div class="gear-sub" style="margin-top:6px">Rough estimate (~2 yd per +1° AoA at driver speed). Tune precisely in the Driver Optimizer (Diagnose → Ball Flight).</div>
  </div>`;
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildDriverCarryNudge, buildGapping, buildGearEffectPanel, buildGearFaceSVG, buildLadder, buildMissBlock, buildSideSVG, buildTopSVG, missNote, missSelect, renderConditions, setMiss, statCell, toggleDetail, updateCondSummary });
