// PLAY: plan my round, then freeze it — and the frozen plan on the course.
// Split from play.js; shares its globals through window (see play/core.js).

/* ==================== PLAN MY ROUND, THEN FREEZE IT ====================
   The strategy engine, used the way the Rules allow it: BEFORE the round. Rule 4.3a lets a
   player use information prepared before the round (a yardage book with notes, a club for
   every tee) and forbids working anything out during it from where the ball is. So:

     PLAN    on the setup screen, before Start. Every hole is solved from the tee with your
             clubs, your dispersion and today's pins: the optimal line and the one your Strategy
             Preferences play, chained on to the green (a par 5 is tee shot, lay-up, approach).
             Pick one per hole, add a note. Stored per course in STATE.play.plans.
     FREEZE  at Start, the picked plan is COPIED onto the round as plain numbers: clubs,
             distances, aim points, notes. Nothing re-plans it after that and no screen edits
             it; the plan screen only exists while no round is open.
     PLAY    the frozen plan is shown as written: a line on the map, a strip on the sheet. In a
             tournament round that is all of it; the live optimiser stays off (pmStrategyAllowed).

   The engine uses stock carries and the course's geometry only: no wind, elevation, slope or
   weather. So the plan is distance-only too, which is the tournament rule Mark set. */
const PM_PLAN_MAX_SHOTS = 4;
function pmPlans(){ const P=pmState(); return (P.plans=P.plans||{}); }
function pmCourseKey(c){ return c ? (c.id||c.name) : null; }
function pmSetupCourse(){ const cs=STATE.courses||[]; return cs[(window.pmSetupSel||{}).c||0] || cs[0] || null; }
/* Everything a plan depends on. A plan made before any of it changed says so. */
function pmPlanStamp(c){
  const k=pmCourseKey(c), sh=(typeof cfActiveSheet==='function')?cfActiveSheet(k):null;
  const bag=(typeof aimClubs==='function'?aimClubs():[]).map(x=>`${x.id}:${Math.round(x.carry)}/${Math.round(x.total)}`).join(',');
  return [k, (c.holes||[]).length, typeof stratPosture==='function'?stratPosture():'',
          typeof stratSkillKey==='function'?stratSkillKey():'', sh?sh.id+JSON.stringify(sh.pins||{}):'-',
          JSON.stringify(STATE.strategy||{}), bag].join('|');
}
/* Where a shot is aimed, said the way a caddie would: on the green against the pin, short of
   it against the line to the middle of the green. */
function pmPlanAimTxt(h, from, aim){
  const ypu=cfYardsPerUnit(h)||1, pin=cfPin(h), mid=cfGreenMid(h)||pin;
  const yd=v=>`${ydNum(Math.abs(v))}`;
  if(pin && cfLieAt(h,aim)==='green'){
    const dPin=Math.hypot(aim.x-pin.x,aim.y-pin.y)*ypu, dMid=mid?Math.hypot(aim.x-mid.x,aim.y-mid.y)*ypu:99;
    /* with no pin sheet the "pin" IS the middle of the green, and should be called that */
    const noCut = dMid<99 && Math.hypot(pin.x-mid.x,pin.y-mid.y)*ypu<1;
    if(dMid<3 && (noCut || dPin>=3)) return 'middle of the green';
    if(dPin<3) return 'at the pin';
    if(noCut){
      const L=Math.hypot(mid.x-from.x,mid.y-from.y)||1, dx=(mid.x-from.x)/L, dy=(mid.y-from.y)/L;
      const vx=aim.x-mid.x, vy=aim.y-mid.y, along=(vx*dx+vy*dy)*ypu, lat=(dx*vy-dy*vx)*ypu;
      const parts=[];
      if(Math.abs(along)>=2) parts.push(`${yd(along)} ${along>0?'past':'short'}`);
      if(Math.abs(lat)>=2) parts.push(`${yd(lat)} ${lat>0?'right':'left'}`);
      return parts.length ? `${parts.join(', ')} of the middle` : 'middle of the green';
    }
    const L=Math.hypot(pin.x-from.x,pin.y-from.y)||1, dx=(pin.x-from.x)/L, dy=(pin.y-from.y)/L;
    const vx=aim.x-pin.x, vy=aim.y-pin.y, along=(vx*dx+vy*dy)*ypu, lat=(dx*vy-dy*vx)*ypu;
    const parts=[];
    if(Math.abs(along)>=2) parts.push(`${yd(along)} ${along>0?'past':'short'}`);
    if(Math.abs(lat)>=2) parts.push(`${yd(lat)} ${lat>0?'right':'left'}`);
    return parts.length ? `${parts.join(', ')} of the pin` : 'at the pin';
  }
  if(!mid) return '';
  const L=Math.hypot(mid.x-from.x,mid.y-from.y)||1, dx=(mid.x-from.x)/L, dy=(mid.y-from.y)/L;
  const lat=(dx*(aim.y-from.y)-dy*(aim.x-from.x))*ypu;
  return Math.abs(lat)<4 ? 'on the line to the green' : `${yd(lat)} ${ydUnit()} ${lat>0?'right':'left'} of the line to the green`;
}
/* One hole, played one way, from the tee to the green. Each shot starts where the last was
   aimed: the plan is a sequence of intentions, not a forecast of where the ball will finish. */
function pmPlanChain(h, mode){
  const shots=[]; let from={x:h.tee.x, y:h.tee.y};
  for(let k=1;k<=PM_PLAN_MAX_SHOTS;k++){
    let aim=null;
    if(mode==='opt'){
      const res=optimiseShot(h, from, {posture:stratPosture(), hcp:PLAYER});
      if(!res||res.blocked||!res.best) break;
      aim={x:Math.round(res.best.aim.x), y:Math.round(res.best.aim.y)};
    } else {
      aim=stratPrefAim(h, from, k); if(!aim) break;
    }
    const r=stratScoreShot(h, from, aim); if(!r||r.blocked||r.mean==null) break;
    const onGreen=cfLieAt(h,aim)==='green';
    shots.push({ from:{x:Math.round(from.x),y:Math.round(from.y)}, aim,
                 club:(r.shot&&r.shot.label)||'', clubId:(r.shot&&r.shot.id)||null, detail:(r.shot&&r.shot.detail)||'',
                 yd:Math.round(r.geoYd*10)/10,
                 toPin:r.toPinYd!=null?Math.round(r.toPinYd):null, toMid:r.toMidYd!=null?Math.round(r.toMidYd):null,
                 onGreen, aimTxt:pmPlanAimTxt(h, from, aim), mean:r.mean });
    const left=cfDistToPinYd(h,aim);
    if(onGreen || left==null || left<20) break;
    from=aim;
  }
  return shots;
}
function pmPlanHole(h, i){
  const num=pmHoleNum(h,i), par=+h.par||4;
  const mapped = h.tee && cfHasScale(h) && cfPin(h) && (h.green||[]).length>2;
  const yards = mapped ? Math.round(cfDistYd(h,h.tee,cfPin(h))) : (+h.yards||null);
  if(!mapped){
    return { num, par, yards, method:yards?'baseline':'none',
             exp: yards ? srForPlayer('tee', yards, stratHcpNum(PLAYER,'tee')) : null };
  }
  const opt=pmPlanChain(h,'opt'), mine=pmPlanChain(h,'mine');
  if(!opt.length && !mine.length) return { num, par, yards, method:'baseline', exp:srForPlayer('tee', yards, stratHcpNum(PLAYER,'tee')) };
  const ypu=cfYardsPerUnit(h)||1;
  const same = !!(opt[0] && mine[0] && opt.length===mine.length &&
                  opt.every((s,k)=>Math.hypot(s.aim.x-mine[k].aim.x, s.aim.y-mine[k].aim.y)*ypu<3));
  return { num, par, yards, method:'model', opt, mine:same?[]:mine, same,
           expOpt: opt.length?1+opt[0].mean:null, expMine: (!same&&mine.length)?1+mine[0].mean:null, pick:'opt' };
}
function pmPlanExp(row){
  if(!row) return null;
  if(row.method!=='model') return row.exp;
  return (row.pick==='mine' && row.expMine!=null) ? row.expMine : (row.expOpt!=null ? row.expOpt : row.expMine);
}
/* Solving a course is a few seconds of work on a phone, so it runs a hole at a time and says
   which hole it is on, rather than freezing the screen. */
window.pmPlanJob = window.pmPlanJob || null;
function pmPlanBuild(){
  if(pmRound()){ toast('The plan is frozen once a round starts'); return; }
  if(typeof optimiseShot!=='function'){ toast('The strategy engine is not loaded'); return; }
  const c=pmSetupCourse(); if(!c) return;
  const key=pmCourseKey(c), hs=c.holes||[], prev=pmPlans()[key];
  const job={key, i:0, n:hs.length, holes:{}};
  window.pmPlanJob=job; window.pmPlanView=true; buildPlay();
  const step=()=>{
    if(window.pmPlanJob!==job) return;
    if(job.i>=job.n){
      const sh=(typeof cfActiveSheet==='function')?cfActiveSheet(key):null;
      pmPlans()[key]={ madeAt:Date.now(), courseName:c.name||'Course', stamp:pmPlanStamp(c),
                       sheet:sh?(sh.name||'Pin sheet'):null, posture:stratPosture(),
                       holes:job.holes, notes:(prev&&prev.notes)||{} };
      saveState(); window.pmPlanJob=null; buildPlay(); return;
    }
    const h=hs[job.i]; let row;
    try{ row=pmPlanHole(h, job.i); }catch(e){ row={num:pmHoleNum(h,job.i), par:+h.par||4, method:'none'}; }
    /* a rebuild keeps the choices you already made, where the choice still exists */
    const was=prev&&prev.holes&&prev.holes[row.num];
    if(was && was.pick==='mine' && row.expMine!=null) row.pick='mine';
    job.holes[row.num]=row; job.i++;
    const pr=document.getElementById('pm-plan-prog');
    if(pr) pr.textContent=`Planning hole ${job.i} of ${job.n}…`;
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}
function pmPlanOpen(){ if(pmRound()) return; window.pmPlanView=true; buildPlay(); const el=document.getElementById('play-mode'); if(el) el.scrollTop=0; }
function pmPlanClose(){ window.pmPlanView=false; window.pmPlanJob=null; buildPlay(); }
function pmPlanCur(){ const c=pmSetupCourse(); return c ? pmPlans()[pmCourseKey(c)] || null : null; }
function pmPlanPick(num, which){
  if(pmRound()) return;
  const pl=pmPlanCur(), row=pl&&pl.holes[num]; if(!row||row.method!=='model') return;
  row.pick=which; saveState();
  const el=document.getElementById('play-mode'), y=el?el.scrollTop:0; buildPlay(); if(el) el.scrollTop=y;
}
function pmPlanNote(num, txt){
  if(pmRound()) return;
  const pl=pmPlanCur(); if(!pl) return;
  const t=String(txt||'').trim().slice(0,140);
  if(t) pl.notes[num]=t; else delete pl.notes[num];
  saveState();
}
function pmPlanDelete(){
  if(pmRound()) return;
  const c=pmSetupCourse(); if(!c||!pmPlans()[pmCourseKey(c)]) return;
  if(!confirm('Delete the plan for this course?')) return;
  if(typeof sgForget==='function') sgForget('play.plans', pmCourseKey(c));
  delete pmPlans()[pmCourseKey(c)]; saveState(); window.pmPlanView=false; buildPlay();
}
/* THE FREEZE: a copy, not a reference. Rebuilding or deleting the course's plan afterwards
   cannot reach the round, and a tournament round records when it was frozen. */
function pmPlanFreeze(c, pl){
  const holes={};
  Object.values(pl.holes||{}).forEach(row=>{
    const pick = row.method==='model' ? ((row.pick==='mine' && row.mine && row.mine.length) ? 'mine' : 'opt') : null;
    holes[row.num]={ num:row.num, par:row.par, yards:row.yards, method:row.method, pick, same:!!row.same,
                     shots: pick ? (row[pick]||[]).map(s=>({club:s.club, clubId:s.clubId||null, detail:s.detail||'', yd:s.yd, from:s.from, aim:s.aim, toPin:s.toPin,
                                                              toMid:s.toMid, onGreen:s.onGreen, aimTxt:s.aimTxt})) : [],
                     exp: pmPlanExp(row), note: (pl.notes||{})[row.num]||'' };
  });
  return JSON.parse(JSON.stringify({ madeAt:pl.madeAt, frozenAt:Date.now(), stale:pmPlanStamp(c)!==pl.stamp,
                                     sheet:pl.sheet, posture:pl.posture, holes }));
}
function pmPlanTotal(pl){
  let exp=0, par=0, n=0;
  Object.values(pl.holes||{}).forEach(row=>{ const e=pmPlanExp(row); if(e!=null){ exp+=e; par+=row.par; n++; } });
  return {exp, par, n};
}
function pmWhen(t){
  const d=new Date(t), now=new Date();
  const tm=d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  return d.toDateString()===now.toDateString() ? `${tm} today` : `${d.toLocaleDateString([], {month:'short', day:'numeric'})}, ${tm}`;
}
/* The card on the setup screen: make a plan, or the one you made and whether it still holds. */
function pmSetupPlanHTML(c){
  const pl=pmPlans()[pmCourseKey(c)];
  if(!pl) return `<div class="pm-plancard">
      <div class="pm-plancard-h">Your plan</div>
      <p>Work the round out before you tee off: a club and a line for every hole, with your clubs and today's pins. It is frozen when the round starts and shown as written.</p>
      <button type="button" class="btn pm-plan-btn" onclick="pmPlanBuild()">Plan this round</button>
    </div>`;
  const t=pmPlanTotal(pl), stale=pmPlanStamp(c)!==pl.stamp, d=t.exp-t.par;
  return `<div class="pm-plancard">
      <div class="pm-plancard-h">Your plan <span>made ${pmWhen(pl.madeAt)}</span></div>
      <p>${t.n} hole${t.n===1?'':'s'} · plays <b>${t.exp.toFixed(1)}</b> (${d>=0?'+':''}${d.toFixed(1)} vs par ${t.par})${pl.sheet?` · pins: ${escapeHtml(pl.sheet)}`:' · pins: middle of each green'}</p>
      ${stale?`<p class="pm-warn">Made before your clubs, pins or preferences changed. Rebuild it, or take it as it is.</p>`:''}
      <label class="pm-plan-use"><input type="checkbox" id="pm-plan-use" checked> Take this plan onto the course</label>
      <div class="pm-plan-row">
        <button type="button" class="btn pm-plan-btn" onclick="pmPlanOpen()">View &amp; edit</button>
        <button type="button" class="btn pm-plan-btn" onclick="pmPlanBuild()">Rebuild</button>
      </div>
    </div>`;
}
function pmPlanClubTxt(s){ return `${s.club}${s.detail&&s.detail!=='full swing'?' '+s.detail.split(' ')[0]:''}`; }
function pmPlanChainHTML(shots){
  return shots.map(s=>`<span class="pm-ch"><b>${escapeHtml(pmPlanClubTxt(s))}</b> ${ydNum(s.yd)}<i>${escapeHtml(s.aimTxt||'')}</i></span>`).join('<span class="pm-ch-arrow">→</span>');
}
function pmPlanHTML(){
  const c=pmSetupCourse();
  const head=`<div class="pm-pv-top"><button type="button" class="pm-pv-back" onclick="pmPlanClose()">‹ Back</button>
      <h2>Plan · ${escapeHtml(c?c.name||'Course':'')}</h2></div>`;
  if(window.pmPlanJob) return `<div class="pm-setup pm-pv">${head}
      <p class="pm-pv-prog" id="pm-plan-prog">Planning hole ${window.pmPlanJob.i+1} of ${window.pmPlanJob.n}…</p>
      <p class="pm-note">Each hole is solved from the tee with your clubs, your dispersion and today's pins, then on to the green.</p></div>`;
  const pl=c&&pmPlans()[pmCourseKey(c)];
  if(!pl) return `<div class="pm-setup pm-pv">${head}<button type="button" class="btn btn-primary" onclick="pmPlanBuild()">Plan this round</button></div>`;
  const t=pmPlanTotal(pl), f=v=>v==null?'—':v.toFixed(2);
  const holes=Object.values(pl.holes).sort((a,b)=>a.num-b.num).map(row=>{
    const note=`<input type="text" class="pm-ph-note" maxlength="140" placeholder="Note for this hole" value="${escapeHtml((pl.notes||{})[row.num]||'')}" onchange="pmPlanNote(${row.num}, this.value)">`;
    const hd=`<div class="pm-ph-h"><b>${row.num}</b><span>par ${row.par}${row.yards?` · ${ydNum(row.yards)} ${ydUnit()}`:''}</span><em>${f(pmPlanExp(row))}</em></div>`;
    if(row.method!=='model') return `<div class="pm-ph">${hd}<p class="pm-ph-none">${row.method==='baseline'?'No hole map to plan a line on, so this is the score for a hole that long. Re-import or trace it in My Courses.':'Not enough data on this hole to plan.'}</p>${note}</div>`;
    const opt=(k,lbl,shots,exp)=>`<button type="button" class="pm-ph-opt${row.pick===k?' on':''}" onclick="pmPlanPick(${row.num},'${k}')" aria-pressed="${row.pick===k}">
        <span class="pm-ph-k">${lbl}</span><span class="pm-ph-chain">${pmPlanChainHTML(shots)}</span><b>${f(exp)}</b></button>`;
    return `<div class="pm-ph">${hd}
      ${row.opt.length?opt('opt', row.same?'Optimal = yours':'Optimal', row.opt, row.expOpt):''}
      ${row.mine&&row.mine.length?opt('mine','Yours', row.mine, row.expMine):''}
      ${note}</div>`;
  }).join('');
  const d=t.exp-t.par;
  return `<div class="pm-setup pm-pv">${head}
      <div class="pm-pv-sum"><b>${t.exp.toFixed(1)}</b><span>${d>=0?'+':''}${d.toFixed(1)} vs par ${t.par} · made ${pmWhen(pl.madeAt)}${pl.sheet?` · ${escapeHtml(pl.sheet)}`:''}</span></div>
      <p class="pm-note">Pick a line for each hole and add what you want to remember. The numbers are expected strokes for the hole. At Start the plan is frozen onto the round, and nothing on the course works anything out again.</p>
      ${holes}
      <div class="pm-plan-row pm-pv-foot">
        <button type="button" class="btn pm-plan-btn" onclick="printScoringProfile(true)">⎙ Print</button>
        <button type="button" class="btn pm-plan-btn" onclick="pmPlanBuild()">Rebuild</button>
        <button type="button" class="btn pm-plan-btn pm-plan-del" onclick="pmPlanDelete()">Delete plan</button>
      </div>
    </div>`;
}
/* ---- on the course: the frozen plan, as written ---- */
function pmPlanFor(h){
  const r=pmRound(); if(!r||!r.plan||!h) return null;
  return r.plan.holes[pmHoleNum(h, r.cur)] || null;
}
function pmPlanStripHTML(h, e){
  const p=pmPlanFor(h); if(!p) return '';
  const k=(e.shots||[]).length, S=p.shots||[];
  if(!S.length && !p.note) return '';
  const cur=S[k];
  return `<div class="pm-pstrip"><span class="pm-pstrip-k">Plan</span>
      <span class="pm-pstrip-c">${S.map((s,i)=>`<span class="${i===k?'cur':i<k?'done':''}"><b>${escapeHtml(pmPlanClubTxt(s))}</b> ${ydNum(s.yd)}</span>`).join('<i>→</i>')}</span>
      ${cur&&cur.aimTxt?`<span class="pm-pstrip-a">${escapeHtml(cur.aimTxt)}</span>`:''}
      ${p.note?`<span class="pm-pstrip-n">“${escapeHtml(p.note)}”</span>`:''}</div>`;
}
/* The plan drawn on the hole: gold, dashed, each aim marked with its club. Stored points only;
   nothing is computed from where you are. */
function pmPlanSVG(h, pxPerUnit, fs){
  const p=pmPlanFor(h); if(!p||!p.shots||!p.shots.length) return '';
  const sw=2.5/pxPerUnit, rr=6/pxPerUnit, dash=`${(9/pxPerUnit).toFixed(1)},${(6/pxPerUnit).toFixed(1)}`;
  let s='';
  p.shots.forEach(q=>{ s+=`<line x1="${q.from.x}" y1="${q.from.y}" x2="${q.aim.x}" y2="${q.aim.y}" stroke="#f4d47a" stroke-width="${sw.toFixed(1)}" stroke-dasharray="${dash}" stroke-linecap="round"/>`; });
  p.shots.forEach(q=>{
    s+=`<circle cx="${q.aim.x}" cy="${q.aim.y}" r="${rr.toFixed(1)}" fill="#f4d47a" stroke="#14351d" stroke-width="${(1.5/pxPerUnit).toFixed(1)}"/>`;
    s+=`<text x="${(q.aim.x+rr*1.6).toFixed(1)}" y="${(q.aim.y+fs*0.35).toFixed(1)}" font-family="ui-monospace,monospace" font-size="${fs.toFixed(1)}" font-weight="700" fill="#f4d47a" stroke="#14351d" stroke-width="${(4/pxPerUnit).toFixed(1)}" paint-order="stroke">${escapeHtml(pmPlanClubTxt(q))} ${ydNum(q.yd)}</text>`;
  });
  return s;
}
/* The planned shot you are about to hit, if you are where the plan expected you to be: on the
   tee for shot 1, within PM_PLAN_NEAR_YD of the planned spot after that. */
const PM_PLAN_NEAR_YD = 25;
function pmPlanAimFrom(h, P){
  const p=pmPlanFor(h); if(!p||!p.shots) return null;
  const ypu=cfYardsPerUnit(h)||1;
  let best=null, bd=1e9;
  p.shots.forEach(q=>{ const d=Math.hypot(q.from.x-P.x, q.from.y-P.y)*ypu; if(d<bd){ bd=d; best=q; } });
  return (best && bd<=PM_PLAN_NEAR_YD) ? best.aim : null;
}
function pmPlanLogHTML(r){
  if(!r||!r.plan) return '';
  return `<div class="pm-plan-log">Plan made ${pmWhen(r.plan.madeAt)}, frozen at the start of the round (${pmWhen(r.plan.frozenAt)})${r.plan.stale?' · made before the clubs, pins or preferences last changed':''}.</div>`;
}

Object.assign(window, {
  PM_PLAN_MAX_SHOTS, pmPlans, pmCourseKey, pmSetupCourse, pmPlanStamp, pmPlanAimTxt, pmPlanChain, pmPlanHole,
  pmPlanExp, pmPlanBuild, pmPlanOpen, pmPlanClose, pmPlanCur, pmPlanPick, pmPlanNote, pmPlanDelete,
  pmPlanFreeze, pmPlanTotal, pmWhen, pmSetupPlanHTML, pmPlanClubTxt, pmPlanChainHTML, pmPlanHTML, pmPlanFor,
  pmPlanStripHTML, pmPlanSVG, PM_PLAN_NEAR_YD, pmPlanAimFrom, pmPlanLogHTML });
