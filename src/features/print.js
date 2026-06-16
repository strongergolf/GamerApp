// Printable reference cards for the three distance matrices — StrongerGolf-branded,
// styled to print cleanly on cardstock for the scorecard holder. First pass; the exact
// two-sided card layout will follow Mark's pasted format.

/* Full-swing stock shots, built from the bag (longest first). */
function stockShotsPrintTable(){
  const clubs=(STATE.clubs||[]).filter(c=>c.type!=='putter')
    .slice().sort((a,b)=>((perf(b.id).total||perf(b.id).carry||0)-(perf(a.id).total||perf(a.id).carry||0)));
  const colOf=t=> t==='wood'?'#d96070':t==='iron'?'#1a5aaa':t==='wedge'?'#00853F':'#6b7280';
  const rows=clubs.map(c=>{
    const p=perf(c.id), carry=p.carry||0, total=p.total||0;
    const disp = carry>0 ? (Math.round(getDispersion(carry)*10)/10) : '';
    return `<tr><td style="font-weight:800;color:${colOf(c.type)}">${c.label}</td>`
      +`<td>${c.loft||''}</td><td>${carry||'—'}</td><td>${total||'—'}</td><td>${disp||'—'}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Club</th><th>Loft</th><th>Carry</th><th>Total</th><th>&plusmn;L/R</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function printDocHTML(title, tableHtml){
  const css=`
    :root{--c-wood:#d96070;--c-iron:#1a5aaa;--c-wedge:#00853F;--c-putter:#6b7280;--ink:#0C2340;--ink2:#1a3a5c;--muted:#3a5a7a;--bg2:#eef2f7;--border:#c0cedd;--green:#00853F;--gold2:#e07080}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#0C2340;margin:22px}
    .pr-head{text-align:center;border-bottom:3px solid #00853F;padding-bottom:9px;margin-bottom:13px}
    .pr-arc{display:block;margin:0 auto 1px;width:150px;height:18px}
    .pr-mark{font-family:'Arial Narrow',Arial,sans-serif;font-size:1.9rem;font-weight:800;letter-spacing:.02em}
    .pr-mark .s{color:#00853F}.pr-mark .g{color:#d96070}
    .pr-title{font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#0C2340;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    th{background:#0C2340;color:#fff;padding:7px 8px;text-align:center;border:1px solid #0C2340;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase}
    td{padding:6px 8px;text-align:center;border:1px solid #c0cedd}
    th:first-child,td:first-child{text-align:left}
    tr:nth-child(even) td{background:#f0f4f8}
    .carry-cell,.chip-cell{font-weight:700}
    .carry-cell small,.chip-cell small{display:block;font-size:9px;color:#3a5a7a;font-weight:400}
    .pr-foot{margin-top:11px;font-size:10px;color:#3a5a7a;text-align:center;letter-spacing:.05em}
    @page{margin:13mm}@media print{body{margin:0}}`;
  const arc=`<svg class="pr-arc" viewBox="0 0 220 30" xmlns="http://www.w3.org/2000/svg"><path d="M 8,26 C 151,16 166,-6 212,26" fill="none" stroke="#F4C2C2" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const date=new Date().toLocaleDateString();
  return `<!doctype html><html><head><meta charset="utf-8"><title>StrongerGolf — ${title}</title><style>${css}</style></head>`
    +`<body><div class="pr-head">${arc}<div class="pr-mark"><span class="s">Stronger</span><span class="g">Golf</span></div>`
    +`<div class="pr-title">${title}</div></div>${tableHtml}`
    +`<div class="pr-foot">Gamer&rsquo;s App &middot; on-course reference card &middot; ${date}</div></body></html>`;
}

function printMatrix(type){
  const map={
    bag:     { title:'Full-Swing Stock Shots',     html:stockShotsPrintTable },
    approach:{ title:'Approach &mdash; Partial Shots', html:()=>{const t=document.getElementById('partials-table');return t?'<table class="partials">'+t.innerHTML+'</table>':'';} },
    chip:    { title:'Short Game &mdash; Chip Reference', html:()=>{const t=document.getElementById('chip-matrix-table');return t?'<table class="chip-matrix">'+t.innerHTML+'</table>':'';} }
  };
  const d=map[type]; if(!d) return;
  const w=window.open('','_blank');
  if(!w){ if(typeof toast==='function') toast('Allow pop-ups to print this card'); return; }
  w.document.open(); w.document.write(printDocHTML(d.title, d.html())); w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 350);
}

Object.assign(window, { printMatrix, stockShotsPrintTable, printDocHTML });
