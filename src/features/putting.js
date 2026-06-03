// Putting tab: AimPoint controls, cone-of-valid-combos SVG, Expected Putts calculator.

function buildPutting(){
  const wrap=document.getElementById('putting-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <p class="intro-note">AimPoint Express. Set distance, slope grade, and break direction. Pace slider shows the cone of valid speed/line combinations.</p>
    <div class="putt-layout">
      <div class="putt-controls">
        <div class="stimp-bar" style="margin-bottom:14px">
          <label>Stimp</label>
          <div class="stimp-val" id="putt-stimp-val">${STATE.stimp.toFixed(1)}</div>
          <input type="range" min="7" max="14" step="0.5" value="${STATE.stimp}"
            oninput="STATE.stimp=parseFloat(this.value);
              document.getElementById('putt-stimp-val').textContent=STATE.stimp.toFixed(1);
              const sv=document.getElementById('sg-stimp-val');if(sv)sv.textContent=STATE.stimp.toFixed(1);
              renderPutt();saveState()">
        </div>

        <!-- Distance -->
        <div class="putt-field">
          <label style="font-size:.82rem;font-weight:700;color:var(--ink)">Distance (feet)</label>
          <input type="range" id="putt-dist" min="2" max="60" step="1" value="15"
            style="width:100%;margin-bottom:4px" oninput="document.getElementById('putt-dist-val').textContent=this.value+' ft';renderPutt();renderPuttSG();renderExpectedShots('es-putting',parseInt(this.value),'green')">
          <div id="putt-dist-val" style="font-family:Arial,sans-serif;font-size:1.4rem;font-weight:800;color:var(--ink);text-align:center">15 ft</div>
        </div>

        <!-- Grade — label below slider like distance -->
        <div class="putt-field">
          <label style="font-size:.82rem;font-weight:700;color:var(--ink)">Side Slope at Point of Influence</label>
          <input type="range" id="putt-grade" min="0" max="5" step="0.5" value="2"
            style="width:100%;margin-bottom:4px" oninput="document.getElementById('putt-grade-display').textContent=this.value;renderPutt()">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
            <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted)">0 — Flat</span>
            <div class="grade-display" id="putt-grade-display" style="font-size:1.4rem;font-weight:800;font-family:Arial,sans-serif;color:var(--ink);line-height:1">2</div>
            <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted)">5 — Extreme</span>
          </div>
        </div>

        <!-- Green Slope -->
        <div class="putt-field">
          <label style="font-size:.82rem;font-weight:700;color:var(--ink)">Green Slope</label>
          <select id="putt-slope" onchange="renderPutt()" style="font-size:.95rem;font-weight:600;color:var(--ink);width:100%;padding:7px 9px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;outline:none">
            <option value="very-uphill">⬆⬆ Very Uphill (breaks much less)</option>
            <option value="uphill">⬆ Uphill (breaks less)</option>
            <option value="level">→ Level</option>
            <option value="downhill">⬇ Downhill (breaks more)</option>
            <option value="very-downhill">⬇⬇ Very Downhill (breaks much more)</option>
          </select>
        </div>

        <!-- Break Direction -->
        <div class="putt-field">
          <label style="font-size:.82rem;font-weight:700;color:var(--ink)">Break Direction</label>
          <select id="putt-dir" onchange="renderPutt()" style="font-size:.95rem;font-weight:600;color:var(--ink);width:100%;padding:7px 9px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;outline:none">
            <option value="lr">↩ Left-to-Right</option>
            <option value="rl">↪ Right-to-Left</option>
          </select>
        </div>

        <!-- Pace -->
        <div class="putt-field">
          <label style="font-size:.82rem;font-weight:700;color:var(--ink)">Intended Pace</label>
          <input type="range" id="putt-pace" min="4" max="36" step="2" value="12"
            style="width:100%;margin-bottom:4px" oninput="document.getElementById('putt-pace-val').textContent=this.value+'\" past hole';renderPutt()">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted)">4" — dying</span>
            <div id="putt-pace-val" style="font-family:Arial,sans-serif;font-size:1.1rem;font-weight:800;color:var(--ink);line-height:1">12" past hole</div>
            <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted)">36" — firm</span>
          </div>
          <div style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);margin-top:4px;line-height:1.4">Pace = how far past the cup the ball would roll if the hole weren't there. Faster pace narrows the break; slower pace reads more slope. AimPoint standard ≈ 12".</div>
        </div>

        <div id="putt-result-wrap"></div>
      </div>
      <div class="putt-visual">
        <div id="putt-svg-wrap" style="width:100%"></div>
        <div class="putt-svg-caption" id="putt-caption"></div>
      </div>
    </div>

    <div class="section-label" style="margin-top:22px">Expected Putts — Strokes Gained Reference</div>
    <p class="intro-note">Broadie strokes-remaining data, adjusted for your handicap. Shows expected putts and SG vs scratch from any distance.</p>
    <div class="putt-sg-wrap">
      <div class="putt-sg-header">
        <div class="putt-sg-title">Expected Putts Calculator</div>
        <div class="putt-sg-sub">Drag the slider · handicap auto-filled from your profile</div>
      </div>
      <div class="putt-sg-body">
        <div class="putt-sg-result" id="psg-result-box">
          <div class="psg-putts" id="psg-putts">—</div>
          <div class="psg-putts-lbl">expected putts</div>
          <div class="psg-sg" id="psg-sg"></div>
        </div>
        <div class="putt-sg-controls">
          <div class="drv-slider-label" style="margin-top:4px"><span>Handicap</span><span class="drv-val" id="psg-hcp-val">${escapeHtml(STATE.profile.handicap||'0')}</span></div>
          <input type="range" class="drv-slider" id="psg-hcp" min="-5" max="36" step="0.5"
            value="${parseHcp(STATE.profile.handicap)||0}"
            oninput="document.getElementById('psg-hcp-val').textContent=(this.value>0?this.value:(this.value<0?'+'+Math.abs(this.value):'0'));renderPuttSG()">
          <div class="drv-slider-limits"><span>+5</span><span>36 hcp</span></div>
        </div>
      </div>
      <div class="putt-sg-chart" id="psg-chart"></div>
    </div>
    <div id="es-putting" class="expected-shots-strip"></div>`;
  renderPutt();
  renderPuttSG();
}

function renderPutt(){
  const dist=parseInt(document.getElementById('putt-dist')?.value||15);
  const grade=parseFloat(document.getElementById('putt-grade')?.value||2);
  const dir=document.getElementById('putt-dir')?.value||'lr';
  const slope=document.getElementById('putt-slope')?.value||'level';
  const pace=parseInt(document.getElementById('putt-pace')?.value||12);
  const stimp=STATE.stimp;
  const breakIn=aimBreakIn(dist,grade,stimp,slope,pace);
  const cupW=breakIn/4.25;
  const res=document.getElementById('putt-result-wrap'); if(!res) return;
  const edgeLabel=dir==='lr'?'left':'right';
  const dirWord=dir==='lr'?'Left-to-Right':'Right-to-Left';
  res.innerHTML=`
    <div class="putt-result-card">
      <h4>Required Break</h4>
      <div class="putt-stat-grid">
        <div class="putt-stat"><div class="putt-stat-val">${breakIn.toFixed(1)}"</div><div class="putt-stat-lbl">Break (inches)</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${cupW.toFixed(2)}×</div><div class="putt-stat-lbl">Cup widths</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${grade}</div><div class="putt-stat-lbl">Slope grade</div></div>
        <div class="putt-stat"><div class="putt-stat-val">${dist} ft</div><div class="putt-stat-lbl">Distance</div></div>
      </div>
      <div class="putt-aim-note">${dirWord} · aim <strong>${breakIn.toFixed(1)}"</strong> outside the <strong>${edgeLabel}</strong> edge · pace ${pace}" past hole</div>
    </div>`;
  const svgWrap=document.getElementById('putt-svg-wrap'); if(!svgWrap) return;
  svgWrap.innerHTML=buildPuttSVG(dist,breakIn,dir,slope,pace);
  const cap=document.getElementById('putt-caption'); if(cap) cap.textContent=`${dist}ft · grade ${grade} · stimp ${stimp.toFixed(1)} · ${slope} · pace ${pace}"`;
}

function renderPuttSG(){
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
  const aimPx=Math.min(78, breakIn*2.8);
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
    <text x="${((cx+aimX)/2).toFixed(1)}" y="${holeY-7}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="9" font-weight="700" fill="var(--gold2)">${breakIn.toFixed(1)}"</text>`:'';

  const slopeLabel=slope!=='level'?`<text x="10" y="${(isVeryDn||isDn)?18:H-14}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="rgba(255,255,255,0.5)">${isVeryDn?'⬇⬇ very downhill':isDn?'⬇ downhill':isVeryUp?'⬆⬆ very uphill':'⬆ uphill'}</text>`:'';

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
    <!-- cone label -->
    <text x="${(cx+sign*4).toFixed(1)}" y="${(ballY-holeY)*0.35+holeY+10}" text-anchor="${dir==='lr'?'end':'start'}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6.5" fill="rgba(244,212,122,0.7)">speed / line cone</text>
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
Object.assign(window, { buildPuttSVG, buildPutting, renderPutt, renderPuttSG });
