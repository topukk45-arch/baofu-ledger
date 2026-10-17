// 1017-A 起「金额差一点」的三条收紧（第四轮真机试用）。node zZn-import-near-rules.test.js [index.html]
//   15（1017-A）：金额相近的自动合并只限同一天或手记晚 1 天；晚 2–3 天的进待你确认，写「金额差 x 元、晚 N 天记的」
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
const CATS = ['未分类', '吃饭', '购物', '出行', '游戏', '其他'];
const RULES = [{ kw: '某虚构超市', cat: '购物' }, { kw: '某虚构面馆', cat: '吃饭' }];
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
})();
console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
