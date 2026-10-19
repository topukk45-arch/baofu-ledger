// 1019-V 导入草稿最多留 24 小时（jsdom，账单和记录全是虚构的）。node zZzR-draft-expire.test.js [index.html]
// 账单文件只在导入没做完时临时存在这台手机上：导入成功、退出确认里点「退出，不导入了」就删；
// 超过 24 小时的打开导入页不问、直接删；没再打开导入页，打开 App 进了账号过一会儿也删。「强杀 App」= 同一个库重新起一个页面。
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
const F = [['微信账单.csv', B.bill('wechat', [wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600 }), wx({ time: T(7, 9), cp: '某虚构超市', fen: 3300 })], { range: RANGE }).bytes]];
const MAN = [{ id: 'm1', time: '2026-10-06T12:30', money: 50, type: 'expense', cat: '吃饭', remark: '虚构聚餐' }];
const CATS = ['未分类', '吃饭', '购物', '其他'];
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY0 = '2026-10-20T10:00:00';
const p2 = n => String(n).padStart(2, '0');
const later = h => { const d = new Date(new Date(DAY0).getTime() + h * 3600000); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`; };   // 当地时间，和 App 里的假时间同一种写法

const bootOn = (phone, seed, now) => A.boot({ html, www: WWW, seed, phone, now: now || DAY0 });
async function toConfirm(t) {
  const { $, w } = t;
  $('devImportBtn').click();
  await t.until(() => $('impFile'));
  if (w.JiwenSheet.isOpen()) { $('impResumeFresh').click(); await t.idle(); }
  Object.defineProperty($('impFile'), 'files', { value: F.map(([n, b]) => new w.File([b], n)), configurable: true });
  $('impFile').dispatchEvent(new w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan, 30000);
}
async function flush(t) { await wait(480); await t.idle(); await wait(30); await t.idle(); }
const draftKeys = async t => Object.keys(await t.dump()).filter(k => /^imp_.+_d$/.test(k));
async function asked(t) {
  t.$('devImportBtn').click();
  await t.until(() => t.$('impFile'));
  await wait(60); await t.idle(); await wait(30);
  const a = t.w.JiwenSheet.isOpen() && t.$('uiSheetTitle').textContent === '上次导入没做完，接着来吗？';
  if (t.w.JiwenSheet.isOpen()) t.w.JiwenSheet.close ? t.w.JiwenSheet.close() : t.$('uiSheetMask').click();
  return a;
}

(async () => {
  const seed = A.seedOf(MAN, CATS), seedNoStore = Object.assign({}, seed); delete seedNoStore['store_' + A.ID];

  // 1. 导入成功：草稿删掉
  let t = await bootOn(null, seed);
  await toConfirm(t); await flush(t);
  ok((await draftKeys(t)).length === 1, '1 进了确认页：存了草稿');
  t.$('impGo').click(); t.$('impConfirmOk').click();
  await t.until(() => t.$('impResult'), 30000); await flush(t);
  ok((await draftKeys(t)).length === 0, '1 导入成功：草稿删掉');
  t.$('impBackToLedger').click(); await t.idle();

  // 2. 退出确认里点「退出，不导入了」：草稿删掉
  let lg = (await t.st().importsRead()).pop(); await t.st().undo(await t.st().undoPlan(lg.b)); await t.idle();
  await toConfirm(t); await flush(t);
  ok((await draftKeys(t)).length === 1, '2 又进确认页：存了草稿');
  t.$('impCancel').click(); await t.idle();
  ok(t.w.JiwenSheet.isOpen() && t.$('impExitOk'), '2 点取消：先问「退出这次导入？」');
  t.$('impExitOk').click(); await flush(t);
  ok((await draftKeys(t)).length === 0, '2 点「退出，不导入了」：草稿删掉');

  // 3. 没做完就被杀：23 小时后打开导入照样问；25 小时后不问、草稿删掉
  await toConfirm(t); await flush(t);
  ok((await draftKeys(t)).length === 1, '3 确认页没做完：草稿还在');
  const phone = t.phone; t.w.close();
  t = await bootOn(phone, seedNoStore, later(23));
  ok(await asked(t), '3 过了 23 小时打开导入：照样问「接着来吗」');
  await wait(3300); await t.idle();
  ok((await draftKeys(t)).length === 1, '3 打开 App 过一会儿：23 小时的草稿不删');
  t.w.close();
  t = await bootOn(phone, seedNoStore, later(25));
  ok(!(await asked(t)), '3 过了 25 小时打开导入：不问');
  await t.idle();
  ok((await draftKeys(t)).length === 0, '3 草稿删掉了');
  t.w.close();

  // 4. 没再打开导入页：打开 App 进了账号过一会儿，超过 24 小时的草稿也删
  t = await bootOn(phone, seedNoStore, later(25));
  await toConfirm(t); await flush(t);
  ok((await draftKeys(t)).length === 1, '4 又存了一份草稿');
  t.w.close();
  t = await bootOn(phone, seedNoStore, later(50));
  await t.idle();
  ok((await draftKeys(t)).length === 1, '4 刚打开（首屏出来前后）：还没去读，不挡打开');
  await wait(3300); await t.idle();
  ok((await draftKeys(t)).length === 0, '4 过一会儿：超过 24 小时的草稿删掉（没打开导入页也删）');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
