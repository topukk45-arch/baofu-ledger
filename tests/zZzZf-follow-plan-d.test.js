// 1020-I 方案 D 定下的样子用到别处（jsdom，记录全是虚构的）。node zZzZf-follow-plan-d.test.js [index.html]
// 模板编辑、账单详情、退款、日子弹窗 / 日子管理、筛选浮层照列表卡排；选分类一律用分类抽屉（模板、批量改分类、导入页的选分类面板）；
// 金额用数字键盘的地方都是闪动光标、第二层不加深、文字小面板并排（这三样是共用的，1020-G / H 已经管了，这里再点几处）。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setTimeout(r, 0));

const CATS = ['未分类', '吃饭', '购物', '出行', '工资', '其他', '日用', '水电', '房租'];
const recs = [
  { id: 'a1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' },
  { id: 'a2', time: '2026-12-02T12:00', money: 100, type: 'expense', cat: '购物', remark: '虚构鞋子' },
  { id: 'a3', time: '2026-12-03T09:00', money: 500, type: 'expense', cat: '房租', remark: '虚构还款', skip: true },
];
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs, CATS) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const over = id => $(id).classList.contains('stack-over');
  const arc = () => w.JiwenStore.loadStore(A.ID).archives['默认存档'];
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 一、账单详情：列表卡，统计单独一行；「修改」整宽在上、「关闭」在下
  w.JiwenStats.openDetail('a3');
  const rows = [...$('detailList').querySelectorAll(':scope > .rec-row')].filter(r => r.style.display !== 'none').map(r => r.querySelector('.rec-row-k').textContent);
  ok(rows.join() === '时间,金额,收支,分类,统计,备注', '一 详情一行一项：时间、金额、收支、分类、统计、备注：' + rows.join());
  ok($('detailMode').textContent === '不计' && $('detailType').textContent === '支出', '一 统计单独一行写「不计」，收支那行只写收支');
  const db = $('detailEdit').parentElement;
  ok(db.firstElementChild === $('detailEdit') && db.lastElementChild === $('detailClose') && $('detailEdit').classList.contains('primary') && $('detailEdit').classList.contains('block'), '一 「修改」整宽在上，「关闭」在下');
  $('detailEdit').click(); await tick();
  ok(shown('editMask') && !shown('detailMask') && !over('editMask'), '一 详情 → 修改：详情先关，修改账单照常一层（加遮罩，不叠两层灰）');
  $('cancelEdit').click(); await tick();
  if (shown('detailMask')) $('detailClose').click();

  // 二、退款：全额 | 部分两个一样大的按钮；部分退款弹数字键盘、全额只读；时间、备注是列表行
  w.openEdit('a2'); await tick();
  $('editRefundBtn').click(); await tick();
  ok(shown('refundMask') && $('refundKind').classList.contains('io-pair') && [...$('refundKind').children].map(c => c.textContent).join() === '全额,部分', '二 退款方式：「全额 | 部分」两个一样大的按钮');
  ok($('refundMoney').value === '100.00' && $('refundMoney').dataset.kpLock === '1' && $('refundMoney').closest('.rec-money-row'), '二 全额：金额只读（数字键盘不弹）、靠右');
  $('refundMoney').click(); await tick();
  ok(!shown('kpMask'), '二 全额时点金额：不弹数字键盘');
  $('refundKind').querySelector('[data-v="part"]').click(); await tick();
  ok(shown('kpMask') && w.JiwenKeypad.kpTarget === $('refundMoney') && !$('refundMoney').dataset.kpLock && over('refundMask') === false, '二 部分：弹数字键盘对着退款金额');
  ['3', '0'].forEach(k => d.querySelector(`#kpGrid .kp-key[data-k="${k}"]`).click());
  ok($('refundMoney').value === '30', '二 数字键盘输进去');
  w.kpClose();
  ok($('refundTimeTxt').textContent.length > 0 && $('refundTimeRow').querySelector('.rec-row-k').textContent === '时间', '二 时间是列表行，右边写时间');
  $('refundRemarkRow').click(); await tick();
  ok(shown('txtMask') && over('txtMask'), '二 备注是列表行，点了弹文字小面板（不加深）');
  $('txtArea').value = '虚构退货'; $('txtOk').click(); await tick();
  ok($('refundRemarkVal').textContent === '虚构退货', '二 写好的备注写在那一行');
  const rb = $('refundOk').parentElement;
  ok(rb.firstElementChild === $('refundOk') && rb.lastElementChild === $('refundCancel'), '二 「确认退款」在上、「取消」在下');
  $('refundOk').click(); await t.idle();
  const rf = arc().records.find(r => r.refundOf === 'a2');
  ok(rf && rf.money === 30 && rf.remark === '虚构退货', '二 照旧记得进去');
  if (shown('askMask')) $('askOk').click();

  // 三、模板编辑：名字、金额一张小卡；收支两个按钮；分类 4 个 + 更多 / 统计 / 备注
  d.querySelector('.tab-btn[data-tab="settings"]').click(); await tick();
  $('manageTplSetting').click(); $('tplNew').click(); await tick();
  ok($('tplEditName').closest('.rec-row') && $('tplEditMoney').closest('.rec-row') && $('tplEditTypes').classList.contains('io-pair') && $('tplEditCats').classList.contains('rec-cats') && $('tplEditCats').children.length === 4, '三 模板：名字、金额是列表行，收支两个按钮，分类一行 4 个');
  ok($('tplEditCatMore') && $('tplEditMode').classList.contains('rec-row') && $('tplEditRemarkRow'), '三 更多 / 统计 / 备注三行');
  [...$('tplEditTypes').children].find(c => c.textContent === '支出').click();
  $('tplEditCatMore').click(); await tick();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '选分类' && over('uiSheetMask'), '三 「更多」拉出分类抽屉（不加深）');
  [...$('catDrawerAll').querySelectorAll('.cc')].find(c => c.textContent === '水电').click(); await tick();
  ok($('tplEditCatMoreVal').textContent === '水电', '三 选了 4 个以外的：「更多」那一行写它');
  $('tplEditMode').click(); d.querySelector('#modePick .mode-pick-row[data-v="flow"]').click(); await tick();
  ok($('tplEditModeVal').textContent === '往来', '三 统计那一行：选往来');
  $('tplEditMoney').click(); await tick();
  ok(shown('kpMask') && w.JiwenKeypad.kpTarget === $('tplEditMoney'), '三 固定金额用数字键盘');
  d.querySelector('#kpGrid .kp-key[data-k="9"]').click(); w.kpClose();
  ok([...$('tplEditSave').parentElement.children].map(b => b.id).join() === 'tplEditSave,tplEditDelete,tplEditCancel', '三 「保存」「删除这个模板」「取消」');
  $('tplEditSave').click(); await t.idle();
  const tp = (arc().tpls || [])[0];
  ok(tp && tp.cat === '水电' && tp.mode === 'flow' && tp.money === 9 && tp.type === 'expense', '三 照旧存进去：' + JSON.stringify(tp));
  if (shown('tplMask')) $('closeTpl').click();

  // 四、日子弹窗 / 日子管理
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  $('daysManageBtn').click(); $('daysAdd').click(); await tick();
  ok($('dayName').closest('.rec-row') && $('dayDateLine').classList.contains('rec-time') && $('dayDateLine').querySelector('.rec-time-ico') && $('dayPinRow').contains($('dayPin')), '四 日子弹窗：名称一行、目标日期一行（和记账时间一样，带日历图标）、置顶一行带开关');
  ok($('dayDateTxt').textContent && $('dayPreview').compareDocumentPosition($('dayPinRow')) & 2, '四 目标日期写在那一行，预览那句在下面');
  $('dayPinRow').click();
  ok($('dayPin').classList.contains('on'), '四 点置顶那一行：开');
  $('dayCancel').click(); await tick();
  if (shown('askMask')) $('askOk').click();
  $('daysManage').click(); await tick();
  ok($('dmCount').closest('.rec-row') && $('dmBatch').classList.contains('rec-row'), '四 日子管理：入口卡显示几条、批量删除日子是列表行');
  $('dmClose').click(); await tick();
  $('daysBack').click(); await tick();

  // 五、筛选浮层：关键词、金额、日期是列表行；统计按新叫法；分类照旧多选
  $('filterFab').click(); await wait(20);
  const fl = $('filterSheet').querySelector('.filter-list');
  ok(fl && [...fl.querySelectorAll('.rec-row-k')].map(x => x.textContent).join() === '关键词,金额,日期' && fl.contains($('searchMin')) && fl.contains($('searchFrom')), '五 关键词、金额、日期一张列表卡');
  ok([...$('filterModeChips').querySelectorAll('.cc')].map(c => c.textContent).join() === '全部,计入,不计,往来' && $('filterChips').classList.contains('filter-chips'), '五 统计按新叫法和顺序，分类照旧是多选分类块');
  $('searchMin').click(); await tick();
  ok(shown('kpMask') && w.JiwenKeypad.kpTarget === $('searchMin') && $('kpCaret'), '五 金额区间用数字键盘、有闪动光标');
  w.kpClose();
  $('sheetClear').click(); await tick();

  // 六、批量改分类、导入页的选分类面板：分类抽屉
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  w.JiwenLedger.openBatchMenu(); await tick();
  [...$('askChoices').querySelectorAll('.cc')].find(b => (b.querySelector('.cc-label') || b).textContent === '改分类').click(); $('askOk').click(); await tick();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '改成哪个分类' && $('catDrawerAll'), '六 批量改分类：分类抽屉');
  w.JiwenSheet.back(); await tick();
  if (shown('askMask')) $('askCancel').click();
  w.JiwenSheet.pick({ title: '这一笔归到哪个分类', sub: '虚构对方 · 12.00 元', chips: true, options: ['未分类', '吃饭', '购物'].map(v => ({ value: v, label: v })), value: '吃饭', onPick() {} });
  ok($('catDrawerAll') && $('uiSheetSub').textContent === '虚构对方 · 12.00 元 · 可选的分类 3 个' && $('uiPickList').querySelector('.cc.sel').dataset.value === '吃饭', '六 导入页那种选分类面板（chips）：也是分类抽屉，副标题照留（1021-T16 起「共 3 个」写成「可选的分类 3 个」）');
  w.JiwenSheet.back();
  w.JiwenSheet.pick({ title: '并到哪个已有分类', chips: true, options: [{ value: '', label: '不并，照原样' }, { value: '吃饭', label: '吃饭' }], value: '', onPick() {} });
  ok(!$('catDrawerAll') && $('uiPickList').querySelectorAll('.cc').length === 2, '六 有「不并」这种不是分类的选项：照旧一排分类块');
  w.JiwenSheet.back();

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`1020-I 方案 D 用到别处：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
