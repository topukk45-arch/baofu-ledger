// 1019-Z4 性能记录的时间按手机当地时间写（jsdom，记录全是虚构的）。node zZzU-perf-local-time.test.js [index.html]
// 原来用 toISOString（UTC），北京时间 16:11 写成 08:11。现在页面上和复制出来的都按当地时间；换几个时区各跑一遍（子进程带 TZ）。
// 顺带查过 App 里别的显示时间的地方：只有这一处用 UTC；导入里 match.js 的日子编号进出都按 UTC 算，自己对得上，不是显示。
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

if (!process.env.ZZU_CHILD) {
  for (const tz of ['Asia/Shanghai', 'America/New_York', 'UTC']) {
    const r = spawnSync(process.execPath, [__filename, htmlFile], { env: Object.assign({}, process.env, { TZ: tz, ZZU_CHILD: '1' }), encoding: 'utf8' });
    const m = /(\d+) 通过，(\d+) 失败/.exec(r.stdout || '');
    ok(r.status === 0 && m && +m[2] === 0, `时区 ${tz}：${(r.stdout || '').trim().split('\n').slice(-3).join(' / ')}${r.stderr ? ' ' + r.stderr.slice(0, 200) : ''}`);
    if (m) pass += +m[1];
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

const A = require('./helpers/app');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
(async () => {
  const tz = process.env.TZ;
  // 手机当地时间 12 月 20 日 16:11
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs), now: '2026-12-20T16:11:30', before(w) { w.navigator.clipboard = { writeText: async x => { w.__copied = x; } }; } });
  const { $, w } = t;
  w.JiwenPerf.clear();
  w.JiwenPerf.add({ kind: '打开面板', ms: 123, what: '虚构面板' });
  const e = w.JiwenPerf.list().pop();
  ok(typeof e.ts === 'number' && /^12-20 16:1\d:\d\d$/.test(e.at), `${tz}：记下的时间是当地时间 16 点：${e.at}`);
  t.d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('devPerfBtn').click();
  ok(/12-20 16:1\d:\d\d 打开面板 123ms/.test($('perfList').textContent), `${tz}：页面上写当地时间`);
  $('perfCopy').click(); await new Promise(r => setTimeout(r, 20));
  ok(/12-20 16:1\d:\d\d 打开面板 123ms/.test(w.__copied || ''), `${tz}：复制出来的也是当地时间`);
  // 老记录（没有时间戳的）照原样
  w.localStorage.setItem('app_perf_log', JSON.stringify([{ at: '10-19 08:11:39', kind: '打开面板', ms: 5, what: '老的' }]));
  $('perfClose').click(); $('devPerfBtn').click();
  ok(/10-19 08:11:39 打开面板 5ms/.test($('perfList').textContent), `${tz}：没有时间戳的老记录照原样显示`);
  $('perfClose').click();
  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
