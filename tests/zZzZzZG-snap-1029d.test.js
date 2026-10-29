// 1029-D 启动页第二轮（jsdom，记录全是虚构的）。node -r ./tools/inline-hook.js zZzZzZG-snap-1029d.test.js [index.html]
// 1. 进账号那次原样写回存档（enterAccount 的 saveStoreSafe）不删首屏快照；记一笔照旧删，停 0.5 秒存上新的。
// 2. 性能记录「启动」那条多一段「取文件：网页 x · CSS x→y · 脚本 x→y（n 个比 CSS 先到）」，老记录不写。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const { chip } = require('./helpers/rec');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const NOW = '2026-10-20T10:00:00';
const recs = Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 19).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: 'expense', cat: ['吃饭', '购物'][i % 2], remark: '虚构' + i }));
const KEY = 'app_snap_' + A.ID;
const wait = ms => new Promise(r => setTimeout(r, ms));
function bootWith(ls, phone) {
  return A.boot({ html, www: WWW, seed: ls, phone, now: NOW, before(w) {
    w.Capacitor.Plugins.Launch = { ready() { return Promise.resolve(); } };
    w.__snapRemoved = 0;
    const rm = w.Storage.prototype.removeItem;
    w.Storage.prototype.removeItem = function (k) { if (k === KEY && this.getItem(k) != null) w.__snapRemoved++; return rm.call(this, k); };
  } });
}
const snap = t => { try { return JSON.parse(t.w.localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
const poke = t => t.d.body.dispatchEvent(new t.w.Event('pointerdown', { bubbles: true }));

(async () => {
  // 1. 先存一份快照
  let t = await bootWith(A.seedOf(recs, null, null));
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); poke(t);
  await wait(800);
  const s0 = snap(t);
  ok(s0 && s0.src === 'idle', '1 停 0.5 秒存上了快照');
  // 被杀以后重开：进账号（自动登录）写了一次存档，快照不删
  const ls = {}; for (let i = 0; i < t.w.localStorage.length; i++) { const k = t.w.localStorage.key(i); if (!/^store_/.test(k)) ls[k] = t.w.localStorage.getItem(k); }
  t.w.close();
  t = await bootWith(ls, t.phone);
  await t.idle();
  ok(t.w.__bootSnap, '1 重开用上了快照');
  ok(t.w.__snapRemoved === 0 && snap(t) && snap(t).at === s0.at, `1 进账号 → 什么都不做：快照还在、没被删（删了 ${t.w.__snapRemoved} 次）`);
  // 进账号 → 记一笔：快照删掉，停 0.5 秒存上新的
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await wait(100);
  t.$('fabAdd').click(); await wait(420); t.w.kpClose();
  t.$('billMoney').value = '12.5';
  [...t.$('billTypeChips').children].find(c => c.textContent === '支出').click();
  chip(t.d, 'billCatChips', '吃饭').click();
  t.$('addBill').click(); await t.idle();
  ok(!snap(t) && t.w.__snapRemoved >= 1, '1 记了一笔：快照删掉');
  await wait(700);
  const s1 = snap(t);
  ok(s1 && s1.src === 'idle' && s1.at > s0.at && (s1.html.match(/class="bl-row"/g) || []).length === 21, '1 停 0.5 秒：存上了新的（21 条），不受 20 秒间隔限制');

  // 2. 性能记录：取文件那一段
  const log = [
    { kind: '启动', ms: 600, script: 400, paint: 600, ts: Date.now(), fx: { doc: 120, cq: 130, ce: 430, jq: 135, je: 410, jn: 22 } },
    { kind: '启动', ms: 500, script: 300, paint: 500, ts: Date.now() - 1000 },
  ];
  t.w.localStorage.setItem('app_perf_log', JSON.stringify(log));
  t.w.openPerfPage(); await wait(50);
  const txt = [...t.d.querySelectorAll('#uiSheetBody')].map(x => x.textContent).join('\n');
  ok(txt.includes('取文件：网页 120 · CSS 130→430 · 脚本 135→410（22 个比 CSS 先到）'), '2 启动那条写取文件');
  ok((txt.match(/取文件：/g) || []).length === 1, '2 老记录（没有 fx）不写');
  // base.js 真记：jsdom 没有 Resource Timing 时不记、不报错
  const p = JSON.parse(t.w.localStorage.getItem('app_perf_log') || '[]');
  ok(Array.isArray(p), '2 性能记录读得出来');

  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
