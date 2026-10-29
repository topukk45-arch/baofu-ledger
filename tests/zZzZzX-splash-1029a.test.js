// @serial
// 1029-A 启动页第一版：默认底色几处一样、主题底色另存给启动时用、性能记录页顶上的快照命中率（jsdom，记录全是虚构的）
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const ROOT = path.join(__dirname, '..');
const htmlFile = process.argv[2] || path.join(ROOT, 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. 默认底色：colors.xml、capacitor.config.json、index.html 开头、app.css 的 --c-bg 一样，也就是雾松青主题算出来的底色
  const cx = (rd('android/app/src/main/res/values/colors.xml').match(/name="appWindowBackground">(#[0-9a-fA-F]{6})</) || [])[1];
  const cap = JSON.parse(rd('capacitor.config.json')).android.backgroundColor;
  const head = html.slice(0, html.indexOf('</style>'));
  const hs = head.match(/background-color:\s*(#[0-9a-fA-F]{6})/g).map(x => x.split(':')[1].trim());
  const css = (fs.readFileSync(path.join(WWW, 'app', 'app.css'), 'utf8').match(/--c-bg:\s*(#[0-9a-fA-F]{6})/) || [])[1];
  const all = [cx, cap, ...hs, css].map(x => String(x).toLowerCase());
  ok(hs.length === 2 && new Set(all).size === 1, '1 几处默认底色一样 ' + JSON.stringify(all));
  ok(all[0] === '#f1f9f8', '1 默认底色是雾松青的 #f1f9f8 ' + all[0]);
  const ma = rd('android/app/src/main/java/com/baofu/ledger/MainActivity.java');
  ok(/R\.color\.appWindowBackground/.test(ma) && !/parseColor/.test(ma), '1 MainActivity 的底色用 colors.xml 的');
  ok(/SPLASH_MAX_MS = 2000;/.test(ma), '2 启动画面最多等 2 秒');
  const st = rd('android/app/src/main/res/values/styles.xml');
  ok(/windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher_foreground</.test(st) && /windowSplashScreenIconBackgroundColor">@color\/appWindowBackground</.test(st), '4 启动画面图标只用前景、底色同启动画面');
  ok(html.indexOf("app_boot_bg") > 0 && html.indexOf("app_boot_bg") < html.indexOf('__bootSnapMiss'), '3 读 app_boot_bg 的那段在快照那段前面');

  // 2. 另存的主题底色：打开 App 时最早钉到 html 上；换主题时跟着存
  const boots = [];
  const mk = (snap, miss) => Object.assign({ kind: '启动', ms: 300, ts: 1790000000000 }, snap ? { snap: 120, snapSrc: 'idle' } : {}, miss ? { snapMiss: miss } : {});
  for (let i = 0; i < 5; i++) boots.push(mk(false, 'build'));   // 最老的 5 条，30 条以外
  for (let i = 0; i < 20; i++) boots.push(mk(true));
  for (let i = 0; i < 4; i++) boots.push(mk(false, 'build'));
  boots.push(mk(false, 'day'), mk(false, 'none'), mk(false, 'none'), { kind: '打开面板', ms: 30, what: 'x' });
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }]),
    before(w) { w.localStorage.setItem('app_boot_bg', '#f3f0fa'); w.localStorage.setItem('app_perf_log', JSON.stringify(boots)); } });
  const { $, w, d } = t;
  ok(d.documentElement.style.getPropertyValue('background-color').replace(/\s/g, '') === 'rgb(243,240,250)' && d.documentElement.style.getPropertyPriority('background-color') === 'important', '2 app_boot_bg 钉到 html 上（带 !important）');
  $('resetThemeBtn').click();   // 恢复默认主题也是「存了主题」
  const bg = d.documentElement.style.getPropertyValue('--c-bg').trim();
  ok(bg === '#f1f9f8' && w.localStorage.getItem('app_boot_bg') === bg, '2 存主题时另存底色（默认主题就是 #f1f9f8）' + bg + ' / ' + w.localStorage.getItem('app_boot_bg'));

  // 3. 性能记录页顶上一行：最近 30 次启动，版本不对单列、不算命中率
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  await wait(60);
  const L = JSON.parse(w.localStorage.getItem('app_perf_log')).filter(e => e.kind === '启动').slice(-30);
  $('devPerfBtn').click(); await wait(10);
  const first = $('perfList').textContent.split('\n').find(l => /^启动快照/.test(l)) || '';
  ok(/^启动快照（最近 30 次启动）：用上 \d+ 次/.test(first), '3 顶上一行是快照汇总 ' + first);
  // 这次真启动那条也记进去了，按存着的最近 30 条现数
  const hit = L.filter(e => e.snap != null).length, bd = L.filter(e => e.snapMiss === 'build').length;
  ok(first.includes(`用上 ${hit} 次`) && first.includes(`版本不对 ${bd} 次（不算进命中率）`) && first.includes(`（${hit}/${L.length - bd}）`), '3 数对得上 ' + first);
  ok(/没有快照 \d/.test(first) && /不是今天存的 1/.test(first), '3 没用上的按原因数');
  t.dom.window.close();
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
