# StrongerGolf — Gamer's App

Golf performance application for serious amateurs. Built by Mark Strong (PGA of Canada professional, Surrey BC) as part of reviving the StrongerGolf brand. Planned direction: subscription SaaS competing on value, not price.

This file orients any future Claude (or human) working on the codebase. **Read it before making changes.**

## Guiding principle — exact quantification & cause-and-effect
Pursue **exact quantification and explicit cause-and-effect** as far as possible. Prefer continuous, measurable inputs (sliders in real units — inches, degrees, feet) and physically-derived outputs over coarse qualitative buckets. Every control should connect to its result through a transparent equation, and the UI should surface the causal chain (input → impact condition → outcome). This is the app's core differentiator: a launch-monitor-grounded, physics-honest tool, not a vibes-based aid. Approximations and discrete buckets get caught.

---

## What this app is

A client-side single-page web app: launch-monitor-grounded yardages, shot selection tools, a strokes-gained tracker, and a multi-level swing-diagnosis framework. No backend yet — all state persists to `localStorage`. The whole thing runs offline.

## Running it

```bash
npm install      # first time only
npm run dev      # dev server at http://localhost:5173 with hot reload
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

Deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages) or open `dist/index.html` directly.

## Project structure

```
index.html              ← HTML shell (header, nav, page containers, inline onclick handlers)
src/
  main.js               ← entry point; imports all modules in dependency order; boots the app
  ui/
    styles.css          ← all CSS (design tokens + component styles)
    nav.js              ← navigation, toast, renderAll() orchestrator, init helpers
  data/
    defaults.js         ← DEFAULT_DATA: Mark's Gamer Bag, performance, profile, swing tree
  state/
    store.js            ← load / mergeDefaults / save; STATE lives on window (see below)
  physics/
    dplane.js           ← exact impact-geometry engine (HPath, SpinAxis, 3D SpinLoft, gear) — single source of truth
    conditions.js       ← air density + carry factor from weather
    dispersion.js       ← lateral dispersion model + club colour/label helpers
    flight.js           ← partial-swing interpolation + Pitch Shot suggestion engine
    chip.js             ← chip rollout model (launch = 75% loft, archetype ratios)
    putting.js          ← AimPoint break model (pace factor, slope multipliers)
    driver.js           ← Driver Optimizer (Foresight table) + trajectory SVG
    sg.js               ← Strokes Gained (Broadie baselines, handicap-adjusted)
  features/
    bag.js              ← Stock Shots tab (ladder, dispersion SVGs)
    approach.js         ← Approach tab (Pitch Shot Options, carry matrix)
    shortgame.js        ← Short Game tab (Chip Shot Options, chip matrix)
    putting.js          ← Putting tab (AimPoint, Expected Putts)
    sg-tracking.js      ← scenario calc, round logging, SG averages/trend/sparkline
    diagnose.js         ← PRACTICE_AREAS (7 causal-chain links × assess/improve/resources slots), The Chain pages, D-Plane Lab + Shot Presets, per-club D-plane tendencies grid
    courses.js          ← Course maps: data model, vector hole renderer (renderHoleSVG), trace-on-image editor (Plan tab)
    bag-specs.js        ← My Bag specs/edit, ball listing, profile (Myself), data import/export
    club-form.js        ← add-a-club form
    charts.js           ← SG diamond chart, setPath, savePhysical
    expected-shots.js   ← shared expected-shots strip (Approach/Short Game/Putting)
```

## CRITICAL: the current module pattern (and how to evolve it)

This codebase was split out of a single 3,270-line HTML file. To make that split safe and *behaviour-preserving*, it uses a **staged-migration pattern** rather than idiomatic ES modules:

- Each module declares plain top-level `function`s and `const`s.
- At the foot of each module, `Object.assign(window, { ... })` exposes those names globally.
- Cross-module calls and the inline `onclick="..."` handlers in `index.html` resolve against those window globals.
- **Mutable shared state lives directly on `window`**: `window.STATE`, `window.adjustOn`, `window.chipSelectedIdx`. This is deliberate — a module-local `let STATE` would not propagate reassignments (from `loadState`, `importData`, `resetData`) to other modules. Do NOT change these back to module-local `let` without also adding accessor functions.

This pattern works and is verified (the app builds and runs). But it is the *starting* point, not the destination.

### Recommended migration sequence (do one step at a time, run `npm run dev` after each)

1. **Pure physics modules first** (`physics/*.js`): these have no DOM dependencies. Convert `function foo` → `export function foo`, remove the `Object.assign(window, …)` line, and add `import { foo } from '../physics/...'` everywhere it's used. Test after each module.
2. **State** (`store.js`): replace `window.STATE` with `getState()` / `setState()` exported accessors; import them where needed.
3. **Feature/render modules**: convert to exports, then replace the inline `onclick="fn()"` handlers in `index.html` with `addEventListener` wired up inside each module's build function. This is the biggest step — do it one tab at a time.
4. ~~Delete `src/ui/body.html`~~ — done (2026-07); `index.html` is the sole source of markup.
5. **Dedupe the double-defined globals**: `calcSuggestions`, `effortColor`, `interpFlight`, `wedgeModel` are defined in BOTH `features/approach.js` and `physics/flight.js`, and both `Object.assign` them onto window — last-loaded wins silently. Until deduped, any fix to one copy must be applied to both.

Run `npm run build` frequently — Vite/Rollup will flag any unresolved import immediately, which is exactly the safety net the old single-file approach lacked.

## Verifying changes

There's a `runtime_test.mjs` at the project root that loads the built bundle under jsdom, boots it, and smoke-tests the render: STATE + key globals, **every `.page` div renders non-empty**, and **every `[id$="-wrap"]` container is populated** (a short allowlist covers wraps that legitimately start empty). It exits non-zero on failure. Run after every build:

```bash
npm run build && node runtime_test.mjs
```

It catches reference errors a syntax check misses AND the silently-empty-page class of bug (a broken `getElementById`, a typo'd id, a builder that early-returns). If you add a page or a `-wrap` container, the test covers it automatically; if a new wrap legitimately renders empty at boot, add it to `EMPTY_OK` with a comment.

---

## DOMAIN MODELS — hard-won specifics. Do not approximate these.

### Trajectory model (driver / long clubs) — LOCKED
All full-swing long-club trajectory SVGs use an **asymmetric cubic bezier** reflecting air drag:
- Ascent handle = span × **0.72** (long, lazy climb under drag)
- Descent handle = span × **0.28** (short, steep descent)
- Landing angle = **42°** (Mark's measured average for his driver)
- Peak at ~**72%** of carry, NOT the midpoint
- Higher spin shortens ascent / lengthens descent slightly; lower spin the reverse
- Symmetric handles are vacuum physics and are WRONG. See `buildDriverTrajSVG` (driver.js) and `buildSideSVG` (bag.js).

### Chip rollout (chip.js)
- Launch angle = **75% of loft** (StrongerGolf rule)
- `rollout = carry × ratio × (stimp/9.5)^1.3 × slopeAdj`
- Roll ratio by archetype: Low Runner (loft 26°) 1:5 → S-wedge ~1:0.5 → X-wedge ~1:0.2. Piecewise-linear anchors in `CHIP_ROLL_ANCHORS`.
- Default stimp = **9.5** (the calibration anchor)

### Driver Optimizer (driver.js)
- Calibrated to the **Foresight Sports published reference table** (`FS_TABLE`, 12 anchors 100–210 mph ball speed). Do not substitute generic numbers.
- Launch window 10–14° across all speeds; spin window narrows as ball speed rises.
- Neutral attack angle assumed. Mark hits up on driver — a positive-AoA input is a known future enhancement that would add carry beyond model output.

### AimPoint putting (putting.js)
- `aimBreakIn(distFt, grade, stimp, slope, paceIn)` returns break relative to the **hole centre** (start line finishes in the cup centre).
- Pace factor: 12" past the hole = standard; faster pace narrows break, slower reads more.
- **Green Slope** (uphill/downhill) is a continuous slider in inches of elevation over the putt, range −60" (5 ft downhill) to +60" (5 ft uphill). `slopeFactorFromElev(elevIn)` maps it to the break multiplier via piecewise-linear anchors that preserve the old categorical values: +60→0.45, +30→0.68, 0→1.0, −30→1.42, −60→1.85 (uphill less break, downhill more).
- **Hole radius (2.125") must be deducted** for the actionable aim. Aim-outside-edge = `breakIn − 2.125` (floored at 0). **Cup Widths** = cups outside the *real* cup's edge = `(breakIn − 2.125) / 4.25`, NOT `breakIn / 4.25`.
- **Break direction** has a Straight option that zeroes the Side Slope (grade) slider, and vice versa (grade 0 ⇒ Straight).
- The SVG shows a **cone of valid speed/line combinations** (flanking paths), not a single line. UI term: "Side Slope at Point of Influence" (spell out — no "P.O.I." abbreviation).

### Dispersion (bag.js)
- Geometric: `halfAngle = atan(dispersion / carry)`.
- Dual confidence intervals: **90% CI** (`getDispersion`) and **68% CI** = 90% × 0.608.
- Overhead overlay: fairway background for loft ≤ 23° (D/F/H/U), green ellipse + landing-zone ellipse for loft > 23° (irons/wedges). Labels read "X L/R", not "±X".

### Strokes Gained (sg.js, sg-tracking.js)
- Broadie strokes-remaining baselines per lie (fairway/rough/sand/green), handicap-adjusted via `srForPlayer(lie, dist, hcp)`.
- SG diamond: 4 axes (OTT / APP / ATG / PUTT). Round log uses a vertical scorecard (holes as rows). Summary shows trend arrows vs 5-round average + gross sparkline.
- **Round baselines → "my actual"**: `effHcpForLie(lie)` (sg.js) maps a typical-round stat to a per-category effective handicap (green←putts/round, fairway←GIR%, atg←up&down% then scoring avg), reusing `srForPlayer`. Fills the previously-empty "my actual" column in the expected-shots strip (expected-shots.js). Baselines live in `STATE.profile` (scoringAvg, goalHcp, firPct, girPct, puttsRound, upDownPct), entered in Locker Room → Myself → Typical Round Baselines.
- **Scoring benchmarks** (`scoringBenchmarkHtml`, in L1 Assess): avg score ≈ par(72) + hcp + 2.5; shows scratch / you / goal-hcp on a track + strokes-to-goal.
- **Measured-vs-ideal** uses `metricGoal(label,unit,path,ideal)` (diagnose.js). Live in: L4 force-plate weights, L4 kinematic peaks (410/552/1100/1479 °/s), and the D-plane grid's Ideal-AoA column (`idealAoA(club)`: driver +4, wood −1, hybrid −2, irons −3→−4.5 by loft, wedge −5).
- **Gapping** (`buildGapping`, bag.js → My Bag): consecutive carry gaps; flags >15 yd (gap) / <8 yd (overlap).
- **SG diamond goal ring** (`buildSGDiamond`, charts.js): dashed green polygon at target SG ≈ −goalHcp/4 per category.

### Later-batch features (rough; connectivity to be refined)
- **Per-club miss tendency** (`buildMissBlock`/`setMiss`, bag.js → club detail): dir / curve / heel-toe / low-high selects → `STATE.missTendency[clubId]`. `missNote()` gives a live gear-effect read. NOT yet wired into dispersion/gear-effect/D-plane (intended next).
- **Skills Tests** (`skills.js` → The Chain → **1 Score → Assess**, rendered into `#tests-wrap` by `buildChainLevel(1)`): wedge-ladder (proximity→0–100) + driver (carry+offline→0–100) tests, scored & stored in `STATE.skillsTests`, per-type trend sparkline.
- **Handicap trend** (`hcpTrendHtml`/`logHcpSnapshot`, bag-specs.js → Myself): manual snapshots → `STATE.hcpHistory` + sparkline; latest snapshot updates `profile.handicap`.
- **Home setup** (profile fields homeCourse/usualTee/homeStimp): saving homeStimp seeds `STATE.stimp` (Putting/Approach).
- **Coach Mode**: static placeholder card in Myself (multi-locker future; `profile.coachMode` reserved).
- New STATE slices in defaults.js + merged in store.js mergeDefaults: `missTendency {}`, `skillsTests []`, `hcpHistory []`.

### Distance Dialler / Pitch Shot Options (flight.js)
- 3-tier sort: closest anchor → fuller swing → effort nearest 87%.
- Upper window bound = anchor × **1.04**.
- Dedup by **club+swing pair**, then a second pass to one option per club. (Keying dedup on anchor-carry alone was a bug — it wrongly dropped valid alternatives.)

## Branding
- Colours: Green `#00853F`, Navy `#0C2340`, Pink `#F4C2C2` (pale; interactive pink `#d96070`).
- Club types: wood `#d96070`, iron `#1a5aaa`, wedge `#00853F`, putter `#6b7280`.
- Fonts: Arial family throughout — `"Arial Narrow", Arial, sans-serif` for display, `Arial` for body, `ui-monospace` for labels.
- Wordmark: "Stronger" green + "Golf" pink; trajectory arc above in pink. Tagline "Club, Shot & Swing Data".

## Naming conventions (preserve exactly)
Mark uses specific teaching language. Keep these strings verbatim: "Side Slope at Point of Influence", "Chip Shot Options", "Pitch Shot Options", "Expected Putts Calculator". Terminology: **Swing Plane** (not "Impact Plane"), **Vert. Face / Vert. Path** (not TrackMan's Dynamic Loft / Attack Angle), always **"3D Spin Loft"** (TrackMan's Spin Loft is 2D-only).

Nav (five main groups, 2026-07): **Play** (Stock Shots / Approach / Short Game / Putting) · **D-Plane Lab** (`dplane` group: The Lab `page-dplane` + Shot Presets `page-dpshots`) · **The Chain** (`diagnose` group: chain map `page-chain` + one page per level `page-ch1`…`page-ch7`; the 7 causal-chain links live in `PRACTICE_AREAS` in diagnose.js, each exposing `assess`/`improve`/`resources` render slots; `buildChainLanding` renders the map, `buildChainLevel(n)` renders a level with Assess / Practice / Resources pills; Skills Tests fold into 1 Score → Assess; the Definitions `<details class="defs-dropdown" id="ch2-defs">` lives on the 2 Ball Flight page, shown only on its Resources pill) · **Gameplan** (`gameplan` group, single page — Pre-Round course strategy & tracking, Pre-Shot, Post-Shot, Post-Round) · **Locker Room** (`setup` group: My Bag `specs` / Myself `profile` / My App `reference` — Data export/import/reset + the Data Provenance legend). Content deep-links reach main groups positionally (`document.querySelectorAll('.ngroup')[1]` = D-Plane Lab) — audit these before reordering main tabs.

## Data provenance (standard practice)
Every data point is one of four states; label them (sometimes visibly, via `sgProv(kind)` / `SG_PROV` in `ui/brand.js`) so trust is explicit:
- **Captured** — measured by a device (launch monitor, GPS, putt timer).
- **Verified** — calculated *directly from Captured* data (trustworthy).
- **Input** — typed in by the user (specs, baselines, typical-round stats).
- **Presumed** — assumed / interviewed / app default — NOT measured.
Calculations inherit the **weakest** provenance of their inputs (`sgProvOf(...kinds)`): anything derived from Input or Presumed stays Input/Presumed and must NOT get a Verified label; only all-Captured maths earns Verified. Interviewed answers (e.g. a future "enter your full-bag dispersion to unlock course strategy" flow) are **Presumed**, not Captured. Legend lives on My App Settings. Per-field source tracking (a `source` tag on stored data) is the rollout path — apply labels as that lands.

## Working style
Mark describes changes in plain golf terms and reviews each revision closely — he catches calibration drift and regressions quickly. Match real-world reference data (Foresight table, measured landing angles, stimp 9.5); approximations get caught. Keep responses precise.

## Known future work
- Cloud sync + auth (Supabase suggested) — currently the single biggest gap; data lives in one browser only.
- D-plane 3-view rendering (Overhead / Down-the-Line / Side Profile) — framework/placeholders exist in diagnose.js L2.
- Positive-AoA input for Driver Optimizer.
- Launch-monitor CSV import.
- Course management (My Courses tab — currently "coming soon").
- Practice log tied to a block/random framework.
