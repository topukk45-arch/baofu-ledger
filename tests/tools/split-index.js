// 原样切开 www/index.html（modules 分支 1019-Z4-M2，只剪切、不改写）：
//   第二个 <style>（大块样式）→ www/app/app.css；大脚本按原来的分节切成 www/app/ 下几个 .js；首屏快照那段小脚本、第一个小 <style> 留在原位。
//   index.html 里换成 <link rel="stylesheet"> 和几行同步 <script src>（不加 defer / async / module，顺序和原来一样，后面带 ?v=版本号）。
//   自己检查：把切出来的文件按顺序拼回去（tools/inline.js），必须和切之前逐字节一样，不一样就不写文件。
// 用法：node tests/tools/split-index.js [源 index.html，默认 www/index.html]
'use strict';
const fs = require('fs'), path = require('path');
const { inline } = require('./inline');
const ROOT = path.join(__dirname, '..', '..'), WWW = path.join(ROOT, 'www');
const src = fs.readFileSync(process.argv[2] || path.join(WWW, 'index.html'), 'utf8');
if (/<script src="app\//.test(src)) { console.log('已经拆过了'); process.exit(1); }
const ver = (/build (\d{4}-[A-Z0-9]+(?:-M\d+)?)/.exec(src) || [])[1];
// 切的位置：大脚本里这几节的标题行（行首 8 个空格的「// =====」），按顺序；文件名对应切出来的每一段
const CUTS = [
  ['app-1-base.js', null],                                                    // 性能记录、软键盘、金额输入过滤、.dt-input 垫片
  ['app-2-core.js', '        // ===== 自定义 确认 / 输入 弹窗 ====='],          // 提示框、口径、退款、预算、存储、导入数据、写入、搬家、账号、登录、云备份、AI 导出、导入入口、分类拖动、日期选择、筛选、往下拉关闭
  ['app-3-sheet-ledger.js', '        // ===== 1017-UI1：共用的底部面板（选分类 / 选一项 / 确认）====='],   // 共用面板、搜索、批量、字号、分类汇总、预算页、预算建议
  ['app-4-forms.js', '        // ===== 悬浮按钮：打开/关闭记账弹窗 ====='],      // 记一笔、口径、模板、退款弹窗、修改弹窗、下拉、滚动锁、外观、按下反馈、页签、被杀回来、首屏快照
  ['app-5-stats.js', '        // ============================================================\n        // ===== 统计模块'],   // 统计、年月选择、脏数据自检、时间解析
  ['app-6-days-sheets.js', '        // ============================================================\n        // ===== 日子（倒数日）'],   // 日子、面板往下拉 / 返回、数字键盘、文字小面板、收起动画、性能记录（输入 / 键盘 / 面板）、返回键、日子管理
  ['app-7-init.js', '        // ===== 页面初始化：'],                           // 启动
];
// 样式：第二个 <style>
const S_OPEN = '    <style>\n', S_CLOSE = '    </style>';
const s1 = src.indexOf(S_OPEN), s2 = src.indexOf(S_OPEN, s1 + 1);
const s2end = src.indexOf(S_CLOSE, s2);
const css = src.slice(s2 + S_OPEN.length, s2end);
// 大脚本：性能记录开头的那个 <script>
const J_OPEN = '    <script>\n        // ===== 1019-M：性能记录', J_CLOSE = '    </script>';
const j1 = src.indexOf(J_OPEN), j1end = src.indexOf(J_CLOSE, j1 + 1);
const js = src.slice(j1 + '    <script>\n'.length, j1end);
if (s2 < 0 || j1 < 0 || !ver) throw new Error('找不到样式 / 大脚本 / 版本号');
const parts = []; let at = 0;
for (let k = 0; k < CUTS.length; k++) {
  const next = CUTS[k + 1] ? js.indexOf('\n' + CUTS[k + 1][1], at) + 1 : js.length;
  if (CUTS[k + 1] && next <= 0) throw new Error('找不到切点：' + CUTS[k + 1][1]);
  if (CUTS[k + 1] && js.indexOf('\n' + CUTS[k + 1][1], next) >= 0) throw new Error('切点不止一处：' + CUTS[k + 1][1]);
  parts.push([CUTS[k][0], js.slice(at, next)]); at = next;
}
const tags = parts.map(([n]) => `    <script src="app/${n}?v=${ver}"></script>`).join('\n');
const out = src.slice(0, s2) + `    <link rel="stylesheet" href="app/app.css?v=${ver}">` + src.slice(s2end + S_CLOSE.length, j1) + tags + src.slice(j1end + J_CLOSE.length);
// 自己检查：拼回去必须逐字节一样（先写到临时目录里拼）
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jwsplit-'));
fs.mkdirSync(path.join(tmp, 'app'));
fs.writeFileSync(path.join(tmp, 'app', 'app.css'), css);
parts.forEach(([n, c]) => fs.writeFileSync(path.join(tmp, 'app', n), c));
const back = inline(out, tmp);
if (back !== src) {
  let i = 0; while (i < back.length && back[i] === src[i]) i++;
  throw new Error('拼回去不一样，第 ' + i + ' 个字附近：' + JSON.stringify(src.slice(i - 40, i + 40)) + ' vs ' + JSON.stringify(back.slice(i - 40, i + 40)));
}
if (parts.map(p => p[1]).join('') !== js) throw new Error('脚本拼回去不一样');
fs.mkdirSync(path.join(WWW, 'app'), { recursive: true });
fs.writeFileSync(path.join(WWW, 'app', 'app.css'), css);
parts.forEach(([n, c]) => fs.writeFileSync(path.join(WWW, 'app', n), c));
fs.writeFileSync(path.join(WWW, 'index.html'), out);
const lc = t => t.split('\n').length - 1;
console.log(`拆好了（${ver}）：index.html ${lc(src)} 行 → ${lc(out)} 行；app.css ${lc(css)} 行；` + parts.map(([n, c]) => `${n} ${lc(c)} 行`).join('，') + '。拼回去逐字节一样。');
