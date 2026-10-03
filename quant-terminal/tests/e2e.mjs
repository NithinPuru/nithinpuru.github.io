// End-to-end browser test for the Quant Terminal.
// Serves ../../public at http://localhost:PORT/quant-terminal/ (same subpath as
// production), drives every feature in headless Chrome, and fails on any page
// error, console error, failed local request or broken assertion.
//
//   npm install        (installs puppeteer from package.json)
//   node quant-terminal/tests/e2e.mjs [--url https://nithinpuru.github.io/quant-terminal/] [--shots DIR]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../../public');
const args = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SHOTS = argVal('--shots');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let BASE = argVal('--url');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/quant-terminal') { rsp.writeHead(301, { Location: '/quant-terminal/' }); return rsp.end(); }
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(PUBLIC, p);
      if (!f.startsWith(PUBLIC) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('not found'); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const srv = BASE ? null : await serve();
BASE = BASE || `http://localhost:${srv.address().port}/quant-terminal/`;
const origin = new URL(BASE).origin;
console.log('Testing', BASE);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
// Offline runs: CDN_DIR=<dir with node_modules/{chart.js,lightweight-charts}> serves the two CDN scripts locally.
if (process.env.CDN_DIR) {
  const local = { 'chart.js@4.5.1/dist/chart.umd.min.js': 'chart.js/dist/chart.umd.min.js', 'lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js': 'lightweight-charts/dist/lightweight-charts.standalone.production.js' };
  await page.setRequestInterception(true);
  page.on('request', req => { const m = Object.entries(local).find(([k]) => req.url().includes('cdn.jsdelivr.net/npm/' + k));
    m ? req.respond({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(process.env.CDN_DIR, 'node_modules', m[1])) }) : req.continue(); });
}
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', r => { if (r.url().startsWith(origin)) errors.push('requestfailed: ' + r.url()); });
page.on('dialog', d => d.accept());
const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const waitLoaded = () => page.waitForFunction(() => /LIVE|LOADED/.test(document.getElementById('status-pill').textContent) && !document.querySelector('#grid .skeleton'), { timeout: 60000 });

try {
  // ── Dashboard ────────────────────────────────────────────────────────────
  console.log('Dashboard');
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await waitLoaded();
  const dash = await page.evaluate(() => ({ ok: Object.values(D).filter(d => d.ok).length, total: PUB.length, cards: document.querySelectorAll('#grid .card').length, scoreMax: Math.max(...Object.values(D).filter(d => d.ok).map(d => d.score)) }));
  check(dash.ok === dash.total && dash.total >= 60, `all ${dash.total} tickers load (${dash.ok} ok) in ${Date.now() - t0} ms`);
  check(dash.scoreMax < 99, `quant score is not clamped (max ${dash.scoreMax})`);
  const disp = await page.evaluate(() => document.getElementById('s-disp').textContent);
  check(/\d+\.\d%/.test(disp), `header shows cross-sectional dispersion (${disp})`);
  await shot('01-dashboard');

  // ── Detail modal incl. regime & factor profile ────────────────────────────
  console.log('Detail modal');
  for (const t of ['NVDA', '005930.KS', 'SPY']) {
    await page.evaluate(t => openDetail(t), t);
    await page.waitForFunction(() => document.querySelector('#det-profile canvas'), { timeout: 20000 });
    const info = await page.evaluate(() => ({ lw: !!document.querySelector('#det-lw-chart canvas'), prof: document.getElementById('det-profile').textContent.includes('P(turbulent)'),
      vol: ['det-garch-chart', 'det-vts-chart', 'det-nic-chart'].every(id => Chart.getChart(id)?.data.datasets[0].data.length > 0), grid: /Leverage γ[\s\S]*CDaR 95%/.test(document.getElementById('det-grid').textContent) }));
    check(info.lw && info.prof, `${t}: price chart + regime/factor profile render`);
    check(info.vol && info.grid, `${t}: GJR-GARCH, vol term structure, news impact + CDaR render`);
    if (t === 'NVDA') { await page.evaluate(() => (document.getElementById('det-scroll').scrollTop = 99999)); await sleep(300); await shot('02-detail-profile'); }
    await page.keyboard.press('Escape');
  }

  // ── Daily price chart with zoom ranges ────────────────────────────────────
  console.log('Daily chart');
  await page.evaluate(() => openDetail('NVDA'));
  await page.waitForFunction(() => document.querySelectorAll('#det-range .btn').length === 8 && document.querySelector('#det-lw-chart canvas'), { timeout: 30000 });
  const dchart = await page.evaluate(() => ({ title: document.getElementById('det-chart-title').textContent, legend: document.getElementById('det-legend').textContent }));
  check(/Daily price/.test(dchart.title) && /Vol/.test(dchart.legend), `daily candles + volume load (${dchart.legend.slice(0, 70)})`);
  const bars = async () => page.evaluate(() => { const r = window.lwChartInst.timeScale().getVisibleLogicalRange(); return r ? Math.round(r.to - r.from) : 0; });
  await page.click('#det-range [data-r="2W"]'); await sleep(300);
  const b2w = await bars();
  check(b2w >= 8 && b2w <= 16, `2W zoom shows ~10 trading days (${b2w} bars)`);
  await page.click('#det-range [data-r="10Y"]'); await sleep(300);
  const t10 = await page.evaluate(() => document.getElementById('det-chart-title').textContent);
  check(/Weekly price/.test(t10) && (await bars()) > 400, '10Y switches to the weekly history');
  await page.click('#det-range [data-r="6M"]');
  const spk = await page.evaluate(() => ({ n: D.NVDA.spark ? D.NVDA.spark.length : 0, m1: D.NVDA.chg1m }));
  check(spk.n > 200 && spk.m1 != null, `card sparkline uses ${spk.n} daily closes; 1M change ${spk.m1?.toFixed(1)}%`);
  await page.keyboard.press('Escape');

  // ── Every tool and tab ───────────────────────────────────────────────────
  console.log('Tools');
  const toolTabs = { factor: ['exp', 'scores', 'quality', 'fret', 'ic', 'roll', 'fmb'], regime: ['mkt', 'uni', 'corr'], lab: ['main', 'dd', 'vt', 'attr', 'active'], pairs: ['main'], rrg: ['main'], backtest: ['main'], earnings: ['up', 'study'], replay: ['replay', 'ic'], vol: ['garch', 'var', 'uni'], struct: ['pca', 'denoise', 'kalman'], validate: ['dsr', 'boot'] };
  for (const [tool, tabs] of Object.entries(toolTabs)) {
    for (const tab of tabs) {
      await page.evaluate((tool, tab) => openTool(tool, tab), tool, tab);
      await page.waitForFunction(() => !document.querySelector('#tool-body .tool-loading'), { timeout: 60000 });
      await sleep(250);
      const r = await page.evaluate(() => ({ err: !!document.querySelector('#tool-body .es-title') && document.querySelector('#tool-body').innerText.includes('Couldn’t compute'), canv: document.querySelectorAll('#tool-body canvas').length, rows: document.querySelectorAll('#tool-body tbody tr').length }));
      check(!r.err && (r.canv > 0 || r.rows > 0), `${tool}/${tab}: renders (${r.canv} charts, ${r.rows} table rows)`);
      await shot(`03-tool-${tool}-${tab}`);
    }
    await page.keyboard.press('Escape');
  }
  // Tool option switches
  await page.evaluate(() => openTool('regime', 'mkt'));
  await page.waitForFunction(() => document.querySelector('#tool-body [data-k="3"]'));
  await page.click('#tool-body [data-k="3"]'); await page.waitForFunction(() => document.querySelector('#rg-tm tr:nth-child(4)'), { timeout: 30000 });
  check(true, 'regime: 3-state model renders');
  await page.click('#tool-body [data-b="SPY"]'); await page.waitForFunction(() => document.querySelector('#tool-body [data-b="SPY"].on'), { timeout: 30000 });
  check(true, 'regime: SPY benchmark switch');
  await page.keyboard.press('Escape');
  for (const strat of ['rsi', 'macd', 'trend', 'dualmom', 'xsmom']) {
    await page.evaluate(() => openTool('backtest'));
    await page.waitForFunction(() => document.getElementById('bt-s'));
    await page.select('#bt-s', strat); await page.select('#bt-c', '25'); await page.click('#bt-run');
    await page.waitForFunction(() => document.querySelector('#bt-ch') || document.querySelector('#bt-out .empty-state'), { timeout: 60000 });
    const kp = await page.evaluate(() => document.querySelector('#bt-out .kpis')?.innerText.replace(/\s+/g, ' ').slice(0, 90));
    check(!!kp, `backtest ${strat} @25bps: ${kp}`);
    await page.keyboard.press('Escape');
  }
  for (const src of ['maxSharpe', 'erc', 'hrp', 'bl', 'minCVaR']) {
    await page.evaluate(() => openTool('lab'));
    await page.waitForFunction(() => document.getElementById('lab-src'));
    await page.select('#lab-src', src);
    await page.waitForFunction(s => document.getElementById('lab-src')?.value === s && document.querySelector('#lab-sc tbody tr'), { timeout: 60000 }, src);
    check(true, `portfolio lab: ${src} portfolio stress table renders`);
    await page.keyboard.press('Escape');
  }
  // New tools: interactions
  await page.evaluate(() => openTool('earnings', 'study'));
  await page.waitForFunction(() => document.getElementById('es-t') && !document.querySelector('#tool-body .tool-loading'), { timeout: 60000 });
  await page.select('#es-t', 'NVDA');
  await page.waitForFunction(() => document.getElementById('es-t')?.value === 'NVDA' && document.querySelector('#es-tbl tbody tr'), { timeout: 60000 });
  const nvEv = await page.evaluate(() => document.querySelectorAll('#es-tbl tbody tr').length);
  check(nvEv >= 20, `earnings: NVDA event study lists ${nvEv} past reports`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => openTool('replay', 'replay'));
  await page.waitForFunction(() => document.getElementById('rp-b') && document.querySelector('#rp-tbl tbody tr'), { timeout: 60000 });
  const d1 = await page.evaluate(() => document.querySelector('#tool-body .tool-controls b').textContent);
  await page.click('#rp-b');
  await page.waitForFunction(d => document.querySelector('#tool-body .tool-controls b')?.textContent !== d && document.querySelector('#rp-tbl tbody tr'), { timeout: 60000 }, d1);
  check(true, 'replay: stepping back 4 weeks recomputes the point-in-time scores');
  await page.keyboard.press('Escape');
  for (const [tab, sel, val] of [['dd', '#dd-h', '104'], ['vt', '#vt-t', '0.15'], ['attr', '#at-b', 'ew']]) {
    await page.evaluate(t => openTool('lab', t), tab);
    await page.waitForFunction(s => document.querySelector(s) && !document.querySelector('#tool-body .tool-loading'), { timeout: 60000 }, sel);
    await page.select(sel, val);
    await page.waitForFunction((s, v) => document.querySelector(s)?.value === v && document.querySelector('#tool-body canvas'), { timeout: 60000 }, sel, val);
    check(true, `portfolio lab/${tab}: option ${val} re-renders`);
    await page.keyboard.press('Escape');
  }

  // Factor IC horizon + rolling exposures company / window switches
  await page.evaluate(() => openTool('factor', 'ic'));
  await page.waitForFunction(() => document.getElementById('fic-h') && document.querySelector('#fic-tbl tbody tr'), { timeout: 90000 });
  await page.select('#fic-h', '4');
  await page.waitForFunction(() => document.getElementById('fic-h')?.value === '4' && document.querySelectorAll('#fic-tbl tbody tr').length === 5, { timeout: 90000 });
  const icT = await page.evaluate(() => [...document.querySelectorAll('#fic-tbl tbody tr')].map(r => r.cells[5].textContent));
  check(icT.every(v => /^-?\d+\.\d$/.test(v)), `factor IC: 5 signals with Newey-West t-stats (${icT.join(', ')})`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => openTool('factor', 'roll'));
  await page.waitForFunction(() => document.getElementById('rl-t') && document.querySelector('#rl-tbl tbody tr'), { timeout: 60000 });
  await page.select('#rl-t', 'AMD');
  await page.waitForFunction(() => document.getElementById('rl-t')?.value === 'AMD' && document.querySelector('#rl-tbl tbody tr'), { timeout: 60000 });
  await page.click('#tool-body [data-w="26"]');
  await page.waitForFunction(() => document.querySelector('#tool-body [data-w="26"].on') && document.querySelector('#rl-tbl tbody tr'), { timeout: 60000 });
  check(true, 'factor rolling exposures: company and 26-week window switch');
  await page.keyboard.press('Escape');
  await page.evaluate(() => openTool('regime', 'corr'));
  await page.waitForFunction(() => document.querySelector('#cd-disp') && !document.querySelector('#tool-body .tool-loading'), { timeout: 60000 });
  check(await page.evaluate(() => Chart.getChart('cd-disp')?.data.datasets[1].data.some(v => v != null)), 'regimes: cross-sectional dispersion chart renders');
  await page.keyboard.press('Escape');
  await page.evaluate(() => openTool('lab', 'main'));
  await page.waitForFunction(() => document.querySelector('#lab-sc tbody tr'), { timeout: 60000 });
  check(await page.evaluate(() => /CDaR 95%/.test(document.querySelector('#tool-body .kpis').textContent)), 'portfolio lab: CDaR shown with the risk KPIs');
  await page.keyboard.press('Escape');

  await page.evaluate(() => openTool('factor', 'fmb'));
  await page.waitForFunction(() => document.getElementById('fm-h') && document.querySelectorAll('#fm-tbl tbody tr').length === 5, { timeout: 90000 });
  await page.select('#fm-h', '13');
  await page.waitForFunction(() => document.getElementById('fm-h')?.value === '13' && document.querySelectorAll('#fm-tbl tbody tr').length === 5, { timeout: 90000 });
  const fmT = await page.evaluate(() => [...document.querySelectorAll('#fm-tbl tbody tr')].map(r => r.cells[3].textContent));
  check(fmT.every(v => /^-?\d+\.\d$/.test(v)), `Fama-MacBeth: 5 premia with Newey-West t-stats (${fmT.join(', ')})`);
  await page.keyboard.press('Escape');
  for (const b of ['SPY', 'cap']) {
    await page.evaluate(() => openTool('lab', 'active'));
    await page.waitForFunction(() => document.getElementById('ar-b') && document.querySelector('#ar-tbl tbody tr'), { timeout: 90000 });
    await page.select('#ar-b', b);
    await page.waitForFunction(v => document.getElementById('ar-b')?.value === v && document.querySelector('#ar-tbl tbody tr'), { timeout: 90000 }, b);
    const k = await page.evaluate(() => document.querySelector('#tool-body .kpis').innerText.replace(/\s+/g, ' '));
    check(/Tracking error/i.test(k) && /Bias statistic \d\.\d\d/i.test(k), `portfolio lab/active vs ${b}: ${k.slice(0, 60)} … ${k.slice(k.search(/Bias/i))}`);
    await page.keyboard.press('Escape');
  }

  // Pairs: FDR + split-sample columns present; RRG sector mode + window switch
  await page.evaluate(() => openTool('pairs'));
  await page.waitForFunction(() => document.querySelector('#pr-tbl tbody tr'), { timeout: 90000 });
  const pairCols = await page.evaluate(() => [...document.querySelectorAll('#pr-tbl th')].map(th => th.textContent).join('|'));
  check(/q \(FDR\)/.test(pairCols) && /2nd half/.test(pairCols) && /Status/.test(pairCols), 'pairs: FDR q-values, split-sample p-values and status shown');
  await page.keyboard.press('Escape');
  await page.evaluate(() => openTool('rrg'));
  await page.waitForFunction(() => document.querySelector('#tool-body [data-m="sectors"]'), { timeout: 60000 });
  await page.click('#tool-body [data-m="sectors"]');
  await page.waitForFunction(() => document.querySelector('#tool-body [data-m="sectors"].on') && document.querySelector('#rrg-t tbody tr'), { timeout: 60000 });
  await page.select('#rrg-w', '26');
  await page.waitForFunction(() => document.getElementById('rrg-w')?.value === '26' && document.querySelector('#rrg-t tbody tr'), { timeout: 60000 });
  const secRows = await page.evaluate(() => document.querySelectorAll('#rrg-t tbody tr').length);
  check(secRows >= 8, `rrg: sector view with 26w window (${secRows} sectors)`);
  await shot('07-rrg-sectors');
  await page.keyboard.press('Escape');
  await page.evaluate(() => openTool('pairs'));
  await page.waitForFunction(() => document.querySelector('#tool-body [data-s="0"]'), { timeout: 60000 });
  await page.click('#tool-body [data-s="0"]');
  await page.waitForFunction(() => document.querySelector('#tool-body [data-s="0"].on') && document.querySelector('#pr-tbl tbody tr'), { timeout: 90000 });
  check(true, 'pairs: all-visible universe renders');
  await page.keyboard.press('Escape');

  // ── Optimizer incl. Black-Litterman views ────────────────────────────────
  console.log('Optimizer');
  await page.evaluate(() => togglePortfolio());
  await page.waitForFunction(() => document.querySelectorAll('.pf-card').length === 7, { timeout: 60000 });
  await page.click('#bl-sug'); await page.waitForFunction(() => document.querySelectorAll('.bl-row').length === 6, { timeout: 60000 });
  const bl = await page.evaluate(() => ({ n: document.querySelectorAll('.pf-card').length, cvar: [...document.querySelectorAll('.pf-card')].some(c => /Minimum CVaR[\s\S]*CVaR 95% \(wk\) [\d.]+%/.test(c.textContent)) }));
  check(bl.n === 7 && bl.cvar, 'optimizer: 7 portfolios incl. minimum CVaR + Black-Litterman suggested views');
  await shot('04-optimizer');
  await page.evaluate(() => localStorage.removeItem('csq_bl_views'));
  await page.keyboard.press('Escape');

  // ── Screener table + filters ─────────────────────────────────────────────
  console.log('Screener & filters');
  await page.evaluate(() => setView('table'));
  const rows = await page.evaluate(() => document.querySelectorAll('#screener tbody tr').length);
  check(rows === dash.total, `screener shows ${rows} rows`);
  await page.evaluate(() => doSearch('memory'));
  const memRows = await page.evaluate(() => document.querySelectorAll('#screener tbody tr').length);
  check(memRows > 3 && memRows < 15, `screener follows search (${memRows} memory names)`);
  await shot('05-screener');
  await page.evaluate(() => { resetView(); setView('cards'); });

  // ── Range change + tracker ───────────────────────────────────────────────
  console.log('Range & tracker');
  await page.select('#time-range-sel', '10'); await waitLoaded();
  check(await page.evaluate(() => D.NVDA.prices.length > 400), '10Y range loads');
  await page.select('#time-range-sel', '1.5'); await waitLoaded();
  await page.evaluate(() => { myPortfolio = [{ t: 'NVDA', s: 10 }, { t: '005930.KS', s: 5 }, { t: 'ASML', s: 2 }]; renderTracker(); });
  const trk = await page.evaluate(() => document.getElementById('trk-summary').innerText);
  check(/\$[\d,]+/.test(trk), `tracker USD total: ${trk.split('\n')[0].slice(0, 80)}`);
  await page.evaluate(() => { labFromTracker(); });
  await page.waitForFunction(() => document.getElementById('lab-src')?.value === 'tracker' && document.querySelector('#lab-sc tbody tr'), { timeout: 30000 });
  check(true, 'tracker → portfolio lab stress test');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { myPortfolio = []; localStorage.setItem('my_portfolio', '[]'); });

  // ── Theme switching (shared with nithinpuru.github.io via localStorage "theme") ──
  console.log('Theme');
  await page.evaluate(() => openDetail('NVDA'));
  await page.waitForFunction(() => document.querySelector('#det-profile canvas'), { timeout: 20000 });
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.evaluate(() => toggleTheme());
  await page.waitForFunction(() => document.querySelector('#det-profile canvas'), { timeout: 20000 });
  const after = await page.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), saved: localStorage.getItem('theme'), bg: getComputedStyle(document.documentElement).getPropertyValue('--page').trim() }));
  check(after.t !== before && after.saved === after.t, `theme toggles ${before} → ${after.t}, saved for the whole site (page ${after.bg})`);
  await shot('08-theme-' + after.t);
  await page.evaluate(() => toggleTheme());
  await page.keyboard.press('Escape');

  // ── Mobile layout ────────────────────────────────────────────────────────
  await page.setViewport({ width: 390, height: 844, isMobile: true }); await sleep(400); await shot('06-mobile');
} catch (e) {
  failures.push('test crashed: ' + e.message);
  console.error(e);
}

check(errors.length === 0, `no page/console errors${errors.length ? ':\n    ' + errors.join('\n    ') : ''}`);
await browser.close();
srv?.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
