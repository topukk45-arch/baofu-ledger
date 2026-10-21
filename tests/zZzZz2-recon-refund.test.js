// 1021-T22（实测 10-21 第 13 条）只对账：勾了原单，这一批里挂在它上面的退款一起补进（退款的单号也登记），不然支出多算；
// 没勾的原单，它的退款也不进。jsdom：清单那一行写「含退款 x 元」，不计的单独一组、默认不勾。node zZzZz2-recon-refund.test.js [index.html]。账单虚构。
const fs = require('fs'), path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), WR = require(path.join(IMP, 'write.js')), W = require(path.join(IMP, 'merchants.js'));
const A = require('./helpers/app');
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '购物', '其他'];
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商店', desc: '虚构商品', io: 'expense', fen: 43100, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const tx = [ali({ time: T(3, 1, 10) }), ali({ time: T(3, 2, 10), io: 'income', fen: 10000, desc: '退款-虚构商品' }),
  ali({ time: T(3, 5, 10), cp: '别的虚构店', desc: '别的商品', fen: 2000 }), ali({ time: T(3, 6, 10), cp: '别的虚构店', io: 'income', fen: 500, desc: '退款-别的商品' }),
  ali({ time: T(3, 7, 10), cp: '某虚构理财', kind: '投资理财', io: 'neutral', fen: 9900, desc: '转入' })];
const file = B.bill('alipay', tx, { range: RANGE }).bytes;
const parsed = P.parseFiles([{ name: 'a.csv', data: B.ab(file) }]);
const routed = R.route(parsed, { known: {}, rules: [] });
const matched = M.match(routed, parsed, { manual: [], cats: CATS, merchants: W });
const input = { parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] };
const p = PL.plan(input, {});
const ws = WR.build(input, p, { batch: 'b1', at: '2026-10-21T10:00' });
const key0 = p.rows.find(d => d.src === 'row' && d.fen === 43100).key;
const only = WR.onlyKeys(ws, [key0], { cps: [], pms: [] });
ok(only.records.length === 2 && only.records.some(r => r.refundOf && r.refundOf.tmp) && only.records.filter(r => r.type === 'expense').length === 1, '1 勾了 431 那笔：退款 100 一起补进（2 条）：' + only.records.map(r => r.type + r.money).join(','));
ok(only.orders.length === 2 && only.records.every(r => !r.refundOf || only.records.some(x => x.tmp === r.refundOf.tmp)), '1 退款的单号也登记，退款指着补进的原单');
ok(!only.records.some(r => r.money === 5), '1 没勾的原单，它的退款不进');
(async () => {
  const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([{ id: 1, time: '2026-01-05T09:00', money: 12, type: 'expense', cat: '餐饮', remark: '虚构手记' }], CATS), now: '2026-10-21T10:00:00' });
  await t.importFiles([['a.csv', file]], () => {}, { noGo: true, stay: true });
  t.$('impRecon').click();
  const rows = [...t.d.querySelectorAll('.imp-recon-row')];
  const r431 = rows.find(r => /431\.00/.test(r.textContent));
  ok(r431 && /含退款 100\.00 元/.test(r431.textContent), '2 清单那一行写「含退款 100.00 元」：' + (r431 && r431.textContent));
  const rn = rows.find(r => /99\.00/.test(r.textContent));
  ok(rn && !rn.querySelector('input').checked && t.d.querySelector('.imp-recon-neutral-t'), '2 不计的单独一组、默认不勾');
  // 1021-T25：点这一行（不是勾选框）看这笔账单的详情；点勾选框只勾、不开详情
  r431.querySelector('.grow').click();
  ok(t.$('impSheet') && /431\.00/.test(t.$('impSheet').textContent) && !r431.querySelector('input').checked, '2（T25）点这一行开详情、不勾');
  t.$('impSheetClose').click();
  r431.querySelector('input').click();
  ok(!(t.$('uiSheetMask') && t.$('uiSheetMask').classList.contains('open')), '2（T25）点勾选框不开详情');
  t.$('impGo').click(); if (t.$('impConfirmOk')) t.$('impConfirmOk').click();
  await t.until(() => t.$('impResult'), 20000);
  const recs = t.recs().filter(r => r.batch);
  ok(recs.length === 2 && recs.some(r => r.refundOf), '3 真写进去：原单 + 退款 2 条：' + recs.map(r => r.type + r.money).join(','));
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
