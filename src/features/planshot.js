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

/* transient shot state (not persisted — a shot is planned, then forgotten).
   windAngle: deg the wind comes FROM, 0 = straight into you, clockwise (90 = off the right).
   stanceX/stanceY: overhead lie dial, −1..1 each. +X = ball below feet, +Y = uphill. */
const psShot = { teeAim:'', apprLat:'', apprDepth:'', static:'', lie:'fairway',
  stanceX:0, stanceY:0, windspd:'', windAngle:0, elev:'', shot:'stock', rollout:'', minCarry:'' };
/* PLAN → Situational Considerations (mindset framers, not part of the yardage maths). */
const psSituation = { qualify:'', match:'', team:'', endgame:'' };
/* PLAN box 2 — Target Selection: 5-point sliders (selection only for now; will feed the
   course-map dispersion overlay once that lands). idx 0..4, centre 2. */
const PS_TGT = [
  { key:'teeAim',    label:'Tee — aim line',             tag:'tee',     opts:['Left edge','Left-centre','Centre','Right-centre','Right edge'] },
  { key:'apprLat',   label:'Approach — lateral (vs pin)',tag:'lateral', opts:['Well left','Slightly left','At the pin','Slightly right','Well right'] },
  { key:'apprDepth', label:'Approach — depth (vs pin)',  tag:'depth',   opts:['Well short','Slightly short','Pin-high','Slightly long','Well long'] }
];
const psTgtIdx = {};
const psTgtGet = k => (psTgtIdx[k]==null ? 2 : psTgtIdx[k]);
/* POST-SHOT routine — transient per-shot review. */
const psPost = {};
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
/* Stance is a 2-D overhead dial (stanceX +=ball below feet, stanceY +=uphill, each −1..1).
   Effects are ASYMMETRIC: ball ABOVE feet (RH) hooks far more than the same slope BELOW feet —
   above the ball golfers grip down (raising the shaft, pointing the 3-D face left, and shaving a
   little speed), but below it they can't lengthen the club, so the mirror effect is weaker. */
const PS_STANCE_K = {
  distAlong:6,   // downhill +6 / uphill −6 yd at full slope
  distAbove:4,   // ball above feet: grip-down speed loss → a touch shorter
  distBelow:2,   // ball below feet: minor distance loss
  dirAbove:3.6,  // ball-above-feet finish-LEFT degrees (RH) — the big one
  dirBelow:1.8,  // ball-below-feet finish-RIGHT degrees — ~half (the asymmetry)
  dirAlong:1.0   // downhill push-right / uphill pull-left degrees
};
/* Shot-type trajectory. d = plays-like yards, w = wind-sensitivity multiplier, land = ° added to
   the landing angle (steeper = stops faster), note = description for the detail panel. */
const PS_SHOT = {
  stinger:  { d:-3,  w:0.45, land:-10, label:'Stinger — knifes through wind, lots of release',           note:'Stinger / driving shot: minimal height, knifes through wind, releases a lot on landing.' },
  knockdown:{ d:-8,  w:0.60, land:-7,  label:'Knockdown / ¾ — lower & shorter, wind-cheating',           note:'Knockdown / three-quarter: lower and shorter, far less wind-sensitive, gives up more on uphills.' },
  stock:    { d:0,   w:1.00, land:0,   label:'Stock — your normal full flight',                          note:'Stock: your normal full-flight trajectory.' },
  high:     { d:-2,  w:1.25, land:7,   label:'High / soft — stops fast, holds uphill',                   note:'High / soft: extra height stops it fast and holds uphill, but the wind has more time to act.' },
  flop:     { d:-10, w:1.40, land:14,  label:'Flop — max height, lands almost vertically',               note:'Flop / max height: very high and short, lands almost vertically; the most wind-affected.' }
};
const psShotDef = () => PS_SHOT[psShot.shot] || PS_SHOT.stock;
const psWindMult = () => psShotDef().w;

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
  land += psShotDef().land;
  return Math.max(22, Math.min(72, land));
}
/* Topography (geometric): yards lost ≈ Δelev / tan(landing angle). Steeper landings lose less
   per foot uphill; downhill gives back ~2/3 of the uphill cost. */
function psTopoDelta(){
  const elev=psNum(psShot.elev); if(!elev) return 0;
  const factor=1/Math.tan(psLandAngle()*Math.PI/180);
  return elev>=0 ? elev*factor : elev*factor*0.67;
}
/* Wind resolved into head/tail (cos) + crosswind (sin) from a single speed + direction dial.
   head + = into you (plays longer); cross + = wind from the right (pushes ball left ⇒ aim right). */
function psWindComp(){
  const s=psNum(psShot.windspd), a=psNum(psShot.windAngle)*Math.PI/180;
  return { head:s*Math.cos(a), cross:s*Math.sin(a) };
}
function psWindAimYd(){ return PS_CROSS_YPM*psWindComp().cross*psWindMult(); }   // + = aim right
/* Stance (overhead dial) → distance + ball-finish tendency, with the above/below asymmetry. */
function psStance(){
  const hx=psShot.stanceX||0, hy=psShot.stanceY||0, K=PS_STANCE_K;
  const distAlong  = -K.distAlong*hy;                                              // uphill(+) plays shorter
  const distAcross = hx<0 ? -K.distAbove*Math.abs(hx) : -K.distBelow*Math.abs(hx); // above feet loses more
  const finishAcross = hx<0 ? -K.dirAbove*Math.abs(hx) : K.dirBelow*Math.abs(hx);  // above → finish LEFT(−)
  const finishAlong  = -K.dirAlong*hy;                                             // uphill → pull left(−)
  return { hx, hy, dist:distAlong+distAcross, finishDeg:finishAcross+finishAlong };
}
/* per-term yardage delta for the current shot */
function psDelta(key){
  const S=psNum(psShot.static);
  switch(key){
    case 'static': return S;
    case 'lie':    return PS_LIE[psShot.lie]||0;
    case 'stance': return psStance().dist;
    case 'wind':   { const head=psWindComp().head;
                     const d = head>=0 ? S*PS_WIND_HEAD*head : S*PS_WIND_TAIL*head;  // into +, down −
                     return d*psWindMult(); }
    case 'topo':   return psTopoDelta();
    case 'shot':   return psShotDef().d;
  }
  return 0;
}
function psEffective(){ return ['static','lie','stance','wind','topo','shot'].reduce((s,k)=>s+psDelta(k),0); }
/* Lateral / start-direction picture: crosswind drift + the stance's D-plane tilt, each as an
   AIM offset in yards at the effective distance (+ = aim right, − = aim left). */
function psDirection(){
  const eff = Math.max(0, psEffective());
  const windYd = psWindAimYd();                                          // aim offset from crosswind
  const st = psStance();
  const stanceFinishYd = Math.tan(st.finishDeg*Math.PI/180) * eff;       // + = ball finishes right
  const stanceAimYd = -stanceFinishYd;                                   // aim opposite the finish bias
  return { eff, windYd, st, stanceFinishYd, stanceAimYd, netAimYd: windYd+stanceAimYd };
}
/* Setup tip to neutralise the lie, built from whichever dial component dominates. */
function psStanceTip(){
  const hx=psShot.stanceX||0, hy=psShot.stanceY||0;
  if(Math.abs(hx)<0.1 && Math.abs(hy)<0.1) return '';
  const parts=[];
  if(hx<=-0.1) parts.push('ball above feet → it hooks hard left; grip down, play it a touch back and aim right (or swing more around it)');
  else if(hx>=0.1) parts.push('ball below feet → it leaks right; add knee flex, stay in your posture and aim a little left');
  if(hy>=0.1) parts.push('uphill adds loft (higher, shorter) and a slight pull; lean with the slope, ball forward');
  else if(hy<=-0.1) parts.push('downhill delofts (lower, longer) and pushes right; lean with the slope, ball back');
  return parts.join('; ') + '.';
}

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
/* PLAN box 2 — Target Selection: tee aim + approach target as 5-point sliders. */
function psTgtRow(v){ const idx=psTgtGet(v.key);
  return `<div class="sgv-row">
      <div class="sgv-meta"><span class="sgv-label">${v.label}</span><span class="sgv-sub">${v.tag}</span></div>
      <div class="sgv-slider-row">
        <input type="range" class="sgv-range pstgt-range" data-key="${v.key}" min="0" max="4" step="1" value="${idx}" oninput="psTgtSetIdx('${v.key}',this.value)">
        <span class="sgv-cur pstgt-cur" data-key="${v.key}">${v.opts[idx]}</span>
      </div>
    </div>`;
}
function psTgtSetIdx(key,val){
  psTgtIdx[key]=Math.max(0,Math.min(4,Math.round(parseFloat(val)||0)));
  const v=PS_TGT.find(x=>x.key===key), c=document.querySelector(`.pstgt-cur[data-key="${key}"]`);
  if(v&&c) c.textContent=v.opts[psTgtGet(key)];
}
function psTargetHTML(){
  return `
    <div class="profile-card">
      <h3>2 · Target Selection <span style="${PS_SUB}">evolving · awaiting course-map overlay</span></h3>
      ${PS_TGT.map(psTgtRow).join('')}
      <p class="intro-note" style="margin:12px 0 0">Coming: overlay your <b>86% dispersion pattern</b> on the hole to auto-pick the aim that <b>avoids trouble &amp; minimises expected score</b> — tee aim favouring the shortest route to the pin, and an approach target that <b>minimises the chance of missing the green</b>, then the shortest expected putt. Powered by the Course Map.</p>
    </div>`;
}
/* EXECUTE — the physical pre-shot routine, run top to bottom. Steps 1-2 & 7-9 are action
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
      ${head('8 · Backswing Trigger')}${note('Use your TRIGGER (forward press, kick-in, breath) to start the takeaway — then commit, no second-guessing.')}
      ${head('9 · Release')}${note('Let it go — a free, full RELEASE of the clubhead through the ball to a balanced, held finish. Trust the plan; no steering.')}
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
      <h3>3 · Effective Yardage &amp; Direction Adjustments <span style="${PS_SUB}">tap a term to open its detail</span></h3>
      <div class="edit-subhead" style="margin:0 0 2px">Effects on Distance</div>
      <div id="ps-equation"></div>
      <div id="ps-detail"></div>
      <div id="ps-result"></div>
      <div class="edit-subhead" style="margin:16px 0 2px;border-top:1px solid var(--border);padding-top:12px">Effects on Start Direction</div>
      <div id="ps-direction"></div>
    </div>
    <div class="section-label">Execute</div>
    ${psExecuteHTML()}`;
  psRenderEquation(); psRenderDetail(); psRenderResult(); psRenderDirection();
}
function psRenderEquation(){
  const el=document.getElementById('ps-equation'); if(!el) return;
  const chip=(t)=>{
    const d=psDelta(t.key);
    const open = t.key===psOpenKey;
    let txt, col;
    if(t.base){ txt = (psNum(psShot.static)? Math.round(d) : '—'); col='var(--ink)'; }
    else { const r=Math.round(d); txt = (r>0?'+':r<0?'−':'')+Math.abs(r); col = r>0?'var(--gold)':r<0?'var(--sky)':'var(--muted)'; }
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
const psContrib=(key)=>{ const d=Math.round(psDelta(key)); const c=d>0?'var(--gold)':d<0?'var(--sky)':'var(--muted)';
  return `<div style="font-family:ui-monospace,monospace;font-size:.7rem;font-weight:700;color:${c};margin-top:6px">contribution: ${d>0?'+':d<0?'−':''}${Math.abs(d)} yd</div>`; };

function psDetailHTML(key){
  switch(key){
    case 'static': return psField('Measured yardage to target (yd)',
      `<input id="ps-static" type="number" value="${escapeHtml(psShot.static)}" oninput="psSet('static',this.value)" placeholder="e.g. 155">`)
      +psNote('The base, dead-flat, no-wind, baseline-air number to your target.');
    case 'lie': return psField('Ball lie', psSel('lie',[
        ['fairway','Fairway / tee box — clean'],['lightrough','Light or wet rough — flyer risk (+, less spin, more release)'],
        ['heavyrough','Heavy rough — can\'t compress (−, comes up short)'],['bunker','Fairway bunker (−, pick it clean)'],
        ['divot','Divot / tight (−, ball-first, flighted)'],['hardpan','Hardpan (−, lower, less spin)'],['tee','Off a tee (+, optimal launch)']]))
      +psNote('Flyers from light/wet rough or down-grain lose backspin — they fly and release <b>longer</b>. Heavy rough steals clubhead speed and comes up short.')
      +psContrib('lie');
    case 'stance': return `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
        ${psStanceDialSVG()}
        <div style="flex:1;min-width:150px">
          <div id="ps-stance-ro" class="ps-dial-ro">${psStanceRO()}</div>
          ${psNote('Drag the dot to your lie, <b>seen from above</b>: up/down = up-/downhill, left/right = ball above / below your feet, further out = steeper. Ball <b>above</b> the feet hooks markedly more than the same slope below — you grip down (raising the shaft so the 3-D face points left) and lose a touch of speed; below the feet you can\'t lengthen the club, so the effect is weaker.')}
        </div>
      </div>`;
    case 'wind': return `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
        ${psWindDialSVG()}
        <div style="flex:1;min-width:150px">
          <div class="edit-field" style="grid-column:auto"><label>Wind speed (mph)</label><input id="ps-windspd" type="number" value="${escapeHtml(psShot.windspd)}" oninput="psSet('windspd',this.value)" placeholder="0"></div>
          <div id="ps-wind-ro" class="ps-dial-ro" style="margin-top:7px">${psWindRO()}</div>
          ${psNote(`Spin the dial to where the wind is <b>coming from</b> (top = straight into you). Headwind ~<b>1%/mph</b>, tailwind ~<b>0.5%/mph</b>; crosswind ~<b>${PS_CROSS_YPM} yd/mph</b> of drift — head/tail and cross both fall out of one direction.`)}
        </div>
      </div>`;
    case 'topo': return `<div style="display:flex;gap:16px;align-items:stretch">
        <div class="ps-vert-wrap">
          <span class="ps-vert-cap">+35 up</span>
          <input id="ps-elev" type="range" class="ps-vert" min="-35" max="35" step="1" value="${psNum(psShot.elev)}" oninput="psSet('elev',this.value)">
          <span class="ps-vert-cap">−35 down</span>
        </div>
        <div style="flex:1;min-width:140px">
          <div style="font-family:Arial,sans-serif;font-weight:800;font-size:1.2rem;color:var(--ink)"><span id="ps-elev-val">${psNum(psShot.elev)>0?'+':''}${psNum(psShot.elev)} yd</span> <span style="font-size:.6rem;font-weight:400;color:var(--muted)">elevation</span></div>
          ${psNote(`Geometric model: yards lost ≈ elevation ÷ tan(landing angle). At this distance/shot the ball lands ≈ <b>${Math.round(psLandAngle())}°</b>, so a steep-landing shot (wedge or high ball) loses <b>less</b> per foot uphill than a shallow one (long iron or stinger). Downhill gives back ~⅔ of the uphill cost.`)}
          <div id="ps-topo-contrib" style="font-family:ui-monospace,monospace;font-size:.7rem;font-weight:700;margin-top:6px;color:${(()=>{const d=Math.round(psDelta('topo'));return d>0?'var(--gold)':d<0?'var(--sky)':'var(--muted)';})()}">contribution: ${(()=>{const d=Math.round(psDelta('topo'));return (d>0?'+':d<0?'−':'')+Math.abs(d);})()} yd</div>
        </div>
      </div>`;
    case 'shot': return psField('Shot type / trajectory', psSel('shot',[
        ['stinger','Stinger / driving'],['knockdown','Knockdown / ¾'],['stock','Stock'],['high','High / soft'],['flop','Flop / max height']]))
      +psNote(`${psShotDef().note} Wind sensitivity ×<b>${psShotDef().w}</b>; landing angle <b>${psShotDef().land>0?'+':''}${psShotDef().land}°</b>.`)
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
  psInitDials();
}
/* ---- Wind & Stance dials (draggable circular selectors) ---- */
function psWindDialSVG(){
  const a=psNum(psShot.windAngle)*Math.PI/180, R=34, C=50;
  const hx=C+R*Math.sin(a), hy=C-R*Math.cos(a);
  return `<svg id="ps-wind-dial" class="ps-dial" viewBox="0 0 100 100" data-r="${R}" data-c="${C}" data-kind="wind" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${C}" cy="${C}" r="${R}" fill="var(--surface)" stroke="var(--border2)" stroke-width="1.5"/>
    <line x1="${C}" y1="${C-R}" x2="${C}" y2="${C+R}" stroke="var(--border)" stroke-width="0.6"/>
    <line x1="${C-R}" y1="${C}" x2="${C+R}" y2="${C}" stroke="var(--border)" stroke-width="0.6"/>
    <text x="${C}" y="${C-R+8}" text-anchor="middle" class="ps-dial-lbl">INTO</text>
    <text x="${C}" y="${C+R-3}" text-anchor="middle" class="ps-dial-lbl">DOWN</text>
    <text x="${C-R+4}" y="${C+2.5}" text-anchor="middle" class="ps-dial-lbl">L</text>
    <text x="${C+R-4}" y="${C+2.5}" text-anchor="middle" class="ps-dial-lbl">R</text>
    <line class="ps-dial-arm" x1="${C}" y1="${C}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="var(--accent,#c4427a)" stroke-width="2"/>
    <circle cx="${C}" cy="${C}" r="2.2" fill="var(--ink2)"/>
    <circle class="ps-dial-knob" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5.5" fill="var(--accent,#c4427a)"/>
  </svg>`;
}
function psStanceDialSVG(){
  const R=34, C=50, hx=C+(psShot.stanceX||0)*R, hy=C-(psShot.stanceY||0)*R;
  return `<svg id="ps-stance-dial" class="ps-dial" viewBox="0 0 100 100" data-r="${R}" data-c="${C}" data-kind="stance" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${C}" cy="${C}" r="${R}" fill="var(--surface)" stroke="var(--border2)" stroke-width="1.5"/>
    <line x1="${C}" y1="${C-R}" x2="${C}" y2="${C+R}" stroke="var(--border)" stroke-width="0.6"/>
    <line x1="${C-R}" y1="${C}" x2="${C+R}" y2="${C}" stroke="var(--border)" stroke-width="0.6"/>
    <text x="${C}" y="${C-R+8}" text-anchor="middle" class="ps-dial-lbl">UPHILL</text>
    <text x="${C}" y="${C+R-3}" text-anchor="middle" class="ps-dial-lbl">DOWNHILL</text>
    <text x="${C-R+9}" y="${C+2.5}" text-anchor="middle" class="ps-dial-lbl">ABOVE</text>
    <text x="${C+R-9}" y="${C+2.5}" text-anchor="middle" class="ps-dial-lbl">BELOW</text>
    <line class="ps-dial-arm" x1="${C}" y1="${C}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="var(--accent,#c4427a)" stroke-width="2"/>
    <circle cx="${C}" cy="${C}" r="2.2" fill="var(--ink2)"/>
    <circle class="ps-dial-knob" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5.5" fill="var(--accent,#c4427a)"/>
  </svg>`;
}
function psWindRO(){
  const w=psWindComp(), head=w.head, cross=w.cross, dist=Math.round(psDelta('wind')), aim=psWindAimYd();
  const hT=Math.abs(head)<0.5?'no head/tail':`${Math.abs(head).toFixed(0)} mph ${head>0?'into':'down'}`;
  const cT=Math.abs(cross)<0.5?'no cross':`${Math.abs(cross).toFixed(0)} mph from ${cross>0?'right':'left'}`;
  const aT=Math.abs(aim)<0.5?'straight':`${Math.abs(aim).toFixed(0)} yd ${aim>0?'R':'L'}`;
  return `${hT} · ${cT}<br>→ <b>${dist>0?'+':dist<0?'−':''}${Math.abs(dist)} yd</b> distance · aim <b>${aT}</b>`;
}
function psStanceRO(){
  const st=psStance(), dist=Math.round(st.dist), finishYd=Math.tan(st.finishDeg*Math.PI/180)*Math.max(0,psEffective());
  const fT=Math.abs(finishYd)<0.5?'straight':`${Math.abs(finishYd).toFixed(0)} yd ${finishYd>0?'R':'L'}`;
  return `<b>${dist>0?'+':dist<0?'−':''}${Math.abs(dist)} yd</b> distance<br>ball finishes <b>${fT}</b> → aim opposite`;
}
function psInitDials(){
  ['ps-wind-dial','ps-stance-dial'].forEach(id=>{ const svg=document.getElementById(id); if(svg) psDialDrag(svg); });
}
function psDialDrag(svg){
  const R=+svg.dataset.r, C=+svg.dataset.c, kind=svg.dataset.kind;
  const toVB=e=>{ const r=svg.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*100, y:(e.clientY-r.top)/r.height*100}; };
  const apply=p=>{
    let dx=p.x-C, dy=p.y-C;
    if(kind==='wind'){ psShot.windAngle=Math.round((Math.atan2(dx,-dy)*180/Math.PI+360)%360); }
    else { const m=Math.hypot(dx,dy); if(m>R){dx*=R/m;dy*=R/m;} psShot.stanceX=+(dx/R).toFixed(3); psShot.stanceY=+(-dy/R).toFixed(3); }
    psUpdateDial(svg); psRenderEquation(); psRenderResult(); psRenderDirection();
  };
  let drag=false;
  svg.addEventListener('pointerdown',e=>{drag=true; try{svg.setPointerCapture(e.pointerId);}catch(_){} apply(toVB(e)); e.preventDefault();});
  svg.addEventListener('pointermove',e=>{ if(drag) apply(toVB(e)); });
  const end=e=>{drag=false; try{svg.releasePointerCapture(e.pointerId);}catch(_){}};
  svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
}
function psUpdateDial(svg){
  const R=+svg.dataset.r, C=+svg.dataset.c, kind=svg.dataset.kind; let hx,hy;
  if(kind==='wind'){ const a=psNum(psShot.windAngle)*Math.PI/180; hx=C+R*Math.sin(a); hy=C-R*Math.cos(a); }
  else { hx=C+(psShot.stanceX||0)*R; hy=C-(psShot.stanceY||0)*R; }
  const arm=svg.querySelector('.ps-dial-arm'), knob=svg.querySelector('.ps-dial-knob');
  arm.setAttribute('x2',hx.toFixed(1)); arm.setAttribute('y2',hy.toFixed(1));
  knob.setAttribute('cx',hx.toFixed(1)); knob.setAttribute('cy',hy.toFixed(1));
  const ro=document.getElementById(kind==='wind'?'ps-wind-ro':'ps-stance-ro');
  if(ro) ro.innerHTML = kind==='wind'?psWindRO():psStanceRO();
}
/* live-update the in-place readouts (no rebuild → keeps slider/dial drag + input focus) */
function psRefreshLive(){
  const ev=document.getElementById('ps-elev-val'); if(ev){ const e=psNum(psShot.elev); ev.textContent=(e>0?'+':'')+e+' yd'; }
  const tc=document.getElementById('ps-topo-contrib'); if(tc){ const d=Math.round(psDelta('topo')); tc.textContent=`contribution: ${d>0?'+':d<0?'−':''}${Math.abs(d)} yd`; tc.style.color=d>0?'var(--gold)':d<0?'var(--sky)':'var(--muted)'; }
  const w=document.getElementById('ps-wind-dial'); if(w) psUpdateDial(w);
  const s=document.getElementById('ps-stance-dial'); if(s) psUpdateDial(s);
}
function psRenderResult(){
  const out=document.getElementById('ps-result'); if(!out) return;
  const S=psNum(psShot.static);
  if(S<=0){ out.innerHTML=`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-family:Arial,sans-serif;font-size:.78rem;color:var(--muted)">Open <b>Static</b> above and enter your measured yardage to see the number to play.</div>`; return; }
  const eff=psEffective(), rollout=psNum(psShot.rollout), carry=eff-rollout;
  const minCarry=psNum(psShot.minCarry);
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
      <div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1.5">Rough estimates — refine each term from your own data.</div>
    </div>`;
}
/* Second equation — Effects on Start Direction: crosswind + the stance's D-plane tilt resolve
   to a single lateral aim adjustment, with the option to neutralise the stance in setup instead. */
function psRenderDirection(){
  const el=document.getElementById('ps-direction'); if(!el) return;
  if(psNum(psShot.static)<=0){ el.innerHTML=`<div style="font-family:Arial,sans-serif;font-size:.78rem;color:var(--muted);padding:4px 0">Enter your measured yardage (open <b>Static</b> above) to resolve the lateral picture.</div>`; return; }
  const d=psDirection();
  const lat=y=>{ const a=Math.abs(y); return a<0.5?'on line':`${a.toFixed(0)} yd ${y>0?'R':'L'}`; };
  const chip=(key,label,val)=>{
    const open=key===psOpenKey, a=Math.abs(val);
    const col=a<0.5?'var(--muted)':val>0?'var(--gold)':'var(--sky)';
    return `<button onclick="psOpenTerm('${key}')" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;
        background:${open?'var(--bg2)':'transparent'};border:1px solid ${open?'var(--border2)':'transparent'};border-radius:8px;padding:3px 7px;margin:1px">
      <span style="font-family:ui-monospace,monospace;font-size:.82rem;font-weight:800;color:${col}">${lat(val)}</span>
      <span style="font-family:Arial,sans-serif;font-size:.54rem;font-weight:700;letter-spacing:.03em;color:var(--muted);text-transform:uppercase">${label}</span>
    </button>`;
  };
  const plus=`<span style="font-family:ui-monospace,monospace;font-size:.9rem;color:var(--muted);align-self:flex-start;margin-top:4px">+</span>`;
  const tip = psStanceTip();
  const stanceActive = !!tip;
  const guidance = Math.abs(d.netAimYd)<0.5
    ? `<div style="font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2);margin-top:8px">No lateral adjustment — wind and lie are neutral. Aim straight at your target line.</div>`
    : `<div style="font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2);margin-top:8px;line-height:1.5">Set your start line <b style="color:var(--ink)">${lat(d.netAimYd)}</b> of the target${stanceActive?` — or hold your aim and <b>neutralise the lie</b>: ${tip}`:'.'}</div>`;
  el.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px 0 6px">
      <span style="font-family:Arial,sans-serif;font-size:.7rem;font-weight:800;color:var(--ink2);margin-right:4px">Aim =</span>
      ${chip('wind','Wind',d.windYd)}${plus}${chip('stance','Lie tilt',d.stanceAimYd)}
      <span style="font-family:ui-monospace,monospace;font-size:.9rem;color:var(--muted);align-self:flex-start;margin-top:4px">=</span>
      <span style="font-family:ui-monospace,monospace;font-size:1.05rem;font-weight:800;color:var(--accent,#c4427a);align-self:flex-start;margin-top:1px">${lat(d.netAimYd)}</span>
    </div>
    ${guidance}
    <div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1.5">Crosswind drifts the ball laterally; a side-hill lie tilts the swing plane so the ball starts &amp; curves off-line. Tap <b>Wind</b> or <b>Lie tilt</b> to set the inputs (shared with the distance terms). Rough estimates — refine from your own data.</div>`;
}

/* ---- handlers ---- */
function psSet(key,val,reRenderDetail){
  psShot[key]=val;
  psRenderEquation(); psRenderResult(); psRenderDirection(); psRefreshLive();
  if(reRenderDetail) psRenderDetail();
}
function psOpenTerm(key){ psOpenKey=key; psRenderEquation(); psRenderDetail(); psRenderDirection(); }

/* Goals — season arc from the profile (goal handicap, volume). Lives under Locker Room → Myself. */
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
    <p class="gen-note" style="margin-top:10px">Set these in the Golfer Profile above. Your goal handicap drives the SG diamond goal ring.</p>
  </div>
  <div class="profile-card">
    <h3>Milestones <span style="font-family:ui-monospace,monospace;font-size:.55rem;font-weight:400;color:var(--muted);text-transform:none">preview</span></h3>
    <p class="gen-note">Season targets and dated milestones — tie each to a link in the causal chain and track the trend. Coming soon.</p>
  </div>`;
}

/* ============================================================
   POST-ROUND — close-the-loop debrief: capture the strokes-gained-driving numbers, then a short
   structured review while the round is fresh. Transient; the snapshot can be pushed to the Locker
   Room baselines that feed the SG diamond + expected-shots.
   ============================================================ */
const psRound = {};
function psRoundSet(key,val){ psRound[key]=val; }
const psRoundSel=(key,opts)=>`<select onchange="psRoundSet('${key}',this.value)">`+
  opts.map(o=>`<option value="${o}"${psRound[key]===o?' selected':''}>${o}</option>`).join('')+`</select>`;
const psRoundNum=(label,key,ph)=>`<div class="edit-field"><label>${label}</label><input type="number" inputmode="decimal" value="${escapeHtml(psRound[key]==null?'':psRound[key])}" oninput="psRoundSet('${key}',this.value)" placeholder="${ph||''}"></div>`;
/* +/- stepper for values that can go negative (e.g. an under-par score) — iOS's decimal
   keypad has no minus key, so a number input alone can't take a negative on a phone. */
const psRoundFmtToPar=v=>{ if(v==null||v==='') return '—'; const n=parseFloat(v); if(isNaN(n)) return '—'; return n===0?'E':(n>0?'+':'−')+Math.abs(n); };
function psRoundStep(key,delta){
  const cur=(psRound[key]==null||psRound[key]==='')?0:(parseFloat(psRound[key])||0);
  psRound[key]=cur+delta;
  const el=document.getElementById('ps-round-'+key+'-val'); if(el) el.textContent=psRoundFmtToPar(psRound[key]);
}
const psRoundStepper=(label,key)=>`<div class="edit-field">
    <label>${label}</label>
    <div class="ps-stepper">
      <button type="button" class="ps-stepper-btn" onclick="psRoundStep('${key}',-1)" aria-label="Decrease">−</button>
      <span class="ps-stepper-val" id="ps-round-${key}-val">${psRoundFmtToPar(psRound[key])}</span>
      <button type="button" class="ps-stepper-btn" onclick="psRoundStep('${key}',1)" aria-label="Increase">+</button>
    </div>
  </div>`;
/* Push the captured round onto the typical-round baselines in STATE.profile (GIR%, fairways%,
   putts/round, up&down%, scoring avg). A simple set for now — a rolling SG-round log is the next step. */
function psApplyRoundBaselines(){
  const pf=STATE.profile=STATE.profile||{};
  const n=v=>{const x=parseFloat(v);return isNaN(x)?null:x;};
  const gir=n(psRound.gir), fir=n(psRound.fir), putts=n(psRound.putts), udM=n(psRound.udMade), udA=n(psRound.udAtt), toPar=n(psRound.score);
  if(gir!=null)   pf.girPct=Math.round(Math.max(0,Math.min(18,gir))/18*100);
  if(fir!=null)   pf.firPct=Math.round(Math.max(0,Math.min(14,fir))/14*100);
  if(putts!=null) pf.puttsRound=putts;
  if(udM!=null&&udA!=null&&udA>0) pf.upDownPct=Math.round(udM/udA*100);
  if(toPar!=null) pf.scoringAvg=72+toPar;
  saveState();
  if(typeof buildProfile==='function') buildProfile();
  if(typeof refreshAll==='function'){ /* light touch: SG surfaces read profile live on next render */ }
  if(typeof toast==='function') toast('Round stats saved to your baselines');
}
function buildPostRound(){
  const wrap=document.getElementById('postround-wrap'); if(!wrap) return;
  const f=(label,key,opts)=>`<div class="edit-field"><label>${label}</label>${psRoundSel(key,['—',...opts])}</div>`;
  wrap.innerHTML=`
    <div class="profile-card" style="margin-top:0">
      <h3>1 · Round Snapshot <span style="${PS_SUB}">the numbers that drive strokes-gained</span></h3>
      <div class="edit-grid">
        ${psRoundStepper('Score (to par)','score')}
        ${psRoundNum('Fairways hit (/14)','fir','/14')}
        ${psRoundNum('Greens in reg (/18)','gir','/18')}
        ${psRoundNum('Total putts','putts','e.g. 32')}
        ${psRoundNum('3-putts','threePutt','#')}
        ${psRoundNum('Up & downs made','udMade','#')}
        ${psRoundNum('Up & downs tried','udAtt','#')}
        ${psRoundNum('Penalty strokes','pen','#')}
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="psApplyRoundBaselines()">Save round stats to my baselines</button></div>
      <p class="gen-note" style="margin-top:8px">These map onto your Locker Room → Myself <b>Typical-Round Baselines</b> (GIR %, fairways %, putts/round, up&amp;down %) which feed the <b>Strokes-Gained diamond</b> and expected-shots. Next step: a full round-by-round SG log with trend lines and a per-category breakdown.</p>
    </div>
    <div class="profile-card">
      <h3>2 · Where the Strokes Went <span style="${PS_SUB}">tie it to the SG categories</span></h3>
      <div class="edit-grid">
        ${f('Strongest today','best',['Driving','Approach','Short game','Putting','Mental / strategy'])}
        ${f('Cost you the most','worst',['Driving','Approach','Short game','Putting','Penalties','Mental / strategy'])}
        ${f('Tee-to-green vs putting','t2gVsPutt',['Ball-striking carried me','Balanced','Putter carried me','Both struggled'])}
      </div>
      <p class="gen-note" style="margin-top:8px">Cross-check against the <b>SG diamond</b> (OTT / APP / ATG / PUTT) — your felt sense and the numbers should agree; when they don't, trust the numbers.</p>
    </div>
    <div class="profile-card">
      <h3>3 · Process &amp; Mind <span style="${PS_SUB}">how you managed the round</span></h3>
      <div class="edit-grid">
        ${f('Course management / decisions','mgmt',['Sharp','Mostly sound','A few errors','Cost me shots'])}
        ${f('Pre-shot routine commitment','routine',['Every shot','Most shots','Slipped under pressure','Rarely'])}
        ${f('Emotional control','emotion',['Calm & present','Mostly steady','Rattled at times','Lost it'])}
        ${f('Energy / focus','energy',['Strong all 18','Faded late','Slow start','Up & down'])}
      </div>
    </div>
    <div class="profile-card">
      <h3>4 · Takeaways <span style="${PS_SUB}">turn the round into practice</span></h3>
      <div class="edit-field" style="grid-column:1/-1"><label>What went well — keep doing it</label>
        <textarea oninput="psRoundSet('keep',this.value)" rows="2" placeholder="The one or two things worth protecting." style="width:100%;padding:7px 9px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink);background:var(--bg2);border:1px solid var(--border);border-radius:6px;outline:none;resize:vertical;line-height:1.5">${escapeHtml(psRound.keep||'')}</textarea>
      </div>
      <div class="edit-field" style="grid-column:1/-1;margin-top:8px"><label>One practice priority → take it to Practice</label>
        <textarea oninput="psRoundSet('priority',this.value)" rows="2" placeholder="The single biggest needle-mover for your next session — tie it to a link in the causal chain." style="width:100%;padding:7px 9px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink);background:var(--bg2);border:1px solid var(--border);border-radius:6px;outline:none;resize:vertical;line-height:1.5">${escapeHtml(psRound.priority||'')}</textarea>
      </div>
      <p class="gen-note" style="margin-top:8px">Pick <b>one</b> priority — log it under Practice → Assess and build your next block around it.</p>
    </div>`;
}

/* ============================================================
   POST-SHOT ROUTINE — a quick, ordered review: result → execution → plan → adjustment.
   Transient per-shot (like the rest of Game Plan). Separating result from execution from plan
   is what turns a shot into a lesson instead of a reaction.
   ============================================================ */
function psPostSet(key,val){ psPost[key]=val; }
const psPostSel=(key,opts)=>`<select onchange="psPostSet('${key}',this.value)">`+
  opts.map(o=>`<option value="${o}"${psPost[key]===o?' selected':''}>${o}</option>`).join('')+`</select>`;
function buildPostShot(){
  const wrap=document.getElementById('postshot-wrap'); if(!wrap) return;
  const f=(label,key,opts)=>`<div class="edit-field"><label>${label}</label>${psPostSel(key,['—',...opts])}</div>`;
  wrap.innerHTML=`
    <div class="profile-card" style="margin-top:0">
      <h3>1 · The Result <span style="${PS_SUB}">what actually happened</span></h3>
      <div class="edit-grid">
        ${f('Outcome vs target','result',['As planned / great','Good','Acceptable','Poor','Bad'])}
        ${f('Start direction','startDir',['Left','Slightly left','On line','Slightly right','Right'])}
        ${f('Curve / shape','shape',['Hook','Draw','Straight','Fade','Slice'])}
        ${f('Distance','dist',['Short','Slightly short','Right number','Slightly long','Long'])}
        ${f('Finished','finish',['Hole / green / fairway','Fringe / light rough','Rough','Sand','Penalty / lost'])}
      </div>
    </div>
    <div class="profile-card">
      <h3>2 · Your Execution <span style="${PS_SUB}">how you swung it — separate from result</span></h3>
      <div class="edit-grid">
        ${f('Strike','strike',['Flush / centre','Slightly off-centre','Thin','Fat / heavy','Toe / heel'])}
        ${f('Tempo','tempo',['Smooth','Slightly quick','Rushed','Slow / tentative'])}
        ${f('Commitment','commit',['Fully committed','Mostly','Hesitant','Steered it'])}
        ${f('Hit your intended shot?','intended',['Yes','Mostly','No'])}
      </div>
      <p class="gen-note" style="margin-top:8px">A good result from a poor swing is still a poor swing; a good swing with a bad bounce is still a good swing. Grade the <b>process</b>, not just the outcome.</p>
    </div>
    <div class="profile-card">
      <h3>3 · Was the Plan Appropriate? <span style="${PS_SUB}">target · club · shot choice</span></h3>
      <div class="edit-grid">
        ${f('Verdict','planVerdict',['Spot on','Slightly off','Wrong target / aim','Wrong club','Wrong shot / trajectory','Too aggressive','Too conservative'])}
        ${f('If you replayed it…','planRepeat',['Repeat exactly','Minor tweak','Different plan'])}
      </div>
    </div>
    <div class="profile-card">
      <h3>4 · Adjustments for Next Time <span style="${PS_SUB}">one clear takeaway</span></h3>
      <div class="edit-field" style="grid-column:1/-1"><label>Note</label>
        <textarea oninput="psPostSet('note',this.value)" rows="2" placeholder="One specific, actionable cue — e.g. ‘aim a touch right on ball-above-feet lies’, or ‘commit to the number, stop steering’." style="width:100%;padding:7px 9px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink);background:var(--bg2);border:1px solid var(--border);border-radius:6px;outline:none;resize:vertical;line-height:1.5">${escapeHtml(psPost.note||'')}</textarea>
      </div>
      <p class="gen-note" style="margin-top:8px">Keep it to one thing you can carry to the next shot or the range — then let this one go.</p>
    </div>`;
}

// Expose for inline handlers and the renderAll orchestrator.
Object.assign(window, { buildPlanShot, buildPostShot, buildPostRound, psSet, psSetSit, psPostSet, psRoundSet, psRoundStep, psApplyRoundBaselines, psOpenTerm, buildLongTerm,
  pseSetIdx, pseResetSetup, psTgtSetIdx, psRenderDirection,
  PS_WIND_HEAD, PS_WIND_TAIL, PS_CROSS_YPM, PS_ELEV_K });
