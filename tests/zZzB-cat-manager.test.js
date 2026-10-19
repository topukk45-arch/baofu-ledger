// 1019-C 管理账单分类：行里不再塞三个小按钮，整行点开操作面板（jsdom，分类和记录全是虚构的）。node zZzB-cat-manager.test.js [index.html]
// 一行 = 拖动手柄 + 分类名（16px）+「每月预算 1350」（14px）+ ›；点行（不是手柄）弹面板：标题是分类名，
// 「设预算 / 改名 / 删除这个分类（警示色）」竖排，「取消」在最下面；删除前写清几条记录用着、删了变成什么。
// 1.3 倍字号下分类名完整、不贴边由 tests/ui/audit.js 的「分类管理按 1.3 倍字号」那段在真浏览器里量。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [1, 2, 3].map(i => ({ id: 'r' + i, time: `2026-12-0${i}T12:00`, money: 10 * i, type: 'expense', cat: '购物', remark: '虚构' + i }));
const CATS = ['未分类', '购物', '红包', '吃饭'];

(async () => {
  const seed = A.seedOf(recs, CATS);
  const st = JSON.parse(seed['store_' + A.ID]); st.archives['默认存档'].budgets = { '购物': 1350 };
  st.archives['默认存档'].tpls = [{ id: 'tp1', name: '虚构模板', cat: '购物', type: 'expense', money: 5 }];
  seed['store_' + A.ID] = JSON.stringify(st);
  const t = await A.boot({ html, www: WWW, seed });
  const { $, w, d } = t;
  const row = c => [...$('catList').querySelectorAll('.cat-item')].find(r => r.dataset.cat === c);
  const sheetOpen = () => w.JiwenSheet.isOpen();
  const arc = () => w.loadStore(A.ID).archives['默认存档'];
  $('manageCatSetting').click(); await t.idle();

  // 1. 行的结构：没有按钮；手柄、分类名、每月预算、›
  const r = row('购物');
  ok(r && r.querySelectorAll('button').length === 0, '1 行里没有按钮了');
  ok(r.querySelector('.drag-handle') && r.querySelector('.cat-name').textContent === '购物' && r.querySelector('.cat-budget').textContent === '每月预算 1350' && r.querySelector('.cat-more').textContent === '›', '1 手柄 + 分类名 + 「每月预算 1350」 + ›');
  ok(!row('红包').querySelector('.cat-budget'), '1 没设预算的不写预算');
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/#catList \.cat-item \.cat-name \{[^}]*font-size:16px/.test(css) && /#catList \.cat-item \.cat-budget \{[^}]*font-size:14px/.test(css), '1 分类名 16px、预算 14px');
  ok(/#catList \.cat-item \.cat-name \{[^}]*flex:0 0 auto/.test(css) && /#catList \.cat-item \.cat-budget \{[^}]*flex:0 1 auto[^}]*text-overflow:ellipsis/.test(css), '1 地方不够先省略预算，分类名最后');
  ok(/#catMask \.cat-reorder-tip \{[^}]*font-size:13px/.test(css), '1 顶上那句说明 13px');
  ok(/#catMask \.cat-add-row \{[^}]*border-top/.test(css), '1 列表和新增输入框之间有分隔线');

  // 2. 点手柄不弹；点行弹面板
  r.querySelector('.drag-handle').click();
  ok(!sheetOpen(), '2 点拖动手柄不弹面板');
  r.querySelector('.cat-name').click();
  ok(sheetOpen() && $('uiSheetTitle').textContent === '购物', '2 点行：弹面板，标题是分类名');
  ok(/每月预算 1350/.test($('uiSheetSub').textContent) && /3 条记录/.test($('uiSheetSub').textContent), '2 面板里写预算和几条记录：' + $('uiSheetSub').textContent);
  const ids = [...$('catActList').querySelectorAll('button')].map(b => b.id + ':' + b.textContent);
  ok(ids.join() === 'catActBudget:改预算,catActRename:改名,catActDelete:删除这个分类', '2 面板按钮：改预算 / 改名 / 删除这个分类 ' + ids);
  ok($('catActDelete').classList.contains('warn'), '2 删除这个分类是警示色');
  ok($('uiSheetFoot').textContent.trim() === '取消', '2 「取消」在最下面');
  $('catActCancel').click();
  ok(!sheetOpen() && arc().cats.includes('购物'), '2 点取消：什么都不改');

  // 3. 设预算 → 弹预算输入
  row('红包').click();
  ok($('catActBudget').textContent === '设预算', '3 没预算的写「设预算」');
  $('catActBudget').click();
  ok(!sheetOpen() && t.ask() && t.ask().title === '分类预算', '3 设预算：关面板、弹预算输入');
  $('askInput').value = '200'; await t.askOk();
  ok(arc().budgets['红包'] === 200 && row('红包').querySelector('.cat-budget').textContent === '每月预算 200', '3 存好、行里写「每月预算 200」');

  // 4. 改名
  row('吃饭').click(); $('catActRename').click();
  $('askInput').value = '餐饮'; await t.askOk();
  ok(arc().cats.includes('餐饮') && !arc().cats.includes('吃饭'), '4 改名');

  // 5. 删除：写清有几条记录用着、删了变成什么、模板和预算也说
  row('购物').click(); $('catActDelete').click();
  const a5 = t.ask();
  ok(a5 && /有 3 条记录用着这个分类，删了以后这些记录会变成「未分类」/.test(a5.msg) && /1 个常用模板/.test(a5.msg) && /预算会一起删掉/.test(a5.msg), '5 删除前写清：' + (a5 && a5.msg));
  ok($('askOk').textContent === '删除分类「购物」' && $('askOk').classList.contains('warn'), '5 确认按钮写明删哪个、警示色');
  await t.askCancel();
  ok(arc().cats.includes('购物'), '5 取消不删');
  row('餐饮').click(); $('catActDelete').click();
  ok(/没有记录用着这个分类/.test(t.ask().msg), '5 没记录的写「没有记录用着」');
  await t.askOk();
  ok(!arc().cats.includes('餐饮'), '5 删掉');

  // 6. 未分类：没有删除按钮，写明是保留分类
  row('未分类').click();
  ok(!$('catActDelete') && /保留分类/.test($('catActList').textContent), '6 未分类：不能删、写明');
  await t.back();
  ok(!sheetOpen() && $('catMask').style.display === 'flex', '6 返回键先关面板，分类管理还在');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
