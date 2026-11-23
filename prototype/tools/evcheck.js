// 事件库检查器
//   node tools/evcheck.js            静态检查 + 可达性 + 覆盖率（300 局：5 种玩法 × 60 个种子）+ 文本重复度
//   node tools/evcheck.js --static   只做静态检查和可达性（秒级）
//   node tools/evcheck.js --n 100    覆盖率局数
// 退出码：有 ERROR 时为 1
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SRC = require(path.join(ROOT, 'events/events_src.js'));
const E = SRC.events, byId = {}; E.forEach(e => { byId[e.id] = e; });
const errs = [], warns = [];
const ERR = m => errs.push(m), WARN = m => warns.push(m);

// ---------- 0. index.html 是否与源文件同步 ----------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = html.match(/\n<script type="application\/json" id="events">\n([\s\S]*?)\n<\/script>\n/);
if (!m) ERR('index.html 里没有事件库块');
else {
  const emb = JSON.parse(m[1]);
  if (JSON.stringify(emb.events) !== JSON.stringify(JSON.parse(JSON.stringify(E)))) WARN('index.html 里的事件库与 events/events_src.js 不一致：请运行 node events/events_src.js');
}

// ---------- 1. 静态检查 ----------
const ONS = ['year', 'pending', 'arrival', 'recognize', 'report', 'choice'];
const CONDS = ['fact', 'noFact', 'stat', 'temper', 'earth', 'alive', 'rel', 'any', 'all', 'not', 'since', 'flag', 'noflag', 'homeSeen', 'shipKnows', 'near', 'here', 'tier', 'scene', 'diaspora', 'reach', 'atWar', 'bind', 'calc'];
const COND_AUX = ['gte', 'lte', 'gt', 'lt', 'eq', 'ne', 'is'];
const OPS = ['add', 'set', 'expo', 'imprint', 'ship', 'rel', 'strike', 'protect', 'refugees', 'forbid', 'leak', 'pass', 'silence', 'evacuate', 'hunt', 'seal'];
const CALCS = ['help', 'why', 'archive', 'expo', 'home', 'age', 'dist', 'incoming', 'dim', 'faith', 'dossier', 'destiny'];
const CALC_BIND = { help: ['h'], why: ['h'], archive: ['h'] };
const SLOTS = ['civ', 'other', 'ship', 'shipBase', 'religion', 'sect0', 'sect1', 'ritual', 'home', 'here', 'year', 'cHome', 'oHome', 'istar', 'dist'];
const FSUB = /^(y|n|civ|actor|sys|them|who|act|d\.[a-zA-Z0-9_]+)$/;
// 模拟本身写入的史实 + 玩家行为（legacyAdd）写入的史实
const SIM_FACTS = ['extinct', 'war', 'strike_launch', 'cleared', 'diaspora', 'extract'];
const PLAYER_FACTS = ['god', 'devil', 'detained', 'gift_s', 'gift_l', 'teach', 'learn', 'trade', 'ally', 'starmap', 'courier', 'relic', 'scholar', 'hostile', 'told'];
const emitted = {};   // fact type → [event ids]
const addEmit = (t, id) => { (emitted[t] = emitted[t] || []).push(id); };
const emitsOf = e => { const out = []; [].concat(e.emit || []).forEach(x => out.push(x)); (e.outcomes || []).forEach(o => [].concat(o.emit || []).forEach(x => out.push(x))); return out; };
E.forEach(e => emitsOf(e).forEach(x => addEmit(x.type, e.id)));
SIM_FACTS.concat(PLAYER_FACTS).forEach(t => addEmit(t, '(sim)'));

const texts = e => {   // [where, string]
  const out = [], T = e.text || {};
  Object.keys(T).forEach(k => [].concat(T[k]).forEach(s => out.push([k, s])));
  if (e.card) { out.push(['card.title', e.card.title]); out.push(['card.body', e.card.body]); if (e.card.short) out.push(['card.short', e.card.short]); }
  (e.outcomes || []).forEach((o, i) => { ['log', 'result'].forEach(k => [].concat(o[k] || []).forEach(s => out.push(['outcome' + i + '.' + k, s]))); if (o.card) { out.push(['outcome' + i + '.card', o.card.title]); out.push(['outcome' + i + '.card', o.card.body]); } });
  (e.options || []).forEach(o => { if (o.label) out.push(['option', o.label]); if (o.desc) out.push(['option', o.desc]); });
  return out;
};
function walkConds(list, fn) { (list || []).forEach(cd => { fn(cd); ['any', 'all'].forEach(k => cd[k] && walkConds(cd[k], fn)); if (cd.not) walkConds([cd.not], fn); }); }
const referencedChoice = {}, unlocked = {}, factUsed = {};
// 每个事件条件里绑定的史实名；choice 事件继承引用它的父事件的绑定（evChoose 把父事件的 ctx.F 带过来）
function ownBinds(e) {
  const b = new Set(['f', 'k']); const cs = [].concat(e.when || []); (e.outcomes || []).forEach(o => (o.when || []).forEach(c => cs.push(c)));
  walkConds(cs, cd => { ['fact', 'noFact'].forEach(k => { if (cd[k] && cd[k].as) b.add(cd[k].as); }); if (cd.bind) b.add(cd.bind.as); if (cd.calc) (CALC_BIND[cd.calc] || []).forEach(x => b.add(x)); });
  [].concat(e.pre || []).forEach(c => { const n = typeof c === 'string' ? c : c.calc; (CALC_BIND[n] || []).forEach(x => b.add(x)); });
  return b;
}
const parentBinds = {};
E.forEach(e => (e.options || []).forEach(o => { const pb = parentBinds[o.id] = parentBinds[o.id] || []; pb.push(ownBinds(e)); }));
E.forEach(e => {
  const id = e.id;
  const on = e.on || '';
  if (!(ONS.includes(on) || /^fact:[a-z_0-9]+$/.test(on))) ERR(id + ': 未知触发 on=' + on);
  if (on.startsWith('fact:')) { const t = on.slice(5); factUsed[t] = 1; if (!emitted[t]) ERR(id + ': 触发史实 ' + t + ' 没有任何来源'); }
  if (on === 'year' && !e.need) WARN(id + ': year 事件没有 need 预筛（每年对每个文明都要评估，较慢）');
  const binds = ownBinds(e);   // f = 触发史实
  if (e.on === 'choice' && parentBinds[e.id]) { const ps = parentBinds[e.id]; ps[0].forEach(x => { if (ps.every(q => q.has(x))) binds.add(x); }); }
  const allConds = [].concat(e.when || []);
  (e.mod || []).forEach(m => allConds.push(m.if));
  (e.outcomes || []).forEach(o => (o.mod || []).forEach(m => allConds.push(m.if)));
  (e.options || []).forEach(o => (o.when || []).forEach(c => allConds.push(c)));
  (e.outcomes || []).forEach(o => (o.when || []).forEach(c => allConds.push(c)));
  walkConds(allConds, cd => {
    const keys = Object.keys(cd).filter(k => !COND_AUX.includes(k));
    if (!keys.length || !keys.some(k => CONDS.includes(k))) ERR(id + ': 未知条件 ' + JSON.stringify(cd));
    ['fact', 'noFact'].forEach(k => { if (cd[k]) { [].concat(cd[k].type || []).forEach(t => { factUsed[t] = 1; if (!emitted[t]) ERR(id + ': 条件里的史实类型 ' + t + ' 没有任何来源'); }); if (cd[k].as) binds.add(cd[k].as); } });
    if (cd.bind) binds.add(cd.bind.as);
    if (cd.calc) { if (!CALCS.includes(cd.calc)) ERR(id + ': 未知 calc ' + cd.calc); (CALC_BIND[cd.calc] || []).forEach(b => binds.add(b)); }
    if (cd.pre) {}
  });
  [].concat(e.pre || []).forEach(c => { const n = typeof c === 'string' ? c : c.calc; if (n && !CALCS.includes(n)) ERR(id + ': 未知 pre calc ' + n); (CALC_BIND[n] || []).forEach(b => binds.add(b)); });
  const effs = [].concat(e.effects || []); (e.outcomes || []).forEach(o => (o.effects || []).forEach(x => effs.push(x)));
  effs.forEach(x => { if (!OPS.includes(x.op)) ERR(id + ': 未知操作符 ' + x.op); });
  const unl = [].concat(e.unlock || []); (e.outcomes || []).forEach(o => [].concat(o.unlock || []).forEach(x => unl.push(x)));
  unl.forEach(x => { const t = x.event || x; if (!byId[t]) ERR(id + ': unlock 指向不存在的事件 ' + t); else { unlocked[t] = (unlocked[t] || []).concat(id); if (byId[t].on !== 'pending') WARN(id + ': unlock 的目标 ' + t + ' 不是 pending 事件'); } });
  const fb = [].concat(e.forbid || []); (e.outcomes || []).forEach(o => [].concat(o.forbid || []).forEach(x => fb.push(x)));
  fb.forEach(x => { const t = x.event || x; if (!byId[t]) ERR(id + ': forbid 指向不存在的事件 ' + t); });
  (e.options || []).forEach(o => { if (!byId[o.id]) ERR(id + ': 选项指向不存在的事件 ' + o.id); else { referencedChoice[o.id] = 1; if (byId[o.id].on !== 'choice') ERR(id + ': 选项目标 ' + o.id + ' 不是 choice 事件'); } });
  if (on === 'choice' && !(e.outcomes || []).length) ERR(id + ': choice 事件没有 outcomes');
  (e.outcomes || []).forEach((o, i) => { if (o.p != null && (o.p < 0 || o.p > 1)) ERR(id + ': outcome' + i + ' 概率越界'); });
  // 文本槽位
  texts(e).forEach(([w, s]) => {
    if (typeof s !== 'string') { ERR(id + ': ' + w + ' 不是字符串'); return; }
    if ((s.match(/\[/g) || []).length !== (s.match(/\]/g) || []).length) ERR(id + ': ' + w + ' 方括号变体不配对');
    (s.match(/\{([^}]*)\}/g) || []).forEach(t => {
      const k = t.slice(1, -1);
      if (SLOTS.includes(k)) return;
      if (/^v\.[a-zA-Z0-9_]+$/.test(k)) return;
      const ps = k.split('.'), b = ps[0], rest = ps.slice(1).join('.');
      if (!rest || !FSUB.test(rest)) { ERR(id + ': ' + w + ' 无法解析的槽位 ' + t); return; }
      if (!binds.has(b)) ERR(id + ': ' + w + ' 槽位 ' + t + ' 引用了未绑定的史实「' + b + '」');
    });
    if (/星图/.test(s.replace(/星图之外/g, '')) && !/starmap|told|extract|map|demand/.test(id)) WARN(id + ': 文本提到「星图」，确认真的交出过星图：' + s.slice(0, 40));
  });
});
E.forEach(e => {
  if (e.on === 'pending' && !unlocked[e.id]) ERR(e.id + ': pending 事件没有任何 unlock 指向它（死事件）');
  if (e.on === 'choice' && !referencedChoice[e.id]) ERR(e.id + ': choice 事件没有被任何选项引用（死事件）');
});
// 终点史实：写入后没有事件再读取。RECORD 里的是「故意只作记录」（结局本身、或由代码读取），其余才需要补后续
const RECORD = { echo_gs2: '回响终章：以你命名的天文台本身就是结局', echo_gl3: '回响终章：武器或争论本身就是结局（两者互斥）', fleet_met: '报恩舰队见面后再无下文是故意的（400 年舰队冷却已由 cooldownGroup 处理）',
  pilgrim_met: '由 rel.pilgrim_scene / rel.return 的 noFact 读取', faith_met: '由 payoff.gratitude_fleet 的 noFact 读取', sealed_in: '命运「加入黑域」的结局本身（之后飞船不再行动）' };
const sinksAll = Object.keys(emitted).filter(t => !factUsed[t] && !SIM_FACTS.concat(PLAYER_FACTS).includes(t));
const sinks = sinksAll.filter(t => !RECORD[t]), records = sinksAll.filter(t => RECORD[t]);

// ---------- 2. 可达性：从根触发出发，沿 emit → fact 条件/触发、unlock、选项 传播 ----------
const ROOTS = new Set(SIM_FACTS.concat(PLAYER_FACTS));
const reach = new Set(), facts = new Set(ROOTS);
let changed = true;
const needsFacts = e => { const req = []; if ((e.on || '').startsWith('fact:')) req.push([e.on.slice(5)]); walkConds(e.when, cd => { if (cd.fact) req.push([].concat(cd.fact.type)); }); if (e.need) req.push([].concat(e.need)); return req; };
while (changed) {
  changed = false;
  E.forEach(e => {
    if (reach.has(e.id)) return;
    let ok = needsFacts(e).every(alts => alts.some(t => facts.has(t)));
    if (e.on === 'pending') ok = ok && (unlocked[e.id] || []).some(s => reach.has(s));
    if (e.on === 'choice') ok = ok && E.some(p => reach.has(p.id) && (p.options || []).some(o => o.id === e.id));
    if (ok) { reach.add(e.id); emitsOf(e).forEach(x => facts.add(x.type)); changed = true; }
  });
}
const unreachable = E.filter(e => !reach.has(e.id)).map(e => e.id);
unreachable.forEach(id => ERR(id + ': 静态不可达'));
// 链深度（静态）：沿 emit→读取 的最长路径
const depthMemo = {};
function depth(id, seen) {
  if (depthMemo[id] != null) return depthMemo[id]; if (seen.has(id)) return 0; seen.add(id);
  const e = byId[id], outs = new Set(); emitsOf(e).forEach(x => E.forEach(f => { if (needsFacts(f).some(a => a.includes(x.type))) outs.add(f.id); }));
  [].concat(e.unlock || []).forEach(x => outs.add(x.event || x)); (e.options || []).forEach(o => outs.add(o.id));
  let d = 0; outs.forEach(o => { if (byId[o]) d = Math.max(d, depth(o, seen)); }); seen.delete(id); return (depthMemo[id] = d + 1);
}
const maxStatic = Math.max.apply(null, E.map(e => depth(e.id, new Set())));

console.log('== 事件库：' + E.length + ' 个事件，' + Object.keys(emitted).length + ' 种史实；静态可达 ' + reach.size + '/' + E.length + '；最长静态链 ' + maxStatic + ' 层');
console.log('== 静态检查：' + errs.length + ' 个错误，' + warns.length + ' 个警告');
errs.forEach(x => console.log('  ERROR ' + x)); warns.forEach(x => console.log('  warn  ' + x));
console.log('  info  终点史实（写入后没有事件再读取，待补后续）' + sinks.length + ' 种：' + (sinks.join(' ') || '无'));
console.log('  info  标注为纯记录 ' + records.length + ' 种：' + records.map(t => t + '（' + RECORD[t] + '）').join('；'));
if (args.includes('--static')) process.exit(errs.length ? 1 : 0);

// ---------- 3. 覆盖率：5 种玩法 × N/5 个种子 ----------
const SIM = require('./simload')(path.join(ROOT, 'index.html'));
const N = args.includes('--n') ? +args[args.indexOf('--n') + 1] : 300;
const STYLES = ['tour', 'cautious', 'god', 'broadcast', 'sleeper'];
const fired = {}, perRunMax = {}, runsWith = {}; let runs = 0, maxChain = 0, chainSum = 0;
const allTexts = [], runRep = []; const styleStats = {};
const norm = t => t.replace(/「[^」]*」/g, 'X').replace(/[0-9]+(\.[0-9]+)?/g, 'N');
for (let k = 0; k < N; k++) {
  const style = STYLES[k % STYLES.length], seed = 'ev' + Math.floor(k / STYLES.length) + style[0];
  let rs = 1 + k * 7919; const r = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  const u = SIM.createUniverse(seed); SIM.remember(u, 0);
  if (SIM.chooseDestiny) SIM.chooseDestiny(u, ['zero', 'singer', 'earth', 'domain'][k % 4]);   // 命运不消耗随机数；只有「加入黑域」会解锁一个选项
  for (let i = 0; i < 12 && !u.ship.dead; i++) {
    let res;
    if (style === 'sleeper' && i % 3 === 2) res = SIM.hibernate(u, [300, 500, 1000][i % 3]);
    else {
      const here = u.ship.at; let c = u.systems.filter(s => s.id !== here && s.owner != null && !u.civs[s.owner].blackDomain);
      if (style === 'god') { const lo = c.filter(s => u.civs[s.owner].tech < 45); if (lo.length) c = lo; }
      if (!c.length || r() < 0.25) c = u.systems.filter(s => s.id !== here);
      if (style === 'tour' && i % 4 === 3 && r() < 0.5) c = u.systems.filter(s => s.id === 0 && s.id !== here).concat(c).slice(0, 1);
      const d = c[Math.floor(r() * c.length)];
      res = SIM.travel(u, d.id, style === 'cautious' ? (i % 2 ? '0.03' : 'w0.99') : ['w0.999', 'w0.9999', 'w0.99999'][i % 3]);
    }
    const rep = res.report, En = rep.encounter; if (rep.death || !En) break;
    let opts = En.options.filter(o => o.id !== '离开' && o.id !== '广播坐标');
    let pick = null;
    const evo = opts.filter(o => o.id[0] === '@');
    if (style === 'broadcast' && r() < 0.5) pick = '广播坐标';
    else if (style === 'cautious') pick = (opts.find(o => /观察|讲述|求教|补给/.test(o.id)) || {}).id || (evo.length && r() < 0.7 ? evo[0].id : null);
    else if (style === 'god') pick = (opts.find(o => /假扮神明|降临|大量技术|少量技术/.test(o.id)) || (evo.length ? evo[Math.floor(r() * evo.length)] : opts[Math.floor(r() * opts.length)]) || {}).id;
    else if (evo.length && r() < 0.6) pick = evo[Math.floor(r() * evo.length)].id;
    else if (opts.length) pick = opts[Math.floor(r() * opts.length)].id;
    if (pick) SIM.interact(u, rep.sysId, pick);
  }
  SIM.simulateTo(u, u.time + 500);
  runs++;
  const cnt = {}; Object.keys(u.evCount || {}).forEach(id => { const b = id.replace(/#\d+$/, ''); cnt[b] = (cnt[b] || 0) + u.evCount[id]; });
  const st = styleStats[style] = styleStats[style] || { runs: 0, ev: 0 }; st.runs++;
  Object.keys(cnt).forEach(id => { fired[id] = (fired[id] || 0) + cnt[id]; runsWith[id] = (runsWith[id] || 0) + 1; perRunMax[id] = Math.max(perRunMax[id] || 0, cnt[id]); st.ev += cnt[id]; });
  // 史实因果链深度（cause 指针）
  const dmemo = {}; const fd = f => f.cause == null || !u.facts[f.cause] ? 1 : (dmemo[f.id] != null ? dmemo[f.id] : (dmemo[f.id] = 1 + fd(u.facts[f.cause])));
  let md = 0; u.facts.forEach(f => { md = Math.max(md, fd(f)); }); maxChain = Math.max(maxChain, md); chainSum += md;
  const seen = new Set(), mine = []; u.systems.forEach(s => s.timeline.forEach(e => { if (e.you && !seen.has(e.y + e.t)) { seen.add(e.y + e.t); mine.push(e.t); } }));
  (u.cards || []).forEach(c => mine.push(c.title + '：' + (c.t || c.body || '')));
  mine.forEach(t => allTexts.push(t));
  if (mine.length >= 2) { const TT = new Set(mine.map(norm)); runRep.push(1 - TT.size / mine.length); }
}
// 故意稀有：前置本身就很长（长局 / 选了命运 / 多步链），300 局 × 12 站不出现不算问题；用 tools/findtale 一类的定向玩法能见到
const RARE = { 'card.lowdim': '宇宙降维 15 次，只在很长的局里出现', 'destiny.domain': '只有选了命运「加入黑域」、凝视过二维画、遇到科技≥100 的友好文明才出现', 'destiny.seal': '同上',
  'echo.mediated.memorial': '调停成功（本身就少）30 年后', 'rel.stop_war': '要有以你为名的圣战，并且你回访', 'rel.expose': '回访假先知场景时二选一', 'rel.endorse': '同上' };
const neverAll = E.filter(e => !fired[e.id]).map(e => e.id), never = neverAll.filter(id => !RARE[id]), rareNever = neverAll.filter(id => RARE[id]);
const noisy = Object.keys(perRunMax).filter(id => perRunMax[id] > 5 && !(byId[id] && byId[id].nocap)).map(id => id + '(单局最多 ' + perRunMax[id] + ')');
const T = new Set(allTexts.map(norm)); const rep = 1 - T.size / Math.max(1, allTexts.length);
console.log('\n== 覆盖率：' + runs + ' 局（' + STYLES.join(' / ') + '，每局 12 站 + 再推 500 年）');
console.log('  触发过的事件 ' + (E.length - never.length) + '/' + E.length + '（' + (100 * (E.length - never.length) / E.length).toFixed(0) + '%）；事件触发总数 ' + Object.values(fired).reduce((a, b) => a + b, 0) + '，每局 ' + (Object.values(fired).reduce((a, b) => a + b, 0) / runs).toFixed(1));
Object.keys(styleStats).forEach(s => console.log('    ' + s + '：每局 ' + (styleStats[s].ev / styleStats[s].runs).toFixed(1) + ' 次事件'));
console.log('  史实因果链：单局最深 ' + maxChain + ' 层，平均最深 ' + (chainSum / runs).toFixed(1) + ' 层');
console.log('  从未触发（' + never.length + '）：' + (never.join(', ') || '无'));
console.log('  故意稀有、本次未出现（' + rareNever.length + '）：' + (rareNever.map(id => id + '（' + RARE[id] + '）').join('；') || '无'));
console.log('  单局触发 >5 次（' + noisy.length + '）：' + (noisy.join(', ') || '无'));
console.log('  文本重复度（回响+卡片，去专名和数字后）：单局内 ' + (100 * runRep.reduce((a, b) => a + b, 0) / Math.max(1, runRep.length)).toFixed(1) + '%（同一局里读到同一句模板的比例）；跨 ' + runs + ' 局共 ' + allTexts.length + ' 条 / ' + T.size + ' 种不同句子');
const top = Object.entries(fired).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => id + ' ' + n);
console.log('  最常触发：' + top.join('，'));
process.exit(errs.length ? 1 : 0);
