// 1016-M 类型规则：确认页「没见过的交易类型 / 状态」选了处理方式就存进 importRules.type、写进导入记录 rulesAdded.type，
// 下次直接照办、不再问；没选的照收支导入、放「其他」，下次还问；选过的行重算后还在、能改回去；
// 撤销这次导入时类型规则一起删；write.js 不重复存已有的规则。账单全是虚构的。node z6-import-type-rules.test.js [index.html]
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const W = require('../www/import/write.js');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = txns => B.bill('wechat', txns, { range: RANGE }).bytes;
const select = (t, sel, v) => { sel.value = v; sel.dispatchEvent(new t.w.Event('change')); };

(async () => {
  // ===== 1. write.js：只存选了的、不重复存已有的 =====
  {
    const ctx = { batch: 'b1', at: '2026-12-20T10:00', types: { 'wechat|群收款': 'transfer', 'wechat|某虚构类型': 'normal', 'wechat|坏的': 'bogus', 'wechat|某退款类型': 'refund' }, statuses: { 'wechat|某虚构状态': 'skip' } };
    const info = { cats: ['未分类'], typeRules: [{ app: 'wechat', type: '某虚构类型', as: 'skip' }] };
    const p = { rows: [], sections: { newCats: [] }, counts: {} };
    let ws = null;
    try { ws = W.build({ parsed: { files: [] }, matched: { items: [] }, info, manualById: {} }, p, ctx); } catch (e) { console.log('    build 出错：' + e.message); }
    ok(ws && same(ws.typesAdd, [{ app: 'wechat', type: '某退款类型', as: 'refund' }, { app: 'wechat', type: '群收款', as: 'transfer' }, { app: 'wechat', status: '某虚构状态', as: 'skip' }]),
      '1 typesAdd：选了的存、已有规则的不重复、不认识的处理方式不存（1016-Z2 起「当退款」也存）' + JSON.stringify(ws && ws.typesAdd));
    ok(ws && same(ws.log.rulesAdded.type, ws.typesAdd), '1 导入记录 rulesAdded.type 和 typesAdd 一样');
  }

  // ===== 2. jsdom 真导：第一次选了 → 存规则；第二次不再问、照办 =====
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const { $, d } = t;
  const F1 = [wx({ time: T(10, 1), kind: '群收款', cp: '某虚构群', io: 'income', fen: 3000, status: '已收钱' }),
              wx({ time: T(10, 2), kind: '群收款', cp: '某虚构群', io: 'income', fen: 2000, status: '已收钱' }),
              wx({ time: T(10, 3), kind: '某虚构新类型', cp: '某虚构店', fen: 900 }),
              wx({ time: T(10, 4), cp: '某虚构面馆', fen: 1500 })];
  const D0 = await t.dump();
  let rowsKeptOk = false, statusSeen = false;
  const r1 = await t.importFiles([['微信1.csv', bill(F1)]], S => {
    const card = $('impTypes');
    ok(card && /群收款/.test(card.textContent) && /某虚构新类型/.test(card.textContent) && /记成规则/.test(card.textContent), '2 第一次：问没见过的类型，写明会记成规则');
    statusSeen = !!(card && /已收钱/.test(card.textContent));
    const sel = [...d.querySelectorAll('.imp-type-sel')].find(s => /群收款/.test(s.closest('.imp-row-opt').textContent));
    select(t, sel, 'transfer');
    const st = [...d.querySelectorAll('.imp-status-sel')].find(s => /已收钱/.test(s.closest('.imp-row-opt').textContent));
    if (st) select(t, st, 'import');
  }, { noGo: true, stay: true });
  ok(statusSeen, '2 没见过的状态「已收钱」也问了');
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan && t.S().plan.counts.neutral === 2);
  {
    const sel = [...d.querySelectorAll('.imp-type-sel')].find(s => /群收款/.test(s.closest('.imp-row-opt').textContent));
    rowsKeptOk = !!sel && sel.value === 'transfer';
    ok(rowsKeptOk, '2 选过的「群收款」重算后还在，显示选的「当转账」');
    ok(t.S().plan.groups.neutral.filter(x => x.kind === '群收款').length === 2, '2 两笔群收款挪进不计入');
  }
  $('impGo').click();
  await t.until(() => $('impResult'));
  $('impBackToLedger').click(); await t.idle();
  {
    const ir = t.arch().importRules || {};
    const [lg] = await t.logs();
    const want = [{ app: 'wechat', type: '群收款', as: 'transfer' }, { app: 'wechat', status: '已收钱', as: 'import' }];
    ok(same(ir.type, want), '2 存档里存了类型规则 ' + JSON.stringify(ir.type));
    ok(same(lg.rulesAdded.type, want), '2 导入记录 rulesAdded.type 记了同样两条');
    ok(!JSON.stringify(ir).includes('某虚构新类型'), '2 没选的类型不存');
    const neu = t.recs().filter(r => r.oc === '群收款');
    ok(neu.length === 2 && neu.every(r => r.skip === true), '2 写进去的群收款是不计入');
  }
  // 第二次：同样的类型直接照办，不再问；没选过的还问
  const F2 = [wx({ time: T(11, 1), kind: '群收款', cp: '某虚构群', io: 'income', fen: 4000, status: '已收钱' }),
              wx({ time: T(11, 2), kind: '某虚构新类型', cp: '某虚构店', fen: 800 })];
  const r2 = await t.importFiles([['微信2.csv', bill(F2)]], S => {
    const card = $('impTypes');
    ok(card && !/群收款/.test(card.textContent) && !/已收钱/.test(card.textContent) && /某虚构新类型/.test(card.textContent), '3 第二次：群收款和「已收钱」不再问，没选过的「某虚构新类型」还问');
  });
  {
    const g = t.recs().filter(r => r.oc === '群收款');
    ok(g.length === 3 && g.every(r => r.skip === true), '3 第二次的群收款按规则当转账（不计入）');
    const nt = r2.plan.rows.find(x => x.kind === '某虚构新类型');
    ok(nt && nt.group === 'add' && nt.tags.indexOf('otherType') >= 0, '3 没选的照收支导入、标在「其他」');
    const [, lg2] = await t.logs();
    ok(same(lg2.rulesAdded.type, []), '3 第二次没新加类型规则');
  }
  // ===== 4. 撤销第一次（第二次用了它没有？类型规则不算依赖）：规则一起删 =====
  {
    const logs = await t.logs();
    await t.w.eval('loadImportUI')();
    let p = await t.st().undoPlan(logs[1].b); await t.st().undo(p); await t.idle();
    p = await t.st().undoPlan(logs[0].b);
    ok(p.chain.length === 1 && p.steps[0].typesRemoved === 2, '4 撤第一次：删掉 2 条类型规则');
    await t.st().undo(p); await t.idle();
    ok(!t.arch().importRules && same(await t.dump(), D0), '4 撤完没有规则了，和导入前逐字节一样');
  }

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
