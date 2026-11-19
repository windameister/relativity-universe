# 可玩原型

- `index.html` — 2D 完整游戏（模拟内核 + 事件库 + 界面）
- `index3d.html` — 3D 版，由 `src3d/build.py` 生成，不要手改
- `events/events_src.js` — 事件源。改完运行 `node events/events_src.js`
- `src3d/` — 3D 源码与构建，说明见该目录 README
- `tools/` — `simload` / `evcheck` / `plan` / `facthash`
- `test_sim.js` — 无界面回归

怎么运行、URL 参数和测试命令见仓库根目录的 `README.md` 和 `docs/ARCHITECTURE.md`。硬规则见 `docs/01-REQUIREMENTS.md`。
