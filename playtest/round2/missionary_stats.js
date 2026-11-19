// 统计：对一个落后文明「假扮神明」后，宗教回响能走到第几步、文明能活多久（曲率到访，立刻离开去远处，再推 1500 年）
const SIM=require('./lib.js')(process.argv[2]);
const stage=[0,0,0,0,0];let n=0,dead300=0,dead1500=0,found=0;const stText=[/成了他们的国教/,/分裂成/,/射电望远镜/,/使者号/];
for(let k=0;k<300;k++){const u=SIM.createUniverse('m'+k);SIM.remember(u,0);
 const c=u.civs.find(c=>c.home!==0&&c.tech>=8&&c.tech<40);if(!c)continue;const sid=c.home;
 const r=SIM.travel(u,sid,'w0.9999');const E=r.report.encounter;if(!E.options.some(o=>o.id==='假扮神明'))continue;
 SIM.interact(u,sid,'假扮神明');n++;const t0=u.time;const cid=u.systems[sid].owner;
 const far=u.systems.filter(s=>s.owner==null&&s.id!==sid).sort((a,b)=>u.D[sid][b.id]-u.D[sid][a.id])[0];SIM.travel(u,far.id,'w0.9999');
 SIM.simulateTo(u,t0+300);const cc=u.civs[cid];if(!cc.alive)dead300++;SIM.simulateTo(u,t0+1500);if(!cc.alive)dead1500++;
 const tl=u.systems[sid].timeline.filter(e=>e.you).map(e=>e.t);let s=0;stText.forEach((re,i)=>{if(tl.some(t=>re.test(t)))s=i+1;});stage[s]++;
 if(u.systems.some(x=>x.timeline.some(e=>/找到了「/.test(e.t))))found++;}
console.log('样本',n,'；300 年内灭亡',dead300,'；1500 年内灭亡',dead1500);
console.log('宗教回响最远走到：无',stage[0],'/ 国教',stage[1],'/ 分裂',stage[2],'/ 射电呼唤',stage[3],'/ 使者号',stage[4],'；信徒舰队找到飞船',found);
