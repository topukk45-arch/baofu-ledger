// 1019-B 所有弹窗都是「筛选」那套底部面板（jsdom，记录全是虚构的）。node zZzA-form-sheets.test.js [index.html]
// 结构：.mask.sheet-mask.form-mask > .sheet，顶上 .sheet-grip 拖动条（+ 标题）；按钮 .ui-btn 竖排、取消在最下面；
// 往下拉 / 返回键关闭：记一笔、修改账单、日子填过东西先问「放弃这次填写？」，没填过直接关；别的弹窗直接关。
// 键盘弹起时贴着键盘（真浏览器里量，见 tests/ui/audit.js 的「键盘弹起」那段）；这里查老的顶部对齐规则都去掉了。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
const MASKS = ['addMask', 'editMask', 'detailMask', 'refundMask', 'tplMask', 'catMask', 'themeMask', 'dtMask', 'devImportMask', 'aiExpMask', 'dayMask', 'dayMgrMask', 'ymMask'];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const touch = (el, type, x, y) => { const ev = new w.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] }); el.dispatchEvent(ev); };
  const swipe = el => { touch(el, 'touchstart', 200, 300); for (let i = 1; i <= 25; i++) touch(el, 'touchmove', 200, 300 + i * 12); touch(el, 'touchend', 200, 600); };
  const tab = n => d.querySelector('.tab-btn[data-tab="' + n + '"]').click();

  // 1. 结构：13 个弹窗都是 sheet-mask > sheet，带拖动条；老的 .mask 一个不剩
  MASKS.forEach(id => {
    const m = $(id), sh = m && m.querySelector(':scope > .sheet');
    ok(m && m.classList.contains('sheet-mask') && m.classList.contains('form-mask') && sh && sh.querySelector('.sheet-grip .sheet-handle'), `1 ${id} 是底部面板、有拖动条`);
  });
  ok(d.querySelectorAll('.mask:not(.sheet-mask)').length === 0, '1 没有不是底部面板的弹窗了');
  // 按钮：.ui-btn 竖排，取消 / 关闭在最下面
  MASKS.forEach(id => {
    const box = $(id).querySelector('.form-btns'); if (!box) { ok(false, `1 ${id} 底部按钮那排`); return; }
    const last = box.lastElementChild;
    ok(box.classList.contains('ui-stack') && last.classList.contains('ui-btn') && /取消|关闭/.test(last.textContent), `1 ${id} 按钮竖排、「${last.textContent}」在最下面`);
  });
  // 日子：保存在上、删除整宽警示色、取消最下面
  const dayBtns = [...$('dayMask').querySelector('.form-btns').children].map(b => b.id);
  ok(dayBtns.join() === 'daySave,dayDelete,dayCancel' && $('dayDelete').classList.contains('warn') && $('dayDelete').classList.contains('block'), '1 日子：保存 / 删除这个日子（警示色、整宽）/ 取消 ' + dayBtns);
  // 1017-W 的过渡样式、键盘弹起时老弹窗顶部对齐的规则都去掉了
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(!/\.mask:not\(\.sheet-mask\)/.test(css), '1 1017-W 的过渡样式去掉了');
  ok(!/body\.kb-open \.mask \.edit-dialog/.test(css) && !/body\.kb-open \.edit-dialog/.test(css), '1 键盘弹起时老弹窗的规则去掉了');

  // 2. 记一笔：没填直接往下拉 → 关掉，不问
  tab('ledger');
  // 1019-P 起记一笔滑上来以后（约 0.26 秒）自动弹数字键盘，返回键会先收它；这里先等它弹出来再收掉，再按返回
  const openAdd = async () => { $('fabAdd').click(); await t.idle(); await new Promise(r => setTimeout(r, 420)); w.kpClose(); };
  await openAdd();
  ok(shown('addMask'), '2 打开记一笔');
  swipe($('addSheet'));
  ok(!shown('addMask') && !t.ask(), '2 没填过：往下拉直接关、不问');
  // 填了金额再往下拉 → 问「放弃这次填写？」；「接着填」留着，「放弃，关掉」关掉
  await openAdd();
  $('billMoney').value = '23.5'; $('billMoney').dispatchEvent(new w.Event('input'));
  swipe($('addSheet'));
  ok(t.ask() && t.ask().title === '放弃这次填写？' && $('askOk').textContent === '放弃，关掉' && $('askOk').classList.contains('warn') && $('askCancel').textContent === '接着填', '2 填过：往下拉先问「放弃这次填写？」');
  await t.askCancel();
  ok(shown('addMask') && $('billMoney').value === '23.5', '2 点「接着填」：弹窗还在、填的还在');
  // 返回键也一样
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '2 填过按返回键：也先问');
  await t.askOk();
  ok(!shown('addMask'), '2 点「放弃，关掉」：关掉');
  // 点「关闭」按钮照旧直接关
  await openAdd(); $('billMoney').value = '9'; $('closeAdd').click();
  ok(!shown('addMask') && !t.ask(), '2 点「关闭」按钮照旧直接关');
  // 选了分类也算填过
  await openAdd();
  const chip = [...$('billCatChips').children].find(c => c.textContent === '吃饭'); chip.click();
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '2 只选了分类：按返回也先问');
  await t.askOk();

  // 3. 修改账单：没改直接关；改了备注先问
  w.openEdit('r1'); await t.idle();
  ok(shown('editMask'), '3 打开修改账单');
  await t.back();
  ok(!shown('editMask') && !t.ask(), '3 没改：返回键直接关');
  w.openEdit('r1'); await t.idle();
  $('editRemark').value = '虚构午饭（改）';
  swipe($('editSheet'));
  ok(t.ask() && t.ask().title === '放弃这次填写？', '3 改了备注：往下拉先问');
  await t.askOk();
  ok(!shown('editMask') && w.JiwenStore.loadStore(A.ID).archives['默认存档'].records.find(r => r.id === 'r1').remark === '虚构午饭', '3 放弃：关掉、记录没改');

  // 4. 日子：没填直接关；填了名字先问
  $('daysAdd').click(); await t.idle();
  ok(shown('dayMask'), '4 打开添加日子');
  swipe($('daySheet'));
  ok(!shown('dayMask') && !t.ask(), '4 没填：往下拉直接关');
  $('daysAdd').click(); await t.idle();
  $('dayName').value = '虚构纪念日';
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '4 填了名字：返回键先问');
  await t.askOk();
  ok(!shown('dayMask'), '4 放弃：关掉');

  // 5. 别的弹窗：往下拉直接关（分类管理、常用模板、外观、详情）
  tab('settings');
  for (const [btn, id, sh] of [['manageCatSetting', 'catMask', 'catSheet'], ['manageTplSetting', 'tplMask', 'tplSheet'], ['themeBtn', 'themeMask', 'themeSheet']]) {
    const b = $(btn); if (!b) { ok(false, `5 找不到 ${btn}`); continue; }
    b.click(); await t.idle();
    ok(shown(id), `5 打开 ${id}`);
    swipe($(sh));
    ok(!shown(id) && !t.ask(), `5 ${id} 往下拉直接关`);
  }
  // 详情：返回键关
  w.openDetail && w.openDetail('r1'); await t.idle();
  if (shown('detailMask')) { await t.back(); ok(!shown('detailMask'), '5 详情：返回键关'); }

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
