// Game Plan → Plan a Shot: target → static yardage → effective ("plays-like") yardage.
// Layers elevation, wind, and rollout on top of the day's air conditions.
//
// Rough estimates (defaults — to be refined by Mark's pasted equation):
//   • Headwind  : plays LONGER by ~1.0% of static per mph
//   • Tailwind  : plays SHORTER by ~0.5% of static per mph  (wind hurts ~2× what it helps)
//   • Crosswind : ~2.0 yd lateral drift per mph (scales with flight time; mid-iron baseline)
//   • Elevation : plays-like shifts by elevation(yd) × ~1.2 (uphill longer, downhill shorter)
//   • Rollout   : expected roll subtracts from the carry you actually need
const PS_WIND_HEAD = 0.010;   // fraction of static yardage added per mph headwind
const PS_WIND_TAIL = 0.005;   // fraction subtracted per mph tailwind
const PS_CROSS_YPM = 2.0;     // yards lateral drift per mph crosswind
const PS_ELEV_K    = 1.2;     // plays-like yards per yard of elevation

function computePlanShot(){
  const out=document.getElementById('planshot-result'); if(!out) return;
  const num=id=>{ const v=parseFloat(document.getElementById(id)?.value); return isNaN(v)?0:v; };
  const S=num('ps-static');
  if(S<=0){ out.innerHTML=`<p class="intro-note" style="margin:0">Enter a static yardage above to see the number to play.</p>`; return; }
  const elev=num('ps-elev');                 // + uphill / − downhill (yards)
  const windspd=num('ps-windspd');
  const dir=document.getElementById('ps-winddir')?.value||'calm';
  const rollout=num('ps-rollout');

  const elevAdj = elev*PS_ELEV_K;            // uphill plays longer
  let windAdj=0, lateral=0, aimDir='';
  if(dir==='head')      windAdj =  S*PS_WIND_HEAD*windspd;
  else if(dir==='tail') windAdj = -S*PS_WIND_TAIL*windspd;
  else if(dir==='crossL'||dir==='crossR'){
    lateral = PS_CROSS_YPM*windspd;          // ~2 yd/mph
    aimDir  = dir==='crossL' ? 'left' : 'right';   // wind L→R pushes ball right ⇒ aim left
  }
  const playLike = S + elevAdj + windAdj;
  const carryNeeded = playLike - rollout;

  /* closest-carry club suggestion */
  let best=null,bestDiff=1e9;
  (STATE.clubs||[]).forEach(c=>{ if(c.type==='putter')return; const cc=perf(c.id).carry||0; if(cc<=0)return;
    const d=Math.abs(cc-carryNeeded); if(d<bestDiff){bestDiff=d;best=c;} });

  const sgn=v=>v>0?'+':'';
  const row=(label,val,note)=>`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2)">${label}</span>
      <span style="font-family:ui-monospace,monospace;font-weight:700;font-size:.9rem;color:var(--ink)">${val}<span style="font-weight:400;font-size:.62rem;color:var(--muted)">${note?' '+note:''}</span></span>
    </div>`;

  out.innerHTML=`<div class="profile-card" style="margin-top:0">
    <h3>Number to Play</h3>
    ${row('Static yardage', S+' yd','')}
    ${row('Elevation', sgn(elevAdj)+Math.round(elevAdj)+' yd', elev?(elev>0?'uphill':'downhill'):'level')}
    ${row('Wind', (windAdj?sgn(windAdj)+Math.round(windAdj):'0')+' yd', dir==='head'?'into':dir==='tail'?'down':windspd&&aimDir?'crosswind':'calm')}
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:2px solid var(--border2)">
      <span style="font-family:Arial,sans-serif;font-weight:800;font-size:.86rem;color:var(--ink)">Plays like</span>
      <span style="font-family:ui-monospace,monospace;font-weight:800;font-size:1.05rem;color:var(--accent,#c4427a)">${Math.round(playLike)} yd</span>
    </div>
    ${row('− Rollout', '−'+Math.round(rollout)+' yd', rollout?'expected roll':'none')}
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 0 4px">
      <span style="font-family:Arial,sans-serif;font-weight:800;font-size:.92rem;color:var(--ink)">Carry to play</span>
      <span style="font-family:ui-monospace,monospace;font-weight:800;font-size:1.25rem;color:var(--ink)">${Math.round(carryNeeded)} yd</span>
    </div>
    ${best?`<div style="margin-top:8px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2)">Closest club: <b style="color:var(--ink)">${best.label}</b> <span style="color:var(--muted)">(${perf(best.id).carry} yd carry, ${bestDiff<=0?'exact':Math.round(bestDiff)+' yd '+(perf(best.id).carry>carryNeeded?'long':'short')})</span></div>`:''}
    ${lateral?`<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:.82rem;color:var(--ink2)">Crosswind: aim <b style="color:var(--ink)">${Math.round(lateral)} yd ${aimDir}</b> of target <span style="color:var(--muted)">(~${PS_CROSS_YPM} yd/mph drift)</span></div>`:''}
    <div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1.5">Rough estimates — headwind ~1%/mph, tailwind ~0.5%/mph, elevation ×${PS_ELEV_K}, crosswind ~${PS_CROSS_YPM} yd/mph. Refine from your own data.</div>
  </div>`;
}

/* Long Term Plans — season arc from the profile (goal handicap, volume). */
function buildLongTerm(){
  const wrap=document.getElementById('longterm-wrap'); if(!wrap) return;
  const pf=STATE.profile||{};
  const cell=(label,val)=>`<div class="stat-cell"><div class="stat-label">${label}</div><div class="stat-value">${val||'—'}</div></div>`;
  wrap.innerHTML=`<div class="profile-card" style="margin-top:0">
    <h3>Handicap Goal</h3>
    <div class="detail-stats">
      ${cell('Current', pf.handicap)}
      ${cell('Goal', pf.goalHcp)}
      ${cell('Rounds / yr', pf.roundsPerYear)}
      ${cell('Practice / yr', pf.practicePerYear)}
    </div>
    <p class="gen-note" style="margin-top:10px">Edit these in Locker Room → Myself. Your goal handicap drives the SG diamond goal ring.</p>
  </div>
  <div class="profile-card">
    <h3>Milestones <span style="font-family:ui-monospace,monospace;font-size:.55rem;font-weight:400;color:var(--muted);text-transform:none">preview</span></h3>
    <p class="gen-note">Season targets and dated milestones — tie each to a link in the causal chain and track the trend. Coming soon.</p>
  </div>`;
}

// Expose for inline handlers and the renderAll orchestrator.
Object.assign(window, { computePlanShot, buildLongTerm, PS_WIND_HEAD, PS_WIND_TAIL, PS_CROSS_YPM, PS_ELEV_K });
