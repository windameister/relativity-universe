/* 生成文件：由 game/build.py 从 prototype/index.html 抽取，不要手改。 */

/* =====================================================================
 *  相对论宇宙 · 模拟内核（纯逻辑，不碰 DOM，可在 node 里单独跑）
 *
 *  时间：所有文明演化都在「星系静止系」的坐标时里按年推进。
 *        玩家飞行时不实时模拟，抵达时把经过的外部年份一次性推完（惰性求值）。
 *
 *  每个文明只有几个数：
 *    pop   人口（亿）
 *    tech  科技（0~100+；8 农耕 / 20 工业 / 35 信息 / 55 星际 / 75 星海）
 *    res   资源储备（缓冲）
 *    exp   扩张欲（0~1，性格，基本不变）
 *    stab  稳定度（0~1）
 *
 *  每年的差分规则（带随机项）：
 *    1) 承载力 K = Σ(所辖星系丰度 × (0.3 + tech/12))      —— 科技抬高承载力
 *    2) 人口 pop += pop·r·(f − f*)，f = K/pop；f* = 1.2 − 0.6·exp
 *       扩张欲强的文明会把人口推到超过承载力（f* < 1）→ 资源吃紧
 *    3) 资源 res += 0.05·(K − pop)，下限 0，上限 3K
 *    4) 稳定度向目标值回归：目标 = 0.75 − 3.5·压力（资源耗尽且 f<1 时有压力）
 *       + 随机扰动 − 战争损耗 + 贸易加成
 *    5) 科技 tech += 0.05·stab·(0.4+min(res/K,1.5))·(1+tech/60)·贸易倍率
 *       —— 资源 + 稳定驱动科技；稳定度 < 0.2 时科技倒退
 *    6) 稳定度 < 0.15 时可能爆发危机：内战分裂 / 革命倒退（改名）/ 人口太少则灭绝
 *    7) 随机事件：瘟疫、技术突破、黄金时代；全局小概率超新星
 *    8) tech ≥ 55 解锁星际殖民：按扩张欲向射程内最近的空星系扩张
 *    9) 探测：tech ≥ 40 开始能「听到」附近文明；双方都能听到 → 接触：
 *       按两边扩张欲决定 贸易/交流 还是 战争；战争中强者夺取弱者星系
 *   10) 黑暗森林：tech ≥ 75 的文明，若探测到科技落后 ≥ 8 的文明，
 *       每年有小概率直接抹除对方一个星系（暴露度越高越危险）
 *   11) 空的宜居星系每年有极小概率诞生新文明（从石器时代开始）
 * ===================================================================== */
var SIM = (function () {
  'use strict';
  // ---------- 随机数（可序列化状态，保证同一种子 + 同样操作 = 同样历史） ----------
  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rnd(u) {
    var t = u.rs = (u.rs + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function R(u, a, b) { return a + (b - a) * rnd(u); }
  function pick(u, arr) { return arr[Math.floor(rnd(u) * arr.length)]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function yr(y) { return '纪元 ' + Math.floor(y) + ' 年'; }
  // ---------- 确定性数学 ----------
  // Math.exp / pow / sin / cos / hypot 在不同 JS 引擎（Node 与 Chrome）里末位可能不同，
  // 而模拟是混沌的，末位差异几百年后就会变成完全不同的历史。这里只用 IEEE 精确的 + − × ÷ 和 sqrt。
  var DM = (function () {
    var LN2 = 0.6931471805599453, PI = 3.141592653589793;
    function pow2(k) { var v = 1, b = k < 0 ? 0.5 : 2, n = k < 0 ? -k : k; while (n) { if (n & 1) v *= b; b *= b; n >>= 1; } return v; }
    function exp(x) {
      if (x !== x) return x; if (x > 700) x = 700; if (x < -700) return 0;
      var k = Math.round(x / LN2), r = x - k * LN2, s = 1, t = 1;
      for (var i = 1; i <= 18; i++) { t = t * r / i; s += t; }
      return s * pow2(k);
    }
    function log(x) {
      if (!(x > 0)) return -Infinity; var k = 0;
      while (x >= 2) { x /= 2; k++; } while (x < 1) { x *= 2; k--; }
      var y = (x - 1) / (x + 1), y2 = y * y, s = 0, t = y;
      for (var i = 1; i < 80; i += 2) { s += t / i; t *= y2; }
      return 2 * s + k * LN2;
    }
    function pow(a, b) { if (a === 0) return 0; if (b === 0) return 1; return exp(b * log(a)); }
    function sin(x) { x = x - Math.round(x / (2 * PI)) * 2 * PI; var s = 0, t = x; for (var i = 1; i < 40; i += 2) { s += t; t = -t * x * x / ((i + 1) * (i + 2)); } return s; }
    function cos(x) { return sin(x + PI / 2); }
    function hyp(a, b) { return Math.sqrt(a * a + b * b); }
    return { exp: exp, log: log, pow: pow, sin: sin, cos: cos, hyp: hyp, PI: PI };
  })();

  // ---------- 名字 ----------
  var STAR_A = ['天枢','天璇','玄戈','紫微','北落','南河','辰极','参商','心宿','角宿','轩辕','太微','织女','河鼓','天津','螣蛇','钩陈','少微','天船','阁道','奎宿','娄宿','胃宿','昴宿','毕宿','井宿','鬼宿','柳宿','翼宿','轸宿','天狼','老人','天苑','水委','天鹤','孔雀','天棓','贯索','七公','天市'];
  var NUM = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
  var SYL = ['赫','兰','奥','弥','瑟','卡','伊','洛','萨','澜','珀','纳','缇','霁','岚','埃','索','维','塔','库','穆','泽','琉','荻','砂','汐','烛','曜',
    '骁','鸠','梵','翡','戈','蒙','乌','雅','铎','黎','岐','莫','苏','忒','玛','蘅','茵','诺','柯','巴','祁','渥','霍','莎','图','欧','琅','珂','颉','崆',
    '弗','麦','亚','蕾','笛','犀','玄','绯','裘','冥','葵','芮','觅','焰','凛'];
  // 同一个宇宙里，每个音节只用一次，首字也不重复，让文明的名字一眼就能分开
  function newRoot(u) {
    u.usedSyl = u.usedSyl || {};
    for (var tries = 0; tries < 60; tries++) {
      var a = pick(u, SYL), b = pick(u, SYL);
      if (a === b || u.usedSyl[a] || u.usedSyl[b]) continue;
      u.usedSyl[a] = 1; u.usedSyl[b] = 1; return a + b;
    }
    return pick(u, SYL) + pick(u, SYL) + pick(u, SYL);
  }
  var TEMPERS = ['学者', '官僚', '收藏家', '商人', '冷漠', '好战'];
  var COLORS = ['#ff7a59','#4fd1c5','#f6c945','#b388ff','#ff5fa2','#7dd87d','#5aa9ff','#ffa94d','#e07bff','#9be15d','#ff8f8f','#62e0ff'];

  function civForm(root, tech, u) {
    if (tech < 8) return root + pick(u, ['部族','人','氏族']);
    if (tech < 20) return root + pick(u, ['王国','城邦','王朝']);
    if (tech < 35) return root + pick(u, ['帝国','王国','联合王国']);
    if (tech < 55) return root + pick(u, ['联邦','共和国','联合政府']);
    return root + pick(u, ['星盟','共同体','议会','星际联合体']);
  }
  function eraOf(tech) {
    if (tech < 8) return '石器'; if (tech < 20) return '农耕'; if (tech < 35) return '工业';
    if (tech < 55) return '信息'; if (tech < 75) return '星际'; return '星海';
  }
  var ERA_RANK = { '石器': 0, '农耕': 1, '工业': 2, '信息': 3, '星际': 4, '星海': 5 };
  // 科技增速：越往上越快（知识复利），进入星际后逐渐放缓（物理极限）
  function techGain(t) { return t < 55 ? 1 + t / 60 : 1.92 * DM.exp(-(t - 55) / 16) * (t > 110 ? DM.exp(-(t - 110) / 8) : 1); }
  function eraLabel(c) {
    if (!c || !c.alive) return '灭绝';
    var e = c.era || eraOf(c.tech);
    if (c.stab < 0.25 || c.tech < c.peakTech - 6) e += '·衰落';
    return e;
  }

  // ---------- 星系生成 ----------
  var TYPES = [ // 类型, 权重, 颜色, 半径, 宜居概率
    ['M', 33, '#ff9c6b', 2.2, 0.12], ['K', 22, '#ffc78a', 2.6, 0.55], ['G', 15, '#fff1b0', 3.0, 0.7],
    ['F', 10, '#fdfbe8', 3.2, 0.45], ['A', 7, '#d4e4ff', 3.6, 0.08], ['B', 4, '#a9c8ff', 4.2, 0], ['O', 1.5, '#8fb3ff', 5, 0],
    ['白矮星', 4, '#e8f0ff', 1.6, 0], ['中子星', 1.5, '#c0f0ff', 1.6, 0], ['黑洞', 1, '#000000', 4, 0]];
  function pickType(u) {
    var tot = 0; TYPES.forEach(function (t) { tot += t[1]; });
    var x = rnd(u) * tot;
    for (var i = 0; i < TYPES.length; i++) { x -= TYPES[i][1]; if (x <= 0) return TYPES[i]; }
    return TYPES[0];
  }
  function typeInfo(name) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === name) return TYPES[i]; return TYPES[0]; }

  function createUniverse(seedStr) {
    var u = { seed: String(seedStr), rs: hashSeed(String(seedStr)), time: 0, simYear: 0, systems: [], civs: [], rel: {}, D: [],
      ship: { at: 0, shipYears: 0, bio: 0, crewAge0: 30, tech: 60, trips: [], events: [], dead: null, cosmicSeen: 0, supply: 100, flags: {}, goals: {}, mission: null, echoSeen: {},
        name: SHIP_NAMES[hashSeed(String(seedStr) + '舰') % SHIP_NAMES.length] }, memory: {}, nebulae: [],
      strikes: [], flats: [], flashes: [], dimStrikes: 0, dimLog: [], cosmicEvents: [], cosmicFlags: {}, singer: null,
      facts: [], fType: {}, fWho: {}, fWhoT: {}, evForbid: {}, evDone: {}, evLast: {}, evGroup: {}, evCount: {}, evLastVar: {}, echoRecent: [], pend: [], cards: [] };
    if (!EV.loaded) throw new Error('事件库未加载：浏览器里需要 id 为 events 的 JSON 脚本块，Node 里先调用 SIM.loadEvents()');
    var n = 22 + Math.floor(rnd(u) * 8);
    var usedNames = {};
    // 两条带状悬臂 + 随机散点，近似银盘局部的星团结构
    var armAngle = R(u, 0, DM.PI);
    var tries = 0;
    while (u.systems.length < n && tries < 5000) {
      tries++;
      var x, y;
      if (rnd(u) < 0.7) {
        var t = R(u, -110, 110), off = (rnd(u) + rnd(u) - 1) * 28 + (rnd(u) < 0.5 ? -35 : 35) * (rnd(u) < 0.5 ? 1 : 0);
        x = 100 + DM.cos(armAngle) * t - DM.sin(armAngle) * off;
        y = 100 + DM.sin(armAngle) * t + DM.cos(armAngle) * off;
      } else { x = R(u, 8, 192); y = R(u, 8, 192); }
      if (x < 6 || x > 194 || y < 6 || y > 194) continue;
      var ok = true;
      for (var i = 0; i < u.systems.length; i++) { var s0 = u.systems[i]; if (DM.hyp(s0.x - x, s0.y - y) < 13) { ok = false; break; } }
      if (!ok) continue;
      var ty = u.systems.length === 0 ? typeInfo('G') : pickType(u);
      var nm; do { nm = pick(u, STAR_A) + pick(u, NUM); } while (usedNames[nm]); usedNames[nm] = 1;
      if (u.systems.length === 0) nm = '太阳';
      u.systems.push({ id: u.systems.length, name: nm, x: x, y: y, type: ty[0], habitable: u.systems.length === 0 || rnd(u) < ty[4],
        rich: u.systems.length === 0 ? 1.1 : R(u, 0.5, 1.8), owner: null, exposure: 0, dead: false, timeline: [], stateLog: [], ruins: [] });
    }
    // 保证至少一个黑洞
    if (!u.systems.some(function (s) { return s.type === '黑洞'; })) {
      var far = u.systems.slice(1).sort(function (a, b) { return DM.hyp(b.x - u.systems[0].x, b.y - u.systems[0].y) - DM.hyp(a.x - u.systems[0].x, a.y - u.systems[0].y); })[0];
      far.type = '黑洞'; far.habitable = false;
    }
    for (var k = 0; k < 4; k++) u.nebulae.push({ x: R(u, 0, 200), y: R(u, 0, 200), r: R(u, 18, 45), hue: Math.floor(R(u, 180, 330)) });
    for (var a = 0; a < u.systems.length; a++) { u.D[a] = []; for (var b = 0; b < u.systems.length; b++) u.D[a][b] = DM.hyp(u.systems[a].x - u.systems[b].x, u.systems[a].y - u.systems[b].y); }

    // 初始文明：地球 + 2~4 个外星文明
    var earth = createCiv(u, 0, 50, '地球', '地球文明');
    earth.exp = 0.55;
    var nAlien = 2 + Math.floor(rnd(u) * 3);
    var cands = u.systems.filter(function (s) { return s.habitable && s.id !== 0; });
    for (var q = cands.length - 1; q > 0; q--) { var j = Math.floor(rnd(u) * (q + 1)), tq = cands[q]; cands[q] = cands[j]; cands[j] = tq; }   // Fisher–Yates：随机比较器的 sort 在不同引擎里调用次数不同
    var techs = [R(u, 1, 6), R(u, 10, 30), R(u, 50, 60), R(u, 28, 48), R(u, 2, 15)];
    for (var c = 0; c < nAlien && c < cands.length; c++) createCiv(u, cands[c].id, techs[c]);
    // 歌者的清理者：在星图之外巡航（距图心 130~170 光年）
    var sa = R(u, 0, DM.PI * 2), sr = R(u, 130, 170);
    u.singer = { name: '歌者', x: 100 + DM.cos(sa) * sr, y: 100 + DM.sin(sa) * sr, tech: 150 };
    u.systems.forEach(function (s) { pushState(u, s); });
    return u;
  }

  function createCiv(u, sysId, tech, root, name) {
    root = root || newRoot(u);
    var c = { id: u.civs.length, root: root, name: name || civForm(root, tech, u), color: COLORS[u.civs.length % COLORS.length], home: sysId,
      pop: 0.05 + tech * 0.12 * R(u, 0.7, 1.2), tech: tech, peakTech: tech, res: 1, exp: R(u, 0.1, 0.95), stab: R(u, 0.5, 0.8),
      alive: true, born: u.simYear, era: eraOf(tech), legends: [], att: null, attYear: 0, tag: null, giftYear: null, interstellarYear: tech >= 55 ? u.simYear : null,
      endYear: null, endCause: null, formerNames: [], legacy: [] };
    c.temper = root === '地球' ? '学者' : TEMPERS[hashSeed(root + c.id) % TEMPERS.length];
    u.civs.push(c);
    var s = u.systems[sysId]; s.owner = c.id;
    c.res = cap(u, c);
    if (u.simYear > 0) { logSys(u, s, '一个新的智慧物种在这里诞生了：「' + c.name + '」（' + c.era + '时代）。', 3); pushState(u, s); }
    return c;
  }
  function ownedSystems(u, c) { return u.systems.filter(function (s) { return s.owner === c.id; }); }
  function cap(u, c) { var k = 0; u.systems.forEach(function (s) { if (s.owner === c.id && !s.dead) k += s.rich * (0.3 + c.tech / 12); }); return Math.max(k, 0.01); }
  function logSys(u, s, text, imp) { s.timeline.push({ y: u.simYear, t: text, imp: imp || 1 }); }
  function logCiv(u, c, text, imp) { u.systems.forEach(function (s) { if (s.owner === c.id) logSys(u, s, text, imp); }); }
  function pushState(u, s) {
    var c = s.owner != null ? u.civs[s.owner] : null;
    s.stateLog.push({ y: u.simYear, owner: s.owner, name: c ? c.name : null, era: c ? eraLabel(c) : null, dead: s.dead, type: s.type, flat: !!s.flat, sealed: !!(c && c.blackDomain) });
  }
  function pushCivState(u, c) { u.systems.forEach(function (s) { if (s.owner === c.id) pushState(u, s); }); }
  // 某一年「看起来」的样子（光延迟观测用）
  function stateAt(s, y) {
    var log = s.stateLog, best = log[0];
    for (var i = 0; i < log.length; i++) { if (log[i].y <= y) best = log[i]; else break; }
    return best;
  }
  function relKey(a, b) { return a < b ? a + '-' + b : b + '-' + a; }

  function extinguish(u, c, cause) {
    if (!c.alive) return;
    c.alive = false; c.endYear = u.simYear; c.endCause = cause;
    u.systems.forEach(function (s) {
      if (s.owner === c.id) { s.owner = null; s.ruins.push(c.name); (s.ruinTech = s.ruinTech || []).push(c.peakTech); logSys(u, s, '「' + c.name + '」灭绝了（' + cause + '）。只剩下废墟。', 3); pushState(u, s); }
    });
    if (u.facts) addFact(u, 'extinct', { sys: c.home, target: ck(c), data: { cause: cause, name: c.name } });
  }
  function rename(u, c, newName, why) {
    c.formerNames.push(c.name);
    var old = c.name; c.name = newName;
    logCiv(u, c, why + '「' + old + '」从此改称「' + newName + '」。', 2);
    pushCivState(u, c);
  }

  /* =====================================================================
   *  事件库引擎（第 1 阶段，见 EVENT_LIBRARY_DESIGN.md）
   *  史实库 u.facts：谁在何时何地对谁做了什么（只追加）。「谁知道」一律按光延迟：
   *    观察者在 O、史实发生在 S 的 y 年 → now ≥ y + D[S][O] 才可见；当事方立即知道。
   *  事件写在 <script type="application/json" id="events"> 里，引擎只认一组封闭的条件 / 操作符。
   *  掷骰用独立随机流 hash(seed, 事件id, 主体, 年份)，不消耗 u.rs：纯文本事件不会改变物理史。
   * ===================================================================== */
  var EV = { list: [], byId: {}, byOn: {}, version: 0, loaded: false };
  var EV_CONDS = ['fact', 'noFact', 'stat', 'temper', 'earth', 'alive', 'rel', 'any', 'all', 'not', 'since', 'flag', 'noflag', 'homeSeen', 'shipKnows', 'near', 'here', 'tier', 'scene', 'diaspora', 'reach'];
  var EV_OPS = ['add', 'set', 'expo', 'imprint', 'ship', 'rel', 'strike', 'protect', 'refugees', 'forbid', 'leak', 'pass', 'silence', 'evacuate', 'hunt', 'seal'];
  function loadEvents(data) {
    var list = data.events || data;
    EV.list = []; EV.byId = {}; EV.byOn = {}; EV.version = data.version || 1;
    list.forEach(function (e) { EV.list.push(e); EV.byId[e.id] = e; (EV.byOn[e.on] = EV.byOn[e.on] || []).push(e); });
    for (var k in EV.byOn) EV.byOn[k].sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    EV.loaded = true;
    return EV.list.length;
  }
  if (typeof document !== 'undefined' && document.getElementById) { var evEl = document.getElementById('events'); if (evEl) loadEvents(JSON.parse(evEl.textContent)); }

  // 独立随机流：同一事件、同一主体、同一年，永远掷出同一个数
  function hrand(u, a, b, c) { return hashSeed(u.seed + '|' + a + '|' + b + '|' + c) / 4294967296; }
  // 纯文本变体：不消耗 u.rs（「继续 / 离开」等 UI 操作不能改变历史）
  function tpick(u, key, arr) { return arr[Math.floor(hrand(u, 'txt', key, Math.floor(u.time * 10)) * arr.length)]; }

  function ck(c) { return 'civ:' + c.id; }
  function civOf(u, key) { if (!key || typeof key !== 'string' || key.slice(0, 4) !== 'civ:') return null; return u.civs[+key.slice(4)] || null; }
  function lineage(u, c) {
    if (!c) return [];
    if (c._lin) return c._lin;
    var out = [], k = 0, x = c;
    // 后裔只继承分家之前的历史：祖先第 i 层的史实只算到第 i−1 层诞生（分家）的那一年
    var cut = [], lim = Infinity;
    while (x && k++ < 50) { out.push('civ:' + x.id); cut.push(lim); if (x.born != null && x.parent != null) lim = Math.min(lim, x.born); x = x.parent != null ? u.civs[x.parent] : null; }
    Object.defineProperty(c, '_lin', { value: out, enumerable: false });   // 不进 JSON（确定性比对用）
    Object.defineProperty(c, '_linCut', { value: cut, enumerable: false });
    return out;
  }
  function addFact(u, type, o) {
    o = o || {};
    var f = { id: u.facts.length, y: o.y != null ? o.y : u.simYear, sys: o.sys != null ? o.sys : null, type: type, actor: o.actor || null, target: o.target || null,
      tags: o.tags || [], data: o.data || {}, cause: o.cause != null ? o.cause : null, vis: o.vis || 'local' };
    u.facts.push(f);
    (u.fType[type] = u.fType[type] || []).push(f);
    [f.actor, f.target].forEach(function (k) { if (k) { (u.fWho[k] = u.fWho[k] || []).push(f); (u.fWhoT[k] = u.fWhoT[k] || {})[type] = 1; } });
    if ((u.evDepth || 0) < 4) { u.evDepth = (u.evDepth || 0) + 1; evFire(u, 'fact:' + type, f); u.evDepth--; }
    return f;
  }
  function civHasType(u, c, types) {
    var lin = lineage(u, c);
    for (var i = 0; i < lin.length; i++) { var T = u.fWhoT[lin[i]]; if (!T) continue; for (var j = 0; j < types.length; j++) if (T[types[j]]) return true; }
    return false;
  }
  function civDist(u, c, sysId) {
    var d = 1e9; u.systems.forEach(function (s) { if (s.owner === c.id) d = Math.min(d, u.D[s.id][sysId]); });
    return d < 1e9 ? d : u.D[c.home][sysId];
  }
  function civKnows(u, c, f, now) {
    if (f.vis === 'cosmic' || f.sys == null) return true;
    var lin = lineage(u, c);
    if (lin.indexOf(f.actor) >= 0 || lin.indexOf(f.target) >= 0) return true;
    return now + 1e-6 >= f.y + civDist(u, c, f.sys);
  }
  function shipKnows(u, f) {
    if (f.vis === 'cosmic' || f.sys == null || f.actor === 'ship') return true;
    return u.time + 1e-6 >= f.y + u.D[f.sys][u.ship.at];
  }
  function nowOf(u) { return u.simYear; }

  // ---------- 条件 ----------
  function evKey(u, v, ctx) {
    if (v === '$c') return ctx.c ? ck(ctx.c) : null;
    if (v === '$o') return ctx.o ? ck(ctx.o) : null;
    if (v === 'home') { var h = homeCiv(u); return h ? ck(h) : null; }
    if (v === 'spawned') return ctx.spawned ? ck(ctx.spawned) : null;
    if (v && v.charAt(0) === '@') { var F = ctx.F[v.slice(1)]; return F ? (F.target || null) : null; }   // @名字 = 已绑定史实的客体
    return v;
  }
  function factQuery(u, q, ctx) {
    var types = q.type ? (typeof q.type === 'string' ? [q.type] : q.type) : null, inherit = q.inherit !== false;
    var tk = q.target != null ? evKey(u, q.target, ctx) : undefined, ak = q.actor != null ? evKey(u, q.actor, ctx) : undefined;
    if (tk === null || ak === null) return [];
    var tl = tk ? (inherit && civOf(u, tk) ? lineage(u, civOf(u, tk)) : [tk]) : null, tcut = tl && tl.length > 1 ? civOf(u, tk)._linCut : null;
    var al = ak ? (inherit && civOf(u, ak) ? lineage(u, civOf(u, ak)) : [ak]) : null, acut = al && al.length > 1 ? civOf(u, ak)._linCut : null;
    var pool = [];
    if (tl) tl.forEach(function (k) { pool = pool.concat(u.fWho[k] || []); });
    else if (al) al.forEach(function (k) { pool = pool.concat(u.fWho[k] || []); });
    else if (types) types.forEach(function (t) { pool = pool.concat(u.fType[t] || []); });
    else pool = u.facts;
    var now = ctx.now, known = q.known || (ctx.c ? '$c' : 'any'), seen = {}, out = [];
    pool.forEach(function (f) {
      if (seen[f.id]) return; seen[f.id] = 1;
      if (types && types.indexOf(f.type) < 0) return;
      if (tl) { var ti = tl.indexOf(f.target); if (ti < 0 || (tcut && f.y > tcut[ti] + 1e-6)) return; }
      if (al) { var ai = al.indexOf(f.actor); if (ai < 0 || (acut && f.y > acut[ai] + 1e-6)) return; }
      if (q.tag && f.tags.indexOf(q.tag) < 0) return;
      if (q.notTag && f.tags.indexOf(q.notTag) >= 0) return;
      if (f.y > now + 1e-6) return;
      if (q.minAge != null && now - f.y < q.minAge) return;
      if (q.maxAge != null && now - f.y > q.maxAge) return;
      if (q.data) { for (var k in q.data) if (f.data[k] !== q.data[k]) return; }
      if (known === '$c' && ctx.c && !civKnows(u, ctx.c, f, now)) return;
      if (known === '$o' && ctx.o && !civKnows(u, ctx.o, f, now)) return;
      if (known === 'ship' && !shipKnows(u, f)) return;
      out.push(f);
    });
    out.sort(function (a, b) { return a.id - b.id; });
    return out;
  }
  function evPath(u, p, ctx) {
    var parts = p.split('.'), root = parts[0], v;
    if (root === 'c') v = ctx.c; else if (root === 'o') v = ctx.o; else if (root === 'ship') v = u.ship; else if (root === 'u') v = u;
    else if (root === 'att') return ctx.c ? attOf(u, ctx.c) : 0;
    else if (root === 'v') v = ctx.v;
    else if (ctx.F[root]) v = ctx.F[root];
    else return undefined;
    for (var i = 1; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function homeSeenState(u) {
    var h = u.systems[0], sy = u.time - u.D[u.ship.at][0], st = stateAt(h, sy), hc = st.owner != null ? u.civs[st.owner] : null;
    return { sy: sy, st: st, hc: hc, kind: st.flat ? 'flat' : hc && !isEarthLine(u, hc) ? 'lost' : !hc && sy > 0 ? 'dead' : 'ok' };
  }
  function evCond(u, cd, ctx) {
    if (cd.fact) { var m = factQuery(u, cd.fact, ctx); if (!m.length) return false; if (cd.fact.as) ctx.F[cd.fact.as] = cd.fact.first ? m[0] : m[m.length - 1]; return true; }
    if (cd.noFact) return factQuery(u, cd.noFact, ctx).length === 0;
    if (cd.stat) {
      var x = evPath(u, cd.stat, ctx); if (x == null) x = 0;
      if (cd.gte != null && !(x >= cd.gte)) return false; if (cd.lte != null && !(x <= cd.lte)) return false;
      if (cd.gt != null && !(x > cd.gt)) return false; if (cd.lt != null && !(x < cd.lt)) return false;
      if (cd.eq != null && x !== cd.eq) return false; if (cd.ne != null && x === cd.ne) return false;
      return true;
    }
    if (cd.temper) return !!ctx.c && cd.temper.indexOf(ctx.c.temper) >= 0;
    if (cd.earth) { var w = cd.earth === '$o' ? ctx.o : ctx.c; return !!w && isEarthLine(u, w) === (cd.is !== false); }
    if (cd.alive) { var a = cd.alive === '$o' ? ctx.o : cd.alive === 'home' ? homeCiv(u) : ctx.c; return !!(a && a.alive && !a.blackDomain); }
    if (cd.rel) {
      var b = cd.rel['with'] === 'home' ? homeCiv(u) : ctx.o; if (!b || !ctx.c || b === ctx.c) return false;
      var r = u.rel[relKey(ctx.c.id, b.id)]; return !!r && (!cd.rel.type || cd.rel.type === r.type);
    }
    if (cd.any) return cd.any.some(function (q) { return evCond(u, q, ctx); });
    if (cd.all) return cd.all.every(function (q) { return evCond(u, q, ctx); });
    if (cd.not) return !evCond(u, cd.not, ctx);
    if (cd.since) { var F = ctx.F[cd.since.as]; if (!F) return false; var dt = ctx.now - F.y; return (cd.since.min == null || dt >= cd.since.min) && (cd.since.max == null || dt <= cd.since.max); }
    if (cd.flag) return !!evPath(u, cd.flag, ctx);
    if (cd.noflag) return !evPath(u, cd.noflag, ctx);
    if (cd.homeSeen) return homeSeenState(u).kind === cd.homeSeen;
    if (cd.shipKnows) { var G = ctx.F[cd.shipKnows]; return !!G && shipKnows(u, G); }
    if (cd.near) return !!ctx.c && civDist(u, ctx.c, u.ship.at) <= cd.near;
    if (cd.here != null) return !!ctx.c && (u.systems[u.ship.at].owner === ctx.c.id) === !!cd.here;
    if (cd.tier) return !!ctx.c && cd.tier.indexOf(tierOf(u, ctx.c)) >= 0;
    if (cd.scene) return cd.scene.indexOf(ctx.scene) >= 0;
    if (cd.diaspora != null) return !!ctx.c && !!(ctx.c.diaspora || ctx.c.refugee) === !!cd.diaspora;
    // 物理可达：史实 as 发生后，以 speed（c 的倍数）从发出地飞到飞船所在星系
    if (cd.atWar) { if (!ctx.c) return false; for (var rk in u.rel) { var rr = u.rel[rk], ps = rk.split('-'); if (rr.type === '战争' && (+ps[0] === ctx.c.id || +ps[1] === ctx.c.id)) { var oc = u.civs[+ps[0] === ctx.c.id ? +ps[1] : +ps[0]]; if (oc && oc.alive) return true; } } return false; }
    if (cd.bind) { var id = evPath(u, cd.bind.from, ctx); if (id == null || !u.facts[id]) return false; ctx.F[cd.bind.as] = u.facts[id]; return true; }
    if (cd.calc) return evCalc(u, cd.calc, ctx);
    if (cd.reach) { var H = ctx.F[cd.reach.as]; if (!H || H.sys == null) return false; return ctx.now >= H.y + u.D[H.sys][u.ship.at] / (cd.reach.speed || 0.9); }
    return false;
  }

  // ---------- 文本 ----------
  function evName(c) { return c ? c.name : '某个文明'; }
  function evFill(u, s, ctx, salt) {
    var k = 0;
    s = s.replace(/\[([^\[\]]+)\]/g, function (m, body) { var arr = body.split('|'); return arr[Math.floor(hrand(u, 'inl', salt, k++) * arr.length)]; });
    return s.replace(/\{([a-zA-Z0-9_.]+)\}/g, function (m, key) {
      var c = ctx.c, o = ctx.o, h;
      switch (key) {
        case 'civ': return evName(c);
        case 'other': return evName(o);
        case 'ship': return u.ship.name;
        case 'shipBase': return shipBase(u);
        case 'religion': return (c && c.religion) || shipBase(u) + '教';
        case 'sect0': return (c && c.sects && c.sects[0]) || '守望派';
        case 'sect1': return (c && c.sects && c.sects[1]) || '离弃派';
        case 'ritual': return (c && c.ritual) || '驱魔节';
        case 'home': h = homeCiv(u); return h ? h.name : '地球文明';
        case 'here': return u.systems[u.ship.at].name;
        case 'year': return yr(ctx.now);
        case 'cHome': return c ? u.systems[c.home].name : '';
        case 'oHome': return o ? u.systems[o.home].name : '';
        case 'istar': return c && c.interstellarYear != null ? yr(c.interstellarYear) : '后来';
        case 'dist': return c ? civDist(u, c, u.ship.at).toFixed(0) : '?';
      }
      var parts = key.split('.'), F = ctx.F[parts[0]];
      if (parts[0] === 'v') return ctx.v[parts[1]] != null ? String(ctx.v[parts[1]]) : '';
      if (F) {
        if (parts[1] === 'y') return yr(F.y);
        if (parts[1] === 'n') return String(Math.floor(F.y));
        if (parts[1] === 'civ') return evName(civOf(u, F.target));
        if (parts[1] === 'actor') return F.actor === 'singer' ? '歌者' : evName(civOf(u, F.actor));
        if (parts[1] === 'sys') return F.sys != null ? u.systems[F.sys].name : '';
        if (parts[1] === 'd') return F.data[parts[2]] != null ? String(F.data[parts[2]]) : '';
        // 指代：史实的客体如果是主体的祖先（流亡舰队、分裂派、改名前），说成「他们的前身「X」」
        var anc = F.target && c && F.target !== ck(c) && civOf(u, F.target) ? civOf(u, F.target) : null;
        if (parts[1] === 'them') return anc ? '他们的前身「' + anc.name + '」' : '他们';
        if (parts[1] === 'who') return anc ? '「' + anc.name + '」一脉' : '那个文明';
        if (parts[1] === 'act') return (F.type === 'hostile' && F.data.rel ? F.data.rel : ACT_DESC[F.type] || '与他们来往').replace('他们', anc ? '他们的前身「' + anc.name + '」' : '他们');
      }
      return m;
    });
  }
  function evText(u, e, arr, ctx, salt) {
    if (!arr) return null;
    if (typeof arr === 'string') arr = [arr];
    var i = Math.floor(hrand(u, e.id, salt, Math.floor(ctx.now)) * arr.length);
    var last = u.evLastVar[e.id + '|' + arr.length];
    if (arr.length > 1 && last === i) i = (i + 1) % arr.length;   // 近期变体去重
    u.evLastVar[e.id + '|' + arr.length] = i;
    return evFill(u, arr[i], ctx, salt + '|' + e.id + '|' + Math.floor(ctx.now));
  }
  function evLog(u, e, text, ctx) {
    var c = ctx.c, scope = e.scope || 'home', ent = { y: ctx.now, t: text, imp: e.imp || 2, ev: e.id };
    if (e.echo) ent.you = true;
    var sys = [];
    if (scope === 'here') sys = [u.ship.at];
    else if (scope === 'spawned') { if (ctx.spawned) sys = [ctx.spawned.home]; }
    else if (scope === 'fact' && ctx.f && ctx.f.sys != null) sys = [ctx.f.sys];
    else if (c) {
      if (u.systems[c.home].owner === c.id || scope === 'all') sys.push(c.home);
      u.systems.forEach(function (s) { if (s.owner === c.id && s.id !== c.home && (scope === 'all' || u.memory[s.id])) sys.push(s.id); });
      if (!sys.length) u.systems.forEach(function (s) { if (s.owner === c.id && !sys.length) sys.push(s.id); });
    }
    sys.forEach(function (id) { var x = {}; for (var k in ent) x[k] = ent[k]; u.systems[id].timeline.push(x); });
    return sys;
  }

  // ---------- 效果（封闭操作符） ----------
  function evSysOf(u, at, ctx) {
    if (at === 'c.home') return ctx.c ? u.systems[ctx.c.home] : null;
    if (at === 'o.home') return ctx.o ? u.systems[ctx.o.home] : null;
    if (at === 'sun') return u.systems[0];
    if (at === 'here') return u.systems[u.ship.at];
    return null;
  }
  function evEffect(u, ef, ctx) {
    var c = ctx.c, o = ctx.o;
    switch (ef.op) {
      case 'add': {
        var obj = ef.path.charAt(0) === 'o' ? o : c, fld = ef.path.split('.')[1]; if (!obj) return;
        var v = (obj[fld] || 0) + ef.v; if (ef.min != null) v = Math.max(ef.min, v); if (ef.max != null) v = Math.min(ef.max, v); obj[fld] = v; return;
      }
      case 'set': {
        var ob = ef.path.charAt(0) === 'o' ? o : ef.path.charAt(0) === 's' ? u.ship.flags : c, fl = ef.path.split('.')[1]; if (!ob) return;
        ob[fl] = typeof ef.v === 'string' ? evFill(u, ef.v, ctx, 'set' + fl) : Array.isArray(ef.v) ? ef.v.map(function (x) { return evFill(u, x, ctx, 'set' + fl); }) : ef.v; return;
      }
      case 'expo': { var s = evSysOf(u, ef.at, ctx); if (s && !s.flat) addExpo(s, ef.v, ef.kind || 'misc'); return; }
      case 'imprint': if (c) imprint(u, c, ef.tag || c.tag, ef.v || 0); return;
      case 'ship': {
        var b0 = u.ship.supply, t0 = u.ship.tech;
        if (ef.supply) u.ship.supply = clamp(u.ship.supply + ef.supply, 0, 100);
        if (ef.tech) u.ship.tech += ef.techGap && c ? Math.max(ef.tech, (c.tech - u.ship.tech) * ef.techGap) : ef.tech;
        if (ef.bio) { u.ship.bio += ef.bio; clampAge(u); }
        ctx.v.supply = (u.ship.supply - b0 >= 0 ? '+' : '') + (u.ship.supply - b0).toFixed(0); ctx.v.tech = '+' + (u.ship.tech - t0).toFixed(1); return;
      }
      case 'rel': { var B = ef['with'] === 'home' ? homeCiv(u) : o; if (c && B && B !== c && B.alive) u.rel[relKey(c.id, B.id)] = { type: ef.type, since: u.simYear }; return; }
      case 'strike': {
        var tgt = evSysOf(u, ef.to, ctx); if (!c || !tgt) return;
        var d = civDist(u, c, tgt.id);
        scheduleStrike(u, ef.weapon || '光粒', tgt, c.id, d / 0.99, '', { kind: ef.kind || 'revenge', who: '「' + c.name + '」', see: u.simYear, emit: u.simYear, fact: ctx.f ? ctx.f.id : null });
        return;
      }
      case 'protect': if (c) c.protect = { until: ctx.now + (ef.years || 300), floor: ef.floor || 0.25, quiet: ef.quiet || 0 }; return;
      case 'refugees': { var victim = ef.from === '$o' ? o : c; var nc = spawnRefugees(u, victim, ef.name || '遗民舰队'); if (nc) ctx.spawned = nc; return; }
      case 'forbid': { var who = ef.scope === 'world' ? '*' : ef.scope === 'other' ? (o ? ck(o) : '*') : (c ? ck(c) : '*'); u.evForbid[ef.event + '|' + who] = 1; return; }
      case 'leak': leakHome(u, ef.v || 0.5, ef.also || 0); return;
      case 'pass': if (c) c.passUntil = u.simYear + (ef.years || 200); return;
      case 'silence': if (c && !c.silent) { c.silent = true; c.exp *= 0.8; } return;
      case 'seal': {   // 命运「加入黑域」：他们封闭自己，你在里面（结局）
        if (!c || !c.alive || c.blackDomain) return;
        c.blackDomain = true; c.silent = true;
        u.systems.forEach(function (s2) { if (s2.owner === c.id) { clearExpo(s2); logSys(u, s2, '「' + c.name + '」应一艘外来飞船的请求建造了黑域：光速降到 16.7 km/s。那艘飞船留在了里面。', 3); pushState(u, s2); } });
        var stxt = '「' + c.name + '」的黑域在你身后合拢。光速降到每秒 16.7 公里，星空在几天之内暗了下去，最后只剩一团吞掉光线的黑。' + u.ship.name + '在船上过了 ' + u.ship.shipYears.toFixed(1) + ' 年，宇宙过了 ' + Math.floor(u.time) + ' 年。从现在起，你和他们永远安全，也永远出不去了。';
        u.ship.sealedIn = c.id; endDestiny(u, 'won', stxt, { civ: c.name }); killShip(u, stxt); u.ship.dead.sealed = true; return;
      }
      case 'hunt': {   // 议会表决通过的清理：光粒当场发射（你在场，看见了闪光）
        var hv = ctx.v.hunt; if (!hv) return; var HA = u.civs[hv.a], HT = u.systems[hv.t]; if (!HA || !HA.alive || !HT || !c) return;
        scheduleStrike(u, '光粒', HT, HA.id, hv.dist / 0.99, '', huntWhy(u, HA, c, HT, hv.dist)); return;
      }
      case 'evacuate': { var vc = ef.from === '$o' ? o : c; if (vc) { var ev2 = spawnRefugees(u, vc, '撤离舰队', vc.tag === '神' && attOf(u, vc) > 0.3 ? 0.25 : 0.08); if (ev2) ctx.spawned = ev2; } return; }   // 信徒听从神的警告：撤离得更多
    }
  }

  // ---------- 求值 ----------
  function evSubjKey(ctx) { return ctx.c ? 'civ:' + ctx.c.id : 'w'; }
  function evCtx(u, c, o, f, extra) {
    var ctx = { c: c || null, o: o || null, f: f || null, F: {}, v: {}, now: u.inSim ? u.simYear : u.time };
    if (f) ctx.F.f = f;
    if (extra) for (var k in extra) ctx[k] = extra[k];
    return ctx;
  }
  function evBlocked(u, e, ctx) {
    var sk = evSubjKey(ctx);
    if (u.evForbid[e.id + '|*'] || u.evForbid[e.id + '|' + sk]) return true;
    if (e.once === 'world' && u.evDone[e.id + '|w']) return true;
    if (e.once === 'subject' && u.evDone[e.id + '|' + sk]) return true;
    if (e.once === 'pair' && u.evDone[e.id + '|' + sk + '|' + (ctx.o ? ctx.o.id : '')]) return true;
    if (e.cooldown && u.evLast[e.id + '|' + sk] != null && ctx.now - u.evLast[e.id + '|' + sk] < e.cooldown) return true;
    if (e.cooldownGroup && u.evGroup[e.cooldownGroup] != null && ctx.now - u.evGroup[e.cooldownGroup] < (e.groupCooldown || 300)) return true;
    // 已经消失 / 封进黑域的文明不再发生内政事件（引擎内置，不靠作者记得写）
    if (ctx.c && !e.dead && (!ctx.c.alive || ctx.c.blackDomain)) return true;
    return false;
  }
  function evProb(u, e, ctx) {
    var p = e.p != null ? e.p : 1;
    (e.mod || []).forEach(function (m) { if (evCond(u, m['if'], ctx)) p *= m.x; });
    // 叙事层：线索回报保证——玩家种下的线索 300 年没有任何后续，权重 ×3
    if (e.thread && ctx.F[e.thread]) { var R0 = ctx.F[e.thread], last = R0.data.lastPay != null ? R0.data.lastPay : R0.y; if (ctx.now - last > 300) p *= 3; }
    return Math.min(1, p);
  }
  function evEchoCap(u, e, ctx) {
    if (!e.echo || e.nocap) return false;
    var c = ctx.c;
    if (c && c.lastEcho != null && ctx.now - c.lastEcho < 50) return true;          // 每个文明每 50 年最多 1 条
    var n = 0; for (var i = u.echoRecent.length - 1; i >= 0; i--) { if (ctx.now - u.echoRecent[i] < 20) n++; else break; }
    return n >= 3;                                                                    // 全宇宙每 20 年最多 3 条
  }
  // 尝试一个事件；返回 true = 发生
  function evTry(u, e, ctx, salt) {
    if (evBlocked(u, e, ctx)) return false;
    for (var i = 0; i < (e.when || []).length; i++) if (!evCond(u, e.when[i], ctx)) return false;
    if (evEchoCap(u, e, ctx)) return false;
    var p = evProb(u, e, ctx);
    if (p < 1 && hrand(u, e.id, evSubjKey(ctx) + (salt || ''), Math.floor(ctx.now * (e.on === 'year' || e.on === 'pending' ? 1 : 10))) >= p) return false;
    evApply(u, e, ctx);
    return true;
  }
  function evApply(u, e, ctx) {
    var sk = evSubjKey(ctx);
    (e.pre || []).forEach(function (q) { evCond(u, q, ctx); });
    (e.effects || []).forEach(function (ef) { evEffect(u, ef, ctx); });
    var emitted = null;
    if (e.emit) {
      var em = e.emit, data = {};
      for (var k in (em.data || {})) data[k] = typeof em.data[k] === 'string' ? evFill(u, em.data[k], ctx, 'emit' + k) : em.data[k];
      data.ev = e.id;
      var sysE = ctx.f && ctx.f.sys != null && em.at === 'fact' ? ctx.f.sys : em.at === 'here' ? u.ship.at : ctx.c ? ctx.c.home : (ctx.f ? ctx.f.sys : null);
      var root = e.thread && ctx.F[e.thread] ? ctx.F[e.thread] : ctx.f;
      emitted = addFact(u, em.type, { y: ctx.now, sys: sysE, actor: em.actor ? evKey(u, em.actor, ctx) : null, target: em.target === undefined ? (ctx.c ? ck(ctx.c) : null) : evKey(u, em.target, ctx),
        tags: em.tags || [], data: data, cause: root ? root.id : null, vis: em.vis || 'local' });
      ctx.F.emitted = emitted;
    }
    if (e.thread && ctx.F[e.thread]) ctx.F[e.thread].data.lastPay = ctx.now;
    var txt = null;
    if (e.text && e.text.log) {
      txt = evText(u, e, e.text.log, ctx, sk);
      // 时间线条目本身带「纪元 N 年：」前缀，句首同一年份不再重复
      var pfx = yr(ctx.now) + '，'; if (txt.indexOf(pfx) === 0) txt = txt.slice(pfx.length);
      evLog(u, e, txt, ctx);
    }
    if (e.echo) { if (ctx.c) ctx.c.lastEcho = ctx.now; u.echoRecent.push(ctx.now); }
    if (e.card) {
      var cs = e.card.at === 'here' ? u.ship.at : e.card.at === 'fact' && ctx.f && ctx.f.sys != null ? ctx.f.sys : ctx.c ? ctx.c.home : 0;
      var card = { id: e.id, c: ctx.c ? ctx.c.id : null, y: ctx.now, sys: cs, cls: e.card.cls || 'bad', title: evText(u, e, e.card.title, ctx, sk + 'T'), t: evText(u, e, e.card.body, ctx, sk + 'B'), shown: false, now: !!e.card.now, seq: u.cards.length };
      if (e.card.w != null) card.w = e.card.w;
      if (e.card.major) card.major = true;
      if (e.card.key) card.key = e.card.key;
      if (e.card.short) card.short = evText(u, e, e.card.short, ctx, sk + 'S');
      if (e.card.expire) { var ey = evPath(u, e.card.expire.y, ctx), es = evPath(u, e.card.expire.sys, ctx); if (ey != null && es != null) card.exp = { y: ey, sys: es }; }
      u.cards.push(card);
    }
    (e.unlock || []).forEach(function (ul) {
      var dl = ul.delay || [0, 0], dd = dl[0] + (dl[1] - dl[0]) * hrand(u, 'ul' + ul.event, sk, Math.floor(ctx.now));
      if (ul.light && ctx.c && ctx.o) dd += civDist(u, ctx.c, ctx.o.home);
      if (ul.delayV && ctx.v[ul.delayV] != null) dd += +ctx.v[ul.delayV];   // 例如光速警告在路上走的年数
      u.pend.push({ ev: ul.event, c: ctx.c ? ctx.c.id : null, o: ctx.o ? ctx.o.id : null, f: emitted ? emitted.id : ctx.f ? ctx.f.id : null, from: ctx.now + dd, until: ctx.now + dd + (ul.window || 800) });
    });
    (e.forbid || []).forEach(function (fb) { evEffect(u, { op: 'forbid', event: fb.event || fb, scope: fb.scope || 'subject' }, ctx); });
    if (e.once === 'world') u.evDone[e.id + '|w'] = 1;
    else if (e.once === 'subject') u.evDone[e.id + '|' + sk] = 1;
    else if (e.once === 'pair') u.evDone[e.id + '|' + sk + '|' + (ctx.o ? ctx.o.id : '')] = 1;
    u.evLast[e.id + '|' + sk] = ctx.now;
    if (e.cooldownGroup) u.evGroup[e.cooldownGroup] = ctx.now;
    u.evCount[e.id] = (u.evCount[e.id] || 0) + 1;
    ctx.fired = e; ctx.text = txt;
    return txt;
  }
  // 史实触发：fact:<type>，主体默认是史实的客体（subject: "actor" 则为主体）
  function evFire(u, on, f) {
    var list = EV.byOn[on]; if (!list) return;
    list.forEach(function (e) {
      var pairs = e.subject === 'actor' ? [[f.actor, f.target]] : e.subject === 'either' ? [[f.target, f.actor], [f.actor, f.target]] : [[f.target, f.actor]];
      pairs.forEach(function (pr) {
        var ctx = evCtx(u, civOf(u, pr[0]), civOf(u, pr[1]), f);
        if (e.subject !== 'none' && !ctx.c) return;
        evTry(u, e, ctx, 'f' + f.id);
      });
    });
  }
  // 逐年：对每个活着的文明，跑它「有相关史实」的事件；再跑排期队列
  function evYear(u) {
    var list = EV.byOn.year || [];
    if (list.length) u.civs.forEach(function (c) {
      if (!c.alive || c.blackDomain) return;
      list.forEach(function (e) { if (e.need && !civHasType(u, c, e.need)) return; evTry(u, e, evCtx(u, c, null, null), ''); });
    });
    if (!u.pend.length) return;
    var keep = [];
    for (var i = 0; i < u.pend.length; i++) {
      var P = u.pend[i];
      if (u.simYear < P.from) { keep.push(P); continue; }
      var e = EV.byId[P.ev], c = P.c != null ? u.civs[P.c] : null;
      if (!e || u.simYear > P.until || (c && (!c.alive || c.blackDomain) && !e.dead)) continue;
      var ctx = evCtx(u, c, P.o != null ? u.civs[P.o] : null, P.f != null ? u.facts[P.f] : null);
      if (evTry(u, e, ctx, '')) continue;
      if (e.once && evBlocked(u, e, ctx)) continue;
      keep.push(P);
    }
    u.pend = keep;
  }
  // 玩家到达 / 选项：在飞船当前星系上下文里跑一组事件
  function evArrive(u, on, ctx0) {
    var list = EV.byOn[on] || [], fired = [], groups = {};
    list.forEach(function (e) {
      if (e.group && groups[e.group]) return;
      var subs;
      if (e.subject === 'here') subs = ctx0.c ? [ctx0.c] : [];
      else if (e.subject === 'near') subs = u.civs.filter(function (c) { return c.alive && !c.blackDomain && (!ctx0.c || c !== ctx0.c) && civDist(u, c, u.ship.at) <= (e.range || 120); });
      else if (e.subject === 'any') subs = u.civs.filter(function (c) { return c.alive || e.dead; });
      else subs = [null];
      for (var i = 0; i < subs.length; i++) {
        var ctx = evCtx(u, subs[i], null, null, { E: ctx0.E, rep: ctx0.rep, scene: ctx0.scene });
        if (evTry(u, e, ctx, 'a' + u.ship.at)) { fired.push({ e: e, ctx: ctx }); if (e.group) { groups[e.group] = 1; break; } }
      }
    });
    return fired;
  }
  // 到达事件的输出：forced 文本 + 选项
  function evPresent(u, E, rep, fired) {
    fired.forEach(function (x) {
      var e = x.e, ctx = x.ctx;
      if (e.text && e.text.show) {
        var t = evText(u, e, e.text.show, ctx, 'show');
        if (E) E.forced.push({ cls: e.cls || 'warn', t: t });
        if (rep && e.echo) rep.caused.push(t);
      }
      (e.options || []).forEach(function (op) {
        if (op.when && !op.when.every(function (q) { return evCond(u, q, ctx); })) return;
        if (E) { E.options.push(opt('@' + op.id, evFill(u, op.label, ctx, 'lbl'), evFill(u, op.desc || '', ctx, 'desc'))); E.evctx = E.evctx || {}; E.evctx['@' + op.id] = { c: ctx.c ? ctx.c.id : null, F: ctx.F, v: ctx.v }; }
      });
      if (e.scene && E) E.scene = e.scene;
    });
  }
  // 事件给出的选项被选中：按 outcomes 顺序取第一个条件满足、掷骰通过的结果
  function evChoose(u, id, E) {
    var e = EV.byId[id.slice(1)]; if (!e) return { t: '……', cls: 'dim' };
    if (!(E.evctx || {})[id]) return { t: '时机已经过去了。', cls: 'dim' };   // 这次到访没有提供这个选项
    var info = E.evctx[id], c = info.c != null ? u.civs[info.c] : null;
    var ctx = evCtx(u, c, null, null); ctx.F = info.F || {}; if (info.v) for (var vk in info.v) ctx.v[vk] = info.v[vk];   // 父事件算好的 {v.*}（距离、警告在路上的年数……）
    if (e.when) for (var i = 0; i < e.when.length; i++) if (!evCond(u, e.when[i], ctx)) return { t: '时机已经过去了。', cls: 'dim' };
    var outs = e.outcomes || [{}], k = hrand(u, e.id, evSubjKey(ctx), Math.floor(u.time * 10));
    for (var j = 0; j < outs.length; j++) {
      var oc = outs[j];
      if (oc.when && !oc.when.every(function (q) { return evCond(u, q, ctx); })) continue;
      var p = oc.p != null ? oc.p : 1;
      (oc.mod || []).forEach(function (m) { if (evCond(u, m['if'], ctx)) p *= m.x; });
      if (k >= p) { k = (k - p) / Math.max(1e-9, 1 - p); continue; }
      var pseudo = { id: e.id + '#' + j, pre: oc.pre, effects: oc.effects, emit: oc.emit, text: oc.log ? { log: oc.log } : null, echo: oc.echo, imp: oc.imp, unlock: oc.unlock, forbid: oc.forbid, card: oc.card, scope: oc.scope };
      evApply(u, pseudo, ctx);
      if (oc.expel) E.expelled = true;
      return { t: evText(u, pseudo, oc.result || '……', ctx, 'res'), cls: oc.cls || '' };
    }
    return { t: '……', cls: 'dim' };
  }

  // 玩家帮过某文明一脉的「最重要」那次（用于间接责任的因果句和卡片）
  var HELP_RANK = { god: 9, ally: 8, gift_l: 7, warned: 7, teach: 6, trade: 5, gift_s: 4, learn: 3, courier: 3, relic: 2, scholar: 2, starmap: 2 };
  function helpFact(u, c, before) {
    var best = null;
    lineage(u, c).forEach(function (k) {
      (u.fWho[k] || []).forEach(function (f) {
        if (f.actor !== 'ship' || !HELP_RANK[f.type] || (before != null && f.y > before)) return;
        if (!best || HELP_RANK[f.type] > HELP_RANK[best.type] || (HELP_RANK[f.type] === HELP_RANK[best.type] && f.y > best.y)) best = f;
      });
    });
    return best;
  }
  // 「促成」一次清理的那次帮助：技术礼物要早于他们进入星海；交流、贸易、盟约本身就让他们更强
  function enablerFact(u, c, before) {
    var best = null, P = { gift_l: 9, teach: 7, ally: 6, trade: 5, gift_s: 4, learn: 3, god: 2 };
    lineage(u, c).forEach(function (k) {
      (u.fWho[k] || []).forEach(function (f) {
        if (f.actor !== 'ship' || !P[f.type] || f.y > before) return;
        if ((f.type === 'gift_l' || f.type === 'gift_s') && c.interstellarYear != null && c.interstellarYear < f.y) return;
        if (!best || P[f.type] > P[best.type]) best = f;
      });
    });
    return best;
  }
  // 流亡 / 撤离舰队：从受害文明分出一支，落脚在最近的安全星系
  function spawnRefugees(u, victim, suffix, share) {
    if (!victim) return null;
    var from = u.systems[victim.home];
    var safe = u.systems.filter(function (t) { return t.owner == null && !t.dead && !t.flat && !t.targeted && t.id !== 0 && u.D[from.id][t.id] > 8 && !u.flats.some(function (f) { return DM.hyp(t.x - f.x, t.y - f.y) <= f.rmax + 3; }); })
      .sort(function (a, b) { return u.D[from.id][a.id] - u.D[from.id][b.id]; })[0];
    if (!safe) return null;
    var d = { id: u.civs.length, root: victim.root, name: victim.root + suffix, color: COLORS[u.civs.length % COLORS.length], home: safe.id,
      pop: Math.max(0.01, victim.pop * (share || 0.05) + 0.01), tech: Math.max(victim.tech, victim.peakTech * 0.9), peakTech: victim.peakTech, res: 1, exp: Math.min(1, victim.exp + 0.2), stab: 0.5, alive: true, born: u.simYear,
      era: eraOf(Math.max(victim.tech, victim.peakTech * 0.9)), legends: victim.legends.slice(), att: victim.att, attYear: victim.attYear, tag: victim.tag, giftYear: victim.giftYear, interstellarYear: victim.interstellarYear,
      endYear: null, endCause: null, formerNames: [victim.name], parent: victim.id, diaspora: true, refugee: true, silent: true, temper: victim.temper, legacy: [] };
    u.civs.push(d); safe.owner = d.id; d.res = cap(u, d);
    logSys(u, safe, '一支流亡舰队抵达：「' + victim.name + '」的幸存者在这里建立了「' + d.name + '」。', 3);
    pushState(u, safe);
    return d;
  }

  // 需要代码算的上下文变量（封闭集合）：返回 false 表示条件不成立
  var WHY_TXT = { detect: '是他们的深空监听网先发现了对方。', radio: '对方自己的无线电泄露了坐标。', civ: '对方的星际航迹暴露了坐标。', war: '对方的坐标早在战争中被敌人广播过。',
    trail: '对方的坐标，是被你的曲率航迹暴露出来的。', contact: '对方的坐标，是被你和他们的通讯暴露出来的。', bcast: '对方的坐标，是你广播出去的。', leak: '对方的坐标，来自你被抽走的星图。', map: '坐标来自你带回母星的星图。', revenge: '这是一次复仇。' };
  var EXPO_WHY = { radio: '他们的无线电一年比一年响', civ: '他们的舰队在星际间留下了越来越多的航迹', war: '敌人把他们的坐标广播了出去', bcast: '有人广播了他们的坐标', trail: '曲率航迹一路指向他们', contact: '他们和别的文明的通讯往来越来越密', leak: '他们的坐标随着星图流传了出去', misc: '各种信号越来越多' };
  function evCalc(u, k, ctx) {
    var c = ctx.c, v = ctx.v;
    switch (k) {
      case 'help': { if (!c) return false; var h = helpFact(u, c, ctx.now); if (!h) return false; ctx.F.h = h; v.helpRank = HELP_RANK[h.type] || 0; return true; }
      case 'why': {
        var f = ctx.F.f && ctx.F.f.type === 'cleared' ? ctx.F.f : ctx.F.b && ctx.F.b.cause != null ? u.facts[ctx.F.b.cause] : null;
        v.why = ''; if (!f) return true;
        v.why = WHY_TXT[f.data.kind] || '';
        var hf = f.data.help != null ? u.facts[f.data.help] : null;
        if (hf && (hf.type === 'gift_l' || hf.type === 'gift_s')) v.why += '他们能走进星海，起点是你' + yr(hf.y) + '留下的' + (hf.data.what || '技术') + '。';
        return true;
      }
      case 'archive': {
        var list = [], you = 0;
        (u.fType.cleared || []).forEach(function (f) {
          var a = civOf(u, f.actor); if (!a || !isEarthLine(u, a) || f.y > ctx.now) return;
          var src = f.data.kind === 'map' ? '坐标来自你带回的星图' : f.data.kind === 'detect' ? '深空监听网发现' : (WHY_TXT[f.data.kind] || '').replace(/^对方/, '').replace(/。$/, '');
          if (f.data.kind === 'map') you++;
          list.push(yr(f.y) + '，「' + f.data.victim + '」（' + src + '）');
        });
        if (!list.length) return false;
        v.archiveN = list.length; v.archive = list.slice(0, 6).join('；') + (list.length > 6 ? '；……' : '');
        v.archiveYou = you ? '其中 ' + you + ' 个文明的坐标，来自你当年讲给母星听的旅途见闻。' : '没有一条用到你带回的星图——但你知道，你的旅途见闻也在档案馆的另一层。';
        return true;
      }
      case 'expo': {
        if (!c) return false; var best = null;
        u.systems.forEach(function (s) { if (s.owner === c.id && (!best || s.exposure > best.exposure)) best = s; });
        if (!best || best.exposure < (c.religion && civHasType(u, c, ['faith_founded']) ? 0.8 : 1.2)) return false;   // 信奉你的文明：更早预警
        v.expo = best.exposure.toFixed(1); var dk = domKind(best.ex); v.expoWhy = EXPO_WHY[dk] || '信号';
        return true;
      }
      case 'home': {
        var hs = homeSeenState(u), H = u.systems[0];
        v.homeYear = yr(Math.max(0, hs.sy)); v.homeOwner = hs.st.name || (hs.hc ? hs.hc.name : '');
        v.flatYear = H.flatYear != null ? yr(H.flatYear) + '，二向箔落在那里。' : '';
        var ec = null; H.timeline.forEach(function (e) { if (e.y <= hs.sy) ec = e; });
        v.lastEvent = ec ? '最后的记载：' + ec.t : '';
        // 太阳被压平，是不是遗民广播的坐标引来的（打击原因 = 交战广播，且广播早于压平）
        v.avenged = false;
        if (H.flatYear != null) u.strikes.forEach(function (st) { if (st.target === 0 && st.type === '二向箔' && st.done && !st.wasted && st.cause && st.cause.kind === 'war') v.avenged = (u.fType.refugee_bcast || []).some(function (f) { return f.y <= st.launch; }); });
        return true;
      }
      case 'faith': {
        // 宗教线的前情：创教神迹、信徒的圣物、走过的路——让后续文本引用前一阶段的细节
        if (!c) return false;
        var FQ = function (t) { return factQuery(u, { type: t, target: '$c', known: 'any' }, ctx); };
        var fo = FQ('faith_founded')[0], gd = factQuery(u, { type: 'god', target: '$c', actor: 'ship', known: 'any' }, ctx)[0];
        var fromDevil = fo && fo.data.fromDevil, rit = c.ritual || '驱魔节';
        v.sign = fromDevil ? '那副' + rit + '的面具' : gd && gd.data.how === 'miracle' ? '夜空里的第二个太阳' : '一艘从天而降的发光小船';
        var sch = FQ('faith_schism')[0], hw = FQ('faith_holywar')[0], mt = FQ('faith_martyr')[0], pr = FQ('faith_prophet')[0], pres = FQ('prophet_resolved')[0],
          pg = FQ('faith_pilgrim')[0], bl = FQ('faith_blessed'), rf = FQ('faith_reform')[0], pc = FQ('faith_peace')[0];
        v.relic = mt ? '殉道者的遗骨' : fromDevil ? '当年' + rit + '的面具' : pg ? '一捧「神降之地」的土' : gd && gd.data.how === 'miracle' ? '一幅「第二个太阳」的壁画' : '一尊发光的小船神像';
        var past = [];
        if (sch) past.push([sch.y, sch.data.why === 'devil' ? '神变成恶魔那一夜的分裂' : '「' + ((c.sects && c.sects[0]) || '守望派') + '」与「' + ((c.sects && c.sects[1]) || '离弃派') + '」的分裂']);
        if (hw) past.push([hw.y, '一场以你为名的圣战']);
        if (mt) past.push([mt.y, '一位望着你离去方向死去的殉道者']);
        if (pc) past.push([pc.y, '你亲手平息的那场战争']);
        if (pr) past.push([pr.y, '冒充你的「' + shipBase(u) + '再临」' + (pres ? (pres.data.how === 'expose' ? '（被你揭穿）' : '（被你默认）') : '')]);
        if (pg) past.push([pg.y, '通往「神降之地」的朝圣']);
        if (bl.length) past.push([bl[bl.length - 1].y, '你' + yr(bl[bl.length - 1].y) + '的祝福']);
        if (rf) past.push([rf.y, '把「等待」改成「寻找」的宗教改革']);
        past.sort(function (a, b) { return a[0] - b[0]; });
        var ps = past.slice(-3).map(function (x) { return x[1]; });
        v.past = ps.join('、'); v.after = ps.length ? '经历过' + v.past + '之后，' : ''; v.pastS = ps.length ? '他们经历过' + v.past + '。' : '';
        return true;
      }
      case 'dim': {
        v.dim = dimOf(u).toFixed(3); v.dimN = u.dimStrikes;
        var mine = (u.fType.cleared || []).filter(function (f) { return f.data.weapon === '二向箔' && f.data.player && f.y <= ctx.now; }).length;
        v.dimYou = mine ? '其中 ' + mine + ' 次降维，是被你的航迹、通讯或广播引来的。' : '这些降维打击里，没有一次能追溯到你——至少档案里没有。';
        return true;
      }
      case 'age': {
        if (!c) return false; var ff = factQuery(u, { type: ['faith_founded', 'god'], target: '$c', known: 'any' }, ctx)[0];
        v.age = ff ? Math.max(1, Math.round(ctx.now - ff.y)) : '几百'; return true;
      }
      case 'dist': { if (!c) return false; var d = civDist(u, c, u.ship.at); v.distN = d.toFixed(0); v.dist = '距此 ' + d.toFixed(0) + ' 光年'; return true; }
      case 'incoming': {
        // 在途的光粒：你（按光延迟）已经看见了发射闪光——此刻所在星系，或出发时所在的星系——
        // 而且从这里发出的光速警告还能比光粒先到。光粒 0.99c，警告 1c：差的那 1%，就是撤离的时间。
        if (!c) return false;
        var tr = u.ship.trips[u.ship.trips.length - 1], here = u.ship.at;
        // 情形 2：你恰好停在一个「猎手」文明的星系里，他们的议会刚刚表决通过、要清理 c（光粒随事件效果 hunt 当场发射）
        var hc0 = u.systems[here].owner != null ? u.civs[u.systems[here].owner] : null;
        if (hc0 && hc0 !== c && hc0.alive && !hc0.blackDomain && !c.blackDomain && hc0.tech >= 75 && hc0.tech - c.tech >= 8 && hc0.stab > 0.3) {
          var rr0 = u.rel[relKey(hc0.id, c.id)], dd0 = minDist(u, hc0, c);
          if ((!rr0 || rr0.type !== '贸易') && dd0 < 1e8 && detects(u, hc0, c, dd0) && hrand(u, 'council', hc0.id + '>' + c.id, Math.floor(u.time)) < 0.2) {
            var bs0 = ownedSystems(u, c).filter(function (s) { return !s.targeted && !s.flat && !s.dead; }).sort(function (x, y) { return y.exposure - x.exposure; })[0];
            if (bs0) { v.hunt = { a: hc0.id, t: bs0.id, dist: dd0 }; v.council = 1; }
          }
        }
        if (v.hunt) {
          var A0 = u.civs[v.hunt.a], T0 = u.systems[v.hunt.t], fs0 = null;
          u.systems.forEach(function (s) { if (s.owner === A0.id && (fs0 == null || u.D[s.id][T0.id] < u.D[fs0][T0.id])) fs0 = s.id; });
          var arr0 = Math.floor(u.time) + Math.max(1, Math.ceil(Math.max(v.hunt.dist, u.D[fs0][T0.id]) / 0.99 - 1e-9)), dW0 = u.D[here][T0.id], lead0 = arr0 - (u.time + dW0);
          if (lead0 < 0.05) { delete v.hunt; }
          else {
            var vh = isEarthLine(u, A0);
            v.arriveY = yr(arr0); v.target = T0.name; v.shooter = A0.name; v.vsHome = vh ? 1 : ''; v.warnD = dW0; v.distN = dW0.toFixed(0);
            v.leadN = lead0 < 1 ? Math.max(1, Math.round(lead0 * 365)) + ' 天' : lead0.toFixed(1) + ' 年';
            v.seen = '你停靠在' + u.systems[here].name + '的时候，「' + A0.name + '」的议会刚刚表决通过：深空监听网锁定了 ' + v.hunt.dist.toFixed(0) + ' 光年外的「' + c.name + '」。发射就在今天';
            v.race = '光粒比光慢 1%。如果你现在向那里发出光速警告，它会比光粒早到 ' + v.leadN + '。' + (vh ? '开枪的是母星。' : '');
            v.warnLabel = '向「' + c.name + '」发出光速警告'; v.warnDesc = '警告要走 ' + v.distN + ' 年，比光粒早到 ' + v.leadN + '。「' + A0.name + '」会知道是谁走漏了消息。' + (vh ? '这是在出卖母星。' : '');
            v.warnResult = '你当着「' + A0.name + '」的面，把警告射向了「' + c.name + '」。它要在深空里走 ' + v.distN + ' 年，比光粒早到 ' + v.leadN + '。' + (vh ? '母星迟早会知道是谁走漏了消息。' : '「' + A0.name + '」的哨舰把你请出了港口。');
            return true;
          }
        }
        for (var i = 0; i < u.strikes.length; i++) {
          var st = u.strikes[i]; if (st.done || st.fromSys == null || st.arrive <= u.time) continue;
          var tg = u.systems[st.target]; if (tg.owner !== c.id) continue;
          var seenHere = u.time + 1e-6 >= st.launch + u.D[st.fromSys][here];
          var seenFrom = tr && tr.from !== here && tr.depart + 1e-6 >= st.launch + u.D[st.fromSys][tr.from];
          if (!seenHere && !seenFrom) continue;
          var dW = u.D[here][st.target], lead = st.arrive - (u.time + dW);
          if (lead < 0.05) continue;
          var A = u.civs[st.by], vsHome = A && isEarthLine(u, A);
          v.arriveY = yr(st.arrive); v.target = tg.name; v.shooter = A ? A.name : '某个文明'; v.vsHome = vsHome ? 1 : '';
          v.warnD = dW; v.leadN = lead < 1 ? Math.max(1, Math.round(lead * 365)) + ' 天' : lead.toFixed(1) + ' 年'; v.distN = dW.toFixed(0);
          v.seen = seenHere ? (st.fromSys === here ? '就在你眼前' : '你看到了' + yr(st.launch) + '的闪光') : '出发前，你看到了' + yr(st.launch) + '的闪光';
          if (here === st.target) {
            v.race = '你比它先到了 ' + v.leadN + '。';
            v.warnLabel = '警告他们，帮他们撤离'; v.warnDesc = '来不及救所有人，但能让一部分人登上飞船。';
            v.warnResult = '你把警报直接灌进了他们的每一个频道。离光粒落地还有 ' + v.leadN + '：够一部分人登上飞船，逃向最近的安全星系。';
          } else {
            v.race = '光粒比光慢 1%。如果你现在向那里发出光速警告，它会比光粒早到 ' + v.leadN + '。' + (vsHome ? '开枪的是母星。' : '');
            v.warnLabel = '向「' + c.name + '」发出光速警告'; v.warnDesc = '警告要走 ' + v.distN + ' 年；它会比光粒早到 ' + v.leadN + '。' + (vsHome ? '这是在出卖母星的一次清理行动，母星的档案会记下来。' : '警告信号也会照亮你此刻的位置。');
            v.warnResult = '警告已经发出，它要在深空里走 ' + v.distN + ' 年，比光粒早到 ' + v.leadN + '。你不会知道结果——除非多年以后，那道光再传回来。' + (vsHome ? '母星迟早会知道是谁走漏了消息。' : '');
          }
          return true;
        }
        return false;
      }
      case 'dossier': {
        // 母星档案：只列母星（按光延迟）已经知道、而你还没在档案里读到过的条目
        if (!c) return false;
        var seenD = u.ship.dossierSeen = u.ship.dossierSeen || {}, items = [];
        var DT = { sided: function (f, n) { return '你在「' + n + '」最孤立的时候站在了他们一边——档案员在你的名字旁边写了「叛徒」，又划掉了'; },
          mediated: function (f, n) { return '你替母星和「' + n + '」' + (f.data.how === 'treaty' ? '签下了正式的和约' : '斡旋了停火') + '，那份协议被挂在外交部的大厅里'; },
          mediate_failed: function (f, n) { return '你试图调停「' + n + '」与母星的战争，被请出了他们的星系'; },
          warned: function (f, n) { return f.data.vsHome ? '母星的光粒还在路上，你却向「' + n + '」发出了警告。军方要求以叛国罪审判你，议会吵了十年，最后不了了之' : '你抢在光粒之前警告了「' + n + '」'; },
          retaliated: function (f, n) { return '你向全宇宙广播了「' + n + '」的坐标'; },
          reparation: function (f, n) { return '你把飞船上的全部技术资料交给了「' + n + '」，作为迟到的赔偿'; },
          apology: function (f, n) { return '你替母星向「' + n + '」道了歉'; },
          questioned: function (f, n) { return '你质问「' + n + '」为什么要开枪，他们的回答被抄进了卷宗：「先开枪的才能活下来」'; },
          refugee_spurned: function (f, n) { return '你替母星向「' + n + '」道歉，换来的是被打穿的货舱'; },
          faith_blessed: function (f, n) { return '「' + n + '」把你奉为神明，而你又一次祝福了他们'; },
          faith_truth: function (f, n) { return '你亲口告诉「' + n + '」的信徒：你不是神'; },
          god: function (f, n) { return '你在「' + n + '」扮成了神' + (f.data.how === 'miracle' ? '，让他们的夜空出现了第二个太阳' : ''); },
          devil: function (f, n) { return f.data.how === 'betray' ? '你向全宇宙喊出了信奉你的「' + n + '」的坐标' : '「' + n + '」把你当成了恶魔'; },
          gift_l: function (f, n) { return '你把母星几百年的科学一股脑儿留给了「' + n + '」'; },
          ally: function (f, n) { return '你以母星的名义和「' + n + '」结了盟'; },
          starmap: function (f, n) { return '你把星图交给了「' + n + '」——太阳的坐标也在上面'; },
          hostile: function (f, n) { return '你' + String(f.data.rel || '与他们结怨').replace('他们', '「' + n + '」'); } };
        (u.fWho.ship || []).forEach(function (f) {
          if (!DT[f.type] || seenD[f.id] || f.y > ctx.now || !civKnows(u, c, f, ctx.now)) return;
          var tc = civOf(u, f.target); items.push({ f: f, t: yr(f.y) + '，' + DT[f.type](f, tc ? tc.name : '某个文明') });
        });
        if (!items.length) return false;
        items.forEach(function (x) { seenD[x.f.id] = 1; });
        var byK = {}, merged = [];   // 同一件事对同一个文明做了几次：只留最近一条，注明次数
        items.forEach(function (x) { var k = x.f.type + '|' + x.f.target + '|' + (x.f.data.how || ''); if (byK[k]) { byK[k].n++; byK[k].f = x.f; byK[k].t = x.t; } else { byK[k] = { f: x.f, t: x.t, n: 1 }; merged.push(byK[k]); } });
        items = merged.map(function (x) { return { f: x.f, t: x.t + (x.n > 1 ? '（前后 ' + x.n + ' 次）' : '') }; });
        v.dossier = items.slice(-4).map(function (x) { return x.t; }).join('；') + '。' + (items.length > 4 ? '（还有 ' + (items.length - 4) + ' 条更早的记录。）' : '');
        return true;
      }
    }
    return false;
  }

  // 星系易主后，文明的「首都」搬到剩下的星系（被压平 / 熄灭 / 攻陷的旧都不再发消息）
  function rehome(u, c) {
    if (!c || u.systems[c.home].owner === c.id) return;
    var best = null; u.systems.forEach(function (s) { if (s.owner === c.id && !s.dead && (!best || s.rich > best.rich)) best = s; });
    if (best) c.home = best.id;
  }

  // ---------- 一年 ----------
  function stepYear(u) {
    var alive = u.civs.filter(function (c) { return c.alive; });

    // 全局：超新星（很少见，偏向大质量恒星）
    if (rnd(u) < 0.0008) {
      var massive = u.systems.filter(function (s) { return s.type === 'O' || s.type === 'B' || s.type === 'A'; });
      var pool = massive.length ? massive : u.systems.filter(function (s) { return s.type === 'K' || s.type === 'M'; });
      if (pool.length) supernova(u, pick(u, pool));
    }

    alive.forEach(function (c) {
      if (!c.alive) return;
      if (c.blackDomain) return;   // 黑域：与宇宙隔绝，一切冻结
      var owned = ownedSystems(u, c);
      if (!owned.length) { extinguish(u, c, '失去了所有家园'); return; }
      var K = cap(u, c), f = K / c.pop;
      var fStar = 1.2 - 0.6 * c.exp;
      // 人口
      c.pop += c.pop * 0.02 * (Math.min(f, 2) - fStar) + c.pop * (rnd(u) - 0.5) * 0.006;
      // 资源
      c.res = clamp(c.res + 0.05 * (K - c.pop), 0, 3 * K);
      var stress = (f < 1 && c.res < 0.05 * K) ? (1 - f) : 0;
      // 贸易 / 战争
      var trade = 0, war = 0;
      alive.forEach(function (d) { if (d === c) return; var r = u.rel[relKey(c.id, d.id)]; if (!r || !d.alive) return; if (r.type === '贸易') trade++; if (r.type === '战争') war++; });
      // 稳定度
      var target = 0.75 - 3.5 * stress + 0.03 * trade;
      c.stab += 0.02 * (target - c.stab) + (rnd(u) - 0.5) * 0.04 - 0.012 * war;
      var prot = c.protect && u.simYear < c.protect.until ? c.protect : null;   // 信仰的凝聚力：神眷保护期内社会不容易崩溃
      if (prot) c.stab = Math.max(c.stab, prot.floor);
      c.stab = clamp(c.stab, 0, 1);
      // 科技
      var tradeMul = 1 + 0.3 * Math.min(trade, 2);
      if (c.stab < 0.2) c.tech -= 0.08 * (1 + c.tech / 50);
      else c.tech += 0.05 * c.stab * (0.4 + Math.min(c.res / K, 1.5)) * techGain(c.tech) * tradeMul;
      c.tech = Math.max(0, c.tech);
      if (war) c.pop *= 1 - 0.003 * war;

      // 随机事件
      if (rnd(u) < 0.0015) { c.pop *= R(u, 0.55, 0.8); c.stab -= 0.15; logCiv(u, c, '一场大瘟疫席卷「' + c.name + '」，人口锐减。', 2); }
      if (c.tech > 5 && rnd(u) < 0.002) { var dt = R(u, 3, 8); c.tech += dt; logCiv(u, c, '「' + c.name + '」迎来技术突破，科技跃升。', 2); }
      if (rnd(u) < 0.0015) { c.stab = Math.min(1, c.stab + 0.2); logCiv(u, c, '「' + c.name + '」进入黄金时代，艺术与哲学繁荣。', 1); }

      // 危机：内战 / 革命 / 灭绝
      if (c.stab < 0.15 && rnd(u) < 0.04) crisis(u, c, owned);
      if (c.alive && c.pop < 0.005) extinguish(u, c, '人口崩溃');
      if (!c.alive) return;

      // 时代变化
      c.peakTech = Math.max(c.peakTech, c.tech);
      var eUp = eraOf(c.tech - 1), eDn = eraOf(c.tech + 1.5), e = c.era;
      if (ERA_RANK[eUp] > ERA_RANK[c.era]) e = eUp; else if (ERA_RANK[eDn] < ERA_RANK[c.era]) e = eDn;
      if (e !== c.era) {
        var up = ERA_RANK[e] > ERA_RANK[c.era];
        c.era = e;
        logCiv(u, c, up ? '「' + c.name + '」进入' + e + '时代。' : '「' + c.name + '」文明倒退回' + e + '时代。', up ? 2 : 3);
        if (up && e === '星际' && c.interstellarYear == null) {
          c.interstellarYear = u.simYear;
          if (rnd(u) < 0.6) rename(u, c, civForm(c.root, c.tech, u), '跨入星际时代后，');
        }
        pushCivState(u, c);
      }

      // 无线电时代泄漏：暴露母星
      if (c.tech >= 35 && c.tech < 60 && !c.silent) addExpo(u.systems[c.home], 0.004 * (prot && prot.quiet ? prot.quiet : 1), 'radio');   // 「不要向黑暗呼喊」的教义压低了无线电泄漏
      if (c.tech >= 55) owned.forEach(function (s) { addExpo(s, c.silent ? 0.0015 : 0.003, 'civ'); });   // 星际文明自己的曲率航迹
      if (c.silent) owned.forEach(function (s) { decayExpo(s, 0.995); });

      // 星际扩张
      if (c.tech >= 55 && rnd(u) < 0.004 + 0.02 * c.exp * c.stab) expand(u, c, owned);
    });

    interactions(u);
    evYear(u);

    // 新文明诞生
    u.systems.forEach(function (s) {
      if (s.owner == null && s.habitable && !s.dead && rnd(u) < 0.00025) createCiv(u, s.id, R(u, 0.5, 3));
    });
    cosmicStep(u);
    u.systems.forEach(function (s) { yearExpo(u, s); });
    u.civs.forEach(function (c) { c.stab = clamp(c.stab, 0, 1); });
    u.simYear++;
  }

  function crisis(u, c, owned) {
    var x = rnd(u);
    if (owned.length >= 2 && x < 0.45) {
      // 内战分裂：一半星系独立
      var rebels = owned.filter(function (s) { return s.id !== c.home; });
      rebels = rebels.slice(0, Math.max(1, Math.floor(rebels.length / 2 + 0.5)));
      var share = rebels.length / owned.length;
      var root = newRoot(u);
      var d = { id: u.civs.length, root: root, name: root + pick(u, ['分离派', '自由邦', '独立联盟', '公社', '自治领']), legacy: [], temper: c.temper, color: COLORS[u.civs.length % COLORS.length], home: rebels[0].id,
        pop: c.pop * share, tech: c.tech * 0.95, peakTech: c.tech, res: c.res * share, exp: clamp(c.exp + R(u, -0.2, 0.3), 0, 1), stab: 0.4,
        alive: true, born: u.simYear, era: eraOf(c.tech * 0.95), legends: c.legends.slice(), att: c.att, attYear: c.attYear, tag: c.tag, giftYear: c.giftYear, interstellarYear: c.interstellarYear,
        endYear: null, endCause: null, formerNames: [c.name], parent: c.id };
      u.civs.push(d);
      c.pop *= 1 - share; c.res *= 1 - share; c.stab = 0.4;
      rebels.forEach(function (s) { s.owner = d.id; logSys(u, s, '「' + c.name + '」爆发内战，这里宣布独立，成立「' + d.name + '」。', 3); pushState(u, s); });
      logSys(u, u.systems[c.home], '「' + c.name + '」爆发内战，' + rebels.length + ' 个星系分裂出去。', 3);
      u.rel[relKey(c.id, d.id)] = { type: '战争', since: u.simYear };
    } else if (c.pop > 0.03) {
      // 革命/崩溃：倒退并改名
      var drop = R(u, 5, 15);
      c.tech = Math.max(0, c.tech - drop); c.stab = 0.5;
      var K2 = cap(u, c); c.pop = Math.min(c.pop * 0.6, K2 * 0.8); c.res = K2;   // 人口回落到新承载力以下，才有机会复苏
      if (c.tech < 3 && rnd(u) < 0.35 && !(c.protect && u.simYear < c.protect.until)) { extinguish(u, c, '文明之火熄灭'); return; }
      var cn = '「' + c.name + '」';
      logSys(u, u.systems[c.home], pick(u, [cn + '社会崩溃，大量知识失传。', cn + '陷入漫长的黑暗年代，图书馆一座座熄灭。', cn + '的中央政府瓦解，群雄割据，技术停滞倒退。', '一场革命推翻了' + cn + '的旧秩序，也烧掉了许多知识。', cn + '的能源网络崩溃，城市一座接一座陷入黑暗。']), 3);
      if ((c.lastRename == null || u.simYear - c.lastRename > 400) && rnd(u) < 0.5) {
        var nn = pick(u, ['新' + c.root, c.root + '第二共和国', c.root + '复兴会', c.root + '遗民', c.root + '重建同盟', c.root + '新纪元', c.root + '合众国']);
        if (c.formerNames.indexOf(nn) < 0 && nn !== c.name) { rename(u, c, nn, '在废墟上，'); c.lastRename = u.simYear; }
      }
      pushCivState(u, c);
    } else extinguish(u, c, '内乱中走向终结');
  }

  function supernova(u, s) {
    var old = s.type;
    s.type = old === 'O' || old === 'B' ? (rnd(u) < 0.4 ? '黑洞' : '中子星') : '白矮星';
    s.habitable = false;
    logSys(u, s, '这颗' + old + '型恒星爆发为超新星，坍缩成' + s.type + '。', 3);
    u.systems.forEach(function (t) {
      var d = u.D[s.id][t.id];
      if (d > 25) return;
      var c = t.owner != null ? u.civs[t.owner] : null;
      if (d < 9) {
        t.habitable = false;
        if (c && c.alive) { c.pop *= 0.5; c.stab -= 0.3; logSys(u, t, '邻近超新星的辐射洗过这里，「' + c.name + '」损失惨重，此地不再宜居。', 3); }
        else if (t !== s) logSys(u, t, '邻近超新星的辐射让这里不再宜居。', 2);
      } else if (c && c.alive) { c.stab -= 0.15; c.pop *= 0.85; logSys(u, t, d.toFixed(0) + ' 光年外的超新星照亮了「' + c.name + '」的夜空，引发恐慌与辐射病。', 2); }
      pushState(u, t);
    });
  }

  function expand(u, c, owned) {
    var range = Math.min(25 + (c.tech - 55) * 1.5, 80);
    var best = null, bd = 1e9;
    u.systems.forEach(function (s) {
      if (s.owner != null || s.dead) return;
      if (!s.habitable && c.tech < 70) return;
      owned.forEach(function (o) { var d = u.D[o.id][s.id]; if (d <= range && d < bd) { bd = d; best = s; } });
    });
    if (best) {
      best.owner = c.id; c.pop *= 0.97;
      logSys(u, best, '「' + c.name + '」的殖民舰队抵达，在这里建立了殖民地。', 2);
      pushState(u, best);
    }
  }

  function detectRange(c) { return c.tech < 40 ? 0 : 10 + (c.tech - 40) * 1.2; }
  function minDist(u, a, b) {
    var m = 1e9;
    u.systems.forEach(function (s) { if (s.owner !== a.id) return; u.systems.forEach(function (t) { if (t.owner === b.id) m = Math.min(m, u.D[s.id][t.id]); }); });
    return m;
  }
  function detects(u, a, b, dist) {
    if (dist <= detectRange(a)) return true;
    if (a.tech >= 60) return u.systems.some(function (s) { return s.owner === b.id && (s.exposure >= 1 || (a.mapKnown && a.mapKnown[s.id])); });
    return false;
  }

  function interactions(u) {
    var alive = u.civs.filter(function (c) { return c.alive; });
    for (var i = 0; i < alive.length; i++) for (var j = 0; j < alive.length; j++) {
      if (i === j) continue;
      var a = alive[i], b = alive[j];
      if (!a.alive || !b.alive || a.blackDomain || b.blackDomain) continue;
      var dist = minDist(u, a, b);
      if (dist > 1e8 || !detects(u, a, b, dist)) continue;
      var key = relKey(a.id, b.id), r = u.rel[key];

      // 黑暗森林：高等文明抹除被发现的弱者
      if (a.tech >= 75 && a.tech - b.tech >= 8 && a.stab > 0.3 && (!r || r.type !== '贸易')) {
        var bs = ownedSystems(u, b);
        var expo = 0; bs.forEach(function (s) { expo = Math.max(expo, s.exposure); });
        if (rnd(u) < 0.0018 * (0.3 + a.exp) * (1 + 2 * expo)) {
          var target = bs.slice().sort(function (x, y) { return y.exposure - x.exposure; })[0];
          scheduleStrike(u, '光粒', target, a.id, dist / 0.99, '', huntWhy(u, a, b, target, dist));
          continue;
        }
      }
      // 接触：只处理 i<j 一次，且需双向探测
      if (a.id > b.id || !detects(u, b, a, dist)) continue;
      if (!r) {
        if (rnd(u) < 0.05) {
          var hostile = rnd(u) < (a.exp + b.exp) / 2 * 0.7 && (a.tech >= 55 || b.tech >= 55);
          u.rel[key] = { type: hostile ? '战争' : '贸易', since: u.simYear };
          if (hostile) addFact(u, 'war', { sys: a.home, actor: ck(a), target: ck(b), data: { how: 'contact' } });
          var txt = hostile ? '「' + a.name + '」与「' + b.name + '」首次接触，随即爆发星际战争。' : '「' + a.name + '」与「' + b.name + '」首次接触，开始交换知识与货物。';
          logCiv(u, a, txt, 3); logCiv(u, b, txt, 3);
        }
      } else if (r.type === '贸易') {
        if (u.simYear - r.since > 120 && rnd(u) < 0.002 * (a.exp + b.exp) / (1 + 2 * (r.breaks || 0))) {
          r.type = '战争'; r.since = u.simYear; r.breaks = (r.breaks || 0) + 1;
          addFact(u, 'war', { sys: a.home, actor: ck(a), target: ck(b), data: { how: 'break' } });
          if (r.breaks <= 2) { var t1 = r.breaks === 1 ? '「' + a.name + '」与「' + b.name + '」的贸易破裂，战争爆发。' : '「' + a.name + '」与「' + b.name + '」旧怨复燃，再次开战。'; logCiv(u, a, t1, 2); logCiv(u, b, t1, 2); }
        }
      } else if (r.type === '战争') {
        if (rnd(u) < 0.03) battle(u, a, b, dist);
        // 战争中的同归于尽式威慑：向全宇宙广播敌人的坐标
        if (rnd(u) < 0.0015 && !a.silent && a.tech >= 50) { var eh = u.systems[b.home]; if (eh.owner === b.id) { addExpo(eh, 3, 'war'); logCiv(u, a, '「' + a.name + '」在战争中向全宇宙广播了「' + b.name + '」的坐标。', 3); logSys(u, eh, '「' + b.name + '」的坐标被敌人广播到了全宇宙。', 3); } }
        if (u.rel[key] && rnd(u) < 0.02) { r.type = rnd(u) < 0.5 ? '贸易' : '停战'; r.since = u.simYear; r.peaces = (r.peaces || 0) + 1; if (r.peaces <= 2) { var t2 = r.peaces === 1 ? '「' + a.name + '」与「' + b.name + '」签订和约（' + r.type + '）。' : '「' + a.name + '」与「' + b.name + '」再次握手言和。'; logCiv(u, a, t2, 2); logCiv(u, b, t2, 2); } }
      } else if (r.type === '停战') {
        if (rnd(u) < 0.003) r.type = '贸易';
      }
    }
  }
  // 黑暗森林清理的原因（写进打击记录，供因果句和史实使用）
  function huntWhy(u, a, b, target, dist) {
    var why = dist <= detectRange(a) ? { kind: 'detect' } : a.mapKnown && a.mapKnown[target.id] && target.exposure < 1 ? { kind: 'map' } : { kind: domKind(target.ex) };
    why.who = '「' + a.name + '」'; why.see = u.simYear; why.emit = u.simYear - dist; why.gift = b.giftYear;
    var enb = enablerFact(u, a, u.simYear); if (enb) why.help = enb.id;
    if (why.kind === 'map') { var tf = factQuery(u, { type: 'told', target: ck(a), known: 'any' }, evCtx(u, null, null, null)); if (tf.length) why.told = tf[tf.length - 1].id; }
    return why;
  }
  function power(c) { return DM.pow(c.tech, 2) * DM.pow(c.pop, 0.3) * (0.3 + c.stab); }
  function battle(u, a, b, dist) {
    var pa = power(a), pb = power(b);
    var win = rnd(u) < pa / (pa + pb) ? a : b, lose = win === a ? b : a;
    if (win.tech < 55) return;
    var ls = ownedSystems(u, lose).filter(function (s) { return true; });
    var ws = ownedSystems(u, win);
    var reach = Math.min(25 + (win.tech - 55) * 1.5, 80);
    var cands = ls.filter(function (s) { return ws.some(function (w) { return u.D[w.id][s.id] <= reach; }); });
    if (!cands.length) return;
    var s = pick(u, cands);
    var share = 1 / ls.length;
    lose.pop *= 1 - share * 0.8; lose.stab -= 0.1;
    s.owner = win.id;
    logSys(u, s, '「' + win.name + '」攻陷了这里，「' + lose.name + '」的旗帜被降下。', 3);
    pushState(u, s); rehome(u, lose);
    if (!ownedSystems(u, lose).length) extinguish(u, lose, '被「' + win.name + '」征服');
  }
  /* =====================================================================
   *  黑暗森林 · 神级文明（歌者）· 二向箔 · 宇宙维度坍缩
   *
   *  暴露度 exposure（每个星系，0 ~ 10）：来源 = 无线电泄漏（信息时代）、曲率航迹（每次曲率出发/抵达 +0.6）、
   *    坐标广播（+3，玩家或交战文明都可能做）、被高等文明抽取坐标（+1）。每年衰减 0.4%；静默的文明衰减更快。
   *  打击都有飞行时间，不会瞬间到达：
   *    光粒：普通星海文明（科技 ≥ 75）对探测到的弱者发动，飞行时间 = 距离 / 0.99c。
   *    歌者（神级文明，科技 150，不可接触）：它的清理者在星图外巡航。某星系暴露度 ≥ 1.0 时，
   *      这个「坐标」要先以光速传到歌者那里（光延迟 = 距离），歌者随手决定是否清理（概率随暴露度上升），
   *      武器再以 0.99c 飞回来。目标是星际以上文明或暴露度 ≥ 2.5 → 二向箔；否则 → 光粒。
   *  二向箔：命中后，以命中点为中心，三维空间以光速跌落成二维（半径每年 +1 光年），扩张到 10~22 光年后停止。
   *    半径只增不减；被吞没的星系永久变成「二维的画」。
   *    科技 ≥ 75 的文明能在二向箔抵达前发现它，用曲率飞船逃出一支流亡舰队（成为新文明）。
   *    飞船：停留（冬眠/被扣留）在被吞没的星系里会被一起压平；从受威胁的星系出发时，
   *    常规推进（0.03c）跑不过光速扩张的前沿，曲率驱动（无限接近光速）才能逃掉。
   *  静默与黑域：文明看到附近打击的闪光（按光延迟）后，科技 ≥ 45 的会全面静默；
   *    科技 ≥ 100 的可能建造黑域（把自己星系的光速降到 16.7 km/s）：从此绝对安全，但永远与宇宙隔绝、科技冻结。
   *  宇宙维度：每一次二向箔（包括星图之外、银河其他角落的降维打击，约每 1500 年一次且越来越频繁）
   *    都会让宇宙的维度永久流失一点：维度 = 3 − 0.012 × 降维次数。
   *    累积到一定程度会出现物理常数漂移、归零者的「回归运动」广播，最终进入低维化末期。
   * ===================================================================== */
  var EXPO_MAX = 10, SINGER_THRESH = 1.0, SINGER_P0 = 0.006, SINGER_P1 = 0.03, SINGER_TK = 0.006;
  /* 暴露度按来源分开记账，每种来源衰减速度不同：
   *   trail   你的曲率航迹（半衰期约 46 年）      contact 你和当地的通讯往来（约 35 年）
   *   bcast   你的坐标广播（约 230 年）            leak    你的星图被抽走后流传出去的坐标（约 115 年）
   *   radio   文明自己的无线电泄漏（约 170 年）    civ     文明自己的星际交通（约 170 年）
   *   war     交战敌人广播的坐标（约 230 年）
   * 每 4 年存一次快照：歌者看到的永远是「光延迟之前」那一刻的暴露度，而不是历史最大值。 */
  var EXPO_DECAY = { trail: 0.985, contact: 0.98, bcast: 0.997, leak: 0.994, radio: 0.996, civ: 0.996, war: 0.997, misc: 0.996 };
  var PLAYER_KINDS = { trail: 1, contact: 1, bcast: 1, leak: 1 };
  function sumExpo(s) { var t = 0; for (var k in s.ex) t += s.ex[k]; s.exposure = clamp(t, 0, EXPO_MAX); }
  function addExpo(s, v, kind) {
    kind = kind || 'misc'; s.ex = s.ex || {};
    v = Math.min(v, Math.max(0, EXPO_MAX - s.exposure));
    s.ex[kind] = (s.ex[kind] || 0) + v; sumExpo(s);
  }
  function decayExpo(s, f) { if (!s.ex) return; for (var k in s.ex) s.ex[k] *= f; sumExpo(s); }
  function clearExpo(s) { s.ex = {}; s.exposure = 0; }
  function domKind(ex) { var best = 'misc', bv = -1; for (var k in (ex || {})) if (ex[k] > bv) { bv = ex[k]; best = k; } return best; }
  function yearExpo(u, s) {
    if (s.ex) { for (var k in s.ex) { s.ex[k] *= EXPO_DECAY[k] || 0.996; if (s.ex[k] < 1e-4) s.ex[k] = 0; } sumExpo(s); }
    if (u.simYear % 4 === 0 && (s.exposure > 0.05 || (s.eh && s.eh.length))) {
      s.eh = s.eh || []; var snap = {}; for (var k2 in s.ex) if (s.ex[k2] > 0.005) snap[k2] = +s.ex[k2].toFixed(4);
      s.eh.push({ y: u.simYear, e: +s.exposure.toFixed(4), ex: snap });
      if (s.eh.length > 110) s.eh.shift();
    }
  }
  // 光延迟：某一年从这个星系出发的光里，带着多少暴露度
  function seenExpo(s, y) {
    var h = s.eh; if (!h || !h.length || y < h[0].y) return null;
    for (var i = h.length - 1; i >= 0; i--) if (h[i].y <= y) return y - h[i].y <= 8 ? h[i] : null;
    return null;
  }
  function singerDist(u, s) { return DM.hyp(u.singer.x - s.x, u.singer.y - s.y); }
  function dimOf(u) { return 3 - 0.012 * u.dimStrikes; }
  function flatR(f, y) { return clamp(y - f.y0, 0, f.rmax); }
  function cosmic(u, text) { u.cosmicEvents.push({ y: u.simYear, t: text }); }

  function scheduleStrike(u, type, target, by, delay, note, cause) {
    if (target.targeted || target.flat || (target.dead && target.owner == null)) return;   // 已经死寂的星系不再值得打
    target.targeted = true;
    // 武器以 0.99c 飞行：抵达年份向上取整（四舍五入会让 50 光年内的打击比光还早到，违反 t ≥ d/c）
    var A = by !== 'singer' ? u.civs[by] : null, fs = null;
    if (A) {   // 从离目标最近的己方星系发射；飞行时间不能短于这段距离 / 0.99c
      u.systems.forEach(function (s) { if (s.owner === A.id && (fs == null || u.D[s.id][target.id] < u.D[fs][target.id])) fs = s.id; });
      if (fs == null) fs = A.home;
      delay = Math.max(delay, u.D[fs][target.id] / 0.99);
    }
    var st = { type: type, target: target.id, by: by, launch: u.simYear, arrive: u.simYear + Math.max(1, Math.ceil(delay - 1e-9)), note: note || '', cause: cause || null };
    u.strikes.push(st);
    if (A) {   // 文明发射的光粒：发射处的闪光以光速传开（歌者的发射在星图之外，看不见）
      st.fromSys = fs;
      var V = target.owner != null ? u.civs[target.owner] : null;
      if (V) addFact(u, 'strike_launch', { sys: st.fromSys, actor: ck(A), target: ck(V), data: { arriveY: yr(st.arrive), weapon: type, arrive: st.arrive, tsys: target.id, si: u.strikes.length - 1 } });
    }
    return st;
  }

  function cosmicStep(u) {
    // 1) 歌者扫描：坐标的光要先传到歌者那里
    u.systems.forEach(function (s) {
      if (s.flat || isSealed(u, s) || s.targeted || (s.dead && s.owner == null)) return;
      // 歌者此刻看到的，是 dS 年前从这里出发的光：用那一刻的暴露度快照，而不是历史最大值
      var dS = singerDist(u, s), h = seenExpo(s, u.simYear - dS);
      if (!h) return;
      // 两部分：总暴露度越过阈值后的常规概率；外加曲率航迹 / 通讯这种「人造信号」本身的辨识度（不需要越过阈值，但会随时间衰减）
      var hx = h.ex || {}, pSig = s.owner != null ? SINGER_TK * ((hx.trail || 0) + (hx.contact || 0)) : 0;
      var pBase = h.e >= SINGER_THRESH ? Math.min(0.25, SINGER_P0 + SINGER_P1 * (h.e - SINGER_THRESH)) : 0;
      if (pBase + pSig <= 0) return;
      if (rnd(u) < pBase + pSig) {
        var c = s.owner != null ? u.civs[s.owner] : null;
        var foil = (c && c.tech >= 55) || h.e >= 2.5;
        var cause = { kind: pSig > pBase ? ((hx.trail || 0) >= (hx.contact || 0) ? 'trail' : 'contact') : domKind(h.ex), who: '歌者', emit: h.y, see: u.simYear, gift: c ? c.giftYear : null, expo: h.e };
        scheduleStrike(u, foil ? '二向箔' : '光粒', s, 'singer', dS / 0.99, '歌者在纪元 ' + u.simYear + ' 年看到了这里的坐标', cause);
      }
    });
    // 2) 打击抵达
    for (var i = 0; i < u.strikes.length; i++) {
      var st = u.strikes[i];
      if (st.done || st.arrive > u.simYear) continue;
      st.done = true;
      var s = u.systems[st.target]; s.targeted = false;
      if (isSealed(u, s)) { logSys(u, s, '一次来自深空的打击撞上了「' + u.civs[s.owner].name + '」的黑域，没有造成任何伤害。', 2); st.wasted = true; continue; }
      if (s.flat || (s.dead && s.owner == null)) { st.wasted = true; continue; }
      if (st.type === '二向箔') foilHit(u, s, st);
      else particleHit(u, s, st);
      u.flashes.push({ sys: s.id, y: u.simYear, seen: {} });
    }
    // 3) 二维化区域扩张（半径只增不减）
    u.flats.forEach(function (f) {
      var r = flatR(f, u.simYear); f.r = Math.max(f.r, r);
      u.systems.forEach(function (s) {
        if (!s.flat && DM.hyp(s.x - f.x, s.y - f.y) <= f.r) flatten(u, s, f);
      });
    });
    // 4) 文明看到打击闪光（按光延迟）→ 静默 / 黑域
    u.flashes.forEach(function (fl) {
      if (u.simYear - fl.y > 160) return;
      u.civs.forEach(function (c) {
        if (!c.alive || fl.seen[c.id] || c.blackDomain) return;
        var d = 1e9; u.systems.forEach(function (s) { if (s.owner === c.id) d = Math.min(d, u.D[s.id][fl.sys]); });
        if (d > 120 || u.simYear < fl.y + d) return;
        fl.seen[c.id] = true;
        if (c.tech >= 100 && d <= 60 && rnd(u) < 0.15) {
          c.blackDomain = true; c.silent = true;
          u.systems.forEach(function (s) { if (s.owner === c.id) { clearExpo(s); logSys(u, s, '「' + c.name + '」看到 ' + d.toFixed(0) + ' 光年外的打击，建造了黑域：光速降到 16.7 km/s。从此绝对安全，也永远出不来了。', 3); pushState(u, s); } });
        } else if (c.tech >= 45 && !c.silent) {
          c.silent = true; c.exp *= 0.8;
          logCiv(u, c, '「' + c.name + '」看到了 ' + d.toFixed(0) + ' 光年外的打击闪光，全面静默：关闭所有对外广播，藏起来。', 2);
        }
      });
    });
    // 5) 宇宙维度：星图之外，银河的其他角落也在发生降维打击（越往后越频繁），一起计入
    if (rnd(u) < (1 / 1500) * (1 + u.simYear / 10000)) {
      u.dimStrikes++; u.farStrikes = (u.farStrikes || 0) + 1; u.dimLog.push({ y: u.simYear, n: u.dimStrikes });
      if (u.farStrikes === 1) cosmic(u, '望远镜在银河远处看到一次奇异的闪光：一片区域的星光突然变成了平面的光谱。那是星图之外的一次降维打击。');
    }
    var n = u.dimStrikes;
    [[1, '宇宙中第一次出现了降维打击。'], [4, '天文学家测到物理常数的微小漂移：宇宙的维度正在流失（' + dimOf(u).toFixed(3) + '）。'],
     [8, '一段来自宇宙边缘的广播被所有文明收到：「归零者」发起「回归运动」，呼吁所有文明停止降维与降低光速，让宇宙回到十维的田园时代。'],
     [15, '低维化末期：降维打击已无法逆转，越来越多的空间正在跌落。宇宙正在慢慢变成一幅画。']].forEach(function (th) {
      if (n >= th[0] && !u.cosmicFlags[th[0]]) { u.cosmicFlags[th[0]] = true; cosmic(u, th[1]); }
    });
  }
  function isSealed(u, s) { return s.owner != null && u.civs[s.owner].blackDomain; }

  function particleHit(u, s, st) {
    var c = s.owner != null ? u.civs[s.owner] : null;
    var src = st.by === 'singer' ? '来自星图之外的' : '来自深空的';
    if (c && c.alive) {
      var n = ownedSystems(u, c).length;
      c.pop *= 1 - 1 / n; c.stab -= 0.3;
      s.owner = null; s.ruins.push(c.name); (s.ruinTech = s.ruinTech || []).push(c.peakTech);
      s.dead = true; s.habitable = false;   // A4：先标记死寂，再写史实——史实会触发事件（遗民舰队找落脚点），不能把刚熄灭的恒星当成「安全星系」
      logSys(u, s, '一枚' + src + '「光粒」击中了这颗恒星。「' + c.name + '」在这里的一切瞬间化为灰烬。', 3);
      var Ab = st.by !== 'singer' ? u.civs[st.by] : null;
      if (Ab && Ab.alive && u.systems[Ab.home].owner === Ab.id) logSys(u, u.systems[Ab.home], '「' + Ab.name + '」清理了一个' + (st.cause && st.cause.kind === 'map' ? '星图上标着的' : st.cause && st.cause.kind === 'detect' ? '被监听网发现的' : '暴露坐标的') + '文明（「' + c.name + '」）。', 2);
      if (st.by === 'singer') s.singerMark = true;
      clearedFact(u, s, st, c);
      rehome(u, c);
    } else logSys(u, s, '一枚' + src + '「光粒」击中了这颗恒星，它在一瞬间熄灭。', 3);
    s.dead = true; s.habitable = false;
    pushState(u, s);
    if (c && c.alive && !ownedSystems(u, c).length) extinguish(u, c, st.by === 'singer' ? '歌者的光粒' : '黑暗森林打击');
  }

  // 打击命中：写一条「清理」史实（谁、打了谁、因为什么、你有没有份）
  var PLAYER_WHY = { trail: '你的曲率航迹', contact: '你和他们的通讯', bcast: '你的坐标广播', leak: '你被抽走的星图', map: '你带回母星的星图' };
  function clearedFact(u, s, st, c) {
    if (!c) return;
    var cz = st.cause || {}, data = { victim: c.name, kind: cz.kind || 'misc', weapon: st.type, wasHome: s.id === c.home };
    if (cz.help != null) data.help = cz.help;
    if (PLAYER_WHY[cz.kind]) { data.player = true; data.why = PLAYER_WHY[cz.kind]; }
    else if (cz.kind === 'radio' && cz.gift != null && cz.emit != null && cz.gift <= cz.emit) { data.player = true; data.why = '你留下的技术带来的无线电泄漏'; }
    addFact(u, 'cleared', { sys: s.id, actor: st.by === 'singer' ? 'singer' : 'civ:' + st.by, target: ck(c), data: data, cause: cz.told != null ? cz.told : cz.help != null ? cz.help : null });
  }
  function foilHit(u, s, st) {
    var f = { id: u.flats.length, x: s.x, y: s.y, y0: u.simYear, rmax: R(u, 10, 22), r: 0, origin: s.id };
    u.flats.push(f); u.dimStrikes++; u.dimLog.push({ y: u.simYear, n: u.dimStrikes });
    var c0 = s.owner != null ? u.civs[s.owner] : null; if (c0 && c0.alive) clearedFact(u, s, st, c0);
    s.singerMark = true;
    logSys(u, s, '一片小小的、薄薄的纸条飘进了这个星系——二向箔。三维空间开始以光速跌落成二维。', 3);
    // 能看见它飞来的星海文明，提前坐曲率飞船逃亡
    u.civs.forEach(function (c) {
      if (!c.alive || c.tech < 75 || c.blackDomain) return;
      var threatened = u.systems.filter(function (t) { return t.owner === c.id && DM.hyp(t.x - f.x, t.y - f.y) <= f.rmax; });
      if (!threatened.length) return;
      var share = threatened.length / ownedSystems(u, c).length;
      var safe = u.systems.filter(function (t) { return t.owner == null && !t.dead && !t.flat && DM.hyp(t.x - f.x, t.y - f.y) > f.rmax + 3; })
        .sort(function (a, b) { return u.D[threatened[0].id][a.id] - u.D[threatened[0].id][b.id]; })[0];
      var who = '「' + c.name + '」';
      if (!safe) { threatened.forEach(function (t) { logSys(u, t, who + '提前发现了二向箔，曲率飞船四散逃离，消失在深空中。', 3); }); return; }
      var d = { id: u.civs.length, root: c.root, name: c.root + '流亡舰队', color: COLORS[u.civs.length % COLORS.length], home: safe.id,
        pop: Math.max(0.01, c.pop * share * 0.06), tech: c.tech, peakTech: c.tech, res: 1, exp: c.exp, stab: 0.4, alive: true, born: u.simYear, era: eraOf(c.tech),
        legends: c.legends.slice(), att: c.att, attYear: c.attYear, tag: c.tag, giftYear: c.giftYear, interstellarYear: c.interstellarYear,
        endYear: null, endCause: null, formerNames: [c.name], parent: c.id, diaspora: true, silent: true, temper: c.temper };
      u.civs.push(d); safe.owner = d.id; d.res = cap(u, d);
      addFact(u, 'diaspora', { sys: safe.id, actor: ck(d), target: ck(c), data: { from: c.name } });
      threatened.forEach(function (t) { logSys(u, t, who + '在二向箔抵达前发现了它。只有极少数人登上曲率飞船，逃往 ' + safe.name + '。', 3); });
      logSys(u, safe, '一支流亡舰队抵达：' + who + '的幸存者在这里建立了「' + d.name + '」。', 3);
      pushState(u, safe);
    });
    cosmicStep_flatNow(u, f);
  }
  function cosmicStep_flatNow(u, f) { var s = u.systems[f.origin]; if (!s.flat) flatten(u, s, f); }

  function flatten(u, s, f) {
    var c = s.owner != null ? u.civs[s.owner] : null;
    s.flat = true; s.dead = true; s.habitable = false; s.flatYear = u.simYear; s.flatBy = f.id;
    u.strikes.forEach(function (st) { if (st.target === s.id && !st.done) st.wasted = true; });   // 还在路上的打击只会飞进一幅画里
    if (c && c.alive) {
      var n = ownedSystems(u, c).length;
      c.pop *= 1 - 1 / n; s.owner = null; s.ruins.push(c.name); (s.ruinTech = s.ruinTech || []).push(c.peakTech);
      logSys(u, s, '二维化的前沿扫过这里。「' + c.name + '」的城市、海洋和每一个人，都被压成了一幅无限薄的画。', 3);
      rehome(u, c);
      if (!ownedSystems(u, c).length) extinguish(u, c, '二向箔降维');
    } else logSys(u, s, '二维化的前沿扫过这里，这个星系变成了一幅画。', 3);
    pushState(u, s);
  }

  // 飞船是否被二维化吞没：出发时的逃逸判定（径向近似）
  function escapeCheck(u, fromId, beta, t0, ext) {
    var s = u.systems[fromId];
    for (var i = 0; i < u.flats.length; i++) {
      var f = u.flats[i], d = DM.hyp(s.x - f.x, s.y - f.y), R0 = flatR(f, t0);
      if (d > f.rmax || R0 >= f.rmax) continue;          // 不在威胁范围，或已停止扩张
      var gap = Math.max(0.5, d - R0);                     // 已被吞没的星系，飞船停在平面边缘 0.5 光年
      var tc = gap / (1 - beta);                           // 前沿追上飞船所需时间
      if (R0 + tc <= f.rmax && tc <= ext) return { f: f, y: t0 + tc };
    }
    return null;
  }
  // 停留（冬眠 / 扣留）期间是否被吞没
  function stayCheck(u, sysId, t0, t1) {
    var s = u.systems[sysId];
    for (var i = 0; i < u.flats.length; i++) {
      var f = u.flats[i], d = DM.hyp(s.x - f.x, s.y - f.y);
      if (d > f.rmax) continue;
      var edge = s.flat && s.flatYear < t0 ? 0.5 : 0;
      if (flatR(f, t1) >= d + edge && flatR(f, t0) < f.rmax) return { f: f, y: Math.max(t0, f.y0 + d) };
    }
    return null;
  }
  function killShip(u, cause) { if (!u.ship.dead) u.ship.dead = { y: u.simYear, cause: cause }; }
  function clampAge(u) { if (u.ship.crewAge0 + u.ship.bio > LIFESPAN) u.ship.bio = LIFESPAN - u.ship.crewAge0; }

  // 光速延迟的消息：在光到达那一刻（精确时刻，不取整）写进目标星系的时间线
  function deferLog(u, sysId, y, text, imp) { (u.defer = u.defer || []).push({ s: sysId, y: y, t: text, imp: imp || 2 }); u.defer.sort(function (a, b) { return a.y - b.y; }); }
  function flushDefer(u, t) {
    while (u.defer && u.defer.length && u.defer[0].y <= t + 1e-9) {
      var e = u.defer.shift(), s = u.systems[e.s];
      if (!s.flat) s.timeline.push({ y: e.y, t: e.t, imp: e.imp });
    }
  }
  function simulateTo(u, t) {
    u.time = t; u.inSim = true;
    while (u.simYear < Math.floor(t)) stepYear(u);
    flushDefer(u, t);
    u.inSim = false;
  }

  // ---------- 玩家 ----------
  /* 航行规则：没有任何东西能超光速，外部时间永远 ≥ 距离 / c；船上固有时 = 外部时间 / γ。
   *  常规推进：无论什么能源、有无工质，都不可能接近光速。上限取 0.03c（可选 0.01c / 0.03c）。
   *     γ ≈ 1，船上时间 ≈ 外部时间，一趟动辄几千年；舰员全程在冬眠舱里，生理衰老降到 1/50。
   *     加速段（几天到几周）相对几千年的航程可忽略。
   *  曲率驱动（《三体》设定）：唯一能接近光速的方式。几乎瞬间加速到 0.999c / 0.9999c / 0.99999c，
   *     外部时间 = 距离/β ≈ 距离/c，船上时间 = 外部时间/γ，极短，舰员清醒航行。
   *     代价：在出发地和目的地留下长久可见的曲率航迹，暴露坐标，提高黑暗森林打击风险。
   *  原地冬眠：飞船静止，船上时间 = 外部时间，舰员生理衰老 1/50。 */
  var SPEEDS = [0.01, 0.03];
  var WARP_SPEEDS = [0.999, 0.9999, 0.99999];
  var CRYO = 50;            // 冬眠舱：生理衰老速度 1/50
  var LIFESPAN = 105;       // 舰员寿命上限（生理年龄）
  var WARP_SUPPLY = 4;      // 启动一次曲率航行至少需要的补给
  var TRAIL = 0.35;         // 每次曲率出发 / 抵达留下的航迹暴露度（会随时间衰减）
  var SHIP_NAMES = ['萤火号', '拾光号', '远行者号', '归途号', '长夜号', '溯洄号', '望舒号', '启明号', '孤帆号', '回声号'];
  function isWarp(mode) { return String(mode).charAt(0) === 'w'; }
  // 补给（B1）：曲率 = 启动 4 + 距离/25 + 速度档附加（0.9999c +2，0.99999c +4：γ 越大舰员老得越慢，代价也越高）；常规推进 = 外部年数/100
  function supplyCost(tc) { return tc.warp ? 4 + tc.d / 25 + (tc.beta >= 0.99999 ? 4 : tc.beta >= 0.9999 ? 2 : 0) : tc.ext / 100; }
  function tripCalc(u, toId, mode) {
    var d = u.D[u.ship.at][toId], warp = isWarp(mode);
    var beta = warp ? +String(mode).slice(1) : +mode;
    var g = 1 / Math.sqrt(1 - beta * beta), ext = d / beta, ship = ext / g;
    var tc = { d: d, mode: mode, ext: ext, ship: ship, bio: warp ? ship : ship / CRYO, gamma: g, beta: beta, warp: warp,
      label: (warp ? '曲率驱动 ' : '常规推进 ') + beta + 'c' };
    tc.supply = supplyCost(tc); tc.warpOk = !warp || (u.ship.supply == null ? 100 : u.ship.supply) >= WARP_SUPPLY;
    tc.ageAfter = u.ship.crewAge0 + u.ship.bio + tc.bio; tc.dies = tc.ageAfter >= LIFESPAN;
    return tc;
  }
  function crewAge(u) { return u.ship.crewAge0 + u.ship.bio; }

  function snapshot(u, s) {
    var c = s.owner != null ? u.civs[s.owner] : null;
    return { year: u.simYear, shipYears: u.ship.shipYears, bio: u.ship.bio, sysName: s.name, type: s.type, dead: s.dead, habitable: s.habitable,
      civId: c ? c.id : null, civName: c ? c.name : null, era: c ? eraLabel(c) : null, eraBase: c ? (c.era || eraOf(c.tech)) : null,
      pop: c ? c.pop : 0, tech: c ? c.tech : 0, stab: c ? c.stab : 0, timelineLen: s.timeline.length, ruins: s.ruins.slice(), flat: !!s.flat, sealed: isSealed(u, s) };
  }
  function remember(u, sysId) { u.memory[sysId] = snapshot(u, u.systems[sysId]); }
  function isEarthLine(u, c) { var k = 0; while (c && k++ < 50) { if (c.root === '地球') return true; c = c.parent != null ? u.civs[c.parent] : null; } return false; }
  function seenHome(u, from) { return stateAt(u.systems[0], u.simYear - u.D[from][0]); }

  // 冬眠事故：每 100 年冬眠约 1.5%；补给不足 10 时概率 ×3，且可能致命
  function cryoAccidents(u, years) {
    var out = { notes: [], fatal: false, at: 0 }, done = 0;
    while (done < years) {
      var span = Math.min(100, years - done), low = u.ship.supply < 10;
      if (rnd(u) < 0.015 * (low ? 3 : 1) * span / 100) {
        var at = done + rnd(u) * span;
        if (low && rnd(u) < 0.5) { out.fatal = true; out.at = at; return out; }
        u.ship.supply = Math.max(0, u.ship.supply - 12); u.ship.bio += 2;
        out.notes.push(pick(u, ['冬眠第 ', '航行第 ', '沉睡的第 ']) + Math.round(at) + ' 年，' + pick(u, ['一台冬眠舱的冷却回路破裂', '一次微陨石撞击击穿了舱壁', '主控电脑在漫长的待机中出现故障']) + '。舰员被紧急唤醒抢修，耗掉了不少补给，也多老了几岁。');
      }
      done += span;
    }
    return out;
  }
  function deathText(u, why, ctx) {
    if (why === '寿终') return ctx.awake ? '漫长的航程里，舰员一个接一个老去。最后一位舰员在 ' + LIFESPAN + ' 岁时停止了呼吸。飞船仍按航线飞向' + ctx.to + '，但再也没有人醒来。'
      : '冬眠只能延缓衰老，不能阻止它。最后一位舰员在冬眠舱里走到了 ' + LIFESPAN + ' 岁。飞船' + (ctx.moving ? '仍按航线飞向' + ctx.to : '仍静静停在' + ctx.to) + '，但再也没有人醒来。';
    if (why === '事故') return '补给耗尽后，飞船再也无力修复冬眠舱的故障。在' + ctx.to + (ctx.moving ? '的航线上' : '') + '，冬眠舱一个接一个熄灭了。';
    return ctx.text;
  }
  function earliest(a, b) { return !a ? b : !b ? a : (b.y < a.y ? b : a); }

  // 出发：先记住当前星系离开时的样子，再推进时间
  function travel(u, toId, mode) {
    if (u.ship.dead) return deadResult(u);
    var from = u.ship.at, notes = [];
    remember(u, from);
    var tc = tripCalc(u, toId, mode);
    if (tc.warp && !tc.warpOk) { notes.push({ cls: 'warn', t: '补给只剩 ' + u.ship.supply.toFixed(0) + '，不够启动曲率引擎。你只能改用常规推进 0.03c。' }); mode = '0.03'; tc = tripCalc(u, toId, mode); }
    var t0 = u.time, death = null, bio0 = u.ship.bio;
    var caught = escapeCheck(u, from, tc.beta, t0, tc.ext);
    if (caught) death = { y: caught.y, why: '二维', text: '刚离开' + u.systems[from].name + '不久，以光速扩张的二维平面就追上了以 ' + tc.beta + 'c 航行的飞船。' };
    if (!tc.warp) { var acc = cryoAccidents(u, tc.ext); notes = notes.concat(acc.notes.map(function (t) { return { cls: 'warn', t: t }; })); if (acc.fatal) death = earliest(death, { y: t0 + acc.at, why: '事故' }); }
    var left = LIFESPAN - crewAge(u);
    if (tc.bio >= left) death = earliest(death, { y: t0 + tc.ext * Math.max(0, left) / tc.bio, why: '寿终' });
    if (tc.warp) addExpo(u.systems[from], TRAIL, 'trail');           // 出发处的曲率航迹
    var tEnd = death ? death.y : t0 + tc.ext, f = tc.ext > 0 ? (tEnd - t0) / tc.ext : 1;
    simulateTo(u, tEnd);
    u.ship.shipYears += tc.ship * f; u.ship.bio += tc.bio * f;
    u.ship.supply = Math.max(0, u.ship.supply - tc.supply * f);
    var trip = { n: u.ship.trips.length + 1, from: from, to: toId, label: tc.label, d: tc.d, ext: tc.ext, ship: tc.ship, gamma: tc.gamma,
      bio: u.ship.bio - bio0, warp: tc.warp, depart: t0, arrive: tEnd, shipAfter: u.ship.shipYears, crewAge: crewAge(u) };
    u.ship.trips.push(trip);
    if (death) {
      trip.frac = f; trip.died = death.why; trip.caught = death.why === '二维'; trip.arrive = tEnd;
      killShip(u, deathText(u, death.why, { awake: tc.warp, moving: true, to: u.systems[toId].name, text: death.text }));
      return { trip: trip, report: deathReport(u, from, trip, notes) };
    }
    if (tc.warp) addExpo(u.systems[toId], TRAIL, 'trail');           // 抵达处的曲率航迹（抵达那一刻才出现）
    u.ship.at = toId;
    var rep = arrivalReport(u, toId, trip);
    rep.notes = notes.concat(rep.notes || []);
    u._rep = rep; rep.encounter = encounter(u, toId, trip); u._rep = null;
    if (u.ship.dead) { rep.death = true; rep.deathCause = u.ship.dead.cause; destinyCheck(u, rep, u.ship.at); }
    trip.crewAge = crewAge(u); trip.shipAfter = u.ship.shipYears; trip.detained = rep.encounter.detained || 0;
    return { trip: trip, report: rep };
  }
  // 原地停留若干年（冬眠 / 扣留 / 展出），逐段推进，途中检查二维化与寿命。返回实际经过的年数
  function passTime(u, sysId, years, bioRate, ctx) {
    var t0 = u.time, cur = t0, tEnd = t0 + years, death = null;
    if (ctx.cryo) { var acc = cryoAccidents(u, years); ctx.notes = (ctx.notes || []).concat(acc.notes); if (acc.fatal) death = { y: t0 + acc.at, why: '事故' }; }
    var left = LIFESPAN - crewAge(u);
    if (years * bioRate >= left) death = earliest(death, { y: t0 + Math.max(0, left) / bioRate, why: '寿终' });
    if (death) tEnd = death.y;
    while (cur < tEnd) {
      var nxt = Math.min(tEnd, cur + 10);
      simulateTo(u, nxt);
      var dz = stayCheck(u, sysId, cur, nxt);
      if (dz) { death = { y: Math.max(cur, Math.min(nxt, dz.y)), why: '二维', text: ctx.flatText.replace('$Y', yr(dz.y)) }; tEnd = death.y; break; }
      // 停靠的恒星被光粒熄灭：清醒的舰员能在发射闪光之后的几天里把船躲到行星背面；冬眠中的飞船只能硬扛
      var hit = null;
      u.strikes.forEach(function (st) { if (st.target === sysId && st.done && !st.wasted && st.type === '光粒' && st.arrive > t0 && st.arrive > cur - 1e-9 && st.arrive <= nxt + 1e-9) hit = st; });
      if (hit && !ctx.starHit) {
        ctx.starHit = true; var nm0 = u.systems[sysId].name, lead = Math.max(1, Math.round(u.D[hit.fromSys != null ? hit.fromSys : sysId][sysId] * 0.0101 * 365));
        if (ctx.cryo && hrand(u, 'starhit', sysId, hit.arrive) < 0.35) {
          death = { y: hit.arrive, why: '恒星', text: '冬眠期间，' + yr(hit.arrive) + '，一枚光粒击中了' + nm0 + '。恒星熄灭前最后的耀斑烧穿了飞船的防护层，冬眠舱里没有人醒来。' }; tEnd = death.y; break;
        }
        u.ship.supply = Math.max(0, u.ship.supply - (ctx.cryo ? 30 : 15));
        ctx.notes = (ctx.notes || []).concat([ctx.cryo ? yr(hit.arrive) + '，一枚光粒击中了' + nm0 + '。恒星熄灭时的耀斑扫过飞船，冬眠系统紧急唤醒了舰员。飞船受损，但你们活了下来（补给 −30）。'
          : yr(hit.arrive) + '，传感器在光粒抵达前 ' + (hit.fromSys != null ? lead + ' 天' : '一瞬间') + '看到了发射的闪光。你把飞船躲到了行星背面；' + nm0 + '熄灭了，飞船只受了轻伤（补给 −15）。']);
      }
      cur = nxt;
    }
    var el = death ? tEnd - t0 : years;   // 没出事就按整数年记（避免 299.9999 显示成 299）
    u.ship.shipYears += el; u.ship.bio += el * bioRate;
    u.ship.supply = Math.max(0, u.ship.supply - el / 100 * (ctx.drain != null ? ctx.drain : ctx.cryo ? 2.5 : 1.2));   // 冬眠维持：每百年 2.5（B1：冬眠不是免费时光机）
    if (death) killShip(u, deathText(u, death.why, { awake: !ctx.cryo, moving: false, to: u.systems[sysId].name, text: death.text }));
    return { el: el, death: death };
  }
  function hibernate(u, years) {
    if (u.ship.dead) return deadResult(u);
    var at = u.ship.at, t0 = u.time;
    remember(u, at);
    var ctx = { cryo: true, flatText: '冬眠期间，二向箔的平面在$Y扫过了' + u.systems[at].name + '。冬眠舱和舰员一起变成了画的一部分。' }, bio0 = u.ship.bio;
    var r = passTime(u, at, years, 1 / CRYO, ctx);
    var trip = { n: u.ship.trips.length + 1, from: at, to: at, label: '原地冬眠', d: 0, ext: r.el, ship: r.el, bio: u.ship.bio - bio0, gamma: 1,
      depart: t0, arrive: t0 + r.el, shipAfter: u.ship.shipYears, crewAge: crewAge(u), planned: years };
    u.ship.trips.push(trip);
    var notes = (ctx.notes || []).map(function (t) { return { cls: 'warn', t: t }; });
    if (r.death) { trip.died = r.death.why; trip.caught = r.death.why === '二维'; trip.frac = years ? r.el / years : 1; return { trip: trip, report: deathReport(u, at, trip, notes) }; }
    var rep = arrivalReport(u, at, trip);
    rep.notes = notes.concat(rep.notes || []);
    u._rep = rep; rep.encounter = encounter(u, at, trip); u._rep = null;
    if (u.ship.dead) { rep.death = true; rep.deathCause = u.ship.dead.cause; destinyCheck(u, rep, u.ship.at); }
    trip.crewAge = crewAge(u); trip.shipAfter = u.ship.shipYears; trip.detained = rep.encounter.detained || 0;
    return { trip: trip, report: rep };
  }
  function deathReport(u, sysId, trip, notes) {
    var s = u.systems[sysId];
    var dr = { sysId: sysId, sysName: s.name, death: true, deathCause: u.ship.dead ? u.ship.dead.cause : '', trip: trip, first: false, lines: [], remote: [], events: [],
      notes: notes || [], caused: [], big: [], cosmic: u.cosmicEvents.slice(u.ship.cosmicSeen), dim: dimOf(u), dimStrikes: u.dimStrikes, canAct: false,
      encounter: { sysId: sysId, tier: '终结', forced: [], options: [] } };
    destinyCheck(u, dr, sysId);
    return dr;
  }
  function deadResult(u) {
    var t = u.ship.trips[u.ship.trips.length - 1] || { from: u.ship.at, to: u.ship.at, arrive: u.time, ext: 0, ship: 0, bio: 0, d: 0, label: '' };
    return { trip: t, report: deathReport(u, u.ship.at, t, []) };
  }

  function fmtPop(p) { return p >= 1 ? p.toFixed(1) + ' 亿' : (p * 10000).toFixed(0) + ' 万'; }
  function lifeLine(m) {
    if (m.flat) return '一幅二维的画。整个星系被二向箔压成了无限薄的平面。';
    if (m.sealed) return '「' + m.civName + '」的黑域：光速 16.7 km/s 的永久囚笼，外面看来只是一团黑。';
    if (m.dead) return '死寂。恒星被摧毁或不再宜居。';
    if (m.civName) return '「' + m.civName + '」· ' + m.era + '时代 · 人口 ' + fmtPop(m.pop) + ' · 科技 ' + m.tech.toFixed(0);
    if (m.ruins.length) return '无人。留有「' + m.ruins[m.ruins.length - 1] + '」的废墟。';
    return m.habitable ? '一片宜居却无人的荒野。' : '荒凉，没有生命。';
  }
  function pickEvents(list, max) {
    if (list.length <= max) return list;
    var you = list.filter(function (e) { return e.you; });
    var imp = list.filter(function (e) { return !e.you && e.imp >= 3; });
    var rest = list.filter(function (e) { return !e.you && e.imp < 3; });
    var out = you.slice(-Math.ceil(max / 2));
    out = out.concat(imp.slice(-(max - out.length)));
    if (out.length < max) out = out.concat(rest.slice(-(max - out.length)));
    return out.sort(function (a, b) { return a.y - b.y; });
  }

  /* ---------- 你留下的痕迹：玩家行为一律写成史实（actor = ship），回响由事件库按史实生成 ---------- */
  var REL_DESC = { gift_s: '留下少量技术', gift_l: '留下大量技术', god: '假扮神明', devil: '以恶魔的样子降临', ally: '结盟', trade: '通商', teach: '交换技术', learn: '求教',
    courier: '替他们送信', relic: '在他们那里展出飞船', scholar: '让他们研究飞船', hostile: '结怨', detained: '被他们扣押', starmap: '交出星图', told: '讲述旅程', warned: '光粒预警' };
  var ACT_DESC = { gift_s: '给他们留下少量技术', gift_l: '给他们留下大量技术', god: '在他们面前假扮神明', devil: '以恶魔的样子降临在他们面前', ally: '与他们结盟', trade: '与他们通商',
    teach: '与他们交换技术', learn: '向他们求教', courier: '替他们送信', relic: '在他们的博物馆里展出飞船', scholar: '让他们研究你的飞船', hostile: '与他们结怨', detained: '被他们扣押过', starmap: '向他们交出星图', told: '给他们讲述旅程', warned: '在光粒落下前向他们发出警告' };
  function legacyAdd(u, c, kind, data) {
    if (!c) return null;
    data = data || {}; if (!data.rel) data.rel = REL_DESC[kind] || '来访';
    return addFact(u, kind, { y: u.time, sys: u.ship.at, actor: 'ship', target: ck(c), tags: ['player', HELP_RANK[kind] ? 'help' : 'harm'], data: data });
  }
  function shipBase(u) { return u.ship.name.replace('号', ''); }
  // 打击的因果链（用于到访报告）
  function causeLine(u, st) {
    var c = st.cause || {}, who = c.who || (st.by === 'singer' ? '歌者' : '深空中的某个文明');
    var hit = yr(st.arrive) + '，' + (st.type === '二向箔' ? '一片二向箔' : '一颗光粒') + '落在这里';
    var see = c.see != null ? yr(c.see) : yr(st.launch), chain, player = false;
    switch (c.kind) {
      case 'trail': chain = '你的曲率航迹在' + see + '被' + who + '看到（那是' + yr(c.emit) + '前后从这里发出的光）'; player = true; break;
      case 'contact': chain = '你和当地往来的通讯信号在' + see + '被' + who + '截获'; player = true; break;
      case 'bcast': chain = '你广播的坐标在' + see + '传到了' + who + '那里'; player = true; break;
      case 'leak': chain = '被抽走的星图让这里的坐标流传开来，' + see + '被' + who + '看到'; player = true; break;
      case 'radio':
        player = c.gift != null && c.emit != null && c.gift <= c.emit;
        chain = '他们自己的无线电泄露了坐标，' + see + '被' + who + '听到' + (player ? '——而他们能这么早进入电波时代，是因为你在' + yr(c.gift) + '留下的技术' : ''); break;
      case 'civ': chain = '他们自己的星际舰队在深空留下了航迹，' + see + '被' + who + '看到'; break;
      case 'war': chain = '交战中，敌人把他们的坐标广播给了全宇宙，' + see + '被' + who + '看到'; break;
      case 'detect': chain = who + '的深空监听网在' + see + '发现了他们'; break;
      case 'map': chain = who + '的星图上标着这里——那是你' + (c.told != null && u.facts[c.told] ? yr(u.facts[c.told].y) : '当年') + '带回母星的旅途见闻'; player = true; break;
      case 'revenge': chain = who + '为了复仇，在' + see + '射出了这一击'; break;
      default: chain = who + '在' + see + '注意到了这里';
    }
    var hf = c.help != null && u.facts ? u.facts[c.help] : null, extra = '';
    if (hf && (c.kind === 'detect' || c.kind === 'map' || st.by !== 'singer')) { extra = '。而' + who + '能做到这一点，是因为你在' + yr(hf.y) + (hf.data.rel ? '和他们' + hf.data.rel : '帮过他们') + (hf.data.what && (hf.type === 'gift_l' || hf.type === 'gift_s') ? '（' + hf.data.what + '）' : ''); player = true; }
    return { t: '因果：' + chain + '；' + hit + extra + '。', player: player };
  }

  // 大事件卡片：事件库写进 u.cards（带发生地点和年份），按光延迟到达飞船时才显示；母星状态类卡片在到达时判断
  /* 导演配额（A2）：卡片少而重。
   *   1) 过期：预警的对象已经（按光延迟）灭亡，或光粒已经（按光延迟）落地 → 不弹
   *   2) 低信息量：卡片说的是你此刻所在星系的文明——到访报告本身已经讲了 → 不弹
   *   3) 重复：同一个 key（如「母星成了猎手」）一局只弹一次；同一文明一份报告只留最重的一张
   *   4) 聚合：同一份报告里多个「你帮过的文明灭绝了」合成一张
   *   5) 配额：有「重大」卡（母星压平 / 易主 / 消失、归零者广播、低维化末期）时只弹重大卡（最多 2 张）；否则按权重最多 2 张
   * 没弹出的卡记进 rep.bigFolded（新增字段），UI 可以折叠显示「另有 N 件事已记入史册」。 */
  var CARD_W = { bad: 3, warn: 2, good: 2 };
  function bigEvents(u, here, rep) {
    evArrive(u, 'report', {});
    var cand = [], folded = [];
    u.cardKeys = u.cardKeys || {};
    var localCiv = {};
    if (rep) { if (rep.now && rep.now.civId != null) localCiv[rep.now.civId] = 1; if (rep.then && rep.then.civId != null) localCiv[rep.then.civId] = 1; }
    function fold(cd, why) { folded.push({ cls: cd.cls, title: cd.title, t: cd.t, ev: cd.id, why: why }); }
    u.cards.forEach(function (cd) {
      if (cd.shown) return;
      var d = u.D[cd.sys][here];
      if (!cd.now && u.time + 1e-6 < cd.y + d) return;
      cd.shown = true;
      // 过期的预警：等光到你这里时，你已经能看到对方灭亡了，「也许还来得及」的卡片就不再弹出
      var cc = (cd.cls === 'warn' || cd.exp) && cd.c != null ? u.civs[cd.c] : null;
      if (cc && !cc.alive && cc.endYear != null && u.time + 1e-6 >= cc.endYear + u.D[cc.home][here]) return fold(cd, 'stale');
      if (cd.exp && cd.exp.sys != null && u.time + 1e-6 >= cd.exp.y + u.D[cd.exp.sys][here]) return fold(cd, 'stale');
      if (!cd.now && cd.c != null && localCiv[cd.c]) return fold(cd, 'local');
      if (cd.key && u.cardKeys[cd.key]) return fold(cd, 'dup');
      // 你亲眼看见了这次发射、还发出了警告：这张「你看见了一次发射」比你知道的还少
      if (cd.id === 'warn.launch_seen' && cd.c != null && (u.fType.warned || []).some(function (f) { return f.actor === 'ship' && f.target === 'civ:' + cd.c && f.y >= cd.y - 1e-6; })) return fold(cd, 'dup');
      cand.push({ cd: cd, d: d, w: cd.w != null ? cd.w : CARD_W[cd.cls] || 2 });
    });
    // 同一文明只留最重的一张；同 key 只留一张
    cand.sort(function (a, b) { return b.w - a.w || b.cd.y - a.cd.y || a.cd.seq - b.cd.seq; });
    var seenC = {}, seenK = {}, keep = [], helped = [];
    cand.forEach(function (x) {
      var cd = x.cd;
      if (cd.id === 'card.helped_extinct') { helped.push(x); return; }
      if (cd.key && seenK[cd.key]) return fold(cd, 'dup');
      if (cd.c != null && seenC[cd.c] && !cd.major) return fold(cd, 'dup');
      if (cd.key) seenK[cd.key] = 1; if (cd.c != null) seenC[cd.c] = 1;
      keep.push(x);
    });
    helped = helped.filter(function (x) { if (seenC[x.cd.c]) { fold(x.cd, 'dup'); return false; } return true; });
    if (helped.length === 1) keep.push(helped[0]);
    else if (helped.length > 1) {   // 聚合：你帮过的几个文明在同一段光里一起消失
      var names = helped.map(function (x) { return x.cd.short || x.cd.t; });
      keep.push({ w: 5 + Math.min(2, helped.length - 1), d: helped[0].d, cd: { id: 'card.helped_extinct', cls: 'bad', seq: helped[0].cd.seq, y: helped[0].cd.y, now: true, agg: helped.length,
        title: '你帮过的 ' + helped.length + ' 个文明消失了', t: names.join('；') + '。' } });
    }
    keep.sort(function (a, b) { return b.w - a.w || b.cd.y - a.cd.y; });
    var majors = keep.filter(function (x) { return x.cd.major; });
    var show = majors.length ? majors.slice(0, 2) : keep.slice(0, 2);
    keep.forEach(function (x) { if (show.indexOf(x) < 0) fold(x.cd, 'quota'); });
    var out = show.map(function (x) {
      var cd = x.cd; if (cd.key) u.cardKeys[cd.key] = 1;
      return { cls: cd.cls, title: cd.title, t: cd.t + (!cd.now && x.d > 1 ? '（这消息的光走了 ' + x.d.toFixed(0) + ' 年才到你这里）' : ''), ev: cd.id, major: !!cd.major, w: x.w, agg: cd.agg || 0 };
    });
    if (rep) rep.bigFolded = folded;
    return out;
  }
  /* =====================================================================
   *  命运（B4）：开局或中途可选的终局目标。达成 / 失败都会生成一份结局（rep.ending / interact 结果的 ending），给客户端做结局页和分享卡。
   *  选择命运不消耗随机数、不改变物理史；只有「加入黑域」会解锁一个接触选项（事件 destiny.domain）。
   * ===================================================================== */
  var DESTINIES = [
    { id: 'zero', title: '等到归零者', goal: '活着听到归零者的「回归运动」广播（宇宙累计降维 8 次）。', fail: '舰员在那之前死去。' },
    { id: 'singer', title: '找到歌者', goal: '读到歌者的两段签名：凝视被二向箔压平的画，或在被歌者抹掉的废墟里考古。', fail: '舰员在那之前死去。' },
    { id: 'earth', title: '让地球活到纪元 3000 年', goal: '你看到的光里，纪元 3000 年的太阳系仍属于地球文明（按光延迟判定）。', fail: '你先看到了太阳系被压平、易主或熄灭，或舰员在那之前死去。' },
    { id: 'domain', title: '加入黑域', goal: '先亲眼凝视一幅二维的画，再说服一个科技 ≥ 100、对你友好的文明建造黑域，并把你留在里面——永远安全，永远出不来。', fail: '舰员在那之前死去。' }];
  function destinyDef(id) { for (var i = 0; i < DESTINIES.length; i++) if (DESTINIES[i].id === id) return DESTINIES[i]; return null; }
  function chooseDestiny(u, id) {
    var d = destinyDef(id); if (!d) return null;
    if (u.ship.destiny && u.ship.destiny.state !== 'active') return u.ship.destiny;   // 已经有结局了
    if (u.ship.dead) return null;
    u.ship.destiny = { id: d.id, title: d.title, goal: d.goal, fail: d.fail, state: 'active', since: u.time, progress: '' };
    return u.ship.destiny;
  }
  function destinyOf(u) { return u.ship.destiny || null; }
  function endDestiny(u, state, text, extra) {
    var D = u.ship.destiny; if (!D || D.state !== 'active') return;
    var y = Math.floor(u.time), sy = u.ship.shipYears, age = crewAge(u);
    D.state = state; D.endY = u.time;
    D.ending = { id: D.id, title: D.title, state: state, y: y, shipYears: +sy.toFixed(1), crewAge: +age.toFixed(1), trips: u.ship.trips.length, dim: +dimOf(u).toFixed(3),
      head: state === 'won' ? '命运达成：' + D.title : '命运落空：' + D.title, text: text,
      share: '我在《相对论宇宙》里' + (state === 'won' ? '完成了「' + D.title + '」' : '没能「' + D.title + '」') + '：' + u.ship.name + '，船上 ' + sy.toFixed(1) + ' 年，宇宙 ' + y + ' 年，' + u.ship.trips.length + ' 段航程，舰员 ' + age.toFixed(0) + ' 岁。', delivered: false };
    if (extra) for (var k in extra) D.ending[k] = extra[k];
  }
  function takeEnding(u) { var D = u.ship.destiny; if (!D || !D.ending || D.ending.delivered) return null; D.ending.delivered = true; return D.ending; }
  function destinyCheck(u, rep, sysId) {
    var D = u.ship.destiny;
    if (D && D.state === 'active') {
      var y = Math.floor(u.time), nm = u.ship.name;
      if (u.ship.dead) endDestiny(u, 'lost', u.ship.dead.cause + '「' + D.title + '」没有等到结局。');
      else if (D.id === 'zero') {
        D.progress = '宇宙已降维 ' + u.dimStrikes + ' / 8 次';
        if (u.cosmicFlags[8]) endDestiny(u, 'won', yr(u.time) + '，' + nm + '的接收机收到了来自宇宙边缘的广播：归零者请求所有文明停止降维，让宇宙回到十维的田园时代。宇宙已经降维 ' + u.dimStrikes + ' 次，维度 ' + dimOf(u).toFixed(3) + '。船上过去了 ' + u.ship.shipYears.toFixed(1) + ' 年，宇宙过去了 ' + y + ' 年。你等到了。');
      } else if (D.id === 'singer') {
        var n = u.ship.songs || 0; D.progress = '歌者的签名 ' + Math.min(2, n) + ' / 2';
        if (n >= 2) endDestiny(u, 'won', '第二段签名和第一段一模一样：极简、重复，像一首随手哼出的歌。你终于确定，那个清理者真的存在，而且它根本不在乎。' + nm + '是这片星空里少数几个知道这件事、而且还活着的东西。');
      } else if (D.id === 'earth') {
        var hs = homeSeenState(u);
        D.progress = '你看到的母星：' + yr(Math.max(0, hs.sy)) + (hs.kind === 'ok' ? '，仍是地球文明' : '');
        if (hs.kind !== 'ok' && hs.sy > 0) endDestiny(u, 'lost', '你看到的是' + yr(hs.sy) + '的光：' + (hs.kind === 'flat' ? '太阳系已经是一幅二维的画' : hs.kind === 'lost' ? '太阳系的主人已经是「' + (hs.st.name || '别人') + '」' : '太阳系里已经没有文明') + '。地球没能活到纪元 3000 年。');
        else if (hs.kind === 'ok' && hs.sy >= 3000) endDestiny(u, 'won', '你看到的光来自' + yr(hs.sy) + '：太阳系里仍然是「' + (hs.st.name || '地球文明') + '」。' + nm + '出发时的那个文明，活过了三千年的黑暗森林。');
      } else if (D.id === 'domain') D.progress = (u.ship.songs ? '你见过二维画了；' : '先去凝视一幅二维画；') + '寻找科技 ≥ 100、对你友好的文明';
    }
    if (rep) { rep.destiny = D ? { id: D.id, title: D.title, goal: D.goal, state: D.state, progress: D.progress || '' } : null; var en = takeEnding(u); if (en) rep.ending = en; }
  }
  function checkGoals(u, rep, sysId) {
    var G = u.ship.goals, out = [];
    if (u.ship.knowsSinger && !G.singer) { G.singer = 1; out.push('找到了歌者的签名'); }
    var st = seenHome(u, sysId), hc = st.owner != null ? u.civs[st.owner] : null;
    if (!G.earth3000 && u.simYear - u.D[sysId][0] >= 3000 && hc && isEarthLine(u, hc) && !st.flat) { G.earth3000 = 1; out.push('看着地球文明活过了纪元 3000 年'); }
    if (!G.zero && u.cosmicFlags[8]) { G.zero = 1; out.push('听到了归零者的广播'); }
    rep.goals = out;
  }

  function arrivalReport(u, sysId, trip) {
    var s = u.systems[sysId], prev = u.memory[sysId], cur = snapshot(u, s);
    var rep = { sysId: sysId, sysName: s.name, first: !prev, then: prev, now: cur, lines: [], remote: [], caused: [], notes: [], gap: prev ? cur.year - prev.year : null,
      shipGap: prev ? cur.shipYears - prev.shipYears : null, bioGap: prev ? cur.bio - prev.bio : null, wake: !!(trip && trip.from === trip.to) };
    var curCiv = s.owner != null ? u.civs[s.owner] : null;
    function you(cls, t) { rep.lines.push({ cls: cls, t: t }); rep.caused.push(t); }
    var seenYou = {};
    if (prev) {
      var evs = s.timeline.slice(prev.timelineLen);
      if (prev.civId != null) {
        var pc = u.civs[prev.civId];
        if (!pc.alive) {
          var yLost = null; s.stateLog.forEach(function (L) { if (yLost == null && L.y > prev.year && L.owner !== pc.id) yLost = L.y; });
          if (yLost != null && pc.endYear - yLost > 1) rep.lines.push({ cls: 'bad', t: '你离开时的「' + prev.civName + '」在' + yr(yLost) + '失去了这里，又在别处撑到了' + yr(pc.endYear) + '：' + pc.endCause + '。' });
          else rep.lines.push({ cls: 'bad', t: '你离开时的「' + prev.civName + '」已经不存在了：' + yr(pc.endYear) + '，' + pc.endCause + '。' });
        }
        else if (s.owner !== pc.id) rep.lines.push({ cls: 'warn', t: '「' + pc.name + '」仍然存在，但已经失去了这里。' });
        else if (pc.name !== prev.civName) rep.lines.push({ cls: 'warn', t: '你认识的「' + prev.civName + '」如今叫「' + pc.name + '」。' });
        if (pc.giftYear != null && pc.giftYear >= prev.year - 1) {
          if (pc.interstellarYear != null && pc.interstellarYear >= pc.giftYear) you('warn', '你留下的技术让他们在' + yr(pc.interstellarYear) + '提前跨入了星际时代。');
          if (pc.alive && pc.giftTech && pc.tech < pc.giftTech - 15) you('bad', '那次技术跃升太猛，他们没能消化：社会崩溃，科技跌回 ' + pc.tech.toFixed(0) + '。');
        }
      }
      if (curCiv && curCiv.id !== prev.civId) {
        rep.lines.push({ cls: 'warn', t: '现在的主人是「' + curCiv.name + '」（' + eraLabel(curCiv) + '时代）。' });
        if (curCiv.giftYear != null) you('bad', '而「' + curCiv.name + '」，正是' + yr(curCiv.giftYear) + '你留下技术的那个文明。');
      }
      if (curCiv && curCiv.id === prev.civId && curCiv.name === prev.civName) {
        var nowEra = curCiv.era || eraOf(curCiv.tech), thenEra = prev.eraBase || (prev.era || '石器').split('·')[0];
        var de = ERA_RANK[nowEra] - ERA_RANK[thenEra];
        if (de > 0) rep.lines.push({ cls: 'good', t: '他们从' + thenEra + '时代走到了' + nowEra + '时代。' });
        else if (de < 0) rep.lines.push({ cls: 'bad', t: '他们从' + thenEra + '时代倒退回了' + nowEra + '时代。' });
        else rep.lines.push({ cls: '', t: '他们仍处在' + eraLabel(curCiv) + '时代，人口 ' + fmtPop(prev.pop) + ' → ' + fmtPop(curCiv.pop) + '，科技 ' + prev.tech.toFixed(0) + ' → ' + curCiv.tech.toFixed(0) + '。' });
        var ownN = u.systems.filter(function (x) { return x.owner === curCiv.id; }).length;
        if (ownN > 1) rep.lines.push({ cls: '', t: '他们如今统治着 ' + ownN + ' 个星系。' });
      }
      if (!prev.flat && cur.flat) rep.lines.unshift({ cls: 'bad big', t: '你离开时，这里' + (prev.civName ? '是「' + prev.civName + '」的家园（' + prev.era + '时代，' + fmtPop(prev.pop) + '人）' : '还是一个完整的星系') + '。现在，它是一幅二维的画。' + yr(s.flatYear) + '，二向箔把这里的三维空间压平了。' });
      else if (!prev.sealed && cur.sealed) rep.lines.unshift({ cls: 'warn big', t: '「' + cur.civName + '」把自己封进了黑域。你认识的那个文明还在里面，但永远不会再出来。' });
      else if (!prev.dead && cur.dead) rep.lines.push({ cls: 'bad', t: '这颗恒星已经死去。' });
      if (prev.type !== cur.type) rep.lines.push({ cls: 'warn', t: '恒星本身也变了：' + prev.type + ' → ' + cur.type + '。' });
      // 打击的因果链
      u.strikes.forEach(function (st) {
        if (st.target !== sysId || st.wasted || st.arrive <= prev.year || st.arrive > u.simYear) return;
        var cl = causeLine(u, st); rep.lines.push({ cls: 'bad', t: cl.t }); if (cl.player) rep.caused.push(cl.t);
      });
      var lg = legendLine(u, curCiv, u.simYear); if (lg) rep.lines.push({ cls: 'good', t: lg });
      evs.forEach(function (e) { if (e.you && !seenYou[e.y + e.t] && !u.ship.echoSeen[e.y + e.t]) { seenYou[e.y + e.t] = 1; u.ship.echoSeen[e.y + e.t] = 1; rep.caused.push(yr(e.y) + '：' + e.t); } });
      rep.events = pickEvents(evs, 6);
      if (!evs.length) rep.lines.push({ cls: 'dim', t: s.flat ? tpick(u, 'calmF' + sysId, ['这幅画不会再改变了。', '二维的平面上，一切都停在了被压平的那一刻。']) : s.dead && s.owner == null ? '这里只剩一颗死去的恒星。' : tpick(u, 'calm' + sysId, ['这段时间里，这里没有发生值得记载的事。', '这些年这里风平浪静，史书上只有几行字。', '时间在这里流得很慢：没有战争，没有奇迹。']) });
    } else {
      rep.events = pickEvents(s.timeline, 4);
      u.strikes.forEach(function (st) {
        if (st.target !== sysId || st.wasted || st.arrive > u.simYear) return;
        var cl = causeLine(u, st); rep.lines.push({ cls: 'bad', t: cl.t }); if (cl.player) rep.caused.push(cl.t);
      });
    }
    // 委托送达
    var M = u.ship.mission;
    if (M && M.to === sysId) {
      u.ship.mission = null;
      var mc = u.civs[M.civ];
      if (curCiv && curCiv.alive && curCiv.id !== M.civ) {
        var sp0 = u.ship.supply; u.ship.tech += 3; u.ship.supply = Math.min(100, u.ship.supply + 30); legacyAdd(u, curCiv, 'courier', { other: M.civName }); legacyAdd(u, mc, 'courier', { other: curCiv.name }); imprint(u, curCiv, '信使', 0.3);
        if (mc && mc.alive && !u.rel[relKey(mc.id, curCiv.id)]) u.rel[relKey(mc.id, curCiv.id)] = { type: '贸易', since: u.simYear };
        logSys(u, s, '一艘外来飞船替「' + M.civName + '」送来了信件和货物，「' + curCiv.name + '」与对方建立了联系。', 2);
        you('good', '你把「' + M.civName + '」的信和货物送到了「' + curCiv.name + '」手里（' + yr(M.y) + '接下的委托）。两个文明因此搭上了线。报酬：飞船科技 +3，' + supTxt(u.ship.supply - sp0) + '。');
      } else you('dim', '你带着「' + M.civName + '」的信来到这里，却已经没有收信人了。这封信永远送不出去了。');
    }
    // 其他去过的星系：只能看到光信号已经传到这里的那部分
    Object.keys(u.memory).forEach(function (k) {
      var id = +k; if (id === sysId) return;
      var m = u.memory[id], t = u.systems[id], d = u.D[sysId][id];
      var seenYear = u.time - d;   // 用精确时刻（不取整）：光刚好到达的那一年也算看得到
      if (seenYear <= m.year) { rep.remote.push({ name: t.name, d: d, t: '光信号还在路上（延迟 ' + d.toFixed(0) + ' 年），你看到的仍是你离开时的样子。' }); return; }
      var news = t.timeline.filter(function (e, i) { return i >= m.timelineLen && e.y <= seenYear; });
      var st = stateAt(t, seenYear);
      var head = st.flat ? '一幅二维的画' : st.sealed ? '黑域' : st.dead ? '已死寂' : st.name ? '「' + st.name + '」· ' + st.era : (t.ruins.length ? '无人（废墟）' : '无人');
      var ev = pickEvents(news, 2).map(function (e) { return yr(e.y) + '：' + e.t; }).join(' ');
      news.forEach(function (e) { if (e.you && !seenYou[e.y + e.t] && !u.ship.echoSeen[e.y + e.t]) { seenYou[e.y + e.t] = 1; u.ship.echoSeen[e.y + e.t] = 1; rep.caused.push(t.name + '（远方的光）· ' + yr(e.y) + '：' + e.t); } });
      rep.remote.push({ name: t.name, d: d, t: '你看到的是 ' + yr(seenYear) + ' 的光（延迟 ' + d.toFixed(0) + ' 年）：' + head + '。' + (ev ? ' ' + ev : ' 没有大事。') });
    });
    rep.big = bigEvents(u, sysId, rep);
    checkGoals(u, rep, sysId);
    destinyCheck(u, rep, sysId);
    rep.cosmic = u.cosmicEvents.slice(u.ship.cosmicSeen); u.ship.cosmicSeen = u.cosmicEvents.length;
    rep.dim = dimOf(u); rep.dimStrikes = u.dimStrikes;
    rep.canAct = !!(curCiv && curCiv.alive);
    rep.civName = curCiv ? curCiv.name : null;
    return rep;
  }

  /* =====================================================================
   *  抵达后的接触：选项取决于「科技差」+ 对方性格（temper）+ 对你的记忆
   *  飞船科技 ship.tech 起始 60，可通过求教、交换、贸易、考古、拾荒、委托、展出、母星补给提升，不会下降。
   *    母星（地球一脉）：欢迎回家，补满补给，追上母星这些年的技术。
   *    原始（< 8）：观察 / 降临。落后（gap ≤ −15）：少量 / 大量技术、假扮神明、观察。
   *    对等：交换技术、贸易、结盟、对峙。
   *    先进（gap ≥ 15）：按性格分场景——学者研究你、官僚检疫、收藏家展出、商人雇你送信、冷漠无视、好战盘查；
   *         敌视你的会扣押。持有效通行证则免检。只有在对方还不知道你母星坐标时才会抽取。
   * ===================================================================== */
  var TAG_DESC = { '神': '从天而降的神', '恶魔': '天外来的恶魔', '恩人': '留下技术的恩人', '旅人': '来访的星际旅人', '盟友': '远方的盟友',
    '可疑者': '可疑的外来飞船', '入侵者': '入侵者', '俘虏': '曾被他们扣留的外来者', '信使': '替他们送信的信使', '学徒': '曾来求教的学徒', '样本': '他们研究过的古董飞船', '展品': '他们博物馆里的展品', '游子': '远行归来的游子' };
  function attOf(u, c) {
    if (c.att == null) return 0;
    if (c.tag === '神' || c.tag === '恶魔') return c.att;
    return c.att * DM.exp(-(u.simYear - c.attYear) / 400);
  }
  function imprint(u, c, tag, dAtt) {
    c.att = clamp(attOf(u, c) + dAtt, -1, 1); c.attYear = u.simYear; c.tag = tag;
    c.legends.push({ y: u.simYear, kind: tag });
  }
  function attWord(a) { return a >= 0.5 ? '崇敬' : a >= 0.2 ? '友善' : a > -0.2 ? '中立' : a > -0.5 ? '警惕' : '敌视'; }
  function tierOf(u, c) {
    if (c.tech < 8) return '原始';
    var gap = c.tech - u.ship.tech;
    return gap >= 15 ? '先进' : gap <= -15 ? '落后' : '对等';
  }
  function opt(id, label, desc) { return { id: id, label: label, desc: desc }; }
  function homeCiv(u) { var h = u.systems[0]; return h.owner != null ? u.civs[h.owner] : null; }
  function leakHome(u, amt, also) {
    if (!u.systems[0].flat) addExpo(u.systems[0], amt, 'leak');
    if (also) Object.keys(u.memory).forEach(function (k) { addExpo(u.systems[+k], also, 'leak'); });
  }
  function supTxt(d) { return d > 0.5 ? '补给 +' + d.toFixed(0) : '补给本来就是满的'; }
  // 被抽走导航库：太阳已经被压平时，不再说「太阳的坐标」
  function navLoot(u) { return u.systems[0].flat ? '你去过的每一个星系（太阳早已是一幅二维的画，那个坐标已经没有意义）' : '太阳的坐标、你去过的每一个星系'; }
  function extract(u, c, amt, also, s) {
    leakHome(u, amt, also); c.knowsHome = true;
    addFact(u, 'extract', { y: u.time, sys: s != null ? s : u.ship.at, actor: ck(c), target: 'ship', data: { what: navLoot(u) } });
  }
  // 对你的记忆：传说的新旧决定措辞（避免「1600 年前的神话」却「清楚记得你」）
  function memo(u, c) {
    if (!c.tag) return '';
    var L = c.legends[c.legends.length - 1], dt = L ? u.simYear - L.y : 0;
    return dt < 400 ? '他们记得你是「' + TAG_DESC[c.tag] + '」。' : '他们古老的传说里有一个「' + TAG_DESC[c.tag] + '」，而你的船和传说里的一模一样。';
  }
  function shipLog(u, text) { u.ship.events.push({ y: u.simYear, t: text }); }
  function legendLine(u, c, now) {
    if (!c || !c.alive || !c.tag) return null;
    var L = c.legends[c.legends.length - 1], dt = now - L.y, what = TAG_DESC[c.tag] || '那艘来访的星舰';
    if (dt < 60) return '他们还清楚地记得你——「' + what + '」。不少见过你的人还活着。';
    if (dt < 400) return '你已经成了他们历史课本里的一页：「' + what + '」。';
    if (dt < 1500) return '关于你的记忆已经变成传说：「' + what + '」，没人确定是否真的存在过。';
    return Math.round(dt) + ' 年过去，你只剩下一个模糊的神话：「' + what + '」。';
  }
  function findRuinCiv(u, nm) {
    for (var i = u.civs.length - 1; i >= 0; i--) { var c = u.civs[i]; if (c.name === nm || c.formerNames.indexOf(nm) >= 0) return c; }
    return null;
  }

  // 抵达时调用：决定层级 / 场景、执行强制事件、给出可选项
  // 抵达：先跑代码里的层级 / 场景，再让事件库补上「认出你」「旧盟」「信徒」等场景和选项
  function encounter(u, sysId, trip) {
    var E = encounter0(u, sysId, trip);
    if (u.ship.dead || E.tier === '终结') return E;
    var s = u.systems[sysId], c = s.owner != null ? u.civs[s.owner] : null;
    if (!c || !c.alive || isSealed(u, s) || E.expelled || s.flat) c = null;
    var fired = evArrive(u, 'arrival', { c: c, E: E, rep: u._rep, scene: E.scene });
    var tail = E.options.filter(function (o) { return o.id === '广播坐标' || o.id === '离开'; });
    E.options = E.options.filter(function (o) { return tail.indexOf(o) < 0; });
    if (fired.some(function (x) { return x.e.group === 'faith_scene'; })) E.forced = E.forced.filter(function (f) { return !f.bell; });   // 信徒场景自己会讲「神回来了」
    evPresent(u, E, u._rep, fired);
    E.options = E.options.concat(tail);
    if (u.ship.dead) E.options = [];
    return E;
  }
  function encounter0(u, sysId, trip) {
    var s = u.systems[sysId], c = s.owner != null ? u.civs[s.owner] : null;
    var wake = !!(trip && trip.from === trip.to);
    var E = { sysId: sysId, forced: [], options: [], tier: null, scene: null, shipTech: u.ship.tech, wake: wake };
    u.enc = E;
    if (u.ship.dead) { E.tier = '终结'; return E; }
    if (s.flat) {
      E.tier = '二维';
      E.forced.push({ cls: 'bad', t: '飞船在二维平面的边缘紧急刹停。前方没有星系，只有一幅铺展开的、无限薄的画：恒星、行星、海洋和城市都被摊平成了彩色的纹理。' });
      var fz = u.flats[s.flatBy]; if (fz && flatR(fz, u.simYear) < fz.rmax) E.forced.push({ cls: 'warn', t: '平面还在以光速扩张（半径 ' + flatR(fz, u.simYear).toFixed(1) + ' / ' + fz.rmax.toFixed(1) + ' 光年）。只有曲率驱动能跑赢它，常规推进会被追上。' });
      if (!s.gazed) E.options.push(opt('凝视', '凝视这幅画', '用全部传感器扫描二维平面，也许能读出是谁干的。'));
      E.options.push(opt('离开', '离开', ''));
      return E;
    }
    if (isSealed(u, s)) {
      E.tier = '黑域'; E.civName = c.name;
      E.forced.push({ cls: 'warn', t: '「' + c.name + '」把自己封进了黑域：里面的光速只有 16.7 km/s。从外面看，那是一团吞掉一切光线的黑。你进不去，他们也永远出不来。' });
      E.options.push(opt('离开', '离开', ''));
      return E;
    }
    var bcast = opt('广播坐标', '向全宇宙广播这里的坐标', '极度危险：暴露度 +3。坐标的光几十到几百年后传到歌者那里，它可能随手扔来一片二向箔。可以当作威慑或复仇，也等于给这里判死刑。');
    if (!c || !c.alive) {
      var left = s.ruins.length - (s.dug || 0);
      if (left > 0) {
        var rtn = (s.ruinTech || [])[s.dug || 0] || 10;
        E.tier = '遗迹'; E.options.push(opt('考古', '考古发掘', '在「' + s.ruins[s.dug || 0] + '」的废墟里寻找遗物、补给和他们消失的原因。他们的峰值科技是 ' + rtn.toFixed(0) + '（你 ' + u.ship.tech.toFixed(0) + '）' + (rtn > u.ship.tech ? '：能找回比你更先进的技术。' : '：大概只有物资。') + (rtn >= 55 ? '这是一个星际文明的遗迹，自动防御可能还在运转（风险约 ' + Math.round(100 * (0.15 + (rtn - 55) * 0.006)) + '%）。' : '')));
      } else E.tier = s.ruins.length ? '遗迹（已发掘）' : '无人';
      E.options.push(bcast);
      E.options.push(opt('离开', '继续', ''));
      return E;
    }
    var tier = tierOf(u, c), a = attOf(u, c), gap = c.tech - u.ship.tech, N = '「' + c.name + '」';
    E.tier = tier; E.gap = gap; E.att = a; E.tag = c.tag || null; E.civName = c.name; E.civTech = c.tech; E.exp = c.exp; E.temper = c.temper;
    // 母星：地球一脉的文明永远欢迎你回家
    if (isEarthLine(u, c)) {
      E.tier = '母星'; E.scene = '归乡';
      // B1：只有太阳系的母星本体才补满补给、送科技（送科技有 150 年冷却）；殖民地 / 分家的地球文明只能给少量补给，科技 300 年一次、只给一小部分
      var body = sysId === 0; E.homeBody = body;
      E.forced.push({ cls: 'good', t: wake ? '你在' + s.name + '的轨道上醒来。' + N + '的港口早就为你留好了泊位。' : N + '认出了飞船的识别码。' + (body ? tpick(u, 'home', ['整个星系都在欢迎你回家。', '港口的灯一盏盏亮起来，像是在说：欢迎回家。', '他们说，你的名字还写在发射场的纪念碑上。']) : '这里是地球文明的一个殖民地，离太阳 ' + u.D[sysId][0].toFixed(0) + ' 光年。') });
      var htY = u.ship.homeTechY, cd = body ? 150 : 300;
      if (c.tech > u.ship.tech + 1 && (htY == null || u.simYear - htY >= cd)) {
        var hg = (c.tech - u.ship.tech) * (body ? 0.6 : 0.25); u.ship.tech += hg; u.ship.homeTechY = u.simYear;
        E.forced.push({ cls: 'good', t: (body ? '母星把这些年的成果装进了飞船' : '殖民地的工程师尽力给飞船升级了一部分系统') + '：飞船科技 +' + hg.toFixed(1) + '。' });
      } else if (c.tech > u.ship.tech + 1) E.forced.push({ cls: 'dim', t: '上一次升级才过去 ' + Math.floor(u.simYear - htY) + ' 年，' + (body ? '母星' : '殖民地') + '没有新东西能装进飞船了。' });
      if (body) { if (u.ship.supply < 99.5) { E.forced.push({ cls: 'good', t: '补给和维修已全部补满（' + supTxt(100 - u.ship.supply) + '）。' }); u.ship.supply = 100; } }
      else { var cs0 = u.ship.supply; u.ship.supply = Math.min(100, u.ship.supply + 20); E.forced.push({ cls: 'good', t: '殖民地的仓库不大，只能分给你一点（' + supTxt(u.ship.supply - cs0) + '）。想补满，得回太阳。' }); }
      E.options.push(opt('讲述', '讲述你的旅程', '把一路的见闻和星图交给母星。'));
      E.options.push(bcast);
      E.options.push(opt('离开', '再次出发', ''));
      return E;
    }
    if (tier === '原始') {
      E.options.push(opt('观察', '隐身观察', '藏在轨道上记录他们的生活，不留任何痕迹。'));
      E.options.push(opt('降临', '降临接触', '直接降落在他们面前。巨大的文化冲击：可能被奉为神，也可能被当成恶魔。社会会剧烈动荡。'));
    } else if (tier === '落后') {
      if (c.tag === '恶魔' && a < -0.3) E.forced.push({ cls: 'warn', t: '他们的经书里记载着一个「天外来的恶魔」——就是你。地面上的人在恐慌中躲藏。' });
      if (c.tag === '神' && a > 0.3) E.forced.push({ cls: 'good', t: '神庙的钟声响彻全城：' + (c.religion ? '「' + c.religion + '」' : '他们') + '的神回来了。', bell: true });
      E.options.push(opt('少量技术', '留下少量技术', '点拨一下医学、农业和基础物理。进步温和（约 +5），社会基本稳得住。'));
      E.options.push(opt('大量技术', '留下大量技术', '倾囊相授到接近你的水平（' + u.ship.tech.toFixed(0) + '）。他们会连跳几个时代，但社会剧烈震荡、扩张欲上升；更早进入电波时代，也就更早暴露。'));
      if (c.tech < 35) E.options.push(opt('假扮神明', '假扮神明', '用你的科技制造神迹，引发一场宗教。他们会更团结，也会更好战。'));
      E.options.push(opt('观察', '观察不干预', '只记录，不接触。'));
    } else if (tier === '对等') {
      if (a <= -0.4 || (c.tag === '入侵者' && a <= -0.15)) {
        E.forced.push({ cls: 'bad', t: (c.tag ? memo(u, c) : '他们把你当成「可疑的外来飞船」。') + '舰队锁定了你，限你立即离开。' });
        E.expelled = true;
      } else {
        // 流亡者 / 后代多半继承了祖先的科技，常常和你「对等」：他们也会认出你（事件库 recognize）
        var rf0 = (c.diaspora || c.refugee || c.parent != null) ? evArrive(u, 'recognize', { c: c, E: E, rep: u._rep, scene: '对等' }) : [];
        if (rf0.length) { evPresent(u, E, u._rep, rf0); E.recog = true; }
        else {
        if (c.exp > 0.7 && a < 0.2 && rnd(u) < 0.4) { E.tense = true; E.forced.push({ cls: 'warn', t: N + '扩张欲很强，他们的战舰包围了你。任何举动都可能擦枪走火。' }); }
        var hs = seenHome(u, sysId);
        E.options.push(opt('交换技术', '交换技术', '双方各取所长，都有小幅进步。' + (c.exp > 0.6 && !c.knowsHome ? '对方扩张欲强，可能借机摸清你的来历。' : '')));
        E.options.push(opt('贸易', '贸易', '交换货物、补充补给' + (hs.name && !hs.flat ? '，并替母星「' + hs.name + '」开一条贸易航线（这是你在这里看到的母星名字，光走了 ' + u.D[sysId][0].toFixed(0) + ' 年）。' : '。')));
        if (a >= 0.3) E.options.push(opt('结盟', '结盟', '他们对你' + attWord(a) + '，愿意和你及你的母星结盟，并分享技术。'));
        E.options.push(opt('对峙', '警惕对峙', '什么都不交出，保持距离离开。他们会把你记成可疑者。'));
        }
      }
    } else { // 先进
      var pass = c.passUntil != null && c.passUntil > u.simYear;
      var hostile = !pass && (a <= -0.3 || (c.tag === '入侵者' && a <= -0.15) || (c.temper === '好战' && a < 0.1 && rnd(u) < 0.5));
      var intro = wake ? '你从冬眠中醒来时，' : tpick(u, 'intro' + sysId, ['你一减速，', '你刚进入这个星系，', '飞船还没停稳，']);
      var sc = pass ? '通行' : hostile ? '扣押' : a >= 0.4 ? '礼遇' : (c.temper || '好战');
      var target = null;
      if (sc === '商人') {
        var cands = u.systems.filter(function (x) { return x.owner != null && x.owner !== c.id && u.civs[x.owner].alive && !isSealed(u, x) && !x.flat && u.D[sysId][x.id] < 120 && x.id !== sysId; });
        if (cands.length) target = cands[Math.floor(rnd(u) * cands.length)]; else sc = '冷漠';
      }
      E.scene = sc;
      var eav = Math.min(2.5, gap * 0.04); u.ship.tech += eav; E.eaves = eav;   // 靠近先进文明，总能截获一点东西
      var tline = '对方科技 ' + c.tech.toFixed(0) + '，你只有 ' + (u.ship.tech - eav).toFixed(0) + '。' + (eav > 0.3 ? '光是截获他们的通讯，你就学到了一点东西（+' + eav.toFixed(1) + '）。' : '');
      // 流亡者 / 后代 / 档案馆认出你：代替冷漠、盘查、研究等普通场景
      if (sc !== '通行' && sc !== '扣押' && sc !== '礼遇') {
        var rf = evArrive(u, 'recognize', { c: c, E: E, rep: u._rep, scene: sc });
        if (rf.length) { sc = 'recog'; evPresent(u, E, u._rep, rf); if (E.forced.length) E.forced[E.forced.length - 1].t += tline; }
      }
      if (sc === '通行') {
        E.forced.push({ cls: 'good', t: '你的通行证仍然有效（到' + yr(c.passUntil) + '）。' + N + '的哨舰核对了识别码就放行了，没有盘查。' + tline });
        E.options.push(opt('求教', '请求指点', '有通行证的访客更容易得到帮助。'));
        E.options.push(opt('补给', '购买补给', '补充补给和维修。'));
      } else if (sc === '礼遇') {
        E.forced.push({ cls: 'good', t: N + '认出了你——「' + (TAG_DESC[c.tag] || '老朋友') + '」。他们以礼相待，引你进港。' + tline });
        E.options.push(opt('求教', '求教', '他们对你' + attWord(a) + '，很可能愿意教你。'));
        E.options.push(opt('补给', '接受补给', '补满补给，修好飞船。'));
        E.options.push(opt('交换见闻', '讲述旅途见闻', '他们对你见过的那些文明很感兴趣。'));
      } else if (sc === '学者') {
        E.forced.push({ cls: '', t: intro + N + '的学者团就登上了飞船。他们把你当成活的研究样本：记录你的语言、导航算法，甚至舰员的梦。' + tline });
        if (!c.knowsHome && c.exp > 0.6 && rnd(u) < 0.3) { extract(u, c, 0.6, 0); E.extracted = true; E.forced.push({ cls: 'warn', t: '研究中，他们顺手复原了你的导航库：' + navLoot(u) + '，都进了他们的档案。' }); }
        E.options.push(opt('交换见闻', '配合研究、交换见闻', '让他们研究飞船，换一点知识。'));
        E.options.push(opt('求教', '请教他们', '学者文明更愿意传授。'));
      } else if (sc === '官僚') {
        var qy = Math.round(R(u, 2, 6));
        var qr = passTime(u, sysId, qy, 1, { flatText: '检疫期间，二向箔的平面在$Y扫过了' + s.name + '，隔离港和飞船一起变成了画。' });
        E.detained = qr.el;
        if (u.ship.dead) { E.options = []; E.forced.push({ cls: 'bad', t: u.ship.dead.cause }); return E; }
        c.passUntil = u.simYear + 200;
        E.forced.push({ cls: 'warn', t: intro + N + '的检疫官把飞船拖进了隔离港。填表、消毒、听证、再填表……' + qy + ' 年后，你拿到了一张 200 年的通行证。' + tline });
        shipLog(u, '在' + s.name + '被「' + c.name + '」检疫 ' + qy + ' 年');
        E.options.push(opt('求教', '凭通行证求教', '手续齐全的访客，他们会认真对待。'));
        E.options.push(opt('补给', '购买补给', '按规定价格补充补给。'));
      } else if (sc === '收藏家') {
        E.forced.push({ cls: '', t: intro + N + '的博物馆派来了一支考察队。在他们眼里，你的飞船是一件活着的古董。他们想把它连同冬眠中的你们一起展出。' + tline });
        E.options.push(opt('展出', '同意展出', '在他们的博物馆里冬眠 15–40 年，换取大量技术和全部补给。'));
        E.options.push(opt('求教', '婉拒，改为求教', ''));
      } else if (sc === '商人') {
        var ts = stateAt(target, u.simYear - u.D[sysId][target.id]);
        E.mission = { to: target.id, toName: target.name, civName: ts.name || u.civs[target.owner].name };
        E.forced.push({ cls: '', t: intro + N + '的商会找上门来：他们想雇你把一封信和一批货送到 ' + target.name + '（' + u.D[sysId][target.id].toFixed(0) + ' 光年外，「' + E.mission.civName + '」）。' + tline });
        E.options.push(opt('委托', '接下委托', '先付一半报酬（补给 +25），送到后还有更多。'));
        E.options.push(opt('求教', '求教', ''));
      } else if (sc === '冷漠') {
        E.forced.push({ cls: 'dim', t: N + '对一艘原始飞船毫无兴趣，连扫描都懒得做。你像一只飞进机场的麻雀。' + tline });
        E.options.push(opt('拾荒', '在轨道垃圾带拾荒', '他们扔掉的东西，对你来说都是宝贝。可能被巡逻舰发现。'));
      } else if (sc === 'recog') {
        // 场景文本和选项由事件库（recognize）给出
      } else if (sc === '好战') {
        E.forced.push({ cls: 'warn', t: intro + N + '的哨舰就围了上来，强行登船检查。' + tline });
        if (!c.knowsHome && rnd(u) < clamp(0.25 + 0.4 * c.exp - 0.3 * a, 0, 0.8)) {
          extract(u, c, 1.0, 0.3); E.extracted = true;
          E.forced.push({ cls: 'bad', t: '他们读取了你的航行日志和导航库。' + navLoot(u) + '，都被拿走了。' });
          logSys(u, s, '「' + c.name + '」截获一艘外来飞船，从中读出了它母星的坐标。', 2);
        } else if (c.knowsHome) E.forced.push({ cls: 'dim', t: '你的星图他们早就有了，这次只是例行盘问。' });
        E.options.push(opt('威慑', '以广播坐标相威胁', '威胁他们：如果不放行，就向全宇宙广播这里的坐标。'));
        E.options.push(opt('求教', '请求庇护 / 求教', '成功与否取决于他们的态度。'));
        if (!c.knowsHome) E.options.push(opt('交出星图', '交出星图换取通行', '把星图和母星坐标交给他们，换一张 300 年的通行证和少量技术。'));
      } else { // 扣押
        E.forced.push({ cls: 'bad', t: (c.tag && a <= -0.15 ? N + memo(u, c) : c.temper === '好战' && a > -0.15 ? N + '是一个好战的文明，不需要理由。' : '') + intro + '他们的战舰直接扣押了飞船。' + tline });
        if (!c.knowsHome) {
          extract(u, c, 1.0, 0.3); E.extracted = true;
          E.forced.push({ cls: 'bad', t: '他们抽走了全部数据：' + navLoot(u) + '。' });
          logSys(u, s, '「' + c.name + '」扣押一艘外来飞船，读出了它母星的坐标。', 2);
        }
        var dy = Math.round(R(u, 3, 20));
        var dr = passTime(u, sysId, dy, 1, { flatText: '被扣留期间，二向箔的平面在$Y扫过了' + s.name + '，飞船和扣留它的人一起被压成了画。' });
        E.detained = dr.el; imprint(u, c, '俘虏', -0.05); legacyAdd(u, c, 'detained', { rel: '被他们扣押过' });   // 你是受害者：不算「你得罪了他们」，不会招来复仇舰队
        u.ship.supply = Math.max(0, u.ship.supply - 20);
        if (u.ship.dead) { E.options = []; E.forced.push({ cls: 'bad', t: u.ship.dead.cause }); return E; }
        E.forced.push({ cls: 'bad', t: '你被扣留了 ' + dy + ' 年，物资被没收了一部分（补给 −20）。放行时已是' + yr(u.simYear) + '，舰员也老了 ' + dy + ' 岁。' });
        shipLog(u, '在' + s.name + '被「' + c.name + '」扣留 ' + dy + ' 年');
        E.options.push(opt('威慑', '以广播坐标相威胁', '可能换来通行权，也可能被彻底当成敌人。'));
      }
    }
    if (!E.expelled) E.options.push(bcast);
    if (u.ship.dead) E.options = [];
    else E.options.push(opt('离开', E.expelled ? '离开' : '悄悄离开', ''));
    return E;
  }

  // 执行玩家选择，返回 {t, cls}；命运在这一步达成 / 落空时附带 ending（新增字段）
  function interact(u, sysId, id) {
    var r = interact0(u, sysId, id);
    destinyCheck(u, null, sysId); var en = takeEnding(u); if (en && r) r.ending = en;
    return r;
  }
  function interact0(u, sysId, id) {
    var s = u.systems[sysId], c = s.owner != null ? u.civs[s.owner] : null, E = u.enc || {}, r;
    if (u.ship.dead) return { t: '……', cls: 'dim' };
    // 只能选这次到访实际提供的选项（URL 计划或脚本强行指定别的选项时拒绝，避免「和母星结盟」之类的错位史实）
    if (E.sysId === sysId && E.options && !E.options.some(function (o) { return o.id === id; })) return { t: '这里没有这个选项。', cls: 'dim' };
    if (id.charAt(0) === '@') return evChoose(u, id, E);
    if (id === '离开') return { t: E.expelled ? '你在对方舰队的注视下离开。' : tpick(u, 'leave' + sysId, ['你没有打扰他们，悄悄离开。', '你关掉信标，像来时一样安静地离开。', '你记下最后一组数据，调转航向。']), cls: 'dim' };
    if (id === '凝视') {
      s.gazed = true;
      u.ship.songs = (u.ship.songs || 0) + 1;
      if (!u.ship.knowsSinger) { u.ship.knowsSinger = true; u.ship.tech += 1; shipLog(u, '在' + s.name + '的二维画中发现歌者的签名'); }
      return { t: '在平面边缘，你读出了一段不属于任何本地文明的结构：极简、重复、像一首随手哼出的歌。那是一个清理者留下的签名——它看到了这里的坐标，顺手做了清理。它也许根本不记得这件事。（你确认了「歌者」的存在，飞船科技 +1）', cls: 'warn' };
    }
    if (id === '广播坐标') {
      addExpo(s, 3, 'bcast'); logSys(u, s, '一段指向这里的坐标广播射向了全宇宙。', 3); shipLog(u, '在' + s.name + '向全宇宙广播坐标');
      var heard = c && c.alive && c.tech >= 35; if (heard) { imprint(u, c, '入侵者', -0.7); legacyAdd(u, c, 'hostile', { rel: '广播了他们的坐标' }); }
      // 神出卖了自己的信徒：信奉你的文明听见了这段广播 → 神变成了恶魔（事件库 rel.god_to_devil 接手）
      var betray = heard && c.religion && civHasType(u, c, ['faith_founded']);
      if (betray) legacyAdd(u, c, 'devil', { how: 'betray', what: '向全宇宙喊出了他们的坐标' });
      var dS = singerDist(u, s);
      return { t: '你把' + s.name + '的坐标广播了出去。这道光要走大约 ' + Math.round(dS) + ' 年才会被星图之外的清理者看到；如果它动手，武器还要再飞差不多这么久。' + (heard ? '「' + c.name + '」截获了广播，从此把你当成入侵者。' : '') + (betray ? '他们的祭司听懂了这段广播：他们的神，向黑暗森林喊出了他们的名字。' : '') + '最好别留在这里。', cls: 'bad' };
    }
    if (id === '威慑') {
      if (!c || !c.alive) return { t: '……', cls: 'dim' };
      if (rnd(u) < 0.45 + 0.3 * (1 - c.exp)) { c.passUntil = u.simYear + 100; imprint(u, c, '可疑者', -0.4); legacyAdd(u, c, 'hostile', { rel: '以广播坐标威胁过他们' }); return { t: '对方沉默了很久，最后放行，给了你 100 年的通行权。他们不会忘记被一艘小飞船威胁过。', cls: 'warn' }; }
      imprint(u, c, '入侵者', -0.8); legacyAdd(u, c, 'hostile', { rel: '以广播坐标威胁过他们' });
      if (!c.knowsHome) { extract(u, c, 1.0, 0.3); return { t: '他们根本不在乎。舰队冲上来抽走了你的全部数据（' + navLoot(u) + '），然后把你扔出了星系。从此你在他们的档案里是「入侵者」。', cls: 'bad' }; }
      u.ship.supply = Math.max(0, u.ship.supply - 15);
      return { t: '他们根本不在乎——你的坐标他们早就有了。一轮警告射击打坏了你的货舱（补给 −15），然后你被赶出了星系。', cls: 'bad' };
    }
    if (id === '考古') {
      if (!s.ruins || (s.dug || 0) >= s.ruins.length) return { t: '这里没有可以发掘的废墟。', cls: 'dim' };
      var idx = s.dug || 0; s.dug = idx + 1;
      var rt = (s.ruinTech || [])[idx] || 10, nm = s.ruins[idx], rc = findRuinCiv(u, nm);
      var how = rc ? (rc.alive ? '他们并没有灭绝，只是离开了这里——如今叫「' + rc.name + '」，仍在别处生活。' : '最后的记录写着：' + yr(rc.endYear) + '，' + rc.endCause + '。') : '最后的记录残缺不全，只剩下一段反复播放的告别。';
      // B1：收益与遗迹主人的峰值科技挂钩——越先进的废墟越值钱，也越危险；能把飞船科技推到超过你自己的水平
      var danger = rt >= 55 ? 0.15 + (rt - 55) * 0.006 : 0;
      if (rt >= 55 && rnd(u) < danger) { var dmg = Math.round(10 + (rt - 55) / 3); u.ship.supply = Math.max(0, u.ship.supply - dmg); return { t: '「' + nm + '」是一个星际文明（科技 ' + rt.toFixed(0) + '），它的自动防御至今还在运转。你触发了警报，只能仓皇撤离，飞船受损（补给 −' + dmg + '）。' + how, cls: 'bad' }; }
      // 废墟主人的历史决定你找到什么：你的信徒、被歌者抹掉的、被母星清理的
      var extra = '', lin = rc ? lineage(u, rc) : [], has = function (t, actor) { return (u.fType[t] || []).some(function (f) { return lin.indexOf(f.target) >= 0 && (!actor || f.actor === actor); }); };
      if (rc && has('faith_founded')) extra = '最深的一层地宫里供着一艘小船的神像，船身上的编号和你的飞船一模一样。他们到最后都在等你。';
      else if (rc && /歌者/.test(rc.endCause || '')) { extra = '废墟边缘的仪器还记录着那一击：极简、重复，像一首随手哼出的歌。'; if (!u.ship.knowsSinger) { u.ship.knowsSinger = true; shipLog(u, '在' + s.name + '的废墟里读到歌者的签名'); extra += '你确认了「歌者」的存在。'; } u.ship.songs = (u.ship.songs || 0) + 1; }
      else if (rc && (u.fType.cleared || []).some(function (f) { var A = civOf(u, f.actor); return lin.indexOf(f.target) >= 0 && A && isEarthLine(u, A); })) extra = '他们最后的广播里反复念着一个坐标：太阳。';
      var sg = Math.round(8 + rt / 5), sp = u.ship.supply; u.ship.supply = Math.min(100, u.ship.supply + sg);
      if (rt > u.ship.tech) { var g = (rt - u.ship.tech) * 0.5 + 1; u.ship.tech += g; shipLog(u, '在' + s.name + '的遗迹中找回失落技术 +' + g.toFixed(1)); return { t: '「' + nm + '」曾经比你先进（科技 ' + rt.toFixed(0) + '）。你从废墟里找回了一部分他们的技术（飞船科技 +' + g.toFixed(1) + '）和还能用的物资（' + supTxt(u.ship.supply - sp) + '）。' + extra + how, cls: 'good' }; }
      return { t: '你在「' + nm + '」的废墟里找到了壁画、乐器和一些还能用的物资（' + supTxt(u.ship.supply - sp) + '；他们的科技 ' + rt.toFixed(0) + '，没有你用得上的技术）。' + extra + how, cls: '' };
    }
    if (!c || !c.alive) return { t: '这里没有可以交流的对象。', cls: 'dim' };
    var gap = c.tech - u.ship.tech, a = attOf(u, c), N = '「' + c.name + '」';
    switch (id) {
      case '讲述':
        imprint(u, c, '游子', 0.3); c.stab = Math.min(1, c.stab + 0.05);
        // 你见过的文明里，按你此刻（光延迟下）所知，有几个已经不在了
        var met = 0, gone = 0, told = [];
        Object.keys(u.memory).forEach(function (k) {
          var m = u.memory[k], id2 = +k; if (id2 !== 0) told.push(id2);
          if (m.civName == null || id2 === sysId) return; met++;
          var sn = stateAt(u.systems[id2], u.time - u.D[sysId][id2]); if (sn.name == null || sn.flat || sn.dead) gone++;
        });
        c.mapKnown = c.mapKnown || {}; told.forEach(function (id2) { c.mapKnown[id2] = 1; });
        legacyAdd(u, c, 'told', { n: told.length });
        logSys(u, s, '远行的「' + u.ship.name + '」回到母星，带回了 ' + Object.keys(u.memory).length + ' 个星系的见闻。', 2);
        var tail = !met ? tpick(u, 'tell', ['孩子们围着你问外面的星星是什么样子。', '他们把你的航行日志编进了教科书。'])
          : gone === 0 ? '你见过的 ' + met + ' 个文明，按你看到的光，都还活着。' + tpick(u, 'tell', ['孩子们围着你问外面的星星是什么样子。', '他们把你的航行日志编进了教科书。'])
          : gone * 2 >= met ? '有人哭了：你见过的 ' + met + ' 个文明，有 ' + gone + ' 个已经不在了。' : '你见过的 ' + met + ' 个文明里，有 ' + gone + ' 个已经不在了。档案员把它们的名字单独抄了一页。';
        return { t: '你把一路的见闻和星图交给了' + N + '。' + tail + (told.length ? '你去过的 ' + told.length + ' 个星系的坐标，现在都在母星的星图上。' : ''), cls: 'good' };
      case '观察':
        return { t: c.tech < 8 ? tpick(u, 'obs', ['你在轨道上看着他们围着篝火唱歌、打磨石器。他们永远不会知道你来过。', '你看着一个部落迁徙过冰原。他们抬头看了一眼天空，什么也没发现。', '你录下了他们的第一首歌。他们不会知道，这首歌会比他们活得更久。'])
          : tpick(u, 'obs', ['你只记录，不接触。他们的无线电里在吵一场战争和一场选举。', '你静静听了几天他们的广播：天气预报、情歌、还有一场关于星空是否有人的辩论。', '你记下了他们的城市灯光和港口，没有留下任何痕迹。']), cls: 'dim' };
      case '降临':
        c.tech += 2; c.stab = Math.max(0, c.stab - 0.25); addExpo(s, 0.1, 'contact');
        if (rnd(u) < 0.65) { imprint(u, c, '神', 0.7); legacyAdd(u, c, 'god', { how: 'descend' }); r = { t: '你走出飞船的那一刻，整个部落跪倒在地。你成了他们的神。旧的首领和祭司体系在一夜之间崩塌。', cls: 'warn' }; logSys(u, s, '一个「天神」从天而降，「' + c.name + '」的旧秩序崩塌。', 3); }
        else { imprint(u, c, '恶魔', -0.6); legacyAdd(u, c, 'devil', { how: 'descend', what: '是恶魔的模样' }); r = { t: '他们尖叫着逃散，有人向你投掷石块。在他们的传说里，你会是一个天外来的恶魔。', cls: 'bad' }; logSys(u, s, '一个「天外恶魔」降临，「' + c.name + '」陷入恐慌。', 3); }
        return r;
      case '少量技术':
        var d1 = Math.max(0, Math.min(5, u.ship.tech - 2 - c.tech)); c.tech += d1; c.stab = Math.max(0, c.stab - 0.05); c.giftYear = u.simYear;
        var gv = tpick(u, 'gift', [['你留下了疫苗、高产作物和一些基础物理。', '疫苗、高产作物和基础物理'], ['你教会了他们消毒、轮作和一点微积分。', '消毒、轮作和微积分'], ['你留下一本薄薄的手册：医学、冶金和天文。', '医学、冶金和天文手册']]);
        imprint(u, c, '恩人', 0.5); legacyAdd(u, c, 'gift_s', { what: gv[1] }); logSys(u, s, '一艘外来飞船给「' + c.name + '」留下了少量技术。', 2);
        return { t: gv[0] + N + '科技 +' + d1.toFixed(1) + '，社会平稳吸收了这份礼物。', cls: 'good' };
      case '大量技术':
        var before = eraOf(c.tech), d2 = Math.max(0, u.ship.tech - 3 - c.tech);
        c.giftTech = c.tech + d2; c.tech += d2; c.stab = Math.max(0, c.stab - 0.3); c.exp = Math.min(1, c.exp + 0.2); c.giftYear = u.simYear;
        imprint(u, c, '恩人', 0.8); legacyAdd(u, c, 'gift_l', { what: '核聚变、计算机和曲率理论入门' }); logSys(u, s, '一艘外来飞船给「' + c.name + '」留下了超越时代的技术。', 3);
        var shock = rnd(u) < 0.3; if (shock) c.stab = Math.min(c.stab, 0.12);
        return { t: '你把能给的都给了：核聚变、计算机、曲率理论的入门。' + N + '从' + before + '时代一步跳到' + eraOf(c.tech) + '时代（+' + d2.toFixed(0) + '）。' + (shock ? '新旧两派当场爆发冲突，这个社会可能撑不住。' : '社会剧烈震荡，他们看向星空的眼神变了。') + '他们会更早进入电波时代——也会更早被深空听见。', cls: 'warn' };
      case '假扮神明':
        c.stab = Math.min(1, c.stab + 0.2); c.exp = Math.min(1, c.exp + 0.15); imprint(u, c, '神', 0.8); legacyAdd(u, c, 'god', { how: 'miracle' });
        logSys(u, s, '一场以「天外来客」为中心的宗教在「' + c.name + '」兴起。', 3);
        return { t: '你让夜空出现第二个太阳，又让它熄灭。一场以你为中心的宗教兴起，他们空前团结，也开始向邻邦传教。', cls: 'warn' };
      case '交换技术':
        var sg = 1.5 + Math.max(0, gap) * 0.4, cg = 1.5 + Math.max(0, -gap) * 0.4;
        if (E.tense && rnd(u) < 0.3) { imprint(u, c, '入侵者', -0.6); legacyAdd(u, c, 'hostile', { rel: '在谈判中和他们交火' }); u.ship.supply = Math.max(0, u.ship.supply - 15); return { t: '谈判中对方舰长突然下令开火。你带着受损的飞船逃离（补给 −15），他们从此把你记成入侵者。', cls: 'bad' }; }
        var tv = tpick(u, 'teach', [['你们交换了材料学和曲率场计算。', '材料学和曲率场计算'], ['你们交换了冬眠医学和他们的反应堆设计。', '冬眠医学和反应堆设计'], ['你们花了几个月对照彼此的物理学，各自补上了几块空白。', '物理学笔记']]);
        u.ship.tech += sg; c.tech += cg; imprint(u, c, '旅人', 0.15); legacyAdd(u, c, 'teach', { what: tv[1] }); addExpo(s, 0.1, 'contact'); shipLog(u, '与「' + c.name + '」交换技术 +' + sg.toFixed(1));
        var leak = !c.knowsHome && c.exp > 0.6 && rnd(u) < 0.4; if (leak) extract(u, c, 0.4, 0);
        return { t: tv[0] + '飞船科技 +' + sg.toFixed(1) + '，' + N + '+' + cg.toFixed(1) + '。' + (leak ? '交换中，他们顺手推算出了你母星的方向。' : ''), cls: leak ? 'warn' : 'good' };
      case '贸易':
        var hs = seenHome(u, sysId), hc = homeCiv(u), sp1 = u.ship.supply; c.stab = Math.min(1, c.stab + 0.05); imprint(u, c, '旅人', 0.2);
        var route = hs.name && !hs.flat && hc && hc !== c;
        legacyAdd(u, c, 'trade', { route: route ? hs.name : '', what: '货物和故事' });
        addExpo(s, 0.1, 'contact'); u.ship.supply = Math.min(100, u.ship.supply + 30); u.ship.tech += 1;
        var sup = supTxt(u.ship.supply - sp1) + '，飞船科技 +1';
        if (route) { u.rel[relKey(c.id, hc.id)] = { type: '贸易', since: u.simYear }; logSys(u, s, '「' + c.name + '」通过一艘外来飞船与远方的「' + hs.name + '」建立了贸易。', 2); return { t: '你替「' + hs.name + '」和' + N + '开通了贸易航线（' + sup + '）。下次回来，两边可能都因此更繁荣，也可能为此开战。', cls: 'good' }; }
        return { t: '你们交换了货物和故事（' + sup + '）。' + (hs.flat || !hs.name ? '你的母星已经不在了，这条航线只属于你。' : ''), cls: '' };
      case '结盟':
        var hc2 = homeCiv(u), hs2 = seenHome(u, sysId); c.ally = true; imprint(u, c, '盟友', 0.3); legacyAdd(u, c, 'ally', { home: hs2.name && !hs2.flat ? hs2.name : '' }); addExpo(s, 0.15, 'contact');
        var ag = 1 + Math.max(0, gap) * 0.5; u.ship.tech += ag; u.ship.supply = Math.min(100, u.ship.supply + 40);
        var hn = hs2.name && !hs2.flat ? hs2.name : null;
        if (hn && hc2 && hc2 !== c) u.rel[relKey(c.id, hc2.id)] = { type: '贸易', since: u.simYear };
        logSys(u, s, '「' + c.name + '」与一艘外来飞船' + (hn ? '及其母星「' + hn + '」' : '') + '结盟。', 3);
        if (hn && hc2 && hc2 !== c && hc2.home != null) deferLog(u, hc2.home, u.time + u.D[sysId][hc2.home], '「' + c.name + '」的结盟信号传到了这里（它在路上走了 ' + Math.round(u.D[sysId][hc2.home]) + ' 年）：「' + hn + '」从此有了一个友邦。', 3);
        return { t: '你们签下盟约。他们分享了一部分技术（飞船科技 +' + ag.toFixed(1) + '）并补满了你的货舱' + (hn ? '，承认「' + hn + '」为友邦。' : '。'), cls: 'good' };
      case '对峙':
        imprint(u, c, '可疑者', -0.15);
        return { t: tpick(u, 'standoff', ['你们隔着几十万公里对峙了三天，然后各自退开。', '双方的炮口互相指着，谁也没开火。你倒退着离开了。', '他们的舰队一路跟着你到星系边缘。']) + '他们的档案里多了一条「可疑的外来飞船」。', cls: 'dim' };
      case '求教':
        var bonus = { '通行': 0.2, '礼遇': 0.3, '学者': 0.3, '官僚': 0.15 }[E.scene] || 0;
        var p = clamp(0.25 + 0.5 * a + 0.3 * (1 - c.exp) + bonus, 0.05, 0.95);
        if (rnd(u) < p) { var lg = Math.min(Math.max(1, gap) * 0.35, 12); u.ship.tech += lg; imprint(u, c, '学徒', 0.1); legacyAdd(u, c, 'learn', { what: '他们的科学' }); shipLog(u, '向「' + c.name + '」求教 +' + lg.toFixed(1)); return { t: tpick(u, 'learn', ['他们像对待一个好奇的孩子那样教了你一点东西。', '一位老学者陪你推了三个月的公式。', '他们给了你一套早已淘汰、但对你来说是奇迹的教材。']) + '飞船科技 +' + lg.toFixed(1) + '。', cls: 'good' }; }
        imprint(u, c, '可疑者', -0.2);
        if (!c.knowsHome) { extract(u, c, 0.3, 0); return { t: '他们拒绝了，并把你的飞船和来路标记为「待观察」。你的母星多了一双来自深空的眼睛。', cls: 'bad' }; }
        return { t: '他们拒绝了。你的档案里又多了一条「待观察」。', cls: 'warn' };
      case '交出星图':
        if (c.knowsHome) return { t: '你的星图他们早就有了。', cls: 'dim' };
        leakHome(u, 0.5, 0.5); c.knowsHome = true; c.passUntil = u.simYear + 300; u.ship.tech += 2; imprint(u, c, '信使', 0.2); legacyAdd(u, c, 'starmap', { what: '星图' });
        shipLog(u, '向「' + c.name + '」交出星图，换得通行证');
        return { t: '你交出了全部星图。他们给了你一张 300 年的通行证和一点小技术（+2）。你去过的每一个地方，现在都在他们的地图上。', cls: 'warn' };
      case '补给':
        var add = E.scene === '礼遇' ? 100 : 45; u.ship.supply = Math.min(100, u.ship.supply + add);
        return { t: (E.scene === '礼遇' ? '他们修好了飞船的每一道裂缝，货舱塞得满满当当。' : tpick(u, 'supply', ['你用一段航行日志换来了燃料和备件。', '他们按规定价格卖给你补给，顺便给船体做了检修。'])) + '补给现在是 ' + u.ship.supply.toFixed(0) + '。', cls: 'good' };
      case '交换见闻':
        var xg = Math.min(4, 1 + Math.max(0, gap) * 0.08); u.ship.tech += xg; imprint(u, c, E.scene === '学者' ? '样本' : '旅人', 0.25); legacyAdd(u, c, 'scholar', { what: '旅途见闻' });
        return { t: '你讲了' + Object.keys(u.memory).length + ' 个星系的故事，他们回报了一些知识（飞船科技 +' + xg.toFixed(1) + '）。' + N + '的档案馆里多了一卷你的口述史。', cls: 'good' };
      case '展出':
        var ey = Math.round(R(u, 15, 40));
        var er = passTime(u, sysId, ey, 1 / CRYO, { cryo: true, drain: 0, flatText: '展出期间，二向箔的平面在$Y扫过了' + s.name + '，博物馆和展柜里的飞船一起变成了画。' });
        E.detained = er.el;
        if (u.ship.dead) return { t: u.ship.dead.cause, cls: 'bad' };
        var eg = Math.min(10, Math.max(0, gap) * 0.3) + 2; u.ship.tech += eg; u.ship.supply = 100; imprint(u, c, '展品', 0.4); legacyAdd(u, c, 'relic', { what: '飞船' });
        logSys(u, s, '「' + c.name + '」国家博物馆展出了一艘活着的古董飞船「' + u.ship.name + '」。', 2);
        return { t: '你们在展柜里冬眠了 ' + ey + ' 年，被几十亿人参观过。放行时已是' + yr(u.simYear) + '。作为酬劳，他们升级了飞船（科技 +' + eg.toFixed(1) + '）并补满了补给。', cls: 'good' };
      case '委托':
        var M = E.mission; if (!M) return { t: '……', cls: 'dim' };
        u.ship.mission = { civ: c.id, civName: c.name, to: M.to, toName: M.toName, y: u.simYear };
        var sp2 = u.ship.supply; u.ship.supply = Math.min(100, u.ship.supply + 25); imprint(u, c, '信使', 0.2);
        return { t: '你接下了委托：把信和货送到 ' + M.toName + '。预付报酬已到手（' + supTxt(u.ship.supply - sp2) + '）。', cls: 'good' };
      case '拾荒':
        if (rnd(u) < 0.2) { imprint(u, c, '可疑者', -0.2); E.expelled = true; return { t: '巡逻舰发现了你。他们没开火，只是把你像赶苍蝇一样赶出了星系。', cls: 'warn' }; }
        var sg2 = Math.min(8, 1 + Math.max(0, gap) * 0.15), sc2 = Math.round(15 + Math.min(25, Math.max(0, gap) * 0.4)), sp3 = u.ship.supply; u.ship.tech += sg2; u.ship.supply = Math.min(100, u.ship.supply + sc2);
        return { t: '你在他们的轨道垃圾带里捡到了报废的反应堆芯和几块还能用的芯片（飞船科技 +' + sg2.toFixed(1) + '，' + supTxt(u.ship.supply - sp3) + '）。他们越先进，扔掉的东西越值钱。', cls: 'good' };
    }
    return { t: '……', cls: 'dim' };
  }

  return { loadEvents: loadEvents, EV: EV, factQuery: factQuery, shipKnows: shipKnows, hrand: hrand, homeCiv: homeCiv,
    DESTINIES: DESTINIES, chooseDestiny: chooseDestiny, destinyOf: destinyOf,
    createUniverse: createUniverse, simulateTo: simulateTo, travel: travel, hibernate: hibernate, tripCalc: tripCalc, interact: interact, dimOf: dimOf, flatR: flatR, EXPO_MAX: EXPO_MAX, singerDist: singerDist, encounter: encounter, attOf: attOf, attWord: attWord, TAG_DESC: TAG_DESC,
    remember: remember, stateAt: stateAt, eraLabel: eraLabel, eraOf: eraOf, fmtPop: fmtPop, lifeLine: lifeLine, snapshot: snapshot,
    typeInfo: typeInfo, SPEEDS: SPEEDS, WARP_SPEEDS: WARP_SPEEDS, isWarp: isWarp, yr: yr, LIFESPAN: LIFESPAN, WARP_SUPPLY: WARP_SUPPLY, CRYO: CRYO, isEarthLine: isEarthLine, causeLine: causeLine, seenHome: seenHome };
})();
if (typeof module !== 'undefined') module.exports = SIM;

SIM.loadEvents({"version":6,"events":[
{"id":"echo.gift_s.medicine","on":"year","need":["gift_s"],"when":[{"fact":{"type":"gift_s","target":"$c","actor":"ship","as":"g"}},{"since":{"as":"g","min":15}},{"stat":"c.tech","gte":8}],"p":0.02,"once":"subject","echo":true,"thread":"g","emit":{"type":"echo_gs1"},"text":{"log":["「{civ}」的医书写道：疫苗和高产作物源自{g.y}一位「天上来的医生」。","「{civ}」的孩子们在课本里读到：{g.y}，一艘飞船留下了{g.d.what}，[那一年之后婴儿死亡率减半|从此饥荒再没有回来过]。","「{civ}」的乡下还流传着「{shipBase}种」稻谷的说法——据说种子是{g.y}从天上带来的。"]}},
{"id":"echo.gift_s.observatory","on":"year","need":["echo_gs1"],"when":[{"fact":{"type":"echo_gs1","target":"$c","as":"e"}},{"since":{"as":"e","min":40}},{"stat":"c.tech","gte":30}],"p":0.01,"once":"subject","echo":true,"emit":{"type":"echo_gs2"},"text":{"log":["「{civ}」建成了一座以你的飞船命名的天文台——「{shipBase}天文台」。","「{civ}」第一座射电天文台的奠基石上刻着：献给{ship}，它让我们[学会了抬头|知道天上有人]。","「{civ}」的天文学家把你离开的方向命名为「医生之路」，望远镜一直对着那里。"]}},
{"id":"echo.gift_l.history","on":"year","need":["gift_l"],"when":[{"fact":{"type":"gift_l","target":"$c","actor":"ship","as":"g"}},{"since":{"as":"g","min":15}}],"p":0.03,"once":"subject","echo":true,"thread":"g","emit":{"type":"echo_gl1"},"text":{"log":["「{civ}」的科技史把那次大跃进追溯到{g.y}：你留下的{g.d.what}，成了他们所有学科的源头。","「{civ}」的大学里，每个一年级学生都要背诵{g.y}那份「天外手稿」的目录。","「{civ}」的历史学家把{g.y}称作「第二次开天」：那天之后，他们一口气跳过了[三个|好几个]时代。"]}},
{"id":"echo.gift_l.warpship","on":"year","need":["echo_gl1"],"when":[{"fact":{"type":"echo_gl1","target":"$c"}},{"fact":{"type":"gift_l","target":"$c","actor":"ship","as":"g"}},{"stat":"c.tech","gte":55}],"p":0.02,"once":"subject","echo":true,"thread":"g","emit":{"type":"echo_gl2"},"text":{"log":["「{civ}」的第一艘曲率舰下水，舰名就叫「{ship}」。","「{civ}」在{istar}跨入星海。首航舰的船舱里挂着一幅画：{g.y}降落在他们平原上的那艘小飞船。","「{civ}」的第一支曲率舰队以你的名字编号：「{shipBase}一号」到「{shipBase}十二号」。"]}},
{"id":"echo.gift_l.seek","on":"year","need":["echo_gl2"],"when":[{"fact":{"type":"echo_gl2","target":"$c","as":"e"}},{"since":{"as":"e","min":20}},{"stat":"att","gte":0.3},{"noFact":{"type":["butcher","ally_war"],"target":"$c"}}],"p":0.01,"once":"subject","echo":true,"emit":{"type":"seek_ship"},"text":{"log":["「{civ}」派出一艘侦察舰，沿着{ship}当年离开的方向寻找它。","「{civ}」的议会通过决议：如果在星海里遇见{ship}，要以国宾之礼相待。"]}},
{"id":"echo.gift_l.weapon","on":"year","need":["echo_gl2"],"when":[{"fact":{"type":"echo_gl2","target":"$c","as":"e"}},{"since":{"as":"e","min":30}},{"atWar":true}],"p":0.01,"once":"subject","echo":true,"forbid":["echo.gift_l.debate"],"emit":{"type":"echo_gl3","tags":["war"]},"text":{"log":["「{civ}」用你当年留下的理论造出了新武器，投入了战争。","「{civ}」的战舰上，引擎的铭牌写着「{shipBase}式」。你教给他们的方程，现在用来瞄准别人。"]}},
{"id":"echo.gift_l.debate","on":"year","need":["echo_gl1"],"when":[{"fact":{"type":"echo_gl1","target":"$c","as":"e"}},{"since":{"as":"e","min":120}}],"p":0.004,"once":"subject","echo":true,"forbid":["echo.gift_l.weapon"],"emit":{"type":"echo_gl3"},"text":{"log":["「{civ}」的学者为「那份礼物究竟是恩赐还是诅咒」争论了几百年。","「{civ}」出现了一个「自主派」：他们主张烧掉天外手稿，靠自己重新发现一切。","「{civ}」的哲学家写道：我们没有走过的路，终究要用别的方式补上。"]}},
{"id":"echo.teach.textbook","on":"year","need":["teach"],"when":[{"fact":{"type":"teach","target":"$c","actor":"ship","as":"t"}},{"since":{"as":"t","min":15}}],"p":0.02,"once":"subject","echo":true,"thread":"t","emit":{"type":"echo_te1"},"text":{"log":["「{civ}」的教科书里有一章叫「{shipBase}补遗」：{t.y}和一艘外来飞船交换来的{t.d.what}。","「{civ}」的工程师至今还在用一个以你命名的常数——「{shipBase}系数」，来自{t.y}那次技术交换。","「{civ}」的科学院档案里，{t.y}那次交换被记作「第一次跨文明联合研究」。"]}},
{"id":"echo.teach.institute","on":"year","need":["echo_te1"],"when":[{"fact":{"type":"echo_te1","target":"$c","as":"e"}},{"since":{"as":"e","min":80}},{"noFact":{"type":["butcher","ally_war"],"target":"$c"}}],"p":0.006,"once":"subject","echo":true,"text":{"log":["「{civ}」成立了「{shipBase}研究所」，专门研究外来文明的物理学。","「{civ}」每隔十年就向你离开的方向发一份新的论文摘要，标题永远是「给{ship}的回信」。"]}},
{"id":"echo.learn.student","on":"year","need":["learn"],"when":[{"fact":{"type":"learn","target":"$c","actor":"ship","as":"t"}},{"since":{"as":"t","min":15}}],"p":0.015,"once":"subject","echo":true,"text":{"log":["「{civ}」的老学者们还记得{t.y}来求教的那艘小飞船——他们管它叫「学徒号」。","「{civ}」的大学把{t.y}那次授课的录像放进了公开课：「如何给一个原始文明讲物理」。","「{civ}」流传着一个笑话：连{ship}都学会了，你怎么还不会？"]}},
{"id":"echo.trade.route","on":"year","need":["trade"],"when":[{"fact":{"type":"trade","target":"$c","actor":"ship","as":"t"}},{"flag":"t.data.route"},{"since":{"as":"t","min":15}}],"p":0.02,"once":"subject","echo":true,"thread":"t","forbid":["echo.trade.goods"],"emit":{"type":"echo_tr1"},"text":{"log":["「{civ}」与「{t.d.route}」之间的贸易航线还在运营，第一张航线图上标着：{ship}开辟，{t.y}。","「{civ}」的港口还挂着{t.y}那条航线的通航纪念牌：「{ship}」，从这里到「{t.d.route}」。","「{civ}」的商船队每年都沿着你开的那条航线驶向「{t.d.route}」，船员管它叫「{shipBase}航道」。"]}},
{"id":"echo.trade.goods","on":"year","need":["trade"],"when":[{"fact":{"type":"trade","target":"$c","actor":"ship","as":"t"}},{"since":{"as":"t","min":15}}],"p":0.015,"once":"subject","echo":true,"forbid":["echo.trade.route"],"emit":{"type":"echo_tr1"},"text":{"log":["「{civ}」的集市上至今还卖着仿制的「{ship}」模型。","「{civ}」的商会章程第一页写着：{t.y}，我们和一艘过路的飞船做成了第一笔星际生意。","「{civ}」的厨子们还在做一道「旅人汤」，据说配方是{t.y}从那艘飞船上换来的。"]}},
{"id":"echo.trade.prosper","on":"year","need":["echo_tr1"],"when":[{"fact":{"type":"echo_tr1","target":"$c","as":"e"}},{"since":{"as":"e","min":60}},{"noFact":{"type":["butcher","ally_war"],"target":"$c"}}],"p":0.006,"once":"subject","echo":true,"text":{"log":["靠那条航线发家的商会成了「{civ}」最有势力的家族，他们的徽章是一艘小飞船。","「{civ}」的经济史把你开通航线的那一年当作「远洋时代」的起点。"]}},
{"id":"echo.ally.berth","on":"year","need":["ally"],"when":[{"fact":{"type":"ally","target":"$c","actor":"ship","as":"a"}},{"since":{"as":"a","min":10}},{"noFact":{"type":["butcher","ally_war"],"target":"$c"}}],"p":0.025,"once":"subject","echo":true,"thread":"a","emit":{"type":"echo_al1"},"text":{"log":["「{civ}」的港口为「{ship}」保留着一个泊位，铭牌上写着：盟友，{a.y}。","「{civ}」的舰队旗舰上一直挂着两面旗：他们自己的，和{a.y}盟约上你画的那面。","「{civ}」的外交部门口立着一块碑，刻着{a.y}盟约的全文，最后一行是「{ship}」的签名。"]}},
{"id":"echo.ally.festival","on":"year","need":["echo_al1"],"when":[{"fact":{"type":"echo_al1","target":"$c","as":"e"}},{"fact":{"type":"ally","target":"$c","actor":"ship","as":"a"}},{"since":{"as":"e","min":40}},{"noFact":{"type":["butcher","ally_war"],"target":"$c"}}],"p":0.008,"once":"subject","echo":true,"text":{"log":["「{civ}」把与你结盟的那一天定为节日：「盟约日」。","每到盟约日，「{civ}」的孩子们会向夜空放飞纸做的小飞船，朝着你离开的方向。","「{civ}」的老兵说，{a.y}那份盟约救过他们不止一次。"]}},
{"id":"echo.starmap.trade","on":"year","need":["starmap"],"when":[{"fact":{"type":"starmap","target":"$c","actor":"ship","as":"s"}},{"since":{"as":"s","min":15}}],"p":0.02,"once":"subject","echo":true,"text":{"log":["「{civ}」的商人用你{s.y}交出的星图做起了生意：航线图上，你去过的每一个星系都标着价钱。","「{civ}」的测绘局把你{s.y}交出的星图叫作「{shipBase}底图」，至今还在用。","「{civ}」的探险家沿着你星图上的标记，一个个拜访了你去过的地方。"]}},
{"id":"echo.extract.archive","on":"year","need":["extract"],"when":[{"fact":{"type":"extract","actor":"$c","target":"ship","as":"s"}},{"since":{"as":"s","min":20}}],"p":0.01,"once":"subject","echo":true,"text":{"log":["「{civ}」的情报档案里，有一份{s.y}从外来飞船导航库里抽出来的星图，太阳被画了一个红圈。","「{civ}」的战略学院至今还在分析{s.y}截获的那份星图。"]}},
{"id":"echo.courier.meeting","on":"year","need":["courier"],"when":[{"fact":{"type":"courier","target":"$c","actor":"ship","as":"m"}},{"since":{"as":"m","min":10}}],"p":0.02,"once":"subject","echo":true,"text":{"log":["你送达的那封信，促成了「{civ}」与「{m.d.other}」的第一次正式会面。","「{civ}」与「{m.d.other}」的外交史从{m.y}的一封信开始，送信的是{ship}。"]}},
{"id":"echo.relic.museum","on":"year","need":["relic"],"when":[{"fact":{"type":"relic","target":"$c","actor":"ship","as":"r"}},{"since":{"as":"r","min":10}}],"p":0.02,"once":"subject","echo":true,"text":{"log":["你的飞船模型成了「{civ}」国家博物馆的镇馆之宝，每年有上亿人排队参观。","「{civ}」的博物馆至今还保留着{r.y}那个展位，牌子上写着：「{ship}，活着的古董，已离开」。","「{civ}」的孩子们玩一种游戏：一个人扮冬眠的舰员，其他人扮排队看展的游客。"]}},
{"id":"echo.scholar.book","on":"year","need":["scholar"],"when":[{"fact":{"type":"scholar","target":"$c","actor":"ship","as":"r"}},{"since":{"as":"r","min":10}}],"p":0.02,"once":"subject","echo":true,"text":{"log":["「{civ}」的学者根据对你的研究写出了一部《原始曲率飞船考》，至今仍被人翻阅。","「{civ}」的档案馆里，你那卷口述史被翻译成了[十几|几十]种语言。","「{civ}」的语言学家从你的航行日志里复原了「地球语」的语法。"]}},
{"id":"echo.detained.log","on":"year","need":["detained"],"when":[{"fact":{"type":"detained","target":"$c","actor":"ship","as":"h"}},{"since":{"as":"h","min":10}},{"noFact":{"type":"hostile","target":"$c","actor":"ship"}}],"p":0.02,"once":"subject","echo":true,"text":{"log":["「{civ}」的档案馆里还存着{h.y}扣押{ship}时抄下的航行日志，编号很靠后，几乎没人借阅。","「{civ}」的一位历史学家写了本小书，题目是《我们为什么扣下了{ship}》。结论是：没有理由，只是习惯。","「{civ}」的港口条例里多了一条注释：「参见{h.y}外来飞船扣押案」。"]}},
{"id":"echo.hostile.academy","on":"year","need":["hostile"],"when":[{"fact":{"type":"hostile","target":"$c","actor":"ship","as":"h"}},{"since":{"as":"h","min":10}}],"p":0.02,"once":"subject","echo":true,"emit":{"type":"echo_ho1"},"text":{"log":["「{civ}」的军事学院把「{shipBase}事件」写进了教材，作为外来威胁的经典案例。","「{civ}」的边防条例第一条：遇到与{ship}特征相符的飞船，立即上报。","「{civ}」的历史课说，{h.y}那艘外来飞船曾{h.act}，从此他们不再相信陌生人。"]}},
{"id":"echo.hostile.patrol","on":"year","need":["echo_ho1"],"when":[{"fact":{"type":"echo_ho1","target":"$c","as":"e"}},{"since":{"as":"e","min":30}},{"stat":"c.tech","gte":55}],"p":0.01,"once":"subject","echo":true,"emit":{"type":"seek_revenge"},"text":{"log":["「{civ}」的巡逻舰开始在已知星域的边缘搜寻一艘与「{ship}」特征相符的飞船。","「{civ}」悬赏寻找{ship}：活要见船，死要见残骸。"]}},
{"id":"echo.told.home","on":"year","need":["told"],"when":[{"fact":{"type":"told","target":"$c","actor":"ship","as":"t"}},{"since":{"as":"t","min":20}},{"earth":"$c"}],"p":0.015,"once":"subject","echo":true,"text":{"log":["「{civ}」的孩子们还在读{t.y}那本《{ship}航行记》。","「{civ}」的星图上，你{t.y}带回的那些星系都标着一个小小的船形记号。"]}},
{"id":"echo.enabled_gift","on":"fact:cleared","subject":"actor","when":[{"bind":{"as":"h","from":"f.data.help"}},{"any":[{"stat":"h.type","eq":"gift_l"},{"stat":"h.type","eq":"gift_s"}]},{"noFact":{"type":"butcher","target":"$c","maxAge":0}}],"echo":true,"nocap":true,"imp":3,"text":{"log":["你{h.n} 年给的{h.d.what}让「{civ}」在{istar}进入星海；{f.y}，他们[的深空监听网发现了|盯上了]「{f.d.victim}」，随即清理了它。","「{civ}」清理了「{f.d.victim}」（{f.y}）。他们能走到这一步，起点是{h.y}你留下的{h.d.what}。"]}},
{"id":"echo.enabled_bond","on":"fact:cleared","subject":"actor","when":[{"bind":{"as":"h","from":"f.data.help"}},{"not":{"any":[{"stat":"h.type","eq":"gift_l"},{"stat":"h.type","eq":"gift_s"}]}},{"noFact":{"type":"butcher","target":"$c","maxAge":0}}],"echo":true,"nocap":true,"imp":3,"text":{"log":["{h.y}你曾{h.act}，让「{civ}」更快地强大起来；{f.y}，他们清理了「{f.d.victim}」。","「{civ}」的深空监听网在{f.y}发现了「{f.d.victim}」，然后把它抹掉了。{h.y}，你曾{h.act}。"]}},
{"id":"ally.butcher","on":"fact:cleared","subject":"actor","when":[{"fact":{"type":["ally","trade","teach"],"target":"$c","actor":"ship","known":"any","as":"h"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"forbid":["echo.ally.berth","echo.ally.festival","echo.trade.prosper","echo.teach.institute"],"emit":{"type":"butcher","data":{"victim":"{f.d.victim}","what":"他们向「{f.d.victim}」射出了光粒"}},"text":{"log":["「{civ}」清理了「{f.d.victim}」。{h.y}你曾{h.act}；如今，他们也成了黑暗森林里的猎手。{v.why}","{f.y}，「{civ}」向「{f.d.victim}」射出了光粒。你还记得{h.y}{h.act}时的样子。{v.why}"]},"pre":[{"calc":"why"}],"card":{"cls":"bad","w":7,"title":"你的{h.d.rel}伙伴成了屠夫：「{civ}」","body":"你看到的是{f.y}的光：「{civ}」清理了「{f.d.victim}」。{h.y}，你曾{h.act}。{v.why}"}},
{"id":"ally.war_home","on":"fact:war","subject":"either","when":[{"earth":"$o"},{"earth":"$c","is":false},{"fact":{"type":["ally","trade"],"target":"$c","actor":"ship","known":"any","as":"h"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"forbid":["echo.ally.berth","echo.ally.festival","echo.trade.prosper","echo.teach.institute"],"emit":{"type":"ally_war","data":{"other":"{other}","what":"他们向「{other}」开战"}},"text":{"log":["「{civ}」与「{other}」开战了。{h.y}你替他们和母星牵起的{h.d.rel}之约，没能挡住这场战争。","{f.y}，「{civ}」的舰队驶向太阳系。{h.y}你曾{h.act}；现在他们与你的母星成了敌人。"]},"card":{"cls":"bad","w":6,"title":"「{civ}」向母星开战","body":"你看到的是{f.y}的光：「{civ}」与「{other}」开战了。{h.y}，你曾{h.act}。"}},
{"id":"ally.confront","on":"arrival","subject":"here","when":[{"fact":{"type":["butcher","ally_war"],"target":"$c","known":"ship","as":"b"}},{"fact":{"type":["god","ally","gift_l","warned","teach","trade","gift_s","learn","courier","relic","scholar","starmap"],"target":"$c","actor":"ship","known":"any","as":"h"}},{"not":{"scene":["故人","故人·怨","故人·求"]}}],"once":"subject","cls":"warn","scene":"旧盟","text":{"show":["你认识的「{civ}」已经不是当年那个{h.d.rel}伙伴了（{h.y}）：{b.y}，{b.d.what}。舰桥上，他们的使节在等你开口。","「{civ}」认出了{ship}。{h.y}你曾{h.act}；{b.y}，{b.d.what}。他们知道你看到了。"]},"options":[{"id":"ally.mediate","label":"调停：劝他们与母星[停战|讲和]","desc":"以老朋友的身份去谈。成功与否取决于他们还念不念旧情。","when":[{"fact":{"type":"ally_war","target":"$c","known":"ship"}},{"alive":"home"}]},{"id":"ally.question","label":"质问：他们为什么这么做","desc":"听听他们自己的说法。","when":[{"fact":{"type":"butcher","target":"$c","known":"ship"}}]},{"id":"ally.side","label":"站在他们一边","desc":"他们会善待你。母星的档案会记下这件事。"},{"id":"ally.retaliate","label":"报复：向全宇宙广播他们的坐标","desc":"黑暗森林式的报复。歌者迟早会看到；他们也会恨你到底。"}]},
{"id":"ally.mediate","on":"choice","when":[{"alive":"home"}],"outcomes":[{"when":[{"rel":{"with":"home","type":"战争"}}],"p":0.45,"mod":[{"if":{"stat":"att","gte":0.3},"x":1.6},{"if":{"temper":["好战"]},"x":0.5}],"cls":"good","effects":[{"op":"rel","with":"home","type":"停战"},{"op":"imprint","v":0.1}],"emit":{"type":"mediated","data":{"how":"ceasefire"}},"echo":true,"imp":3,"log":["在{ship}的斡旋下，「{civ}」与「{home}」签下了停火协议。"],"result":"你们谈了整整一年。最后他们同意停火：为了{h.y}那份{h.d.rel}之约，也为了你。「{civ}」与「{home}」的战争暂时停了下来。"},{"when":[{"rel":{"with":"home","type":"战争"}}],"cls":"bad","effects":[{"op":"imprint","v":-0.3}],"emit":{"type":"mediate_failed"},"expel":true,"result":"他们听你说完，只回了一句：「这不关你的事。」你被礼貌而坚决地请出了星系。战争还在继续。"},{"p":0.7,"mod":[{"if":{"stat":"att","gte":0.3},"x":1.3}],"cls":"good","effects":[{"op":"rel","with":"home","type":"贸易"},{"op":"imprint","v":0.1}],"emit":{"type":"mediated","data":{"how":"treaty"}},"echo":true,"imp":3,"log":["{ship}在「{civ}」与「{home}」之间奔走，把一纸停火变成了正式的和约。"],"result":"仗已经停了，但两边只是各自收兵，谁也没签字。你在两边之间来回跑了一年，最后把停火变成了一份正式的和约，商船可以重新开过去了。"},{"cls":"warn","effects":[{"op":"imprint","v":-0.1}],"emit":{"type":"mediate_failed"},"result":"「仗已经打完了，」他们说，「用不着一艘外来的飞船替我们记账。」你没能让他们签字。"}]},
{"id":"echo.mediated.memorial","on":"year","need":["mediated"],"when":[{"fact":{"type":"mediated","target":"$c","actor":"ship","known":"any","as":"m"}},{"since":{"as":"m","min":30}},{"noFact":{"type":"butcher","target":"$c"}}],"p":0.01,"once":"subject","echo":true,"text":{"log":["「{civ}」在边境上立了一块碑，纪念{m.y}那场没有再打下去的战争。碑文的最后一行是{ship}的名字。","「{civ}」与「{home}」的边境哨所之间，每年都会交换一次礼物。这个习惯始于{m.y}，始于{ship}。"]}},
{"id":"ally.question","on":"choice","outcomes":[{"cls":"warn","pre":[{"calc":"why"}],"effects":[{"op":"imprint","v":-0.05}],"emit":{"type":"questioned"},"result":"他们给你看了监听记录：「{b.d.victim}」的坐标在深空里亮了很久。「不是我们，也会是别人。」他们说，「这片森林里，先开枪的才能活下来。」{v.why}"}]},
{"id":"ally.side","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"imprint","tag":"盟友","v":0.3},{"op":"ship","supply":40,"tech":3}],"emit":{"type":"sided"},"echo":true,"imp":3,"log":["{ship}在「{civ}」最孤立的时候站在了他们一边。「{home}」的档案里，这艘船从此多了一个词：叛徒。"],"result":"你留下来，和他们站在一起。他们把你的货舱装满（补给 {v.supply}，飞船科技 {v.tech}）。消息会以光速传回母星——那里会有人记住这件事。"}]},
{"id":"ally.retaliate","on":"choice","outcomes":[{"cls":"bad","effects":[{"op":"expo","at":"c.home","kind":"bcast","v":3},{"op":"imprint","tag":"入侵者","v":-0.9}],"emit":{"type":"retaliated","tags":["player","harm"]},"echo":true,"imp":3,"expel":true,"log":["{ship}向全宇宙广播了「{civ}」母星的坐标。"],"result":"你把「{civ}」母星的坐标射向了全宇宙。这道光要走几十到几百年才会被星图之外的清理者看到。他们的舰队把你赶出了星系，从此你在他们的档案里只有一个名字：入侵者。"}]},
{"id":"home.hunter_map","on":"fact:cleared","subject":"actor","when":[{"earth":"$c"},{"stat":"f.data.kind","eq":"map"},{"fact":{"type":"told","target":"$c","actor":"ship","known":"any","as":"t"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"text":{"log":["「{civ}」按你{t.y}带回的星图，找到并清理了「{f.d.victim}」。","你{t.y}讲给母星的旅途见闻里有「{f.d.victim}」的坐标。{f.y}，「{civ}」用它射出了光粒。"]},"card":{"cls":"bad","w":6,"key":"home_hunter","title":"母星成了猎手","body":"你看到的是{f.y}的光：「{civ}」清理了「{f.d.victim}」。坐标来自你{t.y}带回母星的星图。"}},
{"id":"home.hunter","on":"fact:cleared","subject":"actor","when":[{"earth":"$c"},{"not":{"stat":"f.data.kind","eq":"map"}}],"once":"subject","imp":3,"text":{"log":["「{civ}」第一次向别的文明射出了光粒：目标是「{f.d.victim}」。","{f.y}，「{civ}」的深空监听网发现了「{f.d.victim}」。议会只争论了三天。"]},"card":{"cls":"bad","w":4,"key":"home_hunter","title":"母星成了猎手","body":"你看到的是{f.y}的光：「{civ}」向「{f.d.victim}」射出了光粒。你出发时的那个文明，学会了黑暗森林的规矩。"}},
{"id":"home.archive","on":"arrival","subject":"here","when":[{"earth":"$c"},{"calc":"archive"},{"noFact":{"type":"archive_read","target":"$c","maxAge":200}}],"cls":"warn","text":{"show":["母星的档案馆向你开放了一份标着「深空清理记录」的卷宗。"]},"options":[{"id":"home.archive_read","label":"查阅母星的清理档案","desc":"看看你不在的这些年，母星对别的文明做了什么。"}]},
{"id":"home.archive_read","on":"choice","outcomes":[{"cls":"bad","pre":[{"calc":"archive"}],"emit":{"type":"archive_read"},"result":"卷宗里一共 {v.archiveN} 条记录：{v.archive}。{v.archiveYou}"}]},
{"id":"home.refugees","on":"fact:cleared","subject":"target","dead":true,"when":[{"earth":"$o"},{"stat":"c.peakTech","gte":55}],"p":0.75,"once":"subject","effects":[{"op":"refugees","from":"$c","name":"遗民舰队"}],"emit":{"type":"refugee_vow","target":"spawned","data":{"victim":"{civ}"}},"scope":"spawned","imp":3,"text":{"log":["「{civ}」的遗民在流亡中立誓：总有一天，要让太阳也尝到光粒的滋味。","「{civ}」的幸存者把那颗光粒的来向刻在旗舰的船首：太阳。"]}},
{"id":"refugee.broadcast","on":"year","need":["refugee_vow"],"when":[{"fact":{"type":"refugee_vow","target":"$c","as":"r"}},{"since":{"as":"r","min":100}},{"stat":"c.tech","gte":50},{"noFact":{"type":"apology","target":"$c"}}],"p":0.004,"once":"subject","imp":3,"effects":[{"op":"expo","at":"sun","kind":"war","v":3}],"emit":{"type":"refugee_bcast","actor":"$c","target":"home"},"text":{"log":["「{civ}」向全宇宙广播了太阳的坐标：这是「{r.d.victim}」的复仇。","「{civ}」兑现了誓言：太阳的坐标被射向了深空的每一个方向。"]},"card":{"cls":"bad","w":7,"title":"遗民广播了太阳的坐标","body":"你看到的是{year}的光：被母星清理的「{r.d.victim}」，它的遗民「{civ}」向全宇宙广播了太阳的坐标。"}},
{"id":"refugee.intercept","on":"arrival","subject":"near","range":130,"when":[{"fact":{"type":"refugee_vow","target":"$c","as":"r"}},{"reach":{"as":"r","speed":0.9}},{"stat":"c.tech","gte":55},{"noFact":{"type":["apology","refugee_met"],"target":"$c"}}],"p":0.6,"once":"subject","cooldownGroup":"fleet","groupCooldown":200,"cls":"bad","echo":true,"emit":{"type":"refugee_met"},"text":{"show":["「{civ}」截住了你。他们是{r.y}被母星清理的「{r.d.victim}」的遗民——而{ship}的船身上，印着太阳系的识别码。","一支伤痕累累的舰队挡在航线上。「{civ}」：{r.y}，「{home}」的光粒落在了他们的故乡「{r.d.victim}」。他们认出了你从哪里来。"]},"options":[{"id":"refugee.apologize","label":"替母星道歉","desc":"你不是开枪的人，但你来自那里。"},{"id":"refugee.flee","label":"强行突围","desc":"曲率引擎全开。可能逃得掉，也可能被打穿货舱。"}]},
{"id":"refugee.apologize","on":"choice","outcomes":[{"p":0.5,"mod":[{"if":{"fact":{"type":"archive_read","actor":"ship","known":"any"}},"x":1.4}],"cls":"good","emit":{"type":"apology"},"effects":[{"op":"ship","supply":-10}],"echo":true,"imp":3,"log":["{ship}替「{home}」向「{civ}」道歉。遗民们放弃了广播太阳坐标的计划。"],"result":"你讲了很久：你离开时母星是什么样子，你又在档案里读到了什么。他们的首领最后说：「我们不会忘记。但我们不会变成你们。」他们放你离开，也放弃了向全宇宙广播太阳坐标的计划。（补给 {v.supply}）"},{"cls":"bad","effects":[{"op":"ship","supply":-35}],"emit":{"type":"refugee_spurned"},"result":"「道歉？」他们打穿了你的货舱（补给 {v.supply}），然后让你走——好让你回去告诉太阳：他们还活着。"}]},
{"id":"refugee.flee","on":"choice","outcomes":[{"p":0.5,"cls":"warn","effects":[{"op":"ship","supply":-15}],"result":"你全速冲出包围，只挨了几发擦边弹（补给 {v.supply}）。他们没有追——他们要找的从来不是你。"},{"cls":"bad","effects":[{"op":"ship","supply":-35}],"result":"突围失败。他们打穿了货舱，把你扔在原地（补给 {v.supply}）。"}]},
{"id":"recog.blame","on":"recognize","subject":"here","group":"recog","when":[{"diaspora":true},{"fact":{"type":"cleared","target":"$c","known":"any","as":"k"}},{"flag":"k.data.player"}],"once":"subject","cls":"bad","scene":"故人·怨","imp":3,"text":{"show":["「{civ}」认出了{ship}。他们是「{k.d.victim}」的流亡者。档案里写着：{k.y}落下的{k.d.weapon}，是被{k.d.why}引来的。舰桥上没有人说话。","「{civ}」的哨舰核对了你的识别码，然后整支舰队都转了过来。{k.y}，「{k.d.victim}」被抹掉——他们一直知道那是谁留下的痕迹：{k.d.why}。"]},"options":[{"id":"recog.apologize","label":"承认，并道歉","desc":"你无法弥补，但可以不再躲。"},{"id":"recog.give_tech","label":"把飞船上的技术资料全给他们","desc":"飞船科技不会下降，但这是你能给的全部。"}]},
{"id":"recog.apologize","on":"choice","outcomes":[{"p":0.6,"cls":"warn","effects":[{"op":"imprint","v":0.25}],"emit":{"type":"apology"},"echo":true,"log":["{ship}向「{civ}」承认了当年的事。"],"result":"你说完，很久没人开口。最后他们的长老说：「你走吧。我们会把这件事写下来：那艘船回来过，而且没有逃。」"},{"cls":"bad","effects":[{"op":"imprint","v":-0.2},{"op":"ship","supply":-20}],"expel":true,"result":"道歉换来的是一轮警告射击（补给 {v.supply}）。他们不需要你的道歉，只需要你离开。"}]},
{"id":"recog.give_tech","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"imprint","v":0.35},{"op":"add","path":"c.tech","v":1}],"emit":{"type":"reparation"},"echo":true,"log":["{ship}把全部技术资料交给了「{civ}」，作为迟到的赔偿。"],"result":"他们收下了资料。没有道谢，但放你走时，哨舰朝你闪了三下灯——那是他们送别死者的方式。"}]},
{"id":"recog.demand","on":"recognize","subject":"here","group":"recog","when":[{"diaspora":true},{"fact":{"type":"cleared","target":"$c","known":"any","as":"k"}},{"noflag":"k.data.player"},{"fact":{"type":["god","ally","gift_l","warned","teach","trade","gift_s","learn","courier","relic","scholar","starmap"],"target":"$c","actor":"ship","known":"any","as":"h"}}],"once":"subject","cls":"warn","scene":"故人·求","imp":3,"text":{"show":["「{civ}」认出了{ship}：{h.y}你曾{h.act}。如今他们是流亡者，{k.y}故乡被{k.d.weapon}毁掉。他们想要你的星图——想知道哪里还安全，以及那件武器是从哪里来的。","「{civ}」把你请上旗舰。「你见过外面。」他们说，「{k.y}之后我们就一直在逃。把你的星图给我们。」"]},"options":[{"id":"recog.give_maps","label":"交出星图","desc":"你去过的每一个地方（包括太阳）都会在他们的地图上。"},{"id":"recog.refuse","label":"拒绝","desc":"星图可能害死别人，也可能救他们。"}]},
{"id":"recog.give_maps","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"leak","v":0.4,"also":0.3},{"op":"imprint","tag":"恩人","v":0.5},{"op":"ship","supply":50,"tech":2},{"op":"pass","years":300}],"emit":{"type":"starmap","actor":"ship","tags":["player","help"],"data":{"rel":"交出星图","what":"星图"}},"result":"你交出了星图。他们回赠了补给和一些技术（补给 {v.supply}，飞船科技 {v.tech}），还有一张 300 年的通行证。「我们会记得，」他们说，「是你给我们指了路。」"}]},
{"id":"recog.refuse","on":"choice","outcomes":[{"cls":"dim","effects":[{"op":"imprint","v":-0.2}],"expel":true,"result":"他们没有强抢。流亡者已经没有力气再树一个敌人了。你离开时，他们的舰队还停在原地，像在等别的什么人。"}]},
{"id":"recog.grateful","on":"recognize","subject":"here","group":"recog","when":[{"fact":{"type":["god","ally","gift_l","warned","teach","trade","gift_s","learn","courier","relic","scholar","starmap"],"target":"$c","actor":"ship","known":"any","as":"h"}},{"any":[{"diaspora":true},{"scene":["冷漠"]},{"flag":"c.parent"}]},{"noFact":{"type":["butcher","ally_war","retaliated","hostile"],"target":"$c"}}],"once":"subject","cls":"good","scene":"故人","text":{"show":["「{civ}」的档案馆认出了{ship}：{h.y}，你曾{h.act}。哨舰撤去了炮口，港口为你打开。","扫描刚开始就停了。「{civ}」的通讯官念出了你的船名，又念出了一个年份：{h.y}。「我们的教科书里有你。」"]},"options":[{"id":"recog.supply","label":"接受他们的补给","desc":"老朋友的后代会把货舱装满。"},{"id":"recog.learn","label":"向他们求教","desc":"他们远比你先进，而且愿意教。"}]},
{"id":"recog.supply","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"ship","supply":60,"tech":1},{"op":"imprint","tag":"恩人","v":0.2}],"emit":{"type":"recog_met"},"echo":true,"log":["{ship}回来了。「{civ}」以祖先恩人的礼节接待了它。"],"result":"他们按祖先留下的礼节接待了你（补给 {v.supply}，飞船科技 {v.tech}）。临走时，一个孩子递给你一本书，封面上画着你的飞船。"}]},
{"id":"recog.learn","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"ship","tech":2,"techGap":0.3},{"op":"imprint","tag":"恩人","v":0.2}],"emit":{"type":"recog_met"},"echo":true,"log":["「{civ}」把他们的科学回赠给了祖先的恩人{ship}。"],"result":"他们说：「当年你教了我们的祖先，现在轮到我们。」飞船科技 {v.tech}。"}]},
{"id":"payoff.gratitude_fleet","on":"arrival","subject":"near","range":90,"when":[{"stat":"c.tech","gte":55},{"calc":"help"},{"any":[{"fact":{"type":"seek_ship","target":"$c"}},{"stat":"att","gte":0.4}]},{"noFact":{"type":["butcher","ally_war","retaliated","faith_met","recog_met"],"target":"$c"}}],"p":0.4,"once":"subject","cooldownGroup":"fleet","groupCooldown":400,"cls":"good","echo":true,"emit":{"type":"fleet_met"},"effects":[{"op":"ship","supply":40,"tech":2,"techGap":0.15}],"text":{"show":["一支来自「{civ}」的舰队在这里等你。{h.y}你曾{h.act}，他们一直记着。他们带来了补给和技术（补给 {v.supply}，飞船科技 {v.tech}）。","「{civ}」的舰队在{here}找到了{ship}。{h.y}，你曾{h.act}；他们一直在等这一天（补给 {v.supply}，飞船科技 {v.tech}）。"]}},
{"id":"payoff.revenge_fleet","on":"arrival","subject":"near","range":90,"when":[{"stat":"c.tech","gte":55},{"fact":{"type":["hostile","devil","retaliated"],"target":"$c","actor":"ship","known":"any","as":"h"}},{"any":[{"fact":{"type":"seek_revenge","target":"$c"}},{"stat":"att","lte":-0.4}]},{"noFact":{"type":["apology","revenge_met"],"target":"$c"}}],"p":0.4,"once":"subject","cooldownGroup":"fleet","groupCooldown":400,"cls":"bad","echo":true,"emit":{"type":"revenge_met"},"effects":[{"op":"ship","supply":-35}],"text":{"show":["「{civ}」的复仇舰队截住了你：他们没有忘记{h.y}你曾{h.act}。飞船的货舱被打穿（补给 {v.supply}）。","{here}的轨道上，「{civ}」的战舰等了你很久。{h.y}的事，他们一笔一笔记着（补给 {v.supply}）。"]}},
{"id":"rel.founded","on":"fact:god","when":[{"noFact":{"type":"faith_founded","target":"$c"}},{"noFact":{"type":"devil","target":"$c","actor":"ship"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"effects":[{"op":"set","path":"c.religion","v":"{shipBase}教"},{"op":"protect","years":300,"floor":0.3,"quiet":0.35}],"emit":{"type":"faith_founded"},"unlock":[{"event":"rel.schism","delay":[30,160],"window":900},{"event":"rel.pilgrimage","delay":[20,120],"window":450},{"event":"rel.false_prophet","delay":[40,220],"window":600}],"text":{"log":["「{civ}」把你奉为神明，「{religion}」成了他们的国教。神庙里供着一艘发光的小船。经书第一章写着：神说，不要向黑暗呼喊。","「{religion}」在「{civ}」传开了：神乘着光来，又乘着光走。祭司们教导信徒安静地等待，不要向天空喊叫。","「{civ}」的每座城市都建起了「{religion}」的神庙，屋顶都朝着你离开的方向。教义说：神喜欢安静的孩子。"]}},
{"id":"rel.devil_to_god","on":"fact:god","when":[{"fact":{"type":"devil","target":"$c","actor":"ship","as":"d"}},{"noFact":{"type":"faith_founded","target":"$c"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"effects":[{"op":"set","path":"c.religion","v":"{shipBase}教"},{"op":"protect","years":300,"floor":0.3,"quiet":0.35}],"forbid":["dev.arms","dev.revenge","dev.ritual_fades"],"emit":{"type":"faith_founded","data":{"fromDevil":1}},"unlock":[{"event":"rel.schism","delay":[30,160],"window":900},{"event":"rel.pilgrimage","delay":[20,120],"window":450},{"event":"rel.false_prophet","delay":[40,220],"window":600}],"text":{"log":["「{civ}」的{ritual}在一夜之间变了意思：{d.y}的天外恶魔，原来是来考验他们的神。面具还是那副面具，现在被供在神庙里。","恶魔回来了，这一次带着神迹。「{civ}」的祭司宣布：{d.y}的降临是一场试炼，而他们通过了。{ritual}从此改叫「归神节」。"]}},
{"id":"rel.god_to_devil","on":"fact:devil","when":[{"fact":{"type":"faith_founded","target":"$c","as":"r"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"effects":[{"op":"add","path":"c.stab","v":-0.15,"min":0},{"op":"set","path":"c.sects","v":["旧约派","新约派"]}],"emit":{"type":"faith_schism","data":{"why":"devil"}},"forbid":["rel.schism"],"unlock":[{"event":"rel.holy_war","delay":[10,80]},{"event":"rel.reformation","delay":[30,200]}],"pre":[{"calc":"faith"}],"text":{"log":["神回来了，却{f.d.what}。「{religion}」当场裂成了「{sect0}」和「{sect1}」：一派说神在惩罚他们，一派说那根本不是神。","{r.y}以来，「{civ}」一直供奉着{v.sign}。{f.y}，神回来了，却{f.d.what}。「{sect1}」砸碎了神像；「{sect0}」说，这是神在考验谁的信仰更坚定。"]}},
{"id":"dev.founded","on":"fact:devil","when":[{"noFact":{"type":"faith_founded","target":"$c"}}],"once":"subject","echo":true,"nocap":true,"effects":[{"op":"set","path":"c.ritual","v":"驱魔节"}],"emit":{"type":"devil_founded"},"unlock":[{"event":"dev.arms","delay":[40,200]},{"event":"dev.ritual_fades","delay":[350,700]}],"text":{"log":["「{civ}」的孩子们每年都过「{ritual}」，戴着照你的飞船做的面具。","「{civ}」的巫师在每个村口立起了驱魔柱，柱顶刻着一艘长着獠牙的飞船。从此每年都有「{ritual}」。","「{civ}」的历法里多了一个节日：「{ritual}」。那一夜所有人都熄灯，假装天上什么也没有。"]}},
{"id":"dev.arms","on":"pending","when":[{"fact":{"type":"devil_founded","target":"$c"}},{"stat":"c.tech","gte":20}],"p":0.01,"once":"subject","echo":true,"effects":[{"op":"add","path":"c.exp","v":0.1,"max":1}],"emit":{"type":"devil_arms"},"unlock":[{"event":"dev.revenge","delay":[60,300]}],"text":{"log":["对「天外恶魔」的恐惧塑造了「{civ}」：他们把大量资源投进了防空和军备。{ritual}上的面具，换成了防空炮的模型。","「{civ}」的第一座天文台不是为了看星星，而是为了在恶魔回来之前发现它。每年{ritual}，观测员都要宣誓。"]}},
{"id":"dev.revenge","on":"pending","when":[{"fact":{"type":"devil_arms","target":"$c"}},{"stat":"c.tech","gte":55},{"noFact":{"type":"devil_faded","target":"$c"}}],"p":0.01,"once":"subject","echo":true,"emit":{"type":"seek_revenge"},"text":{"log":["「{civ}」组建了一支舰队，誓言找到当年那个天外恶魔。出征前夜正逢{ritual}，舰员们戴上了那副面具。"]}},
{"id":"dev.ritual_fades","on":"pending","when":[{"fact":{"type":"devil_founded","target":"$c"}}],"p":0.01,"once":"subject","echo":true,"effects":[{"op":"imprint","v":0.35}],"emit":{"type":"devil_faded"},"forbid":["dev.revenge"],"text":{"log":["「{ritual}」已经变成了孩子们的节日：没人再相信恶魔，只剩下糖果和面具。","「{civ}」的学者重新考证了{ritual}的来历：那艘「恶魔飞船」也许只是一个迷路的旅人。"]}},
{"id":"rel.schism","on":"pending","when":[{"fact":{"type":"faith_founded","target":"$c","as":"r"}},{"stat":"c.tech","gte":8}],"p":0.0035,"mod":[{"if":{"stat":"c.stab","lt":0.45},"x":3},{"if":{"atWar":true},"x":2},{"if":{"fact":{"type":["faith_blessed","returned","pilgrim_met","prophet_resolved"],"target":"$c","known":"any","maxAge":300}},"x":0.4}],"once":"subject","echo":true,"nocap":true,"effects":[{"op":"add","path":"c.stab","v":-0.1,"min":0},{"op":"set","path":"c.sects","v":["[守望|归来|圣船]派","[离弃|觉醒|无神]派"]}],"emit":{"type":"faith_schism"},"unlock":[{"event":"rel.holy_war","delay":[10,120]},{"event":"rel.reformation","delay":[30,220]}],"text":{"log":["「{religion}」分裂成「{sect0}」和「{sect1}」：一派相信神终将归来，一派说神早已抛弃了他们。","为了{ship}究竟会不会回来，「{civ}」的祭司们吵了一个世纪，最后分成了「{sect0}」和「{sect1}」。","「{sect1}」的先知在广场上烧掉了神像：「神走了{v.age}年，它不会回来了。」「{sect0}」的信徒把灰烬一捧一捧收了回去。"]},"pre":[{"calc":"age"}]},
{"id":"rel.holy_war","on":"pending","when":[{"fact":{"type":"faith_schism","target":"$c"}},{"stat":"c.tech","gte":8}],"p":0.006,"mod":[{"if":{"temper":["好战"]},"x":2.5},{"if":{"stat":"c.exp","gt":0.6},"x":1.5},{"if":{"atWar":true},"x":2},{"if":{"stat":"c.stab","lt":0.3},"x":2},{"if":{"stat":"c.stab","gte":0.6},"x":0.5},{"if":{"fact":{"type":"faith_schism","target":"$c","data":{"why":"devil"}}},"x":2.5}],"once":"subject","echo":true,"nocap":true,"forbid":["rel.reformation"],"effects":[{"op":"add","path":"c.stab","v":-0.15,"min":0},{"op":"add","path":"c.exp","v":0.1,"max":1}],"emit":{"type":"faith_holywar"},"unlock":[{"event":"rel.martyr","delay":[5,60]}],"pre":[{"calc":"faith"}],"text":{"log":["「{sect0}」与「{sect1}」的宗教战争打了几十年。双方的旗帜上画着同一个图案：{v.sign}。","以{ship}之名的战争在「{civ}」燃起：「{sect0}」的军队高唱着关于你的圣歌，攻进了「{sect1}」的城市。"]},"card":{"cls":"warn","w":4,"title":"以你之名的战争","body":"你看到的是{year}的光：「{civ}」的「{sect0}」与「{sect1}」为你打起了宗教战争。两边的旗帜上都画着{v.sign}。"}},
{"id":"rel.martyr","on":"pending","when":[{"fact":{"type":"faith_holywar","target":"$c"}}],"p":0.02,"once":"subject","echo":true,"nocap":true,"emit":{"type":"faith_martyr"},"text":{"log":["「{sect1}」的领袖被处死前说：「神没有抛弃我们，是我们抛弃了神。」他的墓成了两派共同的圣地。","一位「{sect0}」的老祭司走进战场中央，要求双方停火，然后死在了乱箭下。战争在第二年结束了。"]},"card":{"cls":"warn","w":3,"title":"殉道者","body":"你看到的是{year}的光：「{civ}」的宗教战争里出了一位殉道者。人们说，他死前一直望着你离开的方向。"}},
{"id":"rel.reformation","on":"pending","when":[{"fact":{"type":"faith_schism","target":"$c"}},{"stat":"c.tech","gte":20}],"p":0.008,"mod":[{"if":{"temper":["学者","商人"]},"x":2},{"if":{"stat":"c.tech","gte":35},"x":2},{"if":{"stat":"c.stab","gte":0.5},"x":1.5},{"if":{"atWar":true},"x":0.5},{"if":{"fact":{"type":["prophet_resolved","faith_peace","faith_martyr"],"target":"$c","known":"any"}},"x":2}],"once":"subject","echo":true,"nocap":true,"forbid":["rel.holy_war"],"emit":{"type":"faith_reform"},"unlock":[{"event":"rel.call","delay":[0,60]},{"event":"rel.envoy","delay":[0,200],"window":1500}],"pre":[{"calc":"faith"}],"text":{"log":["{v.after}「{sect0}」赢了。改革派说：神不会再回来，要由信徒自己去找到神。他们开始[建造朝向你离去方向的巨型天线|绘制你离去的航线|收集关于{ship}的每一条记载]。","「{religion}」的宗教改革：经书里「等待」两个字被改成了「寻找」。{v.pastS}"]},"card":{"cls":"good","w":4,"title":"信徒要来找你","body":"你看到的是{year}的光：「{civ}」的宗教改革把「等待神」改成了「寻找神」。他们在找{ship}。"}},
{"id":"rel.pilgrimage","on":"pending","when":[{"fact":{"type":"faith_founded","target":"$c","as":"r"}},{"stat":"c.tech","gte":12}],"p":0.0025,"mod":[{"if":{"stat":"c.stab","gte":0.6},"x":2},{"if":{"fact":{"type":"faith_blessed","target":"$c","known":"any"}},"x":2.5},{"if":{"atWar":true},"x":0.4},{"if":{"stat":"c.stab","lt":0.45},"x":0.5}],"once":"subject","echo":true,"nocap":true,"emit":{"type":"faith_pilgrim"},"unlock":[{"event":"rel.envoy","delay":[80,300],"window":1500}],"pre":[{"calc":"faith"}],"text":{"log":["每年都有成千上万的朝圣者走到{cHome}上你当年降落的地方，在那里等神回来。","「{civ}」修了一条通往「神降之地」的朝圣大道。沿途的每块里程碑上都刻着同一个年份：{r.y}。","朝圣者从「{civ}」的每个角落出发，背着{v.relic}，走向你当年降落的地方。"]},"card":{"cls":"good","w":3,"title":"朝圣者在等你","body":"你看到的是{year}的光：「{civ}」的朝圣者聚集在你当年降落的地方，等神回来。"}},
{"id":"rel.false_prophet","on":"pending","when":[{"fact":{"type":"faith_founded","target":"$c"}},{"stat":"c.tech","gte":8}],"p":0.0022,"mod":[{"if":{"stat":"c.stab","lt":0.45},"x":2.5},{"if":{"fact":{"type":["faith_blessed","returned","pilgrim_met","prophet_resolved"],"target":"$c","known":"any","maxAge":300}},"x":0.25},{"if":{"all":[{"noFact":{"type":["faith_blessed","returned","pilgrim_met","prophet_resolved"],"target":"$c","known":"any","maxAge":600}},{"fact":{"type":"faith_founded","target":"$c","minAge":200}}]},"x":2}],"once":"subject","echo":true,"nocap":true,"emit":{"type":"faith_prophet"},"pre":[{"calc":"faith"}],"text":{"log":["一个自称「{shipBase}再临」的人出现在「{civ}」：他说自己就是当年的神，带着几万信徒[烧毁了旧神庙|要求国王让位|宣布末日将至]。","「{shipBase}再临」的信徒举着{v.sign}的画像游行：神走了{v.age}年，现在祂借一个凡人的身体回来了。"]},"card":{"cls":"warn","w":3,"title":"有人冒充你","body":"你看到的是{year}的光：「{civ}」出现了一个自称「{shipBase}再临」的先知。他用的是你的名字。"}},
{"id":"rel.call","on":"pending","when":[{"fact":{"type":"faith_reform","target":"$c"}},{"stat":"c.tech","gte":30}],"p":0.02,"once":"subject","echo":true,"nocap":true,"effects":[{"op":"expo","at":"c.home","kind":"radio","v":0.3}],"emit":{"type":"faith_call"},"pre":[{"calc":"faith"}],"text":{"log":["「{civ}」的射电望远镜一直对准你离开的方向，日夜向深空呼唤他们的神——这些呼唤也照亮了他们自己的坐标。天线阵的基座上刻着{v.sign}。"]},"card":{"cls":"warn","w":4,"title":"来自「{civ}」的呼唤","body":"你收到了一段射电信号（发出于{year}）：「{religion}」的改革派在呼唤他们的神。它也照亮了他们自己的坐标。你可以回应。"}},
{"id":"rel.call_answer","group":"faith_scene","on":"arrival","subject":"any","when":[{"fact":{"type":"faith_call","target":"$c","known":"ship","as":"k"}},{"noFact":{"type":["answered","faith_truth"],"target":"$c"}},{"here":false}],"once":"subject","cls":"warn","text":{"show":["你的接收机里一直有「{civ}」的呼唤（{k.y}发出，{v.dist}）。他们还在喊。"]},"pre":[{"calc":"dist"}],"options":[{"id":"rel.answer_silence","label":"回应「{civ}」：让他们安静","desc":"以神的名义命令他们停止呼喊、关掉天线。你的回信也会暴露你此刻的位置。"},{"id":"rel.answer_come","label":"回应「{civ}」：告诉他们你在哪","desc":"他们会更快造船来找你。双向的呼喊会让两边都更亮。"}]},
{"id":"rel.answer_silence","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"silence"},{"op":"protect","years":400,"floor":0.3,"quiet":0.2},{"op":"expo","at":"here","kind":"contact","v":0.25}],"emit":{"type":"answered","data":{"how":"silence"}},"echo":true,"imp":3,"log":["神回信了：「安静。」「{civ}」关掉了所有朝向深空的天线。"],"result":"你的回信要走 {v.distN} 年才能到。等它到了，「{civ}」的天线会一座座关掉——如果那时还来得及。"}]},
{"id":"rel.answer_come","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"expo","at":"here","kind":"bcast","v":0.8}],"emit":{"type":"answered","data":{"how":"come"}},"echo":true,"imp":3,"log":["神回信了，还告诉了他们自己在哪里。「{civ}」举国狂欢。"],"result":"你把此刻的位置发了回去（{v.distN} 光年外）。他们会来——这片森林里也可能有别的东西听见。"}]},
{"id":"rel.envoy","on":"pending","when":[{"any":[{"fact":{"type":"faith_reform","target":"$c"}},{"fact":{"type":"faith_pilgrim","target":"$c"}}]},{"stat":"c.tech","gte":55},{"noFact":{"type":"faith_truth","target":"$c"}}],"p":0.015,"mod":[{"if":{"fact":{"type":"answered","target":"$c"}},"x":3},{"if":{"fact":{"type":"faith_martyr","target":"$c"}},"x":1.5},{"if":{"fact":{"type":"faith_blessed","target":"$c","known":"any"}},"x":2}],"once":"subject","echo":true,"nocap":true,"emit":{"type":"faith_envoy"},"pre":[{"calc":"faith"}],"text":{"log":["「{civ}」造出第一艘星舰，命名为「{shipBase}使者号」，出发去寻找他们的神。舱里供着{v.relic}。","「{shipBase}使者号」离开了「{civ}」。{v.after}信徒们终于有了一艘能追上神的船。"]},"card":{"cls":"good","w":5,"title":"「{shipBase}使者号」出发了","body":"你看到的是{year}的光：「{civ}」的信徒造出星舰，带着{v.relic}，出发寻找{ship}。"}},
{"id":"rel.envoy_meet","group":"faith_scene","on":"arrival","subject":"near","range":160,"when":[{"fact":{"type":"faith_envoy","target":"$c","as":"e"}},{"reach":{"as":"e","speed":0.9}},{"noFact":{"type":["faith_met","faith_truth"],"target":"$c"}}],"once":"subject","cooldownGroup":"fleet","groupCooldown":150,"cls":"good","echo":true,"emit":{"type":"faith_met"},"effects":[{"op":"ship","supply":40}],"text":{"show":["一艘陌生的星舰在{here}等你。舰首写着「{shipBase}使者号」——「{civ}」的信徒找了你{v.age}年。舰上的祭司捧着{v.relic}跪在舷窗前。{v.pastS}货舱里装满了供品（补给 {v.supply}）。"]},"pre":[{"calc":"age"},{"calc":"faith"}],"options":[{"id":"rel.keep_faith","label":"继续扮演他们的神","desc":"祝福他们，然后离开。宗教会延续下去。"},{"id":"rel.truth","label":"说出真相：你只是一艘飞船","desc":"他们找了几百年的神，原来是一个旅人。"}]},
{"id":"rel.keep_faith","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"imprint","tag":"神","v":0.2},{"op":"protect","years":300,"floor":0.35,"quiet":0.3},{"op":"ship","tech":2}],"emit":{"type":"faith_blessed"},"echo":true,"imp":3,"log":["使者号带回了神的祝福。「{religion}」迎来了[黄金时代|第二次复兴]。"],"result":"你祝福了他们。使者号调头回家，舰上的人一路都在唱歌。他们留下了一些技术资料作为供品（飞船科技 {v.tech}）。"}]},
{"id":"rel.truth","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"imprint","tag":"旅人","v":-0.2},{"op":"add","path":"c.stab","v":-0.15,"min":0}],"emit":{"type":"faith_truth"},"echo":true,"imp":3,"forbid":["rel.holy_war","rel.reformation","rel.call","rel.envoy","rel.pilgrimage","rel.false_prophet"],"log":["使者号带回了一个消息：神只是一艘飞船。「{religion}」的时代结束了。"],"result":"祭司听完，很久没有说话。最后他说：「那我们就自己走吧。」使者号调头回家，带着一个会让整个文明重新思考的消息。"}]},
{"id":"rel.pilgrim_scene","group":"faith_scene","on":"arrival","subject":"here","when":[{"fact":{"type":"faith_pilgrim","target":"$c"}},{"noFact":{"type":["faith_truth","pilgrim_met"],"target":"$c"}}],"once":"subject","cls":"good","emit":{"type":"pilgrim_met"},"pre":[{"calc":"faith"}],"text":{"show":["「神降之地」上挤满了朝圣者。{v.after}他们还在等。他们看见了你的飞船，整片平原安静下来。"]},"options":[{"id":"rel.bless","label":"降落，祝福朝圣者","desc":"他们会更团结；神话会再延续几百年。"},{"id":"rel.truth2","label":"告诉他们真相","desc":"你只是一个旅人。"}]},
{"id":"rel.bless","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"add","path":"c.stab","v":0.15,"max":1},{"op":"protect","years":300,"floor":0.35,"quiet":0.3},{"op":"ship","supply":30}],"emit":{"type":"faith_blessed"},"echo":true,"imp":3,"log":["神回到了「{civ}」，祝福了信徒。"],"result":"你走下舷梯。几十万人同时跪下。他们把供品堆满了货舱（补给 {v.supply}）。"}]},
{"id":"rel.truth2","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"add","path":"c.stab","v":-0.15,"min":0},{"op":"imprint","tag":"旅人","v":-0.2}],"emit":{"type":"faith_truth"},"echo":true,"imp":3,"forbid":["rel.holy_war","rel.reformation","rel.call","rel.envoy","rel.false_prophet"],"log":["神在「{civ}」亲口说：我不是神。「{religion}」从此走向衰落。"],"result":"你说完，人群里有人哭，有人笑，有人转身离开。几百年的信仰在一个下午裂开了。"}]},
{"id":"rel.prophet_scene","group":"faith_scene","on":"arrival","subject":"here","when":[{"fact":{"type":"faith_prophet","target":"$c"}},{"noFact":{"type":["prophet_resolved","faith_truth"],"target":"$c"}}],"once":"subject","cls":"warn","pre":[{"calc":"faith"}],"text":{"show":["自称「{shipBase}再临」的先知的信徒们封锁了港口。他们举着{v.sign}的画像——真正的飞船来了，他们不知道该怎么办。"]},"options":[{"id":"rel.expose","label":"揭穿冒充者","desc":"神迹对决。他的教派会垮掉。"},{"id":"rel.endorse","label":"默认他","desc":"让他替你当神。"}]},
{"id":"rel.expose","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"add","path":"c.stab","v":0.1,"max":1},{"op":"imprint","tag":"神","v":0.2}],"emit":{"type":"prophet_resolved","data":{"how":"expose"}},"echo":true,"imp":3,"log":["真正的神回来了，假先知的教派一夜瓦解。"],"result":"你只是把飞船停在城市上空，打开了探照灯。第二天，假先知的信徒散了大半。"}]},
{"id":"rel.endorse","on":"choice","outcomes":[{"cls":"warn","effects":[{"op":"add","path":"c.exp","v":0.1,"max":1}],"emit":{"type":"prophet_resolved","data":{"how":"endorse"}},"echo":true,"imp":3,"log":["神默认了「{shipBase}再临」。新的教团接管了「{civ}」。"],"result":"你什么也没做就离开了。先知宣布：神认可了他。新的教团从此掌权。"}]},
{"id":"rel.return","group":"faith_scene","on":"arrival","subject":"here","when":[{"fact":{"type":"faith_founded","target":"$c","as":"r"}},{"since":{"as":"r","min":40}},{"noFact":{"type":["faith_truth"],"target":"$c"}},{"noFact":{"type":["returned","pilgrim_met"],"target":"$c","known":"any","maxAge":250}},{"noFact":{"type":"faith_schism","target":"$c","data":{"why":"devil"}}}],"cls":"good","emit":{"type":"returned"},"pre":[{"calc":"faith"},{"calc":"age"}],"text":{"show":["「{civ}」的每一座神庙都敲响了钟：「{religion}」的神，在离开{v.age}年之后回来了。{v.pastS}","{v.age}年来，「{civ}」一直供奉着{v.sign}。现在，那艘船真的出现在了天上。{v.pastS}"]},"options":[{"id":"rel.bless","label":"降落，祝福他们","desc":"他们会更团结；神话会再延续几百年。"},{"id":"rel.stop_war","label":"以神的名义制止圣战","desc":"你可以命令「{sect0}」和「{sect1}」放下武器。但在战争里，一个不偏不倚的神，可能被两边都当成敌人。","when":[{"fact":{"type":"faith_holywar","target":"$c"}},{"noFact":{"type":"faith_peace","target":"$c"}}]},{"id":"rel.truth2","label":"告诉他们真相","desc":"你只是一个旅人。"}]},
{"id":"rel.stop_war","on":"choice","outcomes":[{"p":0.55,"mod":[{"if":{"stat":"att","gte":0.5},"x":1.3}],"cls":"good","effects":[{"op":"add","path":"c.exp","v":-0.15,"min":0},{"op":"add","path":"c.stab","v":0.1,"max":1},{"op":"protect","years":200,"floor":0.35,"quiet":0.3}],"emit":{"type":"faith_peace"},"echo":true,"imp":3,"log":["神降临在「{sect0}」与「{sect1}」的两军之间，以你之名的战争结束了。"],"result":"你把飞船停在两军之间，什么也没说。第一个放下武器的是一个孩子。到了傍晚，整片战场都跪了下来。"},{"cls":"bad","emit":{"type":"devil","actor":"ship","tags":["player","harm"],"data":{"how":"wrath","what":"站在了「{sect0}」那一边","rel":"以恶魔的样子降临"}},"echo":true,"imp":3,"log":["神降临了，「{sect0}」放下了武器，「{sect1}」没有。"],"result":"「{sect0}」放下了武器，「{sect1}」没有。在他们眼里，一个命令他们投降的神，只能是恶魔。你离开时，他们正在砸碎神像。"}]},
{"id":"warn.exposure","on":"year","need":["god","ally","gift_l","warned","teach","trade","gift_s","learn","courier","relic","scholar","starmap"],"when":[{"calc":"help"},{"calc":"expo"},{"noflag":"c.silent"},{"noFact":{"type":"warn_expo","target":"$c","maxAge":400}}],"p":0.2,"emit":{"type":"warn_expo"},"cooldown":400,"card":{"cls":"warn","w":3,"title":"「{civ}」的坐标正在变亮","body":"你看到的是{year}的光：{v.expoWhy}，「{civ}」在深空里越来越显眼（暴露度 {v.expo}）。{h.y}你曾{h.act}。如果赶到那里，也许能劝他们静默。"}},
{"id":"warn.urge_silence","on":"arrival","subject":"here","when":[{"fact":{"type":"warn_expo","target":"$c","as":"w"}},{"noflag":"c.silent"},{"noFact":{"type":"urged","target":"$c","maxAge":300}}],"cls":"warn","text":{"show":["「{civ}」的坐标还在深空里发亮。你知道外面有什么在看。","在你的接收机上，「{civ}」的电磁辐射一年比一年亮。整片星空都听得见。","「{civ}」还没学会安静。你见过安静不下来的文明是什么下场。"]},"options":[{"id":"warn.silence","label":"劝他们静默","desc":"把你见过的打击讲给他们听。"}]},
{"id":"warn.silence","on":"choice","outcomes":[{"p":0.65,"mod":[{"if":{"stat":"att","gte":0.3},"x":1.4},{"if":{"temper":["好战"]},"x":0.5}],"cls":"good","effects":[{"op":"silence"}],"emit":{"type":"urged"},"echo":true,"imp":3,"log":["听了{ship}的警告，「{civ}」关掉了所有对外广播，藏了起来。"],"result":"你把见过的二维画和熄灭的恒星讲给他们听。第二天，「{civ}」开始关闭对外广播。"},{"cls":"warn","emit":{"type":"urged"},"effects":[{"op":"imprint","v":-0.05}],"result":"他们礼貌地听完，然后告诉你：「我们不怕。」"}]},
{"id":"warn.launch_seen","on":"fact:strike_launch","subject":"target","when":[{"calc":"help"}],"once":false,"card":{"at":"fact","cls":"bad","w":5,"expire":{"y":"f.data.arrive","sys":"f.data.tsys"},"title":"你看见了一次发射","body":"你看到的是{f.y}的光：「{f.actor}」向「{civ}」射出了光粒，预计{f.d.arriveY}抵达。{h.y}你曾{h.act}。"}},
{"id":"warn.evacuate","on":"arrival","subject":"any","group":"warn_evac","cooldownGroup":"evac","groupCooldown":150,"effects":[{"op":"hunt"}],"when":[{"calc":"incoming"},{"noFact":{"type":"warned","target":"$c","actor":"ship","known":"any","maxAge":200}}],"cls":"bad","text":{"show":["{v.seen}：「{v.shooter}」向「{civ}」（{v.target}）射出了光粒，它会在{v.arriveY}落地。{v.race}"]},"options":[{"id":"warn.evac_go","label":"{v.warnLabel}","desc":"{v.warnDesc}"}]},
{"id":"warn.evac_go","on":"choice","outcomes":[{"cls":"good","effects":[{"op":"expo","at":"here","kind":"contact","v":0.15}],"emit":{"type":"warned","at":"here","actor":"ship","tags":["player","help"],"data":{"vsHome":"{v.vsHome}","shooter":"{v.shooter}","rel":"在光粒落下前警告他们","lead":"{v.leadN}"}},"echo":true,"imp":3,"unlock":[{"event":"warn.evac_arrive","delayV":"warnD","window":60}],"log":["{ship}向「{civ}」发出了光粒预警：「{v.shooter}」的光粒正在路上。"],"result":"{v.warnResult}"}]},
{"id":"warn.evac_arrive","on":"pending","when":[{"fact":{"type":"warned","target":"$c","actor":"ship","known":"any","as":"w"}}],"once":"subject","echo":true,"nocap":true,"imp":3,"effects":[{"op":"evacuate"},{"op":"imprint","tag":"恩人","v":0.5}],"emit":{"type":"evacuated","target":"spawned","data":{"from":"{civ}"}},"text":{"log":["{ship}的警告比光粒早到了{w.d.lead}。「{civ}」[在最后的日子里|用尽了每一艘船]把一部分人送上了天：撤离舰队逃向了最近的安全星系。","警告到了。「{civ}」没有争论太久——他们见过黑暗森林。在光粒落下之前，一支撤离舰队离开了这里。"]}},
{"id":"echo.evacuated.memory","on":"year","need":["evacuated"],"when":[{"fact":{"type":"evacuated","target":"$c","known":"any","inherit":false,"as":"x"}},{"since":{"as":"x","min":20}}],"p":0.02,"once":"subject","echo":true,"text":{"log":["「{civ}」的每一艘船上都挂着一块铭牌：纪念{x.y}那段比光粒早到了几个月的警告，和发出警告的{ship}。","「{civ}」的孩子们会背一句话：「光粒比光慢一点点——那一点点，就是我们。」"]}},
{"id":"home.dossier","on":"arrival","subject":"here","cooldown":150,"when":[{"earth":"$c"},{"fact":{"type":["sided","mediated","mediate_failed","warned","retaliated","reparation","apology","questioned","refugee_spurned","faith_blessed","faith_truth","god","devil","gift_l","ally","starmap","hostile"],"actor":"ship"}},{"calc":"dossier"}],"cls":"warn","text":{"show":["母星的档案馆里，关于{ship}的卷宗又厚了一些：{v.dossier}","你还没走下舷梯，就有人递来一份卷宗——母星这些年按光速陆续收到的、关于你的消息：{v.dossier}"]}},
{"id":"card.helped_extinct","on":"fact:extinct","dead":true,"when":[{"calc":"help"},{"stat":"v.helpRank","gte":5},{"any":[{"stat":"v.helpRank","gte":9},{"since":{"as":"h","max":1500}}]}],"once":"subject","card":{"cls":"bad","w":5,"title":"「{civ}」灭绝了","body":"{h.y}你曾{h.act}。{f.y}，「{civ}」消失了：{f.d.cause}。","short":"「{civ}」（{h.y}你曾{h.act}）{f.y}{f.d.cause}"}},
{"id":"card.home_avenged","on":"report","when":[{"homeSeen":"flat"},{"calc":"home"},{"fact":{"type":"refugee_bcast","known":"any","as":"rb"}},{"flag":"v.avenged"}],"once":"world","forbid":[{"event":"card.home_flat","scope":"world"}],"card":{"now":true,"at":"here","cls":"bad","w":10,"major":true,"key":"home","title":"太阳系被压平了","body":"你看到的是{v.homeYear}的光：太阳系已经是一幅二维的画。{v.flatYear}{rb.y}，被母星清理过的文明的遗民「{rb.actor}」把太阳的坐标广播给了全宇宙——这一击，是他们等了很久的复仇。"}},
{"id":"card.home_flat","on":"report","when":[{"homeSeen":"flat"},{"calc":"home"}],"once":"world","card":{"now":true,"at":"here","cls":"bad","w":10,"major":true,"key":"home","title":"太阳系被压平了","body":"你看到的是{v.homeYear}的光：太阳系已经是一幅二维的画。{v.flatYear}你再也没有家可以回了。"}},
{"id":"card.home_lost","on":"report","when":[{"homeSeen":"lost"},{"calc":"home"}],"once":"world","card":{"now":true,"at":"here","cls":"bad","w":8,"major":true,"title":"母星易主","body":"你看到的是{v.homeYear}的光：太阳系的主人已经是「{v.homeOwner}」。地球文明失去了自己的家园。"}},
{"id":"card.home_dead","on":"report","when":[{"homeSeen":"dead"},{"calc":"home"}],"once":"world","card":{"now":true,"at":"here","cls":"bad","w":9,"major":true,"title":"地球文明消失了","body":"你看到的是{v.homeYear}的光：太阳系里已经没有文明。{v.lastEvent}"}},
{"id":"card.zero_broadcast","on":"report","when":[{"flag":"u.cosmicFlags.8"},{"calc":"dim"}],"once":"world","card":{"now":true,"at":"here","cls":"warn","w":9,"major":true,"key":"zero","title":"归零者的广播","body":"所有接收机在同一刻响了起来，信号来自宇宙的边缘：「归零者」发起「回归运动」，请求所有文明停止降维、停止降低光速，让宇宙回到十维的田园时代。此刻宇宙的维度是 {v.dim}，已经发生过 {v.dimN} 次降维打击。{v.dimYou}"}},
{"id":"card.lowdim","on":"report","when":[{"flag":"u.cosmicFlags.15"},{"calc":"dim"}],"once":"world","card":{"now":true,"at":"here","cls":"bad","w":8,"major":true,"key":"lowdim","title":"低维化末期","body":"物理常数的漂移已经无法忽略：宇宙的维度跌到了 {v.dim}。越来越多的空间正在跌落，整个宇宙正在慢慢变成一幅画。{v.dimYou}"}},
{"id":"destiny.domain","on":"arrival","subject":"here","when":[{"stat":"ship.destiny.id","eq":"domain"},{"stat":"ship.destiny.state","eq":"active"},{"stat":"c.tech","gte":100},{"stat":"att","gte":0.2},{"stat":"ship.songs","gte":1},{"noFact":{"type":"seal_refused","target":"$c","known":"any","maxAge":300}}],"cls":"warn","text":{"show":["「{civ}」的科技已经够得着光速本身了。他们的物理学家在研究一种把自己关起来的办法：把这片空间的光速降到每秒 16.7 公里。","「{civ}」的港口里流传着一份计划书：黑域。代价是与宇宙永久隔绝，回报是任何打击都再也进不来。"]},"options":[{"id":"destiny.seal","label":"劝他们建造黑域，并让你留在里面","desc":"你见过二向箔。如果他们答应，这就是你的终点：永远安全，永远出不去。"}]},
{"id":"destiny.seal","on":"choice","outcomes":[{"p":0.4,"mod":[{"if":{"stat":"att","gte":0.5},"x":1.5},{"if":{"temper":["学者","官僚"]},"x":1.3},{"if":{"temper":["好战"]},"x":0.5}],"cls":"good","effects":[{"op":"seal"}],"emit":{"type":"sealed_in"},"imp":3,"log":["「{civ}」听了{ship}讲述的二维画，决定建造黑域。那艘飞船留在了里面。"],"result":"你讲了二维的画、熄灭的恒星和歌者随手哼出的那首歌。他们讨论了三年，最后同意了。"},{"cls":"dim","effects":[{"op":"imprint","v":-0.05}],"emit":{"type":"seal_refused"},"result":"他们听完，很客气地拒绝了：「把自己关起来，也是一种死法。」"}]}
]});
