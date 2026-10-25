// 1025-UX 记一笔：选了分类、还没亲手选收支时，按这个分类以前记的收支自动选上（八成以上是哪种就选哪种；退款不算；没记过的不选）。
//   亲手点过收支就不再动；自动选的换分类时跟着重新看；最近常用那 4 个不重排。（jsdom 跑整个 App）node zZzZzK-typeguess-1025ux.test.js [index.html]
// 记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const tick = () => new Promise(r => setTimeout(r, 0));
const R = (id, d, money, type, cat, extra) => Object.assign({ id, time: `2026-10-${d}T12:00`, money, type, cat, remark: '' }, extra || {});

(async () => {
  const recs = [
    R('a', '01', 10, 'expense', '吃饭'), R('b', '02', 12, 'expense', '吃饭'), R('c', '03', 15, 'expense', '吃饭'), R('c2', '04', 3, 'income', '吃饭', { refundOf: 'c' }),
    R('d', '05', 8000, 'income', '工资'), R('e', '06', 8000, 'income', '工资'),
    R('f', '07', 50, 'expense', '红包'), R('g', '08', 66, 'income', '红包'),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-25T10:00:00', seed: A.seedOf(recs) });
  const { $, d, w } = t;
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  const sel = () => { const c = $('billTypeChips').querySelector('.sel-out, .sel-in'); return c ? txt(c) : ''; };
  const F = w.JiwenForms;
  $('fabAdd').click(); await tick();
  const order0 = [...$('billCatChips').querySelectorAll('.cc')].map(txt).join();
  ok(sel() === '', '1 打开记一笔：收支照旧不选');
  F.pickBillCat('吃饭');
  ok(sel() === '支出' && F.billTypeSel === 'expense', '1 选吃饭（以前都是支出，退款不算）：自动选上支出');
  ok([...$('billCatChips').querySelectorAll('.cc')].map(txt).join() === order0, '1 最近常用那 4 个不重排');
  F.pickBillCat('工资');
  ok(sel() === '收入', '1 自动选的、换成工资（以前都是收入）：跟着换成收入');
  F.pickBillCat('红包');
  ok(sel() === '', '1 红包一半支出一半收入：拿不准，不选');
  F.pickBillCat('杂项');
  ok(sel() === '', '1 没记过的分类：不选');
  $('billMoney').value = '9'; $('addBill').click(); await tick();
  ok($('askMask').style.display === 'flex' && /收支/.test(txt($('askTitle'))), '1 没选收支就保存：照旧问收支');
  $('askCancel').click(); await tick(); $('closeAdd').click(); await tick();

  $('fabAdd').click(); await tick();
  [...$('billTypeChips').querySelectorAll('.cc')].find(c => txt(c) === '收入').click();
  F.pickBillCat('吃饭');
  ok(sel() === '收入', '2 先亲手点了收入，再选吃饭：不改（听你的）');
  $('closeAdd').click(); await tick();

  $('fabAdd').click(); await tick();
  F.pickBillCat('吃饭'); $('billMoney').value = '7'; $('addBill').click(); await tick();
  const last = w.JiwenStore.getUserData().find(r => r.money === 7);
  ok(last && last.type === 'expense' && last.cat === '吃饭', '3 只填金额、点分类就能存（存成支出）');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1025-UX 收支跟着分类：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
