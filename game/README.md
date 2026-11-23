# 相对论宇宙 · 正式版客户端（`game/`）

目标：让第一次打开它的人说出「哇哦」，并且想转发。画面要配得上《三体》的宇宙法则，玩法要让「你离开以后，世界在你看不到的地方继续走」变成真正的情绪冲击。

**物理硬规则高于一切视觉效果**（详见 `docs/01-REQUIREMENTS.md` 第 2 节）：不超光速；时间膨胀用真实洛伦兹因子；曲率驱动只是把飞船推到无限接近 c；常规推进永远接近不了 c；光延迟是世界规则。视觉可以美术化（stylized），但方向、趋势和因果必须正确。

## 运行

- 直接用浏览器打开 `game/index.html`（file:// 可用，没有 ES module），或在仓库根目录 `python3 -m http.server 8765` 后打开 http://127.0.0.1:8765/game/
- 单文件分享版：`python3 game/build.py` 生成 `game/dist/relativity-universe.html`
- 模拟内核只有一份：`prototype/index.html` 的 `<script id="sim">` 与事件库。改了模拟/事件后必须运行 `python3 game/build.py` 重新生成 `game/gen/sim.js`（也要 `python3 prototype/src3d/build.py` 更新原型 3D 页）

URL 参数：

| 参数 | 作用 |
|---|---|
| `?seed=xxx` | 指定宇宙种子 |
| `?scene=warp&t=6.5` | 截图/调试：直接进入某场景（`opts.demo = true`），时间冻结在第 6.5 秒 |
| `&variant=...` | 传给场景的变体（例如 foil 的 `home` / `demo`，warp 的 `cryo`） |
| `&dpr=1` | 限制像素比 |
| `&seed=x&plan=...` | 复现一段旅程（格式同原型，见 `docs/ARCHITECTURE.md` 第 5 节） |

## 目录与所有权（一个文件只有一个负责人）

| 文件 | 内容 | 负责人 |
|---|---|---|
| `index.html`、`build.py`、`src/core/util.js`、`src/core/glsl.js`、`src/core/engine.js`、`src/ui/base.css` | 外壳、构建、共享工具、渲染器与场景切换 | coordinator（需要改动请在看板上提） |
| `src/fx/sky.js`、`src/fx/blackhole.js`、`src/scenes/galaxy.js` | 银河背景（所有场景共享）、黑洞/黑域透镜、主地图与离开期间回放 | galaxy |
| `src/scenes/warp.js` | 第一视角群星飞行与曲率航行（C7）、常规推进冬眠航行 | warp |
| `src/fx/planets.js`、`src/scenes/foil.js`、`src/scenes/title.js` | 程序化行星/太阳、二向箔吞没太阳系（C6）、开场电影 | cinema |
| `src/main.js`、`src/ui/ui.js`、`src/ui/ui.css`、`src/ui/share.js`、`src/core/audio.js` | 游戏流程、全部 HTML 界面、分享卡、程序化音频 | ux |
| `prototype/index.html`（模拟/界面）、`prototype/events/events_src.js`、`prototype/test_sim.js`、`prototype/tools/*` | 模拟内核与事件库的玩法改进 | sim |

`gen/`、`dist/`、`vendor/` 是生成物或第三方，不要手改。**不要 git commit**（coordinator 统一提交）。

## 代码约定

- 经典脚本 + IIFE，挂在全局 `window.RU` 下；不用 ES module，保证 file:// 能直接玩。`THREE` 是全局（r187，含 `OrbitControls / EffectComposer / RenderPass / UnrealBloomPass / OutputPass / ShaderPass`）。
- 坐标：1 世界单位 = 1 光年；模拟坐标 `(x, y)` → 世界 `(x-100, h, y-100)`；银盘在 XZ 平面。**星系的视觉高度必须用 `RU.util.sysWorld(u, s)`**，地图与第一视角才能对上。
- 共享工具见 `src/core/util.js`（缓动、确定性随机、黑体 `planckRGB`、`aberrate`、`doppler`、`fmtYears`、`fade`、`canvasTex`…）和 `src/core/glsl.js`（simplex/fbm、`planckRGB(T)`、`aberrate/deaberrate/dopplerShip`、`dirToEquirect`）。别再各写一份。
- 渲染器用 ACES 色调映射 + 辉光，HDR 线性空间：亮的东西直接给 >1 的值。收尾 pass 已有暗角、颗粒、色散、宽银幕黑边（`E.letterbox(true)`）、全屏闪光（`E.flash(0.8, 0xffffff)`）。
- 界面文字用中文；电影字幕用 `.cine-title / .cine-line / .cine-small`（宋体）。
- 性能：MacBook（Apple Silicon）上 60fps，DPR 1.75。粒子总量控制在 ~50 万以内，全屏 raymarch 要能降级。

## 场景约定（`src/core/engine.js` 顶部有完整注释）

```js
RU.defineScene('warp', function (E) {
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1e6);
  return {
    scene: scene, camera: camera,
    bloom: { strength: 1.0, radius: 0.6, threshold: 0.7 },   // 可选
    enter: function (opts) { /* 可返回 Promise：电影段落播完或被跳过时 resolve */ },
    update: function (dt, t) { /* t = 进入场景后的秒数；截图模式下固定为 ?t= */ },
    exit: function () { /* 清理自己的 DOM 与监听 */ }
  };
});
// 切换：RU.engine.go('warp', opts) → Promise
```

场景要能在 **`opts.demo === true`**（没有游戏数据）时自己造一份数据演示，这样 `?scene=xxx&t=秒` 能直接截图。电影段落的状态尽量写成时间 `t` 的纯函数，截图模式才能冻结到任意一帧。每个电影段落都要能跳过（Esc / 空格 / 点击「跳过」）。

### 各场景的 `enter(opts)` 接口（ux 的 main.js 按这个调用）

- `title`：`enter({})` → Promise 解析为 `{ seed }`（玩家点「开始」时）。可选 `{ action: 'demo-foil' }` 表示玩家想先看二向箔演示。
- `galaxy`：
  - `enter({ u, mode: 'map' })`：可交互地图。点击恒星 → `RU.emit('select', sysId)`；双击聚焦。场景方法：`setSelected(id)`、`setRoute(fromId, toId, mode)`（null 清除）、`refresh()`（状态变化后）、`focus(sysId)`、`setGodView(bool)`。
  - `enter({ u, mode: 'replay', t0, t1, res })` → Promise（回放完或被跳过）。按时间压缩回放离开期间的打击、二维化扩张、文明兴衰；**明确标注「上帝视角回放」**，并把光延迟画出来（事件发出的光球以 c 扩张，到达飞船时「你才看到」）。
- `warp`：`enter({ u, from, to, mode, trip, res })` → Promise（抵达或跳过）。`trip` 来自 `SIM.travel` 的结果（`d, ext, ship, gamma, label, depart, arrive, died, caught, frac`）。`mode` 以 `w` 开头为曲率，否则常规推进（冬眠）。`trip.caught` = 被二维前沿追上。
- `foil`：`enter({ variant: 'home' | 'demo', u, year })` → Promise。二向箔吞没太阳系，地球视角终局。

### 事件总线

`RU.on(name, fn)` / `RU.emit(name, data)`。约定的事件：`select`（sysId）、`scene`（场景名）。需要新增就在这里登记。

### 音效（`RU.audio`，ux 实现；其他人只管调用）

`RU.audio.mood('title'|'map'|'warp'|'cryo'|'replay'|'foil'|'report'|'silence')`、`RU.audio.param('gamma', γ)`、`RU.audio.param('tension', 0..1)`、`RU.audio.cue(name)`：
`ui-hover, ui-click, select, launch, warp-engage, warp-exit, cryo-in, cryo-out, photoid-incoming, photoid-impact, foil-touch, foil-spread, flatten, broadcast, light-arrives, arrival, card-bad, card-good, title-swell, title-hit, death`。

## 截图自检（必做：每个视觉改动都要亲眼看）

沙箱里跑不了 Chrome，命令必须带 `BypassSandbox: true`，并且**每个人用自己的 `--user-data-dir`**（可并行）。参数顺序保持一致，用户批准一次后可以自动通过：

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir=/tmp/ruchrome-<你的名字> --no-first-run --window-size=1600,900 --virtual-time-budget=4000 --screenshot=/tmp/ru-<你的名字>-<描述>.png "file:///Users/windam/github/windameister/relativity-universe/game/index.html?scene=warp&t=6.5"
```

一张图大约 20–60 秒，挑关键帧截。用 `read_file` 看 PNG。页面里的报错会显示在左下角 `#errors`（红字），截图里能看到。

Node 在沙箱默认路径下不可用，用：`~/.nvm/versions/node/v22.23.4/bin/node`。
