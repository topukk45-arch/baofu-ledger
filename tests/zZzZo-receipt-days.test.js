// 1021-T9（实测 10-20 第 2 轮）收款按天合并新规则：支付宝也认收款（原始分类「收入」+ 商品说明有收钱码 / 收款）；
// 一天 ≥ 5 笔、每笔 ≤ 200 元才建议合，只合小额、大额单列，默认不合；一个月 300 条以上照旧整月按天合、默认合。
// node zZzZo-receipt-days.test.js [index.html]。账单全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '购物', '其他', '工资'];
let seq = 0;
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h, mi: mi || 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '收入', cp: '某顾客', desc: '收钱码收款', io: 'income', fen: 175, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const go = (txns, edits) => {
  const parsed = P.parseFiles([{ name: 'a.csv', data: B.ab(B.bill('alipay', txns, { range: RANGE }).bytes) }]);
  const routed = R.route(parsed, { known: {} });
  const matched = M.match(routed, parsed, { manual: [], cats: CATS, merchants: W });
  return { routed, plan: PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, edits || {}) };
};
// 3-31 那天：4 笔小额 + 一笔 4000（像报告里那天）→ 不够 5 笔小额，不建议
{
  const r = go([175, 175, 7220, 14440, 400000].map((f, i) => ali({ time: T(3, 31, 9 + i), fen: f })));
  ok(r.routed.summaries.length === 0, '1 一天 4 笔小额 + 一笔 4000：不建议合（大额不算进 5 笔）');
}
// 一天 6 笔小额 + 1 笔 300 元：只合 6 笔小额，300 单列；默认不合
{
  const tx = [100, 200, 300, 400, 500, 600].map((f, i) => ali({ time: T(4, 1, 9 + i), fen: f })).concat([ali({ time: T(4, 1, 18), fen: 30000 })]);
  const r = go(tx);
  ok(r.routed.summaries.length === 1 && r.routed.summaries[0].count === 6 && !r.routed.summaries[0].bulk, '2 一天 6 笔小额：建议合这 6 笔（300 元那笔单列）');
  ok(r.plan.sections.receipt && r.plan.sections.receipt.on === false && r.plan.summaries.length === 0, '2 默认不合');
  const r2 = go(tx, { receipt: true });
  ok(r2.plan.summaries.length === 1 && r2.plan.records === 2, '2 勾上「按天合并」：6 笔合成 1 条 + 300 那笔，共 2 条记录');
}
// 支付宝「收入」但不是收钱码（比如理财收益）不算收款
{
  const r = go([1, 2, 3, 4, 5, 6].map(i => ali({ time: T(5, 1, 9 + i), desc: '收益发放', cp: '某理财' })));
  ok(r.routed.summaries.length === 0, '3 支付宝「收入」但商品说明不是收钱码 / 收款：不算收款');
}
ok(R.RECEIPT_DAY_MIN === 5 && R.RECEIPT_ITEM_FEN === 20000, '4 门槛是常量：5 笔、200 元');

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
