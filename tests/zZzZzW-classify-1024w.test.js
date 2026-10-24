// 1024-W（实测 10-24：新存档一次导全年 2148 笔，分类要看 1488 件）：
//   ① 只在商品说明里认出的：对方是普通商户（不是平台、不是什么都卖的、不是个人）→ 把握中（原来一律低）；
//   ② 和个人之间的（转账、红包、扫个人收钱码），前面都没认出来的 → 推「转账红包」（落你的「转账」），把握低、标 person；
//      确认页合成一组「（和个人之间的转账、红包、收钱码）」一次定、不存规则；配对时不拿它当分类依据；
//   ③ 导入量度多一组 rest：「要你看 · 分类」里不是推不出、也不是把握低的（新建分类的 / 不到 3 笔并进其他的 / 别的）。
//   数据全是虚构的。
const path = require('path');
const B = require('./helpers/bills');
const IMP = path.join(__dirname, '..', 'www', 'import');
const C = require(path.join(IMP, 'classify.js')), W = require(path.join(IMP, 'merchants.js'));
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js')), PL = require(path.join(IMP, 'plan.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '餐饮', '购物', '转账', '工资', '红包', '其他'];
const one = r => C.classify([Object.assign({ app: 'wechat', desc: '', kind: '商户消费', io: 'expense' }, r)], { cats: CATS, merchants: W }).recs[0];
// ① 商品说明
const a = one({ cp: '某虚构小铺', desc: '外卖' });
ok(a.cat === '餐饮' && a.conf === 'mid', '1 普通商户、商品说明里认出 → 把握中：' + a.reason);
ok(one({ cp: '美团', desc: '外卖' }).conf === 'low', '1 对方是平台：照旧低');
ok(one({ cp: '某虚构昵称', desc: '外卖', kind: '转账' }).conf === 'low', '1 和个人之间的：照旧低');
// ② 和个人之间的
const p1 = one({ cp: '某虚构昵称', kind: '转账' }), p2 = one({ cp: '某虚构昵称', kind: '微信红包（单发）', io: 'income' });
const p3 = one({ cp: '某虚构摊主', kind: '扫二维码付款', desc: '二维码收款' }), p4 = one({ cp: '某虚构文具店', kind: '扫二维码付款', desc: '二维码收款' });
ok(p1.cat === '转账' && p1.conf === 'low' && p1.person && /付给个人的/.test(p1.reason), '2 转账给个人 → 转账（把握低、person）：' + p1.reason);
ok(p2.cat === '转账' && p2.person && /个人转给你的/.test(p2.reason), '2 收到个人的红包 → 转账：' + p2.reason);
ok(p3.person && p3.cat === '转账', '2 扫个人收钱码 → 转账');
ok(!p4.person && p4.layer === 'none', '2 扫码付给带「店」的：不算个人');
ok(one({ cp: '某虚构小铺' }).layer === 'none', '2 普通商户消费：照旧推不出');
const p5 = C.classify([{ app: 'wechat', cp: '某虚构昵称', desc: '', kind: '转账', io: 'expense' }], { cats: ['未分类', '餐饮', '其他'], merchants: W });
ok(p5.recs[0].layer === 'none' && p5.recs[0].person && !p5.newCats.length, '2 存档里没有转账 / 红包这类分类：不推荐、不建新分类，只标 person');
// 确认页合成一组
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '转账', cp: '某虚构甲', desc: '/', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const TX = [wx({ time: T(1), cp: '某虚构甲', fen: 1001 }), wx({ time: T(2), cp: '某虚构乙', fen: 2002 }), wx({ time: T(3), cp: '某虚构丙', kind: '微信红包（单发）', fen: 666 }),
  wx({ time: T(4), cp: '某虚构小铺', kind: '商户消费', fen: 1500 }), wx({ time: T(5), cp: '某虚构小铺', kind: '商户消费', fen: 1600 })];
const parsed = P.parseFiles([{ name: 'w.csv', data: B.ab(B.bill('wechat', TX, { range: { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' } }).bytes) }]);
const matched = M.match(R.route(parsed, { known: {} }), parsed, { manual: [], cats: CATS, merchants: W });
const p = PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, {});
const pg = p.sections.cpGroups.find(g => /^（和个人之间/.test(g.cp));
ok(pg && pg.n === 3 && !pg.kw, '3 三个人的转账、红包合成一组（不带规则关键词）：' + JSON.stringify(p.sections.cpGroups.map(g => [g.cp, g.n])));
ok(p.sections.cpGroups.some(g => g.cp === '某虚构小铺' && g.n === 2), '3 商户照旧按对方归组');
const mm = PL.measure(p, { cat: p.sections.cpGroups.map(g => ({ id: 'cp:' + g.cp, keys: g.keys })) }, { total: 5, path: 'quick' });
ok(mm.low.person === 3 && mm.none.shop === 2 && mm.rest && mm.rest.other === 0, '4 量度：和个人之间的算把握低里的 person，商户算推不出：' + JSON.stringify({ low: mm.low, none: mm.none, rest: mm.rest }));
console.log(`1024-W 分类：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
