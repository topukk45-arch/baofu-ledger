// 1023-E 日子竖排卡片 + 全部日子页 + 单条日子的详情（jsdom 跑整个 App）。node zZzZz7-days-1023e.test.js [index.html]
// 1. 账单页的日子卡：抬头「日子 · 全部 N 个 ›」，下面最多 3 条（置顶的排第一、浅底加粗），每条名字、日期小字、右边大号天数
// 2. 账单页点卡片里的一条 → 1023-K 起进全部日子页；一条的详情（类型、名字、大号天数、日期、在账单页；「置顶 / 取消置顶 | 修改」、「删除这个日子」）
// 3. 点抬头或卡片空白处 → 全部日子页；置顶的做成大卡片，其余照旧一行一个；点一个也是看详情；空的时候「添加你的第一个日子」
// 日子全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();

(async () => {
  const DAYS = [
    { id: 'd1', name: '虚构的考试', date: '2026-11-15', pin: false },
    { id: 'd2', name: '虚构的搬家', date: '2025-06-01', pin: false },
    { id: 'd3', name: '虚构的纪念日', date: '2026-12-06', pin: true },
    { id: 'd4', name: '虚构的生日', date: '2027-03-01', pin: false },
  ];
  const seed = Object.assign(A.seedOf([{ id: 'r1', time: '2026-10-22T12:00', money: 10, type: 'expense', cat: '吃饭', remark: '' }]), { ['days_' + A.ID]: JSON.stringify(DAYS) });
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const sheetOpen = () => $('uiSheetMask') && $('uiSheetMask').style.display === 'flex';
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();

  // 1. 卡片
  const items = () => [...$('daysEntryRows').querySelectorAll('.dc-item')];
  ok(txt($('daysManageBtn')) === '日子全部 4 个' && $('daysCard').querySelector('svg.dc-go'), '1 抬头：日子 · 全部 4 个；› 在卡片右边（1023-K）');
  ok(items().length === 3 && items().map(i => i.dataset.dayId).join() === 'd3,d1,d4', '1 最多 3 条，置顶的排第一，其余照日子页的顺序');
  ok(items()[0].classList.contains('pin') && !items()[1].classList.contains('pin'), '1 置顶的那条浅底加粗');
  ok(txt(items()[0].querySelector('.dc-name')) === '虚构的纪念日' && txt(items()[0].querySelector('.dc-date')) === '2026-12-06 周日' && txt(items()[0].querySelector('.dc-r')) === '还有44天' && items()[0].querySelector('.dc-n.future'), '1 每条：名字、日期小字、右边大号天数');
  ok($('daysCard').contains($('daysManageBtn')) && !$('pageLedger').querySelector('.days-strip'), '1 原来那一条（days-strip）换成了竖排卡片');

  // 2. 1023-K 起账单页上点卡片里的一条也是进全部日子页（整张卡片能点）；一条的详情从全部日子页里点
  items()[1].click(); await tick();
  ok($('pageDays').style.display === 'block' && !sheetOpen(), '2 账单页点卡片里的一条：进全部日子页（1023-K）');
  w.JiwenTabs.backFromDaysPage(); await tick();
  w.JiwenDays.openDayItem('d1'); await tick();
  ok(sheetOpen() && txt($('uiSheetTitle')) === '倒数日' && txt($('uiSheetBody').querySelector('.di-hero-name')) === '虚构的考试' && txt($('uiSheetBody').querySelector('.di-hero-num')) === '还有23天', '2 一条的详情（类型、名字、大号天数）');
  const rows = [...$('uiSheetBody').querySelectorAll('.rec-row')].map(txt);
  ok(rows.join('|') === '日期2026-11-15 星期日|在账单页按日期排', '2 日期、在账单页：' + rows.join('|'));
  ok(txt($('dayItemPin')) === '置顶' && $('dayItemEdit').classList.contains('primary') && $('dayItemPin').parentElement.classList.contains('ui-pair') && txt($('dayItemDel')) === '删除这个日子', '2 「置顶 | 修改」、下面「删除这个日子」');
  $('dayItemPin').click(); await tick();
  ok(w.JiwenStore.loadDays().find(x => x.id === 'd1').pin === true && txt($('dayItemPin')) === '取消置顶' && /置顶，排第一个/.test(txt($('uiSheetBody'))), '2 点「置顶」：存了，详情跟着变');
  ok(items()[0].dataset.dayId === 'd1' || items()[1].dataset.dayId === 'd1', '2 卡片跟着重排（置顶的在前）');
  $('dayItemPin').click(); await tick();
  ok(w.JiwenStore.loadDays().find(x => x.id === 'd1').pin === false, '2 再点「取消置顶」');
  $('dayItemEdit').click(); await tick();
  ok(!sheetOpen() && $('dayMask').style.display === 'flex' && $('dayName').value === '虚构的考试', '2 「修改」打开日子弹窗');
  $('dayCancel').click(); await tick();
  // 过去的日子：纪念日、已经 N 天；删除先问
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  w.JiwenDays.openDayItem('d2'); await tick();
  ok(txt($('uiSheetTitle')) === '纪念日' && txt($('uiSheetBody').querySelector('.di-hero-num')) === '已经509天', '2 过去的日子：纪念日、已经 N 天');
  $('dayItemDel').click(); await tick();
  ok(/删除日子「虚构的搬家」/.test($('askMsg').textContent), '2 删除先问');
  $('askOk').click(); await tick();
  ok(!w.JiwenStore.loadDays().some(x => x.id === 'd2') && !sheetOpen() && txt($('daysManageBtn')) === '日子全部 3 个', '2 删掉了，卡片跟着变');

  // 3. 全部日子页
  $('daysEntryRows').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));   // 卡片空白处（不是某一条）
  await tick();
  ok($('pageDays').style.display === 'block', '3 点卡片空白处：全部日子页');
  const hero = $('daysList').querySelector('.day-hero');
  ok(hero && hero.dataset.dayId === 'd3' && txt(hero.querySelector('.dh-name')) === '虚构的纪念日' && txt(hero.querySelector('.dh-num')) === '还有44天' && hero.querySelector('svg.di-star[aria-label="置顶"]'), '3 置顶的做成大卡片');
  ok($('daysList').querySelectorAll('.day-item:not(.day-hero)').length === 2, '3 其余照旧一行一个');
  $('daysList').querySelector('.day-item:not(.day-hero)').click(); await tick();
  ok(sheetOpen() && txt($('uiSheetBody').querySelector('.di-hero-name')) === '虚构的考试', '3 日子页里点一个：也是看详情');
  w.JiwenSheet.close();
  w.JiwenTabs.backFromDaysPage(); await tick();
  $('daysManageBtn').click(); await tick();
  ok($('pageDays').style.display === 'block', '3 点抬头：全部日子页');
  w.JiwenTabs.backFromDaysPage();

  // 4. 空的时候
  w.JiwenStats.saveDays([]); w.JiwenDays.renderDaysCard();
  ok(items().length === 1 && items()[0].dataset.dayAct === 'add' && txt(items()[0]) === '添加你的第一个日子' && txt($('daysAllTxt')) === '添加', '4 没日子：「添加你的第一个日子」');
  items()[0].click(); await tick();
  ok($('pageDays').style.display === 'block' && $('dayMask').style.display === 'flex', '4 点了进日子页并打开添加');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-E 日子：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
