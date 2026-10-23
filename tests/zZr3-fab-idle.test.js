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

  // 1. 打开账单页：月份浮条先露 1.5 秒（1023-G 起清筛选的 ✕ 去掉了，账单页右下角只剩它）
  d.querySelector('.tab-btn[data-tab="settings"]').click(); await sleep(20);
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await sleep(50);
  ok(on('lgStrip') && !t.$('clearFilterFab'), '1 打开账单页：月份浮条露出来；没有 ✕ 了');
  await sleep(1000);
  ok(on('lgStrip'), '1 1 秒时还在');
  await sleep(700);
  ok(!on('lgStrip'), '1 停下 1.5 秒后收起');

  // 2. 滑动：浮条出来，一直滑一直在，停下 1.5 秒收起；账单页没有 ↑ 了
  scroll(1500, -800);
  ok(on('lgStrip') && !on('toTopBtn') && t.$('lgStrip').classList.contains('has-top'), '2 滑动时浮条出来，右下角单独的 ↑ 不出；滑过一屏，浮条右端有 ↑（1023-J）');
  for (let k = 0; k < 4; k++) { await sleep(500); scroll(1500 + k * 100, -900 - k * 100); }
  ok(on('lgStrip') && !on('toTopBtn'), '2 连着滑 2 秒，一直都在');
  await sleep(1700);
  ok(!on('lgStrip') && !on('toTopBtn'), '2 停下 1.5 秒后收起');

  // 3. 手指碰着浮条不收，松开重新计时
  scroll(1600, -950);
  t.$('lgStrip').dispatchEvent(new w.Event('pointerdown'));
  await sleep(1700);
  ok(on('lgStrip'), '3 按着不放：不收');
  t.$('lgStrip').dispatchEvent(new w.Event('pointerup'));
  await sleep(1000);
  ok(on('lgStrip'), '3 松开 1 秒还在');
  await sleep(700);
  ok(!on('lgStrip'), '3 松开 1.5 秒后收起');

  // 4. 搜一笔开着：盖住账单页，浮条不出来
  t.$('filterFab').click(); await sleep(20);
  ok(t.w.JiwenSearch.isOpen() && d.body.classList.contains('search-open'), '4 搜一笔开着');
  t.$('searchToLedger').click(); await sleep(300);
  ok(!t.w.JiwenSearch.isOpen() && !d.body.classList.contains('search-open') && t.$('pageSearch').hidden, '4 回到账单：结果页收起');
  scroll(1400, -700);
  ok(on('lgStrip') && !on('toTopBtn'), '4 回到账单再滑：浮条出来');
  await sleep(1700);

  // 5. 统计页：1023-J 起 ↑ 收进月份浮条右端（滑过一屏才露出来，回到上面就藏），右下角单独的 ↑ 不再出
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await sleep(50);
  const hasTop = id => t.$(id).classList.contains('has-top');
  scroll(w.innerHeight + 100);
  ok(on('stStrip') && hasTop('stStrip') && !on('toTopBtn') && !d.body.classList.contains('tab-ledger'), '5 统计页滑过一屏：浮条出来、右端有 ↑；右下角单独的 ↑ 不出');
  await sleep(1700);
  ok(!on('stStrip') && !on('toTopBtn'), '5 统计页停下 1.5 秒后浮条连 ↑ 一起淡出');
  scroll(100);
  ok(on('stStrip') && !hasTop('stStrip'), '5 统计页回到上面：浮条在，↑ 藏起来');
  t.$('stStrip').querySelector('.ms-top').click();
  ok(w.__y === 0, '5 点浮条右端的 ↑：回到顶上');

  // 6. 淡出后不挡点击（样式里 .show 才 pointer-events:auto）
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/\.to-top\s*\{[^}]*pointer-events:none/.test(css) && /\.mstrip\s*\{[^}]*pointer-events:none/.test(css), '6 没出现时 pointer-events:none，不挡下面的记录（月份浮条也是）');
  ok(/body:not\(\.tab-ledger\) #lgStrip[^{]*\{ display:none !important; \}/.test(css), '6 不在账单页时月份浮条整个不显示');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
