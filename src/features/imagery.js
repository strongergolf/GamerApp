// features/imagery.js — AERIAL IMAGERY under the hole: Esri World Imagery, drawn in the hole's own frame.
//
// A hole is drawn in a field frame turned so tee-to-green runs up the screen (courses.js, hole.geo).
// Imagery comes as Web Mercator tiles, north up. Each tile is placed by mapping three of its
// corners (lat/lon) into the field frame and drawing the tile with that affine transform. Over a
// tile ~100 m across, Mercator and the hole's local projection agree to well under a pixel, so
// three corners are exact enough. The vector shapes stay on top as faint outlines: distances,
// lies and strokes gained still come from them, the photo is what you look at.
//
// THE KEY. Esri World Imagery needs an API key with the Basemaps privilege. A browser map key is
// meant to sit in a web app, locked to the app's addresses by its referrer list, so the app's key
// lives in the Vercel project (VITE_ESRI_API_KEY, built into the bundle) and works on every
// device. A key pasted in Settings on a device overrides it there.
//
// Attribution is required on every map that shows it: "Powered by Esri" and the imagery sources.

const IMG_KEY_LS = 'sg_imagery_key';
const IMG_URL = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={k}';
const IMG_ZMIN = 15, IMG_ZMAX = 19, IMG_MAX_TILES = 72;
const IMG_ATTR = 'Powered by Esri · Esri, Maxar, Earthstar Geographics, and the GIS User Community';

function imgAppKey(){ try{ return (import.meta.env && import.meta.env.VITE_ESRI_API_KEY) || ''; }catch(_){ return ''; } }
function imgDeviceKey(){ try{ return localStorage.getItem(IMG_KEY_LS)||''; }catch(_){ return ''; } }
function imgKey(){ return imgDeviceKey() || imgAppKey(); }
/* whether a hole gets a photo: a key, a georeferenced hole, and the Photo layer on */
function imgOn(hole){
  if(!hole || !hole.geo || !imgKey() && !window.sgImageryUrlOverride) return false;
  const L=(STATE.strategy||{}).layers||{};
  return L.photo!==false;
}
function imgTileUrl(z,x,y){
  const t=window.sgImageryUrlOverride || IMG_URL;
  return t.replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{k}',encodeURIComponent(imgKey()));
}
/* Web Mercator tile maths */
const imgLon2X=(lon,z)=>(lon+180)/360*Math.pow(2,z);
const imgLat2Y=(lat,z)=>{ const r=lat*Math.PI/180; return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z); };
const imgX2Lon=(x,z)=>x/Math.pow(2,z)*360-180;
const imgY2Lat=(y,z)=>{ const n=Math.PI-2*Math.PI*y/Math.pow(2,z); return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))); };

/* The tiles under the visible part of the hole, as SVG <image>s in field units.
   vb: the viewBox in field units; pxW: how many screen pixels wide it is drawn. */
function imgTilesSVG(hole, vb, pxW){
  if(!imgOn(hole)) return '';
  const g=hole.geo;
  const corners=[[vb.x,vb.y],[vb.x+vb.w,vb.y],[vb.x,vb.y+vb.h],[vb.x+vb.w,vb.y+vb.h]].map(([x,y])=>cfFieldToLatLon(hole,{x,y})).filter(Boolean);
  if(corners.length<4) return '';
  const lats=corners.map(c=>c.lat), lons=corners.map(c=>c.lon);
  const la0=Math.min(...lats), la1=Math.max(...lats), lo0=Math.min(...lons), lo1=Math.max(...lons);
  /* resolution: screen metres per pixel, sharpened for high-density screens */
  const dpr=Math.min(2, window.devicePixelRatio||1);
  const mpp=(vb.w/g.s)/Math.max(1,(pxW||400)*dpr);
  const lat=(la0+la1)/2;
  let z=Math.ceil(Math.log2(156543.03392*Math.cos(lat*Math.PI/180)/mpp));
  z=Math.max(IMG_ZMIN, Math.min(IMG_ZMAX, z));
  let x0,x1,y0,y1;
  for(;;){
    x0=Math.floor(imgLon2X(lo0,z)); x1=Math.floor(imgLon2X(lo1,z));
    y0=Math.floor(imgLat2Y(la1,z)); y1=Math.floor(imgLat2Y(la0,z));
    if((x1-x0+1)*(y1-y0+1)<=IMG_MAX_TILES || z<=IMG_ZMIN) break;
    z--;
  }
  let s='';
  for(let ty=y0; ty<=y1; ty++) for(let tx=x0; tx<=x1; tx++){
    const nw=cfLatLonToField(hole, imgY2Lat(ty,z), imgX2Lon(tx,z)),
          ne=cfLatLonToField(hole, imgY2Lat(ty,z), imgX2Lon(tx+1,z)),
          sw=cfLatLonToField(hole, imgY2Lat(ty+1,z), imgX2Lon(tx,z));
    if(!nw||!ne||!sw) continue;
    /* (0,0)->NW, (1,0)->NE, (0,1)->SW; a hair over 1 so neighbouring tiles never show a seam */
    const a=ne.x-nw.x, b=ne.y-nw.y, c=sw.x-nw.x, d=sw.y-nw.y;
    s+=`<image href="${imgTileUrl(z,tx,ty)}" x="0" y="0" width="1.004" height="1.004" preserveAspectRatio="none" transform="matrix(${a.toFixed(3)} ${b.toFixed(3)} ${c.toFixed(3)} ${d.toFixed(3)} ${nw.x.toFixed(2)} ${nw.y.toFixed(2)})"/>`;
  }
  return `<g class="img-tiles">${s}</g>`;
}
function imgAttrHTML(hole){ return imgOn(hole) ? `<div class="img-attr">${IMG_ATTR}</div>` : ''; }

/* ---------- Settings → The App: Map imagery ---------- */
function buildImagery(){
  const w=document.getElementById('imagery-wrap'); if(!w) return;
  const dev=imgDeviceKey(), app=imgAppKey();
  const status = dev ? 'On · using the key saved on this device'
               : app ? 'On · using the app’s key'
               : 'Off · no key yet';
  w.innerHTML=`<div class="profile-card img-card">
      <h3>Map imagery</h3>
      <p class="set-sub">Aerial photos under every georeferenced hole, on the Plan page and the Play map: Esri World Imagery. The mapped shapes stay on top as outlines.</p>
      <div class="img-status${dev||app?' on':''}">${status}</div>
      <div class="img-row">
        <input type="password" id="img-key" class="cf-name" placeholder="${dev?'Saved on this device':'Paste a key to use on this device only (optional)'}" autocomplete="off" spellcheck="false">
        <button type="button" class="btn" onclick="imgSaveKey()">Save</button>
        ${dev?`<button type="button" class="btn" onclick="imgClearKey()">Remove</button>`:''}
        <button type="button" class="btn" onclick="imgTest()">Test</button>
      </div>
      <div id="img-test" class="img-test"></div>
    </div>`;
}
function imgSaveKey(){
  const v=((document.getElementById('img-key')||{}).value||'').trim();
  if(!v){ toast('Paste the key first'); return; }
  try{ localStorage.setItem(IMG_KEY_LS, v); }catch(_){ toast('This browser would not save it'); return; }
  buildImagery(); imgRefresh(); imgTest();
}
function imgClearKey(){ try{ localStorage.removeItem(IMG_KEY_LS); }catch(_){} buildImagery(); imgRefresh(); }
function imgRefresh(){ if(typeof buildHoleOverlay==='function') buildHoleOverlay(); if(typeof pmIsOpen==='function'&&pmIsOpen()&&typeof pmRenderBody==='function') pmRenderBody(); }
/* one tile over the first mapped course: loads = the key works from this address */
function imgTest(){
  const out=document.getElementById('img-test'); if(!out) return;
  if(!imgKey()&&!window.sgImageryUrlOverride){ out.textContent='No key to test.'; return; }
  const c=(STATE.courses||[]).find(x=>(x.holes||[]).some(h=>h.geo)); const h=c&&c.holes.find(x=>x.geo);
  const lat=h?h.geo.lat0:49.2827, lon=h?h.geo.lon0:-123.1207, z=17;
  const url=imgTileUrl(z, Math.floor(imgLon2X(lon,z)), Math.floor(imgLat2Y(lat,z)));
  out.textContent='Testing…'; out.className='img-test';
  const im=new Image();
  im.onload=()=>{ out.className='img-test ok'; out.innerHTML=`<img src="${url}" alt="" width="96" height="96"> Imagery loads${c?` · ${escapeHtml(c.name)}`:''}.`; };
  im.onerror=()=>{ out.className='img-test bad'; out.textContent='The key was refused. Check it has the Basemaps privilege, and that this address is in its referrer list.'; };
  im.src=url;
}

Object.assign(window, { IMG_KEY_LS, IMG_URL, IMG_ZMIN, IMG_ZMAX, IMG_MAX_TILES, IMG_ATTR, imgAppKey, imgDeviceKey, imgKey, imgOn, imgTileUrl,
  imgLon2X, imgLat2Y, imgX2Lon, imgY2Lat, imgTilesSVG, imgAttrHTML, buildImagery, imgSaveKey, imgClearKey, imgRefresh, imgTest });
