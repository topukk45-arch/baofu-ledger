// 1030-RV1：待确认分类的操作流程 + 分类抽屉一键新建。
//   1 成组确认在面板里原地更新（面板不关不重开、滚动位置不变，确认完的一组拿掉、副标题跟着减、底部小条能撤销，全部确认完才关）
//   2 展开后的每一笔用账单页那一套（−/+、颜色、时间、来源）  3 分组按「分类 + 收支」
//   4 未分类组：没有「这组都没问题」，展开按对方一行，点一行选分类、整行改（aiApply，能撤销），问以后这个对方都这样吗
//   5 点一笔开详情、关了回到面板同一位置；勾选只在左边的勾选框上
//   6 分类抽屉「＋ 新建」（搜不到时 / 没搜索框时；重复名直接选已有的；待确认里新分类走 aiApply 的 newCats，撤销时没人用就删）
//   jsdom，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

const CPS = ['某虚构超市', '某虚构*甲', '某虚构乙店', '某虚构面馆'];
let n = 0;
const R = (o) => Object.assign({ id: 'r' + (++n), time: `2026-10-${String(1 + (n % 20)).padStart(2, '0')}T12:${String(n % 60).padStart(2, '0')}`, money: String(10 + n), type: 'expense', cat: '未分类', remark: '', rv: 1, src: { app: 'wechat' }, batch: 'bmh00001' }, o);
const RECS = [
  R({ cat: '购物', cp: 0 }), R({ cat: '购物', cp: 0 }), R({ cat: '购物', cp: 0 }),
  R({ cp: 1, oc: '转账' }), R({ cp: 1, oc: '转账' }), R({ cp: 1, oc: '转账' }),
  R({ cp: 2, remark: '某虚构商品' }), R({ cp: 2, remark: '某虚构商品' }),
  R({ cp: 1, oc: '转账', type: 'income' }), R({ cp: 1, oc: '转账', type: 'income' }),
  R({ cat: '吃饭', cp: 3 }), R({ cat: '吃饭', cp: 3 }),
  R({ cat: '吃饭', rv: undefined, cp: 3 }),   // 不是待确认的
];
const sheetOpen = t => t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, null, { cps: CPS }), now: '2026-10-25T10:00:00' });
  const $ = id => t.d.getElementById(id);
  const rec = id => t.recs().find(r => r.id === id);
  const rvs = () => t.recs().filter(r => r.rv === 1);
  const groups = () => [...t.d.querySelectorAll('#rvgList .rvg')];
  const groupOf = re => groups().find(g => re.test(g.querySelector('.rvg-t').textContent));
  const openGroups = async () => {
    t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
    $('rvChip').click(); await tick();
    $('rvGroupBtn').click(); await tick();
  };
  ok(rvs().length === 12, '0 种了 12 笔待确认分类');
  await openGroups();
  ok(sheetOpen(t) && groups().length >= 3, '0 打开成组确认');

  // ===== 1. 原地更新 =====
  const body0 = $('uiSheetBody'), sheet = $('uiSheet');
  sheet.scrollTop = 37;
  const buy = groupOf(/^购物/);
  buy.querySelector('[data-act="open"]').click(); await tick();
  ok($('uiSheetBody') === body0 && sheet.scrollTop === 37, '1 展开：面板没重开（内容区还是原来那个），滚动位置不变');
  ok(groupOf(/^购物/).querySelectorAll('.rvg-list .rvg-item').length === 3, '1 展开后看得见这组的 3 笔');
  const sub0 = $('uiSheetSub').textContent;
  ok(/共 12 条/.test(sub0), '1 副标题「共 12 条」：' + sub0);
  groupOf(/^购物/).querySelector('[data-act="ok"]').click(); await t.idle();
  ok($('uiSheetBody') === body0 && sheet.scrollTop === 37 && sheetOpen(t), '1 「这组都没问题」：面板不关、不重开、滚动位置不变');
  ok(!groupOf(/^购物/) && /共 9 条/.test($('uiSheetSub').textContent), '1 确认完的一组拿掉，副标题「共 9 条」');
  ok(/已确认 购物 · 支出 3 笔/.test($('uiSnack').textContent) && $('uiSnack').classList.contains('over') && $('rvgUndo'), '1 底部小条「已确认 购物 3 笔 · 撤销」，浮在面板上');
  ok(rvs().length === 9, '1 这 3 笔去掉了待确认');
  $('rvgUndo').click(); await t.idle();
  ok(rvs().length === 12 && groupOf(/^购物/) && /共 12 条/.test($('uiSheetSub').textContent) && $('uiSheetBody') === body0, '1 撤销：标记回来，那一组回到面板里（面板没重开）');

  // ===== 2. 展开后的每一笔用账单页那一套 =====
  groupOf(/^购物/).querySelector('[data-act="open"]').click(); await tick();
  const it = groupOf(/^购物/).querySelector('.rvg-item');
  ok(it && it.querySelector('.rvg-cb input[type=checkbox]') && it.querySelector('.bl-row[data-id]'), '2 每一笔：左边勾选框 + 账单页那一行（.bl-row）');
  const amt = it && it.querySelector('.bl-amt');
  ok(amt && amt.classList.contains('out') && /^−\d+\.\d\d$/.test(amt.textContent), '2 支出带 −、正文色（.bl-amt.out）：' + (amt && amt.textContent));
  ok(it && /10月\d+日 \d\d:\d\d/.test(it.querySelector('.bl-time').textContent) && /微信/.test(it.querySelector('.bl-sub').textContent), '2 带日期时间和来源：' + (it && it.querySelector('.bl-sub').textContent));

  // ===== 3. 分组按「分类 + 收支」 =====
  const uOut = groupOf(/^未分类 · 支出/), uIn = groupOf(/^未分类 · 收入/);
  ok(uOut && uIn && /未分类 · 支出 · 5 笔/.test(uOut.querySelector('.rvg-t').textContent) && /未分类 · 收入 · 2 笔/.test(uIn.querySelector('.rvg-t').textContent), '3 未分类按收支分成两组：支出 5 笔、收入 2 笔');
  ok(groupOf(/^购物 · 支出 · 3 笔/) && groupOf(/^吃饭 · 支出 · 2 笔/), '3 有推荐分类的组也写收支');

  // ===== 5. 点一笔 = 看详情；勾选只在勾选框上 =====
  const buyG = () => groupOf(/^购物/);
  let row0 = buyG().querySelector('.rvg-item .bl-row'), id0 = row0.dataset.id;
  sheet.scrollTop = 61;
  row0.querySelector('.bl-amt').click(); await tick();
  ok($('detailMask').style.display === 'flex' && rec(id0).rv === 1, '5 点一笔：打开这笔的详情（没有悄悄勾掉）');
  ok(sheetOpen(t) && $('uiSheetBody') === body0, '5 面板还在下面，没关');
  t.w.JiwenDetail.closeDetail(); await tick();
  ok(sheetOpen(t) && $('uiSheetBody') === body0 && sheet.scrollTop === 61 && buyG().querySelector('.rvg-item'), '5 关掉详情：回到面板同一位置，那一组还展开着');
  // 详情里改分类（分类抽屉换掉了面板）：关了详情，面板照原来滚到的位置回来、不再滑上来一次
  buyG().querySelector('.rvg-item .bl-row').click(); await tick();
  $('detailRvEdit').click(); await tick();
  [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '杂项').click(); await t.idle();
  if (t.ask()) await t.askCancel();
  await tick();
  ok(rec(id0).cat === '杂项' && !rec(id0).rv, '5 详情里改成「杂项」：分类改了、标记去掉');
  // ui-instant 只留两帧（按设计拿掉），机器慢时 40 毫秒后已经没了：在面板重新打开那一刻记下来
  let reopenCls = null;
  const mo = new t.w.MutationObserver(() => { const m = $('uiSheetMask'); if (reopenCls === null && m.classList.contains('open')) reopenCls = m.className; });
  mo.observe($('uiSheetMask'), { attributes: true, attributeFilter: ['class'] });
  t.w.JiwenDetail.closeDetail(); await tick();
  mo.disconnect();
  ok(sheetOpen(t) && $('uiSheet').scrollTop === 61 && /\bui-instant\b/.test(reopenCls || '') && buyG() && /购物 · 支出 · 2 笔/.test(buyG().textContent), '5 关了详情：面板回来（不滑上来、原来的位置），购物剩 2 笔');
  await tick(80);
  // 勾选框：勾掉一笔，按钮写「勾上的 N 笔没问题」
  const cb = buyG().querySelector('.rvg-cb input');
  cb.click(); await tick();
  ok(/勾上的 1 笔没问题/.test(buyG().querySelector('.rvg-ok').textContent), '5 勾掉一笔：「勾上的 1 笔没问题」');
  cb.click && buyG().querySelector('.rvg-cb input').click(); await tick();
  ok(/这组都没问题/.test(buyG().querySelector('.rvg-ok').textContent), '5 再勾上：「这组都没问题」');

  // ===== 4. 未分类组：按对方一行改分类 =====
  const unc = () => groupOf(/^未分类 · 支出/);
  ok(!unc().querySelector('.rvg-ok') && /交给 AI 按组整理/.test(unc().querySelector('[data-act="ai"]').textContent), '4 未分类组：没有「这组都没问题」，主按钮「交给 AI 按组整理 ›」');
  ok(groupOf(/^购物/).querySelector('.rvg-ok'), '4 有推荐分类的组照旧「这组都没问题」');
  unc().querySelector('[data-act="open"]').click(); await tick();
  await A.until(() => unc().querySelectorAll('.rvg-cp').length, 8000);
  const cpRows = () => [...unc().querySelectorAll('.rvg-cp')];
  ok(cpRows().length === 2 && /某虚构\*甲/.test(cpRows()[0].textContent) && /3 笔 · 共 \d+\.\d\d 元/.test(cpRows()[0].textContent) && /某虚构乙店/.test(cpRows()[1].textContent) && /2 笔/.test(cpRows()[1].textContent),
    '4 展开后按对方一行、按笔数从多到少：' + cpRows().map(x => x.textContent).join(' / '));
  const jiaIds = t.recs().filter(r => r.cp === 1 && r.type === 'expense').map(r => r.id);
  cpRows()[0].click(); await tick();
  ok(sheetOpen(t) && $('uiPickList') && /某虚构\*甲/.test($('uiSheetSub').textContent) && /支出/.test($('uiSheetSub').textContent), '4 点一行：分类抽屉，副标题写这个对方、按这组的收支：' + $('uiSheetSub').textContent);
  [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '转账').click();
  await A.until(() => jiaIds.every(id => rec(id).cat === '转账') && $('uiSnack') && /已改成/.test($('uiSnack').textContent), 5000); await tick(80);
  ok(jiaIds.every(id => rec(id).cat === '转账' && !rec(id).rv), '4 这一行 3 笔都改成「转账」、去掉待确认');
  ok(!t.ask(), '4 实测 10-30：对方带 * / 转账（和个人之间的）：不问「以后也这么记」，只改这几笔');
  const lg = (await t.logs()).slice(-1)[0];
  ok(lg && lg.kind === 'ai' && lg.of === '*' && lg.by === 'rvgroup' && lg.chg.length === 3, '4 走 aiApply：导入记录里一条「成组确认」（kind ai、by rvgroup）');
  ok(!((t.arch().importRules || {}).cat || []).some(r => r.kw === '某虚构*甲'), '4 「只改这几笔」：不存规则');
  ok(sheetOpen(t) && unc() && /未分类 · 支出 · 2 笔/.test(unc().textContent) && /已改成「转账」 某虚构\*甲 3 笔/.test($('uiSnack').textContent), '4 面板回来，未分类剩 2 笔；底部小条「已改成「转账」…」');
  $('rvgUndo').click();
  await A.until(() => jiaIds.every(id => rec(id).rv === 1), 5000); await tick(60);
  ok(jiaIds.every(id => rec(id).cat === '未分类' && rec(id).rv === 1) && /未分类 · 支出 · 5 笔/.test(unc().textContent), '4 小条「撤销」：改回未分类、待确认放回，面板里跟着变');
  // 新建分类改一组：走 newCats；「只改这几笔」后撤销：没人用的新分类一起删
  await A.until(() => unc().querySelectorAll('.rvg-cp').length === 2, 5000);
  const yiIds = t.recs().filter(r => r.cp === 2).map(r => r.id);
  cpRows()[1].click(); await tick();
  $('catDrawerNewCell').click(); await tick();
  $('txtInput').value = '日用百货'; $('txtOk').click();
  await A.until(() => t.ask(), 5000);
  ok(t.arch().cats.includes('日用百货') && yiIds.every(id => rec(id).cat === '日用百货'), '4 抽屉里新建「日用百货」：建好、这一行改成它');
  ok(/以后「某虚构乙店」的账单都记成「日用百货」吗/.test(t.ask().msg) && $('askOk').textContent === '只改这几笔' && $('askOk').classList.contains('primary') && $('askCancel').textContent === '以后都这样记' && $('askCancel').classList.contains('alt'), '4 普通商户：主按钮「只改这几笔」在上，「以后都这样记」在下、描边');
  ok(/以后导入时/.test(t.ask().msg) && /管理导入规则/.test(t.ask().msg), '4 写清影响：以后导入时照这个分类、能在管理导入规则里改');
  await t.askOk(); await tick(80);
  const lg2 = (await t.logs()).slice(-1)[0];
  ok(lg2 && lg2.by === 'rvgroup' && (lg2.catsAdded || []).includes('日用百货'), '4 导入记录记下新建的分类（catsAdded）');
  $('rvgUndo').click();
  await A.until(() => !t.arch().cats.includes('日用百货'), 5000);
  ok(!t.arch().cats.includes('日用百货') && yiIds.every(id => rec(id).cat === '未分类' && rec(id).rv === 1), '4 撤销：改回去，没人用的新分类一起删');
  // 「以后都这样」：存规则
  await A.until(() => unc().querySelectorAll('.rvg-cp').length === 2, 5000);
  cpRows()[1].click(); await tick();
  [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '购物').click();
  await A.until(() => t.ask(), 5000);
  await t.askCancel(); await tick(120);
  ok(((t.arch().importRules || {}).cat || []).some(r => r.kw === '某虚构乙店' && r.cat === '购物') && yiIds.every(id => rec(id).cat === '购物'), '4 「以后都这样记」（下面那颗）：存了一条规则');
  // 1030-RV2：这条规则记在这一次「成组确认」的导入记录里，撤销这一行时一起删
  const rules = () => (t.arch().importRules || {}).cat || [];
  const lg3 = (await t.logs()).slice(-1)[0];
  ok(lg3 && lg3.by === 'rvgroup' && ((lg3.rulesAdded || {}).cat || []).some(r => r.kw === '某虚构乙店' && r.cat === '购物'), '4 规则记进了这一行「成组确认」的导入记录（rulesAdded）');
  $('rvgUndo').click();
  await A.until(() => !rules().some(r => r.kw === '某虚构乙店'), 5000); await tick(60);
  ok(!rules().some(r => r.kw === '某虚构乙店') && yiIds.every(id => rec(id).cat === '未分类' && rec(id).rv === 1), '4 撤销这一行：分类改回去，那条规则也删了');
  // 原来就有这个词的规则（分类不一样）：改那条，撤销时改回原来的
  await t.w.JiwenImportStore.rulesSave({ cat: rules().concat([{ kw: '某虚构乙店', cat: '吃饭' }]), type: [] }); await tick();
  await A.until(() => unc() && unc().querySelectorAll('.rvg-cp').length === 2, 5000);
  cpRows()[1].click(); await tick();
  [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '购物').click();
  await A.until(() => t.ask(), 5000);
  await t.askCancel(); await tick(120);
  const lg4 = (await t.logs()).slice(-1)[0];
  ok(rules().filter(r => r.kw === '某虚构乙店').length === 1 && rules().find(r => r.kw === '某虚构乙店').cat === '购物' && (lg4.rulesChanged || []).some(r => r.kw === '某虚构乙店' && r.from === '吃饭' && r.to === '购物'), '4 原来有「吃饭」的规则：改成「购物」，记进 rulesChanged');
  $('rvgUndo').click();
  await A.until(() => (rules().find(r => r.kw === '某虚构乙店') || {}).cat === '吃饭', 5000); await tick(60);
  ok((rules().find(r => r.kw === '某虚构乙店') || {}).cat === '吃饭' && yiIds.every(id => rec(id).rv === 1), '4 撤销：规则改回「吃饭」');
  // 分类抽屉里取消：回到面板，什么都不改
  await A.until(() => unc() && unc().querySelectorAll('.rvg-cp').length >= 1, 5000);
  cpRows()[0].click(); await tick();
  $('uiSheetCancel').click(); await tick();
  ok(sheetOpen(t) && unc() && jiaIds.every(id => rec(id).rv === 1), '4 抽屉里取消：回到面板，没改');

  // 1030-RV4：组上的「交给 AI 按组整理」只发这一组（原来发全部待确认分类）
  unc().querySelector('[data-act="ai"]').click();
  await A.until(() => sheetOpen(t) && $('impAiGrpText'), 8000);
  const aiTx = $('impAiGrpText').value, aiGs = aiTx.split('分组：')[1] || '';
  ok(/^未分类 · 支出：2 组 · 5 笔/.test($('uiSheetSub').textContent) && /G1 \| 某虚构\*甲 \| 个人转账 \| 支出 \| 3笔/.test(aiTx) && /G2 \| 某虚构乙店 \| 某虚构商品 \| 支出 \| 2笔/.test(aiTx) && !/G3/.test(aiGs) && !/收入 \|/.test(aiGs) && !/购物|某虚构超市|某虚构面馆/.test(aiGs), '4b 未分类 · 支出 的「交给 AI」：只发这一组的 5 笔：' + $('uiSheetSub').textContent);
  $('impAiGrpClose').click(); await tick();
  await openGroups();
  const uIn2 = groups().find(g => /未分类 · 收入/.test(g.querySelector('.rvg-t').textContent));
  uIn2.querySelector('[data-act="ai"]').click();
  await A.until(() => sheetOpen(t) && $('impAiGrpText'), 8000);
  ok(/^未分类 · 收入：1 组 · 2 笔/.test($('uiSheetSub').textContent) && /G1 \| 某虚构\*甲 \| 个人转账 \| 收入 \| 2笔/.test($('impAiGrpText').value), '4b 1030-RV5：一两笔没写用途的个人转账也编 G 号交给 AI');
  $('impAiGrpClose').click(); await tick();
  await openGroups();

  // ===== 6. 分类抽屉「＋ 新建」 =====
  if (sheetOpen(t)) { t.w.JiwenSheet.close(); await tick(); }
  const cats = () => t.arch().cats;
  const F = t.w.JiwenForms;
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  F.openAddModal(); await tick(400);
  $('billCatMore').click(); await tick();
  ok(sheetOpen(t) && !$('catDrawerQ') && $('catDrawerNewCell') && $('uiPickList').lastElementChild === $('catDrawerNewCell'), '6 分类不到 12 个、没有搜索框：「全部」最后一块「＋ 新建」');
  $('catDrawerNewCell').click(); await tick();
  ok($('txtMask').style.display === 'flex' && /新分类名称/.test($('txtTitle').textContent), '6 点了弹文字小面板输名字');
  $('txtInput').value = '水果'; $('txtOk').click(); await t.idle();
  ok(cats().includes('水果') && !sheetOpen(t) && F.billCatSel === '水果', '6 确定：建好「水果」、选上、抽屉关掉：' + F.billCatSel);
  $('billCatMore').click(); await tick();
  const nCats = cats().length;
  $('catDrawerNewCell').click(); await tick();
  $('txtInput').value = '吃饭'; $('txtOk').click(); await t.idle();
  ok(cats().length === nCats && F.billCatSel === '吃饭', '6 名字和已有的重复：直接选已有的，不重复建');
  $('billCatMore').click(); await tick();
  $('uiSheetCancel').click(); await tick();
  // 分类到 12 个：有搜索框，搜不到时「＋ 新建「…」并选上」
  ['甲类', '乙类', '丙类'].forEach(c => t.w.JiwenStore.catAdd(c));
  ok(cats().length >= 12, '6 分类加到 ' + cats().length + ' 个');
  $('billCatMore').click(); await tick();
  const q = $('catDrawerQ');
  ok(q && $('catDrawerNew') && $('catDrawerNew').style.display === 'none' && !$('catDrawerNewCell'), '6 有搜索框：先不出「新建」');
  q.value = '零食'; q.dispatchEvent(new t.w.Event('input')); await tick();
  ok($('catDrawerNew').style.display === '' && $('catDrawerNew').textContent === '＋ 新建「零食」并选上' && /没有「零食」/.test(t.d.querySelector('.cat-drawer-none').textContent), '6 搜不到：「没有「零食」」+「＋ 新建「零食」并选上」');
  q.value = '果'; q.dispatchEvent(new t.w.Event('input')); await tick();
  ok($('catDrawerNew').style.display === 'none', '6 搜得到（「果」→ 水果）就不出新建');
  q.value = '零食'; q.dispatchEvent(new t.w.Event('input')); await tick();
  $('catDrawerNew').click(); await t.idle();
  ok(cats().includes('零食') && F.billCatSel === '零食' && !sheetOpen(t), '6 点了：建好、选上、关掉');
  $('billCatMore').click(); await tick();
  $('catDrawerQ').value = '分类名字太长了超过八个'; $('catDrawerQ').dispatchEvent(new t.w.Event('input')); await tick();
  $('catDrawerNew').click(); await tick();
  ok(sheetOpen(t) && /最多 8 个字/.test(t.d.querySelector('.cat-drawer-none').textContent) && !cats().includes('分类名字太长了超过八个'), '6 名字超过 8 个字：不建，写一句');
  $('uiSheetCancel').click(); await tick();
  // 导入页那种（只给了可选的几个分类）：没有新建
  t.w.JiwenSheet.pick({ title: '归到哪个分类', chips: true, options: ['吃饭', '购物'].map(v => ({ value: v, label: v })), value: '吃饭', onPick: () => {} }); await tick();
  ok(sheetOpen(t) && $('uiPickList') && !$('catDrawerNewCell') && !$('catDrawerNew'), '6 导入页的选分类（只给了可选的分类）：没有「＋ 新建」');
  t.w.JiwenSheet.close(); await tick();

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`1030-RV 待确认分类：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
