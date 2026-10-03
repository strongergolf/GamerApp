// features/home.js — HOME: where the app opens, and what the logo goes back to.
//
// A landing page, not a dashboard. One thing to do (Play), one quiet alternative (Sim), one
// line saying what comes next, one line of numbers, and three ways into the rest of the app,
// sorted by when they are used. Everything else lives one tap further in, where it was.
//
//   NEXT is a single line, chosen in this order:
//     setup        a new player missing the basics (Index, clubs, a mapped course)
//     your plan    the course you are preparing for has a plan, made since your last round
//     plan it      the course you are preparing for has no plan: opens it on the Hole Overlay
//     practice     the next session of the practice plan
//   "The course you are preparing for" is the one last open on the Hole Overlay, else the last
//   one played, else the first.
//
// Home is a group of its own ('home') with no button in the nav: the five groups stay five.

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
/* the Hole Overlay, on a course (and its first hole) */
function hmOverlay(ci){
  const cs=STATE.courses||[];
  if(ci!=null && cs[ci]){
    window.stratSelRestored=true; window.stratSel={cIdx:ci, hIdx:0};
    if(typeof stratClearLines==='function') stratClearLines();
    if(typeof stratSaveSel==='function') stratSaveSel(true);
  }
  hmGo('gameplan','gameplan');
}

/* ---------------- WHAT THERE IS ---------------- */
function hmRounds(){ return (typeof rdAll==='function') ? rdAll().slice().sort((a,b)=>(a.startedAt||0)-(b.startedAt||0)) : []; }
function hmCourse(){
  const cs=STATE.courses||[]; if(!cs.length) return null;
  const sel=(STATE.play||{}).sel;
  let i=sel ? cs.findIndex(c=>(c.id||c.name)===sel.courseId) : -1;
  if(i<0){ const R=hmRounds(), last=R[R.length-1]; if(last) i=cs.findIndex(c=>(c.id||c.name)===last.courseKey); }
  if(i<0) i=0;
  return {c:cs[i], i};
}
/* A new player starts on the sample bag. The default player's bag is the app's own, so it counts. */
function hmBagIsYours(){
  if(typeof psActive==='function' && psActive()==='default') return true;
  try{ return JSON.stringify(STATE.clubs)!==JSON.stringify(DEFAULT_DATA.clubs); }catch(_){ return true; }
}
function hmSetupItems(){
  const P=STATE.profile||{};
  return [
    { done:!!String(P.handicap||'').trim(), t:'Your Handicap Index', go:`hmGo('setup','profile')` },
    { done:hmBagIsYours(), t:'Your clubs and distances', go:`hmGo('setup','specs')` },
    { done:(STATE.courses||[]).some(c=>(c.holes||[]).some(h=>h.geo)), t:'A course you play, with its map', go:`hmGo('gameplan','gpcourses')` }
  ];
}
function hmFirstName(){ const n=String((STATE.profile||{}).name||'').trim(); return n ? n.split(/\s+/)[0] : ''; }
function hmGreeting(){
  const h=new Date().getHours(), part = h<5 ? 'evening' : h<12 ? 'morning' : h<18 ? 'afternoon' : 'evening';
  const n=hmFirstName();
  return `Good ${part}${n?', '+escapeHtml(n):''}`;
}

/* ---------------- NEXT: one line ---------------- */
function hmNext(){
  const setup=hmSetupItems().filter(x=>!x.done);
  if(setup.length) return { k:'Set up', t:setup[0].t, sub:`${3-setup.length} of 3 done`, go:setup[0].go };
  const C=hmCourse();
  if(C && typeof pmPlans==='function'){
    const pl=pmPlans()[pmCourseKey(C.c)], R=hmRounds(), last=R[R.length-1];
    const fresh = pl && (!last || (pl.madeAt||0) > (last.startedAt||0));
    if(fresh){
      const t=(typeof pmPlanTotal==='function')?pmPlanTotal(pl):null;
      return { k:'Your plan', t:C.c.name, sub:t&&t.n?`plays ${t.exp.toFixed(1)}`:'', go:`hmPlanRound(${C.i})` };
    }
    if(!pl){
      const n=(typeof stratAimsCount==='function')?stratAimsCount(C.c):0;
      return { k:'Plan', t:C.c.name, sub:n?`${n} hole${n===1?'':'s'} drawn`:'drag your shots on each hole', go:`hmOverlay(${C.i})` };
    }
  }
  const P=STATE.practicePlan;
  if(P && !P.draft && P.sessions && P.sessions.length){
    const i=P.sessions.findIndex(s=>!s.done);
    if(i>=0){ const S=P.sessions[i], min=S.blocks.reduce((a,b)=>a+b.min,0);
      return { k:'Practice', t:S.blocks[0]?S.blocks[0].label:'Session', sub:`${min} min · session ${i+1} of ${P.sessions.length}`, go:`hmPost('all',null,'Practice plan')` }; }
  }
  return null;
}
function hmPlanRound(i){ window.pmSetupSel=Object.assign({}, window.pmSetupSel||{}, {c:i}); pmOpen(); pmPlanOpen(); }

/* ---------------- THE NUMBERS: one muted line ---------------- */
function hmStatLine(){
  const fmtI=v=>v<0?`+${Math.abs(v).toFixed(1)}`:v.toFixed(1);
  const bits=[];
  let idx=null; try{ const E=rdIndexEst(); if(E.est!=null) idx=fmtI(E.est); }catch(_){}
  if(idx==null){ const h=String((STATE.profile||{}).handicap||'').trim(); if(h) idx=h; }
  if(idx!=null) bits.push(`Index <b>${escapeHtml(idx)}</b>`);
  const R=hmRounds();
  if(R.length && typeof rdRound==='function'){
    const bench=(typeof esCmp==='function')?esCmp():{hcp:0};
    const d=rdRound(R[R.length-1], bench);
    if(d.per18) bits.push(`Last round <b class="${d.per18.total<0?'neg':''}">${rdSg(d.per18.total)}</b> SG`);
  }
  return bits.length ? `<button type="button" class="hm2-stat" onclick="hmPost('all')">${bits.join('<span>·</span>')}</button>` : '';
}

/* ---------------- THE PAGE ---------------- */
function buildHome(){
  const w=document.getElementById('home-wrap'); if(!w) return;
  const r=(typeof pmRound==='function')?pmRound():null;
  let play;
  if(r){
    const hs=pmHoles(), h=hs[Math.min(r.cur,hs.length-1)], t=pmTotals();
    play=`<button type="button" class="hm2-play live" onclick="pmOpen()">
        <span class="hm2-play-k"><span class="pm-dot"></span>Round in progress</span>
        <span class="hm2-play-t">Resume</span>
        <span class="hm2-play-d">Hole ${h?pmHoleNum(h,r.cur):''}${t&&t.played?` · ${pmFmtToPar(t.toPar)}`:''} · ${escapeHtml(r.courseName||'')}</span></button>`;
  } else {
    play=`<button type="button" class="hm2-play" onclick="pmOpen()">
        <span class="hm2-play-k">On the course</span>
        <span class="hm2-play-t">Play golf <span class="hm2-arrow">→</span></span>
        <span class="hm2-play-d">Distances, the hole, your card</span></button>`;
  }
  const locked=!!(r&&r.tournament&&r.tournament.on);
  let next=null; try{ next=hmNext(); }catch(e){ console.error(e); }
  const nextHTML = (!r && next) ? `<button type="button" class="hm2-next" onclick="${next.go}">
      <span class="hm2-next-k">${next.k}</span>
      <span class="hm2-next-t">${escapeHtml(next.t)}${next.sub?`<small>${escapeHtml(next.sub)}</small>`:''}</span>
      <span class="hm2-chev" aria-hidden="true">›</span></button>` : '';
  let stat=''; try{ stat=hmStatLine(); }catch(e){ console.error(e); }
  w.innerHTML=`<div class="hm2">
      <div class="hm2-hello">${hmGreeting()}<span>${new Date().toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}</span></div>
      ${play}
      ${locked?'':`<button type="button" class="hm2-sim" onclick="simOpen()">Sim golf <span>TrackMan sessions and bay games</span><span class="hm2-chev" aria-hidden="true">›</span></button>`}
      ${nextHTML}
      ${stat}
      <nav class="hm2-ways" aria-label="The rest of the app">
        <button type="button" onclick="hmGo('gameplan','gameplan')"><b>Prepare</b><span>Plan holes</span></button>
        <button type="button" onclick="hmPost('round')"><b>Review</b><span>Your rounds</span></button>
        <button type="button" onclick="hmPost('all',null,'Practice plan')"><b>Improve</b><span>Practice</span></button>
      </nav>
    </div>`;
}

Object.assign(window, { goHome, hmGo, hmPost, hmOverlay, hmRounds, hmCourse, hmBagIsYours, hmSetupItems, hmFirstName, hmGreeting,
  hmNext, hmPlanRound, hmStatLine, buildHome });
