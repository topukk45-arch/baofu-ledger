// 1017-X 随机组合测试（zZz6）找到的两处嵌套问题，各用一个固定的小例子钉住（jsdom，虚构数据）。node zZz7-nested-fixes.test.js [index.html]
// 1. 拆开合并 × AI 修改 × 撤销导入：AI 改的那条手记后来被拆开（不算那次导入碰过的了），撤那次导入时也要先撤这次 AI 修改，
//    不留下一条指向不在的导入的 AI 修改；
// 2. 处理待处理 × 之后的导入 × 撤销：待处理那笔的对方名是之后那次导入才加进名单的，作为新增时不带对方编号，
//    撤销之后那次导入（名单截短）以后不会越界；
// 3. AI 修改 × 删分类 × 撤销 AI 修改：AI 改之前的分类后来被删了，撤销时不改回那个不存在的分类（按「保留你改的」算）；
// 4. 待处理 × 只对账：只对账补进了一笔原来在待处理池里的账单，池子里那份拿掉（不然会记两遍），撤销这次只对账时放回原处。
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
const bill = tx => [['微信' + (++seq) + '.csv', B.bill('wechat', tx, { range: RANGE }).bytes]];
(async () => {
  // ===== 1 =====
  {
    const MAN = [{ id: 'm1', time: '2026-10-06T09:30', money: 36, type: 'expense', cat: '购物', remark: '买书' }];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '购物', '零食']), now: '2026-10-20T10:00:00' });
    await t.w.eval('loadImportUI')();
    const D0 = await t.dump();
    await t.importFiles(bill([wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' })]));
    const [lg] = await t.st().importsRead();
    ok(lg.chg.some(c => c.id === 'm1'), '1 手记 m1 和书店那笔合并了');
    await t.st().aiApply({ of: lg.b, changes: [{ id: 'm1', set: { cat: '零食' } }] }, {});
    await t.st().splitMerge('m1');
    const lg2 = (await t.st().importsRead())[0];
    ok(!lg2.chg.some(c => c.id === 'm1'), '1 拆开以后 m1 不算那次导入碰过的了');
    const p = await t.st().undoPlan(lg.b);
    ok(p.ok && p.chain.length === 2 && /AI 修改/.test(t.w.JiwenImportUndo.describe(p)), '1 撤那次导入：要先撤那次 AI 修改（连着撤 2 次）');
    await t.st().undo(p);
    ok((await t.st().importsRead()).length === 0, '1 撤完导入记录是空的，不留指向不在的导入的 AI 修改');
    ok(JSON.stringify(await t.dump()) === JSON.stringify(D0), '1 撤完和最开始逐字节一样');
  }
  // ===== 2 =====
  {
    const MAN = [{ id: 'm2', time: '2026-10-01T08:30', money: 50, type: 'expense', cat: '吃饭', remark: '聚餐' }];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '其他']), now: '2026-10-20T10:00:00' });
    await t.w.eval('loadImportUI')();
    await t.importFiles(bill([wx({ time: T(6, 12), cp: '某虚构饭店', fen: 5000 })]));         // 比手记晚 5 天 → 待处理，不进名单
    const [l1] = await t.st().importsRead();
    ok((await t.st().pendingRead()).length === 1 && !(t.arch().cps || []).includes('某虚构饭店'), '2 第一次：饭店那笔进待处理，名字不进名单');
    await t.importFiles(bill([wx({ time: T(16, 12), cp: '某虚构饭店', fen: 1200 })]));        // 第二次导入把「某虚构饭店」加进名单
    const cps = t.arch().cps;
    ok(cps.indexOf('某虚构饭店') >= l1.cpEnd, '2 第二次导入才把这个名字加进名单（编号在第一次导完的长度之外）');
    const [x] = await t.st().pendingCheck();
    await t.st().pendingApply([{ key: x.key, do: 'new', cat: '其他' }]);
    const nr = t.recs().find(r => r.money === 50 && r.time === '2026-10-06T12:00');
    ok(nr && nr.batch === l1.b && nr.cp === undefined, '2 作为新增：算进第一次导入，但不带之后才加进名单的对方编号');
    const logs = await t.st().importsRead();
    await t.st().undo(await t.st().undoPlan(logs[1].b));
    const a = t.arch();
    ok(t.recs().every(r => !Number.isInteger(r.cp) || r.cp < (a.cps || []).length), '2 撤销第二次导入以后：没有对方编号越界的记录');
    await t.st().undo(await t.st().undoPlan(logs[0].b));
    ok(t.recs().length === 1 && t.recs()[0].id === 'm2', '2 再撤第一次：回到只有那条手记');
  }
  // ===== 3 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([], ['未分类', '吃饭', '购物', '零食']), now: '2026-10-20T10:00:00' });
    await t.w.eval('loadImportUI')();
    await t.importFiles(bill([wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' })]));
    const [lg] = await t.st().importsRead(), id = lg.add[0];
    await t.st().aiApply({ of: lg.b, changes: [{ id, set: { cat: '购物' } }] }, {});
    await t.st().aiApply({ of: lg.b, changes: [{ id, set: { cat: '零食' } }] }, {});     // 第二次 AI 修改：原来是「购物」
    t.w.deleteCat('购物'); t.$('askOk').click(); await t.idle();
    const logs = await t.st().importsRead();
    const p = await t.st().undoPlan(logs[2].b);
    await t.st().undo(p);
    const r = t.recs().find(x => x.id === id);
    ok(t.arch().cats.includes(r.cat || '未分类') || (r.cat || '未分类') === '未分类', '3 撤销 AI 修改：原来的分类被删了，不改回不存在的分类（现在：' + r.cat + '）');
  }
  // ===== 4 =====
  {
    const MAN = [{ id: 'm2', time: '2026-10-01T08:30', money: 50, type: 'expense', cat: '吃饭', remark: '聚餐' }];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, ['未分类', '吃饭', '其他']), now: '2026-10-20T10:00:00' });
    await t.w.eval('loadImportUI')();
    const F = bill([wx({ time: T(6, 12), cp: '某虚构饭店', fen: 5000 }), wx({ time: T(7, 12), cp: '某虚构茶馆', fen: 900 })]);
    await t.importFiles(F);
    ok((await t.st().pendingRead()).length === 1, '4 第一次：饭店那笔进待处理');
    { const s0 = t.w.JiwenStore.loadStore(A.ID); s0.archives['默认存档'].records = s0.archives['默认存档'].records.filter(r => r.id !== 'm2'); t.w.JiwenStore.saveStore(s0, A.ID); await t.idle(); }
    const D1 = await t.dump();
    await t.importFiles(F, null, { noGo: true, stay: true });
    t.$('impRecon').click();
    const row = Array.from(t.d.querySelectorAll('.imp-recon-row')).find(x => /−50\.00/.test(x.textContent));
    ok(!!row, '4 候选手记删了以后再导：饭店那笔进了「漏记」，只对账清单里能勾');
    row.querySelector('input').click();
    A.clickGo(t.w); await t.until(() => t.$('impResult')); t.$('impBackToLedger').click(); await t.idle();
    ok((await t.st().pendingRead()).length === 0 && t.recs().filter(r => r.money === 50).length === 1, '4 只对账补进了它：待处理池里那份拿掉，账本里只有一条');
    const logs = await t.st().importsRead();
    await t.st().undo(await t.st().undoPlan(logs[logs.length - 1].b));
    ok(JSON.stringify(await t.dump()) === JSON.stringify(D1), '4 撤销这次只对账：待处理放回原处，和只对账之前逐字节一样');
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
