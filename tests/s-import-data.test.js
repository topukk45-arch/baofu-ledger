// 1015-B 账单导入第一期 ② 数据结构。node s-import-data.test.js [index.html]
// 覆盖：记录新字段和存档里的名单 / 规则；单号表、待处理池、导入记录的存法和读写；写失败什么都不改；
//      备份往返（同账号、别的账号，记录 id 跟着换）、AI 导出不带来源和单号、云同步不带单号表；
//      分类改名 / 删除对规则的影响；删存档、移走账号、清孤立数据；存储估算；
//      12 万单号：进入账号不读、按开头查的耗时、导出备份再导回不超上限；
//      设 OLD_HTML 时装回旧版本（1013-H）再装回来不丢东西。
// 测试数据全部虚构。
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const IDB = require('./helpers/idb');
const FIDB = require('fake-indexeddb');

const file = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const NOW = '2026-10-15T10:00:00';
const ID_A = 'u1760000000000000011', ID_B = 'u1760000000000000022';
const ACCTS = JSON.stringify([{ id: ID_A, name: '小明' }, { id: ID_B, name: '小红' }]);
const ms = () => Number(process.hrtime.bigint() / 1000000n);

// ---- 虚构数据 ----
const CATS = ['未分类', '餐饮', '购物', '出行', '其他'];
const CPS = ['青禾便利', '云杉咖啡', '小满公交', '橘子超市'];
const PMS = ['余额', '某银行储蓄卡', '花呗'];
const RULES = { cat: [{ kw: '青禾', cat: '餐饮' }, { kw: '公交', cat: '出行' }, { kw: '橘子', cat: '购物' }],
  type: [{ app: 'wechat', type: '群收款', as: 'transfer' }, { app: 'alipay', status: '等待确认收货', as: 'skip' }] };
const B1 = 'imgw0001aaaa', B2 = 'imgw0002bbbb';
function sampleRecords() {
  return [
    { id: 'r1', time: '2026-09-01T08:10', money: 6.5, cat: '餐饮', remark: '', type: 'expense', src: { app: 'alipay' }, batch: B1, cp: 0, pm: 0, oc: '餐饮美食' },
    { id: 'r2', time: '2026-09-02T09:20', money: 18, cat: '餐饮', remark: '拿铁', type: 'expense', src: { app: 'wechat' }, batch: B1, cp: 1, pm: 2, oc: '商户消费' },
    { id: 'r3', time: '2026-09-03T18:00', money: 2, cat: '出行', remark: '', type: 'expense', src: { app: 'alipay' }, batch: B2, cp: 2, pm: 1, oc: '交通出行' },
    { id: 'r4', time: '2026-09-04T12:00', money: 25, cat: '餐饮', remark: '手记午饭', type: 'expense' },
    { id: 'r5', time: '2026-10-05T20:00', money: 99, cat: '购物', remark: '', type: 'expense', src: { app: 'alipay' }, batch: B2, cp: 3, oc: '日用百货' },
    { id: 'r6', time: '2026-10-06T20:00', money: 9, cat: '购物', remark: '', type: 'income', refundOf: 'r5', src: { app: 'alipay' }, batch: B2, cp: 3 },
  ];
}
function sampleStore(recs) {
  return JSON.stringify({ archives: { '默认存档': { cats: CATS.slice(), records: recs || sampleRecords(), cps: CPS, pms: PMS, importRules: RULES } }, last: '默认存档', accountName: '小明' });
}
const SEED = (store) => ({ accounts: ACCTS, accounts_v: '1', app_logged_in_user: ID_A, ['store_' + ID_A]: store || sampleStore(),
  ['store_' + ID_B]: JSON.stringify({ archives: { '默认存档': { cats: CATS.slice(), records: [] } }, last: '默认存档', accountName: '小红' }),
  ['app_time_repaired_' + ID_A]: '1', ['app_time_repaired_' + ID_B]: '1' });
// 单号（虚构，长度照两家的样子）
const noA = (d, k) => '2026' + d + '22001' + String(k).padStart(15, '0');
const noW = (d, k) => '42000' + '12345' + '2026' + d + String(k).padStart(14, '0');

// ---- 让 IndexedDB 出故障 / 数读了什么 ----
const OS = FIDB.IDBObjectStore.prototype, origPut = OS.put, origGet = OS.get, origGetAll = OS.getAll;
function breakPut(when) { OS.put = function (v, k) { if (when(String(k))) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return origPut.call(this, v, k); }; }
function restorePut() { OS.put = origPut; }
// 读库记账：读出来的值有多少字符、碰到了哪些 imp_ 的值
function watchReads() {
  const log = { chars: 0, imp: 0, impKeys: [] };
  const add = v => { if (typeof v === 'string') log.chars += v.length; };
  OS.get = function (k) { const r = origGet.call(this, k); r.addEventListener('success', () => { add(r.result); if (String(k).startsWith('imp_')) { log.imp++; log.impKeys.push(String(k)); } }); return r; };
  OS.getAll = function (q) { const r = origGetAll.apply(this, arguments); r.addEventListener('success', () => { (r.result || []).forEach(v => { add(v); if (typeof v === 'string' && /"n":"/.test(v.slice(0, 400)) && /"ids":/.test(v.slice(0, 40))) log.imp++; }); }); return r; };
  log.stop = () => { OS.get = origGet; OS.getAll = origGetAll; };
  return log;
}

async function boot(seed, opts) {
  opts = opts || {};
  const dom = new JSDOM(opts.html || html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', beforeParse(w) {
    IDB.install(w, opts.phone);
    if (opts.loose) w.__LEDGER_STRICT = false;
    Object.keys(seed || {}).forEach(k => w.localStorage.setItem(k, seed[k]));
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.__files = []; w.__cloud = [];
    w.Capacitor = { isNativePlatform: () => true, Plugins: {
      Filesystem: { writeFile: async o => { w.__files.push(o.data); return {}; } },
      OneDriveLink: { writeText: async o => { w.__cloud.push(o.text); return {}; }, pickFile: async () => ({}), forget: async () => {}, checkAccess: async () => ({ ok: true }) } } };
    w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime(); } };
  } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), ls = w.localStorage;
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  const t = { w, d, $, ls, errs, phone: w.indexedDB, S: () => w.JiwenImportStore,
    idle: () => IDB.idle(w),
    db: async () => { await IDB.idle(w); return IDB.dumpDb(w.indexedDB); },
    inMain: () => $('mainBox').style.display === 'block',
    open: () => $('askMask').style.display === 'flex',
    dump: () => { const o = {}; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); o[k] = ls.getItem(k); } return o; },
    chip: n => [...$('recentUsers').querySelectorAll('.user-chip')].find(c => c.querySelector('span').textContent === n),
    store: () => JSON.parse((w.JiwenStore || w).ledgerGet((w.JiwenStore || w).storeKey())),
  };
  t.pick = async (inputId, text) => {
    const input = $(inputId);
    const f = new w.File([text], '备份.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new w.Event('change'));
    for (let i = 0; i < 500 && !t.open(); i++) await new Promise(r => setTimeout(r, 10));
    await t.idle();
  };
  t.exportBackup = async () => {
    const n = w.__files.length; $('exportBtn').click();
    for (let i = 0; i < 500 && w.__files.length === n; i++) await new Promise(r => setTimeout(r, 5));
    if (t.open()) $('askOk').click();
    return w.__files[n];
  };
  await t.idle();
  return t;
}
const reboot = (t, opts) => boot(t.dump(), Object.assign({}, opts || {}, { phone: t.phone }));
const impKeys = db => Object.keys(db).filter(k => k.startsWith('imp_')).sort();
const metaOf = (db, id) => JSON.parse(db['led_' + id + '_m']);
const aidOf = (db, id, name) => metaOf(db, id).archives[name].records;
const decode = v => { const o = typeof v === 'string' ? JSON.parse(v) : v; if (!o.n) return []; const n = o.n.split(','), r = o.r.split(','), b = o.b.split(',');
  return n.map((no, i) => ({ no, id: r[i] === '-' ? '' : o.ids[+r[i]], batch: b[i] === '-' ? '' : o.bs[+b[i]], st: r[i] === '-' ? 1 : 0 })); };
const sampleOrders = () => [
  { app: 'alipay', no: noA('0901', 1), time: '2026-09-01T08:10', id: 'r1', batch: B1 },
  { app: 'wechat', no: noW('0902', 1), time: '2026-09-02T09:20', id: 'r2', batch: B1 },
  { app: 'alipay', no: noA('0903', 1), time: '2026-09-03T18:00', id: 'r3', batch: B2 },
  { app: 'alipay', no: noA('0903', 2), time: '2026-09-03T18:30', id: 'r3', batch: B2 },          // 两个单号指向同一条（合并）
  { app: 'alipay', no: noA('1005', 1), time: '2026-10-05T20:00', id: 'r5', batch: B2 },
  { app: 'alipay', no: noA('1006', 9), time: '2026-10-06T20:00', id: 'r6', batch: B2 },
  { app: 'wechat', no: noW('0910', 7), time: '2026-09-10T10:00', st: 1, batch: B2 },              // 点过「不要了」
  { app: 'wechat', no: 'FP-无时间-1', time: '', id: 'r2', batch: B1 },                           // 没时间的放 none
];
const samplePending = () => [
  { app: 'alipay', no: noA('0904', 3), t: '2026-09-04T12:01', amt: 2500, io: 'expense', cp: '某食堂', d: '午餐', cand: ['r4', 'r_gone'], b: B2, why: 'near' },
  { app: 'wechat', no: noW('0920', 5), t: '2026-09-20T09:00', amt: 300, io: 'expense', cp: '小满公交', d: '', cand: [], b: B2, why: 'partial' },
];
const sampleLog = () => [
  { b: B1, at: '2026-10-01T09:00', apps: ['alipay', 'wechat'], from: '2026-09-01', to: '2026-09-02', add: ['r1', 'r2'], chg: [],
    cpLen: 0, pmLen: 0, catsAdded: [], rulesAdded: { cat: [{ kw: '青禾', cat: '餐饮' }], type: [] } },
  { b: B2, at: '2026-10-10T09:00', apps: ['alipay'], from: '2026-09-03', to: '2026-10-06', add: ['r3', 'r5', 'r6', 'r_gone'],
    chg: [{ id: 'r4', was: { time: '2026-09-04T12:00', money: 25 }, nos: [['alipay', noA('0904', 1)]] }, { id: 'r_gone', was: { money: 1 }, nos: [] }],
    cpLen: 2, pmLen: 2, catsAdded: ['购物'], rulesAdded: { cat: [{ kw: '橘子', cat: '购物' }], type: [{ app: 'wechat', type: '群收款', as: 'transfer' }] } },
];

(async () => {

// ===== 1. 存法和读写 =====
{
  const t = await boot(SEED());
  ok(t.inMain(), '1 进了账号');
  const st = t.store(), a = st.archives['默认存档'];
  ok(JSON.stringify(a.cps) === JSON.stringify(CPS) && JSON.stringify(a.pms) === JSON.stringify(PMS) && JSON.stringify(a.importRules) === JSON.stringify(RULES), '1 名单、规则在存档里');
  ok(a.records[0].src.app === 'alipay' && a.records[0].cp === 0 && a.records[0].batch === B1 && a.records[0].oc === '餐饮美食' && a.records[3].src === undefined, '1 记录上的新字段在，手记没有');
  const S = t.S();
  const r = await S.ordersRegister(undefined, sampleOrders());
  ok(r.added === 8 && r.updated === 0, '1 登记 8 个单号：' + JSON.stringify(r));
  let db = await t.db();
  const aid = aidOf(db, ID_A, '默认存档'), P = 'imp_' + ID_A + '_' + aid + '_o_';
  ok(JSON.stringify(impKeys(db)) === JSON.stringify([P + 'alipay_2026-09', P + 'alipay_2026-10', P + 'wechat_2026-09', P + 'wechat_none'].sort()), '1 单号表按来源 + 月份分块：' + impKeys(db).join(','));
  const blk = JSON.parse(db[P + 'alipay_2026-09']);
  ok(JSON.stringify(blk.ids) === '["r1","r3"]' && blk.bs.length === 2 && blk.n.split(',').length === 3 && blk.r === '0,1,1', '1 一块里记录 id 只写一次：' + db[P + 'alipay_2026-09']);
  ok(decode(db[P + 'wechat_2026-09']).some(x => x.st === 1 && x.id === '' && x.batch === B2), '1 「不要了」的单号：r 写成 -');
  ok(!Object.keys(db).filter(k => k.startsWith('led_')).some(k => db[k].includes(noA('0901', 1))), '1 账本（meta 和月份块）里没有单号');
  // 查
  const T = await S.ordersRead();
  ok(T.size === 8, '1 单号表 8 条');
  const g = T.get('alipay', noA('0903', 2));
  ok(g && g.id === 'r3' && g.batch === B2 && g.st === 0 && g.mon === '2026-09', '1 按单号查到记录 id、批次、月份');
  ok(T.get('wechat', noA('0903', 2)) === null && T.get('alipay', 'nope') === null, '1 来源不对、没有的单号都查不到');
  const fp = T.findPrefix('alipay', '20260903');
  ok(fp.length === 2 && fp[0].no < fp[1].no, '1 按单号开头查：两条，按单号排好');
  ok(T.findPrefix('alipay', '2026', 3).length === 3 && T.findPrefix('alipay', '').length === 0, '1 按开头查有条数上限；空开头不查');
  // 覆盖
  const r2 = await S.ordersRegister(undefined, [{ app: 'alipay', no: noA('0901', 1), time: '2026-09-01T08:10', st: 1, batch: B2 }]);
  ok(r2.added === 0 && r2.updated === 1 && (await S.ordersRead()).get('alipay', noA('0901', 1)).st === 1, '1 同来源同单号再登记是覆盖');
  // 不合格的：整批不写
  const before = JSON.stringify(await t.db());
  for (const bad of [{ app: 'alipay', no: 'a,b', id: 'r1' }, { app: 'alipay', no: '', id: 'r1' }, { app: 'jd', no: 'x', id: 'r1' }, { app: 'alipay', no: 'x' }]) {
    let e = null; try { await S.ordersRegister(undefined, [{ app: 'alipay', no: noA('0911', 1), id: 'r1' }, bad]); } catch (x) { e = x; }
    ok(e && e.code === 'badorder' && e.index === 1, '1 不合格的单号拦下（' + JSON.stringify(bad) + '）');
  }
  ok(JSON.stringify(await t.db()) === before, '1 有不合格的，整批都没写');
  // 待处理池、导入记录
  ok((await S.pendingWrite(undefined, samplePending())) === 2 && (await S.pendingRead()).length === 2, '1 待处理池写进去读出来');
  const logs = []; for (let i = 0; i < 12; i++) logs.push(Object.assign({}, sampleLog()[0], { b: 'imgw' + String(i).padStart(4, '0') + 'zz' }));
  ok((await S.importsWrite(undefined, logs)) === 10, '1 导入记录只留 10 次');
  const lr = await S.importsRead();
  ok(lr.length === 10 && lr[0].b === 'imgw0002zz' && lr[9].b === 'imgw0011zz', '1 留下的是最近 10 次');
  await S.importsWrite(undefined, [Object.assign({}, sampleLog()[1], { catsAdded: ['购物', '不存在的分类'] })]);
  ok(JSON.stringify((await S.importsRead())[0].catsAdded) === '["购物"]', '1 导入记录里不在分类表的分类去掉');
  db = await t.db();
  ok(db['imp_' + ID_A + '_' + aid + '_p'] && db['imp_' + ID_A + '_' + aid + '_i'], '1 待处理池、导入记录各一个键');
  await S.pendingWrite(undefined, []);
  ok((await t.db())['imp_' + ID_A + '_' + aid + '_p'] === undefined, '1 待处理池写空就删掉这个键');
  let e2 = null; try { await S.ordersRead('没有这个存档'); } catch (x) { e2 = x; }
  ok(e2 && e2.code === 'noarchive', '1 存档不存在报 noarchive');
  // 重开 App：都还在
  const t2 = await reboot(t);
  const T2 = await t2.S().ordersRead();
  ok(T2.size === 8 && T2.get('alipay', noA('0903', 2)).id === 'r3' && (await t2.S().importsRead()).length === 1, '1 重开 App 单号表、导入记录都在');
  ok(!t.errs.length && !t2.errs.length, '1 无报错 ' + t.errs.concat(t2.errs).join('|'));
}

// ===== 2. 写失败什么都不改 =====
{
  const t = await boot(SEED());
  const S = t.S();
  await S.ordersRegister(undefined, sampleOrders().slice(0, 2));
  const before = JSON.stringify(await t.db());
  breakPut(k => k.startsWith('imp_'));
  let e = null; try { await S.ordersRegister(undefined, sampleOrders().slice(2)); } catch (x) { e = x; }
  let e2 = null; try { await S.pendingWrite(undefined, samplePending()); } catch (x) { e2 = x; }
  restorePut();
  ok(e && e.message === 'quota' && e2 && e2.message === 'quota', '2 存储满：登记、写待处理池都报 quota');
  ok(JSON.stringify(await t.db()) === before, '2 库里什么都没变');
  // 记一笔：不会把刚才失败的那批带进去
  const data = (t.w.JiwenStore || t.w).getUserData(); data.push({ id: (t.w.JiwenStore || t.w).genId(), time: '2026-10-15T09:00', money: 3, cat: '餐饮', remark: '', type: 'expense' }); (t.w.JiwenStore || t.w).saveUserData(data);
  const db = await t.db();
  ok((await S.ordersRead()).size === 2 && !Object.keys(db).some(k => k.endsWith('_p')), '2 之后记一笔，失败的那批没被顺带写进去');
  // 删存档时导入数据和月份块同一个事务：meta 写不进去，导入数据也还在
  const s = (t.w.JiwenStore || t.w).loadStore(); s.archives['旅行'] = { cats: CATS.slice(), records: [{ id: 'rt1', time: '2026-10-01T10:00', money: 5, cat: '出行', remark: '', type: 'expense' }] };
  await (t.w.JiwenStore || t.w).saveStoreDurable(s);
  await S.ordersRegister('旅行', [{ app: 'alipay', no: noA('1001', 1), time: '2026-10-01T10:00', id: 'rt1', batch: B1 }]);
  const before2 = await t.db();
  const s2 = (t.w.JiwenStore || t.w).loadStore(); delete s2.archives['旅行'];
  breakPut(k => k === 'led_' + ID_A + '_m');
  let e3 = null; try { await (t.w.JiwenStore || t.w).saveStoreDurable(s2); } catch (x) { e3 = x; }
  restorePut();
  const after2 = await t.db();
  ok(e3 && JSON.stringify(after2) === JSON.stringify(before2), '2 删存档写到一半失败：账本和导入数据都没动');
  ok(!t.errs.length, '2 无报错 ' + t.errs.join('|'));
}

// ===== 3. 备份往返：同账号、别的账号；id 跟着换；AI 导出、云同步 =====
let backupText;
{
  const t = await boot(SEED());
  const S = t.S();
  await S.ordersRegister(undefined, sampleOrders().concat([{ app: 'alipay', no: noA('0930', 1), time: '2026-09-30T10:00', id: 'r_gone', batch: B2 }]));
  await S.pendingWrite(undefined, samplePending());
  await S.importsWrite(undefined, sampleLog());
  backupText = await t.exportBackup();
  const bk = JSON.parse(backupText);
  ok(bk && JSON.stringify(bk.cps) === JSON.stringify(CPS) && JSON.stringify(bk.pms) === JSON.stringify(PMS) && JSON.stringify(bk.importRules) === JSON.stringify(RULES), '3 备份带上名单、规则');
  ok(bk.imports.length === 2 && bk.pending.length === 2 && bk.orders.alipay['2026-09'] && bk.orders.wechat.none, '3 备份带上导入记录、待处理池、单号表');
  ok(typeof bk.orders.alipay['2026-09'].n === 'string' && Array.isArray(bk.orders.alipay['2026-09'].ids), '3 备份里的单号表是紧凑写法');
  ok(bk.data[0].src.app === 'alipay' && bk.data[0].cp === 0 && bk.data[1].pm === 2 && bk.data[0].oc === '餐饮美食', '3 备份里的记录带新字段');
  // AI 导出：不带来源和单号
  const ai = t.w.JiwenAiExport.buildAiText((t.w.JiwenStore || t.w).getUserData(), '2026年9月', '按月');
  ok(!/alipay|wechat|imgw|22001/.test(ai), '3 AI 导出不带来源、批次、单号');
  // 云同步：带名单、规则、导入记录、待处理池，不带单号表
  t.ls.setItem('onedrive_link_' + ID_A + '__默认存档', JSON.stringify({ uri: 'content://虚构/备份.json' }));
  await (t.w.JiwenStore || t.w).odSyncNow();
  const cloud = JSON.parse(t.w.__cloud[t.w.__cloud.length - 1] || 'null');
  ok(cloud && cloud.cps && cloud.importRules && cloud.imports.length === 2 && cloud.pending.length === 2, '3 云同步带上名单、规则、导入记录、待处理池');
  ok(cloud && cloud.orders === undefined && !t.w.__cloud[t.w.__cloud.length - 1].includes(noA('0901', 1)), '3 云同步不带单号表');

  // ---- 导回同一个账号（新建一个存档、记录重新编号）----
  await t.pick('importFile', backupText);
  t.$('askOk').click(); await t.idle();
  const st = t.store(), a0 = st.archives['默认存档'], a1 = st.archives['默认存档(1)'];
  ok(a1 && a1.records.length === a0.records.length, '3 导进来一个新存档，记录条数一样');
  const map = new Map(a0.records.map((r, i) => [r.id, a1.records[i].id]));
  ok(a1.records.every((r, i) => r.id !== a0.records[i].id), '3 记录全部重新编号');
  const strip = r => { const o = Object.assign({}, r); delete o.id; delete o.refundOf; return JSON.stringify(o); };
  ok(a1.records.every((r, i) => strip(r) === strip(a0.records[i])), '3 新字段原样保留（来源、批次、对方、支付方式、原始分类）');
  ok(a1.records[5].refundOf === map.get('r5'), '3 退款照旧挂回原单（新编号）');
  ok(JSON.stringify(a1.cps) === JSON.stringify(CPS) && JSON.stringify(a1.pms) === JSON.stringify(PMS) && JSON.stringify(a1.importRules) === JSON.stringify(RULES), '3 名单、规则原样保留');
  const T = await S.ordersRead('默认存档(1)');
  const g = T.get('alipay', noA('0903', 2));
  ok(g && g.id === map.get('r3') && a1.records.find(r => r.id === g.id).time === '2026-09-03T18:00', '3 查单号能查到对应的新记录');
  ok(T.size === 8 && T.get('alipay', noA('0930', 1)) === null, '3 记录已经不在的单号不要了（按规则等于没导过），其余 8 条都在');
  ok(T.get('wechat', noW('0910', 7)).st === 1, '3 「不要了」的单号照留');
  const P1 = await S.pendingRead('默认存档(1)');
  ok(JSON.stringify(P1[0].cand) === JSON.stringify([map.get('r4')]) && P1[0].amt === 2500 && P1[1].cp === '小满公交', '3 待处理池候选换成新 id，不在的去掉');
  const L1 = await S.importsRead('默认存档(1)');
  ok(JSON.stringify(L1[1].add) === JSON.stringify(['r3', 'r5', 'r6'].map(x => map.get(x))) && L1[1].chg.length === 1 && L1[1].chg[0].id === map.get('r4'), '3 导入记录里的 id 换成新的，不在的去掉');
  ok(L1[1].chg[0].was.money === 25 && L1[1].chg[0].nos[0][1] === noA('0904', 1) && L1[1].cpLen === 2 && JSON.stringify(L1[1].rulesAdded) === JSON.stringify(sampleLog()[1].rulesAdded), '3 原值、单号、名单长度、新加的规则原样');
  // 再导出一次，再导回来：两次导出除了记录 id、存档名、时间，逐字一样
  t.$('archiveSelect').value = '默认存档(1)'; t.$('archiveSelect').dispatchEvent(new t.w.Event('change')); await t.idle();
  const second = await t.exportBackup();
  await t.pick('importFile', second); t.$('askOk').click(); await t.idle();
  t.$('archiveSelect').value = '默认存档(1)(1)'; t.$('archiveSelect').dispatchEvent(new t.w.Event('change')); await t.idle();
  const third = await t.exportBackup();
  const norm = s => { const o = JSON.parse(s); const ids = new Map(o.data.map((r, i) => [r.id, 'R' + i])); const m = x => ids.get(x) || x;
    delete o.archive; delete o.exportedAt;
    o.data = o.data.map(r => Object.assign({}, r, { id: m(r.id) }, r.refundOf ? { refundOf: m(r.refundOf) } : {}));
    o.imports.forEach(l => { l.add = l.add.map(m); l.chg.forEach(c => { c.id = m(c.id); }); });
    o.pending.forEach(p => { p.cand = p.cand.map(m); });
    Object.values(o.orders).forEach(ms => Object.values(ms).forEach(b => { b.ids = b.ids.map(m); }));
    return JSON.stringify(o); };
  ok(norm(second) === norm(third), '3 导出 → 导入 → 再导出，内容一致');

  // ---- 导进别的账号 ----
  t.$('logoutBtn').click(); await t.idle();
  t.chip('小红').click(); await t.idle();
  await t.pick('importFile', backupText); t.$('askOk').click(); await t.idle();
  const sb = t.store(), ab = sb.archives['默认存档(1)'];
  ok(ab && ab.records.length === 6 && ab.records.every(r => !['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].includes(r.id)), '3 导进小红：新存档、记录重新编号');
  const mb = new Map(a0.records.map((r, i) => [r.id, ab.records[i].id]));
  const TB = await t.S().ordersRead('默认存档(1)');
  ok(TB.size === 8 && TB.get('alipay', noA('1005', 1)).id === mb.get('r5') && TB.get('wechat', 'FP-无时间-1').id === mb.get('r2'), '3 小红那边查单号查到小红的新记录');
  const dbB = await t.db();
  ok(impKeys(dbB).some(k => k.startsWith('imp_' + ID_B + '_')) && JSON.stringify((await t.S().pendingRead('默认存档(1)'))[0].cand) === JSON.stringify([mb.get('r4')]), '3 小红的单号表、待处理池存在小红名下');
  ok(!t.errs.length, '3 无报错 ' + t.errs.join('|'));
}

// ===== 4. 旧备份、坏字段 =====
{
  const t = await boot(SEED());
  const bk = JSON.parse(backupText);
  bk.data[0].cp = 99; bk.data[1].pm = -1; bk.data[2].src = { app: 'jd' }; bk.data[3].batch = '有空格 的批次';
  bk.importRules.cat.push({ kw: '没这个分类', cat: '旅游' }); bk.importRules.type.push({ app: 'alipay', type: 'x', as: '乱写' });
  bk.orders.alipay['2026-09'].r = '0,1';      // 坏了一块：长度对不上
  await t.pick('importFile', JSON.stringify(bk)); t.$('askOk').click(); await t.idle();
  const a = t.store().archives['默认存档(1)'];
  ok(a && a.records.length === 6, '4 字段不对的备份照样导进来');
  ok(a.records[0].cp === undefined && a.records[1].pm === undefined && a.records[2].src === undefined && a.records[3].batch === undefined, '4 不合格的字段丢掉，记录照留');
  ok(a.importRules.cat.length === 3 && a.importRules.type.length === 2, '4 不合格的规则丢掉');
  const T = await t.S().ordersRead('默认存档(1)');
  ok(T.get('alipay', noA('0901', 1)) === null && T.get('alipay', noA('1005', 1)) !== null, '4 坏了的那块不要，别的块照留');
  // 1015-A 的备份（没有新东西）：照常导入，没有 imp_ 数据
  const old = JSON.parse(backupText); ['cps', 'pms', 'importRules', 'imports', 'pending', 'orders'].forEach(k => delete old[k]);
  old.data.forEach(r => { delete r.src; delete r.batch; delete r.cp; delete r.pm; delete r.oc; });
  await t.pick('importFile', JSON.stringify(old)); t.$('askOk').click(); await t.idle();
  const a2 = t.store().archives['默认存档(2)'];
  const db = await t.db();
  ok(a2 && a2.records.length === 6 && a2.cps === undefined && a2.importRules === undefined && !impKeys(db).some(k => k.includes('_' + aidOf(db, ID_A, '默认存档(2)') + '_')), '4 旧备份导进来没有导入数据');
  ok(!t.errs.length, '4 无报错 ' + t.errs.join('|'));
}

// ===== 5. 分类改名 / 删除对规则的影响 =====
{
  const t = await boot(SEED());
  t.w.JiwenCats.renameCat('餐饮'); t.$('askInput').value = '吃饭'; t.$('askOk').click(); await t.idle();
  let a = t.store().archives['默认存档'];
  ok(JSON.stringify(a.importRules.cat) === JSON.stringify([{ kw: '青禾', cat: '吃饭' }, { kw: '公交', cat: '出行' }, { kw: '橘子', cat: '购物' }]), '5 分类改名：规则里的分类跟着改');
  ok(JSON.stringify(a.importRules.type) === JSON.stringify(RULES.type), '5 类型规则不受影响');
  t.w.JiwenCats.deleteCat('出行'); t.$('askOk').click(); await t.idle();
  a = t.store().archives['默认存档'];
  ok(JSON.stringify(a.importRules.cat) === JSON.stringify([{ kw: '青禾', cat: '吃饭' }, { kw: '橘子', cat: '购物' }]), '5 分类删除：指向它的规则一起删');
  const t2 = await reboot(t);
  ok(JSON.stringify(t2.store().archives['默认存档'].importRules.cat) === JSON.stringify(a.importRules.cat), '5 重开 App 还是改过的');
  ok(!t.errs.length && !t2.errs.length, '5 无报错 ' + t.errs.concat(t2.errs).join('|'));
}

// ===== 6. 删存档、移走账号、孤立的导入数据 =====
{
  const t = await boot(SEED());
  const S = t.S();
  await S.ordersRegister(undefined, sampleOrders());
  const s = (t.w.JiwenStore || t.w).loadStore(); s.archives['旅行'] = { cats: CATS.slice(), records: [{ id: 'rt1', time: '2026-10-01T10:00', money: 5, cat: '出行', remark: '', type: 'expense' }] };
  await (t.w.JiwenStore || t.w).saveStoreDurable(s);
  await S.ordersRegister('旅行', [{ app: 'alipay', no: noA('1001', 1), time: '2026-10-01T10:00', id: 'rt1', batch: B1 }]);
  await S.pendingWrite('旅行', samplePending()); await S.importsWrite('旅行', sampleLog());
  let db = await t.db();
  const aidT = aidOf(db, ID_A, '旅行'), aidD = aidOf(db, ID_A, '默认存档');
  ok(impKeys(db).filter(k => k.includes('_' + aidT + '_')).length === 3, '6 「旅行」有单号表、待处理池、导入记录');
  // 改名：不用动
  const s1 = (t.w.JiwenStore || t.w).loadStore(); s1.archives['出差'] = s1.archives['旅行']; delete s1.archives['旅行']; await (t.w.JiwenStore || t.w).saveStoreDurable(s1);
  t.w.JiwenSettings.refreshArchiveSelect();
  db = await t.db();
  ok(aidOf(db, ID_A, '出差') === aidT && impKeys(db).filter(k => k.includes('_' + aidT + '_')).length === 3 && (await S.ordersRead('出差')).size === 1, '6 存档改名：存档号不变，导入数据不用动');
  // 删存档（走界面）
  t.$('archiveSelect').value = '出差'; t.$('archiveSelect').dispatchEvent(new t.w.Event('change')); await t.idle();
  t.$('delArchive').click(); t.$('askOk').click(); await t.idle();
  db = await t.db();
  ok(!impKeys(db).some(k => k.includes('_' + aidT + '_')) && !Object.keys(db).some(k => k.includes('_' + aidT + '_')), '6 删存档：导入数据和月份块一起删了');
  ok(impKeys(db).filter(k => k.includes('_' + aidD + '_')).length === 4, '6 别的存档的单号表不受影响');
  // 移走账号的清理（新建账号没登记成功时用的那个）
  await (t.w.JiwenStore || t.w).ledgerDropAccount(ID_A);
  db = await t.db();
  ok(!Object.keys(db).some(k => k.startsWith('imp_' + ID_A + '_') || k.startsWith('led_' + ID_A + '_')), '6 账号整个删掉时导入数据一起删');

  // 孤立的导入数据（旧版本删存档时留下的）：进账号时清掉
  const t2 = await boot(SEED());
  await t2.S().ordersRegister(undefined, sampleOrders().slice(0, 1));
  const put = (phone, k, v) => new Promise((res, rej) => { const q = phone.open('jiwen', 1); q.onsuccess = () => { const d = q.result, tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = rej; }; });
  await t2.idle();
  const orphan = 'imp_' + ID_A + '_azzzz0001_o_alipay_2026-09';
  await put(t2.phone, orphan, '{"ids":[],"bs":[],"n":"","r":"","b":""}');
  await put(t2.phone, 'imp_' + ID_A + '_azzzz0001_p', '{"v":1,"items":[]}');
  const t3 = await reboot(t2);
  db = await t3.db();
  ok(!Object.keys(db).some(k => k.includes('azzzz0001')), '6 进账号时清掉不属于任何存档的导入数据');
  ok((await t3.S().ordersRead()).size === 1, '6 自己存档的照留');
  // meta 坏了的时候不清
  await put(t3.phone, orphan, '{"ids":[],"bs":[],"n":"","r":"","b":""}');
  await put(t3.phone, 'led_' + ID_A + '_m', '{坏了');
  const t4 = await reboot(t3);
  db = await t4.db();
  ok(db[orphan] !== undefined, '6 账本坏了时不清（存档号可能对不上）');
  ok(!t.errs.length && !t2.errs.length && !t3.errs.length, '6 无报错 ' + t.errs.concat(t2.errs, t3.errs).join('|'));
}

// ===== 7. 存储估算 =====
{
  const hand = []; for (let i = 0; i < 300; i++) hand.push({ id: 'h' + i, time: '2026-08-' + String(1 + i % 28).padStart(2, '0') + 'T12:00', money: 10 + i % 50, cat: CATS[1 + i % 4], remark: i % 3 ? '' : '手记备注' + i, type: 'expense' });
  const t = await boot(SEED(sampleStore(hand)));
  const S = t.S();
  const names = []; for (let i = 0; i < 500; i++) names.push('虚构商户' + i + (i % 3 ? '（某分店）' : ''));
  const est = S.estimate({ records: 3000, orders: 3000, names });
  const size = db => Object.values(db).reduce((s, v) => s + String(v).length, 0) + Object.keys(db).reduce((s, k) => s + k.length, 0);
  const before = size(await t.db());
  const s = (t.w.JiwenStore || t.w).loadStore(), a = (t.w.JiwenStore || t.w).curArchive(s);
  a.cps = (a.cps || []).concat(names);
  const orders = [];
  for (let i = 0; i < 3000; i++) {
    const d = String(1 + i % 28).padStart(2, '0'), m = String(1 + i % 12).padStart(2, '0');
    const id = (t.w.JiwenStore || t.w).genId();
    a.records.push({ id, time: '2025-' + m + '-' + d + 'T' + String(i % 24).padStart(2, '0') + ':15', money: (i % 300) + 0.5, cat: CATS[1 + i % 4], remark: i % 4 ? '' : '虚构商品', type: 'expense', src: { app: i % 2 ? 'alipay' : 'wechat' }, batch: B1, cp: CPS.length + i % 500, pm: i % 3, oc: '餐饮美食' });
    orders.push({ app: i % 2 ? 'alipay' : 'wechat', no: i % 2 ? noA(m + d, i) : noW(m + d, i), time: '2025-' + m + '-' + d + 'T10:00', id, batch: B1 });
  }
  await (t.w.JiwenStore || t.w).saveStoreDurable(s);
  await S.ordersRegister(undefined, orders);
  const grew = size(await t.db()) - before;
  const ratio = est.chars / grew;
  ok(ratio > 0.8 && ratio < 1.2, '7 估算 ' + est.chars + ' 字符，实际多了 ' + grew + ' 字符（比 ' + ratio.toFixed(2) + '，要在 0.8–1.2）');
  ok(est.bytes === est.chars * 2, '7 字节按每字符 2 字节估');
  const e0 = S.estimate({ records: 0, orders: 0, names: 0 });
  ok(e0.chars === 0, '7 什么都不加估 0');
  ok(!t.errs.length, '7 无报错 ' + t.errs.join('|'));
}

// ===== 8. 12 万单号 =====
{
  const N = 120000;
  // 一年的账：约 6500 条记录（收款按天合并成一条，个人消费一条一条），单号 12 万
  const recs = [], orders = [];
  let k = 0;
  for (let m = 1; m <= 12; m++) {
    const M = String(m).padStart(2, '0');
    for (const app of ['alipay', 'wechat']) {
      for (let d = 1; d <= 28; d++) {
        const D = String(d).padStart(2, '0'), id = 'rs' + M + D + app[0];
        recs.push({ id, time: '2025-' + M + '-' + D + 'T23:59', money: 300 + d, cat: '其他', remark: '收款汇总', type: 'income', src: { app }, batch: 'imgwb' + M, cp: 0, oc: '收款' });
        for (let j = 0; j < 150; j++) { if (k >= N) break; orders.push({ app, no: app === 'alipay' ? noA(M + D, k) : noW(M + D, k), time: '2025-' + M + '-' + D + 'T10:00', id, batch: 'imgwb' + M }); k++; }
      }
      for (let j = 0; j < 240; j++) {
        const D = String(1 + j % 28).padStart(2, '0'), id = 'rp' + M + app[0] + j;
        recs.push({ id, time: '2025-' + M + '-' + D + 'T12:' + String(j % 60).padStart(2, '0'), money: 5 + j % 90, cat: CATS[1 + j % 4], remark: j % 3 ? '' : '虚构商品', type: 'expense', src: { app }, batch: 'imgwb' + M, cp: j % 4, pm: j % 3, oc: '餐饮美食' });
        if (k < N) { orders.push({ app, no: app === 'alipay' ? noA(M + D, k) : noW(M + D, k), time: '2025-' + M + '-' + D + 'T12:00', id, batch: 'imgwb' + M }); k++; }
      }
    }
  }
  while (k < N) { orders.push({ app: 'alipay', no: noA('1231', k), time: '2025-12-31T10:00', id: 'rs1228a', batch: 'imgwb12' }); k++; }
  const t = await boot(SEED(sampleStore(recs)), { loose: true });
  let t0 = ms();
  const reg = await t.S().ordersRegister(undefined, orders);
  const tReg = ms() - t0;
  ok(reg.added === N, '8 登记 12 万单号（' + tReg + 'ms）');
  const db = await t.db();
  const ordChars = impKeys(db).filter(k => k.includes('_o_')).reduce((s, k) => s + db[k].length, 0);
  console.log('    12 万单号在库里共 ' + (ordChars / 1048576).toFixed(2) + 'M 字符，' + impKeys(db).length + ' 块；记录 ' + recs.length + ' 条');

  // 进入账号：有没有这 12 万单号，读进来的东西一样多，而且一个 imp_ 都没读
  const plain = await boot(SEED(sampleStore(recs)), { loose: true });
  const runEnter = async (from, html2) => {
    const w = watchReads(); const t1 = ms();
    const x = await boot(from.dump(), { phone: from.phone, loose: true, html: html2 });
    const el = ms() - t1; w.stop();
    return { chars: w.chars, imp: w.imp, impKeys: w.impKeys, ms: el, inMain: x.inMain(), n: (x.w.JiwenStore || x.w).getUserData().length };
  };
  // 两台「手机」都先迁移好（第一次打开时搬家），再测第二次打开
  const withOrd = await runEnter(t), noOrd = await runEnter(plain);
  ok(withOrd.inMain && withOrd.n === recs.length && noOrd.n === recs.length, '8 两边都进了账号，记录 ' + withOrd.n + ' 条');
  ok(withOrd.chars === noOrd.chars, '8 进入账号读进来的字符数一样：有单号 ' + withOrd.chars + '，没单号 ' + noOrd.chars);
  // 1031-A 起导入正式放出来，进账号要画「刚导入」横幅、月初提醒、待处理横幅，只许读导入记录（_i）、待处理（_p）这两小块；
  //   单号表、备份、备份目录、草稿一块都不许读（原来是「一个 imp_ 都不读」，那时导入藏在开发开关后面）
  console.log('    进入账号读的导入数据：' + (withOrd.impKeys.join(',') || '无'));
  const badImp = withOrd.impKeys.filter(k => !/_(i|p)$/.test(k));
  ok(badImp.length === 0 && withOrd.imp <= 2, '8 进入账号只读导入记录和待处理，单号表、备份、草稿一块没读：' + withOrd.impKeys.join(','));
  console.log('    进入账号耗时：有 12 万单号 ' + withOrd.ms + 'ms，没有 ' + noOrd.ms + 'ms');
  if (process.env.OLD_HTML) {
    const oldHtml = fs.readFileSync(process.env.OLD_HTML, 'utf8');
    const best = async (from, h) => { let b = Infinity; for (let i = 0; i < 3; i++) b = Math.min(b, (await runEnter(from, h)).ms); return b; };
    const tNew = await best(t), tOld = await best(t, oldHtml);
    console.log('    同一份数据进入账号（三次取最快）：新版 ' + tNew + 'ms，旧版 ' + tOld + 'ms');
    // 只打印不比：进入账号没读单号表，上面已经按「读进来的字符数一样」核过了
  }

  // 按单号开头查：读全表建索引一次，查的耗时有上限
  // 读单号表：每块只解析一次。只数单号表那几块被解析了几次——页面里同时可能有别的事在解析别的 JSON（刷新、云同步的定时器），不算进来
  const blockVals = new Map(impKeys(db).filter(k => k.includes('_o_')).map(k => [db[k], 0]));
  const J = t.w.JSON, op = J.parse;
  J.parse = function (x) { if (typeof x === 'string' && blockVals.has(x)) blockVals.set(x, blockVals.get(x) + 1); return op.apply(this, arguments); };
  t0 = ms();
  const T = await t.S().ordersRead();
  const tLoad = ms() - t0;
  J.parse = op;
  ok(T.size === N, '8 读出 12 万条');
  const times = [...blockVals.values()];
  ok(times.length === 24 && times.every(n => n === 1), '8 读单号表每块正好解析一遍（' + times.length + ' 块，共 ' + ordChars + ' 字符；耗时 ' + tLoad + 'ms，只打印不比）：' + JSON.stringify(times));
  // 按开头查：数看了几个单号（二分 + 往后数），不比毫秒
  t0 = ms();
  let hits = 0, maxScan = 0;
  for (let i = 0; i < 1000; i++) {
    const o = orders[(i * 997) % N];
    if (T.get(o.app, o.no) && T.findPrefix(o.app, o.no.slice(0, 14), 20).length) hits++;
    maxScan = Math.max(maxScan, T.stats.lastScan);
  }
  const tQ = ms() - t0;
  ok(hits === 1000, '8 1000 次按单号查、按开头查都查到');
  const bound = Math.ceil(Math.log2(N)) + 20 + 1;
  ok(maxScan <= bound, '8 按开头查最多看了 ' + maxScan + ' 个单号（上限 log₂N + 条数上限 + 1 = ' + bound + '；1000 次共 ' + tQ + 'ms，只打印不比）');

  // 导出备份再导回来：不超上限、能成功
  t0 = ms();
  const text = await t.exportBackup();
  const bytes = Buffer.byteLength(text || '');
  console.log('    备份文件 ' + (bytes / 1048576).toFixed(2) + 'MB（导出 ' + (ms() - t0) + 'ms）');
  ok(text && bytes < 24 * 1024 * 1024, '8 带 12 万单号的备份 ' + (bytes / 1048576).toFixed(2) + 'MB，在 24MB 上限以内');
  t0 = ms();
  await t.pick('importFile', text);
  const okMsg = t.$('askMsg').textContent;
  t.$('askOk').click(); await t.idle();
  const T2 = await t.S().ordersRead('默认存档(1)');
  ok(T2.size === N, '8 导回来 12 万单号都在（' + (ms() - t0) + 'ms）：' + okMsg.slice(0, 30));
  const a1 = t.store().archives['默认存档(1)'];
  const o1 = orders[54321], g = T2.get(o1.app, o1.no);
  ok(g && a1.records.find(r => r.id === g.id) && a1.records.find(r => r.id === g.id).time === recs.find(r => r.id === o1.id).time, '8 导回来的单号指向新存档里对应的记录');
  // 云同步：不带单号表
  t.ls.setItem('onedrive_link_' + ID_A + '__默认存档', JSON.stringify({ uri: 'content://虚构/备份.json' }));
  t.$('archiveSelect').value = '默认存档'; t.$('archiveSelect').dispatchEvent(new t.w.Event('change')); await t.idle();
  await (t.w.JiwenStore || t.w).odSyncNow();
  const cloud = t.w.__cloud[t.w.__cloud.length - 1] || '';
  console.log('    云同步一次上传 ' + (Buffer.byteLength(cloud) / 1048576).toFixed(2) + 'MB（不带单号表）');
  ok(cloud.length > 0 && !cloud.includes(orders[0].no), '8 云同步不带单号表');
  ok(!t.errs.length, '8 无报错 ' + t.errs.join('|'));
}

// ===== 9. 装回旧版本再装回来（设 OLD_HTML 才跑）=====
if (process.env.OLD_HTML) {
  const oldHtml = fs.readFileSync(process.env.OLD_HTML, 'utf8');
  const t = await boot(SEED());
  await t.S().ordersRegister(undefined, sampleOrders());
  await t.S().pendingWrite(undefined, samplePending());
  await t.S().importsWrite(undefined, sampleLog());
  const before = await t.db();
  // 装回旧版
  const o = await reboot(t, { html: oldHtml });
  ok(o.inMain() && (o.w.JiwenStore || o.w).getUserData().length === 6, '9 旧版进得了账号，6 条记录都在');
  const data = (o.w.JiwenStore || o.w).getUserData(); data.push({ id: (o.w.JiwenStore || o.w).genId(), time: '2026-10-15T09:30', money: 7, cat: '餐饮', remark: '旧版记的', type: 'expense' }); (o.w.JiwenStore || o.w).saveUserData(data);
  // 旧版改一条导入来的记录
  const d2 = (o.w.JiwenStore || o.w).getUserData(); d2[1] = Object.assign({}, d2[1], { remark: '旧版改过' }); (o.w.JiwenStore || o.w).saveUserData(d2);
  await o.idle();
  o.d.querySelector('.tab-btn[data-tab="stats"]').click();
  const bk = await o.exportBackup();
  ok(bk && JSON.parse(bk).data.length === 7, '9 旧版照常记账、看统计、导出备份');
  const mid = await o.db();
  ok(JSON.stringify(impKeys(mid).map(k => [k, mid[k]])) === JSON.stringify(impKeys(before).map(k => [k, before[k]])), '9 旧版没碰导入数据');
  // 再装回新版
  const n = await reboot(o);
  const a = n.store().archives['默认存档'];
  ok(a.records.length === 7 && a.records.some(r => r.remark === '旧版记的'), '9 装回新版：旧版记的那笔在');
  ok(JSON.stringify(a.cps) === JSON.stringify(CPS) && JSON.stringify(a.importRules) === JSON.stringify(RULES), '9 名单、规则还在');
  ok(a.records[0].src.app === 'alipay' && a.records[0].cp === 0 && a.records[1].remark === '旧版改过' && a.records[1].cp === 1 && a.records[1].src.app === 'wechat', '9 记录上的新字段还在（旧版改过的那条也在）');
  ok((await n.S().ordersRead()).size === 8 && (await n.S().pendingRead()).length === 2 && (await n.S().importsRead()).length === 2, '9 单号表、待处理池、导入记录都在');
  ok(!o.errs.length && !n.errs.length, '9 无报错 ' + o.errs.concat(n.errs).join('|'));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
