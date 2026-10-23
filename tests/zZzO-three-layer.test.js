// 1019-S 列表 → 面板 → 输入框三层：输入框不管怎么关都回到那个面板，再按返回才回列表（jsdom，记录全是虚构的）。node zZzO-three-layer.test.js [index.html]
// 管理账单分类：点一个分类开面板 → 设预算 / 改名：存好、取消、返回键、往下拉都回这个分类的面板（改了名是新名字的面板）；删除的确认框取消也回面板，删掉了回列表。
// 同一规矩用到别处：AI 标记列表 → 账单详情，关掉详情回列表；批量操作 → 选分类 → 确认，确认框取消回选分类，改口径的取消回批量操作。
// 常用模板、日子、存档这几处查过：输入框 / 确认框本来就盖在原面板上面，关了就是原面板，不用改。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const recs = [
  { id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭', aiFlag: { k: 'dup', why: '虚构理由甲', ref: 'r2' } },
  { id: 'r2', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' },
  { id: 'r3', time: '2026-12-02T09:00', money: 6, type: 'expense', cat: '其他', remark: '虚构早饭', aiFlag: { k: 'miss', why: '虚构理由乙' } },
];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t, shown = id => $(id) && $(id).style.display === 'flex';
  const touch = (el, type, x, y) => { const ev = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] }); el.dispatchEvent(ev); };
  const swipe = el => { touch(el, 'touchstart', 200, 300); for (let i = 1; i <= 25; i++) touch(el, 'touchmove', 200, 300 + i * 12); touch(el, 'touchend', 200, 600); };
  const panel = () => w.JiwenSheet.isOpen() && $('catActList') ? $('uiSheetTitle').textContent : null;
  const openCat = c => [...$('catList').querySelectorAll('.cat-item')].find(r => r.dataset.cat === c).click();
  const arc = () => w.JiwenStore.loadStore(A.ID).archives['默认存档'];
  const settle = async () => { await t.idle(); await wait(30); };
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('manageCatSetting').click(); await t.idle();

  // 1. 设预算：存好 → 回「吃饭」的面板（副标题写上预算）；再按返回 → 回列表
  openCat('吃饭');
  ok(panel() === '吃饭', '1 点「吃饭」：开这个分类的面板');
  $('catActBudget').click(); await wait(420);
  ok(shown('askMask') && !w.JiwenSheet.isOpen(), '1 设预算：输入框（面板先收起）');
  ['3', '0', '0'].forEach(k => [...$('kpGrid').querySelectorAll('.kp-key')].find(b => b.dataset.k === k).click());
  $('kpOk').click(); await settle();
  ok(arc().budgets['吃饭'] === 300 && !shown('askMask') && panel() === '吃饭' && /每月预算 300/.test($('uiSheetSub').textContent) && $('catActBudget').textContent === '改预算', '1 存好：回到「吃饭」的面板，写着每月预算 300、按钮变「改预算」');
  await t.back(); await settle();
  ok(!w.JiwenSheet.isOpen() && shown('catMask'), '1 再按返回：回分类列表');

  // 2. 设预算不存：取消按钮、返回键、往下拉都回面板，预算不变
  openCat('吃饭'); $('catActBudget').click(); await wait(420); w.kpClose();
  $('askCancel').click(); await settle();
  ok(panel() === '吃饭' && arc().budgets['吃饭'] === 300, '2 点「取消」：回「吃饭」的面板，预算不变');
  $('catActBudget').click(); await wait(420);
  await t.back(); await settle();
  ok(shown('askMask') && !shown('kpMask'), '2 返回键：先收数字键盘，输入框还在');
  await t.back(); await settle();
  ok(!shown('askMask') && panel() === '吃饭', '2 再按返回：回「吃饭」的面板');
  $('catActBudget').click(); await wait(420); w.kpClose();
  swipe($('askMask').querySelector('.sheet')); await settle();
  ok(!shown('askMask') && panel() === '吃饭', '2 往下拉：回「吃饭」的面板');
  await t.back(); await settle();
  ok(!w.JiwenSheet.isOpen() && shown('catMask'), '2 再按返回：回列表');

  // 3. 改名：存好回新名字的面板；取消 / 没改都回原来的面板
  openCat('其他'); $('catActRename').click(); await wait(420);
  $('askCancel').click(); await settle();
  ok(panel() === '其他', '3 改名点「取消」：回「其他」的面板');
  $('catActRename').click(); await wait(420);
  $('askOk').click(); await settle();
  ok(!shown('askMask') && panel() === '其他', '3 名字没改就点确定：回「其他」的面板');
  $('catActRename').click(); await wait(420);
  $('askInput').value = '小项'; $('askOk').click(); await settle();
  ok(arc().cats.includes('小项') && panel() === '小项' && [...$('catList').querySelectorAll('.cat-item')].some(r => r.dataset.cat === '小项'), '3 改成「小项」：回「小项」的面板，列表也换了名字');
  await t.back(); await settle();
  ok(!w.JiwenSheet.isOpen() && shown('catMask'), '3 再按返回：回列表');

  // 4. 删除：确认框取消回面板；删掉了回列表（不再开面板）
  openCat('小项'); $('catActDelete').click(); await settle();
  ok(t.ask() && /删除分类/.test(t.ask().title), '4 删除先确认');
  await t.askCancel(); await settle();
  ok(panel() === '小项' && arc().cats.includes('小项'), '4 取消：回「小项」的面板，没删');
  $('catActDelete').click(); await settle();
  await t.askOk(); await settle();
  ok(!arc().cats.includes('小项') && !w.JiwenSheet.isOpen() && shown('catMask'), '4 删掉：回列表');
  $('closeCat').click(); await settle();

  // 5. AI 标记列表 → 详情：关掉详情回列表（「关闭」、返回键都是）；去掉标记以后列表跟着少一条
  w.JiwenStats.openAiFlagList('2026-12'); await settle();
  const rows = () => [...d.querySelectorAll('.ai-flag-row')];
  ok(rows().length === 2, '5 AI 标记列表两条');
  rows()[0].click(); await settle();
  ok(shown('detailMask') && !w.JiwenSheet.isOpen(), '5 点一条：开详情');
  $('detailClose').click(); await settle();
  ok(!shown('detailMask') && rows().length === 2, '5 详情点「关闭」：回到 AI 标记列表');
  rows()[1].click(); await settle();
  await t.back(); await settle();
  ok(!shown('detailMask') && rows().length === 2, '5 详情按返回：也回列表');
  rows()[0].click(); await settle();
  $('detailAiClear').click(); await settle();
  if (shown('detailMask')) { $('detailClose').click(); await settle(); }
  ok(rows().length === 1, '5 去掉一条标记再关：列表剩一条');
  await t.back(); await settle();
  ok(!w.JiwenSheet.isOpen(), '5 再按返回：列表关掉');
  // 详情里点「修改」去了修改账单：关掉修改不再回列表
  w.JiwenStats.openAiFlagList('2026-12'); await settle();
  rows()[0].click(); await settle();
  $('detailEdit').click(); await settle();
  $('cancelEdit').click(); await settle();
  ok(!w.JiwenSheet.isOpen() && !shown('detailMask'), '5 从详情去修改再取消：不回列表');

  // 6. 批量操作：确认框取消回上一层
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  const choose = label => [...$('askChoices').querySelectorAll('.cc')].find(b => (b.querySelector('.cc-label') || b).textContent === label).click();
  w.JiwenSearch.openBatchMenu(); await settle();
  choose('改分类'); $('askOk').click(); await settle();
  // 1020-I：选分类用分类抽屉（共用底部面板）
  const drawer = () => w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '改成哪个分类';
  ok(drawer() && !t.ask(), '6 改分类：选分类（分类抽屉）');
  [...$('catDrawerAll').querySelectorAll('.cc')].find(b => b.textContent === '购物').click(); await settle();
  ok(t.ask() && t.ask().title === '批量改分类', '6 选了：确认框');
  await t.askCancel(); await settle();
  ok(drawer(), '6 确认框取消：回到选分类');
  w.JiwenSheet.back(); await settle();
  ok(t.ask() && /^将修改 \d+ 笔$/.test(t.ask().title), '6 选分类取消：回到批量操作（原来就是）');
  choose('标为不计'); $('askOk').click(); await settle();
  ok(t.ask() && t.ask().title === '批量修改统计', '6 标为不计：确认框');
  await t.askCancel(); await settle();
  ok(t.ask() && /^将修改 \d+ 笔$/.test(t.ask().title), '6 确认框取消：回到批量操作');
  await t.askCancel(); await settle();
  ok(!t.ask() && arc().records.every(r => !r.skip && r.cat !== '小项'), '6 一路取消：什么都没改');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
