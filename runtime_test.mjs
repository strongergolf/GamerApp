// Boots the built bundle (dist/) under jsdom and smoke-tests the render:
//   1. STATE + key window globals exist
//   2. every .page div renders non-empty text
//   3. every [id$="-wrap"] container is populated (EMPTY_OK covers legit boot-empty wraps)
// Exits non-zero on any failure, so `npm run build && node runtime_test.mjs` gates properly.
// Catches the silently-empty-page class of bug (typo'd id, curly-quote attribute,
// builder early-return) that a syntax check and a plain boot check both miss.
import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('dist/index.html','utf8');
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;}, removeItem(k){delete this._d[k];} };

// Wraps that legitimately render empty at boot (filled on interaction / not yet live).
// Add new entries WITH a comment saying why.
const EMPTY_OK = new Set([
]);

const js = fs.readdirSync('dist/assets').filter(f=>f.startsWith('index-')&&f.endsWith('.js')).map(f=>'dist/assets/'+f)[0];
const code = fs.readFileSync(js,'utf8');

const failures = [];
try {
  const fn = new window.Function(code);
  fn.call(window);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // 1. globals
  if(!window.STATE) failures.push('window.STATE not loaded');
  if(!(window.STATE?.clubs?.length > 0)) failures.push('STATE.clubs is empty');
  for(const f of ['renderAll','buildLadder','calcSuggestions','buildChainLanding','buildChainLevel','renderDPlaneVisual'])
    if(typeof window[f] !== 'function') failures.push(`missing window global ${f}()`);

  // 2. every page renders something
  const pages = [...window.document.querySelectorAll('.page')];
  if(pages.length < 10) failures.push(`only ${pages.length} .page divs found — nav structure broken?`);
  for(const pg of pages){
    const text = pg.textContent.replace(/\s+/g,' ').trim();
    if(text.length < 30) failures.push(`page #${pg.id} rendered empty (${text.length} chars of text)`);
  }

  // 3. every JS-rendered wrap container is populated
  for(const w of window.document.querySelectorAll('[id$="-wrap"]')){
    if(EMPTY_OK.has(w.id)) continue;
    if(!w.innerHTML.trim()) failures.push(`wrap #${w.id} is empty — its builder didn't run or didn't find it`);
  }
} catch(e){
  failures.push('bundle threw during boot: ' + e.message);
  console.log(e.stack?.split('\n').slice(0,4).join('\n'));
}

if(failures.length){
  console.log('RUNTIME TEST: FAIL');
  for(const f of failures) console.log('  - ' + f);
  process.exit(1);
}
const nPages = window.document.querySelectorAll('.page').length;
const nWraps = window.document.querySelectorAll('[id$="-wrap"]').length;
console.log(`RUNTIME TEST: PASS — ${nPages} pages and ${nWraps} wrap containers rendered, ${window.STATE.clubs.length} clubs`);
process.exit(0);
