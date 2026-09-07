// Atmospheric model: air density from temp/altitude/humidity/pressure, and the carry factor
// that scales stock yardages to playing conditions.

/* ============================================================
   AIR DENSITY ENGINE
   ρ computed from temp, altitude, humidity, pressure.
   Carry scales off the baseline/current density ratio via k.
   ============================================================ */
function satVaporPressure(tempC){ return 610.78 * Math.exp(17.27*tempC/(tempC+237.3)); } /* Pa */
function airDensity(c){
  const tempC = (c.tempF - 32) * 5/9;
  const T = tempC + 273.15;
  const P0 = c.pressureInHg * 3386.39;                 /* sea-level pressure in Pa */
  const hM = c.altitudeFt * 0.3048;
  const P = P0 * Math.pow(1 - 2.25577e-5 * hM, 5.25588); /* pressure at altitude */
  const Pv = (c.humidity/100) * satVaporPressure(tempC);
  const Pd = P - Pv;
  return Pd/(287.058*T) + Pv/(461.495*T);              /* kg/m^3 */
}
/* The reference day the stock carries are assumed to have been captured on. The
   Environmental Adjustment edits TODAY's conditions (STATE.baseline); the carry factor scales
   off the air-density ratio against this standard.

   Set to a fine spring day at Vancouver Golf Club rather than the textbook "standard
   atmosphere", because that is where these numbers were actually hit. A reference nobody
   plays in makes the adjustment read as a correction to reality instead of a comparison
   between two real days:
     22 °C          — a pleasant Lower Mainland spring afternoon
     50 ft          — Coquitlam sits just above sea level
     65 % humidity  — coastal spring; higher than the 50 % textbook figure
     30.05 inHg     — the settled high that comes with a clear spring day
   Air density here is ~1.185 kg/m³ against 1.196 for the old standard, so the same swing
   carries about 0.5 % further than the previous reference implied. INPUT, not measured — if
   a launch-monitor session records the conditions it was captured in, use those. */
const STD_COND = { tempF:71.6, altitudeFt:50, humidity:65, pressureInHg:30.05 };

/* ---------- UNITS ----------
   A preference PER CATEGORY, read everywhere a physical quantity is shown. Stored values stay
   in the app's canonical units (°F, ft, inHg, yards, oz) so nothing downstream has to know or
   care — only the edges convert.

   Per category rather than one global switch because that is how people actually measure:
   North American golf is played in yards whatever the passport, while everything outside the
   game may well be metric. A Canadian wants yards off the tee and °C in the forecast, and
   club weight in grams because that is how a fitter states it. One toggle cannot say that.

   GROUPS: the preference is stored per GROUP, and several conversion kinds can share one.
   `short` (feet on the green) follows `distance`, so choosing yards gives feet on the green
   and choosing metres gives metres for both — one decision, as a golfer would expect. */
const UNIT_GROUP = { distance:'distance', short:'distance', speed:'speed', temp:'temp',
                     altitude:'altitude', pressure:'pressure', mass:'mass', height:'height' };
function unitSysFor(kind){
  const g = UNIT_GROUP[kind] || 'distance';
  const prefs = (window.STATE && STATE.unitPrefs) || null;
  const v = prefs ? prefs[g] : null;
  /* fall back to the legacy single setting so a save made before this existed still reads */
  const fallback = ((window.STATE && STATE.units) || 'imperial');
  return (v || fallback)==='metric' ? 'metric' : 'imperial';
}
/* Legacy shape: the whole-app answer, true only when EVERY group is metric. Kept for the
   'All metric' button's on-state; display code should ask about its own kind instead. */
function unitSys(){ return Object.keys(UNIT_SETTINGS).every(g=>unitSysFor(g)==='metric') ? 'metric' : 'imperial'; }
/* isMetric('speed') etc. Defaults to distance because that is what the great majority of
   call sites are deciding, and a wrong default there would be the least surprising. */
function isMetric(kind){ return unitSysFor(kind||'distance')==='metric'; }
const UNIT_CONV = {
  temp:     { metric:{ label:'°C',  to:f=>(f-32)*5/9,      from:c=>c*9/5+32,      step:0.5 },
              imperial:{ label:'°F', to:f=>f,              from:f=>f,             step:1 } },
  altitude: { metric:{ label:'m',   to:ft=>ft*0.3048,      from:m=>m/0.3048,      step:10 },
              imperial:{ label:'ft', to:ft=>ft,            from:ft=>ft,           step:50 } },
  pressure: { metric:{ label:'hPa', to:inHg=>inHg*33.8639, from:h=>h/33.8639,     step:1 },
              imperial:{ label:'inHg', to:v=>v,            from:v=>v,             step:0.01 } },
  distance: { metric:{ label:'m',   to:yd=>yd*0.9144,      from:m=>m/0.9144,      step:1 },
              imperial:{ label:'yd', to:yd=>yd,            from:yd=>yd,           step:1 } },
  /* Short distances — putts, proximity, apex height — held in FEET. */
  short:    { metric:{ label:'m',   to:ft=>ft*0.3048,      from:m=>m/0.3048,      step:0.1 },
              imperial:{ label:'ft', to:ft=>ft,            from:ft=>ft,           step:1 } },
  speed:    { metric:{ label:'km/h',to:mph=>mph*1.609344,  from:k=>k/1.609344,    step:1 },
              imperial:{ label:'mph',to:v=>v,              from:v=>v,             step:1 } },
  /* Club weight — canonical OUNCES, because that is how the putter specs were entered.
     A fitter states head weight in grams, so this is the category most likely to be set
     metric by someone who still plays in yards. */
  mass:     { metric:{ label:'g',   to:oz=>oz*28.349523,   from:g=>g/28.349523,   step:1 },
              imperial:{ label:'oz',to:v=>v,               from:v=>v,             step:0.25 } },
  /* Player height — canonical INCHES. Imperial shows feet-and-inches through fmtHeight
     rather than a decimal, because nobody says "five point nine feet". */
  height:   { metric:{ label:'cm',  to:inch=>inch*2.54,    from:cm=>cm/2.54,      step:1 },
              imperial:{ label:'in',to:v=>v,               from:v=>v,             step:1 } }
};
/* The settings screen is generated from this, so adding a category is one entry here plus
   its conversion above — the UI does not need touching. */
const UNIT_SETTINGS = {
  distance: { label:'Distance',     note:'Shot yardages, and distances on the green', imperial:'yd / ft', metric:'m' },
  speed:    { label:'Speed',        note:'Ball and club speed',                       imperial:'mph',     metric:'km/h' },
  temp:     { label:'Temperature',  note:'Playing conditions',                        imperial:'°F',      metric:'°C' },
  altitude: { label:'Elevation',    note:'Altitude above sea level',                  imperial:'ft',      metric:'m' },
  pressure: { label:'Pressure',     note:'Barometric pressure',                       imperial:'inHg',    metric:'hPa' },
  mass:     { label:'Club Weight',  note:'Head and putter weights',                   imperial:'oz',      metric:'g' },
  height:   { label:'Player Height',note:'Your height in Myself',                      imperial:'ft / in', metric:'cm' }
};
function unitDef(kind){ return (UNIT_CONV[kind]||UNIT_CONV.distance)[unitSysFor(kind)]; }
function unitLabel(kind){ return unitDef(kind).label; }
/* canonical -> display */
function toDisplay(kind, v, dp){
  const n=unitDef(kind).to(+v||0);
  return dp==null ? n : +n.toFixed(dp);
}
/* display -> canonical */
function fromDisplay(kind, v){ return unitDef(kind).from(+v||0); }
/* ---- The shorthands the rest of the app actually calls ----
   Distances are stored in YARDS (and putts/apex in FEET) everywhere; these are the only
   place that changes. Two forms of each: a bare NUMBER for when the unit is in a column
   header, and a formatted STRING for when it sits inline.

   Rounding is per-unit rather than fixed: a metre is a bigger step than a yard, so carrying
   the same decimal places would imply precision that is not there. 245 yd reads as 224 m,
   not 224.0 m.

   Deliberately NOT converted, because these are universal in golf whatever a player's
   nationality: green speed (a Stimpmeter reading is in feet everywhere), club length and
   lie/loft (equipment specs are in inches and degrees), and spin (rpm). */
function ydNum(v, dp){ const n=toDisplay('distance', v); return dp==null?Math.round(n):+n.toFixed(dp); }
function ydUnit(){ return unitLabel('distance'); }
function fmtYd(v, dp){ return v==null||v===''||isNaN(+v) ? '—' : `${ydNum(v,dp)} ${ydUnit()}`; }
function ftNum(v, dp){ const n=toDisplay('short', v); return dp==null?(isMetric('short')?+n.toFixed(1):Math.round(n)):+n.toFixed(dp); }
function ftUnit(){ return unitLabel('short'); }
/* A proximity readout wants the unit that makes it a small whole number. Under a metre,
   "60 cm" reads and speaks better than "0.6 m" — the same reason a two-foot putt is never
   called two thirds of a yard. Imperial already has that in feet, so only metric switches. */
const FT_CM_CUTOFF_M = 1;
function fmtFt(v, dp){
  if(v==null||v===''||isNaN(+v)) return '—';
  if(isMetric('short')){
    const m=toDisplay('short', v);
    if(Math.abs(m) < FT_CM_CUTOFF_M) return `${Math.round(m*100)} cm`;
    return `${+m.toFixed(dp==null?1:dp)} m`;
  }
  return `${ftNum(v,dp)} ${ftUnit()}`;
}
/* Inches — break, aim offset, pace past the hole, elevation over a putt. Held in INCHES
   because that is the AimPoint model's own unit, but a metric golfer does not read a break in
   inches any more than an imperial one reads it in centimetres. Imperial keeps the inch mark;
   metric gets whole centimetres, which is the right resolution for a number this size.
   (Cup Widths stays unitless and is the primary readout either way.) */
function inNum(v, dp){
  const n=+v||0;
  return isMetric('short') ? Math.round(n*2.54) : (dp==null ? Math.round(n*10)/10 : +n.toFixed(dp));
}
function inUnit(){ return isMetric('short') ? 'cm' : '"'; }
/* Imperial writes 2.2" with no space; metric writes 6 cm with one. */
function fmtIn(v, dp){
  if(v==null||v===''||isNaN(+v)) return '—';
  return isMetric('short') ? `${inNum(v)} cm` : `${inNum(v,dp)}"`;
}
function mphNum(v){ return Math.round(toDisplay('speed', v)); }
function mphUnit(){ return unitLabel('speed'); }
function fmtMph(v){ return v==null||v===''||isNaN(+v) ? '—' : `${mphNum(v)} ${mphUnit()}`; }
/* Club weight — canonical ounces. Grams are whole numbers; ounces want a couple of decimals,
   since a putter head is specified to the quarter-ounce. */
function ozNum(v, dp){
  const n=toDisplay('mass', v);
  return isMetric('mass') ? Math.round(n) : +n.toFixed(dp==null?2:dp);
}
function ozUnit(){ return unitLabel('mass'); }
function fmtOz(v, dp){ return v==null||v===''||isNaN(+v) ? '—' : `${ozNum(v,dp)} ${ozUnit()}`; }
/* Player height — canonical inches. Metric is a whole number of centimetres; imperial is
   feet-and-inches, because 5'11" is how a height is said and 71 in is not. */
function fmtHeight(totalIn){
  const n=+totalIn||0;
  if(!n) return '—';
  if(isMetric('height')) return `${Math.round(n*2.54)} cm`;
  const ft=Math.floor(n/12), inch=Math.round(n-ft*12);
  return inch===12 ? `${ft+1}'` : `${ft}'${inch}"`;
}
/* Set EVERY category at once — the "All imperial" / "All metric" buttons. */
function setUnits(sys){
  const v=(sys==='metric')?'metric':'imperial';
  window.STATE.units = v;                                  // legacy field kept in step
  window.STATE.unitPrefs = window.STATE.unitPrefs || {};
  Object.keys(UNIT_SETTINGS).forEach(g=>{ STATE.unitPrefs[g]=v; });
  saveState();
  if(typeof refreshAll==='function') refreshAll();
  else if(typeof buildEnvPanels==='function') buildEnvPanels();
}
/* Set one category. */
function setUnitPref(group, sys){
  if(!UNIT_SETTINGS[group]) return;
  window.STATE.unitPrefs = window.STATE.unitPrefs || {};
  STATE.unitPrefs[group] = (sys==='metric')?'metric':'imperial';
  /* keep the legacy field meaningful: it reads "metric" only when everything is */
  window.STATE.units = Object.keys(UNIT_SETTINGS).every(g=>STATE.unitPrefs[g]==='metric') ? 'metric' : 'imperial';
  saveState();
  if(typeof refreshAll==='function') refreshAll();
  else if(typeof buildEnvPanels==='function') buildEnvPanels();
}
function carryFactor(){
  if(!window.adjustOn) return 1;
  const rhoStd = airDensity(STD_COND), rhoC = airDensity(currentConditions());
  if(!rhoC) return 1;
  return 1 + STATE.densityK * (rhoStd/rhoC - 1);
}
/* Today's playing conditions live on STATE.baseline (edited via the Environmental Adjustment). */
function currentConditions(){
  const b = STATE.baseline || STD_COND;
  return { tempF:b.tempF, altitudeFt:b.altitudeFt, humidity:b.humidity, pressureInHg:b.pressureInHg };
}
function num(id, fb){ const v = parseFloat(document.getElementById(id)?.value); return isNaN(v)?fb:v; }
function adjCarry(stock){ return Math.round(stock * carryFactor()); }
/* Env-adjusted TOTAL. Only the CARRY portion scales with air density; the roll-out
   (stockTotal − stockCarry) is a ground effect, unchanged by air, so it's added back
   on top of the new carry. With adjustOn off, carryFactor()=1 ⇒ returns stockTotal. */
function adjTotal(stockCarry, stockTotal){
  const c = +stockCarry || 0, t = +stockTotal || 0;
  const roll = Math.max(0, t - c);
  return adjCarry(c) + roll;
}


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { STD_COND, adjCarry, adjTotal, airDensity, carryFactor, currentConditions, num, satVaporPressure,
  UNIT_CONV, UNIT_GROUP, UNIT_SETTINGS, unitSys, unitSysFor, isMetric, unitDef, unitLabel,
  toDisplay, fromDisplay, setUnits, setUnitPref,
  ydNum, ydUnit, fmtYd, ftNum, ftUnit, fmtFt, FT_CM_CUTOFF_M, inNum, inUnit, fmtIn, mphNum, mphUnit, fmtMph, ozNum, ozUnit, fmtOz, fmtHeight });
