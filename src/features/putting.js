// Putting tab: AimPoint controls, cone-of-valid-combos SVG, Expected Putts calculator.

function buildPutting(){
  const wrap=document.getElementById('putting-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <!-- 1. Distance slider + Stimp (matches Short Game) -->
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
      <div class="calc-manual-col calc-stimp-col">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin-bottom:0">Stimp</label>
          <span class="stimp-val" id="putt-stimp-val">${STATE.stimp.toFixed(1)}</span>
        </div>
        <input type="range" id="putt-stimp" min="7" max="14" step="0.5" value="${STATE.stimp}" style="width:100%"
          oninput="STATE.stimp=parseFloat(this.value);document.getElementById('putt-stimp-val').textContent=parseFloat(this.value).toFixed(1);const _sg=document.getElementById('sg-stimp');if(_sg){_sg.value=this.value;const _v2=document.getElementById('sg-stimp-val');if(_v2)_v2.textContent=parseFloat(this.value).toFixed(1);}renderPutt();saveState()">
      </div>
    </div>

    <!-- 2. Situational Info — Break Direction · Putt Slope · Side Slope · Pace -->
    <div class="ey-panel" style="margin:12px 0 14px">
      <div class="ey-head"><span class="ey-title">Situational Info</span></div>
      <div class="ey-grid">
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Break Direction</span><span class="ey-term-val" id="putt-dir-v">↩ L → R</span></div>
          <input type="range" id="putt-dir" min="0" max="2" step="1" value="0" oninput="onPuttBreakSlider(this.value)">
        </div>
        <div class="ey-term" id="putt-slope-term">${puttSlopeTermHTML()}</div>
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Side Slope at Point of Influence</span><span class="ey-term-val" id="putt-grade-display">2%</span></div>
          <input type="range" id="putt-grade" min="0" max="5" step="0.5" value="2" oninput="onPuttGradeInput(this.value)">
        </div>
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Pace (&quot; past hole)</span><span class="ey-term-val" id="putt-pace-val">12&quot;</span></div>
          <input type="range" id="putt-pace" min="4" max="48" step="2" value="12" oninput="document.getElementById('putt-pace-val').textContent=this.value+'&quot;';renderPutt()">
        </div>
      </div>
    </div>

    <!-- 3. Expected shots strip (below Situational Info, matching Approach / Short Game) -->
    <div id="es-putting" class="expected-shots-strip"></div>

    <!-- 3b. Make % by distance — slim sparkline (outcome model, Presumed) -->
    <div id="putt-make-spark"></div>

    <!-- 4. Required Break + Side Profile (left column) · overhead break view (right) —
         the profile slots into the dead space beside the tall overhead SVG -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:start;margin-top:14px">
      <div style="flex:1;min-width:250px">
        <div id="putt-result-wrap"></div>
        <div class="putt-profile-label" style="margin-top:12px">Side Profile</div>
        <div id="putt-profile-wrap" style="width:100%"></div>
      </div>
      <div style="flex:0 0 260px">
        <div id="putt-svg-wrap" style="width:100%"></div>
      </div>
    </div>`;
  renderPutt();
  renderExpectedShots('es-putting', 15, 'green');
}
/* Putt Slope control — elevation over the putt, enterable in inches OR degrees (cross-calculated
   through the putt length). Stored value + unit live on window so the slider can be re-scaled. */
function fmtPuttSlopeDeg(deg){ const n=Math.round((parseFloat(deg)||0)*4)/4; if(n===0) return 'Level'; return `${Math.abs(n)}° ${n>0?'up':'down'}`; }
function puttSlopeTermHTML(){
  const u=window.puttSlopeUnit||'in', val=window.puttSlopeVal!=null?window.puttSlopeVal:0;
  const cfg = u==='deg' ? {min:-8,max:8,step:0.25} : {min:-60,max:60,step:1};
  const disp = u==='deg' ? fmtPuttSlopeDeg(val) : fmtSlopeElev(val);
  return `<div class="ey-term-head"><span class="ey-term-label">Putt Slope<button type="button" class="ey-unit-toggle" title="Switch inches ↔ degrees" onclick="togglePuttSlopeUnit()">${u==='deg'?'°':'in'}</button></span><span class="ey-term-val" id="putt-slope-display">${disp}</span></div>
    <input type="range" id="putt-slope" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${val}" oninput="onPuttSlopeInput(this.value)">`;
}
function onPuttSlopeInput(v){
  window.puttSlopeVal=parseFloat(v)||0;
  const u=window.puttSlopeUnit||'in';
  const d=document.getElementById('putt-slope-display');
  if(d) d.textContent = u==='deg'?fmtPuttSlopeDeg(window.puttSlopeVal):fmtSlopeElev(window.puttSlopeVal);
  renderPutt();
}
function togglePuttSlopeUnit(){
  const dist=parseInt(document.getElementById('putt-dist')?.value||15);
  const u=window.puttSlopeUnit||'in', val=window.puttSlopeVal!=null?window.puttSlopeVal:0, runIn=dist*12;
  if(u==='deg'){
    window.puttSlopeVal = Math.max(-60,Math.min(60, Math.round(runIn*Math.tan(val*Math.PI/180))));
    window.puttSlopeUnit='in';
  } else {
    window.puttSlopeVal = Math.max(-8,Math.min(8, Math.round(Math.atan(val/runIn)*180/Math.PI*4)/4));
    window.puttSlopeUnit='deg';
  }
  const term=document.getElementById('putt-slope-term'); if(term) term.innerHTML=puttSlopeTermHTML();
  renderPutt();
}
/* Elevation over the putt in INCHES (the model's native unit), from whichever unit is active. */
function puttElevIn(){
  const u=window.puttSlopeUnit||'in', val=window.puttSlopeVal!=null?window.puttSlopeVal:0;
  const dist=parseInt(document.getElementById('putt-dist')?.value||15);
  return u==='deg' ? dist*12*Math.tan(val*Math.PI/180) : val;
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
  if(PUTT_BREAKS[i][0]==='straight'){ if(g){ g.value=0; if(gd) gd.textContent='0%'; } }
  else if(g && parseFloat(g.value)===0){ g.value=2; if(gd) gd.textContent='2%'; }
  renderPutt();
}
function onPuttGradeInput(v){
  const g=parseFloat(v)||0;
  const gd=document.getElementById('putt-grade-display'); if(gd) gd.textContent=v+'%';
  const dir=document.getElementById('putt-dir'), dv=document.getElementById('putt-dir-v');
  if(dir){
    const curId=PUTT_BREAKS[_puttBreakIdx()][0];
    if(g===0 && curId!=='straight'){ dir.value=1; if(dv) dv.textContent=PUTT_BREAKS[1][1]; }
    else if(g>0 && curId==='straight'){ dir.value=0; if(dv) dv.textContent=PUTT_BREAKS[0][1]; }
  }
  renderPutt();
}

/* ---- Putting outcome model (typical good-player / +3, Presumed — refine from data) ---- */
/* Make % by putt distance (feet). */
const PUTT_MAKE_ANCHORS=[[1,99],[2,96],[3,90],[4,82],[5,74],[6,66],[8,52],[10,42],[15,28],[20,20],[25,15],[30,11],[40,7],[50,5],[60,4]];
function puttMakePct(d){
  d=Math.max(1,d); const A=PUTT_MAKE_ANCHORS;
  if(d>=A[A.length-1][0]) return A[A.length-1][1];
  for(let i=0;i<A.length-1;i++){ if(d>=A[i][0]&&d<=A[i+1][0]){ const t=(d-A[i][0])/(A[i+1][0]-A[i][0]); return Math.round(A[i][1]+t*(A[i+1][1]-A[i][1])); } }
  return A[0][1];
}
/* Typical lag leave (feet from the hole) by putt distance. */
function puttLeave(d){ return Math.round((0.3 + d*0.06)*10)/10; }
/* How far a slide-by runs past, from the chosen pace (inches past → feet of comeback). */
function puttComeback(paceIn){ return Math.round((paceIn/12)*10)/10; }
const PUTT_PACE_STD=12;   /* ~1 ft past = the assumed standard pace */

function renderPutt(){
  const dist=parseInt(document.getElementById('putt-dist')?.value||15);
  const grade=parseFloat(document.getElementById('putt-grade')?.value||2);
  const dir=puttBreakId();
  const elevIn=puttElevIn();
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
  const slopeWord=fmtSlopeElev(elevIn).toLowerCase();
  /* Outcome model (Presumed): make %, typical lag leave, and the comeback length the
     chosen pace buys if it misses — the speed-vs-line tradeoff behind the cone. */
  const makePct=puttMakePct(dist), leaveFt=puttLeave(dist), comebackFt=puttComeback(pace);
  res.innerHTML=`
    <div class="putt-result-card">
      <h4>Required Break</h4>
      <div class="putt-stat-grid">
        <div class="putt-stat"><div class="putt-stat-val">${edgeOffsetIn.toFixed(1)}"</div><div class="putt-stat-lbl">Outside edge</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${cupW.toFixed(2)}×</div><div class="putt-stat-lbl">Cup widths</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${breakIn.toFixed(1)}"</div><div class="putt-stat-lbl">Break to centre</div></div>
      </div>
      <div class="putt-stat-grid" style="margin-top:6px">
        <div class="putt-stat"><div class="putt-stat-val">${makePct}%</div><div class="putt-stat-lbl">Make (typ.)</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${leaveFt} ft</div><div class="putt-stat-lbl">Typical leave</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${comebackFt} ft</div><div class="putt-stat-lbl">Comeback @ pace</div></div>
      </div>
      <div class="putt-conditions">${dist} ft · grade ${grade}% · stimp ${stimp.toFixed(1)} · ${slopeWord} · pace ${pace}"</div>
    </div>`;
  const spark=document.getElementById('putt-make-spark'); if(spark) spark.innerHTML=buildPuttMakeSpark(dist);
  const svgWrap=document.getElementById('putt-svg-wrap'); if(!svgWrap) return;
  svgWrap.innerHTML=buildPuttSVG(dist,breakIn,dir==='straight'?'lr':dir,slopeCategoryFromElev(elevIn),pace);
  const profWrap=document.getElementById('putt-profile-wrap'); if(profWrap) profWrap.innerHTML=buildPuttProfileSVG(dist,elevIn,pace,stimp);
}

/* Slim make%-by-distance sparkline: the outcome curve with the current putt marked.
   Anchored to PUTT_MAKE_ANCHORS (typical good player, Presumed — refine from data). */
function buildPuttMakeSpark(dist){
  const W=320, H=44, PADL=8, PADR=10, PADT=8, PADB=10;
  const X=d=>PADL+(d-2)/(60-2)*(W-PADL-PADR);
  const Y=p=>PADT+(1-p/100)*(H-PADT-PADB);
  const ptArr=[];
  for(let d=2; d<=60; d+=2) ptArr.push(`${X(d).toFixed(1)},${Y(puttMakePct(d)).toFixed(1)}`);
  const pts=ptArr.join(' ');
  const area=`M ${ptArr[0]} L ${ptArr.join(' L ')} L ${X(60).toFixed(1)},${H-PADB} L ${X(2).toFixed(1)},${H-PADB} Z`;
  const mx=X(Math.max(2,Math.min(60,dist))), my=Y(puttMakePct(dist));
  const ticks=[5,10,20,30,40,50,60].map(d=>`<text x="${X(d).toFixed(1)}" y="${H-1.5}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5.5" fill="var(--muted)">${d}</text>`).join('');
  const prov=(typeof sgProv==='function')?sgProv('presumed'):'';
  return `<div class="putt-spark">
    <div class="putt-spark-head"><span>Make % by distance — typical good player</span>${prov}</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
      <path d="${area}" fill="var(--green2)" fill-opacity="0.14"/>
      <polyline points="${pts.trim()}" fill="none" stroke="var(--green)" stroke-width="1.4" opacity="0.85"/>
      <line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${mx.toFixed(1)}" y2="${H-PADB}" stroke="var(--gold2)" stroke-width="1" stroke-dasharray="2,2" opacity="0.8"/>
      <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="2.6" fill="var(--gold2)"/>
      <text x="${(mx+5).toFixed(1)}" y="${Math.max(7,my-3).toFixed(1)}" font-family="ui-monospace,monospace" font-size="7" font-weight="700" fill="var(--gold)">${puttMakePct(dist)}%</text>
      ${ticks}
    </svg>
  </div>`;
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
  /* #4 lag finish "leave" halo around the cup (long putts) + #5 explicit aim target */
  const isLag=distFt>=18, leaveFt=(typeof puttLeave==='function')?puttLeave(distFt):Math.round((0.3+distFt*0.06)*10)/10;
  const fzRx=Math.min(52,10+leaveFt*9), fzRy=Math.min(26,6+leaveFt*5);
  const finishZone = isLag ? `<ellipse cx="${cx}" cy="${holeY}" rx="${fzRx.toFixed(1)}" ry="${fzRy.toFixed(1)}" fill="rgba(120,210,150,0.12)" stroke="rgba(150,230,175,0.5)" stroke-width="1" stroke-dasharray="3,3"/><text x="${cx}" y="${(holeY+fzRy+10).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="8" fill="rgba(185,235,200,0.92)">leave ≈ ${leaveFt} ft</text>` : '';
  const aimMark = aimPx>2 ? `<circle cx="${aimX.toFixed(1)}" cy="${holeY}" r="5.5" fill="none" stroke="#f4d47a" stroke-width="2"/><text x="${aimX.toFixed(1)}" y="${(holeY-9).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="8" font-weight="700" fill="#f4d47a">aim</text>` : '';

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

  /* Break indicator line + label — shows the OUTSIDE-EDGE aim distance (break − hole radius);
     once the aim is inside the edge it reads "Inside X"". */
  const HOLE_R=2.125;
  const edgeOff=breakIn-HOLE_R;
  const isInside=edgeOff<-0.05;
  const edgeTxt=isInside?`Inside ${Math.abs(edgeOff).toFixed(1)}"`:`${Math.max(0,edgeOff).toFixed(1)}"`;
  const breakLabel=aimPx>2?`
    <line x1="${cx}" y1="${holeY}" x2="${aimX.toFixed(1)}" y2="${holeY}" stroke="var(--gold2)" stroke-width="1.6" opacity="0.75"/>
    <text x="${(cx+sign*10).toFixed(1)}" y="${holeY-20}" text-anchor="${dir==='lr'?'end':'start'}" font-family="Arial,sans-serif" font-size="${isInside?12:16}" font-weight="800" fill="var(--gold2)">${edgeTxt}</text>`:'';

  const slopeLabel='';

  return `<svg data-pz viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:14px;overflow:hidden" xmlns="http://www.w3.org/2000/svg">
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
    ${finishZone}
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
    ${aimMark}
    <!-- ball -->
    <circle cx="${cx}" cy="${ballY}" r="8.5" fill="#f5f1e8" stroke="#666" stroke-width="1"/>
    <circle cx="${cx-2.5}" cy="${ballY-2.5}" r="2.5" fill="rgba(255,255,255,0.65)"/>
    ${slopeLabel}
  </svg>`;
}



/* Side profile of the putt — ball → cup along the (tilted) green surface, with the pace overrun
   past the hole. Complements the overhead break view: shows the uphill/downhill the model reads. */
function buildPuttProfileSVG(distFt, elevIn, pace, stimp){
  const W=320, H=104, PAD=16, baseY=58;
  const ballX=PAD+4, holeX=W-PAD-46, run=holeX-ballX;
  const angleRad=Math.atan((elevIn||0)/(distFt*12)), angleDeg=angleRad*180/Math.PI;
  const risePx=Math.max(-34, Math.min(34, Math.tan(angleRad)*run*1.5));   // visual, exaggerated + capped
  const ballY=baseY+risePx/2, holeY=baseY-risePx/2;                       // uphill → hole higher (smaller y)
  const sdx=holeX-ballX, sdy=holeY-ballY, slen=Math.hypot(sdx,sdy)||1, ux=sdx/slen, uy=sdy/slen;
  const pxPerFt=run/Math.max(1,distFt), pastPx=Math.min(44,(pace/12)*pxPerFt);
  const finX=holeX+ux*pastPx, finY=holeY+uy*pastPx;

  const surface=`<line x1="${ballX}" y1="${ballY.toFixed(1)}" x2="${holeX}" y2="${holeY.toFixed(1)}" stroke="#2f9a55" stroke-width="3" stroke-linecap="round"/>`
    +`<line x1="${holeX}" y1="${holeY.toFixed(1)}" x2="${finX.toFixed(1)}" y2="${finY.toFixed(1)}" stroke="#2f9a55" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;
  const rollLine=`<line x1="${ballX}" y1="${ballY.toFixed(1)}" x2="${holeX}" y2="${holeY.toFixed(1)}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-dasharray="1,3" stroke-linecap="round"/>`;
  const overrun=pastPx>3?`<line x1="${holeX}" y1="${holeY.toFixed(1)}" x2="${finX.toFixed(1)}" y2="${finY.toFixed(1)}" stroke="#f4d47a" stroke-width="1.4" stroke-dasharray="3,3"/><circle cx="${finX.toFixed(1)}" cy="${finY.toFixed(1)}" r="3" fill="none" stroke="#f4d47a" stroke-width="1.2"/><text x="${finX.toFixed(1)}" y="${(finY-6).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" fill="#f4d47a">${pace}" past</text>`:'';
  const cup=`<line x1="${(holeX-4).toFixed(1)}" y1="${holeY.toFixed(1)}" x2="${(holeX-4).toFixed(1)}" y2="${(holeY+9).toFixed(1)}" stroke="#0c1a0c" stroke-width="1.5"/><line x1="${(holeX+4).toFixed(1)}" y1="${holeY.toFixed(1)}" x2="${(holeX+4).toFixed(1)}" y2="${(holeY+9).toFixed(1)}" stroke="#0c1a0c" stroke-width="1.5"/>`;
  const flag=`<line x1="${holeX}" y1="${holeY.toFixed(1)}" x2="${holeX}" y2="${(holeY-30).toFixed(1)}" stroke="#d0c090" stroke-width="1.3"/><polygon points="${holeX},${(holeY-30).toFixed(1)} ${holeX+11},${(holeY-25).toFixed(1)} ${holeX},${(holeY-20).toFixed(1)}" fill="var(--gold2)" opacity="0.92"/>`;
  const ball=`<circle cx="${ballX}" cy="${ballY.toFixed(1)}" r="5" fill="#f5f1e8" stroke="#666" stroke-width="1"/>`;
  const distLabel=`<text x="${((ballX+holeX)/2).toFixed(1)}" y="${H-4}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="8" fill="var(--muted)">${distFt} ft</text>`;
  const riseTxt=Math.abs(elevIn)<0.5?'level':`${fmtSlopeElev(elevIn)} · ${Math.abs(angleDeg).toFixed(1)}°`;
  const slopeLabel=`<text x="${W-6}" y="12" text-anchor="end" font-family="ui-monospace,monospace" font-size="8" font-weight="700" fill="${elevIn>0.5?'#5fcf8f':elevIn<-0.5?'#e88494':'var(--muted)'}">${riseTxt}</text>`;
  const cue=elevIn>2?'firmer — it climbs':elevIn<-2?'softer — let it release':'';
  const cueLabel=cue?`<text x="8" y="12" font-family="ui-monospace,monospace" font-size="7.5" fill="var(--muted)">${cue}</text>`:'';
  return `<svg data-pz viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="var(--surface2)" rx="10"/>
    ${surface}${rollLine}${overrun}${cup}${flag}${ball}
    ${distLabel}${slopeLabel}${cueLabel}
  </svg>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildPuttSVG, buildPuttProfileSVG, buildPuttMakeSpark, buildPutting, renderPutt, renderPuttSG, fmtSlopeElev, fmtPuttSlopeDeg, slopeCategoryFromElev, PUTT_BREAKS, puttBreakId, onPuttBreakSlider, onPuttGradeInput, puttSlopeTermHTML, onPuttSlopeInput, togglePuttSlopeUnit, puttElevIn, puttMakePct, puttLeave, puttComeback });
