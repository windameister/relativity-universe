/* RU.share —— 「分享这一刻」（owner: ux）。
 * RU.share.open(kind, data)：kind = 'report' | 'home' | 'epitaph' | 'map'；data = { u, url, plan, res?, stats?, year?, choice?, result? }
 *   抓 3D 画面（RU.engine.capture），合成竖版 1080×1440 / 横版 1600×900 PNG 卡片；下载 / 复制图片 / 复制链接与文字 / 系统分享。
 * RU.share.offer(kind, data)：在关键时刻（家园被压平）先抓帧，弹出一枚「分享这一刻」的小胶囊。
 */
(function () {
  var RU = window.RU, U = RU.util;
  var S = RU.share = {};
  var SERIF = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
  var SANS = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif';
  var MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
  var COOL = '#9ad8ff', WARM = '#ffc59a', GOLD = '#f3d58a', DIM = 'rgba(200,210,230,0.62)', FAINT = 'rgba(200,210,230,0.36)';
  function F() { return RU.ui.fmt; }

  function capture() { try { return RU.engine.capture('image/png'); } catch (e) { return null; } }
  function loadImg(src) { return new Promise(function (res) { if (!src) return res(null); var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  function isDark(im) {
    try { var c = document.createElement('canvas'); c.width = 32; c.height = 18; var g = c.getContext('2d'); g.drawImage(im, 0, 0, 32, 18); var d = g.getImageData(0, 0, 32, 18).data, s = 0; for (var i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3 < 4; } catch (e) { return false; }
  }

  // ---------- 文案 ----------
  function build(kind, d) {
    var u = d.u, f = F(), ship = u.ship.name, o = { kind: kind, ship: ship, seed: u.seed, url: d.url };
    if (kind === 'report' && d.res) {
      var r = d.res.report, t = d.res.trip, sleep = t.from === t.to, revisit = !r.first && r.gap != null && !sleep;
      var a = revisit ? r.bioGap : t.bio, b = sleep ? t.arrive - t.depart : revisit ? r.gap : t.ext;
      var bText = sleep ? f.int(Math.round(b)) + ' 年' : (!revisit && t.d > 0) ? f.ext(b, t.d) : (b >= 100 ? f.int(b) + ' 年' : f.years(b));
      o.kicker = (sleep ? '从冬眠中醒来' : r.first ? '抵达' : '重返') + ' · ' + r.sysName;
      if (sleep) {
        o.head = '冬眠 ' + f.int(Math.round(b)) + ' 年，我只老了 ' + f.age(a) + '。';
        o.a = { label: '舰员衰老', v: f.ageParts(a) };
        o.b = { label: '宇宙 · 船上', v: { v: f.int(Math.round(b)), u: '年' } };
      } else {
        o.head = '对我只过了 ' + f.years(a) + '，' + (revisit ? '这里' : '宇宙') + '已过了 ' + bText + '。';
        o.a = { label: '船上', v: f.yParts(a) };
        o.b = { label: revisit ? '这里' : '宇宙', v: (!revisit && t.d > 0) ? f.extParts(b, t.d) : (b >= 100 ? { v: f.int(b), u: '年' } : f.yParts(b)) };
      }
      o.meta = [t.gamma > 1.01 ? 'γ ' + f.gamma(t.gamma) : t.label, f.yr(t.arrive), ship];
      var hp = RU.ui.pickHero(r.big);
      if (d.result) o.gold = '我选择了「' + d.choice + '」。' + d.result.t;
      else if (hp.hero) { o.goldT = hp.hero.title; o.gold = hp.hero.t; }
      else if (r.caused && r.caused.length) { o.goldT = '我留下的回响'; o.gold = r.caused[0]; }
      else if (r.lines && r.lines.length) o.gold = r.lines[0].t;
      var snip = o.gold ? (o.gold.length > 72 ? o.gold.slice(0, 71) + '…' : o.gold) : '';
      var qTxt = o.goldT && o.goldT !== '我留下的回响' ? '【' + o.goldT + '】' + snip : (snip ? (o.goldT ? o.goldT + '：' : '') + snip : '');
      o.text = '「' + ship + '」' + o.kicker.replace(' · ', '') + '：' + o.head + (qTxt ? '\n' + qTxt : '') + ' #相对论宇宙';
    } else if (kind === 'home') {
      var y = d.year != null ? d.year : u.systems[0].flatYear;
      o.kicker = '二向箔 · ' + f.yr(y);
      o.head = '太阳系被压成了一幅画。';
      o.a = { label: '船上', v: f.yParts(u.ship.shipYears) }; o.b = { label: '宇宙', v: { v: f.int(u.time), u: '年' } };
      o.meta = ['宇宙维度 ' + SIM.dimOf(u).toFixed(3), ship];
      o.gold = '我出发的地方——城市、海洋和每一个人——都被压进了一个无限薄的平面。而我在 ' + u.systems[u.ship.at].name + '，' + (u.ship.at === 0 ? '就在那里。' : '光年之外。');
      o.text = '纪元 ' + f.int(y) + ' 年，太阳系被二向箔压成了一幅画。我驾驶「' + ship + '」在宇宙里漂了 ' + f.years(u.ship.shipYears) + '。 #相对论宇宙';
    } else if (kind === 'epitaph') {
      var s = d.stats;
      o.center = true; o.kicker = s.ending ? (s.ending.state === 'won' ? '命运达成 · ' : '命运落空 · ') + s.ending.title : '墓志铭'; o.title = ship;
      o.a = { label: '船上', v: f.yParts(s.shipYears) }; o.b = { label: '宇宙', v: { v: f.int(s.cosmic), u: '年' } };
      var facts = []; if (s.foils) facts.push('见证了 ' + s.foils + ' 次二向箔'); facts.push(s.visited ? '到访 ' + s.visited + ' 个星系' : '从未离开太阳'); if (s.civs) facts.push('接触 ' + s.civs + ' 个文明'); if (s.echoes) facts.push('留下 ' + s.echoes + ' 条回响');
      o.facts = facts.join(' · ');
      o.route = s.route.length > 6 ? s.route.slice(0, 3).concat(['…']).concat(s.route.slice(-2)).join(' → ') : s.route.join(' → ');
      o.gold = s.cause;
      o.text = s.ending && s.ending.share ? s.ending.share + ' #相对论宇宙' : '「' + ship + '」· 船上 ' + f.years(s.shipYears) + ' · 宇宙 ' + f.int(s.cosmic) + ' 年 · ' + facts.join(' · ') + '。' + (s.homeLine ? s.homeLine : '') + ' #相对论宇宙';
    } else {
      o.kicker = '停泊于 ' + u.systems[u.ship.at].name;
      o.head = u.ship.trips.length ? '对我过了 ' + f.years(u.ship.shipYears) + '，宇宙已过了 ' + f.int(u.time) + ' 年。' : '你离开的每一秒，宇宙都在老去。';
      o.a = { label: '船上', v: f.yParts(u.ship.shipYears) }; o.b = { label: '宇宙', v: { v: f.int(u.time), u: '年' } };
      o.meta = [ship, '舰员 ' + (u.ship.crewAge0 + u.ship.bio).toFixed(1) + ' 岁'];
      o.text = '我在《相对论宇宙》里驾驶「' + ship + '」：' + o.head + ' #相对论宇宙';
    }
    if (d.url && !/^file:/i.test(d.url)) o.text += '\n复现这段旅程（种子 ' + u.seed + '）：' + d.url;
    else o.text += '\n宇宙种子：' + u.seed + '（同一种子 + 同样的选择 = 同一部宇宙史）';
    o.u = u;
    return o;
  }

  // ---------- 画布工具 ----------
  function font(g, size, fam, weight) { g.font = (weight || 400) + ' ' + size + 'px ' + fam; }
  function spacing(g, px) { if ('letterSpacing' in g) g.letterSpacing = px + 'px'; }
  function wrap(g, text, maxW, maxLines) {
    // 按「词」断行：连续的数字/拉丁字母（含 . , % γ）算一个词，中文逐字；标点不落行首
    var toks = String(text).match(/[0-9A-Za-z.,%:+\-−γ×]+|\s+|[\s\S]/g) || [], lines = [], cur = '';
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i], test = cur + tk;
      if (g.measureText(test).width > maxW && cur.trim()) {
        if (/^[，。、；：！？」』）,.!?]$/.test(tk)) { cur = test; continue; }
        lines.push(cur); cur = tk.replace(/^\s+/, '');
        if (lines.length === maxLines) { cur = ''; lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…'); return lines; }
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function cover(g, im, x, y, w, h) {
    var s = Math.max(w / im.width, h / im.height), iw = im.width * s, ih = im.height * s;
    g.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  function stars(g, W, H, seed) {
    var r = U.mulberry(U.hashStr(seed || 'ru'));
    var bg = g.createRadialGradient(W * 0.62, H * 0.32, 0, W * 0.62, H * 0.32, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#1a1730'); bg.addColorStop(0.45, '#0a0c18'); bg.addColorStop(1, '#020308');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 银河带
    g.save(); g.translate(W * 0.5, H * 0.38); g.rotate(-0.42);
    for (var k = 0; k < 3; k++) { var gr = g.createLinearGradient(0, -H * 0.22, 0, H * 0.22); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, ['rgba(140,150,220,0.10)', 'rgba(255,190,150,0.07)', 'rgba(120,200,255,0.05)'][k]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-W * 1.2, -H * 0.22, W * 2.4, H * 0.44); }
    g.restore();
    for (var i = 0; i < 1400; i++) {
      var x = r() * W, y = r() * H, m = Math.pow(r(), 6), t = r();
      g.fillStyle = t < 0.2 ? 'rgba(255,210,170,' + (0.25 + m) + ')' : t < 0.5 ? 'rgba(180,210,255,' + (0.25 + m) + ')' : 'rgba(255,255,255,' + (0.2 + m) + ')';
      var s2 = 0.6 + m * 2.6; g.fillRect(x, y, s2, s2);
      if (m > 0.5) { var gl = g.createRadialGradient(x, y, 0, x, y, 14 * m); gl.addColorStop(0, 'rgba(220,235,255,0.5)'); gl.addColorStop(1, 'rgba(220,235,255,0)'); g.fillStyle = gl; g.fillRect(x - 16, y - 16, 32, 32); }
    }
  }
  function twinLine(g, u, x, y, w, h) {
    var pts = [[0, 0]]; u.ship.trips.forEach(function (t) { pts.push([t.shipAfter, t.arrive]); });
    var last = pts[pts.length - 1], mx = Math.max(1, last[0]), my = Math.max(10, last[1]);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
    g.setLineDash([5, 7]); g.strokeStyle = 'rgba(255,255,255,0.28)'; var e = Math.min(mx, my); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * e / mx, y + h - h * e / my); g.stroke(); g.setLineDash([]);
    var gr = g.createLinearGradient(0, y + h, 0, y); gr.addColorStop(0, COOL); gr.addColorStop(1, WARM);
    g.strokeStyle = gr; g.lineWidth = 3; g.shadowColor = 'rgba(255,190,140,0.6)'; g.shadowBlur = 14; g.beginPath();
    pts.forEach(function (p, i) { var px = x + w * p[0] / mx, py = y + h - h * p[1] / my; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke(); g.shadowBlur = 0;
  }

  // ---------- 合成 ----------
  function render(o, im, orient) {
    var land = orient === 'land', W = land ? 1600 : 1080, Hh = land ? 900 : 1440;
    var c = document.createElement('canvas'); c.width = W; c.height = Hh; var g = c.getContext('2d');
    g.fillStyle = '#03040a'; g.fillRect(0, 0, W, Hh);
    var dark = !im || isDark(im);
    var imgH = land ? Hh : Math.round(Hh * (o.center ? 1 : 0.62));
    if (dark) stars(g, W, imgH, o.seed + o.kind); else cover(g, im, 0, 0, W, imgH);
    // 压暗与渐变
    var gr;
    if (land) {
      gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(2,3,8,0.94)'); gr.addColorStop(0.42, 'rgba(2,3,8,0.78)'); gr.addColorStop(0.7, 'rgba(2,3,8,0.15)'); gr.addColorStop(1, 'rgba(2,3,8,0.05)');
      g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    } else if (o.center) {
      g.fillStyle = 'rgba(2,3,8,0.55)'; g.fillRect(0, 0, W, Hh);
      gr = g.createRadialGradient(W / 2, Hh * 0.45, 0, W / 2, Hh * 0.45, Hh * 0.75); gr.addColorStop(0, 'rgba(2,3,8,0.1)'); gr.addColorStop(1, 'rgba(2,3,8,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    } else {
      gr = g.createLinearGradient(0, imgH * 0.45, 0, imgH); gr.addColorStop(0, 'rgba(3,4,10,0)'); gr.addColorStop(1, 'rgba(3,4,10,1)');
      g.fillStyle = gr; g.fillRect(0, 0, W, imgH);
      gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, 'rgba(3,4,10,0.7)'); gr.addColorStop(1, 'rgba(3,4,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, 240);
    }
    // 颗粒
    var r = U.mulberry(7); g.fillStyle = 'rgba(255,255,255,0.025)'; for (var i = 0; i < 9000; i++) g.fillRect(r() * W, r() * Hh, 1, 1);

    var M = land ? 80 : 76, x = M, colW = land ? 720 : W - M * 2;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    // 品牌
    font(g, land ? 28 : 32, SERIF); spacing(g, 10); g.fillStyle = '#fff'; g.fillText('相对论宇宙', x, land ? 92 : 104);
    font(g, 13, SANS, 500); spacing(g, 6); g.fillStyle = FAINT; g.fillText('RELATIVITY UNIVERSE', x, land ? 120 : 134);
    if (!land && !o.center && o.kicker) { g.textAlign = 'right'; font(g, 22, SERIF); spacing(g, 6); g.fillStyle = 'rgba(235,240,255,0.8)'; g.fillText(o.kicker, W - M, 104); g.textAlign = 'left'; }

    if (o.center && !land) return drawEpitaph(g, o, W, Hh, c);
    if (o.center && land) return drawEpitaphLand(g, o, W, Hh, c);

    // 先量高度，再自下而上排版，保证不压到页脚
    var lh = land ? 70 : 84, glh = land ? 38 : 46;
    font(g, land ? 50 : 60, SERIF); spacing(g, 3);
    var hl = wrap(g, o.head, colW, 3);
    font(g, land ? 22 : 27, SERIF); spacing(g, 1.5);
    var gl = o.gold ? wrap(g, o.gold, colW, o.goldT ? 3 : 4) : [];
    var total = (hl.length - 1) * lh + (land ? 64 : 84) + (land ? 86 : 112) + (o.meta ? (land ? 50 : 62) : 0) +
      (o.gold ? (land ? 56 : 76) + (o.goldT ? (land ? 44 : 54) : 0) + (gl.length - 1) * glh : 0);
    var bottom = Hh - (land ? 56 : 70) - (land ? 44 : 52) - (land ? 46 : 60);
    var y = Math.max(land ? 230 : Math.round(imgH * 0.55), bottom - total);
    if (land && o.kicker) { font(g, 22, SERIF); spacing(g, 6); g.fillStyle = 'rgba(235,240,255,0.75)'; g.fillText(o.kicker, x, y - 70); }
    // 标题句
    font(g, land ? 50 : 60, SERIF); spacing(g, 3); g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 20;
    hl.forEach(function (l, k) { g.fillText(l, x, y + k * lh); });
    g.shadowBlur = 0;
    y += (hl.length - 1) * lh + (land ? 64 : 84);
    // 数字：标签一行，数字一行
    var colX2 = x + (land ? 330 : 470), numY = y + (land ? 86 : 112);
    [[o.a, COOL, x], [o.b, WARM, colX2]].forEach(function (p) {
      font(g, land ? 18 : 22, SANS); spacing(g, 8); g.fillStyle = DIM; g.fillText(p[0].label, p[2], y);
      font(g, land ? 84 : 112, MONO, 200); spacing(g, -2); g.fillStyle = p[1];
      g.shadowColor = p[1]; g.shadowBlur = 30; g.fillText(p[0].v.v, p[2], numY); g.shadowBlur = 0;
      var w = g.measureText(p[0].v.v).width; font(g, land ? 22 : 28, SANS); spacing(g, 2); g.fillStyle = DIM; g.fillText(p[0].v.u, p[2] + w + 10, numY);
    });
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(colX2 - (land ? 40 : 60), y - 16); g.lineTo(colX2 - (land ? 40 : 60), numY + 6); g.stroke();
    y = numY;
    y += land ? 50 : 62;
    if (o.meta) { font(g, land ? 19 : 23, MONO); spacing(g, 2); g.fillStyle = DIM; g.fillText(o.meta.filter(Boolean).join('  ·  '), x, y); }
    y += land ? 56 : 76;
    if (o.gold) {
      if (o.goldT) { font(g, land ? 26 : 32, SERIF); spacing(g, 5); g.fillStyle = GOLD; g.fillText(o.goldT, x, y); y += land ? 44 : 54; }
      font(g, land ? 22 : 27, SERIF); spacing(g, 1.5); g.fillStyle = o.goldT ? 'rgba(243,226,180,0.82)' : GOLD;
      gl.forEach(function (l, k) { g.fillText(l, x, y + k * glh); });
    }
    footer(g, o, W, Hh, M, land);
    return c;
  }
  function drawEpitaph(g, o, W, Hh, c) {
    g.textAlign = 'center'; var cx = W / 2, y = 330;
    font(g, 22, SANS); spacing(g, 18); g.fillStyle = FAINT; g.fillText(o.kicker, cx + 9, y);
    y += 140; font(g, 120, SERIF); spacing(g, 36); g.fillStyle = '#fff'; g.shadowColor = 'rgba(160,200,255,0.5)'; g.shadowBlur = 50; g.fillText(o.title, cx + 18, y); g.shadowBlur = 0;
    y += 190;
    [[o.a, COOL, cx - 230], [o.b, WARM, cx + 230]].forEach(function (p) {
      font(g, 22, SANS); spacing(g, 12); g.fillStyle = DIM; g.fillText(p[0].label, p[2] + 6, y - 110);
      font(g, 104, MONO, 200); spacing(g, -2); g.fillStyle = p[1]; g.shadowColor = p[1]; g.shadowBlur = 30; g.fillText(p[0].v.v, p[2], y); g.shadowBlur = 0;
      font(g, 24, SANS); spacing(g, 2); g.fillStyle = DIM; g.fillText(p[0].v.u, p[2], y + 44);
    });
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, y - 120); g.lineTo(cx, y + 40); g.stroke();
    y += 130; font(g, 28, SANS); spacing(g, 3); g.fillStyle = '#e8ecf6'; wrap(g, o.facts, W - 180, 2).forEach(function (l, k) { g.fillText(l, cx, y + k * 46); });
    y += 70; font(g, 24, SERIF); spacing(g, 2); g.fillStyle = DIM; wrap(g, o.route, W - 200, 2).forEach(function (l, k) { g.fillText(l, cx, y + k * 40); });
    y += 110; font(g, 30, SERIF); spacing(g, 2); g.fillStyle = 'rgba(240,240,250,0.88)';
    var cl = wrap(g, o.gold || '', W - 220, 4); cl.forEach(function (l, k) { g.fillText(l, cx, y + k * 52); });
    twinLine(g, o.u, 200, Hh - 330, W - 400, 90);
    g.textAlign = 'left';
    footer(g, o, W, Hh, 76, false);
    return c;
  }
  function drawEpitaphLand(g, o, W, Hh, c) {
    var x = 80, y = 250;
    font(g, 20, SANS); spacing(g, 14); g.fillStyle = FAINT; g.fillText(o.kicker, x, y - 40);
    font(g, 92, SERIF); spacing(g, 26); g.fillStyle = '#fff'; g.shadowColor = 'rgba(160,200,255,0.5)'; g.shadowBlur = 40; g.fillText(o.title, x, y + 60); g.shadowBlur = 0;
    y += 230;
    [[o.a, COOL, x], [o.b, WARM, x + 330]].forEach(function (p) {
      font(g, 18, SANS); spacing(g, 10); g.fillStyle = DIM; g.fillText(p[0].label, p[2], y - 80);
      font(g, 80, MONO, 200); spacing(g, -2); g.fillStyle = p[1]; g.shadowColor = p[1]; g.shadowBlur = 26; g.fillText(p[0].v.v, p[2], y); g.shadowBlur = 0;
      var w = g.measureText(p[0].v.v).width; font(g, 22, SANS); g.fillStyle = DIM; g.fillText(p[0].v.u, p[2] + w + 10, y);
    });
    y += 60; font(g, 22, SANS); spacing(g, 2); g.fillStyle = '#e8ecf6'; g.fillText(o.facts, x, y);
    y += 50; font(g, 22, SERIF); spacing(g, 1); g.fillStyle = 'rgba(240,240,250,0.85)'; wrap(g, o.gold || '', 700, 3).forEach(function (l, k) { g.fillText(l, x, y + k * 36); });
    footer(g, o, W, Hh, 80, true);
    return c;
  }
  function footer(g, o, W, Hh, M, land) {
    var y = Hh - (land ? 56 : 70);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(M, y - (land ? 44 : 52)); g.lineTo(W - M, y - (land ? 44 : 52)); g.stroke();
    font(g, land ? 17 : 20, MONO); spacing(g, 1); g.fillStyle = DIM; g.textAlign = 'left';
    g.fillText('种子 ' + o.seed + ' · 同样的选择 = 同一部宇宙史', M, y);
    font(g, land ? 18 : 21, SERIF); spacing(g, 4); g.fillStyle = 'rgba(235,240,255,0.7)'; g.textAlign = 'right';
    g.fillText('你离开的每一秒，宇宙都在老去。', W - M, y);
    g.textAlign = 'left';
  }

  // ---------- 弹窗 ----------
  var cur = null;
  S.open = function (kind, data, shot) {
    var o = build(kind, data);
    var frame = shot || capture();
    var orient = window.innerWidth < 760 ? 'port' : (kind === 'epitaph' ? 'port' : 'port');
    var I = RU.ui.ICON;
    var el = RU.ui.layer('ru-share', '<button class="ico sh-x" data-x>' + I.x + '</button><div class="sh"><div class="sh-prev"><span class="sh-wait">正在冲印……</span><img alt=""></div>' +
      '<div class="sh-side"><div class="sh-k">分享这一刻</div><div class="sh-t">' + U.esc(kind === 'epitaph' ? o.ship + ' 的一生' : kind === 'home' ? '家园被压平' : o.kicker || o.ship) + '</div>' +
      '<div class="sh-tabs"><button data-o="port" class="on">竖版</button><button data-o="land">横版</button></div>' +
      '<div class="sh-btns">' + (canShareFiles() ? '<button class="btn-main" data-a="native">' + I.share + '<span>分享到…</span></button>' : '') +
      '<button class="' + (canShareFiles() ? 'btn-ghost' : 'btn-main') + '" data-a="dl">保存图片</button><button class="btn-ghost" data-a="copyimg">复制图片</button><button class="btn-ghost" data-a="copytxt">复制链接与文字</button></div>' +
      '<div class="sh-txt">' + U.esc(o.text) + '</div></div></div>');
    var img = el.querySelector('.sh-prev img'), canvas = null, imP = loadImg(frame);
    cur = el;
    function draw(or) {
      orient = or;
      el.querySelectorAll('[data-o]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-o') === or); });
      return imP.then(function (im) {
        try { canvas = render(o, im, or); img.src = canvas.toDataURL('image/png'); el.querySelector('.sh-wait').style.display = 'none'; }
        catch (err) { console.error(err); el.querySelector('.sh-wait').textContent = '冲印失败：' + err.message; }
      });
    }
    draw(orient === 'land' ? 'land' : 'port');
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('[data-x]')) { RU.ui.closeLayer(el, 400); cur = null; return; }
      var ob = e.target.closest('[data-o]'); if (ob) { draw(ob.getAttribute('data-o')); return; }
      var ab = e.target.closest('[data-a]'); if (!ab || !canvas) return;
      var a = ab.getAttribute('data-a'), name = 'relativity-universe-' + o.seed + '-' + kind + '.png';
      if (a === 'dl') toBlob(canvas).then(function (b) { var url = URL.createObjectURL(b), l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); RU.ui.toast('图片已保存'); });
      else if (a === 'copyimg') toBlob(canvas).then(function (b) {
        if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) { RU.ui.toast('这个浏览器不支持复制图片，请用「保存图片」'); return; }
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { RU.ui.toast('图片已复制，可以直接粘贴'); }, function () { RU.ui.toast('复制失败，请用「保存图片」'); });
      });
      else if (a === 'copytxt') RU.ui.copyText(o.text).then(function () { RU.ui.toast('链接与文字已复制'); });
      else if (a === 'native') toBlob(canvas).then(function (b) {
        var file = new File([b], name, { type: 'image/png' });
        navigator.share({ files: [file], text: o.text, title: '相对论宇宙' }).catch(function () { });
      });
    });
    return el;
  };
  function toBlob(c) { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/png'); }); }
  function canShareFiles() { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; } }

  /** 关键时刻：先抓帧，再弹一枚小胶囊（8 秒后自动消失） */
  S.offer = function (kind, data) {
    var shot = capture(), st = RU.state.game;
    var txt = kind === 'home' ? '太阳系被压成了一幅画' : '这一刻值得被记住';
    var el = U.el('div', 'sh-offer', '<span>' + txt + '</span><button class="btn-main">' + RU.ui.ICON.share + '<span>分享这一刻</span></button>');
    el.querySelector('button').addEventListener('click', function () {
      el.remove();
      S.open(kind, Object.assign({ u: st.u, url: RU.state.planUrl(), plan: RU.state.planStr() }, data || {}), shot);
    });
    setTimeout(function () { el.style.transition = 'opacity .8s'; el.style.opacity = 0; setTimeout(function () { el.remove(); }, 900); }, 9000);
  };
  S.render = render; S.build = build;
})();
