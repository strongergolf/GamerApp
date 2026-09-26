// My Bag tab: ball listing + club specs (sorted putter first, then descending loft),
// expandable spec/edit panels, add-club form, profile (Myself) and calibration.

/* ============================================================
   SPECS — editable specs + performance + replacements
   ============================================================ */
function buildSpecs(){
  /* The bag's own heading carries the count against the fourteen the Rules allow, because
     this page now shows the collection underneath and the two lists need telling apart at a
     glance. Fourteen is the limit, not a target — thirteen is legal and common. */
  const bl=document.getElementById('bag-section-label');
  if(bl){
    const n=(STATE.clubs||[]).length;
    const editing=(typeof bagEditOn==='function'&&bagEditOn());
    bl.innerHTML='<span>In the Bag <span style="font-weight:400;color:'+(n>MAX_BAG_CLUBS?'var(--red,#d96070)':'var(--muted)')+'">'
      +'· '+n+' of '+MAX_BAG_CLUBS+(n>MAX_BAG_CLUBS?' — over the limit':'')+'</span></span>'
      +(editing
        ? '<span class="bge-hint">Mark clubs to take out, and clubs below to put in</span>'
        : '<button class="print-btn" onclick="bagEditStart()" title="Take clubs out and put clubs in together — they do not have to match">⇅ Change the bag</button>');
  }
  if(typeof buildBallFlightCheck==='function') buildBallFlightCheck();
  /* Ball listing at top */
  const bw=document.getElementById('ball-specs-wrap');
  if(bw){
    const pf=STATE.profile;
    const ballLabel=pf.ballMake&&pf.ballModel?`${pf.ballMake} ${pf.ballModel}`:'No ball on file';
    const ballSub=[ pf.ballLayers, pf.ballCover, pf.ballColor, pf.ballAlignment ].filter(Boolean).join(' · ');
    bw.innerHTML=`<div class="specs-col-head"><span></span><span>Model</span><span>Feel</span><span>Spin</span><span>Trajectory</span><span></span></div>
      <div class="specs-club-row ball-row" onclick="ballEditJump()">
        <span class="spec-club" style="font-family:Arial,sans-serif;font-weight:800;font-size:1.1rem;color:var(--grey)">B</span>
        <div class="spec-model">${ballLabel}<small>${ballSub||'tap to describe it'}</small></div>
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
  /* The wide-gap warning asks "is there a full-swing yardage I cannot cover?" — a question
     that only means something between two SCORING clubs: the irons and the wedges you hit
     full. It is skipped when either side of the pair is
       · a wood, hybrid or utility — these sit 25-35 yd apart by design because nothing fits
         between a fairway wood and a hybrid, so the rule can only ever cry wolf there; or
       · a greenside wedge — not there to fill a yardage band at all. The Approach yardages it
         covers it still covers (unchanged: it stays an option right across its range), but a
         wide carry gap ABOVE it is a bag choice, and a pink chip says the opposite.
     Keyed on TYPE and LOFT rather than position in the bag, because those differ: a bag may
     carry both an L and an X, or only one, or top out at a SAND wedge — and a sand wedge is a
     full-swing club (the most common partial-swing club there is), so a wide gap above one
     still flags. GREENSIDE_WEDGE_LOFT is the same 57° repMatches already uses to widen the
     replacement tolerance, shared so the two cannot drift apart.
     An OVERLAP is worth knowing wherever it happens, so the tight flag is untouched. */
  const isScoringClub=c=> c.type!=='putter' && c.type!=='wood' && loftNum(c)<GREENSIDE_WEDGE_LOFT;
  const mini=(label,val,wCls='')=>`<div class="spec-mini${wCls?' '+wCls:''}"><span class="sm-l">${label}</span><span class="sm-v">${val==null||val===''?'—':val}</span></div>`;
  /* Mark bends almost the whole bag a degree weak — it adds effective bounce and cuts offset —
     so the loft in play is NOT the loft stamped on the club. Showing only the effective number
     made an owned club unfindable: hunting for "my 64° PM" in a list where every row reads 65.
     Stock loft rides along whenever the two differ, small and muted, with the sign of the bend
     so a strong bend reads differently from a weak one. Bounce, where recorded, stays in the
     club's own detail — this is a find-it aid, not a spec sheet. */
  /* Just the loft in play. The stock loft and the bend rode along in a second line under
     every row, which set the row height for the whole list and pushed the Loft number out
     of line with Length and Lie beside it. Both still live in the club's own editor, which
     is where a spec belongs; the list is for reading down a column. */
  const loftCell=(c)=>c.loft;
  let lastType=null;
  sorted.forEach((c,i)=>{
    if(c.type!==lastType){
      const div=document.createElement('div'); div.className='ladder-divider';
      div.textContent=typeLabel(c.type); wrap.appendChild(div); lastType=c.type;
    }
    const p=perf(c.id), carry=p.carry||0, total=p.total||0;
    const hasC=c.type!=='putter'&&carry>0;
    const d86=hasC?disp86(carry):null;                                     /* single 86% L/R lateral (yd) */
    /* In edit mode the row is a mark, not a link into the club's detail: one tap says "this
       one is coming out". Out of edit mode it behaves exactly as it always did. */
    const editing=(typeof bagEditOn==='function'&&bagEditOn());
    const markedOut=editing&&window.bagEdit.out.has(c.id);
    const row=document.createElement('div'); row.className='specs-club-row spec-card'+(markedOut?' bge-out':'');
    row.innerHTML=
      `<span class="spec-club ${c.type}">${c.label}</span>`+
      `<div class="sc-id"><span class="sc-name">${c.make} ${c.model}</span></div>`+   /* year · shaft moved into the dropdown (Physical Spec) for a tighter mobile row */
      mini('Length',c.length,'sm-w-len')+mini('Loft',loftCell(c),'sm-w-deg')+mini('Lie',c.lie,'sm-w-deg')+
      `<div class="sc-sep"></div>`+
      mini('Carry '+ydUnit(),hasC?ydNum(carry):'—','sm-w-yd')+mini('TTL '+ydUnit(),total?ydNum(total):'—','sm-w-yd')+
      mini('86% L/R',d86!=null?ydNum(d86,1):'—','sm-w-lr')+
      (editing ? `<div class="bge-mark${markedOut?' on':''}">${markedOut?'OUT':'Take out'}</div>`
               : `<div class="specs-chevron">▾</div>`);
    const group=document.createElement('div'); group.className='specs-rep-group';
    row.addEventListener('click',()=> editing ? bagEditToggleOut(c.id) : toggleSpecs(c,row,group));
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
        /* 86% L/R diff */
        const d86N=carryN>0?disp86(carryN):null;
        const d86Diff=d86!=null&&d86N!=null?'↕ '+ydNum(Math.abs(d86-d86N),1):'—';
        /* carry colour */
        let cBg='var(--bg2)', cCol='var(--muted)';
        if(gap>15 && isScoringClub(c) && isScoringClub(cn)){cBg='rgba(196,66,122,.12)'; cCol='var(--gold2,#c4427a)';}
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
          gb('↕ '+ydNum(gap),'sm-w-yd',cBg,cCol)+
          gb(totalGap!=null?'↕ '+ydNum(totalGap):'—','sm-w-yd','var(--bg2)','var(--muted)')+
          gb(d86Diff,'sm-w-lr','var(--bg2)','var(--muted)')+
          `<div class="specs-chevron" style="visibility:hidden">▾</div>`;
        wrap.appendChild(gapRow);
      }
    }
  });
}
/* Replacement-options matching for a club (tolerance widens at the lofted end of the bag).
   Returns the loft-sorted candidate clubs from other bags within tolerance. */
/* Where the bag stops being about full-swing yardage and starts being about greenside work.
   Used twice, and deliberately one number: it widens the replacement tolerance (a 64 and a 60
   are interchangeable in a way a 7 and an 8 iron are not) and it exempts these clubs from the
   wide-carry-gap warning. A sand wedge sits BELOW it on purpose — it is a full-swing club. */
const GREENSIDE_WEDGE_LOFT = 57;
/* Wedge naming by loft, Mark's convention: 58-61 is an L, 62 and up an X. Everything below
   keeps the name the club already had — a P is a P at 46 or 48.
   AUTO-LABELLING ONLY EVER FILLS A GAP. A label the golfer typed is theirs and is never
   recomputed, because the label is what they call the club, not a fact derived from its loft:
   re-lofting an "L" one degree does not make it something else if they still call it their L.
   So this runs when a club has no label, or when one arrives from Locker Room without its own. */
const WEDGE_LABEL_BANDS = [[62,'X'],[58,'L'],[54,'S'],[50,'G'],[45,'P']];
function autoLabelForLoft(loft){
  const n=parseFloat(loft); if(isNaN(n)) return null;
  for(const [min,lbl] of WEDGE_LABEL_BANDS) if(n>=min) return lbl;
  return null;                                   /* irons and up keep their own numbering */
}
/* The bag is fourteen clubs, putter included — the Rule of Golf, and the reason a swap is an
   EXCHANGE rather than an add. Backups is unbounded. */
const MAX_BAG_CLUBS = 14;
function bagIsFull(){ return (STATE.clubs||[]).length >= MAX_BAG_CLUBS; }
function repMatches(c){
  const effLoft=parseFloat(c.loft);
  const loftTol = c.type==='putter' ? 1
    : effLoft>=GREENSIDE_WEDGE_LOFT ? 6
    : (c.type==='wedge'||effLoft>=44) ? 3
    : 2;
  const matches=STATE.otherClubs
    .filter(o=>{
      if(c.type==='putter') return o.type==='putter' && Math.abs(o.effLoft-effLoft)<=loftTol;
      return (!o.type||o.type!=='putter') && Math.abs(o.effLoft-effLoft)<=loftTol;
    })
    .sort((a,b)=>Math.abs(a.effLoft-effLoft)-Math.abs(b.effLoft-effLoft));
  return { effLoft, loftTol, matches };
}
/* Estimate full-swing performance for a target loft by interpolating the rest of the bag
   (loft → carry/launch/spin/land/…). Used when a replacement club has no measured data of its
   own; the result is flagged Presumed so it reads as estimated in the Play tabs. */
function estimatePerfForLoft(targetLoft, excludeId){
  const pts=STATE.clubs.filter(c=>c.id!==excludeId && c.type!=='putter')
    .map(c=>({loft:parseFloat(c.loft)||0, p:perf(c.id)}))
    .filter(x=>x.loft>0 && x.p.carry>0)
    .sort((a,b)=>a.loft-b.loft);
  if(!pts.length) return null;
  const L=targetLoft;
  const interp=key=>{
    const arr=pts.filter(x=>x.p[key]!=null && x.p[key]!=='');
    if(!arr.length) return null;
    let a,b;
    if(L<=arr[0].loft){ a=arr[0]; b=arr[1]||arr[0]; }
    else if(L>=arr[arr.length-1].loft){ a=arr[arr.length-2]||arr[arr.length-1]; b=arr[arr.length-1]; }
    else { for(let i=0;i<arr.length-1;i++){ if(L>=arr[i].loft&&L<=arr[i+1].loft){ a=arr[i]; b=arr[i+1]; break; } } }
    if(!a||!b) return +arr[0].p[key];
    if(a.loft===b.loft) return +a.p[key];
    return +a.p[key] + (L-a.loft)/(b.loft-a.loft)*(+b.p[key]-+a.p[key]);
  };
  const est={};
  ['carry','total','bspd','cspd','launch','spin','ht','land'].forEach(k=>{ const v=interp(k); if(v!=null&&isFinite(v)) est[k]=(k==='launch'||k==='land')?Math.round(v*10)/10:Math.round(v); });
  return Object.keys(est).length?est:null;
}
/* Swap the chosen replacement club into this bag slot and estimate its stats (flagged Presumed).
   This is a true EXCHANGE: the club coming out goes back into the other-bags inventory and the
   club going in leaves it. Before this it was one-way — the displaced club was overwritten in
   place and existed nowhere afterwards, so you could never put it back (the 64° PM case), and
   the incoming club stayed in the inventory and could be swapped into several slots at once. */
/* Swap a bag slot for a club from the locker-room library. The exchange is symmetric — the
   incoming club leaves the library, the outgoing one joins it — and is driven from BOTH
   directions now: from Current Bag (pick a replacement for this slot) and from Locker Room
   (pick a slot for this club). One function so the two can never diverge. */
function swapIntoBag(clubId, o){
  const c=STATE.clubs.find(x=>x.id===clubId); if(!c||!o) return false;
  const oInv=STATE.otherClubs.indexOf(o);
  /* Snapshot the outgoing club in inventory shape before its fields are overwritten — through
     bagClubToRecord, the same writer the remove path uses, so the two cannot disagree about
     what a club takes with it when it leaves the bag. */
  const displaced=bagClubToRecord(c);
  c.label = o.label || autoLabelForLoft(o.effLoft) || c.label; c.make=o.make; c.model=o.model; c.shaft=o.shaft;
  if(o.length) c.length=o.length;
  if(o.effLoft!=null){ c.loft=o.effLoft+'°'; c.origLoft=o.effLoft+'°'; }
  if(o.lie) c.lie=o.lie; if(o.year) c.year=o.year; if(o.swt) c.swt=o.swt; if(o.type) c.type=o.type;
  if(o.grip) c.grip=o.grip; if(o.weightOz) c.weightOz=o.weightOz;
  if(c.type!=='putter'){
    /* Measured numbers on the inventory record beat an estimate from loft — that is the whole
       point of keeping them (see displaced above, and the PM Grind in defaults). */
    const est=estimatePerfForLoft(o.effLoft, clubId);
    let measured=null;
    CLUB_PERF_FIELDS.forEach(f=>{ if(o[f.key]!=null){ (measured=measured||{})[f.key]=o[f.key]; } });
    if(measured&&measured.carry!=null&&measured.total==null) measured.total=measured.carry;
    if(est||measured){
      STATE.performance[clubId]=Object.assign({},est||{},measured||{},{prov:measured?'input':'presumed'});
      /* Keep the partial-swing ladder (what Approach/Short Game read) in step with the new
         club, so My Bag and the Play tabs show the same numbers. A ladder the incoming club
         brought with it is measured and wins; otherwise seed one from the bag's own ratios. */
      if(o.partials&&o.partials.full!=null) STATE.partials[clubId]=JSON.parse(JSON.stringify(o.partials));
      else seedPartialsFor(clubId, (measured?measured.carry:null)||(est&&(est.total||est.carry)));
    }
  }
  /* complete the exchange: incoming club leaves the inventory, outgoing club joins it */
  if(oInv>-1) STATE.otherClubs.splice(oInv,1);
  if(displaced.effLoft!=null) STATE.otherClubs.push(displaced);
  saveState(); refreshAll();
  if(typeof toast==='function') toast(`${o.make} ${o.model} (${o.effLoft}°) swapped in — ${displaced.make} ${displaced.model} to the collection`);
  return true;
}
/* ============================================================
   ONE CLUB EDITOR, TWO LISTS

   A club in the bag and a club in the collection were edited through two different panels:
   different fields, different order, different save behaviour (a Save button on one, save-on-
   blur on the other), and only the bag's could hold a stock shot. They are the same object —
   a club you own — so the same editor describes both, and the fields below are the single
   definition of what a club HAS. What differs between the two is only what is true of them:
   a collection club has a location and no miss tendencies; a bag club has the reverse.

   `bag` and `rec` name the two keys a field can have, because the bag stores loft as the
   string "51°" and the inventory as the number 51 — a difference worth hiding here rather
   than teaching to every caller. */
const CLUB_SPEC_FIELDS = [
  {label:'Label', bag:'label', rec:'label', attrs:'maxlength="2"', hint:'2 characters, yours to choose'},
  {label:'Make',  bag:'make',  rec:'make'},
  {label:'Model', bag:'model', rec:'model'},
  {label:'Year',  bag:'year',  rec:'year'},
  {label:'Shaft', bag:'shaft', rec:'shaft'},
  {label:'Length',bag:'length',rec:'length'},
  {label:'Eff. Loft', bag:'loft', rec:'effLoft'},
  {label:'Orig. Loft',bag:'origLoft', rec:'origLoft'},
  {label:'Lie',   bag:'lie',   rec:'lie'},
  {label:'Swing Wt', bag:'swt', rec:'swt'},
  {label:'Grip',  bag:'grip',  rec:'grip'},
  {label:'Weight',bag:'weightOz', rec:'weightOz', unit:'mass'},
  /* Where the club physically is. Only a collection club has an answer — a bag club is in
     the bag — so it renders for one scope and not the other. */
  {label:'Location', rec:'bag', recOnly:true}
];
/* THE STOCK SHOT, on both. A collection club could only ever hold a carry and a total, so a
   spare with a full launch-monitor record lost everything else the moment it left the bag and
   had it estimated from loft on the way back in. The record holds all eight now, and
   bagAddFromCollection carries them into the bag with the club. */
const CLUB_PERF_FIELDS = [
  {label:'Carry', key:'carry', unit:'distance'}, {label:'Total', key:'total', unit:'distance'},
  {label:'Ball Spd', key:'bspd', unit:'speed'},  {label:'Club Spd', key:'cspd', unit:'speed'},
  {label:'Launch (°)', key:'launch'},            {label:'Spin (rpm)', key:'spin'},
  {label:'Max Ht', key:'ht', unit:'short'},      {label:'Land (°)', key:'land'}
];
/* One field, one reader. scope is 'bag' (ref = club id) or 'col' (ref = inventory index). */
function clubField(scope, ref, f, val, kind){
  const u=f.unit;
  const dp = u==='short'&&isMetric('short') ? 1 : (u==='mass' ? (isMetric('mass')?0:2) : 0);
  const shown = (u&&val!=null&&val!=='') ? toDisplay(u,val,dp) : (val==null?'':val);
  const lbl = u ? `${f.label} (${unitLabel(u)})` : f.label;
  const hint = f.hint ? ` <span style="font-weight:400;text-transform:none;letter-spacing:0">— ${f.hint}</span>` : '';
  return `<div class="edit-field"><label>${lbl}${hint}</label>`
    + `<input data-scope="${scope}" data-ref="${escapeHtml(String(ref))}" data-kind="${kind}" data-key="${f.key||f[scope==='bag'?'bag':'rec']}"`
    + `${u?` data-unit="${u}"`:''}${f.attrs?' '+f.attrs:''} value="${escapeHtml(String(shown))}"`
    + ` onclick="event.stopPropagation()" onchange="clubFieldSave(this)"></div>`;
}
/* The grid both panels use. `perfOf` is the club's stock shot, wherever it lives. */
function clubEditGrid(scope, ref, data, perfData){
  const specs=CLUB_SPEC_FIELDS
    .filter(f=>scope==='col' ? f.rec : !f.recOnly && f.bag)
    .map(f=>clubField(scope, ref, f, data[f[scope==='bag'?'bag':'rec']], 'spec')).join('');
  const isPutter=(scope==='bag') ? data.type==='putter' : (typeof bkTypeOf==='function'&&bkTypeOf(data)==='putter');
  const perf=isPutter ? '' : `<div class="edit-subhead">Stock Shot</div>`
    + CLUB_PERF_FIELDS.map(f=>clubField(scope, ref, f, (perfData||{})[f.key], 'perf')).join('');
  return `<div class="edit-grid"><div class="edit-subhead">Physical Spec</div>${specs}${perf}</div>`;
}
/* Save ONE field as it is changed — the same forgiveness on both lists. It writes through to
   STATE without re-rendering, because rebuilding a list under the finger typing into it is
   what drove the collection's editor to save-on-blur in the first place. The Save button
   still commits the lot and refreshes every surface. */
function clubFieldSave(el){
  const scope=el.getAttribute('data-scope'), ref=el.getAttribute('data-ref');
  const key=el.getAttribute('data-key'), kind=el.getAttribute('data-kind'), u=el.getAttribute('data-unit');
  const raw=el.value.trim();
  /* UNTOUCHED FIELDS MUST NOT BE WRITTEN BACK. Converting out to metric and straight back in
     does not land on the same number — 163 mph shows as 262 km/h and returns as 162.8 — so a
     club would drift a little every time Save was pressed in the other unit system, and keep
     drifting. If the box still reads what the stored value DISPLAYS as, nothing changed. */
  const unchanged=(stored)=>{
    if(!u || stored==null || raw==='') return false;
    const dp = u==='short'&&isMetric('short') ? 1 : (u==='mass' ? (isMetric('mass')?0:2) : 0);
    return String(toDisplay(u, stored, dp))===String(parseFloat(raw));
  };
  if(scope==='bag'){
    const club=STATE.clubs.find(c=>c.id===ref); if(!club) return;
    if(kind==='spec'){
      if(unchanged(parseFloat(club[key]))) return;
      if(u && raw!=='' && !isNaN(parseFloat(raw))) club[key]=String(Math.round(fromDisplay(u,parseFloat(raw))*100)/100);
      else club[key]= key==='year'?(parseInt(raw)||club[key]):raw;
    } else {
      const p=STATE.performance[ref]=STATE.performance[ref]||{};
      if(unchanged(p[key])) return;
      if(raw===''){ p[key]=null; }
      else if(isNaN(parseFloat(raw))){ p[key]=raw; }
      else { const n=parseFloat(raw); p[key]= u ? Math.round(fromDisplay(u,n)*10)/10 : n; }
      p.prov='input';
    }
  } else {
    if(unchanged((STATE.otherClubs||[])[parseInt(ref,10)]?.[key])) return;
    const o=(STATE.otherClubs||[])[parseInt(ref,10)]; if(!o) return;
    if(raw===''){ delete o[key]; }
    else if(key==='effLoft'||kind==='perf'){ const n=parseFloat(raw); if(!isNaN(n)) o[key]= u?Math.round(fromDisplay(u,n)*10)/10 : n; }
    else if(key==='year'){ const n=parseInt(raw); if(!isNaN(n)) o[key]=n; }
    else if(u&&!isNaN(parseFloat(raw))){ o[key]=String(Math.round(fromDisplay(u,parseFloat(raw))*100)/100); }
    else { o[key]=raw; }
    /* A label the golfer types is theirs and outranks the auto-labeller (autoLabelForLoft). */
    if(key==='label'&&raw) o.userLabel=true;
  }
  saveState();
}
/* Commit everything in the open panel and propagate. One button, both lists. */
function clubSaveAll(scope, ref){
  document.querySelectorAll(`[data-scope="${scope}"][data-ref="${CSS.escape(String(ref))}"]`).forEach(clubFieldSave);
  if(scope==='bag'){ saveClub(ref); return; }
  const o=(STATE.otherClubs||[])[parseInt(ref,10)];
  saveState(); buildBackups();
  if(typeof toast==='function') toast(((o&&(o.label||o.model))||'Club')+' updated');
}

/* ============================================================
   CHANGING THE BAG — add and remove, not only exchange

   Every bag change used to be a 1-for-1 exchange, because a club IS a slot: STATE.performance,
   .partials, .dplane and .missTendency are all keyed by the club's id, so "removing" a club
   meant overwriting its slot with another one. That works for like-for-like — a new gap wedge
   for the old gap wedge, keeping the slot's measured ladder — and not at all for the change a
   golfer actually makes: two long clubs out, one long club and a wedge in. A 61° L wedge has
   no business inheriting a hybrid's yardages, and the forced pairing meant it did.
   So the exchange stays (it is the right tool for a straight replacement, and it preserves
   measurement), and true add / remove join it underneath the staging editor below.
   ============================================================ */

/* A club's own ladder ratios, averaged over the bag, for seeding a club that has none.
   Two hardcoded ladders existed for this — 0.92/0.84 in the add form, 0.92/0.78 in the swap —
   and neither matched the bag: Mark's 7i runs .93/.84/.73 and his 9i .89/.79/.67. Taking the
   mean of what is actually in the bag beats either guess, and it follows the player. */
function bagLadderRatios(){
  let tq=0,half=0,n=0;
  Object.values(STATE.partials||{}).forEach(p=>{
    if(!p||!(p.full>0)) return;
    if(p.tq>0&&p.half>0){ tq+=p.tq/p.full; half+=p.half/p.full; n++; }
  });
  return n ? {tq:tq/n, half:half/n} : {tq:0.92, half:0.81};
}
function seedPartialsFor(id, baseCarry){
  if(!(baseCarry>0)) return;
  const r=bagLadderRatios();
  const seeded={ full:Math.round(baseCarry), tq:Math.round(baseCarry*r.tq), half:Math.round(baseCarry*r.half),
                 conf:[false,false,false,false] };
  seeded.third=(typeof estThirdCarry==='function')?estThirdCarry(seeded):Math.round(baseCarry*0.68);
  STATE.partials[id]=seeded;
}
/* An inventory record for a club leaving the bag, carrying its measured numbers with it so a
   club resting in the collection is not silently downgraded to a guess (same rule as the
   exchange path — see swapIntoBag). */
function bagClubToRecord(c){
  const rec={ label:c.label, effLoft:parseFloat(c.loft)||null, make:c.make, model:c.model,
    shaft:c.shaft, length:c.length, lie:c.lie, year:c.year, swt:c.swt,
    bag:'Removed from bag', type:c.type };
  if(c.grip) rec.grip=c.grip;
  if(c.weightOz) rec.weightOz=c.weightOz;
  /* The WHOLE stock shot travels with the club, not just carry and total: a spare with a
     launch-monitor record used to lose its ball speed, spin, apex and landing angle the
     moment it left the bag, and have them estimated from loft on the way back in — a
     measurement quietly downgraded to a guess by resting a club for a fortnight. */
  const p=(typeof perf==='function')?perf(c.id):null;
  if(p&&p.prov!=='presumed'){
    CLUB_PERF_FIELDS.forEach(f=>{ if(p[f.key]!=null) rec[f.key]=p[f.key]; });
  }
  /* The PARTIAL LADDER travels too. Its ¾ / ½ / ⅓ rungs are measured numbers in their own
     right — the ones the Approach tab plays off — and rebuilding them from ratios when the
     club comes back would quietly replace a measured ladder with an average one. */
  const pr=(STATE.partials||{})[c.id];
  if(pr && pr.full!=null) rec.partials=JSON.parse(JSON.stringify(pr));
  return rec;
}
/* A readable, stable id for a club joining the bag: its label where that is free ('L', '3i'),
   because ids show up in saved data and in the few places the app special-cases a club. */
function bagNewClubId(label){
  const base=String(label||'club').replace(/[^A-Za-z0-9]/g,'') || 'club';
  const taken=new Set((STATE.clubs||[]).map(c=>c.id));
  if(!taken.has(base)) return base;
  for(let n=2;n<99;n++){ if(!taken.has(base+n)) return base+n; }
  return base+Date.now();
}
/* REMOVE — the club leaves the bag for the collection, and everything keyed to its id goes
   with it. Leaving those entries behind would hand a future club with the same id someone
   else's dispersion and D-Plane numbers. */
function bagRemoveClub(clubId){
  const i=(STATE.clubs||[]).findIndex(c=>c.id===clubId); if(i<0) return null;
  const c=STATE.clubs[i];
  const rec=bagClubToRecord(c);
  STATE.clubs.splice(i,1);
  [STATE.performance, STATE.partials, STATE.dplane, STATE.missTendency,
   (STATE.dispersion||{}).strikeCorr].forEach(m=>{ if(m) delete m[clubId]; });
  STATE.otherClubs=STATE.otherClubs||[];
  STATE.otherClubs.push(rec);
  /* Remember that a DEFAULT club was taken out, or the next load treats it as a club the app
     has just shipped and puts it back (see mergeAndFix). */
  if(typeof DEFAULT_DATA!=='undefined' && (DEFAULT_DATA.clubs||[]).some(d=>d.id===clubId)){
    STATE.retiredClubIds=STATE.retiredClubIds||[];
    if(!STATE.retiredClubIds.includes(clubId)) STATE.retiredClubIds.push(clubId);
  }
  return rec;
}
/* ADD — a collection club joins the bag in a slot of its own. Its stats are estimated from
   loft the same way the exchange does it, and stored numbers still beat the estimate. */
function bagAddFromCollection(o, preEst){
  if(!o) return null;
  if((STATE.clubs||[]).length>=MAX_BAG_CLUBS) return null;
  const label=o.label || (typeof autoLabelForLoft==='function'?autoLabelForLoft(o.effLoft):null) || '?';
  const id=bagNewClubId(label);
  const club={ id, type:o.type||bkTypeOf(o), label,
    make:o.make||'', model:o.model||'', shaft:o.shaft||'', length:o.length||'—',
    loft:(o.effLoft!=null?o.effLoft+'°':'—'), origLoft:(o.effLoft!=null?o.effLoft+'°':''),
    lie:o.lie||'—', swt:o.swt||'—', year:o.year||new Date().getFullYear() };
  if(o.grip) club.grip=o.grip;
  if(o.weightOz) club.weightOz=o.weightOz;
  STATE.clubs.push(club);
  if(club.type!=='putter'){
    /* preEst is the estimate taken BEFORE this change was applied. It matters: the clubs a
       new one is being estimated against are often the very clubs going out in the same
       change, and interpolating after they have left stretches the estimate across the hole
       they leave. A 20° driving iron replacing a 19° hybrid and a 23° utility came out at
       223 yd carry that way — interpolated between a 15° fairway wood and a 27° 5-iron. */
    const est=preEst||estimatePerfForLoft(o.effLoft, id);
    /* Whatever the record measured beats the estimate, field by field — so a spare carrying a
       full launch-monitor record arrives with all of it, and one carrying only a carry gets
       the rest estimated around it. */
    let measured=null;
    CLUB_PERF_FIELDS.forEach(f=>{ if(o[f.key]!=null){ (measured=measured||{})[f.key]=o[f.key]; } });
    if(measured&&measured.carry!=null&&measured.total==null) measured.total=measured.carry;
    if(est||measured){
      STATE.performance[id]=Object.assign({},est||{},measured||{},{prov:measured?'input':'presumed'});
      /* A ladder the club brought with it is measured; only seed one when there is none. */
      if(o.partials&&o.partials.full!=null) STATE.partials[id]=JSON.parse(JSON.stringify(o.partials));
      else seedPartialsFor(id, (measured?measured.carry:null)||(est&&(est.total||est.carry)));
    }
  }
  const idx=(STATE.otherClubs||[]).indexOf(o);
  if(idx>-1) STATE.otherClubs.splice(idx,1);
  /* Back in the bag — it is no longer retired. */
  if(Array.isArray(STATE.retiredClubIds)) STATE.retiredClubIds=STATE.retiredClubIds.filter(x=>x!==id);
  return club;
}

/* ---- The staging editor ------------------------------------------------------------
   Marks, not moves. A bag change is several decisions that only make sense together — the
   count has to come back to fourteen — so nothing is committed until the whole change is
   made, and the bar at the foot of the screen does the arithmetic while it is being made. */
window.bagEdit = window.bagEdit || null;   /* {out:Set<clubId>, in:Set<inventory index>} */
function bagEditOn(){ return !!window.bagEdit; }
function bagEditStart(){
  window.bagEdit={out:new Set(), in:new Set()};
  window.bkOpen=null; buildSpecs(); buildBackups(); bagEditBar();
}
function bagEditCancel(){ window.bagEdit=null; buildSpecs(); buildBackups(); bagEditBar(); }
function bagEditToggleOut(id){
  if(!bagEditOn()) return;
  const s=window.bagEdit.out; s.has(id)?s.delete(id):s.add(id);
  buildSpecs(); bagEditBar();
}
function bagEditToggleIn(i){
  if(!bagEditOn()) return;
  const s=window.bagEdit.in; s.has(i)?s.delete(i):s.add(i);
  buildBackups(); bagEditBar();
}
function bagEditCount(){
  const e=window.bagEdit||{out:new Set(),in:new Set()};
  const now=(STATE.clubs||[]).length;
  return {now, out:e.out.size, in:e.in.size, after:now-e.out.size+e.in.size};
}
/* The running total, and whether it can be applied. Fewer than fourteen is legal — you may
   carry thirteen — so only going OVER blocks. */
function bagEditBar(){
  const bar=document.getElementById('bag-edit-bar'); if(!bar) return;
  if(!bagEditOn()){ bar.innerHTML=''; bar.classList.remove('on'); return; }
  const {now,out,in:inn,after}=bagEditCount();
  const over=after-MAX_BAG_CLUBS;
  const names=(set,fn)=>[...set].map(fn).filter(Boolean).join(', ');
  const outNames=names(window.bagEdit.out, id=>{const c=STATE.clubs.find(x=>x.id===id); return c&&c.label;});
  const inNames=names(window.bagEdit.in, i=>{const o=(STATE.otherClubs||[])[i]; return o&&(o.label||(o.effLoft+'°'));});
  bar.classList.add('on');
  bar.innerHTML=`<div class="bge-inner">
    <div class="bge-sums">
      <span class="bge-count${over>0?' bad':''}">${now} → <b>${after}</b><i>of ${MAX_BAG_CLUBS}</i></span>
      <span class="bge-list"><em>out</em> ${outNames||'—'}</span>
      <span class="bge-list"><em>in</em> ${inNames||'—'}</span>
    </div>
    <div class="bge-btns">
      ${over>0?`<span class="bge-warn">${over} too many — take ${over} more out</span>`:''}
      <button class="btn" onclick="bagEditCancel()">Cancel</button>
      <button class="btn btn-accent" ${over>0||(out+inn)===0?'disabled':''} onclick="bagEditApply()">Apply</button>
    </div>
  </div>`;
}
/* Apply: every club marked OUT leaves, then every club marked IN joins. Removals run first so
   a straight fourteen-for-fourteen change never breaches the limit halfway through. */
function bagEditApply(){
  if(!bagEditOn()) return;
  const {after}=bagEditCount();
  if(after>MAX_BAG_CLUBS){ if(typeof toast==='function') toast('That would leave '+after+' clubs'); return; }
  const outIds=[...window.bagEdit.out];
  /* resolve the inventory RECORDS before anything moves — the indexes shift as clubs leave */
  const inRecs=[...window.bagEdit.in].map(i=>(STATE.otherClubs||[])[i]).filter(Boolean);
  /* and estimate each incoming club against the bag AS IT STANDS, before the outgoing clubs
     take their yardages with them (see bagAddFromCollection) */
  const preEsts=inRecs.map(o=>estimatePerfForLoft(o.effLoft, null));
  const gone=outIds.map(id=>{ const c=STATE.clubs.find(x=>x.id===id); const lbl=c?c.label:id; bagRemoveClub(id); return lbl; });
  const added=inRecs.map((o,k)=>{ const c=bagAddFromCollection(o, preEsts[k]); return c?c.label:null; }).filter(Boolean);
  window.bagEdit=null;
  saveState(); refreshAll(); bagEditBar();
  if(typeof toast==='function'){
    const bits=[];
    if(gone.length) bits.push('out: '+gone.join(', '));
    if(added.length) bits.push('in: '+added.join(', '));
    toast(`Bag updated — ${bits.join(' · ')} · now ${(STATE.clubs||[]).length} clubs`);
  }
}

/* From Current Bag: the replacement list under an expanded club. */
function selectReplacement(clubId,oIdx){
  const c=STATE.clubs.find(x=>x.id===clubId); if(!c) return;
  swapIntoBag(clubId, repMatches(c).matches[oIdx]);
}
/* From Backups: "Add to Current Bag" — pick which slot it takes. Offered nearest-loft
   first, because that is nearly always the intended trade, but every slot is listed: a
   bag change is the user's call, not the app's. */
function backupSlotPicker(oIdx){
  const o=STATE.otherClubs[oIdx]; if(!o) return '';
  const lo=parseFloat(o.effLoft);
  const cands=STATE.clubs
    .map(c=>({c, d:Math.abs((parseFloat(c.loft)||0)-(isNaN(lo)?0:lo))}))
    .sort((a,b)=>a.d-b.d);
  const rows=cands.map(({c,d})=>`<button type="button" class="bk-slot" onclick="backupToBag(${oIdx},'${c.id}')">
      <span class="spec-club ${c.type}">${c.label}</span>
      <span class="bk-slot-name">${escapeHtml((c.make||'')+' '+(c.model||''))}</span>
      <span class="bk-slot-loft">${escapeHtml(c.loft||'')}</span>
      <span class="rep-inline-delta ${d<=1?'exact':d<=3?'close':'off'}">${d===0?'=':'±'+(Math.round(d*10)/10)+'°'}</span>
    </button>`).join('');
  return `<div class="bk-picker"><div class="bk-picker-lbl">Swap into the bag — in place of which club?</div>${rows}</div>`;
}
function backupToBag(oIdx, clubId){
  const o=STATE.otherClubs[oIdx];
  if(o && swapIntoBag(clubId, o)) window.bkOpen=null;
}
/* From Current Bag: send this club to Locker Room. A slot cannot simply empty — the bag has
   fourteen places and the rest of the app indexes clubs by id — so removing is completed by
   saying what takes its place. That is the same exchange, run from this end, and the list of
   candidates is already on screen; this just names the act and points at it. */
function removeToBackups(clubId){
  const c=STATE.clubs.find(x=>x.id===clubId); if(!c) return;
  const {matches,loftTol,effLoft}=repMatches(c);
  if(!matches.length){
    if(typeof toast==='function') toast(`Nothing in the collection within ±${loftTol}° of ${effLoft}° to take its place`);
    return;
  }
  if(typeof toast==='function') toast(`Pick what replaces ${c.label} — it goes to the collection`);
  const lbl=document.querySelector('.specs-rep-group.open .specs-rep-label');
  if(lbl){ lbl.classList.add('rep-flash'); setTimeout(()=>lbl.classList.remove('rep-flash'),1600);
           lbl.scrollIntoView({behavior:'smooth',block:'center'}); }
}
function toggleSpecs(c,row,group){
  const open=group.classList.contains('open');
  document.querySelectorAll('.specs-club-row').forEach(r=>r.classList.remove('selected'));
  document.querySelectorAll('.specs-rep-group').forEach(g=>g.classList.remove('open'));
  if(open) return;
  row.classList.add('selected');
  const p=perf(c.id);
  /* The same grid the collection's clubs get — see clubEditGrid. */
  const editHtml=`
    <div class="specs-edit-panel">
      ${clubEditGrid('bag', c.id, c, p)}
      <div class="btn-row"><button class="btn btn-primary" onclick="event.stopPropagation();clubSaveAll('bag','${c.id}')">Save ${c.label}</button>
        <button class="btn" onclick="event.stopPropagation();removeToBackups('${c.id}')">Send to the collection</button></div>
    </div>`;
  const {effLoft,loftTol,matches}=repMatches(c);
  const repLabel=`<div class="specs-rep-label">Swap in from the collection — ±${loftTol}° Effective Loft${c.type==='putter'?' · putters only':''} · tap to swap in</div>`;
  const repHtml=!matches.length?`<div class="specs-no-rep">Nothing in your other bags within ±${loftTol}° of ${effLoft}°. A club further away than that is hidden rather than missing — edit the spec fields above to enter it directly.</div>`:matches.map((o,i)=>{
    const d=o.effLoft-effLoft, ds=d===0?'=':d>0?`+${d}°`:`${d}°`, dc=d===0?'exact':Math.abs(d)<=1?'close':'off';
    /* Which bag it is sitting in does not help you CHOOSE a club — you pick on loft, model
       and shaft, then go and find it. It lives in the club's own detail instead. */
    const extraDetail = c.type==='putter'
      ? `<div class="spec-val" style="font-size:.58rem;color:var(--muted)">${o.grip||''} · ${o.weightOz?fmtOz(o.weightOz):'—'} · ${o.swt||''}</div>`
      : '';
    return `<div class="specs-rep-row${extraDetail?' has-extra':''}" onclick="selectReplacement('${c.id}',${i})" style="cursor:pointer" title="Swap this club into your bag — stats estimated">
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
/* Editing a club's yardage in My Bag rescales its whole partial ladder by the same ratio, so
   the ¾/½/⅓ rungs follow the full number instead of going stale. That is the intended
   behaviour — but it means a bad total silently rewrites MEASURED rungs, so the number
   driving it is floored at the club's own carry: a total under its carry is data entry that
   has gone wrong, not an instruction to shrink the ladder. */
function syncPartialsForClub(id){
  const pr=STATE.partials&&STATE.partials[id], perf=STATE.performance&&STATE.performance[id];
  if(!pr||!perf||!pr.full) return;
  let tot=perf.total!=null?perf.total:perf.carry;
  if(tot==null) return;
  if(perf.carry!=null && tot<perf.carry) tot=perf.carry;
  const r=tot/pr.full;
  if(!isFinite(r)||Math.abs(r-1)<0.005) return;          // unchanged → leave partials as measured
  pr.full=Math.round(tot);
  if(pr.tq!=null) pr.tq=Math.round(pr.tq*r);
  if(pr.half!=null) pr.half=Math.round(pr.half*r);
  if(pr.third!=null) pr.third=Math.round(pr.third*r);
}
/* COMMIT a bag club. The fields themselves were written by clubFieldSave as they changed —
   including the unit round-trip guard that used to live here — so this is what has to happen
   ONCE, after an edit: the numbers are the golfer's now, the partial ladder follows the new
   total, and every surface in the app re-reads the bag. */
function saveClub(id){
  const club=STATE.clubs.find(c=>c.id===id); const p=STATE.performance[id]=STATE.performance[id]||{};
  p.prov='input';   /* user entered/confirmed these numbers → clears any Presumed (estimated) flag */
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

/* WHAT THESE STATS ACTUALLY DO. They set the skill the app models you at, per part of the
   game — so a golfer who putts 34 times is modelled as a worse putter than ball-striker, and
   Shots Expected on the Putting tab moves accordingly. Left blank they fall back to your
   handicap index, which is a real answer rather than the blank the app used to show, but a
   coarse one. Printing the resolved number beside each area is the only way to see which of
   these fields is doing work and which is still riding on the index. */
function pfDrivesHTML(){
  if(typeof effHcpForLie!=='function') return '';
  const areas=[['tee','Driving','Fairways hit'],['fairway','Approach','Greens in reg'],
               ['atg','Short game','Up &amp; down'],['green','Putting','Putts per round']];
  const fmt=h=>h==null?'—':(h<0?'+'+Math.abs(Math.round(h*10)/10):String(Math.round(h*10)/10));
  const rows=areas.map(a=>{
    const h=effHcpForLie(a[0]);
    const src=(typeof effHcpSource==='function')?effHcpSource(a[0]):'index';
    return `<span class="pf-drive${src==='stat'?' on':''}" title="${src==='stat'
      ? a[2]+' is setting this' : 'No '+a[2].toLowerCase()+' on file — using your handicap index'}">
      <b>${a[1]}</b> ${fmt(h)} <i>${src==='stat'?a[2].toLowerCase():'from index'}</i></span>`;
  }).join('');
  return `<div class="pf-drive-row">${rows}</div>
    <p class="gen-note" style="margin:6px 0 0">These set the skill the app models you at in each part of the game — they drive “Shots Expected”, strokes gained, and the Hole Overlay's plan. Anything left blank falls back to your handicap index.</p>`;
}
function buildProfile(){
  const pf=STATE.profile;
  const _pg=document.getElementById('profile-grid');
  if(_pg) _pg.innerHTML=`
    <div class="edit-subhead">Player</div>
    <div class="edit-field"><label>Name</label><input id="pf-name" value="${escapeHtml(pf.name||'')}"></div>
    <div class="edit-field"><label>Handedness</label>${sel('pf-handed',['','RH','LH'],pf.handedness||'RH')}</div>
    <div class="edit-field"><label>Hdcp Index</label><input id="pf-hcp" value="${escapeHtml(pf.handicap||'')}" placeholder="e.g. 8 or +2"></div>
    <div class="edit-field"><label>Hdcp Index Goal</label><input id="pf-goalhcp" value="${escapeHtml(pf.goalHcp||'')}" placeholder="e.g. 5"></div>
    <!-- The handicap service and member number are the two fields a future sync needs to
         know WHICH record to pull, so they stay even though nothing reads them yet. Glove
         size left for Causation -> Body, which already collects it; rounds and practice per
         year fed only the Goals card, which is gone. -->
    <details class="pf-ref" style="grid-column:1/-1"${window.pfRefOpen?' open':''} ontoggle="window.pfRefOpen=this.open">
      <summary>Handicap service <span>where your index is held</span></summary>
      <div class="edit-grid">
        <p class="gen-note" style="grid-column:1/-1;margin:0 0 4px">Your index is ${pf.hcpProv==='synced'?sgProv('synced'):sgProv('input')} today. Signing in to your federation would make it ${sgProv('synced')} — their audited record of posted scores rather than a number typed here. That needs a StrongerGolf server to hold the credentials (a browser cannot), so the fields below record <em>which</em> account to pull, ready for it.</p>
        <div class="edit-field"><label>Service</label>${sel('pf-hcpsvc',['','GHIN (USGA)','Golf Canada','Golf Australia','CONGU (GB&I)','Golf NZ','Other'],pf.hcpService||'')}</div>
        <div class="edit-field"><label>Member / GHIN number</label><input id="pf-hcpid" value="${escapeHtml(pf.hcpId||'')}" placeholder="Member number"></div>
      </div>
    </details>
    <div class="edit-subhead">Swing Speed</div>
    <div class="edit-field" style="grid-column:1/-1"><label>Driver Swing Speed (${unitLabel('speed')})</label>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input id="pf-ss" type="number" style="width:90px" value="${pf.driverSwingSpeed?mphNum(pf.driverSwingSpeed):''}">
        <button class="btn btn-accent" onclick="generateFromSwingSpeed()" style="white-space:nowrap;padding:5px 10px;font-size:.74rem">Re-generate Ladder</button>
        <span style="font-family:ui-monospace,monospace;font-size:.52rem;color:var(--muted)">scales all carries proportionally — refine from real data after</span>
      </div>
    </div>
    <div class="edit-subhead">Typical Round Stats</div>
    <div class="pf-drives" style="grid-column:1/-1">${pfDrivesHTML()}</div>
    <div class="edit-field"><label>Scoring Average</label><input id="pf-scoreavg" type="number" step="0.1" value="${escapeHtml(pf.scoringAvg||'')}" placeholder="e.g. 84"></div>
    <div class="edit-field"><label>Fairways Hit %</label><input id="pf-fir" type="number" step="1" min="0" max="100" value="${escapeHtml(pf.firPct||'')}" placeholder="e.g. 45"></div>
    <div class="edit-field"><label>Greens in Reg %</label><input id="pf-gir" type="number" step="1" min="0" max="100" value="${escapeHtml(pf.girPct||'')}" placeholder="e.g. 40"></div>
    <div class="edit-field"><label>Putts per Round</label><input id="pf-putts" type="number" step="0.1" value="${escapeHtml(pf.puttsRound||'')}" placeholder="e.g. 32"></div>
    <div class="edit-field"><label>Up &amp; Down %</label><input id="pf-updown" type="number" step="1" min="0" max="100" value="${escapeHtml(pf.upDownPct||'')}" placeholder="scrambling, e.g. 40"></div>`;
  /* Handicap trend — inside same card (null-checked like lm-grid) */
  const ht=document.getElementById('hcp-trend-wrap');
  if(ht) ht.innerHTML=hcpTrendHtml();
  /* Launch-monitor data now lives in the Driver Optimizer (Stock Shots → Driver) as dated sessions. */
  /* Home Course & Conditions — home setup + course surfaces (live weather + density K now
     live in the Environmental Adjustment on Stock Shots / Approach). */
  const _bg=document.getElementById('baseline-grid');
  if(_bg) _bg.innerHTML=`
    <div class="edit-subhead">Home Course Setup</div>
    <div class="edit-field"><label>Home Course</label><input id="pf-homecourse" value="${escapeHtml(pf.homeCourse||'')}" placeholder="seeds Plan"></div>
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
    <div class="edit-field"><label>ID Marking</label><input id="ball-align" value="${escapeHtml(pf.ballAlignment||'')}" placeholder="e.g. line, dot, initials"></div>
    <div class="edit-field"><label>Cover Material</label>${sel('ball-cover',['','Urethane','Ionomer / Surlyn','TPU','Hybrid'],pf.ballCover||'')}</div>
    <div class="edit-field"><label>Cover Firmness</label>${sel('ball-firmness',['','Firm','Medium','Soft'],pf.ballFirmness||'')}</div>
    <div class="edit-field"><label>Construction</label>${sel('ball-layers',['','2-piece','3-piece','4-piece','5-piece'],pf.ballLayers||'')}</div>
    <div class="edit-field"><label>Color</label>${sel('ball-color',['','White','Yellow','Orange','Pink','Red','Green','Matte White','Matte Yellow','Other'],pf.ballColor||'')}</div>
    <div class="edit-field"><label>Spin Characteristics</label>${sel('ball-spin',['','Low','Medium','High'],pf.ballSpin||'')}</div>
    <div class="edit-field"><label>Trajectory Tendency</label>${sel('ball-trajectory',['','Low','Mid','High'],pf.ballTrajectory||'')}</div>
    <div class="edit-field" style="grid-column:1/-1"><label>Notes</label><input id="ball-notes" value="${escapeHtml(pf.ballNotes||'')}" placeholder="feel preference, conditions, wind performance, short game control…"></div>`;
  pfDirtyInit();
}
/* The ball's summary card and its edit form are on the same page again, so this is a scroll
   rather than a hop — the showGroupPage call stays for the cases that reach it from another
   tab. (It targeted the Locker Room, which no longer exists as its own page.) */
function ballEditJump(){
  if(typeof showGroupPage==='function') showGroupPage('setup','specs');
  setTimeout(()=>{
    const dd=document.getElementById('ball-edit-dd'); if(dd) dd.open=true;
    const g=document.getElementById('ball-grid'); if(g) g.scrollIntoView({behavior:'smooth',block:'center'});
  },120);
}
function clearBallForm(){
  ['ball-make','ball-model','ball-align','ball-cover','ball-firmness','ball-layers','ball-color','ball-spin','ball-trajectory','ball-notes']
    .forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  if(typeof toast==='function') toast('Ball fields cleared — Save Edits to apply');
}
function saveProfile(){
  const pf=STATE.profile;
  pf.name=document.getElementById('pf-name').value;
  pf.handicap=document.getElementById('pf-hcp').value;
  /* typed in the displayed unit; stored in mph */
  { const _ss=parseFloat(document.getElementById('pf-ss').value);
    if(!isNaN(_ss)) pf.driverSwingSpeed=Math.round(fromDisplay('speed',_ss)); }
  /* pf-handed = the profile's own control; the Assess swing card has a pf-hand twin —
     both read/write STATE.profile.handedness ('RH'/'LH') and stay in sync via rebuilds */
  pf.handedness=document.getElementById('pf-handed')?.value??pf.handedness;
  /* glove size now lives on Causation -> Body only; rounds/practice per year are no longer
     collected here. Keep whatever is stored rather than clearing it. */
  pf.gloveSize=document.getElementById('pf-glove')?.value??pf.gloveSize;
  pf.roundsPerYear=document.getElementById('pf-rounds')?.value??pf.roundsPerYear;
  pf.practicePerYear=document.getElementById('pf-practice')?.value??pf.practicePerYear;
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
  pf.hcpService=document.getElementById('pf-hcpsvc')?.value??pf.hcpService;
  pf.hcpId=document.getElementById('pf-hcpid').value;
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
  /* live weather + density K now live in the Environmental Adjustment (Stock Shots / Approach) */
  /* course conditions */
  pf.roughLength=document.getElementById('pf-roughlength')?.value??pf.roughLength;
  pf.greenGrass=document.getElementById('pf-greengrass')?.value??pf.greenGrass;
  pf.fairwayGrass=document.getElementById('pf-fairwaygrass')?.value??pf.fairwayGrass;
  pf.roughGrass=document.getElementById('pf-roughgrass')?.value??pf.roughGrass;
  pf.bunkerSand=document.getElementById('pf-bunkersand')?.value??pf.bunkerSand;
  window.pfDirty=false;
  saveState(); refreshAll(); toast('Profile saved');
}
/* ---- Unsaved-edit protection: the Locker Room forms are the only ones in the app
   without instant save. Any edit marks them dirty; navigating anywhere (tab/group
   switch — see showGroup/showPage) or closing the app commits via saveProfile, so
   edits can no longer be silently lost. Listeners sit on the grid CONTAINERS, which
   survive buildProfile's innerHTML rebuilds. ---- */
function pfDirtyInit(){
  ['profile-grid','baseline-grid','ball-grid'].forEach(id=>{
    const el=document.getElementById(id); if(!el||el._dirtyWired) return; el._dirtyWired=true;
    el.addEventListener('input',()=>{ window.pfDirty=true; });
    el.addEventListener('change',()=>{ window.pfDirty=true; });
  });
}
function pfMaybeSave(){ if(window.pfDirty){ window.pfDirty=false; saveProfile(); } }
window.addEventListener('beforeunload',()=>{ if(window.pfDirty) try{ pfMaybeSave(); }catch(_){} });
function saveCalibration(){ const el=document.getElementById('dens-k'); if(el){ STATE.densityK=Math.max(0,Math.min(2,parseFloat(el.value)||0.65)); saveState(); buildLadder(); if(typeof updateCondSummary==='function') updateCondSummary(); toast('Calibration saved'); } }
function generateFromSwingSpeed(){
  const target=parseFloat(document.getElementById('pf-ss')?.value);
  const base=STATE.profile.driverSwingSpeed;
  if(!target||!base){ toast('Enter a driver swing speed'); return; }
  /* SPEED scales linearly \u2014 it is the input \u2014 but CARRY does not follow it one for one.
     This used to multiply every carry by the raw speed ratio, which flatters a slower swing:
     at 95 mph against a 110 mph baseline it kept 86.4% of the distance where the bag's own
     carry-to-speed relation says 82.0%, about 5% long across every club, compounding into a
     ladder that would never match the range. */
  const ratio=target/base;
  const cRatio=(typeof carryRatioForSpeed==='function')?carryRatioForSpeed(ratio):ratio;
  STATE.clubs.forEach(c=>{const p=STATE.performance[c.id];if(!p)return;
    if(p.carry!=null)p.carry=Math.round(p.carry*cRatio);
    if(p.total!=null)p.total=Math.round(p.total*cRatio);
    if(p.bspd!=null)p.bspd=Math.round(p.bspd*ratio);
    if(p.cspd!=null)p.cspd=Math.round(p.cspd*ratio);
  });
  Object.keys(STATE.partials).forEach(id=>{const pr=STATE.partials[id];['full','tq','half','third'].forEach(k=>{if(pr[k]!=null)pr[k]=Math.round(pr[k]*cRatio);});});
  STATE.profile.driverSwingSpeed=target;
  saveState(); refreshAll(); toast('Ladder generated — refine from real data');
}
/* ============================================================
   MY DATA — one page answering "what is feeding the model?"
   ============================================================
   Every number in this app comes from somewhere: a connected launch monitor, a block of
   shots typed in by hand, or an app default. That distinction is already the provenance
   system; what was missing was a single place to SEE it and act on it. Calibration used to
   be buried at the bottom of the Short Game tab, which meant only one model area had a home
   and nobody would find it.

   Built as a list of SOURCES rather than a hand-laid page, because the list is going to keep
   growing — full-swing carries, putting, on-course tracking, and every device that turns up
   after them. Adding one is a single entry in MY_DATA_SOURCES. */
const MY_DATA_SOURCES = [
  { id:'shortgame', title:'Short game — launch, spin, rollout',
    drives:'Every carry, rollout and club suggestion on the Short Game tab.',
    host:'sg-cal-wrap',
    status:()=> (typeof chipCalibrated==='function'&&chipCalibrated())?'captured':'presumed',
    render:()=>{ if(typeof renderSgCal==='function') renderSgCal(); } },
  { id:'strike', title:'Dispersion — how your pattern leans',
    drives:'The shape of every dispersion oval, and the aim optimiser behind the Hole Overlay.',
    host:'strike-cal-wrap',
    status:()=> Object.keys((STATE.dispersion&&STATE.dispersion.strikeCorr)||{}).length?'input':'presumed',
    render:()=>{ if(typeof renderStrikeCal==='function') renderStrikeCal(); } }
];
function buildMyData(){
  const wrap=document.getElementById('mydata-wrap'); if(!wrap) return;
  const prov=k=>(typeof sgProv==='function')?sgProv(k):'';
  const cards=MY_DATA_SOURCES.map(src=>`
    <details class="src-card" id="src-${src.id}">
      <summary>
        <span class="src-name">${src.title}</span>
        ${prov(src.status())}
        <span class="src-drives">${src.drives}</span>
      </summary>
      <div class="src-body"><div id="${src.host}"></div></div>
    </details>`).join('');
  wrap.innerHTML=`
    <div class="profile-card">
      <h3>My Data <span class="card-sub">what is feeding the model, and how good it is</span></h3>
      <p class="gen-note">Anything measured earns <span class="sg-prov" style="color:var(--green);background:rgba(0,133,63,.12)">Captured</span>; anything typed in earns <span class="sg-prov" style="color:var(--sky);background:rgba(26,90,170,.12)">Input</span>. Everything else is an app default, and says so. Calibrating a source replaces a default with your own golf.</p>
      <div class="src-list">${cards}</div>
      <!-- PROVENANCE was its own card saying what the badges above mean, and DATA a third one
           saying where all of it is stored. Both are about the same thing this card already
           is — what the model is being fed — so they are sections of it rather than neighbours
           repeating its subject. -->
      <h4 class="mydata-sub">How every number is sourced</h4>
      <p class="gen-note">Each data point is labelled by how trustworthy its source is. Calculations inherit the weakest source of their inputs — only maths built purely on Captured data earns Verified.</p>
      <div class="prov-legend">
        <div class="prov-legend-item"><span class="sg-prov" style="color:var(--green);background:rgba(0,133,63,.12)">Captured</span> measured by a device — launch monitor, GPS, putt timer.</div>
        <div class="prov-legend-item"><span class="sg-prov" style="color:var(--green);background:rgba(0,133,63,.12)">✓ Verified</span> calculated directly from Captured data.</div>
        <div class="prov-legend-item"><span class="sg-prov" style="color:var(--sky);background:rgba(26,90,170,.18)">↻ Synced</span> pulled from an authoritative record you signed in to — a federation handicap index.</div>
        <div class="prov-legend-item"><span class="sg-prov" style="color:var(--sky);background:rgba(26,90,170,.12)">Input</span> typed in by you — specs, baselines, typical-round stats.</div>
        <div class="prov-legend-item"><span class="sg-prov" style="color:var(--dp-loft);background:rgba(196,150,30,.16)">Presumed</span> assumed / interviewed / app default — not measured.</div>
      </div>
      <p class="gen-note" style="margin-top:10px">Answering profile questions — capturing your full-bag dispersion, say — can unlock features like full course strategy, but an interviewed answer is <em>Presumed</em>, not Captured, until measured data backs it.</p>
      <h4 class="mydata-sub">Where it lives</h4>
      <p class="gen-note">All of it — bag, performance numbers, swing data, courses and profile — is saved in this browser and nowhere else. Back it up, move it to another device, or start again from the demo bag. Backup and restore also sit at the foot of <b>My Clubs</b>, beside the clubs themselves.</p>
      <div class="btn-row">
        <button class="btn" onclick="exportData()">Backup JSON</button>
        <button class="btn" onclick="triggerImportFile()">Restore</button>
        <button class="btn" onclick="exportClubsCsv()">Clubs CSV</button>
        <button class="btn" onclick="resetData()">Reset to Demo</button>
        <input type="file" id="import-file" accept="application/json" style="display:none" onchange="importData(event)">
      </div>
    </div>
    <div class="profile-card">
      <h3>Connected Sources <span class="card-sub">launch monitor, TPI, 3D motion — verify to earn Captured</span></h3>
      <p class="gen-note">Connect a source, confirm it's your account, and StrongerGolf folds the session into your data with a <span class="sg-prov" style="color:var(--green);background:rgba(0,133,63,.12)">Captured</span> badge. Sessions are weighted (a 50-ball block on one club ≠ 50 independent shots) and tracked over time for trends.</p>
      <div class="prov-legend" style="margin-bottom:10px">
        <div class="prov-legend-item"><b style="color:var(--ink)">Trackman / Foresight / FlightScope</b> — shot-by-shot ball &amp; club data</div>
        <div class="prov-legend-item"><b style="color:var(--ink)">TPI screen</b> — physical-screen results</div>
        <div class="prov-legend-item"><b style="color:var(--ink)">MindTrak</b> — focus / arousal data</div>
        <div class="prov-legend-item"><b style="color:var(--ink)">GEARS / 3D motion</b> — kinematic-sequence capture</div>
      </div>
      <div class="btn-row"><button class="btn" disabled style="opacity:.55;cursor:not-allowed">Connect a source — coming soon</button></div>
    </div>`;
  MY_DATA_SOURCES.forEach(src=>{ try{ src.render(); }catch(e){} });
  buildUnitToggle();
}
/* Units, one row per category. Built from UNIT_SETTINGS, so a new category appears here by
   declaring it in conditions.js — this function never needs touching.
   Per category rather than one switch because that is how people actually measure: North
   American golf is played in yards whatever the passport, while everything outside the game
   may well be metric. The two buttons at the top set every row at once, for anyone who does
   want a single answer. */
/* One app-wide comparison benchmark, chosen here rather than repeated as a dropdown on every
   expected-shots strip — the same question asked on four tabs, whose answer did not travel. */
/* BACKUPS — every club not currently in the bag, grouped by where it physically lives.
   Each row expands to its specs and an "Add to Current Bag" button, which then asks which
   slot it takes. The bag side has the mirror of this, so a swap can be started from whichever
   end the golfer is thinking from. */
function bkToggle(i){ window.bkOpen = (window.bkOpen===i) ? null : i; buildBackups(); }
const DASH_JS='\u2014', DEG_JS='\u00b0', UP_JS='\u25b4', DOWN_JS='\u25be', ELL_JS='\u2026', MID_JS='\u00b7';
/* WHAT YOU CAN CHANGE HERE. A club out of the bag is still a club you own, and its specs
   get corrected the same way — a re-loft, a new shaft, a grip — through the same editor the
   bag uses (CLUB_SPEC_FIELDS / clubEditGrid above). This panel had its own field list and
   its own save path, which is how the two drifted: no stock shot beyond carry and total,
   no Save button, and a different field order. */
/* SORT + FILTER. The collection runs to dozens of clubs across several bags and the only way
   to find one was to scroll. Location stays the default because it is how the clubs are
   physically arranged — it is where you would walk to fetch one — but loft is what you sort by
   when you are looking for something to fill a gap. */
window.bkView = window.bkView || { q:'', type:'', sort:'location' };
function bkSetView(k,v){ window.bkView[k]=v; window.bkOpen=null; buildBackups(); }
/* A collection club's TYPE decides its colour, which filter it answers to, and — now that a
   club can join the bag from here — what it becomes when it does. Loft alone got that wrong
   at the top of the bag: a 20° driving iron is not a wood, and modern 2, 3 and 4 irons live
   at 18–24° where this returned 'wood'. The LABEL is the better witness where it exists,
   because it is what the golfer calls the club: "3" or "4i" is an iron, "3w" a wood, "H" a
   hybrid. Loft still decides when there is no label to go on. */
function bkTypeOf(o){
  if(o.type) return o.type;
  const L=String(o.label||'').trim();
  if(/^(p|pu|putter)$/i.test(L)) return 'putter';
  if(/w$/i.test(L) || /^(d|h|u)$/i.test(L)) return 'wood';      /* 3w · driver · hybrid · utility */
  if(/^\d{1,2}i?$/.test(L)) return 'iron';                      /* 3 · 4i · 9 */
  if(/^[a-z]{1,2}$/i.test(L)) return 'wedge';                   /* P · G · S · L · X */
  return (o.effLoft>=44)?'wedge':(o.effLoft>=24)?'iron':'wood';
}
const BK_TYPES=[['','All'],['wood','Woods'],['iron','Irons'],['wedge','Wedges'],['putter','Putters']];
const BK_SORTS=[['location','Location'],['loft','Loft'],['label','Label'],['name','Make & model'],['year','Year']];
function buildBackups(){
  const wrap=document.getElementById('backups-wrap'); if(!wrap) return;
  const all=STATE.otherClubs||[];
  const V=window.bkView, q=(V.q||'').trim().toLowerCase();
  const hay=o=>[o.label,o.make,o.model,o.shaft,o.bag,o.effLoft].filter(Boolean).join(' ').toLowerCase();
  let rows=all.map((o,i)=>({o,i}))
    .filter(r=>!V.type||bkTypeOf(r.o)===V.type)
    .filter(r=>!q||hay(r.o).includes(q));
  const ctl='<div class="section-label" style="margin-top:2px">The Collection <span style="font-weight:400;color:var(--muted)">'
    + MID_JS+' '+all.length+' club'+(all.length===1?'':'s')+' you own but are not carrying</span></div>'
    + '<div class="bk-controls">'
    + '<input class="bk-search" type="search" placeholder="Search make, model, shaft'+ELL_JS+'" value="'+escapeHtml(V.q||'')+'" oninput="bkSetView(\'q\',this.value)">'
    + '<div class="unit-row-btns bk-type">'+BK_TYPES.map(t=>'<button type="button" class="unit-btn'+(V.type===t[0]?' on':'')+'" onclick="bkSetView(\'type\',\''+t[0]+'\')">'+t[1]+'</button>').join('')+'</div>'
    + '<label class="bk-sort">Sort<select class="strat-select" onchange="bkSetView(\'sort\',this.value)">'
    + BK_SORTS.map(t=>'<option value="'+t[0]+'"'+(V.sort===t[0]?' selected':'')+'>'+t[1]+'</option>').join('')+'</select></label></div>';
  if(!all.length){ wrap.innerHTML=ctl+'<div class="specs-no-rep">No spare clubs on file.</div>'; return; }
  if(!rows.length){ wrap.innerHTML=ctl+'<div class="specs-no-rep">Nothing matches '+DASH_JS+' <a href="#" onclick="window.bkView.q=\'\';bkSetView(\'type\',\'\');return false">clear the filters</a>.</div>'; return; }
  /* THE SAME ROW AS THE BAG. Both lists live on one page now, so a collection club is read
     down the same columns as the club it might replace — length, loft, lie, then what it
     does: carry, total and the 86% lateral. A spare has no measured performance until one is
     entered, so those print an em dash rather than an estimate; entering carry and total in
     the panel below fills them, and they travel with the club into the bag.
     Make and model share one line, and the shaft moved into the panel, for the same reason
     the bag rows did it: a second line sets the height of every row on a phone. */
  const editing=(typeof bagEditOn==='function'&&bagEditOn());
  const card=r=>{
    const o=r.o, i=r.i, open=!editing&&window.bkOpen===i;
    const markedIn=editing&&window.bagEdit.in.has(i);
    const carry=parseFloat(o.carry)||0, total=parseFloat(o.total)||0;
    const d86=(carry>0&&typeof disp86==='function')?disp86(carry):null;
    let h='<div class="specs-club-row spec-card'+(open?' selected':'')+(markedIn?' bge-in':'')
      +'" onclick="'+(editing?'bagEditToggleIn('+i+')':'bkToggle('+i+')')+'" style="cursor:pointer">'
      + '<span class="spec-club '+bkTypeOf(o)+'">'+escapeHtml(o.label||DASH_JS)+'</span>'
      + '<div class="sc-id"><span class="sc-name">'+escapeHtml([o.make,o.model].filter(Boolean).join(' ')||DASH_JS)+'</span></div>'
      + miniCell('Length', o.length||DASH_JS,'sm-w-len')
      + miniCell('Loft', o.effLoft!=null?o.effLoft+DEG_JS:DASH_JS,'sm-w-deg')
      + miniCell('Lie', o.lie||DASH_JS,'sm-w-deg')
      + '<div class="sc-sep"></div>'
      + miniCell('Carry '+ydUnit(), carry>0?ydNum(carry):DASH_JS,'sm-w-yd')
      + miniCell('TTL '+ydUnit(), total>0?ydNum(total):DASH_JS,'sm-w-yd')
      + miniCell('86% L/R', d86!=null?ydNum(d86,1):DASH_JS,'sm-w-lr')
      + (editing ? '<div class="bge-mark'+(markedIn?' on':'')+'">'+(markedIn?'IN':'Put in')+'</div>'
                 : '<div class="specs-chevron">'+(open?UP_JS:DOWN_JS)+'</div>')
      + '</div>';
    if(open){
      /* The same panel a bag club opens: same fields, same order, same Save. The only
         differences are the ones that are true — a location instead of miss tendencies, and
         "put it in the bag" instead of "send it to the collection". */
      h+='<div class="specs-rep-group open"><div class="specs-rep-group-inner specs-edit-panel" style="padding:10px 14px">'
        + clubEditGrid('col', i, o, o)
        + '<p class="gen-note" style="margin:6px 2px 0">A stock shot is optional '+DASH_JS+' whatever you fill in travels with the club into the bag, instead of being estimated from its loft.</p>'
        + '<div class="btn-row"><button class="btn btn-primary" onclick="event.stopPropagation();clubSaveAll(\'col\',\''+i+'\')">Save '+escapeHtml(o.label||'club')+'</button></div>'
        + backupSlotPicker(i) + '</div></div>';
    }
    return h;
  };
  /* The rows go inside a .specs-wrap like the bag's, so the two lists sit in the same card
     and scroll sideways together on a phone — without it the name column was squeezed out of
     a 375px row and every collection club read as a bare label. */
  let html=ctl+'<div class="specs-wrap" id="bk-list">';
  if(V.sort==='location'){
    const groups={};
    rows.forEach(r=>{ const g=r.o.bag||'Unfiled'; (groups[g]=groups[g]||[]).push(r); });
    const order=Object.keys(groups).sort((a,b)=> a==='Removed from bag'?-1 : b==='Removed from bag'?1 : a.localeCompare(b));
    order.forEach(g=>{
      html+='<div class="ladder-divider">'+escapeHtml(g)+' <span style="opacity:.7">'+MID_JS+' '+groups[g].length+'</span></div>';
      groups[g].forEach(r=>{ html+=card(r); });
    });
  } else {
    const cmp={
      loft:  (a,b)=>((a.o.effLoft==null?999:a.o.effLoft)-(b.o.effLoft==null?999:b.o.effLoft)),
      label: (a,b)=>String(a.o.label||'').localeCompare(String(b.o.label||'')),
      name:  (a,b)=>((a.o.make||'')+' '+(a.o.model||'')).localeCompare((b.o.make||'')+' '+(b.o.model||'')),
      year:  (a,b)=>((parseInt(b.o.year)||0)-(parseInt(a.o.year)||0))
    }[V.sort];
    rows=rows.slice().sort(cmp);
    const nm={location:'location',loft:'loft',label:'label',name:'make & model',year:'year'}[V.sort];
    html+='<div class="ladder-divider">By '+nm+' <span style="opacity:.7">'+MID_JS+' '+rows.length+'</span></div>';
    rows.forEach(r=>{ html+=card(r); });
  }
  wrap.innerHTML=html+'</div>';
}
function bkSpec(l,v){ return (v==null||v==='')?'':`<div class="bk-spec"><span>${l}</span><b>${escapeHtml(String(v))}</b></div>`; }
function miniCell(label,val,wCls){ return `<div class="spec-mini ${wCls}"><span class="sm-l">${label}</span><span class="sm-v">${val}</span></div>`; }
function buildEsCompareToggle(){
  const el=document.getElementById('escmp-toggle'); if(!el) return;
  if(typeof ES_COMPARE_ORDER==='undefined'){ el.innerHTML=''; return; }
  const cur=esCompareKey();
  el.innerHTML='<div class="unit-row-btns escmp-btns">'+ES_COMPARE_ORDER.map(k=>
    `<button type="button" class="unit-btn${k===cur?' on':''}" onclick="esSetCompare('${k}')">${escapeHtml(ES_COMPARE[k].label)}</button>`).join('')+'</div>';
}
function buildUnitToggle(){
  const el=document.getElementById('unit-toggle'); if(!el) return;
  if(typeof UNIT_SETTINGS==='undefined'){ el.innerHTML=''; return; }
  const groups=Object.keys(UNIT_SETTINGS);
  const allMetric=groups.every(g=>unitSysFor(g)==='metric');
  const allImperial=groups.every(g=>unitSysFor(g)==='imperial');
  const rows=groups.map(g=>{
    const cfg=UNIT_SETTINGS[g], cur=unitSysFor(g);
    const btn=(v,lbl)=>`<button type="button" class="unit-btn${v===cur?' on':''}" onclick="setUnitPref('${g}','${v}')">${escapeHtml(lbl)}</button>`;
    return `<div class="unit-row">
      <div class="unit-row-id"><span class="unit-row-label">${cfg.label}</span><span class="unit-row-note">${cfg.note}</span></div>
      <div class="unit-row-btns">${btn('imperial',cfg.imperial)}${btn('metric',cfg.metric)}</div>
    </div>`;
  }).join('');
  el.innerHTML=`
    <div class="unit-all">
      <span class="unit-all-lbl">Set everything</span>
      <div class="unit-row-btns">
        <button type="button" class="unit-btn${allImperial?' on':''}" onclick="setUnits('imperial')">All imperial</button>
        <button type="button" class="unit-btn${allMetric?' on':''}" onclick="setUnits('metric')">All metric</button>
      </div>
    </div>
    <div class="unit-rows">${rows}</div>
    <p class="gen-note" style="margin:10px 2px 0">Mix them freely — yards off the tee with °C and grams is a perfectly normal combination. Stored data never changes; only the display converts, so switching back and forth is lossless.</p>`;
}

/* ---- Strike correlation: the one number that decides how a landing pattern leans ----
   Exposed as the correlation itself rather than as an angle, because the correlation is what
   a golfer can measure: take a block of tracked shots, plot lateral miss against distance
   miss, and the strength of that relationship is ρ. The resulting lean is shown live beside
   it so the abstract number has something concrete attached. */
function renderStrikeCal(){
  const wrap=document.getElementById('strike-cal-wrap'); if(!wrap) return;
  STATE.dispersion=STATE.dispersion||{strikeCorr:{}};
  const set=STATE.dispersion.strikeCorr||(STATE.dispersion.strikeCorr={});
  const TYPES=[['wood','Woods & hybrids',270],['iron','Irons',175],['wedge','Wedges',95]];
  const rows=TYPES.map(([t,label,carry])=>{
    const cur=(typeof set[t]==='number')?set[t]:(window.STRIKE_CORR?STRIKE_CORR[t]:0.2);
    const lean=(typeof dispTiltFor==='function')?dispTiltFor(t,carry):0;
    const own=(typeof set[t]==='number');
    return `<div class="strike-row">
      <span class="strike-lbl">${label}</span>
      <input type="range" min="0" max="0.9" step="0.05" value="${cur}" oninput="setStrikeCorr('${t}',this.value)">
      <span class="strike-val">ρ ${(+cur).toFixed(2)}</span>
      <span class="strike-lean">leans <b>${lean.toFixed(1)}°</b> at ${fmtYd(carry)}</span>
      ${own?`<button class="sgcal-del" title="Back to the app default" onclick="setStrikeCorr('${t}',null)">✕</button>`:'<span></span>'}
    </div>`;
  }).join('');
  wrap.innerHTML=`
    <p class="gen-note" style="margin-top:0">Hitting one long and hitting it left are not independent — the same strike causes both. A toe hit gears the ball into a draw and takes spin off it, so it flies further <em>and</em> finishes left; a heel hit does the mirror. How strongly the two move together is <b>ρ</b>, and it is bigger for a driver than a wedge because a bigger head produces more gear effect.</p>
    <p class="gen-note">To measure it: take a block of tracked shots on one club, and compare each shot's distance miss with its lateral miss. If long shots reliably finish left, ρ is high. If there is no relationship, set it to <b>0</b> — an upright pattern is the honest answer when there is no evidence of a lean.</p>
    <div class="strike-grid">${rows}</div>
    <p class="gen-note" style="margin-bottom:0">This replaced a fixed 15° lean applied to every club in the bag, which was never measured and was large enough to decide the answer to every question the app asked about shot shape.</p>`;
}
function setStrikeCorr(type,val){
  STATE.dispersion=STATE.dispersion||{strikeCorr:{}};
  const set=STATE.dispersion.strikeCorr||(STATE.dispersion.strikeCorr={});
  if(val===null||val===''||val===undefined) delete set[type];
  else { const v=parseFloat(val); if(!isNaN(v)) set[type]=Math.max(0,Math.min(0.9,v)); }
  saveState();
  if(typeof aimShapeReset==='function') aimShapeReset();
  renderStrikeCal();
  if(typeof buildLadder==='function') buildLadder();
  if(typeof buildHoleOverlay==='function') buildHoleOverlay();
}

/* CSV or JSON? JSON is the only format that can RESTORE the app: STATE is nested — partial
   ladders, per-club D-plane tendencies, courses with traced polygons, round history — and a
   spreadsheet is a rectangle. Flattening it would produce a file that imports back as
   something less than it was, which is worse than no import at all. So JSON stays the backup,
   and CSV is offered for the one part of the data that genuinely IS a table: the club
   catalogue, for a spreadsheet, an insurer or a club-fitter. It is an export, not a backup. */
const CAT_COLS=[
  ['Where','where'],['Label','label'],['Type','type'],['Make','make'],['Model','model'],
  ['Loft','loft'],['Stock loft','origLoft'],['Lie','lie'],['Length','length'],['Shaft','shaft'],
  ['Swing wt','swt'],['Year','year'],['Grip','grip'],['Carry','carry'],['Total','total']
];
/* One flat list of every club owned, bag first, each row saying where it lives. */
function clubCatalogue(){
  const rows=[];
  (STATE.clubs||[]).forEach(c=>{
    const p=(typeof perf==='function')?perf(c.id):{};
    rows.push({where:'Current Bag', label:c.label, type:c.type, make:c.make, model:c.model,
      loft:c.loft, origLoft:c.origLoft, lie:c.lie, length:c.length, shaft:c.shaft,
      swt:c.swt, year:c.year, grip:c.grip, carry:p&&p.carry!=null?p.carry:'', total:p&&p.total!=null?p.total:''});
  });
  (STATE.otherClubs||[]).forEach(o=>{
    rows.push({where:o.bag||'The collection', label:o.label, type:(typeof bkTypeOf==='function')?bkTypeOf(o):(o.type||''),
      make:o.make, model:o.model, loft:o.effLoft!=null?o.effLoft+'\u00b0':'', origLoft:'', lie:o.lie,
      length:o.length, shaft:o.shaft, swt:o.swt, year:o.year, grip:o.grip,
      carry:o.carry!=null?o.carry:'', total:o.total!=null?o.total:''});
  });
  return rows;
}
function exportClubsCsv(){
  const esc=v=>{ const t=(v==null?'':String(v)); return /[",\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; };
  const lines=[CAT_COLS.map(c=>esc(c[0])).join(',')]
    .concat(clubCatalogue().map(r=>CAT_COLS.map(c=>esc(r[c[1]])).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='strongergolf-clubs-'+((STATE.profile.name||'data').replace(/\s+/g,'-').toLowerCase())+'.csv';
  a.click(); URL.revokeObjectURL(a.href);
  if(typeof toast==='function') toast('Club catalogue exported (CSV)');
}
function exportData(){
  const blob=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='strongergolf-bag-'+(STATE.profile.name||'data').replace(/\s+/g,'-').toLowerCase()+'.json';
  a.click(); URL.revokeObjectURL(a.href); toast('Exported');
}
/* Import and Reset both REPLACE the entire STATE (bag, captures, D-plane tendencies,
   partials, profile, rounds) — so both confirm first and download a backup before acting. */
function importData(e){
  const f=e.target.files[0]; if(!f)return;
  if(!confirm(`Import "${f.name}"?\n\nThis REPLACES all current data (bag, captured numbers, tendencies, profile).\nA backup of your current data will download first.`)){ e.target.value=''; return; }
  exportData();
  const r=new FileReader();
  r.onload=()=>{ try{ window.STATE=mergeDefaults(JSON.parse(r.result)); saveState(); renderAll(); toast('Imported — previous data backed up'); }catch(err){ toast('Import failed — invalid file (current data unchanged)'); } };
  r.readAsText(f); e.target.value='';
}
function resetData(){
  if(!confirm('Reset to the demo bag?\n\nThis REPLACES all current data (bag, captured numbers, tendencies, profile).\nA backup of your current data will download first.')) return;
  exportData();
  window.STATE=deepClone(DEFAULT_DATA); saveState(); renderAll(); toast('Reset to demo bag — previous data backed up');
}

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
Object.assign(window, { CLUB_SPEC_FIELDS, CLUB_PERF_FIELDS, clubField, clubEditGrid, clubFieldSave, clubSaveAll,
  bagEditOn, bagEditStart, bagEditCancel, bagEditToggleOut, bagEditToggleIn,
  bagEditApply, bagEditBar, bagEditCount, bagRemoveClub, bagAddFromCollection, bagClubToRecord,
  bagNewClubId, bagLadderRatios, seedPartialsFor,
  GREENSIDE_WEDGE_LOFT, MAX_BAG_CLUBS, WEDGE_LABEL_BANDS, autoLabelForLoft, bagIsFull, MY_DATA_SOURCES, buildMyData, buildUnitToggle, renderStrikeCal, setStrikeCorr, buildProfile, buildSpecs, ballEditJump, clearBallForm, estimatePerfForLoft, exportData, exportClubsCsv, clubCatalogue, CAT_COLS, generateFromSwingSpeed, hcpTrendHtml, importData, logHcpSnapshot, pfDirtyInit, pfDrivesHTML, pfMaybeSave, repMatches, resetData, buildEsCompareToggle, backupSlotPicker, backupToBag, bkToggle, bkSpec, bkSetView, bkTypeOf, miniCell, buildBackups, removeToBackups, swapIntoBag, saveCalibration, saveClub, saveProfile, sel, selectReplacement, syncPartialsForClub, toggleSpecs });
