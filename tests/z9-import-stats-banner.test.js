// 1016-P 统计页待处理横幅（jsdom 跑整个 App）。node z9-import-stats-banner.test.js [index.html]
// 在统计页看某个月、这个月有待处理条目时，顶上一条细横幅「本月还有 N 笔导入账单待确认，共 x 元 [去处理]」；
// 没有的月份不显示；点「去处理」打开待处理页；处理掉以后横幅跟着变；开发开关关着时不显示。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = txns => B.bill('wechat', txns, { range: RANGE }).bytes;
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, cat) => ({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: cat || '吃饭', remark: '手记' });

(async () => {
  const RECS = [man('m1', 10, 5, 30, '购物'), man('m2', 10, 1, 50), man('m3', 12, 3, 9)];   // 1.1 起金额相近、分类对得上的会自动合并；这里要的是「待你确认」，分类故意不一样
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS) });
  const { $, d } = t;
  await t.importFiles([['微信.csv', bill([wx({ time: T(10, 5, 12, 10), cp: '某虚构面馆', fen: 2950 }), wx({ time: T(10, 6), cp: '某虚构饭店', fen: 5000 })])]]);
  ok((await t.st().pendingRead()).length === 2, '准备：10 月两笔待处理');
  const banner = () => $('statPendBanner');
  const settle = async () => { await t.idle(); await new Promise(r => setTimeout(r, 20)); await t.idle(); };
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await settle();
  ok(!banner(), '1 12 月没有待处理：不显示横幅');
  $('statPrevM').click(); $('statPrevM').click(); await settle();
  ok(banner() && banner().textContent.includes('本月还有 2 笔导入账单待确认，共 79.50 元') && $('statPendGo'), '1 翻到 10 月：横幅「本月还有 2 笔导入账单待确认，共 79.50 元」 ' + (banner() && banner().textContent));
  ok(banner() && banner().parentNode === $('statPaneFlow') && banner() === $('statPaneFlow').firstChild, '1 横幅在统计页最上面');
  $('statPrevM').click(); await settle();
  ok(!banner(), '1 9 月：不显示');
  $('statNextM').click(); await settle();
  ok(!!banner(), '1 回到 10 月：又显示');
  // 去处理
  $('statPendGo').click();
  await t.until(() => d.querySelectorAll('.imp-pend').length === 2);
  ok($('impPage').style.display === 'block' && $('impTitle').textContent === '待处理', '2 点「去处理」打开待处理页');
  d.querySelector('.imp-pend .imp-pend-drop').click();
  await t.until(() => d.querySelectorAll('.imp-pend').length === 1);
  await t.back(); await settle();
  ok(banner() && banner().textContent.includes('本月还有 1 笔'), '2 处理掉一笔回来：横幅变成 1 笔');
  // 开发开关关掉：不显示
  t.w.localStorage.removeItem('app_dev_import');
  $('statNextM').click(); $('statPrevM').click(); await settle();
  ok(!banner(), '3 开发开关关着：不显示横幅');
  t.w.localStorage.setItem('app_dev_import', '1');
  $('statNextM').click(); $('statPrevM').click(); await settle();
  ok(!!banner(), '3 再打开：显示');
  // 首页（账单页）没有红点之类的东西
  ok(!d.querySelector('#pageLedger #statPendBanner') && !/待确认/.test(($('pageLedger') || d.body).textContent.replace(banner() ? banner().textContent : '', '')), '3 首页不加提醒');

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
