// 1019-N 所有底部面板关闭都有收起动画（jsdom，记录全是虚构的）。node zZzK-sheet-close.test.js [index.html]
// 不管怎么关（按钮、返回键、往下拉、代码里关），面板当场关掉（状态和以前一样），原地放一个「影子」往下滑走 + 遮罩淡出，约 200 毫秒后移除；
// 影子没有 id、点不动；影子还在时再按返回：影子立刻收完、再收下一层；叠三层连按返回一层层收；系统「减少动画」时只很快地淡出。
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
  const ghosts = () => [...d.querySelectorAll('.sheet-ghost')];
  const touch = (el, type, x, y) => { const ev = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] }); el.dispatchEvent(ev); };
  const swipe = el => { touch(el, 'touchstart', 200, 300); for (let i = 1; i <= 25; i++) touch(el, 'touchmove', 200, 300 + i * 12); touch(el, 'touchend', 200, 600); };
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 1. 点「关闭」：当场关掉，原地一个影子在滑走，约 200 毫秒后没了
  $('fabAdd').click(); await t.idle();
  $('billMoney').value = '12';
  $('closeAdd').click(); await Promise.resolve();
  ok(!shown('addMask'), '1 点关闭：面板当场关掉（状态和以前一样）');
  const g = ghosts()[0];
  ok(ghosts().length === 1 && g.classList.contains('ghost-down') && !g.classList.contains('mask'), '1 原地一个影子往下滑走');
  ok(!g.id && !g.querySelector('[id]') && w.getComputedStyle(g).pointerEvents === 'none', '1 影子没有 id、点不动');
  ok(g.querySelector('input.money-input') && g.querySelector('input.money-input').value === '12', '1 影子照着关之前的样子（填的字还在）');
  await wait(150);
  ok(ghosts().length === 1, '1 150 毫秒还在滑');
  await wait(150);
  ok(ghosts().length === 0, '1 约 200 毫秒后影子移除');
  ok(/关闭面板/.test(w.localStorage.getItem('app_perf_log') || ''), '1 性能记录里记了「关闭面板」');

  // 2. 返回键、往下拉、提示框、共用面板：同一个动画
  $('fabAdd').click(); await t.idle();
  await t.back();
  ok(!shown('addMask') && ghosts().length === 1 && ghosts()[0].classList.contains('ghost-down'), '2 返回键关：同样滑走');
  await wait(320);
  $('fabAdd').click(); await t.idle();
  swipe($('addSheet')); await Promise.resolve();
  ok(!shown('addMask') && ghosts().length === 1 && /px/.test(ghosts()[0].style.getPropertyValue('--gy')) && parseFloat(ghosts()[0].style.getPropertyValue('--gy')) > 100, '2 往下拉关：影子从手指拉到的地方接着滑 ' + ghosts()[0].style.getPropertyValue('--gy'));
  await wait(320);
  w.customAlert('虚构的提示', '提示'); await t.idle();
  await t.askOk();
  ok(ghosts().length === 1, '2 提示框点确定：同样滑走');
  await wait(320);
  w.JiwenSheet.pick({ title: '虚构选项', options: [{ value: 'a', label: '甲' }], value: 'a', onPick() {} });
  d.getElementById('uiSheetCancel').click(); await Promise.resolve();
  ok(ghosts().length === 1, '2 共用底部面板点取消：同样滑走');
  await wait(320);

  // 3. 影子还在时再按返回：影子立刻收完，再收下一层（不会一下跳掉好几层）
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('manageTplSetting').click(); await t.idle();
  $('tplNew').click(); await t.idle();
  $('tplEditCancel').click(); await Promise.resolve();
  ok(!shown('tplEditMask') && shown('tplMask') && ghosts().length === 1, '3 关掉模板面板：影子在滑，模板列表还开着');
  t.backFn(); await Promise.resolve(); await Promise.resolve();
  ok(!shown('tplMask') && ghosts().length === 1, '3 马上按返回：模板面板的影子立刻收完，模板列表关掉（又一个影子）');
  await wait(320);
  ok(ghosts().length === 0 && !shown('tplMask'), '3 只收了一层，没有卡住');

  // 4. 叠三层（分类管理 → 操作面板 → 输入框），连按返回一层层收
  await wait(200);
  $('manageCatSetting').click(); await t.idle();
  [...$('catList').querySelectorAll('.cat-item')].find(r => r.dataset.cat === '吃饭').click();
  $('catActBudget').click(); await t.idle();
  ok(shown('askMask') && shown('catMask'), '4 叠了三层');
  await t.back();
  ok(!shown('askMask') && shown('catMask'), '4 第一次返回：只收输入框');
  await t.back();
  const third = shown('catMask');
  await t.back();
  ok(third === true || !shown('catMask'), '4 连按返回一层层收，最后分类管理也关掉');
  ok(!shown('catMask'), '4 三次返回以后都收完了');
  await wait(320);
  ok(ghosts().length === 0, '4 影子都移除了');

  // 5. 系统「减少动画」：只很快地淡出
  w.matchMedia = q => ({ matches: /reduce/.test(q), addListener() {}, removeListener() {} });
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); await t.idle(); $('closeAdd').click(); await Promise.resolve();
  ok(ghosts().length === 1 && ghosts()[0].classList.contains('ghost-fade'), '5 减少动画：改成淡出');
  await wait(170);
  ok(ghosts().length === 0, '5 很快就没了（不到 200 毫秒）');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
