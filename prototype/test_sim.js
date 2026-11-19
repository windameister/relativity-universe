// 无界面测试：物理自检 + 多种子脚本试玩（覆盖不同科技差）+ 接触系统统计
const fs=require('fs');
const SIM=require('./tools/simload')(__dirname+'/index.html');
const verbose=process.argv.includes('v');
let rngT=12345; const r=()=>(rngT=(rngT*16807)%2147483647)/2147483647;

function play(seed, trips=8, out=[]){
  const u=SIM.createUniverse(seed); SIM.remember(u,0);
  out.push(`== seed ${seed}: ${u.systems.length} 星系, `+u.civs.map(c=>c.name+'('+c.era+','+c.tech.toFixed(0)+')').join(', '));
  let visitedCivSys=[]; const extracted=new Set(); const flatPrev=new Map(), flatSys=new Set(); let lastDim=0;
  for(let i=0;i<trips;i++){
    const here=u.ship.at;
    // 路线：先探访有文明的星系，偶尔回访，偶尔用常规推进/冬眠/废墟
    let dest, mode=r()<0.5?'w0.9999':'w0.99999';
    const owned=u.systems.filter(s=>s.id!==here&&(s.owner!=null||s.ruins.length));
    if(visitedCivSys.length&&r()<0.35) dest=visitedCivSys[Math.floor(r()*visitedCivSys.length)];
    else dest=(owned.length?owned[Math.floor(r()*owned.length)]:u.systems[(here+1)%u.systems.length]).id;
    if(dest===here) dest=u.systems[(here+3)%u.systems.length].id;
    if(r()<0.15) mode='0.03';
    const res = (r()<0.08)? SIM.hibernate(u,300) : SIM.travel(u,dest,mode);
    const t=res.trip, rep=res.report, E=rep.encounter;
    if(rep.death){ if(!t.died) t.died='停留中'; if(u.ship.at!==t.from && t.from!==t.to && t.caught) throw new Error('caught but arrived');
      if(E.options.length) throw new Error('options after death');
      out.push(`#${t.n} ✖ ${t.label} 途中终结（${t.died}）纪元${Math.floor(t.arrive)}：`+u.ship.dead.cause); stats.dead++; stats.deathWhy[t.died]=(stats.deathWhy[t.died]||0)+1; break; }
    if(!rep.first){ stats.returns++; if(rep.caused.length) stats.returnsCaused++; }
    if(E.scene) stats.scene[E.scene]=(stats.scene[E.scene]||0)+1;
    if(E.tier==='母星' && (E.detained||E.extracted)) throw new Error('home civ intercepted');
    if(E.extracted){ const c=u.civs[u.systems[rep.sysId].owner]; if(extracted.has(c.id)) throw new Error('re-extracted '+c.name); extracted.add(c.id); }
    (rep.big||[]).forEach(b=>stats.big[b.title.replace(/「.*」/,'「X」')]=(stats.big[b.title.replace(/「.*」/,'「X」')]||0)+1);
    out.push(`#${t.n} → ${rep.sysName} ${t.label} 外部+${t.ext.toFixed(0)} 船上+${t.ship.toFixed(2)} 纪元${Math.floor(u.time)} 舰员${t.crewAge.toFixed(1)} | 飞船科技 ${u.ship.tech.toFixed(1)}`);
    if(!rep.first){ out.push('   离开时: '+SIM.lifeLine(rep.then)); out.push('   现在  : '+SIM.lifeLine(rep.now)); rep.lines.forEach(l=>out.push('   > '+l.t)); }
    else out.push('   [首访] '+SIM.lifeLine(rep.now));
    out.push(`   接触[${E.tier}]`+(E.gap!=null?` 差${E.gap.toFixed(0)} 态度${SIM.attWord(E.att)} 印象${E.tag||'-'}`:'')+' 选项: '+E.options.map(o=>o.label).join('/'));
    E.forced.forEach(f=>out.push('   ! '+f.t)); (rep.cosmic||[]).forEach(x=>out.push('   ★ '+x.y+': '+x.t));
    const ch=E.options.filter(o=>o.id!=='离开'&&(o.id!=='广播坐标'||r()<0.3)); 
    if(ch.length){ const o=ch[Math.floor(r()*ch.length)]; const x=SIM.interact(u,rep.sysId,o.id); out.push(`   → 选择「${o.label}」：${x.t}`); stats.opt[o.id]=(stats.opt[o.id]||0)+1; }
    stats.tier[E.tier]=(stats.tier[E.tier]||0)+1; if(E.detained)stats.detained++; if(E.extracted)stats.extracted++; if(E.expelled)stats.expelled++;
    if(u.systems[rep.sysId].owner!=null&&!visitedCivSys.includes(rep.sysId)) visitedCivSys.push(rep.sysId);
    // 不变量
    if(t.ext < t.d-1e-9) throw new Error('FTL!');
    u.civs.forEach(c=>{ if(!isFinite(c.tech)||!isFinite(c.pop)||c.stab<0||c.stab>1) throw new Error('bad civ state '+c.name); });
    if(!isFinite(u.ship.tech)) throw new Error('bad ship tech');
    if(!(u.ship.supply>=0&&u.ship.supply<=100)) throw new Error('supply out of range '+u.ship.supply);
    if(!u.ship.dead && u.ship.crewAge0+u.ship.bio>SIM.LIFESPAN+1e-6) throw new Error('crew older than lifespan');
    u.systems.forEach(s=>{ if(s.flat){ const late=u.strikes.filter(st=>st.target===s.id&&!st.wasted&&st.arrive>s.flatYear); if(late.length) throw new Error('flat system struck again '+s.name); } });
    // 新增不变量：二维化区域半径单调不减、被压平的星系不会复原、暴露度有界、降维次数单调
    u.flats.forEach(f=>{ const pr=flatPrev.get(f); if(pr!=null&&f.r<pr-1e-9) throw new Error('flat radius shrank'); if(!(f.r>=0&&f.r<=f.rmax+1e-9)) throw new Error('flat radius out of range'); flatPrev.set(f,f.r); });
    u.systems.forEach(s=>{ if(flatSys.has(s.id)&&!s.flat) throw new Error('unflattened '+s.name); if(s.flat) flatSys.add(s.id); if(!(s.exposure>=0&&s.exposure<=SIM.EXPO_MAX+1e-9)||!isFinite(s.exposure)) throw new Error('exposure out of bounds '+s.exposure); });
    if(u.dimStrikes<lastDim) throw new Error('dim strikes decreased'); lastDim=u.dimStrikes;
    if(!isFinite(SIM.dimOf(u))) throw new Error('dim NaN');
    if(u.ship.dead){ out.push('   ✖ 飞船终结：'+u.ship.dead.cause); stats.dead++; break; }
  }
  return out;
}
const stats={tier:{},scene:{},opt:{},detained:0,extracted:0,expelled:0,dead:0,deathWhy:{},returns:0,returnsCaused:0,big:{}};
const seeds=process.argv.slice(2).filter(x=>x!=='v');
const showSeeds = seeds.length?seeds:['alpha','3body','gamma'];
showSeeds.forEach(s=>console.log(play(s, 8).join('\n')));
for(let k=0;k<150;k++) play('t'+k, 10);
// 确定性：同一种子、同一操作序列，两次结果逐字相同
{rngT=777; const a=play('det1',12).join('\n'); rngT=777; const b=play('det1',12).join('\n'); if(a!==b) throw new Error('nondeterministic'); console.log('determinism ok ('+a.length+' chars)');}
// 事件库确定性：事实日志 + 卡片两次逐字相同；打印哈希，供 Chrome 端比对（tools/facthash.expr.js）
{const ex=fs.readFileSync(__dirname+'/tools/facthash.expr.js','utf8').replace(/^\/\/.*\n/,''); const h1=new Function('SIM','return '+ex)(SIM), h2=new Function('SIM','return '+ex)(SIM); if(h1!==h2) throw new Error('facts nondeterministic'); console.log('facts determinism ok: '+h1);
 // 「继续/离开」不消耗随机数：同一宇宙离开前后 RNG 状态一致
 const u=SIM.createUniverse('rngleave'); SIM.remember(u,0); const r=SIM.travel(u,u.systems[3].id,'w0.9999'); const rs=u.rs; SIM.interact(u,r.report.sysId,'离开'); if(u.rs!==rs) throw new Error('离开 consumed RNG'); console.log('leave keeps RNG ok');}
// 长时间尺度：黑暗森林 / 歌者 / 二向箔 / 维度
{let tot={flats:0,blackDomain:0,diaspora:0,silent:0,singerStrikes:0,civStrikes:0,minDim:3,zeroBroadcast:0};
 for(let k=0;k<30;k++){const u=SIM.createUniverse('L'+k);let pr=0;for(let y=500;y<=10000;y+=500){SIM.simulateTo(u,y);u.flats.forEach(f=>{if(f.r<0||f.r>f.rmax+1e-9)throw new Error('flat r');});if(u.dimStrikes<pr)throw new Error('dim');pr=u.dimStrikes;u.systems.forEach(s=>{if(!(s.exposure>=0&&s.exposure<=SIM.EXPO_MAX))throw new Error('expo');});u.civs.forEach(c=>{if(!isFinite(c.tech)||!isFinite(c.pop))throw new Error('NaN civ');});}
  tot.flats+=u.flats.length;u.civs.forEach(c=>{if(c.blackDomain&&c.alive)tot.blackDomain++;if(c.diaspora)tot.diaspora++;if(c.silent)tot.silent++;});u.strikes.forEach(st=>st.by==='singer'?tot.singerStrikes++:tot.civStrikes++);tot.minDim=Math.min(tot.minDim,+SIM.dimOf(u).toFixed(3));if(u.cosmicFlags[8])tot.zeroBroadcast++;}
 console.log('30 个宇宙 × 10000 年:',JSON.stringify(tot));}
console.log('\n150 个宇宙 × 10 趟 接触统计:', JSON.stringify(stats));
// 物理自检
{const u=SIM.createUniverse('phys');let bad=0;
 for(const to of u.systems.map(s=>s.id).filter(i=>i)) for(const mm of [...SIM.SPEEDS.map(String),...SIM.WARP_SPEEDS.map(x=>'w'+x)]){const t=SIM.tripCalc(u,to,mm); if(t.ext<t.d-1e-9||t.ship>t.ext+1e-9||!(t.ship>0))bad++;}
 console.log('physics violations:',bad);
 u.D[0][1]=100; for(const mm of ['w0.999','w0.9999','w0.99999','0.01','0.03']){const t=SIM.tripCalc(u,1,mm);console.log('100ly',mm,'外部',t.ext.toFixed(3),'船上',t.ship.toFixed(3),'γ',t.gamma.toFixed(1),'舰员老',t.bio.toFixed(3));}}
// 二向箔逃逸自检（合成场景：在太阳 5 光年外放一片正在扩张的二维平面，再出发 / 冬眠）
{function setup(){const u=SIM.createUniverse('s0');SIM.remember(u,0);SIM.simulateTo(u,100);const s=u.systems[0];
   u.flats.push({id:u.flats.length,x:s.x+5,y:s.y,y0:u.time-2,rmax:30,r:2,origin:-1});return u;}
 const far=u=>u.systems.filter(s=>s.id).sort((a,b)=>u.D[0][b.id]-u.D[0][a.id])[0].id;
 let u=setup(); let r=SIM.travel(u,far(u),'0.03'); const conv=!!u.ship.dead&&r.trip.caught&&u.ship.at===0&&r.report.death;
 u=setup(); SIM.travel(u,far(u),'w0.999'); const warp=!u.ship.dead;
 u=setup(); r=SIM.hibernate(u,50); const stay=!!u.ship.dead&&r.report.death&&r.trip.arrive<u.time+1e-9&&r.trip.ext<10;
 console.log('二向箔逃逸自检：常规推进被追上',conv,'| 曲率逃脱',warp,'| 原地冬眠被压平',stay);
 if(!(conv&&warp&&stay)) throw new Error('escape check failed');
 // 死后不能再行动
 const t0=u.time; SIM.travel(u,3,'w0.999'); if(u.time!==t0) throw new Error('acted after death');}
