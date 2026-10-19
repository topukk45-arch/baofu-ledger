// 1017-O 备份和恢复（jsdom 跑整个 App，真导、真改、真撤、真恢复）。node zZz2-backup-restore.test.js [index.html]
// 备份是一整套（账本、存档设置、单号表、待处理池、导入记录、名单、AI 标记），按种类分开放：导入前 3 份、撤销前 2 份、AI 修改前 1 份、恢复前 1 份，
// 撤销不会把导入前那份挤掉；「恢复备份」能挑任意一份，恢复前先备份一份「恢复前」；恢复一个事务，失败什么都不改。
// 每种先后组合之后都检查账本、单号表、待处理池、导入记录、规则、名单彼此对得上。账单、手记全是虚构的。
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
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '某虚构杂货', desc: '虚构', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', no: '2026100122001400000000' + String(++seq).padStart(6, '0') }, o));
const FA = [['微信.csv', B.bill('wechat', [wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600, desc: '饮料' }), wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' }),
  wx({ time: T(7, 9), cp: '某虚构超市', fen: 5000, desc: '日用品' }), wx({ time: T(8, 9), cp: '某虚构花店', fen: 2000, status: '交易关闭' })], { range: RANGE }).bytes]];
const FB = [['支付宝.csv', B.bill('alipay', [ali({ time: T(11, 10), cp: '某虚构菜场', fen: 4400 }), ali({ time: T(12, 10), cp: '某虚构理发', fen: 3800, pm: '某虚构银行卡' })], { range: RANGE }).bytes]];
const MAN = [{ id: 'm1', time: '2026-10-06T09:30', money: 36, type: 'expense', cat: '购物', remark: '买书' }];
const CATS = ['未分类', '吃饭', '购物', '零食', '其他'];
const boot = () => A.boot({ html, www: WWW, seed: A.seedOf(MAN, CATS), now: '2026-10-20T10:00:00' });
const kinds = t => t.st().backups().map(b => b.kind);
const countKind = (t, k) => kinds(t).filter(x => x === k).length;

// 账本、单号表、待处理池、导入记录、规则、名单彼此对得上
async function check(t, tag) {
  const recs = t.recs(), ids = new Set(recs.map(r => r.id)), a = t.arch();
  const logs = await t.st().importsRead(), pend = await t.st().pendingRead();
  const db = await t.dump(), bad = [];
  const st0 = new Map();
  Object.keys(db).filter(k => /^imp_.+_o_/.test(k)).forEach(k => { const app = /_o_(alipay|wechat)_/.exec(k)[1]; (t.w.JiwenStore.impBlkDecode(db[k]) || []).forEach(x => { if (x.st === 0) { st0.set(app + '|' + x.no, x.id); if (!ids.has(x.id)) bad.push('单号指向不存在的记录 ' + x.no); } }); });
  const bs = new Set(logs.map(l => l.b));
  logs.forEach(l => {
    if (l.kind === 'ai') { if (!logs.some(x => x.kind !== 'ai' && x.b === l.of)) bad.push('AI 修改指向不在的导入 ' + l.of); (l.chg || []).forEach(c => { if (!ids.has(c.id)) bad.push('AI 修改的记录不在 ' + c.id); }); return; }
    (l.add || []).forEach(id => { if (!ids.has(id)) bad.push('导入记录里新建的记录不在 ' + id); });
    (l.chg || []).forEach(c => { if (!ids.has(c.id)) bad.push('导入记录里改过的记录不在 ' + c.id); });
    if (l.cpEnd > (a.cps || []).length) bad.push('名单比导入记录里短');
  });
  pend.forEach(x => { if (st0.has(x.app + '|' + x.no)) bad.push('待处理里的已经入账 ' + x.no); if (x.b && !bs.has(x.b) && logs.length) bad.push('待处理的批次不在导入记录里 ' + x.b); });
  recs.forEach(r => {
    if (Number.isInteger(r.cp) && r.cp >= (a.cps || []).length) bad.push('对方编号越界 ' + r.id);
    if (Number.isInteger(r.pm) && r.pm >= (a.pms || []).length) bad.push('支付方式编号越界 ' + r.id);
    if (r.batch && !bs.has(r.batch)) bad.push('记录的批次不在导入记录里 ' + r.id);
    if (r.aiFlag && r.aiFlag.ref && !ids.has(r.aiFlag.ref)) bad.push('AI 标记指向不在的记录 ' + r.id);
    if (r.cat && !a.cats.includes(r.cat)) bad.push('分类不在分类列表里 ' + r.cat);
  });
  ((a.importRules || {}).cat || []).forEach(x => { if (!a.cats.includes(x.cat)) bad.push('规则指向不在的分类 ' + x.cat); });
  ok(!bad.length, tag + '：账本、单号表、待处理、导入记录、名单对得上 ' + bad.slice(0, 3).join('；'));
}
const lastLog = async t => { const l = await t.st().importsRead(); return l[l.length - 1]; };
const undoLast = async t => { const p = await t.st().undoPlan((await lastLog(t)).b); return t.st().undo(p); };
const aiOne = async t => { const lg = (await t.st().importsRead()).filter(l => l.kind !== 'ai').pop(); const id = lg.add[0]; return t.st().aiApply({ of: lg.b, changes: [{ id, set: { cat: '零食', aiFlag: { k: 'dup', why: '虚构' } } }] }, {}); };
const restoreKind = async (t, kind, nth) => { const L = await t.st().backupList(); const x = L.list.filter(b => b.kind === kind)[nth || 0]; const d = await t.st().backupDiff(x.key); return { r: await t.st().restoreBackup(x.key, { ver: d.ver }), d, x }; };

(async () => {
  // ===== 1. 你遇到的顺序：导入 → AI 修改 → 撤 AI → 撤导入 → 恢复导入前 =====
  {
    const t = await boot();
    const D0 = await t.dump();
    await t.importFiles(FA);
    const D1 = await t.dump();
    await aiOne(t);
    await undoLast(t);
    ok(same(await t.dump(), D1), '1 撤 AI 修改：回到导入后');
    await undoLast(t);
    ok(same(await t.dump(), D0), '1 撤导入：回到导入前');
    ok(same(kinds(t), ['import', 'ai', 'undo', 'undo']), '1 四份备份都在：导入前没被两次撤销挤掉 ' + kinds(t).join(','));
    const L = await t.st().backupList();
    ok(L.list[0].kind === 'undo' && L.list[L.list.length - 1].kind === 'import', '1 备份列表新的在前');
    const im = L.list.find(b => b.kind === 'import');
    ok(/^导入微信账单（2026-10-01 至 2026-10-31）$/.test(im.what) && im.n === 1, '1 导入前那份写着是哪次导入之前、恢复后 1 条：' + im.what + ' ' + im.n);
    const ai = L.list.find(b => b.kind === 'ai');
    ok(/^按 AI 的建议改 1 条记录/.test(ai.what) && ai.n === 3, '1 AI 修改前那份：' + ai.what + ' ' + ai.n);
    ok(L.list.filter(b => b.kind === 'undo').every(b => /^撤销 .+ 那次/.test(b.what)), '1 撤销前那两份写着撤的是哪次');
    // 恢复「导入前」：账本回到导入前，导入记录本来就该是空的（导入之前还没有记录）
    const { r, d } = await restoreKind(t, 'import');
    ok(d.records === 1 && d.now === 1 && !d.goneMan && !d.goneImp && !d.back, '1 这时恢复导入前：影响是「和现在一样」');
    ok(same(await t.dump(), D0) && r.records === 1 && (await t.logs()).length === 0, '1 恢复导入前：账本、单号表、导入记录和导入前逐字节一样（导入记录本来就空）');
    ok(countKind(t, 'restore') === 1 && countKind(t, 'import') === 1, '1 用过的那份还在，多了一份「恢复前」');
    // 恢复「AI 修改前」：回到导入后、AI 修改前的样子，导入记录里有那次导入，能接着撤销
    const r2 = await restoreKind(t, 'ai');
    ok(r2.d.back === 2 && r2.d.logsBack === 1 && !r2.d.goneMan, '1 恢复 AI 修改前的影响：多回 2 条、导入记录多回 1 次 ' + JSON.stringify(r2.d));
    ok(same(await t.dump(), D1), '1 恢复 AI 修改前：和导入后逐字节一样');
    await check(t, '1 恢复 AI 修改前以后');
    await undoLast(t);
    ok(same(await t.dump(), D0), '1 恢复后导入记录里的「撤销」能用、指的是那次导入：撤完回到导入前');
    // 恢复错了：用「恢复前」那份回来
    const before = await t.dump();
    await restoreKind(t, 'ai');
    await restoreKind(t, 'restore');
    ok(same(await t.dump(), before), '1 恢复错了：用「恢复前」备份回到恢复之前');
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }

  // ===== 2. 每种各留几份：导入前 3、撤销前 2、AI 修改前 1、恢复前 1，同种挤同种 =====
  {
    const t = await boot();
    for (let i = 0; i < 4; i++) { await t.importFiles(FA); await undoLast(t); }
    ok(countKind(t, 'import') === 3 && countKind(t, 'undo') === 2, '2 导入 4 次、撤 4 次：导入前留 3 份、撤销前留 2 份 ' + kinds(t).join(','));
    await t.importFiles(FA); await aiOne(t); await undoLast(t); await aiOne(t);
    ok(countKind(t, 'ai') === 1 && countKind(t, 'import') === 3, '2 AI 修改两次：AI 修改前留 1 份，导入前还是 3 份');
    await restoreKind(t, 'import'); await restoreKind(t, 'import', 1);
    ok(countKind(t, 'restore') === 1 && countKind(t, 'import') === 3, '2 恢复两次：恢复前留 1 份，导入前一份没少');
    await check(t, '2 来回折腾以后');
  }

  // ===== 3. 恢复以后再导同一份、再撤销、再 AI 修改，都不认错 =====
  {
    const t = await boot();
    const r1 = await t.importFiles(FA);
    await restoreKind(t, 'import');
    const r2 = await t.importFiles(FA);
    ok(same(r2.plan.counts, r1.plan.counts), '3 恢复到导入前再导同一份：和第一次一样 ' + JSON.stringify(r2.plan.counts));
    await check(t, '3 恢复后再导');
    const again = await t.importFiles(FA, null, { noGo: true });
    ok(again.plan.counts.add === 0 && again.plan.counts.merge === 0, '3 再导一次：全部认成已导入');
    await aiOne(t);
    await check(t, '3 恢复后 AI 修改');
    await undoLast(t); await undoLast(t);
    const D0 = await t.dump();
    ok(D0['imp_' + A.ID + '_' + t.w.JiwenStore.impTarget().aid + '_i'] === undefined && t.recs().length === 1, '3 恢复后导入、AI 修改，倒着全撤：回到一条手记');
    // 恢复到「导入后」那份（撤销前）以后再导同一份：认成已导入
    await restoreKind(t, 'undo');
    const r3 = await t.importFiles(FA, null, { noGo: true });
    ok(r3.plan.counts.add === 0, '3 恢复到导入后的样子再导同一份：新增 0 条');
    await check(t, '3 恢复撤销前');
  }

  // ===== 4. 导入 A → 导入 B → 撤中间那次 A → 恢复 B 导入前 =====
  {
    const t = await boot();
    const D0 = await t.dump();
    await t.importFiles(FA);
    const DA = await t.dump();
    await t.importFiles(FB);
    const la = (await t.st().importsRead())[0];
    const p = await t.st().undoPlan(la.b);
    await t.st().undo(p);
    await check(t, '4 撤中间那次');
    const L = await t.st().backupList();
    const bkB = L.list.filter(b => b.kind === 'import')[0];
    ok(/支付宝/.test(bkB.what), '4 最新的导入前备份是导入支付宝之前');
    const d = await t.st().backupDiff(bkB.key);
    ok(d.goneImp === 2 && d.back >= 2 && d.logsGone === 1 && d.logsBack === 1, '4 影响：导入进来的 2 条没有、回来几条、之后 1 次导入没有、多回 1 次 ' + JSON.stringify(d));
    await t.st().restoreBackup(bkB.key, { ver: d.ver });
    ok(same(await t.dump(), DA), '4 恢复 B 导入前：和只导了 A 时逐字节一样');
    await check(t, '4 恢复以后');
    await undoLast(t);
    ok(same(await t.dump(), D0), '4 再撤 A：回到最开始');
  }

  // ===== 5. 手记会被冲掉：影响里写「你手记的 N 条会没有」；账本变了拒绝；失败、空间不够什么都不改 =====
  {
    const t = await boot();
    await t.importFiles(FA);
    const save = async fn => { const s = t.w.JiwenStore.loadStore(A.ID); fn(s.archives['默认存档']); t.w.JiwenStore.saveStore(s); await t.idle(); };
    await save(a => { a.records = a.records.concat([{ id: 'm9', time: '2026-10-19T08:00', money: 5, type: 'expense', cat: '吃饭', remark: '' }, { id: 'm8', time: '2026-10-19T09:00', money: 6, type: 'expense', cat: '吃饭', remark: '' }]); });
    const L = await t.st().backupList(), x = L.list.find(b => b.kind === 'import');
    const d = await t.st().backupDiff(x.key);
    ok(d.goneMan === 2 && d.goneImp === 2 && d.logsGone === 1, '5 影响：手记 2 条、导入的 2 条、之后 1 次导入会没有 ' + JSON.stringify(d));
    await save(a => { a.records = a.records.filter(r => r.id !== 'm8'); });
    let err = null; try { await t.st().restoreBackup(x.key, { ver: d.ver }); } catch (e) { err = e; }
    const D = await t.dump(), nb = t.st().backups().length;
    ok(err && err.code === 'stale' && same(await t.dump(), D), '5 看完影响后账本变了：拒绝恢复');
    t.w.__impFailAt = 'restoreSave';
    err = null; try { await t.st().restoreBackup(x.key); } catch (e) { err = e; }
    t.w.__impFailAt = null; await t.idle();
    ok(err && same(await t.dump(), D) && t.st().backups().length === nb, '5 恢复写失败：账本、单号表一点没动，刚做的「恢复前」也删了');
    const free0 = t.w.navigator.storage;
    Object.defineProperty(t.w.navigator, 'storage', { value: { estimate: async () => ({ quota: 1000, usage: 999 }) }, configurable: true });
    err = null; try { await t.st().restoreBackup(x.key); } catch (e) { err = e; }
    Object.defineProperty(t.w.navigator, 'storage', { value: free0, configurable: true });
    ok(err && err.code === 'nospace' && same(await t.dump(), D) && t.st().backups().length === nb, '5 空间不够：不恢复、不写备份');
    // 导入时空间不够：不导入、导入前的旧备份一份没少
    const nb2 = t.st().backups().length;
    Object.defineProperty(t.w.navigator, 'storage', { value: { estimate: async () => ({ quota: 1000, usage: 999 }) }, configurable: true });
    const r = await t.importFiles(FB);
    Object.defineProperty(t.w.navigator, 'storage', { value: free0, configurable: true });
    ok(r.alert && !r.result && same(await t.dump(), D) && t.st().backups().length === nb2, '5 导入时空间不够：不导入，备份一份没少');
  }

  // ===== 6. 界面：设置 →「恢复备份」→ 列表 → 确认面板 → 恢复；返回键只关最上面一层 =====
  {
    const t = await boot();
    const { $ } = t, q = s => t.d.querySelector(s), qa = s => Array.from(t.d.querySelectorAll(s));
    ok($('devRestoreBtn').style.display !== 'none' && /恢复备份/.test($('devRestoreBtn').textContent), '6 设置里「恢复备份（开发中）」');
    $('devRestoreBtn').click(); await t.until(() => $('bkEmpty'));
    ok($('bkEmpty') && /还没有备份/.test($('bkEmpty').textContent), '6 没有备份时写一句、说明每种留几份');
    $('bkListClose').click(); await t.idle();
    await t.importFiles(FA);
    const D1 = await t.dump();
    await undoLast(t);
    $('devRestoreBtn').click(); await t.until(() => qa('.bk-item').length === 2);
    const items = qa('.bk-item');
    ok(/^撤销前备份 · 10月20日/.test(items[0].querySelector('b').textContent) && /恢复后账本 3 条（比现在多 2 条）/.test(items[0].textContent), '6 每份写种类、时间、恢复后几条（比现在多几条）：' + items[0].textContent);
    ok(/^导入前备份/.test(items[1].querySelector('b').textContent) && /导入微信账单.*之前/.test(items[1].textContent) && /和现在一样多/.test(items[1].textContent), '6 导入前那份：是哪次导入之前');
    items[0].click(); await t.until(() => $('bkConfirmOk') && !$('bkConfirmOk').disabled);
    const msg = $('bkConfirmMsg').textContent;
    ok(/恢复以后账本有 3 条（现在 1 条，比现在多 2 条）/.test(msg) && /现在没有的 2 条会回来/.test(msg) && /多回 1 次/.test(msg), '6 确认面板写影响：' + msg);
    ok($('bkConfirmOk').textContent === '恢复这份备份，覆盖现在的账本' && $('bkConfirmOk').classList.contains('warn'), '6 按钮写「恢复这份备份，覆盖现在的账本」、警示色');
    const col = $('bkConfirmOk').parentNode;
    ok(col.lastChild === $('bkConfirmNo') && $('bkConfirmNo').textContent === '再看看', '6 「再看看」在最下面');
    await t.back();
    ok($('bkList') && !$('bkConfirmOk'), '6 返回键：确认面板关掉、回到列表（只关最上面一层）');
    await t.back();
    ok(!t.w.JiwenSheet.isOpen() && !t.exited, '6 再按返回键：列表关掉、App 没退出 ' + t.w.JiwenSheet.isOpen() + ' ' + t.exited);
    $('devRestoreBtn').click(); await t.until(() => qa('.bk-item').length === 2);
    qa('.bk-item')[0].click(); await t.until(() => $('bkConfirmOk') && !$('bkConfirmOk').disabled);
    $('bkConfirmOk').click(); $('bkConfirmOk') && $('bkConfirmOk').click();
    await t.until(() => $('bkDoneMsg'));
    ok(/已恢复，现在有 3 条记录/.test($('bkDoneMsg').textContent), '6 恢复完写现在几条、能用「恢复前」找回');
    ok(same(await t.dump(), D1) && countKind(t, 'restore') === 1, '6 连点两下只恢复一次：账本回到导入后，只多一份「恢复前」');
    $('bkDoneClose').click(); await t.idle();
    ok(t.recs().length === 3 && t.d.getElementById('billList'), '6 账本页跟着刷新');
    // 开发开关关着：入口不露
    t.w.localStorage.setItem('app_dev_import', '0'); t.w.JiwenImportEntry.renderDevImport();
    ok($('devRestoreBtn').style.display === 'none', '6 开发开关关着：没有「恢复备份」');
    ok(!t.errs.length, '6 无报错 ' + t.errs.join('|'));
  }

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
