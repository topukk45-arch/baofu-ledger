// 1020-G 记一笔 / 修改照草图「方案 D」（jsdom，记录全是虚构的）。node zZzZd-rec-plan-d.test.js [index.html]
// 分类一行 4 个「最近常用」（最近 60 天用得最多的，按收支分开算，不够的用分类管理里排在前面的补齐）；别的在「更多」那一行拉出来的分类抽屉里；
// 统计、备注是列表卡里一行，点了弹统计面板 / 文字小面板；文字小面板「取消 | 确定」并排；修改账单同一套。样子在 ui/audit.js 里量。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

// 今天是 2026-12-20（helpers/app.js）。60 天以内：吃饭 5、出行 4、购物 3（其中 1 笔是退款，不算）、零食 2、工资（收入）3、红包（收入）1；
// 60 天以前：日用 9 笔（不算）
const CATS = ['未分类', '吃饭', '购物', '出行', '工资', '红包', '其他', '日用', '水电', '房租', '医疗', '学习', '零食', '宠物'];
const recs = [];
let n = 0;
const add = (time, cat, type, extra) => recs.push(Object.assign({ id: 'x' + (++n), time, money: 10 + n, type, cat, remark: '' }, extra || {}));
for (let i = 0; i < 5; i++) add('2026-12-0' + (i + 1) + 'T12:00', '吃饭', 'expense');
for (let i = 0; i < 4; i++) add('2026-12-1' + i + 'T08:00', '出行', 'expense');
add('2026-11-20T10:00', '购物', 'expense'); add('2026-11-21T10:00', '购物', 'expense');
add('2026-11-22T10:00', '购物', 'income', { refundOf: 'x10' });
add('2026-12-18T10:00', '零食', 'expense'); add('2026-12-19T10:00', '零食', 'expense');
for (let i = 0; i < 3; i++) add('2026-11-1' + i + 'T09:00', '工资', 'income');
add('2026-12-01T09:00', '红包', 'income');
for (let i = 0; i < 9; i++) add('2026-09-0' + (i + 1) + 'T09:00', '日用', 'expense');
add('2026-12-02T09:00', '房租', 'expense', { remark: '虚构房租' });

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs, CATS) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const chips = id => [...$(id).querySelectorAll('.cc')].map(c => c.textContent).join();
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 1. 最近常用怎么算
  const RC = w.JiwenStore.recentCats;
  ok(RC('expense').join() === '吃饭,出行,零食,购物', '1 支出：吃饭 5、出行 4，零食 2 和购物 2 一样多的、最近用过的在前（退款、60 天以前的不算）：' + RC('expense').join());
  ok(RC('income').join() === '工资,红包,未分类,吃饭', '1 收入：工资、红包，不够的用分类管理里排在前面的补齐：' + RC('income').join());
  ok(RC('').join() === '吃饭,出行,工资,零食', '1 还没选收支：不分收支算：' + RC('').join());

  // 2. 记一笔：一行 4 个最近常用；选了收支按那一种重算，选好的分类留着
  $('fabAdd').click(); await wait(420); w.kpClose();
  ok(chips('billCatChips') === '吃饭,出行,工资,零食' && $('billCatChips').classList.contains('rec-cats'), '2 打开时：不分收支的 4 个');
  [...$('billCatChips').children].find(c => c.textContent === '出行').click();
  ok(w.JiwenForms.billCatSel === '出行' && $('billCatChips').querySelector('.cc.sel').textContent === '出行' && $('billCatMoreVal').textContent === '', '2 点 4 个之一：选中，「更多」那一行空着');
  [...$('billTypeChips').children].find(c => c.textContent === '支出').click();
  ok(chips('billCatChips') === '吃饭,出行,零食,购物' && w.JiwenForms.billCatSel === '出行', '2 选了支出：按支出重算，选好的「出行」留着');
  [...$('billCatChips').children].find(c => c.textContent === '零食').click();
  ok(chips('billCatChips') === '吃饭,出行,零食,购物', '2 开着的时候点分类不挪位置');

  // 3. 分类抽屉
  $('billCatMore').click();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '选分类' && $('uiSheetSub').textContent === '支出 · 共 14 个', '3 「更多」拉出分类抽屉：选分类 · 支出 · 共 14 个');
  ok($('catDrawerQ') && [...$('catDrawerRecent').querySelectorAll('.cc')].map(c => c.textContent).join() === '吃饭,出行,零食,购物', '3 有搜索框（分类不少于 12 个），最近常用和记一笔上一样');
  ok([...$('catDrawerAll').querySelectorAll('.cc')].map(c => c.textContent).join() === CATS.join() && $('catDrawerAll').querySelector('.cc.sel').textContent === '零食', '3 全部按分类管理里的顺序，现在选中的高亮');
  ok($('uiSheetFoot').querySelector('.ui-pair') && $('uiSheetCancel').nextElementSibling === $('catDrawerManage'), '3 底部「取消 | 管理分类」并排（左退右进）');
  $('catDrawerQ').value = '水'; $('catDrawerQ').dispatchEvent(new w.Event('input'));
  const vis = [...$('catDrawerAll').querySelectorAll('.cc')].filter(c => c.style.display !== 'none').map(c => c.textContent);
  ok(vis.join() === '水电' && $('catDrawerRecent').style.display === 'none', '3 搜「水」：只剩水电，最近常用藏起来');
  $('catDrawerQ').value = '咖啡'; $('catDrawerQ').dispatchEvent(new w.Event('input'));
  ok(/没有「咖啡」/.test(d.querySelector('.cat-drawer-none').textContent) && d.querySelector('.cat-drawer-none').style.display === '', '3 搜不到：写一句');
  $('uiSheetCancel').click();
  ok(!w.JiwenSheet.isOpen() && w.JiwenForms.billCatSel === '零食' && shown('addMask'), '3 取消：什么都不改，回到记一笔');
  $('billCatMore').click();
  [...$('catDrawerAll').querySelectorAll('.cc')].find(c => c.textContent === '房租').click();
  ok(!w.JiwenSheet.isOpen() && w.JiwenForms.billCatSel === '房租' && !$('billCatChips').querySelector('.cc.sel'), '3 点一个：选好、关掉；4 个里都不亮');
  ok($('billCatMoreVal').textContent === '房租' && $('billCatMoreVal').classList.contains('on') && chips('billCatChips') === '吃饭,出行,零食,购物', '3 「更多」那一行写「房租」（加粗），4 个不挪位置');
  [...$('billCatChips').children].find(c => c.textContent === '吃饭').click();
  ok($('billCatMoreVal').textContent === '', '3 再选回 4 个之一：「更多」那一行空着');
  // 管理分类：打开分类管理，关了回到抽屉
  $('billCatMore').click(); $('catDrawerManage').click();
  ok(shown('catMask') && !w.JiwenSheet.isOpen(), '3 「管理分类」打开分类管理');
  $('closeCat').click(); await wait(20);
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '选分类' && shown('addMask'), '3 关了分类管理回到抽屉');
  w.JiwenSheet.back();

  // 4. 统计那一行：点了弹统计面板，取消不改
  $('billMode').click();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '统计' && d.querySelectorAll('#modePick .mode-pick-row').length === 3 && d.querySelector('#modePick .mode-pick-row.sel .mode-pick-ok'), '4 统计面板：三行，选中的打勾');
  ok([...d.querySelectorAll('#modePick .mode-pick-row span')].map(x => x.textContent).join('|') === [w.JiwenBase.MODE_HINT.normal, w.JiwenBase.MODE_HINT.skip, w.JiwenBase.MODE_HINT.flow].join('|'), '4 每行一句说明');
  $('uiSheetCancel').click();
  ok($('billMode').dataset.mode === 'normal' && $('billModeVal').textContent === '计入', '4 取消：照旧计入');
  $('billMode').click(); d.querySelector('#modePick .mode-pick-row[data-v="skip"]').click();
  ok($('billMode').dataset.mode === 'skip' && $('billModeVal').textContent === '不计', '4 选「不计」：那一行写「不计」');
  // 选了转账这类分类自动跟着变的规则照旧（转账不在分类里时不触发，这里直接调）
  w.JiwenForms.setModeChips($('billMode'), 'normal');

  // 5. 备注那一行：点了弹文字小面板（「取消 | 确定」并排），写好那一行显示；没写空着、没有占位字
  ok($('billRemarkVal').textContent === '' && !$('billRemarkRow').textContent.includes('可不填'), '5 没写备注：右边空着、没有占位字');
  $('billRemarkRow').click();
  ok(shown('txtMask') && $('txtTitle').textContent === '备注', '5 点「备注」：弹文字小面板');
  const pair = $('txtOk').parentElement;
  ok(pair.classList.contains('ui-pair') && pair.firstElementChild === $('txtCancel') && pair.lastElementChild === $('txtOk') && $('txtOk').classList.contains('primary'), '5 「取消 | 确定」左右并排（左退右进）');
  $('txtArea').value = '虚构的午饭\n和同事一起'; $('txtOk').click();
  ok($('billRemark').value === '虚构的午饭\n和同事一起' && $('billRemarkVal').textContent === '虚构的午饭 和同事一起', '5 确定：写回备注，那一行一行显示');

  // 6. 没选分类就保存：弹分类抽屉补上，选好接着保存
  w.JiwenForms.resetBillForm();
  ok($('billRemarkVal').textContent === '' && $('billCatMoreVal').textContent === '', '6 重新开一笔：备注、更多那一行都空着');
  $('billMoney').value = '12.5'; [...$('billTypeChips').children].find(c => c.textContent === '支出').click();
  $('addBill').click();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '选分类', '6 没选分类：弹分类抽屉');
  [...$('catDrawerAll').querySelectorAll('.cc')].find(c => c.textContent === '医疗').click(); await t.idle();
  const saved = w.JiwenStore.loadStore(A.ID).archives['默认存档'].records.find(r => r.money === 12.5);
  ok(saved && saved.cat === '医疗' && !shown('addMask'), '6 选好接着保存');
  if (shown('askMask')) $('askCancel').click();

  // 7. 修改账单同一套：这条的分类不在 4 个里的写在「更多」那一行
  w.openEdit('x' + recs.find(r => r.cat === '房租').id.slice(1)); await t.idle();
  ok(chips('editCatChips') === '吃饭,出行,零食,购物' && $('editCatMoreVal').textContent === '房租' && $('editRemarkVal').textContent === '虚构房租', '7 修改：4 个按这条的收支算，房租写在「更多」那一行，备注那一行写好');
  $('editCatMore').click();
  ok($('uiSheetSub').textContent === '支出 · 共 14 个' && $('catDrawerAll').querySelector('.cc.sel').textContent === '房租', '7 修改里的分类抽屉：现在的房租高亮');
  [...$('catDrawerAll').querySelectorAll('.cc')].find(c => c.textContent === '水电').click();
  ok(w.JiwenForms.editCatSel === '水电' && $('editCatMoreVal').textContent === '水电', '7 选水电');
  const z = id => parseInt(w.getComputedStyle($(id)).zIndex, 10);
  $('editMask').classList.add('over-detail'); $('editMode').click();
  ok(z('uiSheetMask') > z('editMask'), '7 从详情进来的修改（层级更高）上面照样盖得住统计面板：' + z('uiSheetMask') + ' > ' + z('editMask'));
  w.JiwenSheet.back();
  $('cancelEdit').click();

  // 8. 分类少于 12 个时抽屉里没有搜索框
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(recs.slice(0, 3), ['未分类', '吃饭', '购物', '出行', '其他']) });
  t2.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  t2.$('fabAdd').click(); await wait(420); t2.w.kpClose();
  ok(chips.call(null, 'billCatChips') && [...t2.$('billCatChips').children].map(c => c.textContent).join() === '吃饭,未分类,购物,出行', '8 记录少：吃饭之后用分类管理里排在前面的补齐');
  t2.$('billCatMore').click();
  ok(!t2.$('catDrawerQ') && t2.$('uiSheetSub').textContent === '共 5 个', '8 分类少于 12 个：没有搜索框；没选收支不写收支');

  ok(t.errs.length === 0 && t2.errs.length === 0, '没有报错 ' + t.errs.concat(t2.errs).join('；'));
  console.log(`1020-G 记一笔方案 D：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
