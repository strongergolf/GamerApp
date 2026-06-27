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
/* PLAN → Situational Considerations (mindset framers, not part of the yardage maths). */
const psSituation = { qualify:'', match:'', team:'', endgame:'' };
let psOpenKey = 'static';

/* ============================================================
   EXECUTE — setup → impact-condition model (prototype, provisional magnitudes).
   Each physical-routine variable is a 5-point slider (idx 0..4, centre 2 = neutral). Per-notch
   deltas accumulate into impact conditions (face / path / attack / dynamic loft / strike / speed),
   then run through the app's D-plane engine (dpSolve) so the panel shows the expected change in
   start line, shape, launch and compression. Directions + rough scale come from the ball-flight
   (D-plane) laws used app-wide and standard launch-monitor findings; magnitudes are PRESUMED
   until calibrated to the player's own captured data.
   ============================================================ */
const PSE_BASE = { face:0, path:0, dynLoft:30, aoa:-4, carry:160 };   // reference mid-iron
const pseIdx = {};                                                    // key -> 0..4 (default 2)
const pseGet = k => (pseIdx[k]==null ? 2 : pseIdx[k]);
const PSE_SEC = ['Set club in place','Grip the club','Set upper body','Set lower body'];
const PSE_SEC_NUM = { 'Set club in place':3, 'Grip the club':4, 'Set upper body':5, 'Set lower body':6 };
const PSE_VARS = [
  { key:'lean', sec:'Set club in place', label:'Shaft lean', tag:'dyn loft',
    opts:['Well back','Slightly back','Vertical','Slightly forward','Well forward'],
    per:{ dynLoft:-3, aoa:-1 },
    desc:'Forward shaft lean removes dynamic loft (~1° per ° of lean) for a lower, more compressed strike and a slightly steeper attack; leaning back adds loft and height.' },
  { key:'topStr', sec:'Grip the club', label:'Top hand — strength', tag:'face',
    opts:['Weak','Slightly weak','Neutral','Slightly strong','Strong'],
    per:{ face:-2.5, dynLoft:-0.4 },
    desc:'The lead hand is the main face controller: a stronger grip (rotated away from target) presents a more closed face at impact — a draw/hook bias; weaker opens it for a fade/slice.' },
  { key:'topPlace', sec:'Grip the club', label:'Top hand — placement', tag:'release',
    opts:['Deep in palm','Slightly palm','Neutral','Slightly fingers','In the fingers'],
    per:{ speed:1.0, face:-0.8 },
    desc:'Holding the lead hand more in the fingers frees wrist hinge — more clubhead speed and more face rotation (release, a touch of close); deeper in the palm holds the face and trims speed.' },
  { key:'botStr', sec:'Grip the club', label:'Bottom hand — strength', tag:'face',
    opts:['Weak','Slightly weak','Neutral','Slightly strong','Strong'],
    per:{ face:-1.5 },
    desc:'The trail hand rotates the face closed through impact when stronger (draw bias) and holds it open when weaker (fade bias) — a secondary face influence to the lead hand.' },
  { key:'botPlace', sec:'Grip the club', label:'Bottom hand — placement', tag:'release',
    opts:['Deep in palm','Slightly palm','Neutral','Slightly fingers','In the fingers'],
    per:{ speed:0.7, face:-0.6 },
    desc:'Trail hand in the fingers adds hinge and snap (speed + release); in the palm it steadies the face and slows the release.' },
  { key:'upPos', sec:'Set upper body', label:'Position', tag:'low point',
    opts:['Well back','Slightly back','Centered','Slightly ahead','Well ahead'],
    per:{ lowPt:0.75, aoa:-1.0, dynLoft:-1.0 },
    desc:'Sternum ahead of the ball moves low point forward → ball-first contact, a steeper attack and a delofted, lower flight; behind the ball raises launch but risks thin/fat strikes.' },
  { key:'upAlign', sec:'Set upper body', label:'Alignment', tag:'path',
    opts:['Closed','Slightly closed','Square','Slightly open','Open'],
    per:{ path:-2.0 },
    desc:'Shoulder alignment sets swing direction: open swings the club out-to-in (pull / fade path), closed in-to-out (push / draw path). Path drives most of the curve direction in the D-plane.' },
  { key:'upTilt', sec:'Set upper body', label:'Tilt', tag:'attack',
    opts:['Toward target','Slightly toward','Level','Slightly away','Away from target'],
    per:{ aoa:1.0, path:0.8, dynLoft:0.5 },
    desc:'Secondary (side) tilt away from target shallows the attack upward, tilts the path in-to-out and adds launch — the classic hit-up driver setup; tilting toward steepens and lowers it.' },
  { key:'loPos', sec:'Set lower body', label:'Position (weight)', tag:'low point',
    opts:['Well back','Slightly back','Centered','Slightly forward','Well forward'],
    per:{ lowPt:0.6, aoa:-0.6, dynLoft:-0.5 },
    desc:'Lead-side weight pulls low point forward for ball-first compression and a lower flight; trail-side weight hangs back, launching higher with less compression.' },
  { key:'loAlign', sec:'Set lower body', label:'Alignment', tag:'path',
    opts:['Closed','Slightly closed','Square','Slightly open','Open'],
    per:{ path:-1.2 },
    desc:'Open hips and feet pre-set an out-to-in path and quicker lead-side clearance; closed promotes an in-to-out path. A weaker path influence than the shoulders.' },
  { key:'loTilt', sec:'Set lower body', label:'Tilt', tag:'attack',
    opts:['Toward target','Slightly toward','Level','Slightly away','Away from target'],
    per:{ aoa:0.5, path:0.4 },
    desc:'Trail-side pelvic tilt supports an upward strike and in-to-out path; tilt toward the target steepens the attack.' }
];
/* accumulate per-notch deltas, then solve ball flight vs the neutral baseline */
function pseNet(){
  const acc={face:0,path:0,aoa:0,dynLoft:0,speed:0,lowPt:0};
  PSE_VARS.forEach(v=>{ const n=pseGet(v.key)-2; for(const k in v.per) acc[k]+=v.per[k]*n; });
  const cur=dpSolve(PSE_BASE.face+acc.face, PSE_BASE.path+acc.path, PSE_BASE.dynLoft+acc.dynLoft, PSE_BASE.aoa+acc.aoa, PSE_BASE.carry);
  const base=dpSolve(PSE_BASE.face, PSE_BASE.path, PSE_BASE.dynLoft, PSE_BASE.aoa, PSE_BASE.carry);
  return { acc, shape:cur.shape, spinAxis:cur.spinAxis,
    dStart: cur.hLaunch-base.hLaunch, dLaunch: cur.vLaunch-base.vLaunch,
    dSpinLoft: cur.spinLoft-base.spinLoft, dCurve: cur.curveYds-base.curveYds };
}
/* per-slider live contribution text */
function pseEffText(v){
  const n=pseGet(v.key)-2;
  if(n===0) return '<span style="opacity:.7">neutral — no change</span>';
  const nm={face:'face',path:'path',aoa:'AoA',dynLoft:'loft',speed:'speed',lowPt:'low-pt'};
  const unit={face:'°',path:'°',aoa:'°',dynLoft:'°',speed:' mph',lowPt:'″'};
  const word={ face:f=>f<0?'closes':'opens', path:p=>p<0?'out-to-in':'in-to-out', aoa:a=>a<0?'steeper':'shallower',
    dynLoft:d=>d<0?'delofts':'adds loft', speed:s=>s>0?'faster':'slower', lowPt:l=>l>0?'fwd':'back' };
  const parts=[]; let primary=null;
  for(const k in v.per){ const val=v.per[k]*n; if(primary===null) primary=k;
    const s=(val>0?'+':'−')+Math.abs(val).toFixed(Math.abs(val)<1?1:0)+unit[k];
    parts.push(`${s} ${nm[k]}`); }
  return `${parts.join(' · ')} <span style="opacity:.7">— ${word[primary](v.per[primary]*n)}</span>`;
}
function pseReadoutInner(){
  const net=pseNet(), a=net.acc;
  const sg=(x,d,u)=>`${x>0?'+':x<0?'−':''}${Math.abs(x).toFixed(d)}${u||''}`;
  const startTxt = Math.abs(net.dStart)<0.15 ? 'on line' : `${Math.abs(net.dStart).toFixed(1)}° ${net.dStart>0?'right':'left'}`;
  const shapeTxt = net.shape==='Straight' ? 'straight' : `${net.shape.toLowerCase()} ${Math.abs(net.dCurve).toFixed(0)} yd`;
  const compTxt = a.lowPt>0.3 ? `ball-first (low pt +${a.lowPt.toFixed(1)}″)` : a.lowPt<-0.3 ? `low pt ${a.lowPt.toFixed(1)}″ back` : 'neutral strike';
  const bits=[`Starts <b>${startTxt}</b>`];
  if(net.shape!=='Straight') bits.push(`<b>${shapeTxt}</b>`);
  bits.push(`launch <b>${sg(net.dLaunch,1,'°')}</b>`, `<b>${compTxt}</b>`);
  return `
    <div class="sgv-readout-head">Expected Effect on Swing &amp; Ball Flight <span class="sgv-prov">prototype · presumed</span></div>
    <div class="sgv-impact">
      <span>Face <b>${sg(a.face,1,'°')}</b></span>
      <span>Path <b>${sg(a.path,1,'°')}</b></span>
      <span>Face-to-path <b>${sg(a.face-a.path,1,'°')}</b></span>
      <span>Attack <b>${sg(a.aoa,1,'°')}</b></span>
      <span>Dyn loft <b>${sg(a.dynLoft,1,'°')}</b></span>
      <span>Low point <b>${sg(a.lowPt,1,'″')}</b></span>
      <span>Speed <b>${sg(a.speed,1,' mph')}</b></span>
    </div>
    <div class="sgv-shot">
      <div class="sgv-shot-cell"><span class="sgv-k">Start line</span><span class="sgv-v">${startTxt}</span></div>
      <div class="sgv-shot-cell"><span class="sgv-k">Shape</span><span class="sgv-v">${shapeTxt}</span></div>
      <div class="sgv-shot-cell"><span class="sgv-k">Launch Δ</span><span class="sgv-v">${sg(net.dLaunch,1,'°')}</span></div>
      <div class="sgv-shot-cell"><span class="sgv-k">Spin loft Δ</span><span class="sgv-v">${sg(net.dSpinLoft,1,'°')}</span></div>
    </div>
    <div style="font-family:Arial,sans-serif;font-size:.76rem;color:var(--ink2);line-height:1.5;margin-top:10px">${bits.join(' · ')}.</div>
    <div class="sgv-readout-foot">vs. a neutral setup on a reference mid-iron (30° dyn loft, −4° attack, 160 yd). <button type="button" class="sgv-reset" onclick="pseResetSetup()">Reset to neutral</button></div>`;
}
function pseRow(v){ const idx=pseGet(v.key);
  return `<div class="sgv-row">
      <div class="sgv-meta"><span class="sgv-label">${v.label}</span><span class="sgv-sub">${v.tag}</span></div>
      <div class="sgv-slider-row">
        <input type="range" class="sgv-range pse-range" data-key="${v.key}" min="0" max="4" step="1" value="${idx}" oninput="pseSetIdx('${v.key}',this.value)">
        <span class="sgv-cur pse-cur" data-key="${v.key}">${v.opts[idx]}</span>
      </div>
      <div class="sgv-eff pse-eff" data-key="${v.key}">${pseEffText(v)}</div>
    </div>`;
}
function pseHowHTML(){
  const rows=PSE_VARS.map(v=>`<div style="margin:7px 0"><b style="color:var(--ink);font-family:Arial,sans-serif;font-size:.8rem">${v.label}</b> <span style="color:var(--muted);font-family:ui-monospace,monospace;font-size:.56rem;text-transform:uppercase;letter-spacing:.04em">${v.sec}</span><br><span style="color:var(--ink2);font-size:.78rem;line-height:1.5">${v.desc}</span></div>`).join('');
  return `<details class="defs-dropdown" style="margin-top:12px"><summary>How these work — theory &amp; sources</summary>
    <div>
      <p class="gen-note" style="margin:0 0 8px">Each control maps to impact conditions, then through the app's <b>D-plane ball-flight engine</b> (the same laws used across StrongerGolf) to a start line, shape, launch and strike. Magnitudes are <b>provisional / Presumed</b> — they encode the correct directions and rough scale from ball-flight theory and standard launch-monitor findings, and should be refined against your own captured data.</p>
      ${rows}
    </div></details>`;
}
function pseSetIdx(key,val){ pseIdx[key]=Math.max(0,Math.min(4,Math.round(parseFloat(val)||0))); pseRefresh(); }
function pseRefresh(){
  PSE_VARS.forEach(v=>{ const c=document.querySelector(`.pse-cur[data-key="${v.key}"]`), e=document.querySelector(`.pse-eff[data-key="${v.key}"]`);
    if(c) c.textContent=v.opts[pseGet(v.key)]; if(e) e.innerHTML=pseEffText(v); });
  const ro=document.getElementById('pse-readout'); if(ro) ro.innerHTML=pseReadoutInner();
}
function pseResetSetup(){ PSE_VARS.forEach(v=>{ pseIdx[v.key]=2; const r=document.querySelector(`.pse-range[data-key="${v.key}"]`); if(r) r.value=2; }); pseRefresh(); }

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
const PS_SUB='font-family:ui-monospace,monospace;font-size:.55rem;font-weight:400;color:var(--muted);text-transform:none';

/* PLAN box 1 — Situational Considerations: frame the stakes before building the number. */
function psSituationHTML(){
  return `
    <div class="profile-card" style="margin-top:0">
      <h3>1 · Situational Considerations</h3>
      <p class="intro-note" style="margin:0 0 10px">Frame the shot before you build the number — the stakes shape your target and how much risk is worth it.</p>
      <div class="edit-grid">
        <div class="edit-field"><label>Qualifying — score / position</label>${psSelSit('qualify',[['','—'],['none','Not qualifying — free roll'],['score','Need a score'],['position','Need a position'],['cut','Making the cut']])}</div>
        <div class="edit-field"><label>Match play</label>${psSelSit('match',[['','—'],['na','Not match play'],['square','All square'],['up','Up in the match'],['down','Down in the match'],['dormie','Dormie'],['mustwin','Must win this hole'],['safe','Can play safe / concede']])}</div>
        <div class="edit-field"><label>Team format</label>${psSelSit('team',[['','—'],['individual','Individual'],['fourball','Fourball — best ball'],['foursomes','Foursomes — alternate shot'],['scramble','Scramble'],['shamble','Shamble']])}</div>
        <div class="edit-field"><label>End-game scenario</label>${psSelSit('endgame',[['','—'],['regular','Regular — mid-round'],['protect','Closing holes — protect lead'],['chase','Closing holes — must attack'],['back9final','Back 9, final round']])}</div>
      </div>
    </div>`;
}
/* PLAN box 2 — Target Selection: tee aim + approach target folded together (was boxes 1 & 2). */
function psTargetHTML(){
  return `
    <div class="profile-card">
      <h3>2 · Target Selection <span style="${PS_SUB}">evolving</span></h3>
      <div class="edit-grid">
        <div class="edit-subhead">Tee shot</div>
        <div class="edit-field" style="grid-column:1/-1"><label>Aim line</label>${psSel('teeAim',[['','—'],['left-edge','Left edge'],['left-centre','Left-centre'],['centre','Centre'],['right-centre','Right-centre'],['right-edge','Right edge']])}</div>
        <div class="edit-subhead">Approach</div>
        <div class="edit-field"><label>Lateral (vs pin)</label>${psSel('apprLat',[['','—'],['left','Left'],['centre','Centre'],['right','Right']])}</div>
        <div class="edit-field"><label>Depth (vs pin)</label>${psSel('apprDepth',[['','—'],['short','Short'],['pin','Pin-high'],['long','Long']])}</div>
      </div>
      <p class="intro-note" style="margin:10px 0 0">Coming: overlay your <b>86% dispersion pattern</b> on the hole to auto-pick the aim that <b>avoids trouble &amp; minimises expected score</b> — tee aim favouring the shortest route to the pin, and an approach target that <b>minimises the chance of missing the green</b>, then the shortest expected putt. Powered by the Course Map.</p>
    </div>`;
}
/* EXECUTE — the physical pre-shot routine, run top to bottom. Steps 1-2 & 7-8 are action
   reminders; steps 3-6 are 5-point sliders whose live effect on swing & ball flight is
   quantified in the panel below. */
function psExecuteHTML(){
  const head=t=>`<div class="edit-subhead">${t}</div>`;
  const note=t=>`<p class="gen-note" style="margin:0 0 4px">${t}</p>`;
  const sliders=sec=>PSE_VARS.filter(v=>v.sec===sec).map(pseRow).join('');
  return `
    <div class="profile-card" style="margin-top:0">
      <h3>Physical Pre-Shot Routine <span style="${PS_SUB}">run in order · live setup effects</span></h3>
      ${head('1 · Practice swing / bump')}${note('Rehearse the feel, tempo and low-point of the exact shot you just planned.')}
      ${head('2 · Intermediate target')}${note('Pick a spot a few feet in front of the ball, on the line to your distant TARGET — you aim to this, not the target itself.')}
      ${head('3 · Set club in place')}${note('Sole the club and <b>aim the FACE at the intermediate target</b>, then set your hands for the intended shaft lean.')}
      ${sliders('Set club in place')}
      ${head('4 · Grip the club')}
      ${sliders('Grip the club')}
      ${head('5 · Set upper body')}
      ${sliders('Set upper body')}
      ${head('6 · Set lower body')}
      ${sliders('Set lower body')}
      ${head('7 · Waggle &amp; look')}${note('Waggle to stay athletic and free of tension; take one last look down the line at the TARGET in the distance.')}
      ${head('8 · Trigger')}${note('Use your TRIGGER (forward press, kick-in, breath) to start the takeaway — then commit, no second-guessing.')}
      <div id="pse-readout" class="sgv-readout" style="margin-top:14px">${pseReadoutInner()}</div>
      ${pseHowHTML()}
    </div>`;
}
function buildPlanShot(){
  const wrap=document.getElementById('planshot-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:6px">Plan</div>
    ${psSituationHTML()}
    ${psTargetHTML()}
    <div class="profile-card">
      <h3>3 · Effective Yardage &amp; Number to Play <span style="${PS_SUB}">tap a term to open its detail</span></h3>
      <div id="ps-equation"></div>
      <div id="ps-detail"></div>
      <div id="ps-result"></div>
    </div>
    <div class="section-label">Execute</div>
    ${psExecuteHTML()}`;
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
/* Situational-considerations selects — stored only (not part of the yardage maths). */
function psSetSit(key,val){ psSituation[key]=val; }
const psSelSit=(key,opts)=>`<select onchange="psSetSit('${key}',this.value)">`+
  opts.map(o=>`<option value="${o[0]}"${psSituation[key]===o[0]?' selected':''}>${o[1]}</option>`).join('')+`</select>`;
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
Object.assign(window, { buildPlanShot, psSet, psSetSit, psOpenTerm, buildLongTerm,
  pseSetIdx, pseResetSetup,
  PS_WIND_HEAD, PS_WIND_TAIL, PS_CROSS_YPM, PS_ELEV_K });
