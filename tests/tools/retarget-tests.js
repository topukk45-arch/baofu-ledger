// 搬完一块以后，把测试里直接按名字调的全局函数改成经过入口调（只改调用写法，参数和检查一字不动）：
//   node tests/tools/retarget-tests.js <入口> <名字,名字,…> [--dry]
//   w.loadStore(…) / t.w.loadStore / window.loadStore → w.JiwenStore.loadStore(…)；
//   eval('odBuildPayload()') 这种字符串里的名字 → eval('JiwenStore.odBuildPayload()')（前面已经有「.」的不动）。
//   也会起老版本（fixtures 里原样存的 1016-K）的测试文件，那边没有入口，写成 (w.JiwenStore || w).loadStore(…)（老版本照旧走 window）：
//   哪些文件算这种：文件里提到 index-1016 这类原样存的旧版。helpers/ 下的也这样写（老版本也用它起）。
//   打印每处改动（文件:行 旧 → 新），提交说明里照抄。
'use strict';
const fs = require('fs'), path = require('path');
const [entry, list] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
const names = new Set((list || '').split(',').filter(Boolean));
if (!/^Jiwen\w+$/.test(entry || '') || !names.size) { console.log('用法：node tests/tools/retarget-tests.js JiwenStore 名字,名字'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const files = [];
const walkDir = d => fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (['node_modules', 'fixtures', 'tools'].includes(f)) return; if (fs.statSync(p).isDirectory()) walkDir(p); else if (/\.js$/.test(f)) files.push(p); });
walkDir(ROOT);
const OBJ = '(?:(?<![\\w$.])(?:[A-Za-z_$][\\w$]*\\.)*(?:w|win|window|W))';
const alt = [...names].map(n => n.replace(/\$/g, '\\$')).join('|');
const reProp = new RegExp(`(${OBJ})\\.(${alt})(?![\\w$])`, 'g');
const reEval = /(\.eval\(\s*)(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
const reWord = new RegExp(`(^|[^\\w$.]|\\.\\.\\.)(${alt})(?![\\w$])`, 'g');
let total = 0;
files.forEach(f => {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let changed = false;
  const compat = /index-1016|fixtures', 'index-/.test(src) || /[\\/]helpers[\\/]/.test(f);
  const out = lines.map((l, i) => {
    let n = l.replace(reProp, (m, o, nm) => compat ? `(${o}.${entry} || ${o}).${nm}` : `${o}.${entry}.${nm}`);
    n = n.replace(reEval, (m, pre, q, body) => pre + q + body.replace(reWord, (mm, b, nm) => `${b}${entry}.${nm}`) + q);
    if (n !== l) { changed = true; total++; console.log(`${path.relative(ROOT, f)}:${i + 1}\n  - ${l.trim()}\n  + ${n.trim()}`); }
    return n;
  });
  if (changed && !dry) fs.writeFileSync(f, out.join('\n'));
});
console.log(`共 ${total} 行`);
