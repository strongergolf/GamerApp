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
   One preference, read everywhere a physical quantity is shown. Stored values stay in the
   app's canonical units (°F, ft, inHg, yards) so nothing downstream has to know or care —
   only the edges convert. */
function unitSys(){ return ((window.STATE&&STATE.units)||'imperial')==='metric'?'metric':'imperial'; }
function isMetric(){ return unitSys()==='metric'; }
const UNIT_CONV = {
  temp:     { metric:{ label:'°C',  to:f=>(f-32)*5/9,      from:c=>c*9/5+32,      step:0.5 },
              imperial:{ label:'°F', to:f=>f,              from:f=>f,             step:1 } },
  altitude: { metric:{ label:'m',   to:ft=>ft*0.3048,      from:m=>m/0.3048,      step:10 },
              imperial:{ label:'ft', to:ft=>ft,            from:ft=>ft,           step:50 } },
  pressure: { metric:{ label:'hPa', to:inHg=>inHg*33.8639, from:h=>h/33.8639,     step:1 },
              imperial:{ label:'inHg', to:v=>v,            from:v=>v,             step:0.01 } },
  distance: { metric:{ label:'m',   to:yd=>yd*0.9144,      from:m=>m/0.9144,      step:1 },
              imperial:{ label:'yd', to:yd=>yd,            from:yd=>yd,           step:1 } }
};
function unitDef(kind){ return (UNIT_CONV[kind]||UNIT_CONV.distance)[unitSys()]; }
function unitLabel(kind){ return unitDef(kind).label; }
/* canonical -> display */
function toDisplay(kind, v, dp){
  const n=unitDef(kind).to(+v||0);
  return dp==null ? n : +n.toFixed(dp);
}
/* display -> canonical */
function fromDisplay(kind, v){ return unitDef(kind).from(+v||0); }
function setUnits(sys){
  window.STATE.units = (sys==='metric')?'metric':'imperial';
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
  UNIT_CONV, unitSys, isMetric, unitDef, unitLabel, toDisplay, fromDisplay, setUnits });
