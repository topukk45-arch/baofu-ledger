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
  body().querySelector('.wd-tab-wk').click(); await tick();
  ok(title() === '本周 · 10月19日–25日', '1 点顶上「整周」回到这一周');

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
  body().querySelector('.wd-tab-wk').click(); await tick();
  ok(title() === '第 42 周 · 10月12日–18日', '3 换过周以后点一天，再点「整周」回到换过的那一周');
  // 4. 1025-UX：一周和一天是同一个面板，在里面切
  let opens = 0; const o0 = w.JiwenSheet.open; w.JiwenSheet.open = function () { opens++; return o0.apply(this, arguments); };
  body().querySelector('.dw-day[data-day="2026-10-13"]').click(); await tick();
  ok(title() === '10月13日 周二' && opens === 0 && $('uiSheetMask').style.display === 'flex', '4 点某一天那一行：就地换成那一天，面板没有关了再开');
  const tabs = () => [...body().querySelectorAll('.wd-tab')];
  ok(tabs().map(txt).join(',') === '整周,一12,二13,三14,四15,五16,六17,日18' && tabs()[2].classList.contains('on'), '4 顶上一行「整周 一 … 日」，选中的是周二：' + tabs().map(txt).join(','));
  ok(txt($('uiSheetSub')) === '1 笔' && $('dayAdd') && $('dayClose') && !$('weekClose'), '4 看一天：副标题写几笔，底部「关闭 | 给这天补一笔」');
  tabs()[7].click(); await tick();
  ok(title() === '10月18日 周日', '4 点「日」：换成周日');
  $('weekNext').click(); await tick();
  ok(title() === '10月19日 周一' && body().querySelector('.wd-tab.on').dataset.v === '2026-10-19' && tabs()[1].dataset.v === '2026-10-19', '4 看一天时 › 是后一天，跨到下一周时顶上那行跟着换周');
  swipe(100, 220, 300, 310); await tick();
  ok(title() === '10月18日 周日', '4 看一天时往右滑：前一天');
  swipe(250, 100, 300, 300); await tick(); swipe(250, 100, 300, 300); await tick(); swipe(250, 100, 300, 300); await tick(); swipe(250, 100, 300, 300); await tick(); swipe(250, 100, 300, 300); await tick();
  ok(title() === '今天 · 10月23日 周五' && $('weekNext').disabled, '4 往后最多到今天');
  ok(tabs()[6].disabled && tabs()[7].disabled, '4 还没到的日子点不了');
  w.JiwenDetail.openDay('2026-10-22'); await tick();
  body().querySelector('.wd-tab-wk').click(); await tick();
  ok(title() === '本周 · 10月19日–25日' && $('weekClose') && !txt($('uiSheetSub')), '4 从当日打开（账单页点日期抬头）也能点「整周」看那一周');
  body().querySelector('.wd-tab[data-v="2026-10-22"]').click(); await tick();
  body().querySelector('.bl-row[data-id="b"]').click(); await tick();
  w.JiwenDetail.closeDetail(); await tick();
  ok(title() === '昨天 · 10月22日 周四', '4 点一笔进单笔详情，关了回到这个面板的那一天');
  w.JiwenSheet.open = o0;
  // 5. 1025-UX：横着滑时内容跟着手指走；到头了只挪三成；松手不够弹回
  w.JiwenDetail.openWeek('2026-10-19'); await tick();
  const pane = () => body().querySelector('.wd-pane');
  const pe = (type, x, y) => body().dispatchEvent(new w.PointerEvent(type, { bubbles: true, clientX: x, clientY: y }));
  pe('pointerdown', 100, 300); pe('pointermove', 140, 302); pe('pointermove', 180, 304);
  ok(pane().style.transform === 'translateX(80px)', '5 往右拖 80px：内容跟着挪 80px（' + pane().style.transform + '）');
  pe('pointerup', 130, 304); await tick();
  ok(title() === '本周 · 10月19日–25日' && pane().style.transform === 'translateX(0)', '5 松手时只挪了 30px：不换，弹回原处');
  pe('pointerdown', 200, 300); pe('pointermove', 150, 300); pe('pointermove', 100, 300);
  ok(pane().style.transform === 'translateX(-30px)', '5 本周往左拖（没有下一周）：只挪三成，拉不动的感觉（' + pane().style.transform + '）');
  pe('pointerup', 100, 300); await tick();
  ok(title() === '本周 · 10月19日–25日', '5 到头了松手：不换 ' + title());
  pe('pointerdown', 100, 300); pe('pointermove', 100, 340); pe('pointermove', 105, 400);
  ok(!pane().style.transform || pane().style.transform === 'translateX(0)', '5 竖着拖（在滚列表）：内容不横着动');
  pe('pointerup', 105, 400); await tick();
  const css3 = [...d.querySelectorAll('style')].map(x => x.textContent).join('\n');
  ok(/\.wd-pane \{[^}]*touch-action:pan-y/.test(css3), '5 内容区只把竖着的滑动交给浏览器（横着的归自己，手指一直跟得上）');
  $('weekClose').click(); await tick();

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-L 一周详情：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
