// Strokes Gained — Broadie strokes-remaining baselines, handicap-adjusted.

/* ============================================================
/* ============================================================
   SCORING — STROKES GAINED TRACKER + SCENARIO CALCULATOR
   ============================================================ */

/* Strokes remaining table (scratch baseline, from Broadie).
   Fairway/rough/sand: yards. Green: feet. */
const SR = {
  fairway:[[15,1.87],[25,2.01],[50,2.17],[75,2.31],[100,2.45],[125,2.58],[150,2.70],[175,2.82],[200,2.93],[225,3.02],[250,3.11],[275,3.19],[300,3.27]],
  rough:  [[15,2.04],[25,2.18],[50,2.32],[75,2.46],[100,2.62],[125,2.76],[150,2.90],[175,3.03],[200,3.16],[225,3.27],[250,3.38]],
  sand:   [[10,2.08],[15,2.13],[20,2.22],[30,2.33],[50,2.52],[75,2.68],[100,2.83]],
  green:  [[3,1.20],[5,1.35],[8,1.56],[10,1.65],[15,1.81],[20,1.92],[25,2.02],[30,2.11],[40,2.25],[50,2.37],[60,2.50],[80,2.63]],
  atg:    [[5,1.97],[10,2.07],[15,2.15],[20,2.22],[30,2.34],[40,2.46],[55,2.58]]
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

/* Re-render the scenario output inside the open L1 card */


// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { SR, parseHcp, srForPlayer, srInterp });
