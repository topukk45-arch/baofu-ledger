// 1019-M 开发开关里的「性能记录」页（jsdom，记录全是虚构的）。node zZzJ-perf-log.test.js [index.html]
// App 自己记：启动各段耗时、点输入框到能输入、键盘弹起时面板位置变了几次、打开面板用了多久；
// 只在开发开关开着时记，存在这台手机（localStorage app_perf_log），最多 50 条，不进备份；页面能一键复制、清空。
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

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs), before(w) {
    // 假的 visualViewport：测试里手动缩一下当作键盘弹起
    const vv = new w.EventTarget(); vv.height = 970; w.visualViewport = vv;
    w.navigator.clipboard = { writeText: async x => { w.__copied = x; } };
  } });
  const { $, w } = t;
  await wait(60);
  // 1. 启动：记一条，各段都有
  const b = log(w).find(e => e.kind === '启动');
  ok(b && b.script != null && b.db != null && b.read != null && b.render != null && b.paint != null && b.n === 1, '1 启动记了一条：脚本开始、数据库、读完账本、画好、首屏出来、几条记录 ' + JSON.stringify(b));
  ok(b && b.script <= b.db && b.db <= b.read && b.read <= b.render && b.render <= b.paint, '1 各段时间先后对得上');

  // 2. 打开面板：记一条（没有动画时最多等 450 毫秒兜底）
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click();
  await wait(520); await t.idle();
  ok(log(w).some(e => e.kind === '打开面板' && e.what === 'addMask' && e.ms >= 0), '2 打开记一笔：记了「打开面板」');

  // 3. 点输入框到能输入
  $('billRemark').dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
  $('billRemark').focus();
  await wait(300);   // 聚焦后再过两帧才记；机器忙时两帧会拖长，多等一会儿（原来 80 毫秒，打包机上偶尔不够）
  ok(log(w).some(e => e.kind === '点输入框' && /billRemark@addMask/.test(e.what)), '3 点备注：记了「点输入框到能输入」');

  // 4. 键盘弹起：面板位置变了几次
  w.visualViewport.height = 650; w.visualViewport.dispatchEvent(new w.Event('resize'));
  await wait(1000);
  const k = log(w).find(e => e.kind === '键盘');
  ok(k && typeof k.moves === 'number' && k.vv === '970→650' && /txtMask/.test(k.what), '4 键盘弹起：记了面板位置变了几次（1019-O 起点备注弹的是文字输入小面板）' + JSON.stringify(k));

  // 5. 页面：设置里有入口（开发开关开着），一行一条，能复制、清空
  t.d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('closeAdd').click();
  ok($('devPerfBtn').style.display !== 'none', '5 设置里有「性能记录（开发中）」');
  $('devPerfBtn').click();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '性能记录（开发中）', '5 打开性能记录页');
  ok(/启动 \d+ms/.test($('perfList').textContent) && /键盘 面板位置变了/.test($('perfList').textContent), '5 一行一条写成大白话');
  $('perfCopy').click(); await wait(10);
  ok(/记问性能记录/.test(w.__copied || '') && /点输入框到能输入/.test(w.__copied || ''), '5 「复制全部」：复制的是全部记录');
  $('perfClear').click();
  ok(log(w).length === 0 && w.JiwenSheet.isOpen() && /还没有记录/.test($('uiSheetSub').textContent), '5 清空以后还在这页，写「还没有记录」');
  $('perfClose').click();

  // 6. 最多留 50 条
  for (let i = 0; i < 60; i++) w.JiwenPerf.add({ kind: '打开面板', ms: i, what: 'x' });
  ok(log(w).length === 50 && log(w)[49].ms === 59 && log(w)[0].ms === 10, '6 最多留最近 50 条');

  // 7. 开发开关关着：不记、没入口
  w.localStorage.removeItem('app_dev_import'); w.JiwenPerf.clear();
  w.JiwenPerf.add({ kind: '打开面板', ms: 1, what: 'x' });
  ok(log(w).length === 0, '7 开发开关关着：不记');
  t.w.close();
  const t2 = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(recs), { app_dev_import: '0' }) });
  await wait(60);
  ok(t2.$('devPerfBtn').style.display === 'none' && !t2.w.localStorage.getItem('app_perf_log'), '7 开关关着启动：没入口、没记录');

  ok(t.errs.length === 0 && t2.errs.length === 0, '没有报错 ' + t.errs.concat(t2.errs).join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
