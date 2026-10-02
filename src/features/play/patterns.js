// PLAY: what the round measured about the bag — on-course distances, dispersion (two sources, one model), the lean.
// Split from play.js; shares its globals through window (see play/core.js).

/* ---- ON-COURSE DISTANCES: what each club actually went, applied to the bag after the round ----
   A shot's distance is start to where the NEXT shot was played from, so both ends need a
   position: placed on the map or marked by GPS. Typed distances-to-the-hole are not used. A
   dogleg or a miss makes "yards to the hole before minus after" a different number from how
   far the ball went.
   Only STOCK shots count toward a club's number, the same thing the bag's number means:
     a club recorded, not the putter, not on the green
     from the tee or the fairway (rough, sand and trees cost distance)
     a full swing with nothing changed (no shape, height, part swing or grip down; a note is fine)
     no penalty after it (the ball's finish is not known) and not finishing in the trees
   Everything else is counted and the reason is given, so the number is never quietly thin.
   The bag number is a total (carry plus roll), and so is this. It is the MEDIAN over every
   round on record, because one thin or one downhill shot should not move a club. It only
   becomes a bag number when you apply it, never during a round. Each change is logged with
   what it replaced, so it can be undone. On-course totals include today's roll, slope and
   wind; that is why it takes PM_DIST_MIN_N shots before Apply is offered. */
const PM_DIST_MIN_N = 5;          /* stock shots before a club's on-course number can be applied */
const PM_DIST_MATCH_YD = 2;       /* closer than this and the bag already agrees */
function pmDistShots(){
  const out={}, skip={};
  const R=(STATE.play&&STATE.play.rounds)||[];
  const bump=(id,why)=>{ (skip[id]=skip[id]||{})[why]=((skip[id]||{})[why]||0)+1; };
  R.forEach((r,ri)=>{
    const c=(STATE.courses||[]).find(x=>(x.id||x.name)===r.courseKey); if(!c) return;
    (c.holes||[]).forEach((h,i)=>{
      const e=(r.holes||{})[pmHoleNum(h,i)], S=(e&&e.shots)||[], ypu=cfYardsPerUnit(h);
      S.forEach((sh,k)=>{
        const club=sh.club&&pmBagClub(sh.club);
        if(!club || club.type==='putter' || sh.lie==='green') return;
        const id=club.id, nx=S[k+1];
        if(!nx) return bump(id,'last shot on the hole');
        if(sh.pen) return bump(id,'penalty after it');
        if(sh.lie!=='tee' && sh.lie!=='fairway') return bump(id,'from rough, sand or trees');
        const cx=sh.cx||{};
        if(cx.shape||cx.height||cx.swing||cx.grip) return bump(id,'not a stock swing');
        if(nx.lie==='recovery') return bump(id,'finished in the trees');
        const a=pmShotPt(h,sh), b=pmShotPt(h,nx);
        if(!a||!b||!ypu) return bump(id,'no map or GPS position');
        const yd=Math.hypot(b.x-a.x, b.y-a.y)*ypu;
        /* left/right of the target line, where the target is known (+ is right) */
        const t=pmShotTarget(r, h, pmHoleNum(h,i), sh, a, club);
        let lat=null, al=null;
        if(t){ const L=Math.hypot(t.pt.x-a.x, t.pt.y-a.y)||1, ux=(t.pt.x-a.x)/L, uy=(t.pt.y-a.y)/L;
               lat=(ux*(b.y-a.y)-uy*(b.x-a.x))*ypu;
               al=((b.x-a.x)*ux+(b.y-a.y)*uy-L)*ypu; }      /* + is long of the target */
        const mv=pmPtErrYd(sh)**2+pmPtErrYd(nx)**2;
        (out[id]=out[id]||[]).push({ yd, lat, al, tsrc:t?t.src:null, mv, ri, last:ri===R.length-1, hole:pmHoleNum(h,i), lie:sh.lie, end:nx.lie,
                                     prov:(sh.src==='gps'&&nx.src==='gps')?'captured':'input', at:r.endedAt||r.startedAt });
      });
    });
  });
  return {shots:out, skip};
}
function pmMedian(a){ const s=a.slice().sort((x,y)=>x-y), n=s.length; return n ? (n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2) : null; }
function pmQuart(a, q){ const s=a.slice().sort((x,y)=>x-y); if(!s.length) return null; const p=(s.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p); return s[lo]+(s[hi]-s[lo])*(p-lo); }
function pmDistClub(id, list){
  const p=STATE.performance[id]||{}, yds=list.map(x=>x.yd);
  const med=pmMedian(yds);
  return { id, n:list.length, med, lo:pmQuart(yds,0.25), hi:pmQuart(yds,0.75),
           bagTotal:p.total!=null?p.total:p.carry, bagCarry:p.carry,
           prov:(typeof sgProvOf==='function')?sgProvOf(...list.map(x=>x.prov)):'input',
           today:list.filter(x=>x.last).map(x=>x.yd) };
}
function pmDistLog(){ const P=pmState(); return (P.bagLog=P.bagLog||[]); }
function pmDistApply(id){
  const d=pmDistShots(), list=d.shots[id]||[]; if(list.length<PM_DIST_MIN_N) return;
  const s=pmDistClub(id, list), club=pmBagClub(id), p=STATE.performance[id]=STATE.performance[id]||{};
  const total=Math.round(s.med), oldT=p.total!=null?p.total:p.carry;
  /* the bag keeps carry and total; the course measures where the ball stopped. Carry is moved
     by the same ratio, which keeps the club's roll share as it was. */
  const r=oldT?total/oldT:1, carry=p.carry!=null?Math.round(p.carry*r):null;
  if(!confirm(`Set ${club?club.label:id} to ${ydNum(total)} ${ydUnit()} total (was ${ydNum(oldT)})`+
              `${carry!=null?` and ${ydNum(carry)} carry (was ${ydNum(p.carry)})`:''}?\n\n`+
              `The median of ${s.n} stock shots on the course. You can undo it here.`)) return;
  const pr=STATE.partials&&STATE.partials[id];
  pmDistLog().push({ id, label:club?club.label:id, at:Date.now(), n:s.n,
                     before:{carry:p.carry, total:p.total, prov:p.prov, partials:pr?Object.assign({},pr):null},
                     after:{carry, total} });
  if(carry!=null) p.carry=carry;
  p.total=total; p.prov=s.prov;
  if(typeof syncPartialsForClub==='function') syncPartialsForClub(id);
  saveState(); if(typeof refreshAll==='function') refreshAll();
  if(typeof buildPostRound==='function') buildPostRound();
  toast(`${club?club.label:id}: ${ydNum(total)} ${ydUnit()} total, from the course`);
}
function pmDistUndo(k){
  const L=pmDistLog(), x=L[k]; if(!x||x.undone) return;
  const p=STATE.performance[x.id]; if(!p) return;
  if((p.total!==x.after.total || p.carry!==x.after.carry) &&
     !confirm(`${x.label} has changed since this was applied. Put back ${ydNum(x.before.total)} total anyway?`)) return;
  p.carry=x.before.carry; p.total=x.before.total; if(x.before.prov) p.prov=x.before.prov; else delete p.prov;
  if(x.before.partials && STATE.partials) STATE.partials[x.id]=Object.assign({}, x.before.partials);
  x.undone=Date.now();
  saveState(); if(typeof refreshAll==='function') refreshAll();
  if(typeof buildPostRound==='function') buildPostRound();
  toast(`${x.label} back to ${ydNum(x.before.total)} ${ydUnit()}`);
}
function pmDistCardHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; if(!R.length) return '';
  const d=pmDistShots();
  const ids=(STATE.clubs||[]).map(c=>c.id).filter(id=>d.shots[id]||d.skip[id]);
  const L=pmDistLog().map((x,k)=>Object.assign({k},x)).filter(x=>!x.undone).slice(-6).reverse();
  if(!ids.length && !L.length) return '';
  const sg=v=>{ const a=ydNum(Math.abs(v)); return +a===0 ? '0' : `${v>=0?'+':'−'}${a}`; };
  const rows=ids.map(id=>{
    const club=pmBagClub(id), list=d.shots[id]||[], sk=d.skip[id]||{};
    const skipTxt=Object.entries(sk).map(([w,n])=>`${n} ${w}`).join(' · ');
    if(!list.length) return `<div class="pm-dc-row"><div class="pm-dc-l1"><b>${escapeHtml(club.label)}</b><span>no stock shot measured</span></div>
        ${skipTxt?`<div class="pm-dc-skip">Left out: ${escapeHtml(skipTxt)}</div>`:''}</div>`;
    const s=pmDistClub(id, list), diff=s.bagTotal!=null?s.med-s.bagTotal:null;
    const ready=s.n>=PM_DIST_MIN_N, agrees=diff!=null&&Math.abs(diff)<PM_DIST_MATCH_YD;
    const act = !ready ? `<span class="pm-dc-need">${PM_DIST_MIN_N-s.n} more stock shot${PM_DIST_MIN_N-s.n===1?'':'s'} before this can set your bag</span>`
              : agrees ? `<span class="pm-dc-ok">Your bag already agrees</span>`
              : `<button type="button" class="btn pm-dc-apply" onclick="pmDistApply('${escapeHtml(id)}')">Use ${ydNum(Math.round(s.med))} in my bag</button>`;
    return `<div class="pm-dc-row">
        <div class="pm-dc-l1"><b>${escapeHtml(club.label)}</b>
          <span>course <b>${ydNum(s.med)}</b> <i>median of ${s.n}${s.n>=4?`, middle half ${ydNum(s.lo)}–${ydNum(s.hi)}`:''}</i></span>
          <span class="pm-dc-bag">bag ${s.bagTotal!=null?ydNum(s.bagTotal):'—'}</span>
          <b class="pm-dc-d ${diff!=null&&diff<0?'neg':''}">${diff!=null?sg(diff):''}</b></div>
        <div class="pm-dc-l2">${s.today.length?`This round: ${s.today.map(v=>ydNum(v)).join(', ')}`:'None this round'} ${typeof sgProv==='function'?sgProv(s.prov):''}</div>
        ${skipTxt?`<div class="pm-dc-skip">Left out: ${escapeHtml(skipTxt)}</div>`:''}
        <div class="pm-dc-act">${act}</div>
      </div>`;
  }).join('');
  const log = L.length ? `<div class="pm-dc-log"><div class="pm-dc-log-h">Applied from the course</div>
      ${L.map(x=>`<div class="pm-dc-log-r"><span><b>${escapeHtml(x.label)}</b> ${ydNum(x.before.total)} → ${ydNum(x.after.total)} ${ydUnit()} <i>${pmWhen(x.at)}, ${x.n} shots</i></span>
        <button type="button" class="pm-dc-undo" onclick="pmDistUndo(${x.k})">Undo</button></div>`).join('')}</div>` : '';
  return `<div class="profile-card pm-dc-card">
      <h3>On-course distances</h3>
      <div class="pm-pr-when">From every round on record</div>
      <p class="pm-note">Total yards per club, start to where the next shot was played. Counts stock shots only: full swings from the tee or fairway, positioned on the map or by GPS. Includes the day's roll, slope and wind, so a club needs ${PM_DIST_MIN_N} before it can change your bag.</p>
      ${rows||''}
      ${log}
    </div>`;
}

/* ---- ON-COURSE DISPERSION: how wide and how long each club's pattern really is ----
   The same stock shots as the distances above. Two axes, measured differently:
     LEFT/RIGHT needs to know what you were aiming at, or aim choice gets counted as
       spread. So a shot is measured only where the target is known:
         the frozen plan's aim, when you were at the planned spot with the planned club
         the middle of the green, on a full approach (the green within the club's reach)
       Otherwise it is counted as "target not known" and left out of the width.
     LONG/SHORT is the miss along the same line, against the target's distance. Not the spread
       of total distance: the plan aims one club at different lengths on different holes, and
       that is target choice, not distance control.
   Each position carries its own error: GPS as the phone reports it (a 95% radius, so the
   per-axis 1 sigma is radius/2.45), a map placement PM_MAP_ERR_YD. That variance is taken
   OUT of the measured spread, or a careless thumb would read as a wide swing.
   THE MODEL: one curve by carry (getDispersion, getDepthDispersion), calibrated to a typical
   +3. The on-course pattern is compared shot by shot, each miss divided by the model's 1 sigma
   at that club's carry, and pooled over every club. That ratio is the one number that can
   recalibrate the model to you (STATE.dispCal), applied after the round with an undo. */
const PM_MAP_ERR_YD = 2;          /* 1 sigma of a thumb-placed position, per axis */
const PM_DISP_MIN_DOF = 15;       /* pooled degrees of freedom before a factor can be applied */
function pmPtErrYd(sh){ return (sh && sh.src==='gps' && sh.ll && sh.ll.acc) ? sh.ll.acc*1.0936/2.45 : PM_MAP_ERR_YD; }
/* What this shot was aimed at, if we know. */
function pmShotTarget(r, h, num, sh, a, club){
  if(sh.tgt) return {pt:sh.tgt, src:'aimed'};
  const ypu=cfYardsPerUnit(h)||1;
  const p=r.plan&&r.plan.holes&&r.plan.holes[num];
  if(p && p.shots){
    for(const q of p.shots){
      if(Math.hypot(q.from.x-a.x, q.from.y-a.y)*ypu<=PM_PLAN_NEAR_YD && (!q.clubId || q.clubId===club.id))
        return {pt:q.aim, src:'plan'};
    }
  }
  const mid=cfGreenMid(h), T=(STATE.performance[club.id]||{}).total;
  if(mid && T){
    const d=Math.hypot(mid.x-a.x, mid.y-a.y)*ypu;
    if(d>=T*0.8 && d<=T*1.1+10) return {pt:mid, src:'green'};
  }
  return null;
}
function pmDispClub(id, list){
  const carry=(STATE.performance[id]||{}).carry||(STATE.performance[id]||{}).total;
  const L=list.filter(x=>x.lat!=null), n=L.length;
  const out={id, carry, n, nAll:list.length};
  if(n){
    const mu=L.reduce((s,x)=>s+x.lat,0)/n; out.bias=mu;
    if(n>=2){
      const v=L.reduce((s,x)=>s+(x.lat-mu)**2,0)/(n-1) - L.reduce((s,x)=>s+x.mv,0)/n;
      out.sdLat=Math.sqrt(Math.max(0,v));
    }
  }
  if(n){ out.biasDep=L.reduce((s,x)=>s+x.al,0)/n; }
  if(n>=2){
    const m=out.biasDep;
    const v=L.reduce((s,x)=>s+(x.al-m)**2,0)/(n-1) - L.reduce((s,x)=>s+x.mv,0)/n;
    out.sdDep=Math.sqrt(Math.max(0,v));
  }
  out.modelLat=carry?getDispersion(carry)/1.645:null;
  out.modelDep=carry?getDepthDispersion(carry)/1.645:null;
  return out;
}
/* The pooled ratio: every club's misses in units of the model's sigma at that club's carry.
   Each club's own mean is taken out first (an aim bias is not a width), which costs one
   degree of freedom per club. */
function pmDispPool(d){
  const acc={lat:{ss:0,dof:0,bias:0,nb:0}, dep:{ss:0,dof:0}};
  Object.entries(d.shots).forEach(([id,list])=>{
    const c=pmDispClub(id,list); if(!c.carry) return;
    const L=list.filter(x=>x.lat!=null);
    if(L.length>=2 && c.modelLat){
      const mu=c.bias; L.forEach(x=>{ acc.lat.ss+=((x.lat-mu)**2 - x.mv)/(c.modelLat**2); });
      acc.lat.dof+=L.length-1;
    }
    L.forEach(x=>{ acc.lat.bias+=x.lat; acc.lat.nb++; });
    if(L.length>=2 && c.modelDep){
      const m=c.biasDep; L.forEach(x=>{ acc.dep.ss+=((x.al-m)**2 - x.mv)/(c.modelDep**2); });
      acc.dep.dof+=L.length-1;
    }
  });
  const k=a=>a.dof ? Math.sqrt(Math.max(0, a.ss/a.dof)) : null;
  const kl=k(acc.lat), kd=k(acc.dep);
  return { lat:kl, latSE:kl!=null&&acc.lat.dof?kl/Math.sqrt(2*acc.lat.dof):null, latDof:acc.lat.dof,
           dep:kd, depSE:kd!=null&&acc.dep.dof?kd/Math.sqrt(2*acc.dep.dof):null, depDof:acc.dep.dof,
           bias:acc.lat.nb?acc.lat.bias/acc.lat.nb:null, nBias:acc.lat.nb };
}
function pmDispCal(){ return STATE.dispCal || {lat:1, dep:1}; }
/* d / src: the shots to fit from and where they came from. The course by default; Sim Golf
   passes a TrackMan session in the same shape. */
/* ---- TWO SOURCES, ONE MODEL ----
   The course and TrackMan each measure the pattern, and each is kept as its own factor against
   the base +3 curve (STATE.dispCalSources), with the degrees of freedom it rests on. The model
   uses them combined, as variances should be: weighted by degrees of freedom,
       k^2 = sum(dof_i * k_i^2) / sum(dof_i)
   so more shots carry more say. Or one source alone (STATE.dispCalMode): range shots off a mat
   are the best case, and once the course has enough rounds a golfer may want the course only.
   A pool's ratios are against the model as it stood (which already includes the last fit), so
   a source's factor against the base curve is the current factor times the measured ratio. */
const PM_DISP_SRC = { 'on-course':'course', 'TrackMan':'trackman' };
const PM_DISP_SRC_LBL = { course:'On the course', trackman:'TrackMan' };
const PM_DISP_MODES = [['combine','Both, weighted by shots'],['course','The course only'],['trackman','TrackMan only']];
function pmDispSources(){ return STATE.dispCalSources || {}; }
function pmDispMode(){ return STATE.dispCalMode || 'combine'; }
function pmDispCombine(S, mode){
  const use = mode==='course' ? ['course'] : mode==='trackman' ? ['trackman'] : ['course','trackman'];
  const axis=(k,dk)=>{ let num=0, den=0; use.forEach(s=>{ const x=S[s]; if(x && x[k]>0 && x[dk]>0){ num+=x[dk]*x[k]*x[k]; den+=x[dk]; } }); return den ? Math.sqrt(num/den) : 1; };
  return { lat:Math.round(axis('lat','latDof')*1000)/1000, dep:Math.round(axis('dep','depDof')*1000)/1000 };
}
/* what fitting this data would store for its source, and whether that differs from what is there */
function pmDispProposal(d, key){
  const P=pmDispPool(d), cur=pmDispCal(), old=pmDispSources()[key]||{};
  const okL = P.latDof>=PM_DISP_MIN_DOF && P.lat, okD = P.depDof>=PM_DISP_MIN_DOF && P.dep;
  const prop = { lat: okL ? cur.lat*P.lat : old.lat, latDof: okL ? P.latDof : old.latDof,
                 dep: okD ? cur.dep*P.dep : old.dep, depDof: okD ? P.depDof : old.depDof };
  const ch=(a,b)=>a!=null && (b==null || Math.abs(a-b)>0.03);
  prop.changed = !!((okL && ch(prop.lat, old.lat)) || (okD && ch(prop.dep, old.dep)));
  return prop;
}
function pmDispApply(dd, src){
  const d=dd||pmDistShots(), from=src||'on-course', key=PM_DISP_SRC[from]||'course';
  const prop=pmDispProposal(d, key); if(!prop.changed) return;
  const r3=x=>x==null?x:Math.round(x*1000)/1000;
  const S=Object.assign({}, pmDispSources());
  S[key]={ lat:r3(prop.lat), latDof:prop.latDof||0, dep:r3(prop.dep), depDof:prop.depDof||0, at:Date.now() };
  const cur=pmDispCal(), next=pmDispCombine(S, pmDispMode());
  const pc=x=>x==null?'\u2014':`${Math.round(x*100)}%`;
  const other=S[key==='course'?'trackman':'course'];
  if(!confirm(`Use your ${from} pattern in the dispersion model?\n\n`+
              `${PM_DISP_SRC_LBL[key]}: width ${pc(S[key].lat)}, length ${pc(S[key].dep)} of the +3 model.\n`+
              (other?`${PM_DISP_SRC_LBL[key==='course'?'trackman':'course']}: width ${pc(other.lat)}, length ${pc(other.dep)}.\n`:'')+
              `\nThe model (${(PM_DISP_MODES.find(m=>m[0]===pmDispMode())||[])[1]||''}): width ${pc(cur.lat)} \u2192 ${pc(next.lat)}, length ${pc(cur.dep)} \u2192 ${pc(next.dep)}.\n\n`+
              `Every pattern in the app follows: Stock Shots, Approach, the strategy engine. You can undo it.`)) return;
  const P2=pmState();
  (P2.dispLog=P2.dispLog||[]).push({ at:Date.now(), src:from, before:Object.assign({},cur), after:next,
                                     beforeSources:JSON.parse(JSON.stringify(pmDispSources())), afterSources:JSON.parse(JSON.stringify(S)),
                                     dofLat:prop.latDof, dofDep:prop.depDof });
  STATE.dispCalSources=S;
  STATE.dispCal=Object.assign({}, next, {at:Date.now()});
  pmDispChanged(`Dispersion model now uses your ${from} pattern`);
}
function pmDispSetMode(m){
  if(!PM_DISP_MODES.some(x=>x[0]===m)) return;
  const cur=pmDispCal(), prevMode=STATE.dispCalMode||null; STATE.dispCalMode=m;
  const S=pmDispSources();
  if(Object.keys(S).length){
    const next=pmDispCombine(S, m);
    const P2=pmState(); (P2.dispLog=P2.dispLog||[]).push({ at:Date.now(), src:'mode', mode:m, beforeMode:prevMode, before:Object.assign({},cur), after:next,
      beforeSources:JSON.parse(JSON.stringify(S)), afterSources:JSON.parse(JSON.stringify(S)) });
    STATE.dispCal=Object.assign({}, next, {at:Date.now()});
  }
  pmDispChanged('Dispersion model: '+((PM_DISP_MODES.find(x=>x[0]===m)||[])[1]||m).toLowerCase());
}
/* the panel both cards show: each source, and what the model uses */
function pmDispSourcesHTML(){
  const S=pmDispSources(), keys=Object.keys(S).filter(k=>S[k]);
  if(!keys.length) return '';
  const cal=pmDispCal(), pc=x=>x==null?'\u2014':`${Math.round(x*100)}%`;
  const row=k=>{ const x=S[k]; return `<div class="pm-ds-row"><b>${PM_DISP_SRC_LBL[k]||k}</b><span>width ${pc(x.lat)}<i>${x.latDof||0} dof</i></span><span>length ${pc(x.dep)}<i>${x.depDof||0} dof</i></span><em>${new Date(x.at).toLocaleDateString([], {month:'short', day:'numeric'})}</em></div>`; };
  return `<div class="pm-ds">
      <div class="pm-ds-h"><span>The model now</span><b>width ${pc(cal.lat)} \u00b7 length ${pc(cal.dep)}</b><i>of the +3 curve</i></div>
      ${['course','trackman'].filter(k=>S[k]).map(row).join('')}
      <label class="pm-ds-mode">Use<select onchange="pmDispSetMode(this.value)">${PM_DISP_MODES.map(([v,l])=>`<option value="${v}"${pmDispMode()===v?' selected':''}>${l}</option>`).join('')}</select></label>
      <p class="pm-note">Combined as variances, so each source counts in proportion to its degrees of freedom. TrackMan shots are off a mat, the best case; choose the course only once it has enough rounds behind it.</p>
    </div>`;
}
function pmDispUndo(k){
  const L=pmState().dispLog||[], x=L[k]; if(!x||x.undone) return;
  if(x.kind==='rho'){
    const set=((STATE.dispersion=STATE.dispersion||{}).strikeCorr=(STATE.dispersion.strikeCorr||{}));
    if(x.before==null) delete set[x.type]; else set[x.type]=x.before;
    x.undone=Date.now();
    pmDispChanged(`${x.label}: lean put back`);
    if(typeof renderStrikeCal==='function') renderStrikeCal();
    return;
  }
  if(x.before.lat===1 && x.before.dep===1) delete STATE.dispCal; else STATE.dispCal=Object.assign({}, x.before);
  if(x.src==='mode'){ if(x.beforeMode) STATE.dispCalMode=x.beforeMode; else delete STATE.dispCalMode; }
  if(x.beforeSources!==undefined){ if(Object.keys(x.beforeSources||{}).length) STATE.dispCalSources=x.beforeSources; else delete STATE.dispCalSources; }
  x.undone=Date.now();
  pmDispChanged('Dispersion model put back');
}
function pmDispChanged(msg){
  if(typeof aimShapeReset==='function') aimShapeReset();
  saveState(); if(typeof refreshAll==='function') refreshAll();
  if(typeof buildPostRound==='function') buildPostRound();
  if(typeof buildSim==='function') buildSim();
  toast(msg);
}
function pmDispCardHTML(){
  const R=(STATE.play&&STATE.play.rounds)||[]; if(!R.length) return '';
  const d=pmDistShots(), cal=pmDispCal();
  const ids=(STATE.clubs||[]).map(c=>c.id).filter(id=>(d.shots[id]||[]).length);
  const Lg=(pmState().dispLog||[]).map((x,k)=>Object.assign({k},x)).filter(x=>!x.undone).slice(-4).reverse();
  if(!ids.length && !Lg.length) return '';
  const b86=s=>s==null?'—':ydNum(s*1.48);        /* the app's "86% L/R" band, 1.48 sigma */
  const side=v=>Math.abs(v)<1?'on line':`${ydNum(Math.abs(v))} ${v>0?'R':'L'}`;
  const ratio=(a,b)=>(a!=null&&b)?a/b:null;
  const tone=x=>x==null?'':x>1.15?'wide':x<0.87?'tight':'';
  const rows=ids.map(id=>{
    const club=pmBagClub(id), c=pmDispClub(id, d.shots[id]);
    const rl=ratio(c.sdLat,c.modelLat), rd=ratio(c.sdDep,c.modelDep);
    const nT=(d.shots[id]||[]).length-c.n;
    return `<div class="pm-dp-row">
        <b class="pm-dp-c">${escapeHtml(club.label)}</b>
        <div class="pm-dp-ax"><span>L/R</span><b class="${tone(rl)}">${c.sdLat!=null?b86(c.sdLat):'—'}</b><i>model ${b86(c.modelLat)}</i>
          <em>${c.n} shot${c.n===1?'':'s'}${c.bias!=null&&c.n>=2?` · ${side(c.bias)}`:''}${nT?` · ${nT} target unknown`:''}</em></div>
        <div class="pm-dp-ax"><span>Long/short</span><b class="${tone(rd)}">${c.sdDep!=null?b86(c.sdDep):'—'}</b><i>model ${b86(c.modelDep)}</i>
          <em>${c.n} shot${c.n===1?'':'s'}${c.biasDep!=null&&c.n>=2?` · ${Math.abs(c.biasDep)<1?'on length':`${ydNum(Math.abs(c.biasDep))} ${c.biasDep>0?'long':'short'}`}`:''}</em></div>
      </div>`;
  }).join('');
  const P=pmDispPool(d), pc=x=>`${Math.round(x*100)}%`;
  const ax=(k,se,dof,lbl)=>k==null ? `<div><span>${lbl}</span><b>—</b><i>needs 2+ shots with a club</i></div>`
    : `<div><span>${lbl}</span><b class="${tone(k)}">${(k*cal[lbl==='Width'?'lat':'dep']).toFixed(2)}×</b><i>±${(se*cal[lbl==='Width'?'lat':'dep']).toFixed(2)} · ${dof} dof${dof<PM_DISP_MIN_DOF?` · ${PM_DISP_MIN_DOF-dof} more to apply`:''}</i></div>`;
  const canApply=pmDispProposal(d, 'course').changed;
  const calNote=(cal.lat!==1||cal.dep!==1)?`The model is already fitted to ${pc(cal.lat)} width and ${pc(cal.dep)} length; the ratios above are against the +3 curve.`:'Ratios are against the +3 model the app uses.';
  return `<div class="profile-card pm-dp-card">
      <h3>On-course dispersion</h3>
      <div class="pm-pr-when">From every round on record · 86% bands, like Stock Shots</div>
      <div class="pm-dp-pool">${ax(P.lat,P.latSE,P.latDof,'Width')}${ax(P.dep,P.depSE,P.depDof,'Length')}
        ${P.bias!=null&&P.nBias>=3?`<div><span>Aim bias</span><b>${side(P.bias)}</b><i>average over ${P.nBias} shots</i></div>`:''}</div>
      <p class="pm-note">${calNote} Above 1 your pattern is wider or longer than the model's. Not applied: the aim bias. It is where you miss, not how widely.</p>
      ${pmDispSourcesHTML()}
      ${canApply?`<button type="button" class="btn pm-dc-apply" onclick="pmDispApply(null)">Fit the model to this</button>`:''}
      <div class="pm-dp-list">${rows}</div>
      ${Lg.length?`<div class="pm-dc-log"><div class="pm-dc-log-h">Model fitted from the course</div>
        ${Lg.map(x=>`<div class="pm-dc-log-r"><span>${x.kind==='rho'
            ? `${escapeHtml(x.label)} lean ρ ${x.before!=null?x.before.toFixed(2):'default'} → ${x.after.toFixed(2)}`
            : `Width ${pc(x.before.lat)} → ${pc(x.after.lat)}, length ${pc(x.before.dep)} → ${pc(x.after.dep)}`} <i>${pmWhen(x.at)}</i></span>
          <button type="button" class="pm-dc-undo" onclick="pmDispUndo(${x.k})">Undo</button></div>`).join('')}</div>`:''}
      ${pmLeanHTML(d)}
      <p class="pm-note">Left/right is measured only where the target is known: the aim you recorded, your frozen plan's aim, or the middle of the green on a full approach. Long/short is the miss along the same line against the target's distance, so it includes the day's roll. GPS and map-placement error is taken out of both.</p>
    </div>`;
}

/* ---- THE LEAN: does a long miss go left? ----
   The model's pattern leans because one strike causes both misses (dispersion.js, STRIKE_CORR):
   a toe hit draws and flies, a heel hit fades and drops. Its size is rho, the correlation
   between the depth miss and the lateral miss toward the gear-effect side (left for a
   right-hander, right for a left-hander), set per club type. Presumed until now. Measured here
   from the same target-known shots as the dispersion above:
     each club's own mean miss is removed first (an aim bias is not a lean),
     each miss is put in units of the model's sigma at that club's carry, so a type pools its
       clubs without the driver's yards swamping the hybrid's,
     measurement error (GPS, a thumb on the map) is independent on the two axes, so it
       inflates both variances and leaves their covariance alone, which would pull rho toward
       zero. Its variance is subtracted from each axis before dividing, which undoes that.
   Uncertainty is the Fisher interval (atanh(rho) +- 1.645/sqrt(dof-2)), 90%. The model's floor is
   0, an upright pattern, so a measured negative rho applies as 0. */
const PM_LEAN_MIN_DOF = 20;
const PM_LEAN_TYPES = [['wood','Woods & hybrids'],['hybrid','Hybrids'],['iron','Irons'],['wedge','Wedges']];
function pmLeanSide(){ return ((STATE.profile&&STATE.profile.handedness)||'RH')==='LH' ? 1 : -1; }   /* -1: left is the gear-effect side */
function pmLeanMeasure(d){
  const sgn=pmLeanSide(), by={};
  Object.entries(d.shots).forEach(([id,list])=>{
    const club=pmBagClub(id); if(!club) return;
    const c=pmDispClub(id,list); const L=list.filter(x=>x.lat!=null&&x.al!=null);
    if(L.length<2 || !c.modelLat || !c.modelDep) return;
    const t=by[club.type]=by[club.type]||{sxy:0,sxx:0,syy:0,n:0,dof:0,pts:[],carries:[]};
    const ma=L.reduce((s,x)=>s+x.al,0)/L.length, ml=L.reduce((s,x)=>s+x.lat,0)/L.length;
    L.forEach(x=>{
      const za=(x.al-ma)/c.modelDep, zl=sgn*(x.lat-ml)/c.modelLat;
      t.sxy+=za*zl; t.sxx+=za*za - x.mv/(c.modelDep**2); t.syy+=zl*zl - x.mv/(c.modelLat**2);
      t.pts.push({lat:x.lat-ml, al:x.al-ma});
    });
    t.n+=L.length; t.dof+=L.length-1; t.carries.push(c.carry);
  });
  Object.entries(by).forEach(([type,t])=>{
    t.type=type;
    t.rho = (t.sxx>0&&t.syy>0) ? Math.max(-0.99, Math.min(0.99, t.sxy/Math.sqrt(t.sxx*t.syy))) : null;
    if(t.rho!=null && t.dof>3){
      const z=Math.atanh(t.rho), se=1/Math.sqrt(t.dof-2);
      t.lo=Math.tanh(z-1.645*se); t.hi=Math.tanh(z+1.645*se);
    }
    t.carry=pmMedian(t.carries);
  });
  return by;
}
/* the lean in degrees that a rho gives at a carry, by the model's own formula */
function pmLeanDeg(rho, carry){
  const sl=getDispersion(carry), sd=getDepthDispersion(carry);
  return Math.max(-24, Math.min(24, Math.atan2(rho*sd, sl)*180/Math.PI));
}
/* a small scatter of the misses: right is right, up is long, the measured lean drawn through it */
function pmLeanSVG(t){
  const W=132, H=132, pad=8, m=Math.max(6, ...t.pts.map(p=>Math.max(Math.abs(p.lat),Math.abs(p.al))))*1.1;
  const X=v=>W/2+v/m*(W/2-pad), Y=v=>H/2-v/m*(H/2-pad);
  const sd=getDepthDispersion(t.carry||150)/1.645, sl=getDispersion(t.carry||150)/1.645;
  /* the model's lean is the slope of the long miss on the lateral one, rho*sd/sl, rising toward
     the gear-effect side (left for a right-hander) */
  const lean=(r)=>{ const a=Math.atan2((r||0)*sd, sl), dx=pmLeanSide()*Math.cos(a)*m, dy=Math.sin(a)*m;
    return `${X(dx).toFixed(1)},${Y(dy).toFixed(1)} ${X(-dx).toFixed(1)},${Y(-dy).toFixed(1)}`; };
  return `<svg class="pm-ln-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Misses: right to the right, long upward">
      <line x1="${W/2}" y1="${pad}" x2="${W/2}" y2="${H-pad}" stroke="var(--border2)"/><line x1="${pad}" y1="${H/2}" x2="${W-pad}" y2="${H/2}" stroke="var(--border2)"/>
      <text x="${W/2+3}" y="${pad+8}" font-size="8" fill="var(--muted)" font-family="ui-monospace,monospace">long</text>
      <text x="${pad}" y="${H/2-3}" font-size="8" fill="var(--muted)" font-family="ui-monospace,monospace">L</text>
      <text x="${W-pad-6}" y="${H/2-3}" font-size="8" fill="var(--muted)" font-family="ui-monospace,monospace">R</text>
      <polyline points="${lean(strikeCorr(t.type))}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3,3"/>
      ${t.rho!=null?`<polyline points="${lean(Math.max(0,t.rho))}" fill="none" stroke="#c99a1e" stroke-width="2"/>`:''}
      ${t.pts.map(p=>`<circle cx="${X(p.lat).toFixed(1)}" cy="${Y(p.al).toFixed(1)}" r="2.4" fill="var(--ink2)" fill-opacity=".7"/>`).join('')}
    </svg>`;
}
function pmLeanHTML(d, applyFn, intro){
  const by=pmLeanMeasure(d); const T=PM_LEAN_TYPES.filter(([k])=>by[k]);
  if(!T.length) return '';
  const side=pmLeanSide()<0?'left':'right';
  const rows=T.map(([k,label])=>{
    const t=by[k], cur=strikeCorr(k), C=t.carry||150;
    const ready=t.dof>=PM_LEAN_MIN_DOF && t.rho!=null, applyVal=t.rho!=null?Math.max(0,Math.min(0.9,Math.round(t.rho*100)/100)):null;
    const differs=applyVal!=null && Math.abs(applyVal-cur)>=0.05;
    return `<div class="pm-ln-row">${pmLeanSVG(t)}
        <div class="pm-ln-txt"><b>${label}</b>
          <div>measured <b class="pm-ln-v">ρ ${t.rho!=null?t.rho.toFixed(2):'—'}</b>${t.lo!=null?` <i>90%: ${t.lo.toFixed(2)} to ${t.hi.toFixed(2)}</i>`:''}</div>
          <div>model ρ ${cur.toFixed(2)} <i>leans ${pmLeanDeg(cur,C).toFixed(1)}° at ${ydNum(C)}</i></div>
          ${t.rho!=null?`<div><i>measured leans ${pmLeanDeg(Math.max(0,t.rho),C).toFixed(1)}° · ${t.n} shots, ${t.dof} dof</i></div>`:''}
          ${!ready?`<div class="pm-dc-need">${PM_LEAN_MIN_DOF-t.dof} more before this can set the model</div>`
            : differs?`<button type="button" class="btn pm-dc-apply" onclick="${applyFn||'pmLeanApply'}('${k}', null)">Set lean to ${applyVal.toFixed(2)}</button>`
            : `<div class="pm-dc-ok">The model already agrees</div>`}
        </div></div>`;
  }).join('');
  return `<div class="pm-ln">
      <div class="pm-dc-log-h">Long-and-${side} tendency</div>
      <p class="pm-note">${intro||''}Does a long miss also go ${side}? Each dot is one shot's miss from that club's own average: right to the right, long upward. Gold is the lean measured, dashed is the model's.</p>
      ${rows}
    </div>`;
}
function pmLeanApply(type, dd, src){
  const d=dd||pmDistShots(), t=pmLeanMeasure(d)[type], from=src||'on the course'; if(!t||t.rho==null||t.dof<PM_LEAN_MIN_DOF) return;
  const v=Math.max(0, Math.min(0.9, Math.round(t.rho*100)/100));
  STATE.dispersion=STATE.dispersion||{strikeCorr:{}};
  const set=STATE.dispersion.strikeCorr||(STATE.dispersion.strikeCorr={});
  const before=(typeof set[type]==='number')?set[type]:null;
  const label=(PM_LEAN_TYPES.find(x=>x[0]===type)||[type,type])[1];
  if(!confirm(`Set the ${label.toLowerCase()} lean to ρ ${v.toFixed(2)} (was ${strikeCorr(type).toFixed(2)})?\n\nMeasured from ${t.n} shots ${from}${t.rho<0?`; the measurement is ${t.rho.toFixed(2)}, and the model's floor is 0, an upright pattern`:''}. You can undo it here.`)) return;
  const P=pmState(); (P.dispLog=P.dispLog||[]).push({kind:'rho', src:from, type, label, at:Date.now(), before, after:v, n:t.n});
  set[type]=v;
  pmDispChanged(`${label}: lean measured from the course`);
  if(typeof renderStrikeCal==='function') renderStrikeCal();
}

Object.assign(window, {
  PM_DIST_MIN_N, PM_DIST_MATCH_YD, pmDistShots, pmMedian, pmQuart, pmDistClub, pmDistLog, pmDistApply,
  pmDistUndo, pmDistCardHTML, PM_MAP_ERR_YD, PM_DISP_MIN_DOF, pmPtErrYd, pmShotTarget, pmDispClub,
  pmDispPool, pmDispCal, PM_DISP_SRC, PM_DISP_SRC_LBL, PM_DISP_MODES, pmDispSources, pmDispMode,
  pmDispCombine, pmDispProposal, pmDispApply, pmDispSetMode, pmDispSourcesHTML, pmDispUndo, pmDispChanged,
  pmDispCardHTML, PM_LEAN_MIN_DOF, PM_LEAN_TYPES, pmLeanSide, pmLeanMeasure, pmLeanDeg, pmLeanSVG,
  pmLeanHTML, pmLeanApply });
