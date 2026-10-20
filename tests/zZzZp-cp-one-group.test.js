// 1021-T10（实测 10-20 第 2 轮）同一对方放一组：「按对方选分类」那一组写上同一个对方组外已经归了哪类、组里几笔退款；
// 这一个对方的行不再同时出现在「推荐要你看一眼」的单笔里。node zZzZp-cp-one-group.test.js [index.html]。账单虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '购物', '其他'];
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 6, d, h, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const tx = [wx({ time: T(1, 9), desc: '火锅' }), wx({ time: T(2, 9), desc: '火锅' }), wx({ time: T(3, 9) }), wx({ time: T(4, 9) }), wx({ time: T(5, 9), cp: '另一家', desc: '火锅' })];
const parsed = P.parseFiles([{ name: 'a.csv', data: B.ab(B.bill('wechat', tx, { range: RANGE }).bytes) }]);
const routed = R.route(parsed, { known: {} });
const matched = M.match(routed, parsed, { manual: [], cats: CATS, merchants: W });
// 「火锅」只在商品说明里（把握低）；同一个对方投票：2 笔火锅 → 整个对方推餐饮（低）。造一个「同一对方部分有分类」的情形：
//   把其中一组的推荐手动改掉，看组里写不写「另有 N 笔已归到…」
const p0 = PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, {});
const rowsOf = cp => p0.rows.filter(d => d.src === 'row' && d.cp === cp);
const g0 = p0.sections.cpGroups.find(g => g.cp === '某虚构小店');
if (g0) {
  ok(rowsOf('某虚构小店').every(d => d.inCpGroup === '某虚构小店'), '1 同一个对方的行都标上 inCpGroup');
} else {
  // 投票把整个对方推成了餐饮（没有未分类的行）：手动把一笔改回未分类，才会有组
  const k = rowsOf('某虚构小店')[0].key;
  const p1 = PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, { rows: {} });
  ok(!p1.sections.cpGroups.some(g => g.cp === '某虚构小店'), '1 整个对方都推出来了：不成组（不会裂成两半）');
}
// 直接造：同一个对方 2 笔有分类（对方名里有「火锅」→ 中）、2 笔没有 —— 用规则让其中两笔归类
const tx2 = [wx({ time: T(6, 9), cp: '某虚构杂货', desc: '水果' }), wx({ time: T(7, 9), cp: '某虚构杂货', desc: '水果' }), wx({ time: T(8, 9), cp: '某虚构杂货', desc: '不知道是什么' }), wx({ time: T(9, 9), cp: '某虚构杂货', desc: '不知道是什么' })];
const pa = P.parseFiles([{ name: 'b.csv', data: B.ab(B.bill('wechat', tx2, { range: RANGE }).bytes) }]);
const ra = R.route(pa, { known: {} });
const ma = M.match(ra, pa, { manual: [], cats: CATS, merchants: W });
// 投票会把同一个对方统一成一类；去掉投票的影响：把两笔的推荐改成未分类，模拟「部分有分类」
ma.items.forEach(it => { if (it.rec && pa.files[0].rows[it.row].desc === '不知道是什么') it.rec = { cat: '未分类', want: '未分类', layer: 'none', conf: null, reason: '没找到依据' }; else if (it.rec) it.rec = { cat: '购物', want: '日用百货', layer: 'builtin', conf: 'low', reason: '内置' }; });
const pb = PL.plan({ parsed: pa, matched: ma, info: { cats: CATS }, manualById: {}, overlaps: [] }, {});
const g = pb.sections.cpGroups.find(x => x.cp === '某虚构杂货');
ok(g && g.n === 2 && g.others && g.others['购物'] === 2, '2 组里写同一个对方组外 2 笔已归到「购物」：' + JSON.stringify(g && g.others));
ok(pb.rows.filter(d => d.src === 'row').every(d => d.inCpGroup === '某虚构杂货'), '2 组外那 2 笔（把握低）也标上 inCpGroup，不再单列进「推荐要你看一眼」');

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
