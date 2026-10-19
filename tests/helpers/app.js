// 1016-L 起新加的导入测试共用：jsdom 跑整个 App（假 Worker 跑真的线程脚本、假 IndexedDB），开着开发开关，停在设置页。
//   const A = require('./helpers/app');
//   const t = await A.boot({ html, www, now, seed })：seed 是 localStorage 的初始内容（A.seedOf(id, 记录, 分类) 拼一份）
//   t.importFiles([[文件名, 字节]], edit, { noGo, stay })：打开导入页 → 选文件 →（edit(S) 改方案）→ 点导入；
//     stay 为真时停在结果页（不点「回到账本」）
//   t.ask()：提示框开着时返回 { title, msg }，否则 null；t.askOk() / t.askCancel() 点按钮
//   t.dump()：库里全部键值（导入前 / 撤销前备份不算）
//   t.back()：按一次返回键（先等过 App 的防连按）
// 账单、手记全是虚构的。
const { JSDOM, VirtualConsole } = require('jsdom');
const IDB = require('./idb');
const { interceptor, makeFakeWorker } = require('./import-files');

async function until(fn, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch (_) {} await new Promise(r => setTimeout(r, 3)); } return !!fn(); }
const ID = 'u1760000000000000041';
const CATS = ['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他', '杂项'];
const seedOf = (recs, cats, extra) => Object.assign({ accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1',
  ['store_' + ID]: JSON.stringify({ archives: { '默认存档': Object.assign({ cats: cats || CATS, records: recs }, extra || {}) }, last: '默认存档', accountName: '小明' }), ['app_time_repaired_' + ID]: '1' });

// 1017-UI2 起确认页分步了：按编号找确认页上的东西时，当前这一步没有就到别的步骤里找（只是「走到那一步」，不改要检查的东西）；
//   哪一步都没有就回到原来那一步、返回 null。导入按钮 impGo 在最后一步「总览」。
function stepGet(w) {
  const d = w.document, raw = id => d.getElementById(id);
  return id => {
    let e = raw(id); if (e) return e;
    const UI = w.JiwenImportUI, S = UI && UI._state();
    if (!S || S.phase !== 'confirm' || !S.view || S.view.recon || !S.view.steps) return null;
    const cur = S.view.step;
    for (const k of S.view.steps.slice()) { if (k === cur) continue; UI._goStep(k); e = raw(id); if (e) return e; }
    UI._goStep(cur); return null;
  };
}
// 1017-UI2：导入要在总览点「新建 X 条记录…」，再在确认面板点「确认导入」；取消要在退出确认里点「退出」
function clickGo(w) { const $ = stepGet(w); $('impGo').click(); const ok = w.document.getElementById('impConfirmOk'); if (ok) ok.click(); }
function clickCancel(w) { const $ = stepGet(w); const c = $('impCancel'); if (c) c.click(); const q = w.document.getElementById('impExitOk'); if (q) q.click(); }

async function boot(o) {
  const t = { log: [] };
  const vc = new VirtualConsole(); vc.forwardTo(console, { jsdomErrors: 'none' });
  t.FW = makeFakeWorker(o.www);
  const NOW = o.now || '2026-12-20T10:00:00';
  const dom = new JSDOM(o.html, { virtualConsole: vc, runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(o.www, t.log)] },
    beforeParse(w) {
      t.phone = IDB.install(w, o.phone);
      Object.entries(o.seed || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime() + (w.__tick = (w.__tick || 0) + 1000); } };
      w.Worker = t.FW;
      w.__files = [];
      w.Capacitor = { isNativePlatform: () => true, Plugins: {
        Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } },
        App: { addListener(ev, fn) { if (ev === 'backButton') t.backFn = fn; return { remove() {} }; }, exitApp() { t.exited = true; } } } };
      if (o.before) o.before(w, t);
    } });
  const w = dom.window, d = w.document, $ = stepGet(w);
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  Object.assign(t, { dom, w, d, $, errs, until, idle: () => IDB.idle(w) });
  await IDB.idle(w);
  await until(() => t.backFn, 2000);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  t.S = () => w.JiwenImportUI && w.JiwenImportUI._state();
  t.st = () => w.JiwenImportStore;
  t.arch = () => (w.JiwenStore || w).loadStore(ID).archives['默认存档'];
  t.recs = () => t.arch().records;
  t.ask = () => $('askMask').style.display === 'flex' ? { title: $('askTitle') ? $('askTitle').textContent : '', msg: $('askMsg').textContent } : null;
  t.askOk = async () => { $('askOk').click(); await IDB.idle(w); };
  t.askCancel = async () => { $('askCancel').click(); await IDB.idle(w); };
  t.importFiles = async (files, edit, opts) => {
    opts = opts || {};
    $('devImportBtn').click();
    await until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
    const input = $('impFile');
    Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new w.File([bytes], name)), configurable: true });
    input.dispatchEvent(new w.Event('change'));
    await until(() => $('impGo') && /^(新建 \d+ 条记录|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex', 30000);
    const S = t.S();
    w.JiwenImportUI._goStep('check');      // 1017-UI2：和真人一样从第 1 步开始看（等按钮时走到了总览）
    if (edit) { edit(S); w.JiwenImportUI._replan(); }
    const plan = S.plan;
    if (opts.noGo || !plan.canImport) { if (!opts.stay) clickCancel(w); return { plan, S }; }
    clickGo(w);
    await until(() => $('impResult') || $('askMask').style.display === 'flex', 60000);
    const res = { plan, S, result: S.result, alert: $('askMask').style.display === 'flex' ? $('askMsg').textContent : null };
    if (res.alert) $('askOk').click();
    if (!opts.stay) { if ($('impResult')) $('impBackToLedger').click(); else clickCancel(w); }
    await IDB.idle(w);
    return res;
  };
  // 返回键：App 在一次返回后 120ms 内不理下一次（防连按），关提示框也可能算一次；等过这段再按
  t.back = async () => { await new Promise(r => setTimeout(r, 160)); t.backFn(); await IDB.idle(w); };
  t.logs = async () => t.st().importsRead();
  t.dump = async () => { await IDB.idle(w); const db = await IDB.dumpDb(t.phone); const out = {}; Object.keys(db).sort().forEach(k => { if (!/_bk_/.test(k)) out[k] = db[k]; }); return out; };
  return t;
}

module.exports = { boot, until, seedOf, ID, CATS, stepGet, clickGo, clickCancel };
