/* 场景：warp —— 第一视角的接近光速航行（C7）、常规推进冬眠航行、被二维前沿追上。负责人：warp。
 *
 * enter({ u, from, to, mode, trip, res }) → Promise（抵达 / 被追上 / 跳过时 resolve）
 *   opts.demo：自己造一份数据（SIM.createUniverse + SIM.travel）。variant: 'cryo'（常规推进）| 'caught'（曲率但被二维追上）| 'caught-cryo'
 *
 * 物理（c = 1，所有角度都相对飞船速度方向 v）：
 *   光行差：静止系方向余弦 c → 飞船系 c' = (c+β)/(1+βc)；逆变换 c = (c'−β)/(1−βc')。星空向前聚拢，后方变空。
 *   多普勒：δ = γ(1+β·c) = 1/(γ(1−β·c'))（c 静止系、c' 飞船系）。前方 2γ，飞船系 90° 已经是 1/γ（横向红移）。
 *   黑体光源的观测谱恰好是温度 δT 的黑体（I_ν/ν³ 不变），所以面亮度 = planckRGB(δT)；点光源再乘立体角压缩 1/δ²。
 *   视觉上 β 用快速度 η = atanh β 的软上限压缩（真实 γ 会让一切挤进 0.3° 的小圈），HUD 永远显示真实 β 与 γ。
 *   宇宙微波背景（2.725 K）用**真实** γ 的多普勒：前方被蓝移到 2.725·2γ K（γ=223 时 ≈ 1218 K，可见的暗红光）。
 *   常规推进 β ≤ 0.03：γ ≈ 1，星空几乎不变 —— 这本身就是信息。
 *   二维前沿以 c 推进：它到达之前，它上面的任何一点发出的光都不可能先到你这里，所以「看见」与「被吞没」是同一瞬间。
 */
(function () {
  var RU = window.RU, T = window.THREE, U = RU.util, G = RU.glsl;

  // ---------- 样式（只作用于 .wp- 前缀） ----------
  var CSS = [
    '.wp-hud{position:fixed;inset:0;pointer-events:none;color:var(--fg);font-family:var(--sans);opacity:0;transition:opacity 1s ease}',
    '.wp-hud.on{opacity:1}',
    '.wp-hud.dead>:not(.wp-cap){filter:grayscale(1) blur(.4px);opacity:.4;animation:wpGl .18s steps(2) 6}',
    '@keyframes wpGl{0%{opacity:.9}50%{opacity:.15}100%{opacity:.4}}',
    '.wp-hud .hl{position:absolute;background:rgba(160,200,255,.22)}',
    '.wp-route{position:absolute;left:3.6vw;top:5.2vh;}',
    '.wp-mode{font-size:11px;letter-spacing:.38em;color:var(--acc);text-transform:uppercase;margin-bottom:8px}',
    '.wp-mode b{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--acc);margin-right:10px;box-shadow:0 0 8px var(--acc);vertical-align:1px}',
    '.wp-names{font-family:var(--serif);font-size:clamp(17px,1.7vw,24px);letter-spacing:.14em;color:#fff}',
    '.wp-names i{font-style:normal;color:var(--dim);margin:0 .6em;font-family:var(--sans)}',
    '.wp-dist{margin-top:6px;font-size:12px;color:var(--dim);letter-spacing:.12em}',
    '.wp-dist .num{color:var(--fg)}',
    '.wp-speed{position:absolute;right:3.6vw;top:5.2vh;text-align:right}',
    '.wp-lab{font-size:10px;letter-spacing:.34em;color:var(--dim);text-transform:uppercase}',
    '.wp-beta{font-family:var(--mono);font-size:clamp(26px,2.9vw,42px);color:#cfe3ff;letter-spacing:.02em;line-height:1.1;margin-top:2px;white-space:nowrap}',
    '.wp-beta .d9{color:#fff;text-shadow:0 0 14px rgba(150,200,255,.9),0 0 3px #fff}',
    '.wp-beta .dx{color:rgba(207,227,255,.55)}',
    '.wp-beta small{font-size:.42em;color:var(--dim);margin-left:.3em;letter-spacing:.1em}',
    '.wp-gamma{font-family:var(--mono);font-size:clamp(15px,1.4vw,20px);color:var(--gold);margin-top:6px}',
    '.wp-gamma span{color:var(--dim);font-size:.7em;letter-spacing:.2em;margin-right:.6em}',
    '.wp-clocks{position:absolute;left:50%;bottom:6.5vh;transform:translateX(-50%);display:flex;gap:clamp(24px,5vw,90px);align-items:flex-end}',
    '.wp-clock{min-width:clamp(150px,17vw,280px)}',
    '.wp-clock .wp-lab{margin-bottom:6px}',
    '.wp-clock .v{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:clamp(20px,2.3vw,34px);color:#fff;white-space:nowrap}',
    '.wp-clock .s{font-family:var(--mono);font-size:12px;color:var(--dim);margin-top:4px;white-space:nowrap}',
    '.wp-clock.uni .v{color:var(--gold)}',
    '.wp-clock.uni .s{color:rgba(243,213,138,.7)}',
    '.wp-clock.bio .v{color:#9fe8ff}',
    '.wp-clock .bar{height:1px;background:rgba(160,200,255,.2);margin-top:9px;position:relative;overflow:hidden}',
    '.wp-clock .bar i{position:absolute;left:0;top:0;bottom:0;background:currentColor;opacity:.8}',
    '.wp-sep{width:1px;height:58px;background:linear-gradient(transparent,rgba(160,200,255,.35),transparent)}',
    '.wp-prog{position:absolute;left:50%;bottom:3.2vh;transform:translateX(-50%);width:min(44vw,560px);height:1px;background:rgba(160,200,255,.18)}',
    '.wp-prog i{position:absolute;left:0;top:-1px;height:3px;background:linear-gradient(90deg,rgba(143,211,255,.2),#8fd3ff);box-shadow:0 0 8px #8fd3ff}',
    '.wp-prog em{position:absolute;top:8px;font-style:normal;font-size:10px;letter-spacing:.2em;color:var(--dim);white-space:nowrap}',
    '.wp-note{position:absolute;left:3.6vw;bottom:19vh;max-width:21vw;text-shadow:0 0 8px #000,0 0 3px #000;font-size:12px;line-height:1.7;color:rgba(255,170,140,.9);letter-spacing:.06em;opacity:0;transition:opacity 1.2s ease}',
    '.wp-note.on{opacity:1}',
    '.wp-note b{color:#ffb48a;font-weight:500}',
    '.wp-cap{position:absolute;left:50%;top:72vh;transform:translateX(-50%);text-align:center;white-space:nowrap;opacity:0;transition:opacity .8s ease;padding:12px 48px;background:radial-gradient(closest-side,rgba(0,0,0,.6),rgba(0,0,0,.25) 70%,transparent);text-shadow:0 0 10px #000,0 0 3px #000}',
    '.wp-cap.on{opacity:1}',
    '.wp-ret{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;opacity:0;transition:opacity .6s ease}',
    '.wp-ret.on{opacity:1}',
    '.wp-ret:before,.wp-ret:after{content:"";position:absolute;inset:0;border:1px solid rgba(160,210,255,.75);clip-path:polygon(0 0,30% 0,30% 2px,2px 2px,2px 30%,0 30%,0 0,100% 0,100% 30%,calc(100% - 2px) 30%,calc(100% - 2px) 2px,70% 2px,70% 0,100% 0,100% 100%,70% 100%,70% calc(100% - 2px),calc(100% - 2px) calc(100% - 2px),calc(100% - 2px) 70%,100% 70%,100% 100%,0 100%,0 70%,2px 70%,2px calc(100% - 2px),30% calc(100% - 2px),30% 100%,0 100%)}',
    '.wp-ret:after{display:none}',
    '.wp-ret span{position:absolute;left:64px;top:-30px;white-space:nowrap;font-size:11px;letter-spacing:.2em;color:rgba(215,232,255,.95);text-shadow:0 0 6px #000;background:rgba(2,5,12,.62);padding:6px 10px 6px 12px;border-left:1px solid rgba(160,210,255,.6)}',
    '.wp-ret i{position:absolute;left:44px;top:-14px;width:22px;height:1px;background:rgba(160,210,255,.6);transform:rotate(-38deg);transform-origin:left center}',
    '.wp-ret span em{display:block;font-style:normal;color:var(--dim);font-size:10px;margin-top:3px;letter-spacing:.12em}',
    '.wp-ret.home:before{border-color:rgba(255,200,150,.7)}',
    '.wp-ret.home span{color:rgba(255,215,180,.9)}',
    '.wp-vitals{position:absolute;right:3.6vw;bottom:15vh;text-align:right;font-family:var(--mono);font-size:12px;color:#9fe8ff;line-height:1.9;opacity:0;transition:opacity 1s ease}',
    '.wp-vitals.on{opacity:1}',
    '.wp-vitals span{color:var(--dim);font-family:var(--sans);letter-spacing:.2em;margin-right:1em;font-size:10px}',
    '.wp-vitals canvas{display:block;margin:6px 0 0 auto;width:180px;height:34px}',
    '.wp-skip{position:fixed;right:max(3vw,12px);bottom:max(3vh,12px);z-index:12;background:none;border:1px solid rgba(160,190,255,.22);color:var(--dim);font-size:12px;letter-spacing:.3em;padding:7px 14px 7px 18px;cursor:pointer;transition:all .2s}',
    '.wp-skip:hover{color:#fff;border-color:rgba(160,190,255,.6)}',
    '.wp-card{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:11vh;pointer-events:none;opacity:0;transition:opacity 1.4s ease;background:linear-gradient(transparent 40%,rgba(0,0,0,.5) 75%,rgba(0,0,0,.6))}',
    '.wp-card.on{opacity:1}',
    '.wp-card .k{font-size:12px;letter-spacing:.5em;color:var(--dim);margin-bottom:3vh}',
    '.wp-card .row{display:flex;align-items:center;gap:clamp(18px,4vw,64px)}',
    '.wp-card .it{text-align:center}',
    '.wp-card .it .l{font-family:var(--serif);font-size:clamp(14px,1.4vw,20px);letter-spacing:.5em;color:var(--dim);margin-bottom:1.2vh}',
    '.wp-card .it .b{font-family:var(--serif);font-size:clamp(38px,6.6vw,104px);color:#fff;letter-spacing:.04em;line-height:1;white-space:nowrap;text-shadow:0 0 30px rgba(140,190,255,.35)}',
    '.wp-card .it.uni .b{color:var(--gold);text-shadow:0 0 40px rgba(243,213,138,.35)}',
    '.wp-card .it.bio .b{color:#9fe8ff}',
    '.wp-card .dot{font-family:var(--serif);font-size:clamp(28px,3vw,48px);color:var(--faint)}',
    '.wp-card .sub{margin-top:4.5vh;max-width:min(84vw,760px);text-align:center;font-size:clamp(13px,1.1vw,16px);line-height:1.9;color:rgba(220,228,245,.78);letter-spacing:.08em}',
    '.wp-card .sub b{color:#fff;font-weight:500}',
    '.wp-card.bad .it .b{color:#f4efe6}',
    '@media (max-width:760px){',
    ' .wp-clocks{flex-direction:column;gap:10px;align-items:center;bottom:8vh;text-align:center}',
    ' .wp-clock .v{font-size:19px} .wp-clock .s{font-size:11px;margin-top:2px} .wp-clock .wp-lab{margin-bottom:3px}',
    ' .wp-speed{right:auto;left:3.6vw;top:13vh;text-align:left} .wp-gamma{margin-top:2px}',
    ' .wp-sep{display:none} .wp-clock{min-width:0}',
    ' .wp-note{max-width:calc(100vw - 32px);left:16px;bottom:auto;top:25vh} .wp-route{top:3vh;left:16px} .wp-speed{left:16px}',
    ' .wp-beta{font-size:24px} .wp-cap{top:44vh;white-space:normal;width:86vw;font-size:16px} .wp-vitals{bottom:auto;top:13vh;right:4vw}',
    ' .wp-card .row{flex-direction:column;gap:3vh} .wp-card .dot{display:none} .wp-prog{width:70vw}',
    '}'
  ].join('\n');
  function ensureStyle() {
    if (document.getElementById('wp-style')) return;
    var s = document.createElement('style'); s.id = 'wp-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---------- 物理小工具（JS 端，双精度） ----------
  var LUM = { O: 30000, B: 600, A: 18, F: 3, G: 1, K: 0.35, M: 0.05, '白矮星': 0.02, '中子星': 0.002, '黑洞': 0 };
  var RAD = { O: 9, B: 5, A: 1.8, F: 1.3, G: 1, K: 0.8, M: 0.5, '白矮星': 0.05, '中子星': 0.02, '黑洞': 0.6 };
  var R_SUN_VIS = 2.4e-5;     // 视觉太阳半径（光年）：真实值的 ~330 倍，只为近距离时能看到圆盘
  var KFLUX = 18;              // 太阳在 1 光年处的显示亮度（≈ −2.7 等）
  function rapidityOfN(N) { var e = Math.pow(10, -N); return 0.5 * Math.log((2 - e) / Math.max(e, 1e-300)); }
  function betaFmtN(N, NR, betaR) {
    // HUD 上的 β：真实值，永远 < c。9 一位位亮起
    var b = N >= NR - 1e-9 ? betaR : 1 - Math.pow(10, -N);
    var digits = Math.max(3, Math.floor(N + 1e-9) + 2);
    if (N >= NR - 1e-9) digits = Math.max(3, String(betaR).length - 2);
    var k = Math.pow(10, digits), v = Math.floor(b * k + 1e-7) / k;
    var s = v.toFixed(digits);
    if (N >= NR - 1e-9) s = String(betaR).indexOf('.') > 0 ? String(betaR) : s;
    if (s.length > 3) s = s.replace(/0+$/, ''); if (s.length < 5) s = (+s).toFixed(3);
    var head = s.slice(0, 2), tail = s.slice(2), html = head, lit = true;
    for (var i = 0; i < tail.length; i++) { var ch = tail.charAt(i); if (ch !== '9') lit = false; html += '<span class="' + (lit ? 'd9' : 'dx') + '">' + ch + '</span>'; }
    return html;
  }
  function gammaOfN(N) { var e = Math.pow(10, -N); return 1 / Math.sqrt(Math.max(1e-300, e * (2 - e))); }
  function pad2(n) { n = Math.floor(n); return n < 10 ? '0' + n : '' + n; }
  function fmtShipClock(y) {
    var days = y * 365.25, Y = Math.floor(y + 1e-9), D = Math.floor(days - Y * 365.25), sec = (days - Math.floor(days)) * 86400;
    if (Y < 1) return Math.floor(days) + ' 天 ' + pad2(sec / 3600) + ':' + pad2(sec / 60 % 60) + ':' + pad2(sec % 60);
    return Y + ' 年 ' + (D < 100 ? (D < 10 ? '00' : '0') : '') + D + ' 天 ' + pad2(sec / 3600) + ':' + pad2(sec / 60 % 60);
  }
  function fmtEpoch(y, dec) { return '纪元 ' + y.toFixed(dec) + ' 年'; }
  function fmtGamma(g) { return g < 1.01 ? g.toFixed(5) : g < 10 ? g.toFixed(3) : g < 1000 ? g.toFixed(1) : Math.round(g).toLocaleString('en-US'); }

  RU.defineScene('warp', function (E) {
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(66, 1, 0.1, 1e5);
    var R_DIR = 1000;            // 方向空间：所有天体按飞船系方向放在半径 1000 的天球上，相机只转不动
    var EQW = 2048;

    // ================= 1. 静止系天空全景（优先用 galaxy 的 RU.fx.sky，否则自建一张） =================
    var ownSky = { rt: null, seed: null };
    var genMat = new T.ShaderMaterial({
      uniforms: { uSeed: { value: 0 }, uGC: { value: new T.Vector3(1, 0, 0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: G.noise + [
        'varying vec2 vUv; uniform float uSeed; uniform vec3 uGC;',
        'vec3 skyCol(vec3 d){',
        ' vec3 q=vec3(uSeed*0.37,uSeed*0.11,uSeed*0.23);',
        ' float b=d.y+fbm3(d*1.7+q)*0.06;',
        ' float gc=dot(d,uGC)*0.5+0.5;',
        ' float core=exp(-b*b/0.0045), band=exp(-b*b/0.022), halo=exp(-b*b/0.12);',
        ' float bulge=pow(gc,7.0)*exp(-b*b/(0.015+0.07*pow(gc,5.0)));',
        ' float cl=fbm(d*4.0+q)*0.5+0.5, cl2=fbm(d*11.0-q)*0.5+0.5;',
        ' float I=(core*0.9+band*0.45+halo*0.07)*(0.3+1.2*cl*cl)*(0.55+0.9*cl2)*(0.45+0.9*gc*gc)+bulge*1.8*(0.6+0.6*cl);',
        ' float lane=exp(-pow((b+0.012*sin(atan(d.z,d.x)*3.0))/0.02,2.0));',
        ' float dn=smoothstep(0.38,0.78,fbm(d*7.0+q*1.3)*0.5+0.5+0.28*lane);',
        ' I*=1.0-0.88*dn*(0.35+0.65*lane)*smoothstep(0.0,0.3,band+bulge);',
        ' vec3 col=mix(vec3(0.68,0.79,1.0),vec3(1.0,0.76,0.52),clamp(pow(gc,3.0)*1.1+bulge*0.6,0.0,1.0))*I;',
        ' float nf=fbm(d*14.0+q)*0.5+0.5;',
        ' float nb=smoothstep(0.6,0.88,fbm(d*3.0+q*2.1+7.0)*0.5+0.5)*exp(-b*b/0.012);',
        ' col+=vec3(1.0,0.22,0.32)*nb*nf*nf*1.1;',
        ' float nb2=smoothstep(0.64,0.9,fbm(d*2.6-q*1.7+3.0)*0.5+0.5)*exp(-b*b/0.03);',
        ' col+=vec3(0.18,0.62,0.85)*nb2*nf*0.45;',
        ' float g=pow(max(0.0,snoise(d*240.0)),10.0)*(0.25+band+bulge);',
        ' col+=vec3(0.9,0.95,1.0)*g*0.7;',
        ' return col*0.055+vec3(0.0005,0.0007,0.0011);',
        '}',
        'void main(){ float lon=(vUv.x-0.5)*6.2831853, lat=(vUv.y-0.5)*3.14159265;',
        ' vec3 d=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon)); gl_FragColor=vec4(skyCol(d),1.0); }'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });
    function buildOwnSky(seed) {
      if (ownSky.rt && ownSky.seed === seed) return ownSky.rt.texture;
      if (!ownSky.rt) ownSky.rt = new T.WebGLRenderTarget(EQW, EQW / 2, { type: T.HalfFloatType, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, wrapS: T.RepeatWrapping, wrapT: T.ClampToEdgeWrapping, depthBuffer: false });
      var r = U.mulberry(U.hashStr(seed + '#warpsky'));
      genMat.uniforms.uSeed.value = r() * 9;
      var a = r() * Math.PI * 2; genMat.uniforms.uGC.value.set(Math.cos(a), 0, Math.sin(a));
      var sc = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), q = new T.Mesh(new T.PlaneGeometry(2, 2), genMat);
      q.frustumCulled = false; sc.add(q);
      var R0 = E.renderer, prev = R0.getRenderTarget(), tm = R0.toneMapping;
      R0.toneMapping = T.NoToneMapping;
      R0.setRenderTarget(ownSky.rt); R0.render(sc, cam); R0.setRenderTarget(prev);
      R0.toneMapping = tm;
      q.geometry.dispose();
      ownSky.seed = seed;
      return ownSky.rt.texture;
    }
    function skySource(u) {
      try {
        if (RU.fx && RU.fx.sky && RU.fx.sky.get) {
          var s = RU.fx.sky.get(E.renderer, { u: u, seed: u && u.seed });
          if (s && s.equirect) return { tex: s.equirect, stars: s.stars || null, gain: s.warpGain || 1, w: (s.size && s.size[0]) || (s.equirect.image && s.equirect.image.width) || EQW };
        }
      } catch (err) { console.warn('[warp] RU.fx.sky 不可用，用自建天空', err); }
      return { tex: buildOwnSky(u ? u.seed : 'demo'), stars: null, gain: 1, w: EQW };
    }

    // ================= 2. 飞船系天空（逐像素逆光行差 + 黑体多普勒 + CMB + 曲率航迹） =================
    var skyU = {
      uEq: { value: null }, uEqW: { value: EQW }, uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() },
      uV: { value: new T.Vector3(1, 0, 0) }, uE1: { value: new T.Vector3(0, 1, 0) }, uE2: { value: new T.Vector3(0, 0, 1) },
      uBeta: { value: 0 }, uGamma: { value: 1 }, uBR: { value: 0 }, uGR: { value: 1 },
      uExpo: { value: 1 }, uPixAng: { value: 0.001 }, uCmbGain: { value: 0 }, uSkyGain: { value: 1 },
      uTrail: { value: 0 }, uTL: { value: 1 }, uTR: { value: 0.0001 }, uTO: { value: 0.0003 }, uTime: { value: 0 }
    };
    var skyMat = new T.ShaderMaterial({
      uniforms: skyU,
      vertexShader: 'varying vec2 vNdc; void main(){ vNdc=position.xy; gl_Position=vec4(position.xy,0.9999,1.0); }',
      fragmentShader: G.blackbody + G.common + [
        'uniform sampler2D uEq; uniform float uEqW; uniform mat4 uInvProj, uCamWorld; uniform vec3 uV, uE1, uE2;',
        'uniform float uBeta, uGamma, uBR, uGR, uExpo, uPixAng, uCmbGain, uSkyGain, uTrail, uTL, uTR, uTO, uTime;',
        'varying vec2 vNdc;',
        // 黑体比值多普勒：从像素颜色估一个温度（维恩近似反解 b/r），再乘 planckRGB(δT)/planckRGB(T)。δ=1 时恒等。
        'vec3 bbShift(vec3 c, float dl){',
        ' float lr=clamp(log(max(c.b,1e-7)/max(c.r,1e-7)),-3.0,1.2);',
        ' float Tt=clamp(7355.0/(1.357-lr),2200.0,30000.0);',
        ' vec3 p0=planckRGB(Tt), p1=planckRGB(Tt*dl);',
        ' return c*p1/max(p0,vec3(1e-30)); }',
        'void main(){',
        ' vec4 p=uInvProj*vec4(vNdc,1.0,1.0); vec3 dv=normalize(p.xyz/p.w);',
        ' vec3 d=normalize(mat3(uCamWorld)*dv);',
        ' float cs=clamp(dot(d,uV),-1.0,1.0);',
        ' vec3 pp=d-cs*uV; float pl=length(pp); vec3 pu=pl>1e-6?pp/pl:uE1;',
        ' float cr=(cs-uBeta)/(1.0-uBeta*cs);',                       // 逆光行差：飞船系 → 静止系
        ' float sr=sqrt(max(0.0,1.0-cr*cr));',
        ' vec3 dr=cr*uV+sr*pu;',
        ' float dl=uGamma*(1.0+uBeta*cr);',                           // 多普勒 δ
        ' float lod=max(0.0,log2(max(1.0,uPixAng*dl*uEqW/6.2831853)));', // 前方天空被压缩了 δ 倍
        ' vec3 c=textureLod(uEq,dirToEquirect(dr),lod).rgb*uSkyGain;',
        // 曲率航迹：从出发的恒星一直拉到船尾的一道「被抹平的空间」（静止系几何）。
        // 航迹轴线在船下方 uTO 处、方向 −v、长度 uTL；求视线与轴线的最近距离。
        ' vec3 trail=vec3(0.0);',
        ' if(uTrail>0.001){',
        '  vec3 A=-uE1*uTO; vec3 L=-uV;',
        '  float b=dot(dr,L); float dd=dot(dr,A); float e=dot(L,A);',
        '  float den=max(1.0-b*b,1e-9);',
        '  float sRay=(dd-b*e)/den; float aAx=(b*dd-e)/den;',       // 视线参数、轴线参数
        '  aAx=clamp(aAx,0.0,uTL); sRay=max(dot(A+L*aAx,dr),0.0);',
        '  vec3 P=A+L*aAx; float dist=length(dr*sRay-P);',
        '  float rr=dist/uTR; float x=aAx/uTL;',
        '  float lg=log(1.0+aAx/uTO);',
        '  vec3 off=dr*sRay-P; vec3 side=normalize(cross(L,A+1e-9*uE2));',
        '  float lat=dot(off,side)/uTR;',                              // 带内横向坐标（有符号）
        '  float fil=0.55+0.45*sin(lat*5.0+lg*1.3-uTime*0.8)*sin(lat*2.3-lg*0.7+1.7);',   // 顺着航迹的丝缕
        '  float flow=0.85+0.15*sin(lg*6.0-uTime*4.0);',
        '  float core=exp(-rr*rr*0.9)*(0.45+0.55*fil)*flow+exp(-rr*0.7)*0.12;',
        '  float I=uTrail*core*(1.0-0.7*x)*smoothstep(0.0,0.004,x);',
        '  trail=vec3(0.6,0.78,1.0)*I*0.5;',
        '  c*=1.0-0.55*uTrail*exp(-pow(rr-2.6,2.0)*0.8);',            // 被抹平的空间边缘：一圈暗边（像透镜的边）
        '  float flat_=exp(-rr*0.25)*uTrail;',                     // 航迹两侧：空间被熨平，星光被抹匀
        '  vec3 cs2=textureLod(uEq,dirToEquirect(dr),lod+4.0).rgb*uSkyGain;',
        '  c=mix(c,cs2*0.8,clamp(flat_,0.0,0.85));',
        ' }',
        ' c=bbShift(c+trail,dl);',
        ' float Lc=dot(c,vec3(0.2126,0.7152,0.0722)); c=max(mix(vec3(Lc),c,1.0+0.35*smoothstep(1.2,4.0,dl)),0.0);',   // 蓝移区更冷冽一点（只调饱和度）
        // 宇宙微波背景：温度用真实 γ（前方 T = 2.725·γR(1+βR)，γ=223 时 ≈1218 K）。
        // 角分布 T(θ') = Tpk/(1+(γθ')²) 是真实形状；和星空一样把角尺度按视觉 γ 放大（x = θ'·γv/3.5），否则它只有 0.1°。
        ' float x2=2.0*max(1.0-cs,0.0)*uGamma*uGamma/12.0;',
        ' float Tc=2.725*uGR*(1.0+uBR)/(1.0+x2);',
        ' vec3 cmb=planckRGB(Tc)*uCmbGain;',
        ' vec3 o=c*uExpo+cmb;',
        ' o*=1.0/(1.0+dot(o,vec3(0.2126,0.7152,0.0722))/3.0);',          // 亮部压缩：前方暴亮但保留层次
        ' gl_FragColor=vec4(o,1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });
    var triGeo = new T.BufferGeometry();
    triGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    var skyMesh = new T.Mesh(triGeo, skyMat); skyMesh.frustumCulled = false; skyMesh.renderOrder = -10;
    scene.add(skyMesh);

    // ================= 3. 星点（顶点着色器里正向光行差 + 多普勒，保持锐利） =================
    var starU = {
      uShip: { value: new T.Vector3() }, uV: { value: new T.Vector3(1, 0, 0) }, uE1: { value: new T.Vector3(0, 1, 0) },
      uBeta: { value: 0 }, uGamma: { value: 1 }, uExpo: { value: 1 }, uDpr: { value: 1 }, uGain: { value: 1 }
    };
    var starMat = new T.ShaderMaterial({
      uniforms: starU,
      vertexShader: G.blackbody + [
        'attribute float aTemp; attribute float aLum;',
        'uniform vec3 uShip, uV, uE1; uniform float uBeta, uGamma, uExpo, uDpr, uGain;',
        'varying vec3 vCol; varying float vSize;',
        'void main(){',
        ' vec3 rel=position-uShip; float r2=max(dot(rel,rel),1e-6); vec3 d=rel*inversesqrt(r2);',
        ' float c=clamp(dot(d,uV),-1.0,1.0);',
        ' float cs=(c+uBeta)/(1.0+uBeta*c);',                    // 光行差
        ' vec3 pp=d-c*uV; float pl=length(pp); vec3 pu=pl>1e-7?pp/pl:uE1;',
        ' vec3 ds=cs*uV+sqrt(max(0.0,1.0-cs*cs))*pu;',
        ' float dl=uGamma*(1.0+uBeta*c);',                       // 多普勒
        ' vec3 bb=planckRGB(aTemp*dl)/max(planckRGB(aTemp).g,1e-30);',
        ' vec3 col=bb*(aLum/r2)/(dl*dl)*uExpo*uGain;',             // 点光源：面亮度 planck(δT) × 立体角 1/δ²
        ' float I=max(col.r,max(col.g,col.b));',
        ' vCol=col;',
        ' float sz=(3.0+min(13.0,2.6*log2(1.0+I*3.0)))*uDpr;',
        ' vSize=sz; gl_PointSize=sz;',
        ' gl_Position=projectionMatrix*viewMatrix*vec4(ds*' + R_DIR.toFixed(1) + ',1.0);',
        ' if(I<0.0012) gl_Position=vec4(2.0,2.0,2.0,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vCol; varying float vSize; uniform float uDpr;',
        'void main(){',
        ' vec2 q=(gl_PointCoord-0.5)*vSize; float r2=dot(q,q); float s=0.72*uDpr;',
        ' float core=exp(-r2/(2.0*s*s));',
        ' float halo=0.035/(1.0+r2/(s*s*3.0));',
        ' float edge=1.0-smoothstep(vSize*0.25,vSize*0.5,sqrt(r2));',
        ' gl_FragColor=vec4(vCol*(core*1.5+halo)*edge,1.0);',
        '}'
      ].join('\n'),
      transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending
    });
    var starPts = null;

    // 星场：近处 3D 恒星（有视差）+ 远处星表（只有方向）
    function buildStars(u, P0, v, d, skyStars) {
      if (starPts) { scene.remove(starPts); starPts.geometry.dispose(); starPts = null; }
      var r = U.mulberry(U.hashStr(u.seed + '#warpstars'));
      var pos = [], tem = [], lum = [];
      var types = [['M', 0.42, 3100, 0.05], ['K', 0.25, 4400, 0.35], ['G', 0.13, 5700, 1.1], ['F', 0.09, 6800, 3.2], ['A', 0.07, 9000, 12], ['B', 0.035, 15000, 120], ['O', 0.005, 32000, 1500]];
      function pickType() { var x = r(), acc = 0; for (var i = 0; i < types.length; i++) { acc += types[i][1]; if (x < acc) return types[i]; } return types[0]; }
      var mid = v.clone().multiplyScalar(d / 2);
      // 近处星：以航线中点为心的银盘切片
      var N1 = 30000, half = Math.max(260, d * 0.5 + 200);
      for (var i = 0; i < N1; i++) {
        var ty = pickType();
        var x = mid.x + (r() * 2 - 1) * half, z = mid.z + (r() * 2 - 1) * half, y = mid.y + U.gauss(r) * 45;
        pos.push(x, y, z); tem.push(ty[2] * (0.85 + 0.3 * r())); lum.push(KFLUX * ty[3] * Math.exp(U.gauss(r) * 0.6));
      }
      // 航线附近再撒一些，保证巡航时有近星掠过（视差 + 光行差下「先聚在前方、最后一刻甩向身后」）
      for (var k = 0; k < 160; k++) {
        var ty2 = pickType(), along = -10 + r() * (d + 20), rad = 0.6 + Math.pow(r(), 0.7) * 9, ang = r() * Math.PI * 2;
        var e1 = new T.Vector3(0, 1, 0).addScaledVector(v, -v.y).normalize(), e2 = new T.Vector3().crossVectors(v, e1);
        var p = v.clone().multiplyScalar(along).addScaledVector(e1, Math.cos(ang) * rad * 0.5).addScaledVector(e2, Math.sin(ang) * rad);
        pos.push(p.x, p.y, p.z); tem.push(ty2[2]); lum.push(KFLUX * U.clamp(ty2[3], 0.2, 3) * (0.5 + r()));
      }
      // 远处星（无视差）：优先 galaxy 的星表
      var FAR = 20000;
      if (skyStars && skyStars.dirs && skyStars.dirs.length) {
        var n = skyStars.dirs.length / 3;
        for (var j = 0; j < n; j++) {
          var I = 1.5 * Math.pow(10, -0.4 * (skyStars.mags ? skyStars.mags[j] : 6));
          pos.push(skyStars.dirs[3 * j] * FAR, skyStars.dirs[3 * j + 1] * FAR, skyStars.dirs[3 * j + 2] * FAR);
          tem.push(skyStars.temps ? skyStars.temps[j] : 6000); lum.push(I * FAR * FAR);
        }
      } else {
        for (var m = 0; m < 26000; m++) {
          var lat = r() < 0.65 ? U.gauss(r) * 0.16 : Math.asin(r() * 2 - 1), lon = r() * Math.PI * 2;
          var cl = Math.cos(lat), mag = 3.2 + 5.2 * Math.pow(r(), 0.45);
          if (m < 40) mag = -0.5 + r() * 2.5;
          var ty3 = pickType();
          pos.push(Math.cos(lon) * cl * FAR, Math.sin(lat) * FAR, Math.sin(lon) * cl * FAR);
          tem.push(ty3[2] * (0.8 + 0.4 * r())); lum.push(1.5 * Math.pow(10, -0.4 * mag) * FAR * FAR);
        }
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('aTemp', new T.Float32BufferAttribute(tem, 1));
      g.setAttribute('aLum', new T.Float32BufferAttribute(lum, 1));
      starPts = new T.Points(g, starMat); starPts.frustumCulled = false; starPts.renderOrder = 0;
      scene.add(starPts);
    }

    // ================= 4. 有名字的恒星（星系）：体积感的圆盘 + 光晕 + 星芒，JS 里逐帧算相对论 =================
    var bbGeo = new T.PlaneGeometry(2, 2);
    var bbVS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
    var bbFS = [
      'uniform vec3 uSurf, uGlow; uniform float uDisk, uSpike, uBH; varying vec2 vUv;',
      'void main(){',
      ' vec2 p=vUv*2.0-1.0; float r=length(p); vec3 col=vec3(0.0); float a=0.0;',
      ' if(uBH>0.5){',
      '  float ring=exp(-pow((r-uDisk*1.5)/(uDisk*0.12),2.0));',
      '  float disk=exp(-pow(p.y/(uDisk*0.18),2.0))*smoothstep(uDisk*4.5,uDisk*1.4,abs(p.x))*step(uDisk*1.02,r);',
      '  col=uGlow*(ring*1.4+disk*0.9)+uGlow*0.25*exp(-r*5.0);',
      '  a=1.0-smoothstep(uDisk*0.96,uDisk*1.02,r);',
      ' } else {',
      '  if(r<uDisk){ float x=r/uDisk; float mu=sqrt(1.0-x*x); col+=uSurf*(0.38+0.62*mu)*smoothstep(1.0,0.97,x); }',
      '  float o=max(r-uDisk,0.0);',
      '  col+=uSurf*0.22*exp(-o/(uDisk*0.35+1e-4))*step(uDisk,r);',
      '  float glow=exp(-r*9.0)*0.7+exp(-r*3.2)*0.22+0.06/(1.0+r*r*400.0);',
      '  float sp=(exp(-abs(p.y)*110.0)*exp(-abs(p.x)*3.5)+exp(-abs(p.x)*110.0)*exp(-abs(p.y)*3.5));',
      '  col+=uGlow*(glow+sp*uSpike)*(1.0-smoothstep(0.75,1.0,r));',
      ' }',
      ' gl_FragColor=vec4(col,a);',
      '}'
    ].join('\n');
    var named = [];   // { s, pos(Vector3 相对 P0), mesh, T, L, R, isBH }
    function buildNamed(u, P0, fromId, toId) {
      named.forEach(function (n) { scene.remove(n.mesh); n.mesh.material.dispose(); }); named = [];
      u.systems.forEach(function (s) {
        var mat = new T.ShaderMaterial({
          uniforms: { uSurf: { value: new T.Vector3() }, uGlow: { value: new T.Vector3() }, uDisk: { value: 0 }, uSpike: { value: 0 }, uBH: { value: s.type === '黑洞' ? 1 : 0 } },
          vertexShader: bbVS, fragmentShader: bbFS, transparent: true, depthTest: false, depthWrite: false,
          blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor
        });
        var mesh = new T.Mesh(bbGeo, mat); mesh.frustumCulled = false; mesh.renderOrder = s.type === '黑洞' ? 2 : 1;
        scene.add(mesh);
        var boost = (s.id === toId || s.id === fromId) ? 6 : 3;     // 已知星系略微提亮（它们是地图上的「名字」）
        named.push({ s: s, pos: U.sysWorld(u, s).sub(P0), mesh: mesh, T: U.starTemp(s), L: (LUM[s.type] != null ? LUM[s.type] : 1) * boost, R: (RAD[s.type] || 1) * R_SUN_VIS, isBH: s.type === '黑洞' });
      });
    }

    // ================= 5. 舱窗 pass：涟漪（空间被抹平）、冬眠结霜、二维画化、玻璃反光 =================
    var cockpit = new T.ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1.7 }, uFrost: { value: 0 }, uPaint: { value: 0 },
        uRipple: { value: 0 }, uRippleA: { value: 0 }, uRippleC: { value: new T.Vector2(0.5, 0.5) }, uGlare: { value: 0 }, uDim: { value: 1 }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: G.noise + [
        'uniform sampler2D tDiffuse; uniform float uTime, uAspect, uFrost, uPaint, uRipple, uRippleA, uGlare, uDim; uniform vec2 uRippleC; varying vec2 vUv;',
        'float luma(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }',
        // 冰晶：Voronoi 晶面的棱（细亮线）
        'vec2 h22(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }',
        'float vorEdge(vec2 p){ vec2 i=floor(p), f=fract(p); float d1=8.0, d2=8.0;',
        ' for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 o=h22(i+g); vec2 r=g+o-f; float d=dot(r,r); if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }',
        ' return sqrt(d2)-sqrt(d1); }',
        'void main(){',
        ' vec2 uv=vUv; vec2 asp=vec2(uAspect,1.0);',
        // 空间被抹平：一圈折射涟漪从船尾方向扩散
        ' if(uRippleA>0.001){',
        '  vec2 dd=(vUv-uRippleC)*asp; float rr=length(dd); float w=rr-uRipple;',
        '  float ring=exp(-w*w/0.0025)*(0.6+0.4*snoise(vec3(dd*8.0,uTime)));',
        '  float inner=smoothstep(uRipple,uRipple-0.25,rr);',
        '  uv-=(dd/max(rr,1e-4))/asp*(ring*0.05+inner*0.008*sin(rr*60.0-uTime*8.0))*uRippleA;',
        ' }',
        ' float rglow=0.0; if(uRippleA>0.001){ vec2 dd=(vUv-uRippleC)*asp; float w=length(dd)-uRipple; rglow=exp(-w*w/0.0012)*uRippleA; }',
        // 冬眠结霜：从舷窗边缘向内长（径向羽状冰晶 + 细碎晶面 + 散射雾 + 模糊折射），中心留一块清晰的视窗
        ' float fr=0.0, vein=0.0;',
        ' vec2 q=(vUv-0.5)*asp;',
        ' float e=length(q*vec2(0.74,1.1)); float ang=atan(q.y,q.x);',
        ' if(uFrost>0.001){',
        '  float n=fbm3(vec3(q*3.5,1.3));',
        '  vec2 qs=q+vec2(n*0.04);',
        '  float v1=vorEdge(qs*vec2(9.0,14.0)+vec2(ang*0.0,0.0));',
        '  float v2=vorEdge(qs*36.0+3.7);',
        '  float f3=1.0-abs(snoise(vec3(q*90.0,2.9)));',
        '  float nd=pow(1.0-abs(snoise(vec3(ang*30.0,e*2.0,0.5))),30.0);',    // 由外向内的冰针
        '  vein=(1.0-smoothstep(0.0,0.025,v1))*0.22*(0.5+n)+(1.0-smoothstep(0.0,0.06,v2))*0.3+pow(f3,8.0)*0.35+nd*0.55;',
        '  float f2=v2;',
        '  float thr=1.02-uFrost*0.72;',
        '  fr=smoothstep(thr-0.02,thr+0.14,e+n*0.22+vein*0.05);',
        '  vein*=fr;',
        '  uv+=vec2(cos(ang),sin(ang))*0.004*fr*(0.5+f2);',
        ' }',
        ' vec3 c=texture2D(tDiffuse,uv).rgb;',
        ' c+=vec3(0.5,0.7,1.0)*rglow*0.05+c*rglow*0.8;',
        ' if(fr>0.001){',
        '  vec3 bl=vec3(0.0); for(int i=0;i<16;i++){ float fi=float(i); float a=fi*2.39996; float rad=0.003+0.02*fract(fi*0.618+0.3); bl+=texture2D(tDiffuse,uv+vec2(cos(a),sin(a)*asp.x)*rad*fr/asp.x).rgb; } bl/=16.0;',
        '  float L=dot(bl,vec3(0.2126,0.7152,0.0722));',
        '  c=mix(c,bl*0.6,fr*0.92);',
        '  c+=vec3(0.6,0.74,0.95)*(0.045*fr+vein*(0.2+0.9*L));',
        ' }',
        // 二维画化：从视野边缘（船尾方向）一瞬间吞进来。被吞没的部分变成一幅画：沿流场拖出的笔触、颜料分层、画布纹理，没有纯黑。
        ' if(uPaint>0.001){',
        '  float edge=e+fbm3(vec3(q*3.0,7.0))*0.16;',
        '  float thr=1.15-uPaint*1.55;',
        '  float m=smoothstep(thr-0.012,thr+0.012,edge);',
        '  if(m>0.0){',
        '   vec3 acc=vec3(0.0); vec2 pp=vUv; float fa0=0.0;',
        '   for(int i=0;i<10;i++){',
        '    vec3 fq=vec3(pp*vec2(asp.x,1.0)*2.4,3.0);',
        '    float fa=snoise(fq)*3.14159+1.2*snoise(fq*2.3+5.0);',
        '    if(i==0) fa0=fa;',
        '    pp+=vec2(cos(fa),sin(fa))*0.0038;',
        '    acc+=texture2D(tDiffuse,pp).rgb;',
        '   }',
        '   vec3 pc=acc/10.0; pc=pc/(1.0+pc)*1.4;',
        '   vec2 ro=vec2(cos(fa0)*q.x+sin(fa0)*q.y,-sin(fa0)*q.x+cos(fa0)*q.y);',     // 笔触顺着流场
        '   float st=snoise(vec3(ro*vec2(7.0,95.0),4.0))*0.5+0.5;',
        '   float st2=pow(1.0-abs(snoise(vec3(ro*vec2(3.0,40.0)+7.0,6.0))),18.0);',
        '   float sw=fbm3(vec3(q*2.2,9.0))*0.5+0.5;',
        '   vec3 ground=mix(vec3(0.018,0.026,0.07),vec3(0.05,0.09,0.22),sw*0.75+st*0.3);',
        '   ground+=mix(vec3(0.16,0.24,0.5),vec3(0.55,0.45,0.22),step(0.72,sw))*st2*0.5;',
        '   vec3 lev=floor(pc*6.0+st*0.9)/6.0;',
        '   float lum=dot(lev,vec3(0.3,0.5,0.2));',
        '   vec3 paint=ground+lev*vec3(1.05,1.0,0.92)*1.2;',
        '   paint=mix(vec3(dot(paint,vec3(0.33))),paint,1.35);',
        '   float weave=0.88+0.06*sin(vUv.x*1400.0)*sin(vUv.y*900.0)+0.06*snoise(vec3(vUv*vec2(700.0,500.0),2.0));',
        '   paint*=weave*(0.92+0.16*st);',
        '   c=mix(c,max(paint,vec3(0.0)),m);',
        '  }',
        '  float ln=exp(-pow((edge-thr)/0.006,2.0))*step(uPaint,0.985);',        // 平面的前沿：一条锐利的亮线
        '  c+=vec3(1.0,0.97,0.9)*ln*1.6;',
        ' }',
        // 玻璃：前方强光照亮玻璃上的细划痕和指纹（克制）
        ' if(uGlare>0.001){',
        '  float sm=smoothstep(0.45,0.9,fbm3(vec3(q*3.0,11.0))*0.5+0.5);',
        '  float scr=pow(abs(snoise(vec3(q.x*2.0+q.y*7.0,q.y*0.6,3.0))),40.0);',
        '  float rd=exp(-length(q)*2.2);',
        '  c+=vec3(0.55,0.68,1.0)*uGlare*(sm*0.03+scr*0.25)*rd;',
        ' }',
        ' c*=uDim;',
        ' gl_FragColor=vec4(c,1.0);',
        '}'
      ].join('\n')
    });

    // ================= 状态 =================
    var W = null;            // 本次航行的全部数据与时间轴
    var hud = null, resolveFn = null, done = false, fired = {}, keyH = null;
    var tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), tmpM = new T.Matrix4();

    function makeDemo(opts) {
      var variant = opts.variant || '';
      var seed = E.params.get('seed') || 'warp-demo-7';
      var u = SIM.createUniverse(seed);
      SIM.simulateTo(u, variant.indexOf('cryo') >= 0 ? 40 : 120);
      var cryo = variant === 'cryo' || variant === 'caught-cryo';
      var from = u.ship.at, best = null;
      u.systems.forEach(function (s) {
        if (s.id === from) return; var d = u.D[from][s.id];
        var want = cryo ? 32 : 66, sc = Math.abs(d - want) + (s.type === '黑洞' ? 30 : 0);
        if (!best || sc < best.sc) best = { s: s, sc: sc };
      });
      var mode = cryo ? '0.03' : 'w0.99999';
      var r = SIM.travel(u, best.s.id, mode);
      var trip = r.trip;
      if (variant.indexOf('caught') === 0 && !trip.caught) { trip = Object.assign({}, trip, { caught: true, died: '二维', frac: 0.42, arrive: trip.depart + trip.ext * 0.42 }); }
      return { u: u, from: from, to: best.s.id, mode: mode, trip: trip, res: r.report };
    }

    function setup(o) {
      var u = o.u, trip = o.trip;
      var fromId = typeof o.from === 'object' ? o.from.id : (o.from != null ? o.from : trip.from);
      var toId = typeof o.to === 'object' ? o.to.id : (o.to != null ? o.to : trip.to);
      var fromS = u.systems[fromId], toS = u.systems[toId];
      var mode = String(o.mode || (trip.warp ? 'w0.999' : '0.03'));
      var warp = mode.charAt(0) === 'w';
      var betaR = warp ? +mode.slice(1) : +mode;
      if (!(betaR > 0 && betaR < 1)) betaR = warp ? 0.999 : 0.03;
      var P0 = U.sysWorld(u, fromS), P1 = U.sysWorld(u, toS);
      var v = P1.clone().sub(P0); var dVis = v.length(); v.normalize();
      var e1 = new T.Vector3(0, 1, 0).addScaledVector(v, -v.y).normalize(), e2 = new T.Vector3().crossVectors(v, e1).normalize();
      var w = {
        u: u, trip: trip, fromS: fromS, toS: toS, mode: mode, warp: warp, betaR: betaR, gammaR: 1 / Math.sqrt(1 - betaR * betaR),
        NR: -Math.log10(1 - betaR), d: trip.d || u.D[fromId][toId], dVis: dVis, P0: P0, v: v, e1: e1, e2: e2,
        ext: trip.ext, ship: trip.ship, depart: trip.depart != null ? trip.depart : u.time, caught: !!trip.caught, frac: trip.frac != null ? trip.frac : 1,
        bio: trip.bio != null ? trip.bio : (warp ? trip.ship : trip.ship / 50)
      };
      w.eps0 = 0.0011; w.eps1 = 0.0013;
      w.a = Math.min(0.25, dVis * 0.004); w.b = w.a;
      // 时间轴（秒）
      if (warp) w.tl = { eng: 1.3, a0: 1.75, a1: 5.2, sw0: 3.1, sw1: 5.1, c1: 10.0, d1: 11.8, card: 12.0, end: 15.4 };
      else w.tl = { b0: 0.4, b1: 2.6, cin: 2.4, f0: 2.6, f1: 5.6, c0: 1.0, c1: 10.6, wake: 10.6, d1: 12.0, card: 12.2, end: 15.6 };
      if (w.caught) {
        // 被追上：在巡航中途的某一刻（与 frac 对应的航程位置），画化在 0.7 秒内吞没一切
        w.tl.hit = warp ? w.tl.sw1 + 2.6 : 7.4;
        w.tl.card = w.tl.hit + 3.4; w.tl.end = w.tl.card + 3.6;
      }
      // 二维前沿到达时的航程位置
      w.sHit = w.caught ? Math.max(w.a * 1.5, Math.min(dVis * 0.98, dVis * w.frac)) : dVis;
      return w;
    }

    // ---------- 时间轴：一切都是 t 的纯函数 ----------
    function easeIO(x) { return U.ease.sine(U.clamp(x, 0, 1)); }
    function logLerp(a, b, x) { return a * Math.pow(b / a, x); }
    function stateAt(t) {
      var w = W, tl = w.tl, st = { t: t };
      var tHit = w.caught ? tl.hit : Infinity;
      var tq = Math.min(t, tHit);          // 被画化之后一切冻结
      st.frozen = t >= tHit;
      if (w.warp) {
        // β：9 一位位亮起（N = −log10(1−β)）
        var N = 0;
        if (tq > tl.a0) N = w.NR * Math.pow(U.seg(tq, tl.a0, tl.a1), 3.0);   // 先慢（回望时能看清红移的过程），后面 9 一位位冲上去
        if (tq > tl.c1) N = w.NR * (1 - easeIO(U.seg(tq, tl.c1, tl.d1)));
        st.N = N;
        st.beta = N >= w.NR - 1e-9 ? w.betaR : 1 - Math.pow(10, -N);
        st.gamma = N >= w.NR - 1e-9 ? w.gammaR : gammaOfN(N);
        var eta = rapidityOfN(N), ETAC = 2.75;
        var etaV = ETAC * Math.tanh(eta / ETAC);
        st.betaV = Math.tanh(etaV); st.gammaV = Math.cosh(etaV);
        // 航程位置
        var s;
        if (tq <= tl.a0) s = w.eps0;
        else if (tq <= tl.sw1) s = logLerp(w.eps0, w.a, Math.pow(U.seg(tq, tl.a0, tl.sw1), 1.4));
        else if (tq <= tl.c1) s = w.a + (w.dVis - w.a - w.b) * U.seg(tq, tl.sw1, tl.c1);
        else s = w.dVis - logLerp(w.b, w.eps1, U.ease.out(U.seg(tq, tl.c1, tl.d1)));
        if (w.caught && tq > tl.sw1) s = w.a + (w.sHit - w.a) * U.seg(tq, tl.sw1, tHit);
        st.s = s;
        // 镜头：始终朝向前方目的地，曲率启动时仅做轻微航向对准与广角推力，不做 180° 大转身
        var sw = easeIO(U.seg(t, tl.eng, tl.sw1));
        st.phi = U.lerp(0.16, 0.0, sw) + 0.014 * Math.sin(t * 0.23);
        st.pitch = U.lerp(0.04, 0.0, sw) - 0.13 * easeIO(U.seg(t, tl.d1 - 0.6, tl.card + 0.8));   // 抵达：目的地星升到字幕上方
        st.fov = U.lerp(58, 74, easeIO(U.seg(t, tl.eng, tl.sw1))) - 10 * easeIO(U.seg(t, tl.c1, tl.d1));
        st.shake = 0.006 * Math.exp(-Math.max(0, t - tl.eng) * 2.2) * (t > tl.eng ? 1 : 0) + 0.0012 * U.seg(t, tl.a0, tl.a1) * (1 - U.seg(t, tl.c1, tl.d1));
        st.trail = U.smoothstep(tl.eng, tl.eng + 0.7, t);
        st.ripple = U.seg(t, tl.eng, tl.eng + 1.6); st.rippleA = t > tl.eng ? Math.sin(Math.PI * st.ripple) : 0;
        st.frost = 0;
        st.phase = t < tl.eng ? 'idle' : t < tl.sw1 ? 'accel' : t < tl.c1 ? 'cruise' : t < tl.d1 ? 'decel' : 'arrive';
      } else {
        var bx = U.smoothstep(tl.b0, tl.b1, tq) * (1 - U.smoothstep(tl.c1, tl.d1, tq));
        st.beta = w.betaR * bx; st.gamma = 1 / Math.sqrt(1 - st.beta * st.beta); st.betaV = st.beta; st.gammaV = st.gamma; st.N = -Math.log10(1 - st.beta);
        var x = U.seg(tq, tl.c0, tl.c1);
        st.s = w.eps0 + (w.dVis - w.eps0 - w.eps1) * (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x));
        if (w.caught) st.s = w.eps0 + (w.sHit - w.eps0) * U.seg(tq, tl.c0, tHit) * U.seg(tq, tl.c0, tHit);
        st.phi = 0.05 + 0.01 * Math.sin(t * 0.21); st.pitch = 0.015; st.fov = 60;
        st.shake = 0.0006 * (1 - U.seg(t, tl.f0, tl.f1));
        st.trail = 0; st.ripple = 0; st.rippleA = 0;
        st.frost = 0.92 * easeIO(U.seg(t, tl.f0, tl.f1)) * (1 - easeIO(U.seg(t, tl.wake, tl.wake + 1.4)));
        if (w.caught) st.frost = 0.92 * easeIO(U.seg(t, tl.f0, tl.f1));
        st.phase = t < tl.cin ? 'depart' : t < tl.wake ? 'sleep' : t < tl.d1 ? 'wake' : 'arrive';
      }
      st.paint = w.caught ? U.ease.cubicOut(U.seg(t, tHit, tHit + 0.75)) : 0;
      // 时钟：按航程比例
      var f = U.clamp((st.s - w.eps0) / Math.max(1e-9, (w.caught ? w.sHit : w.dVis - w.eps1) - w.eps0), 0, 1);
      var span = w.caught ? w.frac : 1;
      st.f = f;
      st.ext = w.ext * span * f; st.shipT = w.ship * span * f; st.bioT = w.bio * span * f;
      st.remain = Math.max(0, w.d * (1 - span * f));
      // 曝光自适应（眼睛 / 传感器）：前方面亮度 ∝ planck(δT) 暴涨，收一点
      var dF = st.gammaV * (1 + st.betaV);
      var gF = U.planckRGB(5500 * dF)[1] / U.planckRGB(5500)[1];
      st.expoSky = w.warp ? 1 / (1 + (gF - 1) * 0.08) : 1;
      st.expo = w.warp ? 1 / (1 + 0.15 * (dF - 1)) : 1;
      st.dim = w.warp ? 1 : 1 - 0.35 * U.seg(t, tl.f0, tl.f1) * (1 - U.seg(t, tl.wake, tl.wake + 1.2));
      return st;
    }

    // ---------- HUD ----------
    function buildHud() {
      var w = W, root = U.el('div', 'wp-hud passthrough');
      var modeTxt = w.warp ? '曲率驱动 · ' + w.betaR + 'c' : '常规推进 · ' + w.betaR + 'c · 冬眠航行';
      root.innerHTML = [
        '<div class="wp-route"><div class="wp-mode"><b></b>' + modeTxt + '</div>',
        '<div class="wp-names">' + U.esc(w.fromS.name) + '<i>→</i>' + U.esc(w.toS.name) + '</div>',
        '<div class="wp-dist">剩余 <span class="num" data-k="remain"></span> 光年</div></div>',
        '<div class="wp-speed"><div class="wp-lab">速度 β = v / c</div><div class="wp-beta" data-k="beta"></div>',
        '<div class="wp-gamma"><span>洛伦兹因子 γ</span><b data-k="gamma"></b></div></div>',
        '<div class="wp-clocks">',
        ' <div class="wp-clock ship"><div class="wp-lab">船上 · 固有时</div><div class="v" data-k="ship"></div><div class="s" data-k="shipS"></div></div>',
        ' <div class="wp-sep"></div>',
        ' <div class="wp-clock uni"><div class="wp-lab">宇宙 · ' + U.esc(w.fromS.name) + '静止系</div><div class="v" data-k="uni"></div><div class="s" data-k="uniS"></div></div>',
        (w.warp ? '' : ' <div class="wp-sep"></div><div class="wp-clock bio"><div class="wp-lab">舰员生理 · 冬眠 1/50</div><div class="v" data-k="bio"></div><div class="s" data-k="bioS"></div></div>'),
        '</div>',
        '<div class="wp-prog"><i data-k="prog"></i><em style="left:0">' + U.esc(w.fromS.name) + '</em><em style="right:0">' + U.esc(w.toS.name) + '</em></div>',
        '<div class="wp-note" data-k="note"></div>',
        '<div class="wp-cap cine-line" data-k="cap"></div>',
        '<div class="wp-ret" data-k="retTo"><i></i><span>' + U.esc(w.toS.name) + '<em>目的地 · ' + U.esc(w.toS.type) + '</em></span></div>',
        '<div class="wp-ret home" data-k="retFrom"><i></i><span>' + U.esc(w.fromS.name) + '<em>出发地</em></span></div>',
        (w.warp ? '' : '<div class="wp-vitals" data-k="vitals"><div><span>心率</span><b data-k="hr"></b> 次/分</div><div><span>体温</span><b data-k="temp"></b> ℃</div><canvas width="360" height="68" data-k="ecg"></canvas></div>')
      ].join('');
      var card = U.el('div', 'wp-card passthrough' + (w.caught ? ' bad' : ''));
      card.innerHTML = cardHtml();
      var skip = U.el('button', 'wp-skip', '跳过 ›');
      skip.addEventListener('click', function (e) { e.stopPropagation(); finish(true); });
      var refs = {}; root.querySelectorAll('[data-k]').forEach(function (n) { refs[n.getAttribute('data-k')] = n; });
      return { root: root, card: card, skip: skip, refs: refs, last: {} };
    }
    function cardHtml() {
      var w = W, tr = w.trip;
      var shipY = w.caught ? w.ship * w.frac : w.ship, extY = w.caught ? w.ext * w.frac : w.ext;
      var y0 = w.depart, y1 = y0 + extY;
      var big = function (cls, l, b) { return '<div class="it ' + cls + '"><div class="l">' + l + '</div><div class="b">' + b + '</div></div>'; };
      var row, k, sub;
      if (w.caught) {
        k = '航行中断 · 纪元 ' + Math.floor(y1) + ' 年';
        row = big('', '船上', fmtCard(shipY)) + '<div class="dot">·</div>' + big('uni', '宇宙', fmtCard(extY));
        sub = '二维平面以光速扩张。它到达的那一瞬间之前，<b>它发出的任何一缕光都不可能先到达你</b>——看见它，和被它吞没，是同一刻。<br>' + U.esc(w.fromS.name) + ' 到 ' + U.esc(w.toS.name) + ' 之间，多了一幅画。';
      } else if (w.warp) {
        k = '抵达 ' + U.esc(w.toS.name);
        row = big('', '船上', fmtCard(shipY)) + '<div class="dot">·</div>' + big('uni', '宇宙', fmtCard(extY));
        sub = '你在纪元 <b>' + Math.floor(y0) + '</b> 年离开' + U.esc(w.fromS.name) + '。此刻，' + U.esc(w.toS.name) + '是纪元 <b>' + Math.floor(y1) + '</b> 年。<br>γ = ' + fmtGamma(w.gammaR) + '：外面的每一年，船上只过了 ' + fmtDur(1 / w.gammaR) + '。曲率航迹留在了两端——它会存在很久。';
      } else {
        k = '抵达 ' + U.esc(w.toS.name) + ' · 冬眠舱解冻';
        row = big('uni', '宇宙', fmtCard(extY)) + '<div class="dot">·</div>' + big('', '船上', fmtCard(shipY)) + '<div class="dot">·</div>' + big('bio', '舰员', fmtCard(w.bio));
        sub = 'γ = ' + w.gammaR.toFixed(5) + '：常规推进里，船上的钟和宇宙几乎走得一样快。<br>任何能源都把飞船推不到光速附近——跨越星海的代价，只能用冬眠去付。此刻是纪元 <b>' + Math.floor(y1) + '</b> 年。';
      }
      return '<div class="k">' + k + '</div><div class="row">' + row + '</div><div class="sub">' + sub + '</div>';
    }
    function fmtCard(y) { if (y < 1 / 365.25) return Math.max(1, Math.round(y * 8766)) + ' 小时'; if (y < 1) return Math.max(1, Math.round(y * 365.25)) + ' 天'; if (y < 100) return (Math.floor(y * 10) / 10).toFixed(1) + ' 年'; return Math.floor(y).toLocaleString('en-US') + ' 年'; }
    function fmtDur(y) { var d = y * 365.25; if (d < 1) return (d * 24).toFixed(1) + ' 小时'; if (d < 60) return d.toFixed(1) + ' 天'; return U.fmtYears(y); }
    function setTxt(key, html) { if (!hud) return; var r = hud.refs[key]; if (r && hud.last[key] !== html) { r.innerHTML = html; hud.last[key] = html; } }
    function setOn(el, on) { if (el && el.classList.contains('on') !== !!on) el.classList.toggle('on', !!on); }

    function caption(t) {
      var w = W, tl = w.tl, c = '';
      function win(a, b) { return t >= a && t < b; }
      if (w.warp) {
        if (win(0.4, tl.eng)) c = '锁定航向 · ' + w.toS.name;
        else if (win(tl.eng, tl.eng + 2.0)) c = '曲率驱动启动 —— 空间向前折叠';
        else if (win(tl.eng + 2.1, tl.sw1 - 0.2)) c = '速度逼近光速，前方星光蓝移暴亮';
        else if (win(tl.sw1, tl.sw1 + 2.4) && !(w.caught && t > tl.hit)) c = '整片星空向前方聚拢';
        else if (!w.caught && win(tl.c1 + 0.1, tl.d1)) c = '减速 —— 星星回到原来的位置';
      } else {
        if (win(0.3, tl.cin + 0.4)) c = '常规推进的极限：0.03c';
        else if (win(tl.cin + 0.6, tl.cin + 3.1)) c = '任何能源，都接近不了光速';
        else if (win(tl.cin + 3.3, tl.cin + 5.8)) c = '舰员进入冬眠 —— 等外面的几千年过去';
        else if (!w.caught && win(tl.wake + 0.2, tl.d1)) c = '冬眠舱解冻';
      }
      if (w.caught && t >= tl.hit + 0.9 && t < tl.card) c = '没有预警。二维平面以光速追来';
      return c;
    }

    function drawEcg(t, rate) {
      var cv = hud.refs.ecg; if (!cv) return; var g = cv.getContext('2d'), Wd = cv.width, H = cv.height;
      g.clearRect(0, 0, Wd, H); g.strokeStyle = 'rgba(159,232,255,0.85)'; g.lineWidth = 2; g.beginPath();
      var per = 60 / Math.max(rate, 0.5);
      for (var x = 0; x <= Wd; x += 2) {
        var tt = t - (Wd - x) / Wd * 3.0, ph = ((tt % per) + per) % per / per;
        var y = 0; var k = ph * per;
        if (k < 0.06) y = Math.sin(k / 0.06 * Math.PI) * 0.15; else if (k > 0.12 && k < 0.16) y = -0.2; else if (k >= 0.16 && k < 0.2) y = 1.0 - Math.abs(k - 0.18) / 0.02; else if (k > 0.2 && k < 0.24) y = -0.3; else if (k > 0.34 && k < 0.5) y = Math.sin((k - 0.34) / 0.16 * Math.PI) * 0.25;
        var py = H * 0.62 - y * H * 0.5; if (x === 0) g.moveTo(x, py); else g.lineTo(x, py);
      }
      g.stroke();
    }

    function updateHud(st) {
      if (!hud) return;
      var w = W, tl = w.tl, t = st.t;
      setOn(hud.root, t > 0.15 && t < tl.card + 0.2);
      if (hud.root.classList.contains('dead') !== !!st.frozen) hud.root.classList.toggle('dead', !!st.frozen);
      var bH = w.warp ? betaFmtN(st.N, w.NR, w.betaR) : betaFmtN(st.N, 99, w.betaR).replace(/<[^>]+>/g, '');
      setTxt('beta', bH + '<small>&lt; c</small>');
      setTxt('gamma', fmtGamma(st.gamma));
      setTxt('remain', st.remain < 10 ? st.remain.toFixed(3) : st.remain.toFixed(2));
      var y = w.depart + st.ext;
      setTxt('ship', fmtShipClock(st.shipT));
      setTxt('shipS', st.gamma < 1.001 ? '与宇宙几乎同步 · γ ≈ ' + st.gamma.toFixed(5) : '比宇宙慢 ' + fmtGamma(st.gamma) + ' 倍');
      setTxt('uni', fmtEpoch(y, w.warp ? 2 : 1));
      setTxt('uniS', '+' + (st.ext < 1000 ? st.ext.toFixed(2) : Math.floor(st.ext).toLocaleString('en-US')) + ' 年');
      if (!w.warp) {
        setTxt('bio', '+' + st.bioT.toFixed(2) + ' 年');
        setTxt('bioS', '衰老速度 ×1/50');
        var sleep = U.seg(t, tl.f0, tl.f1) * (1 - U.seg(t, tl.wake, tl.wake + 1.2));
        if (w.caught) sleep = U.seg(t, tl.f0, tl.f1);
        var hr = U.lerp(68, 2.2, sleep), tmp = U.lerp(36.8, 4.0, sleep);
        setTxt('hr', hr.toFixed(hr < 10 ? 1 : 0)); setTxt('temp', tmp.toFixed(1));
        setOn(hud.refs.vitals, t > 1.0 && t < tl.card);
        if (!st.frozen) drawEcg(t, hr);
      }
      hud.refs.prog.style.width = (100 * (w.caught ? w.frac * st.f : st.f)).toFixed(2) + '%';
      // CMB 注释（真实效应）
      var Tfront = 2.725 * st.gamma * (1 + st.beta);
      var note = '';
      if (w.warp && st.phase === 'cruise' && t > tl.sw1 + 1.6 && !st.frozen) {
        note = Tfront > 800 ? '前方那团暗红的光不是恒星：是 <b>2.725 K</b> 的宇宙微波背景，被你的速度蓝移到了 <b>' + Math.round(Tfront) + ' K</b>——烧红的铁的颜色。'
          : '前方的宇宙微波背景被蓝移到 <b>' + Math.round(Tfront) + ' K</b>（2.725 K × 2γ）——还在红外，肉眼看不见。';
      }
      if (note) setTxt('note', note); setOn(hud.refs.note, !!note);
      var cap = caption(t); if (cap) setTxt('cap', cap); setOn(hud.refs.cap, !!cap);
      setOn(hud.card, t >= tl.card);
    }
    function placeReticle(el, dirShip, on) {
      if (!el) return;
      tmpV.copy(dirShip).multiplyScalar(R_DIR).project(camera);
      var vis = on && tmpV.z < 1 && Math.abs(tmpV.x) < 0.92 && Math.abs(tmpV.y) < 0.88;
      setOn(el, vis);
      if (vis) { el.style.left = ((tmpV.x * 0.5 + 0.5) * E.size.w).toFixed(1) + 'px'; el.style.top = ((-tmpV.y * 0.5 + 0.5) * E.size.h).toFixed(1) + 'px'; }
    }

    // ---------- 每帧：把 t 的状态写进 uniform / 网格 ----------
    var dirTo = new T.Vector3(), dirFrom = new T.Vector3();
    function apply(st, t) {
      var w = W;
      // 相机：只旋转。基 f=v，r=v×e1
      var f = w.v, up = w.e1, rt = w.e2;
      var look = new T.Vector3().addScaledVector(f, Math.cos(st.phi)).addScaledVector(rt, Math.sin(st.phi));
      var sk = st.shake;
      look.addScaledVector(up, Math.sin(st.pitch) + sk * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 23.3 + 1.2) * 0.4));
      look.addScaledVector(rt, sk * (Math.sin(t * 29.7 + 0.4) * 0.6 + Math.sin(t * 17.9) * 0.4));
      look.normalize();
      tmpM.lookAt(new T.Vector3(0, 0, 0), look, up);
      camera.quaternion.setFromRotationMatrix(tmpM);
      camera.position.set(0, 0, 0);
      var aspect = E.size.w / Math.max(1, E.size.h);
      var fov = st.fov; if (aspect < 1) fov = Math.min(100, 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 1.35 / aspect) * 180 / Math.PI * 0.9);
      if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld(true);
      var pixAng = camera.fov * Math.PI / 180 / Math.max(1, E.size.h);

      // 天空
      skyU.uInvProj.value.copy(camera.projectionMatrixInverse);
      skyU.uCamWorld.value.copy(camera.matrixWorld);
      skyU.uV.value.copy(w.v); skyU.uE1.value.copy(w.e1); skyU.uE2.value.copy(w.e2);
      skyU.uBeta.value = st.betaV; skyU.uGamma.value = st.gammaV;
      skyU.uBR.value = st.beta; skyU.uGR.value = st.gamma;
      skyU.uExpo.value = st.expoSky; skyU.uPixAng.value = pixAng / E.dpr;
      skyU.uTime.value = t;
      // CMB：在 1218 K 时是可见的暗红；385 K 时完全为 0（真实的普朗克谱，指数截断）
      skyU.uCmbGain.value = w.warp ? 7e6 : 0;
      skyU.uTrail.value = st.trail * (st.paint > 0 ? 0 : 1);
      skyU.uTL.value = Math.max(st.s, 1e-6); skyU.uTO.value = w.eps0 * 0.06; skyU.uTR.value = w.eps0 * 0.006;

      // 星点
      starU.uShip.value.copy(w.v).multiplyScalar(st.s);
      starU.uV.value.copy(w.v); starU.uE1.value.copy(w.e1);
      starU.uBeta.value = st.betaV; starU.uGamma.value = st.gammaV; starU.uExpo.value = st.expo; starU.uDpr.value = E.dpr;

      // 有名字的恒星
      var ship = starU.uShip.value, bV = st.betaV, gV = st.gammaV;
      for (var i = 0; i < named.length; i++) {
        var n = named[i];
        var rel = tmpV.copy(n.pos).sub(ship); var r = rel.length(); rel.divideScalar(r);
        var c = U.clamp(rel.dot(w.v), -1, 1), cs = (c + bV) / (1 + bV * c);
        var pp = rel.clone().addScaledVector(w.v, -c); var pl = pp.length(); if (pl > 1e-9) pp.divideScalar(pl); else pp.copy(w.e1);
        var ds = new T.Vector3().addScaledVector(w.v, cs).addScaledVector(pp, Math.sqrt(Math.max(0, 1 - cs * cs)));
        var dl = gV * (1 + bV * c);
        if (n.s.id === w.toS.id) dirTo.copy(ds); if (n.s.id === w.fromS.id) dirFrom.copy(ds);
        var m = n.mesh, u0 = m.material.uniforms;
        var th = n.R / r / dl;                                       // 角半径（光行差压缩 1/δ）
        var bb = U.planckRGB(n.T * dl), b0 = U.planckRGB(n.T)[1] || 1;
        var I = KFLUX * n.L / (r * r) / (dl * dl) * st.expo;          // 点光源亮度
        var gR = bb[0] / b0 * I, gG = bb[1] / b0 * I, gB = bb[2] / b0 * I, Imax = Math.max(gR, gG, gB);
        var resolved = th > pixAng * 3;
        var half = resolved ? th * 4.2 : pixAng * (5 + 16 * Math.sqrt(Math.min(Imax, 30)));
        if (n.isBH) { th = Math.max(th, pixAng * 1.5); half = Math.max(th * 7, pixAng * 10); }
        half = Math.min(half, 0.7);
        var vis = Imax > 0.0015 || th > pixAng * 0.6 || n.isBH;
        m.visible = vis && st.paint < 1;
        if (!m.visible) continue;
        m.position.copy(ds).multiplyScalar(R_DIR * 0.9);
        m.quaternion.copy(camera.quaternion);
        m.scale.setScalar(Math.tan(half) * R_DIR * 0.9);
        u0.uDisk.value = th / half;
        var SURF = 5 * st.expo;
        u0.uSurf.value.set(bb[0] * SURF, bb[1] * SURF, bb[2] * SURF);
        var gk = Math.min(1, 3 / Math.max(Imax, 1e-9)) ;            // 很亮时把光晕压住，亮度交给圆盘与辉光
        if (n.isBH) u0.uGlow.value.set(1.2, 0.62, 0.3).multiplyScalar(Math.min(2, 0.6 / Math.max(0.02, Math.sqrt(r))) * Math.min(1.5, 1 / dl));
        else if (resolved) u0.uGlow.value.set(bb[0], bb[1], bb[2]).multiplyScalar(SURF * 0.12);
        else u0.uGlow.value.set(gR, gG, gB).multiplyScalar(gk * 1.6);
        u0.uSpike.value = resolved ? 0.04 : U.clamp((Imax - 0.4) * 0.25, 0, 0.8);
      }

      // 舱窗 pass
      var cu = cockpit.uniforms;
      cu.uTime.value = t; cu.uAspect.value = aspect;
      cu.uFrost.value = st.frost; cu.uPaint.value = st.paint;
      cu.uRipple.value = st.ripple * 1.6; cu.uRippleA.value = st.rippleA;
      tmpV.copy(w.v).negate().multiplyScalar(R_DIR).project(camera);
      cu.uRippleC.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
      cu.uGlare.value = w.warp ? U.clamp((st.gammaV - 1) / 6, 0, 1) * (1 - st.paint) : 0;
      cu.uDim.value = st.dim;

      // 准星
      if (hud) {
        placeReticle(hud.refs.retTo, dirTo, st.t > (w.warp ? w.tl.sw1 - 0.3 : 0.8) && st.t < w.tl.card - 0.2 && !st.frozen);
        placeReticle(hud.refs.retFrom, dirFrom, w.warp && st.t > 0.5 && st.t < w.tl.eng + 1.0);
      }
    }

    function audioAt(st, t) {
      if (E.still) return;
      var w = W, tl = w.tl, A = RU.audio;
      function cueAt(name, tc) { if (t >= tc && !fired[name + tc]) { fired[name + tc] = 1; A.cue(name); } }
      if (w.warp) {
        cueAt('warp-engage', tl.eng);
        if (!w.caught) { cueAt('warp-exit', tl.c1); cueAt('arrival', tl.card); }
        A.param('gamma', st.gamma);
      } else {
        cueAt('cryo-in', tl.cin);
        if (!w.caught) { cueAt('cryo-out', tl.wake); cueAt('arrival', tl.card); }
      }
      if (w.caught) { cueAt('flatten', tl.hit); cueAt('death', tl.card); A.param('tension', U.seg(t, tl.hit - 1, tl.hit)); }
    }

    function finish(skipped) {
      if (done) return; done = true;
      var r = resolveFn; resolveFn = null;
      if (r) r({ skipped: !!skipped, caught: W && W.caught });
    }

    return {
      scene: scene, camera: camera,
      bloom: { strength: 0.85, radius: 0.55, threshold: 0.62 },
      postPasses: [cockpit],
      enter: function (opts) {
        ensureStyle();
        var o = opts || {};
        if (o.demo || !o.u || !o.trip) o = makeDemo(o);
        W = setup(o);
        var src = skySource(W.u);
        skyU.uEq.value = src.tex; skyU.uEqW.value = src.w; skyU.uSkyGain.value = src.gain;
        buildStars(W.u, W.P0, W.v, W.dVis, src.stars);
        buildNamed(W.u, W.P0, W.fromS.id, W.toS.id);
        done = false; fired = {};
        hud = buildHud();
        E.letterbox(false);
        RU.audio.mood(W.warp ? 'warp' : 'cryo');
        keyH = function (e) { if (e.key === 'Escape' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); finish(true); } };
        window.addEventListener('keydown', keyH);
        hud.card.addEventListener('click', function () { finish(false); });
        var st0 = stateAt(E.still ? E.stillT : 0); apply(st0, st0.t); updateHud(st0);
        return new Promise(function (res) { resolveFn = res; });
      },
      update: function (dt, t) {
        if (!W) return;
        var st = stateAt(t);
        apply(st, t); updateHud(st); audioAt(st, t);
        if (!E.still && t >= W.tl.end) finish(false);
      },
      exit: function () {
        if (keyH) window.removeEventListener('keydown', keyH); keyH = null;
        if (hud) { hud.root.remove(); hud.card.remove(); hud.skip.remove(); hud = null; }
        finish(true);
      }
    };
  });
})();
