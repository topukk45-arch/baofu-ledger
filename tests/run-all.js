// 一次跑完全部测试：node tests/run-all.js [要测的 index.html，默认 ../www/index.html]
// 任何一组失败，退出码为 1（GitHub Actions 会因此停止打包）。
// 1020-J：同时跑几个文件（按机器核数，最多 4 个，`JOBS=1` 退回一个一个跑），每个文件的输出攒齐了再整段打印，不混在一起；
//   对时间敏感的（等动画、长按、键盘、停下来存这类，真等计时器的）放进 SERIAL，等别的都跑完再一个一个跑，免得机器忙时超时。
//   以后新加的测试要是真等几百毫秒的计时器，也写进 SERIAL（或在文件里写一行 `// @serial`）。
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
const SERIAL = new Set([
  'k-remark-reveal.test.js', 'zZr3-fab-idle.test.js', 'zZzG-cat-hint.test.js', 'zZzJ-perf-log.test.js',
  'zZzK-sheet-close.test.js', 'zZzL-text-panel.test.js', 'zZzM-keypad.test.js', 'zZzO-three-layer.test.js',
  'zZzS-launch-native.test.js', 'zZzT-kp-del-hold.test.js', 'zV-import-steps.test.js', 'zZzY-idle-save.test.js', 'zZzZ-kp-hold-sheet-scroll.test.js',
]);
const isSerial = f => SERIAL.has(f) || /^\/\/ @serial\b/m.test(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const JOBS = Math.max(1, Math.min(4, +process.env.JOBS || (os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
const t0 = Date.now();

function runOne(f) {
  return new Promise(res => {
    const s = Date.now();
    // modules 分支：先载入 inline-hook，读 index.html 时把拆开的 app/*.js、app/*.css 拼回单文件（老测试一条不改）
    const p = spawn(process.execPath, ['-r', path.join(__dirname, 'tools', 'inline-hook.js'), path.join(__dirname, f), html], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ f, out, code, ms: Date.now() - s }));
  });
}

let bad = 0, total = 0;
const failed = [];   // 失败的条目：[文件, 那一条的名字]
function report({ f, out, code, ms }) {
  const m = out.match(/(\d+) 通过，(\d+) 失败/);
  const pass = m ? +m[1] : 0, fail = m ? +m[2] : 1;
  total += pass;
  const sec = (ms / 1000).toFixed(1) + 's';
  if (code !== 0 || fail) {
    bad++; console.log(`✗ ${f}  （${sec}）\n${out.trim()}\n`);
    const lines = out.split('\n').filter(l => /^\s*✗ /.test(l)).map(l => l.replace(/^\s*✗\s*/, ''));
    if (lines.length) lines.forEach(l => failed.push([f, l])); else failed.push([f, '（没有失败条目，可能是中途出错退出了，见上面的输出）']);
  }
  else console.log(`✓ ${f}  ${pass} 条  ${sec}`);
}

(async () => {
  const par = files.filter(f => !isSerial(f)), ser = files.filter(isSerial);
  // 一起跑的：最多 JOBS 个同时跑，跑完一个按文件名顺序轮到的就打印（输出顺序和以前一样）
  const done = new Map(); let next = 0, shown = 0;
  const flush = () => { while (shown < par.length && done.has(par[shown])) { report(done.get(par[shown])); done.delete(par[shown]); shown++; } };
  await Promise.all(Array.from({ length: Math.min(JOBS, par.length) }, async () => {
    while (next < par.length) { const f = par[next++]; done.set(f, await runOne(f)); flush(); }
  }));
  flush();
  if (ser.length) console.log(`\n—— 对时间敏感的 ${ser.length} 组，一个一个跑 ——`);
  for (const f of ser) report(await runOne(f));
  console.log(`\n${files.length} 组测试，共 ${total} 条通过${bad ? `，${bad} 组失败` : '，全部通过'}（同时跑 ${JOBS} 个，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  if (failed.length) { console.log('失败的条目：'); failed.forEach(([f, l]) => console.log(`  ${f}：${l.split('\n')[0]}`)); }
  process.exit(bad ? 1 : 0);
})();
