// state/cloud.js — YOUR DATA IN YOUR OWN CLOUD (optional).
//
// The device database (storage.js) is the store; this keeps a copy of every player, and a
// history of them, in a Supabase project, and keeps devices in step. Supabase because it is a
// plain Postgres database with sign-in and row-level security, free to start, and the data
// stays exportable as ordinary SQL and JSON whatever happens to this app. Nothing here needs a
// library: Supabase's auth and data APIs are HTTP, and that is all this uses.
//
// SIGN-IN: an emailed link (no password to keep). The link comes back to this app with a
// session; the session refreshes itself.
//
// SYNC, MERGED NOT OVERWRITTEN. Each player is one document per account. When two devices have
// both changed it, the newer document's settings win, but the things that accumulate (rounds,
// TrackMan sessions, logs, courses, plans) are combined by their ids, so a round played on the
// phone and a session imported on the laptop both survive. Deleting something records it
// (meta.deleted), so a deletion travels instead of the other device bringing it back.
//
// HISTORY: the daily and hand-taken snapshots also go to the cloud, kept on the same schedule.
//
// TESTING: window.sgRemoteOverride stands in for Supabase (same methods), so the merge and the
// sync can be exercised without an account. The Supabase calls themselves are untested until a
// project is connected.

const SG_CLOUD_CFG='sg_cloud', SG_CLOUD_SESS='sg_cloud_session';
window.sgCloud = window.sgCloud || { status:'off', lastSync:0, err:null, busy:false, pushedAt:0, remoteList:null };
function sgCfg(){ try{ return JSON.parse(localStorage.getItem(SG_CLOUD_CFG)||'null'); }catch(_){ return null; } }
function sgSess(){ try{ return JSON.parse(localStorage.getItem(SG_CLOUD_SESS)||'null'); }catch(_){ return null; } }
function sgSetSess(s){ try{ if(s) localStorage.setItem(SG_CLOUD_SESS, JSON.stringify(s)); else localStorage.removeItem(SG_CLOUD_SESS); }catch(_){} }
function sgJwt(t){ try{ return JSON.parse(atob(String(t).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }catch(_){ return {}; } }
function sgSessFrom(j){
  const p=sgJwt(j.access_token);
  return { access_token:j.access_token, refresh_token:j.refresh_token,
           expires_at: j.expires_at ? +j.expires_at : Math.floor(Date.now()/1000)+(+j.expires_in||3600),
           user:{ id:(j.user&&j.user.id)||p.sub, email:(j.user&&j.user.email)||p.email } };
}
async function sgErr(r){ try{ const j=await r.json(); return j.msg||j.message||j.error_description||j.error||('HTTP '+r.status); }catch(_){ return 'HTTP '+r.status; } }

/* ---------- the remote: Supabase over HTTP ---------- */
function sgRemote(){
  if(window.sgRemoteOverride) return window.sgRemoteOverride;
  const c=sgCfg(); if(!c||!c.url||!c.key) return null;
  return sgSupabase(c);
}
function sgSupabase(c){
  const base=String(c.url).replace(/\/+$/,'');
  const H=(tok, extra)=>Object.assign({'apikey':c.key, 'Authorization':'Bearer '+(tok||c.key), 'Content-Type':'application/json'}, extra||{});
  async function refresh(s){
    const r=await fetch(base+'/auth/v1/token?grant_type=refresh_token', {method:'POST', headers:H(), body:JSON.stringify({refresh_token:s.refresh_token})});
    if(!r.ok){ sgSetSess(null); throw new Error('Signed out: sign in again'); }
    const ns=sgSessFrom(await r.json()); sgSetSess(ns); return ns;
  }
  async function sess(){
    let s=sgSess(); if(!s) throw new Error('Not signed in');
    if(s.expires_at && Date.now()/1000 > s.expires_at-60) s=await refresh(s);
    return s;
  }
  async function rest(method, path, body, extra){
    const s=await sess();
    const r=await fetch(base+'/rest/v1/'+path, {method, headers:H(s.access_token, extra), body:body===undefined?undefined:JSON.stringify(body)});
    if(!r.ok) throw new Error(await sgErr(r));
    const t=await r.text(); return t?JSON.parse(t):null;
  }
  return {
    kind:'supabase',
    async sendLink(email){
      const r=await fetch(base+'/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+location.pathname), {method:'POST', headers:H(), body:JSON.stringify({email, create_user:true})});
      if(!r.ok) throw new Error(await sgErr(r));
    },
    async list(){ return rest('GET', 'player_docs?select=profile_id,name,saved_at'); },
    async pull(pid){ const rows=await rest('GET', 'player_docs?select=doc,saved_at,name&profile_id=eq.'+encodeURIComponent(pid)); return rows&&rows[0]||null; },
    async push(pid, name, doc){ const s=await sess();
      return rest('POST', 'player_docs?on_conflict=user_id,profile_id', [{user_id:s.user.id, profile_id:pid, name, doc, saved_at:(doc.meta&&doc.meta.savedAt)||Date.now(), updated_at:new Date().toISOString()}],
                  {'Prefer':'resolution=merge-duplicates,return=minimal'}); },
    async snap(pid, kind, at, doc){ const s=await sess();
      return rest('POST', 'player_snapshots', [{user_id:s.user.id, profile_id:pid, kind, taken_at:at, doc}], {'Prefer':'return=minimal'}); },
    async snaps(pid){ return rest('GET', 'player_snapshots?select=id,kind,taken_at&order=taken_at.desc&limit=200&profile_id=eq.'+encodeURIComponent(pid)); },
    async snapDoc(id){ const rows=await rest('GET', 'player_snapshots?select=doc&id=eq.'+encodeURIComponent(id)); return rows&&rows[0]&&rows[0].doc; },
    async dropSnap(id){ return rest('DELETE', 'player_snapshots?id=eq.'+encodeURIComponent(id)); }
  };
}

/* ---------- merging two copies of a player ---------- */
const SG_COLLECTIONS = [
  ['play.rounds',    x=>x.id],
  ['sim.sessions',   x=>x.id],
  ['sim.history',    x=>x.game+'|'+x.at],
  ['sim.applyLog',   x=>(x.at||'')+'|'+(x.id||'')],
  ['play.bagLog',    x=>(x.at||'')+'|'+(x.id||'')],
  ['play.dispLog',   x=>(x.at||'')+'|'+(x.kind||'')],
  ['hcpHistory',     x=>JSON.stringify(x)],
  ['lmSessions',     x=>JSON.stringify(x)],
  ['scoring.rounds', x=>JSON.stringify(x)],
  ['courses',        x=>x.id||x.name]
];
const SG_MAPS = [ ['play.plans', v=>(v&&v.madeAt)||0] ];
const SG_SORT = { 'play.rounds':x=>x.startedAt||0, 'sim.sessions':x=>x.at||0 };
function sgGet(o,path){ return path.split('.').reduce((a,k)=>a==null?a:a[k], o); }
function sgSetPath(o,path,v){ const ks=path.split('.'); let c=o; ks.slice(0,-1).forEach(k=>{ if(c[k]==null||typeof c[k]!=='object') c[k]={}; c=c[k]; }); c[ks[ks.length-1]]=v; }
function sgMerge(a, b){
  const ta=(a&&a.meta&&a.meta.savedAt)||0, tb=(b&&b.meta&&b.meta.savedAt)||0;
  const newer = tb>ta ? b : a, older = newer===a ? b : a;
  const out=JSON.parse(JSON.stringify(newer));
  const tomb={};
  [a,b].forEach(d=>{ const T=(d&&d.meta&&d.meta.deleted)||{}; Object.keys(T).forEach(p=>{ tomb[p]=Object.assign(tomb[p]||{}, T[p]); }); });
  let added=0, removed=0;
  SG_COLLECTIONS.forEach(([path,keyOf])=>{
    const A=sgGet(newer,path), B=sgGet(older,path);
    if(!Array.isArray(A) && !Array.isArray(B)) return;
    const seen=new Set(), res=[];
    (A||[]).forEach(x=>{ const k=keyOf(x); if(!seen.has(k)){ seen.add(k); res.push(x); } });
    (B||[]).forEach(x=>{ const k=keyOf(x); if(!seen.has(k)){ seen.add(k); res.push(JSON.parse(JSON.stringify(x))); added++; } });
    const T=tomb[path]||{}, fin=res.filter(x=>!T[keyOf(x)]); removed+=res.length-fin.length;
    if(SG_SORT[path]) fin.sort((p,q)=>SG_SORT[path](p)-SG_SORT[path](q));
    sgSetPath(out, path, fin);
  });
  SG_MAPS.forEach(([path,stamp])=>{
    const A=sgGet(newer,path)||{}, B=sgGet(older,path)||{}, res=Object.assign({}, A), T=tomb[path]||{};
    Object.keys(B).forEach(k=>{ if(!(k in res)){ res[k]=B[k]; added++; } else if(stamp(B[k])>stamp(res[k])) res[k]=B[k]; });
    Object.keys(T).forEach(k=>{ if(k in res){ delete res[k]; removed++; } });
    if(Object.keys(res).length || sgGet(newer,path)) sgSetPath(out, path, res);
  });
  out.meta=Object.assign({}, out.meta||{}, {deleted:tomb});
  return {doc:out, added, removed, remoteNewer: newer===b};
}
/* record a deletion so it travels to the other devices */
function sgForget(path, key){
  if(!window.STATE) return;
  const m=STATE.meta=STATE.meta||{}; const d=m.deleted=m.deleted||{};
  (d[path]=d[path]||{})[key]=Date.now();
}

/* ---------- sync ---------- */
let sgTimer=null;
function sgSignedIn(){ return !!(window.sgRemoteOverride || (sgCfg() && sgSess())); }
async function sgSync(quiet){
  const R=sgRemote(); if(!R || !sgSignedIn() || sgCloud.busy) return;
  sgCloud.busy=true; sgCloudRender();
  try{
    const pid=psActive(), remote=await R.pull(pid);
    if(remote && remote.doc){
      const m=sgMerge(window.STATE, remote.doc);
      if(m.added || m.removed || m.remoteNewer){
        const mm=mergeAndFix(m.doc); window.STATE=mm.state;
        saveState();
        if(typeof renderAll==='function') renderAll();
        if(!quiet && (m.added||m.remoteNewer)) toast(m.added?`${m.added} item${m.added===1?'':'s'} from your other devices`:'Updated from the cloud');
      }
    }
    await R.push(pid, psActiveName(), window.STATE);
    sgCloud.pushedAt=(STATE.meta&&STATE.meta.savedAt)||Date.now();
    sgCloud.lastSync=Date.now(); sgCloud.err=null; sgCloud.status='synced';
  }catch(e){ sgCloud.err=String(e&&e.message||e); sgCloud.status='error'; }
  sgCloud.busy=false; sgCloudRender();
}
function sgCloudAfterSave(){
  if(!sgSignedIn()) return;
  const saved=(window.STATE&&STATE.meta&&STATE.meta.savedAt)||0;
  if(saved && saved<=sgCloud.pushedAt) return;          /* this save is what was just pushed */
  clearTimeout(sgTimer); sgTimer=setTimeout(()=>sgSync(true), 8000);
}
async function sgCloudSnapshot(kind, json, at){
  const R=sgRemote(); if(!R || !sgSignedIn()) return;
  try{ await R.snap(psActive(), kind, at, JSON.parse(json)); sgPruneCloud(); }catch(_){}
}
/* the cloud keeps the same schedule as the device: days, then weeks, then months; manual kept */
async function sgPruneCloud(){
  const R=sgRemote(); if(!R) return;
  try{
    const L=(await R.snaps(psActive())||[]).slice().sort((a,b)=>a.taken_at-b.taken_at), now=Date.now(), day=864e5, keep=new Set(), W=new Set(), M=new Set();
    L.forEach(s=>{ if(s.kind!=='daily'){ keep.add(s.id); return; } const age=(now-s.taken_at)/day, d=new Date(+s.taken_at);
      if(age<=14){ keep.add(s.id); return; }
      const wk=Math.floor((s.taken_at-d.getUTCDay()*day)/(7*day)), mo=d.getUTCFullYear()+'-'+d.getUTCMonth();
      if(age<=84 && !W.has(wk)){ W.add(wk); keep.add(s.id); return; }
      if(age<=744 && !M.has(mo)){ M.add(mo); keep.add(s.id); } });
    for(const s of L) if(!keep.has(s.id)) await R.dropSnap(s.id);
  }catch(_){}
}

/* ---------- boot: a sign-in link coming back, then a first sync ---------- */
function sgCloudBoot(){
  const h=location.hash||'';
  if(/access_token=/.test(h)){
    const q=new URLSearchParams(h.slice(1));
    const s=sgSessFrom({access_token:q.get('access_token'), refresh_token:q.get('refresh_token'), expires_in:q.get('expires_in'), expires_at:q.get('expires_at')});
    if(s.access_token && s.refresh_token){ sgSetSess(s); setTimeout(()=>toast('Signed in: syncing'), 400); }
    try{ history.replaceState(null, '', location.pathname+location.search); }catch(_){}
  } else if(/error_description=/.test(h)){
    const q=new URLSearchParams(h.slice(1)); setTimeout(()=>toast('Sign-in: '+(q.get('error_description')||'failed')), 400);
    try{ history.replaceState(null, '', location.pathname+location.search); }catch(_){}
  }
  if(sgSignedIn()) setTimeout(()=>sgSync(true), 1500);
}
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && sgSignedIn() && Date.now()-sgCloud.lastSync>60e3) sgSync(true); });
window.addEventListener('online', ()=>{ if(sgSignedIn()) sgSync(true); });

/* ---------- actions ---------- */
function sgSaveCfg(){
  const url=(document.getElementById('sg-c-url')||{}).value||'', key=(document.getElementById('sg-c-key')||{}).value||'';
  if(!/^https:\/\/.+/.test(url.trim()) || key.trim().length<20){ toast('Paste the project URL and the anon public key'); return; }
  try{ localStorage.setItem(SG_CLOUD_CFG, JSON.stringify({url:url.trim(), key:key.trim()})); }catch(_){}
  sgCloudRender();
}
function sgForgetCfg(){
  if(!confirm('Disconnect this device from the cloud? Nothing is deleted, here or there.')) return;
  try{ localStorage.removeItem(SG_CLOUD_CFG); }catch(_){} sgSetSess(null); sgCloud.status='off'; sgCloudRender();
}
async function sgSendLink(){
  const email=((document.getElementById('sg-c-email')||{}).value||'').trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Enter your email address'); return; }
  try{ await sgRemote().sendLink(email); sgCloud.linkSent=email; toast('Check your email for the sign-in link'); }
  catch(e){ toast('Could not send: '+(e.message||e)); }
  sgCloudRender();
}
function sgSignOut(){ sgSetSess(null); sgCloud.status='off'; sgCloudRender(); toast('Signed out of the cloud on this device'); }
async function sgBringDown(pid, name){
  const R=sgRemote(); if(!R) return;
  try{
    const row=await R.pull(pid); if(!row||!row.doc){ toast('Nothing there'); return; }
    const P=psProfiles(); if(!P.some(p=>p.id===pid)){ P.push({id:pid, name:name||row.name||'Player', createdAt:Date.now()}); psSaveProfiles(P); }
    const json=JSON.stringify(row.doc);
    await psPut('docs', {id:pid, name:name||row.name, savedAt:(row.doc.meta&&row.doc.meta.savedAt)||0, bytes:json.length, doc:row.doc});
    toast(`${name||row.name} is on this device`); sgCloud.remoteList=null; psRenderCard();
  }catch(e){ toast(String(e.message||e)); }
}
async function sgRestoreCloud(id){
  const R=sgRemote(); if(!R) return;
  if(!confirm('Restore this player to that cloud snapshot? A snapshot of right now is taken first.')) return;
  try{ const doc=await R.snapDoc(id); if(!doc){ toast('Snapshot not found'); return; }
    await psSnapshot('safety', null, 'before a cloud restore'); psAdopt(doc); toast('Restored from the cloud'); }
  catch(e){ toast(String(e.message||e)); }
}
async function sgExportCloud(){
  const R=sgRemote(); if(!R) return;
  try{ const L=await R.list()||[], players=[];
    for(const p of L){ const row=await R.pull(p.profile_id); if(row&&row.doc) players.push({id:p.profile_id, name:p.name, data:row.doc}); }
    psDownload(`strongergolf-cloud-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(psEnvelope(players), null, 1), 'application/json');
  }catch(e){ toast(String(e.message||e)); }
}

/* ---------- the setup script, shown in the app and kept in supabase/schema.sql ---------- */
const SG_SCHEMA_SQL = `-- StrongerGolf: your data in your own Supabase project.
-- Run once in the Supabase SQL editor. Safe to run again.
create table if not exists public.player_docs (
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id text   not null,
  name       text,
  doc        jsonb  not null,
  saved_at   bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);
create table if not exists public.player_snapshots (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id text   not null,
  kind       text   not null,
  taken_at   bigint not null,
  doc        jsonb  not null,
  created_at timestamptz not null default now()
);
create index if not exists player_snapshots_by_profile on public.player_snapshots (user_id, profile_id, taken_at desc);
alter table public.player_docs      enable row level security;
alter table public.player_snapshots enable row level security;
drop policy if exists "own docs" on public.player_docs;
create policy "own docs" on public.player_docs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own snapshots" on public.player_snapshots;
create policy "own snapshots" on public.player_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
`;
function sgCopySql(){
  const done=()=>toast('Setup script copied');
  try{ navigator.clipboard.writeText(SG_SCHEMA_SQL).then(done, ()=>psDownload('strongergolf-supabase-setup.sql', SG_SCHEMA_SQL, 'text/plain')); }
  catch(_){ psDownload('strongergolf-supabase-setup.sql', SG_SCHEMA_SQL, 'text/plain'); }
}

/* ---------- the cloud section of the Your Data card ---------- */
async function sgCloudRender(){
  const w=document.getElementById('sg-cloud-wrap'); if(!w) return;
  const c=sgCfg(), s=sgSess(), here=location.origin+location.pathname;
  if(!c && !window.sgRemoteOverride){
    w.innerHTML=`<div class="ps-sec"><h4>Cloud <span>optional: your own Supabase project</span></h4>
      <p class="pm-note">Keeps every player and their history off the device, signed in by email, and keeps your phone and computer in step, merging rounds rather than overwriting them. The data sits in your own Supabase project (a Postgres database), so it is yours, and exportable, whatever happens to this app.</p>
      <details class="ps-setup"><summary>Set it up (about ten minutes)</summary>
        <ol>
          <li>Create a free project at <b>supabase.com</b>.</li>
          <li>In its <b>SQL Editor</b>, run the setup script: <button type="button" class="pm-shot-btn" onclick="sgCopySql()">Copy setup script</button></li>
          <li>In <b>Authentication → URL Configuration</b>, set the Site URL to <code>${escapeHtml(here)}</code></li>
          <li>In <b>Project Settings → API</b>, copy the Project URL and the <b>anon public</b> key into the boxes below. That key is designed to sit in an app; your data is protected by the script's row-level security.</li>
        </ol>
        <div class="whs-tee"><label>Project URL<input id="sg-c-url" type="url" placeholder="https://xxxx.supabase.co"></label></div>
        <div class="whs-tee"><label>Anon public key<input id="sg-c-key" type="text" placeholder="eyJ..."></label></div>
        <button type="button" class="btn pm-dc-apply" onclick="sgSaveCfg()">Connect</button>
      </details></div>`;
    return;
  }
  if(!sgSignedIn()){
    w.innerHTML=`<div class="ps-sec"><h4>Cloud <span>connected to your project · not signed in on this device</span></h4>
      <div class="whs-tee"><label>Email<input id="sg-c-email" type="email" placeholder="you@example.com" value="${escapeHtml(sgCloud.linkSent||'')}"></label></div>
      <button type="button" class="btn pm-dc-apply" onclick="sgSendLink()">Email me a sign-in link</button>
      ${sgCloud.linkSent?`<p class="pm-note">Link sent to <b>${escapeHtml(sgCloud.linkSent)}</b>. Open it on this device; it brings you back here signed in.</p>`:'<p class="pm-note">No password: a link arrives by email, and opening it on this device signs it in.</p>'}
      <button type="button" class="rd-link" onclick="sgForgetCfg()">disconnect this device from the project</button></div>`;
    return;
  }
  const who=(s&&s.user&&s.user.email)||(window.sgRemoteOverride?'test cloud':'');
  let remoteRows='', snapRows='';
  try{
    const R=sgRemote();
    if(!sgCloud.remoteList) sgCloud.remoteList=await R.list();
    const local=new Set(psProfiles().map(p=>p.id));
    remoteRows=(sgCloud.remoteList||[]).filter(r=>!local.has(r.profile_id)).map(r=>`<div class="ps-player"><span><b>${escapeHtml(r.name||r.profile_id)}</b> <i>in the cloud, not on this device</i></span>
      <button type="button" class="pm-dc-undo" onclick="sgBringDown('${escapeHtml(r.profile_id)}', ${escapeHtml(JSON.stringify(r.name||''))})">Add here</button></div>`).join('');
    const S=(await R.snaps(psActive())||[]).slice(0,10);
    snapRows=S.map(x=>`<div class="ps-snap"><span><b>${new Date(+x.taken_at).toLocaleDateString([], {year:'numeric', month:'short', day:'numeric'})}</b> <i>${x.kind==='manual'?'saved by you':'daily'}</i></span>
      <button type="button" class="pm-dc-undo" onclick="sgRestoreCloud('${escapeHtml(String(x.id))}')">Restore</button></div>`).join('');
  }catch(e){ sgCloud.err=String(e&&e.message||e); }
  w.innerHTML=`<div class="ps-sec"><h4>Cloud <span>${escapeHtml(who)}</span></h4>
      <div class="rd-chips"><span>Status <b>${sgCloud.busy?'syncing…':sgCloud.status==='error'?'✗':'✓'}</b><i>${sgCloud.lastSync?'last '+new Date(sgCloud.lastSync).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}):'not yet'}</i></span></div>
      ${sgCloud.err?`<p class="pm-warn">${escapeHtml(sgCloud.err)}</p>`:''}
      <div class="ps-btns"><button type="button" class="btn" onclick="sgSync(false)">Sync now</button>
        <button type="button" class="btn" onclick="sgExportCloud()">⬇ Everything in the cloud</button>
        <button type="button" class="btn" onclick="sgSignOut()">Sign out here</button></div>
      ${remoteRows?`<div class="ps-sub">${remoteRows}</div>`:''}
      ${snapRows?`<h4 class="ps-h5">Cloud history</h4>${snapRows}`:''}
      <p class="pm-note">Syncs a few seconds after a change, when the app comes back to the screen, and when the connection returns. Rounds, sessions and logs from every device are combined; deletions travel.</p></div>`;
}

Object.assign(window, { SG_SCHEMA_SQL, SG_COLLECTIONS, sgCfg, sgSess, sgSetSess, sgSessFrom, sgRemote, sgSupabase, sgMerge, sgForget, sgSync,
  sgSignedIn, sgCloudAfterSave, sgCloudSnapshot, sgPruneCloud, sgCloudBoot, sgSaveCfg, sgForgetCfg, sgSendLink, sgSignOut, sgBringDown,
  sgRestoreCloud, sgExportCloud, sgCopySql, sgCloudRender });
