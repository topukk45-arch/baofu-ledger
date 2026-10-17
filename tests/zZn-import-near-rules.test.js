// 1017-A 起「金额差一点」的三条收紧（第四轮真机试用）。node zZn-import-near-rules.test.js [index.html]
//   15（1017-A）：金额相近的自动合并只限同一天或手记晚 1 天；晚 2–3 天的进待你确认，写「金额差 x 元、晚 N 天记的」
//   16（1017-C）：差额正好是另一笔小钱（同一对方、前后 1 小时内、不超过金额相近的容差）时，先当「几笔加起来」，不当金额相近
//   17（1017-B）：金额相近的，同一天手记比付款早超过 1 小时也不自动合并，写「你记的比付款早 N 小时」；手记正好 00:00 的不拦
// 解析 → 定去向 → 配对 → 方案，纯计算。账单、手记、对方、金额全是虚构的。
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
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '吃饭', '购物', '出行', '游戏', '其他'];  // 吃饭 = 你说的「餐饮」
const RULES = [{ kw: '某虚构超市', cat: '购物' }, { kw: '某虚构面馆', cat: '吃饭' }, { kw: '某虚构游戏', cat: '游戏' }, { kw: '某虚构外卖平台', cat: '吃饭' }, { kw: '某虚构便利店', cat: '吃饭' }];
let seq = 0;
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, hm, fen, cat, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T${hm}`, type: 'expense', fen, cat, mode: 'normal' }, o || {});

function run(txns, manual) {
  const parsed = P.parseFiles([{ name: '账单1', data: B.ab(B.bill('wechat', txns, { range: RANGE }).bytes) }]);
  const routed = R.route(parsed, { known: {}, rules: [] });
  const matched = M.match(routed, parsed, { manual, cats: CATS, rules: RULES, merchants: W, isNewUser: false, trace: true });
  const manualById = {}; manual.forEach(m => { manualById[m.id] = m; });
  const item = txn => matched.items.find(it => it.src === 'row' && parsed.files[it.file].rows[it.row].no === txn.no);
  return { parsed, matched, item, plan: e => PL.plan({ parsed, matched, info: { cats: CATS, isNewUser: false }, manualById, overlaps: [] }, e) };
}

(() => {
// ===== 15. 金额相近的自动合并只限同一天或手记晚 1 天 =====
{
  // 你给的结构：手记 3-8 19:13 购物 10.00「药」，账单 3-5 11:07 某超市 9.40（晚 3 天、差 0.60、分类一样）
  const b = wx({ time: T(3, 5, 11, 7), cp: '某虚构超市', desc: '药品', fen: 940 });
  const r = run([b], [man('m', 3, 8, '19:13', 1000, '购物', { remark: '药' })]);
  const it = r.item(b);
  ok(it.bucket === 'pending' && it.why === 'near' && it.cands[0].record === 'm', '15 晚 3 天、金额差 0.60：不自动合并，进待你确认（候选是那条手记）');
  ok(it.msg === '金额差 0.60 元、晚 3 天记的，请你确认', '15 写「金额差 0.60 元、晚 3 天记的」：' + it.msg);
  ok(r.matched.stats.nearMerged === 0, '15 金额差一点的那块没有它');
}
{
  // 晚 2 天的也一样
  const b = wx({ time: T(3, 5, 11, 7), cp: '某虚构超市', fen: 940 });
  const it = run([b], [man('m', 3, 7, '09:00', 1000, '购物')]).item(b);
  ok(it.bucket === 'pending' && it.msg === '金额差 0.60 元、晚 2 天记的，请你确认', '15 晚 2 天：进待你确认');
}
{
  // 同一天、晚 1 天的照旧自动合并
  const b0 = wx({ time: T(3, 5, 11, 7), cp: '某虚构超市', fen: 940 });
  const b1 = wx({ time: T(3, 10, 11, 7), cp: '某虚构超市', fen: 1880 });
  const r = run([b0, b1], [man('a', 3, 5, '19:00', 1000, '购物'), man('c', 3, 11, '09:00', 2000, '购物')]);
  ok(r.item(b0).bucket === 'merge' && r.item(b0).why === 'near' && r.item(b0).into === 'a' && r.item(b0).days === 0, '15 同一天（手记晚记）：照旧自动合并');
  ok(r.item(b1).bucket === 'merge' && r.item(b1).why === 'near' && r.item(b1).into === 'c' && r.item(b1).days === 1, '15 手记晚 1 天：照旧自动合并');
  ok(r.matched.stats.nearMerged === 2, '15 金额差一点的 2 笔');
}
{
  // 金额正好相等的跨天配对不受影响（晚 3 天照旧合并）
  const b = wx({ time: T(3, 5, 11, 7), cp: '某虚构超市', fen: 1000 });
  const it = run([b], [man('m', 3, 8, '19:13', 1000, '购物')]).item(b);
  ok(it.bucket === 'merge' && it.why === 'merged' && it.days === 3, '15 金额正好相等、晚 3 天：照旧自动合并');
}
{
  // 晚 3 天的那条手记还占着「只有这一条」：同一天另一笔也看中它时，两笔都不自动合并（和以前一样不抢）
  const b0 = wx({ time: T(3, 5, 11, 7), cp: '某虚构超市', fen: 940 });
  const b1 = wx({ time: T(3, 8, 10, 0), cp: '某虚构超市', fen: 950 });
  const r = run([b0, b1], [man('m', 3, 8, '19:13', 1000, '购物')]);
  ok(r.item(b0).bucket === 'pending' && r.item(b1).bucket === 'pending', '15 两笔都看中同一条手记：都不自动合并');
}
// ===== 17. 金额相近、手记比付款早 1 小时以上的，不自动合并 =====
{
  // 你给的结构：手记 3-4 16:20 游戏 30.00，账单 3-4 21:43 某游戏公司 29.99
  const b = wx({ time: T(3, 4, 21, 43), cp: '某虚构游戏公司', desc: '充值', fen: 2999 });
  const it = run([b], [man('m', 3, 4, '16:20', 3000, '游戏')]).item(b);
  ok(it.bucket === 'pending' && it.why === 'near' && it.cands[0].record === 'm', '17 同一天、手记早 5 小时 23 分：不自动合并，进待你确认');
  ok(it.msg === '你记的比付款早 5 小时、金额差 0.01 元，请你确认', '17 写「你记的比付款早 5 小时」：' + it.msg);
}
{
  // 早 59 分、正好 60 分的照旧合并；早 61 分的不合并（各跑一次，免得几笔互相看中）
  const one = (hm, bt) => { const b = wx({ time: bt, cp: '某虚构面馆', fen: 2800 }); return run([b], [man('a', 3, 4, hm, 3000, '吃饭')]).item(b); };
  const x59 = one('12:00', T(3, 4, 12, 59)), x60 = one('12:00', T(3, 4, 13, 0)), x61 = one('12:00', T(3, 4, 13, 1));
  ok(x59.bucket === 'merge' && x59.why === 'near', '17 手记早 59 分钟：照旧自动合并');
  ok(x60.bucket === 'merge' && x60.why === 'near', '17 手记正好早 60 分钟：照旧自动合并');
  ok(x61.bucket === 'pending' && x61.msg === '你记的比付款早 1 小时、金额差 2.00 元，请你确认', '17 手记早 61 分钟：进待你确认、写早 1 小时');
  // 手记正好 00:00 = 没写具体时间，不拦；00:01 起照常算（半夜真的会记账）
  const z0 = one('00:00', T(3, 4, 21, 43)), z1 = one('00:01', T(3, 4, 21, 43));
  ok(z0.bucket === 'merge' && z0.into === 'a', '17 手记正好 00:00：当作没写时间，照旧自动合并');
  ok(z1.bucket === 'pending' && /^你记的比付款早 21 小时/.test(z1.msg), '17 手记 00:01：照常算，早 21 小时进待你确认');
}
{
  // 手记比付款晚（先付后记）照旧合并；金额正好相等的同一天，手记早 5 小时也照旧合并
  const b0 = wx({ time: T(3, 4, 12, 0), cp: '某虚构面馆', fen: 2800 });
  const b1 = wx({ time: T(3, 5, 21, 43), cp: '某虚构游戏公司', fen: 3000 });
  const r = run([b0, b1], [man('a', 3, 4, '20:00', 3000, '吃饭'), man('b', 3, 5, '16:20', 3000, '游戏')]);
  ok(r.item(b0).bucket === 'merge' && r.item(b0).why === 'near', '17 手记晚 8 小时（先付后记）：照旧自动合并');
  ok(r.item(b1).bucket === 'merge' && r.item(b1).why === 'merged', '17 金额正好相等、手记早 5 小时：照旧自动合并');
}
{
  // 晚 1 天的不看钟点（手记第二天早上补记）
  const b = wx({ time: T(3, 4, 21, 0), cp: '某虚构面馆', fen: 2800 });
  const it = run([b], [man('a', 3, 5, '08:00', 3000, '吃饭')]).item(b);
  ok(it.bucket === 'merge' && it.why === 'near' && it.days === 1, '17 手记晚 1 天（第二天早上补记）：照旧自动合并');
}
// ===== 16. 差额正好是另一笔小钱时，先当「几笔加起来」 =====
{
  // 你给的结构：手记 3-5 22:06 餐饮 30.00「夜宵」；账单 3-5 22:06 某平台 兑换券 27.00、22:10 同一平台 配送费 3.00。
  // 复现条件：同一平台当天还有别的单子（12:00 午饭 15.00），以前「同一对方全部加起来」凑不上、同一对方的两笔又不试，27 被当成金额相近合并、3 成了新增
  const L = wx({ time: T(3, 5, 12, 0), cp: '某虚构外卖平台', desc: '午饭', fen: 1500 });
  const A = wx({ time: T(3, 5, 22, 6), cp: '某虚构外卖平台', desc: '兑换券', fen: 2700 });
  const F = wx({ time: T(3, 5, 22, 10), cp: '某虚构外卖平台', desc: '配送费', fen: 300 });
  const r = run([L, A, F], [man('m', 3, 5, '22:06', 3000, '吃饭', { remark: '夜宵' })]);
  const g = r.matched.multiSums.find(x => x.options.some(o => o.record === 'm'));
  ok(g && g.options.length === 1 && g.options[0].bills.length === 2 && g.suggest === 0, '16 27 + 3 = 30：列成「几笔加起来」，只有一种、带建议');
  ok(r.item(A).bucket === 'pending' && r.item(A).why === 'multisum' && r.item(F).bucket === 'pending' && r.item(F).why === 'multisum', '16 两笔都在待你确认（只建议，不点不合并）');
  ok(r.matched.stats.nearMerged === 0 && r.item(A).why !== 'near', '16 不再当金额相近合并');
  ok(r.item(L).bucket === 'add', '16 当天别的单子照常新增');
  const p0 = r.plan({});
  ok(p0.rows.filter(d => d.group === 'merge').length === 0, '16 不点：不合并');
  const p1 = r.plan({ sums: g ? { [g.id]: 0 } : {} });
  ok([A, F].every(t => { const d = p1.rows.find(x => x.key === r.item(t).key); return d.group === 'merge' && d.into === 'm'; }), '16 点了：两笔都合并到这条手记');
}
{
  // 差额找不到对应账单的照旧按金额相近处理
  const L = wx({ time: T(3, 5, 12, 0), cp: '某虚构外卖平台', fen: 1500 });
  const A = wx({ time: T(3, 5, 22, 6), cp: '某虚构外卖平台', fen: 2700 });
  const r = run([L, A], [man('m', 3, 5, '22:06', 3000, '吃饭')]);
  ok(r.item(A).bucket === 'merge' && r.item(A).why === 'near' && r.matched.multiSums.length === 0, '16 没有 3.00 那笔：照旧按金额相近合并');
}
{
  // 小的那笔隔了 1 小时以上：不凑，照旧金额相近
  const L = wx({ time: T(3, 5, 12, 0), cp: '某虚构外卖平台', fen: 1500 });
  const A = wx({ time: T(3, 5, 21, 0), cp: '某虚构外卖平台', fen: 2700 });
  const F = wx({ time: T(3, 5, 22, 10), cp: '某虚构外卖平台', fen: 300 });
  const r = run([L, A, F], [man('m', 3, 5, '22:06', 3000, '吃饭')]);
  ok(r.matched.multiSums.length === 0 && r.item(A).why === 'near' && r.item(F).bucket === 'add', '16 3.00 那笔隔了 70 分钟：不当几笔加起来，照旧');
}
{
  // 两笔差不多大（15 + 15 = 30）：不算「另一笔小钱」，同一对方的两笔照旧不凑
  const L = wx({ time: T(3, 5, 12, 0), cp: '某虚构外卖平台', fen: 1000 });
  const A = wx({ time: T(3, 5, 22, 6), cp: '某虚构外卖平台', fen: 1500 });
  const F = wx({ time: T(3, 5, 22, 10), cp: '某虚构外卖平台', fen: 1500 });
  const r = run([L, A, F], [man('m', 3, 5, '22:06', 3000, '吃饭')]);
  ok(r.matched.multiSums.length === 0, '16 15 + 15：小的那笔超过容差，不凑');
}
{
  // 同一对方 / 同一平台的排前面：另有一笔别家的 3.00（1 小时内，以前就会凑）
  const A = wx({ time: T(3, 5, 22, 6), cp: '某虚构外卖平台', fen: 2700 });
  const X = wx({ time: T(3, 5, 22, 8), cp: '某虚构便利店', fen: 300 });
  const F = wx({ time: T(3, 5, 22, 10), cp: '某虚构外卖平台', fen: 300 });
  const L = wx({ time: T(3, 5, 12, 0), cp: '某虚构外卖平台', fen: 1500 });
  const r = run([X, A, F, L], [man('m', 3, 5, '22:06', 3000, '吃饭')]);
  const g = r.matched.multiSums[0];
  const keyOf = t => ({ file: r.item(t).file, row: r.item(t).row });
  const has = (o, t) => o.bills.some(b => b.row === keyOf(t).row);
  ok(g && g.options.length === 2 && has(g.options[0], F) && has(g.options[1], X) && g.suggest === null, '16 两种凑法：同一平台的 27 + 3 排第一，别家的排第二，不带默认');
}
})();
console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
