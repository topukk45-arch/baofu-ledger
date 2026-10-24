// 1016-B 账单导入第一期 ⑥a 导入页（确认页，只看不写）。node x-import-confirm.test.js [index.html]
// jsdom 里跑整个 App：开发入口 → 选文件 → 线程里依次 parse、route、match（假 Worker 跑真的 worker.js）→ 确认页。
// 核对页面上的数字和直接算的一样、差额合计 0 分；在页面上改东西以后汇总跟着变；点导入后账本、单号表、备份逐字节不变；
// 返回键（含进度中）、取消、明细分页、认不出的文件、笔数对不上。账单、手记全是虚构的。
const H = require('./helpers/app');   // 1017-UI2：确认页分步了，按编号找东西时走到那一步；导入 / 取消多点一下确认
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
const RECS = [rec('m1', 1, 15), rec('m2', 2, 15), rec('m3', 4, 15), rec('m4', 5, 15), rec('m5', 8, 30, { cat: '购物' }), rec('m6', 7, 200, { cat: '其他' })];   // 1.1 起金额相近、分类对得上的会自动合并；这里要的是「待你确认」，分类故意不一样
const SEED = () => ({ accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1',
  ['store_' + ID]: JSON.stringify({ archives: { '默认存档': { cats: CATS, records: RECS } }, last: '默认存档', accountName: '小明' }), ['app_time_repaired_' + ID]: '1' });

// 一批虚构账单：微信（早饭 5 天、群收款、提现、相近、没分类的、一对退款）、支付宝（交通出行 4 笔、交易关闭）、一份认不出的
const bf = [1, 2, 3, 4, 5].map(d => wx({ time: T(3, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 }));
const grp = wx({ time: T(3, 6), cp: '某同学', kind: '群收款', io: 'income', fen: 3000, desc: '/' });
const wd = wx({ time: T(3, 7), cp: '零钱', kind: '零钱提现', io: 'neutral', fen: 20000, desc: '提现' });
const near = wx({ time: T(3, 8), cp: '某餐厅', fen: 2800 });
const odd = wx({ time: T(3, 9), cp: '某某', desc: '/', fen: 5000 });
const ref1 = wx({ time: T(3, 10), cp: '某超市', fen: 5000, status: '已退款¥10.00' });
const ref2 = wx({ time: T(3, 11), cp: '某超市', kind: '某超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: '5030000000' + String(++seq).padStart(19, '0') });
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
  const w = dom.window, d = w.document, $ = H.stepGet(w);
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
    if (wait) await until(() => $('impGo') && /^(导入 \d+ 条|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex', 15000);
    if (wait) t.w.JiwenImportUI._goStep('check');   // 1017-UI2：从第 1 步开始看（等按钮时走到了总览）
  };
  t.go = () => $('impGo').textContent;
  t.chip = g => { t.$('impSummary'); const c = d.querySelector('#impSummary .imp-chip[data-group="' + g + '"]'); return c ? +c.querySelector('b').textContent : 0; };
  t.select = (sel, v) => { sel.value = v; sel.dispatchEvent(new w.Event('change')); };
  t.snapshot = async () => {
    const db = await IDB.dumpDb(t.phone);
    // 1019-M 的性能记录（开发开关里、只是计时，不是账本数据）不算进来；其余照旧逐字节比
    const ls = {}; for (let i = 0; i < t.ls.length; i++) { const k = t.ls.key(i); if (k !== 'app_perf_log') ls[k] = t.ls.getItem(k); }
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
  ok(t.log.filter(p => p.startsWith('import/')).join(',') === 'import/import.js,import/plan.js,import/write.js,import/undo.js,import/route.js,import/pending.js,import/vendor/tiny-inflate.js,import/unzip.js,import/ai.js,import/ui.js', '1 打开时才载入导入页的十个文件（1016-N 加 route.js、pending.js，1016-Z8 加 tiny-inflate.js、unzip.js，1017-H 加 ai.js）：' + t.log.filter(p => p.startsWith('import/')).join(','));
  await t.pick(FILES);
  const S = t.S(), want = direct(FILES);
  ok(S && S.phase === 'confirm' && t.$('impProg').style.display === 'none', '1 跑完进度，打开确认页');
  ok(JSON.stringify(S.plan.counts) === JSON.stringify(want.counts) && S.plan.importN === want.importN && S.plan.mergeM === want.mergeM, '1 页面上的方案和直接算的一样：' + JSON.stringify(S.plan.counts));
  ok(t.go() === `导入 ${want.records} 条` + (want.mergeM ? `，合并 ${want.mergeM} 笔` : '') && !t.$('impGo').disabled, '1 底部按钮：' + t.go());
  ok(['add', 'merge', 'pending', 'neutral', 'skip'].every(g => t.chip(g) === want.counts[g]) && t.chip('refund') === want.counts.refund, '1 汇总一行的数字对得上');
  t.UI()._goStep('check');   // 1017-UI2：文件卡（来源、时间范围、笔数核对）在第 1 步「核对」
  let cards = [...t.d.querySelectorAll('#impFiles .imp-card')];
  ok(cards.length === 3 && cards[0].textContent.includes('微信 · 2026-03-01 至 2026-03-31 · 共 11 笔') && cards[1].textContent.includes('支付宝'), '1 每个文件一张卡：来源、时间范围、笔数');
  ok(cards[0].querySelector('.imp-check').className.includes('imp-ok') && cards[0].querySelector('.imp-check').textContent.includes('一致'), '1 笔数核对：一致');
  t.UI()._goStep('overview');   // 1017-UI2：差额拆开在最后一步「总览」
  t.d.querySelector('#impFiles .imp-card .imp-diff-toggle').click();
  const dl = t.d.querySelector('#impFiles .imp-card .imp-diff-expense').textContent;
  ok(dl.startsWith('账单支出 ') && dl.includes('和手记合并 60.00') && dl.includes('待你确认 28.00') && dl.endsWith('合计差 0.00'), '1 差额拆开：' + dl);
  ok(t.d.querySelector('#impFiles .imp-diff-income').textContent.includes('退款 10.00'), '1 收入那边拆出退款');
  t.UI()._goStep('check'); cards = [...t.d.querySelectorAll('#impFiles .imp-card')];
  ok(cards[2].textContent.includes('认不出这个文件') && cards[2].textContent.includes('读到的表头：交易时间，收/支，金额，说明'), '1 认不出的文件：显示读到的表头');
  cards[2].querySelector('.imp-copy').click(); await until(() => t.UI()._lastCopy);
  const cp = t.UI()._lastCopy;
  ok(cp.includes('表头：交易时间 | 收/支 | 金额 | 说明') && cp.includes('群收款') && !/\d+\.\d\d|青禾|某超市|4200000|看不懂/.test(cp), '1 复制给开发者：只有表头、类型、状态，不带金额、对方、单号、文件名');
  if (t.$('askMask').style.display === 'flex') t.$('askOk').click();
  ok(t.$('impTypes') && t.$('impTypes').textContent.includes('群收款'), '1 没见过的交易类型：问一次');
  ok(t.$('impNewCats') && t.$('impNewCats').textContent.includes('交通出行') && t.$('impNewCats').querySelector('input').checked, '1 新建分类：交通出行 4 笔（至少 3 笔），默认勾上（2b 起新老用户一样）');
  // 1021-T14：只有 1 笔的对方不列组，写一句「其余 N 笔照推荐入账、标「待确认分类」」
  ok(t.$('impCpRest') && /照推荐入账、标「待确认分类」/.test(t.$('impCpRest').textContent), '1 未分类按对方归组：一笔的不列组，写去处');
  ok(t.$('impNotes') && t.$('impNotes').textContent.includes('撞上了'), '1 提个醒：不计的提现和同金额的普通手记撞上了');
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
  ok((t.d.getElementById('impSheet') && t.d.getElementById('uiSheetMask').classList.contains('open')) && t.$('impSheet').textContent.includes('某某'), '2 点一行打开详情');
  t.select(t.d.querySelector('#impSheet .imp-row-cat'), '购物');
  t.$('impSheetOk').click();      // 1017-UI10：详情里的改动点「确定」才生效
  const reopen = () => { const S0 = t.S(); Object.keys(S0.plan.groups).forEach(g => { S0.view.open[g] = true; }); t.w.JiwenImportUI._goStep('overview'); [...t.d.querySelectorAll('.imp-list[data-group] .al-row')].find(x => x.textContent.includes('某某')).click(); };
  ok(t.S().plan.groups.add.find(d => d.cp === '某某').cat === '购物' && ![...t.$('impCpGroups') ? t.$('impCpGroups').querySelectorAll('.imp-row-opt') : []].some(r => r.dataset.cp === '某某'), '2 详情里改分类：这行变成购物，不再出现在按对方选分类里');
  reopen(); t.$('impExclude').click(); t.$('impSheetOk').click();
  ok(t.S().plan.importN === N0 - 1 && t.go() === `导入 ${t.S().plan.records} 条` + (M0 ? `，合并 ${M0} 笔` : '') && t.chip('excluded') === 1, '2 勾掉一笔：按钮变成 ' + t.go());
  ok(t.d.querySelector('#impFiles .imp-diff-expense').textContent.includes('你勾掉的 50.00') && t.d.querySelector('#impFiles .imp-diff-expense').textContent.endsWith('合计差 0.00'), '2 差额里多出「你勾掉的」，合计照样差 0');
  reopen(); t.$('impRestore').click(); t.$('impSheetOk').click();
  ok(t.S().plan.importN === N0, '2 恢复：按钮回到 ' + t.go());
  // 待你确认：选合并对象
  if (!t.S().view.open.pending) t.$('impG-pending').click();
  const nk = t.S().plan.groups.pending.find(d => d.cp === '某餐厅').key;
  const nr = [...t.d.querySelectorAll('.imp-list[data-group="pending"] .al-row')].find(r => r.dataset.key === nk);
  nr.click();
  const pickBtn = t.d.querySelector('#impSheet .imp-pick');
  ok(pickBtn && pickBtn.textContent === '选这个', '2 待你确认的详情里列出候选手记（1017-UI8 起按钮统一叫「选这个」）');
  pickBtn.click(); t.$('impSheetOk').click();
  ok(t.S().plan.mergeM === M0 + 1 && t.chip('merge') === M0 + 1 && t.go().endsWith(`合并 ${M0 + 1} 笔`), '2 选了合并对象：合并 +1');
  // 新建分类：2b 起至少 3 笔默认就勾上；勾掉再勾上，那 4 笔跟着变
  const nc = t.$('impNewCats').querySelector('input'); nc.click(); t.$('impNewCats').querySelector('input').click();
  ok(t.S().plan.groups.add.filter(d => d.cat === '交通出行').length === 4, '2 新建「交通出行」勾着：那 4 笔跟着变');
  // 没见过的类型：选「当转账」→ 重算，群收款挪到不计
  const nb = t.S().plan.counts.neutral;
  t.w.JiwenImportUI._goStep('overview');      // 2a：没见过的类型收进总览的「提醒」
  t.select(t.d.querySelector('.imp-type-sel'), 'transfer');
  await until(() => t.S().plan && t.S().plan.counts.neutral === nb + 1);
  ok(t.S().plan.counts.neutral === nb + 1 && t.S().plan.groups.neutral.some(d => d.kind === '群收款'), '2 群收款选「当转账」：重新算，挪进不计');
  ok(t.S().plan.mergeM === M0 + 1 && t.S().plan.groups.add.filter(d => d.cat === '交通出行').length === 4, '2 重算以后，之前的改动照样套回去');
}

// ===== 3. 不点导入、直接取消：什么都不改（1016-F 起点导入会真写，见 z-import-write）=====
{
  H.clickCancel(t.w);
  ok(t.$('impPage').style.display === 'none' && t.$('impBar').style.display === 'none', '3 取消：导入页关掉');
  await t.idle();
  const after = await t.snapshot();
  ok(after === before, '3 只看不导：账本库、单号表、localStorage、导出的备份和打开导入前逐字节一样');
  ok(!t.errs.length, '1-3 无报错 ' + t.errs.join('|'));
}

// ===== 4. 返回键 =====
{
  await t.openImport();
  await t.pick(FILES);
  t.$('impDetailsToggle').click(); t.$('impG-add').click();
  t.d.querySelector('.imp-list[data-group="add"] .al-row').click();
  ok((t.d.getElementById('impSheet') && t.d.getElementById('uiSheetMask').classList.contains('open')), '4 打开一行的详情');
  t.backFn();
  ok(!(t.d.getElementById('impSheet') && t.d.getElementById('uiSheetMask').classList.contains('open')) && t.$('impPage').style.display === 'block', '4 返回键先关详情，导入页还在');
  // 1017-UI2 起确认页分步：返回键一步一步往回退，第 1 步再按先问「退出这次导入？」，点「退出」才回到选文件页（原来是直接关掉导入页）
  const steps = t.S().view.steps.length;
  for (let i = 1; i < steps; i++) { await new Promise(r => setTimeout(r, 150)); t.backFn(); }
  ok(t.S().view.step === 'check' && t.$('impPage').style.display === 'block', '4 再按返回：一步一步退回第 1 步，导入页还在');
  await new Promise(r => setTimeout(r, 150)); t.backFn();
  ok(t.$('uiSheetMask').classList.contains('open') && t.$('uiSheetTitle').textContent === '退出这次导入？' && t.S().phase === 'confirm', '4 第 1 步再按返回：先问一句，什么都没丢');
  t.$('impExitOk').click();
  ok(t.$('impPage').style.display === 'block' && t.$('impPick') && t.S().phase === 'pick' && !t.S().plan, '4 点「退出」：回到选文件页，这次的方案不要了');
  await new Promise(r => setTimeout(r, 150)); t.backFn();
  ok(t.$('impPage').style.display === 'none' && !t.UI()._state(), '4 选文件页再按返回：导入页关掉');
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
  // 1017-UI2：文件选好了还在算的时候按返回，也先问一句；点「退出」才停掉、回到选文件页（原来是直接关掉导入页）
  t.backFn();
  ok(t.$('uiSheetMask').classList.contains('open') && t.$('uiSheetTitle').textContent === '退出这次导入？', '4 进度中按返回：先问一句');
  t.$('impExitOk').click();
  ok(t.$('impProg').style.display === 'none' && t.$('impPick') && t.S().phase === 'pick', '4 点「退出」：进度关掉，回到选文件页');
  ok(t.FW.created.slice(0, Math.max(nw, t.FW.created.length)).every(x => x.terminated), '4 线程停掉了（terminate）');
  release(); await new Promise(r => setTimeout(r, 200));
  ok(t.S().phase === 'pick' && t.$('impPick') && t.$('impBar').style.display === 'flex' && !t.$('impGo'), '4 后面的计算回来了也不会再打开确认页');
  t.UI().close();
  t.w.JiwenImportStore.knownFor = real;
  // 取消以后再导一次：正常
  await new Promise(r => setTimeout(r, 150));
  await t.openImport(); await t.pick(FILES);
  ok(t.S().phase === 'confirm' && t.go().startsWith('导入 '), '4 取消以后再导一次：正常');
  t.$('impBack').click();
  ok(t.$('impPage').style.display === 'block' && t.$('uiSheetMask').classList.contains('open'), '4 顶上「‹ 取消」：有方案时先问一句（1017-UI2）');
  t.$('impExitOk').click();
  ok(t.$('impPage').style.display === 'none', '4 点「退出」才关掉导入页');
  ok(!t.errs.length, '4 无报错 ' + t.errs.join('|'));
}

// ===== 5. 笔数对不上：变红，按钮不可点 =====
{
  await t.openImport();
  await t.pick([['支付宝.csv', B.bill('alipay', rail, { range: RANGE, statsOverride: { total: 9 } }).bytes]]);
  const chk = t.d.querySelector('#impFiles .imp-check');
  ok(chk.className.includes('imp-bad') && chk.textContent.includes('对不上') && t.$('impGo').disabled, '5 笔数对不上：那一行变红，导入按钮不可点');
  H.clickGo(t.w);
  ok(t.$('askMask').style.display !== 'flex', '5 点了也没反应');
  H.clickCancel(t.w);
}

// ===== 6. 明细分页（1021-T17：一组超过 20 笔按分类再分一层，一类一行默认收起，点开组内每页 50 笔、翻页）=====
{
  const many = []; for (let i = 0; i < 120; i++) many.push(wx({ time: T(3, 1 + i % 28, 9 + i % 12, i % 60), cp: '某商户' + (i % 7), fen: 100 + i }));
  await t.openImport();
  await t.pick([['多.csv', B.bill('wechat', many, { range: RANGE }).bytes]]);
  t.$('impDetailsToggle').click(); t.$('impG-add').click();
  const rows = () => t.d.querySelectorAll('.imp-list[data-group="add"] .al-row').length;
  const total = t.S().plan.counts.add;
  const cgs = () => [...t.d.querySelectorAll('.imp-cgs[data-list="det-add"] .imp-cg')];
  ok(total > 100 && rows() === 0 && cgs().length >= 1 && /笔 · 共 .* 元/.test(cgs()[0].textContent), '6 「新增」' + total + ' 笔：先只列分类一行一组，不铺开：' + (cgs()[0] && cgs()[0].textContent));
  const big = cgs().find(h => +((/ (\d+) 笔/.exec(h.textContent) || [])[1]) > 50);
  ok(!!big, '6 有一类超过 50 笔');
  const nm = big.dataset.cg, n = +(/ (\d+) 笔/.exec(big.textContent))[1];
  big.click();
  ok(rows() === 50 && t.d.querySelector('.imp-pager .imp-pg-next') && !t.d.querySelector('.imp-pager .imp-pg-next').disabled && t.d.querySelector('.imp-pager .imp-pg-prev').disabled, '6 点开这一类：50 行一页、能翻下一页');
  t.d.querySelector('.imp-pager .imp-pg-next').click();
  ok(rows() === Math.min(50, n - 50) && /2 \/ /.test(t.d.querySelector('.imp-pg-n').textContent), '6 翻到第 2 页');
  cgs().find(h => h.dataset.cg === nm).click();
  ok(rows() === 0, '6 再点这一类收起来');
  // 1021-T17：总览「分组明细」点一个打开「这几笔」面板：按时间排、每页 50、能翻页、点一笔开详情、关了详情回到面板
  t.d.querySelector('#impSummary .imp-chip[data-group="add"]').click();
  const rs = () => [...t.d.querySelectorAll('#impRows .imp-rs')];
  ok(t.$('uiSheetMask').classList.contains('open') && rs().length === 50 && t.$('impRowsPager') && /共 .* 元 · 按时间排/.test(t.$('uiSheetSub').textContent), '6 「这几笔」面板：50 笔一页：' + t.$('uiSheetSub').textContent);
  const ts = rs().map(r => r.querySelector('small').textContent);
  ok(ts.every((x, i) => !i || ts[i - 1] <= x), '6 面板里按时间排');
  t.$('impRowsPager').querySelector('.imp-pg-next').click();
  ok(rs().length === 50 && /第 2 \/ 3 页/.test(t.$('uiSheetSub').textContent), '6 面板翻到第 2 页');
  rs()[0].click();
  ok(t.$('impSheet') && t.$('impSheetClose'), '6 点一笔打开详情');
  t.$('impSheetClose').click();
  ok(t.$('impRows') && /第 2 \/ 3 页/.test(t.$('uiSheetSub').textContent), '6 关了详情回到面板同一页');
  t.$('impRowsClose').click();
  H.clickCancel(t.w);
  ok(!t.errs.length && !t.jsErr.length, '5-6 无报错 ' + t.errs.concat(t.jsErr).join('|'));
}

// ===== 7. 1016-C：多笔合一、几笔抢一条手记、转账往来、合并记录一行、最像、套话、全额退款提醒、存储文案 =====
{
  const R7 = [rec('g4', 1, 4, { cat: '其他' }), rec('m16', 25, 16), rec('b20', 5, 19.5, { time: '2026-03-05T19:09' }), rec('f20', 9, 19.8, { time: '2026-03-09T12:00' }),
              rec('m50', 14, 50, { cat: '其他' })];
  const seed = SEED(); seed['store_' + ID] = JSON.stringify({ archives: { '默认存档': { cats: CATS, records: R7 } }, last: '默认存档', accountName: '小明' });
  const game = [9, 10, 11, 12].map(h => wx({ time: T(3, 1, h), cp: '某虚构游戏', desc: '游戏充值', fen: 100 }));
  const four = [1520, 1580, 1630, 1660].map((f, i) => wx({ time: T(3, 25, 9 + i), cp: '虚构小店' + i, fen: f }));
  const noodle = wx({ time: T(3, 5, 19, 8), cp: '某虚构面馆', fen: 1980 });
  const gift = [[20, 'expense', '某亲戚甲', 20000], [20, 'income', '某亲戚甲', 20000], [21, 'income', '某亲戚乙', 50000], [22, 'expense', '某亲戚乙', 30000]]
    .map(([d, io, cp, fen], i) => wx({ time: T(3, d, 9 + i), kind: '转账', cp, io, fen, desc: '转账备注:微信转账' }));
  const shop = wx({ time: T(3, 21, 15), cp: '虚构*数码科技旗舰店', fen: 9900 });
  const petty = Array.from({ length: 25 }, (_, i) => wx({ time: T(3, 1 + i, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 }));
  const fo = wx({ time: T(3, 15, 12), cp: '某虚构饭店', fen: 5000, status: '已全额退款' });
  const fr = wx({ time: T(3, 15, 14), cp: '某虚构饭店', kind: '某虚构饭店-退款', io: 'income', fen: 5000, status: '已全额退款', no: '5030000000' + String(++seq).padStart(19, '0') });
  const bytes = B.bill('wechat', game.concat(four, [noodle], gift, [shop], petty, [fo, fr]), { range: RANGE }).bytes;
  const t = await boot({ seed });
  Object.defineProperty(t.w.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 2048 * 1048576, usage: 0 }) } });
  await t.openImport();
  await t.pick([['微信账单.csv', bytes]]);
  const S = t.S(), keyOf = x => S.matched.items.find(it => it.src === 'row' && S.parsed.files[0].rows[it.row].no === x.no).key;
  // 多笔合一：一键合并
  const sumCard = t.$('impSums');
  ok(sumCard && sumCard.textContent.includes('这 4 笔加起来正好是你记的 4.00 元'), '7 多笔合一的卡片：这 4 笔加起来正好是你记的 4.00 元');
  const merge0 = t.S().plan.mergeM;
  sumCard.querySelector('.imp-sum-pick').click();
  ok(t.S().plan.mergeM === merge0 + 4 && t.$('impSums').textContent.includes('✓ 已选：这 4 笔加起来') && t.go().includes('合并 ' + (merge0 + 4) + ' 笔'), '7 一键合并：底部按钮上合并 +4');
  t.$('impSums').querySelector('.imp-sum-undo').click();
  ok(t.S().plan.mergeM === merge0, '7 撤回');
  // 几笔抢一条手记
  const pgc = t.$('impPendGroups');
  ok(pgc && pgc.textContent.includes('你记的 16.00 元，可能是下面 4 笔中的一笔'), '7 按手记归组：你记的 16.00 元，可能是下面 4 笔中的一笔');
  pgc.querySelector('.imp-sub-row[data-key="' + keyOf(four[1]) + '"] .imp-pg-pick').click();
  const p1 = t.S().plan, grp = k => p1.rows.find(d => d.key === k).group;
  ok(grp(keyOf(four[1])) === 'merge' && [0, 2, 3].every(i => grp(keyOf(four[i])) === 'add'), '7 选这一笔：合并，其余自动新增');
  t.$('impPendGroups').querySelector('.imp-pg-undo').click();
  t.$('impPendGroups').querySelector('.imp-pg-none').click();
  ok(four.every(x => t.S().plan.rows.find(d => d.key === keyOf(x)).group === 'add'), '7 都不是：全部新增');
  // 转账往来：一键不计
  const tc = t.$('impTransfers');
  ok(tc && tc.querySelectorAll('.imp-tr-cb').length === 4 && !tc.textContent.includes('数码科技'), '7 转账往来：4 笔，长名带 * 的商户不在里面');
  tc.querySelector('.imp-tr-all').click();
  const p2 = t.S().plan, f0 = p2.files[0].diff;
  ok(t.$('impTransfers').querySelectorAll('.imp-tr-cb:checked').length === 4 && f0.expense.unreadable === 0 && f0.income.unreadable === 0
     && f0.expense.parts.find(x => x.key === 'neutral').fen === 50000, '7 一键都标成不计：勾上 4 笔，差额照样 0 分');
  ok(p2.rows.find(d => d.key === keyOf(shop)).mode === 'normal', '7 长名带 * 的商户没被标成不计');
  ok([...t.$('impTransfers').querySelectorAll('.imp-switch')].length === 4 && [...t.$('impTransfers').querySelectorAll('.imp-switch')].every(x => x.classList.contains('on')), '7 行尾是开关，都打开了（1016-H）');
  ok([...t.$('impTransfers').querySelectorAll('.imp-tr-state')].every(x => x.textContent === '不计') && t.chip('neutral') === p2.counts.neutral && p2.counts.neutral >= 4, '7 勾上的行尾写「不计」，顶上「不计」的笔数跟着变（1016-G）');
  ok(!(t.$('impCpGroups') && /某亲戚/.test(t.$('impCpGroups').textContent)), '7 转账往来里的人不再出现在按对方选分类里（1016-G）');
  // 明细：分分捐一行、套话显示对方
  t.$('impDetailsToggle').click();
  t.d.querySelector('.imp-gh[data-group="add"]').click();
  const sr = t.d.querySelector('.imp-sum-row');
  ok(sr && sr.textContent.includes('分分捐 · 3 月 · 25 笔 · 0.25 元') && t.d.querySelectorAll('.imp-list[data-group="add"] .al-row').length < 25, '7 分分捐在明细里一行');
  sr.click();
  ok(t.d.querySelectorAll('.imp-members .imp-sub-row').length === 25, '7 点开看 25 笔');
  t.d.querySelector('.imp-gh[data-group="neutral"]').click();     // 1016-G：标成不计的挪进了「不计」组
  const giftRow = t.d.querySelector('.al-row[data-key="' + keyOf(gift[0]) + '"]');
  ok(giftRow && giftRow.querySelector('.al-remark').textContent === '某亲戚甲', '7 「转账备注:微信转账」不当标题，显示交易对方');
  ok(giftRow && !giftRow.querySelector('.cat-tag') && !/[−+]/.test(giftRow.querySelector('.al-amt').textContent), '7 不计的行：不显示分类，金额不带正负号（1016-G）');
  // 候选：最像排第一，其他收起
  t.d.querySelector('.imp-gh[data-group="pending"]').click();
  t.d.querySelector('.al-row[data-key="' + keyOf(noodle) + '"]').click();
  const sh = t.$('impSheet');
  ok(sh.querySelector('.imp-best') && sh.querySelectorAll('.imp-pick').length === 1 && sh.querySelector('.imp-more-cands').textContent.includes('其他 1 条'), '7 候选第一条标「最像」，其余收起');
  ok(sh.querySelector('.pc').textContent.includes('19.50'), '7 最像的是 19:09 的 19.50（不是 4 天外的 19.80）');
  sh.querySelector('.imp-more-cands').click();
  ok(t.$('impSheet').querySelectorAll('.imp-pick').length === 2, '7 点开「其他 1 条」');
  ok(t.$('impTrace') && t.$('impTrace').textContent.includes('为什么没配上') && t.$('impTrace').querySelectorAll('.imp-trace-row').length >= 2, '7 行详情里有「为什么没配上」，列出试过的手记（1016-G）');
  t.UI().back();
  // 全额退款：两条都跳过，弱提醒
  const hc = t.$('impRefundHints');
  ok(hc && hc.textContent.includes('这笔 50.00 元已全额退款；你 3 月 14 日记的「其他 · 50.00」如果就是它'), '7 全额退款提醒，用手记的真实日期');
  ok(t.S().plan.rows.find(d => d.key === keyOf(fo)).group === 'skip', '7 全额退款的原单跳过');
  // 存储文案
  await until(() => t.$('impStorage').textContent.includes('本应用可用上限'));
  ok(t.$('impStorage').textContent.includes('本应用可用上限约 2.0 GB') && !t.$('impStorage').textContent.includes('手机上还能用'), '7 存储那行写「本应用可用上限约 x GB」（1016-G）');
  H.clickCancel(t.w);
  ok(!t.errs.length && !t.jsErr.length, '7 无报错 ' + t.errs.concat(t.jsErr).join('|'));
}

// ===== 8. 1016-C：主页面查「已全额退款的原单，以前导入过退款没有」=====
{
  const R8 = [rec('m1', 1, 15),
    { id: 'mi', time: '2026-03-11T09:00', money: 50, type: 'income', cat: '其他', remark: '手记的收入' },
    { id: 'wx2', time: '2026-03-14T09:00', money: 50, type: 'income', cat: '其他', remark: '', src: { app: 'wechat' }, cp: 0, oc: '某虚构饭店-退款' },
    { id: 'wr', time: '2026-03-12T09:00', money: 50, type: 'income', cat: '其他', remark: '', src: { app: 'wechat' }, cp: 0, oc: '某虚构饭店-退款' },
    { id: 'ar', time: '2026-03-12T09:00', money: 30, type: 'income', cat: '其他', remark: '', src: { app: 'alipay' }, cp: 1, oc: '日用百货' }];
  const seed = SEED(); seed['store_' + ID] = JSON.stringify({ archives: { '默认存档': { cats: CATS, records: R8, cps: ['某虚构饭店', '虚构商户'] } }, last: '默认存档', accountName: '小明' });
  const t = await boot({ seed });
  const st = t.w.JiwenImportStore;
  const aNo = ano(), aNo2 = ano();
  await st.ordersRegister(undefined, [{ app: 'alipay', no: aNo + '_R1', time: '2026-03-12T09:00', id: 'ar', st: 0 },
                                      { app: 'wechat', no: '50300000009999999999999999901', time: '2026-03-12T09:00', id: 'wr', st: 0 }]);
  const wo = wx({ time: T(3, 10), cp: '某虚构饭店', fen: 5000, status: '已全额退款' });
  const wo2 = wx({ time: T(3, 13), cp: '某虚构饭店', fen: 5000, status: '已全额退款' });      // 时间在那条退款之后：不算
  const ao = ali({ time: T(3, 10), no: aNo, fen: 3000, status: '退款成功', io: 'neutral' });
  const ao2 = ali({ time: T(3, 10, 13), no: aNo2, fen: 3000, status: '退款成功', io: 'neutral' });
  const parsed = P.parseFiles([{ name: 'w', data: B.ab(B.bill('wechat', [wo, wo2], { range: RANGE }).bytes) }, { name: 'a', data: B.ab(B.bill('alipay', [ao, ao2], { range: RANGE }).bytes) }]);
  const lk = R.lookups(parsed);
  const known = await st.knownFor(lk);
  const kOf = (fi, x) => R.fullRefundKey(R.orderKey(fi ? 'alipay' : 'wechat', parsed.files[fi].rows.find(r => r.no === x.no)));
  ok(known[kOf(0, wo)] && known[kOf(0, wo)].found && known[kOf(0, wo)].id === 'wr' && !known[kOf(0, wo2)], '8 微信：以前导入的退款记录（单号表里有）→ 找到了；手记的收入、单号表里没登记的不算');
  ok(known[kOf(1, ao)] && known[kOf(1, ao)].found && known[kOf(1, ao)].id === 'ar' && !known[kOf(1, ao2)], '8 支付宝：单号表里有「原单号_…」→ 找到了');
  const res = R.route(parsed, { known, rules: [] });
  const b = (fi, x) => res.items.find(it => it.file === fi && it.src === 'row' && parsed.files[fi].rows[it.row].no === x.no);
  ok(b(0, wo).why === 'fullrefundold' && b(0, wo).bucket === 'add' && b(0, wo2).why === 'fullnorefund' && b(1, ao).why === 'fullrefundold' && b(1, ao2).why === 'fullnorefund', '8 找到的照常新增，找不到的进待处理');
  // 1016-E：退款记号——两个记号，一个已用
  const mA = R.refundMarkKey('wechat', '某虚构咖啡', 3000, '2026-03-01'), mB = R.refundMarkKey('wechat', '某虚构咖啡', 3000, '2026-03-05');
  await st.ordersRegister(undefined, [mA, mB, R.refundUsedKey(mA)].map(k => ({ app: 'wechat', no: k.slice(7), time: '2026-03-20T09:00', st: 1 })));
  const rr = wx({ time: T(3, 20), cp: '某虚构咖啡', kind: '某虚构咖啡-退款', io: 'income', fen: 3000, status: '已全额退款', no: '5030000000' + String(++seq).padStart(19, '0') });
  const p8 = P.parseFiles([{ name: 'r', data: B.ab(B.bill('wechat', [rr], { range: RANGE }).bytes) }]);
  const lk8 = R.lookups(p8), k8 = await st.knownFor(lk8), mm = k8[R.markLookKey('wechat', '某虚构咖啡', 3000)];
  ok(mm && mm.marks.length === 2 && mm.marks.find(x => x.key === mA).used === true && mm.marks.find(x => x.key === mB).used === false && mm.marks.find(x => x.key === mB).day === '20260305',
    '8 退款记号：按开头查出两个，带原单日期和用过没有');
  ok(!t.errs.length && !t.jsErr.length, '8 无报错 ' + t.errs.concat(t.jsErr).join('|'));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
