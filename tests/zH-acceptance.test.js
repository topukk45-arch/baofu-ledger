// 第一期 1.0 验收清单（需求文档「第一期验收」），能自动测的在这里从头到尾真走一遍（jsdom 跑整个 App，真导真撤）。
// node zH-acceptance.test.js [index.html]。每一条前面的编号对应文档里的顺序；细的用例在各版自己的测试文件里。账单、手记全是虚构的。
//   1 同一份文件导两次，第二次新增 0 条
//   2 手记过的一笔（同金额、差 2 天），导入后只有 1 条，分类和备注是手记的
//   3 差额能逐项拆开，每个文件 × 收支合计差 0 分
//   4 撤销后，存档和导入前逐字节一致
//   5 交易关闭、等待付款的一条都不进账
//   6 GBK 和 UTF-8、表头位置不同、列数不对的坏文件（坏的那份不导、别的照导）
//   7 撤销一次追加过汇总记录的导入后，汇总回到追加前；撤中间的要先撤之后碰过同样记录的，倒序撤完逐字节一致
//   8 同时选两份时间重叠的文件，重叠部分只算一次
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
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});
const diffZero = p => p.files.filter(f => !f.fatal).every(f => ['expense', 'income', 'neutral'].every(io => !f.diff[io] || !f.diff[io].header || f.diff[io].unreadable === 0));

(async () => {
  const RECS = [man('m1', 10, 5, 15, { cat: '早饭', remark: '豆浆油条' }), man('m2', 10, 20, 66)];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, ['未分类', '早饭', '吃饭', '购物', '其他']) });
  const D0 = await t.dump();

  // 两家各一份：微信 UTF-8 CSV、支付宝 GBK CSV（表头前面多两行说明）；里面有手记过的、交易关闭、等待付款、退款、分分捐
  const W1 = [wx({ time: T(10, 3, 7, 50), cp: '某虚构小铺', desc: '/', fen: 1500 }),                       // 手记 10-05 的 15 元，差 2 天（1017-UI6 起手记比账单早的、分类冲突的不自动合并：这里是事后补记、账单推不出分类）
              wx({ time: T(10, 5), cp: '某虚构书店', fen: 3200 }),
              wx({ time: T(10, 6), cp: '某虚构超市', fen: 5000, status: '已退款¥10.00' }),
              wx({ time: T(10, 7), cp: '某虚构超市', kind: '某虚构超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: '5030000000' + String(++seq).padStart(19, '0') })]
    .concat([1, 2, 3, 4, 5].map(d => wx({ time: T(10, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 })));
  const A1 = [ali({ time: T(10, 8), cp: '某虚构药房', kind: '医疗健康', fen: 4300 }),
              ali({ time: T(10, 9), cp: '某虚构商城', fen: 8800, status: '交易关闭' }),
              ali({ time: T(10, 10), cp: '某虚构商城', fen: 1999, status: '等待付款' }),
              ali({ time: T(10, 11), cp: '某虚构文具', kind: '文化休闲', fen: 650 })];
  const fW1 = ['微信10月.csv', B.bill('wechat', W1, { range: RANGE }).bytes];
  const fA1 = ['支付宝10月.csv', B.bill('alipay', A1, { range: RANGE, encoding: 'gbk', edit: s => '虚构的多出来的一行\r\n另一行说明\r\n' + s }).bytes];
  // 坏文件：列数不对（前 3 行数据比表头多两列）
  const bad = B.bill('wechat', [wx({ time: T(10, 12) }), wx({ time: T(10, 13) }), wx({ time: T(10, 14) })], { range: RANGE,
    edit: s => s.split('\n').map(l => /^2026-10-1[234]/.test(l) ? l + ',多出来,两列' : l).join('\n') }).bytes;
  const fBad = ['坏的.csv', bad];

  // ===== 6 + 3 + 5 + 2：第一次导 =====
  const r1 = await t.importFiles([fW1, fA1, fBad]);
  {
    const fs1 = r1.plan.files;
    ok(fs1.length === 3 && fs1.filter(f => f.fatal).length === 1 && fs1.find(f => f.fatal).name === '坏的.csv', '6 列数不对的坏文件认不出、不导，另两份照导');
    ok(fs1.find(f => f.app === 'alipay' && !f.fatal).countOk === true && fs1.find(f => f.app === 'wechat' && !f.fatal).countOk === true, '6 GBK（表头前多两行）和 UTF-8 两份都读出来、笔数和头部统计一致');
    ok(diffZero(r1.plan), '3 每个文件 × 收支的差额逐项拆开，合计差 0 分');
    const recs = t.recs();
    ok(!recs.some(r => r.money === 88 || r.money === 19.99), '5 交易关闭、等待付款的一条都没进账');
    const m1 = recs.filter(r => r.money === 15);
    ok(m1.length === 1 && m1[0].id === 'm1' && m1[0].cat === '早饭' && m1[0].remark === '豆浆油条' && m1[0].src && m1[0].src.merged, '2 手记过的一笔（同金额、差 2 天）：只有 1 条，分类和备注是手记的');
  }
  const D1 = await t.dump();
  // ===== 1：同一份文件再导 =====
  {
    const r = await t.importFiles([fW1, fA1], null, { noGo: true });
    ok(r.plan.counts.add === 0 && r.plan.counts.merge === 0 && r.plan.counts.refund === 0 && r.plan.counts.neutral === 0, '1 同一份文件导第二次：新增 0 条（也不合并、不挂退款）');
  }
  // ===== 8：两份时间重叠的文件一起选 =====
  const W2 = [wx({ time: T(10, 25), cp: '某虚构花店', fen: 2100 }), wx({ time: T(10, 26), cp: '某虚构面馆', fen: 1800 })];
  const W3 = W2.concat([wx({ time: T(10, 27), cp: '某虚构影院', fen: 4500 })]);       // 和 W2 重叠两笔（同单号）
  const r8 = await t.importFiles([['微信下旬.csv', B.bill('wechat', W2, { range: RANGE }).bytes], ['微信下旬加一天.csv', B.bill('wechat', W3, { range: RANGE }).bytes]]);
  {
    const added = t.recs().filter(r => ['2026-10-25', '2026-10-26', '2026-10-27'].includes(r.time.slice(0, 10)));
    ok(added.length === 3 && r8.result.ws.counts.add === 3, '8 两份重叠的文件一起选：重叠的两笔只算一次，共新增 3 条');
  }
  const D2 = await t.dump();
  // ===== 7：分分捐追加 → 撤销回到追加前；撤中间的要先撤之后的 =====
  const W4 = [6, 7, 8].map(d => wx({ time: T(10, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  await t.importFiles([['微信分分捐补.csv', B.bill('wechat', W4, { range: RANGE }).bytes]]);
  const pet = () => t.recs().find(r => r.src && r.src.sum === 'petty');
  ok(pet().money === 0.08, '7 分分捐追加到 0.08（5 笔 + 3 笔）');
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  const logs = await t.logs();
  {
    const p = await t.st().undoPlan(logs[0].b);
    ok(p.chain.length === 3 && p.chain[0] === logs[2].b && p.why[logs[2].b].some(x => x.why === 'same'), '7 撤第一次：要先撤之后追加了同一条分分捐的那次（第三次；第二次用了第一次加的对方名，也要先撤），从新到旧连着撤');
    const p3 = await t.st().undoPlan(logs[2].b);
    await t.st().undo(p3); await t.idle();
    ok(pet().money === 0.05 && same(await t.dump(), D2), '7 撤追加的那次：分分捐回到 0.05，和那次导入前逐字节一样');
  }
  // ===== 4：倒序撤完，和导入前逐字节一致 =====
  {
    for (const l of (await t.logs()).reverse()) { const p = await t.st().undoPlan(l.b); await t.st().undo(p); await t.idle(); }
    ok(same(await t.dump(), D0), '4 倒序撤完：存档（账本、单号表、待处理池、导入记录）和导入前逐字节一致');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
