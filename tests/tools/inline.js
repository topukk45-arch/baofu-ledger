// 把拆开的 index.html 拼回单文件（测试、逐字节对比用）。modules 分支：
//   <link rel="stylesheet" href="app/xxx.css?v=…">          → <style>\n + 文件内容 + </style>
//   连着的几行 <script src="app/xxx.js?v=…"></script>        → <script>\n + 这几个文件按顺序接起来 + </script>
// 拆的时候 split-index.js 保证：拼回来和拆之前的单文件逐字节一样。没有这种引用的（老版本单文件）原样返回。
'use strict';
const fs = require('fs'), path = require('path');
const LINK = /^( *)<link rel="stylesheet" href="(app\/[^"?]+\.css)\?v=[^"]*">$/;
const SCRIPT = /^( *)<script src="(app\/[^"?]+\.js)\?v=[^"]*"><\/script>$/;
function inline(html, www) {
  if (!/(<link rel="stylesheet" href="app\/|<script src="app\/)/.test(html)) return html;
  const lines = html.split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    let m = LINK.exec(lines[i]);
    if (m) { out.push(m[1] + '<style>\n' + fs.readFileSync(path.join(www, m[2]), 'utf8') + m[1] + '</style>'); continue; }
    m = SCRIPT.exec(lines[i]);
    if (m) {
      const ind = m[1]; let body = '';
      while (i < lines.length && (m = SCRIPT.exec(lines[i]))) { body += fs.readFileSync(path.join(www, m[2]), 'utf8'); i++; }
      i--;
      out.push(ind + '<script>\n' + body + ind + '</script>');
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}
// 测试读 www/index.html 时自动拼回单文件：老测试一条不改（它们拿到的还是一整份 HTML）
function installReadHook() {
  if (fs.__jiwenInline) return;
  const orig = fs.readFileSync;
  fs.readFileSync = function (p, opt) {
    const r = orig.apply(this, arguments);
    try {
      if (typeof p === 'string' && /index\.html$/.test(p) && typeof r === 'string') return inline(r, path.dirname(p));
    } catch (_) {}
    return r;
  };
  fs.__jiwenInline = true;
}
module.exports = { inline, installReadHook };
