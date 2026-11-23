/* fx/blackhole —— 黑洞（引力透镜 + 吸积盘）与黑域（吞掉光线的洞）。galaxy 负责。
 *
 * 两者都是「面向相机的公告板 + 片元里追光线」：
 *   - 黑洞：在史瓦西度规的等效牛顿形式里积分光线（a = -1.5 h² r̂ / r⁴，单位 Rs=1），穿过薄吸积盘时累加盘面颜色
 *     （温度 ∝ r^-3/4，相对论多普勒 + 引力红移 → planckRGB(gT)），被捕获的光线是黑色阴影，逃逸的光线去采样天空全景。
 *     所以背景银河在黑洞周围真的被弯折，盘的后半边会被「翻」到阴影上方和下方（星际穿越的样子）。
 *   - 黑域：局部光速降到 16.7 km/s，从外面看是一个把光吞掉的洞：里面几乎全黑（只有被冻结的、极度红移的残光），
 *     边缘一圈光线被拖慢、堆积形成细亮环，外侧背景被向内拉（透镜边缘）。
 *
 * 用法：
 *   var bh = RU.fx.blackhole.create({ rs: 0.6, sky: S.equirect, skyIntensity: 1, tilt: 0.3, seed: 1 });  scene.add(bh);
 *   bh.position.copy(p); 每帧 bh.update(camera, t)
 *   var dm = RU.fx.blackhole.createDomain({ radius: 4, sky: S.equirect }); dm.update(camera, t); dm.setGrow(0..1)
 *   两者都有 .setSkyIntensity(k)（跟背景亮度同步），.setOpacity(a)
 */
(function () {
  var RU = window.RU, T = window.THREE;
  RU.fx = RU.fx || {};

  function skyGlsl() { return RU.fx.sky && RU.fx.sky.get ? RU.fx.sky.get().glsl : ''; }

  // 公告板：PlaneGeometry(2,2)，在顶点着色器里对齐相机
  var VS_BB = [
    'uniform float halfSize; varying vec3 vW; varying vec2 vUv;',
    'void main(){ vUv=uv; vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;',
    ' vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]); vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);',
    ' vW=c+(right*position.x+up*position.y)*halfSize; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0); }'].join('\n');

  function FS_BH() {
    return [
      RU.glsl.noise, RU.glsl.blackbody, skyGlsl(),
      'uniform vec3 camL; uniform mat3 toLocal; uniform mat3 toWorld; uniform float time, rin, rout, skyI, opacity, diskI, seed;',
      'uniform sampler2D sky; varying vec3 vW; varying vec2 vUv;',
      'vec4 disk(vec3 q, vec3 dir){',
      ' float r=length(q.xz); float ang=atan(q.z,q.x);',
      ' float vk=sqrt(0.5/r); vec3 vel=vk*vec3(-sin(ang),0.0,cos(ang)); float gam=1.0/sqrt(1.0-vk*vk);',
      ' float dop=1.0/(gam*(1.0-dot(vel,-dir))); float g=dop*sqrt(max(1.0-1.0/r,0.02));',
      ' float om=vk/r; float a2=-time*om*2.0; vec2 rq=mat2(cos(a2),-sin(a2),sin(a2),cos(a2))*q.xz;',
      ' vec2 dq=rq/r; float n=fbm3(vec3(r*2.4,dq*1.3+seed))*0.5+0.5; float n2=fbm3(vec3(r*7.0,dq*2.5-seed)); float st=0.5+0.5*sin(r*9.0+n*5.0+n2*2.0);',
      ' float Tk=7800.0*pow(r/rin,-0.6)*pow(max(1.0-sqrt(rin/r),0.0)+0.08,0.2);',
      ' vec3 c=blackbodyColor(Tk*g)*diskI*pow(g,3.0)*pow(rin/r,1.1)*(0.4+1.0*n)*(0.7+0.45*st);',
      ' float a=smoothstep(rin,rin+0.6,r)*smoothstep(rout,rout*0.5,r)*(0.35+0.5*n)*(0.7+0.3*st);',
      ' return vec4(c, clamp(a,0.0,1.0)); }',
      'vec2 eqUv(vec3 d){ return vec2(atan(d.z,d.x)/6.2831853+0.5, asin(clamp(d.y,-1.0,1.0))/3.14159265+0.5); }',
      'void main(){',
      ' vec3 dW=normalize(vW-cameraPosition); vec3 p=camL; vec3 v=normalize(toLocal*dW);',
      // 导数在循环之前（统一控制流）取，用未弯折方向的梯度去采样弯折后的方向
      ' vec2 u0=eqUv(dW); vec2 gx=dFdx(u0), gy=dFdy(u0); gx.x-=floor(gx.x+0.5); gy.x-=floor(gy.x+0.5);',
      ' vec3 h3=cross(p,v); float h2=dot(h3,h3);',
      ' float R0=34.0; float pv=dot(p,v); float cc=dot(p,p)-R0*R0; float disc=pv*pv-cc; bool skip=false;',
      ' if(cc>0.0){ if(disc<0.0||pv>0.0) skip=true; else p+=v*(-pv-sqrt(disc)); }',
      ' vec3 col=vec3(0.0); float tr=1.0; bool cap=false;',
      ' if(!skip){ for(int i=0;i<260;i++){',
      '  float r=length(p); if(r<1.0){ cap=true; break; } if(r>R0+0.5 && dot(p,v)>0.0) break;',
      '  float dt=clamp(0.055*r*r/(r+2.2),0.018,1.2); vec3 pp=p;',
      '  v+=-1.5*h2*p/(r*r*r*r*r)*dt; p+=v*dt;',
      '  if(pp.y*p.y<=0.0 && i>0){ float f=pp.y/(pp.y-p.y); vec3 q=mix(pp,p,f); float rq=length(q.xz);',
      '   if(rq>rin && rq<rout){ vec4 dc=disk(q,normalize(v)); col+=tr*dc.rgb*dc.a; tr*=1.0-dc.a; if(tr<0.02) break; } } } }',
      ' vec3 bg=vec3(0.0); if(!cap){ vec3 d2=normalize(toWorld*normalize(v)); bg=textureGrad(sky, eqUv(d2), gx*1.5, gy*1.5).rgb*skyI; }',
      ' col+=tr*bg;',
      // 只在透镜明显的地方（冲量参数 b 小）盖住后面的场景；外圈把真实场景透出来
      ' float bimp=sqrt(h2); float lensA=1.0-smoothstep(4.8,11.5,bimp);',
      ' float e=length(vUv*2.0-1.0); float hole=cap?1.0:0.0; float a=clamp(max(hole,max(lensA,1.0-tr)),0.0,1.0)*(1.0-smoothstep(0.76,1.0,e))*opacity;',
      ' gl_FragColor=vec4(col,a); }'].join('\n');
  }

  function FS_DOMAIN() {
    return [
      RU.glsl.noise, skyGlsl(),
      'uniform vec3 center; uniform float R, skyI, opacity, time, grow; uniform sampler2D sky; varying vec3 vW; varying vec2 vUv;',
      'vec3 rot(vec3 v, vec3 axis, float a){ return v*cos(a)+cross(axis,v)*sin(a)+axis*dot(axis,v)*(1.0-cos(a)); }',
      'void main(){',
      ' vec3 dW=normalize(vW-cameraPosition); vec3 oc=center-cameraPosition; float tc=dot(oc,dW);',
      ' vec3 perp=oc-dW*tc; float b=length(perp)/max(R*grow,1e-4);',
      ' if(tc<0.0) discard;',
      ' vec3 col; float a;',
      ' if(b<1.0){',
      // 光速降到 16.7 km/s：里面是彻底吞光的暗洞，只有贴近边界的极微弱红移残光
      '  float edge=pow(b, 18.0);',
      '  col=vec3(0.015,0.002,0.008)*edge+vec3(0.05,0.02,0.12)*pow(b, 32.0);',
      '  a=1.0;',
      ' } else {',
      // 紧贴洞缘（b ∈ 1..1.45）的引力/慢光透镜，向内扯动星空，边界一条极细的冷紫光环
      '  vec3 axis=normalize(cross(dW,perp)); float fall=exp(-(b-1.0)/0.16);',
      '  vec3 d2=rot(dW,axis,-0.16*fall);',
      '  col=skySample(sky,d2)*skyI;',
      '  float ring=exp(-pow((b-1.0)/0.018,2.0))*0.55+exp(-(b-1.0)/0.08)*0.09;',
      '  col+=vec3(0.55,0.50,1.0)*ring;',
      '  a=1.0-smoothstep(1.06,1.42,b);',
      ' }',
      ' gl_FragColor=vec4(col,a*opacity); }'].join('\n');
  }

  function makeTilt(tilt, yaw) {
    var m = new T.Matrix4().makeRotationY(yaw || 0).multiply(new T.Matrix4().makeRotationX(tilt || 0));
    return m; // local → world
  }

  RU.fx.blackhole = {
    /** 黑洞公告板。o.rs = 史瓦西半径（世界单位），o.sky = 天空全景 */
    create: function (o) {
      o = o || {};
      var rs = o.rs || 0.6, l2w = makeTilt(o.tilt != null ? o.tilt : 0.32, o.yaw || 0.7);
      var toWorld = new T.Matrix3().setFromMatrix4(l2w), toLocal = toWorld.clone().transpose();
      var mat = new T.ShaderMaterial({
        uniforms: { halfSize: { value: rs * 30 }, camL: { value: new T.Vector3() }, toLocal: { value: toLocal }, toWorld: { value: toWorld },
          time: { value: 0 }, rin: { value: 2.8 }, rout: { value: o.rout || 13.5 }, skyI: { value: o.skyIntensity != null ? o.skyIntensity : 1 },
          opacity: { value: 1 }, diskI: { value: o.diskIntensity || 2.2 }, seed: { value: o.seed || 1 }, sky: { value: o.sky } },
        vertexShader: VS_BB, fragmentShader: FS_BH(), transparent: true, depthWrite: false
      });
      var m = new T.Mesh(new T.PlaneGeometry(2, 2), mat); m.frustumCulled = false; m.renderOrder = 15;
      var _v = new T.Vector3();
      m.rs = rs;
      m.update = function (camera, t) {
        m.updateMatrixWorld();
        _v.setFromMatrixPosition(m.matrixWorld);
        mat.uniforms.camL.value.copy(camera.position).sub(_v).divideScalar(rs).applyMatrix3(toLocal);
        if (t != null) mat.uniforms.time.value = t;
      };
      m.setSkyIntensity = function (k) { mat.uniforms.skyI.value = k; };
      m.setOpacity = function (a) { mat.uniforms.opacity.value = a; m.visible = a > 0.002; };
      return m;
    },
    /** 黑域公告板。o.radius = 黑域半径（世界单位） */
    createDomain: function (o) {
      o = o || {};
      var R = o.radius || 4;
      var mat = new T.ShaderMaterial({
        uniforms: { halfSize: { value: R * 2.8 }, center: { value: new T.Vector3() }, R: { value: R }, skyI: { value: o.skyIntensity != null ? o.skyIntensity : 1 },
          opacity: { value: 1 }, time: { value: 0 }, grow: { value: 1 }, sky: { value: o.sky } },
        vertexShader: VS_BB, fragmentShader: FS_DOMAIN(), transparent: true, depthWrite: false
      });
      var m = new T.Mesh(new T.PlaneGeometry(2, 2), mat); m.frustumCulled = false; m.renderOrder = 15;
      m.update = function (camera, t) { m.updateMatrixWorld(); mat.uniforms.center.value.setFromMatrixPosition(m.matrixWorld); if (t != null) mat.uniforms.time.value = t; };
      m.setGrow = function (g) { g = Math.max(0.001, g); mat.uniforms.grow.value = g; mat.uniforms.halfSize.value = R * 2.8 * g; };
      m.setSkyIntensity = function (k) { mat.uniforms.skyI.value = k; };
      m.setOpacity = function (a) { mat.uniforms.opacity.value = a; m.visible = a > 0.002; };
      return m;
    }
  };
})();
