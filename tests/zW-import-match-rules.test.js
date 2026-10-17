// 1017-UI4 起配对规则的修改（第三轮真机试用）。node zW-import-match-rules.test.js [index.html]
// 解析 → 定去向 → 配对 → 方案，纯计算。账单、手记、对方、金额全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js'));
const R = require(path.join(IMP, 'route.js'));
const M = require(path.join(IMP, 'match.js'));
const C = require(path.join(IMP, 'classify.js'));
const PL = require(path.join(IMP, 'plan.js'));
const W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '吃饭', '购物', '出行', '娱乐', '缴费', '转账', '红包', '其他'];
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, fen, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T${(o && o.hm) || '12:00'}`, type: 'expense', fen, cat: '吃饭', mode: 'normal' }, o || {});

function run(bills, manual, opts) {
  opts = opts || {};
  const parsed = P.parseFiles(bills.map((b, i) => ({ name: '账单' + (i + 1), data: B.ab(B.bill(b.app, b.txns, Object.assign({ range: RANGE }, b.opts || {})).bytes) })));
  const routed = R.route(parsed, { known: opts.known || {}, rules: [] });
  const cats = opts.cats || CATS;
  const matched = M.match(routed, parsed, { manual: manual || [], cats, merchants: W, isNewUser: false, trace: true });
  const manualById = {}; (manual || []).forEach(m => { manualById[m.id] = m; });
  const input = { parsed, matched, info: { cats, isNewUser: false }, manualById, overlaps: [] };
  const key = txn => matched.items.find(it => it.src === 'row' && parsed.files[it.file].rows[it.row].no === txn.no).key;
  const item = txn => matched.items.find(it => it.src === 'row' && parsed.files[it.file].rows[it.row].no === txn.no);
  return { parsed, routed, matched, input, key, item, plan: e => PL.plan(input, e) };
}
function diffOk(p) {
  return p.files.every(f => f.fatal || ['expense', 'income', 'neutral'].every(io => {
    const d = f.diff[io]; if (!d.header) return true;
    return d.header.fen === d.sum + d.unreadable && d.unreadable === 0 && d.parts.reduce((s, x) => s + x.fen, 0) === d.sum;
  }));
}
const conserved = (m, parsed) => m.perFile.every(p => p.ok) && Object.values(m.counts).reduce((s, n) => s + n, 0) === parsed.files.reduce((s, f) => s + f.stats.parsed.total, 0);
// 方案里每条手记最多被一笔「单独合并」用一次；多笔合一的几笔共用一条手记，但这条手记不能再被别的组用
function noReuse(p) {
  const by = {};
  p.rows.forEach(d => { if (d.group === 'merge') { const k = d.into; (by[k] = by[k] || []).push(d); } });
  return Object.values(by).every(ds => ds.length === 1 || (ds[0].viaSum && ds.every(d => d.viaSum === ds[0].viaSum)));
}
const rowOf = (p, k) => p.rows.find(d => d.key === k);

(() => {
// ===== 1. 1017-UI4 同一天正好相等的单笔，不被前一天的「几笔加起来」抢走 =====
{
  // 对方「某食堂」：X1 3-4 11:58 30.00、X2 3-4 11:59 5.00、Y 3-5 12:00 30.00
  // 手记：a 3-4 35.00 吃饭、b 3-5 12:15 30.00 吃饭、c 3-7 30.00 吃饭、d 3-4 11:28 28.60 购物
  const X1 = wx({ time: T(3, 4, 11, 58), cp: '某虚构食堂', desc: '套餐', fen: 3000 });
  const X2 = wx({ time: T(3, 4, 11, 59), cp: '某虚构食堂', desc: '饮料', fen: 500 });
  const Y = wx({ time: T(3, 5, 12, 0), cp: '某虚构食堂', desc: '套餐', fen: 3000 });
  const hand = [man('a', 3, 4, 3500, { hm: '12:30' }), man('b', 3, 5, 3000, { hm: '12:15' }), man('c', 3, 7, 3000), man('d', 3, 4, 2860, { hm: '11:28', cat: '购物' })];
  const r = run([{ app: 'wechat', txns: [X1, X2, Y] }], hand);
  ok(r.item(Y).bucket === 'merge' && r.item(Y).into === 'b' && r.item(Y).days === 0, '1 Y 和同一天的 b 正好相等、只有一条候选：自动合并');
  const g = r.matched.multiSums.find(x => x.options.some(o => o.record === 'a'));
  ok(g && g.options[0].kind === 'samecp' && g.options[0].record === 'a' && g.options[0].bills.length === 2 && g.suggest === 0, '1 X1 那组：X1 + X2 = a（同一天）排第一，只建议');
  ok(g && !g.options.some(o => o.record === 'b'), '1 b 不再出现在 X1 那组');
  const far = g ? g.options.filter(o => o.kind === 'far') : [];
  ok(g && far.length === 1 && far[0].record === 'c' && far[0].days === 3 && g.options.indexOf(far[0]) === g.options.length - 1 && !g.options.some(o => o.kind === 'single'), '1 相差 3 天的 X1 = c 只作为跨天的选法排最后，不和同一天的并列');
  ok([X1, X2].every(x => r.item(x).bucket === 'pending' && r.item(x).why === 'multisum'), '1 X1、X2 照旧留在待处理，点了才合并');
  const p0 = r.plan();
  ok([X1, X2].every(x => rowOf(p0, r.key(x)).group === 'pending') && noReuse(p0) && diffOk(p0), '1 不点：照旧留在待处理');
  const pa = r.plan({ sums: { [g.id]: 0 } });
  ok([X1, X2].every(x => rowOf(pa, r.key(x)).group === 'merge' && rowOf(pa, r.key(x)).into === 'a') && noReuse(pa) && diffOk(pa), '1 选 X1 + X2：合并到 a');
  const pf = r.plan({ sums: { [g.id]: g.options.indexOf(far[0]) } });
  ok(rowOf(pf, r.key(X1)).group === 'merge' && rowOf(pf, r.key(X1)).into === 'c' && rowOf(pf, r.key(X2)).group === 'add' && rowOf(pf, r.key(Y)).into === 'b' && noReuse(pf) && diffOk(pf), '1 否掉同一天的、选跨天的 X1 = c：X1 合并到 c，X2 新增，Y 还是 b');
  const ps = p0.sections.sums.find(x => x.id === g.id);
  ok(ps.options[ps.options.length - 1].days === 3 && /差 3 天/.test(ps.options[ps.options.length - 1].text), '1 方案里跨天的选法写明差几天：' + ps.options[ps.options.length - 1].text);
}
{
  // 同一天两笔 30、两条 30 的手记：按时间一对一，不交叉
  const A = wx({ time: T(3, 10, 11, 0), cp: '某虚构快餐', fen: 3000 }), B2 = wx({ time: T(3, 10, 18, 0), cp: '某虚构快餐', fen: 3000 });
  const r = run([{ app: 'wechat', txns: [A, B2] }], [man('m1', 3, 10, 3000, { hm: '11:10' }), man('m2', 3, 10, 3000, { hm: '18:20' })]);
  ok(r.item(A).into === 'm1' && r.item(B2).into === 'm2', '1 同一天两笔 30、两条 30：按时间一对一配，不交叉');
}
{
  // 同一天一笔正好相等、另有几笔加起来也正好：一起列（同一天的都并列，不带默认）
  const P1 = wx({ time: T(3, 12, 9), cp: '某虚构书店', fen: 1000 }), P2 = wx({ time: T(3, 12, 9, 5), cp: '某虚构书店', fen: 2000 }), Q = wx({ time: T(3, 12, 15), cp: '某虚构文具', fen: 3000 });
  const r = run([{ app: 'wechat', txns: [P1, P2, Q] }], [man('m30', 3, 12, 3000, { cat: '购物' })]);
  const g = r.matched.multiSums.find(x => x.options.some(o => o.record === 'm30'));
  ok(g && g.suggest === null && g.options[0].kind === 'samecp' && g.options.some(o => o.kind === 'single' && o.bills.length === 1) && [P1, P2, Q].every(x => r.item(x).why === 'multisum'), '1 同一天一笔正好相等、另有几笔加起来也正好：一起列、不带默认，几笔加起来的排前面');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})();
