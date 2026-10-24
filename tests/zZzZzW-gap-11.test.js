// 导入简化第 11 版：账单页没记账的日子改成一行细字（不装虚线框）：「10月7日 周三 · 没记账」、连着几天「10月13日–18日 · 6 天没记账」；
//   整行是一个按钮，点了开小面板（「补一笔，记在 X」+「关闭」）；今天那条点了直接记一笔；翻到很早的月份照样看得到（不按远近藏）。数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const rec = (id, time) => ({ id, time, money: 10, type: 'expense', cat: '吃饭', remark: '虚构' + id });
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([rec('a', '2026-03-02T12:00'), rec('b', '2026-03-09T12:00'), rec('c', '2026-10-20T12:00')]), now: '2026-10-23T10:00:00' });
  const $ = t.$, d = t.d, txt = e => e.textContent.replace(/\s+/g, ' ').trim();
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  const css = fs.readFileSync(path.join(WWW, 'app', 'app.css'), 'utf8'), rule = (css.match(/button\.lg-gap \{[^}]*\}/) || [''])[0];
  ok(rule && !/dashed/.test(rule) && /border:none/.test(rule) && /font-size:13px/.test(rule), '1 样式：不装框（没有虚线）、13px 细字');
  const list = $('billList'), gaps = [...list.querySelectorAll('.lg-gap')];
  ok(gaps.every(g => g.tagName === 'BUTTON') && gaps.map(txt).includes('10月21日–22日 · 2 天没记账'), '1 每条是按钮：「10月21日–22日 · 2 天没记账」 ' + gaps.map(txt).join(' | '));
  const today = list.querySelector('.lg-gap-today');
  ok(today && txt(today) === '今天 · 10月23日 周五 · 还没记账记一笔', '1 今天：「今天 · 10月23日 周五 · 还没记账」+「记一笔」');
  today.click(); await tick();
  ok($('addMask').style.display === 'flex', '2 点今天那条：直接打开记一笔');
  $('closeAdd').click(); await tick(400);
  list.querySelector('.lg-gap[data-a="2026-10-21"]').click(); await tick();
  ok(d.getElementById('uiSheetMask').classList.contains('open') && $('uiSheetTitle').textContent === '10月21日–22日 · 2 天没记账' && $('gapAdd') && $('gapClose'), '2 点过去的：小面板，标题是那一行的字，「补一笔」「关闭」');
  $('gapClose').click(); await tick();
  ok(!d.getElementById('uiSheetMask').classList.contains('open') && $('addMask').style.display !== 'flex', '2 「关闭」：什么都不做');
  // 翻到 3 月（7 个月以前）：没记账的照样一行行列着
  t.w.JiwenLedger.setYM('2026-03'); await tick();
  const mg = [...list.querySelectorAll('.lg-gap')].map(txt);
  ok(mg.includes('3月3日–8日 · 6 天没记账') && mg.some(x => /^3月10日–15日 · 6 天没记账/.test(x)), '3 很早的月份照样看得到（不按远近藏）：' + mg.join(' | '));
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 11 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
