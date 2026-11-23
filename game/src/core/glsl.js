/* RU.glsl —— 共享 GLSL 片段。用法：fragmentShader: RU.glsl.noise + RU.glsl.blackbody + '...' */
(function () {
  var RU = window.RU, G = RU.glsl = {};

  // Ashima 3D simplex noise（MIT）+ fbm
  G.noise = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    ' const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    ' vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    ' vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    ' vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    ' i=mod289(i);',
    ' vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    ' float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    ' vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    ' vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);',
    ' vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw); vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    ' vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;',
    ' vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    ' return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}',
    'float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+vec3(17.1,3.7,9.2); a*=0.5; } return s; }',
    'float fbm3(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*snoise(p); p=p*2.03+vec3(17.1,3.7,9.2); a*=0.5; } return s; }',
    'float ridged(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*(1.0-abs(snoise(p))); p=p*2.03+vec3(5.3,1.7,8.1); a*=0.5; } return s; }',
    'float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }',
    'float hash13(vec3 p3){ p3=fract(p3*0.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }',
    ''].join('\n');

  // 黑体：planckRGB(T) 与 JS 版 RU.util.planckRGB 一致（以 5800K 的 G 通道 = 1 归一）。
  // 相对论多普勒：观测到的谱恰好是温度 δT 的黑体（I_ν/ν³ 不变量），所以只要 planckRGB(delta*T)。
  G.blackbody = [
    'float planckL(float lam, float T){ float x=14388.0/(lam*T); if(x>80.0) return 0.0; return pow(lam,-5.0)/(exp(x)-1.0); }',
    'vec3 planckRGB(float T){ const float REF=' + (function () { var x = 14388 / (0.55 * 5800); return (Math.pow(0.55, -5) / (Math.exp(x) - 1)).toFixed(6); })() + ';',
    ' return vec3(planckL(0.610,T),planckL(0.550,T),planckL(0.465,T))/REF; }',
    'vec3 blackbodyColor(float T){ vec3 c=planckRGB(T); return c/max(max(c.r,c.g),max(c.b,1e-20)); }',
    ''].join('\n');

  // 相对论：β 速度（c=1），dir 与速度方向夹角余弦
  G.relativity = [
    'float gammaOf(float b){ return 1.0/sqrt(max(1e-12,1.0-b*b)); }',
    // 静止系方向余弦 → 飞船系（光行差，星星向前聚拢）
    'float aberrate(float c, float b){ return (c+b)/(1.0+b*c); }',
    // 飞船系方向余弦 → 静止系（逆变换，用于给每个屏幕像素找天球上的原始方向）
    'float deaberrate(float c, float b){ return (c-b)/(1.0-b*c); }',
    // 多普勒因子：飞船系角度 θ\' 时 δ = 1/(γ(1−β cosθ\'))；等价于静止系角度 θ 时 δ = γ(1+β cosθ)
    'float dopplerShip(float cShip, float b){ return 1.0/(gammaOf(b)*(1.0-b*cShip)); }',
    'float dopplerRest(float cRest, float b){ return gammaOf(b)*(1.0+b*cRest); }',
    ''].join('\n');

  G.common = [
    'float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }',
    'vec2 dirToEquirect(vec3 d){ return vec2(atan(d.z,d.x)/6.2831853+0.5, asin(clamp(d.y,-1.0,1.0))/3.14159265+0.5); }',
    ''].join('\n');

  G.all = G.noise + G.blackbody + G.relativity + G.common;
})();
