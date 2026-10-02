// PLAY: after the round — each shot's value, optimal/intended/expected/actual, plan vs played, strokes gained.
// Split from play.js; shares its globals through window (see play/core.js).

/* ---- every shot's value against YOUR average, at Finish ----
   E_player(start) - E_player(next start) - 1 - penalty, on the player model: how this shot did
   against what you average from there. Used where a single shot is judged (the non-stock list)
   and kept apart from the benchmark strokes gained (sh.sg), which answers a different question. */
function pmShotValues(r){
  Object.values(r.holes||{}).forEach(e=>{
    const S=e&&e.shots; if(!S||!S.length) return;
    if(S.some(x=>x.yd==null||!x.lie)) return;
    S.forEach((sh,k)=>{
      const a=pmPlayerE(sh), nx=S[k+1], b=nx?pmPlayerE(nx):0;
      if(a==null||b==null) return;
      sh.pv=Math.round((a-b-1-(sh.pen?1:0))*1000)/1000;
    });
  });
}
/* Post-Round: the round's non-stock shots, and the same kinds across every saved round, so the
   ones you play off-pattern can be kept honest over time. */
const PM_CX_KINDS = [
  ['draw', 'Shaped draws', cx=>cx.shape==='draw'],
  ['fade', 'Shaped fades', cx=>cx.shape==='fade'],
  ['low',  'Low shots',    cx=>cx.height==='low'],
  ['high', 'High shots',   cx=>cx.height==='high'],
  ['part', 'Part swings',  cx=>!!cx.swing],
  ['grip', 'Gripped down', cx=>cx.grip>0]
];
function pmCustomShotsHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; const r=R[R.length-1];
  if(!r) return '';
  const c=(STATE.courses||[]).find(x=>(x.id||x.name)===r.courseKey), hs=(c&&c.holes)||[];
  const f=x=>`${x>=0?'+':'−'}${Math.abs(x).toFixed(2)}`;
  const list=[];
  hs.forEach((h,i)=>{ const num=pmHoleNum(h,i), e=(r.holes||{})[num];
    ((e&&e.shots)||[]).forEach((sh,k)=>{ if(sh.cx) list.push({num, k, sh}); }); });
  if(!list.length) return '';
  const where=sh=>sh.yd==null?'':`${PM_LIE_NAME[sh.lie]||sh.lie} ${sh.lie==='green'?ftNum(sh.yd*3)+' '+ftUnit():ydNum(sh.yd)}`;
  const rows=list.map(({num,k,sh})=>`<div class="pm-cs-row">
      <span class="pm-cs-h">${num}<i>shot ${k+1}</i></span>
      <span class="pm-cs-m"><b>${escapeHtml(pmClubName(sh.club)||'—')}</b> ${escapeHtml(where(sh))}<em>${escapeHtml(pmCxTxt(sh.cx, true))}</em></span>
      <b class="pm-cs-v ${sh.pv!=null&&sh.pv<0?'neg':''}">${sh.pv!=null?f(sh.pv):''}</b></div>`).join('');
  /* every round on record, by kind */
  const agg=PM_CX_KINDS.map(([key,label,test])=>{ let n=0, sum=0, nv=0;
    R.forEach(rr=>Object.values(rr.holes||{}).forEach(e=>((e&&e.shots)||[]).forEach(sh=>{
      if(sh.cx && test(sh.cx)){ n++; if(sh.pv!=null){ sum+=sh.pv; nv++; } } })));
    return {key,label,n,avg:nv?sum/nv:null,nv}; }).filter(a=>a.n);
  return `<div class="profile-card pm-cs-card">
      <h3>Non-stock shots — ${escapeHtml(r.courseName||'last round')}</h3>
      <div class="pm-cs-list">${rows}</div>
      ${agg.length?`<div class="pm-cs-agg"><div class="pm-cs-agg-h">Every round on record <span>average a shot, against your own average from the same spot</span></div>
        ${agg.map(a=>`<div class="pm-cs-agg-r"><span>${a.label}</span><i>${a.n} shot${a.n===1?'':'s'}</i><b class="${a.avg!=null&&a.avg<0?'neg':''}">${a.avg!=null?f(a.avg):'—'}</b></div>`).join('')}</div>`:''}
      <p class="pm-note">Each number is the shot against what you average from where it was played, in strokes. A shot needs its distance and the next shot's distance to be valued.</p>
    </div>`;
}

/* ---- OPTIMAL, INTENDED, EXPECTED, ACTUAL: every shot, four ways ----
   The app's one question, asked of each shot after the round, in strokes left to hole out on
   YOUR player model (the same scale the plan and the strategy engine use):
     OPTIMAL   where the model would have aimed from that spot, over your whole pattern
     INTENDED  where you aimed (if you recorded it): strokes left had it finished right there
     EXPECTED  the same aim over your whole pattern: what that choice was worth on average
     ACTUAL    where the ball really finished (plus any penalty)
   and the two gaps that matter, as gains (+ is better):
     CHOICE     optimal - expected   how good the aim was, before the swing
     EXECUTION  expected - actual    how the swing did against what that aim usually gives
   They add up to optimal - actual for the shot. A shot with no recorded aim still gets optimal
   and actual. Worked out once, at the first look after the round (the optimiser is a few
   hundred milliseconds a shot), a few shots at a time so the screen keeps moving, and kept on
   the round. Never during a round. */
const PM_FW_VER = 1;
window.pmFWJob = window.pmFWJob || null;
function pmFourWayJobs(r){
  const c=(STATE.courses||[]).find(x=>(x.id||x.name)===r.courseKey), hs=(c&&c.holes)||[], jobs=[];
  hs.forEach((h,i)=>{ const num=pmHoleNum(h,i), e=(r.holes||{})[num], S=(e&&e.shots)||[];
    S.forEach((sh,k)=>{ if(sh.lie==='green') return; const a=pmShotPt(h,sh); if(!a) return; jobs.push({h, num, k, sh, S, e}); }); });
  return jobs;
}
function pmFourWayOne(job){
  const {h, sh, S, k, e}=job, a=pmShotPt(h,sh);
  const out={hole:job.num, k, club:sh.club||null, lie:sh.lie, yd:sh.yd, commit:sh.commit||null, aimed:!!sh.tgt, pen:!!sh.pen};
  const nx=S[k+1]; let act=null;
  if(nx){ const q=pmShotPt(h,nx); act=(q && !nx.edited) ? cfExpectedStrokes(h,q,PLAYER) : pmPlayerE(nx); }
  else if(e && e.done) act=0;
  if(act!=null) out.act=act+(sh.pen?1:0);
  try{
    const res=optimiseShot(h, a, {posture:stratPosture(), hcp:PLAYER});
    if(res && !res.blocked && res.best){
      const aim={x:Math.round(res.best.aim.x), y:Math.round(res.best.aim.y)}, ro=stratScoreShot(h,a,aim);
      const E=(ro&&ro.mean!=null)?ro.mean:res.best.mean;
      if(E!=null) out.opt={E, club:(ro&&ro.shot&&ro.shot.label)||'', yd:ro?Math.round(ro.geoYd):null, aimTxt:pmPlanAimTxt(h,a,aim)};
    }
  }catch(_){}
  if(sh.tgt){
    try{ const ri=stratScoreShot(h,a,sh.tgt);
      if(ri && !ri.blocked && ri.mean!=null) out.tgt={E:ri.mean, Eat:ri.expAtAim, yd:Math.round(ri.geoYd), aimTxt:pmPlanAimTxt(h,a,sh.tgt)};
    }catch(_){}
  }
  if(out.opt && out.tgt) out.choice=out.opt.E-out.tgt.E;
  if(out.tgt && out.act!=null) out.exec=out.tgt.E-out.act;
  if(out.opt && out.act!=null) out.vsOpt=out.opt.E-out.act;
  return out;
}
function pmFourWayRun(r){
  if(window.pmFWJob || typeof optimiseShot!=='function') return;
  const jobs=pmFourWayJobs(r), job={r, jobs, i:0, out:[]}; window.pmFWJob=job;
  const step=()=>{
    if(window.pmFWJob!==job) return;
    const t0=performance.now();
    while(job.i<jobs.length && performance.now()-t0<40){ job.out.push(pmFourWayOne(jobs[job.i])); job.i++; }
    const el=document.getElementById('pm-fw-prog'); if(el) el.textContent=`Working out shot ${job.i} of ${jobs.length}…`;
    if(job.i<jobs.length){ setTimeout(step,0); return; }
    r.fourWay={v:PM_FW_VER, at:Date.now(), shots:job.out}; saveState(); window.pmFWJob=null;
    if(typeof buildPostRound==='function') buildPostRound();
  };
  setTimeout(step, 30);
}
function pmFourWayHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; const r=R[R.length-1];
  if(!r) return '';
  const head=`<h3>Optimal, intended, expected, actual — ${escapeHtml(r.courseName||'last round')}</h3>`;
  if(!r.fourWay || r.fourWay.v!==PM_FW_VER){
    if(!pmFourWayJobs(r).length) return '';
    pmFourWayRun(r);
    return `<div class="profile-card pm-fw-card">${head}<p class="pm-pv-prog" id="pm-fw-prog">Working out every shot…</p></div>`;
  }
  const F=r.fourWay.shots; if(!F.length) return '';
  const f=x=>`${x>=0?'+':'−'}${Math.abs(x).toFixed(2)}`, cls=x=>x<0?'neg':'', e2=x=>x==null?'—':x.toFixed(2);
  const sum=(k,list)=>list.reduce((s,x)=>s+x[k],0);
  const A=F.filter(x=>x.choice!=null&&x.exec!=null), O=F.filter(x=>x.vsOpt!=null);
  const commitRows=[3,2,1].map(v=>{ const L=O.filter(x=>x.commit===v); if(!L.length) return '';
      const LE=L.filter(x=>x.exec!=null);
      return `<div class="pm-fw-cm"><span>${PM_COMMIT[v]}</span><i>${L.length} shot${L.length===1?'':'s'}</i>
        <b class="${cls(sum('vsOpt',L))}">${f(sum('vsOpt',L)/L.length)}</b>${LE.length?`<em>execution <b class="${cls(sum('exec',LE))}">${f(sum('exec',LE)/LE.length)}</b></em>`:''}</div>`; }).join('');
  const clubName=id=>id?(pmClubName(id)||''):'';
  const rows=F.map(x=>`<div class="pm-fw-row">
      <div class="pm-fw-l1"><b>${x.hole}</b><span>shot ${x.k+1} · ${escapeHtml(PM_LIE_NAME[x.lie]||x.lie)} ${x.yd!=null?ydNum(x.yd):''}${x.club?` · ${escapeHtml(clubName(x.club))}`:''}</span>
        ${x.commit?`<i class="pm-fw-dot" title="${PM_COMMIT[x.commit]}">${['○','◐','●'][x.commit-1]}</i>`:''}</div>
      <div class="pm-fw-grid">
        <div><span>Optimal</span><b>${e2(x.opt&&x.opt.E)}</b><i>${x.opt?`${escapeHtml(x.opt.club)} ${x.opt.yd!=null?ydNum(x.opt.yd):''}`:'—'}</i></div>
        <div><span>Intended</span><b>${e2(x.tgt&&x.tgt.Eat)}</b><i>${x.tgt?`${ydNum(x.tgt.yd)} ${ydUnit()}`:'no aim'}</i></div>
        <div><span>Expected</span><b>${e2(x.tgt&&x.tgt.E)}</b><i>${x.tgt?'your pattern':''}</i></div>
        <div><span>Actual</span><b>${e2(x.act)}</b><i>${x.pen?'+1 penalty':''}</i></div>
      </div>
      <div class="pm-fw-l3">${x.choice!=null?`choice <b class="${cls(x.choice)}">${f(x.choice)}</b> · execution <b class="${cls(x.exec)}">${x.exec!=null?f(x.exec):'—'}</b>`
        : x.vsOpt!=null?`vs optimal <b class="${cls(x.vsOpt)}">${f(x.vsOpt)}</b>`:''}${x.tgt&&x.tgt.aimTxt?` <i>aimed ${escapeHtml(x.tgt.aimTxt)}</i>`:''}</div>
    </div>`).join('');
  return `<div class="profile-card pm-fw-card">${head}
      <div class="pm-pr-when">Strokes left to hole out, on your own player model. + is better.</div>
      <div class="pm-pr-top">
        <div><span>vs optimal</span><b class="${cls(sum('vsOpt',O))}">${O.length?f(sum('vsOpt',O)):'—'}</b><i>${O.length} shot${O.length===1?'':'s'}</i></div>
        <div><span>Choice</span><b class="${cls(sum('choice',A))}">${A.length?f(sum('choice',A)):'—'}</b><i>${A.length} aimed</i></div>
        <div><span>Execution</span><b class="${cls(sum('exec',A))}">${A.length?f(sum('exec',A)):'—'}</b><i>${A.length} aimed</i></div>
      </div>
      ${A.length?'':`<p class="pm-note">Record where you aimed (◎ aim on a shot, or tap the spot and "Aim shot N here") and each shot splits into the choice and the execution.</p>`}
      ${commitRows?`<div class="pm-fw-cms"><div class="pm-dc-log-h">By commitment <span>average a shot</span></div>${commitRows}</div>`:''}
      <details class="pm-fw-all"><summary>Every shot (${F.length})</summary>${rows}</details>
      <p class="pm-note">Choice is your aim against the optimal one, both over your whole pattern. Execution is where the ball finished against what your aim gives on average, so one shot is mostly luck; the round's total is the signal. Putts are left out.</p>
    </div>`;
}

/* ---- PLAN VS PLAYED, after the round ----
   The frozen plan said what each hole should cost on average; the shots say what happened.
   The gap per hole splits exactly in two, both priced on YOUR player model (the one the plan
   was made with, not the SG benchmark):

     tee shot vs plan  = plan's expected score - (1 + penalty + expected strokes from where
                         the tee shot actually finished)
     after the tee     = expected strokes from there - the strokes it actually took

   and tee + after = plan - score. Positive is better than the plan. One hole is mostly noise
   (the plan's number is an average over your whole pattern); a round's totals are the signal.
   Where the second shot was placed on the map or marked by GPS, the tee shot's finish is also
   measured against the planned spot: long/short and left/right, in the line of the planned shot. */
function pmPlayerE(sh){
  if(!sh || sh.yd==null || !sh.lie || typeof srForPlayer!=='function') return null;
  const d=sh.yd, g=sh.lie==='green';
  return srForPlayer(sh.lie, g?Math.max(1,d*3):Math.max(1,d), playerHcpFor(g?'green':'off', d));
}
function pmPlanReview(r){
  if(!r||!r.plan) return null;
  const c=(STATE.courses||[]).find(x=>(x.id||x.name)===r.courseKey);
  const hs=(c&&c.holes)||[];
  const rows=[], offs=[];
  const tot={plan:0, played:0, n:0, tee:0, after:0, nSplit:0, fol:{n:0, yes:0, teeYes:0, nYes:0, teeNo:0, nNo:0}};
  hs.forEach((h,i)=>{
    const num=pmHoleNum(h,i), p=r.plan.holes[num], e=(r.holes||{})[num];
    if(!p) return;
    const row={ num, par:p.par||h.par||4, plan:(p.shots||[]).map(s=>({club:pmPlanClubTxt(s), yd:s.yd})),
                leaveYd:(p.shots&&p.shots[0]&&!p.shots[0].onGreen)?p.shots[0].toPin:null,
                exp:p.exp, score:(e&&e.s!=null)?e.s:null, note:p.note||'' };
    if(row.exp!=null && row.score!=null){ row.vs=row.exp-row.score; tot.plan+=row.exp; tot.played+=row.score; tot.n++; }
    const S=(e&&e.shots)||[];
    if(row.vs!=null && S.length){
      const pen1=S[0].pen?1:0;
      const left = S.length>=2 ? pmPlayerE(S[1]) : (e.done ? 0 : null);   /* one shot and holed: nothing left */
      if(left!=null){
        const after=1+pen1+left;
        row.tee=row.exp-after; row.after=after-row.score;
        if(S[1]) row.found={lie:S[1].lie, yd:S[1].yd};
        tot.tee+=row.tee; tot.after+=row.after; tot.nSplit++;
      }
    }
    /* the club you hit off the tee against the one the plan chose */
    const pc=p.shots&&p.shots[0], hit=S[0]&&S[0].club;
    if(pc && hit){
      row.hitClub=pmClubName(hit); row.planClub=pmPlanClubTxt(pc);
      row.followed = pc.clubId ? pc.clubId===hit : pc.club===row.hitClub;
      row.hitCx = S[0].cx ? pmCxTxt(S[0].cx,false) : '';
      tot.fol.n++; if(row.followed) tot.fol.yes++;
      if(row.tee!=null){ if(row.followed){ tot.fol.teeYes+=row.tee; tot.fol.nYes++; } else { tot.fol.teeNo+=row.tee; tot.fol.nNo++; } }
    }
    /* where the tee shot finished against where the plan aimed it */
    const a=p.shots&&p.shots[0], q=S[1]?pmShotPt(h,S[1]):null, ypu=cfYardsPerUnit(h);
    if(a && q && ypu){
      const L=Math.hypot(a.aim.x-a.from.x, a.aim.y-a.from.y)||1, ux=(a.aim.x-a.from.x)/L, uy=(a.aim.y-a.from.y)/L;
      const vx=q.x-a.aim.x, vy=q.y-a.aim.y;
      row.off={ along:Math.round((vx*ux+vy*uy)*ypu*10)/10, lat:Math.round((ux*vy-uy*vx)*ypu*10)/10 };
      offs.push(row.off);
    }
    rows.push(row);
  });
  let pattern=null;
  if(offs.length){
    const m=k=>offs.reduce((s,o)=>s+o[k],0)/offs.length;
    const mAl=m('along'), mLa=m('lat');
    const sd=k=>{ const mu=m(k); return offs.length>1?Math.sqrt(offs.reduce((s,o)=>s+(o[k]-mu)**2,0)/(offs.length-1)):null; };
    pattern={ n:offs.length, along:mAl, lat:mLa, sdAlong:sd('along'), sdLat:sd('lat') };
  }
  return { madeAt:r.plan.madeAt, frozenAt:r.plan.frozenAt, rows, tot, pattern };
}
function pmPlanReviewHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; const r=R[R.length-1];
  if(!r||!r.plan) return '';
  const v=r.planReview || pmPlanReview(r);
  if(!v||!v.tot.n) return '';
  const t=v.tot, f=x=>`${x>=0?'+':'−'}${Math.abs(x).toFixed(2)}`, cls=x=>x<0?'neg':'';
  const yd=x=>ydNum(Math.abs(x));
  const offTxt=o=>{
    const parts=[];
    parts.push(Math.abs(o.lat)<2?'on line':`${yd(o.lat)} ${o.lat>0?'right':'left'}`);
    parts.push(Math.abs(o.along)<2?'right length':`${yd(o.along)} ${o.along>0?'long':'short'}`);
    return parts.join(', ');
  };
  const rows=v.rows.filter(w=>w.score!=null).map(w=>{
    const plan=w.plan.length?w.plan.map(s=>`<b>${escapeHtml(s.club)}</b> ${ydNum(s.yd)}`).join(' → '):'<i>score only</i>';
    const found=w.found?`${PM_LIE_NAME[w.found.lie]||w.found.lie} ${w.found.lie==='green'?ftNum(w.found.yd*3)+' '+ftUnit():ydNum(w.found.yd)}${w.leaveYd!=null&&w.found.lie!=='green'?` <i>(plan: ${ydNum(w.leaveYd)} to go)</i>`:''}`:'';
    const hitTxt = w.hitClub ? `Hit <b>${escapeHtml(w.hitClub)}</b>${w.followed?' (planned)':` \u2014 plan ${escapeHtml(w.planClub)}`}${w.hitCx?` \u00b7 ${escapeHtml(w.hitCx)}`:''}` : '';
    const line2=[hitTxt, found?`Finished: ${found}`:'', w.off?offTxt(w.off)+' of the plan spot':''].filter(Boolean).join(' \u00b7 ');
    return `<div class="pm-pr-row">
        <div class="pm-pr-l1"><span class="pm-pr-h">${w.num}</span><span class="pm-pr-plan">${plan}</span>
          <span class="pm-pr-sc">${w.exp!=null?w.exp.toFixed(2):'—'} → <b>${w.score!=null?w.score:'—'}</b></span>
          <b class="pm-pr-vs ${w.vs!=null?cls(w.vs):''}">${w.vs!=null?f(w.vs):''}</b></div>
        ${line2||w.tee!=null?`<div class="pm-pr-l2">${line2}${w.tee!=null?`<span>tee <b class="${cls(w.tee)}">${f(w.tee)}</b> · after <b class="${cls(w.after)}">${f(w.after)}</b></span>`:''}</div>`:''}
      </div>`;
  }).join('');
  const P=v.pattern;
  const pat = P ? `<p class="pm-pr-pat">Over <b>${P.n}</b> tee shot${P.n===1?'':'s'} placed on the map or by GPS, the ball finished on average
      <b>${Math.abs(P.lat)<1?'on the planned line':`${yd(P.lat)} ${ydUnit()} ${P.lat>0?'right':'left'}`}</b> and
      <b>${Math.abs(P.along)<1?'at the planned length':`${yd(P.along)} ${P.along>0?'long':'short'}`}</b> of the planned spot${P.n>=3&&P.sdLat!=null?`, spread ±${ydNum(P.sdLat)} side to side and ±${ydNum(P.sdAlong)} in length`:''}.</p>`
    : `<p class="pm-pr-pat">Place shot 2 on the map (or mark it by GPS) and this also measures where each tee shot finished against the planned spot.</p>`;
  return `<div class="profile-card pm-pr-card">
      <h3>Plan vs played — ${escapeHtml(r.courseName||'last round')}</h3>
      <div class="pm-pr-when">Plan made ${pmWhen(v.madeAt)}, frozen at the start of the round (${pmWhen(v.frozenAt)})</div>
      <div class="pm-pr-top">
        <div><span>Plan</span><b>${t.plan.toFixed(1)}</b><i>${t.n} hole${t.n===1?'':'s'}</i></div>
        <div><span>Played</span><b>${t.played}</b><i>&nbsp;</i></div>
        <div><span>vs plan</span><b class="${cls(t.plan-t.played)}">${f(t.plan-t.played)}</b><i>+ is better</i></div>
      </div>
      ${t.nSplit?`<div class="pm-pr-split">
        <div><span>Tee shots vs plan</span><b class="${cls(t.tee)}">${f(t.tee)}</b></div>
        <div><span>After the tee</span><b class="${cls(t.after)}">${f(t.after)}</b></div>
        <i>${t.nSplit===t.n?`all ${t.n} holes`:`${t.nSplit} of ${t.n} holes — the rest have no second shot logged`}</i></div>`:''}
      ${pat}
      ${t.fol&&t.fol.n?`<p class="pm-pr-pat">Hit the planned club on <b>${t.fol.yes} of ${t.fol.n}</b> tee shot${t.fol.n===1?'':'s'} with a club recorded${
        (t.fol.nYes||t.fol.nNo)?`: tee shots vs plan averaged ${t.fol.nYes?`<b class="${cls(t.fol.teeYes)}">${f(t.fol.teeYes/t.fol.nYes)}</b> when you did`:''}${t.fol.nYes&&t.fol.nNo?' and ':''}${t.fol.nNo?`<b class="${cls(t.fol.teeNo)}">${f(t.fol.teeNo/t.fol.nNo)}</b> when you did not`:''}`:''}.</p>`:''}
      <div class="pm-pr-list">${rows}</div>
      <p class="pm-note">The plan's number is your average for the line you chose. <b>Tee</b> is how the tee shot's finish compares with that average; <b>after</b> is how you played from there against your own expected strokes. They add up to the hole's total. One hole is mostly luck; the round's totals are what to read.</p>
    </div>`;
}

/* ---- STROKES GAINED, after the round ----
   Per shot: SG = E(start) - E(next start) - 1 - penalty, with E(holed) = 0, priced on the
   app-wide benchmark (Settings). Summed by category the way the Tour reports it: off the tee
   (tee shots on par 4s and 5s), approach, around the green (within PM_ARG_YD), putting.
   A hole counts only when every shot on it has a distance; the rest are reported, not guessed. */
function pmShotE(sh, hcp){
  if(sh.yd==null) return null;
  return srForPlayer(sh.lie, sh.lie==='green' ? Math.max(0.5, sh.yd*3) : Math.max(1, sh.yd), hcp);
}
function pmRoundSG(r){
  const c=(STATE.courses||[]).find(x=>(x.id||x.name)===r.courseKey);
  const hs=(c&&c.holes)||[];
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  const cat={ott:0, app:0, arg:0, putt:0}, n={ott:0, app:0, arg:0, putt:0};
  let holes=0, incomplete=0, total=0, shots=0;
  hs.forEach((h,i)=>{
    const e=(r.holes||{})[pmHoleNum(h,i)]; const S=e&&e.shots;
    if(!S||!S.length) return;
    if(S.some(x=>x.yd==null||!x.lie)){ incomplete++; return; }
    holes++;
    S.forEach((sh,k)=>{
      const a=pmShotE(sh, bench.hcp), nx=S[k+1], b=nx?pmShotE(nx, bench.hcp):0;
      if(a==null||b==null) return;
      const sg=a-b-1-(sh.pen?1:0);
      const k2 = sh.lie==='green' ? 'putt' : (sh.lie==='tee' && (h.par||4)>=4) ? 'ott' : sh.yd<=PM_ARG_YD ? 'arg' : 'app';
      cat[k2]+=sg; n[k2]++; total+=sg; shots++;
      sh.sg=Math.round(sg*1000)/1000; sh.cat=k2;
    });
  });
  return {bench:bench.short, total, cat, n, holes, incomplete, shots};
}
/* Post-Round: the strokes gained from the round just saved, measured shot by shot. */
function pmSgCardHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; const r=R[R.length-1];
  if(!r) return '';
  /* Read LIVE, on the benchmark set now (Settings), by the same arithmetic as All rounds and the
     Score page. r.sg is what Finish measured on that day's benchmark; it stays on the round as a
     record, and is quoted here when the benchmark has changed since, so the two never disagree
     silently. */
  let g=null; try{ g=pmRoundSG(r); }catch(_){ g=r.sg; }
  if(!g||!g.holes) return '';
  const f=x=>`${x>=0?'+':''}${x.toFixed(2)}`;
  const then = (r.sg && r.sg.holes && r.sg.bench!==g.bench) ? r.sg : null;
  const cell=(k,l)=>`<div class="pm-sg-cell"><span>${l}</span><b class="${g.cat[k]<0?'neg':''}">${g.n[k]?f(g.cat[k]):'\u2014'}</b><i>${g.n[k]} shot${g.n[k]===1?'':'s'}</i></div>`;
  return `<div class="profile-card pm-sg-card">
      <h3>Strokes Gained \u2014 ${escapeHtml(r.courseName||'last round')} <span style="font-weight:400">vs ${escapeHtml(g.bench)}</span></h3>
      <div class="pm-sg-total"><b class="${g.total<0?'neg':''}">${f(g.total)}</b> <span>from ${g.shots} shots on ${g.holes} hole${g.holes===1?'':'s'}</span></div>
      <div class="pm-sg-grid">${cell('ott','Off the tee')}${cell('app','Approach')}${cell('arg','Around the green')}${cell('putt','Putting')}</div>
      ${g.incomplete?`<p class="gen-note">${g.incomplete} hole${g.incomplete===1?' has':'s have'} a shot with no distance, so ${g.incomplete===1?'it is':'they are'} left out rather than guessed.</p>`:''}
      ${then?`<p class="gen-note">Measured against ${escapeHtml(g.bench)}, the benchmark set now. When the round was saved it read ${f(then.total)} against ${escapeHtml(then.bench)}.</p>`:''}
    </div>`;
}

Object.assign(window, {
  pmShotValues, PM_CX_KINDS, pmCustomShotsHTML, PM_FW_VER, pmFourWayJobs, pmFourWayOne, pmFourWayRun,
  pmFourWayHTML, pmPlayerE, pmPlanReview, pmPlanReviewHTML, pmShotE, pmRoundSG, pmSgCardHTML });
