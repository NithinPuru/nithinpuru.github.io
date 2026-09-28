/* FX Quant Terminal
 * Data: fx_data.json, built server-side by fx-quant/update_fx.py (ECB euro
 * reference rates via Frankfurter) on a schedule - the page never calls a
 * third-party API. Models (ARIMA, Holt-Winters, Monte Carlo GBM, indicators,
 * risk, seasonality) are unchanged from the original FX_QUANT terminal. */
'use strict';

const PAIRS = [
  { id:'EURINR', label:'EUR/INR', base:'EUR' }, { id:'USDINR', label:'USD/INR', base:'USD' },
  { id:'GBPINR', label:'GBP/INR', base:'GBP' }, { id:'JPYINR', label:'JPY/INR', base:'JPY' },
  { id:'CNYINR', label:'CNY/INR', base:'CNY' }, { id:'SGDINR', label:'SGD/INR', base:'SGD' },
  { id:'HKDINR', label:'HKD/INR', base:'HKD' },
];
const HORIZONS = [
  { id:'1W', label:'1W', td:5,  hd:10 }, { id:'2W', label:'2W', td:10, hd:20 },
  { id:'1M', label:'1M', td:22, hd:44 }, { id:'2M', label:'2M', td:44, hd:88 },
  { id:'3M', label:'3M', td:66, hd:132 },
];
const S = { pair:'EURINR', horizon:'1W', dir:'INR_TO_FX', data:null, cache:{}, charts:{}, seas:'dow', last:null };

// ── data ────────────────────────────────────────────────────────────────
function series(id){
  if (S.cache[id]) return S.cache[id];
  const p = S.data.pairs[id];
  const dates = p.dates.map(d => new Date(d + 'T12:00:00Z'));
  const closes = p.rates.slice();
  // ECB publishes one reference rate per day: high = low = close.
  return (S.cache[id] = { dates, closes, highs: closes, lows: closes, name: p.name });
}

// ── ARIMA(2,1,0) ──
function arima(closes, h) {
  if (closes.length < 20) return fills(closes[closes.length-1], h);
  const lp   = closes.map(Math.log);
  const diff = lp.slice(1).map((v,i)=>v-lp[i]);
  const mu   = mean(diff);
  const cd   = diff.map(d=>d-mu);
  const n    = cd.length;
  let r0=0,r1=0,r2=0;
  for(let i=0;i<n;i++) r0+=cd[i]**2;
  for(let i=1;i<n;i++) r1+=cd[i]*cd[i-1];
  for(let i=2;i<n;i++) r2+=cd[i]*cd[i-2];
  r0/=n; r1/=(n-1); r2/=(n-2);
  const det = r0*r0-r1*r1;
  let phi1=0.1,phi2=0.05;
  if(Math.abs(det)>1e-14){ phi1=(r0*r1-r1*r2)/det; phi2=(r0*r2-r1*r1)/det; }
  const mag=Math.abs(phi1)+Math.abs(phi2);
  if(mag>0.97){phi1*=0.97/mag;phi2*=0.97/mag;}
  const ext=[...cd]; let cur=lp[lp.length-1];
  const out=[];
  for(let i=0;i<h;i++){
    const nd=ext.length, d=phi1*ext[nd-1]+phi2*ext[nd-2]+mu;
    ext.push(d); cur+=d; out.push(Math.exp(cur));
  }
  return out;
}

// ── HOLT-WINTERS ADDITIVE ──
function hw(closes, h) {
  if (closes.length < 20) return fills(closes[closes.length-1], h);
  const m = h<=10 ? 5 : 22;
  if (closes.length < 2*m) return arima(closes, h);
  const a=0.35,b=0.08,g=0.12;
  let L=mean(closes.slice(0,m));
  let T=(mean(closes.slice(m,2*m))-L)/m;
  const seas=closes.slice(0,m).map(c=>c-L);
  for(let i=m;i<closes.length;i++){
    const y=closes[i],pL=L,pT=T,si=i%m;
    L=a*(y-seas[si])+(1-a)*(pL+pT);
    T=b*(L-pL)+(1-b)*pT;
    seas[si]=g*(y-L)+(1-g)*seas[si];
  }
  const n=closes.length, out=[];
  for(let s=1;s<=h;s++) out.push(Math.max(L+s*T+seas[(n+s-1)%m],0.0001));
  return out;
}

// ── MONTE CARLO GBM ──
function mc(closes, h, np=5000) {
  if (closes.length < 10) { const c=closes[closes.length-1]; return {p5:fills(c,h),p50:fills(c,h),p95:fills(c,h)}; }
  const lr=logReturns(closes);
  const mu=mean(lr), sig=std(lr);
  const drift=mu-0.5*sig*sig;
  const S0=closes[closes.length-1];
  // Seeded PRNG (mulberry32): the same pair and data give the same paths, so the
  // forecast and 'best date' only change when the inputs do.
  let seed = S.seed >>> 0;
  const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function rn(){let u,v,s;do{u=rand()*2-1;v=rand()*2-1;s=u*u+v*v;}while(s>=1||s===0);return u*Math.sqrt(-2*Math.log(s)/s);}
  const byDay=Array.from({length:h},()=>[]);
  for(let p=0;p<np;p++){let S=S0;for(let d=0;d<h;d++){S*=Math.exp(drift+sig*rn());byDay[d].push(S);}}
  const p5=[],p50=[],p95=[];
  for(let d=0;d<h;d++){
    const s=byDay[d].slice().sort((a,b)=>a-b);
    p5.push(s[Math.floor(.05*np)]); p50.push(s[Math.floor(.5*np)]); p95.push(s[Math.floor(.95*np)]);
  }
  return {p5,p50,p95};
}

function ensemble(a,h,m){return a.map((v,i)=>0.35*v+0.35*h[i]+0.30*m[i]);}

// ── TECH INDICATORS ──
function rsi(c,p=14){
  if(c.length<p+1) return 50;
  let g=0,l=0;
  for(let i=c.length-p;i<c.length;i++){const d=c[i]-c[i-1];d>0?g+=d:l+=Math.abs(d);}
  return 100-100/(1+g/(l||1e-9));
}
function emaArr(a,p){const k=2/(p+1);let e=a[0];return a.map((v,i)=>i===0?e:e=v*k+e*(1-k));}
function macd(c){
  if(c.length<27) return {hist:0,macd:0,sig:0};
  const f=emaArr(c,12),s=emaArr(c,26),raw=f.map((v,i)=>v-s[i]);
  const sig=emaArr(raw.slice(26),9); const n=raw.length-1,sn=sig.length-1;
  return {hist:raw[n]-sig[sn],macd:raw[n],sig:sig[sn]};
}
function bolPctB(c,p=20){
  if(c.length<p) return 0.5;
  const sl=c.slice(-p),m=mean(sl),s=std(sl);
  return s<1e-9?0.5:(c[c.length-1]-(m-2*s))/(4*s);
}
function stoch(c,hi,lo,p=14){
  if(c.length<p) return 50;
  const hh=Math.max(...hi.slice(-p)),ll=Math.min(...lo.slice(-p));
  return hh===ll?50:((c[c.length-1]-ll)/(hh-ll))*100;
}
function willR(c,hi,lo,p=14){
  if(c.length<p) return -50;
  const hh=Math.max(...hi.slice(-p)),ll=Math.min(...lo.slice(-p));
  return hh===ll?-50:((hh-c[c.length-1])/(hh-ll))*-100;
}
function atr(c,hi,lo,p=14){
  if(c.length<p+1) return 0;
  const trs=[];
  for(let i=1;i<c.length;i++) trs.push(Math.max(hi[i]-lo[i],Math.abs(hi[i]-c[i-1]),Math.abs(lo[i]-c[i-1])));
  return mean(trs.slice(-p));
}
function cci(c,hi,lo,p=20){
  if(c.length<p) return 0;
  const tp=c.map((v,i)=>(hi[i]+lo[i]+v)/3),sl=tp.slice(-p),m=mean(sl);
  const mad=sl.reduce((a,b)=>a+Math.abs(b-m),0)/p;
  return mad<1e-9?0:(tp[tp.length-1]-m)/(0.015*mad);
}
function zscore(c,p=20){
  if(c.length<p) return 0;
  const sl=c.slice(-p),m=mean(sl),s=std(sl);
  return s<1e-9?0:(c[c.length-1]-m)/s;
}
function composite(r,mh,b,st,wr,_a,cc,z,c){
  const inv=S.dir==='FX_TO_INR';
  const f=inv?v=>100-v:v=>v;
  const rsiS=f(r);
  const macdS=mh>0?f(70):f(30);
  const bbS=f((1-b)*100);
  const stS=f(100-st);
  const wS=f((-wr/100)*100);
  const cS=cc<-100?f(80):cc>100?f(20):50;
  const zS=z<-1.5?f(80):z>1.5?f(20):50;
  const n=c.length;
  const roc=n>=6?((c[n-1]/c[n-6])-1)*100:0;
  const rocS=roc<0?f(70):f(30);
  return Math.round(.2*rsiS+.15*macdS+.12*bbS+.12*stS+.10*wS+.10*cS+.10*zS+.11*rocS);
}

// ── RISK ──
function riskMetrics(c){
  if(c.length<10) return {v95:0,v99:0,cv95:0,mdd:0,dca5:0,dca10:0,avol:0};
  const lr=logReturns(c).map(r=>Math.exp(r)-1);
  const s=[...lr].sort((a,b)=>a-b),n=s.length;
  const v95=-s[Math.floor(.05*n)],v99=-s[Math.floor(.01*n)];
  const tail=s.slice(0,Math.floor(.05*n));
  const cv95=tail.length?-mean(tail):v95;
  let peak=c[0],mdd=0;
  for(const v of c){if(v>peak)peak=v;const d=(peak-v)/peak;if(d>mdd)mdd=d;}
  const dca5=mean(c.slice(-5)),dca10=mean(c.slice(-10));
  const lrR=logReturns(c.slice(-20)),mR=mean(lrR),vR=lrR.reduce((a,b)=>a+(b-mR)**2,0)/lrR.length;
  const avol=Math.sqrt(vR*252)*100;
  return {v95:v95*100,v99:v99*100,cv95:cv95*100,mdd:mdd*100,dca5,dca10,avol};
}

// ── STATISTICS ──
function hurst(c){
  if(c.length<20) return 0.5;
  const lr=logReturns(c),n=lr.length,mu=mean(lr),dev=lr.map(r=>r-mu);
  let cum=0;const cd=dev.map(d=>(cum+=d));
  const R=Math.max(...cd)-Math.min(...cd),S2=std(lr);
  return S2<1e-12?0.5:Math.log(R/S2)/Math.log(n);
}
function skewness(c){
  const lr=logReturns(c),m=mean(lr),s=std(lr);
  return s<1e-12?0:lr.reduce((a,b)=>a+((b-m)/s)**3,0)/lr.length;
}
function kurtosis(c){
  const lr=logReturns(c),m=mean(lr),s=std(lr);
  return s<1e-12?0:lr.reduce((a,b)=>a+((b-m)/s)**4,0)/lr.length-3;
}
function rollVol(c,w){
  if(c.length<w+1) return 0;
  const lr=logReturns(c.slice(-w-1)),m=mean(lr),v=lr.reduce((a,b)=>a+(b-m)**2,0)/lr.length;
  return Math.sqrt(v*252)*100;
}

// ── SEASONALITY ──
function seasonality(dates,c){
  const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const ds=Array(7).fill(0),dc=Array(7).fill(0),ms=Array(12).fill(0),mc2=Array(12).fill(0);
  for(let i=1;i<c.length;i++){
    const r=c[i]/c[i-1]-1,dw=dates[i].getDay(),mo=dates[i].getMonth();
    ds[dw]+=r;dc[dw]++;ms[mo]+=r;mc2[mo]++;
  }
  const td=[1,2,3,4,5];
  return {
    dowL:td.map(i=>DOW[i]),dowV:td.map(i=>dc[i]?ds[i]/dc[i]*100:0),
    monL:MON,monV:ms.map((v,i)=>mc2[i]?v/mc2[i]*100:0),
  };
}

// ── BEST DATE ──
function bestDate(ens,fDates){
  let bi=0;
  for(let i=1;i<ens.length;i++){
    const better=S.dir==='INR_TO_FX'?ens[i]<ens[bi]:ens[i]>ens[bi];
    if(better)bi=i;
  }
  return {date:fDates[bi],idx:bi,rate:ens[bi]};
}

function futureDays(n){
  const out=[],d=new Date();d.setDate(d.getDate()+1);
  while(out.length<n){if(d.getDay()!==0&&d.getDay()!==6)out.push(new Date(d));d.setDate(d.getDate()+1);}
  return out;
}

// ── MATH UTILS ──
function mean(a){return a.reduce((s,v)=>s+v,0)/a.length;}
function std(a){const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);}
function logReturns(c){return c.slice(1).map((v,i)=>Math.log(v/c[i]));}
function fills(v,n){return Array(n).fill(v);}
function applyDir(arr){return S.dir==='FX_TO_INR'?arr.map(v=>1/v):arr;}


// ── theme-aware colours ─────────────────────────────────────────────────
function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function rgba(v, a){ return `rgba(${css(v)}, ${a})`; }
function palette(){
  return { ink:css('--ink'), ink2:css('--ink-2'), ink3:css('--ink-3'), rule:css('--rule'), card:css('--card'),
           accent:css('--accent'), up:css('--up'), down:css('--down'), warn:css('--warn'), violet:css('--violet'),
           tipBg:css('--tooltip-bg'), tipInk:css('--tooltip-ink'), mono:css('--mono'), serif:css('--serif') };
}
function baseOpts(c){
  return {
    responsive:true, maintainAspectRatio:false, animation:{duration:450},
    interaction:{ mode:'index', intersect:false },
    plugins:{ legend:{display:false}, tooltip:{
      backgroundColor:c.tipBg, titleColor:c.tipInk, bodyColor:c.tipInk, borderWidth:0, padding:11, cornerRadius:7,
      titleFont:{family:c.mono,size:11}, bodyFont:{family:c.mono,size:12}, usePointStyle:true, boxWidth:8, boxHeight:8,
      filter: i => i.raw !== null && i.raw !== undefined,
      callbacks:{ label: x => ` ${x.dataset.label}  ${typeof x.raw==='number' ? x.raw.toFixed(4) : x.raw}` } } },
    scales:{
      x:{ grid:{color:c.rule, drawTicks:false}, border:{color:c.rule}, ticks:{color:c.ink3, font:{family:c.mono,size:11}, maxTicksLimit:8, maxRotation:0, padding:6} },
      y:{ grid:{color:c.rule, drawTicks:false}, border:{color:c.rule}, ticks:{color:c.ink3, font:{family:c.mono,size:11}, padding:6} },
    },
  };
}
function destroy(id){ if (S.charts[id]) { S.charts[id].destroy(); delete S.charts[id]; } }
const fmtD = d => d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
const fmtRate = v => v >= 10 ? v.toFixed(4) : v >= 1 ? v.toFixed(4) : v.toFixed(5);
const pct = (a, b) => (a / b - 1) * 100;
const sgn = v => (v > 0 ? '+' : '') + v.toFixed(2) + '%';
const cls = v => v > 0 ? 'g' : v < 0 ? 'r' : '';

// ── pair cards (all 7 pairs) ────────────────────────────────────────────
function lastBefore(dates, closes, days){
  const t = dates[dates.length - 1].getTime() - days * 86400000;
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i].getTime() <= t) return closes[i];
  return closes[0];
}
function drawSpark(canvas, vals, color){
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  const lo = Math.min(...vals), hi = Math.max(...vals), sx = w / (vals.length - 1), sy = (h - 4) / ((hi - lo) || 1);
  g.beginPath();
  vals.forEach((v, i) => { const x = i * sx, y = h - 2 - (v - lo) * sy; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = color; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
  g.lineTo(w, h); g.lineTo(0, h); g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, color + '33'); grad.addColorStop(1, color + '00');
  g.fillStyle = grad; g.fill();
}
function renderPairs(){
  const c = palette(), wrap = document.getElementById('pairs');
  wrap.innerHTML = PAIRS.map(p => {
    const s = series(p.id), n = s.closes.length, last = s.closes[n - 1];
    const d1 = pct(last, s.closes[n - 2]), m1 = pct(last, lastBefore(s.dates, s.closes, 30)), y1 = pct(last, lastBefore(s.dates, s.closes, 365));
    return `<button class="pcard${p.id === S.pair ? ' on' : ''}" data-pair="${p.id}" aria-pressed="${p.id === S.pair}">
      <div class="pc-top"><span class="pc-pair">${p.label}</span><span class="pc-name" title="${s.name}">${s.name}</span></div>
      <div class="pc-rate">${fmtRate(last)}</div>
      <div class="pc-chg"><span class="${cls(d1)}">${sgn(d1)}<small>1D</small></span><span class="${cls(m1)}">${sgn(m1)}<small>1M</small></span><span class="${cls(y1)}">${sgn(y1)}<small>1Y</small></span></div>
      <canvas class="pc-spark" data-spark="${p.id}"></canvas></button>`;
  }).join('');
  wrap.querySelectorAll('[data-spark]').forEach(cv => {
    const s = series(cv.dataset.spark), vals = s.closes.slice(-260), up = vals[vals.length - 1] >= vals[0];
    drawSpark(cv, vals, up ? c.up : c.down);
  });
  wrap.querySelectorAll('.pcard').forEach(b => b.addEventListener('click', () => { S.pair = b.dataset.pair; renderPairs(); analyse(); }));
}

// ── analysis charts ────────────────────────────────────────────────────
function renderForecastChart(hDates, hClose, fDates, ens, mcData){
  destroy('fc');
  const c = palette(), hL = hDates.map(fmtD), fL = fDates.map(fmtD);
  const hC = applyDir(hClose), ensD = applyDir(ens), p5 = applyDir(mcData.p5), p50 = applyDir(mcData.p50), p95 = applyDir(mcData.p95);
  const ar = applyDir(arima(S.full.closes, fDates.length)), hwD = applyDir(hw(S.full.closes, fDates.length));
  const hp = Array(hL.length - 1).fill(null), last = hC[hC.length - 1], fut = v => [...hp, last, ...v];
  S.charts.fc = new Chart(document.getElementById('fChart'), { type:'line', data:{ labels:[...hL, ...fL], datasets:[
    { label:'P95', data:fut(p95), fill:'+1', backgroundColor:rgba('--accent-rgb', 0.08), borderColor:rgba('--accent-rgb', 0.18), borderWidth:1, pointRadius:0, tension:0.3 },
    { label:'P5', data:fut(p5), fill:false, borderColor:rgba('--accent-rgb', 0.18), borderWidth:1, pointRadius:0, tension:0.3 },
    { label:'ARIMA', data:fut(ar), borderColor:c.up, borderWidth:1.5, borderDash:[5, 4], pointRadius:0, tension:0.3 },
    { label:'Holt-Winters', data:fut(hwD), borderColor:c.warn, borderWidth:1.5, borderDash:[2, 4], pointRadius:0, tension:0.3 },
    { label:'MC median', data:fut(p50), borderColor:c.violet, borderWidth:1.5, borderDash:[6, 3], pointRadius:0, tension:0.3 },
    { label:'Ensemble', data:fut(ensD), borderColor:c.accent, backgroundColor:c.accent, borderWidth:2.5, pointRadius:[...hp.map(() => 0), 4, ...ensD.map(() => 2)], tension:0.3 },
    { label:'History', data:[...hC, ...fL.map(() => null)], borderColor:c.ink2, borderWidth:1.6, pointRadius:0, tension:0.2 },
  ] }, options: baseOpts(c) });
}
function renderMCChart(fDates, mcData){
  destroy('mc');
  const c = palette();
  S.charts.mc = new Chart(document.getElementById('mcChart'), { type:'line', data:{ labels:fDates.map(fmtD), datasets:[
    { label:'P95 (bull)', data:applyDir(mcData.p95), borderColor:c.up, borderWidth:2, pointRadius:0, tension:0.3, fill:'+2', backgroundColor:rgba('--accent-rgb', 0.08) },
    { label:'P50', data:applyDir(mcData.p50), borderColor:c.accent, borderWidth:2.5, pointRadius:0, tension:0.3 },
    { label:'P5 (bear)', data:applyDir(mcData.p5), borderColor:c.down, borderWidth:2, pointRadius:0, tension:0.3 },
  ] }, options: baseOpts(c) });
}
function renderSeas(sd){
  destroy('seas');
  const c = palette(), dow = S.seas === 'dow', labels = dow ? sd.dowL : sd.monL, vals = dow ? sd.dowV : sd.monV;
  const o = baseOpts(c);
  o.scales.x.grid = { display:false };
  o.plugins.tooltip.callbacks = { label: x => ` mean return  ${x.raw.toFixed(4)}%` };
  S.charts.seas = new Chart(document.getElementById('seasChart'), { type:'bar', data:{ labels, datasets:[{ label:'Mean return', data:vals,
    backgroundColor:vals.map(v => v < 0 ? rgba('--down-rgb', 0.55) : rgba('--up-rgb', 0.55)), borderRadius:4, borderSkipped:false }] }, options:o });
}

// ── indicators, risk, statistics ───────────────────────────────────────
function renderIndicators(closes, highs, lows){
  const c = palette();
  const r = rsi(closes), m = macd(closes), b = bolPctB(closes), st = stoch(closes, highs, lows), wr = willR(closes, highs, lows),
        at = atr(closes, highs, lows), cc = cci(closes, highs, lows), z = zscore(closes);
  const comp = composite(r, m.hist, b, st, wr, at, cc, z, closes);
  const rows = [
    ['RSI-14', r.toFixed(1), r, r > 70 ? 'o' : r < 30 ? 'u' : 'n', r > 70 ? 'Overbought' : r < 30 ? 'Oversold' : 'Neutral'],
    ['MACD histogram', m.hist.toFixed(5), m.hist > 0 ? 70 : 30, m.hist > 0 ? 'b' : 'r', m.hist > 0 ? 'Bullish' : 'Bearish'],
    ['Bollinger %B', b.toFixed(3), b * 100, b < 0.2 ? 'b' : b > 0.8 ? 'r' : 'n', b < 0.2 ? 'At lower band' : b > 0.8 ? 'At upper band' : 'In band'],
    ['Stochastic-14', st.toFixed(1), st, st < 20 ? 'b' : st > 80 ? 'r' : 'n', st < 20 ? 'Oversold' : st > 80 ? 'Overbought' : 'Neutral'],
    ['Williams %R', wr.toFixed(1), -wr, wr < -80 ? 'b' : wr > -20 ? 'r' : 'n', wr < -80 ? 'Oversold' : wr > -20 ? 'Overbought' : 'Neutral'],
    ['ATR-14', at.toFixed(5), 50, 'n', 'Volatility'],
    ['CCI-20', cc.toFixed(1), Math.min(100, Math.max(0, (cc + 200) / 4)), cc < -100 ? 'b' : cc > 100 ? 'r' : 'n', cc < -100 ? 'Cheap' : cc > 100 ? 'Expensive' : 'Neutral'],
    ['Z-score-20', z.toFixed(3), Math.min(100, Math.max(0, (z + 3) / 6 * 100)), z < -1.5 ? 'b' : z > 1.5 ? 'r' : 'n', z < -1.5 ? 'Cheap' : z > 1.5 ? 'Expensive' : 'Neutral'],
  ];
  const flip = s => S.dir === 'FX_TO_INR' ? (s === 'b' ? 'r' : s === 'r' ? 'b' : s) : s;
  const tone = s => ({ b:'g', u:'g', r:'r', o:'r' })[flip(s)] || '';
  const col = s => ({ g:c.up, r:c.down })[tone(s)] || c.ink3;
  document.getElementById('ind-body').innerHTML = rows.map(([n, v, bar, s, l]) =>
    `<tr><td>${n}</td><td class="num">${v}</td><td><span class="tag ${tone(s)}">${l}</span></td>
     <td style="width:28%"><div class="bar"><span style="width:${Math.min(100, Math.max(0, bar))}%;background:${col(s)}"></span></div></td></tr>`).join('');
  const t = comp >= 70 ? 'g' : comp < 40 ? 'r' : 'y', lbl = comp >= 70 ? 'Strong signal' : comp < 40 ? 'Weak signal' : 'Neutral';
  document.getElementById('c-num').innerHTML = `<span class="${t}">${comp}</span><span class="muted">/100</span>`;
  document.getElementById('c-sig').textContent = lbl;
  document.getElementById('k-score').innerHTML = `<span class="${t}">${comp}</span><span class="muted" style="font-size:.6em">/100</span>`;
  document.getElementById('k-score-s').textContent = `${lbl} · 8-indicator composite`;
}
function renderRisk(closes){
  const rm = riskMetrics(closes);
  const cells = [
    ['VaR 95%', rm.v95.toFixed(3) + '%', 'Max daily move, 95%', 'r'], ['VaR 99%', rm.v99.toFixed(3) + '%', 'Max daily move, 99%', 'r'],
    ['CVaR 95%', rm.cv95.toFixed(3) + '%', 'Expected tail move', 'r'], ['Max drawdown', rm.mdd.toFixed(2) + '%', 'Peak to trough, 3 years', 'y'],
    ['DCA 5-day', fmtRate(rm.dca5), 'Average of last 5 fixings', 'b'], ['DCA 10-day', fmtRate(rm.dca10), 'Average of last 10 fixings', 'b'],
    ['Annualised vol', rm.avol.toFixed(2) + '%', '20-day rolling', ''], ['Vol regime', rm.avol > 10 ? 'High' : 'Low', 'Above / below 10% annualised', rm.avol > 10 ? 'r' : 'g'],
  ];
  document.getElementById('risk-grid').innerHTML = cells.map(([l, v, s, t]) => `<div class="mcell"><div class="label">${l}</div><div class="mv ${t}">${v}</div><div class="ms">${s}</div></div>`).join('');
}
function renderStats(closes){
  const H = hurst(closes), sk = skewness(closes), ku = kurtosis(closes);
  const cells = [
    ['Hurst exponent', H.toFixed(3), H > 0.55 ? 'Trending' : H < 0.45 ? 'Mean-reverting' : 'Random walk'],
    ['Skewness', sk.toFixed(3), sk > 0.3 ? 'Positive skew' : sk < -0.3 ? 'Negative skew' : 'Symmetric'],
    ['Excess kurtosis', ku.toFixed(3), ku > 1 ? 'Fat tails' : ku < -1 ? 'Thin tails' : 'Near-normal'],
    ['10-day vol', rollVol(closes, 10).toFixed(2) + '%', 'Annualised'], ['20-day vol', rollVol(closes, 20).toFixed(2) + '%', 'Annualised'],
    ['30-day vol', rollVol(closes, 30).toFixed(2) + '%', 'Annualised'],
  ];
  document.getElementById('stat-grid').innerHTML = cells.map(([l, v, s]) => `<div class="mcell"><div class="label">${l}</div><div class="mv">${v}</div><div class="ms">${s}</div></div>`).join('');
}
function renderCalc(){
  const c = S.calc; if (!c) return;
  const amt = Math.max(0, parseFloat(document.getElementById('calc-amt').value) || 0);
  const base = PAIRS.find(p => p.id === S.pair).label.split('/')[0], selling = S.dir === 'FX_TO_INR';
  const inr = v => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits: 0 }).format(v);
  const today = amt * c.current, best = amt * c.best, diff = selling ? best - today : today - best;
  document.getElementById('calc-lbl').textContent = `Amount in ${base} to ${selling ? 'sell' : 'buy'}`;
  document.getElementById('calc-today').textContent = inr(today);
  document.getElementById('calc-best-lbl').textContent = `On ${c.date ? c.date.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'the best date'} (forecast)`;
  document.getElementById('calc-best').textContent = inr(best);
  // A negative difference means every forecast day is worse than today.
  document.getElementById('calc-diff-lbl').textContent = diff >= 0 ? (selling ? 'Extra INR received' : 'INR saved') : (selling ? 'Selling today is better by' : 'Buying today is better by');
  const d = document.getElementById('calc-diff');
  d.textContent = inr(Math.abs(diff));
  d.className = 'mv ' + (diff > 0 ? 'g' : diff < 0 ? 'y' : '');
  document.getElementById('calc-meta').textContent = `${selling ? 'INR received' : 'INR cost'} · today vs the best ${S.horizon} forecast date · estimate, not advice`;
}
function renderKPIs(ens, fDates, current){
  const best = bestDate(ens, fDates), inv = S.dir === 'FX_TO_INR';
  S.calc = { current, best: best.rate, date: best.date };
  renderCalc();
  const disp = inv ? 1 / current : current, bestDisp = inv ? 1 / best.rate : best.rate;
  const gain = Math.abs(bestDisp - disp) / disp * 100, lbl = PAIRS.find(p => p.id === S.pair).label;
  document.getElementById('k-date').textContent = best.date ? best.date.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '-';
  document.getElementById('k-date-s').textContent = inv ? 'Highest forecast rate (most INR per unit)' : 'Lowest forecast rate (fewest INR per unit)';
  document.getElementById('k-rate').textContent = fmtRate(disp);
  document.getElementById('k-rate-s').textContent = `${inv ? lbl.split('/')[0] + ' per INR' : 'INR per ' + lbl.split('/')[0]} · ECB fixing ${S.full.dates[S.full.dates.length - 1].toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`;
  document.getElementById('k-gain').innerHTML = `<span class="g">${gain.toFixed(2)}%</span>`;
  document.getElementById('k-gain-s').textContent = `Best forecast vs today · ${inv ? 'higher is better' : 'lower is better'}`;
}

// ── pipeline ───────────────────────────────────────────────────────────
function analyse(){
  const hz = HORIZONS.find(h => h.id === S.horizon), raw = series(S.pair), n = raw.closes.length;
  // seed: pair + horizon + last fixing date (FNV-1a)
  S.seed = [...`${S.pair}|${S.horizon}|${S.data.meta.last_observation}`].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
  S.full = raw;
  const histN = Math.min(n, hz.hd), h = hz.td, fDates = futureDays(h);
  const mcF = mc(raw.closes, h, 5000), ens = ensemble(arima(raw.closes, h), hw(raw.closes, h), mcF.p50);
  const lbl = PAIRS.find(p => p.id === S.pair).label;
  document.getElementById('tb-title').innerHTML = `${lbl} <small>${raw.name} · ${hz.label} horizon · ${S.dir === 'INR_TO_FX' ? 'buying ' + lbl.split('/')[0] : 'selling ' + lbl.split('/')[0]}</small>`;
  document.getElementById('fc-meta').textContent = `${hz.label} · ${h} fixings ahead`;
  renderForecastChart(raw.dates.slice(-histN), raw.closes.slice(-histN), fDates, ens, mcF);
  renderMCChart(fDates, mcF);
  renderSeas(seasonality(raw.dates, raw.closes));
  renderIndicators(raw.closes, raw.highs, raw.lows);
  renderRisk(raw.closes);
  renderStats(raw.closes);
  renderKPIs(ens, fDates, raw.closes[n - 1]);
}

function ago(iso){
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
function segment(id, items, key, onPick){
  const el = document.getElementById(id);
  el.innerHTML = items.map(i => `<button class="btn${S[key] === i.id ? ' on' : ''}" data-v="${i.id}">${i.label}</button>`).join('');
  el.querySelectorAll('.btn').forEach(b => b.addEventListener('click', () => {
    S[key] = b.dataset.v; el.querySelectorAll('.btn').forEach(x => x.classList.toggle('on', x === b)); onPick();
  }));
}

async function boot(){
  const status = document.getElementById('h-ts');
  try {
    const r = await fetch('fx_data.json', { cache:'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    S.data = await r.json();
  } catch (e) {
    status.innerHTML = `<span class="dot err"></span>Could not load fx_data.json (${e.message})`;
    document.getElementById('analysis').innerHTML = `<div class="note">The FX data file failed to load. Refresh the page; if it persists the data bot's last run failed.</div>`;
    return;
  }
  const meta = S.data.meta, lastObs = new Date(meta.last_observation + 'T12:00:00Z');
  const stale = (Date.now() - lastObs) / 86400000 > 5;
  status.innerHTML = `<span class="dot ${stale ? 'warn' : 'ok'}"></span>${stale ? 'Data may be out of date · ' : ''}ECB reference rates · last fixing ${lastObs.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })} · synced ${ago(meta.generated_at)}`;
  segment('hz-seg', HORIZONS, 'horizon', analyse);
  segment('dir-seg', [{ id:'INR_TO_FX', label:'INR → FX' }, { id:'FX_TO_INR', label:'FX → INR' }], 'dir', analyse);
  segment('seas-seg', [{ id:'dow', label:'Day of week' }, { id:'mon', label:'Month' }], 'seas', () => renderSeas(seasonality(S.full.dates, S.full.closes)));
  document.getElementById('calc-amt').addEventListener('input', renderCalc);
  renderPairs();
  analyse();
}

// Theme toggle shared with nithinpuru.github.io (same localStorage key).
document.getElementById('theme-btn').addEventListener('click', () => {
  const root = document.documentElement, next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (_) {}
  if (S.data) { renderPairs(); analyse(); }
});
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => S.data && renderPairs(), 200); });
boot();
