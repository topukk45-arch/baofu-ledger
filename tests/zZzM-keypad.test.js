// 1019-P 金额用 App 自己的数字键盘（jsdom，记录全是虚构的）。node zZzM-keypad.test.js [index.html]
// 记一笔 / 修改的金额、模板固定金额、筛选金额区间、要金额的提示框（预算）：点了弹数字键盘，不弹系统输入法；
// 每按一个键金额框实时变；只从末尾输入、退格，最多两位小数、开头不能多个 0、整数最多 8 位；
// 大按钮、键盘外点一下、往下拉、返回键都能关，关了数字照留，再点接着输；设置里能切回系统键盘。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const key = k => [...$('kpGrid').querySelectorAll('.kp-key')].find(b => b.dataset.k === k).click();
  const keys = s => [...s].forEach(c => key(c === '<' ? 'del' : c));
  const touch = (el, type, x, y) => { const ev = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] }); el.dispatchEvent(ev); };
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 1. 记一笔一打开就弹数字键盘，不弹系统输入法
  $('fabAdd').click(); await wait(320); await t.idle();   // 等记一笔滑上来（约 0.22 秒）再弹键盘
  const m = $('billMoney');
  ok(m.readOnly && m.getAttribute('inputmode') === 'none', '1 金额框不弹系统输入法（readonly、inputmode=none）');
  ok(shown('kpMask') && m.classList.contains('kp-on') && $('kpOk').textContent === '确定', '1 打开记一笔：弹数字键盘，对着金额框，大按钮写「确定」');
  ok($('kpVal').textContent === '0.00' && $('kpVal').classList.contains('kp-empty'), '1 没输入时灰色 0.00');
  ok($('kpGrid').querySelectorAll('.kp-key').length === 13 && $('kpOk') && $('kpDel'), '1 键盘：1–9、0、小数点、退格、大按钮');

  // 2. 实时同步 + 输入规则
  let n = 0; m.addEventListener('input', () => n++);
  keys('12.505');
  ok(m.value === '12.50' && $('kpVal').textContent === '12.50' && !$('kpVal').classList.contains('kp-empty'), '2 实时写进金额框，第三位小数不收：' + m.value);
  ok(n === 5, '2 每按一个有效键发一次 input（' + n + '）');
  keys('<<<<<');
  ok(m.value === '' && $('kpVal').textContent === '0.00', '2 退格到空');
  keys('005'); ok(m.value === '5', '2 开头不能多个 0：0 0 5 → 5');
  keys('<.5'); ok(m.value === '0.5', '2 先按小数点 → 0.');
  keys('..'); ok(m.value === '0.5', '2 小数点只能一个');
  keys('<<<'); keys('1234567890'); ok(m.value === '12345678', '2 整数最多 8 位：' + m.value);
  keys('<<<<<<<<'); keys('36.8');

  // 3. 各种关法都留着数字；再打开接着输
  $('kpOk').click(); await Promise.resolve();
  ok(!shown('kpMask') && m.value === '36.8' && shown('addMask'), '3 点「确定」：收起，数字留着，记一笔还在');
  m.click();
  ok(shown('kpMask') && $('kpVal').textContent === '36.8', '3 再点金额框：从现在的金额接着来');
  keys('8'); ok(m.value === '36.88', '3 接着输（不整个替换）');
  // 键盘外面点一下：收起，这一下照常交给页面（没被拦）
  const ev = new w.Event('pointerdown', { bubbles: true, cancelable: true });
  $('billCatChips').dispatchEvent(ev);
  ok(!shown('kpMask') && m.value === '36.88' && !ev.defaultPrevented, '3 键盘外面点一下：收起，数字留着，这一下没被吞掉');
  m.click(); keys('<');
  await t.back();
  ok(!shown('kpMask') && shown('addMask') && m.value === '36.8', '3 返回键：先收数字键盘（数字留着），记一笔还在');
  m.click();
  touch($('kpSheet'), 'touchstart', 200, 700); for (let i = 1; i <= 25; i++) touch($('kpSheet'), 'touchmove', 200, 700 + i * 12); touch($('kpSheet'), 'touchend', 200, 1000);
  ok(!shown('kpMask') && m.value === '36.8', '3 往下拉：收起，数字留着');
  // 整张记一笔不保存就关：照旧问放弃
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '3 记一笔不保存就关：照旧问放弃');
  await t.askOk();

  // 4. 别的金额框：修改、模板固定金额、筛选金额区间
  w.openEdit('r1'); await t.idle();
  $('editMoney').click(); ok(shown('kpMask') && $('kpVal').textContent === '18', '4 修改的金额：数字键盘，带着原来的 18');
  keys('<5'); ok($('editMoney').value === '15', '4 改成 15'); $('kpOk').click(); $('cancelEdit').click(); if (t.ask()) await t.askOk();
  $('filterFab').click(); $('searchMin').click();
  ok(shown('kpMask') && $('searchMin').classList.contains('kp-on'), '4 筛选最低金额：数字键盘');
  keys('10'); $('searchMax').click();
  ok($('searchMin').value === '10' && shown('kpMask') && $('searchMax').classList.contains('kp-on') && !$('searchMin').classList.contains('kp-on'), '4 点最高金额：键盘换过去，最低的 10 留着');
  w.kpClose(); w.closeFilterSheet();
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('manageTplSetting').click(); $('tplNew').click(); await t.idle();
  $('tplEditMoney').click(); ok(shown('kpMask'), '4 模板固定金额：数字键盘'); keys('25'); w.kpClose();
  ok($('tplEditMoney').value === '25', '4 模板金额 25'); $('tplEditCancel').click(); if (t.ask()) await t.askOk(); $('closeTpl').click();

  // 5. 预算（要金额的提示框）：滑上来以后自动弹数字键盘，大按钮写「保存」、直接提交
  $('manageCatSetting').click();
  [...$('catList').querySelectorAll('.cat-item')].find(r => r.dataset.cat === '吃饭').click();
  $('catActBudget').click(); await wait(320);
  ok(shown('askMask') && shown('kpMask') && $('askInput').classList.contains('kp-on') && $('kpOk').textContent === '保存', '5 设预算：自动弹数字键盘，大按钮「保存」');
  keys('300'); ok($('askInput').value === '300', '5 输入框实时变 300');
  $('kpOk').click(); await t.idle();
  ok(!shown('kpMask') && !shown('askMask') && w.loadStore(A.ID).archives['默认存档'].budgets['吃饭'] === 300, '5 点「保存」：预算存好、提示框和键盘都收起');
  $('catActCancel').click();   // 1019-S 起存好回到这个分类的面板，先关掉面板
  $('closeCat').click();

  // 6. 设置里「用系统键盘输入金额」：切回系统输入法
  [...$('sysMoneyKbSeg').children].find(b => b.dataset.v === 'on').click();
  ok(w.localStorage.getItem('app_sys_money_kb') === '1' && !$('billMoney').readOnly && $('billMoney').getAttribute('inputmode') === 'decimal', '6 打开：金额框照旧用系统键盘（inputmode=decimal）');
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); await wait(320);
  ok(!shown('kpMask'), '6 打开记一笔：不弹 App 的数字键盘');
  $('closeAdd').click();
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  [...$('sysMoneyKbSeg').children].find(b => b.dataset.v === 'off').click();
  ok(!w.localStorage.getItem('app_sys_money_kb') && $('billMoney').readOnly, '6 关掉（默认）：回到 App 的数字键盘');

  // 7.（1019-Q）记一笔还没滑上来就盖了一层（比如放弃确认）：不再自动弹数字键盘；面板关了，对着它的数字键盘一起收
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); w.customConfirm('虚构的确认', () => {}, '虚构');
  await wait(320);
  ok(!shown('kpMask') && shown('askMask'), '7 滑上来之前盖了一层：数字键盘不弹到那一层上面');
  await t.askCancel(); $('closeAdd').click(); await wait(10);
  $('fabAdd').click(); await wait(320);
  ok(shown('kpMask'), '7 正常打开：照旧自动弹');
  $('addMask').style.display = 'none'; await wait(10);
  ok(!shown('kpMask') && !$('billMoney').classList.contains('kp-on'), '7 记一笔关了（不管怎么关）：数字键盘一起收起');
  await wait(300);

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
