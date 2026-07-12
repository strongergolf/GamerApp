// ui/panzoom.js — shared pan/zoom for 2-D SVG visuals, opt-in via a data-pz
// attribute on the <svg>. Same control plan as the D-plane 3-D camera, minus
// rotation (nothing to rotate in a flat view):
//   drag / one finger      → pan (once zoomed in; at 1× the page scrolls as normal)
//   scroll wheel / pinch   → zoom, anchored at the cursor / pinch midpoint
//   double-click / -tap    → reset to the natural fit
// One document-level delegated handler set — no per-render wiring; a re-render
// replaces the element, which deliberately resets that view to its natural fit.
// Interactive children keep working: anything inside .aim-group or [data-pz-skip]
// is left alone so e.g. the dispersion aim dot still drags.

const PZ_MAX = 8;
const pzState = new WeakMap();   // svg -> {ox,oy,ow,oh, x,y,w,h, s, ptrs:Map, pinchD}

function pzGet(svg){
  let st = pzState.get(svg);
  if(!st){
    const vb = (svg.getAttribute('viewBox')||'0 0 100 100').trim().split(/[\s,]+/).map(Number);
    st = {ox:vb[0], oy:vb[1], ow:vb[2], oh:vb[3], x:vb[0], y:vb[1], w:vb[2], h:vb[3], s:1, ptrs:new Map(), pinchD:0};
    pzState.set(svg, st);
  }
  return st;
}
function pzApply(svg, st){
  st.x = Math.max(st.ox, Math.min(st.ox+st.ow-st.w, st.x));
  st.y = Math.max(st.oy, Math.min(st.oy+st.oh-st.h, st.y));
  svg.setAttribute('viewBox', `${st.x.toFixed(2)} ${st.y.toFixed(2)} ${st.w.toFixed(2)} ${st.h.toFixed(2)}`);
  /* zoomed → capture all touches for panning; 1× → let the page scroll over it */
  svg.style.touchAction = st.s>1.01 ? 'none' : 'pan-y';
  svg.style.cursor = st.s>1.01 ? 'grab' : '';
}
function pzClientToVB(svg, st, cx, cy){
  const r = svg.getBoundingClientRect();
  return {x: st.x + (cx-r.left)/r.width*st.w, y: st.y + (cy-r.top)/r.height*st.h};
}
/* zoom by factor f about the client-space anchor point (cursor / pinch midpoint) */
function pzZoomAt(svg, st, clientX, clientY, f){
  const r = svg.getBoundingClientRect();
  if(r.width<2 || r.height<2) return;                      // hidden / unlaid-out → no-op
  const s2 = Math.max(1, Math.min(PZ_MAX, st.s*f));
  if(Math.abs(s2-st.s)<1e-4) return;
  const p = pzClientToVB(svg, st, clientX, clientY);
  const w2 = st.ow/s2, h2 = st.oh/s2;
  st.x = p.x - (p.x-st.x)*(w2/st.w);
  st.y = p.y - (p.y-st.y)*(h2/st.h);
  st.w = w2; st.h = h2; st.s = s2;
  pzApply(svg, st);
}
function pzTargetSvg(e){
  const svg = e.target && e.target.closest ? e.target.closest('svg[data-pz]') : null;
  if(!svg) return null;
  if(e.target.closest && e.target.closest('.aim-group,[data-pz-skip]')) return null;
  return svg;
}

document.addEventListener('pointerdown', e=>{
  const svg = pzTargetSvg(e); if(!svg) return;
  if(e.pointerType==='mouse' && e.button===2) return;      // leave the context menu alone
  const st = pzGet(svg);
  st.ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(st.ptrs.size===2){
    const a=[...st.ptrs.values()];
    st.pinchD = Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y);
  }
  try{ svg.setPointerCapture(e.pointerId); }catch(_){}
  if(e.pointerType==='mouse') e.preventDefault();          // no text selection while panning
});
document.addEventListener('pointermove', e=>{
  const svg = e.target && e.target.closest ? e.target.closest('svg[data-pz]') : null;
  if(!svg) return;
  const st = pzState.get(svg); if(!st || !st.ptrs.has(e.pointerId)) return;
  const prev = st.ptrs.get(e.pointerId);
  st.ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  const r = svg.getBoundingClientRect();
  if(st.ptrs.size>=2){                                     // pinch: zoom about the midpoint
    const a=[...st.ptrs.values()], d2=Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y);
    if(st.pinchD>0 && d2>0) pzZoomAt(svg, st, (a[0].x+a[1].x)/2, (a[0].y+a[1].y)/2, d2/st.pinchD);
    st.pinchD = d2; return;
  }
  if(st.s<=1.01) return;                                   // 1×: nothing to pan, page scroll wins
  st.x -= (e.clientX-prev.x)/r.width*st.w;
  st.y -= (e.clientY-prev.y)/r.height*st.h;
  pzApply(svg, st);
});
const pzEnd = e=>{
  const svg = e.target && e.target.closest ? e.target.closest('svg[data-pz]') : null;
  if(!svg) return;
  const st = pzState.get(svg); if(!st) return;
  st.ptrs.delete(e.pointerId); st.pinchD = 0;
};
document.addEventListener('pointerup', pzEnd);
document.addEventListener('pointercancel', pzEnd);
document.addEventListener('wheel', e=>{
  const svg = pzTargetSvg(e); if(!svg) return;
  e.preventDefault();
  pzZoomAt(svg, pzGet(svg), e.clientX, e.clientY, Math.exp(-e.deltaY*0.0012));
}, {passive:false});
document.addEventListener('dblclick', e=>{
  const svg = pzTargetSvg(e); if(!svg) return;
  const st = pzGet(svg);
  st.x=st.ox; st.y=st.oy; st.w=st.ow; st.h=st.oh; st.s=1;
  pzApply(svg, st);
});
