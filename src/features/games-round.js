// features/games-round.js — On-course games. One scorecard, several wagers computed from it.
// Nassau, Skins and points all read the same gross scores, so a group can run all of them at
// once off a single card rather than keeping three sets of books.

/* ============================================================
   HANDICAP ALLOCATION
   ============================================================
   Three ways to hand out strokes, and the third is the interesting one.

   DIFFERENCE (the traditional match-play method) — the low handicap plays off scratch and
   everyone else receives the difference, allocated one per hole down the course's stroke
   index. This is what most groups do.

   FULL — everyone receives their whole handicap, allocated the same way.

   HALF-STROKE — full handicaps, plus half a stroke to the highest handicap on the hardest
   hole. That half cannot be halved: on the hole it lands, a tie goes to the receiver.

   The third is not a novelty. Chan, Madras & Puterman, "Improving Fairness in Match Play Golf
   Through Enhanced Handicap Allocation", Journal of Sports Analytics 4(4):251-262 (2018),
   bootstrapped over 70,000 matches from 392 real rounds and found:
     - the standard method, on the course-defined hole ranking, favours the BETTER player in
       53% of matches — it is not neutral;
     - giving the weaker player 0.5 extra strokes, which amounts to a tie-breaker on a single
       hole, brings that to even;
     - giving both players their FULL handicap makes the result robust to hole ranking, where
       the traditional method's outcome swings with how the course happens to rank its holes.
   So "full + half" is the fairest of the three by that paper's measure, and it is offered
   here as a first-class option rather than a curiosity. */
const GR_ALLOC = {
  difference:{ label:'Difference', note:'Low handicap plays off scratch; everyone else gets the difference. The traditional method.' },
  full:      { label:'Full',       note:'Everyone plays their whole handicap. Robust to how the course ranks its holes.' },
  half:      { label:'Full + ½',   note:'Full handicaps plus half a stroke to the highest, on the hardest hole. Measured as the fairest of the three; that hole cannot be halved.' }
};
const GR_PRESS = {
  none: { label:'No presses',      note:'The three Nassau bets and nothing else.' },
  any:  { label:'Press any time',  note:'Either side may open a new bet from any hole.' },
  two:  { label:'Press when 2 down', note:'A new bet may only be opened by a side that is two or more down.' },
  auto: { label:'Automatic 2-down', note:'A new bet opens by itself the moment a side goes two down.' }
};
const GR_VALID = {
  none:{ label:'None',            note:'A skin is won outright on the hole.' },
  tie: { label:'Tie the next hole',note:'A skin is only banked if the winner at least ties the low score on the following hole. Otherwise it carries on.' },
  par: { label:'Par the next hole',note:'A skin is only banked if the winner makes par or better on the following hole.' }
};

function grState(){
  STATE.games = STATE.games || {};
  const r = STATE.games.round = STATE.games.round || {};
  r.players = r.players || [{name:'',hcp:''},{name:'',hcp:''}];
  r.holes   = r.holes   || grDefaultHoles();
  r.scores  = r.scores  || r.players.map(()=>new Array(18).fill(''));
  r.alloc   = r.alloc   || 'difference';
  r.press   = r.press   || 'two';
  r.valid   = r.valid   || 'none';
  r.skinsNet= r.skinsNet!==undefined ? r.skinsNet : true;
  r.presses = r.presses || [];     // [{side:0|1, from:holeIndex, seg:'front'|'back'}]
  while(r.scores.length < r.players.length) r.scores.push(new Array(18).fill(''));
  r.scores.length = r.players.length;
  r.scores.forEach(s=>{ while(s.length<18) s.push(''); s.length=18; });
  return r;
}
/* A neutral 18 until a real course is chosen: par 4s with two 3s and two 5s a side, stroke
   index alternating so the front and back both carry a fair share of the hard holes. */
function grDefaultHoles(){
  const par=[4,5,3,4,4,3,4,5,4, 4,4,5,3,4,4,3,5,4];
  const si =[7,3,15,1,9,17,5,11,13, 8,4,12,16,2,10,18,6,14];
  return par.map((p,i)=>({num:i+1, par:p, si:si[i]}));
}
function grLoadCourse(idx){
  const r=grState(), c=(STATE.courses||[])[idx];
  if(!c){ r.holes=grDefaultHoles(); r.courseName=''; saveState(); buildRoundGames(); return; }
  const hs=(c.holes||[]).slice(0,18);
  if(!hs.length){ toast('That course has no holes yet'); return; }
  /* A traced course carries par and yardage but no stroke index, so rank by length —
     longest hole hardest — which is the convention when a card does not state one. */
  const byLen=hs.map((h,i)=>({i, yd:+h.yards||0})).sort((a,b)=>b.yd-a.yd);
  const si=new Array(hs.length); byLen.forEach((x,rank)=>{ si[x.i]=rank+1; });
  r.holes=hs.map((h,i)=>({num:h.num||i+1, par:+h.par||4, si:si[i]||i+1}));
  while(r.holes.length<18) r.holes.push({num:r.holes.length+1, par:4, si:r.holes.length+1});
  r.courseName=c.name||'';
  saveState(); buildRoundGames();
}
/* Strokes each player receives on each hole, under the chosen allocation. Returns a
   [player][hole] matrix of numbers that may include a 0.5. */
function grStrokes(){
  const r=grState();
  const hcps=r.players.map(p=>{ const h=parseFloat(p.hcp); return isNaN(h)?0:h; });
  const n=r.holes.length;
  const out=r.players.map(()=>new Array(n).fill(0));
  const low=Math.min.apply(null,hcps);
  const base=hcps.map(h=> r.alloc==='difference' ? (h-low) : h);
  base.forEach((amt,pi)=>{
    const whole=Math.floor(Math.abs(amt))*Math.sign(amt||1);
    /* one per hole down the stroke index, wrapping for handicaps above 18 */
    for(let k=0;k<Math.abs(whole);k++){
      const si=(k%n)+1, hi=r.holes.findIndex(h=>h.si===si);
      if(hi>=0) out[pi][hi]+= (amt<0?-1:1);
    }
  });
  if(r.alloc==='half'){
    /* Chan/Madras/Puterman: half a stroke to the weakest player, which is a tie-breaker on
       exactly one hole. Put it on the hardest hole, where a stroke matters most. */
    let worst=0; hcps.forEach((h,i)=>{ if(h>hcps[worst]) worst=i; });
    const hi=r.holes.findIndex(h=>h.si===1);
    if(hi>=0 && hcps.some(h=>h!==hcps[0])) out[worst][hi]+=0.5;
  }
  return out;
}
function grNet(){
  const r=grState(), st=grStrokes();
  return r.scores.map((row,pi)=>row.map((v,hi)=>{
    const g=parseInt(v); if(isNaN(g)||g<=0) return null;
    return g - st[pi][hi];
  }));
}
function grGross(){
  return grState().scores.map(row=>row.map(v=>{ const g=parseInt(v); return (isNaN(g)||g<=0)?null:g; }));
}
/* Who won a hole, given a column of scores. Returns an index, or 'half', or null. */
function grHoleWinner(vals){
  const live=vals.map((v,i)=>({v,i})).filter(x=>x.v!=null);
  if(live.length<2) return null;
  const best=Math.min.apply(null,live.map(x=>x.v));
  const at=live.filter(x=>Math.abs(x.v-best)<1e-9);
  return at.length===1 ? at[0].i : 'half';
}

/* ---------------- NASSAU ----------------
   Three bets — front, back, and the full eighteen — plus whatever presses the group's rule
   allows. A press is just another match that starts later and runs to the end of its half. */
function grNassau(){
  const r=grState(), net=grNet(), gross=grGross();
  const use = r.skinsNet ? net : net;                 // Nassau always plays net here
  const src = use;
  const seg=(a,b,from)=>{
    let up=0, holes=0;
    for(let h=Math.max(a,from); h<b; h++){
      const w=grHoleWinner(src.map(row=>row[h]));
      if(w==null) continue;
      holes++;
      if(w===0) up++; else if(w===1) up--;
    }
    const left=b-Math.max(a,from)-holes;
    return {up, holes, left, done:Math.abs(up)>left};
  };
  const base=[ {key:'front', label:'Front 9', a:0,  b:9,  from:0},
               {key:'back',  label:'Back 9',  a:9,  b:18, from:9},
               {key:'total', label:'Total 18',a:0,  b:18, from:0} ];
  const bets=base.map(b=>({...b, ...seg(b.a,b.b,b.from), press:false}));
  /* automatic presses: the moment a side is two down, a new bet opens on the next hole */
  if(r.press==='auto'){
    ['front','back'].forEach(k=>{
      const a=k==='front'?0:9, b=k==='front'?9:18;
      let up=0, opened=[];
      for(let h=a; h<b; h++){
        const w=grHoleWinner(src.map(row=>row[h]));
        if(w==null) continue;
        if(w===0) up++; else if(w===1) up--;
        if(Math.abs(up)>=2 && h+1<b && !opened.includes(h+1)){ opened.push(h+1); up=0; }
      }
      opened.forEach((from,i)=>bets.push({ key:k+'-auto'+i, label:`${k==='front'?'Front':'Back'} press ${i+1}`,
        a, b, from, press:true, auto:true, ...seg(a,b,from) }));
    });
  }
  (r.presses||[]).forEach((p,i)=>{
    const a=p.seg==='front'?0:9, b=p.seg==='front'?9:18;
    bets.push({ key:'p'+i, label:`${p.seg==='front'?'Front':'Back'} press from ${p.from+1}`,
      a, b, from:p.from, press:true, idx:i, ...seg(a,b,p.from) });
  });
  return bets;
}
/* Can a press be opened right now, under the group's rule? */
function grCanPress(seg){
  const r=grState();
  if(r.press==='none'||r.press==='auto') return {ok:false, why:GR_PRESS[r.press].label};
  const src=grNet(), a=seg==='front'?0:9, b=seg==='front'?9:18;
  let up=0, last=-1;
  for(let h=a; h<b; h++){
    const w=grHoleWinner(src.map(row=>row[h]));
    if(w==null) continue;
    last=h; if(w===0) up++; else if(w===1) up--;
  }
  if(last<0) return {ok:false, why:'No holes played on this nine yet'};
  if(last+1>=b) return {ok:false, why:'This nine is finished'};
  if(r.press==='two' && Math.abs(up)<2) return {ok:false, why:'Nobody is two down'};
  return {ok:true, from:last+1, down:up<0?0:1};
}
function grAddPress(seg){
  const can=grCanPress(seg);
  if(!can.ok){ toast(can.why); return; }
  const r=grState();
  r.presses.push({seg, from:can.from});
  saveState(); buildRoundGames();
}
function grDropPress(i){
  const r=grState(); r.presses.splice(i,1); saveState(); buildRoundGames();
}

/* ---------------- SKINS ----------------
   Lowest score on the hole takes the skin; a tie carries it forward. Validation makes a win
   provisional until the next hole, which is where the carryovers get interesting. */
function grSkins(){
  const r=grState();
  const src = r.skinsNet ? grNet() : grGross();
  const n=r.holes.length;
  const rows=[]; let carry=0; let pending=null;   // {winner, count} awaiting validation
  for(let h=0; h<n; h++){
    const vals=src.map(row=>row[h]);
    const w=grHoleWinner(vals);
    const row={ h, winner:null, count:0, carry, status:'' };
    if(w==null){ rows.push(row); continue; }
    /* first, does an outstanding win validate on this hole? */
    if(pending){
      const me=vals[pending.winner];
      let ok=false;
      if(r.valid==='tie'){
        const best=Math.min.apply(null, vals.filter(v=>v!=null));
        ok = me!=null && Math.abs(me-best)<1e-9;
      } else if(r.valid==='par'){
        ok = me!=null && me<=r.holes[h].par;
      }
      if(ok){ rows[pending.row].status='validated'; }
      else {
        /* The hole was won and then given back. Keep who won it — showing that row as a plain
           "carried" hides the most interesting thing that happened in the game. */
        rows[pending.row].status='not validated';
        rows[pending.row].lost=pending.winner;
        carry+=pending.count; rows[pending.row].count=0; rows[pending.row].winner=null;
      }
      pending=null;
    }
    if(w==='half'){ carry+=1; row.carry=carry; row.status='carried'; rows.push(row); continue; }
    row.winner=w; row.count=carry+1; carry=0;
    if(r.valid!=='none' && h<n-1){ row.status='awaiting'; pending={winner:w, count:row.count, row:rows.length}; }
    else row.status='won';
    rows.push(row);
  }
  if(pending) rows[pending.row].status='unresolved';
  const tally=r.players.map(()=>0);
  rows.forEach(x=>{ if(x.winner!=null && x.status!=='not validated' && x.status!=='unresolved') tally[x.winner]+=x.count; });
  return { rows, tally, carry };
}

/* ---------------- POINTS ----------------
   Stableford off the same net card: it needs no extra input, works for two players or four,
   and unlike match play it keeps everyone in it after a bad hole. */
function grStablefordPts(net, par){
  if(net==null) return null;
  const d=Math.round(net)-par;
  return Math.max(0, 2-d);      // par 2, birdie 3, eagle 4, bogey 1, double or worse 0
}
function grPoints(){
  const r=grState(), net=grNet();
  const per=r.players.map((p,pi)=>r.holes.map((h,hi)=>grStablefordPts(net[pi][hi], h.par)));
  const tot=per.map(row=>row.reduce((s,v)=>s+(v||0),0));
  return { per, tot };
}

/* ---------------- UI ---------------- */
function grSetPlayer(i,f,v){ const r=grState(); r.players[i][f]= f==='hcp'?(v===''?'':parseFloat(v)):v; grState(); saveState(); buildRoundGames(); }
function grAddPlayer(){ const r=grState(); if(r.players.length>=4){ toast('Four is the limit'); return; }
  r.players.push({name:'',hcp:''}); r.scores.push(new Array(18).fill('')); saveState(); buildRoundGames(); }
function grDropPlayer(i){ const r=grState(); if(r.players.length<=2){ toast('Two players minimum'); return; }
  r.players.splice(i,1); r.scores.splice(i,1); saveState(); buildRoundGames(); }
function grSetScore(pi,hi,v){ const r=grState(); r.scores[pi][hi]= v===''?'':Math.max(1,Math.min(15,parseInt(v)||''));
  saveState(); buildRoundResults(); }
function grSetOpt(k,v){ const r=grState(); r[k]= (k==='skinsNet')?(v==='net'):v; saveState(); buildRoundGames(); }
function grClearCard(){ if(!confirm('Clear every score? Players and settings stay.')) return;
  const r=grState(); r.scores=r.players.map(()=>new Array(18).fill('')); r.presses=[]; saveState(); buildRoundGames(); }

function grNassauCell(b, names){
  if(!b.holes) return '<span class="gr-as">not started</span>';
  const A=names[0]||'P1', B=names[1]||'P2';
  if(b.up===0) return b.left===0 ? '<span class="gr-as">halved</span>' : '<span class="gr-as">all square</span>';
  const who=b.up>0?A:B, lead=Math.abs(b.up), cls=b.up>0?'gr-a':'gr-b';
  if(b.left===0) return '<span class="'+cls+'">'+escapeHtml(who)+' wins '+lead+' up</span>';
  if(b.done)     return '<span class="'+cls+'">'+escapeHtml(who)+' wins '+lead+'&'+b.left+'</span>';
  return '<span class="'+cls+'">'+escapeHtml(who)+' '+lead+' up, '+b.left+' to play</span>';
}
function buildRoundResults(){
  const host=document.getElementById('gr-results'); if(!host) return;
  const r=grState(), names=r.players.map((p,i)=>p.name||('Player '+(i+1)));
  const st=grStrokes(), net=grNet();
  const two=r.players.length===2;
  /* ---- the card ---- */
  const hdr=r.holes.map((h,i)=>'<th'+(i===8?' class="gr-turn"':'')+'>'+h.num+'</th>').join('');
  const parRow=r.holes.map(h=>'<td>'+h.par+'</td>').join('');
  const siRow=r.holes.map(h=>'<td>'+h.si+'</td>').join('');
  const body=r.players.map((p,pi)=>{
    const cells=r.holes.map((h,hi)=>{
      const got=st[pi][hi], dots = got>=1?'<i class="gr-dot">'+'&bull;'.repeat(Math.min(3,Math.round(got)))+'</i>':'';
      const half = (got%1)>0 ? '<i class="gr-dot gr-half">&frac12;</i>' : '';
      return '<td class="gr-cell">'+dots+half
        + '<input type="number" min="1" max="15" inputmode="numeric" value="'+(r.scores[pi][hi]||'')
        + '" oninput="grSetScore('+pi+','+hi+',this.value)"></td>';
    }).join('');
    const gross=r.scores[pi].reduce((s,v)=>s+(parseInt(v)||0),0);
    const netT=net[pi].reduce((s,v)=>s+(v||0),0);
    return '<tr><th class="gr-name">'+escapeHtml(names[pi])+'</th>'+cells
      +'<td class="gr-tot">'+(gross||'-')+'</td><td class="gr-tot gr-netot">'+(netT?netT.toFixed(netT%1?1:0):'-')+'</td></tr>';
  }).join('');
  /* ---- results ---- */
  const nassau = two ? grNassau() : null;
  const skins = grSkins();
  const pts = grPoints();
  const nassauHtml = !two ? '<div class="gr-note">Nassau is a two-player match — it appears when the card has exactly two players.</div>'
    : '<table class="gr-res"><tbody>'
      + nassau.map(b=>'<tr class="'+(b.press?'gr-press':'')+'"><th>'+b.label+'</th><td>'+grNassauCell(b,names)+'</td>'
        + '<td class="gr-x">'+(b.idx!=null?'<button class="sgcal-del" onclick="grDropPress('+b.idx+')">&#10005;</button>':'')+'</td></tr>').join('')
      + '</tbody></table>'
      + (r.press==='none'||r.press==='auto' ? ''
        : '<div class="btn-row" style="margin-top:6px"><button class="btn" onclick="grAddPress(\'front\')">Press front</button>'
          + '<button class="btn" onclick="grAddPress(\'back\')">Press back</button></div>');
  const skinRows=skins.rows.filter(x=>x.winner!=null||x.status).map(x=>
    '<tr><th>'+r.holes[x.h].num+'</th><td>'+(x.winner!=null?escapeHtml(names[x.winner])
      :x.lost!=null?'<span class="gr-lost">'+escapeHtml(names[x.lost])+'</span>'
      :'<span class="gr-as">carried</span>')+'</td>'
    + '<td class="gr-num">'+(x.count||'')+'</td><td class="gr-st">'+x.status+'</td></tr>').join('');
  const skinsHtml='<div class="gr-tally">'+names.map((n,i)=>'<span>'+escapeHtml(n)+' <b>'+skins.tally[i]+'</b></span>').join('')
    + (skins.carry?'<span class="gr-as">'+skins.carry+' carried</span>':'') + '</div>'
    + (skinRows?'<div class="gr-scroll2"><table class="gr-res gr-skins"><thead><tr><th>Hole</th><th>Winner</th><th>Skins</th><th></th></tr></thead><tbody>'+skinRows+'</tbody></table></div>':'<div class="gr-note">No holes decided yet.</div>');
  const ptsHtml='<div class="gr-tally">'+names.map((n,i)=>'<span>'+escapeHtml(n)+' <b>'+pts.tot[i]+'</b></span>').join('')+'</div>'
    + '<div class="gr-note">Stableford off the same net card: par 2, birdie 3, eagle 4, bogey 1, double or worse 0. Works for two, three or four.</div>';
  host.innerHTML=
    '<div class="gr-scroll"><table class="gr-card"><thead>'
    + '<tr><th class="gr-name">Hole</th>'+hdr+'<th class="gr-tot">Gr</th><th class="gr-tot">Net</th></tr>'
    + '<tr class="gr-sub"><th class="gr-name">Par</th>'+parRow+'<td></td><td></td></tr>'
    + '<tr class="gr-sub"><th class="gr-name">SI</th>'+siRow+'<td></td><td></td></tr>'
    + '</thead><tbody>'+body+'</tbody></table></div>'
    + '<div class="gr-games">'
    + '<div class="gr-game"><h4>Nassau</h4>'+nassauHtml+'</div>'
    + '<div class="gr-game"><h4>Skins <span>'+(r.skinsNet?'net':'gross')+' &middot; '+GR_VALID[r.valid].label.toLowerCase()+'</span></h4>'+skinsHtml+'</div>'
    + '<div class="gr-game"><h4>Points</h4>'+ptsHtml+'</div>'
    + '</div>';
}
function buildRoundGames(){
  const wrap=document.getElementById('round-games-wrap'); if(!wrap) return;
  const r=grState();
  const sel=(k,opts,cur)=>'<select class="strat-select" onchange="grSetOpt(\''+k+'\',this.value)">'
    + Object.keys(opts).map(o=>'<option value="'+o+'"'+(o===cur?' selected':'')+'>'+opts[o].label+'</option>').join('')+'</select>';
  const players=r.players.map((p,i)=>'<div class="gr-player">'
    + '<input class="wg-name" type="text" placeholder="Player '+(i+1)+'" value="'+escapeHtml(p.name||'')+'" oninput="grSetPlayer('+i+',\'name\',this.value)">'
    + '<label>Index<input class="wg-hcp" type="number" step="0.1" value="'+((p.hcp===''||p.hcp==null)?'':p.hcp)+'" oninput="grSetPlayer('+i+',\'hcp\',this.value)"></label>'
    + (r.players.length>2?'<button class="sgcal-del" title="Remove" onclick="grDropPlayer('+i+')">&#10005;</button>':'')+'</div>').join('');
  const courses=(STATE.courses||[]).map((c,i)=>'<option value="'+i+'">'+escapeHtml(c.name||'Course')+'</option>').join('');
  wrap.innerHTML=
    '<div class="section-label" style="margin-top:0">On-Course Games <span class="proto-badge">prototype</span></div>'
    + '<p class="intro-note">One card, several wagers. Enter gross scores and Nassau, Skins and points all settle from the same numbers - no separate books. Strokes are allocated by the method you pick below, and every game reads the result.</p>'
    + '<div class="gr-players">'+players+(r.players.length<4?'<button class="btn" onclick="grAddPlayer()">+ Player</button>':'')+'</div>'
    + '<div class="gr-opts">'
    + '<label><span>Course</span><select class="strat-select" onchange="grLoadCourse(this.value)"><option value="-1">Neutral 18</option>'+courses+'</select></label>'
    + '<label><span>Strokes</span>'+sel('alloc',GR_ALLOC,r.alloc)+'</label>'
    + '<label><span>Presses</span>'+sel('press',GR_PRESS,r.press)+'</label>'
    + '<label><span>Skins validation</span>'+sel('valid',GR_VALID,r.valid)+'</label>'
    + '<label><span>Skins on</span><select class="strat-select" onchange="grSetOpt(\'skinsNet\',this.value)">'
      + '<option value="net"'+(r.skinsNet?' selected':'')+'>Net</option><option value="gross"'+(r.skinsNet?'':' selected')+'>Gross</option></select></label>'
    + '</div>'
    + '<div class="gr-optnote">'+escapeHtml(GR_ALLOC[r.alloc].note)+' &middot; '+escapeHtml(GR_PRESS[r.press].note)+'</div>'
    + '<div id="gr-results"></div>'
    + '<div class="btn-row" style="margin-top:10px"><button class="btn" onclick="grClearCard()">Clear card</button></div>'
    + '<details class="pg-wrap" style="margin-top:14px"><summary>Half strokes - where the idea comes from</summary><div class="pg-body">'
    + '<p class="gen-note" style="margin-top:0">The traditional method - low handicap off scratch, the difference allocated down the course stroke index - is not neutral. Chan, Madras and Puterman (<i>Journal of Sports Analytics</i> 4(4):251-262, 2018) bootstrapped over <b>70,000 matches from 392 real rounds</b> and found it favours the <b>better</b> player in <b>53%</b> of them.</p>'
    + '<p class="gen-note">Two changes fix it. Giving both players their <b>full</b> handicap makes the outcome robust to how a course happens to rank its holes, which the traditional method is sensitive to. Then giving the weaker player <b>half a stroke</b> - which is exactly a tie-breaker on one hole - brings the match to even.</p>'
    + '<p class="gen-note" style="margin-bottom:0">So the <b>Full + &frac12;</b> option is the fairest of the three by that paper. The half lands on the hardest hole and is shown as a &frac12; on the card; that hole cannot be halved, because the two net scores differ by half a shot whatever is written down.</p>'
    + '</div></details>';
  buildRoundResults();
}

Object.assign(window, { GR_ALLOC, GR_PRESS, GR_VALID, grState, grDefaultHoles, grLoadCourse,
  grStrokes, grNet, grGross, grHoleWinner, grNassau, grCanPress, grAddPress, grDropPress,
  grSkins, grStablefordPts, grPoints, grSetPlayer, grAddPlayer, grDropPlayer, grSetScore,
  grSetOpt, grClearCard, grNassauCell, buildRoundResults, buildRoundGames });
