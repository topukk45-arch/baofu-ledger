// 1019-O 弹系统输入法时面板不抖：文字输入弹一个只有输入框的小面板，下面几层不跟着键盘动（jsdom，记录全是虚构的）。node zZzL-text-panel.test.js [index.html]
// 备注、分类名、模板名、日子名、筛选关键词点了弹小面板（标题、输入框、确定 / 取消），等小面板滑上来再聚焦；
// 键盘一动先把开着的层全冻住，停下来只放开最上面那层（只动一次），下面几层一直不动；返回键先关小面板、再回原面板。
// 真浏览器里量的位置变化次数见提交说明（tests 外的量法：CPU 调慢 4 倍、视口分 1 / 10 帧缩到 650）。
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
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs), before(w) { const vv = new w.EventTarget(); vv.height = 970; w.visualViewport = vv; } });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const vvTo = h => { w.visualViewport.height = h; w.visualViewport.dispatchEvent(new w.Event('resize')); };
  const held = () => [...d.querySelectorAll('.mask.kb-hold')].map(m => m.id).sort().join();
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 1. 备注不直接弹系统键盘：点了弹小面板
  $('fabAdd').click(); await t.idle(); await wait(300); w.kpClose();   // 1019-P 起记一笔打开会自动弹数字键盘，先收起来
  const r = $('billRemark');
  ok(r.readOnly && r.getAttribute('inputmode') === 'none', '1 备注框不直接弹键盘（readonly、inputmode=none）');
  r.value = '原来的';
  r.click();
  ok(shown('txtMask') && shown('addMask') && $('txtTitle').textContent === '备注' && $('txtArea').style.display !== 'none' && $('txtArea').value === '原来的', '1 点备注：弹「备注」小面板（多行），带着原来的字，记一笔还在下面');
  ok(d.activeElement !== $('txtArea'), '1 小面板还在滑上来：先不聚焦');
  await wait(300);
  ok(d.activeElement === $('txtArea'), '1 滑上来以后才聚焦输入框（两个动画不同时跑）');

  // 2. 键盘弹起：先全冻住，停下来只放开最上面的小面板，记一笔一直冻着
  vvTo(650);
  ok(held() === 'addMask,txtMask', '2 键盘一动：开着的两层都冻住（不跟着缩）');
  vvTo(640); vvTo(630);
  await wait(60);
  ok(held() === 'addMask,txtMask', '2 键盘还在动：还冻着');
  await wait(120);
  ok(held() === 'addMask', '2 停下来：只放开最上面的小面板（它只动这一次），记一笔一直冻着不动');
  ok($('addMask').style.getPropertyValue('--hold-h') === '970px', '2 记一笔冻在键盘动之前的高度');

  // 3. 确定：字写回备注，小面板关，回到记一笔
  $('txtArea').value = '虚构的新备注';
  $('txtOk').click(); await Promise.resolve();
  ok(!shown('txtMask') && shown('addMask') && r.value === '虚构的新备注', '3 确定：字写回备注，回到记一笔');
  vvTo(970); await wait(160);
  ok(held() === '', '3 键盘收起、停下来：全部放开');
  // 取消：什么都不改
  r.click(); await wait(300);
  $('txtArea').value = '不要这个';
  $('txtCancel').click();
  ok(r.value === '虚构的新备注' && !shown('txtMask'), '3 取消：备注不变');

  // 4. 返回键：先关小面板（改过的先问），再回原面板
  r.click(); await wait(300);
  await t.back();
  ok(!shown('txtMask') && shown('addMask'), '4 没改：返回键只关小面板，回到记一笔');
  r.click(); await wait(300);
  $('txtArea').value = '改了一半';
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？' && shown('txtMask'), '4 改了一半按返回：先问放弃');
  await t.askOk();
  ok(!shown('txtMask') && shown('addMask') && r.value === '虚构的新备注', '4 放弃：关小面板、备注不变、记一笔还在');
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '4 再按返回：才轮到记一笔（填过东西，先问）');
  await t.askOk();
  ok(!shown('addMask'), '4 记一笔关掉');

  // 5. 单行的：日子名、新分类名、模板名、筛选关键词；回车 = 确定
  $('daysAdd').click(); await t.idle();
  $('dayName').click(); await wait(300);
  ok(shown('txtMask') && $('txtInput').style.display !== 'none' && /日子名称/.test($('txtTitle').textContent) && d.activeElement === $('txtInput'), '5 日子名：单行小面板、聚焦');
  $('txtInput').value = '虚构纪念日';
  $('txtInput').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(!shown('txtMask') && $('dayName').value === '虚构纪念日', '5 回车 = 确定，写回日子名');
  $('dayCancel').click(); if (t.ask()) await t.askOk();
  for (const id of ['newCatName', 'tplEditName', 'tplEditRemark', 'searchKeyword', 'editRemark', 'refundRemark']) {
    const el = $(id); ok(el && el.readOnly && el.classList.contains('txt-field'), `5 ${id} 也是点了弹小面板`);
  }
  // 6. 别的弹窗打开动画走完再聚焦：提示框里的输入框
  w.customPrompt('', '', () => {}, '虚构输入');
  ok(d.activeElement !== $('askInput'), '6 输入提示框：刚打开还没聚焦');
  await wait(300);
  ok(d.activeElement === $('askInput'), '6 滑上来以后才聚焦');
  await t.askCancel();

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
