// 单独一版（1016-Z9）按过去 3–6 个月的中位数给每月预算建议、一键写入（jsdom）。node zT-budget-suggest.test.js [index.html]
// 只看已经过完的月份（往前最多 6 个、有记录的月份），不到 3 个月不建议；每个分类各月花的（支出、计入、退款抵扣，某月没花算 0）取中位数、往上取整到 10 元，
// 中位数 0 的不建议；没设预算的默认勾上、已设的不勾；写入勾上的；开发开关关着时没有这个入口；导入结果页「按过去几个月设预算」直接打开建议。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const p2 = n => String(n).padStart(2, '0');
let k = 0;
const r = (mo, d, money, cat, o) => Object.assign({ id: 'r' + (++k), time: `2026-${p2(mo)}-${p2(d)}T12:00`, money, type: 'expense', cat, remark: '' }, o || {});

(async () => {
  const RECS = [];
  [[7, 300], [8, 500], [9, 400], [10, 600], [11, 450]].forEach(([mo, v]) => { RECS.push(r(mo, 3, v / 2, '吃饭'), r(mo, 9, v / 2, '吃饭')); });
  RECS.push(r(8, 5, 120, '购物'), r(10, 5, 80, '购物'));
  [7, 8, 9, 10, 11].forEach(mo => { const o = r(mo, 6, 100, '出行'); RECS.push(o, r(mo, 7, 4.5, '出行', { type: 'income', refundOf: o.id })); });
  RECS.push(r(11, 20, 9999, '吃饭', { skip: true }));        // 不计入的不算
  RECS.push(r(12, 1, 5000, '吃饭'));                          // 这个月的不算
  const CATS = ['未分类', '吃饭', '购物', '出行', '其他'];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, CATS, { budgets: { '出行': 50 } }) });
  const { $, d } = t;
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t.idle();
  ok($('bgSuggestBtn'), '1 预算页有「按过去几个月给预算建议」');
  $('bgSuggestBtn').click();
  const rows = [...d.querySelectorAll('.bg-suggest-row')];
  const txt = rows.map(x => x.textContent);
  ok(rows.length === 2 && /吃饭：建议 450 元（中位数 450\.00），还没设/.test(txt[0]) && /出行：建议 100 元（中位数 95\.50），现在 50\.00/.test(txt[1]), '1 吃饭 300/500/400/600/450 → 450；出行 100 退 4.5 → 95.5 往上取整 100；购物大多数月份没花、中位数 0 不建议 ' + JSON.stringify(txt));
  ok(rows[0].querySelector('input').checked && !rows[1].querySelector('input').checked, '1 没设预算的勾上，已经设了的不勾');
  ok(/过去 5 个月/.test($('bgSuggestCard').textContent), '1 写明按过去 5 个月');
  $('bgSuggestApply').click(); await t.idle();
  await t.askOk();
  ok(same(t.arch().budgets, { '出行': 50, '吃饭': 450 }), '2 写入勾上的：吃饭 450，出行没勾还是 50');
  ok(!$('bgSuggestList'), '2 写完收起');
  // 不到 3 个月
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([r(10, 3, 30, '吃饭'), r(11, 3, 40, '吃饭')], CATS) });
    t2.d.querySelector('.tab-btn[data-tab="stats"]').click(); t2.d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t2.idle();
    t2.$('bgSuggestBtn').click();
    ok(/只有 2 个，至少要 3 个月/.test(t2.$('bgSuggestCard').textContent) && !t2.$('bgSuggestApply'), '3 只有 2 个月的记录：不建议，写明原因');
  }
  // 开关关着
  {
    const t3 = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(RECS, CATS), { app_dev_import: '' }) });
    t3.d.querySelector('.tab-btn[data-tab="stats"]').click(); t3.d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t3.idle();
    ok(!t3.$('bgSuggestCard'), '4 开发开关关着：没有预算建议');
  }
  // 导入结果页「按过去几个月设预算」直接打开建议
  {
    t.w.JiwenImportNext.budget(); await t.idle();
    ok(t.$('bgSuggestList') && t.$('statPaneBudget').style.display !== 'none', '5 导入结果页「按过去几个月设预算」：到预算页、建议直接打开');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
