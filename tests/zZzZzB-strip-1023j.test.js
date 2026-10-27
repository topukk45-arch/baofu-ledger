// @serial
// 1023-J 月份浮条和按下反馈（jsdom 跑整个 App；真等计时器）。node zZzZzB-strip-1023j.test.js [index.html]
// 1. 1025-UX：中间选中框，左右拨、松手停好了切到框里那个月；只认手指真拨过的（原来「打开 App 显示成最早的月份」是浏览器补发的滚动被当成切换）；点一下也切
// 2. 不画小柱子；统计页超了月预算的月份，字下面一个小红点
// 3. 回顶圆钮在浮条右上方（1025-UX）：滑过一屏才露出来、回到上面就藏；整页不满一屏时浮条一直显示（不收起）
// 4. 按下反馈：手指按住不动约 0.1 秒才变色；手指一挪、页面一滚就作废（滑动时碰到日卡片不闪）
// 记录全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = (id, time, money, cat, remark) => ({ id, time, money, type: 'expense', cat, remark });

(async () => {
  const recs = [
    R('a1', '2026-08-05T12:00', 30, '吃饭', '八月'),
    R('s1', '2026-09-10T12:00', 100, '吃饭', '九月聚餐'),
    R('o1', '2026-10-05T12:00', 20, '吃饭', '午饭'),
    R('o2', '2026-10-22T12:00', 15, '出行', '地铁'),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, null, { budgets: { '吃饭': 50 } }), before(w) {
    w.__y = 0; w.__sh = 3000;
    w.__ro = []; w.ResizeObserver = class { constructor(cb) { this.cb = cb; w.__ro.push(this); } observe(el) { this.el = el; } disconnect() {} };   // jsdom 没有，装一个能手动触发的
    Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
    Object.defineProperty(w.HTMLHtmlElement.prototype, 'scrollHeight', { get: () => w.__sh, configurable: true });   // 整页多高（jsdom 没有排版）
    w.scrollTo = (x, y) => { w.__y = typeof x === 'object' ? x.top : y; };
  } });
  const { $, d, w } = t;
  const on = id => $(id).classList.contains('show');
  const scroll = y => { w.__y = y; w.dispatchEvent(new w.Event('scroll')); };
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await sleep(50);

  // 1. 1025-UX：中间选中框、左右拨松手切（只认手指真拨过的）、点一下也切
  const strip = $('lgStrip'), items = () => [...strip.querySelectorAll('.ms-item')];
  const track = strip.querySelector('.ms-track');
  ok(track.firstElementChild.classList.contains('ms-pad') && track.lastElementChild.classList.contains('ms-pad'), '1 两头各垫一块空白（最早的月份和这个月都能拨到中间）');
  ok(items().map(b => b.dataset.ym).join() === '2026-08,2026-09,2026-10' && items()[2].classList.contains('on'), '1 最后一格是这个月、在选中框里');
  ok(strip.querySelector('.ms-sel') && !strip.querySelector('.ms-bar'), '1 中间一个选中框、没有小柱子');
  // jsdom 没有排版：给浮条一个宽度、每格一个位置（宽 300：空白 120、每格 56 + 间隔 2）
  const W = 300, PAD = 120;
  const lay = w0 => {
    Object.defineProperty(track, 'clientWidth', { get: () => w0, configurable: true });
    items().forEach((b, i) => { Object.defineProperty(b, 'offsetLeft', { get: () => PAD + 2 + i * 58, configurable: true }); Object.defineProperty(b, 'offsetWidth', { get: () => 56, configurable: true }); });
  };
  const at = i => PAD + 2 + i * 58 + 28 - W / 2;   // 第 i 格在正中时的 scrollLeft
  const touch = type => track.dispatchEvent(new w.Event(type, { bubbles: true }));
  const swipeTo = async (x, opt) => {
    lay(W); touch('touchstart'); track.scrollLeft = x; track.dispatchEvent(new w.Event('scroll'));
    if (opt && opt.hold) await sleep(opt.hold);
    touch('touchend'); await sleep(400); lay(W);
  };
  lay(W); w.JiwenLedger.stripWake();
  ok(Math.abs(track.scrollLeft - at(2)) < 1, '1 出来时把选中的这个月放到正中');
  track.scrollLeft = 0; track.dispatchEvent(new w.Event('scroll'));
  await sleep(400);
  ok(w.JiwenLedger.curYM() === '2026-10', '1 没碰它、浮条被滚到最左边（打开 App 时浏览器补发的滚动）：月份不变');
  await swipeTo(at(1));
  ok(w.JiwenLedger.curYM() === '2026-09' && $('lgMonth').textContent === '9月', '1 手指往右拨一格、松手：切到 9 月');
  ok(items()[1].classList.contains('on'), '1 9 月在选中框里');
  w.JiwenLedger.stripWake();
  await swipeTo(at(0) + 10, { hold: 300 });
  ok(w.JiwenLedger.curYM() === '2026-08', '1 拨到 8 月附近、按住停一下再松手：切到 8 月（停在两格中间的按最近的那格）');
  lay(W); touch('touchstart'); await sleep(50); touch('touchend'); await sleep(400);
  ok(w.JiwenLedger.curYM() === '2026-08', '1 只碰一下没拨：月份不变');
  lay(W); w.JiwenLedger.stripWake();
  touch('touchstart'); track.scrollLeft = at(2); track.dispatchEvent(new w.Event('scroll'));
  await sleep(400);
  ok(w.JiwenLedger.curYM() === '2026-08', '1 手指还按着：先不切');
  touch('touchend'); await sleep(400);
  ok(w.JiwenLedger.curYM() === '2026-10', '1 松手停好了：才切到 10 月');
  lay(0); w.JiwenLedger.stripWake();
  touch('touchstart'); track.scrollLeft = 0; track.dispatchEvent(new w.Event('scroll')); touch('touchend'); await sleep(400);
  ok(w.JiwenLedger.curYM() === '2026-10', '1 浮条宽度是 0（还没露出来）时的滚动：不切');
  lay(W); w.JiwenLedger.stripWake();
  items()[1].click();
  ok(w.JiwenLedger.curYM() === '2026-09' && items()[1].classList.contains('on') && $('lgMonth').textContent === '9月', '1 点 9 月：切过去');
  items()[2].click();
  ok(w.JiwenLedger.curYM() === '2026-10', '1 点最后一格：回到这个月');
  // 统计页同一个组件
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await sleep(50);
  { const sTr = $('stStrip').querySelector('.ms-track'), sIt = [...$('stStrip').querySelectorAll('.ms-item')];
    Object.defineProperty(sTr, 'clientWidth', { get: () => W, configurable: true });
    sIt.forEach((b, i) => { Object.defineProperty(b, 'offsetLeft', { get: () => PAD + 2 + i * 58, configurable: true }); Object.defineProperty(b, 'offsetWidth', { get: () => 56, configurable: true }); });
    w.dispatchEvent(new w.Event('scroll'));
    sTr.dispatchEvent(new w.Event('touchstart')); sTr.scrollLeft = at(1); sTr.dispatchEvent(new w.Event('scroll')); sTr.dispatchEvent(new w.Event('touchend'));
    await sleep(400);
    ok($('statMonthLabel').getAttribute('aria-label').includes('9月'), '1 统计页：左右拨松手也切月份');
    w.JiwenStats.stepMonth(1); }
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await sleep(50);

  // 2. 统计页：超预算的月份一个小红点（9 月吃饭 100 > 50）
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await sleep(50);
  const st = [...$('stStrip').querySelectorAll('.ms-item')];
  ok(st[1].classList.contains('over') && st[1].querySelector('.ms-dot') && !st[2].querySelector('.ms-dot') && !st[0].querySelector('.ms-dot'), '2 9 月超了预算：字下面一个小红点，别的月没有');
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/\.ms-dot\s*\{[^}]*background:var\(--c-neg\)[^}]*border:2px solid #fff/.test(css), '2 红点和「超支」同一个红（--c-neg），带一圈白边');
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await sleep(50);

  // 3. 回顶箭头、不满一屏一直显示
  scroll(100);
  ok(on('lgStrip') && !strip.classList.contains('has-top'), '3 没滑过一屏：没有回顶箭头');
  scroll(w.innerHeight + 50);
  ok(strip.classList.contains('has-top'), '3 滑过一屏：浮条右上方露出回顶圆钮');
  ok(strip.querySelector('.ms-totop') && !strip.querySelector('.ms-track .ms-top'), '3 回顶圆钮不在月份那一条里（1025-UX 挪出来，不占拨月份的地方）');
  strip.querySelector('.ms-top').click();
  ok(w.__y === 0, '3 点回顶箭头：回到顶上');
  scroll(0);
  ok(!strip.classList.contains('has-top'), '3 回到顶上：箭头藏起来');
  await sleep(1700);
  ok(!on('lgStrip'), '3 页面比一屏长：停 1.5 秒收起');
  w.__sh = w.innerHeight - 100; w.JiwenLedger.stripWake();
  await sleep(1700);
  ok(on('lgStrip'), '3 整页不满一屏：浮条一直显示，不收起');
  w.__sh = 3000; w.JiwenLedger.stripWake();
  await sleep(1700);
  ok(!on('lgStrip'), '3 又变长了：照常停 1.5 秒收起');
  // 1023-Q：页面后来自己变矮了（排版晚一拍、日卡片从估的高度变成真的），没有滚动也要钉住
  const ro = id => w.__ro.find(x => x.el && x.el.id === id);
  ok(ro('pageLedger') && ro('pageStats'), '3 账单页、统计页都盯着页面高度');
  w.__sh = w.innerHeight - 100; ro('pageLedger').cb([]);
  ok(on('lgStrip'), '3 页面自己变矮了：浮条马上出来');
  await sleep(1700);
  ok(on('lgStrip'), '3 不满一屏：一直显示（没有滚动、没有重画也一样）');
  w.__sh = 3000; ro('pageLedger').cb([]);
  await sleep(1700);
  ok(!on('lgStrip'), '3 又变长了：停 1.5 秒收起');

  // 4. 按下反馈
  const row = $('billList').querySelector('.bl-row');
  const fire = (type, x, y) => row.dispatchEvent(new w.PointerEvent(type, { bubbles: true, clientX: x, clientY: y }));
  fire('pointerdown', 100, 100);
  ok(!row.classList.contains('pressed'), '4 刚按下：先不变色');
  await sleep(150);
  ok(row.classList.contains('pressed'), '4 按住不动 0.1 秒：变色');
  fire('pointerup', 100, 100);
  ok(!row.classList.contains('pressed'), '4 松手：恢复');
  fire('pointerdown', 100, 100); fire('pointermove', 100, 130);
  await sleep(150);
  ok(!row.classList.contains('pressed'), '4 手指一挪（在滑）：不变色');
  fire('pointerup', 100, 130);
  fire('pointerdown', 100, 100); d.dispatchEvent(new w.Event('scroll'));
  await sleep(150);
  ok(!row.classList.contains('pressed'), '4 页面一滚：不变色');
  ok(!/\.bl-row:active/.test(css), '4 行上不再有 :active 变色');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-J 月份浮条：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
