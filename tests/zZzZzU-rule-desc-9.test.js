// 导入简化第 9 版：规则认商品说明 + 关键词收缩。
//   ① 规则多一种 on:'desc'：商品说明里有这个词就归过去；先认交易对方的规则，再认商品说明的。
//   ② 「按对方选分类」选了分类存成规则时，关键词自动收短（去括号、公司后缀、末尾的分店名；「花店」这种店名本身不收），确认页能「改关键词」；
//      按商品说明归的组（「品：果切」）存成认商品说明的规则。撤销那次导入时规则一起删；「管理导入规则」里写「商品说明「果切」」。
//   数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile), IMP = path.join(WWW, 'import');
const C = require(path.join(IMP, 'classify.js')), W = require(path.join(IMP, 'merchants.js'));
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js')), PL = require(path.join(IMP, 'plan.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const CATS = ['未分类', '吃饭', '购物', '游戏', '其他', '杂项'];
// ===== 1. classify：认商品说明的规则 =====
{
  const rules = [{ kw: '果切', cat: '吃饭', on: 'desc' }, { kw: '某虚构水果', cat: '购物' }];
  const r = C.classify([{ app: 'alipay', cp: '*小明', desc: '果切一份', kind: '其他', io: 'expense' }, { app: 'alipay', cp: '某虚构水果铺', desc: '果切一份', kind: '其他', io: 'expense' },
    { app: 'alipay', cp: '*小明', desc: '苹果', kind: '其他', io: 'expense' }], { cats: CATS, rules, merchants: W }).recs;
  ok(r[0].cat === '吃饭' && r[0].layer === 'rule' && r[0].on === 'desc' && /商品说明里有「果切」/.test(r[0].reason), '1 商品说明里有「果切」→ 吃饭（你的规则）');
  ok(r[1].cat === '购物' && !r[1].on, '1 对方规则先认：某虚构水果铺 → 购物（不看商品说明的规则）');
  ok(r[2].layer !== 'rule', '1 商品说明里没有那个词：不归');
}
// ===== 2. 关键词收缩 =====
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '', cp: '某虚构店', desc: '虚构', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const TX = [1, 2].map(d => ali({ time: T(d), cp: '某虚构甲记朝阳店', fen: 1800 + d })).concat([3, 4].map(d => ali({ time: T(d), cp: '某虚构丁丁花店', fen: 600 + d })))
  .concat([5, 6].map(d => ali({ time: T(d), cp: '某虚构网络科技有限公司', fen: 600 + d })))
  .concat([7, 8].map(d => ali({ time: T(d), cp: '*小明', desc: '果切（示例店）', fen: 1200 + d })));
{
  const parsed = P.parseFiles([{ name: 'a.csv', data: B.ab(B.bill('alipay', TX, { range: RANGE }).bytes) }]);
  const matched = M.match(R.route(parsed, { known: {} }), parsed, { manual: [], cats: CATS, merchants: W });
  const p = PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, {});
  const kw = cp => (p.sections.cpGroups.find(g => g.cp === cp) || {}).kw;
  ok(kw('某虚构甲记朝阳店') === '某虚构甲记', '2 「某虚构甲记朝阳店」→「某虚构甲记」（去掉分店名）');
  ok(kw('某虚构丁丁花店') === '某虚构丁丁花店', '2 「某虚构丁丁花店」不收（店名本身就是花店）');
  ok(kw('某虚构网络科技有限公司') === '某虚构网络科技', '2 「…有限公司」去掉公司后缀：' + kw('某虚构网络科技有限公司'));
  ok(kw('品：果切') === '果切', '2 按商品说明归的组：关键词就是商品说明「果切」');
  const p2 = PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, { cpKw: { '某虚构丁丁花店': '虚构便利' } });
  ok((p2.sections.cpGroups.find(g => g.cp === '某虚构丁丁花店')||{}).kw === '虚构便利', '2 确认页改过的关键词照改的');
}
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles([['a.csv', B.bill('alipay', TX, { range: RANGE }).bytes]], null, { noGo: true, stay: true });
  t.w.JiwenImportUI._goStep('cat');
  const pick = async (cp, cat) => {
    t.d.querySelector('.imp-cp-row[data-cp="' + cp + '"]').click(); await tick();
    [...t.d.querySelectorAll('#uiSheetBody .cc, #uiPickList .cc')].find(x => x.textContent.trim() === cat).click(); await tick();
  };
  await pick('某虚构甲记朝阳店', '吃饭'); await pick('某虚构丁丁花店', '购物'); await pick('品：果切', '吃饭');
  const kl = cp => [...t.d.querySelectorAll('.imp-cp-kw')].find(x => x.dataset.of === 'cp:' + cp);
  ok(kl('某虚构甲记朝阳店') && /以后对方里有「某虚构甲记」的都记成「吃饭」/.test(kl('某虚构甲记朝阳店').textContent), '3 选了分类的组写「以后对方里有「某虚构甲记」的都记成「吃饭」」');
  ok(kl('品：果切') && /以后商品说明里有「果切」的都记成「吃饭」/.test(kl('品：果切').textContent), '3 按商品说明归的组写「以后商品说明里有「果切」……」');
  ok(!kl('某虚构网络科技有限公司'), '3 没选分类的组不写');
  kl('某虚构丁丁花店').querySelector('.imp-cp-kwedit').click(); await tick();
  ok(t.ask() && t.ask().title === '改关键词' && $('askInput').value === '某虚构丁丁花店', '3 「改关键词」：输入框里是现在的关键词');
  $('askInput').value = '虚构便利'; await t.askOk(); await tick();
  ok(/以后对方里有「虚构便利」的/.test(kl('某虚构丁丁花店').textContent), '3 改好了');
  A.clickGo(t.w);
  await t.until(() => $('impResult'), 30000); await t.idle();
  const rules = () => ((t.arch().importRules || {}).cat || []);
  ok(rules().some(r => r.kw === '某虚构甲记' && r.cat === '吃饭' && !r.on) && rules().some(r => r.kw === '虚构便利' && r.cat === '购物') && rules().some(r => r.kw === '果切' && r.cat === '吃饭' && r.on === 'desc'), '4 存了 3 条规则（收短的、改过的、认商品说明的）：' + JSON.stringify(rules()));
  $('impBackToLedger').click(); await t.idle();
  // 下一次：别的分店、别人卖的果切都归过去
  const R2 = { from: '2026-10-21 00:00:00', to: '2026-10-21 23:59:59' };
  const r2 = await t.importFiles([['b.csv', B.bill('alipay', [ali({ time: { y: 2026, mo: 10, d: 21, h: 9, mi: 0, s: 0 }, cp: '某虚构甲记海淀店', fen: 2100 }), ali({ time: { y: 2026, mo: 10, d: 21, h: 10, mi: 0, s: 0 }, cp: '*小红', desc: '果切', fen: 1500 })], { range: R2 }).bytes]], null, { noGo: true, stay: true });
  const rr = fen => r2.plan.rows.find(d => d.src === 'row' && d.fen === fen);
  ok(rr(2100).cat === '吃饭' && rr(2100).rec.layer === 'rule' && rr(1500).cat === '吃饭' && rr(1500).rec.on === 'desc', '4 下一次：「某虚构甲记海淀店」、「*小红」卖的果切都按规则归到吃饭');
  A.clickCancel(t.w); await t.idle();
  // 管理导入规则
  t.w.JiwenImportUI.openRules(); await t.until(() => $('impRulesCat'));
  const dr = t.d.querySelector('#impRulesCat .imp-rule-row[data-on="desc"]');
  ok(dr && /商品说明「果切」→/.test(dr.textContent), '5 管理导入规则：「商品说明「果切」→ 吃饭」');
  t.w.JiwenImportUI.close();
  // 备份照带 on
  $('exportBtn').click(); await t.until(() => t.w.__files.length);
  await t.w.JiwenStore.importArchiveFromText(t.w.__files[t.w.__files.length - 1], A.ID); await t.idle();
  const names = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives), a2 = names[names.length - 1];
  ok(((t.w.JiwenStore.loadStore(A.ID).archives[a2].importRules || {}).cat || []).some(r => r.kw === '果切' && r.on === 'desc'), '7 导入备份：认商品说明的规则照带');
  // 撤销：规则一起删
  const lg = (await t.logs()).pop();
  const up = await t.st().undoPlan(lg.b); await t.st().undo(up); await t.idle();
  ok(!rules().length, '6 撤销那次导入：3 条规则一起删');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 9 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
