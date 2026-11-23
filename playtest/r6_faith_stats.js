// 神眷线统计（r6）：与 round2/missionary_stats 相同的开局（对落后文明假扮神明，立刻飞去远处），再推 1500 年。
// 「中段兑现」= 该文明（含后裔）出现了任一分支史实：假先知 / 朝圣 / 射电呼唤 / 使者 / 殉道 / 宗教改革 / 圣战
// 另外统计：兑现发生时飞船能否（按光延迟）知道；以及「回访」玩法——300~700 年后飞回去，能否在现场遇到剧情（相遇场景）
// 用法：在仓库根目录运行  node playtest/r6_faith_stats.js [index.html]
const SIM=require('../prototype/tools/simload')(process.argv[2]||__dirname+'/../prototype/index.html');
const BR=['faith_prophet','faith_pilgrim','faith_call','faith_envoy','faith_martyr','faith_reform','faith_holywar'];
const MEET=/^(rel\.(envoy_meet|pilgrim_scene|prophet_scene|call_answer|return)|payoff\.)/;
let n=0,pay=0,known=0,dead300=0,dead1500=0,warned=0;const byType={},paths={},reach={};let rn=0,rmeet=0;const meetBy={};
for(let k=0;k<300;k++){
  for(const mode of ['far','revisit']){
  const u=SIM.createUniverse('m'+k);SIM.remember(u,0);
  const c=u.civs.find(c=>c.home!==0&&c.tech>=8&&c.tech<40);if(!c)break;const sid=c.home;
  const r=SIM.travel(u,sid,'w0.9999');const E=r.report.encounter;if(!E.options.some(o=>o.id==='假扮神明'))break;
  SIM.interact(u,sid,'假扮神明');const t0=u.time,cid=u.systems[sid].owner;
  const far=u.systems.filter(s=>s.owner==null&&s.id!==sid).sort((a,b)=>u.D[sid][b.id]-u.D[sid][a.id])[0];
  if(mode==='far'){
    n++;SIM.travel(u,far.id,'w0.9999');
    SIM.simulateTo(u,t0+300);if(!u.civs[cid].alive)dead300++;SIM.simulateTo(u,t0+1500);if(!u.civs[cid].alive)dead1500++;
    const lin=new Set([cid]);u.civs.forEach(d=>{let p=d,g=0;while(p&&p.parent!=null&&g++<20){if(lin.has(p.parent)){lin.add(d.id);break;}p=u.civs[p.parent];}});
    const fs=u.facts.filter(f=>BR.includes(f.type)&&lin.has(+String(f.target).split(':')[1])&&f.y<=t0+1500);
    if(fs.length){pay++;const t=fs[0].type;byType[t]=(byType[t]||0)+1;if(fs.some(f=>SIM.shipKnows(u,f)))known++;}
    const seq=[...new Set(u.facts.filter(f=>BR.concat(['faith_schism']).includes(f.type)&&lin.has(+String(f.target).split(':')[1])&&f.y<=t0+1500).map(f=>f.type.replace('faith_','')))];seq.forEach(t=>reach[t]=(reach[t]||0)+1);const key=seq.slice(0,3).join('>')||'(无)';paths[key]=(paths[key]||0)+1;
    if(u.facts.some(f=>f.type==='warn_expo'&&lin.has(+String(f.target).split(':')[1])))warned++;
  } else {
    // 回访：先去远处，300~700 年后（按种子定）回来，再在附近转两站
    rn++;SIM.travel(u,far.id,'w0.9999');const back=300+(k*137%400);SIM.hibernate(u,Math.max(50,Math.round(t0+back-u.time-u.D[far.id][sid])));
    let met=null;const look=rep=>{const fid=Object.keys(u.evCount||{}).filter(id=>MEET.test(id)&&u.evCount[id]>0);return fid;};
    const before=JSON.stringify(u.evCount||{});
    const rr=SIM.travel(u,sid,'w0.9999');const opt=rr.report.encounter&&rr.report.encounter.options.find(o=>/^@rel\./.test(o.id));if(opt)SIM.interact(u,sid,opt.id);
    const ids=look();const prev=JSON.parse(before);const newIds=ids.filter(id=>(u.evCount[id]||0)>(prev[id]||0));
    if(newIds.length){rmeet++;newIds.forEach(id=>meetBy[id]=(meetBy[id]||0)+1);}
  }}
}
const P=x=>(100*x/Math.max(1,n)).toFixed(0)+'%';
console.log('样本',n,'；300 年内灭亡',dead300,'；1500 年内灭亡',dead1500);
console.log('中段兑现（1500 年内出现分支史实）',pay,'('+P(pay)+')；其中飞船按光延迟已知',known,'('+P(known)+')；出现「坐标变亮」预警',warned);
console.log('首个分支：',JSON.stringify(byType));
console.log('各节点到达率：',Object.entries(reach).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+P(v)).join('，'));
const ps=Object.entries(paths).sort((a,b)=>b[1]-a[1]);console.log('路线（前三步）：'+ps.length+' 种不同路线；最常见的一条占 '+P(ps[0][1])+'；前五：'+ps.slice(0,5).map(([k,v])=>k+' '+v).join('，'));
console.log('回访样本',rn,'；回访时遇到剧情场景',rmeet,'('+(100*rmeet/Math.max(1,rn)).toFixed(0)+'%)',JSON.stringify(meetBy));
