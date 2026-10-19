// 1016-K 撤销（jsdom 跑整个 App，假 Worker、假 IndexedDB，真导真撤）。node z4-import-undo.test.js [index.html]
// 分分捐 0.15 → 0.31 → 0.15；合并手记跨月搬回；依赖要先撤之后的；撤完逐字节一致；导入后改过的几种；你挂的退款、你删掉的；
// 新建分类删还是留；撤完再导确认页和第一次一样（勾掉的又出现）；写到一半失败什么都不改；撤销前备份能恢复；账本变了拒绝；
// 中间撤一次：名单以外和「从没导过这次」一样，全部撤完逐字节一致；留下的名字被后来的导入用上算依赖；
// 随机导入若干次的性质测试（倒序全撤、中间撤再全撤）。账单、手记全是虚构的。
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NOW = '2026-12-20T10:00:00';
const ID = 'u1760000000000000041';
const CATS = ['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他', '杂项'];
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = (app, txns) => B.bill(app, txns, { range: RANGE }).bytes;
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});
const seedOf = (recs, cats) => ({ accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1',
  ['store_' + ID]: JSON.stringify({ archives: { '默认存档': { cats: cats || CATS, records: recs } }, last: '默认存档', accountName: '小明' }), ['app_time_repaired_' + ID]: '1' });

const OS = FIDB.IDBObjectStore.prototype, origPut = OS.put, origDel = OS.delete;
// 写到这个键（写进去或删掉）时让整个事务失败
function breakPut(when) {
  OS.put = function (v, k) { if (when(String(k), v)) { const req = origPut.call(this, v, k); this.transaction.abort(); return req; } return origPut.call(this, v, k); };
  OS.delete = function (k) { if (when(String(k))) { const req = origDel.call(this, k); this.transaction.abort(); return req; } return origDel.call(this, k); };
}
function restorePut() { OS.put = origPut; OS.delete = origDel; }

async function boot(o) {
  o = o || {};
  const t = { log: [] };
  const vc = new VirtualConsole(); vc.forwardTo(console, { jsdomErrors: 'none' });
  t.FW = makeFakeWorker(WWW);
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(WWW, t.log)] },
    beforeParse(w) {
      t.phone = IDB.install(w, o.phone);
      Object.entries(o.seed || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime() + (w.__tick = (w.__tick || 0) + 1000); } };
      w.Worker = t.FW;
      w.__files = [];
      w.Capacitor = { isNativePlatform: () => true, Plugins: {
        Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } },
        App: { addListener(ev, fn) { if (ev === 'backButton') t.backFn = fn; return { remove() {} }; }, exitApp() {} } } };
    } });
  const w = dom.window, d = w.document, $ = H.stepGet(w);
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  Object.assign(t, { dom, w, d, $, errs, idle: () => IDB.idle(w) });
  await IDB.idle(w);
  await until(() => t.backFn, 2000);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  t.S = () => w.JiwenImportUI._state();
  t.st = () => w.JiwenImportStore;
  t.arch = () => (w.JiwenStore || w).loadStore(ID).archives['默认存档'];
  t.recs = () => t.arch().records;
  // 导入一批：打开导入页 → 选文件 →（edit 改方案）→ 点导入
  t.importFiles = async (files, edit, opts) => {
    opts = opts || {};
    $('devImportBtn').click();
    await until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
    const input = $('impFile');
    Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new w.File([bytes], name)), configurable: true });
    input.dispatchEvent(new w.Event('change'));
    await until(() => $('impGo') && /^(新建 \d+ 条记录|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex', 30000);
    w.JiwenImportUI._goStep('check');   // 1017-UI2：从第 1 步开始看（等按钮时走到了总览）
    const S = t.S();
    const first = snap(S.plan);
    if (edit) { edit(S); w.JiwenImportUI._replan(); }
    const plan = S.plan;
    if (opts.noGo || !plan.canImport) { H.clickCancel(w); return { plan, S, first }; }
    H.clickGo(w);
    await until(() => $('impResult') || $('askMask').style.display === 'flex', 60000);
    const res = { plan, S, first, result: S.result, alert: $('askMask').style.display === 'flex' ? $('askMsg').textContent : null };
    if (res.alert) $('askOk').click();
    if ($('impResult')) $('impBackToLedger').click(); else H.clickCancel(w);
    await t.idle();
    return res;
  };
  t.keyOf = (S, txn) => { const it = S.matched.items.find(x => x.src === 'row' && S.parsed.files[x.file].rows[x.row].no === txn.no); return it && it.key; };
  t.logs = async () => t.st().importsRead();
  t.undoPlan = async b => { await w.eval('JiwenImportEntry.loadImportUI')(); return t.st().undoPlan(b); };
  t.undo = async b => { const p = await t.undoPlan(b); const r = await t.st().undo(p); await t.idle(); return { p, r }; };
  t.dump = async () => { await t.idle(); const db = await IDB.dumpDb(t.phone); const o = {}; Object.keys(db).sort().forEach(k => { if (!/_bk_/.test(k)) o[k] = db[k]; }); return o; };
  t.save = async fn => { const s = (w.JiwenStore || w).loadStore(ID); fn(s.archives['默认存档']); (w.JiwenStore || w).saveStore(s, ID); await t.idle(); };
  return t;
}
// 确认页上的样子：各桶笔数、每行去向和分类、新建分类
function snap(p) {
  return { counts: p.counts, rows: p.rows.filter(d => d.src === 'row').map(d => [d.key, d.group, d.cat, d.why || '']).sort((a, b) => a[0] < b[0] ? -1 : 1),
           newCats: p.sections.newCats.map(n => n.name).sort() };
}
// 名单以外比：记录编号、批次号换成按出现顺序的占位；对方、支付方式编号换成名字；名单、名单长度、指纹、时间不比
//   存档号（每台手机随机）换成占位；月份块里的顺序号 s 换成全局名次（删记录会留空号，和手动删一样，顺序不变）
function norm(dump) {
  const o = {};
  Object.keys(dump).forEach(k => { const k2 = k.replace(/_a[0-9a-z]{8,}(_|$)/, '_<存档>$1'); try { o[k2] = JSON.parse(dump[k]); } catch (_) { o[k2] = dump[k]; } });
  const seqs = []; Object.keys(o).forEach(k => { if (/^led_.*_\d{4}-\d{2}$/.test(k) && o[k] && Array.isArray(o[k].s)) seqs.push(...o[k].s); });
  const rank = new Map([...new Set(seqs)].sort((x, y) => x - y).map((v, i) => [v, i]));
  Object.keys(o).forEach(k => { if (/^led_.*_\d{4}-\d{2}$/.test(k) && o[k] && Array.isArray(o[k].s)) o[k] = Object.assign({}, o[k], { s: o[k].s.map(v => rank.get(v)) }); });
  Object.values(o).forEach(v => { if (v && v.archives) Object.values(v.archives).forEach(a => { if (a && typeof a.records === 'string') a.records = '<存档>'; }); });
  let cps = [], pms = [];
  const find = v => { if (v && typeof v === 'object') { if (Array.isArray(v.cps)) cps = v.cps; if (Array.isArray(v.pms)) pms = v.pms; Object.values(v).forEach(find); } };
  Object.values(o).forEach(find);
  const ids = new Map(), bs = new Map();
  const ph = (m, s, tag) => { if (!m.has(s)) m.set(s, tag + (m.size + 1)); return m.get(s); };
  const DROP = ['cps', 'pms', 'cpLen', 'pmLen', 'cpEnd', 'pmEnd', 'h', 'at', 'exportedAt'];
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (/^r\d{10,}/.test(v)) return ph(ids, v, '<记录');
      if (/^b[0-9a-z]+$/.test(v) && (key === 'batch' || key === 'b' || key === 'bs')) return ph(bs, v, '<批次');
      return v.replace(/r\d{20,}/g, m => ph(ids, m, '<记录'));
    }
    if (Array.isArray(v)) return v.map(x => walk(x, key));
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach(k => {
        if (DROP.includes(k)) return;
        if (k === 'cp' && Number.isInteger(v[k])) out[k] = 'cp:' + cps[v[k]];
        else if (k === 'pm' && Number.isInteger(v[k])) out[k] = 'pm:' + pms[v[k]];
        else out[k] = walk(v[k], k);
      });
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(o, ''));
}

(async () => {
  // ===== 1. 分分捐追加、跨月搬回、依赖、新建分类、对照、勾掉、待处理、退款 → 倒序撤完逐字节一致 =====
  const RECS = [man('m1', 10, 1, 15, { remark: '豆浆油条' }), man('m2', 10, 3, 22), man('m5', 10, 8, 30, { cat: '购物' }), man('m6', 11, 2, 18)];   // 1.1 起金额相近、分类对得上的会自动合并；这里要的是「待你确认」，分类故意不一样
  const pettyA = [];
  for (let d = 1; d <= 15; d++) pettyA.push(wx({ time: T(10, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  const pettyB = pettyA.concat([...Array(16)].map((_, i) => wx({ time: T(10, 16 + i, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 })));
  const ref1 = wx({ time: T(10, 10), cp: '某虚构超市', fen: 5000, status: '已退款¥10.00' });
  const ref2 = wx({ time: T(10, 11), cp: '某虚构超市', kind: '某虚构超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: wrno() });
  const drop = wx({ time: T(10, 12), cp: '某虚构摊', fen: 700 });
  const A_WX = [wx({ time: T(9, 30, 23, 40), cp: '某虚构早点', desc: '早餐', fen: 1500 }), wx({ time: T(10, 3, 12), cp: '某虚构面馆', desc: '午餐', fen: 2200 }),
                wx({ time: T(10, 8), cp: '某虚构饭店', fen: 2800 }), wx({ time: T(10, 9), cp: '滴滴出行', desc: '快车', fen: 2300 }), ref1, ref2, drop].concat(pettyA);
  const A_ALI = [1, 2, 3].map(d => ali({ time: T(10, 4 + d), cp: '某虚构诊所' + d, kind: '医疗健康', fen: 6000 + d })).concat([ali({ time: T(10, 20), status: '交易关闭', fen: 999 })]);
  const FILES_A = [['微信A.csv', bill('wechat', A_WX)], ['支付宝A.csv', bill('alipay', A_ALI)]];
  const editA = S => { S.edits.newCats['医疗健康'] = { on: true, into: null }; S.edits.newCats['交通出行'] = { on: false, into: '杂项', picked: true };
                       S.edits.rows[S.matched.items.find(x => x.src === 'row' && S.parsed.files[x.file].rows[x.row].no === drop.no).key] = { exclude: true }; };
  const t = await boot({ seed: seedOf(RECS) });
  const D0 = await t.dump();
  const rA = await t.importFiles(FILES_A, editA);
  {
    const recs = t.recs(), m1 = recs.find(r => r.id === 'm1'), pet = recs.find(r => r.src && r.src.sum === 'petty');
    ok(rA.result && m1.time === '2026-09-30T23:40' && m1.src && m1.src.merged && pet.money === 0.15 && t.arch().cats.includes('医疗健康') && t.arch().importRules.map.length === 1,
      '1 第 1 次：10-01 补记的手记合并到 9-30 那笔账单（1017-UI6 起手记比账单早的不自动合并，这里改成事后补记），分分捐 0.15，建了「医疗健康」，存了对照 ' + (rA.alert || ''));
    ok(rA.plan.counts.pending >= 1 && rA.plan.counts.excluded === 1, '1 第 1 次有待处理和勾掉的');
  }
  const DA = await t.dump();
  const B_WX = pettyB.concat([wx({ time: T(11, 2, 8), cp: '某虚构早点', desc: '早餐', fen: 1800 }), wx({ time: T(11, 5), cp: '某虚构书店', fen: 4500 })]);
  const rB = await t.importFiles([['微信B.csv', bill('wechat', B_WX)]]);
  const [lA, lB] = await t.logs();
  {
    const pet = t.recs().find(r => r.src && r.src.sum === 'petty');
    ok(rB.result && pet.money === 0.31 && lB.chg.some(c => c.id === pet.id && c.was.money === 0.15 && c.now.money === 0.31), '1 第 2 次：分分捐追加到 0.31，导入记录里有原值和写进去的值');
    ok(Array.isArray(lB.h) && lB.h.length === lB.add.length && Number.isInteger(lB.cpEnd), '1 导入记录带指纹和导完时的名单长度');
  }
  {
    const p = await t.undoPlan(lA.b);
    ok(p.ok && same(p.chain, [lB.b, lA.b]) && p.why[lB.b].some(x => x.why === 'same'), '1 撤第 1 次：第 2 次追加了同一条分分捐，要先撤第 2 次');
    ok(/要先撤销之后的 1 次导入/.test(t.w.JiwenImportUndo.describe(p)), '1 摘要写明要先撤之后的 1 次');
  }
  {
    const { p } = await t.undo(lB.b);
    const pet = t.recs().find(r => r.src && r.src.sum === 'petty');
    const T2 = await t.st().ordersRead();
    const petNos = pettyB.map(x => T2.get('wechat', x.no)).filter(Boolean);
    ok(p.chain.length === 1 && pet.money === 0.15 && petNos.length === 15 && petNos.every(e => e.batch === lA.b), '1 撤第 2 次：分分捐回到 0.15，单号表只剩第 1 次的 15 笔');
    ok(same(await t.dump(), DA), '1 撤第 2 次：和导入第 2 次之前逐字节一样');
  }
  {
    const { p } = await t.undo(lA.b);
    const s = p.steps[0];
    ok(s.deleted > 0 && s.restored >= 2 && s.catsDropped.includes('医疗健康') && s.mapsRemoved === 1 && s.pending >= 1 && !s.legacy, '1 撤第 1 次：摘要 ' + JSON.stringify({ d: s.deleted, r: s.restored, c: s.catsDropped, m: s.mapsRemoved, p: s.pending }));
    const Dn = await t.dump(), sepKey = Object.keys(Dn).find(k => /2026-10$/.test(k));
    ok(t.recs().find(r => r.id === 'm1').time === '2026-10-01T08:30' && sepKey && Dn[sepKey].indexOf('"m1"') >= 0 && Dn[sepKey] === D0[sepKey], '1 跨月的手记搬回 10 月的月份块');
    ok(same(await t.dump(), D0), '1 倒序撤完：账本、单号表、待处理池、导入记录和导入前逐字节一样');
  }
  // 撤完再导同一份文件：确认页和第一次一模一样（勾掉的又会出现）
  {
    const r = await t.importFiles(FILES_A, null, { noGo: true });
    ok(same(r.first, rA.first), '1 撤完再导：确认页和第一次一模一样（含勾掉的那行）');
    ok(r.plan.rows.some(d => d.key === t.keyOf(r.S, drop) && d.group !== 'excluded' && d.group !== 'skip'), '1 勾掉的那行又出现了');
  }

  // ===== 2. 导入后改过、你挂的退款、你删掉的 =====
  {
    const R2 = [man('n1', 10, 1, 15), man('n2', 10, 2, 16), man('n3', 10, 3, 17)];
    const t2 = await boot({ seed: seedOf(R2) });
    const D = await t2.dump();
    const W2 = [wx({ time: T(10, 1, 9), cp: '某虚构早点', fen: 1500 }), wx({ time: T(10, 2, 9), cp: '某虚构早点', fen: 1600 }), wx({ time: T(10, 3, 9), cp: '某虚构早点', fen: 1700 }),
                wx({ time: T(10, 5), cp: '某虚构店甲', fen: 4100 }), wx({ time: T(10, 6), cp: '某虚构店乙', fen: 4200 }), wx({ time: T(10, 7), cp: '某虚构店丙', fen: 4300 })];
    const r = await t2.importFiles([['微信.csv', bill('wechat', W2)]]);
    const [lg] = await t2.logs();
    const added = t2.recs().filter(x => lg.add.includes(x.id));
    await t2.save(a => {
      a.records = a.records.map(x => x.id === added[0].id ? Object.assign({}, x, { cat: '购物' })
        : x.id === 'n1' ? Object.assign({}, x, { remark: '后来改的备注' })
        : x.id === 'n2' ? Object.assign({}, x, { time: '2026-10-02T21:00' }) : x).filter(x => x.id !== added[2].id);
      a.records.push({ id: 'ur1', time: '2026-10-08T10:00', money: 5, type: 'income', cat: '吃饭', remark: '退了一点', refundOf: added[1].id });
    });
    const p = await t2.undoPlan(lg.b), tt = p.totals;
    ok(r.result && tt.changed === 1 && tt.kept === 1 && tt.userRefunds === 1 && tt.gone === 1 && tt.restored === 3, '2 方案：改过的新增 1、合并手记里你改的 1 处、你挂的退款 1、已删 1、还原 3 ' + JSON.stringify(tt));
    const txt = t2.w.JiwenImportUndo.describe(p);
    ok(/其中 1 条你导入后改过/.test(txt) && /退款 1 条一起删掉/.test(txt) && /1 处你导入后改过/.test(txt) && /1 条已经被你删掉了/.test(txt), '2 摘要都写到了：\n' + txt);
    await t2.st().undo(p); await t2.idle();
    const n1 = t2.recs().find(x => x.id === 'n1'), n2 = t2.recs().find(x => x.id === 'n2'), n3 = t2.recs().find(x => x.id === 'n3');
    ok(n1.remark === '后来改的备注' && n1.time === '2026-10-01T08:30' && !n1.src && !n1.batch, '2 改了合并手记的备注：备注保留，时间、来源还原');
    ok(n2.time === '2026-10-02T21:00' && !n2.src && !('cp' in n2), '2 改了合并手记的时间：时间不还原，其余还原');
    ok(same(n3, R2[2]), '2 没改过的合并手记：和导入前一样');
    ok(!t2.recs().some(x => x.id === 'ur1' || lg.add.includes(x.id)), '2 新增的（含改过分类的）删了，你挂的退款也删了');
    ok((await t2.logs()).length === 0 && !t2.arch().cps, '2 导入记录去掉了，名单截断');
    ok(!t2.errs.length, '2 无报错 ' + t2.errs.join('|'));
    void D;
  }

  // ===== 3. 新建分类：预算里用了就留下 =====
  {
    const t3 = await boot({ seed: seedOf([]) });
    await t3.importFiles([['支付宝.csv', bill('alipay', [1, 2, 3].map(d => ali({ time: T(10, d), cp: '某虚构诊所' + d, kind: '医疗健康', fen: 2000 + d })))]],
      S => { S.edits.newCats['医疗健康'] = { on: true, into: null }; });
    const [lg] = await t3.logs();
    await t3.save(a => { a.budgets = Object.assign({}, a.budgets || {}, { '医疗健康': 300 }); });
    const { p } = await t3.undo(lg.b);
    ok(p.steps[0].catsKept.length === 1 && p.steps[0].catsKept[0].budget && t3.arch().cats.includes('医疗健康') && /1 个还在用，留下/.test(t3.w.JiwenImportUndo.describe(p)), '3 预算里用了的新分类：留下并说明');
  }

  // ===== 4. 写到一半失败、撤销前备份、账本变了 =====
  {
    const t4 = await boot({ seed: seedOf(RECS) });
    await t4.importFiles(FILES_A, editA);
    const [lg] = await t4.logs();
    const D1 = await t4.dump(), nb = t4.st().backups().length;
    for (const [name, setup] of [['整理完、写之前出错', () => { t4.w.__impFailAt = 'undoSave'; }], ['账本月块写到一半', () => breakPut(k => /^led_.+_2026-10$/.test(k))],
                                  ['单号表写到一半', () => breakPut(k => /_o_wechat_/.test(k))], ['导入记录写不进去', () => breakPut(k => /_i$/.test(k))]]) {
      const p = await t4.undoPlan(lg.b);
      setup();
      let err = null; try { await t4.st().undo(p); } catch (e) { err = e; }
      restorePut(); t4.w.__impFailAt = null; await t4.idle();
      ok(err && same(await t4.dump(), D1) && t4.st().backups().length === nb, '4 ' + name + '：报错，账本、单号表和撤销前逐字节一样，刚做的备份也删了');
    }
    const p = await t4.undoPlan(lg.b);
    await t4.save(a => { a.records = a.records.concat([man('x9', 12, 1, 1)]); });
    let err = null; try { await t4.st().undo(p); } catch (e) { err = e; }
    ok(err && err.code === 'stale', '4 算完方案后账本变了：拒绝写 ' + (err && err.code));
    await t4.save(a => { a.records = a.records.filter(r => r.id !== 'x9'); });
    const D2 = await t4.dump();
    await t4.undo(lg.b);
    const bks = t4.st().backups();
    ok(bks[bks.length - 1].kind === 'undo' && bks.length <= 3, '4 撤销前自动备份一份，标「撤销」，和导入前的共用 3 份 ' + JSON.stringify(bks.map(b => b.kind)));
    await t4.st().restoreLast(); await t4.idle();
    ok(same(await t4.dump(), D2), '4 用撤销前备份恢复：回到撤销前');
  }

  // ===== 5. 中间撤一次：名单以外和「从没导过这次」一样；全部撤完逐字节一致；留下的名字被用上算依赖 =====
  {
    const R5 = [man('k1', 10, 2, 33), man('k2', 11, 3, 44)];
    const FA = [['微信.csv', bill('wechat', [wx({ time: T(10, 2, 9), cp: '某虚构茶馆', fen: 3300 }), wx({ time: T(10, 4), cp: '某虚构花店', fen: 5100 }), wx({ time: T(10, 6), cp: '某虚构文具', fen: 1200 })])]];
    const FB = [['支付宝.csv', bill('alipay', [ali({ time: T(11, 3, 9), cp: '某虚构菜场', fen: 4400 }), ali({ time: T(11, 5), cp: '某虚构理发', fen: 3800, pm: '某虚构银行卡' })])]];
    const t5 = await boot({ seed: seedOf(R5) });
    const D = await t5.dump();
    await t5.importFiles(FA); await t5.importFiles(FB);
    const [la, lb] = await t5.logs();
    const { p } = await t5.undo(la.b);
    ok(same(p.chain, [la.b]) && p.steps[0].names.left.cps === 3, '5 第 1 次和第 2 次没关系：直接撤，对方名留在原位 ' + JSON.stringify(p.steps[0].names));
    const tb = await boot({ seed: seedOf(R5) });
    await tb.importFiles(FB);
    const n1 = norm(await t5.dump()), n2 = norm(await tb.dump());
    if (n1 !== n2) { const a = JSON.parse(n1), b = JSON.parse(n2); Object.keys(Object.assign({}, a, b)).forEach(k => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('    差别在', k, '\n      撤：', String(JSON.stringify(a[k])).slice(0, 600), '\n      没导：', String(JSON.stringify(b[k])).slice(0, 600)); }); }
    ok(n1 === n2, '5 中间撤一次：名单以外和「从没导过第 1 次」一样');
    ok(t5.arch().cps.length === 3 + tb.arch().cps.length, '5 名单只多出没人用的 3 个名字');
    // 留下的名字被新的导入用上 → 撤第 2 次要先撤它
    await t5.importFiles([['微信2.csv', bill('wechat', [wx({ time: T(12, 1), cp: '某虚构花店', fen: 6100 })])]]);
    const lc = (await t5.logs()).slice(-1)[0];
    const pc = await t5.undoPlan(lb.b);
    ok(same(pc.chain, [lc.b, lb.b]) && pc.why[lc.b].some(x => x.why === 'names'), '5 留下的名字被后来的导入用上：撤第 2 次要先撤它');
    await t5.st().undo(pc); await t5.idle();
    ok(same(await t5.dump(), D), '5 全部撤完：连名单在内逐字节一致');
  }

  // ===== 6. 性质测试：随机导入若干次，倒序全撤 / 中间撤再全撤，逐字节一致 =====
  {
    let rnd = 20261016;
    const rand = n => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd % n; };
    const SHOPS = ['某虚构早点', '某虚构面馆', '某虚构茶馆', '某虚构书店', '某虚构花店', '某虚构菜场', '滴滴出行', '某虚构诊所', '某虚构影城'];
    const KINDS = ['日用百货', '餐饮美食', '医疗健康', '文化休闲', '交通出行'];
    for (let round = 0; round < 6; round++) {
      const manual = [];
      for (let i = 0; i < 10; i++) manual.push(man('p' + round + '_' + i, 9 + rand(3), 1 + rand(27), 10 + rand(40)));
      const tr = await boot({ seed: seedOf(manual) });
      const snaps = [await tr.dump()];
      const nImp = 3 + rand(3), pettyPool = [];
      for (let k = 0; k < nImp; k++) {
        const mo = 9 + rand(3), wxs = [], alis = [];
        const nRows = 3 + rand(5);
        for (let j = 0; j < nRows; j++) {
          const m = rand(4) === 0 ? manual[rand(manual.length)] : null;     // 有时候正好是一条手记
          if (m) wxs.push(wx({ time: T(+m.time.slice(5, 7), +m.time.slice(8, 10), 9 + rand(8)), cp: SHOPS[rand(SHOPS.length)], fen: Math.round(m.money * 100) }));
          else if (rand(2)) wxs.push(wx({ time: T(mo, 1 + rand(27), 8 + rand(12)), cp: SHOPS[rand(SHOPS.length)] + (rand(3) ? '' : k), fen: 100 + rand(9000) }));
          else alis.push(ali({ time: T(mo, 1 + rand(27), 8 + rand(12)), cp: SHOPS[rand(SHOPS.length)], kind: KINDS[rand(KINDS.length)], fen: 100 + rand(9000), pm: rand(3) ? '余额' : '某虚构卡' + k }));
        }
        // 分分捐：有时候同月追加
        if (rand(2)) { for (let j = 0; j < 2 + rand(3); j++) pettyPool.push(wx({ time: T(10, 1 + pettyPool.length % 28, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 })); wxs.push(...pettyPool); }
        if (rand(3) === 0) { const o = wx({ time: T(mo, 10 + k, 10), cp: '某虚构超市', fen: 5000, status: '已退款¥10.00' }); wxs.push(o, wx({ time: T(mo, 11 + k, 10), cp: '某虚构超市', kind: '某虚构超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: wrno() })); }
        const files = [];
        if (wxs.length) files.push(['微信' + k + '.csv', bill('wechat', wxs)]);
        if (alis.length) files.push(['支付宝' + k + '.csv', bill('alipay', alis)]);
        const r = await tr.importFiles(files, S => {
          (S.plan.sections.newCats || []).forEach(n => { const c = rand(3); if (c === 0) S.edits.newCats[n.name] = { on: true, into: null }; else if (c === 1) S.edits.newCats[n.name] = { on: false, into: '杂项', picked: true }; });
          const it = S.matched.items.filter(x => x.src === 'row' && x.bucket === 'add');
          if (it.length && rand(3) === 0) S.edits.rows[it[rand(it.length)].key] = { exclude: true };
        });
        if (r.result) snaps.push(await tr.dump());
      }
      const logs = await tr.logs();
      if (round % 2 === 0) {
        // 倒序一次撤一个，每一步都回到那次导入前
        let good = true;
        for (let k = logs.length - 1; k >= 0; k--) {
          const { p } = await tr.undo(logs[k].b);
          if (p.chain.length !== 1 || !same(await tr.dump(), snaps[k])) { good = false; console.log('    第 ' + round + ' 轮撤第 ' + (k + 1) + ' 次时对不上'); break; }
        }
        ok(good, '6 第 ' + (round + 1) + ' 轮：导入 ' + logs.length + ' 次，倒序一次撤一个，每一步都和那次导入前逐字节一样');
      } else {
        // 撤中间某一次（连着撤有依赖的），再把剩下的倒序撤完
        const mid = rand(logs.length);
        const p = await tr.undoPlan(logs[mid].b);
        const chainOk = p.chain[p.chain.length - 1] === logs[mid].b && p.chain.every((b, i) => i === 0 || logs.findIndex(l => l.b === b) < logs.findIndex(l => l.b === p.chain[i - 1]));
        await tr.st().undo(p); await tr.idle();
        // 如果连着撤到了最后一次，就该等于 mid 那次导入前
        const covered = logs.slice(mid).every(l => p.chain.includes(l.b));
        const atMid = !covered || same(await tr.dump(), snaps[mid]);
        let rest = await tr.logs();
        while (rest.length) { await tr.undo(rest[rest.length - 1].b); rest = await tr.logs(); }
        console.log('    第 ' + (round + 1) + ' 轮：导入 ' + logs.length + ' 次，撤第 ' + (mid + 1) + ' 次，连带 ' + (p.chain.length - 1) + ' 次，原因 ' + JSON.stringify(Object.values(p.why).map(w => w.map(x => x.why))));
        ok(chainOk && atMid && same(await tr.dump(), snaps[0]), '6 第 ' + (round + 1) + ' 轮：导入 ' + logs.length + ' 次，撤第 ' + (mid + 1) + ' 次（连带 ' + (p.chain.length - 1) + ' 次），再全部撤完：和导入前逐字节一样');
      }
      ok(!tr.errs.length, '6 第 ' + (round + 1) + ' 轮无报错 ' + tr.errs.join('|'));
    }
  }

  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
