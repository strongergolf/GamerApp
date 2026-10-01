// state/storage.js — WHERE YOUR DATA LIVES, and how it is kept.
//
// One STATE per player, and four places it can be, each for a different failure:
//
//   QUICK COPY   localStorage, as before: synchronous, read at boot, about 5 MB per browser.
//                Once a player's data passes PS_LS_MAX it stops being written here rather than
//                failing silently (the old saveState swallowed a quota error, which is how a
//                full browser loses rounds without a word).
//   DATABASE     IndexedDB on the device: the real store from now on. Hundreds of MB to GBs,
//                asynchronous, written a moment after every save. Boot reads both and keeps
//                whichever is newer, so neither can roll the other back.
//   HISTORY      snapshots of the whole player, in the same database, kept on a tiered
//                schedule: every day for two weeks, a week for twelve weeks, a month for two
//                years, plus any you take yourself and one before every restore or import.
//                Compressed where the browser can (gzip), so years of history stay small.
//   CLOUD        optional, in cloud.js: the same document and snapshots in your own Supabase
//                project, signed in by email, merged rather than overwritten across devices.
//
// PLAYERS: several golfers on one device (a coach and students, a family), each with their own
// separate data. The first one keeps the original storage key, so nothing existing moves.
//
// EXPORT: everything, always, in a documented envelope (format "strongergolf-export"), for one
// player or every player on the device, plus the CSVs. Import takes the envelope or an old
// plain backup, and takes a snapshot first.

const PS_DB = 'strongergolf', PS_DB_VER = 1;
const PS_LS_MAX = 3e6;          /* characters: past this the quick copy stops and the database carries it */
const PS_EXPORT_FORMAT = 'strongergolf-export', PS_EXPORT_VER = 1;

/* ---------- players on this device ---------- */
function psProfiles(){
  let P=null; try{ P=JSON.parse(localStorage.getItem('sg_profiles')||'null'); }catch(_){}
  if(!Array.isArray(P) || !P.length) P=[{id:'default', name:'Player 1', createdAt:Date.now()}];
  return P;
}
function psSaveProfiles(P){ try{ localStorage.setItem('sg_profiles', JSON.stringify(P)); }catch(_){} }
function psActive(){ let a=null; try{ a=localStorage.getItem('sg_active'); }catch(_){} return (a && psProfiles().some(p=>p.id===a)) ? a : 'default'; }
function psKey(id){ return (id||'default')==='default' ? STORE_KEY : STORE_KEY+'__'+id; }
function psActiveName(){ const p=psProfiles().find(x=>x.id===psActive()); return (p&&p.name)||'Player 1'; }

/* ---------- IndexedDB, minimal ---------- */
let PS_DBP=null;
function psDB(){
  if(PS_DBP) return PS_DBP;
  PS_DBP=new Promise((res,rej)=>{
    if(!('indexedDB' in window)){ rej(new Error('No IndexedDB')); return; }
    const rq=indexedDB.open(PS_DB, PS_DB_VER);
    rq.onupgradeneeded=()=>{ const db=rq.result;
      if(!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', {keyPath:'id'});
      if(!db.objectStoreNames.contains('snaps')){ const s=db.createObjectStore('snaps', {keyPath:'sid', autoIncrement:true}); s.createIndex('profile','profile'); }
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);
  });
  return PS_DBP;
}
function psTx(store, mode, fn){
  return psDB().then(db=>new Promise((res,rej)=>{
    const tx=db.transaction(store, mode), st=tx.objectStore(store); let out;
    Promise.resolve(fn(st)).then(v=>{ out=v; });
    tx.oncomplete=()=>res(out); tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error);
  }));
}
const psReq=r=>new Promise((res,rej)=>{ r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
function psGet(store, key){ return psTx(store,'readonly', st=>psReq(st.get(key))); }
function psPut(store, val, key){ return psTx(store,'readwrite', st=>psReq(key===undefined?st.put(val):st.put(val,key))); }
function psDel(store, key){ return psTx(store,'readwrite', st=>psReq(st.delete(key))); }
function psSnapsOf(profile){ return psTx('snaps','readonly', st=>psReq(st.index('profile').getAll(profile))); }

/* ---------- compression (gzip where the browser has it) ---------- */
async function psPack(json){
  if(typeof CompressionStream==='function'){
    try{ const s=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')); return {gz:true, blob:await new Response(s).blob(), raw:json.length}; }catch(_){}
  }
  return {gz:false, json, raw:json.length};
}
async function psUnpack(p){
  if(p.gz){ const s=p.blob.stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(s).text(); }
  return p.json;
}

/* ---------- boot: the newer of the quick copy and the database ---------- */
window.psState = window.psState || { lsOff:false, lsOk:true, idbOk:true, lastWrite:0, pending:false };
const psSaved=o=>(o&&o.meta&&o.meta.savedAt)||0;
function psFreshDoc(name){
  const d=deepClone(DEFAULT_DATA);
  d.profile=Object.assign({}, d.profile, {name:name||'', handicap:'', goalHcp:'', hcpId:''});
  d.play={rounds:[]}; d.hcpHistory=[];
  return d;
}
async function psBootLoad(){
  const id=psActive(), key=psKey(id);
  let ls=null; try{ const raw=localStorage.getItem(key); if(raw) ls=JSON.parse(raw); }catch(_){}
  let rec=null; try{ rec=await psGet('docs', id); }catch(_){ psState.idbOk=false; }
  const fromIdb = rec && rec.doc && (!ls || psSaved(rec.doc)>=psSaved(ls));
  const src = fromIdb ? rec.doc : ls;
  if(src){
    const m=mergeAndFix(src); window.STATE=m.state;
    if(m.changed || !fromIdb) saveState();          /* the database catches up with the quick copy */
  } else {
    window.STATE = id==='default' ? deepClone(DEFAULT_DATA) : psFreshDoc(psActiveName());
    saveState();
  }
  if(ls===null && fromIdb) psState.lsOff = JSON.stringify(window.STATE).length > PS_LS_MAX;
  psState.bootFrom = fromIdb ? 'database' : (ls ? 'quick copy' : 'new');
  if(typeof sgCloudBoot==='function') sgCloudBoot();
}

/* ---------- after every save (called from saveState) ---------- */
let psTimer=null;
function psAfterSave(json){
  psState.pending=true; psState.lastJson=json;
  clearTimeout(psTimer);
  psTimer=setTimeout(psFlush, psState.lsOff?0:400);
}
async function psFlush(){
  clearTimeout(psTimer); psTimer=null;
  const json=psState.lastJson; if(!json || !psState.pending) return;
  psState.pending=false;
  try{
    const doc=JSON.parse(json);
    await psPut('docs', {id:psActive(), name:psActiveName(), savedAt:psSaved(doc), bytes:json.length, doc});
    psState.idbOk=true; psState.lastWrite=Date.now();
    psMaybeSnapshot(json, doc);
  }catch(e){ psState.idbOk=false; psState.idbErr=String(e&&e.message||e); }
  if(typeof sgCloudAfterSave==='function') sgCloudAfterSave();
}
/* the quick copy: written unless the player has outgrown it */
function psWriteQuick(key, json){
  if(json.length>PS_LS_MAX){ psState.lsOff=true; try{ localStorage.removeItem(key); }catch(_){} return; }
  if(psState.lsOff && json.length<=PS_LS_MAX*0.8) psState.lsOff=false;
  if(psState.lsOff) return;
  try{ localStorage.setItem(key, json); psState.lsOk=true; }
  catch(e){ psState.lsOk=false; psState.lsOff=true; try{ localStorage.removeItem(key); }catch(_){} }
}
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && psState.pending) psFlush(); });
window.addEventListener('pagehide', ()=>{ if(psState.pending) psFlush(); });

/* ---------- history: snapshots on a tiered schedule ---------- */
const PS_KEEP = { dayDays:14, weekWeeks:12, monthMonths:24, safety:10 };
const psDay=t=>new Date(t).toISOString().slice(0,10);
async function psMaybeSnapshot(json){
  const id=psActive(), last=await psGet('meta', 'lastSnap:'+id).catch(()=>null);
  if(last && psDay(last)===psDay(Date.now())) return;
  await psSnapshot('daily', json);
}
async function psSnapshot(kind, json, label){
  const id=psActive(); json=json||JSON.stringify(window.STATE);
  const pack=await psPack(json);
  const at=Date.now();
  await psPut('snaps', Object.assign({profile:id, kind, at, label:label||'', savedAt:psSaved(JSON.parse(json))}, pack));
  if(kind==='daily') await psPut('meta', at, 'lastSnap:'+id);
  await psPrune(id);
  if(typeof sgCloudSnapshot==='function' && (kind==='daily'||kind==='manual')) sgCloudSnapshot(kind, json, at);
  return at;
}
/* keep: every daily for 14 days; then the first of each week for 12 weeks; then the first of
   each month for 24 months; every manual one; the last 10 safety ones */
async function psPrune(id){
  const all=(await psSnapsOf(id)).sort((a,b)=>a.at-b.at), now=Date.now(), day=864e5, keep=new Set(), seenW=new Set(), seenM=new Set();
  const safety=all.filter(s=>s.kind==='safety').slice(-PS_KEEP.safety); safety.forEach(s=>keep.add(s.sid));
  all.forEach(s=>{
    if(s.kind==='manual'){ keep.add(s.sid); return; }
    if(s.kind!=='daily') return;
    const age=(now-s.at)/day, d=new Date(s.at);
    if(age<=PS_KEEP.dayDays){ keep.add(s.sid); return; }
    const wk=Math.floor((s.at-d.getUTCDay()*day)/(7*day)), mo=d.getUTCFullYear()+'-'+d.getUTCMonth();
    if(age<=PS_KEEP.weekWeeks*7 && !seenW.has(wk)){ seenW.add(wk); keep.add(s.sid); return; }
    if(age<=PS_KEEP.monthMonths*31 && !seenM.has(mo)){ seenM.add(mo); keep.add(s.sid); }
  });
  for(const s of all) if(!keep.has(s.sid)) await psDel('snaps', s.sid);
}
async function psSnapshotNow(){
  const label=(prompt('Name this snapshot (optional):', '')||'').trim().slice(0,40);
  await psSnapshot('manual', null, label); toast('Snapshot saved'); psRenderCard();
}
async function psRestore(sid){
  const s=await psGet('snaps', sid); if(!s) return;
  if(!confirm(`Restore ${psActiveName()} to ${new Date(s.at).toLocaleString()}?\n\nEverything changes back to that moment. A snapshot of right now is taken first, so this can be undone.`)) return;
  await psSnapshot('safety', null, 'before restoring '+new Date(s.at).toLocaleDateString());
  const json=await psUnpack(s);
  psAdopt(JSON.parse(json)); toast('Restored');
}
async function psDownloadSnap(sid){
  const s=await psGet('snaps', sid); if(!s) return;
  const json=await psUnpack(s);
  psDownload(`strongergolf-${psSlug(psActiveName())}-${psDay(s.at)}.json`, JSON.stringify(psEnvelope([{id:psActive(), name:psActiveName(), data:JSON.parse(json)}]), null, 1), 'application/json');
}
/* put a document in place of the current one */
function psAdopt(doc){
  const m=mergeAndFix(doc); window.STATE=m.state; saveState();
  if(typeof renderAll==='function') renderAll();
  psRenderCard();
}

/* ---------- players: new, switch, rename, delete ---------- */
function psSlug(s){ return String(s||'player').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'player'; }
async function psSwitch(id){
  if(id===psActive()) return;
  await psFlush();
  try{ localStorage.setItem('sg_active', id); }catch(_){}
  location.reload();
}
async function psNewProfile(){
  const name=(prompt('Name of the new player:', '')||'').trim().slice(0,40); if(!name) return;
  const P=psProfiles(); const id='p'+Date.now().toString(36);
  P.push({id, name, createdAt:Date.now()}); psSaveProfiles(P);
  if(confirm(`Switch to ${name} now?\n\nThey start with the demo bag to edit, and none of your rounds or settings.`)) psSwitch(id);
  else psRenderCard();
}
function psRename(id){
  const P=psProfiles(), p=P.find(x=>x.id===id); if(!p) return;
  const name=(prompt('Rename this player:', p.name)||'').trim().slice(0,40); if(!name) return;
  p.name=name; psSaveProfiles(P);
  if(id===psActive() && window.STATE && STATE.profile && !STATE.profile.name){ STATE.profile.name=name; saveState(); }
  psRenderCard();
}
async function psDeleteProfile(id){
  if(id===psActive()){ toast('Switch to another player first'); return; }
  const P=psProfiles(), p=P.find(x=>x.id===id); if(!p) return;
  if(!confirm(`Delete ${p.name} and all of their data on this device?\n\nA full export of ${p.name} downloads first. This cannot be undone here.`)) return;
  await psExportPlayers([id]);
  try{ localStorage.removeItem(psKey(id)); }catch(_){}
  try{ await psDel('docs', id); for(const s of await psSnapsOf(id)) await psDel('snaps', s.sid); await psDel('meta','lastSnap:'+id); }catch(_){}
  psSaveProfiles(P.filter(x=>x.id!==id)); psRenderCard(); toast(`${p.name} deleted`);
}

/* ---------- export and import ---------- */
function psEnvelope(players){
  return { format:PS_EXPORT_FORMAT, version:PS_EXPORT_VER, app:"StrongerGolf Player's App", exportedAt:new Date().toISOString(),
           dataVersion:(typeof DATA_VERSION!=='undefined'?DATA_VERSION:null),
           note:'Each player’s data is the complete app state for that player. Import it in Settings → The App → Your data.',
           players };
}
function psDownload(name, text, type){
  const blob=new Blob([text], {type:type||'application/octet-stream'}), a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function psDocOf(id){
  if(id===psActive()) return window.STATE;
  const rec=await psGet('docs', id).catch(()=>null); if(rec&&rec.doc) return rec.doc;
  try{ const raw=localStorage.getItem(psKey(id)); if(raw) return JSON.parse(raw); }catch(_){}
  return null;
}
async function psExportPlayers(ids){
  const P=psProfiles().filter(p=>!ids || ids.includes(p.id)), players=[];
  for(const p of P){ const d=await psDocOf(p.id); if(d) players.push({id:p.id, name:p.name, data:d}); }
  const name = players.length===1 ? `strongergolf-${psSlug(players[0].name)}-${psDay(Date.now())}.json` : `strongergolf-all-players-${psDay(Date.now())}.json`;
  psDownload(name, JSON.stringify(psEnvelope(players), null, 1), 'application/json');
}
/* TrackMan shots, every session, as one sheet */
function psExportTrackman(){
  const S=((window.STATE.sim||{}).sessions)||[];
  if(!S.length){ toast('No TrackMan sessions yet'); return; }
  const cols=['carry','total','side','sideTot','bspd','cspd','smash','launch','launchDir','spin','spinAxis','ht','land','hang','curve','aoa','path','face','f2p','dynLoft','spinLoft','plane','swingDir'];
  const esc=v=>{ const s=v==null?'':String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
  const rows=[['session','session_date','club','trackman_club',...cols].join(',')];
  S.forEach(s=>s.shots.forEach(sh=>rows.push([s.name, psDay(s.at), sh.club, sh.tmClub, ...cols.map(c=>sh[c])].map(esc).join(','))));
  psDownload(`strongergolf-trackman-${psDay(Date.now())}.csv`, rows.join('\n'), 'text/csv');
}
/* read an export: the envelope (one or many players) or an old plain backup */
function psReadImport(obj){
  if(obj && obj.format===PS_EXPORT_FORMAT && Array.isArray(obj.players)) return obj.players;
  if(obj && obj.profile && obj.clubs) return [{id:null, name:(obj.profile&&obj.profile.name)||'Imported', data:obj}];
  return null;
}
async function psImportFile(input){
  const f=input.files&&input.files[0]; if(!f) return; input.value='';
  let players=null; try{ players=psReadImport(JSON.parse(await f.text())); }catch(_){}
  if(!players||!players.length){ toast('Not a StrongerGolf export'); return; }
  if(players.length===1){
    if(!confirm(`Replace ${psActiveName()}'s data with "${f.name}"${players[0].name?` (${players[0].name})`:''}?\n\nA snapshot of the current data is taken first.`)) return;
    await psSnapshot('safety', null, 'before importing '+f.name);
    psAdopt(players[0].data); toast('Imported'); return;
  }
  if(!confirm(`"${f.name}" holds ${players.length} players. Add them to this device as new players? Nobody already here is changed.`)) return;
  const P=psProfiles();
  for(const p of players){ const id='p'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    P.push({id, name:p.name||'Imported', createdAt:Date.now()});
    const json=JSON.stringify(p.data); await psPut('docs', {id, name:p.name, savedAt:psSaved(p.data)||Date.now(), bytes:json.length, doc:p.data});
    if(json.length<=PS_LS_MAX){ try{ localStorage.setItem(psKey(id), json); }catch(_){} } }
  psSaveProfiles(P); psRenderCard(); toast(`${players.length} players added`);
}

/* ---------- the card: Settings → The App → Your data ---------- */
function psBytes(n){ return n==null?'—':n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(0)} KB`:`${(n/1048576).toFixed(1)} MB`; }
async function psPersist(){
  if(!(navigator.storage&&navigator.storage.persist)){ toast('This browser decides for itself'); return; }
  const ok=await navigator.storage.persist(); toast(ok?'The browser will keep it':'The browser said no; it may clear it if space runs short'); psRenderCard();
}
async function psRenderCard(){
  const wrap=document.getElementById('sg-data-wrap'); if(!wrap) return;
  const est = navigator.storage&&navigator.storage.estimate ? await navigator.storage.estimate().catch(()=>null) : null;
  const persisted = navigator.storage&&navigator.storage.persisted ? await navigator.storage.persisted().catch(()=>null) : null;
  const json=JSON.stringify(window.STATE||{}), id=psActive();
  const snaps=(await psSnapsOf(id).catch(()=>[])).sort((a,b)=>b.at-a.at);
  const P=psProfiles();
  const kindLbl={daily:'Daily', manual:'Saved by you', safety:'Before a change'};
  const snapRows=snaps.slice(0,24).map(s=>`<div class="ps-snap"><span><b>${new Date(s.at).toLocaleDateString([], {year:'numeric', month:'short', day:'numeric'})}</b> ${new Date(s.at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}
      <i>${kindLbl[s.kind]||s.kind}${s.label?` · ${escapeHtml(s.label)}`:''} · ${psBytes(s.gz?s.blob.size:(s.json||'').length)}</i></span>
      <button type="button" class="pm-dc-undo" onclick="psDownloadSnap(${s.sid})" aria-label="Download this snapshot">⬇</button>
      <button type="button" class="pm-dc-undo" onclick="psRestore(${s.sid})">Restore</button></div>`).join('');
  const players=P.map(p=>`<div class="ps-player${p.id===id?' on':''}"><span><b>${escapeHtml(p.name)}</b>${p.id===id?' <i>this player</i>':''}</span>
      ${p.id===id?'':`<button type="button" class="pm-dc-undo" onclick="psSwitch('${p.id}')">Switch</button>`}
      <button type="button" class="pm-dc-undo" onclick="psRename('${p.id}')">Rename</button>
      ${p.id===id?'':`<button type="button" class="pm-dc-undo" onclick="psDeleteProfile('${p.id}')" aria-label="Delete ${escapeHtml(p.name)}">✕</button>`}</div>`).join('');
  wrap.innerHTML=`<div class="profile-card ps-card">
      <h3>Your Data <span class="card-sub">where it lives, its history, and how to take it with you</span></h3>
      <div class="ps-sec"><h4>On this device</h4>
        <div class="rd-chips">
          <span>${escapeHtml(psActiveName())} <b>${psBytes(json.length)}</b></span>
          <span>Database <b>${psState.idbOk?'✓':'✗'}</b><i>${psState.lastWrite?'saved '+new Date(psState.lastWrite).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}):''}</i></span>
          <span>Quick copy <b>${psState.lsOff?'off':'✓'}</b><i>${psState.lsOff?'too big; the database carries it':''}</i></span>
          ${est?`<span>Browser storage <b>${psBytes(est.usage)}</b><i>of ${psBytes(est.quota)}</i></span>`:''}
          <span>Kept permanently <b>${persisted===true?'✓':persisted===false?'not yet':'?'}</b></span>
        </div>
        ${persisted===false?`<button type="button" class="btn pm-dc-apply" onclick="psPersist()">Ask the browser to keep it</button>`:''}
        <p class="pm-note">Saved to the device's database a moment after every change. Browsers can clear site data when space runs short unless asked to keep it, so ask once on each device, and keep an export somewhere safe.</p></div>
      <div class="ps-sec"><h4>History <span>every day for two weeks, a week for twelve weeks, a month for two years</span></h4>
        ${snapRows||'<p class="pm-note">The first snapshot is taken with today’s first save.</p>'}
        <button type="button" class="btn pm-dc-apply" onclick="psSnapshotNow()">Save a snapshot now</button></div>
      <div class="ps-sec"><h4>Players on this device</h4>${players}
        <button type="button" class="btn pm-dc-apply" onclick="psNewProfile()">+ New player</button>
        <p class="pm-note">Each player has their own bag, rounds, courses, settings and history; switching reloads the app as them.</p></div>
      <div class="ps-sec"><h4>Take it with you</h4>
        <div class="ps-btns">
          <button type="button" class="btn" onclick="psExportPlayers(['${id}'])">⬇ Everything for ${escapeHtml(psActiveName())}</button>
          ${P.length>1?`<button type="button" class="btn" onclick="psExportPlayers(null)">⬇ Every player</button>`:''}
          <button type="button" class="btn" onclick="typeof rdExport==='function'&&rdExport('rounds')">⬇ Rounds CSV</button>
          <button type="button" class="btn" onclick="typeof rdExport==='function'&&rdExport('shots')">⬇ Shots CSV</button>
          <button type="button" class="btn" onclick="psExportTrackman()">⬇ TrackMan CSV</button>
          <button type="button" class="btn" onclick="typeof exportClubsCsv==='function'&&exportClubsCsv()">⬇ Clubs CSV</button>
          <label class="btn">⬆ Import<input type="file" accept=".json,application/json" hidden onchange="psImportFile(this)"></label>
        </div>
        <p class="pm-note">The JSON is everything, and restores the app exactly; it is plain, documented JSON (format "${PS_EXPORT_FORMAT}"), readable without this app. The CSVs are for spreadsheets and other tools.</p></div>
      <div id="sg-cloud-wrap"></div>
    </div>`;
  if(typeof sgCloudRender==='function') sgCloudRender();
}

Object.assign(window, { PS_LS_MAX, PS_EXPORT_FORMAT, psProfiles, psSaveProfiles, psActive, psKey, psActiveName, psDB, psGet, psPut, psDel, psSnapsOf,
  psPack, psUnpack, psBootLoad, psAfterSave, psFlush, psWriteQuick, psSnapshot, psSnapshotNow, psPrune, psRestore, psDownloadSnap, psAdopt,
  psSwitch, psNewProfile, psRename, psDeleteProfile, psEnvelope, psDownload, psDocOf, psExportPlayers, psExportTrackman, psReadImport,
  psImportFile, psPersist, psRenderCard, psFreshDoc });
