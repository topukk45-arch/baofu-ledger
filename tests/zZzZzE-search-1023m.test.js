// 1023-M 搜一笔：条件卡浮在底部、点条件改 / 点 × 去掉、不计往来一行小字、只限支出只写支出、批量改先说改几笔、「清空条件 | 改条件」（jsdom）。
// node zZzZzE-search-1023m.test.js [index.html]。记录全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark }, extra || {});

(async () => {
  const recs = [
    R('a', '2026-10-20T12:00', 12, 'expense', '吃饭', '午饭'),
    R('b', '2026-10-21T12:00', 30, 'expense', '吃饭', '晚饭'),
    R('c', '2026-10-22T09:00', 500, 'income', '工资', '奖金'),
    R('d', '2026-10-22T10:00', 99, 'expense', '吃饭', '信用卡还的饭钱', { skip: true }),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const frame = () => new Promise(r => w.requestAnimationFrame(() => setTimeout(r, 0)));
  const sheetOpen = () => $('filterSheetMask').style.display === 'flex';
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');

  // 1. 没条件：底部只有「设条件」
  $('filterFab').click(); await frame(); w.closeFilterSheet(); await tick();
  ok($('searchClear').hidden && txt($('searchEdit')) === '设条件', '1 没条件：清空条件藏着，按钮写「设条件」');
  ok($('pageSearch').contains($('searchCard')) && !$('searchBody').contains($('searchTags')) && !$('searchBody').contains($('summaryFilter')), '1 条件和合计不在列表里，在底部的条件卡里');
  ok(/\.sp-card \{[^}]*position:absolute[^}]*bottom:calc\(84px/.test(css) && /\.sp-tags \{[^}]*flex-wrap:nowrap[^}]*overflow-x:auto/.test(css), '1 条件卡浮在底部按钮上面；条件一行、横着滑不换行');

  // 2. 设几个条件
  w.JiwenSearch.openSheet(); await frame();
  [...$('filterIoChips').querySelectorAll('.cc')].find(b => txt(b) === '支出').click();
  $('filterCatRow').click(); [...$('filterChips').querySelectorAll('.cc')].find(b => txt(b) === '吃饭').click();
  $('sheetApply').click(); await tick();
  const tags = () => [...$('searchTags').querySelectorAll('.sp-tag')];
  ok(tags().map(txt).join() === '支出,吃饭' && tags().every(t => t.querySelector('button.sp-tag-t') && t.querySelector('button.sp-tag-x')), '2 两个条件，每个是「文字 + ×」两个按钮');
  ok(!$('searchClear').hidden && txt($('searchClear')) === '清空条件' && txt($('searchEdit')) === '改条件', '2 有条件：「清空条件 | 改条件」');
  ok(txt($('summaryFilter').querySelector('.sp-n')) === '找到 3 笔 · 支出 42.00' && !/收入/.test(txt($('summaryFilter'))), '2 只限了支出：只写支出（不计的那笔不算进支出）' + txt($('summaryFilter').querySelector('.sp-n')));
  ok(txt($('summaryFilter').querySelector('.sp-ex')) === '其中 1 笔不计', '2 其中 1 笔不计（一行小字）');
  ok($('batchBar') && $('batchBar').querySelector('svg') && /批量改/.test(txt($('batchBar'))), '2 批量改带图标');

  // 3. 点条件本身：打开抽屉、翻到那一项（分类展开）；点 × 去掉
  tags()[1].querySelector('.sp-tag-t').click(); await frame();
  ok(sheetOpen() && !$('filterChips').hidden && $('filterCatRow').classList.contains('sf-flash'), '3 点「吃饭」：抽屉打开，分类那一项展开、闪一下');
  w.closeFilterSheet(); await tick();
  ok(w.JiwenSearch.searchNow().cats.join() === '吃饭', '3 点条件本身不删条件');
  tags()[0].querySelector('.sp-tag-x').click(); await tick();
  ok(tags().map(txt).join() === '吃饭' && w.JiwenSearch.searchNow().ios.length === 0 && !sheetOpen(), '3 点 × 去掉「支出」，不开抽屉');
  ok(/找到 3 笔 · 支出 42\.00/.test(txt($('summaryFilter'))), '3 没限收支：照写支出（没有收入不写收入）');

  // 4. 没有不计 / 往来时那行不写
  w.JiwenSearch.openSheet(); await frame();
  $('searchKeyword').value = '饭'; $('searchKeyword').dispatchEvent(new w.Event('input'));
  $('sheetApply').click(); await tick();
  ok(txt($('summaryFilter').querySelector('.sp-ex')) === '其中 1 笔不计', '4 备注「饭」：3 笔里 1 笔不计');
  tags().find(t => /备注/.test(txt(t))).querySelector('.sp-tag-x').click(); await tick();
  w.JiwenSearch.openSheet(); await frame();
  [...$('filterModeChips').querySelectorAll('.cc')].find(b => txt(b) === '计入').click();
  $('sheetApply').click(); await tick();
  ok(!$('summaryFilter').querySelector('.sp-ex'), '4 只看计入：没有不计 / 往来，那行不写');
  tags().find(t => txt(t) === '计入').querySelector('.sp-tag-x').click(); await tick();
  w.JiwenSearch.openSheet(); await frame();
  $('searchKeyword').value = '饭'; $('searchKeyword').dispatchEvent(new w.Event('input'));
  $('sheetApply').click(); await tick();

  // 5. 批量改：第一屏先说改几笔
  $('batchBar').click(); await tick();
  ok(txt($('askTitle')) === '将修改 3 笔' && /这 3 笔是这次搜到的全部记录/.test($('askMsg').textContent), '5 批量改第一屏：标题「将修改 3 笔」' + txt($('askTitle')));
  $('askCancel') ? $('askCancel').click() : w.JiwenAsk.askCancel();
  await tick();

  // 6. 清空条件
  $('searchClear').click(); await tick();
  ok(!tags().length && /最近搜过/.test(txt($('searchTags'))) && txt($('searchEdit')) === '设条件' && w.JiwenSearch.isOpen(), '6 清空条件：条件都没了（卡片里换成最近搜过，1023-N），结果页还开着');
  $('searchBack').click(); await new Promise(r => setTimeout(r, 300));
  ok(!w.JiwenSearch.isOpen(), '6 顶上 ‹：回到账单');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-M 搜一笔：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
