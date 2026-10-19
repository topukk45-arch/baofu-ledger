// 1019-D 常用模板：空状态左对齐，管理页多一个「新建模板」（jsdom，记录全是虚构的）。node zZzC-tpl-new.test.js [index.html]
// 「新建模板」打开记一笔（标题「记一笔，顺便存成常用」），点「添加记录」：这一笔照常记下，再存成常用模板（金额带不带照旧问）；
// 从别处打开记一笔照旧是「记一笔」、记完照旧问「再记一笔」。
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
  const title = () => $('addSheet').querySelector('.sheet-head h3').textContent;

  // 1. 空状态：左对齐，写清怎么加；底部「新建模板」在上、「关闭」在最下面
  $('manageTplSetting').click(); await t.idle();
  const empty = $('tplList').querySelector('.tpl-empty');
  ok(empty && /新建模板/.test(empty.textContent) && /存为常用/.test(empty.textContent), '1 空状态写清怎么加：' + (empty && empty.textContent));
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/\.tpl-empty \{[^}]*text-align:left/.test(css), '1 空状态文字左对齐');
  const btns = [...$('tplMask').querySelector('.form-btns').children].map(b => b.id);
  ok(btns.join() === 'tplNew,closeTpl' && $('tplNew').classList.contains('primary'), '1 「新建模板」在上、「关闭」在最下面 ' + btns);

  // 2. 新建模板：打开记一笔，标题改了
  $('tplNew').click(); await t.idle();
  ok(!shown('tplMask') && shown('addMask') && title() === '记一笔，顺便存成常用', '2 打开记一笔：「记一笔，顺便存成常用」');
  $('billMoney').value = '25';
  chip('billCatChips', '吃饭').click(); chip('billTypeChips', '支出').click();
  $('billRemark').value = '虚构工作餐';
  $('addBill').click(); await t.idle();
  ok(arc().records.length === 2 && arc().records.some(r => r.remark === '虚构工作餐' && r.money === 25), '2 这一笔照常记下');
  ok(t.ask() && t.ask().title === '存为常用' && /金额要一起存吗/.test(t.ask().msg), '2 接着问金额带不带（不再问「再记一笔」）');
  // 选「不带金额」
  const opt = [...$('askChoices').children].find(c => /不带金额/.test(c.textContent)); opt.click(); await t.askOk();
  const tp = arc().tpls || [];
  ok(tp.length === 1 && tp[0].cat === '吃饭' && tp[0].type === 'expense' && tp[0].money == null && tp[0].remark === '虚构工作餐', '2 存成常用模板（不带金额）');
  ok(t.ask() && /这一笔已经记下了/.test(t.ask().msg) && /已存为常用/.test(t.ask().msg), '2 最后写清：这一笔记下了、存成常用了');
  await t.askOk();

  // 3. 问金额时点取消：这一笔照样记下了，写明没存成常用
  $('manageTplSetting').click(); await t.idle(); $('tplNew').click(); await t.idle();
  $('billMoney').value = '9.9'; chip('billCatChips', '购物').click(); chip('billTypeChips', '支出').click();
  $('addBill').click(); await t.idle();
  await t.askCancel();
  ok(arc().records.length === 3 && (arc().tpls || []).length === 1, '3 点取消：记录记下、模板没加');
  ok(t.ask() && /这一笔已经记下了。没有存成常用/.test(t.ask().msg), '3 写明没存成常用：' + (t.ask() && t.ask().msg));
  await t.askOk();

  // 4. 平常打开记一笔：标题照旧，记完照旧问「再记一笔」
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); await t.idle();
  ok(title() === '记一笔', '4 平常打开：标题「记一笔」');
  $('billMoney').value = '3'; chip('billCatChips', '吃饭').click(); chip('billTypeChips', '支出').click();
  $('addBill').click(); await t.idle();
  ok(t.ask() && $('askOk').textContent === '再记一笔' && (arc().tpls || []).length === 1, '4 记完照旧问「再记一笔」，不存模板');
  await t.askCancel();

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
