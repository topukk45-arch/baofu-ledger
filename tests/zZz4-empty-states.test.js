// 1017-R 空状态（jsdom）：导入记录、待处理、管理导入规则、AI 修改建议没有内容时，卡片从页面顶上往下排（不加 imp-push 沉到底），
// 写清楚为什么空、以后会有什么；有内容时照旧（导入记录、加一条规则落到下面拇指够得着）。真 Chromium 量位置见 tests/ui/audit.js。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], ['未分类', '吃饭', '购物']), now: '2026-10-20T10:00:00' });
  const { $ } = t, qa = s => Array.from(t.d.querySelectorAll(s));
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  await t.w.JiwenImportUI.openLogs(); await t.until(() => $('impLogs'));
  ok(!$('impLogs').classList.contains('imp-push') && /还没有导入记录/.test($('impLogs').textContent) && /每次都会记在这里/.test($('impLogs').textContent), '1 导入记录空：卡片不沉到底，写以后会记什么');
  await t.w.JiwenImportUI.openPending(); await t.until(() => $('impPendHead'));
  ok(!$('impPendHead').classList.contains('imp-push') && /没有待处理的账单了/.test($('impPendHead').textContent) && /拿不准的账单会先放在这里/.test($('impPendHead').textContent), '2 待处理空：从顶上排，写什么会放进来');
  t.w.JiwenImportUI.openRules();
  ok(!$('impRuleAddCard').classList.contains('imp-push') && /还没有。可以在最下面加一条/.test($('impRulesCat').textContent), '3 规则页空：「加一条」跟着往下排，分类规则也写「还没有」');
  // 有记录以后：导入记录照旧落到下面
  await t.importFiles([['微信.csv', B.bill('wechat', [wx({ time: { y: 2026, mo: 10, d: 5, h: 12, mi: 0, s: 0 }, cp: '某虚构便利店', fen: 600 })], { range: RANGE }).bytes]]);
  await t.w.JiwenImportUI.openLogs(); await t.until(() => qa('.imp-log').length);
  ok($('impLogs').classList.contains('imp-push'), '4 有导入记录：照旧整块落到下面（撤销够得着）');
  // AI 修改建议：一条能用的都没有
  const [lg] = await t.st().importsRead();
  qa('.imp-log').find(x => x.dataset.batch === lg.b).querySelector('.imp-log-ai').click(); await t.until(() => $('impAiText'));
  $('impAiCopy').click(); await t.until(() => t.ask()); await t.askOk();
  const at = t.S().ai.at;
  $('impAiPasteBtn').click(); await t.until(() => $('impAiPaste'));
  $('impAiPaste').value = ['记问修改建议 v1 批次 ' + lg.b + ' 导出 ' + at, '#99 | 分类 | 吃饭 | 号不对'].join('\n'); $('impAiPasteGo').click();
  await t.until(() => $('impAiReviewHead'));
  ok($('impAiEmpty') && /没有能直接改的建议/.test($('impAiEmpty').textContent), '5 AI 修改建议一条能用的都没有：写为什么、怎么办');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
