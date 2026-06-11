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
    const dc=dispColor(dispBase);
    const totalYd=p.total||stock;
    const pct1=totalYd>0?Math.round(sigma1/totalYd*1000)/10:0;  /* lateral miss as % of total yardage */
    const pct2=totalYd>0?Math.round(sigma2/totalYd*1000)/10:0;
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
          <span class="disp-badge" style="background:${dc.bg};color:${dc.color};border:1px solid ${dc.border}">${sigma2} L/R <span style="opacity:.6;font-weight:600">${pct2}%</span></span>
        </div>
        <div class="disp-badge-row">
          <span class="disp-ci-label">1σ</span>
          <span class="disp-badge disp-badge-sm" style="background:${dc.bg};color:${dc.color};border:1px solid ${dc.border};opacity:0.75">${sigma1} L/R <span style="opacity:.6;font-weight:600">${pct1}%</span></span>
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
/* Lateral Dispersion Check — flag clubs whose lateral miss (% of total yardage)
   runs more than THRESH percentage points off the rest of the set. Starting
   heuristic; becomes meaningful once per-club measured lateral data is entered. */
function buildLateralGapping(){
  const wrap=document.getElementById('lateral-analysis-wrap');
  if(!wrap) return;
  const THRESH=3; /* percentage points vs the rest of the set */
  const list=STATE.clubs.filter(c=>c.type!=='putter').map(c=>{
    const p=perf(c.id); const carry=p.carry||0; const total=p.total||carry;
    if(carry<=0||total<=0) return null;
    const sigma2=getDispersion(carry)*0.608*2;        /* 2σ lateral half-width (yd) */
    return {c, pct: sigma2/total*100};
  }).filter(Boolean);
  if(list.length<3){ wrap.innerHTML=`<p class="intro-note" style="margin:0">Add carry &amp; total for at least three clubs to compare lateral dispersion across the set.</p>`; return; }
  let flags='';
  list.forEach(x=>{
    const others=list.filter(o=>o!==x);
    const avg=others.reduce((s,o)=>s+o.pct,0)/others.length;
    const dev=x.pct-avg;
    if(Math.abs(dev)>THRESH){
      const wide=dev>0;
      const col=wide?'#d96070':'#1a5aaa';
      const bg=wide?'rgba(214,96,112,.12)':'rgba(26,90,122,.10)';
      flags+=`<div style="display:flex;align-items:center;gap:10px;padding:7px 11px;background:${bg};border-radius:9px;margin-bottom:6px">
        <span style="font-family:Arial,sans-serif;font-weight:800;font-size:.9rem;color:var(--ink);flex:1">${x.c.label}<span style="font-family:ui-monospace,monospace;font-size:.56rem;color:var(--muted);margin-left:6px">${x.c.loft}</span></span>
        <span style="font-family:ui-monospace,monospace;font-weight:700;font-size:.82rem;color:${col}">${x.pct.toFixed(1)}%<span style="font-weight:400;font-size:.6rem;color:var(--muted)"> 2σ</span></span>
        <span style="font-family:ui-monospace,monospace;font-weight:700;font-size:.64rem;letter-spacing:.03em;color:${col};background:var(--bg2);border-radius:20px;padding:2px 9px">${wide?'+':''}${dev.toFixed(1)} pp · ${wide?'wider':'tighter'}</span>
      </div>`;
    }
  });
  const setAvg=list.reduce((s,o)=>s+o.pct,0)/list.length;
  const head=`<div style="font-family:Arial,sans-serif;font-size:.74rem;color:var(--muted);padding:0 0 8px">Lateral miss as % of total yardage (2σ). Set average <b style="color:var(--ink2)">${setAvg.toFixed(1)}%</b>. Flags any club more than ${THRESH} pp from the rest of the set.</div>`;
  wrap.innerHTML = head + (flags || `<div style="font-family:Arial,sans-serif;font-size:.78rem;color:var(--green);padding:2px 0">✓ Every club is within ${THRESH} pp of the set — no lateral outliers.</div>`);
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
      ${statCell('Carry',p.carry,'yards','hl-carry')}
      ${statCell('Total',p.total||'—','yards','')}
      ${statCell('Ball Speed',p.bspd,'mph','hl-speed')}
      ${statCell('Club Speed',p.cspd,'mph','hl-speed')}
      ${statCell('Vert. Launch',(p.launch!=null?p.launch+'°':'—'),'degrees','')}
      ${statCell('Spin Rate',(p.spin!=null?p.spin.toLocaleString():'—'),'rpm','hl-spin')}
      ${statCell('Max Height',p.ht,'feet','')}
      ${statCell('Land Angle',(p.land!=null?p.land+'°':'—'),'degrees','hl-land')}
    </div>
    <div id="es-bag-${c.id}" class="expected-shots-strip"></div>
    <div class="flight-wrap">
      <div class="flight-row">
        <div class="flight-col-main"><div class="flight-label">Trajectory &amp; Rollout</div><div class="flight-svg-wrap">${buildSideSVG(c,p)}</div></div>
        <div class="flight-col-top"><div class="flight-label">Overhead — Dispersion</div><div class="flight-svg-wrap">${buildTopSVG(c,p)}</div></div>
      </div>
    </div>
    ${buildMissBlock(c)}
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

/* OVERHEAD DISPERSION — true geometric cone angle */
function buildTopSVG(c,p){
  const W=120,H=108,PAD_B=12,PAD_T=10,PAD_S=8;
  const tc=typeHex(c.type);
  const ox=W/2, oy=H-PAD_B, drawH=oy-PAD_T;
  function gd(y){ if(y<=100)return 3.0; if(y<=150)return 3.5+(y-100)/50*1.5; if(y<=200)return 5.0+(y-150)/50*5.0; if(y<=270)return 10.0+(y-200)/70*5.0; return 15.0; }

  const pr=STATE.partials[c.id];
  const carry=p.carry||100;
  const dists=pr?[pr.full,pr.tq,pr.half]:[carry,Math.round(carry*0.66),Math.round(carry*0.33)];
  const fullDist=dists[0], halfDist=dists[2];

  const availHW=(W/2)-PAD_S;
  const fullDisp=gd(fullDist);
  const halfAngle=Math.atan2(fullDisp, fullDist);
  const toY=d=>oy-(d/fullDist)*drawH;
  const toHW=d=>Math.min(availHW, Math.tan(halfAngle)*((d/fullDist)*drawH));
  const fullY=toY(fullDist), fullHW=toHW(fullDist);
  const halfY=toY(halfDist), halfHW=toHW(halfDist);

  const loftDeg=parseFloat(c.loft)||99;
  const showPartialTick = loftDeg > 31;
  const cone=`${ox},${oy} ${(ox-fullHW).toFixed(1)},${fullY.toFixed(1)} ${(ox+fullHW).toFixed(1)},${fullY.toFixed(1)}`;
  const gid='disp_'+c.id;

  /* Background: fairway for long clubs (loft ≤ 23°), green for irons/wedges (loft > 23°)
     Average fairway width ≈ 40 yards. Average green diameter ≈ 30 yards.
     We scale the background so its width matches the dispersion context. */
  const isLong = loftDeg <= 23;  /* D, F, H, U */
  let bgElem='';
  if(isLong){
    /* Fairway: 30yd wide, scaled using the same px/yd as the dispersion cone */
    const fwyScale=fullHW/fullDisp;                          // px per yard at full distance
    const fwyHW=Math.min(availHW, 15*fwyScale);              // 15yd = half of 30yd fairway
    const fwyX=ox-fwyHW;
    bgElem=`
      <rect x="0" y="${PAD_T}" width="${W}" height="${drawH}" fill="#00853F" rx="3"/>
      <rect x="${fwyX.toFixed(1)}" y="${PAD_T}" width="${(fwyHW*2).toFixed(1)}" height="${drawH}" fill="#00a84f" rx="3"/>
      <text x="${W/2}" y="${PAD_T+7}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5" fill="rgba(255,255,255,0.5)">fairway 30yd wide</text>`;
  } else {
    /* Green: circle with 10yd radius, same px/yd scale as cone */
    const gScale=fullHW/fullDisp;
    const gR=Math.min(availHW-2, 10*gScale);                 // 10yd radius
    const gCy=fullY+(oy-fullY)*0.3;
    bgElem=`
      <rect x="0" y="${PAD_T}" width="${W}" height="${drawH}" fill="#0a5a2a" rx="3"/>
      <ellipse cx="${ox}" cy="${gCy.toFixed(1)}" rx="${gR.toFixed(1)}" ry="${gR.toFixed(1)}" fill="#00a84f"/>
      <ellipse cx="${ox}" cy="${gCy.toFixed(1)}" rx="${(gR*0.55).toFixed(1)}" ry="${(gR*0.55).toFixed(1)}" fill="rgba(255,255,255,0.08)"/>
      <text x="${W/2}" y="${PAD_T+7}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5" fill="rgba(255,255,255,0.5)">green r=10yd</text>`;
    /* Landing zone ellipse — depth variance ±~6yd shown proportionally */
    const lz_x=fullHW*0.7;
    const lz_y=drawH*0.12;
    bgElem+=`<ellipse cx="${ox}" cy="${fullY.toFixed(1)}" rx="${lz_x.toFixed(1)}" ry="${lz_y.toFixed(1)}" fill="${tc}" opacity="0.18"/>
      <text x="${ox}" y="${(fullY+lz_y+8).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5" fill="${tc}" opacity="0.8">landing zone</text>`;
  }

  const edges=`
    <line x1="${ox}" y1="${oy}" x2="${(ox-fullHW).toFixed(1)}" y2="${fullY.toFixed(1)}" stroke="${tc}" stroke-width="1" opacity="0.7"/>
    <line x1="${ox}" y1="${oy}" x2="${(ox+fullHW).toFixed(1)}" y2="${fullY.toFixed(1)}" stroke="${tc}" stroke-width="1" opacity="0.7"/>`;
  const target=`<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${fullY.toFixed(1)}" stroke="rgba(255,255,255,0.5)" stroke-width="0.7" stroke-dasharray="3,3"/>`;
  const angleDeg=(halfAngle*180/Math.PI).toFixed(1);
  const angleLabel=`<text x="${ox}" y="${oy+11}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5.5" fill="${tc}" opacity="0.9">${angleDeg}° L/R</text>`;

  function tick(dist,yPos,hw,label,dispYd,bold,labelSide){
    const lx = labelSide==='right' ? (ox+hw+2).toFixed(1) : (ox-hw-2).toFixed(1);
    const la = labelSide==='right' ? 'start' : 'end';
    const yx = ox;
    return `<line x1="${(ox-hw).toFixed(1)}" y1="${yPos.toFixed(1)}" x2="${(ox+hw).toFixed(1)}" y2="${yPos.toFixed(1)}" stroke="rgba(255,255,255,0.8)" stroke-width="${bold?'0.9':'0.5'}"/>
    <text x="${lx}" y="${(yPos+3).toFixed(1)}" text-anchor="${la}" font-family="ui-monospace,monospace" font-size="${bold?'6':'5'}" fill="rgba(255,255,255,${bold?'0.95':'0.7'})" font-weight="${bold?'bold':'normal'}">${dispYd.toFixed(1)} L/R</text>
    <text x="${yx}" y="${(yPos-2).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5" fill="rgba(255,255,255,0.65)">${label}</text>`;
  }

  const ticks=[
    tick(fullDist, fullY, fullHW, fullDist+'yd', fullDisp, true),
    ...(showPartialTick?[tick(halfDist, halfY, halfHW, halfDist+'yd', gd(halfDist), false, 'right')]:[])
  ].join('');

  return `<svg viewBox="0 0 ${W} ${H+14}" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="${tc}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${tc}" stop-opacity="0.10"/>
      </linearGradient>
      <clipPath id="cone_${c.id}"><polygon points="${cone}"/></clipPath>
    </defs>
    ${bgElem}
    <polygon points="${cone}" fill="url(#${gid})" clip-path="url(#cone_${c.id})"/>
    ${edges}${target}${ticks}${angleLabel}
    <circle cx="${ox}" cy="${oy}" r="2.5" fill="${tc}"/>
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
      <div class="nudge-cell"><div class="nudge-val" style="color:var(--green)">+${g3}</div><div class="nudge-lbl">est. yds at +3° up</div></div>
      <div class="nudge-cell"><div class="nudge-val" style="color:var(--green)">+${g5}</div><div class="nudge-lbl">est. yds at +5° up</div></div>
    </div>
    <div class="gear-sub" style="margin-top:6px">Rough estimate (~2 yds per +1° AoA at driver speed). Tune precisely in the Driver Optimizer (Diagnose → Ball Flight).</div>
  </div>`;
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildDriverCarryNudge, buildGapping, buildLateralGapping, buildGearEffectPanel, buildGearFaceSVG, buildLadder, buildMissBlock, buildSideSVG, buildTopSVG, missNote, missSelect, renderConditions, setMiss, statCell, toggleDetail, updateCondSummary });
