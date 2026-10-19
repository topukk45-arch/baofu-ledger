// 1016-N 待处理页（⑧，jsdom 跑整个 App，真导真处理真撤）。node z7-import-pending.test.js [index.html]
// 纯计算（pending.js）：候选失效（删了 / 合并了 / 收支不一样）、合并 / 挂退款 / 新增 / 不要了算出来的清单、出错的动作不做。
// 页面：结果页「还有 N 笔待处理」、导入记录页的入口和每次的笔数；和手记合并（时间改账单的、带来源和那批的批次号）、
// 候选全不在时提示「原候选已不在，建议作为新增入账」、作为新增（选分类）、挂到原单当退款（分类照原单）、不要了（登记忽略，
// 微信已全额退款的再登记退款记号）、全部不要了；处理的算进原来那批（导入记录里有），撤销那批一起撤，倒序撤完回到导入前；
// 「不要了」的再导同一份文件不再出现。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const P = require('../www/import/pending.js');

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
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = txns => B.bill('wechat', txns, { range: RANGE }).bytes;
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});

(async () => {
  // ===== 1. 纯计算 =====
  {
    const items = [
      { app: 'wechat', no: 'N1', t: '2026-10-05T12:00', amt: 2950, io: 'expense', cp: '某虚构面馆', d: '面', cand: ['m1', 'mx'], b: 'b1', why: 'near' },
      { app: 'wechat', no: 'N2', t: '2026-10-10T12:00', amt: 2000, io: 'income', cp: '某虚构超市', d: '', cand: ['r1'], b: 'b2', why: 'refundcands' },
      { app: 'wechat', no: 'N3', t: '2026-10-07T12:00', amt: 4500, io: 'expense', cp: '某虚构店', d: '', cand: [], b: 'b1', why: 'fullnorefund' },
      { app: 'wechat', no: 'N4', t: '2026-10-06T12:00', amt: 5000, io: 'expense', cp: '某虚构饭店', d: '', cand: ['m2', 'm3'], b: 'b1', why: 'days' }];
    const recById = { m1: { id: 'm1', type: 'expense', cat: '吃饭', src: null }, r1: { id: 'r1', type: 'expense', cat: '购物', src: { app: 'wechat' } },
                      m3: { id: 'm3', type: 'expense', cat: '吃饭', src: { app: 'alipay' } } };
    const c = P.check(items, recById);
    ok(c[0].cands[0].ok && c[0].cands[1].lost === 'gone' && !c[0].lostAll, '1 候选：一条在、一条删了');
    ok(c[1].refund && c[1].cands[0].ok, '1 退款的候选是原单，带来源也算在');
    ok(c[3].lostAll && c[3].cands[1].lost === 'taken', '1 候选全不在（删了、和别的账单合并了）→ lostAll');
    ok(!c[2].cands.length && !c[2].lostAll && /已全额退款/.test(c[2].why), '1 没有候选的不算失效');
    const logs = [{ b: 'b1' }, { b: 'b2' }];
    const out = P.build({ items, recById, cps: ['某虚构面馆'], logs }, [
      { key: 'wechat|N1', do: 'merge', id: 'm1' }, { key: 'wechat|N2', do: 'refund', id: 'r1' }, { key: 'wechat|N3', do: 'drop' },
      { key: 'wechat|N4', do: 'merge', id: 'm3' }, { key: 'wechat|N9', do: 'drop' }]);
    ok(same(out.drop, ['wechat|N1', 'wechat|N2', 'wechat|N3']) && out.errors.length === 2, '1 失效的候选、不在池子里的不做，其余照做');
    ok(out.changes[0].id === 'm1' && out.changes[0].set.time === '2026-10-05T12:00' && out.changes[0].set.cp === 0 && out.changes[0].set.batch === 'b1' && out.changes[0].set.src.merged, '1 合并：时间改账单的、带来源和原来那批的批次号');
    ok(out.records[0].refundOf === 'r1' && out.records[0].batch === 'b2' && out.records[0].cp === 1 && out.cps[1] === '某虚构超市' && out.logs.b2.cpEnd === 2, '1 挂退款：b2 是最后一次，新名字往后加、记 cpEnd');
    ok(out.orders.filter(o => o.st === 1).length === 2 && out.orders.some(o => /^RW/.test(o.no)), '1 微信已全额退款的不要了：再登记一个退款记号');
    const out2 = P.build({ items, recById, cps: [], logs }, [{ key: 'wechat|N1', do: 'new', cat: '杂项' }]);
    ok(out2.records[0].cp === undefined && out2.cps.length === 0 && out2.records[0].cat === '杂项' && !out2.records[0].flow, '1 b1 不是最后一次：新名字不加进名单（免得被后一次撤销截掉）');
    const out3 = P.build({ items, recById, cps: [], logs }, [{ key: 'wechat|N2', do: 'new' }]);
    ok(out3.records[0].flow === true && out3.records[0].type === 'income', '1 退款作为新增：只算结余');
  }

  // ===== 2. jsdom：导两批，弄出四种待处理 =====
  const RECS = [man('m1', 10, 5, 30, { remark: '面条', cat: '购物' }), man('m2', 10, 1, 50, { remark: '聚餐' })];   // 1.1 起金额相近、分类对得上的会自动合并；这里要的是「待你确认」，分类故意不一样
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS) });
  const { $, d } = t;
  const D0 = await t.dump();
  const origA = wx({ time: T(10, 2), cp: '某虚构超市', fen: 8000 }), origB = wx({ time: T(10, 3), cp: '某虚构超市', fen: 6000 });
  const near = wx({ time: T(10, 5, 12, 10), cp: '某虚构面馆', fen: 2950 });
  const days = wx({ time: T(10, 6), cp: '某虚构饭店', fen: 5000 });
  const full = wx({ time: T(10, 7), cp: '某虚构文具店', fen: 4500, status: '已全额退款' });
  const F1 = [origA, origB, near, days, full];
  const r1 = await t.importFiles([['微信1.csv', bill(F1)]], null, { stay: true });
  ok(r1.result && r1.result.ws.counts.pending === 3 && $('impResPending') && /还有 3 笔待处理/.test($('impResPending').textContent), '2 第一次：3 笔待处理，结果页有入口');
  $('impBackToLedger').click(); await t.idle();
  const D1 = await t.dump();
  const refund = wx({ time: T(10, 10), cp: '某虚构超市', kind: '某虚构超市-退款', io: 'income', fen: 2000, status: '已退款¥20.00', no: wrno() });
  const r2 = await t.importFiles([['微信2.csv', bill([refund])]]);
  ok(r2.plan.counts.pending === 1, '2 第二次：退款找到两笔可能的原单，进待处理');
  const [L1, L2] = await t.logs();
  const pool0 = await t.st().pendingRead();
  ok(pool0.length === 4, '2 池子里 4 笔');

  // 导入记录页：入口和每次的笔数
  $('devLogsBtn').click();
  await t.until(() => $('impLogs'));
  ok($('impLogsPending') && /待处理 4 笔/.test($('impLogsPending').textContent), '3 导入记录页顶上有「待处理 4 笔」');
  const logRows = [...d.querySelectorAll('.imp-log')];
  ok(/待处理 1 笔/.test(logRows[0].textContent) && /待处理 3 笔/.test(logRows[1].textContent), '3 每次导入旁标出待处理笔数');
  $('impLogsPending').click();
  await t.until(() => d.querySelectorAll('.imp-pend').length === 4);
  ok($('impTitle').textContent === '待处理' && /共 4 笔/.test($('impPendHead').textContent), '3 待处理页：共 4 笔');
  const card = no => d.querySelector('.imp-pend[data-key="wechat|' + no + '"]');

  // 和手记合并
  {
    const c = card(near.no);
    ok(c && /金额相近/.test(c.textContent) && c.querySelector('.imp-pend-cand[data-id="m1"] .imp-pend-pick'), '4 金额相近的：候选是那条手记，能合并');
    c.querySelector('.imp-pend-cand[data-id="m1"] .imp-pend-pick').click();
    await t.until(() => $('impPendNotice') && d.querySelectorAll('.imp-pend').length === 3);
    const m1 = t.recs().find(r => r.id === 'm1');
    ok(m1.time === '2026-10-05T12:10' && m1.src && m1.src.merged && m1.batch === L1.b && m1.money === 30 && m1.remark === '面条', '4 合并：时间改账单的、带来源和第一批的批次号，金额备注不动');
    const T1 = await t.st().ordersRead();
    ok(T1.get('wechat', near.no).id === 'm1' && T1.get('wechat', near.no).batch === L1.b, '4 单号登记到手记、批次是第一批');
    const [l1] = await t.logs();
    ok(l1.chg.some(c => c.id === 'm1' && c.was.time === '2026-10-05T08:30' && c.now.time === '2026-10-05T12:10'), '4 写进第一批的导入记录（原值和写进去的值）');
  }
  // 候选被删 → 提示建议作为新增 → 作为新增（选分类）
  {
    await t.back();
    { const s = t.w.JiwenStore.loadStore(A.ID); s.archives['默认存档'].records = s.archives['默认存档'].records.filter(r => r.id !== 'm2'); t.w.JiwenStore.saveStore(s, A.ID); await t.idle(); }
    t.w.JiwenImportUI.openPending();
    await t.until(() => d.querySelectorAll('.imp-pend').length === 3);
    const c = card(days.no);
    ok(c.querySelector('.imp-pend-lost') && /原候选已不在，建议作为新增入账/.test(c.textContent) && /已经删了/.test(c.textContent) && !c.querySelector('.imp-pend-pick'), '5 候选手记删了：提示建议作为新增，不能再合并');
    const se = c.querySelector('.imp-pend-cat'); se.value = '杂项'; se.dispatchEvent(new t.w.Event('change'));
    c.querySelector('.imp-pend-new').click();
    await t.until(() => d.querySelectorAll('.imp-pend').length === 2);
    const nr = t.recs().find(r => r.time === '2026-10-06T12:00' && r.money === 50);
    const [l1] = await t.logs();
    ok(nr && nr.cat === '杂项' && nr.batch === L1.b && nr.src.app === 'wechat' && l1.add.includes(nr.id) && l1.h.length === l1.add.length, '5 作为新增：分类是选的、批次是第一批、写进第一批的导入记录（带指纹）');
  }
  // 挂到原单当退款
  {
    const c = card(refund.no);
    ok(c && c.querySelectorAll('.imp-pend-pick').length === 2 && /挂到这笔/.test(c.textContent) && !c.querySelector('.imp-pend-cat'), '6 退款：两笔原单候选，「挂到这笔」，没有分类下拉');
    const A0 = t.recs().find(r => r.money === 80 && r.src && r.src.app === 'wechat');
    c.querySelector('.imp-pend-cand[data-id="' + A0.id + '"] .imp-pend-pick').click();
    await t.until(() => d.querySelectorAll('.imp-pend').length === 1);
    const rf = t.recs().find(r => r.refundOf === A0.id);
    const [, l2] = await t.logs();
    ok(rf && rf.money === 20 && rf.type === 'income' && rf.cat === A0.cat && rf.batch === L2.b && l2.add.includes(rf.id), '6 挂上了：分类照原单、批次是第二批、写进第二批的导入记录');
  }
  // 不要了（微信已全额退款的）
  {
    const c = card(full.no);
    c.querySelector('.imp-pend-drop').click();
    await t.until(() => $('impPendHead') && /没有待处理/.test($('impPendHead').textContent));
    const T2 = await t.st().ordersRead();
    ok(T2.get('wechat', full.no).st === 1 && T2.get('wechat', full.no).batch === L1.b, '7 不要了：登记成忽略、批次是第一批');
    ok(T2.findPrefix('wechat', 'RW', 5).some(x => x.batch === L1.b), '7 再登记了退款记号');
    ok((await t.st().pendingRead()).length === 0, '7 池子空了');
  }
  await t.back();
  // 撤销第一批（要先撤第二批：退款挂在第一批的记录上）→ 回到导入前（m2 是你自己删的，不回来）
  {
    await t.w.eval('JiwenImportEntry.loadImportUI')();
    const p = await t.st().undoPlan(L1.b);
    ok(p.chain.length === 2, '8 撤第一批要连着撤第二批');
    await t.st().undo(p); await t.idle();
    const want = RECS.filter(r => r.id !== 'm2');
    ok(same(t.recs(), want), '8 撤完：账本回到导入前（合并的手记还原、作为新增的和挂的退款删掉）');
    const T3 = await t.st().ordersRead();
    ok(T3.size === 0 && (await t.st().pendingRead()).length === 0 && (await t.logs()).length === 0, '8 单号表、待处理池、导入记录都空了');
  }
  // ===== 9. 全部不要了 → 再导同一份文件不再出现 =====
  {
    await t.importFiles([['微信1.csv', bill(F1)]]);
    t.w.JiwenImportUI.openPending();
    // m2 已经删了，「差 5 天」那笔没有候选、直接算漏记新增了，待处理只剩 2 笔
    await t.until(() => d.querySelectorAll('.imp-pend').length === 2);
    $('impPendDropAll').click();
    await t.until(() => t.ask());
    ok(/这 2 笔都不要了/.test(t.ask().msg), '9 全部不要了：先问一句');
    await t.askOk();
    await t.until(() => $('impPendHead') && /没有待处理/.test($('impPendHead').textContent));
    await t.back();
    const r = await t.importFiles([['微信1.csv', bill(F1)]], null, { noGo: true });
    ok(r.plan.counts.pending === 0 && r.plan.counts.add === 0, '9 再导同一份文件：不要了的不再出现，也没有新增');
  }
  // ===== 10. 写到一半失败：什么都不改 =====
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([man('k1', 10, 5, 30, { cat: '购物' })]) });
    await t2.importFiles([['微信.csv', bill([wx({ time: T(10, 5, 13), cp: '某虚构面馆', fen: 2950 })])]]);
    const before = await t2.dump();
    t2.w.__impFailAt = 'pendingSave';
    t2.w.JiwenImportUI.openPending();
    await t2.until(() => t2.d.querySelectorAll('.imp-pend').length === 1);
    t2.d.querySelector('.imp-pend-pick').click();
    await t2.until(() => t2.ask());
    ok(/没处理成，账本没动/.test(t2.ask().msg), '10 写失败：提示账本没动');
    await t2.askOk();
    ok(same(await t2.dump(), before), '10 账本、单号表、待处理池、导入记录都没变');
    t2.w.__impFailAt = null;
    // 候选在页面打开以后被别的账单合并了
    await t2.until(() => t2.d.querySelectorAll('.imp-pend').length === 1);
    await (async () => { const s = t2.w.JiwenStore.loadStore(A.ID); s.archives['默认存档'].records = s.archives['默认存档'].records.map(r => r.id === 'k1' ? Object.assign({}, r, { src: { app: 'alipay', merged: true } }) : r); t2.w.JiwenStore.saveStore(s, A.ID); await t2.idle(); })();
    t2.d.querySelector('.imp-pend-pick').click();
    await t2.until(() => t2.ask());
    ok(/已经不在了/.test(t2.ask().msg), '10 候选在这期间被合并了：不改，提示重新看');
    await t2.askOk();
    ok(!t2.errs.length, '10 无报错 ' + t2.errs.join('|'));
  }

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
