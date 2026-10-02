// features/sim.js — PLAY SIM GOLF: TrackMan sessions into the model, and games for the bay.
//
// A mode, like Play: a door in the header (data-sim-btn), a full-screen panel (#sim-mode) with
// two tabs. It supplements TrackMan rather than copying it. TrackMan already scores target
// practice, combines and virtual rounds; what it cannot do is feed the numbers back into the
// player's own model, or score the way this app does. So:
//
//   TRACKMAN  import a session export (CSV). Every club's stock numbers, its D-plane (Vert. Face,
//             Vert. Path, face, path) and its dispersion, width, length and lean, measured from
//             the shots, compared with the bag and applied to it on request. Captured data.
//   GAMES     Sim Round   a TrackMan virtual-course round logged shot by shot for strokes gained;
//                         head to head it is scored against each player's own expected score.
//             Shape Nine  nine called shots with one club, scored from TrackMan's Curve and Height.
//             Ladder Test targets drawn from your own partial-swing ladder; scores distance
//                         control and offers to correct the ladder from what you carried.
// The practice combines (Games tab) stay where they are; these are the simulator's own.

/* ==================== STATE ==================== */
function simState(){
  const S=STATE.sim=STATE.sim||{};
  S.sessions=S.sessions||[]; S.tmMap=S.tmMap||{}; S.games=S.games||{}; S.history=S.history||[]; S.applyLog=S.applyLog||[];
  return S;
}
window.simView = window.simView || 'games';     /* games | tm */
window.simGame = window.simGame || null;        /* the open game's key, or null for the list */
window.simPending = window.simPending || null;  /* a parsed file awaiting club mapping */
window.simSess = window.simSess || null;        /* the session being looked at, or 'all' */

function simIsOpen(){ return document.body.classList.contains('simming'); }
function simOpen(){
  const r=(typeof pmRound==='function')?pmRound():null;
  if(r && r.tournament && r.tournament.on){ toast('A tournament round is open'); return; }
  document.body.classList.add('simming');
  const el=document.getElementById('sim-mode'); if(el) el.hidden=false;
  try{ if(!(history.state&&history.state.sim)) history.pushState({sim:1},''); }catch(_){}
  buildSim();
}
function simClose(fromPop){
  document.body.classList.remove('simming');
  const el=document.getElementById('sim-mode'); if(el) el.hidden=true;
  if(!fromPop){ try{ if(history.state&&history.state.sim) history.back(); }catch(_){} }
}
if(!window.simPopHooked){
  window.simPopHooked=true;
  window.addEventListener('popstate',()=>{ if(simIsOpen()) simClose(true); });
}
function simSetView(v){ window.simView=v; buildSim(); const b=document.getElementById('sim-body'); if(b) b.scrollTop=0; }

function buildSim(){
  const el=document.getElementById('sim-mode'); if(!el || el.hidden) return;
  const body = window.simView==='tm' ? simTMHTML() : simGamesHTML();
  const gk = window.simGame ? String(window.simGame).replace('Result','') : null;
  const sub = window.simView==='tm' ? 'TrackMan sessions into your numbers' : (gk && SIM_GAMES[gk] ? SIM_GAMES[gk].label : 'Games for the simulator');
  const y=(document.getElementById('sim-body')||{}).scrollTop||0;
  el.innerHTML=`
    <div class="pm-top">
      <button type="button" class="pm-x" onclick="simClose()" aria-label="Leave Sim Golf">✕</button>
      <div class="pm-hole"><div class="pm-hole-t">Sim Golf</div><div class="pm-hole-s">${escapeHtml(sub)}</div></div>
      <span class="sim-top-pad" aria-hidden="true"></span>
    </div>
    <div class="pm-body sim-body" id="sim-body">${body}</div>
    <nav class="pm-tabs sim-tabs" aria-label="Sim Golf">
      ${[['games','Games','◎'],['tm','TrackMan','▤']].map(([k,l,i])=>
        `<button type="button" class="pm-tab${window.simView===k?' on':''}" onclick="simSetView('${k}')" aria-pressed="${window.simView===k}"><span aria-hidden="true">${i}</span>${l}</button>`).join('')}
    </nav>`;
  const b=document.getElementById('sim-body'); if(b) b.scrollTop=y;
}
/* keep the scroll position across a rebuild that changes nothing above it */
function simRe(){ buildSim(); }

/* ==================== small numeric helpers ==================== */
function simMed(a){ const s=a.filter(v=>v!=null&&isFinite(v)).sort((x,y)=>x-y), n=s.length; return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):null; }
function simMean(a){ const s=a.filter(v=>v!=null&&isFinite(v)); return s.length?s.reduce((x,y)=>x+y,0)/s.length:null; }
function simSD(a){ const s=a.filter(v=>v!=null&&isFinite(v)); if(s.length<2) return null; const m=simMean(s); return Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/(s.length-1)); }
function simRnd(v, dp){ if(v==null||!isFinite(v)) return null; const k=Math.pow(10,dp||0); return Math.round(v*k)/k; }
function simClub(id){ return (STATE.clubs||[]).find(c=>c.id===id)||null; }

/* ==================== TRACKMAN: READING THE FILE ====================
   TrackMan exports differ by product (TPS, the TrackMan Golf app, Range) and by locale, so the
   reader assumes as little as it can:
     the header row is FOUND, not assumed: the first rows can be session metadata, so it is the
       row in the first fifteen that names the most known columns
     the separator is whichever of , ; or tab the header uses most, and a ; file gets decimal
       commas read as decimal points
     units come from the header ("Carry [yds]", "Ball Speed (mph)") or from a units row under it
       ("[yds]", "mph"); with neither, the choice on the import card decides
     sides can be signed numbers or "12.3 L" / "R 4.0": left is negative, right is positive
   Column names are compared with case, spaces, punctuation and units stripped, so "Dyn. Loft",
   "Dynamic Loft" and "dynloft" are one column. */
const SIM_TM_COLS = {
  club:['club','clubname','clubtype'], date:['date','datetime','time','timestamp','shotdate'],
  cspd:['clubspeed','clubheadspeed'], aoa:['attackangle','angleofattack','aoa'],
  path:['clubpath','path'], dynLoft:['dynloft','dynamicloft'], face:['faceangle','face'],
  f2p:['facetopath'], spinLoft:['spinloft','3dspinloft'], plane:['swingplane'], swingDir:['swingdirection'],
  bspd:['ballspeed'], smash:['smashfactor','smash'], launch:['launchangle','vla','launchv','verticallaunchangle'],
  launchDir:['launchdirection','hla','launchh','horizontallaunchangle'], spin:['spinrate','totalspin','spin'],
  spinAxis:['spinaxis'], ht:['height','maxheight','apex','peakheight'],
  carry:['carry','carryflat','carrydistance','carryflatlength'], total:['total','totaldistance','totalflat','totalflatlength'],
  side:['side','carryside','sidecarry','carryflatside','lateral','offline'], sideTot:['sidetotal','totalside','totalflatside'],
  land:['landangle','landingangle','landangflat','descentangle'], hang:['hangtime'], curve:['curve']
};
const SIM_UNIT_KIND = { cspd:'speed', bspd:'speed', carry:'dist', total:'dist', side:'dist', sideTot:'dist', curve:'dist', ht:'height' };
const SIM_LR_COLS = ['side','sideTot','curve','launchDir','path','face','f2p','spinAxis','swingDir'];
function simNorm(h){ return String(h||'').toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g,'').replace(/[^a-z0-9]/g,''); }
function simUnitOf(h){ const m=String(h||'').match(/\[([^\]]+)\]|\(([^)]+)\)/); return m ? (m[1]||m[2]).trim().toLowerCase() : ''; }
function simSplit(line, d){
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){ if(q && line[i+1]==='"'){ cur+='"'; i++; } else q=!q; }
    else if(ch===d && !q){ out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur); return out.map(x=>x.trim());
}
function simColKey(h){
  const n=simNorm(h);
  for(const [k,names] of Object.entries(SIM_TM_COLS)) if(names.includes(n)) return k;
  return null;
}
function simNum(v, comma, lr){
  if(v==null) return null;
  let t=String(v).trim(); if(!t||t==='-'||/^n\/?a$/i.test(t)) return null;
  let sign=1;
  if(lr){ if(/^l\b|\bl$/i.test(t)) sign=-1; t=t.replace(/^[lr]\s*|\s*[lr]$/i,''); }
  if(comma) t=t.replace(/\./g,'').replace(',', '.');
  t=t.replace(/[^\d.+-eE]/g,'');
  const n=parseFloat(t); return isFinite(n) ? n*sign : null;
}
function simConv(kind, unit, v, fallback){
  if(v==null) return null;
  const u=(unit||'').replace(/[\[\]\s.]/g,'') || (fallback==='metric' ? {speed:'km/h',dist:'m',height:'m'}[kind] : '');
  if(kind==='speed'){ if(/km\/?h|kph/.test(u)) return v*0.621371; if(/m\/?s|mps/.test(u)) return v*2.23694; return v; }
  if(kind==='dist'){ if(/^m$|^m(eter|etre)s?$/.test(u)) return v*1.09361; if(/^ft|feet/.test(u)) return v/3; return v; }
  if(kind==='height'){ if(/^m$|^m(eter|etre)s?$/.test(u)) return v*3.28084; if(/^y(ar)?ds?$/.test(u)) return v*3; return v; }
  return v;
}
function simParseTM(text, fallbackUnits){
  const lines=String(text||'').replace(/^﻿/,'').split(/\r?\n/);
  let best={i:-1, n:0, d:','};
  lines.slice(0,15).forEach((ln,i)=>{
    const d=[',',';','\t'].sort((a,b)=>ln.split(b).length-ln.split(a).length)[0];
    const n=simSplit(ln,d).filter(h=>simColKey(h)).length;
    if(n>best.n) best={i, n, d};
  });
  if(best.n<3) return {error:'No TrackMan columns found. Export the session as a TrackMan CSV and try again.'};
  const d=best.d, comma=d===';';
  const head=simSplit(lines[best.i], d);
  const keys=head.map(simColKey);
  let units=head.map(simUnitOf);
  let start=best.i+1;
  /* a units row: mostly bracketed or alphabetic cells, no numbers */
  const nx=lines[start]?simSplit(lines[start], d):[];
  if(nx.length && nx.filter(c=>c && /^\[?[a-z°%/.\s]+\]?$/i.test(c)).length >= Math.max(2, nx.filter(Boolean).length*0.6)){
    units=units.map((u,i)=>u || String(nx[i]||'').replace(/[\[\]]/g,'').trim().toLowerCase()); start++;
  }
  if(!keys.includes('club')) return {error:'This file has no Club column, so shots cannot be matched to your bag.'};
  const shots=[];
  for(let r=start;r<lines.length;r++){
    if(!lines[r].trim()) continue;
    const cells=simSplit(lines[r], d); const sh={};
    keys.forEach((k,i)=>{
      if(!k) return;
      if(k==='club'||k==='date'){ sh[k]=cells[i]||''; return; }
      let v=simNum(cells[i], comma, SIM_LR_COLS.includes(k));
      if(SIM_UNIT_KIND[k]) v=simConv(SIM_UNIT_KIND[k], units[i], v, fallbackUnits);
      if(v!=null) sh[k]=v;
    });
    if(!sh.club || (sh.carry==null && sh.bspd==null)) continue;
    shots.push(sh);
  }
  if(!shots.length) return {error:'The header was found but no shot rows under it.'};
  return {shots, cols:keys.filter(Boolean), units:units.filter(Boolean)};
}
/* A TrackMan club name to a club in the bag: the mapping you confirmed last time, then the
   name, then the loft it implies. */
const SIM_LOFT_BY_NAME = { driver:10.5, '2wood':13, '3wood':15, '4wood':16.5, '5wood':18, '7wood':21, '9wood':24,
  '2hybrid':17, '3hybrid':19, '4hybrid':22, '5hybrid':25, '6hybrid':28,
  '2iron':18, '3iron':21, '4iron':24, '5iron':27, '6iron':30, '7iron':34, '8iron':38, '9iron':42,
  pitchingwedge:46, pw:46, gapwedge:50, gw:50, approachwedge:50, aw:50, uw:50, sandwedge:56, sw:56, lobwedge:60, lw:60 };
function simGuessClub(name){
  const S=simState(); if(S.tmMap[name]!==undefined) return S.tmMap[name];
  const n=simNorm(name), clubs=(STATE.clubs||[]).filter(c=>c.type!=='putter');
  const byLabel=clubs.find(c=>simNorm(c.label)===n || simNorm(c.name||'')===n); if(byLabel) return byLabel.id;
  if(n==='driver'||n==='dr'){ const d=(typeof bagDriver==='function')?bagDriver():null; if(d) return d.id; }
  const deg=n.match(/^(\d{2})(deg|d)?$/); if(deg){ const c=(typeof bagClubNearLoft==='function')?bagClubNearLoft(+deg[1],3):null; if(c) return c.id; }
  let k=n.replace(/^(\d)(w|h|i)$/,(m,a,b)=>a+({w:'wood',h:'hybrid',i:'iron'}[b])).replace(/^(w|h|i)(\d)$/,(m,b,a)=>a+({w:'wood',h:'hybrid',i:'iron'}[b]));
  const iron=k.match(/^(\d)iron$/); if(iron){ const c=clubs.find(c=>c.type==='iron'&&simNorm(c.label)===iron[1]); if(c) return c.id; }
  const L=SIM_LOFT_BY_NAME[k];
  if(L!=null && typeof bagClubNearLoft==='function'){ const c=bagClubNearLoft(L,3); if(c) return c.id; }
  return '';
}
function simImportFile(input){
  const file=input.files&&input.files[0]; if(!file) return;
  const units=(document.getElementById('sim-units')||{}).value||'imperial';
  const rd=new FileReader();
  rd.onload=()=>{
    input.value='';
    const res=simParseTM(String(rd.result||''), units);
    if(res.error){ toast(res.error); window.simImportErr=res.error; buildSim(); return; }
    window.simImportErr=null;
    const names=[...new Set(res.shots.map(s=>s.club))];
    window.simPending={ file:file.name, units, shots:res.shots, cols:res.cols,
                        map:Object.fromEntries(names.map(n=>[n, simGuessClub(n)])) };
    buildSim();
  };
  rd.readAsText(file);
}
function simMapSet(name, id){ if(window.simPending) window.simPending.map[name]=id; }
function simImportCancel(){ window.simPending=null; buildSim(); }
function simImportConfirm(){
  const P=window.simPending; if(!P) return;
  const S=simState();
  Object.entries(P.map).forEach(([n,id])=>{ S.tmMap[n]=id||''; });
  const shots=P.shots.filter(s=>P.map[s.club]).map(s=>Object.assign({}, s, {tmClub:s.club, club:P.map[s.club]}));
  if(!shots.length){ toast('No shots matched to a club in your bag'); return; }
  const dates=shots.map(s=>Date.parse(s.date)).filter(isFinite);
  const sess={ id:'tm'+Date.now(), at:dates.length?Math.min(...dates):Date.now(), importedAt:Date.now(), name:P.file, src:'TrackMan', shots };
  S.sessions.push(sess); saveState();
  window.simPending=null; window.simSess=sess.id; buildSim();
  if(typeof lmRenderSection==='function') lmRenderSection();   /* the Driver Optimizer reads the newest session */
  toast(`${shots.length} shots imported`);
}
function simDeleteSession(id){
  const S=simState(), i=S.sessions.findIndex(s=>s.id===id); if(i<0) return;
  if(!confirm('Delete this session? The numbers already applied to your bag stay.')) return;
  if(typeof sgForget==='function') sgForget('sim.sessions', id);
  S.sessions.splice(i,1); if(window.simSess===id) window.simSess=null; saveState(); buildSim();
}
function simOpenSession(id){ window.simSess=id; buildSim(); const b=document.getElementById('sim-body'); if(b) b.scrollTop=0; }

/* ==================== TRACKMAN: WHAT THE SHOTS SAY ====================
   Per club, the stock shot is the AVERAGE of the clean shots. A mishit is not stock: a shot
   whose carry or side is more than 3.5 robust standard deviations (1.4826 x MAD) from the
   club's median is set aside and counted. Under five shots nothing is filtered, because a
   median of three cannot tell a mishit from a spread. */
function simShots(){
  const S=simState(), k=window.simSess;
  if(k==='all') return S.sessions.flatMap(s=>s.shots);
  const s=S.sessions.find(x=>x.id===k); return s?s.shots:[];
}
function simClean(list){
  if(list.length<5) return {clean:list, out:0};
  const rz=(key)=>{ const v=list.map(s=>s[key]).filter(x=>x!=null); if(v.length<5) return ()=>false;
    const m=simMed(v), mad=simMed(v.map(x=>Math.abs(x-m)))*1.4826||1;
    return s=>s[key]!=null && Math.abs(s[key]-m)>3.5*mad; };
  const bc=rz('carry'), bs=rz('side');
  const clean=list.filter(s=>!bc(s)&&!bs(s));
  return {clean, out:list.length-clean.length};
}
const SIM_STOCK = [['carry','Carry','dist',0],['total','Total','dist',0],['bspd','Ball speed','speed',1],['cspd','Club speed','speed',1],
                   ['launch','Launch','deg',1],['spin','Spin','rpm',0],['ht','Height','height',0],['land','Land','deg',0]];
const SIM_DPLANE = [['aoa','Vert. Path','aoa'],['dynLoft','Vert. Face','vFace'],['face','Face','hFace'],['path','Path','hPath'],['spinLoft','3D Spin Loft',null]];
function simClubStats(id, list){
  const {clean, out}=simClean(list);
  const st={id, n:clean.length, out};
  [...SIM_STOCK.map(x=>x[0]), ...SIM_DPLANE.map(x=>x[0])].forEach(k=>{ st[k]=simMean(clean.map(s=>s[k])); });
  st.sdSide=simSD(clean.map(s=>s.side)); st.sdCarry=simSD(clean.map(s=>s.carry));
  st.clean=clean;
  return st;
}
function simFmt(kind, v){
  if(v==null) return '—';
  if(kind==='dist') return `${ydNum(v)}`;
  if(kind==='speed') return typeof toDisplay==='function' ? `${toDisplay('speed', v, 1)}` : v.toFixed(1);
  if(kind==='height') return typeof toDisplay==='function' ? `${toDisplay('short', v, 0)}` : Math.round(v)+'';
  if(kind==='deg') return `${v.toFixed(1)}°`;
  if(kind==='rpm') return Math.round(v).toLocaleString();
  return String(v);
}
function simUnitLbl(kind){
  if(kind==='dist') return ydUnit();
  if(kind==='speed') return typeof unitLabel==='function'?unitLabel('speed'):'mph';
  if(kind==='height') return typeof unitLabel==='function'?unitLabel('short'):'ft';
  return '';
}
/* the same shape the on-course dispersion code reads, so TrackMan and the course are fitted by
   ONE piece of arithmetic: lat = carry side (+ right), al = carry, no measurement error worth
   subtracting from a radar */
function simDispData(){
  const by={};
  simShots().forEach(s=>{ (by[s.club]=by[s.club]||[]).push(s); });
  const shots={};
  Object.entries(by).forEach(([id,list])=>{
    const {clean}=simClean(list);
    shots[id]=clean.filter(s=>s.side!=null&&s.carry!=null).map(s=>({yd:s.carry, lat:s.side, al:s.carry, mv:0}));
  });
  return {shots, skip:{}};
}
function simDispApply(){ if(typeof pmDispApply==='function') pmDispApply(simDispData(), 'TrackMan'); }
function simLeanApply(type){ if(typeof pmLeanApply==='function') pmLeanApply(type, simDispData(), 'on TrackMan'); }

/* Apply one club's session numbers to the bag: the stock shot and its D-plane, as Captured. */
function simApplyClub(id, quiet){
  const by=simShots().filter(s=>s.club===id), st=simClubStats(id, by), club=simClub(id);
  if(!club || st.n<3) return false;
  const p=STATE.performance[id]=STATE.performance[id]||{};
  STATE.dplane=STATE.dplane||{};
  const dp=STATE.dplane[id]=STATE.dplane[id]||{};
  const pr=STATE.partials&&STATE.partials[id];
  const S=simState();
  S.applyLog.push({ kind:'bag', id, label:club.label, at:Date.now(), n:st.n,
                    before:{ perf:Object.assign({},p), dplane:Object.assign({},dp), partials:pr?Object.assign({},pr):null } });
  const r0=v=>Math.round(v), r1=v=>Math.round(v*10)/10;
  if(st.carry!=null) p.carry=r0(st.carry);
  if(st.total!=null) p.total=r0(st.total);
  if(st.bspd!=null) p.bspd=r1(st.bspd);
  if(st.cspd!=null) p.cspd=r1(st.cspd);
  if(st.launch!=null) p.launch=r1(st.launch);
  if(st.spin!=null) p.spin=r0(st.spin);
  if(st.ht!=null) p.ht=r0(st.ht);
  if(st.land!=null) p.land=r0(st.land);
  p.prov='captured';
  if(p.fitted) delete p.fitted;           /* measured now; nothing left to fit */
  SIM_DPLANE.forEach(([k,,dk])=>{ if(dk && st[k]!=null) dp[dk]=r1(st[k]); });
  if(typeof syncPartialsForClub==='function') syncPartialsForClub(id);
  if(!quiet) simAfterBagChange(`${club.label}: TrackMan numbers in your bag`);
  return true;
}
function simApplyAll(){
  const ids=[...new Set(simShots().map(s=>s.club))].filter(id=>simClubStats(id, simShots().filter(s=>s.club===id)).n>=3);
  if(!ids.length) return;
  if(!confirm(`Put this session's numbers into your bag for ${ids.length} club${ids.length===1?'':'s'}?\n\nCarry, total, speeds, launch, spin, height, landing angle and the D-plane, as Captured. Each one can be undone.`)) return;
  ids.forEach(id=>simApplyClub(id, true));
  simAfterBagChange(`${ids.length} clubs updated from TrackMan`);
}
function simApplyOne(id){
  const club=simClub(id); if(!club) return;
  if(!confirm(`Put ${club.label}'s TrackMan numbers into your bag?`)) return;
  simApplyClub(id);
}
function simAfterBagChange(msg){
  if(typeof aimShapeReset==='function') aimShapeReset();
  saveState(); if(typeof refreshAll==='function') refreshAll();
  buildSim(); toast(msg);
}
function simUndo(k){
  const S=simState(), x=S.applyLog[k]; if(!x||x.undone) return;
  if(x.kind==='bag'){
    STATE.performance[x.id]=Object.assign({}, x.before.perf);
    STATE.dplane=STATE.dplane||{}; STATE.dplane[x.id]=Object.assign({}, x.before.dplane);
    if(x.before.partials && STATE.partials) STATE.partials[x.id]=Object.assign({}, x.before.partials);
  } else if(x.kind==='ladder'){
    if(STATE.partials) STATE.partials[x.id]=Object.assign({}, x.before);
  }
  x.undone=Date.now();
  simAfterBagChange(`${x.label} put back`);
}

/* ==================== TRACKMAN: THE SCREEN ==================== */
function simTMHTML(){
  const S=simState();
  if(window.simPending){
    const P=window.simPending, names=Object.keys(P.map);
    const opts=id=>`<option value="">— skip —</option>`+(STATE.clubs||[]).filter(c=>c.type!=='putter').map(c=>`<option value="${escapeHtml(c.id)}"${c.id===id?' selected':''}>${escapeHtml(c.label)}${c.loft?' · '+String(c.loft).replace(/°/g,'')+'°':''}</option>`).join('');
    return `<div class="sim-card">
        <h3>Match the clubs</h3>
        <p class="pm-note">${escapeHtml(P.file)} · ${P.shots.length} shots. Which club in your bag is each one? Remembered for next time.</p>
        ${names.map(n=>{ const sh=P.shots.filter(s=>s.club===n); const c=simMean(sh.map(s=>s.carry));
          return `<label class="sim-map"><span><b>${escapeHtml(n)}</b><i>${sh.length} shot${sh.length===1?'':'s'}${c!=null?` · ${ydNum(c)} ${ydUnit()} carry`:''}</i></span>
            <select onchange="simMapSet(${escapeHtml(JSON.stringify(n))}, this.value)">${opts(P.map[n])}</select></label>`; }).join('')}
        <div class="pm-plan-row"><button type="button" class="btn btn-primary pm-plan-btn" onclick="simImportConfirm()">Import</button>
          <button type="button" class="btn pm-plan-btn" onclick="simImportCancel()">Cancel</button></div>
      </div>`;
  }
  const imp=`<div class="sim-card">
      <h3>Import a TrackMan session</h3>
      <p class="pm-note">In TrackMan Performance Studio: Shot History, select the shots, Table View, Export, <b>Trackman CSV</b>. Other TrackMan CSV exports work too; the columns are found by name.</p>
      ${window.simImportErr?`<p class="pm-warn">${escapeHtml(window.simImportErr)}</p>`:''}
      <div class="sim-imp-row">
        <label class="pm-field sim-units">Units if the file does not say<select id="sim-units"><option value="imperial">Yards, mph, feet</option><option value="metric">Metres, km/h</option></select></label>
        <label class="btn btn-primary sim-file">Choose CSV<input type="file" accept=".csv,.tsv,.txt" hidden onchange="simImportFile(this)"></label>
      </div>
    </div>`;
  const list=S.sessions.slice().reverse().map(s=>{ const clubs=[...new Set(s.shots.map(x=>x.club))].map(id=>(simClub(id)||{}).label||id);
    return `<div class="sim-sess${window.simSess===s.id?' on':''}"><button type="button" onclick="simOpenSession('${s.id}')">
        <b>${escapeHtml(new Date(s.at).toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'}))}</b>
        <span>${s.shots.length} shots · ${escapeHtml(clubs.join(' '))}</span><i>${escapeHtml(s.name||'')}</i></button>
        <button type="button" class="pm-dc-undo" onclick="simDeleteSession('${s.id}')" aria-label="Delete session">✕</button></div>`; }).join('');
  const sessCard = S.sessions.length ? `<div class="sim-card"><h3>Sessions</h3>
      ${S.sessions.length>1?`<div class="sim-sess${window.simSess==='all'?' on':''}"><button type="button" onclick="simOpenSession('all')"><b>All sessions together</b><span>${S.sessions.reduce((n,s)=>n+s.shots.length,0)} shots</span></button></div>`:''}
      ${list}</div>` : '';
  return imp + (window.simSess ? simSessHTML() : '') + sessCard + simLogHTML();
}
function simSessHTML(){
  const shots=simShots(); if(!shots.length) return '';
  const ids=(STATE.clubs||[]).map(c=>c.id).filter(id=>shots.some(s=>s.club===id));
  const cards=ids.map(id=>{
    const club=simClub(id), st=simClubStats(id, shots.filter(s=>s.club===id)), p=STATE.performance[id]||{};
    const cell=([k,l,kind])=>{ const v=st[k]; if(v==null) return '';
      const bag=p[k], dv=(bag!=null)?v-bag:null, show=(k==='carry'||k==='total')&&dv!=null&&Math.abs(dv)>=1;
      const u=simUnitLbl(kind);
      return `<div class="sim-st"><span>${l}${u?` <u>${u}</u>`:''}</span><b>${simFmt(kind,v)}</b><i>${bag!=null?`bag ${simFmt(kind,bag)}`:''}${show?` <em class="${dv<0?'neg':''}">${dv>0?'+':'−'}${ydNum(Math.abs(dv))}</em>`:''}</i></div>`; };
    const dpl=SIM_DPLANE.filter(([k])=>st[k]!=null).map(([k,l])=>`${l} <b>${st[k].toFixed(1)}°</b>`).join(' · ');
    const C=p.carry||st.carry;
    const disp=(st.sdSide!=null&&C)?`L/R <b>${ydNum(st.sdSide*1.48)}</b> <i>model ${ydNum(getDispersion(C)/1.645*1.48)}</i> · long/short <b>${ydNum((st.sdCarry||0)*1.48)}</b> <i>model ${ydNum(getDepthDispersion(C)/1.645*1.48)}</i>`:'';
    return `<div class="sim-club">
        <div class="sim-club-h"><b>${escapeHtml(club.label)}</b><span>${st.n} shot${st.n===1?'':'s'}${st.out?` · ${st.out} mishit${st.out===1?'':'s'} set aside`:''}</span>
          ${st.n>=3?`<button type="button" class="btn pm-dc-apply" onclick="simApplyOne('${escapeHtml(id)}')">To my bag</button>`:'<i>3 clean shots to apply</i>'}</div>
        <div class="sim-sts">${SIM_STOCK.map(cell).join('')}</div>
        ${dpl?`<div class="sim-dp">${dpl}</div>`:''}
        ${disp?`<div class="sim-dp">86% bands: ${disp}</div>`:''}
      </div>`;
  }).join('');
  /* width, length and lean, fitted by the same code as the course */
  const d=simDispData();
  let fit='';
  if(typeof pmDispPool==='function'){
    const P=pmDispPool(d), cal=(typeof pmDispCal==='function')?pmDispCal():{lat:1,dep:1};
    const ax=(k,se,dof,lbl,c)=>k==null?`<div><span>${lbl}</span><b>—</b><i>needs 2+ shots a club</i></div>`
      :`<div><span>${lbl}</span><b>${(k*c).toFixed(2)}×</b><i>±${(se*c).toFixed(2)} · ${dof} dof</i></div>`;
    const can=(typeof pmDispProposal==='function') ? pmDispProposal(d, 'trackman').changed : false;
    fit=`<div class="sim-card"><h3>Your pattern on TrackMan</h3>
        <div class="pm-dp-pool">${ax(P.lat,P.latSE,P.latDof,'Width',cal.lat)}${ax(P.dep,P.depSE,P.depDof,'Length',cal.dep)}</div>
        <p class="pm-note">Against the +3 model the app uses: above 1 is wider or longer. Each club's own average is taken out first, so where you aimed is not counted as spread. Range shots from a mat are the best case, so a factor from TrackMan is a floor for the course.</p>
        ${can?`<button type="button" class="btn pm-dc-apply" onclick="simDispApply()">Use this in the model</button>`:(P.latDof>=PM_DISP_MIN_DOF?`<p class="pm-dc-ok">The model already has this session</p>`:`<p class="pm-dc-need">${PM_DISP_MIN_DOF} degrees of freedom to apply (shots minus one a club).</p>`)}
        ${typeof pmDispSourcesHTML==='function'?pmDispSourcesHTML():''}
        ${typeof pmLeanHTML==='function'?pmLeanHTML(d, 'simLeanApply', 'Measured from carry and carry side. '):''}
      </div>`;
  }
  const S=simState(), title=window.simSess==='all'?'All sessions':(()=>{ const s=S.sessions.find(x=>x.id===window.simSess); return s?new Date(s.at).toLocaleDateString([], {month:'short', day:'numeric'}):''; })();
  return `<div class="sim-card"><div class="sim-card-h"><h3>${escapeHtml(title)}</h3>
        <button type="button" class="btn pm-dc-apply" onclick="simApplyAll()">All to my bag</button></div>
      <p class="pm-note">The average of each club's clean shots, beside what your bag says now. To my bag writes them as Captured, with the D-plane.</p>
      ${cards}</div>${fit}`;
}
function simLogHTML(){
  const S=simState(), L=S.applyLog.map((x,k)=>Object.assign({k},x)).filter(x=>!x.undone).slice(-8).reverse();
  if(!L.length) return '';
  return `<div class="sim-card"><h3>Changed from the simulator</h3>
      ${L.map(x=>`<div class="pm-dc-log-r"><span><b>${escapeHtml(x.label)}</b> ${x.kind==='ladder'?`ladder ${escapeHtml(x.what||'')}`:'stock numbers and D-plane'} <i>${new Date(x.at).toLocaleDateString([], {month:'short', day:'numeric'})}${x.n?`, ${x.n} shots`:''}</i></span>
        <button type="button" class="pm-dc-undo" onclick="simUndo(${x.k})">Undo</button></div>`).join('')}</div>`;
}

/* ==================== GAMES ==================== */
const SIM_GAMES = {
  round: { label:'Sim Round', icon:'⛳', hcp:true,
    blurb:'Play any TrackMan course and log each shot: where it was played from and how far from the hole. Strokes gained by category at the end. Head to head, each player is measured against their own expected score, so it is fair at any handicap.' },
  shape: { label:'Shape Nine', icon:'⇄', hcp:false,
    blurb:'Nine called shots with one club: low, stock and high, each drawn, straight and faded. Score each from TrackMan’s Curve and Height. A point for the shape, a point for the height.' },
  ladder:{ label:'Ladder Test', icon:'≡', hcp:false,
    blurb:'Targets drawn from your own partial-swing ladder: the club, the swing, and the number your ladder says it carries, each hit two or three times in random order. Score how close you carry it, then put what you actually carried back into the ladder.' }
};
/* "+2" is a plus handicap: two strokes BETTER than scratch, which the strokes model reads as -2 */
function simHcp(v){ const t=String(v==null?'':v).trim(); if(!t) return 0; const n=parseFloat(t.replace('+','')); return isFinite(n)?(t[0]==='+'?-n:n):0; }
function simG(key){
  const S=simState(), me=(STATE.profile&&STATE.profile.name)||'You', myH=(STATE.profile&&STATE.profile.handicap)||'';
  const g=S.games[key]=S.games[key]||{};
  g.players=g.players||[{name:me, hcp:myH},{name:'', hcp:''}];
  g.mode=g.mode||'solo';
  return g;
}
function simNP(g){ return g.mode==='vs'?2:1; }
function simPName(g,p){ return (g.players[p]&&g.players[p].name)||(p?'Player 2':'You'); }
function simGameOpen(k){ window.simGame=k; simG(k); buildSim(); const b=document.getElementById('sim-body'); if(b) b.scrollTop=0; }
function simGameBack(){ window.simGame=null; buildSim(); }
function simSetP(k,p,f,v){ const g=simG(k); g.players[p][f]=v; saveState(); }
function simSetMode(k,m){ const g=simG(k); if(g.started) return; g.mode=m; saveState(); buildSim(); }
function simDiscard(k){ if(!confirm('Discard this game?')) return; delete simState().games[k]; saveState(); window.simGame=null; buildSim(); }
function simSaveHistory(k, res){
  const S=simState(); S.history.push({game:k, at:Date.now(), res});
  if(S.history.length>60) S.history.splice(0, S.history.length-60);
}
function simPlayersHTML(k, g){
  const G=SIM_GAMES[k], lock=!!g.started;
  const row=p=>`<div class="sim-pl">
      <input type="text" placeholder="${p?'Opponent':'Name'}" value="${escapeHtml(g.players[p].name||'')}" onchange="simSetP('${k}',${p},'name',this.value)"${lock?' disabled':''}>
      ${G.hcp?`<input type="text" inputmode="decimal" class="sim-hcp" placeholder="Hcp" value="${escapeHtml(String(g.players[p].hcp||''))}" onchange="simSetP('${k}',${p},'hcp',this.value)"${lock?' disabled':''} aria-label="Handicap, + for a plus handicap">`:''}
    </div>`;
  return `<div class="sim-modes">${[['solo','Solo'],['vs','Head to head']].map(([m,l])=>`<button type="button" class="${g.mode===m?'on':''}" onclick="simSetMode('${k}','${m}')"${lock?' disabled':''}>${l}</button>`).join('')}</div>
    ${row(0)}${g.mode==='vs'?row(1):''}`;
}
function simGamesHTML(){
  if(window.simGame==='roundResult') return simRoundResultHTML();
  if(window.simGame==='ladderResult') return simLadderResultHTML();
  if(window.simGame==='round') return simRoundHTML();
  if(window.simGame==='shape') return simShapeHTML();
  if(window.simGame==='ladder') return simLadderHTML();
  const S=simState();
  const cards=Object.entries(SIM_GAMES).map(([k,G])=>{ const g=S.games[k];
    return `<button type="button" class="sim-game" onclick="simGameOpen('${k}')"><span class="sim-game-i" aria-hidden="true">${G.icon}</span>
      <span><b>${G.label}${g&&g.started?' <em>in progress</em>':''}</b><i>${G.blurb}</i></span></button>`; }).join('');
  const H=S.history.slice(-8).reverse();
  return `<p class="pm-note sim-lead">Games for the TrackMan bay that its own programs do not have, scored the way the rest of this app scores. The practice combines are still on the Games tab.</p>
    ${cards}
    ${H.length?`<div class="sim-card"><h3>Recent</h3>${H.map(h=>`<div class="sim-hist"><b>${SIM_GAMES[h.game]?SIM_GAMES[h.game].label:h.game}</b>
      <span>${h.res.map(r=>`${escapeHtml(r.name)} <b>${escapeHtml(r.score)}</b>${r.extra?` <i>${escapeHtml(r.extra)}</i>`:''}`).join(' · ')}</span>
      <i>${new Date(h.at).toLocaleDateString([], {month:'short', day:'numeric'})}</i></div>`).join('')}</div>`:''}`;
}
function simGameHead(k){
  return `<div class="sim-ghead"><button type="button" class="pm-pv-back" onclick="simGameBack()">‹ Games</button><h2>${SIM_GAMES[k].label}</h2></div>`;
}
const simSg=x=>`${x>=0?'+':'−'}${Math.abs(x).toFixed(2)}`;

/* ---------- SIM ROUND ----------
   Shot rows as on the course: situation and distance to the hole for every shot; the score is
   counted from them. Strokes gained per shot = E(start) - E(next start) - 1 - penalty, priced
   on the app benchmark (Settings) and summed by category. Head to head the result is each
   player against THEIR OWN expected score for the holes played, from their handicap and each
   hole's length: a handicap allowance with no stroke index needed, because it is the same
   expected-strokes table the whole app uses. */
const SIM_LIES = [['tee','Tee'],['fairway','Fwy'],['rough','Rgh'],['sand','Bnk'],['recovery','Rec'],['green','Grn']];
function simRoundNew(g){
  g.n=g.n||18; g.holes=Array.from({length:g.n},(_,i)=>(g.holes&&g.holes[i])||{par:4, yd:null});
  g.cards=g.cards||[{},{}]; g.cur=g.cur||0;
}
function simRoundSetN(n){ const g=simG('round'); if(g.started) return; g.n=n; simRoundNew(g); saveState(); buildSim(); }
function simRoundSetName(v){ const g=simG('round'); g.course=String(v||'').slice(0,60); saveState(); }
function simRoundStart(){ const g=simG('round'); simRoundNew(g); g.started=Date.now(); saveState(); buildSim(); }
function simRoundGo(i){ const g=simG('round'); g.cur=Math.max(0,Math.min(g.n-1,i)); saveState(); buildSim(); const b=document.getElementById('sim-body'); if(b) b.scrollTop=0; }
function simRoundPar(v){ const g=simG('round'); g.holes[g.cur].par=v; saveState(); buildSim(); }
function simRoundYd(v){ const g=simG('round'), h=g.holes[g.cur], n=parseFloat(v);
  h.yd=isFinite(n)&&n>0?Math.round(fromDisplay('distance',n)):null;
  [0,1].forEach(p=>{ const S=(g.cards[p][g.cur]||{}).shots; if(S&&S[0]&&S[0].lie==='tee') S[0].yd=h.yd; });
  saveState(); buildSim(); }
function simRS(p){ const g=simG('round'); const c=g.cards[p][g.cur]=g.cards[p][g.cur]||{}; c.shots=c.shots||[]; return c.shots; }
function simRoundFill(p,n){
  const g=simG('round'), h=g.holes[g.cur], S=simRS(p); S.length=0;
  for(let k=0;k<n;k++) S.push(k===0?{lie:'tee', yd:h.yd}:(k>=n-Math.min(2,n-1)?{lie:'green', yd:null}:{lie:'fairway', yd:null}));
  saveState(); buildSim();
}
function simRoundAdd(p){ const S=simRS(p), last=S[S.length-1]; S.push({lie:last&&last.lie==='green'?'green':'fairway', yd:null}); saveState(); buildSim(); }
function simRoundLie(p,i,lie){ const S=simRS(p); if(S[i]){ if((S[i].lie==='green')!==(lie==='green')) S[i].yd=null; S[i].lie=lie; } saveState(); buildSim(); }
function simRoundDist(p,i,v){ const S=simRS(p), n=parseFloat(v); if(!S[i]) return;
  S[i].yd = !isFinite(n)||n<0 ? null : S[i].lie==='green' ? Math.round(fromDisplay('short',n)/3*100)/100 : Math.round(fromDisplay('distance',n)*10)/10;
  saveState(); }
function simRoundPen(p,i){ const S=simRS(p); if(S[i]) S[i].pen=!S[i].pen; saveState(); buildSim(); }
function simRoundDel(p,i){ const S=simRS(p); S.splice(i,1); saveState(); buildSim(); }
function simHoleScore(c){ const S=(c&&c.shots)||[]; return S.length ? S.length+S.filter(s=>s.pen).length : null; }
function simE(sh, hcp){ if(sh.yd==null) return null; return srForPlayer(sh.lie, sh.lie==='green'?Math.max(0.5,sh.yd*3):Math.max(1,sh.yd), hcp); }
function simRoundResult(g){
  const bench=(typeof esCmp==='function')?esCmp():{hcp:0, short:'scratch'};
  return [0,1].slice(0,simNP(g)).map(p=>{
    const hp=simHcp(g.players[p].hcp);
    const out={name:simPName(g,p), gross:0, par:0, played:0, own:0, ownN:0, sg:{ott:0,app:0,arg:0,putt:0}, sgN:0, total:0, incomplete:0};
    g.holes.forEach((h,i)=>{
      const c=g.cards[p][i], sc=simHoleScore(c); if(sc==null) return;
      out.gross+=sc; out.par+=h.par; out.played++;
      if(h.yd){ const e=srForPlayer('tee', h.yd, hp); if(e!=null){ out.own+=e-sc; out.ownN++; } }
      const S=c.shots;
      if(S.some(s=>s.yd==null)){ out.incomplete++; return; }
      S.forEach((s,k)=>{ const a=simE(s,bench.hcp), b=S[k+1]?simE(S[k+1],bench.hcp):0; if(a==null||b==null) return;
        const v=a-b-1-(s.pen?1:0), cat=s.lie==='green'?'putt':(s.lie==='tee'&&h.par>=4)?'ott':s.yd<=50?'arg':'app';
        out.sg[cat]+=v; out.total+=v; });
      out.sgN++;
    });
    out.bench=bench.short; return out;
  });
}
function simRoundHTML(){
  const k='round', g=simG(k); simRoundNew(g);
  if(!g.started){
    return `${simGameHead(k)}<p class="pm-note">${SIM_GAMES[k].blurb}</p>
      <div class="sim-card">
        <label class="pm-field">Course<input type="text" class="sim-text" placeholder="e.g. Pebble Beach on TrackMan" value="${escapeHtml(g.course||'')}" onchange="simRoundSetName(this.value)"></label>
        <div class="sim-modes">${[9,18].map(n=>`<button type="button" class="${g.n===n?'on':''}" onclick="simRoundSetN(${n})">${n} holes</button>`).join('')}</div>
        ${simPlayersHTML(k,g)}
        <button type="button" class="btn btn-primary pm-go" onclick="simRoundStart()">Start</button>
      </div>`;
  }
  const i=g.cur, h=g.holes[i];
  const players=[0,1].slice(0,simNP(g)).map(p=>{
    const S=((g.cards[p][i])||{}).shots||[];
    const rows=S.map((s,j)=>{ const gr=s.lie==='green', val=s.yd==null?'':gr?ftNum(s.yd*3):ydNum(s.yd);
      return `<div class="sim-shot"><span class="pm-shot-n">${j+1}</span>
        <div class="sim-lies">${SIM_LIES.map(([l,t])=>`<button type="button" class="${s.lie===l?'on':''}" onclick="simRoundLie(${p},${j},'${l}')">${t}</button>`).join('')}</div>
        <div class="sim-shot-b"><input type="number" inputmode="decimal" min="0" value="${val}" placeholder="${gr?ftUnit():ydUnit()} to hole" onchange="simRoundDist(${p},${j},this.value)" aria-label="Shot ${j+1} distance to the hole"><i class="sim-u">${gr?ftUnit():ydUnit()}</i>
        <button type="button" class="pm-shot-btn${s.pen?' on':''}" onclick="simRoundPen(${p},${j})">+1 pen</button>
        <button type="button" class="pm-shot-btn pm-shot-del" onclick="simRoundDel(${p},${j})" aria-label="Delete shot">✕</button></div></div>`; }).join('');
    const opts=[]; for(let v=Math.max(1,h.par-1); v<=h.par+3; v++) opts.push(v);
    const sc=simHoleScore(g.cards[p][i]);
    return `<div class="sim-card sim-pcard"><div class="sim-card-h"><h3>${escapeHtml(simPName(g,p))}</h3><b class="sim-score">${sc==null?'—':sc}</b></div>
      ${S.length?rows+`<button type="button" class="pm-shot-add" onclick="simRoundAdd(${p})">+ Add a shot</button>`
        :`<div class="pm-shots-fill">How many shots? ${opts.map(v=>`<button type="button" onclick="simRoundFill(${p},${v})">${v}</button>`).join('')}</div>`}
    </div>`; }).join('');
  const R=simRoundResult(g);
  const tot=R.map(r=>`<span>${escapeHtml(r.name)} <b>${r.played?r.gross:'—'}</b>${r.played?` <i>${r.gross-r.par>=0?'+':''}${r.gross-r.par}</i>`:''}</span>`).join('');
  return `${simGameHead(k)}
    <div class="sim-hole">
      <button type="button" class="pm-arrow sim-arrow" onclick="simRoundGo(${i-1})" aria-label="Previous hole"${i===0?' disabled':''}>‹</button>
      <div class="sim-hole-m"><b>Hole ${i+1}</b>
        <div class="sim-modes sim-par">${[3,4,5].map(v=>`<button type="button" class="${h.par===v?'on':''}" onclick="simRoundPar(${v})">Par ${v}</button>`).join('')}</div>
        <label class="sim-yd"><input type="number" inputmode="numeric" min="0" value="${h.yd!=null?ydNum(h.yd):''}" placeholder="length" onchange="simRoundYd(this.value)"> ${ydUnit()}</label></div>
      <button type="button" class="pm-arrow sim-arrow" onclick="simRoundGo(${i+1})" aria-label="Next hole"${i===g.n-1?' disabled':''}>›</button>
    </div>
    <div class="sim-tot">${tot}</div>
    ${players}
    ${simRoundCardHTML(g)}
    <div class="pm-plan-row"><button type="button" class="btn btn-primary pm-plan-btn" onclick="simRoundFinish()">Finish</button>
      <button type="button" class="btn pm-plan-btn" onclick="simDiscard('round')">Discard</button></div>`;
}
function simRoundCardHTML(g){
  const np=simNP(g);
  const cells=g.holes.map((h,i)=>`<button type="button" class="sim-cc${i===g.cur?' cur':''}" onclick="simRoundGo(${i})"><i>${i+1}</i>${[0,1].slice(0,np).map(p=>{ const s=simHoleScore(g.cards[p][i]); const d=s==null?null:s-h.par;
      return `<b class="${d==null?'':d<0?'u':d>0?'o':''}">${s==null?'·':s}</b>`; }).join('')}</button>`).join('');
  return `<div class="sim-cardgrid">${cells}</div>`;
}
function simRoundFinish(){
  const g=simG('round'), R=simRoundResult(g);
  if(!R.some(r=>r.played)){ toast('No holes scored yet'); return; }
  if(!confirm('Finish this round?')) return;
  g.result=R; g.done=Date.now();
  simSaveHistory('round', R.map(r=>({name:r.name, score:`${r.gross} (${r.gross-r.par>=0?'+':''}${r.gross-r.par})`,
    extra:`${r.ownN?`${simSg(r.own)} vs own expected`:''}${r.sgN?` · SG ${simSg(r.total)}`:''}`})));
  window.simRoundLast=JSON.parse(JSON.stringify(g));
  delete simState().games.round; saveState();
  window.simGame='roundResult'; buildSim();
}
function simRoundResultHTML(){
  const g=window.simRoundLast; if(!g){ window.simGame=null; return simGamesHTML(); }
  const R=g.result;
  const blocks=R.map(r=>`<div class="sim-card"><div class="sim-card-h"><h3>${escapeHtml(r.name)}</h3><b class="sim-score">${r.gross}</b></div>
      <p class="pm-note">${r.played} hole${r.played===1?'':'s'}, ${r.gross-r.par>=0?'+':''}${r.gross-r.par} to par.${r.ownN?` Against your own expected score: <b>${simSg(r.own)}</b> (+ is better).`:''}</p>
      ${r.sgN?`<div class="pm-sg-total"><b class="${r.total<0?'neg':''}">${simSg(r.total)}</b><span>strokes gained vs ${escapeHtml(r.bench)} on ${r.sgN} hole${r.sgN===1?'':'s'}</span></div>
      <div class="pm-sg-grid">${[['ott','Off the tee'],['app','Approach'],['arg','Around the green'],['putt','Putting']].map(([c,l])=>`<div class="pm-sg-cell"><span>${l}</span><b class="${r.sg[c]<0?'neg':''}">${simSg(r.sg[c])}</b></div>`).join('')}</div>`
        :'<p class="pm-note">No hole has every distance filled in, so there is no strokes gained.</p>'}
      ${r.incomplete?`<p class="pm-note">${r.incomplete} hole${r.incomplete===1?'':'s'} left out of strokes gained: a distance is missing.</p>`:''}</div>`).join('');
  let verdict='';
  if(R.length===2 && R[0].ownN && R[1].ownN){
    const d=R[0].own-R[1].own;
    verdict=`<div class="sim-card sim-verdict"><b>${Math.abs(d)<0.05?'All square':`${escapeHtml(d>0?R[0].name:R[1].name)} wins by ${Math.abs(d).toFixed(2)}`}</b>
      <p class="pm-note">Each against their own expected score from the hole lengths and their handicap: the fair way to play anyone. Gross: ${R.map(r=>`${escapeHtml(r.name)} ${r.gross}`).join(', ')}.</p></div>`;
  }
  return `${simGameHead('round')}<p class="pm-note">${escapeHtml(g.course||'Sim round')}</p>${verdict}${blocks}
    <button type="button" class="btn pm-plan-btn" onclick="simGameBack()">Done</button>`;
}

/* ---------- SHAPE NINE ----------
   Tiger's nine-shot drill as a game. The shape point: TrackMan's Curve, against a threshold of
   3% of the club's carry (3 yd minimum). A draw curves toward the trail side, so left for a
   right-hander. The height point: max height against the club's stock height from the bag,
   low under 88%, high over 112%. */
const SIM_SHAPES=['draw','straight','fade'], SIM_HEIGHTS=['low','mid','high'];
const SIM_SH_LBL={draw:'Draw', straight:'Straight', fade:'Fade', low:'Low', mid:'Stock', high:'High'};
function simShapeStart(){
  const g=simG('shape'); const club=simClub(g.club); if(!club){ toast('Pick a club'); return; }
  let calls=[]; SIM_HEIGHTS.forEach(ht=>SIM_SHAPES.forEach(sh=>calls.push({sh, ht})));
  if(g.random){ for(let i=calls.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [calls[i],calls[j]]=[calls[j],calls[i]]; } }
  g.calls=calls; g.shots=[[],[]]; g.started=Date.now(); saveState(); buildSim();
}
function simShapeSet(f,v){ const g=simG('shape'); if(g.started) return; g[f]=v; saveState(); buildSim(); }
function simShapeIn(p,i,f,v){
  const g=simG('shape'); const s=g.shots[p][i]=g.shots[p][i]||{};
  if(f==='side'){ s.side=v; }
  else { const n=parseFloat(v); s[f]=isFinite(n)&&n>=0 ? (f==='curve'?fromDisplay('distance',n):fromDisplay('short',n)) : null; }
  saveState();
  if(f==='side') buildSim();
  else { const el=document.getElementById('sim-shape-tot'); if(el) el.innerHTML=simShapeTotHTML(g);
         const pe=document.getElementById(`sim-sp-${p}-${i}`); if(pe){ const v2=simShapeScore(g,p,i); pe.textContent=v2==null?'':v2; } }
}
function simShapeStock(g,p){
  const p1=(STATE.performance[g.club]||{});
  if(p===1 && parseFloat(g.p2ht)>0) return fromDisplay('short', parseFloat(g.p2ht));
  return p1.ht||null;
}
function simShapeScore(g,p,i){
  const s=(g.shots[p]||[])[i], c=g.calls[i]; if(!s||s.curve==null||!s.side||s.ht==null) return null;
  const carry=(STATE.performance[g.club]||{}).carry||150, T=Math.max(3, 0.03*carry);
  const lh=p===0 ? ((STATE.profile&&STATE.profile.handedness)==='LH') : !!g.p2lh;
  const signed=(s.side==='L'?-1:1)*s.curve, toTrail=lh?signed:-signed;   /* + = curving toward the trail side: a draw */
  const shapeOk = c.sh==='straight' ? Math.abs(signed)<=T : c.sh==='draw' ? toTrail>T : -toTrail>T;
  const st=simShapeStock(g,p); let htOk=false;
  if(st){ const r=s.ht/st; htOk = c.ht==='low' ? r<0.88 : c.ht==='high' ? r>1.12 : (r>=0.88&&r<=1.12); }
  return (shapeOk?1:0)+(htOk?1:0);
}
function simShapeTotHTML(g){
  return [0,1].slice(0,simNP(g)).map(p=>{ let t=0,n=0; g.calls.forEach((c,i)=>{ const v=simShapeScore(g,p,i); if(v!=null){ t+=v; n++; } });
    return `<span>${escapeHtml(simPName(g,p))} <b>${t}</b><i>/ ${n*2}</i></span>`; }).join('');
}
function simShapeHTML(){
  const k='shape', g=simG(k);
  if(!g.started){
    const clubs=(STATE.clubs||[]).filter(c=>c.type!=='putter');
    const p=STATE.performance[g.club]||{};
    return `${simGameHead(k)}<p class="pm-note">${SIM_GAMES[k].blurb}</p>
      <div class="sim-card">
        <label class="pm-field">Club<select onchange="simShapeSet('club', this.value)"><option value="">Choose</option>${clubs.map(c=>`<option value="${escapeHtml(c.id)}"${g.club===c.id?' selected':''}>${escapeHtml(c.label)}${c.loft?' · '+String(c.loft).replace(/°/g,'')+'°':''}</option>`).join('')}</select></label>
        ${g.club?`<p class="pm-note">Stock height ${p.ht?`<b>${toDisplay('short',p.ht,0)} ${unitLabel('short')}</b>`:'not in your bag yet'} · a shape needs ${ydNum(Math.max(3,0.03*(p.carry||150)))} ${ydUnit()} of curve.</p>`:''}
        <div class="sim-modes">${[[false,'In order'],[true,'Random order']].map(([v,l])=>`<button type="button" class="${!!g.random===v?'on':''}" onclick="simShapeSet('random', ${v})">${l}</button>`).join('')}</div>
        ${simPlayersHTML(k,g)}
        ${g.mode==='vs'?`<label class="pm-field">${escapeHtml(simPName(g,1))}: stock height with this club, ${unitLabel('short')} (blank = yours)<input type="number" inputmode="numeric" class="sim-text" value="${escapeHtml(String(g.p2ht||''))}" onchange="simShapeSet('p2ht', this.value)"></label>
          <label class="pm-plan-use"><input type="checkbox"${g.p2lh?' checked':''} onchange="simShapeSet('p2lh', this.checked)"> ${escapeHtml(simPName(g,1))} is left-handed</label>`:''}
        <button type="button" class="btn btn-primary pm-go" onclick="simShapeStart()">Start</button>
      </div>`;
  }
  const club=simClub(g.club);
  const rows=g.calls.map((c,i)=>`<div class="sim-call"><div class="sim-call-h"><b>${i+1}</b> ${SIM_SH_LBL[c.ht]} ${SIM_SH_LBL[c.sh].toLowerCase()}</div>
      ${[0,1].slice(0,simNP(g)).map(p=>{ const s=(g.shots[p]||[])[i]||{}, v=simShapeScore(g,p,i);
        return `<div class="sim-call-p">${simNP(g)>1?`<span class="sim-call-n">${escapeHtml(simPName(g,p))}</span>`:''}
          <div class="sim-lr">${['L','R'].map(sd=>`<button type="button" class="${s.side===sd?'on':''}" onclick="simShapeIn(${p},${i},'side','${sd}')">${sd}</button>`).join('')}</div>
          <input type="number" inputmode="decimal" min="0" value="${s.curve!=null?ydNum(s.curve):''}" placeholder="curve" onchange="simShapeIn(${p},${i},'curve',this.value)" aria-label="Curve">
          <input type="number" inputmode="decimal" min="0" value="${s.ht!=null?toDisplay('short',s.ht,0):''}" placeholder="height" onchange="simShapeIn(${p},${i},'ht',this.value)" aria-label="Max height">
          <b class="sim-pts" id="sim-sp-${p}-${i}">${v==null?'':v}</b></div>`; }).join('')}
    </div>`).join('');
  return `${simGameHead(k)}<p class="pm-note">${escapeHtml(club?club.label:'')} · the curve's side and size in ${ydUnit()}, and the max height in ${unitLabel('short')}, from the TrackMan screen.</p>
    <div class="sim-tot" id="sim-shape-tot">${simShapeTotHTML(g)}</div>
    ${rows}
    <div class="pm-plan-row"><button type="button" class="btn btn-primary pm-plan-btn" onclick="simShapeFinish()">Finish</button>
      <button type="button" class="btn pm-plan-btn" onclick="simDiscard('shape')">Discard</button></div>`;
}
function simShapeFinish(){
  const g=simG('shape'); if(!confirm('Finish this game?')) return;
  const club=simClub(g.club);
  simSaveHistory('shape', [0,1].slice(0,simNP(g)).map(p=>{ let t=0,n=0; g.calls.forEach((c,i)=>{ const v=simShapeScore(g,p,i); if(v!=null){t+=v;n++;} });
    return {name:simPName(g,p), score:`${t}/${n*2}`, extra:club?club.label:''}; }));
  delete simState().games.shape; saveState(); window.simGame=null; buildSim(); toast('Saved');
}

/* ---------- LADDER TEST ----------
   The targets are the ladder: each one is a club, a swing and the carry your Approach ladder
   says that swing produces. Points for distance control, scaled to the shot (the larger of a
   yardage and a percentage). Afterwards each rung is compared with what was actually carried;
   with two or more shots it can be written back, which is the point: a ladder built from
   memory becomes a measured one. Full swings are reported, not written; those come from the
   bag, or a TrackMan import. */
const SIM_SW_LBL={full:'full', tq:'¾', half:'½', third:'⅓'};
const SIM_SW_IDX={full:0, tq:1, half:2, third:3};
function simLadderRungs(){
  const ids=(typeof partialClubIds==='function')?partialClubIds():[];
  const out=[];
  ids.forEach(id=>{ const pr=(STATE.partials||{})[id]; if(!pr) return;
    ['full','tq','half','third'].forEach(sw=>{ if(pr[sw]>0) out.push({id, sw, yd:pr[sw]}); }); });
  return out;
}
function simLadderSetN(n){ const g=simG('ladder'); if(g.started) return; g.n=n; saveState(); buildSim(); }
function simLadderStart(){
  const g=simG('ladder'), all=simLadderRungs();
  if(!all.length){ toast('No partial-swing ladder yet: set one up on the Approach tab'); return; }
  /* Each rung drawn comes up more than once (twice, or three times in the long game), shuffled:
     one shot cannot tell a ladder that is wrong from a swing that was, and two can start to. */
  const n=g.n||12, reps=n>=18?3:2, k=Math.max(1,Math.round(n/reps));
  const shuffle=a=>{ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const chosen=shuffle(all.slice()).slice(0,k);
  const pick=shuffle(chosen.flatMap(r=>Array.from({length:reps},()=>Object.assign({},r))));
  g.rungs=pick; g.shots=[[],[]]; g.started=Date.now(); saveState(); buildSim();
}
function simLadderIn(p,i,v){
  const g=simG('ladder'), n=parseFloat(v); g.shots[p][i]=isFinite(n)&&n>0?fromDisplay('distance',n):null; saveState();
  const el=document.getElementById('sim-lad-tot'); if(el) el.innerHTML=simLadderTotHTML(g);
  const pe=document.getElementById(`sim-lp-${p}-${i}`); if(pe){ const v2=simLadderPts(g,p,i); pe.textContent=v2==null?'':v2; }
}
function simLadderPts(g,p,i){
  const c=(g.shots[p]||[])[i], t=g.rungs[i].yd; if(c==null) return null;
  const e=Math.abs(c-t);
  return e<=Math.max(2,0.02*t)?3 : e<=Math.max(4,0.04*t)?2 : e<=Math.max(7,0.07*t)?1 : 0;
}
function simLadderTotHTML(g){
  return [0,1].slice(0,simNP(g)).map(p=>{ let t=0,n=0; g.rungs.forEach((r,i)=>{ const v=simLadderPts(g,p,i); if(v!=null){t+=v;n++;} });
    return `<span>${escapeHtml(simPName(g,p))} <b>${t}</b><i>/ ${n*3}</i></span>`; }).join('');
}
function simLadderReview(g){
  const by={};
  g.rungs.forEach((r,i)=>{ const c=(g.shots[0]||[])[i]; if(c==null) return; const k=r.id+'|'+r.sw; (by[k]=by[k]||{id:r.id, sw:r.sw, yd:r.yd, c:[]}).c.push(c); });
  return Object.values(by).map(x=>Object.assign(x,{mean:simMean(x.c), n:x.c.length}));
}
function simLadderHTML(){
  const k='ladder', g=simG(k);
  if(!g.started){
    const all=simLadderRungs();
    return `${simGameHead(k)}<p class="pm-note">${SIM_GAMES[k].blurb}</p>
      <div class="sim-card">
        <p class="pm-note">${all.length?`Your ladder has <b>${all.length}</b> rungs on ${new Set(all.map(r=>r.id)).size} clubs.`:'No partial-swing ladder yet. Set one up on the Approach tab first.'}</p>
        <div class="sim-modes">${[8,12,18].map(n=>`<button type="button" class="${(g.n||12)===n?'on':''}" onclick="simLadderSetN(${n})">${n} shots</button>`).join('')}</div>
        ${simPlayersHTML(k,g)}
        ${g.mode==='vs'?`<p class="pm-note">Head to head, both players get the same targets and choose their own clubs; only your carries can change your ladder.</p>`:''}
        <button type="button" class="btn btn-primary pm-go" onclick="simLadderStart()"${all.length?'':' disabled'}>Start</button>
      </div>`;
  }
  const rows=g.rungs.map((r,i)=>{ const c=simClub(r.id);
    return `<div class="sim-call"><div class="sim-call-h"><b>${i+1}</b> ${escapeHtml(c?c.label:r.id)} ${SIM_SW_LBL[r.sw]} <span class="sim-tgt">${ydNum(r.yd)} ${ydUnit()}</span></div>
      ${[0,1].slice(0,simNP(g)).map(p=>{ const v=(g.shots[p]||[])[i], pts=simLadderPts(g,p,i);
        return `<div class="sim-call-p">${simNP(g)>1?`<span class="sim-call-n">${escapeHtml(simPName(g,p))}</span>`:''}
          <input type="number" inputmode="decimal" min="0" value="${v!=null?ydNum(v):''}" placeholder="carry" onchange="simLadderIn(${p},${i},this.value)" aria-label="Carry">
          <b class="sim-pts" id="sim-lp-${p}-${i}">${pts==null?'':pts}</b></div>`; }).join('')}</div>`; }).join('');
  return `${simGameHead(k)}<p class="pm-note">Carry from the TrackMan screen. 3 points inside 2% (2 ${ydUnit()} at least), 2 inside 4%, 1 inside 7%.</p>
    <div class="sim-tot" id="sim-lad-tot">${simLadderTotHTML(g)}</div>
    ${rows}
    <div class="pm-plan-row"><button type="button" class="btn btn-primary pm-plan-btn" onclick="simLadderFinish()">Finish</button>
      <button type="button" class="btn pm-plan-btn" onclick="simDiscard('ladder')">Discard</button></div>`;
}
function simLadderFinish(){
  const g=simG('ladder'); if(!confirm('Finish this game?')) return;
  simSaveHistory('ladder', [0,1].slice(0,simNP(g)).map(p=>{ let t=0,n=0; g.rungs.forEach((r,i)=>{ const v=simLadderPts(g,p,i); if(v!=null){t+=v;n++;} });
    return {name:simPName(g,p), score:`${t}/${n*3}`}; }));
  window.simLadderLast={rungs:g.rungs, shots:g.shots, review:simLadderReview(g)};
  delete simState().games.ladder; saveState(); window.simGame='ladderResult'; buildSim();
}
function simLadderResultHTML(){
  const L=window.simLadderLast; if(!L){ window.simGame=null; return simGamesHTML(); }
  const rows=L.review.slice().sort((a,b)=>b.yd-a.yd).map(x=>{ const c=simClub(x.id), d=x.mean-x.yd, pr=(STATE.partials||{})[x.id]||{};
    const applied=x.applied;
    const can = x.sw!=='full' && x.n>=2 && Math.abs(d)>=2 && !applied;
    return `<div class="pm-dc-row"><div class="pm-dc-l1"><b>${escapeHtml(c?c.label:x.id)}</b><span>${SIM_SW_LBL[x.sw]} · ladder <b>${ydNum(x.yd)}</b> <i>carried ${x.c.map(v=>ydNum(v)).join(', ')}</i></span>
        <b class="pm-dc-d ${d<0?'neg':''}">${Math.abs(d)<0.5?'0':(d>0?'+':'−')+ydNum(Math.abs(d))}</b></div>
      <div class="pm-dc-act">${can?`<button type="button" class="btn pm-dc-apply" onclick="simLadderApply('${escapeHtml(x.id)}','${x.sw}')">Set ladder to ${ydNum(x.mean)}</button>`
        : applied?`<span class="pm-dc-ok">Ladder set to ${ydNum(pr[x.sw])}</span>`
        : x.sw==='full'?'<span class="pm-dc-need">Full swings come from the bag or a TrackMan import</span>'
        : x.n<2?'<span class="pm-dc-need">One shot: hit it again to change the ladder</span>':'<span class="pm-dc-ok">The ladder already agrees</span>'}</div></div>`; }).join('');
  return `${simGameHead('ladder')}<div class="sim-card"><h3>What your ladder says, and what you carried</h3>${rows||'<p class="pm-note">No carries entered.</p>'}</div>
    <button type="button" class="btn pm-plan-btn" onclick="simGameBack()">Done</button>`;
}
function simLadderApply(id, sw){
  const L=window.simLadderLast; const x=L&&L.review.find(r=>r.id===id&&r.sw===sw); if(!x) return;
  STATE.partials=STATE.partials||{}; const pr=STATE.partials[id]=STATE.partials[id]||{};
  const S=simState(), club=simClub(id);
  S.applyLog.push({kind:'ladder', id, label:club?club.label:id, what:`${SIM_SW_LBL[sw]} ${ydNum(pr[sw])} → ${ydNum(x.mean)}`, at:Date.now(), n:x.n, before:Object.assign({},pr)});
  pr[sw]=Math.round(x.mean);
  const conf=Array.isArray(pr.conf)?pr.conf.slice():[false,false,false,false]; conf[SIM_SW_IDX[sw]]=true; pr.conf=conf;
  x.applied=true;
  simAfterBagChange(`${club?club.label:id} ${SIM_SW_LBL[sw]}: ladder set to ${ydNum(x.mean)}`);
}

/* ==================== THE DOOR ==================== */
/* Sim Golf resumes nothing on its own; a game in progress waits on the Games list. The door
   is hidden while a tournament round is open, because the app is locked then. */
function simSyncButtons(){
  const r=(typeof pmRound==='function')?pmRound():null, locked=!!(r&&r.tournament&&r.tournament.on);
  document.querySelectorAll('[data-sim-btn]').forEach(b=>{ b.hidden=locked; });
}

Object.assign(window, {
  simState, simIsOpen, simOpen, simClose, simSetView, buildSim, simParseTM, simGuessClub, simImportFile, simMapSet,
  simImportCancel, simImportConfirm, simDeleteSession, simOpenSession, simShots, simClean, simClubStats, simDispData,
  simDispApply, simLeanApply, simApplyClub, simApplyAll, simApplyOne, simUndo, simHcp, simG, simGameOpen, simGameBack,
  simSetP, simSetMode, simDiscard, simRoundSetN, simRoundSetName, simRoundStart, simRoundGo, simRoundPar, simRoundYd,
  simRoundFill, simRoundAdd, simRoundLie, simRoundDist, simRoundPen, simRoundDel, simRoundResult, simRoundFinish,
  simShapeStart, simShapeSet, simShapeIn, simShapeScore, simShapeFinish, simLadderRungs, simLadderSetN, simLadderStart,
  simLadderIn, simLadderPts, simLadderFinish, simLadderApply, simSyncButtons, SIM_GAMES
});
