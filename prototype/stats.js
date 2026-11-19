const fs=require('fs');const html=fs.readFileSync(__dirname+'/index.html','utf8');
const src=html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1];const m={exports:{}};new Function('module',src)(m);const SIM=m.exports;
const Y=+process.argv[2]||500; const cnt={};
for(let k=0;k<60;k++){const u=SIM.createUniverse('s'+k);SIM.simulateTo(u,Y);
 u.systems.forEach(s=>s.timeline.forEach(e=>{const key=e.t.replace(/「[^」]*」/g,'X').replace(/[\d.]+/g,'N').slice(0,14); cnt[key]=(cnt[key]||0)+1;}));}
Object.entries(cnt).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log((v/60).toFixed(2),k));
