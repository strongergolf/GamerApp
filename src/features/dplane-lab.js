// D-Plane (a Shots sub-tab): the rotatable 3D impact-geometry viewer, the
// Shape Sandbox, the Shot Presets sub-page, the per-club stock-shot tendencies
// grid and the gear-effect reference. Split out of diagnose.js (2026-07).
// Physics lives in physics/dplane.js - this file is presentation + interaction;
// cross-module calls resolve via the window globals (staged migration pattern).

/* ============================================================
   PER-CLUB D-PLANE TENDENCIES (Practice L2) + Course Strategy (Plan)
   Stock shape & curve derived from horizontal face vs path, loft-scaled
   (lower loft curves more). Feeds Bag dispersion + Plan hole overlays.
   ============================================================ */
function dplaneShape(hFace,hPath,vFace,vPath,carry){
  hFace=+hFace||0; hPath=+hPath||0; vFace=+vFace||0; vPath=+vPath||0; carry=carry||150;
  /* Exact engine. VFace = Dynamic Loft, VPath = Angle of Attack.
     SpinAxis = atan(HDiff/VDiff); 3D SpinLoft = √(VDiff²+HDiff²). */
  const r = dpSolve(hFace, hPath, vFace, vPath, carry);
  return {
    shape: r.shape,
    start: +r.hLaunch.toFixed(1),
    curve: Math.round(Math.abs(r.curveYds)),
    spinAxis: +r.spinAxis.toFixed(1),
    spinLoft: +r.spinLoft.toFixed(1),
    hdiff: r.hDiff
  };
}
function dplFmt(v){ v=+v||0; return Math.abs(v)<0.05?'0.0':(v>0?'+':'')+v.toFixed(1); }
function buildDplaneGrid(){
  const clubs=STATE.clubs.filter(c=>c.type!=='putter');
  const th='padding:5px 4px;font-family:ui-monospace,monospace;font-size:.5rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg2);text-align:center';
  const th2=th+';line-height:1.2;font-size:.62rem;color:var(--ink2)';
  let html=`<div style="overflow-x:auto"><table class="dpl-table"><thead><tr>
    <th style="${th};text-align:left;padding-left:8px">Club</th>
    <th style="${th2}">Horiz.<br>Face°</th><th style="${th2}">Horiz.<br>Path°</th>
    <th style="${th2}">Vert. Face°<br>(Dyn Loft)</th><th style="${th2}">Vert. Path°<br>(AoA)</th>
    <th style="${th2}">Vert. Plane°<br>(Swing Pln)</th></tr></thead><tbody>`;
  clubs.forEach(c=>{
    const d=(STATE.dplane&&STATE.dplane[c.id])||{};
    const vFace=d.vFace!=null?d.vFace:parseFloat(c.loft)||30;   // fallback to static loft
    const sel=c.id===window.dpVisClub?' style="background:var(--bg2)"':'';
    const inp=(field,val,ph)=>`<input class="dpl-input" id="dpl-in-${c.id}-${field}" value="${escapeHtml(val==null?'':val)}"${ph?` placeholder="${ph}"`:''} inputmode="decimal" oninput="setDplaneCell('${c.id}','${field}',this.value)">`;
    html+=`<tr${sel}>
      <td onclick="setDpVisClub('${c.id}')" title="Show this club in the 3D render" style="padding:5px 8px;white-space:nowrap;cursor:pointer"><span style="font-family:Arial,sans-serif;font-weight:800;font-size:.85rem;color:var(--ink)">${c.label}</span> <span style="font-family:ui-monospace,monospace;font-size:.56rem;color:var(--muted)">${c.loft}</span></td>
      <td>${inp('hFace',d.hFace)}</td>
      <td>${inp('hPath',d.hPath)}</td>
      <td>${inp('vFace',vFace)}</td>
      <td>${inp('aoa',d.aoa)}</td>
      <td>${inp('vPlane',d.vPlane,'~'+dpEstVPlane(c.loft))}</td>
    </tr>`;
  });
  return html+'</tbody></table></div>';
}
function setDplaneCell(id,field,value){
  if(!STATE.dplane) STATE.dplane={};
  if(!STATE.dplane[id]) STATE.dplane[id]={hFace:0,hPath:0,aoa:0};
  /* cleared cell → drop the override so the estimate/static fallback applies
     (previously a cleared Dyn Loft was stored as 0°, breaking the wedge) */
  if(String(value).trim()==='') delete STATE.dplane[id][field];
  else STATE.dplane[id][field]=parseFloat(value)||0;
  if(id===window.dpVisClub) window.dpSand=null;   // grid is authoritative → reseed the sandbox
  /* this club's stock shape now tilts its landing pattern on the Hole Overlay, so the aim
     optimiser's memo of it is stale the moment a cell here changes */
  if(typeof aimShapeReset==='function') aimShapeReset();
  if(typeof buildCourseStrategy==='function') buildCourseStrategy();
  if(typeof renderDPlaneVisual==='function') renderDPlaneVisual();
  saveState();
}

/* ---- THE D-PLANE LAB — its own top-level page (#page-dplane). One place to build and
   demonstrate ANY shot: the rotatable 3D impact-geometry render, shot presets, the
   ball-speed sandbox, and the per-club stock-shot tendencies grid. ---- */
function buildDplaneLab(){
  const wrap=document.getElementById('dplane-lab-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:0">D-Plane — Impact Geometry &amp; Ball Flight</div>
    <div class="dpl-vis-main"><div id="dplane-visual"></div></div>
    <div class="lvl-subhead" style="margin-top:16px">Stock-Shot Tendencies by Club</div>
    <div class="chain-caption" style="margin-top:4px">Each club's <strong>stock-shot</strong> impact geometry: horizontal face, horizontal path, vertical face (dyn loft), vertical path (attack angle) and vertical swing plane (degrees, left −/right +; blank plane = estimated from loft). Tap a club to load it into the lab above; typed edits save automatically.</div>
    <div class="dpl-grid-col">${buildDplaneGrid()}</div>`;
  renderDPlaneVisual();
}

/* ---- D-Plane 3D visual — rotatable orbit render of the Swing Plane,
   the D-plane, and the expected ball flight (scaled to the club's captured Bag data). ---- */
function setDpVisClub(id){ window.dpVisClub=id; window.dpStrike={th:0,hl:0}; window.dpSand=null; renderDPlaneVisual(); }
/* World-space D-plane vectors (x=lateral right, y=up, z=toward target).
   Launch uses the engine's spin-loft-keyed face fraction, matching the readout. */
function dpWorldVectors(hFace,hPath,vFace,vPath){
  const DR=Math.PI/180, L=2.5;
  const vec=(h,v,len)=>({x:Math.sin(h*DR)*len, y:Math.sin(v*DR)*len, z:Math.cos(v*DR)*Math.cos(h*DR)*len});
  const path=vec(hPath,vPath,L), face=vec(hFace,vFace,L), tgt=vec(0,0,L);
  const f=dpFaceFraction(dp3DSpinLoft(dpVDiff(vFace,vPath), dpHDiff(hFace,hPath)));
  const launch={x:path.x+f*(face.x-path.x),y:path.y+f*(face.y-path.y),z:path.z+f*(face.z-path.z)};
  let nx=path.y*face.z-path.z*face.y, ny=path.z*face.x-path.x*face.z, nz=path.x*face.y-path.y*face.x;
  const nl=Math.hypot(nx,ny,nz)||1;
  return {O:{x:0,y:0,z:0}, path, face, tgt, launch, axis:{x:nx/nl,y:ny/nl,z:nz/nl}};
}
/* Spin axis (− = left/draw, + = right/fade) → 7-bucket ball-flight category. */
function dpBallFlight(axis){
  const a=Math.abs(axis);
  if(a<1) return 'Straight';
  if(axis<0) return a<3?'Slight Draw':a<8?'Draw':'Hook';
  return a<3?'Slight Fade':a<8?'Fade':'Slice';
}
/* Orbit-camera presets (azimuth° around vertical, elevation° above the ground);
   the old fixed DTL / Face-On / Overhead views live on as snap positions. */
const DP_CAMS={
  iso: {az:34, el:22, name:'¾ View'},
  dtl: {az:0,  el:9,  name:'Down the Line'},
  face:{az:88, el:9,  name:'Face-On'},
  top: {az:0,  el:86, name:'Overhead'}
};
window.dpCam={az:DP_CAMS.iso.az, el:DP_CAMS.iso.el, zoom:1, pan:{x:0,y:0,z:0}};
/* presets re-frame the scene: rotation + pan reset, zoom kept */
function dpSetCam(key){ const v=DP_CAMS[key]; if(!v) return; window.dpCam={az:v.az,el:v.el,zoom:window.dpCam.zoom||1,pan:{x:0,y:0,z:0}}; dpRenderScene(); }
/* Screen-right R, screen-up U and toward-camera D bases from azimuth/elevation. */
function dpCamBasis(azDeg,elDeg){
  const az=azDeg*DPLANE_DEG, el=elDeg*DPLANE_DEG;
  return {
    R:{x:Math.cos(az), y:0, z:Math.sin(az)},
    U:{x:-Math.sin(el)*Math.sin(az), y:Math.cos(el), z:Math.sin(el)*Math.cos(az)},
    D:{x:Math.sin(az)*Math.cos(el), y:Math.sin(el), z:-Math.cos(az)*Math.cos(el)}
  };
}
/* Off-centre strike (dimples toward toe + / heel −, high + / low −) for gear-effect
   preview. Ephemeral by design — full-shot intent is the centre of percussion. */
function dpStrikeTxt(field,v){
  v=parseInt(v)||0;
  if(!v) return 'centre';
  return field==='th' ? Math.abs(v)+(v>0?' toe':' heel') : Math.abs(v)+(v>0?' high':' low');
}
function dpSetStrike(field,val){
  window.dpStrike=window.dpStrike||{th:0,hl:0};
  window.dpStrike[field]=parseInt(val)||0;
  const sp=document.getElementById(`dpv-strike-${field}-v`); if(sp) sp.textContent=dpStrikeTxt(field,val);
  dpRenderScene();
}
/* Project the scene through the current orbit camera and redraw the SVG. Painter's
   algorithm: ground+grid always first (nothing goes below it, camera stays above),
   then every other primitive depth-sorted by centroid distance toward the camera. */
function dpRenderScene(){
  const sceneEl=document.getElementById('dpv-scene'); if(!sceneEl) return;
  const DR=DPLANE_DEG, id=window.dpVisClub;
  const c=STATE.clubs.find(x=>x.id===id)||{}, d=(STATE.dplane&&STATE.dplane[id])||{};
  if(!window.dpSand||window.dpSand._club!==id) dpSeedSand(id);
  const o=window.dpSand;
  const hFace=o.hFace, hPath=o.hPath, vFace=o.vFace, aoa=o.aoa, bspd=Math.max(5,o.bspd);
  const staticLoft=parseFloat(c.loft)||30;
  const vPlane=d.vPlane!=null?+d.vPlane:dpEstVPlane(c.loft);
  const hPlane=dpHPlane(aoa,vPlane,hPath);
  const p=perf(id)||{};
  const r=dpSolve(hFace,hPath,vFace,aoa,p.carry||150);
  /* Gear effect from the strike preview (centre → zero shift): toe/heel tilts the
     spin axis (woods far more than irons), low adds spin / high sheds it. */
  const st=window.dpStrike||{th:0,hl:0};
  const gearAxis=dpGearAxisShift(st.th, c.type==='wood'?'wood':'iron');
  const axisEff=r.spinAxis+gearAxis;
  /* Calibrate the sim to this club's captured Bag numbers at its STORED stock
     settings, then apply those factors to whatever the sliders explore. */
  const vF0=d.vFace!=null?+d.vFace:staticLoft;
  const r0=dpSolve(+d.hFace||0,+d.hPath||0,vF0,+d.aoa||0,p.carry||150);
  const bs0=(p.bspd>0)?+p.bspd:dpEstBspd(staticLoft);
  const spin0est=dpSpinEst(bs0,r0.spinLoft);
  /* Raw capture-vs-model ratios BEFORE clamping, so a saturated clamp can be
     surfaced instead of silently absorbing a bad Bag capture (provenance ethos:
     when the data and the model disagree this hard, say so). */
  const calRaw={spin:(p.spin>0)?p.spin/spin0est:null};
  const spinCal=calRaw.spin!=null?Math.max(0.5,Math.min(1.8,calRaw.spin)):1;
  const sim0=dpFlightSim(bs0,Math.max(0.5,r0.vLaunch),0,(p.spin>0?+p.spin:spin0est),0);
  calRaw.carry=(p.carry>0)?p.carry/Math.max(5,sim0.carry):null;
  calRaw.apex=(p.ht>0)?p.ht/Math.max(3,sim0.apex):null;
  const carryCal=calRaw.carry!=null?Math.max(0.7,Math.min(1.35,calRaw.carry)):1;
  const apexCal=calRaw.apex!=null?Math.max(0.6,Math.min(1.6,calRaw.apex)):1;
  const calStrained=[
    calRaw.spin!=null&&(calRaw.spin<0.5||calRaw.spin>1.8)?'spin':null,
    calRaw.carry!=null&&(calRaw.carry<0.7||calRaw.carry>1.35)?'carry':null,
    calRaw.apex!=null&&(calRaw.apex<0.6||calRaw.apex>1.6)?'apex':null
  ].filter(Boolean);
  /* Current shot: spin from ball speed × spin loft (per-club calibrated; low strike
     adds spin, high sheds it), then the full flight from the integrator. */
  /* clamp AFTER calibration so a saturated raw estimate can't freeze the wedge range */
  const spinUsed=Math.max(200,Math.min(13500,Math.round(dpSpinEst(bspd,r.spinLoft)*spinCal*(1-0.07*st.hl))));
  const sim=dpFlightSim(bspd,Math.max(0.2,r.vLaunch),r.hLaunch,spinUsed,axisEff);
  const carryShow=sim.carry*carryCal, apexShow=sim.apex*apexCal, curveShow=sim.curve*carryCal;
  const rollYd=dpRollEst(sim.land,spinUsed,carryShow);

  const wv=dpWorldVectors(hFace,hPath,vFace,aoa);
  const cam=dpCamBasis(window.dpCam.az, window.dpCam.el);
  const pan=window.dpCam.pan||{x:0,y:0,z:0};
  /* Full-width viewer: widen the viewBox to the host's aspect (~400px tall on
     desktop) instead of scaling the 340-unit scene up — labels stay readable and
     the extra width just shows more sky/ground. Mobile keeps the 340 minimum. */
  const VH=250, hostW=sceneEl.clientWidth||340;
  const VW=Math.max(340,Math.round(VH*hostW/400));
  const CEN={x:0+pan.x,y:0.85+pan.y,z:3.0+pan.z}, SC=31*(window.dpCam.zoom||1);
  const P=pt=>({x:VW/2+((pt.x-CEN.x)*cam.R.x+(pt.y-CEN.y)*cam.R.y+(pt.z-CEN.z)*cam.R.z)*SC,
                y:VH/2-((pt.x-CEN.x)*cam.U.x+(pt.y-CEN.y)*cam.U.y+(pt.z-CEN.z)*cam.U.z)*SC});
  const dep=pt=>pt.x*cam.D.x+pt.y*cam.D.y+pt.z*cam.D.z;
  const XY=pt=>{const q=P(pt);return q.x.toFixed(1)+','+q.y.toFixed(1);};
  const line=(a,b,col,w,op,dash)=>{const qa=P(a),qb=P(b);
    return `<line x1="${qa.x.toFixed(1)}" y1="${qa.y.toFixed(1)}" x2="${qb.x.toFixed(1)}" y2="${qb.y.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${op!=null?op:1}"${dash?` stroke-dasharray="${dash}"`:''}/>`;};

  /* Frame auto-fit: carry AND most of the roll stay in frame; ydPerUnit converts
     scene units back to (calibrated) yards for the downrange grid + markers. */
  const GX=3.0, GZ0=-1.0, GZ1=7.8, zc=6.0;
  const rollM=rollYd/(1.09361*Math.max(0.2,carryCal));
  const fitZ=Math.max(3, sim.zland + rollM*0.9);
  const fscale=Math.min(zc/Math.max(3,sim.zland), 7.35/fitZ);
  const ydPerUnit=1.09361*carryCal/fscale;

  /* far layer: ground, long-drive-grid yardage lines, centre (target) line */
  let far=`<polygon points="${XY({x:-GX,y:0,z:GZ0})} ${XY({x:GX,y:0,z:GZ0})} ${XY({x:GX,y:0,z:GZ1})} ${XY({x:-GX,y:0,z:GZ1})}" fill="#8cbb6e"/>`;
  for(let gx=-3;gx<=3;gx++) far+=line({x:gx,y:0,z:GZ0},{x:gx,y:0,z:GZ1},'#7aa860',0.4,0.4);
  const stepArr=[1,2,5,10,25,50,100], maxYd=GZ1*ydPerUnit;
  const step=stepArr.find(s=>maxYd/s<=7)||100;
  for(let yd=step; yd<=maxYd; yd+=step){
    const gz=yd/ydPerUnit;
    far+=line({x:-GX,y:0,z:gz},{x:GX,y:0,z:gz},'#eef6ee',0.9,0.65);
    const gq=P({x:GX,y:0,z:gz});
    far+=`<text x="${(gq.x+3).toFixed(1)}" y="${(gq.y+2).toFixed(1)}" font-family="ui-monospace,monospace" font-size="6.5" font-weight="700" fill="#2f6a40" stroke="#fff" stroke-width="1.8" paint-order="stroke" opacity="0.9">${ydNum(yd)}${yd===step?' '+ydUnit():''}</text>`;
  }
  far+=line({x:-GX,y:0,z:0},{x:GX,y:0,z:0},'#eef6ee',0.9,0.5);            // tee line
  far+=line({x:0,y:0,z:GZ0+0.4},{x:0,y:0,z:GZ1},'#f2f7f2',1.4,0.8);       // centre / target line

  const prims=[];
  const add=(pts,svg,bias)=>{let s=0;pts.forEach(q=>{s+=dep(q);});prims.push({d:s/pts.length+(bias||0),svg});};

  /* Swing plane: base line on the ground at the hPlane azimuth, tilted vPlane° up
     toward the golfer's side (−x for RH). Contains the path vector by Law 1. */
  const hp=hPlane*DR, vp=vPlane*DR;
  const b={x:Math.sin(hp), y:0, z:Math.cos(hp)};
  const s={x:-Math.cos(vp)*Math.cos(hp), y:Math.sin(vp), z:Math.cos(vp)*Math.sin(hp)};
  const A1={x:-1.3*b.x, y:0, z:-1.3*b.z}, A2={x:2.1*b.x, y:0, z:2.1*b.z};
  const A3={x:A2.x+2.6*s.x, y:2.6*s.y, z:A2.z+2.6*s.z}, A4={x:A1.x+2.6*s.x, y:2.6*s.y, z:A1.z+2.6*s.z};
  add([A1,A2,A3,A4],
    `<polygon points="${XY(A1)} ${XY(A2)} ${XY(A3)} ${XY(A4)}" fill="#6f93b8" fill-opacity="0.17" stroke="#4a7aaa" stroke-width="1" stroke-opacity="0.75"/>`
    +line(A1,A2,'#4a7aaa',1.6,0.85));

  /* D-plane wedge + path / face vectors + spin axis */
  add([wv.O,wv.path,wv.face],
    `<polygon points="${XY(wv.O)} ${XY(wv.path)} ${XY(wv.face)}" fill="#efc81e" fill-opacity="0.55" stroke="#b8860b" stroke-width="1"/>`);
  add([wv.O,wv.path], line(wv.O,wv.path,'#c43c9e',2.4), 0.02);
  add([wv.O,wv.face], line(wv.O,wv.face,'#2a6fc4',2.4), 0.02);
  const axA={x:wv.launch.x+wv.axis.x, y:wv.launch.y+wv.axis.y, z:wv.launch.z+wv.axis.z};
  const axB={x:wv.launch.x-wv.axis.x, y:wv.launch.y-wv.axis.y, z:wv.launch.z-wv.axis.z};
  add([axA,axB], line(axB,axA,'#cc2a2a',1.9), 0.02);

  /* Ball flight — simulated points (metres) scaled by the auto-fit frame */
  const fpts=sim.pts.map(q=>({x:q.x*fscale, y:q.y*fscale, z:q.z*fscale}));
  for(let i=0;i<fpts.length-1;i++) add([fpts[i],fpts[i+1]], line(fpts[i],fpts[i+1],'#111',2.4), 0.03);
  /* rollout along the landing direction, then the resting ball */
  const la=fpts[fpts.length-1], lb=fpts[Math.max(0,fpts.length-2)];
  let dx=la.x-lb.x, dz=la.z-lb.z; const dl=Math.hypot(dx,dz)||1; dx/=dl; dz/=dl;
  const rollLen=rollM*fscale;
  const rend={x:la.x+dx*rollLen, y:0, z:la.z+dz*rollLen};
  if(rollLen>0.02) add([la,rend], line({x:la.x,y:0,z:la.z},rend,'#111',1.4,0.7,'3,2.5'), 0.03);
  add([la], `<circle cx="${P(la).x.toFixed(1)}" cy="${P(la).y.toFixed(1)}" r="2" fill="#111" opacity="0.75"/>`, 0.03);
  const rq=P(rend);
  add([rend], `<circle cx="${rq.x.toFixed(1)}" cy="${rq.y.toFixed(1)}" r="2.6" fill="#111"/>`, 0.03);

  /* landing / rest markers: carry at the landing dot; total + roll (and how far
     offline of the centre line, when it matters) at the resting ball */
  /* local short-form number (no unit); renamed off fmtYd, which is now the global unit
     formatter in physics/conditions.js and means something different */
  const dpNum=v=>{const d=ydNum(v,v<25?1:0); return ''+d;};
  const mtxt=(pt,txt,col,mdy)=>{const q=P(pt);
    return `<text x="${q.x.toFixed(1)}" y="${(q.y+mdy).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" font-weight="700" fill="${col}" stroke="#fff" stroke-width="2.2" paint-order="stroke" opacity="0.95">${txt}</text>`;};
  const offYd=rend.x*ydPerUnit, totalShow=carryShow+rollYd;
  let markers=mtxt({x:la.x,y:0,z:la.z},`carry ${dpNum(carryShow)}`,'#111',-7);
  markers+=mtxt(rend,`total ${dpNum(totalShow)} · roll ${ydNum(rollYd,1)}`,'#111',12);
  if(Math.abs(offYd)>=1) markers+=mtxt(rend,`${dpNum(Math.abs(offYd))} ${ydUnit()} ${offYd<0?'left':'right'} of line`,'#cc2a2a',21);
  const oq=P(wv.O);
  add([wv.O], `<circle cx="${oq.x.toFixed(1)}" cy="${oq.y.toFixed(1)}" r="4" fill="#fff" stroke="#333" stroke-width="1.4"/>`, 0.3);

  /* labels on top, white-haloed for readability at any camera angle; the D-plane
     wedge and spin axis carry their live numbers so slider drags read on the render */
  const lab=(pt,txt,col,ddx,ddy,anchor)=>{const q=P(pt);
    return `<text x="${(q.x+(ddx!=null?ddx:4)).toFixed(1)}" y="${(q.y+(ddy!=null?ddy:-4)).toFixed(1)}"${anchor?` text-anchor="${anchor}"`:''} font-family="ui-monospace,monospace" font-size="7.5" font-weight="700" fill="${col}" stroke="#fff" stroke-width="2.4" paint-order="stroke" opacity="0.95">${txt}</text>`;};
  const axSide=axisEff<-0.05?'L':axisEff>0.05?'R':'';
  const wedgeC={x:(wv.O.x+wv.path.x+wv.face.x)/3, y:(wv.O.y+wv.path.y+wv.face.y)/3, z:(wv.O.z+wv.path.z+wv.face.z)/3};
  let top=lab(wv.path,'path','#c43c9e')+lab(wv.face,'face','#2a6fc4')
    +lab(axA,`spin axis ${Math.abs(axisEff).toFixed(1)}°${axSide}`,'#cc2a2a')
    +lab(wedgeC,`3D spin loft ${r.spinLoft.toFixed(1)}°`,'#b8860b',0,2,'middle')
    +lab(A4,'swing plane','#4a7aaa',6,10)
    +markers;

  prims.sort((x,y)=>x.d-y.d);
  sceneEl.innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dpv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#cfe6f6"/><stop offset="100%" stop-color="#eef6fc"/></linearGradient></defs>
    <rect width="${VW}" height="${VH}" fill="url(#dpv-sky)"/>
    ${far}${prims.map(q=>q.svg).join('')}${top}
  </svg>`;

  /* live shot-info panel beside the viewer: impact block, then the simulated flight */
  const fl=dpBallFlight(axisEff);
  const side=axisEff<-0.05?'L':axisEff>0.05?'R':'';
  const ro=document.getElementById('dpv-readout');
  if(ro){
    const row=(k,v,col)=>`<div class="dpv-info-row"><span class="k">${k}</span><span class="v"${col?` style="color:${col}"`:''}>${v}</span></div>`;
    const fmt1=v=>Math.abs(v)<25?v.toFixed(1):''+Math.round(v);
    ro.innerHTML=
      `<div class="dpv-info-h">Swing Plane — Estimated</div>`
      +row('Vert. Swing Plane',vPlane.toFixed(1)+'°'+(d.vPlane!=null?'':' est'),'var(--dp-plane)')
      +row('Horiz. Swing Plane',dplFmt(hPlane)+'°','var(--dp-plane)')
      +`<div class="dpv-info-h" style="margin-top:9px">D-Plane — Impact</div>`
      +row('Horiz. Face',dplFmt(hFace)+'°','var(--dp-face)')
      +row('Horiz. Path',dplFmt(hPath)+'°','var(--dp-path)')
      +row('Vert. Face',vFace.toFixed(1)+'°','var(--dp-face)')
      +row('Vert. Path',dplFmt(aoa)+'°','var(--dp-path)')
      +row('3D Spin Loft',r.spinLoft.toFixed(1)+'°','var(--dp-loft)')
      +row('Spin Axis',Math.abs(axisEff).toFixed(1)+'°'+(side?' '+side:''),'var(--dp-axis)')
      +row('Spin (est)','~'+spinUsed.toLocaleString()+' rpm')
      +((st.th||st.hl)?row('Gear Shift',dplFmt(gearAxis)+'° axis','var(--dp-axis)'):'')
      +`<div class="dpv-info-h" style="margin-top:9px">Ball Flight — Simulated</div>`
      +row('Shape',fl,'var(--ink)')
      +row('Ball Speed',fmtMph(bspd))
      +row('Vert. Launch',r.vLaunch.toFixed(1)+'°')
      +row('Horiz. Launch',dplFmt(r.hLaunch)+'°')
      +row('Carry',fmtYd(carryShow,1))
      +row('Apex',fmtFt(apexShow))
      +row('Land Angle',Math.round(sim.land)+'°')
      +row('Finish',Math.abs(curveShow)<0.3?'on line':fmtYd(Math.abs(curveShow),1)+' '+(curveShow<0?'L':'R'))
      +row('Roll',fmtYd(rollYd,1))
      +row('Total',fmtYd(carryShow+rollYd,1))
      +(calStrained.length?`<div class="dpv-cal-warn">⚠ <b>Calibration strained</b> — this club's captured ${calStrained.join(' + ')} sit${calStrained.length>1?'':'s'} outside the model's window, so the sim is running against a saturated clamp. Re-check the Bag capture for ${c.label||'this club'}.</div>`:'');
  }
}
/* ---- Shape Sandbox: an EXPLORATION overlay seeded from the club's stored tendencies
   + captured ball speed. Sliders and presets write only the overlay — the stored
   stock numbers are untouched until "save as stock"; "revert" reseeds from stored. ---- */
function dpSeedSand(id){
  const c=STATE.clubs.find(x=>x.id===id)||{}, d=(STATE.dplane&&STATE.dplane[id])||{};
  const loft=parseFloat(c.loft)||30, p=perf(id)||{};
  window.dpSand={_club:id,
    bspd: (p.bspd>0)?+p.bspd:dpEstBspd(loft),
    hFace:+d.hFace||0, hPath:+d.hPath||0,
    vFace:d.vFace!=null?+d.vFace:loft, aoa:+d.aoa||0};
}
function dpSandFmt(field,v){
  v=parseFloat(v)||0;
  if(field==='bspd') return fmtMph(v);
  return field==='vFace'?v.toFixed(1)+'°':dplFmt(v)+'°';
}
function dpSetSand(field,val){
  const o=window.dpSand; if(!o) return;
  o[field]=parseFloat(val)||0;
  const sv=document.getElementById(`dpv-sand-${field}-v`); if(sv) sv.textContent=dpSandFmt(field,o[field]);
  dpRenderScene();
}
/* push the overlay into the slider DOM (after a preset or revert) */
function dpSandSync(){
  const o=window.dpSand; if(!o) return;
  ['bspd','hFace','hPath','vFace','aoa'].forEach(f=>{
    const inEl=document.getElementById(`dpv-sand-${f}-in`); if(inEl) inEl.value=o[f];
    const sv=document.getElementById(`dpv-sand-${f}-v`); if(sv) sv.textContent=dpSandFmt(f,o[f]);
  });
}
/* commit the overlay's four impact numbers as the club's stored stock tendency */
function dpSandSave(){
  const id=window.dpVisClub, o=window.dpSand; if(!id||!o) return;
  if(!STATE.dplane) STATE.dplane={};
  STATE.dplane[id]=Object.assign({},STATE.dplane[id],{hFace:o.hFace,hPath:o.hPath,vFace:o.vFace,aoa:o.aoa});
  saveState();
  const col=document.querySelector('.dpl-grid-col'); if(col) col.innerHTML=buildDplaneGrid();
  if(typeof buildCourseStrategy==='function') buildCourseStrategy();
  dpRenderScene();
  if(typeof toast==='function') toast('Saved as stock tendency');
}
function dpSandRevert(){ window.dpSand=null; renderDPlaneVisual(); }

/* ---- Shot presets (their own sub-page — see buildDpShots). The 9-window drill
   (Tiger's drill: low/medium/high × draw/straight/fade with one club) shifts
   vFace/aoa RELATIVE to the club's stock and sets the shape absolutely; the named
   short-game shots set vFace/aoa absolutely off the static loft AND drop ball
   speed to real short-game values so the sim shows their true trajectories.
   All load into the overlay only. ---- */
const DP_SHOTS={
  loDraw:{lbl:'Low Draw', vF:-6,aoa:-2,hF:1,hP:3.5},   loStr:{lbl:'Low',  vF:-6,aoa:-2,hF:0,hP:0},   loFade:{lbl:'Low Fade', vF:-6,aoa:-2,hF:-1,hP:-3.5},
  mdDraw:{lbl:'Draw',     vF:0, aoa:0, hF:1,hP:3.5},   mdStr:{lbl:'Stock',vF:0, aoa:0, hF:0,hP:0},   mdFade:{lbl:'Fade',     vF:0, aoa:0, hF:-1,hP:-3.5},
  hiDraw:{lbl:'High Draw',vF:5, aoa:1, hF:1,hP:3.5},   hiStr:{lbl:'High', vF:5, aoa:1, hF:0,hP:0},   hiFade:{lbl:'High Fade',vF:5, aoa:1, hF:-1,hP:-3.5},
  stinger:{lbl:'Stinger', vF:-10,aoa:-4,hF:0,hP:0,bsMult:0.97,
    desc:'Driven flight — hard deloft, ball flighted under the wind. The tenth window.'},
  bump:  {lbl:'Bump &amp; Run', vFAbs:-14,aoaAbs:-4,hF:0,hP:0, bs:20,
    desc:'Ball back, hands ahead, hard deloft — flies low, lands early and runs out like a putt.'},
  chip:  {lbl:'Chip',  vFAbs:-8,aoaAbs:-3,hF:0,hP:0, bs:24,
    desc:'Small strike with a slight deloft — a short carry over the fringe, then a predictable release.'},
  pitch: {lbl:'Pitch', vFAbs:-3,aoaAbs:-3,hF:0,hP:0, bs:40,
    desc:'Fuller motion near the club\'s loft — mostly carry, a bounce or two, then it stops.'},
  spinner:{lbl:'Spinner', vFAbs:-6,aoaAbs:-5,hF:0,hP:0, bs:47,
    desc:'Speed plus spin loft — driven low with a steep strike so it takes one hop and checks hard.'},
  flop:  {lbl:'Flop / Lob',  vFAbs:8, aoaAbs:-4,hF:3,hP:-4,bs:45,
    desc:'Face laid open, plane swung out-to-in — maximum height, minimum rollout, for short-sided misses.'},
  splash:{lbl:'Bunker Splash', vFAbs:10,aoaAbs:-7,hF:4,hP:-6,bs:26,
    desc:'Greenside sand, approximated — open face, steep entry, the sand cushions ball speed. Directional guide only.'}
};
function dpApplyPreset(key){
  const P=DP_SHOTS[key], id=window.dpVisClub; if(!P||!id) return;
  const c=STATE.clubs.find(x=>x.id===id)||{}, loft=parseFloat(c.loft)||30;
  dpSeedSand(id);                                   // presets start from stock, never stack
  const o=window.dpSand;
  if(P.bs!=null) o.bspd=P.bs; else if(P.bsMult) o.bspd=Math.round(o.bspd*P.bsMult);
  o.hFace=P.hF; o.hPath=P.hP;
  o.vFace=(P.vFAbs!=null)?loft+P.vFAbs:o.vFace+P.vF;
  o.vFace=Math.max(5,Math.min(65,o.vFace));
  o.aoa=Math.max(-8,Math.min(8,(P.aoaAbs!=null)?P.aoaAbs:o.aoa+P.aoa));
  dpSandSync(); dpRenderScene();
}
/* Apply a preset, then bring the 3D render into view to watch it fly. Presets sit on the
   D-Plane page itself now, so this scrolls rather than switching sub-tab. */
function dpLoadShot(key){
  const P=DP_SHOTS[key]; if(!P) return;
  dpApplyPreset(key);
  const vis=document.getElementById('dplane-visual');
  if(vis&&vis.scrollIntoView) vis.scrollIntoView({behavior:'smooth',block:'center'});
  if(typeof toast==='function') toast(P.lbl.replace('&amp;','&')+' loaded — see the render above');
}
/* One-line recipe summary for a short-game shot card. */
function dpShotParamsTxt(s){
  const sgn=v=>(v>=0?'+':'')+v;
  const vf=s.vFAbs!=null?'loft'+sgn(s.vFAbs)+'°':sgn(s.vF)+'° vs stock';
  const ao=s.aoaAbs!=null?sgn(s.aoaAbs)+'°':sgn(s.aoa)+'° vs stock';
  const bs=s.bs!=null?fmtMph(s.bs):(s.bsMult?Math.round(s.bsMult*100)+'% ball speed':'stock speed');
  return 'vert. face '+vf+' · vert. path '+ao+' · '+bs;
}
/* ---- SHOT PRESETS — a section of the D-Plane page (#dpshots-wrap sits inside
   #page-dplane). The 9-window drill grid plus the named short-game shots as expandable
   recipe cards. Tapping any shot loads its impact numbers into the sandbox above
   (relative to the selected club) and scrolls back to the render. ---- */
function buildDpShots(){
  const wrap=document.getElementById('dpshots-wrap'); if(!wrap) return;
  const clubs=STATE.clubs.filter(c=>c.type!=='putter');
  let id=window.dpVisClub; if(!clubs.find(c=>c.id===id)) id=(clubs.find(c=>c.id==='7i')||clubs[0]||{}).id;
  window.dpVisClub=id;
  const opts=clubs.map(x=>`<option value="${x.id}"${x.id===id?' selected':''}>${x.label} — ${x.loft}</option>`).join('');
  const presetBtn=k=>`<button type="button" class="dpv-preset-btn" onclick="dpLoadShot('${k}')">${DP_SHOTS[k].lbl}</button>`;
  const shotCard=k=>{const s=DP_SHOTS[k];
    return `<div class="dps-card" onclick="dpLoadShot('${k}')">
      <div class="dps-card-name">${s.lbl}</div>
      <div class="dps-card-desc">${s.desc||''}</div>
      <div class="dps-card-params">${dpShotParamsTxt(s)}</div>
    </div>`;};
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:22px">Shot Presets — load a shot into the sandbox above</div>
    <div class="chain-caption" style="margin-top:4px">Every preset loads its impact numbers into the <strong>sandbox above</strong> — relative to the selected club's stock tendencies — and scrolls back to the 3D render so you can see the flight. Nothing here touches your stored stock numbers until you <strong>save as stock</strong>.</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 4px">
      <label style="font-family:ui-monospace,monospace;font-size:.56rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Club</label>
      <select class="strat-select" style="max-width:150px" onchange="setDpVisClub(this.value)">${opts}</select>
    </div>
    <div class="dpv-sand">
      <div class="dpv-strike-head">9-Window Drill — full swing</div>
      <div class="dpv-strike-note" style="margin-top:2px">Tiger's window drill: nine trajectory windows with one club — low / medium / high × draw / straight / fade — plus the stinger as the bonus tenth window. Loads relative to this club's stock numbers.</div>
      <div class="dpv-preset-grid">${['hiDraw','hiStr','hiFade','mdDraw','mdStr','mdFade','loDraw','loStr','loFade'].map(presetBtn).join('')}</div>
      <div class="dpv-preset-row" style="grid-template-columns:1fr">${presetBtn('stinger')}</div>
    </div>
    <div class="dpv-sand" style="margin-top:10px">
      <div class="dpv-strike-head">Short Game — the named shots</div>
      <div class="dpv-strike-note" style="margin-top:2px">Each named shot is its own recipe of loft, attack and speed — ball speeds drop to real short-game values so the sim shows true trajectories. Best viewed with a wedge selected above.</div>
      <div class="dps-grid">${['bump','chip','pitch','spinner','flop','splash'].map(shotCard).join('')}</div>
    </div>`;
}

/* Pointer navigation on the scene container (re-bound after each host rebuild).
   Control plan (shared with the 2-D visuals via ui/panzoom.js, plus rotation):
     left-drag / one finger      → pan
     middle-drag / two fingers   → rotate (two-finger centroid; spread also zooms)
     scroll wheel / pinch        → zoom
     double-click / double-tap   → reset view */
function dpSceneDragInit(){
  const el=document.getElementById('dpv-scene'); if(!el||el._dpDrag) return; el._dpDrag=true;
  /* re-render when the host width changes (window resize, rotation, or the page
     becoming visible after a hidden rebuild) so the dynamic viewBox stays fitted */
  if(typeof ResizeObserver!=='undefined'){
    el._dpRO=new ResizeObserver(()=>{const w=el.clientWidth;if(w&&Math.abs((el._dpW||0)-w)>2){el._dpW=w;dpRenderScene();}});
    el._dpRO.observe(el);
  }
  if(!window._dpResizeHook){
    window._dpResizeHook=true;
    window.addEventListener('resize',()=>{clearTimeout(window._dpRzT);
      window._dpRzT=setTimeout(()=>{const s=document.getElementById('dpv-scene');if(s&&s.clientWidth)dpRenderScene();},120);});
  }
  const ptrs=new Map(); let px=0,py=0,pinchD=0,mode='pan';
  const zoomBy=f=>{window.dpCam.zoom=Math.max(0.5,Math.min(4,(window.dpCam.zoom||1)*f));dpRenderScene();};
  const rotate=(dx,dy)=>{
    window.dpCam.az=((window.dpCam.az-dx*0.45)+540)%360-180;
    window.dpCam.el=Math.max(3,Math.min(88,window.dpCam.el+dy*0.45));};
  const panBy=(dx,dy)=>{                                 // screen px → world offset via camera basis
    const cam=dpCamBasis(window.dpCam.az,window.dpCam.el), SC=31*(window.dpCam.zoom||1);
    const pan=window.dpCam.pan=window.dpCam.pan||{x:0,y:0,z:0};
    const cl=v=>Math.max(-6,Math.min(6,v));
    pan.x=cl(pan.x-dx/SC*cam.R.x+dy/SC*cam.U.x);
    pan.y=cl(pan.y-dx/SC*cam.R.y+dy/SC*cam.U.y);
    pan.z=cl(pan.z-dx/SC*cam.R.z+dy/SC*cam.U.z);};
  el.addEventListener('pointerdown',e=>{
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===1){px=e.clientX;py=e.clientY; mode=(e.pointerType==='mouse'&&e.button===1)?'rot':'pan';}
    else if(ptrs.size===2){const a=[...ptrs.values()];pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      px=(a[0].x+a[1].x)/2;py=(a[0].y+a[1].y)/2;}       // centroid drives two-finger rotate
    el.setPointerCapture(e.pointerId);e.preventDefault();});
  el.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId))return;
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size>=2){                                    // two fingers: rotate + pinch-zoom together
      const a=[...ptrs.values()], d2=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      const mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
      rotate(mx-px,my-py); px=mx; py=my;
      if(pinchD>0&&d2>0&&Math.abs(d2-pinchD)>0.5) zoomBy(d2/pinchD);
      pinchD=d2; dpRenderScene(); return;}
    if(mode==='rot') rotate(e.clientX-px,e.clientY-py);
    else panBy(e.clientX-px,e.clientY-py);
    px=e.clientX;py=e.clientY;dpRenderScene();});
  const end=e=>{ptrs.delete(e.pointerId);pinchD=0;
    if(ptrs.size===1){const a=[...ptrs.values()][0];px=a.x;py=a.y;mode='pan';}};  // remaining finger pans w/o a jump
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
  el.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(-e.deltaY*0.0012));},{passive:false});
  el.addEventListener('dblclick',()=>{window.dpCam={az:DP_CAMS.iso.az,el:DP_CAMS.iso.el,zoom:1,pan:{x:0,y:0,z:0}};dpRenderScene();});
}
function renderDPlaneVisual(){
  const host=document.getElementById('dplane-visual'); if(!host) return;
  const clubs=STATE.clubs.filter(c=>c.type!=='putter');
  let id=window.dpVisClub; if(!clubs.find(c=>c.id===id)) id=(clubs.find(c=>c.id==='7i')||clubs[0]||{}).id;
  window.dpVisClub=id;
  const st=window.dpStrike=window.dpStrike||{th:0,hl:0};
  if(!window.dpSand||window.dpSand._club!==id) dpSeedSand(id);
  const o=window.dpSand;
  const opts=clubs.map(x=>`<option value="${x.id}"${x.id===id?' selected':''}>${x.label} — ${x.loft}</option>`).join('');
  const camBtns=Object.keys(DP_CAMS).map(k=>`<button type="button" class="dpv-cam-btn" onclick="dpSetCam('${k}')">${DP_CAMS[k].name}</button>`).join('');
  /* Shape Sandbox rows — the exploration overlay + per-club ranges.
     Face terms in face blue, path terms in path magenta, matching the render. */
  const c=clubs.find(x=>x.id===id)||{};
  const loft=parseFloat(c.loft)||30;
  const sandRow=(field,label,col,min,max,step)=>`<div class="dpv-sand-row">
      <span class="dpv-sand-lbl" style="color:${col}">${label}</span>
      <span class="dpv-sand-val" id="dpv-sand-${field}-v">${dpSandFmt(field,o[field])}</span>
      <input type="range" id="dpv-sand-${field}-in" min="${min}" max="${max}" step="${step}" value="${o[field]}" oninput="dpSetSand('${field}',this.value)">
    </div>`;
  const strikeRow=(field,label)=>`<div class="dpv-sand-row">
      <span class="dpv-sand-lbl" style="color:var(--dp-axis)">${label}</span>
      <span class="dpv-sand-val" id="dpv-strike-${field}-v">${dpStrikeTxt(field,st[field])}</span>
      <input type="range" min="-3" max="3" step="1" value="${st[field]}" oninput="dpSetStrike('${field}',this.value)">
    </div>`;
  const sandbox=`<div class="dpv-sand">
      <div class="dpv-strike-head">Shape Sandbox — drag the impact numbers, watch the flight
        <span style="float:right;display:flex;gap:5px"><button type="button" class="dpv-sand-reset" onclick="dpSandSave()">save as stock</button><button type="button" class="dpv-sand-reset" onclick="dpSandRevert()">revert</button></span></div>
      ${sandRow('bspd','Ball Speed','var(--ink2)',5,200,1)}
      ${sandRow('hFace','Horiz. Face','var(--dp-face)',-10,10,0.1)}
      ${sandRow('hPath','Horiz. Path','var(--dp-path)',-10,10,0.1)}
      ${sandRow('vFace','Vert. Face','var(--dp-face)',5,65,0.5)}
      ${sandRow('aoa','Vert. Path','var(--dp-path)',-8,8,0.1)}
      <div class="dpv-sand-sub">
        <div class="dpv-strike-head">Strike — Gear Effect <span class="dpv-strike-cur">layered on the D-plane, not part of it</span></div>
        ${strikeRow('th','Heel ↔ Toe')}
        ${strikeRow('hl','Low ↔ High')}
      </div>
    </div>`;
  host.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <label style="font-family:ui-monospace,monospace;font-size:.56rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Club</label>
      <select class="strat-select" style="max-width:150px" onchange="setDpVisClub(this.value)">${opts}</select>
    </div>
    <div class="dpv-panel"><div class="dpv-title">Swing Plane · D-Plane · Ball Flight — drag pan · middle-drag / 2-finger rotate · scroll / pinch zoom</div>
      <div id="dpv-scene"></div></div>
    <div class="dpv-cam-row">${camBtns}</div>
    <div class="dpv-below">
      ${sandbox}
      <div class="dpv-info" id="dpv-readout"></div>
    </div>`;
  dpRenderScene();
  dpSceneDragInit();
}
function buildGearEffectL2(){
  const dToe=dpGearAxisShift(3,'wood'), iToe=dpGearAxisShift(3,'iron');
  return `<div class="lvl-subhead" style="margin-top:18px">Gear Effect — Off-Centre Contact</div>
    <div class="chain-caption" style="margin-top:4px">How strike location bends each club's flight (RH). A ~3-dimple miss shifts the spin axis ≈ <b style="color:var(--c-wood)">${Math.abs(dToe).toFixed(0)}° (driver)</b> vs ≈ <b style="color:var(--c-iron)">${Math.abs(iToe).toFixed(0)}° (iron)</b> — woods gear far more. Toe → draw/left, heel → fade/right; high → less spin + higher launch, low → more spin + lower launch. <span class="placeholder-flag">prototype</span></div>
    <div class="gear-panel">${buildGearFaceSVG()}
      <div class="nudge-row">
        <div class="nudge-cell"><div class="nudge-val" style="color:var(--c-iron)">${dToe.toFixed(0)}°</div><div class="nudge-lbl">driver toe → draw</div></div>
        <div class="nudge-cell"><div class="nudge-val" style="color:var(--c-wood)">+${Math.abs(dToe).toFixed(0)}°</div><div class="nudge-lbl">driver heel → fade</div></div>
        <div class="nudge-cell"><div class="nudge-val">±${Math.abs(iToe).toFixed(0)}°</div><div class="nudge-lbl">iron toe / heel</div></div>
      </div>
    </div>`;
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { DP_SHOTS, buildDplaneGrid, buildDplaneLab, buildDpShots, buildGearEffectL2, dpApplyPreset, dpBallFlight, dpLoadShot, dpRenderScene, dpSandFmt, dpSandRevert, dpSandSave, dpSandSync, dpSceneDragInit, dpSeedSand, dpSetCam, dpSetSand, dpSetStrike, dpShotParamsTxt, dpStrikeTxt, dpWorldVectors, dplFmt, dplaneShape, renderDPlaneVisual, setDpVisClub, setDplaneCell });
