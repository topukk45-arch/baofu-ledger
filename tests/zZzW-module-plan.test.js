// modules 分支（1019-Z4-M3 起）：模块设计表 tools/modules-plan.js 和代码对得上。node zZzW-module-plan.test.js [index.html]
// 1. 每一节都归了某个模块、模块名和入口不重复、单独挪的名字都真有；
// 2. 按表算出来的往上调用（排在前面的模块调排在后面的）只能是回调口表 CALLBACKS 里那几处，只减不增；
// 3. 老入口名单里的名字现在都还在 window 上（真起一次 App 看；用到时才挂的 LEGACY_LAZY 除外）。
// 4. （1019-Z4-M4 起）设计表里写的每一节标题都还找得到（搬进模块文件的也算）。
const fs = require('fs'), path = require('path');
const PL = require('./tools/modules-plan');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const raw = fs.readFileSync(htmlFile).toString('utf8');
  if (!/<script src="app\//.test(raw)) { ok(true, '单文件版本：不适用'); console.log(`\n${pass} 通过，${fail} 失败`); process.exit(0); }
  const P = PL.plan(WWW);
  ok(P.unassigned.length === 0, '1 每一节都归了模块：' + P.unassigned.join('、'));
  const keys = PL.MODULES.map(m => m.key), entries = PL.MODULES.map(m => m.entry).filter(Boolean);
  ok(entries.every(e => !PL.LEGACY.includes(e)), '1 入口不和老入口重名（重名会把老入口盖掉）：' + entries.filter(e => PL.LEGACY.includes(e)).join('、'));
  ok(new Set(keys).size === keys.length && new Set(entries).size === entries.length && entries.every(e => /^Jiwen[A-Z]\w+$/.test(e)), '1 模块名、入口不重复，入口都叫 JiwenXxx');
  const missing = PL.MODULES.flatMap(m => m.names.filter(n => !P.R.decls.has(n)).map(n => m.key + ':' + n));
  ok(missing.length === 0, '1 单独挪的名字都真有：' + missing.join('、'));
  ok(P.lostTitles.length === 0, '4 设计表里的节标题都找得到：' + P.lostTitles.join('、'));
  const extra = [];
  P.up.forEach((v, k) => { const allow = PL.CALLBACKS[k] || []; [...v].forEach(x => { const n = x.split('（')[0]; if (!allow.includes(n)) extra.push(k + '：' + x); }); });
  ok(extra.length === 0, '2 往上调用只有回调口表里那几处：' + extra.join('；'));
  const t = await A.boot({ html: fs.readFileSync(htmlFile, 'utf8'), www: WWW, seed: A.seedOf([]) });
  const gone = PL.LEGACY.filter(n => !PL.LEGACY_LAZY.includes(n) && t.w[n] === undefined);
  ok(gone.length === 0, '3 老入口都还在 window 上：缺 ' + gone.join('、'));
  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
