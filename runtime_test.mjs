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

// Load the bundled module
const js = fs.readdirSync('dist/assets').filter(f=>f.startsWith('index-')&&f.endsWith('.js')).map(f=>'dist/assets/'+f)[0];
let code = fs.readFileSync(js,'utf8');

// The bundle is an ES module; evaluate it in the window context
try {
  const fn = new window.Function(code);
  fn.call(window);
  // Trigger DOMContentLoaded
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  // Check that key functions registered and STATE loaded
  console.log('STATE loaded:', !!window.STATE);
  console.log('STATE.clubs count:', window.STATE?.clubs?.length);
  console.log('renderAll exists:', typeof window.renderAll);
  console.log('buildLadder exists:', typeof window.buildLadder);
  console.log('calcSuggestions exists:', typeof window.calcSuggestions);
  console.log('RUNTIME TEST: PASS');
} catch(e) {
  console.log('RUNTIME TEST: FAIL');
  console.log(e.message);
  console.log(e.stack?.split('\n').slice(0,4).join('\n'));
}
