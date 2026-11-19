// 统计：回响（you 事件）的重复度。随机巡游 15 站 × 150 个宇宙，与 tier_stats 相同的路线。
// 重复度 = 1 − 不同模板数 / 回响总数（模板 = 去掉「专名」和数字后的句子）；同文明同模板重复 = 同一文明身上同一模板出现 ≥2 次的次数
// 用法：在仓库根目录运行  node playtest/echo_stats.js [path/to/index.html]
const fs=require('fs');const SIM=require('../prototype/tools/simload')(process.argv[2]||__dirname+'/../prototype/index.html');
let rs=7;const r=()=>(rs=(rs*16807)%2147483647)/2147483647;
let tot=0,uniqT=0,sameCiv=0,starmapBad=0,univ=0;const tmplCount={};
const norm=t=>t.replace(/「[^」]*」/g,'「X」').replace(/[0-9]+(\.[0-9]+)?/g,'N');
for(let k=0;k<150;k++){const u=SIM.createUniverse('t'+k);SIM.remember(u,0);let gaveMap=false;
 for(let i=0;i<15&&!u.ship.dead;i++){const here=u.ship.at;let c=u.systems.filter(s=>s.id!==here&&s.owner!=null&&!u.civs[s.owner].blackDomain);
  if(!c.length||r()<0.25)c=u.systems.filter(s=>s.id!==here);const d=c[Math.floor(r()*c.length)];
  const res=SIM.travel(u,d.id,['w0.999','w0.9999','w0.99999'][i%3]);const rep=res.report,E=rep.encounter;if(rep.death)break;
  const o=E.options.filter(o=>o.id!=='离开'&&o.id!=='广播坐标');if(o.length){const pick=o[Math.floor(r()*o.length)].id;if(pick==='交出星图')gaveMap=true;SIM.interact(u,d.id,pick);}}
 SIM.simulateTo(u,u.time+300);
 // 星图真的交出去过：交出星图、回家讲述（母星拿到星图）、被抽取导航数据
 if(u.facts&&u.facts.some(f=>f.type==='starmap'||f.type==='told'||f.type==='extract'))gaveMap=true;
 const seen=new Set(),evs=[];u.systems.forEach(s=>s.timeline.forEach(e=>{if(e.you&&!seen.has(e.y+e.t)){seen.add(e.y+e.t);evs.push(e);}}));
 univ++;tot+=evs.length;const T=new Set();const perCiv={};
 evs.forEach(e=>{const t=norm(e.t);T.add(t);tmplCount[t]=(tmplCount[t]||0)+1;const civ=(e.t.match(/「([^」]*)」/)||[])[1]||'?';const key=civ+'|'+t;perCiv[key]=(perCiv[key]||0)+1;if(/星图/.test(e.t)&&!gaveMap){starmapBad++;if(process.env.SHOWMAP)console.log("MAP:",e.t.slice(0,90));}});
 uniqT+=T.size;Object.values(perCiv).forEach(v=>{if(v>1)sameCiv+=v-1;});}
const top=Object.entries(tmplCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
console.log(`宇宙 ${univ}；回响 ${tot} 条（每局 ${(tot/univ).toFixed(1)}）；重复度 ${(100*(1-uniqT/Math.max(1,tot))).toFixed(0)}%；同文明同模板重复 ${sameCiv} 次；从未交出/被抽走星图却提「星图」 ${starmapBad} 次`);
console.log('最常见的模板：');top.forEach(([t,n])=>console.log('  '+n+' × '+t.slice(0,60)));
