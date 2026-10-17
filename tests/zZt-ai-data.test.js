// 1017-G「AI 检查导入结果」的数据（jsdom 跑整个 App）。node zZt-ai-data.test.js [index.html]
// 记录上的 AI 标记 aiFlag { k:'dup'|'miss', why, ref }；导入记录里 kind:'ai' 的那一条（chg 记 was / now）；AI 修改前备份（…_bk_<时间>_a）。
// 跟着导出备份、云备份、导入备份走（ref 换成新编号）；undo.js 认 aiFlag、撤原来那次导入要先撤 AI 修改；
// 1016-K（原样存的旧版）读新版备份不坏、装回去读同一台手机上的数据不坏，标记原样留着。记录、对方、备注全是虚构的。
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const U = require('../www/import/undo.js');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const OLD = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'index-1016-K.html.gz'))).toString('utf8');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const FLAG = { k: 'dup', why: '和 10月5日 那笔同一分钟、同金额', ref: 'r2' };
const RECS = () => [
  { id: 'r1', time: '2026-10-05T12:30', money: 30, type: 'expense', cat: '吃饭', remark: '虚构午饭', aiFlag: Object.assign({}, FLAG) },
  { id: 'r2', time: '2026-10-05T12:30', money: 30, type: 'expense', cat: '吃饭', remark: '虚构午饭', src: { app: 'wechat' }, batch: 'b1' },
  { id: 'r3', time: '2026-10-06T09:00', money: 12, type: 'expense', cat: '购物', remark: '', src: { app: 'wechat' }, batch: 'b1', aiFlag: { k: 'miss', why: '加上配送费正好是你记的那条' } },
  { id: 'r4', time: '2026-10-07T09:00', money: 5, type: 'expense', cat: '其他', remark: '', aiFlag: { k: 'oops', why: 'x' } },
  { id: 'r5', time: '2026-10-08T09:00', money: 8, type: 'expense', cat: '其他', remark: '', aiFlag: { k: 'dup', why: '说的那笔不在', ref: 'nope' } },
];
const LOGS = [
  { b: 'b1', at: '2026-10-09T10:00', apps: ['wechat'], from: '2026-10-01', to: '2026-10-08', add: ['r2', 'r3'], h: ['', ''], chg: [], cpLen: 0, pmLen: 0, cpEnd: 0, pmEnd: 0, catsAdded: [], rulesAdded: { cat: [], type: [] } },
  { kind: 'ai', of: 'b1', b: 'b2', at: '2026-10-09T11:00', apps: [], from: '', to: '', add: [], h: [], cpLen: 0, pmLen: 0, cpEnd: 0, pmEnd: 0, catsAdded: [], rulesAdded: { cat: [], type: [] },
    chg: [{ id: 'r3', was: { cat: '吃饭', aiFlag: null }, now: { cat: '购物', aiFlag: JSON.stringify({ k: 'miss', why: '加上配送费正好是你记的那条' }) }, nos: [] }] },
];
const pickBackup = async (t, text) => {
  const input = t.$('importFile');
  Object.defineProperty(input, 'files', { value: [new t.w.File([text], '备份.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.ask(), 5000);
  while (t.ask()) await t.askOk();
  await t.idle();
};
const exportBackup = async t => { const n = t.w.__files.length; t.$('exportBtn').click(); await t.until(() => t.w.__files.length > n); await t.idle(); if (t.ask()) await t.askOk(); return t.w.__files[n]; };
const lsDump = w => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS()) });
  const w = t.w;
  // ===== 1. 洗标记 =====
  ok(same(w.impCleanAiFlag({ k: 'dup', why: '虚构', ref: 'a' }), { k: 'dup', why: '虚构', ref: 'a' }), '1 合格的标记照留');
  ok(w.impCleanAiFlag({ k: 'x', why: '' }) === null && w.impCleanAiFlag(null) === null && w.impCleanAiFlag([1]) === null, '1 类型不对、空的、数组：不要');
  ok(w.impCleanAiFlag({ k: 'miss', why: '长'.repeat(500) }).why.length === 200 && !('ref' in w.impCleanAiFlag({ k: 'miss', why: '', ref: 5 })), '1 理由截到 200 字，ref 不是字符串的去掉');
  ok(same(w.impCleanAiFlag({ k: 'dup', why: '', ref: 'old' }, id => id === 'old' ? 'new' : null), { k: 'dup', why: '', ref: 'new' }) && !('ref' in w.impCleanAiFlag({ k: 'dup', why: '', ref: 'gone' }, () => null)), '1 换编号：换得了换，换不了去掉 ref、标记照留');
  ok(t.recs().find(r => r.id === 'r1').aiFlag.ref === 'r2', '1 存在账本里的标记原样读得出来');
  // ===== 2. 导入记录里 kind:'ai' 那一条 =====
  await t.st().importsWrite(undefined, LOGS.concat([{ kind: 'ai', of: 'BAD BATCH', b: 'b3', at: '', add: [], chg: [] }]));
  const lg = await t.st().importsRead();
  ok(lg.length === 3 && lg[1].kind === 'ai' && lg[1].of === 'b1' && lg[1].chg[0].now.aiFlag === LOGS[1].chg[0].now.aiFlag && same(lg[1].h, []), '2 导入记录：kind ai、of、chg 的 was / now（标记存成文本）都留着');
  ok(lg[2].kind === 'ai' && !('of' in lg[2]) && !('kind' in lg[0]), '2 of 不合格的去掉 of；普通导入没有 kind');
  await t.st().importsWrite(undefined, LOGS);
  // ===== 3. 导出备份 → 导入备份：标记、ref、导入记录都跟着走 =====
  const bk = await exportBackup(t);
  const bj = JSON.parse(bk);
  ok(bj.data.find(r => r.id === 'r1').aiFlag.ref === 'r2' && bj.imports[1].kind === 'ai', '3 导出的备份里有标记、有 AI 修改那条导入记录');
  await pickBackup(t, bk);
  const st = w.loadStore(A.ID), nm = Object.keys(st.archives).find(k => k !== '默认存档'), arc = st.archives[nm];
  const byRemark = (m) => arc.records.find(r => Math.round(r.money * 100) === m);
  const n1 = arc.records.find(r => r.aiFlag && r.aiFlag.k === 'dup' && r.aiFlag.why === FLAG.why), n2 = arc.records.find(r => r.src && r.money === 30);
  ok(nm && n1 && n2 && n1.id !== 'r1' && n1.aiFlag.ref === n2.id, '3 导入备份：标记照搬，ref 换成新编号（' + (n1 && n1.aiFlag.ref) + '）');
  ok(byRemark(1200).aiFlag && byRemark(1200).aiFlag.k === 'miss' && !('ref' in byRemark(1200).aiFlag), '3 没有 ref 的标记照搬');
  ok(!('aiFlag' in byRemark(500)), '3 类型不对的标记去掉（记录照留）');
  ok(byRemark(800).aiFlag && byRemark(800).aiFlag.k === 'dup' && !('ref' in byRemark(800).aiFlag), '3 ref 指的那一笔不在文件里：去掉 ref，标记照留');
  const lg2 = await t.st().importsRead(nm);
  ok(lg2 && lg2[1].kind === 'ai' && lg2[1].of === 'b1' && lg2[1].chg[0].id === byRemark(1200).id, '3 导入备份：AI 修改那条导入记录跟着走，chg 的 id 换成新编号');
  // ===== 4. 云备份往返 =====
  {
    const C = { files: {} };
    const plugin = { pickFile: async o => ({ uri: 'content://虚构云盘/' + o.suggestedName, name: o.suggestedName }), writeText: async o => { C.files[o.uri] = o.text; return {}; },
                     readText: async o => ({ text: C.files[o.uri] }), forget: async () => ({}), checkAccess: async () => ({ ok: true }) };
    const t4 = await A.boot({ html, www: WWW, seed: A.seedOf(RECS()), before: x => { x.Capacitor.Plugins.OneDriveLink = plugin; } });
    t4.$('odConnectBtn').click(); await t4.until(() => t4.ask()); await t4.askOk(); await t4.idle();
    await t4.w.odSyncNow(); await t4.idle();
    const main = Object.values(C.files)[0];
    ok(main && JSON.parse(main).data.find(r => r.id === 'r1').aiFlag.k === 'dup', '4 云备份里带着标记');
    const t5 = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    await pickBackup(t5, main);
    const a5 = Object.values(t5.w.loadStore(A.ID).archives).find(a => a.records.length === 5);
    ok(a5 && a5.records.filter(r => r.aiFlag).length === 3 && a5.records.find(r => r.aiFlag && r.aiFlag.ref).aiFlag.ref === a5.records.find(r => r.src && r.money === 30).id, '4 新手机从云备份恢复：标记都在，ref 换成新编号');
  }
  // ===== 5. 撤销：undo.js 认 aiFlag；撤原来那次导入要先撤 AI 修改 =====
  {
    const state = { records: RECS().slice(0, 3), cats: ['未分类', '吃饭', '购物'], budgets: {}, tpls: [], orders: {}, pending: [], logs: JSON.parse(JSON.stringify(LOGS)) };
    const pA = U.plan(state, 'b2'), r3 = pA.after.records.find(r => r.id === 'r3');
    ok(pA.ok && same(pA.chain, ['b2']) && r3.cat === '吃饭' && !('aiFlag' in r3) && pA.after.logs.length === 1, '5 撤 AI 修改：分类改回、标记拿掉（按文本比对 now）');
    const s2 = JSON.parse(JSON.stringify(state)); s2.records[2].aiFlag.why = '你后来改过的理由';
    const pK = U.plan(s2, 'b2'), r3k = pK.after.records.find(r => r.id === 'r3');
    ok(r3k.cat === '吃饭' && r3k.aiFlag.why === '你后来改过的理由' && pK.totals.kept === 1 && pK.steps[0].kept[0].field === 'aiFlag', '5 标记后来改过：不动，列进「你改过的」');
    const pB = U.plan(state, 'b1');
    ok(pB.ok && same(pB.chain, ['b2', 'b1']) && pB.why.b2[0].why === 'ai' && /AI 修改了这批的记录/.test(U.describe(pB)), '5 撤原来那次导入：要先撤 AI 修改（「AI 修改了这批的记录」）');
  }
  // ===== 6. AI 修改前备份：…_bk_<时间>_a，backups() 认得，能恢复 =====
  {
    const t6 = await A.boot({ html, www: WWW, seed: A.seedOf(RECS()) });
    const tg = t6.w.impTarget();
    const raw = await t6.w.impMakeBackup(tg, 'b2', 'ai');
    ok(JSON.parse(raw).kind === 'AI 修改前备份' && JSON.parse(raw).data.find(r => r.id === 'r1').aiFlag.k === 'dup', '6 AI 修改前备份：kind「AI 修改前备份」，带着标记');
    const key = t6.w.impBkPrefix(tg.e.id, tg.aid) + (1700000000000).toString(36) + '_a';
    await t6.w.idbBatch([['put', key, raw]]); t6.w.__ledgerKeys && t6.w.__ledgerKeys.add && t6.w.__ledgerKeys.add(key);
    const bl = t6.st().backups();
    ok(bl.length === 1 && bl[0].kind === 'ai', '6 backups() 认得 AI 修改前备份');
    const recs0 = JSON.stringify(t6.recs());
    { const s6 = t6.w.loadStore(A.ID), rs = s6.archives['默认存档'].records; rs[0] = Object.assign({}, rs[0], { cat: '其他' }); t6.w.saveStore(s6); await t6.idle(); }
    ok(t6.recs()[0].cat === '其他', '6 （先改一条）');
    const rr = await t6.st().restoreLast();
    ok(rr.records === 5 && JSON.stringify(t6.recs()) === recs0, '6 恢复到 AI 修改前：账本回到备份的样子');
  }
  // ===== 7. 有 AI 修改那条导入记录在最后时，再导同一份账单不进「按指纹认」 =====
  {
    let seq = 0;
    const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构面馆', desc: '牛肉面', io: 'expense', fen: 2800, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
    const F = [['微信.csv', B.bill('wechat', [wx({ time: { y: 2026, mo: 10, d: 5, h: 12, mi: 0, s: 0 } })], { range: { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' } }).bytes]];
    const t7 = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    await t7.importFiles(F);
    const l7 = await t7.st().importsRead();
    const rec = t7.recs()[0];
    await t7.st().importsWrite(undefined, l7.concat([{ kind: 'ai', of: l7[0].b, b: 'zz1', at: '2026-10-09T11:00', apps: [], add: [], h: [], cpLen: l7[0].cpEnd, pmLen: l7[0].pmEnd, cpEnd: l7[0].cpEnd, pmEnd: l7[0].pmEnd,
      chg: [{ id: rec.id, was: { cat: rec.cat }, now: { cat: rec.cat }, nos: [] }], catsAdded: [], rulesAdded: { cat: [], type: [] } }]));
    const r7 = await t7.importFiles(F, null, { noGo: true });
    const kn = Object.values(r7.S.known || {});
    ok(kn.length === 1 && kn.every(x => x.st === 0 && !x.fp) && !t7.errs.length, '7 最后一条是 AI 修改：照旧按单号表认出「已导入」，不进指纹兜底');
  }
  // ===== 8. 1016-K：读新版的备份不坏；装回去读同一台手机上的数据，标记原样留着 =====
  {
    const t8 = await A.boot({ html: OLD, www: WWW, seed: A.seedOf([]) });
    await pickBackup(t8, bk);
    const a8 = Object.values(t8.w.loadStore(A.ID).archives).find(a => a.records.length === 5);
    ok(a8 && !t8.errs.length, '8 1016-K 导入新版带标记的备份：5 条记录都在、没报错（旧版不认标记，导进去时不带）');
    // 同一台手机：新版写进去的数据，旧版装回去读
    const tn = await A.boot({ html, www: WWW, seed: A.seedOf(RECS()) });
    await tn.idle();
    const to = await A.boot({ html: OLD, www: WWW, phone: tn.phone, seed: lsDump(tn.w) });
    const ro = to.w.loadStore(A.ID).archives['默认存档'].records;
    ok(ro.length === 5 && ro.find(r => r.id === 'r1').aiFlag.ref === 'r2' && !to.errs.length, '8 1016-K 装回去：读得出来，标记原样留着，没报错');
    // 旧版里改一条带标记的记录（备注），再装回新版：标记还在
    to.$('mainBox') && to.d.querySelector('.tab-btn[data-tab="ledger"]').click();
    { const st0 = to.w.loadStore(A.ID), rs = st0.archives['默认存档'].records, i = rs.findIndex(r => r.id === 'r1'); rs[i] = Object.assign({}, rs[i], { remark: '旧版里改的备注' }); to.w.saveStore(st0); await to.idle(); }
    const tb = await A.boot({ html, www: WWW, phone: to.phone, seed: lsDump(to.w) });
    const rb = tb.recs().find(r => r.id === 'r1');
    ok(rb && rb.remark === '旧版里改的备注' && rb.aiFlag && rb.aiFlag.ref === 'r2' && !tb.errs.length, '8 旧版里改过别的字段再装回新版：标记还在');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
