// modules 分支（1019-Z4-M2 起）：index.html 拆成 www/app/*.js + app.css 以后的几样检查。node zZzV-split-files.test.js [index.html]
// 1. 引用写法：普通同步 <script src>（不带 defer / async / type=module）、先是已经搬好的模块（照 tools/modules-plan.js 的先后）、再是还没搬的 app-N（按编号）、?v= 和登录页版本号一样；样式是一个 <link>
// 2. 全局重名：两个文件在顶层定义了同一个名字就报错（let / const 重名会让后一个文件整个跑不起来，function 重名会悄悄盖掉前一个）
// 3. 跨文件先用后定义：前一个文件顶层当场跑的代码（含当场调用的函数）用到后面文件才定义的名字就报错；
//    前一个文件登记的计时器 / Promise.then / 观察器要用后面文件的名字也报错（文件之间的空档里可能先跑）；
//    事件监听（点按钮、切后台）只列出来不报错：空档里用户点不到那些按钮，切后台那两个开头就看没进账号直接返回（见提交说明）
// 4. 真按外部文件加载（不拼回单文件）：jsdom 照安卓上的地址一个个去读 app/*.js、app.css，App 照常起来、进账号、能切页签，不报错
const fs = require('fs'), path = require('path');
const S = require('./tools/scan');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile);
const raw = fs.readFileSync(htmlFile).toString('utf8');   // 读成字节再转字：不经过 inline-hook，拿到的是拆开的原样
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const tags = [...raw.matchAll(/<script\b[^>]*\bsrc="(app\/[^"]+)"[^>]*><\/script>/g)];
  if (!tags.length) {   // 老版本单文件（用 regress / 对比旧版时）：没有拆开，这几条不适用
    ok(!/app\/app-/.test(raw), '单文件版本：没有 app/ 引用');
    console.log(`\n${pass} 通过，${fail} 失败`); process.exit(fail ? 1 : 0);
  }
  // 1. 引用写法
  const build = (raw.match(/build (\d{4}-[A-Z0-9]+(?:-M\d+)?)/) || [])[1];
  ok(build, '1 登录页有版本号');
  ok(tags.every(m => /^<script src="app\/[^"?]+\.js\?v=[^"]+"><\/script>$/.test(m[0])), '1 每个都是普通的 <script src="…">，没有 defer / async / type：' + tags.filter(m => !/^<script src="[^"]+"><\/script>$/.test(m[0])).map(m => m[0]).join(' '));
  const files = tags.map(m => m[1].split('?')[0]);
  ok(tags.every(m => m[1].endsWith('?v=' + build)), '1 每个 ?v= 都是版本号 ' + build);
  // 1019-Z4-M4 起：前面是搬好的模块文件（照设计表的先后），后面是还没搬的 app-N（编号从小到大、不跳号以外不许乱）
  const PLAN = require('./tools/modules-plan').MODULES.map(m => m.file);
  const modFiles = files.filter(f => !/^app\/app-\d+-/.test(f)), oldFiles = files.filter(f => /^app\/app-\d+-/.test(f));
  const nums = oldFiles.map(f => +f.match(/^app\/app-(\d+)-/)[1]);
  ok(files.slice(0, modFiles.length).every((f, i) => f === modFiles[i]) && modFiles.every(f => PLAN.includes(f)) && modFiles.every((f, i) => !i || PLAN.indexOf(f) > PLAN.indexOf(modFiles[i - 1])), '1 模块文件在前、照设计表的先后：' + modFiles.join(' '));
  ok(nums.length > 0 && nums.every((n, i) => !i || n > nums[i - 1]), '1 还没搬的 app-N 在后、按编号顺序：' + oldFiles.join(' '));
  const lines = raw.split('\n'), first = lines.findIndex(l => l.includes(tags[0][0]));
  ok(tags.every((m, i) => lines[first + i].trim() === m[0]), '1 几个脚本一行一个、挨着放');
  const links = [...raw.matchAll(/<link rel="stylesheet" href="(app\/[^"]+)">/g)];
  ok(links.length === 1 && links[0][1] === 'app/app.css?v=' + build, '1 样式一个 <link>：app/app.css?v=' + build);
  ok(files.every(f => fs.existsSync(path.join(WWW, f))) && fs.existsSync(path.join(WWW, 'app/app.css')), '1 引用的文件都在');
  const bigInline = [...raw.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(bigInline.length === 1 && /bootSnap/.test(bigInline[0]) && raw.indexOf(bigInline[0]) < raw.indexOf(tags[0][0]), '1 只剩首屏快照那一小段内联脚本，留在原位（在 app 脚本前面）');

  // 2. 全局重名
  const codes = files.map(f => fs.readFileSync(path.join(WWW, f), 'utf8'));
  const owner = new Map(), dups = [];
  const D = require('./tools/deps');
  codes.forEach((c, i) => {
    const decl = S.topDecls(S.parse(D.unwrap(c)));   // 1019-Z4-M4 起：模块文件拆开包装算它里面的名字，旧代码引用表那一行不算定义
    decl.forEach((v, name) => {
      if (v.dup) dups.push(`${name}（${files[i]} 里定义了 ${v.dup.length + 1} 次）`);
      if (owner.has(name)) dups.push(`${name}（${owner.get(name)} 和 ${files[i]}）`); else owner.set(name, files[i]);
    });
  });
  ok(dups.length === 0, '2 没有全局重名：' + dups.join('、'));
  ok(owner.size > 600, '2 名字都数到了（旧文件的顶层 + 模块里面的）：' + owner.size);

  // 3. 跨文件先用后定义
  let code = ''; const bounds = [];
  codes.forEach((c, i) => { bounds.push([code.length, code.length + c.length]); code += c; });
  const fileAt = pos => bounds.findIndex(b => pos >= b[0] && pos < b[1]);
  const R = S.analyze(code);
  const declFile = new Map([...R.decls].map(([k, v]) => [k, fileAt(v.pos)]));
  const nowBad = [], timerBad = [], listen = new Set();
  const TIMER = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'then', 'catch', 'finally', 'queueMicrotask', 'observe']);
  R.stmts.forEach(st => {
    const fi = fileAt(st.start);
    st.now.forEach(n => { if (declFile.get(n) > fi) nowBad.push(`${files[fi]} 第 ${st.line} 行（拼起来的行号）当场用 ${n}（在 ${files[declFile.get(n)]}）`); });
    st.deferred.forEach(d => {
      const later = [...d.needs].filter(n => declFile.get(n) > fi);
      if (!later.length) return;
      if (TIMER.has(d.via)) timerBad.push(`${files[fi]} 第 ${d.line} 行 ${d.via} 要用 ${later.slice(0, 5).join('、')}`);
      else listen.add(files[fi] + ' ' + d.via);
    });
  });
  ok(nowBad.length === 0, '3 顶层当场跑的代码没有用到后面文件才定义的名字：' + nowBad.join('；'));
  ok(timerBad.length === 0, '3 顶层登记的计时器 / Promise.then / 观察器没有要用后面文件的名字：' + timerBad.join('；'));
  // 切后台那两个监听要用后面文件的函数：开头就看没进账号直接返回，空档里不会走到（锁住这一点，以后改了要重新看）
  const fnSrc = name => { const m = code.match(new RegExp('function ' + name + '\\(\\)\\{([\\s\\S]{0,200})')); return m ? m[1] : ''; };
  ok(/^\s*if\(!(JiwenBase\.)?currentUser \|\| \$\('mainBox'\)\.style\.display!=='block'\) return;/.test(fnSrc('resumeSave')), '3 切后台的 resumeSave 开头就看没进账号直接返回');   // 1019-Z4-M20 起写成 JiwenBase.currentUser
  ok(/__ledger\.forEach/.test(fnSrc('ledgerFlushOnHide')) && fileAt(code.indexOf('const __ledger')) <= fileAt(code.indexOf('function ledgerFlushOnHide')), '3 切后台的 ledgerFlushOnHide 只在已经读进来的账本上做（空档里账本还没读，什么都不做）');

  // 4. 真按外部文件加载
  const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
  const t = await A.boot({ html: raw, www: WWW, seed: A.seedOf(recs) });
  const got = t.log.filter(p => /^app\//.test(p));
  ok(files.every(f => got.includes(f)) && got.includes('app/app.css'), '4 一个个读了 app/*.js 和 app.css：' + got.join(' '));
  ok(typeof t.w.switchTab === 'function' && typeof t.w.JiwenStore.loadStore === 'function' && t.w.JiwenSheet && t.w.JiwenPerf, '4 各个文件里的全局都在');
  ok(t.$('mainBox').style.display === 'block' && t.$('loginBox').style.display === 'none', '4 自动进了账号（主界面出来、登录框收起）');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  ok(/虚构午饭/.test(t.$('billList').textContent), '4 账单页列出记录');
  t.d.querySelector('.tab-btn[data-tab="stats"]').click();
  ok(t.$('pageStats').style.display === 'block' && t.$('pageLedger').style.display === 'none', '4 能切到统计页');
  ok(t.errs.length === 0, '4 没有报错 ' + t.errs.join('；'));

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
