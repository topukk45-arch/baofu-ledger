// 第二期（1016-Z6）账单详情里拆开合并（jsdom 跑整个 App，真导真拆真撤）。node zQ-import-split.test.js [index.html]
// 详情里一行浅色「来自微信账单」/「已和微信账单合并」，手记不显示；合并过的（开着开发开关）有「拆开」：
// 手记还原成合并前的样子，账单另记一条（1017-Q 起分类用手记的、带那次的批次号，单号改登记到它）；再导同一份账单一条不新增；撤销那次导入后和导入前逐字节一样；
// 旧版本的导入记录没存账单：只还原手记、单号拿掉，再导时那笔作为新增出现；开关关着没有「拆开」。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = (d, h, mi, fen, cp) => B.txn({ time: { y: 2026, mo: 10, d, h, mi, s: 0 }, kind: '商户消费', cp, desc: '午饭', io: 'expense', fen, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') });
const M1 = { id: 'm1', time: '2026-10-05T08:30', money: 30, type: 'expense', cat: '吃饭', remark: '面条' };

(async () => {
  const BL = [wx(5, 12, 10, 3000, '某虚构面馆'), wx(6, 9, 0, 1200, '某虚构书店')];
  const F = [['微信.csv', B.bill('wechat', BL, { range: RANGE }).bytes]];
  const M2 = { id: 'm2', time: '2026-09-01T08:30', money: 8, type: 'expense', cat: '吃饭', remark: '豆浆' };
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([M1, M2]) });
  const { $ } = t;
  const D0 = await t.dump();
  await t.importFiles(F);
  ok(t.recs().find(r => r.id === 'm1').src.merged, '准备：面条那条和账单合并了');
  const [lg0] = await t.logs();
  ok(lg0.chg[0].bills && lg0.chg[0].bills[0].fen === 3000 && lg0.chg[0].bills[0].time === '2026-10-05T12:10', '准备：导入记录里存了合并进去的账单');
  // 详情
  t.w.openDetail('m1');
  ok($('detailSrc') && /已和微信账单合并/.test($('detailSrc').textContent) && $('detailSplit'), '1 详情里写「已和微信账单合并」，有「拆开」');
  const other = t.recs().find(r => r.money === 12);
  t.w.openDetail(other.id);
  ok(/^来自微信账单$/.test($('detailSrc').textContent) && !$('detailSplit'), '1 导入新建的：「来自微信账单」，没有拆开');
  t.w.openDetail('m1');
  $('detailSplit').click();
  await t.until(() => t.ask()); await t.askOk();
  await t.until(() => t.ask()); const msg = t.ask().msg; await t.askOk();
  const m1 = t.recs().find(r => r.id === 'm1'), nb = t.recs().find(r => r.money === 30 && r.id !== 'm1');
  ok(/拆开了/.test(msg) && same(m1, M1), '2 拆开：你记的那条完全还原成合并前');
  ok(nb && nb.cat === M1.cat && M1.cat !== '未分类' && nb.time === '2026-10-05T12:10' && nb.src.app === 'wechat' && nb.batch === lg0.b && nb.remark === '午饭', '2 账单另记一条：分类用手记的（1017-Q 起，原来落未分类）、账单时间、来源、那次的批次号');
  const T1 = await t.st().ordersRead();
  ok(T1.get('wechat', BL[0].no).id === nb.id, '2 单号改登记到新的那条');
  const [lg1] = await t.logs();
  ok(!lg1.chg.length && lg1.add.includes(nb.id) && lg1.h.length === lg1.add.length, '2 导入记录：不再记这条手记的改动，新的那条记进新增');
  const r2 = await t.importFiles(F, null, { noGo: true });
  ok(r2.plan.counts.add === 0 && r2.plan.counts.merge === 0, '3 再导同一份账单：一条不新增、不再合并');
  await t.w.eval('loadImportUI')();
  const p = await t.st().undoPlan(lg1.b); await t.st().undo(p); await t.idle();
  ok(same(await t.dump(), D0), '4 撤销那次导入：和导入前逐字节一样');
  // 旧的导入记录没存账单
  await t.importFiles(F);
  const logs = await t.logs();
  logs[0].chg.forEach(c => { delete c.bills; });
  await t.st().importsWrite(undefined, logs);
  t.w.openDetail('m1');
  $('detailSplit').click();
  await t.until(() => t.ask()); await t.askOk();
  await t.until(() => t.ask()); const msg2 = t.ask().msg; await t.askOk();
  ok(/没存账单本身/.test(msg2) && same(t.recs().find(r => r.id === 'm1'), M1) && !t.recs().some(r => r.money === 30 && r.id !== 'm1'), '5 旧导入记录：只还原手记、不另记');
  const r5 = await t.importFiles(F, null, { noGo: true });
  ok(r5.plan.rows.find(d => d.key === 'wechat|' + BL[0].no).group === 'merge', '5 单号拿掉了：再导时那笔重新出现（又和手记配上了）');
  // 开关关着：再合并一次，关掉开关看详情
  await t.importFiles(F);
  t.w.localStorage.removeItem('app_dev_import');
  t.w.openDetail('m1');
  ok($('detailSrc') && /已和微信账单合并/.test($('detailSrc').textContent) && !$('detailSplit'), '6 开发开关关着：只写来源，没有「拆开」');
  t.w.openDetail('m2');
  ok(!$('detailSrcField'), '6 没来源的手记：不显示这一行');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
