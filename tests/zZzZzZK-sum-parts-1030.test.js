// 实测 10-30（第二版，动数据）：几笔合成的一条（零碎扣款 / 分分捐 / 收款按天，src.sum）存每一笔的明细 parts [{ time, fen, cp, desc, no, kind }]。
//   ① 新建的合并记录带全部明细，合计等于记录金额；指纹 recHash / impRecHash 不含它
//   ② 账单详情来源那一行下面列出这几笔（按时间、多于 10 笔先列 10 笔 +「展开全部」），合计；点一笔展开原文、单号能复制
//   ③ 往已有合并记录追加：明细跟着追加；撤销追加那次：明细回到原来；撤销第一次：记录删掉
//   ④ 导出备份 → 导入备份：明细还在（洗过：多的字段去掉，坏的整个不要）
//   ⑤ 以前合成的、没存明细的：写「这条是早一点导入的，没有存每一笔的明细」
//   jsdom，账单全是虚构的。
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
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 6, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '分分捐', cp: '某虚构公益', desc: '/', io: 'expense', fen: 1, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const PA = []; for (let d = 1; d <= 12; d++) PA.push(wx({ time: T(d) }));
const PB = PA.concat([13, 14, 15].map(d => wx({ time: T(d) })));
const OTHER = wx({ time: T(3, 12), kind: '商户消费', cp: '某虚构面馆', desc: '午餐', fen: 2200 });
const bill = (txs, to) => [['微信.csv', B.bill('wechat', txs, { range: { from: '2026-10-01 00:00:00', to: '2026-10-' + to + ' 23:59:59' } }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  const pet = () => t.recs().find(r => r.src && r.src.sum === 'petty');
  // ===== ① 合成一条，带明细 =====
  await t.importFiles(bill(PA.concat([OTHER]), 12));
  const p1 = pet();
  ok(p1 && p1.money === 0.12 && Array.isArray(p1.parts) && p1.parts.length === 12, '1 12 笔分分捐合成一条 0.12，带 12 笔明细');
  ok(p1.parts.reduce((s, x) => s + x.fen, 0) === 12 && p1.parts.every((x, i) => x.no === PA[i].no && x.cp === '某虚构公益' && x.kind === '分分捐' && /^2026-10-\d\dT06:00$/.test(x.time)) && p1.parts.every((x, i, a) => !i || a[i - 1].time <= x.time),
    '1 每笔：时间、金额（分）、对方、交易类型、单号，按时间排；合计等于记录金额');
  ok(!t.recs().find(r => r.cp !== undefined && !r.src.sum && r.parts), '1 别的记录不带 parts');
  const lg1 = (await t.logs()).pop(), i1 = lg1.add.indexOf(p1.id);
  ok(lg1.h[i1] === W.recHash(p1) && W.recHash(p1) === W.recHash(Object.assign({}, p1, { parts: undefined })) && t.w.JiwenStore.impRecHash(p1) === W.recHash(p1), '1 指纹不含明细（主页面和 write.js 一样）');

  // ===== ② 详情里列出来 =====
  t.w.JiwenDetail.openDetail(p1.id); await tick();
  const rows = () => [...$('detailParts').querySelectorAll('button.detail-part')];
  ok($('detailParts') && /是这 12 笔合成的/.test($('detailParts').textContent) && rows().length === 10 && $('detailPartsMore') && /展开全部 12 笔/.test($('detailPartsMore').textContent), '2 来源下面列出：先 10 笔 +「展开全部 12 笔」');
  ok(/^10月1日 06:00$/.test(rows()[0].querySelector('.detail-part-time').textContent) && rows()[0].querySelector('.detail-part-cp').textContent === '某虚构公益' && rows()[0].querySelector('.detail-part-amt').textContent === '0.01', '2 一行一笔：时间 · 对方 · 金额');
  ok($('detailPartsSum').textContent === '合计 0.12', '2 合计等于这条的金额：' + $('detailPartsSum').textContent);
  $('detailPartsMore').click();
  ok(rows().length === 12 && !$('detailPartsMore'), '2 展开全部：12 笔');
  rows()[2].click();
  const rb = $('detailParts').querySelector('.detail-part-raw');
  ok(rb && /时间：2026-10-03 06:00/.test(rb.textContent) && /金额：支出 0\.01/.test(rb.textContent) && new RegExp('单号：' + PA[2].no).test(rb.textContent) && /交易类型：分分捐/.test(rb.textContent) && rb.querySelector('.detail-raw-copy'), '2 点一笔：展开它的原文，单号能复制');
  rows()[2].click();
  ok(!$('detailParts').querySelector('.detail-part-raw'), '2 再点收起');
  try { t.w.JiwenDetail.closeDetail(); } catch (_) {}

  // ===== ③ 追加 → 撤销 =====
  await t.importFiles(bill(PB, 15));
  const p2 = pet(), lg2 = (await t.logs()).pop();
  ok(p2.id === p1.id && p2.money === 0.15 && p2.parts.length === 15 && p2.parts.slice(12).map(x => x.no).join() === PB.slice(12).map(x => x.no).join(), '3 第 2 次往这条追加 3 笔：0.15，明细跟着追加到 15 笔');
  ok(lg2.chg.some(c => c.id === p1.id && typeof c.was.parts === 'string' && JSON.parse(c.was.parts).length === 12), '3 导入记录 chg 里记着原来的明细（撤销用）');
  t.w.JiwenDetail.openDetail(p2.id); await tick();
  ok($('detailPartsSum').textContent === '合计 0.15', '3 详情合计跟着变');
  try { t.w.JiwenDetail.closeDetail(); } catch (_) {}
  let u = await t.st().undoPlan(lg2.b); await t.st().undo(u); await t.idle();
  ok(pet().money === 0.12 && pet().parts.length === 12 && JSON.stringify(pet().parts) === JSON.stringify(p1.parts), '3 撤销第 2 次：金额、明细都回到原来');

  // ===== ④ 备份带着 =====
  $('exportBtn').click(); await t.until(() => t.w.__files.length);
  const bk = t.w.__files[t.w.__files.length - 1];
  ok(bk.indexOf('"parts"') >= 0, '4 导出备份带明细');
  { const pl = t.w.JiwenStore.odBuildPayload(); const r = (pl.data || []).find(x => x.src && x.src.sum); ok(r && r.parts && r.parts.length === 12, '4 云备份的内容也带明细'); }
  const tweak = fn => { const o = JSON.parse(bk); let hit = 0; const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (Array.isArray(v.parts)) { fn(v.parts); hit++; } Object.values(v).forEach(walk); } }; walk(o); if (!hit) throw new Error('备份里没找到 parts'); return JSON.stringify(o); };
  await t.w.JiwenStore.importArchiveFromText(tweak(ps => { ps[0].junk = 'x'; }), A.ID); await t.idle();
  const a2 = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives).pop(), rb2 = t.w.JiwenStore.loadStore(A.ID).archives[a2].records.find(r => r.src && r.src.sum);
  ok(rb2 && rb2.parts && rb2.parts.length === 12 && !rb2.parts.some(x => 'junk' in x) && rb2.parts[0].no === PA[0].no, '4 导入备份：明细还在，多的字段洗掉');
  const badText = tweak(ps => { ps[1].fen = 'x'; });
  await t.w.JiwenStore.importArchiveFromText(badText, A.ID); await t.idle();
  const a3 = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives).pop(), rb3 = t.w.JiwenStore.loadStore(A.ID).archives[a3].records.find(r => r.src && r.src.sum);
  ok(rb3 && !rb3.parts && rb3.money === 0.12 && a3 !== a2, '4 明细里有一笔坏的：整个不要（不留半截），记录照留');

  // ===== ① 撤第 1 次：干净 =====
  const lg1b = (await t.logs()).pop();
  u = await t.st().undoPlan(lg1b.b); await t.st().undo(u); await t.idle();
  ok(!pet() && !t.recs().length, '1 撤销第 1 次：合成的那条删掉，账本回到空的');

  // ===== ⑤ 老记录没有明细 =====
  await t.importFiles(bill(PA, 12));
  { const s = t.w.JiwenStore.loadStore(A.ID); const a = s.archives['默认存档']; a.records = a.records.map(r => { const o = Object.assign({}, r); delete o.parts; return o; }); t.w.JiwenStore.saveStore(s, A.ID); await t.idle(); }
  t.w.JiwenDetail.openDetail(pet().id); await tick();
  ok($('detailPartsNone') && $('detailPartsNone').textContent === '这条是早一点导入的，没有存每一笔的明细' && !$('detailParts').querySelector('.detail-part'), '5 以前合成的没存明细：照实写一句，不列');
  try { t.w.JiwenDetail.closeDetail(); } catch (_) {}
  // 往没有明细的老记录追加：不接（免得只列一半）
  await t.importFiles(bill(PB, 15));
  ok(pet().money === 0.15 && !pet().parts, '5 往没有明细的老记录追加：金额照加，明细不接');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
