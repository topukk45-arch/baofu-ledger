// 导入简化第 10 版：从手记备注学 + 两家互借借账本。
//   ① 你自己记的（没有导入来源的，合并过账单的也算）备注整句 × 收支 × 分类数一遍（archiveInfo().remarkHist）：账单的商品说明或清洗后的对方
//      和某句备注一模一样、同收支至少 2 次、八成以上同一类 → 推荐那一类（把握中，layer 'remark'，导入量度里算「账本历史」）。只认整句，不分词。
//   ② 两家互借：原来只借这一批里的支付宝行，现在也借账本里以前导进来的支付宝记录（archiveInfo().aliHist：对方 → 原始分类的次数）。
//   数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile), IMP = path.join(WWW, 'import');
const C = require(path.join(IMP, 'classify.js')), W = require(path.join(IMP, 'merchants.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '吃饭', '购物', '其他', '杂项'];
const row = o => Object.assign({ app: 'wechat', cp: '某虚构个体户', desc: '/', kind: '商户消费', io: 'expense' }, o);
// ===== 1. classify =====
{
  const rmk = { '虚构果切': { e: { 吃饭: 3 }, i: {} }, '虚构一次': { e: { 吃饭: 1 }, i: {} }, '虚构对半': { e: { 吃饭: 1, 购物: 1 }, i: {} }, '某虚构摊': { e: { 杂项: 2 }, i: {} } };
  const r = C.classify([row({ desc: '虚构果切' }), row({ desc: '虚构一次' }), row({ desc: '虚构对半' }), row({ desc: '虚构果切一份' }), row({ cp: '某虚构摊', desc: '/' }), row({ desc: '虚构果切', io: 'income' })],
    { cats: CATS, merchants: W, remarks: rmk }).recs;
  ok(r[0].cat === '吃饭' && r[0].layer === 'remark' && r[0].conf === 'mid' && /你记账时备注「虚构果切」的 3 次都记成「吃饭」/.test(r[0].reason), '1 商品说明和备注「虚构果切」一样（3 次都是吃饭）→ 吃饭：' + r[0].reason);
  ok(r[1].layer !== 'remark' && r[2].layer !== 'remark', '1 只有 1 次的、两类各一半的：不学');
  ok(r[3].layer !== 'remark', '1 只认整句：「虚构果切一份」不算');
  ok(r[4].cat === '杂项' && r[4].layer === 'remark', '1 清洗后的对方和备注一样也算');
  ok(r[5].layer !== 'remark', '1 收支不一样不算');
  const r2 = C.classify([row({ cp: '某虚构小馆' })], { cats: CATS, merchants: W, aliHist: { '某虚构小馆': { '餐饮美食': 3 } } }).recs[0];
  ok(r2.cat === '吃饭' && r2.layer === 'borrow' && /支付宝里「某虚构小馆」是餐饮美食/.test(r2.reason), '1 微信行借账本里以前导进来的支付宝记录：某虚构小馆 → 餐饮美食 → 吃饭');
  const r3 = C.classify([row({ cp: '某虚构小馆' })], { cats: CATS, merchants: W, aliHist: { '某虚构小馆': { '餐饮美食': 2 } }, borrowRows: [{ cp: '某虚构小馆', kind: '日用百货' }, { cp: '某虚构小馆', kind: '日用百货' }] }).recs[0];
  ok(r3.layer !== 'borrow', '1 这一批和账本打平（2 比 2）：不借');
}
// ===== 2. jsdom 真导 =====
(async () => {
  const SEED = [{ id: 'h1', time: '2026-09-01T12:00', money: 12, type: 'expense', cat: '吃饭', remark: '虚构果切' }, { id: 'h2', time: '2026-09-05T12:00', money: 13, type: 'expense', cat: '吃饭', remark: '虚构果切' },
    { id: 'h3', time: '2026-09-06T12:00', money: 14, type: 'expense', cat: '杂项', remark: '某虚构商品', src: { app: 'wechat' }, batch: 'b0', cp: 0 },
    { id: 'h4', time: '2026-09-07T12:00', money: 14, type: 'expense', cat: '杂项', remark: '某虚构商品', src: { app: 'wechat' }, batch: 'b0', cp: 0 },
    { id: 'p1', time: '2026-09-02T12:00', money: 30, type: 'expense', cat: '吃饭', remark: '', src: { app: 'alipay' }, batch: 'b0', cp: 1, oc: '餐饮美食' },
    { id: 'p2', time: '2026-09-03T12:00', money: 31, type: 'expense', cat: '吃饭', remark: '', src: { app: 'alipay' }, batch: 'b0', cp: 1, oc: '餐饮美食' }];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(SEED, CATS, { cps: ['某虚构甲', '某虚构小馆'] }), now: '2026-10-21T10:00:00' });
  const info = t.st().archiveInfo();
  ok(info.remarkHist['虚构果切'] && info.remarkHist['虚构果切'].e['吃饭'] === 2 && !info.remarkHist['某虚构商品'], '2 archiveInfo().remarkHist：只数你自己记的备注（导入的不算）');
  ok(info.aliHist['某虚构小馆'] && info.aliHist['某虚构小馆']['餐饮美食'] === 2, '2 archiveInfo().aliHist：以前导进来的支付宝记录');
  let seq = 0;
  const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构个体户', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
  const T = d => ({ y: 2026, mo: 10, d, h: 12, mi: 0, s: 0 });
  const r = await t.importFiles([['微信.csv', B.bill('wechat', [wx({ time: T(3), desc: '虚构果切', fen: 1200 }), wx({ time: T(4), cp: '某虚构小馆', fen: 3300 })], { range: { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' } }).bytes]], null, { noGo: true, stay: true });
  const d1 = r.plan.rows.find(d => d.fen === 1200), d2 = r.plan.rows.find(d => d.fen === 3300);
  ok(d1.cat === '吃饭' && d1.rec.layer === 'remark', '2 真导：商品说明「虚构果切」→ 吃饭（从手记备注学）');
  ok(d2.cat === '吃饭' && d2.rec.layer === 'borrow', '2 真导：微信「某虚构小馆」借账本里的支付宝 → 吃饭');
  A.clickGo(t.w);
  await t.until(() => t.d.getElementById('impResult'), 30000); await t.idle();
  const lg = (await t.logs()).pop();
  ok(lg.m && lg.m.layer.history === 1 && lg.m.layer.borrow === 1, '2 导入量度：从手记备注学的算「账本历史」：' + JSON.stringify(lg.m && lg.m.layer));
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 10 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
