// 一次跑完全部测试：node tests/run-all.js [要测的 index.html，默认 ../www/index.html]
// 任何一组失败，退出码为 1（GitHub Actions 会因此停止打包）。
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let bad = 0, total = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f), html], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) 通过，(\d+) 失败/);
  const pass = m ? +m[1] : 0, fail = m ? +m[2] : 1;
  total += pass;
  if (r.status !== 0 || fail) { bad++; console.log(`✗ ${f}\n${out.trim()}\n`); }
  else console.log(`✓ ${f}  ${pass} 条`);
}
console.log(`\n${files.length} 组测试，共 ${total} 条通过${bad ? `，${bad} 组失败` : '，全部通过'}`);
process.exit(bad ? 1 : 0);
