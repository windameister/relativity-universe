# 当前原型架构

本文描述 **现在已经在跑的代码**，不是正式版设想。读完应能改事件、跑测试、重建 3D 页，而不必先把两个 HTML 全部读完。

所有可玩代码都在 `prototype/`。2D 和 3D 共用同一份模拟内核。

## 1. 文件怎么分工

| 路径 | 作用 | 可否手改 |
|---|---|---|
| `prototype/index.html` | 2D 游戏。内含 CSS/UI、`<script id="events">` 事件 JSON、`<script id="sim">` 模拟内核、以及 2D 地图与交互 | 改模拟和 UI 改这里 |
| `prototype/events/events_src.js` | 90 个事件的源数据。运行 `node events/events_src.js` 会把 JSON 嵌回 `index.html` | **改事件改这里** |
| `prototype/src3d/g3d.js` | 3D 场景、特效、时间压缩回放（替换 2D 地图那段） | 改 3D 表现改这里 |
| `prototype/src3d/three.bundle.js` | three.js r187 + OrbitControls / EffectComposer / UnrealBloomPass / OutputPass（esbuild 打包） | 一般不要手改 |
| `prototype/src3d/build.py` | 从 `index.html` 复制模拟和界面，换成 3D 场景，写出 `index3d.html` | 改构建流程时才动 |
| `prototype/index3d.html` | 生成物，约 1MB，单文件即可玩 | **不要手改，会被 build.py 覆盖** |
| `prototype/tools/simload.js` | 在 Node 里抽出 `id="sim"` 和事件 JSON，得到 `SIM` 对象 |  |
| `prototype/tools/evcheck.js` | 事件库静态检查、可达性、覆盖率、文本重复度 |  |
| `prototype/tools/plan.js` | 按 URL 里的 `plan` 在 Node 里跑一局 |  |
| `prototype/tools/facthash.expr.js` | 给测试用的史实哈希表达式，供 Node / Chrome 对照 |  |
| `prototype/test_sim.js` | 物理自检、确定性、150 局接触统计、长时间宇宙抽样 |  |
| `prototype/stats.js` / `find.js` | 早期小工具，不是主路径 |  |

改完事件或模拟后的标准顺序：

```bash
cd prototype
node events/events_src.js
python3 src3d/build.py
node tools/evcheck.js --static
node test_sim.js
```

`index.html` 和 `index3d.html` 都可以直接用浏览器打开，或在 `prototype/` 下执行 `python3 -m http.server 8765`。

## 2. 模拟内核（`SIM`）

内核是纯逻辑，不碰 DOM，可在 Node 里加载。浏览器里由页面脚本调用；Node 里由 `simload.js` 用 `new Function` 取出 `module.exports`。

入口对象是 `SIM`，常用方法：

- `createUniverse(seed)`：生成这一局宇宙。必须先加载事件库，否则会抛「事件库未加载」
- `remember(u, sysId)`：记录玩家对某星系「离开时」看到的状态，供回访对比
- `simulateTo(u, t)`：把宇宙惰性推进到外部时间 `t`
- `tripCalc(u, toId, mode)` / `travel(u, toId, mode)` / `hibernate(u, years)`
- `interact(u, sysId, optionId)`：执行接触选项
- `loadEvents(json)`：加载事件库

### 2.1 时间与惰性求值

所有文明演化都在「星系静止系」的坐标时里按年推进（`u.simYear` 为整数年，`u.time` 可以是旅途中的精确时刻）。

玩家飞行或冬眠时，界面不会一年一年地模拟。抵达（或醒来）时调用 `simulateTo`，把经过的外部年份一次性推完。这就是惰性求值：没人看着的那些世纪，仍然按同一套规则走完，只是算账发生在你重新看世界的那一刻。

### 2.2 确定性

同一种子 + 同一串操作 = 同样历史。为此：

- 宇宙随机数状态是可序列化的 `u.rs`（Mulberry 一类的 32 位算法）
- 不用各引擎之间末位可能不同的 `Math.exp` / `pow` / `sin` / `cos` / `hypot`，改用自写的 `DM`（只用 IEEE 精确的加减乘除和平方根）。模拟是混沌的，末位差几百年后会变成另一部历史
- 事件掷骰走独立流 `hrand`，按 `hash(seed, eventId, subjectId, year)` 一类的方式取值，**不消耗** `u.rs`。因此增加一段纯文本回响，不会改变物理史
- `test_sim.js` 会断言两次跑同一计划逐字相同，并用 `facthash.expr.js` 对比史实哈希。第 5 轮之后，Node 与 Chrome 在抽检中已逐字一致
- 「继续 / 离开」这类纯 UI 选项不得消耗随机数（有回归测试）

### 2.3 宇宙生成

`createUniverse(seed)` 大约会做这些事：

- 22 + [0,8) 个恒星系统，散在约 200×200 光年的局部（坐标原点附近以 100,100 为图心）
- 70% 落在两条带状悬臂上，其余随机散点；彼此至少相距 13 光年
- 0 号永远是「太阳」，G 型、宜居、地球文明在此，起始科技约 50
- 保证至少一颗黑洞；另有 4 片装饰性星云
- 再生成 2–4 个外星文明，科技从石器到星际不等
- 歌者放在距图心 130–170 光年处（星图之外），科技 150，不可接触
- 预计算距离矩阵 `u.D[i][j]`
- 飞船：随机舰名（萤火号、回声号等），起始科技 60，补给 100，舰员生理年龄 30，寿命上限 105

恒星类型包括 O/B/A/F/G/K/M、白矮星、中子星、黑洞等，宜居概率随类型变化。

### 2.4 文明每年如何推进

每个文明的核心量：`pop`（人口，亿）、`tech`、`res`（资源）、`exp`（扩张欲，性格，基本不变）、`stab`（稳定度）。

科技门槛大致为：8 农耕 / 20 工业 / 35 信息 / 55 星际 / 75 星海。每年的差分（带随机项）写在 `index.html` 模拟内核开头的长注释里，摘要如下：

1. 承载力由所辖星系丰度和科技决定
2. 人口向与扩张欲有关的目标份额增长，扩张欲强的文明会把自己推向资源紧张
3. 资源、稳定度随压力、战争、贸易变化；稳定度过低则科技倒退，并可能爆发危机（内战分裂、革命改名、灭绝）
4. `tech ≥ 55` 开始星际殖民；`tech ≥ 40` 开始能探测附近文明，接触后走向贸易或战争
5. `tech ≥ 75` 的文明，若探测到明显更弱的文明，可能发动光粒清理
6. 空的宜居星系有极小概率诞生新的石器时代文明

这些连续过程目前仍在代码里。崩溃文本、改名、日常外交等离散叙事，设计上应迁到事件库（P3），但还没有全部迁完。

### 2.5 航行

模式字符串：常规推进是 `"0.01"` / `"0.03"`；曲率是 `"w0.999"` / `"w0.9999"` / `"w0.99999"`（前缀 `w` 表示曲率）。

```
β = 速度 / c
γ = 1 / sqrt(1 - β²)
外部时间 ext = 距离 / β
船上时间 ship = ext / γ
生理衰老 bio = 曲率 ? ship : ship / 50
```

其它常数：

- `CRYO = 50`：冬眠时生理衰老为正常的 1/50
- `LIFESPAN = 105`：舰员生理年龄上限
- `WARP_SUPPLY = 4`：启动曲率至少要 4 点补给
- 补给消耗：曲率 `4 + 距离/50`，常规 `外部时间/100`
- 曲率出发和抵达各留一笔航迹暴露（`TRAIL = 0.35`，会衰减）
- 补给不足以启动曲率时，自动改用常规 0.03c，并在预览里警告

没有任何模式能让 `ext < 距离`。二维前沿以光速扩张，常规推进跑不掉。

### 2.6 光延迟与可见状态

每个星系有 `stateLog`：每当所有权、死寂、压平、封入黑域等发生变化，就记一条带年份的快照。`stateAt(s, y)` 返回 y 年或之前的最后一条，用来回答「那一年看起来是什么样」。

从观察者所在星系 O 看星系 S，可见状态是 `stateAt(S, now - D[S][O])`。史实的可见性同理：默认要等光从史实发生地传到观察者。`vis = cosmic` 的史实（如维度广播）例外，一律可见；`secret` 只在当事方之间。

地图、望远镜、远方消息、接触文案里提到的母星近况，都应当走这套可见性。上帝视角是调试 / 回放选项，不是默认世界观。

### 2.7 黑暗森林、歌者、二向箔、维度

暴露度按来源分账，上限 10，各自衰减（航迹半衰期大约几十年，广播慢得多）。来源包括无线电、曲率航迹、坐标广播、星图泄露、战争曝光、文明间联系等。

打击都有飞行时间，不是瞬发：

- 光粒：飞行时间 = 距离 / 0.99c。普通星海文明可能对弱者使用；歌者对不够「值得」二向箔的目标也用它
- 歌者：先要等坐标的光传到它那里，再以一定概率出手（暴露度 ≥ 1.0 后概率随暴露度上升），武器再以 0.99c 飞回。目标是星际以上文明或暴露度 ≥ 2.5 时用二向箔，否则用光粒
- 二向箔命中后，以命中点为中心，三维空间以光速跌成二维，半径每年 +1 光年，扩张到约 10–22 光年后停止。半径只增不减；被吞没的星系永久变成「二维的画」
- 科技 ≥ 75 的文明有机会在抵达前逃出一支流亡舰队，成为新文明
- 文明按光延迟看到附近打击的闪光后：科技 ≥ 45 可能全面静默；科技 ≥ 100 可能建造黑域（局部光速 16.7 km/s），从此绝对安全，但与宇宙隔绝、科技冻结
- 宇宙维度 ≈ `3 − 0.012 × 降维次数`（含星图之外偶尔发生的降维）。累积后会出现常数漂移、归零者「回归运动」广播、低维化末期

## 3. 史实库与事件引擎

### 3.1 史实

`u.facts` 只追加、不修改。一条史实大致包括：时间、地点、类型、主体、客体、标签、附加数据、可选的 `cause`（指向引起它的另一条史实）、可见性。

模拟本身会写入如 `extinct`、`war`、`strike_launch`、`cleared`、`diaspora`、`extract` 等；玩家行为写入 `god`、`devil`、`gift_s`、`gift_l`、`teach`、`trade`、`ally`、`starmap` 等。事件发生后再 `emit` 新的史实（各类 `echo_*`、`butcher`、`schism`……）。

查询默认按光延迟，只匹配主体已经知道的事。可以用 `known: "any"` 显式绕过（作者必须写明）。

### 3.2 事件数据

源文件 `events/events_src.js` 用一个小 DSL 把事件推进数组 `E`，导出 `{ version: 6, events: E }`。当前 90 个。字段的设计说明见 `docs/EVENT_LIBRARY_DESIGN.md` 第 3 节；实现里常见写法：

- `id`、`on`（year / pending / fact:类型 / arrival / recognize / report / choice）
- `when`：前置条件，全部满足才进入候选
- `need`：按已有史实类型做廉价预筛
- `p`：每年基础概率或相对权重（设计稿里叫 `weight`）
- `once`：`subject` / `world` 等限次
- `echo: true`：作为「你留下的回响」展示
- `emit`、`effects`、`forbid`、`unlock`、`options`、`outcomes`、`card`、`text`

条件（实现已支持的）：`fact` / `noFact`、`stat`、`temper`、`earth`、`alive`、`rel`、`any` / `all` / `not`、`since`、`flag` / `noflag`、`homeSeen`、`shipKnows`、`near`、`here`、`tier`、`scene`、`diaspora`、`reach`、`atWar`、`bind`、`calc`。

操作符：`add` / `set` / `expo` / `imprint` / `ship` / `rel` / `strike` / `protect` / `refugees` / `forbid` / `leak` / `pass` / `silence` / `evacuate`。事件不能执行任意 JavaScript。

文本模板可引用 `{civ}`、`{ship}`、`{g.y}`、`{h.act}` 等槽位，也支持行内 `[a|b]` 变体。

### 3.3 现有事件分组（90）

- `echo.*`：按关系类型去重的回响（礼物、交换技术、贸易、结盟、星图、扣押等）
- `echo.enabled_*`：把你留下的技术写成间接因果
- `ally.butcher` / `ally.war_home` / `ally.confront` 以及 `ally.mediate` / `question` / `side` / `retaliate`
- `home.hunter*`、`home.archive*`、`home.refugees`、`refugee.*`
- `recog.*`、`payoff.gratitude_fleet`、`payoff.revenge_fleet`
- `rel.*` / `dev.*`：信仰与「被当成恶魔」两条线（创立、神魔转换、分裂、圣战、殉道、改革、朝圣、伪先知、呼唤、使者、揭穿或祝福）
- `warn.*`：暴露预警、劝他们静默、看见发射、抵达时组织撤离
- `card.*`：你帮过的文明灭绝、太阳系被压平、母星易主、地球文明消失

接触选项的主体（贸易、假扮神明等）目前仍有很大一部分在 `encounter` / `interact` 的代码里，还没有完全变成 `choice` 事件。

### 3.4 故事是怎么被讲出来的

到访报告会综合：当地现在相对「离开时」的变化、史料、回响、远方消息（光已到达的）、因果句、大事件卡片、接触场景。回响按关系去重，并过滤已经在上文出现过的句子。属于玩家留下的史料用金色标出。

所谓「叙事层 / 导演」在设计稿 P2，还只做了部分配额和去重，没有完整的张力曲线系统。

## 4. 界面、3D 与回放

2D 页用 canvas 画俯视星图，点击恒星、选推进方式、启航或冬眠，用模态框展示报告和选项。

3D 页的交互相同，但地图换成 WebGL 场景：

- 拖动旋转、右键平移、滚轮缩放、双击聚焦；静置时镜头会慢慢漂移
- 默认看到的是光延迟后的样子；可打开「上帝视角」看真实现状、歌者和在途武器
- 每次飞行或冬眠后，先按事件真实发生时刻做时间压缩回放（当前**不计光延迟**），再弹出报告
- 调试参数（见 `src3d/README.md`）：`freeze=` 把回放冻在第 N 秒、`replay=0` 跳过回放、`focus` / `dist` / `cam` / `az` 调镜头、`dpr=`

`src3d/tools/` 里的 `shot.js` / `play.js` / `info.js` 是无头 Chrome 截图和调试脚本，依赖本机 Chrome 与 `puppeteer-core`，不是游玩所必需。它们现在用相对路径定位 `index3d.html`。

## 5. URL 计划格式

`?seed=dip7&plan=6:w0.9999:贸易,h:50:结盟` 可复现一局，也是报告里附带 bug 复现链接的格式。

每一段以逗号分隔：

- `星系id:模式:选项`：旅行到该星系（模式可省略，默认接近 `w0.9999`），到达后选某个选项
- `h:年数` 或 `h:年数:选项`：原地冬眠
- 选项文本按 URL 解码，需与当时界面上真实存在的选项一致；强行选没有的选项会被拒绝
- `tools/plan.js` 默认**不执行计划里最后一站的选项**（和页面 `?plan=` 一致，方便停在报告页），加 `--all` 才会执行

例：

```bash
cd prototype
node tools/plan.js dip7 "6:w0.9999:贸易,7:w0.9999:交换技术,h:50:结盟"
node tools/plan.js zero "2:w0.9999:广播坐标,h:300" --all --json
```

## 6. 测试与统计

在 `prototype/` 目录：

```bash
node test_sim.js              # 主回归：物理、确定性、史实哈希、离开不消耗 RNG、150 局接触、30 个宇宙 × 10000 年
node test_sim.js v            # 更啰嗦的输出
node tools/evcheck.js --static
node tools/evcheck.js         # 再加 300 局覆盖率（5 种玩法 × 60 个种子）和文本重复度；较慢
node tools/evcheck.js --n 100
```

`test_sim.js` 会检查的不变量包括：不超光速、文明数值有限、补给在 0–100、舰员不超过寿命、已压平的星系不会再被打、二维半径单调不减、维度打击次数单调、暴露度有界。

在**仓库根目录**跑统计（脚本已改成指向 `prototype/`）：

```bash
node playtest/curse_stats.js
node playtest/tier_stats.js
node playtest/echo_stats.js
node playtest/r6_faith_stats.js
node playtest/round2/home_stats.js
node playtest/round2/missionary_stats.js
```

玩家视角的点按钮试玩，原先依赖箱环境里的 `/workspace/playtest-tool/a.js` 和 puppeteer，没有放进本仓库。要做真人式回归，需在本机另接无头浏览器，或手工按报告里的 URL 复现。

## 7. 已知的结构债务

- 模拟、事件 JSON、2D UI 仍挤在同一个 `index.html` 里，文件很大，正式版应拆模块（见路线图 C）
- `index3d.html` 是生成物，和 `index.html` 各嵌一份事件库，忘记跑 `build.py` 就会出现「2D 已更新、3D 还是旧事件」
- 接触选项、危机、日常战争等仍有硬编码文本，和事件库并存
- 3D 回放默认不计光延迟
- `src3d/tools` 仍假设能调用 `/usr/bin/google-chrome`，在 macOS 上要改可执行文件路径才能用

读代码时，优先看 `index.html` 里 `SIM` 开头的两块长注释（文明差分，以及黑暗森林 / 歌者 / 二向箔），再看 `events/events_src.js` 的分组，最后才需要下到 3D。
