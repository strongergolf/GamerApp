// features/whs.js — The World Handicap System arithmetic, and the round laid out ready to post.
//
// Golf Canada is the only body that issues an official Handicap Index in Canada, and posting
// happens in its app (or Score Centre). This file does not post anything. It does the parts a
// golfer otherwise does in their head at the car: the Course Handicap for the tees played, the
// most each hole can count for (net double bogey), the adjusted gross score, and the score
// differential that will follow, and it lays the round out hole by hole in the order the
// Golf Canada app asks for it: strokes, putts, penalties, fairway, sand save.
//
// Rules of Handicapping (WHS), as used here:
//   Course Handicap   = Handicap Index x (Slope / 113) + (Course Rating - Par), to the nearest whole
//   strokes per hole  = one per hole down the stroke index (SI 1 first), wrapping past 18; a PLUS
//                       handicap gives strokes BACK, starting at SI 18
//   max per hole      = net double bogey = par + 2 + strokes received on that hole
//   a hole not played = net par (par + strokes received); an 18-hole score needs 14 holes played
//   Score Differential = (113 / Slope) x (Adjusted Gross Score - Course Rating - PCC)
// PCC (the playing conditions calculation) is Golf Canada's to apply after the day's scores
// are in, so the differential here is shown "before PCC". A 9-hole score is Golf Canada's to
// combine with an expected score for the other nine; here it gets its 9-hole Course Handicap
// and adjusted score, from the nine's own rating where the tee has one.

/* "+2" is a plus handicap: two strokes better than scratch, so -2 in the arithmetic */
function whsNum(v){ const t=String(v==null?'':v).trim(); if(!t) return null; const n=parseFloat(t.replace('+','')); return isFinite(n)?(t[0]==='+'?-n:n):null; }
function whsFmtHcp(v){ if(v==null||!isFinite(v)) return '—'; return v<0?`+${Math.abs(v)}`:String(v); }
function whsHI(){ return whsNum(STATE.profile&&STATE.profile.handicap); }
function whsCourse(key){ return (STATE.courses||[]).find(c=>(c.id||c.name)===key)||null; }
function whsTees(c){ return (c && Array.isArray(c.tees)) ? c.tees : []; }
function whsTee(c, name){ const T=whsTees(c); return T.find(t=>t.name===name) || null; }
function whsHoleNum(h,i){ return h.num||i+1; }
function whsPar(c){ return (c.holes||[]).reduce((s,h)=>s+(+h.par||4),0); }
/* WHS rounds to the nearest whole number; a half rounds up (toward the higher handicap) */
function whsRound(x){ return Math.floor(x+0.5); }
function whsCourseHcp(hi, rating, slope, par){
  if(hi==null || !(slope>0) || !(rating>0)) return null;
  return whsRound(hi*(slope/113) + (rating-par));
}
/* strokes received on each hole, by stroke index; null where a hole has no SI */
function whsStrokes(ch, holes){
  const n=holes.length, out=holes.map(()=>0);
  if(ch==null) return out;
  const sis=holes.map(h=>+h.si||null);
  if(sis.some(s=>!s)) return null;
  const k=Math.abs(ch), base=Math.floor(k/n), rem=k%n, sign=ch<0?-1:1;
  /* rank within the holes being scored: on a nine the indexes run to 18, so the hardest of
     the nine is rank 1 whatever its number */
  const order=sis.map((s,i)=>i).sort((a,b)=>sis[a]-sis[b]), rank=[];
  order.forEach((i,j)=>{ rank[i]=j+1; });
  holes.forEach((h,i)=>{
    const si=rank[i];
    /* receiving: SI 1..rem get an extra; giving back: SI n..n-rem+1 do */
    const extra = sign>0 ? (si<=rem?1:0) : (si>n-rem?1:0);
    out[i]=sign*(base+extra);
  });
  return out;
}
/* Golf Canada's sand save: out of a greenside bunker and in, in two. Exact from the shots; from
   the Bunker chip alone it is the up-and-down (missed green, par or better), which is close. */
function whsSand(e, par){
  const S=(e&&e.shots)||[];
  if(S.length){
    const j=S.findIndex(s=>s.lie==='sand' && s.yd!=null && s.yd<=50);
    if(j<0) return null;
    return {att:true, made:(S.length-j)<=2 && (e.done!==false)};
  }
  if(!e || !e.sand) return null;
  const gir = e.s!=null && e.p!=null && (e.s-e.p)<=par-2;
  return {att:true, made:!gir && e.s!=null && e.s<=par};
}
function whsPost(r){
  const c=whsCourse(r.courseKey); if(!c) return null;
  const holes=c.holes||[], hi=whsHI();
  const tee=whsTee(c, r.tee) || (!r.tee && whsTee(c, STATE.profile&&STATE.profile.usualTee)) || null;
  const rows=holes.map((h,i)=>{ const num=whsHoleNum(h,i), e=(r.holes||{})[num]||{};
    return { i, num, par:+h.par||4, si:+h.si||null, gross:e.s!=null?e.s:null, putts:e.p!=null?e.p:null,
             pen:e.pen||0, fw:(+h.par||4)>=4?(e.f||null):'n/a', sand:whsSand(e, +h.par||4) }; });
  const played=rows.filter(x=>x.gross!=null);
  const front=rows.slice(0,9), back=rows.slice(9,18);
  const allIn=list=>list.length && list.every(x=>x.gross!=null);
  /* what kind of score this is */
  let kind=null, use=rows;
  if(rows.length>=18 && played.length>=14) kind='18';
  else if(allIn(front) || allIn(back)){ kind='9'; use=allIn(front)?front:back; }
  const out={course:c, tee, hi, rows, played:played.length, kind, use};
  if(!kind || !tee) return out;
  const nine=kind==='9', nineKey=use===front?'front':'back';
  const par=use.reduce((s,x)=>s+x.par,0);
  const rating = nine ? (+tee[nineKey+'Rating']||(+tee.rating/2)) : +tee.rating;
  const slope  = nine ? (+tee[nineKey+'Slope']||+tee.slope) : +tee.slope;
  out.nineApprox = nine && !(+tee[nineKey+'Rating']);
  out.rating=rating; out.slope=slope; out.par=par;
  out.ch = whsCourseHcp(hi==null?null:(nine?hi/2:hi), rating, slope, par);
  const st = whsStrokes(out.ch, use);
  out.siMissing = !st;
  if(!st) return out;
  let ags=0, gross=0, capped=0, filled=0;
  use.forEach((x,k)=>{
    x.strokes=st[k]; x.max=x.par+2+st[k];
    if(x.gross==null){ x.adj=x.par+st[k]; x.filled=true; filled++; }
    else { x.adj=Math.min(x.gross, x.max); gross+=x.gross; if(x.adj<x.gross) capped++; }
    ags+=x.adj;
  });
  out.gross=gross; out.ags=ags; out.capped=capped; out.filled=filled;
  out.diff = (113/slope)*(ags-rating);
  return out;
}

/* ---------- editing the course's tees and stroke indexes ---------- */
function whsRoundObj(){ const R=(STATE.play&&STATE.play.rounds)||[]; return R[R.length-1]||null; }
function whsSetRoundTee(name){ const r=whsRoundObj(); if(!r) return; r.tee=name||null; saveState(); whsRefresh(); }
function whsTeeEdit(field, val){
  const r=whsRoundObj(), c=r&&whsCourse(r.courseKey); if(!c) return;
  c.tees=whsTees(c).slice(); let t=whsTee(c, r.tee);
  if(!t){ t={name:r.tee||'Tees'}; c.tees.push(t); r.tee=t.name; }
  if(field==='name'){ const v=String(val||'').trim().slice(0,24); if(!v) return; t.name=v; r.tee=v; }
  else { const n=parseFloat(val); if(isFinite(n)&&n>0) t[field]=n; else delete t[field]; }
  saveState(); whsRefresh();
}
function whsAddTee(){
  const r=whsRoundObj(), c=r&&whsCourse(r.courseKey); if(!c) return;
  const name=(prompt('Name of the tees (as on the scorecard):', (STATE.profile&&STATE.profile.usualTee)||'')||'').trim().slice(0,24);
  if(!name) return;
  c.tees=whsTees(c).slice();
  if(!whsTee(c,name)) c.tees.push({name});
  r.tee=name; saveState(); whsRefresh();
}
function whsSetSI(holeIdx, val){
  const r=whsRoundObj(), c=r&&whsCourse(r.courseKey); if(!c||!c.holes[holeIdx]) return;
  const n=parseInt(val,10);
  if(n>=1 && n<=18) c.holes[holeIdx].si=n; else delete c.holes[holeIdx].si;
  saveState(); whsRefresh();
}
function whsRefresh(){ if(typeof buildPostRound==='function') buildPostRound(); }

/* ---------- the card ---------- */
function whsCardHTML(){
  const r=whsRoundObj(); if(!r) return '';
  const P=whsPost(r); if(!P || !P.played) return '';
  const c=P.course, tees=whsTees(c), t=P.tee;
  const fw=v=>v==='hit'?'✓':v==='left'?'←':v==='right'?'→':v==='miss'?'✗':v==='n/a'?'':'·';
  const sd=s=>!s?'':s.made?'✓':'✗';
  const numIn=(f,v,step,ph)=>`<input type="number" inputmode="decimal" step="${step}" value="${v!=null?v:''}" placeholder="${ph}" onchange="whsTeeEdit('${f}', this.value)">`;
  const teeRow=`<div class="whs-tee">
      <label>Tees<select onchange="if(this.value==='__add') whsAddTee(); else whsSetRoundTee(this.value)">
        <option value="">${tees.length?'Choose':'None yet'}</option>
        ${tees.map(x=>`<option value="${escapeHtml(x.name)}"${t&&t.name===x.name?' selected':''}>${escapeHtml(x.name)}</option>`).join('')}
        <option value="__add">+ Add tees…</option></select></label>
      ${t?`<label>Rating${numIn('rating',t.rating,'0.1','72.0')}</label><label>Slope${numIn('slope',t.slope,'1','113')}</label>`:''}
    </div>
    ${t?`<details class="whs-nines"${(t.frontRating||t.backRating)?' open':''}><summary>Each nine's own rating, for 9-hole scores</summary>
      <div class="whs-tee"><label>Front rating${numIn('frontRating',t.frontRating,'0.1','36.0')}</label><label>Front slope${numIn('frontSlope',t.frontSlope,'1','113')}</label></div>
      <div class="whs-tee"><label>Back rating${numIn('backRating',t.backRating,'0.1','36.0')}</label><label>Back slope${numIn('backSlope',t.backSlope,'1','113')}</label></div></details>`:''}`;
  const status = !P.kind ? `<p class="pm-warn">${P.played} holes scored: an 18-hole score needs 14, and a 9-hole score needs a whole nine.</p>`
    : !t ? `<p class="pm-note">Choose or add the tees you played, with their rating and slope from the scorecard, for the Course Handicap and the most each hole can count.</p>`
    : !(t.rating>0&&t.slope>0) ? `<p class="pm-note">Enter the rating and slope for the ${escapeHtml(t.name)} tees.</p>`
    : P.siMissing ? `<p class="pm-note">Enter each hole's stroke index (the handicap row on the scorecard) to cap the scores at net double bogey.</p>` : '';
  const showUse = P.kind && P.use ? new Set(P.use.map(x=>x.i)) : null;
  const rows=P.rows.filter(x=>x.gross!=null || (showUse&&showUse.has(x.i))).map(x=>{
    const capped = x.max!=null && x.gross!=null && x.gross>x.max;
    return `<tr class="${x.filled?'whs-filled':''}">
      <td class="whs-h">${x.num}</td><td>${x.par}</td>
      <td><input type="number" inputmode="numeric" min="1" max="18" class="whs-si" value="${x.si||''}" onchange="whsSetSI(${x.i}, this.value)" aria-label="Stroke index, hole ${x.num}"></td>
      <td class="whs-g">${x.gross!=null?x.gross:'—'}</td>
      <td class="${capped?'whs-cap':''}">${x.adj!=null?x.adj:''}${x.max!=null&&x.gross!=null?`<i>max ${x.max}</i>`:x.filled?'<i>net par</i>':''}</td>
      <td>${x.putts!=null?x.putts:''}</td><td>${x.pen||''}</td><td>${fw(x.fw)}</td><td>${sd(x.sand)}</td></tr>`; }).join('');
  const T=P.rows.filter(x=>x.gross!=null);
  const fwA=T.filter(x=>x.fw&&x.fw!=='n/a'), fwH=fwA.filter(x=>x.fw==='hit').length;
  const sdA=T.filter(x=>x.sand), sdM=sdA.filter(x=>x.sand.made).length;
  const putts=T.reduce((s,x)=>s+(x.putts||0),0), pens=T.reduce((s,x)=>s+(x.pen||0),0);
  const sum = P.ags!=null ? `<div class="pm-pr-top whs-sum">
      <div><span>Course Handicap</span><b>${whsFmtHcp(P.ch)}</b><i>index ${whsFmtHcp(P.hi)}${P.kind==='9'?' · 9 holes':''}</i></div>
      <div><span>Adjusted gross</span><b>${P.ags}</b><i>gross ${P.gross}${P.capped?` · ${P.capped} capped`:''}${P.filled?` · ${P.filled} at net par`:''}</i></div>
      <div><span>Differential</span><b>${P.diff.toFixed(1)}</b><i>before PCC</i></div></div>` : '';
  return `<div class="profile-card whs-card">
      <h3>Ready to post — ${escapeHtml(r.courseName||c.name||'')}</h3>
      <div class="pm-pr-when">${new Date(r.startedAt||Date.now()).toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})} · laid out as the Golf Canada app asks for it</div>
      ${teeRow}
      ${status}
      ${sum}
      ${P.nineApprox&&P.ags!=null?`<p class="pm-note">9-hole score using half the 18-hole rating. Enter the nine's own rating above for the exact number.</p>`:''}
      ${P.hi==null?`<p class="pm-note">Add your Handicap Index in Settings → Profile for the Course Handicap.</p>`:''}
      <div class="whs-scroll"><table class="whs-tbl"><thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Score</th><th>Adj.</th><th>Putts</th><th>Pen</th><th>Fwy</th><th>Sand</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th colspan="3">Total</th><th>${T.reduce((s,x)=>s+x.gross,0)}</th><th>${P.ags!=null?P.ags:''}</th><th>${putts}</th><th>${pens||''}</th><th>${fwA.length?`${fwH}/${fwA.length}`:''}</th><th>${sdA.length?`${sdM}/${sdA.length}`:''}</th></tr></tfoot></table></div>
      <div class="pm-plan-row"><button type="button" class="btn pm-plan-btn" onclick="whsCopy()">Copy for posting</button></div>
      <p class="pm-note">Post it in the Golf Canada app or Score Centre: they hold your official Handicap Index and apply the playing conditions calculation (PCC) once the day's scores are in. The Adj. column is what each hole counts for, at most net double bogey. Sand is a sand save: out of a greenside bunker and in, in two.</p>
    </div>`;
}
function whsCopyText(){
  const r=whsRoundObj(); const P=r&&whsPost(r); if(!P) return '';
  const T=P.rows.filter(x=>x.gross!=null);
  const line=(lbl,f)=>`${lbl.padEnd(7)}${T.map(f).map(v=>String(v==null?'':v).padStart(3)).join('')}`;
  const fw=v=>v==='hit'?'Y':v==='left'?'L':v==='right'?'R':v==='miss'?'N':'';
  const t=P.tee;
  return [
    `${r.courseName||P.course.name} — ${t?`${t.name} (${t.rating||'?'}/${t.slope||'?'})`:'tees not set'} — ${new Date(r.startedAt||Date.now()).toLocaleDateString()}`,
    line('Hole', x=>x.num), line('Par', x=>x.par), line('Score', x=>x.gross),
    P.ags!=null?line('Adj', x=>x.adj):null,
    line('Putts', x=>x.putts), line('Pen', x=>x.pen||0), line('Fwy', x=>fw(x.fw)), line('Sand', x=>x.sand?(x.sand.made?'Y':'N'):''),
    `Gross ${T.reduce((s,x)=>s+x.gross,0)}${P.ags!=null?` · Adjusted ${P.ags} · Course Handicap ${whsFmtHcp(P.ch)} · Differential ${P.diff.toFixed(1)} (before PCC)`:''}`
  ].filter(Boolean).join('\n');
}
function whsCopy(){
  const txt=whsCopyText(); if(!txt) return;
  const done=()=>toast('Copied: paste it beside the Golf Canada app');
  try{ navigator.clipboard.writeText(txt).then(done, ()=>whsCopyFallback(txt, done)); }
  catch(_){ whsCopyFallback(txt, done); }
}
function whsCopyFallback(txt, done){
  const a=document.createElement('textarea'); a.value=txt; a.style.position='fixed'; a.style.opacity='0';
  document.body.appendChild(a); a.select(); try{ document.execCommand('copy'); done(); }catch(_){ toast('Could not copy'); } a.remove();
}

Object.assign(window, { whsNum, whsFmtHcp, whsHI, whsTees, whsTee, whsCourseHcp, whsStrokes, whsSand, whsPost,
  whsSetRoundTee, whsTeeEdit, whsAddTee, whsSetSI, whsCardHTML, whsCopyText, whsCopy });
