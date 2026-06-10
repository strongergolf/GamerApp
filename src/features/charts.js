// SG diamond chart, setPath helper, savePhysical.

/* ============================================================
   SG DIAMOND — 4-axis spider chart (OTT / APP / ATG / PUTT)
   ============================================================ */
function buildSGDiamond(){
  const rs=STATE.scoring.rounds.filter(r=>r.ott!=null||r.app!=null||r.atg!=null||r.putt!=null);
  const avg=cat=>{const vals=rs.map(r=>r[cat]).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;};
  const W=260,cx=W/2,cy=W/2,R=90;
  /* 4 axes at 45° steps: OTT top-right, APP bottom-right, ATG bottom-left, PUTT top-left */
  const axes=[
    {cat:'ott', label:'Off Tee', color:'#1a5aaa', angle:-45},
    {cat:'app', label:'Approach', color:'#00853F', angle:45},
    {cat:'atg', label:'Around Green', color:'#d96070', angle:135},
    {cat:'putt',label:'Putting',  color:'#6b7280', angle:225},
  ];
  /* SG range: −3 to +2; map to 0–R radius */
  const sgToR=v=>Math.min(R,Math.max(4,((v+3)/5)*R));
  const toXY=(angle,r)=>{
    const rad=angle*Math.PI/180;
    return [cx+r*Math.cos(rad), cy+r*Math.sin(rad)];
  };
  /* Grid rings at −2, −1, 0, +1, +2 */
  const gridVals=[-2,-1,0,1,2];
  const gridRings=gridVals.map(v=>{
    const r=sgToR(v);
    const pts=axes.map(a=>{const [x,y]=toXY(a.angle,r);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');
    const isZero=v===0;
    return `<polygon points="${pts}" fill="none" stroke="${isZero?'var(--border2)':'var(--border)'}" stroke-width="${isZero?'1.2':'0.6'}" opacity="${isZero?'0.8':'0.5'}"/>`;
  }).join('');
  /* Axis lines */
  const axisLines=axes.map(a=>{
    const [x,y]=toXY(a.angle,R+16);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.7" opacity="0.5"/>`;
  }).join('');
  /* Data polygon */
  const hasData=axes.some(a=>avg(a.cat)!=null);
  let dataPolygon='', dots='';
  if(hasData){
    const pts=axes.map(a=>{
      const v=avg(a.cat);
      const r=v!=null?sgToR(v):sgToR(-3);
      const [x,y]=toXY(a.angle,r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    dataPolygon=`<polygon points="${pts}" fill="rgba(196,66,122,.12)" stroke="var(--gold2)" stroke-width="1.8"/>`;
    dots=axes.map(a=>{
      const v=avg(a.cat);
      if(v==null) return '';
      const r=sgToR(v);
      const [x,y]=toXY(a.angle,r);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${a.color}" stroke="#fff" stroke-width="1.2"/>
        <text x="${x.toFixed(1)}" y="${(y-8).toFixed(1)}" text-anchor="middle" font-family="'Arial Narrow',Arial,sans-serif" font-size="8.5" font-weight="800" fill="${a.color}">${v>=0?'+':''}${v.toFixed(2)}</text>`;
    }).join('');
  }
  /* Labels */
  const labels=axes.map(a=>{
    const [x,y]=toXY(a.angle,R+22);
    const anchor=a.angle>90&&a.angle<270?'end':a.angle===90||a.angle===270?'middle':'start';
    return `<text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="8" fill="${a.color}" font-weight="600">${a.label}</text>`;
  }).join('');
  /* Grid value labels on the OTT axis */
  const gridLabels=gridVals.map(v=>{
    const r=sgToR(v);
    const [x,y]=toXY(-45,r);
    return `<text x="${(x+4).toFixed(1)}" y="${(y-3).toFixed(1)}" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="6" fill="var(--muted)" opacity="0.7">${v>=0?'+':''}${v}</text>`;
  }).join('');
  const placeholder=!hasData?`<text x="${cx}" y="${cy+4}" text-anchor="middle" font-family="ui-monospace,'SF Mono','Courier New',monospace" font-size="9" fill="var(--muted)" opacity="0.6">Log rounds with SG data to populate</text>`:'';
  return `<svg viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" class="sg-diamond-svg" xmlns="http://www.w3.org/2000/svg">
    ${gridRings}${axisLines}${gridLabels}${dataPolygon}${dots}${labels}${placeholder}
  </svg>`;
}

/* setPath helper for nested swing data */
function setPath(obj,path,val){
  const keys=path.split('.');
  let cur=obj;
  for(let i=0;i<keys.length-1;i++){
    if(cur[keys[i]]==null) cur[keys[i]]={};
    cur=cur[keys[i]];
  }
  cur[keys[keys.length-1]]=val;
}

function savePhysical(){
  const pf=STATE.profile;
  pf.handedness=document.getElementById('pf-hand')?.value||pf.handedness;
  pf.ageRange=document.getElementById('pf-age')?.value||pf.ageRange;
  pf.heightFt=document.getElementById('pf-htft')?.value||pf.heightFt;
  pf.heightIn=document.getElementById('pf-htin')?.value||pf.heightIn;
  pf.armToFloor=document.getElementById('pf-atf')?.value||pf.armToFloor;
  pf.gloveSize=document.getElementById('pf-glove')?.value||pf.gloveSize;
  saveState(); refreshAll(); toast('Physical profile saved');
}



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { buildSGDiamond, savePhysical, setPath });
