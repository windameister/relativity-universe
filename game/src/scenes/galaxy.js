/* 场景：galaxy —— 主地图与离开期间的回放（galaxy 负责）。
 *
 * enter({ u, mode: 'map' })                       可交互地图；点击恒星 → RU.emit('select', id)；双击聚焦
 * enter({ u, mode: 'replay', t0, t1, res })       → Promise：上帝视角回放（时间压缩 + 光延迟可视化），播完或跳过时 resolve
 * 方法：setSelected(id) / setRoute(from, to, mode) / refresh() / focus(id) / setGodView(bool)
 * 截图：?scene=galaxy&t=3（地图） &variant=replay&t=12（回放） &variant=god / zoom / sky；&cam=dist,az,el &focus=id
 *
 * 视觉约定：1 单位 = 1 光年；银盘 = XZ；银心在 +X（与 RU.fx.sky 一致）。默认看到的是「光已经传到飞船」的样子：
 * 每颗星的状态 = stateAt(s, now − D[飞船所在][s])；上帝视角 = 真实现状 + 歌者 + 在途武器。
 */
(function () {
  var RU = window.RU, T = window.THREE, U = RU.util;
  var GAL_C = new T.Vector3(26000, 0, -1800);     // 银心（本地坐标，光年）
  var KIND = { O: 'star', B: 'star', A: 'star', F: 'star', G: 'star', K: 'star', M: 'star', '白矮星': 'wd', '中子星': 'ns', '黑洞': 'bh' };
  var BRIGHT = { O: 2.3, B: 2.0, A: 1.7, F: 1.6, G: 1.35, K: 1.15, M: 0.9, '白矮星': 1.7, '中子星': 2.2, '黑洞': 0 };
  var SPIKE = { O: 0.55, B: 0.48, A: 0.4, F: 0.32, G: 0.28, K: 0.2, M: 0.14, '白矮星': 0.3, '中子星': 0.45, '黑洞': 0 };

  function cue(n, o) { try { if (RU.audio && RU.audio.cue && !(RU.engine && RU.engine.still)) RU.audio.cue(n, o); } catch (e) { } }
  function mood(n) { try { if (RU.audio && RU.audio.mood) RU.audio.mood(n); } catch (e) { } }
  function apar(k, v) { try { if (RU.audio && RU.audio.param) RU.audio.param(k, v); } catch (e) { } }

  // ---------------------------------------------------------------- 样式（只属于本场景）
  function injectStyle() {
    if (document.getElementById('gx-style')) return;
    var css = [
      '#gx-labels{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}',
      '.gx-lb{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform,opacity;pointer-events:none}',
      '.gx-lb b{display:block;font-weight:500;font-size:12px;letter-spacing:.1em;color:rgba(232,238,252,.94);text-shadow:0 1px 4px #000,0 0 8px #000,0 0 2px #000}',
      '.gx-lb i{display:block;font-style:normal;font-size:10.5px;letter-spacing:.06em;margin-top:2px;color:#9aa4be;text-shadow:0 1px 4px #000,0 0 8px #000,0 0 2px #000}',
      '.gx-lb.big b{font-size:13px;color:#fff}',
      '.gx-lb.sel b{color:#fff;font-size:13.5px}',
      '.gx-lb.ship b{color:#8ff0ff}',
      '.gx-lb.dim b{color:rgba(200,208,230,.62)}',
      '.gx-ring{position:absolute;left:0;top:0;font:10px var(--mono);letter-spacing:.12em;color:rgba(150,190,255,.55);white-space:nowrap;text-shadow:0 0 4px #000}',
      '.gx-here{position:absolute;left:0;top:0;pointer-events:none;text-align:center;white-space:nowrap;transform-origin:50% 100%;background:rgba(4,7,14,.68);border:1px solid rgba(130,205,255,.32);padding:7px 14px;border-radius:3px;box-shadow:0 4px 20px rgba(0,0,0,.75)}',
      '.gx-here::after{content:"";position:absolute;left:50%;top:100%;width:1px;height:14px;background:linear-gradient(to bottom,rgba(130,205,255,.7),transparent)}',
      '.gx-here b{display:block;font:500 15px var(--serif);letter-spacing:.4em;color:#fff;text-shadow:0 0 12px rgba(120,200,255,.8),0 0 3px #000}',
      '.gx-here i{display:block;font-style:normal;font:10.5px var(--sans);letter-spacing:.2em;color:#b8cbe8;margin-top:4px;text-shadow:0 0 8px #000,0 0 3px #000}',
      '.gx-scale{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);font:11px var(--mono);letter-spacing:.2em;color:rgba(170,190,230,.7);text-shadow:0 0 6px #000;pointer-events:none;transition:opacity .6s}',
      '.gx-god{position:absolute;right:18px;top:64px;font:11px var(--sans);letter-spacing:.2em;color:#e9c8ff;background:rgba(40,10,60,.45);border:1px solid rgba(220,160,255,.35);padding:6px 10px;border-radius:2px;pointer-events:none}',
      '.gx-hud{position:absolute;left:50%;top:18px;transform:translateX(-50%);text-align:center;pointer-events:none}',
      '.gx-badge{display:inline-block;font:11px var(--sans);letter-spacing:.42em;padding:5px 14px 5px 18px;color:#f6dca0;border:1px solid rgba(246,220,160,.45);background:rgba(30,22,6,.35);text-shadow:0 0 8px rgba(255,200,100,.5)}',
      '.gx-year{font:300 40px var(--mono);letter-spacing:.08em;color:#fff;margin-top:10px;text-shadow:0 0 20px rgba(150,190,255,.45)}',
      '.gx-year small{font-size:14px;color:#8a93ab;letter-spacing:.3em;margin-left:8px}',
      '.gx-rate{font:11px var(--mono);letter-spacing:.2em;color:#8a93ab;margin-top:2px}',
      '.gx-cap{position:absolute;left:50%;bottom:11vh;transform:translateX(-50%);width:min(960px,92vw);text-align:center;pointer-events:none}',
      '.gx-cap .c{transition:opacity .5s;text-wrap:balance}',
      '.gx-cap .sub{font:12px var(--sans);letter-spacing:.12em;color:#8a93ab;margin-top:8px}',
      '.gx-cap .see{font:13px var(--sans);letter-spacing:.25em;color:#8ff0ff;margin-bottom:10px;text-shadow:0 0 10px rgba(120,230,255,.7)}',
      '.gx-skip{position:absolute;right:22px;bottom:22px;font:12px var(--sans);letter-spacing:.2em;color:#cfd6ea;background:rgba(10,14,24,.5);border:1px solid rgba(160,190,255,.25);padding:8px 14px;cursor:pointer;pointer-events:auto}',
      '.gx-skip:hover{border-color:rgba(160,190,255,.6);color:#fff}',
      '.gx-bar{position:absolute;left:50%;bottom:5.5vh;transform:translateX(-50%);width:min(560px,70vw);height:2px;background:rgba(160,190,255,.15);pointer-events:none}',
      '.gx-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,rgba(143,211,255,.3),#8fd3ff)}',
      '.gx-bar u{position:absolute;top:-3px;width:2px;height:8px;background:#ffb35c;text-decoration:none}',
      '@media (max-width:640px){.gx-year{font-size:28px}.gx-lb b{font-size:11px}.gx-cap{bottom:78px;width:92vw}.gx-bar{bottom:58px;width:82vw}.gx-skip{right:14px;bottom:14px;padding:6px 10px}}'
    ].join('\n');
    var el = document.createElement('style'); el.id = 'gx-style'; el.textContent = css; document.head.appendChild(el);
  }

  // ---------------------------------------------------------------- 着色器
  var BB_VS_HEAD = [
    'uniform float pxk;',
    'vec3 bbRight(){ return vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]); }',
    'vec3 bbUp(){ return vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]); }'].join('\n');

  // 恒星：核心 + 柔光 + 克制的衍射星芒。屏幕上有最小像素尺寸，远了也读得出来
  var STAR_VS = [BB_VS_HEAD,
    'uniform float worldSize, minPx, squash; varying vec2 vQ; varying float vPx;',
    'void main(){ vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; float dist=max(length(cameraPosition-c),1e-3);',
    ' float s=max(worldSize, minPx*pxk*dist); vPx=s/(pxk*dist); vQ=position.xy;',
    ' vec3 w=c+(bbRight()*position.x*(1.0+squash*2.5)+bbUp()*position.y*(1.0-squash*0.85))*s;',
    ' gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0); }'].join('\n');
  var STAR_FS = [
    'uniform vec3 color; uniform float inten, coreW, spike, rot, fade, ember, time, seed, squash;',
    'varying vec2 vQ; varying float vPx;',
    'void main(){ vec2 q=vQ*vPx; float r=length(q);',
    ' float cr=max(1.15, coreW/max(1e-4,1.0)*1.0); cr=max(1.15, coreW*vPx);',
    ' float core=smoothstep(cr*1.05,cr*0.45,r);',
    ' float glow=exp(-r/(cr*1.5+0.8));',
    ' float halo=0.16/(1.0+pow(r/(cr*5.0+3.0),2.0));',
    ' float ca=cos(rot), sa=sin(rot); vec2 p=vec2(ca*q.x-sa*q.y, sa*q.x+ca*q.y); float L=vPx*0.95;',
    ' float s1=exp(-abs(p.y)/0.65)*pow(max(0.0,1.0-abs(p.x)/L),2.2)+exp(-abs(p.x)/0.65)*pow(max(0.0,1.0-abs(p.y)/L),2.2);',
    ' vec2 p2=vec2(p.x+p.y,p.x-p.y)*0.7071; float s2=(exp(-abs(p2.y)/0.5)*pow(max(0.0,1.0-abs(p2.x)/(L*0.45)),2.0)+exp(-abs(p2.x)/0.5)*pow(max(0.0,1.0-abs(p2.y)/(L*0.45)),2.0))*0.25;',
    ' float spk=(s1+s2)*spike;',
    ' float fl=1.0+ember*0.25*sin(time*3.1+seed*7.0)*sin(time*1.7+seed);',
    ' vec3 hot=mix(color,vec3(1.0),0.7*(1.0-ember));',
    ' vec3 c=color*(glow*0.8+halo+spk*0.7)+hot*core*1.15;',
    ' c*=inten*fl; float e=1.0-smoothstep(0.8,1.0,length(vQ));',
    ' gl_FragColor=vec4(c*e*fade,1.0); }'].join('\n');

  // 通用的「屏幕尺寸固定」图标公告板：选中环、悬停环、飞船、歌者
  var ICON_VS = [BB_VS_HEAD,
    'uniform float px; varying vec2 vQ; varying float vPx;',
    'void main(){ vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; float dist=max(length(cameraPosition-c),1e-3); float s=px*pxk*dist; vPx=px; vQ=position.xy;',
    ' vec3 w=c+(bbRight()*position.x+bbUp()*position.y)*s; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0); }'].join('\n');
  var RING_FS = [
    'uniform vec3 color; uniform float opacity, time, ticks, spin; varying vec2 vQ; varying float vPx;',
    'void main(){ float r=length(vQ)*vPx; float R=vPx*0.78; float w=1.0;',
    ' float ring=smoothstep(w+0.8,w-0.2,abs(r-R));',
    ' float a=atan(vQ.y,vQ.x)+time*spin; float tk=step(0.75,fract(a/6.2831853*ticks))*smoothstep(R+5.0,R+2.0,r)*step(R+0.8,r);',
    ' float gap=smoothstep(0.0,0.15,abs(fract(a/6.2831853*4.0)-0.5)); ring*=mix(1.0,gap,step(0.5,ticks));',
    ' float glow=exp(-abs(r-R)/3.0)*0.25;',
    ' gl_FragColor=vec4(color*(ring+tk*0.8+glow)*opacity,1.0); }'].join('\n');
  var SHIP_FS = [
    'uniform vec3 color; uniform float opacity, time; varying vec2 vQ; varying float vPx;',
    'void main(){ vec2 q=vQ*vPx; float d=abs(q.x)+abs(q.y); float core=smoothstep(4.0,2.5,d); float r=length(q);',
    ' float ph=fract(time*0.45); float pulse=smoothstep(1.5,0.0,abs(r-(4.0+ph*vPx*0.8)))*(1.0-ph);',
    ' float ring=smoothstep(1.2,0.2,abs(r-9.0))*0.7; float glow=exp(-r/5.0)*0.6;',
    ' gl_FragColor=vec4(color*(core*2.2+pulse*0.9+ring+glow)*opacity,1.0); }'].join('\n');
  var SINGER_FS = [
    'uniform float opacity, time; varying vec2 vQ; varying float vPx;',
    'void main(){ vec2 q=vQ*vPx; float r=length(q);',
    ' float core=exp(-r/2.2)*1.6; float halo=exp(-r/12.0)*0.35*(0.8+0.2*sin(time*0.9));',
    ' float ring=smoothstep(1.2,0.0,abs(r-vPx*0.55))*0.5*(0.6+0.4*sin(time*0.6));',
    ' vec3 c=vec3(1.0,0.35,0.85)*halo+vec3(1.2,0.75,1.3)*core+vec3(0.9,0.4,1.0)*ring;',
    ' gl_FragColor=vec4(c*opacity,1.0); }'].join('\n');

  // 领地全息层：银盘平面上的一张大图，按文明的势场画轮廓线 + 极淡填充 + 六边形网格；同时画以飞船为圆心的光行距离环
  var TERR_VS = 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }';
  var TERR_FS = [
    '#define NS 40',
    'uniform vec4 sp[NS]; uniform vec3 cc[8]; uniform int n; uniform vec2 ship; uniform float time, op, gridOp, sig;',
    'varying vec3 vW;',
    'float hexLine(vec2 p, float s){ p/=s; vec2 r=vec2(1.0,1.7320508); vec2 h=r*0.5; vec2 a=mod(p,r)-h; vec2 b=mod(p-h,r)-h; vec2 g=dot(a,a)<dot(b,b)?a:b;',
    ' vec2 ag=abs(g); float d=max(dot(ag,normalize(vec2(1.0,1.7320508))),ag.x); return 0.5-d; }',
    'void main(){ vec2 p=vW.xz; float f[8]; for(int k=0;k<8;k++) f[k]=0.0;',
    ' for(int i=0;i<NS;i++){ if(i>=n) break; int c=int(sp[i].z); if(c<0) continue; vec2 d=p-sp[i].xy; f[c]+=sp[i].w*exp(-dot(d,d)/(2.0*sig*sig)); }',
    ' float m1=0.0, m2=0.0; int i1=-1;',
    ' for(int k=0;k<8;k++){ if(f[k]>m1){ m2=m1; m1=f[k]; i1=k; } else if(f[k]>m2) m2=f[k]; }',
    ' vec3 col=vec3(0.0);',
    ' if(i1>=0){ vec3 C=cc[i1]; float th=0.42; float fw=max(fwidth(m1),1e-4);',
    '  float line=1.0-clamp(abs(m1-th)/fw*0.9,0.0,1.0);',
    '  float line2=(1.0-clamp(abs(m1-th*1.9)/fw*1.2,0.0,1.0))*0.35;',
    '  float inside=smoothstep(th,th+0.08,m1);',
    '  float hx=hexLine(p+vec2(0.0,time*0.05),2.6); float hl=(1.0-smoothstep(0.0,max(fwidth(hx)*1.2,0.02),hx))*inside*smoothstep(th+0.9,th+0.2,m1);',
    '  float scan=0.5+0.5*sin(length(p)*0.35-time*0.8);',
    '  float contest=step(th,m2)*(1.0-clamp(abs(m1-m2)/max(fwidth(m1-m2),1e-4)*0.7,0.0,1.0));',
    '  col=C*(line*1.25+line2+inside*(0.035+0.02*scan)+hl*0.10)+vec3(1.0,0.9,0.8)*contest*0.9; }',
    // 飞船为圆心：光行距离环（25 / 50 / 100 / 150 光年）
    ' vec2 ds=p-ship; float rs=length(ds); float g=0.0;',
    ' for(int k=0;k<4;k++){ float R=k==0?25.0:k==1?50.0:k==2?100.0:150.0; float fw2=max(fwidth(rs),1e-3); float ln=1.0-clamp(abs(rs-R)/fw2,0.0,1.0);',
    '  float ang=atan(ds.y,ds.x); float dash=step(0.35,fract(ang*R*0.25/6.2831853*6.0)); g+=ln*mix(0.55,1.0,dash)*(k==1?1.2:0.85); }',
    ' float spokes=0.0; { float ang=atan(ds.y,ds.x); float a12=abs(fract(ang/6.2831853*12.0+0.5)-0.5)*6.2831853/12.0*rs; float fw3=max(fwidth(a12),1e-3);',
    '  spokes=(1.0-clamp(a12/fw3,0.0,1.0))*smoothstep(8.0,20.0,rs)*smoothstep(160.0,90.0,rs)*0.35; }',
    ' col+=vec3(0.45,0.62,1.0)*(g*0.16+spokes*0.08)*gridOp*smoothstep(170.0,120.0,rs);',
    ' gl_FragColor=vec4(col*op,1.0); }'].join('\n');

  // 曲率航迹 / 航线 / 武器轨迹：面向相机的带子
  var RIB_VS = [
    'uniform vec3 A, B; uniform float width, frac0, frac1, minPx, pxk; varying vec2 vT;',
    'void main(){ float t=mix(frac0,frac1,position.x); vec3 P=mix(A,B,t); vec3 tg=normalize(B-A); vec3 toC=cameraPosition-P; float dist=length(toC);',
    ' vec3 side=normalize(cross(tg,toC/dist)); float w=max(width, minPx*pxk*dist); P+=side*position.y*w; vT=vec2(t,position.y);',
    ' gl_Position=projectionMatrix*viewMatrix*vec4(P,1.0); }'].join('\n');
  function RIB_FS() {
    return [RU.glsl.noise,
      'uniform vec3 color, color2; uniform float inten, time, len, seed, mode, frac1, head;',
      'varying vec2 vT;',
      'void main(){ float x=vT.y; float t=vT.x;',
      ' float core=exp(-x*x*22.0); float glow=exp(-x*x*3.0)*0.4;',
      ' float c0=smoothstep(0.0,0.015,t)*smoothstep(frac1,frac1-0.004,t);',
      ' vec3 c;',
      ' if(mode<0.5){', // 曲率航迹：湍流的发光丝，带缓慢的脉动
      '  float n=fbm3(vec3(t*len*0.18-time*0.03, x*1.2, seed))*0.5+0.5; float n2=fbm3(vec3(t*len*0.9+seed, x*3.0, time*0.05))*0.5+0.5;',
      '  c=mix(color2,color,core)*(core*1.3+glow*(0.4+1.2*n)*(0.6+0.6*n2));',
      '  c+=color*head*exp(-pow((frac1-t)*len/1.5,2.0))*3.0*core;',
      ' } else if(mode<1.5){', // 航线：流动的虚线
      '  float d=fract(t*len/2.4-time*0.7); float dash=smoothstep(0.0,0.08,d)*smoothstep(0.55,0.45,d);',
      '  c=color*(core*(0.35+0.9*dash)+glow*0.25);',
      ' } else {', // 武器：细而冷的轨迹
      '  c=color*(core*0.6+glow*0.2);',
      '  c+=color2*head*exp(-pow((frac1-t)*len/2.0,2.0))*4.0*(core+glow);',
      ' }',
      ' gl_FragColor=vec4(c*inten*c0,1.0); }'].join('\n');
  }

  // 二维化区域：被压扁、无限摊开的画（笔触随半径差速旋转）；被吞的恒星摊成巨大的同心圆画面；前沿是一圈细亮线 + 「熨平」的涟漪
  function FLAT_FS() {
    return [RU.glsl.noise,
      '#define NF 10',
      'uniform sampler2D map; uniform float R, rmax, size, time, growing, seed, op; uniform int nfs; uniform vec4 fs[NF]; uniform vec3 fc[NF];',
      'varying vec2 vUv;',
      'void main(){ vec2 p=(vUv*2.0-1.0)*size; float r=length(p); float fw=max(fwidth(r),1e-3);',
      ' if(r>R){ float x=r-R; float rip=(0.5+0.5*sin(x*5.0-time*5.0))*exp(-x/(1.2+R*0.05))*growing;',
      '  float edge=exp(-x*x/(0.02+fw*fw*2.0)); float halo=exp(-x/0.9)*0.5;',
      '  vec3 c=vec3(0.75,0.82,1.0)*rip*0.10+vec3(1.0,0.86,0.62)*(edge*(0.6+0.6*growing)+halo*(0.06+0.14*growing));',
      '  float a=max(rip*0.18, max(edge, halo*0.4)); if(a<0.003) discard; gl_FragColor=vec4(c, a*op); return; }',
      ' float rr=r/max(rmax,1.0);',
      ' float ang=atan(p.y,p.x)+time*0.018*(0.35+1.4*(1.0-rr))+seed;',
      ' vec2 q=vec2(cos(ang),sin(ang))*rr*0.47+0.5; q+=0.008*vec2(sin(rr*26.0-time*0.4+seed),cos(rr*21.0-time*0.33));',
      ' vec3 pc=texture2D(map,q).rgb; vec3 pc2=texture2D(map,q*1.9+0.21).rgb; pc=mix(pc,pc2,0.3);',
      ' float lum=dot(pc,vec3(0.3,0.59,0.11)); pc=mix(vec3(lum),pc,0.8)*0.8;',
      ' for(int k=0;k<NF;k++){ if(k>=nfs) break; vec2 d=p-fs[k].xy; float dr=length(d); float sr=fs[k].z; float fade=fs[k].w;',
      '  float da=atan(d.y,d.x); float wob=1.0+0.04*sin(da*3.0+seed+float(k));',
      '  float disk=smoothstep(sr*0.17,sr*0.09,dr*wob);',
      '  float rays=pow(0.5+0.5*cos(da*28.0+fbm3(vec3(d*0.4,float(k)))*4.0),6.0)*smoothstep(sr*0.75,sr*0.14,dr)*0.7;',
      '  float rings=0.0; for(int j=0;j<5;j++){ float rj=sr*(0.3+0.17*float(j)); rings+=exp(-pow((dr*wob-rj)/(sr*0.008+fw),2.0))*(1.0-0.12*float(j)); }',
      '  float flare=exp(-dr/(sr*0.22))*0.8;',
      '  vec3 C=fc[k];',
      '  pc=mix(pc, C*1.3+0.15, disk*fade); pc+=C*(rings*0.55+rays*0.35+flare*0.35)*fade; }',
      ' float fresh=growing*smoothstep(R-2.5,R,r); pc+=vec3(1.0,0.72,0.42)*fresh*0.18;',
      ' float edge=exp(-pow((R-r)/(0.12+fw),2.0)); pc+=vec3(1.0,0.88,0.62)*edge*0.9;',
      ' float vign=smoothstep(R,R*0.6,r)*0.25+0.75;',
      ' gl_FragColor=vec4(pc*0.85*vign, 0.95*op); }'].join('\n');
  }

  // 二维前沿外侧坠向平面的碎屑：越靠近前沿越扁、越亮
  var FALL_VS = [
    'attribute vec4 seedA; uniform float R, time, h0, pxk, op; varying float vA; varying float vS;',
    'void main(){ float th=seedA.x*6.2831853; float ph=fract(seedA.y+time*0.11*(0.6+seedA.w)); float x=(1.0-ph)*4.5;',
    ' float r=R+x; float hy=seedA.z*h0*pow(clamp(x/4.5,0.0,1.0),1.4);',
    ' vec3 P=vec3(cos(th)*r, hy, sin(th)*r); vec4 mv=modelViewMatrix*vec4(P,1.0);',
    ' vA=op*smoothstep(0.0,0.15,ph)*(0.15+0.5*ph); vS=1.0+2.5*ph; gl_PointSize=vS*' + '1.0' + '; gl_Position=projectionMatrix*mv; }'].join('\n');
  var FALL_FS = 'varying float vA; varying float vS; void main(){ vec2 q=gl_PointCoord-0.5; float r=length(q)*2.0; float a=exp(-r*r*3.0); gl_FragColor=vec4(vec3(1.0,0.85,0.6)*a*vA*1.4,1.0); }';

  // 冲击壳 / 光球：菲涅尔边缘发光的球壳
  var SHELL_VS = 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP=position; vec4 w=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }';
  var SHOCK_FS = ['uniform float opacity, time; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    'void main(){ float f=1.0-abs(dot(vN,vV));',
    ' float turb=0.7+0.3*sin(vP.x*9.0+time*2.0)*sin(vP.y*7.0-time*1.3)*sin(vP.z*8.0+time*1.7);',
    ' vec3 c=mix(vec3(1.0,0.55,0.25),vec3(0.6,0.8,1.0),smoothstep(0.7,1.0,f))*(pow(f,7.0)*1.6)*turb;',
    ' gl_FragColor=vec4(c*opacity,1.0); }'].join('\n');
  var LIGHT_FS = ['uniform float opacity; uniform vec3 color; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    'void main(){ float f=1.0-abs(dot(vN,vV)); float rim=pow(f,6.0); float lat=exp(-pow(vP.y/0.012,2.0));',
    ' gl_FragColor=vec4(color*(rim*0.55+0.01+lat*0.35)*opacity,1.0); }'].join('\n');

  // 白矮星外的行星状星云壳、中子星的脉冲束
  var PN_FS = [RU.glsl ? '' : '', 'uniform float time, opacity, seed; varying vec2 vQ; varying float vPx;',
    'float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
    'void main(){ float r=length(vQ); float a=atan(vQ.y,vQ.x);',
    ' float w=0.5+0.5*sin(a*5.0+seed)*sin(a*3.0-seed*2.0); float R=0.62+0.05*w;',
    ' float shell=exp(-pow((r-R)/0.07,2.0)); float inner=exp(-pow((r-R*0.72)/0.12,2.0))*0.5;',
    ' vec3 c=vec3(0.25,0.85,0.95)*inner+vec3(1.0,0.3,0.42)*shell*(0.6+0.4*w);',
    ' gl_FragColor=vec4(c*opacity*smoothstep(1.0,0.85,r),1.0); }'].join('\n');
  var BEAM_VS = 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }';
  var BEAM_FS = 'uniform float opacity; varying vec2 vUv; varying vec3 vN, vV; void main(){ float along=vUv.y; float a=pow(1.0-along,2.0)*smoothstep(0.0,0.08,along); float ed=pow(abs(dot(normalize(vN),normalize(vV))),2.2); gl_FragColor=vec4(vec3(0.5,0.75,1.0)*a*ed*0.32*opacity,1.0); }';

  // 星云：多层 fbm 公告板（世界尺寸）
  function NEB_FS() {
    return [RU.glsl.noise,
      'uniform vec3 color; uniform float opacity, time, seed; varying vec2 vQ;',
      'void main(){ float r=length(vQ); if(r>1.0) discard;',
      ' vec3 p=vec3(vQ*1.6,seed)+vec3(0.0,0.0,time*0.004); float n=fbm(p+fbm3(p*1.3)*0.6); float n2=ridged(p*2.2+3.0);',
      ' float m=smoothstep(1.0,0.2,r)*smoothstep(-0.25,0.45,n);',
      ' vec3 c=color*m*(0.6+0.8*n2*n2)+vec3(1.0,0.8,0.9)*pow(max(n2-0.6,0.0),2.0)*m*0.6;',
      ' gl_FragColor=vec4(c*opacity,1.0); }'].join('\n');
  }
  var NEB_VS = [BB_VS_HEAD, 'uniform float size; varying vec2 vQ;',
    'void main(){ vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vQ=position.xy; vec3 w=c+(bbRight()*position.x+bbUp()*position.y)*size; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0); }'].join('\n');

  // 点云（本地星野 / 银河系）：像素尺寸随距离
  var PTS_VS = ['attribute vec4 col; attribute float size; uniform float pxs, op, maxPx; varying vec4 vC;',
    'void main(){ vC=col; vec4 mv=modelViewMatrix*vec4(position,1.0); float s=size*pxs/max(-mv.z,1e-3); vC.a*=op*clamp(s/1.2,0.0,1.0); gl_PointSize=clamp(s,1.2,maxPx); gl_Position=projectionMatrix*mv; }'].join('\n');
  var PTS_FS = 'varying vec4 vC; void main(){ vec2 q=gl_PointCoord-0.5; float r=length(q)*2.0; float a=exp(-r*r*4.0); gl_FragColor=vec4(vC.rgb*vC.a*a,1.0); }';
  var DUST_FS = 'varying vec4 vC; void main(){ vec2 q=gl_PointCoord-0.5; float r=length(q)*2.0; float a=exp(-r*r*2.5)*vC.a; gl_FragColor=vec4(vC.rgb, a); }';
  var GDISC_FS = [
    'uniform float op; varying vec2 vUv;',
    'void main(){ vec2 p=(vUv-0.5)*2.0*60000.0; float r=length(p); float a=atan(p.y,p.x);',
    ' float disk=exp(-r/11000.0); float bulge=exp(-pow(r/4200.0,1.4))*2.2;',
    ' float arms=0.0; for(int k=0;k<4;k++){ float ph=float(k)*1.5707963+0.35; float th=log(max(r,800.0)/2600.0)/0.2126+ph; float d=sin((a-th)*1.0); arms+=pow(max(0.0,cos(a-th)),18.0); }',
    ' float m=disk*(0.35+0.9*arms)+bulge;',
    ' vec3 c=mix(vec3(0.55,0.70,1.0),vec3(1.0,0.84,0.58),smoothstep(12000.0,2500.0,r))*m*0.048;',
    ' gl_FragColor=vec4(c*op*smoothstep(60000.0,45000.0,r),1.0); }'].join('\n');

  // 二维前沿的屏幕空间涟漪（空间被「熨平」的折射）
  function makeFrontPass() {
    var N = 4, z = function () { var a = []; for (var i = 0; i < N; i++) a.push(new T.Vector2()); return a; };
    var pass = new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, aspect: { value: 1 }, time: { value: 0 }, n: { value: 0 }, fc: { value: z() }, fa: { value: z() }, fb: { value: z() }, fs: { value: [0, 0, 0, 0] } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float aspect, time; uniform int n; uniform vec2 fc[4]; uniform vec2 fa[4]; uniform vec2 fb[4]; uniform float fs[4]; varying vec2 vUv;',
        'void main(){ vec2 off=vec2(0.0); float glow=0.0; vec2 p=vec2(vUv.x*aspect,vUv.y);',
        ' for(int i=0;i<4;i++){ if(i>=n) break; vec2 d=p-fc[i]; float det=fa[i].x*fb[i].y-fa[i].y*fb[i].x; if(abs(det)<1e-7) continue;',
        '  float s=(d.x*fb[i].y-d.y*fb[i].x)/det, t=(-d.x*fa[i].y+d.y*fa[i].x)/det; float rho=sqrt(s*s+t*t);',
        '  float x=(rho-1.0)/0.05; float ring=exp(-x*x); float rip=sin(rho*70.0-time*6.0)*exp(-max(rho-1.0,0.0)/0.1)*step(1.0,rho)*0.5;',
        '  vec2 dir=length(d)>1e-5?normalize(d):vec2(0.0); off+=dir*(ring*-x*0.45+rip)*fs[i]*0.010; glow+=ring*fs[i]; }',
        ' off.x/=aspect; vec2 uv=vUv+off; float ca=length(off)*10.0;',
        ' vec3 c=vec3(texture2D(tDiffuse,uv+off*ca).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-off*ca).b);',
        ' c+=vec3(1.0,0.84,0.55)*glow*0.04; gl_FragColor=vec4(c,1.0); }'].join('\n')
    });
    pass.enabled = false;
    return pass;
  }

  // 笔触画（梵高式）：沿涡旋流场画几千笔
  var _paint = null;
  function paintTex() {
    if (_paint) return _paint;
    _paint = U.canvasTex(1024, 1024, function (g, w, h) {
      var r = U.mulberry(777);
      var bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); bg.addColorStop(0, '#1d2f7a'); bg.addColorStop(0.6, '#13235e'); bg.addColorStop(1, '#0b1440');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      var pal = ['#1c3f94', '#2b5cb4', '#3d7bdf', '#f6c945', '#e8a83b', '#1a3378', '#fff0b8', '#2a8fa6', '#173a8c', '#f6d465', '#3d6bcf', '#122a6e', '#c9822b', '#9fc8ef', '#0f2160', '#24489a'];
      var vort = []; for (var v = 0; v < 11; v++) vort.push([r() * w, r() * h, (r() < 0.5 ? -1 : 1), 50 + r() * 120]);
      function fang(x, y) {
        var a = Math.atan2(y - h / 2, x - w / 2) + Math.PI / 2 + 0.8 * Math.sin(x * 0.009 + y * 0.0055) + 0.5 * Math.sin(y * 0.0125 - x * 0.0035);
        var vx = Math.cos(a), vy = Math.sin(a);
        vort.forEach(function (q) { var dx = x - q[0], dy = y - q[1], d = Math.sqrt(dx * dx + dy * dy) + 1, k = Math.exp(-d * d / (q[3] * q[3] * 2)) * 2.5 * q[2]; vx += -dy / d * k; vy += dx / d * k; });
        return Math.atan2(vy, vx);
      }
      g.lineCap = 'round';
      for (var i = 0; i < 9000; i++) {
        var x = r() * w, y = r() * h;
        g.strokeStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = 0.22 + r() * 0.55; g.lineWidth = 1.5 + r() * 6;
        g.beginPath(); g.moveTo(x, y);
        for (var k = 0, L = 10 + r() * 34; k < L; k++) { var a = fang(x, y); x += Math.cos(a) * 2.6; y += Math.sin(a) * 2.6; g.lineTo(x, y); }
        g.stroke();
      }
    });
    _paint.wrapS = _paint.wrapT = T.MirroredRepeatWrapping;
    return _paint;
  }

  // ---------------------------------------------------------------- 场景
  RU.defineScene('galaxy', function (E) {
    injectStyle();
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(50, 1, 0.1, 6e5);
    var dom = E.renderer.domElement;
    var controls = new T.OrbitControls(camera, dom);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.55; controls.zoomSpeed = 1.1;
    controls.minDistance = 6; controls.maxDistance = 240000; controls.maxPolarAngle = Math.PI * 0.94; controls.screenSpacePanning = false;
    controls.enabled = false;

    var UT = { value: 0 }, PXK = { value: 0.001 };
    var SKY = RU.fx.sky.get(E.renderer);
    var backdrop = SKY.createBackdrop({ intensity: 0.8, grain: 1, stars: 0.9 }); scene.add(backdrop);
    var frontPass = makeFrontPass();

    var st = { u: null, mode: 'map', god: false, sel: null, hover: null, route: null, RP: null, demo: false, fly: null, lastInteract: 0, intro: null, built: null };
    var root = new T.Group(); scene.add(root);         // 当前宇宙（每局重建）
    var sysO = [], flatO = {}, trailO = [], strikeO = [], fx = [], lightO = [];
    var labelsEl = null, starLabelsEl = null, ringEls = [], hereEl = null, scaleEl = null, godEl = null, hudEl = null;
    var listeners = [];

    // ---------- 材质工厂 ----------
    function starMat(color, inten, spike, coreW, worldSize, minPx, seed) {
      return new T.ShaderMaterial({ uniforms: { pxk: PXK, time: UT, color: { value: new T.Color().fromArray(color) }, inten: { value: inten }, spike: { value: spike }, coreW: { value: coreW },
        worldSize: { value: worldSize }, minPx: { value: minPx }, rot: { value: 0.12 }, fade: { value: 1 }, ember: { value: 0 }, seed: { value: seed || 0 }, squash: { value: 0 } },
        vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    }
    function iconMat(fs, px, extra) {
      var u = { pxk: PXK, time: UT, px: { value: px }, opacity: { value: 1 }, color: { value: new T.Color(1, 1, 1) }, ticks: { value: 0 }, spin: { value: 0 } };
      for (var k in extra) u[k] = extra[k];
      return new T.ShaderMaterial({ uniforms: u, vertexShader: ICON_VS, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending });
    }
    var QUAD = new T.PlaneGeometry(2, 2);
    function bb(mat, order) { var m = new T.Mesh(QUAD, mat); m.frustumCulled = false; if (order != null) m.renderOrder = order; return m; }
    var RIBGEO = (function () { var g = new T.PlaneGeometry(1, 2, 160, 1); g.translate(0.5, 0, 0); return g; })();
    function ribbon(mode, color, color2) {
      var mat = new T.ShaderMaterial({ uniforms: { A: { value: new T.Vector3() }, B: { value: new T.Vector3() }, width: { value: 0.5 }, frac0: { value: 0 }, frac1: { value: 1 }, minPx: { value: 1.2 }, pxk: PXK,
        color: { value: new T.Color().fromArray(color) }, color2: { value: new T.Color().fromArray(color2 || color) }, inten: { value: 1 }, time: UT, len: { value: 100 }, seed: { value: Math.random() * 10 }, mode: { value: mode }, head: { value: 0 } },
        vertexShader: RIB_VS, fragmentShader: RIB_FS(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      var m = new T.Mesh(RIBGEO, mat); m.frustumCulled = false; return m;
    }
    function setRib(m, a, b, f0, f1) { var U2 = m.material.uniforms; U2.A.value.copy(a); U2.B.value.copy(b); U2.frac0.value = f0 || 0; U2.frac1.value = f1 == null ? 1 : f1; U2.len.value = a.distanceTo(b); }
    var SHELLGEO = new T.SphereGeometry(1, 64, 32);
    function shell(fs, uni) { var m = new T.Mesh(SHELLGEO, new T.ShaderMaterial({ uniforms: uni, vertexShader: SHELL_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); m.frustumCulled = false; return m; }

    // ---------- 常驻对象：选中/悬停环、飞船、歌者、航线 ----------
    var selRing = bb(iconMat(RING_FS, 22, {}), 20); selRing.material.uniforms.color.value.setRGB(1.3, 1.35, 1.5); selRing.material.uniforms.ticks.value = 24; selRing.material.uniforms.spin.value = 0.25;
    var hovRing = bb(iconMat(RING_FS, 17, {}), 20); hovRing.material.uniforms.color.value.setRGB(0.55, 0.75, 1.1); hovRing.material.uniforms.opacity.value = 0.6;
    var shipIcon = bb(iconMat(SHIP_FS, 22, {}), 21); shipIcon.material.uniforms.color.value.setRGB(0.55, 1.5, 1.7);
    var singerIcon = bb(iconMat(SINGER_FS, 30, {}), 19);
    var routeRib = ribbon(1, [1.6, 0.6, 1.4]); routeRib.visible = false;
    var hereIcon = bb(iconMat(RING_FS, 11, {}), 22); hereIcon.material.uniforms.color.value.setRGB(0.45, 0.95, 1.25); hereIcon.material.uniforms.ticks.value = 4; hereIcon.visible = false;
    scene.add(selRing, hovRing, shipIcon, singerIcon, routeRib, hereIcon);

    // 回放特效池：闪光、冲击壳、平面波、来袭光粒、二向箔纸片
    for (var fi = 0; fi < 6; fi++) {
      var o = {
        flash: bb(starMat([1, 0.95, 0.9], 0, 1.0, 0.03, 30, 40, fi), 8),
        shock: shell(SHOCK_FS, { opacity: { value: 0 }, time: UT }),
        wave: new T.Mesh(new T.RingGeometry(0.985, 1, 160), new T.MeshBasicMaterial({ color: new T.Color(1.2, 0.8, 0.5), transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })),
        bolt: bb(starMat([0.8, 0.9, 1.0], 0, 0.6, 0.12, 0.5, 9, fi), 9),
        streak: ribbon(2, [0.6, 0.75, 1.2], [1.4, 1.5, 2.0]),
        foil: bb(starMat([0.8, 1.0, 1.2], 0, 0.2, 0.2, 0.6, 10, fi), 9)
      };
      o.wave.rotation.x = -Math.PI / 2; o.wave.frustumCulled = false;
      ['flash', 'shock', 'wave', 'bolt', 'streak', 'foil'].forEach(function (k) { o[k].visible = false; scene.add(o[k]); });
      fx.push(o);
    }
    for (var li = 0; li < 4; li++) {
      var L = { sphere: shell(LIGHT_FS, { opacity: { value: 0 }, color: { value: new T.Color(1.0, 0.9, 0.7) } }) };
      L.ring = new T.Mesh(new T.RingGeometry(0.995, 1.0, 256), new T.MeshBasicMaterial({ color: new T.Color(1.4, 1.2, 0.8), transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      L.ring.rotation.x = -Math.PI / 2; L.ring.frustumCulled = false; L.sphere.visible = L.ring.visible = false;
      scene.add(L.sphere, L.ring); lightO.push(L);
    }

    // ---------- 本地星野与尘埃（给 200 光年的星图体积感，也接住拉远时的过渡） ----------
    function makePoints(n, gen, fs, blending) {
      var g = new T.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
      for (var i = 0; i < n; i++) gen(i, pos, col, size);
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('col', new T.BufferAttribute(col, 4)); g.setAttribute('size', new T.BufferAttribute(size, 1));
      var m = new T.Points(g, new T.ShaderMaterial({ uniforms: { pxs: { value: 600 }, op: { value: 1 }, maxPx: { value: 6 } }, vertexShader: PTS_VS, fragmentShader: fs || PTS_FS, transparent: true, depthWrite: false,
        blending: blending || T.AdditiveBlending }));
      m.frustumCulled = false; return m;
    }
    var field = makePoints(9000, (function () {
      var r = U.mulberry(4242);
      return function (i, pos, col, size) {
        var a = r() * Math.PI * 2, rr = 25 + Math.pow(r(), 1.8) * 5500;
        pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = U.gauss(r) * (8 + rr * 0.04); pos[i * 3 + 2] = Math.sin(a) * rr;
        var Tk = 3000 + Math.pow(r(), 2) * 12000, c = U.blackbodyColor(Tk), b = 0.35 + Math.pow(r(), 4) * 1.6;
        col[i * 4] = c[0] * b; col[i * 4 + 1] = c[1] * b; col[i * 4 + 2] = c[2] * b; col[i * 4 + 3] = 0.55;
        size[i] = 0.5 + rr * 0.004 + Math.pow(r(), 3) * 2.0;
      };
    })());
    scene.add(field);

    // ---------- 银河系（拉远时出现）：旋臂粒子 + 尘埃 + 弥散光盘 ----------
    var milky = new T.Group(); milky.position.copy(GAL_C); scene.add(milky);
    var mwStars, mwDust, mwDisc;
    (function buildMilky() {
      var r = U.mulberry(2024), B = 0.2126, A0 = 2600;
      // 太阳 = 银河系局部坐标的 (-GAL_C)。让一条旋臂（猎户支臂）经过这里
      var sunR = Math.hypot(GAL_C.x, GAL_C.z), sunA = Math.atan2(-GAL_C.z, -GAL_C.x);
      var ph0 = sunA - Math.log(sunR / A0) / B + 0.05;
      var phases = [ph0, ph0 + Math.PI / 2, ph0 + Math.PI, ph0 + 1.5 * Math.PI];
      var N = 200000;
      mwStars = makePoints(N, function (i, pos, col, size) {
        var x, y, z, c, b, kind = r();
        if (kind < 0.24) {          // 核球 + 棒
          var bar = r() < 0.55;
          var gx = U.gauss(r) * (bar ? 9200 : 4000), gy = U.gauss(r) * (bar ? 1400 : 2500), gz = U.gauss(r) * (bar ? 2800 : 4000);
          var ang = 0.47 + sunA; x = gx * Math.cos(ang) - gz * Math.sin(ang); z = gx * Math.sin(ang) + gz * Math.cos(ang); y = gy * 0.6;
          c = U.blackbodyColor(3300 + r() * 2200); b = 0.5 + r() * 0.75;
        } else {
          var rr = Math.min(58000, 1800 + -Math.log(1 - r() * 0.996) * 12500), arm = Math.floor(r() * 4), th = Math.log(rr / A0) / B + phases[arm];
          th += 0.12 * Math.sin(rr * 0.00028 + arm * 2.1);                  // 旋臂自然扭曲
          var young = r() < 0.52, spur = r() < 0.24;
          var spread = (young ? 0.14 : 0.55) * (0.6 + 0.5 * r()) + (spur ? 0.45 : 0);
          var a = th + U.gauss(r) * spread + (spur ? 0.28 : 0);
          if (arm % 2 === 1) a += U.gauss(r) * 0.22;                          // 次臂更松散
          x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = U.gauss(r) * (180 + rr * 0.007) * (young ? 0.7 : 1.7);
          var Tk = young ? 8500 + r() * 21000 : 3500 + r() * 3200; c = U.blackbodyColor(Tk); b = young ? 0.5 + Math.pow(r(), 3) * 1.3 : 0.3 + r() * 0.4;
          if (young && r() < 0.065) { c = [1.0, 0.28, 0.42]; b = 1.45; }      // HII 区
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        col[i * 4] = c[0] * b; col[i * 4 + 1] = c[1] * b; col[i * 4 + 2] = c[2] * b; col[i * 4 + 3] = 0.55;
        size[i] = 120 + Math.pow(r(), 3) * 380;
      });
      mwStars.material.uniforms.maxPx.value = 5;
      mwDust = makePoints(30000, function (i, pos, col, size) {
        var rr = 3500 + Math.pow(r(), 0.8) * 44000, arm = Math.floor(r() * 4), th = Math.log(rr / A0) / B + phases[arm] - 0.16 + 0.12 * Math.sin(rr * 0.00028 + arm * 2.1);
        var feather = r() < 0.35;
        var a = th + U.gauss(r) * (feather ? 0.22 : 0.08) + (feather ? 0.18 : 0);
        pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = U.gauss(r) * 90; pos[i * 3 + 2] = Math.sin(a) * rr;
        col[i * 4] = 0.02; col[i * 4 + 1] = 0.014; col[i * 4 + 2] = 0.012; col[i * 4 + 3] = (0.05 + r() * 0.09) * (0.5 + 0.5 * Math.sin(rr * 0.0006 + a * 3)); size[i] = 550 + r() * 1400;
      }, DUST_FS, T.NormalBlending);
      mwDust.material.uniforms.maxPx.value = 24; mwDust.renderOrder = 2;
      mwDisc = new T.Mesh(new T.PlaneGeometry(120000, 120000), new T.ShaderMaterial({ uniforms: { op: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: GDISC_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      mwDisc.rotation.x = -Math.PI / 2; mwDisc.frustumCulled = false;
      milky.add(mwDisc, mwStars, mwDust);
      milky.visible = false;
    })();

    // ---------- 领地平面 ----------
    var terr = new T.Mesh(new T.PlaneGeometry(520, 520, 1, 1), new T.ShaderMaterial({
      uniforms: { sp: { value: [] }, cc: { value: [] }, n: { value: 0 }, ship: { value: new T.Vector2() }, time: UT, op: { value: 1 }, gridOp: { value: 1 }, sig: { value: 10.5 } },
      vertexShader: TERR_VS, fragmentShader: TERR_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    for (var si = 0; si < 40; si++) terr.material.uniforms.sp.value.push(new T.Vector4(0, 0, -1, 0));
    for (var ci = 0; ci < 8; ci++) terr.material.uniforms.cc.value.push(new T.Color());
    terr.rotation.x = -Math.PI / 2; terr.position.y = 0; terr.frustumCulled = false; terr.renderOrder = -5;
    scene.add(terr);
    var stalks = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending }));
    stalks.frustumCulled = false; scene.add(stalks);

    // ================================================================ 构建一局宇宙
    function disposeTree(g) { g.traverse(function (o) { if (o.geometry && o.geometry !== QUAD && o.geometry !== RIBGEO && o.geometry !== SHELLGEO) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); }
    function build(u) {
      scene.remove(root); disposeTree(root); root = new T.Group(); scene.add(root);
      sysO = []; flatO = {}; trailO = []; strikeO = [];
      if (starLabelsEl) starLabelsEl.innerHTML = '';
      var r = U.mulberry(U.hashStr(u.seed + '#gx'));
      // 星云（装饰）：每片 6 层 fbm 公告板
      u.nebulae.forEach(function (n, k) {
        var c0 = U.simToWorld(n.x, n.y, U.gauss(r) * 3), hue = n.hue / 360;
        for (var j = 0; j < 6; j++) {
          var h2 = (hue + (r() - 0.5) * 0.08 + 1) % 1; if (h2 > 0.72 && h2 < 0.92) h2 = 0.62 + (h2 - 0.72) * 0.4; var col = new T.Color().setHSL(h2, 0.42, 0.42);
          var m = new T.Mesh(QUAD, new T.ShaderMaterial({ uniforms: { pxk: PXK, size: { value: n.r * (0.55 + r() * 0.6) }, color: { value: col }, opacity: { value: 0.025 + r() * 0.028 }, time: UT, seed: { value: k * 10 + j * 1.7 } },
            vertexShader: NEB_VS, fragmentShader: NEB_FS(), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
          m.frustumCulled = false; m.position.copy(c0).add(new T.Vector3(U.gauss(r) * n.r * 0.3, U.gauss(r) * n.r * 0.12, U.gauss(r) * n.r * 0.3));
          m.userData.neb = true; root.add(m);
        }
      });
      u.systems.forEach(function (s) {
        var ti = SIM.typeInfo(s.type), kind = KIND[s.type] || 'star', base = U.sysWorld(u, s);
        var o = { s: s, base: base, pos: base.clone(), ti: ti, kind: kind, g: new T.Group(), temp: U.starTemp(s), seed: r() * 10 };
        o.g.position.copy(base); root.add(o.g);
        o.col = kind === 'ns' ? [0.72, 0.8, 1.0] : U.blackbodyColor(o.temp || 5800);
        var rad = ti[3];
        if (kind === 'bh') {
          o.bh = RU.fx.blackhole.create({ rs: 0.9, sky: SKY.equirect, skyIntensity: 0.8, seed: o.seed, tilt: 0.14 + (r() - 0.5) * 0.14, yaw: r() * 6.28 });
          o.g.add(o.bh);
        } else {
          var small = kind === 'wd' || kind === 'ns';
          o.star = bb(starMat(o.col, BRIGHT[s.type] || 1.2, SPIKE[s.type] || 0.25, small ? 0.012 : 0.026, small ? 4 : rad * 4.2, small ? 18 : 24, o.seed), 6);
          o.star.material.uniforms.rot.value = 0.12 + (r() - 0.5) * 0.1;
          o.g.add(o.star);
          if (kind === 'wd') {
            o.pn = bb(new T.ShaderMaterial({ uniforms: { pxk: PXK, worldSize: { value: 3.2 }, minPx: { value: 0 }, squash: { value: 0 }, time: UT, opacity: { value: 0.5 }, seed: { value: o.seed } },
              vertexShader: STAR_VS, fragmentShader: PN_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending }), 5);
            o.g.add(o.pn);
          }
          if (kind === 'ns') {
            o.beams = new T.Group();
            var bm = new T.ShaderMaterial({ uniforms: { opacity: { value: 1 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
            [1, -1].forEach(function (sg) {
              var cone = new T.Mesh(new T.CylinderGeometry(0.6, 0.02, 8, 24, 1, true), bm); cone.geometry.translate(0, 4, 0); cone.rotation.x = sg > 0 ? 0 : Math.PI; o.beams.add(cone);
            });
            o.beamAxis = new T.Group(); o.beamAxis.rotation.z = 0.5 + r() * 0.4; o.beamAxis.add(o.beams); o.g.add(o.beamAxis);
          }
        }
        var el = U.el('div', 'gx-lb', '<b></b><i></i>', starLabelsEl); o.el = el; o.nm = el.firstChild; o.sub = el.lastChild; o.key = '';
        sysO.push(o);
      });
      // 飞船、歌者
      singerIcon.position.copy(U.simToWorld(u.singer.x, u.singer.y, 0));
      st.singerEl = U.el('div', 'gx-lb', '<b style="color:#f0b6ff">歌者</b><i>星图之外 · 只在上帝视角可见</i>', starLabelsEl);
      st.shipEl = U.el('div', 'gx-lb ship', '<b></b><i></i>', starLabelsEl);
      st.built = u;
      refresh();
    }

    // ================================================================ 时间与可见状态
    function nowY() { return st.RP ? st.RP.Y : st.u.time; }
    function viewYear(s) {
      if (st.RP) return st.RP.Y;
      if (st.god) return st.u.time;
      return st.u.time - st.u.D[st.u.ship.at][s.id];
    }
    function firstLog(s, key) { for (var i = 0; i < s.stateLog.length; i++) if (s.stateLog[i][key]) return s.stateLog[i].y; return null; }
    function tripEnd(t) { return t.died && t.from !== t.to ? sysO[t.from].base.clone().lerp(sysO[t.to].base, t.frac || 0) : sysO[t.to].base.clone(); }
    function shipAt(Y) {
      var u = st.u, tr = u.ship.trips, at = tr.length ? tr[0].from : u.ship.at, pos = null;
      for (var i = 0; i < tr.length; i++) {
        var t = tr[i]; if (Y < t.depart) break;
        if (t.from !== t.to && Y < t.arrive) { var f = (Y - t.depart) / Math.max(1e-9, t.arrive - t.depart); return { pos: sysO[t.from].base.clone().lerp(tripEnd(t), f), trip: t, f: f }; }
        at = t.to; pos = t.died ? tripEnd(t) : null;
      }
      return { pos: pos || sysO[at].base.clone(), trip: null, at: at };
    }
    function strikeSrc(stk) {
      var u = st.u;
      if (stk.by === 'singer' || !u.civs[stk.by]) return U.simToWorld(u.singer.x, u.singer.y, 0);
      var fs = stk.fromSys != null ? stk.fromSys : u.civs[stk.by].home; return sysO[fs].base.clone();
    }
    function flatViewYear(f) {
      if (st.RP || st.god) return nowY();
      var s0 = st.u.systems[st.u.ship.at]; return st.u.time - Math.hypot(f.x - s0.x, f.y - s0.y);
    }

    // ================================================================ 刷新（状态变化后）
    function refresh() {
      var u = st.u; if (!u || !sysO.length) return;
      // 曲率航迹（常规推进也画一条暗淡的）
      trailO.forEach(function (m) { root.remove(m); m.material.dispose(); }); trailO = [];
      u.ship.trips.forEach(function (tr) {
        if (tr.from === tr.to) return;
        var m = tr.warp ? ribbon(0, [0.75, 0.85, 1.6], [0.25, 0.4, 1.0]) : ribbon(0, [1.0, 0.7, 0.4], [0.5, 0.3, 0.15]);
        m.userData.trip = tr; m.renderOrder = 3; root.add(m); trailO.push(m);
      });
      // 在途武器（上帝视角 / 回放）
      strikeO.forEach(function (m) { root.remove(m); m.material.dispose(); }); strikeO = [];
      u.strikes.forEach(function (stk) {
        var foil = stk.type === '二向箔', m = ribbon(2, foil ? [0.9, 0.8, 0.5] : [0.55, 0.7, 1.1], foil ? [1.8, 1.6, 1.0] : [1.6, 1.8, 2.4]);
        m.userData.st = stk; m.visible = false; root.add(m); strikeO.push(m);
      });
      // 航线
      updateRoute();
    }
    function updateRoute() {
      var R = st.route;
      if (!R || R.from == null || R.to == null || R.from === R.to || !sysO[R.from] || !sysO[R.to]) { routeRib.visible = false; return; }
      routeRib.visible = true; setRib(routeRib, sysO[R.from].pos, sysO[R.to].pos);
      var warp = SIM.isWarp ? SIM.isWarp(R.mode || 'w0.9999') : /^w/.test(R.mode || 'w');
      routeRib.material.uniforms.color.value.setRGB(warp ? 1.6 : 0.5, warp ? 0.62 : 1.25, warp ? 1.45 : 1.7);
      routeRib.material.uniforms.width.value = 0.35;
    }

    // ================================================================ 每帧：恒星、领地、二维化、航迹
    var _v = new T.Vector3(), _w = new T.Vector3(), _c = new T.Vector3();
    function updateWorld(t, dt) {
      var u = st.u, Y0 = nowY(), terrU = terr.material.uniforms, ns = 0, civIdx = {}, nciv = 0;
      var stalkPos = [], stalkCol = [];
      var flatStars = {};   // flatId → [{o, age}]
      sysO.forEach(function (o) {
        var s = o.s, Y = viewYear(s), sv = SIM.stateAt(s, Y) || {}, stype = sv.type || s.type;
        var flat = sv.flat, sealed = sv.sealed && !flat, dead = sv.dead && !flat;
        o.sv = sv;
        // 跌落：恒星沉向二维平面并被抹开
        var fy = flat ? (s.flatYear != null ? s.flatYear : firstLog(s, 'flat')) : null, fage = flat ? U.clamp((Y - fy) / 2.2, 0, 1) : 0;
        var fl = flat && s.flatBy != null ? u.flats[s.flatBy] : null;
        if (flat && !fl) u.flats.forEach(function (f) { if (Math.hypot(f.x - s.x, f.y - s.y) <= f.rmax + 0.01) fl = fl || f; });
        var planeH = fl && sysO[fl.origin] ? sysO[fl.origin].base.y : o.base.y;
        o.pos.set(o.base.x, o.base.y + (planeH - o.base.y) * U.ease.inOut(fage), o.base.z);
        o.g.position.copy(o.pos);
        if (flat && fl) (flatStars[fl.id] = flatStars[fl.id] || []).push({ o: o, age: Y - fy });
        var vis = !flat || fage < 1;
        if (o.star) {
          var m = o.star.material.uniforms;
          o.star.visible = vis && !sealed;
          m.squash.value = flat ? U.ease.in(fage) * 0.9 : 0;
          if (dead) { m.color.value.setRGB(1.0, 0.22, 0.06); m.inten.value = 0.38; m.spike.value = 0; m.ember.value = 1; m.coreW.value = 0.012; }
          else { m.color.value.fromArray(o.col); m.inten.value = (BRIGHT[stype] || 1.2) * (1 + fage * 0.8); m.spike.value = SPIKE[stype] || 0.25; m.ember.value = 0; m.coreW.value = (o.kind === 'wd' || o.kind === 'ns') ? 0.012 : 0.026; }
          m.fade.value = flat ? 1 - fage : 1;
        }
        if (o.pn) o.pn.visible = vis && !dead && !sealed;
        if (o.beams) { o.beamAxis.visible = vis && !dead && !sealed; o.beams.rotation.y = t * 2.6; }
        if (o.bh) { o.bh.visible = vis && !sealed; o.bh.update(camera, t); o.bh.setSkyIntensity(backdrop.skyMaterial.uniforms.intensity.value); }
        if (sealed) {
          if (!o.dom) { o.dom = RU.fx.blackhole.createDomain({ radius: 3.6, sky: SKY.equirect }); o.g.add(o.dom); }
          var sy = firstLog(s, 'sealed'), grow = st.RP ? U.clamp((Y - sy) / 1.2, 0, 1) : 1;
          o.dom.visible = true; o.dom.setGrow(U.ease.cubicOut(grow)); o.dom.update(camera, t); o.dom.setSkyIntensity(backdrop.skyMaterial.uniforms.intensity.value);
        } else if (o.dom) o.dom.visible = false;
        // 领地势场
        if (sv.owner != null && !flat && !sealed && ns < 40) {
          var cid = sv.owner; if (civIdx[cid] == null && nciv < 8) { civIdx[cid] = nciv; terrU.cc.value[nciv].set(u.civs[cid].color).multiplyScalar(1.15); nciv++; }
          if (civIdx[cid] != null) { var home = u.civs[cid].home === s.id; terrU.sp.value[ns].set(o.pos.x, o.pos.z, civIdx[cid], home ? 1.25 : 0.9); ns++; }
        }
        // 立杆
        if (!flat) {
          var cl = sv.owner != null && !sealed ? new T.Color(u.civs[sv.owner].color) : new T.Color(0.35, 0.45, 0.7);
          var k = sv.owner != null ? 0.55 : 0.28;
          stalkPos.push(o.pos.x, o.pos.y, o.pos.z, o.pos.x, 0, o.pos.z);
          stalkCol.push(cl.r * k, cl.g * k, cl.b * k, cl.r * k * 0.15, cl.g * k * 0.15, cl.b * k * 0.15);
        }
      });
      terrU.n.value = ns;
      var sh = shipAt(st.RP ? st.RP.Y : u.time + 1e-6); st.shipNow = sh;
      terrU.ship.value.set(sh.pos.x, sh.pos.z);
      stalks.geometry.setAttribute('position', new T.Float32BufferAttribute(stalkPos, 3));
      stalks.geometry.setAttribute('color', new T.Float32BufferAttribute(stalkCol, 3));

      // 二维化区域
      var fronts = [];
      u.flats.forEach(function (f) {
        var o = flatO[f.id];
        if (!o) {
          var size = f.rmax * 1.35 + 6;
          var mat = new T.ShaderMaterial({ uniforms: { map: { value: paintTex() }, R: { value: 0 }, rmax: { value: f.rmax }, size: { value: size }, time: UT, growing: { value: 0 }, seed: { value: f.id * 1.7 }, op: { value: 1 },
            nfs: { value: 0 }, fs: { value: [] }, fc: { value: [] } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
            fragmentShader: FLAT_FS(), transparent: true, depthWrite: false, side: T.DoubleSide });
          for (var q = 0; q < 10; q++) { mat.uniforms.fs.value.push(new T.Vector4()); mat.uniforms.fc.value.push(new T.Color()); }
          var disc = new T.Mesh(new T.PlaneGeometry(size * 2, size * 2), mat); disc.rotation.x = -Math.PI / 2; disc.renderOrder = -2; disc.frustumCulled = false;
          var h = sysO[f.origin] ? sysO[f.origin].base.y : 0; disc.position.copy(U.simToWorld(f.x, f.y, h));
          var fallG = new T.BufferGeometry(), NP = 1400, sa = new Float32Array(NP * 4), rr = U.mulberry(f.id * 31 + 7);
          for (var i = 0; i < NP; i++) { sa[i * 4] = rr(); sa[i * 4 + 1] = rr(); sa[i * 4 + 2] = (rr() - 0.5) * 2; sa[i * 4 + 3] = rr(); }
          fallG.setAttribute('position', new T.BufferAttribute(new Float32Array(NP * 3), 3)); fallG.setAttribute('seedA', new T.BufferAttribute(sa, 4));
          var fall = new T.Points(fallG, new T.ShaderMaterial({ uniforms: { R: { value: 0 }, time: UT, h0: { value: 6 }, pxk: PXK, op: { value: 0 } }, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
          fall.frustumCulled = false; fall.position.copy(disc.position);
          root.add(disc, fall);
          o = flatO[f.id] = { f: f, disc: disc, fall: fall, el: U.el('div', 'gx-lb', '<b style="color:#ffd27a"></b><i></i>', starLabelsEl) };
        }
        var Y = flatViewYear(f), R = SIM.flatR(f, Y), vis = Y >= f.y0;
        o.disc.visible = o.fall.visible = vis; o.vis = vis;
        if (!vis) return;
        var growing = R < f.rmax - 1e-6, U2 = o.disc.material.uniforms;
        U2.R.value = Math.max(R, 0.05); U2.growing.value = growing ? 1 : 0;
        o.fall.material.uniforms.R.value = R; o.fall.material.uniforms.op.value = growing ? 1 : 0;
        var list = flatStars[f.id] || [], nf = 0;
        list.forEach(function (it) {
          if (nf >= 10) return; var oo = it.o;
          U2.fs.value[nf].set(oo.base.x - o.disc.position.x, -(oo.base.z - o.disc.position.z), 2.2 + oo.ti[3] * 1.5, U.clamp((it.age - 0.6) / 2.5, 0, 1));
          var cc = oo.kind === 'bh' ? [0.5, 0.35, 0.9] : oo.col; U2.fc.value[nf].setRGB(cc[0], cc[1], cc[2]); nf++;
        });
        U2.nfs.value = nf;
        o.R = R; o.growing = growing;
        if (growing && fronts.length < 4) fronts.push({ c: o.disc.position, R: Math.max(R, 0.3), s: st.RP ? 1.0 : 0.6 });
        var txt = '二维化区域 · 半径 ' + R.toFixed(1) + ' 光年', sub = growing ? '以光速扩张中' : '一幅永远摊开的画';
        if (o.txt !== txt + sub) { o.txt = txt + sub; o.el.firstChild.textContent = txt; o.el.lastChild.textContent = sub; }
      });
      updateFronts(fronts);

      // 曲率航迹：长久存在、缓慢淡去（半衰期约几十年，和模拟里的航迹暴露衰减对应）
      var Yn = st.RP ? st.RP.Y : u.time;
      trailO.forEach(function (m) {
        var tr = m.userData.trip;
        if (Yn < tr.depart) { m.visible = false; return; }
        var a = sysO[tr.from].base, b = tripEnd(tr), going = Yn < tr.arrive, fEnd = going ? (Yn - tr.depart) / Math.max(1e-9, tr.arrive - tr.depart) : 1;
        var age = going ? 0 : Yn - tr.arrive, inten = going ? 1 : Math.exp(-age / 75);
        if (!tr.warp) inten *= 0.35;
        m.visible = inten > 0.015; if (!m.visible) return;
        setRib(m, a, b, 0, Math.max(0.001, fEnd));
        var Um = m.material.uniforms; Um.inten.value = inten * (tr.warp ? 1.0 : 0.6); Um.width.value = (tr.warp ? 0.7 : 0.25) + Math.min(age, 300) * 0.02; Um.head.value = going && tr.warp ? 1 : 0;
        Um.minPx.value = 2.5;
      });
      // 飞船
      var shipVis = !u.ship.dead || !!st.RP;
      shipIcon.visible = shipVis && labelsOn > 0.05; shipIcon.position.copy(sh.pos);
      shipIcon.material.uniforms.opacity.value = labelsOn;
      // 歌者与在途武器
      var showW = st.god || !!st.RP;
      singerIcon.visible = showW && labelsOn > 0.05; singerIcon.material.uniforms.opacity.value = labelsOn;
      strikeO.forEach(function (m) {
        var stk = m.userData.st;
        if (!showW || Y0 < stk.launch || Y0 >= stk.arrive) { m.visible = false; return; }
        var src = strikeSrc(stk), dst = sysO[stk.target].base, f2 = (Y0 - stk.launch) / Math.max(1e-6, stk.arrive - stk.launch);
        m.visible = true; setRib(m, src, dst, 0, f2); m.material.uniforms.width.value = 0.12; m.material.uniforms.head.value = 1; m.material.uniforms.inten.value = 0.8;
      });
    }

    var _p1 = new T.Vector3(), _p2 = new T.Vector3(), _p3 = new T.Vector3();
    function updateFronts(fronts) {
      var asp = camera.aspect, k = 0, Uf = frontPass.uniforms;
      fronts.forEach(function (F) {
        if (k >= 4) return;
        _p1.copy(F.c).project(camera); if (_p1.z > 1 || _p1.z < -1) return;
        _p2.set(F.c.x + F.R, F.c.y, F.c.z).project(camera); _p3.set(F.c.x, F.c.y, F.c.z + F.R).project(camera);
        var cx = (_p1.x * 0.5 + 0.5) * asp, cy = _p1.y * 0.5 + 0.5;
        Uf.fc.value[k].set(cx, cy);
        Uf.fa.value[k].set((_p2.x * 0.5 + 0.5) * asp - cx, _p2.y * 0.5 + 0.5 - cy);
        Uf.fb.value[k].set((_p3.x * 0.5 + 0.5) * asp - cx, _p3.y * 0.5 + 0.5 - cy);
        Uf.fs.value[k] = F.s * labelsOn; k++;
      });
      Uf.n.value = k; Uf.aspect.value = asp; frontPass.enabled = k > 0;
    }

    // ================================================================ 标签（不重叠、按距离淡出）
    var _pp = new T.Vector3(), labelsOn = 1;
    function proj(p, out) { _pp.copy(p).project(camera); out.x = (_pp.x * 0.5 + 0.5) * E.size.w; out.y = (-_pp.y * 0.5 + 0.5) * E.size.h; out.ok = _pp.z < 1 && Math.abs(_pp.x) < 1.15 && Math.abs(_pp.y) < 1.15; return out; }
    function placeLabels() {
      var u = st.u, items = [], W = E.size.w, H = E.size.h, camD = camera.position.distanceTo(controls.target);
      sysO.forEach(function (o) {
        var s = o.s, sv = o.sv || {}, p = proj(o.pos, {});
        o.sx = p.x; o.sy = p.y; o.vis = p.ok;
        var flat = sv.flat, sealed = sv.sealed && !flat, dead = sv.dead && !flat;
        var name = s.name, sub = '', cls = 'gx-lb', pri = 1;
        if (flat) { sub = '已是二维的画'; pri = 0.5; cls += ' dim'; }
        else if (sealed) sub = '黑域 · 「' + sv.name + '」';
        else if (dead) { sub = '死寂 · 恒星已熄灭'; cls += ' dim'; }
        else if (sv.owner != null) { sub = sv.name + ' · ' + sv.era; pri = u.civs[sv.owner].home === s.id ? 3 : 2; if (pri === 3) cls += ' big'; }
        else if (s.type === '黑洞' || s.type === '中子星' || s.type === '白矮星') sub = s.type;
        else if (s.habitable) sub = '宜居';
        if (s.id === 0) pri = Math.max(pri, 2.5);
        if (s.id === st.sel) { pri = 10; cls += ' sel'; if (!st.god && !st.RP && st.u.ship.at !== s.id) { var dly = u.D[u.ship.at][s.id]; sub = (sub ? sub + ' · ' : '') + '你看到的是 ' + Math.round(dly) + ' 年前的光'; } }
        if (s.id === st.hover) pri = Math.max(pri, 8);
        var key = name + '|' + sub + '|' + cls;
        if (key !== o.key) { o.key = key; o.nm.textContent = name; o.sub.textContent = sub; o.el.className = cls; if (sv.owner != null && !flat && !sealed) o.sub.style.color = u.civs[sv.owner].color; else o.sub.style.color = ''; }
        var dist = camera.position.distanceTo(o.pos);
        var op = pri >= 2 ? U.clamp(1.75 - dist / 540, 0.0, 1) : U.clamp(1.3 - dist / 330, 0.0, 0.85);
        if (pri >= 8) op = 1;
        items.push({ el: o.el, x: p.x, y: p.y, ok: p.ok, pri: pri + (1 - dist / 2000) * 0.1, op: op, w: Math.max(name.length * 13, sub.length * 10.5) + 4, h: sub ? 30 : 16 });
      });
      Object.keys(flatO).forEach(function (k) {
        var o = flatO[k]; if (!o.vis) { o.el.style.opacity = 0; return; }
        _w.copy(o.disc.position); _w.z += o.R + 1; var p = proj(_w, {});
        items.push({ el: o.el, x: p.x - 40, y: p.y + 4, ok: p.ok, pri: 4, op: 0.95, w: 190, h: 30, noOff: true });
      });
      var u0 = st.u, sh = st.shipNow;
      if (sh) {
        var p2 = proj(sh.pos, {}); var nm = (u0.ship.name || '飞船'), sub2 = sh.trip ? (sh.trip.warp ? '曲率航行中 · 接近光速' : '常规推进 · 冬眠中') : '你在这里';
        if (st.shipKey !== nm + sub2) { st.shipKey = nm + sub2; st.shipEl.firstChild.textContent = '◆ ' + nm; st.shipEl.lastChild.textContent = sub2; }
        items.push({ el: st.shipEl, x: p2.x, y: p2.y, ok: p2.ok && shipIcon.visible, pri: 9, op: 1, w: 120, h: 30, ship: true });
      }
      var sp = proj(singerIcon.position, {});
      items.push({ el: st.singerEl, x: sp.x, y: sp.y, ok: sp.ok && singerIcon.visible, pri: 5, op: 0.9, w: 150, h: 30 });
      items.sort(function (a, b) { return b.pri - a.pri; });
      var placed = [], OFF = [[12, -10], [-12, -10], [12, 10], [-12, 10], [-50, -34], [-50, 16], [22, -24], [-22, -24]];
      items.forEach(function (it) {
        var show = it.ok && it.op * labelsOn > 0.04, X = 0, Yy = 0;
        if (show) {
          var found = false;
          for (var k = 0; k < (it.noOff ? 1 : OFF.length); k++) {
            var ox = OFF[k][0], oy = OFF[k][1]; X = it.x + (ox < 0 ? ox - it.w : ox); Yy = it.y + (oy < 0 && k < 2 ? oy : oy);
            if (ox === -50) X = it.x - it.w / 2;
            if (it.noOff) { X = it.x; Yy = it.y; }
            if (st.RP && !it.ship && (Yy < 118 || Yy + it.h > H - 175)) { show = false; break; }
            var box = [X - 6, Yy - 4, X + it.w + 8, Yy + it.h + 5], hit = false;
            for (var j = 0; j < placed.length; j++) { var q = placed[j]; if (box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]) { hit = true; break; } }
            if (!hit) { placed.push(box); found = true; break; }
          }
          if (!found && it.pri < 8) show = false;
        }
        it.el.style.opacity = show ? (it.op * labelsOn).toFixed(3) : 0;
        if (show) it.el.style.transform = 'translate(' + X.toFixed(1) + 'px,' + Yy.toFixed(1) + 'px)';
      });
      // 光行距离环的刻度
      var ringsOn = st.RP ? 0 : labelsOn * U.clamp(1.4 - camD / 500, 0, 1) * 0.9;
      [25, 50, 100, 150].forEach(function (R, i) {
        var el = ringEls[i]; if (!el) return;
        if (!sh || ringsOn < 0.03) { el.style.opacity = 0; return; }
        // 刻度放在离相机最近的一侧
        _w.copy(camera.position).sub(sh.pos); _w.y = 0; if (_w.lengthSq() < 1e-6) _w.set(0, 0, 1); _w.normalize();
        _c.set(sh.pos.x + _w.x * R, 0, sh.pos.z + _w.z * R); var p3 = proj(_c, {});
        el.style.opacity = p3.ok ? ringsOn : 0; el.style.transform = 'translate(' + (p3.x + 4).toFixed(1) + 'px,' + (p3.y + 2).toFixed(1) + 'px)';
      });
      // 「你在这里」（银河尺度）
      if (hereEl) {
        var gz = U.clamp((camD - 2500) / 6000, 0, 1);
        var ph = proj(st.shipNow ? st.shipNow.pos : new T.Vector3(), {});
        hereEl.style.opacity = ph.ok && !st.RP ? gz : 0; hereEl.style.transform = 'translate(' + ph.x.toFixed(1) + 'px,' + (ph.y - 22).toFixed(1) + 'px) translate(-50%,-100%)';
      }
      if (scaleEl) {
        var txt = camD < 1500 ? '' : camD < 20000 ? '太阳附近 · 银河系猎户臂' : '银河系 · 直径约 10 万光年 · 约 2000 亿颗恒星';
        if (scaleEl.textContent !== txt) scaleEl.textContent = txt;
        scaleEl.style.opacity = txt ? 1 : 0;
      }
    }

    // ================================================================ 交互
    function pick(e) {
      var r = dom.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 26;
      if (labelsOn < 0.3) return null;
      sysO.forEach(function (o) { if (!o.vis) return; var d = Math.hypot(o.sx - mx, o.sy - my); if (d < bd) { bd = d; best = o.s.id; } });
      return best;
    }
    var downAt = null;
    function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt); listeners.push([el, ev, fn, opt]); }
    function bindInput() {
      on(dom, 'pointerdown', function (e) { downAt = [e.clientX, e.clientY]; st.lastInteract = performance.now(); st.fly = null; st.intro = null; controls.autoRotate = false; });
      on(dom, 'pointerup', function (e) {
        if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || st.RP || st.mode !== 'map') return;
        var b = pick(e); if (b != null) { st.sel = b; cue('select'); RU.emit('select', b); }
      });
      on(dom, 'pointermove', function (e) { if (st.RP) return; var b = pick(e); if (b !== st.hover) { st.hover = b; dom.style.cursor = b != null ? 'pointer' : ''; if (b != null) cue('ui-hover'); } });
      on(dom, 'dblclick', function (e) { var b = pick(e); if (b != null && !st.RP) api.focus(b); });
      on(dom, 'wheel', function () { st.lastInteract = performance.now(); st.fly = null; st.intro = null; controls.autoRotate = false; }, { passive: true });
      on(window, 'keydown', function (e) { if (st.RP && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); endReplay(true); } });
    }
    function flyTo(p, dist, elev) { st.intro = null; st.fly = { target: p.clone(), dist: dist, elev: elev }; controls.autoRotate = false; st.lastInteract = performance.now(); }

    // ================================================================ 回放：「你离开的这些年里发生了什么」
    function collectEvents(t0, t1) {
      var u = st.u, ev = [];
      u.strikes.forEach(function (stk) {
        if (!stk.done || stk.arrive <= t0 || stk.arrive > t1) return;
        var s = u.systems[stk.target], by = stk.by === 'singer' ? '歌者' : (u.civs[stk.by] ? '「' + u.civs[stk.by].name + '」' : '深空');
        var foil = stk.type === '二向箔';
        if (stk.wasted) { ev.push({ kind: 'note', y: stk.arrive, sys: stk.target, cap: '一次打击撞上了 ' + s.name + ' 的黑域，没有造成任何伤害' }); return; }
        ev.push({ kind: foil ? 'foil' : 'particle', y: stk.arrive, sys: stk.target, st: stk, src: strikeSrc(stk),
          f: foil ? u.flats.filter(function (f) { return f.origin === stk.target && Math.abs(f.y0 - stk.arrive) < 1.01; })[0] : null,
          cap: foil ? by + '的二向箔落进 ' + s.name + '：三维空间开始以光速跌落成二维' : '一枚来自' + by + '的光粒击中 ' + s.name + '，恒星熄灭' });
      });
      var sealedCiv = {};
      u.systems.forEach(function (s) {
        var sy = firstLog(s, 'sealed');
        if (sy != null && sy > t0 && sy <= t1) {
          var e2 = s.stateLog.filter(function (x) { return x.sealed; })[0];
          if (!sealedCiv[e2.name]) { sealedCiv[e2.name] = 1; ev.push({ kind: 'seal', y: sy, sys: s.id, cap: '「' + e2.name + '」把自己封进了黑域（' + s.name + '）：光速降到 16.7 公里每秒' }); }
        }
        var fy = s.flat ? (s.flatYear != null ? s.flatYear : firstLog(s, 'flat')) : null;
        if (fy != null && fy > t0 && fy <= t1 && !u.flats.some(function (f) { return f.origin === s.id && Math.abs(f.y0 - fy) < 1.01; }))
          ev.push({ kind: 'flatten', y: fy, sys: s.id, cap: '二维化的前沿吞没了 ' + s.name });
      });
      (u.cosmicEvents || []).forEach(function (c) {
        if (c.y <= t0 || c.y > t1) return;
        var zero = /归零者/.test(c.t);
        ev.push({ kind: 'cosmic', y: c.y, sys: u.ship.at, zero: zero, cap: zero ? '宇宙边缘传来一段广播——「归零者」发起「回归运动」' : c.t.replace(/。.*$/, '') });
      });
      u.civs.forEach(function (d) {
        if (d.diaspora && d.born > t0 && d.born <= t1 && d.parent != null && u.civs[d.parent]) ev.push({ kind: 'fleet', y: d.born, sys: d.home, cap: '「' + u.civs[d.parent].name + '」的流亡舰队逃离二向箔，飞向 ' + u.systems[d.home].name });
        if (d.endYear != null && d.endYear > t0 && d.endYear <= t1) ev.push({ kind: 'note', y: d.endYear, sys: d.home, cap: '「' + d.name + '」灭绝了' + (d.endCause ? '（' + d.endCause + '）' : '') });
      });
      ev.sort(function (a, b) { return a.y - b.y; });
      return ev;
    }
    // 事件的光以光速扩张，何时扫到飞船？（飞船可能在航行中）
    function lightArrival(P, y0, t1) {
      var Y = y0, step = 0.5, prev = null;
      for (var i = 0; i < 4000 && Y <= t1 + 400; i++) {
        var sp = shipAt(Math.min(Y, t1)).pos, g = (Y - y0) - P.distanceTo(sp);
        if (g >= 0) { if (prev == null) return Y; var lo = Y - step, hi = Y; for (var k = 0; k < 30; k++) { var mid = (lo + hi) / 2, g2 = (mid - y0) - P.distanceTo(shipAt(Math.min(mid, t1)).pos); if (g2 >= 0) hi = mid; else lo = mid; } return hi; }
        prev = g; Y += step;
      }
      return null;
    }
    var FOCUS = { cosmic: { pre: 0.3, post: 4, dur: 4.8, dist: 300 }, particle: { pre: 0.5, post: 2.2, dur: 5.2, dist: 70 }, foil: { pre: 0.8, post: 0, dur: 0, dist: 60 }, seal: { pre: 0.3, post: 1.6, dur: 3.6, dist: 34 }, light: { pre: 0.6, post: 0.6, dur: 3.0, dist: 0 } };
    function buildReplay(t0, t1, res) {
      var u = st.u, ev = collectEvents(t0, t1), focus = [];
      var dest = res && res.trip ? res.trip.to : u.ship.at;
      var score = function (e) { return (e.kind === 'cosmic' ? (e.zero ? 40 : 12) : e.kind === 'foil' ? 30 : e.kind === 'particle' ? 20 : e.kind === 'seal' ? 14 : 0) + ((e.sys === dest || u.memory[e.sys]) && e.kind !== 'cosmic' ? 5 : 0) - e.y * 1e-6; };
      var heroes = ev.filter(function (e) { return score(e) > 0; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 3);
      heroes.forEach(function (e) { e.hero = true; });
      // 光延迟：英雄事件发出的光球什么时候扫到飞船
      heroes.forEach(function (e) {
        if (e.kind === 'cosmic') return;
        e.P = sysO[e.sys].base.clone(); e.seeY = lightArrival(e.P, e.y, t1);
      });
      var lightEv = heroes.filter(function (e) { return e.seeY != null && e.seeY <= t1 && e.seeY - e.y > 0.5; }).slice(0, 2).map(function (e) { return { kind: 'light', y: e.seeY, src: e, sys: e.sys }; });
      var all = heroes.concat(lightEv).sort(function (a, b) { return a.y - b.y; });
      all.forEach(function (e) {
        var F = FOCUS[e.kind], post = F.post, dur = F.dur, pre = F.pre;
        if (e.kind === 'foil') { post = (e.f ? e.f.rmax : 15) + 1.5; dur = 3.0 + 6.0; }
        if (e.kind === 'cosmic') post = Math.min(F.post, Math.max(0.5, (t1 - t0) * 0.004));
        focus.push({ ya: Math.max(t0, e.y - pre), yb: Math.min(t1, e.y + post), dur: dur, e: e, preDur: e.kind === 'foil' ? 3.0 : e.kind === 'particle' ? 2.6 : e.kind === 'cosmic' ? 0.6 : e.kind === 'light' ? 1.2 : 0.6 });
      });
      // 分段线性「墙钟秒 → 宇宙年」：空白年代一眼扫过，事件前后放慢
      var cur = t0, rr = 1.6, pts = [{ r: 0, y: t0 }, { r: rr, y: t0 }], focSpan = 0;
      focus.forEach(function (k) { if (k.ya < cur) k.ya = cur; if (k.yb > k.ya) { focSpan += k.yb - k.ya; cur = k.yb; } });
      var baseSpan = Math.max(1e-6, (t1 - t0) - focSpan), baseDur = U.clamp(1.5 + baseSpan * 0.004, 2.0, 4.5);
      cur = t0;
      focus.forEach(function (k) {
        if (k.yb <= k.ya) return;
        if (k.ya > cur) { rr += baseDur * (k.ya - cur) / baseSpan; pts.push({ r: rr, y: k.ya }); }
        var y = k.e.y;
        if (y > k.ya && y < k.yb) { rr += k.preDur; pts.push({ r: rr, y: y }); rr += k.dur - k.preDur; pts.push({ r: rr, y: k.yb }); }
        else if (y >= k.yb) { rr += k.preDur; pts.push({ r: rr, y: k.yb }); }
        else { rr += k.dur - k.preDur; pts.push({ r: rr, y: k.yb }); }
        k.ra = timeAtPts(pts, k.ya); cur = k.yb;
      });
      if (t1 > cur) { rr += baseDur * (t1 - cur) / baseSpan; pts.push({ r: rr, y: t1 }); }
      var R = { t0: t0, t1: t1, ev: ev, heroes: heroes, lights: lightEv, pts: pts, dur: rr + 2.2, t: 0, Y: t0, res: res, focus: focus,
        ship0: res && res.trip ? (res.trip.shipAfter || u.ship.shipYears) - (res.trip.ship || 0) : u.ship.shipYears, ship1: u.ship.shipYears, cued: {} };
      ev.forEach(function (e) { e.rt = timeAt(R, e.y); });
      lightEv.forEach(function (e) { e.rt = timeAt(R, e.y); });
      if (E.params.get('dbg')) console.log('GXRP ' + JSON.stringify({ dur: R.dur, heroes: heroes.map(function (e) { return [e.kind, e.sys, e.y, +e.rt.toFixed(2), e.seeY && +e.seeY.toFixed(1)]; }), lights: lightEv.map(function (e) { return [e.y, +e.rt.toFixed(2)]; }), ev: ev.map(function (e) { return [e.kind, e.y, +e.rt.toFixed(2)]; }) }));
      return R;
    }
    function timeAtPts(p, y) { for (var i = 1; i < p.length; i++) if (y <= p[i].y && p[i].y > p[i - 1].y) return p[i - 1].r + (p[i].r - p[i - 1].r) * (y - p[i - 1].y) / (p[i].y - p[i - 1].y); return p[p.length - 1].r; }
    function yearAt(R, t) { var p = R.pts; if (t <= p[0].r) return p[0].y; for (var i = 1; i < p.length; i++) if (t <= p[i].r) { var a = p[i - 1], b = p[i]; return b.r === a.r ? b.y : a.y + (b.y - a.y) * (t - a.r) / (b.r - a.r); } return p[p.length - 1].y; }
    function timeAt(R, y) { return timeAtPts(R.pts, y); }

    function buildHud() {
      hudEl = U.el('div', 'passthrough', '', document.getElementById('ui')); hudEl.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      hudEl.innerHTML = '<div class="gx-hud"><div class="gx-badge">上帝视角回放</div><div class="gx-year"><span class="y">0</span><small>纪元·年</small></div><div class="gx-rate"></div></div>' +
        '<div class="gx-cap"><div class="see"></div><div class="c cine-line"></div><div class="sub"></div></div><div class="gx-bar"><i></i></div>';
      var skip = U.el('button', 'gx-skip', '跳过回放 ⏭ <span style="opacity:.5">Esc</span>', document.getElementById('ui'));
      skip.onclick = function () { endReplay(true); }; st.skipEl = skip;
      hudEl.q = function (s) { return hudEl.querySelector(s); };
      // 时间轴上的事件刻度
      var bar = hudEl.q('.gx-bar'), R = st.RP;
      R.heroes.forEach(function (e) { var m = document.createElement('u'); m.style.left = (100 * (e.rt / R.dur)).toFixed(1) + '%'; bar.appendChild(m); });
    }
    function updateHud(rate) {
      var R = st.RP; if (!hudEl) return;
      hudEl.q('.y').textContent = Math.floor(R.Y);
      var shipY = 0; st.u.ship.trips.forEach(function (tr) { if (R.Y >= tr.arrive) shipY += tr.ship || 0; else if (R.Y > tr.depart) shipY += (tr.ship || 0) * (R.Y - tr.depart) / Math.max(1e-9, tr.arrive - tr.depart); });
      hudEl.q('.gx-rate').textContent = (rate > 0.05 ? '时间流速 ×' + (rate >= 10 ? Math.round(rate) : rate.toFixed(1)) + ' 年/秒 · ' : '') + '飞船上过了 ' + U.fmtYears(Math.max(0, shipY));
      hudEl.q('.gx-bar i').style.width = (100 * U.clamp(R.t / R.dur, 0, 1)).toFixed(1) + '%';
      // 字幕：最近的英雄事件；光到达时提示「这一刻你才看到」
      var cap = '', sub = '', see = '';
      var past = R.ev.filter(function (e) { return e.y <= R.Y + 1e-3; });
      var h = past.filter(function (e) { return e.hero; }).slice(-1)[0];
      if (h && R.t - h.rt < 6.5) { cap = '纪元 ' + Math.floor(h.y) + ' 年 · ' + h.cap; if (h.seeY != null) sub = h.seeY <= R.t1 ? '它的光要走 ' + Math.round(h.seeY - h.y) + ' 年才能抵达你的飞船' : '它的光要到纪元 ' + Math.floor(h.seeY) + ' 年才会抵达你——那时你才会知道'; }
      else { var others = past.filter(function (e) { return !e.hero; }).slice(-1)[0]; if (others && R.t - others.rt < 3) cap = '纪元 ' + Math.floor(others.y) + ' 年 · ' + others.cap; }
      R.heroes.forEach(function (e) {
        var a = R.t - e.rt; if (a >= -3.0 && a < 0 && (e.kind === 'particle' || e.kind === 'foil')) {
          var nm = st.u.systems[e.sys].name;
          cap = e.kind === 'foil' ? '一片小小的、薄薄的纸条，正飘向 ' + nm : '一枚光粒正以 0.99 倍光速扑向 ' + nm;
          sub = e.kind === 'foil' ? '二向箔' : '它的光几乎和它一起到——在目标看来，它先是远处一个几乎不动的亮点';
        } });
      R.lights.forEach(function (L) { var a = R.t - L.rt; if (a >= 0 && a < 4.0) { see = '这一刻，你才看到'; cap = L.src.cap; sub = '纪元 ' + Math.floor(L.src.y) + ' 年发生的事，光走了 ' + Math.round(L.y - L.src.y) + ' 年'; } });
      var zc = R.heroes.filter(function (e) { return e.kind === 'cosmic' && e.zero && R.t - e.rt >= 0 && R.t - e.rt < 4.8; })[0];
      if (zc) { cap = '所有文明同时收到了一段来自宇宙边缘的广播'; sub = '「归零者」发起「回归运动」：停止降维，停止降低光速，让宇宙回到十维的田园时代'; }
      if (!cap && R.t < 2.0) { cap = '你离开的这 ' + Math.round(R.t1 - R.t0) + ' 年里，宇宙在你看不到的地方继续走'; sub = '下面是不受光速限制的真实历史'; }
      if (hudEl._cap !== cap + sub + see) { hudEl._cap = cap + sub + see; hudEl.q('.c').textContent = cap; hudEl.q('.sub').textContent = sub; hudEl.q('.see').textContent = see; }
    }
    var replayResolve = null;
    function startReplay(t0, t1, res) {
      st.RP = buildReplay(t0, t1, res); st.mode = 'replay';
      buildHud(); mood('replay');
      E.letterbox(true);
      controls.autoRotate = false;
      return new Promise(function (resolve) { replayResolve = resolve; });
    }
    function endReplay(skipped) {
      var R = st.RP; if (!R) return;
      st.RP = null; st.mode = 'map';
      if (hudEl) { hudEl.remove(); hudEl = null; } if (st.skipEl) { st.skipEl.remove(); st.skipEl = null; }
      E.letterbox(false); mood('map'); apar('tension', 0);
      var sh = shipAt(st.u.time + 1e-6); flyTo(sh.pos, 140, 0.6);
      fx.forEach(hideFx); lightO.forEach(function (L) { L.sphere.visible = L.ring.visible = false; });
      var r = replayResolve; replayResolve = null; if (r) r({ skipped: !!skipped });
    }
    function hideFx(o) { o.flash.visible = o.shock.visible = o.wave.visible = o.bolt.visible = o.streak.visible = o.foil.visible = false; }

    // 回放里的打击特效：光粒「远方几乎不动的亮点 → 极短时间压过来 → 命中」
    function updateReplayFx(t) {
      var R = st.RP; fx.forEach(hideFx);
      var bloomK = 1;
      R.heroes.concat(R.ev.filter(function (e) { return !e.hero && (e.kind === 'particle' || e.kind === 'foil'); })).slice(0, fx.length).forEach(function (e, idx) {
        if (e.rt == null) return;
        var o = fx[idx], age = R.t - e.rt, P = sysO[e.sys].pos, camD = camera.position.distanceTo(P);
        if (e.kind === 'particle') {
          var dir = _w.copy(e.src).sub(P).normalize();
          if (age >= -2.6 && age < 0) {
            // 0.99c 的武器：它的光几乎和它一起到，所以看起来先是远处一个几乎不动的亮点，最后一瞬才扑过来
            var k = -age / 2.6, d0 = 55 * Math.pow(k, 0.08) * (k > 0.12 ? 1 : Math.pow(k / 0.12, 1.6));
            o.bolt.visible = true; o.bolt.position.copy(P).addScaledVector(dir, d0);
            o.bolt.material.uniforms.inten.value = 1.2 + 4 * (1 - k); o.bolt.material.uniforms.spike.value = 0.4 + 0.5 * (1 - k);
            if (k < 0.12) { o.streak.visible = true; _c.copy(P).addScaledVector(dir, d0 + 22); setRib(o.streak, _c, o.bolt.position, 0, 1); o.streak.material.uniforms.width.value = 0.15; o.streak.material.uniforms.head.value = 1; o.streak.material.uniforms.inten.value = 1.5; }
            if (!R.cued['in' + idx] && age > -2.6) { R.cued['in' + idx] = 1; cue('photoid-incoming', { dur: 2.6 }); apar('tension', 0.8); }
          }
          if (age >= 0 && age < 4.5) {
            if (!R.cued['hit' + idx]) { R.cued['hit' + idx] = 1; cue('photoid-impact'); apar('tension', 0.3); if (!E.still) E.flash(0.18, 0xfff2e0); }
            var rise = U.clamp(age / 0.08, 0, 1), I = age < 0.08 ? rise : Math.exp(-(age - 0.08) * 1.6);
            o.flash.visible = true; o.flash.position.copy(P);
            var fu = o.flash.material.uniforms; fu.inten.value = 5.5 * I; fu.spike.value = 1.2; fu.worldSize.value = Math.min(camD * 0.35, 8 + 30 * rise); fu.color.value.setRGB(1.0, 0.92 - 0.3 * (1 - I), 0.85 - 0.6 * (1 - I));
            o.shock.visible = true; o.shock.position.copy(P); o.shock.scale.setScalar(0.5 + 14 * (1 - Math.exp(-age * 0.7))); o.shock.material.uniforms.opacity.value = 0.7 * Math.pow(1 - age / 4.5, 2.0);
            o.wave.visible = true; o.wave.position.copy(P); o.wave.scale.setScalar(0.5 + 26 * (1 - Math.exp(-age * 0.6))); o.wave.material.opacity = 0.35 * Math.pow(1 - age / 4.5, 2.0);
            bloomK = Math.min(bloomK, 1 - 0.5 * I * U.clamp(1 - camD / 150, 0, 1));
          }
        } else if (e.kind === 'foil') {
          var dir3 = _w.copy(e.src).sub(P).normalize();
          if (age >= -3.0 && age < 0.05) {
            var d1 = 40 * Math.pow(Math.max(0, -age) / 3.0, 1.3);
            o.foil.visible = true; o.foil.position.copy(P).addScaledVector(dir3, d1);
            var gl = Math.pow(Math.max(0, Math.sin(t * 4.2)), 12);
            o.foil.material.uniforms.inten.value = 1.2 + 3 * gl; o.foil.material.uniforms.spike.value = 0.3 + gl;
            o.foil.material.uniforms.color.value.setHSL((t * 0.3) % 1, 0.5, 0.75);
            if (!R.cued['ft' + idx] && age > -0.4) { R.cued['ft' + idx] = 1; cue('foil-touch'); }
          }
          if (age >= 0 && age < 2.5) {
            var I2 = Math.exp(-age * 1.8);
            o.flash.visible = true; o.flash.position.copy(P); var fu2 = o.flash.material.uniforms; fu2.inten.value = 3.5 * I2; fu2.spike.value = 0.8; fu2.worldSize.value = 12; fu2.color.value.setRGB(1.0, 0.85, 0.55);
            o.wave.visible = true; o.wave.position.copy(P); o.wave.scale.setScalar(0.3 + age * 3); o.wave.material.opacity = 0.6 * I2;
            if (!R.cued['fs' + idx] && age > 1.2) { R.cued['fs' + idx] = 1; cue('foil-spread'); apar('tension', 0.9); }
          }
        }
      });
      // 宇宙广播 / 黑域 / 前沿吞没：音效
      R.ev.forEach(function (e, i) {
        if (e.rt == null || R.t < e.rt || R.cued['e' + i]) return; R.cued['e' + i] = 1;
        if (e.kind === 'cosmic') cue('broadcast'); else if (e.kind === 'flatten') cue('flatten'); else if (e.kind === 'seal') cue('select');
      });
      // 光球：以光速扩张，扫到飞船时「你才看到」
      var li = 0;
      R.heroes.forEach(function (e) {
        if (!e.P || li >= lightO.length) return;
        var L = lightO[li++], rad = R.Y - e.y;
        var arrived = e.seeY != null && R.Y >= e.seeY;
        var vis = rad > 0 && (!arrived || R.Y - e.seeY < 6);
        L.sphere.visible = L.ring.visible = vis; if (!vis) return;
        L.sphere.position.copy(e.P); L.sphere.scale.setScalar(rad); L.ring.position.copy(e.P); L.ring.scale.setScalar(rad);
        var fadeA = arrived ? Math.max(0, 1 - (R.Y - e.seeY) / 6) : 1;
        L.sphere.material.uniforms.opacity.value = 0.55 * fadeA; L.ring.material.opacity = 0.5 * fadeA;
      });
      R.lights.forEach(function (Lv, i) { if (Lv.rt != null && R.t >= Lv.rt && !R.cued['L' + i]) { R.cued['L' + i] = 1; cue('light-arrives'); } });
      E.bloom.strength += (0.6 * bloomK - E.bloom.strength) * 0.5;
    }
    function replayCam() {
      var R = st.RP, best = null;
      R.focus.forEach(function (k) { if (k.e.rt == null) return; var a = R.t - k.e.rt; var tail = k.e.kind === 'foil' ? 7.5 : k.e.kind === 'light' ? 2.6 : 3.4; if (a > -k.preDur - 0.6 && a < tail) best = k; });
      if (best && best.e.kind === 'cosmic') return { target: new T.Vector3(0, 0, 0), dist: FOCUS.cosmic.dist, elev: 0.8 };
      if (best && best.e.kind === 'light') {
        var sp = shipAt(R.Y).pos, P = sysO[best.e.sys].base; var mid = sp.clone().lerp(P, 0.35);
        return { target: mid, dist: Math.max(80, sp.distanceTo(P) * 1.5), elev: 0.75 };
      }
      if (best) {
        var e = best.e, d = e.kind === 'foil' ? Math.max(50, (e.f ? e.f.rmax : 15) * 3.2) : FOCUS[e.kind].dist;
        return { target: sysO[e.sys].base, dist: d, elev: e.kind === 'foil' ? 0.9 : 0.42 };
      }
      var sh = shipAt(R.Y);
      return { target: sh.pos.clone().lerp(new T.Vector3(0, 0, 0), 0.4), dist: 230, elev: 0.7 };
    }

    // ================================================================ 演示数据（截图 / 直接打开）
    function demoUniverse(variant) {
      var seed = E.params.get('seed') || 'demo-285';
      var u = SIM.createUniverse(seed); SIM.remember(u, 0);
      var best = null; u.systems.forEach(function (s) { if (s.id && s.owner != null && (best == null || u.D[0][s.id] < u.D[0][best])) best = s.id; }); if (best == null) best = 3;
      var t0 = u.time, res = SIM.travel(u, best, 'w0.9999');
      if (!u.ship.dead) res = SIM.hibernate(u, 250);
      if (!u.ship.dead) { var at = u.ship.at, nx = null; u.systems.forEach(function (s) { if (s.id !== at && s.id !== 0 && !s.flat && (nx == null || u.D[at][s.id] < u.D[at][nx])) nx = s.id; }); if (nx != null) res = SIM.travel(u, nx, 'w0.9999'); }
      ensureDemoEvents(u, t0 + 30, u.time - 25);
      if (E.params.get('dbg')) console.log('GXDBG ' + JSON.stringify({ seed: seed, time: u.time, at: u.ship.at, trips: u.ship.trips.map(function (t) { return [t.from, t.to, +t.depart.toFixed(1), +t.arrive.toFixed(1), !!t.warp]; }), flats: u.flats.map(function (f) { return [f.origin, f.y0, +f.rmax.toFixed(1)]; }), strikes: u.strikes.filter(function (x) { return x.done; }).map(function (x) { return [x.type, x.target, x.arrive, x.by]; }), sealed: u.civs.filter(function (c) { return c.blackDomain; }).map(function (c) { return c.name; }) }));
      return { u: u, t0: t0, t1: u.time, res: res };
    }
    function pushLog(s, e) { s.stateLog.push(e); s.stateLog.sort(function (a, b) { return a.y - b.y; }); }
    function lastLogY(s) { return s.stateLog.length ? s.stateLog[s.stateLog.length - 1].y : -1; }
    // 演示用：历史太平淡时补几件事（只在 demo 下，结构与模拟一致）
    function ensureDemoEvents(u, ya, yb) {
      var inWin = function (y) { return y > ya - 30 && y <= yb + 25; };
      var parts = u.strikes.filter(function (s) { return s.done && !s.wasted && s.type === '光粒' && inWin(s.arrive); }).length;
      var foils = u.flats.filter(function (f) { return inWin(f.y0); }).length;
      var sealed = u.civs.some(function (c) { return c.blackDomain; });
      var free = function (pred) { return u.systems.filter(function (s) { return s.id !== 0 && s.id !== u.ship.at && !s.flat && !s.dead && s.type !== '黑洞' && pred(s); }); };
      var Y = function (f) { return Math.round(ya + (yb - ya) * f); };
      if (!foils) {
        var stops = [0, u.ship.at].concat(u.ship.trips.map(function (t) { return t.to; }));
        var cand = free(function (s) { var d = u.D[u.ship.at][s.id]; return lastLogY(s) < Y(0.25) && d > 45 && d < 115 && stops.every(function (k) { return u.D[k][s.id] > 22; }); })[0];
        if (cand) {
          var y0 = Y(0.25), f = { id: u.flats.length, x: cand.x, y: cand.y, y0: y0, rmax: 17, r: 0, origin: cand.id };
          u.flats.push(f); u.strikes.push({ type: '二向箔', target: cand.id, by: 'singer', launch: y0 - 140, arrive: y0, done: true });
          u.systems.forEach(function (s) { var d = Math.hypot(s.x - f.x, s.y - f.y); if (d <= f.rmax && s.id !== u.ship.at && y0 + d <= u.simYear) { pushLog(s, { y: Math.round(y0 + d), owner: null, name: null, era: null, dead: s.dead, type: s.type, flat: true, sealed: false }); s.flat = true; s.flatYear = Math.round(y0 + d); s.flatBy = f.id; } });
          (u.dimLog = u.dimLog || []).push({ y: y0, n: (u.dimStrikes = (u.dimStrikes || 0) + 1) });
        }
      }
      for (var k = parts; k < 2; k++) {
        var yy = Y(0.55 + k * 0.25), c2 = free(function (s) { return lastLogY(s) < yy && !s.flat; }).sort(function (a, b) { return (b.owner != null) - (a.owner != null); })[k];
        if (!c2) break;
        var by = null; u.civs.forEach(function (c) { if (c.alive && c.home !== c2.id && c.home !== 0 && c.tech > 40 && by == null) by = c.id; });
        var src = by != null ? u.systems[u.civs[by].home] : u.singer, dd = Math.hypot(src.x - c2.x, src.y - c2.y);
        u.strikes.push({ type: '光粒', target: c2.id, by: by != null ? by : 'singer', launch: yy - Math.max(1, Math.round(dd / 0.99)), arrive: yy, done: true, fromSys: by != null ? u.civs[by].home : undefined });
        pushLog(c2, { y: yy, owner: null, name: null, era: null, dead: true, type: c2.type, flat: false, sealed: false }); c2.dead = true;
      }
      if (!sealed) {
        var ys = Y(0.42), civ = u.civs.filter(function (c) { return c.alive && c.home !== 0 && u.systems[c.home].owner === c.id && !u.systems[c.home].flat && !u.systems[c.home].dead; })
          .sort(function (a, b) { return u.D[u.ship.at][a.home] - u.D[u.ship.at][b.home]; })[0];
        if (civ) { civ.blackDomain = true; u.systems.forEach(function (s) { if (s.owner === civ.id) { s.stateLog = s.stateLog.filter(function (e) { return e.y < ys; }); pushLog(s, { y: ys, owner: civ.id, name: civ.name, era: '星海', dead: false, type: s.type, flat: false, sealed: true }); } }); }
      }
    }

    // ================================================================ 镜头与尺度
    var bloomBase = 0.85;
    function updateCamera(dt, t) {
      var still = E.still;
      var want = st.RP ? replayCam() : st.fly;
      if (st.intro && !st.RP) {
        var k0 = U.ease.cubicInOut(U.clamp(t / st.intro.dur, 0, 1));
        var dist = Math.exp(U.lerp(Math.log(st.intro.d0), Math.log(st.intro.d1), k0)), el = U.lerp(st.intro.e0, st.intro.e1, k0), az = U.lerp(st.intro.a0, st.intro.a1, k0);
        controls.target.copy(st.intro.target);
        camera.position.set(st.intro.target.x + Math.cos(az) * Math.cos(el) * dist, st.intro.target.y + Math.sin(el) * dist, st.intro.target.z + Math.sin(az) * Math.cos(el) * dist);
        if (k0 >= 1) st.intro = null;
      } else if (want) {
        var k = still ? 1 : 1 - Math.exp(-dt * (st.RP ? 1.6 : 2.4));
        controls.target.lerp(want.target, k);
        var off = camera.position.clone().sub(controls.target), L = off.length();
        if (want.elev != null) { var hz = Math.hypot(off.x, off.z) || 1, e0 = Math.atan2(off.y, hz), e2 = e0 + (want.elev - e0) * k; off.set(off.x / hz * Math.cos(e2), Math.sin(e2), off.z / hz * Math.cos(e2)); }
        off.setLength(L + (want.dist - L) * k); camera.position.copy(controls.target).add(off);
        if (!st.RP && st.fly && controls.target.distanceTo(want.target) < 0.5 && Math.abs(L - want.dist) < 1) st.fly = null;
      }
      if (st.RP && !still) { controls.autoRotate = true; controls.autoRotateSpeed = 0.3; }
      else if (!still && st.mode === 'map' && !st.fly && !st.intro && performance.now() - st.lastInteract > 14000) { controls.autoRotate = true; controls.autoRotateSpeed = 0.12; }
      // 拉远：越远缩放越快；目标点慢慢滑向银心，让整条银河进画面
      var camD = camera.position.distanceTo(controls.target);
      controls.zoomSpeed = 1.1 + U.clamp(Math.log10(Math.max(1, camD / 300)), 0, 3) * 1.4;
      if (!st.RP && !st.intro) {
        var gz = U.smoothstep(4000, 90000, camD);
        if (gz > 0 && !st.fly) {
          var goal = _c.copy(GAL_C).multiplyScalar(0.9 * gz);
          var dlt = goal.sub(controls.target).multiplyScalar(still ? 1 : Math.min(1, dt * 2));
          controls.target.add(dlt); camera.position.add(dlt);
        } else if (camD < 3000 && controls.target.length() > 400 && !st.fly) {
          var back = _c.copy(controls.target).multiplyScalar(-(still ? 1 : Math.min(1, dt * 1.5))); controls.target.add(back); camera.position.add(back);
        }
      }
      controls.update();
      camD = camera.position.distanceTo(controls.target);
      camera.near = U.clamp(camD * 0.002, 0.05, 200); camera.far = Math.max(2e4, camD * 8 + 1.2e5); camera.updateProjectionMatrix();
      // 尺度过渡
      var mapOn = 1 - U.smoothstep(900, 3200, camD);
      labelsOn = 1 - U.smoothstep(700, 1600, camD);
      root.visible = terr.visible = stalks.visible = mapOn > 0.01;
      terr.material.uniforms.op.value = mapOn; terr.material.uniforms.gridOp.value = st.RP ? 0.25 : 1;
      stalks.material.opacity = 0.5 * mapOn;
      field.material.uniforms.op.value = 1 - U.smoothstep(1800, 7500, camD);
      field.material.uniforms.pxs.value = PXK.value > 0 ? 1 / PXK.value : 600;
      var mw = U.smoothstep(1800, 14000, camD);
      hereIcon.visible = mw > 0.05 && !st.RP; if (hereIcon.visible) { hereIcon.position.copy(st.shipNow ? st.shipNow.pos : new T.Vector3()); hereIcon.material.uniforms.opacity.value = mw * 0.72; }
      milky.visible = mw > 0.01;
      mwStars.material.uniforms.op.value = mw; mwDust.material.uniforms.op.value = mw; mwDisc.material.uniforms.op.value = mw;
      mwStars.material.uniforms.pxs.value = mwDust.material.uniforms.pxs.value = 1 / PXK.value;
      var skyK = 1 - U.smoothstep(3000, 40000, camD);
      backdrop.setIntensity(0.8 * skyK + 0.0, 0.9 * (0.25 + 0.75 * skyK));
      return camD;
    }

    // ================================================================ 场景接口
    function setupDom() {
      var ui = document.getElementById('ui');
      labelsEl = U.el('div', 'passthrough', '', ui); labelsEl.id = 'gx-labels';
      starLabelsEl = U.el('div', 'passthrough', '', labelsEl);
      ringEls = [25, 50, 100, 150].map(function (R) { return U.el('div', 'gx-ring', '光行 ' + R + ' 年', labelsEl); });
      hereEl = U.el('div', 'gx-here', '<b>你在这里</b><i>200 光年局部 · 银河猎户支臂</i>', labelsEl); hereEl.style.opacity = 0;
      scaleEl = U.el('div', 'gx-scale', '', labelsEl);
      godEl = U.el('div', 'gx-god', '上帝视角 · 真实现状（不受光速限制）', labelsEl); godEl.style.display = st.god ? '' : 'none';
    }
    function camFromParams(target) {
      var c = E.params.get('cam'); if (!c) return false;
      var a = c.split(',').map(Number), d = a[0] || 260, az = a[1] != null ? a[1] : 1.1, el = a[2] != null ? a[2] : 0.65;
      controls.target.copy(target); camera.position.set(target.x + Math.cos(az) * Math.cos(el) * d, target.y + Math.sin(el) * d, target.z + Math.sin(az) * Math.cos(el) * d);
      return true;
    }

    var api = {
      scene: scene, camera: camera,
      bloom: { strength: 0.6, radius: 0.42, threshold: 0.88 },
      prePasses: [frontPass],
      onResize: function (w, h) { PXK.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, h); },
      enter: function (opts) {
        opts = opts || {};
        var variant = opts.variant || E.params.get('variant') || '';
        st.demo = !!opts.demo; st.god = variant === 'god' ? true : (opts.god != null ? !!opts.god : st.god);
        setupDom(); bindInput();
        controls.enabled = true; st.lastInteract = performance.now();
        PXK.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, E.size.h);
        var d = null, u = opts.u;
        if (!u && (st.demo || !RU.state || !RU.state.u)) { d = demoUniverse(variant); u = d.u; }
        if (!u) u = RU.state.u;
        st.u = u; st.sel = null; st.hover = null;
        if (st.built !== u) build(u); else refresh();
        var mode = opts.mode || (variant === 'replay' ? 'replay' : 'map');
        var here = sysO[u.ship.at] ? sysO[u.ship.at].base : new T.Vector3();
        var still = E.still;
        if (mode === 'replay') {
          var t0 = opts.t0 != null ? opts.t0 : d ? d.t0 : 0, t1 = opts.t1 != null ? opts.t1 : d ? d.t1 : u.time;
          controls.target.set(0, 0, 0); camera.position.set(80, 170, 220);
          var p = startReplay(t0, t1, opts.res || (d && d.res));
          mood('replay');
          return p;
        }
        st.mode = 'map'; mood('map');
        var tgt = new T.Vector3(); sysO.forEach(function (o) { tgt.add(o.base); }); tgt.multiplyScalar(1 / Math.max(1, sysO.length)); tgt.lerp(here, 0.25); tgt.y = 0;
        if (variant === 'zoom') { var zd = +(E.params.get('zd') || 160000); controls.target.copy(GAL_C).multiplyScalar(0.85 * U.smoothstep(4000, 90000, zd)); camera.position.copy(controls.target).add(new T.Vector3(-0.42, 0.62, 0.66).normalize().multiplyScalar(zd)); }
        else if (opts.focus != null || E.params.get('focus') != null) {
          var fq = opts.focus != null ? opts.focus : E.params.get('focus'), fid = +fq;
          if (fq === 'bh') fid = u.systems.filter(function (s) { return s.type === '黑洞'; })[0].id;
          if (fq === 'flat') fid = u.flats.length ? u.flats[0].origin : 0;
          if (fq === 'wd' || fq === 'ns') { var tt = fq === 'wd' ? '白矮星' : '中子星'; var hit = u.systems.filter(function (s) { return s.type === tt; })[0]; fid = hit ? hit.id : 0; }
          if (fq === 'seal') { var sc2 = u.civs.filter(function (c) { return c.blackDomain; })[0]; fid = sc2 ? sc2.home : 0; } if (!camFromParams(sysO[fid].base)) { controls.target.copy(sysO[fid].base); camera.position.copy(sysO[fid].base).add(new T.Vector3(30, 22, 34)); } }
        else if (!camFromParams(tgt)) {
          // 开场：从高处缓缓落到能看全局的位置
          st.intro = { target: tgt, d0: 900, d1: 235, e0: 1.25, e1: 0.4, a0: 0.4, a1: 1.15, dur: still ? 0.001 : 3.2 };
          if (still) { st.intro.dur = 1e-6; }
        }
        return null;
      },
      update: function (dt, t) {
        if (!st.u) return;
        UT.value = t;
        if (st.RP) {
          var y0 = st.RP.Y;
          st.RP.t = E.still ? E.stillT : st.RP.t + dt;
          st.RP.Y = yearAt(st.RP, st.RP.t);
          updateHud(dt > 0 ? (st.RP.Y - y0) / dt : 0);
        }
        var camD = updateCamera(dt, t);
        camera.updateMatrixWorld();
        updateWorld(t, dt);
        if (st.RP) updateReplayFx(t); else { E.bloom.strength += (0.6 - E.bloom.strength) * 0.3; }
        // 选中 / 悬停 / 航线
        selRing.visible = st.sel != null && !st.RP && sysO[st.sel] && labelsOn > 0.05; if (selRing.visible) selRing.position.copy(sysO[st.sel].pos);
        hovRing.visible = st.hover != null && st.hover !== st.sel && !st.RP && sysO[st.hover] && labelsOn > 0.05; if (hovRing.visible) hovRing.position.copy(sysO[st.hover].pos);
        if (routeRib.visible && st.route) setRib(routeRib, sysO[st.route.from].pos, sysO[st.route.to].pos);
        routeRib.material.uniforms.inten.value = labelsOn;
        root.children.forEach(function (c) { if (c.userData.neb) c.visible = labelsOn > 0.02 || true; });
        if (godEl) godEl.style.display = st.god && !st.RP ? '' : 'none';
        placeLabels();
        frontPass.uniforms.time.value = t;
        SKY.update(camera, t);
        if (st.RP && !E.still && st.RP.t >= st.RP.dur) endReplay(false);
      },
      exit: function () {
        controls.enabled = false; controls.autoRotate = false;
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = [];
        if (st.RP) { var r = replayResolve; st.RP = null; replayResolve = null; if (r) r({ skipped: true }); E.letterbox(false); }
        if (hudEl) { hudEl.remove(); hudEl = null; } if (st.skipEl) { st.skipEl.remove(); st.skipEl = null; }
        if (labelsEl) { labelsEl.remove(); labelsEl = null; starLabelsEl = null; ringEls = []; hereEl = null; scaleEl = null; godEl = null; }
        sysO.forEach(function (o) { o.el = null; });
        st.built = null;      // 标签 DOM 已删：下次进入重建
        dom.style.cursor = '';
      },
      setSelected: function (id) { st.sel = id; },
      setRoute: function (from, to, mode) { st.route = from == null || to == null ? null : { from: from, to: to, mode: mode }; updateRoute(); },
      refresh: function () { if (st.u && st.built === st.u) refresh(); },
      focus: function (id) { if (sysO[id]) flyTo(sysO[id].pos, 85, 0.5); },
      setGodView: function (b) { st.god = !!b; },
      // 调试 / 截图辅助
      _st: st
    };
    return api;
  });
})();
