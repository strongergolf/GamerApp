// Short Game Variables model — Setup + Pivot & Release.
// Each variable resolves to the two impact conditions everything else follows from:
// HORIZONTAL SHAFT LEAN (which sets delivered loft) and VERTICAL PATH (the attack angle).
// Delivered loft minus attack angle is SPIN LOFT, and the speed/spin split comes off its
// cosine and sine. That chain — setup → delivery → spin loft → the shot — is the whole model.
//
// DESIGN: the numbers Mark specified are preserved, but they are now DERIVED rather than
// tabled, from two geometries a player can check: the swing arc (1 inch of ball position =
// 1° of both lean and attack angle) and the face rotated about the shaft (loft added =
// rotation × cos(lie), and the face points that far right). Magnitudes not yet locked are
// marked `prov:true` and surfaced as such in the UI. The shot math runs RELATIVE to the
// default ("standard chip") selections, so leaving every variable at its default produces
// zero delta and the tuned baseline is preserved. Coefficients live in SG_K.
//
// AUDITED 2026-09-26. Sign check, the one that matters: +3° of forward shaft lean gives
// dEffLoft −3.00 — forward lean REMOVES loft. Three modelling errors were fixed in the same
// pass: spin came from additive per-degree constants that credited ball position with +660 rpm
// for a change that leaves spin loft untouched; ball speed was taken off delivered loft rather
// than spin loft; and effective bounce ignored shaft lean entirely.

/* ============================================================
   SHORT GAME VARIABLES — definitions
   eff{} keys: horizLean (° fwd shaft lean), vertPath (° AoA; − = downward/steeper),
               loft (° effective loft from the face), bounce (° effective bounce)

   BALL POSITION AND FACE ORIENTATION ARE NOW DERIVED, not tabled.
   Ball position is stated where it is measurable — inches behind the swing's low point —
   and the shaft lean and attack angle it produces come out of the arc geometry below.
   Face orientation is stated as degrees of rotation about the shaft, and the loft, bounce
   and aim it produces come out of sgFaceGeom(). Both derivations reproduce the numbers
   Mark specified (middle = +6° lean / −3° path; slightly open = +2° loft) rather than
   replacing them — which is the point: the spec checks out, and now it is traceable.
   ============================================================ */
const SG_VARS = {
  setup: [
    { key:'ballPos', label:'Ball Position', sub:'Horizontal Shaft Lean & Vertical Path', def:'middle',
      /* backIn = inches the ball sits BEHIND the swing's low point. See sgArcAngle: on a chip
         the clubhead runs on an arc of radius ~57", so a ball 1" back of the low point is met
         1° before the bottom — 1° of descending blow AND 1° of forward shaft lean, because the
         shaft IS the radius. Lean and attack angle therefore move together, one for one, which
         is the single most important fact about this control: ball position is a TRAJECTORY
         adjustment (it changes delivered loft and launch) and NOT a spin or speed adjustment
         (it leaves spin loft — delivered loft minus attack angle — untouched). */
      opts:[
        { id:'back',     label:'Back',           backIn:6.0 },
        { id:'cback',    label:'Center-Back',    backIn:4.5 },
        { id:'middle',   label:'Middle',         backIn:3.0 },
        { id:'cforward', label:'Center-Forward', backIn:1.5 },
        { id:'forward',  label:'Forward',        backIn:0   }
      ] },
    { key:'shaftPos', label:'Shaft Position', sub:'Horizontal Shaft Lean', def:'vertical',
      /* Hands pressed ahead of (or behind) the arc's own lean, with the ball where it is.
         A press is mostly wrist angle, so it delofts the club roughly one-for-one while
         moving the low point only slightly — hence ~1° of extra descent per 3° of press.
         Unlike ball position this DOES change spin loft, so it is the control that trades
         spin for ball speed. Presumed ratio; refine from launch-monitor delivery data. */
      opts:[
        { id:'back',     label:'Leaned slightly back',    eff:{ horizLean:-2, vertPath:+1 } },
        { id:'vertical', label:'Vertical',                eff:{ horizLean:0,  vertPath:0  } },
        { id:'sfwd',     label:'Leaned slightly forward', eff:{ horizLean:+3, vertPath:-1 } },
        { id:'wfwd',     label:'Leaned well forward',     eff:{ horizLean:+6, vertPath:-2 } }
      ] },
    { key:'face', label:'Face Orientation', sub:'Effective Loft, Bounce & Aim', def:'square',
      /* rot = degrees the face is rotated open about the shaft axis (+ = open). Loft, bounce
         and where the face POINTS all fall out of that one number — see sgFaceGeom.
         RE-ANCHORED 2026-09-26 to the rotations a golfer actually makes, at Mark's direction:
         a 10 / 20 / 30° ladder, where way open is the full quarter-turn a flop is played with.
         The loft that follows is +4.4 / +8.8 / +13.1° — where the old table asserted +2 / +4 /
         +6, which implied a "way open" face of under 14° of rotation. That was not a flop, and
         it is why the lob shot never produced lob-shot numbers: a 51° gap wedge way open now
         delivers 58° of loft rather than 51, which is the shot being asked for.
         Closed stays SMALL at −5°: a chip face is hooded a touch, never turned a quarter-turn
         shut, and closing eats the bounce it opens (see the bounce term in sgRawNet).
         Note what rotation brings with it: the face points right by about the rotation itself,
         so way open needs ~33° of aim correction left. That is the number that misses greens,
         and the model had nothing to say about it before. */
      opts:[
        { id:'closed',  label:'Slightly Closed', rot:-5  },
        { id:'square',  label:'Square',          rot:0   },
        { id:'sopen',   label:'Slightly Open',   rot:+10 },
        { id:'open',    label:'Open',            rot:+20 },
        { id:'wayopen', label:'Way Open',        rot:+30 }
      ] }
  ],
  pivot: [
    { key:'spine', label:'Spine Angle', sub:'Tilt relative to target', def:'level',
      /* Tilting the spine toward the target carries the lead shoulder — the centre of the
         swing arc — toward the target with it, which drags the LOW POINT forward. Relative to
         the low point the ball is then further back, so this is the same geometry as ball
         position and it is stated in the same currency: inches the low point moves forward.
         A 4" shift is roughly what ~10° of tilt gives at a shoulder height of ~22".
         CHANGED: this used to read +4° lean against −3° of path. Nothing can move those two
         independently — they are both the arc angle — so the pair is now 1:1 like every other
         low-point shift in this file. Worth confirming against measured deliveries. */
      opts:[
        { id:'toward', label:'Tilt Toward Target',    lowPointFwdIn:+4 },
        { id:'level',  label:'Level',                 lowPointFwdIn:0  },
        { id:'away',   label:'Tilt Away from Target', lowPointFwdIn:-4 }
      ] },
    { key:'engine', label:'Engine', sub:'Arms-driven ↔ Body-driven', def:'blend', tbd:true,
      opts:[
        { id:'armsy', label:'Armsy', eff:{}, prov:true },
        { id:'blend', label:'Blend', eff:{} },
        { id:'body',  label:'Body',  eff:{}, prov:true }
      ] }
  ]
};

/* Translation coefficients. */
const SG_K = {
  leanDeloft:  1.0,   /* ° effective loft removed per ° forward (horizontal) shaft lean —
                         EXACT, not a fitted constant: delivered loft is the face's angle at
                         impact, and leaning the shaft forward by a degree tilts the face by
                         the same degree. The one number here that needs no research. */
  /* Swing-arc radius for a chip, in inches: the distance from the arc's centre (around the
     lead shoulder socket) to the clubhead — lead arm ~25" plus a ~35" wedge, folded by the
     wrist angle a chip holds, giving ~57". At that radius asin(1/57.3) = 1.0°, so the arc
     maths reduces to the rule a golfer can actually use: ONE INCH OF BALL POSITION IS ONE
     DEGREE, of both shaft lean and attack angle. Measure a player's own radius to refine. */
  arcRadiusIn: 57.3,
  /* The standard chip's hands-ahead press, over and above what the arc already gives. It is
     what separates +6° of lean from the −3° of attack angle the same setup delivers; with a
     pure arc and no press the two would be equal. Derived FROM Mark's spec (6 − 3), and it
     agrees with measured chip deliveries (lean runs a few degrees ahead of |AoA|). */
  handsPressDeg: 3,
  /* Reference CLUB for the panel's numbers. The setup panel is club-independent — it states
     what a setup does to any chip — so its numbers are quoted against a representative club,
     and a gap wedge is the go-to chipping club. Delivered loft is this less the setup's shaft
     lean, so the standard chip lands at 51 − 6 = 45°; sgRefDelivered() derives that rather
     than asserting it, and the readout prints what it derives. The lie angle matters because
     the face-rotation geometry depends on it. */
  refClubLoft: 51,
  refClubLie: 64
};

/* Ball position → angle on the arc. asin, not the small-angle shortcut, so the model stays
   honest if someone dials a ball position a long way back. */
function sgArcAngle(backIn){
  const x=Math.max(-20, Math.min(20, parseFloat(backIn)||0));
  return Math.asin(Math.max(-1,Math.min(1, x/SG_K.arcRadiusIn)))*180/Math.PI;
}

/* FACE ROTATION → LOFT, BOUNCE AND AIM — exact geometry, not a lookup.
   Rotating a club about its own shaft does not simply add loft: the shaft is tilted from
   vertical by the lie angle, so the rotation splits between adding loft and turning the face
   to the right. Rodrigues' formula on the face normal gives both exactly.
   Coordinates: +x to the target, +y left of the target line (the golfer's side), +z up.
   A square face's normal is (cos L, 0, sin L); the shaft axis is (0, cos λ, sin λ).
   Results, checked across 47–60° of loft and 63–64° of lie:
     loft added ≈ rot × cos(lie)  ≈ 0.44 × rot      (so ~4.4° of loft per 10° of rotation)
     face points right ≈ rot × 1.0 (1.1 once past 20°)
   The second line is the one people forget: open the face 10° for a soft, high chip and the
   face is aiming ~9.5° right of where the club is swung. Aim the body that much left or the
   ball starts right by the same amount — the loft you wanted and the start line you did not.
   BOUNCE rides with loft: rotating the face open presents the sole to the ground at the same
   extra angle it presents the face to the sky (first order, ignoring sole camber). */
function sgFaceGeom(loftDeg, lieDeg, rotDeg){
  const L=(parseFloat(loftDeg)||51)*Math.PI/180;
  const la=(parseFloat(lieDeg)||SG_K.refClubLie)*Math.PI/180;
  const b=-(parseFloat(rotDeg)||0)*Math.PI/180;            /* + rot = open = −β in these axes */
  const n=[Math.cos(L),0,Math.sin(L)], s=[0,Math.cos(la),Math.sin(la)];
  const sd=s[0]*n[0]+s[1]*n[1]+s[2]*n[2];
  const cx=[s[1]*n[2]-s[2]*n[1], s[2]*n[0]-s[0]*n[2], s[0]*n[1]-s[1]*n[0]];
  const c=Math.cos(b), si=Math.sin(b);
  const v=[0,1,2].map(i=>n[i]*c + cx[i]*si + s[i]*sd*(1-c));
  const loft=Math.asin(Math.max(-1,Math.min(1,v[2])))*180/Math.PI;
  return {
    loft,                                                  /* absolute delivered face loft */
    dLoft: loft-(parseFloat(loftDeg)||51),                 /* loft ADDED by the rotation */
    faceRight: Math.atan2(-v[1], v[0])*180/Math.PI         /* + = face points right of target */
  };
}

function sgVarList(){ return [...SG_VARS.setup, ...SG_VARS.pivot]; }

/* Selected option ids, defaulted + persisted on STATE.sgVars. */
function sgSel(){
  STATE.sgVars = STATE.sgVars || {};
  sgVarList().forEach(v=>{ if(STATE.sgVars[v.key]==null) STATE.sgVars[v.key]=v.def; });
  return STATE.sgVars;
}

/* An option's impact effects, whether tabled or derived. */
function sgOptEff(opt){
  if(!opt) return {};
  if(opt.eff) return opt.eff;
  if(opt.backIn!=null){                                    /* ball position → arc geometry */
    const a=sgArcAngle(opt.backIn);
    return { horizLean:+(SG_K.handsPressDeg+a), vertPath:-a };
  }
  if(opt.lowPointFwdIn!=null){                             /* low-point shift → same arc geometry */
    const a=sgArcAngle(opt.lowPointFwdIn);
    return { horizLean:+a, vertPath:-a };
  }
  if(opt.rot!=null){                                       /* face rotation → face geometry */
    const g=sgFaceGeom(SG_K.refClubLoft, SG_K.refClubLie, opt.rot);
    return { loft:g.dLoft, bounce:g.dLoft, faceRight:g.faceRight, rot:opt.rot };
  }
  return {};
}
/* Sum the per-option effects for a selection map into absolute impact intermediates. */
function sgRawNet(sel){
  const acc={ horizLean:0, vertPath:0, loft:0, bounce:0, faceRight:0, rot:0 }; let prov=false;
  sgVarList().forEach(v=>{
    const opt=v.opts.find(o=>o.id===sel[v.key]) || v.opts.find(o=>o.id===v.def);
    if(!opt) return;
    if(opt.prov && opt.id!==v.def) prov=true;   /* only flag if a provisional option is actively chosen */
    Object.entries(sgOptEff(opt)).forEach(([k,val])=>{ acc[k]=(acc[k]||0)+val; });
  });
  /* ---- impact conditions → the shot, all from one geometry ----
     effLoft   delivered loft relative to the club's stamped loft: what the face adds when it
               is opened, less what leaning the shaft forward takes away.
     spinLoft  delivered loft MINUS attack angle — the angle between the club's path and the
               face it presents, and the quantity that actually decides the speed/spin split.
               This is the correction that matters most in this file. The old model added
               130 rpm per degree of steeper path and 90 per degree of forward lean, so moving
               the ball back — which steepens the path and leans the shaft by the SAME amount,
               leaving spin loft untouched — was credited with +660 rpm, about +26% on a chip.
               It buys no spin at all. What it buys is a lower launch and more release.
     bounce    now falls with forward shaft lean as well as rising with an open face: leaning
               the shaft forward presents the leading edge, which is why a ball-back, hands-
               forward chip digs and an open face skims. Lean did not touch it before. */
  acc.effLoft  = acc.loft - acc.horizLean*SG_K.leanDeloft;
  acc.bounce   = acc.bounce - acc.horizLean*SG_K.leanDeloft;
  acc.delivered= SG_K.refClubLoft + acc.effLoft;                 /* on the reference club */
  acc.spinLoft = acc.delivered - acc.vertPath;
  acc.prov=prov;
  return acc;
}

/* THE SPEED / SPIN SPLIT, from the one angle that governs it.
   At impact the club's velocity splits about the face it presents: the component NORMAL to
   the face compresses the ball and becomes ball speed, the component ALONG it is the slip
   that becomes backspin. Spin loft is the angle between those two, so for a given clubhead
   speed V:
       ball speed ∝ V · cos(spinLoft)
       backspin   ∝ V · sin(spinLoft)
   Both are quoted here as ratios against the standard chip, so the constants of
   proportionality (smash ceiling, ball/turf friction) cancel and never need to be guessed.
   This is the same face-angle law the full-shot model uses for smash — see expectedSmash in
   physics/sg.js — applied to the delivery a chip actually has rather than to stamped loft.
   What it predicts, and the old additive model did not:
     ball back        spin loft unchanged → no speed or spin change, just a lower launch
     hands pressed    spin loft falls     → faster, lower, LESS spin (it was +800 rpm before)
     face opened      spin loft rises     → slower, higher, MORE spin (it was 0 rpm before)
   Presumed at the margins — real strikes lose some slip to friction limits — but the
   direction and the relative size of every effect now come from geometry, not a constant. */
function sgSpeedFrac(spinLoftDeg){ return Math.cos(spinLoftDeg*Math.PI/180); }
function sgSpinFrac(spinLoftDeg){ return Math.sin(spinLoftDeg*Math.PI/180); }
/* Delivered loft of the standard chip on the reference club — derived, so it cannot drift out
   of step with SG_VARS' defaults the way a hardcoded 45 would. */
function sgRefDelivered(){
  const def={}; sgVarList().forEach(v=>def[v.key]=v.def);
  return SG_K.refClubLoft + sgRawNet(def).effLoft;
}
/* The standard chip's spin loft — the reference every percentage in sgNet is quoted against. */
function sgRefSpinLoft(){
  const def={}; sgVarList().forEach(v=>def[v.key]=v.def);
  return sgRawNet(def).spinLoft;
}
/* Net shot effect = current selection MINUS the default ("standard chip") selection,
   so defaults = zero change and the existing tuned baseline is preserved. */
function sgNet(){
  const sel=sgSel();
  const def={}; sgVarList().forEach(v=>def[v.key]=v.def);
  const cur=sgRawNet(sel), base=sgRawNet(def);
  /* Launch follows DELIVERED loft proportionally — a chip leaves at a fixed fraction of the
     loft it is actually struck with (~0.72–0.83 depending on the club, which is what
     chipLaunchRaw encodes for a standard delivery). So the setup's launch change is the
     delivered-loft ratio applied to the club's own launch, not a flat degrees-per-degree
     constant. Quoted here on the reference club; the dial applies it per club. */
  const launchRatio = base.delivered>0 ? cur.delivered/base.delivered : 1;
  const refLaunch = (typeof chipLaunchRaw==='function') ? chipLaunchRaw(SG_K.refClubLoft) : SG_K.refClubLoft*0.68;
  return {
    abs:cur,                                   /* absolute impact picture (for the readout) */
    dEffLoft: cur.effLoft - base.effLoft,      /* drives the chip dial */
    dLaunch:  refLaunch*(launchRatio-1),
    launchRatio,
    dBounce:  cur.bounce  - base.bounce,
    dSpinLoft: cur.spinLoft - base.spinLoft,
    dFaceRight: cur.faceRight - base.faceRight,   /* + = face points right → aim that much left */
    /* PERCENTAGES, so the UI states them club-independently and without redoing the trigonometry */
    dSpeedPct: (sgSpeedFrac(cur.spinLoft)/sgSpeedFrac(base.spinLoft) - 1) * 100,
    dSpinPct:  (sgSpinFrac(cur.spinLoft) /sgSpinFrac(base.spinLoft)  - 1) * 100,
    prov:cur.prov
  };
}
/* Multipliers the Short Game tab applies to the club's own calibrated numbers. Kept as
   multipliers so the calibration (chipSpin, chipLaunchRaw) stays the single source for what
   the club does, and this file stays the single source for what the SETUP does to it. */
function sgSpinMult(){ return 1 + sgNet().dSpinPct/100; }
function sgLaunchRatio(){ return sgNet().launchRatio; }
/* Absolute delivered loft / spin loft for a club with this setup on it. */
function sgDelivered(stampedLoft){ return (parseFloat(stampedLoft)||51) + sgNet().abs.effLoft; }
function sgSpinLoftFor(stampedLoft){ return sgDelivered(stampedLoft) - sgNet().abs.vertPath; }

/* Effective-loft delta consumed by renderChipDial() — applied to every club's loft. */
function sgEffLoftDelta(){ return sgNet().dEffLoft; }

function setSgVar(key,id){
  sgSel()[key]=id; saveState();
  if(typeof renderChipDial==='function') renderChipDial();
  if(typeof renderSgVars==='function') renderSgVars();
}
/* slider helper: set a variable from a step-slider index */
function setSgVarIdx(key,idx){
  const v=sgVarList().find(x=>x.key===key); if(!v) return;
  const i=Math.max(0,Math.min(v.opts.length-1,Math.round(parseFloat(idx))));
  setSgVar(key, v.opts[i].id);
}
function resetSgVars(){
  STATE.sgVars={}; sgSel(); saveState();
  if(typeof renderChipDial==='function') renderChipDial();
  if(typeof renderSgVars==='function') renderSgVars();
}

// Expose for inline handlers + cross-module use during the staged migration.
Object.assign(window, { SG_VARS, SG_K, sgVarList, sgSel, sgRefSpinLoft, sgOptEff, sgArcAngle, sgFaceGeom, sgRawNet, sgNet, sgSpeedFrac, sgSpinFrac, sgSpinMult, sgLaunchRatio, sgDelivered, sgSpinLoftFor, sgRefDelivered, sgEffLoftDelta, setSgVar, setSgVarIdx, resetSgVars });
