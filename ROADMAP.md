# StrongerGolf — Build Roadmap

Derived from Mark's ball-flight research (impact geometry / D-plane) and the Broadie
strokes-gained framework. Sequenced so each step feeds the next.

## ① Ball-flight exactness pass  *(in progress)*
Single source of truth: `src/physics/dplane.js` implementing the confirmed laws:
- `HPath = HPlane − VPath/tan(VPlane)`  (and the inverse "know any 3 of 4")
- `SpinAxis = atan(HDiff / VDiff)`
- `3D SpinLoft = √(VDiff² + HDiff²)`
- `HLaunch = (1−f)·HPath + f·HFace`,  f ≈ .75 (.80 driver / .65 wedge), keyed to spin loft
- Gear effect: axis shift ≈ ±16° driver / ±6° iron per 3-dimple offset (toe −, heel +)

Consumers repointed at the module: **Shot Shaper** (Approach), **D-Plane Tendencies grid**
(Practice), **gear-effect panel** (Stock Shots). Curve-in-yards is the one calibratable knob.

## ② Course maps + data model
Client-side, offline **trace-on-image hole editor** (Broadie's Golfmetrics method):
import a satellite screenshot as a *temporary* backdrop → calibrate scale (2 points, known
distance) → trace tee / fairway / green / hazards as polygons → store as vectors; discard
backdrop. Render holes as styled vector graphics (no licensed imagery shipped).
- Data model: `STATE.courses[].holes[] = {num, par, scale, tee, pin, green[], fairway[], hazards[]}`
- Accelerator (later): OpenStreetMap Overpass auto-import of golf=green/fairway/bunker/tee
  polygons (free, ODbL + attribution).

## ③ Dispersion-ellipse + EV-aim overlays  (Plan tab)
- Dispersion as an **ellipse** (distance ≠ direction error, ~3:1 short shots), shifted/
  rotated by the club's stock shape (D-plane) and gear skew.
- **Expected-value aim point:** integrate the ellipse over hole regions, weight each by its
  fractional par (Broadie), sweep the aim, pick min expected strokes. "Aim X right — OOB left."
- Stock-shape-aware: favour the curve that works away from trouble.

## Independent tracks (slot in anytime)
- **④ Scoring/benchmarking (Broadie):** consistency metric (awful shots vs `A = 0.24·S − 17.1`),
  skill-group benchmarking, long-game-dominates emphasis in the SG diamond.
- **⑤ Putting:** slope-value scale align, green-speed→break, double-break reads; putting
  make-% benchmarks + low-side-miss insight.
- **⑥ Smaller:** club-design effects (lie/adjustable weights → gear) in My Bag; condition
  notes; brand arc → real trajectory shape.

## Branding note
Palette going forward: **blue, green, pink.** Header ball-flight arc to be regenerated from
the app's locked trajectory model (0.72 ascent / 0.28 descent / 42° landing) — "eventually."

## Architecture constraints
Client-side, offline, `localStorage`, staged-module pattern (window globals +
`Object.assign(window, …)`). Research corpus lives in gitignored `research/` (local only).
