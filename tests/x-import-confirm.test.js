// 1016-B 账单导入第一期 ⑥a 导入页（确认页，只看不写）。node x-import-confirm.test.js [index.html]
// jsdom 里跑整个 App：开发入口 → 选文件 → 线程里依次 parse、route、match（假 Worker 跑真的 worker.js）→ 确认页。
// 核对页面上的数字和直接算的一样、差额合计 0 分；在页面上改东西以后汇总跟着变；点导入后账本、单号表、备份逐字节不变；
// 返回键（含进度中）、取消、明细分页、认不出的文件、笔数对不上。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const IDB = require('./helpers/idb');
const { interceptor, makeFakeWorker } = require('./helpers/import-files');
const B = require('./helpers/bills');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile), IMP = path.join(WWW, 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), W = require(path.join(IMP, 'merchants.js'));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch (_) {} await new Promise(r => setTimeout(r, 3)); } return !!fn(); }
const NOW = '2026-10-16T10:00:00';
const ID = 'u1760000000000000011';
const CATS = ['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他'];      // 不是默认那 7 个：老用户
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h || 12, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-03-01 00:00:00', to: '2026-03-31 23:59:59' };
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const rec = (id, d, money, o) => Object.assign({ id, time: `2026-03-${String(d).padStart(2, '0')}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});
// 账本里的手记（虚构）
const RECS = [rec('m1', 1, 15), rec('m2', 2, 15), rec('m3', 4, 15), rec('m4', 5, 15), rec('m5', 8, 30), rec('m6', 7, 200, { cat: '其他' })];
const SEED = () => ({ accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1',
  ['store_' + ID]: JSON.stringify({ archives: { '默认存档': { cats: CATS, records: RECS } }, last: '默认存档', accountName: '小明' }), ['app_time_repaired_' + ID]: '1' });

// 一批虚构账单：微信（早饭 5 天、群收款、提现、相近、没分类的、一对退款）、支付宝（交通出行 4 笔、交易关闭）、一份认不出的
const bf = [1, 2, 3, 4, 5].map(d => wx({ time: T(3, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 }));
const grp = wx({ time: T(3, 6), cp: '某同学', kind: '群收款', io: 'income', fen: 3000, desc: '/' });
const wd = wx({ time: T(3, 7), cp: '零钱', kind: '零钱提现', io: 'neutral', fen: 20000, desc: '提现' });
const near = wx({ time: T(3, 8), cp: '某餐厅', fen: 2800 });
const odd = wx({ time: T(3, 9), cp: '某某', desc: '/', fen: 5000 });
const ref1 = wx({ time: T(3, 10), cp: '某超市', fen: 5000, status: '已全额退款' });
const ref2 = wx({ time: T(3, 11), cp: '某超市', kind: '某超市-退款', io: 'income', fen: 5000, status: '已全额退款', no: '5030000000' + String(++seq).padStart(19, '0') });
const rail = [1, 2, 3, 4].map(i => ali({ time: T(3, 10 + i), cp: '某铁路' + i, kind: '交通出行', fen: 20000 + i }));
const closed = ali({ time: T(3, 20), status: '交易关闭', fen: 999 });
const WX_BYTES = B.bill('wechat', bf.concat([grp, wd, near, odd, ref1, ref2]), { range: RANGE }).bytes;
const ALI_BYTES = B.bill('alipay', rail.concat([closed]), { range: RANGE, encoding: 'gbk' }).bytes;
const BAD_BYTES = new Uint8Array(Buffer.from('交易时间,收/支,金额,说明\r\n2026-03-01 08:00:00,支出,1.00,虚构\r\n'));

async function boot(o) {
  o = o || {};
  const t = { log: [], jsErr: [] };
  const vc = new VirtualConsole(); vc.forwardTo(console, { jsdomErrors: 'none' }); vc.on('jsdomError', e => t.jsErr.push(e.message));
  t.FW = makeFakeWorker(WWW);
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(WWW, t.log)] },
    beforeParse(w) {
      t.phone = IDB.install(w, o.phone);
      Object.entries(o.seed || SEED()).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime(); } };
      w.Worker = t.FW;
      w.__files = [];
      w.Capacitor = { isNativePlatform: () => true, Plugins: {
        Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } },
        App: { addListener(ev, fn) { if (ev === 'backButton') t.backFn = fn; return { remove() {} }; }, exitApp() { t.exited = true; } } } };
    } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  Object.assign(t, { dom, w, d, $, errs, ls: w.localStorage, idle: () => IDB.idle(w) });
  await IDB.idle(w);
  await until(() => t.backFn, 2000);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  t.UI = () => w.JiwenImportUI;
  t.S = () => w.JiwenImportUI._state();
  t.openImport = async () => { $('devImportBtn').click(); await until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick')); };
  t.pick = async (files, wait = true) => {
    const input = $('impFile');
    const list = files.map(([name, bytes]) => new w.File([bytes], name));
    Object.defineProperty(input, 'files', { value: list, configurable: true });
    input.dispatchEvent(new w.Event('change'));
    if (wait) await until(() => $('impGo') && /^导入 \d+ 笔/.test($('impGo').textContent) && $('impBar').style.display === 'flex', 15000);
  };
  t.go = () => $('impGo').textContent;
  t.chip = g => { const c = d.querySelector('#impSummary .imp-chip[data-group="' + g + '"]'); return c ? +c.querySelector('b').textContent : 0; };
  t.select = (sel, v) => { sel.value = v; sel.dispatchEvent(new w.Event('change')); };
  t.snapshot = async () => {
    const db = await IDB.dumpDb(t.phone);
    const ls = {}; for (let i = 0; i < t.ls.length; i++) { const k = t.ls.key(i); ls[k] = t.ls.getItem(k); }
    const n = w.__files.length; $('exportBtn').click(); await until(() => w.__files.length > n);
    if ($('askMask').style.display === 'flex') $('askOk').click();
    const bk = (w.__files[n] || '').replace(/"exportedAt": "[^"]*"/, '');
    return JSON.stringify({ db, ls, bk });
  };
  return t;
}
// 直接算一遍（和页面上用同样的输入），拿来对数
function direct(fileList) {
  const parsed = P.parseFiles(fileList.map(([name, bytes]) => ({ name, data: B.ab(bytes) })));
  const routed = R.route(parsed, { known: {}, rules: [] });
  const manual = RECS.map(r => ({ id: r.id, time: r.time, type: r.type, fen: Math.round(r.money * 100), cat: r.cat, mode: 'normal' }));
  const matched = M.match(routed, parsed, { manual, refundCands: [], cats: CATS, rules: [], isNewUser: false, merchants: W });
  const mb = {}; manual.forEach(m => { mb[m.id] = m; });
  return PL.plan({ parsed, matched, info: { cats: CATS, isNewUser: false }, manualById: mb, overlaps: [] });
}
const FILES = [['微信账单.csv', WX_BYTES], ['支付宝账单.csv', ALI_BYTES], ['看不懂.csv', BAD_BYTES]];

(async () => {
// ===== 1. 完整流程：数字和直接算的一样 =====
const t = await boot();
const before = await t.snapshot();
{
  await t.openImport();
  ok(t.$('impPage').style.display === 'block' && t.$('impArchive').textContent.includes('默认存档'), '1 开发入口打开导入页，写明导入到哪个存档');
  ok(t.log.filter(p => p.startsWith('import/')).join(',') === 'import/import.js,import/plan.js,import/ui.js', '1 打开时才载入导入页的三个文件：' + t.log.filter(p => p.startsWith('import/')).join(','));
  await t.pick(FILES);
  const S = t.S(), want = direct(FILES);
  ok(S && S.phase === 'confirm' && t.$('impProg').style.display === 'none', '1 跑完进度，打开确认页');
  ok(JSON.stringify(S.plan.counts) === JSON.stringify(want.counts) && S.plan.importN === want.importN && S.plan.mergeM === want.mergeM, '1 页面上的方案和直接算的一样：' + JSON.stringify(S.plan.counts));
  ok(t.go() === `导入 ${want.importN} 笔，合并 ${want.mergeM} 笔` && !t.$('impGo').disabled, '1 底部按钮：' + t.go());
  ok(['add', 'merge', 'pending', 'neutral', 'skip'].every(g => t.chip(g) === want.counts[g]) && t.chip('refund') === want.counts.refund, '1 汇总一行的数字对得上');
  const cards = [...t.d.querySelectorAll('#impFiles .imp-card')];
  ok(cards.length === 3 && cards[0].textContent.includes('微信 · 2026-03-01 至 2026-03-31 · 共 11 笔') && cards[1].textContent.includes('支付宝'), '1 每个文件一张卡：来源、时间范围、笔数');
  ok(cards[0].querySelector('.imp-check').className.includes('imp-ok') && cards[0].querySelector('.imp-check').textContent.includes('一致'), '1 笔数核对：一致');
  cards[0].querySelector('.imp-diff-toggle').click();
  const dl = t.d.querySelector('#impFiles .imp-card .imp-diff-expense').textContent;
  ok(dl.startsWith('账单支出 ') && dl.includes('和手记合并 60.00') && dl.includes('待你确认 28.00') && dl.endsWith('合计差 0.00'), '1 差额拆开：' + dl);
  ok(t.d.querySelector('#impFiles .imp-diff-income').textContent.includes('退款 50.00'), '1 收入那边拆出退款');
  ok(cards[2].textContent.includes('认不出这个文件') && cards[2].textContent.includes('读到的表头：交易时间，收/支，金额，说明'), '1 认不出的文件：显示读到的表头');
  cards[2].querySelector('.imp-copy').click(); await until(() => t.UI()._lastCopy);
  const cp = t.UI()._lastCopy;
  ok(cp.includes('表头：交易时间 | 收/支 | 金额 | 说明') && cp.includes('群收款') && !/\d+\.\d\d|青禾|某超市|4200000|看不懂/.test(cp), '1 复制给开发者：只有表头、类型、状态，不带金额、对方、单号、文件名');
  if (t.$('askMask').style.display === 'flex') t.$('askOk').click();
  ok(t.$('impTypes') && t.$('impTypes').textContent.includes('群收款'), '1 没见过的交易类型：问一次');
  ok(t.$('impNewCats') && t.$('impNewCats').textContent.includes('交通出行') && !t.$('impNewCats').querySelector('input').checked, '1 新建分类：老用户默认不勾');
  ok(t.$('impCpGroups') && [...t.$('impCpGroups').querySelectorAll('.imp-row-opt')].some(r => r.dataset.cp === '某某'), '1 未分类按对方归组');
  ok(t.$('impNotes') && t.$('impNotes').textContent.includes('撞上了'), '1 提个醒：不计入的提现和同金额的普通手记撞上了');
  ok(t.$('impStorage').textContent.includes('MB'), '1 存储预检：' + t.$('impStorage').textContent);
}

// ===== 2. 在页面上改东西：汇总跟着变 =====
{
  const N0 = t.S().plan.importN, M0 = t.S().plan.mergeM;
  t.$('impDetailsToggle').click();
  t.$('impG-add').click();
  const oddRow = [...t.d.querySelectorAll('.imp-list[data-group="add"] .al-row')].find(r => r.textContent.includes('某某'));
  ok(!!oddRow, '2 展开「新增」能看到那一行');
  oddRow.click();
  ok(t.$('impSheetMask').style.display === 'flex' && t.$('impSheet').textContent.includes('某某'), '2 点一行打开详情');
  t.select(t.d.querySelector('#impSheet .imp-row-cat'), '购物');
  ok(t.S().plan.groups.add.find(d => d.cp === '某某').cat === '购物' && ![...t.$('impCpGroups') ? t.$('impCpGroups').querySelectorAll('.imp-row-opt') : []].some(r => r.dataset.cp === '某某'), '2 详情里改分类：这行变成购物，不再出现在按对方选分类里');
  t.$('impExclude').click();
  ok(t.S().plan.importN === N0 - 1 && t.go() === `导入 ${N0 - 1} 笔，合并 ${M0} 笔` && t.chip('excluded') === 1, '2 勾掉一笔：按钮变成 ' + t.go());
  ok(t.d.querySelector('#impFiles .imp-diff-expense').textContent.includes('你勾掉的 50.00') && t.d.querySelector('#impFiles .imp-diff-expense').textContent.endsWith('合计差 0.00'), '2 差额里多出「你勾掉的」，合计照样差 0');
  t.$('impRestore').click();
  ok(t.S().plan.importN === N0, '2 恢复：按钮回到 ' + t.go());
  t.$('impSheetClose').click();
  // 待你确认：选合并对象
  t.$('impG-pending').click();
  const nk = t.S().plan.groups.pending.find(d => d.cp === '某餐厅').key;
  const nr = [...t.d.querySelectorAll('.imp-list[data-group="pending"] .al-row')].find(r => r.dataset.key === nk);
  nr.click();
  const pickBtn = t.d.querySelector('#impSheet .imp-pick');
  ok(pickBtn && pickBtn.textContent === '和这条合并', '2 待你确认的详情里列出候选手记');
  pickBtn.click();
  ok(t.S().plan.mergeM === M0 + 1 && t.chip('merge') === M0 + 1 && t.go().endsWith(`合并 ${M0 + 1} 笔`), '2 选了合并对象：合并 +1');
  t.$('impSheetClose').click();
  // 新建分类勾上
  const nc = t.$('impNewCats').querySelector('input'); nc.click();
  ok(t.S().plan.groups.add.filter(d => d.cat === '交通出行').length === 4, '2 勾上新建「交通出行」：那 4 笔跟着变');
  // 没见过的类型：选「当转账」→ 重算，群收款挪到不计入
  const nb = t.S().plan.counts.neutral;
  t.select(t.d.querySelector('.imp-type-sel'), 'transfer');
  await until(() => t.S().plan && t.S().plan.counts.neutral === nb + 1);
  ok(t.S().plan.counts.neutral === nb + 1 && t.S().plan.groups.neutral.some(d => d.kind === '群收款'), '2 群收款选「当转账」：重新算，挪进不计入');
  ok(t.S().plan.mergeM === M0 + 1 && t.S().plan.groups.add.filter(d => d.cat === '交通出行').length === 4, '2 重算以后，之前的改动照样套回去');
}

// ===== 3. 点导入：只提示开发中，什么都不改 =====
{
  t.$('impGo').click();
  ok(t.$('askMask').style.display === 'flex' && t.$('askMsg').textContent.includes('开发中，这一版不写入'), '3 点导入：弹「开发中，这一版不写入」');
  t.$('askOk').click();
  t.$('impCancel').click();
  ok(t.$('impPage').style.display === 'none' && t.$('impBar').style.display === 'none', '3 取消：导入页关掉');
  await t.idle();
  const after = await t.snapshot();
  ok(after === before, '3 账本库、单号表、localStorage、导出的备份和打开导入前逐字节一样');
  ok(!t.errs.length, '1-3 无报错 ' + t.errs.join('|'));
}

// ===== 4. 返回键 =====
{
  await t.openImport();
  await t.pick(FILES);
  t.$('impDetailsToggle').click(); t.$('impG-add').click();
  t.d.querySelector('.imp-list[data-group="add"] .al-row').click();
  ok(t.$('impSheetMask').style.display === 'flex', '4 打开一行的详情');
  t.backFn();
  ok(t.$('impSheetMask').style.display === 'none' && t.$('impPage').style.display === 'block', '4 返回键先关详情，导入页还在');
  await new Promise(r => setTimeout(r, 150));     // 返回键防抖
  t.backFn();
  ok(t.$('impPage').style.display === 'none' && !t.UI()._state(), '4 再按返回：导入页关掉（等于取消）');
  ok(!t.exited, '4 没有退出 App');
  // 进度中按返回：停掉线程
  await new Promise(r => setTimeout(r, 150));
  await t.openImport();
  let release;
  const real = t.w.JiwenImportStore.knownFor;
  t.w.JiwenImportStore.knownFor = (...a) => new Promise(r => { release = () => r(real.apply(t.w.JiwenImportStore, a)); });
  const nw = t.FW.created.length;
  await t.pick(FILES, false);
  await until(() => release && t.$('impProg').style.display === 'flex');
  ok(t.$('impProg').style.display === 'flex' && t.$('impProgText').textContent.includes('查以前导入过的'), '4 进度停在「查以前导入过的…」');
  t.backFn();
  ok(t.$('impPage').style.display === 'none' && t.$('impProg').style.display === 'none', '4 进度中按返回：进度和导入页都关掉');
  ok(t.FW.created.slice(0, Math.max(nw, t.FW.created.length)).every(x => x.terminated), '4 线程停掉了（terminate）');
  release(); await new Promise(r => setTimeout(r, 200));
  ok(t.$('impPage').style.display === 'none' && t.$('impBar').style.display === 'none', '4 后面的计算回来了也不会再把页面打开');
  t.w.JiwenImportStore.knownFor = real;
  // 取消以后再导一次：正常
  await new Promise(r => setTimeout(r, 150));
  await t.openImport(); await t.pick(FILES);
  ok(t.S().phase === 'confirm' && t.go().startsWith('导入 '), '4 取消以后再导一次：正常');
  t.$('impBack').click();
  ok(t.$('impPage').style.display === 'none', '4 顶上「‹ 取消」关掉导入页');
  ok(!t.errs.length, '4 无报错 ' + t.errs.join('|'));
}

// ===== 5. 笔数对不上：变红，按钮不可点 =====
{
  await t.openImport();
  await t.pick([['支付宝.csv', B.bill('alipay', rail, { range: RANGE, statsOverride: { total: 9 } }).bytes]]);
  const chk = t.d.querySelector('#impFiles .imp-check');
  ok(chk.className.includes('imp-bad') && chk.textContent.includes('对不上') && t.$('impGo').disabled, '5 笔数对不上：那一行变红，导入按钮不可点');
  t.$('impGo').click();
  ok(t.$('askMask').style.display !== 'flex', '5 点了也没反应');
  t.$('impCancel').click();
}

// ===== 6. 明细分页 =====
{
  const many = []; for (let i = 0; i < 120; i++) many.push(wx({ time: T(3, 1 + i % 28, 9 + i % 12, i % 60), cp: '某商户' + (i % 7), fen: 100 + i }));
  await t.openImport();
  await t.pick([['多.csv', B.bill('wechat', many, { range: RANGE }).bytes]]);
  t.$('impDetailsToggle').click(); t.$('impG-add').click();
  const rows = () => t.d.querySelectorAll('.imp-list[data-group="add"] .al-row').length;
  const total = t.S().plan.counts.add;
  ok(total > 100 && rows() === 50, '6 「新增」' + total + ' 笔，先只显示 50 行');
  t.d.querySelector('.imp-more[data-group="add"]').click();
  ok(rows() === 100, '6 点「再显示」：100 行');
  t.d.querySelector('.imp-more[data-group="add"]').click();
  ok(rows() === total && !t.d.querySelector('.imp-more[data-group="add"]'), '6 再点：全部显示，按钮没了');
  t.$('impCancel').click();
  ok(!t.errs.length && !t.jsErr.length, '5-6 无报错 ' + t.errs.concat(t.jsErr).join('|'));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
