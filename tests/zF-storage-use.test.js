// 1016-V 设置里的「存储已用 x%」（jsdom 跑整个 App，假的 navigator.storage）。node zF-storage-use.test.js [index.html]
// 开着开发开关时，设置页「存档管理」里显示「存储已用 x%（约 a MB / 共 b MB）」，超过 70% 加一行提醒；
// 开关关着、或拿不到配额时不显示。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const MB = 1048576;

(async () => {
  const est = { usage: 30 * MB, quota: 100 * MB };
  const before = w => { Object.defineProperty(w.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage: est.usage, quota: est.quota }) } }); };
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), before });
  const { $, d } = t;
  const reopen = async () => { d.querySelector('.tab-btn[data-tab="ledger"]').click(); d.querySelector('.tab-btn[data-tab="settings"]').click(); await t.idle(); await new Promise(r => setTimeout(r, 10)); };
  await reopen();
  ok($('storageUsePct') && $('storageUsePct').textContent === '存储已用 30.0%（约 30.0 MB / 共 100 MB）' && !$('storageUseWarn'), '1 显示「存储已用 30.0%」，没超 70% 不提醒：' + ($('storageUsePct') && $('storageUsePct').textContent));
  ok($('storageUse').previousSibling === $('devLogsBtn'), '1 放在「导入记录」下面');
  est.usage = 75 * MB; await reopen();
  ok(/存储已用 75\.0%/.test($('storageUsePct').textContent) && $('storageUseWarn') && /空间快满了/.test($('storageUseWarn').textContent), '2 超过 70%：加一行提醒');
  est.quota = 0; await reopen();
  ok(!$('storageUse'), '3 拿不到配额：不显示');
  est.quota = 100 * MB;
  t.w.localStorage.removeItem('app_dev_import'); await reopen();
  ok(!$('storageUse'), '4 开发开关关着：不显示');
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  ok(!t2.$('storageUse'), '3 没有 navigator.storage：不显示');
  ok(!t.errs.length && !t2.errs.length, '无报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
