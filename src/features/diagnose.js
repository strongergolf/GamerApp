// Diagnose causal chain (7 levels). Each level renders metric inputs / matrices.
// Kinematic sequence = 4 segments x 5 phases. Grip profile in L3. Physical profile in L5.

/* ============================================================
   SWING DATA — causation chain
   ============================================================ */
function metricBox(label,unit,path){
  const val=getPath(STATE.swing,path)||'';
  return `<div class="metric-box"><div class="metric-label">${label}</div><input class="metric-input" value="${escapeHtml(val)}" data-swing="${path}" placeholder="—"><div class="metric-unit">${unit}</div></div>`;
}
/* The seven links in the chain of causation. Each area exposes up to three
   render slots — assess (measure/enter data), improve (drills & prescriptions),
   resources (reference charts & the "ideal" to compare against). buildAssess /
   buildImprove / buildResources render one slot across all areas into a page. */
const PRACTICE_AREAS=[
    {n:1,id:'score',title:'Score',cause:'Ball behaviour',status:'live',
     assess:()=>`
       <div class="chain-caption">The end result of every level below. Two tools here: a <strong>Scenario Calculator</strong> that outputs expected strokes from any position, and a <strong>Strokes Gained tracker</strong> to log rounds and average your SG by category — each category pointing down the chain to its cause.</div>

       <div class="lvl-subhead">Scenario Calculator</div>
       <div class="chain-caption" style="margin-top:4px">Expected strokes to hole out from any position, calibrated to your handicap. Uses Broadie baseline data adjusted linearly per handicap stroke.</div>
       <div class="sg-scen-row">
         <div class="sg-scen-field"><label>Distance (yd / ft if green)</label><input id="sg-scen-dist" type="number" min="1" placeholder="e.g. 150" oninput="sgScenario()"></div>
         <div class="sg-scen-field"><label>Lie / Position</label><select id="sg-scen-lie" onchange="sgScenario()"><option value="fairway">Fairway</option><option value="rough">Rough</option><option value="sand">Sand / Bunker</option><option value="green">Green (feet)</option></select></div>
         <div class="sg-scen-field"><label>Handicap</label><input id="sg-scen-hcp" type="text" placeholder="${escapeHtml(STATE.profile.handicap||'0')}" value="${escapeHtml(STATE.profile.handicap||'0')}" oninput="sgScenario()"></div>
       </div>
       <div id="sg-scen-out"><span style="color:var(--muted);font-style:italic;font-size:.82rem">Enter a distance above.</span></div>

       <div class="lvl-subhead" style="margin-top:14px">Strokes Gained — Category Averages</div>
       <div id="sg-summary">${sgSummaryHtml()}</div>

       <div class="lvl-subhead" style="margin-top:18px">Skill Profile — Strokes Gained Diamond</div>
       <div class="chain-caption" style="margin-top:4px">Visual snapshot of relative performance across the four SG categories. Outer ring = scratch benchmark; your shape shows strengths and gaps. Updates automatically as rounds are logged.</div>
       <div id="sg-diamond-wrap" style="display:flex;justify-content:center;padding:10px 0 4px">${buildSGDiamond()}</div>

       <div class="lvl-subhead" style="margin-top:18px">Scoring Benchmarks <span class="placeholder-flag">Broadie</span></div>
       <div class="chain-caption" style="margin-top:4px">Where your scoring sits relative to scratch and to your goal handicap. Average score ≈ par + handicap + ~2.5 (Broadie). Set your numbers in <strong>Locker Room → Myself</strong>.</div>
       <div id="sg-benchmark">${scoringBenchmarkHtml()}</div>

       <div class="lvl-subhead" style="margin-top:14px">Log a Round</div>
       <div class="sg-add-form">
         <div class="sg-tournament-row">
           <div><label>Date</label><br><input id="sg-date" type="date" value="${new Date().toISOString().slice(0,10)}" style="font-family:Arial,sans-serif;font-size:.88rem;font-weight:700;padding:5px 7px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;color:var(--ink);outline:none;margin-top:3px"></div>
           <div><label>Course</label><br><input id="sg-course" placeholder="Course name" style="font-family:Arial,sans-serif;font-size:.82rem;padding:5px 7px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--ink);outline:none;margin-top:3px;width:160px"></div>
           <div><label>Tee</label><br><select id="sg-tee" style="font-family:Arial,sans-serif;font-size:.88rem;font-weight:700;padding:5px 7px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;color:var(--ink);outline:none;margin-top:3px"><option value="">—</option><option>Black</option><option>Blue</option><option>White</option><option>Gold</option><option>Red</option></select></div>
           <div style="display:flex;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" id="sg-tournament"><label for="sg-tournament" style="cursor:pointer">Tournament round</label></div>
         </div>
         <div class="sg-scorecard">
           <table>
             <thead>
               <tr>
                 <th>Hole</th>
                 <th>Par</th>
                 <th>Score</th>
                 <th>Putts</th>
                 <th>FIR</th>
                 <th>GIR</th>
                 <th style="color:var(--sky)">OTT</th>
                 <th style="color:var(--green)">APP</th>
                 <th style="color:var(--gold)">ATG</th>
                 <th style="color:var(--red)">PUTT</th>
               </tr>
             </thead>
             <tbody>
               ${Array.from({length:18},(_,i)=>`
               <tr class="${i===8?'sg-sc-9':''}">
                 <td style="font-family:Arial,sans-serif;font-weight:800;font-size:.88rem;color:var(--ink);text-align:center;background:var(--bg2)">${i+1}</td>
                 <td><input type="number" id="sg-par-${i+1}" min="3" max="5" placeholder="4" oninput="sgUpdateTotals()"></td>
                 <td><input type="number" id="sg-sc-${i+1}" min="1" max="15" oninput="sgUpdateTotals()"></td>
                 <td><input type="number" id="sg-putts-${i+1}" min="0" max="6" oninput="sgUpdateTotals()"></td>
                 <td><select id="sg-fir-${i+1}" style="width:42px"><option value="">—</option><option value="H">✓</option><option value="L">L</option><option value="R">R</option><option value="S">S</option></select></td>
                 <td><input type="checkbox" id="sg-gir-${i+1}" onchange="sgUpdateTotals()"></td>
                 <td style="background:var(--sky-pale)"><input type="number" id="sg-h-ott-${i+1}" step="0.1" style="width:36px;border-color:var(--sky)" oninput="sgUpdateTotals()"></td>
                 <td style="background:var(--green-pale)"><input type="number" id="sg-h-app-${i+1}" step="0.1" style="width:36px;border-color:var(--green2)" oninput="sgUpdateTotals()"></td>
                 <td style="background:var(--gold-pale)"><input type="number" id="sg-h-atg-${i+1}" step="0.1" style="width:36px;border-color:var(--gold)" oninput="sgUpdateTotals()"></td>
                 <td style="background:var(--red-pale)"><input type="number" id="sg-h-putt-${i+1}" step="0.1" style="width:36px;border-color:var(--red)" oninput="sgUpdateTotals()"></td>
               </tr>`).join('')}
               <tr style="background:var(--bg2);font-weight:700">
                 <td style="font-family:Arial,sans-serif;font-weight:800;font-size:.8rem;color:var(--muted)">Out</td>
                 <td id="sg-tot-par-out">—</td><td id="sg-tot-sc-out">—</td><td id="sg-tot-putts-out">—</td>
                 <td colspan="2" id="sg-tot-fir" style="font-size:.58rem;color:var(--muted)">—</td>
                 <td id="sg-tot-h-ott-out" style="color:var(--sky)">—</td>
                 <td id="sg-tot-h-app-out" style="color:var(--green)">—</td>
                 <td id="sg-tot-h-atg-out" style="color:var(--gold)">—</td>
                 <td id="sg-tot-h-putt-out" style="color:var(--red)">—</td>
               </tr>
               <tr style="background:var(--bg2);font-weight:700">
                 <td style="font-family:Arial,sans-serif;font-weight:800;font-size:.8rem;color:var(--muted)">In</td>
                 <td id="sg-tot-par-in">—</td><td id="sg-tot-sc-in">—</td><td id="sg-tot-putts-in">—</td>
                 <td colspan="2" id="sg-tot-gir" style="font-size:.58rem;color:var(--muted)">—</td>
                 <td id="sg-tot-h-ott-in" style="color:var(--sky)">—</td>
                 <td id="sg-tot-h-app-in" style="color:var(--green)">—</td>
                 <td id="sg-tot-h-atg-in" style="color:var(--gold)">—</td>
                 <td id="sg-tot-h-putt-in" style="color:var(--red)">—</td>
               </tr>
               <tr style="background:var(--ink);color:#f4f0e8">
                 <td style="font-family:Arial,sans-serif;font-weight:800;font-size:.8rem">Total</td>
                 <td id="sg-tot-par-all">—</td>
                 <td id="sg-tot-sc-all" style="font-family:Arial,sans-serif;font-weight:800;font-size:.95rem;color:var(--gold2)">—</td>
                 <td id="sg-tot-putts-all">—</td>
                 <td colspan="2"></td>
                 <td id="sg-tot-h-ott-all" style="color:#7ae0b8;font-weight:800">—</td>
                 <td id="sg-tot-h-app-all" style="color:#7ae0b8;font-weight:800">—</td>
                 <td id="sg-tot-h-atg-all" style="color:var(--gold2);font-weight:800">—</td>
                 <td id="sg-tot-h-putt-all" style="color:#f08080;font-weight:800">—</td>
               </tr>
             </tbody>
           </table>
         </div>
         <div class="lvl-subhead-sm" style="margin:10px 0 6px">Notes</div>
         <div class="edit-grid" style="margin-bottom:10px">
           <div class="edit-field" style="grid-column:1/-1"><label>Round Notes</label><input id="sg-rnotes" placeholder="conditions, observations, etc."></div>
         </div>
         <button class="btn btn-primary" onclick="sgAddRound()">Save Round</button>
       </div>

       <div class="lvl-subhead">Round History</div>
       <div id="sg-rounds">${sgRoundsHtml()}</div>`,
     improve:()=>scoreImprove(),
     resources:()=>scoreResources()},
    {n:2,id:'ball',title:'Ball Flight &amp; Club Behaviour',cause:'Forces &amp; torques',status:'live',
     assess:()=>`
       <div class="chain-caption">The D-plane covers both layers: ball flight is the <em>outcome</em> of club behaviour at impact, and the same impact variables explain both simultaneously. Ball data is captured on the Bag tab. <span class="placeholder-flag">Labels pending StrongerGolf terms</span></div>

       <div class="lvl-subhead">Ball Flight — from Bag Data</div>
       ${ballRefHtml()}

       <div class="chain-caption" style="margin-top:14px">The interactive <strong>D-Plane Lab</strong> — the rotatable impact-geometry render, shot presets, ball-speed sandbox and per-club stock-shot tendencies — now has its own main tab: <b onclick="showGroup('dplane',document.querySelectorAll('.ngroup')[1])" style="color:var(--sky);cursor:pointer;text-decoration:underline">open the D-Plane Lab</b>.</div>`,
     improve:()=>ballImprove(),
     resources:()=>`
       ${ballLawsRef()}
       <div class="chain-caption" style="margin-top:14px">The interactive D-plane shaper — per-club impact inputs alongside the live 3D render — now lives in its own main tab: <b onclick="showGroup('dplane',document.querySelectorAll('.ngroup')[1])" style="color:var(--sky);cursor:pointer;text-decoration:underline">the D-Plane Lab</b>.</div>
       ${buildGearEffectL2()}

       <div class="chain-caption" style="margin-top:14px">Driver distance optimization (Foresight launch &amp; spin windows) now lives under the <strong>Driver</strong> in <strong>Stock Shots</strong>.</div>`},
    {n:3,id:'forces',title:'Forces &amp; Torques — Grip &amp; Hands',cause:'Kinematic sequence',status:'live',
     assess:()=>`<div class="chain-caption">After Nesbit: the club only "knows" the forces and torques applied to it. Anything you can do to a golf club can be described by combining three actions — Pull, Push, and Twist — each characterised by its type, timing, direction, and magnitude. Each is tracked across three downswing stages.</div>
       <div class="force-legend">Each stage: <b>top field</b> = direction · <b>bottom field</b> = magnitude</div>
       ${forceRow('Pull','Moving the grip of the club in the direction that the grip\'s butt is pointed — a linear force along the shaft\'s long axis.','pull')}
       ${forceRow('Push','The releasing of the clubhead in relation to the grip — the grip stays in the same spot, but the clubhead is orbiting around it. A rotational torque around the grip.','push')}
       ${forceRow('Twist','A screwdriver-like motion with the hands and forearms, causing the clubhead\'s sweetspot to rotate around the club shaft\'s longitudinal axis.','twist')}

       <div class="lvl-subhead" style="margin-top:16px">Grip Profile</div>
       <div class="chain-caption" style="margin-top:4px">Grip position directly influences the Twist torque available and its timing. Rated on two independent spectrums — strength position and palm-to-fingers depth.</div>
       <div class="grip-profile-wrap">
         <div class="grip-spectrum-block">
           <div class="grip-spectrum-label">Strength / Rotation</div>
           <div class="grip-spectrum-sub">How far the hands are rotated relative to the club face</div>
           <div class="grip-spectrum-row" id="grip-strength-row">
             ${['Very Strong','Strong','Neutral','Weak','Very Weak'].map((l,i)=>`
             <label class="grip-option">
               <input type="radio" name="grip-strength" value="${i+1}"
                 ${(()=>{const v=getPath(STATE.swing,'grip.strength');return v==i+1?'checked':'';})()}
                 onchange="setPath(STATE.swing,'grip.strength',${i+1});saveSwing()">
               <span class="grip-pip"></span>
               <span class="grip-pip-label">${l}</span>
             </label>`).join('')}
           </div>
           <div class="grip-spectrum-axis"><span>◀ Strong</span><span>Weak ▶</span></div>
         </div>
         <div class="grip-spectrum-block" style="margin-top:14px">
           <div class="grip-spectrum-label">Depth — Fingers vs Palm</div>
           <div class="grip-spectrum-sub">Where in the hand the club sits at address</div>
           <div class="grip-spectrum-row" id="grip-depth-row">
             ${['Fully Palmed','Palm-biased','Neutral','Finger-biased','Fully in Fingers'].map((l,i)=>`
             <label class="grip-option">
               <input type="radio" name="grip-depth" value="${i+1}"
                 ${(()=>{const v=getPath(STATE.swing,'grip.depth');return v==i+1?'checked':'';})()}
                 onchange="setPath(STATE.swing,'grip.depth',${i+1});saveSwing()">
               <span class="grip-pip"></span>
               <span class="grip-pip-label">${l}</span>
             </label>`).join('')}
           </div>
           <div class="grip-spectrum-axis"><span>◀ Palm</span><span>Fingers ▶</span></div>
         </div>
         <div class="edit-field" style="margin-top:12px;grid-column:1/-1">
           <label>Grip Notes</label>
           <textarea class="metric-input" data-swing="grip.notes" style="width:100%;min-height:52px;font-family:Arial,sans-serif;font-size:.82rem;line-height:1.4" placeholder="pressure points, interlocking/overlap/baseball, glove hand observations…">${escapeHtml(getPath(STATE.swing,'grip.notes'))}</textarea>
         </div>
       </div>`,
     improve:()=>forcesImprove(),
     resources:()=>`
       <div class="lvl-subhead" style="margin-top:0">Elite Force Profile — 3 Phases of the Downswing</div>
       <div class="chain-caption" style="margin-top:4px">Reference Pull / Push / Twist magnitudes about the Point of Influence through the downswing, from the StrongerGolf "3 Phases" study (Strong &amp; Zibrik, 2013). Phases end at hand clock-positions: <b>9:00</b> (end Phase 1) → <b>7:00 / max effort</b> (end Phase 2) → <b>Impact</b>. The signature: <b style="color:var(--c-wood)">Push</b> peaks mid-downswing then releases to zero; <b style="color:var(--c-iron)">Pull</b> climbs to a 100% inward force (~100 lb) at impact; <b style="color:var(--c-wedge)">Twist</b> spikes last to square the face.</div>
       <div style="display:flex;justify-content:center;padding:8px 0 4px">${buildForceProfileSVG()}</div>
       ${forcesExperts()}`},
    {n:4,id:'kinematics',title:'Kinematic Sequence &amp; Ground Forces',cause:'Body movement',status:'live',
     assess:()=>{
      const segments=[
        {id:'pelvis',label:'Pelvis',     color:'var(--c-wood)',  bench:'~480°/s'},
        {id:'thorax',label:'Thorax',     color:'var(--c-iron)',  bench:'~605°/s'},
        {id:'arm',   label:'Lead Arm',   color:'var(--c-wedge)', bench:'~1310°/s'},
        {id:'club',  label:'Club',       color:'var(--grey)',    bench:'~1650°/s'},
      ];
      const phases=[
        {id:'bs',   label:'Backswing',     sub:'takeaway→top'},
        {id:'trans',label:'Transition',    sub:'first move down'},
        {id:'mid',  label:'Mid-Down',      sub:'halfway to impact'},
        {id:'imp',  label:'Impact Zone',   sub:'pre→contact'},
        {id:'ft',   label:'Follow-Thru',   sub:'release→finish'},
      ];
      const phHdrs=phases.map(ph=>`<th style="padding:5px 4px;font-family:Arial,sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg2);text-align:center;white-space:nowrap">${ph.label}<br><span style="font-family:ui-monospace,monospace;font-size:.42rem;font-weight:400;color:var(--border2)">${ph.sub}</span></th>`).join('');
      const rows=segments.map(seg=>
        `<tr><td style="padding:6px 8px;white-space:nowrap;border-bottom:1px solid var(--border)">
           <span style="font-family:Arial,sans-serif;font-weight:800;font-size:.88rem;color:${seg.color}">${seg.label}</span>
           <span style="display:block;font-family:ui-monospace,monospace;font-size:.44rem;color:var(--muted)">${seg.bench}</span>
         </td>${phases.map(ph=>{
           const key='kinematics.'+seg.id+'.'+ph.id;
           const val=getPath(STATE.swing,key)||'';
           return '<td style="padding:4px 3px;border-bottom:1px solid var(--border);border-left:1px solid var(--border)"><input class="metric-input" style="font-size:.72rem;padding:4px 5px;width:100%;min-width:0;border-color:'+seg.color+'33" value="'+escapeHtml(val)+'" data-swing="'+key+'" placeholder="°/s"></td>';
         }).join('')}</tr>`
      ).join('');
      return '<div class="chain-caption">Proximal-to-distal energy transfer. <strong>Each segment accelerates, peaks, then decelerates to hand energy to the next link.</strong> Efficient sequencing: Pelvis → Thorax → Lead Arm → Club, each peaking faster and later than the one before. Source: TPI / K-Vest / Dr Phil Cheetham research.</div>'
       +'<div class="lvl-subhead">Peak Angular Velocity by Segment &amp; Phase (°/s)</div>'
       +'<div style="overflow-x:auto;margin-bottom:12px"><table style="border-collapse:collapse;width:100%;font-size:.78rem"><thead><tr>'
       +'<th style="padding:6px 8px;font-family:Arial,sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg2);text-align:left;min-width:80px">Segment</th>'
       +phHdrs+'</tr></thead><tbody>'+rows+'</tbody></table></div>'
       +'<div class="lvl-subhead-sm" style="margin:6px 0 6px">Peak Velocity — Measured vs Ideal (°/s)</div>'
       +'<div class="chain-caption" style="margin-top:0;margin-bottom:6px">Each segment\'s peak angular velocity against the Strong &amp; Zibrik tour-level reference. The order matters as much as the magnitudes — see <strong>Resources</strong> for the full sequence.</div>'
       +'<div class="mg-grid">'
       +metricGoal('Pelvis Peak','°/s','kinematics.peak.pelvis',410)
       +metricGoal('Thorax / Upper Body Peak','°/s','kinematics.peak.thorax',552)
       +metricGoal('Lead Arm Peak','°/s','kinematics.peak.arm',1100)
       +metricGoal('Club Peak','°/s','kinematics.peak.club',1479)
       +'</div>'
       +'<div class="edit-field" style="margin-bottom:10px;margin-top:10px"><label>Sequence Order Observed</label>'
       +'<input class="metric-input" data-swing="kinematics.sequenceOrder" value="'+escapeHtml(getPath(STATE.swing,'kinematics.sequenceOrder'))+'" placeholder="e.g. Pelvis → Thorax → Arm → Club (ideal) or Thorax first (OTT)"></div>'
       +'<div class="edit-field" style="margin-bottom:14px"><label>Transition Trigger</label>'
       +'<input class="metric-input" data-swing="kinematics.transitionTrigger" value="'+escapeHtml(getPath(STATE.swing,'kinematics.transitionTrigger'))+'" placeholder="what initiates the downswing — lateral shift, trail foot push-off, etc."></div>'
       +'<div class="lvl-subhead">Ground Forces — Weight Distribution (Current vs Ideal)</div>'
       +'<div class="mg-grid">'
       +metricGoal('Weight @ Address','% lead','forcePlate.wtAddress',50)
       +metricGoal('Weight @ Top','% lead','forcePlate.wtTop',40)
       +metricGoal('Weight @ Impact','% lead','forcePlate.wtImpact',85)
       +'</div>'
       +'<div class="metric-grid">'
       +metricBox('Loading Pattern','trail/lead bias','forcePlate.loadingPattern')
       +metricBox('GRF Transition Trigger','GRF initiation','forcePlate.transitionTrigger')
       +metricBox('Peak Lead Force Timing','relative to impact','forcePlate.peakLeadTiming')
       +metricBox('Peak Trail Force Timing','relative to impact','forcePlate.peakTrailTiming')
       +metricBox('Push-Off Magnitude','trail foot','forcePlate.pushOffMagnitude')
       +metricBox('COP Path','centre of pressure trace','forcePlate.copPath')
       +'</div>'
       +'<div class="edit-field" style="margin-top:10px"><label style="font-family:ui-monospace,monospace;font-size:.5rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Force Plate Notes</label>'
       +'<textarea class="metric-input" data-swing="forcePlate.notes" style="width:100%;min-height:60px;font-family:Arial,sans-serif;font-size:.82rem;line-height:1.4" placeholder="Trace patterns, anomalies, observations…">'+escapeHtml(getPath(STATE.swing,'forcePlate.notes'))+'</textarea></div>'
       +'<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" onclick="saveSwing()">Save</button></div>';
     },
     improve:()=>kinematicsImprove(),
     resources:()=>kinematicsResources()},
    {n:5,id:'body',title:'Body &amp; Movement',cause:null,status:'live',
     assess:()=>`
       <div class="chain-caption">The most variable, most individual link. Framed not as "correct positions" but as <em>the movements that, for this golfer, produce the needed forces above</em>. Physical characteristics determine what movement patterns are even available; TPI screens identify the limiting factors.</div>

       <div class="lvl-subhead">Physical Profile</div>
       <div class="chain-caption" style="margin-top:4px">Body measurements and physical context. These inform what is physically possible and help explain why certain force/torque patterns emerge.</div>
       <div class="edit-grid">
         <div class="edit-field"><label>Handedness</label>${sel('pf-hand',['','RH','LH'],STATE.profile.handedness||'')}</div>
         <div class="edit-field"><label>Age Range</label>${sel('pf-age',['','Under 20','20s','30s','40s','50s','60s','70+'],STATE.profile.ageRange||'')}</div>
         <div class="edit-field"><label>Height — ft</label><input id="pf-htft" type="number" min="3" max="8" value="${escapeHtml(STATE.profile.heightFt||'')}"></div>
         <div class="edit-field"><label>Height — in</label><input id="pf-htin" type="number" min="0" max="11" value="${escapeHtml(STATE.profile.heightIn||'')}"></div>
         <div class="edit-field"><label>Arm-to-Floor (in)</label><input id="pf-atf" type="number" step="0.25" value="${escapeHtml(STATE.profile.armToFloor||'')}" placeholder="wrist-to-floor at address"></div>
         <div class="edit-field"><label>Glove Size</label>${sel('pf-glove',[
           '','Men\'s S','Men\'s M','Men\'s M/L','Men\'s L','Men\'s XL','Men\'s XXL',
           'Men\'s Cadet S','Men\'s Cadet M','Men\'s Cadet M/L','Men\'s Cadet L','Men\'s Cadet XL',
           'Women\'s S','Women\'s M','Women\'s M/L','Women\'s L','Women\'s XL'
         ],STATE.profile.gloveSize||'')}</div>
       </div>
       <div class="btn-row"><button class="btn btn-accent" onclick="savePhysical()">Save Physical Profile</button></div>

       <div class="lvl-subhead" style="margin-top:16px">TPI Physical Screen</div>
       <div class="chain-caption" style="margin-top:4px">Pass / Fail / note — all optional. <span class="placeholder-flag">Expand categories as needed</span></div>
       <div class="lvl-subhead-sm">Mobility</div>
       <div class="metric-grid">
         ${metricBox('Overhead Deep Squat','P/F/note','tpi.overheadSquat')}
         ${metricBox('Pelvic Tilt','P/F/note','tpi.pelvicTilt')}
         ${metricBox('Pelvic Rotation','P/F/note','tpi.pelvicRotation')}
         ${metricBox('Thoracic Rotation','P/F/note','tpi.thoracicRotation')}
         ${metricBox('Hip Internal Rotation','P/F/note','tpi.hipInternal')}
         ${metricBox('Hip External Rotation','P/F/note','tpi.hipExternal')}
         ${metricBox('Hamstring Length','P/F/note','tpi.hamstring')}
         ${metricBox('Wrist Hinge','P/F/note','tpi.wristHinge')}
       </div>
       <div class="lvl-subhead-sm" style="margin-top:12px">Stability</div>
       <div class="metric-grid">
         ${metricBox('Single Leg Balance','P/F/note','tpi.singleLegBalance')}
         ${metricBox('Seated Trunk Rotation','P/F/note','tpi.seatedTrunkRot')}
         ${metricBox('Lower Quarter Rotation','P/F/note','tpi.lowerQuarterRot')}
       </div>
       <div class="edit-field" style="margin-top:10px"><label style="font-family:ui-monospace,monospace;font-size:.5rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Screen Notes</label><textarea class="metric-input" data-swing="tpi.notes" style="width:100%;min-height:60px;font-family:Arial,sans-serif;font-size:.82rem;line-height:1.4" placeholder="Limitations, compensations, priorities…">${escapeHtml(getPath(STATE.swing,'tpi.notes'))}</textarea></div>`,
     improve:()=>bodyImprove(),
     resources:()=>bodyResources()},
    {n:6,id:'psych',title:'Psychology &amp; Philosophy',cause:null,status:'live',
     assess:()=>`
       <div class="chain-caption">The mental and philosophical layer — how a player thinks, believes, and approaches the game. Pre-shot routine, pressure management, competitive mindset, and the deeper relationship a golfer has with the game. Aim ability, eye dominance, and attentional style also attach here as perceptual inputs that precede every shot.</div>

       <div class="lvl-subhead">MindTrak</div>
       <div class="chain-caption" style="margin-top:4px">Data-driven mental performance tracking — quantifying the psychological side of scoring. <span class="placeholder-flag">Coming</span></div>
       <div class="metric-grid">
         ${metricBox('Focus Rating','1–10 per round','psych.mindtrak.focus')}
         ${metricBox('Commitment Level','1–10 per round','psych.mindtrak.commitment')}
         ${metricBox('Emotional Control','1–10 per round','psych.mindtrak.emotional')}
         ${metricBox('Pre-Shot Routine Consistency','1–10','psych.mindtrak.routine')}
         ${metricBox('Mental Errors (count)','per round','psych.mindtrak.errors')}
         ${metricBox('Recovery Rate','after bad shots','psych.mindtrak.recovery')}
       </div>

       <div class="lvl-subhead" style="margin-top:14px">Vision54</div>
       <div class="chain-caption" style="margin-top:4px">Play-box / think-box process, human skills, and the pursuit of 18 birdies. <span class="placeholder-flag">Coming</span></div>
       <div class="metric-grid">
         ${metricBox('Think Box Quality','decision clarity','psych.vision54.thinkBox')}
         ${metricBox('Play Box Commitment','trust / let go','psych.vision54.playBox')}
         ${metricBox('Human Skills','attitude, focus, emotion, body lang','psych.vision54.humanSkills')}
         ${metricBox('Best Ever Score (18 holes)','personal ceiling','psych.vision54.bestScore')}
         ${metricBox('Notes','pattern observations','psych.vision54.notes')}
       </div>

       <div class="lvl-subhead" style="margin-top:14px">Fearless Golf</div>
       <div class="chain-caption" style="margin-top:4px">Gio Valiante's framework — mastery vs. ego orientation, courage under pressure. <span class="placeholder-flag">Coming</span></div>
       <div class="metric-grid">
         ${metricBox('Orientation','mastery / ego / mixed','psych.fearless.orientation')}
         ${metricBox('Courage Rating','1–10 in pressure','psych.fearless.courage')}
         ${metricBox('Identity Statement','I am a golfer who…','psych.fearless.identity')}
         ${metricBox('Primary Fear / Block','what triggers ego mode','psych.fearless.fear')}
         ${metricBox('Notes','observations and cues','psych.fearless.notes')}
       </div>

       <div class="lvl-subhead" style="margin-top:14px">Goals</div>
       <div class="chain-caption" style="margin-top:4px">Goal-setting across time horizons. Specific, process-oriented goals connect directly to the levels above — each goal should have a clear link to which part of the chain it targets.</div>
       <div class="metric-grid">
         ${metricBox('Daily','today\'s focus or practice intention','psych.goals.daily')}
         ${metricBox('Weekly','this week\'s priority','psych.goals.weekly')}
         ${metricBox('Monthly','this month\'s objective','psych.goals.monthly')}
         ${metricBox('This Season','season target / theme','psych.goals.season')}
         ${metricBox('Career','long-term aspiration','psych.goals.career')}
       </div>
       <div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" onclick="saveSwing()">Save</button></div>`,
     improve:()=>psychImprove(),
     resources:()=>psychResources()},
    {n:7,id:'strategy',title:'Course Management &amp; Strategy',cause:null,status:'soon',
     assess:()=>`
       <div class="chain-caption">Where every level above cashes out into a real decision on a real hole. Strategy synthesises ball-flight data (L2), dispersion patterns, and scoring tendencies (L1) into optimal targets, shot shapes, and risk/reward choices. The eventual home for course overlays and hole-by-hole planning.</div>

       ${buildStrategyPrefs()}
       <div class="chain-caption" style="margin-top:6px">These are the same preferences shown in the <strong>Plan → Strategy</strong> tab — editing here updates there.</div>`,
     improve:()=>`
       <div class="lvl-subhead" style="margin-top:0">Strokes Gained — Decision Quality</div>
       <div class="lvl-soon-note">Future: flag shots where club or target selection cost strokes vs. the optimal decision, separate from execution error. A bad decision with a good swing still costs shots.</div>

       <div class="lvl-subhead" style="margin-top:14px">Course Notes</div>
       <div class="lvl-soon-note">Hole-by-hole strategy log: playing notes, wind tendencies, pin position adjustments, and lessons learned. Will link to the round log in the Score tab so notes are attached to specific rounds.</div>`,
     resources:()=>`
       <div class="lvl-subhead" style="margin-top:0">Dispersion-Based Aim Points</div>
       <div class="lvl-soon-note">Your overhead dispersion cone (computed on the Stock Shots tab) overlaid on hole layouts. Given your L/R spread for each club, the system will compute the expected-value aim point that minimises expected strokes — accounting for hazard locations, miss penalties, and green shape.</div>

       <div class="lvl-subhead" style="margin-top:14px">Risk / Reward Profiles</div>
       <div class="lvl-soon-note">Per-hole: lay-up vs. go yardage thresholds, preferred miss sides, and safe-zone targets. Feeds directly from your carry and dispersion data. Will eventually allow scenario input ("230 carry over water or lay up to 80") and output an expected-score comparison.</div>
       ${strategyExperts()}`}
  ];

/* ---- Practice page builders: render one slot across all areas ---- */
function practiceCard(area,slot,idx){
  const html=area[slot]?area[slot]():'';
  const cid=slot+'-'+area.id;
  const body=html||`<div class="lvl-soon-note">Nothing allocated to this link yet — check the other Practice sub-tabs.</div>`;
  return `${idx>0?'<div class="lvl-connector"></div>':''}
    <div class="lvl-card has-data" data-lvl="${cid}">
      <div class="lvl-head" onclick="toggleLevel('${cid}')">
        <div class="lvl-num">${area.n}</div>
        <div class="lvl-titles"><div class="lvl-title">${area.title}</div></div>
        <div class="lvl-right"><div class="lvl-chev">▾</div></div>
      </div>
      <div class="lvl-body"><div class="lvl-inner">${body}</div></div>
    </div>`;
}
function buildPracticeSlot(slot,wrapId){
  const wrap=document.getElementById(wrapId);
  if(!wrap) return;
  wrap.innerHTML=PRACTICE_AREAS.map((a,i)=>practiceCard(a,slot,i)).join('');
}
function buildAssess(){
  buildPracticeSlot('assess','assess-wrap');
  const wrap=document.getElementById('assess-wrap');
  if(wrap) wrap.insertAdjacentHTML('beforeend',`
    <div class="section-label">Diagnostic Notes</div>
    <textarea data-swing="notes" class="metric-input" style="width:100%;min-height:90px;font-family:Arial,sans-serif;font-size:.85rem;font-weight:400;line-height:1.5" placeholder="Working diagnosis, feels and cues…">${escapeHtml(STATE.swing.notes||'')}</textarea>
    <div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" onclick="saveSwing()">Save Diagnostic Data</button></div>`);
}
function buildImprove(){ buildPracticeSlot('improve','improve-wrap'); }
function buildResources(){
  buildPracticeSlot('resources','resources-wrap');
  const wrap=document.getElementById('resources-wrap');
  if(wrap) wrap.insertAdjacentHTML('beforeend', pgaProSectionHtml());
}
/* ---- Work With a PGA Professional — links to the official national PGA associations
   (the nine PGA World Alliance members; the CPG federates 30+ more national PGAs). ---- */
function pgaProSectionHtml(){
  const orgs=[
    ['PGA of America','USA','https://www.pga.com'],
    ['The PGA','Great Britain & Ireland','https://www.pga.info'],
    ['PGA of Canada','Canada','https://www.pgaofcanada.com'],
    ['PGA of Australia','Australia','https://www.pga.org.au'],
    ['PGA of Germany','Germany','https://www.pga.de'],
    ['PGA of Sweden','Sweden','https://www.pgasweden.com'],
    ['PGA of Japan','Japan','https://www.pga.or.jp'],
    ['PGA of South Africa','South Africa','https://www.pga.co.za'],
    ['Confederation of Professional Golf','Europe &amp; beyond — 30+ national PGAs','https://cpg.golf']
  ];
  const chips=orgs.map(([name,region,url])=>`<a href="${url}" target="_blank" rel="noopener" style="display:block;background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--green);border-radius:7px;padding:9px 11px;text-decoration:none">
      <div style="font-family:Arial,sans-serif;font-weight:800;font-size:.86rem;color:var(--ink)">${name} ↗</div>
      <div style="font-family:ui-monospace,monospace;font-size:.6rem;color:var(--muted);margin-top:2px">${region}</div>
    </a>`).join('');
  return `<div class="section-label" style="margin-top:26px">Work With a PGA Professional</div>
    <p class="intro-note">This app organises your knowledge and your numbers — it doesn't replace a coach's eye. For lessons, club fitting, and a professional read on anything the chain of causation surfaces, contact a certified professional through your national PGA. Every association below runs a member directory / find-a-pro service; the nine listed are the PGA World Alliance members, and the Confederation of Professional Golf federates 30+ further national PGAs worldwide.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">${chips}</div>`;
}

/* ---- reusable presentation helpers for Improve / Resources slots ---- */
function drillBlock(title,intro,items){
  return `<div class="lvl-subhead" style="margin-top:16px">${title}</div>`
    +(intro?`<div class="chain-caption" style="margin-top:4px">${intro}</div>`:'')
    +'<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">'
    +items.map(it=>`<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--c-iron);border-radius:7px;padding:9px 11px"><div style="font-family:Arial,sans-serif;font-weight:800;font-size:.86rem;color:var(--ink2)">${it[0]}</div><div style="font-family:Arial,sans-serif;font-size:.8rem;line-height:1.45;color:var(--muted);margin-top:2px">${it[1]}</div></div>`).join('')
    +'</div>';
}
function refNote(html){ return `<div class="chain-caption" style="margin-top:8px;line-height:1.55">${html}</div>`; }
/* expert/resource card — name, tag, work (book/system), contribution */
function expertCard(name,tag,work,contribution){
  return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--c-wedge);border-radius:7px;padding:10px 12px">`
    +`<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><div style="font-family:Arial,sans-serif;font-weight:800;font-size:.9rem;color:var(--ink2)">${name}</div><div style="font-family:ui-monospace,monospace;font-size:.5rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);white-space:nowrap">${tag}</div></div>`
    +(work?`<div style="font-family:Arial,sans-serif;font-style:italic;font-size:.78rem;color:var(--c-wedge);margin-top:2px">${work}</div>`:'')
    +`<div style="font-family:Arial,sans-serif;font-size:.8rem;line-height:1.45;color:var(--muted);margin-top:4px">${contribution}</div></div>`;
}
function expertList(title,intro,experts){
  return `<div class="lvl-subhead" style="margin-top:16px">${title}</div>`
    +(intro?`<div class="chain-caption" style="margin-top:4px">${intro}</div>`:'')
    +'<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">'
    +experts.map(e=>expertCard(e[0],e[1],e[2],e[3])).join('')
    +'</div>';
}
function forcesExperts(){
  return expertList('Top Voices — Forces & Torques','How force reaches the club, and what it does there.',[
    ['Dr. Steven M. Nesbit','Biomechanist','“A 3-D Kinematic & Kinetic Study of the Golf Swing” (2005)','The definitive measurement of the forces and torques a golfer applies to the club. The reference StrongerGolf defers to for force/torque naming and magnitudes.'],
    ['Dr. Sasho MacKenzie','Biomechanist','Golf-swing modeling & 3-D simulation','Modern authority on how force is applied to the club over time — the work and torque that actually create speed, and why <em>when</em> you apply force matters as much as how much.'],
    ['Homer Kelley','Theorist','“The Golfing Machine” (1969)','Catalogued how the hands deliver force — drag vs. drive loading, lever systems, and pressure points. The conceptual taxonomy behind Pull / Push / Twist.']
  ]);
}
function strategyExperts(){
  return expertList('Top Voices — Course Management & Strategy','Turning dispersion and expected value into targets.',[
    ['Scott Fawcett','Strategist','DECADE Golf','Dispersion-based strategy: pick targets from your shot pattern, not your best shot, and let expected value choose aggressive vs. conservative. The system behind the aim-point work to come.'],
    ['Mark Broadie','Researcher','“Every Shot Counts”','The strategy half of strokes gained — when to go for it, why “aim at the middle” usually wins, and how distance and dispersion set the optimal target.'],
    ['Mark Sweeney','Green-reading','AimPoint','Physics-based green reading: predict break from slope and speed rather than guessing. The reference for the putting-strategy side of course management.']
  ]);
}

/* ---- Score (L1) ---- */
function scoreImprove(){
  return `<div class="chain-caption" style="margin-top:0">Your Strokes Gained category averages (in <strong>Assess</strong>) point to the cheapest strokes to recover. Attack the most negative category first — that's where a fixed gap returns the most shots per round.</div>`
    +drillBlock('Scoring Priorities','Translate the SG diamond into a practice plan.',[
      ['Worst-category focus','Identify your most negative SG category and spend the next two weeks weighting practice toward it. Re-log rounds and watch the diamond change.'],
      ['Par-by-par audit','After each round, tag every bogey-or-worse with the link that caused it (decision, strike, or putt). Patterns surface fast.'],
      ['Bogey-avoidance game','On the course, play a round scored only on doubles+ avoided. Trains conservative targets where the SG math favours them.']
    ]);
}
function scoreResources(){
  return `<div class="lvl-subhead" style="margin-top:0">Strokes Gained — the idea</div>`
    +refNote(`Every shot is worth the expected strokes from where it started minus the expected strokes from where it finished, minus one for the stroke itself. Positive = you gained ground on the baseline; negative = you lost it.`)
    +refNote(`The four categories — <b style="color:#1a5aaa">Off the Tee</b>, <b style="color:#00853F">Approach</b>, <b style="color:#d96070">Around the Green</b>, <b style="color:#6b7280">Putting</b> — each map straight down this chain. A negative Approach number is usually a Ball-Flight (L2) or Forces (L3) problem; negative Putting points at green-reading and speed control.`)
    +expertList('Top Voices — Scoring & Strokes Gained','The data scientists behind every number in Assess.',[
      ['Mark Broadie','Researcher','“Every Shot Counts” (2014)','Columbia professor who invented Strokes Gained from PGA Tour ShotLink data — and proved approach play, not putting, separates skill levels most. The framework behind every category average here.'],
      ['Peter Sanders','Game analyst','ShotByShot.com','Pioneered strokes-gained-style amateur analysis years before it went mainstream — scoring each part of your game relative to your own handicap target, exactly how the Scenario Calculator is calibrated.'],
      ['Lou Stagner','Data analyst','Arccos / public golf data','Publishes the hard amateur numbers — real dispersion, expected strokes by distance, and how often good players actually hit greens. A reality check on what “good” really looks like.']
    ]);
}

/* ---- Ball Flight (L2) ---- */
function ballImprove(){
  return drillBlock('Face & Path Control','The D-plane says start line is mostly face, curve is face-relative-to-path. Train the two independently.',[
    ['Gate drill','Two tees a club-head-plus-a-few-mm apart just ahead of the ball. Clean strikes train a square, centred face — the start-line anchor.'],
    ['9-window flighting','Hit the same club to all nine start-line/curve combinations. Builds an internal feel for how face and path combine.'],
    ['Two-ball curve game','Alternate a deliberate draw then fade on every rep. Shaping on demand proves you own the path-to-face relationship, not just one stock shot.']
  ])
    +drillBlock('Strike Quality','Centeredness of strike drives spin, gear effect and dispersion (see Resources).',[
      ['Face spray / foot-powder','Mark the face. Tighten the heel-toe scatter before chasing speed — off-centre strike is the hidden cause of curve via gear effect.'],
      ['Tee-height ladder (driver)','Map how launch and spin change with tee height to find your low-spin window.']
    ]);
}
function ballLawsRef(){
  return `<div class="lvl-subhead" style="margin-top:0">Ball-Flight Laws (D-Plane)</div>`
    +refNote(`<strong>Start line ≈ face.</strong> The clubface direction at impact controls roughly <b>80–85%</b> of the ball's initial direction (more for irons, slightly less for the driver). Path contributes the small remainder.`)
    +refNote(`<strong>Curve = face relative to path.</strong> The ball curves <em>away</em> from the face-to-path difference. Face right of path → ball curves left (draw/hook); face left of path → curves right (fade/slice). Square them and it flies straight.`)
    +refNote(`<strong>Loft scales the curve.</strong> The same face-to-path gap curves a low-lofted club far more than a wedge — lower loft puts more of the spin on the tilted axis. That's why drivers slice and wedges don't.`)
    +refNote(`<strong>Gear effect.</strong> Off-centre strikes on a curved (wood) face add draw/fade spin: toe strikes draw, heel strikes fade. The deep face and high MOI of a driver make this dramatic; thin irons barely show it.`)
    +expertList('Top Voices — Ball Flight & Club Behaviour','From the physics to the radar that proved it.',[
      ['Theodore P. Jorgensen','Physicist','“The Physics of Golf” (1994)','Nebraska physicist who modeled the swing and the impact geometry underlying the D-plane — the rigorous starting point for everything on this page.'],
      ['Dr. David Tutelman','Engineer','tutelman.com — “Inside the D-Plane”','The clearest public derivation of the D-plane: how face and path combine in 3-D to set start line and curve. Translates the physics into plain geometry.'],
      ['Fredrik Tuxen','Engineer','TrackMan radar','Doppler-radar founder whose measurements validated the “new” ball-flight laws in the real world — confirming the face, not the path, owns ~80–85% of start direction.']
    ]);
}

/* ---- Forces & Torques (L3) ---- */
function forcesImprove(){
  return drillBlock('Release & Grip Pressure','Pull, Push and Twist are trained more by feel and pressure than by position.',[
    ['Pump drill','Rehearse the transition Pull (grip moving down the shaft line) two pumps, then fire. Grooves the early linear force without casting.'],
    ['Pressure-7 to 3','Rate grip pressure 1–10; rehearse starting soft (~3) and arriving firm only through impact. Late firmness times the Twist that squares the face.'],
    ['Split-grip swings','Hands apart on the shaft exaggerates the Push (clubhead orbiting the grip) so you feel release timing, then re-join.'],
    ['Towel-under-arms','Keeps the structure connected so the Pull transmits to the clubhead rather than leaking into arm lift.']
  ]);
}

/* ---- Kinematics & Ground Forces (L4) ---- */
function kinematicsImprove(){
  return drillBlock('Sequencing','Goal: pelvis → thorax → lead arm → club, each peaking later and faster than the link below it.',[
    ['Step-change drill','Start the downswing by replanting the lead foot. Forces a ground-up, proximal-to-distal order and kills the over-the-top thorax-first move.'],
    ['Pump-and-hold','Pump to halfway-down and freeze, checking the pelvis has already begun rotating open while the club still trails. Trains the lag in the sequence.'],
    ['Swoosh drill (shaft flip)','Hold the club at the head and swing; the loudest swoosh should be out front, past impact. Late swoosh = late peak = good sequence.']
  ])
    +drillBlock('Ground Forces','Weight should load trail-side, cross to lead-side in transition, with a vertical push just before impact (see Resources for the ideal trace).',[
      ['Trail-to-lead step','Slow-motion swings stepping onto the lead foot in transition to feel the pressure shift precede the arms.'],
      ['Vertical jump-and-turn','Small countermovement jumps while rotating to feel the vertical push-off that peaks ~1.5× body weight near impact.']
    ]);
}
function kinematicsResources(){
  return '<div class="lvl-subhead" style="margin-top:0">K-Vest / Cheetham Benchmarks</div>'
    +'<div style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1.6;margin:8px 0 12px;padding:8px 10px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">'
    +'<strong style="color:var(--ink2)">Skilled golfers:</strong> '
    +'Pelvis peaks &amp; decelerates before thorax peaks · each segment peaks later &amp; faster · arm→club ratio ~1.26× · club should reach peak at or just after impact</div>'
    +'<div class="lvl-subhead">StrongerGolf Measured — Kinematic Sequence</div>'
    +'<div class="chain-caption" style="margin-top:4px">Peak angular velocities from the Strong &amp; Zibrik K-Vest study (tour-level player, full driver). Proximal-to-distal order confirmed — each segment peaks faster than the one below it.</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;margin:8px 0 6px">'
    +['Pelvis|410|var(--c-wood)','Upper Body|552|var(--c-iron)','Club (grip)|1479|var(--grey)'].map(c=>{const[lbl,v,col]=c.split('|');return '<div style="flex:1;min-width:84px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:7px;padding:9px 6px"><div style="font-family:Arial,sans-serif;font-size:1.35rem;font-weight:800;color:'+col+';line-height:1">'+v+'</div><div style="font-family:ui-monospace,monospace;font-size:.46rem;color:var(--muted);letter-spacing:.06em">°/s peak</div><div style="font-family:Arial,sans-serif;font-size:.72rem;font-weight:700;color:var(--ink2);margin-top:3px">'+lbl+'</div></div>';}).join('')
    +'</div>'
    +'<div style="display:flex;justify-content:center;padding:2px 0 8px">'+buildKinematicSequenceSVG()+'</div>'
    +'<div style="font-family:ui-monospace,monospace;font-size:.5rem;color:var(--muted);line-height:1.6;margin-bottom:12px;padding:7px 10px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">'
    +'<strong style="color:var(--ink2)">Speed-gain ratios:</strong> Upper Body / Pelvis = <b>1.35×</b> · Club / Upper Body = <b>2.68×</b> — the summation-of-speed multiplier elite players share. Curves above peak proximal→distal (Lead Arm ~1,100°/s typical).</div>'
    +'<div class="lvl-subhead">Ground Reaction Forces — Ideal Vertical Trace</div>'
    +'<div class="chain-caption" style="margin-top:4px">Ideal vertical-force pattern: weight loads the <b style="color:var(--c-wood)">trail</b> foot in the backswing, crosses to the <b style="color:var(--c-wedge)">lead</b> foot in transition, and total vertical (<b style="color:var(--ink2)">dashed</b>) peaks ~1.5× body weight just before impact. <span class="placeholder-flag">representative</span></div>'
    +'<div style="display:flex;justify-content:center;padding:2px 0 8px">'+buildGRFTraceSVG()+'</div>'
    +expertList('Top Voices — Sequence & Ground Forces','The researchers behind the benchmarks above.',[
      ['Dr. Phil Cheetham','Biomechanist','AMM / K-Vest — the “signature” sequence','Pioneered the kinematic-sequence graph: the proximal-to-distal peak ordering every benchmark here is built on. The Strong & Zibrik study uses his methodology.'],
      ['Dr. Young-Hoo Kwon','Biomechanist','Kwon3D — golf biomechanics','Authority on 3-D kinematics and ground kinetics; his motion-analysis methods underpin how segment speeds and ground forces are measured and interpreted.'],
      ['Dr. Scott Lynn','Researcher','Swing Catalyst — force plates','Ground-reaction-force research separating vertical, horizontal and torque forces — the science behind the ideal vertical trace above and the push-off that peaks near impact.']
    ]);
}

/* ---- Body & Movement (L5) ---- */
function bodyImprove(){
  return `<div class="chain-caption" style="margin-top:0">Prescribe to the <em>failed</em> TPI screens in Assess — the limitation determines which swing faults are even avoidable. Clear the physical restriction first, then the movement.</div>`
    +drillBlock('Mobility',null,[
      ['Open-book (thoracic)','For limited thoracic rotation. Side-lying, rotate top arm open following the hand with the eyes; restores the turn that protects the lower back.'],
      ['90/90 hip switches','For limited hip internal/external rotation — the most common power-leak and a frequent early-extension cause.'],
      ['Standing wrist hinge','For wrist-hinge restriction; supports the lever and the Twist (L3) that squares the face.']
    ])
    +drillBlock('Stability',null,[
      ['Single-leg balance + reach','For failed single-leg balance — underpins the ground-force shift in L4.'],
      ['Pelvic-tilt control','Cat-camel and standing tilts to own the pelvis position that the squat/tilt screens test.']
    ]);
}
function bodyResources(){
  return `<div class="lvl-subhead" style="margin-top:0">Reading the TPI Screen</div>`
    +refNote(`<strong>A movement-quality filter, not a swing critique.</strong> Each test isolates whether a joint or pattern can do what an efficient swing asks of it. A "fail" means the body will <em>compensate</em> somewhere — and the compensation is usually the swing fault you see.`)
    +refNote(`<b>Mobility tests</b> (squat, pelvic/thoracic rotation, hip rotation, hamstring, wrist hinge) ask <em>"is the range available?"</em> <b>Stability tests</b> (single-leg balance, seated trunk rotation, lower-quarter rotation) ask <em>"can you control it?"</em> Classic links: limited hip internal rotation → early extension; limited thoracic rotation → over-the-top.`)
    +expertList('Top Voices — Body & Movement','Score how you move before how you swing.',[
      ['Dr. Greg Rose & Dave Phillips','TPI co-founders','Titleist Performance Institute','Built the body-swing connection model and the screen in Assess: physical limitations <em>cause</em> swing characteristics — train the body to unlock the movement, don\'t just drill the position.'],
      ['Gray Cook','Physical therapist','Functional Movement Screen (FMS)','Created the movement-quality screening philosophy TPI builds on — grade how you move first, and clear the limitation before training the skill on top of it.'],
      ['Dr. Stuart McGill','Spine biomechanist','“Back Mechanic” / spine research','The authority on spine mechanics and back health — essential context for the rotational loads golf places on the body and how to build resilient, powerful movement.']
    ]);
}

/* ---- Psychology & Philosophy (L6) ---- */
function psychImprove(){
  return drillBlock('Process & Routine','Make the mental game a repeatable procedure, not a mood.',[
    ['Think-box / play-box line','Do all thinking behind the ball (think-box); step over a commitment line into the play-box with one target and zero mechanics.'],
    ['Breath-reset trigger','One slow exhale as the trigger to start the routine — anchors arousal before every shot, especially under pressure.'],
    ['Bounce-back rule','Pre-decide your response to a bad shot (one acknowledgement, then re-focus on the next target). Trains the recovery-rate metric in Assess.'],
    ['Post-round 3-up','Log three process wins per round regardless of score. Builds the mastery orientation Fearless Golf is after.']
  ]);
}
function psychResources(){
  return expertList('Top Voices — Psychology & Philosophy','The frameworks behind the routines in Improve.',[
    ['Dr. Bob Rotella','Sport psychologist','“Golf is Not a Game of Perfect”','The foundational voice in golf psychology — play to a small target, accept the outcome, and protect a confident, present mindset. The basis of the pre-shot routine work in Improve.'],
    ['Pia Nilsson & Lynn Marriott','Coaches','VISION54','The think-box / play-box separation, "human skills" (attitude, focus, emotion, body language), and the belief that 18 birdies — a 54 — is reachable one shot at a time.'],
    ['Dr. Gio Valiante','Sport psychologist','“Fearless Golf”','<em>Mastery</em> orientation (process, curiosity) produces courage; <em>ego</em> orientation (outcome, comparison, fear of failure) produces tension. The goal: stay mastery-oriented under pressure.']
  ]);
}

function ballRefHtml(){
  /* pull a compact read-only summary from the bag performance data */
  const ids=['D','7i','P','S'];
  const stats=ids.map(id=>{const c=STATE.clubs.find(x=>x.id===id);const p=perf(id);if(!c||!p)return '';return `<span class="lvl-ref-stat">${c.label}: <b>${p.carry}</b>yd · ${p.spin?p.spin.toLocaleString()+'rpm':'—'} · ${p.land!=null?p.land+'°':'—'} land</span>`;}).join('');
  return `<div class="chain-caption">What the ball did — carry, launch, spin, height, descent and dispersion. This is the most directly measurable cause of score, and it's already captured in full on the <strong>Bag</strong> tab. A sample:</div>
    <div>${stats}</div>
    <div class="lvl-soon-note" style="margin-top:10px">Open the Bag tab to edit every club's full ball-flight profile and see trajectory &amp; dispersion plots.</div>`;
}

function toggleLevel(id){
  const card=document.querySelector(`.lvl-card[data-lvl="${id}"]`);
  if(!card)return;
  const open=card.classList.contains('open');
  document.querySelectorAll('.lvl-card').forEach(c=>c.classList.remove('open'));
  if(!open){ card.classList.add('open'); setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'nearest'}),60); }
}
function forceRow(name,desc,key){
  const f=STATE.swing.forces[key];
  const stages=[['transition','Transition'],['mid','Mid (7–8:00)'],['impact','Impact']];
  const stageCells=stages.map(([sk,slabel])=>{
    const s=f[sk]||{};
    return `<div class="force-stage">
      <div class="force-stage-label">${slabel}</div>
      <input class="metric-input fs-input" value="${escapeHtml(s.direction||'')}" data-swing="forces.${key}.${sk}.direction" placeholder="dir">
      <input class="metric-input fs-input" value="${escapeHtml(s.magnitude||'')}" data-swing="forces.${key}.${sk}.magnitude" placeholder="mag">
    </div>`;
  }).join('');
  const imgMap={
    pull:`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`,
    push:`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`,
    twist:`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`
  };
  const viewLabel={pull:'Grip-end view',push:'Side view',twist:'Angle view'};
  const imgSlot=`<div class="force-diagram">
    <img src="data:image/png;base64,${imgMap[key]}" alt="${name} diagram">
    <div class="force-diagram-caption">${viewLabel[key]}</div>
  </div>`;
  return `<div class="force-block">
    <div class="force-block-top">
      <div class="force-name-col">
        <div class="force-name">${name}</div>
        <div class="force-desc">${desc}</div>
      </div>
      ${imgSlot}
    </div>
    <div class="force-stages">${stageCells}</div>
  </div>`;
}
/* Elite Pull/Push/Twist magnitude profile through the downswing —
   StrongerGolf "3 Phases" study (Strong/Zibrik). % of max about the POI. */
/* Ideal / representative ground-reaction trace (vertical force, % body weight) — the
   established force-plate pattern: trail-loaded in the backswing, weight crosses to the
   lead foot, total vertical peaks (~1.5× BW) just before impact (counter-movement dip in
   transition). Generalised from force-plate research (Swing Catalyst / Lynn), not a single
   measured swing. */
function buildGRFTraceSVG(){
  const W=340,H=170,padL=30,padR=10,padT=12,padB=22, plotW=W-padL-padR, plotH=H-padT-padB, maxV=180;
  const lead =[[0,50],[0.2,40],[0.35,33],[0.5,42],[0.7,100],[0.8,130],[0.9,108],[1.1,90]];
  const trail=[[0,50],[0.2,62],[0.35,68],[0.5,55],[0.7,32],[0.8,25],[0.9,24],[1.1,28]];
  const total=lead.map((p,i)=>[p[0], p[1]+trail[i][1]]);
  const X=t=>padL+Math.min(1.1,t)/1.1*plotW, Y=v=>padT+(1-v/maxV)*plotH;
  const poly=(arr,col,w,dash)=>`<polyline points="${arr.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}"${dash?' stroke-dasharray="4,3"':''}/>`;
  let grid='';
  [0,50,100,150].forEach(g=>{const y=Y(g);grid+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(padL+plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/><text x="${padL-4}" y="${(y+3).toFixed(1)}" text-anchor="end" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">${g}</text>`;});
  const ix=X(0.8);
  const impact=`<line x1="${ix.toFixed(1)}" y1="${padT}" x2="${ix.toFixed(1)}" y2="${(padT+plotH).toFixed(1)}" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/><text x="${ix.toFixed(1)}" y="${(padT+plotH+9).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6" fill="var(--ink2)">impact</text>`;
  const xlab=`<text x="${padL}" y="${H-3}" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">address</text><text x="${(padL+plotW).toFixed(1)}" y="${H-3}" text-anchor="end" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">finish</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:380px;display:block" xmlns="http://www.w3.org/2000/svg">${grid}${impact}${poly(total,'var(--ink2)',1.6,true)}${poly(trail,'var(--c-wood)',2.2)}${poly(lead,'var(--c-wedge)',2.2)}${xlab}</svg>`;
}
/* Reusable "current (measured) vs ideal (goal)" metric — editable current + target + Δ. */
function metricGoal(label, unit, path, ideal){
  const raw=getPath(STATE.swing,path);
  const cur=(raw===''||raw==null)?null:parseFloat(raw);
  const tol=Math.max(2,Math.abs(ideal)*0.1);
  const delta=(cur!=null&&!isNaN(cur))?cur-ideal:null;
  const onT=delta!=null&&Math.abs(delta)<=tol;
  const dCol=delta==null?'var(--muted)':onT?'var(--green)':'var(--gold)';
  const dTxt=delta==null?'—':(delta>0?'+':'')+(+delta.toFixed(1))+(unit?' '+unit:'')+(onT?' ✓':'');
  return `<div class="mg-box">
    <div class="mg-label">${label}</div>
    <div class="mg-vals">
      <div class="mg-cur"><input class="mg-input" value="${escapeHtml(raw)}" data-swing="${path}" inputmode="decimal" placeholder="—"><div class="mg-tag">current</div></div>
      <div class="mg-arrow">→</div>
      <div class="mg-ideal"><div class="mg-ideal-val">${ideal}</div><div class="mg-tag">ideal</div></div>
    </div>
    <div class="mg-delta" style="color:${dCol}">${dTxt}</div>
  </div>`;
}
/* Elite kinematic sequence — proximal-to-distal angular-velocity curves.
   Measured peaks (Strong/Zibrik K-Vest): Pelvis 410, Thorax 552, Club 1479 °/s;
   Lead Arm ~1100 typical. Each peaks faster & later than the one below. */
function buildKinematicSequenceSVG(){
  const W=340,H=168,padL=30,padR=10,padT=12,padB=22, plotW=W-padL-padR, plotH=H-padT-padB, maxV=1600;
  const segs=[
    {name:'Pelvis',  color:'var(--c-wood)',  peakT:0.42, peak:410, w:0.30},
    {name:'Thorax',  color:'var(--c-iron)',  peakT:0.60, peak:552, w:0.26},
    {name:'Lead Arm',color:'var(--c-wedge)', peakT:0.80, peak:1100,w:0.22},
    {name:'Club',    color:'var(--grey)',    peakT:0.97, peak:1479,w:0.18}
  ];
  const X=t=>padL+Math.min(1.12,t)/1.12*plotW, Y=v=>padT+(1-v/maxV)*plotH;
  let grid='';
  [0,400,800,1200,1600].forEach(g=>{const y=Y(g);grid+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(padL+plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/><text x="${padL-4}" y="${(y+3).toFixed(1)}" text-anchor="end" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">${g}</text>`;});
  const ix=X(0.97);
  const impact=`<line x1="${ix.toFixed(1)}" y1="${padT}" x2="${ix.toFixed(1)}" y2="${(padT+plotH).toFixed(1)}" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/><text x="${ix.toFixed(1)}" y="${(padT+plotH+9).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6" fill="var(--ink2)">impact</text>`;
  let lines='',peaks='';
  segs.forEach(s=>{
    const pts=[];
    for(let t=0;t<=1.12;t+=0.035){ const dt=t-s.peakT; pts.push(X(t).toFixed(1)+','+Y(s.peak*Math.exp(-(dt*dt)/(2*s.w*s.w))).toFixed(1)); }
    lines+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
    peaks+=`<circle cx="${X(s.peakT).toFixed(1)}" cy="${Y(s.peak).toFixed(1)}" r="2.6" fill="${s.color}"/>`;
  });
  const xlab=`<text x="${padL}" y="${H-3}" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">transition</text><text x="${(padL+plotW).toFixed(1)}" y="${H-3}" text-anchor="end" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">follow-through</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:380px;display:block" xmlns="http://www.w3.org/2000/svg">${grid}${impact}${lines}${peaks}${xlab}</svg>`;
}
function buildForceProfileSVG(){
  const W=340,H=152,padL=26,padR=66,padT=14,padB=24;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const labels=['Top','9:00','7:00','Impact'];
  const series=[
    {name:'Pull', color:'var(--c-iron)',  vals:[22,53,88,100]},
    {name:'Push', color:'var(--c-wood)',  vals:[25,66,100,0]},
    {name:'Twist',color:'var(--c-wedge)', vals:[15,45,50,95]},
  ];
  const X=i=>padL+(i/(labels.length-1))*plotW;
  const Y=v=>padT+(1-v/100)*plotH;
  let grid='';
  [0,25,50,75,100].forEach(g=>{const y=Y(g);grid+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(padL+plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/><text x="${padL-4}" y="${(y+2.5).toFixed(1)}" text-anchor="end" font-family="ui-monospace,monospace" font-size="6" fill="var(--muted)">${g}</text>`;});
  let xlab='';
  labels.forEach((l,i)=>{xlab+=`<text x="${X(i).toFixed(1)}" y="${H-padB+12}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="var(--ink2)">${l}</text>`;});
  let lines='', legend='';
  series.forEach((s,si)=>{
    const pts=s.vals.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    lines+=`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    s.vals.forEach((v,i)=>{lines+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.4" fill="${s.color}"/>`;});
    const ly=padT+2+si*13;
    legend+=`<line x1="${(padL+plotW+10).toFixed(1)}" y1="${ly+4}" x2="${(padL+plotW+22).toFixed(1)}" y2="${ly+4}" stroke="${s.color}" stroke-width="2.5"/><text x="${(padL+plotW+26).toFixed(1)}" y="${ly+6.5}" font-family="ui-monospace,monospace" font-size="7" fill="var(--ink2)">${s.name}</text>`;
  });
  const ann=`<text x="${X(2).toFixed(1)}" y="${(Y(100)-4).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5.5" fill="var(--c-wood)">~30 lb</text><text x="${X(3).toFixed(1)}" y="${(Y(100)-4).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="5.5" fill="var(--c-iron)">~100 lb</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:360px;display:block" xmlns="http://www.w3.org/2000/svg">${grid}${lines}${ann}${xlab}${legend}</svg>`;
}
function saveSwing(){
  document.querySelectorAll('[data-swing]').forEach(el=>setPath(STATE.swing,el.getAttribute('data-swing'),el.value));
  saveState(); toast('Swing data saved');
}
function getPath(o,p){return p.split('.').reduce((a,k)=>a&&a[k]!=null?a[k]:'',o);}
function setPath(o,p,v){const ks=p.split('.');let cur=o;for(let i=0;i<ks.length-1;i++){cur[ks[i]]=cur[ks[i]]||{};cur=cur[ks[i]];}cur[ks[ks.length-1]]=v;}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}



/* ============================================================
   PER-CLUB D-PLANE TENDENCIES (Practice L2) + Course Strategy (Plan)
   Stock shape & curve derived from horizontal face vs path, loft-scaled
   (lower loft curves more). Feeds Bag dispersion + Plan hole overlays.
   ============================================================ */
function dplaneShape(hFace,hPath,vFace,vPath,carry){
  hFace=+hFace||0; hPath=+hPath||0; vFace=+vFace||0; vPath=+vPath||0; carry=carry||150;
  /* Exact engine. VFace = Dynamic Loft, VPath = Angle of Attack.
     SpinAxis = atan(HDiff/VDiff); 3D SpinLoft = √(VDiff²+HDiff²). */
  const r = dpSolve(hFace, hPath, vFace, vPath, carry);
  return {
    shape: r.shape,
    start: +r.hLaunch.toFixed(1),
    curve: Math.round(Math.abs(r.curveYds)),
    spinAxis: +r.spinAxis.toFixed(1),
    spinLoft: +r.spinLoft.toFixed(1),
    hdiff: r.hDiff
  };
}
function dplFmt(v){ v=+v||0; return Math.abs(v)<0.05?'0.0':(v>0?'+':'')+v.toFixed(1); }
function buildDplaneGrid(){
  const clubs=STATE.clubs.filter(c=>c.type!=='putter');
  const th='padding:5px 4px;font-family:ui-monospace,monospace;font-size:.5rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg2);text-align:center';
  const th2=th+';line-height:1.2;font-size:.62rem;color:var(--ink2)';
  let html=`<div style="overflow-x:auto"><table class="dpl-table"><thead><tr>
    <th style="${th};text-align:left;padding-left:8px">Club</th>
    <th style="${th2}">Horiz.<br>Face°</th><th style="${th2}">Horiz.<br>Path°</th>
    <th style="${th2}">Vert. Face°<br>(Dyn Loft)</th><th style="${th2}">Vert. Path°<br>(AoA)</th>
    <th style="${th2}">Vert. Plane°<br>(Swing Pln)</th></tr></thead><tbody>`;
  clubs.forEach(c=>{
    const d=(STATE.dplane&&STATE.dplane[c.id])||{};
    const vFace=d.vFace!=null?d.vFace:parseFloat(c.loft)||30;   // fallback to static loft
    const sel=c.id===window.dpVisClub?' style="background:var(--bg2)"':'';
    const inp=(field,val,ph)=>`<input class="dpl-input" id="dpl-in-${c.id}-${field}" value="${escapeHtml(val==null?'':val)}"${ph?` placeholder="${ph}"`:''} inputmode="decimal" oninput="setDplaneCell('${c.id}','${field}',this.value)">`;
    html+=`<tr${sel}>
      <td onclick="setDpVisClub('${c.id}')" title="Show this club in the 3D render" style="padding:5px 8px;white-space:nowrap;cursor:pointer"><span style="font-family:Arial,sans-serif;font-weight:800;font-size:.85rem;color:var(--ink)">${c.label}</span> <span style="font-family:ui-monospace,monospace;font-size:.56rem;color:var(--muted)">${c.loft}</span></td>
      <td>${inp('hFace',d.hFace)}</td>
      <td>${inp('hPath',d.hPath)}</td>
      <td>${inp('vFace',vFace)}</td>
      <td>${inp('aoa',d.aoa)}</td>
      <td>${inp('vPlane',d.vPlane,'~'+dpEstVPlane(c.loft))}</td>
    </tr>`;
  });
  return html+'</tbody></table></div>';
}
function setDplaneCell(id,field,value){
  if(!STATE.dplane) STATE.dplane={};
  if(!STATE.dplane[id]) STATE.dplane[id]={hFace:0,hPath:0,aoa:0};
  /* cleared cell → drop the override so the estimate/static fallback applies
     (previously a cleared Dyn Loft was stored as 0°, breaking the wedge) */
  if(String(value).trim()==='') delete STATE.dplane[id][field];
  else STATE.dplane[id][field]=parseFloat(value)||0;
  if(id===window.dpVisClub) window.dpSand=null;   // grid is authoritative → reseed the sandbox
  if(typeof buildCourseStrategy==='function') buildCourseStrategy();
  if(typeof renderDPlaneVisual==='function') renderDPlaneVisual();
  saveState();
}
/* ---- Strategy preferences (Plan → Strategy) ---- */
const STRAT_OPTS = {
  teeTarget:[['left-edge','Left edge of fairway'],['left-centre','Left-centre of fairway'],['centre','Centre of fairway'],['right-centre','Right-centre of fairway'],['right-edge','Right edge of fairway'],['shortest','Favour the shortest / most direct route'],['widest','Favour the widest side']],
  teeClub:[['driver-often','Driver as often as possible'],['optimal','Whatever the optimal shot is'],['conservative','Conservative — club down when in doubt']],
  approachTarget:[['left-edge','Left edge of green'],['left-centre','Left-centre of green'],['centre','Centre of green'],['right-centre','Right-centre of green'],['right-edge','Right edge of green'],['at-flag','At the flag'],['flag-centre','Between the flag and the centre']],
  approachDistance:[['pin-high','Always play pin-high'],['middle','Always play the middle of the green'],['fat','Short of back pins, long of front pins (favour centre depth)'],['pin-seek','Attack the pin when comfortable']],
  riskPosture:[['balanced','Stroke play — balanced (lowest expected score)'],['chase','Chasing — aggressive (chase birdies, accept risk)'],['protect','Protecting a lead — conservative (avoid big numbers)'],['match','Match play — hole-by-hole vs opponent']]
};
const RISK_NOTE={
  balanced:'Aim optimiser minimises <b>expected strokes</b> — the standard, all-round play.',
  chase:'Final-9 chase: optimiser favours <b>upside</b> (birdie chances) over the mean — attack flags, take on carries, accept more bogey risk to make up ground.',
  protect:'Protecting a lead: optimiser minimises <b>downside</b> — fat of the green, lay up from trouble, club down. Trades a little expected score to kill double-bogeys.',
  match:'Match play: the goal each hole is to <b>beat your opponent</b>, not shoot the lowest mean. Truly opponent-aware aim needs to know their lie/score — a future feature (e.g. Trackman online matches feeding live opponent status). For now it plays a touch more aggressive than balanced.'
};
function setStrategy(key,val){ STATE.strategy=STATE.strategy||{}; STATE.strategy[key]=val; saveState();
  document.querySelectorAll('.strat-summary').forEach(s=>s.innerHTML=stratSummary());
  if(key==='riskPosture'){ const n=RISK_NOTE[val]||''; document.querySelectorAll('.strat-risk-note').forEach(e=>e.innerHTML=n); }
}
function stratLabel(key){ const cur=(STATE.strategy||{})[key]; const o=(STRAT_OPTS[key]||[]).find(x=>x[0]===cur); return o?o[1]:'—'; }
function stratSelect(key){
  const cur=(STATE.strategy||{})[key];
  return `<select class="strat-select" onchange="setStrategy('${key}',this.value)">`+
    STRAT_OPTS[key].map(([v,l])=>`<option value="${v}"${v===cur?' selected':''}>${l}</option>`).join('')+`</select>`;
}
function stratSummary(){
  return `Tee: <b>${stratLabel('teeTarget')}</b> · ${stratLabel('teeClub').toLowerCase()}.<br>Approach: <b>${stratLabel('approachTarget')}</b> · ${stratLabel('approachDistance').toLowerCase()}.`;
}
function buildStrategyPrefs(){
  return `<div class="section-label">Strategy Preferences <span class="proto-badge">prototype</span></div>
    <p class="intro-note">Your default targeting tendencies. These will drive the expected-value aim points once hole maps are traced (short game &amp; putting strategy to follow).</p>
    <div class="strat-block"><div class="strat-block-h" style="color:var(--sky)">Tee Shots</div>
      <div class="strat-card"><div class="strat-q">Target preference</div>${stratSelect('teeTarget')}</div>
      <div class="strat-card"><div class="strat-q">Club preference</div>${stratSelect('teeClub')}</div>
    </div>
    <div class="strat-block"><div class="strat-block-h" style="color:var(--green)">Approach Shots</div>
      <div class="strat-card"><div class="strat-q">Target preference</div>${stratSelect('approachTarget')}</div>
      <div class="strat-card"><div class="strat-q">Distance strategy</div>${stratSelect('approachDistance')}</div>
    </div>
    <div class="strat-block"><div class="strat-block-h" style="color:var(--gold)">Round Situation</div>
      <div class="strat-card"><div class="strat-q">Risk posture</div>${stratSelect('riskPosture')}</div>
      <div class="strat-risk-note">${RISK_NOTE[(STATE.strategy||{}).riskPosture||'balanced']}</div>
    </div>
    <div class="strat-note strat-summary">${stratSummary()}</div>`;
}
function buildCourseStrategy(){
  const wrap=document.getElementById('course-strategy-wrap'); if(!wrap) return;
  const clubs=STATE.clubs.filter(c=>c.type!=='putter');
  let draws=0,fades=0,straight=0;
  const rows=clubs.map(c=>{
    const d=(STATE.dplane&&STATE.dplane[c.id])||{};
    const vFace=d.vFace!=null?d.vFace:parseFloat(c.loft)||30;
    const p=perf(c.id)||{};
    const sh=dplaneShape(d.hFace,d.hPath,vFace,d.aoa,p.carry||150);
    if(sh.shape==='Draw')draws++; else if(sh.shape==='Fade')fades++; else straight++;
    const col=sh.shape==='Draw'?'var(--green)':sh.shape==='Fade'?'var(--c-wood)':'var(--muted)';
    const curveTxt=sh.shape==='Straight'?'':sh.curve<1?' min':` ~${sh.curve}y`;
    return `<div class="cs-club"><span class="cs-club-lbl">${c.label}</span><span class="cs-shape" style="color:${col}">${sh.shape}${curveTxt}</span></div>`;
  }).join('');
  const predominant = draws>fades&&draws>=straight?'a predominant draw' : fades>draws&&fades>=straight?'a predominant fade' : 'a mostly straight ball flight';
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:0">Course Strategy <span class="proto-badge">prototype</span></div>
    ${buildStrategyPrefs()}
    <p class="intro-note" style="margin-top:18px">Your bag plays <strong>${predominant}</strong>. These per-club ball-flight tendencies (set in the D-Plane Lab) are the foundation for hole-by-hole aim points — favouring the side your stock shape works <em>away</em> from trouble.</p>
    <div class="section-label">Predominant Ball Flight by Club</div>
    <div class="cs-grid">${rows}</div>
    <div class="section-label">Hole Overlays</div>
    <div class="lvl-soon-note">Coming: each hole's layout with your dispersion cone and stock shape overlaid, plus the expected-value aim point that keeps your predominant curve working away from hazards. Feeds from the per-club tendencies above and your Stock Shots dispersion data.</div>`;
}

/* ---- THE D-PLANE LAB — its own top-level page (#page-dplane). One place to build and
   demonstrate ANY shot: the rotatable 3D impact-geometry render, shot presets, the
   ball-speed sandbox, and the per-club stock-shot tendencies grid. ---- */
function buildDplaneLab(){
  const wrap=document.getElementById('dplane-lab-wrap'); if(!wrap) return;
  wrap.innerHTML=`
    <div class="section-label" style="margin-top:0">The D-Plane Lab — Impact Geometry &amp; Ball Flight</div>
    <div class="chain-caption" style="margin-top:4px">The rotatable 3D render — <strong>drag to pan, middle-drag or two fingers to orbit, scroll or pinch to zoom</strong>, snap views below, double-tap to reset — shows the <span style="color:#4a7aaa;font-weight:700">impact plane</span>, the <span style="color:#c43c9e;font-weight:700">path</span> &amp; <span style="color:#2a6fc4;font-weight:700">face</span> vectors, the <span style="color:#b8860b;font-weight:700">D-plane</span> wedge, the perpendicular <span style="color:#cc2a2a;font-weight:700">spin axis</span>, and the <strong>simulated ball flight</strong> (drag + spin lift, 5–200 mph, calibrated to your Bag captures at stock). Shot presets load the 9-window drill and short-game shots; the sliders explore freely and only touch your stored tendencies when you <strong>save as stock</strong>. <span class="placeholder-flag">prototype</span></div>
    <div class="dpl-vis-main"><div id="dplane-visual"></div></div>
    <div class="lvl-subhead" style="margin-top:16px">Stock-Shot Tendencies by Club</div>
    <div class="chain-caption" style="margin-top:4px">Each club's <strong>stock-shot</strong> impact geometry: horizontal face, horizontal path, vertical face (dyn loft), vertical path (attack angle) and vertical swing plane (degrees, left −/right +; blank plane = estimated from loft). Tap a club to load it into the lab above; typed edits save automatically.</div>
    <div class="dpl-grid-col">${buildDplaneGrid()}</div>`;
  renderDPlaneVisual();
}

/* ---- D-Plane 3D visual — rotatable orbit render of the Impact Plane,
   the D-plane, and the expected ball flight (scaled to the club's captured Bag data). ---- */
function setDpVisClub(id){ window.dpVisClub=id; window.dpStrike={th:0,hl:0}; window.dpSand=null; renderDPlaneVisual(); }
/* World-space D-plane vectors (x=lateral right, y=up, z=toward target).
   Launch uses the engine's spin-loft-keyed face fraction, matching the readout. */
function dpWorldVectors(hFace,hPath,vFace,vPath){
  const DR=Math.PI/180, L=2.5;
  const vec=(h,v,len)=>({x:Math.sin(h*DR)*len, y:Math.sin(v*DR)*len, z:Math.cos(v*DR)*Math.cos(h*DR)*len});
  const path=vec(hPath,vPath,L), face=vec(hFace,vFace,L), tgt=vec(0,0,L);
  const f=dpFaceFraction(dp3DSpinLoft(dpVDiff(vFace,vPath), dpHDiff(hFace,hPath)));
  const launch={x:path.x+f*(face.x-path.x),y:path.y+f*(face.y-path.y),z:path.z+f*(face.z-path.z)};
  let nx=path.y*face.z-path.z*face.y, ny=path.z*face.x-path.x*face.z, nz=path.x*face.y-path.y*face.x;
  const nl=Math.hypot(nx,ny,nz)||1;
  return {O:{x:0,y:0,z:0}, path, face, tgt, launch, axis:{x:nx/nl,y:ny/nl,z:nz/nl}};
}
/* Spin axis (− = left/draw, + = right/fade) → 7-bucket ball-flight category. */
function dpBallFlight(axis){
  const a=Math.abs(axis);
  if(a<1) return 'Straight';
  if(axis<0) return a<3?'Slight Draw':a<8?'Draw':'Hook';
  return a<3?'Slight Fade':a<8?'Fade':'Slice';
}
/* Orbit-camera presets (azimuth° around vertical, elevation° above the ground);
   the old fixed DTL / Face-On / Overhead views live on as snap positions. */
const DP_CAMS={
  iso: {az:34, el:22, name:'¾ View'},
  dtl: {az:0,  el:9,  name:'Down the Line'},
  face:{az:88, el:9,  name:'Face-On'},
  top: {az:0,  el:86, name:'Overhead'}
};
window.dpCam={az:DP_CAMS.iso.az, el:DP_CAMS.iso.el, zoom:1, pan:{x:0,y:0,z:0}};
/* presets re-frame the scene: rotation + pan reset, zoom kept */
function dpSetCam(key){ const v=DP_CAMS[key]; if(!v) return; window.dpCam={az:v.az,el:v.el,zoom:window.dpCam.zoom||1,pan:{x:0,y:0,z:0}}; dpRenderScene(); }
/* Screen-right R, screen-up U and toward-camera D bases from azimuth/elevation. */
function dpCamBasis(azDeg,elDeg){
  const az=azDeg*DPLANE_DEG, el=elDeg*DPLANE_DEG;
  return {
    R:{x:Math.cos(az), y:0, z:Math.sin(az)},
    U:{x:-Math.sin(el)*Math.sin(az), y:Math.cos(el), z:Math.sin(el)*Math.cos(az)},
    D:{x:Math.sin(az)*Math.cos(el), y:Math.sin(el), z:-Math.cos(az)*Math.cos(el)}
  };
}
/* Off-centre strike (dimples toward toe + / heel −, high + / low −) for gear-effect
   preview. Ephemeral by design — full-shot intent is the centre of percussion. */
function dpStrikeTxt(field,v){
  v=parseInt(v)||0;
  if(!v) return 'centre';
  return field==='th' ? Math.abs(v)+(v>0?' toe':' heel') : Math.abs(v)+(v>0?' high':' low');
}
function dpSetStrike(field,val){
  window.dpStrike=window.dpStrike||{th:0,hl:0};
  window.dpStrike[field]=parseInt(val)||0;
  const sp=document.getElementById(`dpv-strike-${field}-v`); if(sp) sp.textContent=dpStrikeTxt(field,val);
  dpRenderScene();
}
/* Project the scene through the current orbit camera and redraw the SVG. Painter's
   algorithm: ground+grid always first (nothing goes below it, camera stays above),
   then every other primitive depth-sorted by centroid distance toward the camera. */
function dpRenderScene(){
  const sceneEl=document.getElementById('dpv-scene'); if(!sceneEl) return;
  const DR=DPLANE_DEG, id=window.dpVisClub;
  const c=STATE.clubs.find(x=>x.id===id)||{}, d=(STATE.dplane&&STATE.dplane[id])||{};
  if(!window.dpSand||window.dpSand._club!==id) dpSeedSand(id);
  const o=window.dpSand;
  const hFace=o.hFace, hPath=o.hPath, vFace=o.vFace, aoa=o.aoa, bspd=Math.max(5,o.bspd);
  const staticLoft=parseFloat(c.loft)||30;
  const vPlane=d.vPlane!=null?+d.vPlane:dpEstVPlane(c.loft);
  const hPlane=dpHPlane(aoa,vPlane,hPath);
  const p=perf(id)||{};
  const r=dpSolve(hFace,hPath,vFace,aoa,p.carry||150);
  /* Gear effect from the strike preview (centre → zero shift): toe/heel tilts the
     spin axis (woods far more than irons), low adds spin / high sheds it. */
  const st=window.dpStrike||{th:0,hl:0};
  const gearAxis=dpGearAxisShift(st.th, c.type==='wood'?'wood':'iron');
  const axisEff=r.spinAxis+gearAxis;
  /* Calibrate the sim to this club's captured Bag numbers at its STORED stock
     settings, then apply those factors to whatever the sliders explore. */
  const vF0=d.vFace!=null?+d.vFace:staticLoft;
  const r0=dpSolve(+d.hFace||0,+d.hPath||0,vF0,+d.aoa||0,p.carry||150);
  const bs0=(p.bspd>0)?+p.bspd:dpEstBspd(staticLoft);
  const spin0est=dpSpinEst(bs0,r0.spinLoft);
  const spinCal=(p.spin>0)?Math.max(0.5,Math.min(1.8,p.spin/spin0est)):1;
  const sim0=dpFlightSim(bs0,Math.max(0.5,r0.vLaunch),0,(p.spin>0?+p.spin:spin0est),0);
  const carryCal=(p.carry>0)?Math.max(0.7,Math.min(1.35,p.carry/Math.max(5,sim0.carry))):1;
  const apexCal=(p.ht>0)?Math.max(0.6,Math.min(1.6,p.ht/Math.max(3,sim0.apex))):1;
  /* Current shot: spin from ball speed × spin loft (per-club calibrated; low strike
     adds spin, high sheds it), then the full flight from the integrator. */
  /* clamp AFTER calibration so a saturated raw estimate can't freeze the wedge range */
  const spinUsed=Math.max(200,Math.min(13500,Math.round(dpSpinEst(bspd,r.spinLoft)*spinCal*(1-0.07*st.hl))));
  const sim=dpFlightSim(bspd,Math.max(0.2,r.vLaunch),r.hLaunch,spinUsed,axisEff);
  const carryShow=sim.carry*carryCal, apexShow=sim.apex*apexCal, curveShow=sim.curve*carryCal;
  const rollYd=dpRollEst(sim.land,spinUsed,carryShow);

  const wv=dpWorldVectors(hFace,hPath,vFace,aoa);
  const cam=dpCamBasis(window.dpCam.az, window.dpCam.el);
  const pan=window.dpCam.pan||{x:0,y:0,z:0};
  const VW=340, VH=250, CEN={x:0+pan.x,y:0.85+pan.y,z:3.0+pan.z}, SC=31*(window.dpCam.zoom||1);
  const P=pt=>({x:VW/2+((pt.x-CEN.x)*cam.R.x+(pt.y-CEN.y)*cam.R.y+(pt.z-CEN.z)*cam.R.z)*SC,
                y:VH/2-((pt.x-CEN.x)*cam.U.x+(pt.y-CEN.y)*cam.U.y+(pt.z-CEN.z)*cam.U.z)*SC});
  const dep=pt=>pt.x*cam.D.x+pt.y*cam.D.y+pt.z*cam.D.z;
  const XY=pt=>{const q=P(pt);return q.x.toFixed(1)+','+q.y.toFixed(1);};
  const line=(a,b,col,w,op,dash)=>{const qa=P(a),qb=P(b);
    return `<line x1="${qa.x.toFixed(1)}" y1="${qa.y.toFixed(1)}" x2="${qb.x.toFixed(1)}" y2="${qb.y.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${op!=null?op:1}"${dash?` stroke-dasharray="${dash}"`:''}/>`;};

  /* Frame auto-fit: carry AND most of the roll stay in frame; ydPerUnit converts
     scene units back to (calibrated) yards for the downrange grid + markers. */
  const GX=3.0, GZ0=-1.0, GZ1=7.8, zc=6.0;
  const rollM=rollYd/(1.09361*Math.max(0.2,carryCal));
  const fitZ=Math.max(3, sim.zland + rollM*0.9);
  const fscale=Math.min(zc/Math.max(3,sim.zland), 7.35/fitZ);
  const ydPerUnit=1.09361*carryCal/fscale;

  /* far layer: ground, long-drive-grid yardage lines, centre (target) line */
  let far=`<polygon points="${XY({x:-GX,y:0,z:GZ0})} ${XY({x:GX,y:0,z:GZ0})} ${XY({x:GX,y:0,z:GZ1})} ${XY({x:-GX,y:0,z:GZ1})}" fill="#8cbb6e"/>`;
  for(let gx=-3;gx<=3;gx++) far+=line({x:gx,y:0,z:GZ0},{x:gx,y:0,z:GZ1},'#7aa860',0.4,0.4);
  const stepArr=[1,2,5,10,25,50,100], maxYd=GZ1*ydPerUnit;
  const step=stepArr.find(s=>maxYd/s<=7)||100;
  for(let yd=step; yd<=maxYd; yd+=step){
    const gz=yd/ydPerUnit;
    far+=line({x:-GX,y:0,z:gz},{x:GX,y:0,z:gz},'#eef6ee',0.9,0.65);
    const gq=P({x:GX,y:0,z:gz});
    far+=`<text x="${(gq.x+3).toFixed(1)}" y="${(gq.y+2).toFixed(1)}" font-family="ui-monospace,monospace" font-size="6.5" font-weight="700" fill="#2f6a40" stroke="#fff" stroke-width="1.8" paint-order="stroke" opacity="0.9">${yd}${yd===step?' yd':''}</text>`;
  }
  far+=line({x:-GX,y:0,z:0},{x:GX,y:0,z:0},'#eef6ee',0.9,0.5);            // tee line
  far+=line({x:0,y:0,z:GZ0+0.4},{x:0,y:0,z:GZ1},'#f2f7f2',1.4,0.8);       // centre / target line

  const prims=[];
  const add=(pts,svg,bias)=>{let s=0;pts.forEach(q=>{s+=dep(q);});prims.push({d:s/pts.length+(bias||0),svg});};

  /* Impact plane: base line on the ground at the hPlane azimuth, tilted vPlane° up
     toward the golfer's side (−x for RH). Contains the path vector by Law 1. */
  const hp=hPlane*DR, vp=vPlane*DR;
  const b={x:Math.sin(hp), y:0, z:Math.cos(hp)};
  const s={x:-Math.cos(vp)*Math.cos(hp), y:Math.sin(vp), z:Math.cos(vp)*Math.sin(hp)};
  const A1={x:-1.3*b.x, y:0, z:-1.3*b.z}, A2={x:2.1*b.x, y:0, z:2.1*b.z};
  const A3={x:A2.x+2.6*s.x, y:2.6*s.y, z:A2.z+2.6*s.z}, A4={x:A1.x+2.6*s.x, y:2.6*s.y, z:A1.z+2.6*s.z};
  add([A1,A2,A3,A4],
    `<polygon points="${XY(A1)} ${XY(A2)} ${XY(A3)} ${XY(A4)}" fill="#6f93b8" fill-opacity="0.17" stroke="#4a7aaa" stroke-width="1" stroke-opacity="0.75"/>`
    +line(A1,A2,'#4a7aaa',1.6,0.85));

  /* D-plane wedge + path / face vectors + spin axis */
  add([wv.O,wv.path,wv.face],
    `<polygon points="${XY(wv.O)} ${XY(wv.path)} ${XY(wv.face)}" fill="#efc81e" fill-opacity="0.55" stroke="#b8860b" stroke-width="1"/>`);
  add([wv.O,wv.path], line(wv.O,wv.path,'#c43c9e',2.4), 0.02);
  add([wv.O,wv.face], line(wv.O,wv.face,'#2a6fc4',2.4), 0.02);
  const axA={x:wv.launch.x+wv.axis.x, y:wv.launch.y+wv.axis.y, z:wv.launch.z+wv.axis.z};
  const axB={x:wv.launch.x-wv.axis.x, y:wv.launch.y-wv.axis.y, z:wv.launch.z-wv.axis.z};
  add([axA,axB], line(axB,axA,'#cc2a2a',1.9), 0.02);

  /* Ball flight — simulated points (metres) scaled by the auto-fit frame */
  const fpts=sim.pts.map(q=>({x:q.x*fscale, y:q.y*fscale, z:q.z*fscale}));
  for(let i=0;i<fpts.length-1;i++) add([fpts[i],fpts[i+1]], line(fpts[i],fpts[i+1],'#111',2.4), 0.03);
  /* rollout along the landing direction, then the resting ball */
  const la=fpts[fpts.length-1], lb=fpts[Math.max(0,fpts.length-2)];
  let dx=la.x-lb.x, dz=la.z-lb.z; const dl=Math.hypot(dx,dz)||1; dx/=dl; dz/=dl;
  const rollLen=rollM*fscale;
  const rend={x:la.x+dx*rollLen, y:0, z:la.z+dz*rollLen};
  if(rollLen>0.02) add([la,rend], line({x:la.x,y:0,z:la.z},rend,'#111',1.4,0.7,'3,2.5'), 0.03);
  add([la], `<circle cx="${P(la).x.toFixed(1)}" cy="${P(la).y.toFixed(1)}" r="2" fill="#111" opacity="0.75"/>`, 0.03);
  const rq=P(rend);
  add([rend], `<circle cx="${rq.x.toFixed(1)}" cy="${rq.y.toFixed(1)}" r="2.6" fill="#111"/>`, 0.03);

  /* landing / rest markers: carry at the landing dot; total + roll (and how far
     offline of the centre line, when it matters) at the resting ball */
  const fmtYd=v=>v<25?v.toFixed(1):''+Math.round(v);
  const mtxt=(pt,txt,col,mdy)=>{const q=P(pt);
    return `<text x="${q.x.toFixed(1)}" y="${(q.y+mdy).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="7" font-weight="700" fill="${col}" stroke="#fff" stroke-width="2.2" paint-order="stroke" opacity="0.95">${txt}</text>`;};
  const offYd=rend.x*ydPerUnit, totalShow=carryShow+rollYd;
  let markers=mtxt({x:la.x,y:0,z:la.z},`carry ${fmtYd(carryShow)}`,'#111',-7);
  markers+=mtxt(rend,`total ${fmtYd(totalShow)} · roll ${rollYd.toFixed(1)}`,'#111',12);
  if(Math.abs(offYd)>=1) markers+=mtxt(rend,`${fmtYd(Math.abs(offYd))} yd ${offYd<0?'left':'right'} of line`,'#cc2a2a',21);
  const oq=P(wv.O);
  add([wv.O], `<circle cx="${oq.x.toFixed(1)}" cy="${oq.y.toFixed(1)}" r="4" fill="#fff" stroke="#333" stroke-width="1.4"/>`, 0.3);

  /* labels on top, white-haloed for readability at any camera angle; the D-plane
     wedge and spin axis carry their live numbers so slider drags read on the render */
  const lab=(pt,txt,col,ddx,ddy,anchor)=>{const q=P(pt);
    return `<text x="${(q.x+(ddx!=null?ddx:4)).toFixed(1)}" y="${(q.y+(ddy!=null?ddy:-4)).toFixed(1)}"${anchor?` text-anchor="${anchor}"`:''} font-family="ui-monospace,monospace" font-size="7.5" font-weight="700" fill="${col}" stroke="#fff" stroke-width="2.4" paint-order="stroke" opacity="0.95">${txt}</text>`;};
  const axSide=axisEff<-0.05?'L':axisEff>0.05?'R':'';
  const wedgeC={x:(wv.O.x+wv.path.x+wv.face.x)/3, y:(wv.O.y+wv.path.y+wv.face.y)/3, z:(wv.O.z+wv.path.z+wv.face.z)/3};
  let top=lab(wv.path,'path','#c43c9e')+lab(wv.face,'face','#2a6fc4')
    +lab(axA,`spin axis ${Math.abs(axisEff).toFixed(1)}°${axSide}`,'#cc2a2a')
    +lab(wedgeC,`spin loft ${r.spinLoft.toFixed(1)}°`,'#b8860b',0,2,'middle')
    +lab(A4,'impact plane','#4a7aaa',6,10)
    +markers;

  prims.sort((x,y)=>x.d-y.d);
  sceneEl.innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dpv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#cfe6f6"/><stop offset="100%" stop-color="#eef6fc"/></linearGradient></defs>
    <rect width="${VW}" height="${VH}" fill="url(#dpv-sky)"/>
    ${far}${prims.map(q=>q.svg).join('')}${top}
  </svg>`;

  /* live shot-info panel beside the viewer: impact block, then the simulated flight */
  const fl=dpBallFlight(axisEff);
  const side=axisEff<-0.05?'L':axisEff>0.05?'R':'';
  const ro=document.getElementById('dpv-readout');
  if(ro){
    const row=(k,v,col)=>`<div class="dpv-info-row"><span class="k">${k}</span><span class="v"${col?` style="color:${col}"`:''}>${v}</span></div>`;
    const fmt1=v=>Math.abs(v)<25?v.toFixed(1):''+Math.round(v);
    ro.innerHTML=
      `<div class="dpv-info-h">Impact — D-Plane</div>`
      +row('Shape',fl,'#111')
      +row('3D Spin Loft',r.spinLoft.toFixed(1)+'°','#b8860b')
      +row('Spin Axis',Math.abs(axisEff).toFixed(1)+'°'+(side?' '+side:''),'#cc2a2a')
      +row('Spin (est)','~'+spinUsed.toLocaleString()+' rpm')
      +row('Impact Plane',vPlane.toFixed(1)+'°'+(d.vPlane!=null?'':' est'),'#4a7aaa')
      +((st.th||st.hl)?row('Gear Shift',dplFmt(gearAxis)+'° axis','#cc2a2a'):'')
      +`<div class="dpv-info-h" style="margin-top:9px">Flight — Simulated</div>`
      +row('Ball Speed',Math.round(bspd)+' mph')
      +row('Launch',r.vLaunch.toFixed(1)+'°')
      +row('Carry',fmt1(carryShow)+' yd')
      +row('Apex',Math.round(apexShow)+' ft')
      +row('Land Angle',Math.round(sim.land)+'°')
      +row('Finish',Math.abs(curveShow)<0.3?'on line':fmt1(Math.abs(curveShow))+' yd '+(curveShow<0?'L':'R'))
      +row('Roll',rollYd.toFixed(1)+' yd')
      +row('Total',fmt1(carryShow+rollYd)+' yd');
  }
}
/* ---- Shape Sandbox: an EXPLORATION overlay seeded from the club's stored tendencies
   + captured ball speed. Sliders and presets write only the overlay — the stored
   stock numbers are untouched until "save as stock"; "revert" reseeds from stored. ---- */
function dpSeedSand(id){
  const c=STATE.clubs.find(x=>x.id===id)||{}, d=(STATE.dplane&&STATE.dplane[id])||{};
  const loft=parseFloat(c.loft)||30, p=perf(id)||{};
  window.dpSand={_club:id,
    bspd: (p.bspd>0)?+p.bspd:dpEstBspd(loft),
    hFace:+d.hFace||0, hPath:+d.hPath||0,
    vFace:d.vFace!=null?+d.vFace:loft, aoa:+d.aoa||0};
}
function dpSandFmt(field,v){
  v=parseFloat(v)||0;
  if(field==='bspd') return Math.round(v)+' mph';
  return field==='vFace'?v.toFixed(1)+'°':dplFmt(v)+'°';
}
function dpSetSand(field,val){
  const o=window.dpSand; if(!o) return;
  o[field]=parseFloat(val)||0;
  const sv=document.getElementById(`dpv-sand-${field}-v`); if(sv) sv.textContent=dpSandFmt(field,o[field]);
  dpRenderScene();
}
/* push the overlay into the slider DOM (after a preset or revert) */
function dpSandSync(){
  const o=window.dpSand; if(!o) return;
  ['bspd','hFace','hPath','vFace','aoa'].forEach(f=>{
    const inEl=document.getElementById(`dpv-sand-${f}-in`); if(inEl) inEl.value=o[f];
    const sv=document.getElementById(`dpv-sand-${f}-v`); if(sv) sv.textContent=dpSandFmt(f,o[f]);
  });
}
/* commit the overlay's four impact numbers as the club's stored stock tendency */
function dpSandSave(){
  const id=window.dpVisClub, o=window.dpSand; if(!id||!o) return;
  if(!STATE.dplane) STATE.dplane={};
  STATE.dplane[id]=Object.assign({},STATE.dplane[id],{hFace:o.hFace,hPath:o.hPath,vFace:o.vFace,aoa:o.aoa});
  saveState();
  const col=document.querySelector('.dpl-grid-col'); if(col) col.innerHTML=buildDplaneGrid();
  if(typeof buildCourseStrategy==='function') buildCourseStrategy();
  dpRenderScene();
  if(typeof toast==='function') toast('Saved as stock tendency');
}
function dpSandRevert(){ window.dpSand=null; renderDPlaneVisual(); }

/* ---- Shot presets. The 9-window drill (Tiger's drill: low/medium/high ×
   draw/straight/fade with one club) shifts vFace/aoa RELATIVE to the club's stock
   and sets the shape absolutely; specialty + short-game presets also set ball
   speed (chip ~25, pitch ~45, flop ~55 mph) so the sim shows their real
   trajectories. All load into the overlay only. ---- */
const DP_SHOTS={
  loDraw:{lbl:'Low Draw', vF:-6,aoa:-2,hF:1,hP:3.5},   loStr:{lbl:'Low',  vF:-6,aoa:-2,hF:0,hP:0},   loFade:{lbl:'Low Fade', vF:-6,aoa:-2,hF:-1,hP:-3.5},
  mdDraw:{lbl:'Draw',     vF:0, aoa:0, hF:1,hP:3.5},   mdStr:{lbl:'Stock',vF:0, aoa:0, hF:0,hP:0},   mdFade:{lbl:'Fade',     vF:0, aoa:0, hF:-1,hP:-3.5},
  hiDraw:{lbl:'High Draw',vF:5, aoa:1, hF:1,hP:3.5},   hiStr:{lbl:'High', vF:5, aoa:1, hF:0,hP:0},   hiFade:{lbl:'High Fade',vF:5, aoa:1, hF:-1,hP:-3.5},
  stinger:{lbl:'Stinger', vF:-10,aoa:-4,hF:0,hP:0,bsMult:0.97},
  chip:  {lbl:'Chip',  vFAbs:-8,aoaAbs:-3,hF:0,hP:0, bs:24},
  pitch: {lbl:'Pitch', vFAbs:-3,aoaAbs:-3,hF:0,hP:0, bs:40},
  flop:  {lbl:'Flop',  vFAbs:8, aoaAbs:-4,hF:3,hP:-4,bs:45}
};
function dpApplyPreset(key){
  const P=DP_SHOTS[key], id=window.dpVisClub; if(!P||!id) return;
  const c=STATE.clubs.find(x=>x.id===id)||{}, loft=parseFloat(c.loft)||30;
  dpSeedSand(id);                                   // presets start from stock, never stack
  const o=window.dpSand;
  if(P.bs!=null) o.bspd=P.bs; else if(P.bsMult) o.bspd=Math.round(o.bspd*P.bsMult);
  o.hFace=P.hF; o.hPath=P.hP;
  o.vFace=(P.vFAbs!=null)?loft+P.vFAbs:o.vFace+P.vF;
  o.vFace=Math.max(5,Math.min(65,o.vFace));
  o.aoa=Math.max(-8,Math.min(8,(P.aoaAbs!=null)?P.aoaAbs:o.aoa+P.aoa));
  dpSandSync(); dpRenderScene();
}

/* Pointer navigation on the scene container (re-bound after each host rebuild).
   Control plan (shared with the 2-D visuals via ui/panzoom.js, plus rotation):
     left-drag / one finger      → pan
     middle-drag / two fingers   → rotate (two-finger centroid; spread also zooms)
     scroll wheel / pinch        → zoom
     double-click / double-tap   → reset view */
function dpSceneDragInit(){
  const el=document.getElementById('dpv-scene'); if(!el||el._dpDrag) return; el._dpDrag=true;
  const ptrs=new Map(); let px=0,py=0,pinchD=0,mode='pan';
  const zoomBy=f=>{window.dpCam.zoom=Math.max(0.5,Math.min(4,(window.dpCam.zoom||1)*f));dpRenderScene();};
  const rotate=(dx,dy)=>{
    window.dpCam.az=((window.dpCam.az-dx*0.45)+540)%360-180;
    window.dpCam.el=Math.max(3,Math.min(88,window.dpCam.el+dy*0.45));};
  const panBy=(dx,dy)=>{                                 // screen px → world offset via camera basis
    const cam=dpCamBasis(window.dpCam.az,window.dpCam.el), SC=31*(window.dpCam.zoom||1);
    const pan=window.dpCam.pan=window.dpCam.pan||{x:0,y:0,z:0};
    const cl=v=>Math.max(-6,Math.min(6,v));
    pan.x=cl(pan.x-dx/SC*cam.R.x+dy/SC*cam.U.x);
    pan.y=cl(pan.y-dx/SC*cam.R.y+dy/SC*cam.U.y);
    pan.z=cl(pan.z-dx/SC*cam.R.z+dy/SC*cam.U.z);};
  el.addEventListener('pointerdown',e=>{
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===1){px=e.clientX;py=e.clientY; mode=(e.pointerType==='mouse'&&e.button===1)?'rot':'pan';}
    else if(ptrs.size===2){const a=[...ptrs.values()];pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      px=(a[0].x+a[1].x)/2;py=(a[0].y+a[1].y)/2;}       // centroid drives two-finger rotate
    el.setPointerCapture(e.pointerId);e.preventDefault();});
  el.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId))return;
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size>=2){                                    // two fingers: rotate + pinch-zoom together
      const a=[...ptrs.values()], d2=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      const mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
      rotate(mx-px,my-py); px=mx; py=my;
      if(pinchD>0&&d2>0&&Math.abs(d2-pinchD)>0.5) zoomBy(d2/pinchD);
      pinchD=d2; dpRenderScene(); return;}
    if(mode==='rot') rotate(e.clientX-px,e.clientY-py);
    else panBy(e.clientX-px,e.clientY-py);
    px=e.clientX;py=e.clientY;dpRenderScene();});
  const end=e=>{ptrs.delete(e.pointerId);pinchD=0;
    if(ptrs.size===1){const a=[...ptrs.values()][0];px=a.x;py=a.y;mode='pan';}};  // remaining finger pans w/o a jump
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
  el.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(-e.deltaY*0.0012));},{passive:false});
  el.addEventListener('dblclick',()=>{window.dpCam={az:DP_CAMS.iso.az,el:DP_CAMS.iso.el,zoom:1,pan:{x:0,y:0,z:0}};dpRenderScene();});
}
function renderDPlaneVisual(){
  const host=document.getElementById('dplane-visual'); if(!host) return;
  const clubs=STATE.clubs.filter(c=>c.type!=='putter');
  let id=window.dpVisClub; if(!clubs.find(c=>c.id===id)) id=(clubs.find(c=>c.id==='7i')||clubs[0]||{}).id;
  window.dpVisClub=id;
  const st=window.dpStrike=window.dpStrike||{th:0,hl:0};
  if(!window.dpSand||window.dpSand._club!==id) dpSeedSand(id);
  const o=window.dpSand;
  const opts=clubs.map(x=>`<option value="${x.id}"${x.id===id?' selected':''}>${x.label} — ${x.loft}</option>`).join('');
  const camBtns=Object.keys(DP_CAMS).map(k=>`<button type="button" class="dpv-cam-btn" onclick="dpSetCam('${k}')">${DP_CAMS[k].name}</button>`).join('');
  /* Shape Sandbox rows — the exploration overlay + per-club ranges.
     Face terms in face blue, path terms in path magenta, matching the render. */
  const c=clubs.find(x=>x.id===id)||{};
  const loft=parseFloat(c.loft)||30;
  const sandRow=(field,label,col,min,max,step)=>`<div class="dpv-sand-row">
      <span class="dpv-sand-lbl" style="color:${col}">${label}</span>
      <span class="dpv-sand-val" id="dpv-sand-${field}-v">${dpSandFmt(field,o[field])}</span>
      <input type="range" id="dpv-sand-${field}-in" min="${min}" max="${max}" step="${step}" value="${o[field]}" oninput="dpSetSand('${field}',this.value)">
    </div>`;
  const strikeRow=(field,label)=>`<div class="dpv-sand-row">
      <span class="dpv-sand-lbl" style="color:#cc2a2a">${label}</span>
      <span class="dpv-sand-val" id="dpv-strike-${field}-v">${dpStrikeTxt(field,st[field])}</span>
      <input type="range" min="-3" max="3" step="1" value="${st[field]}" oninput="dpSetStrike('${field}',this.value)">
    </div>`;
  const presetBtn=k=>`<button type="button" class="dpv-preset-btn" onclick="dpApplyPreset('${k}')">${DP_SHOTS[k].lbl}</button>`;
  const presets=`<div class="dpv-sand" style="margin-top:8px">
      <div class="dpv-strike-head">Shot Presets — 9-window drill + short game</div>
      <div class="dpv-preset-grid">${['hiDraw','hiStr','hiFade','mdDraw','mdStr','mdFade','loDraw','loStr','loFade'].map(presetBtn).join('')}</div>
      <div class="dpv-preset-row">${['stinger','chip','pitch','flop'].map(presetBtn).join('')}</div>
      <div class="dpv-strike-note">Loads the sliders relative to this club's stock; short-game presets drop the ball speed to their real values.</div>
    </div>`;
  const sandbox=`<div class="dpv-sand">
      <div class="dpv-strike-head">Shape Sandbox — drag the impact numbers, watch the flight
        <span style="float:right;display:flex;gap:5px"><button type="button" class="dpv-sand-reset" onclick="dpSandSave()">save as stock</button><button type="button" class="dpv-sand-reset" onclick="dpSandRevert()">revert</button></span></div>
      ${sandRow('bspd','Ball Speed','var(--ink2)',5,200,1)}
      ${sandRow('hFace','Horiz. Face','#2a6fc4',-10,10,0.1)}
      ${sandRow('hPath','Horiz. Path','#c43c9e',-10,10,0.1)}
      ${sandRow('vFace','Vert. Face','#2a6fc4',5,65,0.5)}
      ${sandRow('aoa','Vert. Path','#c43c9e',-8,8,0.1)}
      <div class="dpv-strike-note">− left / + right (RH) · vert. path − down / + up. Explores freely — your stored tendencies only change when you <b>save as stock</b>; <b>revert</b> reloads them.</div>
      <div class="dpv-sand-sub">
        <div class="dpv-strike-head">Strike — Gear Effect <span class="dpv-strike-cur">layered on the D-plane, not part of it</span></div>
        ${strikeRow('th','Heel ↔ Toe')}
        ${strikeRow('hl','Low ↔ High')}
        <div class="dpv-strike-note">Off-centre contact tilts the spin axis on top of the D-plane above (woods gear far more than irons); low strikes add spin, high strikes shed it. Full-shot intent is the centre of percussion — preview only; resets when you switch clubs.</div>
      </div>
    </div>`;
  host.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <label style="font-family:ui-monospace,monospace;font-size:.56rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Club</label>
      <select class="strat-select" style="max-width:150px" onchange="setDpVisClub(this.value)">${opts}</select>
    </div>
    <div class="dpv-cols">
      <div class="dpv-main-col">
        <div class="dpv-panel"><div class="dpv-title">Impact Plane · D-Plane · Ball Flight — drag pan · middle-drag / 2-finger rotate · scroll / pinch zoom</div>
          <div id="dpv-scene"></div></div>
        <div class="dpv-cam-row">${camBtns}</div>
        ${sandbox}
      </div>
      <div class="dpv-side-col">
        <div class="dpv-info" id="dpv-readout"></div>
        ${presets}
      </div>
    </div>`;
  dpRenderScene();
  dpSceneDragInit();
}
function buildGearEffectL2(){
  const dToe=dpGearAxisShift(3,'wood'), iToe=dpGearAxisShift(3,'iron');
  return `<div class="lvl-subhead" style="margin-top:18px">Gear Effect — Off-Centre Contact</div>
    <div class="chain-caption" style="margin-top:4px">How strike location bends each club's flight (RH). A ~3-dimple miss shifts the spin axis ≈ <b style="color:var(--c-wood)">${Math.abs(dToe).toFixed(0)}° (driver)</b> vs ≈ <b style="color:var(--c-iron)">${Math.abs(iToe).toFixed(0)}° (iron)</b> — woods gear far more. Toe → draw/left, heel → fade/right; high → less spin + higher launch, low → more spin + lower launch. <span class="placeholder-flag">prototype</span></div>
    <div class="gear-panel">${buildGearFaceSVG()}
      <div class="nudge-row">
        <div class="nudge-cell"><div class="nudge-val" style="color:var(--c-iron)">${dToe.toFixed(0)}°</div><div class="nudge-lbl">driver toe → draw</div></div>
        <div class="nudge-cell"><div class="nudge-val" style="color:var(--c-wood)">+${Math.abs(dToe).toFixed(0)}°</div><div class="nudge-lbl">driver heel → fade</div></div>
        <div class="nudge-cell"><div class="nudge-val">±${Math.abs(iToe).toFixed(0)}°</div><div class="nudge-lbl">iron toe / heel</div></div>
      </div>
    </div>`;
}

// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { STRAT_OPTS, ballRefHtml, buildAssess, buildImprove, buildResources, buildCourseStrategy, buildDplaneGrid, buildDplaneLab, buildForceProfileSVG, buildGearEffectL2, buildKinematicSequenceSVG, buildStrategyPrefs, pgaProSectionHtml, DP_SHOTS, dpApplyPreset, dpBallFlight, dpRenderScene, dpSandFmt, dpSandRevert, dpSandSave, dpSandSync, dpSceneDragInit, dpSeedSand, dpSetCam, dpSetSand, dpSetStrike, dpStrikeTxt, dpWorldVectors, dplFmt, dplaneShape, escapeHtml, forceRow, getPath, metricBox, renderDPlaneVisual, saveSwing, setDpVisClub, setDplaneCell, setStrategy, setPath, stratLabel, stratSelect, stratSummary, toggleLevel });
