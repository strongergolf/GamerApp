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
function sgSummaryHtml(){
  const rs=STATE.scoring.rounds.filter(r=>r.ott!=null||r.app!=null||r.atg!=null||r.putt!=null);
  if(!rs.length) return `<p class="lvl-soon-note" style="margin:0">No rounds logged yet. Add one below.</p>`;
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
  const grossRounds=STATE.scoring.rounds.filter(r=>r.gross).slice(0,10).reverse();
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
  return `<div>${sparkline}<div style="font-family:Arial,sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">${rs.length} round${rs.length!==1?'s':''} · ▲/▼ = 5-round trend</div>${rows}
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;margin-top:4px">
      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:800;font-size:.88rem;color:var(--ink);flex:1">Total SG</span>
      <span style="font-family:'Arial Narrow',Arial,sans-serif;font-weight:800;font-size:1.2rem;color:${col(total)}">${fmt(total)}</span>
    </div></div>`;
}
function sgRoundsHtml(){
  const rs=STATE.scoring.rounds;
  if(!rs.length) return '';
  const fmt=v=>v==null?'—':(v>=0?'<span style="color:var(--green)">+'+v.toFixed(2)+'</span>':'<span style="color:var(--gold)">'+v.toFixed(2)+'</span>');
  return `<table class="sg-table">
    <thead><tr><th>Date</th><th>Course</th><th>Tee</th><th>T</th><th>OTT</th><th>APP</th><th>ATG</th><th>PUTT</th><th>Gross</th><th></th></tr></thead>
    <tbody>${rs.slice(0,40).map(r=>`<tr>
      <td style="font-family:ui-monospace,monospace;font-size:.6rem">${r.date}</td>
      <td style="font-size:.75rem;color:var(--ink2)">${r.course||'—'}</td>
      <td style="font-size:.65rem;color:var(--muted)">${r.tee||'—'}</td>
      <td style="font-size:.8rem">${r.tournament?'🏆':''}</td>
      <td>${fmt(r.ott)}</td><td>${fmt(r.app)}</td><td>${fmt(r.atg)}</td><td>${fmt(r.putt)}</td>
      <td style="font-family:Arial,sans-serif;font-weight:700;font-size:1rem">${r.gross||'—'}</td>
      <td><button onclick="sgDeleteRound(${r.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.7rem;padding:2px 6px">✕</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { sgAddRound, sgDeleteRound, sgRefreshRounds, sgRoundsHtml, sgScenario, sgSummaryHtml, sgUpdateTotals });
