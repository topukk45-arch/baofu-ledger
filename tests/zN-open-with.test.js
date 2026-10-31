// 1.1（1016-Z3）「用记问打开」账单文件（jsdom 跑整个 App，假的原生插件 OpenFile）。node zN-open-with.test.js [index.html]
// 开着开发开关：打开 App 时带着的文件、App 开着时新来的文件，都直接进导入页算方案；没进账号时先记着，进了账号接着处理；
// 开关没开：只提示「导入功能还在测试中」，不进导入；文件太大 / 读不出来时说清楚。另外查 AndroidManifest 里有 csv / xlsx 的打开和分享过滤器、
// MainActivity 注册了插件。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const csv = B.bill('wechat', [B.txn({ time: { y: 2026, mo: 10, d: 3, h: 12, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构书店', desc: '书', io: 'expense', fen: 3200, pm: '零钱', status: '支付成功', mno: '', no: '42000000000000000000000000077' })], { range: RANGE }).bytes;
const b64 = Buffer.from(csv).toString('base64');
function plugin(first) {
  const p = { queue: first ? [first] : [], fire: null };
  p.api = { getPending: async () => ({ file: p.queue.shift() }), addListener: (ev, fn) => { if (ev === 'fileOpened') p.fire = fn; return { remove() {} }; } };
  return p;
}

(async () => {
  // ===== 0. 安卓工程 =====
  {
    const man = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    const act = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'baofu', 'ledger', 'MainActivity.java'), 'utf8');
    ok(/android\.intent\.action\.VIEW/.test(man) && /android\.intent\.action\.SEND/.test(man) && /text\/csv/.test(man) && /spreadsheetml\.sheet/.test(man), '0 AndroidManifest 有 csv / xlsx 的「打开」和「分享」过滤器');
    ok(/registerPlugin\(OpenFilePlugin\.class\)/.test(act) && fs.existsSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'baofu', 'ledger', 'OpenFilePlugin.java')), '0 MainActivity 注册了 OpenFilePlugin');
  }
  // ===== 1. 开着开发开关：打开 App 时带着文件 → 直接进导入页 =====
  {
    const P = plugin({ name: '微信账单.csv', data: b64, size: csv.length });
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), before: w => { w.Capacitor.Plugins.OpenFile = P.api; } });
    await t.until(() => t.$('impGo') && /导入 1 条/.test(t.$('impGo').textContent), 20000);
    ok(t.$('impPage') && t.$('impPage').style.display === 'block' && t.S().parsed.files[0].name === '微信账单.csv', '1 打开 App 时带着的账单文件：直接进导入页、算好了方案');
    await t.back(); await t.back();
    // App 开着时又来一个
    P.queue.push({ name: '又一份.csv', data: b64 });
    P.fire && P.fire({});
    await t.until(() => t.$('impPage').style.display === 'block' && t.S() && t.S().parsed && t.S().parsed.files[0].name === '又一份.csv', 20000);
    ok(t.S().parsed.files[0].name === '又一份.csv', '1 App 开着时新来的文件：也直接进导入页');
    await t.back(); await t.back();
    P.queue.push({ name: '大.csv', error: 'too_big' }); P.fire({});
    await t.until(() => t.ask());
    ok(/太大了（超过 8MB）/.test(t.ask().msg), '1 文件太大：说清楚');
    await t.askOk();
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }
  // ===== 2. 开发开关没开（1031-A 起导入正式放出来）：照样直接进导入页 =====
  {
    const P = plugin({ name: '微信账单.csv', data: b64 });
    const t = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf([]), { app_dev_import: '' }), before: w => { w.Capacitor.Plugins.OpenFile = P.api; } });
    await t.until(() => t.$('impPage') && t.$('impPage').style.display === 'block' && t.S() && t.S().parsed, 20000);
    ok(!(t.ask() && /还在测试中/.test(t.ask().msg)), '2 （1031-A）开关没开：不再提示「还在测试中」');
    ok(t.$('impPage') && t.$('impPage').style.display === 'block', '2 （1031-A）开关没开：照样进导入页');
    ok(t.S() && t.S().parsed && t.S().parsed.files[0].name === '微信账单.csv', '2 （1031-A）读的是打开的那个文件');
  }
  // ===== 3. 没进账号：先记着，进了账号接着处理 =====
  {
    const P = plugin({ name: '微信账单.csv', data: b64 });
    const t = await A.boot({ html, www: WWW, seed: { app_dev_import: '1' }, before: w => { w.Capacitor.Plugins.OpenFile = P.api; } });
    ok(!t.$('impPage'), '3 还没账号：先不打开');
    t.$('newAccountBtn').click();
    await t.until(() => t.ask());
    t.$('askInput').value = '小红'; await t.askOk();
    await t.until(() => t.$('impPage') && t.$('impPage').style.display === 'block' && t.$('impGo') && /新建/.test(t.$('impGo').textContent), 20000);
    ok(t.S().parsed.files[0].name === '微信账单.csv', '3 进了账号：接着拿这个文件进导入页');
    await new Promise(r => setTimeout(r, 50));
    ok(!t.ask(), '3 是带着文件进来的：不再问「怎么开始」');
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
