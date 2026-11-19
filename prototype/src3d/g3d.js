  // ============================ 3D 宇宙（Three.js） ============================
  // 坐标：模拟里的 (x, y) 光年 → 世界坐标 (x-100, 高度, y-100)，1 单位 = 1 光年。
  // 高度只是视觉上的薄盘厚度（±7 光年），所有距离、光延迟、航程仍按模拟里的二维距离计算。
  var T = window.THREE;
  var wrap = $('mapWrap');
  var FREEZE = params.get('freeze') != null ? +params.get('freeze') : null;   // 截图用：把回放冻结在第 N 秒
  var renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: FREEZE != null });
  var DPR = Math.min(window.devicePixelRatio || 1, +params.get('dpr') || 1.5);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.id = 'gl';
  wrap.insertBefore(renderer.domElement, wrap.firstChild);
  var scene = new T.Scene(); scene.background = new T.Color(0x010207);
  var camera = new T.PerspectiveCamera(48, 1, 0.1, 9000);
  camera.position.set(0, 105, 250);
  var controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.minDistance = 6; controls.maxDistance = 1100;
  controls.autoRotate = FREEZE == null; controls.autoRotateSpeed = 0.18; controls.maxPolarAngle = Math.PI * 0.92;
  var lastInteract = 0, camFly = null;
  controls.addEventListener('start', function () { controls.autoRotate = false; lastInteract = performance.now(); camFly = null; });
  controls.addEventListener('end', function () { lastInteract = performance.now(); });
  var UNI_TIME_PRE = { value: 0 };
  var composer = new T.EffectComposer(renderer);
  composer.addPass(new T.RenderPass(scene, camera));
  var bloom = new T.UnrealBloomPass(new T.Vector2(512, 512), 1.0, 0.55, 0.7);
  composer.addPass(bloom);
  // 二向箔前沿的屏幕空间畸变：把平面圆（透视下近似椭圆）的边缘做成一圈折射 + 色散的「透镜涟漪」
  var NFRONT = 4;
  var lensPass = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, aspect: { value: 1 }, time: UNI_TIME_PRE, n: { value: 0 },
      fc: { value: [new T.Vector2(), new T.Vector2(), new T.Vector2(), new T.Vector2()] },
      fa: { value: [new T.Vector2(), new T.Vector2(), new T.Vector2(), new T.Vector2()] },
      fb: { value: [new T.Vector2(), new T.Vector2(), new T.Vector2(), new T.Vector2()] },
      fs: { value: [0, 0, 0, 0] } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float aspect, time; uniform int n; uniform vec2 fc[4]; uniform vec2 fa[4]; uniform vec2 fb[4]; uniform float fs[4]; varying vec2 vUv;',
      'void main(){ vec2 off=vec2(0.0); float glow=0.0; vec2 p=vec2(vUv.x*aspect,vUv.y);',
      ' for(int i=0;i<4;i++){ if(i>=n) break; vec2 d=p-fc[i]; float det=fa[i].x*fb[i].y-fa[i].y*fb[i].x; if(abs(det)<1e-7) continue;',
      '  float s=( d.x*fb[i].y-d.y*fb[i].x)/det, t=(-d.x*fa[i].y+d.y*fa[i].x)/det; float rho=sqrt(s*s+t*t);',
      '  float w=0.06; float x=(rho-1.0)/w; float ring=exp(-x*x); float rip=sin(rho*60.0-time*5.0)*exp(-abs(rho-1.0)/0.12)*0.35;',
      '  vec2 dir=length(d)>1e-5?normalize(d):vec2(0.0); off+=dir*(ring*-x*0.5+rip)*fs[i]*0.012; glow+=ring*fs[i]; }',
      ' off.x/=aspect; vec2 uv=vUv+off; float ca=length(off)*1.6;',
      ' vec3 c=vec3(texture2D(tDiffuse,uv+off*ca*8.0).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-off*ca*8.0).b);',
      ' c+=vec3(1.0,0.82,0.5)*glow*0.06; gl_FragColor=vec4(c,1.0); }'].join('\n')
  });
  lensPass.enabled = false;
  composer.addPass(lensPass); composer.addPass(new T.OutputPass());
  renderer.info.autoReset = false;

  // ---------- 小工具 ----------
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r()); }
  function clampN(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clampN((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function W(x, y, h) { return new T.Vector3(x - 100, h || 0, y - 100); }
  function canvasTex(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }
  function radial(g, x, y, r, stops) { var gr = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }

  // ---------- 程序化贴图 ----------
  var TEX = {};
  TEX.glow = canvasTex(128, 128, function (g) { radial(g, 64, 64, 64, [[0, 'rgba(255,255,255,1)'], [0.06, 'rgba(255,255,255,.8)'], [0.2, 'rgba(255,255,255,.22)'], [0.5, 'rgba(255,255,255,.05)'], [1, 'rgba(255,255,255,0)']]); });
  TEX.core = canvasTex(64, 64, function (g) { radial(g, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.9)'], [0.55, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']]); });
  TEX.flare = canvasTex(256, 256, function (g) {   // 望远镜的衍射星芒
    g.globalCompositeOperation = 'lighter';
    [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].forEach(function (a, i) {
      g.save(); g.translate(128, 128); g.rotate(a);
      var gr = g.createLinearGradient(-128, 0, 128, 0), k = i < 2 ? 0.9 : 0.25;
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + k + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-128, i < 2 ? -1.3 : -0.7, 256, i < 2 ? 2.6 : 1.4); g.restore();
    });
    radial(g, 128, 128, 40, [[0, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  });
  TEX.ring = canvasTex(128, 128, function (g) { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); });
  function cloudTex(seed) {
    var r = mulberry(seed);
    return canvasTex(256, 256, function (g) {
      for (var i = 0; i < 70; i++) { var x = 128 + gauss(r) * 38, y = 128 + gauss(r) * 38, rr = 14 + r() * 60; radial(g, x, y, rr, [[0, 'rgba(255,255,255,' + (0.04 + r() * 0.09) + ')'], [1, 'rgba(255,255,255,0)']]); }
      g.globalCompositeOperation = 'destination-out';
      for (var j = 0; j < 22; j++) { var x2 = 128 + gauss(r) * 45, y2 = 128 + gauss(r) * 45, r2 = 6 + r() * 26; radial(g, x2, y2, r2, [[0, 'rgba(0,0,0,' + (0.3 + r() * 0.5) + ')'], [1, 'rgba(0,0,0,0)']]); }
      g.globalCompositeOperation = 'destination-in';
      radial(g, 128, 128, 128, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,.8)'], [1, 'rgba(0,0,0,0)']]);
    });
  }
  TEX.clouds = [cloudTex(11), cloudTex(23), cloudTex(37), cloudTex(51)];
  // 二维画：梵高式笔触，沿涡旋流场画几千笔
  TEX.paint = canvasTex(512, 512, function (g, w, h) {
    var r = mulberry(777);
    g.fillStyle = 'rgba(14,28,90,0.8)'; g.fillRect(0, 0, w, h);
    var pal = ['#1c3f94', '#2b6cd4', '#3d8bff', '#f6c945', '#ffb03b', '#ff7a2f', '#fff0b8', '#2ec4b6', '#8a5cff', '#173a8c', '#f6c945', '#3d8bff', '#122a6e', '#e2562b'];
    var vort = []; for (var v = 0; v < 7; v++) vort.push([r() * w, r() * h, (r() < 0.5 ? -1 : 1), 30 + r() * 70]);
    function fang(x, y) {
      var a = Math.atan2(y - 256, x - 256) + Math.PI / 2 + 0.8 * Math.sin(x * 0.018 + y * 0.011) + 0.5 * Math.sin(y * 0.025 - x * 0.007);
      var vx = Math.cos(a), vy = Math.sin(a);
      vort.forEach(function (q) { var dx = x - q[0], dy = y - q[1], d = Math.sqrt(dx * dx + dy * dy) + 1, k = Math.exp(-d * d / (q[3] * q[3] * 2)) * 2.5 * q[2]; vx += -dy / d * k; vy += dx / d * k; });
      return Math.atan2(vy, vx);
    }
    g.lineCap = 'round';
    for (var i = 0; i < 3400; i++) {
      var x = r() * w, y = r() * h;
      g.strokeStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = 0.25 + r() * 0.55; g.lineWidth = 1 + r() * 4;
      g.beginPath(); g.moveTo(x, y);
      for (var k = 0, L = 8 + r() * 26; k < L; k++) { var a = fang(x, y); x += Math.cos(a) * 1.7; y += Math.sin(a) * 1.7; g.lineTo(x, y); }
      g.stroke();
    }
  });
  TEX.paint.wrapS = TEX.paint.wrapT = T.RepeatWrapping;

  // ---------- 着色器 ----------
  var VS_UV = 'varying vec2 vUv; varying vec3 vPos; void main(){ vUv=uv; vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  var VS_FRES = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }';
  // 二维画：按半径差速旋转的笔触 → 像一幅在缓慢旋转的画
  var FS_PAINT = [
    'uniform sampler2D map; uniform float time, opacity, rim, seed, frac, grow; uniform vec3 tint; varying vec2 vUv;',
    'void main(){ vec2 p=vUv*2.0-1.0; float r=length(p); if(r>1.0) discard;',
    ' float rw=r*frac;',   // 世界尺度的半径（相对最终半径）：笔触固定在空间里，前沿扩张时一圈圈「画」出来
    ' float a=atan(p.y,p.x)+time*0.05*(0.5+1.6*(1.0-rw))+seed;',
    ' float fresh=grow*smoothstep(0.82,1.0,r);',   // 刚被压平的一圈：沿切向拉长的新鲜笔触
    ' a+=fresh*0.25*sin(rw*40.0+seed*3.0);',
    ' vec2 q=vec2(cos(a),sin(a))*rw*0.46+0.5; q+=0.012*vec2(sin(rw*22.0-time*0.8+seed),cos(rw*18.0-time*0.6));',
    ' vec4 c=texture2D(map,q); vec4 c2=texture2D(map,vec2(cos(a+0.08),sin(a+0.08))*rw*0.46+0.5); c=mix(c,(c+c2)*0.5+vec4(0.25,0.18,0.08,0.0),fresh);',
    ' vec3 col=mix(c.rgb,c.rgb*tint*1.5,0.4); col=mix(vec3(dot(col,vec3(0.3,0.59,0.11))),col,1.5)*0.5;',
    ' float edge=smoothstep(1.0,0.86,r); float rg=exp(-pow((1.0-r)*40.0,2.0))*rim;',
    ' float al=(0.2+0.8*c.a)*edge*opacity;',
    ' gl_FragColor=vec4(col*0.95+vec3(1.0,0.8,0.45)*rg*1.7, clamp(al+rg*opacity,0.0,1.0)); }'].join('\n');
  var FS_DOMAIN = 'uniform float time, opacity; varying vec3 vN; varying vec3 vV; void main(){ float f=1.0-abs(dot(vN,vV)); float rim=pow(f,3.5); vec3 col=vec3(0.42,0.33,1.0)*rim*(1.8+0.4*sin(time*1.7)); gl_FragColor=vec4(col,(0.94*(1.0-rim*0.4)+rim*0.6)*opacity); }';
  var VS_FRES2 = 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP=position; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }';
  // 冲击波：半透明的发光壳——边缘偏蓝白、内侧偏橙，带细的湍流纹；中心几乎透明（不再是一个米色实心球）
  var FS_SHOCK = ['uniform float opacity, time; uniform vec3 color; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    'void main(){ float f=1.0-abs(dot(vN,vV)); float rim=pow(f,3.0);',
    ' float turb=0.75+0.25*sin(vP.x*9.0+time*2.0)*sin(vP.y*7.0-time*1.3)*sin(vP.z*8.0+time*1.7);',
    ' vec3 inner=vec3(1.0,0.55,0.22), outer=vec3(0.55,0.75,1.0);',
    ' vec3 c=mix(inner,outer,smoothstep(0.55,1.0,f))*(pow(f,3.6)*1.7+0.008)*turb;',
    ' c.r*=1.0+0.35*smoothstep(0.85,1.0,f); c.b*=1.0+0.5*smoothstep(0.92,1.0,f);',   // 色散边
    ' gl_FragColor=vec4(c*opacity,1.0); }'].join('\n');
  var FS_DISK = [
    'uniform float time; varying vec3 vPos;',
    'void main(){ float r=length(vPos.xy); float a=atan(vPos.y,vPos.x); float t=clamp((r-1.5)/3.6,0.0,1.0);',
    ' float band=0.65+0.35*sin(a*3.0+r*5.0-time*2.4)*sin(a*7.0-time*3.3+r*2.0);',
    ' vec3 col=mix(vec3(1.0,0.95,0.85),vec3(1.0,0.45,0.12),t)*(1.0-t)*band*2.4;',
    ' float al=smoothstep(0.0,0.06,t)*(1.0-smoothstep(0.7,1.0,t)); gl_FragColor=vec4(col*al,al); }'].join('\n');
  var FS_FOIL = 'uniform float time; varying vec2 vUv; void main(){ vec3 c=0.55+0.45*cos(6.2832*(vec3(0.0,0.33,0.67)+vUv.x*1.3+vUv.y*0.7+time*1.3)); float e=smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x)*smoothstep(0.0,0.15,vUv.y)*smoothstep(1.0,0.85,vUv.y); gl_FragColor=vec4(c*2.2*e,e); }';
  // 点精灵：world 尺寸随距离缩放
  var VS_PTS = 'attribute float size; attribute vec4 col; uniform float pxScale; varying vec4 vC; void main(){ vC=col; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(size*pxScale/-mv.z,1.0,72.0); gl_Position=projectionMatrix*mv; }';
  var VS_SKY = 'attribute float size; attribute vec4 col; uniform float dpr, time; varying vec4 vC; void main(){ vC=col; vC.a*=0.85+0.15*sin(time*1.3+position.x*0.07+position.y*0.05); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*dpr; gl_Position=projectionMatrix*mv; }';
  var FS_PTS = 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC.rgb*t.rgb, t.a*vC.a); }';
  var UNI_PX = { value: 600 }, UNI_TIME = { value: 0 }, UNI_DPR = { value: DPR };
  function ptsMat(sky) {
    return new T.ShaderMaterial({ uniforms: sky ? { map: { value: TEX.core }, dpr: UNI_DPR, time: UNI_TIME } : { map: { value: TEX.core }, pxScale: UNI_PX },
      vertexShader: sky ? VS_SKY : VS_PTS, fragmentShader: FS_PTS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  }
  function makePoints(n, sky) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('size', new T.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('col', new T.BufferAttribute(new Float32Array(n * 4), 4));
    var p = new T.Points(g, ptsMat(sky)); p.frustumCulled = false; return p;
  }
  function spriteMat(tex, color, op) { return new T.SpriteMaterial({ map: tex, color: color || 0xffffff, transparent: true, opacity: op == null ? 1 : op, blending: T.AdditiveBlending, depthWrite: false }); }

  // ---------- 天空：深空星野 + 银河带（银河带就是银盘平面，所以绕着地平线一圈） ----------
  var sky = new T.Group(); scene.add(sky);
  (function buildSky() {
    var r = mulberry(4242), N = 26000, P = makePoints(N, true), pos = P.geometry.attributes.position.array, sz = P.geometry.attributes.size.array, cl = P.geometry.attributes.col.array;
    for (var i = 0; i < N; i++) {
      var lon = r() * 6.2832, lat, band = i < N * 0.72;
      if (band) { lat = gauss(r) * (r() < 0.6 ? 0.07 : 0.22); var cen = Math.cos(lon); if (r() < 0.35 && cen < 0.2) { lon = r() * 6.2832; } }   // 银心方向更密
      else lat = Math.asin(r() * 2 - 1);
      var R = 3000, x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      pos[i * 3] = x * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = z * R;
      var m = r(), t = r();
      sz[i] = band ? 0.6 + Math.pow(m, 6) * 3.2 : 0.8 + Math.pow(m, 5) * 3.6;
      var warm = band ? 0.5 + 0.5 * Math.cos(lon) : t;
      cl[i * 4] = 0.75 + 0.25 * warm; cl[i * 4 + 1] = 0.78 + 0.12 * warm; cl[i * 4 + 2] = 1.0 - 0.3 * warm;
      cl[i * 4 + 3] = band ? 0.08 + 0.4 * Math.pow(m, 2) : 0.12 + 0.55 * Math.pow(m, 3);
    }
    sky.add(P);
    // 银河带的弥漫光和暗尘带（大张云朵贴图）
    for (var k = 0; k < 90; k++) {
      var lo = r() * 6.2832, la = gauss(r) * 0.05, cen2 = 0.5 + 0.5 * Math.cos(lo), R2 = 2800;
      var sp = new T.Sprite(spriteMat(TEX.clouds[k % 4], new T.Color().setHSL(0.07 + 0.05 * r(), 0.55, 0.45 + 0.2 * cen2), 0.015 + 0.045 * cen2));
      sp.position.set(Math.cos(la) * Math.cos(lo) * R2, Math.sin(la) * R2, Math.cos(la) * Math.sin(lo) * R2);
      var s = 500 + r() * 600 + cen2 * 500; sp.scale.set(s * 1.8, s * 0.5, 1); sp.material.rotation = (r() - 0.5) * 0.2; sky.add(sp);
    }
    for (var d = 0; d < 40; d++) {   // 暗尘带：正常混合的暗色
      var lo2 = r() * 6.2832, R3 = 2700;
      var m2 = new T.SpriteMaterial({ map: TEX.clouds[d % 4], color: 0x020205, transparent: true, opacity: 0.35 + 0.3 * r(), depthWrite: false });
      var sp2 = new T.Sprite(m2); sp2.renderOrder = 1;
      sp2.position.set(Math.cos(lo2) * R3, gauss(r) * 25, Math.sin(lo2) * R3);
      var s2 = 300 + r() * 500; sp2.scale.set(s2 * 2.2, s2 * 0.35, 1); sky.add(sp2);
    }
    // 银河带的连续弥漫光：一圈贴着地平线的圆柱，贴图里是噪声调制的高斯带 + 暗尘裂缝（低仰角时最明显）
    var bandTex = canvasTex(2048, 256, function (g, w, h) {
      var img = g.createImageData(w, h), d = img.data, rr = mulberry(77);
      var ph = []; for (var q = 0; q < 6; q++) ph.push([rr() * 6.28, 1 + Math.floor(rr() * 9)]);
      for (var x = 0; x < w; x++) {
        var lo = x / w * 6.2832, cen = 0.5 + 0.5 * Math.cos(lo), n1 = 0; ph.forEach(function (p) { n1 += Math.sin(lo * p[1] + p[0]) / p[1]; });
        var wid = 0.16 + 0.05 * n1 + 0.06 * cen, off = 0.02 * Math.sin(lo * 3 + 1.3);
        for (var y = 0; y < h; y++) {
          var v = (y / h - 0.5 - off) / wid, gs = Math.exp(-v * v * 2.2), dust = 1 - 0.75 * Math.exp(-Math.pow((y / h - 0.5 - off * 1.4 - 0.01 * Math.sin(lo * 11)) / (0.025 + 0.01 * n1), 2)) * (0.5 + 0.5 * Math.sin(lo * 4 + n1 * 2));
          var a = gs * dust * (0.35 + 0.65 * cen) * (0.8 + 0.2 * rr()), i = (y * w + x) * 4;
          d[i] = 255 * (0.85 + 0.15 * cen); d[i + 1] = 255 * (0.78 + 0.08 * cen); d[i + 2] = 255 * (0.95 - 0.25 * cen); d[i + 3] = 255 * clampN(a, 0, 1);
        }
      }
      g.putImageData(img, 0, 0);
    });
    var bandMesh = new T.Mesh(new T.CylinderGeometry(2600, 2600, 1700, 96, 1, true), new T.MeshBasicMaterial({ map: bandTex, transparent: true, opacity: 0.16, side: T.BackSide, depthWrite: false, blending: T.AdditiveBlending }));
    sky.add(bandMesh);
    // 银心的暖色隆起
    var bulge = new T.Sprite(spriteMat(TEX.glow, new T.Color(1.0, 0.75, 0.45), 0.22)); bulge.position.set(2800, 0, 0); bulge.scale.set(2600, 900, 1); sky.add(bulge);
  })();

  // ---------- 宇宙（每个种子重建） ----------
  var uni = null, sysO = [], labelsEl = $('labels'), flatO = {}, fx = [], dyn = makePoints(9000, false);
  scene.add(dyn);
  var stalks = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x6f8fbf, transparent: true, opacity: 0.16, depthWrite: false }));
  stalks.frustumCulled = false;
  var routeLine = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: 0xff9de2, dashSize: 2, gapSize: 1.6, transparent: true, opacity: 0.85 }));
  var pastLines = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false }));
  var grid = new T.Group();
  (function () {
    var m = new T.LineBasicMaterial({ color: 0x5577aa, transparent: true, opacity: 0.07, depthWrite: false });
    [50, 100, 150].forEach(function (rr) { var pts = []; for (var i = 0; i <= 128; i++) { var a = i / 128 * 6.2832; pts.push(new T.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr)); } grid.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), m)); });
    for (var k = 0; k < 12; k++) { var a = k / 12 * 6.2832; grid.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(Math.cos(a) * 20, 0, Math.sin(a) * 20), new T.Vector3(Math.cos(a) * 150, 0, Math.sin(a) * 150)]), m)); }
  })();
  scene.add(stalks, routeLine, pastLines, grid);
  var shipRing = new T.Sprite(spriteMat(TEX.ring, new T.Color(0.5, 1.6, 0.8), 0.9)); shipRing.scale.set(9, 9, 1); scene.add(shipRing);
  var selRing = new T.Sprite(spriteMat(TEX.ring, new T.Color(1.4, 1.4, 1.5), 0.8)); selRing.scale.set(12, 12, 1); scene.add(selRing);
  var hovRing = new T.Sprite(spriteMat(TEX.ring, new T.Color(0.6, 0.8, 1.2), 0.45)); hovRing.scale.set(11, 11, 1); scene.add(hovRing);
  var singerO = new T.Group();
  singerO.add(new T.Sprite(spriteMat(TEX.glow, new T.Color(2.0, 0.4, 1.7), 0.9)), new T.Sprite(spriteMat(TEX.flare, new T.Color(1.6, 0.5, 1.5), 0.5)));
  singerO.children[0].scale.set(16, 16, 1); singerO.children[1].scale.set(40, 40, 1); scene.add(singerO);

  // 打击特效池（光粒闪光、冲击波球、平面冲击环、二向箔碎片）
  function fresnelMesh(fs, uni2, blend, vs) { return new T.Mesh(new T.SphereGeometry(1, 48, 24), new T.ShaderMaterial({ uniforms: uni2, vertexShader: vs || VS_FRES, fragmentShader: fs, transparent: true, depthWrite: false, blending: blend })); }
  for (var fi = 0; fi < 8; fi++) {
    var o = {
      flash: new T.Sprite(spriteMat(TEX.glow, 0xffffff, 0)), flare: new T.Sprite(spriteMat(TEX.flare, 0xffffff, 0)),
      shock: fresnelMesh(FS_SHOCK, { opacity: { value: 0 }, time: UNI_TIME, color: { value: new T.Color(1.0, 0.7, 0.45) } }, T.AdditiveBlending, VS_FRES2),
      glint: new T.Sprite(spriteMat(TEX.flare, 0xffffff, 0)),
      cr: new T.Sprite(spriteMat(TEX.ring, new T.Color(1.0, 0.25, 0.2), 0)), cg: new T.Sprite(spriteMat(TEX.ring, new T.Color(0.25, 1.0, 0.35), 0)), cb: new T.Sprite(spriteMat(TEX.ring, new T.Color(0.3, 0.45, 1.0), 0)),
      wave: new T.Mesh(new T.RingGeometry(0.92, 1, 96), new T.MeshBasicMaterial({ color: new T.Color(1.2, 0.8, 0.5), transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })),
      foil: new T.Mesh(new T.PlaneGeometry(1.4, 0.6), new T.ShaderMaterial({ uniforms: { time: UNI_TIME }, vertexShader: VS_UV, fragmentShader: FS_FOIL, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }))
    };
    o.wave.rotation.x = -Math.PI / 2;
    ['flash', 'flare', 'shock', 'wave', 'foil', 'glint', 'cr', 'cg', 'cb'].forEach(function (k) { o[k].visible = false; scene.add(o[k]); });
    fx.push(o);
  }

  function disposeGroup(g) { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); }
  function build3D() {
    if (uni) { scene.remove(uni); disposeGroup(uni); }
    uni = new T.Group(); scene.add(uni); sysO = []; flatO = {}; labelsEl.innerHTML = '';
    var r = mulberry(hashStr(u.seed));
    // 本地星际尘埃：给 200 光年的星图一点体积感
    var N = 5000, D = makePoints(N, false), pos = D.geometry.attributes.position.array, sz = D.geometry.attributes.size.array, cl = D.geometry.attributes.col.array;
    for (var i = 0; i < N; i++) {
      var a = r() * 6.2832, rr = Math.sqrt(r()) * 190;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = gauss(r) * (4 + rr * 0.03); pos[i * 3 + 2] = Math.sin(a) * rr;
      sz[i] = 0.25 + Math.pow(r(), 4) * 0.9; var b = r();
      cl[i * 4] = 0.6 + 0.4 * b; cl[i * 4 + 1] = 0.7 + 0.2 * b; cl[i * 4 + 2] = 1.0; cl[i * 4 + 3] = 0.05 + 0.2 * Math.pow(r(), 2);
    }
    uni.add(D);
    // 星云：多层云朵精灵叠出体积
    u.nebulae.forEach(function (n, k) {
      var c0 = W(n.x, n.y, gauss(r) * 3);
      for (var j = 0; j < 9; j++) {
        var col = new T.Color().setHSL(((n.hue + (r() - 0.5) * 40) % 360) / 360, 0.75, 0.5);
        var sp = new T.Sprite(spriteMat(TEX.clouds[(k + j) % 4], col, 0.07 + r() * 0.08));
        sp.position.copy(c0).add(new T.Vector3(gauss(r) * n.r * 0.35, gauss(r) * n.r * 0.15, gauss(r) * n.r * 0.35));
        var s = n.r * (1.0 + r() * 1.2); sp.scale.set(s, s, 1); sp.material.rotation = r() * 6.28; sp.userData.spin = (r() - 0.5) * 0.02;
        uni.add(sp);
      }
    });
    // 恒星系
    u.systems.forEach(function (s) {
      var ti = SIM.typeInfo(s.type), h = (s.id === 0 ? 0 : clampN(gauss(r) * 3.2, -7, 7));
      var o = { s: s, base: W(s.x, s.y, h), ti: ti, col: new T.Color(ti[2]), g: new T.Group() };
      o.g.position.copy(o.base); uni.add(o.g);
      var bright = o.col.clone().lerp(new T.Color(1, 1, 1), 0.55).multiplyScalar(2.4);
      o.glow = new T.Sprite(spriteMat(TEX.glow, o.col.clone().multiplyScalar(0.9), 0.95)); o.glow.scale.setScalar(ti[3] * 2.6);
      o.core = new T.Sprite(spriteMat(TEX.core, bright, 1)); o.core.scale.setScalar(ti[3] * 0.5);
      o.flare = new T.Sprite(spriteMat(TEX.flare, o.col.clone().multiplyScalar(1.2), /^[OBA]$|中子星/.test(s.type) ? 0.4 : 0.16)); o.flare.scale.setScalar(ti[3] * 5.5);
      o.g.add(o.glow, o.core, o.flare);
      if (s.type === '黑洞') {
        o.glow.visible = o.core.visible = o.flare.visible = false;
        o.bh = new T.Group();
        o.bh.add(new T.Mesh(new T.SphereGeometry(1.1, 32, 16), new T.MeshBasicMaterial({ color: 0x000000 })));
        var disk = new T.Mesh(new T.RingGeometry(1.5, 5.1, 128, 1), new T.ShaderMaterial({ uniforms: { time: UNI_TIME }, vertexShader: VS_UV, fragmentShader: FS_DISK, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
        disk.rotation.x = -Math.PI / 2 + 0.35; o.bh.add(disk);
        var ph = new T.Sprite(spriteMat(TEX.ring, new T.Color(1.5, 0.8, 0.4), 0.5)); ph.scale.setScalar(3.0); o.bh.add(ph);
        o.g.add(o.bh);
      }
      o.ring = new T.Mesh(new T.RingGeometry(1, 1.07, 96), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
      o.ring.rotation.x = -Math.PI / 2; o.ring.scale.setScalar(ti[3] + 2.6); o.g.add(o.ring);
      o.paintRot = r() * 6.28; o.paintSeed = r() * 6.28;
      var el = document.createElement('div'); el.className = 'lb'; el.innerHTML = '<div class="nm"></div><div class="cv"></div>'; labelsEl.appendChild(el);
      o.el = el; o.nm = el.firstChild; o.cvEl = el.lastChild; o.txt = '';
      sysO.push(o);
    });
    // 歌者位置
    singerO.position.copy(W(u.singer.x, u.singer.y, 0));
    controls.target.set(0, -8, 0); camera.position.set(0, 105, 250); camFly = null;
    sync3D();
  }
  function paintMesh(tint, seed, rim) {
    return new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
      uniforms: { map: { value: TEX.paint }, time: UNI_TIME, opacity: { value: 1 }, rim: { value: rim || 0 }, seed: { value: seed }, tint: { value: tint }, frac: { value: 1 }, grow: { value: 0 } },
      vertexShader: VS_UV, fragmentShader: FS_PAINT, transparent: true, depthWrite: false, side: T.DoubleSide }));
  }
  function flatObj(f) {
    if (flatO[f.id]) return flatO[f.id];
    var o = { f: f, h: sysO[f.origin] ? sysO[f.origin].base.y : 0 };
    o.disc = paintMesh(new T.Color(1.0, 0.85, 0.6), f.id * 1.7, 1); o.disc.rotation.x = -Math.PI / 2;
    o.disc.position.copy(W(f.x, f.y, o.h)); o.disc.renderOrder = -1; uni.add(o.disc);
    o.label = document.createElement('div'); o.label.className = 'lb flatlb'; labelsEl.appendChild(o.label);
    flatO[f.id] = o; return o;
  }
  function domainObj(o) {
    if (o.dom) return o.dom;
    o.dom = fresnelMesh(FS_DOMAIN, { time: UNI_TIME, opacity: { value: 1 } }, T.NormalBlending);
    o.dom.material.depthWrite = true; o.g.add(o.dom); return o.dom;
  }
  function firstLog(s, key) { for (var i = 0; i < s.stateLog.length; i++) if (s.stateLog[i][key]) return s.stateLog[i].y; return null; }

  // ---------- 视角年份：光延迟 / 上帝视角 / 回放 ----------
  var RP = null;   // 时间压缩回放
  function godOn() { return $('godView').checked; }
  function viewYear(s) {
    if (RP) return RP.Y;
    if (godOn()) return u.simYear;
    return u.simYear - u.D[u.ship.at][s.id];
  }
  // 一趟航行的终点：途中终结（被二维追上 / 寿终 / 事故）的停在半路
  function tripEnd(t) { return t.died && t.from !== t.to ? sysO[t.from].base.clone().lerp(sysO[t.to].base, t.frac || 0) : sysO[t.to].base.clone(); }
  function shipAt(Y) {
    var tr = u.ship.trips, at = tr.length ? tr[0].from : u.ship.at, pos = null;
    for (var i = 0; i < tr.length; i++) {
      var t = tr[i]; if (Y < t.depart) break;
      if (t.from !== t.to && Y < t.arrive) { var f = (Y - t.depart) / Math.max(1e-9, t.arrive - t.depart); return { pos: sysO[t.from].base.clone().lerp(tripEnd(t), f), trip: t, f: f }; }
      at = t.to; pos = t.died ? tripEnd(t) : null;
    }
    return { pos: pos || sysO[at].base.clone(), trip: null, at: at };
  }
  function strikeSrc(st) { return st.by === 'singer' ? singerO.position.clone() : (u.civs[st.by] ? sysO[u.civs[st.by].home].base.clone() : singerO.position.clone()); }

  // 动态点：航迹、光粒、在途武器
  var DN = 0, DP = dyn.geometry.attributes.position.array, DS = dyn.geometry.attributes.size.array, DC = dyn.geometry.attributes.col.array, DMAX = 9000;
  function dpt(p, size, r, g, b, a) { if (DN >= DMAX) return; var i = DN++; DP[i * 3] = p.x; DP[i * 3 + 1] = p.y; DP[i * 3 + 2] = p.z; DS[i] = size; DC[i * 4] = r; DC[i * 4 + 1] = g; DC[i * 4 + 2] = b; DC[i * 4 + 3] = a; }
  var _v = new T.Vector3(), _w = new T.Vector3(), fronts = [];
  // 把正在扩张的前沿投影到屏幕上，交给畸变 pass
  var _c = new T.Vector3(), _a = new T.Vector3(), _b = new T.Vector3();
  function updateLens() {
    var asp = camera.aspect, k = 0;
    fronts.forEach(function (F) {
      if (k >= NFRONT) return;
      var c0 = F.o.disc.position;
      _c.copy(c0).project(camera); if (_c.z > 1 || _c.z < -1) return;
      _a.set(c0.x + F.R, c0.y, c0.z).project(camera); _b.set(c0.x, c0.y, c0.z + F.R).project(camera);
      var cx = (_c.x * 0.5 + 0.5) * asp, cy = _c.y * 0.5 + 0.5;
      lensPass.uniforms.fc.value[k].set(cx, cy);
      lensPass.uniforms.fa.value[k].set((_a.x * 0.5 + 0.5) * asp - cx, _a.y * 0.5 + 0.5 - cy);
      lensPass.uniforms.fb.value[k].set((_b.x * 0.5 + 0.5) * asp - cx, _b.y * 0.5 + 0.5 - cy);
      lensPass.uniforms.fs.value[k] = F.s; k++;
    });
    lensPass.uniforms.n.value = k; lensPass.uniforms.aspect.value = asp; lensPass.enabled = k > 0;
  }

  // 流亡舰队：在二向箔抵达前逃走的星海文明，曲率飞船以近光速飞向新家
  function drawFleets(Y) {
    var t = performance.now() / 1000;
    u.civs.forEach(function (d) {
      if (!d.diaspora || d.parent == null || !sysO[d.home]) return;
      var pc = u.civs[d.parent], from = pc && sysO[pc.home] ? pc.home : null; if (from == null || from === d.home) return;
      var a = sysO[from].base, b = sysO[d.home].base, L = a.distanceTo(b), y0 = d.born, y1 = d.born + u.D[from][d.home] / 0.99;
      if (Y < y0 || Y > y1 + 30) return;
      var f = clampN((Y - y0) / Math.max(1e-6, y1 - y0), 0, 1), dir = _w.copy(b).sub(a).normalize();
      for (var k = 0; k < 7; k++) {
        var lag = k * 0.012, ff = clampN(f - lag, 0, 1), side = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.7;
        _v.copy(a).lerp(b, ff); _v.x += -dir.z * side; _v.z += dir.x * side;
        if (Y <= y1) { dpt(_v, 1.6, 0.6, 1.2, 1.4, 0.95); for (var j = 1; j < 10; j++) { _c.copy(_v).addScaledVector(dir, -j * 0.6); dpt(_c, 1.0 - j * 0.08, 0.4, 0.8, 1.2, 0.6 * (1 - j / 10)); } }
        else { dpt(_v, 0.8, 0.5, 0.9, 1.1, 0.4 * (1 - (Y - y1) / 30)); }
      }
    });
  }

  // ---------- 每帧更新 ----------
  function update3D(now) {
    var Y0 = RP ? RP.Y : u.simYear, t = now / 1000;
    DN = 0;
    var ship = RP ? shipAt(RP.Y) : shipAt(u.time + 1e-6);
    // 恒星系
    var stalkPts = [];
    sysO.forEach(function (o) {
      var s = o.s, Y = viewYear(s), st = SIM.stateAt(s, Y), stype = st.type || s.type;
      var flat = st.flat, sealed = st.sealed && !flat, dead = st.dead && !flat;
      o.st = st;
      // 被压平的过渡：恒星落向二维平面，同时被抹成一幅画
      var fy = flat ? (s.flatYear != null ? s.flatYear : firstLog(s, 'flat')) : null, fage = flat ? clampN((Y - fy) / 2.2, 0, 1) : 0;
      var fl = flat && s.flatBy != null ? u.flats[s.flatBy] : null, planeH = fl && sysO[fl.origin] ? sysO[fl.origin].base.y : o.base.y;
      o.g.position.set(o.base.x, o.base.y + (planeH - o.base.y) * fage, o.base.z);
      var starVis = !flat || fage < 1, k = flat ? 1 - fage : 1;
      var isBH = stype === '黑洞';
      o.glow.visible = o.core.visible = starVis && !isBH;
      o.flare.visible = starVis && !isBH && !dead;
      if (o.bh) o.bh.visible = isBH && !flat;
      var tw = (1 + 0.04 * Math.sin(t * 2.3 + s.id)) * clampN(camera.position.distanceTo(o.g.position) / 230, 0.16, 1.5);
      if (dead) { o.glow.material.color.setRGB(0.35, 0.08, 0.04); o.glow.scale.setScalar(o.ti[3] * 1.6 * tw); o.core.material.color.setRGB(0.5, 0.15, 0.08); o.core.scale.setScalar(o.ti[3] * 0.3 * tw); }
      else {
        o.glow.material.color.copy(o.col).multiplyScalar(0.9); o.glow.scale.set(o.ti[3] * 2.6 * tw * (0.3 + 0.7 * k) * (1 + fage * 2), o.ti[3] * 2.6 * tw * k * k, 1);
        o.core.material.color.copy(o.col).lerp(new T.Color(1, 1, 1), 0.55).multiplyScalar(2.4 * (1 + fage * 3)); o.core.scale.set(o.ti[3] * 0.5 * Math.max(tw, 0.35) * (1 + fage * 3), o.ti[3] * 0.5 * Math.max(tw, 0.35) * k, 1); o.flare.scale.setScalar(o.ti[3] * 5.5 * tw);
      }
      if (flat) {
        if (!o.paint) { o.paint = paintMesh(o.col.clone(), o.paintSeed, 0); o.paint.rotation.set(-Math.PI / 2, 0, o.paintRot); o.g.add(o.paint); }
        o.paint.visible = true; o.paint.material.uniforms.opacity.value = 0.95 * fage;
        o.paint.scale.set(o.ti[3] * 3.4 * (0.4 + 0.6 * fage), o.ti[3] * 1.0, 1); o.paint.rotation.z = o.paintRot + t * 0.03;
      } else if (o.paint) o.paint.visible = false;
      if (sealed) {
        var sy = firstLog(s, 'sealed'), grow = RP ? clampN((Y - sy) / 1.5, 0, 1) : 1;
        var dm = domainObj(o); dm.visible = true; dm.scale.setScalar(Math.max(0.01, 5.5 * sstep(0, 1, grow)));
        o.flare.visible = false; o.glow.material.color.multiplyScalar(0.3);
      } else if (o.dom) o.dom.visible = false;
      o.ring.visible = st.owner != null && !flat && !sealed;
      if (o.ring.visible) { o.ring.material.color.set(u.civs[st.owner].color); o.ring.material.opacity = 0.38 + 0.12 * Math.sin(t * 1.5 + s.id); }
      stalkPts.push(o.g.position.x, o.g.position.y, o.g.position.z, o.g.position.x, flat ? o.g.position.y : 0, o.g.position.z);
      // 标签
      var txt = s.name + (s.habitable && !st.dead ? ' ·宜居' : ''), cv = '', cc = '';
      if (flat) { cv = '二维画'; cc = '#ffd27a'; } else if (sealed) { cv = '黑域 · ' + st.name; cc = '#a99dff'; }
      else if (dead) { cv = '死寂（恒星熄灭）'; cc = '#ff8a8a'; } else if (st.owner != null) { cv = st.name + ' · ' + st.era; cc = u.civs[st.owner].color; }
      var key = txt + '|' + cv + '|' + cc + '|' + (u.memory[s.id] ? 1 : 0);
      if (key !== o.txt) { o.txt = key; o.nm.textContent = txt; o.cvEl.textContent = cv; o.cvEl.style.color = cc; o.nm.style.color = u.memory[s.id] ? '#fff' : ''; }
    });
    stalks.geometry.setAttribute('position', new T.Float32BufferAttribute(stalkPts, 3));
    // 二维化区域（光延迟：按区域中心到你的距离）
    fronts = [];
    u.flats.forEach(function (f) {
      var o = flatObj(f), Y = RP ? RP.Y : godOn() ? u.simYear : u.simYear - Math.hypot(f.x - u.systems[u.ship.at].x, f.y - u.systems[u.ship.at].y);
      var R = SIM.flatR(f, Y), vis = Y >= f.y0;
      o.disc.visible = vis; o.label.style.display = vis ? '' : 'none';
      if (!vis) return;
      var R2 = Math.max(R, 0.3), growing = R < f.rmax;
      o.disc.scale.set(R2, R2, 1);
      o.disc.material.uniforms.rim.value = growing ? 0.8 : 0.3;
      o.disc.material.uniforms.frac.value = R2 / Math.max(0.3, f.rmax); o.disc.material.uniforms.grow.value = growing ? 1 : 0;
      if (growing && fronts.length < NFRONT) fronts.push({ f: f, o: o, R: R2, s: RP ? 1.0 : 0.55 });
      o.disc.material.uniforms.opacity.value = growing ? 0.9 : 0.78;
      o.R = R2; o.lbl = '二维化区域 ' + R.toFixed(1) + ' 光年' + (growing ? '（以光速扩张中）' : '');
    });
    // 曲率航迹（会在空间里留很久，慢慢淡去）与航行中的飞船
    var Yn = RP ? RP.Y : u.time;
    u.ship.trips.forEach(function (tr) {
      if (tr.from === tr.to || Yn < tr.depart) return;
      var a = sysO[tr.from].base, b = tripEnd(tr), fEnd = Yn < tr.arrive ? (Yn - tr.depart) / Math.max(1e-9, tr.arrive - tr.depart) : 1;
      var inten = Yn < tr.arrive ? 1 : Math.max(0, 1 - (Yn - tr.arrive) / 260);
      if (!tr.warp) { inten *= 0.5; }
      if (inten <= 0.01) return;
      var L = a.distanceTo(b) * fEnd, n = Math.min(400, Math.ceil(L / 0.7));
      for (var i = 0; i <= n; i++) {
        var q = n ? i / n : 0; _v.copy(a).lerp(b, q * fEnd);
        var sh = 0.75 + 0.25 * Math.sin(t * 3 + i * 0.37);
        if (tr.warp) dpt(_v, 0.7 + 0.5 * sh, 0.35, 0.6, 1.0, 0.28 * inten * sh);
        else if (i % 3 === 0) dpt(_v, 0.45, 0.9, 0.75, 0.5, 0.25 * inten);
      }
    });
    if (ship.trip) {
      var a2 = sysO[ship.trip.from].base, b2 = sysO[ship.trip.to].base, dir = _w.copy(b2).sub(a2).normalize();
      if (ship.trip.warp) {   // 近光速：一道蓝移的光痕，越往后越红
        for (var j = 0; j < 40; j++) {
          var q2 = j / 40; _v.copy(ship.pos).addScaledVector(dir, -j * 0.55);
          dpt(_v, (2.6 - 2.0 * q2), 0.7 + 0.6 * q2 - 0.3 * q2, 0.85 - 0.6 * q2, 1.0 - 0.4 * q2, (1 - q2) * 0.95);
        }
        dpt(ship.pos, 5.5, 1.3, 1.5, 2.0, 1.0);
        _v.copy(ship.pos).addScaledVector(dir, 1.2); dpt(_v, 3.5, 0.4, 0.6, 1.6, 0.6);
      } else dpt(ship.pos, 0.8, 1.0, 0.75, 0.45, 0.55);   // 常规推进：一个慢吞吞的暗点
      shipRing.visible = false;
    } else { shipRing.visible = !u.ship.dead || RP; shipRing.position.copy(ship.pos); shipRing.material.opacity = 0.6 + 0.3 * Math.sin(t * 2.5); }
    // 歌者与在途的武器（上帝视角或回放里可见）
    var showW = godOn() || !!RP;
    singerO.visible = showW; singerO.children[0].material.opacity = 0.6 + 0.3 * Math.sin(t * 1.1);
    if (showW) u.strikes.forEach(function (st) {
      if (Y0 < st.launch || Y0 >= st.arrive) return;
      var src = strikeSrc(st), dst = sysO[st.target].base, f2 = (Y0 - st.launch) / (st.arrive - st.launch), foil = st.type === '二向箔';
      var L2 = src.distanceTo(dst), n2 = Math.min(220, Math.ceil(L2 / 1.6));
      for (var i2 = 0; i2 <= n2; i2++) { _v.copy(src).lerp(dst, i2 / n2); dpt(_v, 0.5, foil ? 1.0 : 1.0, foil ? 0.8 : 0.35, foil ? 0.45 : 0.35, 0.18); }
      _v.copy(src).lerp(dst, f2); dpt(_v, 3.2, foil ? 1.6 : 1.8, foil ? 1.3 : 0.6, foil ? 0.6 : 0.6, 1);
    });
    // 回放里的打击特效
    fx.forEach(function (o) { o.flash.visible = o.flare.visible = o.shock.visible = o.wave.visible = o.foil.visible = o.glint.visible = o.cr.visible = o.cg.visible = o.cb.visible = false; });
    var bloomK = 1.0;
    if (RP) RP.events.forEach(function (e, idx) {
      if (idx >= fx.length || e.rt == null) return;
      var o = fx[idx], age = RP.t - e.rt, P = sysO[e.sys].g.position, src = e.src;
      if (e.kind === 'particle') {
        if (age >= -1.2 && age < 0) {   // 光粒以 0.99c 飞来：一个极亮的小点和它的光痕
          var dir2 = _w.copy(src).sub(P).normalize(), d0 = 70 * (-age / 1.2);
          for (var j2 = 0; j2 < 40; j2++) { _v.copy(P).addScaledVector(dir2, d0 + j2 * 0.45); dpt(_v, 0.9 - j2 * 0.018, 1.4, 1.5, 2.0, 1 - j2 / 40); }
          _v.copy(P).addScaledVector(dir2, d0); dpt(_v, 1.8, 2.4, 2.4, 2.8, 1);
        }
        if (age >= 0 && age < 3.2) {    // 恒星被击中：超新星般的闪光 + 冲击波球
          var rise = clampN(age / 0.12, 0, 1), I = age < 0.12 ? rise : Math.exp(-(age - 0.12) * 1.9);
          // 近距离不白屏：闪光的屏幕占比按镜头距离封顶，亮度上限 1.3，泛光强度随闪光临时压低
          var camD = camera.position.distanceTo(P), capS = camD * 0.32, near = clampN(1 - camD / 140, 0, 1);
          o.flash.visible = o.flare.visible = o.shock.visible = o.wave.visible = o.cr.visible = o.cg.visible = o.cb.visible = true;
          o.flash.position.copy(P); o.flare.position.copy(P); o.shock.position.copy(P); o.wave.position.copy(P);
          o.flash.scale.setScalar(Math.min(capS, 3 + 18 * rise * (0.6 + 0.4 * I))); o.flash.material.color.setRGB(1.3 * I, (1.15 - 0.45 * (1 - I)) * I, (1.05 - 0.8 * (1 - I)) * I); o.flash.material.opacity = Math.min(0.9, I);
          o.flare.scale.setScalar(Math.min(capS * 2.2, 12 + 40 * rise)); o.flare.material.color.setRGB(1.2 * I, 1.05 * I, 1.0 * I); o.flare.material.opacity = 0.85 * I;
          var cs = Math.min(capS * 1.6, 4 + age * 9), ca = 0.55 * Math.pow(1 - age / 3.2, 1.5);
          o.cr.position.copy(P); o.cg.position.copy(P); o.cb.position.copy(P);
          o.cr.scale.setScalar(cs * 1.04); o.cg.scale.setScalar(cs); o.cb.scale.setScalar(cs * 0.96); o.cr.material.opacity = o.cg.material.opacity = o.cb.material.opacity = ca;
          o.shock.scale.setScalar(0.5 + age * 11); o.shock.material.uniforms.opacity.value = 0.75 * Math.pow(1 - age / 3.2, 1.6);
          o.wave.scale.setScalar(0.5 + age * 19); o.wave.material.opacity = 0.4 * Math.pow(1 - age / 3.2, 1.5);
          bloomK = Math.min(bloomK, 1 - 0.55 * I * (0.4 + 0.6 * near));
        }
      } else if (e.kind === 'foil') {
        if (age >= -2.4 && age < 0.1) {  // 一片小小的、薄薄的纸条，闪着彩虹色飘进来
          var dir3 = _w.copy(src).sub(P).normalize(), d1 = 34 * Math.pow(Math.max(0, -age) / 2.4, 1.3);
          o.foil.visible = true; o.foil.position.copy(P).addScaledVector(dir3, d1);
          var fsz = clampN(camera.position.distanceTo(o.foil.position) * 0.06, 3.2, 9);   // 远看也要认得出来
          o.foil.rotation.set(t * 1.1, t * 1.6, t * 0.7); o.foil.scale.setScalar(fsz);
          o.flash.visible = true; o.flash.position.copy(o.foil.position); o.flash.scale.setScalar(fsz * 3); o.flash.material.color.setRGB(0.7, 0.95, 1.3); o.flash.material.opacity = 0.6;
          var gl = Math.pow(Math.max(0, Math.sin(t * 4.2)), 12);   // 翻转时偶尔反射一下光：一闪
          o.glint.visible = true; o.glint.position.copy(o.foil.position); o.glint.scale.setScalar(fsz * (4 + 10 * gl)); o.glint.material.color.setRGB(1.2 + gl, 1.2 + gl, 1.4 + gl); o.glint.material.opacity = 0.35 + 0.6 * gl;
          for (var j3 = 1; j3 < 46; j3++) { _v.copy(o.foil.position).addScaledVector(dir3, j3 * 0.9); var hue = j3 * 0.35 + t * 4; dpt(_v, 1.1 - j3 * 0.018, 0.65 + 0.35 * Math.sin(hue), 0.65 + 0.35 * Math.sin(hue + 2.1), 0.75 + 0.35 * Math.sin(hue + 4.2), 0.85 * (1 - j3 / 46)); }
        }
        if (age >= 0 && age < 2.0) {
          var I2 = Math.exp(-age * 2.0);
          o.flash.visible = o.wave.visible = true; o.flash.position.copy(P); o.flash.scale.setScalar(10 + 30 * (1 - I2)); o.flash.material.color.setRGB(2.6 * I2, 2.0 * I2, 1.0 * I2); o.flash.material.opacity = I2;
          o.wave.position.copy(P); o.wave.scale.setScalar(0.3 + age * 4); o.wave.material.color.setRGB(1.6, 1.2, 0.6); o.wave.material.opacity = 0.7 * I2;
        }
      } else if (e.kind === 'seal') {
        if (age >= 0 && age < 2.4) {
          var I3 = Math.exp(-age * 1.5);
          o.flash.visible = true; o.flash.position.copy(P); o.flash.scale.setScalar(8 + 22 * (1 - I3)); o.flash.material.color.setRGB(0.8 * I3, 0.6 * I3, 2.2 * I3); o.flash.material.opacity = I3;
        }
      }
    });
    bloom.strength += (bloomK - bloom.strength) * 0.5;
    drawFleets(Y0);
    dyn.geometry.setDrawRange(0, DN);
    dyn.geometry.attributes.position.needsUpdate = dyn.geometry.attributes.size.needsUpdate = dyn.geometry.attributes.col.needsUpdate = true;
    // 选中 / 悬停 / 航线
    selRing.visible = sel != null && !RP; if (selRing.visible) selRing.position.copy(sysO[sel].g.position);
    hovRing.visible = hover != null && hover !== sel && !RP; if (hovRing.visible) hovRing.position.copy(sysO[hover].g.position);
  }

  // ---------- 标签（HTML 叠加层） ----------
  var _p = new T.Vector3();
  function placeLabels() {
    var w = wrap.clientWidth, h = wrap.clientHeight;
    sysO.forEach(function (o) {
      _p.copy(o.g.position).project(camera);
      var vis = _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1;
      o.sx = (_p.x * 0.5 + 0.5) * w; o.sy = (-_p.y * 0.5 + 0.5) * h; o.vis = vis;
      if (!vis) { o.el.style.display = 'none'; return; }
      var dist = camera.position.distanceTo(o.g.position), op = clampN(1.25 - dist / 520, 0.35, 1);
      o.el.style.display = ''; o.el.style.opacity = (o.s.id === sel || o.s.id === hover) ? 1 : op;
      o.el.style.transform = 'translate(' + (o.sx + 10) + 'px,' + (o.sy - 9) + 'px)';
      o.el.classList.toggle('on', o.s.id === sel || o.s.id === hover);
    });
    Object.keys(flatO).forEach(function (k) {
      var o = flatO[k]; if (o.label.style.display === 'none' || !o.R) return;
      _p.copy(o.disc.position); _p.z += o.R; _p.project(camera);
      if (_p.z > 1) { o.label.style.visibility = 'hidden'; return; }
      o.label.style.visibility = ''; o.label.textContent = o.lbl;
      o.label.style.transform = 'translate(' + ((_p.x * 0.5 + 0.5) * w - 60) + 'px,' + ((-_p.y * 0.5 + 0.5) * h + 6) + 'px)';
    });
  }

  // ---------- 交互：点击选星、悬停、双击聚焦 ----------
  var hover = null, downAt = null;
  function pick(e) {
    var r = renderer.domElement.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 24;
    sysO.forEach(function (o) { if (!o.vis) return; var d = Math.hypot(o.sx - mx, o.sy - my); if (d < bd) { bd = d; best = o.s.id; } });
    return best;
  }
  renderer.domElement.addEventListener('pointerdown', function (e) { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', function (e) {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || RP) return;
    var b = pick(e); if (b != null) { sel = b; render(); }
  });
  renderer.domElement.addEventListener('pointermove', function (e) { var b = pick(e); if (b !== hover) { hover = b; renderer.domElement.style.cursor = b != null ? 'pointer' : ''; } });
  renderer.domElement.addEventListener('dblclick', function (e) { var b = pick(e); if (b != null) flyTo(sysO[b].g.position, 45); });
  function flyTo(p, dist) { camFly = { target: p.clone(), dist: dist }; controls.autoRotate = false; lastInteract = performance.now(); }

  // ---------- 由界面调用 ----------
  function sync3D() {
    if (!sysO.length) return;
    var here = sysO[u.ship.at].base;
    var pts = [];
    u.ship.trips.forEach(function (t2) { if (t2.from !== t2.to) pts.push(sysO[t2.from].base, sysO[t2.to].base); });
    pastLines.geometry.setFromPoints(pts.length ? pts : [here, here]);
    if (sel != null && sel !== u.ship.at) {
      routeLine.visible = true; routeLine.geometry.setFromPoints([here, sysO[sel].base]); routeLine.computeLineDistances();
      routeLine.material.color.set(SIM.isWarp(mode) ? 0xff9de2 : 0x6fd3ff);
    } else routeLine.visible = false;
    grid.visible = $('gridOn').checked;
  }
  function resize3D() {
    var w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h); composer.setPixelRatio(DPR); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    UNI_PX.value = h * DPR / (2 * Math.tan(camera.fov * Math.PI / 360));
  }

  // ---------- 时间压缩回放：「你离开的这些年里发生了什么」 ----------
  function collectEvents(t0, t1) {
    var ev = [];
    u.strikes.forEach(function (st) {
      if (!st.done || st.arrive <= t0 || st.arrive > t1) return;
      var s = u.systems[st.target], by = st.by === 'singer' ? '歌者' : (u.civs[st.by] ? '「' + u.civs[st.by].name + '」' : '深空');
      ev.push({ kind: st.type === '二向箔' ? 'foil' : 'particle', y: st.arrive, sys: st.target, st: st, src: strikeSrc(st),
        f: st.type === '二向箔' ? u.flats.filter(function (f) { return f.origin === st.target && f.y0 === st.arrive; })[0] : null,
        cap: st.type === '二向箔' ? by + '的二向箔落进 ' + s.name + '：三维空间开始以光速跌落成二维' : '一枚来自' + by + '的光粒击中 ' + s.name });
    });
    var sealedCiv = {};
    u.systems.forEach(function (s) {
      var sy = firstLog(s, 'sealed');
      if (sy != null && sy > t0 && sy <= t1) {
        var st2 = s.stateLog.filter(function (x) { return x.sealed; })[0];
        if (!sealedCiv[st2.name]) { sealedCiv[st2.name] = 1; ev.push({ kind: 'seal', y: sy, sys: s.id, src: sysO[s.id].base, cap: '「' + st2.name + '」把自己封进了黑域（' + s.name + '）' }); }
      }
      var fy = s.flat ? s.flatYear : null;
      if (fy != null && fy > t0 && fy <= t1 && !u.flats.some(function (f) { return f.origin === s.id && f.y0 === fy; }))
        ev.push({ kind: 'flatten', y: fy, sys: s.id, cap: '二维化的前沿吞没了 ' + s.name });
    });
    // 宇宙尺度的消息（归零者的「回归运动」广播等）：当作主角事件放慢演出
    u.cosmicEvents.forEach(function (c) {
      if (c.y <= t0 || c.y > t1) return;
      var zero = /归零者/.test(c.t);
      ev.push({ kind: 'cosmic', y: c.y, sys: u.ship.at, zero: zero, cap: zero ? '宇宙边缘传来一段广播——「归零者」发起「回归运动」' : c.t.replace(/。.*$/, '') });
    });
    u.civs.forEach(function (d) {
      if (!d.diaspora || d.born <= t0 || d.born > t1 || d.parent == null) return;
      ev.push({ kind: 'fleet', y: d.born, sys: d.home, cap: '「' + u.civs[d.parent].name + '」的流亡舰队逃离二向箔，飞向 ' + u.systems[d.home].name });
    });
    ev.sort(function (a, b) { return a.y - b.y; });
    return ev;
  }
  var FOCUS = { cosmic: { pre: 0.3, post: 4, dur: 0.6 + 4.2, dist: 240 }, particle: { pre: 0.4, post: 2.2, dur: 1.2 + 2.0, dist: 70 }, foil: { pre: 0.6, post: 0, dur: 0, dist: 60 }, seal: { pre: 0.2, post: 2, dur: 0.5 + 2.4, dist: 32 } };
  function buildReplay(t0, t1, res) {
    var ev = collectEvents(t0, t1), focus = [];
    // 最多放慢 3 个事件（二向箔 > 打到你去过/要去的地方的光粒 > 其他光粒 > 黑域），其余按快进速度一闪而过
    var dest = res ? res.trip.to : u.ship.at;
    var score = function (e) { return (e.kind === 'cosmic' ? (e.zero ? 40 : 15) : e.kind === 'foil' ? 30 : e.kind === 'particle' ? 20 : 10) + ((e.sys === dest || u.memory[e.sys]) && e.kind !== 'cosmic' ? 5 : 0) - e.y * 1e-6; };
    var pickF = ev.filter(function (e) { return e.kind !== 'flatten' && e.kind !== 'fleet'; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 2);
    pickF.forEach(function (e) { e.hero = true; });
    ev.forEach(function (e) {
      if (pickF.indexOf(e) < 0) return;
      var F = FOCUS[e.kind], post = F.post, dur = F.dur;
      if (e.kind === 'foil') { post = (e.f ? e.f.rmax : 15) + 1.5; dur = 2.4 + 5.5; }
      if (e.kind === 'cosmic') post = Math.min(F.post, Math.max(0.5, (t1 - t0) * 0.004));
      focus.push({ ya: Math.max(t0, e.y - F.pre), yb: Math.min(t1, e.y + post), dur: dur, e: e, preDur: e.kind === 'foil' ? 2.4 : e.kind === 'particle' ? 1.2 : e.kind === 'cosmic' ? 0.6 : 0.5 });
    });
    // 分段线性的「墙钟秒 → 宇宙年」映射：平时快进，打击前后放慢
    var cur = t0, pts = [{ r: 0, y: t0 }], rr = 0.6, focSpan = 0;
    pts.push({ r: rr, y: t0 });
    focus.forEach(function (k) { if (k.ya < cur) k.ya = cur; if (k.yb > k.ya) { focSpan += k.yb - k.ya; cur = k.yb; } });
    var baseSpan = Math.max(1e-6, (t1 - t0) - focSpan), baseDur = clampN(2 + baseSpan * 0.004, 2.5, 5);
    cur = t0;
    focus.forEach(function (k) {
      if (k.yb <= k.ya) return;
      if (k.ya > cur) { rr += baseDur * (k.ya - cur) / baseSpan; pts.push({ r: rr, y: k.ya }); }
      // 预热段（武器飞来）占 preDur 秒，让「抵达」那一刻正好落在这里；主段（爆炸/扩张）占剩下的时间
      var y = k.e.y;
      if (y > k.ya && y < k.yb) { rr += k.preDur; pts.push({ r: rr, y: y }); rr += k.dur - k.preDur; pts.push({ r: rr, y: k.yb }); }
      else if (y >= k.yb) { rr += k.preDur; pts.push({ r: rr, y: k.yb }); }
      else { rr += k.dur - k.preDur; pts.push({ r: rr, y: k.yb }); }
      cur = k.yb;
    });
    if (t1 > cur) { rr += baseDur * (t1 - cur) / baseSpan; pts.push({ r: rr, y: t1 }); }
    var dur = rr + 2.0;
    var R = { t0: t0, t1: t1, ev: ev, events: pickF.concat(ev.filter(function (e) { return e.kind !== 'flatten' && e.kind !== 'fleet' && pickF.indexOf(e) < 0; })).slice(0, fx.length), pts: pts, dur: dur, t: 0, Y: t0, res: res, focus: focus,
      ship0: res ? res.trip.shipAfter - res.trip.ship : u.ship.shipYears, ship1: u.ship.shipYears };
    R.events.forEach(function (e) { e.rt = timeAt(R, e.y); });
    return R;
  }
  function yearAt(R, t) { var p = R.pts; if (t <= p[0].r) return p[0].y; for (var i = 1; i < p.length; i++) if (t <= p[i].r) { var a = p[i - 1], b = p[i]; return b.r === a.r ? b.y : a.y + (b.y - a.y) * (t - a.r) / (b.r - a.r); } return p[p.length - 1].y; }
  function timeAt(R, y) { var p = R.pts; for (var i = 1; i < p.length; i++) if (y <= p[i].y && p[i].y > p[i - 1].y) return p[i - 1].r + (p[i].r - p[i - 1].r) * (y - p[i - 1].y) / (p[i].y - p[i - 1].y); return p[p.length - 1].r; }
  var lastJump = null;
  function startReplay(t0, t1, res, showAfter) {
    lastJump = { t0: t0, t1: t1, res: res };
    $('replayBtn').disabled = false;
    if (params.get('replay') === '0') { if (showAfter && res && !params.get('nomodal')) showReport(res); else render(); return; }
    RP = buildReplay(t0, t1, res); RP.showAfter = showAfter; window.__rp = RP; window.__u = u;
    $('modal').style.display = 'none'; $('hud').style.display = 'block';
    controls.autoRotate = false;
  }
  function endReplay() {
    var R = RP; RP = null; $('hud').style.display = 'none';
    lastInteract = performance.now(); camFly = { target: sysO[u.ship.at].base.clone(), dist: 90 };
    render();
    if (R.showAfter && R.res && !params.get('nomodal')) showReport(R.res);
  }
  $('replayBtn').onclick = function () { if (lastJump) startReplay(lastJump.t0, lastJump.t1, lastJump.res, false); };
  $('skipBtn').onclick = function () { if (RP) endReplay(); };
  window.addEventListener('keydown', function (e) { if (RP && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); endReplay(); } });
  $('homeBtn').onclick = function () { flyTo(sysO[u.ship.at].base, 70); };
  $('gridOn').onchange = sync3D;
  function f1r(x) { return x < 0.1 ? (x * 365).toFixed(0) + ' 天' : x < 10 ? x.toFixed(1) + ' 年' : Math.round(x) + ' 年'; }
  function updateHud(dtY) {
    var R = RP;
    $('hudYear').textContent = '纪元 ' + Math.floor(R.Y) + ' 年';
    var sp = dtY; $('hudSpeed').textContent = sp > 0.05 ? '时间流速 ×' + (sp >= 10 ? Math.round(sp) : sp.toFixed(1)) + ' 年/秒' : '';
    // 只给 1–2 个「主角事件」完整字幕，其余折叠成「+N 其他事件」
    var past = R.ev.filter(function (e) { return e.y <= R.Y + 0.01; }), heroes = past.filter(function (e) { return e.hero; }).slice(-2), others = past.filter(function (e) { return !e.hero; });
    var hh = heroes.map(function (e, i) { return '<div style="opacity:' + (i === heroes.length - 1 ? 1 : 0.6) + ';font-size:' + (i === heroes.length - 1 ? 15 : 13) + 'px">纪元 ' + Math.floor(e.y) + '：' + esc(e.cap) + '</div>'; }).join('');
    if (others.length) hh += '<div class="dim" style="font-size:12px;margin-top:3px">+' + others.length + ' 其他事件：' + others.slice(-3).map(function (e) { return esc(e.cap.replace(/：.*$/, '')); }).join('；') + (others.length > 3 ? '……' : '') + '</div>';
    $('hudCap').innerHTML = hh || '<div class="dim">（暂时风平浪静）</div>';
    var fr = clampN((R.Y - R.t0) / Math.max(1e-6, R.t1 - R.t0), 0, 1);
    $('uYear').textContent = Math.floor(R.Y);
    // 顶栏维度跟着回放年份走（u.dimLog 记录了每一次降维的年份）
    var nD = 0; (u.dimLog || []).forEach(function (d) { if (d.y <= R.Y) nD = d.n; });
    var dm = 3 - 0.012 * nD; $('dimInd').textContent = dm.toFixed(3) + '（' + nD + ' 次）'; $('dimInd').style.color = dm < 2.85 ? '#ff6b6b' : dm < 2.96 ? '#ffb35c' : '';
    // 归零者广播：HUD 变成紫色，单独停留几秒
    var zc = R.ev.filter(function (e) { return e.kind === 'cosmic' && e.zero && e.hero && R.Y >= e.y && e.rt != null && R.t - e.rt < 4.5; })[0];
    $('hud').style.borderColor = zc ? '#b07cff' : ''; $('hud').style.boxShadow = zc ? '0 0 40px rgba(176,124,255,.6)' : '';
    if (zc) $('hudCap').innerHTML = '<div style="font-size:16px;color:#e2c8ff">纪元 ' + Math.floor(zc.y) + '：所有文明同时收到了一段来自宇宙边缘的广播。</div><div style="color:#cdb4ff;font-size:13px;margin-top:4px">「归零者」发起「回归运动」：停止降维，停止降低光速，让宇宙回到十维的田园时代。</div>';
    $('sYears').textContent = f1r(R.ship0 + (R.ship1 - R.ship0) * fr);
  }
  // 回放时的镜头：跟着正在发生的事件或飞船走
  function replayCam() {
    var R = RP, best = null;
    R.focus.forEach(function (k) { if (k.e.rt == null) return; var a = R.t - k.e.rt; if (a > -k.preDur - 0.4 && a < (k.e.kind === 'foil' ? 6.5 : 3)) best = k; });
    if (best && best.e.kind === 'cosmic') return { target: W(100, 100, 0), dist: FOCUS.cosmic.dist, elev: 0.75 };
    if (best) {
      var e = best.e, d = e.kind === 'foil' ? Math.max(45, (e.f ? e.f.rmax : 15) * 3.4) : FOCUS[e.kind].dist;
      return { target: sysO[e.sys].base, dist: d, elev: e.kind === 'foil' ? 0.95 : null };
    }
    var sh = shipAt(R.Y);
    return { target: sh.pos, dist: sh.trip ? 120 : 85 };
  }

  // ---------- 主循环 ----------
  var clock = new T.Clock(), fpsAcc = 0, fpsN = 0, fpsShow = 0;
  window.__fps = 0; window.__gl = renderer.info; window.__dbg = { scene: scene, get flatO() { return flatO; }, get sysO() { return sysO; }, fx: fx, bloom: bloom };
  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(clock.getDelta(), 0.1), now = performance.now();
    UNI_TIME.value = now / 1000; UNI_TIME_PRE.value = now / 1000;
    if (RP) {
      var y0 = RP.Y;
      if (FREEZE != null) RP.t = FREEZE; else RP.t += dt;
      RP.Y = yearAt(RP, RP.t);
      updateHud(dt > 0 ? (RP.Y - y0) / dt : 0);
      if (FREEZE == null && RP.t >= RP.dur) endReplay();
    }
    if (sysO.length) {
      update3D(now);
      // 镜头
      var want = RP ? replayCam() : camFly;
      if (want) {
        var k = FREEZE != null ? 1 : 1 - Math.exp(-dt * (RP ? 1.8 : 2.5));
        controls.target.lerp(want.target, k);
        var off = camera.position.clone().sub(controls.target), L = off.length();
        if (want.elev != null) {   // 把镜头仰角慢慢转到指定角度
          var hz = Math.hypot(off.x, off.z) || 1, el = Math.atan2(off.y, hz), el2 = el + (want.elev - el) * k;
          off.set(off.x / hz * Math.cos(el2), Math.sin(el2), off.z / hz * Math.cos(el2));
        }
        off.setLength(L + (want.dist - L) * k); camera.position.copy(controls.target).add(off);
        if (!RP && camFly && controls.target.distanceTo(want.target) < 0.5 && Math.abs(L - want.dist) < 1) camFly = null;
      }
      if (!RP && FREEZE == null && !controls.autoRotate && now - lastInteract > 9000 && !camFly) controls.autoRotate = true;
      if (RP && FREEZE == null) { controls.autoRotate = true; controls.autoRotateSpeed = 0.35; } else controls.autoRotateSpeed = 0.18;
      controls.update();
      sky.position.copy(camera.position);
      uni.children.forEach(function (c) { if (c.userData.spin) c.material.rotation += c.userData.spin * dt; });
      updateLens(); renderer.info.reset(); composer.render();
      placeLabels();
    }
    fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if ($('fps')) $('fps').textContent = Math.round(window.__fps) + ' fps'; }
  }
  // 截图/调试：focus=星系id&dist=镜头距离，cam=俯仰角（度）
  function applyCamParams() {
    if (params.get('focus') != null) { var o = sysO[+params.get('focus')]; if (o) { controls.target.copy(o.base); var dd = +params.get('dist') || 60, el = (+params.get('cam') || 35) * Math.PI / 180, az = +params.get('az') || 0.6; camera.position.set(o.base.x + Math.cos(az) * Math.cos(el) * dd, o.base.y + Math.sin(el) * dd, o.base.z + Math.sin(az) * Math.cos(el) * dd); controls.autoRotate = false; } }
  }
  function drawMap() { sync3D(); }
