// 1021-T14（实测 10-20 第 3 轮）第 4 步「分类」只列组：未分类和推荐把握低的都进组；按清洗后的对方归，平台 / 个人按清洗后的商品说明归
// （「品：…」，去数字、单号、括号）；只有 2 笔以上的列出来，其余算进 cpRest（照推荐入账、标待确认分类）；组上写商品说明、推荐、疑点；
// 按商品说明归的组选了分类不存规则；没选的写进账本带 rv。jsdom 那段：展开看逐笔、先显示 20 组。node zZzZt-step4-groups.test.js [index.html]。账单虚构。
const fs = require('fs'), path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), WR = require(path.join(IMP, 'write.js')), W = require(path.join(IMP, 'merchants.js'));
const A = require('./helpers/app');
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '购物', '游戏', '其他'];
let seq = 0;
const T = (mo, d, h) => ({ y: 2026, mo, d, h: h || 10, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '', cp: '某虚构科技有限公司', desc: '渠道测试 订单12345', io: 'expense', fen: 600, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const tx = [1, 2, 3].map(d => ali({ time: T(5, d), fen: 100 * d, desc: '渠道测试 订单' + (1000 + d) }))
  .concat([ali({ time: T(5, 4), cp: '淘宝闪购', desc: '果切（示例店）' }), ali({ time: T(5, 5), cp: '淘宝闪购', desc: '果切（示例二店）' })])
  .concat([ali({ time: T(5, 6), cp: '只来一次的店', desc: '不知道' })]);
const parsed = P.parseFiles([{ name: 'a.csv', data: B.ab(B.bill('alipay', tx, { range: RANGE }).bytes) }]);
const routed = R.route(parsed, { known: {} });
const matched = M.match(routed, parsed, { manual: [], cats: CATS, merchants: W });
const input = { parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] };
const p = PL.plan(input, {});
const g1 = p.sections.cpGroups.find(g => g.cp === '某虚构科技有限公司');
ok(g1 && g1.n === 3 && g1.by === 'cp' && g1.descs[0] === '渠道测试 订单', '1 按对方归：3 笔一组，商品说明去掉数字后写在组上：' + JSON.stringify(g1 && g1.descs));
const g2 = p.sections.cpGroups.find(g => g.cp === '品：果切');
ok(g2 && g2.n === 2 && g2.by === 'desc', '1 平台（淘宝闪购）按商品说明归，去掉括号里的店名：「品：果切」');
ok(!p.sections.cpGroups.some(g => g.cp === '只来一次的店') && p.sections.cpRest.n === 1, '1 只有 1 笔的不列组，算进其余 1 笔');
ok(g1.doubts.length === 0 || g1.doubts.every(x => typeof x === 'string'), '1 疑点是一句句的话');
// 选了分类：对方组存规则，商品说明组不存
const p2 = PL.plan(input, { cpCats: { '某虚构科技有限公司': '游戏', '品：果切': '餐饮' } });
const ws = WR.build(input, p2, { batch: 'b1', at: '2026-10-20T10:00', cpCats: { '某虚构科技有限公司': '游戏', '品：果切': '餐饮' } });
const kws = (ws.rules || ws.rulesAdd || (ws.log && ws.log.rulesAdded && ws.log.rulesAdded.cat) || []).map(r => r.kw);
ok(kws.includes('某虚构科技有限公司') && !kws.some(k => /^品：/.test(k)), '2 对方组存规则、按商品说明归的组不存：' + kws.join('、'));
ok(ws.records.filter(r => r.cat === '游戏').length === 3 && ws.records.filter(r => r.cat === '餐饮').length === 2 && ws.records.filter(r => r.rv).length === 1, '2 选了的不带 rv，没进组的那 1 笔带 rv');
const ws0 = WR.build(input, p, { batch: 'b1', at: '2026-10-20T10:00' });
ok(ws0.records.filter(r => r.rv).length === 6, '2 什么都不选：6 笔都照推荐入账、带 rv');

(async () => {
  // jsdom：展开看逐笔；超过 20 组「再显示」
  const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
  const many = [];
  for (let i = 0; i < 23; i++) for (let j = 0; j < 2; j++) many.push(ali({ time: T(6, 1 + (i % 27), 8 + j), cp: '某虚构商户' + String.fromCharCode(0x4e00 + i), desc: '虚构' }));
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-20T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles([['b.csv', B.bill('alipay', many, { range: RANGE }).bytes]], () => {}, { noGo: true, stay: true });
  const UI = t.w.JiwenImportUI; UI._goStep('cat');
  const rows = () => [...t.d.querySelectorAll('.imp-cp-row')];
  ok(rows().length === 20 && t.d.querySelector('.imp-cp-more') && t.S().plan.sections.cpGroups.length === 23 && /还有 3 组/.test(t.d.querySelector('.imp-cp-more').textContent), '3 23 组先显示 20 组，「再显示 3 组（还有 3 组）」：' + rows().length + ' / ' + (t.S() && t.S().plan && t.S().plan.sections.cpGroups.length) + ' ' + (t.S() && t.S().view.step));
  t.d.querySelector('.imp-cp-more').click();
  ok(rows().length === 23, '3 点了全显示出来');
  t.d.querySelector('.imp-cp-toggle').click();
  // 1021-T17：「看这 2 笔」打开共用的「这几笔」面板（不再在卡片里展开）；卡片只写名字、笔数、金额、推荐，理由在面板顶上
  ok(t.d.querySelectorAll('#impRows .imp-rs').length === 2 && /看这 2 笔/.test(t.d.querySelector('.imp-cp-toggle').textContent) && !/→ 选个分类/.test(rows()[0].textContent), '4 「看这 2 笔」打开面板逐笔');
  t.d.getElementById('impRowsClose').click();
  ok(!t.d.getElementById('impLowConf'), '4 「推荐要你看一眼」单笔那一块没有了');
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
