// Driver Optimizer — calibrated to the Foresight Sports published reference table.
// Launch window 10-14 deg; spin window narrows with ball speed; neutral AoA assumed.

/* ============================================================
   DRIVER OPTIMIZER
   Anchored to Foresight Sports optimized driver launch reference table.
   Launch 10-14° applies across all ball speeds (not speed-dependent).
   Spin window decreases with speed. Within-window carry interpolates
   between max carry (low spin) and min carry (high spin).
   Outside the window, penalties applied per 100rpm above/below range.
   Source: Foresight Sports Driver Launch Data, corroborated by
   Trackman, FlightScope, and published fitting research.
   Note: assumes neutral AoA. Positive AoA adds carry beyond model output.
   ============================================================ */
const FS_TABLE = [
  /* [bspd, spin_low (max carry), spin_high (min carry), carry_max, carry_min] */
  [100, 2500, 3500, 142, 130],
  [110, 2400, 3400, 170, 157],
  [120, 2300, 3300, 197, 183],
  [130, 2200, 3200, 223, 207],
  [140, 2110, 3100, 249, 231],
  [150, 2000, 3000, 275, 254],
  [160, 1900, 2900, 301, 276],
  [170, 1800, 2800, 325, 298],
  [180, 1700, 2700, 349, 320],
  [190, 1600, 2600, 372, 342],
  [200, 1500, 2500, 389, 360],
  [210, 1400, 2400, 408, 383],
];

function fsInterp(bspd){
  if(bspd<=FS_TABLE[0][0]) return FS_TABLE[0];
  if(bspd>=FS_TABLE[FS_TABLE.length-1][0]) return FS_TABLE[FS_TABLE.length-1];
  for(let i=0;i<FS_TABLE.length-1;i++){
    if(FS_TABLE[i][0]<=bspd&&bspd<=FS_TABLE[i+1][0]){
      const t=(bspd-FS_TABLE[i][0])/(FS_TABLE[i+1][0]-FS_TABLE[i][0]);
      return FS_TABLE[i].map((v,j)=>v+t*(FS_TABLE[i+1][j]-v));
    }
  }
  return FS_TABLE[FS_TABLE.length-1];
}

function driverCarryModel(bspd, launch, spin){
  const [,spLo,spHi,cMax,cMin] = fsInterp(bspd);
  /* Spin: within window interpolates carry; outside applies distance penalty */
  let baseCarry;
  if(spin>=spLo && spin<=spHi){
    const t=(spin-spLo)/(spHi-spLo);
    baseCarry=cMax-t*(cMax-cMin);
  } else if(spin<spLo){
    /* Below optimal — ball can balloon and drop; ~1.2yd per 100rpm under */
    baseCarry=cMax-0.012*(spLo-spin);
  } else {
    /* Above optimal — excess spin kills carry; ~1.8yd per 100rpm over */
    baseCarry=cMin-0.018*(spin-spHi);
  }
  /* Launch: optimal window 10-14°, centre 12°.
     Within window: small penalty. Outside: steeper quadratic. */
  const laDev=launch-12;
  const laPenalty=(launch>=10&&launch<=14) ? -0.3*laDev*laDev : -1.2*laDev*laDev;
  return Math.round(baseCarry+laPenalty);
}

function driverOptimalZones(bspd){
  const [,spLo,spHi,cMax,cMin] = fsInterp(bspd);
  const midSpin = Math.round((spLo+spHi)/2/50)*50;
  const midCarry = Math.round((cMax+cMin)/2);
  return {
    bestCarry: Math.round(cMax),        /* best = lowest spin in window */
    bestLaunch: 12,                     /* centre of 10-14° window */
    bestSpin: Math.round(spLo/50)*50,   /* low end = most carry */
    spinLo: Math.round(spLo/50)*50,
    spinHi: Math.round(spHi/50)*50,
    carryMax: Math.round(cMax),
    carryMin: Math.round(cMin),
  };
}

function buildDriverOptimizerHTML(){
  return `<div class="drv-opt-section">
    <div class="drv-opt-wrap">
      <div class="drv-opt-body">
        <div class="drv-result-display" id="drv-carry-display">
          <div class="drv-carry-num" id="drv-carry-num">—</div>
          <div class="drv-carry-lbl">yards carry</div>
          <div class="drv-carry-sub" id="drv-carry-sub"></div>
        </div>
        <div class="drv-controls">
          <div class="drv-slider-group">
            <div class="drv-slider-label"><span>Ball Speed</span><span class="drv-val" id="drv-bspd-val">153 mph</span></div>
            <input type="range" class="drv-slider" id="drv-bspd" min="100" max="200" step="1" value="153" oninput="updateDriverOpt()">
            <div class="drv-slider-limits"><span>100</span><span>200 mph</span></div>
          </div>
          <div class="drv-slider-group">
            <div class="drv-slider-label"><span>Launch Angle</span><span class="drv-val" id="drv-launch-val">11°</span></div>
            <input type="range" class="drv-slider" id="drv-launch" min="6" max="20" step="0.5" value="11" oninput="updateDriverOpt()">
            <div class="drv-slider-limits"><span>6°</span><span>20°</span></div>
          </div>
          <div class="drv-slider-group">
            <div class="drv-slider-label"><span>Spin Rate</span><span class="drv-val" id="drv-spin-val">2400 rpm</span></div>
            <input type="range" class="drv-slider" id="drv-spin" min="1500" max="4500" step="50" value="2400" oninput="updateDriverOpt()">
            <div class="drv-slider-limits"><span>1500</span><span>4500 rpm</span></div>
          </div>
        </div>
      </div>
      <div class="drv-opt-zones" id="drv-opt-zones"></div>
      <div class="drv-traj-wrap"><div class="drv-traj-label">Trajectory</div><div id="drv-traj-svg"></div></div>
      <div id="drv-lm-wrap" class="drv-lm-wrap">${typeof lmSectionHTML==='function'?lmSectionHTML():''}</div>
    </div></div>`;
}
function updateDriverOpt(){
  if(!document.getElementById('drv-bspd')) return;   // only present in the Driver's Stock Shots dropdown
  const bspd  = parseInt(document.getElementById('drv-bspd').value)  || 153;
  const launch= parseFloat(document.getElementById('drv-launch').value) || 11;
  const spin  = parseInt(document.getElementById('drv-spin').value)   || 2400;

  document.getElementById('drv-bspd-val').textContent   = bspd + ' mph';
  document.getElementById('drv-launch-val').textContent = launch + '°';
  document.getElementById('drv-spin-val').textContent   = spin.toLocaleString() + ' rpm';

  const carry = driverCarryModel(bspd, launch, spin);
  document.getElementById('drv-carry-num').textContent = carry;

  const opt = driverOptimalZones(bspd);
  const delta = carry - opt.bestCarry;
  const inSpinWindow = spin >= opt.spinLo && spin <= opt.spinHi;
  const inLaunchWindow = launch >= 10 && launch <= 14;
  const deltaStr = inSpinWindow && inLaunchWindow
    ? (delta >= -3 ? 'In optimal window' : delta + ' yd from peak')
    : 'Outside optimal window';
  document.getElementById('drv-carry-sub').textContent = deltaStr;
  document.getElementById('drv-carry-sub').style.color =
    inSpinWindow && inLaunchWindow ? 'var(--green)' : delta >= -10 ? 'var(--sky)' : 'var(--gold)';

  /* Zones */
  const zones = document.getElementById('drv-opt-zones');
  const laStatus = inLaunchWindow ? '✓ In window' : (launch<10?'↑ Too low':'↓ Too high');
  const spStatus = inSpinWindow ? '✓ In window' : (spin<opt.spinLo?'↓ Too low':spin>opt.spinHi?'↑ Too high':'');
  zones.innerHTML = `
    <div class="drv-zone ${inLaunchWindow?'best':'lose'}">
      <div class="drv-zone-label">Launch Window</div>
      <div class="drv-zone-val">10–14°</div>
      <div class="drv-zone-delta" style="color:${inLaunchWindow?'var(--green)':'var(--gold)'}">${laStatus} · current ${launch}°</div>
    </div>
    <div class="drv-zone ${inSpinWindow?'best':'lose'}">
      <div class="drv-zone-label">Spin Window</div>
      <div class="drv-zone-val">${opt.spinLo}–${opt.spinHi}</div>
      <div class="drv-zone-delta" style="color:${inSpinWindow?'var(--green)':'var(--gold)'}">${spStatus} · current ${spin.toLocaleString()}</div>
    </div>
    <div class="drv-zone best">
      <div class="drv-zone-label">Carry Range</div>
      <div class="drv-zone-val">${opt.carryMin}–${opt.carryMax} yd</div>
      <div class="drv-zone-delta" style="color:var(--muted)">at ${bspd} mph · Foresight ref</div>
    </div>
    <div class="drv-zone ${carry>=opt.carryMin?'best':'lose'}">
      <div class="drv-zone-label">Leaving on Table</div>
      <div class="drv-zone-val" style="color:${carry>=opt.carryMax-3?'var(--green)':carry>=opt.carryMin?'var(--sky)':'var(--gold)'}">${Math.max(0,opt.carryMax-carry)} yd</div>
      <div class="drv-zone-delta" style="color:var(--muted)">${carry>=opt.carryMax-3?'Maximised':carry>=opt.carryMin?'In range':'below window'}</div>
    </div>`;

  /* Trajectory SVG */
  const svgWrap = document.getElementById('drv-traj-svg');
  svgWrap.innerHTML = buildDriverTrajSVG(bspd, launch, spin, carry, opt);
}

function buildDriverTrajSVG(bspd, launch, spin, carry, opt){
  const W=320, H=90, PAD=10, groundY=78;
  const optCarry = opt.bestCarry;

  /* Physics-informed driver arc: drag causes asymmetric shape.
     - Ascent handle long (lazy climb under drag)
     - Descent handle short (steep 42° landing, Mark's measured average)
     - Peak lands at ~70-72% of carry, not midpoint
     Spin affects peak height but not the landing angle geometry. */
  function arcPath(c, la, sp, color, opacity){
    const spanX = W - PAD*2;
    const carryPx = PAD + spanX * (c / Math.max(c, optCarry+20));
    const span = carryPx - PAD;
    const lRad = la * Math.PI/180;
    const landRad = 42 * Math.PI/180;   /* 42° = Mark's measured landing angle */
    const spinT = Math.min(1, Math.max(0,(sp-1500)/3000));

    /* Long ascent handle → lazy climb; short descent → steep landing */
    const aH = span * (0.72 - spinT*0.06);   /* more spin = slightly shorter ascent */
    const dH = span * (0.28 + spinT*0.04);   /* more spin = slightly longer descent */

    const p1x = PAD + aH*Math.cos(lRad);
    const p1y = groundY - aH*Math.sin(lRad);
    const p2x = carryPx - dH*Math.cos(landRad);
    const p2y = groundY - dH*Math.sin(landRad);

    return `<path d="M ${PAD},${groundY} C ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${carryPx.toFixed(1)},${groundY}"
      fill="none" stroke="${color}" stroke-width="2" opacity="${opacity}" stroke-linecap="round"/>
    <circle cx="${carryPx.toFixed(1)}" cy="${groundY}" r="2.5" fill="${color}" opacity="${opacity}"/>
    <text x="${carryPx.toFixed(1)}" y="${groundY+11}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="${color}" opacity="${opacity}">${c}yd</text>`;
  }

  const currentPath = arcPath(carry, launch, spin, '#d96070', 0.92);
  const optPath = carry !== optCarry ? arcPath(optCarry, opt.bestLaunch, opt.bestSpin, '#00a84f', 0.45) : '';

  /* Launch angle indicator at ball */
  const lRad = launch * Math.PI/180;
  const liLen = 20;
  const lix = PAD + liLen*Math.cos(lRad), liy = groundY - liLen*Math.sin(lRad);

  return `<svg viewBox="0 0 ${W} ${H+12}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <line x1="${PAD-3}" y1="${groundY}" x2="${W-PAD+3}" y2="${groundY}" stroke="var(--border2)" stroke-width="1"/>
    ${optPath}
    ${currentPath}
    <line x1="${PAD}" y1="${groundY}" x2="${lix.toFixed(1)}" y2="${liy.toFixed(1)}" stroke="var(--sky)" stroke-width="1.2" opacity="0.6"/>
    <text x="${(PAD+2).toFixed(1)}" y="${(groundY-liLen*Math.sin(lRad)-3).toFixed(1)}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="var(--sky)" opacity="0.8">${launch}°</text>
    <circle cx="${PAD}" cy="${groundY}" r="3" fill="var(--c-wood)"/>
    ${optPath?`<line x1="216" y1="14" x2="228" y2="14" stroke="#00a84f" stroke-width="1.5" opacity="0.5"/><text x="230" y="17" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6.5" fill="#00a84f" opacity="0.7">Optimal</text>`:''}
    <line x1="216" y1="24" x2="228" y2="24" stroke="#d96070" stroke-width="1.5"/>
    <text x="230" y="27" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6.5" fill="#d96070">Current</text>
  </svg>`;
}


/* ============================================================
   LAUNCH-MONITOR DRIVER SESSIONS — manual entry, dated saved sessions, CSV/JSON import.
   Lives inside the Driver Optimizer (Stock Shots → Driver dropdown). Persists on STATE.lmSessions.
   ============================================================ */
const LM_BRANDS=['','Trackman 4','Trackman iO','Foresight GCQuad','Foresight GC3','Foresight GCHawk','FlightScope Mevo+','FlightScope X3','Full Swing Kit','SkyTrak+','Bushnell Launch Pro','Garmin Approach R10','Ernest Sports ES Tour','Other'];
function lmSessions(){ if(!Array.isArray(STATE.lmSessions)) STATE.lmSessions=[]; return STATE.lmSessions; }
function lmSectionHTML(){
  const ss=lmSessions(), today=new Date().toISOString().slice(0,10);
  const fld=(id,label,attrs)=>`<label class="lm-fld"><span>${label}</span><input id="lm-${id}" ${attrs}></label>`;
  const brandOpts=LM_BRANDS.map(b=>`<option value="${b}">${b||'Monitor'}</option>`).join('');
  const rows = ss.length
    ? ss.map((s,i)=>({s,i})).reverse().slice(0,8).map(({s,i})=>`<div class="lm-row">
        <div class="lm-row-nums"><b>${s.ballSpeed||'—'}</b> mph · ${s.launch||'—'}° · ${s.spin?(+s.spin).toLocaleString():'—'} rpm
          <span class="lm-row-sub">${[s.date,s.brand,s.smash?'smash '+s.smash:''].filter(Boolean).join(' · ')}</span></div>
        <div class="lm-row-btns"><button class="btn lm-mini" onclick="lmLoadSession(${i})">Load</button><button class="btn lm-mini" onclick="lmDeleteSession(${i})">✕</button></div>
      </div>`).join('')
    : `<div class="lm-empty">No sessions yet — enter your driver numbers or import a launch-monitor export (CSV / JSON).</div>`;
  return `<div class="lm-head">Launch Monitor — Driver Sessions</div>
    <div class="lm-grid">
      <label class="lm-fld"><span>Date</span><input id="lm-date" type="date" value="${today}"></label>
      <label class="lm-fld"><span>Monitor</span><select id="lm-brand">${brandOpts}</select></label>
      ${fld('bspd','Ball Speed','type="number" placeholder="mph"')}
      ${fld('launch','Launch','type="number" step="0.1" placeholder="°"')}
      ${fld('spin','Spin','type="number" placeholder="rpm"')}
      ${fld('aoa','Attack','type="number" step="0.1" placeholder="°"')}
      ${fld('path','Path','type="number" step="0.1" placeholder="°"')}
      ${fld('face','Face','type="number" step="0.1" placeholder="°"')}
      ${fld('smash','Smash','type="number" step="0.01" placeholder="1.48"')}
      <label class="lm-fld lm-wide"><span>Notes</span><input id="lm-notes" placeholder="fitter · conditions · goals"></label>
    </div>
    <div class="lm-actions">
      <button class="btn btn-accent" onclick="lmSaveSession()">Save session</button>
      <label class="btn lm-import">Import CSV / JSON<input type="file" accept=".csv,.tsv,.txt,.json" style="display:none" onchange="lmImportFile(this)"></label>
    </div>
    <div class="lm-list">${rows}</div>`;
}
function lmRenderSection(){ const w=document.getElementById('drv-lm-wrap'); if(w) w.innerHTML=lmSectionHTML(); }
function lmSaveSession(){
  const g=id=>{ const el=document.getElementById('lm-'+id); return el?String(el.value).trim():''; };
  const s={ date:g('date'), brand:g('brand'), ballSpeed:g('bspd'), launch:g('launch'), spin:g('spin'), aoa:g('aoa'), path:g('path'), face:g('face'), smash:g('smash'), notes:g('notes') };
  if(!s.ballSpeed && !s.launch && !s.spin){ if(typeof toast==='function') toast('Enter at least ball speed, launch or spin'); return; }
  lmSessions().push(s); saveState(); lmRenderSection();
  if(typeof toast==='function') toast('Session saved');
}
function lmLoadSession(i){
  const s=lmSessions()[i]; if(!s) return;
  const set=(id,v,mn,mx)=>{ const el=document.getElementById(id); const n=parseFloat(v); if(el&&!isNaN(n)) el.value=Math.max(mn,Math.min(mx,n)); };
  set('drv-bspd',s.ballSpeed,100,200); set('drv-launch',s.launch,6,20); set('drv-spin',s.spin,1500,4500);
  if(typeof updateDriverOpt==='function') updateDriverOpt();
  if(typeof toast==='function') toast('Loaded into optimizer');
}
function lmDeleteSession(i){ const ss=lmSessions(); if(i>=0&&i<ss.length){ ss.splice(i,1); saveState(); lmRenderSection(); } }
function lmImportFile(input){
  const file=input.files&&input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{ try{ lmParseImport(String(reader.result||''), file.name); }catch(e){ if(typeof toast==='function') toast('Could not parse that file'); } input.value=''; };
  reader.readAsText(file);
}
function lmMapFields(o){
  const keys={}; Object.keys(o||{}).forEach(k=>{ keys[String(k).toLowerCase().replace(/[^a-z]/g,'')]=o[k]; });
  const pick=(...names)=>{ for(const n of names){ const v=keys[n]; if(v!=null&&String(v).trim()!=='') return String(v).trim(); } return ''; };
  const rec={ bspd:pick('ballspeed','ballspeedmph','clubballspeed','ballspd'),
    launch:pick('launchangle','launch','verticallaunch','launchv','vla'),
    spin:pick('spinrate','backspin','totalspin','spin'),
    aoa:pick('attackangle','angleofattack','aoa','attack'),
    path:pick('clubpath','path'),
    face:pick('faceangle','face'),
    smash:pick('smashfactor','smash') };
  return (rec.bspd||rec.launch||rec.spin)?rec:null;
}
function lmParseImport(text,name){
  let rec=null;
  if(/\.json$/i.test(name)||/^\s*[\[{]/.test(text)){ const j=JSON.parse(text); rec=lmMapFields(Array.isArray(j)?(j[0]||{}):j); }
  else {
    const lines=text.split(/\r?\n/).filter(l=>l.trim()); if(lines.length<2){ if(typeof toast==='function') toast('No data rows found'); return; }
    const delim=lines[0].indexOf('\t')>=0?'\t':',';
    const head=lines[0].split(delim).map(h=>h.trim()), row=lines[1].split(delim), obj={};
    head.forEach((h,i)=>obj[h]=row[i]); rec=lmMapFields(obj);
  }
  if(!rec){ if(typeof toast==='function') toast('No recognised launch-monitor columns'); return; }
  ['bspd','launch','spin','aoa','path','face','smash'].forEach(k=>{ const el=document.getElementById('lm-'+k); if(el&&rec[k]) el.value=rec[k]; });
  if(typeof toast==='function') toast('Imported — review, then Save session');
}

Object.assign(window, { FS_TABLE, LM_BRANDS, buildDriverOptimizerHTML, buildDriverTrajSVG, driverCarryModel, driverOptimalZones, fsInterp, updateDriverOpt,
  lmSessions, lmSectionHTML, lmRenderSection, lmSaveSession, lmLoadSession, lmDeleteSession, lmImportFile, lmMapFields, lmParseImport });
