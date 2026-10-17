// 1016-Q 只对账（jsdom 跑整个 App，真导真撤）。node zA-import-recon.test.js [index.html]
// 确认页写「这段时间漏记了 N 笔，共 x 元」；底部「只对账」进勾选清单（返回键、「‹ 返回」回到确认页）；「补进 K 笔」只写勾选的：
// 新建这几条、登记这几个单号，其余一律不动（不合并手记、不登记忽略、不进待处理、不存规则、名单只加用到的）；
// 下次再导同一份文件结果不变（只是补进去的那几笔变成「导入过」）；导入记录标「只对账」，能撤销、撤完逐字节一样。
// 账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const W = require('../www/import/write.js');

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
const man = (id, mo, d, money) => ({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' });
const snapRows = p => p.rows.filter(d => d.src === 'row').map(d => [d.key, d.group, d.cat, d.why || '']).sort((a, b) => a[0] < b[0] ? -1 : 1);

(async () => {
  const RECS = [man('m1', 10, 5, 30), man('m2', 10, 1, 50)];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS) });
  const { $, d } = t;
  const exact = wx({ time: T(10, 5, 12), cp: '某虚构面馆', fen: 3000 });
  const days = wx({ time: T(10, 6), cp: '某虚构饭店', fen: 5000 });
  const new1 = wx({ time: T(10, 8), cp: '某虚构书店', fen: 1200 });
  const new2 = wx({ time: T(10, 9), cp: '某虚构花店', fen: 2000 });
  const closed = wx({ time: T(10, 10), cp: '某虚构店', fen: 900, status: '交易关闭' });
  const petty = [1, 2, 3].map(i => wx({ time: T(10, i, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  const F = [['微信.csv', bill([exact, days, new1, new2, closed].concat(petty))]];
  const D0 = await t.dump();

  // ===== 1. 确认页：漏记报告；进出只对账清单 =====
  let first = null;
  await t.importFiles(F, S => {
    first = S.plan;
    ok($('impMissed') && /这段时间漏记了 5 笔，共 32\.03 元/.test($('impMissed').textContent), '1 确认页写「这段时间漏记了 5 笔，共 32.03 元」：' + ($('impMissed') && $('impMissed').textContent));
    ok($('impRecon') && !$('impRecon').disabled && $('impRecon').textContent === '只对账', '1 底部有「只对账」');
  }, { noGo: true, stay: true });
  $('impRecon').click();
  ok($('impTitle').textContent === '只对账' && d.querySelectorAll('.imp-recon-row').length === 3 && $('impGo').disabled && $('impGo').textContent === '补进 0 笔',
    '1 只对账清单：3 项（两笔 + 分分捐一项），没勾时「补进 0 笔」不能点');
  await t.back();
  ok($('impTitle').textContent === '导入确认' && $('impPage').style.display === 'block', '1 返回键回到确认页，不关页面');
  $('impRecon').click();
  const row = id => d.querySelector('.imp-recon-row[data-id="wechat|' + id + '"] input');
  row(new1.no).click();
  ok($('impGo').textContent === '补进 1 笔' && !$('impGo').disabled, '1 勾一笔：「补进 1 笔」');
  $('impRecon').click();
  ok($('impTitle').textContent === '导入确认' && /^新建/.test($('impGo').textContent), '1 「‹ 返回」回到确认页，按钮恢复');
  $('impRecon').click();
  ok(row(new1.no).checked, '1 再进来勾选还在');
  A.clickGo(t.w);
  await t.until(() => $('impResult'));
  ok(/只对账：补进了 1 条记录/.test($('impResult').textContent) && /其余什么都没改/.test($('impResult').textContent) && !/对不上/.test($('impResult').textContent), '1 结果页：补进了 1 条，其余没改');
  $('impBackToLedger').click(); await t.idle();

  // ===== 2. 只写了这一笔 =====
  {
    const recs = t.recs(), added = recs.filter(r => !RECS.some(m => m.id === r.id));
    ok(added.length === 1 && added[0].money === 12 && added[0].src.app === 'wechat' && added[0].cp === 0, '2 新建了 1 条（12 元），交易对方编号 0');
    ok(same(recs.filter(r => RECS.some(m => m.id === r.id)), RECS), '2 手记一条都没动（金额相同的那条也没合并）');
    const T1 = await t.st().ordersRead();
    ok(T1.size === 1 && T1.get('wechat', new1.no) && !T1.get('wechat', closed.no), '2 单号表只登记了这一笔（交易关闭的也没登记忽略）');
    ok((await t.st().pendingRead()).length === 0, '2 待处理池没进东西');
    const a = t.arch();
    ok(same(a.cps, ['某虚构书店']) && !a.importRules && !a.cats.some(c => !['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他', '杂项'].includes(c)), '2 名单只加了用到的名字，没存规则，没建分类');
    const [lg] = await t.logs();
    ok(lg.only === true && lg.add.length === 1 && lg.chg.length === 0, '2 导入记录标了只对账');
  }
  // ===== 3. 再导同一份文件：结果不变（只是那一笔变成导入过）=====
  {
    const r = await t.importFiles(F, null, { noGo: true });
    const a = snapRows(first).filter(x => x[0] !== 'wechat|' + new1.no), b = snapRows(r.plan).filter(x => x[0] !== 'wechat|' + new1.no);
    const n1 = r.plan.rows.find(x => x.key === 'wechat|' + new1.no);
    ok(same(a, b) && n1.group === 'skip' && n1.why === 'imported', '3 再导：除了补进去的那笔变成「以前导入过」，其余和第一次一模一样');
  }
  // ===== 4. 导入记录标「只对账」，撤销后逐字节一样 =====
  {
    $('devLogsBtn').click();
    await t.until(() => d.querySelectorAll('.imp-log').length === 1);
    ok(/只对账/.test(d.querySelector('.imp-log').textContent), '4 导入记录里标「只对账」');
    d.querySelector('.imp-log-undo').click();
    await t.until(() => t.ask());
    await t.askOk();
    await t.until(() => $('impUndoNotice') && $('impLogs'));
    ok(same(await t.dump(), D0), '4 撤销后和导入前逐字节一样');
    await t.back();
  }
  // ===== 5. 纯计算：onlyKeys 名单重拼、勾分分捐一项全带上 =====
  {
    const ws = { version: 'x', batch: 'b1', at: '', counts: { add: 5, skip: 1 }, total: 9, cpLen: 1, pmLen: 0, cps: ['旧', 'A', 'B'], pms: ['零钱'], catsAdded: ['新类'],
      records: [{ tmp: 't1', cat: '新类', cp: 1, pm: 0 }, { tmp: 't2', cat: '其他', cp: 2, pm: 0 }, { tmp: 't3', cat: '其他', refundOf: { tmp: 't1' } }],
      orders: [{ app: 'wechat', no: 'a', st: 0, ref: { tmp: 't1' } }, { app: 'wechat', no: 'b', st: 0, ref: { tmp: 't2' } }, { app: 'wechat', no: 'c', st: 1, ref: null }],
      changes: [{ id: 'm1' }], pending: [{}], log: { b: 'b1', rulesAdded: { cat: [{ kw: 'x', cat: '其他' }], type: [] } } };
    const o = W.onlyKeys(ws, ['wechat|b', 'wechat|c'], { cps: ['旧'], pms: [] });
    ok(o.records.length === 1 && o.records[0].cp === 1 && o.records[0].pm === 0 && same(o.cps, ['旧', 'B']) && same(o.pms, ['零钱']), '5 只留勾的：名单按用到的重拼');
    ok(!o.changes.length && !o.pending.length && same(o.orders.map(x => x.no), ['b']) && !o.catsAdded.length && !o.log.rulesAdded.cat.length && o.counts.add === 1, '5 不改别的记录、不进待处理、不登记忽略、不建没用到的分类、不存规则');
  }

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
