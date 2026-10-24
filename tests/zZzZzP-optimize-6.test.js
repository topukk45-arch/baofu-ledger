// 导入简化第 6 版：一键优化分类（of '*' 的撤销）。待确认分类的记录按现在的规则再推一遍，推得出已有分类、有把握、和现在不一样的列出来，
//   按改成的分类分组（能勾掉一组、点开勾掉个别的），确认后照 AI 修改那套写（of '*'、by 'opt'），导入记录里一行「一键优化分类」能撤销，撤销时待确认放回；
//   撤原来那次导入要先撤它。入口：账单页「待确认分类」胶囊旁「一键优化 ›」，设置里备用入口。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const TX = [1, 2, 3].map(d => wx({ time: T(d), cp: '某虚构甲店', fen: 1000 + d })).concat([4, 5].map(d => wx({ time: T(d), cp: '某虚构乙店', fen: 2000 + d }))).concat([wx({ time: T(6), cp: '某虚构丙店', fen: 3006 })]);
const sheetOpen = t => t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles([['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]]);
  const lg = (await t.logs()).pop();
  const rvs = () => t.recs().filter(r => r.rv === 1);
  ok(rvs().length === 6, '0 导进来 6 笔待确认分类');
  // 导完以后才有了规则：甲店 → 吃饭、乙店 → 购物
  await t.st().rulesSave({ cat: [{ kw: '某虚构甲店', cat: '吃饭' }, { kw: '某虚构乙店', cat: '购物' }], type: [] }); await t.idle();
  // ===== 1. 入口 =====
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  ok($('optCatChip') && /一键优化/.test($('optCatChip').textContent) && $('rvChip').nextSibling === $('optCatChip'), '1 账单页「待确认分类」胶囊旁「一键优化 ›」');
  ok($('devOptCatBtn') && $('devOptCatBtn').style.display !== 'none', '1 设置里有备用入口');
  $('optCatChip').click();
  await t.until(() => sheetOpen(t) && $('impOptGo'), 5000);
  const gs = [...t.d.querySelectorAll('.imp-opt-g')];
  ok($('uiSheetTitle').textContent === '一键优化分类' && gs.length === 2 && /改成「吃饭」 · 3 笔/.test(gs[0].textContent) && /改成「购物」 · 2 笔/.test(gs[1].textContent), '1 按改成的分类分组：「改成「吃饭」· 3 笔」「改成「购物」· 2 笔」（丙店推不出，不列）');
  ok($('impOptGo').textContent === '改这 5 条的分类', '1 底部「改这 5 条的分类」');
  // 勾掉购物一组、点开吃饭勾掉一笔
  gs[1].querySelector('.imp-opt-gall').click(); await tick();
  t.d.querySelectorAll('.imp-opt-g')[0].querySelector('.rvg-head').click(); await tick();
  const cbs = [...t.d.querySelectorAll('.imp-opt-g')[0].querySelectorAll('.rvg-row input')];
  ok(cbs.length === 3 && cbs.every(c => c.checked) && /某虚构甲店：未分类 → 吃饭/.test(t.d.querySelector('.rvg-row').textContent) && /你的规则|规则/.test(t.d.querySelector('.rvg-row .imp-soft').textContent), '1 点开看每一笔：现在 → 改成、理由');
  cbs[0].click(); cbs[0].dispatchEvent(new t.w.Event('change')); await tick();
  ok($('impOptGo').textContent === '改这 2 条的分类', '1 勾掉一组、一笔：「改这 2 条的分类」：' + $('impOptGo').textContent);
  $('impOptGo').click();
  await t.until(() => t.ask(), 5000); await t.idle();
  ok(/已改了 2 条的分类/.test(t.ask().msg), '1 改完提示：' + t.ask().msg);
  await t.askOk();
  ok(t.recs().filter(r => r.cat === '吃饭').length === 2 && rvs().length === 4, '1 2 条改成吃饭、不再算待确认');
  const logs = await t.logs(), opt = logs[logs.length - 1];
  ok(opt.kind === 'ai' && opt.of === '*' && opt.by === 'opt' && opt.chg.length === 2 && opt.chg.every(c => c.was.rv === 1 && c.now.rv === null), '1 导入记录：kind ai、of *、by opt，记下了 rv');
  // ===== 2. 导入记录里一行「一键优化分类」，能撤销，撤销时待确认放回 =====
  $('devLogsBtn').click(); await t.until(() => t.d.querySelector('.imp-log-aimod'));
  ok(/一键优化分类/.test(t.d.querySelector('.imp-log-aimod').textContent) && /改了 2 条待确认分类/.test(t.d.querySelector('.imp-log-aimod').textContent), '2 导入记录里一行「一键优化分类」');
  // 撤原来那次导入：要先撤它
  const p0 = await t.st().undoPlan(lg.b);
  ok(p0.ok && p0.chain.length === 2 && p0.chain[0] === opt.b, '2 撤原来那次导入：要先撤这次一键优化（依赖链）');
  t.d.querySelector('.imp-log-aimod .imp-log-undo').click();
  await t.until(() => t.ask(), 5000);
  await t.askOk();
  await t.until(() => /已撤销/.test((t.d.getElementById('impUndoNotice') || {}).textContent || ''), 10000); await t.idle();
  ok(rvs().length === 6 && !t.recs().some(r => r.cat === '吃饭'), '2 撤销：分类改回去、待确认放回');
  t.w.JiwenImportUI.close();
  // ===== 3. 备份导入照带 of '*' =====
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  await t.st().aiApply({ of: '*', by: 'opt', changes: [{ id: rvs()[0].id, set: { cat: '购物' } }] });
  $('exportBtn').click(); await t.until(() => t.w.__files.length);
  await t.w.JiwenStore.importArchiveFromText(t.w.__files[t.w.__files.length - 1], A.ID); await t.idle();
  const names = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives), a2 = names[names.length - 1];
  const l2 = (await t.st().importsRead(a2)).pop();
  ok(l2.kind === 'ai' && l2.of === '*' && l2.by === 'opt', '3 导入备份成另一个存档：一键优化那一条照留着');
  const up = await t.st().undoPlan(l2.b, a2); await t.st().undo(up, { archive: a2 }); await t.idle();
  ok(t.w.JiwenStore.loadStore(A.ID).archives[a2].records.filter(r => r.rv === 1).length === 6, '3 那边也能撤销');
  // ===== 4. 没有能改的：一句话 =====
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
    await t2.importFiles([['微信.csv', B.bill('wechat', [wx({ time: T(7), cp: '某虚构丁店' })], { range: RANGE }).bytes]]);
    t2.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t2.idle();
    t2.d.getElementById('optCatChip').click();
    await t2.until(() => t2.ask(), 5000);
    ok(/没有能改得更准的/.test(t2.ask().msg), '4 推不出更准的：写一句');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 6 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
