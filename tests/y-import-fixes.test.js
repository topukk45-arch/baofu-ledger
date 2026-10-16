// 1016-C 真机试用 1016-B 以后的修改（还是只看不写）。node y-import-fixes.test.js [index.html]
// 解析 → 定去向 → 配对 → 方案，纯计算。每一条修改一组用例（用虚构数据复现真实账单的结构），再加性质测试。
// 账单、手记、对方、金额全是虚构的。
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
  const matched = M.match(routed, parsed, { manual: manual || [], cats, merchants: W, isNewUser: false });
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
// ===== 1. 多笔合一 =====
{
  // a. 同一天、同一对方的全部：游戏充值 1 元 × 4 = 手记 4 元；同一摊位 12 + 2 = 手记 14
  const game = [9, 10, 11, 12].map(h => wx({ time: T(4, 3, h), cp: '某虚构游戏', desc: '游戏充值', fen: 100 }));
  const stall = [wx({ time: T(4, 5, 7, 10), cp: '某虚构早餐摊', desc: '/', fen: 1200 }), wx({ time: T(4, 5, 7, 12), cp: '某虚构早餐摊', desc: '/', fen: 200 })];
  // b. 不同对方、同分类：两张火车票 151 + 332 = 483（支付宝交通出行）
  const rail = [ali({ time: T(4, 8, 9), cp: '虚构铁路售票甲', kind: '交通出行', fen: 15100 }), ali({ time: T(4, 8, 15), cp: '虚构铁路售票乙', kind: '交通出行', fen: 33200 })];
  // b. 不同对方、1 小时内：兑换券 26.80 + 配送费 1.60 = 28.40
  const coupon = [wx({ time: T(4, 9, 18, 5), cp: '某虚构外卖券', fen: 2680 }), wx({ time: T(4, 9, 18, 40), cp: '某虚构配送', fen: 160 })];
  // 两种凑法：同一天 10 + 20 = 30、5 + 25 = 30，只有一条 30 的手记（都在 1 小时内）
  const multi = [wx({ time: T(4, 12, 10, 0), cp: '虚构店一', fen: 1000 }), wx({ time: T(4, 12, 10, 5), cp: '虚构店二', fen: 2000 }),
                 wx({ time: T(4, 12, 10, 10), cp: '虚构店三', fen: 500 }), wx({ time: T(4, 12, 10, 15), cp: '虚构店四', fen: 2500 })];
  // 个人转账不参与多笔合一：给 *小玲 转 22 + 33，同一天手记 55
  const pers = [wx({ time: T(4, 14, 9), kind: '转账', cp: '*小玲', fen: 2200 }), wx({ time: T(4, 14, 9, 5), kind: '转账', cp: '*小玲', fen: 3300 })];
  const manual = [man('mg', 4, 3, 400, { cat: '娱乐' }), man('ms', 4, 5, 1400), man('mr', 4, 8, 48300, { cat: '出行' }), man('mc', 4, 9, 2840),
                  man('mm', 4, 12, 3000), man('mp', 4, 14, 5500, { cat: '其他' })];
  const r = run([{ app: 'wechat', txns: game.concat(stall, coupon, multi, pers) }, { app: 'alipay', txns: rail }], manual);
  const it = r.item, ms = r.matched.multiSums;
  ok(game.every(t => it(t).bucket === 'pending' && it(t).why === 'multisum' && it(t).msg === '这 4 笔加起来正好是你记的 4.00 元，合并'), '1a 游戏充值 1 元 × 4 = 手记 4：一组待处理，默认建议合并');
  ok(stall.every(t => it(t).why === 'multisum') && ms.some(g => g.options.length === 1 && g.options[0].record === 'ms' && g.options[0].kind === 'samecp' && g.suggest === 0), '1a 同一摊位 12 + 2 = 14');
  ok(rail.every(t => it(t).why === 'multisum') && ms.some(g => g.options[0].record === 'mr' && g.options[0].kind === 'combo'), '1b 两张火车票 151 + 332 = 483（同分类）');
  ok(coupon.every(t => it(t).why === 'multisum') && ms.some(g => g.options[0].record === 'mc'), '1b 兑换券 26.80 + 配送费 1.60 = 28.40（1 小时内）');
  const gm = ms.find(g => g.options.some(o => o.record === 'mm'));
  ok(gm && gm.options.length === 2 && gm.suggest === null && multi.every(t => it(t).why === 'multisum' && it(t).msg.includes('2 种凑法')), '1 两种凑法：列出来让你选，不带默认');
  ok(pers.every(t => it(t).why !== 'multisum' && it(t).bucket === 'add'), '1 个人转账不参与多笔合一');
  ok(conserved(r.matched, r.parsed), '1 守恒');
  // 确认：几笔都合并到那条手记，手记金额不变，差额照样 0 分
  const p0 = r.plan(), gg = ms.find(g => g.options[0].record === 'mg');
  ok(p0.sections.sums.length === ms.length && p0.counts.pending === game.length + stall.length + rail.length + coupon.length + multi.length, '1 不点确认就一直待处理');
  const p1 = r.plan({ sums: { [gg.id]: 0 } });
  ok(game.every(t => { const d = rowOf(p1, r.key(t)); return d.group === 'merge' && d.into === 'mg' && d.viaSum === gg.id; }) && p1.mergeM === p0.mergeM + 4 && p1.orders === p0.orders + 4, '1 一键确认：4 笔都合并到这条手记，4 个单号都登记');
  ok(diffOk(p1) && p1.files[0].diff.expense.mergeDelta === 0 && noReuse(p1), '1 合并后差额照样 0 分，手记金额不变（没有多记少记）');
  const p2_ = r.plan({ sums: { [gm.id]: 1 } }), opt = gm.options[1];
  ok(multi.every(t => { const d = rowOf(p2_, r.key(t)); return opt.keys ? true : d; }) &&
     multi.filter(t => rowOf(p2_, r.key(t)).group === 'merge').length === 2 && multi.filter(t => rowOf(p2_, r.key(t)).group === 'add').length === 2 && noReuse(p2_),
    '1 两种凑法选了一种：那 2 笔合并，另外 2 笔自动新增');
  const p3 = r.plan({ sums: { [gg.id]: 'none' } });
  ok(game.every(t => rowOf(p3, r.key(t)).group === 'add') && diffOk(p3), '1 都不是：全部新增');
  // 多笔合一先于「部分付款」：同一天同分类 2 笔 = 一条手记
  const pp = [wx({ time: T(5, 1, 12), cp: '某虚构超市甲', fen: 3000 }), wx({ time: T(5, 1, 12, 20), cp: '某虚构超市乙', fen: 2000 })];
  const r2 = run([{ app: 'wechat', txns: pp }], [man('mx', 5, 1, 5000, { cat: '购物' })]);
  ok(pp.every(t => r2.item(t).why === 'multisum'), '1 先于部分付款：30 + 20 = 50，进多笔合一而不是「只付了一部分」');
}

// ===== 2. 候选排序：时间最近、金额差最小的排第一 =====
{
  const b = wx({ time: T(6, 10, 19, 8), cp: '某虚构面馆', fen: 1980 });
  const manual = [man('far1', 6, 14, 1980, { hm: '19:08' }), man('far2', 6, 15, 1980, { hm: '12:00' }), man('far3', 6, 16, 1980, { hm: '19:00' }),
                  man('near3', 6, 7, 1900, { hm: '19:08' }), man('best', 6, 10, 1950, { hm: '19:09' })];
  const r = run([{ app: 'wechat', txns: [b] }], manual);
  const it = r.item(b);
  ok(it.bucket === 'pending' && it.cands.length === 5 && it.cands[0].record === 'best', '2 账单 19:08 19.80、手记 19:09 19.50：排第一（3–5 天外的排后面）');
  ok(it.cands.map(c => c.record).join() === 'best,near3,far1,far2,far3', '2 其余按时间差、再按金额差排：' + it.cands.map(c => c.record).join());
}

// ===== 3. 按手记 / 按账单归组 =====
{
  // 1 条手记 16 元，4 笔账单都差不多（3 天内）
  const four = [1520, 1580, 1630, 1660].map((f, i) => wx({ time: T(7, 2 + (i % 2), 9 + i), cp: '虚构小店' + i, fen: f }));
  // 1 笔账单 30 元，3 条手记都可能
  const one = wx({ time: T(7, 20, 12), cp: '虚构餐厅', fen: 3000 });
  // 2 笔 × 2 条：互相都可能
  const xx = [wx({ time: T(8, 5, 9), cp: '虚构甲', fen: 5000 }), wx({ time: T(8, 5, 10), cp: '虚构乙', fen: 5100 })];
  const manual = [man('m16', 7, 2, 1600), man('a1', 7, 20, 2900), man('a2', 7, 21, 3100), man('a3', 7, 19, 2950),
                  man('x1', 8, 5, 4900, { hm: '09:00' }), man('x2', 8, 6, 5050, { hm: '10:00' })];
  const r = run([{ app: 'wechat', txns: four.concat([one], xx) }], manual);
  const p = r.plan(), pg = p.sections.pendGroups;
  const g16 = pg.find(g => g.records.length === 1 && g.records[0] === 'm16');
  ok(g16 && g16.kind === 'byManual' && g16.keys.length === 4 && g16.text === '你记的 16.00 元，可能是下面 4 笔中的一笔', '3 一条手记被 4 笔抢：按手记归成一组');
  const g1 = pg.find(g => g.keys.includes(r.key(one)));
  ok(g1 && g1.kind === 'byBill' && g1.records.length === 3, '3 一笔账单对 3 条手记：按账单归组');
  const gx = pg.find(g => g.keys.includes(r.key(xx[0])));
  ok(gx && gx.kind === 'many' && gx.keys.length === 2 && gx.records.length === 2, '3 两笔 × 两条：一组，一笔一笔选');
  ok(pg.every(g => g.keys.every(k => pg.filter(h => h.keys.includes(k)).length === 1)), '3 一笔账单只出现在一组里');
  // 选一笔 → 合并，其余自动新增
  const p1 = r.plan({ rows: { [r.key(four[2])]: { pick: { record: 'm16' } } } });
  ok(rowOf(p1, r.key(four[2])).group === 'merge' && [0, 1, 3].every(i => { const d = rowOf(p1, r.key(four[i])); return d.group === 'add' && d.autoNew; }) && diffOk(p1) && noReuse(p1),
    '3 选了一笔：合并，同组其余 3 笔自动变新增');
  // 都不是 → 全部新增
  const none = {}; four.forEach(t => { none[r.key(t)] = { pick: 'new' }; });
  const p2_ = r.plan({ rows: none });
  ok(four.every(t => rowOf(p2_, r.key(t)).group === 'add'), '3 都不是：全部新增');
  ok(four.every(t => rowOf(p, r.key(t)).group === 'pending'), '3 不选：一直待处理');
  // 2 × 2：第一笔选了 x1，第二笔还待处理（还能选 x2）；第二笔也想选 x1 不行
  const p3 = r.plan({ rows: { [r.key(xx[0])]: { pick: { record: 'x1' } } } });
  ok(rowOf(p3, r.key(xx[1])).group === 'pending', '3 两笔 × 两条：选走一条以后，另一笔还能选剩下那条');
  const p4 = r.plan({ rows: { [r.key(xx[0])]: { pick: { record: 'x1' } }, [r.key(xx[1])]: { pick: { record: 'x1' } } } });
  ok(rowOf(p4, r.key(xx[1])).group === 'pending' && noReuse(p4), '3 被选走的手记别的账单不能再选');
  const p5 = r.plan({ rows: { [r.key(xx[0])]: { pick: { record: 'x1' } }, [r.key(xx[1])]: { pick: { record: 'x2' } } } });
  ok(rowOf(p5, r.key(xx[1])).group === 'merge' && noReuse(p5) && diffOk(p5), '3 两笔各选一条：都合并');
  // 3 条里 a1 被这笔选走了，一笔对多条：选完就不再待处理
  const p6 = r.plan({ rows: { [r.key(one)]: { pick: { record: 'a2' } } } });
  ok(rowOf(p6, r.key(one)).group === 'merge' && rowOf(p6, r.key(one)).into === 'a2', '3 一笔对多条：选一条合并');
}

// ===== 4. 转账、红包、扫码付给个人：只做精确配对 =====
{
  const fam = wx({ time: T(9, 1, 20), kind: '转账', cp: '*小玲', fen: 10000, desc: '转账备注:微信转账' });
  const qr = wx({ time: T(9, 2, 9), kind: '扫二维码付款', cp: '某虚构个体', fen: 1500 });
  const hb = wx({ time: T(9, 3, 9), kind: '微信红包（单发）', cp: '某同学', fen: 2000 });
  const star = wx({ time: T(9, 4, 9), cp: '张*', fen: 3000 });
  const shop = wx({ time: T(9, 5, 9), cp: '虚构*数码科技旗舰店', fen: 4000 });
  const eng = wx({ time: T(9, 6, 9), cp: 'A*b小店', fen: 5000 });
  const aliT = ali({ time: T(9, 7, 9), kind: '转账红包', cp: '某朋友', fen: 6000 });
  const exact = wx({ time: T(9, 8, 9), kind: '转账', cp: '*小玲', fen: 7000 });
  const manual = [man('n1', 9, 1, 9553, { cat: '购物' }), man('n2', 9, 2, 9897, { cat: '娱乐' }), man('n3', 9, 1, 24800, { cat: '其他' }),
                  man('q1', 9, 2, 1400), man('h1', 9, 3, 1900), man('s1', 9, 4, 2900), man('sh', 9, 5, 3900), man('en', 9, 6, 4900),
                  man('al', 9, 7, 5900), man('ex', 9, 8, 7000)];
  const r = run([{ app: 'wechat', txns: [fam, qr, hb, star, shop, eng, aliT.kind ? exact : exact] }, { app: 'alipay', txns: [aliT] }], manual);
  const it = r.item;
  ok(it(fam).bucket === 'add' && it(fam).flags.includes('missing'), '4 给家人转 100：95.53 购物、98.97 游戏、248 其他都不当候选，照常新增');
  ok([qr, hb, star, aliT].every(t => it(t).bucket === 'add'), '4 扫码付款、红包、对方「张*」、支付宝转账红包：不做金额相近');
  ok(it(shop).bucket === 'pending' && it(shop).why === 'near' && it(eng).bucket === 'pending', '4 名字长、带英文的，哪怕带 *，按商户处理（照样找相近的）');
  ok(it(exact).bucket === 'merge' && it(exact).into === 'ex', '4 个人转账金额完全一样的：照样精确合并');
  ok(M.isPersonal('wechat', { cp: '*小玲', kind: '商户消费' }, C.cleanCp) && M.isPersonal('wechat', { cp: '张*', kind: '商户消费' }, C.cleanCp)
     && !M.isPersonal('wechat', { cp: '虚构*数码科技旗舰店', kind: '商户消费' }, C.cleanCp) && !M.isPersonal('wechat', { cp: '王*12', kind: '商户消费' }, C.cleanCp),
    '4 认个人：清洗后不超过 5 个字、除了 * 只有汉字');
}

// ===== 5. 转账往来 =====
{
  // 家里办事几天：转出、转入十来笔，基本相抵；相邻两笔隔不到 3 天
  const days = [[1, 9, 'out', '某亲戚甲', 20000], [1, 10, 'in', '某亲戚甲', 20000], [2, 9, 'in', '某亲戚乙', 50000], [2, 15, 'out', '某亲戚乙', 30000],
                [3, 11, 'in', '某同学', 10000], [3, 12, 'out', '某同学', 10000], [4, 8, 'in', '某亲戚丙', 66600], [4, 9, 'out', '某亲戚丙', 60000],
                [5, 20, 'in', '某亲戚丁', 20000], [6, 21, 'out', '某亲戚丁', 20000]];
  const tx = days.map(([d, h, io, cp, fen], i) => wx({ time: T(10, d, h), kind: i % 3 === 0 ? '微信红包（单发）' : '转账', cp, fen, io: io === 'out' ? 'expense' : 'income', desc: '转账备注:微信转账' }));
  const later = wx({ time: T(10, 12, 9), kind: '转账', cp: '某亲戚甲', fen: 5000 });             // 隔了 6 天，单独一段，只有转出，不列
  const qr = wx({ time: T(10, 2, 10), kind: '扫二维码付款', cp: '某虚构个体', fen: 800 });        // 扫码付款不收
  const shop = wx({ time: T(10, 3, 13), cp: '虚构*数码科技旗舰店', fen: 9900 });                    // 名字带 * 的商户不收
  const r = run([{ app: 'wechat', txns: tx.concat([later, qr, shop]) }], []);
  const p = r.plan(), trs = p.sections.transfers;
  ok(trs.length === 1 && trs[0].n === 10 && trs[0].from === '2026-10-01' && trs[0].to === '2026-10-06', '5 十笔串成一段（相邻两笔隔不到 3 天）');
  const tsum = (k) => days.filter(x => x[2] === k).reduce((s, x) => s + x[4], 0);
  ok(trs[0].out === tsum('out') && trs[0].in === tsum('in') && trs[0].net === tsum('in') - tsum('out') && trs[0].people.length === 5, '5 每个人的往来和整体净额');
  ok(!trs[0].keys.includes(r.key(shop)) && !trs[0].keys.includes(r.key(qr)) && !trs[0].keys.includes(r.key(later)), '5 名字带 * 的长名商户、扫码付款、隔了几天的单独一笔：都不在里面');
  const all = {}; trs[0].keys.forEach(k => { all[k] = { mode: 'skip' }; });
  const p1 = r.plan({ rows: all });
  const ne = f => f.diff.expense.parts.find(x => x.key === 'neutral').fen + f.diff.income.parts.find(x => x.key === 'neutral').fen;
  ok(p1.sections.transfers[0].allSkip && ne(p1.files[0]) === tsum('in') + tsum('out') && diffOk(p1), '5 一键都标成不计入：差额里挪到「不计入」，合计照样差 0 分');
  ok(p1.sections.cpGroups.every(g => !trs[0].keys.some(k => g.keys.includes(k))), '5 标成不计入的不再出现在按对方选分类里');
  const one = {}; one[trs[0].keys[0]] = { mode: 'skip' };
  const p2_ = r.plan({ rows: one });
  ok(p2_.sections.transfers[0].skipped.length === 1 && !p2_.sections.transfers[0].allSkip && diffOk(p2_), '5 也可以一笔一笔勾');
  ok(!shop.kind || rowOf(p1, r.key(shop)).mode === 'normal', '5 长名带 * 的商户不会被一键标成不计入');
}

// ===== 6. 合并记录显示成一行；分分捐默认分类；同一对方的推荐一致 =====
{
  const petty = Array.from({ length: 25 }, (_, i) => wx({ time: T(10, 1 + i, 8), kind: '分分捐', cp: '某虚构公益', desc: i % 3 ? '游戏' : '/', fen: 1 }));
  const big = wx({ time: T(10, 3, 12), cp: '某虚构饭店', fen: 8800 });
  const r = run([{ app: 'wechat', txns: petty.concat([big]) }], []);
  const p = r.plan();
  const sumRow = p.groups.add.find(d => d.summary);
  ok(sumRow && sumRow.title === '分分捐 · 10 月 · 25 笔 · 0.25 元' && sumRow.members.length === 25 && p.groups.add.length === 2, '6 分分捐 25 笔 0.01：明细里一行「分分捐 · 10 月 · 25 笔 · 0.25 元」，点开 25 笔');
  ok(sumRow.cat === '其他' && petty.every(t => rowOf(p, r.key(t)).cat === '其他'), '6 分分捐默认分类「其他」');
  ok(!p.sections.cpGroups.some(g => g.cp === '某虚构公益'), '6 分分捐不进按对方选分类');
  const r2 = run([{ app: 'wechat', txns: petty }], [], { cats: CATS.concat(['公益捐赠']) });
  ok(r2.plan().groups.add[0].cat === '公益捐赠', '6 存档里有公益类分类就用它');
  ok(p.records === 2, '6 实际新建 2 条记录');
  // 同一对方：商品说明有的指向游戏、有的什么都没有 → 都按投票推成游戏
  const g = [wx({ time: T(11, 1, 9), cp: '某虚构网络', desc: '游戏币', fen: 600 }), wx({ time: T(11, 2, 9), cp: '某虚构网络', desc: '游戏道具', fen: 600 }), wx({ time: T(11, 3, 9), cp: '某虚构网络', desc: '月卡', fen: 600 })];
  // 打平：一笔指向游戏、一笔指向缴费 → 都不推荐
  const t = [wx({ time: T(11, 4, 9), cp: '某虚构平台', desc: '游戏币', fen: 700 }), wx({ time: T(11, 5, 9), cp: '某虚构平台', desc: '电费', fen: 800 })];
  const r3 = run([{ app: 'wechat', txns: g.concat(t) }], []);
  ok(g.every(x => r3.item(x).rec.cat === '娱乐' && r3.item(x).rec.conf === 'low'), '6 同一对方按投票：三笔都推成「娱乐」（把握低）');
  ok(t.every(x => r3.item(x).rec.layer === 'none'), '6 同一对方打平：都不推荐');
}

// ===== 7. 套话不当标题、不写进备注 =====
{
  ok(PL.cleanDesc('收款方备注:二维码收款') === '' && PL.cleanDesc('转账备注:微信转账') === '' && PL.cleanDesc('/') === '', '7 套话当没写');
  ok(PL.cleanDesc('转账备注:还你饭钱') === '还你饭钱' && PL.cleanDesc('收款方备注：AA 车费') === 'AA 车费' && PL.cleanDesc('虚构商品') === '虚构商品', '7 付款人自己写的话：去掉前缀留下');
  const a = wx({ time: T(12, 1, 9), kind: '转账', cp: '某同事', desc: '转账备注:微信转账', fen: 1000 });
  const b = wx({ time: T(12, 1, 10), kind: '二维码收款', io: 'income', cp: '某顾客', desc: '收款方备注:二维码收款', fen: 1000 });
  const c = wx({ time: T(12, 1, 11), kind: '转账', cp: '某同事', desc: '转账备注:还你饭钱', fen: 2000 });
  const r = run([{ app: 'wechat', txns: [a, b, c] }], []);
  const p = r.plan();
  ok(rowOf(p, r.key(a)).title === '某同事' && rowOf(p, r.key(b)).title === '某顾客' && rowOf(p, r.key(a)).note === '', '7 列表显示交易对方，备注留空');
  ok(rowOf(p, r.key(c)).title === '还你饭钱' && rowOf(p, r.key(c)).note === '还你饭钱', '7 自己写的话照常显示、写进备注');
}

// ===== 9. 信用卡还款这类一律不计入，不进按对方选分类 =====
{
  const card = wx({ time: T(3, 5, 0, 3), kind: '信用卡还款', cp: '虚构银行', fen: 220379, io: 'expense' });
  const card2 = wx({ time: T(3, 6, 0, 5), kind: '信用卡还款', cp: '虚构银行', fen: 10000, io: 'neutral' });
  const r = run([{ app: 'wechat', txns: [card, card2] }], []);
  const p = r.plan();
  ok([card, card2].every(t => rowOf(p, r.key(t)).group === 'neutral' && rowOf(p, r.key(t)).mode === 'skip'), '9 信用卡还款 2203.79（账单写支出）：不计入');
  ok(!p.sections.cpGroups.length, '9 不计入的不进按对方选分类');
}

// ===== 10. 平台名降级、话费充值 =====
{
  const a = ali({ time: T(2, 1, 9), cp: '淘宝', kind: '日用百货', desc: '话费充值 100 元', fen: 10000 });
  const b = wx({ time: T(2, 1, 10), cp: '天猫', desc: '手机充值', fen: 5000 });
  const c = wx({ time: T(2, 1, 11), cp: '京东', desc: '虚构牌纸巾', fen: 3000 });
  const d = ali({ time: T(2, 1, 12), cp: '拼多多', kind: '服饰装扮', desc: '虚构商品', fen: 2000 });
  const e = wx({ time: T(2, 1, 13), cp: '虚构电力', desc: '电费充值', fen: 4000 });
  const r = run([{ app: 'wechat', txns: [b, c, e] }, { app: 'alipay', txns: [a, d] }], [], { cats: CATS.concat(['服饰']) });
  const rc = t => r.item(t).rec;
  ok(rc(a).want === '充值缴费' && rc(a).cat === '缴费' && rc(b).want === '充值缴费', '10 淘宝 / 天猫的话费充值、手机充值：充值缴费（商品说明比平台名具体）');
  ok(rc(c).want === '日用百货' && rc(c).conf === 'low', '10 京东、说明里没有具体的词：平台名兜底，把握低');
  ok(rc(d).want === '服饰装扮' && rc(d).layer === 'alipay', '10 支付宝的平台单：先用支付宝分类，不用平台名');
  ok(rc(e).want === '充值缴费', '10 电费充值：充值缴费');
  ok(!W.items.some(x => x[0] === '充值'), '10 「充值」单独一个词没加');
}

// ===== 11. 全额退款不自动合并 =====
{
  const o = wx({ time: T(5, 6, 12), cp: '某虚构饭店', fen: 5000, status: '已全额退款' });
  const rf = wx({ time: T(5, 6, 14), cp: '某虚构饭店', kind: '某虚构饭店-退款', io: 'income', fen: 5000, status: '已全额退款', no: wrno() });
  const manual = [man('m50', 5, 5, 5000, { cat: '其他' })];
  const r = run([{ app: 'wechat', txns: [o, rf] }], manual);
  ok(r.item(o).bucket === 'skip' && r.item(o).why === 'fullrefund' && r.item(rf).bucket === 'skip', '11 本批全额退款的一对：两条都跳过');
  ok(r.matched.stats.merged === 0, '11 不和前一天那条无关的「其他 · 50」合并');
  const p = r.plan();
  ok(p.sections.refundHints.length === 1 && p.sections.refundHints[0].text === '这笔 50.00 元已全额退款；你 5 月 5 日记的「其他 · 50.00」如果就是它，那条手记可能要删掉或改成退款' && p.counts.pending === 0,
    '11 弱提醒挂在待你确认里，用手记的真实日期，不算待处理');
  // 别的账单把这条手记合并掉了：提醒消失
  const other = wx({ time: T(5, 7, 9), cp: '某虚构书店', fen: 4900 });
  const r2 = run([{ app: 'wechat', txns: [o, rf, other] }], manual);
  const p2a = r2.plan();
  ok(r2.item(other).bucket === 'pending' && p2a.sections.refundHints.length === 1, '11 另一笔 49 元把这条手记当候选：提醒还在（手记不被全额退款占着）');
  const p2b = r2.plan({ rows: { [r2.key(other)]: { pick: { record: 'm50' } } } });
  ok(rowOf(p2b, r2.key(other)).group === 'merge' && p2b.sections.refundHints.length === 0, '11 确认页上把这条手记合并给了别的账单：提醒跟着消失');
  // 原单已全额退款、本批没有退款行：进待处理，不合并
  const o2 = wx({ time: T(5, 6, 12), cp: '某虚构饭店', fen: 5000, status: '已全额退款' });
  const r3 = run([{ app: 'wechat', txns: [o2] }], manual);
  ok(r3.item(o2).bucket === 'pending' && r3.item(o2).why === 'fullnorefund' && r3.item(o2).msg === '这笔已全额退款，退款不在这次的文件里' && !r3.item(o2).cands, '11 退款不在这次的文件里：进待处理，不合并');
}

// ===== 13. 全额退款跨两次导入：先原单后退款、先退款后原单，导完净额都是 0，没有多出的收入 =====
{
  // 一个假的「主页面 + ⑥b 写入」：按方案把新增 / 不计入 / 退款写成记录，登记单号（忽略的登记成 st 1），下一次导入照着查
  function ledger() {
    const L = { recs: [], orders: {}, n: 0 };
    L.known = parsed => {
      const lk = R.lookups(parsed), known = {};
      const info = id => { const r = L.recs.find(x => x.id === id); return r ? { type: r.type, fen: r.fen, refunded: L.recs.filter(x => x.refundOf === id).reduce((a, x) => a + x.fen, 0), mode: r.mode } : null; };
      lk.orders.forEach(k => { const e = L.orders[k]; if (e) known[k] = { st: e.st, id: e.id, rec: e.st === 0 ? info(e.id) : null }; });
      lk.fullRefunds.forEach(f => {
        if (f.app === 'alipay') { const k = Object.keys(L.orders).find(x => x.startsWith('alipay|' + f.no + '_')); if (k) known[f.key] = { found: true, id: L.orders[k].id }; return; }
        const ids = new Set(Object.keys(L.orders).filter(k => k.startsWith('wechat|') && L.orders[k].st === 0).map(k => L.orders[k].id));
        const r = L.recs.find(x => ids.has(x.id) && x.app === 'wechat' && (x.refundOf || /-退款$/.test(x.oc)) && x.fen === f.fen && x.cp === f.cp && x.time >= f.time);
        if (r) known[f.key] = { found: true, id: r.id };
      });
      (lk.markers || []).forEach(m => {
        const marks = Object.keys(L.orders).filter(k => k.startsWith(m.app + '|' + m.prefix) && L.orders[k].st === 1)
          .map(k => ({ key: k, day: k.slice(-8), used: !!L.orders[R.refundUsedKey(k)] }));
        if (marks.length) known[m.key] = { marks };
      });
      return known;
    };
    L.run = (app, txns, decide, manual) => {
      const parsed = P.parseFiles([{ name: 'f', data: B.ab(B.bill(app, txns, { range: RANGE }).bytes) }]);
      const routed = R.route(parsed, { known: L.known(parsed), rules: [] });
      const q = M.ledgerQuery(routed, parsed);
      const cands = L.recs.filter(r => r.type === 'expense' && q.refunds.some(x => r.time < x.before && r.fen >= x.minFen)).map(r => ({ id: r.id, time: r.time, type: r.type, fen: r.fen, refunded: 0, cp: r.cp, cat: r.cat }));
      const matched = M.match(routed, parsed, { manual: manual || [], refundCands: cands, cats: CATS, merchants: W });
      const byId = {}; (manual || []).concat(cands).forEach(m => { byId[m.id] = m; });
      const input = { parsed, matched, info: { cats: CATS, isNewUser: false }, manualById: byId, overlaps: [] };
      const p0 = PL.plan(input), edits = decide ? decide(p0) : {};
      const p = PL.plan(input, edits);
      p.rows.forEach(d => {
        if (d.src !== 'row') return;
        if (['add', 'neutral', 'refund'].includes(d.group)) {
          const id = 'R' + (++L.n);
          L.recs.push({ id, app, type: d.type, fen: d.fen, mode: d.mode, cp: d.cp, oc: d.kind, time: d.time, cat: d.cat,
                        refundOf: d.group === 'refund' && d.refundTo ? (d.refundTo.record || null) : null });
          L.orders[d.key] = { st: 0, id };
        } else if (d.group === 'merge') L.orders[d.key] = { st: 0, id: d.into };
      });
      p.ignoreOrders.forEach(k => { L.orders[k] = { st: 1, id: '' }; });
      return { p, routed, matched };
    };
    L.net = () => L.recs.reduce((a, r) => a + (r.type === 'income' ? r.fen : -r.fen), 0);
    L.income = () => L.recs.filter(r => r.type === 'income').length;
    return L;
  }
  var pickAll = (why, pick) => p => { const rows = {}; p.rows.forEach(d => { if (d.why === why && d.group === 'pending') rows[d.key] = { pick: typeof pick === 'function' ? pick(d) : pick }; }); return { rows }; };
  const m50 = [man('hand50', 5, 9, 5000, { cat: '其他' })];       // 一条无关的 50 元手记：原单不能和它合并
  // 微信
  const wo = () => wx({ time: T(5, 10, 12), cp: '某虚构饭店', fen: 5000, status: '已全额退款' });
  const wr = () => wx({ time: T(5, 12, 9), cp: '某虚构饭店', kind: '某虚构饭店-退款', io: 'income', fen: 5000, status: '已全额退款', no: wrno() });
  {
    const L = ledger();                                   // 先原单（退款不在文件里，选「不要了」），再退款
    const a = L.run('wechat', [wo()], pickAll('fullnorefund', 'drop'), m50);
    ok(a.p.ignoreOrders.length === 2, '13 微信先原单：选「不要了」，登记原单和退款记号两个忽略键');
    const b = L.run('wechat', [wr()], null, m50);
    ok(b.matched.items[0].why === 'origignored' && L.recs.length === 0 && L.net() === 0, '13 微信先原单（不要了）再退款：退款也跳过，账本净额 0，没有多出的收入');
  }
  {
    const L = ledger();                                   // 先原单（选「作为新增」），再退款（挂到原单）
    L.run('wechat', [wo()], pickAll('fullnorefund', 'new'), m50);
    const b = L.run('wechat', [wr()], pickAll('refundcands', d => ({ record: d.cands[0].record })), m50);
    ok(L.recs.length === 2 && L.recs[1].refundOf === L.recs[0].id && L.net() === 0, '13 微信先原单（作为新增）再退款：退款挂到原单，净额 0');
  }
  {
    const L = ledger();                                   // 先退款（只算结余），再原单
    L.run('wechat', [wr()], null, m50);
    ok(L.income() === 1 && L.recs[0].mode === 'flow', '13 微信先退款：按只算结余导入');
    const b = L.run('wechat', [wo()], null, m50);
    const it = b.matched.items[0];
    ok(it.bucket === 'add' && it.why === 'fullrefundold' && !L.recs.some(r => r.id === 'hand50') && L.recs.length === 2 && L.net() === 0, '13 微信先退款再原单：原单照常新增（不和那条 50 元手记合并），净额 0，不用删旧记录');
  }
  // 支付宝
  const no = ano();
  const ao = () => ali({ time: T(5, 10, 12), no, cp: '某虚构商城', fen: 5000, status: '退款成功', io: 'neutral' });
  const ar = () => ali({ time: T(5, 12, 9), no: no + '_R1', cp: '某虚构商城', fen: 5000, status: '退款成功', io: 'neutral', desc: '退款-虚构商品' });
  {
    const L = ledger();
    L.run('alipay', [ao()], pickAll('fullnorefund', 'drop'), m50);
    const b = L.run('alipay', [ar()], null, m50);
    ok(b.routed.items[0].why === 'origignored' && L.recs.length === 0 && L.net() === 0, '13 支付宝先原单（不要了）再退款：退款也跳过，净额 0');
  }
  {
    const L = ledger();
    L.run('alipay', [ar()], null, m50);
    const b = L.run('alipay', [ao()], null, m50);
    ok(b.matched.items[0].why === 'fullrefundold' && L.recs.length === 2 && L.recs[1].type === 'expense' && L.net() === 0, '13 支付宝先退款再原单：原单作为支出新增，净额 0');
  }
  {
    const L = ledger();                                   // 同一批里成对：两条都跳过、都登记成忽略；再导一次同样的文件，还是全跳过
    L.run('wechat', [wo(), wr()], null, m50);
    ok(L.recs.length === 0 && Object.values(L.orders).filter(e => e.st === 1).length === 2, '13 同一批全额退款的一对：都不写，两个单号登记成忽略');
  }
}

// ===== 15. 1016-E 退款记号收紧：先找真原单、180 天、一个只认一次、重复导入不变 =====
{
  const L0 = () => { const x = ledger(); return x; };
  const shopO = (mo, d) => wx({ time: T(mo, d, 12), cp: '某虚构咖啡', fen: 3000, status: '已全额退款' });
  const shopN = (mo, d) => wx({ time: T(mo, d, 12), cp: '某虚构咖啡', fen: 3000 });
  const shopR = (mo, d) => wx({ time: T(mo, d, 9), cp: '某虚构咖啡', kind: '某虚构咖啡-退款', io: 'income', fen: 3000, status: '已全额退款', no: wrno() });
  {
    // 9 月原单（退款不在文件里，选不要了 → 留下记号）→ 11 月同店同金额正常支出 → 12 月退款：挂到 11 月那笔，不被记号吃掉
    const L = L0();
    L.run('wechat', [shopO(9, 3)], pickAll('fullnorefund', 'drop'));
    const marks = Object.keys(L.orders).filter(k => k.includes('|RW'));
    ok(marks.length === 1 && marks[0].endsWith('20260903'), '15 9 月原单不要了：留下一个带原单日期的记号');
    L.run('wechat', [shopN(11, 5)]);
    const dec = [shopR(12, 2)];
    const b = L.run('wechat', dec);
    const nov = L.recs.find(r => r.type === 'expense');
    ok(b.matched.items[0].why === 'matchedledger' && L.recs.length === 2 && L.recs[1].refundOf === nov.id && L.net() === 0, '15 12 月的退款挂到 11 月那笔上，净额 0');
    ok(!Object.keys(L.orders).some(k => k.includes('|RU')), '15 记号没被用掉');
    const n = L.recs.length, again = L.run('wechat', dec);
    ok(L.recs.length === n && again.matched.items[0].why === 'imported', '15 同一份退款文件再导一次：没有任何新增');
  }
  {
    // 9 月原单不要了 → 10 月它的退款进来：认记号、跳过；再导一次：按忽略跳过，记号不会被第二次用
    const L = L0();
    L.run('wechat', [shopO(9, 3)], pickAll('fullnorefund', 'drop'));
    const oct = [shopR(10, 1)];
    const a = L.run('wechat', oct);
    ok(a.matched.items[0].why === 'origignored' && L.recs.length === 0 && Object.keys(L.orders).filter(k => k.includes('|RU')).length === 1, '15 180 天内的退款：认记号、跳过，记号登记成已用');
    ok(L.orders[a.matched.items[0].key].st === 1, '15 退款自己的单号登记成忽略');
    const b = L.run('wechat', oct);
    ok(b.matched.items[0].why === 'ignored' && L.recs.length === 0, '15 同一份文件再导一次：结果不变（按忽略跳过）');
    // 记号已经用过：同店同金额又来一笔退款（没有原单）→ 不再跳过
    const c = L.run('wechat', [shopR(10, 20)]);
    ok(c.matched.items[0].why === 'noorig' && L.recs.length === 1, '15 记号用过一次就作废：下一笔同店同金额的退款不会被吃掉');
  }
  {
    // 超过 180 天：不认记号，按普通找不到原单的退款
    const L = L0();
    L.run('wechat', [shopO(1, 3)], pickAll('fullnorefund', 'drop'));
    const a = L.run('wechat', [shopR(8, 1)]);
    ok(a.matched.items[0].why === 'noorig' && L.recs.length === 1, '15 原单之后超过 180 天的退款：不认记号，按找不到原单的退款处理');
  }
  {
    // 两个记号、两条退款：各认一个
    const L = L0();
    L.run('wechat', [shopO(9, 3), shopO(9, 10)], pickAll('fullnorefund', 'drop'));
    const a = L.run('wechat', [shopR(10, 1), shopR(10, 2)]);
    ok(a.matched.items.every(it => it.why === 'origignored') && new Set(a.matched.items.map(it => it.markerHit.key)).size === 2 && L.recs.length === 0, '15 两个记号、两条退款：各认一个');
    const b = L.run('wechat', [shopR(10, 3)]);
    ok(b.matched.items[0].why === 'noorig', '15 两个都用完了，第三条照常导入');
  }
}

// ===== 14. 一天账单太多、没试不同商家凑法：方案里带上是哪几天 =====
{
  const many = Array.from({ length: M.COMBO_DAY_MAX + 5 }, (_, i) => wx({ time: T(8, 8, 8 + Math.floor(i / 60), i % 60), cp: '虚构店' + i, fen: 100 + i }));
  const r = run([{ app: 'wechat', txns: many }], [man('big', 8, 8, 999999)]);
  ok(r.plan().sections.comboSkippedDays.join() === '2026-08-08', '14 一天超过 ' + M.COMBO_DAY_MAX + ' 笔：记下这一天，确认页加一行说明');
}

// ===== 12. 性质测试：随机账单 + 随机手记 + 随机改动 =====
{
  let s = 20261016;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  let bad = 0, notes = [];
  for (let k = 0; k < 150; k++) {
    const tx = [], manual = [], fullOrig = [];
    const n = 5 + Math.floor(rnd() * 25);
    for (let i = 0; i < n; i++) {
      const d = 1 + Math.floor(rnd() * 6), h = 8 + Math.floor(rnd() * 12), fen = pick([100, 200, 1200, 1500, 1980, 2680, 160, 3000, 5000, 10000]);
      const kind = pick(['商户消费', '商户消费', '商户消费', '转账', '扫二维码付款', '微信红包（单发）']);
      const cp = pick(['某虚构店甲', '某虚构店乙', '某虚构店丙', '*小玲', '张*', '虚构*数码科技旗舰店']);
      const io = kind === '商户消费' ? 'expense' : pick(['expense', 'income']);
      if (rnd() < 0.12 && io === 'expense') {   // 全额退款的一对
        const o = wx({ time: T(6, d, h), cp, fen, status: '已全额退款', kind }); tx.push(o); fullOrig.push(o);
        if (rnd() < 0.8) tx.push(wx({ time: T(6, d, h + 1), cp, fen, kind: cp + '-退款', io: 'income', status: '已全额退款', no: wrno() }));
        continue;
      }
      tx.push(wx({ time: T(6, d, h, Math.floor(rnd() * 59)), cp, kind, fen, io }));
    }
    const mN = Math.floor(rnd() * 12);
    for (let i = 0; i < mN; i++) manual.push(man('k' + k + 'm' + i, 6, 1 + Math.floor(rnd() * 7), pick([300, 400, 1400, 1500, 1950, 2840, 3000, 5000, 9553, 10000, 4900]), { type: rnd() < 0.85 ? 'expense' : 'income', hm: p2(8 + Math.floor(rnd() * 12)) + ':' + p2(Math.floor(rnd() * 59)) }));
    const r = run([{ app: 'wechat', txns: tx }], manual);
    const why = [];
    if (!conserved(r.matched, r.parsed)) why.push('守恒');
    // 全额退款的原单永远不会合并到手记（包括本批没有退款行的）
    if (fullOrig.some(t => ['merge'].includes(r.item(t).bucket) || r.item(t).bucket === 'add')) why.push('全额退款原单合并 / 新增了');
    // 个人转账只做精确：不会因为金额相近、部分付款、多笔合一进待处理
    if (r.matched.items.some(it => it.src === 'row' && ['near', 'partial', 'multisum', 'mixed'].includes(it.why) && M.isPersonal('wechat', r.parsed.files[0].rows[it.row], C.cleanCp))) why.push('个人转账做了非精确配对');
    // 多笔合一的每组：几笔之和 = 手记金额，而且同一天
    (r.matched.multiSums || []).forEach(g => g.options.forEach(o => {
      const sum = o.bills.reduce((x, b) => x + r.parsed.files[b.file].rows[b.row].fen, 0);
      const m = manual.find(x => x.id === o.record);
      if (!m || sum !== m.fen || o.bills.some(b => r.parsed.files[b.file].rows[b.row].time.slice(0, 10) !== m.time.slice(0, 10))) why.push('多笔合一金额 / 日期不对');
    }));
    // 去掉全额退款的那几对，别的账单的配对结果一样
    const pairNos = new Set(); r.matched.items.forEach(it => { if (it.src === 'row' && it.why === 'fullrefund') pairNos.add(r.parsed.files[0].rows[it.row].no); });
    if (pairNos.size) {
      const r0 = run([{ app: 'wechat', txns: tx.filter(t => !pairNos.has(t.no)) }], manual);
      const sig = rr => rr.matched.items.filter(it => it.src === 'row').map(it => [rr.parsed.files[0].rows[it.row].no, it.bucket, it.why, it.into || '', (it.cands || []).map(c => c.record).join('/')].join(':')).filter(x => !pairNos.has(x.split(':')[0])).sort().join('|');
      if (sig(r) !== sig(r0)) why.push('全额退款的一对影响了别的配对');
    }
    // 随机改动：守恒、差 0 分、手记不重复使用
    for (let e = 0; e < 4; e++) {
      const ed = { rows: {}, sums: {} };
      (r.matched.multiSums || []).forEach(g => { const v = rnd(); if (v < 0.4) ed.sums[g.id] = Math.floor(rnd() * g.options.length); else if (v < 0.6) ed.sums[g.id] = 'none'; });
      r.matched.items.forEach(it => {
        if (it.src !== 'row') return;
        const v = rnd();
        if (it.bucket === 'pending' && it.cands && it.cands.length && v < 0.5) ed.rows[it.key] = { pick: pick(it.cands).record ? { record: pick(it.cands).record } : 'new' };
        else if (it.bucket === 'pending' && v < 0.6) ed.rows[it.key] = { pick: pick(['new', 'drop']) };
        else if ((it.bucket === 'add' || it.bucket === 'neutral') && v < 0.2) ed.rows[it.key] = { mode: pick(['skip', 'flow', 'normal']) };
      });
      const pp = r.plan(ed);
      const units = Object.values(pp.counts).reduce((x, y) => x + y, 0);
      if (units !== r.parsed.files[0].stats.parsed.total) why.push('方案笔数');
      if (!diffOk(pp)) why.push('差额');
      if (!noReuse(pp)) why.push('手记重复使用');
      if (fullOrig.some(t => rowOf(pp, r.key(t)).group === 'merge')) why.push('改动后全额退款原单合并了');
    }
    if (why.length) { bad++; if (notes.length < 3) notes.push('#' + k + ' ' + why.join('、')); }
  }
  ok(bad === 0, '12 150 份随机账单：守恒、差 0 分、被合并的手记不重复使用、全额退款原单不合并、个人转账只做精确、多笔合一金额对 ' + notes.join(' | '));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})();
