// 事件库源文件（数据，不是模拟代码）。改完运行 `node events/events_src.js` 把它嵌进 index.html，
// 再跑 `node tools/evcheck.js` 检查。字段说明见 EVENT_LIBRARY_DESIGN.md 第 3 节；本文件用到的条件 / 操作符：
//   条件：fact / noFact（史实查询，默认按光延迟只匹配主体已经知道的）、stat、temper、earth、alive、rel、any/all/not、since、
//         flag/noflag、homeSeen、shipKnows、near、here、tier、scene、diaspora、reach（物理可达）、atWar、bind、calc
//   操作符：add / set / expo / imprint / ship / rel / strike / protect / refugees / forbid / leak / pass / silence / evacuate
//   触发：year（逐年，need 预筛）| pending（由 unlock 排期）| fact:<类型> | arrival | recognize | report | choice（选项结果）
const H = ['god','ally','gift_l','warned','teach','trade','gift_s','learn','courier','relic','scholar','starmap'];
const WARM = ['echo.ally.berth','echo.ally.festival','echo.trade.prosper','echo.teach.institute'];
const E = [];
const ev = o => E.push(o);
const helpQ = (as, extra) => Object.assign({ type: H, target: '$c', actor: 'ship', known: 'any', as }, extra || {});

/* ---------------- 回响：按关系类型去重，每类每个文明只出一次 ---------------- */
ev({ id: 'echo.gift_s.medicine', on: 'year', need: ['gift_s'], when: [{ fact: { type: 'gift_s', target: '$c', actor: 'ship', as: 'g' } }, { since: { as: 'g', min: 15 } }, { stat: 'c.tech', gte: 8 }],
  p: 0.02, once: 'subject', echo: true, thread: 'g', emit: { type: 'echo_gs1' },
  text: { log: ['「{civ}」的医书写道：疫苗和高产作物源自{g.y}一位「天上来的医生」。',
    '「{civ}」的孩子们在课本里读到：{g.y}，一艘飞船留下了{g.d.what}，[那一年之后婴儿死亡率减半|从此饥荒再没有回来过]。',
    '「{civ}」的乡下还流传着「{shipBase}种」稻谷的说法——据说种子是{g.y}从天上带来的。'] } });
ev({ id: 'echo.gift_s.observatory', on: 'year', need: ['echo_gs1'], when: [{ fact: { type: 'echo_gs1', target: '$c', as: 'e' } }, { since: { as: 'e', min: 40 } }, { stat: 'c.tech', gte: 30 }],
  p: 0.01, once: 'subject', echo: true, emit: { type: 'echo_gs2' },
  text: { log: ['「{civ}」建成了一座以你的飞船命名的天文台——「{shipBase}天文台」。',
    '「{civ}」第一座射电天文台的奠基石上刻着：献给{ship}，它让我们[学会了抬头|知道天上有人]。',
    '「{civ}」的天文学家把你离开的方向命名为「医生之路」，望远镜一直对着那里。'] } });

ev({ id: 'echo.gift_l.history', on: 'year', need: ['gift_l'], when: [{ fact: { type: 'gift_l', target: '$c', actor: 'ship', as: 'g' } }, { since: { as: 'g', min: 15 } }],
  p: 0.03, once: 'subject', echo: true, thread: 'g', emit: { type: 'echo_gl1' },
  text: { log: ['「{civ}」的科技史把那次大跃进追溯到{g.y}：你留下的{g.d.what}，成了他们所有学科的源头。',
    '「{civ}」的大学里，每个一年级学生都要背诵{g.y}那份「天外手稿」的目录。',
    '「{civ}」的历史学家把{g.y}称作「第二次开天」：那天之后，他们一口气跳过了[三个|好几个]时代。'] } });
ev({ id: 'echo.gift_l.warpship', on: 'year', need: ['echo_gl1'], when: [{ fact: { type: 'echo_gl1', target: '$c' } }, { fact: { type: 'gift_l', target: '$c', actor: 'ship', as: 'g' } }, { stat: 'c.tech', gte: 55 }],
  p: 0.02, once: 'subject', echo: true, thread: 'g', emit: { type: 'echo_gl2' },
  text: { log: ['「{civ}」的第一艘曲率舰下水，舰名就叫「{ship}」。',
    '「{civ}」在{istar}跨入星海。首航舰的船舱里挂着一幅画：{g.y}降落在他们平原上的那艘小飞船。',
    '「{civ}」的第一支曲率舰队以你的名字编号：「{shipBase}一号」到「{shipBase}十二号」。'] } });
ev({ id: 'echo.gift_l.seek', on: 'year', need: ['echo_gl2'], when: [{ fact: { type: 'echo_gl2', target: '$c', as: 'e' } }, { since: { as: 'e', min: 20 } }, { stat: 'att', gte: 0.3 }, { noFact: { type: ['butcher', 'ally_war'], target: '$c' } }],
  p: 0.01, once: 'subject', echo: true, emit: { type: 'seek_ship' },
  text: { log: ['「{civ}」派出一艘侦察舰，沿着{ship}当年离开的方向寻找它。', '「{civ}」的议会通过决议：如果在星海里遇见{ship}，要以国宾之礼相待。'] } });
ev({ id: 'echo.gift_l.weapon', on: 'year', need: ['echo_gl2'], when: [{ fact: { type: 'echo_gl2', target: '$c', as: 'e' } }, { since: { as: 'e', min: 30 } }, { atWar: true }],
  p: 0.01, once: 'subject', echo: true, forbid: ['echo.gift_l.debate'], emit: { type: 'echo_gl3', tags: ['war'] },
  text: { log: ['「{civ}」用你当年留下的理论造出了新武器，投入了战争。', '「{civ}」的战舰上，引擎的铭牌写着「{shipBase}式」。你教给他们的方程，现在用来瞄准别人。'] } });
ev({ id: 'echo.gift_l.debate', on: 'year', need: ['echo_gl1'], when: [{ fact: { type: 'echo_gl1', target: '$c', as: 'e' } }, { since: { as: 'e', min: 120 } }],
  p: 0.004, once: 'subject', echo: true, forbid: ['echo.gift_l.weapon'], emit: { type: 'echo_gl3' },
  text: { log: ['「{civ}」的学者为「那份礼物究竟是恩赐还是诅咒」争论了几百年。', '「{civ}」出现了一个「自主派」：他们主张烧掉天外手稿，靠自己重新发现一切。', '「{civ}」的哲学家写道：我们没有走过的路，终究要用别的方式补上。'] } });

ev({ id: 'echo.teach.textbook', on: 'year', need: ['teach'], when: [{ fact: { type: 'teach', target: '$c', actor: 'ship', as: 't' } }, { since: { as: 't', min: 15 } }],
  p: 0.02, once: 'subject', echo: true, thread: 't', emit: { type: 'echo_te1' },
  text: { log: ['「{civ}」的教科书里有一章叫「{shipBase}补遗」：{t.y}和一艘外来飞船交换来的{t.d.what}。',
    '「{civ}」的工程师至今还在用一个以你命名的常数——「{shipBase}系数」，来自{t.y}那次技术交换。',
    '「{civ}」的科学院档案里，{t.y}那次交换被记作「第一次跨文明联合研究」。'] } });
ev({ id: 'echo.teach.institute', on: 'year', need: ['echo_te1'], when: [{ fact: { type: 'echo_te1', target: '$c', as: 'e' } }, { since: { as: 'e', min: 80 } }, { noFact: { type: ['butcher', 'ally_war'], target: '$c' } }],
  p: 0.006, once: 'subject', echo: true,
  text: { log: ['「{civ}」成立了「{shipBase}研究所」，专门研究外来文明的物理学。', '「{civ}」每隔十年就向你离开的方向发一份新的论文摘要，标题永远是「给{ship}的回信」。'] } });
ev({ id: 'echo.learn.student', on: 'year', need: ['learn'], when: [{ fact: { type: 'learn', target: '$c', actor: 'ship', as: 't' } }, { since: { as: 't', min: 15 } }],
  p: 0.015, once: 'subject', echo: true,
  text: { log: ['「{civ}」的老学者们还记得{t.y}来求教的那艘小飞船——他们管它叫「学徒号」。', '「{civ}」的大学把{t.y}那次授课的录像放进了公开课：「如何给一个原始文明讲物理」。', '「{civ}」流传着一个笑话：连{ship}都学会了，你怎么还不会？'] } });

ev({ id: 'echo.trade.route', on: 'year', need: ['trade'], when: [{ fact: { type: 'trade', target: '$c', actor: 'ship', as: 't' } }, { flag: 't.data.route' }, { since: { as: 't', min: 15 } }],
  p: 0.02, once: 'subject', echo: true, thread: 't', forbid: ['echo.trade.goods'], emit: { type: 'echo_tr1' },
  text: { log: ['「{civ}」与「{t.d.route}」之间的贸易航线还在运营，第一张航线图上标着：{ship}开辟，{t.y}。',
    '「{civ}」的港口还挂着{t.y}那条航线的通航纪念牌：「{ship}」，从这里到「{t.d.route}」。',
    '「{civ}」的商船队每年都沿着你开的那条航线驶向「{t.d.route}」，船员管它叫「{shipBase}航道」。'] } });
ev({ id: 'echo.trade.goods', on: 'year', need: ['trade'], when: [{ fact: { type: 'trade', target: '$c', actor: 'ship', as: 't' } }, { since: { as: 't', min: 15 } }],
  p: 0.015, once: 'subject', echo: true, forbid: ['echo.trade.route'], emit: { type: 'echo_tr1' },
  text: { log: ['「{civ}」的集市上至今还卖着仿制的「{ship}」模型。', '「{civ}」的商会章程第一页写着：{t.y}，我们和一艘过路的飞船做成了第一笔星际生意。', '「{civ}」的厨子们还在做一道「旅人汤」，据说配方是{t.y}从那艘飞船上换来的。'] } });
ev({ id: 'echo.trade.prosper', on: 'year', need: ['echo_tr1'], when: [{ fact: { type: 'echo_tr1', target: '$c', as: 'e' } }, { since: { as: 'e', min: 60 } }, { noFact: { type: ['butcher', 'ally_war'], target: '$c' } }],
  p: 0.006, once: 'subject', echo: true,
  text: { log: ['靠那条航线发家的商会成了「{civ}」最有势力的家族，他们的徽章是一艘小飞船。', '「{civ}」的经济史把你开通航线的那一年当作「远洋时代」的起点。'] } });

ev({ id: 'echo.ally.berth', on: 'year', need: ['ally'], when: [{ fact: { type: 'ally', target: '$c', actor: 'ship', as: 'a' } }, { since: { as: 'a', min: 10 } }, { noFact: { type: ['butcher', 'ally_war'], target: '$c' } }],
  p: 0.025, once: 'subject', echo: true, thread: 'a', emit: { type: 'echo_al1' },
  text: { log: ['「{civ}」的港口为「{ship}」保留着一个泊位，铭牌上写着：盟友，{a.y}。',
    '「{civ}」的舰队旗舰上一直挂着两面旗：他们自己的，和{a.y}盟约上你画的那面。',
    '「{civ}」的外交部门口立着一块碑，刻着{a.y}盟约的全文，最后一行是「{ship}」的签名。'] } });
ev({ id: 'echo.ally.festival', on: 'year', need: ['echo_al1'], when: [{ fact: { type: 'echo_al1', target: '$c', as: 'e' } }, { fact: { type: 'ally', target: '$c', actor: 'ship', as: 'a' } }, { since: { as: 'e', min: 40 } }, { noFact: { type: ['butcher', 'ally_war'], target: '$c' } }],
  p: 0.008, once: 'subject', echo: true,
  text: { log: ['「{civ}」把与你结盟的那一天定为节日：「盟约日」。', '每到盟约日，「{civ}」的孩子们会向夜空放飞纸做的小飞船，朝着你离开的方向。', '「{civ}」的老兵说，{a.y}那份盟约救过他们不止一次。'] } });

ev({ id: 'echo.starmap.trade', on: 'year', need: ['starmap'], when: [{ fact: { type: 'starmap', target: '$c', actor: 'ship', as: 's' } }, { since: { as: 's', min: 15 } }],
  p: 0.02, once: 'subject', echo: true,
  text: { log: ['「{civ}」的商人用你{s.y}交出的星图做起了生意：航线图上，你去过的每一个星系都标着价钱。',
    '「{civ}」的测绘局把你{s.y}交出的星图叫作「{shipBase}底图」，至今还在用。',
    '「{civ}」的探险家沿着你星图上的标记，一个个拜访了你去过的地方。'] } });
ev({ id: 'echo.extract.archive', on: 'year', need: ['extract'], when: [{ fact: { type: 'extract', actor: '$c', target: 'ship', as: 's' } }, { since: { as: 's', min: 20 } }],
  p: 0.01, once: 'subject', echo: true,
  text: { log: ['「{civ}」的情报档案里，有一份{s.y}从外来飞船导航库里抽出来的星图，太阳被画了一个红圈。', '「{civ}」的战略学院至今还在分析{s.y}截获的那份星图。'] } });
ev({ id: 'echo.courier.meeting', on: 'year', need: ['courier'], when: [{ fact: { type: 'courier', target: '$c', actor: 'ship', as: 'm' } }, { since: { as: 'm', min: 10 } }],
  p: 0.02, once: 'subject', echo: true,
  text: { log: ['你送达的那封信，促成了「{civ}」与「{m.d.other}」的第一次正式会面。', '「{civ}」与「{m.d.other}」的外交史从{m.y}的一封信开始，送信的是{ship}。'] } });
ev({ id: 'echo.relic.museum', on: 'year', need: ['relic'], when: [{ fact: { type: 'relic', target: '$c', actor: 'ship', as: 'r' } }, { since: { as: 'r', min: 10 } }],
  p: 0.02, once: 'subject', echo: true,
  text: { log: ['你的飞船模型成了「{civ}」国家博物馆的镇馆之宝，每年有上亿人排队参观。', '「{civ}」的博物馆至今还保留着{r.y}那个展位，牌子上写着：「{ship}，活着的古董，已离开」。', '「{civ}」的孩子们玩一种游戏：一个人扮冬眠的舰员，其他人扮排队看展的游客。'] } });
ev({ id: 'echo.scholar.book', on: 'year', need: ['scholar'], when: [{ fact: { type: 'scholar', target: '$c', actor: 'ship', as: 'r' } }, { since: { as: 'r', min: 10 } }],
  p: 0.02, once: 'subject', echo: true,
  text: { log: ['「{civ}」的学者根据对你的研究写出了一部《原始曲率飞船考》，至今仍被人翻阅。', '「{civ}」的档案馆里，你那卷口述史被翻译成了[十几|几十]种语言。', '「{civ}」的语言学家从你的航行日志里复原了「地球语」的语法。'] } });
ev({ id: 'echo.detained.log', on: 'year', need: ['detained'], when: [{ fact: { type: 'detained', target: '$c', actor: 'ship', as: 'h' } }, { since: { as: 'h', min: 10 } }, { noFact: { type: 'hostile', target: '$c', actor: 'ship' } }],
  p: 0.02, once: 'subject', echo: true,
  text: { log: ['「{civ}」的档案馆里还存着{h.y}扣押{ship}时抄下的航行日志，编号很靠后，几乎没人借阅。', '「{civ}」的一位历史学家写了本小书，题目是《我们为什么扣下了{ship}》。结论是：没有理由，只是习惯。', '「{civ}」的港口条例里多了一条注释：「参见{h.y}外来飞船扣押案」。'] } });
ev({ id: 'echo.hostile.academy', on: 'year', need: ['hostile'], when: [{ fact: { type: 'hostile', target: '$c', actor: 'ship', as: 'h' } }, { since: { as: 'h', min: 10 } }],
  p: 0.02, once: 'subject', echo: true, emit: { type: 'echo_ho1' },
  text: { log: ['「{civ}」的军事学院把「{shipBase}事件」写进了教材，作为外来威胁的经典案例。', '「{civ}」的边防条例第一条：遇到与{ship}特征相符的飞船，立即上报。', '「{civ}」的历史课说，{h.y}那艘外来飞船曾{h.act}，从此他们不再相信陌生人。'] } });
ev({ id: 'echo.hostile.patrol', on: 'year', need: ['echo_ho1'], when: [{ fact: { type: 'echo_ho1', target: '$c', as: 'e' } }, { since: { as: 'e', min: 30 } }, { stat: 'c.tech', gte: 55 }],
  p: 0.01, once: 'subject', echo: true, emit: { type: 'seek_revenge' },
  text: { log: ['「{civ}」的巡逻舰开始在已知星域的边缘搜寻一艘与「{ship}」特征相符的飞船。', '「{civ}」悬赏寻找{ship}：活要见船，死要见残骸。'] } });
ev({ id: 'echo.told.home', on: 'year', need: ['told'], when: [{ fact: { type: 'told', target: '$c', actor: 'ship', as: 't' } }, { since: { as: 't', min: 20 } }, { earth: '$c' }],
  p: 0.015, once: 'subject', echo: true,
  text: { log: ['「{civ}」的孩子们还在读{t.y}那本《{ship}航行记》。', '「{civ}」的星图上，你{t.y}带回的那些星系都标着一个小小的船形记号。'] } });

/* ---------------- 间接责任：你帮过的文明清理了别人 ---------------- */
ev({ id: 'echo.enabled_gift', on: 'fact:cleared', subject: 'actor', when: [{ bind: { as: 'h', from: 'f.data.help' } }, { any: [{ stat: 'h.type', eq: 'gift_l' }, { stat: 'h.type', eq: 'gift_s' }] }, { noFact: { type: 'butcher', target: '$c', maxAge: 0 } }],
  echo: true, nocap: true, imp: 3,
  text: { log: ['你{h.n} 年给的{h.d.what}让「{civ}」在{istar}进入星海；{f.y}，他们[的深空监听网发现了|盯上了]「{f.d.victim}」，随即清理了它。',
    '「{civ}」清理了「{f.d.victim}」（{f.y}）。他们能走到这一步，起点是{h.y}你留下的{h.d.what}。'] } });
ev({ id: 'echo.enabled_bond', on: 'fact:cleared', subject: 'actor', when: [{ bind: { as: 'h', from: 'f.data.help' } }, { not: { any: [{ stat: 'h.type', eq: 'gift_l' }, { stat: 'h.type', eq: 'gift_s' }] } }, { noFact: { type: 'butcher', target: '$c', maxAge: 0 } }],
  echo: true, nocap: true, imp: 3,
  text: { log: ['{h.y}你曾{h.act}，让「{civ}」更快地强大起来；{f.y}，他们清理了「{f.d.victim}」。', '「{civ}」的深空监听网在{f.y}发现了「{f.d.victim}」，然后把它抹掉了。{h.y}，你曾{h.act}。'] } });

/* ---------------- 链 A：盟友 / 贸易伙伴变成屠夫，或与母星开战 ---------------- */
ev({ id: 'ally.butcher', on: 'fact:cleared', subject: 'actor', when: [{ fact: { type: ['ally', 'trade', 'teach'], target: '$c', actor: 'ship', known: 'any', as: 'h' } }],
  once: 'subject', echo: true, nocap: true, imp: 3, forbid: WARM, emit: { type: 'butcher', data: { victim: '{f.d.victim}', what: '他们向「{f.d.victim}」射出了光粒' } },
  text: { log: ['「{civ}」清理了「{f.d.victim}」。{h.y}你曾{h.act}；如今，他们也成了黑暗森林里的猎手。{v.why}',
    '{f.y}，「{civ}」向「{f.d.victim}」射出了光粒。你还记得{h.y}{h.act}时的样子。{v.why}'] },
  pre: [{ calc: 'why' }],
  card: { cls: 'bad', w: 7, title: '你的{h.d.rel}伙伴成了屠夫：「{civ}」', body: '你看到的是{f.y}的光：「{civ}」清理了「{f.d.victim}」。{h.y}，你曾{h.act}。{v.why}' } });
ev({ id: 'ally.war_home', on: 'fact:war', subject: 'either', when: [{ earth: '$o' }, { earth: '$c', is: false }, { fact: { type: ['ally', 'trade'], target: '$c', actor: 'ship', known: 'any', as: 'h' } }],
  once: 'subject', echo: true, nocap: true, imp: 3, forbid: WARM, emit: { type: 'ally_war', data: { other: '{other}', what: '他们向「{other}」开战' } },
  text: { log: ['「{civ}」与「{other}」开战了。{h.y}你替他们和母星牵起的{h.d.rel}之约，没能挡住这场战争。', '{f.y}，「{civ}」的舰队驶向太阳系。{h.y}你曾{h.act}；现在他们与你的母星成了敌人。'] },
  card: { cls: 'bad', w: 6, title: '「{civ}」向母星开战', body: '你看到的是{f.y}的光：「{civ}」与「{other}」开战了。{h.y}，你曾{h.act}。' } });
ev({ id: 'ally.confront', on: 'arrival', subject: 'here', when: [{ fact: { type: ['butcher', 'ally_war'], target: '$c', known: 'ship', as: 'b' } }, { fact: helpQ('h') }, { not: { scene: ['故人', '故人·怨', '故人·求'] } }],   // 一次到访只演一场「认出你」
  once: 'subject', cls: 'warn', scene: '旧盟',
  text: { show: ['你认识的「{civ}」已经不是当年那个{h.d.rel}伙伴了（{h.y}）：{b.y}，{b.d.what}。舰桥上，他们的使节在等你开口。', '「{civ}」认出了{ship}。{h.y}你曾{h.act}；{b.y}，{b.d.what}。他们知道你看到了。'] },
  options: [
    { id: 'ally.mediate', label: '调停：劝他们与母星[停战|讲和]', desc: '以老朋友的身份去谈。成功与否取决于他们还念不念旧情。', when: [{ fact: { type: 'ally_war', target: '$c', known: 'ship' } }, { alive: 'home' }] },
    { id: 'ally.question', label: '质问：他们为什么这么做', desc: '听听他们自己的说法。', when: [{ fact: { type: 'butcher', target: '$c', known: 'ship' } }] },
    { id: 'ally.side', label: '站在他们一边', desc: '他们会善待你。母星的档案会记下这件事。' },
    { id: 'ally.retaliate', label: '报复：向全宇宙广播他们的坐标', desc: '黑暗森林式的报复。歌者迟早会看到；他们也会恨你到底。' }] });
// 调停：战争还在打 → 停火；战争已经停了（停战 / 和约之间）→ 把停火变成正式的和约。两种都写 mediated，由母星档案（home.dossier）和停火纪念（echo.mediated.memorial）读取
ev({ id: 'ally.mediate', on: 'choice', when: [{ alive: 'home' }], outcomes: [
  { when: [{ rel: { with: 'home', type: '战争' } }], p: 0.45, mod: [{ if: { stat: 'att', gte: 0.3 }, x: 1.6 }, { if: { temper: ['好战'] }, x: 0.5 }], cls: 'good',
    effects: [{ op: 'rel', with: 'home', type: '停战' }, { op: 'imprint', v: 0.1 }], emit: { type: 'mediated', data: { how: 'ceasefire' } }, echo: true, imp: 3,
    log: ['在{ship}的斡旋下，「{civ}」与「{home}」签下了停火协议。'], result: '你们谈了整整一年。最后他们同意停火：为了{h.y}那份{h.d.rel}之约，也为了你。「{civ}」与「{home}」的战争暂时停了下来。' },
  { when: [{ rel: { with: 'home', type: '战争' } }], cls: 'bad', effects: [{ op: 'imprint', v: -0.3 }], emit: { type: 'mediate_failed' }, expel: true,
    result: '他们听你说完，只回了一句：「这不关你的事。」你被礼貌而坚决地请出了星系。战争还在继续。' },
  { p: 0.7, mod: [{ if: { stat: 'att', gte: 0.3 }, x: 1.3 }], cls: 'good', effects: [{ op: 'rel', with: 'home', type: '贸易' }, { op: 'imprint', v: 0.1 }], emit: { type: 'mediated', data: { how: 'treaty' } }, echo: true, imp: 3,
    log: ['{ship}在「{civ}」与「{home}」之间奔走，把一纸停火变成了正式的和约。'], result: '仗已经停了，但两边只是各自收兵，谁也没签字。你在两边之间来回跑了一年，最后把停火变成了一份正式的和约，商船可以重新开过去了。' },
  { cls: 'warn', effects: [{ op: 'imprint', v: -0.1 }], emit: { type: 'mediate_failed' },
    result: '「仗已经打完了，」他们说，「用不着一艘外来的飞船替我们记账。」你没能让他们签字。' }] });
ev({ id: 'echo.mediated.memorial', on: 'year', need: ['mediated'], when: [{ fact: { type: 'mediated', target: '$c', actor: 'ship', known: 'any', as: 'm' } }, { since: { as: 'm', min: 30 } }, { noFact: { type: 'butcher', target: '$c' } }],
  p: 0.01, once: 'subject', echo: true,
  text: { log: ['「{civ}」在边境上立了一块碑，纪念{m.y}那场没有再打下去的战争。碑文的最后一行是{ship}的名字。', '「{civ}」与「{home}」的边境哨所之间，每年都会交换一次礼物。这个习惯始于{m.y}，始于{ship}。'] } });
ev({ id: 'ally.question', on: 'choice', outcomes: [
  { cls: 'warn', pre: [{ calc: 'why' }], effects: [{ op: 'imprint', v: -0.05 }], emit: { type: 'questioned' },
    result: '他们给你看了监听记录：「{b.d.victim}」的坐标在深空里亮了很久。「不是我们，也会是别人。」他们说，「这片森林里，先开枪的才能活下来。」{v.why}' }] });
ev({ id: 'ally.side', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'imprint', tag: '盟友', v: 0.3 }, { op: 'ship', supply: 40, tech: 3 }], emit: { type: 'sided' }, echo: true, imp: 3,
    log: ['{ship}在「{civ}」最孤立的时候站在了他们一边。「{home}」的档案里，这艘船从此多了一个词：叛徒。'],
    result: '你留下来，和他们站在一起。他们把你的货舱装满（补给 {v.supply}，飞船科技 {v.tech}）。消息会以光速传回母星——那里会有人记住这件事。' }] });
ev({ id: 'ally.retaliate', on: 'choice', outcomes: [
  { cls: 'bad', effects: [{ op: 'expo', at: 'c.home', kind: 'bcast', v: 3 }, { op: 'imprint', tag: '入侵者', v: -0.9 }], emit: { type: 'retaliated', tags: ['player', 'harm'] }, echo: true, imp: 3, expel: true,
    log: ['{ship}向全宇宙广播了「{civ}」母星的坐标。'],
    result: '你把「{civ}」母星的坐标射向了全宇宙。这道光要走几十到几百年才会被星图之外的清理者看到。他们的舰队把你赶出了星系，从此你在他们的档案里只有一个名字：入侵者。' }] });

/* ---------------- 链 B：母星成了猎手 ---------------- */
ev({ id: 'home.hunter_map', on: 'fact:cleared', subject: 'actor', when: [{ earth: '$c' }, { stat: 'f.data.kind', eq: 'map' }, { fact: { type: 'told', target: '$c', actor: 'ship', known: 'any', as: 't' } }],
  once: 'subject', echo: true, nocap: true, imp: 3,
  text: { log: ['「{civ}」按你{t.y}带回的星图，找到并清理了「{f.d.victim}」。', '你{t.y}讲给母星的旅途见闻里有「{f.d.victim}」的坐标。{f.y}，「{civ}」用它射出了光粒。'] },
  card: { cls: 'bad', w: 6, key: 'home_hunter', title: '母星成了猎手', body: '你看到的是{f.y}的光：「{civ}」清理了「{f.d.victim}」。坐标来自你{t.y}带回母星的星图。' } });
ev({ id: 'home.hunter', on: 'fact:cleared', subject: 'actor', when: [{ earth: '$c' }, { not: { stat: 'f.data.kind', eq: 'map' } }],
  once: 'subject', imp: 3,
  text: { log: ['「{civ}」第一次向别的文明射出了光粒：目标是「{f.d.victim}」。', '{f.y}，「{civ}」的深空监听网发现了「{f.d.victim}」。议会只争论了三天。'] },
  card: { cls: 'bad', w: 4, key: 'home_hunter', title: '母星成了猎手', body: '你看到的是{f.y}的光：「{civ}」向「{f.d.victim}」射出了光粒。你出发时的那个文明，学会了黑暗森林的规矩。' } });
ev({ id: 'home.archive', on: 'arrival', subject: 'here', when: [{ earth: '$c' }, { calc: 'archive' }, { noFact: { type: 'archive_read', target: '$c', maxAge: 200 } }],
  cls: 'warn', text: { show: ['母星的档案馆向你开放了一份标着「深空清理记录」的卷宗。'] },
  options: [{ id: 'home.archive_read', label: '查阅母星的清理档案', desc: '看看你不在的这些年，母星对别的文明做了什么。' }] });
ev({ id: 'home.archive_read', on: 'choice', outcomes: [
  { cls: 'bad', pre: [{ calc: 'archive' }], emit: { type: 'archive_read' },
    result: '卷宗里一共 {v.archiveN} 条记录：{v.archive}。{v.archiveYou}' }] });
ev({ id: 'home.refugees', on: 'fact:cleared', subject: 'target', dead: true, when: [{ earth: '$o' }, { stat: 'c.peakTech', gte: 55 }],
  p: 0.75, once: 'subject', effects: [{ op: 'refugees', from: '$c', name: '遗民舰队' }],
  emit: { type: 'refugee_vow', target: 'spawned', data: { victim: '{civ}' } }, scope: 'spawned', imp: 3,
  text: { log: ['「{civ}」的遗民在流亡中立誓：总有一天，要让太阳也尝到光粒的滋味。', '「{civ}」的幸存者把那颗光粒的来向刻在旗舰的船首：太阳。'] } });
ev({ id: 'refugee.broadcast', on: 'year', need: ['refugee_vow'], when: [{ fact: { type: 'refugee_vow', target: '$c', as: 'r' } }, { since: { as: 'r', min: 100 } }, { stat: 'c.tech', gte: 50 }, { noFact: { type: 'apology', target: '$c' } }],
  p: 0.004, once: 'subject', imp: 3, effects: [{ op: 'expo', at: 'sun', kind: 'war', v: 3 }], emit: { type: 'refugee_bcast', actor: '$c', target: 'home' },
  text: { log: ['「{civ}」向全宇宙广播了太阳的坐标：这是「{r.d.victim}」的复仇。', '「{civ}」兑现了誓言：太阳的坐标被射向了深空的每一个方向。'] },
  card: { cls: 'bad', w: 7, title: '遗民广播了太阳的坐标', body: '你看到的是{year}的光：被母星清理的「{r.d.victim}」，它的遗民「{civ}」向全宇宙广播了太阳的坐标。' } });
ev({ id: 'refugee.intercept', on: 'arrival', subject: 'near', range: 130, when: [{ fact: { type: 'refugee_vow', target: '$c', as: 'r' } }, { reach: { as: 'r', speed: 0.9 } }, { stat: 'c.tech', gte: 55 }, { noFact: { type: ['apology', 'refugee_met'], target: '$c' } }],
  p: 0.6, once: 'subject', cooldownGroup: 'fleet', groupCooldown: 200, cls: 'bad', echo: true, emit: { type: 'refugee_met' },
  text: { show: ['「{civ}」截住了你。他们是{r.y}被母星清理的「{r.d.victim}」的遗民——而{ship}的船身上，印着太阳系的识别码。', '一支伤痕累累的舰队挡在航线上。「{civ}」：{r.y}，「{home}」的光粒落在了他们的故乡「{r.d.victim}」。他们认出了你从哪里来。'] },
  options: [
    { id: 'refugee.apologize', label: '替母星道歉', desc: '你不是开枪的人，但你来自那里。' },
    { id: 'refugee.flee', label: '强行突围', desc: '曲率引擎全开。可能逃得掉，也可能被打穿货舱。' }] });
ev({ id: 'refugee.apologize', on: 'choice', outcomes: [
  { p: 0.5, mod: [{ if: { fact: { type: 'archive_read', actor: 'ship', known: 'any' } }, x: 1.4 }], cls: 'good', emit: { type: 'apology' }, effects: [{ op: 'ship', supply: -10 }], echo: true, imp: 3,
    log: ['{ship}替「{home}」向「{civ}」道歉。遗民们放弃了广播太阳坐标的计划。'],
    result: '你讲了很久：你离开时母星是什么样子，你又在档案里读到了什么。他们的首领最后说：「我们不会忘记。但我们不会变成你们。」他们放你离开，也放弃了向全宇宙广播太阳坐标的计划。（补给 {v.supply}）' },
  { cls: 'bad', effects: [{ op: 'ship', supply: -35 }], emit: { type: 'refugee_spurned' },
    result: '「道歉？」他们打穿了你的货舱（补给 {v.supply}），然后让你走——好让你回去告诉太阳：他们还活着。' }] });
ev({ id: 'refugee.flee', on: 'choice', outcomes: [
  { p: 0.5, cls: 'warn', effects: [{ op: 'ship', supply: -15 }], result: '你全速冲出包围，只挨了几发擦边弹（补给 {v.supply}）。他们没有追——他们要找的从来不是你。' },
  { cls: 'bad', effects: [{ op: 'ship', supply: -35 }], result: '突围失败。他们打穿了货舱，把你扔在原地（补给 {v.supply}）。' }] });

/* ---------------- 链 C：流亡者 / 后代认出你 ---------------- */
ev({ id: 'recog.blame', on: 'recognize', subject: 'here', group: 'recog', when: [{ diaspora: true }, { fact: { type: 'cleared', target: '$c', known: 'any', as: 'k' } }, { flag: 'k.data.player' }],
  once: 'subject', cls: 'bad', scene: '故人·怨', imp: 3,
  text: { show: ['「{civ}」认出了{ship}。他们是「{k.d.victim}」的流亡者。档案里写着：{k.y}落下的{k.d.weapon}，是被{k.d.why}引来的。舰桥上没有人说话。', '「{civ}」的哨舰核对了你的识别码，然后整支舰队都转了过来。{k.y}，「{k.d.victim}」被抹掉——他们一直知道那是谁留下的痕迹：{k.d.why}。'] },
  options: [{ id: 'recog.apologize', label: '承认，并道歉', desc: '你无法弥补，但可以不再躲。' }, { id: 'recog.give_tech', label: '把飞船上的技术资料全给他们', desc: '飞船科技不会下降，但这是你能给的全部。' }] });
ev({ id: 'recog.apologize', on: 'choice', outcomes: [
  { p: 0.6, cls: 'warn', effects: [{ op: 'imprint', v: 0.25 }], emit: { type: 'apology' }, echo: true, log: ['{ship}向「{civ}」承认了当年的事。'], result: '你说完，很久没人开口。最后他们的长老说：「你走吧。我们会把这件事写下来：那艘船回来过，而且没有逃。」' },
  { cls: 'bad', effects: [{ op: 'imprint', v: -0.2 }, { op: 'ship', supply: -20 }], expel: true, result: '道歉换来的是一轮警告射击（补给 {v.supply}）。他们不需要你的道歉，只需要你离开。' }] });
ev({ id: 'recog.give_tech', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'imprint', v: 0.35 }, { op: 'add', path: 'c.tech', v: 1 }], emit: { type: 'reparation' }, echo: true, log: ['{ship}把全部技术资料交给了「{civ}」，作为迟到的赔偿。'], result: '他们收下了资料。没有道谢，但放你走时，哨舰朝你闪了三下灯——那是他们送别死者的方式。' }] });
ev({ id: 'recog.demand', on: 'recognize', subject: 'here', group: 'recog', when: [{ diaspora: true }, { fact: { type: 'cleared', target: '$c', known: 'any', as: 'k' } }, { noflag: 'k.data.player' }, { fact: helpQ('h') }],
  once: 'subject', cls: 'warn', scene: '故人·求', imp: 3,
  text: { show: ['「{civ}」认出了{ship}：{h.y}你曾{h.act}。如今他们是流亡者，{k.y}故乡被{k.d.weapon}毁掉。他们想要你的星图——想知道哪里还安全，以及那件武器是从哪里来的。', '「{civ}」把你请上旗舰。「你见过外面。」他们说，「{k.y}之后我们就一直在逃。把你的星图给我们。」'] },
  options: [{ id: 'recog.give_maps', label: '交出星图', desc: '你去过的每一个地方（包括太阳）都会在他们的地图上。' }, { id: 'recog.refuse', label: '拒绝', desc: '星图可能害死别人，也可能救他们。' }] });
ev({ id: 'recog.give_maps', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'leak', v: 0.4, also: 0.3 }, { op: 'imprint', tag: '恩人', v: 0.5 }, { op: 'ship', supply: 50, tech: 2 }, { op: 'pass', years: 300 }], emit: { type: 'starmap', actor: 'ship', tags: ['player', 'help'], data: { rel: '交出星图', what: '星图' } },
    result: '你交出了星图。他们回赠了补给和一些技术（补给 {v.supply}，飞船科技 {v.tech}），还有一张 300 年的通行证。「我们会记得，」他们说，「是你给我们指了路。」' }] });
ev({ id: 'recog.refuse', on: 'choice', outcomes: [
  { cls: 'dim', effects: [{ op: 'imprint', v: -0.2 }], expel: true, result: '他们没有强抢。流亡者已经没有力气再树一个敌人了。你离开时，他们的舰队还停在原地，像在等别的什么人。' }] });
ev({ id: 'recog.grateful', on: 'recognize', subject: 'here', group: 'recog', when: [{ fact: helpQ('h') }, { any: [{ diaspora: true }, { scene: ['冷漠'] }, { flag: 'c.parent' }] }, { noFact: { type: ['butcher', 'ally_war', 'retaliated', 'hostile'], target: '$c' } }],
  once: 'subject', cls: 'good', scene: '故人',
  text: { show: ['「{civ}」的档案馆认出了{ship}：{h.y}，你曾{h.act}。哨舰撤去了炮口，港口为你打开。', '扫描刚开始就停了。「{civ}」的通讯官念出了你的船名，又念出了一个年份：{h.y}。「我们的教科书里有你。」'] },
  options: [{ id: 'recog.supply', label: '接受他们的补给', desc: '老朋友的后代会把货舱装满。' }, { id: 'recog.learn', label: '向他们求教', desc: '他们远比你先进，而且愿意教。' }] });
ev({ id: 'recog.supply', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'ship', supply: 60, tech: 1 }, { op: 'imprint', tag: '恩人', v: 0.2 }], emit: { type: 'recog_met' }, echo: true, log: ['{ship}回来了。「{civ}」以祖先恩人的礼节接待了它。'], result: '他们按祖先留下的礼节接待了你（补给 {v.supply}，飞船科技 {v.tech}）。临走时，一个孩子递给你一本书，封面上画着你的飞船。' }] });
ev({ id: 'recog.learn', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'ship', tech: 2, techGap: 0.3 }, { op: 'imprint', tag: '恩人', v: 0.2 }], emit: { type: 'recog_met' }, echo: true, log: ['「{civ}」把他们的科学回赠给了祖先的恩人{ship}。'], result: '他们说：「当年你教了我们的祖先，现在轮到我们。」飞船科技 {v.tech}。' }] });

/* ---------------- 回报舰队（原 descendants） ---------------- */
ev({ id: 'payoff.gratitude_fleet', on: 'arrival', subject: 'near', range: 90, when: [{ stat: 'c.tech', gte: 55 }, { calc: 'help' }, { any: [{ fact: { type: 'seek_ship', target: '$c' } }, { stat: 'att', gte: 0.4 }] }, { noFact: { type: ['butcher', 'ally_war', 'retaliated', 'faith_met', 'recog_met'], target: '$c' } }],
  p: 0.4, once: 'subject', cooldownGroup: 'fleet', groupCooldown: 400, cls: 'good', echo: true, emit: { type: 'fleet_met' },
  effects: [{ op: 'ship', supply: 40, tech: 2, techGap: 0.15 }],
  text: { show: ['一支来自「{civ}」的舰队在这里等你。{h.y}你曾{h.act}，他们一直记着。他们带来了补给和技术（补给 {v.supply}，飞船科技 {v.tech}）。', '「{civ}」的舰队在{here}找到了{ship}。{h.y}，你曾{h.act}；他们一直在等这一天（补给 {v.supply}，飞船科技 {v.tech}）。'] } });
ev({ id: 'payoff.revenge_fleet', on: 'arrival', subject: 'near', range: 90, when: [{ stat: 'c.tech', gte: 55 }, { fact: { type: ['hostile', 'devil', 'retaliated'], target: '$c', actor: 'ship', known: 'any', as: 'h' } }, { any: [{ fact: { type: 'seek_revenge', target: '$c' } }, { stat: 'att', lte: -0.4 }] }, { noFact: { type: ['apology', 'revenge_met'], target: '$c' } }],
  p: 0.4, once: 'subject', cooldownGroup: 'fleet', groupCooldown: 400, cls: 'bad', echo: true, emit: { type: 'revenge_met' },
  effects: [{ op: 'ship', supply: -35 }],
  text: { show: ['「{civ}」的复仇舰队截住了你：他们没有忘记{h.y}你曾{h.act}。飞船的货舱被打穿（补给 {v.supply}）。', '{here}的轨道上，「{civ}」的战舰等了你很久。{h.y}的事，他们一笔一笔记着（补给 {v.supply}）。'] } });

/* ---------------- 链 D：宗教分叉树 ----------------
 * A1：不再是一条阶梯。创立后同时排期三个入口（分裂 / 朝圣 / 假先知），每个都有有限的窗口和较低的基础概率，
 * 由当时的状态决定谁先来：稳定度低 → 分裂、假先知；战争 → 分裂、圣战；稳定且被你祝福过 → 朝圣、改革；
 * 你很久没回来 → 假先知；你刚回来过 → 假先知没有市场。神↔恶魔转换（再次降临成恶魔、出卖信徒、偏袒一方）让圣战更可能。
 * 后续文本通过 calc 'faith' 引用前一阶段的细节：{v.sign} 创教时的神迹，{v.relic} 信徒随身带着的圣物，{v.past}/{v.after}/{v.pastS} 走过的路。
 * 深度投入的神眷文明：光粒发射会弹预警卡（warn.launch_seen，神是最高级的「帮助」），你可以发光速警告；信徒听神的话，撤离得更多（evacuate）。 */
// 「你最近回来过」：只算回访（祝福、回访场景、朝圣相遇、处理假先知），不算创教那一次
const RECENT_GOD = { type: ['faith_blessed', 'returned', 'pilgrim_met', 'prophet_resolved'], target: '$c', known: 'any', maxAge: 300 };
const LONG_ABSENT = { all: [{ noFact: Object.assign({}, RECENT_GOD, { maxAge: 600 }) }, { fact: { type: 'faith_founded', target: '$c', minAge: 200 } }] };
const FAITH_UNLOCK = [{ event: 'rel.schism', delay: [30, 160], window: 900 }, { event: 'rel.pilgrimage', delay: [20, 120], window: 450 }, { event: 'rel.false_prophet', delay: [40, 220], window: 600 }];
ev({ id: 'rel.founded', on: 'fact:god', when: [{ noFact: { type: 'faith_founded', target: '$c' } }, { noFact: { type: 'devil', target: '$c', actor: 'ship' } }],
  once: 'subject', echo: true, nocap: true, imp: 3,
  effects: [{ op: 'set', path: 'c.religion', v: '{shipBase}教' }, { op: 'protect', years: 300, floor: 0.3, quiet: 0.35 }],
  emit: { type: 'faith_founded' }, unlock: FAITH_UNLOCK,
  text: { log: ['「{civ}」把你奉为神明，「{religion}」成了他们的国教。神庙里供着一艘发光的小船。经书第一章写着：神说，不要向黑暗呼喊。',
    '「{religion}」在「{civ}」传开了：神乘着光来，又乘着光走。祭司们教导信徒安静地等待，不要向天空喊叫。',
    '「{civ}」的每座城市都建起了「{religion}」的神庙，屋顶都朝着你离开的方向。教义说：神喜欢安静的孩子。'] } });
ev({ id: 'rel.devil_to_god', on: 'fact:god', when: [{ fact: { type: 'devil', target: '$c', actor: 'ship', as: 'd' } }, { noFact: { type: 'faith_founded', target: '$c' } }],
  once: 'subject', echo: true, nocap: true, imp: 3,
  effects: [{ op: 'set', path: 'c.religion', v: '{shipBase}教' }, { op: 'protect', years: 300, floor: 0.3, quiet: 0.35 }],
  forbid: ['dev.arms', 'dev.revenge', 'dev.ritual_fades'],
  emit: { type: 'faith_founded', data: { fromDevil: 1 } }, unlock: FAITH_UNLOCK,
  text: { log: ['「{civ}」的{ritual}在一夜之间变了意思：{d.y}的天外恶魔，原来是来考验他们的神。面具还是那副面具，现在被供在神庙里。',
    '恶魔回来了，这一次带着神迹。「{civ}」的祭司宣布：{d.y}的降临是一场试炼，而他们通过了。{ritual}从此改叫「归神节」。'] } });
ev({ id: 'rel.god_to_devil', on: 'fact:devil', when: [{ fact: { type: 'faith_founded', target: '$c', as: 'r' } }],
  once: 'subject', echo: true, nocap: true, imp: 3, effects: [{ op: 'add', path: 'c.stab', v: -0.15, min: 0 }, { op: 'set', path: 'c.sects', v: ['旧约派', '新约派'] }],
  emit: { type: 'faith_schism', data: { why: 'devil' } }, forbid: ['rel.schism'], unlock: [{ event: 'rel.holy_war', delay: [10, 80] }, { event: 'rel.reformation', delay: [30, 200] }],
  pre: [{ calc: 'faith' }],
  text: { log: ['神回来了，却{f.d.what}。「{religion}」当场裂成了「{sect0}」和「{sect1}」：一派说神在惩罚他们，一派说那根本不是神。',
    '{r.y}以来，「{civ}」一直供奉着{v.sign}。{f.y}，神回来了，却{f.d.what}。「{sect1}」砸碎了神像；「{sect0}」说，这是神在考验谁的信仰更坚定。'] } });
ev({ id: 'dev.founded', on: 'fact:devil', when: [{ noFact: { type: 'faith_founded', target: '$c' } }],
  once: 'subject', echo: true, nocap: true, effects: [{ op: 'set', path: 'c.ritual', v: '驱魔节' }],
  emit: { type: 'devil_founded' }, unlock: [{ event: 'dev.arms', delay: [40, 200] }, { event: 'dev.ritual_fades', delay: [350, 700] }],
  text: { log: ['「{civ}」的孩子们每年都过「{ritual}」，戴着照你的飞船做的面具。', '「{civ}」的巫师在每个村口立起了驱魔柱，柱顶刻着一艘长着獠牙的飞船。从此每年都有「{ritual}」。', '「{civ}」的历法里多了一个节日：「{ritual}」。那一夜所有人都熄灯，假装天上什么也没有。'] } });
ev({ id: 'dev.arms', on: 'pending', when: [{ fact: { type: 'devil_founded', target: '$c' } }, { stat: 'c.tech', gte: 20 }],
  p: 0.01, once: 'subject', echo: true, effects: [{ op: 'add', path: 'c.exp', v: 0.1, max: 1 }], emit: { type: 'devil_arms' }, unlock: [{ event: 'dev.revenge', delay: [60, 300] }],
  text: { log: ['对「天外恶魔」的恐惧塑造了「{civ}」：他们把大量资源投进了防空和军备。{ritual}上的面具，换成了防空炮的模型。', '「{civ}」的第一座天文台不是为了看星星，而是为了在恶魔回来之前发现它。每年{ritual}，观测员都要宣誓。'] } });
ev({ id: 'dev.revenge', on: 'pending', when: [{ fact: { type: 'devil_arms', target: '$c' } }, { stat: 'c.tech', gte: 55 }, { noFact: { type: 'devil_faded', target: '$c' } }],
  p: 0.01, once: 'subject', echo: true, emit: { type: 'seek_revenge' },
  text: { log: ['「{civ}」组建了一支舰队，誓言找到当年那个天外恶魔。出征前夜正逢{ritual}，舰员们戴上了那副面具。'] } });
ev({ id: 'dev.ritual_fades', on: 'pending', when: [{ fact: { type: 'devil_founded', target: '$c' } }],
  p: 0.01, once: 'subject', echo: true, effects: [{ op: 'imprint', v: 0.35 }], emit: { type: 'devil_faded' }, forbid: ['dev.revenge'],
  text: { log: ['「{ritual}」已经变成了孩子们的节日：没人再相信恶魔，只剩下糖果和面具。', '「{civ}」的学者重新考证了{ritual}的来历：那艘「恶魔飞船」也许只是一个迷路的旅人。'] } });

// 分裂：乱世才分裂。稳定、刚被你祝福过的文明很少分裂
ev({ id: 'rel.schism', on: 'pending', when: [{ fact: { type: 'faith_founded', target: '$c', as: 'r' } }, { stat: 'c.tech', gte: 8 }],
  p: 0.0035, mod: [{ if: { stat: 'c.stab', lt: 0.45 }, x: 3 }, { if: { atWar: true }, x: 2 }, { if: { fact: RECENT_GOD }, x: 0.4 }], once: 'subject', echo: true, nocap: true,
  effects: [{ op: 'add', path: 'c.stab', v: -0.1, min: 0 }, { op: 'set', path: 'c.sects', v: ['[守望|归来|圣船]派', '[离弃|觉醒|无神]派'] }],
  emit: { type: 'faith_schism' }, unlock: [{ event: 'rel.holy_war', delay: [10, 120] }, { event: 'rel.reformation', delay: [30, 220] }],
  text: { log: ['「{religion}」分裂成「{sect0}」和「{sect1}」：一派相信神终将归来，一派说神早已抛弃了他们。', '为了{ship}究竟会不会回来，「{civ}」的祭司们吵了一个世纪，最后分成了「{sect0}」和「{sect1}」。', '「{sect1}」的先知在广场上烧掉了神像：「神走了{v.age}年，它不会回来了。」「{sect0}」的信徒把灰烬一捧一捧收了回去。'] },
  pre: [{ calc: 'age' }] });
// 圣战：好战、扩张、外战、社会撕裂、神魔转换后都更容易；稳定的社会很少为神打仗
ev({ id: 'rel.holy_war', on: 'pending', when: [{ fact: { type: 'faith_schism', target: '$c' } }, { stat: 'c.tech', gte: 8 }],
  p: 0.006, mod: [{ if: { temper: ['好战'] }, x: 2.5 }, { if: { stat: 'c.exp', gt: 0.6 }, x: 1.5 }, { if: { atWar: true }, x: 2 }, { if: { stat: 'c.stab', lt: 0.3 }, x: 2 }, { if: { stat: 'c.stab', gte: 0.6 }, x: 0.5 },
    { if: { fact: { type: 'faith_schism', target: '$c', data: { why: 'devil' } } }, x: 2.5 }],
  once: 'subject', echo: true, nocap: true, forbid: ['rel.reformation'],
  effects: [{ op: 'add', path: 'c.stab', v: -0.15, min: 0 }, { op: 'add', path: 'c.exp', v: 0.1, max: 1 }], emit: { type: 'faith_holywar' }, unlock: [{ event: 'rel.martyr', delay: [5, 60] }],
  pre: [{ calc: 'faith' }],
  text: { log: ['「{sect0}」与「{sect1}」的宗教战争打了几十年。双方的旗帜上画着同一个图案：{v.sign}。', '以{ship}之名的战争在「{civ}」燃起：「{sect0}」的军队高唱着关于你的圣歌，攻进了「{sect1}」的城市。'] },
  card: { cls: 'warn', w: 4, title: '以你之名的战争', body: '你看到的是{year}的光：「{civ}」的「{sect0}」与「{sect1}」为你打起了宗教战争。两边的旗帜上都画着{v.sign}。' } });
ev({ id: 'rel.martyr', on: 'pending', when: [{ fact: { type: 'faith_holywar', target: '$c' } }],
  p: 0.02, once: 'subject', echo: true, nocap: true, emit: { type: 'faith_martyr' },
  text: { log: ['「{sect1}」的领袖被处死前说：「神没有抛弃我们，是我们抛弃了神。」他的墓成了两派共同的圣地。', '一位「{sect0}」的老祭司走进战场中央，要求双方停火，然后死在了乱箭下。战争在第二年结束了。'] },
  card: { cls: 'warn', w: 3, title: '殉道者', body: '你看到的是{year}的光：「{civ}」的宗教战争里出了一位殉道者。人们说，他死前一直望着你离开的方向。' } });
// 改革：开明、富足、和平、真神显过灵（揭穿假先知 / 平息圣战之后）的文明会把「等待」改成「寻找」
ev({ id: 'rel.reformation', on: 'pending', when: [{ fact: { type: 'faith_schism', target: '$c' } }, { stat: 'c.tech', gte: 20 }],
  p: 0.008, mod: [{ if: { temper: ['学者', '商人'] }, x: 2 }, { if: { stat: 'c.tech', gte: 35 }, x: 2 }, { if: { stat: 'c.stab', gte: 0.5 }, x: 1.5 }, { if: { atWar: true }, x: 0.5 },
    { if: { fact: { type: ['prophet_resolved', 'faith_peace', 'faith_martyr'], target: '$c', known: 'any' } }, x: 2 }],
  once: 'subject', echo: true, nocap: true, forbid: ['rel.holy_war'],
  emit: { type: 'faith_reform' }, unlock: [{ event: 'rel.call', delay: [0, 60] }, { event: 'rel.envoy', delay: [0, 200], window: 1500 }],
  pre: [{ calc: 'faith' }],
  text: { log: ['{v.after}「{sect0}」赢了。改革派说：神不会再回来，要由信徒自己去找到神。他们开始[建造朝向你离去方向的巨型天线|绘制你离去的航线|收集关于{ship}的每一条记载]。', '「{religion}」的宗教改革：经书里「等待」两个字被改成了「寻找」。{v.pastS}'] },
  card: { cls: 'good', w: 4, title: '信徒要来找你', body: '你看到的是{year}的光：「{civ}」的宗教改革把「等待神」改成了「寻找神」。他们在找{ship}。' } });
// 朝圣：稳定、被祝福过的文明；战乱时没人上路。朝圣者攒够了科技，也会造船出发（使者号的第二个入口）
ev({ id: 'rel.pilgrimage', on: 'pending', when: [{ fact: { type: 'faith_founded', target: '$c', as: 'r' } }, { stat: 'c.tech', gte: 12 }],
  p: 0.0025, mod: [{ if: { stat: 'c.stab', gte: 0.6 }, x: 2 }, { if: { fact: { type: 'faith_blessed', target: '$c', known: 'any' } }, x: 2.5 }, { if: { atWar: true }, x: 0.4 }, { if: { stat: 'c.stab', lt: 0.45 }, x: 0.5 }],
  once: 'subject', echo: true, nocap: true, emit: { type: 'faith_pilgrim' }, unlock: [{ event: 'rel.envoy', delay: [80, 300], window: 1500 }],
  pre: [{ calc: 'faith' }],
  text: { log: ['每年都有成千上万的朝圣者走到{cHome}上你当年降落的地方，在那里等神回来。', '「{civ}」修了一条通往「神降之地」的朝圣大道。沿途的每块里程碑上都刻着同一个年份：{r.y}。', '朝圣者从「{civ}」的每个角落出发，背着{v.relic}，走向你当年降落的地方。'] },
  card: { cls: 'good', w: 3, title: '朝圣者在等你', body: '你看到的是{year}的光：「{civ}」的朝圣者聚集在你当年降落的地方，等神回来。' } });
// 假先知：神久久不归、社会动荡时出现；你最近回来过，冒充者就没有市场
ev({ id: 'rel.false_prophet', on: 'pending', when: [{ fact: { type: 'faith_founded', target: '$c' } }, { stat: 'c.tech', gte: 8 }],
  p: 0.0022, mod: [{ if: { stat: 'c.stab', lt: 0.45 }, x: 2.5 }, { if: { fact: RECENT_GOD }, x: 0.25 }, { if: LONG_ABSENT, x: 2 }],
  once: 'subject', echo: true, nocap: true, emit: { type: 'faith_prophet' },
  pre: [{ calc: 'faith' }],
  text: { log: ['一个自称「{shipBase}再临」的人出现在「{civ}」：他说自己就是当年的神，带着几万信徒[烧毁了旧神庙|要求国王让位|宣布末日将至]。', '「{shipBase}再临」的信徒举着{v.sign}的画像游行：神走了{v.age}年，现在祂借一个凡人的身体回来了。'] },
  card: { cls: 'warn', w: 3, title: '有人冒充你', body: '你看到的是{year}的光：「{civ}」出现了一个自称「{shipBase}再临」的先知。他用的是你的名字。' } });
ev({ id: 'rel.call', on: 'pending', when: [{ fact: { type: 'faith_reform', target: '$c' } }, { stat: 'c.tech', gte: 30 }],
  p: 0.02, once: 'subject', echo: true, nocap: true, effects: [{ op: 'expo', at: 'c.home', kind: 'radio', v: 0.3 }], emit: { type: 'faith_call' },
  pre: [{ calc: 'faith' }],
  text: { log: ['「{civ}」的射电望远镜一直对准你离开的方向，日夜向深空呼唤他们的神——这些呼唤也照亮了他们自己的坐标。天线阵的基座上刻着{v.sign}。'] },
  card: { cls: 'warn', w: 4, title: '来自「{civ}」的呼唤', body: '你收到了一段射电信号（发出于{year}）：「{religion}」的改革派在呼唤他们的神。它也照亮了他们自己的坐标。你可以回应。' } });
ev({ id: 'rel.call_answer', group: 'faith_scene', on: 'arrival', subject: 'any', when: [{ fact: { type: 'faith_call', target: '$c', known: 'ship', as: 'k' } }, { noFact: { type: ['answered', 'faith_truth'], target: '$c' } }, { here: false }],   // 人就在他们星系里时，不需要「回信」
  once: 'subject', cls: 'warn',
  text: { show: ['你的接收机里一直有「{civ}」的呼唤（{k.y}发出，{v.dist}）。他们还在喊。'] }, pre: [{ calc: 'dist' }],
  options: [{ id: 'rel.answer_silence', label: '回应「{civ}」：让他们安静', desc: '以神的名义命令他们停止呼喊、关掉天线。你的回信也会暴露你此刻的位置。' },
    { id: 'rel.answer_come', label: '回应「{civ}」：告诉他们你在哪', desc: '他们会更快造船来找你。双向的呼喊会让两边都更亮。' }] });
ev({ id: 'rel.answer_silence', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'silence' }, { op: 'protect', years: 400, floor: 0.3, quiet: 0.2 }, { op: 'expo', at: 'here', kind: 'contact', v: 0.25 }], emit: { type: 'answered', data: { how: 'silence' } }, echo: true, imp: 3,
    log: ['神回信了：「安静。」「{civ}」关掉了所有朝向深空的天线。'], result: '你的回信要走 {v.distN} 年才能到。等它到了，「{civ}」的天线会一座座关掉——如果那时还来得及。' }] });
ev({ id: 'rel.answer_come', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'expo', at: 'here', kind: 'bcast', v: 0.8 }], emit: { type: 'answered', data: { how: 'come' } }, echo: true, imp: 3,
    log: ['神回信了，还告诉了他们自己在哪里。「{civ}」举国狂欢。'], result: '你把此刻的位置发了回去（{v.distN} 光年外）。他们会来——这片森林里也可能有别的东西听见。' }] });
// 使者号：两个入口——改革派（寻找神）和朝圣者（去神来的地方）。你回应过、他们有殉道者、被你祝福过，都会让船更早出发
ev({ id: 'rel.envoy', on: 'pending', when: [{ any: [{ fact: { type: 'faith_reform', target: '$c' } }, { fact: { type: 'faith_pilgrim', target: '$c' } }] }, { stat: 'c.tech', gte: 55 }, { noFact: { type: 'faith_truth', target: '$c' } }],
  p: 0.015, mod: [{ if: { fact: { type: 'answered', target: '$c' } }, x: 3 }, { if: { fact: { type: 'faith_martyr', target: '$c' } }, x: 1.5 }, { if: { fact: { type: 'faith_blessed', target: '$c', known: 'any' } }, x: 2 }],
  once: 'subject', echo: true, nocap: true, emit: { type: 'faith_envoy' },
  pre: [{ calc: 'faith' }],
  text: { log: ['「{civ}」造出第一艘星舰，命名为「{shipBase}使者号」，出发去寻找他们的神。舱里供着{v.relic}。', '「{shipBase}使者号」离开了「{civ}」。{v.after}信徒们终于有了一艘能追上神的船。'] },
  card: { cls: 'good', w: 5, title: '「{shipBase}使者号」出发了', body: '你看到的是{year}的光：「{civ}」的信徒造出星舰，带着{v.relic}，出发寻找{ship}。' } });
ev({ id: 'rel.envoy_meet', group: 'faith_scene', on: 'arrival', subject: 'near', range: 160, when: [{ fact: { type: 'faith_envoy', target: '$c', as: 'e' } }, { reach: { as: 'e', speed: 0.9 } }, { noFact: { type: ['faith_met', 'faith_truth'], target: '$c' } }],
  once: 'subject', cooldownGroup: 'fleet', groupCooldown: 150, cls: 'good', echo: true, emit: { type: 'faith_met' }, effects: [{ op: 'ship', supply: 40 }],
  text: { show: ['一艘陌生的星舰在{here}等你。舰首写着「{shipBase}使者号」——「{civ}」的信徒找了你{v.age}年。舰上的祭司捧着{v.relic}跪在舷窗前。{v.pastS}货舱里装满了供品（补给 {v.supply}）。'] }, pre: [{ calc: 'age' }, { calc: 'faith' }],
  options: [{ id: 'rel.keep_faith', label: '继续扮演他们的神', desc: '祝福他们，然后离开。宗教会延续下去。' }, { id: 'rel.truth', label: '说出真相：你只是一艘飞船', desc: '他们找了几百年的神，原来是一个旅人。' }] });
ev({ id: 'rel.keep_faith', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'imprint', tag: '神', v: 0.2 }, { op: 'protect', years: 300, floor: 0.35, quiet: 0.3 }, { op: 'ship', tech: 2 }], emit: { type: 'faith_blessed' }, echo: true, imp: 3,
    log: ['使者号带回了神的祝福。「{religion}」迎来了[黄金时代|第二次复兴]。'], result: '你祝福了他们。使者号调头回家，舰上的人一路都在唱歌。他们留下了一些技术资料作为供品（飞船科技 {v.tech}）。' }] });
ev({ id: 'rel.truth', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'imprint', tag: '旅人', v: -0.2 }, { op: 'add', path: 'c.stab', v: -0.15, min: 0 }], emit: { type: 'faith_truth' }, echo: true, imp: 3,
    forbid: ['rel.holy_war', 'rel.reformation', 'rel.call', 'rel.envoy', 'rel.pilgrimage', 'rel.false_prophet'],
    log: ['使者号带回了一个消息：神只是一艘飞船。「{religion}」的时代结束了。'], result: '祭司听完，很久没有说话。最后他说：「那我们就自己走吧。」使者号调头回家，带着一个会让整个文明重新思考的消息。' }] });
ev({ id: 'rel.pilgrim_scene', group: 'faith_scene', on: 'arrival', subject: 'here', when: [{ fact: { type: 'faith_pilgrim', target: '$c' } }, { noFact: { type: ['faith_truth', 'pilgrim_met'], target: '$c' } }],
  once: 'subject', cls: 'good', emit: { type: 'pilgrim_met' }, pre: [{ calc: 'faith' }],
  text: { show: ['「神降之地」上挤满了朝圣者。{v.after}他们还在等。他们看见了你的飞船，整片平原安静下来。'] },
  options: [{ id: 'rel.bless', label: '降落，祝福朝圣者', desc: '他们会更团结；神话会再延续几百年。' }, { id: 'rel.truth2', label: '告诉他们真相', desc: '你只是一个旅人。' }] });
ev({ id: 'rel.bless', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'add', path: 'c.stab', v: 0.15, max: 1 }, { op: 'protect', years: 300, floor: 0.35, quiet: 0.3 }, { op: 'ship', supply: 30 }], emit: { type: 'faith_blessed' }, echo: true, imp: 3,
    log: ['神回到了「{civ}」，祝福了信徒。'], result: '你走下舷梯。几十万人同时跪下。他们把供品堆满了货舱（补给 {v.supply}）。' }] });
ev({ id: 'rel.truth2', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'add', path: 'c.stab', v: -0.15, min: 0 }, { op: 'imprint', tag: '旅人', v: -0.2 }], emit: { type: 'faith_truth' }, echo: true, imp: 3,
    forbid: ['rel.holy_war', 'rel.reformation', 'rel.call', 'rel.envoy', 'rel.false_prophet'],
    log: ['神在「{civ}」亲口说：我不是神。「{religion}」从此走向衰落。'], result: '你说完，人群里有人哭，有人笑，有人转身离开。几百年的信仰在一个下午裂开了。' }] });
ev({ id: 'rel.prophet_scene', group: 'faith_scene', on: 'arrival', subject: 'here', when: [{ fact: { type: 'faith_prophet', target: '$c' } }, { noFact: { type: ['prophet_resolved', 'faith_truth'], target: '$c' } }],
  once: 'subject', cls: 'warn', pre: [{ calc: 'faith' }], text: { show: ['自称「{shipBase}再临」的先知的信徒们封锁了港口。他们举着{v.sign}的画像——真正的飞船来了，他们不知道该怎么办。'] },
  options: [{ id: 'rel.expose', label: '揭穿冒充者', desc: '神迹对决。他的教派会垮掉。' }, { id: 'rel.endorse', label: '默认他', desc: '让他替你当神。' }] });
ev({ id: 'rel.expose', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'add', path: 'c.stab', v: 0.1, max: 1 }, { op: 'imprint', tag: '神', v: 0.2 }], emit: { type: 'prophet_resolved', data: { how: 'expose' } }, echo: true, imp: 3,
    log: ['真正的神回来了，假先知的教派一夜瓦解。'], result: '你只是把飞船停在城市上空，打开了探照灯。第二天，假先知的信徒散了大半。' }] });
ev({ id: 'rel.endorse', on: 'choice', outcomes: [
  { cls: 'warn', effects: [{ op: 'add', path: 'c.exp', v: 0.1, max: 1 }], emit: { type: 'prophet_resolved', data: { how: 'endorse' } }, echo: true, imp: 3,
    log: ['神默认了「{shipBase}再临」。新的教团接管了「{civ}」。'], result: '你什么也没做就离开了。先知宣布：神认可了他。新的教团从此掌权。' }] });
// 神回来了（没有朝圣 / 假先知 / 使者场景时的回访）：祝福、平息以你为名的圣战（可能失败，被一方当成恶魔），或说出真相
ev({ id: 'rel.return', group: 'faith_scene', on: 'arrival', subject: 'here', when: [{ fact: { type: 'faith_founded', target: '$c', as: 'r' } }, { since: { as: 'r', min: 40 } },
    { noFact: { type: ['faith_truth'], target: '$c' } }, { noFact: { type: ['returned', 'pilgrim_met'], target: '$c', known: 'any', maxAge: 250 } }, { noFact: { type: 'faith_schism', target: '$c', data: { why: 'devil' } } }],
  cls: 'good', emit: { type: 'returned' }, pre: [{ calc: 'faith' }, { calc: 'age' }],
  text: { show: ['「{civ}」的每一座神庙都敲响了钟：「{religion}」的神，在离开{v.age}年之后回来了。{v.pastS}', '{v.age}年来，「{civ}」一直供奉着{v.sign}。现在，那艘船真的出现在了天上。{v.pastS}'] },
  options: [{ id: 'rel.bless', label: '降落，祝福他们', desc: '他们会更团结；神话会再延续几百年。' },
    { id: 'rel.stop_war', label: '以神的名义制止圣战', desc: '你可以命令「{sect0}」和「{sect1}」放下武器。但在战争里，一个不偏不倚的神，可能被两边都当成敌人。', when: [{ fact: { type: 'faith_holywar', target: '$c' } }, { noFact: { type: 'faith_peace', target: '$c' } }] },
    { id: 'rel.truth2', label: '告诉他们真相', desc: '你只是一个旅人。' }] });
ev({ id: 'rel.stop_war', on: 'choice', outcomes: [
  { p: 0.55, mod: [{ if: { stat: 'att', gte: 0.5 }, x: 1.3 }], cls: 'good', effects: [{ op: 'add', path: 'c.exp', v: -0.15, min: 0 }, { op: 'add', path: 'c.stab', v: 0.1, max: 1 }, { op: 'protect', years: 200, floor: 0.35, quiet: 0.3 }],
    emit: { type: 'faith_peace' }, echo: true, imp: 3,
    log: ['神降临在「{sect0}」与「{sect1}」的两军之间，以你之名的战争结束了。'], result: '你把飞船停在两军之间，什么也没说。第一个放下武器的是一个孩子。到了傍晚，整片战场都跪了下来。' },
  { cls: 'bad', emit: { type: 'devil', actor: 'ship', tags: ['player', 'harm'], data: { how: 'wrath', what: '站在了「{sect0}」那一边', rel: '以恶魔的样子降临' } }, echo: true, imp: 3,
    log: ['神降临了，「{sect0}」放下了武器，「{sect1}」没有。'], result: '「{sect0}」放下了武器，「{sect1}」没有。在他们眼里，一个命令他们投降的神，只能是恶魔。你离开时，他们正在砸碎神像。' }] });

/* ---------------- 预警：你在意的文明坐标变亮了 / 看见光粒发射 ---------------- */
ev({ id: 'warn.exposure', on: 'year', need: H, when: [{ calc: 'help' }, { calc: 'expo' }, { noflag: 'c.silent' }, { noFact: { type: 'warn_expo', target: '$c', maxAge: 400 } }],
  p: 0.2, emit: { type: 'warn_expo' }, cooldown: 400,
  card: { cls: 'warn', w: 3, title: '「{civ}」的坐标正在变亮', body: '你看到的是{year}的光：{v.expoWhy}，「{civ}」在深空里越来越显眼（暴露度 {v.expo}）。{h.y}你曾{h.act}。如果赶到那里，也许能劝他们静默。' } });
ev({ id: 'warn.urge_silence', on: 'arrival', subject: 'here', when: [{ fact: { type: 'warn_expo', target: '$c', as: 'w' } }, { noflag: 'c.silent' }, { noFact: { type: 'urged', target: '$c', maxAge: 300 } }],
  cls: 'warn', text: { show: ['「{civ}」的坐标还在深空里发亮。你知道外面有什么在看。', '在你的接收机上，「{civ}」的电磁辐射一年比一年亮。整片星空都听得见。', '「{civ}」还没学会安静。你见过安静不下来的文明是什么下场。'] },
  options: [{ id: 'warn.silence', label: '劝他们静默', desc: '把你见过的打击讲给他们听。' }] });
ev({ id: 'warn.silence', on: 'choice', outcomes: [
  { p: 0.65, mod: [{ if: { stat: 'att', gte: 0.3 }, x: 1.4 }, { if: { temper: ['好战'] }, x: 0.5 }], cls: 'good', effects: [{ op: 'silence' }], emit: { type: 'urged' }, echo: true, imp: 3,
    log: ['听了{ship}的警告，「{civ}」关掉了所有对外广播，藏了起来。'], result: '你把见过的二维画和熄灭的恒星讲给他们听。第二天，「{civ}」开始关闭对外广播。' },
  { cls: 'warn', emit: { type: 'urged' }, effects: [{ op: 'imprint', v: -0.05 }], result: '他们礼貌地听完，然后告诉你：「我们不怕。」' }] });
ev({ id: 'warn.launch_seen', on: 'fact:strike_launch', subject: 'target', when: [{ calc: 'help' }],
  once: false, card: { at: 'fact', cls: 'bad', w: 5, expire: { y: 'f.data.arrive', sys: 'f.data.tsys' }, title: '你看见了一次发射', body: '你看到的是{f.y}的光：「{f.actor}」向「{civ}」射出了光粒，预计{f.d.arriveY}抵达。{h.y}你曾{h.act}。' } });
/* 光粒预警与撤离（A3）：光粒以 0.99c 飞行，比光慢 1%。你只要（按光延迟）看见了发射的闪光，
 * 而且从你此刻的位置发出的光速警告能比光粒先到目标（now + D(你, 目标) < 抵达年份），就能警告他们——
 * 在母星或发射方星系最容易做到（你和闪光同时出发）。警告本身以光速传播：撤离发生在警告到达的那一年（warn.evac_arrive），不是你按下按钮的那一刻。
 * 如果开枪的是母星，这就是背叛：母星档案会记下（home.dossier）。被你救下的撤离舰队会认得你（warned 计入「帮助」）。 */
ev({ id: 'warn.evacuate', on: 'arrival', subject: 'any', group: 'warn_evac', cooldownGroup: 'evac', groupCooldown: 150, effects: [{ op: 'hunt' }], when: [{ calc: 'incoming' }, { noFact: { type: 'warned', target: '$c', actor: 'ship', known: 'any', maxAge: 200 } }],
  cls: 'bad', text: { show: ['{v.seen}：「{v.shooter}」向「{civ}」（{v.target}）射出了光粒，它会在{v.arriveY}落地。{v.race}'] },
  options: [{ id: 'warn.evac_go', label: '{v.warnLabel}', desc: '{v.warnDesc}' }] });
ev({ id: 'warn.evac_go', on: 'choice', outcomes: [
  { cls: 'good', effects: [{ op: 'expo', at: 'here', kind: 'contact', v: 0.15 }], emit: { type: 'warned', at: 'here', actor: 'ship', tags: ['player', 'help'], data: { vsHome: '{v.vsHome}', shooter: '{v.shooter}', rel: '在光粒落下前警告他们', lead: '{v.leadN}' } }, echo: true, imp: 3,
    unlock: [{ event: 'warn.evac_arrive', delayV: 'warnD', window: 60 }],
    log: ['{ship}向「{civ}」发出了光粒预警：「{v.shooter}」的光粒正在路上。'], result: '{v.warnResult}' }] });
ev({ id: 'warn.evac_arrive', on: 'pending', when: [{ fact: { type: 'warned', target: '$c', actor: 'ship', known: 'any', as: 'w' } }],
  once: 'subject', echo: true, nocap: true, imp: 3, effects: [{ op: 'evacuate' }, { op: 'imprint', tag: '恩人', v: 0.5 }], emit: { type: 'evacuated', target: 'spawned', data: { from: '{civ}' } },
  text: { log: ['{ship}的警告比光粒早到了{w.d.lead}。「{civ}」[在最后的日子里|用尽了每一艘船]把一部分人送上了天：撤离舰队逃向了最近的安全星系。', '警告到了。「{civ}」没有争论太久——他们见过黑暗森林。在光粒落下之前，一支撤离舰队离开了这里。'] } });
ev({ id: 'echo.evacuated.memory', on: 'year', need: ['evacuated'], when: [{ fact: { type: 'evacuated', target: '$c', known: 'any', inherit: false, as: 'x' } }, { since: { as: 'x', min: 20 } }],
  p: 0.02, once: 'subject', echo: true,
  text: { log: ['「{civ}」的每一艘船上都挂着一块铭牌：纪念{x.y}那段比光粒早到了几个月的警告，和发出警告的{ship}。', '「{civ}」的孩子们会背一句话：「光粒比光慢一点点——那一点点，就是我们。」'] } });

/* 母星的档案：你在外面做的事（站队、调停、预警、报复、道歉），光传回太阳以后都会进卷宗。回家时读出来——按光延迟，母星还不知道的不会出现 */
const DOSSIER = ['sided', 'mediated', 'mediate_failed', 'warned', 'retaliated', 'reparation', 'apology', 'questioned', 'refugee_spurned', 'faith_blessed', 'faith_truth', 'god', 'devil', 'gift_l', 'ally', 'starmap', 'hostile'];
ev({ id: 'home.dossier', on: 'arrival', subject: 'here', cooldown: 150, when: [{ earth: '$c' }, { fact: { type: DOSSIER, actor: 'ship' } }, { calc: 'dossier' }],
  cls: 'warn', text: { show: ['母星的档案馆里，关于{ship}的卷宗又厚了一些：{v.dossier}', '你还没走下舷梯，就有人递来一份卷宗——母星这些年按光速陆续收到的、关于你的消息：{v.dossier}'] } });

/* ---------------- 大事件卡片（原 bigEvents） ----------------
 * 导演配额见 index.html 的 bigEvents()：每份报告最多 2 张；有 major 卡时只弹 major；同 key 一局一次；同一文明只留最重的一张。
 * 卡片字段：w = 权重（因果越重越大），major = 重大时刻（UI 单独减速演出），key = 去重键，short = 聚合时用的短句，
 *          expire = { y, sys }：光从 sys 传到飞船时已过 y 年 → 过期不弹。 */
// 只有分量够的帮助（神、盟约、大量技术、交换技术、通商、光粒预警）才弹卡；求教、送信、展出这类轻交往只在史书里留一行
ev({ id: 'card.helped_extinct', on: 'fact:extinct', dead: true, when: [{ calc: 'help' }, { stat: 'v.helpRank', gte: 5 }, { any: [{ stat: 'v.helpRank', gte: 9 }, { since: { as: 'h', max: 1500 } }] }], once: 'subject',
  card: { cls: 'bad', w: 5, title: '「{civ}」灭绝了', body: '{h.y}你曾{h.act}。{f.y}，「{civ}」消失了：{f.d.cause}。', short: '「{civ}」（{h.y}你曾{h.act}）{f.y}{f.d.cause}' } });
ev({ id: 'card.home_avenged', on: 'report', when: [{ homeSeen: 'flat' }, { calc: 'home' }, { fact: { type: 'refugee_bcast', known: 'any', as: 'rb' } }, { flag: 'v.avenged' }], once: 'world', forbid: [{ event: 'card.home_flat', scope: 'world' }],
  card: { now: true, at: 'here', cls: 'bad', w: 10, major: true, key: 'home', title: '太阳系被压平了', body: '你看到的是{v.homeYear}的光：太阳系已经是一幅二维的画。{v.flatYear}{rb.y}，被母星清理过的文明的遗民「{rb.actor}」把太阳的坐标广播给了全宇宙——这一击，是他们等了很久的复仇。' } });
ev({ id: 'card.home_flat', on: 'report', when: [{ homeSeen: 'flat' }, { calc: 'home' }], once: 'world',
  card: { now: true, at: 'here', cls: 'bad', w: 10, major: true, key: 'home', title: '太阳系被压平了', body: '你看到的是{v.homeYear}的光：太阳系已经是一幅二维的画。{v.flatYear}你再也没有家可以回了。' } });
ev({ id: 'card.home_lost', on: 'report', when: [{ homeSeen: 'lost' }, { calc: 'home' }], once: 'world',
  card: { now: true, at: 'here', cls: 'bad', w: 8, major: true, title: '母星易主', body: '你看到的是{v.homeYear}的光：太阳系的主人已经是「{v.homeOwner}」。地球文明失去了自己的家园。' } });
ev({ id: 'card.home_dead', on: 'report', when: [{ homeSeen: 'dead' }, { calc: 'home' }], once: 'world',
  card: { now: true, at: 'here', cls: 'bad', w: 9, major: true, title: '地球文明消失了', body: '你看到的是{v.homeYear}的光：太阳系里已经没有文明。{v.lastEvent}' } });
// 归零者广播 / 低维化末期：宇宙级（vis cosmic，一律可见），少而重
ev({ id: 'card.zero_broadcast', on: 'report', when: [{ flag: 'u.cosmicFlags.8' }, { calc: 'dim' }], once: 'world',
  card: { now: true, at: 'here', cls: 'warn', w: 9, major: true, key: 'zero', title: '归零者的广播', body: '所有接收机在同一刻响了起来，信号来自宇宙的边缘：「归零者」发起「回归运动」，请求所有文明停止降维、停止降低光速，让宇宙回到十维的田园时代。此刻宇宙的维度是 {v.dim}，已经发生过 {v.dimN} 次降维打击。{v.dimYou}' } });
ev({ id: 'card.lowdim', on: 'report', when: [{ flag: 'u.cosmicFlags.15' }, { calc: 'dim' }], once: 'world',
  card: { now: true, at: 'here', cls: 'bad', w: 8, major: true, key: 'lowdim', title: '低维化末期', body: '物理常数的漂移已经无法忽略：宇宙的维度跌到了 {v.dim}。越来越多的空间正在跌落，整个宇宙正在慢慢变成一幅画。{v.dimYou}' } });

/* ---------------- 命运（B4）：加入黑域 ----------------
 * 只有选了这个命运（SIM.chooseDestiny(u, 'domain')）才会出现。科技 ≥ 100（与自发建黑域同一门槛）、对你友好的文明，在你亲眼凝视过二维画之后，才可能答应。 */
ev({ id: 'destiny.domain', on: 'arrival', subject: 'here', when: [{ stat: 'ship.destiny.id', eq: 'domain' }, { stat: 'ship.destiny.state', eq: 'active' }, { stat: 'c.tech', gte: 100 }, { stat: 'att', gte: 0.2 },
    { stat: 'ship.songs', gte: 1 }, { noFact: { type: 'seal_refused', target: '$c', known: 'any', maxAge: 300 } }],
  cls: 'warn', text: { show: ['「{civ}」的科技已经够得着光速本身了。他们的物理学家在研究一种把自己关起来的办法：把这片空间的光速降到每秒 16.7 公里。', '「{civ}」的港口里流传着一份计划书：黑域。代价是与宇宙永久隔绝，回报是任何打击都再也进不来。'] },
  options: [{ id: 'destiny.seal', label: '劝他们建造黑域，并让你留在里面', desc: '你见过二向箔。如果他们答应，这就是你的终点：永远安全，永远出不去。' }] });
ev({ id: 'destiny.seal', on: 'choice', outcomes: [
  { p: 0.4, mod: [{ if: { stat: 'att', gte: 0.5 }, x: 1.5 }, { if: { temper: ['学者', '官僚'] }, x: 1.3 }, { if: { temper: ['好战'] }, x: 0.5 }], cls: 'good', effects: [{ op: 'seal' }], emit: { type: 'sealed_in' }, imp: 3,
    log: ['「{civ}」听了{ship}讲述的二维画，决定建造黑域。那艘飞船留在了里面。'], result: '你讲了二维的画、熄灭的恒星和歌者随手哼出的那首歌。他们讨论了三年，最后同意了。' },
  { cls: 'dim', effects: [{ op: 'imprint', v: -0.05 }], emit: { type: 'seal_refused' }, result: '他们听完，很客气地拒绝了：「把自己关起来，也是一种死法。」' }] });

module.exports = { version: 6, events: E };
if (require.main === module) {
  // 用法：node events/events_src.js            → 把事件库写进 index.html 的 <script type="application/json" id="events">
  //       node events/events_src.js out.json   → 只输出 JSON
  const fs = require('fs'), path = require('path');
  const json = '{"version":6,"events":[\n' + E.map(e => JSON.stringify(e)).join(',\n') + '\n]}';
  if (process.argv[2]) { fs.writeFileSync(process.argv[2], json); console.log('wrote', process.argv[2]); }
  else {
    const f = path.join(__dirname, '..', 'index.html'); let html = fs.readFileSync(f, 'utf8');
    const block = '\n<script type="application/json" id="events">\n' + json + '\n</script>\n';
    const re = /\n<script type="application\/json" id="events">\n[\s\S]*?\n<\/script>\n/;   // 只匹配顶层（行首）的块
    html = re.test(html) ? html.replace(re, () => block) : html.replace('\n<script id="sim">', () => block + '<script id="sim">');
    fs.writeFileSync(f, html); console.log('embedded', E.length, 'events,', json.length, 'bytes →', f);
  }
}
