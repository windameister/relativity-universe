# index3d.html 的源文件
- g3d.js：3D 场景、特效、时间压缩回放（替换 index.html 里的 2D 地图段落）
- three.bundle.js：three.js r187 + OrbitControls/EffectComposer/UnrealBloomPass/OutputPass（esbuild IIFE，见 entry.js）
- build.py：从 index.html 复制模拟逻辑和界面，拼成单文件 ../index3d.html（不改 index.html）。改完 g3d.js 或 index.html 后运行：python3 src3d/build.py
- tools/：headless Chrome（swiftshader）截图和试玩脚本，依赖 /tmp/b3d/node_modules/puppeteer-core
调试参数：freeze=秒（把回放冻结在第 N 秒）、replay=0（跳过回放）、focus=星系id&dist=&cam=仰角&az=（镜头）、dpr=

本仓库中 3D 页面位于本目录的上一级：`../index3d.html`。改完 `g3d.js` 或 `../index.html` 后，在 `prototype/` 下运行 `python3 src3d/build.py`。
`tools/` 里的截图脚本依赖本机 Chrome 和 puppeteer-core，属于可选调试工具，不是游玩所必需。
