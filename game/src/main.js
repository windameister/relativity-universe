/* main —— 游戏流程（owner: ux）。
 * title → 新宇宙 → galaxy 地图 ⇄ 选星/规划 → 启航：SIM.travel → warp → galaxy replay → [foil home] → 抵达仪式 → 报告 → 接触 → 回地图
 * 冬眠：SIM.hibernate → 霜白过渡 → galaxy replay → [foil home] → 仪式 → 报告。死亡 → 墓志铭。
 * 每一步记为原型的 plan 字符串（目的地:驱动:选项,h:年数:选项），支持 ?seed=&plan= 复现。
 * 调试/截图参数：&ui=map|report|ceremony|epitaph|share（跳过标题和过场）、&sel=星系id、&mode=w0.99999、&god=1
 */
(function () {
  var RU = window.RU, E = RU.engine, P = E.params, U = RU.util, UI = RU.ui;
  E.start();
  if (P.get('scene')) { E.go(P.get('scene'), { demo: true, variant: P.get('variant') }); return; }

  var G = RU.state.game = { u: null, steps: [], foilShown: false, busy: false, echoes: 0, civsMet: {}, homeFlat0: false };
  function cue(n) { try { RU.audio.cue(n); } catch (e) { } }
  function mood(n) { try { RU.audio.mood(n); } catch (e) { } }
  function gal() { return E.get('galaxy'); }
  function gcall(fn) { var g = gal(), a = Array.prototype.slice.call(arguments, 1); if (g && typeof g[fn] === 'function') { try { return g[fn].apply(g, a); } catch (err) { console.error(err); } } }
  function randomSeed() { var w = ['萤', '溯', '烛', '渊', '弦', '汐', '岚', '霁', '墨', '澜']; return w[Math.floor(Math.random() * w.length)] + Math.random().toString(36).slice(2, 6); }

  // ---------- plan 记录 ----------
  function pushStep(a, m) { G.steps.push({ a: String(a), m: String(m), o: null }); }
  function planStr() {
    return G.steps.map(function (s) { return s.a + ':' + s.m + (s.o ? ':' + encodeURIComponent(s.o) : ''); }).join(',');
  }
  function baseUrl() { return location.href.split('?')[0].split('#')[0]; }
  function planUrl() { var p = planStr(); return baseUrl() + '?seed=' + encodeURIComponent(G.u.seed) + (p ? '&plan=' + p : ''); }
  RU.state.planUrl = planUrl; RU.state.planStr = planStr;

  // ---------- 场景调用（占位场景也能跑通） ----------
  function scene(name, opts, kind) {
    var t0 = performance.now();
    return E.go(name, opts).then(function (v) {
      if (v === undefined && performance.now() - t0 < 60) return UI.cine(kind || name, opts);   // 占位：enter 没有返回 Promise
      return v;
    }, function (err) { console.error(err); return UI.cine(kind || name, opts); });
  }
  function enterMap(focusId, quiet) {
    UI.setMode('map');
    var u = G.u;
    var p = E.go('galaxy', { u: u, mode: 'map' });
    gcall('setGodView', UI.state.god);
    gcall('setSelected', UI.state.sel);
    gcall('setRoute', UI.state.sel != null ? u.ship.at : null, UI.state.sel, UI.state.mode);
    if (focusId != null) gcall('focus', focusId);
    if (!quiet) { mood('map'); UI.render(); }
    return p;
  }

  // ---------- 新宇宙 ----------
  function newGame(seed) {
    var u = G.u = RU.state.u = SIM.createUniverse(seed || randomSeed());
    SIM.remember(u, 0);
    G.steps = []; G.foilShown = false; G.echoes = 0; G.civsMet = {};
    UI.state.sel = null; UI.state.hib = null; G.ending = null;
    return u;
  }
  function startFresh(seed) {
    newGame(seed);
    enterMap(0);
    try { history.replaceState(null, '', baseUrl() + '?seed=' + encodeURIComponent(G.u.seed)); } catch (e) { }
    UI.toast('宇宙「' + G.u.seed + '」 · ' + G.u.ship.name + '停泊在太阳。选一颗星，出发。');
  }

  // ---------- 启航 / 冬眠 ----------
  function launch(to, mode) {
    var u = G.u; if (G.busy || u.ship.dead || to == null || to === u.ship.at) return;
    G.busy = true;
    if (SIM.isWarp(mode) && u.ship.supply < SIM.WARP_SUPPLY) mode = '0.03';
    var from = u.ship.at, home0 = !!u.systems[0].flat;
    var res = SIM.travel(u, to, mode);
    pushStep(to, mode);
    UI.state.sel = null; gcall('setRoute', null); gcall('setSelected', null);
    UI.setMode('cine'); cue('launch');
    mood(SIM.isWarp(mode) ? 'warp' : 'cryo');
    scene('warp', { u: u, from: from, to: to, mode: mode, trip: res.trip, res: res }, 'warp')
      .then(function () { return replay(res); })
      .then(function () { return maybeFoil(home0); })
      .then(function () { return afterTrip(res); })
      .catch(fail);
  }
  function hibernate(years) {
    var u = G.u; if (G.busy || u.ship.dead) return;
    G.busy = true;
    var home0 = !!u.systems[0].flat;
    var res = SIM.hibernate(u, years);
    pushStep('h', years);
    UI.state.sel = null; gcall('setRoute', null);
    UI.setMode('cine'); cue('cryo-in'); mood('cryo');
    UI.cryo(true)
      .then(function () { return replay(res); })
      .then(function () { if (!res.report.death) { cue('cryo-out'); return UI.cryo(false); } })
      .then(function () { return maybeFoil(home0); })
      .then(function () { return afterTrip(res); })
      .catch(fail);
  }
  function replay(res) {
    var t = res.trip; if (!(t.arrive - t.depart > 0.5)) return Promise.resolve();
    mood('replay');
    return scene('galaxy', { u: G.u, mode: 'replay', t0: t.depart, t1: t.arrive, res: res }, 'replay');
  }
  function maybeFoil(home0) {
    var u = G.u, s0 = u.systems[0];
    if (home0 || !s0.flat || G.foilShown) return Promise.resolve();
    G.foilShown = true;
    UI.setMode('cine'); mood('foil');
    return scene('foil', { variant: 'home', u: u, year: s0.flatYear }, 'foil').then(function () {
      if (RU.share && RU.share.offer) RU.share.offer('home', { year: s0.flatYear });
    });
  }
  function fail(err) { console.error(err); var el = document.getElementById('errors'); if (el) el.textContent += 'flow: ' + (err && err.message) + '\n'; G.busy = false; enterMap(); }

  function noteReport(res) {
    var r = res.report;
    G.echoes += (r.caused || []).length;
    if (r.now && r.now.civId != null) G.civsMet[r.now.civId] = 1;
  }

  function afterTrip(res, opts) {
    opts = opts || {};
    var u = G.u, r = res.report;
    noteReport(res);
    if (r.ending) G.ending = r.ending;
    enterMap(u.ship.at, true);
    UI.setMode('cine');   // 仪式期间藏起 HUD；之后 HUD 的数字从旧值滚到新值
    var p;
    if (r.death && !r.now) p = (opts.noCere ? Promise.resolve() : UI.deathCeremony(res)).then(function () { UI.render(); return epitaph(takeEnding()); });
    else p = (opts.noCere ? Promise.resolve() : UI.ceremony(res)).then(function () {
      UI.setMode('modal'); UI.render();
      mood('report');
      return UI.report(res);
    }).then(function () {
      var en = takeEnding();
      if (en || u.ship.dead) return epitaph(en);
      G.busy = false; enterMap(u.ship.at);
    });
    return p;
  }

  // ---------- 墓志铭 ----------
  function epiStats() {
    var u = G.u, trips = u.ship.trips, route = [u.systems[0].name], visited = {};
    trips.forEach(function (t) { if (t.from !== t.to) { route.push(u.systems[t.to].name); visited[t.to] = 1; } });
    var maxG = trips.reduce(function (m, t) { return Math.max(m, t.gamma || 1); }, 1);
    var lastTrip = trips.length ? trips[trips.length - 1] : null;
    var cosmic = (u.ship.dead && lastTrip && lastTrip.died) ? lastTrip.arrive : u.time;
    var s0 = u.systems[0];
    var homeLine = s0.flat ? '太阳系在纪元 ' + Math.floor(s0.flatYear) + ' 年被压成了一幅画。他们出发的地方，已经不在三维宇宙里。' : null;
    return {
      ship: u.ship.name, shipYears: u.ship.shipYears, cosmic: cosmic, age: u.ship.crewAge0 + u.ship.bio,
      foils: u.flats.length, dimStrikes: u.dimStrikes, visited: Object.keys(visited).length, civs: Object.keys(G.civsMet).length,
      echoes: G.echoes, maxGamma: maxG, route: route, trips: trips.length,
      cause: u.ship.dead ? u.ship.dead.cause : '', homeLine: homeLine
    };
  }
  function takeEnding() { var e = G.ending; G.ending = null; return e || null; }
  function epitaph(ending) {
    G.busy = true;
    UI.setMode('cine');
    var S = epiStats(); S.ending = ending || null; RU.state.epitaph = S;
    if (ending) S.cause = ending.text || S.cause;
    return UI.epitaph(S).then(function (a) {
      G.busy = false;
      if (a === 'continue' && !G.u.ship.dead) { enterMap(G.u.ship.at); return; }
      if (a === 'restart') startFresh(G.u.seed);
      else startFresh('');
    });
  }

  // ---------- 分享 ----------
  function share(kind, data) {
    if (!RU.share || !RU.share.open) { UI.copyText(planUrl()); UI.toast('链接已复制'); return; }
    RU.share.open(kind, Object.assign({ u: G.u, url: planUrl(), plan: planStr() }, data || {}));
  }

  // ---------- 绑定界面 ----------
  UI.init({
    u: function () { return G.u; },
    launch: launch,
    hibernate: hibernate,
    interact: function (sysId, opt) {
      var res = SIM.interact(G.u, sysId, opt);
      if (res && res.ending) G.ending = res.ending;
      var last = G.steps[G.steps.length - 1];
      if (last && opt !== '离开') last.o = opt;
      UI.render(); gcall('refresh');
      return res;
    },
    afterInteract: function () { UI.render(); },
    destiny: function (id) {
      if (G.busy || !SIM.chooseDestiny) return;
      SIM.chooseDestiny(G.u, id); pushStep('d', id);
      var d = SIM.destinyOf(G.u); cue('select'); UI.toast('命运：' + (d ? d.title : id)); UI.render();
    },
    newGame: function (seed) { if (G.busy) return; startFresh(seed); },
    restart: function () { if (G.busy) return; startFresh(G.u.seed); },
    share: share,
    planUrl: planUrl,
    godView: function (b) { gcall('setGodView', b); },
    selected: function (id, mode, fromList) {
      var u = G.u;
      gcall('setSelected', id);
      gcall('setRoute', id != null && id !== u.ship.at ? u.ship.at : null, id, mode);
      if (fromList && id != null) gcall('focus', id);
    },
    route: function (id, mode) { var u = G.u; if (id != null && id !== u.ship.at) gcall('setRoute', u.ship.at, id, mode); }
  });
  RU.on('select', function (id) {
    if (G.busy || !G.u || UI.state.mode0 !== 'map') return;
    UI.select(id);
  });

  // ---------- 启动 ----------
  var seedP = P.get('seed'), planP = P.get('plan'), uiP = P.get('ui');
  if (uiP) document.body.classList.add('ru-still');   // 截图：关掉过渡动画，保证一帧就是最终状态
  if (P.get('mode')) UI.state.mode = P.get('mode');
  if (P.get('god')) UI.state.god = true;

  function runPlan(seed, plan) {
    var u = newGame(seed), last = null, steps = plan.split(',').filter(Boolean), home0 = false;
    steps.forEach(function (st, k) {
      var p3 = st.split(':');
      if (k === steps.length - 1) home0 = !!u.systems[0].flat;
      if (p3[0] === 'd') { if (SIM.chooseDestiny) { SIM.chooseDestiny(u, p3[1]); pushStep('d', p3[1]); } return; }
      if (p3[0] === 'h') { last = SIM.hibernate(u, +p3[1]); pushStep('h', +p3[1]); }
      else { var m = p3[1] || 'w0.9999'; last = SIM.travel(u, +p3[0], m); pushStep(+p3[0], m); }
      if (k < steps.length - 1) noteReport(last);
      if (k < steps.length - 1 && p3[2]) {
        var opt = decodeURIComponent(p3[2]);
        var ir = SIM.interact(u, last.report.sysId, opt); if (ir && ir.ending) G.ending = ir.ending;
        G.steps[G.steps.length - 1].o = opt;
      }
    });
    if (u.systems[0].flat && home0) G.foilShown = true;
    return { last: last, home0: home0 };
  }

  if (seedP && planP) {
    var rp = runPlan(seedP, planP), u = G.u, last = rp.last;
    if (!last) { enterMap(0); }
    else if (uiP === 'map') { enterMap(u.ship.at); }
    else if (uiP === 'epitaph') { enterMap(u.ship.at); epitaph(last.report.ending || takeEnding()); }
    else if (uiP === 'report' || uiP === 'share') { G.busy = true; noteReport(last); enterMap(u.ship.at); UI.setMode('modal'); if (last.report.ending) G.ending = last.report.ending; UI.report(last).then(function () { var en = takeEnding(); if (en || u.ship.dead) return epitaph(en); G.busy = false; enterMap(u.ship.at); }); if (uiP === 'share') setTimeout(function () { share('report', { res: last }); }, 300); }
    else if (uiP === 'ceremony') { G.busy = true; afterTrip(last); }
    else {
      // 分享链接的落地：先给一张「有人寄给你一段旅程」，点击后播放那一刻
      E.go('galaxy', { u: u, mode: 'map' }); gcall('focus', u.ship.at); UI.setMode('title');
      var t = last.trip, label = u.ship.name + ' · ' + (t.from === t.to ? '在' + u.systems[t.to].name + '冬眠' : '抵达' + u.systems[t.to].name) + ' · ' + UI.fmt.yr(t.arrive);
      UI.titleFallback({ shared: label, seed: seedP }).then(function () {
        G.busy = true;
        var p = Promise.resolve();
        if (!rp.home0 && u.systems[0].flat && !G.foilShown) p = maybeFoil(false);
        return p.then(function () { return afterTrip(last); });
      }).catch(fail);
    }
    if (P.get('sel')) setTimeout(function () { UI.select(+P.get('sel')); }, 50);
  } else if (uiP === 'map' || (seedP && P.get('sel'))) {
    startFresh(seedP || '');
    if (P.get('sel')) UI.select(+P.get('sel'));
  } else {
    UI.setMode('title');
    var t0 = performance.now();
    E.go('title', {}).then(function (r) {
      if (r === undefined && performance.now() - t0 < 60) return UI.titleFallback({ seed: seedP });
      return r || {};
    }).then(function (r) {
      if (r && r.action === 'demo-foil') {
        UI.setMode('cine');
        return scene('foil', { variant: 'demo' }, 'foil').then(function () { startFresh(seedP || (r && r.seed) || ''); });
      }
      startFresh((r && r.seed) || seedP || '');
    }).catch(fail);
  }
})();
