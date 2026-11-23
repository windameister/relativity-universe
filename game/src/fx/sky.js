/* fx/sky —— 共享银河背景（galaxy 负责）。
 *
 * 从银盘局部仰望的银河：GPU 一次性渲染出 HDR 等距柱状全景（equirect）+ 一份背景亮星星表（Points，保证星点锐利）。
 *
 * 坐标约定（与地图一致）：银盘 = 世界 XZ 平面，银北极 = +Y，银心方向 = +X（galCenter）。
 * 等距柱状映射与 RU.glsl.dirToEquirect 一致：u = atan(d.z,d.x)/2π + 0.5，v = asin(d.y)/π + 0.5；银心在全景正中。
 *
 * 用法：
 *   var S = RU.fx.sky.get(renderer);          // 单例，第一次调用时渲染全景（约几十毫秒）
 *   S.equirect                                 // THREE.Texture（HalfFloat，线性 HDR，RepeatWrapping，带 mipmap）
 *   S.size                                     // [w, h]
 *   S.stars = { count, dirs: Float32Array(3n) 单位向量, temps: Float32Array(n) 开尔文, mags: Float32Array(n) 视星等,
 *               flux: Float32Array(n) = 10^(-0.4 mag), colors: Float32Array(3n) 黑体色（最大分量 1，线性） }
 *   S.galCenter / S.galNorth                   // THREE.Vector3
 *   S.glsl                                     // GLSL 片段：vec3 skySample(sampler2D m, vec3 dir) —— 无接缝采样（textureGrad）
 *   var bd = S.createBackdrop({ intensity: 1, stars: 1, starSize: 1, twinkle: 0 });  // Object3D：天空球 + 亮星点
 *   scene.add(bd);                             // 不需要跟随相机：着色器只用视图矩阵的旋转部分，深度贴在远平面
 *   bd.setIntensity(sky, stars)                // 运行时调亮度（0 = 隐藏）
 *   S.update(camera, t)                        // 每帧（可选）：时间（闪烁）与像素比
 *
 * 星表的显示亮度：建议 b = pow(flux, 0.55) * 2（视觉压缩）；mag < 1 的十几颗亮星会画衍射星芒。
 */
(function () {
  var RU = window.RU, T = window.THREE, U = RU.util;
  RU.fx = RU.fx || {};
  var cache = null;

  // 一份确定性的背景发射星云表（方向、角半径、颜色）——全景着色器和需要知道「哪里有星云」的人共用
  function nebulaTable() {
    var r = U.mulberry(9181), out = [];
    for (var i = 0; i < 18; i++) {
      var l = i < 12 ? U.gauss(r) * 1.1 : (r() * 2 - 1) * Math.PI, b = U.gauss(r) * 0.03;
      var size = 0.012 + Math.pow(r(), 2.0) * 0.05, k = r();
      var col = k < 0.75 ? [1.0, 0.25, 0.35] : k < 0.93 ? [1.0, 0.32, 0.48] : [0.45, 0.55, 1.0];
      out.push({ dir: [Math.cos(b) * Math.cos(l), Math.sin(b), Math.cos(b) * Math.sin(l)], r: size, col: col, k: 0.5 + r() * 1.0 });
    }
    return out;
  }

  var VS_QUAD = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';

  function panoShader(neb) {
    var N = neb.length;
    return [
      'precision highp float;',
      RU.glsl.noise, RU.glsl.blackbody, RU.glsl.common,
      '#define NNEB ' + N,
      'uniform vec4 nebD[NNEB]; uniform vec4 nebC[NNEB]; uniform float seed; uniform float pix; varying vec2 vUv;',
      'vec3 dirFromUv(vec2 uv){ float lon=(uv.x-0.5)*6.2831853, lat=(uv.y-0.5)*3.14159265; return vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon)); }',
      // 程序化的暗弱恒星：在三维方向空间里分格撒点，所以没有两极拉伸
      'vec3 starCells(vec3 d, float N, float dens, float bright, float sig){',
      ' vec3 g=d*N, c=floor(g), acc=vec3(0.0);',
      ' for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){',
      '  vec3 cc=c+vec3(float(x),float(y),float(z)); float h=hash13(cc*0.731+seed);',
      '  if(h>dens) continue;',
      '  vec3 o=vec3(hash13(cc+1.37),hash13(cc+2.71),hash13(cc+5.13)); vec3 sp=normalize(cc+o);',
      '  float a=length(d-sp)/pix; float f=pow(hash13(cc+9.17),7.0);',
      '  float Tk=mix(2900.0,14000.0,pow(hash13(cc+4.41),2.4));',
      '  acc+=blackbodyColor(Tk)*exp(-a*a/(2.0*sig*sig))*(0.035+f*1.4)*bright; }',
      ' return acc; }',
      'void main(){',
      ' vec3 d=dirFromUv(vUv); float l=atan(d.z,d.x), b=asin(clamp(d.y,-1.0,1.0));',
      ' float cl=0.5+0.5*cos(l); vec3 so=vec3(seed*0.37,seed*0.11,-seed*0.23); vec3 p=d+so;',
      ' vec3 ps=vec3(d.x,d.y*3.2,d.z)+so;',                    // 沿银经拉伸的噪声坐标：结构顺着银河带拉丝
      ' float b0=0.022*snoise(vec3(cos(l),sin(l),0.0)*1.4+seed)+0.008*snoise(vec3(cos(l),sin(l),1.0)*4.0);',
      ' float bb=b-b0; float gc=exp(-l*l/0.09);',               // gc：银心附近
      ' float w=0.042+0.062*cl*cl+0.014*fbm3(p*2.0);',
      ' float disk=pow(1.0/cosh(bb/w),1.8);',
      ' float amp=0.24+0.76*pow(cl,2.4);',
      ' float thick=exp(-abs(bb)/(0.06+0.06*cl))*(0.008+0.05*cl*cl);',
      ' float bulge=2.8*exp(-(l*l/(0.2*0.2)+bb*bb/(0.12*0.12)))+0.7*exp(-(l*l/(0.5*0.5)+bb*bb/(0.22*0.22)));',
      ' float c1=fbm(ps*3.2)*0.5+0.5, c2=fbm(ps*10.0+3.0)*0.5+0.5, c3=fbm(p*31.0+9.0)*0.5+0.5;',
      ' float clouds=mix(0.2,2.1,smoothstep(0.3,0.8,c1))*(0.5+1.0*smoothstep(0.2,0.8,c2))*(0.75+0.5*c3);',
      ' float star=disk*amp*clouds+thick*(0.8+0.4*c2)+bulge*(0.8+0.4*c2);',
      ' vec3 warm=vec3(1.0,0.84,0.62), mid=vec3(0.95,0.88,0.78), cool=vec3(0.62,0.72,0.98);',
      ' vec3 col=mix(cool,mid,smoothstep(0.15,0.75,cl)); col=mix(col,warm,clamp(smoothstep(0.7,1.0,cl)*0.6+bulge*0.45,0.0,1.0));',
      ' vec3 L=col*star*0.13;',
      // 暗尘带：沿银经拉丝 + 多层半透明边缘 + 大裂缝；银心附近变窄变碎，让核球从上下溢出
      ' float dw=(0.016+0.024*cl)*(1.0-0.45*gc);',
      ' float lane=exp(-pow((bb-0.006*sin(l*3.0)-0.01*fbm3(ps*5.0))/dw,2.0));',
      ' vec3 wq=ps*4.0+0.6*vec3(fbm3(ps*2.0),fbm3(ps*2.0+5.2),fbm3(ps*2.0+9.7)); float wisp=fbm(wq); float wisp2=ridged(wq*2.2);',
      ' float holes=smoothstep(-0.4,0.25,fbm3(ps*6.0+2.0)); holes=mix(holes,holes*smoothstep(-0.1,0.5,fbm3(ps*12.0)),gc);',
      ' float dust=lane*(0.45*smoothstep(-0.45,0.05,wisp)+0.55*smoothstep(-0.05,0.4,wisp))*holes*(0.5+1.5*cl);',
      ' dust+=lane*smoothstep(0.72,0.98,wisp2)*0.6;',
      ' float rift=exp(-pow((bb+0.006-0.01*snoise(ps*8.0))/(0.032+0.012*cl),2.0))*smoothstep(-2.1,-1.0,l)*smoothstep(0.9,0.2,l);',
      ' dust+=rift*(0.3+1.2*smoothstep(-0.3,0.35,wisp))*(1.0-0.6*gc);',
      ' dust+=smoothstep(0.35,0.95,fbm(wq*0.6+11.0))*0.25*exp(-abs(bb)/0.2);',
      ' dust*=1.0-0.55*gc*smoothstep(0.012,0.05,abs(bb));',
      ' vec3 ext=exp(-dust*vec3(1.25,1.65,2.3)*1.3); float trans=dot(ext,vec3(0.3,0.45,0.25));',
      ' L*=ext; L+=vec3(0.05,0.028,0.016)*dust*star*0.04;',
      // 发射星云（HII 区）：小而亮的核、几个亮结、暗球状体剪影、外缘不对称并被尘埃切开
      ' vec3 E=vec3(0.0);',
      ' for(int i=0;i<NNEB;i++){ float ang=acos(clamp(dot(d,nebD[i].xyz),-1.0,1.0)); float r=ang/nebD[i].w; if(r>2.5) continue;',
      '  vec3 q=d*(3.0/nebD[i].w)+float(i)*7.31; float n=fbm(q); vec3 off=vec3(fbm3(q*0.5),fbm3(q*0.5+3.0),0.0);',
      '  float rr=r*(1.0+0.6*n)+0.35*off.x; float sh=exp(-rr*rr*2.2);',
      '  float knots=pow(max(0.0,fbm(q*2.4+1.0)),2.0)*6.0*exp(-r*r*3.0);',
      '  float bok=smoothstep(0.35,0.6,snoise(q*2.6+5.0))*smoothstep(1.4,0.3,r);',
      '  vec3 nc=nebC[i].rgb; vec3 c=mix(nc,vec3(1.0,0.62,0.6),clamp(knots*0.35,0.0,0.7));',
      '  E+=c*(sh*(0.35+0.8*n*n)+knots)*(1.0-0.9*bok)*nebC[i].a*0.12; }',
      ' L+=E*ext;',
      ' float band=clamp(disk*amp*1.3+bulge*0.8+thick*0.8,0.0,1.4);',
      ' vec3 S=starCells(d,320.0,0.004+0.04*band,0.16,0.6);',
      ' L+=S*mix(vec3(1.0),ext,0.9);',
      ' float dens=clamp((0.015+0.8*band*min(clouds,1.3))*pow(trans,1.6),0.0,1.0);',
      ' L+=vec3(0.0003,0.0004,0.0008);',
      '#ifdef AUX',
      ' gl_FragColor=vec4(trans,dens,0.0,1.0);',
      '#else',
      ' gl_FragColor=vec4(L,dens);',
      '#endif',
      ' }'].join('\n');
  }

  function genStars(n) {
    var r = U.mulberry(31337), dirs = new Float32Array(n * 3), temps = new Float32Array(n), mags = new Float32Array(n), flux = new Float32Array(n), colors = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      // 星等：数量随亮度按幂律增长（越暗越多）。mag ∈ [-1.6, 7.2]
      var m = i < 22 ? (-1.5 + r() * 2.0) : (8.6 + Math.log10(Math.max(1e-6, r())) / 0.45);
      if (m < -1.5) m = -1.5 + r() * 0.5;
      // 越暗的星越集中在银河带（远处的盘族星），亮星大致各向同性（近邻）
      var pBand = i < 22 ? 0 : U.clamp((m - 1) / 6, 0, 1) * 0.85, l, b;
      if (r() < pBand) { l = (r() * 2 - 1) * Math.PI; if (r() < 0.5) l = U.gauss(r) * 0.8; b = U.gauss(r) * (0.04 + 0.08 * r()) * (1.4 - 0.6 * (0.5 + 0.5 * Math.cos(l))); }
      else { l = r() * Math.PI * 2; b = Math.asin(r() * 2 - 1); if (i < 22 && Math.abs(b) < 0.08) b += (b >= 0 ? 0.1 : -0.1); }
      var cb = Math.cos(b);
      dirs[i * 3] = cb * Math.cos(l); dirs[i * 3 + 1] = Math.sin(b); dirs[i * 3 + 2] = cb * Math.sin(l);
      // 温度：亮星里热星更多（光度偏差）
      var k = r(), hot = U.clamp((4 - m) / 6, 0, 1) * 0.35, Tk;
      if (k < 0.1 + hot) Tk = 10000 + 22000 * Math.pow(r(), 1.5);
      else if (k < 0.3 + hot) Tk = 7000 + 3000 * r();
      else if (k < 0.55 + hot * 0.5) Tk = 5300 + 1700 * r();
      else if (k < 0.85) Tk = 3900 + 1400 * r();
      else Tk = 2900 + 1000 * r();
      temps[i] = Tk; mags[i] = m; flux[i] = Math.pow(10, -0.4 * m);
      var c = U.blackbodyColor(Tk); colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    }
    return { count: n, dirs: dirs, temps: temps, mags: mags, flux: flux, colors: colors };
  }

  var SAMPLE = [
    'vec4 skySample4(sampler2D m, vec3 d){',
    ' vec2 uv=vec2(atan(d.z,d.x)/6.2831853+0.5, asin(clamp(d.y,-1.0,1.0))/3.14159265+0.5);',
    ' vec2 dx=dFdx(uv), dy=dFdy(uv); dx.x-=floor(dx.x+0.5); dy.x-=floor(dy.x+0.5);',   // 经度接缝处导数跳变 → 修正，避免一条 mip 细缝
    ' return textureGrad(m, uv, dx, dy); }',
    'vec3 skySample(sampler2D m, vec3 d){ return skySample4(m,d).rgb; }',
    // 屏幕分辨率的暗弱星颗粒：方向空间分格撒点（2×2×2 最近格），密度来自全景的 alpha；pa = 每像素的角大小
    'float skyH(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }',
    'vec3 skyGrainCells(vec3 d, float N, float dens, float pa, float gain){',
    ' vec3 g=d*N, c=floor(g), f=g-c, o=sign(f-0.5), acc=vec3(0.0); float sig=0.62*pa*N;',
    ' for(int x=0;x<2;x++) for(int y=0;y<2;y++) for(int z=0;z<2;z++){',
    '  vec3 cc=c+vec3(float(x),float(y),float(z))*o; float h=skyH(cc+17.0);',
    '  if(h>dens) continue;',
    '  vec3 sp=cc+0.25+0.5*vec3(skyH(cc+1.7),skyH(cc+2.9),skyH(cc+4.3)); vec3 q=g-sp; q-=d*dot(q,d);',
    '  float r2=dot(q,q)/(sig*sig); float fl=0.004+pow(skyH(cc+8.1),7.0)*0.45; float tk=skyH(cc+6.6);',
    '  vec3 col=mix(vec3(1.0,0.72,0.5),vec3(0.75,0.85,1.0),tk); acc+=col*fl*exp(-0.5*r2); }',
    ' return acc*gain*smoothstep(0.9,2.6,1.0/(N*pa)); }',
    'vec3 skyGrain(vec3 d, float dens, float pa){ return skyGrainCells(d,1300.0,dens*dens*0.9,pa,1.0)+skyGrainCells(d,520.0,dens*0.3+0.004,pa,1.2); }',
    ''].join('\n');

  function build(renderer) {
    var params = (RU.engine && RU.engine.params) || new URLSearchParams(location.search);
    var W = +params.get('skyres') || 4096, H = W / 2;
    var maxTex = renderer.capabilities.maxTextureSize || 4096; if (W > maxTex) { W = maxTex; H = W / 2; }
    var rt = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false,
      minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, generateMipmaps: true, wrapS: T.RepeatWrapping, wrapT: T.ClampToEdgeWrapping });
    rt.texture.colorSpace = T.LinearSRGBColorSpace;
    rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    var neb = nebulaTable();
    var mat = new T.ShaderMaterial({
      uniforms: { nebD: { value: neb.map(function (n) { return new T.Vector4(n.dir[0], n.dir[1], n.dir[2], n.r); }) },
        nebC: { value: neb.map(function (n) { return new T.Vector4(n.col[0], n.col[1], n.col[2], n.k); }) },
        seed: { value: 3.7 }, pix: { value: Math.PI / H } },
      vertexShader: VS_QUAD, fragmentShader: panoShader(neb), depthTest: false, depthWrite: false
    });
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    var sc = new T.Scene(); sc.add(quad);
    var cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var prevRT = renderer.getRenderTarget(), prevTM = renderer.toneMapping, prevAC = renderer.autoClear;
    renderer.toneMapping = T.NoToneMapping;
    renderer.setRenderTarget(rt); renderer.autoClear = true;
    // 分条渲染：避免一次超长的 GPU 提交
    var strips = 4;
    rt.scissorTest = true;
    for (var i = 0; i < strips; i++) {
      rt.scissor.set(0, Math.floor(H * i / strips), W, Math.ceil(H / strips) + 1);
      rt.viewport.set(0, 0, W, H);
      renderer.render(sc, cam);
    }
    rt.scissorTest = false; rt.scissor.set(0, 0, W, H);
    // 辅助小图（R = 尘埃透过率，G = 暗星密度），读回 CPU：给星表加消光（暗带里的星被压暗/剔除，只留前景星）
    var AW = 1024, AH = 512, aux = new T.WebGLRenderTarget(AW, AH, { type: T.UnsignedByteType, format: T.RGBAFormat, depthBuffer: false });
    var amat = new T.ShaderMaterial({ uniforms: mat.uniforms, defines: { AUX: 1 }, vertexShader: VS_QUAD, fragmentShader: mat.fragmentShader, depthTest: false, depthWrite: false });
    quad.material = amat; renderer.setRenderTarget(aux); renderer.render(sc, cam);
    var px = new Uint8Array(AW * AH * 4); renderer.readRenderTargetPixels(aux, 0, 0, AW, AH, px);
    renderer.setRenderTarget(prevRT); renderer.toneMapping = prevTM; renderer.autoClear = prevAC;
    mat.dispose(); amat.dispose(); quad.geometry.dispose(); aux.dispose();
    function auxAt(x, y, z, ch) {
      var u = Math.atan2(z, x) / (2 * Math.PI) + 0.5, v = Math.asin(U.clamp(y, -1, 1)) / Math.PI + 0.5;
      var i = Math.min(AW - 1, Math.floor(u * AW)), j = Math.min(AH - 1, Math.floor(v * AH));
      return px[(j * AW + i) * 4 + ch] / 255;
    }
    var stars = genStars(+params.get('skystars') || 42000), rr = U.mulberry(777);
    for (var k = 0; k < stars.count; k++) {
      if (rr() < 0.18) continue;   // 前景星：在尘埃前面
      var tr = auxAt(stars.dirs[k * 3], stars.dirs[k * 3 + 1], stars.dirs[k * 3 + 2], 0);
      var f = Math.pow(tr, 1.5); stars.flux[k] *= f; stars.mags[k] = -2.5 * Math.log10(Math.max(1e-9, stars.flux[k]));
    }

    var S = {
      equirect: rt.texture, target: rt, size: [W, H], nebulae: neb,
      galCenter: new T.Vector3(1, 0, 0), galNorth: new T.Vector3(0, 1, 0),
      stars: stars, auxAt: function (dir) { return { trans: auxAt(dir.x, dir.y, dir.z, 0), density: auxAt(dir.x, dir.y, dir.z, 1) }; },
      glsl: SAMPLE,
      uniforms: { time: { value: 0 }, dpr: { value: (RU.engine && RU.engine.dpr) || window.devicePixelRatio || 1 } },
      update: function (camera, t) { if (t != null) S.uniforms.time.value = t; if (RU.engine) S.uniforms.dpr.value = RU.engine.dpr; },
      createBackdrop: function (o) { return createBackdrop(S, o || {}); }
    };
    return S;
  }

  // 天空球：只取视图矩阵的旋转（mat3(viewMatrix)），所以不需要跟随相机；z = w 贴在远平面
  var VS_SKY = 'varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*(mat3(modelMatrix)*position),1.0); gl_Position=p.xyww; gl_Position.z=gl_Position.w*0.99999; }';
  var FS_SKY = function () { return ['uniform sampler2D map; uniform float intensity, grain; uniform vec3 tint; varying vec3 vDir;', SAMPLE,
    'void main(){ vec3 d=normalize(vDir); vec4 s=skySample4(map, d); float pa=length(fwidth(d));',
    ' vec3 c=(s.rgb+skyGrain(d, s.a, pa)*grain)*intensity*tint; gl_FragColor=vec4(c,1.0); }'].join('\n'); };
  var VS_STAR = [
    'attribute vec3 col; attribute float bright; uniform float dpr, size, time, twinkle, intensity; varying vec3 vC; varying float vB; varying float vS;',
    'void main(){ vec3 d=normalize(position); vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*(mat3(modelMatrix)*d),1.0);',
    ' float b=bright*intensity*(1.0+twinkle*0.25*sin(time*(2.0+fract(position.x*91.7)*3.0)+position.y*300.0));',
    // 亮星画大一点（给光晕和星芒留地方），暗星就是 2.5px 左右的锐点
    ' float s=(2.6+3.5*clamp(log2(1.0+b*1.5),0.0,3.0))*size; if(b>1.8) s=max(s, 32.0*size*min(1.0,(b-1.8)*0.45+0.45));',
    ' vS=s; vB=b; vC=col; gl_PointSize=s*dpr; gl_Position=p.xyww; gl_Position.z=gl_Position.w*0.99998; if(b<0.004) gl_Position=vec4(2.0,2.0,2.0,1.0); }'].join('\n');
  var FS_STAR = [
    'uniform float dpr; varying vec3 vC; varying float vB; varying float vS;',
    'void main(){ vec2 q=(gl_PointCoord-0.5)*vS; float r=length(q);',   // q：逻辑像素
    ' float core=exp(-r*r/(2.0*0.55*0.55)); float halo=exp(-r/1.6)*0.10;',
    ' float spk=0.0; if(vB>1.8){ float k=clamp((vB-1.8)*0.38,0.0,1.0); spk=(exp(-abs(q.x)/0.4)*exp(-abs(q.y)/(vS*0.16))+exp(-abs(q.y)/0.4)*exp(-abs(q.x)/(vS*0.16)))*0.12*k; halo+=exp(-r/4.0)*0.05*k; }',
    ' float e=smoothstep(vS*0.5,vS*0.38,r);',
    ' vec3 c=vC*vB*(core+halo+spk)*e; gl_FragColor=vec4(c,1.0); }'].join('\n');

  function createBackdrop(S, o) {
    var g = new T.Group(); g.name = 'sky-backdrop';
    var skyMat = new T.ShaderMaterial({ uniforms: { map: { value: S.equirect }, intensity: { value: o.intensity != null ? o.intensity : 1 }, grain: { value: o.grain != null ? o.grain : 1 }, tint: { value: new T.Color(1, 1, 1) } },
      vertexShader: VS_SKY, fragmentShader: FS_SKY(), side: T.BackSide, depthWrite: false, depthTest: true });
    var sphere = new T.Mesh(new T.SphereGeometry(1, 64, 32), skyMat); sphere.frustumCulled = false; sphere.renderOrder = -1000;
    var st = S.stars, n = st.count, geo = new T.BufferGeometry(), br = new Float32Array(n);
    for (var i = 0; i < n; i++) br[i] = Math.pow(st.flux[i], 0.45) * 2.4;
    geo.setAttribute('position', new T.BufferAttribute(st.dirs, 3));
    geo.setAttribute('col', new T.BufferAttribute(st.colors, 3));
    geo.setAttribute('bright', new T.BufferAttribute(br, 1));
    var starMat = new T.ShaderMaterial({ uniforms: { dpr: S.uniforms.dpr, time: S.uniforms.time, size: { value: o.starSize || 1 }, twinkle: { value: o.twinkle || 0 }, intensity: { value: o.stars != null ? o.stars : 1 } },
      vertexShader: VS_STAR, fragmentShader: FS_STAR, transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending });
    var pts = new T.Points(geo, starMat); pts.frustumCulled = false; pts.renderOrder = -999;
    g.add(sphere, pts);
    g.sphere = sphere; g.points = pts; g.skyMaterial = skyMat; g.starMaterial = starMat;
    g.setIntensity = function (sky, stars) {
      if (sky != null) { skyMat.uniforms.intensity.value = sky; sphere.visible = sky > 0; }
      if (stars != null) { starMat.uniforms.intensity.value = stars; pts.visible = stars > 0; }
    };
    return g;
  }

  RU.fx.sky = {
    get: function (renderer) {
      renderer = renderer || (RU.engine && RU.engine.renderer);
      if (!cache) cache = build(renderer);
      return cache;
    },
    nebulaTable: nebulaTable
  };
})();
