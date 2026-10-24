// 导入简化 7c：记住对账习惯。「几笔加起来」里你亲手把同一个对方的几笔合成过一条手记 → 存一条 importRules.sum { cp }；
//   下次同一对方同一天的几笔（一种同一天的选法、都是这个对方）不进待处理，默认照习惯配，确认页写「照你以前的习惯」，能「改」；
//   撤销那次导入时这条习惯一起删；「管理导入规则」里能看、能删；备份照带。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构食堂', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const R1 = { from: '2026-10-01 00:00:00', to: '2026-10-10 23:59:59' }, R2 = { from: '2026-10-11 00:00:00', to: '2026-10-20 23:59:59' };
const MAN = [{ id: 'a', time: '2026-10-04T12:30', money: 35, type: 'expense', cat: '吃饭', remark: '虚构午饭' },
             { id: 'b', time: '2026-10-15T12:30', money: 42, type: 'expense', cat: '吃饭', remark: '虚构午饭二' },
             { id: 'c', time: '2026-10-16T19:30', money: 23, type: 'expense', cat: '吃饭', remark: '虚构晚饭' }];
const F1 = () => [['微信1.csv', B.bill('wechat', [wx({ time: T(4, 11, 58), desc: '套餐', fen: 3000 }), wx({ time: T(4, 11, 59), desc: '饮料', fen: 500 })], { range: R1 }).bytes]];
// 15 日：食堂 40 + 2（照习惯）；16 日：某虚构面馆 20 + 3（不是习惯里的对方，照旧要你选）
const F2 = () => [['微信2.csv', B.bill('wechat', [wx({ time: T(15, 11, 58), desc: '套餐', fen: 4000 }), wx({ time: T(15, 11, 59), desc: '饮料', fen: 200 }),
  wx({ time: T(16, 19, 0), cp: '某虚构面馆', desc: '面', fen: 2000 }), wx({ time: T(16, 19, 1), cp: '某虚构面馆', desc: '饮料', fen: 300 })], { range: R2 }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  const rulesSum = () => ((t.arch().importRules || {}).sum || []);
  // ===== 1. 第一次：亲手选「这 2 笔加起来正好是你记的」→ 记住 =====
  const r1 = await t.importFiles(F1(), null, { noGo: true, stay: true });
  const g1 = r1.plan.sections.sums[0];
  ok(g1 && g1.chosen === null && !g1.habit, '1 第一次：几笔加起来那组要你选');
  t.w.JiwenImportUI._goStep('match');
  t.d.querySelector('#impSums .imp-sum-pick').click(); await tick();
  ok(t.S().plan.sections.sums[0].chosen === 0, '1 选了第一种');
  A.stepGet(t.w)('impGo').click(); await tick();
  const conf = (t.d.getElementById('uiSheetBody') || {}).textContent || '';
  ok(/记住 1 个对账习惯（某虚构食堂 几笔合成一条手记）/.test(conf), '1 确认导入面板写「记住 1 个对账习惯」：' + conf.slice(0, 200));
  $('impConfirmOk').click();
  await t.until(() => $('impResult'), 30000); await t.idle();
  ok(rulesSum().length === 1 && rulesSum()[0].cp === '某虚构食堂', '1 存了一条对账习惯：' + JSON.stringify(rulesSum()));
  const lg1 = (await t.logs()).pop();
  ok(lg1.rulesAdded && lg1.rulesAdded.sum && lg1.rulesAdded.sum[0].cp === '某虚构食堂', '1 导入记录 rulesAdded.sum 记下了（撤销用）');
  $('impBackToLedger').click(); await t.idle();
  // ===== 2. 第二次：同一对方同一天的几笔照习惯配，不进待处理 =====
  const r2 = await t.importFiles(F2(), null, { noGo: true, stay: true });
  const p2 = r2.plan, gs = p2.sections.sums;
  const gA = gs.find(g => g.habit), gB = gs.find(g => !g.habit);
  ok(gA && gA.habit === '某虚构食堂' && typeof gA.chosen === 'number', '2 食堂那组：默认照习惯配');
  ok(p2.rows.filter(d => d.src === 'row' && (d.fen === 4000 || d.fen === 200)).every(d => d.group === 'merge' && d.into === 'b'), '2 那两笔合并到手记 b（不在待处理）');
  ok(gB && gB.chosen === null && p2.rows.filter(d => d.src === 'row' && (d.fen === 2000 || d.fen === 300)).every(d => d.group === 'pending'), '2 面馆不在习惯里：照旧要你选，留在待处理');
  t.w.JiwenImportUI._goStep('match');
  const box = t.d.querySelector('#impSums .imp-pc-group[data-sum="' + gA.id + '"]');
  ok(box && /照你以前的习惯：某虚构食堂 同一天的几笔合成一条手记/.test(box.textContent) && /✓ 已选/.test(box.textContent), '2 确认页写「✓ 已选 … 照你以前的习惯」');
  box.querySelector('.imp-sum-undo').click(); await tick();
  const g2 = t.S().plan.sections.sums.find(g => g.id === gA.id);
  ok(g2.chosen === null && !g2.habit && t.S().plan.rows.filter(d => d.fen === 4000)[0].group === 'pending', '2 「改」：这次不照习惯，回到要你选');
  t.d.querySelector('#impSums .imp-pc-group[data-sum="' + gA.id + '"] .imp-sum-pick').click(); await tick();
  ok(t.S().plan.sections.sums.find(g => g.id === gA.id).chosen === 0, '2 再选回来');
  A.clickCancel(t.w); await t.idle();
  // 默认路径（核对页直接导入）
  await t.importFiles(F2());
  ok(t.recs().find(r => r.id === 'b').src && t.recs().find(r => r.id === 'b').src.merged && !t.recs().find(r => r.id === 'c').src, '2 直接导入：食堂两笔和 b 合并；面馆那两笔没定、c 不动');
  ok(rulesSum().length === 1, '2 照习惯配的不再重复存');
  // ===== 3. 管理导入规则：看得到、能删 =====
  t.w.JiwenImportUI.openRules(); await t.until(() => $('impRulesSum'));
  ok(/对账习惯（1）/.test($('impRulesSum').textContent) && /某虚构食堂 · 同一天的几笔合成一条手记/.test($('impRulesSum').textContent), '3 管理导入规则里「对账习惯（1）」');
  // ===== 4. 撤销：先撤第二次、再撤第一次 → 习惯一起删 =====
  t.w.JiwenImportUI.close();
  const logs = await t.logs();
  for (const l of logs.slice().reverse()) { const up = await t.st().undoPlan(l.b); await t.st().undo(up); await t.idle(); }
  ok(!rulesSum().length, '4 撤销第一次那次导入：这条习惯一起删');
  const r3 = await t.importFiles(F2(), null, { noGo: true, stay: true });
  ok(r3.plan.sections.sums.every(g => !g.habit && g.chosen === null), '4 撤完再导：不再照习惯');
  A.clickCancel(t.w); await t.idle();
  // ===== 5. 规则页删掉 =====
  await t.st().rulesSave({ cat: [], type: [], sum: [{ cp: '某虚构食堂' }] }); await t.idle();
  ok(rulesSum().length === 1, '5 rulesSave 带 sum 照存');
  t.w.JiwenImportUI.openRules(); await t.until(() => $('impRulesSum') && $('impRulesSum').querySelector('.imp-sum-del'));
  $('impRulesSum').querySelector('.imp-sum-del').click(); await t.idle(); await tick(80);
  ok(!rulesSum().length, '5 规则页「删除」：删了');
  t.w.JiwenImportUI.close();
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化 7c：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
