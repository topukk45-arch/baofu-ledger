// 1023-G 搜一笔：结果页 + 筛选条件抽屉（jsdom 跑整个 App）。node zZzZz9-search-1023g.test.js [index.html]
// 1. 点「搜一笔」：结果页从右边滑进来、筛选条件抽屉自动拉出；抽屉里一改，结果页和「看这 N 笔」跟着变
// 2. 抽屉：日期两个按钮 + 不限 / 本月 / 上月 / 近 7 天、金额大字、收入 | 支出、常用分类 4 个、列表卡（分类 ›、统计 ›、备注）
// 3. 结果页：条件小标签（点 × 去掉）、条数 + 合计 + 批量改、和账单页一样的周小计 / 日卡片 / 两行、没条件 = 全部、没结果的缺省页、底部「回到账单 | 改条件」
// 4. 收起：往下拉、点暗处、返回键（先抽屉、再结果页）；批量的范围 = 列出来的；改了记录结果跟着变；待确认分类从账单页进
// 记录全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark }, extra || {});
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();

(async () => {
  const recs = [
    R('a', '2026-10-21T21:30', 10.44, 'expense', '出行', '打车回家'),
    R('b', '2026-10-21T08:10', 3, 'expense', '出行', '地铁'),
    R('c', '2026-10-20T12:00', 26, 'expense', '吃饭', '晚饭 打车 去的'),
    R('d', '2026-10-13T19:06', 5200.83, 'income', '工资', '十月工资'),
    R('e', '2026-09-20T12:00', 95.6, 'expense', '购物', '盒马补货'),
    R('f', '2026-09-02T10:00', 15.29, 'expense', '出行', '打车', { skip: true }),
    R('g', '2026-10-22T09:00', 8, 'expense', '未分类', '虚构的', { rv: 1 }),
  ];
  const seed = Object.assign(A.seedOf(recs, ['未分类', '吃饭', '购物', '出行', '工资', '其他']), { app_dev_import: '1' });
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const frame = () => new Promise(r => w.requestAnimationFrame(() => setTimeout(r, 0)));
  const S = w.JiwenSearch;
  const sheetOn = () => $('filterSheetMask').style.display === 'flex';
  const ids = () => { S.searchFlush(); return [...$('searchList').querySelectorAll('.bl-row')].map(r => r.dataset.id).sort().join(); };
  const tags = () => [...$('searchTags').querySelectorAll('.sp-tag')].map(txt);
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();

  // 1. 打开
  ok(txt($('filterFab')) === '搜一笔' && $('actionBar').contains($('fabAdd')), '1 底栏「搜一笔 | 记一笔」');
  $('filterFab').click(); await frame();
  ok(S.isOpen() && !$('pageSearch').hidden && $('pageSearch').classList.contains('sp-in') && sheetOn() && $('filterSheetMask').classList.contains('open'), '1 结果页滑进来、抽屉自动拉出');
  ok(txt($('filterSheet').querySelector('.sheet-head')) === '筛选条件' && $('filterSheet').querySelector('.sheet-handle'), '1 抽屉：拖动条 + 标题「筛选条件」');
  ok(ids() === 'a,b,c,d,e,f,g' && txt($('sheetApply')) === '看这 7 笔' && /还没设条件/.test(txt($('searchTags'))) && !$('batchBar'), '1 没条件：全部记录、不给批量');

  // 2. 抽屉里的东西
  ok([...$('filterDateQuick').children].map(txt).join() === '不限,本月,上月,近 7 天' && $('filterDateQuick').querySelector('[data-q="all"]').classList.contains('on'), '2 快捷日期：不限 / 本月 / 上月 / 近 7 天，默认不限');
  ok(txt($('searchFromBtn')) === '' && $('searchFrom').dataset.placeholder === '起始日期' && $('searchToBtn').querySelector('svg.sf-ico'), '2 日期两个带日历图标的按钮（空着写起始 / 结束日期）');
  ok($('searchMin').closest('.sf-money') && $('searchMax').closest('.sf-money') && $('searchMin').placeholder === '最低', '2 金额范围：¥ 最低 — ¥ 最高');
  ok([...$('filterIoChips').children].map(txt).join() === '收入,支出', '2 收入 | 支出 两个大按钮');
  const qc = [...$('filterQuickCats').children].map(txt);
  ok(qc.length === 4 && qc.includes('出行') && qc.includes('吃饭'), '2 常用分类 4 个（最近用得多的）：' + qc.join());
  ok(txt($('filterCatVal')) === '全部分类' && txt($('filterModeVal')) === '全部' && $('filterChips').hidden && $('filterModeChips').hidden, '2 列表卡：分类 / 统计 默认收着');
  ok(!$('filterRvRow').hidden && txt($('filterRvVal')) === '1 条', '2 有待确认分类：多一行（开发开关开着）');

  // 3. 一改就变
  $('searchKeyword').value = '打车'; $('searchKeyword').dispatchEvent(new w.Event('input'));
  ok(ids() === 'a,c,f' && txt($('sheetApply')) === '看这 3 笔', '3 备注「打车」：马上变成 3 笔');
  $('searchKeyword').value = '打车 回家'; $('searchKeyword').dispatchEvent(new w.Event('input'));
  ok(ids() === 'a', '3 「打车 回家」两个词都要有');
  $('searchKeyword').value = '打车'; $('searchKeyword').dispatchEvent(new w.Event('input'));
  [...$('filterIoChips').children].find(b => txt(b) === '支出').click();
  $('filterModeRow').click();
  ok(!$('filterModeChips').hidden && $('filterModeRow').classList.contains('open'), '3 点「统计 ›」展开');
  [...$('filterModeChips').children].find(b => txt(b) === '计入').click();
  ok(ids() === 'a,c' && txt($('filterModeVal')) === '计入', '3 支出 + 计入');
  $('filterCatRow').click();
  [...$('filterChips').children].find(b => txt(b) === '出行').click();
  ok(ids() === 'a' && txt($('filterCatVal')) === '出行' && [...$('filterQuickCats').children].find(b => txt(b) === '出行').classList.contains('sel'), '3 分类出行：常用里那个也高亮');
  $('sheetApply').click(); await tick();
  ok(!sheetOn() && S.isOpen(), '3 「看这 1 笔」：抽屉收起，就是结果页');
  ok(tags().join() === '支出,出行,计入,备注：打车' && txt($('searchCount')) === '1 笔', '3 条件列成小标签：' + tags().join());
  ok(/找到 1 笔/.test(txt($('summaryFilter'))) && /支出 10\.44/.test(txt($('summaryFilter'))) && $('batchBar'), '3 条数 + 合计 + 批量改');
  ok($('searchList').querySelector('.lg-wk') && $('searchList').querySelector('.lg-dc .lg-dh') && txt($('searchList').querySelector('.bl-t')) === '打车回家' && !$('searchList').querySelector('.lg-gap'), '3 列表：周小计 / 日卡片 / 两行，没有空白日');
  // 小标签点 × 去掉
  [...$('searchTags').querySelectorAll('.sp-tag')].find(b => txt(b) === '出行').click();
  ok(ids() === 'a,c' && tags().join() === '支出,计入,备注：打车', '3 点「出行」的 ×：去掉那一条');
  // 改条件：条件留着
  $('searchEdit').click(); await frame();
  ok(sheetOn() && $('searchKeyword').value === '打车' && [...$('filterIoChips').children].find(b => txt(b) === '支出').classList.contains('sel'), '3 「改条件」：抽屉拉出来，条件留着');
  // 点暗处收起
  $('filterSheetMask').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(!sheetOn() && S.isOpen(), '3 点暗处：抽屉收起');

  // 4. 没结果
  $('searchEdit').click(); await frame();
  $('searchMin').value = '1000'; $('searchMin').dispatchEvent(new w.Event('input'));
  ok(ids() === '' && txt($('sheetApply')) === '看这 0 笔' && !$('searchEmpty').hidden && /没有找到相关的账/.test(txt($('searchEmpty'))) && $('summaryFilter').hidden, '4 没结果：缺省页');
  ok(tags().includes('¥1000 起'), '4 金额的小标签：' + tags().join());
  $('sheetClear').click();
  ok(ids() === 'a,b,c,d,e,f,g' && !tags().length && $('searchKeyword').value === '' && $('searchMin').value === '', '4 清空条件：回到全部');

  // 5. 返回键：先抽屉、再结果页
  await t.back();
  ok(!sheetOn() && S.isOpen(), '5 返回键：先收抽屉');
  await t.back();
  await new Promise(r => setTimeout(r, 300));
  ok(!S.isOpen() && $('pageSearch').hidden && $('pageLedger').style.display !== 'none', '5 再按：收起结果页，回到账单');

  // 6. 批量：范围 = 列出来的；改了记录结果跟着变
  $('filterFab').click(); await frame();
  [...$('filterQuickCats').children].find(b => txt(b) === '出行').click();
  $('sheetApply').click(); await tick();
  ok(ids() === 'a,b,f', '6 出行 3 笔');
  $('batchBar').click(); await tick();
  ok(/对搜到的这 3 条记录/.test($('askMsg').textContent), '6 批量写的是这 3 条');
  $('askCancel').click(); await tick();
  w.JiwenDetail.openDetail('b'); $('detailEdit').click(); await tick();
  w.JiwenForms.pickEditCat('吃饭'); $('saveEdit').click(); await t.idle(); await tick();
  ok(ids() === 'a,f', '6 改了一笔的分类：结果页跟着变');
  // 点一笔进单笔详情；点日期抬头进当日详情
  $('searchList').querySelector('.bl-row[data-id="a"]').click();
  ok($('detailMask').style.display === 'flex' && txt($('detailRemark')) === '打车回家', '6 点一笔：单笔详情');
  w.JiwenDetail.closeDetail();
  $('searchList').querySelector('.lg-dh').click(); await tick();
  ok($('uiSheetMask').style.display === 'flex', '6 点日期抬头：当日详情');
  w.JiwenSheet.close();
  $('searchToLedger').click(); await new Promise(r => setTimeout(r, 300));

  // 7. 待确认分类：账单页的胶囊打开结果页（不拉抽屉）
  const chip = $('rvChip');
  ok(chip && /待确认分类 1 条/.test(txt(chip)), '7 账单页「待确认分类 1 条 ›」');
  chip.click(); await tick();
  ok(S.isOpen() && !sheetOn() && tags().join() === '待确认分类' && ids() === 'g', '7 点了：结果页只看待确认分类、不拉抽屉');
  $('searchBack').click(); await new Promise(r => setTimeout(r, 300));
  ok(!S.isOpen(), '7 ‹ 返回账单');

  // 8. 空账本
  const t2 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf([]) });
  t2.d.querySelector('.tab-btn[data-tab="ledger"]').click(); t2.$('filterFab').click(); t2.$('sheetApply').click();
  ok(!t2.$('searchEmpty').hidden && /账本里还没有记录/.test(txt(t2.$('searchEmpty'))), '8 空账本：缺省页写「账本里还没有记录」');

  ok(!t.errs.length && !t2.errs.length, '没有报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`1023-G 搜一笔：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
