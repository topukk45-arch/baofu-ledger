// 1027-UI5 界面收敛第二轮（jsdom 跑整个 App + 色板）。node zZzZzZD-ui5-1027.test.js [index.html]
// 1. 点分类去搜一笔：统计页饼图旁的分类（这个月 + 支出 / 收入 + 这个分类）、预算页的分类行（这个月 + 支出 + 这个分类，不再原地展开）、
//    一天面板的分类胶囊（这一天 + 这个分类）；带进来的条件在条件卡里标 .from；‹ 回到来源页（统计页的月份 / 页签、一天面板照旧开着那一天）
// 2. 日历四档：heatTiers 的边界（只有 1 天、全部同额、一笔特别大）；只有收入的那天不着色；图例
// 3. 预算条：斜纹「到今天的平均进度」.bg-pace、没有竖线 .bg-mark、没有「竖线是今天」；统计页预算入口也有小条
// 4. 超预算提示：本月超了一类 / 两类的字、不是本月不显示、点了去预算页
// 5. 色板：24 个预设下日历相邻两档、第 1 档和卡片底能分开（≥ 1.12），最深一档上的字 ≥ 4.5；斜纹和条的底色、和实际的条（三种颜色）都能分开（≥ 1.3）；
//    超预算提示的字 ≥ 4.5
// 记录全是虚构的。今天是 2026-10-23 周五。
const fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile), APP = path.join(WWW, 'app');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark: remark || '' }, extra || {});
const tick = () => new Promise(r => setTimeout(r, 0));

function palette() {
  const ctx = { window: {}, Math, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theme-data.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theme.js'), 'utf8'), ctx);
  const s = fs.readFileSync(path.join(APP, 'settings.js'), 'utf8');
  const a = s.indexOf('const PRESETS=JiwenThemeData.PRESETS;'), b = s.indexOf('function applyPrimary(');
  vm.runInContext('(function(){const JiwenThemeData=window.JiwenThemeData,JiwenTheme=window.JiwenTheme;' + s.slice(a, b) + ';globalThis.__bp={buildPalette,_contrast};})()', ctx);
  return { presets: ctx.window.JiwenThemeData.PRESETS, bp: ctx.__bp.buildPalette, con: ctx.__bp._contrast };
}

(async () => {
  const recs = [
    R('a1', '2026-10-02T12:00', 500, 'expense', '吃饭', '聚餐'), R('a2', '2026-10-09T12:00', 312, 'expense', '吃饭', '午饭'),
    R('b1', '2026-10-22T13:00', 197, 'expense', '购物', '键盘'), R('b2', '2026-10-22T08:00', 12, 'expense', '吃饭', '早饭'),
    R('c1', '2026-10-15T09:00', 8000, 'income', '工资', ''), R('c2', '2026-10-05T09:00', 20, 'income', '其他', '虚构的进账'),
    R('p1', '2026-09-10T12:00', 30, 'expense', '吃饭', ''),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, null, { budgets: { '吃饭': 600, '购物': 700 } }) });
  const { $, d, w } = t;
  const S = () => w.JiwenSearch.searchNow();
  const tab = async v => { d.querySelector(`.tab-btn[data-tab="${v}"]`).click(); await tick(); };

  // ===== 1. 三个入口 =====
  await tab('stats');
  const sc = [...$('statMonthCatList').querySelectorAll('.sc-go')].find(b => txt(b.querySelector('.sc-cat-name')) === '吃饭');
  ok(sc && sc.tagName === 'BUTTON' && sc.querySelector('.sc-chev'), '1 饼图旁的分类是按钮、行尾 ›');
  sc.click(); await tick();
  let s = S();
  ok(w.JiwenSearch.isOpen() && s.from === '2026-10-01' && s.to === '2026-10-31' && s.ios.join() === 'expense' && s.cats.join() === '吃饭', '1 饼图：带进来 这个月 + 支出 + 吃饭：' + JSON.stringify([s.from, s.to, s.ios, s.cats]));
  ok($('filterSheetMask').style.display !== 'flex' && !$('filterSheetMask').classList.contains('open'), '1 带着条件进来不拉抽屉');
  ok($('searchTags').querySelectorAll('.sp-tag.from').length === 3, '1 带进来的 3 个条件标浅底（.from）');
  ok($('searchList').querySelectorAll('.bl-row').length === 3, '1 列出 10 月吃饭的 3 笔');
  $('searchTags').querySelector('.sp-tag.from .sp-tag-x').click(); await tick();
  ok($('searchTags').querySelectorAll('.sp-tag').length === 2, '1 点 ✕ 能去掉带进来的条件');
  $('searchBack').click(); await tick();
  ok(!w.JiwenSearch.isOpen() && w.JiwenBase.currentTab === 'stats' && $('statMonthLabel').getAttribute('aria-label') === '2026年10月' && w.JiwenStats.statTab === 'flow', '1 ‹ 回到统计页，月份、页签没变');
  // 收入
  $('statMonthCatSeg').querySelector('[data-v="income"]').click(); await tick();
  [...$('statMonthCatList').querySelectorAll('.sc-go')].find(b => txt(b.querySelector('.sc-cat-name')) === '工资').click(); await tick();
  s = S();
  ok(s.ios.join() === 'income' && s.cats.join() === '工资', '1 饼图收入那边：带 收入 + 工资');
  t.backFn && t.backFn(); await tick();
  ok(!w.JiwenSearch.isOpen() && w.JiwenBase.currentTab === 'stats', '1 返回键回到统计页（不回账单页）');
  $('statMonthCatSeg').querySelector('[data-v="expense"]').click(); await tick();
  // 预算页
  w.JiwenStats.setStatTab('budget'); await tick();
  const bgRow = $('statPaneBudget').querySelector('.bg-row[data-cat="吃饭"]');
  ok(bgRow && bgRow.querySelector('.bg-chev'), '1 预算页的分类行行尾 ›');
  bgRow.click(); await tick();
  s = S();
  ok(w.JiwenSearch.isOpen() && s.from === '2026-10-01' && s.ios.join() === 'expense' && s.cats.join() === '吃饭', '1 预算页：带 这个月 + 支出 + 吃饭');
  ok(!$('statPaneBudget').querySelector('.bg-detail'), '1 预算页的分类不再原地展开');
  $('searchBack').click(); await tick();
  ok(w.JiwenBase.currentTab === 'stats' && w.JiwenStats.statTab === 'budget', '1 回到预算页');
  ok($('statPaneBudget').querySelector('[data-act="bgManage"]'), '1 改预算的入口在总览里');
  w.JiwenStats.setStatTab('flow'); await tick();
  // 一天面板
  w.JiwenDetail.openDay('2026-10-22'); await tick();
  const dc = $('uiSheetBody').querySelector('.dd-cat[data-cat="购物"]');
  ok(dc && dc.tagName === 'BUTTON' && dc.querySelector('.dd-cat-go'), '1 一天面板的分类胶囊是按钮、带 ›');
  dc.click(); await tick();
  s = S();
  ok(w.JiwenSearch.isOpen() && s.from === '2026-10-22' && s.to === '2026-10-22' && s.cats.join() === '购物' && !s.ios.length, '1 一天面板：带 这一天 + 购物：' + JSON.stringify([s.from, s.to, s.cats, s.ios]));
  ok(!w.JiwenSheet.isOpen || !w.JiwenSheet.isOpen(), '1 进搜一笔时一天面板先收起');
  $('searchBack').click(); await tick();
  ok(!w.JiwenSearch.isOpen() && txt($('uiSheetTitle')).includes('10月22日') && $('uiSheetMask').style.display === 'flex', '1 ‹ 回到一天面板的那一天：' + txt($('uiSheetTitle')));
  w.JiwenSheet.close(); await tick();

  // ===== 2. 日历四档 =====
  const H = w.JiwenStats.heatTiers;
  ok(JSON.stringify(H({ 5: 30 })) === '{"5":2}', '2 只有 1 天：第 2 档（没得比，不当成花得最多）');
  ok(JSON.stringify(H({ 1: 10, 2: 10, 3: 10 })) === '{"1":1,"2":1,"3":1}', '2 全部同额：同一档');
  const big = H({ 1: 10, 2: 15, 3: 20, 4: 30, 5: 2695 });
  ok(big[5] === 4 && big[1] === 1 && big[2] === 1 && big[3] === 2 && big[4] === 3, '2 一笔特别大：只占最深一档，别的照样分开：' + JSON.stringify(big));
  ok(JSON.stringify(H({ 1: 10, 2: 20, 3: 30, 4: 40 })) === '{"1":1,"2":2,"3":3,"4":4}', '2 四天四档');
  ok(JSON.stringify(H({ 1: 0, 2: 10 })) === '{"2":2}', '2 支出是 0 的日子不进样本');
  const cell = day => [...$('statCal').querySelectorAll('.day')].find(c => txt(c.querySelector('.dn')) === String(day));
  ok(cell(15) && !/heat-/.test(cell(15).className), '2 只有收入的那天（15 日）不着色：' + (cell(15) && cell(15).className));
  ok(cell(2) && /heat-4/.test(cell(2).className) && cell(22) && /heat-/.test(cell(22).className), '2 有支出的日子着色、最大的那天最深');
  ok(txt($('calLegend')).includes('花得少') && txt($('calLegend')).includes('花得多') && $('calLegend').querySelectorAll('.cl-sw').length === 4, '2 日历下面的图例');
  ok(cell(23) && cell(23).classList.contains('today'), '2 今天的标记照旧');

  // ===== 3. 预算条 =====
  w.JiwenStats.setStatTab('budget'); await tick();
  ok($('statPaneBudget').querySelector('.bg-bar .bg-pace') && !$('statPaneBudget').querySelector('.bg-mark'), '3 预算条有斜纹层、没有竖线');
  ok(!/竖线是今天/.test(txt($('statPaneBudget'))) && /到今天的平均进度/.test(txt($('bgOverview'))), '3 去掉「竖线是今天」，总览里小图例「到今天的平均进度」');
  const pace = $('bgOverview').querySelector('.bg-pace');
  ok(pace && Math.abs(parseFloat(pace.style.width) - 23 / 31 * 100) < 0.2, '3 斜纹宽 = 今天第几天 ÷ 本月天数：' + (pace && pace.style.width));
  w.JiwenStats.setStatTab('flow'); await tick();
  ok($('statBudgetCard').querySelector('.bg-bar .bg-pace .bg-pace, .bg-bar .bg-pace') && $('statBudgetCard').querySelector('.bg-fill'), '3 统计页预算入口也有小条（斜纹 + 实际）');
  w.JiwenLedger.setYM('2026-09'); await tick(); w.JiwenStats.stepMonth(-1); await tick();
  w.JiwenStats.setStatTab('budget'); await tick();
  ok(!$('statPaneBudget').querySelector('.bg-pace'), '3 看的不是这个月：没有斜纹');
  w.JiwenStats.setStatTab('flow'); await tick(); w.JiwenStats.stepMonth(1); await tick();

  // ===== 4. 超预算提示 =====
  w.JiwenLedger.setYM('2026-10'); await tab('ledger');
  ok(!$('overBudget').hidden && /^吃饭 本月超预算 224\.00/.test(txt($('overBudget'))) && /看预算 ›/.test(txt($('overBudget'))), '4 超了一类：' + txt($('overBudget')));
  ok(!$('billList').querySelector('.over, .ob-mark'), '4 列表行上不加标记');
  w.JiwenLedger.setYM('2026-09'); await tick();
  ok($('overBudget').hidden, '4 不是本月不显示');
  w.JiwenLedger.setYM('2026-10'); await tick();
  $('overBudget').click(); await tick();
  ok(w.JiwenBase.currentTab === 'stats' && w.JiwenStats.statTab === 'budget', '4 点了去预算页');
  w.JiwenStats.setStatTab('flow'); await tick();
  ok(!t.errs.length, '1–4 没有报错 ' + t.errs.join('|'));
  {
    const t2 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs.concat([R('b3', '2026-10-20T10:00', 900, 'expense', '购物', '')]), null, { budgets: { '吃饭': 600, '购物': 700 } }) });
    t2.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
    ok(/^购物等 2 类超预算/.test(txt(t2.$('overBudget'))), '4 超了两类：先写超得最多的：' + txt(t2.$('overBudget')));
    const t3 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, null, { budgets: { '吃饭': 5000 } }) });
    t3.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
    ok(t3.$('overBudget').hidden, '4 没有超支：不显示');
  }

  // ===== 5. 色板 =====
  const { presets, bp, con } = palette();
  for (const p of presets) {
    const x = bp(p.color), h = [1, 2, 3, 4].map(i => x['--c-heat-' + i]);
    ok(h.every(Boolean) && x['--c-heat-ink'] && x['--c-pace-a'] && x['--c-pace-b'], p.name + ' 有四档和斜纹的颜色');
    ok(con(h[0], x['--c-surface']) >= 1.12 && con(h[1], h[0]) >= 1.12 && con(h[2], h[1]) >= 1.12 && con(h[3], h[2]) >= 1.12, p.name + ' 日历相邻两档能分开');
    for (const hh of h) ok(con(x['--c-heat-ink'], hh) >= 4.5 && con(x['--c-heat-pos'], hh) >= 4.5, p.name + ' 格子上的字 ≥ 4.5（' + hh + '）');
    ok(con(x['--c-pace-a'], x['--c-chip']) >= 1.3, p.name + ' 斜纹和条的底色能分开（' + con(x['--c-pace-a'], x['--c-chip']).toFixed(2) + '）');
    for (const f of [x['--c-primary'], '#8c5800', '#ab3f25']) ok(con(x['--c-pace-a'], f) >= 1.3, p.name + ' 斜纹和实际的条 ' + f + ' 能分开（' + con(x['--c-pace-a'], f).toFixed(2) + '）');
  }
  ok(con('#ab3f25', '#fbeee9') >= 4.5, '5 超预算提示的字 ≥ 4.5');

  console.log(`1027-UI5 界面收敛第二轮：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
