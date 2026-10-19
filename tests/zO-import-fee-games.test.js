// 1.1（1016-Z4）提现服务费、游戏词表。node zO-import-fee-games.test.js [index.html]
// 提现服务费：微信零钱提现备注里有「服务费¥2.20」→ 提现照旧不计入，服务费单独记一笔支出；再导不重复；撤销一起删。
// 游戏词：「首充、月卡、战令、钻石、元宝、点券、皮肤、抽卡」→ 游戏（把握中）；「礼包」→ 游戏（把握低、最后才看），
// 说明里有流量、零食这类词时听那些词；存档里没有「游戏」分类就不推荐、不新建。
// 用例照需求文档：「七日秒杀礼包」→ 游戏（低）、「5G 流量礼包」→ 充值缴费、「中秋零食大礼包」→ 购物。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const C = require('../www/import/classify.js'), M = require('../www/import/merchants.js');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));

(async () => {
  // ===== 1. 游戏词（纯计算）=====
  {
    const rows = [['某虚构网络', '七日秒杀礼包'], ['某虚构公司', '5G 流量礼包'], ['某虚构商家', '中秋零食大礼包'], ['某虚构网络科技', '60元首充'],
                  ['某虚构互娱', '月卡'], ['某虚构商家乙', '新人礼包']].map(([cp, desc]) => ({ app: 'wechat', cp, desc, io: 'expense' }));
    const on = C.classify(rows, { cats: ['未分类', '吃饭', '购物', '话费', '游戏', '其他'], merchants: M }).recs;
    ok(on[0].cat === '游戏' && on[0].conf === 'low', '1 「七日秒杀礼包」→ 游戏（把握低）');
    ok(on[1].cat === '话费', '1 「5G 流量礼包」→ 充值缴费（落到存档的「话费」）');
    ok(on[2].cat === '购物', '1 「中秋零食大礼包」→ 购物');
    ok(on[3].cat === '游戏' && on[3].conf === 'mid' && on[4].cat === '游戏' && on[4].conf === 'mid', '1 首充、月卡 → 游戏（把握中）');
    ok(on[5].cat !== '游戏', '1 「新人礼包」：有「新人」，不当游戏');
    const off = C.classify(rows, { cats: ['未分类', '吃饭', '购物', '其他'], merchants: M });
    ok(!off.recs.some(r => r.cat === '游戏') && !off.newCats.some(n => n.name === '游戏'), '1 存档里没有「游戏」分类：不推荐、不建议新建');
    ok(M.games && M.games.strong.length === 8 && same(M.games.weak, ['礼包']), '1 词表：8 个强的游戏词、「礼包」一个弱的');
  }
  // ===== 2. 提现服务费 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    const D0 = await t.dump();
    const W = [wx({ time: T(10, 8, 10), kind: '零钱提现', cp: '某虚构银行(尾号0000)', desc: '/', io: 'neutral', fen: 10000, status: '提现已到账', remark: '服务费¥2.20' }),
               wx({ time: T(10, 9, 10), kind: '零钱提现', cp: '某虚构银行(尾号0000)', desc: '/', io: 'neutral', fen: 5000, status: '提现已到账', remark: '服务费¥0.00' })];
    const F = [['微信.csv', B.bill('wechat', W, { range: RANGE }).bytes]];
    let fee = '', ov = '', tile = '';
    const r = await t.importFiles(F, () => {
      fee = t.$('impFees') ? t.$('impFees').textContent : '';
      // 1017-UI6 核对：分步以后，服务费那一句和新建条数在「总览」上看得到（不靠自动跳步去找）
      t.w.JiwenImportUI._goStep('overview');
      const fe = t.d.getElementById('impFees'), tl = t.d.getElementById('impTiles');
      ov = t.w.JiwenImportUI._state().view.step + '|' + (fe ? fe.textContent : ''); tile = tl ? tl.textContent : '';
    }, { stay: true });
    ok(/^overview\|零钱提现的服务费 1 笔，共 2\.20 元/.test(ov) && /新建\s*3\s*条/.test(tile), '2 总览上看得到：服务费那一句、新建 3 条（含服务费）：' + ov + ' / ' + tile);
    ok(/零钱提现的服务费 1 笔，共 2\.20 元，单独记成支出（分类「其他」/.test(fee), '2 确认页写明服务费单独记成支出：' + fee);
    ok(r.plan.records === 3, '2 新建 3 条（两笔提现 + 一笔服务费）');
    t.$('impBackToLedger').click(); await t.idle();
    const recs = t.recs();
    const wd = recs.filter(x => x.oc === '零钱提现');
    const f = wd.find(x => x.money === 2.2);
    ok(wd.length === 3 && f && f.type === 'expense' && !f.skip && !f.flow && f.cat === '其他' && f.remark === '零钱提现服务费' && wd.filter(x => x.skip).length === 2, '2 提现两笔照旧不计入；服务费 2.20 记成支出（计入）');
    const again = await t.importFiles(F, null, { noGo: true });
    ok(again.plan.records === 0 && !again.plan.sections.fees.length, '2 再导：提现跳过，服务费也不再记');
    await t.w.eval('JiwenImportEntry.loadImportUI')();
    const [lg] = await t.logs(); const p = await t.st().undoPlan(lg.b); await t.st().undo(p); await t.idle();
    ok(same(await t.dump(), D0), '2 撤销：服务费一起删，和导入前逐字节一样');
    ok(!t.errs.length, '2 无报错 ' + t.errs.join('|'));
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
