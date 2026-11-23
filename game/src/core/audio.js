/* RU.audio —— 程序化音频（WebAudio 全合成，不加载任何外部文件）。所有调用方只用下面这些函数：
 *   RU.audio.unlock()                 用户首次手势时创建/恢复 AudioContext（本模块已自动挂 pointerdown/keydown，多调无害）
 *   RU.audio.mood(name)               'title' | 'map' | 'warp' | 'cryo' | 'replay' | 'foil' | 'report' | 'silence'（2.5s 交叉淡化）
 *   RU.audio.cue(name, opts)          一次性音效，见 game/README.md 的音效表；opts.volume 音量倍率，
 *                                     opts.dur 用于 photoid-incoming / title-swell 的时长（秒）。未知名字静默忽略。
 *   RU.audio.param(name, value)       连续参数：param('gamma', 1…~250)、param('tension', 0..1)；可每帧调用（内部限频）
 *   RU.audio.setMuted(bool) / RU.audio.muted / RU.audio.toggle()   静音状态存 localStorage('ru-muted')
 * unlock 之前的 mood/param 会被记住，解锁后生效；截图模式（URL 带 t=）或无 AudioContext 时全部空操作。
 * 总线：氛围 → 张力低通 → music ┐
 *       音效 ──────────────────┼→ master(静音) → 压缩器 → destination；各层按比例送入程序生成 IR 的卷积混响。
 */
(function () {
  'use strict';
  var RU = window.RU = window.RU || { scenes: {}, fx: {}, ui: {}, util: {}, state: {} };
  var A = RU.audio = RU.audio || {};
  var LS_KEY = 'ru-muted';
  var AC = window.AudioContext || window.webkitAudioContext;
  var shotMode = /[?&]t=/.test(location.search);

  function readMuted() { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } }
  function saveMuted(m) { try { localStorage.setItem(LS_KEY, m ? '1' : '0'); } catch (e) { /* 忽略 */ } }

  A.muted = shotMode ? false : readMuted();
  A.toggle = function () { A.setMuted(!A.muted); return A.muted; };
  A.enabled = false;

  function noop() {}
  if (shotMode || !AC) {
    A.unlock = A.mood = A.cue = A.param = noop;
    A.setMuted = function (m) { A.muted = !!m; if (!shotMode) saveMuted(A.muted); };
    A.debug = function () { return { enabled: false }; };
    return;
  }

  // ------------------------------------------------------------------ 状态
  var ctx = null, failed = false;
  var master, comp, musicPre, tensionFilter, musicPost, musicSend, sfxBus, revIn, revOut;
  var whiteBuf, brownBuf, whiteSrc, brownSrc;
  var want = { mood: null, gamma: 1, tension: 0 };
  var cur = null, curName = null;          // 当前氛围层
  var gammaL = null, tensionL = null;      // 惰性创建的连续参数层
  var activeVoices = 0, lastCue = {};
  var lastParam = {}, pendParam = {};
  var MAX_VOICES = 64;

  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd() { return Math.random(); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function now() { return ctx.currentTime; }
  function has(o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }
  function biquad(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; return b; }
  function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
  function disc(n) { try { n.disconnect(); } catch (e) { /* 已断开 */ } }
  function stopAt(s, t) { try { s.stop(t); } catch (e) { /* 已停止 */ } }
  function glide(p, v, t, tc) { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, tc); }

  // ------------------------------------------------------------------ 氛围定义（MIDI 音高，可带小数=微分音）
  var MOODS = {
    title:  { drone: [33, 40], droneType: 'sine', droneGain: 0.2, droneCut: 300,
              padType: 'sawtooth', padCut: 650, padGain: 0.035, chordSec: 10, glideTc: 0.9,
              chords: [[57, 64, 71], [53, 60, 64], [52, 59, 67], [55, 62, 69]],
              noise: { buf: 'brown', ft: 'lowpass', f: 160, g: 0.1 },
              shimmer: { rate: 0.3, notes: [76, 81, 83, 84, 88, 93], g: 0.022 }, gammaW: 0.3 },
    map:    { drone: [38, 45], droneType: 'sine', droneGain: 0.16, droneCut: 300,
              padType: 'triangle', padCut: 1500, padGain: 0.04, chordSec: 9, glideTc: 0.9,
              chords: [[62, 69, 76], [60, 67, 74], [59, 66, 74], [57, 64, 71]],
              noise: { buf: 'brown', ft: 'lowpass', f: 140, g: 0.07 },
              shimmer: { rate: 0.55, notes: [86, 88, 90, 93, 95, 98], g: 0.018 }, gammaW: 0.45 },
    warp:   { drone: [26, 33], droneType: 'sawtooth', droneGain: 0.18, droneCut: 180,
              padType: 'sawtooth', padCut: 380, padGain: 0.045, chordSec: 7, glideTc: 1.2,
              chords: [[38, 45, 50], [38, 45, 52], [38, 43, 50], [38, 46, 53]],
              noise: { buf: 'brown', ft: 'lowpass', f: 260, g: 0.32 }, gammaW: 1 },
    cryo:   { drone: [81, 88.15], droneType: 'sine', droneGain: 0.012, droneCut: 9000,
              padType: 'sine', padCut: 7000, padGain: 0.018, chordSec: 12, glideTc: 2,
              chords: [[83, 90, 97], [85, 90, 95], [81, 88, 97], [83, 88, 94]],
              noise: { buf: 'white', ft: 'highpass', f: 5500, g: 0.02 },
              shimmer: { rate: 0.18, notes: [96, 100, 103, 107, 108], g: 0.014 }, gammaW: 0.1 },
    replay: { drone: [36, 43], droneType: 'sine', droneGain: 0.16, droneCut: 300,
              padType: 'triangle', padCut: 1100, padGain: 0.038, chordSec: 8, glideTc: 0.9,
              chords: [[60, 67, 74], [58, 65, 72], [56, 63, 70], [55, 62, 67]],
              noise: { buf: 'brown', ft: 'lowpass', f: 150, g: 0.06 },
              shimmer: { rate: 0.25, notes: [84, 86, 91, 96], g: 0.016 },
              pulse: { interval: 1.0, g: 0.2 }, gammaW: 0.5 },
    foil:   { drone: [30, 30.4], droneType: 'sawtooth', droneGain: 0.16, droneCut: 140,
              padType: 'triangle', padCut: 1800, padGain: 0.032, chordSec: 6, glideTc: 2.2, wander: 18,
              chords: [0, 1, 2, 3, 4, 5].map(function (k) { return [66 - k * 0.5, 66.5 - k * 0.5, 67.25 - k * 0.5]; }),
              noise: { buf: 'brown', ft: 'lowpass', f: 120, g: 0.1 },
              shimmer: { rate: 0.22, notes: [84, 85.5, 87.5, 89], g: 0.018, desc: true }, gammaW: 0.25 },
    report: { drone: [41, 48], droneType: 'sine', droneGain: 0.14, droneCut: 280,
              padType: 'triangle', padCut: 1000, padGain: 0.04, chordSec: 10, glideTc: 1,
              chords: [[57, 64, 67], [57, 60, 65], [57, 62, 65], [55, 60, 67]],
              noise: { buf: 'brown', ft: 'lowpass', f: 120, g: 0.035 },
              shimmer: { rate: 0.22, notes: [77, 79, 81, 84, 86, 89], g: 0.016 }, gammaW: 0.1 },
    silence: null
  };

  // ------------------------------------------------------------------ 构建总线
  function makeIR(sec, decay) {
    var sr = ctx.sampleRate, len = Math.floor(sr * sec), buf = ctx.createBuffer(2, len, sr);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c), y = 0;
      for (var i = 0; i < len; i++) {
        var p = i / len, a = 0.9 - 0.75 * p;           // 尾部逐渐变暗（单极点低通系数随时间减小）
        y += ((rnd() * 2 - 1) - y) * a;
        var fadeIn = i < 200 ? i / 200 : 1;
        d[i] = y * Math.pow(1 - p, decay) * fadeIn;
      }
    }
    return buf;
  }
  function makeNoise(brown) {
    var sr = ctx.sampleRate, len = sr * 2, buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) {
      var w = rnd() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  function loopSrc(buf) { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }

  function build() {
    master = gain(A.muted ? 0 : 1);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);

    var conv = ctx.createConvolver(); conv.buffer = makeIR(3.8, 2.6);
    revIn = gain(1); revOut = gain(0.55);
    revIn.connect(conv); conv.connect(revOut); revOut.connect(master);

    musicPre = gain(1);
    tensionFilter = biquad('lowpass', 18000, 0.7);
    musicPost = gain(0.7);
    musicSend = gain(0.4);
    musicPre.connect(tensionFilter); tensionFilter.connect(musicPost);
    musicPost.connect(master); musicPost.connect(musicSend); musicSend.connect(revIn);

    sfxBus = gain(0.9); sfxBus.connect(master);

    whiteBuf = makeNoise(false); brownBuf = makeNoise(true);
    whiteSrc = loopSrc(whiteBuf); brownSrc = loopSrc(brownBuf);   // 全局共享两路噪声源
  }

  // ------------------------------------------------------------------ 氛围层
  function makeLayer(name) {
    var M = MOODS[name], t = now();
    var L = { name: name, M: M, out: gain(0), srcs: [], nodes: [], pad: [], chordIdx: 0,
              nextChord: t + M.chordSec, nextShimmer: t + 1 + rnd() * 2, nextPulse: t + 0.6, pulseN: 0, nextDrift: t + 3 };
    L.out.connect(musicPre);
    var dF = biquad('lowpass', M.droneCut || 400, 0.7), dG = gain(M.droneGain);
    dF.connect(dG); dG.connect(L.out); L.nodes.push(dF, dG);
    M.drone.forEach(function (m, i) {
      var o = ctx.createOscillator(); o.type = M.droneType || 'sine'; o.frequency.value = mf(m); o.detune.value = i ? 3 : -3;
      o.connect(dF); o.start(t); L.srcs.push(o);
    });
    var pF = biquad('lowpass', M.padCut, 0.8), pG = gain(M.padGain);
    pF.connect(pG); pG.connect(L.out); L.nodes.push(pF, pG); L.pF = pF;
    M.chords[0].forEach(function (m, i) {
      var o = ctx.createOscillator(); o.type = M.padType; o.frequency.value = mf(m); o.detune.value = (i - 1) * 6;
      o.connect(pF); o.start(t); L.srcs.push(o); L.pad.push(o);
    });
    if (M.noise) {
      var nF = biquad(M.noise.ft, M.noise.f, M.noise.q), nG = gain(M.noise.g);
      L.noiseSrc = M.noise.buf === 'white' ? whiteSrc : brownSrc;
      L.noiseSrc.connect(nF); nF.connect(nG); nG.connect(L.out); L.nodes.push(nF, nG); L.nF = nF;
    }
    L.out.gain.setValueAtTime(0, t);
    L.out.gain.linearRampToValueAtTime(M.level || 1, t + 2.5);
    return L;
  }
  function killLayer(L, fade) {
    if (!L || L.dead) return;
    L.dead = true;
    var t = now(), g = L.out.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    L.srcs.forEach(function (s) { stopAt(s, t + fade + 0.1); });
    setTimeout(function () {
      if (L.noiseSrc && L.nF) { try { L.noiseSrc.disconnect(L.nF); } catch (e) { /* 忽略 */ } }
      L.srcs.forEach(disc); L.nodes.forEach(disc); disc(L.out);
    }, (fade + 0.4) * 1000);
  }
  function applyMood() {
    var name = want.mood;
    if (!ctx || name === curName || !has(MOODS, name)) return;
    killLayer(cur, name === 'silence' ? 3 : 2.5);
    cur = MOODS[name] ? makeLayer(name) : null;
    curName = name;
    applyTension(); applyGamma();
  }

  // ------------------------------------------------------------------ 一次性发声的小积木
  function envelope(p, t, a, peak, hold, d, expIn) {
    a = Math.max(0.002, Math.min(a, d - 0.01)); hold = Math.max(0, Math.min(hold || 0, d - a - 0.01));
    p.setValueAtTime(0.0001, t);
    if (expIn) p.exponentialRampToValueAtTime(peak, t + a); else p.linearRampToValueAtTime(peak, t + a);
    if (hold) p.setValueAtTime(peak, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + d);
    p.setValueAtTime(0, t + d + 0.01);
  }
  function route(g, o, nodes) {
    var out = g;
    if (o.pan && ctx.createStereoPanner) { var pn = ctx.createStereoPanner(); pn.pan.value = clamp(o.pan, -1, 1); g.connect(pn); out = pn; nodes.push(pn); }
    out.connect(o.bus || sfxBus);
    if (o.rev) { var s = gain(o.rev); out.connect(s); s.connect(revIn); nodes.push(s); }
  }
  function track(src, srcs, nodes) {
    activeVoices++;
    src.onended = function () { activeVoices--; srcs.forEach(disc); nodes.forEach(disc); };
  }
  function filt(o, t, d, nodes) {
    var f = biquad(o.ft || 'lowpass', o.cut, o.q);
    if (o.cut2) f.frequency.exponentialRampToValueAtTime(o.cut2, t + (o.cd || d));
    nodes.push(f); return f;
  }
  /** 振荡器音：{t,f,f2,gd,lin,type,a,hold,d,g,expIn,cut,cut2,cd,ft,q,pan,rev,detune,vib:[Hz,深度Hz],bus} */
  function voice(o) {
    if (activeVoices >= MAX_VOICES) return;
    var t = o.t != null ? o.t : now() + 0.01, d = o.d || 0.3;
    var osc = ctx.createOscillator(), g = ctx.createGain(), nodes = [g], srcs = [osc];
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) { if (o.lin) osc.frequency.linearRampToValueAtTime(o.f2, t + (o.gd || d)); else osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.gd || d)); }
    if (o.detune) osc.detune.value = o.detune;
    envelope(g.gain, t, o.a != null ? o.a : 0.005, o.g || 0.1, o.hold, d, o.expIn);
    if (o.cut) { var f = filt(o, t, d, nodes); osc.connect(f); f.connect(g); } else osc.connect(g);
    route(g, o, nodes);
    if (o.vib) {
      var lfo = ctx.createOscillator(), lg = gain(o.vib[1]); lfo.frequency.value = o.vib[0];
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + d + 0.05); srcs.push(lfo); nodes.push(lg);
    }
    osc.start(t); osc.stop(t + d + 0.05);
    track(osc, srcs, nodes);
  }
  /** 噪声音：{t,brown,ft,cut,cut2,cd,q,a,hold,d,g,expIn,pan,rev,bus} */
  function noise(o) {
    if (activeVoices >= MAX_VOICES) return;
    var t = o.t != null ? o.t : now() + 0.01, d = o.d || 0.3;
    var s = ctx.createBufferSource(), g = ctx.createGain(), nodes = [g];
    s.buffer = o.brown ? brownBuf : whiteBuf; s.loop = true;
    envelope(g.gain, t, o.a != null ? o.a : 0.003, o.g || 0.1, o.hold, d, o.expIn);
    if (o.cut) { var f = filt(o, t, d, nodes); s.connect(f); f.connect(g); } else s.connect(g);
    route(g, o, nodes);
    s.start(t, rnd() * 1.5); s.stop(t + d + 0.05);
    track(s, [s], nodes);
  }
  function chord(notes, base) {   // 同一组参数的多音
    notes.forEach(function (m, i) {
      var o = {}; for (var k in base) o[k] = base[k];
      o.f = mf(m); if (base.f2r) o.f2 = o.f * base.f2r;
      if (base.stagger) o.t = (base.t != null ? base.t : now() + 0.01) + i * base.stagger;
      if (base.spread) o.pan = (i / Math.max(1, notes.length - 1) - 0.5) * base.spread;
      if (base.det) o.detune = (i % 2 ? 1 : -1) * base.det;
      voice(o);
    });
  }
  function crackles(t, n, span, g) {
    for (var i = 0; i < n; i++) noise({ t: t + rnd() * span, ft: 'bandpass', cut: 2000 + rnd() * 5000, q: 2, a: 0.001, d: 0.012 + rnd() * 0.02, g: g * (0.4 + rnd() * 0.6), pan: rnd() * 1.6 - 0.8, rev: 0.2 });
  }

  // ------------------------------------------------------------------ 音效表
  var CUES = {
    'ui-hover': function (t, v) { voice({ t: t, f: 2600 + rnd() * 300, a: 0.003, d: 0.06, g: 0.016 * v, rev: 0.15 }); },
    'ui-click': function (t, v) {
      voice({ t: t, type: 'triangle', f: 1400, f2: 700, d: 0.07, g: 0.05 * v, rev: 0.15 });
      noise({ t: t, ft: 'highpass', cut: 4000, d: 0.02, g: 0.025 * v });
    },
    'select': function (t, v) {
      voice({ t: t, f: mf(76), d: 0.9, g: 0.045 * v, rev: 0.4 });
      voice({ t: t + 0.07, f: mf(83), d: 1.1, g: 0.035 * v, rev: 0.5 });
      voice({ t: t, type: 'triangle', f: mf(64), a: 0.01, d: 0.6, g: 0.03 * v });
    },
    'launch': function (t, v) {
      noise({ t: t, ft: 'bandpass', cut: 200, cut2: 2500, cd: 1.6, q: 1.5, a: 1.2, d: 2.2, g: 0.1 * v, rev: 0.4 });
      voice({ t: t, type: 'sawtooth', f: 55, f2: 110, cut: 200, cut2: 1500, a: 1, d: 2.4, g: 0.07 * v });
      voice({ t: t, f: 41, f2: 55, a: 0.8, d: 2.5, g: 0.25 * v });
      chord([69, 76, 81], { t: t + 1, a: 0.4, d: 2.5, g: 0.022 * v, rev: 0.6, spread: 1.2 });
    },
    'warp-engage': function (t, v) {
      voice({ t: t, f: 70, f2: 28, a: 0.01, d: 2.5, g: 0.5 * v });
      noise({ t: t, brown: true, ft: 'lowpass', cut: 300, d: 0.8, g: 0.3 * v });
      noise({ t: t, ft: 'bandpass', cut: 150, cut2: 4000, cd: 1.8, q: 2, a: 1.5, d: 2.2, g: 0.13 * v, rev: 0.3 });
      voice({ t: t, type: 'sawtooth', f: 40, cut: 120, cut2: 2400, cd: 1.6, a: 1.2, hold: 0.3, d: 2.6, g: 0.07 * v });
      voice({ t: t, type: 'sawtooth', f: 40.6, cut: 120, cut2: 2400, cd: 1.6, a: 1.2, hold: 0.3, d: 2.6, g: 0.07 * v });
    },
    'warp-exit': function (t, v) {
      noise({ t: t, ft: 'bandpass', cut: 4000, cut2: 150, q: 1.5, a: 0.05, d: 1.8, g: 0.12 * v, rev: 0.3 });
      voice({ t: t, f: 50, f2: 32, a: 0.02, d: 1.6, g: 0.35 * v });
      chord([74, 81, 86], { t: t + 0.3, a: 0.3, d: 3, g: 0.022 * v, rev: 0.7, spread: 1.2 });
    },
    'cryo-in': function (t, v) {
      chord([88, 93, 95], { t: t, f2r: 0.5, gd: 2.5, a: 0.4, d: 3, g: 0.022 * v, rev: 0.7, spread: 1.4 });
      noise({ t: t, ft: 'highpass', cut: 6000, a: 0.3, d: 2.5, g: 0.035 * v, rev: 0.5 });
      crackles(t + 0.3, 7, 1.8, 0.03 * v);
    },
    'cryo-out': function (t, v) {
      noise({ t: t, ft: 'bandpass', cut: 300, cut2: 3000, q: 1, a: 1.5, d: 2.4, g: 0.06 * v, rev: 0.3 });
      chord([52, 59, 64], { t: t, f2r: 2, gd: 2, a: 1.2, d: 3, g: 0.03 * v, rev: 0.5, spread: 1 });
      voice({ t: t, type: 'triangle', f: mf(52), a: 1, d: 3, g: 0.04 * v });
    },
    'photoid-incoming': function (t, v, o) {
      var D = clamp(+o.dur || 2.5, 0.5, 10), A_ = D * 0.97;
      voice({ t: t, type: 'sawtooth', f: 700, f2: 3600, ft: 'bandpass', cut: 900, cut2: 4200, q: 4, a: A_, expIn: true, d: D + 0.03, g: 0.09 * v, vib: [7, 25] });
      voice({ t: t, type: 'sawtooth', f: 708, f2: 3650, ft: 'bandpass', cut: 900, cut2: 4200, q: 4, a: A_, expIn: true, d: D + 0.03, g: 0.07 * v });
      noise({ t: t, ft: 'bandpass', cut: 600, cut2: 7000, q: 3, a: A_, expIn: true, d: D + 0.03, g: 0.12 * v });
      voice({ t: t, f: 40, f2: 80, a: A_, expIn: true, d: D + 0.03, g: 0.2 * v });
    },
    'photoid-impact': function (t, v) {
      noise({ t: t, brown: true, ft: 'lowpass', cut: 3000, cut2: 100, cd: 1.5, a: 0.002, d: 2.5, g: 0.6 * v, rev: 0.5 });
      noise({ t: t, ft: 'lowpass', cut: 8000, cut2: 500, a: 0.002, d: 0.6, g: 0.3 * v });
      voice({ t: t, f: 90, f2: 24, gd: 1.5, a: 0.003, d: 2.2, g: 0.7 * v });
      [213, 577, 1093].forEach(function (f, i) { voice({ t: t, f: f, a: 0.002, d: 3.5 - i * 0.6, g: 0.04 * v, rev: 0.7, vib: [5 + i, 3], pan: (i - 1) * 0.6 }); });
      voice({ t: t, type: 'sawtooth', f: 41, cut: 600, cut2: 60, a: 0.005, d: 3, g: 0.12 * v });
      voice({ t: t, type: 'sawtooth', f: 43.6, cut: 600, cut2: 60, a: 0.005, d: 3, g: 0.12 * v });
    },
    'foil-touch': function (t, v) {
      voice({ t: t, f: 880, f2: 196, gd: 3.2, a: 0.3, d: 3.6, g: 0.055 * v, rev: 0.8, vib: [5.5, 6], pan: -0.3 });
      voice({ t: t, f: 880 * 1.029, f2: 196 * 1.06, gd: 3.2, a: 0.3, d: 3.6, g: 0.04 * v, rev: 0.8, pan: 0.3 });
      voice({ t: t, type: 'triangle', f: 110, f2: 82.4, a: 0.5, d: 3.5, g: 0.04 * v });
      noise({ t: t, ft: 'bandpass', cut: 3000, cut2: 600, q: 8, a: 0.5, d: 3, g: 0.02 * v, rev: 0.6 });
    },
    'foil-spread': function (t, v) {
      [[72, -9], [72.5, -11], [73.25, -7.5], [71.6, -12]].forEach(function (p, i) {
        voice({ t: t + i * 0.25, type: i % 2 ? 'triangle' : 'sine', f: mf(p[0]), f2: mf(p[0] + p[1]), gd: 5, a: 1, d: 5.5, g: 0.032 * v, rev: 0.8, vib: [3 + i, 2], pan: (i / 3 - 0.5) * 1.4 });
      });
      noise({ t: t, brown: true, ft: 'lowpass', cut: 200, cut2: 800, a: 2, d: 5, g: 0.15 * v, rev: 0.4 });
      voice({ t: t, f: 36, f2: 28, a: 1.5, d: 5, g: 0.2 * v });
    },
    'flatten': function (t, v) {
      noise({ t: t, ft: 'lowpass', cut: 6000, cut2: 60, q: 3, a: 0.05, d: 2.2, g: 0.25 * v, rev: 0.3 });
      voice({ t: t, f: 60, f2: 18, a: 0.02, d: 2.2, g: 0.45 * v });
      voice({ t: t, type: 'sawtooth', f: 110, f2: 27.5, cut: 2000, cut2: 80, a: 0.02, d: 2, g: 0.07 * v });
      crackles(t, 10, 1.5, 0.05 * v);
    },
    'broadcast': function (t, v) {
      for (var i = 0; i < 5; i++) voice({ t: t + i * 0.16, f: 1320, a: 0.005, d: 0.1, g: 0.035 * v, rev: 0.5 });
      voice({ t: t + 0.85, f: 880, a: 0.05, hold: 0.4, d: 1.6, g: 0.03 * v, rev: 0.6 });
      noise({ t: t, ft: 'bandpass', cut: 2000, q: 5, a: 0.1, d: 1.4, g: 0.03 * v });
      voice({ t: t, f: 110, f2: 220, a: 0.3, d: 1.8, g: 0.06 * v, rev: 0.4 });
    },
    'light-arrives': function (t, v) {
      chord([81, 85, 88, 93], { t: t, stagger: 0.09, a: 0.02, d: 2.5, g: 0.032 * v, rev: 0.8, spread: 1.4 });
      voice({ t: t, type: 'triangle', f: mf(69), a: 0.5, d: 2.5, g: 0.03 * v, rev: 0.4 });
    },
    'arrival': function (t, v) {
      chord([41, 48, 57, 64, 67, 72], { t: t, stagger: 0.12, type: 'triangle', cut: 2200, a: 1.2, hold: 1.5, d: 6, g: 0.045 * v, rev: 0.5, spread: 1.2, det: 4 });
      chord([81, 84, 88, 91], { t: t + 0.8, stagger: 0.18, a: 0.05, d: 3, g: 0.018 * v, rev: 0.8, spread: 1.6 });
    },
    'card-bad': function (t, v) {
      voice({ t: t, type: 'triangle', f: mf(45), cut: 900, a: 0.01, d: 1.2, g: 0.08 * v });
      voice({ t: t, type: 'triangle', f: mf(46), cut: 900, a: 0.01, d: 1.2, g: 0.08 * v });
      voice({ t: t, f: 70, f2: 45, a: 0.005, d: 0.4, g: 0.3 * v });
      voice({ t: t + 0.12, f: mf(58), f2: mf(57), a: 0.01, d: 0.9, g: 0.03 * v, rev: 0.3 });
    },
    'card-good': function (t, v) {
      chord([72, 76, 79, 84], { t: t, stagger: 0.06, a: 0.005, d: 1.5, g: 0.038 * v, rev: 0.5, spread: 1 });
      voice({ t: t, type: 'triangle', f: mf(60), a: 0.02, d: 1.2, g: 0.04 * v });
    },
    'title-swell': function (t, v, o) {
      var D = clamp(+o.dur || 4, 1, 12);
      noise({ t: t, ft: 'bandpass', cut: 200, cut2: 3000, a: D, expIn: true, d: D + 0.4, g: 0.12 * v, rev: 0.4 });
      noise({ t: t, ft: 'highpass', cut: 3000, a: D, expIn: true, d: D + 0.15, g: 0.05 * v, rev: 0.5 });
      chord([33, 40, 45], { t: t, type: 'sawtooth', cut: 150, cut2: 2500, cd: D, a: D, expIn: true, d: D + 0.6, g: 0.06 * v, det: 6 });
      voice({ t: t, f: 55, a: D, expIn: true, d: D + 0.5, g: 0.2 * v });
    },
    'title-hit': function (t, v) {   // 一记 “braam”：锯齿簇 + 次低频下坠 + 低频冲击 + 大混响
      chord([33, 33, 40, 45], { t: t, type: 'sawtooth', cut: 1800, cut2: 200, cd: 2.5, q: 2, a: 0.02, d: 4, g: 0.12 * v, rev: 0.6, det: 8, spread: 0.8 });
      voice({ t: t, f: 55, f2: 38, gd: 2, a: 0.008, d: 2.6, g: 0.55 * v });
      noise({ t: t, brown: true, ft: 'lowpass', cut: 400, a: 0.004, d: 0.6, g: 0.45 * v, rev: 0.5 });
      noise({ t: t, ft: 'lowpass', cut: 5000, cut2: 400, a: 0.002, d: 0.35, g: 0.12 * v, rev: 0.6 });
    },
    'death': function (t, v) {
      voice({ t: t, f: 65, f2: 26, gd: 4, a: 0.05, d: 5, g: 0.4 * v });
      chord([33, 34], { t: t, type: 'sawtooth', cut: 1200, cut2: 60, cd: 5, a: 0.05, d: 5.5, g: 0.08 * v, rev: 0.6 });
      [0, 0.35, 1.4, 1.75].forEach(function (dt, i) { voice({ t: t + dt, f: 70, f2: 42, a: 0.004, d: 0.3, g: (i < 2 ? 0.3 : 0.15) * v }); });
      voice({ t: t + 0.5, f: mf(93), a: 2, d: 5, g: 0.01 * v, rev: 0.7 });
    }
  };
  var CUE_GAP = { 'ui-hover': 0.07, 'ui-click': 0.04 };

  // ------------------------------------------------------------------ 连续参数层
  var GAMMA_LN = Math.log(250);
  function applyGamma() {
    if (!ctx) return;
    var gm = Math.max(1, +want.gamma || 1), x = clamp(Math.log(gm) / GAMMA_LN, 0, 1.25);
    var w = curName ? (MOODS[curName] ? MOODS[curName].gammaW : 0) : 0.5;
    var level = w * 0.35 * Math.min(1, (gm - 1) * 20) * (0.25 + 0.75 * Math.min(1, x));
    if (!gammaL) {
      if (level <= 0.0005) return;
      var t0 = now(), L = gammaL = { out: gain(0), f: biquad('lowpass', 140, 3), nf: biquad('bandpass', 300, 1.2), ng: gain(0.6), o1: ctx.createOscillator(), o2: ctx.createOscillator(), idle: 0 };
      L.o1.type = 'sawtooth'; L.o2.type = 'square';
      L.o1.connect(L.f); L.o2.connect(L.f); L.f.connect(L.out);
      whiteSrc.connect(L.nf); L.nf.connect(L.ng); L.ng.connect(L.out);
      L.out.connect(musicPost);
      L.o1.start(t0); L.o2.start(t0);
    }
    var t = now(), f = 32 * Math.pow(2, 2.2 * x);
    glide(gammaL.o1.frequency, f, t, 0.15);
    glide(gammaL.o2.frequency, f * 0.5 * 1.004, t, 0.15);
    glide(gammaL.f.frequency, 140 * Math.pow(2, 4.5 * x), t, 0.15);
    glide(gammaL.nf.frequency, 300 * Math.pow(2, 4 * x), t, 0.15);
    glide(gammaL.ng.gain, 0.15 + 0.6 * x, t, 0.2);
    glide(gammaL.out.gain, level, t, level > gammaL.level ? 0.25 : 0.6);
    gammaL.level = level;
  }
  function applyTension() {
    if (!ctx) return;
    var k = clamp(+want.tension || 0, 0, 1), t = now();
    var silent = curName === 'silence';
    glide(tensionFilter.frequency, 18000 * Math.pow(2, -3.8 * k), t, 0.3);
    glide(tensionFilter.Q, 0.7 + 3 * k, t, 0.3);
    if (cur && !cur.dead) cur.pad.forEach(function (o, i) { glide(o.detune, (i - 1) * (6 + 28 * k), t, 0.5); });
    var level = silent ? 0 : k * 0.28;
    if (!tensionL) {
      if (level <= 0.0005) return;
      var L = tensionL = { out: gain(0), am: gain(0), depth: gain(0), o1: ctx.createOscillator(), o2: ctx.createOscillator(), lfo: ctx.createOscillator(), idle: 0 };
      L.o1.frequency.value = 41.2; L.o2.frequency.value = 43.6;
      L.o1.connect(L.am); L.o2.connect(L.am); L.am.connect(L.out); L.out.connect(musicPost);
      L.lfo.connect(L.depth); L.depth.connect(L.am.gain);
      L.am.gain.value = 0.5;
      L.o1.start(t); L.o2.start(t); L.lfo.start(t);
    }
    glide(tensionL.o2.frequency, 41.2 * (1.04 + 0.06 * k), t, 0.5);
    glide(tensionL.lfo.frequency, 0.7 + 2.5 * k, t, 0.5);
    glide(tensionL.depth.gain, 0.5, t, 0.3);        // 低频脉冲：am 在 0..1 之间摆动
    glide(tensionL.out.gain, level, t, 0.4);
    tensionL.level = level;
  }
  function killParamLayer(L) {
    var t = now();
    [L.o1, L.o2, L.lfo].forEach(function (s) { if (s) stopAt(s, t + 0.05); });
    if (L.nf) { try { whiteSrc.disconnect(L.nf); } catch (e) { /* 忽略 */ } }
    setTimeout(function () { for (var k in L) if (L[k] && L[k].disconnect) disc(L[k]); }, 200);
  }
  function applyParam(name) {
    lastParam[name] = performance.now();
    if (name === 'gamma') applyGamma(); else if (name === 'tension') applyTension();
  }
  function scheduleParam(name) {
    if (!ctx || pendParam[name]) return;
    var dt = 40 - (performance.now() - (lastParam[name] || 0));
    if (dt <= 0) applyParam(name);
    else pendParam[name] = setTimeout(function () { pendParam[name] = 0; applyParam(name); }, dt);
  }

  // ------------------------------------------------------------------ 定时器：和声推进、星空闪烁、脉动
  function shimmer(L) {
    var S = L.M.shimmer, f = mf(S.notes[Math.floor(rnd() * S.notes.length)]);
    voice({ f: f, f2: S.desc ? f * 0.749 : null, gd: 2.2, a: 0.02 + rnd() * 0.25, d: 2.5, g: S.g * (0.5 + rnd() * 0.5), pan: rnd() * 1.6 - 0.8, rev: 0.8, bus: musicPre });
    if (rnd() < 0.35) voice({ t: now() + 0.12 + rnd() * 0.2, f: f * 1.5, a: 0.02, d: 1.8, g: S.g * 0.4, pan: rnd() * 1.6 - 0.8, rev: 0.9, bus: musicPre });
  }
  function pulse(L, tp) {
    var P = L.M.pulse;
    voice({ t: tp, f: 70, f2: 45, a: 0.004, d: 0.35, g: P.g * (L.pulseN % 2 ? 0.6 : 1), bus: musicPre });
    voice({ t: tp, type: 'triangle', f: L.pulseN % 2 ? 1800 : 2100, a: 0.001, d: 0.04, g: 0.018, rev: 0.4, bus: musicPre });
    L.pulseN++;
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    var t = now(), L = cur;
    if (L && !L.dead) {
      var M = L.M;
      if (t >= L.nextChord) {
        L.chordIdx = (L.chordIdx + 1) % M.chords.length;
        var ch = M.chords[L.chordIdx];
        L.pad.forEach(function (o, i) {
          o.frequency.setTargetAtTime(mf(ch[i]), t, M.glideTc);
          if (M.wander) o.detune.setTargetAtTime((rnd() * 2 - 1) * M.wander, t, M.glideTc * 1.5);
        });
        L.nextChord = t + M.chordSec * (0.85 + rnd() * 0.3);
      }
      if (M.shimmer && t >= L.nextShimmer) { shimmer(L); L.nextShimmer = t + (0.5 + rnd() * 1.5) / M.shimmer.rate; }
      if (M.pulse && t + 0.3 >= L.nextPulse) { if (L.nextPulse < t) L.nextPulse = t + 0.05; pulse(L, L.nextPulse); L.nextPulse += M.pulse.interval; }
      if (t >= L.nextDrift) { L.pF.frequency.setTargetAtTime(M.padCut * (0.6 + 0.8 * rnd()), t, 2.5); L.nextDrift = t + 3 + rnd() * 4; }
    }
    // 参数层空闲 4 秒后释放
    if (gammaL) { gammaL.idle = gammaL.level > 0.0005 ? 0 : gammaL.idle + 0.2; if (gammaL.idle > 4) { killParamLayer(gammaL); gammaL = null; } }
    if (tensionL) { tensionL.idle = tensionL.level > 0.0005 ? 0 : tensionL.idle + 0.2; if (tensionL.idle > 4) { killParamLayer(tensionL); tensionL = null; } }
  }

  // ------------------------------------------------------------------ 公开接口
  A.unlock = function () {
    if (failed) return;
    try {
      if (!ctx) {
        ctx = new AC();
        build();
        A.enabled = true;
        setInterval(tick, 200);
        applyMood(); applyGamma(); applyTension();
      }
      if (ctx.state === 'suspended' && !document.hidden) { var p = ctx.resume(); if (p && p.catch) p.catch(noop); }
    } catch (e) {
      failed = true; ctx = null; A.enabled = false;
      if (window.console) console.warn('RU.audio disabled:', e);
    }
  };
  A.mood = function (name) {
    if (!has(MOODS, name)) return;
    want.mood = name;
    if (ctx) { try { applyMood(); } catch (e) { if (window.console) console.warn(e); } }
  };
  A.param = function (name, value) {
    value = +value;
    if (!isFinite(value)) return;
    if (name === 'gamma') want.gamma = value; else if (name === 'tension') want.tension = value; else return;
    try { scheduleParam(name); } catch (e) { if (window.console) console.warn(e); }
  };
  A.cue = function (name, opts) {
    var fn = has(CUES, name) ? CUES[name] : null;
    if (!fn || !ctx || ctx.state !== 'running' || A.muted) return;
    var t = now();
    if (t - (lastCue[name] || -1) < (CUE_GAP[name] || 0.03)) return;
    lastCue[name] = t;
    opts = opts || {};
    var v = opts.volume != null ? clamp(+opts.volume || 0, 0, 2) : 1;
    try { fn(t + 0.01, v, opts); } catch (e) { if (window.console) console.warn('RU.audio cue', name, e); }
  };
  A.setMuted = function (m) {
    A.muted = !!m; saveMuted(A.muted);
    if (ctx && master) glide(master.gain, A.muted ? 0 : 1, now(), 0.12);
  };
  A.debug = function () {
    return { enabled: !!ctx, state: ctx && ctx.state, time: ctx ? +ctx.currentTime.toFixed(2) : 0, mood: curName, want: want, voices: activeVoices, gamma: !!gammaL, tension: !!tensionL, muted: A.muted };
  };

  // 首个用户手势自动解锁；之后若被系统挂起（iOS 等），再次手势会恢复
  function onGesture() { A.unlock(); if (ctx && ctx.state === 'running') { window.removeEventListener('pointerdown', onGesture, true); window.removeEventListener('keydown', onGesture, true); window.removeEventListener('touchend', onGesture, true); } }
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  window.addEventListener('touchend', onGesture, true);
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    var p = document.hidden ? ctx.suspend() : ctx.resume();
    if (p && p.catch) p.catch(noop);
    if (!document.hidden) { window.addEventListener('pointerdown', onGesture, true); window.addEventListener('keydown', onGesture, true); }
  });
})();
