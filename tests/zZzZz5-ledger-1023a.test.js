// 1023-A 账单页改版（jsdom 跑整个 App）。node zZzZz5-ledger-1023a.test.js [index.html]
// 1. 总览：主数字是这个月支出，‹ › 切月份（只到有记录的最早一个月、最晚到这个月），下面这个月收入、条数；结余是全部记录的（含期初余额、往来），点了拆开
// 2. 列表一条一行：左边分类 + 小字时间、备注，右边金额；按天分组，组头写当天收支（一天被分页切开时照样是整天的数）；没有「修改」按钮，点整行进详情，结余在详情里
// 3. 每页 50 条、页码只在下面
// 4. 日子缩成一条（最近的一个 + 等 N 个），点了进日子页；「当前用户」挪到设置页；分类汇总搬去统计页
// 5. 筛选：日期在第一行、快捷「本月 / 上月 / 近 7 天」（再点取消）、收支（全部 / 支出 / 收入）；底部「清除全部 | 完成」
// 6. 回归：改 / 删后结余重算、筛选没结果的空状态、总览不在这个月时不存首屏快照
// 记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark: remark || '' }, extra || {});
const NOW = '2026-10-20T10:00:00';   // 星期二

(async () => {
  const recs = [
    R('o1', '2026-08-01T09:00', 3000, 'income', '其他', '期初余额', { flow: true }),
    R('s1', '2026-09-05T12:00', 20, 'expense', '吃饭', '虚构九月午饭'),
    R('s2', '2026-09-10T18:00', 100, 'income', '工资', '虚构九月收入'),
    R('t1', '2026-10-19T12:00', 15.5, 'expense', '吃饭', '虚构昨天午饭'),
    R('t2', '2026-10-20T08:00', 6, 'expense', '吃饭', '虚构今天早饭'),
    R('t3', '2026-10-20T09:00', 200, 'income', '工资', ''),
    R('t4', '2026-10-20T09:30', 50, 'expense', '转账', '虚构信用卡还款', { skip: true }),
  ];
  const days = JSON.stringify([{ id: 'd1', name: '虚构生日', date: '2026-11-01', pin: false }, { id: 'd2', name: '虚构纪念日', date: '2027-01-01', pin: false }]);
  const seed = Object.assign(A.seedOf(recs), { ['days_' + A.ID]: days });
  const t = await A.boot({ html, www: WWW, now: NOW, seed });
  const { $, d, w } = t;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await wait(20);
  const q = sel => $('summaryOverall').querySelector(sel);

  // 1. 总览
  ok(q('#ovMonth').textContent === '10月' && /本月支出/.test($('summaryOverall').textContent), '1 默认这个月：10月、本月支出');
  ok(q('.ov-out').textContent === '21.50' && q('.ov-in').textContent === '200.00', '1 这个月支出 21.50（不计的不算）、收入 200.00：' + q('.ov-out').textContent + ' ' + q('.ov-in').textContent);
  ok(/这个月\s*4\s*条/.test(q('.ov-count').textContent), '1 这个月 4 条：' + q('.ov-count').textContent);
  ok(q('#ovNext').disabled && !q('#ovPrev').disabled, '1 这个月：› 点不了，‹ 能点');
  const bal = (3000 - 20 + 100 - 15.5 - 6 + 200).toFixed(2);
  ok(q('.ov-net').textContent === bal && /含期初余额/.test(q('#ovBal').textContent), '1 结余是全部记录的、写明含期初余额：' + q('.ov-net').textContent);
  q('#ovBal').click();
  ok(/结余怎么算的/.test($('askTitle').textContent) && /累计收入\s*\+300\.00/.test($('askMsg').textContent) && /累计支出\s*−41\.50/.test($('askMsg').textContent) && /往来\s*\+3000\.00/.test($('askMsg').textContent) && $('askMsg').textContent.includes(bal), '1 点结余：拆开写累计收入、支出、往来：' + $('askMsg').textContent.replace(/\n/g, ' '));
  $('askOk').click();
  q('#ovPrev').click();
  ok(q('#ovMonth').textContent === '9月' && /9 月支出/.test($('summaryOverall').textContent) && q('.ov-out').textContent === '20.00' && q('.ov-in').textContent === '100.00', '1 ‹ 到 9 月：9 月支出 20、收入 100');
  ok(w.JiwenLedger.ovOff() && $('billList').querySelectorAll('.bl-row').length === 7, '1 切月份只动总览，列表照旧是全部');
  q('#ovPrev').click();
  ok(q('#ovMonth').textContent === '8月' && q('#ovPrev').disabled && q('.ov-out').textContent === '0.00', '1 最早到有记录的 8 月（‹ 灰掉），往来不算支出');
  q('#ovNext').click(); q('#ovNext').click();
  ok(q('#ovMonth').textContent === '10月' && !w.JiwenLedger.ovOff(), '1 › 回到这个月');
  q('#ovPrev').click();
  ok(w.JiwenTabs && w.snapSave && (w.snapSave('hide'), !w.localStorage.getItem('app_snap_' + A.ID)), '1 总览不在这个月：不存首屏快照');
  $('clearFilterFab').click(); await wait(10);
  ok(q('#ovMonth').textContent === '10月', '1 ✕ 回到默认：总览也回到这个月');

  // 2. 列表
  const list = $('billList');
  const heads = [...list.querySelectorAll('.bl-day')];
  ok(heads[0] && /^今天 · 10月20日 周二/.test(heads[0].textContent) && heads[1] && /^昨天 · 10月19日 周一/.test(heads[1].textContent), '2 组头：今天 / 昨天 + 几月几日 周几：' + heads.map(h => h.querySelector('.bl-day-d').textContent).join('|'));
  ok(/支出\s*6\.00/.test(heads[0].textContent) && /收入\s*200\.00/.test(heads[0].textContent) && !/50\.00/.test(heads[0].textContent), '2 今天的组头：支出 6、收入 200（不计的不算）：' + heads[0].textContent);
  const sepHead = heads.find(h => h.dataset.day === '2026-09-10');
  ok(sepHead && /^9月10日 周四/.test(sepHead.textContent), '2 今年的不写年份');
  const row = list.querySelector('.bl-row[data-id="t2"]');
  ok(row && row.querySelector('.bl-cat-t').textContent === '吃饭' && row.querySelector('.bl-time').textContent === '08:00' && row.querySelector('.bl-remark').textContent === '虚构今天早饭' && row.querySelector('.bl-amt').textContent === '−6.00', '2 一条一行：分类、时间、备注、金额');
  ok(!list.querySelector('button, .operate-btn, [data-act="edit"]'), '2 行里没有「修改」按钮');
  const skipRow = list.querySelector('.bl-row[data-id="t4"]');
  ok(skipRow.querySelector('.io-skip') && skipRow.querySelector('.amt-skip'), '2 不计的有标签、金额灰色');
  ok(!list.querySelector('.bl-row[data-id="t3"] .bl-remark'), '2 没备注就不写');
  row.click();
  ok($('detailMask').style.display === 'flex' && $('detailBal').textContent === (3000 - 20 + 100 - 15.5 - 6).toFixed(2), '2 点整行进详情，结余是记完这笔以后的：' + $('detailBal').textContent);
  $('detailEdit').click();
  ok($('editMask').style.display === 'flex', '2 详情里「修改」打开修改账单');
  $('editMoney').value = '10'; $('saveEdit').click(); await t.idle && t.idle();
  await wait(20);
  ok(q('.ov-net').textContent === (3000 - 20 + 100 - 15.5 - 10 + 200).toFixed(2) && q('.ov-out').textContent === '25.50', '2 改了金额：结余、本月支出跟着重算：' + q('.ov-net').textContent);
  ok(/支出\s*10\.00/.test(list.querySelector('.bl-day').textContent), '2 组头跟着重算');

  // 3. 日子、当前用户、分类汇总
  ok(/虚构生日/.test($('daysEntryRows').textContent) && /还有/.test($('daysEntryRows').textContent) && /等 2 个/.test($('daysEntryRows').textContent) && !/虚构纪念日/.test($('daysEntryRows').textContent), '3 日子一条：最近的一个 + 等 2 个：' + $('daysEntryRows').textContent);
  ok(!$('pageLedger').contains($('nowUser')) && $('pageSettings').contains($('nowUser')) && /小明/.test($('nowUser').innerText), '3 「当前用户」在设置页：' + $('nowUser').innerText);   // jsdom 的 innerText 只是个属性，读它
  ok(!$('pageLedger').contains($('catStatsCard')) && $('pageStats').contains($('catStatsCard')), '3 分类汇总在统计页');
  $('daysManageBtn').click(); await wait(10);
  ok($('pageDays').style.display === 'block' && $('pageLedger').style.display === 'none', '3 点日子那条进日子页');
  w.JiwenTabs.backFromDaysPage ? w.JiwenTabs.backFromDaysPage() : d.querySelector('.tab-btn[data-tab="ledger"]').click(); await wait(10);

  // 4. 筛选：收支、日期快捷
  const ids = () => [...list.querySelectorAll('.bl-row')].map(r => r.dataset.id).sort().join();
  $('filterFab').click();
  const io = t => [...$('filterIoChips').children].find(c => c.textContent === t);
  ok([...$('filterIoChips').children].map(c => c.textContent).join() === '全部,支出,收入' && io('全部').classList.contains('sel'), '4 收支三个：全部 / 支出 / 收入，默认全部');
  ok([...$('filterSheet').querySelectorAll('.filter-list .rec-row-k')].map(x => x.textContent).join() === '日期,关键词,金额', '4 日期在第一行');
  io('收入').click(); $('sheetApply').click();
  ok(ids() === 'o1,s2,t3' && /收入/.test($('summaryFilter').querySelector('.filter-badge').textContent), '4 只看收入：' + ids());
  $('filterFab').click();
  ok(io('收入').classList.contains('sel'), '4 重开面板回显收入');
  const qb = k => $('filterDateQuick').querySelector(`[data-q="${k}"]`);
  qb('month').click();
  ok($('searchFrom').dataset.day === '2026-10-01' && $('searchTo').dataset.day === '2026-10-31' && qb('month').classList.contains('on'), '4 本月：10-01 到 10-31，高亮');
  qb('last').click();
  ok($('searchFrom').dataset.day === '2026-09-01' && $('searchTo').dataset.day === '2026-09-30' && qb('last').classList.contains('on') && !qb('month').classList.contains('on'), '4 上月：09-01 到 09-30');
  qb('7d').click();
  ok($('searchFrom').dataset.day === '2026-10-14' && $('searchTo').dataset.day === '2026-10-20', '4 近 7 天：10-14 到 10-20');
  ok(ids() === 'o1,s2,t3', '4 只改草稿，没点完成列表不变');
  io('全部').click(); $('sheetApply').click();
  ok(ids() === 't1,t2,t3,t4', '4 近 7 天：' + ids());
  $('filterFab').click(); qb('7d').click();
  ok(!$('searchFrom').dataset.day && !$('searchTo').dataset.day && !qb('7d').classList.contains('on'), '4 再点一下取消');
  qb('month').click(); io('支出').click(); $('sheetClear').click();
  ok(!$('searchFrom').dataset.day && io('全部').classList.contains('sel') && !$('filterDateQuick').querySelector('.on'), '4 清除全部：日期、收支一起清');
  ok($('sheetClear').classList.contains('ui-btn') && $('sheetApply').classList.contains('primary') && $('sheetClear').parentElement.classList.contains('ui-pair') && $('sheetClear').nextElementSibling === $('sheetApply'), '4 底部「清除全部 | 完成」左退右进');
  $('searchKeyword').value = '不存在的字'; $('sheetApply').click();
  ok(/没有符合条件的记录/.test(list.textContent) && /清掉筛选/.test(list.textContent) && $('pagerBottom').innerHTML === '', '5 筛选没结果：空状态写怎么清筛选、不显示页码');
  $('clearFilterFab').click(); await wait(10);

  // 5. 删一条：结余重算
  w.openEdit('t3'); $('deleteEditBtn') ? $('deleteEditBtn').click() : null;
  if (!$('deleteEditBtn')) { const del = [...$('editMask').querySelectorAll('button')].find(b => /删除这条记录/.test(b.textContent)); del && del.click(); }
  if ($('askOk') && $('askMask').style.display === 'flex') $('askOk').click();
  await wait(20);
  ok(!list.querySelector('.bl-row[data-id="t3"]') && q('.ov-net').textContent === (3000 - 20 + 100 - 15.5 - 10).toFixed(2), '5 删了一笔收入：列表没有它、结余重算：' + q('.ov-net').textContent);

  // 6. 每页 50、页码只在下面、组头是整天的数
  const many = Array.from({ length: 60 }, (_, i) => R('m' + i, `2026-10-20T${String(Math.floor(i / 6)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, 1, 'expense', '吃饭', '虚构' + i));
  const t2 = await A.boot({ html, www: WWW, now: NOW, seed: A.seedOf(many) });
  t2.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await wait(20);
  ok(!t2.$('pager') && t2.$('billList').querySelectorAll('.bl-row').length === 50 && /第 1 \/ 2 页/.test(t2.$('pagerBottom').textContent), '6 每页 50 条、页码只在下面');
  ok(/支出\s*60\.00/.test(t2.$('billList').querySelector('.bl-day').textContent), '6 一天被分页切开：组头照样是整天 60 笔的数');
  t2.$('pagerBottom').querySelector('button:last-child').click(); await wait(10);
  ok(t2.$('billList').querySelectorAll('.bl-row').length === 10 && /支出\s*60\.00/.test(t2.$('billList').querySelector('.bl-day').textContent), '6 第 2 页开头照样有这一天的组头');

  ok(!t.errs.length && !t2.errs.length, '没有报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`1023-A 账单页：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
