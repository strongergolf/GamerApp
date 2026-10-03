// features/course-sync.js — UPDATING A COURSE FROM THE MAP without losing anything added to it.
//
// A course is two kinds of thing. The MAP's: the shapes (tee, green, fairways, hazards, tee
// boxes), the georeference, and the par, yardage and stroke index when the map has them. The
// GOLFER's: the name, the tees with their ratings and slopes, a par or stroke index typed in,
// and everything placed ON the course in its own field coordinates: pin sheets, Hole Overlay
// anchors, plans, and every shot and aim point of every round played there.
//
// A refresh replaces the first and keeps the second. The catch is that the second is stored in
// field units, and a new import can draw the hole in a different frame. So every stored point
// on a refreshed hole is carried across:
//   - old hole georeferenced: field -> lat/lon on the old hole -> field on the new. Exact.
//   - old hole not (the original sample courses): the similarity transform that takes the old
//     tee-to-green line onto the new one. Both lines come from the same mapped hole, so the
//     two frames differ by rotation, scale and shift only; for an unchanged hole it is exact.
//
// Shipped courses (public/preset-courses.json) carry a rev. A course in the list with an older
// rev is refreshed from the shipped copy on load; an `auto` preset the player has never had is
// added once. One the player deleted (tombstoned in meta.deleted) is not brought back.

const CS_GEOM = new Set(['tee','teeLine','pin','green','fairway','fairways','hazards','geo','scaleYpu','teeBoxes','bg','src']);

/* old field point -> new field point, for one hole; null when there is nothing to anchor on */
function csHoleMap(oldH, newH){
  if(oldH.geo && newH.geo) return p=>{ const ll=cfFieldToLatLon(oldH,p); return ll ? cfLatLonToField(newH, ll.lat, ll.lon) : null; };
  const a0=oldH.teeLine||oldH.tee, a1=oldH.pin, b0=newH.teeLine||newH.tee, b1=newH.pin;
  if(!a0||!a1||!b0||!b1) return null;
  const ax=a1.x-a0.x, ay=a1.y-a0.y, bx=b1.x-b0.x, by=b1.y-b0.y, al=Math.hypot(ax,ay);
  if(!(al>1)) return null;
  const k=Math.hypot(bx,by)/al, th=Math.atan2(by,bx)-Math.atan2(ay,ax), c=Math.cos(th)*k, s=Math.sin(th)*k;
  return p=>{ const dx=p.x-a0.x, dy=p.y-a0.y; return {x:b0.x+c*dx-s*dy, y:b0.y+s*dx+c*dy}; };
}
/* every {x,y} inside a stored record, moved in place */
function csWalk(o, f, depth){
  depth=depth||0; if(!o || typeof o!=='object' || depth>8) return 0;
  let n=0;
  if(Array.isArray(o)){ o.forEach(x=>{ n+=csWalk(x,f,depth+1); }); return n; }
  if(typeof o.x==='number' && typeof o.y==='number'){ const q=f(o); if(q){ o.x=Math.round(q.x); o.y=Math.round(q.y); n++; } }
  Object.keys(o).forEach(k=>{ const v=o[k]; if(v && typeof v==='object') n+=csWalk(v,f,depth+1); });
  return n;
}

/* Merge FRESH (a course just built from the map) into C, in place. Returns what it did. */
function csRefresh(c, fresh){
  const key=c.id||c.name, P=STATE.play||{};
  const rounds=(P.rounds||[]).concat(P.round?[P.round]:[]).filter(r=>r && r.courseKey===key);
  const plan=(P.plans||{})[key], sheets=((P.pinSheets||{})[key]||{}).sheets||[], anchors=P.anchors||{};
  const out=[], used=new Set(); let moved=0;
  (fresh.holes||[]).forEach(nh=>{
    const oh=(c.holes||[]).find(h=>h.num===nh.num);
    if(!oh){ out.push(nh); return; }
    used.add(oh);
    const f=csHoleMap(oh, nh), n=String(nh.num);
    if(f){
      rounds.forEach(r=>{ if(r.holes&&r.holes[n]) moved+=csWalk(r.holes[n],f); if(r.plan&&r.plan.holes&&r.plan.holes[n]) moved+=csWalk(r.plan.holes[n],f); });
      if(plan&&plan.holes&&plan.holes[n]) moved+=csWalk(plan.holes[n],f);
      sheets.forEach(s=>{ if(s.pins&&s.pins[n]) moved+=csWalk(s.pins[n],f); });
      if(anchors[key+'|'+n]) moved+=csWalk(anchors[key+'|'+n],f);
    }
    /* the map's values replace the map's; a value the golfer typed, or one the map does not
       have, stays. A hole from before values were labelled counts as the map's, except a stroke
       index: the importer never wrote one before, so one already there was typed. */
    const os=oh.src||{}, ns=nh.src||{}, h=Object.assign({}, nh), src=Object.assign({}, ns);
    ['par','yards'].forEach(k=>{ if(os[k]==='user' || ns[k]!=='map'){ if(oh[k]!=null) h[k]=oh[k]; src[k]=os[k]||'user'; } });
    if(oh.si!=null && (os.si!=='map' || nh.si==null)){ h.si=oh.si; src.si=os.si||'user'; }
    h.src=src;
    Object.keys(oh).forEach(k=>{ if(!(k in h) && !CS_GEOM.has(k)) h[k]=oh[k]; });
    out.push(h);
  });
  /* a hole the map no longer has is kept as it was */
  (c.holes||[]).forEach(oh=>{ if(!used.has(oh)) out.push(oh); });
  out.sort((a,b)=>(a.num||99)-(b.num||99));
  c.holes=out; c.source='osm'; c.attribution=fresh.attribution||c.attribution;
  if(fresh.osm) c.osm=fresh.osm;
  if(fresh.rev!=null) c.rev=fresh.rev;
  c.mapAt=Date.now();
  if(c.teeBox) cfSetTeeBoxOn(c, c.teeBox);
  if(typeof cfPinCacheClear==='function') cfPinCacheClear();
  if(window.PM_OPT_CACHE) PM_OPT_CACHE.clear();
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1;
  return {holes:out.length, moved};
}

/* On load: bring shipped courses up to date, and add the ones meant for everyone. */
async function csPresetSync(){
  if(typeof fetch!=='function' || !window.STATE) return null;
  let list; try{ list=await cfFetchJSON('/preset-courses.json', 15000); }catch(_){ return null; }
  if(!Array.isArray(list)) return null;
  window.cfPresetCache=list;                         /* the Plan page's course picker offers these */
  const cs=cfCourses(), seen=new Set(STATE.coursePresetsSeen||[]), gone=((STATE.meta||{}).deleted||{}).courses||{};
  const updated=[], added=[];
  list.forEach(p=>{
    if(!p || !p.id || p.rev==null) return;
    const c=cs.find(x=>x.id===p.id);
    if(c){ if((c.rev||0)<p.rev){ csRefresh(c, JSON.parse(JSON.stringify(p))); updated.push(c.name); } seen.add(p.id); }
    else if(p.auto && !seen.has(p.id) && !gone[p.id]){ cs.push(JSON.parse(JSON.stringify(p))); added.push(p.name); seen.add(p.id); }
  });
  STATE.coursePresetsSeen=[...seen];
  if(updated.length||added.length){
    saveState();
    if(typeof buildCourses==='function') buildCourses();
    if(typeof buildCourseStrategy==='function') buildCourseStrategy();
    if(typeof buildHome==='function') buildHome();
    if(typeof buildHoleOverlay==='function') buildHoleOverlay();
    if(typeof toast==='function') toast([added.length?`Added ${added.join(' and ')}`:'', updated.length?`Updated ${updated.join(' and ')} from the map`:''].filter(Boolean).join('. '));
  }
  return {updated, added};
}

Object.assign(window, { CS_GEOM, csHoleMap, csWalk, csRefresh, csPresetSync });
