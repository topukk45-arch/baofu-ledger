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

  // 1. 翻到第 2 页：✕ 出现，停下 1.5 秒淡出
  t.$('pagerBottom').querySelector('button:last-child').click();
  ok(on('clearFilterFab'), '1 翻页后 ✕ 出现');
  await sleep(1000);
  ok(on('clearFilterFab'), '1 1 秒时还在');
  await sleep(700);
  ok(!on('clearFilterFab'), '1 停下 1.5 秒后淡出');

  // 2. 滑动：✕ 和 ↑ 一起出现，一直滑一直在，停下 1.5 秒一起淡出
  scroll(1500, -800);
  ok(on('clearFilterFab') && on('toTopBtn'), '2 滑动时 ✕ 和 ↑ 都出现');
  for (let k = 0; k < 4; k++) { await sleep(500); scroll(1500 + k * 100, -900 - k * 100); }
  ok(on('clearFilterFab') && on('toTopBtn'), '2 连着滑 2 秒，一直都在');
  await sleep(1700);
  ok(!on('clearFilterFab') && !on('toTopBtn'), '2 停下 1.5 秒后一起淡出');

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

  // 4. 第 1 页、没筛选：滑动只出 ↑、不出 ✕；滑回「账单」标题附近 ↑ 立刻收起
  t.$('clearFilterFab').click(); await sleep(50);
  ok(!on('clearFilterFab'), '4 点 ✕ 回到第 1 页后 ✕ 收起');
  scroll(1400, -700);
  ok(on('toTopBtn') && !on('clearFilterFab'), '4 没筛选：滑动只出 ↑');
  scroll(200, 100);
  ok(!on('toTopBtn'), '4 滑回「账单」标题附近：↑ 立刻收起');

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
  ok(/\.to-top\s*\{[^}]*pointer-events:none/.test(css) && /\.clear-filter-fab\s*\{[^}]*pointer-events:none/.test(css), '6 没出现时 pointer-events:none，不挡下面的记录');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
