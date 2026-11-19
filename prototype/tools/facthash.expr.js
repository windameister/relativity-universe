// 同一段表达式既在 Node（SIM 为 simload 结果）又在 Chrome（页面里的全局 SIM）里求值，用来比对两边的事实日志/事件/卡片是否逐字相同
(function(){var out=[];['alpha','boom3','sleep4','god2','cautious1','dip7'].forEach(function(sd){var u=SIM.createUniverse(sd);SIM.remember(u,0);
var ids=u.systems.map(function(s){return s.id;});for(var i=0;i<10&&!u.ship.dead;i++){var d=ids[(i*7+3)%ids.length];if(d===u.ship.at)d=ids[(d+1)%ids.length];var r=i%4===3?SIM.hibernate(u,300):SIM.travel(u,d,i%3?'w0.9999':'0.03');var o=r.report.encounter.options.filter(function(x){return x.id!=='离开'&&x.id!=='广播坐标';});if(o.length)SIM.interact(u,r.report.sysId,o[i%o.length].id);}
SIM.simulateTo(u,u.time+2000);
var fs=u.facts.map(function(f){return f.y.toFixed(4)+f.type+f.actor+'>'+f.target+'@'+f.sys;}).join(';'),cs=u.cards.map(function(c){return c.y.toFixed(4)+c.title;}).join(';');
var h=2166136261,str=fs+'#'+cs+'#'+u.ship.tech.toFixed(9)+u.ship.supply.toFixed(9)+u.strikes.length;for(var k=0;k<str.length;k++){h^=str.charCodeAt(k);h=Math.imul(h,16777619)>>>0;}
out.push(sd+':'+u.facts.length+'f:'+u.cards.length+'c:'+h.toString(16));});return out.join(' ');})()
