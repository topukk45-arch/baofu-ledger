// 1027-UI4 界面收敛第一轮。node zZzZzZC-ui4-1027.test.js [index.html]
// 1. 色板（不起页面，直接跑 settings.js 里的 buildPalette）：24 个预设都有 --c-t1 / --c-t2 / --c-sum / --c-sum-edge / --c-track；
//    t1、t2 在页面底、白、卡片、面板底、chip、日卡抬头、「整周」槽上都 ≥ 4.5；t2 不比 t1 深；--c-text-soft 就是 t1；
//    汇总块底和页面底对比 ≥ 1.035、不加边（推到白还分不开才加）
// 2. 语义色（支出红、收入绿、接近上限黄、不计灰、往来灰蓝）固定不跟主题，24 个预设的页面底、卡片、面板底、卡片渐变浅端、汇总块底上都 ≥ 4.5；
//    样式表里不再写死老色值
const fs = require('fs'), path = require('path'), vm = require('vm');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const APP = path.join(path.dirname(htmlFile), 'app');
let pass = 0, fail = 0;
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

  console.log(`1027-UI4 界面收敛：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
