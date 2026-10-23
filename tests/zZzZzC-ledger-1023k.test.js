// 1023-K 账单页分层：月是页头、周是分隔线、日是卡片（jsdom 跑整个 App）。node zZzZzC-ledger-1023k.test.js [index.html]
// 1. 页头：大字「10月」+ 支出 / 收入两个数 + 「统计 ›」，不加底色不装框不吸顶；整行点了去统计页同一个月
// 2. 周分隔线：「本周 10.19–25 + 7 根小柱子 + 线 + 金额 ›」；别的周写「第 N 周」；小柱子按每天支出、这个月以外 / 没到的日子是点；本周 cur
// 3. 日卡片照旧；周和日只用 ›，月用「统计 ›」
// 4. 日子卡：整张能点进全部日子；「全部 N 个」照留；右边一个 ›
// 记录全是虚构的。今天是 2026-10-23 周五。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark) => ({ id, time, money, type, cat, remark });

(async () => {
  const recs = [
    R('a', '2026-10-19T12:00', 10, 'expense', '吃饭', '周一'),
    R('b', '2026-10-21T12:00', 40, 'expense', '吃饭', '周三'),
    R('c', '2026-10-22T12:00', 20, 'expense', '出行', '周四'),
    R('d', '2026-10-14T12:00', 300, 'income', '工资', '只有收入的那周'),
  ];
  const DAYS = [{ id: 'd1', name: '虚构的考试', date: '2026-11-15', pin: false }];
  const seed = Object.assign(A.seedOf(recs), { ['days_' + A.ID]: JSON.stringify(DAYS) });
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');

  // 1. 页头
  const bar = $('billHead');
  ok(txt(bar.querySelector('#lgMonth')) === '10月' && txt(bar.querySelector('.ov-out')) === '70.00' && txt(bar.querySelector('.ov-in')) === '300.00' && txt(bar).endsWith('统计 ›'), '1 页头：10月 + 支出 70 + 收入 300 + 统计 ›');
  ok(/button\.lg-bar \{[^}]*background:transparent/.test(css) && !/button\.lg-bar \{[^}]*position:sticky/.test(css), '1 不加底色、不吸顶');
  ok(/\.lg-bar-m \{[^}]*font-size:32px/.test(css), '1 「10月」大字');
  bar.click(); await tick();
  ok(w.JiwenBase.currentTab === 'stats' && $('statMonthLabel').textContent === '2026年10月', '1 整行点了：统计页同一个月');
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();

  // 2. 周分隔线
  const wks = [...$('billList').querySelectorAll('.lg-wk')];
  const w0 = wks[0], w1 = wks[1];
  ok(w0.classList.contains('cur') && txt(w0.querySelector('.lg-wk-n')) === '本周' && txt(w0.querySelector('.lg-wk-r')) === '10.19–25' && txt(w0.querySelector('.lg-wk-v')) === '70.00', '2 本周：本周 10.19–25 … 70.00');
  ok(txt(w1.querySelector('.lg-wk-n')) === '第 42 周' && !w1.classList.contains('cur') && txt(w1.querySelector('.lg-wk-v')) === '+300.00' && w1.querySelector('.lg-wk-v b.pos'), '2 上周写「第 42 周」；只有收入写 +300.00（绿）');
  const bars = [...w0.querySelectorAll('.lg-wk-bars i')];
  ok(bars.length === 7 && bars.map(i => i.classList.contains('lg-wk-dot') ? '.' : 'i').join('') === 'iiiii..', '2 7 根：周六、周日还没到是点');
  ok(bars[2].style.height === '16px' && bars[0].style.height === '4px' && bars[1].style.height === '2px' && bars[3].style.height === '8px', '2 高度按每天支出（最多的那天 16px，没花的 2px）：' + bars.map(i => i.style.height).join());
  ok(w0.querySelectorAll('.lg-wk-line').length === 2 && w0.querySelector('svg.lg-chev'), '2 前后两段线、右边 ›');
  ok(/button\.lg-wk \{[^}]*background:transparent/.test(css) && /button\.lg-wk \{[^}]*min-height:var\(--ui-tap\)/.test(css) && /button\.lg-wk\.pressed/.test(css), '2 不加底色；可点高度照旧 48；按下有浅底');
  ok(/\.lg-wk-n \{[^}]*color:var\(--c-text-soft\)/.test(css) && /\.lg-wk\.cur \.lg-wk-n \{[^}]*color:var\(--c-primary-dark\)/.test(css) && /\.lg-wk-bars i \{[^}]*background:var\(--c-primary\)/.test(css), '2 只有「本周」和小柱子用主色，别的周灰色');
  w0.click(); await tick();
  ok($('uiSheetMask').style.display === 'flex' && /^本周/.test(txt($('uiSheetTitle'))), '2 点周分隔线：一周详情');
  w.JiwenSheet.close(); await tick();

  // 3. 日卡片照旧，抬头只有 ›
  const dh = $('billList').querySelector('.lg-dh');
  ok(dh && dh.querySelector('svg.lg-chev') && !/统计/.test(txt(dh)), '3 日卡片抬头照旧，只用 ›');

  // 4. 日子卡
  ok(txt($('daysAllTxt')) === '全部 1 个' && $('daysCard').querySelector('svg.dc-go'), '4 「全部 1 个」照留，› 在卡片右边');
  $('daysEntryRows').querySelector('.dc-item').click(); await tick();
  ok($('pageDays').style.display === 'block', '4 点卡片里的一条：进全部日子页');
  w.JiwenTabs.backFromDaysPage(); await tick();

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-K 账单页分层：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
