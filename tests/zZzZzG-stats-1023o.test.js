// 1023-O 统计页：这个月没过完时比「上月同期」、去掉「回到本月」✕、周合计只写数字、总结余一行整行展开算式、预算顶上「合计 已用 x / y」（jsdom）。
// node zZzZzG-stats-1023o.test.js [index.html]。记录全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark }, extra || {});
const CATS = ['未分类', '吃饭', '出行', '工资', '转账'];

(async () => {
  const recs = [
    R('o1', '2026-10-05T12:00', 100, 'expense', '吃饭', '十月饭'),
    R('o2', '2026-10-10T08:00', 30, 'expense', '出行', '十月车'),
    R('s1', '2026-09-10T12:00', 40, 'expense', '吃饭', '九月上旬饭'),
    R('s2', '2026-09-25T12:00', 500, 'expense', '吃饭', '九月下旬（同期以外）'),
    R('a1', '2026-08-28T12:00', 30, 'expense', '吃饭', '八月饭'),
    R('op', '2026-08-01T09:00', 2000, 'income', '转账', '期初余额', { flow: true }),
    R('fl', '2026-10-12T09:00', 300, 'expense', '转账', '还朋友', { flow: true }),
    R('w1', '2026-10-15T09:00', 800, 'income', '工资', ''),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, CATS, { budgets: { '吃饭': 200, '出行': 100 } }) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();
  const delta = n => { const it = [...$('statMonthCatList').querySelectorAll('.sc-item')].find(i => txt(i.querySelector('.sc-cat-name')) === n); return it ? txt(it.querySelector('.sc-delta')) : null; };

  // 1. 上月同期
  ok(txt($('statOutCmp')) === '比 9月同期 多花 90.00', '1 这个月没过完：比 9 月 1–23 日（40），不拿 9 月下旬的 500 比：' + txt($('statOutCmp')));
  ok(delta('吃饭') === '较上月同期 ↑150%', '1 分类占比也比同期：' + delta('吃饭'));
  ok(delta('出行') === '上月同期无', '1 上月同期没有：写「上月同期无」：' + delta('出行'));
  w.JiwenStats.stepMonth(-1); await tick();
  ok(txt($('statOutCmp')) === '比 8月 多花 510.00', '1 过完的月份（9 月）：和整个 8 月比：' + txt($('statOutCmp')));
  ok(delta('吃饭') === '较上月 ↑1700%', '1 过完的月份：写「较上月」：' + delta('吃饭'));
  w.JiwenStats.stepMonth(1); await tick();
  // 月底：上个月没那么多天，等于整月
  const t2 = await A.boot({ html, www: WWW, now: '2026-10-31T10:00:00', seed: A.seedOf(recs, CATS) });
  t2.d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();
  ok(/^比 9月 少花 410\.00$/.test(txt(t2.$('statOutCmp'))), '1 10 月 31 日：9 月只有 30 天，就是整个 9 月比：' + txt(t2.$('statOutCmp')));
  // 3 月 30 日：2 月没那么多天，同期就是整个 2 月
  const t3 = await A.boot({ html, www: WWW, now: '2027-03-05T10:00:00', seed: A.seedOf([R('m1', '2027-03-02T10:00', 10, 'expense', '吃饭', ''), R('f1', '2027-02-04T10:00', 4, 'expense', '吃饭', ''), R('f2', '2027-02-20T10:00', 99, 'expense', '吃饭', '')], CATS) });
  t3.d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();
  ok(txt(t3.$('statOutCmp')) === '比 2月同期 多花 6.00', '1 3 月 5 日：比 2 月 1–5 日：' + txt(t3.$('statOutCmp')));

  // 2. 去掉「回到本月」✕
  ok(!$('statTodayFab') && !/statTodayFab/.test(css), '2 没有「回到本月」✕，样式也删了');
  w.JiwenStats.stepMonth(-2); await tick();
  ok(!d.querySelector('.clear-filter-fab.show'), '2 翻到别的月份也不冒出来');
  w.JiwenStats.stepMonth(2); await tick();

  // 3. 周合计只写数字，本周深底
  const wks = [...$('statCal').querySelectorAll('.wk-sum')];
  ok(wks.every(b => !b.querySelector('.wk-n')) && wks.every(b => b.children.length === 1 && b.firstElementChild.classList.contains('wk-v')), '3 周合计格子里只有数字');
  ok(wks.find(b => b.classList.contains('cur')).dataset.mon === '2026-10-19', '3 本周那格 cur');
  ok(/button\.wk-sum\.cur \{ background:var\(--c-primary-dark\); \}/.test(css) && /\.wk-sum\.cur \.wk-v[^{]*\{ color:var\(--c-on-primary\); \}/.test(css), '3 本周那格深底白字');
  ok(wks.every(b => /点了看一周$/.test(b.getAttribute('aria-label'))), '3 读屏文字写「点了看一周」');

  // 4. 总结余：一行，整行点了展开算式
  const head = $('statBalHead');
  ok(head && head.tagName === 'BUTTON' && head.querySelector('svg.st-bal-chev') && !$('statBalRows') && !$('statBalMore'), '4 一行：总结余 + 数 + ⌄，没有「怎么算出来的」');
  ok(txt($('statBalNum')) === (2000 + 800 - 700 - 300).toFixed(2), '4 总结余 = 期初 2000 + 收入 800 − 支出 700 − 往来 300：' + txt($('statBalNum')));
  head.click(); await tick();
  const rows = [...$('statBalRows').querySelectorAll('.st-bal-row')].map(r => [...r.children].map(txt).join(' '));
  ok(rows.join('|') === '期初余额 2000.00|+ 累计收入 800.00|− 累计支出 700.00|− 往来（转账、存取钱、借还钱） 300.00|= 总结余 1800.00', '4 展开：能对上的算式：' + rows.join('|'));
  ok($('statBal').classList.contains('open') && $('statBalHead').getAttribute('aria-expanded') === 'true', '4 展开时 ⌄ 转过来');
  ok(/往来只算进结余/.test(txt($('statBalRows'))), '4 下面一句说明往来、不计');
  $('statBalHead').click(); await tick();
  ok(!$('statBalRows') && !$('statBal').classList.contains('open'), '4 再点整行收起');
  ok(/button\.st-bal-head \{[^}]*min-height:var\(--ui-tap\)/.test(css), '4 整行 48 高');

  // 5. 两块在最下面
  ok($('statAllHead').nextElementSibling === $('statBal') && $('statBal').nextElementSibling === $('catStatsCard') && !$('catStatsCard').nextElementSibling, '5 全部记录 → 总结余 → 分类汇总，在收支那栏最下面');

  // 6. 预算顶上合计
  w.JiwenStats.setStatTab('budget'); await tick();
  const tot = $('bgOverview').querySelector('.bgo-total');
  ok(tot && $('bgOverview').querySelector('.bgo-main').firstElementChild === tot, '6 预算总览第一行是合计');
  ok(txt(tot) === '合计 已用 130.00 / 300.00', '6 「合计 已用 130.00 / 300.00」（设了预算的分类加起来）：' + txt(tot));
  w.JiwenStats.stepMonth(-1); await tick();
  ok(txt($('bgOverview').querySelector('.bgo-total')) === '合计 已用 540.00 / 300.00', '6 9 月：540 / 300');
  w.JiwenStats.stepMonth(1); w.JiwenStats.setStatTab('flow'); await tick();

  ok(!t.errs.length && !t2.errs.length && !t3.errs.length, '没有报错 ' + t.errs.concat(t2.errs, t3.errs).join('|'));
  console.log(`1023-O 统计页：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
