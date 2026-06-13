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

Object.assign(window, { SG_RED, SG_BALL_FILL, SG_BALL_STROKE, sgBall, sgFlagstick });
