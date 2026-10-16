// 1016-U 记住上次导到哪天（jsdom 跑整个 App）。node zE-import-last-to.test.js [index.html]
// 导入记录里多存每个来源各自的账单起止（rng）；下次确认页的文件卡上写「上次微信导到 YYYY-MM-DD，这之后的才是新的」，
// 整份都在那之前时写明；每个来源各算各的；只对账的不算；撤销了就退回去。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
let seq = 0;
const tx = (app, mo, d, fen) => B.txn({ time: { y: 2026, mo, d, h: 12, mi: 0, s: 0 }, kind: app === 'wechat' ? '商户消费' : '日用百货', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen, pm: '零钱', status: app === 'wechat' ? '支付成功' : '交易成功', mno: '',
  no: (app === 'wechat' ? '4200000000' : '2026') + String(++seq).padStart(app === 'wechat' ? 19 : 24, '0') });
const RANGE = mo => ({ from: `2026-${String(mo).padStart(2, '0')}-01 00:00:00`, to: `2026-${String(mo).padStart(2, '0')}-${mo === 11 ? 30 : 31} 23:59:59` });
const lastTo = t => [...t.d.querySelectorAll('.imp-last-to')].map(x => x.textContent);

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const OCT = [['微信10月.csv', B.bill('wechat', [tx('wechat', 10, 3, 1200)], { range: RANGE(10) }).bytes]];
  const NOV = [['微信11月.csv', B.bill('wechat', [tx('wechat', 11, 3, 1300)], { range: RANGE(11) }).bytes], ['支付宝11月.csv', B.bill('alipay', [tx('alipay', 11, 4, 1400)], { range: RANGE(11) }).bytes]];
  let txt = null;
  await t.importFiles(OCT, () => { txt = lastTo(t); });
  ok(txt.length === 0, '1 第一次导：没有「上次导到」');
  const [l1] = await t.logs();
  ok(l1.rng && l1.rng.wechat && l1.rng.wechat[0] === '2026-10-01' && l1.rng.wechat[1] === '2026-10-31' && !l1.rng.alipay, '1 导入记录里存了微信这一次的起止');
  await t.importFiles(NOV, () => { txt = lastTo(t); }, { noGo: true });
  ok(txt.length === 1 && txt[0] === '上次微信导到 2026-10-31，这之后的才是新的', '2 再导 11 月：微信那张卡写「上次微信导到 2026-10-31，这之后的才是新的」，支付宝没有 ' + JSON.stringify(txt));
  await t.importFiles(OCT, () => { txt = lastTo(t); }, { noGo: true });
  ok(txt.length === 1 && /都在那之前/.test(txt[0]), '2 再导 10 月那份：写明都在那之前 ' + JSON.stringify(txt));
  // 只对账的不算
  await t.importFiles(NOV, S => {}, { noGo: true, stay: true });
  t.$('impRecon').click();
  t.d.querySelector('.imp-recon-row input').click();
  t.$('impGo').click();
  await t.until(() => t.$('impResult'));
  t.$('impBackToLedger').click(); await t.idle();
  await t.importFiles(NOV, () => { txt = lastTo(t); }, { noGo: true });
  ok(txt.length === 1 && /导到 2026-10-31/.test(txt[0]), '3 只对账导过 11 月：「上次导到」还是 10-31 ' + JSON.stringify(txt));
  // 撤销以后退回去
  await t.w.eval('loadImportUI')();
  for (const l of (await t.logs()).reverse()) { const p = await t.st().undoPlan(l.b); await t.st().undo(p); await t.idle(); }
  await t.importFiles(NOV, () => { txt = lastTo(t); }, { noGo: true });
  ok(txt.length === 0, '4 都撤了：没有「上次导到」');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
