// 在 Node 里按 URL 的 plan 跑一局（与界面 ?plan= 相同语义：最后一站的选项不执行，除非加 --all）
// 用法：node tools/plan.js <seed> "<plan>" [--file index.html] [--all] [--json]
const args = process.argv.slice(2); const seed = args[0], plan = args[1];
const fi = args.indexOf('--file'); const SIM = require('./simload')(fi >= 0 ? args[fi + 1] : undefined);
const u = SIM.createUniverse(seed); SIM.remember(u, 0);
const steps = plan ? plan.split(',') : []; let last = null;
steps.forEach((st, k) => {
  const p3 = st.split(':');
  last = p3[0] === 'h' ? SIM.hibernate(u, +p3[1]) : SIM.travel(u, +p3[0], p3[1] || 'w0.9999');
  const R = last.report;
  console.log('== ' + st + ' → ' + R.sysName + ' ' + SIM.yr(u.time) + (R.death ? ' [死亡] ' + R.deathCause : '') + ' 层级=' + (R.encounter && R.encounter.tier) + ' 场景=' + (R.encounter && R.encounter.scene));
  (R.big || []).forEach(b => console.log('  [卡] ' + b.title + '：' + b.t));
  (R.lines || []).forEach(l => console.log('  · ' + l.t));
  (R.caused || []).forEach(l => console.log('  ↻ ' + l));
  (R.remote || []).forEach(l => console.log('  ✧ ' + l.name + '：' + l.t));
  (R.encounter && R.encounter.forced || []).forEach(l => console.log('  ! ' + l.t));
  if (R.encounter) console.log('  选项：' + R.encounter.options.map(o => o.id + (o.label && o.label !== o.id ? '(' + o.label + ')' : '')).join(' / '));
  if ((k < steps.length - 1 || args.includes('--all')) && p3[2]) { const r = SIM.interact(u, R.sysId, decodeURIComponent(p3[2])); console.log('  → ' + p3[2] + '：' + r.t); }
});
if (args.includes('--json')) console.log(JSON.stringify({ time: u.time, age: u.ship.crewAge0 + u.ship.bio, supply: u.ship.supply, tech: u.ship.tech }));
const evi = args.indexOf('--eval'); if (evi >= 0) console.log(JSON.stringify(new Function('u', 'SIM', 'return ' + args[evi + 1])(u, SIM)));
