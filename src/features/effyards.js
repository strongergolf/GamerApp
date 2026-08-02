// Effective-yardage adjusters — a compact slider per Plan-a-Shot equation term,
// embedded under the distance slider on the Approach and Short Game tabs.
// Reuses the coefficient tables from planshot.js (PS_LIE/PS_STANCE/PS_SHOT/PS_NERVES,
// PS_WIND_*, PS_ELEV_K, psAirDelta). Each tab keeps its own independent selections.
//
// Per-context weights (EY_WEIGHT) let us later refine how much each variable impacts
// approach vs short-game shots — all default to 1.0 for now.

const EY = {
  approach:  { situation:'fairway', lieq:'standard', stance:'level', elev:0, elevUnit:'yd', firmness:'avg' },
  shortgame: { situation:'fairway', lieq:'standard', stance:'level', elev:0, elevUnit:'ft', level:0, firmness:'avg' }
};
/* Elevation can be entered as an absolute rise (base unit: yd for approach, ft for short game) OR
   as an incline in degrees — cross-calculated through the shot length. Base unit ↔ degrees:
     run = horizontal distance in the base unit (yards for approach; yards×3 = feet for short game)
     rise_base = run · tan(deg)     deg = atan(rise_base / run). */
/* The elevation adjuster works in the SHOT's own base unit — feet around the green,
   yards on approach — so it follows the display preference like everything else. Note the
   underlying maths still runs on the canonical feet/yards; only the label changes. */
function elevBaseUnit(ctx){ return ctx==='shortgame'?ftUnit():ydUnit(); }
function elevRun(ctx,S){ return ctx==='shortgame' ? (S||0)*3 : (S||0); }   // horizontal dist in the base unit
function elevBaseVal(ctx,S){
  const u=EY[ctx].elevUnit||elevBaseUnit(ctx), v=EY[ctx].elev||0;
  return u==='deg' ? elevRun(ctx,S)*Math.tan(v*Math.PI/180) : v;           // rise in the base unit
}
/* Short-game target elevation: plays-like yards per FOOT the green sits above/below you (a chip
   up to a raised green plays longer). Downhill gives back ~2/3 of the uphill cost, matching the
   app's topography convention. Separate from Stance (the lie angle under your feet). */
const CHIP_ELEV_K = 0.30;
const EY_DEFAULTS = { situation:'fairway', lieq:'standard', stance:'level', elev:0, level:0, firmness:'avg' };
/* All Situational-Info terms use the EFFECTIVE-YARDAGE convention: + = the shot plays
   LONGER (club up), − = plays shorter (club down). So a condition that costs ball
   distance reads +, and one that adds ball distance reads −. */
/* Situation = Strokes-Gained status (where you're playing from) → effective-yardage cost.
   Rough/sand/recovery cost distance (+, club up); a teed-up lie flies a touch farther (−).
   Also drives the Expected Strokes / Strokes-Gained lie via approachLie(). */
const EY_SITUATION = { tee:-2, fairway:0, rough:+6, bunker:+8, recovery:+15 };
/* Lie quality → effective yardage for APPROACH. Short Game uses half (EY_WEIGHT).
   Hardpan/sitting-down/buried cost distance (+, club up); a clean sit-up flies farther (−).
   Buried & sitting-down also cut spin / add roll on a real shot (display only for now). */
const EY_LIE = { clean:-2, standard:0, hardpan:+4, down:+8, buried:+12 };
/* Stance up/downhill ≈ club changes: ~1 club ≈ 10 yd ≈ 4° loft. ±1 club hill, ±2 well.
   Uphill plays longer → club up (+); downhill flies farther → club down (−). */
const EY_STANCE = { welldownhill:-20, downhill:-10, level:0, uphill:+10, welluphill:+20 };
/* Approach green firmness → yards added to ROLL-OUT (window.approachGreenFirmness). */
const EY_FIRMNESS = { vsoft:-2, soft:-1, avg:0, firm:2, vfirm:4 };
/* Short-game firmness → multiplier on chip roll-out (window.chipFirmFactor): softer needs
   more carry / less roll to the hole; firmer rolls out more. */
const EY_CHIP_FIRM = { vsoft:0.70, soft:0.85, avg:1.0, firm:1.30, vfirm:1.60 };
/* Short-game SITUATION → its own LIE options, each with a roll-out multiplier (more roll =
   less backspin = less carry for the same target). Edit each situation independently here.
   Fairway is the baseline (standard = 1.0). Rough: small carry loss, big spin loss (more
   roll). Bunker: the more buried, the less carry and the more roll. */
const SG_SITUATION_LIES = {
  fairway: { lies:[['clean','Clean / sitting up'],['standard','Standard'],['tight','Tight / hardpan'],['down','Sitting down']],
             rollMult:{ clean:0.92, standard:1.0, tight:1.10, down:1.20 } },
  rough:   { lies:[['light','Light rough'],['medium','Medium rough'],['heavy','Heavy rough']],
             rollMult:{ light:1.30, medium:1.60, heavy:2.00 } },
  bunker:  { lies:[['bare','Bare / crunchy'],['up','Sitting up'],['down','Sitting down'],['fried','Buried / fried egg']],
             rollMult:{ bare:1.40, up:1.05, down:1.60, fried:2.40 } }
};
function sgLieRollMult(){
  const set=SG_SITUATION_LIES[EY.shortgame.situation]; if(!set) return 1;
  return (set.rollMult&&set.rollMult[EY.shortgame.lieq]!=null)?set.rollMult[EY.shortgame.lieq]:1;
}
/* "Plays-longer" difficulty (display only) for the short-game lie. Derived from the
   same rollMult severity that drives the carry/roll split: a worse lie (less spin,
   more release) makes the same shot to the hole play like a longer clean-lie shot.
   Feeds the effective-yardage readout ONLY — never the dial's target total, since the
   ball still has to travel the measured distance to the hole. */
const SG_LIE_PLAYS_K = 10;
function sgLiePlaysYd(){ return Math.max(0, (sgLieRollMult()-1)*SG_LIE_PLAYS_K); }
/* SG status → strokes-gained lie key (SR table lies: fairway / rough / sand) */
function approachLie(){
  const s=(EY.approach&&EY.approach.situation)||'fairway';
  return s==='rough'?'rough' : s==='bunker'?'sand' : s==='recovery'?'rough' : 'fairway';
}
/* Lie effects are halved for short game; everything else 1.0 (refine later). */
const EY_WEIGHT = {
  approach:  { situation:1, lieq:1,   stance:1, elev:1, firmness:1, air:1 },
  shortgame: { situation:1, lieq:0.5, stance:1, elev:1, level:1, firmness:1, air:1 }
};

/* ---- Shot-type (trajectory) model — researched estimates, refine from LM data ----
   distFrac = how the EFFECTIVE (club-selection) yardage shifts as a fraction of distance.
     A knockdown flies shorter for a given club, so you club UP (+); a high shot flies a
     touch farther only to a point, so a small club-down (−).
   launchMult/spinMult/heightMult/rollMult/landMult = applied per club in the Approach
   renderer so the effect scales through the bag (a wedge's 30° launch drops more in
   absolute terms than a long iron's 14°). See report in the commit / chat. */
const EY_SHOT = {
  stock:     { distFrac: 0.00, launchMult:1.00, spinMult:1.00, heightMult:1.00, rollMult:1.00, landMult:1.00 },
  knockdown: { distFrac:+0.07, launchMult:0.60, spinMult:0.80, heightMult:0.68, rollMult:2.10, landMult:0.78 },
  high:      { distFrac:-0.02, launchMult:1.35, spinMult:1.15, heightMult:1.32, rollMult:0.45, landMult:1.20 }
};

/* step = categorical slider (snaps through named options); range = continuous.
   Most terms are shared; Approach has Elevation (target up/down, yd), Short Game has Level
   (the green-slope it rolls out on, ±6°). eyTerms(ctx) returns the context's list. */
const EY_TERM_SITUATION = { key:'situation', label:'Situation', type:'step', opts:[
      ['tee','Tee'],['fairway','Fairway'],['rough','Rough'],['bunker','Bunker'],['recovery','Recovery']] };
const EY_TERM_LIE = { key:'lieq', label:'Lie', type:'step', opts:[
      ['clean','Clean / up'],['standard','Standard'],['hardpan','Hardpan'],['down','Sitting down'],['buried','Buried / thick']] };
const EY_TERM_STANCE = { key:'stance', label:'Stance', type:'step', opts:[
      ['welldownhill','Well downhill'],['downhill','Downhill'],['level','Level'],['uphill','Uphill'],['welluphill','Well uphill']] };
const EY_TERM_ELEV = { key:'elev', label:'Elevation', type:'range', min:-30, max:30, step:1, noContrib:false,
      fmt:v=> v>0?`+${v} yd up`:v<0?`${v} yd down`:'level' };
/* Short game: the target GREEN's elevation above/below you, in feet (distinct from Stance = the
   lie angle you stand on, and from Level = the green's run-out slope). */
const EY_TERM_SG_ELEV = { key:'elev', label:'Elevation', type:'range', min:-30, max:30, step:1, noContrib:false,
      fmt:v=> v>0?`+${v} ft up`:v<0?`${v} ft down`:'level' };
const EY_TERM_LEVEL = { key:'level', label:'Level', type:'range', min:-6, max:6, step:0.5, noContrib:true,
      fmt:v=>{ const n=Math.round((parseFloat(v)||0)*2)/2; return n===0?'Level':`${Math.abs(n)}° ${n>0?'up':'down'}`; } };
const EY_TERM_FIRM = { key:'firmness', label:'Firmness', type:'step', noContrib:true, opts:[
      ['vsoft','Very soft'],['soft','Soft'],['avg','Average'],['firm','Firm'],['vfirm','Very firm']] };
/* Elevation term built for the context's current unit (base rise or degrees). Short game: the
   effect is a carry/roll SPLIT (no distance badge), so noContrib. Approach: a distance change. */
function elevTerm(ctx){
  const deg = (EY[ctx].elevUnit||elevBaseUnit(ctx))==='deg';
  const label = 'Elevation';
  const base = elevBaseUnit(ctx), nc = ctx==='shortgame';
  return deg
    ? { key:'elev', label, type:'range', min:-15, max:15, step:0.5, unitToggle:ctx, noContrib:nc, fmt:v=> v>0?`+${v}° up`:v<0?`${v}° down`:'level' }
    : { key:'elev', label, type:'range', min:-30, max:30, step:1, unitToggle:ctx, noContrib:nc, fmt:v=> v>0?`+${v} ${base} up`:v<0?`${v} ${base} down`:'level' };
}
function eyTerms(ctx){
  if(ctx==='shortgame'){
    const set=SG_SITUATION_LIES[EY.shortgame.situation]||SG_SITUATION_LIES.fairway;
    return [
      { key:'situation', label:'Situation', type:'step', noContrib:true, opts:[['fairway','Fairway'],['rough','Rough'],['bunker','Bunker']] },
      { key:'lieq', label:'Lie', type:'step', opts:set.lies },   /* options depend on Situation; effect = roll-out split + plays-longer difficulty */
      Object.assign({}, EY_TERM_STANCE, {noContrib:true}),       /* lie angle → launch + roll split, not distance */
      elevTerm('shortgame'), EY_TERM_LEVEL, EY_TERM_FIRM
    ];
  }
  return [EY_TERM_SITUATION, EY_TERM_LIE, EY_TERM_STANCE, elevTerm('approach'), EY_TERM_FIRM];
}

function eyBase(ctx){
  if(ctx==='approach') return parseInt(document.getElementById('yard-slider')?.value||95);
  if(ctx==='shortgame') return parseInt(document.getElementById('chip-slider')?.value||20);
  return 0;
}
/* per-term yardage delta for a context, given base yardage S */
function eyDelta(ctx,key,S){
  const st=EY[ctx]; const w=(EY_WEIGHT[ctx]&&EY_WEIGHT[ctx][key]!=null)?EY_WEIGHT[ctx][key]:1;
  let d=0;
  switch(key){
    case 'situation': d=ctx==='shortgame'?0:(EY_SITUATION[st.situation]||0); break;
    case 'lieq':      d=ctx==='shortgame'?0:(EY_LIE[st.lieq]||0); break;   /* short game lie = roll-out, not yardage */
    case 'stance':    d=ctx==='shortgame' ? 0                     /* chip must reach the hole → stance shifts the roll split (globals), not the total */
                        : (EY_STANCE[st.stance]||0); break;
    case 'elev':      if(ctx==='shortgame') d=0;                  /* chip elevation shifts the roll split (chipElevRollMult), not the total */
                      else d=elevBaseVal(ctx,S)*(typeof PS_ELEV_K!=='undefined'?PS_ELEV_K:1.2); break;   /* approach: yards */
    case 'level':     d=0; break;   /* short-game green slope → chip roll-out (chipSlopeVal), not yardage */
    case 'firmness':  d=0; break;   /* roll-out split / chip firmness, not club selection */
    case 'air':       d=(typeof psAirDelta==='function'?psAirDelta(S):0)||0; break;
  }
  return d*w;
}
function eyKeys(ctx){ return eyTerms(ctx).map(t=>t.key).concat('air'); }
function eyTotal(ctx,S){ return eyKeys(ctx).reduce((a,k)=>a+eyDelta(ctx,k,S),0); }
/* Display-only difficulty added to the effective-yardage readout (not the dial total). */
function eyDifficulty(ctx){ return ctx==='shortgame' ? sgLiePlaysYd() : 0; }
/* Per-term badge contribution. Mostly = eyDelta, but the short-game Lie surfaces its
   plays-longer difficulty (display only, so it never feeds eyTotal / the dial target). */
function eyContrib(ctx,key,S){
  if(ctx==='shortgame' && key==='lieq') return sgLiePlaysYd();
  return eyDelta(ctx,key,S);
}
/* effective (plays-like) yardage for a context, given a measured base */
function eyEffective(ctx,measured){ return measured + eyTotal(ctx,measured) + eyDifficulty(ctx); }

const eyColor=d=>d>0.5?'var(--gold)':d<-0.5?'var(--sky)':'var(--muted)';
const eyFmt=d=>{ const r=Math.round(d); return (r>0?'+':r<0?'−':'')+Math.abs(r); };
function eyTermValLabel(ctx,term){
  if(term.type==='step'){ const o=term.opts.find(x=>x[0]===EY[ctx][term.key]); return o?o[1]:term.opts[0][1]; }
  return term.fmt(EY[ctx][term.key]);
}
function eySummaryHTML(ctx,S){
  const tot=eyTotal(ctx,S)+eyDifficulty(ctx), eff=Math.round(S+tot), air=eyDelta(ctx,'air',S);
  return `<span class="ey-meas">${Math.round(S)}</span><span class="ey-arrow">plays</span>`
    +`<span class="ey-eff">${fmtYd(eff)}</span><span class="ey-adj" style="color:${eyColor(tot)}">${eyFmt(ydNum(tot))} ${ydUnit()}</span>`
    +`<span class="ey-air">air ${eyFmt(air)} (auto)</span>`;
}
function buildEyPanel(ctx){
  const host=document.getElementById('ey-'+ctx); if(!host) return;
  if(typeof eySyncFirmness==='function') eySyncFirmness(ctx);
  const S=eyBase(ctx);
  const rows=eyTerms(ctx).map(term=>{
    const d=eyContrib(ctx,term.key,S);
    let control;
    if(term.type==='step'){
      const idx=Math.max(0,term.opts.findIndex(o=>o[0]===EY[ctx][term.key]));
      control=`<input type="range" min="0" max="${term.opts.length-1}" step="1" value="${idx}" oninput="eySet('${ctx}','${term.key}',this.value)">`;
    } else {
      control=`<input type="range" min="${term.min}" max="${term.max}" step="${term.step}" value="${EY[ctx][term.key]}" oninput="eySet('${ctx}','${term.key}',this.value)">`;
    }
    const toggle = term.unitToggle
      ? `<button type="button" class="ey-unit-toggle" title="Switch distance ↔ degrees" onclick="eyToggleElevUnit('${ctx}')">${(EY[ctx].elevUnit==='deg')?'°':elevBaseUnit(ctx)}</button>` : '';
    return `<div class="ey-term">
      <div class="ey-term-head">
        <span class="ey-term-label">${term.label}${toggle}</span>
        <span class="ey-term-val"><span id="ey-${ctx}-${term.key}-v">${eyTermValLabel(ctx,term)}</span>${term.noContrib?'':` <b id="ey-${ctx}-${term.key}-c" style="color:${eyColor(d)}">${eyFmt(d)}</b>`}</span>
      </div>
      ${control}
    </div>`;
  }).join('');
  host.innerHTML=`<div class="ey-panel">
    <div class="ey-head"><span class="ey-title">Situational Info</span><div class="ey-summary" id="ey-${ctx}-summary">${eySummaryHTML(ctx,S)}</div><button type="button" class="ey-reset" onclick="eyReset('${ctx}')">reset</button></div>
    <div class="ey-grid">${rows}</div>
  </div>`;
}
/* Update the live numbers (per-term contribution, value label, summary) without
   rebuilding the sliders — keeps slider focus while dragging, and re-syncs the
   percentage terms (wind/air) when the base distance changes. */
function eyRefreshSummary(ctx){
  if(!document.getElementById('ey-'+ctx+'-summary')) return;
  const S=eyBase(ctx);
  eyTerms(ctx).forEach(term=>{
    const c=document.getElementById(`ey-${ctx}-${term.key}-c`);
    if(c){ const d=eyContrib(ctx,term.key,S); c.textContent=eyFmt(d); c.style.color=eyColor(d); }
    const v=document.getElementById(`ey-${ctx}-${term.key}-v`); if(v) v.textContent=eyTermValLabel(ctx,term);
  });
  const sum=document.getElementById(`ey-${ctx}-summary`); if(sum) sum.innerHTML=eySummaryHTML(ctx,S);
}
function eyHostRender(ctx){
  if(ctx==='approach'){
    const t=parseInt(document.getElementById('yard-slider')?.value||95);
    if(typeof renderCalc==='function') renderCalc(t);
    if(typeof renderExpectedShots==='function') renderExpectedShots('es-150', t, approachLie());  /* Situation drives SG lie */
    if(typeof buildPartialsTable==='function') buildPartialsTable();                              /* firmness affects the matrix */
  }
  else if(ctx==='shortgame'){
    if(typeof renderChipDial==='function') renderChipDial();
    if(typeof buildChipMatrix==='function') buildChipMatrix();   /* Level + firmness shift the matrix */
  }
}
/* keep the short-game roll globals in sync with the panel state */
function eySyncFirmness(ctx){
  if(ctx==='approach') window.approachGreenFirmness = EY_FIRMNESS[EY.approach.firmness]||0;
  else if(ctx==='shortgame'){
    const fk=EY.shortgame.firmness;
    window.chipFirmFactor = (typeof chipFirmModel==='function'?chipFirmModel(fk).roll:(EY_CHIP_FIRM[fk]||1));
    window.chipFirmKey = fk;
    window.chipLieRollMult = sgLieRollMult();
    const sm=(typeof chipStance==='function')?chipStance(EY.shortgame.stance):{roll:1,launch:0};
    window.chipStanceRollMult = sm.roll;
    window.chipStanceLaunchAdj = sm.launch;
    window.chipStanceKey = EY.shortgame.stance;
  }
}
function eySet(ctx,key,raw){
  const term=eyTerms(ctx).find(t=>t.key===key); if(!term) return;
  if(term.type==='step'){ const i=Math.max(0,Math.min(term.opts.length-1,Math.round(parseFloat(raw)))); EY[ctx][key]=term.opts[i][0]; }
  else { EY[ctx][key]=parseFloat(raw)||0; }
  /* changing the short-game Situation swaps the Lie option set → rebuild the panel */
  if(ctx==='shortgame' && key==='situation'){
    const set=SG_SITUATION_LIES[EY.shortgame.situation];
    EY.shortgame.lieq = set ? set.lies[0][0] : 'standard';
    eySyncFirmness('shortgame');
    buildEyPanel('shortgame'); eyHostRender('shortgame');
    return;
  }
  if(key==='firmness' || (ctx==='shortgame'&&(key==='lieq'||key==='stance'))) eySyncFirmness(ctx);
  eyRefreshSummary(ctx);
  eyHostRender(ctx);
}
/* Flip the elevation control between its base unit (ft/yd) and degrees, converting the current
   value through the shot length so the physical elevation is unchanged. */
function eyToggleElevUnit(ctx){
  const S=eyBase(ctx), base=elevBaseUnit(ctx), run=elevRun(ctx,S);
  if((EY[ctx].elevUnit||base)==='deg'){
    const rise = run*Math.tan((EY[ctx].elev||0)*Math.PI/180);          // deg → base rise
    EY[ctx].elev = Math.max(-30, Math.min(30, Math.round(rise)));
    EY[ctx].elevUnit = base;
  } else {
    const deg = run>0 ? Math.atan((EY[ctx].elev||0)/run)*180/Math.PI : 0;  // base → deg
    EY[ctx].elev = Math.max(-15, Math.min(15, Math.round(deg*2)/2));
    EY[ctx].elevUnit = 'deg';
  }
  buildEyPanel(ctx); eyHostRender(ctx);
}
function eyReset(ctx){
  Object.assign(EY[ctx], EY_DEFAULTS);
  EY[ctx].elevUnit = elevBaseUnit(ctx);   /* EY_DEFAULTS has no unit — restore the context base */
  eySyncFirmness(ctx);
  buildEyPanel(ctx); eyHostRender(ctx);
}

// Expose for inline handlers and the renderAll orchestrator.
Object.assign(window, { EY, eyTerms, EY_WEIGHT, EY_SHOT, EY_STANCE, EY_SITUATION, EY_LIE, EY_FIRMNESS, EY_CHIP_FIRM, SG_SITUATION_LIES, sgLieRollMult, approachLie, eyDelta, eyTotal, eyEffective, eyBase,
  buildEyPanel, eyRefreshSummary, eyHostRender, eySet, eyReset, eySyncFirmness, eyToggleElevUnit, elevBaseVal });
