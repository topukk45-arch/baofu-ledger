// 导入简化第 12 版：「这几天没花钱」标记。账单页没记账的那一行点开 →「这几天没花钱」：存进存档设置 noSpend（按日子），这一行不再显示；
//   马上能「撤销」；一周详情里那天写「没花钱 · 取消标记」；进备份（导出 / 导入备份文件 / 云备份）；导入、撤销导入不动它。数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const rec = (id, time) => ({ id, time, money: 10, type: 'expense', cat: '吃饭', remark: '虚构' + id });
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([rec('a', '2026-10-19T12:00'), rec('c', '2026-10-23T09:00')]), now: '2026-10-23T10:00:00' });
  const $ = t.$, d = t.d, txt = e => e.textContent.replace(/\s+/g, ' ').trim();
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  const list = $('billList'), gaps = () => [...list.querySelectorAll('.lg-gap')].map(txt);
  ok(gaps().includes('10月20日–22日 · 3 天没记账'), '0 有一行「10月20日–22日 · 3 天没记账」：' + gaps().join(' | '));
  list.querySelector('.lg-gap[data-a="2026-10-20"]').click(); await tick();
  ok($('gapNoSpend') && /这几天没花钱/.test($('gapNoSpend').textContent) && /可以撤销/.test($('gapNoSpend').textContent), '1 小面板里「这几天没花钱」（写明能撤销）');
  $('gapNoSpend').click(); await t.idle();
  ok(JSON.stringify(t.arch().noSpend) === '["2026-10-20","2026-10-21","2026-10-22"]', '1 存进存档设置 noSpend：' + JSON.stringify(t.arch().noSpend));
  ok(!list.querySelector('.lg-gap[data-a="2026-10-20"]') && !gaps().some(x => /10月2[0-2]日/.test(x)), '1 这一行不再显示');
  ok(t.ask() && /已标「没花钱」：10月20日–22日/.test(t.ask().msg) && $('askExtra').textContent === '撤销' && $('askCancel').style.display === 'none', '1 提示「已标没花钱」，有「撤销」');
  $('askExtra').click(); await t.idle();
  ok(!t.arch().noSpend && gaps().includes('10月20日–22日 · 3 天没记账'), '2 「撤销」：标记拿掉，那一行回来');
  // 再标一次，到一周详情里取消一天
  list.querySelector('.lg-gap[data-a="2026-10-20"]').click(); await tick(); $('gapNoSpend').click(); await t.idle(); await t.askOk();
  t.w.JiwenDetail.openWeek('2026-10-19'); await tick();
  const ns = [...d.querySelectorAll('.dw-day-ns')];
  ok(ns.length === 3 && /10月21日 周三 ?没花钱 ?取消标记/.test(txt(ns[1])), '3 一周详情：标过的那天写「没花钱 · 取消标记」：' + ns.map(txt).join(' | '));
  d.querySelector('[data-unns="2026-10-21"]').click(); await t.idle();
  ok(JSON.stringify(t.arch().noSpend) === '["2026-10-20","2026-10-22"]' && d.querySelectorAll('.dw-day-ns').length === 2, '3 「取消标记」：只去掉那一天');
  d.getElementById('weekClose') && d.getElementById('weekClose').click(); await tick();
  ok(gaps().includes('10月21日 周三 · 没记账'), '3 账单页那一天回来了：' + gaps().join(' | '));
  // 备份
  $('exportBtn').click(); await t.until(() => t.w.__files.length);
  const bk = JSON.parse(t.w.__files[t.w.__files.length - 1]);
  const bkA = bk.archives ? Object.values(bk.archives)[0] : bk;
  ok(JSON.stringify(bkA.noSpend || bk.noSpend) === '["2026-10-20","2026-10-22"]', '4 导出备份带 noSpend');
  await t.w.JiwenStore.importArchiveFromText(t.w.__files[t.w.__files.length - 1], A.ID); await t.idle();
  const names = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives), a2 = names[names.length - 1];
  ok(JSON.stringify(t.w.JiwenStore.loadStore(A.ID).archives[a2].noSpend) === '["2026-10-20","2026-10-22"]', '4 导入备份成另一个存档：noSpend 照带');
  const cloud = JSON.stringify(await t.w.JiwenStore.odBuildPayload());
  ok(/"noSpend":\["2026-10-20","2026-10-22"\]/.test(cloud), '4 云备份带 noSpend');
  // 不对的日子洗掉
  const bad = JSON.stringify(Object.assign({}, bk, bk.archives ? {} : { noSpend: ['2026-10-20', 'x', 3, '2026-13-40', '2026-10-20'] }));
  if (!bk.archives) { await t.w.JiwenStore.importArchiveFromText(bad, A.ID); await t.idle(); const n2 = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives).pop(); ok(JSON.stringify(t.w.JiwenStore.loadStore(A.ID).archives[n2].noSpend) === '["2026-10-20"]', '4 导入备份：不像日子的、重复的洗掉'); }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 12 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
