// 1023-L 一周详情：大柱子带每天的金额、点一根换成那一天；左右滑 / ‹ › 换上一周、下一周（jsdom 跑整个 App）。node zZzZzD-week-1023l.test.js [index.html]
// 记录全是虚构的。今天是 2026-10-23 周五。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, remark) => ({ id, time, money, type: 'expense', cat: '吃饭', remark });

(async () => {
  const recs = [
    R('a', '2026-10-19T12:00', 30, '周一'), R('b', '2026-10-22T12:00', 135.4, '周四'),
    R('c', '2026-10-13T12:00', 50, '上周二'), R('d', '2026-10-06T12:00', 8, '上上周二'),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const title = () => txt($('uiSheetTitle'));
  const body = () => $('uiSheetBody');
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  w.JiwenDetail.openWeek('2026-10-19'); await tick();

  // 1. 大柱子
  ok(title() === '本周 · 10月19日–25日', '1 标题：本周 · 10月19日–25日');
  const bars = [...body().querySelectorAll('.dw-bar')];
  ok(bars.length === 7 && bars.slice(0, 5).every(b => b.tagName === 'BUTTON') && !bars[5].matches('button') && bars[5].querySelector('.dw-fdot'), '1 过了的 5 天是能点的柱子，周六、周日还没到是一个点');
  ok(bars.map(b => txt(b.querySelector('.dw-v'))).join() === '30,0,0,135,0,,', '1 每根上面写那天的金额（取整）：' + bars.map(b => txt(b.querySelector('.dw-v'))).join());
  ok(bars[3].querySelector('i').style.height === '96px' && bars[0].querySelector('i').style.height === '21px', '1 高度按这一周最多的那天算');
  bars[3].click(); await tick();
  ok(title() === '昨天 · 10月22日 周四', '1 点周四那根：换成那一天的当日详情');
  $('dayClose').click(); await tick();
  ok(title() === '本周 · 10月19日–25日', '1 当日关了回到这一周');

  // 2. ‹ › 换周
  ok($('weekNext').disabled && !$('weekPrev').disabled, '2 本周：下一周点不了（最晚到本周）');
  $('weekPrev').click(); await tick();
  ok(title() === '第 42 周 · 10月12日–18日' && /50\.00/.test(txt(body().querySelector('.dd-cell'))) && !$('weekNext').disabled, '2 ‹：换成上一周（第 42 周），就在这个面板里换');
  ok($('uiSheetMask').style.display === 'flex', '2 面板没关');
  $('weekNext').click(); await tick();
  ok(title() === '本周 · 10月19日–25日', '2 ›：回到本周');

  // 3. 左右滑
  const swipe = (x0, x1, y0, y1) => {
    body().dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0 }));
    body().dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, clientX: x1, clientY: y1 }));
  };
  swipe(100, 220, 300, 310); await tick();
  ok(title() === '第 42 周 · 10月12日–18日', '3 往右滑：上一周');
  swipe(100, 240, 300, 305); await tick();
  ok(title() === '第 41 周 · 10月5日–11日', '3 再往右滑：再上一周');
  swipe(250, 100, 300, 300); await tick();
  ok(title() === '第 42 周 · 10月12日–18日', '3 往左滑：下一周');
  swipe(100, 130, 300, 300); await tick();
  ok(title() === '第 42 周 · 10月12日–18日', '3 挪得不够 50px：不换');
  swipe(100, 170, 300, 420); await tick();
  ok(title() === '第 42 周 · 10月12日–18日', '3 竖着挪得多（在滚）：不换');
  // 点一根，关了回到的是现在看的那一周
  body().querySelector('button.dw-bar[data-day="2026-10-13"]').click(); await tick();
  $('dayClose').click(); await tick();
  ok(title() === '第 42 周 · 10月12日–18日', '3 换过周以后点一天，关了回到换过的那一周');
  $('weekClose').click(); await tick();

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-L 一周详情：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
