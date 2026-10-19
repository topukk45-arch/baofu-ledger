// 1019-R 记一笔 / 修改账单排紧（jsdom，记录全是虚构的）。node zZzN-rec-compact.test.js [index.html]
// 金额一行在最上面（大字 + 旁边小的「支出 / 收入」），记账时间一行小字（「今天 11:21 ›」，点了弹日期时间选择），
// 分类照旧是圆角块，统计口径收进「更多」（不是「计入」时自动展开），备注一行（点了弹文字输入小面板），保存贴在面板底边。
// 只改排法：记的内容、收支必选、口径规则都不变。412×970 一屏放得下在 tests 外用真 Chromium 截图量（见提交说明）。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const pad = n => String(n).padStart(2, '0');
const dt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const recs = [
  { id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' },
  { id: 'r2', time: '2025-03-05T08:07', money: 300, type: 'income', cat: '其他', remark: '虚构垫付', flow: true },
];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const after = (a, b) => !!($(a).compareDocumentPosition($(b)) & 4);
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 1. 排法：时间一行小字 → 金额一行（¥ + 大字 + 小的收支）→ 分类 → 更多 → 备注；保存在底部那排、主按钮在上
  $('fabAdd').click(); await wait(320); w.kpClose();
  ok(after('billTimeLine', 'billMoney') && after('billMoney', 'billCatChips') && after('billCatChips', 'billMoreBtn') && after('billMoreBtn', 'billRemark'), '1 时间 → 金额 → 分类 → 更多 → 备注');
  const row = $('billMoney').closest('.rec-money-row');
  ok(row && row.contains($('billTypeChips')) && $('billTypeChips').classList.contains('io-mini'), '1 收支是金额旁边一个小切换（同一行）');
  ok([...$('billTypeChips').children].map(c => c.textContent).join() === '支出,收入' && !$('billTypeChips').querySelector('.sel-out,.sel-in'), '1 收支照旧不默认选中');
  ok($('billTime').closest('.rec-time-raw') || $('billTime').classList.contains('rec-time-raw'), '1 原来的时间框藏起来（值还在它身上）');
  const now = new w.Date();   // 测试里 App 的「现在」是假的（helpers/app.js 固定的时间）
  ok($('billTimeTxt').textContent === '今天 ' + pad(now.getHours()) + ':' + pad(now.getMinutes()), '1 时间写成「今天 HH:mm」：' + $('billTimeTxt').textContent);
  const foot = $('addBill').parentElement;
  ok(foot.classList.contains('rec-foot') && foot.firstElementChild === $('addBill') && foot.lastElementChild === $('closeAdd') && $('addBill').textContent === '保存' && $('addBill').classList.contains('primary'), '1 底部那排：「保存」（主按钮）在上、「关闭」在最下');
  ok(!foot.contains($('billSaveTpl')) && $('addSheet').contains($('billSaveTpl')), '1 「存为常用」挪进内容里');
  ok($('billRemark').getAttribute('rows') === '1' && $('billRemark').classList.contains('txt-field'), '1 备注一行，点了弹文字输入小面板');

  // 2. 时间：昨天 / 今年别的日子 / 往年；点那一行弹日期时间选择，选完那一行跟着变
  const y = new w.Date(now.getTime()); y.setDate(y.getDate() - 1); y.setHours(9, 5);
  w.setDtInput($('billTime'), dt(y));
  ok($('billTimeTxt').textContent === '昨天 09:05', '2 昨天：' + $('billTimeTxt').textContent);
  w.setDtInput($('billTime'), '2024-02-03T21:30');
  ok($('billTimeTxt').textContent === '2024年2月3日 21:30', '2 往年带年份：' + $('billTimeTxt').textContent);
  const far = new w.Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 7, 0);
  w.setDtInput($('billTime'), dt(far));
  const farTxt = far.getFullYear() === now.getFullYear() ? `${far.getMonth() + 1}月${far.getDate()}日 07:00` : `${far.getFullYear()}年${far.getMonth() + 1}月${far.getDate()}日 07:00`;
  ok($('billTimeTxt').textContent === farTxt, '2 别的日子写几月几日：' + $('billTimeTxt').textContent);
  $('billTimeLine').click();
  ok(shown('dtMask'), '2 点时间那一行：弹日期时间选择');
  w.closeDtPicker && w.closeDtPicker(); if (shown('dtMask')) $('dtMask').style.display = 'none';

  // 3. 统计口径收在「更多」里：默认收着、写现在的口径；点开能改；选了不是「计入」的分类自动变「不计入」并展开
  ok($('billMoreBody').hidden && $('billMoreVal').textContent === '统计口径：计入', '3 默认收着，写「统计口径：计入」');
  $('billMoreBtn').click();
  ok(!$('billMoreBody').hidden && $('billMoreBtn').getAttribute('aria-expanded') === 'true', '3 点「更多」展开');
  [...$('billMode').children].find(c => c.dataset.v === 'flow').click();
  ok($('billMoreVal').textContent === '统计口径：只算结余', '3 改了口径，那一行跟着写');
  $('billMoreBtn').click();
  ok($('billMoreBody').hidden, '3 再点收起（口径还是只算结余）');
  w.resetBillForm();
  ok($('billMoreBody').hidden && $('billMoreVal').textContent === '统计口径：计入', '3 重新开一笔：回到计入、收着');
  w.setModeChips($('billMode'), 'skip');
  ok(!$('billMoreBody').hidden && $('billMoreVal').textContent === '统计口径：不计入', '3 不是「计入」（模板、草稿带来的）：自动展开');
  w.setModeChips($('billMode'), 'normal');
  ok($('billMoreBody').hidden, '3 换回计入：收起');

  // 4. 照旧记得进去：选收支、分类、填金额，点保存
  $('billMoney').value = '26.5';
  [...$('billTypeChips').children].find(c => c.textContent === '支出').click();
  [...$('billCatChips').children].find(c => c.textContent === '吃饭').click();
  $('addBill').click(); await t.idle();
  const saved = w.loadStore(A.ID).archives['默认存档'].records.find(r => r.money === 26.5);
  ok(saved && saved.type === 'expense' && saved.cat === '吃饭' && !shown('addMask'), '4 照旧记进账本、记一笔关掉');
  // 收支没选：照旧拦住
  $('fabAdd').click(); await wait(320); w.kpClose();
  $('billMoney').value = '3';
  [...$('billCatChips').children].find(c => c.textContent === '吃饭').click();
  $('addBill').click(); await t.idle();
  ok(shown('addMask') && w.loadStore(A.ID).archives['默认存档'].records.length === 3, '4 收支没选：照旧不让存');
  $('closeAdd').click(); await wait(300);

  // 5. 修改账单同一套；口径不是「计入」的一打开就展开
  w.openEdit('r2'); await t.idle();
  ok(after('editTimeLine', 'editMoney') && $('editMoney').closest('.rec-money-row').contains($('editTypeChips')), '5 修改：时间一行、金额旁边收支');
  ok($('editTimeTxt').textContent === '2025年3月5日 08:07' || $('editTimeTxt').textContent.endsWith('3月5日 08:07'), '5 修改：时间小字 ' + $('editTimeTxt').textContent);
  ok(!$('editMoreBody').hidden && $('editMoreVal').textContent === '统计口径：只算结余', '5 只算结余的记录：「更多」自动展开');
  const ef = $('saveEdit').parentElement;
  ok(ef.classList.contains('rec-foot') && ef.firstElementChild === $('saveEdit') && ef.lastElementChild === $('cancelEdit'), '5 底部「保存」在上、「取消」在最下');
  ok(!ef.contains($('deleteInEdit')) && !ef.contains($('editRefundBtn')) && !ef.contains($('editSaveTpl')), '5 退款 / 存为常用 / 删除挪进内容里');
  $('cancelEdit').click(); await wait(300);
  w.openEdit('r1'); await t.idle();
  ok($('editMoreBody').hidden && $('editMoreVal').textContent === '统计口径：计入', '5 计入的记录：收着');
  $('cancelEdit').click();

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
