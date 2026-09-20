// Short Game tab: Chip Shot Options dialler, chip trajectory SVG, chip matrix.

function fmtChipSlope(deg){
  const n=Math.round((parseFloat(deg)||0)*2)/2;
  if(n===0) return 'Level';
  return `${Math.abs(n)}° ${n>0?'up':'down'}`;
}
/* The distance control is held in YARDS whatever the display says — renderChipDial and the
   whole chip model read yards, and converting the control itself would push metres into the
   physics. So this converts only what is drawn, in one place. */
function sgSetChipDist(v, fromInput){
  const yd=Math.max(5, Math.min(55, Math.round(parseFloat(v)||20)));
  const sl=document.getElementById('chip-slider'); if(sl && !fromInput) sl.value=yd; else if(sl) sl.value=yd;
  const disp=document.getElementById('chip-display'); if(disp) disp.textContent=ydNum(yd);
  const inp=document.getElementById('chip-input');
  if(inp && inp!==document.activeElement) inp.value=ydNum(yd);
  renderChipDial();
}
function buildShortGame(){
  const wrap=document.getElementById('shortgame-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <!-- 1. Distance slider + stimp dropdown -->
    <div class="calc-dist-block">
      <div class="calc-yardage-display">
        <div class="calc-yardage-num" id="chip-display">${ydNum(20)}</div>
        <div class="calc-yardage-label">${ydUnit()} total</div>
      </div>
      <div class="calc-slider-col">
        <div class="calc-slider-limits"><span>${fmtYd(5)}</span><span>${fmtYd(55)}</span></div>
        <input type="range" class="yard-slider" id="chip-slider" min="5" max="55" value="20" step="1"
          oninput="sgSetChipDist(this.value)">
      </div>
      <div class="calc-manual-col">
        <label for="chip-input">${isMetric('distance')?'Metres':'Yards'}</label>
        <input type="number" id="chip-input" min="${ydNum(5)}" max="${ydNum(55)}" value="${ydNum(20)}"
          oninput="sgSetChipDist(fromDisplay('distance',this.value),true)">
      </div>
      <div class="calc-manual-col calc-stimp-col">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin-bottom:0">Stimp</label>
          <span class="stimp-val" id="sg-stimp-val">${STATE.stimp.toFixed(1)}</span>
        </div>
        <input type="range" id="sg-stimp" min="7" max="14" step="0.5" value="${STATE.stimp}" style="width:100%"
          oninput="STATE.stimp=parseFloat(this.value);document.getElementById('sg-stimp-val').textContent=parseFloat(this.value).toFixed(1);const _pu=document.getElementById('putt-stimp');if(_pu){_pu.value=this.value;const _pv=document.getElementById('putt-stimp-val');if(_pv)_pv.textContent=parseFloat(this.value).toFixed(1);}renderChipDial();buildChipMatrix();saveState()">
      </div>
      <!-- Expected shots + strokes gained, folded into the distance box -->
      <div id="es-short" class="expected-shots-strip"></div>
    </div>

    <!-- 1b. Plays-like adjusters -->
    <div id="ey-shortgame" class="ey-host"></div>

    <!-- 2. Trajectory profile for the selected shot option -->
    <div id="chip-flight-wrap"></div>

    <!-- 3. Shot options -->
    <div id="chip-results"></div>


    <!-- 4. Short Game Setup Adjustment Options -->
    <div class="section-label" style="margin-top:22px">Short Game Setup Adjustment Options</div>
    <div id="sg-vars-wrap"></div>

    <!-- Calibrate to My Data now lives in Locker Room -> My App, with every other data
         source, so there is one place that answers "what is feeding the model". -->

    <!-- 6. Chip Matrix — at-a-glance, very bottom of the tab -->
    <div class="section-label" style="margin-top:22px;display:flex;align-items:center;justify-content:space-between;gap:10px">Chip Carry &amp; Roll <button class="print-btn" onclick="printMatrix('shortgame')">⌘ Print</button></div>
    <p class="gen-note" id="chip-matrix-note" style="margin:0 2px 8px"></p>
    <div class="chip-matrix-wrap"><table class="chip-matrix" id="chip-matrix-table"></table></div>`;

  buildChipMatrix();
  renderSgVars();
  renderSgCal();
  /* Start on auto-select so the dial defers to the G / gap wedge standard chip (see renderChipDial). */
  window.chipSelectedIdx=-1;
  renderChipDial();
}

/* ---- Calibrate to My Data: fit per-user launch / spin / rollout from measured short-game shots.
   Rollout captures release-style tendencies the app deliberately does not model from setup. ---- */
function sgCalClubLabel(id){ const c=(STATE.clubs||[]).find(x=>x.id===id); return c?`${c.label} (${c.loft})`:id; }
function sgCalRecompute(){
  const cal=STATE.sgCal||(STATE.sgCal={shots:[],launchOff:0,spinMult:1,rollMult:1});
  let loSum=0,loN=0, spSum=0,spN=0, roSum=0,roN=0;
  (cal.shots||[]).forEach(s=>{
    const loft=parseFloat(s.loft)||50, carry=parseFloat(s.carry)||0, stimp=parseFloat(s.stimp)||9.5;
    if(s.launch!==''&&s.launch!=null){ loSum += parseFloat(s.launch)-chipLaunchRaw(loft); loN++; }
    if(s.spin!==''&&s.spin!=null&&carry>0){ const m=chipSpinRaw(carry,loft); if(m>0){ spSum += parseFloat(s.spin)/m; spN++; } }
    if(s.total!==''&&s.total!=null&&carry>0){ const roll=parseFloat(s.total)-carry, model=carry*chipRollFactor(loft,stimp,0);
      if(model>0&&roll>=0){ roSum += roll/model; roN++; } }
  });
  cal.launchOff = loN? Math.round(loSum/loN*10)/10 : 0;
  cal.spinMult  = spN? Math.max(0.5,Math.min(2.0, Math.round(spSum/spN*1000)/1000)) : 1;
  cal.rollMult  = roN? Math.max(0.4,Math.min(2.5, Math.round(roSum/roN*1000)/1000)) : 1;
}
function renderSgCal(){
  const wrap=document.getElementById('sg-cal-wrap'); if(!wrap) return;
  const cal=STATE.sgCal||(STATE.sgCal={shots:[],launchOff:0,spinMult:1,rollMult:1});
  const opts=chipClubs().map(c=>`<option value="${c.id}">${c.label} (${c.loft})</option>`).join('');
  const active=(typeof chipCalibrated==='function'&&chipCalibrated());
  const prov=(typeof sgProv==='function')?sgProv(active?'captured':'presumed'):'';
  const rows=(cal.shots||[]).map(s=>`<tr><td>${sgCalClubLabel(s.club)}</td><td>${s.carry}</td><td>${s.launch||'—'}</td><td>${s.spin||'—'}</td><td>${s.total||'—'}</td><td>${s.stimp||'—'}</td><td><button class="sgcal-del" title="Remove" onclick="sgCalRemove('${s.id}')">✕</button></td></tr>`).join('');
  wrap.innerHTML=`
    <p class="gen-note" style="margin-top:0">Enter a few measured short-game shots from your launch monitor. The app fits your own <b>launch</b>, <b>spin</b> and <b>rollout</b> — capturing your release style and any manual adjustments the model doesn't account for — and applies them to every number on this tab. Measure on a flat lie at a known green speed; fill in whichever of launch / spin / total you have.</p>
    <div class="edit-grid">
      <div class="edit-field"><label>Club</label><select id="sgcal-club">${opts}</select></div>
      <div class="edit-field"><label>Carry (${ydUnit()})</label><input id="sgcal-carry" type="number" inputmode="decimal" placeholder="req'd"></div>
      <div class="edit-field"><label>Launch (°)</label><input id="sgcal-launch" type="number" inputmode="decimal"></div>
      <div class="edit-field"><label>Spin (rpm)</label><input id="sgcal-spin" type="number" inputmode="decimal"></div>
      <div class="edit-field"><label>Total (${ydUnit()})</label><input id="sgcal-total" type="number" inputmode="decimal"></div>
      <div class="edit-field"><label>Stimp</label><input id="sgcal-stimp" type="number" inputmode="decimal" value="${(STATE.stimp||9.5).toFixed(1)}"></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" onclick="sgCalAddShot()">Add measured shot</button>${(cal.shots||[]).length?`<button class="btn" onclick="sgCalReset()">Reset calibration</button>`:''}</div>
    <div class="sgcal-factors">Your fit: <span>launch <b>${cal.launchOff>0?'+':''}${cal.launchOff||0}°</b></span><span>spin <b>×${(cal.spinMult||1).toFixed(2)}</b></span><span>rollout <b>×${(cal.rollMult||1).toFixed(2)}</b></span> ${prov}</div>
    ${(cal.shots||[]).length?`<table class="sgcal-table"><thead><tr><th>Club</th><th>Carry</th><th>Launch</th><th>Spin</th><th>Total</th><th>Stimp</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:''}`;
}
function sgCalAddShot(){
  const g=id=>document.getElementById(id);
  const club=g('sgcal-club')?.value, carry=parseFloat(g('sgcal-carry')?.value);
  const launch=g('sgcal-launch')?.value.trim(), spin=g('sgcal-spin')?.value.trim(), total=g('sgcal-total')?.value.trim();
  const stimp=parseFloat(g('sgcal-stimp')?.value)||STATE.stimp||9.5;
  if(!club||!(carry>0)){ if(typeof toast==='function') toast('Enter a club and carry'); return; }
  if(!launch&&!spin&&!total){ if(typeof toast==='function') toast('Enter at least one of launch / spin / total'); return; }
  const cl=(STATE.clubs||[]).find(x=>x.id===club), loft=cl?parseFloat(cl.loft):50;
  STATE.sgCal=STATE.sgCal||{shots:[],launchOff:0,spinMult:1,rollMult:1}; STATE.sgCal.shots=STATE.sgCal.shots||[];
  STATE.sgCal.shots.push({id:'sc'+Date.now(), club, loft, carry, launch, spin, total, stimp});
  sgCalRecompute(); saveState(); renderSgCal();
  if(typeof buildChipMatrix==='function') buildChipMatrix();
  window.chipSelectedIdx=-1; renderChipDial();
  if(typeof toast==='function') toast('Calibration updated');
}
function sgCalRemove(id){
  if(!STATE.sgCal) return;
  STATE.sgCal.shots=(STATE.sgCal.shots||[]).filter(s=>s.id!==id);
  sgCalRecompute(); saveState(); renderSgCal();
  if(typeof buildChipMatrix==='function') buildChipMatrix();
  window.chipSelectedIdx=-1; renderChipDial();
}
function sgCalReset(){
  STATE.sgCal={shots:[],launchOff:0,spinMult:1,rollMult:1}; saveState(); renderSgCal();
  if(typeof buildChipMatrix==='function') buildChipMatrix();
  window.chipSelectedIdx=-1; renderChipDial();
  if(typeof toast==='function') toast('Calibration reset');
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
  /* Two rows, split by CAUSE and EFFECT rather than absolute-vs-delta. The old pair showed
     effective loft and bounce TWICE — absolute in the impact row, again as a delta below — so
     half of eight cells were the same two numbers said differently. What the setup does to the
     club at impact is the cause; what that does to the shot is the effect; and the effect only
     means anything as a change from standard, which is what this panel exists to show. */
  /* NET SHOT EFFECT — the shot, and nothing else.
     It used to restate the club's behaviour at impact (shaft lean, vertical path, effective
     loft, bounce), all of which each variable row above already prints under its own slider.
     What no row above can say is how the ball leaves: those are properties of the strike, not
     of any one setting, and they are the reason to move a slider at all. Speed is a percentage
     because it is club-independent — the same setup costs a 7-iron chip and a lob wedge the
     same share of their own ball speed. */
  const spd=net.dSpeedPct;
  const readout=`
    <div class="sgv-readout">
      <div class="sgv-readout-head">Net Shot Effect ${provNote}</div>
      <div class="sgv-shot sgv-shot-3">
        <div class="sgv-shot-cell"><span class="sgv-k">${arrow(net.dLaunch)} Launch</span><span class="sgv-v">${fmt(net.dLaunch,'&deg;')}</span></div>
        <div class="sgv-shot-cell"><span class="sgv-k">${arrow(net.dSpin)} Spin</span><span class="sgv-v">${fmt(net.dSpin,'',0)}</span></div>
        <div class="sgv-shot-cell"><span class="sgv-k">${arrow(spd)} Ball speed</span><span class="sgv-v">${fmt(spd,'%',1)}</span></div>
      </div>
      <div class="sgv-readout-foot">vs the standard chip &mdash; Middle &middot; Vertical &middot; Square, delivering ~${sgRefDelivered().toFixed(0)}&deg;. <button type="button" class="sgv-reset" onclick="resetSgVars()">Reset to standard</button></div>
    </div>`;
  wrap.innerHTML=`
    <div class="sgv-cat">
      ${SG_VARS.setup.map(varRow).join('')}
      ${readout}
    </div>`;
}

/* Target elevation → roll multiplier: green BELOW you plays shorter (carry less, release more);
   ABOVE plays longer (carry more, release less). ~3% roll per foot; clamped.
   Lifted out of renderChipDial because the reference chart needs the same multiplier and must
   not depend on the dial having rendered first — build order was deciding the numbers. */
function chipSyncElevRoll(measuredYd){
  const d=(measuredYd!=null)?measuredYd:parseInt(document.getElementById('chip-slider')?.value||20);
  const elevFt=(typeof elevBaseVal==='function' && typeof EY!=='undefined') ? elevBaseVal('shortgame', d) : 0;
  window.chipElevRollMult = Math.max(0.5, Math.min(2, 1 - elevFt*0.03));
}
function renderChipDial(){
  const measuredYd=parseInt(document.getElementById('chip-slider')?.value||20);
  /* A chip must reach the hole, so carry + roll always sums to the distance to the hole. The
     conditions (firmness, lie, stance, elevation, green slope) shift the carry/roll SPLIT, not the
     total. Only air density can nudge the flown distance a hair (≈0 for chips). */
  const eyAdj = typeof eyTotal==='function' ? eyTotal('shortgame',measuredYd) : 0;
  const totalYd=Math.max(3, Math.round(measuredYd+eyAdj));
  if(typeof eyRefreshSummary==='function') eyRefreshSummary('shortgame');
  chipSyncElevRoll(measuredYd);
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

  /* Default (no manual pick) defers to the G / gap wedge standard chip when it's a practical
     option for this distance — the go-to short-game shot — otherwise the closest-total match. */
  const gwIdx = rows.findIndex(r=>r.practical && (r.c.label==='G' || (r.c.type==='wedge' && Math.abs(parseFloat(r.c.loft)-51)<=2)));
  const defaultIdx = gwIdx>=0 ? gwIdx : bestIdx;
  /* which club to highlight + show SVG for (guard a stale index when the list changes) */
  const displayIdx = (window.chipSelectedIdx>=0 && window.chipSelectedIdx<rows.length) ? window.chipSelectedIdx : defaultIdx;

  const typeColor=c=>c.type==='wedge'?'var(--c-wedge)':c.type==='iron'?'var(--c-iron)':c.type==='putter'?'var(--c-putter)':'var(--c-wood)';
  let flightHTML='';
  const cards=rows.map(({c,loft,carry,roll,total,practical},i)=>{
    const selected = i===displayIdx;
    const tc=typeColor(c);
    const note = carry<0.5 ? 'carry too short' : carry>25 ? 'pitch / full shot territory' : '';
    const noteStr = note ? ` <span style="color:var(--gold);font-size:.68rem">· ${note}</span>` : '';
    /* Selected shot's trajectory renders into the flight wrap above the shot options. */
    if(selected){
      const effNote = Math.abs(sgDelta)>=0.5 ? ` <span style="color:var(--gold);font-weight:700">plays ${loft.toFixed(0)}° eff</span>` : '';
      const stanceAdj = window.chipStanceLaunchAdj||0;
      const launch = (typeof chipLaunch==='function' ? chipLaunch(loft) : loft*0.68) + stanceAdj;
      const spin = typeof chipSpin==='function' ? chipSpin(carry,loft) : 0;
      const fk = window.chipFirmKey || 'avg';
      const fm = typeof chipFirmModel==='function' ? chipFirmModel(fk) : {check:''};
      const firmName = {vsoft:'very soft',soft:'soft',avg:'average',firm:'firm',vfirm:'very firm'}[fk]||fk;
      const slopeTxt = slope>0.1?`${slope}° uphill`:slope<-0.1?`${Math.abs(slope)}° downhill`:'level';
      const elevFt2 = (typeof elevBaseVal==='function'&&typeof EY!=='undefined') ? elevBaseVal('shortgame',measuredYd) : 0;
      const elevTxt = Math.abs(elevFt2)>=0.5 ? ` · target ${Math.abs(elevFt2).toFixed(0)} ft ${elevFt2>0?'up':'down'}` : '';
      const ctxLine = `${fm.check} · ${firmName} green · ${slopeTxt} @ stimp ${stimp.toFixed(1)}${elevTxt}${stanceAdj?` · stance ${stanceAdj>0?'+':''}${stanceAdj}° launch`:''}`;
      flightHTML=`<div class="calc-traj-drop" style="grid-template-columns:1fr">
        <div class="traj-panel traj-main">
          <div class="traj-panel-title">${c.label} (${c.loft})${effNote} — carry ${ydNum(carry,1)} → roll ${ydNum(roll,1)} ${ydUnit()} · launch ${launch.toFixed(0)}° · ~${spin.toLocaleString()} rpm</div>
          <div style="font-family:ui-monospace,monospace;font-size:.6rem;color:var(--muted);margin:1px 0 3px">${ctxLine}</div>
          ${buildChipSVG(carry,roll,loft,{launch,slopeDeg:slope,firmKey:fk})}
        </div>
      </div>`;
    }
    /* Same shape as the Approach card: club badge, per-club detail, then the DEFINING number
       pinned right. For a chip that is the CARRY-TO-ROLL SPLIT in real yards — "2.5 : 17.5"
       says both how the shot flies and, read down the stack, how the clubs differ — with the
       archetype under it as the teaching label.
       Colour still bands the underlying RATIO, not the raw numbers, so it means the same thing
       at every target distance: green stops soonest, gold runs furthest. Descriptive, not a
       judgement — a runner is the right shot more often than not.
       The middle is now empty by design: it carried launch and spin, and the Launch stage of
       the anatomy states both the moment the card is selected. Printing them twice on one card
       is the redundancy this pass exists to remove -- collapsed, the split IS the shot;
       expanded, the anatomy is the detail. */
    const ratio = carry>0.05 ? roll/carry : 0;
    /* always one decimal, so the split reads as a column down the stack — ydNum(4.0,1)
       returns the NUMBER 4, which would print "4 : 16" beside "3.3 : 16.7".
       Each half names itself ("10.1 yd carry : 9.9 yd roll") so the line needs no legend
       under the launch/spin — the units ride small and muted, the numbers keep the weight. */
    const half=(v,word)=>`${ydNum(v,1).toFixed(1)}<i>${ydUnit()} ${word}</i>`;
    /* wrapped in its own ROW — .calc-head-anchor is a column flex, so loose inline units
       would each become their own line and stack the card three deep */
    const splitStr = `<u class="sg-row">${half(carry,'carry')}<b>:</b>${half(roll,'roll')}</u>`;
    const rc = ratio<=1 ? 'var(--green)' : ratio<=3 ? 'var(--sky)' : 'var(--gold)';
    const rowLaunch=(typeof chipLaunch==='function'?chipLaunch(loft):loft*0.68)+(window.chipStanceLaunchAdj||0);
    const rowSpin=typeof chipSpin==='function'?chipSpin(carry,loft):0;
    /* Same rule as Approach: one line collapsed, the full Impact / Launch / Flight picture on
       the card you picked. A chip has no modelled clubhead speed \u2014 nothing in the app measures
       or derives one at these speeds \u2014 so that cell prints an em dash rather than a number
       invented to fill the grid. */
    const netAbs=(typeof sgNet==='function')?sgNet().abs:null;
    const anatomy = selected ? shotStageHTML({
      impact:[
        {k:'Vert. Face', v:`${loft.toFixed(0)}\u00b0`, title:'The club\u2019s loft as delivered \u2014 its own loft plus whatever the setup adds or takes away.'},
        {k:'Vert. Path', v:netAbs&&netAbs.vertPath!=null?`${netAbs.vertPath>0?'+':''}${netAbs.vertPath.toFixed(0)}\u00b0`:null},
        {k:'Club', v:null, dim:true, title:'Not modelled for chips \u2014 nothing in the app measures or derives clubhead speed at these distances.'}
      ],
      launch:[
        {k:'Vert. Launch', v:`${rowLaunch.toFixed(0)}\u00b0`},
        {k:'Ball', v:null, dim:true, title:'Not modelled for chips.'},
        {k:'Spin', v:`${rowSpin.toLocaleString()} rpm`}
      ],
      flight:[
        {k:'Apex', v:(function(){ const ft=(typeof chipApexFt==='function')?chipApexFt(carry,rowLaunch):null;
            return ft==null?null:(ft<3?`${fmtIn(ft*12,0)}`:`${ftNum(ft,1)} ${ftUnit()}`); })(),
         title:'Estimated from the launch angle and the carry \u2014 geometry, not measurement. Reads slightly low on a high-spinning wedge.'},
        {k:'Carry', v:`${ydNum(carry,1).toFixed(1)} ${ydUnit()}`},
        {k:'% to target', v:total>0?`${Math.round(carry/total*100)}%`:null,
         title:'The share of the whole shot that flies \u2014 the landing spot to pick out and hit.'},
        {k:'TTL', v:`${ydNum(total,1).toFixed(1)} ${ydUnit()}`},
        {k:'Roll', v:`${ydNum(roll,1).toFixed(1)} ${ydUnit()}`, dim:true}
      ]
    }) : '';
    return `<div class="calc-result-card ${selected?'best':''}"
        onclick="selectChipClub(${i})" style="cursor:pointer${!practical&&!selected?';opacity:.5':''}">
      <div class="calc-card-header">
        <div class="calc-club-badge" style="color:${tc}">${c.label}<small>${c.loft}</small></div>
        <div class="calc-head-main">${noteStr||''}</div>
        <div class="calc-head-anchor sg-split" style="color:${rc}">${splitStr}</div>
      </div>
      ${anatomy}
    </div>`;
  }).join('');
  const flightWrapEl=document.getElementById('chip-flight-wrap');
  if(flightWrapEl) flightWrapEl.innerHTML=flightHTML;

  results.innerHTML=cards;
  renderExpectedShots('es-short', measuredYd, 'atg');
}

function buildChipSVG(carryYd, rollYd, loftDeg, opts){
  opts=opts||{};
  const W=320, H=64, PAD=10, groundY=52;
  const total=Math.max(carryYd+rollYd, 0.5);
  const scale=(W-PAD*2)/total;
  const carryPx=carryYd*scale, rollPx=rollYd*scale;
  const ballX=PAD, landX=PAD+carryPx, stopX=PAD+carryPx+rollPx;

  /* Launch angle — stance-adjusted (opts.launch) so the drawn arc matches the readout;
     falls back to the research display rule (~0.68×loft). */
  const launchDeg = opts.launch!=null ? opts.launch : (typeof chipLaunch==='function'?chipLaunch(loftDeg):loftDeg*0.68);
  const launchRad=launchDeg*Math.PI/180;
  const slopeDeg = opts.slopeDeg||0;
  const fm = (typeof chipFirmModel==='function') ? chipFirmModel(opts.firmKey||'avg') : {bounceH:1,bounces:3};

  /* Run-out ground tilt for the green slope (+ = uphill run-out climbs). Visual exaggeration,
     capped so the drawing stays in frame. groundAt(x) gives the surface height over the run-out. */
  let tanG = Math.tan(slopeDeg*Math.PI/180) * 1.5;
  const maxRise = 16;
  if(rollPx>0 && Math.abs(tanG)*rollPx > maxRise) tanG = Math.sign(tanG)*maxRise/rollPx;
  const groundAt = x => groundY - (x - landX) * tanG;
  const stopY = groundAt(stopX);

  /* Carry arc — asymmetric bezier, lands at (landX, groundY) (the front of the green). */
  const peakH=Math.max(6, Math.min(38, carryPx*Math.tan(launchRad)/4));
  const h=carryPx/3.2;
  const p1x=ballX + h*Math.cos(launchRad), p1y=groundY - h*Math.sin(launchRad);
  const p2x=landX  - h*Math.cos(launchRad), p2y=groundY - h*Math.sin(launchRad);
  const arcPath=`M ${ballX},${groundY} C ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${landX.toFixed(1)},${groundY}`;

  /* Bounces walk along the tilted ground; firmness scales the hop height + count
     (soft = plops & sits, firm = hops on and runs). Loft still caps the count. */
  const bFactor=0.04+(launchDeg-26)/23*0.22;
  const bounce1H=peakH*Math.max(0.06,bFactor)*fm.bounceH;
  const bounce1W=Math.min(rollPx*0.20, 22);
  const nBounces=Math.max(1, Math.min(fm.bounces, loftDeg>=62?1:loftDeg>=50?2:3));
  let bx=landX, bouncesSVG='';
  for(let b=0;b<nBounces;b++){
    const bH=bounce1H*Math.pow(0.40, b);
    const bW=bounce1W*Math.pow(0.62, b);
    if(bH<1.5||bx+bW>stopX-3) break;
    const bEndX=bx+bW, bMidX=bx+bW/2;
    const gy0=groundAt(bx), gyE=groundAt(bEndX), gyM=groundAt(bMidX);
    bouncesSVG+=`<path d="M ${bx.toFixed(1)},${gy0.toFixed(1)} Q ${bMidX.toFixed(1)},${(gyM-bH).toFixed(1)} ${bEndX.toFixed(1)},${gyE.toFixed(1)}" fill="none" stroke="var(--c-wedge)" stroke-width="${(1.4-b*0.2).toFixed(1)}" opacity="${(0.72-b*0.18).toFixed(2)}"/>`;
    bx=bEndX;
  }

  /* Rollout — dashed line along the tilt from last bounce to the resting point */
  const rollLineSVG=(stopX-bx)>4
    ?`<line x1="${bx.toFixed(1)}" y1="${groundAt(bx).toFixed(1)}" x2="${stopX.toFixed(1)}" y2="${stopY.toFixed(1)}" stroke="var(--green2)" stroke-width="2" stroke-dasharray="3,2.5" opacity="0.88"/>`:'';

  /* Green surface — a tilted band from the landing point to the stop */
  const greenSurface=rollPx>3
    ?`<line x1="${landX.toFixed(1)}" y1="${groundY}" x2="${stopX.toFixed(1)}" y2="${stopY.toFixed(1)}" stroke="var(--green-pale)" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`:'';

  /* Launch angle indicator at ball (uses the stance-adjusted launch) */
  const lineLen=Math.min(22, carryPx*0.28);
  const launchIndicator=carryPx>12?`
    <line x1="${ballX}" y1="${groundY}" x2="${(ballX+lineLen*Math.cos(launchRad)).toFixed(1)}" y2="${(groundY-lineLen*Math.sin(launchRad)).toFixed(1)}" stroke="var(--sky)" stroke-width="1.2" opacity="0.6"/>
    <text x="${(ballX+lineLen*Math.cos(launchRad)+3).toFixed(1)}" y="${(groundY-lineLen*Math.sin(launchRad)-1).toFixed(1)}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="var(--sky)" opacity="0.8">${launchDeg.toFixed(0)}°</text>`:'';

  /* Labels */
  const peakY=groundY-peakH;
  /* The carry number, and under it the share of the whole shot it represents \u2014 same size,
     because on a chip the landing spot IS the intent: "land it 60% of the way" is a thing you
     can pick out on the grass and hit, where "land it 12.1 yards" is a thing you have to
     measure first. */
  const _pctTo = (carryYd+rollYd)>0 ? Math.round(carryYd/(carryYd+rollYd)*100) : null;
  const carryLabel=`<text x="${landX.toFixed(1)}" y="${Math.max(7,peakY-4)}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="var(--c-wedge)">${ydNum(carryYd,1)}${ydUnit()} carry</text>`
    + (_pctTo==null?'':`<text x="${landX.toFixed(1)}" y="${Math.max(15,peakY+4)}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="var(--c-wedge)" opacity="0.85">${_pctTo}% to target</text>`);
  const rollMidY=Math.min(H+10, groundAt(landX+rollPx/2)+14);
  const rollLabel=rollPx>22?`<text x="${(landX+rollPx/2).toFixed(1)}" y="${rollMidY.toFixed(1)}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="7" fill="var(--green)">${ydNum(rollYd,1)}${ydUnit()} roll</text>`:'';

  /* Flag at the (tilted) resting point */
  const fScale=Math.max(0.7, Math.min(1.7, 1.8 - total*0.02));
  const poleH=20*fScale, ffw=11*fScale, ffh=7.5*fScale, flagTopY=Math.max(3, stopY-poleH);
  const flagRed=(typeof SG_RED!=='undefined')?SG_RED:'#e0202a';
  const flagSVG=`
    <line x1="${stopX.toFixed(1)}" y1="${stopY.toFixed(1)}" x2="${stopX.toFixed(1)}" y2="${flagTopY.toFixed(1)}" stroke="#c9c9c9" stroke-width="${(1.4*fScale).toFixed(2)}" stroke-linecap="round"/>
    <polygon points="${stopX.toFixed(1)},${flagTopY.toFixed(1)} ${(stopX-ffw).toFixed(1)},${(flagTopY+ffh*0.5).toFixed(1)} ${stopX.toFixed(1)},${(flagTopY+ffh).toFixed(1)}" fill="${flagRed}"/>`;

  return `<svg viewBox="0 0 ${W} ${H+12}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <line x1="${PAD-3}" y1="${groundY}" x2="${landX.toFixed(1)}" y2="${groundY}" stroke="var(--border2)" stroke-width="1"/>
    ${greenSurface}
    ${launchIndicator}
    <path d="${arcPath}" fill="none" stroke="var(--c-wedge)" stroke-width="1.9" opacity="0.92"/>
    ${bouncesSVG}
    ${rollLineSVG}
    <circle cx="${ballX}" cy="${groundY}" r="3.2" fill="var(--ink)"/>
    <circle cx="${landX.toFixed(1)}" cy="${groundY}" r="2.5" fill="var(--c-wedge)" opacity="0.85"/>
    <circle cx="${stopX.toFixed(1)}" cy="${stopY.toFixed(1)}" r="3.4" fill="var(--green2)" opacity="0.95"/>
    ${flagSVG}
    ${carryLabel}
    ${rollLabel}
  </svg>`;
}

/* One line stating everything the chip numbers ASSUME. The reference is meaningless without
   it: open the face or speed the green up and every split below moves with it. */
function chipSetupSummary(){
  const sel=STATE.sgVars||{};
  const nameOf=key=>{
    const v=(typeof SG_VARS!=='undefined'?SG_VARS.setup:[]).find(x=>x.key===key); if(!v) return null;
    const o=v.opts.find(o=>o.id===(sel[key]||v.def)); return o?o.label:null;
  };
  const fk=window.chipFirmKey||'avg';
  const firm={vsoft:'very soft',soft:'soft',avg:'average',firm:'firm',vfirm:'very firm'}[fk]||fk;
  const sl=(typeof chipSlopeVal==='function')?chipSlopeVal():0;
  const slope=sl>0.1?`${sl}° uphill`:sl<-0.1?`${Math.abs(sl)}° downhill`:'level';
  const d=(typeof sgEffLoftDelta==='function')?sgEffLoftDelta():0;
  const loftTxt=Math.abs(d)>=0.05?`${d>0?'+':''}${d.toFixed(1)}° eff. loft`:null;
  return [ 'ball '+(nameOf('ballPos')||'Middle').toLowerCase(),
           'shaft '+(nameOf('shaftPos')||'Vertical').toLowerCase(),
           'face '+(nameOf('face')||'Square').toLowerCase(), loftTxt,
           'stimp '+STATE.stimp.toFixed(1), firm+' green', slope ]
         .filter(Boolean).join(' &middot; ');
}
/* CHIP REFERENCE — a row per club, not a grid of distances.
   Roll is proportional to carry, so the SPLIT is the same at 2 yards as at 15: the old
   six-column matrix printed one number six times per row. The split is the whole content, and
   one honest way of saying it is enough — a percentage pair and a ratio were the same fact
   twice. It comes from chipLiveRollRatio, the same call the shot options above use, so the
   chart and the dial cannot drift apart.
   Carry leads: the carry number is the one being planned and then executed — a landing spot is
   a thing you can pick out and hit, where a roll figure is only ever the consequence. Roll and
   the ratio sit behind it in the same row for the golfer who thinks in 1:3. */
function buildChipMatrix(){
  chipSyncElevRoll();
  const typeColor=c=>c.type==='wedge'?'var(--c-wedge)':c.type==='iron'?'var(--c-iron)':c.type==='putter'?'var(--c-putter)':'var(--c-wood)';
  let html=`<thead><tr><th style="text-align:left;padding-left:12px">Club</th><th>Carry</th><th>Roll</th><th>Ratio</th></tr></thead><tbody>`;
  chipClubs().forEach(c=>{
    const R=chipLiveRollRatio(c.loft);
    const carryPct=100/(1+R);                 /* the share that flies — what you actually aim at */
    const col=typeColor(c);
    html+=`<tr>
      <td style="padding-left:12px;white-space:nowrap"><span style="font-family:Arial,sans-serif;font-weight:800;font-size:.95rem;color:${col}">${c.label}</span> <span style="font-family:ui-monospace,monospace;font-size:.56rem;color:var(--muted)">${c.loft}</span></td>
      <td><div class="chip-cell" style="color:${col}">${carryPct.toFixed(0)}%</div></td>
      <td><div class="chip-cell chip-cell-sub">${(100-carryPct).toFixed(0)}%</div></td>
      <td><div class="chip-cell chip-cell-sub">${chipRatioStr(R)}</div></td>
    </tr>`;
  });
  const t=document.getElementById('chip-matrix-table'); if(t) t.innerHTML=html+'</tbody>';
  const n=document.getElementById('chip-matrix-note');
  if(n) n.innerHTML=`Same split at every distance — roll scales with carry. Assumes <b>${chipSetupSummary()}</b>.`;
}




// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { sgSetChipDist, buildChipMatrix, chipSetupSummary, chipSyncElevRoll, buildChipSVG, buildShortGame, fmtChipSlope, renderChipDial, renderSgVars, renderSgCal, sgCalAddShot, sgCalRemove, sgCalReset });
