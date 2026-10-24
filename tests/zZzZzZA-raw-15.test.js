// 导入简化第 15 版：存账单原文 raw + 老记录补全。
//   ① 导入新建的记录带 raw { app, no 单号, kind 交易类型, cp 对方, desc 商品说明, status 状态, pm 支付方式, note 账单里的备注 }（几笔合成的一条不带）；
//      指纹 recHash 不含它；账单详情「来源」那一行下面「看账单原文 ›」；给 AI 的导出不带；备份照带（导入备份时洗一遍）。
//   ② 以前导入、还没有原文的记录，再导到同一笔账单时补上（导入记录 chg 记原值，撤销时拿掉）；完成页写「给以前导入的 N 条补上了账单原文」，不算「改了以前的记录」。
//   数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
const W = require(path.join(WWW, 'import', 'write.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = d => ({ y: 2026, mo: 10, d, h: 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '虚构商品', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const TX = [wx({ time: T(3), cp: '某虚构书店', desc: '虚构的书', fen: 3600 }), wx({ time: T(5), cp: '某虚构花店', desc: '虚构的花', fen: 4100, pm: '某虚构银行储蓄卡' })];
const FILE = () => [['微信.csv', B.bill('wechat', TX, { range: { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' } }).bytes]];
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles(FILE());
  const shu = () => t.recs().find(r => Number(r.money) === 36);
  // ===== 1. 新建的记录带原文 =====
  const r1 = shu();
  ok(r1.raw && r1.raw.app === 'wechat' && r1.raw.no === TX[0].no && r1.raw.kind === '商户消费' && r1.raw.cp === '某虚构书店' && r1.raw.desc === '虚构的书' && r1.raw.status === '支付成功' && r1.raw.pm === '零钱', '1 新建的记录带账单原文：' + JSON.stringify(r1.raw));
  const lg = (await t.logs()).pop();
  const i1 = lg.add.indexOf(r1.id);
  ok(lg.h[i1] === W.recHash(r1) && W.recHash(r1) === W.recHash(Object.assign({}, r1, { raw: undefined })) && t.w.JiwenStore.impRecHash(r1) === W.recHash(r1), '1 指纹不含原文（主页面和 write.js 一样）');
  // ===== 2. 详情里看原文 =====
  t.w.JiwenDetail.openDetail(r1.id); await tick();
  ok($('detailRawBtn') && $('detailRaw').hidden, '2 账单详情：「看账单原文 ›」，先收着');
  $('detailRawBtn').click();
  ok(!$('detailRaw').hidden && /交易类型：商户消费/.test($('detailRaw').textContent) && /商品说明：虚构的书/.test($('detailRaw').textContent) && new RegExp('单号：' + TX[0].no).test($('detailRaw').textContent), '2 点开：交易类型、对方、商品说明、状态、支付方式、单号');
  try { t.w.JiwenDetail.closeDetail(); } catch (_) {}
  // ===== 3. 给 AI 的导出不带原文 =====
  const d = await t.st().aiExportRows(lg.b);
  const txt = t.w.JiwenImportAI ? t.w.JiwenImportAI.exportText(d, { cp: true, remark: true, mask: false }).parts.map(p => p.text).join('\n') : '';
  ok(txt && txt.indexOf(TX[0].no) < 0, '3 交给 AI 的导出里没有单号（原文不带）');
  ok(t.w.JiwenAiExport.buildAiText(t.w.JiwenStore.getUserData(), '10月', '按月').indexOf(TX[0].no) < 0, '3 账单的 AI 导出也不带');
  // ===== 4. 备份照带 =====
  $('exportBtn').click(); await t.until(() => t.w.__files.length);
  ok(t.w.__files[t.w.__files.length - 1].indexOf('"raw"') >= 0, '4 导出备份带原文（自己的备份）');
  const bkText = t.w.__files[t.w.__files.length - 1].replace('"desc":"虚构的书"', '"desc":"虚构的书","junk":"x"');
  await t.w.JiwenStore.importArchiveFromText(bkText, A.ID); await t.idle();
  const a2 = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives).pop(), rb = t.w.JiwenStore.loadStore(A.ID).archives[a2].records.find(r => Number(r.money) === 36);
  ok(rb.raw && rb.raw.cp === '某虚构书店' && !('junk' in rb.raw), '4 导入备份：原文照带，多的字段洗掉');
  // ===== 5. 老记录补全 =====
  { const s = t.w.JiwenStore.loadStore(A.ID); const a = s.archives['默认存档']; a.records = a.records.map(r => { const o = Object.assign({}, r); delete o.raw; return o; }); t.w.JiwenStore.saveStore(s, A.ID); await t.idle(); }
  ok(!t.recs().some(r => r.raw), '5 （模拟老版本导入的：记录上没有原文）');
  const r2 = await t.importFiles(FILE(), null, { noGo: true, stay: true });
  ok(r2.plan.rows.filter(x => x.src === 'row').every(x => x.group === 'skip' && x.why === 'imported' && x.item.rawFill), '5 再导同一份：都算导入过，标了要补原文');
  ok($('impQuick') === null || $('impQuick').disabled, '5 全部导过：「导入」点不了');
  ok($('impRawFill') && $('impRawFill').textContent === '给以前导入的 2 条补上账单原文', '5 给一个「给以前导入的 2 条补上账单原文」');
  $('impRawFill').click();
  await t.until(() => $('impResult'), 30000); await t.idle();
  ok(t.recs().filter(r => r.raw && r.raw.no).length === 2 && shu().raw.no === TX[0].no, '5 补上了原文');
  ok($('impResRaw') && /给以前导入的 2 条补上了账单原文/.test($('impResRaw').textContent) && !/改了 \d+ 条以前的记录/.test($('impResult').textContent), '5 完成页「给以前导入的 2 条补上了账单原文」，不算「改了以前的记录」');
  const lg2 = (await t.logs()).pop();
  ok(lg2.chg.length === 2 && lg2.chg.every(c => c.was.raw === null && typeof c.now.raw === 'string'), '5 导入记录记下原值（撤销用）');
  $('impBackToLedger').click(); await t.idle();
  const up = await t.st().undoPlan(lg2.b); await t.st().undo(up); await t.idle();
  ok(t.recs().length === 2 && !t.recs().some(r => r.raw), '5 撤销那次：原文拿掉，记录还在');
  const up1 = await t.st().undoPlan(lg.b); await t.st().undo(up1); await t.idle();
  ok(t.recs().length === 0, '5 再撤第一次：两条都删了（补原文不算你改过）');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 15 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
