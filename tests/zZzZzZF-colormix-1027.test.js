// 1027-UI7：老 WebView（Chrome 111 以前，安卓模拟器上常见）不认 color-mix()，整条声明丢掉、底色变透明（一周的柱子只剩数字）。
//   每处 color-mix 前面要先写一条老 WebView 认得的颜色（先算好的 --c-mx-* / --c-shade-*），新 WebView 照旧用 color-mix，样子不变。
// 1. app.css、www/app 下的 js、index.html 里每一处 color-mix(，同一条规则里它前面紧挨着有一条用 var(--c-mx-…) / var(--c-shade-…) 的同名属性
// 2. 用到的兜底变量在 :root 里都有默认值，默认值和雾松青（默认主题）算出来的一样
// 3. 24 个预设下 buildPalette 都给这些变量，而且和 color-mix(in srgb …) 的算法一样（按 sRGB 通道线性混）
// 4. 把 color-mix 那几条删掉（模拟老 WebView）以后，一周的柱子、「整周」那一排、置顶日子、按下、闪一下都还有底色
const fs = require('fs'), path = require('path'), vm = require('vm');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile), APP = path.join(WWW, 'app');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const css = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
const sources = [['app.css', css], ['index.html', fs.readFileSync(htmlFile, 'utf8')]]
  .concat(fs.readdirSync(APP).filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join(APP, f), 'utf8')]));

// ===== 1. 每处 color-mix 前面紧挨着有兜底 =====
let n = 0;
for (const [f, src] of sources) {
  const re = /([a-z-]+)\s*:\s*color-mix\(/g; let m;
  while ((m = re.exec(src))) {
    const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;   // 注释里提到的不算
    n++;
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    const fb = new RegExp(m[1] + '\\s*:\\s*var\\(--c-(mx-[a-z0-9]+|shade-)[^;]*;\\s*$').test(before) || /var\(--c-shade-\$\{[^}]+\}\);\s*$/.test(before);
    ok(fb, `1 ${f} 第 ${src.slice(0, m.index).split('\n').length} 行的 color-mix 前面有兜底：…${before.slice(-60)}`);
  }
}
ok(n >= 11, '1 找到的 color-mix 一共 ' + n + ' 处');

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

// ===== 4. 模拟老 WebView：把 color-mix 那几条删掉，几处照样有底色 =====
const old = css.replace(/[a-z-]+\s*:\s*color-mix\([^;]*\);?/g, '');
const decl = sel => { const i = old.indexOf(sel + ' {') >= 0 ? old.indexOf(sel + ' {') : old.indexOf(sel + '{'); if (i < 0) return ''; return old.slice(i, old.indexOf('}', i)); };
for (const sel of ['.dw-bar i', '.wd-tabs', 'button.dc-item.pin', 'button.lg-gap.pressed']) ok(/background:var\(--c-mx-[a-z0-9]+\)/.test(decl(sel)), '4 老 WebView 下 ' + sel + ' 照样有底色：' + decl(sel).slice(0, 90));
ok(/@keyframes rowFlash \{ 0%, 30% \{ background:var\(--c-mx-p22a\);/.test(old) && /@keyframes sfFlash \{ 0%,40% \{ background:var\(--c-mx-p22a\);/.test(old), '4 老 WebView 下闪一下照样有颜色');
ok(!/color-mix/.test(old.replace(/\/\*[\s\S]*?\*\//g, '')), '4 删干净以后样式表里没有 color-mix 了（模拟对）');

console.log(`1027-UI7 color-mix 兜底：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
