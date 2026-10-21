// 1021-T17（实测 10-21，364 那笔）付给个人 / 转账付出去的钱，对方 3 天内转回来一部分：当作那笔的退款；几笔都够就进待处理让你选。
// 支付宝商品说明「退款」开头的退款先配金额正好等于原单的（全额退款），再配部分退款，免得部分退款先占了全额退款那张。
// 验收：两张 431 + 431 退款 + 364 → 一对全额退款都跳过，364 挂到 17:55 那张，净花 67，分类里只记 67。
// node zZzZx-person-refund.test.js [index.html]。账单虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), WR = require(path.join(IMP, 'write.js')), W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h, mi, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '交通出行', '其他'];
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const ali = o => B.txn(Object.assign({ kind: '转账红包', cp: '虚*', desc: '火车票', io: 'expense', fen: 43100, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
function run(tx) {
  const parsed = P.parseFiles([{ name: '支付宝.csv', data: B.ab(B.bill('alipay', tx, { range: RANGE }).bytes) }]);
  const routed = R.route(parsed, { known: {}, rules: [] });
  const matched = M.match(routed, parsed, { manual: [], cats: CATS, merchants: W });
  const input = { parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] };
  const plan = PL.plan(input, {});
  const at = { parsed, routed, plan, input };
  at.row = no => { const f = parsed.files[0]; const i = f.rows.findIndex(r => r.no === no); return plan.rows.find(d => d.file === 0 && d.row === i); };
  return at;
}
// ===== 1. 验收那一组：364 在 431 退款之前（按时间排 364 先到）=====
{
  const a1 = ali({ time: T(2, 9, 13, 45) }), a2 = ali({ time: T(2, 9, 17, 55) });
  const back = ali({ time: T(2, 9, 18, 28), io: 'income', fen: 36400, desc: '转账' });
  const rf = ali({ time: T(2, 10, 9, 0), io: 'income', desc: '退款-火车票' });
  const x = run([a1, a2, back, rf]);
  const d1 = x.row(a1.no), d2 = x.row(a2.no), db = x.row(back.no), dr = x.row(rf.no);
  ok(d1.group === 'skip' && dr.group === 'skip' && /全额退款/.test(d1.reason), '1 13:45 那张和 431 退款一对，都跳过：' + d1.group + ' / ' + dr.group + ' ' + dr.reason);
  ok(d2.group === 'add' && db.group === 'refund' && db.refundTo && db.refundTo.row.row === d2.row, '1 364 挂到 17:55 那张：' + db.group + ' ' + db.reason);
  ok(/17:55/.test(db.reason) && /退款/.test(db.reason), '1 明细里写清挂到哪笔：' + db.reason);
  const ws = WR.build(x.input, x.plan, { batch: 'b1', at: '2026-10-21T10:00' });
  const exp = ws.records.filter(r => r.type === 'expense').reduce((s, r) => s + Math.round(r.money * 100), 0);
  const ref = ws.records.filter(r => r.type === 'income' && r.refundOf).reduce((s, r) => s + Math.round(r.money * 100), 0);
  ok(exp - ref === 6700 && ws.records.filter(r => r.type === 'income' && !r.refundOf).length === 0, '1 净花 67：支出 ' + exp + ' − 退款 ' + ref);
}
// ===== 2. 几笔原单都够 → 进待处理让你选 =====
{
  const a1 = ali({ time: T(3, 1, 10, 0), fen: 20000 }), a2 = ali({ time: T(3, 1, 11, 0), fen: 30000 });
  const back = ali({ time: T(3, 2, 10, 0), io: 'income', fen: 5000, desc: '转账' });
  const x = run([a1, a2, back]), db = x.row(back.no);
  ok(db.group === 'pending' && db.cands && db.cands.length === 2, '2 两笔都够退：进待处理让你选（' + db.group + '）');
}
// ===== 3. 超过 3 天、比原单多、不是同一个人、对方不是个人也不是转账：照旧是收入 =====
{
  const a1 = ali({ time: T(4, 1, 10, 0), fen: 20000 });
  const late = ali({ time: T(4, 5, 10, 0), io: 'income', fen: 5000, desc: '转账' });
  const more = ali({ time: T(4, 2, 10, 0), io: 'income', fen: 25000, desc: '转账' });
  const other = ali({ time: T(4, 2, 11, 0), io: 'income', fen: 1000, cp: '别*', desc: '转账' });
  const shop = ali({ time: T(4, 3, 10, 0), kind: '日用百货', cp: '虚构商店', fen: 9000 }), shopBack = ali({ time: T(4, 3, 12, 0), kind: '日用百货', cp: '虚构商店', io: 'income', fen: 1000, desc: '补差价' });
  const x = run([a1, late, more, other, shop, shopBack]);
  ok([late, more, other, shopBack].every(t => x.row(t.no).group === 'add'), '3 不符合的照旧是收入：' + [late, more, other, shopBack].map(t => x.row(t.no).group).join(','));
}
// ===== 4. 商品说明「退款」开头的退款：先配正好全额的 =====
{
  const a1 = ali({ time: T(5, 1, 10, 0), kind: '交通出行', cp: '虚构票务', desc: '车票' }), a2 = ali({ time: T(5, 1, 12, 0), kind: '交通出行', cp: '虚构票务', desc: '车票' });
  const part = ali({ time: T(5, 1, 18, 0), kind: '交通出行', cp: '虚构票务', io: 'income', fen: 36400, desc: '退款-车票' });
  const full = ali({ time: T(5, 2, 9, 0), kind: '交通出行', cp: '虚构票务', io: 'income', desc: '退款-车票' });
  const x = run([a1, a2, part, full]);
  ok(x.row(a1.no).group === 'skip' && x.row(full.no).group === 'skip' && x.row(part.no).group === 'refund' && x.row(part.no).refundTo.row.row === x.row(a2.no).row,
    '4 全额退款先配 10:00 那张，部分退款挂 12:00 那张：' + [a1, a2, part, full].map(t => x.row(t.no).group).join(','));
}
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
