// 1017-N 右下角圆钮滑动时出现、停下 1.5 秒淡出（jsdom 跑整个 App；真等 1.6 秒）。node zZr3-fab-idle.test.js [index.html]
// 账单页清筛选 ✕、账单页和统计页的回到顶部 ↑ 都照统计页回到本月 ✕（1010-K2）的规矩：有动作才出现，停下 1.5 秒淡出，
// 手指按在圆钮上时不淡出、松开重新计时。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = Array.from({ length: 160 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 28).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: 'expense', cat: ['吃饭', '出行'][i % 2], remark: '虚构' + i }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs), before(w) {
    w.__y = 0; w.__headTop = 300;
    Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
    w.scrollTo = (x, y) => { w.__y = typeof x === 'object' ? x.top : y; };
  } });
  const w = t.w, d = t.d;
  t.$('billHead').getBoundingClientRect = () => ({ top: w.__headTop, bottom: w.__headTop + 30, left: 0, right: 400, width: 400, height: 30 });
  const on = id => t.$(id).classList.contains('show');
  const scroll = (y, headTop) => { w.__y = y; if (headTop != null) w.__headTop = headTop; w.dispatchEvent(new w.Event('scroll')); };
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await sleep(50);

  // 1. 筛选生效：✕ 出现，停下 1.5 秒淡出（1023-C 起没有翻页了，改用筛选）
  t.$('filterFab').click(); t.$('searchKeyword').value = '虚构'; t.$('sheetApply').click();
  ok(on('clearFilterFab'), '1 筛选后 ✕ 出现');
  await sleep(1000);
  ok(on('clearFilterFab'), '1 1 秒时还在');
  await sleep(700);
  ok(!on('clearFilterFab'), '1 停下 1.5 秒后淡出');

  // 2. 筛选时滑动：✕ 出现，一直滑一直在，停下 1.5 秒淡出；账单页没有 ↑ 了，月份浮条也不出（列的是全部月份里命中的）
  scroll(1500, -800);
  ok(on('clearFilterFab') && !on('toTopBtn') && !on('lgStrip'), '2 滑动时 ✕ 出现，↑、月份浮条不出（1023-C）');
  for (let k = 0; k < 4; k++) { await sleep(500); scroll(1500 + k * 100, -900 - k * 100); }
  ok(on('clearFilterFab') && !on('toTopBtn'), '2 连着滑 2 秒，✕ 一直都在');
  await sleep(1700);
  ok(!on('clearFilterFab') && !on('toTopBtn'), '2 停下 1.5 秒后淡出');

  // 3. 手指按在 ✕ 上不淡出，松开重新计时
  scroll(1600, -950);
  t.$('clearFilterFab').dispatchEvent(new w.Event('pointerdown'));
  await sleep(1700);
  ok(on('clearFilterFab'), '3 按着不放：不淡出');
  t.$('clearFilterFab').dispatchEvent(new w.Event('pointerup'));
  await sleep(1000);
  ok(on('clearFilterFab'), '3 松开 1 秒还在');
  await sleep(700);
  ok(!on('clearFilterFab'), '3 松开 1.5 秒后淡出');

  // 4. 没筛选：滑动出月份浮条、不出 ✕ 和 ↑；停下 1.5 秒收起，手指碰着它不收（1023-C）
  t.$('clearFilterFab').click(); await sleep(1700);
  ok(!on('clearFilterFab') && !on('lgStrip'), '4 点 ✕ 清掉筛选后 ✕ 收起');
  scroll(1400, -700);
  ok(on('lgStrip') && !on('toTopBtn') && !on('clearFilterFab'), '4 没筛选：滑动只出月份浮条');
  t.$('lgStrip').dispatchEvent(new w.Event('pointerdown')); await sleep(1700);
  ok(on('lgStrip'), '4 手指碰着月份浮条：不收');
  t.$('lgStrip').dispatchEvent(new w.Event('pointerup')); await sleep(1700);
  ok(!on('lgStrip'), '4 松开 1.5 秒后收起');

  // 5. 统计页：↑ 一样，✕ 不出
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await sleep(50);
  scroll(900);
  ok(on('toTopBtn') && !on('clearFilterFab'), '5 统计页滑过 400：↑ 出现，清筛选 ✕ 不出');
  await sleep(1700);
  ok(!on('toTopBtn'), '5 统计页停下 1.5 秒后 ↑ 淡出');
  scroll(100);
  ok(!on('toTopBtn'), '5 统计页回到上面：↑ 不出');

  // 6. 淡出后不挡点击（样式里 .show 才 pointer-events:auto）
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/\.to-top\s*\{[^}]*pointer-events:none/.test(css) && /\.clear-filter-fab\s*\{[^}]*pointer-events:none/.test(css) && /\.mstrip\s*\{[^}]*pointer-events:none/.test(css), '6 没出现时 pointer-events:none，不挡下面的记录（月份浮条也是）');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
