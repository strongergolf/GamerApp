// BALL-FLIGHT MODEL — validation against measured tour data.
// Boots the built bundle under jsdom and checks physics/trajectory.js against TrackMan's
// published PGA Tour averages: twelve clubs, each a measured (ball speed, launch, spin) and
// the carry it produced. Run after touching trajectory.js:
//     npm run build && node trajectory_validation.mjs
// Fails if mean absolute carry error exceeds 3 yd or any club is out by more than 8.
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

/* club, ball speed mph, launch deg, spin rpm, carry yd, apex ft, land deg */
const TM=[['Driver',167,10.9,2686,275,102,38],['3 wood',158,9.2,3655,243,95,43],['5 wood',152,9.4,4350,230,96,44],
['Hybrid',146,10.2,4437,225,93,45],['3 iron',142,10.4,4630,212,92,46],['4 iron',137,11.0,4836,203,93,46],
['5 iron',132,12.1,5361,194,94,47],['6 iron',127,14.1,6231,183,96,48],['7 iron',120,16.3,7097,172,96,49],
['8 iron',115,18.1,7998,160,95,50],['9 iron',109,20.4,8647,148,93,51],['PW',102,24.2,9304,136,90,52]];

let sum=0, worst=0, worstClub='';
console.log('club       ball  launch   spin |  carry  model   diff |  apex model |  land model');
for(const [name,b,l,s,carry,apex,land] of TM){
  const f=window.ballFlight(b,l,s);
  const d=f.carry-carry; sum+=Math.abs(d);
  if(Math.abs(d)>worst){ worst=Math.abs(d); worstClub=name; }
  console.log(name.padEnd(10), String(b).padStart(4), String(l).padStart(7), String(s).padStart(6), '|',
    String(carry).padStart(6), f.carry.toFixed(1).padStart(6), d.toFixed(1).padStart(6), '|',
    String(apex).padStart(5), f.apexFt.toFixed(0).padStart(5), '|', String(land).padStart(5), f.landAngle.toFixed(0).padStart(5));
}
const mae=sum/TM.length;
console.log(`\ncarry MAE ${mae.toFixed(2)} yd · worst ${worst.toFixed(1)} yd (${worstClub})`);

/* the solvers must invert the model: feed a carry back in and get the input out again */
const rt=[];
for(const [name,b,l,s,carry] of TM){
  const spin=window.solveSpinForCarry(b,l,carry);
  const bs=window.solveBallSpeedForCarry(l,s,carry);
  if(spin!=null) rt.push(Math.abs(window.ballCarry(b,l,spin)-carry));
  if(bs!=null) rt.push(Math.abs(window.ballCarry(bs,l,s)-carry));
}
const rtMax=rt.length?Math.max(...rt):0;
console.log(`solvers: ${rt.length} inversions, worst carry residual ${rtMax.toFixed(2)} yd`);

const fail = mae>3 || worst>8 || rtMax>1;
console.log(fail ? 'TRAJECTORY VALIDATION: FAIL' : 'TRAJECTORY VALIDATION: PASS');
process.exit(fail?1:0);
