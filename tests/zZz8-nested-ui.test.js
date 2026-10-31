// 1017-X 界面上的嵌套（jsdom，虚构数据）。node zZz8-nested-ui.test.js [index.html]
// 弹窗叠弹窗：提示框盖在底部面板上时，返回键 / 往下拉只关最上面那层，底下那层的状态不变；
// 正在写入（恢复备份、AI 修改、处理待处理、导入）时返回键不关、连点只写一次；开发开关关着导入相关的东西一点不露。
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
const F = [['微信.csv', B.bill('wechat', [wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600 }), wx({ time: T(6, 12), cp: '某虚构饭店', fen: 5000 }), wx({ time: T(7, 9), cp: '某虚构超市', fen: 5000 })], { range: RANGE }).bytes]];
const MAN = [{ id: 'm2', time: '2026-10-01T08:30', money: 50, type: 'expense', cat: '吃饭', remark: '聚餐' }];
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '购物', '其他']), now: '2026-10-20T10:00:00' });
  const { $, w } = t, qa = s => Array.from(t.d.querySelectorAll(s));
  // ===== 1. 导入时连点「确认导入」：只写一次 =====
  {
    $('devImportBtn').click();
    await t.until(() => $('impFile'));
    Object.defineProperty($('impFile'), 'files', { value: F.map(([n, b]) => new w.File([b], n)), configurable: true });
    $('impFile').dispatchEvent(new w.Event('change'));
    await t.until(() => $('impGo') && /^(新建|存下)/.test($('impGo').textContent), 30000);
    const $s = A.stepGet(w); $s('impGo').click();
    let release; const gate = new Promise(r => { release = r; });
    const orig = w.JiwenImportStore.commit; let calls = 0; w.JiwenImportStore.commit = async (...a) => { calls++; await gate; return orig.apply(w.JiwenImportStore, a); };
    const okb = $('impConfirmOk'); okb.click(); okb.click();
    ok(okb.disabled && /正在导入/.test(okb.textContent), '1 点了「确认导入」：按钮变「正在导入…」、点不动');
    await t.back();
    ok(w.JiwenSheet.isOpen() && calls === 1, '1 写入中按返回：确认面板不关；只调了一次写入');
    release(); w.JiwenImportStore.commit = orig;
    await t.until(() => $('impResult'), 30000);
    ok((await t.st().importsRead()).length === 1, '1 连点两下只导入一次');
    $('impBackToLedger').click(); await t.idle();
  }
  // ===== 2. 提示框盖在底部面板上：返回键只关提示框 =====
  {
    $('devRestoreBtn').click(); await t.until(() => qa('.bk-item').length === 1);
    w.customAlert('一条提示', '提示');
    ok($('askMask').style.display === 'flex' && w.JiwenSheet.isOpen(), '2 （提示框盖在恢复备份列表上）');
    await t.back();
    ok($('askMask').style.display === 'none' && w.JiwenSheet.isOpen() && qa('.bk-item').length === 1, '2 返回键：只关提示框，底下的列表还在、内容不变');
    await t.back();
    ok(!w.JiwenSheet.isOpen() && !t.exited, '2 再按：列表关掉，App 没退出');
  }
  // ===== 3. 恢复备份写入中：返回键不关 =====
  {
    $('devRestoreBtn').click(); await t.until(() => qa('.bk-item').length === 1);
    qa('.bk-item')[0].click(); await t.until(() => $('bkConfirmOk') && !$('bkConfirmOk').disabled);
    let release; const gate = new Promise(r => { release = r; });
    const orig = w.JiwenImportStore.restoreBackup; w.JiwenImportStore.restoreBackup = async (...a) => { await gate; return orig.apply(w.JiwenImportStore, a); };
    $('bkConfirmOk').click();
    await t.back();
    ok(w.JiwenSheet.isOpen() && /正在恢复/.test($('bkConfirmOk').textContent) && $('bkConfirmNo').disabled, '3 恢复中按返回：面板不关、「再看看」点不动');
    release(); await t.until(() => $('bkDoneMsg'));
    w.JiwenImportStore.restoreBackup = orig;
    ok(/已恢复/.test($('bkDoneMsg').textContent), '3 恢复完了照常提示');
    $('bkDoneClose').click(); await t.idle();
  }
  // ===== 4. 待处理连点：只处理一次 =====
  {
    await t.importFiles(F);       // 恢复成导入前以后再导一次（饭店那笔又进待处理）
    w.JiwenImportUI.openPending(); await t.until(() => qa('.imp-pend').length === 1);
    const n0 = t.recs().length;
    const nb = qa('.imp-pend-new')[0]; nb.click(); nb.click();
    await t.until(() => $('impPendNotice'));
    ok(t.recs().length === n0 + 1, '4 「作为新增」连点两下：只记一条');
    w.JiwenImportUI.close && w.JiwenImportUI.close();
  }
  // ===== 5. 开发开关关着：导入相关的入口、面板一点不露 =====
  {
    w.localStorage.setItem('app_dev_import', '0'); w.JiwenImportEntry.renderDevImport();
    ok(['devImportBtn', 'devRestoreBtn', 'devLogsBtn', 'devRulesBtn', 'devOptCatBtn'].every(id => $(id).style.display !== 'none' && !/开发中/.test($(id).textContent)) && ['devPerfBtn', 'devMeasureBtn', 'devNudgeBtn', 'devSplashBtn'].every(id => $(id).style.display === 'none'), '5 （1031-A）开关关着：导入、恢复备份、导入记录、管理导入规则、一键优化照样在、不写「开发中」；开发者工具藏着');
    t.d.querySelector('.tab-btn[data-tab="stats"]').click(); await t.idle();
    ok(!t.d.querySelector('.pend-banner, #pendBanner') || t.d.querySelector('#pendBanner') && t.d.querySelector('#pendBanner').style.display === 'none' || !/待确认/.test(t.d.body.textContent), '5 统计页不显示待处理横幅');
    t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
    ok(!/可以导了|导入微信、支付宝账单/.test($('pageLedger').textContent), '5 账单页没有导入提醒、空账本入口');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
