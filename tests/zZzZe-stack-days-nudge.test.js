// 1020-H 第二层不加深、日子页满屏横线、字上下居中（jsdom，记录全是虚构的）。node zZzZe-stack-days-nudge.test.js [index.html]
// 样子、字居中的真数在 tests/ui/audit.js 第 9 段（真 Chromium、照安卓配字体、按截图像素量）。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setTimeout(r, 0));

const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
(async () => {
  const days = id => ({ ['days_' + id]: JSON.stringify([{ id: 'd1', name: '虚构纪念日', date: '2027-01-15', pin: true }, { id: 'd2', name: '虚构生日', date: '2026-03-08' }]) });
  const seed = Object.assign(A.seedOf(recs), days(A.ID));
  const t = await A.boot({ html, www: WWW, seed });
  const { $, w, d } = t;
  const css = [...d.querySelectorAll('style')].map(x => x.textContent).join('\n') + fs.readFileSync(path.join(WWW, 'app', 'app.css')).toString('utf8');
  const over = id => $(id).classList.contains('stack-over');
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // 一、第二层不加深
  $('fabAdd').click(); await wait(420); w.kpClose(); await tick();
  ok(!over('addMask'), '一 只开一层：记一笔照常加遮罩');
  $('billMode').click(); await tick();
  ok(!over('addMask') && over('uiSheetMask'), '一 上面再开统计面板：它的遮罩透明（.stack-over），下面记一笔那层不变');
  w.JiwenSheet.back(); await tick();
  ok(!over('uiSheetMask') && !over('addMask'), '一 关了统计面板：标记去掉');
  $('billRemarkRow').click(); await tick();
  ok(over('txtMask') && !over('addMask'), '一 文字小面板盖上来：也不加深');
  $('txtCancel').click(); await tick();
  $('closeAdd').click(); await wait(20);
  w.openEdit('r1'); await tick();
  $('editTimeLine').click(); await tick();
  ok($('dtMask').style.display === 'flex' && over('dtMask') && !over('editMask'), '一 修改账单上点日期：日期选择不加深（原来下面一下子变灰）');
  w.JiwenDate.closeDtPicker(); await tick();
  w.customConfirm('虚构的确认', () => {}, '确认'); await tick();
  ok(over('askMask') && !over('editMask'), '一 提示框盖在修改账单上：也不加深');
  $('askCancel').click(); await tick();
  $('cancelEdit').click(); await wait(20);
  w.customAlert('只有一层的提示'); await tick();
  ok(!over('askMask'), '一 页面上直接弹的提示框（最下面那层）照常加遮罩');
  $('askOk').click(); await tick();
  ok(/\.mask \{ animation:maskIn var\(--sheet-ms\) var\(--sheet-ease\); \}/.test(css) && /@keyframes maskIn \{ from \{ background-color:rgba\(0,0,0,0\); \} to \{ background-color:rgba\(0,0,0,0\.3\); \} \}/.test(css), '一 遮罩出来和面板同一个时长慢慢变深');
  ok(/\.mask\.stack-over \{ background:transparent; animation:none; \}/.test(css) && /\.sheet-ghost\.stack-over[^{]*\{ background:transparent; animation:none; \}/.test(css), '一 上面那层遮罩透明，收起的影子也不带灰');
  ok(/\.mask\.stack-over > \.sheet[^{]*\{ box-shadow:/.test(css), '一 上面那层只用阴影分开层次');

  // 二、日子页满屏横线
  $('daysManageBtn').click(); await tick();
  const head = $('daysHeadNormal');
  ok(head.children.length === 2 && head.firstElementChild === $('daysBack') && $('daysBack').getAttribute('aria-label') === '返回' && $('daysBack').querySelector('svg') && head.querySelector('.days-title').textContent === '日子', '二 顶上一行：返回图标按钮 + 「日子」');
  ok(/\.days-head \{[^}]*border-bottom:2px solid var\(--c-primary-dark\)/.test(css), '二 顶上那行下面一条实线（主题色）');
  const bar = $('daysBar'), btns = [...bar.children].filter(b => b.id !== 'daysDelBtn');
  ok(btns[0] === $('daysAdd') && btns[1] === $('daysManage') && $('daysAdd').textContent === '添加日子' && $('daysAdd').classList.contains('primary') && $('daysAdd').classList.contains('ui-full') && $('daysManage').classList.contains('ui-full') && !$('daysManage').classList.contains('primary'), '二 底部两个整宽按钮：「添加日子」（主按钮，没有「＋」）在上、「管理」（次要）在下');
  const items = [...$('daysList').querySelectorAll('.day-item')];
  ok(items.length === 2 && items[0].querySelector('svg.di-star[aria-label="置顶"]') && !items[1].querySelector('.di-star') && !/★/.test($('daysList').textContent), '二 置顶的前面一个小星（图标，不再写「★置顶」）');
  ok(/#pageDays \.day-item \{ height:72px;[^}]*border-bottom:1px dashed var\(--c-border\)/.test(css) && /\.cs-row \{[^}]*border-bottom:1px dashed var\(--c-border\)/.test(css), '二 每个日子一行 72px，下面一条虚线（和分类汇总的虚线同一个样式）');
  ok($('daysLines') && /\.days-lines > div \{ height:72px; border-bottom:1px dashed var\(--c-border\); opacity:\.5; \}/.test(css), '二 没东西的地方接着画更淡的虚线');
  ok(/body\.days-page:not\(\.login-mode\) \.container \{ background:transparent; border:none; border-radius:0; box-shadow:none; padding:0; \}/.test(css), '二 去掉外面那圈卡片框，整页铺满');
  $('daysManage').click(); await tick();
  ok($('dayMgrMask').style.display === 'flex', '二 「管理」照旧打开管理面板');
  $('dayMgrMask').style.display = 'none'; await tick();
  $('daysBack').click(); await tick();
  ok($('pageDays').style.display === 'none' && !d.body.classList.contains('days-page'), '二 返回照旧');

  // 三、字上下居中：分类块、收支的字包在 span 里裁；不支持的往下挪；开发开关里的调节
  $('fabAdd').click(); await wait(420); w.kpClose();
  ok([...$('billCatChips').children, ...$('billTypeChips').children].every(c => c.firstElementChild && c.firstElementChild.classList.contains('cc-t')), '三 分类块、收支的字包一层 .cc-t（flex 容器本身裁不到）');
  ok(/@supports \(text-box: trim-both cap alphabetic\) \{\s*\.cc-t, \.rec-time-txt, \.rec-row-k, \.rec-row-v/.test(css), '三 支持 text-box 的：裁 .cc-t、记账时间、列表卡的行');
  ok(/@supports not \(text-box: trim-both cap alphabetic\) \{ :root \{ --txt-nudge-auto:1px; \} \}/.test(css) && /--txt-nudge:var\(--txt-nudge-dev, var\(--txt-nudge-auto\)\)/.test(css), '三 不支持的旧 WebView：统一往下挪 1px（一个变量管住）');
  $('closeAdd').click(); await wait(20);
  ok(w.JiwenBase.txtNudge() === null && !d.documentElement.style.getPropertyValue('--txt-nudge-dev'), '三 默认「自动」：不写 --txt-nudge-dev');
  d.querySelector('.tab-btn[data-tab="settings"]').click(); await tick();
  ok($('devNudgeBtn').style.display === '' && $('devNudgeVal').textContent === '自动', '三 开发开关开着：设置里有「字往下挪几像素（开发中）」，写「自动」');
  $('devNudgeBtn').click(); await tick();
  const opts = [...d.querySelectorAll('#uiPickList .ui-pick-opt')];
  ok(opts.map(o => o.dataset.value).join() === 'auto,0,0.5,1,1.5,2,2.5,3', '三 0～3px，每档 0.5，还有「自动」');
  opts.find(o => o.dataset.value === '1.5').click(); await tick();
  ok(d.documentElement.style.getPropertyValue('--txt-nudge-dev') === '1.5px' && w.localStorage.getItem('app_txt_nudge') === '1.5' && $('devNudgeVal').textContent === '1.5 px', '三 选 1.5：马上写进 --txt-nudge-dev，只存这台手机');
  w.JiwenBase.applyTxtNudge(); w.localStorage.setItem('app_txt_nudge', '9'); w.JiwenBase.applyTxtNudge();
  ok(!d.documentElement.style.getPropertyValue('--txt-nudge-dev'), '三 存的值不对（超过 3）：当作自动');
  w.JiwenBase.setTxtNudge(null);
  ok(w.localStorage.getItem('app_txt_nudge') === null, '三 选回「自动」：删掉');
  // 分类汇总的 ↓ / ↑ 画成图标（字还在按钮里）
  ok(/\.cs-hint \{ font-size:0;/.test(css) && /\.cs-hint\[data-end="1"\]::before \{ transform:rotate\(180deg\); \}/.test(css) && $('catStatsHint').textContent === '↓', '三 分类汇总的 ↓ / ↑ 画成图标，按钮里的字照旧（读屏认）');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`1020-H 第二层不加深、日子页、字居中：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
