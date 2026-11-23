/* RU.util —— 所有模块共享的小工具（core，不要在场景里重复实现）。 */
(function () {
  var RU = window.RU = window.RU || { scenes: {}, fx: {}, ui: {}, util: {}, state: {} };
  var U = RU.util;

  U.clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smoothstep = function (a, b, x) { var t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  /** 时间轴片段进度：t 在 [a,b] 内线性 0→1，之外夹紧。 */
  U.seg = function (t, a, b) { return U.clamp((t - a) / (b - a), 0, 1); };
  U.ease = {
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    in: function (t) { return t * t; },
    cubicOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    cubicInOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    expoOut: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    expoIn: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
    expoInOut: function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2; },
    sine: function (t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  };

  // ---------- 确定性随机（仅用于视觉，不碰模拟的 u.rs） ----------
  U.hashStr = function (s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  U.mulberry = function (a) { a = a >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  U.gauss = function (r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.283185307 * r()); };

  // ---------- 物理：黑体与相对论 ----------
  // 普朗克谱在 R/G/B 三个代表波长（μm）上的辐亮度（相对量）。c2 = hc/k = 14388 μm·K
  var LAM = [0.610, 0.550, 0.465];
  U.planck = function (lamUm, T) { var x = 14388 / (lamUm * T); if (x > 80) return 0; return Math.pow(lamUm, -5) / (Math.exp(x) - 1); };
  /** 温度 T 的黑体在 RGB 三个波长上的绝对辐亮度（以 5800K 时 G 通道 = 1 归一）。用于相对论多普勒：观测谱 = T' = δT 的黑体。 */
  var REF = U.planck(0.550, 5800);
  U.planckRGB = function (T) { return [U.planck(LAM[0], T) / REF, U.planck(LAM[1], T) / REF, U.planck(LAM[2], T) / REF]; };
  /** 黑体颜色（只要色相，最大分量 = 1），线性 RGB。 */
  U.blackbodyColor = function (T) { var c = U.planckRGB(T), m = Math.max(c[0], c[1], c[2]) || 1; return [c[0] / m, c[1] / m, c[2] / m]; };
  /** 光谱型 → 表面温度（K） */
  U.TEMP = { O: 38000, B: 16000, A: 9000, F: 6900, G: 5800, K: 4500, M: 3200, '白矮星': 12000, '中子星': 60000, '黑洞': 0 };
  U.gammaOf = function (beta) { return 1 / Math.sqrt(Math.max(1e-30, 1 - beta * beta)); };
  /** 光行差：静止系里方向与速度夹角的余弦 → 飞船系。 */
  U.aberrate = function (cosTheta, beta) { return (cosTheta + beta) / (1 + beta * cosTheta); };
  /** 多普勒因子 δ：飞船系角度 θ' 时 δ = 1/(γ(1 − β cosθ'))；等价于静止系角度 θ 时 δ = γ(1 + β cosθ) */
  U.doppler = function (cosThetaShip, beta) { return 1 / (U.gammaOf(beta) * (1 - beta * cosThetaShip)); };
  U.dopplerRest = function (cosThetaRest, beta) { return U.gammaOf(beta) * (1 + beta * cosThetaRest); };

  // ---------- 格式化 ----------
  /** 年数 → 人读文本（和原型一致：向下截断） */
  U.fmtYears = function (x) {
    if (x < 1 / 365 / 24) return Math.max(1, Math.round(x * 365 * 24 * 60)) + ' 分钟';
    if (x < 1 / 365) return Math.max(1, Math.round(x * 365 * 24)) + ' 小时';
    if (x < 0.1) return Math.max(1, Math.round(x * 365)) + ' 天';
    if (x < 100) return (Math.floor(x * 10 + 1e-6) / 10).toFixed(1) + ' 年';
    return Math.floor(x + 1e-6) + ' 年';
  };
  /** β 显示：0.99999c 这种，保留到第一个非 9 位 */
  U.fmtBeta = function (b) {   // 截断而非四舍五入：永远显示成 < c
    if (b < 0.9) return (Math.floor(b * 1000) / 1000).toFixed(3) + 'c';
    var e = Math.max(1 - b, 1e-15), n = Math.floor(-Math.log10(e) + 1e-9), x = e * Math.pow(10, n);
    var d = U.clamp(Math.floor((1 - x) * 10), 0, 8), s = '0.'; for (var i = 0; i < n; i++) s += '9';
    return s + (d > 0 ? d : '') + 'c';
  };
  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ---------- DOM ----------
  U.el = function (tag, cls, html, parent) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html;
    (parent || document.getElementById('ui')).appendChild(e); return e;
  };
  U.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  /** 全屏淡入淡出遮罩：U.fade(1, 600, 'white') → Promise */
  U.fade = function (to, ms, color) {
    var f = document.getElementById('fade'); f.classList.toggle('white', color === 'white');
    f.style.transition = 'opacity ' + (ms == null ? 800 : ms) + 'ms ease'; f.style.opacity = to;
    return U.wait(ms == null ? 800 : ms);
  };

  // ---------- 贴图 ----------
  U.canvasTex = function (w, h, draw, srgb) {
    var T = window.THREE, c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); if (srgb !== false) t.colorSpace = T.SRGBColorSpace; return t;
  };
  U.radial = function (g, x, y, r, stops) { var gr = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  var _glow = null;
  /** 通用柔和光斑（白色，供 Sprite / Points 着色） */
  U.glowTex = function () { return _glow || (_glow = U.canvasTex(128, 128, function (g) { U.radial(g, 64, 64, 64, [[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,255,255,.75)'], [0.22, 'rgba(255,255,255,.2)'], [0.5, 'rgba(255,255,255,.04)'], [1, 'rgba(255,255,255,0)']]); })); };

  /** 模拟坐标 (x,y 光年，图心 100,100) → 世界坐标（1 单位 = 1 光年，y 轴向上，银盘在 XZ 平面） */
  U.simToWorld = function (x, y, h) { return new window.THREE.Vector3(x - 100, h || 0, y - 100); };
  /** 星系的视觉高度（银盘厚度，±7 光年，只是视觉；航程与光延迟仍按模拟里的平面距离）。所有场景必须用这个，保证同一颗星在地图和第一视角里位置一致。 */
  U.sysHeight = function (u, s) { if (s.id === 0) return 0; var r = U.mulberry(U.hashStr(u.seed + '#h' + s.id)); return (r() + r() + r() - 1.5) * 4.7; };
  U.sysWorld = function (u, s) { return U.simToWorld(s.x, s.y, U.sysHeight(u, s)); };
  U.starTemp = function (s) { return U.TEMP[s.type] != null ? U.TEMP[s.type] : 5800; };
})();
