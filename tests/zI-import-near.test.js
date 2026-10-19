// 1.1（1016-X）金额相近配对加分类辅助（jsdom 跑整个 App，真导真撤）。node zI-import-near.test.js [index.html]
// 只有「账单不高于手记」（立减、红包）且分类对得上的才默认当已记过（和手记合并，手记金额不动）；账单比手记高、分类不一样、
// 几条手记都符合的仍进待处理；确认页一张卡、可一键改成实付金额（撤销时金额还原）；结果页写「N 笔手记比实付多 x 元，多半是立减」。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构面馆', desc: '牛肉面', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const p2 = n => String(n).padStart(2, '0');
const man = (id, d, money, o) => Object.assign({ id, time: `2026-10-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '面' }, o || {});

(async () => {
  // 1017-B：金额相近的、同一天手记比付款早 1 小时以上不再自动合并，n1 改成付款（12:10）后 10 分钟记，照旧测 1016-X 这条路
  const RECS = [man('n1', 5, 30, { time: '2026-10-05T12:20' }), man('n2', 7, 20), man('n3', 9, 50, { cat: '购物' }), man('n4', 11, 30), man('n5', 11, 31)];
  const BILL = [wx({ time: T(10, 5, 12, 10), fen: 2800 }), wx({ time: T(10, 7), fen: 2200 }), wx({ time: T(10, 9), fen: 4800 }), wx({ time: T(10, 11), fen: 2900 })];
  const F = [['微信.csv', B.bill('wechat', BILL, { range: RANGE }).bytes]];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS) });
  const { $ } = t;
  const D0 = await t.dump();
  let card = null, card2 = null;
  const r = await t.importFiles(F, S => {
    card = $('impNear') && $('impNear').textContent;
    $('impNearPay').click();
    card2 = $('impNear').textContent;
    $('impNearPay').click();
  }, { stay: true });
  const g = no => r.plan.rows.find(d => d.key === 'wechat|' + no);
  ok(g(BILL[0].no).group === 'merge' && g(BILL[0].no).into === 'n1' && g(BILL[0].no).why === 'near', '1 账单 28 < 手记 30、分类一样：默认当作记过（合并）');
  ok(g(BILL[1].no).group === 'pending', '1 账单 22 > 手记 20：仍进待处理');
  ok(g(BILL[2].no).group === 'pending', '1 分类不一样（手记是购物）：仍进待处理');
  ok(g(BILL[3].no).group === 'pending', '1 两条手记（30、31）都符合：不抢，进待处理');
  ok(card && /金额差一点的，当作你记过的（1 笔）/.test(card) && /手记比实付多 2\.00 元/.test(card) && /手记金额会改成实付/.test(card2), '2 确认页一张卡，能一键改成实付、再改回来');
  ok(/1 笔手记比实付多 2\.00 元，多半是立减/.test($('impResult').textContent), '3 结果页写「1 笔手记比实付多 2.00 元，多半是立减」');
  $('impBackToLedger').click(); await t.idle();
  const n1 = t.recs().find(x => x.id === 'n1');
  ok(n1.money === 30 && n1.time === '2026-10-05T12:10' && n1.src.merged, '3 合并：手记金额不动、时间改账单的');
  // 撤掉，再导一次选「改成实付」
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  let [lg] = await t.logs(); let p = await t.st().undoPlan(lg.b); await t.st().undo(p); await t.idle();
  ok(same(await t.dump(), D0), '4 撤销：回到导入前');
  await t.importFiles(F, S => { $('impNearPay').click(); });
  ok(t.recs().find(x => x.id === 'n1').money === 28, '4 选了「改成实付」：手记金额改成 28');
  [lg] = await t.logs(); p = await t.st().undoPlan(lg.b); await t.st().undo(p); await t.idle();
  ok(t.recs().find(x => x.id === 'n1').money === 30 && same(await t.dump(), D0), '4 撤销：金额还原成 30，和导入前逐字节一样');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
