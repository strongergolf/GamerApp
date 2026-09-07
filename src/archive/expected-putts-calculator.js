// ARCHIVED 2026-09-07 — Expected Putts Calculator, parked not deleted.
//
// WHY IT WAS PARKED: what it communicated — how expected putts change with distance and
// handicap — is already served by dragging the distance slider at the top of the Putting tab
// and watching the "Shots Expected" strip move. The calculator restated that with a second
// control and a chart, on a tab that was already long.
//
// It works. It was restored from stranded state earlier the same day (its markup had been
// lost while the renderer kept running and returning on its first line), so it is complete
// and verified: 15 ft at +2 = 1.79 putts / +0.02 vs scratch; 40 ft at 18 = 2.52 / -0.27.
//
// TO REINSTATE: put the markup block back into buildPutting, call renderPuttSG() from
// buildPutting and from puttSetDist, and re-export the three helpers. It depends only on
// srForPlayer, srInterp, parseHcp, ftNum and ftUnit — all still present.
//
// ---- markup (lived at the foot of buildPutting's template) ----
/*
    <!-- 5. Expected Putts Calculator — how many putts this distance is worth to a given
         handicap, and the shape of that across the whole range. Distance comes from the
         slider at the top of the tab; only the handicap is set here. -->
    <div class="section-label" style="margin-top:18px">Expected Putts Calculator</div>
    <div class="ey-panel">
      <div class="ey-grid">
        <div class="ey-term">
          <div class="ey-term-head"><span class="ey-term-label">Handicap</span><span class="ey-term-val" id="psg-hcp-val">${psgHcpLabel(psgDefaultHcp())}</span></div>
          <input type="range" id="psg-hcp" min="-5" max="36" step="1" value="${psgDefaultHcp()}" oninput="onPsgHcpInput(this.value)">
        </div>
      </div>
      <div class="calc-card-body" style="grid-template-columns:1fr 1fr;padding-top:2px">
        <div class="calc-mini-stat"><div class="calc-mini-label">Expected Putts</div><div class="calc-mini-val" id="psg-putts">—</div></div>
        <div class="calc-mini-stat"><div class="calc-mini-label">Strokes Gained</div><div class="calc-mini-val" id="psg-sg">—</div></div>
      </div>
      <div id="psg-chart" class="psg-chart"></div>
      <div class="gen-note" style="margin:0 13px 12px">Expected putts to hole out from each distance at this handicap, against the app's putting baseline. The lit bar is the distance set above.</div>
    </div>`;
*/

// ---- helpers ----
/* Seed the handicap from the player's own, so the calculator opens on THEIR number rather
   than on scratch. parseHcp handles the "+2" form (a plus handicap is negative). */
function psgDefaultHcp(){
  const h=(typeof parseHcp==='function')?parseHcp(STATE.profile&&STATE.profile.handicap):0;
  return Math.max(-5, Math.min(36, Math.round(h||0)));
}
function psgHcpLabel(h){ h=Math.round(parseFloat(h)||0); return h<0?`+${Math.abs(h)}`:`${h}`; }
function onPsgHcpInput(v){
  const l=document.getElementById('psg-hcp-val'); if(l) l.textContent=psgHcpLabel(v);
  renderPuttSG();
}

// ---- renderer ----
function renderPuttSG(){
  if(!document.getElementById('psg-putts')) return;
  const dist=parseInt(document.getElementById('putt-dist')?.value||15);
  /* Reads the slider as the handicap itself — left is a plus handicap (−5, better than
     scratch), right is 36. The markup this renders into was lost at some point and the
     renderer was left running against nothing; rebuilding it, an inverted slider was one
     indirection with nothing to buy it, so the sign convention now matches srForPlayer's:
     positive handicap = more strokes. */
  const hcp=parseFloat(document.getElementById('psg-hcp')?.value||0);
  const sr=srForPlayer('green',dist,hcp);
  const scratchSR=srInterp('green',dist);
  if(sr==null) return;

  /* SG vs scratch: how many strokes vs scratch golfer from same distance */
  const sgVsScratch=(scratchSR-sr).toFixed(2);
  const sgSign=sgVsScratch>=0?'+':'';

  document.getElementById('psg-putts').textContent=sr.toFixed(2);
  const sgEl=document.getElementById('psg-sg');
  const sgColor=parseFloat(sgVsScratch)>=0?'var(--green)':'var(--gold)';
  sgEl.innerHTML=`<span style="color:${sgColor};font-family:Arial,sans-serif;font-size:1rem;font-weight:800">${sgSign}${sgVsScratch}</span> <span style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted)">SG vs scratch</span>`;

  /* Build a mini bar chart across key distances */
  const chartDists=[3,5,8,10,15,20,25,30,40,50,60,75,100];
  const chart=document.getElementById('psg-chart'); if(!chart) return;
  const maxSR=srForPlayer('green',100,hcp)||3.5;
  const bars=chartDists.map(d=>{
    const v=srForPlayer('green',d,hcp);
    if(v==null) return '';
    const pct=Math.round((v/maxSR)*100);
    const isActive=d===dist||(dist>d&&dist<(chartDists[chartDists.indexOf(d)+1]||999));
    const col=isActive?'var(--gold2)':'var(--border2)';
    const textCol=isActive?'var(--gold)':'var(--muted)';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="font-family:Arial,sans-serif;font-size:.7rem;font-weight:700;color:${textCol}">${v.toFixed(1)}</div>
      <div style="width:100%;background:var(--bg2);border-radius:3px;height:60px;display:flex;align-items:flex-end;padding:0 1px">
        <div style="width:100%;height:${pct}%;background:${col};border-radius:2px;transition:height .3s"></div>
      </div>
      <div style="font-family:ui-monospace,monospace;font-size:.42rem;color:${textCol};white-space:nowrap">${ftNum(d)}${ftUnit()}</div>
    </div>`;
  }).join('');
  chart.innerHTML=`<div style="display:flex;gap:3px;align-items:flex-end;padding:10px 14px 12px">${bars}</div>`;
}

