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
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
