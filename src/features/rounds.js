// features/rounds.js — ALL ROUNDS: the dashboard behind Post-Round's "All rounds" switch.
//
// Every round Play has saved, read the same way the round itself is: strokes gained shot by
// shot on the benchmark set in Settings (so a trend is never a mix of benchmarks), from the
// situation and distance recorded for each shot. Nothing here is stored: it is recomputed
// from the rounds on each look, so a change of benchmark re-reads every round.
//
//   trend        strokes gained per round, per 18 holes (a round logged on 12 holes is scaled,
//                not left looking like a good day), with a rolling average and each category
//   where        approach by distance and situation, around the green with up-and-down %,
//                putting by distance with how often each distance is holed and three-putt %,
//                off the tee, scoring by par
//   decisions    choice and execution from the four-way read, and commitment
//   handicap     an UNOFFICIAL index from the rated 18-hole rounds (WHS: best 8 of the last 20,
//                fewer rounds by the WHS table). Golf Canada's is the real one.
//   export       rounds.csv and shots.csv: your data, in a file, whenever you want it

window.rdView = window.rdView || 'round';
function rdSetView(v){ window.rdView=v; if(typeof buildPostRound==='function') buildPostRound(); window.scrollTo&&window.scrollTo(0, (document.getElementById('postround-wrap')||{}).offsetTop-100||0); }
function rdSwitchHTML(){
  const n=((STATE.play&&STATE.play.rounds)||[]).length;
  return `<div class="sim-modes rd-switch">${[['round','This round'],['all',`All rounds${n?` (${n})`:''}`]].map(([k,l])=>
    `<button type="button" class="${window.rdView===k?'on':''}" onclick="rdSetView('${k}')" aria-pressed="${window.rdView===k}">${l}</button>`).join('')}</div>`;
}
function rdF(){ const P=STATE.play=STATE.play||{}; return (P.rdFilter=P.rdFilter||{n:'10', course:'', type:'all'}); }
function rdSetF(k,v){ rdF()[k]=v; saveState(); buildPostRound(); }
function rdCourse(r){ return (STATE.courses||[]).find(c=>(c.id||c.name)===r.courseKey)||null; }
function rdAll(){ return ((STATE.play&&STATE.play.rounds)||[]).filter(r=>r&&r.done!==false); }
function rdRounds(){
  const F=rdF();
  let R=rdAll().slice().sort((a,b)=>(a.startedAt||0)-(b.startedAt||0));
  if(F.course) R=R.filter(r=>r.courseKey===F.course);
  if(F.type==='tourn') R=R.filter(r=>r.tournament); else if(F.type==='casual') R=R.filter(r=>!r.tournament);
  if(F.n!=='all') R=R.slice(-parseInt(F.n,10));
  return R;
}
const RD_CATS=[['ott','Off the tee'],['app','Approach'],['arg','Around the green'],['putt','Putting']];
function rdE(lie, yd, hcp){ if(yd==null||!lie) return null; return srForPlayer(lie, lie==='green'?Math.max(0.5,yd*3):Math.max(1,yd), hcp); }
/* one round, read shot by shot */
function rdRound(r, bench){
  const c=rdCourse(r), hs=(c&&c.holes)||[];
  const out={ r, date:r.startedAt||r.endedAt||0, course:r.courseName||'', tourn:!!r.tournament, t:r.totals||{},
              sg:{ott:0,app:0,arg:0,putt:0}, total:0, sgHoles:0, shots:[], holes:[] };
  const keys=Object.keys(r.holes||{}).map(Number).sort((a,b)=>a-b);
  keys.forEach(num=>{
    const e=r.holes[num], h=hs.find((x,i)=>(x.num||i+1)===num), par=h?(+h.par||4):(e.shots&&e.shots[0]&&e.shots[0].yd>250?4:3);
    if(e && e.s!=null) out.holes.push({num, par, s:e.s, p:e.p});
    const S=(e&&e.shots)||[]; if(!S.length || S.some(x=>x.yd==null||!x.lie)) return;
    out.sgHoles++;
    S.forEach((sh,k)=>{
      const a=rdE(sh.lie, sh.yd, bench.hcp), nx=S[k+1], b=nx?rdE(nx.lie, nx.yd, bench.hcp):0;
      if(a==null||b==null) return;
      const sg=a-b-1-(sh.pen?1:0);
      const cat = sh.lie==='green' ? 'putt' : (sh.lie==='tee' && par>=4) ? 'ott' : sh.yd<=50 ? 'arg' : 'app';
      out.sg[cat]+=sg; out.total+=sg;
      out.shots.push({ num, k, par, lie:sh.lie, yd:sh.yd, cat, sg, pen:!!sh.pen, club:sh.club||'', commit:sh.commit||null,
                       aimed:!!sh.tgt, holed:!nx, left:S.length-k, next:nx?{lie:nx.lie, yd:nx.yd}:null });
    });
  });
  const k18=out.sgHoles?18/out.sgHoles:null;
  out.per18 = k18 ? {total:out.total*k18, ott:out.sg.ott*k18, app:out.sg.app*k18, arg:out.sg.arg*k18, putt:out.sg.putt*k18} : null;
  if(typeof whsPost==='function'){ try{ const P=whsPost(r); if(P && P.kind==='18' && P.diff!=null) out.diff=P.diff; }catch(_){} }
  return out;
}
const rdMean=a=>{ const v=a.filter(x=>x!=null&&isFinite(x)); return v.length?v.reduce((s,x)=>s+x,0)/v.length:null; };
const rdSg=x=>x==null?'—':`${x>=0?'+':'−'}${Math.abs(x).toFixed(2)}`;
const rdPct=(a,b)=>b?`${Math.round(100*a/b)}%`:'—';

/* ---------- the trend ---------- */
function rdTrendSVG(vals, avgN){
  const W=340, H=150, L=28, R=8, T=10, B=18, n=vals.length;
  const v=vals.map(x=>x==null?null:x), lim=Math.max(1, ...v.filter(x=>x!=null).map(Math.abs))*1.15;
  const X=i=>L+(n<=1?(W-L-R)/2:i*(W-L-R)/(n-1)), Y=y=>T+(H-T-B)/2-(y/lim)*((H-T-B)/2);
  const bw=Math.max(3, Math.min(18, (W-L-R)/Math.max(1,n)*0.6));
  let s=`<line x1="${L}" x2="${W-R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--border2)"/>`;
  [lim, -lim].forEach(t=>{ s+=`<text x="${L-4}" y="${Y(t)+3}" text-anchor="end" font-size="8" fill="var(--muted)" font-family="ui-monospace,monospace">${t>0?'+':'−'}${Math.abs(t).toFixed(1)}</text>`; });
  v.forEach((y,i)=>{ if(y==null) return; const y0=Y(0), y1=Y(y);
    s+=`<rect x="${(X(i)-bw/2).toFixed(1)}" y="${Math.min(y0,y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,Math.abs(y1-y0)).toFixed(1)}" rx="2" fill="${y>=0?'#00853F':'#b8455a'}" fill-opacity=".8"/>`; });
  /* rolling average over the last avgN rounds that have strokes gained */
  const pts=[]; v.forEach((y,i)=>{ const win=v.slice(0,i+1).filter(x=>x!=null).slice(-avgN); if(y!=null && win.length) pts.push([X(i), Y(win.reduce((a,b)=>a+b,0)/win.length)]); });
  if(pts.length>1) s+=`<polyline points="${pts.map(p=>p.map(q=>q.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  return `<svg class="rd-trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Strokes gained per round, with a rolling average">${s}</svg>`;
}
function rdSpark(vals){
  const W=120, H=30, v=vals.filter(x=>x!=null); if(v.length<2) return '';
  const lim=Math.max(0.5, ...v.map(Math.abs)), X=i=>2+i*(W-4)/(v.length-1), Y=y=>H/2-(y/lim)*(H/2-3);
  return `<svg viewBox="0 0 ${W} ${H}" class="rd-spark" aria-hidden="true"><line x1="0" x2="${W}" y1="${H/2}" y2="${H/2}" stroke="var(--border2)"/>
    <polyline points="${v.map((y,i)=>`${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink2)" stroke-width="1.5"/></svg>`;
}

/* ---------- the breakdowns ---------- */
function rdBand(shots, bands, key){ return bands.map(([lo,hi,lbl])=>{ const L=shots.filter(s=>s[key]>=lo && s[key]<hi); return {lbl, n:L.length, sg:rdMean(L.map(s=>s.sg)), L}; }); }
function rdTable(head, rows){
  return `<div class="rd-scroll"><table class="rd-tbl"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function rdSgCell(x, n){ return `<td><b class="${x!=null&&x<0?'neg':''}">${n?rdSg(x):'—'}</b><i>${n||''}</i></td>`; }
function rdApproachHTML(S){
  const A=S.filter(s=>s.cat==='app');
  if(!A.length) return '';
  const bands=[[50,100,'50–100'],[100,150,'100–150'],[150,200,'150–200'],[200,9e9,'200+']];
  const lies=[['fairway','Fairway'],['rough','Rough'],['sand','Bunker'],['tee','Tee (par 3)']].filter(([k])=>A.some(s=>s.lie===k));
  const rows=bands.map(([lo,hi,lbl])=>{ const B=A.filter(s=>s.yd>=lo&&s.yd<hi); if(!B.length) return '';
    const onG=B.filter(s=>s.next&&s.next.lie==='green'), prox=rdMean(onG.map(s=>s.next.yd*3));
    return `<tr><th>${lbl}</th>${lies.map(([k])=>{ const L=B.filter(s=>s.lie===k); return rdSgCell(rdMean(L.map(s=>s.sg)), L.length); }).join('')}
      <td><b>${prox!=null?Math.round(prox)+' ft':'—'}</b><i>${rdPct(onG.length,B.length)} on</i></td></tr>`; }).filter(Boolean);
  return `<div class="rd-sec"><h4>Approach <span>strokes gained a shot · ${ydUnit()} to the hole</span></h4>
    ${rdTable([ydUnit(), ...lies.map(l=>l[1]), 'Green hit, left'], rows)}</div>`;
}
function rdArgHTML(S){
  const A=S.filter(s=>s.cat==='arg'); if(!A.length) return '';
  const lies=[['fairway','Fairway'],['rough','Rough'],['sand','Bunker'],['recovery','Recovery']].filter(([k])=>A.some(s=>s.lie===k));
  const rows=lies.map(([k,l])=>{ const L=A.filter(s=>s.lie===k), ud=L.filter(s=>s.left<=2).length;
    return `<tr><th>${l}</th>${rdSgCell(rdMean(L.map(s=>s.sg)), L.length)}<td><b>${rdPct(ud,L.length)}</b><i>in 2 or fewer</i></td></tr>`; });
  return `<div class="rd-sec"><h4>Around the green <span>inside 50 ${ydUnit()}</span></h4>${rdTable(['From','SG a shot','Up and down'], rows)}</div>`;
}
function rdPuttHTML(S){
  const P=S.filter(s=>s.cat==='putt'); if(!P.length) return '';
  const bands=[[0,3,'0–3'],[3,6,'3–6'],[6,10,'6–10'],[10,20,'10–20'],[20,40,'20–40'],[40,9e9,'40+']];
  const firsts=[]; const seen=new Set();
  P.forEach(s=>{ const key=s.num+'|'+s.rd; if(!seen.has(key)){ seen.add(key); firsts.push(s); } });
  const rows=bands.map(([lo,hi,lbl])=>{ const L=P.filter(s=>s.yd*3>=lo&&s.yd*3<hi); if(!L.length) return '';
    const F=firsts.filter(s=>s.yd*3>=lo&&s.yd*3<hi), three=F.filter(s=>s.left>=3).length;
    return `<tr><th>${lbl}</th>${rdSgCell(rdMean(L.map(s=>s.sg)), L.length)}<td><b>${rdPct(L.filter(s=>s.holed).length, L.length)}</b></td><td><b>${F.length?rdPct(three,F.length):'—'}</b><i>${F.length||''}</i></td></tr>`; }).filter(Boolean);
  return `<div class="rd-sec"><h4>Putting <span>by distance, ${ftUnit()}</span></h4>${rdTable([ftUnit(),'SG a putt','Holed','3-putt'], rows)}</div>`;
}
function rdTeeHTML(D, S){
  const T=S.filter(s=>s.cat==='ott'); if(!T.length) return '';
  const fir=D.reduce((a,d)=>a+(d.t.fir||0),0), att=D.reduce((a,d)=>a+(d.t.firAtt||0),0);
  const pen=T.filter(s=>s.pen).length, rough=T.filter(s=>s.next&&s.next.lie==='rough').length, trees=T.filter(s=>s.next&&s.next.lie==='recovery').length;
  return `<div class="rd-sec"><h4>Off the tee <span>par 4s and 5s</span></h4>
    <div class="rd-chips"><span>SG a drive <b class="${(rdMean(T.map(s=>s.sg))||0)<0?'neg':''}">${rdSg(rdMean(T.map(s=>s.sg)))}</b></span><span>Fairways <b>${rdPct(fir,att)}</b></span>
      <span>Rough <b>${rdPct(rough,T.length)}</b></span><span>Trees <b>${rdPct(trees,T.length)}</b></span><span>Penalty <b>${rdPct(pen,T.length)}</b></span></div></div>`;
}
function rdScoringHTML(D){
  const H=D.flatMap(d=>d.holes); if(!H.length) return '';
  const byPar=[3,4,5].map(p=>{ const L=H.filter(h=>h.par===p); return {p, n:L.length, avg:rdMean(L.map(h=>h.s-p))}; }).filter(x=>x.n);
  const dist=[['Eagle or better',x=>x<=-2],['Birdie',x=>x===-1],['Par',x=>x===0],['Bogey',x=>x===1],['Double or worse',x=>x>=2]]
    .map(([l,f])=>[l, H.filter(h=>f(h.s-h.par)).length]);
  return `<div class="rd-sec"><h4>Scoring <span>${H.length} holes</span></h4>
    <div class="rd-chips">${byPar.map(x=>`<span>Par ${x.p}s <b>${x.avg>=0?'+':''}${x.avg.toFixed(2)}</b><i>${x.n}</i></span>`).join('')}</div>
    <div class="rd-dist">${dist.map(([l,n])=>`<div style="flex:${Math.max(n,0.0001)}" title="${l}: ${n}"><b>${n}</b><span>${l}</span></div>`).join('')}</div></div>`;
}
function rdDecisionHTML(D){
  const F=D.flatMap(d=>(d.r.fourWay&&d.r.fourWay.shots)||[]); if(!F.length) return '';
  const A=F.filter(x=>x.choice!=null&&x.exec!=null), O=F.filter(x=>x.vsOpt!=null);
  const cm=[3,2,1].map(v=>{ const L=O.filter(x=>x.commit===v); return L.length?`<span>${{3:'Committed',2:'Partly',1:'Not committed'}[v]} <b class="${rdMean(L.map(x=>x.vsOpt))<0?'neg':''}">${rdSg(rdMean(L.map(x=>x.vsOpt)))}</b><i>${L.length}</i></span>`:''; }).join('');
  return `<div class="rd-sec"><h4>Decisions and execution <span>a shot, against optimal, on your own model</span></h4>
    <div class="rd-chips">${A.length?`<span>Choice <b class="${rdMean(A.map(x=>x.choice))<0?'neg':''}">${rdSg(rdMean(A.map(x=>x.choice)))}</b><i>${A.length} aimed</i></span>
      <span>Execution <b class="${rdMean(A.map(x=>x.exec))<0?'neg':''}">${rdSg(rdMean(A.map(x=>x.exec)))}</b></span>`:''}
      <span>vs optimal <b class="${rdMean(O.map(x=>x.vsOpt))<0?'neg':''}">${rdSg(rdMean(O.map(x=>x.vsOpt)))}</b><i>${O.length}</i></span></div>
    ${cm?`<div class="rd-chips">${cm}</div>`:''}</div>`;
}
/* WHS: how many of the most recent differentials count, by how many there are (up to 20) */
const RD_WHS_TABLE = {3:[1,-2],4:[1,-1],5:[1,0],6:[2,-1],7:[2,0],8:[2,0],9:[3,0],10:[3,0],11:[3,0],12:[4,0],13:[4,0],14:[4,0],15:[5,0],16:[5,0],17:[6,0],18:[6,0],19:[7,0],20:[8,0]};
function rdIndexHTML(){
  const D=rdAll().slice().sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)).map(r=>{ try{ const P=whsPost(r); return P&&P.kind==='18'&&P.diff!=null?{d:P.diff, at:r.startedAt}:null; }catch(_){ return null; } }).filter(Boolean).slice(-20);
  if(!D.length) return `<div class="rd-sec"><h4>Handicap <span>unofficial</span></h4><p class="pm-note">Set the tees and stroke index on a round's Ready to post card and each rated 18-hole round gets a score differential here, with an unofficial index once there are three.</p></div>`;
  const n=D.length, rule=RD_WHS_TABLE[Math.min(20,n)];
  let est=null;
  if(rule){ const best=D.map(x=>x.d).sort((a,b)=>a-b).slice(0,rule[0]); est=Math.round((best.reduce((a,b)=>a+b,0)/best.length+rule[1])*10)/10; }
  const fmt=v=>v<0?`+${Math.abs(v).toFixed(1)}`:v.toFixed(1);
  return `<div class="rd-sec"><h4>Handicap <span>unofficial: Golf Canada's is the real one</span></h4>
    <div class="rd-chips"><span>Estimated index <b>${est!=null?fmt(est):'—'}</b><i>${rule?`best ${rule[0]} of ${n}${rule[1]?` ${rule[1]}`:''}`:`needs 3 rated rounds`}</i></span>
      <span>Last differential <b>${fmt(D[n-1].d)}</b></span><span>Official <b>${escapeHtml(String((STATE.profile&&STATE.profile.handicap)||'—'))}</b></span></div>
    <p class="pm-note">Differentials here are before the playing conditions calculation, and without the soft and hard caps or exceptional-score reductions, so this drifts from the official number.</p></div>`;
}
/* the practice priority: the category losing the most a round, and the finest band inside it */
function rdPriorityHTML(D, S){
  const avg=RD_CATS.map(([k,l])=>({k, l, v:rdMean(D.filter(d=>d.per18).map(d=>d.per18[k]))})).filter(x=>x.v!=null);
  if(!avg.length) return '';
  const worst=avg.slice().sort((a,b)=>a.v-b.v)[0];
  const tools={ ott:'the Driver combine (Games → Practice) and Shape Nine (Sim)',
                app:'the Irons and Wedges combines (Games → Practice) and the Ladder Test (Sim)',
                arg:'the Short Game tab’s setup model, then the Wedges combine from 10–40 yd',
                putt:'the Putting combine (Games → Practice)' };
  let detail='';
  if(worst.k==='app'){ const B=rdBand(S.filter(s=>s.cat==='app'), [[50,100,'50–100'],[100,150,'100–150'],[150,200,'150–200'],[200,9e9,'200+']], 'yd').filter(b=>b.n>=3).sort((a,b)=>a.sg-b.sg)[0]; if(B) detail=` Inside it, ${B.lbl} ${ydUnit()} costs the most: ${rdSg(B.sg)} a shot over ${B.n}.`; }
  if(worst.k==='putt'){ const F=S.filter(s=>s.cat==='putt'); const B=rdBand(F.map(s=>Object.assign({},s,{ft:s.yd*3})), [[0,6,'inside 6 ft'],[6,20,'6–20 ft'],[20,9e9,'20 ft and longer']], 'ft').filter(b=>b.n>=4).sort((a,b)=>a.sg-b.sg)[0]; if(B) detail=` Inside it, ${B.lbl} costs the most: ${rdSg(B.sg)} a putt over ${B.n}.`; }
  return `<div class="rd-sec rd-prio"><h4>Practice priority</h4>
    <p><b>${worst.l}</b> is costing you <b class="${worst.v<0?'neg':''}">${rdSg(worst.v)}</b> a round against ${escapeHtml(((typeof esCmp==='function')?esCmp():{label:'the benchmark'}).label||'the benchmark')}.${detail} Work on it with ${tools[worst.k]}.</p></div>`;
}

/* ---------- export: rounds.csv and shots.csv ---------- */
function rdCsv(rows){ return rows.map(r=>r.map(v=>{ const s=v==null?'':String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }).join(',')).join('\n'); }
function rdDownload(name, text){
  const blob=new Blob([text], {type:'text/csv;charset=utf-8'}), a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function rdExport(kind){
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  const D=rdAll().slice().sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)).map(r=>rdRound(r, bench));
  const day=d=>d?new Date(d).toISOString().slice(0,10):'';
  const f2=x=>x==null?'':x.toFixed(3);
  if(kind==='rounds'){
    const rows=[['date','course','tee','tournament','holes_played','score','par','to_par','putts','fairways','fairway_attempts','greens','green_attempts','penalties',`sg_total_vs_${bench.short}`,'sg_off_tee','sg_approach','sg_around_green','sg_putting','sg_holes','differential_before_pcc']];
    D.forEach(d=>{ const t=d.t; rows.push([day(d.date), d.course, d.r.tee||'', d.tourn?'yes':'no', t.played??'', t.strokes??'', t.par??'', t.toPar??'', t.putts??'', t.fir??'', t.firAtt??'', t.gir??'', t.girAtt??'', t.pen??'',
      d.sgHoles?f2(d.total):'', d.sgHoles?f2(d.sg.ott):'', d.sgHoles?f2(d.sg.app):'', d.sgHoles?f2(d.sg.arg):'', d.sgHoles?f2(d.sg.putt):'', d.sgHoles, d.diff!=null?d.diff.toFixed(1):'']); });
    rdDownload('strongergolf-rounds.csv', rdCsv(rows));
  } else {
    const rows=[['date','course','hole','par','shot','lie','distance_to_hole_yd','club','penalty','commitment','aimed','category',`sg_vs_${bench.short}`]];
    D.forEach(d=>d.shots.forEach(s=>rows.push([day(d.date), d.course, s.num, s.par, s.k+1, s.lie, s.yd, s.club?((typeof pmClubName==='function'&&pmClubName(s.club))||s.club):'', s.pen?1:0, s.commit||'', s.aimed?1:0, s.cat, f2(s.sg)])));
    rdDownload('strongergolf-shots.csv', rdCsv(rows));
  }
  toast('Downloaded');
}

/* ---------- planned: the next tools, shown so they can be argued with ---------- */
const RD_PLANNED = [
  ['Strokes gained goals', 'A target per category against your benchmark, with progress round by round.'],
  ['Practice plan from your leaks', 'The practice priority above, turned into a week of sessions from the combines and Sim games, and re-measured.'],
  ['Coach sharing', 'Send a round or the dashboard to a coach, read-only, without handing over the phone.'],
  ['Season recap', 'The year in one page: best rounds, biggest gains, what changed in the bag.'],
  ['Golf Canada sync', 'Posting and your official index without retyping, if a licensed-partner connection is granted.']
];

function rdDashboardHTML(){
  const all=rdAll();
  if(!all.length) return `<div class="profile-card"><h3>All rounds</h3><p class="pm-note">Rounds appear here once you finish one in Play (▶ Play, top right).</p></div>`;
  const F=rdF(), bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch', label:'Scratch'};
  const D=rdRounds().map(r=>rdRound(r, bench));
  D.forEach((d,i)=>d.shots.forEach(s=>{ s.rd=i; }));
  const S=D.flatMap(d=>d.shots);
  const courses=[...new Map(all.map(r=>[r.courseKey, r.courseName])).entries()];
  const filters=`<div class="rd-filters">
      <label>Rounds<select onchange="rdSetF('n', this.value)">${[['5','Last 5'],['10','Last 10'],['20','Last 20'],['all','All']].map(([v,l])=>`<option value="${v}"${F.n===v?' selected':''}>${l}</option>`).join('')}</select></label>
      <label>Course<select onchange="rdSetF('course', this.value)"><option value="">All courses</option>${courses.map(([k,n])=>`<option value="${escapeHtml(k)}"${F.course===k?' selected':''}>${escapeHtml(n||k)}</option>`).join('')}</select></label>
      <label>Type<select onchange="rdSetF('type', this.value)">${[['all','All'],['casual','Casual'],['tourn','Tournament']].map(([v,l])=>`<option value="${v}"${F.type===v?' selected':''}>${l}</option>`).join('')}</select></label>
    </div>`;
  if(!D.length) return `<div class="profile-card rd-card"><h3>All rounds</h3>${filters}<p class="pm-note">No rounds match these filters.</p></div>`;
  const sgD=D.filter(d=>d.per18);
  const avg=k=>rdMean(sgD.map(d=>d.per18[k]));
  const tot=k=>D.reduce((a,d)=>a+(d.t[k]||0),0);
  const top=`<div class="pm-pr-top rd-top">
      <div><span>Rounds</span><b>${D.length}</b><i>${sgD.length} with strokes gained</i></div>
      <div><span>Average</span><b>${(()=>{ const v=rdMean(D.filter(d=>d.t.played).map(d=>d.t.toPar*18/d.t.played)); return v==null?'—':(v>=0?'+':'')+v.toFixed(1); })()}</b><i>to par, per 18</i></div>
      <div><span>SG a round</span><b class="${(avg('total')||0)<0?'neg':''}">${rdSg(avg('total'))}</b><i>vs ${escapeHtml(bench.short)}, per 18</i></div>
    </div>
    <div class="rd-chips"><span>Putts <b>${(()=>{ const v=rdMean(D.filter(d=>d.t.puttHoles).map(d=>d.t.putts*18/d.t.puttHoles)); return v==null?'—':v.toFixed(1); })()}</b><i>per 18</i></span>
      <span>Fairways <b>${rdPct(tot('fir'),tot('firAtt'))}</b></span><span>Greens <b>${rdPct(tot('gir'),tot('girAtt'))}</b></span>
      <span>Penalties <b>${D.length?(tot('pen')/D.length).toFixed(1):'—'}</b><i>a round</i></span></div>`;
  const cats=sgD.length?`<div class="rd-cats">${RD_CATS.map(([k,l])=>`<div class="rd-cat"><span>${l}</span><b class="${(avg(k)||0)<0?'neg':''}">${rdSg(avg(k))}</b>${rdSpark(sgD.map(d=>d.per18[k]))}</div>`).join('')}</div>`:'';
  const trend=sgD.length?`<div class="rd-sec"><h4>Strokes gained a round <span>per 18 holes · bars each round, line the average of the last 5</span></h4>
      ${rdTrendSVG(D.map(d=>d.per18?d.per18.total:null), 5)}
      <div class="rd-axis"><span>${new Date(D[0].date).toLocaleDateString([], {month:'short', day:'numeric'})}</span><span>${new Date(D[D.length-1].date).toLocaleDateString([], {month:'short', day:'numeric'})}</span></div></div>`
    : `<p class="pm-note">Log your shots in Play (where each was played from) and strokes gained appears here round by round.</p>`;
  return `<div class="profile-card rd-card">
      <h3>All rounds</h3>
      <div class="pm-pr-when">Strokes gained against ${escapeHtml(bench.label||bench.short)} (Settings), re-read from every shot each time</div>
      ${filters}${top}${cats}${trend}
      ${rdPriorityHTML(D,S)}
      ${rdApproachHTML(S)}${rdArgHTML(S)}${rdPuttHTML(S)}${rdTeeHTML(D,S)}${rdScoringHTML(D)}${rdDecisionHTML(D)}
      ${rdIndexHTML()}
      <div class="rd-sec"><h4>Your data</h4><div class="pm-plan-row">
        <button type="button" class="btn pm-plan-btn" onclick="rdExport('rounds')">⬇ Rounds CSV</button>
        <button type="button" class="btn pm-plan-btn" onclick="rdExport('shots')">⬇ Shots CSV</button></div>
        <p class="pm-note">Every round and every shot, for a spreadsheet, a coach, or another app. The JSON backup in Settings is still the one that restores the app.</p></div>
      <div class="rd-sec rd-planned"><h4>Planned <span>tools this dashboard is ready for</span></h4>
        ${RD_PLANNED.map(([t,d])=>`<div class="rd-plan"><b>${t}</b><span>${d}</span></div>`).join('')}</div>
    </div>`;
}

Object.assign(window, { rdSetView, rdSwitchHTML, rdF, rdSetF, rdRounds, rdRound, rdTrendSVG, rdExport, rdDashboardHTML, RD_WHS_TABLE });
