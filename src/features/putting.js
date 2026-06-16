// Putting tab: AimPoint controls, cone-of-valid-combos SVG, Expected Putts calculator.

function buildPutting(){
  const wrap=document.getElementById('putting-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <!-- 1. Distance slider -->
    <div class="calc-dist-block">
      <div class="calc-yardage-display">
        <div class="calc-yardage-num" id="putt-dist-display">15</div>
        <div class="calc-yardage-label">feet from cup</div>
      </div>
      <div class="calc-slider-col">
        <div class="calc-slider-limits"><span>2 ft</span><span>60 ft</span></div>
        <input type="range" class="yard-slider" id="putt-dist" min="2" max="60" step="1" value="15"
          oninput="const _v=parseInt(this.value);document.getElementById('putt-dist-display').textContent=_v;document.getElementById('putt-dist-input').value=_v;renderPutt();renderExpectedShots('es-putting',_v,'green');const _p=((_v-2)/58)*100;this.style.background='linear-gradient(90deg,var(--ink) '+_p+'%,var(--bg2) '+_p+'%)'">
      </div>
      <div class="calc-manual-col">
        <label for="putt-dist-input">Feet</label>
        <input type="number" id="putt-dist-input" min="2" max="60" value="15"
          oninput="const _v=Math.max(2,Math.min(60,parseInt(this.value)||15));document.getElementById('putt-dist').value=_v;document.getElementById('putt-dist-display').textContent=_v;renderPutt();renderExpectedShots('es-putting',_v,'green')">
      </div>
    </div>

    <!-- 2. Expected shots strip -->
    <div id="es-putting" class="expected-shots-strip"></div>

    <!-- 3. Putt Read — Situational-Info-style panel (Break · Slope · Side Slope · Pace · Stimp) -->
    <div class="ey-panel" style="margin:12px 0 14px">
      <div class="ey-head"><span class="ey-title">Putt Read</span></div>
      <div class="ey-grid">
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Break</span><span class="ey-term-val" id="putt-dir-v">↩ L → R</span></div>
          <input type="range" id="putt-dir" min="0" max="2" step="1" value="0" oninput="onPuttBreakSlider(this.value)">
        </div>
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Green Slope</span><span class="ey-term-val" id="putt-slope-display">Level</span></div>
          <input type="range" id="putt-slope" min="-60" max="60" step="1" value="0" oninput="document.getElementById('putt-slope-display').textContent=fmtSlopeElev(this.value);renderPutt()">
        </div>
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Side Slope at Point of Influence</span><span class="ey-term-val" id="putt-grade-display">2</span></div>
          <input type="range" id="putt-grade" min="0" max="5" step="0.5" value="2" oninput="onPuttGradeInput(this.value)">
        </div>
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Pace (in past)</span><span class="ey-term-val" id="putt-pace-val">12&quot;</span></div>
          <input type="range" id="putt-pace" min="4" max="36" step="2" value="12" oninput="document.getElementById('putt-pace-val').textContent=this.value+'&quot;';renderPutt()">
        </div>
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Stimp</span><span class="ey-term-val" id="putt-stimp-val">${STATE.stimp.toFixed(1)}</span></div>
          <input type="range" id="putt-stimp" min="7" max="14" step="0.5" value="${STATE.stimp}" oninput="STATE.stimp=parseFloat(this.value);document.getElementById('putt-stimp-val').textContent=parseFloat(this.value).toFixed(1);const _sg=document.getElementById('sg-stimp');if(_sg){_sg.value=this.value;const _v2=document.getElementById('sg-stimp-val');if(_v2)_v2.textContent=parseFloat(this.value).toFixed(1);}renderPutt();saveState()">
        </div>
      </div>
    </div>

    <!-- 4. Required Break card (left) · Putt SVG (right) -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:start">
      <div style="flex:1;min-width:220px">
        <div id="putt-result-wrap"></div>
      </div>
      <div style="flex:0 0 260px">
        <div id="putt-svg-wrap" style="width:100%"></div>
      </div>
    </div>`;
  renderPutt();
  renderExpectedShots('es-putting', 15, 'green');
}

/* Green-slope slider helpers (continuous elevation, inches; + = uphill, − = downhill) */
function fmtSlopeElev(inches){
  const n=Math.round(parseFloat(inches)||0);
  if(n===0) return 'Level';
  const dir=n>0?'up':'down', a=Math.abs(n);
  const ft=Math.floor(a/12), inch=a%12;
  const mag = ft>0 ? (inch>0?`${ft}'${inch}"`:`${ft} ft`) : `${a}"`;
  return `${mag} ${dir}`;
}
function slopeCategoryFromElev(e){
  e=parseFloat(e)||0;
  if(e>=45) return 'very-uphill';
  if(e>=15) return 'uphill';
  if(e<=-45) return 'very-downhill';
  if(e<=-15) return 'downhill';
  return 'level';
}
/* Break ⇄ Side Slope interlock: Straight zeroes the grade, and grade 0 ⇒ Straight. */
/* Break is a 3-stop slider: L→R (0) · Straight (1) · R→L (2). */
const PUTT_BREAKS=[['lr','↩ L → R'],['straight','↑ Straight'],['rl','↪ R → L']];
const _puttBreakIdx=()=>{ const d=document.getElementById('putt-dir'); return d?Math.max(0,Math.min(2,Math.round(parseFloat(d.value)||0))):0; };
function puttBreakId(){ return PUTT_BREAKS[_puttBreakIdx()][0]; }
function onPuttBreakSlider(idx){
  const i=Math.max(0,Math.min(2,Math.round(parseFloat(idx)||0)));
  const lbl=document.getElementById('putt-dir-v'); if(lbl) lbl.textContent=PUTT_BREAKS[i][1];
  const g=document.getElementById('putt-grade'), gd=document.getElementById('putt-grade-display');
  /* Straight zeroes the side slope, and vice-versa */
  if(PUTT_BREAKS[i][0]==='straight'){ if(g){ g.value=0; if(gd) gd.textContent='0'; } }
  else if(g && parseFloat(g.value)===0){ g.value=2; if(gd) gd.textContent='2'; }
  renderPutt();
}
function onPuttGradeInput(v){
  const g=parseFloat(v)||0;
  const gd=document.getElementById('putt-grade-display'); if(gd) gd.textContent=v;
  const dir=document.getElementById('putt-dir'), dv=document.getElementById('putt-dir-v');
  if(dir){
    const curId=PUTT_BREAKS[_puttBreakIdx()][0];
    if(g===0 && curId!=='straight'){ dir.value=1; if(dv) dv.textContent=PUTT_BREAKS[1][1]; }
    else if(g>0 && curId==='straight'){ dir.value=0; if(dv) dv.textContent=PUTT_BREAKS[0][1]; }
  }
  renderPutt();
}

function renderPutt(){
  const dist=parseInt(document.getElementById('putt-dist')?.value||15);
  const grade=parseFloat(document.getElementById('putt-grade')?.value||2);
  const dir=puttBreakId();
  const elevIn=parseFloat(document.getElementById('putt-slope')?.value||0);
  const pace=parseInt(document.getElementById('putt-pace')?.value||12);
  const stimp=STATE.stimp;
  const breakIn=aimBreakIn(dist,grade,stimp,elevIn,pace);
  /* Break is measured to the hole CENTRE. The actionable aim is outside the EDGE, so
     deduct the hole radius (2.125" = 4.25" dia ÷ 2). Cup Widths counts cups outside the
     real cup's edge → (breakIn − radius) / 4.25, not breakIn / 4.25. */
  const HOLE_R=2.125;
  const edgeOffsetIn=Math.max(0,breakIn-HOLE_R);
  const cupW=edgeOffsetIn/4.25;
  const res=document.getElementById('putt-result-wrap'); if(!res) return;
  const edgeLabel=dir==='rl'?'right':'left';
  const dirWord=dir==='straight'?'Straight':dir==='lr'?'Left-to-Right':'Right-to-Left';
  let aimNote;
  if(dir==='straight'||grade<=0||breakIn<0.1){
    aimNote='Dead straight — aim at centre';
  } else if(breakIn<=HOLE_R){
    aimNote=`${dirWord} — aim inside the ${edgeLabel} edge · ${breakIn.toFixed(1)}" from centre`;
  } else {
    aimNote=`${dirWord} · aim <strong>${edgeOffsetIn.toFixed(1)}"</strong> outside the <strong>${edgeLabel}</strong> edge`;
  }
  const slopeWord=fmtSlopeElev(elevIn).toLowerCase();
  res.innerHTML=`
    <div class="putt-result-card">
      <h4>Required Break</h4>
      <div class="putt-aim-note">${aimNote}</div>
      <div class="putt-stat-grid">
        <div class="putt-stat"><div class="putt-stat-val">${edgeOffsetIn.toFixed(1)}"</div><div class="putt-stat-lbl">Outside edge</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${cupW.toFixed(2)}×</div><div class="putt-stat-lbl">Cup widths</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${breakIn.toFixed(1)}"</div><div class="putt-stat-lbl">Break to centre</div></div>
      </div>
      <div class="putt-conditions">${dist} ft · grade ${grade} · stimp ${stimp.toFixed(1)} · ${slopeWord} · pace ${pace}"</div>
    </div>`;
  const svgWrap=document.getElementById('putt-svg-wrap'); if(!svgWrap) return;
  svgWrap.innerHTML=buildPuttSVG(dist,breakIn,dir==='straight'?'lr':dir,slopeCategoryFromElev(elevIn),pace);
}

function renderPuttSG(){
  if(!document.getElementById('psg-putts')) return;
  const dist=parseInt(document.getElementById('putt-dist')?.value||document.getElementById('psg-dist')?.value||15);
  const hcpSlider=parseFloat(document.getElementById('psg-hcp')?.value||0);
  /* slider is inverted: negative slider = positive handicap (scratch+) */
  const hcp=-hcpSlider;  /* slider left=+5 (low hcp), slider right=36 (high hcp) */

  // dist driven by putt-dist slider

  const sr=srForPlayer('green',dist,hcp);
  const scratchSR=srInterp('green',dist);
  if(sr==null) return;

  /* SG vs scratch: how many strokes vs scratch golfer from same distance */
  const sgVsScratch=(scratchSR-sr).toFixed(2);
  const sgSign=sgVsScratch>=0?'+':'';

  document.getElementById('psg-putts').textContent=sr.toFixed(2);
  const sgEl=document.getElementById('psg-sg');
  const sgColor=parseFloat(sgVsScratch)>=0?'var(--green)':'var(--gold)';
  sgEl.innerHTML=`<span style="color:${sgColor};font-family:Arial,sans-serif;font-size:1rem;font-weight:800">${sgSign}${sgVsScratch}</span> <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted)">SG vs scratch</span>`;

  /* Build a mini bar chart across key distances */
  const chartDists=[3,5,8,10,15,20,25,30,40,50,60,75,100];
  const chart=document.getElementById('psg-chart'); if(!chart) return;
  const maxSR=srForPlayer('green',100,hcp)||3.5;
  const bars=chartDists.map(d=>{
    const v=srForPlayer('green',d,hcp);
    if(v==null) return '';
    const pct=Math.round((v/maxSR)*100);
    const isActive=d===dist||(dist>d&&dist<(chartDists[chartDists.indexOf(d)+1]||999));
    const col=isActive?'var(--gold2)':'var(--border2)';
    const textCol=isActive?'var(--gold)':'var(--muted)';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="font-family:Arial,sans-serif;font-size:.7rem;font-weight:700;color:${textCol}">${v.toFixed(1)}</div>
      <div style="width:100%;background:var(--bg2);border-radius:3px;height:60px;display:flex;align-items:flex-end;padding:0 1px">
        <div style="width:100%;height:${pct}%;background:${col};border-radius:2px;transition:height .3s"></div>
      </div>
      <div style="font-family:ui-monospace,monospace;font-size:.42rem;color:${textCol};white-space:nowrap">${d}ft</div>
    </div>`;
  }).join('');
  chart.innerHTML=`<div style="display:flex;gap:3px;align-items:flex-end;padding:10px 14px 12px">${bars}</div>`;
}

function buildPuttSVG(distFt,breakIn,dir,slope,pace){
  const W=260,H=360,cx=W/2,ballY=H-38,holeY=62;
  pace=pace||12;
  /* Scale: inner hole circle r=9.5px, real hole radius=2.125", so 9.5/2.125 px per inch */
  const aimPx=Math.min(78, breakIn*(9.5/2.125));
  const sign=dir==='lr'?-1:1;
  const aimX=cx+sign*aimPx;

  /* Central path bezier */
  const dxAim=aimX-cx, dyAim=holeY-ballY;
  const aimDist=Math.sqrt(dxAim*dxAim+dyAim*dyAim)||1;
  const hLen=(ballY-holeY)*0.36;
  const p1x=cx+(dxAim/aimDist)*hLen, p1y=ballY+(dyAim/aimDist)*hLen;
  const p2x=cx+sign*aimPx*0.18,       p2y=holeY+(ballY-holeY)*0.22;
  const pathD=`M ${cx},${ballY} C ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${cx},${holeY}`;

  /* Cone of valid speed/line combinations:
     Faster pace → narrower valid aim band (break 20% less → aimPx * 0.80)
     Slower pace → wider valid aim band (break 20% more → aimPx * 1.20)
     Cup effective width ≈ 4.25" diameter. At pace extremes, entry angle changes.
     We draw two flanking paths representing the edges of the makeable cone. */
  const slowAimPx=Math.min(82, aimPx*1.22); /* more break — aim wider */
  const fastAimPx=Math.max(0,  aimPx*0.78); /* less break — aim tighter */

  function conePath(aX){
    const dx=aX-cx, dy=holeY-ballY;
    const ad=Math.sqrt(dx*dx+dy*dy)||1;
    const cp1x=cx+(dx/ad)*hLen, cp1y=ballY+(dy/ad)*hLen;
    const cp2x=cx+sign*(Math.abs(aX-cx))*0.18, cp2y=holeY+(ballY-holeY)*0.22;
    return `M ${cx},${ballY} C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${cx},${holeY}`;
  }
  const slowX=cx+sign*slowAimPx, fastX=cx+sign*fastAimPx;
  const slowPath=conePath(slowX), fastPath=conePath(fastX);

  /* Slope gradient — stronger for very-uphill/downhill */
  const isVeryUp=slope==='very-uphill', isUp=slope==='uphill';
  const isVeryDn=slope==='very-downhill', isDn=slope==='downhill';
  const gradOp=isVeryUp||isVeryDn?'0.16':isUp||isDn?'0.09':'0';
  const gradDark=(isVeryDn||isDn)?'0%':'100%';
  const gradLight=(isVeryDn||isDn)?'100%':'0%';

  /* Break indicator line and label */
  const breakLabel=aimPx>2?`
    <line x1="${cx}" y1="${holeY}" x2="${aimX.toFixed(1)}" y2="${holeY}" stroke="var(--gold2)" stroke-width="1.6" opacity="0.75"/>
    <text x="${(cx+sign*10).toFixed(1)}" y="${holeY-20}" text-anchor="${dir==='lr'?'end':'start'}" font-family="Arial,sans-serif" font-size="16" font-weight="800" fill="var(--gold2)">${breakIn.toFixed(1)}"</text>`:'';

  const slopeLabel='';

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:14px;overflow:hidden" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="gg${dir}" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stop-color="#1a6a3a"/>
        <stop offset="100%" stop-color="#0f4a22"/>
      </radialGradient>
      <linearGradient id="sg${dir}" x1="0" y1="${gradLight}" x2="0" y2="${gradDark}">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="${gradOp}"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="${gradOp}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#gg${dir})"/>
    <rect width="${W}" height="${H}" fill="url(#sg${dir})"/>
    ${Array.from({length:10},(_,i)=>`<line x1="0" y1="${35+i*32}" x2="${W}" y2="${35+i*32}" stroke="#fff" stroke-width="0.5" opacity="0.04"/>`).join('')}
    <!-- cone of valid speed/line combos (shaded band) -->
    <path d="${slowPath}" fill="none" stroke="rgba(244,212,122,0.28)" stroke-width="6" stroke-linecap="round"/>
    <path d="${fastPath}" fill="none" stroke="rgba(244,212,122,0.28)" stroke-width="6" stroke-linecap="round"/>
    <!-- cone edge paths -->
    <path d="${slowPath}" fill="none" stroke="rgba(244,212,122,0.45)" stroke-width="1" stroke-dasharray="4,3" stroke-linecap="round"/>
    <path d="${fastPath}" fill="none" stroke="rgba(244,212,122,0.45)" stroke-width="1" stroke-dasharray="4,3" stroke-linecap="round"/>
    <!-- aim dashed line -->
    <line x1="${cx}" y1="${ballY}" x2="${aimX.toFixed(1)}" y2="${holeY}" stroke="#f4d47a" stroke-width="1.4" stroke-dasharray="5,4" opacity="0.5"/>
    ${breakLabel}
    <!-- central ball path -->
    <path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="2.2" stroke-linecap="round"/>
    <!-- cup -->
    <circle cx="${cx}" cy="${holeY}" r="14" fill="#0c1a0c" stroke="#1e3a1e" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${holeY}" r="9.5" fill="#060c06"/>
    <!-- flagstick + flag -->
    <line x1="${cx}" y1="${holeY}" x2="${cx}" y2="${holeY-30}" stroke="#d0c090" stroke-width="1.3"/>
    <polygon points="${cx},${holeY-30} ${cx+11},${holeY-25} ${cx},${holeY-20}" fill="var(--gold2)" opacity="0.92"/>
    <!-- ball -->
    <circle cx="${cx}" cy="${ballY}" r="8.5" fill="#f5f1e8" stroke="#666" stroke-width="1"/>
    <circle cx="${cx-2.5}" cy="${ballY-2.5}" r="2.5" fill="rgba(255,255,255,0.65)"/>
    ${slopeLabel}
  </svg>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildPuttSVG, buildPutting, renderPutt, renderPuttSG, fmtSlopeElev, slopeCategoryFromElev, PUTT_BREAKS, puttBreakId, onPuttBreakSlider, onPuttGradeInput });
