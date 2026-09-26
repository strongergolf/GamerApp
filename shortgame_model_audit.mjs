// SHORT GAME SETUP MODEL — audit harness.
// Boots the built bundle under jsdom and prints what every setup option claims to do to the
// shot, plus the dial's output for a handful of named setups. Run it after touching
// physics/shortgame-vars.js or physics/chip.js:
//     npm run build && node shortgame_model_audit.mjs
//
// What to check in the output (these are the invariants the model is built on):
//   * shaftPos/sfwd  (+3° forward lean)  → dEffLoft −3.00. Forward lean REMOVES loft.
//   * every ballPos  → dSpinLoft 0.00, dSpin% 0.00, dSpeed% 0.00. Ball position moves the
//     shaft lean and the attack angle by the same amount, so it changes trajectory only.
//   * face/*         → dLoft ≈ rot×cos(lie) ≈ 0.44×rot, and aim moves left by ≈ rot.
//   * spine/*        → lean and path move 1:1 (it is a low-point shift like ball position).
//   * absBounce falls with forward lean and rises with an open face.
import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync('dist/index.html','utf8');
const dom = new JSDOM(html, { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/' });
const { window } = dom;
global.window = window; global.document = window.document;
global.localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;}, removeItem(k){delete this._d[k];} };
const js = fs.readdirSync('dist/assets').filter(f=>f.startsWith('index-')&&f.endsWith('.js')).map(f=>'dist/assets/'+f)[0];
new window.Function(fs.readFileSync(js,'utf8')).call(window);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
const W = window;
const f2 = n => (n==null||isNaN(n)) ? '    — ' : (n>=0?'+':'')+n.toFixed(2).padStart(6);
console.log('standard chip:', W.sgRefDelivered().toFixed(1)+'° delivered,', W.sgRefSpinLoft().toFixed(1)+'° spin loft');
console.log('\nvariable/option                dEffLoft dLaunch dSpin%  dSpeed%  dSpinLoft  aim   |absLean absPath absBounce');
for(const v of W.sgVarList()){
  for(const o of v.opts){
    W.resetSgVars(); W.sgSel()[v.key]=o.id;
    const n = W.sgNet(), a=n.abs;
    const aim = -n.dFaceRight;
    console.log(`${(v.key+'/'+o.id+(o.id===v.def?' (def)':'')).padEnd(29)} ${f2(n.dEffLoft)} ${f2(n.dLaunch)} ${f2(n.dSpinPct)} ${f2(n.dSpeedPct)} ${f2(n.dSpinLoft)} ${f2(aim)} |${f2(a.horizLean)} ${f2(a.vertPath)} ${f2(a.bounce)}`);
  }
}
W.resetSgVars();
console.log('\nG wedge (51°), 20 yd total — dial output by setup:');
const show=(lbl,fn)=>{ W.resetSgVars(); fn(); const d=W.sgEffLoftDelta(), mL=51+d, n=W.sgNet();
  const carry=W.chipCarryForTotal(20,mL,9.5,0);
  const launch=W.chipLaunchRaw(51)*W.sgLaunchRatio();
  const spin=Math.round(W.chipSpin(carry,51)*W.sgSpinMult()/50)*50;
  console.log(`  ${lbl.padEnd(24)} delivered ${W.sgDelivered(51).toFixed(1)}°  spinLoft ${W.sgSpinLoftFor(51).toFixed(1)}°  launch ${launch.toFixed(1)}°  spin ${spin}  carry ${carry.toFixed(1)} roll ${(20-carry).toFixed(1)}`); };
show('standard', ()=>{});
show('ball back', ()=>W.sgSel().ballPos='back');
show('ball forward', ()=>W.sgSel().ballPos='forward');
show('shaft well forward', ()=>W.sgSel().shaftPos='wfwd');
show('face way open', ()=>W.sgSel().face='wayopen');
show('bump&run (back+wfwd)', ()=>{W.sgSel().ballPos='back';W.sgSel().shaftPos='wfwd';});
show('flop (fwd+open+back sh)', ()=>{W.sgSel().ballPos='forward';W.sgSel().face='wayopen';W.sgSel().shaftPos='back';});
W.resetSgVars();
