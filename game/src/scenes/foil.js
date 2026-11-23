/* 场景：foil —— 二向箔吞没太阳系（C6，cinema）。
 *
 * enter({ variant: 'home' | 'demo', u, year }) → Promise（播完或被跳过时 resolve { skipped }）。
 * 整段演出是时间 t 的纯函数：?scene=foil&t=秒 可冻结任一帧。
 *
 * 几何（艺术压缩，单位任意）：黄道面 y=0，二维平面固定在 y=PY（在所有天体下方，法线 +y）。
 * 纸条在海王星轨道外的 T0 触到平面，二维化前沿以 T0 为圆心在平面内扩张（读作光速），
 * 天体被前沿扫到后「跌」进平面：顶点着色器把它按方位等距展开成越摊越大的画（见 fx/planets.js）。
 * 屏幕角落的时钟按真实天文单位换算光速推进的实际耗时。
 */
(function () {
  var RU = window.RU, T = window.THREE, U = RU.util;
  var PY = -18, N = new T.Vector3(0, 1, 0), T0 = new T.Vector3(168, PY, 0);
  var T_TOUCH = 7.0, T_END = 63;

  // ---------- 天体布局（按太阳系真实层级大幅拉开太阳与行星比例：太阳 14 >> 木星 3.3 / 土星 2.8 >> 冰巨星 1.5 >> 地球 0.8） ----------
  var BODIES = [
    { k: 'neptune', a: 104, ang: 10, r: 1.45, tA: 11.6, dur: 4.2, ks: 0.14, au: 9.5, tilt: 0.4 },
    { k: 'uranus', a: 90, ang: -25, r: 1.5, tA: 15.6, dur: 3.6, ks: 0.12, au: 18, tilt: 0.25 },
    { k: 'saturn', a: 74, ang: 30, r: 2.8, tA: 19.6, dur: 4.2, ks: 0.13, au: 27, tilt: 0.12 },
    { k: 'jupiter', a: 56, ang: -15, r: 3.3, tA: 24.6, dur: 4.6, ks: 0.13, au: 33, tilt: 0.05 },
    { k: 'mars', a: 41, ang: 40, r: 0.55, tA: 28.4, dur: 2.6, ks: 0.2, au: 37.5 },
    { k: 'sun', a: 0, ang: 0, r: 14.0, tA: 31.6, dur: 4.8, ks: 0.0, au: 39.5 },
    { k: 'mercury', a: 20, ang: 120, r: 0.38, dur: 2.2, ks: 0.08 },
    { k: 'venus', a: 26, ang: 150, r: 0.75, dur: 2.6, ks: 0.08 },
    { k: 'moon', a: 0, ang: 0, r: 0.22, dur: 3.2, ks: 0.12, moon: true },
    { k: 'earth', a: 34, ang: 175, r: 0.80, tA: 44.4, dur: 6.3, ks: 0.28, au: 40.6, tilt: 0.0 }
  ];
  BODIES.forEach(function (b) {
    var a = b.ang * Math.PI / 180;
    b.pos = new T.Vector3(b.a * Math.cos(a), 0, b.a * Math.sin(a));
  });
  var EARTH = BODIES[9], MOON = BODIES[8], SUN = BODIES[5];
  MOON.pos.copy(EARTH.pos).add(new T.Vector3(2.1, -1.8, -1.2));
  BODIES.forEach(function (b) { b.d = Math.hypot(b.pos.x - T0.x, b.pos.z - T0.z); });

  // 前沿半径 Rw(t)：经过各「关键天体」的 (tA, d - r) 关键帧，分段线性（纯函数）
  var KEYS = [[T_TOUCH, 0]];
  BODIES.forEach(function (b) { if (b.tA != null) KEYS.push([b.tA, b.d - b.r]); });
  KEYS.sort(function (x, y) { return x[0] - y[0]; });
  function Rw(t) {
    if (t <= KEYS[0][0]) return 0;
    for (var i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) { var a = KEYS[i - 1], b = KEYS[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    var p = KEYS[KEYS.length - 2], q = KEYS[KEYS.length - 1]; return q[1] + (q[1] - p[1]) / (q[0] - p[0]) * (t - q[0]);
  }
  function RwInv(r) {
    for (var i = 1; i < KEYS.length; i++) if (r <= KEYS[i][1]) { var a = KEYS[i - 1], b = KEYS[i]; return a[0] + (b[0] - a[0]) * (r - a[1]) / (b[1] - a[1]); }
    var p = KEYS[KEYS.length - 2], q = KEYS[KEYS.length - 1]; return q[0] + (r - q[1]) * (q[0] - p[0]) / (q[1] - p[1]);
  }
  BODIES.forEach(function (b) { if (b.tA == null) b.tA = RwInv(b.d - b.r); });
  // 真实距离（天文单位）：前沿走过的距离 → 光速耗时
  var AUK = [[0, 0]];
  BODIES.forEach(function (b) { if (b.au != null) AUK.push([b.d - b.r, b.au]); });
  AUK.sort(function (x, y) { return x[0] - y[0]; });
  function realAU(r) {
    for (var i = 1; i < AUK.length; i++) if (r <= AUK[i][0]) { var a = AUK[i - 1], b = AUK[i]; return a[1] + (b[1] - a[1]) * (r - a[0]) / (b[0] - a[0]); }
    var q = AUK[AUK.length - 1]; return q[1] + (r - q[0]) * 0.05;
  }

  function fallH(b, t) {   // 球心到平面的有向高度
    var h0 = b.pos.y - PY, p = U.clamp((t - b.tA) / b.dur, 0, 1);
    var e = p * p * (3 - 2 * p) * 0.45 + p * p * 0.55;
    return h0 - (h0 + 1.65 * b.r) * e;
  }
  function spreadS(b, t) { var x = Math.max(0, t - b.tA - b.dur * 0.35); return 1 + b.ks * Math.pow(x, 1.15); }

  // ---------- 着色器 ----------
  var PLANE_V = 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }';
  var PLANE_F = [
    'uniform vec3 uT0; uniform float uRw, uTime, uFade; varying vec3 vW;',
    'void main(){',
    ' vec2 d=vW.xz-uT0.xz; float r=length(d);',
    ' if(r>uRw+6.0) discard;',
    ' float x=uRw-r;',
    ' float inside=smoothstep(-0.4,0.6,x);',
    ' float w=0.10+uRw*0.0016;',
    ' float ring=exp(-abs(x)/w)*1.0+exp(-abs(x)/(w*6.0))*0.10;',
    ' float flick=0.85+0.15*snoise(vec3(atan(d.y,d.x)*40.0, uTime*2.0, 0.0));',
    ' float rip=(0.5+0.5*sin(x*1.3-uTime*5.0))*exp(-max(x,0.0)/9.0)*inside;',
    ' vec3 V=normalize(cameraPosition-vW); float fres=pow(1.0-abs(V.y),3.0);',
    ' float ang=atan(d.y,d.x);',
    ' float fib=fbm3(vec3(cos(ang)*6.0, sin(ang)*6.0, r*0.05))*0.5+0.5;',
    ' float grain=fbm3(vec3(vW.xz*0.08, 3.0))*0.5+0.5;',
    ' vec3 sheen=mix(vec3(0.05,0.08,0.16), vec3(0.14,0.09,0.20), grain)*(0.08+0.35*fres)*(0.5+0.8*fib);',
    ' float spark=pow(max(snoise(vec3(vW.xz*1.7,1.0)),0.0),12.0)*0.6;',
    ' vec3 col=vec3(0.65,0.85,1.0)*ring*flick*2.2 + vec3(0.4,0.6,1.0)*rip*0.03 + (sheen+spark*vec3(0.5,0.7,1.0)*0.15)*inside;',
    ' float a=clamp(inside*(0.10+0.35*fres)+ring*0.5, 0.0, 1.0);',
    ' gl_FragColor=vec4(col*uFade, a*uFade);',
    '}'].join('\n');

  var SLIP_V = [
    'uniform float uTime; varying vec2 vUv;',
    'void main(){ vUv=uv; vec3 p=position; p.z+=sin(p.y*5.0+uTime*2.3)*0.05+sin(p.x*9.0+uTime*3.1)*0.015;',
    ' gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }'].join('\n');
  var SLIP_F = [
    'uniform float uTime, uGlow; varying vec2 vUv;',
    'void main(){ vec2 e=min(vUv,1.0-vUv); float edge=exp(-min(e.x*7.0,e.y*2.5)*6.0);',
    ' float sh=0.5+0.5*sin((vUv.y*7.0+vUv.x*3.0)-uTime*1.5);',
    ' vec3 irid=0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67)+vUv.y*1.5+uTime*0.1));',
    ' vec3 c=vec3(0.75,0.88,1.0)*(0.55+0.25*sh)+irid*0.15+vec3(1.0)*edge*2.0;',
    ' gl_FragColor=vec4(c*uGlow*0.85, 1.0); }'].join('\n');

  var DUST_V = [
    'attribute float aTA; attribute float aSz; attribute vec3 aCol; uniform float uT, uPY, uPix; uniform vec3 uT0; varying vec3 vCol; varying float vA;',
    'void main(){ vec3 p=position; float f=clamp((uT-aTA)/1.4,0.0,1.0); float e=f*f;',
    ' p.y=mix(p.y, uPY+0.03, e);',
    ' vec2 dir=normalize(p.xz-uT0.xz+1e-4); p.xz+=dir*max(uT-aTA-1.4,0.0)*0.12;',
    ' vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;',
    ' gl_PointSize=clamp(aSz*uPix*(1.0+f*0.8)/max(-mv.z,0.1), 0.5, 2.6);',
    ' vCol=aCol*(1.0+f*1.8); vA=1.0; }'].join('\n');
  var DUST_F = 'varying vec3 vCol; varying float vA; void main(){ vec2 q=gl_PointCoord-0.5; float d=dot(q,q); if(d>0.25) discard; gl_FragColor=vec4(vCol*exp(-d*10.0),1.0); }';

  // 地表视角：大气穹顶（预乘混合：inscatter + 背景 × 透过率）
  var DOME_V = 'varying vec3 vD; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vD=w.xyz-cameraPosition; gl_Position=projectionMatrix*viewMatrix*w; }';
  var DOME_F = [
    'uniform vec3 uUp, uSunDir; uniform float uSunI, uK, uFlat, uTime; varying vec3 vD;',
    'void main(){ vec3 rd=normalize(vD); float z=dot(rd,uUp);',
    ' float zc=max(z,0.0);',
    ' float am=1.0/(zc+0.12*exp(-zc*6.0)+0.02);',     // 空气质量
    ' vec3 beta=vec3(0.035,0.075,0.17)*(1.0+uK*0.6);',
    ' vec3 Tr=exp(-beta*am*1.2);',
    ' float mu=dot(rd,uSunDir);',
    ' float mie=(pow(max(mu,0.0),6.0)*0.6+pow(max(mu,0.0),60.0)*1.2)*smoothstep(-0.02,0.3,dot(uSunDir,uUp));',
    ' vec3 ray=vec3(0.25,0.45,1.0)*(0.75+0.25*mu*mu);',
    ' vec3 tint=mix(vec3(1.0,0.86,0.62), vec3(0.85,1.0,0.92), uK);',
    ' vec3 ins=(ray*(1.0-Tr)*0.22 + tint*mie*(1.0-Tr.g)*0.35)*uSunI;',
    // 被压扁的大气：地平线上越来越亮、越来越细的一条白线
    ' float band=exp(-abs(z)/(0.004+0.05*(1.0-uFlat)))*uFlat;',
    ' ins+=vec3(1.0,0.95,0.88)*band*1.2;',
    ' float a=(1.0-dot(Tr,vec3(0.3333)))*0.85;',
    ' a=clamp(a+band*0.5,0.0,1.0);',
    ' gl_FragColor=vec4(ins, a); }'].join('\n');
  var GROUND_F = [
    'uniform vec3 uUp, uRef, uSunDir; uniform float uSunI, uAmp, uTime, uFlat; varying vec3 vD;',
    'void main(){ vec3 rd=normalize(vD); float z=dot(rd,uUp);',
    ' vec3 e1=normalize(uRef-uUp*dot(uRef,uUp)); vec3 e2=cross(uUp,e1);',
    ' float az=atan(dot(rd,e2),dot(rd,e1));',
    ' vec3 ap=vec3(cos(az),sin(az),0.0);',
    ' float ridge=(0.012+0.05*max(fbm(ap*1.6+vec3(3.0,1.0,0.0)),-0.1)+0.012*fbm3(ap*9.0))*uAmp;',
    // 远处城市的楼群剪影
    ' float bld=step(0.55,hash11(floor(az*260.0)))*hash11(floor(az*260.0)+7.0)*0.006*smoothstep(0.2,0.6,snoise(ap*3.0+9.0))*uAmp;',
    ' float top=max(ridge, 0.004*uAmp+bld);',
    ' if(z>top) discard;',
    ' float depth=(top-z);',
    ' vec3 c=vec3(0.010,0.012,0.018)*uSunI*0.6;',
    ' c+=vec3(1.0,0.85,0.6)*exp(-depth*400.0)*0.06*uSunI;',       // 山脊边缘被天光勾一下
    ' float lights=step(0.985,hash13(floor(vec3(az*900.0, z*900.0, 1.0))))*smoothstep(0.03,0.0,depth)*step(depth,0.03);',
    ' c+=vec3(1.0,0.65,0.3)*lights*1.6*(0.7+0.3*sin(uTime*3.0+az*50.0));',
    ' c=mix(c, vec3(0.9,0.9,0.85)*0.25, uFlat*smoothstep(0.02,0.0,depth));',
    ' gl_FragColor=vec4(c,1.0); }'].join('\n');

  var SQUASH_F = [
    'uniform sampler2D tDiffuse; uniform float uSq, uLine; varying vec2 vUv;',
    'void main(){ float s=clamp(uSq,0.0,1.0); vec3 c=vec3(0.0);',
    ' if(s<0.001){ c=texture2D(tDiffuse,vUv).rgb; } else {',
    '  float hgt=max(1.0-s,1e-4); float y=(vUv.y-0.5)/hgt+0.5;',
    '  if(y>=0.0&&y<=1.0){ float sm=s*s*0.05; for(int i=-4;i<=4;i++) c+=texture2D(tDiffuse,vec2(vUv.x+float(i)*sm/4.0,y)).rgb; c/=9.0; c*=1.0+s*0.5; }',
    ' }',
    ' float dy=abs(vUv.y-0.5);',
    ' c+=vec3(1.0,0.96,0.9)*uLine*(exp(-dy*dy/(1.5e-6+2e-4*(1.0-uLine)))*2.5+exp(-dy/0.012)*0.12);',
    ' gl_FragColor=vec4(c,1.0); }'].join('\n');

  RU.defineScene('foil', function (E) {
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.05, 8000);
    var G = RU.glsl, P = RU.fx.planets;
    var bodies = BODIES.map(function (b, i) {
      var p = P.create(b.k, { radius: b.r, segments: b.k === 'sun' || b.r > 2 ? 224 : 160, tilt: b.tilt || 0, spin0: b.a * 0.1, ringTilt: 0.47 });
      p.mesh.renderOrder = i; p.group.position.copy(b.pos); scene.add(p.group); p.def = b; return p;
    });
    var byKind = {}; bodies.forEach(function (p) { byKind[p.kind] = p; });

    // 二维平面
    var planeU = { uT0: { value: T0.clone() }, uRw: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } };
    var plane = new T.Mesh(new T.PlaneGeometry(6000, 6000, 1, 1), new T.ShaderMaterial({ uniforms: planeU, vertexShader: PLANE_V, fragmentShader: G.noise + PLANE_F,
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
      polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = PY; plane.frustumCulled = false;
    scene.add(plane);

    // 纸条
    var slipU = { uTime: { value: 0 }, uGlow: { value: 1 } };
    var slip = new T.Mesh(new T.PlaneGeometry(0.32, 1.0, 4, 24), new T.ShaderMaterial({ uniforms: slipU, vertexShader: SLIP_V, fragmentShader: SLIP_F, side: T.DoubleSide }));
    var slipGlow = new T.Sprite(new T.SpriteMaterial({ map: U.glowTex(), color: 0x9fd0ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    slipGlow.scale.setScalar(2.2);
    var slipG = new T.Group(); slipG.add(slip); slipG.add(slipGlow); scene.add(slipG);

    // 碎屑：小行星带 + 柯伊伯带 + 弥散尘埃
    (function () {
      var n = 26000, r = U.mulberry(77), pos = new Float32Array(n * 3), ta = new Float32Array(n), sz = new Float32Array(n), col = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var k = r(), rad, y;
        if (k < 0.45) { rad = 33 + r() * 8; y = U.gauss(r) * 0.6; } else if (k < 0.75) { rad = 98 + r() * 45; y = U.gauss(r) * 2.5; } else { rad = 8 + r() * 130; y = U.gauss(r) * 3; }
        var a = r() * Math.PI * 2, x = rad * Math.cos(a), z = rad * Math.sin(a);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        ta[i] = RwInv(Math.hypot(x - T0.x, z - T0.z)) + r() * 0.3;
        sz[i] = 1.5 + r() * 3.5;
        var g = 0.08 + r() * 0.12; col[i * 3] = g * 1.1; col[i * 3 + 1] = g; col[i * 3 + 2] = g * 0.85;
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aTA', new T.BufferAttribute(ta, 1));
      geo.setAttribute('aSz', new T.BufferAttribute(sz, 1)); geo.setAttribute('aCol', new T.BufferAttribute(col, 3));
      var du = { uT: { value: 0 }, uPY: { value: PY }, uPix: { value: 1 }, uT0: { value: T0.clone() } };
      var pts = new T.Points(geo, new T.ShaderMaterial({ uniforms: du, vertexShader: DUST_V, fragmentShader: DUST_F, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      pts.frustumCulled = false; scene.add(pts); scene.userData.dust = du;
    })();

    // 背景星空：RU.fx.sky（galaxy 提供），没有时用临时星点
    var backdrop = null;
    function ensureSky() {
      if (backdrop) return;
      if (RU.fx.sky && RU.fx.sky.get) {
        try { var S = RU.fx.sky.get(E.renderer); backdrop = S.createBackdrop({ intensity: 0.4, stars: 0.9 }); backdrop.userData.S = S; scene.add(backdrop); return; } catch (err) { console.error(err); }
      }
      var n = 5000, r = U.mulberry(5), pos = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) { var z = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - z * z); pos[i * 3] = s * Math.cos(a) * 4000; pos[i * 3 + 1] = z * 4000; pos[i * 3 + 2] = s * Math.sin(a) * 4000; }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      backdrop = new T.Points(g, new T.PointsMaterial({ size: 1.5, sizeAttenuation: false, color: 0xaabbdd })); scene.add(backdrop);
    }

    // 地表视角：大气穹顶 + 地面剪影（跟随相机，不做深度测试，作为前景遮罩）
    var domeU = { uUp: { value: new T.Vector3(0, -1, 0) }, uSunDir: { value: new T.Vector3(1, 0, 0) }, uSunI: { value: 1 }, uK: { value: 0 }, uFlat: { value: 0 }, uTime: { value: 0 } };
    var dome = new T.Mesh(new T.SphereGeometry(40, 64, 32), new T.ShaderMaterial({ uniforms: domeU, vertexShader: DOME_V, fragmentShader: DOME_F, side: T.BackSide,
      transparent: true, depthTest: false, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor }));
    dome.renderOrder = 10; dome.frustumCulled = false; scene.add(dome);
    var groundU = { uUp: domeU.uUp, uRef: { value: new T.Vector3(1, 0, 0) }, uSunDir: domeU.uSunDir, uSunI: domeU.uSunI, uAmp: { value: 1 }, uTime: domeU.uTime, uFlat: domeU.uFlat };
    var ground = new T.Mesh(new T.SphereGeometry(30, 96, 48), new T.ShaderMaterial({ uniforms: groundU, vertexShader: DOME_V, fragmentShader: G.noise + GROUND_F, side: T.BackSide, transparent: true, depthTest: false, depthWrite: false }));
    ground.renderOrder = 20; ground.frustumCulled = false; scene.add(ground);

    // 「镜头被压平」后期
    var squash = new T.ShaderPass({ uniforms: { tDiffuse: { value: null }, uSq: { value: 0 }, uLine: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: SQUASH_F });

    // ---------- DOM：字幕、标注、时钟、跳过 ----------
    var root = null, subs = [], hudTL = null, hudBR = null, resolveFn = null, done = false, keyH = null, lastT = -1, opts0 = {};
    var LINES = [];
    function buildLines(o) {
      var u = o.u || (o.variant === 'home' && window.SIM ? SIM.createUniverse('home-demo') : null), civ = null, sys = null, year = o.year != null ? Math.floor(o.year) : (o.variant === 'home' ? 2347 : null);
      if (u && u.systems && u.systems[0]) {
        sys = u.systems[0];
        var c = sys.owner != null ? u.civs[sys.owner] : null;
        if (!c && u.civs) c = u.civs.filter(function (x) { return x.home === 0; })[0] || u.civs[0];
        civ = c ? c.name : null;
      }
      var home = o.variant === 'home' && civ;
      var L = [
        [1.2, 6.3, home ? (year != null ? '第 ' + year + ' 年。' : '') + civ + '的天空里，飘来一张纸条。' : '它很小，很轻，像一张飘错了地方的纸条。'],
        [7.7, 11.2, '它碰到的地方，空间少了一个方向。'],
        [12.6, 17.0, '海王星没有爆炸。它只是被摊开了。'],
        [18.3, 23.4, '光环一圈一圈铺开，像水面上停住的涟漪。'],
        [25.0, 30.0, '这场风暴刮了三百多年。现在，它终于停了。'],
        [31.2, 33.6, '然后是太阳。'],
        [34.0, 37.3, '它变成一幅画，亮得让人无法直视。'],
        [38.6, 42.6, home ? civ + '抬起头，天空第一次失去了深度。' : '天空第一次失去了深度。'],
        [43.2, 47.8, '没有声音，没有冲击波。只是越来越平。'],
        [53.0, 58.0, home && sys ? '从此，' + sys.name + '只剩下长和宽。' : '从此，太阳系只剩下长和宽。']
      ];
      var fin = home ? (year != null ? '第 ' + year + ' 年 · ' : '') + civ + '的母星，成为一幅画' : '二向箔 · 太阳系二维化';
      L.push([57.8, 62.6, fin, 'small']);
      return L;
    }
    function buildDom() {
      root = U.el('div', 'foil-root passthrough', '');
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:12';
      var shade = U.el('div', '', '', root); shade.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:34vh;background:linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.25) 45%, rgba(0,0,0,0))';
      subs = LINES.map(function (l) {
        var d = U.el('div', l[3] === 'small' ? 'cine-small' : 'cine-line', U.esc(l[2]), root);
        d.style.cssText = 'position:absolute;left:0;right:0;bottom:15vh;padding:0 6vw;text-align:center;opacity:0;transition:none;text-shadow:0 0 18px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.9);' + (l[3] === 'small' ? 'bottom:12vh;letter-spacing:.45em;color:rgba(220,230,255,.75)' : '');
        return d;
      });
      hudTL = U.el('div', 'cine-small', '', root);
      hudTL.style.cssText = 'position:absolute;left:4vw;top:max(7vh, 46px);max-width:46vw;opacity:0;font-size:clamp(9px,1.2vw,11px);letter-spacing:clamp(.1em,.25vw,.3em);line-height:1.5;color:rgba(210,222,255,.72);text-shadow:0 1px 8px rgba(0,0,0,.9)';
      hudBR = U.el('div', 'cine-small num', '', root);
      hudBR.style.cssText = 'position:absolute;right:4vw;top:max(7vh, 46px);max-width:44vw;opacity:0;font-size:clamp(9px,1.2vw,11px);letter-spacing:clamp(.08em,.18vw,.2em);line-height:1.5;text-align:right;color:rgba(210,222,255,.72);text-transform:none;text-shadow:0 1px 8px rgba(0,0,0,.9)';
      var skip = U.el('button', 'foil-skip', '跳过 ›');
      skip.style.cssText = 'position:fixed;right:3vw;bottom:calc(13vh - 40px);z-index:13;background:none;border:1px solid rgba(255,255,255,.18);color:rgba(230,235,255,.6);font:12px var(--sans);letter-spacing:.3em;padding:6px 14px;border-radius:2px;cursor:pointer';
      skip.onclick = function () { finish(true); };
      root._skip = skip;
    }
    function finish(skipped) {
      if (done) return; done = true;
      if (resolveFn) { var r = resolveFn; resolveFn = null; r({ skipped: !!skipped }); }
    }

    // ---------- 镜头（每段一个纯函数，硬切） ----------
    var V = function (x, y, z) { return new T.Vector3(x, y, z); };
    var tmp = new T.Vector3(), tmp2 = new T.Vector3();
    function cpOf(b) { return V(b.pos.x, PY, b.pos.z); }
    function lerpV(a, b, k) { return a.clone().lerp(b, k); }
    var SHOTS = [
      { t0: 0, t1: T_TOUCH, label: '', cam: function (t) {
        var k = U.ease.sine(U.seg(t, 0, T_TOUCH));
        var sp = slipPos(t);
        return { pos: sp.clone().add(lerpV(V(6.5, 1.2, -4.0), V(9.0, 2.6, -5.5), k)), tgt: sp.clone().lerp(V(80, -4, 10), 0.03), fov: 34 };
      } },
      { t0: T_TOUCH, t1: 11.3, label: '', cam: function (t) {
        var k = U.ease.cubicOut(U.seg(t, T_TOUCH, 11.3));
        return { pos: lerpV(V(166, -6.0, -7.5), V(196, 26, -30), k), tgt: lerpV(T0, V(110, PY, 8), k), fov: lerpV(V(34, 0, 0), V(48, 0, 0), k).x };
      } },
      { t0: 11.3, t1: 17.4, label: '望远镜特写', cam: function (t) {
        var b = BODIES[0], c = cpOf(b), k = U.seg(t, 11.3, 17.4);
        var off = lerpV(V(-13, 9, -13), V(-24, 22, -22), U.ease.sine(k));
        return { pos: c.clone().add(off), tgt: c.clone().add(V(3, Math.max(fallH(b, t), 0) * 0.5, 2)), fov: 40 };
      } },
      { t0: 17.4, t1: 24.0, label: '望远镜特写', cam: function (t) {
        var b = BODIES[2], c = cpOf(b), k = U.seg(t, 17.4, 24.0);
        var off = lerpV(V(-21, 15, -8), V(-30, 30, -14), U.ease.sine(k));
        return { pos: c.clone().add(off), tgt: c.clone().add(V(3, Math.max(fallH(b, t), 0) * 0.45, 1)), fov: 44 };
      } },
      { t0: 24.0, t1: 30.4, label: '望远镜特写', cam: function (t) {
        var b = BODIES[3], c = cpOf(b), k = U.seg(t, 24.0, 30.4);
        var off = lerpV(V(-21, 13, 10), V(-30, 30, 16), U.ease.sine(k));
        return { pos: c.clone().add(off), tgt: c.clone().add(V(4, Math.max(fallH(b, t), 0) * 0.45, -1)), fov: 44 };
      } },
      { t0: 30.4, t1: 37.8, label: '', cam: function (t) {
        var k = U.ease.sine(U.seg(t, 30.4, 37.8));
        return { pos: lerpV(V(-62, 14, -32), V(-94, 48, -50), k), tgt: lerpV(V(2, -4, 0), V(8, PY, 2), k), fov: lerpV(V(48, 0, 0), V(60, 0, 0), k).x };
      } },
      { t0: 37.8, t1: 50.6, label: '地表视角', ground: true, cam: function (t) { return earthCam(t); } },
      { t0: 50.6, t1: T_END + 10, label: '', cam: function (t) {
        var b = EARTH, c = cpOf(b), k = U.ease.sine(U.seg(t, 50.6, T_END));
        var off = lerpV(V(-10, 22, 16), V(-24, 52, 36), k);
        return { pos: c.clone().add(off), tgt: c.clone().lerp(V(0, PY, 0), 0.38), fov: 48 };
      } }
    ];
    function shotAt(t) { for (var i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].t1) return SHOTS[i]; return SHOTS[SHOTS.length - 1]; }
    function slipPos(t) {
      var k = U.ease.cubicOut(U.seg(t, 0, T_TOUCH));
      var p = lerpV(V(157, -2.5, -4.0), T0, k);
      p.x += Math.sin(t * 0.9) * 0.4 * (1 - k); p.y += Math.sin(t * 1.3) * 0.3 * (1 - k);
      return p;
    }
    // 地表：站在地球朝向平面的那一点，头顶（-y）就是平面
    function earthCam(t) {
      var h = fallH(EARTH, t), c = V(EARTH.pos.x, PY + h, EARTH.pos.z);
      var pos = c.clone().add(V(0, -EARTH.r * 1.002, 0));
      var k = U.seg(t, 37.8, 50.0);
      var dirH = V(1, 0, -0.18).normalize();
      var pitch = t < 44 ? U.lerp(0.36, 0.56, U.ease.sine(U.seg(t, 37.8, 44))) : U.lerp(0.56, 0.10, U.ease.inOut(U.seg(t, 44, 48.6)));
      var yaw = U.lerp(-0.12, 0.10, k);
      var fwd = dirH.clone().applyAxisAngle(V(0, 1, 0), yaw);
      fwd.multiplyScalar(Math.cos(pitch)).add(V(0, -Math.sin(pitch), 0));
      return { pos: pos, tgt: pos.clone().add(fwd), fov: 64, up: V(0, -1, 0) };
    }

    function setVisibleForShot(sh) {
      dome.visible = ground.visible = !!sh.ground;
      byKind.earth.group.visible = !sh.ground;
    }

    var sunLight = new T.Vector3(), sunCol = new T.Color();
    function apply(t) {
      var sh = shotAt(t), cam = sh.cam(t);
      setVisibleForShot(sh);
      camera.up.copy(cam.up || V(0, 1, 0));
      camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
      if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

      // 前沿
      var rw = Rw(t);
      planeU.uRw.value = rw; planeU.uTime.value = t; plane.visible = t >= T_TOUCH;

      // 纸条
      var sp = slipPos(t); slipG.position.copy(sp);
      slip.rotation.set(0.4 + t * 0.21, t * 0.33, 0.2 + t * 0.12);
      slipU.uTime.value = t;
      var sv = 1 - U.seg(t, T_TOUCH - 0.05, T_TOUCH + 0.35);
      slipG.visible = sv > 0.001; slipG.scale.set(1 + (1 - sv) * 4, sv, 1 + (1 - sv) * 4);
      slipGlow.material.opacity = 0.3 * sv;

      // 太阳被压平后：光源移到平面上，变白、变强
      var sunF = U.seg(t, SUN.tA + 0.6, SUN.tA + SUN.dur);
      sunLight.set(0, U.lerp(0, PY + 0.3, sunF), 0);
      var sunI = U.lerp(1.0, 1.45, sunF);
      sunCol.setRGB(1, U.lerp(0.97, 0.95, sunF), U.lerp(0.92, 1.0, sunF));

      bodies.forEach(function (p, i) {
        var b = p.def;
        p.setSun(sunLight, sunI, sunCol);
        if (t > b.tA) p.setFlat({ n: N, d: PY, fall: fallH(b, t), spread: spreadS(b, t), glow: b.k === 'sun' ? U.lerp(1.0, 0.6, U.ease.inOut(U.seg(t, SUN.tA + 3.0, SUN.tA + 6.2))) : 1.0 / (0.6 + 0.4 * spreadS(b, t)), lift: 0.02 + i * 0.08 });
        else p.setFlat(null);
        p.update(t);
      });
      scene.userData.dust.uT.value = t;
      scene.userData.dust.uPix.value = E.size.h * E.dpr * 0.06;

      // 曝光：太阳被压平的一瞬间刺眼
      var glare = U.seg(t, SUN.tA + 1.4, SUN.tA + 2.2) * (1 - U.seg(t, SUN.tA + 2.2, SUN.tA + 4.5));
      E.renderer.toneMappingExposure = 1.0 + glare * 0.9;

      // 地表视角
      if (sh.ground) {
        dome.position.copy(camera.position); ground.position.copy(camera.position);
        var sd = V(SUN.pos.x, PY, SUN.pos.z).sub(camera.position).normalize();
        domeU.uSunDir.value.copy(sd);
        var ke = U.seg(t, 37.8, 49.6);
        domeU.uK.value = ke; domeU.uSunI.value = U.lerp(1.0, 1.6, ke);
        domeU.uTime.value = t;
        domeU.uFlat.value = U.ease.in(U.seg(t, 46.0, 49.0));
        groundU.uAmp.value = 1 - U.ease.in(U.seg(t, 46.5, 49.0)) * 0.92;
        groundU.uRef.value.set(1, 0, 0);
      }

      // 镜头被压平 → 平面上的地球
      var sq = 0, line = 0;
      var A0 = 48.5, A1 = 49.5, B0 = 50.6, B1 = 52.0;
      if (t >= A0 && t < B0) { sq = U.ease.expoIn(U.seg(t, A0, A1)) * 0.995 + U.seg(t, A1, A1 + 0.1) * 0.005; line = U.ease.in(U.seg(t, A1 - 0.3, A1)); }
      else if (t >= B0 && t < B1) { var kk = U.ease.cubicOut(U.seg(t, B0, B1)); sq = 1 - kk; line = 1 - U.seg(t, B0, B0 + 0.9); }
      squash.uniforms.uSq.value = sq; squash.uniforms.uLine.value = line;
      if (backdrop && backdrop.setIntensity) backdrop.setIntensity(0.4 * (sh.ground ? 0.5 : 1), 0.9);
      if (backdrop && backdrop.userData.S && backdrop.userData.S.update) backdrop.userData.S.update(camera, t);

      // DOM
      if (root) {
        LINES.forEach(function (l, i) {
          var o = U.seg(t, l[0], l[0] + 0.9) * (1 - U.seg(t, l[1] - 0.8, l[1]));
          subs[i].style.opacity = o.toFixed(3);
          subs[i].style.filter = o < 0.999 ? 'blur(' + ((1 - o) * 3).toFixed(2) + 'px)' : 'none';
        });
        var lab = sh.label;
        var showHud = t > T_TOUCH + 0.6 && t < 48.6;
        hudTL.innerHTML = (lab ? lab + ' · ' : '') + '艺术放大 · 尺度与时间均经压缩';
        hudTL.style.opacity = showHud ? 1 : 0;
        var mins = realAU(rw) * 8.317;
        var hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
        hudBR.innerHTML = '二维化前沿 · 以光速推进<br>实际经过 ' + (hh ? hh + ' 小时 ' : '') + (mm < 10 && hh ? '0' : '') + mm + ' 分';
        hudBR.style.opacity = showHud ? 1 : 0;
      }
    }

    function cues(t0, t1) {
      if (E.still) return;
      var A = RU.audio;
      function at(tc, fn) { if (t0 < tc && t1 >= tc) fn(); }
      at(T_TOUCH, function () { A.cue('foil-touch'); E.flash(0.25, 0xcfe6ff); });
      BODIES.forEach(function (b) { if (b.k !== 'moon' && b.k !== 'mercury' && b.k !== 'venus') at(b.tA + 0.4, function () { A.cue(b.k === 'sun' || b.k === 'earth' ? 'flatten' : 'foil-spread'); }); });
      at(SUN.tA + 1.6, function () { E.flash(0.5, 0xfff2dd); });
      at(48.6, function () { A.cue('death'); });
      A.param('tension', U.clamp((t1 - T_TOUCH) / 42, 0, 1));
    }

    return {
      scene: scene, camera: camera,
      bloom: { strength: 1.05, radius: 0.55, threshold: 0.9 },
      prePasses: [squash],
      enter: function (opts) {
        opts0 = opts || {}; done = false; lastT = -1;
        ensureSky();
        LINES = buildLines(opts0);
        buildDom();
        E.letterbox(true);
        RU.audio.mood('foil');
        keyH = function (e) { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish(true); } };
        window.addEventListener('keydown', keyH);
        apply(E.still ? E.stillT : 0);
        return new Promise(function (res) { resolveFn = res; });
      },
      update: function (dt, t) {
        cues(lastT, t); lastT = t;
        apply(t);
        if (!E.still && t >= T_END) finish(false);
      },
      exit: function () {
        if (keyH) window.removeEventListener('keydown', keyH); keyH = null;
        if (root) { if (root._skip) root._skip.remove(); root.remove(); root = null; }
        E.letterbox(false);
        E.renderer.toneMappingExposure = 1.0;
        RU.audio.param('tension', 0);
        finish(true);
      }
    };
  });
})();
