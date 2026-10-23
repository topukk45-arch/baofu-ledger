// 1023-H 统计页（jsdom 跑整个 App）。node zZzZzA-stats-1023h.test.js [index.html]
// 1. 标题右边写年月、没有 ‹ ›；两格：当月支出（几笔、比上月）| 当月收入（本月净剩）
// 2. 月份浮条：账本第一笔的月份到这个月，超过月预算的那个月标红；和账单页看的是同一个月（账单页「统计 ›」进来、统计页切了账单页跟着）
// 3. 日历每一行右边一格周合计（净额，本周那格深一点，点了开一周详情）；点某一天开当日详情（和账单页同一个抽屉）；今天是周一时本周那格空着
// 4. 总结余就地展开：期初余额、累计收入、累计支出、往来 + 一句为什么不等于收入减支出
// 5. 预算明细一笔两行（和账单页同一个样子），点一笔开单笔详情，「改预算」在说明那一行
// 记录全是虚构的。今天是 2026-10-23 周五。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark: remark || '' }, extra || {});
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const CATS = ['未分类', '吃饭', '购物', '工资', '转账', '其他'];

(async () => {
  const recs = [
    R('o0', '2026-08-03T09:00', 3000, 'income', '其他', '期初余额', { flow: true }),
    R('s1', '2026-09-10T12:00', 100, 'expense', '吃饭', '九月聚餐'),
    R('s2', '2026-09-11T09:00', 1000, 'income', '工资', ''),
    R('a4', '2026-10-05T12:00', 50, 'expense', '吃饭', '午饭'),
    R('a5', '2026-10-06T10:00', 500, 'expense', '转账', '还朋友', { flow: true }),
    R('a1', '2026-10-19T12:00', 30, 'expense', '吃饭', '周一午饭'),
    R('a2', '2026-10-22T13:00', 197, 'expense', '购物', '键盘'),
    R('a3', '2026-10-22T19:00', 200, 'income', '工资', ''),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, CATS, { budgets: { '吃饭': 90 } }) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const sheet = () => $('uiSheetMask') && $('uiSheetMask').style.display === 'flex' ? txt($('uiSheetTitle')) : null;
  const toStats = () => d.querySelector('.tab-btn[data-tab="stats"]').click();
  toStats(); await tick();

  // 1. 标题、两格
  ok(txt($('statMonthLabel')) === '2026年10月' && !$('statPrevM') && !$('statNextM'), '1 标题右边写年月，没有 ‹ ›');
  ok(txt($('statOutK')) === '当月支出 · 3 笔' && txt($('statMonthOut')) === '277.00', '1 当月支出 277（往来不算）、3 笔：' + txt($('statOutK')));
  ok(txt($('statOutCmp')) === '比 9月同期 多花 177.00', '1 比上月（这个月没过完，1023-O 起比 9 月 1–23 日）：' + txt($('statOutCmp')));
  ok(txt($('statMonthIn')) === '+200.00' && txt($('statNet')) === '本月净剩 −77.00' && $('statNet').querySelector('b.out'), '1 当月收入、本月净剩（负的用正文色）');

  // 2. 月份浮条
  const items = () => [...$('stStrip').querySelectorAll('.ms-item')];
  ok(items().map(b => b.dataset.ym).join() === '2026-08,2026-09,2026-10', '2 月份：账本第一笔（8 月）到这个月');
  ok(items()[1].classList.contains('over') && !items()[2].classList.contains('over') && !items()[0].classList.contains('over'), '2 9 月吃饭 100 超过月预算 90：标红；10 月 80 没超');
  items()[1].click(); await tick();
  ok(txt($('statMonthLabel')) === '2026年09月' && txt($('statMonthOut')) === '100.00' && txt($('statOutCmp')) === '8月 没有支出', '2 点 9 月：切过去；上个月没有支出写一句');
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  ok(txt($('lgMonth')) === '9月', '2 统计页切了月份，账单页跟着是 9 月：' + txt($('lgMonth')));
  w.JiwenLedger.setYM('2026-10');
  $('billHead').click(); await tick();
  ok(w.JiwenBase.currentTab === 'stats' && txt($('statMonthLabel')) === '2026年10月', '2 账单页「统计 ›」：进统计页，同一个月');

  // 3. 日历周合计、点日子
  const wks = [...$('statCal').querySelectorAll('.wk-sum')];
  ok(wks.length === 5 && wks.map(b => b.dataset.mon).join() === '2026-09-28,2026-10-05,2026-10-12,2026-10-19,2026-10-26', '3 每一行一格周合计（10 月 5 行），记着那周的周一');
  ok(wks.map(b => txt(b.querySelector('.wk-v'))).join() === '—,−50,—,−27,—', '3 周合计是净额（往来不算）：' + wks.map(b => txt(b.querySelector('.wk-v'))).join());
  ok(wks[3].classList.contains('cur') && !wks[3].querySelector('.wk-n') && wks[3].getAttribute('aria-label').startsWith('本周') && !wks[2].classList.contains('cur'), '3 本周那格深底（1023-O 起格子里只写数字，「本周」写在读屏文字里）');
  wks[3].click(); await tick();
  ok(sheet() === '本周 · 10月19日–25日', '3 点周合计：一周详情 ' + sheet());
  w.JiwenSheet.close(); await tick();
  const cell = n => [...$('statCal').querySelectorAll('.day')].find(c => c.querySelector('.dn') && c.querySelector('.dn').textContent === String(n));
  ok(cell(5).querySelector('.da.out') && txt(cell(5).querySelector('.da')) === '-50' && txt(cell(22).querySelector('.da')) === '+3' && cell(22).querySelector('.da.pos'), '3 日子格：花出去的正文色、进账绿色');
  cell(22).click(); await tick();
  ok(sheet() === '昨天 · 10月22日 周四' && $('uiSheetBody').querySelectorAll('.bl-row').length === 2, '3 点某一天：当日详情（和账单页同一个） ' + sheet());
  w.JiwenSheet.close(); await tick();
  ok(!cell(23) || !cell(23).dataset.day, '3 没记账的日子不能点');

  // 4. 总结余
  ok(txt($('statBalNum')) === (3000 + 1200 - 377 - 500).toFixed(2) && !$('statBalRows'), '4 总结余：全部记录 ' + txt($('statBalNum')));
  $('statBalHead').click();
  const rows = [...$('statBalRows').querySelectorAll('.st-bal-row')].map(r => [...r.children].map(txt).join(' '));
  ok(rows.join('|') === '期初余额 3000.00|+ 累计收入 1200.00|− 累计支出 377.00|− 往来（转账、存取钱、借还钱） 500.00|= 总结余 3323.00', '4 展开是能对上的算式（1023-O）：' + rows.join('|'));
  ok(/结余不等于收入减支出/.test(txt($('statBalRows'))) && $('statBalHead').getAttribute('aria-expanded') === 'true', '4 写明为什么不等于收入减支出');
  $('statBalHead').click();
  ok(!$('statBalRows') && $('statBalHead').getAttribute('aria-expanded') === 'false' && !$('statBalMore'), '4 整行再点收起（1023-O 起没有「怎么算出来的 ›」，整行就是开关）');

  // 5. 预算明细
  w.JiwenStats.setStatTab('budget'); await tick();
  ok(txt($('statMonthLabel')) === '2026年10月', '5 预算那栏共用标题上的年月');
  const row = [...$('bgGroups').querySelectorAll('.bg-row')].find(r => r.dataset.cat === '吃饭');
  row.click(); await tick();
  const det = $('bgGroups').querySelector('.bg-detail');
  const brs = [...det.querySelectorAll('.bl-row')];
  ok(brs.map(r => r.dataset.id).join() === 'a1,a4' && txt(brs[0].querySelector('.bl-t')) === '周一午饭' && txt(brs[0].querySelector('.bl-sub')) === '吃饭 · 10月19日 12:00' && txt(brs[0].querySelector('.bl-amt')) === '−30.00', '5 一笔两行：备注 / 分类 · 日期时间、金额');
  ok(det.querySelector('.bg-detail-head .bg-edit') && txt(det.querySelector('.bg-detail-head .bg-edit')) === '改预算', '5 「改预算」在说明那一行');
  brs[0].click(); await tick();
  ok($('detailMask').style.display === 'flex' && txt($('detailRemark')) === '周一午饭', '5 点一笔：单笔详情');
  w.JiwenDetail.closeDetail();
  w.JiwenStats.setStatTab('flow');
  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));

  // 6. 今天是周一：本周那格空着
  const t2 = await A.boot({ html, www: WWW, now: '2026-10-19T10:00:00', seed: A.seedOf(recs.filter(r => r.time < '2026-10-20'), CATS) });
  t2.d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();
  const w2 = [...t2.$('statCal').querySelectorAll('.wk-sum')];
  ok(w2[3].classList.contains('cur') && txt(w2[3].querySelector('.wk-v')) === '' && txt(w2[1].querySelector('.wk-v')) === '−50', '6 今天周一：本周那格空着，别的周照旧');

  // 7. 大数（1023-I）：周合计最多 6 个字（「12.3万」「1235万」「1.2亿」），顶上两格带 data-fit（放不下就缩字，不切掉）
  const big = [R('b1', '2026-10-05T10:00', 123456, 'expense', '购物', ''), R('b2', '2026-10-12T10:00', 12345678.9, 'income', '工资', ''), R('b3', '2026-10-20T10:00', 234567890, 'income', '工资', '')];
  const t3 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(big, CATS) });
  t3.d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();
  const w3 = [...t3.$('statCal').querySelectorAll('.wk-sum')].map(b => txt(b.querySelector('.wk-v')));
  ok(w3.slice(1, 4).join() === '−12.3万,+1235万,+2.3亿', '7 周合计按万 / 亿缩写：' + w3.join());
  ok(t3.$('statMonthOut').hasAttribute('data-fit') && t3.$('statMonthIn').hasAttribute('data-fit'), '7 两格的大字放不下就缩小');

  console.log(`1023-H 统计页：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
