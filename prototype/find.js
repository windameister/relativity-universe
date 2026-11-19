// 搜索适合截图的场景（与页面 plan 参数同样的调用序列，结果确定）
const fs=require('fs');const src=fs.readFileSync(__dirname+'/index.html','utf8').match(/<script id="sim">([\s\S]*?)<\/script>/)[1];const m={exports:{}};new Function('module',src)(m);const S=m.exports;
function run(seed,steps){const u=S.createUniverse(seed);S.remember(u,0);let last;steps.forEach((st,k)=>{last=S.travel(u,st[0],st[1]);if(k<steps.length-1&&st[2])S.interact(u,last.report.sysId,st[2]);});return {u,last};}
const want=process.argv[2];
for(let k=0;k<400;k++){const seed='s'+k;const u0=S.createUniverse(seed);
  const civs=u0.civs.filter(c=>c.home!==0);
  if(want==='adv'){ // 先进：被抽取+扣留
    const hi=civs.find(c=>c.tech>=50); if(!hi)continue; const steps=[[hi.home,'w0.9999']];
    const {last}=run(seed,steps);const E=last.report.encounter; if(E.tier==='先进'&&(E.extracted||E.detained)){console.log(seed+' plan='+hi.home+':w0.9999');break;}}
  if(want==='echo'){ // 给落后文明大量技术，之后回来对方已反超且记得你是恩人
    const lo=civs.find(c=>c.tech>=10&&c.tech<35); if(!lo)continue; const far=u0.systems.filter(s=>s.id!==lo.home).sort((a,b)=>u0.D[lo.home][b.id]-u0.D[lo.home][a.id])[0].id;
    const mid=u0.systems.filter(s=>s.id!==lo.home&&u0.D[lo.home][s.id]>70&&u0.D[lo.home][s.id]<130)[0]; if(!mid)continue; const steps=[[lo.home,'w0.9999','大量技术'],[mid.id,'w0.9999'],[lo.home,'w0.9999']];
    const {last}=run(seed,steps);const r=last.report,E=r.encounter; if(r.encounter.tag==='恩人'&&E.att>=0.4&&(E.tier==='先进'||E.tier==='对等')&&!r.now.dead){console.log(seed+' plan='+steps.map(s=>s.join(':')).join(',')+' tier='+E.tier+' lines='+r.lines.map(l=>l.t).join('|'));break;}}
}
