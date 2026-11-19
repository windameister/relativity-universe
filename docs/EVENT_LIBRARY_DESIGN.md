# 规则化概率事件库 · 设计稿

> **实现状态（2026-11-18）：P1 已落地。** 史实库、事件解释器、独立随机流，以及回响 / 后代舰队 / 大事件卡片，已经迁到 `prototype/events/events_src.js`（90 个事件）。本文件仍是设计依据，标题原先写「未实现」，请以本节为准。
>
> 目标（原文）：事件写成**数据**，与模拟代码分开。每个事件有触发条件和权重；发生后写入「史实」，由史实解锁、排期或封死后续事件。每局都不一样，但每件事都能追溯到已发生的历史，并且受光延迟约束。
>
> 后续阶段（P2 叙事导演、P3 把 crisis/interactions 等离散逻辑继续数据化、P4 接触场景数据化、P5 扩写与变体）尚未完成，见 `03-ROADMAP.md`。
>
> 个别字段名在实现里有简化（例如权重常用 `p`，条件里用 `noFact` / `need` 预筛），以源文件和 `docs/ARCHITECTURE.md` 为准。原文从下一节起基本保持设计时的样子。

---

## 0. 三个关键决定

1. **史实库（Fact Store）是唯一的叙事真相。** 所有「谁在何时对谁做了什么」都记成一条带时空坐标的史实；
   事件只查询史实和数值状态，不再各自维护 `c.legacy`、`c.seekYou`、`u.ship.flags` 这类零散标记。
   「谁能知道」由光延迟统一计算：史实发生在星系 S、年份 y，观察者在 O，满足 `now ≥ y + D[S][O]` 才可见。
2. **物理留在代码里，叙事和离散决策交给数据。** 文明的差分方程（`stepYear`/`techGain`/`cap`）、武器飞行、
   二维平面扩张、暴露度衰减这些连续的物理过程保持手写；崩溃、改名、宗教、回响、接触场景、大事件卡片这类
   「离散事件 + 文本」迁到事件库。事件只能通过一组**封闭的操作符**改状态，不能写任意 JS。
3. **事件用独立的确定性随机流。** 每次掷骰用 `hash(seed, eventId, subjectId, year)`，不消耗 `u.rs`。
   新增一个纯文本事件不会改变宇宙物理史；改状态的事件只影响它下游的因果。Node 与 Chrome 继续逐字一致。

---

## 1. 现有硬编码逻辑 → 迁到哪里

| 现在的代码 | 内容 | 迁移去向 |
|---|---|---|
| `crisis()` | 崩溃文本 5 种、改名 7 种、内战分裂、倒退 | 数值判定（稳定度 < 阈值）留在代码，发出触发器 `civ.crisis`；文本、改名、分裂规则 → 事件 `crisis.*` |
| `supernova()` | 恒星演化 | 物理留代码；发出史实 `star.nova`，后续反应（迁徙、宗教解释）→ 事件 |
| `interactions()` / `battle()` | 首次接触、贸易、战争、和约、断交（含「旧怨复燃」限频） | 接触判定（`detects`）留代码；关系变化和文本 → `rel.*` 事件，限频改用冷却字段 |
| `cosmicStep()` | 歌者扫描、打击抵达、看见闪光后静默 / 建黑域、降维阈值广播 | 歌者概率、打击飞行留代码；「看见闪光后的反应」「维度阈值广播」→ `witness.*`、`cosmos.*` 事件 |
| `particleHit()` / `foilHit()` / `flatten()` | 熄灭、压平、流亡舰队 | 物理留代码；流亡舰队的去向、殖民、后续记忆 → `diaspora.*` 链 |
| `echoStep()` / `echoText()` / `legacyAdd()` | 约 20 段回响文本，按 `kind + stage` 推进 | **整体迁移**：每个 stage 变成一个事件，前置条件是史实 + 上一 stage 的史实 |
| `descendants()` | 后代舰队报恩 / 复仇，400 年冷却 | 事件 `payoff.gratitude_fleet` / `payoff.revenge_fleet`，由叙事层调度 |
| `bigEvents()` + `u.ship.flags` | 母星被压平 / 易主 / 灭绝、你帮过的文明灭绝 | 事件 `card.*`，`once` 字段代替 flags，可见性走光延迟 |
| `encounter()` / `interact()` | 层级、性格场景、选项、结果文本 | 层级计算留代码；场景和选项 → `enc.*` 事件（`kind: "choice"`），选项结果 → `opt.*` 事件 |
| `causeLine()` | 打击的因果文本 | 模板化：从打击史实的 `cause` 字段填槽 |
| `cryoAccidents()` / `checkGoals()` | 事故文本、里程碑 | 判定留代码；文本、里程碑 → 事件 |

代码里现在有 53 处 `logSys/logCiv/logYou/cosmic` 直接写文本。迁移后它们都改成 `emit(trigger, ctx)`，文本只来自事件库。

---

## 2. 史实库（Fact Store）

```js
// u.facts: 追加写入，不修改；按 id 递增
{ id: 1832, y: 1404.2, sys: 12,                  // 发生的时间和地点（光延迟从这里算）
  type: 'gift',                                   // 动词：gift / god / betray / broadcast / flatten / found_colony / schism ...
  actor: 'ship', target: 'civ:7',                 // 主体、客体（civ:id / sys:id / ship / singer）
  tags: ['player', 'tech', 'gift_large'],         // 自由标签，供条件查询
  data: { dTech: 18, ship: '萤火号' },            // 填文本槽、算权重用
  cause: 1790,                                    // 因果链：指向引起它的史实（可为空）
  vis: 'local' }                                  // local（光速向外传播）| secret（只有当事方知道）| cosmic（一律可见，如维度广播）
```

**谁知道：**
- `knows(observerSys, fact, now)`：`vis = cosmic` 时始终可见；`local` 时要求 `now ≥ fact.y + D[fact.sys][observerSys]`。
- 文明 c 知道一件事，指 c 的任一星系满足上式。玩家知道，指飞船当前位置满足上式（与现在的 `stateAt` 一致）。
- `secret` 史实只在当事方之间传播；被抽取星图、被背叛者广播等事件可以把它「公开」，即写一条新的 `local` 史实，`cause` 指回原史实。

**派生记忆（替代 `c.att`/`c.tag`/`c.legacy`）：**
- `memory(c, 'ship')`：按史实算出态度，沿用现在的 400 年衰减；宗教类标签（`god`、`devil`）不衰减。这样 `attOf()` 变成一个查询。
- 史实随文明继承：分裂派、流亡舰队按 `parent` 链继承父文明的史实，比现在 `legacy.slice()` 更干净。

**存储与查询：**
- 按 `type`、`actor`、`target`、`tag` 建倒排索引。
- 10000 年一局大约 2–5 千条史实；`stateLog` 已经是同量级，内存没问题。
- 现有的 `s.timeline` 由史实渲染出来：timeline = 带文本的史实视图。

---

## 3. 事件 Schema

```jsonc
{
  "id": "religion.schism",
  "kind": "auto",                 // auto（逐年抽签）| trigger（被某个触发器唤起）| choice（玩家接触时出现）| card（弹窗）
  "on": "year",                   // 唤起时机：year | civ.crisis | strike.arrive | arrival | option:降临 | fact:<type> ...
  "subject": "civ",               // 对谁求值：civ | sys | ship | pair(civ,civ) | world
  "when": [                       // 前置条件，全部满足才进入候选
    { "fact": { "type": "religion_founded", "target": "$subject" } },
    { "notFact": { "type": "religion.schism", "subject": "$subject" } },
    { "stat": "subject.tech", "gte": 8 },
    { "since": { "fact": "religion_founded", "min": 40 } }      // 距该史实至少 40 年
  ],
  "weight": 0.004,                // 每年的基础概率（auto）或相对权重（choice / trigger）
  "mod": [                        // 乘性修正
    { "if": { "stat": "subject.stab", "lt": 0.4 }, "x": 2.5 },
    { "if": { "fact": { "type": "ship_returned", "target": "$subject" } }, "x": 0.3 }
  ],
  "effects": [                    // 只允许这些操作符（见下）
    { "op": "add", "path": "subject.stab", "v": -0.1 },
    { "op": "setVar", "path": "subject.sects", "v": ["守望派", "离弃派"] }
  ],
  "emit": { "type": "schism", "tags": ["religion", "player_echo"], "vis": "local" },
  "unlock": [                     // 排期：在 delay 年后让某事件进入候选（不是强制发生）
    { "event": "religion.holy_war", "delay": [20, 120] },
    { "event": "religion.reformation", "delay": [60, 300] }
  ],
  "schedule": [],                 // 强制在 delay 后发生（少用，例如武器抵达）
  "forbid": [{ "event": "religion.unified_golden_age", "scope": "subject" }],
  "once": "subject",              // once: world | subject | false
  "cooldown": 0,
  "text": {
    "log": [
      "「{religion}」分裂成「{sect0}」和「{sect1}」：一派相信神终将归来，一派说神早已抛弃了他们。",
      "为了「{ship}」究竟会不会回来，「{civ}」的祭司们吵了一个世纪，最后分成了「{sect0}」和「{sect1}」。"
    ],
    "echo": "你走后，「{religion}」分裂了。"     // 进「你留下的回响」框的短句（可选）
  },
  "imp": 3
}
```

**光延迟规则：**
- `unlock` / `schedule` 的 `delay` 可以写成 `{"light": "fact.sys->subject.home", "plus": [10, 50]}`，
  表示「消息以光速传到 subject 后再过 10–50 年」。一个文明不可能对它还看不到的事作出反应。
- 条件里的 `fact` 默认带 `knownBy: "$subject"`：只匹配 subject 此刻已经看得到的史实。

**效果操作符（封闭集合）：**
`add` / `set` / `setVar`（数值、字符串、列表字段）、`rel`（设关系）、`expo`（按 kind 加暴露）、`spawnCiv`（分裂 / 殖民）、
`moveCiv`、`extinguish`、`strike`（交给 `scheduleStrike`，带 cause）、`shipSupply` / `shipTech`、`imprint`（态度）、
`reveal`（把 secret 史实公开）、`card`（弹窗）、`option`（choice 事件的选项列表）。

**文本模板：**
- 槽位：`{civ}`、`{civ@seen}`（光延迟下观察者看到的名字）、`{sys}`、`{ship}`、`{religion}`、`{y}`、`{fact.N.data.x}` 等。
- 变体按 `hash(seed, eventId, subject, y)` 选；同一局里同一事件连续两次不选同一条（近期变体去重）。
- 支持 `[a|b|c]` 行内小变体，让 20 条模板组合出上百种说法。

---

## 4. 叙事模式：参考了什么、怎么落地

- **Failbetter 的 quality-based narrative（Fallen London / Sunless Sea）：** 状态是一组「品质」（数值和标签），
  storylet 由品质门控，结果改写品质。这里文明属性 + 史实标签就是品质；每个事件是一个 storylet。
- **Crusader Kings / Stellaris 事件链：** 事件带 `mean_time_to_happen` 和修正项，触发后用 flag 和延时触发器串成链，
  比如 Stellaris 的考古遗址分章节推进。这里对应 `weight + mod` 和 `unlock/schedule + delay`。
- **Dwarf Fortress legends：** 世界史就是可以查询的史实数据库，叙事是在上面「读出来」的。这里的史实库即 legends；
  到访报告、遗迹考古（「他们是怎么消失的」）都从史实链里回溯 `cause` 得出。
- **RimWorld storyteller：** 一个导演层看着「张力 / 冷却 / 主题」决定下一件事，而不是纯随机。这里对应第 5 节。

**确定性：**
- 事件求值顺序固定：按 `on` 分阶段；同一阶段内按 `subject.id` 升序，再按事件 id 字典序。
- 掷骰用独立流：`r = hashFloat(seed, eventId, subjectKey, floor(y))`，与 `u.rs` 无关。
- 选项事件（`choice`）的随机结果用 `hash(seed, eventId, sysId, arrivalYear)`，同一存档点重开得到同一结果。
- `test_sim.js` 增加：同种子跑两遍史实库逐条一致；Node == Chrome 史实哈希一致。

---

## 5. 叙事层 / 导演（Storyteller）

**目的：** 玩家引起的线索一定有回报，但不刷屏。

- **线索（thread）：** 每条玩家造成的史实（`tags` 含 `player`）开一条线索，记录 `thread.id`、`root fact`、`heat`。
  链上的事件都带 `thread` 字段。
- **回报保证：** 线索开启 300 年内没有任何后续时，导演把该线索可用事件的权重 ×3；
  1000 年仍无后续，就强制排一个「低调回响」（史书一行字）。
- **反刷屏：**
  - 每个文明每 50 年最多 1 条玩家回响事件；全宇宙每 20 年最多 3 条。
  - 同一线索两次事件间隔至少 40 年。
  - 一次到访报告的「回响」框最多 6 条；按 `imp`、新近程度和「玩家没见过」排序。
- **张力曲线：** 维护全局 `tension`（近期打击、灭绝、战争数）。tension 高时压低新的灾难类事件权重、抬高余波类事件
  （难民、悼念、改革）；tension 长期很低时抬高冲突类事件。跟 RimWorld 的 Cassandra 一样有节奏，但只调权重，不硬插事件。
- **到访对齐：** 玩家到达某星系时，导演检查该星系相关线索里还没兑现的高权重事件，按「已经该发生」的时间补发。
  惰性求值保证这些事件发生在真实年份上，不是为了玩家临时编造。

---

## 6. 编写方式：不碰模拟代码加事件

- 事件放在 `index.html` 里单独的 `<script type="application/json" id="events">`（或 `events/*.json`，构建时拼进去；
  `src3d/build.py` 原样复制）。sim 启动时 `EV.load(JSON)`，校验后建索引。
- 一个文件按主题分组：`religion.json`、`diaspora.json`、`singer.json`、`encounter.json` …… 每个事件 5–30 行。
- 新增事件 = 加一段 JSON。只有需要**新操作符**或**新触发器**时才改代码，而且操作符集合要刻意保持很小。
- 文本和逻辑分开：`text` 可以单独有一个 `zh.json`，方便以后加语言或批量润色。
- 提供 `?evdebug=1`：到访报告里每条事件后面显示事件 id 和触发它的史实链。

---

## 7. 校验工具

`node tools/evcheck.js`（可接进 `test_sim.js`）：

1. **静态检查：**
   - schema 校验；引用的事件、操作符、槽位都存在。
   - 每个 `{slot}` 在该事件的上下文里都能填。
   - `unlock` / `forbid` 图里没有指向不存在事件的边。
2. **可达性（静态）：** 从「根事件」（`on` 是代码触发器或 `year` 且没有史实前置）出发，沿 `emit → when.fact` 和 `unlock` 建依赖图。
   找不到入边的非根事件 = 死事件；被自己的前置 forbid 的 = 自相矛盾。
3. **覆盖率（动态）：** 跑 300 个种子 × 若干脚本玩法（沿用 `tier_stats.js` 的随机巡游，外加「谨慎」「上帝」「广播狂」「长眠」
   四种风格），输出每个事件的触发次数、首次触发年份分布、每条链走到第几步。
   0 次 = 实际不可达；> 每局 5 次 = 可能刷屏。
4. **文本重复度：** 统计一局里同一模板出现次数和相邻重复，超过阈值就报警。
5. **矛盾检测（运行时断言）：**
   - 对已灭绝的文明发事件。
   - 被压平的星系发生「内政」事件。
   - 史实的 `cause` 指向未来。
   - 文明对它光延迟下还看不到的史实作出反应。

---

## 8. 本宇宙的示例事件与链

格式：**事件 id** —— 条件 → 效果 / 史实；解锁 ⊕，封死 ⊖。

**A. 宗教：分裂 → 圣战 / 宗教改革（来自「降临 / 假扮神明」）**
1. `religion.founded`：`option:假扮神明` 或 `降临` 成功 → 史实 `religion_founded{name: 船名+教}`；⊕ `religion.schism`、`religion.temple_radio`。
2. `religion.schism`：tech ≥ 8，距 founded ≥ 40 年，stab 低时权重高 → 两个教派；⊕ `holy_war`、`reformation`。
3. `religion.holy_war`：schism 后，且该文明有邻国或分裂派 → 对邻国宣战，`exp +0.1`；⊖ `reformation`（同一文明）；
   ⊕ `holy_war.crusade_broadcast`（若 tech ≥ 75 且战败，向全宇宙广播敌方坐标，史实 `broadcast{cause: holy_war}`）。
4. `religion.reformation`：schism 后，tech ≥ 35 → 改革派建射电望远镜「寻找船」，`expo radio +0.3`；⊖ `holy_war`；
   ⊕ `religion.seek_ship`（tech ≥ 55 时造星舰出发找你，玩家到访时可能相遇，选项：揭穿 / 继续扮神）。
   玩家「揭穿」→ ⊖ 整条宗教链，⊕ `religion.collapse_of_faith`。

**B. 流亡舰队：殖民地记得被压平的故乡（来自 `foilHit` 的 diaspora）**
5. `diaspora.landfall`：流亡舰队抵达 → `spawnCiv` 殖民地，史实 `founded_by_refugees{homeworld}`；
   ⊕ `diaspora.memorial`、`diaspora.return_pilgrimage`；⊖ 该文明的 `expansion.aggressive` 事件 200 年。
6. `diaspora.memorial`：每 300 年最多一次 → 「{civ} 每年对着 {homeworld} 方向的那幅画默哀」；`silent = true` 概率 +。
7. `diaspora.vengeance`：殖民地 tech ≥ 100 且知道打击来源（史实 `strike{by}` 对它可见）→ 尝试对来源文明回击（`strike`）；
   如果来源是歌者 → ⊖ 回击，⊕ `diaspora.build_black_domain`（黑域权重 ×3）。

**C. 被背叛的盟友广播你的坐标**
8. `ally.betrayed`：史实 `ally{ship, civ}` 存在，之后玩家对该盟友的敌国做了「交换技术 / 结盟」，且被盟友看到
   （光延迟）→ 态度 −0.8，史实 `betrayal`；⊕ `ally.broadcast_revenge`（delay = 光延迟 + 10–80 年）。
9. `ally.broadcast_revenge`：盟友 tech ≥ 45 且不在静默 → `expo bcast +3` 打在玩家母星（或玩家去过的星系），
   史实 `broadcast{actor: civ, cause: betrayal}`；打击报告的因果链会写成「你背叛了 X，X 广播了太阳的坐标」。
   ⊖ `payoff.gratitude_fleet`（该文明永久）。玩家在广播前回访并「道歉 / 补偿」→ ⊖ 本事件。

**D. 考古 → 歌者残曲链**
10. `arch.song_fragment`：考古一个 `ruinTech ≥ 100` 且 `endCause` 含「歌者」的遗迹 → 史实 `song_fragment_1`（secret）。
    ⊕ `arch.song_fragment_2`（只在另一个被歌者打击的遗迹或二维画「凝视」时出现）。
11. `arch.song_complete`：三段残曲都拿到 → 里程碑卡片；解锁选项 `伪装成死星`：把当前星系的暴露度
    按「看起来已被清理」处理 300 年。代价：该星系文明的 `tech` 增长停滞。⊕ `cosmos.singer_notices_you`（极低权重）。

**E. 目睹二向箔：黑域 vs 光速飞船出逃**
12. `witness.foil`：替代 `cosmicStep` 的「看见闪光」分支，文明看到 ≤ 120 光年外的二向箔
    （史实 `flatten` 对它可见）→ 史实 `witnessed_foil`；按 tech 和性格二选一并 ⊖ 另一条：
    - `witness.black_domain`（tech ≥ 100，学者 / 官僚性格权重高）→ 封闭，⊖ 该文明所有外交和扩张事件。
    - `witness.lightspeed_exodus`（tech ≥ 90，好战 / 商人权重高）→ 造光速飞船逃离：`spawnCiv` 一支离开星图的远征队，
      留下更强的曲率航迹（`expo trail +1.5`，可能把歌者引来）；⊕ `exodus.lost_signal`（数百年后收到它在星图外的最后信号）。

**F. 归零者接触链**
13. `cosmos.zero_broadcast`：`dimStrikes ≥ 8`（现有阈值）→ 宇宙级史实，`vis: cosmic`；⊕ `zero.recruit`。
14. `zero.recruit`：tech ≥ 120 的文明 → 加入「回归运动」：停止发动降维打击（⊖ 它的 `strike` 类事件），或拒绝（⊕ `zero.schism`）。
15. `zero.contact_ship`：玩家飞船科技 ≥ 110 且已拿到歌者残曲 → 选项事件：交出残曲换「维度修复」的一小步
    （`dimOf` 回升 0.002）或拒绝；交出 → ⊖ `arch.song_complete` 的伪装选项。

**每条链的开关关系汇总：** holy_war ⟂ reformation；black_domain ⟂ lightspeed_exodus；
betrayal ⊖ gratitude_fleet；揭穿神迹 ⊖ 整条宗教链；交出残曲 ⊖ 伪装死星。
每局走到哪条分支由性格、数值和光延迟可见性共同决定，所以每局不同，但事后都能沿 `cause` 讲得通。

---

## 9. 实施计划

| 阶段 | 内容 | 规模估计 |
|---|---|---|
| **P1 · 引擎 + 回响迁移（推荐先做）** | 史实库（追加、索引、`knows()` 光延迟查询）；事件解释器（when / weight / mod / effects / emit / unlock / forbid / once / cooldown / 模板）；独立随机流；把 `echoStep`/`echoText`/`descendants`/`bigEvents` 约 25 段逻辑迁成 JSON；`evcheck.js` 静态检查 + 覆盖率报告；`test_sim.js` 加史实确定性断言 | 约 1.5–2 个工作日；sim 新增约 400 行，删掉约 150 行 |
| P2 · 叙事层 | 线索、回报保证、反刷屏配额、张力曲线、到访补发；报告里的「回响」框按导演排序 | 约 1 天 |
| P3 · 迁移模拟里的离散事件 | `crisis`/`interactions`/`battle` 的文本和规则、`witness.*`、`diaspora.*`、`cosmos.*`；53 处直接写文本改为 `emit` | 约 1.5–2 天；风险最高，统计数字要重新对一遍 |
| P4 · 接触场景数据化 | `encounter`/`interact` 的性格场景和选项迁成 `choice` 事件；UI 只渲染事件给出的选项 | 约 1.5 天 |
| P5 · 内容扩充 + 文本 | 第 8 节的链全部落地，每个常见事件 3–5 条变体，`?evdebug=1` | 约 1–2 天，可持续加 |

P1 做完就能看到效果：回响从固定 4 个阶段变成能分叉的链；并且之后加事件不用再改 sim 代码。
P1 不改物理，现有统计（打击率 37%、回响占比 73%）应该基本不变，可以拿它当回归基准。

---

## 10. 风险与对策

- **组合爆炸：**
  - 事件只认少量「品质」（属性、性格、史实标签），不允许任意组合条件。
  - 每条链限深 4–5 步。
  - 覆盖率工具抓「理论可达、实际 0 次」和「每局刷屏」的事件。
  - 导演配额兜底。
- **矛盾：**
  - 史实只追加不修改。
  - 灭绝、压平、黑域会自动 ⊖ 该主体的所有内政事件（引擎内置，不靠作者记得写）。
  - 运行时断言见第 7 节；光延迟检查默认开启，作者必须显式写 `knownBy: "any"` 才能绕过。
- **文本重复：**
  - 每个常见事件至少 3 条变体，外加行内 `[a|b]`。
  - 近期变体去重。
  - 重复度报告。
  - 高频事件（贸易、崩溃）只在史书留一行，不进回响框。
- **确定性被破坏：** 独立随机流加固定求值顺序；CI 里跑 Node == Chrome 史实哈希比对。
- **性能：** 逐年对每个文明遍历全部 auto 事件太慢。按 `on` 和 `subject` 分桶；前置条件里先查最便宜的史实索引；
  预计 10000 年一局增加 < 20% 耗时。P1 先测。
- **旧存档和种子：** P3 之后同种子的历史会变。记录 `EV_VERSION`，URL 里的 plan 只保证同版本可复现。

