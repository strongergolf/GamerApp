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
function carryFactor(){
  if(!window.adjustOn) return 1;
  const rhoB = airDensity(STATE.baseline);
  const rhoC = airDensity(STATE.baseline === STATE._cur ? STATE.baseline : currentConditions());
  return 1 + STATE.densityK * (rhoB/rhoC - 1);
}
function currentConditions(){
  return {
    tempF: num('c-temp', STATE.baseline.tempF),
    altitudeFt: num('c-alt', STATE.baseline.altitudeFt),
    humidity: num('c-hum', STATE.baseline.humidity),
    pressureInHg: parseFloat(document.getElementById('c-pres').value) || STATE.baseline.pressureInHg
  };
}
function num(id, fb){ const v = parseFloat(document.getElementById(id).value); return isNaN(v)?fb:v; }
function adjCarry(stock){ return Math.round(stock * carryFactor()); }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { adjCarry, airDensity, carryFactor, currentConditions, num, satVaporPressure });
