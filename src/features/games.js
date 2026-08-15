// features/games.js — Games & Matches. Practice games first (Trackman range), on-course
// wagering formats to follow. Scoring reuses the app's own strokes-gained baselines so a
// practice game and a real round are measured on the same scale.

/* ============================================================
   THE 12-SHOT WEDGE GAME
   ============================================================
   Twelve stations, 10 through 120 yards. Each player hits one shot per station; the shot's
   PROXIMITY is the only thing recorded, and a scratch golfer holes out from there. So a
   station's score is

       Expected Scratch Score = 1 (the wedge)  +  scratch strokes from that proximity

   which is a real number to a tenth, not an integer, and is directly comparable to the
   strokes-gained baselines the rest of the app runs on. Twelve stations at par 3 = par 36.

   ---- THE HANDICAP PROBLEM, AND WHY IT IS NOT THE FULL INDEX ----
   A Trackman index describes whole golf — driving, approach, short game, putting. This game
   removes almost all of that: every player's ball is holed out by the same scratch golfer, so
   the ONLY skill being measured is how close the wedge finishes. Applying the full index
   would hand out strokes for putting nobody is doing.

   The right allowance falls out of the app's own handicap rule rather than being invented.
   That rule is  S(d,h) = S0 + 0.012*h*(S0 - 1)  — expected strokes to hole out from d. For a
   handicap player that total is their wedge, then THEIR OWN putting from THEIR proximity:

       S(d,h) - 1 = G*(1 + 0.012h) - 0.012h        G = scratch putts from their proximity

   and G is exactly what this game scores. Solving:

       ExpectedScratchScore(d,h) = 1 + [ S(d,h) - 1 + 0.012h ] / (1 + 0.012h)

   No new constant, and it collapses to S(d,0) at scratch. For a 15 index it works out at
   0.15 strokes a station, about half the naive full-index gap — the other half was putting,
   which this game does not let anyone do.

   ---- A LIMITATION TO KNOW ABOUT ----
   MEASURED: that allowance comes out IDENTICAL at 10 yards and at 120 (0.1525 a station for
   a 15 index either way). That is a property of the app's linear handicap rule, and it is
   almost certainly wrong — a 15 index is much nearer scratch from 10 yards than from 120.
   The rule attributes all of the distance-dependence to putting.
   Worth knowing, and worth fixing from data: this game generates exactly the data that would
   fix it — proximity by distance by player, repeated. Play it enough and the allowance can be
   measured instead of derived. */
const WEDGE_STATIONS_YD = [10,20,30,40,50,60,70,80,90,100,110,120];
const WEDGE_PAR_PER = 3;

function gmState(){
  STATE.games = STATE.games || {};
  const g = STATE.games.wedge = STATE.games.wedge || {};
  g.players = g.players || [{name:'', hcp:''},{name:'', hcp:''}];
  g.shots   = g.shots   || WEDGE_STATIONS_YD.map(()=>({}));
  g.sessions= g.sessions|| [];
  if(g.shots.length!==WEDGE_STATIONS_YD.length) g.shots=WEDGE_STATIONS_YD.map((_,i)=>g.shots[i]||{});
  return g;
}
/* Expected Scratch Score from a proximity in FEET. Holed is 1.0; the putting baseline is
   indexed in feet, so no conversion beyond guarding the short end. */
function gmScore(proxFt){
  const p=parseFloat(proxFt);
  if(p==null||isNaN(p)||p<0) return null;
  if(p===0) return 1;                                  // holed it
  if(typeof srForPlayer!=='function') return null;
  const putts=srForPlayer('green', Math.max(1,p), 0);
  return putts==null?null:1+putts;
}
/* The per-station allowance a handicap earns in THIS game — derived, not assumed. Computed
   against the model rather than from the closed form, so if the handicap rule ever becomes
   distance-aware this follows it without being touched. */
function gmAllowance(distYd, hcp){
  const h=parseFloat(hcp); if(!h||isNaN(h)||typeof srForPlayer!=='function') return 0;
  const ess=(hh)=>{ const S=srForPlayer('fairway', distYd, hh); if(S==null) return null;
    return 1 + (S-1+0.012*hh)/(1+0.012*hh); };
  const a=ess(h), b=ess(0);
  return (a==null||b==null)?0:a-b;
}
/* Everything the card needs, computed in one place so the table, the totals and the match
   status can never disagree with each other. */
function gmCard(){
  const g=gmState();
  const rows=WEDGE_STATIONS_YD.map((d,i)=>{
    const s=g.shots[i]||{};
    const r={ i, dist:d, par:WEDGE_PAR_PER, p:[], gross:[], allow:[], net:[] };
    [0,1].forEach(k=>{
      const key=k?'b':'a';
      r.p[k]= (s[key]===''||s[key]==null)?null:parseFloat(s[key]);
      r.gross[k]=gmScore(s[key]);
      r.allow[k]=gmAllowance(d, g.players[k].hcp);
      r.net[k]=(r.gross[k]==null)?null:r.gross[k]-r.allow[k];
    });
    /* Four games run at once, which is how golfers actually play: gross and net, medal and
       match. A hole is won on GROSS for one pair of them and on NET for the other. */
    const decide=(x,y)=> (x==null||y==null) ? null : (Math.abs(x-y)<0.005?'half':(x<y?'a':'b'));
    r.wonGross=decide(r.gross[0], r.gross[1]);
    r.won=r.wonNet=decide(r.net[0], r.net[1]);
    return r;
  });
  const tot={ par:WEDGE_STATIONS_YD.length*WEDGE_PAR_PER, gross:[0,0], net:[0,0], played:[0,0],
              allow:[0,0], holes:0, up:0, grossHoles:0, grossUp:0, matchDone:false };
  /* running state after each hole, so every row can show where all four games stood */
  let gm=0, nm=0, gu=0, nu=0;
  rows.forEach(r=>{
    [0,1].forEach(k=>{ if(r.gross[k]!=null){ tot.gross[k]+=r.gross[k]; tot.net[k]+=r.net[k];
      tot.allow[k]+=r.allow[k]; tot.played[k]++; } });
    const both = r.gross[0]!=null && r.gross[1]!=null;
    if(both){ gm += r.gross[0]-r.gross[1]; nm += r.net[0]-r.net[1]; }
    if(r.wonGross){ tot.grossHoles++; if(r.wonGross==='a') gu++; else if(r.wonGross==='b') gu--; }
    if(r.wonNet){ tot.holes++; if(r.wonNet==='a') nu++; else if(r.wonNet==='b') nu--; }
    r.run = both ? { gMedal:gm, nMedal:nm, gMatch:gu, nMatch:nu } : null;
  });
  tot.up=nu; tot.grossUp=gu; tot.gMedal=gm; tot.nMedal=nm;
  /* match play: are we already decided with holes to spare? */
  const left=WEDGE_STATIONS_YD.length-tot.holes;
  tot.left=left;
  tot.matchDone = Math.abs(tot.up)>left;
  return { g, rows, tot };
}
function gmSetPlayer(k, field, val){
  const g=gmState();
  g.players[k][field]= field==='hcp' ? (val===''?'':parseFloat(val)) : val;
  saveState(); buildGames();
}
/* A miss from 10 yards is measured in feet; a miss from 120 can be twenty-odd yards, and
   nobody says "sixty-six feet". So each entry carries its own unit — but only in imperial,
   where the two ranges genuinely want different words. In metric one unit spans both (2 m
   from ten, 16 m from a hundred and twenty), so the toggle would offer a choice between
   metres and metres. Storage is always FEET; only entry and redisplay convert. */
function gmMetric(){ return typeof isMetric==='function' && isMetric(); }
/* Two scales in each system, because a shot from ten yards and a shot from a hundred and
   twenty are not measured in the same words: cm/m in metric, ft/yd in imperial. The default
   follows the station — close in for the short ones, the long unit further out — and either
   entry can be switched. Storage is always FEET. */
const GM_UNITS = { metric:['cm','m'], imperial:['ft','yd'] };
function gmUnitPair(){ return gmMetric()?GM_UNITS.metric:GM_UNITS.imperial; }
function gmShotUnit(i,k){
  const pair=gmUnitPair(), g=gmState(), s=g.shots[i]||{};
  const saved=s[(k?'b':'a')+'U'];
  if(saved && pair.indexOf(saved)>=0) return saved;      // honoured only within this system
  return WEDGE_STATIONS_YD[i]>=70 ? pair[1] : pair[0];
}
const GM_FT_PER = { ft:1, yd:3, m:1/0.3048, cm:1/30.48 };
function gmToFeet(v, unit){
  const n=parseFloat(v); if(isNaN(n)) return '';
  return n*(GM_FT_PER[unit]||1);
}
function gmFromFeet(ft, unit){
  const n=parseFloat(ft); if(isNaN(n)) return '';
  const v=n/(GM_FT_PER[unit]||1);
  return Math.round(v*(unit==='cm'?1:10))/(unit==='cm'?1:10);
}
function gmSetShot(i, k, val){
  const g=gmState();
  g.shots[i]=g.shots[i]||{};
  g.shots[i][k?'b':'a'] = (val===''?'':gmToFeet(val, gmShotUnit(i,k)));
  saveState(); buildGamesGrid();
}
function gmCycleUnit(i,k){
  const g=gmState(); g.shots[i]=g.shots[i]||{};
  const pair=gmUnitPair(), cur=gmShotUnit(i,k);
  g.shots[i][(k?'b':'a')+'U'] = (cur===pair[0]) ? pair[1] : pair[0];
  saveState(); buildGamesGrid();
}
function gmClear(){
  if(!confirm('Clear this card? The players and their indexes stay.')) return;
  const g=gmState(); g.shots=WEDGE_STATIONS_YD.map(()=>({}));
  saveState(); buildGames();
}
function gmSave(){
  const {g,rows,tot}=gmCard();
  if(!tot.played[0] && !tot.played[1]){ toast('Nothing to save yet'); return; }
  g.sessions.unshift({ id:'wg'+Date.now().toString(36), date:new Date().toISOString().slice(0,10),
    players:JSON.parse(JSON.stringify(g.players)), shots:JSON.parse(JSON.stringify(g.shots)),
    net:[+tot.net[0].toFixed(1), +tot.net[1].toFixed(1)], up:tot.up });
  g.sessions=g.sessions.slice(0,40);
  saveState(); buildGames(); toast('Session saved');
}
function gmDeleteSession(id){
  const g=gmState(); g.sessions=(g.sessions||[]).filter(s=>s.id!==id);
  saveState(); buildGames();
}
/* Match status in the language a golfer uses. */
function gmMatchText(tot, names){
  if(!tot.holes) return 'No holes decided yet';
  const A=names[0]||'Player 1', B=names[1]||'Player 2';
  if(tot.up===0) return tot.left===0 ? 'Match halved' : `All square after ${tot.holes}`;
  const lead=Math.abs(tot.up), who=tot.up>0?A:B;
  /* "5&0" is not a thing. A match closed out early is "5&3"; one that goes the distance is
     "5 up". Only report a margin-and-holes-remaining score when holes actually remain. */
  if(tot.left===0) return `${who} wins ${lead} up`;
  if(tot.matchDone) return `${who} wins ${lead}&${tot.left}`;
  return `${who} ${lead} up with ${tot.left} to play`;
}
/* ---------- ONE GRID ----------
   Entry and result in the same table, because they are the same act: you type the proximity
   and you want to see, on that row, what it did to all four games. Two tables meant counting
   rows in one to find the matching row in the other. */
function gmRunCell(v, kind, names){
  if(v==null) return '<td class="wg-run">-</td>';
  const A=names[0]||'P1', B=names[1]||'P2';
  if(kind==='medal'){
    if(Math.abs(v)<0.05) return '<td class="wg-run">AS</td>';
    return '<td class="wg-run '+(v<0?'wg-run-a':'wg-run-b')+'">'+escapeHtml(v<0?A:B)+' '+Math.abs(v).toFixed(1)+'</td>';
  }
  if(v===0) return '<td class="wg-run">AS</td>';
  return '<td class="wg-run '+(v>0?'wg-run-a':'wg-run-b')+'">'+escapeHtml(v>0?A:B)+' '+Math.abs(v)+'&#8593;</td>';
}
function buildGamesGrid(){
  const host=document.getElementById('wedge-grid'); if(!host) return;
  const {g,rows,tot}=gmCard();
  const names=[g.players[0].name||'Player 1', g.players[1].name||'Player 2'];
  const f1=v=>v==null?'-':v.toFixed(1);
  const entry=(i,k)=>{
    const s=g.shots[i]||{}, u=gmShotUnit(i,k), raw=s[k?'b':'a'];
    const shown=(raw===''||raw==null)?'':gmFromFeet(raw,u);
    const other = gmUnitPair().filter(x=>x!==u)[0];
    const swap = '<button type="button" class="wg-u" title="Switch this entry to '+other+'"'
        + ' onclick="gmCycleUnit('+i+','+k+')">'+u+'</button>';
    return '<div class="wg-in"><input type="number" step="'+(u==='cm'?5:u==='ft'?1:0.5)+'" min="0" inputmode="decimal"'
      + ' placeholder="-" value="'+shown+'" oninput="gmSetShot('+i+','+k+',this.value)">'
      + swap + '</div>';
  };
  const body=rows.map(r=>{
    const won=(k,which)=> ((which==='g'?r.wonGross:r.wonNet)===(k?'b':'a')) ? ' wg-win' : '';
    return '<tr>'
      + '<th scope="row" class="wg-st">'+ydNum(r.dist)+'</th>'
      + '<td class="wg-cell">'+entry(r.i,0)+'</td>'
      + '<td class="wg-num'+won(0,'g')+'">'+f1(r.gross[0])+'</td>'
      + '<td class="wg-num wg-net'+won(0,'n')+'">'+f1(r.net[0])+'</td>'
      + '<td class="wg-cell">'+entry(r.i,1)+'</td>'
      + '<td class="wg-num'+won(1,'g')+'">'+f1(r.gross[1])+'</td>'
      + '<td class="wg-num wg-net'+won(1,'n')+'">'+f1(r.net[1])+'</td>'
      + gmRunCell(r.run?r.run.gMedal:null,'medal',names)
      + gmRunCell(r.run?r.run.gMatch:null,'match',names)
      + gmRunCell(r.run?r.run.nMedal:null,'medal',names)
      + gmRunCell(r.run?r.run.nMatch:null,'match',names)
      + '</tr>';
  }).join('');
  const vsPar=v=>{const d=v-tot.par; return (d>0?'+':'')+d.toFixed(1);};
  const done=tot.played[0]===rows.length && tot.played[1]===rows.length;
  const grossTot={...tot, up:tot.grossUp, holes:tot.grossHoles,
    left:rows.length-tot.grossHoles, matchDone:Math.abs(tot.grossUp)>rows.length-tot.grossHoles};
  host.innerHTML=
    '<div class="wg-scroll"><table class="wg-tbl"><thead>'
    + '<tr><th rowspan="2" class="wg-st">Station<br><span>'+ydUnit()+'</span></th>'
    + '<th colspan="3">'+escapeHtml(names[0])+'</th><th colspan="3">'+escapeHtml(names[1])+'</th>'
    + '<th colspan="2" class="wg-grp">Gross</th><th colspan="2" class="wg-grp">Net</th></tr>'
    + '<tr><th>Prox</th><th>Gross</th><th>Net</th><th>Prox</th><th>Gross</th><th>Net</th>'
    + '<th class="wg-grp">Medal</th><th class="wg-grp">Match</th>'
    + '<th class="wg-grp">Medal</th><th class="wg-grp">Match</th></tr></thead>'
    + '<tbody>'+body+'</tbody><tfoot>'
    + '<tr><th class="wg-st">Total</th><th></th>'
    + '<th class="wg-num">'+(tot.played[0]?f1(tot.gross[0]):'-')+'</th>'
    + '<th class="wg-num wg-net">'+(tot.played[0]?f1(tot.net[0]):'-')+'</th><th></th>'
    + '<th class="wg-num">'+(tot.played[1]?f1(tot.gross[1]):'-')+'</th>'
    + '<th class="wg-num wg-net">'+(tot.played[1]?f1(tot.net[1]):'-')+'</th>'
    + '<th colspan="2" class="wg-foot-res">'+escapeHtml(gmMatchText(grossTot,names))+'</th>'
    + '<th colspan="2" class="wg-foot-res">'+escapeHtml(gmMatchText(tot,names))+'</th></tr>'
    + '<tr class="wg-vspar"><th>vs par '+tot.par+'</th><th></th>'
    + '<th colspan="2">'+(done?vsPar(tot.gross[0])+' gross':tot.played[0]+'/'+rows.length)+'</th><th></th>'
    + '<th colspan="2">'+(done?vsPar(tot.gross[1])+' gross':tot.played[1]+'/'+rows.length)+'</th>'
    + '<th colspan="4">net '+(done?vsPar(tot.net[0]):'-')+' vs '+(done?vsPar(tot.net[1]):'-')+'</th></tr>'
    + '</tfoot></table></div>'
    + '<div class="wg-strokes">'
    + ((tot.allow[0]||tot.allow[1])
        ? 'Strokes given: <b>'+Math.abs(tot.allow[0]-tot.allow[1]).toFixed(2)+'</b> to '
          + escapeHtml(tot.allow[0]>tot.allow[1]?names[0]:names[1])+' over '+rows.length
          + ' stations - '+tot.allow[0].toFixed(2)+' vs '+tot.allow[1].toFixed(2)+'.'
        : 'No strokes given - enter a Trackman index for either player.')
    + '</div>';
}
function buildGames(){
  const wrap=document.getElementById('games-wrap'); if(!wrap) return;
  const g=gmState();
  const pIn=k=>'<div class="wg-player">'
    + '<input class="wg-name" type="text" placeholder="'+(k?'Player 2':'Player 1')+'" value="'+escapeHtml(g.players[k].name||'')+'"'
    + ' oninput="gmSetPlayer('+k+',\'name\',this.value)">'
    + '<label>Trackman index<input class="wg-hcp" type="number" step="0.1" placeholder="0.0" value="'
    + ((g.players[k].hcp===''||g.players[k].hcp==null)?'':g.players[k].hcp)+'"'
    + ' oninput="gmSetPlayer('+k+',\'hcp\',this.value)"></label></div>';
  const hist=(g.sessions||[]).slice(0,8).map(s=>'<div class="wg-hist-row">'
    + '<span>'+s.date+'</span>'
    + '<span>'+escapeHtml(s.players[0].name||'P1')+' <b>'+s.net[0]+'</b></span>'
    + '<span>'+escapeHtml(s.players[1].name||'P2')+' <b>'+s.net[1]+'</b></span>'
    + '<span class="wg-hist-m">'+(s.up===0?'halved':escapeHtml((s.up>0?s.players[0].name:s.players[1].name)||'P')+' '+Math.abs(s.up)+' up')+'</span>'
    + '<button class="sgcal-del" onclick="gmDeleteSession(\''+s.id+'\')">&#10005;</button></div>').join('');
  wrap.innerHTML=
    '<div class="section-label" style="margin-top:0">12-Shot Wedge Game <span class="proto-badge">prototype</span></div>'
    + '<p class="intro-note">One shot from each of twelve stations, '+fmtYd(10)+' through '+fmtYd(120)
    + '. Type how close it finished - '+(gmMetric()?'in centimetres or metres':'in feet or yards')+', your choice per shot'+' - and a scratch golfer holes out from there, so each station scores <b>1 + the strokes scratch needs from that proximity</b>. Twelve par 3s: <b>par '
    + (WEDGE_STATIONS_YD.length*WEDGE_PAR_PER)+'</b>, and scratch shoots about <b>31.8</b>. All four games run at once.</p>'
    + '<div class="wg-players">'+pIn(0)+pIn(1)+'</div>'
    + '<div id="wedge-grid"></div>'
    + '<div class="btn-row" style="margin:12px 0 0">'
    + '<button class="btn btn-primary" onclick="gmSave()">Save session</button>'
    + '<button class="btn" onclick="gmClear()">Clear card</button></div>'
    + '<details class="pg-wrap" style="margin-top:14px"><summary>How the index is applied - and where it is weak</summary><div class="pg-body">'
    + '<p class="gen-note" style="margin-top:0">A Trackman index describes whole golf. This game removes nearly all of it: both players\' balls are holed out by the same scratch golfer, so the only skill measured is how close the wedge finishes. Handing out the full index would give strokes for putting nobody is doing.</p>'
    + '<p class="gen-note">So the allowance is solved out of the app\'s own handicap rule rather than invented. That rule says a handicap player\'s expected strokes from '+ydUnit()+' <i>d</i> are <b>S(d,h) = S&#8320; + 0.012&#183;h&#183;(S&#8320;&#8722;1)</b>. Their total is the wedge, then <i>their own</i> putting from <i>their own</i> proximity - and it is that proximity, holed out by scratch, that this game scores. Solving for it gives the number used here. It collapses to scratch at 0, and for a 15 index comes out near <b>0.15</b> a station - about half the naive full-index gap. The other half was putting.</p>'
    + '<p class="gen-note"><b>Where it is weak:</b> that allowance works out identical at '+fmtYd(10)+' and at '+fmtYd(120)+', which is almost certainly wrong - a 15 index is much nearer scratch from '+fmtYd(10)+'. It is a property of the linear handicap rule, which attributes all of the distance-dependence to putting. Playing this game is what would fix it: proximity by distance by player, repeated, is exactly the data needed to measure the allowance instead of deriving it.</p>'
    + '<p class="gen-note" style="margin-bottom:0">Because every score here is a real number, strokes are applied exactly rather than allocated whole to the hardest holes - net is simply gross minus the allowance, on every station.</p>'
    + '</div></details>'
    + (hist?'<div class="section-label" style="margin-top:18px">Past sessions</div><div class="wg-hist">'+hist+'</div>':'');
  buildGamesGrid();
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { WEDGE_STATIONS_YD, WEDGE_PAR_PER, gmState, gmScore, gmAllowance, gmCard,
  gmSetPlayer, gmSetShot, gmCycleUnit, gmMetric, gmUnitPair, GM_UNITS, GM_FT_PER, gmShotUnit, gmToFeet, gmFromFeet, gmClear, gmSave,
  gmDeleteSession, gmMatchText, gmRunCell, buildGames, buildGamesGrid });
