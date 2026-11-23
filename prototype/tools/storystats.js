// 故事 / 导演 / 经济统计：与 evcheck 覆盖率相同的 5 种玩法 × N/5 个种子（每局 12 站 + 再推 500 年）
//   node tools/storystats.js [--n 300] [--file path/to/index.html]
// 输出：每份报告的大事件卡数量分布、单局卡数、card.* 次数；补给与飞船科技曲线；母星回访；结局（destiny）分布
const path = require('path');
const args = process.argv.slice(2);
const fi = args.indexOf('--file');
const SIM = require('./simload')(fi >= 0 ? args[fi + 1] : path.join(__dirname, '..', 'index.html'));
const N = args.includes('--n') ? +args[args.indexOf('--n') + 1] : 300;
const STYLES = ['tour', 'cautious', 'god', 'broadcast', 'sleeper'];
const S = { reports: 0, cards: 0, perRep: {}, maxRep: 0, runCards: [], byCard: {}, helped: [], minSup: [], supAtDep: [], depFull: 0, deps: 0, homeVisits: 0,
  homeTechGain: 0, techEnd: [], warpBlocked: 0, starved: 0, lowSupRuns: 0, destiny: {}, destinyOutcome: {}, deaths: {} };
for (let k = 0; k < N; k++) {
  const style = STYLES[k % STYLES.length], seed = 'ev' + Math.floor(k / STYLES.length) + style[0];
  let rs = 1 + k * 7919; const r = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  const u = SIM.createUniverse(seed); SIM.remember(u, 0);
  if (SIM.chooseDestiny) SIM.chooseDestiny(u, ['zero', 'singer', 'earth', 'domain'][k % 4]);
  let runCards = 0, helped = 0, minSup = 100;
  for (let i = 0; i < 12 && !u.ship.dead; i++) {
    let res;
    S.deps++; S.supAtDep.push(u.ship.supply); if (u.ship.supply >= 90) S.depFull++;
    if (style === 'sleeper' && i % 3 === 2) res = SIM.hibernate(u, [300, 500, 1000][i % 3]);
    else {
      const here = u.ship.at; let c = u.systems.filter(s => s.id !== here && s.owner != null && !u.civs[s.owner].blackDomain);
      if (style === 'god') { const lo = c.filter(s => u.civs[s.owner].tech < 45); if (lo.length) c = lo; }
      if (!c.length || r() < 0.25) c = u.systems.filter(s => s.id !== here);
      if (style === 'tour' && i % 4 === 3 && r() < 0.5) c = u.systems.filter(s => s.id === 0 && s.id !== here).concat(c).slice(0, 1);
      const d = c[Math.floor(r() * c.length)];
      const mode = style === 'cautious' ? (i % 2 ? '0.03' : 'w0.99') : ['w0.999', 'w0.9999', 'w0.99999'][i % 3];
      if (mode[0] === 'w' && u.ship.supply < SIM.WARP_SUPPLY) S.warpBlocked++;
      res = SIM.travel(u, d.id, mode);
    }
    const rep = res.report, En = rep.encounter;
    minSup = Math.min(minSup, u.ship.supply);
    if (rep.death) { S.deaths[res.trip.died || '?'] = (S.deaths[res.trip.died || '?'] || 0) + 1; break; }
    if (!En) break;
    S.reports++; const nb = (rep.big || []).length; S.cards += nb; runCards += nb; S.perRep[nb] = (S.perRep[nb] || 0) + 1; S.maxRep = Math.max(S.maxRep, nb);
    (rep.big || []).forEach(b => { S.byCard[b.ev] = (S.byCard[b.ev] || 0) + 1; if (b.ev === 'card.helped_extinct') helped++; });
    if (En.tier === '母星') S.homeVisits++;
    let opts = En.options.filter(o => o.id !== '离开' && o.id !== '广播坐标');
    let pick = null;
    const evo = opts.filter(o => o.id[0] === '@');
    if (style === 'broadcast' && r() < 0.5) pick = '广播坐标';
    else if (style === 'cautious') pick = (opts.find(o => /观察|讲述|求教|补给/.test(o.id)) || {}).id || (evo.length && r() < 0.7 ? evo[0].id : null);
    else if (style === 'god') pick = (opts.find(o => /假扮神明|降临|大量技术|少量技术/.test(o.id)) || (evo.length ? evo[Math.floor(r() * evo.length)] : opts[Math.floor(r() * opts.length)]) || {}).id;
    else if (evo.length && r() < 0.6) pick = evo[Math.floor(r() * evo.length)].id;
    else if (opts.length) pick = opts[Math.floor(r() * opts.length)].id;
    if (pick && pick[0] !== '@' && !opts.concat(En.options).some(o => o.id === pick)) pick = null;
    if (pick) { const ir = SIM.interact(u, rep.sysId, pick); if (ir && ir.ending) S.endInteract = (S.endInteract || 0) + 1; }
    if (rep.ending) S.endReport = (S.endReport || 0) + 1;
    minSup = Math.min(minSup, u.ship.supply);
  }
  if (u.ship.dead) { /* already counted */ }
  if (minSup < 25) S.lowSupRuns++;
  S.runCards.push(runCards); S.helped.push(helped); S.minSup.push(minSup); S.techEnd.push(u.ship.tech);
  if (SIM.destinyOf) { const d = SIM.destinyOf(u); if (d) { S.destiny[d.id] = (S.destiny[d.id] || 0) + 1; S.destinyOutcome[d.id + ':' + d.state] = (S.destinyOutcome[d.id + ':' + d.state] || 0) + 1; } }
}
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), mx = a => Math.max.apply(null, a);
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };
console.log('== 导演：' + N + ' 局，' + S.reports + ' 份到访报告');
console.log('  每份报告卡数分布：' + JSON.stringify(S.perRep) + '；单份最多 ' + S.maxRep + '；≥3 张的报告 ' + Object.keys(S.perRep).filter(k => +k >= 3).reduce((a, k) => a + S.perRep[k], 0));
console.log('  每局卡数：平均 ' + avg(S.runCards).toFixed(2) + '，最多 ' + mx(S.runCards) + '；card.helped_extinct 每局平均 ' + avg(S.helped).toFixed(2) + '，单局最多 ' + mx(S.helped));
console.log('  各卡次数：' + Object.entries(S.byCard).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join('，'));
console.log('== 经济：出发 ' + S.deps + ' 次，出发时补给 ≥90 的比例 ' + (100 * S.depFull / S.deps).toFixed(0) + '%，出发时平均补给 ' + avg(S.supAtDep).toFixed(0) + '，中位 ' + pct(S.supAtDep, 0.5).toFixed(0));
console.log('  每局最低补给：平均 ' + avg(S.minSup).toFixed(0) + '，10% 分位 ' + pct(S.minSup, 0.1).toFixed(0) + '；最低补给 < 25 的局 ' + S.lowSupRuns + '/' + N + '；补给不够启动曲率 ' + S.warpBlocked + ' 次');
console.log('  母星回访 ' + S.homeVisits + ' 次；终局飞船科技 平均 ' + avg(S.techEnd).toFixed(0) + '，90% 分位 ' + pct(S.techEnd, 0.9).toFixed(0) + '，最高 ' + mx(S.techEnd).toFixed(0));
console.log('  死亡：' + JSON.stringify(S.deaths));
if (Object.keys(S.destiny).length) console.log('== 命运（12 站内）：' + JSON.stringify(S.destinyOutcome) + '；报告里交付结局 ' + (S.endReport || 0) + '，选项结果里交付 ' + (S.endInteract || 0));
