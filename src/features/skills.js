// Skills tests with stored scores + trend lines — the TrackMan-Combine pattern,
// built on your own anchors. Wedge-ladder proximity test + driver test.
// Results persist in STATE.skillsTests; each test type shows a score trend.

const WEDGE_STATIONS=[30,50,70,90];   // yards

/* 0 ft → 100 pts, 40 ft → 0 pts (linear), averaged over logged stations */
function skillScoreWedge(stations){
  const vals=stations.filter(s=>s.prox!=null&&!isNaN(s.prox));
  if(!vals.length) return null;
  const pts=vals.map(s=>Math.max(0,Math.min(100,Math.round(100*(1-s.prox/40)))));
  return Math.round(pts.reduce((a,b)=>a+b,0)/pts.length);
}
/* distance (180→0, 300→100) blended 50/50 with accuracy (0yd→100, 40yd→0) */
function skillScoreDriver(d){
  if(d.carry==null||isNaN(d.carry)) return null;
  const dist=Math.max(0,Math.min(100,Math.round((d.carry-180)/1.2)));
  const acc=(d.offline!=null&&!isNaN(d.offline))?Math.max(0,Math.min(100,Math.round(100-Math.abs(d.offline)*2.5))):dist;
  return Math.round(dist*0.5+acc*0.5);
}

function scoreColor(s){ return s==null?'var(--muted)':s>=75?'var(--green)':s>=50?'var(--gold2,#c4427a)':'#d96070'; }

/* small sparkline of past scores (oldest→newest) for a test type */
function testTrendSpark(type){
  const rs=(STATE.skillsTests||[]).filter(t=>t.type===type&&t.score!=null).slice(0,12).reverse();
  if(rs.length<2) return '';
  const scores=rs.map(r=>r.score);
  const W=150,H=34;
  const pts=scores.map((s,i)=>`${((i/(scores.length-1))*W).toFixed(1)},${(H-(s/100)*(H-6)-3).toFixed(1)}`).join(' ');
  const last=scores[scores.length-1];
  const lx=W.toFixed(1), ly=(H-(last/100)*(H-6)-3).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible;margin-top:6px">
    <polyline points="${pts}" fill="none" stroke="${scoreColor(last)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="3" fill="${scoreColor(last)}"/>
    <text x="${lx}" y="${(parseFloat(ly)-6).toFixed(1)}" text-anchor="end" font-family="Arial,sans-serif" font-size="9" font-weight="800" fill="${scoreColor(last)}">${last}</text>
  </svg>`;
}
function latestScore(type){
  const r=(STATE.skillsTests||[]).find(t=>t.type===type&&t.score!=null);
  return r?r.score:null;
}

function wedgeTestCard(){
  const last=latestScore('wedge');
  const inputs=WEDGE_STATIONS.map(d=>`
    <div style="text-align:center">
      <div style="font-family:ui-monospace,monospace;font-size:.62rem;font-weight:700;color:var(--ink2)">${fmtYd(d)}</div>
      <input id="wt-${d}" type="number" step="0.5" min="0" placeholder="${ftUnit()}" style="width:100%;text-align:center;font-family:Arial,sans-serif;font-size:.9rem;font-weight:700;padding:6px 4px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--ink);outline:none;margin-top:3px">
    </div>`).join('');
  return `<div class="profile-card" style="margin-bottom:14px">
    <h3>Wedge Ladder Test ${last!=null?`<span style="float:right;font-size:1.1rem;font-weight:800;color:${scoreColor(last)}">${last}</span>`:''}</h3>
    <p class="gen-note">Hit a handful of shots at each distance and log your <strong>average proximity to the hole</strong> (${isMetric()?"metres":"feet"}). Score is 0–100 — closer is higher. Tracks over time below.</p>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0">${inputs}</div>
    <div class="btn-row"><button class="btn btn-primary" onclick="logWedgeTest()">Save Result</button></div>
    ${testTrendSpark('wedge')}
  </div>`;
}
function driverTestCard(){
  const last=latestScore('driver');
  const pf=STATE.profile||{};
  const f='width:100%;font-family:Arial,sans-serif;font-size:.9rem;font-weight:700;padding:6px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--ink);outline:none;margin-top:3px';
  const lbl='font-family:ui-monospace,monospace;font-size:.58rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
  return `<div class="profile-card" style="margin-bottom:14px">
    <h3>Driver Test ${last!=null?`<span style="float:right;font-size:1.1rem;font-weight:800;color:${scoreColor(last)}">${last}</span>`:''}</h3>
    <p class="gen-note">Hit a set and log your best/typical numbers against your optimizer windows. Score blends carry distance with accuracy (offline). ${pf.driverSwingSpeed?`Reference clubhead speed: <strong>${fmtMph(pf.driverSwingSpeed)}</strong>.`:''}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0">
      <div><label style="${lbl}">Carry (${ydUnit()})</label><input id="dt-carry" type="number" style="${f}" placeholder="e.g. ${ydNum(265)}"></div>
      <div><label style="${lbl}">Ball Speed (${mphUnit()})</label><input id="dt-bspd" type="number" style="${f}" placeholder="e.g. ${mphNum(165)}"></div>
      <div><label style="${lbl}">Avg Offline (${ydUnit()})</label><input id="dt-offline" type="number" style="${f}" placeholder="e.g. ${ydNum(18)}"></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" onclick="logDriverTest()">Save Result</button></div>
    ${testTrendSpark('driver')}
  </div>`;
}
function testHistory(){
  const rs=(STATE.skillsTests||[]).slice(0,30);
  if(!rs.length) return `<p class="lvl-soon-note">No results logged yet — your first test starts the trend line.</p>`;
  const typeLbl=t=>t==='wedge'?'Wedge Ladder':t==='driver'?'Driver':t;
  const rows=rs.map(r=>`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-family:ui-monospace,monospace;font-size:.62rem">${r.date}</td>
      <td style="padding:6px 8px;font-family:Arial,sans-serif;font-size:.82rem;font-weight:600">${typeLbl(r.type)}</td>
      <td style="padding:6px 8px;text-align:right;font-family:Arial,sans-serif;font-weight:800;color:${scoreColor(r.score)}">${r.score!=null?r.score:'—'}</td>
      <td style="padding:6px 8px;text-align:right"><span onclick="deleteTest('${r.id}')" style="cursor:pointer;color:var(--muted);font-size:.9rem">✕</span></td>
    </tr>`).join('');
  return `<div class="section-label" style="margin-top:6px">History</div>
    <div style="background:var(--card,var(--bg));border:1px solid var(--border);border-radius:10px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
}
function buildTests(){
  const wrap=document.getElementById('tests-wrap'); if(!wrap) return;
  wrap.innerHTML=wedgeTestCard()+driverTestCard()+testHistory();
}
function logWedgeTest(){
  /* stations are yards and proximity is feet in STORAGE; the fields show the user's units */
  const stations=WEDGE_STATIONS.map(d=>{const v=document.getElementById('wt-'+d)?.value;return {dist:d,prox:(v===''||v==null)?null:fromDisplay('short',parseFloat(v))};});
  const score=skillScoreWedge(stations);
  if(score==null){ toast('Enter at least one proximity'); return; }
  STATE.skillsTests.unshift({id:'st_'+Date.now(),date:new Date().toISOString().slice(0,10),type:'wedge',score,detail:{stations}});
  saveState(); buildTests(); toast('Wedge test saved — score '+score);
}
function logDriverTest(){
  const num=id=>{const v=document.getElementById(id)?.value;return (v===''||v==null)?null:parseFloat(v);};
  const detail={carry:num('dt-carry'),bspd:num('dt-bspd'),offline:num('dt-offline')};
  const score=skillScoreDriver(detail);
  if(score==null){ toast('Enter a carry distance'); return; }
  STATE.skillsTests.unshift({id:'st_'+Date.now(),date:new Date().toISOString().slice(0,10),type:'driver',score,detail});
  saveState(); buildTests(); toast('Driver test saved — score '+score);
}
function deleteTest(id){
  STATE.skillsTests=(STATE.skillsTests||[]).filter(t=>t.id!==id);
  saveState(); buildTests();
}

// Expose for inline handlers + cross-module calls.
Object.assign(window, { WEDGE_STATIONS, buildTests, deleteTest, driverTestCard, latestScore, logDriverTest, logWedgeTest, skillScoreDriver, skillScoreWedge, testHistory, testTrendSpark, wedgeTestCard });
