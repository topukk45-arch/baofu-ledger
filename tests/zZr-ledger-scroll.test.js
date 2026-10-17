// 1017-F 账单页切走再切回来不跳（jsdom 跑整个 App；滚动位置用假的 scrollY / scrollTo 记下来）。node zZr-ledger-scroll.test.js [index.html]
// 离开账单页（切到统计、设置，或进「日子」管理页）时记下滚到哪了，回来直接放回原处，中间不经过顶上；别的页面照旧回到顶上。
// 真浏览器里的量法（412×970）见提交说明。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = Array.from({ length: 60 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 28).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: 'expense', cat: '吃饭', remark: '虚构' + i }));

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs), before(w) {
    w.__y = 0; w.__calls = [];
    Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
    w.scrollTo = (x, y) => { const v = typeof x === 'object' ? x.top : y; w.__calls.push(v); w.__y = v; };
  } });
  const w = t.w, tab = n => t.d.querySelector('.tab-btn[data-tab="' + n + '"]').click();
  const frame = () => new Promise(r => w.requestAnimationFrame(() => setTimeout(r, 0)));
  tab('ledger'); await frame();
  // 1. 账单页滚到 1500 → 统计 → 回账单：直接回到 1500，中间没有回到顶上
  w.__y = 1500;
  tab('stats'); await frame();
  ok(w.__y === 0, '1 去统计页：统计页从顶上开始');
  w.__y = 300; w.__calls = [];
  tab('ledger'); await frame();
  ok(w.__y === 1500 && w.__calls.length && w.__calls.every(v => v === 1500), '1 回账单页：放回 1500，中间不经过顶上 ' + JSON.stringify(w.__calls));
  // 2. 设置页来回一样
  w.__y = 820;
  tab('settings'); await frame();
  w.__calls = [];
  tab('ledger'); await frame();
  ok(w.__y === 820 && w.__calls.every(v => v === 820), '2 设置页来回：放回 820');
  // 3. 进「日子」管理页再返回
  w.__y = 640;
  t.$('daysManageBtn').click(); await frame();
  ok(w.__y === 0, '3 进日子管理页：从顶上开始');
  w.__calls = [];
  t.$('daysBack').click(); await frame();
  ok(w.__y === 640 && w.__calls.every(v => v === 640), '3 从日子管理页返回：放回 640');
  // 4. 在账单页点底栏「账单」：位置不动
  w.__y = 700; w.__calls = [];
  tab('ledger'); await frame();
  ok(w.__y === 700, '4 已经在账单页再点「账单」：位置不动');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
