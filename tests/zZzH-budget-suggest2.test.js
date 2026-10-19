// 1019-J 预算建议的内容（jsdom，记录全是虚构的）。node zZzH-budget-suggest2.test.js [index.html]
// 每月中位数不到 50 元的、这几个月收入比支出多的（比如「存款」）不建议；建议值和现在的预算一样的收成一行「其余 N 个分类和建议一致」。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const p2 = n => String(n).padStart(2, '0');
let k = 0;
const r = (mo, d, money, cat, o) => Object.assign({ id: 'r' + (++k), time: `2026-${p2(mo)}-${p2(d)}T12:00`, money, type: 'expense', cat, remark: '' }, o || {});

(async () => {
  const RECS = [];
  const MONTHS = [7, 8, 9, 10, 11];
  MONTHS.forEach(mo => {
    RECS.push(r(mo, 3, 1350, '餐饮'), r(mo, 4, 2840, '其他'), r(mo, 5, 600, '购物'), r(mo, 6, 300, '出行'), r(mo, 7, 200, '日用'));
    RECS.push(r(mo, 8, 30, '水果'));                                         // 每月 30：中位数不到 50，不建议
    RECS.push(r(mo, 9, 3000, '存款', { type: 'income' }), r(mo, 10, 1.11, '存款'));   // 存款：大多是收入，支出零星
    RECS.push(r(mo, 11, 80, '红包'), r(mo, 12, 500, '红包', { type: 'income' }));     // 红包：支出 80 够 50，但收入比支出多 → 不建议
  });
  const CATS = ['未分类', '餐饮', '其他', '购物', '出行', '日用', '水果', '存款', '红包'];
  const budgets = { '餐饮': 1350, '其他': 2840, '出行': 300, '日用': 150 };   // 餐饮、其他、出行和建议一样；日用不一样
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, CATS, { budgets }) });
  const { $, d } = t;
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t.idle();
  $('bgSuggestBtn').click();
  const rows = [...d.querySelectorAll('.bg-suggest-row')].map(x => x.dataset.cat);
  ok(rows.indexOf('水果') < 0, '1 水果每月 30（不到 50）：不建议');
  ok(rows.indexOf('存款') < 0, '1 存款大多是收入、支出中位数 1.11：不建议');
  ok(rows.indexOf('红包') < 0, '1 红包支出 80 但收入比支出多：不建议');
  ok(rows.join() === '购物,日用', '1 一行一行列的只有和现在不一样的：购物（没设）、日用（150 → 200）' + rows);
  const same = $('bgSuggestSame');
  ok(same && same.textContent === '其余 3 个分类和建议一致：其他、餐饮、出行', '2 和建议一样的收成一行：' + (same && same.textContent));
  ok(/每月不到 50 元、或者收入比支出多的分类不给建议/.test($('bgSuggestCard').textContent), '2 说明里写了哪些不建议');
  // 写入勾上的：只动列出来的那几行
  $('bgSuggestApply').click(); await t.idle();
  const b = t.w.loadStore(A.ID).archives['默认存档'].budgets;
  ok(b['购物'] === 600 && b['日用'] === 150 && b['餐饮'] === 1350 && !('水果' in b) && !('存款' in b), '3 写入：没设的购物写上 600，已设的日用不勾不动 ' + JSON.stringify(b));
  if (t.ask()) await t.askOk();
  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
