// features/home.js — HOME: where the app opens, and what the logo goes back to.
//
// One column, phone first, four blocks, and everything that matters above the fold at 375px:
//   DOORS        Play and Sim. While a round is open the Play door is the way back into it.
//   WHERE YOU    the unofficial index, the last round's strokes gained by category, and the
//   STAND        part of the game costing the most a round. Read live from the logged rounds,
//                on the benchmark set now, by the same arithmetic as All rounds.
//   WHAT'S NEXT  one card, and it changes with what there is: a setup checklist for a new
//                player; plan the round, if the course has no plan; otherwise the next
//                session of the practice plan and how far the goal is.
//   THE REST     every page again, sorted by WHEN it is used (prepare, play, review, improve)
//                rather than by what it is, which is how the nav sorts them. Nothing moved:
//                these are links into the same pages, and every deep link still works.
//
// Home is a group of its own ('home') that has no button in the nav: the five groups stay five.

/* ---------------- GETTING AROUND ---------------- */
function goHome(){ showGroup('home'); window.scrollTo && window.scrollTo(0,0); }
function hmGo(group, page){ showGroupPage(group, page); window.scrollTo && window.scrollTo(0,0); }
/* Post-Round, in one of its two views, scrolled to a part of it */
function hmPost(view, sel, h4){
  showGroupPage('gameplan','postround');
  if(typeof rdSetView==='function') rdSetView(view);
  setTimeout(()=>{
    let el=sel ? document.querySelector('#postround-wrap '+sel) : null;
    if(h4) el=[...document.querySelectorAll('#postround-wrap .rd-sec h4')].find(x=>x.textContent.startsWith(h4)) || el;
    if(el) el.scrollIntoView({block:'start'}); else window.scrollTo && window.scrollTo(0,0);
  }, 0);
}

/* ---------------- WHAT THERE IS ---------------- */
function hmRounds(){ return (typeof rdAll==='function') ? rdAll().slice().sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)) : []; }
/* The course in question: the one chosen at Play setup, else the one played last, else the first. */
function hmCourse(){
  const cs=STATE.courses||[]; if(!cs.length) return null;
  const sel=window.pmSetupSel;
  if(sel && cs[sel.c]) return {c:cs[sel.c], i:sel.c};
  const R=hmRounds(), last=R[R.length-1];
  const i=last ? cs.findIndex(c=>(c.id||c.name)===last.courseKey) : -1;
  return i>=0 ? {c:cs[i], i} : {c:cs[0], i:0};
}
/* A new player starts on the sample bag. The default player's bag is the app's own, so it counts. */
function hmBagIsYours(){
  if(typeof psActive==='function' && psActive()==='default') return true;
  try{ return JSON.stringify(STATE.clubs)!==JSON.stringify(DEFAULT_DATA.clubs); }catch(_){ return true; }
}
function hmSetupItems(){
  const P=STATE.profile||{};
  return [
    { done:!!String(P.handicap||'').trim(), t:'Your Handicap Index', d:'Sets the benchmark for strokes gained and your Course Handicap', go:`hmGo('setup','profile')` },
    { done:hmBagIsYours(), t:'Your clubs and distances', d:'Every distance in the app starts from your stock shots', go:`hmGo('setup','specs')` },
    { done:(STATE.courses||[]).some(c=>(c.holes||[]).some(h=>h.geo)), t:'A course you play, with its map', d:'Import it from OpenStreetMap for GPS distances in Play', go:`hmGo('gameplan','gpcourses')` },
    { done:!!(((STATE.sim||{}).sessions)||[]).length, t:'A TrackMan session', d:'Captured launch data into your bag', go:`simOpen(); simSetView('tm')`, opt:true },
    { done:hmRounds().length>0, t:'Your first round', d:'Score and shots in Play; strokes gained follows', go:`pmOpen()` }
  ];
}

/* ---------------- 1. THE DOORS ---------------- */
function hmDoorsHTML(){
  const r=(typeof pmRound==='function')?pmRound():null;
  let play;
  if(r){
    const hs=pmHoles(), h=hs[Math.min(r.cur,hs.length-1)], t=pmTotals();
    play=`<button type="button" class="hm-door hm-play live" onclick="pmOpen()">
        <span class="hm-door-t"><span class="pm-dot"></span>Resume round</span>
        <span class="hm-door-d">Hole ${h?pmHoleNum(h,r.cur):''}${t&&t.played?` · ${pmFmtToPar(t.toPar)}`:''} · ${escapeHtml(r.courseName||'')}${r.tournament&&r.tournament.on?' · tournament':''}</span></button>`;
  } else {
    play=`<button type="button" class="hm-door hm-play" onclick="pmOpen()">
        <span class="hm-door-t">▶ Play golf</span><span class="hm-door-d">GPS distances, the hole map, your card</span></button>`;
  }
  const locked=!!(r&&r.tournament&&r.tournament.on);
  const sim=locked?'':`<button type="button" class="hm-door hm-sim" onclick="simOpen()">
        <span class="hm-door-t">⛳ Sim golf</span><span class="hm-door-d">TrackMan sessions and games for the bay</span></button>`;
  return `<div class="hm-doors">${play}${sim}</div>`;
}

/* ---------------- 2. WHERE YOU STAND ---------------- */
function hmStandHTML(){
  const R=hmRounds();
  const fmtI=v=>v<0?`+${Math.abs(v).toFixed(1)}`:v.toFixed(1);
  let idx=null, idxLbl='';
  try{ const E=rdIndexEst(); if(E.est!=null){ idx=fmtI(E.est); idxLbl='unofficial'; } }catch(_){}
  if(idx==null){ const h=String((STATE.profile||{}).handicap||'').trim(); if(h){ idx=h; idxLbl='official'; } }
  const index=`<div class="hm-st-idx"><span>Index</span><b>${idx!=null?escapeHtml(idx):'—'}</b><i>${idxLbl||'not set'}</i></div>`;
  if(!R.length) return `<div class="hm-stand hm-stand-empty">${index}<p>Log a round in Play, with its shots, and your strokes gained shows here.</p></div>`;
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  const D=R.slice(-RD_PLAN_ROUNDS).map(r=>rdRound(r, bench)).filter(d=>d.per18);
  if(!D.length) return `<div class="hm-stand hm-stand-empty" role="button" tabindex="0" onclick="hmPost('all')">${index}<p>${R.length} round${R.length===1?'':'s'} logged. Add each shot's situation and distance and strokes gained follows.</p></div>`;
  const last=D[D.length-1], neg=x=>x!=null&&x<0?' neg':'';
  const cats=RD_CATS.map(([k])=>`<span><i>${{ott:'Tee',app:'App',arg:'ARG',putt:'Putt'}[k]}</i><b class="${neg(last.per18[k])}">${rdSg(last.per18[k])}</b></span>`).join('');
  const avg=RD_CATS.map(([k,l])=>({l, v:rdMean(D.map(d=>d.per18[k]))})).sort((a,b)=>a.v-b.v)[0];
  const leak = avg && avg.v<0 ? `Biggest leak: <b>${avg.l}</b>, <b class="neg">${rdSg(avg.v)}</b> a round`
             : avg ? `Weakest: <b>${avg.l}</b>, ${rdSg(avg.v)} a round` : '';
  return `<div class="hm-stand" role="button" tabindex="0" onclick="hmPost('all')" aria-label="Open All rounds">
      ${index}
      <div class="hm-st-sg"><span class="hm-st-h">Last round <i>${new Date(last.date).toLocaleDateString([], {month:'short', day:'numeric'})} · per 18 vs ${escapeHtml(bench.short||'')}</i></span>
        <span class="hm-st-tot"><b class="${neg(last.per18.total)}">${rdSg(last.per18.total)}</b></span>
        <span class="hm-st-cats">${cats}</span></div>
      ${leak?`<div class="hm-st-leak">${leak}<i>over the last ${D.length} round${D.length===1?'':'s'}</i></div>`:''}
    </div>`;
}

/* ---------------- 3. WHAT'S NEXT ---------------- */
function hmGoalLine(){
  const G=(typeof rdGoals==='function')?rdGoals():null; if(!G) return '';
  const cur=rdCurrentAvgs(), total=RD_CATS.reduce((a,[k])=>a+(G.cats[k]||0),0);
  if(cur.total==null) return `<p class="hm-goal">Goal <b>${rdSg(total)}</b> a round vs ${escapeHtml(G.bench)}</p>`;
  return `<p class="hm-goal">Goal <b>${rdSg(total)}</b> a round · now <b class="${cur.total<0?'neg':''}">${rdSg(cur.total)}</b> over ${cur.n} · ${cur.total>=total?'<b>met</b>':`${(total-cur.total).toFixed(2)} to go`}</p>`;
}
function hmNextHTML(){
  const R=hmRounds();
  /* a new player: what the app needs to work for them */
  if(!R.length){
    const L=hmSetupItems(), done=L.filter(x=>x.done).length;
    return `<div class="hm-next"><div class="hm-next-h">Get set up <span>${done} of ${L.length}</span></div>
      ${L.map(x=>`<button type="button" class="hm-check${x.done?' done':''}" onclick="${x.go}">
          <span class="hm-tick" aria-hidden="true">${x.done?'✓':''}</span>
          <span class="hm-check-t">${x.t}${x.opt?' <i>optional</i>':''}<small>${x.d}</small></span><span class="hm-arrow" aria-hidden="true">›</span></button>`).join('')}
    </div>`;
  }
  /* the course has no plan: plan it, and print the scoring profile */
  const C=hmCourse(), plans=(typeof pmPlans==='function')?pmPlans():{};
  if(C && !(typeof pmRound==='function'&&pmRound()) && !plans[pmCourseKey(C.c)]){
    return `<div class="hm-next"><div class="hm-next-h">Next round <span>${escapeHtml(C.c.name||'')}</span></div>
      <p>No plan yet for this course. Plan each hole on your own model, freeze it, and play to it; Post-Round then prices plan against played.</p>
      <div class="hm-acts"><button type="button" class="btn btn-accent" onclick="hmPlanRound(${C.i})">Plan your round</button>
        <button type="button" class="btn" onclick="printScoringProfile(false)">⎙ Scoring Profile</button></div>
      ${hmGoalLine()}</div>`;
  }
  /* otherwise: practice */
  const P=STATE.practicePlan;
  if(P && !P.draft && P.sessions && P.sessions.length){
    const i=P.sessions.findIndex(s=>!s.done), n=P.sessions.length, dn=P.sessions.filter(s=>s.done).length;
    if(i<0) return `<div class="hm-next"><div class="hm-next-h">Practice plan <span>all ${n} sessions done</span></div>
        <p>Play a few rounds and the plan measures whether those leaks closed; then build the next one.</p>
        <div class="hm-acts"><button type="button" class="btn btn-accent" onclick="hmPost('all',null,'Practice plan')">See the plan</button></div>${hmGoalLine()}</div>`;
    const S=P.sessions[i];
    const rows=S.blocks.map(b=>{ const go=((RD_DRILLS[b.key]||{}).go||[])[0];
      return `<div class="hm-block"><b>${b.min}′</b><span>${escapeHtml(b.label)}</span>${go?`<button type="button" class="btn lm-mini" onclick="rdPlanGo('${go[1]}')">${escapeHtml(go[0])}</button>`:''}</div>`; }).join('');
    return `<div class="hm-next"><div class="hm-next-h">Today's practice <span>session ${i+1} of ${n} · ${dn} done</span></div>
      ${rows}
      <div class="hm-acts"><button type="button" class="btn btn-accent" onclick="hmPlanDone(${i})">Done</button>
        <button type="button" class="btn" onclick="hmPost('all',null,'Practice plan')">The whole plan</button></div>
      ${hmGoalLine()}</div>`;
  }
  return `<div class="hm-next"><div class="hm-next-h">Practice plan <span>none yet</span></div>
      <p>Weighs every part of your game by what it costs a round, and shares out your practice time to match.</p>
      <div class="hm-acts"><button type="button" class="btn btn-accent" onclick="hmPlanBuild()">Build my plan</button>
        <button type="button" class="btn" onclick="hmPost('all',null,'Goals')">Goals</button></div>
      ${hmGoalLine()}</div>`;
}
function hmPlanRound(i){ window.pmSetupSel=Object.assign({}, window.pmSetupSel||{}, {c:i}); pmOpen(); pmPlanOpen(); }
function hmPlanDone(i){ rdPlanDone(i); buildHome(); }
function hmPlanBuild(){ rdPlanBuild(); buildHome(); }

/* ---------------- 4. THE REST, BY WHEN ---------------- */
const HM_ROWS = [
  ['Prepare', [['Plan my round',`hmPlanRound((hmCourse()||{i:0}).i)`],['Hole Overlay',`hmGo('gameplan','gameplan')`],['Pre-Shot',`hmGo('gameplan','preshot')`],['Print',`hmGo('gameplan','gpcourses')`]]],
  ['Play',    [['On-Course Games',`hmGo('games','rgames')`],['Practice Games',`hmGo('games','games')`]]],
  ['Review',  [['Post-Round',`hmPost('round')`],['All rounds',`hmPost('all')`],['Ready to post',`hmPost('round','.whs-card')`],['Post-Shot',`hmGo('gameplan','postshot')`]]],
  ['Improve', [['Practice plan',`hmPost('all',null,'Practice plan')`],['Causation',`hmGo('diagnose','chain')`],['My numbers',`hmGo('play','bag')`]]]
];
function hmTilesHTML(){
  return `<div class="hm-rows">${HM_ROWS.map(([h,L])=>`<div class="hm-row"><div class="hm-row-h">${h}</div>
      <div class="hm-tiles">${L.map(([t,go])=>`<button type="button" class="hm-tile" onclick="${go}">${t}</button>`).join('')}</div></div>`).join('')}</div>`;
}

function buildHome(){
  const w=document.getElementById('home-wrap'); if(!w) return;
  let html='';
  try{ html=hmDoorsHTML()+hmStandHTML()+hmNextHTML()+hmTilesHTML(); }
  catch(e){ console.error(e); html=hmDoorsHTML()+hmTilesHTML(); }
  w.innerHTML=html;
}

Object.assign(window, { goHome, hmGo, hmPost, hmRounds, hmCourse, hmBagIsYours, hmSetupItems, hmDoorsHTML, hmStandHTML,
  hmGoalLine, hmNextHTML, hmPlanRound, hmPlanDone, hmPlanBuild, HM_ROWS, hmTilesHTML, buildHome });
