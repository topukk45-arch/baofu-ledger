// 把一块代码原样搬进模块文件（modules 分支第五步，每块一次）：node tests/tools/move-module.js <模块名> [--dry]
//   按 tools/modules-plan.js 选这一块的顶层语句：定义的名字都归这个模块的（全 App 共用的四个状态 currentUser… 不搬），
//   加上这块那几节里不定义名字的语句（事件绑定之类）；设计表 BIND 里写了归哪块的绑定语句，只跟着那一块走。
//   每条语句连同它前面的注释 / 空行一起剪（一整行一整行地剪，一个字不改、不改缩进），按原来的先后接成
//     (function(){
//     ……原样的代码……
//             window.JiwenXxx = { 对外的名字 };
//     })();
//   别处（还没搬的 app-N、已经搬的模块、测试）要用的名字才放进入口；还没搬的旧代码在第一个旧文件开头加一行「旧代码引用表」
//   const { … } = window.JiwenXxx;，模块文件里用到前面模块的名字，在 IIFE 开头同样取一行。
//   index.html 里在旧文件前面、前面那些模块后面加一行 <script src="app/xxx.js?v=版本号">。
//   搬之前自查：被搬的语句「当场」要用的名字都在这个模块或前面的模块里（不然搬到前面加载会出错）；一行里不能半条搬半条不搬。
'use strict';
const fs = require('fs'), path = require('path');
const PL = require('./modules-plan'), D = require('./deps'), S = require('./scan');
const STATE = new Set(['currentUser', 'currentArchive', 'currentTab', 'curPage']);
// 绑定语句归哪块看设计表的 BIND（跟着它服务的页面走）

function run(key, opt) {
  opt = opt || {};
  const ROOT = path.join(__dirname, '..', '..'), WWW = path.join(ROOT, 'www');
  const mod = PL.MODULES.find(m => m.key === key);
  if (!mod) throw new Error('没有这个模块：' + key);
  if (PL.LEGACY.includes(mod.entry)) throw new Error('入口名和老入口重名，会把老入口盖掉：' + mod.entry);
  const P = PL.plan(WWW), R = P.R;
  const ast = S.parse(R.code);
  // 每个旧文件在接起来的代码里的起止
  let acc = 0; const fb = R.files.map(f => { const c = fs.readFileSync(path.join(WWW, f), 'utf8'); const b = { file: f, start: acc, end: acc + c.length, text: c }; acc += c.length; return b; });
  const legacy = fb.filter(b => /^app\/app-\d+-/.test(b.file));
  // 剪的时候从原文剪（R.code 是分析用的：旧代码引用表那几行换成了空格），两份位置一样
  const RAW = fb.map(b => b.text).join('');
  if (RAW.length !== R.code.length) throw new Error('原文和分析用的代码长度对不上');
  const ALIAS_LINE = /^ *const \{[^}\n]*\} = window\.Jiwen\w+;.*\n/;
  const fileOf = pos => fb.find(b => pos >= b.start && pos < b.end);
  const secAt = pos => { let i = 0; for (const s of R.secs) { if (s.pos <= pos) i = s.id; else break; } return i; };
  const ownNames = st => st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.flatMap(d => namesOf(d.id)) : [];
  const binds = PL.BIND;
  const bindOf = st => { const b = binds.find(([k]) => R.code.startsWith(k, st.start)); return b && b[1]; };
  // 只看还没搬的旧文件里的语句
  const body = ast.body.filter(st => legacy.includes(fileOf(st.start)));
  const pick = body.filter(st => {
    const own = ownNames(st);
    const bd = bindOf(st); if (bd) return bd === key;
    if (own.length) {
      const mine = own.filter(n => P.nameMod.get(n) === key && !STATE.has(n));
      if (mine.length && mine.length !== own.length) throw new Error('一条语句里的名字归不同的模块：' + own.join(','));
      return mine.length > 0;
    }
    return mod.secs.includes(R.secs[secAt(st.start)].title);
  });
  if (!pick.length) throw new Error('这一块没有要搬的语句');
  const lost = binds.filter(([k, m]) => m === key && !body.some(st => R.code.startsWith(k, st.start)));
  if (lost.length) throw new Error('BIND 里归这块的语句找不到：' + lost.map(x => x[0]).join(' | '));
  // 每条语句的「块」：从上一条语句结束那一行的下一行开始（中间只有注释 / 空行），到这条语句结束那一行的行尾
  const chunkOf = st => {
    const f = fileOf(st.start);
    const i = body.indexOf(st), prev = body[i - 1];
    let a = prev && fileOf(prev.start) === f ? R.code.indexOf('\n', prev.end) + 1 : f.start;
    // 文件开头的旧代码引用表不跟着搬
    if (a === f.start) { let mm; while ((mm = ALIAS_LINE.exec(RAW.slice(a, a + 4000)))) a += mm[0].length; }
    if (prev && fileOf(prev.start) === f && R.code.lastIndexOf('\n', st.start - 1) + 1 < R.code.indexOf('\n', prev.end) + 1) throw new Error('两条语句在同一行：L' + st.loc.start.line);
    const gap = RAW.slice(a, R.code.lastIndexOf('\n', st.start - 1) + 1);
    if (gap.split('\n').some(l => l.trim() && !/^\s*\/\//.test(l))) throw new Error('语句前面夹着别的东西：L' + st.loc.start.line + ' ' + JSON.stringify(gap.slice(0, 80)));
    // 同一行后面还有语句的：都要一起搬（并成一块），不然报错
    let last = st, j = i;
    let z = R.code.indexOf('\n', last.end); if (z < 0 || z > f.end) z = f.end - 1;
    while (body[j + 1] && body[j + 1].start < z) {
      j++;
      if (!pickSet.has(body[j])) throw new Error('同一行里有不搬的语句：L' + body[j].loc.start.line);
      last = body[j]; z = R.code.indexOf('\n', last.end); if (z < 0 || z > f.end) z = f.end - 1;
    }
    const tail = RAW.slice(last.end, z);
    if (tail.trim() && !/^\s*(\/\/.*)?$/.test(tail)) throw new Error('语句后面同一行还有别的：L' + last.loc.end.line + ' ' + JSON.stringify(tail));
    return { a, z: z + 1, f, upto: j };
  };
  const pickSet = new Set(pick);
  const chunks = []; let coveredTo = -1;
  pick.forEach(st => { const bi = body.indexOf(st); if (bi <= coveredTo) return; const c = Object.assign(chunkOf(st), { st }); coveredTo = c.upto; chunks.push(c); });
  // 「当场」要用的名字都要在这个模块或前面的模块里（全 App 共用的状态这时还在旧文件里，搬到前面就拿不到）
  const order = Object.fromEntries(PL.MODULES.map((m, i) => [m.key, i]));
  const A = S.analyze(R.code), pickStart = new Set(pick.map(s => s.start));
  const nowBad = [];
  A.stmts.forEach(s => { if (!pickStart.has(s.start)) return; [...s.now].forEach(n => { const o = P.nameMod.get(n); if (STATE.has(n) || order[o] > order[key]) nowBad.push('L' + s.line + ' ' + n); }); });
  if (nowBad.length) throw new Error('搬到前面以后当场要用的名字还没有：' + nowBad.join('、'));
  // 用到排在后面的模块的名字（不管当场还是以后）：只能是回调口表里的
  const allowCb = Object.entries(PL.CALLBACKS).filter(([k]) => k.startsWith(key + ' → ')).flatMap(([, v]) => v);
  const upBad = [];
  pick.forEach(st => { const r = D.freeRefs(st); new Set([...r.reads, ...r.writes]).forEach(n => { const o = P.nameMod.get(n); if (o && order[o] > order[key] && !allowCb.includes(n) && !STATE.has(n) && !defsOf(st).includes(n)) upBad.push('L' + st.loc.start.line + ' ' + n + '（' + o + '）'); }); });
  if (upBad.length && !opt.allowUp) throw new Error('用到排在后面的模块（不是回调口）：' + upBad.join('、'));
  // 这块定义的名字；别处用到的才进入口
  const defs = new Set(pick.flatMap(ownNames));
  const outside = new Set();
  body.forEach(st => { if (pickStart.has(st.start)) return; const r = D.freeRefs(st); [...r.reads, ...r.writes].forEach(n => { if (defs.has(n)) outside.add(n); }); });
  // 已经搬好的模块文件、www/import/、测试里按名字用的（w.xxx / eval）也算
  const others = fb.filter(b => !legacy.includes(b));
  others.forEach(b => { const r = D.freeRefs(S.parse(b.text)); [...r.reads, ...r.writes].forEach(n => { if (defs.has(n)) outside.add(n); }); });
  const writesOut = [];
  body.forEach(st => { if (pickStart.has(st.start)) return; const r = D.freeRefs(st); [...r.writes].forEach(n => { if (defs.has(n)) writesOut.push(n); }); });
  // 别处给这块的变量赋值的：入口上给读写口（get / set），别处读写的地方都改成「入口.名字」
  const setters = [...new Set(writesOut)];
  const testUse = testNames(path.join(ROOT, 'tests'), defs);
  const exportsList = [...defs].filter(n => outside.has(n) || testUse.has(n)).sort();
  // 对外的名字里，有 let / var 而且这块自己后来又给它赋值的：别处取的那一份会过时，不能这样搬
  const mutable = new Set(pick.filter(st => st.type === 'VariableDeclaration' && st.kind !== 'const').flatMap(ownNames));
  const reassigned = new Set();
  pick.forEach(st => { const r = D.freeRefs(st.type === 'VariableDeclaration' ? { type: 'Program', body: st.declarations.map(d => d.init).filter(Boolean).map(e => ({ type: 'ExpressionStatement', expression: e })) } : st); [...r.writes].forEach(n => { if (mutable.has(n)) reassigned.add(n); }); });
  const stale = exportsList.filter(n => mutable.has(n) && reassigned.has(n));
  // 会变的变量：入口上给一个只读口（get 名字(){ return 名字; }），别处读的地方改成「入口.名字」（只读不写，上面查过没人在外面写）
  testUse.forEach(n => { if (mutable.has(n) && !setters.includes(n)) setters.push(n); });   // 测试里会直接改的（eval('statYear=2027')）也给写口
  setters.forEach(n => { if (!exportsList.includes(n)) exportsList.push(n); });
  exportsList.sort();
  const getters = [...new Set(stale.concat(setters))];
  // 这块用到前面模块的名字（模块文件里取一行）
  const imports = {};
  pick.forEach(st => { const r = D.freeRefs(st); [...r.reads, ...r.writes].forEach(n => { if (defs.has(n)) return; if (STATE.has(n)) return; const o = P.nameMod.get(n); if (o && o !== key && order[o] < order[key] && fs.existsSync(path.join(WWW, PL.MODULES[order[o]].file))) (imports[o] = imports[o] || new Set()).add(n); }); });
  // 拼模块文件
  const IND = '        ';
  let out = '(function(){\n';
  Object.keys(imports).sort((x, y) => order[x] - order[y]).forEach(o => { out += `${IND}const { ${[...imports[o]].sort().join(', ')} } = window.${PL.MODULES[order[o]].entry};   // 用到前面模块的\n`; });
  chunks.forEach(c => { out += RAW.slice(c.a, c.z); });
  // 老入口名单里的名字，原来是顶层 function / var（自己就挂在 window 上），搬进 IIFE 以后要明着挂上，不然 www/import/ 这些找不到
  const movedWin = new Set(); pick.forEach(st => D.freeRefs(st).winSet.forEach(n => movedWin.add(n)));
  const implicit = pick.filter(st => st.type === 'FunctionDeclaration' || (st.type === 'VariableDeclaration' && st.kind === 'var')).flatMap(ownNames).filter(n => PL.LEGACY.includes(n) && !movedWin.has(n));
  implicit.forEach(n => { out += `${IND}window.${n} = ${n};   // 老入口：原来是顶层的，自己就在 window 上，搬进来以后照旧挂上\n`; });
  out += `${IND}window.${mod.entry} = { ${exportsList.map(n => setters.includes(n) ? `get ${n}(){ return ${n}; }, set ${n}(v){ ${n}=v; }` : getters.includes(n) ? `get ${n}(){ return ${n}; }` : n).join(', ')} };   // ${mod.key} 模块对外只有这一个入口${getters.length ? '（get / set 的是会变的变量，读写的时候才去取）' : ''}\n})();\n`;
  // 旧文件剪掉这几块
  const newLegacy = legacy.map(b => {
    let t = '', at = b.start;
    chunks.filter(c => c.f === b).sort((x, y) => x.a - y.a).forEach(c => { t += RAW.slice(at, c.a); at = c.z; });
    t += RAW.slice(at, b.end);
    return { file: b.file, text: t };
  });
  // 旧代码引用表：第一个旧文件开头一行（同一个模块只一行，以后搬别的块再加一行）
  const first = newLegacy[0];
  const legacyUses = new Set();
  body.forEach(st => { if (pickStart.has(st.start)) return; const r = D.freeRefs(st); [...r.reads].forEach(n => { if (defs.has(n)) legacyUses.add(n); }); });
  getters.forEach(n => legacyUses.delete(n));
  const getterSites = [];
  if (getters.length) {
    // 按语法树找到旧文件里用到这几个名字的地方（自由标识符，不是对象的键、不是别处的局部变量），从后往前换成「入口.名字」
    const gset = new Set(getters);
    newLegacy.forEach(b => {
      const sites = [];
      D.freeRefs(S.parse(D.unwrap(b.text)), sites);
      const mine = sites.filter(x => gset.has(x.name)).sort((x, y) => y.start - x.start);
      if (!mine.length) return;
      let t = b.text;
      mine.forEach(x => {
        const ln = t.slice(0, x.start).split('\n').length;
        const rep = x.shorthand ? `${x.name}: ${mod.entry}.${x.name}` : `${mod.entry}.${x.name}`;
        t = t.slice(0, x.start) + rep + t.slice(x.end);
        getterSites.push(`${b.file}:${ln}`);
      });
      const before = b.text.split('\n'), after = t.split('\n');
      b.text = t;
      [...new Set(getterSites.filter(g => g.startsWith(b.file + ':')))].forEach(g => { const ln = +g.split(':')[1]; getterSites.push(`    ${before[ln - 1].trim()}  →  ${after[ln - 1].trim()}`); });
    });
  }
  const refLine2 = legacyUses.size ? `${IND}const { ${[...legacyUses].sort().join(', ')} } = window.${mod.entry};   // 旧代码引用表：${mod.key} 已搬进 ${mod.file}，旧文件都搬完时删掉\n` : '';
  { let at = 0, mm; while ((mm = ALIAS_LINE.exec(first.text.slice(at, at + 4000)))) at += mm[0].length; first.text = first.text.slice(0, at) + refLine2 + first.text.slice(at); }
  // index.html：在第一个旧文件那行前面加上模块文件
  const htmlPath = path.join(WWW, 'index.html');
  let html = fs.readFileSync(htmlPath).toString('utf8');
  const ver = (/build (\d{4}-[A-Z0-9]+(?:-M\d+)?)/.exec(html) || [])[1];
  const firstTag = new RegExp(`( *)<script src="${first.file.replace(/[.]/g, '\\.')}\\?v=[^"]*"></script>`);
  const m = firstTag.exec(html);
  if (!m) throw new Error('index.html 里找不到 ' + first.file);
  html = html.replace(firstTag, `${m[1]}<script src="${mod.file}?v=${ver}"></script>\n${m[0]}`);
  const report = { implicit, getters, setters, getterSites, key, entry: mod.entry, file: mod.file, stmts: pick.length, lines: out.split('\n').length, exports: exportsList, legacyRefs: [...legacyUses].sort(), imports: Object.fromEntries(Object.entries(imports).map(([k, v]) => [k, [...v]])), testUse: [...testUse].sort() };
  if (opt.dry) return report;
  fs.writeFileSync(path.join(WWW, mod.file), out);
  newLegacy.forEach(b => fs.writeFileSync(path.join(WWW, b.file), b.text));
  fs.writeFileSync(htmlPath, html);
  return report;
}
function defsOf(st) { return st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.flatMap(d => namesOf(d.id)) : []; }
function namesOf(p) {
  if (!p) return [];
  if (p.type === 'Identifier') return [p.name];
  if (p.type === 'ObjectPattern') return p.properties.flatMap(x => namesOf(x.value || x.argument));
  if (p.type === 'ArrayPattern') return p.elements.flatMap(namesOf);
  if (p.type === 'AssignmentPattern') return namesOf(p.left);
  if (p.type === 'RestElement') return namesOf(p.argument);
  return [];
}
// 测试里按名字直接用的：w.xxx、t.w.xxx、eval('… xxx …')
function testNames(dir, defs) {
  const out = new Set();
  const files = [];
  const walkDir = d => fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (f === 'node_modules' || f === 'fixtures' || f === 'tools') return; if (fs.statSync(p).isDirectory()) walkDir(p); else if (/\.js$/.test(f)) files.push(p); });
  walkDir(dir);
  files.forEach(f => {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\b(?:w|win|window|t\.w|t\d\.w|tt\.w|W|dom\.window)\.([A-Za-z_$][\w$]*)/g)) if (defs.has(m[1])) out.add(m[1]);
    for (const m of s.matchAll(/\.eval\(\s*(['"`])([^]*?)\1/g)) for (const x of m[2].matchAll(/[A-Za-z_$][\w$]*/g)) if (defs.has(x[0])) out.add(x[0]);
  });
  return out;
}
module.exports = { run, STATE };
if (require.main === module) {
  const r = run(process.argv[2], { dry: process.argv.includes('--dry') });
  console.log(JSON.stringify(r, null, 1));
}
