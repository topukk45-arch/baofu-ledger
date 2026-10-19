// 1019-X 启动全程（含原生那段）和「启动画面等首屏」开关（jsdom，原生层是假的，记录全是虚构的）。node zZzS-launch-native.test.js [index.html]
// 性能记录的「启动」那条接上原生那段：从点图标（进程启动）算，Activity 创建、WebView 建好、网页开始、首屏画好、收到画好了、启动画面收起；
// 启动画面还没收起就过一会儿再问；开发开关里「启动画面等首屏」（默认开）读写原生那边的设置，关掉时那一行写「没等首屏」。
// 原生层本身（installSplashScreen、去掉退场动画、SharedPreferences）只在打包机上编译，手机上看。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = w => JSON.parse(w.localStorage.getItem('app_perf_log') || '[]');

// 假原生层：开机以来 50000 毫秒时进程启动，100 毫秒后 Activity 创建，再 300 毫秒 WebView 建好；网页开始加载时 uptime = UP0
function fakeLaunch(w, o) {
  const UP0 = 50500;   // 网页开始加载那一刻的开机毫秒数
  const st = { calls: [], timings: 0, wait: o.wait !== false, gone: o.gone };
  const up = () => UP0 + w.performance.now();
  w.Capacitor.Plugins.Launch = {
    ready() { st.calls.push('ready'); if (!st.readyAt) st.readyAt = up(); return Promise.resolve(); },
    timings() { st.timings++; const gone = st.timings >= 2 && st.wait ? up() : 0;
      return Promise.resolve({ procStart: o.noProc ? 0 : 50000, actCreate: 50100, webReady: 50400, readyAt: st.readyAt || 0, splashGone: gone, wait: st.wait,
        nowUptime: up(), nowEpoch: w.performance.timeOrigin + w.performance.now() }); },
    getWait() { return Promise.resolve({ on: st.wait }); },
    setWait(x) { st.calls.push('setWait:' + x.on); st.wait = x.on; return Promise.resolve({ on: x.on }); },
  };
  w.__launch = st;
}

(async () => {
  // 1. 启动那条接上原生那段，都从点图标算
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs), before(w) { fakeLaunch(w, {}); } });
  const { $, w } = t;
  await wait(700);
  const b = log(w).find(e => e.kind === '启动');
  ok(b && b.nat, '1 启动那条带上了原生那段 ' + JSON.stringify(b && b.nat));
  const n = b && b.nat || {};
  ok(n.proc === true && n.act === 100 && n.web === 400, '1 Activity 创建 100、WebView 建好 400（从进程启动算）');
  ok(Math.abs(n.page - 500) <= 30, '1 网页开始换算到同一把尺子上 ≈ 500：' + n.page);
  ok(n.first != null && n.first >= n.page && Math.abs(n.first - (n.page + b.paint)) <= 2, '1 首屏画好 = 网页开始 + 网页里的首屏出来 ' + n.first);
  ok(n.ready != null && n.ready >= n.page, '1 收到「画好了」的时间 ' + n.ready);
  ok(n.gone != null && n.gone >= n.ready && w.__launch.timings >= 2, '1 启动画面还没收起时过一会儿再问，记到真正收起 ' + n.gone + '（问了 ' + w.__launch.timings + ' 次）');
  ok(w.__launch.calls.includes('ready'), '1 网页告诉原生层画好了');

  // 2. 性能记录页：一行写全程
  t.d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('devPerfBtn').click();
  const txt = $('perfList').textContent;
  ok(/启动全程（从点图标算）：Activity 创建 100 · WebView 建好 400 · 网页开始 \d+ · 首屏画好 \d+ · 收到画好了 \d+ · 启动画面收起 \d+｜网页里：/.test(txt), '2 一行写全程：' + (txt.match(/启动全程[^\n]*?｜/) || [''])[0]);
  $('perfClose').click();

  // 3. 开发开关里的「启动画面等首屏」：读原生那边，点了改，下次打开生效
  ok($('devSplashBtn').style.display !== 'none' && $('devSplashVal').textContent === '开', '3 开发开关开着：有「启动画面等首屏」，默认开');
  $('devSplashBtn').click(); await t.idle();
  ok(w.__launch.calls.includes('setWait:false') && $('devSplashVal').textContent === '关' && t.ask() && /下次打开 App 生效/.test(t.ask().msg), '3 点一下：关掉（写进原生那边），写明下次打开生效');
  await t.askOk();
  $('devSplashBtn').click(); await t.idle(); await t.askOk();
  ok(w.__launch.calls.includes('setWait:true') && $('devSplashVal').textContent === '开', '3 再点：打开');
  t.w.close();

  // 4. 关着时打开 App：那一行写「没等首屏」；开发开关关着没有入口
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(recs), before(w) { fakeLaunch(w, { wait: false }); } });
  await wait(400);
  t2.d.querySelector('.tab-btn[data-tab="settings"]').click();
  t2.$('devPerfBtn').click();
  ok(/启动画面收起 （没等首屏，系统第一帧就收）/.test(t2.$('perfList').textContent), '4 关着时：写「没等首屏，系统第一帧就收」');
  ok(t2.w.__launch.timings === 1, '4 关着时不等启动画面收起，问一次就记');
  t2.$('perfClose').click(); t2.w.close();
  const t3 = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(recs), { app_dev_import: '0' }), before(w) { fakeLaunch(w, {}); } });
  await wait(300);
  ok(t3.$('devSplashBtn').style.display === 'none' && !t3.w.localStorage.getItem('app_perf_log'), '4 开发开关关着：没入口、不记');
  // 5. 不在手机上（没有原生层）：照旧只记网页那段
  const t4 = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  await wait(300);
  const b4 = log(t4.w).find(e => e.kind === '启动');
  ok(b4 && !b4.nat && b4.paint != null, '5 没有原生层：只记网页那段');

  ok([t, t2, t3, t4].every(x => x.errs.length === 0), '没有报错 ' + [t, t2, t3, t4].map(x => x.errs.join('；')).join(''));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
