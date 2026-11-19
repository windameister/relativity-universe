# 生成 index3d.html：从 index.html 复制模拟逻辑和界面，把 2D 地图换成 Three.js 3D 场景。
# 用法：python3 src3d/build.py   （不会修改 index.html）
import os, re
D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(D)
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
three = open(os.path.join(D, 'three.bundle.js'), encoding='utf-8').read()
g3d = open(os.path.join(D, 'g3d.js'), encoding='utf-8').read()

def rep(s, old, new, count=1):
    assert old in s, 'missing: ' + old[:80]
    return s.replace(old, new, count)

s = src
s = rep(s, '<title>相对论宇宙 · 原型</title>', '<title>相对论宇宙 · 3D</title>')
css_extra = '''
  #gl { position:absolute; inset:0; width:100%; height:100%; display:block; outline:none; }
  #labels { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  .lb { position:absolute; left:0; top:0; font-size:11px; line-height:1.25; color:#9aa7c7; white-space:nowrap; text-shadow:0 0 4px #000,0 0 2px #000,0 0 1px #000; will-change:transform; }
  .lb .cv { font-size:10.5px; }
  .lb.on .nm { font-weight:bold; color:#fff !important; font-size:12.5px; }
  .flatlb { color:#ffd27a; font-weight:bold; font-size:12px; }
  #topbar, #legend { z-index:2; }
  #legend button { padding:2px 8px; font-size:12px; }
  #hud { display:none; position:absolute; left:50%; top:84px; transform:translateX(-50%); min-width:440px; max-width:72%; text-align:center; background:rgba(5,7,13,.55); border:1px solid #2f4a7a; border-radius:10px; padding:10px 16px; z-index:3; backdrop-filter: blur(2px); }
  #hud .t { font-size:13px; color:#cfe0ff; }
  #hudYear { font-size:30px; font-weight:bold; color:#ffd27a; letter-spacing:1px; }
  #hudCap { font-size:13px; line-height:1.6; margin-top:4px; }
  #hud button { margin-top:6px; }
'''
s = rep(s, '</style>', css_extra + '</style>')
s = rep(s, '<canvas id="map"></canvas>', '<div id="labels"></div>\n    <div id="hud"><div class="t">离开期间 · 时间压缩回放 <span class="dim">（按事件真实发生的时刻显示，不计光延迟）</span></div><div id="hudYear"></div><div id="hudSpeed" class="dim"></div><div id="hudCap"></div><button id="skipBtn">跳过 ▶▶</button></div>')
leg_old = src[src.index('    <div id="legend">'):src.index('</div>', src.index('    <div id="legend">')) + 6]
leg_new = '''    <div id="legend">
      拖动旋转 · 右键平移 · 滚轮缩放 · 双击恒星聚焦 · 静置时镜头自动漂移 · <b>你看到的是光延迟后的样子</b>（d 光年外 = d 年前）<br>
      彩环 = 文明 · 旋转的画 = 二维化区域 · 暗球 = 黑域 · 暗红余烬 = 被光粒熄灭的恒星 · 绿圈 = 你的飞船 · 蓝色光点带 = 曲率航迹 · 虚线 = 计划航线<br>
      <label><input type="checkbox" id="godView"> 上帝视角（真实现状、歌者与在途武器）</label> <label><input type="checkbox" id="gridOn" checked> 网格（50 光年）</label>
      <button id="replayBtn" disabled>⟲ 回放离开期间</button> <button id="homeBtn">⌖ 回到飞船</button> <span id="fps" class="dim"></span>
    </div>'''
s = rep(s, leg_old, leg_new)
s = rep(s, '<script id="sim">', '<script id="three">/* three.js r187 (MIT) + OrbitControls/EffectComposer/UnrealBloomPass/OutputPass, bundled with esbuild */\n' + three + '\n</script>\n<script id="sim">')

# ---- 界面脚本 ----
s = rep(s, "  var cv = $('map'), ctx = cv.getContext('2d');\n", '')
a = s.index('  // ---------- 地图 ----------'); b = s.index('  // ---------- 侧栏 ----------')
s = s[:a] + g3d + '\n' + s[b:]
s = rep(s, "sel = null; $('seedIn').value = u.seed;\n    render();", "sel = null; $('seedIn').value = u.seed;\n    build3D();\n    render();")
s = rep(s, "window.addEventListener('resize', function () { resize(); drawMap(); });\n  resize();", "window.addEventListener('resize', resize3D);\n  resize3D();")
s = rep(s, "var res = SIM.travel(u, sel, mode); sel = null; showReport(res);", "var t0 = u.time, res = SIM.travel(u, sel, mode); sel = null; startReplay(t0, u.time, res, true);")
s = rep(s, "b.onclick = function () { showReport(SIM.hibernate(u, +b.getAttribute('data-wait'))); };", "b.onclick = function () { var t0 = u.time, r0 = SIM.hibernate(u, +b.getAttribute('data-wait')); startReplay(t0, u.time, r0, true); };")
s = rep(s, "    var last = null, steps = plan.split(',');\n    steps.forEach(function (st, k) {\n      var p3 = st.split(':');",
           "    var last = null, steps = plan.split(','), tLast = 0;\n    steps.forEach(function (st, k) {\n      var p3 = st.split(':'); tLast = u.time;")
s = rep(s, "    if (last && !params.get('nomodal')) showReport(last); else render();", "    if (last) startReplay(tLast, u.time, last, true); else render();")
s = rep(s, "    '<b>光延迟</b>：地图和远方消息只显示光已经传到你这里的状态。'",
           "    '<b>光延迟</b>：地图和远方消息只显示光已经传到你这里的状态。',\n    '<b>3D 视图</b>：恒星的高度只是银盘厚度的视觉效果（±7 光年），航程、光延迟和打击时间都按模拟里的距离计算。每次飞行或冬眠后，会先以时间压缩的方式回放离开期间发生的打击（回放按事件真实时刻、不计光延迟），再弹出报告。'")
# 启动渲染循环（放在 IIFE 结尾前）
s = rep(s, "    if (res) showReport(res);\n  }\n})();", "    if (res) showReport(res);\n  }\n  applyCamParams();\n  loop();\n})();")
out = os.path.join(ROOT, 'index3d.html')
open(out, 'w', encoding='utf-8').write(s)
print('wrote', out, len(s.encode('utf-8')), 'bytes')
