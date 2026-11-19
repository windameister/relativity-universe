# 试玩报告与统计

这些是以玩家视角做的试玩，不是开发自测日志。报告里的 URL、种子和截图，都是当时那一版原型的证据。

历史叙述见 `docs/02-ITERATION-HISTORY.md`。本目录脚本的默认路径已经改到仓库里的 `prototype/index.html`。

## 报告该按什么顺序读

1. `REPORT.md` — 第一轮（谨慎 / 神明 / 广播 / 长眠）。发现「到访即死刑」、拦截墙、以及若干硬 bug。
2. `FIXES-r5.md` 与 `stats-after-*.txt` — 第 5 轮修复后的对照统计。
3. `round2/REPORT-r2.md` — 第二轮（外交家 / 传教士 / 拾荒者 / 末日广播者）。提出事件库和四条优先故事线。
4. `FIXES-r6.md` — 事件库第一阶段 + 四条线 + 第二轮 bug 的修复说明。这是当前原型的基准。
5. `run1-cautious.md` — 第一轮里 cautious1 的简短记录。
6. `playthrough-sample.txt` — 更早的 `test_sim.js` 文本通关抽样，便于看早期口吻和事件。

## 截图

本目录只收了报告引用过的、以及能说明 r5/r6 变化的代表性截图，没有把所有重复帧都放进来。展示用的 2D/3D 图在 `../assets/screenshots/`。

文件名里的 `r1`–`r6` 对应各轮；`round2/` 里 `A`–`D` 对应第二轮四局，`B3d` / `D3d` 是 3D 回放。

## 统计脚本

在仓库根目录运行：

```bash
node playtest/curse_stats.js      # 曲率到访后被打击的概率等
node playtest/tier_stats.js       # 接触层级、拦截墙占比
node playtest/echo_stats.js       # 回响出现率与重复度
node playtest/r6_faith_stats.js   # 宗教线能走多远
node playtest/round2/home_stats.js
node playtest/round2/missionary_stats.js
```

可把某个 `index.html` 的路径作为第一个参数，用来对比旧版。脚本通过 `prototype/tools/simload.js` 加载模拟，不需要浏览器。

第一、二轮「真实点按钮」的驱动脚本当时在箱环境的 `/workspace/playtest-tool/a.js`，没有放进本仓库。报告里的复现链接仍然可用：用浏览器打开 `prototype/index.html?seed=...&plan=...` 或对应的 `index3d.html`。
