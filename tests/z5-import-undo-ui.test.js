// 1016-L 撤销界面（⑦b，jsdom 跑整个 App，假 Worker、假 IndexedDB，真导真撤）。node z5-import-undo-ui.test.js [index.html]
// 结果页「撤销这次导入」；「设置 → 导入记录（开发中）」最近 10 次、新的在上、每次右侧「撤销」；确认框是 ⑦a 的摘要；
// 点取消什么都不改；撤销成功后停在「导入记录」，顶上「已撤销，删了 x 条、还原了 y 条」；要先撤之后的写在确认框里、一次连着撤；
// 返回键一层层关；1016-K 的临时按钮去掉了；开发开关关着时看不到入口。账单、手记全是虚构的。
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
  const RECS = [man('m1', 10, 1, 15, { remark: '早饭' }), man('m2', 10, 2, 16)];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS) });
  const { $, w, d } = t;

  // ===== 1. 入口：开发开关里的「导入记录」，1016-K 的临时按钮没了 =====
  ok($('devLogsBtn') && $('devLogsBtn').style.display === '' && /导入记录/.test($('devLogsBtn').textContent), '1 设置里有「导入记录（开发中）」');
  ok(!$('devUndoBtn') && !/撤销导入（开发中）/.test(d.body.innerHTML), '1 1016-K 的临时「撤销导入」按钮去掉了');
  {
    const t0 = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(RECS), { app_dev_import: '' }) });
    ok(t0.$('devLogsBtn').style.display === 'none' && t0.$('devImportBtn').style.display === 'none', '1 开发开关关着时看不到导入和导入记录');
    t0.$('devLogsBtn').click(); await t0.idle(); await new Promise(r => setTimeout(r, 30));
    ok(!t0.$('impPage') || t0.$('impPage').style.display !== 'block', '1 （防御）开关关着时页面没被打开');
  }

  // 空的导入记录
  $('devLogsBtn').click();
  await t.until(() => $('impLogs'));
  ok(/还没有导入记录/.test($('impLogs').textContent) && $('impTitle').textContent === '导入记录', '1 还没导过：写明没有导入记录');
  await t.back();
  ok($('impPage').style.display === 'none' && !t.exited, '1 返回键关掉导入记录，不退出 App');

  // ===== 2. 结果页「撤销这次导入」=====
  const D0 = await t.dump();
  const F1 = [wx({ time: T(10, 1, 7, 40), cp: '某虚构早点', fen: 1500 }), wx({ time: T(10, 2, 9), cp: '某虚构早点', fen: 1600 }),
              wx({ time: T(10, 5), cp: '某虚构面馆', fen: 2200 }), wx({ time: T(10, 6), cp: '某虚构书店', fen: 4500 })];
  const r1 = await t.importFiles([['微信1.csv', bill(F1)]], null, { stay: true });
  ok(r1.result && $('impResult') && $('impUndoThis'), '2 结果页有「撤销这次导入」');
  const nAfter = t.recs().length;
  $('impUndoThis').click();
  await t.until(() => t.ask());
  const q = t.ask();
  ok(q && /删掉 2 条导入的记录，还原 2 条合并过的手记/.test(q.msg) && /撤销前会自动备份/.test(q.msg) && $('askOk').textContent === '撤销这次导入' && $('askOk').classList.contains('warn'), '2 确认框是方案摘要：' + (q && q.msg));
  await t.askCancel();
  ok(t.recs().length === nAfter && $('impResult'), '2 点取消：什么都没改，还在结果页');
  $('impUndoThis').click();
  await t.until(() => t.ask());
  await t.askOk();
  await t.until(() => $('impUndoNotice') && $('impLogs'));
  ok($('impUndoNotice').textContent === '已撤销，删了 2 条、还原了 2 条' && $('impTitle').textContent === '导入记录' && $('impLogs'), '2 撤完停在导入记录，顶上提示：' + ($('impUndoNotice') && $('impUndoNotice').textContent));
  ok(same(await t.dump(), D0), '2 撤完和导入前逐字节一样');
  ok(t.st().backups().some(b => b.kind === 'undo'), '2 撤销前备份了一份');
  await t.back();
  ok($('impPage').style.display === 'none', '2 返回键关掉');

  // ===== 3. 设置 → 导入记录：新的在上，每次右侧「撤销」；中间那次要先撤之后的 =====
  const pet1 = [1, 2, 3].map(i => wx({ time: T(11, i, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  const pet2 = pet1.concat([4, 5].map(i => wx({ time: T(11, i, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 })));
  const D1 = await t.dump();
  await t.importFiles([['微信A.csv', bill(pet1.concat([wx({ time: T(11, 3), cp: '某虚构花店', fen: 3000 })]))]]);
  await t.importFiles([['微信B.csv', bill(pet2)]]);
  const logs = await t.logs();
  ok(logs.length === 2, '3 导了两次');
  $('devLogsBtn').click();
  await t.until(() => $('impLogs') && d.querySelectorAll('.imp-log').length === 2);
  const rows = [...d.querySelectorAll('.imp-log')];
  ok(rows[0].dataset.batch === logs[1].b && rows[1].dataset.batch === logs[0].b, '3 新的在上');
  ok(/微信/.test(rows[0].textContent) && /新建 0 条/.test(rows[0].textContent) && /改了 1 条以前的记录/.test(rows[0].textContent) && /新建 2 条/.test(rows[1].textContent),
    '3 每行写来源、账单时间、新建几条、改了几条：' + rows.map(r => r.textContent).join(' | '));
  // 撤第一次（更早那次）：要先撤第二次
  rows[1].querySelector('.imp-log-undo').click();
  await t.until(() => t.ask());
  ok(/要先撤销之后的 1 次导入/.test(t.ask().msg), '3 撤更早那次：确认框写明要先撤之后的 1 次');
  await t.askOk();
  await t.until(() => $('impUndoNotice') && $('impLogs'));
  ok(/^已撤销 2 次导入，删了 2 条、还原了 \d+ 条$/.test($('impUndoNotice').textContent), '3 连着撤两次，提示写明：' + $('impUndoNotice').textContent);
  ok(same(await t.dump(), D1) && /还没有导入记录/.test($('impLogs').textContent), '3 两次都撤了，和导入前逐字节一样，列表空了');
  await t.back();

  // ===== 4. 账本在确认框开着时变了：拒绝，账本不动 =====
  await t.importFiles([['微信C.csv', bill([wx({ time: T(12, 1), cp: '某虚构文具', fen: 800 })])]]);
  $('devLogsBtn').click();
  await t.until(() => d.querySelectorAll('.imp-log').length === 1);
  d.querySelector('.imp-log-undo').click();
  await t.until(() => t.ask());
  { const s = (w.JiwenStore || w).loadStore(A.ID); s.archives['默认存档'].records = s.archives['默认存档'].records.concat([man('m9', 12, 3, 9)]); (w.JiwenStore || w).saveStore(s, A.ID); await t.idle(); }
  const before = await t.dump();
  await t.askOk();
  await t.until(() => t.ask() && /账本在这期间变了/.test(t.ask().msg));
  ok(t.ask() && /没有撤销/.test(t.ask().msg), '4 账本变了：拒绝撤销');
  await t.askOk();
  ok(same(await t.dump(), before) && $('impPage').style.display === 'block' && d.querySelectorAll('.imp-log').length === 1, '4 账本不动，还停在导入记录');
  // 再点一次就能撤
  d.querySelector('.imp-log-undo').click();
  await t.until(() => t.ask());
  await t.askOk();
  await t.until(() => $('impUndoNotice') && $('impLogs'));
  ok(/删了 1 条/.test($('impUndoNotice').textContent) && t.recs().some(r => r.id === 'm9'), '4 再点一次撤掉了，后来记的那笔还在');
  await t.back();

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
