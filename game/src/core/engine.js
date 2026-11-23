/* RU.engine —— 渲染器、后期、场景切换、主循环、截图模式（core）。
 *
 * 场景约定（RU.defineScene(name, factory)）：factory(engine) 只在第一次进入时调用一次，返回对象：
 *   scene: THREE.Scene, camera: THREE.Camera        —— 必须
 *   enter(opts) → 可返回 Promise（例如电影段落播完 / 被跳过时 resolve）
 *   exit()                                           —— 清理自己的 DOM 覆盖层、监听器
 *   update(dt, t)                                    —— 每帧；t = 进入场景后的秒数（截图模式下固定为 ?t=）
 *   可选：bloom: {strength, radius, threshold}，exposure，prePasses: [Pass]（在辉光之前），postPasses: [Pass]（辉光之后、色调映射之前）
 *   可选：onResize(w, h)
 * 截图模式：?scene=名字&t=秒 直接进入该场景（opts.demo = true）并把时间冻结在 t。
 */
(function () {
  var RU = window.RU, U = RU.util, T = window.THREE;
  var params = new URLSearchParams(location.search);
  var STILL = params.get('t') != null ? +params.get('t') : null;

  window.addEventListener('error', function (e) { var el = document.getElementById('errors'); if (el) el.textContent += 'ERR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno + '\n'; });
  window.addEventListener('unhandledrejection', function (e) { var el = document.getElementById('errors'); if (el) el.textContent += 'REJ: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason) + '\n'; });

  // ---------- 小型事件总线 ----------
  var handlers = {};
  RU.on = function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return function () { RU.off(ev, fn); }; };
  RU.off = function (ev, fn) { var a = handlers[ev]; if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
  RU.emit = function (ev, data) { (handlers[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (err) { console.error(err); } }); };

  // ---------- 渲染器 ----------
  var canvas = document.getElementById('gl');
  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  var DPR = Math.min(window.devicePixelRatio || 1, params.get('dpr') ? +params.get('dpr') : 1.75);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  var composer = new T.EffectComposer(renderer);
  var renderPass = new T.RenderPass(new T.Scene(), new T.PerspectiveCamera());
  var bloom = new T.UnrealBloomPass(new T.Vector2(512, 512), 0.9, 0.6, 0.75);
  var output = new T.OutputPass();
  // 收尾：暗角 + 胶片颗粒 + 轻微色散 + 可选宽银幕黑边（在 sRGB 空间）
  var finish = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.35 }, grain: { value: 0.035 }, ca: { value: 0.0012 }, letterbox: { value: 0 }, aspect: { value: 1.7 }, flash: { value: 0 }, flashColor: { value: new T.Color(1, 1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float time, vignette, grain, ca, letterbox, aspect, flash; uniform vec3 flashColor; varying vec2 vUv;',
      'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
      'void main(){ vec2 d=vUv-0.5; float r2=dot(d,d);',
      ' vec2 o=d*ca*(1.0+r2*4.0);',
      ' vec3 c=vec3(texture2D(tDiffuse,vUv+o).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-o).b);',
      ' c*=1.0-vignette*smoothstep(0.08,0.62,r2*1.6);',
      ' c+= (h(vUv*vec2(1733.0,977.0)+fract(time*7.13))-0.5)*grain;',
      ' c=mix(c, flashColor, clamp(flash,0.0,1.0));',
      ' float lb=letterbox*0.5*(1.0-1.0/max(aspect/2.39,1.0)) + letterbox*0.06;',   // 黑边：接近 2.39:1
      ' if(vUv.y<lb || vUv.y>1.0-lb) c=vec3(0.0);',
      ' gl_FragColor=vec4(c,1.0); }'].join('\n')
  });

  var E = RU.engine = {
    T: T, renderer: renderer, composer: composer, bloom: bloom, finish: finish, output: output,
    params: params, still: STILL != null, stillT: STILL, dpr: DPR,
    size: { w: 1, h: 1 }, current: null, currentName: null, sceneTime: 0, timeScale: 1, paused: false,
    defs: {}, inst: {}
  };
  RU.defineScene = function (name, factory) { E.defs[name] = factory; };

  function rebuildPasses(s) {
    composer.passes.slice().forEach(function (p) { composer.removePass(p); });
    renderPass.scene = s.scene; renderPass.camera = s.camera;
    composer.addPass(renderPass);
    (s.prePasses || []).forEach(function (p) { composer.addPass(p); });
    composer.addPass(bloom);
    (s.postPasses || []).forEach(function (p) { composer.addPass(p); });
    composer.addPass(output);
    composer.addPass(finish);
    var b = s.bloom || {};
    bloom.strength = b.strength != null ? b.strength : 0.9;
    bloom.radius = b.radius != null ? b.radius : 0.6;
    bloom.threshold = b.threshold != null ? b.threshold : 0.75;
    renderer.toneMappingExposure = s.exposure != null ? s.exposure : 1.0;
  }

  /** 切换场景。返回新场景 enter() 的返回值（Promise 化）。 */
  E.go = function (name, opts) {
    if (!E.defs[name]) return Promise.reject(new Error('未定义的场景：' + name));
    if (E.current && E.current.exit) { try { E.current.exit(); } catch (err) { console.error(err); } }
    var s = E.inst[name];
    if (!s) { s = E.inst[name] = E.defs[name](E); s.name = name; if (s.onResize) s.onResize(E.size.w, E.size.h); }
    E.current = s; E.currentName = name; E.sceneTime = 0;
    resize();
    rebuildPasses(s);
    RU.emit('scene', name);
    var r = s.enter ? s.enter(opts || {}) : null;
    return Promise.resolve(r);
  };
  /** 场景运行中修改了 prePasses/postPasses/bloom 后调用 */
  E.refreshPasses = function () { if (E.current) rebuildPasses(E.current); };
  E.get = function (name) { if (!E.inst[name] && E.defs[name]) { E.inst[name] = E.defs[name](E); E.inst[name].name = name; } return E.inst[name]; };

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    E.size.w = w; E.size.h = h;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(DPR); composer.setSize(w, h);
    bloom.resolution.set(w * DPR / 2, h * DPR / 2);
    finish.uniforms.aspect.value = w / h;
    Object.keys(E.inst).forEach(function (k) {
      var s = E.inst[k];
      if (s.camera && s.camera.isPerspectiveCamera) { s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); }
      if (s.onResize) s.onResize(w, h);
    });
  }
  window.addEventListener('resize', resize);
  resize();

  // 宽银幕黑边（电影段落用）：动画到 on=1/0
  var lbTarget = 0;
  E.letterbox = function (on) { lbTarget = on ? 1 : 0; if (E.still) finish.uniforms.letterbox.value = lbTarget; };
  /** 全屏闪光：强度 0..1，颜色可选，会自动衰减 */
  var flashV = 0;
  E.flash = function (v, color) { flashV = Math.max(flashV, v); if (color) finish.uniforms.flashColor.value.set(color); };

  /** 抓一帧为 dataURL（分享卡用）。 */
  E.capture = function (type) { if (E.current) composer.render(0); return canvas.toDataURL(type || 'image/png'); };

  // ---------- 主循环 ----------
  var last = performance.now(), frames = 0, fpsT = 0;
  E.fps = 60;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    frames++; fpsT += dt; if (fpsT > 1) { E.fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (E.paused) return;
    var s = E.current; if (!s) return;
    var sdt = dt * E.timeScale;
    if (E.still) { E.sceneTime = E.stillT; sdt = 1 / 60; } else E.sceneTime += sdt;
    finish.uniforms.time.value = now / 1000;
    var lb = finish.uniforms.letterbox; lb.value += (lbTarget - lb.value) * Math.min(1, dt * 3);
    flashV *= Math.pow(0.02, dt); finish.uniforms.flash.value = flashV;
    try { if (s.update) s.update(sdt, E.sceneTime); } catch (err) { console.error(err); var el = document.getElementById('errors'); if (el && el.textContent.length < 4000) el.textContent += 'update: ' + err.message + '\n'; }
    composer.render(sdt);
  }
  E.start = function () { requestAnimationFrame(loop); };
  document.addEventListener('visibilitychange', function () { last = performance.now(); });
})();
