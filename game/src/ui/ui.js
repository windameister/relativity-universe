/* RU.ui —— 全部 HTML 界面（owner: ux）。
 * 由 main.js 驱动：UI.init(handlers) 之后，main 在合适的时候调用
 *   UI.setMode('title'|'map'|'cine'|'modal')、UI.render()、UI.select(id)
 *   UI.ceremony(res) → Promise、UI.report(res) → Promise、UI.epitaph(stats) → Promise(action)
 *   UI.cine(kind, opts) → Promise（场景还没做完时的占位演出）、UI.titleFallback() → Promise({seed})
 *   UI.toast(text)
 * handlers：{ u(), launch(sel, mode), hibernate(years), interact(sysId, opt) → res, newGame(seed), restart(),
 *             share(kind, data), planUrl(), godView(bool), selected(id, mode), route(id, mode) }
 */
(function () {
  var RU = window.RU, U = RU.util;
  var UI = RU.ui = RU.ui || {};
  var esc = U.esc;
  function cue(n) { try { RU.audio.cue(n); } catch (e) { } }
  function mood(n) { try { RU.audio.mood(n); } catch (e) { } }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var H = {}, st = { sel: null, mode: 'w0.9999', god: false, hib: null, mode0: 'map', sheet: false, list: false };
  var hud, panel, listEl, menuEl;
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  UI.state = st;

  // ---------- 格式化 ----------
  var fy = U.fmtYears;
  function yParts(x) { var s = fy(x), i = s.lastIndexOf(' '); return { v: s.slice(0, i), u: s.slice(i + 1) }; }
  function fint(n) { return Math.floor(n + 1e-6).toLocaleString('en-US'); }
  function fext(x, minVal) {
    var v = minVal != null ? Math.max(x, minVal) : x;
    if (v < 0.1) return fy(v);
    if (v < 1000) return (Math.ceil(v * 10 - 1e-9) / 10).toFixed(1) + ' 年';
    return Math.ceil(v - 1e-9).toLocaleString('en-US') + ' 年';
  }
  function extParts(x, minVal) { var s = fext(x, minVal), i = s.lastIndexOf(' '); return { v: s.slice(0, i), u: s.slice(i + 1) }; }
  function fage(x) { return x < 0.1 ? Math.max(1, Math.round(x * 365)) + ' 天' : x.toFixed(1) + ' 岁'; }
  function ageParts(x) { var s = fage(x), i = s.lastIndexOf(' '); return { v: s.slice(0, i), u: s.slice(i + 1) }; }
  function fgam(g) { return g < 1.01 ? g.toFixed(4) : g < 100 ? g.toFixed(2) : fint(g); }
  function yr(y) { return '纪元 ' + fint(y) + ' 年'; }
  function sysTypeText(s) { return s.type + (s.type.length === 1 ? ' 型恒星' : ''); }
  function starCol(s) {
    if (s.type === '黑洞') return '#0b0b0e';
    var c = U.blackbodyColor(U.starTemp(s)); return 'rgb(' + c.map(function (v) { return Math.round(60 + 195 * Math.pow(v, 0.6)); }).join(',') + ')';
  }
  function driveName(m) { return SIM.isWarp(m) ? '曲率 ' + m.slice(1) + 'c' : '常规 ' + m + 'c'; }
  UI.fmt = { years: fy, yParts: yParts, int: fint, ext: fext, extParts: extParts, age: fage, ageParts: ageParts, gamma: fgam, yr: yr, starCol: starCol };

  // 数字滚动：el 上记住当前值，按缓动滚到目标
  function rollTo(el, to, fmt, ms) {
    if (!el) return;
    var from = el._v == null ? to : el._v; el._v = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (from === to || RU.engine.still) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), d = ms || 1400;
    (function step(now) {
      var k = U.clamp((now - t0) / d, 0, 1), e = U.ease.expoOut(k);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }
  // 从 0 滚动（仪式用），返回 Promise
  function rollFrom0(el, to, fmt, ms, ease) {
    return new Promise(function (res) {
      if (RU.engine.still || document.body.classList.contains('ru-still')) { el.innerHTML = fmt(to); return res(); }
      var t0 = performance.now(), d = ms || 1600, E = ease || U.ease.expoOut;
      (function step(now) {
        var k = U.clamp((now - t0) / d, 0, 1);
        var out = fmt(to * E(k)); if (out.indexOf('<') >= 0) el.innerHTML = out; else el.textContent = out;
        if (k < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
  }

  // ---------- 图标 ----------
  var ICON = {
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    list: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="18" r="1.2"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
    snd: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
  };
  UI.ICON = ICON;

  // ---------- 初始化 ----------
  UI.init = function (handlers) {
    H = handlers;
    document.body.classList.add('ru-mode-title');
    if (isTouch) document.body.classList.add('ru-touch');
    hud = U.el('div', 'ru-hud');
    hud.innerHTML =
      '<div class="hud-ship"><div class="hud-name" data-k="name"></div><div class="hud-loc" data-k="loc"></div></div>' +
      '<div class="hud-stats">' +
      stat('year', '宇宙纪元', '年', 'warm') + stat('ship', '船上固有时', '', 'cool') + stat('age', '舰员', '岁') +
      stat('supply', '补给', '', '', '<span class="bar"><i></i></span>') + stat('tech', '飞船科技', '') + stat('dim', '宇宙维度', '') +
      '</div>' +
      '<div class="hud-tools">' +
      '<button class="ico" data-act="god" title="上帝视角：显示真实现状、歌者与在途武器（默认按光延迟）">' + ICON.eye + '</button>' +
      '<button class="ico" data-act="list" title="星表">' + ICON.list + '</button>' +
      '<button class="ico" data-act="mute" title="声音">' + ICON.snd + '</button>' +
      '<button class="ico" data-act="menu" title="菜单">' + ICON.menu + '</button>' +
      '</div>';
    hud.addEventListener('click', onAct);
    panel = U.el('div', 'ru-panel');
    panel.addEventListener('click', onAct);
    listEl = U.el('div', 'ru-list');
    listEl.addEventListener('click', onAct);
    menuEl = U.el('div', 'ru-menu');
    menuEl.addEventListener('click', onAct);
    U.el('div', 'ru-toasts passthrough');
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (st.list || qs('.ru-menu.open')) { closeDrawers(); return; }
        if (document.body.classList.contains('ru-mode-map') && st.sel != null) UI.select(null);
      }
    });
    // 细小 UI 声响
    document.addEventListener('pointerover', function (e) {
      var b = e.target.closest && e.target.closest('button, .ls-row');
      if (b && b !== UI._lastHover && !b.disabled) { UI._lastHover = b; cue('ui-hover'); }
    });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b && !b.disabled && !b.classList.contains('silent')) cue('ui-click'); }, true);
    updateMuteIcon();
  };
  function stat(k, label, unit, cls, extra) {
    return '<div class="st ' + (cls || '') + '" data-s="' + k + '"><i>' + label + '</i><div class="v"><b class="num" data-k="' + k + '"></b><u data-u="' + k + '">' + unit + '</u></div>' + (extra || '') + '</div>';
  }

  UI.setMode = function (m) {
    st.mode0 = m;
    ['title', 'map', 'cine', 'modal'].forEach(function (x) { document.body.classList.toggle('ru-mode-' + x, x === m); });
    if (m !== 'map') closeDrawers();
  };

  // ---------- 渲染 ----------
  UI.render = function () {
    var u = H.u(); if (!u) return;
    renderHUD(u); renderPanel(u); if (st.list) renderList(u);
  };

  function renderHUD(u) {
    var age = u.ship.crewAge0 + u.ship.bio, sp = u.ship.supply, dm = SIM.dimOf(u);
    qs('[data-k=name]', hud).textContent = u.ship.name;
    var dsn = SIM.destinyOf ? SIM.destinyOf(u) : null;
    qs('[data-k=loc]', hud).innerHTML = (u.ship.dead ? (u.ship.dead.sealed ? '封入黑域 · ' : '旅程终结 · ') : '停泊于 ') + esc(u.systems[u.ship.at].name) + (dsn ? '<span class="hud-dest ' + dsn.state + '">命运 · ' + esc(dsn.title) + '</span>' : '');
    var lastT = u.ship.trips.length ? u.ship.trips[u.ship.trips.length - 1] : null;
    var dispTime = (u.ship.dead && lastT && lastT.died) ? lastT.arrive : u.time;
    rollTo(qs('[data-k=year]', hud), dispTime, function (v) { return fint(v); });
    var se = qs('[data-k=ship]', hud), su = qs('[data-u=ship]', hud);
    rollTo(se, u.ship.shipYears, function (v) { if (v < 1e-6) { su.textContent = '年'; return '0'; } var p = yParts(v); su.textContent = p.u; return p.v; });
    var ae = qs('[data-k=age]', hud); rollTo(ae, age, function (v) { return v.toFixed(1); });
    qs('[data-s=age]', hud).className = 'st ' + (age > 90 ? 'bad' : age > 70 ? 'warn' : '');
    rollTo(qs('[data-k=supply]', hud), sp, function (v) { return v.toFixed(0); });
    var sup = qs('[data-s=supply]', hud); sup.className = 'st ' + (sp < SIM.WARP_SUPPLY ? 'bad' : sp < 25 ? 'warn' : '');
    qs('.bar i', sup).style.width = U.clamp(sp, 0, 100) + '%';
    rollTo(qs('[data-k=tech]', hud), u.ship.tech, function (v) { return v.toFixed(1); });
    qs('[data-u=tech]', hud).textContent = SIM.eraOf(u.ship.tech);
    qs('[data-k=dim]', hud).textContent = dm.toFixed(3);
    qs('[data-u=dim]', hud).textContent = u.dimStrikes ? '−' + u.dimStrikes + '次' : '';
    qs('[data-s=dim]', hud).className = 'st ' + (dm < 2.85 ? 'bad' : dm < 2.96 ? 'warn' : '');
    qs('[data-s=dim]', hud).title = '每一次降维打击都让宇宙的维度永久流失一点（含星图之外）。累计 ' + u.dimStrikes + ' 次。';
    qs('[data-act=god]', hud).classList.toggle('on', st.god);
  }

  // 望远镜里看到的状态（光延迟）或上帝视角下的真实状态
  function visState(u, s, d) {
    if (st.god || s.id === u.ship.at) {
      var c = s.owner != null ? u.civs[s.owner] : null;
      return { owner: s.owner, dead: s.dead, flat: s.flat, sealed: !!(c && c.blackDomain), name: c ? c.name : null, era: c ? SIM.eraLabel(c) : null, type: s.type };
    }
    return SIM.stateAt(s, u.simYear - d) || {};
  }
  UI.visState = visState;
  function stateHTML(vs) {
    return vs.flat ? '<span class="t-flat">二维画 · 已被二向箔降维</span>' : vs.sealed ? '<span class="t-seal">黑域 ·「' + esc(vs.name) + '」</span>' :
      vs.dead ? '<span class="t-bad">死寂</span>' : vs.name ? '<span class="t-civ">「' + esc(vs.name) + '」</span> · ' + esc(vs.era) + '时代' : '<span class="t-dim">无文明迹象</span>';
  }
  function stateShort(vs) {
    return vs.flat ? '<span class="t-flat">二维画</span>' : vs.sealed ? '<span class="t-seal">黑域</span>' : vs.dead ? '<span class="t-bad">死寂</span>' : vs.name ? '<span class="t-civ">' + esc(vs.name) + '</span>' : '';
  }

  function renderPanel(u) {
    var sel = st.sel, oldIn = qs('.p-inner', panel), sc = oldIn ? oldIn.scrollTop : 0;
    var p = (sel == null || sel === u.ship.at) ? herePanel(u) : targetPanel(u, sel);
    panel.innerHTML = '<div class="grab" data-act="sheet"><span></span></div><div class="p-inner">' + p.body + '</div>' + (p.foot ? '<div class="p-foot">' + p.foot + '</div>' : '');
    panel.classList.toggle('target', sel != null && sel !== u.ship.at);
    var newIn = qs('.p-inner', panel); if (newIn) newIn.scrollTop = sc;
    document.body.classList.toggle('ru-sheet-open', !!st.sheet);
  }

  function targetPanel(u, id) {
    var s = u.systems[id], here = u.systems[u.ship.at], d = u.D[u.ship.at][id], m = u.memory[id], vs = visState(u, s, d);
    var h = '<div class="p-head"><div class="p-kicker">目的地 · <span class="num">' + d.toFixed(1) + '</span> 光年</div>' +
      '<h2 class="p-title">' + esc(s.name) + '</h2><div class="p-sub"><span class="dot" style="background:' + starCol(s) + '"></span>' + esc(sysTypeText(s)) + (s.habitable && !vs.dead ? ' · 宜居' : '') + '</div>' +
      '<button class="ico p-close" data-act="desel" title="取消">' + ICON.x + '</button></div>';
    var tele = st.god ? '<span class="t-god">上帝视角 · 真实现状</span>' :
      u.time - d < 0 ? '开局前 ' + Math.max(1, Math.round(d - u.time)) + ' 年的光' : yr(u.time - d) + '的光';
    h += '<div class="p-tele"><div class="kv"><i>望远镜所见</i><span>' + tele + (st.god ? '' : ' <em>延迟 ' + Math.round(d) + ' 年</em>') + '</span></div>' +
      '<div class="kv"><i>那时的状态</i><span>' + stateHTML(vs) + '</span></div>' +
      (m ? '<div class="kv"><i>上次到访</i><span>' + yr(m.year) + ' · ' + esc(SIM.lifeLine(m)) + '</span></div>' : '') + '</div>';
    // 驱动
    var warpOk = u.ship.supply >= SIM.WARP_SUPPLY;
    if (SIM.isWarp(st.mode) && !warpOk) st.mode = '0.03';
    var chips = function (arr, warp) {
      return arr.map(function (x) {
        var mm = warp ? 'w' + x : String(x), dis = warp && !warpOk;
        return '<button class="chip' + (mm === st.mode ? ' on' : '') + (warp ? ' w' : '') + '" data-act="drive" data-m="' + mm + '"' + (dis ? ' disabled title="补给不足 ' + SIM.WARP_SUPPLY + '，曲率引擎无法启动"' : '') + '>' + x + '<small>c</small></button>';
      }).join('');
    };
    h += '<div class="drives"><div class="dg"><i>常规推进 · 冬眠</i><div class="chips">' + chips(SIM.SPEEDS, false) + '</div></div>' +
      '<div class="dg w"><i>曲率驱动 · 无限接近 c</i><div class="chips">' + chips(SIM.WARP_SPEEDS, true) + '</div></div></div>';
    var tc = SIM.tripCalc(u, id, st.mode), sp = yParts(tc.ship), ep = extParts(tc.ext, tc.d);
    var ratio = tc.ext > 0 ? tc.ship / tc.ext : 1;
    h += '<div class="tcmp"><div class="tc cool"><i>船上</i><div class="big"><b class="num">' + sp.v + '</b><u>' + sp.u + '</u></div>' +
      (tc.warp ? '<em>舰员清醒航行</em>' : '<em>冬眠 · 生理只老 ' + fy(tc.bio) + '</em>') + '</div>' +
      '<div class="tc-mid"><span>γ</span><b class="num">' + fgam(tc.gamma) + '</b></div>' +
      '<div class="tc warm"><i>宇宙</i><div class="big"><b class="num">' + ep.v + '</b><u>' + ep.u + '</u></div><em>' + U.fmtBeta(tc.beta) + '</em></div></div>' +
      '<div class="tbar"><div class="tb warm"></div><div class="tb cool" style="width:' + Math.max(0.6, ratio * 100).toFixed(2) + '%"></div></div>';
    var supAfter = Math.max(0, u.ship.supply - tc.supply);
    var arrT = u.time + tc.ext, arrStr = arrT < 1000 ? (Math.ceil(arrT * 10 - 1e-9) / 10).toFixed(1) : Math.ceil(arrT - 1e-9).toLocaleString('en-US');
    h += '<div class="arrive"><div><i>抵达</i><span><b class="num">' + arrStr + '</b> 年</span></div><div><i>舰员</i><span><b class="num' + (tc.dies ? ' t-bad' : tc.ageAfter > 90 ? ' t-warn' : '') + '">' + Math.min(SIM.LIFESPAN, tc.ageAfter).toFixed(1) + '</b> 岁</span></div><div><i>补给</i><span><b class="num">' + u.ship.supply.toFixed(0) + '</b><em>→</em><b class="num' + (supAfter < SIM.WARP_SUPPLY ? ' t-bad' : supAfter < 25 ? ' t-warn' : '') + '">' + supAfter.toFixed(0) + '</b></span></div></div>';
    if (tc.dies) h += '<div class="alert bad"><b>舰员活不到那一天。</b>他们会在途中老死（寿命上限 ' + SIM.LIFESPAN + ' 岁）。</div>';
    if (tc.warp) h += '<div class="alert warn"><b>曲率航迹</b>会在' + esc(here.name) + '和' + esc(s.name) + '留下数十年可见的痕迹——等于暴露坐标，提高两地被黑暗森林打击的风险。</div>';
    else h += '<div class="alert cool">不留曲率航迹，几乎不暴露坐标。代价：外面将换过好几个时代，长眠也有事故风险。</div>';
    if (!warpOk) h += '<div class="alert bad">补给不足 ' + SIM.WARP_SUPPLY + '：曲率引擎无法启动，只能常规推进。</div>';
    h += '<details class="why"><summary>为什么船上这么短？</summary><p>' + (tc.warp ?
      '曲率驱动（《三体》设定）<b>不能超光速</b>，只是几乎瞬间把飞船推到无限接近光速。外部时间 = 距离 / v ≈ 距离 / c；船上时间 = 外部时间 / γ，γ = 1/√(1−v²/c²)。所以船上只过很短的时间，而宇宙照常老去。' :
      '不管用什么能源、有没有工质，常规推进都不可能接近光速，这里上限 0.03c。γ ≈ 1，几乎没有时间膨胀，船上时间 ≈ 外部时间，一趟就是几百上千年。舰员只能全程冬眠，生理衰老降到 1/' + SIM.CRYO + '。') + '</p></details>';
    var foot = '<button class="btn-launch' + (tc.warp ? ' w' : '') + '" data-act="launch"' + (u.ship.dead ? ' disabled' : '') + '><span>启航</span><small>' + esc(driveName(st.mode)) + ' → ' + esc(s.name) + '</small></button>';
    return { body: h, foot: foot };
  }

  function herePanel(u) {
    var s = u.systems[u.ship.at], age = u.ship.crewAge0 + u.ship.bio, foot = '';
    var h = '<div class="p-head"><div class="p-kicker">' + (u.ship.dead ? '旅程终结于' : '当前位置') + '</div><h2 class="p-title">' + esc(s.name) + '</h2>' +
      '<div class="p-sub"><span class="dot" style="background:' + starCol(s) + '"></span>' + esc(sysTypeText(s)) + (s.flat ? ' · 二维画' : s.dead ? ' · 死寂' : s.habitable ? ' · 宜居' : '') + '</div></div>';
    if (s.owner != null && !s.flat) {
      var c = u.civs[s.owner];
      h += '<div class="civbox"><div class="civname" style="--cc:' + c.color + '">' + esc(c.name) + '<span>' + esc(SIM.eraLabel(c)) + '</span></div><div class="civgrid">' +
        cg('人口', SIM.fmtPop(c.pop)) + cg('科技', c.tech.toFixed(1)) + cg('资源', c.res.toFixed(1)) + cg('扩张欲', (c.exp * 100).toFixed(0) + '%') + cg('稳定', (c.stab * 100).toFixed(0) + '%') + '</div></div>';
    }
    if (!u.ship.dead) {
      h += '<div class="hint">' + (isTouch ? '轻触' : '点击') + '星图上的恒星，规划下一段航程。<button class="link" data-act="list">打开星表</button></div>';
      // 冬眠
      var low = u.ship.supply < 10;
      h += '<div class="sec"><div class="sec-t">原地冬眠<span>飞船静止 · 舰员衰老 1/' + SIM.CRYO + '</span></div><div class="hibs">' + [50, 300, 1000].map(function (y) {
        var wake = age + y / SIM.CRYO, pAcc = 1 - Math.pow(1 - 0.015 * (low ? 3 : 1), y / 100), pDie = low ? pAcc * 0.5 : 0, dies = wake >= SIM.LIFESPAN;
        return '<button class="hib-card' + (st.hib === y ? ' on' : '') + (dies ? ' bad' : '') + '" data-act="hib" data-y="' + y + '" title="冬眠 ' + y + ' 年：舰员 ' + age.toFixed(1) + ' → ' + Math.min(wake, SIM.LIFESPAN).toFixed(1) + ' 岁。冬眠事故概率约 ' + (pAcc * 100).toFixed(0) + '%' + (pDie ? '（补给不足，其中一半致命：约 ' + (pDie * 100).toFixed(0) + '%）' : '（不致命，但会耗补给）') + '。停靠的恒星若被光粒击中，冬眠中的飞船也可能被波及。">' +
          '<div><b class="num">' + fint(y) + '</b><u>年</u></div><span class="' + (dies ? 't-bad' : '') + '">' + (dies ? '会寿终（' + SIM.LIFESPAN + '）' : '醒来 ' + wake.toFixed(1) + ' 岁') + '</span><em class="' + (pDie ? 't-bad' : '') + '">事故 ' + (pAcc * 100).toFixed(0) + '%' + (pDie ? ' · 致命' : '') + '</em><em>补给 −' + Math.min(u.ship.supply, y / 100 * HIB_SUPPLY).toFixed(0) + '</em></button>';
      }).join('') + '</div>';
      if (st.hib) {
        var y = st.hib, wake2 = age + y / SIM.CRYO;
        foot = '<button class="btn-launch cryo" data-act="sleep"><span>进入冬眠</span><small>醒来时 ' + yr(u.time + y) + ' · 舰员 ' + Math.min(wake2, SIM.LIFESPAN).toFixed(1) + ' 岁' + (wake2 >= SIM.LIFESPAN ? ' · 不会再醒来' : '') + '</small></button>';
      }
      h += '</div>';
    }
    h += destinyHTML(u);
    h += '<div class="sec"><div class="sec-t">双生子时间<span>船上固有时 × 宇宙纪年</span></div>' + UI.twinSVG(u, 340, 140) + '</div>';
    h += '<details class="sec log"><summary class="sec-t">航行日志<span>' + u.ship.trips.length + ' 段 ' + ICON.chev + '</span></summary>' + logHTML(u) + '</details>';
    return { body: h, foot: foot };
  }
  function destinyHTML(u) {
    if (!SIM.DESTINIES || !SIM.destinyOf) return '';
    var d = SIM.destinyOf(u);
    if (d) {
      var stc = d.state === 'won' ? 'won' : d.state === 'lost' ? 'lost' : 'active';
      return '<div class="sec"><div class="sec-t">命运<span>' + (stc === 'won' ? '已达成' : stc === 'lost' ? '已落空' : '进行中') + '</span></div><div class="destiny ' + stc + '"><b>' + esc(d.title) + '</b><p>' + esc(d.goal || '') + '</p>' + (d.progress ? '<em>' + esc(d.progress) + '</em>' : '') + '</div></div>';
    }
    if (u.ship.dead) return '';
    return '<details class="sec dest-pick"' + (u.ship.trips.length ? '' : ' open') + '><summary class="sec-t">选一个命运<span>可选 · 随时 ' + ICON.chev + '</span></summary><div class="dests">' + SIM.DESTINIES.map(function (x) {
      return '<button class="dest" data-act="destiny" data-id="' + esc(x.id) + '"><b>' + esc(x.title) + '</b><span>' + esc(x.goal) + '</span></button>';
    }).join('') + '</div></details>';
  }
  function cg(k, v) { return '<div><i>' + k + '</i><b class="num">' + esc(v) + '</b></div>'; }

  function logHTML(u) {
    var out = u.ship.trips.slice().reverse().map(function (t) {
      return '<div class="lg"><div class="lg-h"><b class="num">#' + t.n + '</b> ' + (t.from === t.to ? '在' + esc(u.systems[t.to].name) + '冬眠' : esc(u.systems[t.from].name) + ' → ' + esc(u.systems[t.to].name)) + '<span>' + esc(t.label) + '</span></div>' +
        '<div class="lg-b"><span class="t-cool">船上 +' + fy(t.ship) + (t.bio < t.ship - 1e-6 ? '（老 ' + fy(t.bio) + '）' : '') + '</span> · <span class="t-warm">宇宙 +' + fy(t.ext) + '</span> → ' + yr(t.arrive) + ' · ' + t.crewAge.toFixed(1) + ' 岁' + (t.detained ? ' · <span class="t-bad">被扣留 ' + t.detained + ' 年</span>' : '') + '</div></div>';
    }).join('');
    return out + '<div class="lg dim"><div class="lg-b">纪元 0 年 · 从太阳出发，舰员 ' + u.ship.crewAge0 + ' 岁。</div></div>';
  }

  /** 双生子时间图（SVG）：x = 船上固有时，y = 宇宙纪年；虚线 = 没有时间膨胀 */
  UI.twinSVG = function (u, W, Hh) {
    var pts = [{ x: 0, y: 0, k: 'start' }];
    u.ship.trips.forEach(function (t) { pts.push({ x: t.shipAfter, y: t.arrive, k: t.from === t.to ? 'cryo' : t.warp ? 'warp' : 'slow', t: t }); });
    var last = pts[pts.length - 1], mx = Math.max(1, last.x), my = Math.max(10, last.y);
    var L = 6, R = 8, T = 22, B = 22, iw = W - L - R, ih = Hh - T - B;
    function X(v) { return L + iw * v / mx; } function Y(v) { return T + ih - ih * v / my; }
    var id = 'tw' + Math.floor(Math.random() * 1e6);
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var area = path + ' L' + X(last.x).toFixed(1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z';
    var refE = Math.min(mx, my);
    var s = '<svg class="twin" viewBox="0 0 ' + W + ' ' + Hh + '" width="100%">' +
      '<defs><linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb98a" stop-opacity=".22"/><stop offset="1" stop-color="#ffb98a" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + id + 'l" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#ffcf9a"/></linearGradient></defs>';
    for (var g = 0; g < 4; g++) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ih * g / 4) + '" y2="' + (T + ih * g / 4) + '" class="grid"/>';
    s += '<line x1="' + L + '" y1="' + Y(0) + '" x2="' + (W - R) + '" y2="' + Y(0) + '" class="axis"/>';
    s += '<line x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(refE).toFixed(1) + '" y2="' + Y(refE).toFixed(1) + '" class="ref"/>';
    if (pts.length > 1) {
      s += '<path d="' + area + '" fill="url(#' + id + 'a)"/>';
      s += '<path d="' + path + '" class="glow" stroke="url(#' + id + 'l)"/><path d="' + path + '" class="line" stroke="url(#' + id + 'l)"/>';
    }
    pts.forEach(function (p, i) { if (i) s += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (i === pts.length - 1 ? 3.4 : 2.1) + '" class="pt ' + p.k + (i === pts.length - 1 ? ' last' : '') + '"><title>' + esc((p.t.from === p.t.to ? '冬眠于' : '抵达') + u.systems[p.t.to].name + ' · 船上 ' + fy(p.x) + ' · ' + yr(p.y)) + '</title></circle>'; });
    s += '<text x="' + (L + 2) + '" y="13" class="lab warm">宇宙 ' + fint(my) + ' 年</text>';
    s += '<text x="' + (W - R) + '" y="' + (Hh - 6) + '" class="lab cool" text-anchor="end">船上 ' + fy(mx) + '</text>';
    s += '<text x="' + (L + 2) + '" y="' + (Hh - 6) + '" class="lab dim">虚线 = 没有时间膨胀</text>';
    return s + '</svg>';
  };

  // ---------- 星表 ----------
  function renderList(u) {
    var here = u.ship.at;
    var rows = u.systems.map(function (s) { return { s: s, d: u.D[here][s.id] }; }).sort(function (a, b) { return a.d - b.d; });
    listEl.innerHTML = '<div class="ls-head"><span>星表</span><em>' + (st.god ? '上帝视角' : '按光延迟') + ' · ' + u.systems.length + ' 个恒星系</em><button class="ico" data-act="list">' + ICON.x + '</button></div><div class="ls-body">' +
      rows.map(function (r) {
        var vs = visState(u, r.s, r.d);
        return '<div class="ls-row' + (r.s.id === here ? ' here' : '') + (r.s.id === st.sel ? ' on' : '') + '" data-act="pick" data-id="' + r.s.id + '"><span class="dot" style="background:' + starCol(r.s) + '"></span>' +
          '<b>' + esc(r.s.name) + (u.memory[r.s.id] && r.s.id !== here ? '<sup>到访过</sup>' : '') + '</b><span class="ls-st">' + (r.s.id === here ? '<span class="t-good">你在这里</span>' : stateShort(vs)) + '</span><span class="num ls-d">' + (r.s.id === here ? '' : r.d.toFixed(0) + ' ly') + '</span></div>';
      }).join('') + '</div>';
  }

  function closeDrawers() {
    st.list = false; if (listEl) listEl.classList.remove('open');
    if (menuEl) menuEl.classList.remove('open');
  }

  function renderMenu() {
    var u = H.u();
    menuEl.innerHTML = '<div class="mn-sec"><i>宇宙种子</i><div class="mn-seed"><input id="ruSeed" value="' + esc(u ? u.seed : '') + '" spellcheck="false" autocomplete="off"><button data-act="seedgo">进入</button></div></div>' +
      '<button class="mn-item" data-act="reroll">换一个宇宙</button>' +
      '<button class="mn-item" data-act="restart">重开这个宇宙</button>' +
      '<button class="mn-item" data-act="copyplan">复制这段旅程的复现链接</button>' +
      '<button class="mn-item" data-act="sharenow">分享此刻的星图</button>' +
      '<button class="mn-item" data-act="rules">规则与物理</button>' +
      '<div class="mn-foot">同一种子 + 同样的选择 = 同一部宇宙史</div>';
    var inp = qs('#ruSeed', menuEl);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { closeDrawers(); H.newGame(inp.value.trim()); } });
  }

  // ---------- 交互 ----------
  function onAct(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), u = H.u();
    switch (a) {
      case 'god': st.god = !st.god; H.godView(st.god); UI.toast(st.god ? '上帝视角：显示真实现状、歌者与在途武器' : '回到光延迟视角：你看到的是光已经传到这里的样子'); UI.render(); break;
      case 'list': st.list = !st.list; menuEl.classList.remove('open'); listEl.classList.toggle('open', st.list); if (st.list) renderList(u); break;
      case 'mute': try { RU.audio.unlock(); RU.audio.setMuted(!RU.audio.muted); } catch (er) { } updateMuteIcon(); break;
      case 'menu': st.list = false; listEl.classList.remove('open'); renderMenu(); menuEl.classList.toggle('open'); break;
      case 'desel': UI.select(null); break;
      case 'pick': UI.select(+b.getAttribute('data-id'), true); if (window.innerWidth < 760) closeDrawers(); break;
      case 'drive': st.mode = b.getAttribute('data-m'); H.route(st.sel, st.mode); cue('select'); renderPanel(u); break;
      case 'launch': if (st.sel != null) H.launch(st.sel, st.mode); break;
      case 'hib': var y = +b.getAttribute('data-y'); st.hib = st.hib === y ? null : y; st.sheet = true; renderPanel(u); break;
      case 'sleep': if (st.hib) { var yy = st.hib; st.hib = null; H.hibernate(yy); } break;
      case 'sheet': st.sheet = !st.sheet; document.body.classList.toggle('ru-sheet-open', st.sheet); break;
      case 'seedgo': closeDrawers(); H.newGame(qs('#ruSeed').value.trim()); break;
      case 'reroll': closeDrawers(); H.newGame(''); break;
      case 'restart': closeDrawers(); H.restart(); break;
      case 'copyplan': closeDrawers(); copyText(H.planUrl()).then(function () { UI.toast('复现链接已复制：同一种子 + 同样的选择 = 同一部宇宙史'); }); break;
      case 'sharenow': closeDrawers(); H.share('map', {}); break;
      case 'rules': closeDrawers(); showRules(); break;
      case 'destiny': if (H.destiny) H.destiny(b.getAttribute('data-id')); break;
    }
  }
  function updateMuteIcon() { var b = hud && qs('[data-act=mute]', hud); if (b) { var m = RU.audio && RU.audio.muted; b.innerHTML = m ? ICON.mute : ICON.snd; b.classList.toggle('off', !!m); } }

  UI.select = function (id, fromList) {
    var u = H.u(); if (!u) return;
    if (id != null && id === st.sel && !fromList) { st.sheet = true; renderPanel(u); return; }
    st.sel = id; st.hib = null;
    if (id != null) { cue('select'); st.sheet = true; } else st.sheet = false;
    H.selected(id, st.mode, fromList);
    renderPanel(u); if (st.list) renderList(u);
  };

  UI.toast = function (t, cls) {
    var box = qs('.ru-toasts'); if (!box) return;
    var el = U.el('div', 'toast ' + (cls || ''), esc(t), box);
    setTimeout(function () { el.classList.add('out'); }, 3200);
    setTimeout(function () { el.remove(); }, 4000);
  };
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { return fallbackCopy(t); });
    return Promise.resolve(fallbackCopy(t));
  }
  function fallbackCopy(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); }
  UI.copyText = copyText;

  // ---------- 模态层工具 ----------
  function layer(cls, html) {
    var el = U.el('div', 'ru-layer ' + (cls || ''), html);
    if (RU.engine.still) el.classList.add('in'); else requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
    return el;
  }
  function closeLayer(el, ms) { if (!el) return U.wait(0); el.classList.remove('in'); el.classList.add('out'); return U.wait(ms || 500).then(function () { el.remove(); }); }
  UI.layer = layer; UI.closeLayer = closeLayer;
  function waitClick(el, ms) {   // 点击 / 空格 / 回车 / 超时 任一触发
    return new Promise(function (res) {
      var done = false, timer = ms ? setTimeout(fin, ms) : null;
      function fin() { if (done) return; done = true; clearTimeout(timer); el.removeEventListener('click', fin); document.removeEventListener('keydown', key); res(); }
      function key(e) { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); fin(); } }
      el.addEventListener('click', fin); document.addEventListener('keydown', key);
    });
  }
  UI.waitClick = waitClick;

  function showRules() {
    var rules = [
      ['宇宙', '程序化生成 22–29 个恒星系，全图约 200 光年；同一种子永远生成同一宇宙、同一段初始历史。'],
      ['光速', '没有任何东西能超光速：外部时间永远 ≥ 距离 / c。'],
      ['常规推进', '上限 0.03c。船上时间 ≈ 外部时间，舰员冬眠，生理衰老降到 1/50。不留航迹。'],
      ['曲率驱动', '几乎瞬间加速到 0.999c–0.99999c，船上时间 = 外部时间 / γ，极短；但会留下暴露坐标的曲率航迹（约 45 年减半）。'],
      ['光延迟', '地图和远方消息只显示光已经传到你这里的状态。「上帝视角」只是调试与回放视角。'],
      ['文明', '人口、科技、资源、扩张欲、稳定度五个数按带随机项的差分方程逐年演化。科技 8 农耕 / 20 工业 / 35 信息 / 55 星际 / 75 星海。'],
      ['接触', '按「对方科技 − 飞船科技」分层：原始、落后、对等、先进；地球一脉永远欢迎你回家；废墟可以考古。'],
      ['回响', '你的干预会在之后几百年里发酵：宗教、科技史、以你命名的飞船、报恩或复仇的舰队。它们以金色出现在「你留下的回响」里。'],
      ['代价', '补给起始 100；曲率每次消耗 4 + 距离/50；冬眠和常规航行每 100 年约 1。舰员活到 105 岁旅程结束；长眠有事故风险。'],
      ['黑暗森林', '暴露度来自无线电、曲率航迹、坐标广播和被抽取的星图。打击都有飞行时间。看到闪光的文明会静默；科技 ≥100 的可能封进黑域。'],
      ['歌者', '在星图之外巡航的清理者（科技 150），不可接触。坐标的光传到它那里后，它随手扔回光粒或二向箔。'],
      ['二向箔', '命中点周围的三维空间以光速跌落成二维，半径扩到 10–22 光年后停止。只有曲率驱动跑得赢前沿。'],
      ['宇宙维度', '每次降维打击都让维度永久流失：维度 = 3 − 0.012 × 次数。累积下去会出现常数漂移与归零者的广播。'],
      ['惰性求值', '你飞行时宇宙并不实时运行；抵达那一刻，才把这些年按同一套规则一口气推演完。']
    ];
    var el = layer('ru-rules', '<div class="sheet"><button class="ico x" data-x>' + ICON.x + '</button><div class="kicker">规则与物理</div><h1>你离开的每一秒，宇宙都在老去</h1>' +
      '<div class="formula"><span>γ = 1 / √(1 − v²/c²)</span><span>t<sub>船</sub> = t<sub>外</sub> / γ</span><span>t<sub>外</sub> ≥ d / c</span></div>' +
      rules.map(function (r) { return '<div class="rule"><b>' + r[0] + '</b><p>' + r[1] + '</p></div>'; }).join('') + '</div>');
    el.addEventListener('click', function (e) { if (e.target === el || e.target.closest('[data-x]')) closeLayer(el); });
  }

  // ---------- 标题占位（cinema 的 title 场景未就绪时 / 分享链接的落地页） ----------
  UI.titleFallback = function (opts) {
    opts = opts || {};
    return new Promise(function (res) {
      var el = layer('ru-title', '<div class="tt-wrap"><div class="tt-kicker">RELATIVITY · UNIVERSE</div><h1 class="cine-title">相对论宇宙</h1>' +
        '<p class="tt-line">你离开的每一秒，宇宙都在老去。</p>' +
        (opts.shared ? '<p class="tt-shared">有人寄给你一段旅程<br><span>' + esc(opts.shared) + '</span></p><button class="btn-start" data-go>观看这一刻</button>' :
          '<button class="btn-start" data-go>启航</button>') +
        '<div class="tt-foot">遵守光速、洛伦兹因子与黑暗森林法则</div></div>');
      qs('[data-go]', el).addEventListener('click', function () { try { RU.audio.unlock(); } catch (e) { } cue('title-hit'); closeLayer(el, 900); res({ seed: opts.seed || null }); });
    });
  };

  // ---------- 占位演出（场景还没做完时也能跑通整局） ----------
  UI.cine = function (kind, o) {
    o = o || {};
    var u = o.u || H.u(), t = o.trip || (o.res && o.res.trip), h = '';
    if (kind === 'warp' && t) {
      h = '<div class="cn-k">' + esc(t.label) + '</div><div class="cn-t">' + esc(u.systems[t.from].name) + ' → ' + esc(u.systems[t.to].name) + '</div>' +
        '<div class="cn-nums"><div class="cool"><i>船上</i><b class="num" data-a>0</b></div><div class="warm"><i>宇宙</i><b class="num" data-b>0</b></div><div><i>γ</i><b class="num">' + fgam(t.gamma) + '</b></div></div>';
    } else if (kind === 'replay' && t) {
      h = '<div class="cn-k">上帝视角回放</div><div class="cn-t">' + yr(t.depart) + ' → ' + yr(t.arrive) + '</div><div class="cn-s">你看不到的那些年</div>';
    } else if (kind === 'foil') {
      h = '<div class="cn-k t-bad">二向箔</div><div class="cn-t">太阳系被压成了一幅画</div><div class="cn-s">' + (o.year != null ? yr(o.year) : '') + '</div>';
    } else h = '<div class="cn-t">……</div>';
    var el = layer('ru-cine', '<div class="cn">' + h + '</div><button class="skip silent">跳过 ›</button>');
    if (kind === 'warp' && t) {
      rollFrom0(qs('[data-a]', el), t.ship * (t.frac || 1), function (v) { return v < 1e-7 ? '0' : fy(v); }, 2600, U.ease.sine);
      rollFrom0(qs('[data-b]', el), t.ext * (t.frac || 1), function (v) { return v < 1e-7 ? '0' : fy(v); }, 2600, U.ease.sine);
    }
    return waitClick(el, kind === 'foil' ? 3500 : 3000).then(function () { return closeLayer(el, 400); });
  };

  UI.cryo = function (on) {   // 冬眠舱的霜白过渡
    var el = layer('ru-frost', '<div class="fr-t">' + (on ? '进入冬眠' : '苏醒') + '</div>');
    return U.wait(on ? 1400 : 900).then(function () { return closeLayer(el, 800); });
  };

  // ---------- 抵达仪式 ----------
  UI.ceremony = function (res) {
    var r = res.report, t = res.trip, sleep = t.from === t.to, revisit = !r.first && r.gap != null && !sleep;
    var a = sleep ? t.bio : revisit ? r.bioGap : t.bio, b = sleep ? (t.arrive - t.depart) : revisit ? r.gap : t.ext;
    var kick = sleep ? '从冬眠中醒来 · ' + r.sysName : (r.first ? '抵达 · ' : '回到 · ') + r.sysName;
    var cryoFlight = !sleep && !t.warp && !revisit;
    var cryoRevisit = !sleep && revisit && r.shipGap != null && r.bioGap < r.shipGap - 0.5;
    var isBio = sleep || cryoFlight || cryoRevisit;
    var lineA = sleep ? '对你，老了' : isBio ? '对你，只老了' : '对你，只过了';
    var subA = sleep ? '冬眠 ' + fint(b) + ' 年 · 船上时钟同步，无时间膨胀' :
      cryoFlight ? '常规推进冬眠 · 船上过了 ' + fext(t.ship) :
      cryoRevisit ? '其间船上过了 ' + fy(r.shipGap) + '（含冬眠）' : '';
    var lineB = sleep ? '外面，已过了' : revisit ? '这里，已过了' : '宇宙，已过了';
    var note = revisit ? '自你上次离开这里' : sleep ? '你在' + r.sysName + '的轨道上长眠' : '你飞越了 ' + t.d.toFixed(1) + ' 光年';
    mood('report'); cue('arrival');
    var el = layer('ru-cere', '<div class="ce"><div class="ce-k">' + esc(kick) + '</div><div class="ce-note">' + esc(note) + '</div>' +
      '<div class="ce-row a"><span>' + lineA + '</span><b class="num cool" data-a></b>' + (subA ? '<em class="ce-subnote">' + esc(subA) + '</em>' : '') + '</div>' +
      '<div class="ce-row b"><span>' + lineB + '</span><b class="num warm" data-b></b></div>' +
      '<div class="ce-foot">' + yr(t.arrive) + (t.gamma > 1.01 ? ' · γ ' + fgam(t.gamma) : '') + ' · 舰员 ' + t.crewAge.toFixed(1) + ' 岁</div></div><div class="ce-hint">点击继续</div>');
    var ea = qs('[data-a]', el), eb = qs('[data-b]', el);
    // 数字与单位分开排：数字等宽细体，单位小一号宋体
    var split = function (str) { var i = str.lastIndexOf(' '); return str.slice(0, i) + '<small>' + str.slice(i + 1) + '</small>'; };
    var fa = function (v) { return v < 1e-7 ? '0' : split(isBio ? fage(v) : fy(v)); };
    var fb = function (v) {
      if (v < 1e-7) return '0';
      if (sleep) return split(fint(Math.round(v)) + ' 年');
      if (!revisit && t.d > 0) return split(fext(v, v >= b - 1e-6 ? t.d : null));
      return split(b >= 100 ? fint(v) + ' 年' : fy(v));
    };
    ea.textContent = ''; eb.textContent = '';
    if (RU.engine.still || document.body.classList.contains('ru-still')) {
      ea.innerHTML = fa(a); eb.innerHTML = fb(b); el.classList.add('s1', 's2', 's3');
      return waitClick(el).then(function () { return closeLayer(el, 200); });
    }
    var seq = U.wait(600).then(function () { el.classList.add('s1'); return rollFrom0(ea, a, fa, 1300); })
      .then(function () { return U.wait(400); }).then(function () { el.classList.add('s2'); return rollFrom0(eb, b, fb, 2200); })
      .then(function () { el.classList.add('s3'); return U.wait(2200); });
    var skip = waitClick(el);
    return Promise.race([seq, skip.then(function () { ea.innerHTML = fa(a); eb.innerHTML = fb(b); el.classList.add('s1', 's2', 's3'); return U.wait(200); })])
      .then(function () { return closeLayer(el, 600); });
  };

  // 途中终结的「仪式」：没有抵达
  UI.deathCeremony = function (res) {
    var r = res.report, t = res.trip, u = H.u();
    try { RU.audio.mood('silence'); } catch (e) { }
    cue('death');
    var where = t.from === t.to ? '在' + r.sysName + '冬眠时' : u.systems[t.from].name + ' → ' + u.systems[t.to].name + ' 途中';
    var el = layer('ru-cere dead', '<div class="ce"><div class="ce-k t-bad">旅程终结</div><div class="ce-note">' + esc(where) + '</div>' +
      '<p class="ce-cause">' + esc(r.deathCause || '') + '</p>' + (t.caught ? '<p class="ce-sub">飞船没有抵达。它停在了二维平面的边缘——永远。</p>' : '') +
      (r.notes || []).map(function (n) { return '<p class="ce-sub">' + esc(n.t) + '</p>'; }).join('') +
      '<div class="ce-foot">' + yr(t.arrive) + ' · 舰员 ' + t.crewAge.toFixed(1) + ' 岁</div></div><div class="ce-hint">点击继续</div>');
    el.classList.add('s1', 's2', 's3');
    return waitClick(el, 12000).then(function () { return closeLayer(el, 600); });
  };

  // ---------- 报告 ----------
  var SCENE_NOTE = { '故人': '故人：认出了你', '故人·怨': '故人：记着你的账', '故人·求': '故人：有求于你', '旧盟': '旧盟：变了的盟友', '归乡': '回家', '通行': '持证通行', '礼遇': '以礼相待', '学者': '学者：研究你', '官僚': '官僚：检疫', '收藏家': '收藏家：想展出你', '商人': '商人：雇你送信', '冷漠': '冷漠：无视你', '好战': '好战：盘查', '扣押': '敌意：扣押' };
  var TIER_NOTE = { '母星': '这里是地球文明的家。', '原始': '他们还在石器时代，几乎无法理解你。', '落后': '他们明显落后于你，你可以决定给他们多少。', '对等': '你们科技相当，谁也压不住谁。', '先进': '他们远比你先进，主动权不在你手里。', '遗迹': '这里只剩下废墟。', '遗迹（已发掘）': '废墟已经被你翻过了。', '无人': '这里没有可以接触的文明。', '二维': '这里已经不是三维空间了。', '黑域': '一个把自己永远关起来的文明。', '终结': '' };
  var HIB_SUPPLY = 2.5;   // 冬眠每百年补给消耗（sim #26）
  var RISKY = /危险|判死刑|致命|开火|激怒|敌意|可能会死|赌/;
  var QUIET = /^(离开|继续)$/;

  function pickHero(big) {
    if (!big || !big.length) return { hero: null, rest: [] };
    var i = 0; for (var k = 0; k < big.length; k++) if (big[k].cls !== 'good') { i = k; break; }
    var rest = big.slice(); var hero = rest.splice(i, 1)[0];
    return { hero: hero, rest: rest };
  }
  UI.pickHero = pickHero;
  function para(l, extra) { return '<p class="' + esc(l.cls || '') + (extra ? ' ' + extra : '') + '">' + esc(l.t) + '</p>'; }
  function isCause(t) { return /^因果|追溯到|起因/.test(t); }

  UI.report = function (res) {
    var u = H.u(), r = res.report, t = res.trip, sleep = t.from === t.to;
    return new Promise(function (resolve) {
      var hp = pickHero(r.big), h = '';
      h += '<div class="rp-top"><div class="rp-k">' + (sleep ? '从冬眠中醒来' : r.first ? '第一次抵达' : '重返') + ' · ' + yr(t.arrive) + '</div>' +
        '<h1 class="rp-title">' + esc(r.sysName) + '</h1>' +
        '<div class="rp-chips"><span>' + esc(t.label) + '</span>' + (t.gamma > 1.01 ? '<span>γ <b class="num">' + fgam(t.gamma) + '</b></span>' : '') +
        '<span class="t-cool">船上 +' + fy(t.ship) + (t.bio < t.ship - 1e-6 ? '（老 ' + fy(t.bio) + '）' : '') + '</span><span class="t-warm">宇宙 +' + (sleep ? fy(t.ext) : fext(t.ext, t.d)) + '</span><span>舰员 ' + t.crewAge.toFixed(1) + ' 岁</span></div>' +
        '<div class="rp-acts"><button class="ico" data-share title="分享这一刻">' + ICON.share + '</button><button class="ico" data-close title="回到星图">' + ICON.x + '</button></div></div>';
      // 最重的一张大事件卡
      if (hp.hero) {
        var hb = hp.hero;
        h += '<div class="hero ' + (hb.cls === 'good' ? 'good' : 'bad') + (hb.major ? ' major' : '') + '"><div class="hero-k">' + (hb.major ? '重大时刻' : hb.cls === 'good' ? '这些年里最重要的事' : '这些年里最沉重的事') + (hb.agg > 1 ? ' · ' + hb.agg + ' 件' : '') + '</div><div class="hero-t">' + esc(hb.title) + '</div><p>' + esc(hb.t) + '</p></div>';
        if (hp.rest.length) h += '<details class="more"><summary>还有 ' + hp.rest.length + ' 件大事' + ICON.chev + '</summary>' + hp.rest.map(function (b) { return '<div class="mini ' + (b.cls || '') + '"><b>' + esc(b.title) + '</b><p>' + esc(b.t) + '</p></div>'; }).join('') + '</details>';
      }
      if (r.bigFolded && r.bigFolded.length) h += '<details class="more folded"><summary>另有 ' + r.bigFolded.length + ' 件事已记入史册' + ICON.chev + '</summary>' + r.bigFolded.map(function (b) { return '<div class="mini ' + (b.cls || '') + '"><b>' + esc(b.title) + '</b><p>' + esc(b.t) + '</p></div>'; }).join('') + '</details>';
      if (r.ending) h += endingHTML(r.ending);
      (r.notes || []).forEach(function (n) { h += para(n, 'note'); });
      // 当年 vs 现在
      if (r.now) {
        var nm = function (x) { return x.flat ? '二维画' : x.sealed ? '黑域' : x.civName || (x.dead ? '死寂' : '无人'); };
        if (r.first || !r.then) {
          h += '<div class="cmp one"><div class="now"><i>' + (sleep ? '现在' : '第一次来到这里') + '</i><b>' + esc(nm(r.now)) + '</b><p>' + esc(SIM.lifeLine(r.now)) + '</p></div></div>';
        } else {
          h += '<div class="cmp"><div class="then"><i>你离开时 · ' + yr(r.then.year) + '</i><b>' + esc(nm(r.then)) + '</b><p>' + esc(SIM.lifeLine(r.then)) + '</p></div>' +
            '<div class="arrow"><span>' + fint(r.gap || 0) + ' 年</span></div><div class="now"><i>现在 · ' + yr(r.now.year) + '</i><b>' + esc(nm(r.now)) + '</b><p>' + esc(SIM.lifeLine(r.now)) + '</p></div></div>';
        }
      }
      if (r.lines && r.lines.length) h += '<div class="narr">' + r.lines.map(function (l) { return para(l, isCause(l.t) ? 'cause' : ''); }).join('') + '</div>';
      // 回响（金色）
      var lineT = {}; (r.lines || []).forEach(function (l) { lineT[l.t] = 1; });
      (r.events || []).forEach(function (e) { lineT[SIM.yr(e.y) + '：' + e.t] = 1; });
      var cz = (r.caused || []).filter(function (x) { return !lineT[x]; });
      if (cz.length) h += '<div class="echo"><div class="echo-k">你留下的回响</div><div class="echo-s">你的选择在这些年里造成的后果</div>' + cz.slice(0, 5).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') +
        (cz.length > 5 ? '<details><summary>还有 ' + (cz.length - 5) + ' 条' + ICON.chev + '</summary>' + cz.slice(5).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</details>' : '') + '</div>';
      // 史料：按重要度给前三条，其余折叠
      if (r.events && r.events.length) {
        var evs = r.events.slice(), you = evs.filter(function (e) { return e.you; });
        var top = evs.slice().sort(function (a, b) { return (b.you ? 9 : 0) + (b.imp || 0) - ((a.you ? 9 : 0) + (a.imp || 0)); }).slice(0, 3);
        top.sort(function (a, b) { return a.y - b.y; });
        var evLine = function (e) { return '<div class="ev' + (e.you ? ' you' : '') + '"' + (e.you ? ' title="你留下的回响"' : '') + '><span class="num">' + fint(e.y) + '</span><p>' + esc(e.t) + '</p></div>'; };
        h += '<div class="sec-h">' + (r.first ? '当地史料' : '这些年里发生的事') + '<span>' + evs.length + ' 条' + (you.length ? ' · ' + you.length + ' 条与你有关' : '') + '</span></div>';
        h += '<div class="evs">' + top.map(evLine).join('') + '</div>';
        if (evs.length > 3) h += '<details class="more"><summary>完整年表 · ' + evs.length + ' 条' + ICON.chev + '</summary><div class="evs">' + evs.map(evLine).join('') + '</div></details>';
      }
      if (r.goals && r.goals.length) h += '<div class="goal"><i>旅程里程碑</i>' + r.goals.map(esc).join('；') + '</div>';
      if (r.cosmic && r.cosmic.length) h += '<div class="cosmic"><div class="sec-h">宇宙尺度的消息<span>维度 ' + r.dim.toFixed(3) + ' · 累计降维 ' + r.dimStrikes + ' 次</span></div>' + r.cosmic.map(function (x) { return '<p><span class="num">' + fint(x.y) + '</span>' + esc(x.t) + '</p>'; }).join('') + '</div>';
      if (r.remote && r.remote.length) h += '<details class="more remote"><summary>远方的消息 · 只有光已传到这里的' + ICON.chev + '</summary>' + r.remote.map(function (x) { return '<div class="rm"><b>' + esc(x.name) + '</b><p>' + esc(x.t) + '</p></div>'; }).join('') + '</details>';
      if (u.ship.dead && !u.ship.dead.sealed) h += deadBox(u.ship.dead.cause);
      else if (u.ship.dead) h += '<div class="rp-end"><button class="btn-main" data-epi>走向结局</button></div>';
      else if (r.encounter) h += encounterHTML(r.encounter);
      h += '<div id="ruActRes"></div>';

      var el = layer('ru-report', '<div class="rp">' + h + '</div>');
      if (hp.hero) setTimeout(function () { cue(hp.hero.cls === 'good' ? 'card-good' : 'card-bad'); }, 500);
      var closed = false, acted = false;
      function close() { if (closed) return; closed = true; document.removeEventListener('keydown', key); closeLayer(el, 500).then(function () { resolve({ dead: !!u.ship.dead }); }); }
      function key(e) { if (e.key === 'Escape' && !qs('.ru-share')) { if (!acted && r.encounter && !u.ship.dead) choose('离开'); close(); } }
      document.addEventListener('keydown', key);
      qs('[data-close]', el).addEventListener('click', function () { if (!acted && r.encounter && !u.ship.dead) choose('离开'); close(); });
      qs('[data-share]', el).addEventListener('click', function () { H.share('report', { res: res }); });
      qsa('[data-epi]', el).forEach(function (b) { b.addEventListener('click', close); });
      function choose(k) {
        var ok = (r.encounter.options || []).some(function (x) { return x.id === k; });
        if (!ok) return null;
        acted = true;
        return H.interact(r.sysId, k);
      }
      qsa('.choice', el).forEach(function (b) {
        b.addEventListener('click', function () {
          if (acted) return;
          var k = b.getAttribute('data-opt');
          if (k === '离开') { choose(k); close(); return; }
          var res2 = choose(k); if (!res2) return;
          qsa('.choice', el).forEach(function (c) { c.disabled = true; c.classList.toggle('picked', c === b); c.classList.toggle('faded', c !== b); });
          var cv2 = u.systems[r.sysId].owner != null ? u.civs[u.systems[r.sysId].owner] : null;
          var remembers = cv2 && cv2.alive && !u.ship.dead && ['观察', '凝视', '考古', '拾荒'].indexOf(k) < 0;
          var ar = qs('#ruActRes', el);
          ar.innerHTML = '<div class="result ' + esc(res2.cls || '') + '"><div class="result-k">你选择了「' + esc(b.getAttribute('data-label')) + '」</div><p>' + esc(res2.t) + '</p>' +
            (remembers ? '<p class="mem">他们会记住你。几百年后回来，看看这份记忆变成了什么。</p>' : '') + '</div>' + (res2.ending ? endingHTML(res2.ending) : '') +
            (u.ship.dead && !(u.ship.dead.sealed) ? deadBox(u.ship.dead.cause) : res2.ending || u.ship.dead ? '<div class="rp-end"><button class="btn-main" data-epi>' + (res2.ending && res2.ending.state === 'won' ? '走向结局' : '继续') + '</button></div>' : '<div class="rp-end"><button class="btn-ghost" data-share2>' + ICON.share + '<span>分享这一刻</span></button><button class="btn-main" data-back>回到星图</button></div>');
          cue(res2.cls === 'bad' ? 'card-bad' : res2.cls === 'good' ? 'card-good' : 'select');
          var bk = qs('[data-back]', ar); if (bk) bk.addEventListener('click', close);
          var s2 = qs('[data-share2]', ar); if (s2) s2.addEventListener('click', function () { H.share('report', { res: res, choice: b.getAttribute('data-label'), result: res2 }); });
          qsa('[data-epi]', ar).forEach(function (x) { x.addEventListener('click', close); });
          if (H.afterInteract) H.afterInteract();
          setTimeout(function () { ar.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
        });
      });
    });
  };
  function endingHTML(en) {
    var won = en.state === 'won';
    return '<div class="ending ' + (won ? 'won' : 'lost') + '"><div class="en-k">' + (won ? '命运达成' : '命运落空') + '</div><div class="en-t">' + esc(en.head || en.title) + '</div><p>' + esc(en.text || '') + '</p></div>';
  }
  function deadBox(cause) {
    return '<div class="deadbox"><div class="dk">旅程终结</div><p>' + esc(cause) + '</p><button class="btn-main" data-epi>墓志铭</button></div>';
  }
  function encounterHTML(E) {
    var h = '<div class="enc"><div class="enc-h"><div class="enc-k">接触 · <b>' + esc(E.tier) + '</b>' + (E.scene ? '<span class="scene">' + esc(SCENE_NOTE[E.scene] || E.scene) + '</span>' : '') + '</div>';
    if (E.recog) h += '<div class="enc-n t-gold">他们认出了这艘船。</div>';
    if (E.gap != null) h += '<div class="enc-m"><span>科技 <b class="num">' + E.civTech.toFixed(0) + '</b> 对你的 <b class="num">' + E.shipTech.toFixed(0) + '</b></span><span>扩张欲 <b class="num">' + (E.exp * 100).toFixed(0) + '%</b></span><span>态度 <b>' + esc(SIM.attWord(E.att)) + '</b></span>' + (E.tag ? '<span>印象「' + esc(SIM.TAG_DESC[E.tag]) + '」</span>' : '') + '</div>';
    if (TIER_NOTE[E.tier]) h += '<div class="enc-n">' + esc(TIER_NOTE[E.tier]) + '</div>';
    h += '</div>' + (E.forced || []).map(function (f) { return para(f, 'forced'); }).join('');
    var opts = E.options || [];
    h += '<div class="choices">' + opts.map(function (o) {
      var risky = RISKY.test(o.desc || ''), quiet = QUIET.test(o.id) && !o.desc;
      return '<button class="choice' + (risky ? ' risky' : '') + (quiet ? ' quiet' : '') + '" data-opt="' + esc(o.id) + '" data-label="' + esc(o.label) + '"><b>' + esc(o.label) + '</b>' + (o.desc ? '<span>' + esc(o.desc) + '</span>' : '') + (risky ? '<em>高风险</em>' : '') + '</button>';
    }).join('') + '</div></div>';
    return h;
  }

  // ---------- 墓志铭 ----------
  UI.epitaph = function (S) {
    try { RU.audio.mood('silence'); } catch (e) { }
    return new Promise(function (resolve) {
      var u = H.u();
      var route = S.route.length > 7 ? S.route.slice(0, 3).concat(['…']).concat(S.route.slice(-3)) : S.route;
      var facts = [];
      if (S.foils) facts.push('见证了 <b class="num">' + S.foils + '</b> 次二向箔');
      facts.push(S.visited ? '到访 <b class="num">' + S.visited + '</b> 个星系' : '从未离开太阳');
      if (S.civs) facts.push('接触 <b class="num">' + S.civs + '</b> 个文明');
      if (S.echoes) facts.push('留下 <b class="num">' + S.echoes + '</b> 条回响');
      if (S.maxGamma > 1.01) facts.push('最高 γ <b class="num">' + fgam(S.maxGamma) + '</b>');
      var sp = yParts(S.shipYears);
      var en = S.ending, won = en && en.state === 'won', alive = !u.ship.dead;
      var kick = en ? (won ? '命运达成' : '命运落空') + ' · ' + esc(en.title) : '墓志铭';
      var el = layer('ru-epi' + (won ? ' won' : ''), '<div class="ep"><div class="ep-k' + (en ? ' en' : '') + '">' + kick + '</div><h1 class="ep-ship">' + esc(S.ship) + '</h1>' +
        '<div class="ep-nums"><div class="cool"><i>船上</i><span><b class="num">' + sp.v + '</b><u>' + sp.u + '</u></span></div><div class="sep"></div><div class="warm"><i>宇宙</i><span><b class="num">' + fint(S.cosmic) + '</b><u>年</u></span></div></div>' +
        '<div class="ep-facts">' + facts.join('<span>·</span>') + '</div>' +
        '<div class="ep-route">' + route.map(esc).join('<span>→</span>') + '</div>' +
        '<p class="ep-cause">' + esc(S.cause) + '</p>' +
        (S.homeLine && S.cause.indexOf('太阳') < 0 ? '<p class="ep-home">' + esc(S.homeLine) + '</p>' : '') +
        '<div class="ep-twin">' + UI.twinSVG(u, 520, 110) + '</div>' +
        '<div class="ep-seed">种子 <b class="num">' + esc(u.seed) + '</b> · 舰员 ' + S.age.toFixed(1) + ' 岁 · ' + yr(S.cosmic) + '</div>' +
        '<div class="ep-acts"><button class="btn-main" data-a="share">' + ICON.share + '<span>' + (alive ? '分享这一刻' : '分享这一生') + '</span></button>' + (alive ? '<button class="btn-ghost" data-a="continue">继续漫游</button>' : '') + '<button class="btn-ghost" data-a="restart">重温这个宇宙</button><button class="btn-ghost" data-a="new">新的宇宙</button></div></div>');
      qsa('[data-a]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-a');
          if (a === 'share') { H.share('epitaph', { stats: S }); return; }
          closeLayer(el, 700).then(function () { resolve(a); });
        });
      });
    });
  };
})();
