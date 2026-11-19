// 在 Node 里加载 index.html 的模拟脚本（<script id="sim">），并把事件库（行首的 <script type="application/json" id="events"> 块）喂给它。
// 用法：const SIM = require('./tools/simload')('/path/to/index.html');   旧版本（没有事件库）的 index.html 也能加载
const fs = require('fs'), path = require('path');
const EV_RE = /\n<script type="application\/json" id="events">\n([\s\S]*?)\n<\/script>\n/;
function load(file) {
  file = file || path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const src = html.match(/\n<script id="sim">([\s\S]*?)<\/script>/)[1];
  const m = { exports: {} }; new Function('module', src)(m);
  const SIM = m.exports;
  if (SIM.loadEvents) { const ev = html.match(EV_RE); if (!ev) throw new Error('index.html 里没有事件库'); SIM.loadEvents(JSON.parse(ev[1])); }
  return SIM;
}
load.eventsJSON = function (file) {
  const html = fs.readFileSync(file || path.join(__dirname, '..', 'index.html'), 'utf8');
  const ev = html.match(EV_RE); return ev ? JSON.parse(ev[1]) : null;
};
module.exports = load;
