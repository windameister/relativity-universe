const puppeteer = require('puppeteer-core');
const path = require('path');
const HTML = 'file://' + path.resolve(__dirname, '../../index3d.html');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage(); const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto(HTML + (process.argv[2] || '') + '&freeze=0.1');
  await new Promise(r => setTimeout(r, 2500));
  console.log(await p.evaluate(() => { var R = window.__rp; if (!R) return 'no replay'; return JSON.stringify({ t0: R.t0, t1: R.t1, dur: R.dur, pts: R.pts, ev: R.ev.map(e => ({ k: e.kind, y: e.y, sys: e.sys, rt: e.rt, cap: e.cap })) }); }), errs);
  await b.close();
})();
