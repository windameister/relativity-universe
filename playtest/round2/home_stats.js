// 统计：母星（太阳）600 年内被打击（光粒/二向箔）的概率：开局曲率出发一次 vs 原地冬眠不动 vs 常规推进出发
const SIM=require('./lib.js')(process.argv[2]);
function run(kind){let hit=0,n=0;for(let k=0;k<200;k++){const u=SIM.createUniverse('h'+k);SIM.remember(u,0);
 const far=u.systems.filter(s=>s.owner==null&&s.id!==0).sort((a,b)=>u.D[0][b.id]-u.D[0][a.id])[0];
 if(kind==='warp'){SIM.travel(u,far.id,'w0.9999');}else if(kind==='conv'){SIM.travel(u,far.id,'0.03');}
 SIM.simulateTo(u,600); n++; if(u.systems[0].timeline.some(e=>/光粒|二向箔/.test(e.t)&&e.y<=600))hit++;}
 return kind+': 太阳 600 年内被打击 '+hit+'/'+n;}
['stay','warp'].forEach(k=>console.log(run(k)));
