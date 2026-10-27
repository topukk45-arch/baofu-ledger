// 1027-UI7 / UI8：老 WebView（Chrome 111 以前，安卓模拟器上常见）不认 color-mix()，底色变透明（一周的柱子只剩数字）。
//   UI7 在每处前面先写一条兜底，模拟器上照样不行（带 var() 的 color-mix 解析时收下、算颜色时才作废，作废的整条变透明，不退回前一条），
//   UI8 起样式表里不用 color-mix，混出来的颜色都在 buildPalette 里先算好（--c-mx-* / --c-shade-*）。
// 1. app.css、www/app 下的 js、index.html 里没有 color-mix（注释除外），原来那几处改用先算好的颜色
// 2. 用到的兜底变量在 :root 里都有默认值，默认值和雾松青（默认主题）算出来的一样
// 3. 24 个预设下 buildPalette 都给这些变量，而且和 color-mix(in srgb …) 的算法一样（按 sRGB 通道线性混）
// 4. 一周的柱子、置顶日子、按下、闪一下的底色直接是先算好的颜色
const fs = require('fs'), path = require('path'), vm = require('vm');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile), APP = path.join(WWW, 'app');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
const sources = [['app.css', css], ['index.html', fs.readFileSync(htmlFile, 'utf8')]]
  .concat(fs.readdirSync(APP).filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join(APP, f), 'utf8')]));

// ===== 1. 样式表、js、index.html 里不用 color-mix（注释里提到的不算） =====
//   1027-UI7 在 color-mix 前面先写一条兜底，在模拟器上没用：带 var() 的 color-mix 解析时照样收下、算颜色时才发现不认，
//   这时整条变成「没写」（透明），不会退回前面那条。所以干脆不用
let n = 0;
for (const [f, src] of sources) {
  const re = /color-mix\(/g; let m;
  while ((m = re.exec(src))) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1, line = src.slice(lineStart, m.index);
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\/\/|\/\*/.test(line)) continue;   // 注释里提到的不算
    n++; ok(false, `1 ${f} 第 ${src.slice(0, m.index).split('\n').length} 行还在用 color-mix：${line.trim().slice(-60)}`);
  }
}
ok(n === 0, '1 没有地方用 color-mix');
const usedVars = new Set((css.match(/var\(--c-(mx-[a-z0-9]+|shade-\d)\)/g) || []).map(x => x.slice(4, -1)));
ok(['--c-mx-p8', '--c-mx-p10', '--c-mx-p40', '--c-mx-p12b', '--c-mx-p16b', '--c-mx-p22a', '--c-mx-t6a'].every(k => usedVars.has(k)), '1 原来 color-mix 的地方改用先算好的颜色：' + [...usedVars].join('、'));
ok(/const shade=i=>`var\(--c-shade-\$\{i % CAT_SHADES\.length\}\)`/.test(fs.readFileSync(path.join(APP, 'detail.js'), 'utf8')), '1 一天面板分类的颜色用 --c-shade-N');

// ===== 2 / 3. 默认值、24 个预设 =====
function palette() {
  const ctx = { window: {}, Math, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theme-data.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theme.js'), 'utf8'), ctx);
  const s = fs.readFileSync(path.join(APP, 'settings.js'), 'utf8');
  const a = s.indexOf('const PRESETS=JiwenThemeData.PRESETS;'), b = s.indexOf('function applyPrimary(');
  vm.runInContext('(function(){const JiwenThemeData=window.JiwenThemeData,JiwenTheme=window.JiwenTheme;' + s.slice(a, b) + ';globalThis.__bp={buildPalette};})()', ctx);
  return { presets: ctx.window.JiwenThemeData.PRESETS, bp: ctx.__bp.buildPalette };
}
const { presets, bp } = palette();
const rgb = h => { if (/^rgba/.test(h)) { const v = h.match(/[\d.]+/g).map(Number); return v; } h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mix = (a, b, p) => { const A = rgb(a), B = rgb(b); return A.slice(0, 3).map((v, i) => Math.round(v * p + B[i] * (1 - p))); };
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 1);
const used = [...new Set((css.match(/var\(--c-(mx-[a-z0-9]+|shade-\d)\)/g) || []).map(x => x.slice(4, -1)))].concat([0, 1, 2, 3, 4].map(i => '--c-shade-' + i));
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
const dflt = bp('#3f6f6b');
for (const k of new Set(used)) {
  const m = root.match(new RegExp(k + '\\s*:\\s*([^;]+);'));
  ok(m && m[1].trim().replace(/\s/g, '') === String(dflt[k]).replace(/\s/g, ''), '2 :root 里有 ' + k + '，和默认主题算出来的一样：' + (m && m[1]) + ' / ' + dflt[k]);
}
const SPEC = { '--c-mx-p8': ['--c-surface', 0.08], '--c-mx-p10': ['--c-surface', 0.10], '--c-mx-p40': ['--c-surface', 0.40], '--c-mx-p12b': ['--c-bg', 0.12], '--c-mx-p16b': ['--c-bg', 0.16] };
const SHADES = [100, 72, 50, 34, 22];
let bad = [];
for (const p of presets) {
  const pal = bp(p.color);
  for (const [k, [base, f]] of Object.entries(SPEC)) if (!pal[k] || !near(rgb(pal[k]), mix(pal['--c-primary'], pal[base], f))) bad.push(p.name + ' ' + k);
  SHADES.forEach((v, i) => { const k = '--c-shade-' + i; if (!pal[k] || !near(rgb(pal[k]), mix(pal['--c-primary'], pal['--c-surface'], v / 100))) bad.push(p.name + ' ' + k); });
  const a = rgb(pal['--c-mx-p22a'] || ''), t = rgb(pal['--c-mx-t6a'] || '');
  if (!(a.length === 4 && near(a.slice(0, 3), rgb(pal['--c-primary'])) && a[3] === 0.22)) bad.push(p.name + ' --c-mx-p22a');
  if (!(t.length === 4 && near(t.slice(0, 3), rgb(pal['--c-text'])) && t[3] === 0.06)) bad.push(p.name + ' --c-mx-t6a');
}
ok(!bad.length, '3 24 个预设下兜底色都有、和 color-mix 算出来的一样：' + bad.slice(0, 5).join('、'));

// ===== 4. 几处的底色直接是先算好的颜色（老 WebView 也认） =====
const decl = sel => { const i = css.indexOf(sel + ' {') >= 0 ? css.indexOf(sel + ' {') : css.indexOf(sel + '{'); if (i < 0) return ''; return css.slice(i, css.indexOf('}', i)); };
for (const sel of ['.dw-bar i', 'button.dc-item.pin', 'button.lg-gap.pressed']) ok(/background:var\(--c-mx-[a-z0-9]+\)/.test(decl(sel)), '4 ' + sel + ' 的底色是先算好的颜色：' + decl(sel).slice(0, 90));
// 原来用 color-mix 的 11 处，一处一条：现在是先算好的颜色
const SITES = [['日卡抬头', /border-radius:0; background:var\(--c-mx-p8\);/], ['没记账那条按下', /button\.lg-gap\.pressed \{ background:var\(--c-mx-t6a\); \}/],
  ['今天还没记那条', /background:var\(--c-mx-p16b\); color:var\(--c-text\)/], ['刚记好闪一下', /rowFlash \{ 0%, 30% \{ background:var\(--c-mx-p22a\)/],
  ['日卡抬头（第二处）', /background:var\(--c-mx-p8\); font-size:15px;/], ['「整周」那一排', /\.wd-tabs \{[^}]*background:var\(--c-mx-p10\);/],
  ['一周的柱子', /\.dw-bar i \{[^}]*background:var\(--c-mx-p40\);/], ['置顶日子', /button\.dc-item\.pin \{ background:var\(--c-mx-p8\); \}/],
  ['搜一笔翻到条件时闪一下', /sfFlash \{ 0%,40% \{ background:var\(--c-mx-p22a\)/], ['最近搜过那几块', /border-radius:8px; background:var\(--c-mx-p12b\);/]];
for (const [nm, re] of SITES) ok(re.test(css), '4 ' + nm + '：用先算好的颜色');
ok(/<i style="flex:\$\{v\};background:\$\{shade\(i\)\}"><\/i>/.test(fs.readFileSync(path.join(APP, 'detail.js'), 'utf8')), '4 一天面板分类叠条：用 shade(i)（= --c-shade-N）');
ok(/@keyframes rowFlash \{ 0%, 30% \{ background:var\(--c-mx-p22a\); \}/.test(css) && /@keyframes sfFlash \{ 0%,40% \{ background:var\(--c-mx-p22a\); \}/.test(css), '4 闪一下用先算好的颜色');

console.log(`1027-UI7 / UI8 不用 color-mix：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
