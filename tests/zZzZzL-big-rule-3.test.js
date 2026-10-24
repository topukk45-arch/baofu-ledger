// 导入简化第 3 版：记住大额的选法（importRules 新一类 big）。核对页「大额，先定算不算收支」点过的那一笔，导入时记成
//   { cp: 清洗后的对方, fen: 那次的金额, mode, ob }；以后同一对方、金额相近（差不超过 20%）的支出默认照那次的选法、不再问，完成页提醒写「照你上次的选法」。
//   管理导入规则里能看、能删；撤销那次导入时一起删；导入备份照带、洗干净。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
const P = require(path.join(WWW, 'import', 'plan.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '转账', cp: '*小兰', desc: '转账备注:房租', io: 'expense', fen: 200000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const T = (mo, d) => ({ y: 2026, mo, d, h: 20, mi: 0, s: 0 });
const file = (mo, txns) => [['微信' + mo + '.csv', B.bill('wechat', txns, { range: { from: `2026-${String(mo).padStart(2, '0')}-01 00:00:00`, to: `2026-${String(mo).padStart(2, '0')}-28 23:59:59` } }).bytes]];
async function pick(t, files) {
  const $ = id => t.d.getElementById(id);
  $('devImportBtn').click();
  await t.until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new t.w.File([bytes], name)), configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan && $('impQuick'), 30000);
  t.w.JiwenImportUI._goStep('check');
}
async function go(t) { const $ = id => t.d.getElementById(id); $('impQuick').click(); await t.until(() => $('impResult'), 30000); await t.idle(); }
const bigRow = (t, cp) => { const x = t.S().plan.sections.bigAsks.find(b => b.cp === cp); return x && t.d.querySelector(`#impBigAsks .imp-big-row[data-key="${x.key}"]`); };

(async () => {
  ok(P.plan && typeof P.missed === 'function', '0 纯计算模块载入');
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-11-20T10:00:00' });
  const $ = id => t.d.getElementById(id);
  // ===== 1. 第一次：点了「往来」+ 期初余额 → 记住 =====
  await pick(t, file(9, [wx({ time: T(9, 5) }), wx({ time: T(9, 6), cp: '某虚构电器', kind: '商户消费', desc: '洗衣机', fen: 300000 })]));
  bigRow(t, '*小兰').querySelector('.imp-big-m[data-mode="flow"]').click();
  ok(t.S().edits.rows[t.S().plan.sections.bigAsks.find(b => b.cp === '*小兰').key].bigPick === true, '1 点过的记一笔 bigPick');
  await go(t);
  let a = t.arch(), lg1 = (await t.logs()).pop();
  const big = (a.importRules || {}).big || [];
  ok(big.length === 1 && big[0].cp === '*小兰' && big[0].fen === 200000 && big[0].mode === 'flow' && !('ob' in big[0]), '1 只记了点过的那一笔（洗衣机没点、按推荐，不记）：' + JSON.stringify(big));
  ok(lg1.rulesAdded && (lg1.rulesAdded.big || []).length === 1, '1 导入记录 rulesAdded.big 记下真存进去的');
  // ===== 2. 下个月：同一对方、金额相近的不再问，照上次的选法 =====
  $('impBackToLedger').click(); await t.idle();
  await pick(t, file(10, [wx({ time: T(10, 5), fen: 210000 }), wx({ time: T(10, 9), fen: 500000, desc: '转账备注:借款' })]));
  const p2 = t.S().plan;
  const near = p2.rows.find(d => d.fen === 210000), far = p2.rows.find(d => d.fen === 500000);
  ok(!p2.sections.bigAsks.some(x => x.key === near.key) && p2.sections.bigKnown.some(x => x.key === near.key) && near.mode === 'flow', '2 2100（差不到 20%）：不再问，默认就是往来');
  ok(p2.sections.bigAsks.some(x => x.key === far.key), '2 5000（差太多）：照旧问');
  await go(t);
  const recs = t.recs(), r21 = recs.find(r => Number(r.money) === 2100);
  ok(r21 && r21.flow === true, '2 写进去是往来');
  $('impResRemind').click();
  ok([...t.d.querySelectorAll('#impRemindList .imp-chg')].some(r => /2,100\.00 元 → 算往来（照你上次的选法）/.test(r.textContent)), '2 完成页提醒写「照你上次的选法」');
  $('impRemindClose').click();
  // ===== 3. 管理导入规则：看得到、能删 =====
  $('impBackToLedger').click(); await t.idle();
  $('devRulesBtn').click(); await t.until(() => $('impRulesBig'));
  ok(/大额的选法（1）/.test($('impRulesBig').textContent) && /小兰 · 2,000\.00 元左右 → 算往来/.test($('impRulesBig').textContent), '3 管理导入规则里列出大额的选法：' + $('impRulesBig').textContent);
  // 改别的规则（加一条分类规则）不会把大额的选法丢掉
  await t.st().rulesSave(Object.assign({}, { cat: [{ kw: '某虚构词', cat: '购物' }], type: [], big: t.arch().importRules.big })); await t.idle();
  ok((t.arch().importRules.big || []).length === 1, '3 存规则时大额的选法照留着');
  $('devRulesBtn').click(); await t.until(() => $('impRulesBig'));
  $('impRulesBig').querySelector('.imp-big-del').click(); await t.idle(); await tick(60);
  ok(!(t.arch().importRules || {}).big, '3 删掉：存档里没有了');
  if (t.w.JiwenImportUI.isOpen()) t.w.JiwenImportUI.close();
  // ===== 4. 撤销记住它的那次导入：一起删 =====
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-11-20T10:00:00' });
    seq = 100;
    await pick(t2, file(9, [wx({ time: T(9, 5) })]));
    bigRow(t2, '*小兰').querySelector('.imp-big-m[data-mode="skip"]').click();
    await go(t2);
    ok((t2.arch().importRules.big || []).length === 1 && t2.arch().importRules.big[0].mode === 'skip', '4 选「不计」也记住');
    const lg = (await t2.logs()).pop();
    const up = await t2.st().undoPlan(lg.b); await t2.st().undo(up); await t2.idle();
    ok(!t2.arch().importRules, '4 撤销那次导入：大额的选法一起删');
    // ===== 5. 导入备份：照带、洗干净 =====
    await t2.w.JiwenStore.importArchiveFromText(JSON.stringify({ user: 'x', archive: '大额', cats: ['未分类', '其他'], data: [{ id: 'r1', time: '2026-09-01T10:00', money: 9, type: 'expense', cat: '其他', remark: '' }],
      importRules: { cat: [], type: [], big: [{ cp: '小兰', fen: 200000, mode: 'flow', ob: 1 }, { cp: '小兰', fen: 205000, mode: 'skip' }, { cp: '', fen: 1, mode: 'flow' }, { cp: '某虚构', fen: -5, mode: 'normal' }, { cp: '某虚构二', fen: 9000, mode: 'oops' }, { cp: '某虚构三', fen: 9000, mode: 'normal', ob: 1 }] } }), t2.w.localStorage.getItem('app_logged_in_user'));
    await t2.idle();
    const ar = t2.w.JiwenStore.loadStore(A.ID).archives['大额'];
    ok(ar && JSON.stringify(ar.importRules.big) === JSON.stringify([{ cp: '小兰', fen: 200000, mode: 'flow', ob: 1 }, { cp: '某虚构三', fen: 9000, mode: 'normal' }]), '5 导入备份：不对的不要、同一对方相近的只留第一条、ob 只在往来上：' + JSON.stringify(ar && ar.importRules));
    ok(!t2.errs.length, '无报错 ' + t2.errs.join('|'));
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 3 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
