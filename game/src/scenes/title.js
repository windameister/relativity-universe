/* 场景：title —— 开场电影 + 标题菜单（cinema）。
 *
 * enter({}) → Promise：点「开始」resolve { seed }；点「先看一段：二向箔」resolve { action: 'demo-foil' }。
 * 时间轴（t 的纯函数，?scene=title&t=秒 可冻结）：
 *   0–8.5   黑场，两句宋体旁白
 *   8.5–15  近地轨道：太阳从弧形地平线后升起
 *   15–24   镜头按对数尺度急速后拉：地球 → 月球 → 行星轨道 → 太阳缩成一颗星 → 近邻恒星 → 整条银河
 *   23+     标题、开始 / 种子 / 二向箔演示
 * 任意键 / 点击跳到标题。variant: 'gallery' 是行星画廊（调试，&focus=earth&dist=3）。
 *
 * 多尺度：位置以「地球半径」为单位在 JS 双精度里算，每帧按 k = 1/D 缩放；太远的物体按相同角大小拉回 IMP 以内。
 */
(function () {
  var RU = window.RU, T = window.THREE, U = RU.util;
  var LY = 1.4849e9, AU = 23481, R_SUN = 109.2, IMP = 400;
  var T_TITLE = 23.0, T_PULL0 = 15.0, T_PULL1 = 24.0, L_END = 14.12;
  var SUN_POS = new T.Vector3(AU, 0, 0);
  var GAL_C = new T.Vector3(-26000, 0, 9000).multiplyScalar(LY);
  var U_END = new T.Vector3(0.18, 0.78, 0.6).normalize();

  var PTS_V = [
    'attribute float aSize; attribute vec3 aCol; uniform float uScale, uFade, uPix, uMax; varying vec3 vCol;',
    'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;',
    ' float d=max(-mv.z,1e-6); float s=aSize*uScale/d*uPix;',
    ' gl_PointSize=clamp(s, 1.0, uMax);',
    ' float dim=clamp(s,0.0,1.0);',
    ' vCol=aCol*uFade*dim*dim; }'].join('\n');
  var PTS_F = 'varying vec3 vCol; void main(){ vec2 q=gl_PointCoord-0.5; float d=dot(q,q); if(d>0.25) discard; gl_FragColor=vec4(vCol*exp(-d*14.0),1.0); }';
  var DUST_F = 'varying vec3 vCol; void main(){ vec2 q=gl_PointCoord-0.5; float d=dot(q,q); if(d>0.25) discard; gl_FragColor=vec4(vCol*exp(-d*8.0),1.0); }';

  function pointsMat(dust) {
    return new T.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uFade: { value: 1 }, uPix: { value: 1 }, uMax: { value: dust ? 8 : 3.2 } }, vertexShader: PTS_V, fragmentShader: dust ? DUST_F : PTS_F,
      transparent: true, depthWrite: false, depthTest: false,
      blending: dust ? T.CustomBlending : T.AdditiveBlending, blendSrc: T.ZeroFactor, blendDst: T.OneMinusSrcColorFactor
    });
  }
  function pointsObj(pos, col, sz, dust) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aCol', new T.BufferAttribute(col, 3)); g.setAttribute('aSize', new T.BufferAttribute(sz, 1));
    var p = new T.Points(g, pointsMat(dust)); p.frustumCulled = false; return p;
  }

  // 程序化银河（单位：光年，太阳在原点）
  function buildGalaxy() {
    var r = U.mulberry(20251120), N = 195000, ND = 45000;
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
    var dpos = new Float32Array(ND * 3), dcol = new Float32Array(ND * 3), dsz = new Float32Array(ND);
    var gc = GAL_C.clone().divideScalar(LY), pitch = Math.tan(19 * Math.PI / 180), r0 = 4200, bar = 0.5;
    function put(arr, i, x, y, z) { var c = Math.cos(bar), s = Math.sin(bar); arr[i * 3] = gc.x + x * c - z * s; arr[i * 3 + 1] = y; arr[i * 3 + 2] = gc.z + x * s + z * c; }
    for (var i = 0; i < N; i++) {
      var k = r(), x, y, z, cr, cg, cb, s;
      if (k < 0.16) {
        x = U.gauss(r) * 3200; z = U.gauss(r) * 1400; y = U.gauss(r) * 1100;
        cr = 1.0; cg = 0.78; cb = 0.48; s = 240;
        var m = 0.35 + r() * 0.4; cr *= m; cg *= m; cb *= m;
      } else {
        var rr = 2200 + -Math.log(1 - r() * 0.985) * 11200; if (rr > 54000) rr = 54000 * r();
        var arm = Math.floor(r() * 4), major = arm % 2 === 0;
        var inArm = k < 0.68, spur = !inArm && k < 0.80;
        var wobble = 0.14 * Math.sin(rr * 0.00022 + arm * 1.9) + 0.07 * Math.cos(rr * 0.00051 - arm);
        var spread = major ? (0.18 + 0.14 * (rr / 45000)) : (0.30 + 0.18 * (rr / 45000));
        var th;
        if (inArm) th = arm * Math.PI / 2 + Math.log(rr / r0) / pitch + wobble + U.gauss(r) * spread;
        else if (spur) th = arm * Math.PI / 2 + Math.log(rr / r0) / (pitch * 1.45) + 0.45 + U.gauss(r) * 0.28;
        else th = r() * Math.PI * 2;
        x = Math.cos(th) * rr; z = Math.sin(th) * rr;
        if (inArm && r() < 0.30) {   // 星团结块：沿旋臂和支臂的亮团
          var ci = Math.floor(r() * 320), cr2 = 3000 + (U.hashStr('c' + ci) % 1000) / 1000 * 44000;
          var ca = (ci % 4) * Math.PI / 2 + Math.log(cr2 / r0) / pitch + 0.14 * Math.sin(cr2 * 0.00022 + (ci % 4) * 1.9);
          x = Math.cos(ca) * cr2 + U.gauss(r) * 950; z = Math.sin(ca) * cr2 + U.gauss(r) * 950; rr = cr2;
        }
        y = U.gauss(r) * (inArm ? 280 : 460) * (1 + rr / 40000);
        var radT = U.smoothstep(4000, 34000, rr);   // 内核暖金 → 外臂冷蓝
        var young = (inArm ? (major ? 0.9 : 0.65) : 0.25) * (0.35 + 0.65 * radT);
        cr = U.lerp(1.0, 0.50, young); cg = U.lerp(0.80, 0.72, young); cb = U.lerp(0.52, 1.0, young);
        var fall = Math.exp(-rr / 25000) * 0.9 + 0.25;
        cr *= fall; cg *= fall; cb *= fall;
        s = inArm ? 215 : (spur ? 260 : 320);
        if (!inArm && !spur) { cr *= 0.65; cg *= 0.65; cb *= 0.72; }   // 臂间微弱弥散星雾
        if (inArm && r() < 0.016) { cr = 1.5; cg = 0.38; cb = 0.58; s = 380; }
        if (inArm && r() < 0.012) { cr = 1.1; cg = 1.35; cb = 1.95; s = 330; }
      }
      put(pos, i, x, y, z);
      var b = 0.16; col[i * 3] = cr * b; col[i * 3 + 1] = cg * b; col[i * 3 + 2] = cb * b; sz[i] = s;
    }
    for (var j = 0; j < ND; j++) {
      var rr2 = 3500 + r() * 40000, arm2 = Math.floor(r() * 4);
      var wob2 = 0.14 * Math.sin(rr2 * 0.00022 + arm2 * 1.9);
      var th2 = arm2 * Math.PI / 2 + Math.log(rr2 / r0) / pitch + wob2 - 0.15 + U.gauss(r) * 0.09;
      put(dpos, j, Math.cos(th2) * rr2, U.gauss(r) * 120, Math.sin(th2) * rr2);
      var a = 0.18 + r() * 0.18; dcol[j * 3] = a * 0.8; dcol[j * 3 + 1] = a; dcol[j * 3 + 2] = a * 1.15; dsz[j] = 440 + r() * 320;
    }
    return { stars: pointsObj(pos, col, sz, false), dust: pointsObj(dpos, dcol, dsz, true) };
  }
  // 近邻恒星（光年，太阳在原点）
  function buildLocal() {
    var r = U.mulberry(77), N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
    var types = [[3200, 0.55], [4500, 0.22], [5800, 0.12], [7500, 0.07], [12000, 0.04]];
    for (var i = 0; i < N; i++) {
      var d = 4 + Math.pow(r(), 0.5) * 2200, a = r() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = U.gauss(r) * 260; pos[i * 3 + 2] = Math.sin(a) * d;
      var q = r(), acc = 0, tk = 5800, lum = 1;
      for (var t = 0; t < types.length; t++) { acc += types[t][1]; if (q < acc) { tk = types[t][0]; lum = Math.pow(tk / 5800, 3); break; } }
      var c = U.blackbodyColor(tk), b = 0.5 + Math.min(2.5, lum) * 0.6;
      col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b; sz[i] = 0.9 + Math.min(2, lum) * 0.8;
    }
    return pointsObj(pos, col, sz, false);
  }
  function starburstTex() {
    return U.canvasTex(512, 512, function (g) {
      U.radial(g, 256, 256, 256, [[0, 'rgba(255,250,240,1)'], [0.03, 'rgba(255,240,210,0.9)'], [0.12, 'rgba(255,200,140,0.25)'], [0.4, 'rgba(255,160,90,0.05)'], [1, 'rgba(0,0,0,0)']]);
      g.globalCompositeOperation = 'lighter';
      var gr = g.createLinearGradient(0, 256, 512, 256);
      gr.addColorStop(0, 'rgba(120,170,255,0)'); gr.addColorStop(0.5, 'rgba(210,230,255,0.85)'); gr.addColorStop(1, 'rgba(120,170,255,0)');
      g.fillStyle = gr; g.fillRect(0, 253, 512, 6);
      for (var i = 0; i < 6; i++) {
        g.save(); g.translate(256, 256); g.rotate(i * Math.PI / 3 + 0.3);
        var l = g.createLinearGradient(0, 0, 230, 0); l.addColorStop(0, 'rgba(255,235,200,0.45)'); l.addColorStop(1, 'rgba(255,235,200,0)');
        g.fillStyle = l; g.beginPath(); g.moveTo(0, -2.2); g.lineTo(230, 0); g.lineTo(0, 2.2); g.fill(); g.restore();
      }
    });
  }

  RU.__titleParts = { buildGalaxy: buildGalaxy, buildLocal: buildLocal, starburstTex: starburstTex,
    C: { LY: LY, AU: AU, R_SUN: R_SUN, IMP: IMP, T_TITLE: T_TITLE, T_PULL0: T_PULL0, T_PULL1: T_PULL1, L_END: L_END, SUN_POS: SUN_POS, GAL_C: GAL_C, U_END: U_END } };
})();

(function () {
  var RU = window.RU, T = window.THREE, U = RU.util, PT = RU.__titleParts, C = PT.C;
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };

  RU.defineScene('title', function (E) {
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(42, 1, 0.002, 6000);
    var built = false, earth, moon, sun, flare, orbits, local, gal, coreGlow, backdrop = null;
    var gallery = null, glist = [];
    var root = null, els = {}, resolveFn = null, done = false, keyH = null, clickH = null, offset = 0, variant = null, lastT = -1;
    var MOON_POS = V(-0.3, 0.35, 0.89).normalize().multiplyScalar(60.3);

    function build() {
      if (built) return; built = true;
      earth = RU.fx.planets.create('earth', { radius: 1, segments: 320, tilt: 0.25, spin0: 2.2, spinRate: 0.004 });
      moon = RU.fx.planets.create('moon', { radius: 0.273, segments: 96 });
      sun = RU.fx.planets.create('sun', { radius: C.R_SUN, segments: 128 });
      [earth, moon, sun].forEach(function (p) { p.group.matrixAutoUpdate = true; scene.add(p.group); });
      flare = new T.Sprite(new T.SpriteMaterial({ map: PT.starburstTex(), transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, color: 0xffffff }));
      flare.renderOrder = 30; scene.add(flare);
      orbits = new T.Group();
      [0.39, 0.72, 1, 1.52, 5.2, 9.58, 19.2, 30.1].forEach(function (a) {
        var pts = []; for (var i = 0; i <= 256; i++) { var th = i / 256 * Math.PI * 2; pts.push(V(Math.cos(th) * a * C.AU, 0, Math.sin(th) * a * C.AU)); }
        var l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending }));
        l.frustumCulled = false; orbits.add(l);
      });
      scene.add(orbits);
      local = PT.buildLocal(); local.renderOrder = 2; scene.add(local);
      gal = PT.buildGalaxy(); gal.stars.renderOrder = 2; gal.dust.renderOrder = 3; scene.add(gal.stars); scene.add(gal.dust);
      coreGlow = new T.Sprite(new T.SpriteMaterial({ map: U.glowTex(), color: 0xffd9a0, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending }));
      coreGlow.renderOrder = 1; scene.add(coreGlow);
      if (RU.fx.sky && RU.fx.sky.get) { try { backdrop = RU.fx.sky.get(E.renderer).createBackdrop({ intensity: 1, stars: 1 }); scene.add(backdrop); } catch (err) { console.error(err); } }
    }
    function buildGallery() {
      gallery = new T.Group(); scene.add(gallery);
      ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].forEach(function (k, i) {
        var p = RU.fx.planets.create(k, { radius: k === 'sun' ? 1.3 : 1 });
        p.group.position.set((i % 5 - 2) * 3.4, i < 5 ? 1.7 : -1.7, 0); gallery.add(p.group); glist.push(p);
      });
    }

    // ---------------- 镜头（纯函数） ----------------
    var L0 = Math.log10(1.12);
    function sunrise(tt) {
      var d = U.lerp(33, 19, U.seg(tt, 8, 16)) * Math.PI / 180, ph = Math.PI / 2 + d;
      var up = V(Math.cos(ph), Math.sin(ph), 0), c = up.clone().multiplyScalar(1.12);
      var h = V(1, 0, -0.32); h.sub(up.clone().multiplyScalar(h.dot(up))).normalize();
      var fwd = h.multiplyScalar(Math.cos(0.36)).sub(up.clone().multiplyScalar(Math.sin(0.36)));
      return { pos: c, tgt: c.clone().add(fwd), up: up };
    }
    function Lof(tt) { var s = U.seg(tt, C.T_PULL0, C.T_PULL1); s = s * s * s * (s * (s * 6 - 15) + 10); return L0 + (C.L_END - L0) * s; }
    function cam(tt) {
      var sr = sunrise(Math.min(tt, C.T_PULL0));
      if (tt < C.T_PULL0) return { pos: sr.pos, tgt: sr.tgt, up: sr.up, L: L0, F: V(0, 0, 0) };
      var L = Lof(tt), D = Math.pow(10, L);
      var d0 = sr.pos.clone().normalize(), w = U.smoothstep(0.25, 5.0, L);
      var uEnd = C.U_END.clone().applyAxisAngle(V(0, 1, 0), -Math.max(0, tt - C.T_PULL1) * 0.016);
      var dir = d0.clone().lerp(V(0.75, 0.45, 0.5).normalize(), U.smoothstep(0.1, 1.8, L)).normalize().lerp(uEnd, U.smoothstep(2.6, 6.0, L)).normalize();
      var wG = U.smoothstep(11.5, 14.2, L), wS = U.smoothstep(3.6, 5.6, L);
      var F = V(0, 0, 0).lerp(C.SUN_POS, wS).lerp(C.GAL_C, wG);
      var pos = F.clone().add(dir.clone().multiplyScalar(D));
      var w2 = U.smoothstep(0.0, 1.1, L - L0);
      var tgt = sr.tgt.clone().lerp(F, w2);
      var up = sr.up.clone().lerp(V(0, 1, 0), U.smoothstep(0.4, 4.0, L)).normalize();
      return { pos: pos, tgt: tgt, up: up, L: L, F: F };
    }

    // 世界（地球半径） → 渲染坐标；太远则按角大小拉回
    var cp = new T.Vector3(), kk = 1;
    function place(obj, X, size) {
      var v = X.clone().sub(cp).multiplyScalar(kk), d = v.length(), s = size * kk;
      if (d > C.IMP) { var f = C.IMP / d; v.multiplyScalar(f); s *= f; }
      obj.position.copy(v); obj.scale.setScalar(s); return v;
    }

    // ---------------- DOM ----------------
    var LINES = [
      [0.8, 4.3, '光速，是这个宇宙里唯一不容商量的法律。'],
      [4.7, 8.3, '你每一次靠近它，宇宙都替你老去。'],
      [10.2, 14.2, '而你离开以后，世界不会等你。']
    ];
    function randSeed() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 8; i++) { s += a[Math.floor(Math.random() * a.length)]; if (i === 3) s += '-'; } return s; }
    function buildDom() {
      root = U.el('div', 'title-root', '');
      root.style.cssText = 'position:fixed;inset:0;z-index:12;pointer-events:none';
      els.black = U.el('div', '', '', root); els.black.style.cssText = 'position:absolute;inset:0;background:#000';
      els.lines = LINES.map(function (l) {
        var d = U.el('div', 'cine-line', U.esc(l[2]), root);
        d.style.cssText = 'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0;letter-spacing:.2em;text-shadow:0 0 18px rgba(0,0,0,.9)';
        return d;
      });
      els.lines[2].style.top = '78%';
      els.hint = U.el('div', 'cine-small', '按任意键跳过', root);
      els.hint.style.cssText = 'position:absolute;right:3vw;bottom:3vh;opacity:.0;font-size:11px;letter-spacing:.3em';
      els.shade = U.el('div', '', '', root); els.shade.style.cssText = 'position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 22%, rgba(0,0,0,.45) 75%), linear-gradient(to bottom, rgba(0,0,0,.68), rgba(0,0,0,.22) 28%, rgba(0,0,0,0) 44%, rgba(0,0,0,0) 64%, rgba(0,0,0,.62) 84%, rgba(0,0,0,.8))';
      els.title = U.el('div', '', '', root);
      els.title.style.cssText = 'position:absolute;left:0;right:0;top:8.5vh;text-align:center;opacity:0;padding:0 5vw';
      els.title.innerHTML = '<div class="cine-title" style="font-size:clamp(30px,6.2vw,84px);letter-spacing:clamp(.18em,1.1vw,.42em);padding-left:clamp(.18em,1.1vw,.42em);text-shadow:0 2px 24px rgba(0,0,0,.9),0 0 40px rgba(150,190,255,.35)">相对论宇宙</div>' +
        '<div class="cine-small" style="margin-top:16px;letter-spacing:clamp(.28em,1.3vw,.85em);padding-left:clamp(.28em,1.3vw,.85em);color:rgba(220,230,255,.78);text-shadow:0 1px 12px rgba(0,0,0,.95)">RELATIVITY UNIVERSE</div>' +
        '<div style="margin-top:20px;font-family:var(--serif);font-size:clamp(13px,1.3vw,16px);letter-spacing:clamp(.12em,.8vw,.30em);color:rgba(232,238,255,.76);text-shadow:0 1px 14px rgba(0,0,0,.98),0 0 6px rgba(0,0,0,.95)">你离开的每一秒，宇宙都在老去。</div>';
      els.menu = U.el('div', '', '', root);
      els.menu.style.cssText = 'position:absolute;left:0;right:0;bottom:9vh;display:flex;flex-direction:column;align-items:center;gap:12px;opacity:0;pointer-events:none';
      var btn = 'font:15px var(--sans);letter-spacing:.5em;padding:13px 34px 13px calc(34px + .5em);border-radius:2px;cursor:pointer;transition:all .3s ease;';
      els.menu.innerHTML =
        '<button data-a="start" style="' + btn + 'background:rgba(160,200,255,.10);color:#eef3ff;border:1px solid rgba(180,210,255,.45);box-shadow:0 0 24px rgba(120,170,255,.15)">开始旅程</button>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:2px"><span class="cine-small" style="font-size:11px">宇宙种子</span>' +
        '<input data-a="seed" spellcheck="false" placeholder="留空则随机" style="width:170px;background:rgba(10,14,26,.55);border:1px solid rgba(160,190,255,.2);color:#dfe7ff;font:13px var(--mono);letter-spacing:.12em;padding:7px 10px;border-radius:2px;outline:none;text-align:center"></div>' +
        '<button data-a="foil" style="' + btn + 'font-size:12px;letter-spacing:.35em;padding:9px 20px 9px calc(20px + .35em);background:rgba(12,18,34,.45);color:rgba(225,235,255,.86);border:1px solid rgba(170,200,255,.32)">先看一段：二向箔</button>';
      var seedIn = els.menu.querySelector('[data-a=seed]');
      var p0 = E.params.get('seed'); if (p0) seedIn.value = p0;
      els.menu.querySelectorAll('button').forEach(function (b) {
        b.onmouseenter = function () { RU.audio.cue('ui-hover'); b.style.borderColor = 'rgba(200,225,255,.8)'; b.style.color = '#fff'; };
        b.onmouseleave = function () { b.style.borderColor = b.dataset.a === 'start' ? 'rgba(180,210,255,.45)' : 'rgba(170,200,255,.32)'; b.style.color = b.dataset.a === 'start' ? '#eef3ff' : 'rgba(225,235,255,.86)'; };
        b.onclick = function (e) {
          e.stopPropagation(); RU.audio.unlock(); RU.audio.cue('ui-click');
          if (b.dataset.a === 'start') finish({ seed: (seedIn.value || '').trim() || randSeed() });
          else finish({ action: 'demo-foil' });
        };
      });
      seedIn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { RU.audio.cue('ui-click'); finish({ seed: seedIn.value.trim() || randSeed() }); } });
      els.mark = U.el('div', 'cine-small', '<span style="display:inline-block;width:9px;height:9px;border:1px solid rgba(160,210,255,.9);border-radius:50%;box-shadow:0 0 8px rgba(140,200,255,.8);flex:none"></span><span>太阳 · 你在这里</span>', root);
      els.mark.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;opacity:0;font-size:10px;letter-spacing:.25em;white-space:nowrap;color:rgba(190,215,255,.85);transform:translate(-5px,-50%)';
    }
    function finish(res) { if (done) return; done = true; if (resolveFn) { var r = resolveFn; resolveFn = null; r(res); } }
    function skip(tNow) { if (tNow + offset < C.T_TITLE - 0.5) { offset = C.T_TITLE - 0.5 - tNow; RU.audio.unlock(); } }

    // ---------------- 每帧 ----------------
    var tmpV = new T.Vector3();
    function apply(tt) {
      var c = cam(tt);
      cp.copy(c.pos); kk = 1 / Math.max(c.pos.distanceTo(c.F), 1e-6);
      if (tt < C.T_PULL0) kk = 1;
      var asp = E.size.w / Math.max(1, E.size.h); var f0 = asp < 1 ? 42 + (1 - asp) * 68 : 42; if (Math.abs(camera.fov - f0) > 0.1) { camera.fov = f0; camera.updateProjectionMatrix(); }
      camera.position.set(0, 0, 0); camera.up.copy(c.up);
      camera.lookAt(tmpV.copy(c.tgt).sub(cp).multiplyScalar(kk));
      var L = c.L;

      var sunR = place(sun.group, C.SUN_POS, 1);
      var eR = place(earth.group, V(0, 0, 0), 1);
      place(moon.group, MOON_POS, 1);
      [earth, moon].forEach(function (p) { p.setSun(sunR, 1.25); p.update(tt); });
      sun.update(tt);
      earth.group.visible = L < 5.5; moon.group.visible = L < 5.5;
      sun.group.visible = L < 9.5;

      // 日出星芒：太阳露出地平线的程度
      var vis = 0;
      if (tt < C.T_PULL0 + 3) {
        var toS = C.SUN_POS.clone().sub(cp).normalize(), oc = cp.clone().negate(), tca = oc.dot(toS);
        var b = Math.sqrt(Math.max(0, oc.lengthSq() - tca * tca));
        vis = tca < 0 ? 1 : U.smoothstep(0.995, 1.03, b);
      }
      var star = U.smoothstep(6.5, 8.0, L) * (1 - U.smoothstep(10.5, 12.0, L));
      flare.position.copy(sunR).setLength(Math.min(sunR.length(), C.IMP * 0.9));
      var fd = flare.position.length();
      flare.scale.setScalar(fd * (0.24 * vis + 0.05 * star) + 1e-6);
      flare.material.opacity = Math.max(vis * U.seg(tt, 9.0, 11.0), star * 0.9);
      flare.visible = flare.material.opacity > 0.002;

      // 轨道
      var ob = U.smoothstep(3.7, 4.7, L) * (1 - U.smoothstep(6.8, 7.8, L));
      orbits.visible = ob > 0.001;
      orbits.position.copy(C.SUN_POS).sub(cp).multiplyScalar(kk); orbits.scale.setScalar(kk);
      orbits.children.forEach(function (l, i) { l.material.opacity = ob * (i === 2 ? 0.55 : 0.28); });

      // 近邻恒星 / 银河
      var pix = E.size.h * E.dpr / (2 * Math.tan(camera.fov * Math.PI / 360));
      var lf = U.smoothstep(8.2, 9.6, L) * (1 - U.smoothstep(12.6, 13.8, L));
      local.visible = lf > 0.001;
      local.position.copy(cp).negate().multiplyScalar(kk); local.scale.setScalar(kk * C.LY);
      local.material.uniforms.uScale.value = 0.0028; local.material.uniforms.uPix.value = pix; local.material.uniforms.uFade.value = lf;
      var gf = U.smoothstep(10.8, 12.6, L);
      [gal.stars, gal.dust].forEach(function (g) {
        g.visible = gf > 0.001;
        g.position.copy(cp).negate().multiplyScalar(kk); g.scale.setScalar(kk * C.LY);
        g.rotation.y = 0;
        g.material.uniforms.uScale.value = kk * C.LY; g.material.uniforms.uPix.value = pix; g.material.uniforms.uFade.value = gf;
      });
      place(coreGlow, C.GAL_C, 26000 * C.LY);
      coreGlow.material.opacity = gf * 0.55; coreGlow.visible = gf > 0.001;
      if (backdrop && backdrop.setIntensity) {
        var sk = U.smoothstep(8.0, 10.0, tt) * (1 - U.smoothstep(9.2, 11.2, L));
        backdrop.setIntensity(sk * 0.9, sk); backdrop.visible = sk > 0.001;
      }
      if (backdrop && RU.fx.sky.get(E.renderer).update) RU.fx.sky.get(E.renderer).update(camera, tt);

      // DOM
      if (!root) return;
      els.black.style.opacity = (1 - U.seg(tt, 8.0, 9.8)).toFixed(3);
      LINES.forEach(function (l, i) { var o = U.seg(tt, l[0], l[0] + 1.0) * (1 - U.seg(tt, l[1] - 0.8, l[1])); els.lines[i].style.opacity = o.toFixed(3); els.lines[i].style.filter = o < 0.99 ? 'blur(' + ((1 - o) * 4).toFixed(1) + 'px)' : 'none'; });
      els.hint.style.opacity = (tt < C.T_TITLE - 1 ? 0.45 * U.seg(tt, 1.5, 3) : 0).toFixed(2);
      var to = U.seg(tt, C.T_TITLE, C.T_TITLE + 2.2);
      els.title.style.opacity = to.toFixed(3); els.shade.style.opacity = to.toFixed(3);
      els.title.style.filter = to < 0.99 ? 'blur(' + ((1 - to) * 8).toFixed(1) + 'px)' : 'none';
      els.title.style.transform = 'scale(' + (1.04 - 0.04 * U.ease.cubicOut(to)).toFixed(4) + ')';
      var mo = U.seg(tt, C.T_TITLE + 1.4, C.T_TITLE + 2.8);
      els.menu.style.opacity = mo.toFixed(3); els.menu.style.pointerEvents = mo > 0.3 ? 'auto' : 'none';
      // 「你在这里」
      var mk = U.smoothstep(12.8, 13.8, L);
      if (mk > 0.01) {
        tmpV.copy(cp).negate().multiplyScalar(kk).project(camera);
        var mx = U.clamp((tmpV.x * 0.5 + 0.5) * E.size.w, 14, E.size.w - 14), my = U.clamp((-tmpV.y * 0.5 + 0.5) * E.size.h, 14, E.size.h - 14);
        var flip = mx > E.size.w * 0.68;
        els.mark.style.flexDirection = flip ? 'row-reverse' : 'row';
        els.mark.style.transform = flip ? 'translate(calc(-100% + 5px),-50%)' : 'translate(-5px,-50%)';
        els.mark.style.left = mx.toFixed(1) + 'px'; els.mark.style.top = my.toFixed(1) + 'px';
      }
      els.mark.style.opacity = (mk * 0.85).toFixed(3);
    }

    return {
      scene: scene, camera: camera,
      bloom: { strength: 0.9, radius: 0.6, threshold: 1.0 },
      enter: function (opts) {
        opts = opts || {}; variant = opts.variant; done = false; offset = 0; lastT = -1;
        if (variant === 'gallery') {
          if (!gallery) buildGallery();
          camera.near = 0.01; camera.updateProjectionMatrix();
          camera.position.set(0, 0, 21); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
          var fk = E.params.get('focus');
          glist.forEach(function (p) { if (p.kind === fk) { var c = p.group.position; camera.position.set(c.x, c.y, c.z + (+E.params.get('dist') || 4)); camera.lookAt(c); } });
          return new Promise(function () {});
        }
        if (gallery) gallery.visible = false;
        build(); buildDom();
        RU.audio.mood('title');
        keyH = function (e) {
          if (E.sceneTime + offset < C.T_TITLE - 0.5) { skip(E.sceneTime); e.preventDefault(); return; }
          if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'INPUT') { RU.audio.cue('ui-click'); finish({ seed: (els.menu.querySelector('[data-a=seed]').value || '').trim() || randSeed() }); }
        };
        clickH = function () { skip(E.sceneTime); };
        window.addEventListener('keydown', keyH); window.addEventListener('pointerdown', clickH);
        apply(E.still ? E.stillT : 0);
        return new Promise(function (res) { resolveFn = res; });
      },
      update: function (dt, t) {
        if (variant === 'gallery') { glist.forEach(function (p) { p.setSun(V(-60, 10, 25), 1.0); p.update(t); }); return; }
        var tt = t + offset;
        if (!E.still) {
          var A = RU.audio;
          if (lastT < 8.6 && tt >= 8.6 && tt < 12) A.cue('title-swell', { dur: 7 });
          if (lastT < C.T_TITLE + 0.1 && tt >= C.T_TITLE + 0.1) A.cue('title-hit');
        }
        lastT = tt;
        apply(tt);
      },
      exit: function () {
        if (keyH) window.removeEventListener('keydown', keyH); if (clickH) window.removeEventListener('pointerdown', clickH); keyH = clickH = null;
        if (root) { root.remove(); root = null; }
        finish(null);
      }
    };
  });
})();
