// modules 分支（1019-Z4-M4 起）：已经搬进模块文件的每一块，全局名字锁死、只留入口。node zZzX-modules-lock.test.js [index.html]
// 对 index.html 引用了的每个模块文件（照 tools/modules-plan.js）：
// 1. 文件就是一个 (function(){ … })();，顶层不定义任何名字；
// 2. 挂到 window 上的只有它的入口和老入口名单（LEGACY）里的名字，入口只挂一次、是 { 名字, … } 这种写法；
// 3. 模块开头取前面模块的那几行（const { … } = window.JiwenXxx;）只取排在它前面的模块；
//    它用到别的模块的名字：排在前面的都要从取的那几行来，排在后面的只能是回调口表（CALLBACKS）里的，
//    全 App 共用的四个状态（currentUser…）这时还在旧文件里，暂时允许；
// 4. 还没搬的旧文件只通过「旧代码引用表」那一行用它（这一行在第一个旧文件开头、只一行，取的名字都在入口里），
//    别的地方不再定义同名的东西；
// 5. 真起一次 App：入口上的名字和文件里写的一样；它里面别的名字不在 window 上（老入口名单除外）。
const fs = require('fs'), path = require('path');
const PL = require('./tools/modules-plan'), D = require('./tools/deps'), S = require('./tools/scan');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const STATE = ['currentUser', 'currentArchive', 'currentTab', 'curPage'];
const namesOf = p => !p ? [] : p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap(x => namesOf(x.value || x.argument)) : p.type === 'ArrayPattern' ? p.elements.flatMap(namesOf) : p.type === 'AssignmentPattern' ? namesOf(p.left) : p.type === 'RestElement' ? namesOf(p.argument) : [];

(async () => {
  const raw = fs.readFileSync(htmlFile).toString('utf8');
  const files = [...raw.matchAll(/<script src="(app\/[^"?]+\.js)\?v=[^"]*"><\/script>/g)].map(m => m[1]);
  const mods = PL.MODULES.filter(m => files.includes(m.file));
  if (!mods.length) { ok(true, '还没有搬好的模块'); console.log(`\n${pass} 通过，${fail} 失败`); process.exit(0); }
  const order = Object.fromEntries(PL.MODULES.map((m, i) => [m.key, i]));
  const P = PL.plan(WWW);
  const legacy = files.filter(f => /^app\/app-\d+-/.test(f));
  const legacyText = legacy.map(f => fs.readFileSync(path.join(WWW, f), 'utf8'));
  const info = {};
  for (const m of mods) {
    const text = fs.readFileSync(path.join(WWW, m.file), 'utf8');
    const ast = S.parse(text);
    // 1
    const st = ast.body[0];
    const iife = ast.body.length === 1 && st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' && st.expression.callee.type === 'FunctionExpression' && st.expression.arguments.length === 0;
    ok(iife && text.startsWith('(function(){\n') && text.endsWith('})();\n'), `1 ${m.file}：整个文件就是一个 (function(){ … })();`);
    ok(S.topDecls(ast).size === 0, `1 ${m.file}：顶层不定义名字`);
    if (!iife) continue;
    const body = st.expression.callee.body.body;
    // 这个模块里定义的名字、取前面模块的那几行、入口那一行
    const own = new Set(), imports = {};
    let entryKeys = null, entryCount = 0;
    body.forEach(s => {
      if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') own.add(s.id.name);
      else if (s.type === 'VariableDeclaration') {
        const d = s.declarations[0];
        const isImport = s.declarations.length === 1 && d.id.type === 'ObjectPattern' && d.init && d.init.type === 'MemberExpression' && d.init.object.name === 'window' && /^Jiwen/.test(d.init.property.name || '');
        if (isImport) { (imports[d.init.property.name] = imports[d.init.property.name] || []).push(...namesOf(d.id)); }
        else s.declarations.forEach(x => namesOf(x.id).forEach(n => own.add(n)));
      } else if (s.type === 'ExpressionStatement' && s.expression.type === 'AssignmentExpression' && s.expression.left.type === 'MemberExpression' && s.expression.left.object.name === 'window' && s.expression.left.property.name === m.entry) {
        entryCount++;
        const o = s.expression.right;
        if (o.type === 'ObjectExpression' && o.properties.every(p => p.shorthand)) entryKeys = o.properties.map(p => p.key.name);
      }
    });
    // 2
    const r = D.freeRefs(st);
    const winBad = [...r.winSet].filter(n => n !== m.entry && !PL.LEGACY.includes(n));
    ok(winBad.length === 0, `2 ${m.file}：挂到 window 上的只有入口 ${m.entry} 和老入口：多了 ${winBad.join('、')}`);
    ok(entryCount === 1 && entryKeys && entryKeys.every(k => own.has(k)), `2 ${m.file}：入口只挂一次、写成 { 名字, … }、都是自己定义的`);
    // 3
    const entryOf = Object.fromEntries(PL.MODULES.map(x => [x.entry, x.key]));
    const badImp = Object.keys(imports).filter(e => !(order[entryOf[e]] < order[m.key]));
    ok(badImp.length === 0, `3 ${m.file}：只从排在前面的模块取：${badImp.join('、')}`);
    const imported = new Set(Object.values(imports).flat());
    const ext = [...r.reads, ...r.writes].filter(n => !own.has(n) && !imported.has(n) && P.nameMod.has(n));
    const allowCb = Object.entries(PL.CALLBACKS).filter(([k]) => k.startsWith(m.key + ' → ')).flatMap(([, v]) => v);
    const extBad = ext.filter(n => !STATE.includes(n) && !allowCb.includes(n));
    ok(extBad.length === 0, `3 ${m.file}：用到别的模块的名字只从取的那几行来（后面的只能是回调口）：${extBad.map(n => n + '（' + P.nameMod.get(n) + '）').join('、')}`);
    const impBad = Object.entries(imports).flatMap(([e, ns]) => ns.filter(n => !(info[entryOf[e]] && info[entryOf[e]].entryKeys.includes(n))).map(n => e + '.' + n));
    ok(impBad.length === 0, `3 ${m.file}：取的名字都在那个模块的入口上：${impBad.join('、')}`);
    info[m.key] = { own, entryKeys: entryKeys || [] };
    // 4
    const aliasRe = new RegExp(`^ *const \\{([^}\\n]*)\\} = window\\.${m.entry};.*$`, 'gm');
    const aliasLines = legacyText.flatMap((t, i) => [...t.matchAll(aliasRe)].map(x => ({ i, names: x[1].split(',').map(s => s.trim()).filter(Boolean), at: x.index })));
    if (legacy.length) {
      ok(aliasLines.length <= 1 && (!aliasLines.length || (aliasLines[0].i === 0)), `4 ${m.file}：旧代码引用表最多一行、在第一个旧文件里`);
      const aliasNames = aliasLines.length ? aliasLines[0].names : [];
      ok(aliasNames.every(n => (entryKeys || []).includes(n)), `4 ${m.file}：旧代码引用表取的都在入口上`);
      // 旧文件（去掉引用表那几行）用到这个模块里的名字：都要在引用表里；也不许自己再定义
      const lt = legacyText.map(t => D.unwrap(t)).join('');
      const lr = D.freeRefs(S.parse(lt));
      const useBad = [...lr.reads, ...lr.writes].filter(n => own.has(n) && !aliasNames.includes(n));
      ok(useBad.length === 0, `4 ${m.file}：旧文件用它的名字都经过旧代码引用表：${useBad.join('、')}`);
      const redef = [...S.topDecls(S.parse(lt)).keys()].filter(n => own.has(n));
      ok(redef.length === 0, `4 ${m.file}：旧文件不再定义同名的东西：${redef.join('、')}`);
    }
  }
  // 5
  const t = await A.boot({ html: fs.readFileSync(htmlFile, 'utf8'), www: WWW, seed: A.seedOf([]) });
  for (const m of mods) {
    const e = t.w[m.entry];
    ok(e && info[m.key] && JSON.stringify(Object.keys(e)) === JSON.stringify(info[m.key].entryKeys), `5 ${m.entry}：入口上的名字和文件里写的一样`);
    const leak = info[m.key] ? [...info[m.key].own].filter(n => !PL.LEGACY.includes(n) && Object.prototype.hasOwnProperty.call(t.w, n)) : [];
    ok(leak.length === 0, `5 ${m.key}：里面的名字没漏到 window 上：${leak.join('、')}`);
  }
  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
