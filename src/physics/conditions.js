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
/* Fixed standard reference — stock carries are assumed captured on a "standard day". The
   Environmental Adjustment edits TODAY's conditions (STATE.baseline); the carry factor scales
   off the air-density ratio vs this standard. */
const STD_COND = { tempF:70, altitudeFt:0, humidity:50, pressureInHg:29.92 };
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


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { STD_COND, adjCarry, airDensity, carryFactor, currentConditions, num, satVaporPressure });
