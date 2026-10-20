// 1021-T6（实测 10-20 第 1 轮）待处理里的退款写「退款 +x」，「不要了」先问一句（不要了账本就少记一笔收入）。
// jsdom 跑整个 App、真导。node zZzZl-pending-refund-ui.test.js [index.html]。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '某虚构商场', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
// 两笔不一样的原单都够退 → 退款进待处理让你选
const TX = [ali({ time: T(5, 9), desc: '衣服', fen: 30000 }), ali({ time: T(5, 10), desc: '鞋', fen: 40000 }),
            ali({ time: T(6, 9), desc: '退款-某虚构商场', io: 'neutral', status: '退款成功', fen: 10000 })];
const F = [['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], ['未分类', '购物', '其他']), now: '2026-10-20T10:00:00' });
  const { $ } = t, qa = s => Array.from(t.d.querySelectorAll(s));
  await t.importFiles(F);
  const pend = await t.st().pendingRead();
  ok(pend.length === 1 && pend[0].io === 'income', '0 退款进了待处理（收入）');
  t.w.JiwenImportUI.openPending(); await t.until(() => qa('.imp-pend').length);
  const card = qa('.imp-pend')[0];
  ok(/退款 \+100\.00/.test(card.textContent), '1 写「退款 +100.00」：' + card.querySelector('.imp-line').textContent);
  const drop = card.querySelector('.imp-pend-drop');
  ok(drop.classList.contains('warn'), '1 退款的「不要了」是警示色');
  drop.click(); await t.until(() => t.ask());
  ok(/这是一笔退款，不要了账本就少记 100\.00 元收入/.test(t.ask().msg), '2 先问一句：' + t.ask().msg.split('\n')[0]);
  await t.askCancel();
  ok((await t.st().pendingRead()).length === 1, '2 点了「取消」：还在待处理');
  qa('.imp-pend')[0].querySelector('.imp-pend-drop').click(); await t.until(() => t.ask()); await t.askOk();
  await t.until(async () => true); await new Promise(r => setTimeout(r, 100));
  ok((await t.st().pendingRead()).length === 0, '3 确认了才不要');

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
