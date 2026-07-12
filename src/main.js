/* ============================================================
   StrongerGolf — Gamer's App
   Entry point. Imports every module in dependency order.

   ARCHITECTURE NOTE (staged migration):
   During the move from the original single-file app, each module
   attaches its top-level declarations to `window` (see the
   Object.assign(window, {...}) at the foot of each file). This lets
   the existing inline onclick handlers in index.html and the dense
   cross-module function calls keep working unchanged.

   The next refactoring step (do this in Claude Code, one module at a
   time, running `npm run dev` to verify after each) is to replace the
   window-globals with explicit `export`/`import` statements and remove
   the inline onclick handlers in favour of addEventListener. See
   CLAUDE.md for the recommended sequence.
   ============================================================ */

import './data/defaults.js';
import './state/store.js';

import './ui/brand.js';
import './ui/panzoom.js';

import './physics/conditions.js';
import './physics/dplane.js';
import './physics/dispersion.js';
import './physics/sg.js';
import './physics/flight.js';
import './physics/chip.js';
import './physics/shortgame-vars.js';
import './physics/putting.js';
import './physics/driver.js';

import './features/bag.js';
import './features/approach.js';
import './features/sg-tracking.js';
import './features/diagnose.js';
import './features/courses.js';
import './features/planshot.js';
import './features/effyards.js';
import './features/print.js';
import './features/bag-specs.js';
import './features/shortgame.js';
import './features/putting.js';
import './features/club-form.js';
import './features/charts.js';
import './features/expected-shots.js';
import './features/skills.js';

import './ui/nav.js';

/* Boot — mirrors the original init sequence (loadState → renderAll → initConditions → initCalc). */
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderAll();
  initConditions();
  if (typeof initCalc === 'function') initCalc();
});
