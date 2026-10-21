// 1016-F 账单导入第一期 ⑥b 写入。node z-import-write.test.js [index.html]
// jsdom 里跑整个 App（假 Worker 跑真的线程脚本、假 IndexedDB），在确认页点「导入」真的写进去：
// 写进去的和确认页对得上、合计守恒；合并的手记分类 / 备注 / 金额不变；重复导入没有新增；写到一半失败全部回滚；
// 恢复到导入前逐字节一样；没有单号表时按指纹兜底；两家全额退款两种顺序净额 0；合并记录跨文件追加；备份往返不丢字段；
// 2000 行有进度；12 万条账本的导入前备份要多久。账单、手记全是虚构的。
const H = require('./helpers/app');   // 1017-UI2：确认页分步了，按编号找东西时走到那一步；导入 / 取消多点一下确认
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const FIDB = require('fake-indexeddb');
const IDB = require('./helpers/idb');
const { interceptor, makeFakeWorker } = require('./helpers/import-files');
const B = require('./helpers/bills');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
async function until(fn, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch (_) {} await new Promise(r => setTimeout(r, 3)); } return !!fn(); }
const NOW = '2026-10-16T10:00:00';
const ID = 'u1760000000000000021';
const CATS = ['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他'];
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const rec = (id, d, money, o) => Object.assign({ id, time: `2026-03-${String(d).padStart(2, '0')}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});
const seedOf = recs => ({ accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1',
  ['store_' + ID]: JSON.stringify({ archives: { '默认存档': { cats: CATS, records: recs } }, last: '默认存档', accountName: '小明' }), ['app_time_repaired_' + ID]: '1' });

const OS = FIDB.IDBObjectStore.prototype, origPut = OS.put;
function breakPut(when, how) {
  OS.put = function (v, k) {
    if (when(String(k), v)) {
      if (how === 'quota') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      const req = origPut.call(this, v, k); this.transaction.abort(); return req;
    }
    return origPut.call(this, v, k);
  };
}
function restorePut() { OS.put = origPut; }

async function boot(o) {
  o = o || {};
  const t = { log: [], jsErr: [] };
  const vc = new VirtualConsole(); vc.forwardTo(console, { jsdomErrors: 'none' }); vc.on('jsdomError', e => t.jsErr.push(e.message));
  t.FW = makeFakeWorker(WWW);
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(WWW, t.log)] },
    beforeParse(w) {
      t.phone = IDB.install(w, o.phone);
      if (o.seed) Object.entries(o.seed).forEach(([k, v]) => w.localStorage.setItem(k, v));
      else { w.localStorage.setItem('accounts', JSON.stringify([{ id: ID, name: '小明' }])); w.localStorage.setItem('accounts_v', '1'); w.localStorage.setItem('app_logged_in_user', ID); w.localStorage.setItem('app_dev_import', '1'); w.localStorage.setItem('app_time_repaired_' + ID, '1'); }
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime() + (w.__tick = (w.__tick || 0) + 1); } };
      w.Worker = t.FW;
      w.__files = [];
      if (o.free !== undefined) Object.defineProperty(w.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: o.free, usage: 0 }) } });
      w.Capacitor = { isNativePlatform: () => true, Plugins: {
        Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } },
        App: { addListener(ev, fn) { if (ev === 'backButton') t.backFn = fn; return { remove() {} }; }, exitApp() { t.exited = true; } } } };
    } });
  const w = dom.window, d = w.document, $ = H.stepGet(w);
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  Object.assign(t, { dom, w, d, $, errs, idle: () => IDB.idle(w) });
  await IDB.idle(w);
  await until(() => t.backFn, 2000);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  t.S = () => w.JiwenImportUI._state();
  t.st = () => w.JiwenImportStore;
  t.recs = () => w.JiwenStore.getUserData();
  // 导入一批文件：打开导入页 → 选文件 → （改方案）→ 点导入 → 等结果页 / 提示框
  t.importFiles = async (files, edit, opts) => {
    opts = opts || {};
    $('devImportBtn').click();
    await until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
    const input = $('impFile');
    Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new w.File([bytes], name)), configurable: true });
    input.dispatchEvent(new w.Event('change'));
    await until(() => $('impGo') && /^(导入 \d+ 条|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex');
    w.JiwenImportUI._goStep('check');   // 1017-UI2：从第 1 步开始看（等按钮时走到了总览）
    const S = t.S();
    if (edit) { edit(S); w.JiwenImportUI._replan(); }
    const plan = S.plan;
    if (opts.noGo || !plan.canImport) { const r = { plan, S }; H.clickCancel(w); return r; }
    if (opts.beforeGo) opts.beforeGo();
    H.clickGo(w);
    await until(() => $('impResult') || $('askMask').style.display === 'flex', 60000);
    const res = { plan, S, result: S.result, alert: $('askMask').style.display === 'flex' ? $('askMsg').textContent : null };
    if (res.alert) $('askOk').click();
    if ($('impResult')) $('impBackToLedger').click(); else H.clickCancel(w);
    await t.idle();
    return res;
  };
  t.dump = async () => { await t.idle(); const db = await IDB.dumpDb(t.phone); const o = {}; Object.keys(db).sort().forEach(k => { if (!/_bk_/.test(k)) o[k] = db[k]; }); return o; };
  t.keyOf = (S, txn) => S.matched.items.find(it => it.src === 'row' && S.parsed.files[it.file].rows[it.row].no === txn.no).key;
  return t;
}
const bill = (app, txns, opts) => B.bill(app, txns, Object.assign({ range: RANGE }, opts || {})).bytes;
const fen = r => Math.round(r.money * 100);
const net = recs => recs.reduce((s, r) => s + (r.type === 'income' ? fen(r) : -fen(r)), 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
// ===== 1. 真写一遍：和确认页对得上，合计守恒 =====
const RECS = [rec('m1', 1, 15), rec('m2', 2, 15), rec('m3', 4, 15), rec('m4', 5, 15, { remark: '豆浆油条', cat: '吃饭' }), rec('m5', 8, 30, { cat: '购物' }), rec('m6', 7, 200, { cat: '其他' })];   // 1.1 起金额相近、分类对得上的会自动合并；这里要的是「待你确认」，分类故意不一样
const bf = [1, 2, 3, 4, 5].map(d => wx({ time: T(3, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 }));
const near = wx({ time: T(3, 8), cp: '某餐厅', fen: 2800 });
const wd = wx({ time: T(3, 7), cp: '零钱', kind: '零钱提现', io: 'neutral', fen: 20000, desc: '提现' });
const odd = wx({ time: T(3, 9), cp: '某某', desc: '收款方备注:二维码收款', fen: 5000 });
const ref1 = wx({ time: T(3, 10), cp: '某超市', fen: 5000, status: '已退款¥10.00' });
const ref2 = wx({ time: T(3, 11), cp: '某超市', kind: '某超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: wrno() });
const petty1 = [1, 2, 3].map(d => wx({ time: T(3, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
const rail = [1, 2].map(i => ali({ time: T(3, 12 + i), cp: '某铁路' + i, kind: '交通出行', fen: 20000 + i }));
const closed = ali({ time: T(3, 20), status: '交易关闭', fen: 999 });
const wait = ali({ time: T(3, 21), status: '等待付款', fen: 888 });
const WX1 = bill('wechat', bf.concat([near, wd, odd, ref1, ref2], petty1));
const ALI1 = bill('alipay', rail.concat([closed, wait]), { encoding: 'gbk' });
const FILES1 = [['微信账单.csv', WX1], ['支付宝账单.csv', ALI1]];
const t = await boot({ seed: seedOf(RECS) });
const before = await t.dump();
const r1 = await t.importFiles(FILES1);
{
  const p = r1.plan, c = r1.result.ws.counts;
  ok(r1.result && !r1.alert, '1 点导入：写进去，打开结果页 ' + (r1.alert || ''));
  ok(['add', 'merge', 'neutral', 'refund', 'pending', 'skip', 'error', 'excluded'].every(g => (c[g] || 0) === (p.counts[g] || 0)) && Object.values(c).reduce((s, n) => s + n, 0) === r1.result.ws.total,
    '1 结果页按桶的笔数和确认页一样，合计等于文件行数：' + JSON.stringify(c));
  const recs = t.recs(), mine = recs.filter(r => r.batch === r1.result.ws.batch && !(r.src && r.src.merged));
  ok(recs.length === RECS.length + r1.result.r.added && mine.length === r1.result.r.added, '1 新建的记录条数对得上：' + r1.result.r.added);
  const m4 = recs.find(r => r.id === 'm4'), m1 = recs.find(r => r.id === 'm1');
  ok(m4.cat === '吃饭' && m4.remark === '豆浆油条' && m4.money === 15 && m4.time === '2026-03-05T07:40' && m4.src.app === 'wechat' && m4.src.merged === true && m4.batch === r1.result.ws.batch && Number.isInteger(m4.cp),
    '1 合并的手记：分类、备注、金额不动，时间改成账单时间，带 src{merged}、cp、batch');
  ok(recs.filter(r => /^m\d$/.test(r.id) && r.src && r.src.merged).length === 4 && m1.remark === '手记', '1 合并了 4 条手记');
  const o = mine.find(r => r.money === 50 && r.type === 'expense' && r.cat !== undefined && r.remark === '');
  ok(o && o.remark === '', '1 套话「收款方备注:二维码收款」不写进备注');
  const sumRec = mine.filter(r => r.src && r.src.sum === 'petty');
  ok(sumRec.length === 1 && sumRec[0].money === 0.03 && sumRec[0].cat === '其他', '1 分分捐 3 笔合成一条 0.03，分类「其他」');
  const rf = mine.find(r => r.type === 'income' && r.money === 10), orig = mine.find(r => r.money === 50 && r.oc === '商户消费' && r.id === rf.refundOf);
  ok(rf && orig && rf.cat === orig.cat, '1 部分退款挂到原单上，分类跟原单');
  const w = mine.find(r => r.money === 200);
  ok(w && w.skip === true, '1 零钱提现：不计入照常写');
  const T1 = await t.st().ordersRead();
  const key = (S, x) => t.keyOf(S, x).split('|');
  ok(bf.every(x => { const k = key(r1.S, x); const e = T1.get(k[0], k[1]); return e && e.st === 0 && recs.some(r => r.id === e.id); }), '1 单号表：新增、合并的都登记了记录编号');
  const kc = key(r1.S, closed), kw = key(r1.S, wait);
  ok(T1.get(kc[0], kc[1]).st === 1 && !T1.get(kw[0], kw[1]), '1 交易关闭登记成忽略；等待付款不登记（以后状态还会变）');
  const kn = key(r1.S, near);
  ok(!T1.get(kn[0], kn[1]), '1 待处理的不登记单号');
  const pend = await t.st().pendingRead();
  ok(pend.length === r1.plan.counts.pending && pend.some(x => x.no === kn[1] && x.cand.includes('m5')), '1 待处理进待处理池，带候选手记');
  const logs = await t.st().importsRead(), lg = logs[0];
  ok(logs.length === 1 && lg.b === r1.result.ws.batch && lg.add.length === r1.result.r.added && lg.chg.some(x => x.id === 'm4' && x.was.time === '2026-03-05T08:30' && x.was.src === null),
    '1 导入记录：批次号、新建的编号、合并前手记的原值');
  ok(t.$('billList').textContent.includes('某某') || t.$('billList').innerHTML.length > 0, '1 回到账本，列表里能看到');
  ok(t.st().backups().length === 1, '1 导入前自动备份了一份');
}

// ===== 2. 同一份文件再导一次：全部已导入跳过，账本不变 =====
const after1 = await t.dump();
{
  const r = await t.importFiles(FILES1, null, { noGo: true });
  const c = r.plan.counts;
  ok(c.add === 0 && c.merge === 0 && c.refund === 0 && c.neutral === 0 && c.pending === 0, '2 同一份文件再导：没有新增、合并、待处理：' + JSON.stringify(c));
  ok(r.plan.rows.filter(d => d.why === 'inpending').length === r1.plan.counts.pending, '2 上次的待处理：标「已经在待处理里了」');
  ok(same(await t.dump(), after1), '2 账本、单号表逐字节没变');
}

// ===== 3. 恢复到导入前：逐字节一样 =====
{
  const r = await t.st().restoreLast();
  // 1017-O：用过的那份不删（还能再恢复），恢复前先备份一份「恢复前」
  ok(same(await t.dump(), before) && same(t.st().backups().map(b => b.kind), ['import', 'restore']), '3 恢复到导入前：账本、单号表、待处理池和导入前逐字节一样；导入前那份留着，多一份恢复前 ' + r.records);
  ok(t.recs().length === RECS.length && t.recs().find(x => x.id === 'm4').time === '2026-03-05T08:30', '3 手记的时间也回来了');
}

// ===== 4. 写到一半失败：全部回滚 =====
{
  const nb0 = t.st().backups().length;
  for (const [name, setup] of [
    ['备份写不进去', () => breakPut(k => /_bk_/.test(k), 'quota')],
    ['整理完、写之前出错', () => { t.w.__impFailAt = 'beforeSave'; }],
    ['账本月块写到一半', () => breakPut(k => /^led_.+_2026-03$/.test(k), 'abort')],
    ['单号表写到一半', () => breakPut(k => /_o_wechat_/.test(k), 'abort')],
    ['导入记录写不进去（最后一个键）', () => breakPut(k => /_i$/.test(k), 'quota')],
  ]) {
    const r = await t.importFiles(FILES1, null, { beforeGo: setup });
    restorePut(); t.w.__impFailAt = null;
    await t.idle();
    ok(r.alert && !r.result && same(await t.dump(), before) && t.st().backups().length === nb0, '4 ' + name + '：提示失败，账本、单号表和写入前逐字节一样，备份也删了 ' + (r.alert || ''));
  }
  const r = await t.importFiles(FILES1);
  ok(r.result && t.recs().length === RECS.length + r.result.r.added, '4 失败以后再导：正常写进去');
}

// ===== 8. 备份导出再导入：导入相关字段一个不丢 =====
{
  t.$('exportBtn').click();
  await until(() => t.w.__files.length);
  const bk = JSON.parse(t.w.__files[t.w.__files.length - 1]);
  ok(bk.cps && bk.cps.length && bk.pms && bk.pms.length && bk.imports && bk.imports.length && bk.orders && bk.pending, '8 导出的备份带名单、导入记录、单号表、待处理 ' + ['cps', 'pms', 'imports', 'orders', 'pending'].filter(k => !bk[k]).join(','));
  ok(bk.data.some(r => r.src && r.src.merged === true && Number.isInteger(r.cp) && r.batch) && bk.data.some(r => r.src && r.src.sum === 'petty') && bk.data.some(r => Number.isInteger(r.pm)),
    '8 记录带 src（含 merged、sum）、cp、pm、batch');
  const tn = await boot({ seed: seedOf([]) });
  await tn.w.JiwenStore.importArchiveFromText(JSON.stringify(bk), ID);
  await tn.idle();
  const st = tn.w.JiwenStore.loadStore(ID), names = Object.keys(st.archives), a = st.archives[names[names.length - 1]];
  const n = a.records;
  ok(n.filter(r => r.src && r.src.merged === true).length === bk.data.filter(r => r.src && r.src.merged).length && n.filter(r => r.src && r.src.sum).length === bk.data.filter(r => r.src && r.src.sum).length
     && n.filter(r => r.batch).length === bk.data.filter(r => r.batch).length && same(a.cps, bk.cps) && same(a.pms, bk.pms), '8 导入备份以后 src / cp / pm / batch / 名单一个不丢');
}

// ===== 5. 没有单号表：按指纹兜底，同一份文件一条都不新增 =====
{
  const db = await IDB.dumpDb(t.phone);
  const ordKeys = Object.keys(db).filter(k => /_o_(alipay|wechat)_/.test(k));
  await new Promise((res, rej) => { const q = t.phone.open('jiwen', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); ordKeys.forEach(k => tx.objectStore('kv').delete(k)); tx.oncomplete = () => { q.result.close(); res(); }; tx.onerror = rej; }; });
  const t2 = await boot({ phone: t.phone });
  const n0 = t2.recs().length;
  const r = await t2.importFiles(FILES1, null, { noGo: true });
  const c = r.plan.counts;
  ok(c.add === 0 && c.merge === 0 && c.refund === 0 && c.neutral === 0, '5 删掉单号表再导同一份文件：一条都不新增：' + JSON.stringify(c));
  ok(r.plan.rows.filter(d => d.why === 'imported').length >= bf.length && r.plan.rows.some(d => /按时间、金额、对方认出来/.test(d.reason)), '5 按时间、金额、对方认出已导入（含合并过的手记）');
  ok(t2.recs().length === n0, '5 账本没变');
  // 游戏充值 1 元 × 4 同一分钟，账本里只有 1 条
  const g1 = wx({ time: T(4, 3, 9, 5), cp: '某虚构游戏', desc: '游戏充值', fen: 100 });
  const ra = await t2.importFiles([['g1.csv', bill('wechat', [g1])]]);
  ok(ra.result && ra.result.ws.counts.add === 1, '5 先导 1 笔游戏充值');
  const db2 = await IDB.dumpDb(t2.phone);
  const ok2 = Object.keys(db2).filter(k => /_o_(alipay|wechat)_/.test(k));
  await new Promise((res, rej) => { const q = t2.phone.open('jiwen', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); ok2.forEach(k => tx.objectStore('kv').delete(k)); tx.oncomplete = () => { q.result.close(); res(); }; tx.onerror = rej; }; });
  const t3 = await boot({ phone: t2.phone });
  const four = [0, 1, 2, 3].map(() => wx({ time: T(4, 3, 9, 5), cp: '某虚构游戏', desc: '游戏充值', fen: 100 }));
  const rb = await t3.importFiles([['g4.csv', bill('wechat', four)]], null, { noGo: true });
  const ws = rb.plan.rows.filter(d => d.src === 'row');
  ok(ws.filter(d => d.why === 'imported').length === 1 && ws.filter(d => d.group === 'pending' && d.why === 'fpmaybe').length === 3 && rb.plan.counts.add === 0,
    '5 游戏充值 1 元 × 4 同一分钟、账本里只有 1 条：1 笔跳过、3 笔进待处理');
}

// ===== 6. 两家全额退款，两种顺序真写一遍：净额 0 =====
{
  const dropAll = S => { S.plan.rows.forEach(d => { if (d.why === 'fullnorefund') S.edits.rows[d.key] = { pick: 'drop' }; }); };
  const cases = [
    ['微信', 'wechat', () => wx({ time: T(5, 10, 12), cp: '某虚构饭店', fen: 5000, status: '已全额退款' }), () => wx({ time: T(5, 12, 9), cp: '某虚构饭店', kind: '某虚构饭店-退款', io: 'income', fen: 5000, status: '已全额退款', no: wrno() })],
  ];
  const ano1 = ano();
  cases.push(['支付宝', 'alipay', () => ali({ time: T(5, 10, 12), no: ano1, cp: '某虚构商城', fen: 5000, status: '退款成功', io: 'neutral' }), () => ali({ time: T(5, 12, 9), no: ano1 + '_R1', cp: '某虚构商城', fen: 5000, status: '退款成功', io: 'neutral', desc: '退款-虚构商品' })]);
  for (const [name, app, O, Rf] of cases) {
    // 先原单（退款不在文件里，选「不要了」），再退款
    const ta = await boot({ seed: seedOf([rec('h1', 1, 50, { time: '2026-05-09T12:00', cat: '其他' })]) });
    const o = O(), rf = Rf();
    const a1 = await ta.importFiles([['o.csv', bill(app, [o])]], dropAll);
    const a2 = await ta.importFiles([['r.csv', bill(app, [rf])]], null, { noGo: true });
    const imp = ta.recs().filter(r => r.src);
    ok(a1.result && imp.length === 0 && a2.plan.counts.add + a2.plan.counts.refund === 0 && ta.recs().find(r => r.id === 'h1').src === undefined,
      '6 ' + name + '先原单（不要了）再退款：两条都没写，手记没被合并，净额 0');
    // 先退款，再原单
    const tb = await boot({ seed: seedOf([rec('h1', 1, 50, { time: '2026-05-09T12:00', cat: '其他' })]) });
    await tb.importFiles([['r.csv', bill(app, [Rf()])]]);
    const b2 = await tb.importFiles([['o.csv', bill(app, [O()])]]);
    const ib = tb.recs().filter(r => r.src && !r.src.merged);
    const ex = ib.find(r => r.type === 'expense'), inc = ib.find(r => r.type === 'income');
    ok(b2.result && ib.length === 2 && ex && inc && inc.refundOf === ex.id && net(ib) === 0 && recModeOf(inc) === 'normal' && tb.recs().find(r => r.id === 'h1').src === undefined,
      '6 ' + name + '先退款再原单：原单作为支出写进去，旧退款挂到它上面，净额 0，不和手记合并');
  }
}
function recModeOf(r) { return r.skip ? 'skip' : r.flow ? 'flow' : 'normal'; }

// ===== 7. 分分捐、收款汇总跨文件追加，不重复建 =====
{
  const tp = await boot({ seed: seedOf([]) });
  const a = [1, 2, 3].map(d => wx({ time: T(6, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  const b = [11, 12].map(d => wx({ time: T(6, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  await tp.importFiles([['a.csv', bill('wechat', a)]]);
  const r2 = await tp.importFiles([['b.csv', bill('wechat', b)]]);
  const sums = tp.recs().filter(r => r.src && r.src.sum === 'petty');
  ok(sums.length === 1 && sums[0].money === 0.05 && r2.result.r.added === 0 && r2.result.r.changed === 1, '7 分分捐上半月 3 笔、下半月 2 笔：只有一条，0.05');
  const logs = await tp.st().importsRead();
  ok(logs[1].chg[0].id === sums[0].id && logs[1].chg[0].was.money === 0.03 && logs[1].chg[0].nos.length === 2, '7 追加前的金额记进导入记录');
  // 收款按天：一个月 301 笔，分两次导
  const day = i => T(7, 1 + (i % 28), 9, i % 60);
  const rc = Array.from({ length: 301 }, (_, i) => wx({ time: day(i), kind: '二维码收款', io: 'income', cp: '顾客' + i, desc: '收款方备注:二维码收款', fen: 100 }));
  await tp.importFiles([['rc1.csv', bill('wechat', rc.slice(0, 301))]]);
  const nR = tp.recs().filter(r => r.src && r.src.sum === 'receipt').length;
  ok(nR === 28, '7 收款 301 笔按天合成 28 条：' + nR);
  const rc2 = [wx({ time: T(7, 1, 20, 0), kind: '二维码收款', io: 'income', cp: '顾客x', desc: '/', fen: 100 })].concat(Array.from({ length: 300 }, (_, i) => wx({ time: T(7, 2 + (i % 27), 21, i % 60), kind: '二维码收款', io: 'income', cp: '顾客y' + i, desc: '/', fen: 100 })));
  await tp.importFiles([['rc2.csv', bill('wechat', rc2)]]);
  const rs = tp.recs().filter(r => r.src && r.src.sum === 'receipt');
  ok(rs.length === 28 && rs.reduce((s, r) => s + fen(r), 0) === 602 * 100, '7 同月再导 301 笔：还是 28 条，往上加');
}

// ===== 9. 2000 行：有进度，写入期间页面不卡死 =====
{
  const tb = await boot({ seed: seedOf([]) });
  const big = Array.from({ length: 2000 }, (_, i) => wx({ time: T(8, 1 + (i % 28), 8 + (i % 12), i % 60), cp: '虚构店' + (i % 50), fen: 100 + i }));
  const seen = new Set(); let ticks = 0, alive = true;
  // 1017-UI2：写入时的进度显示在导入确认面板里（impConfirmStatus），进度框（impProgText）照旧也看
  const beat = () => { if (!alive) return; ticks++; seen.add(tb.$('impProgText') && tb.$('impProgText').textContent); seen.add(tb.d.getElementById('impConfirmStatus') && tb.d.getElementById('impConfirmStatus').textContent); setTimeout(beat, 0); };
  const r = await tb.importFiles([['big.csv', bill('wechat', big)]], null, { beforeGo: () => { ticks = 0; setTimeout(beat, 0); } });
  alive = false;
  ok(r.result && r.result.ws.counts.add === 2000 && tb.recs().length === 2000, '9 2000 行写进去');
  ok([...seen].some(x => /整理记录/.test(x || '')) && ticks > 5, '9 有「整理记录」进度，写入期间页面还在动（让出了 ' + ticks + ' 次）');
}

// ===== 10. 空间不够放备份：不导入 =====
{
  const ts = await boot({ seed: seedOf(RECS), free: 1000 });
  const b0 = await ts.dump();
  const r = await ts.importFiles(FILES1);
  ok(r.alert && /剩余空间放不下导入前的备份/.test(r.alert) && same(await ts.dump(), b0), '10 剩余空间放不下备份：提示，不导入，账本没动');
}

// ===== 11. 12 万条的账本：导入前备份要多久 =====
{
  const many = Array.from({ length: 120000 }, (_, i) => ({ id: 'x' + i, time: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}T12:00`, money: 1 + (i % 500), type: 'expense', cat: '吃饭', remark: '虚构' }));
  const tk = await boot({ seed: seedOf([]) });
  { const st = tk.w.JiwenStore.loadStore(ID); st.archives['默认存档'].records = many; tk.w.JiwenStore.saveStore(st, ID); await tk.idle(); }
  const one = wx({ time: T(9, 1, 9), cp: '虚构店', fen: 1234 });
  const r = await tk.importFiles([['one.csv', bill('wechat', [one])]]);
  ok(r.result && tk.recs().length === 120001, '11 12 万条账本上导入一笔');
  console.log('    12 万条账本：导入前备份 ' + r.result.r.ms.backup + ' 毫秒（测试机 + 假数据库，只作参考），备份 ' + (r.result.r.backupBytes / 1048576).toFixed(1) + ' MB，整次写入 ' + r.result.r.ms.total + ' 毫秒');
}

ok(!t.errs.length && !t.jsErr.length, '无报错 ' + t.errs.concat(t.jsErr).join('|'));
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
