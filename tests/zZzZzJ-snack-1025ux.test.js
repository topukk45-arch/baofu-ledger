// @serial
// 1025-UX 记完一笔不再弹「记账成功」：表单关掉，底部浮一条小条「已记下 分类 金额」+「再记一笔」（没写备注再加「补备注」），4 秒自己收；
//   账单页里新记的那一行闪一下。（jsdom 跑整个 App；真等 4 秒）node zZzZzJ-snack-1025ux.test.js [index.html]
// 记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const RC = require('./helpers/rec');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const t = await A.boot({ html, www: WWW, now: '2026-10-25T10:00:00', seed: A.seedOf([{ id: 'o1', time: '2026-10-20T12:00', money: 20, type: 'expense', cat: '吃饭', remark: '午饭' }], null, { budgets: { '吃饭': 50 } }) });
  const { $, d, w } = t;
  const shown = id => $(id) && $(id).style.display === 'flex';
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await sleep(20);
  const add = (money, cat, type, remark) => {
    $('fabAdd').click(); $('billMoney').value = String(money);
    RC.chip(d, 'billCatChips', cat).click(); RC.chip(d, 'billTypeChips', type).click();
    if (remark) { $('billRemark').value = remark; w.JiwenForms.syncRecRows && w.JiwenForms.syncRecRows(); }
    $('addBill').click();
  };
  add(12, '吃饭', '支出');
  const sn = $('uiSnack');
  ok(!shown('askMask') && !shown('addMask'), '1 记完：表单关了，不弹「记账成功」框');
  ok(sn && sn.classList.contains('show') && txt(sn.querySelector('.snack-t')) === '已记下 吃饭 12.00', '1 底部小条「已记下 吃饭 12.00」：' + txt(sn));
  ok(/10月「吃饭」预算：已花 32\.00 \/ 50\.00/.test(txt(sn.querySelector('.snack-s'))), '1 有预算的分类：第二行写当月预算情况：' + txt(sn.querySelector('.snack-s')));
  ok($('snackRemark') && $('snackAgain') && $('snackAgain').classList.contains('primary'), '1 没写备注：「补备注」「再记一笔」（主按钮）');
  const newId = w.JiwenStore.getUserData().find(r => r.money === 12).id;
  await sleep(40);
  const row = [...$('billList').querySelectorAll('.bl-row')].find(r => r.dataset.id === newId);
  ok(row && row.classList.contains('row-flash'), '1 账单页里新记的那一行闪一下');
  $('snackRemark').click(); await sleep(10);
  ok(!sn.classList.contains('show') && shown('askMask'), '1 点「补备注」：小条收起，弹写备注的框');
  $('askInput').value = '虚构早饭'; $('askOk').click(); await sleep(10);
  ok(w.JiwenStore.getUserData().find(r => r.id === newId).remark === '虚构早饭', '1 备注补上了');

  add(5, '购物', '支出', '纸巾');
  ok(sn.classList.contains('show') && !$('snackRemark') && !txt(sn.querySelector('.snack-s')), '2 写了备注、没预算：只有「再记一笔」，没有第二行');
  $('snackAgain').click(); await sleep(10);
  ok(shown('addMask') && !sn.classList.contains('show') && $('billMoney').value === '', '2 点「再记一笔」：打开空白的记一笔');
  $('closeAdd').click(); await sleep(10);

  add(8000, '工资', '收入');
  ok(txt(sn.querySelector('.snack-t')) === '已记下 工资 +8000.00', '3 收入写 +');
  await sleep(4300);
  ok(!sn.classList.contains('show'), '3 不碰它：4 秒自己收起');
  add(1, '吃饭', '支出');
  sn.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true }));
  await sleep(4300);
  ok(sn.classList.contains('show'), '3 手指按着：不收');
  sn.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true }));
  await sleep(4300);
  ok(!sn.classList.contains('show'), '3 松手：重新计时，4 秒后收');

  // 4. 改好一笔：也浮一条「已改好 …」，那一行闪一下
  w.openEdit('o1'); await sleep(20);
  $('editMoney').value = '22'; $('saveEdit').click(); await sleep(40);
  ok(!shown('editMask') && sn.classList.contains('show') && txt(sn.querySelector('.snack-t')) === '已改好 吃饭 22.00' && !sn.querySelector('button'), '4 改好一笔：小条「已改好 吃饭 22.00」，没有按钮');
  const row2 = [...$('billList').querySelectorAll('.bl-row')].find(r => r.dataset.id === 'o1');
  ok(row2 && row2.classList.contains('row-flash'), '4 改的那一行闪一下');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1025-UX 记完的小条：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
