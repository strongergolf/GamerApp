// features/markup.js — MARK UP a hole on the Plan page: yardage-book notes, the tee, and the shapes.
//
// One ✎ button on the Plan page opens a tool bar across the top of the map, with three tabs:
//   NOTES   what a golfer writes in a yardage book in a practice round: a red X where the ball must
//           never go, a line, a few words. Stored per course and hole in field units
//           (STATE.play.marks, keyed like the anchors), drawn on the Plan page and the Play map.
//   TEE     move the tee to where you play from (strategy.js: stratSetTeeAt).
//   SHAPES  fix the mapped shapes from the photo. Tap inside a green, bunker, pond or fairway and
//           the WAND grows the region of matching colour on the photo and outlines it; TRACE is
//           point-by-point for where colour is no help; ERASE removes a wrong shape. The model reads
//           these shapes for every lie, so a fixed shape fixes the strokes-gained numbers too.
//           Edited holes are the golfer's (src.shapes='user'): a map refresh carries them across.
//
// The wand reads photo pixels, which the browser allows because Esri's tiles are served with
// Access-Control-Allow-Origin: *. It redraws the area around the tap onto a canvas in field
// units, so the outline comes back in the same frame as everything else.

window.mkTool = window.mkTool || { note:'x', color:'#e53935', shape:'green', method:'wand', spread:3 };
window.mkUndo = window.mkUndo || [];
window.mkDraft = null;
const MK_COLORS = [['#e53935','Red'],['#ffffff','White'],['#ffd54f','Yellow']];
const MK_SHAPES = [['green','Green'],['fairway','Fairway'],['sand','Bunker'],['water','Water'],['trees','Trees']];
const MK_RADIUS_YD = { green:45, sand:30, water:140, fairway:220, trees:90 };   /* how far a wand fill may reach */
const MK_TOL = { green:24, sand:36, water:28, fairway:13, trees:26 };          /* colour tolerance at spread 3 */
/* how far a fill may spread SIDEWAYS from the tap (holes are drawn tee-to-green up the screen, so
   field x is across the hole). Mown fairway and the lawns beside it look alike on a photo; a
   fairway is rarely more than 60 yd wide, and a dogleg's other leg is a second tap. */
const MK_LAT_YD = { fairway:32 };

function mkS(){ return window.stratShot; }
function mkCur(){ return (typeof stratCurrent==='function') ? stratCurrent() : null; }
function mkKey(){ return (typeof stratAnchorKey==='function') ? stratAnchorKey() : null; }
function mkMarks(key, make){
  STATE.play=STATE.play||{}; const M=STATE.play.marks=STATE.play.marks||{};
  if(make && !M[key]) M[key]=[];
  return M[key]||[];
}
function mkEditing(){ const e=mkS().edit; return e==='notes'||e==='shapes'; }

/* ---------- the tool bar ---------- */
function mkOpen(tab){
  const S=mkS(); const was=S.edit;
  S.edit=tab||null; S.teeMode=(tab==='tee'); if(tab) S.pinMode=false;
  window.mkDraft=null;
  const cur=mkCur();
  if(tab==='tee' && cur && cur.hole.tee && typeof stratViewAt==='function') stratViewAt(cur.hole, cur.hole.tee.x, cur.hole.tee.y, 2.5);
  else if(was==='tee' && tab!=='tee') window.stratView={cx:null, cy:null, z:1};
  buildHoleOverlay();
}
function mkSet(k, v){ window.mkTool[k]=v; window.mkDraft=null; buildHoleOverlay(); }
function mkSpread(d){ const t=window.mkTool; t.spread=Math.max(1, Math.min(6, t.spread+d)); buildHoleOverlay(); }
function mkBarHTML(hole){
  const S=mkS(), e=S.edit; if(!e) return '';
  const T=window.mkTool;
  const tab=(k,l)=>`<button type="button" class="mk-tab${e===k?' on':''}" onclick="mkOpen('${k}')">${l}</button>`;
  const btn=(on,click,label,title)=>`<button type="button" class="mk-b${on?' on':''}" onclick="${click}"${title?` title="${title}"`:''}>${label}</button>`;
  let tools='';
  if(e==='notes'){
    tools=`<div class="mk-row">
        ${btn(T.note==='x',"mkSet('note','x')",'✕ Miss','A red X: never miss here')}
        ${btn(T.note==='line',"mkSet('note','line')",'〰 Line','Draw a line')}
        ${btn(T.note==='text',"mkSet('note','text')",'Aa Note','Tap where the note goes')}
        ${btn(T.note==='erase',"mkSet('note','erase')",'⌫','Tap a mark to remove it')}
        <span class="mk-dots">${MK_COLORS.map(([c,l])=>`<button type="button" class="mk-dot${T.color===c?' on':''}" style="background:${c}" onclick="mkSet('color','${c}')" aria-label="${l}"></button>`).join('')}</span>
      </div>`;
  } else if(e==='shapes'){
    const tracing=T.method==='trace' && window.mkDraft && window.mkDraft.kind==='trace';
    tools=`<div class="mk-row">${MK_SHAPES.map(([k,l])=>btn(T.shape===k,`mkSet('shape','${k}')`,l)).join('')}${btn(T.shape==='erase',"mkSet('shape','erase')",'⌫ Erase','Tap a shape to remove it')}</div>
      ${T.shape==='erase'?'':`<div class="mk-row">
        ${btn(T.method==='wand',"mkSet('method','wand')",'Tap to fill','Tap inside it on the photo')}
        ${btn(T.method==='trace',"mkSet('method','trace')",'Trace','Tap points around it, then Finish')}
        ${T.method==='wand'?`<span class="mk-spread">Spread <button type="button" onclick="mkSpread(-1)" aria-label="Less">−</button><b>${T.spread}</b><button type="button" onclick="mkSpread(1)" aria-label="More">+</button></span>`
          :`${btn(false,'mkTraceFinish()',tracing?`Finish (${window.mkDraft.pts.length})`:'Finish')}${tracing?btn(false,'mkTraceCancel()','Cancel'):''}`}
      </div>`}`;
  } else if(e==='tee'){
    const yours=hole.src&&hole.src.tee==='user';
    tools=`<div class="mk-row"><span class="mk-hint">Drag the tee to where you play from${yours?' · <b>yours</b>':''}</span>${yours?btn(false,'stratTeeReset()',"Map's tee"):''}</div>`;
  }
  const hint = e==='notes' ? (T.note==='line'?'Drag to draw':T.note==='erase'?'Tap a mark to remove it':'Tap the map')
             : e==='shapes' ? (T.shape==='erase'?'Tap a shape to remove it':T.method==='wand'?'Tap inside it on the photo':'Tap points around it')
             : '';
  return `<div class="ho-banner mk-bar">
      <div class="mk-row mk-tabs">${tab('notes','Notes')}${tab('tee','Tee')}${tab('shapes','Shapes')}
        <span class="mk-sp"></span>${window.mkUndo.length?btn(false,'mkUndoLast()','↶','Undo'):''}${btn(true,'mkOpen(null)','Done')}</div>
      ${tools}${hint?`<div class="mk-hint mk-hint2">${hint}</div>`:''}
    </div>`;
}

/* ---------- pointer input, from strategy.js's drag handler ---------- */
let mkLast=0;
function mkPointer(phase, p){
  const S=mkS(), cur=mkCur(); if(!cur||!p) return;
  const T=window.mkTool, key=mkKey();
  if(S.edit==='notes'){
    if(T.note==='line'){
      if(phase==='down'){ window.mkDraft={kind:'line', pts:[p]}; mkDraftPaint(); }
      else if(phase==='move' && window.mkDraft){ window.mkDraft.pts.push(p); const now=Date.now(); if(now-mkLast>30){ mkLast=now; mkDraftPaint(); } }
      else if(phase==='up' && window.mkDraft){
        const pts=mkSimplify(window.mkDraft.pts, 2); window.mkDraft=null;
        if(pts.length>=2) mkAddMark(key, {t:'line', pts:pts.map(q=>({x:Math.round(q.x), y:Math.round(q.y)})), c:T.color});
        buildHoleOverlay();
      }
      return;
    }
    if(phase!=='down' && phase!=='tap') return;
    if(T.note==='x') mkAddMark(key, {t:'x', x:Math.round(p.x), y:Math.round(p.y), c:T.color});
    else if(T.note==='text'){
      const s=(prompt('Note for this spot:')||'').trim().slice(0,60); if(!s) return;
      mkAddMark(key, {t:'text', x:Math.round(p.x), y:Math.round(p.y), s, c:T.color});
    } else if(T.note==='erase') mkEraseMark(key, p);
    buildHoleOverlay();
    return;
  }
  if(S.edit==='shapes'){
    if(phase!=='down' && phase!=='tap') return;
    if(T.shape==='erase'){ mkEraseShape(cur.hole, p); return; }
    if(T.method==='trace'){
      if(!window.mkDraft || window.mkDraft.kind!=='trace') window.mkDraft={kind:'trace', pts:[]};
      window.mkDraft.pts.push({x:Math.round(p.x), y:Math.round(p.y)});
      buildHoleOverlay(); return;
    }
    mkWandAt(cur.hole, p, T.shape);
  }
}
/* the line being drawn, straight into the SVG, without rebuilding the whole map */
function mkDraftPaint(){
  const g=document.querySelector('#strat-overlay'); if(!g||!window.mkDraft) return;
  let el=document.getElementById('mk-draft');
  if(!el){ el=document.createElementNS('http://www.w3.org/2000/svg','polyline'); el.id='mk-draft';
    el.setAttribute('fill','none'); el.setAttribute('stroke-width','3'); el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
    el.setAttribute('vector-effect','non-scaling-stroke'); g.appendChild(el); }
  el.setAttribute('stroke', window.mkTool.color);
  el.setAttribute('points', window.mkDraft.pts.map(q=>q.x.toFixed(1)+','+q.y.toFixed(1)).join(' '));
}

/* ---------- notes ---------- */
function mkAddMark(key, m){ if(!key) return; const L=mkMarks(key,true); window.mkUndo.push({kind:'marks', key, before:JSON.stringify(L)}); L.push(m); saveState(); }
function mkEraseMark(key, p){
  const L=mkMarks(key); if(!L.length) return;
  const cur=mkCur(); const ypu=cfYardsPerUnit(cur.hole)||1, lim=8/ypu;   /* within 8 yd */
  const dist=m=> m.t==='line' ? Math.min(...m.pts.map(q=>Math.hypot(q.x-p.x,q.y-p.y))) : Math.hypot(m.x-p.x, m.y-p.y);
  let best=-1, bd=Infinity; L.forEach((m,i)=>{ const d=dist(m); if(d<bd){ bd=d; best=i; } });
  if(best<0 || bd>lim*2.5) return;
  window.mkUndo.push({kind:'marks', key, before:JSON.stringify(L)});
  L.splice(best,1); saveState();
}
/* drawn on the Plan page and the Play map; k is the label scale (12px text = 30k units) */
function mkMarksSVG(hole, k){
  const c=(typeof cfCourseOf==='function')?cfCourseOf(hole):null; if(!c) return '';
  const L=(STATE.strategy&&STATE.strategy.layers)||{}; if(L.notes===false) return '';
  const M=((STATE.play||{}).marks||{})[(c.id||c.name)+'|'+(hole.num||0)]; if(!M||!M.length) return '';
  k=k>0?k:1; const NS='vector-effect="non-scaling-stroke"';
  return `<g class="mk-marks">${M.map(m=>{
    if(m.t==='x'){ const r=22*k;
      return `<g stroke-linecap="round"><path d="M${m.x-r},${m.y-r}L${m.x+r},${m.y+r}M${m.x+r},${m.y-r}L${m.x-r},${m.y+r}" stroke="rgba(0,0,0,.45)" stroke-width="6" ${NS}/>
        <path d="M${m.x-r},${m.y-r}L${m.x+r},${m.y+r}M${m.x+r},${m.y-r}L${m.x-r},${m.y+r}" stroke="${m.c}" stroke-width="3.5" ${NS}/></g>`; }
    if(m.t==='line'){ const pts=m.pts.map(q=>q.x+','+q.y).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" ${NS}/>
        <polyline points="${pts}" fill="none" stroke="${m.c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${NS}/>`; }
    if(m.t==='text') return `<text x="${m.x}" y="${m.y}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,-apple-system,'Segoe UI',Arial,sans-serif" font-weight="800"
        font-size="${(32*k).toFixed(1)}" fill="${m.c}" stroke="rgba(0,0,0,.6)" stroke-width="${(7*k).toFixed(1)}" paint-order="stroke" stroke-linejoin="round">${escapeHtml(m.s)}</text>`;
    return '';
  }).join('')}</g>`;
}
/* the trace in progress, drawn in the overlay */
function mkDraftSVG(){
  const d=window.mkDraft; if(!d||d.kind!=='trace'||!d.pts.length) return '';
  const pts=d.pts.map(q=>q.x+','+q.y).join(' ');
  return `<g><polyline points="${pts}" fill="rgba(255,255,255,.15)" stroke="#ffd54f" stroke-width="2" stroke-dasharray="6,4" vector-effect="non-scaling-stroke"/>
    ${d.pts.map(q=>`<circle cx="${q.x}" cy="${q.y}" r="${(8*(window.stratLabelK||1)).toFixed(1)}" fill="#ffd54f" stroke="#14351d" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
}

/* ---------- shapes ---------- */
function mkShapesSnapshot(h){ return JSON.stringify({green:h.green||[], fairway:h.fairway||[], fairways:h.fairways||[], hazards:h.hazards||[], src:h.src||{}}); }
function mkShapesChanged(h, before, msg){
  window.mkUndo.push({kind:'shapes', hole:h, before});
  h.src=Object.assign({}, h.src, {shapes:'user'});
  if(typeof cfPinCacheClear==='function') cfPinCacheClear();
  window.stratCacheEpoch=(window.stratCacheEpoch||0)+1;
  if(window.PM_OPT_CACHE) PM_OPT_CACHE.clear();
  saveState(); buildHoleOverlay();
  if(msg) toast(msg);
}
const mkArea=pts=>{ let a=0; for(let i=0,n=pts.length;i<n;i++){ const p=pts[i], q=pts[(i+1)%n]; a+=p.x*q.y-q.x*p.y; } return Math.abs(a)/2; };
function mkAddShape(h, type, pts){
  const before=mkShapesSnapshot(h);
  pts=pts.map(q=>({x:Math.round(q.x), y:Math.round(q.y)}));
  if(type==='green') h.green=pts;
  else if(type==='fairway'){
    /* the largest piece is THE fairway (the strategy engine reads it); the rest are pieces */
    if(!(h.fairway&&h.fairway.length>=3)) h.fairway=pts;
    else if(mkArea(pts)>mkArea(h.fairway)){ h.fairways=(h.fairways||[]).concat([h.fairway]); h.fairway=pts; }
    else h.fairways=(h.fairways||[]).concat([pts]);
  } else (h.hazards=h.hazards||[]).push({type, pts});
  const ypu=cfYardsPerUnit(h)||1, area=Math.round(mkArea(pts)*ypu*ypu);
  mkShapesChanged(h, before, `${(MK_SHAPES.find(s=>s[0]===type)||[0,type])[1]} added · ${area.toLocaleString()} sq yd`);
}
function mkEraseShape(h, p){
  const inside=pts=>pts&&pts.length>=3&&cfPointInPoly(p, pts);
  const before=mkShapesSnapshot(h);
  /* smallest first: tapping a bunker inside a fairway removes the bunker */
  const cands=[];
  (h.hazards||[]).forEach((z,i)=>{ if(inside(z.pts)) cands.push({a:mkArea(z.pts), f:()=>h.hazards.splice(i,1), l:z.type}); });
  (h.fairways||[]).forEach((f,i)=>{ if(inside(f)) cands.push({a:mkArea(f), f:()=>h.fairways.splice(i,1), l:'fairway'}); });
  if(inside(h.green)) cands.push({a:mkArea(h.green), f:()=>{ h.green=[]; }, l:'green'});
  if(inside(h.fairway)) cands.push({a:mkArea(h.fairway), f:()=>{ const F=(h.fairways||[]).slice().sort((a,b)=>mkArea(b)-mkArea(a)); h.fairway=F[0]||[]; h.fairways=F.slice(1); }, l:'fairway'});
  if(!cands.length){ toast('No shape there'); return; }
  cands.sort((a,b)=>a.a-b.a)[0].f();
  mkShapesChanged(h, before, 'Shape removed');
}
function mkTraceFinish(){
  const d=window.mkDraft, cur=mkCur(); if(!d||d.kind!=='trace'||!cur) return;
  if(d.pts.length<3){ toast('Tap at least three points around it'); return; }
  window.mkDraft=null; mkAddShape(cur.hole, window.mkTool.shape, d.pts);
}
function mkTraceCancel(){ window.mkDraft=null; buildHoleOverlay(); }
function mkUndoLast(){
  const u=window.mkUndo.pop(); if(!u) return;
  if(u.kind==='marks'){ STATE.play.marks[u.key]=JSON.parse(u.before); }
  else if(u.kind==='shapes'){ const b=JSON.parse(u.before), h=u.hole; h.green=b.green; h.fairway=b.fairway; h.fairways=b.fairways; h.hazards=b.hazards; h.src=b.src;
    if(typeof cfPinCacheClear==='function') cfPinCacheClear(); window.stratCacheEpoch=(window.stratCacheEpoch||0)+1; if(window.PM_OPT_CACHE) PM_OPT_CACHE.clear(); }
  window.mkDraft=null; saveState(); buildHoleOverlay();
}

/* ---------- the wand: grow the tapped colour on the photo, outline it ---------- */
const MK_IMG = new Map();
function mkLoadImg(url){
  if(!MK_IMG.has(url)) MK_IMG.set(url, new Promise((res,rej)=>{ const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>res(im); im.onerror=rej; im.src=url; }));
  return MK_IMG.get(url);
}
async function mkWandAt(h, p, type){
  if(typeof imgTileList!=='function' || !imgOn(h)){ toast('Tap to fill needs the photo layer on: use Trace'); return; }
  /* already that shape here: say so rather than stack a second copy on top */
  const inside=pts=>pts&&pts.length>=3&&cfPointInPoly(p, pts);
  const there = type==='fairway' ? [h.fairway].concat(h.fairways||[]).some(inside)
              : type==='green' ? false
              : (h.hazards||[]).some(z=>z.type===type&&inside(z.pts));
  if(there){ toast(`Already ${type==='sand'?'bunker':type} here: tap outside it, or Erase it first`); return; }
  const ypu=cfYardsPerUnit(h)||1, rU=(MK_RADIUS_YD[type]||60)/ypu;
  const box={x:p.x-rU, y:p.y-rU, w:2*rU, h:2*rU}, N=360, s=N/box.w;
  const tiles=imgTileList(h, box, N/2);
  let imgs; try{ imgs=await Promise.all(tiles.map(t=>mkLoadImg(t.url))); }catch(_){ toast('Could not read the photo here'); return; }
  const cv=document.createElement('canvas'); cv.width=cv.height=N; const ctx=cv.getContext('2d',{willReadFrequently:true});
  tiles.forEach((t,i)=>{ ctx.setTransform(s*t.a, s*t.b, s*t.c, s*t.d, s*(t.e-box.x), s*(t.f-box.y)); ctx.drawImage(imgs[i], 0, 0, 1.004, 1.004); });
  ctx.setTransform(1,0,0,1,0,0);
  let data; try{ data=ctx.getImageData(0,0,N,N).data; }catch(_){ toast('The photo cannot be read here: use Trace'); return; }
  const tol=(MK_TOL[type]||25)*[0,0.55,0.75,1,1.3,1.65,2.1][window.mkTool.spread||3];
  let allow=null;
  if(MK_LAT_YD[type]){ const half=MK_LAT_YD[type]/ypu*s; allow=new Uint8Array(N*N);
    for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(Math.abs(x-N/2)<=half) allow[y*N+x]=1; }
  const mask=mkGrow(data, N, N>>1, N>>1, tol, allow);
  let cnt=0; for(let i=0;i<mask.length;i++) cnt+=mask[i];
  if(cnt<25){ toast('Nothing matched there: tap nearer the middle, or more Spread'); return; }
  const ring=mkContour(mask, N); if(!ring||ring.length<4){ toast('Could not outline that: try Trace'); return; }
  const pts=mkSimplify(ring, 1.4).map(q=>({x:box.x+q.x/s, y:box.y+q.y/s}));
  if(pts.length<3){ toast('Could not outline that: try Trace'); return; }
  mkAddShape(h, type, pts);
}
/* 4-connected region growing from the seed, against the seed's 5x5 mean colour; then the
   region's holes are filled (a flag or a shadow inside a green is still green) */
function mkGrow(d, N, sx, sy, tol, allow){
  let r=0,g=0,b=0,n=0;
  for(let y=sy-2;y<=sy+2;y++) for(let x=sx-2;x<=sx+2;x++){ const i=(y*N+x)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
  r/=n; g/=n; b/=n;
  const t2=tol*tol, mask=new Uint8Array(N*N), q=new Int32Array(N*N); let qh=0, qt=0;
  const ok=k=>{ if(allow&&!allow[k]) return false; const i=k*4, dr=d[i]-r, dg=d[i+1]-g, db=d[i+2]-b; return d[i+3]>0 && (dr*dr*0.8+dg*dg*1.2+db*db)<=t2*3; };
  const s0=sy*N+sx; mask[s0]=1; q[qt++]=s0;
  while(qh<qt){ const k=q[qh++], x=k%N, y=(k/N)|0;
    if(x>0&&!mask[k-1]&&ok(k-1)){ mask[k-1]=1; q[qt++]=k-1; }
    if(x<N-1&&!mask[k+1]&&ok(k+1)){ mask[k+1]=1; q[qt++]=k+1; }
    if(y>0&&!mask[k-N]&&ok(k-N)){ mask[k-N]=1; q[qt++]=k-N; }
    if(y<N-1&&!mask[k+N]&&ok(k+N)){ mask[k+N]=1; q[qt++]=k+N; } }
  /* fill holes: everything not reachable from the border without crossing the region */
  const out=new Uint8Array(N*N); qh=0; qt=0;
  for(let i=0;i<N;i++){ [i, (N-1)*N+i, i*N, i*N+N-1].forEach(k=>{ if(!mask[k]&&!out[k]){ out[k]=1; q[qt++]=k; } }); }
  while(qh<qt){ const k=q[qh++], x=k%N, y=(k/N)|0;
    [[x>0,k-1],[x<N-1,k+1],[y>0,k-N],[y<N-1,k+N]].forEach(([c,j])=>{ if(c&&!mask[j]&&!out[j]){ out[j]=1; q[qt++]=j; } }); }
  for(let i=0;i<N*N;i++) if(!out[i]) mask[i]=1;
  return mask;
}
/* Moore-neighbour trace of the region's outer boundary, in pixel corners */
function mkContour(mask, N){
  let start=-1; for(let i=0;i<N*N;i++) if(mask[i]){ start=i; break; }
  if(start<0) return null;
  const at=(x,y)=>x>=0&&y>=0&&x<N&&y<N&&mask[y*N+x];
  const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  let x=start%N, y=(start/N)|0, d=6; const sx=x, sy=y, ring=[];
  for(let guard=0; guard<N*N*2; guard++){
    ring.push({x:x+0.5, y:y+0.5});
    let found=false;
    for(let k=0;k<8;k++){ const nd=(d+6+k)%8, nx=x+dirs[nd][0], ny=y+dirs[nd][1];
      if(at(nx,ny)){ x=nx; y=ny; d=nd; found=true; break; } }
    if(!found || (x===sx && y===sy)) break;
  }
  return ring;
}
/* Ramer–Douglas–Peucker, closed ring */
function mkSimplify(pts, eps){
  if(pts.length<4) return pts.slice();
  const dseg=(p,a,b)=>{ const dx=b.x-a.x, dy=b.y-a.y, L=dx*dx+dy*dy; if(!L) return Math.hypot(p.x-a.x,p.y-a.y);
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/L)); return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy)); };
  const rdp=(a)=>{ if(a.length<3) return a; let m=0, idx=0; for(let i=1;i<a.length-1;i++){ const d=dseg(a[i],a[0],a[a.length-1]); if(d>m){ m=d; idx=i; } }
    if(m<=eps) return [a[0], a[a.length-1]]; return rdp(a.slice(0,idx+1)).slice(0,-1).concat(rdp(a.slice(idx))); };
  const half=pts.length>>1;
  return rdp(pts.slice(0,half+1)).slice(0,-1).concat(rdp(pts.slice(half).concat([pts[0]])).slice(0,-1));
}

Object.assign(window, { MK_COLORS, MK_SHAPES, MK_RADIUS_YD, MK_TOL, MK_LAT_YD, mkS, mkCur, mkKey, mkMarks, mkEditing, mkOpen, mkSet, mkSpread, mkBarHTML,
  mkPointer, mkDraftPaint, mkAddMark, mkEraseMark, mkMarksSVG, mkDraftSVG, mkShapesSnapshot, mkShapesChanged, mkArea, mkAddShape, mkEraseShape,
  mkTraceFinish, mkTraceCancel, mkUndoLast, MK_IMG, mkLoadImg, mkWandAt, mkGrow, mkContour, mkSimplify });
