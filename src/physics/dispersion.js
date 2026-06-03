// Lateral dispersion model (90% CI) and club-type colour/label helpers.

/* ============================================================
   HELPERS
   ============================================================ */
const MAX_CARRY = 270;
function getDispersion(carry){
  if(carry<=100) return 3.0;
  if(carry<=110) return 3.0+(carry-100)/10*0.5;
  if(carry<=124) return 3.5+(carry-110)/14*0.5;
  if(carry<=150) return 3.5+(carry-100)/50*1.5;
  if(carry<=200) return 5.0+(carry-150)/50*5.0;
  if(carry<=270) return 10.0+(carry-200)/70*5.0;
  return 15.0;
}
function dispColor(d){
  if(d<=5) return {bg:'var(--green-pale)',color:'#0e4a2e',border:'rgba(26,102,72,.35)'};
  if(d<=10) return {bg:'var(--sky-pale)',color:'#0e3347',border:'rgba(26,90,122,.35)'};
  return {bg:'var(--gold-pale)',color:'#7a1a42',border:'rgba(196,66,122,.35)'};
}
function typeLabel(t){ return t==='wood'?'Woods & Hybrids':t==='iron'?'Irons':t==='wedge'?'Wedges':'Putter'; }
function typeHex(t){ return t==='wood'?'#d96070':t==='iron'?'#1a5aaa':t==='wedge'?'#00853F':t==='putter'?'#6b7280':'#6b7280'; }
function perf(id){ return STATE.performance[id] || {}; }


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { MAX_CARRY, dispColor, getDispersion, perf, typeHex, typeLabel });
