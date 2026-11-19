// 统计：到访一个外星文明星系后 600 年内被打击（光粒/二向箔）的概率，对照组为没去过的外星文明星系
// 用法：在仓库根目录运行  node playtest/curse_stats.js [path/to/index.html]
const fs=require('fs');const SIM=require('../prototype/tools/simload')(process.argv[2]||__dirname+'/../prototype/index.html');
function run(mode,act,N=300){let vis=0,visHit=0,ctl=0,ctlHit=0,deadRestrike=0;const why={};
for(let k=0;k<N;k++){const u=SIM.createUniverse('c'+k);SIM.remember(u,0);
 const aliens=u.civs.filter(c=>c.home!==0).map(c=>c.home);if(aliens.length<2)continue;
 const tgt=aliens[0];const others=aliens.slice(1);
 const t0=u.time; SIM.travel(u,tgt,mode); if(u.ship.dead) continue; if(act) SIM.interact(u,tgt,act);
 const tArr=u.time;
 const far=u.systems.filter(s=>s.owner==null&&s.id!==tgt).sort((a,b)=>u.D[tgt][b.id]-u.D[tgt][a.id])[0];
 if(far&&!u.ship.dead) SIM.travel(u,far.id,'w0.9999'); SIM.simulateTo(u,tArr+600);
 const hits=id=>u.strikes.filter(st=>st.target===id&&st.arrive<=tArr+600&&st.arrive>=t0&&!st.wasted);
 vis++; const h=hits(tgt); if(h.length){visHit++; const k2=(h[0].cause&&h[0].cause.kind)||'?'; why[k2]=(why[k2]||0)+1;}
 others.forEach(o=>{ctl++; if(hits(o).length)ctlHit++;});
 u.systems.forEach(s=>{const n=u.strikes.filter(st=>st.target===s.id&&st.type==='光粒'&&!st.wasted).length; if(n>1)deadRestrike++;});
}
return `${mode} ${act||'无互动'}: 到访星系 600 年内被打击 ${visHit}/${vis} (${(100*visHit/vis).toFixed(0)}%)，未到访对照 ${ctlHit}/${ctl} (${(100*ctlHit/ctl).toFixed(0)}%)，同一星系被光粒击中≥2次 ${deadRestrike}，打击原因 ${JSON.stringify(why)}`;}
const only=process.argv[3];[['w0.9999'],['w0.9999','少量技术'],['0.03'],['0.03','观察'],['w0.9999','广播坐标']].forEach(([a,b],i)=>{if(only==null||only.includes(String(i)))console.log(run(a,b));});
