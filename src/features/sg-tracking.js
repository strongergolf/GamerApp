// Scenario calculator, round logging (vertical scorecard), SG averages + trend + sparkline.

function sgScenario(){
  const out=document.getElementById('sg-scen-out'); if(!out) return;
  const lie=document.getElementById('sg-scen-lie').value;
  const dist=parseFloat(document.getElementById('sg-scen-dist').value)||0;
  const hcp=parseHcp(document.getElementById('sg-scen-hcp').value);
  const unit=lie==='green'?'ft':'yd';
  if(!dist){out.innerHTML='<span style="color:var(--muted);font-style:italic">Enter a distance above.</span>';return;}
  const sr=srForPlayer(lie,dist,hcp);
  if(sr==null){out.innerHTML='<span style="color:var(--muted);font-style:italic">Outside table range.</span>';return;}

  /* find closest club from bag (only for non-green lies) */
  let clubHint='';
  if(lie!=='green'){
    const factor=carryFactor();
    let best=null,bestDiff=999;
    STATE.clubs.forEach(c=>{
      const p=perf(c.id); if(!p.carry)return;
      const adjCarryVal=Math.round(p.carry*factor);
      const diff=Math.abs(adjCarryVal-dist);
      if(diff<bestDiff){bestDiff=diff;best={c,p,adjCarryVal};}
    });
    if(best){
      clubHint=`<div class="sg-hint">Suggested club: <b>${best.c.label} (${best.c.loft})</b> · carries ${best.adjCarryVal} yd · ${bestDiff<=4?'on target':'±'+bestDiff+' yd from target'}</div>`;
      /* SG of an average shot with that club */
      const dispYd=getDispersion(best.p.carry);
      const srAfter=srForPlayer('green', dispYd<=5?18:dispYd<=10?30:50, hcp);
      const sg=(sr-srAfter-1);
      clubHint+=`<div class="sg-hint">Expected SG this shot: <b style="color:${sg>=0?'var(--green)':'var(--gold)'}">${sg>=0?'+':''}${sg.toFixed(2)}</b> (avg carry lands ~${dispYd.toFixed(0)} yd off target → ${(dispYd*3).toFixed(0)}ft putt)</div>`;
    }
  }

  out.innerHTML=`
    <div class="sg-result">
      <div class="sg-result-num">${sr.toFixed(2)}</div>
      <div class="sg-result-label">expected strokes to hole out</div>
      <div class="sg-result-sub">${dist}${unit} · ${lie} · ${hcp>0?hcp+' hcp':hcp<0?'+'+Math.abs(hcp)+' hcp':'scratch'}</div>
    </div>
    ${clubHint}`;
}

/* Add a round to the tracker */
function sgUpdateTotals(){
  const sumRow=(prefix,start,end)=>Array.from({length:end-start+1},(_,i)=>parseInt(document.getElementById(`${prefix}${start+i}`)?.value)||0).reduce((a,b)=>a+b,0);
  const sumSG=(prefix,start,end)=>Array.from({length:end-start+1},(_,i)=>parseFloat(document.getElementById(`${prefix}${start+i}`)?.value)||0).reduce((a,b)=>a+b,0);
  const anyRow=(prefix,start,end)=>Array.from({length:end-start+1},(_,i)=>document.getElementById(`${prefix}${start+i}`)?.value||null).some(v=>v!==null&&v!=='');
  const setEl=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  const fmtSG=v=>v===0?'0':(v>0?'+':'')+v.toFixed(1);
  ['par','sc','putts'].forEach(row=>{
    const out=sumRow(`sg-${row}-`,1,9), inn=sumRow(`sg-${row}-`,10,18);
    setEl(`sg-tot-${row}-out`, anyRow(`sg-${row}-`,1,9)?out:'—');
    setEl(`sg-tot-${row}-in`,  anyRow(`sg-${row}-`,10,18)?inn:'—');
    setEl(`sg-tot-${row}-all`, anyRow(`sg-${row}-`,1,18)?(out+inn):'—');
  });
  /* SG rows */
  ['ott','app','atg','putt'].forEach(cat=>{
    const out=sumSG(`sg-h-${cat}-`,1,9), inn=sumSG(`sg-h-${cat}-`,10,18);
    const anyOut=anyRow(`sg-h-${cat}-`,1,9), anyIn=anyRow(`sg-h-${cat}-`,10,18);
    setEl(`sg-tot-h-${cat}-out`, anyOut?fmtSG(out):'—');
    setEl(`sg-tot-h-${cat}-in`,  anyIn?fmtSG(inn):'—');
    setEl(`sg-tot-h-${cat}-all`, (anyOut||anyIn)?fmtSG(out+inn):'—');
  });
  /* FIR */
  const firHits=Array.from({length:18},(_,i)=>document.getElementById(`sg-fir-${i+1}`)?.value==='H'?1:0).reduce((a,b)=>a+b,0);
  const firTotal=Array.from({length:18},(_,i)=>document.getElementById(`sg-fir-${i+1}`)?.value||'').filter(v=>v!=='').length;
  setEl('sg-tot-fir', firTotal?`${firHits}/${firTotal} FIR`:'—');
  /* GIR */
  const girHits=Array.from({length:18},(_,i)=>document.getElementById(`sg-gir-${i+1}`)?.checked?1:0).reduce((a,b)=>a+b,0);
  setEl('sg-tot-gir', `${girHits}/18 GIR`);
}
function sgAddRound(){
  const gv=id=>document.getElementById(id)?.value||'';
  const nv=id=>parseFloat(document.getElementById(id)?.value)||null;
  const bv=id=>document.getElementById(id)?.checked||false;
  const sgCats=['ott','app','atg','putt'];
  const holes=[];
  for(let h=1;h<=18;h++){
    const par=parseInt(document.getElementById(`sg-par-${h}`)?.value)||null;
    const score=parseInt(document.getElementById(`sg-sc-${h}`)?.value)||null;
    const fir=document.getElementById(`sg-fir-${h}`)?.value||'';
    const gir=document.getElementById(`sg-gir-${h}`)?.checked||false;
    const putts=parseInt(document.getElementById(`sg-putts-${h}`)?.value)||null;
    const sg={};
    sgCats.forEach(cat=>{const v=parseFloat(document.getElementById(`sg-h-${cat}-${h}`)?.value); if(!isNaN(v)) sg[cat]=v;});
    holes.push({par,score,fir,gir,putts,sg});
  }
  /* derive category SG totals from hole data */
  const catTotal=cat=>{const vals=holes.map(h=>h.sg[cat]).filter(v=>v!=null);return vals.length?parseFloat(vals.reduce((a,b)=>a+b,0).toFixed(2)):null;};
  const gross=holes.reduce((a,h)=>a+(h.score||0),0)||null;
  const r={
    id:Date.now(),
    date:gv('sg-date')||new Date().toISOString().slice(0,10),
    course:gv('sg-course'),
    tee:gv('sg-tee'),
    tournament:bv('sg-tournament'),
    gross,
    holes,
    ott:catTotal('ott'), app:catTotal('app'),
    atg:catTotal('atg'), putt:catTotal('putt'),
    notes:gv('sg-rnotes')
  };
  STATE.scoring.rounds.unshift(r);
  saveState();
  sgRefreshRounds();
  /* clear all fields */
  ['sg-course','sg-tee','sg-rnotes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const tc=document.getElementById('sg-tournament');if(tc)tc.checked=false;
  for(let h=1;h<=18;h++){
    ['sg-par-','sg-sc-','sg-putts-'].forEach(p=>{const el=document.getElementById(p+h);if(el)el.value='';});
    sgCats.forEach(cat=>{const el=document.getElementById(`sg-h-${cat}-${h}`);if(el)el.value='';});
    const fEl=document.getElementById('sg-fir-'+h);if(fEl)fEl.value='';
    const gEl=document.getElementById('sg-gir-'+h);if(gEl)gEl.checked=false;
  }
  toast('Round saved');
}
function sgDeleteRound(id){
  STATE.scoring.rounds=STATE.scoring.rounds.filter(r=>r.id!==id);
  saveState(); sgRefreshRounds(); toast('Round removed');
}
function sgRefreshRounds(){
  const smry=document.getElementById('sg-summary'); if(smry) smry.innerHTML=sgSummaryHtml();
  const tbl=document.getElementById('sg-rounds');   if(tbl)  tbl.innerHTML=sgRoundsHtml();
}
/* Scoring benchmarks — where you sit vs scratch and vs your goal handicap.
   Uses Broadie's relationship that average score ≈ par + handicap + ~2.5. */
function scoringBenchmarkHtml(){
  const pf=STATE.profile||{};
  const par=72;
  const num=v=>{ if(v===''||v==null) return null; const n=parseFloat(v); return isNaN(n)?null:n; };
  const expAvg=h=>par+h+2.5;                 // a handicap-h player's typical score
  const hcpRaw=pf.handicap; const hcp=parseHcp(hcpRaw);
  /* the goal handicap reads like the handicap: "+6" is a plus six (six better than scratch), not 6 */
  const goal=(pf.goalHcp==null||String(pf.goalHcp).trim()==='')?null:parseHcp(pf.goalHcp);
  const yourAvg = num(pf.scoringAvg)!=null ? num(pf.scoringAvg)
                : (hcpRaw!=null&&String(hcpRaw).trim()!=='' ? expAvg(hcp) : null);
  if(yourAvg==null) return `<div class="lvl-soon-note" style="margin:0">Add a scoring average or handicap, and a goal handicap, in <strong>Locker Room → Myself → Typical Round Baselines</strong> to see your scoring benchmarks.</div>`;
  const scratchAvg=expAvg(0);
  const goalAvg=goal!=null?expAvg(goal):null;
  const toGoal = goalAvg!=null ? +(yourAvg-goalAvg).toFixed(1) : null;
  /* scale spans scratch → you (+headroom) */
  const lo=Math.min(scratchAvg,goalAvg??scratchAvg)-1;
  const hi=Math.max(yourAvg,scratchAvg)+1.5;
  const pct=v=>Math.max(0,Math.min(100,((v-lo)/(hi-lo))*100));
  const mark=(v,label,col,below)=>`<div style="position:absolute;left:${pct(v).toFixed(1)}%;top:0;transform:translateX(-50%);text-align:center">
      <div style="font-family:ui-monospace,monospace;font-size:.58rem;font-weight:700;color:${col};white-space:nowrap;${below?'order:2;margin-top:2px':'margin-bottom:2px'}">${label}</div>
      <div style="width:2px;height:34px;background:${col};margin:0 auto"></div>
    </div>`;
  const card=(big,small,col)=>`<div style="flex:1;min-width:74px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-top:3px solid ${col};border-radius:7px;padding:8px 6px">
      <div style="font-family:Arial,sans-serif;font-size:1.3rem;font-weight:800;color:${col};line-height:1">${big}</div>
      <div style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);letter-spacing:.04em;margin-top:3px">${small}</div></div>`;
  const goalCard=goalAvg!=null?card(goalAvg.toFixed(1),'goal avg ('+(goal>=0?goal:'+'+Math.abs(goal))+' hcp)','var(--green)'):card('—','set a goal hcp','var(--muted)');
  return `<div style="display:flex;gap:8px;margin-bottom:12px">
      ${card(scratchAvg.toFixed(1),'scratch avg','var(--sky,#1a5aaa)')}
      ${card(yourAvg.toFixed(1),num(pf.scoringAvg)!=null?'your avg':'your avg (est)','var(--ink2)')}
      ${goalCard}
    </div>
    <div style="position:relative;height:52px;margin:2px 4px 8px">
      <div style="position:absolute;left:0;right:0;top:24px;height:3px;background:var(--border);border-radius:3px"></div>
      ${mark(scratchAvg,'scratch','var(--sky,#1a5aaa)',false)}
      ${goalAvg!=null?mark(goalAvg,'goal','var(--green)',true):''}
      ${mark(yourAvg,'you','var(--ink2)',false)}
    </div>
    ${toGoal!=null?`<div style="font-family:Arial,sans-serif;font-size:.84rem;color:var(--muted);text-align:center">${toGoal>0?`<b style="color:var(--ink2)">${toGoal}</b> strokes between you and your goal — the SG categories above show where they hide.`:`<b style="color:var(--green)">At or past your goal</b> — set a tougher target.`}</div>`:''}`;
}
/* ============================================================
   ONE STROKES-GAINED LOG
   ============================================================
   Two kinds of round reach this page, and they used to live apart: rounds PLAYED in the app
   (Play), where strokes gained is measured shot by shot from where each shot was played, and
   rounds LOGGED here by hand, with a category total typed per hole. Post-Round's All rounds
   read only the first, this page only the second, so the two could tell different stories.
   sgLog() is now the one list both draw on:
     play    every saved Play round with shots logged, re-read on the CURRENT benchmark
             (Settings) and put per 18 holes, exactly as the All rounds dashboard reads it;
     manual  the rounds entered here, as entered.
   A hand-logged round on the same date and course as a Play round is the same round entered
   twice, and the Play one (measured, not typed) is kept.
   The averages and the diamond lead with Play rounds whenever there are any, because a
   measured number and a typed one are not the same thing to average together; the typed ones
   are still shown, labelled, as their own shape. Gross scores mean the same thing either way,
   so the score trend and the table use both. */
function sgLog(){
  const out=[];
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  const seen=new Set();
  if(typeof rdAll==='function' && typeof rdRound==='function'){
    rdAll().forEach(r=>{
      const d=rdRound(r, bench), date=new Date(r.startedAt||r.endedAt||0).toISOString().slice(0,10);
      seen.add(date+'|'+String(r.courseName||'').toLowerCase());
      const t=r.totals||{};
      out.push({ src:'play', id:r.id, date, course:r.courseName||'', tee:r.tee||'', tournament:!!r.tournament,
                 gross:(t.played===18&&t.strokes)?t.strokes:null, holes:t.played||0,
                 ott:d.per18?d.per18.ott:null, app:d.per18?d.per18.app:null, atg:d.per18?d.per18.arg:null, putt:d.per18?d.per18.putt:null,
                 sgHoles:d.sgHoles, bench:bench.short });
    });
  }
  ((STATE.scoring&&STATE.scoring.rounds)||[]).forEach(r=>{
    if(seen.has(String(r.date)+'|'+String(r.course||'').toLowerCase())) return;
    out.push(Object.assign({src:'manual'}, r));
  });
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function sgHasSG(r){ return r.ott!=null||r.app!=null||r.atg!=null||r.putt!=null; }
/* the rounds the averages and the diamond lead with: Play when there are any, else hand-logged */
function sgLead(){
  const L=sgLog().filter(sgHasSG), play=L.filter(r=>r.src==='play');
  return play.length ? {lead:play, other:L.filter(r=>r.src==='manual'), src:'play'} : {lead:L, other:[], src:'manual'};
}
function sgSummaryHtml(){
  const S=sgLead(), rs=S.lead;
  if(!rs.length) return `<p class="lvl-soon-note" style="margin:0">No rounds with strokes gained yet. Play one (\u25b6 Play, top right) and log each shot, or add one below.</p>`;
  const avg=key=>{const vals=rs.map(r=>r[key]).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;};
  const trend=key=>{
    const all=rs.map(r=>r[key]).filter(v=>v!=null);
    if(all.length<3) return null;
    const recent=all.slice(0,Math.min(5,all.length));
    return recent.reduce((a,b)=>a+b,0)/recent.length - all.reduce((a,b)=>a+b,0)/all.length;
  };
  const fmt=v=>v==null?'—':(v>=0?'+':'')+v.toFixed(2);
  const col=v=>v==null?'var(--muted)':v>=0?'var(--green)':'var(--gold)';
  /* Gross sparkline */
  const grossRounds=sgLog().filter(r=>r.gross).slice(0,10).reverse();
  let sparkline='';
  if(grossRounds.length>1){
    const scores=grossRounds.map(r=>r.gross);
    const mn=Math.min(...scores),mx=Math.max(...scores),rng=mx-mn||1;
    const W=140,H=30;
    const pts=scores.map((s,i)=>`${((i/(scores.length-1))*W).toFixed(1)},${(H-((s-mn)/rng)*(H-6)-3).toFixed(1)}`).join(' ');
    const lastX=((scores.length-1)/(scores.length-1)*W).toFixed(1);
    const lastY=(H-((scores[scores.length-1]-mn)/rng)*(H-6)-3).toFixed(1);
    sparkline=`<div style="margin-bottom:14px;padding:10px 12px;background:var(--bg2);border-radius:8px">
      <div style="font-family:'Arial Narrow',Arial,sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Gross Score — last ${scores.length} rounds</div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible">
        <polyline points="${pts}" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        ${scores.map((s,i)=>{const x=((i/(scores.length-1))*W).toFixed(1);const y=(H-((s-mn)/rng)*(H-6)-3).toFixed(1);const last=i===scores.length-1;
          return `<circle cx="${x}" cy="${y}" r="${last?3.5:2}" fill="${last?'var(--green)':'rgba(0,133,63,.35)'}"/>
          ${last?`<text x="${x}" y="${parseFloat(y)-7}" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="var(--green)">${s}</text>`:''}`;
        }).join('')}
      </svg>
    </div>`;
  }
  const cats=[['ott','Off Tee','var(--sky)'],['app','Approach','var(--green)'],['atg','Around Green','var(--gold)'],['putt','Putting','var(--grey)']];
  const rows=cats.map(([k,l,color])=>{
    const v=avg(k), t=trend(k);
    const arrow=t==null?'':t>0.05?'▲':t<-0.05?'▼':'→';
    const arrowCol=t==null?'':t>0.05?'var(--green)':t<-0.05?'var(--gold)':'var(--muted)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:700;font-size:.88rem;color:${color};flex:1">${l}</span>
      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:800;font-size:1.1rem;color:${col(v)};min-width:48px;text-align:right">${fmt(v)}</span>
      <span style="font-size:.88rem;color:${arrowCol};min-width:16px;text-align:center">${arrow}</span>
      <span style="font-family:Arial,sans-serif;font-size:.6rem;color:var(--muted);min-width:60px">${t!=null?`${t>=0?'+':''}${t.toFixed(2)} recent`:''}</span>
    </div>`;
  }).join('');
  const total=[avg('ott'),avg('app'),avg('atg'),avg('putt')].filter(v=>v!=null).reduce((a,b)=>a+b,0);
  const srcNote = S.src==='play'
    ? `${rs.length} round${rs.length!==1?'s':''} played in the app, shot by shot, vs ${escapeHtml(rs[0].bench||'scratch')}, per 18${S.other.length?` \u00b7 ${S.other.length} logged by hand shown dashed on the diamond`:''}`
    : `${rs.length} round${rs.length!==1?'s':''} logged by hand`;
  return `<div>${sparkline}<div style="font-family:Arial,sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">${srcNote} · ▲/▼ = 5-round trend</div>${rows}
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;margin-top:4px">
      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:800;font-size:.88rem;color:var(--ink);flex:1">Total SG</span>
      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:800;font-size:1.2rem;color:${col(total)}">${fmt(total)}</span>
    </div></div>`;
}
function sgRoundsHtml(){
  const rs=sgLog();
  if(!rs.length) return '';
  const fmt=v=>v==null?'—':(v>=0?'<span style="color:var(--green)">+'+v.toFixed(2)+'</span>':'<span style="color:var(--gold)">'+v.toFixed(2)+'</span>');
  return `<div class="sg-table-scroll"><table class="sg-table">
    <thead><tr><th>Date</th><th>Course</th><th>Tee</th><th>T</th><th>OTT</th><th>APP</th><th>ATG</th><th>PUTT</th><th>Gross</th><th></th></tr></thead>
    <tbody>${rs.slice(0,40).map(r=>`<tr>
      <td style="font-family:ui-monospace,monospace;font-size:.6rem">${r.date}</td>
      <td style="font-size:.75rem;color:var(--ink2)">${escapeHtml(r.course||'—')}${r.src==='play'?' <span class="sg-src">Play</span>':''}</td>
      <td style="font-size:.65rem;color:var(--muted)">${r.tee||'—'}</td>
      <td style="font-size:.8rem">${r.tournament?'🏆':''}</td>
      <td>${fmt(r.ott)}</td><td>${fmt(r.app)}</td><td>${fmt(r.atg)}</td><td>${fmt(r.putt)}</td>
      <td style="font-family:Arial,sans-serif;font-weight:700;font-size:1rem">${r.gross||'—'}</td>
      <td>${r.src==='manual'?`<button onclick="sgDeleteRound(${r.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.7rem;padding:2px 6px">✕</button>`:''}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { sgLog, sgLead, sgHasSG, sgAddRound, sgDeleteRound, sgRefreshRounds, sgRoundsHtml, sgScenario, sgSummaryHtml, sgUpdateTotals, scoringBenchmarkHtml });

/* ============================================================
   IMPORTING ROUNDS FROM ELSEWHERE

   WHAT IS ACTUALLY POSSIBLE, checked rather than assumed (Sept 2026):
     • 18Birdies   — no CSV/Excel export at all; their own help centre says so. A GDPR /
                      CCPA data-portability request is the only way the data comes out.
     • Garmin Golf — no scorecard export in the app; only a whole-account personal-data
                      request. (The R10 launch monitor is the exception and does export CSV.)
     • Arccos      — no official export, but an API that community tools already read.
     • Trackman    — a real, documented Data API with CSV distribution, but it is a partner
                      integration, not something a golfer can self-serve.
     • Shot Scope / TheGrint — could not confirm either way; treat as unknown.

   So almost nothing offers a self-serve feed a browser could subscribe to, and this app has
   no server to hold API credentials or take a webhook. What every one of them CAN produce,
   one way or another, is a file. So the file is the interface: bring whatever you can get out
   — an export, a data-portability dump, a spreadsheet you keep yourself — and this reads it.
   The column names differ per service, so it sniffs rather than demanding a fixed format.
   ============================================================ */
const RD_ALIASES = {
  date:   ['date','round date','played','play date','datetime','start time','teetime','tee time'],
  course: ['course','course name','club','venue','facility'],
  gross:  ['score','gross','total','total score','gross score','strokes'],
  holes:  ['holes','hole count','holes played'],
  fir:    ['fir','fairways','fairways hit','fw','fairway hit','fairways hit %','fir %','driving accuracy'],
  firOf:  ['fairway opportunities','possible fairways','fairways possible','fw att'],
  gir:    ['gir','greens','greens in regulation','greens hit','gir %','greens in reg'],
  putts:  ['putts','total putts','putt','number of putts','putts per round'],
  ud:     ['up and down','up & down','up-and-down','scrambling','scramble','up/down','scrambling %','up and down %']
};
function rdNorm(s){ return String(s||'').trim().toLowerCase().replace(/[_\s]+/g,' ').replace(/["']/g,''); }
/* Split one CSV line, honouring quotes and doubled quotes inside them. */
function rdSplit(line){
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(q){
      if(ch==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else q=false; }
      else cur+=ch;
    } else if(ch==='"'){ q=true; }
    else if(ch===','){ out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur); return out;
}
/* Map this file's header row onto the fields we understand. Anything unrecognised is ignored
   rather than guessed at — a wrong column silently feeding the skill model is worse than a
   missing one, because the app would go on stating a number nobody could account for. */
function rdMapHeader(cells){
  const map={};
  cells.forEach((c,i)=>{
    const n=rdNorm(c);
    Object.keys(RD_ALIASES).forEach(k=>{ if(map[k]==null && RD_ALIASES[k].indexOf(n)>-1) map[k]=i; });
  });
  return map;
}
function rdNum(v){
  if(v==null) return null;
  const m=String(v).replace(/[%\s]/g,'').match(/-?\d+(\.\d+)?/);
  return m?parseFloat(m[0]):null;
}
/* COUNT OR PERCENTAGE? Both turn up, and getting it wrong is not cosmetic: a GIR column
   reading "11" out of 18 holes is 61%, but taken at face value it sets the model to an 11%
   GIR and every expected-strokes figure in the app shifts behind it. The rule: a bare number
   no larger than the opportunities is a COUNT; anything above that, or carrying a % sign, is
   already a percentage; "8/14" is explicit. 0.57 is a fraction. Where a service states its own
   opportunities column, that wins over any assumption.
   The one real assumption is fairway opportunities when no column gives them — 14 in a round
   of 18, the usual number of par 4s and 5s. Stated here rather than buried. */
function rdOpportunities(kind, holes){
  const h=holes||18;
  return kind==='fir' ? Math.max(1,Math.round(h*14/18)) : h;
}
function rdPct(raw, kind, holes, explicitOf){
  if(raw==null||String(raw).trim()==='') return null;
  const txt=String(raw);
  if(/\//.test(txt)){ const p=txt.split('/').map(rdNum); if(p[1]) return (p[0]/p[1])*100; }
  const n=rdNum(txt); if(n==null) return null;
  if(/%/.test(txt)) return n;                              /* said so itself */
  if(n>0 && n<=1.0001) return n*100;                       /* a fraction */
  const of = explicitOf!=null ? explicitOf : rdOpportunities(kind, holes);
  return (n<=of) ? (n/of)*100 : n;                         /* count vs already-a-percentage */
}
function rdParseCsv(text){
  const lines=text.replace(/^\ufeff/,'').split(/\r?\n/).filter(l=>l.trim()!=='');
  if(lines.length<2) return {rows:[], map:{}, headers:[]};
  const headers=rdSplit(lines[0]);
  const map=rdMapHeader(headers);
  const at=(cells,k)=>map[k]==null?null:cells[map[k]];
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const c=rdSplit(lines[i]);
    const holes=rdNum(at(c,'holes'))||18;
    const firOf=rdNum(at(c,'firOf'));
    const r={
      id:'imp'+Date.now()+'_'+i,
      date:(at(c,'date')||'').trim().slice(0,10),
      course:(at(c,'course')||'').trim(),
      gross:rdNum(at(c,'gross')),
      holes:holes,
      firPct:rdPct(at(c,'fir'),'fir',holes,firOf),
      girPct:rdPct(at(c,'gir'),'gir',holes,null),
      putts:rdNum(at(c,'putts')),
      udPct:rdPct(at(c,'ud'),'ud',holes,null),
      imported:true
    };
    if(r.gross!=null||r.putts!=null||r.girPct!=null) rows.push(r);
  }
  return {rows, map, headers};
}
/* Averaging the imported rounds into the four Typical Round Stats is the whole point: those
   feed effHcpForLie, which sets the skill the app models the golfer at everywhere. An import
   that only stored rounds would be a filing cabinet. */
function rdAverages(rows){
  const avg=k=>{ const v=rows.map(r=>r[k]).filter(x=>x!=null&&!isNaN(x)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  return { firPct:avg('firPct'), girPct:avg('girPct'), puttsRound:avg('putts'), scoringAvg:avg('gross'), upDownPct:avg('udPct') };
}
window.rdPending = null;
function rdPickFile(){ const el=document.getElementById('import-file-rounds'); if(el) el.click(); }
function rdReadFile(e){
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const parsed=rdParseCsv(String(r.result));
      if(!parsed.rows.length){
        window.rdPending={error:'Nothing readable in that file.', headers:parsed.headers};
      } else {
        window.rdPending={file:f.name, rows:parsed.rows, map:parsed.map, headers:parsed.headers, avg:rdAverages(parsed.rows)};
      }
    }catch(err){ window.rdPending={error:'Could not read that file.'}; }
    buildImport();
  };
  r.readAsText(f); e.target.value='';
}
function rdCancel(){ window.rdPending=null; buildImport(); }
/* Commit: rounds are stored, and the averages become the profile's round stats — which is
   what makes them reach the model. Provenance moves to Captured for the stats that came from
   real posted rounds rather than a typed estimate. */
function rdCommit(){
  const P=window.rdPending; if(!P||!P.rows) return;
  STATE.scoring=STATE.scoring||{rounds:[]}; STATE.scoring.rounds=STATE.scoring.rounds||[];
  const seen=new Set(STATE.scoring.rounds.map(r=>[r.date,r.course,r.gross].join('|')));
  let added=0;
  P.rows.forEach(r=>{ const k=[r.date,r.course,r.gross].join('|'); if(!seen.has(k)){ STATE.scoring.rounds.unshift(r); seen.add(k); added++; } });
  const a=P.avg, pf=STATE.profile;
  const put=(k,v,dp)=>{ if(v!=null&&!isNaN(v)) pf[k]=String(Math.round(v*Math.pow(10,dp))/Math.pow(10,dp)); };
  put('firPct',a.firPct,0); put('girPct',a.girPct,0); put('puttsRound',a.puttsRound,1);
  put('scoringAvg',a.scoringAvg,1); put('upDownPct',a.upDownPct,0);
  pf.statsSource='imported'; pf.statsRounds=(STATE.scoring.rounds||[]).length; pf.statsImportedAt=new Date().toISOString().slice(0,10);
  window.rdPending=null; saveState();
  if(typeof refreshAll==='function') refreshAll(); else buildImport();
  if(typeof toast==='function') toast(added+' round'+(added===1?'':'s')+' imported \u2014 round stats updated');
}
const RD_SERVICES = [
  ['Trackman','Range and course sessions. A documented data API exists but it is a partner integration \u2014 export a session to CSV and bring the file.'],
  ['Arccos','No official export; community tools read its API and write CSV.'],
  ['Shot Scope','Check the web dashboard for a round export.'],
  ['Garmin Golf','No scorecard export in the app \u2014 use Garmin\u2019s personal-data request. (The R10 launch monitor does export CSV.)'],
  ['18Birdies','No CSV export; a data-portability request is the only route.'],
  ['TheGrint','Check the web account for a round export.'],
  ['Your own spreadsheet','Any CSV with date, score, fairways, greens, putts columns.']
];
function buildImport(){
  const wrap=document.getElementById('import-wrap'); if(!wrap) return;
  const P=window.rdPending;
  const pf=STATE.profile||{};
  const n=((STATE.scoring||{}).rounds||[]).length;
  const got=k=>P&&P.map&&P.map[k]!=null;
  const one=(lbl,v,dp)=>`<div class="stat-cell"><div class="stat-label">${lbl}</div><div class="stat-value">${
    v==null||isNaN(v)?'\u2014':(Math.round(v*Math.pow(10,dp))/Math.pow(10,dp))}</div></div>`;
  let panel='';
  if(P&&P.error){
    panel=`<div class="rd-panel err"><b>${escapeHtml(P.error)}</b>
      ${P.headers&&P.headers.length?`<div class="rd-cols">Columns found: ${P.headers.map(x=>escapeHtml(x)).join(' \u00b7 ')}</div>`:''}
      <div class="btn-row"><button class="btn" onclick="rdCancel()">Close</button></div></div>`;
  } else if(P){
    const miss=['date','gross','fir','gir','putts','ud'].filter(k=>!got(k));
    panel=`<div class="rd-panel">
      <b>${escapeHtml(P.file)}</b> \u2014 ${P.rows.length} round${P.rows.length===1?'':'s'} read.
      <div class="detail-stats" style="margin-top:8px">
        ${one('Scoring avg',P.avg.scoringAvg,1)}${one('Fairways %',P.avg.firPct,0)}
        ${one('GIR %',P.avg.girPct,0)}${one('Putts',P.avg.puttsRound,1)}${one('Up &amp; down %',P.avg.upDownPct,0)}
      </div>
      ${miss.length?`<div class="rd-cols">No column matched: ${miss.join(', ')} \u2014 those stats stay as they are.</div>`:''}
      <p class="gen-note" style="margin:8px 0 0">Importing stores the rounds and sets your Typical Round Stats to these averages, which is what makes them reach the model.</p>
      <div class="btn-row"><button class="btn btn-primary" onclick="rdCommit()">Import ${P.rows.length}</button><button class="btn" onclick="rdCancel()">Cancel</button></div>
    </div>`;
  }
  wrap.innerHTML=`<div class="profile-card">
    <h3>Rounds &amp; Sessions <span class="card-sub">bring your scoring data in from wherever you track it</span></h3>
    <p class="gen-note">Drop in a CSV of your rounds and StrongerGolf reads the columns it recognises, stores the rounds, and sets your Typical Round Stats from their averages \u2014 which is what drives &ldquo;Shots Expected&rdquo;, strokes gained and the Hole Overlay. ${
      n?`<b>${n}</b> round${n===1?'':'s'} on file${pf.statsSource==='imported'&&pf.statsImportedAt?`, last import ${pf.statsImportedAt}`:''}.`:'No rounds on file yet.'}</p>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="rdPickFile()">Import rounds (CSV)</button>
      <input type="file" id="import-file-rounds" accept=".csv,text/csv" style="display:none" onchange="rdReadFile(event)">
    </div>
    ${panel}
    <h4 class="mydata-sub">Where the file comes from</h4>
    <p class="gen-note">None of these offer a live feed a browser can subscribe to, and there is no StrongerGolf server to hold credentials or receive one. A file is the interface \u2014 whatever each service will give you.</p>
    <div class="prov-legend">
      ${RD_SERVICES.map(x=>`<div class="prov-legend-item"><b style="color:var(--ink)">${x[0]}</b> \u2014 ${x[1]}</div>`).join('')}
    </div>
  </div>`;
}

Object.assign(window, { RD_ALIASES, RD_SERVICES, rdParseCsv, rdAverages, rdMapHeader, rdSplit, rdPct, rdOpportunities, rdNum, rdNorm, rdPickFile, rdReadFile, rdCancel, rdCommit, buildImport });
