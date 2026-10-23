// 1023-F 搜索口径：收支、统计、分类能多选，备注按空格分成几个词都要包含（jsdom 跑整个 App，用老筛选浮层点出条件）。node zZzZz8-search-1023f.test.js [index.html]
// 记录全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark }, extra || {});

(async () => {
  const recs = [
    R('a', '2026-10-01T12:00', 14, 'expense', '吃饭', '公司 楼下 午饭'),
    R('b', '2026-10-02T12:00', 20, 'expense', '吃饭', '楼下面馆'),
    R('c', '2026-10-03T09:00', 5000, 'income', '工资', '十月工资'),
    R('d', '2026-09-04T18:00', 66, 'expense', '购物', '买菜 晚饭'),
    R('e', '2026-09-05T10:00', 30, 'expense', '杂项', '信用卡还款', { skip: true }),
    R('f', '2026-08-06T10:00', 3000, 'income', '其他', '期初余额', { flow: true }),
    R('g', '2026-10-07T10:00', 6, 'income', '吃饭', '退回来的', { refundOf: 'b' }),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, ['未分类', '吃饭', '购物', '工资', '杂项', '其他']) });
  const { $, d, w } = t;
  const frame = () => new Promise(r => w.requestAnimationFrame(() => setTimeout(r, 0)));
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  const chip = (box, txt) => [...$(box).querySelectorAll('.cc')].find(e => e.textContent === txt);
  const ids = () => { w.JiwenSearch.searchFlush(); return [...$('searchList').querySelectorAll('.bl-row')].map(r => r.dataset.id).sort().join(); };   // 1023-G：结果在搜一笔页里
  const noCond = () => !$('searchTags').querySelector('.sp-tag');
  const search = async setup => { $('filterFab').click(); await frame(); $('sheetClear').click(); setup(); $('sheetApply').click(); return ids(); };

  // 备注：空格隔开的几个词都要包含（不管先后），全角空格也算
  ok(await search(() => { $('searchKeyword').value = '楼下 午饭'; }) === 'a', '1 两个词都要包含：' + ids());
  ok(await search(() => { $('searchKeyword').value = '午饭 公司'; }) === 'a', '1 不管先后');
  ok(await search(() => { $('searchKeyword').value = '楼下　面馆'; }) === 'b', '1 全角空格也算分隔');
  ok(await search(() => { $('searchKeyword').value = '楼下'; }) === 'a,b', '1 一个词：照旧是包含');
  ok(w.JiwenSearch.searchNow().keyword === '楼下', '1 存的还是小写、去掉两头空格的原文');
  // 收支：两个都选 = 全部（不算筛选）；退款算收入
  ok(await search(() => chip('filterIoChips', '收入').click()) === 'c,f,g', '2 只看收入（退款算收入）');
  ok(await search(() => { chip('filterIoChips', '收入').click(); chip('filterIoChips', '支出').click(); }) === 'a,b,c,d,e,f,g' && noCond(), '2 收入、支出都选 = 全部，不算条件（1023-G：没条件时结果页列全部记录）');
  // 统计：多选，命中其中一种就行
  ok(await search(() => { chip('filterModeChips', '不计').click(); chip('filterModeChips', '往来').click(); }) === 'e,f', '3 不计 + 往来');
  ok(await search(() => { chip('filterModeChips', '计入').click(); chip('filterModeChips', '不计').click(); }) === 'a,b,c,d,e,g', '3 计入 + 不计');
  ok(await search(() => { chip('filterModeChips', '往来').click(); chip('filterModeChips', '往来').click(); }) === 'a,b,c,d,e,f,g' && noCond(), '3 再点一下去掉');
  // 分类：多选
  ok(await search(() => { chip('filterChips', '吃饭').click(); chip('filterChips', '购物').click(); }) === 'a,b,d,g', '4 吃饭 + 购物');
  ok(w.JiwenSearch.searchNow().cats.join() === '吃饭,购物' && [...$('searchTags').querySelectorAll('.sp-tag')].map(e => e.textContent).join() === '吃饭,购物', '4 存成数组（按分类管理里的顺序），结果页两个小标签');
  $('filterFab').click(); await frame();
  ok([...$('filterChips').querySelectorAll('.sel')].map(e => e.textContent).join() === '吃饭,购物', '4 重开面板：两个都高亮');
  chip('filterChips', '吃饭').click(); chip('filterChips', '购物').click();
  ok(!$('filterChips').querySelector('.sel') && noCond(), '4 再点一下去掉（1023-G 起没有「全部」那一格）');
  w.closeFilterSheet();
  // 叠加：分类 + 收支 + 备注
  ok(await search(() => { chip('filterChips', '吃饭').click(); chip('filterIoChips', '支出').click(); $('searchKeyword').value = '楼下'; }) === 'a,b', '5 吃饭 + 支出 + 备注「楼下」');
  // 批量跟着结果走：显示多少条就改多少条
  const hitN = w.JiwenStore.getUserData().filter(r => w.JiwenSearch.filterMatch(r)).length;
  ok(hitN === 2 && $('searchList').querySelectorAll('.bl-row').length === 2 && /找到 2 笔/.test($('summaryFilter').textContent) && $('batchBar'), '5 批量的条数 = 结果页列出来的条数');
  // 分类改名 / 删掉以后：不在分类表里的不再算条件
  await search(() => chip('filterChips', '杂项').click());
  ok(ids() === 'e', '6 只看杂项');
  w.JiwenCats.deleteCat('杂项'); if ($('askOk') && $('askMask').style.display === 'flex') $('askOk').click();
  await frame();
  ok(w.JiwenSearch.searchNow().cats.length === 0, '6 删掉了「杂项」：分类条件跟着去掉 ' + JSON.stringify(w.JiwenSearch.searchNow().cats));
  // 清掉
  w.JiwenSearch.resetSearch();
  const sn = w.JiwenSearch.searchNow();
  ok(!sn.keyword && !sn.ios.length && !sn.modes.length && !sn.cats.length && !w.__filterActive(), '7 一键清掉：全部归零');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-F 搜索口径：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
