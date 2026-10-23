// 1017-M 账单翻页只换列表那几行（jsdom 跑整个 App；滚动用假的 scrollY / scrollTo 记下来）。node zZr2-ledger-pager.test.js [index.html]
// 翻页时总览、日子、筛选小计的元素一个都不换，列表以外的地方不出现任何改动（动画、字号这类样式不会被重新加上），
// 1023-A 起只有列表下面一排按钮（每页 50），点了直接（不带动画）跳到新一页第一行、点的还是原来那个按钮。
// 真浏览器里的量法（412×970）见提交说明。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recOf = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 28).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: i % 7 ? 'expense' : 'income', cat: i % 7 ? ['吃饭', '出行', '购物'][i % 3] : '工资', remark: '虚构' + i }));
const before = w => {
  w.__y = 500; w.__calls = []; w.__siv = 0;
  Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
  w.scrollTo = (x, y) => { const o = typeof x === 'object' ? x : { top: y }; w.__calls.push(o); w.__y = o.top; };
};

(async () => {
  // 1023-A：每页 50 条、页码只在列表下面一排（原来上下各一排、每页 15）；160 条 = 4 页，最后一页 10 条
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recOf(160)), before });
  const w = t.w, d = t.d;
  w.HTMLElement.prototype.scrollIntoView = function () { w.__siv++; };
  const frame = () => new Promise(r => w.requestAnimationFrame(() => setTimeout(r, 0)));
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await frame();
  const bot = t.$('pagerBottom');
  const info = b => b.querySelector('.page-info').textContent;
  ok(!t.$('pager') && info(bot) === '第 1 / 4 页', '0 只有下面一排翻页按钮 ' + info(bot));
  ok(!!bot.closest('#pageLedger') && bot.previousElementSibling.id === 'billList', '0 那排在列表正下方');
  ok(t.$('billList').querySelectorAll('.bl-row').length === 50, '0 一页 50 条');
  ok(t.$('billList').firstElementChild.classList.contains('bl-day'), '0 按天分组，第一行是组头');

  // 记下上面几块现在的元素，再盯着列表以外有没有任何改动
  const cards = ['summaryOverall', 'daysEntryRows', 'summaryFilter', 'batchBar'];
  const snap = () => cards.map(id => [...t.$(id).childNodes]);
  const s0 = snap(), html0 = cards.map(id => t.$(id).outerHTML);
  const muts = [];
  const mo = new w.MutationObserver(list => list.forEach(m => {
    const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (el.closest('#billList, #pagerBottom, #pagerPad, #clearFilterFab')) return;
    muts.push((el.id || el.className || el.tagName) + ':' + m.type + (m.attributeName ? ':' + m.attributeName : ''));
  }));
  mo.observe(d.body, { subtree: true, childList: true, attributes: true, characterData: true });

  // 1. 「下一页」点 3 次：直接跳到新一页第一行，不带动画
  const nextBot = bot.querySelector('button:last-child');
  const rows0 = t.$('billList').innerHTML;
  w.__calls = []; w.__y = 4000;
  for (let k = 0; k < 3; k++) { bot.querySelector('button:last-child').click(); await frame(); }
  ok(info(bot) === '第 4 / 4 页', '1 翻到第 4 页 ' + info(bot));
  ok(t.$('billList').innerHTML !== rows0 && t.$('billList').querySelectorAll('.bl-row').length === 10, '1 列表换成了第 4 页 ' + t.$('billList').querySelectorAll('.bl-row').length);
  ok(bot.querySelector('button:last-child') === nextBot, '1 点的按钮还是原来那个（没重建）');
  ok(nextBot.disabled && !bot.querySelector('button:first-child').disabled, '1 最后一页：下一页灰掉、上一页能点');
  const last = w.__calls[w.__calls.length - 1];
  ok(last && last.behavior === 'instant', '1 跳到新一页第一行、不带动画 ' + JSON.stringify(w.__calls));
  ok(w.__siv === 0, '1 不用平滑滚动');
  await frame();
  const s1 = snap();
  ok(s1.every((a, i) => a.length === s0[i].length && a.every((n, j) => n === s0[i][j])), '1 总览、日子、筛选小计的元素一个都没换');
  ok(cards.every((id, i) => t.$(id).outerHTML === html0[i]), '1 上面几块的内容、样式一点没变');
  ok(!muts.length, '1 列表以外没有任何改动（不会重新加动画、字号这类样式） ' + muts.slice(0, 5).join(' | '));
  ok(!d.querySelector('#pageLedger .in-next, #pageLedger .in-prev, #pageLedger [style*="animation"]'), '1 账单页上没有带动画的东西');

  // 2. 「上一页」
  bot.querySelector('button:first-child').click(); await frame();
  ok(info(bot) === '第 3 / 4 页', '2 上一页 ' + info(bot));
  ok(!muts.length, '2 列表以外还是没有改动 ' + muts.slice(0, 5).join(' | '));
  mo.disconnect();

  // 3. 改筛选这类照旧整页重画：清掉筛选（✕）以后总览重画、回到第 1 页
  t.$('clearFilterFab').click(); await frame();
  ok(info(bot) === '第 1 / 4 页', '3 ✕ 以后回到第 1 页');
  ok(t.$('summaryOverall').firstElementChild !== s0[0][0], '3 整页重画时总览照旧重画');
  ok(t.$('pagerPad').style.height === '', '3 整页重画时垫子收掉');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));

  // 4. 只有一页：不显示
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(recOf(50)), before });
  ok(t2.$('pagerBottom').innerHTML === '', '4 只有一页时不显示翻页');
  ok(!t2.errs.length, '4 无报错 ' + t2.errs.join('|'));

  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
