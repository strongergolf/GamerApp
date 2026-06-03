# StrongerGolf — Gamer's App

Golf performance application for serious amateurs. Launch-monitor-grounded yardages,
shot selection tools, strokes-gained tracking, and a multi-level swing-diagnosis framework.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build & deploy

```bash
npm run build    # → dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages), or open
`dist/index.html` directly. The app is fully client-side and works offline;
all data persists to the browser's localStorage.

## Working on the code

**Read `CLAUDE.md` first.** It documents the architecture, the staged-migration
module pattern, and — critically — the domain models (trajectory physics, chip
rollout, AimPoint, driver optimizer calibration) that must not be approximated.

## Verify a change

```bash
npm run build && node runtime_test.mjs
```
