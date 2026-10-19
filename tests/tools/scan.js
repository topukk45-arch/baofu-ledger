// 拆 index.html 用的扫描工具（modules 分支）：把大脚本按「顶层语句」拆开，算出每条顶层语句跑的时候要用到哪些顶层名字
// （直接用到的 + 它当场调用的函数里用到的，一层层追下去；立即执行的函数、forEach 这类当场跑的回调、new Promise 的执行函数算当场跑），
// 以及顶层登记的「以后才跑」的回调（事件、计时器、观察器、Promise.then）用到哪些名字。给切分脚本、依赖检查测试共用。
'use strict';
const acorn = require('acorn');
const walk = require('acorn-walk');

const SYNC_CB = new Set(['forEach', 'map', 'filter', 'some', 'every', 'reduce', 'reduceRight', 'sort', 'find', 'findIndex', 'findLast', 'flatMap', 'call', 'apply']);
const DEFER_CB = new Set(['addEventListener', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'then', 'catch', 'finally', 'observe', 'onclick', 'queueMicrotask']);

function parse(code) { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowAwaitOutsideFunction: false }); }

// 顶层声明：名字 → { kind: 'function'|'var'|'let'|'const'|'class', stmt: 顶层语句序号, pos }
function topDecls(ast) {
  const out = new Map();
  ast.body.forEach((st, i) => {
    const add = (name, kind) => { if (!out.has(name)) out.set(name, { kind, stmt: i, pos: st.start }); else out.get(name).dup = (out.get(name).dup || []).concat([{ kind, stmt: i }]); };
    if (st.type === 'FunctionDeclaration') add(st.id.name, 'function');
    else if (st.type === 'ClassDeclaration') add(st.id.name, 'class');
    else if (st.type === 'VariableDeclaration') st.declarations.forEach(d => names(d.id).forEach(n => add(n, st.kind)));
  });
  return out;
}
function names(p) {
  if (!p) return [];
  if (p.type === 'Identifier') return [p.name];
  if (p.type === 'ObjectPattern') return p.properties.flatMap(x => names(x.value || x.argument));
  if (p.type === 'ArrayPattern') return p.elements.flatMap(names);
  if (p.type === 'AssignmentPattern') return names(p.left);
  if (p.type === 'RestElement') return names(p.argument);
  return [];
}
const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');

// 在一段语法树里找「当场」用到的标识符（不进函数体，除非这个函数当场被调用），以及当场调用的回调、以后才跑的回调
// 局部变量（函数参数、块里声明的）不算顶层名字：用作用域粗略排除——只要这个名字在外层某个函数 / 块里声明过就不算
function scanNode(node, scope) {
  const refs = new Set(), calls = new Set(), deferred = [];
  function declaredIn(sc, name) { for (let s = sc; s; s = s.up) if (s.names.has(name)) return true; return false; }
  function blockScope(body, up) {
    const sc = { names: new Set(), up };
    (body || []).forEach(st => {
      if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') sc.names.add(st.id.name);
      if (st.type === 'VariableDeclaration') st.declarations.forEach(d => names(d.id).forEach(n => sc.names.add(n)));
    });
    return sc;
  }
  function fnScope(fn, up) {
    const sc = { names: new Set(), up };
    fn.params.forEach(p => names(p).forEach(n => sc.names.add(n)));
    if (fn.id && fn.type === 'FunctionExpression') sc.names.add(fn.id.name);
    // 函数体里 var 声明（任意深度）都算本函数的
    walk.simple(fn.body, { VariableDeclaration(d) { d.declarations.forEach(x => names(x.id).forEach(n => sc.names.add(n))); }, FunctionDeclaration(f) { sc.names.add(f.id.name); }, ClassDeclaration(c) { sc.names.add(c.id.name); } }, { ...walk.base, FunctionExpression() {}, ArrowFunctionExpression() {} });
    sc.names.add('arguments');
    return sc;
  }
  // now=true：当场跑
  function visit(n, sc, now) {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'Identifier': if (!declaredIn(sc, n.name)) (now ? refs : null) && refs.add(n.name); return;
      case 'MemberExpression': visit(n.object, sc, now); if (n.computed) visit(n.property, sc, now); return;
      case 'Property': if (n.computed) visit(n.key, sc, now); visit(n.value, sc, now); return;
      case 'MethodDefinition': case 'PropertyDefinition': if (n.computed) visit(n.key, sc, now); if (n.value) visitFn(n.value, sc, false, 'method'); return;
      case 'LabeledStatement': visit(n.body, sc, now); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'FunctionDeclaration': visitFn(n, sc, false, 'decl'); return;
      case 'FunctionExpression': case 'ArrowFunctionExpression': visitFn(n, sc, false, 'expr'); return;
      case 'BlockStatement': { const b = blockScope(n.body, sc); n.body.forEach(s => visit(s, b, now)); return; }
      case 'Program': n.body.forEach(s => visit(s, sc, now)); return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const b = { names: new Set(), up: sc };
        const init = n.init || n.left; if (init && init.type === 'VariableDeclaration') init.declarations.forEach(d => names(d.id).forEach(x => b.names.add(x)));
        for (const k of ['init', 'test', 'update', 'left', 'right', 'body']) if (n[k]) visit(n[k], b, now);
        return;
      }
      case 'CatchClause': { const b = { names: new Set(names(n.param)), up: sc }; visit(n.body, b, now); return; }
      case 'VariableDeclarator': visitPattern(n.id, sc, now); if (n.init) visit(n.init, sc, now); return;
      case 'CallExpression': case 'NewExpression': {
        const cal = n.callee;
        const prop = cal.type === 'MemberExpression' && !cal.computed ? cal.property.name : (cal.type === 'Identifier' ? cal.name : '');
        // 立即执行
        if (isFn(cal)) { visitFn(cal, sc, now, 'iife'); n.arguments.forEach(a => visit(a, sc, now)); return; }
        if (cal.type === 'MemberExpression' && isFn(cal.object) && (prop === 'call' || prop === 'apply')) { visitFn(cal.object, sc, now, 'iife'); n.arguments.forEach(a => visit(a, sc, now)); return; }
        visit(cal, sc, now);
        if (now && cal.type === 'Identifier' && !declaredIn(sc, cal.name)) calls.add(cal.name);
        const deferCall = DEFER_CB.has(prop) || (n.type === 'NewExpression' && /Observer$/.test(prop));
        const syncCall = SYNC_CB.has(prop) || (n.type === 'NewExpression' && prop === 'Promise');
        n.arguments.forEach(a => {
          if (isFn(a)) {
            if (deferCall) { const r = scanFnBody(a, sc); deferred.push({ via: prop, line: a.loc.start.line, refs: r.refs, calls: r.calls, deferred: r.deferred }); }
            else if (syncCall) visitFn(a, sc, now, 'sync');
            else { const r = scanFnBody(a, sc); deferred.push({ via: prop || '(函数参数)', line: a.loc.start.line, refs: r.refs, calls: r.calls, deferred: r.deferred, maybe: true }); }
          } else visit(a, sc, now);
        });
        return;
      }
      case 'AssignmentExpression': {
        // x.onclick = function(){}：以后才跑
        if (isFn(n.right) && n.left.type === 'MemberExpression' && !n.left.computed && /^on/.test(n.left.property.name)) { visit(n.left, sc, now); const r = scanFnBody(n.right, sc); deferred.push({ via: n.left.property.name, line: n.right.loc.start.line, refs: r.refs, calls: r.calls, deferred: r.deferred }); return; }
        visitPattern(n.left, sc, now); visit(n.right, sc, now); return;
      }
      case 'ClassDeclaration': case 'ClassExpression': if (n.superClass) visit(n.superClass, sc, now); n.body.body.forEach(m => visit(m, sc, now)); return;
      default:
        for (const k of Object.keys(n)) { if (k === 'type' || k === 'loc' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && visit(x, sc, now)); else if (v && typeof v.type === 'string') visit(v, sc, now); }
    }
  }
  function visitPattern(p, sc, now) { if (!p) return; if (p.type === 'Identifier') { if (!declaredIn(sc, p.name) && now) refs.add(p.name); return; } if (p.type === 'MemberExpression') return visit(p, sc, now); names(p); if (p.type === 'AssignmentPattern') { visitPattern(p.left, sc, now); visit(p.right, sc, now); } else if (p.type === 'ObjectPattern') p.properties.forEach(x => { if (x.computed) visit(x.key, sc, now); visitPattern(x.value || x.argument, sc, now); }); else if (p.type === 'ArrayPattern') p.elements.forEach(e => visitPattern(e, sc, now)); else if (p.type === 'RestElement') visitPattern(p.argument, sc, now); }
  function visitFn(fn, sc, now, how) {
    const fsc = fnScope(fn, sc);
    if (fn.async && now) {
      // async 函数：第一个 await 之前当场跑，之后算以后才跑（粗略：整个函数体都当场扫，但把 await 之后的也记一份「以后」）
    }
    if (now) { fn.params.forEach(p => { if (p.type === 'AssignmentPattern') visit(p.right, fsc, true); }); if (fn.body.type === 'BlockStatement') { const b = blockScope(fn.body.body, fsc); fn.body.body.forEach(s => visit(s, b, true)); } else visit(fn.body, fsc, true); }
    else { const r = scanFnBody(fn, sc); if (how !== 'decl') deferredBodies.push(r); }
  }
  const deferredBodies = [];
  function scanFnBody(fn, sc) { const r = scanNode(fn.body.type === 'BlockStatement' ? fn.body : { type: 'ExpressionStatement', expression: fn.body }, fnScope(fn, sc)); return r; }
  visit(node, scope || { names: new Set(), up: null }, true);
  return { refs, calls, deferred };
}

// 一个函数声明的函数体里用到的名字（不当场跑，给「当场调用了它」时追下去用）
function fnBodyRefs(fn) {
  const r = scanNode(fn.body.type === 'BlockStatement' ? fn.body : { type: 'ExpressionStatement', expression: fn.body }, (function () {
    const sc = { names: new Set(), up: null }; fn.params.forEach(p => names(p).forEach(n => sc.names.add(n))); sc.names.add('arguments');
    walk.simple(fn.body, { VariableDeclaration(d) { d.declarations.forEach(x => names(x.id).forEach(n => sc.names.add(n))); }, FunctionDeclaration(f) { sc.names.add(f.id.name); } }, { ...walk.base, FunctionExpression() {}, ArrowFunctionExpression() {} });
    return sc;
  })());
  return r;
}

// 每条顶层语句当场要用的顶层名字（追函数调用），只留顶层声明过的名字
function analyze(code) {
  const ast = parse(code);
  const decls = topDecls(ast);
  const fnNodes = new Map();
  ast.body.forEach(st => { if (st.type === 'FunctionDeclaration') fnNodes.set(st.id.name, st); });
  // const f = () => {} / function(){} 也当函数追
  ast.body.forEach(st => { if (st.type === 'VariableDeclaration') st.declarations.forEach(d => { if (d.id.type === 'Identifier' && isFn(d.init)) fnNodes.set(d.id.name, d.init); }); });
  const bodyMemo = new Map();
  const bodyOf = name => { if (!bodyMemo.has(name)) { bodyMemo.set(name, { refs: new Set(), calls: new Set() }); bodyMemo.set(name, fnBodyRefs(fnNodes.get(name))); } return bodyMemo.get(name); };
  // 当场要「存在」的名字：直接提到的都要有；当场「调用」的函数，再把它函数体里提到 / 调用的追下去
  function closure(refs, calls) {
    const out = new Set([...refs].filter(n => decls.has(n))), seen = new Set(), stack = [...(calls || [])];
    while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); if (decls.has(n)) out.add(n);
      if (fnNodes.has(n)) { const b = bodyOf(n); b.refs.forEach(x => { if (decls.has(x)) out.add(x); }); b.calls.forEach(x => stack.push(x)); } }
    return out;
  }
  const stmts = ast.body.map((st, i) => {
    let r;
    if (st.type === 'FunctionDeclaration') r = { refs: new Set(), calls: new Set(), deferred: [] };
    else r = scanNode(st);
    return { i, start: st.start, end: st.end, line: st.loc.start.line, endLine: st.loc.end.line, type: st.type, now: closure(r.refs, r.calls), deferred: r.deferred.map(d => ({ via: d.via, line: d.line, maybe: !!d.maybe, needs: closure(d.refs, d.calls) })) };
  });
  return { ast, decls, stmts, closure };
}

module.exports = { parse, analyze, topDecls, scanNode };
