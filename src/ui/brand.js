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
     synced   = pulled from an authoritative external record the golfer authenticated to
     input    = typed in by the user (specs, baselines, typical-round stats)
     presumed = assumed / interviewed / app default — NOT measured */
const SG_PROV = {
  captured: { label:'Captured', color:'var(--green)', bg:'rgba(0,133,63,.12)' },
  /* SYNCED — pulled from an authoritative external record the golfer authenticated to, rather
     than typed. A handicap index from GHIN or Golf Canada is the case this exists for: no
     device measured it, so it is not Captured, and it is not calculated from Captured data, so
     it is not Verified — but it is a federation's audited record of posted scores, which is a
     long way above a number somebody typed. Stretching Verified to cover it would have broken
     that label's one rule, so it gets its own. */
  synced:   { label:'Synced',   color:'var(--sky)',   bg:'rgba(26,90,170,.18)' },
  verified: { label:'Verified', color:'var(--green)', bg:'rgba(0,133,63,.12)' },
  input:    { label:'Input',    color:'var(--sky)',   bg:'rgba(26,90,170,.12)' },
  presumed: { label:'Presumed', color:'var(--dp-loft)', bg:'rgba(196,150,30,.16)' }
};
/* Inline provenance badge. kind ∈ captured|verified|input|presumed. */
function sgProv(kind){
  const p=SG_PROV[kind]||SG_PROV.presumed;
  const tick=kind==='verified'?'✓ ':kind==='synced'?'↻ ':'';
  return `<span class="sg-prov" style="color:${p.color};background:${p.bg}">${tick}${p.label}</span>`;
}
/* Resolve the provenance of a calculation from its inputs' provenance (weakest wins;
   all-captured promotes to verified). */
function sgProvOf(...kinds){
  if(kinds.includes('presumed')) return 'presumed';
  if(kinds.includes('input')) return 'input';
  if(kinds.includes('synced')) return 'synced';      /* between typed and measured */
  return kinds.length ? 'verified' : 'presumed';
}

/* ---- Theme (light / dark) — persisted in localStorage, applied on load ---- */
const SG_THEME_KEY='strongergolf_theme';
function sgApplyTheme(){
  let t='light';
  try{ t=localStorage.getItem(SG_THEME_KEY)||'light'; }catch(e){}
  if(document.body) document.body.classList.toggle('theme-dark', t==='dark');
  const cb=document.getElementById('set-dark'); if(cb) cb.checked=(t==='dark');
}
function sgToggleTheme(on){
  try{ localStorage.setItem(SG_THEME_KEY, on?'dark':'light'); }catch(e){}
  if(document.body) document.body.classList.toggle('theme-dark', !!on);
}
sgApplyTheme();

Object.assign(window, { SG_RED, SG_BALL_FILL, SG_BALL_STROKE, sgBall, sgFlagstick, SG_PROV, sgProv, sgProvOf, sgApplyTheme, sgToggleTheme });

/* ============================================================
   THE ANATOMY OF A SHOT — Impact, Launch, Flight

   Mark's framing, and it is the right one because it is CAUSAL: what the club does to the
   ball, what the ball leaves at, where it ends up. Each stage has three numbers and no more,
   because the horizontal half of each is deliberately zeroed out — centred contact, square
   face and path, no spin axis — so what is left is the vertical story that actually differs
   between a 9-iron and a wedge, or between a full swing and a 9 o'clock one.

     IMPACT   Vert. Face   Vert. Path   Club Speed
     LAUNCH   Launch       Ball Speed   Spin
     FLIGHT   Apex         Carry        Total          (+ the lateral tendency, which is the
                                                        one horizontal number worth keeping)

   The display rule this serves: the ONE line a golfer reads standing over the ball is always
   visible; the full picture is one tap away and never more than one tap away. A shot card is
   a headline with a body, not a wall.

   A stage's cell may be null, and prints as an em dash rather than a guess — a number with
   nothing in the app standing behind it is worse than a gap. (Chip speeds are no longer
   gaps: they are estimated from launch and carry, shown dim, and say so on hover.) */
const SHOT_STAGES = ['Impact','Launch','Flight'];
/* COLUMNS, not rows: the three stages sit side by side, each a stack of three, so reading
   down a column is one stage and reading across is cause to effect. The rows this replaced
   wrapped at different points on every card, which made the same number move around.
   Anything past the nine — the lateral tendency, a landing description, a roll — is a
   property of the whole shot rather than of one stage, so it rides in `stages.extra`
   under all three columns instead of stretching one of them.
   A trailing unit ("95 mph", "1,200 rpm") is split off and set small, so the number keeps
   the weight and a column stays narrow enough for a phone.
   `names` lets another tab reuse the layout with its own stages (Putting's working). */
function saValue(v){
  if(v==null||v==='') return '&mdash;';
  const m=String(v).match(/^(.*\d)\s+([^\d<]+)$/);
  return m ? `${m[1]}<small>${m[2]}</small>` : v;
}
function saCell(c){
  return `<span class="sa-cell${c.dim?' dim':''}${c.key?' sa-key':''}"${c.title?` title="${escapeHtml(c.title)}"`:''}>
      <span class="sa-k">${c.k}</span>
      <span class="sa-v">${saValue(c.v)}</span>
    </span>`;
}
function shotStageHTML(stages, names){
  const cols=(names||SHOT_STAGES).map(name=>{
    const cells=stages[name.toLowerCase()]||[];
    if(!cells.length) return '';
    return `<div class="sa-stage">
      <span class="sa-stage-name">${name}</span>
      <div class="sa-cells">${cells.map(saCell).join('')}</div>
    </div>`;
  }).join('');
  const extra=(stages.extra||[]).filter(Boolean);
  return `<div class="shot-anatomy">${cols}${extra.length?`<div class="sa-extra">${extra.map(saCell).join('')}</div>`:''}</div>`;
}
Object.assign(window, { SHOT_STAGES, shotStageHTML, saCell, saValue });
