// 1016-T 导完指下一步（jsdom 跑整个 App）。node zD-import-next.test.js [index.html]
// 结果页「接下来可以」：去看统计（统计页收支）、按过去几个月设预算（统计页预算）、补一笔期初余额（打开记一笔：收入、只算结余、备注期初余额）；
// 写明导入的结余不等于实际余额。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = (d, fen) => B.txn({ time: { y: 2026, mo: 10, d, h: 12, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构店' + d, desc: '虚构商品', io: 'expense', fen, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') });
const file = d => [['微信' + d + '.csv', B.bill('wechat', [wx(d, 1000 + d)], { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const { $ } = t;
  const shown = id => $(id).style.display !== 'none';
  await t.importFiles(file(1), null, { stay: true });
  ok($('impNext') && $('impNextStats') && $('impNextBudget') && $('impNextOpening'), '1 结果页有「接下来可以」三个按钮');
  ok(/不等于钱包里的实际余额/.test($('impNext').textContent) && /只算结余/.test($('impNext').textContent), '1 写明导入的结余不等于实际余额');
  $('impNextStats').click(); await t.idle();
  ok($('impPage').style.display === 'none' && shown('pageStats') && shown('statPaneFlow'), '2 去看统计：导入页关掉，到统计页收支');
  await t.importFiles(file(2), null, { stay: true });
  $('impNextBudget').click(); await t.idle();
  ok($('impPage').style.display === 'none' && shown('pageStats') && !shown('statPaneFlow'), '3 设预算：到统计页预算页签');
  await t.importFiles(file(3), null, { stay: true });
  $('impNextOpening').click(); await t.idle();
  ok($('impPage').style.display === 'none' && $('addMask').style.display === 'flex', '4 补期初余额：打开记一笔');
  ok(t.w.eval('billTypeSel') === 'income' && $('billMode').dataset.mode === 'flow' && $('billRemark').value === '期初余额', '4 记一笔里已经选好：收入、只算结余、备注「期初余额」');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
