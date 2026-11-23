/* RU.fx.planets —— 程序化、着色器驱动的天体（cinema）。没有任何外部贴图，全部 GLSL 程序化（噪声来自 core/glsl.js）。
 *
 * 用法：
 *   var P = RU.fx.planets.create('earth', { radius: 1, segments: 192 });
 *   scene.add(P.group);                       // group 下有本体、大气 / 光环 / 日冕
 *   P.group.position.set(...);
 *   每帧：P.update(t, camera)                 // t 秒；内部推进自转、云层、米粒组织
 *   光照：P.setSun(worldPos, intensity?, colorHex?)   （太阳自身忽略）
 *   二维化（foil 用）：P.setFlat({ n: Vector3 平面法线, d: 平面 dot(n,x)=d, fall: 球心到平面的有向高度（会被吞下去，降到 -1.5r 即完全压平）, spread: ≥1 的展开倍数, glow: 画面亮度, lift: 画面离平面的高度（多幅画重叠时后压平的抬高一点） })
 *                      P.setFlat(null) 关闭。
 *   kind：sun | mercury | venus | earth | moon | mars | jupiter | saturn | uranus | neptune
 *
 * 压平变换（顶点着色器）：以朝向平面的一极为「先触点」，球面上与远极夹角 γ 的点被压到平面上距中心 r·γ·spread 处
 * （方位等距展开：远极在画心，先触到平面的那一半被抻到外圈）。还没跌到平面的部分保持球形，二者之间是连续的一圈「正在被熨平」的带。
 * 结果是一幅越摊越大的圆形画：木星的纬向云带变成同心圆，地球变成联合国徽章那样的极点方位图；土星环另做，被摊成一圈圈同心条纹。
 */
(function () {
  var RU = window.RU, T = window.THREE, U = RU.util;
  var G = RU.glsl;

  var KINDS = {
    sun:     { r: 1, spin: 0.02 },
    mercury: { r: 1, spin: 0.01 },
    venus:   { r: 1, spin: 0.004 },
    earth:   { r: 1, spin: 0.035, atmo: [0.30, 0.55, 1.0] },
    moon:    { r: 1, spin: 0.004 },
    mars:    { r: 1, spin: 0.03, atmo: [0.9, 0.55, 0.35] },
    jupiter: { r: 1, spin: 0.06 },
    saturn:  { r: 1, spin: 0.05, ring: true },
    uranus:  { r: 1, spin: 0.03 },
    neptune: { r: 1, spin: 0.035 }
  };
  var KIND_ID = { sun: 0, mercury: 1, venus: 2, earth: 3, moon: 4, mars: 5, jupiter: 6, saturn: 7, uranus: 8, neptune: 9 };

  // ---------------- GLSL：公共 ----------------
  var COMMON = [
    'vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }',
    'vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z); }',
    // 3D Worley（F1），陨石坑用
    'vec2 worley(vec3 p){ vec3 ip=floor(p), fp=fract(p); float d1=8.0, d2=8.0;',
    ' for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec3 g=vec3(float(i),float(j),float(k));',
    '  vec3 o=vec3(hash13(ip+g), hash13(ip+g+19.7), hash13(ip+g+41.3)); vec3 r=g+o-fp; float d=dot(r,r);',
    '  if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }',
    ' return vec2(sqrt(d1), sqrt(d2)); }',
    // 陨石坑场：返回 (亮度调制, 法线扰动用的高度)
    'float craters(vec3 p, float sc){ vec2 w=worley(p*sc); float bowl=smoothstep(0.0,0.42,w.x); float rim=smoothstep(0.30,0.40,w.x)*(1.0-smoothstep(0.40,0.52,w.x)); return bowl*0.25+0.75 + rim*0.35 - (1.0-bowl)*0.12; }',
    ''].join('\n');

  // 表面函数：输入单位方向 p（已自转），输出反照率 a；附带输出 spec（海面高光权重）、emit（自发光，HDR 线性）、cloud
  var SURF = [
    // ---- 太阳 ----
    'vec3 surfSun(vec3 p, float t, out vec3 emit){',
    ' float g1=snoise(p*55.0+vec3(0.0,t*0.11,t*0.07));',
    ' float g2=snoise(p*120.0+vec3(t*0.21,0.0,-t*0.13));',
    ' float cell=1.0-abs(snoise(p*34.0+vec3(t*0.03)));',
    ' float gran=0.62+0.16*g1+0.07*g2+0.22*pow(cell,4.0);',
    ' float spot=smoothstep(0.62,0.80,fbm3(p*2.6+vec3(1.7,t*0.004,3.1)))*smoothstep(0.55,0.15,abs(p.y));',
    ' float pen=smoothstep(0.52,0.66,fbm3(p*2.6+vec3(1.7,t*0.004,3.1)))*smoothstep(0.55,0.15,abs(p.y));',
    ' float fac=smoothstep(0.35,0.9,fbm3(p*7.0+9.0))*0.25;',
    ' float I=gran*(1.0-0.45*pen)*(1.0-0.75*spot)+fac;',
    ' emit=mix(vec3(1.0,0.30,0.05), vec3(1.0,0.82,0.55), clamp(I,0.0,1.0))*I*2.1;',
    ' return vec3(0.0); }',
    // ---- 地球 ----
    'float earthH(vec3 p){ vec3 q=p+0.18*vec3(snoise(p*1.3+4.0),snoise(p*1.3+8.0),snoise(p*1.3+12.0)); return fbm(q*1.05+vec3(3.1,1.7,0.3))+0.16*fbm3(p*6.5+vec3(7.0,2.0,1.0))+0.05*snoise(p*22.0); }',
    'vec3 surfEarth(vec3 p, float t, out float spec, out float cloud, out float city, out float land){',
    ' float h=earthH(p); float lat=abs(p.y);',
    ' land=smoothstep(0.075,0.09,h);',
    ' float ice=smoothstep(0.84,0.91,lat+0.05*snoise(p*7.0))+ smoothstep(0.55,0.7,h)*0.5*land;',
    ' vec3 deep=vec3(0.003,0.018,0.065), shallow=vec3(0.01,0.09,0.12);',
    ' vec3 sea=mix(deep, shallow, smoothstep(0.0,0.07,h)); sea=mix(sea, vec3(0.02,0.16,0.17), smoothstep(0.06,0.078,h)*0.7);',
    ' float dryN=fbm3(p*3.2+11.0);',
    ' float desertBelt=exp(-pow((lat-0.38)/0.16,2.0));',
    ' float dry=smoothstep(0.0,0.25,dryN+desertBelt*0.45-0.15);',
    ' vec3 forest=vec3(0.025,0.07,0.025), grass=vec3(0.09,0.12,0.04), desert=vec3(0.42,0.30,0.16), rock=vec3(0.18,0.14,0.11);',
    ' vec3 lc=mix(forest, grass, smoothstep(0.1,0.5,fbm3(p*9.0)+0.3));',
    ' lc=mix(lc, desert, dry*(1.0-smoothstep(0.55,0.75,lat)));',
    ' lc=mix(lc, rock, smoothstep(0.28,0.5,h));',
    ' lc=mix(lc, vec3(0.06,0.08,0.06), smoothstep(0.55,0.8,lat));',
    ' lc*=0.9+0.22*fbm3(p*38.0);',
    ' vec3 a=mix(sea, lc, land); a=mix(a, vec3(0.82,0.86,0.9), clamp(ice,0.0,1.0));',
    ' spec=(1.0-land)*(1.0-clamp(ice,0.0,1.0));',
    // 云：两层，带一点气旋卷曲
    ' vec3 cp=rotY(p, t*0.012);',
    ' vec3 wq=vec3(fbm3(cp*1.6+1.0), fbm3(cp*1.6+5.0), fbm3(cp*1.6+9.0));',
    ' float c=fbm(cp*2.4+wq*0.9);',
    ' float det=fbm3(cp*11.0+wq*1.5);',
    ' float bands=0.5+0.5*cos(asin(clamp(p.y,-1.0,1.0))*6.0);',
    ' cloud=smoothstep(-0.05,0.45,c+0.14*bands-0.05)*(0.55+0.45*smoothstep(-0.3,0.4,det)); cloud=clamp(cloud*1.05,0.0,0.92);',
    // 城市灯光：沿海岸与河谷聚集
    ' float coast=1.0-smoothstep(0.0,0.18,h-0.05);',
    ' float pop=smoothstep(0.15,0.65,fbm3(p*6.0+3.3)+0.35*coast)*(1.0-dry*0.8)*(1.0-smoothstep(0.6,0.78,lat));',
    ' float dots=smoothstep(0.62,0.98,snoise(p*220.0)*0.5+0.5)+0.4*smoothstep(0.72,1.0,snoise(p*70.0)*0.5+0.5);',
    ' city=land*(1.0-clamp(ice,0.0,1.0))*pop*dots;',
    ' return a; }',
    // ---- 月球 / 水星 ----
    'vec3 surfMoon(vec3 p, float hue){',
    ' float maria=smoothstep(0.05,0.3,fbm(p*1.3+vec3(2.0,4.0,1.0)));',
    ' float cr=craters(p,5.0)*craters(p+3.7,12.0)*(0.92+0.08*craters(p+9.1,30.0));',
    ' float n=0.85+0.15*fbm3(p*20.0);',
    ' vec3 hi=mix(vec3(0.42,0.41,0.40), vec3(0.45,0.40,0.34), hue), lo=mix(vec3(0.16,0.16,0.17), vec3(0.22,0.19,0.16), hue);',
    ' return mix(hi, lo, maria*(1.0-hue*0.6))*cr*n; }',
    // ---- 金星 ----
    'vec3 surfVenus(vec3 p, float t){ vec3 q=rotY(p,t*0.01); float s=fbm(vec3(q.x*2.0,q.y*6.0,q.z*2.0)+fbm3(q*3.0)); return mix(vec3(0.78,0.66,0.45), vec3(0.95,0.88,0.70), 0.5+0.5*s); }',
    // ---- 火星 ----
    'vec3 surfMars(vec3 p){',
    ' float h=fbm(p*1.8+vec3(5.0,1.0,2.0)); float lat=abs(p.y);',
    ' vec3 a=mix(vec3(0.50,0.22,0.10), vec3(0.62,0.33,0.16), smoothstep(-0.3,0.4,fbm3(p*5.0)));',
    ' a=mix(a, vec3(0.20,0.11,0.07), smoothstep(0.05,0.35,h));',
    ' float vm=exp(-pow((p.y+0.12+0.03*snoise(p*8.0))/0.025,2.0))*smoothstep(0.2,0.6,p.x)*smoothstep(0.0,0.4,p.z+0.3);',
    ' a*=1.0-0.5*vm;',
    ' a*=craters(p,7.0)*0.3+0.7;',
    ' a=mix(a, vec3(0.88,0.86,0.84), smoothstep(0.86,0.93,lat+0.04*snoise(p*9.0)));',
    ' return a; }',
    // ---- 木星 ----
    'vec3 surfJupiter(vec3 p, float t){',
    ' float lat=asin(clamp(p.y,-1.0,1.0)); float lon=atan(p.z,p.x);',
    ' vec3 tq=vec3(p.x*2.5, p.y*11.0, p.z*2.5);',
    ' float w=fbm(tq+vec3(t*0.015,0.0,0.0)+fbm3(tq*1.7)*0.9);',
    ' float edd=snoise(vec3(p.x*7.0,p.y*34.0,p.z*7.0)+w);',
    ' float y=lat+0.040*w+0.008*edd;',
    ' float b1=0.5+0.5*sin(y*20.0+0.6+1.6*sin(y*6.0)); float b2=0.5+0.5*sin(y*9.0-0.3+sin(y*3.0)); float b3=0.5+0.5*sin(y*52.0+w*2.0);',
    ' vec3 cream=vec3(0.74,0.68,0.56), tan=vec3(0.62,0.42,0.25), brown=vec3(0.34,0.19,0.10), rust=vec3(0.58,0.30,0.15);',
    ' vec3 c=mix(cream, tan, smoothstep(0.25,0.85,b1));',
    ' c=mix(c, brown, smoothstep(0.55,1.0,b2)*smoothstep(0.3,0.9,b1)*0.75);',
    ' c=mix(c, rust, smoothstep(0.7,1.0,b3)*0.25);',
    ' c*=0.92+0.12*w; c=pow(c,vec3(1.2));',
    ' c=mix(c, vec3(0.42,0.40,0.40), smoothstep(0.85,1.25,abs(lat)));',
    // 白色卵形
    ' float ov=smoothstep(0.75,0.95, snoise(vec3(lon*4.0, lat*30.0, 1.0)))*exp(-pow((lat+0.62)/0.05,2.0));',
    ' c=mix(c, vec3(0.95,0.93,0.88), ov*0.8);',
    // 大红斑（南纬 22°）：旋涡
    ' float dl=atan(sin(lon-0.9), cos(lon-0.9));',
    ' vec2 d=vec2(dl/0.30, (lat+0.39)/0.12); float rr=length(d);',
    ' float ang=atan(d.y,d.x)+ (1.0-smoothstep(0.0,1.3,rr))*5.0 - t*0.15;',
    ' float swirl=snoise(vec3(cos(ang)*rr*3.0, sin(ang)*rr*3.0, 2.0));',
    ' float grs=1.0-smoothstep(0.6,1.05,rr+0.08*swirl);',
    ' vec3 red=mix(vec3(0.72,0.26,0.12), vec3(0.85,0.45,0.25), 0.5+0.5*swirl);',
    ' red=mix(red, vec3(0.95,0.75,0.6), smoothstep(0.9,0.6,rr)*0.0+ (1.0-smoothstep(0.0,0.35,rr))*0.35);',
    ' c=mix(c, red, grs);',
    ' c=mix(c, vec3(0.92,0.85,0.75), smoothstep(1.0,1.15,rr)*(1.0-smoothstep(1.15,1.45,rr))*0.5);',
    ' return c; }',
    // ---- 土星 ----
    'vec3 surfSaturn(vec3 p, float t){',
    ' float lat=asin(clamp(p.y,-1.0,1.0));',
    ' float w=fbm3(vec3(p.x*2.0,p.y*14.0,p.z*2.0)+vec3(t*0.01,0.0,0.0));',
    ' float y=lat+0.012*w;',
    ' float b=0.5+0.5*sin(y*26.0); float b2=0.5+0.5*sin(y*11.0+1.0);',
    ' vec3 c=mix(vec3(0.90,0.80,0.58), vec3(0.76,0.62,0.40), b*0.6);',
    ' c=mix(c, vec3(0.62,0.50,0.34), b2*b2*0.35);',
    ' c=mix(c, vec3(0.55,0.62,0.66), smoothstep(1.05,1.35,abs(lat))*0.6);',
    ' return c; }',
    // ---- 天王星 / 海王星 ----
    'vec3 surfUranus(vec3 p, float t){ float lat=asin(clamp(p.y,-1.0,1.0)); float b=0.5+0.5*sin(lat*14.0+0.03*fbm3(p*6.0));',
    ' vec3 c=mix(vec3(0.55,0.80,0.84), vec3(0.62,0.86,0.88), b); c=mix(c, vec3(0.72,0.90,0.90), smoothstep(0.9,1.4,abs(lat))*0.5); return c; }',
    'vec3 surfNeptune(vec3 p, float t){ float lat=asin(clamp(p.y,-1.0,1.0)); float lon=atan(p.z,p.x);',
    ' float w=fbm3(vec3(p.x*2.0,p.y*9.0,p.z*2.0)+vec3(t*0.02,0.0,0.0));',
    ' float b=0.5+0.5*sin(lat*12.0+0.06*w);',
    ' vec3 c=mix(vec3(0.10,0.24,0.70), vec3(0.18,0.38,0.85), b);',
    ' float dl=atan(sin(lon-2.0),cos(lon-2.0)); float sp=length(vec2(dl/0.28,(lat+0.35)/0.12));',
    ' c=mix(c, vec3(0.04,0.08,0.30), 1.0-smoothstep(0.5,1.0,sp));',
    ' float st=smoothstep(0.55,0.9, snoise(vec3(lon*3.0, lat*40.0, t*0.01)))*exp(-pow((lat+0.12)/0.08,2.0));',
    ' c=mix(c, vec3(0.9,0.95,1.0), st*0.8);',
    ' float st2=smoothstep(0.6,0.95, snoise(vec3(lon*5.0+3.0, lat*50.0, 4.0)))*exp(-pow((lat-0.45)/0.06,2.0));',
    ' c=mix(c, vec3(0.85,0.92,1.0), st2*0.6);',
    ' return c; }',
    ''].join('\n');

  // ---------------- 本体着色器 ----------------
  var VERT = [
    'uniform float uFlatOn, uFall, uSpread, uFlatD, uFlatLift; uniform vec3 uFlatN;',
    'varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying float vF; varying float vGam; varying vec2 vAz;',
    'void main(){',
    ' vObj=normalize(position);',
    ' vec3 C=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;',
    ' vec3 wp=(modelMatrix*vec4(position,1.0)).xyz;',
    ' vec3 N=normalize(mat3(modelMatrix)*normal);',
    ' vF=0.0; vGam=0.0; vAz=vec2(0.0);',
    ' if(uFlatOn>0.5){',
    '  vec3 n=uFlatN; float r=length(wp-C); vec3 v=(wp-C)/r;',
    '  vec3 Cp=C-n*(dot(C,n)-uFlatD);',
    '  float cg=clamp(dot(v,n),-1.0,1.0); float h=uFall+r*cg;',
    '  vec3 t1=normalize(abs(n.y)<0.9?cross(n,vec3(0.0,1.0,0.0)):cross(n,vec3(1.0,0.0,0.0))); vec3 t2=cross(n,t1);',
    '  vec3 az=v-n*cg; float azl=length(az); az= azl>1e-5 ? az/azl : t1;',
    '  float gam=acos(cg);',
    '  float f=smoothstep(0.0, 0.55*r, -h);',
    '  vec3 p3=Cp+az*(r*azl)+n*max(h,0.0);',
    '  vec3 pf=Cp+az*(r*gam*uSpread)+n*(uFlatLift+0.004*r*(3.2-gam));',
    '  wp=mix(p3,pf,f); N=normalize(mix(N,n,f));',
    '  vF=f; vGam=gam; vAz=vec2(dot(az,t1),dot(az,t2));',
    ' }',
    ' vW=wp; vN=N;',
    ' gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.0);',
    '}'].join('\n');

  var FRAG = [
    'uniform int uKind; uniform float uTime, uSpin, uTilt, uFlatGlow, uSpread, uSunI, uHaze; uniform vec3 uSunPos, uSunCol, uAtmo, uAmb;',
    'varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying float vF; varying float vGam; varying vec2 vAz;',
    'void main(){',
    ' vec3 P=rotY(rotX(normalize(vObj), uTilt), uSpin);',
    ' vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;',
    ' vec3 V=normalize(cameraPosition-vW); vec3 L=normalize(uSunPos-vW);',
    ' float ndl=dot(N,L); float mu=max(dot(N,V),0.0);',
    ' vec3 sun=uSunCol*uSunI;',
    ' vec3 col=vec3(0.0); vec3 alb=vec3(0.0); vec3 emit=vec3(0.0); float gloss=0.0;',
    ' float t=uTime;',
    ' if(uKind==0){',
    '  surfSun(P,t,emit);',
    '  float ld=0.22+0.78*pow(mu,0.55);',      // 临边昏暗
    '  vec3 limbTint=mix(vec3(1.0,0.32,0.08), vec3(1.0), pow(mu,0.5));',
    '  col=emit*ld*limbTint;',
    '  alb=emit*0.16;',
    ' } else if(uKind==3){',
    '  float spec, cloud, city, land; alb=surfEarth(P,t,spec,cloud,city,land);',
    '  float day=smoothstep(-0.12,0.25,ndl);',
    '  float dif=smoothstep(-0.03,0.25,ndl)*max(ndl,0.0)*1.0+max(ndl,0.0)*0.0;',
    '  vec3 H=normalize(L+V); float sp=pow(max(dot(N,H),0.0),160.0)*spec*(1.0-cloud)*1.1 + pow(max(dot(N,H),0.0),14.0)*spec*(1.0-cloud)*0.05;',
    '  vec3 term=mix(vec3(1.0,0.45,0.2), vec3(1.0), smoothstep(0.0,0.35,ndl));',  // 晨昏线发红
    '  float rel=fbm3((P+0.006*L)*22.0)-fbm3(P*22.0);',     // 地形起伏的明暗（沿光线方向差分）
    '  vec3 surf=alb*(1.0+land*clamp(rel*5.0,-0.35,0.35));',
    '  surf=mix(surf, vec3(0.92,0.94,0.98), cloud);',
    '  col=surf*sun*dif*term + sun*sp*term*smoothstep(0.0,0.1,ndl);',
    '  vec3 lights=vec3(1.0,0.62,0.28)*city*(1.0-cloud*0.85)*2.6*(1.0-day);',
    '  col+=lights;',
    // 大气散射边缘
    '  float rim=pow(1.0-mu,4.0);',
    '  col+= uAtmo*rim*1.3*smoothstep(-0.04,0.45,ndl)*uSunI*mix(vec3(1.0,0.55,0.35),vec3(1.0),smoothstep(0.05,0.4,ndl));',
    '  col=mix(col, uAtmo*0.35*uSunI*max(ndl,0.0), 0.18*(1.0-mu)*uHaze);',
    '  emit=lights;',
    '  alb=mix(alb, vec3(0.92,0.94,0.98), cloud*0.6)+lights*0.2;',
    ' } else {',
    '  if(uKind==1) alb=surfMoon(P,0.8);',
    '  else if(uKind==2) alb=surfVenus(P,t);',
    '  else if(uKind==4) alb=surfMoon(P,0.0);',
    '  else if(uKind==5) alb=surfMars(P);',
    '  else if(uKind==6) alb=surfJupiter(P,t);',
    '  else if(uKind==7) alb=surfSaturn(P,t);',
    '  else if(uKind==8) alb=surfUranus(P,t);',
    '  else alb=surfNeptune(P,t);',
    '  bool gas=uKind>=6||uKind==2;',
    '  float dif= gas ? max((ndl+0.06)/1.06,0.0) : max(ndl,0.0);',
    '  if(uKind==4||uKind==1){ dif=max(ndl,0.0); dif=dif*(1.0+0.6*pow(1.0-mu,2.0)); }',  // 月面：近似 Lommel-Seeliger 的平坦感
    '  col=alb*sun*dif;',
    '  float rim=pow(1.0-mu,3.0);',
    '  col+=uAtmo*rim*smoothstep(-0.2,0.5,ndl)*uSunI*0.8;',
    ' }',
    ' col+=alb*uAmb;',
    // ---- 二维化后的「画」：自发光的颜料 + 极细的同心纹与放射纤维（可凝视的细节）----
    ' float outA=1.0;',
    ' if(vF>0.001){',
    '  float k=vGam*uSpread;',
    '  float pole=smoothstep(0.06,0.42,vGam);',
    '  float rings=mix(1.0, 0.88+0.12*sin(k*22.0+snoise(vec3(vAz*4.0,k*1.5))*2.5), pole);',
    '  float fib=mix(1.0, 0.86+0.22*snoise(vec3(vAz*45.0, k*1.2)), pole);',
    '  vec3 paint;',
    '  if(uKind==0){',            // 二维的太阳：白热的画心向外褪成橙红，米粒组织被抻成细纤维
    '   float rr=vGam/3.14159; float I=clamp(luma(emit)/1.4,0.3,1.4);',
    '   vec3 base=mix(vec3(1.0,0.93,0.78), vec3(1.0,0.56,0.20), smoothstep(0.0,0.6,rr)); base=mix(base, vec3(0.75,0.20,0.06), smoothstep(0.55,1.0,rr));',
    '   paint=base*(0.65+0.45*I)*(3.0-2.2*rr)*rings*fib*uFlatGlow;',
    '  } else if(uKind==3) paint=(alb*1.7+emit*0.6)*rings*fib*uFlatGlow;',
    '  else paint=(pow(alb,vec3(1.7))*0.95+emit)*rings*fib*uFlatGlow;',
    '  float rimFade=1.0-smoothstep(2.86, 3.07, vGam);',
    '  float edge=smoothstep(2.78,2.94,vGam)*(1.0-smoothstep(2.94,3.07,vGam));',
    '  paint+=mix(alb,vec3(0.8,0.9,1.0),0.4)*edge*0.45*uFlatGlow;',
    '  col=mix(col, paint, vF);',
    '  outA=mix(1.0, rimFade, vF);',
    '  if(outA<0.01) discard;',
    ' }',
    ' gl_FragColor=vec4(col, outA);',
    '}'].join('\n');

  // ---------------- 大气外壳（地球 / 火星）：解析散射 ----------------
  var ATMO_VERT = [
    'uniform float uFlatOn, uFlatFade;',
    'varying vec3 vW;',
    'void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }'].join('\n');
  var ATMO_FRAG = [
    'uniform vec3 uC, uSunPos, uAtmo, uSunCol; uniform float uR, uRa, uSunI, uFade;',
    'varying vec3 vW;',
    'void main(){',
    ' vec3 ro=cameraPosition; vec3 rd=normalize(vW-ro);',
    ' vec3 oc=uC-ro; float tc=dot(oc,rd); vec3 cl=ro+rd*max(tc,0.0); float b=length(cl-uC);',
    ' float H=(uRa-uR)*0.32;',
    ' float hb=b-uR;',
    ' if(tc<0.0) hb=length(ro-uC)-uR;',
    ' float dens=exp(-max(hb,0.0)/H);',
    ' if(hb<0.0) dens=exp(hb/(H*0.35));',
    ' dens*=1.0-smoothstep((uRa-uR)*0.55,(uRa-uR)*0.98,hb);',         // 射线穿入星体：被星体本身挡住（深度测试处理正面），这里只留一点边缘
    ' vec3 nrm=normalize(cl-uC); vec3 L=normalize(uSunPos-cl);',
    ' float lit=dot(nrm,L);',
    ' float day=smoothstep(-0.28,0.25,lit);',
    ' float twi=exp(-pow(lit/0.18,2.0));',
    ' float muS=dot(rd,normalize(uSunPos-ro));',
    ' float mie=pow(max(muS,0.0),24.0)*1.2+pow(max(muS,0.0),400.0)*2.0;',
    ' vec3 c=uAtmo*day*1.2 + vec3(1.0,0.42,0.16)*twi*0.9 + vec3(1.0,0.75,0.5)*mie*(day*0.6+twi);',
    ' float a=clamp(dens,0.0,1.0);',
    ' gl_FragColor=vec4(c*a*uSunI*uSunCol*uFade, 1.0);',
    '}'].join('\n');

  // ---------------- 日冕 + 日珥（面向相机的大面片）----------------
  var CORONA_VERT = 'varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; vec4 mv=modelViewMatrix*vec4(0.0,0.0,0.0,1.0); float s=length(modelMatrix[0].xyz); mv.xy+=position.xy*s; gl_Position=projectionMatrix*mv; }';
  var CORONA_FRAG = [
    'uniform float uTime, uFade, uRscale; varying vec2 vUv;',
    'void main(){',
    ' float r=length(vUv)*uRscale; float a=atan(vUv.y,vUv.x);',     // r=1 → 太阳光球边缘
    ' if(r<0.985) discard;',
    ' float x=r-1.0;',
    ' vec2 dir=vec2(cos(a),sin(a));',
    ' float streak=fbm3(vec3(dir*3.0, uTime*0.02))*0.5+0.5;',
    ' float rays=pow(0.5+0.5*snoise(vec3(dir*7.0, uTime*0.03+x*0.6)),2.0);',
    ' float cor=exp(-x*4.2)*(0.45+0.9*streak) + exp(-x*1.4)*0.18*rays;',
    ' vec3 c=vec3(1.0,0.82,0.62)*cor*0.85;',
    // 日珥：贴着边缘的、被磁场拉成弧的红色丝缕
    ' float pr=fbm(vec3(dir*5.0+vec2(x*6.0,0.0), uTime*0.04)); float loopM=smoothstep(0.25,0.6,pr)*smoothstep(0.14,0.0,x);',
    ' float fil=pow(1.0-abs(snoise(vec3(dir*18.0, x*12.0+uTime*0.05))),6.0);',
    ' c+=vec3(1.0,0.25,0.12)*loopM*fil*5.0;',
    ' c+=vec3(1.0,0.5,0.25)*exp(-x*40.0)*2.0;',     // 色球层的红边
    ' gl_FragColor=vec4(c*uFade,1.0);',
    '}'].join('\n');

  // ---------------- 土星环 ----------------
  var RING_VERT = [
    'uniform float uFlatOn, uFall, uSpread, uFlatD, uFlatLift, uR; uniform vec3 uFlatN;',
    'varying vec3 vW; varying float vRho; varying float vF; varying vec2 vAz;',
    'void main(){',
    ' vec3 C=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vec3 wp=(modelMatrix*vec4(position,1.0)).xyz;',
    ' vRho=length(position.xy)/uR; vF=0.0; vAz=vec2(0.0);',
    ' if(uFlatOn>0.5){',
    '  vec3 n=uFlatN; vec3 Cp=C-n*(dot(C,n)-uFlatD);',
    '  vec3 d=wp-C; float hd=dot(d,n); float h=uFall+hd;',
    '  vec3 az=d-n*hd; float azl=length(az); az/=max(azl,1e-5);',
    '  vec3 t1=normalize(abs(n.y)<0.9?cross(n,vec3(0.0,1.0,0.0)):cross(n,vec3(1.0,0.0,0.0))); vec3 t2=cross(n,t1);',
    '  float f=smoothstep(0.0,0.5*uR,-h);',
    '  vec3 p3=Cp+az*azl+n*max(h,0.0);',
    '  float rho=uR*(3.14159*uSpread + (vRho-1.0)*uSpread*2.2);',
    '  vec3 pf=Cp+az*rho+n*(uFlatLift+0.002*uR);',
    '  wp=mix(p3,pf,f); vF=f; vAz=vec2(dot(az,t1),dot(az,t2));',
    ' }',
    ' vW=wp; gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.0);',
    '}'].join('\n');
  var RING_FRAG = [
    'uniform vec3 uC, uSunPos, uSunCol, uAmb; uniform float uR, uSunI, uFlatGlow, uSpread;',
    'varying vec3 vW; varying float vRho; varying float vF; varying vec2 vAz;',
    'float ringDen(float x){',     // x：以行星半径为单位
    ' float d=0.0;',
    ' d+=smoothstep(1.24,1.30,x)*(1.0-smoothstep(1.50,1.53,x))*0.18;',                // C 环
    ' d+=smoothstep(1.52,1.56,x)*(1.0-smoothstep(1.94,1.95,x))*(0.75+0.25*clamp(1.0-fwidth(x)*30.0,0.0,1.0)*sin(x*90.0));', // B 环
    ' d+=smoothstep(2.02,2.04,x)*(1.0-smoothstep(2.26,2.27,x))*(0.55+0.15*clamp(1.0-fwidth(x)*45.0,0.0,1.0)*sin(x*140.0));', // A 环
    ' d*=1.0-0.85*exp(-pow((x-2.215)/0.006,2.0));',  // 恩克缝
    ' float aa=clamp(1.0-fwidth(x)*140.0,0.0,1.0);',
    ' d*=0.8+0.2*aa*sin(x*420.0)*sin(x*173.0);',
    ' return clamp(d,0.0,1.0); }',
    'void main(){',
    ' float x=vRho; float den=ringDen(x);',
    ' vec3 c=mix(vec3(0.62,0.52,0.40), vec3(0.92,0.86,0.74), smoothstep(1.5,2.1,x));',
    // 行星影子
    ' vec3 L=normalize(uSunPos-vW); vec3 oc=uC-vW; float tc=dot(oc,L); float sh=1.0;',
    ' if(tc>0.0){ float b=length(oc-L*tc); sh=smoothstep(uR*0.97,uR*1.03,b); }',
    ' float a=den*0.92;',
    ' vec3 col=c*a*(uSunCol*uSunI*sh*0.9+uAmb);',
    ' if(vF>0.001){',
    '  float k=x*uSpread;',
    '  float stripes=0.55+0.45*sin(k*60.0+snoise(vec3(vAz*8.0,k))*2.0);',
    '  float fib=0.85+0.2*snoise(vec3(vAz*150.0,k*3.0));',
    '  float af=min(1.0,den*1.4)*(0.6+0.4*stripes);',
    '  col=mix(col, c*af*1.1*stripes*fib*uFlatGlow, vF);',
    '  a=mix(a, af, vF);',
    ' }',
    ' gl_FragColor=vec4(col, a);',
    '}'].join('\n');

  // ---------------- 工厂 ----------------
  var GEO = {};
  function sphereGeo(seg) { var k = 's' + seg; return GEO[k] || (GEO[k] = new T.SphereGeometry(1, seg, Math.round(seg / 2))); }

  function create(kind, opts) {
    opts = opts || {};
    var K = KINDS[kind]; if (!K) throw new Error('未知天体：' + kind);
    var radius = opts.radius || 1, seg = opts.segments || 160;
    var atmoCol = K.atmo ? new T.Color(K.atmo[0], K.atmo[1], K.atmo[2]) : new T.Color(0, 0, 0);
    if (kind === 'uranus') atmoCol.setRGB(0.5, 0.85, 0.9);
    if (kind === 'neptune') atmoCol.setRGB(0.3, 0.5, 1.0);
    if (kind === 'jupiter' || kind === 'saturn') atmoCol.setRGB(0.25, 0.2, 0.12);
    if (kind === 'venus') atmoCol.setRGB(0.9, 0.8, 0.55);
    var u = {
      uKind: { value: KIND_ID[kind] }, uTime: { value: 0 }, uSpin: { value: opts.spin0 || 0 }, uTilt: { value: opts.tilt || 0 },
      uSunPos: { value: new T.Vector3(0, 0, 0) }, uSunCol: { value: new T.Color(1, 0.97, 0.92) }, uSunI: { value: 1.6 },
      uAmb: { value: new T.Color(0.004, 0.005, 0.008) }, uAtmo: { value: atmoCol }, uHaze: { value: 1 },
      uFlatOn: { value: 0 }, uFlatLift: { value: 0.01 }, uFall: { value: 0 }, uSpread: { value: 1 }, uFlatD: { value: 0 }, uFlatN: { value: new T.Vector3(0, 1, 0) }, uFlatGlow: { value: 1 },
      uC: { value: new T.Vector3() }, uR: { value: radius }
    };
    var mat = new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: G.noise + G.common + COMMON + SURF + FRAG, side: T.DoubleSide, transparent: true });
    var mesh = new T.Mesh(sphereGeo(seg), mat);
    mesh.scale.setScalar(radius);
    mesh.frustumCulled = false;
    var group = new T.Group(); group.add(mesh);
    var P = { kind: kind, group: group, mesh: mesh, u: u, radius: radius, spinRate: opts.spinRate != null ? opts.spinRate : K.spin, extras: [] };

    if (K.atmo && opts.atmosphere !== false) {
      var ra = radius * (kind === 'earth' ? 1.035 : 1.02);
      var au = { uC: u.uC, uSunPos: u.uSunPos, uAtmo: u.uAtmo, uSunCol: u.uSunCol, uR: u.uR, uRa: { value: ra }, uSunI: u.uSunI, uFade: { value: kind === 'earth' ? 1 : 0.5 }, uFlatOn: u.uFlatOn, uFlatFade: { value: 1 } };
      var am = new T.ShaderMaterial({ uniforms: au, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      var atmo = new T.Mesh(sphereGeo(128), am); atmo.scale.setScalar(ra); atmo.frustumCulled = false;
      group.add(atmo); P.atmo = atmo; P.extras.push(atmo); P.atmoRa = ra;
    }
    if (kind === 'sun' && opts.corona !== false) {
      var cs = radius * 4.2;
      var cu = { uTime: u.uTime, uFade: { value: 1 }, uRscale: { value: 4.2 } };
      var cm = new T.ShaderMaterial({ uniforms: cu, vertexShader: CORONA_VERT, fragmentShader: G.noise + CORONA_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      var corona = new T.Mesh(new T.PlaneGeometry(2, 2), cm); corona.scale.setScalar(cs); corona.frustumCulled = false; corona.renderOrder = 2;
      group.add(corona); P.corona = corona; P.extras.push(corona);
    }
    if (K.ring && opts.ring !== false) {
      var rg = new T.RingGeometry(radius * 1.22, radius * 2.3, 256, 6);
      var ru = { uC: u.uC, uSunPos: u.uSunPos, uSunCol: u.uSunCol, uAmb: u.uAmb, uR: u.uR, uSunI: u.uSunI, uFlatGlow: u.uFlatGlow, uSpread: u.uSpread,
        uFlatOn: u.uFlatOn, uFall: u.uFall, uFlatD: u.uFlatD, uFlatN: u.uFlatN, uFlatLift: u.uFlatLift };
      var rm = new T.ShaderMaterial({ uniforms: ru, vertexShader: RING_VERT, fragmentShader: G.noise + RING_FRAG, side: T.DoubleSide, transparent: true, depthWrite: false,
        blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor });
      var ring = new T.Mesh(rg, rm); ring.rotation.x = -Math.PI / 2; ring.frustumCulled = false; ring.renderOrder = 1;
      var tilt = new T.Group(); tilt.rotation.z = opts.ringTilt != null ? opts.ringTilt : 0.47; tilt.rotation.x = opts.ringTiltX != null ? opts.ringTiltX : 0.3; tilt.add(ring);
      group.add(tilt); P.ring = ring; P.ringTilt = tilt; P.extras.push(ring);
    }

    var _c = new T.Vector3();
    P.update = function (t) {
      u.uTime.value = t;
      u.uSpin.value = (opts.spin0 || 0) + t * P.spinRate;
      group.updateMatrixWorld();
      mesh.getWorldPosition(_c); u.uC.value.copy(_c);
      u.uR.value = radius * group.scale.x;
      if (P.atmo) P.atmo.material.uniforms.uRa.value = P.atmoRa * group.scale.x;
    };
    P.setSun = function (pos, intensity, color) {
      u.uSunPos.value.copy(pos);
      if (intensity != null) u.uSunI.value = intensity;
      if (color != null) u.uSunCol.value.set(color);
    };
    P.setFlat = function (f) {
      if (!f) { u.uFlatOn.value = 0; if (P.atmo) P.atmo.visible = true; return; }
      u.uFlatOn.value = 1;
      u.uFlatN.value.copy(f.n); u.uFlatD.value = f.d;
      u.uFall.value = f.fall; u.uSpread.value = Math.max(1, f.spread || 1);
      if (f.glow != null) u.uFlatGlow.value = f.glow;
      if (f.lift != null) u.uFlatLift.value = f.lift;
      // 大气、日冕随压平淡出
      var k = U.clamp((radius - f.fall) / (radius * 1.5), 0, 1);
      if (P.atmo) { P.atmo.material.uniforms.uFade.value = (kind === 'earth' ? 1 : 0.5) * (1 - k); P.atmo.visible = k < 0.999; }
      if (P.corona) P.corona.material.uniforms.uFade.value = 1 - k;
    };
    P.dispose = function () { group.traverse(function (o) { if (o.material) o.material.dispose(); }); };
    return P;
  }

  RU.fx.planets = {
    create: create,
    kinds: Object.keys(KINDS),
    /** 共享 GLSL（其他人想在自己的着色器里画同样的表面）：需要先拼 RU.glsl.noise + RU.glsl.common。函数：surfSun / surfEarth / surfMoon / surfMars / surfJupiter / surfSaturn / surfUranus / surfNeptune / surfVenus */
    glsl: { common: COMMON, surfaces: SURF }
  };
})();
