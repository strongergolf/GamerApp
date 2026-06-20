// Game Plan → Plan a Shot.
// Effective Yardage = Static + Lie + Stance + Wind + Topography + Shot Type,
// each rendered as a clickable term in a live equation; tapping a term opens its detail + inputs.
// Carry to play = Effective − Rollout. Crosswind resolves to a lateral aim offset, not distance.
// (Air density is handled globally by the Environmental Adjustment / conditions strip, so it's not
//  a manual term here. Nerves/adrenaline was removed — real but too individual to model reliably.)
//
// Rough-estimate defaults (refine from real data):
//   Headwind ~1%/mph · Tailwind ~0.5%/mph · Crosswind ~2 yd/mph drift
//   Topography is geometric: yards lost ≈ Δelev / tan(landing angle), so steeper-landing shots
//   (wedges, high balls) lose less per foot than shallow ones (long irons, knockdowns); downhill
//   gives back ~2/3 of the uphill cost. knockdown dampens wind ~×0.6, high ball ~×1.2.
const PS_WIND_HEAD = 0.010, PS_WIND_TAIL = 0.005, PS_CROSS_YPM = 2.0, PS_ELEV_K = 1.2;

/* transient shot state (not persisted — a shot is planned, then forgotten) */
const psShot = { teeAim:'', apprLat:'', apprDepth:'', static:'', lie:'fairway', stance:'flat',
  windspd:'', winddir:'calm', elev:'', shot:'stock', rollout:'', minCarry:'' };
let psOpenKey = 'static';

const psNum = v => { const n=parseFloat(v); return isNaN(n)?0:n; };
const PS_LIE   = { fairway:0, lightrough:5, heavyrough:-8, bunker:-7, divot:-3, hardpan:-2, tee:2 };
const PS_STANCE= { flat:0, above:-3, below:-2, uphill:-5, downhill:5 };
const PS_SHOT  = { stock:0, knockdown:-8, high:0 };
const psWindMult = () => psShot.shot==='knockdown'?0.6 : psShot.shot==='high'?1.2 : 1.0;

function psAirDelta(S){
  try{
    if(typeof airDensity!=='function'||typeof currentConditions!=='function') return 0;
    const rhoB=airDensity(STATE.baseline), rhoC=airDensity(currentConditions());
    if(!isFinite(rhoB)||!isFinite(rhoC)||rhoC===0) return 0;
    const k=STATE.densityK||0.65;
    return -S*k*(rhoB/rhoC-1);   /* thinner air than baseline ⇒ ball flies farther ⇒ plays shorter */
  }catch(e){ return 0; }
}
/* Effective landing angle for the planned shot: the closest club's land angle, nudged by shot
   type (knockdown lands shallower, high lands steeper). Drives trajectory-aware topography. */
function psLandAngle(){
  const S=psNum(psShot.static);
  let best=null,bestDiff=1e9;
  (STATE.clubs||[]).forEach(c=>{ if(c.type==='putter')return; const cc=perf(c.id).carry||0; if(cc<=0)return; const d=Math.abs(cc-S); if(d<bestDiff){bestDiff=d;best=c;} });
  let land = best ? (perf(best.id).land||45) : 45;
  if(psShot.shot==='knockdown') land-=7;
  else if(psShot.shot==='high') land+=7;
  return Math.max(22, Math.min(62, land));
}
/* Topography (geometric): yards lost ≈ Δelev / tan(landing angle). Steeper landings lose less
   per foot uphill; downhill gives back ~2/3 of the uphill cost. */
function psTopoDelta(){
  const elev=psNum(psShot.elev); if(!elev) return 0;
  const factor=1/Math.tan(psLandAngle()*Math.PI/180);
  return elev>=0 ? elev*factor : elev*factor*0.67;
}
/* per-term yardage delta for the current shot */
function psDelta(key){
  const S=psNum(psShot.static);
  switch(key){
    case 'static': return S;
    case 'lie':    return PS_LIE[psShot.lie]||0;
    case 'stance': return PS_STANCE[psShot.stance]||0;
    case 'wind':   { const w=psNum(psShot.windspd);
                     if(psShot.winddir==='head') return  S*PS_WIND_HEAD*w*psWindMult();
                     if(psShot.winddir==='tail') return -S*PS_WIND_TAIL*w*psWindMult();
                     return 0; }
    case 'topo':   return psTopoDelta();
    case 'shot':   return PS_SHOT[psShot.shot]||0;
  }
  return 0;
}
function psCrosswind(){
  if(psShot.winddir!=='crossL'&&psShot.winddir!=='crossR') return null;
  const lat=PS_CROSS_YPM*psNum(psShot.windspd)*psWindMult();
  if(lat<=0) return null;
  return { yd:lat, dir: psShot.winddir==='crossL'?'left':'right' };  /* wind L→R pushes ball right ⇒ aim left */
}
function psEffective(){ return ['static','lie','stance','wind','topo','shot'].reduce((s,k)=>s+psDelta(k),0); }

const PS_TERMS=[
  {key:'static',label:'Static',  base:true},
  {key:'lie',   label:'Lie'},
  {key:'stance',label:'Stance'},
  {key:'wind',  label:'Wind'},
  {key:'topo',  label:'Topo'},
  {key:'shot',  label:'Shot'}
];

/* ---- render ---- */
/* Tee + Approach target sections — skeleton for the strategy/optimisation work to come;
   selections are stored now and will eventually drive dispersion overlays + shot optimisation. */
function psTargetsHTML(){
  const sub='font-family:ui-monospace,monospace;font-size:.55rem;font-weight:400;color:var(--muted);text-transform:none';
  return `
    <div class="profile-card" style="margin-top:0">
      <h3>1 · Tee Shot Targets <span style="${sub}">evolving</span></h3>
      <div class="edit-field" style="grid-column:1/-1"><label>Aim line</label>${psSel('teeAim',[['','—'],['left-edge','Left edge'],['left-centre','Left-centre'],['centre','Centre'],['right-centre','Right-centre'],['right-edge','Right edge']])}</div>
      <p class="intro-note" style="margin:8px 0 0">Coming: overlay your <b>86% dispersion pattern</b> on the hole and auto-pick the aim that <b>avoids bunkers &amp; minimises rough exposure</b>, then favours the <b>shortest route to the pin</b>. Powered by the Course Map.</p>
    </div>
    <div class="profile-card">
      <h3>2 · Approach Shot Targets <span style="${sub}">evolving</span></h3>
      <div class="edit-grid">
        <div class="edit-field"><label>Lateral (vs pin)</label>${psSel('apprLat',[['','—'],['left','Left'],['centre','Centre'],['right','Right']])}</div>
        <div class="edit-field"><label>Depth (vs pin)</label>${psSel('apprDepth',[['','—'],['short','Short'],['pin','Pin-high'],['long','Long']])}</div>
      </div>
      <p class="intro-note" style="margin:8px 0 0">Coming: pick the <b>carry + expected total</b> to a lateral target that <b>minimises the chance of missing the green</b>, then the <b>shortest expected putt</b> — eventually optimising every shot to your strategy, or strictly to <b>lowest expected score</b>.</p>
    </div>`;
}
function buildPlanShot(){
  const wrap=document.getElementById('planshot-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    ${psTargetsHTML()}
    <div class="profile-card">
      <h3>3 · Effective Yardage &amp; Number to Play <span style="font-family:ui-monospace,monospace;font-size:.55rem;font-weight:400;color:var(--muted);text-transform:none">tap a term to open its detail</span></h3>
      <div id="ps-equation"></div>
      <div id="ps-detail"></div>
      <div id="ps-result"></div>
    </div>`;
  psRenderEquation(); psRenderDetail(); psRenderResult();
}
function psRenderEquation(){
  const el=document.getElementById('ps-equation'); if(!el) return;
  const chip=(t)=>{
    const d=psDelta(t.key);
    const open = t.key===psOpenKey;
    let txt, col;
    if(t.base){ txt = (psNum(psShot.static)? Math.round(d) : '—'); col='var(--ink)'; }
    else { const r=Math.round(d); txt = (r>0?'+':r<0?'−':'')+Math.abs(r); col = r>0?'#d96070':r<0?'#1a5aaa':'var(--muted)'; }
    return `<button onclick="psOpenTerm('${t.key}')" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;
        background:${open?'var(--bg2)':'transparent'};border:1px solid ${open?'var(--border2)':'transparent'};border-radius:8px;padding:3px 7px;margin:1px">
      <span style="font-family:ui-monospace,monospace;font-size:.84rem;font-weight:800;color:${col}">${txt}</span>
      <span style="font-family:Arial,sans-serif;font-size:.54rem;font-weight:700;letter-spacing:.03em;color:var(--muted);text-transform:uppercase">${t.label}</span>
    </button>`;
  };
  const plus=`<span style="font-family:ui-monospace,monospace;font-size:.9rem;color:var(--muted);align-self:flex-start;margin-top:4px">+</span>`;
  const eff=Math.round(psEffective());
  el.innerHTML=`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px 0 8px">
      <span style="font-family:Arial,sans-serif;font-size:.7rem;font-weight:800;color:var(--ink2);margin-right:4px">Eff =</span>
      ${PS_TERMS.map((t,i)=>(i>0?plus:'')+chip(t)).join('')}
      <span style="font-family:ui-monospace,monospace;font-size:.9rem;color:var(--muted);align-self:flex-start;margin-top:4px">=</span>
      <span style="font-family:ui-monospace,monospace;font-size:1.05rem;font-weight:800;color:var(--accent,#c4427a);align-self:flex-start;margin-top:1px">${psNum(psShot.static)?eff+' yd':'—'}</span>
    </div>`;
}
const psField=(label,inner)=>`<div class="edit-field" style="grid-column:1/-1"><label>${label}</label>${inner}</div>`;
const psSel=(key,opts)=>`<select onchange="psSet('${key}',this.value,true)">`+
  opts.map(o=>`<option value="${o[0]}"${psShot[key]===o[0]?' selected':''}>${o[1]}</option>`).join('')+`</select>`;
const psNote=(t)=>`<div style="font-family:Arial,sans-serif;font-size:.74rem;color:var(--ink2);line-height:1.5;margin-top:6px">${t}</div>`;
const psContrib=(key)=>{ const d=Math.round(psDelta(key)); const c=d>0?'#d96070':d<0?'#1a5aaa':'var(--muted)';
  return `<div style="font-family:ui-monospace,monospace;font-size:.7rem;font-weight:700;color:${c};margin-top:6px">contribution: ${d>0?'+':d<0?'−':''}${Math.abs(d)} yd</div>`; };

function psDetailHTML(key){
  switch(key){
    case 'static': return psField('Measured yardage to target (yd)',
      `<input id="ps-static" type="number" value="${escapeHtml(psShot.static)}" oninput="psSet('static',this.value)" placeholder="e.g. 155">`)
      +psNote('The base, dead-flat, no-wind, baseline-air number to your aim point.');
    case 'lie': return psField('Ball lie', psSel('lie',[
        ['fairway','Fairway / tee box — clean'],['lightrough','Light or wet rough — flyer risk (+, less spin, more release)'],
        ['heavyrough','Heavy rough — can\'t compress (−, comes up short)'],['bunker','Fairway bunker (−, pick it clean)'],
        ['divot','Divot / tight (−, ball-first, flighted)'],['hardpan','Hardpan (−, lower, less spin)'],['tee','Off a tee (+, optimal launch)']]))
      +psNote('Flyers from light/wet rough or down-grain lose backspin — they fly and release <b>longer</b>. Heavy rough steals clubhead speed and comes up short.')
      +psContrib('lie');
    case 'stance': return psField('Side Slope at Point of Influence', psSel('stance',[
        ['flat','Flat / level'],['above','Ball above feet (RH: flatter, pulls left)'],['below','Ball below feet (RH: upright, pushes right)'],
        ['uphill','Uphill lie (adds loft — higher, shorter)'],['downhill','Downhill lie (delofts — lower, longer)']]))
      +psNote('Uphill lies add dynamic loft (higher, shorter); downhill lies deloft (lower, longer). Ball above/below the feet bends start line and shaves a touch of distance.')
      +psContrib('stance');
    case 'wind': return `<div class="edit-grid">
        <div class="edit-field"><label>Wind speed (mph)</label><input id="ps-windspd" type="number" value="${escapeHtml(psShot.windspd)}" oninput="psSet('windspd',this.value)" placeholder="0"></div>
        <div class="edit-field"><label>Direction</label>${psSel('winddir',[
          ['calm','Calm'],['head','Into (headwind)'],['tail','Down (tailwind)'],['crossL','Cross — L-to-R'],['crossR','Cross — R-to-L']])}</div>
      </div>`
      +psNote(`Headwind costs ~<b>1%/mph</b>, tailwind helps only ~<b>0.5%/mph</b> — wind hurts about twice as much as it helps. Crosswind is ~<b>${PS_CROSS_YPM} yd/mph</b> of drift (aim, not distance). A knockdown roughly halves these effects.`)
      +psContrib('wind');
    case 'topo': return psField('Elevation to target (yd, + uphill / − downhill)',
      `<input id="ps-elev" type="number" value="${escapeHtml(psShot.elev)}" oninput="psSet('elev',this.value)" placeholder="0">`)
      +psNote(`Geometric model: yards lost ≈ elevation ÷ tan(landing angle). At this distance/shot the ball lands ≈ <b>${Math.round(psLandAngle())}°</b>, so a steep-landing shot (wedge or high ball) loses <b>less</b> per foot uphill than a shallow one (long iron or knockdown). Downhill gives back ~⅔ of the uphill cost — set the <b>Shot</b> type to flatten or steepen the flight.`)
      +psContrib('topo');
    case 'shot': return psField('Shot type / trajectory', psSel('shot',[
        ['stock','Stock — full, normal flight'],['knockdown','Knockdown / three-quarter (−, dampens wind)'],['high','High / soft (more wind effect)']]))
      +psNote('A knockdown flies lower and shorter but is far less wind-sensitive and gives up more on uphill shots; a high, soft shot stops fast, holds uphill better, but the wind has more time to act on it.')
      +psContrib('shot');
  }
  return '';
}
function psRenderDetail(){
  const el=document.getElementById('ps-detail'); if(!el) return;
  const t=PS_TERMS.find(x=>x.key===psOpenKey)||PS_TERMS[0];
  el.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:11px 12px;margin-top:4px">
      <div style="font-family:Arial,sans-serif;font-weight:800;font-size:.82rem;color:var(--ink);margin-bottom:7px">${t.label}${t.base?'':' adjustment'}</div>
      ${psDetailHTML(t.key)}
    </div>`;
}
function psRenderResult(){
  const out=document.getElementById('ps-result'); if(!out) return;
  const S=psNum(psShot.static);
  if(S<=0){ out.innerHTML=`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-family:Arial,sans-serif;font-size:.78rem;color:var(--muted)">Open <b>Static</b> above and enter your measured yardage to see the number to play.</div>`; return; }
  const eff=psEffective(), rollout=psNum(psShot.rollout), carry=eff-rollout;
  const minCarry=psNum(psShot.minCarry);
  const cross=psCrosswind();
  /* Closest club by carry-to-play, but a forced (minimum) carry rules out clubs that can't
     clear it — a club with the right TOTAL but insufficient CARRY isn't an option. */
  let best=null,bestDiff=1e9,anyClear=false;
  (STATE.clubs||[]).forEach(c=>{ if(c.type==='putter')return; const cc=perf(c.id).carry||0; if(cc<=0)return;
    if(minCarry>0 && cc<minCarry) return; anyClear=true;
    const d=Math.abs(cc-carry); if(d<bestDiff){bestDiff=d;best=c;} });
  const rowL='font-family:Arial,sans-serif;font-weight:800;color:var(--ink)';
  out.innerHTML=`
    <div style="border-top:2px solid var(--border2);margin-top:10px;padding-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0">
        <span style="${rowL};font-size:.86rem">Effective (plays-like)</span>
        <span style="font-family:ui-monospace,monospace;font-weight:800;font-size:1.1rem;color:var(--accent,#c4427a)">${Math.round(eff)} yd</span>
      </div>
      <div class="edit-grid" style="margin-top:6px">
        <div class="edit-field"><label>Expected rollout (yd)</label><input id="ps-rollout" type="number" value="${escapeHtml(psShot.rollout)}" oninput="psSet('rollout',this.value)" placeholder="firm = more roll"></div>
        <div class="edit-field"><label>Min carry — forced carry (yd)</label><input id="ps-mincarry" type="number" value="${escapeHtml(psShot.minCarry)}" oninput="psSet('minCarry',this.value)" placeholder="carry the bunker / water"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0 4px">
        <span style="${rowL};font-size:.92rem">Carry to play</span>
        <span style="font-family:ui-monospace,monospace;font-weight:800;font-size:1.3rem;color:var(--ink)">${Math.round(carry)} yd</span>
      </div>
      ${best?`<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2)">Closest club: <b style="color:var(--ink)">${best.label}</b> <span style="color:var(--muted)">(${perf(best.id).carry} yd carry, ${bestDiff<1?'spot on':Math.round(bestDiff)+' yd '+(perf(best.id).carry>carry?'long':'short')}${minCarry>0?' · clears the '+minCarry+' yd carry':''})</span></div>`
        : (minCarry>0&&!anyClear ? `<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--gold)">No club carries ${minCarry} yd — the forced carry isn't reachable.</div>` : '')}
      ${cross?`<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2)">Crosswind: aim <b style="color:var(--ink)">${Math.round(cross.yd)} yd ${cross.dir}</b> of target</div>`:''}
      <div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1.5">Rough estimates — refine each term from your own data.</div>
    </div>`;
}

/* ---- handlers ---- */
function psSet(key,val,reRenderDetail){
  psShot[key]=val;
  psRenderEquation(); psRenderResult();
  if(reRenderDetail) psRenderDetail();
}
function psOpenTerm(key){ psOpenKey=key; psRenderEquation(); psRenderDetail(); }

/* Long Term Plans — season arc from the profile (goal handicap, volume). */
function buildLongTerm(){
  const wrap=document.getElementById('longterm-wrap'); if(!wrap) return;
  const pf=STATE.profile||{};
  const cell=(label,val)=>`<div class="stat-cell"><div class="stat-label">${label}</div><div class="stat-value">${val||'—'}</div></div>`;
  wrap.innerHTML=`<div class="profile-card" style="margin-top:0">
    <h3>Handicap Goal</h3>
    <div class="detail-stats">
      ${cell('Current', pf.handicap)}
      ${cell('Goal', pf.goalHcp)}
      ${cell('Rounds / yr', pf.roundsPerYear)}
      ${cell('Practice / yr', pf.practicePerYear)}
    </div>
    <p class="gen-note" style="margin-top:10px">Edit these in Locker Room → Myself. Your goal handicap drives the SG diamond goal ring.</p>
  </div>
  <div class="profile-card">
    <h3>Milestones <span style="font-family:ui-monospace,monospace;font-size:.55rem;font-weight:400;color:var(--muted);text-transform:none">preview</span></h3>
    <p class="gen-note">Season targets and dated milestones — tie each to a link in the causal chain and track the trend. Coming soon.</p>
  </div>`;
}

// Expose for inline handlers and the renderAll orchestrator.
Object.assign(window, { buildPlanShot, psSet, psOpenTerm, buildLongTerm,
  PS_WIND_HEAD, PS_WIND_TAIL, PS_CROSS_YPM, PS_ELEV_K });
