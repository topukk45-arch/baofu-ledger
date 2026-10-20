// 1021-T2（实测 10-20 第 1 轮）支付宝退款「先定性、再清洗」：商品说明以「退款」开头、单号不带「_后缀」的退款行也认成退款，
// 方向一律收入；配原单：单号 → 商家订单号 → 同一份文件里兜底（60 天、剩下能退的够、商品说明或对方对得上）→ 账本 → 往来。
// 几笔一模一样的原单挂最早那笔；差额拆解按「头部扣不扣这种退款」几种算法试，用对得上的那种。
// node zZzZh-ali-refund-desc.test.js [index.html]。账单全是虚构的（照支付宝的格式编的，不是真实数据）。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js'));
const R = require(path.join(IMP, 'route.js'));
const M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js'));
const W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h, mi, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '购物', '出行', '其他', '红包', '工资'];
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const mno = () => 'T2026' + String(++seq).padStart(15, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const parse = (txns, opts) => P.parseFiles([{ name: '支付宝.csv', data: B.ab(B.bill('alipay', txns, Object.assign({ range: RANGE }, opts || {})).bytes) }]);
const route = parsed => R.route(parsed, { known: {}, rules: [] });
function by(parsed, res) {
  const m = {};
  res.items.forEach(it => { if (it.src === 'row') { const row = parsed.files[it.file].rows[it.row]; m[row.no] = Object.assign({ r: row }, it); } });
  return m;
}
const refNo = (parsed, ref) => parsed.files[ref.file].rows[ref.row].no;
// 含义核对：商品说明以「退款」开头的行，最后不许是支出、不许在 fullnorefund 里
const meaningOk = (parsed, res) => res.items.every(it => {
  if (it.src !== 'row') return true; const r = parsed.files[it.file].rows[it.row];
  if (!/^退款/.test(r.desc) || r.io === 'expense') return true;
  return it.io !== 'expense' && it.why !== 'fullnorefund';
});

// ===== 1. 盒马那种：退款行单号和原单不一样（不带后缀）、不计收支、退款成功；商家订单号一样 → 按商家订单号挂上 =====
{
  const m1 = mno();
  const o = ali({ time: T(9, 28, 13, 15), cp: '盒马', desc: '盒马工坊 酱猪耳等', kind: '餐饮美食', fen: 6706, mno: m1 });
  const rf = ali({ time: T(9, 28, 13, 41), cp: '盒马', desc: '退款-盒马工坊 酱猪耳', kind: '退款', io: 'neutral', status: '退款成功', fen: 31, mno: m1 });
  const parsed = parse([o, rf]), res = route(parsed), b = by(parsed, res);
  ok(b[rf.no].bucket === 'refund' && b[rf.no].why === 'matched' && refNo(parsed, b[rf.no].refundTo.row) === o.no, '1 不带后缀的退款按商家订单号挂到原单：' + b[rf.no].bucket + '/' + b[rf.no].why);
  ok(b[rf.no].io === 'income' && /商家订单号/.test(b[rf.no].msg), '1 方向是收入，写明按商家订单号配上的');
  ok(b[o.no].bucket === 'add' && b[o.no].io === 'expense', '1 原单照常新增（支出）');
  ok(!res.items.some(it => it.why === 'fullnorefund'), '1 没有「已全额退款，退款不在文件里」');
  ok(meaningOk(parsed, res), '1 含义核对：退款开头的行不是支出');
}

// ===== 2. 商家订单号对不上：同一份文件里兜底，按对方 / 商品说明找 60 天内、剩下能退的够的那笔 =====
{
  const o = ali({ time: T(4, 22, 20, 41), cp: '淘宝闪购', desc: '盒马鲜生 果切', fen: 7460, mno: mno() });
  const other = ali({ time: T(4, 20, 9, 0), cp: '别的店', desc: '别的东西', fen: 5000 });
  const rf = ali({ time: T(4, 22, 20, 59), cp: '淘宝闪购', desc: '退款-盒马鲜生 果切', kind: '退款', io: 'neutral', status: '退款成功', fen: 44, mno: mno() });
  const parsed = parse([other, o, rf]), res = route(parsed), b = by(parsed, res);
  ok(b[rf.no].bucket === 'refund' && refNo(parsed, b[rf.no].refundTo.row) === o.no, '2 兜底按对方 / 商品说明挂到 4-22 那笔');
  ok(meaningOk(parsed, res), '2 含义核对');
}

// ===== 3. 12306 退票那种：交易成功 + 收入 + 单号不带后缀 → 也是退款；部分退（191 → 153）挂原单 =====
{
  const o = ali({ time: T(2, 22, 15, 52), cp: '某票务平台', desc: '演出门票', kind: '文化休闲', fen: 19100 });
  const rf = ali({ time: T(2, 22, 21, 36), cp: '某票务平台', desc: '退款-演出门票', kind: '退款', io: 'income', status: '交易成功', fen: 15300 });
  const parsed = parse([o, rf]), res = route(parsed), b = by(parsed, res);
  ok(b[rf.no].bucket === 'refund' && b[rf.no].why === 'matched' && refNo(parsed, b[rf.no].refundTo.row) === o.no, '3 交易成功 + 收入的退款也挂上原单（部分退）');
  ok(b[o.no].bucket === 'add', '3 部分退款：原单照常新增');
  // 全额退：一对两条都跳过
  const o2 = ali({ time: T(9, 1, 10, 0), cp: '铁路12306', desc: '火车票', kind: '交通出行', fen: 5000 });
  const r2 = ali({ time: T(9, 3, 9, 0), cp: '铁路12306', desc: '退款-火车票', kind: '交通出行', io: 'income', status: '交易成功', fen: 5000 });
  const p2 = parse([o2, r2]), res2 = route(p2), b2 = by(p2, res2);
  ok(b2[r2.no].bucket === 'skip' && b2[r2.no].why === 'fullrefund' && b2[o2.no].why === 'fullrefund', '3 全额退款的一对两条都跳过');
}

// ===== 4. 两笔一模一样的原单（同对方、同金额、同商品说明、同一天）+ 一笔部分退款 → 挂最早那笔，写明 =====
{
  const a = ali({ time: T(2, 9, 9, 12), cp: '个人卖家', desc: '车票', kind: '交通出行', fen: 43100 });
  const c = ali({ time: T(2, 9, 9, 30), cp: '个人卖家', desc: '车票', kind: '交通出行', fen: 43100 });
  const rf = ali({ time: T(2, 10, 8, 12), cp: '个人卖家', desc: '退款-车票', kind: '退款', io: 'neutral', status: '退款成功', fen: 40000 });
  const parsed = parse([a, c, rf]), res = route(parsed), b = by(parsed, res);
  ok(b[rf.no].bucket === 'refund' && refNo(parsed, b[rf.no].refundTo.row) === a.no, '4 两笔一模一样，挂到最早那笔');
  ok(/2 笔一模一样，挂到了 2-09 09:12 那笔/.test(b[rf.no].msg), '4 写明挂到了哪笔：' + b[rf.no].msg);
  ok(b[c.no].bucket === 'add', '4 另一笔照常新增');
  // 两笔不一样（金额不同）都够退 → 进待处理让你选
  const x = ali({ time: T(3, 1, 9, 0), cp: '某商场', desc: '衣服', fen: 30000 }), y = ali({ time: T(3, 1, 10, 0), cp: '某商场', desc: '鞋', fen: 40000 });
  const rz = ali({ time: T(3, 2, 9, 0), cp: '某商场', desc: '退款-某商场', io: 'neutral', status: '退款成功', fen: 10000 });
  const p2 = parse([x, y, rz]), r2 = by(p2, route(p2));
  ok(r2[rz.no].bucket === 'pending' && r2[rz.no].why === 'ambiguous' && r2[rz.no].cands.length === 2 && r2[rz.no].io === 'income', '4 几笔不一样的候选 → 待处理让你选（收入）');
}

// ===== 5. 同一份文件里没有原单 / 超过 60 天 / 剩下的不够退：不挂，交给账本（needLedger）、最后往来 =====
{
  const old = ali({ time: T(1, 1, 9, 0), cp: '虚构超市', desc: '日用品', fen: 9000 });
  const rf = ali({ time: T(3, 15, 9, 0), cp: '虚构超市', desc: '退款-日用品', io: 'neutral', status: '退款成功', fen: 500 });
  const small = ali({ time: T(3, 14, 9, 0), cp: '另一家', desc: '水果', fen: 300 });
  const rf2 = ali({ time: T(3, 15, 10, 0), cp: '另一家', desc: '退款-水果', io: 'neutral', status: '退款成功', fen: 400 });
  const parsed = parse([old, rf, small, rf2]), res = route(parsed), b = by(parsed, res);
  ok(b[rf.no].bucket === 'refund' && !b[rf.no].refundTo && b[rf.no].mode === 'flow' && b[rf.no].flags.includes('needLedger'), '5 超过 60 天不挂，交给账本找、找不到按往来');
  ok(b[rf2.no].bucket === 'refund' && !b[rf2.no].refundTo, '5 原单剩下的不够退，不挂');
  const m = M.match(res, parsed, { manual: [], cats: CATS, merchants: W, refundCands: [] });
  const mi = m.items.find(it => it.key === b[rf.no].key);
  ok(mi.why === 'noorig' && mi.mode === 'flow', '5 账本里也没有 → 往来、「没找到原单」');
  const m2 = M.match(res, parsed, { manual: [], cats: CATS, merchants: W, refundCands: [{ id: 'r1', time: '2026-02-01T09:00', type: 'expense', fen: 500, refunded: 0, cp: '虚构超市', cat: '购物' }] });
  ok(m2.items.find(it => it.key === b[rf.no].key).refundTo.record === 'r1', '5 账本里以前导入的同对方、同金额那笔 → 挂上');
  ok(meaningOk(parsed, res), '5 含义核对');
}

// ===== 6. 原单自己「退款成功」、商品说明不以退款开头、没有退款行 → 照旧「已全额退款」进待处理（支出），文案不变 =====
{
  const o = ali({ time: T(5, 1, 9, 0), cp: '虚构商户', desc: '耳机', status: '退款成功', fen: 20000 });
  const parsed = parse([o]), b = by(parsed, route(parsed));
  ok(b[o.no].bucket === 'pending' && b[o.no].why === 'fullnorefund' && b[o.no].io === 'expense', '6 真的原单已全额退款：照旧待处理、支出');
  ok(R.lookups(parsed).fullRefunds.length === 1, '6 lookups 照旧去查以前的退款');
  // 原单退款成功 + 不带后缀的退款行一样多 → 两条都跳过（不进 fullnorefund）
  const o2 = ali({ time: T(5, 2, 9, 0), cp: '虚构商户', desc: '耳机', status: '退款成功', fen: 20000 });
  const r2 = ali({ time: T(5, 3, 9, 0), cp: '虚构商户', desc: '退款-耳机', io: 'neutral', status: '退款成功', fen: 20000 });
  const p2 = parse([o2, r2]), b2 = by(p2, route(p2));
  ok(b2[o2.no].bucket === 'skip' && b2[r2.no].bucket === 'skip' && b2[r2.no].why === 'refundedpair', '6 原单退款成功 + 退款行 → 两条都跳过');
  ok(R.lookups(p2).fullRefunds.length === 1 && !R.lookups(p2).fullRefunds.some(f => f.no === r2.no), '6 退款行自己不当「已全额退款的原单」去查');
}

// ===== 7. 老写法（单号 = 原单号_后缀）照旧 =====
{
  const o = ali({ time: T(6, 1, 9, 0), fen: 3000 });
  const rf = ali({ time: T(6, 2, 9, 0), no: o.no + '_R1', desc: '退款-虚构商品', io: 'neutral', status: '退款成功', fen: 1000 });
  const parsed = parse([o, rf]), res = route(parsed), rows = res.items.filter(it => it.src === 'row').map(it => Object.assign({ r: parsed.files[0].rows[it.row] }, it));
  ok(rows.find(x => !x.r.noRest).bucket === 'add' && rows.some(x => x.r.noRest === '_R1' && x.bucket === 'refund' && x.why === 'matched'), '7 带后缀的照旧按单号挂');
  ok(R.isAliRefundDescRow('alipay', { noRest: '', io: 'neutral', desc: '退款-x' }) === PL.isAliRefundDesc({ noRest: '', io: 'neutral', desc: '退款-x' })
     && R.isAliRefundDescRow('alipay', { noRest: '', io: 'expense', desc: '退款-x' }) === PL.isAliRefundDesc({ noRest: '', io: 'expense', desc: '退款-x' })
     && R.isAliRefundDescRow('alipay', { noRest: '_1', io: 'neutral', desc: '退款-x' }) === PL.isAliRefundDesc({ noRest: '_1', io: 'neutral', desc: '退款-x' }), '7 route.js 和 plan.js 认退款的规则一样');
  ok(R.stripRefund('退款-盒马工坊 酱猪耳') === '盒马工坊 酱猪耳' && R.stripRefund('退款') === '', '7 去掉「退款-」只在显示 / 归组用');
}

// ===== 8. 差额拆解：头部扣不扣这种退款，几种算法试，用对得上的（aliMode）=====
{
  const mk = () => {
    const o = ali({ time: T(7, 1, 9, 0), cp: '虚构超市', desc: '日用品', fen: 9000 });
    const rn = ali({ time: T(7, 2, 9, 0), cp: '虚构超市', desc: '退款-日用品', io: 'neutral', status: '退款成功', fen: 500 });
    const ri = ali({ time: T(7, 3, 9, 0), cp: '虚构超市', desc: '退款-日用品', io: 'income', status: '交易成功', fen: 300 });
    return [o, rn, ri];
  };
  const planOf = (txns, over) => {
    const parsed = parse(txns, { statsOverride: over }), routed = route(parsed);
    const matched = M.match(routed, parsed, { manual: [], cats: CATS, merchants: W });
    return PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, {});
  };
  const a = mk(), pa = planOf(a, { expense: [1, 9000 - 800] });
  ok(pa.files[0].diff.expense.aliMode === 'all' && pa.files[0].diff.expense.unreadable === 0, '8 头部扣了全部退款 → all，差 0 分');
  const b = mk(), pb = planOf(b, { expense: [1, 9000 - 500] });
  ok(pb.files[0].diff.expense.aliMode === 'neutral' && pb.files[0].diff.expense.unreadable === 0, '8 头部只扣了不计收支的 → neutral，差 0 分');
  const c = mk(), pc = planOf(c, { expense: [1, 9000] });
  ok(pc.files[0].diff.expense.aliMode === 'suffix' && pc.files[0].diff.expense.unreadable === 0, '8 头部没扣 → suffix，差 0 分');
  const d = [ali({ time: T(7, 1, 9, 0), fen: 9000 })], pd = planOf(d);
  ok(pd.files[0].diff.expense.aliMode === undefined, '8 没有这种退款：不写用了哪种');
  ok(['expense', 'income', 'neutral'].every(io => pa.files[0].diff[io].unreadable === 0 || !pa.files[0].diff[io].header), '8 收入、不计收支两栏也差 0 分');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
