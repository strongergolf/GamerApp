// features/courses.js — Course maps: data model, vector hole renderer, trace-on-image editor.
// Geometry in normalized field units (0–1000 x, 0–1400 y, portrait). Client-side, offline.
// renderHoleSVG() is reused by the Plan strategy overlays (step ③).

const CF_W = 1000, CF_H = 1400;
window.courseEdit = window.courseEdit || { cIdx: 0, hIdx: 0, mode: null, draft: [], calib: [] };

/* ---------- data helpers ---------- */
function cfCourses(){ return (STATE.courses = STATE.courses || []); }
function cfCur(){ const cs=cfCourses(); return cs[window.courseEdit.cIdx]||null; }
function cfHole(){ const c=cfCur(); if(!c) return null; return (c.holes||[])[window.courseEdit.hIdx]||null; }
function cfUID(){ return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* A course nobody has touched: still called "New Course", and not one hole carries a mark of
   any kind. That is exactly what cfAddCourse + cfAddHole produce and nothing else, so it is
   safe to prune — anything renamed, traced, calibrated or imported fails the test. */
function cfIsBlankCourse(c){
  if(!c || c.name!=='New Course') return false;
  return (c.holes||[]).every(h=> h && !h.tee && !h.pin && !h.bg && !h.scaleYpu && !h.geo
    && !(h.green||[]).length && !(h.fairway||[]).length && !(h.hazards||[]).length);
}
/* Drop untouched blanks on load. They accumulate a click at a time — every stray "+ Course"
   leaves one behind for ever — and a course picker with fifteen identical "New Course" rows
   in it is unusable. Never touches a course with any content. */
function cfPruneBlankCourses(cs){
  if(!Array.isArray(cs)) return cs;
  const kept=cs.filter(c=>!cfIsBlankCourse(c));
  return kept.length?kept:cs;      // never leave the user with nothing at all
}
function cfAddCourse(){
  const cs=cfCourses();
  /* Adding a second blank on top of an untouched one just makes the list longer — go to the
     one already sitting there instead. */
  const blank=cs.findIndex(cfIsBlankCourse);
  if(blank>=0){
    window.courseEdit.cIdx=blank; window.courseEdit.hIdx=0;
    cfResetDraft(); buildCourses(); toast('Blank course is already open'); return;
  }
  cs.push({id:cfUID(), name:'New Course', holes:[]});
  window.courseEdit.cIdx=cs.length-1; window.courseEdit.hIdx=0;
  cfAddHole(); saveState(); buildCourses(); buildCourseStrategy&&buildCourseStrategy();
}
function cfDeleteCourse(){
  const cs=cfCourses(); if(!cs.length) return;
  if(!confirm('Delete this course and all its holes?')) return;
  /* recorded, so the deletion reaches the player's other devices instead of coming back from them */
  const gone=cs[window.courseEdit.cIdx];
  if(gone && typeof sgForget==='function') sgForget('courses', gone.id||gone.name);
  cs.splice(window.courseEdit.cIdx,1);
  window.courseEdit.cIdx=Math.max(0,window.courseEdit.cIdx-1); window.courseEdit.hIdx=0;
  saveState(); buildCourses();
}
function cfSelectCourse(i){ window.courseEdit.cIdx=+i; window.courseEdit.hIdx=0; cfResetDraft(); buildCourses(); }
function cfRenameCourse(v){ const c=cfCur(); if(c){ c.name=v; saveState(); } }

function cfAddHole(){
  const c=cfCur(); if(!c) return; c.holes=c.holes||[];
  c.holes.push({num:c.holes.length+1, par:4, yards:400, scaleYpu:null, bg:null,
    tee:null, pin:null, green:[], fairway:[], hazards:[]});
  window.courseEdit.hIdx=c.holes.length-1; cfResetDraft();
  saveState(); buildCourses();
}
function cfSelectHole(i){ window.courseEdit.hIdx=+i; cfResetDraft(); buildCourses(); }
function cfSetHoleField(field,v){ const h=cfHole(); if(!h) return; h[field]=parseInt(v)||0;
  if(field==='par'||field==='yards') h.src=Object.assign({}, h.src, {[field]:'user'});
  saveState(); if(field==='yards') buildCourses(); }

/* ---------- editor interaction ---------- */
function cfResetDraft(){ window.courseEdit.mode=null; window.courseEdit.draft=[]; window.courseEdit.calib=[]; }
function cfSetMode(m){
  const e=window.courseEdit;
  e.mode = e.mode===m ? null : m;
  e.draft=[]; e.calib=[];
  cfRefreshCanvas();
}
function cfCanvasPt(evt){
  const svg=evt.currentTarget; const r=svg.getBoundingClientRect();
  const x=(evt.clientX-r.left)/r.width*CF_W, y=(evt.clientY-r.top)/r.height*CF_H;
  return {x:Math.round(Math.max(0,Math.min(CF_W,x))), y:Math.round(Math.max(0,Math.min(CF_H,y)))};
}
function cfCanvasClick(evt){
  const e=window.courseEdit, h=cfHole(); if(!h||!e.mode) return;
  const p=cfCanvasPt(evt);
  if(e.mode==='tee'){ h.tee=p; saveState(); buildCourses(); return; }
  if(e.mode==='pin'){ h.pin=p; saveState(); buildCourses(); return; }
  if(e.mode==='calibrate'){
    e.calib.push(p);
    if(e.calib.length===2){
      const d=Math.hypot(e.calib[1].x-e.calib[0].x, e.calib[1].y-e.calib[0].y);
      const yds=parseFloat(prompt('Real distance between the two points (yards):','')||'');
      if(yds>0 && d>0){ h.scaleYpu=yds/d; saveState(); }
      e.calib=[]; e.mode=null; buildCourses(); return;
    }
    cfRefreshCanvas(); return;
  }
  /* polygon modes: green / fairway / sand / water / oob */
  e.draft.push(p); cfRefreshCanvas();
}
function cfFinishFeature(){
  const e=window.courseEdit, h=cfHole(); if(!h||!e.mode||e.draft.length<2) { e.draft=[]; cfRefreshCanvas(); return; }
  if(e.mode==='green') h.green=e.draft.slice();
  else if(e.mode==='fairway') h.fairway=e.draft.slice();
  else if(['sand','water','oob','trees'].includes(e.mode)){ h.hazards=h.hazards||[]; h.hazards.push({type:e.mode, pts:e.draft.slice()}); }
  e.draft=[]; saveState(); buildCourses(); buildCourseStrategy&&buildCourseStrategy();
}
function cfUndoPoint(){ const e=window.courseEdit; e.draft.pop(); cfRefreshCanvas(); }
function cfClearFeature(){
  const e=window.courseEdit, h=cfHole(); if(!h) return;
  if(e.mode==='green') h.green=[];
  else if(e.mode==='fairway') h.fairway=[];
  else if(e.mode==='tee') h.tee=null;
  else if(e.mode==='pin') h.pin=null;
  else if(['sand','water','oob','trees'].includes(e.mode)) h.hazards=(h.hazards||[]).filter(z=>z.type!==e.mode);
  e.draft=[]; saveState(); buildCourses();
}
function cfLoadBg(input){
  const file=input.files&&input.files[0]; const h=cfHole(); if(!file||!h) return;
  const rd=new FileReader();
  rd.onload=ev=>{ const img=new Image(); img.onload=()=>{
    const max=900; let w=img.width,h2=img.height; const s=Math.min(1,max/Math.max(w,h2));
    w=Math.round(w*s); h2=Math.round(h2*s);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h2;
    cv.getContext('2d').drawImage(img,0,0,w,h2);
    try{ h.bg=cv.toDataURL('image/jpeg',0.72); }catch(_){ h.bg=ev.target.result; }
    saveState(); buildCourses();
  }; img.src=ev.target.result; };
  rd.readAsDataURL(file);
}
function cfClearBg(){ const h=cfHole(); if(h){ h.bg=null; saveState(); buildCourses(); } }

/* ---------- vector renderer (reused by overlays) ---------- */
function cfPoly(pts,fill,stroke,op){ if(!pts||pts.length<2) return '';
  return `<polygon points="${pts.map(p=>p.x+','+p.y).join(' ')}" fill="${fill}" stroke="${stroke||'none'}" stroke-width="3" opacity="${op==null?1:op}"/>`; }
function renderHoleSVG(hole, opts){
  opts=opts||{}; const interactive=!!opts.interactive, e=window.courseEdit;
  if(!hole) return `<svg viewBox="0 0 ${CF_W} ${CF_H}" style="width:100%;display:block"><rect width="${CF_W}" height="${CF_H}" fill="var(--bg2)"/></svg>`;
  const hz={sand:'#d9c98a', water:'#3a78c0', oob:'#b85c5c', trees:'#1e5c2f'};
  const bg = hole.bg ? `<image href="${hole.bg}" x="0" y="0" width="${CF_W}" height="${CF_H}" preserveAspectRatio="xMidYMid slice" opacity="${interactive?0.85:0.55}"/>` : '';
  /* With an aerial photo under the hole (features/imagery.js) the photo IS the picture: the
     mapped shapes become thin outlines over it, trees are left to the photo, and nothing the
     model reads changes — lies, distances and strokes gained still come from these shapes. */
  const photo = typeof imgOn==='function' && imgOn(hole);
  const vbIn = opts.viewBox||{x:0,y:0,w:CF_W,h:CF_H};
  const tiles = photo ? imgTilesSVG(hole, vbIn, opts.pxW) : '';
  const line=(pts,col,op,dash)=>(!pts||pts.length<2)?'':`<polygon points="${pts.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity="${op}"${dash?' stroke-dasharray="6,5"':''}/>`;
  const fairway = photo
    ? line(hole.fairway,'#ffffff',0.35) + (hole.fairways||[]).map(f=>line(f,'#ffffff',0.35)).join('')
    : cfPoly(hole.fairway,'#3fa45a','#2e7d44',0.85) + (hole.fairways||[]).map(f=>cfPoly(f,'#3fa45a','#2e7d44',0.85)).join('');
  /* the course's other teeing grounds, as outlines: the filled one is the tee in use */
  const boxes = (hole.teeBoxes||[]).filter(b=>!hole.tee||Math.hypot(b.x-hole.tee.x,b.y-hole.tee.y)>6)
    .map(b=>`<rect x="${b.x-7}" y="${b.y-7}" width="14" height="14" rx="3" fill="none" stroke="#fff" stroke-width="2" opacity="0.6"/>`).join('');
  const green = photo ? line(hole.green,'#ffffff',0.6) : cfPoly(hole.green,'#5ec77a','#2e7d44',0.95);
  const hzLine={sand:'#f6e7a8', water:'#8cc4ff', oob:'#ff8a8a'};
  const hazards = photo
    ? (hole.hazards||[]).filter(z=>z.type!=='trees').map(z=>line(z.pts,hzLine[z.type]||'#fff',0.7,z.type==='oob')).join('')
    : (hole.hazards||[]).map(z=>cfPoly(z.pts,hz[z.type]||'#999',null,z.type==='oob'?0.5:0.85)).join('');
  const tee = hole.tee?`<rect x="${hole.tee.x-10}" y="${hole.tee.y-10}" width="20" height="20" rx="4" fill="#222" stroke="#fff" stroke-width="2"/>`:'';
  const _pin = (typeof cfPin==='function'?cfPin(hole):null)||hole.pin;   // today's cut, not the map anchor
  const pin = _pin?`<line x1="${_pin.x}" y1="${_pin.y}" x2="${_pin.x}" y2="${_pin.y-46}" stroke="#fff" stroke-width="2.5"/><polygon points="${_pin.x},${_pin.y-46} ${_pin.x+26},${_pin.y-38} ${_pin.x},${_pin.y-30}" fill="#d33"/><circle cx="${_pin.x}" cy="${_pin.y}" r="6" fill="#fff" stroke="#333"/>`:'';
  const centerline = (hole.tee&&_pin)?`<line x1="${hole.tee.x}" y1="${hole.tee.y}" x2="${_pin.x}" y2="${_pin.y}" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-dasharray="10,8"/>`:'';
  let draftSVG='';
  if(interactive && e.draft && e.draft.length){
    draftSVG=`<polyline points="${e.draft.map(p=>p.x+','+p.y).join(' ')}" fill="rgba(255,255,255,0.15)" stroke="var(--gold)" stroke-width="3"/>`+
      e.draft.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="6" fill="var(--gold)"/>`).join('');
  }
  if(interactive && e.calib && e.calib.length){
    draftSVG+=e.calib.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="7" fill="var(--sky)" stroke="#fff" stroke-width="2"/>`).join('');
  }
  const click=interactive?'onclick="cfCanvasClick(event)" style="width:100%;display:block;cursor:crosshair;touch-action:none;border-radius:10px"':'style="width:100%;display:block;border-radius:10px"';
  /* opts.viewBox lets a caller zoom/pan the same geometry (the strategy overlay does).
     The turf rect is oversized so panning never exposes the page behind it. */
  const vb=opts.viewBox||{x:0,y:0,w:CF_W,h:CF_H};
  return `<svg viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" ${click} xmlns="http://www.w3.org/2000/svg">
    <rect x="${-CF_W}" y="${-CF_H}" width="${CF_W*3}" height="${CF_H*3}" fill="#2f7a3f"/>${tiles}${bg}
    ${fairway}${green}${hazards}${boxes}${centerline}${(opts.overlay||'')}${tee}${pin}${draftSVG}
  </svg>`;
}

/* ============================================================
   GEOMETRY, SCALE & LIE QUERIES
   The queryable layer under the strategy overlays and the expected-strokes /
   aim-point work. Hole geometry is stored in field units (the 1000x1400 portrait
   canvas); everything here converts that to real yards, real lat/lon, and a lie.

   Two independent routes to real-world scale:
     - an OSM-imported hole carries a full georeference (hole.geo) written by
       osmBuildHole, so field <-> lat/lon is exact;
     - a hand-traced hole carries hole.scaleYpu from the calibrate tool, or the
       scale can be inferred from tee->pin against the known hole yardage.
   ============================================================ */
const CF_YD_PER_M = 1.09361, CF_DEG = Math.PI/180, CF_EARTH_R = 6378137;

/* Yards per field unit. null when the hole has no usable scale yet. */
function cfYardsPerUnit(hole){
  if(!hole) return null;
  if(hole.geo && hole.geo.s>0) return CF_YD_PER_M/hole.geo.s;      // metres-based, exact
  if(hole.scaleYpu>0) return +hole.scaleYpu;                        // calibrate tool
  if(hole.tee && hole.pin && hole.yards>0){                         // infer from known yardage
    const d=Math.hypot(hole.pin.x-hole.tee.x, hole.pin.y-hole.tee.y);
    if(d>0) return hole.yards/d;
  }
  return null;
}
function cfHasScale(hole){ return cfYardsPerUnit(hole)!=null; }
/* Straight-line distance in yards between two field points (null without a scale). */
function cfDistYd(hole,a,b){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!a||!b) return null;
  return Math.hypot(b.x-a.x, b.y-a.y)*ypu;
}
/* ---------- WHERE THE HOLE IS CUT TODAY ----------
   `hole.pin` is the MAPPED pin — the anchor OSM or the tracing tool put roughly at the middle
   of the green. It is also the far end of the tee→pin line that infers the hole's scale, so
   it must never move: shifting it would silently rescale the whole hole.

   The pin a shot is actually played TO is a different thing, and it changes daily. It
   resolves, in order:
       the active pin sheet's position for this hole   (a real cut, typed off a pin sheet)
       the middle of the green                          (the honest default)
       the mapped pin                                   (a hole with no green traced)

   Pin sheets are grouped per course and named, because that is how they arrive — one sheet
   per round, often days ahead of a tournament, which is exactly when the preparation this
   feeds is worth doing.

   Cached in a WeakMap because cfDistToPinYd runs inside the optimiser's 49-sample loop and
   this would otherwise re-resolve a few thousand times per aim candidate. */
let CF_PIN_CACHE = new WeakMap();
function cfPinCacheClear(){ CF_PIN_CACHE = new WeakMap(); }
function cfGreenMid(hole){
  const g=hole&&hole.green;
  if(!g||g.length<3) return null;
  let x=0,y=0; g.forEach(p=>{x+=p.x;y+=p.y;});
  return {x:x/g.length, y:y/g.length};
}
function cfPinSheets(courseId){
  STATE.play=STATE.play||{}; STATE.play.pinSheets=STATE.play.pinSheets||{};
  return (STATE.play.pinSheets[courseId] = STATE.play.pinSheets[courseId] || {active:null, sheets:[]});
}
function cfActiveSheet(courseId){
  const ps=cfPinSheets(courseId);
  return ps.active ? (ps.sheets||[]).find(s=>s.id===ps.active)||null : null;
}
/* Which course does this hole belong to? Only called on a cache miss. */
function cfCourseOf(hole){
  const cs=STATE.courses||[];
  for(let i=0;i<cs.length;i++) if((cs[i].holes||[]).indexOf(hole)>=0) return cs[i];
  return null;
}
function cfPin(hole){
  if(!hole) return null;
  if(CF_PIN_CACHE.has(hole)) return CF_PIN_CACHE.get(hole);
  let p=null;
  const c=cfCourseOf(hole);
  if(c){
    const sheet=cfActiveSheet(c.id||c.name);
    const cut=sheet && sheet.pins && sheet.pins[String(hole.num||0)];
    if(cut && cut.x!=null) p={x:cut.x, y:cut.y};
  }
  if(!p) p=cfGreenMid(hole)||hole.pin||null;
  CF_PIN_CACHE.set(hole,p);
  return p;
}
/* Distances are measured to the pin that is actually cut, not the mapping anchor. */
function cfDistToPinYd(hole,pt){ const p=cfPin(hole); return p?cfDistYd(hole,pt,p):null; }

/* ---------- THE GREEN IN PIN-SHEET TERMS ----------
   A pin sheet does not give coordinates, it gives paces: "8 on, 5 from the left". So the
   green needs a front/back/left/right frame to translate into, oriented along the line you
   play INTO it — tee → green centre. That is the orientation pin sheets are printed in, and
   it is stable, which matters more here than being exactly the approach angle on a dogleg. */
function cfGreenFrame(hole){
  const ypu=cfYardsPerUnit(hole), mid=cfGreenMid(hole);
  if(ypu==null||!mid||!hole.tee||!(hole.green||[]).length) return null;
  const dx=mid.x-hole.tee.x, dy=mid.y-hole.tee.y, L=Math.hypot(dx,dy)||1;
  const f={vx:dx/L, vy:dy/L, ux:-dy/L, uy:dx/L};
  let dMin=Infinity,dMax=-Infinity,tMin=Infinity,tMax=-Infinity;
  hole.green.forEach(p=>{
    const ax=(p.x-mid.x)*ypu, ay=(p.y-mid.y)*ypu;
    const d=ax*f.vx+ay*f.vy, t=ax*f.ux+ay*f.uy;
    if(d<dMin)dMin=d; if(d>dMax)dMax=d; if(t<tMin)tMin=t; if(t>tMax)tMax=t;
  });
  return {mid, f, ypu, dMin, dMax, tMin, tMax, depth:dMax-dMin, width:tMax-tMin};
}
/* The green's extent across ONE axis at a given position on the other — a true cross-section
   of the polygon, not its bounding box. A sheet saying "5 on, 3 from the left" means five
   paces past the front edge WHERE THE PIN IS, and three in from the left edge AT THAT DEPTH.
   On a rounded green the bounding-box corner is off the putting surface entirely, which is
   how the first version of this put a front-left pin in the rough. */
function cfGreenCross(hole, fr, axis, at){
  const P=hole.green.map(p=>{ const ax=(p.x-fr.mid.x)*fr.ypu, ay=(p.y-fr.mid.y)*fr.ypu;
    return { d:ax*fr.f.vx+ay*fr.f.vy, t:ax*fr.f.ux+ay*fr.f.uy }; });
  const A=axis==='t'?'t':'d', B=axis==='t'?'d':'t';       // slice along A, measure B
  const xs=[];
  for(let i=0;i<P.length;i++){
    const a=P[i], b=P[(i+1)%P.length];
    if((a[A]-at)*(b[A]-at)>0) continue;
    const den=b[A]-a[A];
    xs.push(Math.abs(den)<1e-9 ? a[B] : a[B]+(b[B]-a[B])*((at-a[A])/den));
  }
  if(xs.length<2) return null;
  return { lo:Math.min.apply(null,xs), hi:Math.max.apply(null,xs) };
}
/* Where today's pin sits, as a pin sheet would state it (yards). */
function cfPinPaces(hole, pt){
  const fr=cfGreenFrame(hole), p=pt||cfPin(hole);
  if(!fr||!p) return null;
  const ax=(p.x-fr.mid.x)*fr.ypu, ay=(p.y-fr.mid.y)*fr.ypu;
  const d=ax*fr.f.vx+ay*fr.f.vy, t=ax*fr.f.ux+ay*fr.f.uy;
  /* depth measured at the pin's own lateral line, width at the pin's own depth */
  const dc=cfGreenCross(hole,fr,'t',t) || {lo:fr.dMin, hi:fr.dMax};
  const tc=cfGreenCross(hole,fr,'d',d) || {lo:fr.tMin, hi:fr.tMax};
  return { fromFront:d-dc.lo, fromBack:dc.hi-d, fromLeft:t-tc.lo, fromRight:tc.hi-t,
           depth:dc.hi-dc.lo, width:tc.hi-tc.lo,
           maxDepth:fr.depth, maxWidth:fr.width,
           onGreen:cfPointInPoly(p,hole.green) };
}
/* The inverse — type the sheet's two numbers, get the point.
   The two axes are coupled (how far "from the left" you are changes where the front edge is,
   and vice versa), so this settles them together rather than solving once. Four passes is
   plenty; greens are convex enough that it converges immediately. */
/* ---------- A GREEN, DRAWN THE WAY A PIN SHEET DRAWS IT ----------
   Sheets orient every green the same way: approach from the bottom, front edge nearest you.
   That is what makes eighteen of them scannable at once — the eye learns one orientation and
   reads position, not shape. So the polygon is projected into the green's own frame and
   redrawn upright, rather than shown at whatever angle the hole happens to run on the map. */
function cfGreenThumb(hole, W, H, opts){
  opts=opts||{};
  const fr=cfGreenFrame(hole); if(!fr) return '';
  const pad=7, cd=(fr.dMin+fr.dMax)/2, ct=(fr.tMin+fr.tMax)/2;
  const s=Math.min((W-2*pad)/Math.max(1,fr.width), (H-2*pad)/Math.max(1,fr.depth));
  const X=t=>W/2+(t-ct)*s, Y=d=>H/2-(d-cd)*s;          // d increases UP: front at the bottom
  const proj=p=>{ const ax=(p.x-fr.mid.x)*fr.ypu, ay=(p.y-fr.mid.y)*fr.ypu;
    return { d:ax*fr.f.vx+ay*fr.f.vy, t:ax*fr.f.ux+ay*fr.f.uy }; };
  const poly=hole.green.map(p=>{const q=proj(p); return X(q.t).toFixed(1)+','+Y(q.d).toFixed(1);}).join(' ');
  const pin=cfPin(hole), pq=pin?proj(pin):null;
  /* bunkers touching the green give the eye something to place the cut against */
  const hz=(hole.hazards||[]).filter(z=>z.type==='sand').map(z=>{
    const pts=z.pts.map(p=>{const q=proj(p); return X(q.t).toFixed(1)+','+Y(q.d).toFixed(1);}).join(' ');
    return `<polygon points="${pts}" fill="#d9c98a" fill-opacity="0.5"/>`; }).join('');
  const cut=!!opts.cut;
  return `<svg viewBox="0 0 ${W} ${H}" class="pg-svg" data-hole="${hole.num||0}" style="width:100%;display:block"
      ${opts.click?`onclick="stratPinThumbClick(event,${hole.num||0})"`:''}>
    <rect width="${W}" height="${H}" fill="var(--bg2)" rx="6"/>
    ${hz}
    <polygon points="${poly}" fill="#5ec77a" fill-opacity="0.55" stroke="#2e7d44" stroke-width="1.4"/>
    <line x1="${pad}" y1="${H-3}" x2="${W-pad}" y2="${H-3}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3,3" opacity="0.7"/>
    ${pq?`<circle cx="${X(pq.t).toFixed(1)}" cy="${Y(pq.d).toFixed(1)}" r="${cut?4.2:3.4}"
       fill="${cut?'#d33':'var(--muted)'}" stroke="#fff" stroke-width="1.4"/>`:''}
  </svg>`;
}
/* Inverse of the thumb projection: where on the green did that click land? */
function cfGreenThumbPoint(hole, W, H, px, py){
  const fr=cfGreenFrame(hole); if(!fr) return null;
  const pad=7, cd=(fr.dMin+fr.dMax)/2, ct=(fr.tMin+fr.tMax)/2;
  const s=Math.min((W-2*pad)/Math.max(1,fr.width), (H-2*pad)/Math.max(1,fr.depth));
  const t=ct+(px-W/2)/s, d=cd-(py-H/2)/s;
  return { x: Math.round(fr.mid.x+(fr.f.vx*d+fr.f.ux*t)/fr.ypu),
           y: Math.round(fr.mid.y+(fr.f.vy*d+fr.f.uy*t)/fr.ypu) };
}

const CF_PIN_INSET = 0.5;      // yards kept inside the edge — no pin is ever cut ON the line
function cfPinFromPaces(hole, fromFront, fromLeft){
  const fr=cfGreenFrame(hole); if(!fr) return null;
  /* Clamp to the green's overall size FIRST. Without this a wild entry drives the iteration
     into a corner where the cross-section is a point, and it settles somewhere meaningless
     rather than at the edge the golfer asked for. */
  const front=Math.max(0, Math.min(fr.depth, +fromFront||0));
  const left =Math.max(0, Math.min(fr.width, +fromLeft ||0));
  /* Never sit exactly on the boundary: the clamp would otherwise put a "26 on" pin on a
     25.8-deep green precisely on the edge, where a point-in-polygon test is a coin flip and
     the panel would tell the golfer their own pin sheet is off the green. */
  const fit=(lo,hi,want)=>{ const span=hi-lo, in_=Math.min(CF_PIN_INSET, span/4);
    return lo+Math.max(in_, Math.min(span-in_, want)); };
  let t=fit(fr.tMin, fr.tMax, left), d=fit(fr.dMin, fr.dMax, front);
  for(let i=0;i<4;i++){
    const dc=cfGreenCross(hole,fr,'t',t); if(dc&&dc.hi-dc.lo>1) d=fit(dc.lo,dc.hi,front);
    const tc=cfGreenCross(hole,fr,'d',d); if(tc&&tc.hi-tc.lo>1) t=fit(tc.lo,tc.hi,left);
  }
  return { x: Math.round(fr.mid.x + (fr.f.vx*d + fr.f.ux*t)/fr.ypu),
           y: Math.round(fr.mid.y + (fr.f.vy*d + fr.f.uy*t)/fr.ypu) };
}
/* ---- sheet management ---- */
function cfSheetAdd(courseId, name){
  const ps=cfPinSheets(courseId);
  const s={ id:'ps'+Date.now().toString(36), name:name||('Sheet '+((ps.sheets||[]).length+1)), pins:{} };
  ps.sheets.push(s); ps.active=s.id; cfPinCacheClear(); saveState(); return s;
}
function cfSheetSelect(courseId, id){
  const ps=cfPinSheets(courseId); ps.active = id||null; cfPinCacheClear(); saveState();
}
function cfSheetDelete(courseId, id){
  const ps=cfPinSheets(courseId);
  ps.sheets=(ps.sheets||[]).filter(s=>s.id!==id);
  if(ps.active===id) ps.active=null;
  cfPinCacheClear(); saveState();
}
function cfSheetRename(courseId, id, name){
  const s=(cfPinSheets(courseId).sheets||[]).find(x=>x.id===id);
  if(s){ s.name=name; saveState(); }
}
/* Set (or clear) this hole's cut on the active sheet. Creates a sheet if none is active,
   because the first thing a golfer does is place a pin, not name a document. */
function cfSetPin(courseId, holeNum, pt){
  const ps=cfPinSheets(courseId);
  let s=cfActiveSheet(courseId);
  if(!s) s=cfSheetAdd(courseId, 'Pin sheet 1');
  s.pins=s.pins||{};
  if(pt) s.pins[String(holeNum)]={x:pt.x, y:pt.y};
  else delete s.pins[String(holeNum)];
  cfPinCacheClear(); saveState();
}
function cfDistFromTeeYd(hole,pt){ return (hole&&hole.tee)?cfDistYd(hole,hole.tee,pt):null; }

/* ---- Georeference: field <-> lat/lon (OSM-imported holes only) ----
   hole.geo maps field space to metres in the hole's own frame:
     x = ox + s*u,  y = oy - s*v      (u = lateral, v = along-play from the tee)
   then (u,v) rotates back to the projection's metre grid via the orthonormal basis. */
function cfFieldToLatLon(hole,pt){
  const g=hole&&hole.geo; if(!g||!pt) return null;
  const u=(pt.x-g.ox)/g.s, v=(g.oy-pt.y)/g.s;
  const mx=g.tx+u*g.ux+v*g.vx, my=g.ty+u*g.uy+v*g.vy;
  return { lat:g.lat0+my/(CF_DEG*CF_EARTH_R),
           lon:g.lon0+mx/(CF_DEG*CF_EARTH_R*Math.cos(g.lat0*CF_DEG)) };
}
function cfLatLonToField(hole,lat,lon){
  const g=hole&&hole.geo; if(!g) return null;
  const mx=(lon-g.lon0)*CF_DEG*CF_EARTH_R*Math.cos(g.lat0*CF_DEG);
  const my=(lat-g.lat0)*CF_DEG*CF_EARTH_R;
  const dx=mx-g.tx, dy=my-g.ty;
  return { x:g.ox+g.s*(dx*g.ux+dy*g.uy), y:g.oy-g.s*(dx*g.vx+dy*g.vy) };
}

/* ---- polygon primitives (field units) ---- */
function cfPointInPoly(pt,poly){
  if(!pt||!poly||poly.length<3) return false;
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    if(((yi>pt.y)!==(yj>pt.y)) && (pt.x < (xj-xi)*(pt.y-yi)/((yj-yi)||1e-9)+xi)) inside=!inside;
  }
  return inside;
}
function cfDistPtSeg(p,a,b){
  const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy;
  if(!L2) return Math.hypot(p.x-a.x,p.y-a.y);
  let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/L2; t=Math.max(0,Math.min(1,t));
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}
/* 0 when inside the polygon, else the distance to its nearest edge (field units). */
function cfDistToPoly(pt,poly){
  if(!poly||poly.length<2) return Infinity;
  if(cfPointInPoly(pt,poly)) return 0;
  let best=Infinity;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) best=Math.min(best,cfDistPtSeg(pt,poly[j],poly[i]));
  return best;
}

/* ---- RUNWAY — yards of green between where a greenside shot lands and the hole ----
   Short-siding is only expensive when there is no green to work with. A "short side" with
   plenty of runway, or an easy angle, is not a penalty at all — penalising the SIDE would
   invent a false penalty in exactly those cases. So measure the thing that actually costs
   strokes: cast the line from the ball to the pin and measure how much green sits between
   where that line crosses the edge and the hole. */
function cfSegHit(a,b,c,d){                 // segment ab × segment cd → hit point (with t) or null
  const rx=b.x-a.x, ry=b.y-a.y, sx=d.x-c.x, sy=d.y-c.y;
  const den=rx*sy-ry*sx; if(Math.abs(den)<1e-12) return null;
  const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den, u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;
  if(t<0||t>1||u<0||u>1) return null;
  return {x:a.x+t*rx, y:a.y+t*ry, t};
}
function cfSegPolyFirstHit(from,to,poly){
  if(!poly||poly.length<3) return null;
  let best=null;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const h=cfSegHit(from,to,poly[j],poly[i]);
    if(h&&(!best||h.t<best.t)) best=h;
  }
  return best;
}
/* ---------- COVER NUMBERS: what it takes to fly a hazard ----------
   A golfer standing over a shot with a bunker fronting the green does not want to know the
   yardage to the pin — they want the COVER NUMBER: how far they must CARRY for that hazard
   to stop existing. It is the distance to the FAR edge of the hazard along the line of play,
   which is a different question from the distance to its near edge (where trouble starts)
   and from the yardage to the flag.

   Both edges are worth having: the near one says where the hazard begins, the far one says
   what clears it, and the gap between them is how much room there is to be short and still
   be fine. Returned in yards from `from`, or null when the line simply misses the hazard. */
function cfSegPolyAllHits(from,to,poly){
  if(!poly||poly.length<3) return [];
  const hits=[];
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const h=cfSegHit(from,to,poly[j],poly[i]);
    if(h) hits.push(h);
  }
  return hits.sort((a,b)=>a.t-b.t);
}
function cfHazardSpan(hole, from, to, hz){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!from||!to||!hz||!(hz.pts||[]).length) return null;
  const L=Math.hypot(to.x-from.x, to.y-from.y); if(L<1e-6) return null;
  const hits=cfSegPolyAllHits(from,to,hz.pts);
  const inside=cfPointInPoly(from,hz.pts);
  if(!hits.length) return inside?{near:0, far:L*ypu, inside:true, type:hz.type}:null;
  const near = inside ? 0 : hits[0].t*L*ypu;
  const far  = hits[hits.length-1].t*L*ypu;
  /* a line that enters but never leaves within the segment: the far edge is past the target */
  return { near, far, inside, type:hz.type, openEnded:(hits.length%2===1 && !inside) };
}
/* Every hazard the line of play crosses, nearest first. `to` defaults to the cut. */
const CF_COVER_TYPES = { water:'penalty area', sand:'bunker', oob:'out of bounds' };
function cfCoverNumbers(hole, from, to){
  const target=to||cfPin(hole);
  if(!hole||!from||!target) return [];
  const out=[];
  (hole.hazards||[]).forEach(hz=>{
    if(!CF_COVER_TYPES[hz.type]) return;             // trees are a line-of-sight question, not a carry
    const sp=cfHazardSpan(hole, from, target, hz);
    if(!sp) return;
    out.push({ type:hz.type, label:CF_COVER_TYPES[hz.type],
               starts:sp.near, cover:sp.far, width:sp.far-sp.near,
               inside:sp.inside, openEnded:!!sp.openEnded });
  });
  return out.sort((a,b)=>a.starts-b.starts);
}
/* Runway in yards. null when already on the green, or the hole has no green mapped. */
function cfRunwayYd(hole,pt){
  const _p=cfPin(hole);
  if(!hole||!_p||!(hole.green||[]).length||!pt) return null;
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return null;
  if(cfPointInPoly(pt,hole.green)) return null;
  const e=cfSegPolyFirstHit(pt,_p,hole.green);
  if(!e) return 0;                                   // line never reaches green → nothing to work with
  return Math.hypot(_p.x-e.x, _p.y-e.y)*ypu;
}
/* Difficulty of a greenside recovery RELATIVE to the baseline, from runway alone. The SR
   tables already encode an average up-and-down for the distance; runway only says whether
   this particular one is better or worse than that average. Typical runway ≈ 65% of the
   distance to the pin (the ball usually sits about a third of the way out in fringe/rough).

   Deliberately small and tightly clamped (−0.06 … +0.15 strokes): runway is itself a proxy
   for slope, firmness and grain that this app does not map, so over-weighting it would just
   trade one inaccuracy for another. Applies only to shots inside CF_RUNWAY_MAX that are off
   the green. PRESUMED — replace with measured up-and-down data when it exists. */
const CF_RUNWAY_MAX = 40, CF_RUNWAY_TYP = 0.65, CF_RUNWAY_K = 0.25;
/* Yards a punch-out from the trees typically advances the ball — sideways to very slight
   progress. PRESUMED; the whole recovery model hangs off this one number. */
const CF_RECOVERY_ADV = 25;
function cfRunwayAdj(hole,pt,distYd){
  if(distYd==null||distYd>CF_RUNWAY_MAX) return 0;
  const run=cfRunwayYd(hole,pt); if(run==null) return 0;
  const ratio=run/Math.max(2, CF_RUNWAY_TYP*distYd);
  return Math.max(-0.06, Math.min(0.15, CF_RUNWAY_K*(1-ratio)));
}

/* ---- Lie classification ----
   Priority matters: hazards are traced ON TOP of the surface they sit in (a bunker
   inside a fairway), and the green polygon overlaps the fairway at the fringe. So
   penalty areas beat bunkers beat green beats fairway; anything outside every mapped
   surface is rough. */
/* Overlapping polygons resolve WORST-FIRST, which is also the order a golfer avoids them:
   out of bounds, penalty area, trees, bunker, then the surfaces. */
const CF_LIE_ORDER=['oob','water','trees','sand'];
function cfLieAt(hole,pt){
  if(!hole||!pt) return 'rough';
  const hz=hole.hazards||[];
  for(let k=0;k<CF_LIE_ORDER.length;k++){
    const want=CF_LIE_ORDER[k];
    for(let i=0;i<hz.length;i++) if(hz[i].type===want && cfPointInPoly(pt,hz[i].pts)) return want;
  }
  if(cfPointInPoly(pt,hole.green)) return 'green';
  if(cfPointInPoly(pt,hole.fairway) || (hole.fairways||[]).some(f=>cfPointInPoly(pt,f))) return 'fairway';
  return 'rough';
}
/* The lie a SHOT is played from, which is not always the lie the map reports. Teeing grounds
   are not traced as a surface — OSM has them, but only the tee MARKER is kept — so a ball on
   the tee falls outside every mapped polygon and cfLieAt calls it rough. Left alone that
   charged six yards of effective distance and a 1.20x/1.35x dispersion penalty to every tee
   shot on every hole, which is why "driver as often as possible" came out shorter than a
   driver. Ask this, not cfLieAt, whenever the question is "what is the ball sitting on". */
const CF_TEE_TOL = 3;   // field units — stratBallFor hands back hole.tee verbatim
function cfShotLie(hole,pt){
  if(hole&&hole.tee&&pt&&Math.abs(pt.x-hole.tee.x)<CF_TEE_TOL&&Math.abs(pt.y-hole.tee.y)<CF_TEE_TOL){
    const l=cfLieAt(hole,pt);
    return (l==='fairway'||l==='green')?l:'fairway';   // a tee plays at least as well as fairway
  }
  return cfLieAt(hole,pt);
}
/* ---------- WHERE IT LANDED vs WHERE IT STOPPED ----------
   A ball that comes to rest past a front bunker is only safe if it FLEW the bunker. The model
   classified every shot by its finish, so a sample that pitched in the sand and would have
   stayed there was scored as though it had bounced through onto the green — which is exactly
   backwards on the holes where carry matters most.

   So a penalty area or a bunker under the LANDING point wins over the finish: you do not roll
   out of water, and you do not roll out of a greenside bunker through its lip. Everything
   else is still decided by where the ball stops, which is correct — a ball that pitches on
   the green and releases into a back bunker really is in that bunker. */
function cfCarryLie(hole, landing, finish){
  if(landing){
    const l=cfLieAt(hole, landing);
    if(l==='water'||l==='oob'||l==='sand') return l;
  }
  return cfShotLie(hole, finish);
}
/* Mapped lie -> the strokes-gained baseline lie used by srForPlayer(). */
function cfSgLie(lie){ return lie==='green'?'green' : lie==='fairway'?'fairway' : lie==='sand'?'sand' : 'rough'; }
function cfIsPenalty(lie){ return lie==='water'||lie==='oob'; }
function cfIsRecovery(lie){ return lie==='trees'; }
const CF_LIE_LABEL={green:'Green',fairway:'Fairway',sand:'Bunker',trees:'Trees',water:'Penalty area',oob:'Out of bounds',rough:'Rough'};

/* Nearest distance in yards to a hazard (optionally of one type); 0 when inside one. */
function cfDistToHazardYd(hole,pt,type){
  const ypu=cfYardsPerUnit(hole); if(ypu==null||!hole) return null;
  let best=Infinity;
  (hole.hazards||[]).forEach(z=>{ if(!type||z.type===type) best=Math.min(best,cfDistToPoly(pt,z.pts)); });
  return isFinite(best)?best*ypu:null;
}
/* Resolve a handicap for the SG baselines: explicit arg, else the golfer profile.
   PLAYER passes through untouched — it is resolved per position, by shot type, inside
   cfExpectedStrokes (see playerHcpFor in physics/sg.js). */
function cfHcp(hcp){
  if(hcp===PLAYER) return PLAYER;
  const raw=(hcp!=null&&hcp!=='')?hcp:((STATE.profile&&STATE.profile.handicap)||0);
  return (typeof parseHcp==='function')?parseHcp(raw):(parseFloat(raw)||0);
}
/* Expected strokes to hole out from a field point — the value the aim-point optimiser
   minimises. Green distances convert to FEET (the SR green table is in feet).
   NOTE: penalty areas are approximated as one stroke plus a rough-lie recovery at the
   same distance. Real relief (stroke-and-distance vs lateral drop) is a refinement. */
function cfExpectedStrokes(hole,pt,hcp,lieOverride){
  if(typeof srForPlayer!=='function') return null;
  const d=cfDistToPinYd(hole,pt); if(d==null) return null;
  /* lieOverride lets a caller price a sample by where it PITCHED rather than where it
     stopped (see cfCarryLie). Without it the lie mix could report water while the strokes
     were still being taken off the green the ball never legally reached. */
  const lie=lieOverride||cfLieAt(hole,pt);
  /* The golfer's skill for the shot this position leaves: putting on the green, otherwise
     around-the-green blending into approach by distance. A number passed in (a benchmark)
     is used as given, at every position. */
  const hRaw=cfHcp(hcp);
  const h=(hRaw===PLAYER) ? playerHcpFor(lie==='green'?'green':'off', d) : hRaw;
  /* Worst lies, worst first. The optimiser minimises expected strokes, so getting these
     magnitudes right IS the avoidance priority — no separate rule needed:
       OUT OF BOUNDS  stroke AND distance: you replay the shot, so two strokes on top of a
                      rough recovery — strictly worse than a drop.
       PENALTY AREA   one stroke, then play on from a lateral drop: no progress made.
       TREES          RECOVERY. On average you spend a shot getting sideways back into play
                      with only slight advancement (CF_RECOVERY_ADV). A real player may take
                      on a gap; the average outcome is a punch-out, which is what a model
                      should assume. */
  if(lie==='oob')   { const sr=srForPlayer('rough',Math.max(15,d),h); return sr==null?null:2+sr; }
  if(lie==='water') { const sr=srForPlayer('rough',Math.max(15,d),h); return sr==null?null:1+sr; }
  if(lie==='trees') { const sr=srForPlayer('rough',Math.max(15,d-CF_RECOVERY_ADV),h); return sr==null?null:1+sr; }
  const sgLie=cfSgLie(lie);
  const base=srForPlayer(sgLie, sgLie==='green'?Math.max(1,d*3):Math.max(1,d), h);
  if(base==null) return null;
  /* off-green greenside shots get the runway adjustment; putts and long shots do not */
  return (lie==='green')?base:base+cfRunwayAdj(hole,pt,d);
}
/* One call for everything the strategy UI wants about a spot on the hole. */
function cfShotContext(hole,pt,hcp){
  const lie=cfLieAt(hole,pt);
  return { lie, label:CF_LIE_LABEL[lie]||lie, penalty:cfIsPenalty(lie),
    toPin:cfDistToPinYd(hole,pt), fromTee:cfDistFromTeeYd(hole,pt),
    toSand:cfDistToHazardYd(hole,pt,'sand'), toWater:cfDistToHazardYd(hole,pt,'water'),
    expected:cfExpectedStrokes(hole,pt,hcp) };
}

/* ---------- editor page ---------- */
function buildCourses(){
  const wrap=document.getElementById('course-editor-wrap'); if(!wrap) return;
  const cs=cfCourses(), c=cfCur(), h=cfHole(), e=window.courseEdit;
  if(!cs.length){
    wrap.innerHTML=`
      <div class="section-label" style="margin-top:0">Course Editor <span class="proto-badge">prototype</span></div>
      ${cfImportBox()}
      <p class="intro-note" style="margin-top:14px">…or build a course by hand (trace over a satellite screenshot):</p>
      <button class="btn" onclick="cfAddCourse()">+ Blank course (manual)</button>`;
    return;
  }
  const courseOpts=cs.map((x,i)=>`<option value="${i}"${i===e.cIdx?' selected':''}>${escapeHtml(x.name||'Course')}</option>`).join('');
  const holeTabs=(c.holes||[]).map((x,i)=>`<button class="cf-hole-tab${i===e.hIdx?' active':''}" onclick="cfSelectHole(${i})">${x.num}</button>`).join('');
  const modeBtn=(m,lbl)=>`<button class="cf-mode${e.mode===m?' active':''}" onclick="cfSetMode('${m}')">${lbl}</button>`;
  const scaleTxt = h&&h.scaleYpu ? `${ydNum(h.scaleYpu,3)} ${ydUnit()}/unit (calibrated)` : (h&&h.tee&&h.pin&&h.yards ? `${ydNum(h.yards/Math.hypot(h.pin.x-h.tee.x,h.pin.y-h.tee.y),3)} ${ydUnit()}/unit (from tee→pin)` : 'not set');
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:0">Course Editor <span class="proto-badge">prototype</span></div>
    ${cfImportBox()}
    <div class="cf-course-row" style="margin-top:12px">
      <select onchange="cfSelectCourse(this.value)" class="cf-select">${courseOpts}</select>
      <input class="cf-name" value="${escapeHtml(c.name||'')}" oninput="cfRenameCourse(this.value)" placeholder="Course name">
      <button class="btn" onclick="cfAddCourse()">+ Course</button>
      <button class="btn" onclick="cfDeleteCourse()">Delete</button>
      ${c.source==='osm'?`<button class="btn" onclick="cfOsmRefresh()" title="Re-read this course from OpenStreetMap; your tees, ratings, pin sheets, plans and rounds are kept">↻ Update from map</button>`:''}
    </div>
    ${cfTeeBoxHTML(c)}
    <div class="cf-hole-tabs">${holeTabs}<button class="cf-hole-tab add" onclick="cfAddHole()">+</button></div>
    ${h?`
    <div class="cf-hole-meta">
      <label>Hole <input type="number" min="1" max="18" value="${h.num}" onchange="cfSetHoleField('num',this.value)" style="width:48px"></label>
      <label>Par <input type="number" min="3" max="6" value="${h.par}" onchange="cfSetHoleField('par',this.value)" style="width:48px"></label>
      <label>${isMetric('distance')?'Metres':'Yards'} <input type="number" min="${ydNum(40)}" max="${ydNum(700)}" value="${ydNum(h.yards)}" onchange="cfSetHoleField('yards',fromDisplay('distance',this.value))" style="width:64px"></label>
      <span class="cf-scale">scale: ${scaleTxt}</span>
    </div>
    <div class="cf-tools">
      <span class="cf-tools-lbl">Trace:</span>
      ${modeBtn('calibrate','📏 Scale')}${modeBtn('tee','⛳ Tee')}${modeBtn('pin','🚩 Pin')}
      ${modeBtn('fairway','Fairway')}${modeBtn('green','Green')}
      ${modeBtn('sand','Bunker')}${modeBtn('water','Water')}${modeBtn('trees','Trees')}${modeBtn('oob','OOB')}
    </div>
    <div class="cf-tools">
      <button class="btn" onclick="cfFinishFeature()">✓ Finish shape</button>
      <button class="btn" onclick="cfUndoPoint()">↶ Undo point</button>
      <button class="btn" onclick="cfClearFeature()">✕ Clear feature</button>
      <label class="btn" style="cursor:pointer">🖼 Backdrop<input type="file" accept="image/*" style="display:none" onchange="cfLoadBg(this)"></label>
      ${h.bg?`<button class="btn" onclick="cfClearBg()">Remove backdrop</button>`:''}
    </div>
    <div class="cf-hint">${cfModeHint(e.mode)}</div>
    <div class="cf-canvas">${renderHoleSVG(h,{interactive:true})}</div>
    `:'<p class="intro-note">Add a hole to begin.</p>'}`;
}
function cfModeHint(mode){
  const m={
    calibrate:'Click two points a known distance apart, then enter the yards.',
    tee:'Click the tee location.', pin:'Click the pin / green centre.',
    fairway:'Click around the fairway edge, then “Finish shape”.',
    green:'Click around the green edge, then “Finish shape”.',
    sand:'Click around a bunker, then “Finish shape”. Repeat for more bunkers.',
    water:'Click around a water hazard, then “Finish shape”.',
    trees:'Click around a tree line or copse, then “Finish shape”. Modelled as a recovery — a shot spent getting back in play.',
    oob:'Click around an OOB region, then “Finish shape”.'
  };
  return mode? m[mode]||'' : 'Pick a tool above. Add a backdrop image to trace over, calibrate the scale, then trace features.';
}
function cfRefreshCanvas(){
  const host=document.querySelector('.cf-canvas'); const h=cfHole();
  if(host&&h) host.innerHTML=renderHoleSVG(h,{interactive:true});
  /* keep tool highlights in sync */
  document.querySelectorAll('.cf-mode').forEach(b=>b.classList.remove('active'));
  if(window.courseEdit.mode){ const lblMap={calibrate:'Scale',tee:'Tee',pin:'Pin',fairway:'Fairway',green:'Green',sand:'Bunker',water:'Water',oob:'OOB'};
    document.querySelectorAll('.cf-mode').forEach(b=>{ if(b.textContent.includes(lblMap[window.courseEdit.mode])) b.classList.add('active'); }); }
  const hint=document.querySelector('.cf-hint'); if(hint) hint.textContent=cfModeHint(window.courseEdit.mode);
}

/* ---------- OpenStreetMap import (primary acquisition) ----------
   Geocode (Nominatim) → fetch golf features (Overpass, with geometry) → parse →
   project lat/lon to field units per hole (oriented tee→green up) → store. */
function osmToMeters(lat,lon,lat0,lon0){
  const R=6378137, D=Math.PI/180;
  return { x:(lon-lon0)*D*R*Math.cos(lat0*D), y:(lat-lat0)*D*R };
}
function osmCentroid(geo){ let la=0,lo=0; geo.forEach(p=>{la+=p.lat;lo+=p.lon;}); return {lat:la/geo.length, lon:lo/geo.length}; }
/* A single mapped tree is a NODE, not a way — buffer it into a small polygon so it can be
   tested against like any other obstacle. One oak guarding a corner matters in golf. */
const OSM_TREE_R_M = 4, OSM_TREE_CAP = 400, OSM_TREE_MAX_SPAN_M = 400;
/* rough bounding-box span of a lat/lon ring, in metres */
function osmSpanM(geo){
  let la0=90,la1=-90,lo0=180,lo1=-180;
  geo.forEach(p=>{ la0=Math.min(la0,p.lat); la1=Math.max(la1,p.lat); lo0=Math.min(lo0,p.lon); lo1=Math.max(lo1,p.lon); });
  const mLat=(la1-la0)*111319.49, mLon=(lo1-lo0)*111319.49*Math.cos((la0+la1)/2*Math.PI/180);
  return Math.hypot(mLat,mLon);
}
function osmTreeCircle(lat,lon,rM){
  const dLat=rM/111319.49, dLon=rM/(111319.49*Math.cos(lat*Math.PI/180));
  const pts=[]; for(let a=0;a<8;a++){ const th=a*Math.PI/4;
    pts.push({lat:lat+dLat*Math.sin(th), lon:lon+dLon*Math.cos(th)}); }
  return pts;
}
function osmParse(elements){
  const f={holes:[],greens:[],fairways:[],tees:[],bunkers:[],water:[],trees:[]};
  let treeNodes=0;
  (elements||[]).forEach(el=>{
    const t=el.tags; if(!t) return;
    const geo=el.geometry;
    const g=t.golf;
    if(g){
      if(!geo||!geo.length) return;
      /* the hole's handicap tag is its stroke index; a feature carrying a hole number (ref)
         belongs to that hole, whatever it happens to lie nearest */
      const ref=parseInt(t.ref)||null;
      if(g==='hole') f.holes.push({num:parseInt(t.ref||t.name)||null, par:parseInt(t.par)||null, si:parseInt(t.handicap)||null, line:geo});
      else if(g==='green') f.greens.push({geo, ref});
      else if(g==='fairway') f.fairways.push({geo, ref});
      else if(g==='tee') f.tees.push({geo, ref});
      else if(g==='bunker') f.bunkers.push({geo, ref});
      else if(g==='water_hazard'||g==='lateral_water_hazard') f.water.push({geo, ref});
      return;
    }
    /* trees: woods and tree rows are ways, individual trees are nodes */
    if(t.natural==='wood'||t.landuse==='forest'||t.natural==='scrub'||t.natural==='tree_row'){
      /* skip the surrounding woodland — a polygon spanning the whole property is not a
         golf feature and would swamp whichever hole it got assigned to */
      if(geo&&geo.length>1&&osmSpanM(geo)<=OSM_TREE_MAX_SPAN_M) f.trees.push({geo, ref:null});
    } else if(t.natural==='tree' && el.lat!=null && el.lon!=null && treeNodes<OSM_TREE_CAP){
      treeNodes++; f.trees.push({geo:osmTreeCircle(el.lat, el.lon, OSM_TREE_R_M), ref:null});
    }
  });
  return f;
}
/* which: 'start' measures to each hole's first point only (a tee belongs to the hole that
   starts there, not to the one whose green is next to it), 'end' to the last (greens) */
function osmNearestHoleIdx(centroid, holes, ref, which){
  const cm=osmToMeters(centroid.lat,centroid.lon,ref.lat0,ref.lon0);
  let best=0,bd=Infinity;
  holes.forEach((h,i)=>{
    const pts = which==='start' ? [h.line[0]] : which==='end' ? [h.line[h.line.length-1]] : h.line;
    pts.forEach(p=>{ const m=osmToMeters(p.lat,p.lon,ref.lat0,ref.lon0); const d=Math.hypot(cm.x-m.x,cm.y-m.y); if(d<bd){bd=d;best=i;} });
  });
  return best;
}
function osmBuildHole(h, feats, ref){
  const line=h.line.map(p=>osmToMeters(p.lat,p.lon,ref.lat0,ref.lon0));
  const T=line[0], G=line[line.length-1];
  const vx=G.x-T.x, vy=G.y-T.y, vlen=Math.hypot(vx,vy)||1;
  const vhat={x:vx/vlen,y:vy/vlen}, uhat={x:vhat.y,y:-vhat.x};            // along-play & lateral
  const toUV=m=>{const dx=m.x-T.x,dy=m.y-T.y; return {u:dx*uhat.x+dy*uhat.y, v:dx*vhat.x+dy*vhat.y};};
  const projGeo=geo=>geo.map(p=>toUV(osmToMeters(p.lat,p.lon,ref.lat0,ref.lon0)));
  const all=[]; const gather=arr=>arr.forEach(geo=>projGeo(geo).forEach(pt=>all.push(pt)));
  line.map(toUV).forEach(pt=>all.push(pt));
  gather(feats.greens);gather(feats.fairways);gather(feats.tees);gather(feats.bunkers);gather(feats.water);
  let minU=1e9,maxU=-1e9,minV=1e9,maxV=-1e9;
  all.forEach(p=>{minU=Math.min(minU,p.u);maxU=Math.max(maxU,p.u);minV=Math.min(minV,p.v);maxV=Math.max(maxV,p.v);});
  const FW=CF_W, FH=CF_H, PADx=90, PADy=80;
  const spanU=Math.max(1,maxU-minU), spanV=Math.max(1,maxV-minV);
  const scale=Math.min((FW-2*PADx)/spanU,(FH-2*PADy)/spanV), cx=(minU+maxU)/2;
  const toField=p=>({x:Math.round(FW/2+(p.u-cx)*scale), y:Math.round(FH-PADy-(p.v-minV)*scale)});
  const fGeo=geo=>projGeo(geo).map(toField);
  const biggest=arr=>arr.length?arr.slice().sort((a,b)=>b.length-a.length)[0]:null;
  /* The hole's length is measured ALONG its line of play, as a scorecard measures it, not
     straight from tee to green: a dogleg's straight line runs over the corner. */
  let pathM=0; for(let i=1;i<line.length;i++) pathM+=Math.hypot(line[i].x-line[i-1].x, line[i].y-line[i-1].y);
  /* Every fairway piece is kept (a split or broken fairway is several); the largest stays in
     hole.fairway, which the strategy engine reads, and the rest go in hole.fairways. */
  const fwBig=biggest(feats.fairways), fwRest=feats.fairways.filter(g=>g!==fwBig&&g.length>=3).map(fGeo);
  /* Every teeing ground, as a marker with its yardage: the straight line from it to the green
     plus whatever the dogleg adds. Sorted back to front. The hole line's own start stays the
     tee until a set of boxes is chosen (cfSetTeeBox). */
  const corner=pathM-vlen;
  const teeBoxes=feats.tees.map(g=>{ const c=osmCentroid(g), m=osmToMeters(c.lat,c.lon,ref.lat0,ref.lon0);
      return Object.assign(toField(toUV(m)), {yd:Math.round((Math.hypot(G.x-m.x,G.y-m.y)+corner)*1.09361)}); })
    /* a box well behind the line's start, or under half the hole's length, is another hole's */
    .filter(b=>b.yd<=pathM*1.09361+40 && b.yd>=pathM*1.09361*0.5)
    .sort((a,b)=>b.yd-a.yd);
  const hazards=feats.bunkers.map(g=>({type:'sand',pts:fGeo(g)}))
    .concat(feats.water.map(g=>({type:'water',pts:fGeo(g)})))
    .concat((feats.trees||[]).map(g=>({type:'trees',pts:fGeo(g)})));
  /* Keep the projection so the hole stays georeferenced: field <-> metres <-> lat/lon.
     toField is the affine x = ox + s*u, y = oy - s*v, so store those offsets directly
     (see cfFieldToLatLon / cfLatLonToField). scale is field units per METRE. */
  const geo={ lat0:ref.lat0, lon0:ref.lon0, tx:T.x, ty:T.y,
              ux:uhat.x, uy:uhat.y, vx:vhat.x, vy:vhat.y,
              s:scale, ox:FW/2-cx*scale, oy:FH-PADy+minV*scale };
  const teeAt=toField(toUV(T));
  const out={ num:h.num||0, par:h.par||4, yards:Math.round(pathM*1.09361),
    scaleYpu:+(1.09361/scale).toFixed(5), geo, bg:null,
    tee:teeAt, teeLine:{x:teeAt.x, y:teeAt.y}, pin:toField(toUV(G)),
    green:biggest(feats.greens)?fGeo(biggest(feats.greens)):[],
    fairway:fwBig?fGeo(fwBig):[],
    hazards,
    /* where each value came from, so a refresh from the map replaces only what the map gave */
    src:{ par:h.par?'map':'default', yards:'map' } };
  if(h.si){ out.si=h.si; out.src.si='map'; }
  if(fwRest.length) out.fairways=fwRest;
  if(teeBoxes.length) out.teeBoxes=teeBoxes;
  return out;
}
function osmBuildCourse(name, parsed, meta){
  let la=0,lo=0,n=0; parsed.holes.forEach(h=>h.line.forEach(p=>{la+=p.lat;lo+=p.lon;n++;}));
  const ref={lat0:la/n, lon0:lo/n};
  const byNum=num=>num==null?-1:parsed.holes.findIndex(h=>h.num===num);
  const assign=(list,which)=>list.map(x=>{ const i=byNum(x.ref);
    return {geo:x.geo, hi: i>=0 ? i : osmNearestHoleIdx(osmCentroid(x.geo),parsed.holes,ref,which)}; });
  const A={greens:assign(parsed.greens,'end'),fairways:assign(parsed.fairways),tees:assign(parsed.tees,'start'),
    bunkers:assign(parsed.bunkers),water:assign(parsed.water),trees:assign(parsed.trees||[])};
  const pick=(arr,hi)=>arr.filter(x=>x.hi===hi).map(x=>x.geo);
  const holes=parsed.holes.map((h,hi)=>osmBuildHole(h,{
    greens:pick(A.greens,hi),fairways:pick(A.fairways,hi),tees:pick(A.tees,hi),
    bunkers:pick(A.bunkers,hi),water:pick(A.water,hi),trees:pick(A.trees,hi)
  },ref)).sort((a,b)=>(a.num||99)-(b.num||99));
  const c={id:(meta&&meta.id)||cfUID(), name, source:'osm', attribution:'© OpenStreetMap contributors', holes};
  if(meta&&meta.osm) c.osm=meta.osm;
  c.mapAt=Date.now();
  return c;
}
async function cfFetchJSON(url, ms){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), ms||18000);
  try{ const r=await fetch(url,{signal:ctrl.signal}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  finally{ clearTimeout(t); }
}
async function cfOverpass(oq, set){
  const mirrors=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  let err;
  for(let i=0;i<mirrors.length;i++){
    try{ if(set) set('Fetching map… (server '+(i+1)+'/'+mirrors.length+', up to 20s each)'); return await cfFetchJSON(mirrors[i]+'?data='+encodeURIComponent(oq),20000); }
    catch(e){ err=e; }
  }
  throw err||new Error('all map servers timed out');
}
/* ---- SEARCH, THEN PICK ----
   The importer used to take the geocoder's first answer, and the first answer is often the
   wrong course: "University Golf Club" is first a course in Illinois, and "Shaughnessy Golf and
   Country Club Vancouver" finds Seymour in North Vancouver, because the map calls Shaughnessy
   "Shaughnessy Golf Course". So it searches golf courses only, twice (as typed, and with the
   words every course name shares taken out), ranks by distance from the golfer's own courses
   or last GPS fix when there is one, and lets the golfer pick, with the town beside each. */
const OSM_FILLER = /\b(golf|course|club|country|and|the|in|at|of|links|g&cc|gcc|gc|cc)\b|&/gi;
function cfOsmBias(){
  for(const c of cfCourses()) for(const h of (c.holes||[])) if(h.geo) return {lat:h.geo.lat0, lon:h.geo.lon0};
  const f=window.pmGps&&window.pmGps.fix; if(f&&f.lat!=null) return {lat:f.lat, lon:f.lon};
  return null;
}
function osmKm(a,b){ const m=osmToMeters(b.lat,b.lon,a.lat,a.lon); return Math.hypot(m.x,m.y)/1000; }
async function cfOsmSearch(){
  const inp=document.getElementById('osm-q'), status=document.getElementById('osm-status'), box=document.getElementById('osm-results');
  const q=((inp&&inp.value)||'').trim(); const set=t=>{ if(status) status.textContent=t; };
  if(box) box.innerHTML='';
  if(!q){ set('Enter a course name.'); return; }
  set('Searching the map…');
  const b=cfOsmBias(), stripped=q.replace(OSM_FILLER,' ').replace(/\s+/g,' ').trim();
  const url=x=>'https://photon.komoot.io/api/?limit=8&osm_tag=leisure:golf_course&q='+encodeURIComponent(x)+(b?`&lat=${b.lat.toFixed(4)}&lon=${b.lon.toFixed(4)}`:'');
  const qs=[...new Set([q, stripped].filter(Boolean))];
  let res; try{ res=await Promise.all(qs.map(x=>cfFetchJSON(url(x)).catch(()=>({features:[]})))); }
  catch(e){ set('Could not search the map ('+(e&&e.message||'')+').'); return; }
  const seen=new Set(), L=[];
  /* the stripped query first: it is the one that finds a course whose map name differs */
  res.slice().reverse().forEach(r=>(r.features||[]).forEach(f=>{
    const p=f.properties||{}; if(!p.osm_id) return; const k=p.osm_type+p.osm_id; if(seen.has(k)) return; seen.add(k);
    L.push({ name:p.name||'Golf course', where:[p.city||p.district||p.county, p.state, p.country].filter(Boolean).join(', '),
             type:p.osm_type, id:p.osm_id, lat:f.geometry.coordinates[1], lon:f.geometry.coordinates[0], extent:p.extent||null });
  }));
  if(b){ L.forEach(x=>x.km=osmKm(b,x)); L.sort((x,y)=>x.km-y.km); }
  window.osmFound=L.slice(0,8);
  if(!L.length){ set('No golf course by that name on the map. Try fewer words, or add the town.'); return; }
  const tgt=window.osmTarget && cfCourses().find(c=>c.id===window.osmTarget);
  set(tgt ? `Pick the course to update ${tgt.name} from:` : 'Pick your course:');
  if(box) box.innerHTML=window.osmFound.map((x,i)=>`<button type="button" class="osm-hit" onclick="cfOsmPick(${i})">
      <b>${escapeHtml(x.name)}</b><span>${escapeHtml(x.where||'')}${x.km!=null?` · ${x.km<10?x.km.toFixed(1):Math.round(x.km)} km`:''}</span></button>`).join('');
}
/* the old entry point: Enter in the box, and anything that still calls it */
function cfOsmImport(){ window.osmTarget=null; return cfOsmSearch(); }

/* Golf features INSIDE the course's own boundary, so a neighbouring course cannot leak in;
   a box around it only when the course has no boundary on the map (mapped as a point). */
async function cfOsmFetch(x, set){
  const body=a=>`(way[golf](${a});way[natural=wood](${a});way[landuse=forest](${a});way[natural=scrub](${a});way[natural=tree_row](${a});node[natural=tree](${a}););out geom;`;
  const sel = x.type==='R' ? `rel(${x.id})` : x.type==='W' ? `way(${x.id})` : null;
  const hasHoles=d=>(d.elements||[]).some(e=>e.tags&&e.tags.golf==='hole');
  if(sel){
    const d=await cfOverpass(`[out:json][timeout:25];${sel};map_to_area->.a;`+body('area.a'), set);
    if(hasHoles(d)) return d;
  }
  if(x.lat==null) throw new Error('no holes inside the course boundary');
  let S,N,W,E; const ex=x.extent;
  if(ex&&ex.length===4){ W=ex[0];N=ex[1];E=ex[2];S=ex[3]; } else { S=x.lat-0.006;N=x.lat+0.006;W=x.lon-0.006;E=x.lon+0.006; }
  S-=0.003;N+=0.003;W-=0.003;E+=0.003;
  return cfOverpass('[out:json][timeout:25];'+body(S+','+W+','+N+','+E), set);
}
async function cfOsmPick(i){
  const x=(window.osmFound||[])[i]; if(!x) return;
  const status=document.getElementById('osm-status'), box=document.getElementById('osm-results'), set=t=>{ if(status) status.textContent=t; };
  const cs=cfCourses();
  /* updating: the course "Update from map" was pressed on, or this same map course already in the list */
  let have = window.osmTarget ? cs.find(c=>c.id===window.osmTarget) : null;
  if(!have){
    have=cs.find(c=>c.osm && c.osm.type===x.type && String(c.osm.id)===String(x.id));
    if(have && !confirm(`${have.name} is already in your courses. Update it from the map instead?\n\nYour tees, ratings, stroke indexes, pin sheets, plans and rounds are kept.`)) return;
  }
  if(box) box.innerHTML='';
  let data; try{ data=await cfOsmFetch(x, set); }
  catch(e){ set('Map service busy or unreachable — try again in a moment ('+(e&&e.message||'')+').'); return; }
  try{
    const parsed=osmParse(data.elements);
    if(!parsed.holes.length){ set('Found the course, but no holes are mapped for it in OpenStreetMap.'); return; }
    const fresh=osmBuildCourse(x.name, parsed, {osm:{type:x.type, id:x.id}});
    const nH=parsed.holes.length, nPar=parsed.holes.filter(h=>h.par).length, nSi=parsed.holes.filter(h=>h.si).length;
    const notes=[nPar<nH?`${nH-nPar} hole${nH-nPar===1?'':'s'} without a par on the map (check ${nH-nPar===1?'it':'them'})`:'',
                 nSi?'stroke index from the map':'no stroke index on the map: add it on the Ready to post card'].filter(Boolean).join('; ');
    let msg;
    if(have){ const r=csRefresh(have, fresh); window.courseEdit.cIdx=cs.indexOf(have); msg=`Updated ${have.name} from the map: ${r.holes} holes.`; }
    else { cs.push(fresh); window.courseEdit.cIdx=cs.length-1; msg=`Imported ${fresh.name}: ${nH} holes.`; }
    window.osmTarget=null; window.courseEdit.hIdx=0;
    saveState(); buildCourses(); if(typeof buildCourseStrategy==='function') buildCourseStrategy();
    const st=document.getElementById('osm-status'); if(st) st.textContent=msg+' '+notes.charAt(0).toUpperCase()+notes.slice(1)+'.';
  }catch(e){ set('Could not build the course from the map data ('+(e&&e.message||'')+').'); }
}
/* "Update from map" on a course: straight to the map if it knows which course it is; a course
   imported before the importer kept that (and the samples) is searched for by name first. */
function cfOsmRefresh(){
  const c=cfCur(); if(!c) return;
  window.osmTarget=c.id;
  if(c.osm){ window.osmFound=[Object.assign({name:c.name}, c.osm)]; cfOsmPick(0); return; }
  const inp=document.getElementById('osm-q'); if(inp) inp.value=c.name||'';
  cfOsmSearch();
}

/* ---- WHICH TEES ----
   Distances run from hole.tee. The map's hole line starts at one teeing ground (usually the
   back); a course's other boxes are kept as markers, back to front, and one choice for the
   course moves every hole's tee to the matching box. 'line' puts the map's start back. */
const CF_TEE_SETS = [['line','Map default'],['back','Back'],['middle','Middle'],['forward','Forward']];
function cfTeeIdx(B, set){ return set==='back' ? 0 : set==='forward' ? B.length-1 : Math.floor((B.length-1)/2); }
function cfTeeBoxFor(h, set){
  const B=h.teeBoxes||[]; if(!B.length || set==='line') return h.teeLine||null;
  const b=B[cfTeeIdx(B, set)]; return {x:b.x, y:b.y};
}
function cfSetTeeBoxOn(c, set){
  if(!c) return;
  c.teeBox=set;
  (c.holes||[]).forEach(h=>{ const t=cfTeeBoxFor(h, set); if(t) h.tee={x:t.x, y:t.y}; });
  cfPinCacheClear();
}
function cfSetTeeBox(set){ const c=cfCur(); if(!c) return; cfSetTeeBoxOn(c, set); saveState(); buildCourses(); if(typeof buildCourseStrategy==='function') buildCourseStrategy(); }
function cfTeeSetYards(c, set){
  let t=0; for(const h of (c.holes||[])){ const B=h.teeBoxes||[];
    if(set==='line'||!B.length){ t+=+h.yards||0; continue; }
    t+=B[cfTeeIdx(B, set)].yd||0; }
  return t;
}
function cfTeeBoxHTML(c){
  if(!(c.holes||[]).some(h=>(h.teeBoxes||[]).length>1)) return '';
  const cur=c.teeBox||'line';
  return `<label class="cf-teebox">Tees for distances <select onchange="cfSetTeeBox(this.value)">${CF_TEE_SETS.map(([v,l])=>
      `<option value="${v}"${cur===v?' selected':''}>${l} · ${Math.round(ydNum(cfTeeSetYards(c,v))).toLocaleString()} ${ydUnit()}</option>`).join('')}</select></label>`;
}

async function cfLoadPresets(){
  const status=document.getElementById('osm-status'), set=t=>{ if(status) status.textContent=t; };
  try{
    set('Loading sample courses…');
    const list=await cfFetchJSON('/preset-courses.json', 15000);   // same-origin — no CORS
    const cs=cfCourses(), have=new Set(cs.map(c=>c.id)); let added=0;
    (list||[]).forEach(c=>{ if(!have.has(c.id)){ cs.push(c); added++; } });
    window.courseEdit.cIdx=cs.length-1; window.courseEdit.hIdx=0;
    saveState(); buildCourses(); if(typeof buildCourseStrategy==='function') buildCourseStrategy();
    set(added?('Added '+added+' sample course'+(added>1?'s':'')+'.'):'Sample courses already loaded.');
  }catch(e){ set('Could not load sample courses ('+(e&&e.message||'')+').'); }
}
function cfImportBox(){
  return `<div class="osm-box">
    <div class="osm-title">Import a Course <span class="proto-badge">prototype</span></div>
    <div class="osm-sub">Type a course name, then pick it from the list. Greens, fairways, bunkers, tee boxes, pars and (where mapped) stroke index come from OpenStreetMap: no tracing.</div>
    <div class="osm-row">
      <input id="osm-q" class="cf-name" placeholder="e.g. University Golf Club" onkeydown="if(event.key==='Enter')cfOsmSearch()">
      <button class="btn btn-primary" onclick="cfOsmSearch()">Search</button>
    </div>
    <div id="osm-status" class="osm-status"></div>
    <div id="osm-results" class="osm-results"></div>
    <div class="osm-presets"><button class="btn" onclick="cfLoadPresets()">Load sample BC courses</button><span class="osm-attr-inline">Vancouver GC · University GC · Shaughnessy · Pitt Meadows · The Dunes</span></div>
    <div class="osm-attr">Map data © OpenStreetMap contributors (ODbL)</div>
  </div>`;
}

/* ---- Round Strategy & Live Tracking — skeleton infrastructure to evolve ----
   window.activeRound holds a transient in-progress round; per-shot capture, GPS auto-location,
   ball/impact estimation and the real-time recommendation engine are placeholders for now. */
function startRound(){
  const c=cfCur();
  window.activeRound={ course:c?c.name:'', startedAt:Date.now(), holes:[] };
  buildRoundTracker();
}
function endRound(){ window.activeRound=null; buildRoundTracker(); }
function buildRoundTracker(){
  const wrap=document.getElementById('round-tracker-wrap'); if(!wrap) return;
  const r=window.activeRound;
  wrap.innerHTML=`
    <div class="profile-card" style="margin-top:0">
      <h3>Course Strategy — Shot by Shot <span class="proto-badge">coming</span></h3>
      <p class="intro-note" style="margin-top:6px">Overlay your <b>86% dispersion</b> on each mapped hole to pick tee aim &amp; approach targets that minimise expected score (or follow your chosen strategy). Needs a mapped hole plus your bag distances &amp; dispersion — the Target Selection box in <b>Pre-Shot Routine</b> feeds this.</p>
    </div>
    <div class="profile-card">
      <h3>Play a Round</h3>
      ${(typeof pmRound==='function'&&pmRound())?`
        <div style="font-family:ui-monospace,monospace;font-size:.7rem;color:var(--muted)">Round in progress · ${escapeHtml(pmRound().courseName||'course')} · started ${new Date(pmRound().startedAt).toLocaleTimeString()}</div>
        <button class="btn btn-primary" style="margin-top:10px" onclick="pmOpen()">Resume round</button>`
      :`
        <p class="intro-note" style="margin-top:6px">Distances from GPS, the hole map and your scorecard, full-screen on your phone. The same mode as the <b>▶ Play golf</b> door on Home (tap the logo); a finished round fills in Post-Round for you.</p>
        <button class="btn btn-primary" style="margin-top:8px" onclick="pmOpen()">Play golf now</button>`}
    </div>`;
}

Object.assign(window, {
  CF_W, CF_H, cfCourses, cfCur, cfHole, cfAddCourse, cfDeleteCourse, cfSelectCourse, cfRenameCourse,
  cfIsBlankCourse, cfPruneBlankCourses,
  cfPin, cfPinCacheClear, cfGreenMid, cfPinSheets, cfActiveSheet, cfCourseOf,
  cfGreenFrame, cfGreenCross, cfPinPaces, cfPinFromPaces, cfGreenThumb, cfGreenThumbPoint, cfSheetAdd, cfSheetSelect, cfSheetDelete, cfSheetRename, cfSetPin,
  cfAddHole, cfSelectHole, cfSetHoleField, cfSetMode, cfCanvasClick, cfFinishFeature, cfUndoPoint,
  cfClearFeature, cfLoadBg, cfClearBg, renderHoleSVG, buildCourses, cfModeHint, cfRefreshCanvas,
  cfYardsPerUnit, cfHasScale, cfDistYd, cfDistToPinYd, cfDistFromTeeYd,
  cfFieldToLatLon, cfLatLonToField, cfPointInPoly, cfDistPtSeg, cfDistToPoly,
  cfLieAt, cfShotLie, cfCarryLie, CF_TEE_TOL, cfSgLie, cfIsPenalty, cfIsRecovery, CF_LIE_LABEL, CF_LIE_ORDER, CF_RECOVERY_ADV,
  osmSpanM, osmTreeCircle, cfDistToHazardYd, cfHcp,
  cfSegHit, cfSegPolyFirstHit, cfSegPolyAllHits, cfHazardSpan, cfCoverNumbers, CF_COVER_TYPES, cfRunwayYd, cfRunwayAdj, CF_RUNWAY_MAX,
  cfExpectedStrokes, cfShotContext,
  osmToMeters, osmCentroid, osmParse, osmNearestHoleIdx, osmBuildHole, osmBuildCourse, cfFetchJSON, cfOverpass, cfOsmImport, cfImportBox, OSM_FILLER, cfOsmBias, osmKm, cfOsmSearch, cfOsmFetch, cfOsmPick, cfOsmRefresh,
  CF_TEE_SETS, cfTeeBoxFor, cfSetTeeBoxOn, cfSetTeeBox, cfTeeSetYards, cfTeeBoxHTML, cfLoadPresets,
  startRound, endRound, buildRoundTracker
});
