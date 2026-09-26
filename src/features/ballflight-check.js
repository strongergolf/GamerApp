// BALL-FLIGHT CHECK — hold every club's stored numbers against the flight model.
//
// The bag stores six numbers per club that all describe one shot: ball speed, launch, spin,
// carry, apex and landing angle. Physics ties them together — the first three DETERMINE the
// last three — but nothing in the app ever checked that they agreed, so a club could carry a
// measured 141 yd beside a launch and spin that would fly it 150 and neither number would know.
//
// WHICH NUMBER IS WRONG. Not a question the model can answer, and it does not pretend to. It
// states the disagreement and offers the three single changes that would end it — the spin,
// the launch or the ball speed that fits — with a plausibility check on each, because "your
// 9-iron spins 13,000 rpm" is arithmetic rather than a finding. The golfer decides: they know
// which of their own numbers they trust, and it is usually the carry.
//
// PROVENANCE. A number fitted here is DERIVED FROM the model, not measured, so it is marked
// as fitted and says so. Captured data (a launch-monitor import) outranks the model entirely:
// where a club's numbers are Captured, the check reports the gap and offers nothing, because
// at that point the disagreement is the model's problem, not the golfer's.

/* Plausibility bands. These are not the model's opinion of your swing — they are the range
   inside which a proposed number is worth acting on rather than an artefact of forcing one
   lever to absorb everything. */
const BFC_SPIN_PER_DEG_MAX = 250;   /* rpm per degree of loft — a 43° 9-iron above ~10,750 is not a 9-iron */
const BFC_SPIN_PER_DEG_MIN = 90;
const BFC_LAUNCH_SHIFT_MAX = 5;     /* degrees of launch a fit may move before it is a different shot */
/* Ball speed is not free to move: it is club speed times the smash this loft can produce, and
   the app already has that law (expectedSmash, physics/sg.js). A proposed ball speed is only
   plausible if the smash it implies against the club speed stored beside it still is. */
function bfcSpeedPlausible(bspd, cspd, loftDeg){
  if(!(bspd>0)) return false;
  if(!(cspd>0) || typeof expectedSmash!=='function') return true;   /* nothing to check it against */
  const exp=expectedSmash(loftDeg); if(exp==null) return true;
  return Math.abs(bspd/cspd - exp) < (typeof SMASH_TOL==='number'?SMASH_TOL:0.12);
}
/* THE MODEL'S OWN MARGIN, stated rather than hidden. Against the measured tour set the fit is
   within a yard or two everywhere except the driver, where it lands ~5.7 yd short — the drag
   crisis is the hardest part of the curve. A driver that carries a few yards further than the
   model says is therefore the model's residual before it is anything about the golfer, and the
   tool says so rather than inviting someone to inflate their ball speed to close it.
   Above a pitching wedge the model is EXTRAPOLATING: the calibration set stops at 24° of
   launch and 9,300 rpm, so a 56° or 60° full swing is outside what it was fitted on. */
const BFC_DRIVER_RESIDUAL_YD = 5.7;
const BFC_FIT_MAX_LOFT = 48;
function bfcModelNote(c, gap){
  const loft=parseFloat(c.loft)||0;
  const notes=[];
  if(loft<=13 && gap<0) notes.push(`the model runs ${BFC_DRIVER_RESIDUAL_YD} ${ydUnit()} short on a driver against tour data — most of this gap is that, not you`);
  if(loft>BFC_FIT_MAX_LOFT) notes.push('beyond a pitching wedge the model is extrapolating past what it was fitted on');
  return notes.join(' · ');
}

/* A SECOND OPINION, from a model that knows nothing about ball flight.
   Smash factor — ball speed over club speed — is set by the loft the club presents, and the
   app derives it independently in physics/sg.js. So when the flight model says a club flies
   further than it is hit, the ball speed it wants to lower can be checked against the smash
   that ball speed implies. Two models that share no assumptions pointing the same way is a
   much stronger finding than either alone, and when they disagree that is worth knowing too. */
function bfcCorroboration(p, loft, gap){
  if(!(p.bspd>0)||!(p.cspd>0)||typeof expectedSmash!=='function') return '';
  const exp=expectedSmash(loft); if(exp==null) return '';
  const off=p.bspd/p.cspd - exp;
  if(Math.abs(off)<0.02) return '';
  const speedIsHigh=off>0, needsLessSpeed=gap>0;
  return speedIsHigh===needsLessSpeed
    ? `smash agrees: ${(p.bspd/p.cspd).toFixed(2)} against ${exp.toFixed(2)} for ${Math.round(loft)}° of loft, so this ball speed is ${speedIsHigh?'high':'low'} for the club speed beside it`
    : `smash disagrees: at ${(p.bspd/p.cspd).toFixed(2)} against ${exp.toFixed(2)} the ball speed looks ${speedIsHigh?'high':'low'}, which would widen this gap rather than close it — the launch or spin is the likelier culprit`;
}
function bfcClubs(){
  return (STATE.clubs||[]).filter(c=>{
    if(c.type==='putter') return false;
    const p=perf(c.id)||{};
    return p.carry>0 && p.bspd>0 && p.launch!=null && p.spin!=null;
  });
}
/* One club's reconciliation: what the model says, and the three ways to end the argument. */
function bfcRow(c){
  const p=perf(c.id)||{};
  const loft=parseFloat(c.loft)||0;
  const f=ballFlight(p.bspd, p.launch, p.spin);
  if(!f) return null;
  const gap=f.carry-p.carry;                     /* + = model flies it further than you do */
  const spin=solveSpinForCarry(p.bspd, p.launch, p.carry);
  const launch=solveLaunchForCarry(p.bspd, p.spin, p.carry, p.launch);
  const bspd=solveBallSpeedForCarry(p.launch, p.spin, p.carry);
  const spinOk = spin!=null && loft>0 && spin<=BFC_SPIN_PER_DEG_MAX*loft && spin>=BFC_SPIN_PER_DEG_MIN*loft;
  const launchOk = launch!=null && Math.abs(launch-p.launch)<=BFC_LAUNCH_SHIFT_MAX;
  const speedOk = bspd!=null && bfcSpeedPlausible(bspd, p.cspd, loft);
  return {c, p, loft, model:f, gap, note:bfcModelNote(c, gap), corrob:bfcCorroboration(p, loft, gap),
    levers:[
      {key:'spin',   label:'Spin',       val:spin,   cur:p.spin,   ok:spinOk,   unit:'rpm', dp:0},
      {key:'launch', label:'Launch',     val:launch, cur:p.launch, ok:launchOk, unit:'°', dp:1},
      {key:'bspd',   label:'Ball Speed', val:bspd,   cur:p.bspd,   ok:speedOk,  unit:'mph', dp:1}
    ]};
}
/* Apply one lever. The value is the model's, not a measurement, so it is recorded as fitted
   and the club's own provenance is left alone — the carry that drove the fit is still the
   golfer's own number. */
function bfcApply(clubId, key, val){
  const p=STATE.performance[clubId]; if(!p) return;
  p[key]=parseFloat(val);
  p.fitted=Object.assign({}, p.fitted||{}, {[key]:true});
  saveState(); refreshAll();
  const c=(STATE.clubs||[]).find(x=>x.id===clubId);
  if(typeof toast==='function') toast(`${c?c.label:clubId} ${key} fitted to your carry`);
}
function bfcClearFitted(clubId){
  const p=STATE.performance[clubId]; if(!p||!p.fitted) return;
  delete p.fitted; saveState(); buildBallFlightCheck();
}
/* The tolerance for "these agree". The model's own mean error against measured tour data is
   1.5 yd, so anything inside 3 is the model's noise rather than the bag's. */
const BFC_TOLERANCE_YD = 3;

function buildBallFlightCheck(){
  const wrap=document.getElementById('bfc-wrap'); if(!wrap) return;
  if(typeof ballFlight!=='function'){ wrap.innerHTML=''; return; }
  const rows=bfcClubs().map(bfcRow).filter(Boolean);
  if(!rows.length){ wrap.innerHTML='<p class="gen-note">No club has a full set of ball speed, launch, spin and carry yet.</p>'; return; }
  const off=rows.filter(r=>Math.abs(r.gap)>BFC_TOLERANCE_YD);
  const long=off.filter(r=>r.gap>0).length, short=off.filter(r=>r.gap<0).length;
  const captured=rows.filter(r=>r.p.prov==='captured').length;

  const fmtGap=g=>`${g>0?'+':''}${g.toFixed(1)}`;
  const lever=(r,l)=>{
    if(l.val==null) return `<span class="bfc-lever dead">${l.label} — no value fits</span>`;
    const d=l.val-l.cur, ds=`${d>0?'+':''}${d.toFixed(l.dp)}`;
    const shown=l.dp?l.val.toFixed(l.dp):Math.round(l.val).toLocaleString();
    return `<button type="button" class="bfc-lever${l.ok?'':' unlikely'}"
      onclick="bfcApply('${r.c.id}','${l.key}',${l.val})"
      title="${l.ok?'Apply this':'Outside what this club plausibly does — it is arithmetic, not a finding'}">
      <span class="bfc-lever-k">${l.label}</span>
      <span class="bfc-lever-v">${shown}<i>${l.unit}</i></span>
      <span class="bfc-lever-d">${ds}</span></button>`;
  };
  const body=rows.map(r=>{
    const agree=Math.abs(r.gap)<=BFC_TOLERANCE_YD;
    const fitted=r.p.fitted?Object.keys(r.p.fitted):[];
    const cap=r.p.prov==='captured';
    return `<div class="bfc-row${agree?' ok':''}">
      <div class="bfc-club"><span class="spec-club ${r.c.type}">${r.c.label}</span><small>${r.c.loft}</small></div>
      <div class="bfc-nums">
        <span class="bfc-n"><i>yours</i>${ydNum(r.p.carry)}</span>
        <span class="bfc-n"><i>model</i>${ydNum(r.model.carry,0)}</span>
        <span class="bfc-gap ${agree?'ok':r.gap>0?'long':'short'}">${agree?'agrees':fmtGap(r.gap)+' '+ydUnit()}</span>
      </div>
      ${agree?'<div class="bfc-levers"><span class="bfc-lever dead">nothing to reconcile</span></div>'
        : cap?'<div class="bfc-levers"><span class="bfc-lever dead">captured data — the model defers</span></div>'
        : `<div class="bfc-levers">${r.levers.map(l=>lever(r,l)).join('')}</div>`}
      ${!agree&&(r.note||r.corrob)?`<div class="bfc-note">${[r.note,r.corrob].filter(Boolean).join(' · ')}</div>`:''}
      ${fitted.length?`<div class="bfc-fitted">fitted: ${fitted.join(', ')} <button type="button" onclick="bfcClearFitted('${r.c.id}')">clear</button></div>`:''}
    </div>`;
  }).join('');

  /* The PATTERN first. One club out by five yards is a typo; a whole ladder leaning one way
     is a story about how the ladder was built, and that is what the golfer should read. */
  const pattern = !off.length
    ? 'Every club agrees with the flight model inside its own margin.'
    : `${off.length} of ${rows.length} clubs disagree by more than ${BFC_TOLERANCE_YD} ${ydUnit()}`
      + (long&&short ? ` — ${long} fly further in the model than you hit them, ${short} fly shorter. A ladder that leans both ways is usually one that was filled in smoothly by hand rather than measured club by club.`
        : long ? ` — all of them fly FURTHER in the model than you hit them, which points at spin being stored low, ball speed high, or carries quoted conservatively.`
        : ` — all of them fly SHORTER in the model than you hit them, which points at spin being stored high or the carries being good-day numbers.`);

  wrap.innerHTML=`
    <p class="gen-note" style="margin-top:0">Your ball speed, launch and spin <b>determine</b> your carry — so the two can be checked against each other. The model is fitted to measured tour data across the whole bag (1.5 ${ydUnit()} mean error); it is a straight shot on a still day, so treat a few ${ydUnit()} as agreement.</p>
    <p class="gen-note bfc-pattern">${pattern}${captured?` ${captured} club${captured===1?' has':'s have'} captured data, which the model defers to.`:''}</p>
    <div class="bfc-table">${body}</div>
    <p class="gen-note" style="margin-bottom:0">Tap a number to fit it to your carry. A fitted number is the model's, not a measurement, and is marked as such — importing a launch-monitor session replaces both, and then the model has nothing left to argue with.</p>`;
}

Object.assign(window, { BFC_SPIN_PER_DEG_MAX, BFC_SPIN_PER_DEG_MIN, BFC_LAUNCH_SHIFT_MAX,
  BFC_DRIVER_RESIDUAL_YD, BFC_FIT_MAX_LOFT, BFC_TOLERANCE_YD, bfcSpeedPlausible, bfcModelNote, bfcCorroboration, bfcClubs, bfcRow, bfcApply, bfcClearFitted, buildBallFlightCheck });
