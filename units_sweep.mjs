// Renders every page in METRIC and reports any imperial unit still showing.
// This is the whole verification for the units pass: I cannot eyeball 150 sites, but the DOM
// can be swept exhaustively. Run: node _units_sweep.mjs [--verbose]
import { JSDOM } from 'jsdom';
import fs from 'fs';
const VERBOSE=process.argv.includes('--verbose');
const html=fs.readFileSync('dist/index.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/'});
const {window}=dom;
global.window=window; global.document=window.document;
global.localStorage={_d:{},getItem(k){return this._d[k]||null;},setItem(k,v){this._d[k]=v;},removeItem(k){delete this._d[k];}};
window.requestAnimationFrame=cb=>setTimeout(cb,0);
const js='dist/assets/'+fs.readdirSync('dist/assets').filter(f=>f.startsWith('index-')&&f.endsWith('.js'))[0];
new window.Function(fs.readFileSync(js,'utf8')).call(window);
const W=window;

/* a course so the Gameplan surfaces have something to render */
const W2=39, hole=n=>({num:n,par:4,yards:420,scaleYpu:0.38,bg:null,tee:{x:500,y:1300},pin:{x:500,y:200},
  green:[{x:450,y:150},{x:560,y:140},{x:570,y:250},{x:450,y:260}],
  fairway:[{x:500-W2,y:1150},{x:500+W2,y:1150},{x:340+W2,y:350},{x:340-W2,y:350}],
  hazards:[{type:'sand',pts:[{x:600,y:520},{x:670,y:520},{x:670,y:600},{x:600,y:600}]}]});
W.STATE.courses=[{id:'van',name:'Vancouver Golf Club',holes:[hole(1),hole(2)]}];
W.STATE.play={anchors:{},sel:null};
W.stratSel={cIdx:0,hIdx:0}; W.stratShot={shotNum:1,lines:{S:[]},active:'S'}; W.stratSelRestored=false;

/* Units that must NOT survive a switch to metric. `ft` and `feet` are checked separately
   because green speed legitimately stays in feet (a Stimpmeter reading is in feet
   worldwide) and club length stays in inches — those are allow-listed by context below. */
const IMPERIAL=/\b(yds?|yards?|mph)\b/i;
const FEET=/\b(ft|feet)\b/i;
/* Text that legitimately keeps an imperial unit. Keep this list SHORT and justified. */
const ALLOW=[
  /stimp/i,                    // Stimpmeter readings are in feet everywhere
  /green speed/i,
  /length|shaft|grip|lie\b/i,  // club specs: inches / degrees, universal
  /inch/i,
  /°F · ft · yd|°C · m · m/,   // the unit switch NAMES both systems; it must show both
  // "feet" as a body part or an idiom, not a unit of distance
  /few feet in front/i, /hips and feet/i, /feet pre-set/i, /ball-above-feet/i, /on your feet/i
];
const allowed=t=>ALLOW.some(re=>re.test(t));

const PAGES=[...W.document.querySelectorAll('.page')].map(p=>p.id.replace(/^page-/,''));
function renderAll(){
  PAGES.forEach(id=>{ try{ W.showPage(id); }catch(e){} });
  /* open every collapsible so hidden text is swept too */
  W.document.querySelectorAll('details').forEach(d=>{ d.open=true; });
  try{ W.refreshAll(); }catch(e){}
  W.document.querySelectorAll('details').forEach(d=>{ d.open=true; });
}

function sweep(){
  const hits=[];
  PAGES.forEach(id=>{
    const pg=W.document.getElementById('page-'+id); if(!pg) return;
    const walk=W.document.createTreeWalker(pg, 4 /* TEXT_NODE */);
    let n;
    while((n=walk.nextNode())){
      const t=(n.nodeValue||'').replace(/\s+/g,' ').trim();
      if(!t) continue;
      const imp=IMPERIAL.test(t), feet=FEET.test(t);
      if(!imp && !feet) continue;
      if(allowed(t)) continue;
      /* where is it? nearest element with a class or id, for a usable report */
      let el=n.parentElement, where='';
      while(el&&el!==pg){ if(el.id||el.className){ where=(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.split(/\s+/)[0]:''); break; } el=el.parentElement; }
      hits.push({page:id, where, text:t.slice(0,90), kind:imp?'imperial':'feet'});
    }
    /* attribute values too — placeholders and titles carry units */
    pg.querySelectorAll('[placeholder],[title]').forEach(e=>{
      [e.getAttribute('placeholder'),e.getAttribute('title')].forEach(v=>{
        if(!v) return; const t=v.replace(/\s+/g,' ').trim();
        if((IMPERIAL.test(t)||FEET.test(t)) && !allowed(t))
          hits.push({page:id, where:'@attr '+(e.id||e.className||e.tagName), text:t.slice(0,90), kind:'attr'});
      });
    });
  });
  return hits;
}

W.setUnits('metric');
renderAll();
const hits=sweep();
const byPage={};
hits.forEach(h=>{ (byPage[h.page]=byPage[h.page]||[]).push(h); });
const pages=Object.keys(byPage).sort((a,b)=>byPage[b].length-byPage[a].length);
console.log(`\nMETRIC SWEEP — ${hits.length} imperial leak${hits.length===1?'':'s'} across ${pages.length} page(s)\n`);
pages.forEach(p=>{
  console.log(`  ${p}  (${byPage[p].length})`);
  const seen=new Set();
  byPage[p].forEach(h=>{
    const key=h.where+'|'+h.text;
    if(seen.has(key)&&!VERBOSE) return; seen.add(key);
    console.log(`      ${h.where.padEnd(26)} ${h.text}`);
  });
});
W.setUnits('imperial');
console.log(hits.length?`\n${hits.length} to fix.`:'\nCLEAN — no imperial units survive the switch.');
process.exit(0);
