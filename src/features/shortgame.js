// Short Game tab: Chip Shot Options dialler, chip trajectory SVG, chip matrix.

function fmtChipSlope(deg){
  const n=Math.round((parseFloat(deg)||0)*2)/2;
  if(n===0) return 'Level';
  return `${Math.abs(n)}° ${n>0?'up':'down'}`;
}
function buildShortGame(){
  const wrap=document.getElementById('shortgame-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <!-- 1. Distance slider + stimp dropdown -->
    <div class="calc-dist-block">
      <div class="calc-yardage-display">
        <div class="calc-yardage-num" id="chip-display">20</div>
        <div class="calc-yardage-label">yards total</div>
      </div>
      <div class="calc-slider-col">
        <div class="calc-slider-limits"><span>5 yd</span><span>55 yd</span></div>
        <input type="range" class="yard-slider" id="chip-slider" min="5" max="55" value="20" step="1"
          oninput="window.chipSelectedIdx=-1;document.getElementById('chip-display').textContent=this.value;document.getElementById('chip-input').value=this.value;renderChipDial()">
      </div>
      <div class="calc-manual-col">
        <label for="chip-input">Yards</label>
        <input type="number" id="chip-input" min="5" max="55" value="20"
          oninput="window.chipSelectedIdx=-1;const v=Math.max(5,Math.min(55,parseInt(this.value)||20));document.getElementById('chip-slider').value=v;document.getElementById('chip-display').textContent=v;renderChipDial()">
      </div>
      <div class="calc-manual-col" style="flex:0 0 132px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin-bottom:0">Stimp</label>
          <span class="stimp-val" id="sg-stimp-val">${STATE.stimp.toFixed(1)}</span>
        </div>
        <input type="range" id="sg-stimp" min="7" max="14" step="0.5" value="${STATE.stimp}" style="width:100%"
          oninput="STATE.stimp=parseFloat(this.value);document.getElementById('sg-stimp-val').textContent=parseFloat(this.value).toFixed(1);const _puS=document.getElementById('putt-stimp-select');if(_puS)_puS.value=this.value;renderChipDial();buildChipMatrix();saveState()">
      </div>
      <div class="calc-manual-col" style="flex:0 0 132px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin-bottom:0">Slope</label>
          <span class="stimp-val" id="chip-slope-val">Level</span>
        </div>
        <input type="range" id="chip-slope" min="-6" max="6" step="0.5" value="0" style="width:100%"
          oninput="document.getElementById('chip-slope-val').textContent=fmtChipSlope(this.value);renderChipDial();buildChipMatrix()">
        <div style="display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);margin-top:2px"><span>downhill</span><span>uphill</span></div>
      </div>
    </div>

    <!-- 1b. Plays-like adjusters -->
    <div id="ey-shortgame" class="ey-host"></div>

    <!-- 2. Expected shots -->
    <div id="es-short" class="expected-shots-strip"></div>

    <!-- 3. Trajectory (populated by renderChipDial) -->
    <div id="chip-traj-wrap"></div>

    <!-- 4. Shot options -->
    <div id="chip-results"></div>


    <!-- 6. Chip Matrix -->
    <div class="section-label">Chip Reference Matrix — Total Distance by Club &amp; Carry</div>
    <p class="intro-note" style="margin-bottom:10px">Launch = 75% of loft. Roll ratio: Low Runner 1:5 (7i) → Standard 1:2 (P) → Toss 1:1 (G) → Flop 5:1 (X). Cells show carry + rollout at current stimp and slope.</p>
    <div class="chip-matrix-wrap"><table class="chip-matrix" id="chip-matrix-table"></table></div>

    <!-- 7. Short Game Variables -->
    <div class="section-label" style="margin-top:22px">Short Game Variables</div>
    <p class="intro-note" style="margin-bottom:10px">Setup and motion choices reshape the shot's impact conditions — shaft lean, vertical path, effective loft and bounce — which flow into the launch &amp; spin of the Chip Shot Options above. Defaults match the standard chip; changes shift every club in the dial.</p>
    <div id="sg-vars-wrap"></div>`;

  buildChipMatrix();
  renderSgVars();
  /* Default selection: P wedge */
  const _clubs=chipClubs();
  const _pIdx=_clubs.findIndex(c=>c.id==='P');
  window.chipSelectedIdx=_pIdx>=0?_pIdx:-1;
  renderChipDial();
}

/* ---- Short Game Variables panel: grouped selectable options + net shot-effect readout ---- */
function renderSgVars(){
  const wrap=document.getElementById('sg-vars-wrap'); if(!wrap) return;
  const sel=sgSel();
  const effSummary=v=>{
    const o=v.opts.find(x=>x.id===sel[v.key])||v.opts.find(x=>x.id===v.def);
    if(!o||!o.eff) return '';
    const parts=[];
    if(o.eff.horizLean) parts.push(`${o.eff.horizLean>0?'+':''}${o.eff.horizLean}° lean`);
    if(o.eff.vertPath)  parts.push(`${o.eff.vertPath<0?o.eff.vertPath+'° down path':'+'+o.eff.vertPath+'° up path'}`);
    if(o.eff.vertLean)  parts.push(`${o.eff.vertLean>0?'+':''}${o.eff.vertLean}° vert lean`);
    if(o.eff.loft)      parts.push(`${o.eff.loft>0?'+':''}${o.eff.loft}° loft`);
    if(o.eff.bounce)    parts.push(`${o.eff.bounce>0?'+':''}${o.eff.bounce}° bounce`);
    return parts.length?`<div class="sgv-eff">${parts.join(' · ')}</div>`:(v.tbd?'<div class="sgv-eff sgv-tbd">effect to be defined</div>':'');
  };
  const varRow=v=>{
    const idx=Math.max(0,v.opts.findIndex(o=>o.id===sel[v.key]));
    const cur=v.opts[idx]||v.opts[0];
    const provMark=cur.prov?'<span class="sgv-prov" title="Provisional — magnitude pending calibration">·prov</span>':'';
    return `<div class="sgv-row">
      <div class="sgv-meta"><span class="sgv-label">${v.label}</span><span class="sgv-sub">${v.sub}</span></div>
      <div class="sgv-slider-row">
        <input type="range" class="sgv-range" min="0" max="${v.opts.length-1}" step="1" value="${idx}" oninput="setSgVarIdx('${v.key}',this.value)">
        <span class="sgv-cur">${cur.label}${provMark}</span>
      </div>
      ${effSummary(v)}
    </div>`;
  };
  const net=sgNet(), a=net.abs;
  const arrow=x=>x>0.05?'▲':x<-0.05?'▼':'·';
  const fmt=(x,u,d=1)=>`${x>0?'+':''}${x.toFixed(d)}${u}`;
  const provNote=net.prov?'<span class="sgv-prov" style="margin-left:6px">includes provisional values</span>':'';
  const readout=`
    <div class="sgv-readout">
      <div class="sgv-readout-head">Net Shot Effect ${provNote}</div>
      <div class="sgv-impact">
        <span>Shaft lean <b>${a.horizLean.toFixed(0)}°</b></span>
        <span>Vert path <b>${a.vertPath>0?'+':''}${a.vertPath.toFixed(0)}°</b></span>
        <span>Eff. loft <b>${a.effLoft>0?'+':''}${a.effLoft.toFixed(1)}°</b></span>
        <span>Bounce <b>${a.bounce>0?'+':''}${a.bounce.toFixed(0)}°</b></span>
      </div>
      <div class="sgv-shot">
        <div class="sgv-shot-cell"><span class="sgv-k">Effective Loft</span><span class="sgv-v">${arrow(net.dEffLoft)} ${fmt(net.dEffLoft,'°')}</span></div>
        <div class="sgv-shot-cell"><span class="sgv-k">Launch</span><span class="sgv-v">${arrow(net.dLaunch)} ${fmt(net.dLaunch,'°')}</span></div>
        <div class="sgv-shot-cell"><span class="sgv-k">Spin</span><span class="sgv-v">${arrow(net.dSpin)} ${fmt(net.dSpin,' rpm',0)}</span></div>
        <div class="sgv-shot-cell"><span class="sgv-k">Bounce</span><span class="sgv-v">${arrow(net.dBounce)} ${fmt(net.dBounce,'°')}</span></div>
      </div>
      <div class="sgv-readout-foot">vs. the standard chip (Middle · Neutral · Square · Level · Blend). <button type="button" class="sgv-reset" onclick="resetSgVars()">Reset to standard</button></div>
    </div>`;
  wrap.innerHTML=`
    <div class="sgv-cat"><div class="sgv-cat-head">Setup</div>${SG_VARS.setup.map(varRow).join('')}</div>
    <div class="sgv-cat"><div class="sgv-cat-head">Pivot &amp; Release</div>${SG_VARS.pivot.map(varRow).join('')}</div>
    ${readout}`;
}

function renderChipDial(){
  const measuredYd=parseInt(document.getElementById('chip-slider')?.value||20);
  /* Plays-like adjusters shift the effective total the dial solves for; expected-shots
     stays on the measured distance (strokes-remaining is positional). */
  const eyAdj = typeof eyTotal==='function' ? eyTotal('shortgame',measuredYd) : 0;
  const totalYd=Math.max(3, Math.round(measuredYd+eyAdj));
  if(typeof eyRefreshSummary==='function') eyRefreshSummary('shortgame');
  const stimp=STATE.stimp, slope=chipSlopeVal();
  const clubs=chipClubs();
  const results=document.getElementById('chip-results'); if(!results) return;
  if(!clubs.length){ results.innerHTML='<div class="calc-no-result">No clubs in range.</div>'; return; }

  /* Short Game Variables shift effective loft (setup + pivot choices). Applied to every
     club so the whole shot menu responds. Relative to the neutral baseline → 0 when default. */
  const sgDelta = typeof sgEffLoftDelta==='function' ? sgEffLoftDelta() : 0;

  /* compute rows for all clubs */
  let bestIdx=-1, bestDiff=999;
  const rows=clubs.map((c,i)=>{
    const loft=Math.max(10, parseFloat(c.loft)+sgDelta);
    const carry=chipCarryForTotal(totalYd,loft,stimp,slope);
    const roll=chipRollout(carry,loft,stimp,slope);
    const total=carry+roll;
    const practical = carry>=0.5 && carry<=25; /* chip range */
    const diff=Math.abs(total-totalYd);
    if(diff<bestDiff&&practical){ bestDiff=diff; bestIdx=i; }
    return {c,loft,carry,roll,total,practical};
  });

  /* which club to highlight + show SVG for */
  const displayIdx = window.chipSelectedIdx>=0 ? window.chipSelectedIdx : bestIdx;

  const typeColor=c=>c.type==='wedge'?'var(--c-wedge)':c.type==='iron'?'var(--c-iron)':c.type==='putter'?'var(--c-putter)':'var(--c-wood)';
  const cards=rows.map(({c,loft,carry,roll,total,practical},i)=>{
    const selected = i===displayIdx;
    const tc=typeColor(c);
    const note = carry<0.5 ? 'carry too short' : carry>25 ? 'pitch / full shot territory' : '';
    const noteStr = note ? ` <span style="color:var(--gold);font-size:.68rem">· ${note}</span>` : '';
    return `<div class="calc-result-card ${selected?'best':''}"
        onclick="selectChipClub(${i})" style="cursor:pointer${!practical&&!selected?';opacity:.5':''}">
      <div class="calc-card-header">
        <div class="calc-club-badge" style="color:${tc}">${c.label}<small>${c.loft}</small></div>
        <div style="flex:1;min-width:0">
          <div class="calc-swing-label" style="color:${tc}">${chipArchetype(loft)}<span style="font-family:ui-monospace,monospace;font-size:.65rem;font-weight:500;color:var(--muted)"> — </span><span style="font-family:Arial,sans-serif;font-size:1.15rem;font-weight:800;color:${selected?'var(--gold)':tc}">${carry.toFixed(1)}</span><span style="font-family:ui-monospace,monospace;font-size:.65rem;font-weight:500;color:var(--muted)"> carry · ${roll.toFixed(1)} roll · ${total.toFixed(1)} total</span>${noteStr}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  /* SVG for selected/best club — shown in traj-wrap above the cards */
  const trajWrap=document.getElementById('chip-traj-wrap');
  if(trajWrap){
    if(displayIdx>=0){
      const {c,carry,roll,loft}=rows[displayIdx];
      const effNote = Math.abs(sgDelta)>=0.5 ? ` <span style="color:var(--gold);font-weight:700">plays ${loft.toFixed(0)}° eff</span>` : '';
      trajWrap.innerHTML=`<div class="chip-svg-wrap">
        <div class="chip-svg-label" style="font-size:.8rem;font-weight:700;color:var(--ink);letter-spacing:.01em">${c.label} (${c.loft})${effNote} — carry ${carry.toFixed(1)} yd → roll ${roll.toFixed(1)} yd · launch ${(loft*0.75).toFixed(0)}° · ${chipArchetype(loft)}</div>
        ${buildChipSVG(carry,roll,loft)}
      </div>`;
    } else { trajWrap.innerHTML=''; }
  }
  results.innerHTML=cards;
  renderExpectedShots('es-short', measuredYd, 'atg');
}

function buildChipSVG(carryYd, rollYd, loftDeg){
  const W=320, H=64, PAD=10, groundY=52;
  const total=Math.max(carryYd+rollYd, 0.5);
  const scale=(W-PAD*2)/total;
  const carryPx=carryYd*scale, rollPx=rollYd*scale;
  const ballX=PAD, landX=PAD+carryPx, stopX=PAD+carryPx+rollPx;

  /* Launch angle = 75% of loft (StrongerGolf rule) */
  const launchDeg=loftDeg*0.75;
  const launchRad=launchDeg*Math.PI/180;

  /* Peak height from projectile: H = carry × tan(α)/4
     In pixels (using same scale), with min/max for readability */
  const peakH_calc=carryPx*Math.tan(launchRad)/4;
  const peakH=Math.max(6, Math.min(38, peakH_calc));

  /* Cubic bezier with correct tangent angles at launch and landing.
     Tangent at P0 → launch direction (right+up).
     Tangent at P3 → landing direction (right+down at same angle for flat ground).
     Handle length h chosen so the bezier closely matches the projectile peak. */
  const h=carryPx/3.2;
  const p1x=ballX + h*Math.cos(launchRad);
  const p1y=groundY - h*Math.sin(launchRad);
  const p2x=landX  - h*Math.cos(launchRad);
  const p2y=groundY - h*Math.sin(launchRad);
  const arcPath=`M ${ballX},${groundY} C ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${landX.toFixed(1)},${groundY}`;

  /* Bounces — higher loft = steeper landing = more vertical energy = higher/shorter bounce
     Lower loft = shallower = lower/longer skipping bounces */
  const bFactor=0.04+(launchDeg-26)/23*0.22;   /* 0.04 at 26° (7i) → ~0.26 at 49° (X) */
  const bounce1H=peakH*Math.max(0.06, bFactor);
  const bounce1W=Math.min(rollPx*0.20, 22);
  const nBounces=loftDeg>=62?1:loftDeg>=50?2:3;
  let bx=landX;
  let bouncesSVG='';
  for(let b=0;b<nBounces;b++){
    const bH=bounce1H*Math.pow(0.40, b);
    const bW=bounce1W*Math.pow(0.62, b);
    if(bH<1.8||bx+bW>stopX-3) break;
    const bEndX=bx+bW, bMidX=bx+bW/2;
    bouncesSVG+=`<path d="M ${bx.toFixed(1)},${groundY} Q ${bMidX.toFixed(1)},${(groundY-bH).toFixed(1)} ${bEndX.toFixed(1)},${groundY}" fill="none" stroke="var(--c-wedge)" stroke-width="${(1.4-b*0.2).toFixed(1)}" opacity="${(0.72-b*0.18).toFixed(2)}"/>`;
    bx=bEndX;
  }

  /* Rollout — dashed line from last bounce to stop */
  const rollLineSVG=(stopX-bx)>4
    ?`<line x1="${bx.toFixed(1)}" y1="${groundY}" x2="${stopX.toFixed(1)}" y2="${groundY}" stroke="var(--green2)" stroke-width="2" stroke-dasharray="3,2.5" opacity="0.88"/>`:'';

  /* Green surface tint behind rollout */
  const greenSurface=rollPx>3
    ?`<rect x="${landX.toFixed(1)}" y="${groundY}" width="${rollPx.toFixed(1)}" height="3" rx="1.5" fill="var(--green-pale)" opacity="0.75"/>`:'';

  /* Launch angle indicator at ball */
  const lineLen=Math.min(22, carryPx*0.28);
  const launchIndicator=carryPx>12?`
    <line x1="${ballX}" y1="${groundY}" x2="${(ballX+lineLen*Math.cos(launchRad)).toFixed(1)}" y2="${(groundY-lineLen*Math.sin(launchRad)).toFixed(1)}" stroke="var(--sky)" stroke-width="1.2" opacity="0.6"/>
    <text x="${(ballX+lineLen*Math.cos(launchRad)+3).toFixed(1)}" y="${(groundY-lineLen*Math.sin(launchRad)-1).toFixed(1)}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="var(--sky)" opacity="0.8">${launchDeg.toFixed(0)}°</text>`:'';

  /* Labels */
  const peakY=groundY-peakH;
  const carryLabel=`<text x="${landX.toFixed(1)}" y="${Math.max(7,peakY-4)}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="var(--c-wedge)">${carryYd.toFixed(1)}yd carry</text>`;
  const rollLabel=rollPx>22?`<text x="${(landX+rollPx/2).toFixed(1)}" y="${groundY+14}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="var(--green)">${rollYd.toFixed(1)}yd roll</text>`:'';

  return `<svg viewBox="0 0 ${W} ${H+10}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <line x1="${PAD-3}" y1="${groundY}" x2="${W-PAD+3}" y2="${groundY}" stroke="var(--border2)" stroke-width="1"/>
    ${greenSurface}
    ${launchIndicator}
    <path d="${arcPath}" fill="none" stroke="var(--c-wedge)" stroke-width="1.9" opacity="0.92"/>
    ${bouncesSVG}
    ${rollLineSVG}
    <circle cx="${ballX}" cy="${groundY}" r="3.2" fill="var(--ink)"/>
    <circle cx="${landX.toFixed(1)}" cy="${groundY}" r="2.5" fill="var(--c-wedge)" opacity="0.85"/>
    ${(stopX-landX)>6?`<circle cx="${stopX.toFixed(1)}" cy="${groundY}" r="2.5" fill="var(--green2)" opacity="0.92"/>`:''}
    ${carryLabel}
    ${rollLabel}
  </svg>`;
}

function buildChipMatrix(){
  const clubs=chipClubs();
  const carries=[2,3,5,8,10,15];
  const stimp=STATE.stimp, slope=chipSlopeVal();
  const typeColor=c=>c.type==='wedge'?'var(--c-wedge)':c.type==='iron'?'var(--c-iron)':c.type==='putter'?'var(--c-putter)':'var(--c-wood)';
  /* Clubs as rows, carry distances as columns */
  let html=`<thead><tr><th>Club</th>${carries.map(carry=>`<th>${carry} yd<br><span style="font-size:.42rem;font-weight:400;color:var(--muted)">carry</span></th>`).join('')}</tr></thead><tbody>`;
  clubs.forEach(c=>{
    const loft=parseFloat(c.loft);
    html+=`<tr><td style="padding-left:12px"><span style="font-family:Arial,sans-serif;font-weight:800;font-size:.95rem;color:${typeColor(c)}">${c.label}</span> <span style="font-family:ui-monospace,monospace;font-size:.6rem;font-weight:600;color:var(--ink2)">${c.loft}</span></td>`;
    carries.forEach(carry=>{
      const roll=chipRollout(carry,loft,stimp,slope);
      const total=carry+roll;
      html+=`<td><div class="chip-cell" style="color:${typeColor(c)}">${total.toFixed(1)}<small>+${roll.toFixed(1)}</small></div></td>`;
    });
    html+='</tr>';
  });
  const t=document.getElementById('chip-matrix-table'); if(t) t.innerHTML=html+'</tbody>';
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildChipMatrix, buildChipSVG, buildShortGame, fmtChipSlope, renderChipDial, renderSgVars });
