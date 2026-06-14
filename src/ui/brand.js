// Shared StrongerGolf visual marks — reuse across every SVG in the app so the ball
// and the target always read the same way.
//   sgBall(cx,cy,r)                      → white golf ball with a black outline (the ball, always)
//   sgFlagstick(baseX,baseY,topX,topY,d) → thin pole + red flag (the target / hole)
// Colours are codified here so they can't drift between views.

const SG_RED = '#e0202a';          /* flag red */
const SG_BALL_FILL = '#ffffff';
const SG_BALL_STROKE = '#141414';

function sgBall(cx,cy,r){
  r=r||7;
  const sw=Math.max(0.9,(r*0.18)).toFixed(1);
  return `<circle cx="${(+cx).toFixed(1)}" cy="${(+cy).toFixed(1)}" r="${r}" fill="${SG_BALL_FILL}" stroke="${SG_BALL_STROKE}" stroke-width="${sw}"/>`;
}
/* Pole runs from (baseX,baseY) on the ground to (topX,topY); flag flies toward `dir`
   (+1 right / −1 left). Pass screen coords (project 3D first if needed). */
function sgFlagstick(baseX,baseY,topX,topY,dir){
  dir = dir===-1 ? -1 : 1;
  const fw=11, fh=7.5;
  const tx=(+topX), ty=(+topY);
  return `<circle cx="${(+baseX).toFixed(1)}" cy="${(+baseY).toFixed(1)}" r="2.3" fill="${SG_BALL_STROKE}"/>`
    + `<line x1="${(+baseX).toFixed(1)}" y1="${(+baseY).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#c9c9c9" stroke-width="1.5" stroke-linecap="round"/>`
    + `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${(tx+dir*fw).toFixed(1)},${(ty+fh*0.5).toFixed(1)} ${tx.toFixed(1)},${(ty+fh).toFixed(1)}" fill="${SG_RED}"/>`;
}

/* ---- Data provenance ----
   Every data point in the app is one of four states. Calculations inherit the weakest
   provenance of their inputs: derived-from-Captured = Verified (trustworthy); derived
   from Input or Presumed stays Input/Presumed (not Verified).
     captured = measured by a device (launch monitor, GPS, putt timer)
     verified = calculated directly from captured data
     input    = typed in by the user (specs, baselines, typical-round stats)
     presumed = assumed / interviewed / app default — NOT measured */
const SG_PROV = {
  captured: { label:'Captured', color:'#00853F', bg:'rgba(0,133,63,.12)' },
  verified: { label:'Verified', color:'#00853F', bg:'rgba(0,133,63,.12)' },
  input:    { label:'Input',    color:'#1a5aaa', bg:'rgba(26,90,170,.12)' },
  presumed: { label:'Presumed', color:'#b07d12', bg:'rgba(196,150,30,.16)' }
};
/* Inline provenance badge. kind ∈ captured|verified|input|presumed. */
function sgProv(kind){
  const p=SG_PROV[kind]||SG_PROV.presumed;
  const tick=kind==='verified'?'✓ ':'';
  return `<span class="sg-prov" style="color:${p.color};background:${p.bg}">${tick}${p.label}</span>`;
}
/* Resolve the provenance of a calculation from its inputs' provenance (weakest wins;
   all-captured promotes to verified). */
function sgProvOf(...kinds){
  if(kinds.includes('presumed')) return 'presumed';
  if(kinds.includes('input')) return 'input';
  return kinds.length ? 'verified' : 'presumed';
}

Object.assign(window, { SG_RED, SG_BALL_FILL, SG_BALL_STROKE, sgBall, sgFlagstick, SG_PROV, sgProv, sgProvOf });
