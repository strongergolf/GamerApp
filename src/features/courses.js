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

function cfAddCourse(){
  const cs=cfCourses();
  cs.push({id:cfUID(), name:'New Course', holes:[]});
  window.courseEdit.cIdx=cs.length-1; window.courseEdit.hIdx=0;
  cfAddHole(); saveState(); buildCourses(); buildCourseStrategy&&buildCourseStrategy();
}
function cfDeleteCourse(){
  const cs=cfCourses(); if(!cs.length) return;
  if(!confirm('Delete this course and all its holes?')) return;
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
function cfSetHoleField(field,v){ const h=cfHole(); if(!h) return; h[field]=parseInt(v)||0; saveState(); if(field==='yards') buildCourses(); }

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
  const fairway = cfPoly(hole.fairway,'#3fa45a','#2e7d44',0.85);
  const green = cfPoly(hole.green,'#5ec77a','#2e7d44',0.95);
  const hazards = (hole.hazards||[]).map(z=>cfPoly(z.pts,hz[z.type]||'#999',null,z.type==='oob'?0.5:0.85)).join('');
  const tee = hole.tee?`<rect x="${hole.tee.x-10}" y="${hole.tee.y-10}" width="20" height="20" rx="4" fill="#222" stroke="#fff" stroke-width="2"/>`:'';
  const pin = hole.pin?`<line x1="${hole.pin.x}" y1="${hole.pin.y}" x2="${hole.pin.x}" y2="${hole.pin.y-46}" stroke="#fff" stroke-width="2.5"/><polygon points="${hole.pin.x},${hole.pin.y-46} ${hole.pin.x+26},${hole.pin.y-38} ${hole.pin.x},${hole.pin.y-30}" fill="#d33"/><circle cx="${hole.pin.x}" cy="${hole.pin.y}" r="6" fill="#fff" stroke="#333"/>`:'';
  const centerline = (hole.tee&&hole.pin)?`<line x1="${hole.tee.x}" y1="${hole.tee.y}" x2="${hole.pin.x}" y2="${hole.pin.y}" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-dasharray="10,8"/>`:'';
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
    <rect x="${-CF_W}" y="${-CF_H}" width="${CF_W*3}" height="${CF_H*3}" fill="#2f7a3f"/>${bg}
    ${fairway}${green}${hazards}${centerline}${(opts.overlay||'')}${tee}${pin}${draftSVG}
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
function cfDistToPinYd(hole,pt){ return (hole&&hole.pin)?cfDistYd(hole,pt,hole.pin):null; }
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
/* Runway in yards. null when already on the green, or the hole has no green mapped. */
function cfRunwayYd(hole,pt){
  if(!hole||!hole.pin||!(hole.green||[]).length||!pt) return null;
  const ypu=cfYardsPerUnit(hole); if(ypu==null) return null;
  if(cfPointInPoly(pt,hole.green)) return null;
  const e=cfSegPolyFirstHit(pt,hole.pin,hole.green);
  if(!e) return 0;                                   // line never reaches green → nothing to work with
  return Math.hypot(hole.pin.x-e.x, hole.pin.y-e.y)*ypu;
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
  if(cfPointInPoly(pt,hole.fairway)) return 'fairway';
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
/* Resolve a handicap for the SG baselines: explicit arg, else the golfer profile. */
function cfHcp(hcp){
  const raw=(hcp!=null&&hcp!=='')?hcp:((STATE.profile&&STATE.profile.handicap)||0);
  return (typeof parseHcp==='function')?parseHcp(raw):(parseFloat(raw)||0);
}
/* Expected strokes to hole out from a field point — the value the aim-point optimiser
   minimises. Green distances convert to FEET (the SR green table is in feet).
   NOTE: penalty areas are approximated as one stroke plus a rough-lie recovery at the
   same distance. Real relief (stroke-and-distance vs lateral drop) is a refinement. */
function cfExpectedStrokes(hole,pt,hcp){
  if(typeof srForPlayer!=='function') return null;
  const d=cfDistToPinYd(hole,pt); if(d==null) return null;
  const lie=cfLieAt(hole,pt), h=cfHcp(hcp);
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
  const scaleTxt = h&&h.scaleYpu ? `${h.scaleYpu.toFixed(2)} yd/unit (calibrated)` : (h&&h.tee&&h.pin&&h.yards ? `${(h.yards/Math.hypot(h.pin.x-h.tee.x,h.pin.y-h.tee.y)).toFixed(2)} yd/unit (from tee→pin)` : 'not set');
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:0">Course Editor <span class="proto-badge">prototype</span></div>
    ${cfImportBox()}
    <div class="cf-course-row" style="margin-top:12px">
      <select onchange="cfSelectCourse(this.value)" class="cf-select">${courseOpts}</select>
      <input class="cf-name" value="${escapeHtml(c.name||'')}" oninput="cfRenameCourse(this.value)" placeholder="Course name">
      <button class="btn" onclick="cfAddCourse()">+ Course</button>
      <button class="btn" onclick="cfDeleteCourse()">Delete</button>
    </div>
    <div class="cf-hole-tabs">${holeTabs}<button class="cf-hole-tab add" onclick="cfAddHole()">+</button></div>
    ${h?`
    <div class="cf-hole-meta">
      <label>Hole <input type="number" min="1" max="18" value="${h.num}" onchange="cfSetHoleField('num',this.value)" style="width:48px"></label>
      <label>Par <input type="number" min="3" max="6" value="${h.par}" onchange="cfSetHoleField('par',this.value)" style="width:48px"></label>
      <label>Yards <input type="number" min="40" max="700" value="${h.yards}" onchange="cfSetHoleField('yards',this.value)" style="width:64px"></label>
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
      if(g==='hole') f.holes.push({num:parseInt(t.ref||t.name)||null, par:parseInt(t.par)||null, line:geo});
      else if(g==='green') f.greens.push(geo);
      else if(g==='fairway') f.fairways.push(geo);
      else if(g==='tee') f.tees.push(geo);
      else if(g==='bunker') f.bunkers.push(geo);
      else if(g==='water_hazard'||g==='lateral_water_hazard') f.water.push(geo);
      return;
    }
    /* trees: woods and tree rows are ways, individual trees are nodes */
    if(t.natural==='wood'||t.landuse==='forest'||t.natural==='scrub'||t.natural==='tree_row'){
      /* skip the surrounding woodland — a polygon spanning the whole property is not a
         golf feature and would swamp whichever hole it got assigned to */
      if(geo&&geo.length>1&&osmSpanM(geo)<=OSM_TREE_MAX_SPAN_M) f.trees.push(geo);
    } else if(t.natural==='tree' && el.lat!=null && el.lon!=null && treeNodes<OSM_TREE_CAP){
      treeNodes++; f.trees.push(osmTreeCircle(el.lat, el.lon, OSM_TREE_R_M));
    }
  });
  return f;
}
function osmNearestHoleIdx(centroid, holes, ref){
  const cm=osmToMeters(centroid.lat,centroid.lon,ref.lat0,ref.lon0);
  let best=0,bd=Infinity;
  holes.forEach((h,i)=>h.line.forEach(p=>{ const m=osmToMeters(p.lat,p.lon,ref.lat0,ref.lon0); const d=Math.hypot(cm.x-m.x,cm.y-m.y); if(d<bd){bd=d;best=i;} }));
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
  const hazards=feats.bunkers.map(g=>({type:'sand',pts:fGeo(g)}))
    .concat(feats.water.map(g=>({type:'water',pts:fGeo(g)})))
    .concat((feats.trees||[]).map(g=>({type:'trees',pts:fGeo(g)})));
  /* Keep the projection so the hole stays georeferenced: field <-> metres <-> lat/lon.
     toField is the affine x = ox + s*u, y = oy - s*v, so store those offsets directly
     (see cfFieldToLatLon / cfLatLonToField). scale is field units per METRE. */
  const geo={ lat0:ref.lat0, lon0:ref.lon0, tx:T.x, ty:T.y,
              ux:uhat.x, uy:uhat.y, vx:vhat.x, vy:vhat.y,
              s:scale, ox:FW/2-cx*scale, oy:FH-PADy+minV*scale };
  return { num:h.num||0, par:h.par||4, yards:Math.round(vlen*1.09361),
    scaleYpu:+(1.09361/scale).toFixed(5), geo, bg:null,
    tee:toField(toUV(T)), pin:toField(toUV(G)),
    green:biggest(feats.greens)?fGeo(biggest(feats.greens)):[],
    fairway:biggest(feats.fairways)?fGeo(biggest(feats.fairways)):[],
    hazards };
}
function osmBuildCourse(name, parsed){
  let la=0,lo=0,n=0; parsed.holes.forEach(h=>h.line.forEach(p=>{la+=p.lat;lo+=p.lon;n++;}));
  const ref={lat0:la/n, lon0:lo/n};
  const assign=list=>list.map(geo=>({geo, hi:osmNearestHoleIdx(osmCentroid(geo),parsed.holes,ref)}));
  const A={greens:assign(parsed.greens),fairways:assign(parsed.fairways),tees:assign(parsed.tees),
    bunkers:assign(parsed.bunkers),water:assign(parsed.water),trees:assign(parsed.trees||[])};
  const pick=(arr,hi)=>arr.filter(x=>x.hi===hi).map(x=>x.geo);
  const holes=parsed.holes.map((h,hi)=>osmBuildHole(h,{
    greens:pick(A.greens,hi),fairways:pick(A.fairways,hi),tees:pick(A.tees,hi),
    bunkers:pick(A.bunkers,hi),water:pick(A.water,hi),trees:pick(A.trees,hi)
  },ref)).sort((a,b)=>(a.num||99)-(b.num||99));
  return {id:cfUID(), name, source:'osm', attribution:'© OpenStreetMap contributors', holes};
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
async function cfOsmImport(){
  const inp=document.getElementById('osm-q'), status=document.getElementById('osm-status');
  const q=((inp&&inp.value)||'').trim(); if(!q){ if(status)status.textContent='Enter a course name.'; return; }
  const set=t=>{ if(status) status.textContent=t; };
  let lat,lon,S,N,W,E;
  /* 1) geocode via Photon (browser/CORS-friendly, OSM-based, no key) */
  try{
    set('Locating course…');
    const geo=await cfFetchJSON('https://photon.komoot.io/api/?limit=1&q='+encodeURIComponent(q));
    const ft=geo.features&&geo.features[0];
    if(!ft){ set('Course not found — try adding the town/city.'); return; }
    lon=ft.geometry.coordinates[0]; lat=ft.geometry.coordinates[1];
    const ex=ft.properties&&ft.properties.extent;          // [W,N,E,S] when present
    if(ex&&ex.length===4){ W=ex[0];N=ex[1];E=ex[2];S=ex[3]; } else { S=lat-0.006;N=lat+0.006;W=lon-0.006;E=lon+0.006; }
    S-=0.003;N+=0.003;W-=0.003;E+=0.003;
  }catch(e){ set('Could not locate the course (geocoder error: '+(e&&e.message||'')+').'); return; }
  /* 2) fetch golf features via Overpass (with mirror fallback) */
  let data;
  try{
    const bb=S+','+W+','+N+','+E;
    const oq='[out:json][timeout:25];('
      +'way[golf]('+bb+');'
      +'way[natural=wood]('+bb+');way[landuse=forest]('+bb+');'
      +'way[natural=scrub]('+bb+');way[natural=tree_row]('+bb+');'
      +'node[natural=tree]('+bb+');'
      +');out geom;';
    data=await cfOverpass(oq, set);
  }catch(e){ set('Map service busy or unreachable — try again in a moment ('+(e&&e.message||'')+').'); return; }
  /* 3) parse → build → store */
  try{
    const parsed=osmParse(data.elements);
    if(!parsed.holes.length){ set('Located the course, but no mapped holes were found in OpenStreetMap.'); return; }
    const course=osmBuildCourse(q, parsed);
    cfCourses().push(course);
    window.courseEdit.cIdx=cfCourses().length-1; window.courseEdit.hIdx=0;
    saveState(); buildCourses(); if(typeof buildCourseStrategy==='function') buildCourseStrategy();
    set('Imported '+course.holes.length+' holes from OpenStreetMap.');
  }catch(e){ set('Could not build the course from the map data ('+(e&&e.message||'')+').'); }
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
    <div class="osm-sub">Type a course name (add the town for accuracy). Greens, fairways, bunkers, tees and hole pars are pulled from OpenStreetMap — no tracing.</div>
    <div class="osm-row">
      <input id="osm-q" class="cf-name" placeholder="e.g. Pitt Meadows Golf Club" onkeydown="if(event.key==='Enter')cfOsmImport()">
      <button class="btn btn-primary" onclick="cfOsmImport()">Search &amp; Import</button>
    </div>
    <div id="osm-status" class="osm-status"></div>
    <div class="osm-presets"><button class="btn" onclick="cfLoadPresets()">Load sample BC courses</button><span class="osm-attr-inline">Vancouver GC · Pitt Meadows · The Dunes</span></div>
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
      <h3>Live Round Tracking <span class="proto-badge">skeleton</span></h3>
      ${r?`
        <div style="font-family:ui-monospace,monospace;font-size:.7rem;color:var(--muted)">Round in progress · ${escapeHtml(r.course||'course')} · started ${new Date(r.startedAt).toLocaleTimeString()}</div>
        <p class="intro-note" style="margin-top:8px">Coming: log each shot (lie · distance · club · result), capture location manually or via <b>GPS</b>, estimate ball &amp; impact/swing data, and get a <b>real-time next-shot recommendation</b> that adapts to this round's results.</p>
        <button class="btn" style="margin-top:10px" onclick="endRound()">End round</button>`
      :`
        <p class="intro-note" style="margin-top:6px">Track a round in real time: manual or GPS shot locations, estimated ball/impact data, and live shot recommendations that learn from how you're hitting it today.</p>
        <button class="btn btn-primary" style="margin-top:8px" onclick="startRound()">Start round</button>`}
    </div>`;
}

Object.assign(window, {
  CF_W, CF_H, cfCourses, cfCur, cfHole, cfAddCourse, cfDeleteCourse, cfSelectCourse, cfRenameCourse,
  cfAddHole, cfSelectHole, cfSetHoleField, cfSetMode, cfCanvasClick, cfFinishFeature, cfUndoPoint,
  cfClearFeature, cfLoadBg, cfClearBg, renderHoleSVG, buildCourses, cfModeHint, cfRefreshCanvas,
  cfYardsPerUnit, cfHasScale, cfDistYd, cfDistToPinYd, cfDistFromTeeYd,
  cfFieldToLatLon, cfLatLonToField, cfPointInPoly, cfDistPtSeg, cfDistToPoly,
  cfLieAt, cfShotLie, CF_TEE_TOL, cfSgLie, cfIsPenalty, cfIsRecovery, CF_LIE_LABEL, CF_LIE_ORDER, CF_RECOVERY_ADV,
  osmSpanM, osmTreeCircle, cfDistToHazardYd, cfHcp,
  cfSegHit, cfSegPolyFirstHit, cfRunwayYd, cfRunwayAdj, CF_RUNWAY_MAX,
  cfExpectedStrokes, cfShotContext,
  osmToMeters, osmCentroid, osmParse, osmNearestHoleIdx, osmBuildHole, osmBuildCourse, cfOsmImport, cfImportBox, cfLoadPresets,
  startRound, endRound, buildRoundTracker
});
