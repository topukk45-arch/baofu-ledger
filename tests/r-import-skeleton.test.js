// 1015-A 第一期 ① 骨架：导入代码单独成文件、按需加载、后台线程、开发开关。node r-import-skeleton.test.js [index.html]
// 前半段在 Node 里直接 require 纯计算文件（不用 jsdom）；后半段用 jsdom 加载整个页面。
// 测试数据全部虚构。
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const IDB = require('./helpers/idb');
const { interceptor, makeFakeWorker } = require('./helpers/import-files');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.join(path.dirname(htmlFile));
const IMP = path.join(WWW, 'import');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = () => new Promise(r => setImmediate(r));
// 等某个条件成立（最多约 5 秒）。jsdom 加载外部脚本要真的读文件，单靠 setImmediate 让几拍不够
async function until(fn, ms = 5000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 2)); } return !!fn(); }
const NOW = '2026-10-15T10:00:00';

(async () => {

// ===== 1. 纯计算：Node 里直接 require =====
{
  const core = require(path.join(IMP, 'core.js'));
  const m = require(path.join(IMP, 'merchants.js'));
  ok(typeof core.countLines === 'function' && typeof core.run === 'function', '1 core.js 能直接 require');
  ok(/^\d{4}-[A-Z0-9]+$/.test(core.VERSION), '1 计算部分有版本号 ' + core.VERSION);
  const c = s => core.countLines(s).lines;
  ok(c('') === 0, '1 空文本 0 行');
  ok(c('a') === 1 && c('a\n') === 1 && c('a\nb') === 2 && c('a\nb\n') === 2, '1 末尾有没有换行都对');
  ok(c('a\r\nb\r\n') === 2 && c('\n\n') === 2, '1 \\r\\n 算一个换行；空行也算一行');
  const enc = s => new TextEncoder().encode(s);
  ok(core.countLines(enc('青禾便利,6.50\r\n云杉咖啡,18.00')).lines === 2, '1 字节（Uint8Array）也能数');
  ok(core.countLines(enc('a\nb\n').buffer).lines === 2 && core.countLines(new ArrayBuffer(0)).lines === 0, '1 ArrayBuffer 也能数');
  // 进度：多次、只增不减、最后一次 done === total
  const big = 'x,1\n'.repeat(50000), seen = [];
  const r = core.countLines(big, (d, t) => seen.push([d, t]));
  ok(r.lines === 50000 && r.size === big.length, '1 大文本行数对');
  ok(seen.length > 1 && seen.every((p, i) => i === 0 || p[0] > seen[i - 1][0]), '1 进度报了多次、只增不减');
  ok(seen.length && seen[seen.length - 1][0] === big.length && seen[seen.length - 1][1] === big.length, '1 最后一次进度 = 总数');
  let te = null; try { core.countLines(123); } catch (e) { te = e; }
  ok(te && te.name === 'TypeError' && te.message.includes('只收文本或字节'), '1 收到不认识的东西直接报错');
  let ue = null; try { core.run('没有这个命令', ''); } catch (e) { ue = e; }
  ok(ue && ue.message.includes('不认识的命令'), '1 不认识的命令报错');
  ok(core.run('info', null, null, { merchants: m }).merchants === m.items.length, '1 info 报出词表条数');
  ok(Number.isInteger(m.version) && Array.isArray(m.items) && m.items.length > 0
    && m.items.every(x => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && x[0] && typeof x[1] === 'string' && x[1]),
    '1 词表格式：[关键词, 分类]');
  // 纯计算文件里不许碰页面和存储
  ['core.js', 'merchants.js'].forEach(f => {
    const src = fs.readFileSync(path.join(IMP, f), 'utf8').replace(/\/\/.*$/gm, '');
    ok(!/\b(document|window|localStorage|indexedDB|XMLHttpRequest|fetch)\b/.test(src), '1 ' + f + ' 不碰页面、存储、网络');
  });
}

// ===== 2. 后台线程脚本：Node 里用假 Worker 跑真的 worker.js =====
{
  const FW = makeFakeWorker(WWW);
  const w = new FW('https://localhost/import/worker.js');
  const msgs = []; w.onmessage = e => msgs.push(e.data); let errs = 0; w.onerror = () => errs++;
  await until(() => msgs.length);
  ok(msgs[0] && msgs[0].type === 'ready' && msgs[0].core === require(path.join(IMP, 'core.js')).VERSION, '2 线程载入后先说「准备好」');
  const buf = new TextEncoder().encode('a,1\nb,2\nc,3').buffer;
  w.postMessage({ id: 1, cmd: 'countLines', data: buf }, [buf]);
  ok(buf.byteLength === 0, '2 ArrayBuffer 交给线程后发送方变空（transfer，没复制）');
  await until(() => msgs.some(m => m.id === 1 && m.type === 'done'));
  const done1 = msgs.find(m => m.id === 1 && m.type === 'done');
  ok(done1 && done1.result.lines === 3, '2 线程按字节数出 3 行');
  ok(msgs.some(m => m.id === 1 && m.type === 'progress' && m.done === m.total), '2 线程报了进度，最后一次 = 总数');
  ok(Object.prototype.toString.call(w.received[0].data) === '[object ArrayBuffer]', '2 线程收到的是 ArrayBuffer');
  w.postMessage({ id: 2, cmd: 'countLines', data: 123 });
  await until(() => msgs.some(m => m.id === 2));
  const e2 = msgs.find(m => m.id === 2);
  ok(e2 && e2.type === 'error' && e2.name === 'TypeError' && e2.message.includes('只收文本或字节'), '2 算出错原样报 error（带名字和原话）');
  w.postMessage({ id: 3, cmd: 'info', data: null });
  await until(() => msgs.some(m => m.id === 3));
  ok(msgs.find(m => m.id === 3).result.merchants === require(path.join(IMP, 'merchants.js')).items.length, '2 线程里载入了内置词表');
  ok(errs === 0, '2 线程没有冒出没接住的错');
  // 线程脚本载入失败：在说「准备好」之前就报 error
  const FB = makeFakeWorker(WWW, { failLoad: n => n === 'core.js' });
  const wb = new FB('https://localhost/import/worker.js'); let bad = null, said = false;
  wb.onerror = e => { bad = e; }; wb.onmessage = () => { said = true; };
  await until(() => bad);
  ok(bad && !said, '2 core.js 没加载上：线程报错，没说准备好');
}

// ===== jsdom：整个页面 =====
let __phone = null;
async function boot(o = {}) {
  const log = [], t = {}, jsdomErrs = [];
  // jsdom 自己的报错（比如外部脚本没加载上）收起来断言，不直接打到屏幕上
  const virtualConsole = new VirtualConsole();
  virtualConsole.forwardTo(console, { jsdomErrors: 'none' });
  virtualConsole.on('jsdomError', e => jsdomErrs.push(e.message));
  const dom = new JSDOM(html, {
    virtualConsole,
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(WWW, log, { missing: o.missing })] },
    beforeParse(w) {
      t.phone = IDB.install(w, __phone);
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      let clock = new Date(NOW).getTime();
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(clock); } static now() { return clock; } };
      t.advance = ms => { clock += ms; };
      if (o.ls) Object.keys(o.ls).forEach(k => w.localStorage.setItem(k, o.ls[k]));
      if (o.Worker) w.Worker = o.Worker;
      w.__files = [];
      w.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } } } };
    }
  });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  Object.assign(t, { dom, w, d, $, errs, jsdomErrs, log, ls: w.localStorage, idle: () => IDB.idle(w) });
  await IDB.idle(w);
  return t;
}
async function bootIn(o) {
  const t = await boot(o);
  if (t.$('mainBox').style.display !== 'block') {
    const chip = t.$('recentUsers').querySelector('.user-chip');
    if (chip) chip.click();
    else { t.$('newAccountBtn').click(); t.$('askInput').value = '小明'; t.$('askOk').click(); }
    await t.idle();
    // 1016-R 起新账号（开着开发开关）进去会问一次「怎么开始？」，这里选「从零开始记」
    await until(() => t.$('askMask').style.display === 'flex' && t.$('askTitle').textContent === '怎么开始', 300);
    if (t.$('askMask').style.display === 'flex' && t.$('askTitle').textContent === '怎么开始') { t.$('askCancel').click(); await t.idle(); }
  }
  t.d.querySelector('.tab-btn[data-tab="settings"]').click();
  return t;
}
const lsSnap = t => { const o = {}; for (let i = 0; i < t.ls.length; i++) { const k = t.ls.key(i); o[k] = t.ls.getItem(k); } return o; };
const shown = t => t.$('devImportBtn').style.display !== 'none';
const tap = (t, n) => { for (let i = 0; i < n; i++) t.$('setBuild').click(); };
const outText = t => t.$('devImportOut').textContent;
const importReqs = t => t.log.filter(p => p.startsWith('import/'));

// ===== 3. 启动不加载导入代码；版本号；开关默认关 =====
{
  const t = await bootIn();
  ok(t.$('mainBox').style.display === 'block', '3 进了账号');
  ok(importReqs(t).length === 0, '3 启动时没去加载 import/ 下的文件（请求：' + t.log.join(',') + '）');
  ok(/^build \d{4}-[A-Z0-9]+$/.test(t.$('loginBuild').textContent) && t.$('setBuild').textContent === t.$('loginBuild').textContent, '3 设置页底部的版本号和登录页一样：' + t.$('setBuild').textContent);
  ok(!shown(t), '3 「导入（开发中）」默认藏着');
  ok(t.w.JiwenImport === undefined && t.w.JiwenImportCore === undefined, '3 页面里没有导入模块');
  ok(!t.errs.length && !t.jsdomErrs.length, '3 无报错 ' + t.errs.concat(t.jsdomErrs).join('|'));
}

// ===== 4. 连点 5 次开关；点慢了不算；只存本机，不进账本、备份、云备份 =====
{
  const t = await bootIn();
  tap(t, 4);
  ok(!shown(t), '4 点 4 次不出现');
  tap(t, 1);
  ok(shown(t), '4 第 5 次出现入口');
  ok(t.$('askMask').style.display === 'flex' && t.$('askMsg').textContent.includes('已打开'), '4 提示已打开');
  t.$('askOk').click();
  ok(t.ls.getItem('app_dev_import') === '1', '4 开关存在 localStorage 的 app_dev_import');
  ok(importReqs(t).length === 0, '4 只是打开开关，还没加载导入代码');
  // 点得慢：每次隔 0.6 秒，5 次跨了 2.4 秒，不算
  for (let i = 0; i < 5; i++) { t.$('setBuild').click(); t.advance(600); }
  ok(shown(t), '4 点得慢（2 秒外）不算，开关不动');
  t.advance(5000);
  // 不进备份、云备份、账本
  t.$('exportBtn').click(); await until(() => t.w.__files.length);
  const backup = t.w.__files[0] || '';
  ok(backup.length > 0 && !backup.includes('dev_import'), '4 导出的备份里没有开关');
  ok(!JSON.stringify(t.w.odBuildPayload()).includes('dev_import'), '4 云备份内容里没有开关');
  const db = await (async () => { await t.idle(); return IDB.dumpDb(t.phone); })();
  ok(!Object.keys(db).some(k => k.includes('dev_import')) && !Object.values(db).some(v => String(v).includes('dev_import')), '4 账本库里没有开关');
  // 重开 App（同一台手机）：开关还在
  __phone = t.phone;
  const t2 = await bootIn({ ls: lsSnap(t) });
  __phone = null;
  ok(shown(t2), '4 重开 App 入口还在');
  tap(t2, 5);
  ok(!shown(t2) && t2.ls.getItem('app_dev_import') === null, '4 再连点 5 次关掉，键也删了');
  t2.$('askOk').click();
  ok(!t.errs.length && !t2.errs.length, '4 无报错 ' + t.errs.concat(t2.errs).join('|'));
}

const devOn = { app_dev_import: '1' };
// 1016-B 起开发入口打开的是导入页，通路自检在导入页里（「通路自检」按钮）
async function openEntry(t) {
  t.$('devImportBtn').click();
  await until(() => t.$('impSelfTest'));
  ok(!!t.$('impSelfTest'), '导入页打开，里面有「通路自检」');
  t.$('impSelfTest').click();
  ok(t.$('devImportMask').style.display === 'flex', '自检弹窗打开');
  await until(() => !outText(t).startsWith('正在'));
}
const UI_FILES = 'import/import.js,import/plan.js,import/write.js,import/undo.js,import/route.js,import/pending.js,import/vendor/tiny-inflate.js,import/unzip.js,import/ui.js';   // 1016-F 加 write.js，1016-K 加 undo.js，1016-N 加 route.js、pending.js（route.js 是纯计算，待处理页「不要了」要用它算退款记号），1016-Z8 加解压压缩包要的 tiny-inflate.js、unzip.js

// ===== 5. 兜底①：没有 Worker（jsdom 本来就没有）→ 主线程算，结果一样 =====
{
  const t = await bootIn({ ls: devOn });
  ok(shown(t) && t.w.Worker === undefined, '5 开关开着、页面里没有 Worker');
  await openEntry(t);
  ok(outText(t).startsWith('通路正常'), '5 自检通过：' + outText(t).split('\n')[0]);
  ok(outText(t).includes('主线程') && outText(t).includes('不支持后台线程'), '5 说明是在主线程算的、为什么');
  ok(outText(t).includes('文本：12 行') && outText(t).includes('字节：12 行'), '5 文本和字节都数出 12 行');
  ok(outText(t).includes('GBK 解码：正常（读出 2 笔支付宝账单，第一笔对方「青禾便利」）'), '5 自检里 GBK 解码正常：' + outText(t).split('\n').find(l => l.startsWith('GBK')));
  const FALLBACK = UI_FILES + ',import/core.js,import/merchants.js,import/parse.js,import/classify.js,import/match.js';   // route.js 导入页已经载入过，兜底不再载一遍
  ok(importReqs(t).join(',') === FALLBACK, '5 加载了导入页的九个文件和兜底要的几个文件：' + importReqs(t).join(','));
  ok(t.w.JiwenImport.state().mode === 'main', '5 state 是 main');
  t.$('devImportClose').click();
  ok(t.$('devImportMask').style.display === 'none', '5 关闭');
  t.$('impSelfTest').click(); await until(() => !outText(t).startsWith('正在'));
  ok(outText(t).startsWith('通路正常') && importReqs(t).join(',') === FALLBACK, '5 再打开不重复加载脚本：' + outText(t).split('\n')[0] + ' / ' + importReqs(t).join(','));
  t.$('devImportClose').click();
  ok(!t.errs.length, '5 无报错 ' + t.errs.join('|'));
}

// ===== 6. 有 Worker：后台线程算，字节用 transfer 交过去；主页面不加载 core.js =====
let FW6;
{
  FW6 = makeFakeWorker(WWW);
  const t = await bootIn({ ls: devOn, Worker: FW6 });
  await openEntry(t);
  ok(outText(t).startsWith('通路正常'), '6 自检通过：' + outText(t).split('\n')[0]);
  ok(outText(t).includes('算的地方：后台线程'), '6 在后台线程算的');
  ok(outText(t).includes('直接交给线程没复制'), '6 字节是交过去的，没复制');
  ok(outText(t).includes('GBK 解码：正常'), '6 线程里 GBK 解码、解析都正常');
  const ps = FW6.created[0].received.find(m => m.cmd === 'parse');
  ok(ps && Object.prototype.toString.call(ps.data.files[0].data) === '[object ArrayBuffer]', '6 解析的文件字节交给了线程');
  ok(outText(t).includes('内置词表：' + require(path.join(IMP, 'merchants.js')).items.length + ' 条'), '6 线程里载入了词表');
  ok(importReqs(t).join(',') === UI_FILES, '6 主页面只加载了导入页的九个文件（计算部分只在线程里）：' + importReqs(t).join(','));
  ok(t.w.JiwenImportCore === undefined, '6 主线程没加载计算部分');
  ok(FW6.created.length === 1 && FW6.created[0].url === 'https://localhost/import/worker.js', '6 线程地址是 https://localhost/import/worker.js（和安卓上一样）');
  const sent = FW6.created[0].received.filter(m => m.cmd === 'countLines');
  ok(sent.length === 2 /* 自检里数行的两次 */ && typeof sent[0].data === 'string' && Object.prototype.toString.call(sent[1].data) === '[object ArrayBuffer]', '6 消息格式 {id, cmd, data}：一次文本、一次 ArrayBuffer');
  ok(sent.every(m => Object.keys(m).sort().join(',') === 'cmd,data,id'), '6 消息只有 id、cmd、data 三项');

  // 进度
  const J = t.w.JiwenImport, prog = [];
  const big = '2026-01-01,青禾便利,支出,6.50\n'.repeat(20000);
  const r = await J.run('countLines', big, { onProgress: (d, n) => prog.push([d, n]) });
  ok(r.mode === 'worker' && r.result.lines === 20000, '6 大文本在线程里数对');
  ok(prog.length > 1 && prog[prog.length - 1][0] === big.length, '6 进度传回主页面，最后一次 = 总数');

  // ===== 7. 线程里算出错：原样报错，不换到主线程重算 =====
  let e7 = null;
  try { await J.run('countLines', 123); } catch (e) { e7 = e; }
  ok(e7 && e7.name === 'TypeError' && e7.message.includes('只收文本或字节') && e7.fromWorker === true, '7 线程里的错原样报回来：' + (e7 && e7.name + ' ' + e7.message));
  ok(t.w.JiwenImportCore === undefined && importReqs(t).join(',') === UI_FILES, '7 没有换到主线程重算（没加载 core.js）');
  ok(J.state().mode === 'worker' && FW6.created.length === 1, '7 线程照旧可用，没重起');
  const r7 = await J.run('countLines', 'a\nb');
  ok(r7.mode === 'worker' && r7.result.lines === 2, '7 出错后接着用正常');

  // ===== 8. 取消：停掉线程，再起一次能正常用 =====
  const p8 = J.run('countLines', big);
  await tick();          // 让消息发出去
  t.$('devImportMask').style.display = 'flex';
  t.$('devImportClose').click();    // 退出导入页
  let e8 = null; try { await p8; } catch (e) { e8 = e; }
  ok(e8 && e8.cancelled === true, '8 进行中的任务以「已取消」结束');
  ok(FW6.created[0].terminated === true, '8 线程被停掉了（terminate）');
  ok(J.state().busy === 0 && J.state().mode === null, '8 没有挂着的任务');
  const r8 = await J.run('countLines', 'a\nb\nc');
  ok(r8.mode === 'worker' && r8.result.lines === 3, '8 再用时重新起了线程，能正常算');
  ok(FW6.created.length === 2 && J.state().starts === 2, '8 一共起过两次线程');
  // 刚起线程还没准备好就取消
  J.cancel();
  const p8b = J.run('countLines', 'x'); J.cancel();
  let e8b = null; try { await p8b; } catch (e) { e8b = e; }
  ok(e8b && e8b.cancelled === true, '8 线程还没准备好就取消，也以「已取消」结束');
  await until(() => FW6.created.length === 3);
  const r8c = await J.run('info', null);
  ok(r8c.mode === 'worker', '8 之后再用照样正常');
  // 自检里点「关闭」后再点入口，又是好的
  t.$('impSelfTest').click(); await until(() => !outText(t).startsWith('正在'));
  ok(outText(t).startsWith('通路正常') && outText(t).includes('后台线程'), '8 关了再进入口自检照样通过');
  t.$('devImportClose').click();
  ok(!t.errs.length && !t.jsdomErrs.length, '6-8 无报错 ' + t.errs.concat(t.jsdomErrs).join('|'));
}

// ===== 9. 兜底②：线程脚本没加载上 → 主线程算 =====
{
  const FW = makeFakeWorker(WWW, { failLoad: n => n === 'core.js' });
  const t = await bootIn({ ls: devOn, Worker: FW });
  await openEntry(t);
  ok(outText(t).startsWith('通路正常'), '9 自检照样通过：' + outText(t).split('\n')[0]);
  ok(outText(t).includes('主线程') && outText(t).includes('脚本没加载上'), '9 说明换到主线程、原因是线程脚本没加载上');
  ok(FW.created.length === 1 && FW.created[0].terminated, '9 起不来的线程停掉了');
  ok(t.w.JiwenImport.state().mode === 'main', '9 state 是 main');
  t.$('devImportClose').click();
  ok(!t.errs.length, '9 无报错 ' + t.errs.join('|'));
}

// ===== 10. import.js 本身没加载上：提示失败，不影响记账 =====
{
  const t = await bootIn({ ls: devOn, missing: p => p === 'import/import.js' });
  t.$('devImportBtn').click();
  await until(() => t.$('askMask').style.display === 'flex');
  ok(t.$('askMsg').textContent.includes('没加载上') && !t.$('impPage'), '10 提示导入模块没加载上，导入页没打开：' + t.$('askMsg').textContent);
  t.$('askOk').click();
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  ok(t.d.getElementById('pageLedger') ? t.d.getElementById('pageLedger').style.display !== 'none' : true, '10 记账页照常能切过去');
  ok(!t.errs.length, '10 页面脚本无报错 ' + t.errs.join('|'));
  ok(t.jsdomErrs.length === 1 && t.jsdomErrs[0].includes('import/import.js'), '10 只有 import.js 没加载上这一处 ' + t.jsdomErrs.join('|'));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
