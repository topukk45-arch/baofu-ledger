// 1019-E 导入中途闪退：确认页上的选择存成草稿，下次打开导入问「接着来吗」（jsdom，账单和记录全是虚构的）。node zZzD-import-draft.test.js [index.html]
// 草稿按账号 + 存档存在这台手机上（imp_<账号>_<存档号>_d），不进备份、不改账本；导入成功、主动退出、选「重新开始」就删。
// 「强杀 App」= 同一个库（同一台手机）重新起一个页面。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const F = [['微信账单.csv', B.bill('wechat', [wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600 }), wx({ time: T(6, 12), cp: '某虚构饭店', fen: 5000 }), wx({ time: T(7, 9), cp: '某虚构超市', fen: 3300 })], { range: RANGE }).bytes]];
// 手记 m1：和 10 月 6 日饭店那笔同一天、同金额 → 默认合并
const MAN = [{ id: 'm1', time: '2026-10-06T12:30', money: 50, type: 'expense', cat: '吃饭', remark: '虚构聚餐' }];
const CATS = ['未分类', '吃饭', '购物', '其他'];
const DKEY = aid => 'imp_' + A.ID + '_' + aid + '_d';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function bootOn(phone, seed) {
  const t = await A.boot({ html, www: WWW, seed, phone, now: '2026-10-20T10:00:00' });
  return t;
}
async function toConfirm(t) {
  const { $, w } = t;
  $('devImportBtn').click();
  await t.until(() => $('impFile'));
  Object.defineProperty($('impFile'), 'files', { value: F.map(([n, b]) => new w.File([b], n)), configurable: true });
  $('impFile').dispatchEvent(new w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan, 30000);
}
const keyOf = (t, cp) => t.S().plan.rows.filter(r => (r.cp || '').indexOf(cp) >= 0)[0].key;
async function flush(t) { await wait(480); await t.idle(); await wait(30); await t.idle(); }

(async () => {
  const seed = A.seedOf(MAN, CATS), seedNoStore = Object.assign({}, seed); delete seedNoStore['store_' + A.ID];
  // ===== 1. 确认页做几处选择 → 存下草稿 =====
  const t1 = await bootOn(null, seed);
  const aid = t1.w.JiwenStore.impTarget().aid;
  await toConfirm(t1);
  await flush(t1);
  let db = await t1.dump();
  ok(db[DKEY(aid)] && db[DKEY(aid)].files.length === 1 && db[DKEY(aid)].files[0].name === '微信账单.csv', '1 一进确认页就存了草稿（带着选好的文件）');
  const kShop = keyOf(t1, '超市'), kFood = keyOf(t1, '饭店');
  const S1 = t1.S();
  ok(S1.plan.rows.filter(r => r.key === kFood)[0].group === 'merge', '1 饭店那笔默认和手记合并');
  S1.edits.rows[kShop] = { mode: 'skip' };        // 超市那笔改成不计入
  S1.edits.rows[kFood] = { split: true };         // 饭店那笔不和手记合并，分开记
  t1.w.JiwenImportUI._replan();
  t1.w.JiwenImportUI._goStep('overview');
  await flush(t1);
  db = await t1.dump();
  const d1 = db[DKEY(aid)];
  ok(d1 && d1.edits.rows[kShop].mode === 'skip' && d1.edits.rows[kFood].split === true && d1.view.step === 'overview', '1 改了以后草稿跟着更新（两处选择、停在总览）');
  ok(d1.n === 2 && /饭店 50\.00/.test(d1.labels[kFood]), '1 草稿记下几处选择、每处是哪一笔 ' + d1.n + JSON.stringify(d1.labels));
  // 草稿不进备份：导出的备份文件里没有它
  ok(!JSON.stringify(Object.keys(db).filter(k => !/^imp_/.test(k) || /_d$/.test(k))).includes('_bk_'), '1 草稿键不在备份里');
  const ledgerBefore = JSON.stringify(t1.w.JiwenStore.loadStore(A.ID).archives['默认存档'].records);

  // ===== 2. 强杀 App，重开导入：问「接着来吗」=====
  t1.w.close();
  const t2 = await bootOn(t1.phone, seedNoStore);
  ok(JSON.stringify(t2.w.JiwenStore.loadStore(A.ID).archives['默认存档'].records) === ledgerBefore, '2 账本没有改动');
  t2.$('devImportBtn').click();
  await t2.until(() => t2.w.JiwenSheet.isOpen() && t2.$('uiSheetTitle').textContent === '上次导入没做完，接着来吗？', 5000);
  ok(t2.w.JiwenSheet.isOpen() && t2.$('uiSheetTitle').textContent === '上次导入没做完，接着来吗？', '2 打开导入：问「上次导入没做完，接着来吗？」');
  ok(/选了 1 份账单，做了 2 处选择/.test(t2.$('impResumeMsg').textContent) && /微信账单\.csv/.test(t2.$('impResumeMsg').textContent), '2 写明几份账单、几处选择：' + t2.$('impResumeMsg').textContent);
  const order = [...t2.$('uiSheetFoot').querySelectorAll('button')].map(b => b.id);
  ok(order.join() === 'impResumeGo,impResumeFresh' && t2.$('impResumeGo').classList.contains('primary'), '2 「接着来」在上、「重新开始」在下');
  t2.$('impResumeGo').click();
  await t2.until(() => t2.S() && t2.S().phase === 'confirm' && t2.S().plan, 30000);
  await t2.idle();
  const S2 = t2.S();
  ok(S2.edits.rows[kShop] && S2.edits.rows[kShop].mode === 'skip' && S2.edits.rows[kFood] && S2.edits.rows[kFood].split === true, '2 接着来：两处选择都还在');
  ok(S2.view.step === 'overview', '2 停在上次那一步（总览）');
  ok(S2.plan.rows.filter(r => r.key === kFood)[0].group !== 'merge', '2 选择照样套上去了（饭店那笔分开记）');
  ok(t2.ask() && t2.ask().title === '接着上次的导入' && /2 处选择都套上了/.test(t2.ask().msg) && !/改过/.test(t2.ask().msg), '2 提示：都套上了 ' + (t2.ask() && t2.ask().msg));
  await t2.askOk();

  // ===== 3. 退出这次导入（主动退出）：草稿删掉，下次不问 =====
  t2.w.JiwenImportUI._goStep('check');
  t2.$('impCancel').click(); await t2.idle();
  t2.$('impExitOk').click(); await flush(t2);
  db = await t2.dump();
  ok(!db[DKEY(aid)], '3 主动退出：草稿删掉了');
  t2.w.JiwenImportUI.close && t2.w.JiwenImportUI.close();
  t2.$('devImportBtn').click(); await flush(t2);
  ok(!t2.w.JiwenSheet.isOpen(), '3 再打开导入：不问了');

  // ===== 4. 账本在这期间改过：按现在的账本重算，套不上的写明哪几处 =====
  await toConfirm(t2);
  const S4 = t2.S(); const k4 = keyOf(t2, '饭店');
  S4.edits.rows[k4] = { split: true }; S4.edits.rows[keyOf(t2, '超市')] = { mode: 'skip' };
  t2.w.JiwenImportUI._replan(); await flush(t2);
  t2.w.close();
  const t3 = await bootOn(t2.phone, seedNoStore);
  // 重开以后先把那条手记删掉：饭店那笔不再是「合并」，「分开记」就套不上了
  t3.w.JiwenStore.saveUserData(t3.w.JiwenStore.getUserData().filter(r => r.id !== 'm1')); await t3.idle();
  t3.$('devImportBtn').click();
  await t3.until(() => t3.w.JiwenSheet.isOpen() && t3.$('impResumeGo'), 5000);
  t3.$('impResumeGo').click();
  await t3.until(() => t3.S() && t3.S().phase === 'confirm' && t3.S().plan && t3.ask(), 30000);
  const a4 = t3.ask();
  ok(a4 && /账本在上次之后改过，已经按现在的账本重新算了一遍/.test(a4.msg), '4 写明账本改过、按现在的账本重算');
  ok(a4 && /有 1 处没套上/.test(a4.msg) && /饭店/.test(a4.msg), '4 写明哪一处没套上：' + (a4 && a4.msg));
  ok(t3.S().edits.rows[keyOf(t3, '超市')] && !t3.S().edits.rows[k4], '4 套得上的照样套上（超市那笔不计入）');
  await t3.askOk();

  // ===== 5. 导入成功：草稿删掉 =====
  A.clickGo(t3.w);
  await t3.until(() => t3.$('impResult'), 30000);
  await flush(t3);
  db = await t3.dump();
  ok(!db[DKEY(aid)], '5 导入成功：草稿删掉了');

  // ===== 6. 「重新开始」：草稿删掉，停在选文件页 =====
  t3.$('impBackToLedger').click(); await t3.idle();
  t3.d.querySelector('.tab-btn[data-tab="settings"]').click();
  await toConfirm(t3); await flush(t3);
  t3.w.close();
  const t4 = await bootOn(t3.phone, seedNoStore);
  t4.$('devImportBtn').click();
  await t4.until(() => t4.w.JiwenSheet.isOpen() && t4.$('impResumeFresh'), 5000);
  t4.$('impResumeFresh').click(); await flush(t4);
  db = await t4.dump();
  ok(!db[DKEY(aid)] && t4.S().phase === 'pick' && !t4.w.JiwenSheet.isOpen(), '6 「重新开始」：草稿删掉、停在选文件页');

  // ===== 7. 删存档：草稿跟着删 =====
  await toConfirm(t4); await flush(t4);
  ok(!!(await t4.dump())[DKEY(aid)], '7 又存了一份草稿');
  t4.w.JiwenImportUI.close();
  const st = t4.w.JiwenStore.loadStore(A.ID); st.archives['另一个存档'] = { cats: CATS.slice(), records: [] }; st.last = '另一个存档'; t4.w.JiwenStore.saveStore(st, A.ID); await t4.idle();
  const st2 = t4.w.JiwenStore.loadStore(A.ID); delete st2.archives['默认存档']; t4.w.JiwenStore.saveStore(st2, A.ID); await t4.idle(); await wait(20); await t4.idle();
  ok(!(await t4.dump())[DKEY(aid)], '7 删存档：草稿跟着删了');

  [t1, t2, t3, t4].forEach((t, i) => ok(t.errs.length === 0, `没有报错（第 ${i + 1} 次启动）` + t.errs.join('；')));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
