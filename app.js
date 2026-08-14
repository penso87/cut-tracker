/* ===== Cut Tracker v2 ===== */
'use strict';

const CONFIG = {
  SHEET_ID: '1B4Bn6fFBCCpYor2LNn9iTEIxJoNvhUkN6WxdbQqbNYk',
  SHEET_GID: '1117127011',
  START_WEIGHT: 102.6,
  GOAL_WEIGHT: 90.0,
  // adherence targets
  PROTEIN_TARGET: 150,   // g/day, meet if >=
  CALORIE_TARGET: 1600,  // kcal/day, meet if <=
  STEPS_TARGET: 10000,   // meet if >=
  GREAT_SCORE: 9         // streak threshold
};

const KCAL_PER_KG = 7700;
const DAY_MS = 86400000;

const fallbackDays = [
  {date:'2026-08-04',day:1,weight:null,cal_low:1500,cal_high:1600,protein_low:150,protein_high:150,steps:13953,active:861,activity:'—',def_low:1300,def_high:1300,score:9.0},
  {date:'2026-08-05',day:2,weight:null,cal_low:1500,cal_high:1650,protein_low:175,protein_high:175,steps:13966,active:1652,activity:'Padel 89 min',def_low:2080,def_high:2080,score:10.0},
  {date:'2026-08-06',day:3,weight:null,cal_low:1570,cal_high:1590,protein_low:165,protein_high:165,steps:12461,active:943,activity:'Strength ~50 min',def_low:1360,def_high:1360,score:9.5},
  {date:'2026-08-07',day:4,weight:null,cal_low:1480,cal_high:1520,protein_low:155,protein_high:160,steps:15624,active:1217,activity:'Padel 53 min',def_low:1720,def_high:1720,score:9.0},
  {date:'2026-08-08',day:5,weight:null,cal_low:1505,cal_high:1545,protein_low:142,protein_high:144,steps:12188,active:null,activity:'—',def_low:700,def_high:1000,score:9.0},
  {date:'2026-08-09',day:6,weight:99.3,cal_low:1470,cal_high:1560,protein_low:144,protein_high:150,steps:14806,active:null,activity:'—',def_low:900,def_high:1300,score:9.5},
  {date:'2026-08-10',day:7,weight:null,cal_low:1365,cal_high:1465,protein_low:146,protein_high:154,steps:10163,active:1049,activity:'Bike + Strength',def_low:1550,def_high:1900,score:9.5},
  {date:'2026-08-11',day:8,weight:null,cal_low:1525,cal_high:1765,protein_low:136,protein_high:147,steps:16193,active:994,activity:'135 min activity',def_low:1150,def_high:1650,score:9.0},
  {date:'2026-08-12',day:9,weight:null,cal_low:1460,cal_high:1680,protein_low:154,protein_high:167,steps:9865,active:983,activity:'Padel ~80 min',def_low:1300,def_high:1600,score:9.5},
  {date:'2026-08-13',day:10,weight:null,cal_low:1505,cal_high:1560,protein_low:148,protein_high:153,steps:10815,active:578,activity:'37 min activity',def_low:1100,def_high:1400,score:9.5}
].map(withMids);

function withMids(d){
  d.cal_mid=(d.cal_low+d.cal_high)/2;
  d.protein_mid=(d.protein_low+d.protein_high)/2;
  d.def_mid=(d.def_low+d.def_high)/2;
  return d;
}

let days = loadCache() || fallbackDays.slice();

/* ---------- metric config ---------- */
const heMonths=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const METRICS={
  cal:    {label:'קלוריות', mid:'cal_mid', band:['cal_low','cal_high'], unit:'', ma:true},
  protein:{label:'חלבון',   mid:'protein_mid', band:['protein_low','protein_high'], unit:'g', ma:true},
  steps:  {label:'צעדים',   mid:'steps', band:null, unit:'', ma:true},
  active: {label:'Active Energy', mid:'active', band:null, unit:'', ma:true},
  deficit:{label:'גירעון',  mid:'def_mid', band:['def_low','def_high'], unit:'', ma:true},
  score:  {label:'ציון',    mid:'score', band:null, unit:'', ma:false, fixed:[8.5,10.2]},
  weight: {label:'משקל',    mid:'weight', band:null, unit:' ק״ג', ma:false, weight:true}
};

let metric='cal';
let showMA=false;
let monthCursor='2026-08';
let showAll=false;

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null}
function dateObj(s){const[y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d)}
function fmtDate(s){const dt=dateObj(s);return `${dt.getDate()} ${heMonths[dt.getMonth()]} ${dt.getFullYear()}`}
function fmtShort(s){const dt=dateObj(s);return `${dt.getDate()}/${dt.getMonth()+1}`}
function monthLabel(k){const[y,m]=k.split('-').map(Number);return `${heMonths[m-1]} ${y}`}
function num(v){return Math.round(v).toLocaleString('en-US')}
function rng(a,b,suffix){return `<span dir="ltr">${a}–${b}${suffix||''}</span>`}
function currentDays(){return showAll?days:days.filter(d=>d.date&&d.date.startsWith(monthCursor))}

/* ---------- data load (gviz JSONP) ---------- */
function gvizCell(cell){if(!cell)return '';if(cell.f!=null)return cell.f;if(cell.v==null)return '';return typeof cell.v==='string'?cell.v:String(cell.v)}
function normalizeDate(v){
  const s=String(v||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const dm=s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if(dm)return `${dm[1]}-${String(+dm[2]+1).padStart(2,'0')}-${String(+dm[3]).padStart(2,'0')}`;
  const d=new Date(s);
  if(!isNaN(d))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return s;
}
function rowsFromGviz(resp){
  if(!resp||!resp.table||!resp.table.cols||!resp.table.rows)throw new Error('bad sheet response');
  const headers=resp.table.cols.map(c=>String(c.label||c.id||'').trim());
  return resp.table.rows.map(r=>{const o={};headers.forEach((h,i)=>o[h]=gvizCell((r.c||[])[i]));return o}).filter(o=>o.date);
}
function normalizeRows(raw){
  return raw.map((o,i)=>{
    const cl=n(o.calories_low),ch=n(o.calories_high),pl=n(o.protein_low),ph=n(o.protein_high);
    const dl=n(o.deficit_low),dh=n(o.deficit_high);
    return withMids({
      date:normalizeDate(o.date),
      day:n(o.day)??i+1,
      weight:n(o.weight),
      cal_low:cl??0,cal_high:ch??cl??0,
      protein_low:pl??0,protein_high:ph??pl??0,
      steps:n(o.steps)??0,
      active:n(o.active_energy),
      activity:String(o.activity||'—'),
      def_low:dl??0,def_high:dh??dl??0,
      score:n(o.score)??0
    });
  }).sort((a,b)=>a.date.localeCompare(b.date));
}

function setStatus(ok,text){
  const dot=$('statusDot'),label=$('syncText');
  if(dot)dot.className='statusdot'+(ok===true?' ok':ok===false?' bad':'');
  if(label)label.textContent=text;
  const btn=$('refreshBtn');
  if(btn){if(ok===null){btn.classList.add('spin');btn.disabled=true}else{btn.classList.remove('spin');btn.disabled=false}}
}

function loadSheet(){
  setStatus(null,'מסנכרן…');
  const old=$('gviz-loader'); if(old)old.remove();
  let done=false;
  const timer=setTimeout(()=>{if(done)return;done=true;setStatus(false,'הסנכרון נכשל · מציג נתונים שמורים');renderAll();},8000);

  window.handleSheetResponse=function(resp){
    if(done)return;done=true;clearTimeout(timer);
    try{
      if(resp.status==='error')throw new Error('sheets error');
      const loaded=normalizeRows(rowsFromGviz(resp));
      if(!loaded.length)throw new Error('empty');
      days=loaded; saveCache(days);
      const t=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      setStatus(true,'מסונכרן · '+t);
      const ls=$('lastSync'); if(ls)ls.textContent='עודכן: '+t;
      renderAll();
    }catch(e){console.error(e);setStatus(false,'שגיאת סנכרון · נתונים שמורים');renderAll();}
  };
  const s=document.createElement('script');
  s.id='gviz-loader';s.async=true;
  s.onerror=()=>{if(done)return;done=true;clearTimeout(timer);setStatus(false,'שגיאת גישה · נתונים שמורים');renderAll();};
  s.src=`https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?gid=${CONFIG.SHEET_GID}&tqx=out:json;responseHandler:handleSheetResponse&_=${Date.now()}`;
  document.head.appendChild(s);
}

/* ---------- cache ---------- */
function saveCache(d){try{localStorage.setItem('ct-days',JSON.stringify(d))}catch(e){}}
function loadCache(){try{const s=localStorage.getItem('ct-days');if(!s)return null;const d=JSON.parse(s);return Array.isArray(d)&&d.length?d.map(withMids):null}catch(e){return null}}

/* ---------- analytics ---------- */
function avg(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0}
function withData(sel){return days.map(sel).filter(v=>v!=null&&Number.isFinite(v)&&v>0)}

function weightPoints(){return days.filter(d=>Number.isFinite(d.weight)).sort((a,b)=>a.date.localeCompare(b.date))}

function regression(pts){ // pts:[{x,y}] -> {slope,intercept} least squares
  const nP=pts.length; if(nP<2)return null;
  let sx=0,sy=0,sxx=0,sxy=0;
  pts.forEach(p=>{sx+=p.x;sy+=p.y;sxx+=p.x*p.x;sxy+=p.x*p.y});
  const den=nP*sxx-sx*sx; if(den===0)return null;
  const slope=(nP*sxy-sx*sy)/den;
  return {slope,intercept:(sy-slope*sx)/nP};
}

function analytics(){
  const cals=withData(d=>d.cal_mid), pros=withData(d=>d.protein_mid), steps=withData(d=>d.steps);
  const scores=days.map(d=>d.score).filter(v=>v>0);
  const a={
    avgCal:avg(cals), avgPro:avg(pros), avgSteps:avg(steps), avgScore:avg(scores),
    cumDefLow:days.reduce((s,d)=>s+(d.def_low||0),0),
    cumDefHigh:days.reduce((s,d)=>s+(d.def_high||0),0),
    maxDay:days.length?Math.max(...days.map(d=>d.day||0)):0
  };
  // weight + projection
  const wp=weightPoints();
  a.latestWeight=wp.length?wp[wp.length-1].weight:null;
  a.latestWeightDate=wp.length?wp[wp.length-1].date:null;
  a.delta=a.latestWeight!=null?CONFIG.START_WEIGHT-a.latestWeight:null;
  a.goalProgress=a.latestWeight!=null?Math.min(1,Math.max(0,(CONFIG.START_WEIGHT-a.latestWeight)/(CONFIG.START_WEIGHT-CONFIG.GOAL_WEIGHT))):0;

  const f0=wp.length?dateObj(wp[0].date).getTime():0;
  const pts=wp.map(p=>({x:(dateObj(p.date).getTime()-f0)/DAY_MS,y:p.weight}));
  const reg=regression(pts);
  if(reg&&reg.slope<0){
    a.ratePerWeek=-reg.slope*7;
    const last=wp[wp.length-1];
    const daysToGoal=(last.weight-CONFIG.GOAL_WEIGHT)/(-reg.slope);
    if(daysToGoal>0&&daysToGoal<3650){
      a.etaDate=new Date(dateObj(last.date).getTime()+daysToGoal*DAY_MS);
      a.etaDays=Math.round(daysToGoal);
    }
  }
  // TDEE / maintenance from weight window
  if(wp.length>=2){
    const first=wp[0],last=wp[wp.length-1];
    const lostKg=first.weight-last.weight;
    const spanDays=Math.max(1,(dateObj(last.date)-dateObj(first.date))/DAY_MS);
    const windowCals=days.filter(d=>d.date>=first.date&&d.date<=last.date).map(d=>d.cal_mid).filter(v=>v>0);
    const winIntake=avg(windowCals);
    if(winIntake>0){
      a.maintenance=winIntake+lostKg*KCAL_PER_KG/spanDays;
      a.realDeficit=a.maintenance-a.avgCal;
    }
  }
  // adherence
  const proDays=days.filter(d=>d.protein_mid>0), calDays=days.filter(d=>d.cal_mid>0), stepDays=days.filter(d=>d.steps>0);
  a.adhPro={hit:proDays.filter(d=>d.protein_mid>=CONFIG.PROTEIN_TARGET).length,total:proDays.length};
  a.adhCal={hit:calDays.filter(d=>d.cal_mid<=CONFIG.CALORIE_TARGET).length,total:calDays.length};
  a.adhSteps={hit:stepDays.filter(d=>d.steps>=CONFIG.STEPS_TARGET).length,total:stepDays.length};
  // streak of great scores from most recent
  const sorted=days.slice().sort((x,y)=>x.date.localeCompare(y.date));
  let streak=0;
  for(let i=sorted.length-1;i>=0;i--){if(sorted[i].score>=CONFIG.GREAT_SCORE)streak++;else break;}
  a.streak=streak;
  // trend (last7 vs prev7)
  a.trendCal=trend(d=>d.cal_mid,true);   // lower is better
  a.trendPro=trend(d=>d.protein_mid,false);
  a.trendSteps=trend(d=>d.steps,false);
  a.trendScore=trend(d=>d.score,false);
  return a;
}
function trend(sel,lowerBetter){
  const s=days.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(sel).filter(v=>v!=null&&v>0);
  if(s.length<4)return null;
  const last=s.slice(-7),prev=s.slice(-14,-7);
  if(!prev.length)return null;
  const dv=avg(last)-avg(prev);
  return {delta:dv,good:lowerBetter?dv<0:dv>0};
}

/* ---------- weekly rollup ---------- */
function weeklyRollup(){
  if(!days.length)return [];
  const sorted=days.slice().sort((a,b)=>a.date.localeCompare(b.date));
  const f0=dateObj(sorted[0].date).getTime();
  const buckets={};
  sorted.forEach(d=>{
    const wk=Math.floor((dateObj(d.date).getTime()-f0)/(7*DAY_MS));
    (buckets[wk]=buckets[wk]||[]).push(d);
  });
  return Object.keys(buckets).map(k=>{
    const g=buckets[k];
    const cals=g.map(d=>d.cal_mid).filter(v=>v>0);
    const pros=g.map(d=>d.protein_mid).filter(v=>v>0);
    const steps=g.map(d=>d.steps).filter(v=>v>0);
    const scores=g.map(d=>d.score).filter(v=>v>0);
    const wp=g.filter(d=>Number.isFinite(d.weight));
    let wChange=null;
    if(wp.length>=2)wChange=wp[wp.length-1].weight-wp[0].weight;
    return {
      idx:+k+1,
      range:`<span dir="ltr">${fmtShort(g[0].date)} – ${fmtShort(g[g.length-1].date)}</span>`,
      count:g.length,
      avgCal:avg(cals),avgPro:avg(pros),avgSteps:avg(steps),avgScore:avg(scores),
      cumDef:g.reduce((s,d)=>s+d.def_mid,0),
      wChange
    };
  });
}

/* ---------- rendering ---------- */
let prevVals={};
function animateNumber(el,to,fmt){
  if(!el)return;
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const from=prevVals[el.id]??0; prevVals[el.id]=to;
  if(reduce||from===to){el.textContent=fmt(to);return;}
  const t0=performance.now(),dur=650;
  function step(t){const p=Math.min(1,(t-t0)/dur);const e=1-Math.pow(1-p,3);el.textContent=fmt(from+(to-from)*e);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
function trendHTML(el,tr,unit){
  if(!el)return;
  if(!tr){el.textContent='';el.className='t-trend';return;}
  const rounded=Math.round(tr.delta);
  if(rounded===0){el.className='t-trend';el.textContent='≈ ללא שינוי מהשבוע הקודם';return;}
  const arrow=tr.delta>0?'▲':'▼';
  el.className='t-trend '+(tr.good?'up':'down');
  el.textContent=`${arrow} ${Math.abs(rounded).toLocaleString('en-US')}${unit} מול השבוע הקודם`;
}

function renderHero(a){
  const w=a.latestWeight??CONFIG.START_WEIGHT;
  animateNumber($('heroWeight'),w,v=>v.toFixed(1));
  if(a.delta!=null){
    $('heroChange').innerHTML=`שקילה אחרונה: ${a.latestWeightDate?fmtDate(a.latestWeightDate):'—'} · <span class="good">−${a.delta.toFixed(1)} ק״ג מההתחלה</span>`;
  }else{$('heroChange').textContent='אין עדיין שקילה שנרשמה';}
  $('startLabel').textContent='התחלה '+CONFIG.START_WEIGHT.toFixed(1);
  $('goalLabel').textContent='יעד '+CONFIG.GOAL_WEIGHT.toFixed(1);
  $('goalFill').style.width=(a.goalProgress*100).toFixed(1)+'%';
  $('goalPct').textContent=Math.round(a.goalProgress*100)+'% מהדרך';
  $('rateVal').textContent=a.ratePerWeek?('−'+a.ratePerWeek.toFixed(2)):'—';
  if(a.etaDate){
    $('etaVal').textContent=`${a.etaDate.getDate()} ${heMonths[a.etaDate.getMonth()]}`;
    $('etaSub').textContent=`בעוד ~${a.etaDays} ימים · ${a.etaDate.getFullYear()}`;
  }else{$('etaVal').textContent='—';$('etaSub').textContent='צריך עוד שקילה';}
}

function renderTiles(a){
  animateNumber($('avgCalories'),a.avgCal,num);
  animateNumber($('avgProtein'),a.avgPro,v=>num(v)+'g');
  animateNumber($('avgSteps'),a.avgSteps,num);
  $('cumDeficit').innerHTML=`<span dir="ltr">${(a.cumDefLow/1000).toFixed(1)}–${(a.cumDefHigh/1000).toFixed(1)}K</span>`;
  animateNumber($('avgScore'),a.avgScore,v=>v.toFixed(1));
  trendHTML($('trendCal'),a.trendCal,'');
  trendHTML($('trendProtein'),a.trendPro,'g');
  trendHTML($('trendSteps'),a.trendSteps,'');
  trendHTML($('trendScore'),a.trendScore,'');
}

function renderInsights(a){
  $('tdeeVal').textContent=a.maintenance?num(a.maintenance)+' קק״ל':'—';
  $('tdeeSub').textContent=a.maintenance?'מחושב משינוי משקל וצריכה בפועל':'צריך ≥2 שקילות';
  $('realDeficit').textContent=a.realDeficit?'−'+num(a.realDeficit)+' קק״ל':'—';
  const pct=o=>o.total?Math.round(o.hit/o.total*100)+'%':'—';
  const sub=o=>o.total?`${o.hit}/${o.total} ימים`:'אין נתונים';
  $('adhProtein').textContent=pct(a.adhPro); $('adhProteinSub').textContent=`${sub(a.adhPro)} · ≥${CONFIG.PROTEIN_TARGET}g`;
  $('adhCal').textContent=pct(a.adhCal); $('adhCalSub').textContent=`${sub(a.adhCal)} · ≤${CONFIG.CALORIE_TARGET}`;
  $('adhSteps').textContent=pct(a.adhSteps); $('adhStepsSub').textContent=`${sub(a.adhSteps)} · ≥${num(CONFIG.STEPS_TARGET)}`;
  $('streakVal').textContent=a.streak+(a.streak===1?' יום':' ימים');
}

function renderWeekly(){
  const rows=weeklyRollup();
  $('weeklyBody').innerHTML=rows.map(r=>{
    const chg=r.wChange==null?'—':`<span class="${r.wChange<0?'chg-pos':'chg-neg'}">${r.wChange<0?'−':'+'}${Math.abs(r.wChange).toFixed(1)}</span>`;
    return `<tr><td><b>שבוע ${r.idx}</b><div class="in-s">${r.range}</div></td><td>${r.count}</td>
      <td>${r.avgCal?num(r.avgCal):'—'}</td><td>${r.avgPro?num(r.avgPro)+'g':'—'}</td>
      <td>${r.avgSteps?num(r.avgSteps):'—'}</td><td>${num(r.cumDef)}</td><td>${chg}</td><td>${r.avgScore?r.avgScore.toFixed(1):'—'}</td></tr>`;
  }).join('');
}

function renderTable(){
  const data=currentDays();
  $('daysTableBody').innerHTML=data.map(d=>`<tr>
    <td><b>${fmtDate(d.date)}</b></td><td>${d.day}</td>
    <td>${rng(num(d.cal_low),num(d.cal_high))}</td>
    <td>${rng(Math.round(d.protein_low),Math.round(d.protein_high),'g')}</td>
    <td>${num(d.steps)}</td><td><span class="pill" dir="auto">${d.activity}</span></td>
    <td>${d.active==null?'—':num(d.active)}</td>
    <td>${rng(num(d.def_low),num(d.def_high))}</td>
    <td>${d.score.toFixed(1)}/10</td></tr>`).join('');
}

function updateBadges(a){
  $('monthTitle').textContent=showAll?'כל התקופה':monthLabel(monthCursor);
}

/* ---------- chart ---------- */
const canvas=$('chart'),ctx=canvas.getContext('2d'),tooltip=$('tooltip');
let plot=null; // geometry for hover
let hoverIdx=-1;

function movingAvg(vals,win){
  return vals.map((_,i)=>{
    const seg=[];for(let j=Math.max(0,i-win+1);j<=i;j++){if(vals[j]!=null&&Number.isFinite(vals[j]))seg.push(vals[j]);}
    return seg.length?seg.reduce((a,b)=>a+b,0)/seg.length:null;
  });
}
function cssvar(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}

function resize(){const r=canvas.getBoundingClientRect(),q=window.devicePixelRatio||1;canvas.width=r.width*q;canvas.height=r.height*q;ctx.setTransform(q,0,0,q,0,0);draw();}

function draw(){
  const data=currentDays(),w=canvas.clientWidth,h=canvas.clientHeight,p={l:52,r:18,t:24,b:44};
  ctx.clearRect(0,0,w,h);plot=null;
  const M=METRICS[metric];
  const accent=cssvar('--accent')||'#2563eb';
  const gridc=cssvar('--grid')||'#e6ecf6';
  const muted=cssvar('--muted')||'#64748b';
  const bandc=cssvar('--band')||'rgba(37,99,235,.12)';
  const panel=cssvar('--panel')||'#fff';

  if(!data.length){ctx.fillStyle=muted;ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('אין נתונים בתקופה הזו',w/2,h/2);return}

  // series
  const mid=data.map(d=>d[M.mid]);
  const lo=M.band?data.map(d=>d[M.band[0]]):null;
  const hi=M.band?data.map(d=>d[M.band[1]]):null;
  let pool=mid.filter(v=>v!=null&&Number.isFinite(v));
  if(M.band){pool=pool.concat(lo.filter(Number.isFinite),hi.filter(Number.isFinite));}
  if(M.weight)pool=pool.concat([CONFIG.GOAL_WEIGHT,CONFIG.START_WEIGHT]);
  if(!pool.length){ctx.fillStyle=muted;ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('אין נתונים למדד הזה בתקופה',w/2,h/2);return}

  let mn=Math.min(...pool),mx=Math.max(...pool);
  if(M.fixed){mn=M.fixed[0];mx=M.fixed[1];}
  else{const sp=Math.max(1,mx-mn);mn=Math.max(0,mn-sp*.15);mx+=sp*.15;}
  const count=data.length;
  const X=i=>count===1?(p.l+(w-p.l-p.r)/2):p.l+i*((w-p.l-p.r)/(count-1));
  const Y=v=>p.t+(mx-v)*(h-p.t-p.b)/(mx-mn);
  plot={data,X,Y,p,w,h,metric,mid,lo,hi};

  // grid + y labels
  ctx.strokeStyle=gridc;ctx.lineWidth=1;ctx.fillStyle=muted;ctx.font='11px system-ui';ctx.textAlign='right';
  for(let i=0;i<5;i++){const yy=p.t+i*(h-p.t-p.b)/4;ctx.beginPath();ctx.moveTo(p.l,yy);ctx.lineTo(w-p.r,yy);ctx.stroke();
    const val=mx-i*(mx-mn)/4;ctx.fillText(metric==='steps'?num(val):(metric==='weight'?val.toFixed(1):(metric==='score'?val.toFixed(1):num(val))),p.l-8,yy+4);}
  // x labels (thin out)
  ctx.textAlign='center';const stepX=Math.ceil(count/12);
  data.forEach((d,i)=>{if(i%stepX===0||i===count-1)ctx.fillText(fmtShort(d.date),X(i),h-16);});

  // band fill
  if(M.band){
    ctx.beginPath();let started=false;
    for(let i=0;i<count;i++){if(!Number.isFinite(hi[i]))continue;if(!started){ctx.moveTo(X(i),Y(hi[i]));started=true}else ctx.lineTo(X(i),Y(hi[i]));}
    for(let i=count-1;i>=0;i--){if(!Number.isFinite(lo[i]))continue;ctx.lineTo(X(i),Y(lo[i]));}
    ctx.closePath();ctx.fillStyle=bandc;ctx.fill();
  }

  // weight: goal line + start marker + regression
  if(M.weight){
    ctx.setLineDash([6,6]);ctx.strokeStyle=cssvar('--green')||'#16a34a';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(p.l,Y(CONFIG.GOAL_WEIGHT));ctx.lineTo(w-p.r,Y(CONFIG.GOAL_WEIGHT));ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle=cssvar('--green')||'#16a34a';ctx.textAlign='left';ctx.font='11px system-ui';
    ctx.fillText('יעד '+CONFIG.GOAL_WEIGHT.toFixed(0),p.l+4,Y(CONFIG.GOAL_WEIGHT)-5);
    // regression trend across full weight span
    const wp=weightPoints();
    if(wp.length>=2){
      const idxByDate={};data.forEach((d,i)=>idxByDate[d.date]=i);
      const inRange=wp.filter(p2=>p2.date in idxByDate);
      if(inRange.length>=2){
        const f0=dateObj(inRange[0].date).getTime();
        const reg=regression(inRange.map(p2=>({x:(dateObj(p2.date).getTime()-f0)/DAY_MS,y:p2.weight})));
        if(reg){
          const xs=inRange[0].date,xe=inRange[inRange.length-1].date;
          const i0=idxByDate[xs],i1=idxByDate[xe];
          const y0=reg.intercept,y1=reg.intercept+reg.slope*((dateObj(xe)-dateObj(xs))/DAY_MS);
          ctx.setLineDash([4,4]);ctx.strokeStyle=muted;ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(X(i0),Y(y0));ctx.lineTo(X(i1),Y(y1));ctx.stroke();ctx.setLineDash([]);
        }
      }
    }
  }

  // main line
  ctx.beginPath();let st=false;
  mid.forEach((v,i)=>{if(v==null||!Number.isFinite(v)||(M.weight&&v<=0))return;if(!st){ctx.moveTo(X(i),Y(v));st=true}else ctx.lineTo(X(i),Y(v));});
  ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();

  // moving average overlay
  if(showMA&&M.ma){
    const ma=movingAvg(mid.map(v=>Number.isFinite(v)?v:null),7);
    ctx.beginPath();let s2=false;
    ma.forEach((v,i)=>{if(v==null)return;if(!s2){ctx.moveTo(X(i),Y(v));s2=true}else ctx.lineTo(X(i),Y(v));});
    ctx.strokeStyle=cssvar('--amber')||'#d97706';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
  }

  // points
  mid.forEach((v,i)=>{if(v==null||!Number.isFinite(v)||(M.weight&&v<=0))return;
    ctx.beginPath();ctx.arc(X(i),Y(v),i===hoverIdx?6:4,0,Math.PI*2);
    ctx.fillStyle=panel;ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();});

  // hover crosshair
  if(hoverIdx>=0&&hoverIdx<count&&Number.isFinite(mid[hoverIdx])){
    ctx.strokeStyle=gridc;ctx.lineWidth=1;ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.moveTo(X(hoverIdx),p.t);ctx.lineTo(X(hoverIdx),h-p.b);ctx.stroke();ctx.setLineDash([]);
  }

  // metric label
  ctx.fillStyle=cssvar('--text')||'#0f1c33';ctx.textAlign='left';ctx.font='700 13px system-ui';
  ctx.fillText(M.label+(showMA&&M.ma?' · +ממוצע נע':''),p.l,15);
}

/* hover */
function onMove(clientX,clientY){
  if(!plot)return;
  const rect=canvas.getBoundingClientRect();
  const x=clientX-rect.left;
  const {data,X,p,w}=plot;
  if(x<p.l-10||x>w-p.r+10){hideTip();return;}
  let best=-1,bd=1e9;
  data.forEach((d,i)=>{const dx=Math.abs(X(i)-x);if(dx<bd){bd=dx;best=i;}});
  if(best<0){hideTip();return;}
  hoverIdx=best;draw();showTip(best,clientX-rect.left,clientY-rect.top);
}
function showTip(i,px,py){
  const d=currentDays()[i];if(!d){hideTip();return;}
  const M=METRICS[metric];
  let body='';
  if(M.band){
    body=`<div class="tt-row"><span class="tt-dim">טווח</span><span>${rng(num(d[M.band[0]]),num(d[M.band[1]]),M.unit)}</span></div>
          <div class="tt-row"><span class="tt-dim">אמצע</span><span>${num(d[M.mid])}${M.unit}</span></div>`;
  }else if(M.weight){
    body=`<div class="tt-row"><span class="tt-dim">משקל</span><span>${d.weight!=null?d.weight.toFixed(1)+M.unit:'—'}</span></div>`;
  }else{
    const v=d[M.mid];
    body=`<div class="tt-row"><span class="tt-dim">${M.label}</span><span>${v==null?'—':(metric==='score'?v.toFixed(1):num(v))}${M.unit}</span></div>`;
  }
  tooltip.innerHTML=`<div class="tt-date">${fmtDate(d.date)} · יום ${d.day}</div>${body}`;
  tooltip.classList.add('show');
  const tw=tooltip.offsetWidth,th=tooltip.offsetHeight;
  let left=px-tw/2;left=Math.max(4,Math.min(canvas.clientWidth-tw-4,left));
  let top=py-th-14;if(top<0)top=py+16;
  tooltip.style.left=left+'px';tooltip.style.top=top+'px';
}
function hideTip(){tooltip.classList.remove('show');if(hoverIdx!==-1){hoverIdx=-1;draw();}}

canvas.addEventListener('mousemove',e=>onMove(e.clientX,e.clientY));
canvas.addEventListener('mouseleave',hideTip);
canvas.addEventListener('touchstart',e=>{if(e.touches[0])onMove(e.touches[0].clientX,e.touches[0].clientY)},{passive:true});
canvas.addEventListener('touchmove',e=>{if(e.touches[0])onMove(e.touches[0].clientX,e.touches[0].clientY)},{passive:true});

/* ---------- render orchestration ---------- */
function renderAll(){
  const a=analytics();
  renderHero(a);renderTiles(a);renderInsights(a);renderWeekly();
  updateBadges(a);renderTable();resize();
}

/* ---------- controls ---------- */
document.querySelectorAll('.chip[data-metric]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.chip[data-metric]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');metric=b.dataset.metric;hoverIdx=-1;hideTip();draw();
});
$('maToggle').onchange=e=>{showMA=e.target.checked;draw();};
$('prevMonth').onclick=()=>shiftMonth(-1);
$('nextMonth').onclick=()=>shiftMonth(1);
$('allMonths').onclick=()=>{showAll=true;updateBadges();renderTable();draw();};
$('refreshBtn').onclick=()=>loadSheet();
function shiftMonth(delta){const[y,m]=monthCursor.split('-').map(Number);const dt=new Date(y,m-1+delta,1);monthCursor=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;showAll=false;updateBadges();renderTable();draw();}
window.addEventListener('resize',resize);

/* ---------- theme ---------- */
function applyTheme(t){
  if(t)document.documentElement.setAttribute('data-theme',t);
  else document.documentElement.removeAttribute('data-theme');
  const dark = t==='dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  $('themeIco').textContent = dark?'☀':'☾';
  requestAnimationFrame(draw);
}
$('themeBtn').onclick=()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  const sysDark=matchMedia('(prefers-color-scheme: dark)').matches;
  const next = cur==='dark'?'light':cur==='light'?'dark':(sysDark?'light':'dark');
  localStorage.setItem('ct-theme',next);applyTheme(next);
};
applyTheme(localStorage.getItem('ct-theme'));

/* ---------- PWA ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* ---------- boot ---------- */
renderAll();
loadSheet();
setInterval(loadSheet,5*60*1000);
