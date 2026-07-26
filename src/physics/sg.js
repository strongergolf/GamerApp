// Strokes Gained — Broadie strokes-remaining baselines, handicap-adjusted.

/* ============================================================
/* ============================================================
   SCORING — STROKES GAINED TRACKER + SCENARIO CALCULATOR
   ============================================================ */

/* Strokes remaining table (scratch baseline, from Broadie).
   Fairway/rough/sand: yards. Green: feet.

   RECALIBRATED 2026-07. The previous fairway/rough/sand values were understated by roughly
   0.3–0.4 strokes, which was provable from the app's own two tables without any outside
   data: "expected from X yards" = 1 shot + putts, so reading the leftover putts back through
   the GREEN table said what proximity the fairway table was implicitly claiming. It claimed
   inside 3 ft from 50 yd, 6 ft from 100 and 12 ft from 150 — proximities nobody achieves.
   The consequence was app-wide: every expected-strokes number read optimistic, and approach
   strokes-gained came out systematically negative because the baseline was unreachable.

   These are the PGA Tour benchmark values. NOTE: reconstructed from the published figures
   rather than transcribed from the book — the shape and magnitude are well established
   (fairway ≈ 2.80 at 100 yd, ≈ 2.98 at 160, ≈ 3.19 at 200) but Mark should check them
   against his copy of Every Shot Counts before they are treated as final.

   Entries beyond ~300 yd (fairway) and ~260 (rough) are EXTRAPOLATED along the established
   slope, not published values. Without them both tables clamped at their last entry, which
   made every distance past it score identically — on a 601-yard hole the optimiser saw no
   difference between laying up 47 yards and hitting driver, because both landed on the
   plateau, and picked arbitrarily. A sloped extrapolation is plainly better than a flat
   line here, but treat the far end as indicative. */
const SR = {
  fairway:[[10,2.18],[20,2.40],[30,2.52],[40,2.60],[50,2.66],[60,2.70],[80,2.75],[100,2.80],
           [120,2.85],[140,2.91],[160,2.98],[180,3.08],[200,3.19],[220,3.32],[240,3.45],
           [260,3.58],[280,3.70],[300,3.82],[340,4.00],[380,4.16],[420,4.30],[500,4.55]],
  rough:  [[10,2.34],[20,2.59],[30,2.70],[40,2.78],[50,2.84],[60,2.91],[80,2.99],[100,3.05],
           [120,3.11],[140,3.17],[160,3.25],[180,3.35],[200,3.45],[220,3.57],[240,3.70],
           [260,3.83],[300,4.05],[350,4.28],[420,4.55],[500,4.80]],
  sand:   [[10,2.43],[20,2.53],[30,2.66],[40,2.82],[50,2.92],[60,3.15],[80,3.27],[100,3.36]],
  green:  [[3,1.20],[5,1.35],[8,1.56],[10,1.65],[15,1.81],[20,1.92],[25,2.02],[30,2.11],[40,2.25],[50,2.37],[60,2.50],[80,2.63]],
  atg:    [[5,1.97],[10,2.07],[15,2.15],[20,2.22],[30,2.34],[40,2.46],[55,2.58]],
  /* TEE — expected strokes to hole out from the TEE by hole length (yards), scratch.
     The fairway/rough tables stop at 300/250 yd and clamp, so using them from the tee of a
     full-length hole reported ~3.4 strokes to play a 442-yard hole and made every good
     drive read as LOSING half a shot. A tee shot also has advantages those tables do not
     model (teed ball, driver, a fairway to aim at), so it needs its own baseline.
     Anchored to familiar scratch outcomes: ~3.0 on a 150-yd par 3, ~4.05 on a 400-yd par 4,
     ~4.5 on a 500-yd par 5. PRESUMED — replace with measured tee data when it exists. */
  tee:    [[100,2.80],[150,2.98],[200,3.20],[250,3.45],[300,3.71],[350,3.88],[400,4.05],
           [450,4.25],[500,4.48],[550,4.75],[600,5.02]]
};
function srInterp(lie,dist){
  const t=SR[lie]; if(!t) return null;
  if(dist<=t[0][0]) return t[0][1];
  if(dist>=t[t.length-1][0]) return t[t.length-1][1];
  for(let i=0;i<t.length-1;i++){
    if(dist>=t[i][0]&&dist<=t[i+1][0]){
      const f=(dist-t[i][0])/(t[i+1][0]-t[i][0]);
      return t[i][1]+f*(t[i+1][1]-t[i][1]);
    }
  }
  return null;
}
function parseHcp(h){
  const s=String(h||'0').trim();
  if(s.startsWith('+')) return -parseFloat(s.slice(1))||0;
  return parseFloat(s)||0;
}
function srForPlayer(lie,dist,hcp){
  const scratch=srInterp(lie,dist);
  if(scratch==null) return null;
  /* linear adjustment: each hcp point adds 1.2% of (sr-1) over scratch */
  return scratch + (hcp*0.012)*(scratch-1);
}

/* Effective handicap implied by a single round-baseline stat, anchored to
   reference values (scratch / mid / high) and clamped. Used to compute the
   "my actual" expected-strokes column from the player's typical-round numbers,
   reusing the same srForPlayer adjustment as the scratch/hcp columns.
   Anchors (scratch → ~bogey): GIR 66%→25%, putts/rd 29.5→34, U&D 60%→25%,
   scoring avg ≈ par + handicap. */
function effHcpForLie(lie){
  const pf=STATE.profile||{};
  const num=v=>{ if(v===''||v==null) return null; const n=parseFloat(v); return isNaN(n)?null:n; };
  const clamp=h=>Math.max(-6,Math.min(40,h));
  if(lie==='green'){
    const putts=num(pf.puttsRound); if(putts==null) return null;
    return clamp((putts-29.5)*4.44);                 // 29.5→0, 34→~20
  }
  if(lie==='fairway'){                                // approach skill ← GIR
    const gir=num(pf.girPct); if(gir==null) return null;
    return clamp((0.66-gir/100)*43.5);               // 66%→0, 25%→~18
  }
  if(lie==='atg'){                                    // short game ← up&down, else scoring avg
    const ud=num(pf.upDownPct);
    if(ud!=null) return clamp((0.60-ud/100)*51.4);   // 60%→0, 25%→~18
    const sa=num(pf.scoringAvg); if(sa!=null) return clamp((sa-72)*0.93);
    return null;
  }
  return null;
}

/* Re-render the scenario output inside the open L1 card */


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { SR, parseHcp, srForPlayer, srInterp, effHcpForLie });
