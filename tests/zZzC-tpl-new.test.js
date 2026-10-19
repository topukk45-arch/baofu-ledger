// 常用模板管理（jsdom，记录全是虚构的）。node zZzC-tpl-new.test.js [index.html]
// 1019-D：空状态左对齐，管理页有「新建模板」。
// 1019-K：「新建模板」不再借用记一笔（原来点「添加记录」会往账本里真记一笔）：单独一个模板面板，
//   只填名字（可不填）、分类、收支、口径、备注、固定金额（可不填），没有记账时间；保存只存模板，
//   账本条数、内容、账本版本都不变；点列表里的一行用同一个面板编辑。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const arc = () => w.loadStore(A.ID).archives['默认存档'];
  const chip = (box, txt) => [...$(box).children].find(c => c.textContent === txt);
  const ledger = () => JSON.stringify(arc().records);
  const ver = () => w.JiwenImportStore.archiveInfo().ver;
  const L0 = ledger(), V0 = ver();

  // 1. 空状态：左对齐，写清怎么加；底部「新建模板」在上、「关闭」在最下面
  $('manageTplSetting').click(); await t.idle();
  const empty = $('tplList').querySelector('.tpl-empty');
  ok(empty && /新建模板/.test(empty.textContent) && /存为常用/.test(empty.textContent), '1 空状态写清怎么加：' + (empty && empty.textContent));
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/\.tpl-empty \{[^}]*text-align:left/.test(css), '1 空状态文字左对齐');
  const btns = [...$('tplMask').querySelector('.form-btns').children].map(b => b.id);
  ok(btns.join() === 'tplNew,closeTpl' && $('tplNew').classList.contains('primary'), '1 「新建模板」在上、「关闭」在最下面 ' + btns);

  // 2. 新建模板：单独的面板，没有记账时间、不打开记一笔
  $('tplNew').click(); await t.idle();
  ok(shown('tplEditMask') && !shown('addMask') && $('tplEditTitle').textContent === '新建模板', '2 打开「新建模板」面板，不是记一笔');
  ok(!$('tplEditMask').querySelector('.dt-input') && $('tplEditName') && $('tplEditCats') && $('tplEditTypes') && $('tplEditMode') && $('tplEditRemark') && $('tplEditMoney'), '2 只有名字、分类、收支、口径、备注、固定金额，没有记账时间');
  ok($('tplEditDelete').style.display === 'none', '2 新建时没有「删除这个模板」');
  // 没选分类：拦下
  $('tplEditSave').click();
  ok($('tplEditErr').style.display === 'block' && /分类/.test($('tplEditErr').textContent) && shown('tplEditMask'), '2 没选分类：拦下');
  $('tplEditName').value = '虚构工作餐';
  chip('tplEditCats', '吃饭').click(); chip('tplEditTypes', '支出').click();
  $('tplEditRemark').value = '公司楼下';
  $('tplEditMoney').value = '25';
  $('tplEditSave').click(); await t.idle();
  const tp = arc().tpls || [];
  ok(tp.length === 1 && tp[0].name === '虚构工作餐' && tp[0].cat === '吃饭' && tp[0].type === 'expense' && tp[0].money === 25 && tp[0].remark === '公司楼下' && tp[0].mode === 'normal', '2 存成模板 ' + JSON.stringify(tp));
  ok(!shown('tplEditMask') && shown('tplMask') && /虚构工作餐/.test($('tplList').textContent), '2 保存后回到模板列表，列表里写名字');
  ok(ledger() === L0 && arc().records.length === 1, '2 账本条数和内容都没变');
  ok(ver() === V0, '2 账本版本没变（' + V0 + ' → ' + ver() + '）');
  ok(!t.ask(), '2 不弹「记账成功」');

  // 3. 编辑：点列表里的一行，同一个面板，改完回到列表
  $('tplList').querySelector('.tpl-item .cat-name').click(); await t.idle();
  ok(shown('tplEditMask') && $('tplEditTitle').textContent === '编辑模板' && $('tplEditName').value === '虚构工作餐' && $('tplEditMoney').value === '25.00' && chip('tplEditCats', '吃饭').classList.contains('sel'), '3 点一行：编辑模板，原来的内容都填好');
  $('tplEditMoney').value = ''; chip('tplEditCats', '购物').click(); chip('tplEditTypes', '收入').click();
  $('tplEditSave').click(); await t.idle();
  const tp2 = arc().tpls;
  ok(tp2.length === 1 && tp2[0].id === tp[0].id && tp2[0].money == null && tp2[0].cat === '购物' && tp2[0].type === 'income', '3 改了：同一个模板、不带金额、购物、收入');
  ok(ledger() === L0 && ver() === V0, '3 编辑以后账本、账本版本都没变');
  // 改过的往下拉 / 返回：先问放弃
  $('tplList').querySelector('.tpl-item .cat-name').click(); await t.idle();
  $('tplEditName').value = '改了一半';
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '3 改了一半按返回：先问放弃');
  await t.askOk();
  ok(!shown('tplEditMask') && shown('tplMask') && arc().tpls[0].name === '虚构工作餐', '3 放弃：回到列表、模板没改');
  // 金额不对：拦下
  $('tplNew').click(); await t.idle();
  chip('tplEditCats', '吃饭').click(); chip('tplEditTypes', '支出').click(); $('tplEditMoney').value = '0';
  $('tplEditSave').click();
  ok($('tplEditErr').style.display === 'block' && /固定金额/.test($('tplEditErr').textContent) && (arc().tpls || []).length === 1, '3 固定金额不对：拦下');
  $('tplEditCancel').click();

  // 4. 删除：在面板里，先确认
  $('tplList').querySelector('.tpl-item .cat-name').click(); await t.idle();
  ok($('tplEditDelete').style.display !== 'none' && $('tplEditDelete').classList.contains('warn'), '4 编辑时有「删除这个模板」（警示色）');
  $('tplEditDelete').click();
  ok(t.ask() && $('askOk').textContent === '删除这个模板', '4 先确认');
  await t.askOk();
  ok((arc().tpls || []).length === 0 && ledger() === L0 && ver() === V0, '4 删掉了，账本、版本都没变');
  $('closeTpl').click();

  // 5. 记一笔照旧是记一笔（不再有「顺便存成常用」）
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); await t.idle();
  ok($('addSheet').querySelector('.sheet-head h3').textContent === '记一笔', '5 记一笔标题照旧');
  $('billMoney').value = '3'; chip('billCatChips', '吃饭').click(); chip('billTypeChips', '支出').click();
  $('addBill').click(); await t.idle();
  ok(t.ask() && $('askOk').textContent === '再记一笔' && arc().records.length === 2 && (arc().tpls || []).length === 0, '5 记完照旧问「再记一笔」，不存模板');
  await t.askCancel();

  // 6. 模板的名字跟着备份走；旧备份没名字照旧
  const st = w.loadStore(A.ID); st.archives['默认存档'].tpls = [{ id: 'x', type: 'expense', cat: '吃饭', remark: '早饭', money: null, mode: 'normal', name: '虚构早点' }]; w.saveStore(st, A.ID); await t.idle();
  const san = w.sanitizeTpls([{ type: 'expense', cat: '吃饭', remark: '早饭', name: '虚构早点' }, { type: 'income', cat: '吃饭', remark: '没名字' }], ['吃饭']);
  ok(san[0].name === '虚构早点' && !('name' in san[1]), '6 导入备份时名字留着，没名字的不带 name');
  ok(w.tplName({ cat: '吃饭', remark: '早饭' }) === '早饭' && w.tplName({ cat: '吃饭', remark: '早饭', name: '虚构早点' }) === '虚构早点', '6 有名字用名字，没有照旧用备注');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
