# 相对论宇宙

程序化生成的星系尺度沙盒。你驾驶一艘飞船在近乎真实的相对论时空里旅行：曲率驱动可以把船上时间压到极短，外面已经过了几个世纪。你离开过的文明会继续演化，也可能因为你留下的航迹、星图或礼物，被黑暗森林里的清理者盯上。

这是一份**可玩的网页原型**归档，供在本机用更强的模型做正式版时接手。正式版的目标是：更好玩，画面更逼真、更震撼。当前原型还不是那个版本。

- 需求与硬规则：[`docs/01-REQUIREMENTS.md`](docs/01-REQUIREMENTS.md)
- 到目前为止的迭代：[`docs/02-ITERATION-HISTORY.md`](docs/02-ITERATION-HISTORY.md)
- 已知问题和下一步：[`docs/03-ROADMAP.md`](docs/03-ROADMAP.md)
- 当前代码怎么工作：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 事件库设计（P1 已落地）：[`docs/EVENT_LIBRARY_DESIGN.md`](docs/EVENT_LIBRARY_DESIGN.md)

目前只维护本地仓库，打磨完成前先不发布。以后如果公开，加上远程再推即可。仓库里没有密钥或私人账号信息。

## 现在能玩什么

- **2D 原型** `prototype/index.html`：完整模拟 + 交互。地图是俯视银盘局部，带光延迟。
- **3D 原型** `prototype/index3d.html`：同一套模拟，用 Three.js 画恒星、星云、曲率航迹、光粒冲击和二向箔扩张，离开期间会做时间压缩回放。
- **事件库第一阶段**：90 个事件写成数据，回响、间接因果、盟友变屠夫、母星成猎手、流亡者认人、宗教分叉，都已经能在游戏里触发。

截图在 `assets/screenshots/`。试玩报告和关键瞬间在 `playtest/`。

## 怎么运行

不需要安装依赖，也不需要构建。用浏览器打开 HTML 即可。

推荐用一个本地静态服务器，避免个别浏览器限制 `file://`：

```bash
cd prototype
python3 -m http.server 8765
```

然后打开：

- 2D：<http://127.0.0.1:8765/index.html>
- 3D：<http://127.0.0.1:8765/index3d.html>

也可以直接把 `prototype/index.html` 或 `prototype/index3d.html` 拖进浏览器。

常用 URL 参数：

| 参数 | 作用 |
|---|---|
| `?seed=dip7` | 指定宇宙种子，同一种子 + 同样操作 = 同样历史 |
| `&plan=6:w0.9999:贸易,h:50` | 自动按计划旅行 / 冬眠 / 选选项（见架构文档） |
| `&replay=0` | 3D 跳过回放 |
| `&godView` 或页面上的「上帝视角」 | 显示真实现状、歌者和在途武器（默认你只看到光已经传到的样子） |

改事件库之后，在 `prototype/` 目录执行：

```bash
node events/events_src.js          # 把 90 个事件嵌进 index.html
python3 src3d/build.py             # 用更新后的模拟重生成 index3d.html
node tools/evcheck.js --static     # 静态检查
node test_sim.js                   # 物理自检 + 确定性 + 150 局冒烟
```

统计脚本在仓库根目录运行，例如 `node playtest/echo_stats.js`。细节见 `playtest/README.md` 和 `docs/ARCHITECTURE.md`。

## 仓库结构

```
README.md
docs/                  需求、迭代史、路线图、架构、事件库设计
prototype/             可玩原型（2D / 3D 都是单文件 HTML）
  index.html           2D，内含模拟内核 + 事件 JSON
  index3d.html         由 src3d/build.py 从 index.html 生成，不要手改
  events/events_src.js 事件库源（改这里，再嵌回去）
  tools/               evcheck / plan / simload / facthash
  src3d/               3D 场景源（g3d.js）和 three.js 包
  test_sim.js          无界面回归
playtest/              玩家视角试玩报告、统计脚本、代表性截图
assets/screenshots/    2D / 3D 展示图
```

没有把试玩过程中所有重复截图都收进来，只留报告里引用的和能说明问题的那些。

## 给下一个模型的入口

1. 先读 `docs/01-REQUIREMENTS.md` 里的硬规则。尤其是：曲率驱动**不能超光速**，只是把飞船推到无限接近 c；时间膨胀必须走真实的洛伦兹因子；常规推进无论什么能源都不可能接近 c。
2. 再读 `docs/ARCHITECTURE.md`，弄清模拟内核、惰性求值、光延迟、史实库和事件库怎么分开。
3. 用上面的命令跑通 `test_sim.js` 和 `evcheck.js --static`，再打开 3D 页亲手玩一局。
4. 已知缺陷和「正式版」的建议架构在 `docs/03-ROADMAP.md`。那些架构选项是建议，由发起人决定。
5. 改玩法或事件时，优先改 `events/events_src.js` 或模拟内核，再 `build.py` 生成 3D，不要直接编辑 `index3d.html`。

## 当前版本的位置

事件库第一阶段已经让故事能对上玩家早先的选择，例如：假扮神明的文明会走到伪先知和圣战，却仍可能被歌者顺着你的曲率航迹抹掉。接下来最急的是：宗教线太单一、大事件卡片偏多、约 10 个事件在 300 局测试里从未触发，然后才是补给经济和 3D 回放节奏。这些都不妨碍把本仓库当作正式版的起点。
