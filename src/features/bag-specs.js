// My Bag tab: ball listing + club specs (sorted putter first, then descending loft),
// expandable spec/edit panels, add-club form, profile (Myself) and calibration.

/* ============================================================
   SPECS — editable specs + performance + replacements
   ============================================================ */
function buildSpecs(){
  /* Ball listing at top */
  const bw=document.getElementById('ball-specs-wrap');
  if(bw){
    const pf=STATE.profile;
    const ballLabel=pf.ballMake&&pf.ballModel?`${pf.ballMake} ${pf.ballModel}`:'No ball on file';
    const ballSub=[ pf.ballLayers, pf.ballCover, pf.ballColor, pf.ballAlignment ].filter(Boolean).join(' · ');
    bw.innerHTML=`<div class="specs-col-head"><span></span><span>Model</span><span>Feel</span><span>Spin</span><span>Trajectory</span><span></span></div>
      <div class="specs-club-row ball-row" onclick="showGroup('setup',document.querySelector('.ngroup:last-child'));setTimeout(()=>document.getElementById('ball-grid')?.scrollIntoView({behavior:'smooth'}),200)">
        <span class="spec-club" style="font-family:Arial,sans-serif;font-weight:800;font-size:1.1rem;color:var(--grey)">B</span>
        <div class="spec-model">${ballLabel}<small>${ballSub||'tap to edit in Profile'}</small></div>
        <div class="spec-val">${pf.ballFirmness||'—'}</div>
        <div class="spec-val">${pf.ballSpin||'—'}</div>
        <div class="spec-val">${pf.ballTrajectory||'—'}</div>
        <div class="specs-chevron">▸</div>
      </div>`;
  }
  /* Clubs — a card per club: physical dimensions (left) + performance (right) */
  const wrap=document.getElementById('specs-wrap'); wrap.innerHTML='';
  const loftNum=c=>parseFloat((c.loft||'0').replace(/[^\d.]/g,''))||0;
  const sorted=[...STATE.clubs].sort((a,b)=>{
    if(a.type==='putter') return -1;
    if(b.type==='putter') return 1;
    return loftNum(b)-loftNum(a); /* descending loft: X wedge first, driver last */
  });
  const carryOf=c=> c.type==='putter'?0:(perf(c.id).carry||0);
  const mini=(label,val,wCls='')=>`<div class="spec-mini${wCls?' '+wCls:''}"><span class="sm-l">${label}</span><span class="sm-v">${val==null||val===''?'—':val}</span></div>`;
  let lastType=null;
  sorted.forEach((c,i)=>{
    if(c.type!==lastType){
      const div=document.createElement('div'); div.className='ladder-divider';
      div.textContent=typeLabel(c.type); wrap.appendChild(div); lastType=c.type;
    }
    const p=perf(c.id), carry=p.carry||0, total=p.total||0;
    const hasC=c.type!=='putter'&&carry>0;
    const sigma1=hasC?Math.round(getDispersion(carry)*0.608*10)/10:null;   /* 1σ lateral (yd) */
    const sigma2=sigma1!=null?Math.round(sigma1*2*10)/10:null;             /* 2σ lateral (yd) */
    const row=document.createElement('div'); row.className='specs-club-row spec-card';
    row.innerHTML=
      `<span class="spec-club ${c.type}">${c.label}</span>`+
      `<div class="sc-id"><span class="sc-name">${c.make} ${c.model}</span><span class="sc-sub">${c.year} · ${c.shaft}</span></div>`+
      mini('Length',c.length,'sm-w-len')+mini('Loft',c.loft,'sm-w-deg')+mini('Lie',c.lie,'sm-w-deg')+
      `<div class="sc-sep"></div>`+
      mini('Carry',hasC?carry:'—','sm-w-yd')+mini('Total',total||'—','sm-w-yd')+
      mini('1σ L/R',sigma1!=null?sigma1:'—','sm-w-lr')+mini('2σ L/R',sigma2!=null?sigma2:'—','sm-w-lr')+
      `<div class="specs-chevron">▾</div>`;
    const group=document.createElement('div'); group.className='specs-rep-group';
    row.addEventListener('click',()=>toggleSpecs(c,row,group));
    wrap.appendChild(row); wrap.appendChild(group);
    /* 7-column gap row aligned under each spec column */
    const thisCarry=carryOf(c);
    if(thisCarry>0){
      let j=i+1; while(j<sorted.length && carryOf(sorted[j])<=0) j++;
      if(j<sorted.length){
        const cn=sorted[j]; const pn=perf(cn.id);
        const carryN=pn.carry||0, totalN=pn.total||0;
        const gap=Math.abs(thisCarry-carryN);
        const totalGap=total&&totalN?Math.abs(total-totalN):null;
        /* physical diffs */
        const fDeg=s=>parseFloat((s||'').replace(/[^\d.]/g,''))||null;
        const lenA=parseFloat(c.length)||null, lenB=parseFloat(cn.length)||null;
        const loftA=fDeg(c.loft), loftB=fDeg(cn.loft);
        const lieA=fDeg(c.lie), lieB=fDeg(cn.lie);
        const lenDiff=lenA&&lenB?'↕ '+(Math.round(Math.abs(lenA-lenB)*100)/100)+'"':'—';
        const loftDiff=loftA&&loftB?'↕ '+(Math.round(Math.abs(loftA-loftB)*10)/10)+'°':'—';
        const lieDiff=lieA&&lieB?(lieA===lieB?'=':'↕ '+(Math.round(Math.abs(lieA-lieB)*10)/10)+'°'):'—';
        /* sigma diffs */
        const sigma1N=carryN>0?Math.round(getDispersion(carryN)*0.608*10)/10:null;
        const sigma2N=sigma1N!=null?Math.round(sigma1N*2*10)/10:null;
        const sig1Diff=sigma1!=null&&sigma1N!=null?'↕ '+(Math.round(Math.abs(sigma1-sigma1N)*10)/10):'—';
        const sig2Diff=sigma2!=null&&sigma2N!=null?'↕ '+(Math.round(Math.abs(sigma2-sigma2N)*10)/10):'—';
        /* carry colour */
        let cBg='var(--bg2)', cCol='var(--muted)';
        if(gap>15){cBg='rgba(196,66,122,.12)'; cCol='var(--gold2,#c4427a)';}
        else if(gap<8){cBg='rgba(214,96,112,.14)'; cCol='#d96070';}
        const gb=(val,wCls,bg,col)=>`<div class="spec-mini gap-mini ${wCls}"><span class="gap-chip" style="background:${bg};color:${col}">${val}</span></div>`;
        const gapRow=document.createElement('div'); gapRow.className='spec-gap-row';
        gapRow.innerHTML=
          `<span class="spec-club" style="visibility:hidden">${c.label}</span>`+
          `<div class="sc-id" style="visibility:hidden"><span class="sc-name">x</span><span class="sc-sub">x</span></div>`+
          gb(lenDiff,'sm-w-len','var(--bg2)','var(--muted)')+
          gb(loftDiff,'sm-w-deg','var(--bg2)','var(--muted)')+
          gb(lieDiff,'sm-w-deg','var(--bg2)','var(--muted)')+
          `<div class="sc-sep" style="visibility:hidden"></div>`+
          gb('↕ '+gap,'sm-w-yd',cBg,cCol)+
          gb(totalGap!=null?'↕ '+totalGap:'—','sm-w-yd','var(--bg2)','var(--muted)')+
          gb(sig1Diff,'sm-w-lr','var(--bg2)','var(--muted)')+
          gb(sig2Diff,'sm-w-lr','var(--bg2)','var(--muted)')+
          `<div class="specs-chevron" style="visibility:hidden">▾</div>`;
        wrap.appendChild(gapRow);
      }
    }
  });
}
function toggleSpecs(c,row,group){
  const open=group.classList.contains('open');
  document.querySelectorAll('.specs-club-row').forEach(r=>r.classList.remove('selected'));
  document.querySelectorAll('.specs-rep-group').forEach(g=>g.classList.remove('open'));
  if(open) return;
  row.classList.add('selected');
  const p=perf(c.id);
  const sf=(label,key,val,kind)=>`<div class="edit-field"><label>${label}</label><input data-club="${c.id}" data-kind="${kind}" data-key="${key}" value="${escapeHtml(val==null?'':val)}"></div>`;
  const putterExtra = c.type==='putter'
    ? `${sf('Grip','grip',c.grip||'','spec')}${sf('Weight (oz)','weightOz',c.weightOz||'','spec')}`
    : '';
  const editHtml=`
    <div class="specs-edit-panel">
      <div class="edit-grid">
        <div class="edit-subhead">Physical Spec</div>
        ${sf('Make','make',c.make,'spec')}${sf('Model','model',c.model,'spec')}${sf('Shaft','shaft',c.shaft,'spec')}
        ${sf('Length','length',c.length,'spec')}${sf('Eff. Loft','loft',c.loft,'spec')}${sf('Lie','lie',c.lie,'spec')}
        ${sf('Orig. Loft','origLoft',c.origLoft,'spec')}${sf('Swing Wt','swt',c.swt,'spec')}${sf('Year','year',c.year,'spec')}
        ${putterExtra}
        ${c.type!=='putter'?`<div class="edit-subhead">Stock Shot</div>
        ${sf('Carry (yd)','carry',p.carry,'perf')}${sf('Total (yd)','total',p.total,'perf')}${sf('Ball Spd (mph)','bspd',p.bspd,'perf')}
        ${sf('Club Spd (mph)','cspd',p.cspd,'perf')}${sf('Launch (°)','launch',p.launch,'perf')}${sf('Spin (rpm)','spin',p.spin,'perf')}
        ${sf('Max Ht (ft)','ht',p.ht,'perf')}${sf('Land (°)','land',p.land,'perf')}`:''}
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="saveClub('${c.id}')">Save ${c.label}</button></div>
    </div>`;
  const effLoft=parseFloat(c.loft);
  const loftTol = c.type==='putter' ? 1 : 2;   /* putters: ±1°, others: ±2° */
  const matches=STATE.otherClubs
    .filter(o=>{
      if(c.type==='putter') return o.type==='putter' && Math.abs(o.effLoft-effLoft)<=loftTol;
      return (!o.type||o.type!=='putter') && Math.abs(o.effLoft-effLoft)<=loftTol;
    })
    .sort((a,b)=>Math.abs(a.effLoft-effLoft)-Math.abs(b.effLoft-effLoft));
  const repLabel=`<div class="specs-rep-label">Replacement Options — ±${loftTol}° Effective Loft${c.type==='putter'?' · putters only':''}</div>`;
  const repHtml=!matches.length?`<div class="specs-no-rep">No matching clubs found in your other bags.</div>`:matches.map(o=>{
    const d=o.effLoft-effLoft, ds=d===0?'=':d>0?`+${d}°`:`${d}°`, dc=d===0?'exact':Math.abs(d)<=1?'close':'off';
    const extraDetail = c.type==='putter'
      ? `<div class="spec-val" style="font-size:.58rem;color:var(--muted)">${o.grip||''} · ${o.weightOz||''}oz · ${o.swt||''}</div>`
      : `<div class="rep-inline-bag">${o.bag.replace(' Bag','').replace(' Staff','')}</div>`;
    return `<div class="specs-rep-row">
      <span class="spec-club ${c.type}" style="font-size:1rem">${o.label}</span>
      <div class="spec-model">${o.make} ${o.model}<small>${o.year} · ${o.shaft} · ${o.length||''}</small></div>
      <div class="spec-val">${o.length||''}</div>
      <div class="spec-val">${o.effLoft}°</div>
      ${extraDetail}
      <div class="rep-inline-delta ${dc}">${ds}</div>
    </div>`;
  }).join('');
  const missHtml = c.type!=='putter' ? buildMissBlock(c) : '';
  group.innerHTML=editHtml+missHtml+repLabel+repHtml;
  group.classList.add('open');
  setTimeout(()=>group.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
}
/* Keep the Distance Matrix in sync with a club's edited total: scale the partial swings
   (full/tq/half) by the change so the matrix tracks the new distance. */
function syncPartialsForClub(id){
  const pr=STATE.partials&&STATE.partials[id], perf=STATE.performance&&STATE.performance[id];
  if(!pr||!perf||!pr.full) return;
  const tot=perf.total!=null?perf.total:perf.carry;
  if(tot==null) return;
  const r=tot/pr.full;
  if(!isFinite(r)||Math.abs(r-1)<0.005) return;          // unchanged → leave partials as measured
  pr.full=Math.round(tot);
  if(pr.tq!=null) pr.tq=Math.round(pr.tq*r);
  if(pr.half!=null) pr.half=Math.round(pr.half*r);
}
function saveClub(id){
  const club=STATE.clubs.find(c=>c.id===id); const p=STATE.performance[id]=STATE.performance[id]||{};
  document.querySelectorAll(`[data-club="${id}"]`).forEach(el=>{
    const key=el.getAttribute('data-key'), kind=el.getAttribute('data-kind'); let v=el.value.trim();
    if(kind==='spec'){ club[key]= key==='year'?(parseInt(v)||club[key]):v; }
    else{ p[key]= v===''? null : (isNaN(parseFloat(v))?v:parseFloat(v)); }
  });
  syncPartialsForClub(id);
  saveState(); refreshAll();                              // propagate everywhere (no tab jump)
  toast(club.label+' updated');
}

/* ============================================================
   PROFILE / CONDITIONS / GENERATOR / DATA
   ============================================================ */
/* Shared select builder — module scope so all render functions can use it */

/* Shared select builder — module scope so all render functions can use it */
const sel=(id,opts,val)=>`<select id="${id}">${opts.map(o=>`<option value="${o}"${o===val?' selected':''}>${o||'—'}</option>`).join('')}</select>`;

function buildProfile(){
  const pf=STATE.profile;
  const _pg=document.getElementById('profile-grid');
  if(_pg) _pg.innerHTML=`
    <div class="edit-subhead">Player</div>
    <div class="edit-field"><label>Name</label><input id="pf-name" value="${escapeHtml(pf.name||'')}"></div>
    <div class="edit-field"><label>Handicap</label><input id="pf-hcp" value="${escapeHtml(pf.handicap||'')}" placeholder="e.g. 8 or +2"></div>
    <div class="edit-field"><label>Goal Handicap</label><input id="pf-goalhcp" value="${escapeHtml(pf.goalHcp||'')}" placeholder="e.g. 5"></div>
    <div class="edit-field"><label>Handicap Service</label>${sel('pf-hcpsvc',['','GHIN (USGA)','Golf Canada','Golf Australia','CONGU (GB&I)','Golf NZ','Other'],pf.hcpService||'')}</div>
    <div class="edit-field"><label>Handicap / GHIN ID</label><input id="pf-hcpid" value="${escapeHtml(pf.hcpId||'')}" placeholder="Member number"></div>
    <div class="edit-field"><label>Rounds per Year</label><input id="pf-rounds" type="number" value="${escapeHtml(pf.roundsPerYear||'')}"></div>
    <div class="edit-field"><label>Practice Shots per Year (est.)</label><input id="pf-practice" type="number" value="${escapeHtml(pf.practicePerYear||'')}"></div>
    <div class="edit-field"><label>Glove Size</label>${sel('pf-glove',[
      '','Men\'s S','Men\'s M','Men\'s M/L','Men\'s L','Men\'s XL','Men\'s XXL',
      'Men\'s Cadet S','Men\'s Cadet M','Men\'s Cadet M/L','Men\'s Cadet L','Men\'s Cadet XL',
      'Women\'s S','Women\'s M','Women\'s M/L','Women\'s L','Women\'s XL',
      'Women\'s Cadet S','Women\'s Cadet M','Women\'s Cadet M/L','Women\'s Cadet L'
    ],pf.gloveSize||'')}</div>
    <div class="edit-subhead">Swing Speed</div>
    <div class="edit-field" style="grid-column:1/-1"><label>Driver Swing Speed (mph)</label>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input id="pf-ss" type="number" style="width:90px" value="${pf.driverSwingSpeed||''}">
        <button class="btn btn-accent" onclick="generateFromSwingSpeed()" style="white-space:nowrap;padding:5px 10px;font-size:.74rem">Re-generate Ladder</button>
        <span style="font-family:ui-monospace,monospace;font-size:.52rem;color:var(--muted)">scales all carries proportionally — refine from real data after</span>
      </div>
    </div>
    <div class="edit-subhead">Typical Round Stats <span style="font-weight:400;font-size:.6rem;color:var(--muted)">powers "my actual" on Approach, Short Game &amp; Putting and the scoring benchmarks</span></div>
    <div class="edit-field"><label>Scoring Average</label><input id="pf-scoreavg" type="number" step="0.1" value="${escapeHtml(pf.scoringAvg||'')}" placeholder="e.g. 84"></div>
    <div class="edit-field"><label>Fairways Hit %</label><input id="pf-fir" type="number" step="1" min="0" max="100" value="${escapeHtml(pf.firPct||'')}" placeholder="e.g. 45"></div>
    <div class="edit-field"><label>Greens in Reg %</label><input id="pf-gir" type="number" step="1" min="0" max="100" value="${escapeHtml(pf.girPct||'')}" placeholder="e.g. 40"></div>
    <div class="edit-field"><label>Putts per Round</label><input id="pf-putts" type="number" step="0.1" value="${escapeHtml(pf.puttsRound||'')}" placeholder="e.g. 32"></div>
    <div class="edit-field"><label>Up &amp; Down %</label><input id="pf-updown" type="number" step="1" min="0" max="100" value="${escapeHtml(pf.upDownPct||'')}" placeholder="scrambling, e.g. 40"></div>`;
  /* Handicap trend — inside same card (null-checked like lm-grid) */
  const ht=document.getElementById('hcp-trend-wrap');
  if(ht) ht.innerHTML=hcpTrendHtml();
  /* Launch Monitor Profile */
  const lg=document.getElementById('lm-grid');
  if(lg) lg.innerHTML=`
    <div class="edit-field"><label>Launch Monitor</label>${sel('pf-lmbrand',[
      '','Trackman 4','Trackman iO','Foresight GCQuad','Foresight GC3','Foresight GCHawk',
      'FlightScope Mevo+','FlightScope X3','Full Swing Kit','SkyTrak+','Bushnell Launch Pro',
      'Garmin Approach R10','Ernest Sports ES Tour','Other'
    ],pf.lmBrand||'')}</div>
    <div class="edit-field"><label>Last Session Date</label><input id="pf-lmdate" type="date" value="${escapeHtml(pf.lmSessionDate||'')}"></div>
    <div class="edit-subhead">Typical Driver Numbers</div>
    <div class="edit-field"><label>Attack Angle (°)</label><input id="pf-lmaoa" type="number" step="0.1" value="${escapeHtml(pf.lmDriverAoA||'')}" placeholder="+ = up, − = down"></div>
    <div class="edit-field"><label>Club Path (°)</label><input id="pf-lmpath" type="number" step="0.1" value="${escapeHtml(pf.lmDriverPath||'')}" placeholder="+ = in-to-out, − = out-to-in"></div>
    <div class="edit-field"><label>Face Angle (°)</label><input id="pf-lmface" type="number" step="0.1" value="${escapeHtml(pf.lmDriverFace||'')}" placeholder="+ = open, − = closed"></div>
    <div class="edit-field"><label>Smash Factor</label><input id="pf-lmsmash" type="number" step="0.01" value="${escapeHtml(pf.lmSmash||'')}" placeholder="e.g. 1.48"></div>
    <div class="edit-field" style="grid-column:1/-1"><label>Notes</label><input id="pf-lmnotes" value="${escapeHtml(pf.lmNotes||'')}" placeholder="fitter, date, key observations, session goals…"></div>`;
  /* Typical Baseline Conditions — measuring conditions + home setup + course surfaces */
  const b=STATE.baseline;
  const _bg=document.getElementById('baseline-grid');
  if(_bg) _bg.innerHTML=`
    <div class="edit-subhead">Measuring Conditions</div>
    <div class="edit-field"><label>Temp °F</label><input id="bl-temp" type="number" value="${b.tempF}"></div>
    <div class="edit-field"><label>Altitude ft</label><input id="bl-alt" type="number" value="${b.altitudeFt}"></div>
    <div class="edit-field"><label>Humidity %</label><input id="bl-hum" type="number" value="${b.humidity}"></div>
    <div class="edit-field"><label>Pressure inHg</label><input id="bl-pres" type="number" step="0.01" value="${b.pressureInHg}"></div>
    <div class="edit-field"><label>Air Density Sensitivity (k)</label><input id="dens-k" type="number" step="0.05" min="0" max="2" value="${STATE.densityK}">
      <div style="font-family:ui-monospace,monospace;font-size:.48rem;color:var(--muted);margin-top:3px;line-height:1.4">Default 0.65 ≈ 2 yd/10°F, 2%/1000 ft. Raise if your LM data shows bigger swings.</div>
    </div>
    <div class="edit-subhead">Home Course Setup</div>
    <div class="edit-field"><label>Home Course</label><input id="pf-homecourse" value="${escapeHtml(pf.homeCourse||'')}" placeholder="seeds Game Plan"></div>
    <div class="edit-field"><label>Usual Tee</label>${sel('pf-usualtee',['','Black','Blue','White','Gold','Red'],pf.usualTee||'')}</div>
    <div class="edit-field"><label>Home Green Stimp</label><input id="pf-homestimp" type="number" step="0.5" min="6" max="15" value="${escapeHtml(pf.homeStimp||'')}" placeholder="seeds Putting"></div>
    <div class="edit-subhead">Course Conditions</div>
    <div class="edit-field"><label>Typical Rough Length</label>${sel('pf-roughlength',['','Short (½″)','Medium (1″)','Long (2″)','Very Long (3″+)'],pf.roughLength||'')}</div>
    <div class="edit-field"><label>Green Grass Type</label>${sel('pf-greengrass',['','Bentgrass','Bermudagrass','Poa Annua','Fescue','Hybrid Bermuda','Paspalum'],pf.greenGrass||'')}</div>
    <div class="edit-field"><label>Fairway Grass Type</label>${sel('pf-fairwaygrass',['','Kentucky Bluegrass','Bentgrass','Bermudagrass','Ryegrass','Fescue','Zoysia'],pf.fairwayGrass||'')}</div>
    <div class="edit-field"><label>Rough Grass Type</label>${sel('pf-roughgrass',['','Fescue','Ryegrass','Bermudagrass','Kentucky Bluegrass','Mixed'],pf.roughGrass||'')}</div>
    <div class="edit-field"><label>Bunker Sand Type</label>${sel('pf-bunkersand',['','Fine White (soft)','Coarse (firm)','Hard Packed','Limestone','Silica','Crushed Shell'],pf.bunkerSand||'')}</div>`;
  /* Ball */
  const _bgg=document.getElementById('ball-grid');
  if(_bgg) _bgg.innerHTML=`
    <div class="edit-field"><label>Make</label><input id="ball-make" value="${escapeHtml(pf.ballMake||'')}" placeholder="e.g. Titleist"></div>
    <div class="edit-field"><label>Model</label><input id="ball-model" value="${escapeHtml(pf.ballModel||'')}" placeholder="e.g. Pro V1x"></div>
    <div class="edit-field"><label>Alignment Marking</label><input id="ball-align" value="${escapeHtml(pf.ballAlignment||'')}" placeholder="e.g. line, dot, none"></div>
    <div class="edit-field"><label>Cover Material</label>${sel('ball-cover',['','Urethane','Ionomer / Surlyn','TPU','Hybrid'],pf.ballCover||'')}</div>
    <div class="edit-field"><label>Cover Firmness</label>${sel('ball-firmness',['','Firm','Medium','Soft'],pf.ballFirmness||'')}</div>
    <div class="edit-field"><label>Construction</label>${sel('ball-layers',['','2-piece','3-piece','4-piece','5-piece'],pf.ballLayers||'')}</div>
    <div class="edit-field"><label>Color</label>${sel('ball-color',['','White','Yellow','Orange','Pink','Red','Green','Matte White','Matte Yellow','Other'],pf.ballColor||'')}</div>
    <div class="edit-field"><label>Spin Characteristics</label>${sel('ball-spin',['','Low','Medium','High'],pf.ballSpin||'')}</div>
    <div class="edit-field"><label>Trajectory Tendency</label>${sel('ball-trajectory',['','Low','Mid','High'],pf.ballTrajectory||'')}</div>
    <div class="edit-field" style="grid-column:1/-1"><label>Notes</label><input id="ball-notes" value="${escapeHtml(pf.ballNotes||'')}" placeholder="feel preference, conditions, wind performance, short game control…"></div>`;
}
/* Clear the Edit Golf Ball form fields (does not persist until Save Edits). */
function clearBallForm(){
  ['ball-make','ball-model','ball-align','ball-cover','ball-firmness','ball-layers','ball-color','ball-spin','ball-trajectory','ball-notes']
    .forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  if(typeof toast==='function') toast('Ball fields cleared — Save Edits to apply');
}
function saveProfile(){
  const pf=STATE.profile;
  pf.name=document.getElementById('pf-name').value;
  pf.handicap=document.getElementById('pf-hcp').value;
  pf.driverSwingSpeed=parseFloat(document.getElementById('pf-ss').value)||pf.driverSwingSpeed;
  pf.handedness=document.getElementById('pf-hand')?.value??pf.handedness;
  pf.heightFt=document.getElementById('pf-htft')?.value??pf.heightFt;
  pf.heightIn=document.getElementById('pf-htin')?.value??pf.heightIn;
  pf.armToFloor=document.getElementById('pf-atf')?.value??pf.armToFloor;
  pf.ageRange=document.getElementById('pf-age')?.value??pf.ageRange;
  pf.gloveSize=document.getElementById('pf-glove')?.value??pf.gloveSize;
  pf.roundsPerYear=document.getElementById('pf-rounds')?.value??pf.roundsPerYear;
  pf.practicePerYear=document.getElementById('pf-practice').value;
  /* round baselines */
  pf.scoringAvg=document.getElementById('pf-scoreavg')?.value??pf.scoringAvg;
  pf.goalHcp=document.getElementById('pf-goalhcp')?.value??pf.goalHcp;
  pf.firPct=document.getElementById('pf-fir')?.value??pf.firPct;
  pf.girPct=document.getElementById('pf-gir')?.value??pf.girPct;
  pf.puttsRound=document.getElementById('pf-putts')?.value??pf.puttsRound;
  pf.upDownPct=document.getElementById('pf-updown')?.value??pf.upDownPct;
  /* home setup */
  pf.homeCourse=document.getElementById('pf-homecourse')?.value??pf.homeCourse;
  pf.usualTee=document.getElementById('pf-usualtee')?.value??pf.usualTee;
  pf.homeStimp=document.getElementById('pf-homestimp')?.value??pf.homeStimp;
  if(pf.homeStimp!==''&&pf.homeStimp!=null){ const hs=parseFloat(pf.homeStimp); if(!isNaN(hs)) STATE.stimp=hs; }
  pf.hcpService=document.getElementById('pf-hcpsvc').value;
  pf.hcpId=document.getElementById('pf-hcpid').value;
  pf.gloveSize=document.getElementById('pf-glove').value;
  pf.ballMake=document.getElementById('ball-make').value;
  pf.ballModel=document.getElementById('ball-model').value;
  pf.ballAlignment=document.getElementById('ball-align').value;
  pf.ballNotes=document.getElementById('ball-notes').value;
  pf.ballColor=document.getElementById('ball-color')?.value||'';
  pf.ballCover=document.getElementById('ball-cover')?.value||'';
  pf.ballLayers=document.getElementById('ball-layers')?.value||'';
  pf.ballFirmness=document.getElementById('ball-firmness')?.value||'';
  pf.ballSpin=document.getElementById('ball-spin')?.value||'';
  pf.ballTrajectory=document.getElementById('ball-trajectory')?.value||'';
  STATE.baseline.tempF=parseFloat(document.getElementById('bl-temp').value)||STATE.baseline.tempF;
  STATE.baseline.altitudeFt=parseFloat(document.getElementById('bl-alt').value)||0;
  STATE.baseline.humidity=parseFloat(document.getElementById('bl-hum').value)||STATE.baseline.humidity;
  STATE.baseline.pressureInHg=parseFloat(document.getElementById('bl-pres').value)||STATE.baseline.pressureInHg;
  STATE.densityK=Math.max(0,Math.min(2,parseFloat(document.getElementById('dens-k').value)||0.65));
  /* launch monitor profile */
  pf.lmBrand=document.getElementById('pf-lmbrand')?.value??pf.lmBrand;
  pf.lmSessionDate=document.getElementById('pf-lmdate')?.value||pf.lmSessionDate;
  pf.lmDriverAoA=document.getElementById('pf-lmaoa')?.value||pf.lmDriverAoA;
  pf.lmDriverPath=document.getElementById('pf-lmpath')?.value||pf.lmDriverPath;
  pf.lmDriverFace=document.getElementById('pf-lmface')?.value||pf.lmDriverFace;
  pf.lmSmash=document.getElementById('pf-lmsmash')?.value||pf.lmSmash;
  pf.lmNotes=document.getElementById('pf-lmnotes')?.value||pf.lmNotes;
  /* course conditions */
  pf.roughLength=document.getElementById('pf-roughlength')?.value??pf.roughLength;
  pf.greenGrass=document.getElementById('pf-greengrass')?.value??pf.greenGrass;
  pf.fairwayGrass=document.getElementById('pf-fairwaygrass')?.value??pf.fairwayGrass;
  pf.roughGrass=document.getElementById('pf-roughgrass')?.value??pf.roughGrass;
  pf.bunkerSand=document.getElementById('pf-bunkersand')?.value??pf.bunkerSand;
  saveState(); refreshAll(); toast('Profile saved');
}
function saveCalibration(){ STATE.densityK=Math.max(0,Math.min(2,parseFloat(document.getElementById('dens-k').value)||0.65)); saveState(); buildLadder(); updateCondSummary(); toast('Calibration saved'); }
function generateFromSwingSpeed(){
  const target=parseFloat(document.getElementById('pf-ss')?.value);
  const base=STATE.profile.driverSwingSpeed;
  if(!target||!base){ toast('Enter a driver swing speed'); return; }
  const ratio=target/base;
  STATE.clubs.forEach(c=>{const p=STATE.performance[c.id];if(!p)return;
    if(p.carry!=null)p.carry=Math.round(p.carry*ratio);
    if(p.total!=null)p.total=Math.round(p.total*ratio);
    if(p.bspd!=null)p.bspd=Math.round(p.bspd*ratio);
    if(p.cspd!=null)p.cspd=Math.round(p.cspd*ratio);
  });
  Object.keys(STATE.partials).forEach(id=>{const pr=STATE.partials[id];['full','tq','half'].forEach(k=>{if(pr[k]!=null)pr[k]=Math.round(pr[k]*ratio);});});
  STATE.profile.driverSwingSpeed=target;
  saveState(); refreshAll(); toast('Ladder generated — refine from real data');
}
function exportData(){
  const blob=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='strongergolf-bag-'+(STATE.profile.name||'data').replace(/\s+/g,'-').toLowerCase()+'.json';
  a.click(); URL.revokeObjectURL(a.href); toast('Exported');
}
function importData(e){
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{ try{ window.STATE=mergeDefaults(JSON.parse(r.result)); saveState(); renderAll(); toast('Imported'); }catch(err){ toast('Import failed — invalid file'); } };
  r.readAsText(f); e.target.value='';
}
function resetData(){ window.STATE=deepClone(DEFAULT_DATA); saveState(); renderAll(); toast('Reset to demo bag'); }

/* ---- Handicap trend: manual snapshots over time + sparkline ---- */
function hcpTrendHtml(){
  const pf=STATE.profile||{};
  const hist=(STATE.hcpHistory||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
  const cur=pf.handicap!=null&&String(pf.handicap).trim()!==''?pf.handicap:'—';
  const goal=pf.goalHcp!=null&&String(pf.goalHcp).trim()!==''?pf.goalHcp:'—';
  let spark='';
  if(hist.length>1){
    const vals=hist.map(h=>parseHcp(h.hcp));
    const mn=Math.min(...vals),mx=Math.max(...vals),rng=(mx-mn)||1;
    const W=170,H=34;
    /* lower handicap = better = higher on chart */
    const pts=vals.map((v,i)=>`${((i/(vals.length-1))*W).toFixed(1)},${(((v-mn)/rng)*(H-6)+3).toFixed(1)}`).join(' ');
    spark=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible;margin:6px 0">
      <polyline points="${pts}" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  const rows=hist.slice().reverse().slice(0,8).map(h=>`<span style="font-family:ui-monospace,monospace;font-size:.6rem;color:var(--muted);margin-right:10px">${h.date}: <b style="color:var(--ink2)">${h.hcp}</b></span>`).join('');
  const inp='font-family:Arial,sans-serif;font-size:.82rem;font-weight:600;padding:5px 7px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--ink);outline:none;width:90px';
  return `<div style="display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px">
      <div><span style="font-family:ui-monospace,monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">current</span> <b style="font-size:1.05rem;color:var(--ink)">${cur}</b></div>
      <div><span style="font-family:ui-monospace,monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">goal</span> <b style="font-size:1.05rem;color:var(--green)">${goal}</b></div>
    </div>
    ${spark}
    <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
      <input id="hcp-snap" placeholder="e.g. 8 or +1" style="${inp}">
      <button class="btn btn-accent" onclick="logHcpSnapshot()">Log snapshot</button>
    </div>
    ${rows?`<div style="margin-top:8px;line-height:1.8">${rows}</div>`:'<div style="font-family:Arial,sans-serif;font-size:.74rem;color:var(--muted);margin-top:6px">Log your handicap periodically to chart the trend toward your goal.</div>'}`;
}
function logHcpSnapshot(){
  const el=document.getElementById('hcp-snap'); const v=el?.value?.trim();
  if(!v){ toast('Enter a handicap'); return; }
  STATE.hcpHistory=STATE.hcpHistory||[];
  STATE.hcpHistory.push({date:new Date().toISOString().slice(0,10),hcp:v});
  STATE.profile.handicap=v;          // current handicap follows the latest snapshot
  saveState(); refreshAll(); toast('Handicap snapshot logged');
}




// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildProfile, buildSpecs, clearBallForm, exportData, generateFromSwingSpeed, hcpTrendHtml, importData, logHcpSnapshot, resetData, saveCalibration, saveClub, saveProfile, sel, toggleSpecs });
