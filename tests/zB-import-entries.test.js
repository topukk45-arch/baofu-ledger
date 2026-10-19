// 1016-R 新用户「怎么开始」和空账本小入口（jsdom 跑整个 App）。node zB-import-entries.test.js [index.html]
// 新建账号进去以后问一次「怎么开始？」（导入微信、支付宝账单 / 从零开始记），选导入打开导入页；只在新建这一次问；
// 空账本（少于 5 条）上方有「有微信、支付宝账单？可以一次导进来 ›」，记到 5 条消失；开发开关关着时两样都没有。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const p2 = n => String(n).padStart(2, '0');
const man = (id, d) => ({ id, time: `2026-10-${p2(d)}T08:30`, money: 10, type: 'expense', cat: '吃饭', remark: '手记' });

async function newAccount(t, name) {
  t.$('newAccountBtn').click();
  await t.until(() => t.ask());
  t.$('askInput').value = name; t.$('askInput').dispatchEvent(new t.w.Event('input'));
  await t.askOk();
  await t.until(() => t.w.eval('JiwenBase.currentUser') && t.$('mainBox').style.display === 'block');
  await t.idle(); await new Promise(r => setTimeout(r, 30));
}

(async () => {
  // ===== 1. 开着开发开关：新建账号问一次 =====
  {
    const t = await A.boot({ html, www: WWW, seed: { app_dev_import: '1' } });
    await newAccount(t, '小红');
    const q = t.ask();
    ok(q && /怎么开始/.test(q.msg) && t.$('askOk').textContent === '导入微信、支付宝账单' && t.$('askCancel').textContent === '从零开始记', '1 新账号进去问「怎么开始？」：' + (q && q.msg));
    await t.askOk();
    await t.until(() => t.$('impPage') && t.$('impPage').style.display === 'block' && t.$('impPick'));
    ok(t.$('impPage').style.display === 'block', '1 选「导入」打开导入页');
    await t.back();
    // 空账本小入口
    ok(t.$('impEmptyEntry') && /一次导进来/.test(t.$('impEmptyEntry').textContent), '2 空账本上方有小入口');
    t.$('impEmptyEntry').click();
    await t.until(() => t.$('impPage').style.display === 'block' && t.$('impPick'));
    ok(t.$('impPage').style.display === 'block', '2 点小入口打开导入页');
    await t.back();
    // 再开一次 App：不再问
    const t2 = await A.boot({ html, www: WWW, phone: t.phone, seed: {} , before: (w) => {} });
    ok(!t2.ask(), '1 重开 App 不再问');
    // 记到 5 条：入口消失
    const id = t.w.eval('JiwenBase.currentUser');
    await (async () => { const s = t.w.JiwenStore.loadStore(id); const a = Object.values(s.archives)[0]; a.records = [1, 2, 3, 4].map(i => man('r' + i, i)); t.w.JiwenStore.saveStore(s, id); t.w.eval('JiwenLedger.renderBill')(); await t.idle(); })();
    ok(!!t.$('impEmptyEntry'), '2 4 条：入口还在');
    await (async () => { const s = t.w.JiwenStore.loadStore(id); const a = Object.values(s.archives)[0]; a.records = [1, 2, 3, 4, 5].map(i => man('r' + i, i)); t.w.JiwenStore.saveStore(s, id); t.w.eval('JiwenLedger.renderBill')(); await t.idle(); })();
    ok(!t.$('impEmptyEntry'), '2 记到 5 条：入口消失');
    // 从零开始记：不打开导入页
    await newAccount(t, '小刚');
    ok(t.ask() && /怎么开始/.test(t.ask().msg), '1 又建一个账号：问');
    await t.askCancel();
    ok(!t.$('impPage') || t.$('impPage').style.display !== 'block', '1 选「从零开始记」：不打开导入页');
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }
  // ===== 3. 开发开关关着：不问、没有入口 =====
  {
    const t = await A.boot({ html, www: WWW, seed: {} });
    await newAccount(t, '小兰');
    ok(!t.ask(), '3 开关关着：新建账号不问');
    ok(!t.$('impEmptyEntry'), '3 开关关着：空账本没有小入口');
    // 设置里连点版本号打开开关：入口出现
    t.d.querySelector('.tab-btn[data-tab="settings"]').click();
    // 测试里的时钟每读一次走 1 秒，连点 5 次要先把它停住
    const tap5 = async () => { const dn = t.w.Date.now; let k = 0; t.w.Date.now = () => 1790000000000 + (k++); for (let i = 0; i < 5; i++) t.$('setBuild').click(); t.w.Date.now = dn; await t.until(() => t.ask()); await t.askOk(); };
    await tap5();
    ok(!!t.$('impEmptyEntry'), '3 打开开关：空账本小入口跟着出现');
    await tap5();
    ok(!t.$('impEmptyEntry'), '3 关掉开关：小入口消失');
    ok(!t.errs.length, '3 无报错 ' + t.errs.join('|'));
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
