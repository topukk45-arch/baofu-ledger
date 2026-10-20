// 1017-K「AI 检查导入结果」写入和撤销（jsdom 跑整个 App，真导、真改、真撤）。node zZx-ai-write.test.js [index.html]
// 勾上的几条一个事务写进去（改分类 / 备注 / 口径 / 打标记），写前备份「AI 修改前」；导入记录多一条「AI 修改」；
// 不进单号表、不动待处理池、不存分类规则；撤销这次 AI 修改 → 和改之前逐字节一致；改完你又手动改过的，撤销时不动、列出来；
// 撤原来那次导入要先撤这次 AI 修改；写失败、记录已删时什么都不改。账单、手记、AI 回复全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const TX = [wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600, desc: '饮料' }), wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' }),
            wx({ time: T(7, 9), cp: '某虚构超市', fen: 5000, desc: '日用品' }), wx({ time: T(8, 9), cp: '某虚构银行', fen: 20000, desc: '还款' }),
            wx({ time: T(9, 9), cp: '某虚构花店', fen: 2000, status: '交易关闭' })];
const F = [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];
const MAN = [{ id: 'm1', time: '2026-10-06T09:30', money: 36, type: 'expense', cat: '购物', remark: '买书' }];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '购物', '零食', '其他']), now: '2026-10-20T10:00:00' });
  const { $ } = t, q = s => t.d.querySelector(s), qa = s => Array.from(t.d.querySelectorAll(s));
  await t.importFiles(F);
  const [lg] = await t.st().importsRead();
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  // 走一遍：导入记录 →「AI 检查」→ 复制（记下导出时间）→ 粘贴回复 → 勾 → 改
  const tickAll = () => { for (let i = 0; i < 20; i++) { const x = qa('.imp-ai-item input').find(y => !y.disabled && !y.checked); if (!x) return; x.click(); } };
  const toReview = async reply => {
    t.w.JiwenImportUI.openLogs(); await t.until(() => qa('.imp-log-ai').length);
    qa('.imp-log').find(x => x.dataset.batch === lg.b).querySelector('.imp-log-ai').click(); await t.until(() => $('impAiText'));
    $('impAiCopy').click(); await t.until(() => t.ask()); await t.askOk();
    const at = t.S().ai.at, rows = (await t.st().aiExportRows(lg.b)).rows, nOf = cp => rows.find(r => r.cp === cp).n;
    $('impAiPasteBtn').click(); await t.until(() => $('impAiPaste'));
    $('impAiPaste').value = reply(lg.b, at, nOf); $('impAiPasteGo').click();
    await t.until(() => $('impAiReviewHead'));
    return { rows, nOf };
  };
  const REPLY = (b, at, n) => ['```记问', '记问修改建议 v2 批次 ' + b + ' 导出 ' + at,
    `#${n('某虚构便利店')} | 分类 | 零食 | 便利店买饮料`, `#${n('某虚构超市')} | 备注 | 囤货 | 一次买了很多`, `#${n('某虚构银行')} | 口径 | 不计入 | 信用卡还款`,
    `#${n('某虚构书店')} | 标记 | 可能重复 #${n('某虚构便利店')} | 虚构的理由`, '```'].join('\n');
  const { rows, nOf } = await toReview(REPLY);
  // 「改之前」：复制时已经把导出时间记进导入记录了，从这里开始比
  const D0 = await t.dump();
  const imp0 = Object.fromEntries(Object.entries(D0).filter(([k]) => /^imp_/.test(k) && !/_i$/.test(k)));
  const rules0 = JSON.stringify(t.arch().importRules || null), cats0 = JSON.stringify(t.arch().cats);
  tickAll();
  ok(/改 4 条/.test($('impAiGo').textContent), '1 四条都勾上：「改 4 条」');
  $('impAiGo').click(); await t.until(() => $('impAiConfirmOk'));
  $('impAiConfirmOk').click();
  await t.until(() => $('impUndoNotice'));
  ok(/已按 AI 的建议改了 4 条记录/.test($('impUndoNotice').textContent) && t.S().phase === 'logs', '1 改完到导入记录，顶上写改了 4 条');
  const rec = cp => t.recs().find(r => r.id === rows.find(x => x.cp === cp).id);
  ok(rec('某虚构便利店').cat === '零食', '1 改分类：零食');
  ok(rec('某虚构超市').remark === '日用品；囤货', '1 改备注：默认加在原备注后面（' + rec('某虚构超市').remark + '）');
  ok(rec('某虚构银行').skip === true && !rec('某虚构银行').flow, '1 改口径：不计入');
  const fl = rec('某虚构书店').aiFlag;
  ok(fl && fl.k === 'dup' && fl.why === '虚构的理由' && fl.ref === rec('某虚构便利店').id, '1 打标记：可能重复，说的是便利店那笔');
  const logs = await t.st().importsRead(), al = logs[logs.length - 1];
  ok(logs.length === 2 && al.kind === 'ai' && al.of === lg.b && al.chg.length === 4 && same(al.add, []), '1 导入记录多一条「AI 修改」（of 是原来那次导入，chg 4 条）');
  const cc = al.chg.find(c => c.id === rec('某虚构便利店').id);
  ok(cc.was.cat === '购物' || cc.was.cat === '未分类' ? cc.now.cat === '零食' : false, '1 chg 记改前改后');
  ok(t.st().backups().some(b => b.kind === 'ai'), '1 写之前备份了一份「AI 修改前」');
  const D1 = await t.dump();
  ok(same(Object.fromEntries(Object.entries(D1).filter(([k]) => /^imp_/.test(k) && !/_i$/.test(k))), imp0), '1 单号表、待处理池一点没动');
  ok(JSON.stringify(t.arch().importRules || null) === rules0 && JSON.stringify(t.arch().cats) === cats0, '1 不存分类规则、不新建分类');
  // 导入记录页上的「AI 修改」那一行
  const aiRow = qa('.imp-log').find(x => x.dataset.batch === al.b);
  ok(aiRow && aiRow.classList.contains('imp-log-aimod') && /AI 修改/.test(aiRow.textContent) && /分类 1 条、备注 1 条、统计 1 条、标记 1 条/.test(aiRow.textContent) && !aiRow.querySelector('.imp-log-ai') && aiRow.querySelector('.imp-log-undo'), '2 导入记录：「AI 修改」一行写改了什么，有「撤销」、没有「AI 检查」');
  // ===== 3. 撤销这次 AI 修改：和改之前逐字节一致 =====
  const p1 = await t.st().undoPlan(al.b);
  ok(same(p1.chain, [al.b]) && /把 AI 改过的 4 条记录改回去/.test(t.w.JiwenImportUndo.describe(p1)), '3 撤 AI 修改的确认框：「把 AI 改过的 4 条记录改回去」');
  aiRow.querySelector('.imp-log-undo').click(); await t.until(() => t.ask()); await t.askOk();
  await t.until(() => $('impUndoNotice') && /已撤销这次 AI 修改/.test($('impUndoNotice').textContent));
  ok(/已撤销这次 AI 修改，改回了 4 条/.test($('impUndoNotice').textContent), '3 撤完写「已撤销这次 AI 修改，改回了 4 条」');
  ok(same(await t.dump(), D0), '3 撤销以后：账本、单号表、待处理、导入记录和改之前逐字节一样');
  // ===== 4. 改完你又手动改过的：撤销时不动、列出来 =====
  await toReview(REPLY);
  tickAll();
  $('impAiGo').click(); await t.until(() => $('impAiConfirmOk')); $('impAiConfirmOk').click(); await t.until(() => $('impUndoNotice'));
  { const st = t.w.JiwenStore.loadStore(A.ID), rs = st.archives['默认存档'].records, i = rs.findIndex(r => r.id === rows.find(x => x.cp === '某虚构便利店').id);
    rs[i] = Object.assign({}, rs[i], { cat: '吃饭' }); t.w.JiwenStore.saveStore(st); await t.idle(); }
  const l2 = (await t.st().importsRead()).pop();
  const p2 = await t.st().undoPlan(l2.b);
  ok(p2.totals.kept === 1 && /其中 1 处你后来又改过，保留你改的/.test(t.w.JiwenImportUndo.describe(p2)), '4 撤销前说明：你后来改过的那一处保留、列出来：' + t.w.JiwenImportUndo.describe(p2).split('\n').pop());
  await t.st().undo(p2); await t.idle();
  ok(rec('某虚构便利店').cat === '吃饭' && rec('某虚构超市').remark === '日用品' && !rec('某虚构书店').aiFlag && !rec('某虚构银行').skip, '4 撤销：你后来改的分类不动，别的改回去');
  // ===== 5. 撤原来那次导入要先撤 AI 修改 =====
  await toReview(REPLY);
  tickAll();
  $('impAiGo').click(); await t.until(() => $('impAiConfirmOk')); $('impAiConfirmOk').click(); await t.until(() => $('impUndoNotice'));
  const l3 = (await t.st().importsRead()).pop();
  const p3 = await t.st().undoPlan(lg.b);
  ok(same(p3.chain, [l3.b, lg.b]) && p3.why[l3.b][0].why === 'ai' && /要先撤销之后的 1 次 AI 修改/.test(t.w.JiwenImportUndo.describe(p3)) && /AI 修改了这批的记录/.test(t.w.JiwenImportUndo.describe(p3)), '5 撤原来那次导入：要先撤这次 AI 修改（确认框写明）');
  await t.st().undo(p3); await t.idle();
  ok(t.recs().length === 1 && t.recs()[0].id === 'm1' && !(await t.st().importsRead()).length, '5 连着撤完：只剩手记，导入记录清空');
  // ===== 6. 写失败、记录已删：什么都不改 =====
  {
    const t6 = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '购物', '零食', '其他']), now: '2026-10-20T10:00:00' });
    await t6.importFiles(F);
    const [g6] = await t6.st().importsRead();
    const r6 = (await t6.st().aiExportRows(g6.b)).rows;
    const E0 = await t6.dump(), bk0 = t6.st().backups().length;
    t6.w.__impFailAt = 'aiSave';
    let err = null; try { await t6.st().aiApply({ of: g6.b, changes: [{ id: r6[0].id, set: { cat: '零食' } }] }); } catch (e) { err = e.code || e.message; }
    t6.w.__impFailAt = null; await t6.idle();
    ok(err === 'test' && same(await t6.dump(), E0) && t6.st().backups().length === bk0, '6 写失败：账本、导入记录一点没动，刚做的备份也删了');
    err = null; try { await t6.st().aiApply({ of: g6.b, changes: [{ id: r6[0].id, set: { cat: '零食' } }, { id: 'nope', set: { cat: '零食' } }] }); } catch (e) { err = e.code; }
    ok(err === 'gone' && same(await t6.dump(), E0), '6 有一条记录不在了：整批不改');
    err = null; try { await t6.st().aiApply({ of: 'bnone', changes: [{ id: r6[0].id, set: { cat: '零食' } }] }); } catch (e) { err = e.code; }
    ok(err === 'nolog', '6 那次导入不在了：不改');
    err = null; try { await t6.st().aiApply({ of: g6.b, changes: [{ id: r6[0].id, set: { cat: '不存在的分类', money: 1, time: '2026-01-01T00:00' } }] }); } catch (e) { err = e.code; }
    ok(err === 'nothing' && same(await t6.dump(), E0), '6 分类不在名单里、改金额 / 时间：一个字段都不写（nothing）');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
