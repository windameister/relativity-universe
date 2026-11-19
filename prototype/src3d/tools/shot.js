const puppeteer = require('puppeteer-core');
const path = require('path');
const HTML = 'file://' + path.resolve(__dirname, '../../index3d.html');
const [,, query, out, waitMs] = process.argv;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1600,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto(HTML + (query || ''), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, +waitMs || 6000));
  const info = await p.evaluate(() => ({ fps: window.__fps, err: document.getElementById('errors').textContent, hud: document.getElementById('hud').style.display, gl: !!document.getElementById('gl') }));
  await p.screenshot({ path: out });
  console.log(JSON.stringify(info), '\n' + errs.join('\n'));
  await b.close();
})();
