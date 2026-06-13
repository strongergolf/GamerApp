// Short Game Variables model — Setup + Pivot & Release.
// Each variable's options contribute deltas to the impact-condition intermediates
// (horizontal shaft lean, vertical shaft lean, vertical path, effective loft, bounce).
// Those resolve into a net change to effective loft / launch / spin which feeds the
// Chip Shot Options dial at the top of the Short Game tab.
//
// DESIGN: the numbers Mark has specified are encoded verbatim below. Magnitudes he
// has NOT yet locked are marked `prov:true` (provisional) and surfaced as such in the
// UI — they are placeholders to evolve, not invented authoritative values. The shot
// math is driven RELATIVE to the default ("standard chip") selections, so leaving every
// variable at its default produces zero delta and the existing tuned baseline is
// preserved. Coefficients live in SG_K so the translation can be tuned in one place.

/* ============================================================
   SHORT GAME VARIABLES — definitions
   eff{} keys: horizLean (° fwd shaft lean), vertPath (° AoA; − = downward/steeper),
               vertLean (° vertical shaft lean), loft (° effective loft), bounce (°)
   ============================================================ */
const SG_VARS = {
  setup: [
    { key:'ballPos', label:'Ball Position', sub:'Horizontal Shaft Lean & Vertical Path', def:'middle',
      opts:[
        { id:'back',    label:'Back',    eff:{ horizLean:+9, vertPath:-6 } },
        { id:'middle',  label:'Middle',  eff:{ horizLean:+6, vertPath:-3 } },
        { id:'forward', label:'Forward', eff:{ horizLean:+3, vertPath:0  } }
      ] },
    { key:'handPos', label:'Hand Position', sub:'Vertical Shaft Lean', def:'neutral',
      opts:[
        { id:'high',    label:'High Hands',    eff:{ vertLean:+4 }, prov:true },
        { id:'neutral', label:'Neutral Hands', eff:{ vertLean:0  } },
        { id:'low',     label:'Low Hands',     eff:{ vertLean:-4 }, prov:true }
      ] },
    { key:'face', label:'Face Orientation', sub:'Effective Loft & Bounce', def:'square',
      opts:[
        { id:'closed', label:'Slightly Closed', eff:{ loft:-1, bounce:-1 }, prov:true },
        { id:'square', label:'Square',          eff:{ loft:0,  bounce:0  } },
        { id:'sopen',  label:'Slightly Open',   eff:{ loft:+1, bounce:+1 } },
        { id:'open',   label:'Open',            eff:{ loft:+4, bounce:+4 } }
      ] }
  ],
  pivot: [
    { key:'spine', label:'Spine Angle', sub:'Tilt relative to target', def:'level',
      opts:[
        { id:'toward', label:'Tilt Toward Target',    eff:{ horizLean:+4, vertPath:-3 } },
        { id:'level',  label:'Level',                 eff:{ horizLean:0,  vertPath:0  } },
        { id:'away',   label:'Tilt Away from Target', eff:{ horizLean:-4, vertPath:+3 } }
      ] },
    { key:'engine', label:'Engine', sub:'Arms-driven ↔ Body-driven', def:'blend', tbd:true,
      opts:[
        { id:'armsy', label:'Armsy', eff:{}, prov:true },
        { id:'blend', label:'Blend', eff:{} },
        { id:'body',  label:'Body',  eff:{}, prov:true }
      ] }
  ]
};

/* Translation coefficients — provisional, tune here as the model evolves. */
const SG_K = {
  leanDeloft:  1.0,   /* ° effective loft removed per ° forward (horizontal) shaft lean */
  launchRatio: 0.75,  /* launch = effective loft × this (matches chip dial rule) */
  spinPerSteep:130,   /* rpm added per ° of downward (steeper) vertical path */
  spinPerLean: 90     /* rpm added per ° forward shaft lean (added compression) */
};

function sgVarList(){ return [...SG_VARS.setup, ...SG_VARS.pivot]; }

/* Selected option ids, defaulted + persisted on STATE.sgVars. */
function sgSel(){
  STATE.sgVars = STATE.sgVars || {};
  sgVarList().forEach(v=>{ if(STATE.sgVars[v.key]==null) STATE.sgVars[v.key]=v.def; });
  return STATE.sgVars;
}

/* Sum the eff{} deltas for a given selection map into absolute impact intermediates. */
function sgRawNet(sel){
  const acc={ horizLean:0, vertPath:0, vertLean:0, loft:0, bounce:0 }; let prov=false;
  sgVarList().forEach(v=>{
    const opt=v.opts.find(o=>o.id===sel[v.key]) || v.opts.find(o=>o.id===v.def);
    if(!opt) return;
    if(opt.prov && opt.id!==v.def) prov=true;   /* only flag if a provisional option is actively chosen */
    Object.entries(opt.eff||{}).forEach(([k,val])=>{ acc[k]=(acc[k]||0)+val; });
  });
  /* impact-condition → shot translation (absolute) */
  acc.effLoft = acc.loft - acc.horizLean*SG_K.leanDeloft;        /* eff-loft delta vs bare club */
  acc.launch  = acc.effLoft*SG_K.launchRatio;                     /* launch delta */
  acc.spin    = Math.max(0,-acc.vertPath)*SG_K.spinPerSteep + Math.max(0,acc.horizLean)*SG_K.spinPerLean;
  acc.prov=prov;
  return acc;
}

/* Net shot effect = current selection MINUS the default ("standard chip") selection,
   so defaults = zero change and the existing tuned baseline is preserved. */
function sgNet(){
  const sel=sgSel();
  const def={}; sgVarList().forEach(v=>def[v.key]=v.def);
  const cur=sgRawNet(sel), base=sgRawNet(def);
  return {
    abs:cur,                                   /* absolute impact picture (for the readout) */
    dEffLoft: cur.effLoft - base.effLoft,      /* drives the chip dial */
    dLaunch:  cur.launch  - base.launch,
    dSpin:    cur.spin    - base.spin,
    dBounce:  cur.bounce  - base.bounce,
    prov:cur.prov
  };
}

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
Object.assign(window, { SG_VARS, SG_K, sgVarList, sgSel, sgRawNet, sgNet, sgEffLoftDelta, setSgVar, setSgVarIdx, resetSgVars });
