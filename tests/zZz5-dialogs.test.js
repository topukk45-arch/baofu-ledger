// 1017-S 起全 App 的提示 / 确认 / 输入框统一成底部面板（jsdom）。node zZz5-dialogs.test.js [index.html]
// 共用提示框（askMask）：和「筛选」、选分类同一套 .sheet-mask > .sheet，顶上拖动条 + 标题，文字左对齐，
// 按钮竖排：往前走的在上、取消在最下面；危险操作（opts.danger）确认按钮用警示色；返回键、往下拉 = 取消，只关这一层。
// 后面几版按类别改的危险操作文案也在这里查。数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
(async () => {
  const MAN = [{ id: 'm1', time: '2026-10-06T09:30', money: 36, type: 'expense', cat: '购物', remark: '买书' }];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '购物']), now: '2026-10-20T10:00:00' });
  const { $, w } = t;
  // ===== 1. 共用提示框的样子 =====
  const m = $('askMask'), sh = $('askSheet');
  ok(m.classList.contains('sheet-mask') && sh.classList.contains('sheet') && $('askGrip').classList.contains('sheet-grip') && $('askGrip').contains($('askTitle')), '1 提示框是底部面板：.sheet-mask > .sheet，拖动条里是标题');
  const btns = $('askOk').parentNode;
  ok(btns.classList.contains('ui-stack') && btns.firstElementChild === $('askOk') && btns.lastElementChild === $('askCancel'), '1 按钮竖排：确认在上、取消在最下面');
  let got = null;
  w.customConfirm('删掉以后找不回来。', () => { got = 'ok'; }, '删除', { danger: true, okText: '删除这条记录' });
  ok(m.style.display === 'flex' && m.classList.contains('open') && $('askOk').classList.contains('warn') && $('askOk').textContent === '删除这条记录', '1 危险操作：警示色、按钮写清楚做什么');
  await t.back();
  ok(m.style.display === 'none' && !m.classList.contains('open') && got === null, '1 返回键 = 取消：关掉、不执行');
  w.customConfirm('再记一笔？', () => { got = 'ok2'; }, '记好了', { okText: '再记一笔' });
  ok($('askOk').classList.contains('primary') && !$('askOk').classList.contains('warn'), '1 不危险的：主色（上一个的警示色不会留下来）');
  $('askOk').click(); await t.idle();
  ok(got === 'ok2' && m.style.display === 'none', '1 点确认：执行、关掉');
  w.customAlert('第一段。\n\n第二段。', '提示');
  ok(t.w.getComputedStyle($('askMsg')).textAlign === 'left' && $('askCancel').style.display === 'none' && $('askOk').classList.contains('primary'), '1 提示：文字左对齐、只有一个按钮');
  $('askOk').click(); await t.idle();
  w.customPrompt('起个名字', 'x', () => {}, '改名');
  ok($('askInput').style.display === 'block' && $('askOk').classList.contains('primary'), '1 输入框也在面板里');
  $('askCancel').click(); await t.idle();
  ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  // ===== 2. 记账和账单（1017-T）=====
  w.openEdit('m1'); $('deleteInEdit').click();
  ok(/^2026-10-06 09:30 · 购物 · 36\.00 · 买书\n\n删掉的找不回来/.test($('askMsg').textContent) && $('askOk').textContent === '删除这条记录' && $('askOk').classList.contains('warn') && $('askCancel').textContent === '取消', '2 删除记录：写是哪一笔、「删除这条记录」警示色：' + $('askMsg').textContent);
  ok(!/吗？/.test($('askMsg').textContent), '2 不再有孤零零的「确定吗？」');
  await t.back();
  ok(t.recs().length === 1 && $('editMask').style.display === 'flex', '2 返回键只关确认框：记录还在、修改弹窗还开着');
  $('cancelEdit').click();
  // ===== 3. 设置和存档（1017-U）=====
  w.deleteCat('购物');
  ok(/^删除分类「购物」。\n\n有 1 条记录用着这个分类，删了以后这些记录会变成「未分类」，金额和备注都不动。$/.test($('askMsg').textContent) && $('askOk').textContent === '删除分类「购物」' && $('askOk').classList.contains('warn'), '3 删除分类：写几条会变未分类、按钮写分类名、警示色');
  $('askCancel').click(); await t.idle();
  { const st = w.loadStore(A.ID); st.archives['另一个'] = { cats: ['未分类'], records: [] }; w.saveStore(st, A.ID); await t.idle(); }
  $('delArchive').click();
  ok(/^删除存档「默认存档」：里面的 1 条记录、分类、预算、模板，还有导入记录、单号表、待处理、导入前的备份都会一起删掉，找不回来。/.test($('askMsg').textContent) && $('askOk').textContent === '删除这个存档' && $('askOk').classList.contains('warn'), '3 删除存档：写清会删掉什么、「删除这个存档」警示色');
  $('askCancel').click(); await t.idle();
  ok(Object.keys(w.loadStore(A.ID).archives).length === 2 && t.recs().length === 1, '3 点取消：什么都没删');
  // ===== 4. 导入相关（1017-V）：撤销、全部不要了、退出、AI 修改的确认按钮写清楚、警示色（各自的测试里点过：z5、z7、zV、zZw）=====
  const ui = fs.readFileSync(path.join(WWW, 'import', 'ui.js'), 'utf8');
  ok(/okText: okText, danger: true/.test(ui) && /'撤销这次导入'/.test(ui) && /'撤销这次 AI 修改'/.test(ui), '4 撤销：「撤销这次导入 / 撤销这次 AI 修改 / 连着撤销这 N 次」警示色');
  ok(/笔都不要了', danger: true/.test(ui) && /'退出，不导入了', 'ui-btn warn block'/.test(ui) && /按 AI 的建议改这 ' \+ nRec \+ ' 条记录', 'ui-btn warn block'/.test(ui), '4 全部不要了、退出导入、AI 批量改：按钮写清楚、警示色');
  ok(!/确定吗？|确定撤销吗？/.test(ui), '4 导入页里不再有「确定吗？」');
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
