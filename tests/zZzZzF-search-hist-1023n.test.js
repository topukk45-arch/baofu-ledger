// 1023-N 搜一笔：最近搜过（jsdom）。node zZzZzF-search-hist-1023n.test.js [index.html]
// 存在这台手机（localStorage，按账号 + 存档），最多 10 条、新的在前、一样的合成一条挪到最前；抽屉收起才记，点 × 去掉条件不记；
// 「本月」按相对时间存（下个月点开就是下个月），自己选的整月显示「2026年9月」；没条件时卡片里列 3 条（点了整组套用、× 删一条、清空）；抽屉顶上列 5 条。
// 记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark) => ({ id, time, money, type, cat, remark });

(async () => {
  const recs = [
    R('a', '2026-10-20T12:00', 12, 'expense', '吃饭', '午饭'),
    R('b', '2026-09-21T12:00', 30, 'expense', '出行', '打车'),
    R('c', '2026-11-02T12:00', 8, 'expense', '吃饭', '十一月的早饭'),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const frame = () => new Promise(r => w.requestAnimationFrame(() => setTimeout(r, 0)));
  const key = () => `app_search_hist_${w.JiwenBase.currentUser}__${w.JiwenBase.currentArchive}`;
  const hist = () => JSON.parse(w.localStorage.getItem(key()) || '[]');
  const chip = (box, label) => [...$(box).querySelectorAll('.cc')].find(b => txt(b) === label);
  const rows = () => [...$('searchTags').querySelectorAll('.sp-hist-row')];
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();

  // 1. 记：抽屉收起时
  $('filterFab').click(); await frame();
  $('filterDateQuick').querySelector('[data-q="month"]').click(); chip('filterIoChips', '支出').click();
  $('filterCatRow').click(); chip('filterChips', '吃饭').click();
  ok(!hist().length, '1 抽屉还开着：不记');
  $('sheetApply').click(); await tick();
  ok(hist().length === 1 && hist()[0].q === 'month' && !hist()[0].from && hist()[0].cats.join() === '吃饭', '1 收起：记一条，「本月」按相对时间存 ' + JSON.stringify(hist()[0]));
  ok(key().startsWith('app_search_hist_') && w.localStorage.getItem(key()), '1 存在这台手机的 localStorage（按账号 + 存档）');
  // 点 × 去掉条件：不记
  [...$('searchTags').querySelectorAll('.sp-tag')].find(x => txt(x) === '支出').querySelector('.sp-tag-x').click(); await tick();
  ok(hist().length === 1, '1 结果页点 × 去掉条件：不记');
  // 又收一次（条件和第一条不一样）：再记一条，新的在前
  w.JiwenSearch.openSheet(); await frame(); w.closeFilterSheet(); await tick();
  ok(hist().length === 2 && !hist()[0].ios && hist()[1].ios.join() === 'expense', '1 往下拉收起也算确认：新的在前');
  // 一样的条件：合成一条挪到最前
  w.JiwenSearch.openSheet(); await frame(); chip('filterIoChips', '支出').click(); $('sheetApply').click(); await tick();
  ok(hist().length === 2 && hist()[0].ios.join() === 'expense', '1 一样的条件：不重复记，挪到最前');
  // 直接回账单（不是确认）：不记
  w.JiwenSearch.openSheet(); await frame(); $('filterModeRow').click(); chip('filterModeChips', '往来').click();
  $('searchBack').click(); await new Promise(r => setTimeout(r, 300));
  ok(hist().length === 2, '1 从抽屉直接回账单：不记');

  // 2. 没条件时卡片里列 3 条；点一条整组套用
  w.JiwenSearch.resetSearch(); $('filterFab').click(); await frame(); w.closeFilterSheet(); await tick();
  ok(rows().length === 2 && /最近搜过/.test(txt($('searchTags'))) && txt(rows()[0]) === '本月 · 支出 · 吃饭' && txt(rows()[1]) === '本月 · 吃饭', '2 没条件：卡片里列最近搜过：' + rows().map(txt).join(' | '));
  ok(hist().length === 2, '2 没条件收起抽屉：不记');
  rows()[1].querySelector('.sp-hist-go').click(); await tick();
  const sn = w.JiwenSearch.searchNow();
  ok(sn.from === '2026-10-01' && sn.to === '2026-10-31' && sn.cats.join() === '吃饭' && !sn.ios.length, '2 点一条：整组套用（本月 = 10 月）');
  ok([...$('searchTags').querySelectorAll('.sp-tag')].map(txt).join() === '10月1日–10月31日,吃饭' && hist()[0].cats && !hist()[0].ios, '2 套用了也算确认：挪到最前');

  // 3. 相对时间：到了下个月，「本月」就是 11 月
  const t2 = await A.boot({ html, www: WWW, now: '2026-11-05T10:00:00', seed: Object.assign(A.seedOf(recs), { [`app_search_hist_${A.ID}__默认存档`]: JSON.stringify([{ q: 'month', cats: ['吃饭'] }, { from: '2026-09-01', to: '2026-09-30' }, { from: '2026-09-03', to: '2026-09-09' }]) }) });
  t2.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  t2.$('filterFab').click(); await new Promise(r => t2.w.requestAnimationFrame(() => setTimeout(r, 0)));
  const chips2 = [...t2.$('filterHist').querySelectorAll('.sf-hist-chip')].map(txt);
  ok(!t2.$('filterHist').hidden && chips2.join(' | ') === '本月 · 吃饭 | 2026年9月 | 9月3日–9月9日', '3 抽屉顶上列最近搜过；固定的整月写「2026年9月」：' + chips2.join(' | '));
  t2.$('filterHist').querySelector('.sf-hist-chip').click(); await tick();
  const sn2 = t2.w.JiwenSearch.searchNow();
  ok(sn2.from === '2026-11-01' && sn2.to === '2026-11-30' && t2.$('filterSheetMask').style.display === 'flex', '3 下个月点「本月 · 吃饭」：是 11 月；抽屉不关');
  t2.w.closeFilterSheet(); await tick();
  ok([...t2.$('searchList').querySelectorAll('.bl-row')].map(r => r.dataset.id).join() === 'c', '3 结果是 11 月的那笔');

  // 4. 删一条、清空、最多 10 条
  t2.w.JiwenSearch.resetSearch(); t2.$('filterFab').click(); await tick(); t2.w.closeFilterSheet(); await tick();
  const rows2 = () => [...t2.$('searchTags').querySelectorAll('.sp-hist-row')];
  ok(rows2().length === 3, '4 卡片里最多 3 条');
  // 1025-UX：列表往下滑收成一行，回到顶上展开；点那一行回到顶上
  const pg = t2.$('pageSearch'), sb = t2.$('searchBody'), fold = () => t2.$('searchTags').querySelector('.sp-hist-fold');
  const scr = y => { sb.scrollTop = y; sb.dispatchEvent(new t2.w.Event('scroll')); };
  ok(fold() && /最近搜过 3 条/.test(txt(fold())) && !pg.classList.contains('sp-folded'), '4 刚打开：3 条都列着（收起的那一行藏着）');
  scr(120);
  ok(pg.classList.contains('sp-folded'), '4 列表往下滑：最近搜过收成一行，不再盖着列表');
  scr(12);
  ok(pg.classList.contains('sp-folded'), '4 滑回来一点（还没到顶）：先不展开（不来回闪）');
  scr(0);
  ok(!pg.classList.contains('sp-folded'), '4 回到顶上：展开');
  scr(200); fold().click(); await tick();
  ok(!pg.classList.contains('sp-folded') && sb.scrollTop === 0, '4 点收起的那一行：回到顶上、展开');
  const css2 = [...t2.d.querySelectorAll('style')].map(x => x.textContent).join('\n');
  ok(/\.search-page\.sp-folded \.sp-hist \{ display:none; \}/.test(css2), '4 收起时 3 条那块不显示');
  rows2()[1].querySelector('.sp-hist-x').click(); await tick();
  ok(JSON.parse(t2.w.localStorage.getItem(`app_search_hist_${A.ID}__默认存档`)).length === 2 && rows2().length === 2, '4 × 删一条');
  t2.$('searchTags').querySelector('.sp-hist-clear').click(); await tick();
  ok(/清空最近搜过/.test(t2.$('askTitle').textContent), '4 清空先问');
  t2.$('askOk').click(); await tick();
  ok(!rows2().length && /还没设条件/.test(txt(t2.$('searchTags'))), '4 清空了：回到「还没设条件」');
  for (let i = 0; i < 12; i++) { t2.w.JiwenSearch.openSheet(); await tick(); t2.$('searchMin').value = String(i + 1); t2.$('sheetApply').click(); await tick(); }
  const h2 = JSON.parse(t2.w.localStorage.getItem(`app_search_hist_${A.ID}__默认存档`));
  ok(h2.length === 10 && h2[0].min === 12, '4 最多存 10 条，新的在前');

  ok(!t.errs.length && !t2.errs.length, '没有报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`1023-N 最近搜过：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
