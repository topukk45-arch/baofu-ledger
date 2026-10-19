// 依赖分析（modules 分支，第四步「设计模块」用；以后的依赖检查测试也用它）：
//   把 www/app/*.js 按顺序接起来，按「// =====」分节标题分成一节一节，算出每一节：
//     定义了哪些顶层名字、用到别的节的哪些名字（调用函数 / 读变量）、给别的节的变量赋值（写）、挂到 window 上的名字、读 window.xxx 的名字。
//   用法：node tests/tools/deps.js [www 目录] [--json 输出文件] [--names]
//     默认打印每一节一行：节名 → 用到哪几节（几个名字）；--names 再列出具体名字。
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const { topDecls, parse } = require('./scan');

function names(p) {
  if (!p) return [];
  if (p.type === 'Identifier') return [p.name];
  if (p.type === 'ObjectPattern') return p.properties.flatMap(x => names(x.value || x.argument));
  if (p.type === 'ArrayPattern') return p.elements.flatMap(names);
  if (p.type === 'AssignmentPattern') return names(p.left);
  if (p.type === 'RestElement') return names(p.argument);
  return [];
}

// 一段语法树里用到的「自由」标识符（不在里面声明过的），分读和写；不分当场 / 以后（依赖关系都算）
function freeRefs(node) {
  const reads = new Set(), writes = new Set(), winSet = new Set(), winGet = new Set();
  const scopes = [];
  const declared = n => scopes.some(s => s.has(n));
  function hoist(body, sc, fnLevel) {
    for (const st of body) {
      if (!st) continue;
      if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') sc.add(st.id.name);
      else if (st.type === 'VariableDeclaration' && (st.kind !== 'var' || !fnLevel)) st.declarations.forEach(d => names(d.id).forEach(x => sc.add(x)));
    }
  }
  function varsOf(fnBody, sc) {
    walk.simple(fnBody, { VariableDeclaration(d) { if (d.kind === 'var') d.declarations.forEach(x => names(x.id).forEach(n => sc.add(n))); } },
      { ...walk.base, FunctionExpression() {}, ArrowFunctionExpression() {}, FunctionDeclaration() {} });
  }
  function ref(name, isWrite) { if (declared(name)) return; (isWrite ? writes : reads).add(name); }
  function pattern(p, isDecl) {
    if (!p) return;
    if (p.type === 'Identifier') { if (!isDecl) ref(p.name, true); return; }
    if (p.type === 'MemberExpression') { visit(p); return; }
    if (p.type === 'AssignmentPattern') { pattern(p.left, isDecl); visit(p.right); return; }
    if (p.type === 'ObjectPattern') { p.properties.forEach(x => { if (x.computed) visit(x.key); pattern(x.value || x.argument, isDecl); }); return; }
    if (p.type === 'ArrayPattern') { p.elements.forEach(e => pattern(e, isDecl)); return; }
    if (p.type === 'RestElement') pattern(p.argument, isDecl);
  }
  function fn(f) {
    const sc = new Set(['arguments']);
    if (f.id && f.type === 'FunctionExpression') sc.add(f.id.name);
    f.params.forEach(p => names(p).forEach(n => sc.add(n)));
    if (f.body.type === 'BlockStatement') { varsOf(f.body, sc); hoist(f.body.body, sc, true); }
    scopes.push(sc);
    f.params.forEach(p => pattern(p, true));
    if (f.body.type === 'BlockStatement') f.body.body.forEach(visit); else visit(f.body);
    scopes.pop();
  }
  function block(body) { const sc = new Set(); hoist(body, sc, false); scopes.push(sc); body.forEach(visit); scopes.pop(); }
  const isWin = o => o && o.type === 'Identifier' && (o.name === 'window' || o.name === 'globalThis') && !declared(o.name);
  function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'Identifier': ref(n.name, false); return;
      case 'FunctionDeclaration': fn(n); return;
      case 'FunctionExpression': case 'ArrowFunctionExpression': fn(n); return;
      case 'BlockStatement': block(n.body); return;
      case 'StaticBlock': block(n.body); return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const sc = new Set(); const init = n.init || n.left;
        if (init && init.type === 'VariableDeclaration' && init.kind !== 'var') init.declarations.forEach(d => names(d.id).forEach(x => sc.add(x)));
        scopes.push(sc);
        if (n.type === 'ForStatement') { visit(n.init); visit(n.test); visit(n.update); }
        else { if (n.left.type === 'VariableDeclaration') visit(n.left); else pattern(n.left, false); visit(n.right); }
        visit(n.body); scopes.pop(); return;
      }
      case 'CatchClause': { const sc = new Set(names(n.param)); scopes.push(sc); visit(n.body); scopes.pop(); return; }
      case 'VariableDeclaration': n.declarations.forEach(d => { pattern(d.id, true); visit(d.init); }); return;
      case 'ClassDeclaration': case 'ClassExpression': visit(n.superClass); n.body.body.forEach(m => { if (m.computed) visit(m.key); visit(m.value); }); return;
      case 'MemberExpression':
        if (isWin(n.object) && !n.computed) { winGet.add(n.property.name); return; }
        visit(n.object); if (n.computed) visit(n.property); return;
      case 'Property': if (n.computed) visit(n.key); visit(n.value); return;
      case 'PropertyDefinition': case 'MethodDefinition': if (n.computed) visit(n.key); visit(n.value); return;
      case 'LabeledStatement': visit(n.body); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'AssignmentExpression':
        if (n.left.type === 'MemberExpression' && isWin(n.left.object) && !n.left.computed) { winSet.add(n.left.property.name); visit(n.right); return; }
        if (n.left.type === 'Identifier') { ref(n.left.name, true); if (n.operator !== '=') ref(n.left.name, false); visit(n.right); return; }
        pattern(n.left, false); visit(n.right); return;
      case 'UpdateExpression':
        if (n.argument.type === 'Identifier') { ref(n.argument.name, true); ref(n.argument.name, false); return; }
        visit(n.argument); return;
      default:
        for (const k of Object.keys(n)) {
          if (k === 'type' || k === 'loc' || k === 'start' || k === 'end') continue;
          const v = n[k];
          if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && visit(x));
          else if (v && typeof v.type === 'string') visit(v);
        }
    }
  }
  visit(node);
  return { reads, writes, winSet, winGet };
}

// 读 www/index.html 里的 app 脚本，按顺序接起来；返回每个文件的起止
//   分析时把模块文件（(function(){ … })(); 包着的）拆开包装当顶层看，「旧代码引用表」和模块开头取前面模块的那几行
//   （const { … } = window.JiwenXxx;）当成空白——都换成同样长的空格，位置不变，名字还算原来定义它的那个模块的
const MOD_OPEN = '(function(){\n', MOD_CLOSE = '})();\n';
const ALIAS = /^ *const \{[^}\n]*\} = window\.Jiwen\w+;.*$/gm;
function unwrap(c) {
  let t = c;
  if (t.startsWith(MOD_OPEN) && t.endsWith(MOD_CLOSE)) t = ' '.repeat(MOD_OPEN.length - 1) + '\n' + t.slice(MOD_OPEN.length, t.length - MOD_CLOSE.length) + ' '.repeat(MOD_CLOSE.length - 1) + '\n';
  return t.replace(ALIAS, m => ' '.repeat(m.length));
}
function load(www) {
  const html = fs.readFileSync(path.join(www, 'index.html')).toString('utf8');
  const files = [...html.matchAll(/<script src="(app\/[^"?]+\.js)\?v=[^"]*"><\/script>/g)].map(m => m[1]);
  let code = ''; const bounds = [];
  files.forEach(f => { const c = unwrap(fs.readFileSync(path.join(www, f), 'utf8')); bounds.push({ file: f, start: code.length, end: code.length + c.length }); code += c; });
  return { html, files, code, bounds };
}

// 分节：行首 8 个空格的「// ===== 标题」（连着两行 ==== 横线的取中间那行），按位置
function sections(code, bounds) {
  const out = []; const re = /^ {8}\/\/ =====(?!=)\s*(.+?)\s*(=+)?\s*$/gm; let m;
  while ((m = re.exec(code))) out.push({ title: m[1].replace(/=+$/, '').trim(), pos: m.index });
  if (!out.length || out[0].pos > 0) out.unshift({ title: '（开头）', pos: 0 });
  // 文件开头也算一节的开头（文件第一行不是标题时，接着上一节）
  out.forEach((s, i) => { s.end = i + 1 < out.length ? out[i + 1].pos : code.length; s.file = (bounds.find(b => s.pos >= b.start && s.pos < b.end) || {}).file; s.id = i; });
  return out;
}

function analyze(www) {
  const { code, bounds, files, html } = load(www);
  const ast = parse(code);
  const decls = topDecls(ast);
  const secs = sections(code, bounds);
  const secAt = pos => { let lo = 0, hi = secs.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (secs[mid].pos <= pos) lo = mid; else hi = mid - 1; } return lo; };
  const owner = new Map();
  decls.forEach((v, n) => owner.set(n, secAt(v.pos)));
  secs.forEach(s => Object.assign(s, { defs: [], uses: new Map(), writesTo: new Map(), winSet: new Set(), winGet: new Set() }));
  decls.forEach((v, n) => secs[owner.get(n)].defs.push(n));
  ast.body.forEach(st => {
    const s = secs[secAt(st.start)];
    const r = freeRefs(st);
    const self = new Set(st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.flatMap(d => names(d.id)) : []);
    r.reads.forEach(n => { if (!owner.has(n)) return; const o = owner.get(n); if (o === s.id) return; if (!s.uses.has(o)) s.uses.set(o, new Set()); s.uses.get(o).add(n); });
    r.writes.forEach(n => { if (!owner.has(n) || self.has(n)) return; const o = owner.get(n); if (o === s.id) return; if (!s.writesTo.has(o)) s.writesTo.set(o, new Set()); s.writesTo.get(o).add(n); });
    r.winSet.forEach(n => s.winSet.add(n)); r.winGet.forEach(n => s.winGet.add(n));
  });
  // HTML 里 onclick 这类写在属性里的
  const inlineHandlers = [...html.matchAll(/\son([a-z]+)="([^"]*)"/g)].map(m => ({ ev: m[1], code: m[2] }));
  return { files, code, bounds, secs, decls, owner, inlineHandlers };
}

module.exports = { analyze, freeRefs, load, sections, unwrap, ALIAS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const www = args.find(a => !a.startsWith('--') && !/\.json$/.test(a)) || path.join(__dirname, '..', '..', 'www');
  const R = analyze(www);
  const jsonAt = args.indexOf('--json');
  if (jsonAt >= 0) {
    const out = R.secs.map(s => ({ id: s.id, title: s.title, file: s.file, defs: s.defs, uses: Object.fromEntries([...s.uses].map(([k, v]) => [k, [...v]])), writesTo: Object.fromEntries([...s.writesTo].map(([k, v]) => [k, [...v]])), winSet: [...s.winSet], winGet: [...s.winGet] }));
    fs.writeFileSync(args[jsonAt + 1], JSON.stringify({ secs: out, inlineHandlers: R.inlineHandlers }, null, 1));
  }
  R.secs.forEach(s => {
    console.log(`#${s.id} ${s.file} 「${s.title.slice(0, 30)}」 定义 ${s.defs.length} 个；用到：` + [...s.uses].map(([k, v]) => `#${k}(${v.size})`).join(' ') + (s.writesTo.size ? '；写：' + [...s.writesTo].map(([k, v]) => `#${k}(${[...v].join(',')})`).join(' ') : ''));
    if (args.includes('--names')) [...s.uses].forEach(([k, v]) => console.log(`    → #${k}：${[...v].join('、')}`));
  });
  console.log(`HTML 属性里的事件 ${R.inlineHandlers.length} 处`);
}
