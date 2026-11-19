// 统计：随机曲率巡游 15 站（优先有文明的星系），每次抵达的接触层级 / 先进文明场景分布，按前/后半程拆开
// 用法：在仓库根目录运行  node playtest/tier_stats.js [path/to/index.html]
const fs=require('fs');const SIM=require('../prototype/tools/simload')(process.argv[2]||__dirname+'/../prototype/index.html');
const cnt=[{},{}],scn=[{},{}];let deaths=0,ret=0,retChanged=0,retCaused=0,big=0,adv=[0,0],wall=[0,0],steps=0;let rs=7;const r=()=>(rs=(rs*16807)%2147483647)/2147483647;
const WALL={'扣押':1,'好战':1,'官僚':1};
for(let k=0;k<150;k++){const u=SIM.createUniverse('t'+k);SIM.remember(u,0);
 for(let i=0;i<15&&!u.ship.dead;i++){const here=u.ship.at;let c=u.systems.filter(s=>s.id!==here&&s.owner!=null&&!u.civs[s.owner].blackDomain);
  if(!c.length||r()<0.25)c=u.systems.filter(s=>s.id!==here);const d=c[Math.floor(r()*c.length)];
  const res=SIM.travel(u,d.id,['w0.999','w0.9999','w0.99999'][i%3]);const rep=res.report,E=rep.encounter;if(rep.death)break;steps++;
  const h=i<7?0:1;cnt[h][E.tier]=(cnt[h][E.tier]||0)+1;
  if(E.tier==='先进'){adv[h]++; const sc=E.scene||'拦截审查'; scn[h][sc]=(scn[h][sc]||0)+1; if(!E.scene||WALL[sc])wall[h]++;}
  if(rep.big)big+=rep.big.length;
  if(!rep.first){ret++;if(rep.caused&&rep.caused.length)retCaused++;if(rep.now.civName!==rep.then.civName||rep.now.dead!==rep.then.dead||rep.now.flat!==rep.then.flat||Math.abs(rep.now.tech-rep.then.tech)>10)retChanged++;}
  const o=E.options.filter(o=>o.id!=='离开'&&o.id!=='广播坐标');if(o.length)SIM.interact(u,d.id,o[Math.floor(r()*o.length)].id);}
 if(u.ship.dead)deaths++;}
const fmt=o=>{const t=Object.values(o).reduce((a,b)=>a+b,0);return Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(100*v/t).toFixed(0)+'%').join(' / ');};
console.log('前 7 站:',fmt(cnt[0]));console.log('后 8 站:',fmt(cnt[1]));
console.log('先进文明场景 前:',fmt(scn[0]));console.log('先进文明场景 后:',fmt(scn[1]));
console.log('先进文明中「拦截墙」(扣押/盘查/检疫) 占比：前',(100*wall[0]/adv[0]).toFixed(0)+'%','后',(100*wall[1]/adv[1]).toFixed(0)+'%');
console.log('飞船死亡局数',deaths,'/150；抵达',steps,'次；回访',ret,'次，其中明显变化',retChanged,'('+(100*retChanged/ret).toFixed(0)+'%)，提到你造成的后果',retCaused,'('+(100*retCaused/ret).toFixed(0)+'%)；大事件卡片',big);
