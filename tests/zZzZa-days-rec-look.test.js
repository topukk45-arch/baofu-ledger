// 1020-D 界面（jsdom，管结构；样子、字居中在真 Chromium 里量：tests/ui/audit.js 第 9 段）。node -r ./tools/inline-hook.js zZzZa-days-rec-look.test.js [index.html]
// 一、日子管理页：顶上一行「‹ 返回」+ 标题 +「管理」（没有「＋ 添加」了）；「＋ 添加日子」是主按钮，在底部操作栏 .ui-bar.days-bar；
//     选择模式下底部操作栏换成「删除选中的 N 项」；进页面 body 有 days-page（卡片跟着内容高度走），离开就去掉。功能不变。
// 二、记一笔 / 修改：记账时间一行前面有日历图标；收入 / 支出是一组分段按钮（还是必选、不默认选中），选中的支出 / 收入有各自的颜色类。
// 三、按钮里的字居中：<button> 一类在 @supports (text-box) 里裁掉字体上下的留白；性能记录页第一行是这台手机当场量的「按钮里的字上下差多少」。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
const wait = ms => new Promise(r => setTimeout(r, ms));
const days = [{ id: 'd1', name: '虚构纪念日', date: '2026-12-25' }, { id: 'd2', name: '虚构生日', date: '2027-03-08' }];

(async () => {
  const seed = A.seedOf(recs); seed['days_' + A.ID] = JSON.stringify(days);
  const t = await A.boot({ html, www: WWW, seed });
  const { $, w, d } = t;
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 一、日子管理页
  $('daysManageBtn').click(); await wait(50);
  const head = $('daysHeadNormal');
  ok($('pageDays').style.display === 'block' && d.body.classList.contains('days-page'), '一 进了日子管理页，body 有 days-page');
  ok(head.contains($('daysBack')) && head.contains($('daysManage')) && head.querySelector('.days-title') && !head.contains($('daysAdd')), '一 顶上一行：返回、标题、管理（添加不在顶上）');
  const bar = $('daysBar');
  ok(bar && bar.classList.contains('ui-bar') && bar.contains($('daysAdd')) && $('daysAdd').classList.contains('primary') && /添加日子/.test($('daysAdd').textContent), '一 「＋ 添加日子」是主按钮，在底部操作栏 .ui-bar');
  ok(bar.contains($('daysDelBtn')) && !$('daysDelBar'), '一 删除按钮也在底部操作栏（原来页面底部那一条去掉了）');
  $('daysAdd').click(); await wait(50);
  ok($('dayMask').style.display === 'flex', '一 点「添加日子」照旧打开日子弹窗');
  $('dayMask').style.display = 'none'; await wait(400);
  $('daysManage').click(); await wait(50);
  ok($('dmMask') ? $('dmMask').style.display === 'flex' : true, '一 点「管理」照旧打开管理面板');
  $('dmBatch').click(); await wait(400);
  ok(d.body.classList.contains('days-selecting') && $('daysHeadSelect').style.display === 'flex', '一 批量删除：进选择模式（底部操作栏换成删除，样式里按 days-selecting 切）');
  ok(/删除选中的 0 项/.test($('daysDelBtn').textContent) && $('daysDelBtn').disabled, '一 删除按钮写选中几项、没选时点不了');
  $('daysSelCancel').click(); await wait(50);
  $('daysBack').click(); await wait(50);
  ok(!d.body.classList.contains('days-page') && $('pageLedger').style.display === 'block', '一 返回账单页：days-page 去掉');
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/body\.days-selecting \.days-bar \.days-add\s*\{\s*display:none/.test(css) && /body\.days-selecting \.days-bar \.days-del-btn\s*\{\s*display:block/.test(css), '一 选择模式下：添加藏起来、删除露出来');
  ok(/body\.days-page:not\(\.login-mode\) \.container\s*\{[^}]*padding-bottom:18px/.test(css), '一 日子页卡片不再把底栏留白算进去（下面不空一大块）');

  // 二、记一笔 / 修改
  for (const k of ['bill', 'edit']) {
    const line = $(k + 'TimeLine');
    ok(line.querySelector('svg.rec-time-ico') && line.querySelector('.rec-time-txt') && line.querySelector('.rec-time-arrow'), `二 ${k} 记账时间一行：日历图标 + 时间 + ›`);
  }
  ok(/\.rec-time \{[^}]*min-height:var\(--ui-tap\)[^}]*font-size:16px/.test(css), '二 时间那一行 48px 高、16px 字');
  $('fabAdd').click(); await wait(420); w.kpClose();
  const io = $('billTypeChips');
  ok(io.classList.contains('io-mini') && io.children.length === 2 && ![...io.children].some(c => /sel/.test(c.className)), '二 收支两格一组，打开时都没选（还是必选、不默认选中）');
  [...io.children].find(c => c.textContent === '支出').click();
  ok(/sel-out/.test([...io.children].find(c => c.textContent === '支出').className), '二 选了支出：支出色');
  [...io.children].find(c => c.textContent === '收入').click();
  ok(/sel-in/.test([...io.children].find(c => c.textContent === '收入').className) && !/sel-out/.test([...io.children].find(c => c.textContent === '支出').className), '二 改选收入：收入色，支出取消');
  ok(/\.io-chips\.io-mini \.cc\.sel-out \{ background:var\(--c-neg\)/.test(css) && /\.io-chips\.io-mini \.cc\.sel-in \{ background:var\(--c-pos\)/.test(css), '二 选中的支出用支出色、收入用收入色');
  $('addMask').style.display = 'none'; await wait(400);

  // 三、字居中
  ok(/@supports \(text-box: trim-both cap alphabetic\)\s*\{[^}]*button\.ui-btn/.test(css), '三 <button> 一类裁掉字体上下留白（只在支持 text-box 的 WebView 上）');
  // jsdom 没有 canvas、量不了文字的框：补两个假的（只管这一行写出来、格式对；真数在手机上量）
  w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ fontBoundingBoxAscent: 15, fontBoundingBoxDescent: 4, actualBoundingBoxAscent: 14, actualBoundingBoxDescent: 2 }) });
  if (!w.Range.prototype.getClientRects || !w.document.createRange().getClientRects().length) w.Range.prototype.getClientRects = () => [{ top: 10, height: 19, width: 30 }];
  w.openPerfPage(); await wait(50);
  const first = ($('perfList') ? $('perfList').textContent : '').split('\n')[0];
  ok(/^按钮里的字上下差多少（这台手机当场量/.test(first) && /分类块 .* 统计口径 .* 收支 .* 主按钮 /.test(first), '三 性能记录页第一行：这台手机当场量的按钮里的字差多少 ' + first.slice(0, 40));

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
