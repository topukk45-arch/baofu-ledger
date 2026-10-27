// 1027-UI4 界面收敛第一轮。node zZzZzZC-ui4-1027.test.js [index.html]
// 1. 色板（不起页面，直接跑 settings.js 里的 buildPalette）：24 个预设都有 --c-t1 / --c-t2 / --c-sum / --c-sum-edge / --c-track；
//    t1、t2 在页面底、白、卡片、面板底、chip、日卡抬头、「整周」槽上都 ≥ 4.5；t2 不比 t1 深；--c-text-soft 就是 t1；
//    汇总块底和页面底对比 ≥ 1.035、不加边（推到白还分不开才加）
// 2. 语义色（支出红、收入绿、接近上限黄、不计灰、往来灰蓝）固定不跟主题，24 个预设的页面底、卡片、面板底、卡片渐变浅端、汇总块底上都 ≥ 4.5；
//    样式表里不再写死老色值
// 3. 汇总块（jsdom 起整个 App）：统计页两格合成一个 .ui-sum（支出大字在左、收入在右、下面一行比较 · 净剩，id 照旧）；
//    一天 / 一周面板里两格 + 当天净剩合成一个 .ui-sum（「支出 · N 笔」，副标题不再写笔数），一天的分类是叠起来的条 + 不能点的小胶囊，一周的柱子在块里；
//    预算总览是 .ui-sum、预算外 / 年度预算在下面一张列表卡；日子页置顶那个是浅底（.ui-sum 同一种底），不是主题色实心
const fs = require('fs'), path = require('path'), vm = require('vm');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const APP = path.join(path.dirname(htmlFile), 'app');
let pass = 0, fail = 0;
const A = require('./helpers/app');
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const sp = e => e ? [...e.children].map(txt).filter(Boolean).join(' ') : '';
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

function palette() {
  const ctx = { window: {}, Math, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theme-data.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theme.js'), 'utf8'), ctx);
  const s = fs.readFileSync(path.join(APP, 'settings.js'), 'utf8');
  const a = s.indexOf('const PRESETS=JiwenThemeData.PRESETS;'), b = s.indexOf('function applyPrimary(');
  vm.runInContext('(function(){const JiwenThemeData=window.JiwenThemeData,JiwenTheme=window.JiwenTheme;' + s.slice(a, b) + ';globalThis.__bp={buildPalette,_contrast,mixHex};})()', ctx);
  return { presets: ctx.window.JiwenThemeData.PRESETS, bp: ctx.__bp.buildPalette, con: ctx.__bp._contrast, mix: ctx.__bp.mixHex, T: ctx.window.JiwenTheme };
}

(async () => {
  // ===== 1. 色板 =====
  const { presets, bp, con, mix, T } = palette();
  ok(presets.length === 24, '24 个预设');
  for (const p of presets) {
    const x = bp(p.color);
    const line = x['--c-primary'];
    const bgs = { 页面底: x['--c-bg'], 白: '#ffffff', 卡片: x['--c-surface'], 面板底: x['--c-sheet'], chip: x['--c-chip'],
      日卡抬头: mix(line, x['--c-surface'], 0.08), 整周槽: mix(line, x['--c-surface'], 0.10) };
    for (const k of ['--c-t1', '--c-t2', '--c-sum', '--c-sum-edge', '--c-track']) ok(x[k], `${p.name} 有 ${k}`);
    for (const [n, b] of Object.entries(bgs)) {
      ok(con(x['--c-t1'], b) >= 4.5, `${p.name} t1 在${n}上 ≥ 4.5（${con(x['--c-t1'], b).toFixed(2)}）`);
      ok(con(x['--c-t2'], b) >= 4.5, `${p.name} t2 在${n}上 ≥ 4.5（${con(x['--c-t2'], b).toFixed(2)}）`);
    }
    ok(T.oklch(x['--c-t2']).L >= T.oklch(x['--c-t1']).L - 1e-9, `${p.name} t2 不比 t1 深`);
    ok(x['--c-text-soft'] === x['--c-t1'], `${p.name} --c-text-soft = t1`);
    ok(con(x['--c-sum'], x['--c-bg']) >= 1.035, `${p.name} 汇总块和页面底 ≥ 1.035（${con(x['--c-sum'], x['--c-bg']).toFixed(3)}）`);
    ok(x['--c-sum-edge'] === 'transparent', `${p.name} 汇总块不用加边`);
    ok(con(x['--c-ink'], x['--c-track']) >= 4.5, `${p.name} 滑块槽上的字 ≥ 4.5`);
  }
  // 雾松青和草图对得上
  const m = bp('#3f6f6b');
  ok(m['--c-t1'] === '#33716b', '雾松青 t1 = #33716b');
  ok(m['--c-t2'] !== m['--c-t1'], '雾松青两档不一样');
  // 默认值（app.css :root）和雾松青算出来的一样
  const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
  for (const k of ['--c-t1', '--c-t2', '--c-sum', '--c-track']) {
    const mm = css.match(new RegExp(k.replace(/-/g, '\\-') + ':(#[0-9a-f]{6})'));
    ok(mm && mm[1] === m[k], `:root 里 ${k} 的默认值和雾松青一样（${mm && mm[1]} / ${m[k]}）`);
  }

  // ===== 2. 语义色 =====
  for (const k of ['--c-pos', '--c-neg', '--c-warn', '--c-skip', '--c-flow']) {
    const mm = css.match(new RegExp(k.replace(/-/g, '\\-') + ':(#[0-9a-f]{6})'));
    ok(mm, `:root 有 ${k}`); if (!mm) continue;
    let worst = 99, where = '';
    for (const p of presets) { const x = bp(p.color);
      for (const b of [x['--c-bg'], x['--c-surface'], x['--c-sheet'], x['--c-card-1'], x['--c-sum'], '#ffffff']) { const c = con(mm[1], b); if (c < worst) { worst = c; where = p.name + ' ' + b; } } }
    ok(worst >= 4.5, `${k} ${mm[1]} 在 24 个预设上都 ≥ 4.5（最低 ${worst.toFixed(2)}，${where}）`);
  }
  for (const old of ['#b5482e', '#3a7a2e', '#b07a1c', '#9a6a12', '#767676', '#666666', '#56677c', '#4b6380', '#c0392b', '#d05a52'])
    ok(!css.replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase().includes(old), `样式表里没有老色值 ${old}`);

  // ===== 3. 汇总块 =====
  {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const R = (id, time, money, type, cat, remark) => ({ id, time, money, type, cat, remark: remark || '' });
    const recs = [R('a1', '2026-10-22T08:00', 12, 'expense', '吃饭', '早饭'), R('a2', '2026-10-22T13:00', 197, 'expense', '购物', '键盘'), R('a3', '2026-10-22T20:00', 20, 'income', '工资', ''),
      R('a4', '2026-09-10T12:00', 30, 'expense', '吃饭', '')];
    const DAYS = [{ id: 'd1', name: '虚构的旅行', date: '2026-12-02', pin: true }, { id: 'd2', name: '虚构的生日', date: '2026-11-08' }];
    const seed = Object.assign(A.seedOf(recs, null, { budgets: { '吃饭': 600 } }), { ['days_' + A.ID]: JSON.stringify(DAYS) });
    const t = await A.boot({ html, www: path.dirname(htmlFile), now: '2026-10-23T10:00:00', seed });
    const { $, d, w } = t; const tick = () => new Promise(r => setTimeout(r, 0));
    d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();
    const st = d.querySelector('#pageStats .ui-sum');
    ok(st && st.contains($('statMonthOut')) && st.contains($('statMonthIn')) && st.contains($('statOutCmp')) && st.contains($('statNet')), '3 统计页：一个汇总块里有支出、收入、比较、净剩');
    ok(!d.querySelector('.st-cells, .st-cell'), '3 统计页没有两格了');
    ok(st && st.querySelector('.ui-sum-main').contains($('statMonthOut')) && st.querySelector('.ui-sum-side').contains($('statMonthIn')), '3 支出在左（大字）、收入在右');
    w.JiwenDetail.openDay('2026-10-22'); await tick();
    const b = $('uiSheetBody'), u = b.querySelector('.ui-sum');
    ok(u && sp(u.querySelector('.ui-sum-main')) === '支出 · 3 笔 209.00' && sp(u.querySelector('.ui-sum-side')) === '收入 20.00', '3 一天：支出 · 几笔 + 收入：' + sp(u && u.querySelector('.ui-sum-row')));
    ok(/^净剩 −189\.00/.test(txt(u.querySelector('.ui-sum-line'))), '3 一天：下面一行净剩：' + txt(u.querySelector('.ui-sum-line')));
    ok(!txt($('uiSheetSub')), '3 一天：标题下面不再单独写笔数');
    ok(u.querySelector('.dd-stack') && u.querySelectorAll('.dd-stack i').length === 2 && [...u.querySelectorAll('.dd-cat')].map(sp).join('|') === '购物 197.00|吃饭 12.00', '3 一天：分类是叠起来的条 + 小胶囊（从大到小）');
    ok([...u.querySelectorAll('.dd-cat')].every(c => c.tagName === 'SPAN' && !c.querySelector('button')), '3 分类胶囊第一轮不能点');
    ok(!b.querySelector('.dd-cell, .dd-cells'), '3 一天：没有两格了');
    w.JiwenSheet.close(); await tick();
    w.JiwenDetail.openWeek('2026-10-19'); await tick();
    const wu = $('uiSheetBody').querySelector('.ui-sum');
    ok(wu && /^支出 · 3 笔 209\.00$/.test(sp(wu.querySelector('.ui-sum-main'))) && wu.querySelector('.dw-bars'), '3 一周：汇总块 + 柱子在里面：' + sp(wu && wu.querySelector('.ui-sum-main')));
    w.JiwenSheet.close(); await tick();
    w.JiwenStats.setStatTab ? w.JiwenStats.setStatTab('budget') : d.querySelector('#statTabSeg button[data-v="budget"]').click(); await tick();
    ok($('bgOverview').querySelector('.ui-sum .bgo-total') && $('bgOverview').querySelector('.stat-card.bg-extra .bgo-rows'), '3 预算：总览是汇总块，预算外 / 年度预算在下面的列表卡里');
    const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
    const heroRule = css.slice(css.lastIndexOf('#pageDays .day-item.day-hero {'));
    ok(/background:var\(--c-sum\)/.test(heroRule.slice(0, 300)), '3 日子置顶的卡片是浅底（--c-sum）');
    ok(!t.errs.length, '3 没有报错 ' + t.errs.join('|'));
  }

  console.log(`1027-UI4 界面收敛：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
