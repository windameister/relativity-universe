const puppeteer = require('puppeteer-core');
const path = require('path');
const HTML = 'file://' + path.resolve(__dirname, '../../index3d.html');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1600,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
  const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto(HTML + '?seed=s0');
  await new Promise(r => setTimeout(r, 3000));
  // 找一个可见的标签（有文明的星系）
  const pos = await p.evaluate(() => { const els=[...document.querySelectorAll('#labels .lb')].filter(e=>e.style.display!=='none' && e.querySelector('.cv').textContent); const e=els[1]||els[0]; const m=e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/); const r=document.getElementById('gl').getBoundingClientRect(); return {x:+m[1]-10+r.left, y:+m[2]+9+r.top, name:e.querySelector('.nm').textContent}; });
  await p.mouse.click(pos.x, pos.y);
  await new Promise(r => setTimeout(r, 800));
  const selTxt = await p.evaluate(() => document.getElementById('selInfo').textContent.slice(0, 40));
  // 常规推进看看慢点
  await p.evaluate(() => { [...document.querySelectorAll('#driveBtns button')].find(b=>b.textContent.includes('0.03')).click(); });
  await p.click('#goBtn');
  await new Promise(r => setTimeout(r, 2500));
  const midHud = await p.evaluate(() => document.getElementById('hud').style.display);
  await p.screenshot({ path: '/tmp/b3d/conv.png' });
  await new Promise(r => setTimeout(r, 30000));
  const after = await p.evaluate(() => ({ modal: document.getElementById('modal').style.display, h1: (document.querySelector('#modal h1')||{}).textContent, replayBtn: document.getElementById('replayBtn').disabled }));
  // 关闭弹窗，冬眠 1000 年
  await p.evaluate(() => { const b=[...document.querySelectorAll('#acts button')].find(b=>b.getAttribute('data-act')==='离开'); if (b) b.click(); else document.getElementById('modal').style.display='none'; });
  await p.evaluate(() => document.querySelector('[data-wait="1000"]').click());
  await new Promise(r => setTimeout(r, 25000));
  const after2 = await p.evaluate(() => ({ modal: document.getElementById('modal').style.display, h1: (document.querySelector('#modal h1')||{}).textContent, year: document.getElementById('uYear').textContent }));
  await p.evaluate(() => { document.getElementById('modal').style.display='none'; document.getElementById('godView').click(); });
  await p.evaluate(() => document.getElementById('replayBtn').click());
  await new Promise(r => setTimeout(r, 1500));
  const rp = await p.evaluate(() => document.getElementById('hud').style.display);
  await p.screenshot({ path: '/tmp/b3d/god.png' });
  console.log(JSON.stringify({ pos, selTxt, midHud, after, after2, rp, fps: await p.evaluate(()=>window.__fps) }), errs);
  await b.close();
})();
