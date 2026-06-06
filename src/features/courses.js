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
  else if(['sand','water','oob'].includes(e.mode)){ h.hazards=h.hazards||[]; h.hazards.push({type:e.mode, pts:e.draft.slice()}); }
  e.draft=[]; saveState(); buildCourses(); buildCourseStrategy&&buildCourseStrategy();
}
function cfUndoPoint(){ const e=window.courseEdit; e.draft.pop(); cfRefreshCanvas(); }
function cfClearFeature(){
  const e=window.courseEdit, h=cfHole(); if(!h) return;
  if(e.mode==='green') h.green=[];
  else if(e.mode==='fairway') h.fairway=[];
  else if(e.mode==='tee') h.tee=null;
  else if(e.mode==='pin') h.pin=null;
  else if(['sand','water','oob'].includes(e.mode)) h.hazards=(h.hazards||[]).filter(z=>z.type!==e.mode);
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
  const hz={sand:'#d9c98a', water:'#3a78c0', oob:'#b85c5c'};
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
  return `<svg viewBox="0 0 ${CF_W} ${CF_H}" ${click} xmlns="http://www.w3.org/2000/svg">
    <rect width="${CF_W}" height="${CF_H}" fill="#2f7a3f"/>${bg}
    ${fairway}${green}${hazards}${centerline}${(opts.overlay||'')}${tee}${pin}${draftSVG}
  </svg>`;
}

/* ---------- editor page ---------- */
function buildCourses(){
  const wrap=document.getElementById('course-editor-wrap'); if(!wrap) return;
  const cs=cfCourses(), c=cfCur(), h=cfHole(), e=window.courseEdit;
  if(!cs.length){
    wrap.innerHTML=`
      <div class="section-label" style="margin-top:0">Course Editor <span class="proto-badge">prototype</span></div>
      <p class="intro-note">Build a hole map by tracing over a satellite screenshot. Calibrate the scale, then trace the tee, fairway, green and hazards. Holes feed the Plan strategy overlays. Stored on this device only.</p>
      <button class="btn btn-primary" onclick="cfAddCourse()">+ New Course</button>`;
    return;
  }
  const courseOpts=cs.map((x,i)=>`<option value="${i}"${i===e.cIdx?' selected':''}>${escapeHtml(x.name||'Course')}</option>`).join('');
  const holeTabs=(c.holes||[]).map((x,i)=>`<button class="cf-hole-tab${i===e.hIdx?' active':''}" onclick="cfSelectHole(${i})">${x.num}</button>`).join('');
  const modeBtn=(m,lbl)=>`<button class="cf-mode${e.mode===m?' active':''}" onclick="cfSetMode('${m}')">${lbl}</button>`;
  const scaleTxt = h&&h.scaleYpu ? `${h.scaleYpu.toFixed(2)} yds/unit (calibrated)` : (h&&h.tee&&h.pin&&h.yards ? `${(h.yards/Math.hypot(h.pin.x-h.tee.x,h.pin.y-h.tee.y)).toFixed(2)} yds/unit (from tee→pin)` : 'not set');
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:0">Course Editor <span class="proto-badge">prototype</span></div>
    <div class="cf-course-row">
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
      ${modeBtn('sand','Bunker')}${modeBtn('water','Water')}${modeBtn('oob','OOB')}
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

Object.assign(window, {
  CF_W, CF_H, cfCourses, cfCur, cfHole, cfAddCourse, cfDeleteCourse, cfSelectCourse, cfRenameCourse,
  cfAddHole, cfSelectHole, cfSetHoleField, cfSetMode, cfCanvasClick, cfFinishFeature, cfUndoPoint,
  cfClearFeature, cfLoadBg, cfClearBg, renderHoleSVG, buildCourses, cfModeHint, cfRefreshCanvas
});
