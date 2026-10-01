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
  /* GREEN — RECALIBRATED 2026-09. The 2026-07 pass fixed fairway/rough/sand to the PGA Tour
     benchmark but left the green table on its old, more pessimistic curve, so putting was the
     one lie measured against a different standard than everything it feeds.
     It read 1.20 from 3 feet. A scratch golfer holes better than nine in ten from there, so
     the honest number is 1.05, and the error ran the whole length of the curve — ~0.15 long
     at the short end, ~0.30 long on lags. Every close proximity in the games, every SG-putt
     figure and every green distance in the strategy engine inherited it.
     Cross-checked against make percentage, which is the same fact stated the other way:
     E(d) = 1 + (1−p(d))·E(leave). PUTT_MAKE_ANCHORS moved with this table so the two models
     agree — they disagreed by 7 points at 3 ft before.
     Also extended DOWN to 1 ft: the table used to clamp at its first entry, so a tap-in from
     a foot scored identically to a 3-footer, which the proximity games score directly.
     Reconstructed from the published tour figures, like the other lies — worth checking
     against Every Shot Counts before treating as final. */
  green:  [[1,1.001],[2,1.01],[3,1.05],[4,1.14],[5,1.23],[6,1.34],[8,1.50],[10,1.61],
           [15,1.78],[20,1.87],[25,1.94],[30,2.00],[40,2.09],[50,2.17],[60,2.23],
           [80,2.33],[100,2.40]],
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
/* RECOVERY — a ball more than 30 yards offline: trees, fescue, the next fairway. Broadie
   tracks recovery as its own category and it sits meaningfully worse than rough, because the
   next shot usually cannot advance to the green at all. Modelled as a fixed offset ON TOP of
   rough rather than as a table of its own, deliberately: a table would look measured, and
   this number is not. PRESUMED — replace with a real curve when there is recovery data.
   Used by the Driver game to score a wild drive against a fairway one. */
const SR_RECOVERY_OVER_ROUGH = 0.60;
function srInterp(lie,dist){
  if(lie==='recovery'){ const r=srInterp('rough',dist); return r==null?null:r+SR_RECOVERY_OVER_ROUGH; }
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
/* ============================================================
   HOW CARRY SCALES WITH SPEED  \u2014  the app's one distance-scaling law

   Carry does NOT scale linearly with ball speed, and several parts of this app used to
   assume it did. A ball launched 10% slower does not fly 10% shorter: it loses the speed
   AND spends less time aloft, so the loss compounds. Over the range a golfer actually
   covers \u2014 a partial swing, or one player's speed against another's \u2014 the relation is a
   power law, carry = k * ballSpeed^CARRY_SPEED_EXP.

   The exponent is FITTED FROM THIS BAG rather than borrowed: a log-log regression of carry
   against ball speed over Mark's 13 clubs gives 1.36 for the whole bag, 1.28 for irons and
   wedges, 1.52 for the woods. 1.35 is the whole-bag figure and the one used here. It is a
   local fit across lofts, not a same-club speed sweep, so treat it as the right order rather
   than a precise constant \u2014 but it is unambiguously above 1, which is the thing that matters,
   because every linear use of it erred in the same direction: flattering slow speeds.

   Cross-check on the same data: smash factor (ball/club) reads D 1.50, 7i 1.32, 9i 1.26,
   PW 1.18 against Trackman tour averages of 1.49, 1.33, 1.28, 1.23 \u2014 close enough that the
   speed numbers feeding this fit are sound — including the wedges, whose apparently low
   smash turns out to be exactly what their loft predicts (see expectedSmash). */
const CARRY_SPEED_EXP = 1.35;
/* carry ratio -> the ball-speed ratio that produced it */
function speedRatioForCarry(carryRatio){
  const r = parseFloat(carryRatio);
  if(!(r > 0)) return null;
  return Math.pow(r, 1 / CARRY_SPEED_EXP);
}
/* ball-speed ratio -> the carry ratio it produces */
function carryRatioForSpeed(speedRatio){
  const r = parseFloat(speedRatio);
  if(!(r > 0)) return null;
  return Math.pow(r, CARRY_SPEED_EXP);
}
/* EXPECTED SMASH FACTOR, BY LOFT.

   This replaces a flat floor of 0.95, which was wrong. That number treated a lob wedge like a
   driver and duly flagged the X's 0.82 as impossible \u2014 when 0.82 is close to exactly what a
   65-degree club should return.

   The reason is the one Mark gave: only the component of the strike NORMAL to the face drives
   the ball, and the more loft the club has the more glancing the blow, so ball speed falls away
   as the cosine of the delivered loft while club speed does not. Delivered loft is the stamped
   loft less the forward shaft lean a full swing carries, about 6 degrees.

     smash \u2248 SMASH_K * cos(loft - SMASH_LEAN)

   Checked against every club in this bag, and it is not a loose fit: mean absolute error 0.029,
   worst case 0.065, over 13 clubs from an 8-degree driver to a 65-degree wedge.
     D 1.50 vs 1.53   7i 1.32 vs 1.34   9i 1.26 vs 1.22
     P 1.18 vs 1.16   S 0.99 vs 0.98    X 0.82 vs 0.79
   So a smash warning is only meaningful as a departure from the value this club's own loft
   predicts, which is what smashOffBy reports. */
const SMASH_K = 1.53;
const SMASH_LEAN = 6;
const SMASH_TOL = 0.12;        /* how far from the prediction is worth mentioning */
function expectedSmash(loftDeg){
  const L = parseFloat(loftDeg);
  if(!isFinite(L)) return null;
  return SMASH_K * Math.cos(Math.max(0, Math.min(80, L - SMASH_LEAN)) * Math.PI / 180);
}
/* Signed difference between a club's stored smash and what its loft predicts; null when
   either speed is missing or the gap is inside tolerance. */
function smashOffBy(bspd, cspd, loftDeg){
  const b = parseFloat(bspd), c = parseFloat(cspd), e = expectedSmash(loftDeg);
  if(!(b > 0) || !(c > 0) || e == null) return null;
  const d = (b / c) - e;
  return Math.abs(d) < SMASH_TOL ? null : d;
}
function effHcpForLie(lie){
  const pf=STATE.profile||{};
  const num=v=>{ if(v===''||v==null) return null; const n=parseFloat(v); return isNaN(n)?null:n; };
  const clamp=h=>Math.max(-6,Math.min(40,h));
  /* The golfer's own index is the FALLBACK, not a null. This used to return null for tee,
     rough and sand under any profile, and for the other three whenever the profile fields
     were blank — which they ship blank — so the "my actual" half of every Shots Expected
     strip was permanently empty and the Hole Overlay, which models the player from the
     handicap, disagreed with it. One player, one definition: the per-category numbers refine
     the index where the golfer has entered them, and stand in for it where they have not. */
  const own=clamp(parseHcp((pf.handicap==null||pf.handicap==='')?0:pf.handicap));
  if(lie==='green'){
    const putts=num(pf.puttsRound);
    return putts==null ? own : clamp((putts-29.5)*4.44);      // 29.5→0, 34→~20
  }
  if(lie==='fairway'){                                // approach skill ← GIR
    const gir=num(pf.girPct);
    return gir==null ? own : clamp((0.66-gir/100)*43.5);      // 66%→0, 25%→~18
  }
  if(lie==='atg'){                                    // short game ← up&down, else scoring avg
    const ud=num(pf.upDownPct);
    if(ud!=null) return clamp((0.60-ud/100)*51.4);            // 60%→0, 25%→~18
    const sa=num(pf.scoringAvg);
    if(sa!=null) return clamp((sa-72)*0.93);
    return own;
  }
  if(lie==='tee'){                                    // driving skill <- fairways hit
    const fir=num(pf.firPct);
    return fir==null ? own : clamp((0.62-fir/100)*46.0);      // 62%->0, 25%->~17
  }
  return own;                                          // rough, sand — no per-category input exists
}
/* ============================================================
   THE PLAYER — one definition, used by every surface that models the golfer

   Skill depends on the KIND OF SHOT being played next, not on the lie it is played from.
   A GIR percentage describes approach play whether the ball sits in fairway or rough; the
   lie's own cost is already in the baseline tables srForPlayer reads. So:
       on the green              → putting skill        (← putts per round)
       on the tee                → driving skill        (← fairways hit)
       within ATG_NEAR_YD of pin → around-the-green     (← up-and-down %)
       beyond ATG_FAR_YD         → approach skill       (← GIR %)
   Between the two around-the-green bounds the two skills are BLENDED rather than switched.
   A hard step at 30 yd would hand the aim-point optimiser a cliff in expected strokes that
   has nothing to do with golf, and it would aim at the cliff.
   Every category falls back to the golfer's own index when its stat is blank (effHcpForLie),
   so with an empty profile all four agree and nothing changes.

   This used to be split: Shots Expected strips priced "me" per category, while the Hole
   Overlay priced every position on the raw index. They agreed only while the profile stats
   were blank — the first GIR % typed in would have put them a tenth of a stroke apart on
   the same shot. */
const ATG_NEAR_YD = 30;
const ATG_FAR_YD = 50;
const PLAYER = 'player';      /* sentinel accepted wherever a handicap is: "the golfer, per shot" */
function playerHcpFor(lie, distYd){
  if(lie==='green') return effHcpForLie('green');
  if(lie==='tee')   return effHcpForLie('tee');
  if(lie==='atg' && distYd==null) return effHcpForLie('atg');
  const d=parseFloat(distYd);
  if(!isFinite(d)) return effHcpForLie('fairway');
  if(d<=ATG_NEAR_YD) return effHcpForLie('atg');
  if(d>=ATG_FAR_YD)  return effHcpForLie('fairway');
  const t=(d-ATG_NEAR_YD)/(ATG_FAR_YD-ATG_NEAR_YD);
  return effHcpForLie('atg')*(1-t) + effHcpForLie('fairway')*t;
}
/* A fingerprint of everything the player model reads, so caches keyed on "the player" notice
   when the golfer edits a stat. The sentinel alone never changes and would serve stale plans. */
function playerModelKey(){
  const pf=STATE.profile||{};
  return [pf.handicap, pf.puttsRound, pf.girPct, pf.upDownPct, pf.scoringAvg, pf.firPct].join(',');
}
/* What a lie's skill number came FROM, so the profile can say whether a field is doing any
   work. Returns 'stat' when a typed round stat drives it and 'index' when it fell back. */
function effHcpSource(lie){
  const pf=STATE.profile||{};
  const has=v=>!(v===''||v==null||isNaN(parseFloat(v)));
  if(lie==='green')   return has(pf.puttsRound)?'stat':'index';
  if(lie==='fairway') return has(pf.girPct)?'stat':'index';
  if(lie==='tee')     return has(pf.firPct)?'stat':'index';
  if(lie==='atg')     return (has(pf.upDownPct)||has(pf.scoringAvg))?'stat':'index';
  return 'index';
}

/* Re-render the scenario output inside the open L1 card */


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { ATG_NEAR_YD, ATG_FAR_YD, PLAYER, playerHcpFor, playerModelKey, SR, SR_RECOVERY_OVER_ROUGH, CARRY_SPEED_EXP, SMASH_K, SMASH_LEAN, SMASH_TOL, expectedSmash, smashOffBy, speedRatioForCarry, carryRatioForSpeed, parseHcp, srForPlayer, srInterp, effHcpForLie, effHcpSource });
