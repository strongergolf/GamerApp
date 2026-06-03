// Short Game tab: Chip Shot Options dialler, chip trajectory SVG, chip matrix.

function buildShortGame(){
  const wrap=document.getElementById('shortgame-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <!-- 1. Distance slider -->
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
        <label for="chip-input">Type yards</label>
        <input type="number" id="chip-input" min="5" max="55" value="20"
          oninput="window.chipSelectedIdx=-1;const v=Math.max(5,Math.min(55,parseInt(this.value)||20));document.getElementById('chip-slider').value=v;document.getElementById('chip-display').textContent=v;renderChipDial()">
      </div>
    </div>

    <!-- 2. Expected shots -->
    <div id="es-short" class="expected-shots-strip"></div>

    <!-- 3. Trajectory (populated by renderChipDial) -->
    <div id="chip-traj-wrap"></div>

    <!-- 4. Shot options -->
    <div id="chip-results"></div>

    <!-- 5. Stimp / Slope -->
    <div class="stimp-bar" style="margin-top:18px">
      <label>Stimp</label>
      <div class="stimp-val" id="sg-stimp-val">${STATE.stimp.toFixed(1)}</div>
      <input type="range" min="7" max="14" step="0.5" value="${STATE.stimp}"
        oninput="STATE.stimp=parseFloat(this.value);document.getElementById('sg-stimp-val').textContent=STATE.stimp.toFixed(1);renderChipDial();buildChipMatrix();saveState()">
      <label>Slope</label>
      <select id="chip-slope" onchange="renderChipDial();buildChipMatrix()"
        style="font-family:Arial,sans-serif;font-size:.9rem;font-weight:700;padding:5px 9px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;color:var(--ink);outline:none">
        <option value="level">→ Level</option>
        <option value="uphill">⬆ Uphill</option>
        <option value="downhill">⬇ Downhill</option>
      </select>
    </div>

    <!-- 6. Chip Matrix -->
    <div class="section-label">Chip Reference Matrix — Total Distance by Club &amp; Carry</div>
    <p class="intro-note" style="margin-bottom:10px">Launch = 75% of loft. Roll ratio: Low Runner 1:5 (7i) → Standard 1:2 (P) → Toss 1:1 (G) → Flop 5:1 (X). Cells show carry + rollout at current stimp and slope.</p>
    <div class="chip-matrix-wrap"><table class="chip-matrix" id="chip-matrix-table"></table></div>`;

  buildChipMatrix();
  /* Default selection: P wedge */
  const _clubs=chipClubs();
  const _pIdx=_clubs.findIndex(c=>c.id==='P');
  window.chipSelectedIdx=_pIdx>=0?_pIdx:-1;
  renderChipDial();
}

function renderChipDial(){
  const totalYd=parseInt(document.getElementById('chip-slider')?.value||20);
  const stimp=STATE.stimp, slope=chipSlopeVal();
  const clubs=chipClubs();
  const results=document.getElementById('chip-results'); if(!results) return;
  if(!clubs.length){ results.innerHTML='<div class="calc-no-result">No clubs in range.</div>'; return; }

  /* compute rows for all clubs */
  let bestIdx=-1, bestDiff=999;
  const rows=clubs.map((c,i)=>{
    const loft=parseFloat(c.loft);
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
    const carryPct=Math.round((carry/Math.max(total,0.01))*100);
    const note = carry<0.5 ? 'carry too short' : carry>25 ? 'pitch / full shot territory' : '';
    return `<div class="chip-club-row${selected?' best':''}"
        style="cursor:pointer;${!practical&&!selected?'opacity:.5':''}"
        onclick="selectChipClub(${i})">
      <div class="chip-club-badge" style="color:${typeColor(c)}">${c.label}<small>${c.loft}</small></div>
      <div class="chip-club-meta">
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">
          <span style="font-family:Arial,sans-serif;font-weight:800;font-size:1.55rem;letter-spacing:.02em;line-height:1;color:${selected?'var(--gold)':typeColor(c)}">${carry.toFixed(1)}</span>
          <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1">yd<br>carry</span>
          <span style="font-family:ui-monospace,monospace;font-size:.54rem;color:var(--muted);margin-left:4px">+ ${roll.toFixed(1)} roll · ${carryPct}:${100-carryPct}</span>
          ${note?`<span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--gold)">· ${note}</span>`:''}
        </div>
        <div style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);margin-bottom:3px">${chipArchetype(loft)} · ${(loft*0.75).toFixed(0)}° launch</div>
        <div class="chip-carry-bar">
          <div class="chip-carry-fill" style="width:${Math.max(2,Math.min(100,carryPct))}%;background:${typeColor(c)}88"></div>
        </div>
      </div>
      <div class="chip-stat">
        <div class="chip-stat-val" style="color:${selected?'var(--gold)':'var(--muted)'}">${total.toFixed(1)}</div>
        <div class="chip-stat-lbl">total</div>
      </div>
    </div>`;
  }).join('');

  /* SVG for selected/best club — shown in traj-wrap above the cards */
  const trajWrap=document.getElementById('chip-traj-wrap');
  if(trajWrap){
    if(displayIdx>=0){
      const {c,carry,roll,loft}=rows[displayIdx];
      trajWrap.innerHTML=`<div class="chip-svg-wrap">
        <div class="chip-svg-label" style="font-size:.8rem;font-weight:700;color:var(--ink);letter-spacing:.01em">${c.label} (${c.loft}) — carry ${carry.toFixed(1)} yd → roll ${roll.toFixed(1)} yd · launch ${(loft*0.75).toFixed(0)}° · ${chipArchetype(loft)}</div>
        ${buildChipSVG(carry,roll,loft)}
      </div>`;
    } else { trajWrap.innerHTML=''; }
  }
  results.innerHTML=cards;
  renderExpectedShots('es-short', totalYd, 'atg');
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
  const carryLabel=`<text x="${(ballX+carryPx/2).toFixed(1)}" y="${Math.max(7,peakY-4)}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="var(--c-wedge)">${carryYd.toFixed(1)}yd carry</text>`;
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
Object.assign(window, { buildChipMatrix, buildChipSVG, buildShortGame, renderChipDial });
