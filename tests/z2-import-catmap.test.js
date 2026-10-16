// 1016-J 分类对照记住。node z2-import-catmap.test.js [index.html]
// 确认页「新建分类」里手动选了「并到已有 X」，写进去时存「推荐分类 → X」；下次同一个推荐分类落不到已有分类时直接归 X。
// 一、纯计算（classify / plan / write）：三种来源、同名同义优先、你的规则和从合并里学的不被盖、没动过的默认不存、手动改行不存、目标是这批新建的分类。
// 二、jsdom 里真导：第一次并到 → 存档里有 → 第二次直接落、不再问；没选的照样问；备份、云备份往返；恢复到导入前；分类改名、删除。
// 账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const IDB = require('./helpers/idb');
const { interceptor, makeFakeWorker } = require('./helpers/import-files');
const B = require('./helpers/bills');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const C = require(path.join(WWW, 'import', 'classify.js'));
const M = require(path.join(WWW, 'import', 'merchants.js'));
const P = require(path.join(WWW, 'import', 'plan.js'));
const W = require(path.join(WWW, 'import', 'write.js'));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
async function until(fn, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch (_) {} await new Promise(r => setTimeout(r, 3)); } return !!fn(); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 老用户的分类（不是默认那 7 个）：没有出行、缴费、医疗、娱乐这类
const CATS = ['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他', '杂项'];

// ===================== 一、纯计算 =====================
{
  const cls = (rows, ctx) => C.classify(rows, Object.assign({ cats: CATS, merchants: M, isNewUser: false }, ctx));
  const MAPS = [{ from: '交通出行', cat: '杂项' }, { from: '充值缴费', cat: '其他' }, { from: '医疗健康', cat: '杂项' }];
  const rows = [
    { app: 'wechat', cp: '滴滴出行', desc: '快车', kind: '商户消费', io: 'expense' },        // 内置词表
    { app: 'alipay', cp: '某虚构营业厅', desc: '缴费', kind: '充值缴费', io: 'expense' },     // 支付宝自带分类
    { app: 'wechat', cp: '某虚构诊所', desc: '诊费', kind: '商户消费', io: 'expense' },      // 两家互借
    { app: 'wechat', cp: '某虚构影城', desc: '电影票', kind: '商户消费', io: 'expense' }     // 没对照的
  ];
  const borrowRows = [{ cp: '某虚构诊所', kind: '医疗健康' }];
  const r0 = cls(rows, { borrowRows });
  ok(r0.recs.slice(0, 3).every(x => x.cat === '未分类' && x.newCat) && r0.newCats.map(n => n.name).sort().join() === '交通出行,充值缴费,医疗健康,文化休闲'.split(',').sort().join(),
    '一 没有对照：三种来源都落不到，进新建分类 ' + r0.newCats.map(n => n.name).join());
  const r1 = cls(rows, { borrowRows, maps: MAPS });
  ok(r1.recs[0].cat === '杂项' && r1.recs[0].layer === 'builtin' && !r1.recs[0].newCat && r1.recs[0].reason.indexOf('你的对照：交通出行 → 杂项') === 0, '一 内置词表来源：直接落对照的分类，理由写对照 ' + r1.recs[0].reason);
  ok(r1.recs[1].cat === '其他' && r1.recs[1].layer === 'alipay' && /^你的对照：充值缴费 → 其他（支付宝分类：充值缴费）$/.test(r1.recs[1].reason), '一 支付宝分类来源：落对照 ' + r1.recs[1].reason);
  ok(r1.recs[2].cat === '杂项' && r1.recs[2].layer === 'borrow' && /^你的对照：医疗健康 → 杂项/.test(r1.recs[2].reason), '一 两家互借来源：落对照 ' + r1.recs[2].reason);
  ok(r1.newCats.length === 1 && r1.newCats[0].name === '文化休闲' && r1.recs[3].cat === '未分类', '一 新建分类里只剩没对照的那一项');
  // 同名、同义优先
  const r2 = cls(rows.slice(0, 2), { maps: MAPS, cats: CATS.concat(['交通出行', '缴费']) });
  ok(r2.recs[0].cat === '交通出行' && r2.recs[0].reason.indexOf('你的对照') < 0, '一 存档后来建了同名分类：同名优先，不查对照');
  ok(r2.recs[1].cat === '缴费' && r2.recs[1].reason.indexOf('你的对照') < 0, '一 存档后来建了同义分类：同义优先，不查对照');
  // 目标分类不在存档里（删了）的对照不算
  const r3 = cls(rows.slice(0, 1), { maps: [{ from: '交通出行', cat: '已删的分类' }] });
  ok(r3.recs[0].cat === '未分类' && r3.newCats.length === 1, '一 对照的目标分类不在存档里：当没对照，照样问');
  // 你的规则、从合并里学的不被对照盖掉
  const r4 = cls([rows[0], { app: 'wechat', cp: '某虚构打车', desc: '打车', kind: '商户消费', io: 'expense' }],
    { maps: MAPS, rules: [{ kw: '滴滴', cat: '购物' }], learned: new Map([['某虚构打车', '吃饭']]) });
  ok(r4.recs[0].cat === '购物' && r4.recs[0].layer === 'rule', '一 你的规则优先于对照');
  ok(r4.recs[1].cat === '吃饭' && r4.recs[1].layer === 'learned', '一 从合并里学的优先于对照');

  // ---- plan → write：哪些存、哪些不存（真的走 解析 → 定去向 → 配对 → 方案 → 写入清单）----
  const PA = require(path.join(WWW, 'import', 'parse.js')), RO = require(path.join(WWW, 'import', 'route.js')), MA = require(path.join(WWW, 'import', 'match.js'));
  const txns = [
    B.txn({ time: { y: 2026, mo: 3, d: 1, h: 9, mi: 0, s: 0 }, kind: '商户消费', cp: '滴滴出行', desc: '快车', io: 'expense', fen: 2300, pm: '零钱', status: '支付成功', mno: '', no: '4200000000000000000000000101' }),
    B.txn({ time: { y: 2026, mo: 3, d: 2, h: 9, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构营业厅', desc: '话费充值', io: 'expense', fen: 3000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000000000000000000102' }),
    B.txn({ time: { y: 2026, mo: 3, d: 3, h: 9, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构药房', desc: '药房', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000000000000000000103' }),
    B.txn({ time: { y: 2026, mo: 3, d: 4, h: 9, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构影城', desc: '电影票', io: 'expense', fen: 4500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000000000000000000104' })
  ];
  const parsed = PA.parseFiles([{ name: '虚构.csv', data: B.ab(B.bill('wechat', txns, { range: { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' } }).bytes) }]);
  const routed = RO.route(parsed, { known: {}, rules: [] });
  const keyOfCp = (matched, cp) => matched.items.find(x => x.src === 'row' && parsed.files[x.file].rows[x.row].cp === cp).key;
  const mk = (info, editsFn) => {
    info = Object.assign({ cats: CATS, cps: [], pms: [] }, info);
    const matched = MA.match(routed, parsed, { manual: [], cats: info.cats, merchants: M, isNewUser: !!info.isNewUser, maps: info.catMaps });
    const input = { parsed, matched, info, manualById: {} };
    const p = P.plan(input, editsFn ? editsFn(matched) : {});
    return { p, matched, ws: W.build(input, p, { batch: 'btest1', at: '2026-03-10T10:00' }) };
  };
  const ncNames = mk({}).p.sections.newCats.map(n => n.name).sort().join();
  ok(ncNames === ['交通出行', '充值缴费', '医疗健康', '文化休闲'].sort().join(), '一 写入用例：四个推荐分类都进新建分类 ' + ncNames);
  // 新用户：不到 3 笔默认并到「其他」，没动过 → 不存
  const a = mk({ isNewUser: true, cats: ['未分类', '餐饮', '购物', '转账', '工资', '红包', '其他'] });
  ok(a.p.sections.newCats.every(n => n.into === '其他' && !n.picked) && a.ws.mapsAdd.length === 0 && !a.ws.log.rulesAdded.map, '一 新用户没动过的默认「并到其他」：不存对照');
  // 老用户：手动选了并到 → 存；选了新建、没动的 → 不存；手动改了一行的分类 → 不存
  const b = mk({ isNewUser: false }, m => ({ newCats: { '交通出行': { on: false, into: '杂项', picked: true }, '充值缴费': { on: true, into: null }, '医疗健康': { on: false, into: '', picked: false } },
    rows: { [keyOfCp(m, '某虚构影城')]: { cat: '购物' } } }));
  ok(same(b.ws.mapsAdd, [{ from: '交通出行', cat: '杂项' }]) && same(b.ws.log.rulesAdded.map, b.ws.mapsAdd), '一 只存手动选的「并到」：' + JSON.stringify(b.ws.mapsAdd));
  ok(b.ws.records.some(r => r.cat === '购物') && !b.ws.mapsAdd.some(m => m.from === '文化休闲'), '一 确认页手动改一行的分类：不产生对照');
  ok(b.ws.catsAdded.join() === '充值缴费', '一 选了新建的照常建分类，不存对照');
  // 手动选了「并到其他」，后来又勾上新建 → 不存
  const c = mk({ isNewUser: false }, () => ({ newCats: { '交通出行': { on: true, into: null, picked: false } } }));
  ok(c.ws.mapsAdd.length === 0, '一 选过并到又改成新建：不存');
  // 并到的目标是这一批才新建的分类
  const d = mk({ isNewUser: false }, () => ({ newCats: { '文化休闲': { on: true, into: null }, '医疗健康': { on: false, into: '文化休闲', picked: true } } }));
  ok(d.ws.catsAdded.indexOf('文化休闲') >= 0 && same(d.ws.mapsAdd, [{ from: '医疗健康', cat: '文化休闲' }]), '一 并到的目标是这批新建的分类：也存对照');
  // 存档里已有同一个推荐分类的对照：不重复存
  const e = mk({ isNewUser: false, catMaps: [{ from: '交通出行', cat: '其他' }] }, () => ({ newCats: { '交通出行': { on: false, into: '杂项', picked: true } } }));
  ok(e.ws.mapsAdd.length === 0 && !e.p.sections.newCats.some(n => n.name === '交通出行'), '一 已有对照的推荐分类：不再进新建分类，也不重复存');
  // 没有对照的导入：导入记录的 rulesAdded 和以前一样只有 cat、type
  ok(same(Object.keys(a.ws.log.rulesAdded), ['cat', 'type']), '一 没存对照时导入记录的 rulesAdded 形状不变');
}

// ===================== 二、jsdom 里真导 =====================
const NOW = '2026-10-16T10:00:00';
const ID = 'u1760000000000000031';
const Tm = (mo, d, h) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = (app, txns) => B.bill(app, txns, { range: RANGE }).bytes;
const seedOf = (cats, recs) => ({ accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1',
  ['store_' + ID]: JSON.stringify({ archives: { '默认存档': { cats, records: recs || [] } }, last: '默认存档', accountName: '小明' }), ['app_time_repaired_' + ID]: '1' });

async function boot(o) {
  o = o || {};
  const t = { log: [], jsErr: [] };
  const vc = new VirtualConsole(); vc.forwardTo(console, { jsdomErrors: 'none' }); vc.on('jsdomError', e => t.jsErr.push(e.message));
  t.FW = makeFakeWorker(WWW);
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(WWW, t.log)] },
    beforeParse(w) {
      t.phone = IDB.install(w, o.phone);
      Object.entries(o.seed || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      if (o.cloudLink) w.localStorage.setItem('onedrive_link_' + ID + '__默认存档', JSON.stringify({ uri: 'content://虚构/备份.json' }));
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime() + (w.__tick = (w.__tick || 0) + 1); } };
      w.Worker = t.FW;
      w.__files = []; w.__cloud = [];
      w.Capacitor = { isNativePlatform: () => true, Plugins: {
        Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } },
        OneDriveLink: { writeText: async x => { w.__cloud.push(x.text); return {}; }, pickFile: async () => ({}), forget: async () => {}, checkAccess: async () => ({ ok: true }) },
        App: { addListener(ev, fn) { if (ev === 'backButton') t.backFn = fn; return { remove() {} }; }, exitApp() { t.exited = true; } } } };
    } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  Object.assign(t, { dom, w, d, $, errs, idle: () => IDB.idle(w) });
  await IDB.idle(w);
  await until(() => t.backFn, 2000);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  t.S = () => w.JiwenImportUI._state();
  t.st = () => w.JiwenImportStore;
  t.arch = () => w.loadStore(ID).archives['默认存档'];
  t.importFiles = async (files, edit, opts) => {
    opts = opts || {};
    $('devImportBtn').click();
    await until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
    const input = $('impFile');
    Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new w.File([bytes], name)), configurable: true });
    input.dispatchEvent(new w.Event('change'));
    await until(() => $('impGo') && /^(新建 \d+ 条记录|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex');
    const S = t.S();
    if (edit) { await edit(S); await until(() => $('impGo') && $('impBar').style.display === 'flex'); }
    const plan = S.plan;
    if (opts.noGo || !plan.canImport) { const r = { plan, S }; $('impCancel').click(); return r; }
    $('impGo').click();
    await until(() => $('impResult') || $('askMask').style.display === 'flex', 60000);
    const res = { plan, S, result: S.result, alert: $('askMask').style.display === 'flex' ? $('askMsg').textContent : null };
    if (res.alert) $('askOk').click();
    if ($('impResult')) $('impBackToLedger').click(); else $('impCancel').click();
    await t.idle();
    return res;
  };
  // 在确认页「新建分类」那块的下拉里选「并到 X」（走真的页面事件）
  t.pickInto = (name, into) => {
    const row = d.querySelector('#impNewCats [data-cat="' + name + '"]');
    const se = row && row.querySelector('select');
    if (!se) throw new Error('新建分类里没有「' + name + '」');
    se.value = into; se.dispatchEvent(new w.Event('change'));
  };
  t.dump = async () => { await t.idle(); const db = await IDB.dumpDb(t.phone); const o = {}; Object.keys(db).sort().forEach(k => { if (!/_bk_/.test(k)) o[k] = db[k]; }); return o; };
  return t;
}
const recOf = (S, pred) => {
  const it = S.matched.items.find(x => x.src === 'row' && pred(S.parsed.files[x.file].rows[x.row], S.parsed.files[x.file].app));
  return it && it.rec;
};

(async () => {
  // 第一批：内置词表（滴滴 → 交通出行）、支付宝分类（充值缴费）、两家互借（某虚构诊所：医疗健康）、内置（影城 → 文化休闲，不动它）
  const batch1 = () => ({
    wx: [wx({ time: Tm(3, 1), cp: '滴滴出行', desc: '快车', fen: 2300 }), wx({ time: Tm(3, 2), cp: '某虚构诊所', desc: '诊费', fen: 5000 }),
         wx({ time: Tm(3, 3), cp: '某虚构影城', desc: '电影票', fen: 4500 })],
    ali: [ali({ time: Tm(3, 4), cp: '某虚构营业厅', kind: '充值缴费', desc: '缴费', fen: 3000 }), ali({ time: Tm(3, 5), cp: '某虚构诊所', kind: '医疗健康', desc: '挂号', fen: 1500 })]
  });
  const files = b => [['微信.csv', bill('wechat', b.wx)], ['支付宝.csv', bill('alipay', b.ali)]];
  const t = await boot({ seed: seedOf(CATS), cloudLink: true });
  const before = await t.dump();

  // ===== 1. 第一次：新建分类里手动并到 → 写入后对照在存档里 =====
  const r1 = await t.importFiles(files(batch1()), async S => {
    ok(S.plan.sections.newCats.map(n => n.name).sort().join() === ['交通出行', '充值缴费', '医疗健康', '文化休闲'].sort().join(), '1 第一次：四个推荐分类都进新建分类');
    t.pickInto('交通出行', '杂项'); t.pickInto('充值缴费', '其他'); t.pickInto('医疗健康', '杂项');
  });
  ok(r1.result && !r1.alert, '1 写进去了 ' + (r1.alert || ''));
  const want1 = [{ from: '交通出行', cat: '杂项' }, { from: '充值缴费', cat: '其他' }, { from: '医疗健康', cat: '杂项' }];
  const sortM = m => (m || []).slice().sort((x, y) => x.from < y.from ? -1 : 1);
  ok(same(sortM(t.arch().importRules && t.arch().importRules.map), sortM(want1)), '1 存档里存了三条对照，没动的「文化休闲」不存：' + JSON.stringify(t.arch().importRules));
  const logs1 = await t.st().importsRead();
  ok(same(sortM(logs1[0].rulesAdded.map), sortM(want1)), '1 导入记录的 rulesAdded 带上这三条对照（给撤销用）');
  ok(t.w.getUserData().filter(r => r.money === 23 || r.money === 50 || r.money === 15).every(r => r.cat === '杂项') && t.w.getUserData().find(r => r.money === 30).cat === '其他', '1 这一批照选的分类写进去');
  const after1 = await t.dump();

  // ===== 2. 第二次：同样的推荐分类直接落 X，新建分类里不再出现；没动过的照样问 =====
  const b2 = { wx: [wx({ time: Tm(4, 1), cp: '滴滴出行', desc: '快车', fen: 1800 }), wx({ time: Tm(4, 2), cp: '某虚构诊所', desc: '复诊', fen: 2000 }), wx({ time: Tm(4, 3), cp: '某虚构影城', desc: '电影票', fen: 3900 })],
               ali: [ali({ time: Tm(4, 4), cp: '另一家虚构营业厅', kind: '充值缴费', desc: '缴费', fen: 5000 }), ali({ time: Tm(4, 5), cp: '某虚构诊所', kind: '医疗健康', desc: '挂号', fen: 1500 })] };
  const r2 = await t.importFiles(files(b2), null, { noGo: true });
  const S2 = r2.S;
  ok(r2.plan.sections.newCats.map(n => n.name).join() === '文化休闲', '2 新建分类里只剩没并过的「文化休闲」：' + r2.plan.sections.newCats.map(n => n.name).join());
  const dd = recOf(S2, r => r.cp === '滴滴出行'), yy = recOf(S2, r => r.cp === '另一家虚构营业厅'), zs = recOf(S2, (r, app) => r.cp === '某虚构诊所' && app === 'wechat');
  ok(dd.cat === '杂项' && dd.layer === 'builtin' && /^你的对照：交通出行 → 杂项/.test(dd.reason), '2 内置词表来源：直接落杂项，理由写对照 ' + dd.reason);
  ok(yy.cat === '其他' && yy.layer === 'alipay' && /^你的对照：充值缴费 → 其他/.test(yy.reason), '2 支付宝分类来源：直接落其他 ' + yy.reason);
  ok(zs.cat === '杂项' && zs.layer === 'borrow' && /^你的对照：医疗健康 → 杂项/.test(zs.reason), '2 两家互借来源：直接落杂项 ' + zs.reason);
  ok(same(await t.dump(), after1), '2 只看不导：账本没变');

  // ===== 3. 导出备份再导入、云备份往返：对照不丢 =====
  {
    t.$('exportBtn').click();
    await until(() => t.w.__files.length);
    const bk = JSON.parse(t.w.__files[t.w.__files.length - 1]);
    ok(same(sortM(bk.importRules.map), sortM(want1)) && same(sortM(bk.imports[0].rulesAdded.map), sortM(want1)), '3 导出的备份带对照（存档设置里、导入记录里都有）');
    const tn = await boot({ seed: seedOf(['未分类']) });
    await tn.w.importArchiveFromText(JSON.stringify(bk), ID); await tn.idle();
    const st = tn.w.loadStore(ID), names = Object.keys(st.archives), a = st.archives[names[names.length - 1]];
    ok(same(sortM(a.importRules.map), sortM(want1)), '3 导入备份以后对照还在');
    await t.w.odSyncNow();
    const cloudText = t.w.__cloud[t.w.__cloud.length - 1] || 'null', cloud = JSON.parse(cloudText);
    ok(cloud && same(sortM(cloud.importRules.map), sortM(want1)), '3 云备份带对照');
    const tc = await boot({ seed: seedOf(['未分类']) });
    await tc.w.importArchiveFromText(cloudText, ID); await tc.idle();
    const sc = tc.w.loadStore(ID), nc = Object.keys(sc.archives), ac = sc.archives[nc[nc.length - 1]];
    ok(same(sortM(ac.importRules.map), sortM(want1)), '3 从云备份恢复以后对照还在');
    // 坏数据：目标分类不在存档里的、没有 from 的、同一个 from 第二条，清洗时丢掉
    const bad = Object.assign({}, bk, { importRules: { cat: [], type: [], map: [{ from: '交通出行', cat: '杂项' }, { from: '交通出行', cat: '其他' }, { from: '', cat: '其他' }, { from: '酒店旅游', cat: '没有这个分类' }, 'x'] } });
    const tb = await boot({ seed: seedOf(['未分类']) });
    await tb.w.importArchiveFromText(JSON.stringify(bad), ID); await tb.idle();
    const sb = tb.w.loadStore(ID), nb = Object.keys(sb.archives), ab = sb.archives[nb[nb.length - 1]];
    ok(same(ab.importRules.map, [{ from: '交通出行', cat: '杂项' }]), '3 备份里不合格的对照清洗掉：' + JSON.stringify(ab.importRules));
    ok(!t.errs.length && !tn.errs.length && !tc.errs.length && !tb.errs.length, '3 无报错 ' + t.errs.concat(tn.errs, tc.errs, tb.errs).join('|'));
  }

  // ===== 4. 恢复到导入前：这批新存的对照也没了 =====
  {
    await t.st().restoreLast();
    ok(same(await t.dump(), before) && !(t.arch().importRules && t.arch().importRules.map), '4 恢复到导入前：逐字节一样，对照也没了');
    const r = await t.importFiles(files(b2), null, { noGo: true });
    ok(r.plan.sections.newCats.length === 4, '4 恢复以后再导：四个推荐分类又都进新建分类');
  }

  // ===== 5. 存档后来建了同名分类：同名优先 =====
  {
    const t5 = await boot({ seed: seedOf(CATS) });
    await t5.importFiles(files(batch1()), async () => { t5.pickInto('交通出行', '杂项'); });
    ok(same(t5.arch().importRules.map, [{ from: '交通出行', cat: '杂项' }]), '5 先存一条对照：交通出行 → 杂项');
    const st = t5.w.loadStore(ID); st.archives['默认存档'].cats.push('交通出行'); t5.w.saveStore(st, ID); await t5.idle();
    const r = await t5.importFiles(files(b2), null, { noGo: true });
    const dd5 = recOf(r.S, x => x.cp === '滴滴出行');
    ok(dd5.cat === '交通出行' && dd5.reason.indexOf('你的对照') < 0 && !r.plan.sections.newCats.some(n => n.name === '交通出行'), '5 同名分类优先，不查对照 ' + dd5.reason);
  }

  // ===== 6. 你的规则、从合并里学的不被对照盖掉 =====
  {
    const recs = [1, 2].map(d => ({ id: 'mm' + d, time: `2026-05-0${d}T08:30`, money: 12, type: 'expense', cat: '吃饭', remark: '手记' }));
    const s6 = seedOf(CATS, recs), st6 = JSON.parse(s6['store_' + ID]);
    st6.archives['默认存档'].importRules = { cat: [{ kw: '滴滴', cat: '购物' }], type: [], map: [{ from: '交通出行', cat: '杂项' }] };
    s6['store_' + ID] = JSON.stringify(st6);
    const t6 = await boot({ seed: s6 });
    const w6 = [wx({ time: Tm(5, 6), cp: '滴滴出行', desc: '快车', fen: 2100 }),
                wx({ time: Tm(5, 1), cp: '某虚构打车', desc: '打车', fen: 1200 }), wx({ time: Tm(5, 2), cp: '某虚构打车', desc: '打车', fen: 1200 }),
                wx({ time: Tm(5, 8), cp: '某虚构打车', desc: '打车', fen: 3300 })];
    const r = await t6.importFiles([['微信.csv', bill('wechat', w6)]], null, { noGo: true });
    const a6 = recOf(r.S, x => x.cp === '滴滴出行'), b6 = recOf(r.S, x => x.cp === '某虚构打车' && x.fen === 3300);
    ok(a6.cat === '购物' && a6.layer === 'rule', '6 你的规则优先于对照 ' + a6.reason);
    ok(b6.cat === '吃饭' && b6.layer === 'learned', '6 从合并里学的优先于对照 ' + (b6 && b6.reason));
  }

  // ===== 7. 没选并到的，第二次照样问；手动改一行的分类不存 =====
  {
    const t7 = await boot({ seed: seedOf(CATS) });
    const r = await t7.importFiles(files(batch1()), async S => {
      const it = S.matched.items.find(x => x.src === 'row' && S.parsed.files[x.file].rows[x.row].cp === '滴滴出行');
      S.edits.rows[it.key] = { cat: '购物' }; t7.w.JiwenImportUI._replan();
    });
    ok(r.result && !(t7.arch().importRules && t7.arch().importRules.map) && t7.w.getUserData().find(x => x.money === 23).cat === '购物', '7 只手动改了一行的分类：照改的写，不存对照');
    const r2b = await t7.importFiles(files(b2), null, { noGo: true });
    ok(r2b.plan.sections.newCats.length === 4, '7 第二次：没并过的照样出现在新建分类里');
  }

  // ===== 8. 并到的目标是这一批才新建的分类：先建分类，再存对照 =====
  {
    const t8 = await boot({ seed: seedOf(CATS) });
    const r = await t8.importFiles(files(batch1()), async S => {
      S.edits.newCats['文化休闲'] = { on: true, into: null };
      S.edits.newCats['医疗健康'] = { on: false, into: '文化休闲', picked: true };
      t8.w.JiwenImportUI._replan();
    });
    const a8 = t8.arch();
    ok(r.result && a8.cats.indexOf('文化休闲') >= 0 && same(a8.importRules.map, [{ from: '医疗健康', cat: '文化休闲' }]), '8 目标是这批新建的「文化休闲」：先建分类，对照也存下了 ' + JSON.stringify(a8.importRules));
    const lg = (await t8.st().importsRead()).slice(-1)[0];
    ok(same(lg.rulesAdded.map, [{ from: '医疗健康', cat: '文化休闲' }]) && lg.catsAdded.indexOf('文化休闲') >= 0, '8 导入记录里新分类和对照都在');
  }

  // ===== 9. 分类改名：对照跟着改；删掉：对照作废 =====
  {
    const s9 = seedOf(CATS), st9 = JSON.parse(s9['store_' + ID]);
    st9.archives['默认存档'].importRules = { cat: [{ kw: '某虚构', cat: '杂项' }], type: [], map: [{ from: '交通出行', cat: '杂项' }, { from: '充值缴费', cat: '其他' }] };
    s9['store_' + ID] = JSON.stringify(st9);
    const t9 = await boot({ seed: s9 });
    t9.w.renameCat('杂项'); t9.$('askInput').value = '零碎'; t9.$('askOk').click(); await t9.idle();
    ok(same(t9.arch().importRules.map, [{ from: '交通出行', cat: '零碎' }, { from: '充值缴费', cat: '其他' }]) && same(t9.arch().importRules.cat, [{ kw: '某虚构', cat: '零碎' }]), '9 分类改名：对照、规则跟着改');
    t9.w.deleteCat('零碎'); t9.$('askOk').click(); await t9.idle();
    ok(same(t9.arch().importRules.map, [{ from: '充值缴费', cat: '其他' }]), '9 分类删掉：指向它的对照作废');
    t9.w.deleteCat('其他'); t9.$('askOk').click(); await t9.idle();
    const ir = t9.arch().importRules;
    ok(!ir || !ir.map, '9 对照删光了：不留空的 map ' + JSON.stringify(ir));
    ok(!t9.errs.length, '9 无报错 ' + t9.errs.join('|'));
  }

  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
