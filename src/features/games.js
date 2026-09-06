// features/games.js — Practice games (Trackman range / simulator / putting green). On-course
// wagering formats live in games-round.js. Scoring reuses the app's own strokes-gained
// baselines so a practice game and a real round are measured on the same scale.

/* ============================================================
   THE STRONGERGOLF COMBINES — FOUR 12-SHOT GAMES
   ============================================================
   Four games, twelve shots each, all scored in the same currency: EXPECTED SCRATCH STROKES.
   Every station asks the same question — after this shot, how many strokes does a scratch
   golfer need to finish? — so a wedge station, a drive and a putt are directly comparable,
   and so is a whole game against a real round's strokes gained.

       Wedge    12 stations 10-120 yd     record proximity
       Irons    12 stations 130-212 yd    record proximity
       Driver   12 drives                 record total + how far offline at rest
       Putting  12 putts, 6 up 6 down     record putts taken

   Par is always "what scratch was expected to need", so a score under par IS strokes gained.

   ---- THE HANDICAP PROBLEM, AND WHY IT IS NOT THE FULL INDEX ----
   A Trackman index describes whole golf — driving, approach, short game, putting. Three of
   these games remove most of that: the ball is holed out by the same scratch golfer, so the
   ONLY skill measured is the one shot. Applying the full index would hand out strokes for
   putting nobody is doing.

   The right allowance falls out of the app's own handicap rule rather than being invented.
   That rule is  S(d,h) = S0 + 0.012*h*(S0 - 1)  — expected strokes to hole out from d. For a
   handicap player that total is their own shot, then THEIR OWN play from where it finished:

       S(d,h) - 1 = G*(1 + 0.012h) - 0.012h        G = scratch strokes from their result

   and G is exactly what these games score. Solving:

       ExpectedScratchScore(d,h) = 1 + [ S(d,h) - 1 + 0.012h ] / (1 + 0.012h)

   No new constant, and it collapses to S(d,0) at scratch. See gmAllowance.

   THE PUTTING GAME IS THE EXCEPTION, and deliberately: there the player does the putting
   themselves, so the skill being measured IS the skill the index describes. Its allowance is
   simply the baseline difference, with no solving required.

   ---- LIMITATIONS SHIPPED VISIBLY, NOT BURIED ----
   1. MEASURED: the solved allowance comes out IDENTICAL at 10 yards and at 120 (0.1525 a
      station for a 15 index either way). That is a property of the linear handicap rule,
      which attributes all of the distance-dependence to putting. Almost certainly wrong — a
      15 index is much nearer scratch from 10 yards than from 120.
   2. The putting game records uphill vs downhill but PARS THEM THE SAME, because the putting
      baseline is distance-only. A downhill 15-footer is plainly harder than an uphill one.
   3. Recovery (>30 yd offline) is rough plus a flat 0.60 (see SR_RECOVERY_OVER_ROUGH).
   All three are fixable from exactly the data these games generate: play them enough and the
   numbers can be measured instead of derived. That is the point of keeping records. */

const WEDGE_STATIONS_YD = [10,20,30,40,50,60,70,80,90,100,110,120];
const IRON_STATIONS_YD  = [130,137,145,152,160,167,175,182,190,197,205,212];
const PUTT_STATIONS_FT  = [3,6,9,12,15,18];
const WEDGE_PAR_PER = 3;
/* Driver: a drive only means something against a hole. This is the reference hole the drives
   are played on — change it and every drive is rescored against the new length. */
const DRIVE_HOLE_DEFAULT_YD = 420;
/* Offline bands, in yards from the centre line (Mark's sheet: fairway 15 yd either side =
   30 yd wide, rough out to 30, recovery beyond). Entry is the OFFLINE NUMBER, not a tick-box:
   the band is derived from it, so the data keeps its resolution. */
const DRIVE_BANDS = [
  { key:'fwy', lie:'fairway',  label:'Fwy', max:15, desc:'within 15 yd of the centre line' },
  { key:'rgh', lie:'rough',    label:'Rgh', max:30, desc:'15-30 yd offline' },
  { key:'rcy', lie:'recovery', label:'Rcy', max:Infinity, desc:'more than 30 yd offline' }
];

const GM_GAMES = {
  wedge:  { key:'wedge',  label:'Wedge',   kind:'prox',  stations:WEDGE_STATIONS_YD, parPer:WEDGE_PAR_PER,
            blurb:'One shot from each of twelve stations. Type how close it finished.' },
  irons:  { key:'irons',  label:'Irons',   kind:'prox',  stations:IRON_STATIONS_YD,  parPer:WEDGE_PAR_PER,
            blurb:'One shot at each of twelve distances. Type how close it finished.' },
  driver: { key:'driver', label:'Driver',  kind:'drive', stations:null, count:12,
            blurb:'Twelve drives, all count. Type the total distance and how far offline it finished.' },
  putt:   { key:'putt',   label:'Putting', kind:'putt',  stations:null, count:12,
            blurb:'Twelve putts - six uphill, six downhill. Type how many putts it took.' }
};
/* Putting stations built once: six uphill then six downhill, matching the card. */
GM_GAMES.putt.stations = ['up','down'].flatMap(dir=>PUTT_STATIONS_FT.map(ft=>({ft,dir})));

function gmActiveKey(){
  STATE.games = STATE.games || {};
  const k = STATE.games.active;
  return GM_GAMES[k] ? k : 'wedge';
}
function gmSetGame(k){
  if(!GM_GAMES[k]) return;
  STATE.games = STATE.games || {};
  STATE.games.active = k;
  saveState(); buildGames();
}
function gmG(key){ return GM_GAMES[key||gmActiveKey()]; }
/* How many rows a game has. */
function gmRowCount(G){ return G.stations ? G.stations.length : G.count; }

function gmState(key){
  const k = key||gmActiveKey(), G = GM_GAMES[k];
  STATE.games = STATE.games || {};
  const g = STATE.games[k] = STATE.games[k] || {};
  const n = gmRowCount(G);
  g.players = g.players || [{name:'', hcp:''},{name:'', hcp:''}];
  /* Practice games are one or two players, never more — a range bay or a putting green is
     not a fourball. Solo is the default because a card with an empty second column is worse
     than a card without one, and solo is how these get played most: you, a bag of balls, and
     your own record to beat. On-course games are the four-player side of the app.
     A card saved BEFORE this mode existed opens the way its data says it was being used —
     flipping a live two-player card to solo would look like the opponent's scores had been
     thrown away. */
  if(g.mode!=='vs' && g.mode!=='solo'){
    const p2Used = (g.players[1] && (g.players[1].name || g.players[1].hcp!=='' && g.players[1].hcp!=null))
      || (g.shots||[]).some(s=>s && (s.b!==''&&s.b!=null));
    g.mode = p2Used ? 'vs' : 'solo';
  }
  g.shots   = g.shots   || Array.from({length:n},()=>({}));
  g.sessions= g.sessions|| [];
  if(g.shots.length!==n) g.shots=Array.from({length:n},(_,i)=>g.shots[i]||{});
  if(G.kind==='drive' && (g.holeYd==null||isNaN(parseFloat(g.holeYd)))) g.holeYd=DRIVE_HOLE_DEFAULT_YD;
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
/* Which band a drive finished in, from its offline distance in yards. */
function gmDriveBand(offYd){
  const o=Math.abs(parseFloat(offYd));
  if(isNaN(o)) return null;
  return DRIVE_BANDS.find(b=>o<=b.max) || DRIVE_BANDS[DRIVE_BANDS.length-1];
}
/* A drive's expected scratch score: the drive itself, then scratch from where it finished.
   Distance is TOTAL, not carry, and offline is measured where the ball came to REST — the
   next shot is played from where the ball stopped, so that is the only position that decides
   the lie and what is left. A drive that carries the fairway and runs into the trees is a
   recovery, and scoring it off the carry would have called it a fairway.
   Distance remaining is floored so driving it near the green cannot go negative. */
function gmDriveScore(ydg, offYd, holeYd){
  const d=parseFloat(ydg), band=gmDriveBand(offYd);
  if(isNaN(d)||!band||typeof srForPlayer!=='function') return null;
  const rem=Math.max(10, (parseFloat(holeYd)||DRIVE_HOLE_DEFAULT_YD) - d);
  const after=srForPlayer(band.lie, rem, 0);
  return after==null?null:1+after;
}
/* Par for one row, by game kind. Always "what scratch was expected to need". */
function gmPar(G, i, g){
  if(G.kind==='prox') return G.parPer;
  if(G.kind==='putt'){
    const st=G.stations[i];
    const v=(typeof srForPlayer==='function')?srForPlayer('green', st.ft, 0):null;
    return v==null?null:v;
  }
  if(G.kind==='drive'){
    const v=(typeof srForPlayer==='function')?srForPlayer('tee', parseFloat(g.holeYd)||DRIVE_HOLE_DEFAULT_YD, 0):null;
    return v==null?null:v;
  }
  return null;
}
/* The per-station allowance a handicap earns in THIS game — derived, not assumed. Computed
   against the model rather than from the closed form, so if the handicap rule ever becomes
   distance-aware this follows it without being touched.
   `lie`/`dist` say what the shot is played from; the putting game overrides entirely because
   there the player does the putting themselves (see the header note). */
function gmAllowance(dist, hcp, lie){
  const h=parseFloat(hcp); if(!h||isNaN(h)||typeof srForPlayer!=='function') return 0;
  const ess=(hh)=>{ const S=srForPlayer(lie||'fairway', dist, hh); if(S==null) return null;
    return 1 + (S-1+0.012*hh)/(1+0.012*hh); };
  const a=ess(h), b=ess(0);
  return (a==null||b==null)?0:a-b;
}
/* Putting is the exception: the skill measured IS the skill the index describes, so the
   allowance is just the baseline difference — no solving. */
function gmPuttAllowance(distFt, hcp){
  const h=parseFloat(hcp); if(!h||isNaN(h)||typeof srForPlayer!=='function') return 0;
  const a=srForPlayer('green', distFt, h), b=srForPlayer('green', distFt, 0);
  return (a==null||b==null)?0:a-b;
}
function gmRowAllowance(G, i, g, k){
  const hcp=g.players[k].hcp;
  if(G.kind==='prox')  return gmAllowance(G.stations[i], hcp, 'fairway');
  if(G.kind==='putt')  return gmPuttAllowance(G.stations[i].ft, hcp);
  if(G.kind==='drive') return gmAllowance(parseFloat(g.holeYd)||DRIVE_HOLE_DEFAULT_YD, hcp, 'tee');
  return 0;
}
/* The gross score for one row and one player, by kind. */
function gmRowGross(G, i, g, k){
  const s=g.shots[i]||{}, key=k?'b':'a';
  if(G.kind==='prox') return gmScore(s[key]);
  if(G.kind==='putt'){ const n=parseFloat(s[key]); return (isNaN(n)||n<=0)?null:n; }
  if(G.kind==='drive') return gmDriveScore(s[key], s[key+'Off'], g.holeYd);
  return null;
}
/* Everything the card needs, computed in one place so the table, the totals and the match
   status can never disagree with each other. */
function gmCard(key){
  const k=key||gmActiveKey(), G=GM_GAMES[k], g=gmState(k);
  const n=gmRowCount(G);
  const rows=Array.from({length:n},(_,i)=>{
    const r={ i, par:gmPar(G,i,g), p:[], gross:[], allow:[], net:[] };
    r.station = G.kind==='prox' ? G.stations[i] : (G.kind==='putt' ? G.stations[i] : i+1);
    [0,1].forEach(kk=>{
      r.gross[kk]=gmRowGross(G,i,g,kk);
      r.allow[kk]=gmRowAllowance(G,i,g,kk);
      r.net[kk]=(r.gross[kk]==null)?null:r.gross[kk]-r.allow[kk];
    });
    /* Four games run at once, which is how golfers actually play: gross and net, medal and
       match. A hole is won on GROSS for one pair of them and on NET for the other. */
    const decide=(x,y)=> (x==null||y==null) ? null : (Math.abs(x-y)<0.005?'half':(x<y?'a':'b'));
    r.wonGross=decide(r.gross[0], r.gross[1]);
    r.won=r.wonNet=decide(r.net[0], r.net[1]);
    return r;
  });
  const parTot=rows.reduce((a,r)=>a+(r.par==null?0:r.par),0);
  const tot={ par:parTot, gross:[0,0], net:[0,0], played:[0,0],
              allow:[0,0], holes:0, up:0, grossHoles:0, grossUp:0, matchDone:false };
  /* running state after each hole, so every row can show where all four games stood */
  let gm=0, nm=0, gu=0, nu=0;
  rows.forEach(r=>{
    [0,1].forEach(kk=>{ if(r.gross[kk]!=null){ tot.gross[kk]+=r.gross[kk]; tot.net[kk]+=r.net[kk];
      tot.allow[kk]+=r.allow[kk]; tot.played[kk]++; } });
    const both = r.gross[0]!=null && r.gross[1]!=null;
    if(both){ gm += r.gross[0]-r.gross[1]; nm += r.net[0]-r.net[1]; }
    if(r.wonGross){ tot.grossHoles++; if(r.wonGross==='a') gu++; else if(r.wonGross==='b') gu--; }
    if(r.wonNet){ tot.holes++; if(r.wonNet==='a') nu++; else if(r.wonNet==='b') nu--; }
    r.run = both ? { gMedal:gm, nMedal:nm, gMatch:gu, nMatch:nu } : null;
  });
  tot.up=nu; tot.grossUp=gu; tot.gMedal=gm; tot.nMedal=nm;
  /* par for the stations actually PLAYED, so "vs par" means something on a part-finished
     card — the games no longer all have a flat par per station. */
  tot.parPlayed=[0,1].map(kk=>rows.reduce((a,r)=>a+((r.gross[kk]!=null&&r.par!=null)?r.par:0),0));
  /* match play: are we already decided with holes to spare? */
  const left=n-tot.holes;
  tot.left=left;
  tot.matchDone = Math.abs(tot.up)>left;
  return { g, G, rows, tot, n };
}
function gmSetPlayer(k, field, val){
  const g=gmState();
  g.players[k][field]= field==='hcp' ? (val===''?'':parseFloat(val)) : val;
  saveState(); buildGames();
}
function gmSetHole(val){
  const g=gmState(); const v=fromDisplay('distance', val);
  g.holeYd = (isNaN(v)||v<=0) ? DRIVE_HOLE_DEFAULT_YD : v;
  saveState(); buildGamesGrid();
}
function gmSetMode(m){
  const g=gmState(); g.mode = (m==='vs')?'vs':'solo';
  saveState(); buildGames();
}
function gmSolo(g){ return (g||gmState()).mode!=='vs'; }
/* Personal best and average for THIS game, from saved sessions — the thing a solo card is
   actually played against (Mark's note: "either solo -> keep records/PB, avg. scores").
   Player 1's net total is "your" score whether the session was solo or a match. */
function gmRecords(g){
  const vals=(g.sessions||[]).map(s=>s.net&&s.net[0]).filter(v=>typeof v==='number'&&isFinite(v));
  if(!vals.length) return null;
  return { pb:Math.min(...vals), avg:vals.reduce((a,b)=>a+b,0)/vals.length, n:vals.length };
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
  const G=gmG(), pair=gmUnitPair(), g=gmState(), s=g.shots[i]||{};
  const saved=s[(k?'b':'a')+'U'];
  if(saved && pair.indexOf(saved)>=0) return saved;      // honoured only within this system
  const st=G.kind==='prox'?G.stations[i]:0;
  return st>=70 ? pair[1] : pair[0];
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
  const G=gmG(), g=gmState();
  g.shots[i]=g.shots[i]||{};
  /* Storage is canonical, always: proximity in FEET (through the per-entry unit), drive
     drive total in YARDS (through the display unit, so a metric player types metres), putts as a
     plain count. Only entry and redisplay convert. */
  g.shots[i][k?'b':'a'] = (val===''?''
    : G.kind==='prox'  ? gmToFeet(val, gmShotUnit(i,k))
    : G.kind==='drive' ? fromDisplay('distance', val)
    : parseFloat(val));
  saveState(); buildGamesGrid();
}
/* Drive offline. Stored in YARDS like every other distance in the app; typed in whatever
   the player's unit is. */
function gmSetOff(i, k, val){
  const g=gmState();
  g.shots[i]=g.shots[i]||{};
  g.shots[i][(k?'b':'a')+'Off'] = (val===''?'':fromDisplay('distance', val));
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
  const G=gmG(), g=gmState(); g.shots=Array.from({length:gmRowCount(G)},()=>({}));
  saveState(); buildGames();
}
function gmSave(){
  const {g,G,rows,tot}=gmCard();
  if(!tot.played[0] && !tot.played[1]){ toast('Nothing to save yet'); return; }
  const solo=gmSolo(g);
  g.sessions.unshift({ id:G.key+Date.now().toString(36), date:new Date().toISOString().slice(0,10),
    mode:g.mode, par:+tot.parPlayed[0].toFixed(1),
    players:JSON.parse(JSON.stringify(g.players)), shots:JSON.parse(JSON.stringify(g.shots)),
    net:[+tot.net[0].toFixed(1), solo?null:+tot.net[1].toFixed(1)], up:solo?0:tot.up });
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
/* ---------- ONE GRID, BUILT FOR A PHONE ----------
   This card is filled in standing on a range mat or a putting green, one-handed, so the
   layout is a STATION LIST, not a spreadsheet. The old 11-column table put the four running
   games in their own columns, which forced a horizontal scroll on every device that will
   actually be used — you cannot type a number and read its effect if they are 300px apart.
   Instead: station down the left, one tappable block per player, and the four running games
   as a live summary strip above the list. The strip is what you glance at between shots; the
   row is what you touch. Nothing scrolls sideways. */
function gmRunText(v, kind, names){
  if(v==null) return '-';
  const A=names[0]||'P1', B=names[1]||'P2';
  if(kind==='medal'){
    if(Math.abs(v)<0.05) return 'All square';
    return (v<0?A:B)+' by '+Math.abs(v).toFixed(1);
  }
  if(v===0) return 'All square';
  return (v>0?A:B)+' '+Math.abs(v)+' up';
}
function gmRunClass(v, kind){
  if(v==null) return '';
  const flat = kind==='medal' ? Math.abs(v)<0.05 : v===0;
  if(flat) return '';
  /* medal counts strokes (lower is better, so negative means player A leads); match counts
     holes up (positive means A leads). Same colour, opposite sign — easy to get backwards. */
  const aLeads = kind==='medal' ? v<0 : v>0;
  return aLeads ? ' gm-lead-a' : ' gm-lead-b';
}
/* The station label in the first column, per kind. */
function gmStationLabel(G, r){
  if(G.kind==='prox') return ydNum(r.station);
  /* putt stations are stored in FEET (the baseline's own index) but shown in the player's
     short unit, so a metric card reads 4.6 m rather than a bare 15 */
  if(G.kind==='putt') return ftNum(r.station.ft);
  return '#'+r.station;
}
function buildGamesGrid(){
  const host=document.getElementById('wedge-grid'); if(!host) return;
  const {g,G,rows,tot,n}=gmCard();
  const solo=gmSolo(g);
  const names=[g.players[0].name||(solo?'You':'Player 1'), g.players[1].name||'Player 2'];
  const f1=v=>v==null?'-':v.toFixed(1);
  /* --- the entry cell, which is the only thing that really differs between the games --- */
  const entry=(i,k)=>{
    const s=g.shots[i]||{}, raw=s[k?'b':'a'];
    if(G.kind==='prox'){
      const u=gmShotUnit(i,k);
      const shown=(raw===''||raw==null)?'':gmFromFeet(raw,u);
      const other = gmUnitPair().filter(x=>x!==u)[0];
      const swap = '<button type="button" class="wg-u" title="Switch this entry to '+other+'"'
          + ' onclick="gmCycleUnit('+i+','+k+')">'+u+'</button>';
      return '<div class="wg-in"><input type="number" step="'+(u==='cm'?5:u==='ft'?1:0.5)+'" min="0" inputmode="decimal"'
        + ' placeholder="-" value="'+shown+'" oninput="gmSetShot('+i+','+k+',this.value)">'
        + swap + '</div>';
    }
    if(G.kind==='putt'){
      return '<div class="wg-in"><input type="number" step="1" min="1" max="6" inputmode="numeric"'
        + ' placeholder="-" value="'+((raw===''||raw==null)?'':raw)+'" oninput="gmSetShot('+i+','+k+',this.value)">'
        + '<span class="wg-u wg-u-fixed">putts</span></div>';
    }
    /* drive: TOTAL distance AND offline at rest, because the band is derived from the number
       rather than ticked — that keeps the resolution the tick-boxes on the paper card threw
       away. Both are stored in yards and shown in the player's own unit. */
    const off=s[(k?'b':'a')+'Off'];
    const band=gmDriveBand(off);
    const chip=band?'<span class="gm-band gm-band-'+band.key+'">'+band.label+'</span>':'<span class="gm-band">-</span>';
    return '<div class="gm-drive">'
      + '<input type="number" step="1" min="0" inputmode="numeric" placeholder="total" value="'+((raw===''||raw==null)?'':ydNum(raw))+'"'
      + ' oninput="gmSetShot('+i+','+k+',this.value)">'
      + '<input type="number" step="1" min="0" inputmode="numeric" placeholder="off" value="'+((off===''||off==null)?'':ydNum(off))+'"'
      + ' oninput="gmSetOff('+i+','+k+',this.value)">'
      + chip + '</div>';
  };
  const body=rows.map(r=>{
    const stCls = (G.kind==='putt' && r.station.dir==='down') ? ' gm-down' : '';
    const side=k=>{
      const winG=!solo&&r.wonGross===(k?'b':'a'), winN=!solo&&r.wonNet===(k?'b':'a');
      /* solo has nobody to beat on the row, so the row shows the shot against PAR instead
         of against an opponent: under par is the good colour, over par the bad one */
      let sc;
      if(r.gross[k]==null) sc='<span class="gm-sc-none">&mdash;</span>';
      else if(solo){
        const d=r.gross[k]-(r.par==null?r.gross[k]:r.par);
        const cls = Math.abs(d)<0.05 ? '' : (d<0?' gm-won':' gm-lost');
        sc='<b class="gm-sc-g'+cls+'">'+f1(r.gross[k])+'</b>'
          + '<i class="gm-sc-n'+cls+'">'+(d>0?'+':'')+d.toFixed(1)+'</i>';
      } else {
        sc='<b class="gm-sc-g'+(winG?' gm-won':'')+'">'+f1(r.gross[k])+'</b>'
          + '<i class="gm-sc-n'+(winN?' gm-won':'')+'">'+f1(r.net[k])+' net</i>';
      }
      return '<div class="gm-side">'+entry(r.i,k)+'<div class="gm-sc">'+sc+'</div></div>';
    };
    /* the unit lives in the column head, so the only per-row subtitle worth the space is the
       putting card's up/down, which genuinely changes shot to shot */
    const sub = G.kind==='putt' ? (r.station.dir==='up'?'up':'down') : '';
    /* par per row only where it VARIES — on the prox games every station is par 3 and
       printing it twelve times is noise on a phone */
    const parTag = (G.kind!=='prox' && r.par!=null) ? '<em>par '+r.par.toFixed(1)+'</em>' : '';
    return '<div class="gm-row'+stCls+'">'
      + '<div class="gm-st">'+gmStationLabel(G,r)+(sub?'<span>'+sub+'</span>':'')+parTag+'</div>'
      + side(0) + (solo?'':side(1))
      + '</div>';
  }).join('');
  /* vs par is measured against the par of the stations actually played, so a half-finished
     card reads honestly rather than showing a huge negative */
  const vsPar=(v,k)=>{const d=v-tot.parPlayed[k]; return (d>0?'+':'')+d.toFixed(1);};
  const done=tot.played[0]===n && tot.played[1]===n;
  const grossTot={...tot, up:tot.grossUp, holes:tot.grossHoles,
    left:n-tot.grossHoles, matchDone:Math.abs(tot.grossUp)>n-tot.grossHoles};
  const entryHead = G.kind==='prox'?'Prox' : G.kind==='putt'?'Putts' : 'Total / Off';
  /* The four running games as a strip you glance at, rather than four table columns you
     have to scroll to. Gross pair first, then net, matching the card's own order.
     Solo has no match to run, so the same strip carries what a solo card IS played against:
     the score, where it stands against par, and your own record. */
  const tile=(lbl,v,kind)=>'<div class="gm-tile'+gmRunClass(v,kind)+'"><span>'+lbl+'</span><b>'
    + escapeHtml(gmRunText(v,kind,names))+'</b></div>';
  const flat=(lbl,val,cls)=>'<div class="gm-tile'+(cls||'')+'"><span>'+lbl+'</span><b>'+val+'</b></div>';
  const rec=gmRecords(g);
  const soloDelta = tot.played[0] ? tot.gross[0]-tot.parPlayed[0] : null;
  const summary = solo
    ? '<div class="gm-tiles">'
      + flat('Score', tot.played[0]?f1(tot.gross[0]):'-')
      + flat('vs par', soloDelta==null?'-':((soloDelta>0?'+':'')+soloDelta.toFixed(1)),
             soloDelta==null||Math.abs(soloDelta)<0.05?'':(soloDelta<0?' gm-lead-a':' gm-lead-b'))
      + flat('Personal best', rec?rec.pb.toFixed(1):'&mdash;')
      + flat('Average'+(rec?' of '+rec.n:''), rec?rec.avg.toFixed(1):'&mdash;')
      + '</div>'
    : '<div class="gm-tiles">'
      + tile('Gross medal', tot.played[0]&&tot.played[1]?tot.gMedal:null, 'medal')
      + tile('Gross match', tot.grossHoles?tot.grossUp:null, 'match')
      + tile('Net medal',   tot.played[0]&&tot.played[1]?tot.nMedal:null, 'medal')
      + tile('Net match',   tot.holes?tot.up:null, 'match')
      + '</div>';
  const totLine=k=>'<div class="gm-tot-side"><span>'+escapeHtml(names[k])+'</span>'
    + '<b>'+(tot.played[k]?f1(tot.gross[k]):'-')+'</b>'
    + '<i>'+(tot.played[k]?f1(tot.net[k])+' net':'&nbsp;')+'</i>'
    + '<em>'+(tot.played[k]?vsPar(tot.gross[k],k)+(done?' vs par':' so far'):tot.played[k]+'/'+n)+'</em></div>';
  host.innerHTML=
    summary
    + '<div class="gm-list-head'+(solo?' gm-solo':'')+'"><div class="gm-st">'
    + (G.kind==='drive'?'Drive':G.kind==='putt'?('Putt <span>'+ftUnit()+'</span>'):('Stn <span>'+ydUnit()+'</span>'))+'</div>'
    + '<div>'+escapeHtml(names[0])+'<span>'+entryHead+'</span></div>'
    + (solo?'':'<div>'+escapeHtml(names[1])+'<span>'+entryHead+'</span></div>')+'</div>'
    + '<div class="gm-list'+(solo?' gm-solo-list':'')+'">'+body+'</div>'
    + '<div class="gm-totals'+(solo?' gm-solo':'')+'"><div class="gm-st">Total<span>par '+tot.par.toFixed(tot.par%1?1:0)+'</span></div>'
    + totLine(0)+(solo?'':totLine(1))+'</div>'
    + (solo?''
        : '<div class="gm-result"><div><span>Gross</span>'+escapeHtml(gmMatchText(grossTot,names))+'</div>'
          + '<div><span>Net</span>'+escapeHtml(gmMatchText(tot,names))+'</div></div>')
    + '<div class="wg-strokes">'
    + (solo
        ? (rec ? 'Best <b>'+rec.pb.toFixed(1)+'</b> and average <b>'+rec.avg.toFixed(1)+'</b> over '+rec.n
                 + ' saved '+(rec.n===1?'session':'sessions')+'. Save this card to add to the record.'
               : 'No saved sessions yet - save a card and this becomes your personal best and running average.')
        : (tot.allow[0]||tot.allow[1])
        ? 'Strokes given: <b>'+Math.abs(tot.allow[0]-tot.allow[1]).toFixed(2)+'</b> to '
          + escapeHtml(tot.allow[0]>tot.allow[1]?names[0]:names[1])+' over '+n
          + ' stations - '+tot.allow[0].toFixed(2)+' vs '+tot.allow[1].toFixed(2)+'.'
        : 'No strokes given - enter a Trackman index for either player.')
    + '</div>';
}
/* Per-game intro copy — what the game is, what par is, and what scratch shoots. */
function gmIntro(G, tot, n){
  if(G.kind==='prox'){
    const lo=G.stations[0], hi=G.stations[G.stations.length-1];
    return 'One shot from each of twelve stations, '+fmtYd(lo)+' through '+fmtYd(hi)
      + '. Type how close it finished - '+(gmMetric()?'in centimetres or metres':'in feet or yards')
      + ', your choice per shot - and a scratch golfer holes out from there, so each station scores '
      + '<b>1 + the strokes scratch needs from that proximity</b>. Twelve par 3s: <b>par '+tot.par.toFixed(0)+'</b>.';
  }
  if(G.kind==='putt'){
    return 'Twelve putts - <b>six uphill then six downhill</b>, at '
      + PUTT_STATIONS_FT.map(f=>ftNum(f)).join(', ')+' '+ftUnit()+'. '
      + 'Type how many putts it took. Par is not a flat number here: it is <b>what scratch is expected '
      + 'to need from that distance</b>, so par for the card is <b>'+tot.par.toFixed(1)+'</b> and holing '
      + 'a 15-footer gains more than holing a 3-footer.';
  }
  const g=gmState();
  return 'Twelve drives, all count. Type the <b>total distance</b> and <b>how far offline it came to rest</b>, and each '
    + 'drive is played out on a reference hole: the drive itself, then scratch from where it left the ball. '
    + 'Total rather than carry, and offline at rest rather than at landing, because the next shot is played from '
    + 'where the ball <em>stopped</em> - one that carries the fairway and runs into the trees is a recovery. '
    + 'Par is what scratch was expected to shoot from the tee (<b>'+tot.par.toFixed(1)+'</b> over '+n+' drives), '
    + 'so distance and accuracy trade off against each other in real strokes rather than by tick-box.';
}
function buildGames(){
  const wrap=document.getElementById('games-wrap'); if(!wrap) return;
  const key=gmActiveKey(), G=GM_GAMES[key];
  const {g,tot,n}=gmCard(key);
  const solo=gmSolo(g);
  const pIn=k=>'<div class="wg-player">'
    + '<input class="wg-name" type="text" placeholder="'+(k?'Player 2':(solo?'You':'Player 1'))+'" value="'+escapeHtml(g.players[k].name||'')+'"'
    + ' oninput="gmSetPlayer('+k+',\'name\',this.value)">'
    + '<label>Trackman index<input class="wg-hcp" type="number" step="0.1" placeholder="0.0" value="'
    + ((g.players[k].hcp===''||g.players[k].hcp==null)?'':g.players[k].hcp)+'"'
    + ' oninput="gmSetPlayer('+k+',\'hcp\',this.value)"></label></div>';
  const modeRow='<div class="gm-mode">'
    + '<button type="button" class="gm-mode-btn'+(solo?' active':'')+'" onclick="gmSetMode(\'solo\')">Solo</button>'
    + '<button type="button" class="gm-mode-btn'+(solo?'':' active')+'" onclick="gmSetMode(\'vs\')">2 players</button>'
    + '</div>';
  const picker='<div class="gm-pick">'+Object.keys(GM_GAMES).map(k=>
      '<button type="button" class="gm-pick-btn'+(k===key?' active':'')+'" onclick="gmSetGame(\''+k+'\')">'
      + GM_GAMES[k].label+'</button>').join('')+'</div>';
  const holeRow = G.kind==='drive'
    ? '<div class="gm-hole"><label>Reference hole <input type="number" step="10" min="100" max="600" value="'
      + (parseFloat(g.holeYd)||DRIVE_HOLE_DEFAULT_YD)+'" oninput="gmSetHole(this.value)"> '+ydUnit()+'</label>'
      + '<span>Every drive is scored against this hole. '
      + DRIVE_BANDS.map(b=>'<b>'+b.label+'</b> '+b.desc).join(' &middot; ')+'.</span></div>'
    : '';
  /* A solo session has no opponent and no match — showing "Player 2 0 / halved" for one
     would be noise, so those rows report the score against par instead. */
  const best=gmRecords(g);
  const hist=(g.sessions||[]).slice(0,8).map(s=>{
    const wasSolo = s.mode==='solo' || !s.net || s.net[1]==null;
    const isPB = best && typeof s.net[0]==='number' && Math.abs(s.net[0]-best.pb)<0.001;
    return '<div class="wg-hist-row">'
      + '<span>'+s.date+(isPB?' <b class="gm-pb">PB</b>':'')+'</span>'
      + '<span>'+escapeHtml(s.players[0].name||(wasSolo?'You':'P1'))+' <b>'+s.net[0]+'</b></span>'
      + (wasSolo
          ? '<span class="wg-hist-m">'+(s.par!=null?((s.net[0]-s.par>0?'+':'')+(s.net[0]-s.par).toFixed(1)+' vs par'):'solo')+'</span><span></span>'
          : '<span>'+escapeHtml(s.players[1].name||'P2')+' <b>'+s.net[1]+'</b></span>'
            + '<span class="wg-hist-m">'+(s.up===0?'halved':escapeHtml((s.up>0?s.players[0].name:s.players[1].name)||'P')+' '+Math.abs(s.up)+' up')+'</span>')
      + '<button class="sgcal-del" onclick="gmDeleteSession(\''+s.id+'\')">&#10005;</button></div>';
  }).join('');
  /* Phone-first ordering: picker, players, then the CARD. The explanatory prose is real and
     worth keeping, but it is read once and then never again — on a range you want the entry
     grid inside a thumb's reach of the top, so the copy folds away under the card instead of
     pushing it down the screen. */
  wrap.innerHTML=
    '<div class="section-label" style="margin-top:0">StrongerGolf Combines <span class="proto-badge">prototype</span></div>'
    + picker
    + modeRow
    + holeRow
    + '<div class="wg-players">'+pIn(0)+(solo?'':pIn(1))+'</div>'
    + '<div id="wedge-grid"></div>'
    + '<div class="btn-row" style="margin:12px 0 0">'
    + '<button class="btn btn-primary" onclick="gmSave()">Save session</button>'
    + '<button class="btn" onclick="gmClear()">Clear card</button></div>'
    + '<details class="pg-wrap" style="margin-top:14px"><summary>What this game is, and how it scores</summary><div class="pg-body">'
    + '<p class="gen-note" style="margin-top:0">'+gmIntro(G, tot, n)+' All four match formats run at once.</p>'
    + '<p class="gen-note" style="margin-bottom:0">Four twelve-shot games share one currency - <b>expected scratch strokes</b> - so a wedge station, a drive and a putt are directly comparable, and a whole game compares with a real round\'s strokes gained.</p>'
    + '</div></details>'
    + '<details class="pg-wrap" style="margin-top:8px"><summary>How the index is applied - and where it is weak</summary><div class="pg-body">'
    + (G.kind==='putt'
        ? '<p class="gen-note" style="margin-top:0">This game is the exception among the four: <b>you do the putting yourself</b>, so the skill being measured is the skill the index describes. No solving is needed - the allowance is simply the difference between a handicap player\'s expected putts and scratch\'s from the same distance.</p>'
          + '<p class="gen-note"><b>Where it is weak, 1:</b> uphill and downhill are recorded but <b>parred the same</b>, because the putting baseline is distance-only. A downhill 15-footer is plainly harder than an uphill one. Playing this game is what would fix it - the up/down split is stored on every putt, so the difference can be measured and turned into a real adjustment.</p>'
          + '<p class="gen-note"><b>Where it is weak, 2:</b> par from 3 feet comes out at <b>1.20</b> putts, which is generous - a scratch golfer makes better than nine in ten from there, so the honest number is nearer 1.05. The whole green baseline runs a touch high at the short end, which flatters every tap-in on this card and every close proximity on the wedge card. It is the app\'s shared putting table, so it is left alone here rather than quietly forked - but it is worth measuring against your own make rates.</p>'
        : '<p class="gen-note" style="margin-top:0">A Trackman index describes whole golf. This game removes nearly all of it: both players\' balls are holed out by the same scratch golfer, so the only skill measured is the one shot. Handing out the full index would give strokes for putting nobody is doing.</p>'
          + '<p class="gen-note">So the allowance is solved out of the app\'s own handicap rule rather than invented. That rule says a handicap player\'s expected strokes from <i>d</i> are <b>S(d,h) = S&#8320; + 0.012&#183;h&#183;(S&#8320;&#8722;1)</b>. Their total is the shot, then <i>their own</i> play from where it finished - and it is that result, played out by scratch, that this game scores. Solving for it gives the number used here. It collapses to scratch at 0.</p>'
          + '<p class="gen-note"><b>Where it is weak:</b> that allowance works out identical at every distance, which is almost certainly wrong - a 15 index is much nearer scratch from '+fmtYd(10)+' than from '+fmtYd(120)+'. It is a property of the linear handicap rule, which attributes all of the distance-dependence to putting.</p>')
    + (G.kind==='drive'?'<p class="gen-note"><b>Recovery</b> (more than 30 '+ydUnit()+' offline) is modelled as rough plus a flat 0.60 strokes, because there is no recovery baseline to interpolate - the next shot usually cannot advance to the green. That number is <b>presumed</b>, not measured.</p>':'')
    + '<p class="gen-note" style="margin-bottom:0">Because every score here is a real number, strokes are applied exactly rather than allocated whole to the hardest holes - net is simply gross minus the allowance, on every station.</p>'
    + '</div></details>'
    + (hist?'<div class="section-label" style="margin-top:18px">Past '+G.label+' sessions</div><div class="wg-hist">'+hist+'</div>':'');
  buildGamesGrid();
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { WEDGE_STATIONS_YD, IRON_STATIONS_YD, PUTT_STATIONS_FT, WEDGE_PAR_PER,
  DRIVE_HOLE_DEFAULT_YD, DRIVE_BANDS, GM_GAMES, gmActiveKey, gmSetGame, gmG, gmRowCount,
  gmState, gmSetMode, gmSolo, gmRecords, gmScore, gmDriveBand, gmDriveScore, gmPar, gmAllowance, gmPuttAllowance,
  gmRowAllowance, gmRowGross, gmCard, gmSetPlayer, gmSetHole, gmSetShot, gmSetOff,
  gmCycleUnit, gmMetric, gmUnitPair, GM_UNITS, GM_FT_PER, gmShotUnit, gmToFeet, gmFromFeet,
  gmClear, gmSave, gmDeleteSession, gmMatchText, gmRunText, gmRunClass, gmStationLabel, gmIntro,
  buildGames, buildGamesGrid });
