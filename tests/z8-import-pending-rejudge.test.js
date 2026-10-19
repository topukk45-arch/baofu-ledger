// 1016-O 再导入时重新判断待处理（jsdom 跑整个 App，真导真撤）。node z8-import-pending-rejudge.test.js [index.html]
// 文件里有待处理池里的单号：照常重新判断；还是拿不准的跳过、不重复列出；有了结论的照常导入，写入时从池子里拿掉，
// 确认页提示「原来待处理的 N 笔有结论了」；拿掉的带原来的位置记进导入记录，撤销时放回原处（逐字节一样）；
// 撤更早那批时，拿走了它的待处理的后一次要先撤。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = txns => B.bill('wechat', txns, { range: RANGE }).bytes;
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});

(async () => {
  const RECS = [man('m1', 10, 5, 30, { remark: '面条', cat: '购物' }), man('m2', 10, 1, 50, { remark: '聚餐' })];   // 1.1 起金额相近、分类对得上的会自动合并；这里要的是「待你确认」，分类故意不一样
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS) });
  const { $ } = t;
  const near = wx({ time: T(10, 5, 12, 10), cp: '某虚构面馆', fen: 2950 });
  const days = wx({ time: T(10, 6), cp: '某虚构饭店', fen: 5000 });
  const plain = wx({ time: T(10, 8), cp: '某虚构书店', fen: 1200 });
  const F = [['微信.csv', bill([near, days, plain])]];

  // ===== 1. 第一次：两笔待处理 =====
  const r1 = await t.importFiles(F);
  const pool1 = await t.st().pendingRead();
  ok(r1.result && pool1.length === 2 && pool1[0].no === near.no && pool1[1].no === days.no, '1 第一次：金额相近、差 5 天两笔进待处理');

  // ===== 2. 原样再导：都还拿不准，不重复列出 =====
  {
    const r = await t.importFiles(F, null, { noGo: true });
    const g = k => r.plan.rows.find(d => d.key === 'wechat|' + k);
    ok(r.plan.counts.pending === 0 && g(near.no).group === 'skip' && g(near.no).why === 'inpending' && g(days.no).why === 'inpending', '2 原样再导：还拿不准的跳过（已经在待处理里了），不重复列出');
    ok(!$('impPendResolved'), '2 没有「有结论了」的提示');
  }

  // ===== 3. 改了手记以后再导：金额相近那笔有了结论 =====
  await (async () => { const s = t.w.JiwenStore.loadStore(A.ID); s.archives['默认存档'].records = s.archives['默认存档'].records.map(r => r.id === 'm1' ? Object.assign({}, r, { money: 29.5 }) : r); t.w.JiwenStore.saveStore(s, A.ID); await t.idle(); })();
  const Dedit = await t.dump();
  let note = '';
  const r3 = await t.importFiles(F, () => { note = $('impPendResolved') ? $('impPendResolved').textContent : ''; });
  {
    const g = k => r3.plan.rows.find(d => d.key === 'wechat|' + k);
    ok(g(near.no).group === 'merge' && g(near.no).into === 'm1' && g(days.no).why === 'inpending', '3 再导：金额相近那笔这次正好等于手记 → 合并；差 5 天那笔还拿不准 → 跳过');
    ok(/原来待处理的 1 笔有结论了/.test(note), '3 确认页提示「原来待处理的 1 笔有结论了」：' + note);
    const pool = await t.st().pendingRead();
    const [, l2] = await t.logs();
    const m1 = t.recs().find(r => r.id === 'm1');
    ok(pool.length === 1 && pool[0].no === days.no, '3 导入后：有结论的从池子里拿掉，剩 1 笔');
    ok(m1.src && m1.src.merged && m1.batch === l2.b, '3 合并到手记，批次是这一次');
    ok(l2.pendTaken && l2.pendTaken.length === 1 && l2.pendTaken[0].i === 0 && l2.pendTaken[0].x.no === near.no, '3 导入记录里记下拿掉的那笔和它原来的位置');
  }
  // ===== 4. 撤这一次：拿掉的放回原处，和这次导入前逐字节一样 =====
  {
    const [, l2] = await t.logs();
    await t.w.eval('JiwenImportEntry.loadImportUI')();
    const p = await t.st().undoPlan(l2.b);
    ok(p.chain.length === 1 && /放回待处理/.test(t.w.JiwenImportUndo.describe(p)), '4 摘要写明放回待处理');
    await t.st().undo(p); await t.idle();
    ok(same(await t.dump(), Dedit), '4 撤完：待处理池（顺序也一样）、手记、单号表、导入记录和这次导入前逐字节一样');
  }
  // ===== 5. 再导一次后撤第一次：要先撤拿走了它待处理的那一次 =====
  {
    await t.importFiles(F);
    const [l1, l2] = await t.logs();
    const p = await t.st().undoPlan(l1.b);
    ok(same(p.chain, [l2.b, l1.b]) && p.why[l2.b].some(x => x.why === 'pending'), '5 撤第一次：第二次处理了它留下的待处理，要先撤第二次');
    ok(/处理了这批留下的待处理/.test(t.w.JiwenImportUndo.describe(p)), '5 摘要写明原因');
    await t.st().undo(p); await t.idle();
    const recs = t.recs();
    ok(same(recs, [Object.assign({}, RECS[0], { money: 29.5 }), RECS[1]]), '5 连着撤完：账本回到导入前（手记是你改过的 29.5）');
    ok((await t.st().pendingRead()).length === 0 && (await t.logs()).length === 0 && (await t.st().ordersRead()).size === 0, '5 待处理池、导入记录、单号表都空了');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
