// 一次性收尾（modules 分支 1019-Z4-M25）：旧文件 app-1…7 都搬空了以后——
//   1. 模块里按名字直接调排在后面的模块的（回调口），原来靠第一个旧文件开头的旧代码引用表拿到；引用表要删了，
//      改成调用的时候才去入口拿：refreshAllViews() → window.JiwenTabs.refreshAllViews()（按语法树找）。
//      本来就挂在 window 上的老入口（snapDrop、customAlert）照旧按名字调，不改。
//   2. 删掉 app-1…7（只剩旧代码引用表和空行），index.html 里去掉它们那几行引用。
//   用法：node tests/tools/finish-legacy.js [--dry]
'use strict';
const fs = require('fs'), path = require('path');
const PL = require('./modules-plan'), D = require('./deps'), S = require('./scan');
const WWW = path.join(__dirname, '..', '..', 'www');
const dry = process.argv.includes('--dry');
const P = PL.plan(WWW);
const entryOf = Object.fromEntries(PL.MODULES.map(m => [m.key, m.entry]));
const log = [];
for (const m of PL.MODULES) {
  const f = path.join(WWW, m.file); let t = fs.readFileSync(f, 'utf8');
  const ast = S.parse(t), body = ast.body[0].expression.callee.body.body;
  const own = new Set(), imp = new Set();
  body.forEach(s => {
    if (s.type === 'FunctionDeclaration') own.add(s.id.name);
    else if (s.type === 'VariableDeclaration') { const d = s.declarations[0]; if (d.init && d.init.type === 'MemberExpression' && d.init.object.name === 'window' && d.id.type === 'ObjectPattern') d.id.properties.forEach(p => imp.add(p.key.name)); else s.declarations.forEach(x => { if (x.id.type === 'Identifier') own.add(x.id.name); }); }
  });
  const sites = []; D.freeRefs(ast.body[0], sites);
  const ext = sites.filter(x => !own.has(x.name) && !imp.has(x.name) && P.nameMod.has(x.name) && !PL.LEGACY.includes(x.name)).sort((a, b) => b.start - a.start);
  if (!ext.length) continue;
  const before = t.split('\n'); const lines = new Set();
  ext.forEach(x => { if (x.shorthand) throw new Error('简写的不处理：' + x.name); lines.add(t.slice(0, x.start).split('\n').length); t = t.slice(0, x.start) + `window.${entryOf[P.nameMod.get(x.name)]}.${x.name}` + t.slice(x.end); });
  const after = t.split('\n');
  [...lines].sort((a, b) => a - b).forEach(ln => log.push(`${m.file}:${ln}\n  - ${before[ln - 1].trim()}\n  + ${after[ln - 1].trim()}`));
  if (!dry) fs.writeFileSync(f, t);
}
// 2. 删旧文件
const htmlPath = path.join(WWW, 'index.html');
let html = fs.readFileSync(htmlPath).toString('utf8');
const legacy = [...html.matchAll(/^ *<script src="(app\/app-\d+-[^"?]+\.js)\?v=[^"]*"><\/script>\n/gm)];
legacy.forEach(x => {
  const t = fs.readFileSync(path.join(WWW, x[1]), 'utf8');
  const left = t.split('\n').filter(l => l.trim() && !/^ *const \{[^}]*\} = window\.Jiwen\w+;/.test(l));
  if (left.length) throw new Error(x[1] + ' 还没搬空：' + left[0]);
  html = html.replace(x[0], '');
  log.push('删掉 ' + x[1]);
  if (!dry) fs.unlinkSync(path.join(WWW, x[1]));
});
if (!dry) fs.writeFileSync(htmlPath, html);
console.log(log.join('\n'));
