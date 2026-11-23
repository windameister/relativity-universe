# 正式版客户端构建：
#   1) 从 prototype/index.html 抽出模拟内核与事件库 → game/gen/sim.js（模拟只有一份源，改模拟仍然改 prototype）
#   2) 把 index.html 里按顺序引用的所有脚本 / 样式内联成单文件 → game/dist/relativity-universe.html（便于分享）
# 用法（仓库根目录或 game/ 下都行）：python3 game/build.py
import os, re, json
G = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(G)
proto = open(os.path.join(ROOT, 'prototype', 'index.html'), encoding='utf-8').read()

def between(s, a, b):
    i = s.index(a) + len(a); j = s.index(b, i); return s[i:j]

events = between(proto, '<script type="application/json" id="events">', '</script>').strip()
json.loads(events)  # 校验
sim = between(proto, '<script id="sim">', '</script>')
os.makedirs(os.path.join(G, 'gen'), exist_ok=True)
out = ('/* 生成文件：由 game/build.py 从 prototype/index.html 抽取，不要手改。 */\n'
       + sim + '\nSIM.loadEvents(' + events + ');\n')
open(os.path.join(G, 'gen', 'sim.js'), 'w', encoding='utf-8').write(out)
print('wrote game/gen/sim.js', len(out.encode('utf-8')), 'bytes')

# ---- 单文件版 ----
html = open(os.path.join(G, 'index.html'), encoding='utf-8').read()
def inline_js(m):
    p = os.path.join(G, m.group(1))
    if not os.path.exists(p): return ''
    code = open(p, encoding='utf-8').read().replace('</script>', '<\\/script>')
    return '<script>/* ' + m.group(1) + ' */\n' + code + '\n</script>'
def inline_css(m):
    p = os.path.join(G, m.group(1))
    if not os.path.exists(p): return ''
    return '<style>/* ' + m.group(1) + ' */\n' + open(p, encoding='utf-8').read() + '\n</style>'
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
os.makedirs(os.path.join(G, 'dist'), exist_ok=True)
open(os.path.join(G, 'dist', 'relativity-universe.html'), 'w', encoding='utf-8').write(html)
print('wrote game/dist/relativity-universe.html', len(html.encode('utf-8')), 'bytes')
