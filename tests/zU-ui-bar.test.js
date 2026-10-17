// 1016-UI 界面规矩（jsdom 跑整个 App）。node zU-ui-bar.test.js [index.html]
// jsdom 量不了尺寸（尺寸、位置由 tests/ui/audit.js 用真浏览器量），这里只管结构：
//   导入相关的每一页，主按钮都在底部操作栏 #impBar（.ui-bar）里；顶上的「‹ 返回」在教程、只对账清单里退一层；
//   共用样式里点击区域 48px、间距 8px；「通路自检」「开发用」这类开发用语不再出现在页面上。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const wx = (d, fen, o) => B.txn(Object.assign({ time: { y: 2026, mo: 10, d, h: 12, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构店' + d, desc: '虚构商品', io: 'expense', fen, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o || {}));
const r = (id, d, h, money) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:30`, money, type: 'expense', cat: '吃饭', remark: '午饭' });

(async () => {
  // 共用样式
  ok(/--ui-tap:48px/.test(html) && /--ui-gap:8px/.test(html) && /\.ui-bar \{[^}]*position:fixed[^}]*bottom:0/.test(html) && /safe-area-inset-bottom/.test(html.slice(html.indexOf('.ui-bar {'), html.indexOf('.ui-bar {') + 400)),
    '1 共用样式：点击区域 48、间距 8，底部操作栏固定在底部、留出手势条');
  // 两条同金额的手记 + 一笔账单 → 拿不准，进待处理
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([r('m1', 5, 11, 23), r('m2', 5, 13, 23)]) });
  const { $ } = t;
  const inBar = id => $(id) && $('impBar').contains($(id)) && $('impBar').style.display === 'flex' && $('impBar').classList.contains('ui-bar');
  $('devImportBtn').click();
  await t.until(() => $('impPick'));
  ok(inBar('impPick'), '2 选文件页：「选账单文件」在底部操作栏');
  ok($('impGuideWx').className.includes('ui-choice') && $('impGuideAli').className.includes('ui-choice') && !$('impBar').contains($('impGuideWx')), '2 选文件页：两个教程是整宽大卡片（在内容里，靠下）');
  ok(!/通路自检|开发用/.test($('impPage').textContent) && $('impSelfTest') && /给开发者看/.test($('impSelfTest').textContent), '2 「通路自检」换成大白话，挪到说明下面');
  $('impGuideWx').click();
  ok(inBar('impGuideBack') && inBar('impGuidePick') && $('impBack').textContent === '‹ 返回', '3 教程页：「回去选文件」「选账单文件」在底部操作栏，顶上写「‹ 返回」');
  $('impBack').click();
  ok($('impPick') && !$('impGuide') && $('impPage').style.display === 'block', '3 教程页顶上「‹ 返回」回到选文件，不关页面');
  // 确认页
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: [new t.w.File([B.bill('wechat', [wx(5, 2300), wx(6, 1500)], { range: RANGE }).bytes], '微信.csv')], configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => $('impGo') && /^(新建 \d+ 条记录|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex', 30000);
  // 1017-UI2：确认页分步了；第 1 步底部「取消 / 下一步」；总览主按钮单独一行在上，「上一步 / 只对账」在最下面（返回类放最下面）
  ok(inBar('impCancel') && inBar('impNext') && !$('impBar').contains(t.d.getElementById('impGo')), '4 第 1 步：底部「取消 / 下一步」');
  t.w.JiwenImportUI._goStep('overview');
  const kids = [...$('impBar').children];
  ok(kids[0] === $('impGo') && $('impGo').classList.contains('ui-full') && inBar('impPrev') && inBar('impRecon') && kids.indexOf($('impPrev')) > 0, '4 总览：主按钮单独一行在上，「上一步 / 只对账」在最下面');
  ok($('impBack').textContent === '‹ 取消', '4 确认页顶上还是「‹ 取消」');
  if (!$('impRecon').disabled) {
    $('impRecon').click();
    ok(inBar('impRecon') && inBar('impGo') && !$('impBar').contains($('impCancel')) && $('impBack').textContent === '‹ 返回', '5 只对账清单：「‹ 返回」「补进 K 笔」在底部操作栏');
    $('impBack').click();
    ok(t.S().view.recon === false && $('impTitle').textContent === '导入确认', '5 只对账清单顶上「‹ 返回」回到确认页');
  }
  // 明细的每一行：一行和说明合成一块
  $('impDetailsToggle').click();
  { const h = t.d.querySelector('.imp-gh'); if (h) h.click(); }
  const item = t.d.querySelector('.imp-list .imp-item');
  ok(item && item.querySelector('.al-row') && item.querySelector('.imp-why'), '6 明细：一行和下面的说明合成一块（.imp-item）');
  item.querySelector('.imp-why').click();
  ok($('impSheetMask').style.display === 'flex' && $('impSheetClose') && $('impSheetClose').parentNode.className.includes('imp-sheet-foot'), '6 点说明那一行也能打开详情，「关闭」贴在详情底部');
  if ($('impTrace')) ok(!/开发用/.test($('impTrace').textContent) && /为什么没配上/.test($('impTrace').textContent) && !$('impTrace').classList.contains('open'), '6 「为什么没配上手记」默认收起，不写「开发用」');
  $('impSheetClose').click();
  // 结果页
  A.clickGo(t.w);
  await t.until(() => $('impResult'), 30000);
  ok(inBar('impBackToLedger') && inBar('impUndoThis') && $('impResult').contains($('impResPending')), '7 结果页：「撤销这次导入」「回到账本」在底部操作栏，「还有 N 笔待处理」是按钮');
  // 待处理页
  $('impResPending').click();
  await t.until(() => $('impPendHead'));
  ok(inBar('impPendDropAll') && inBar('impBarClose'), '8 待处理页：「全部不要了」「返回」在底部操作栏');
  // 导入记录、规则页
  await t.w.JiwenImportUI.openLogs();
  ok(inBar('impBarClose') && $('impLogs').classList.contains('imp-push'), '9 导入记录：底部有「返回」，记录少时整块落到下面');
  ok($('impLogsPending') && $('impLogs').compareDocumentPosition($('impLogsPending')) & 4, '9 导入记录：待处理入口在记录下面');
  t.w.JiwenImportUI.openRules();
  ok(inBar('impBarClose') && $('impRuleAddCard') && $('impRuleAddCard').contains($('impRuleAddBtn')) && $('impRuleAddCard').classList.contains('imp-push'), '10 规则页：底部有「返回」，「加一条分类规则」单独一块放在下面');
  // 1016-UI7 / 1017-UI1：下拉框不弹系统自带的选择框，点了弹主程序的共用底部面板（和「筛选」同一套 class）；选分类用分类块，单选
  const ns = $('impRuleNewCat'), wrap = ns.parentNode;
  const sheetOpen = () => $('uiSheetMask') && $('uiSheetMask').classList.contains('open') && $('uiSheetMask').style.display === 'flex';
  ok(wrap.classList.contains('imp-sel'), '11 下拉框套了一层（点它弹记问自己的面板）');
  wrap.click();
  const opts = [...t.d.querySelectorAll('#uiPickList .cc')];
  ok(sheetOpen() && $('uiSheetMask').className.includes('sheet-mask') && $('uiSheet').className.includes('sheet') && $('uiSheet').querySelector('.sheet-grip .sheet-handle') && $('uiSheetTitle').textContent === '归到哪个分类',
    '11 选分类面板：和筛选同一套样子（sheet-mask / sheet / 拖动条），标题写选什么');
  ok($('uiPickList').classList.contains('filter-chips') && opts.length === ns.options.length && opts.filter(b => b.classList.contains('sel')).length === 1 && opts.every(b => !b.closest('.ui-sheet-foot')),
    '11 分类是筛选里那种分类块，一个不少，当前那项高亮');
  ok([...$('uiSheetFoot').querySelectorAll('button')].map(b => b.textContent).join() === '取消', '11 底部只有「取消」');
  let changed = 0; ns.addEventListener('change', () => changed++);
  const other = opts.find(b => !b.classList.contains('sel'));
  other.click();
  ok(!sheetOpen() && ns.value === other.dataset.value && changed === 1, '11 点一下就选中并关掉，下拉框的值跟着变、发一次 change');
  wrap.click(); const before = ns.value;
  [...t.d.querySelectorAll('#uiPickList .cc')].find(b => !b.classList.contains('sel'));
  $('uiSheetCancel').click();
  ok(!sheetOpen() && ns.value === before && changed === 1, '11 点「取消」：面板关掉，什么都不改');
  wrap.click(); await t.back();
  ok(!sheetOpen() && $('impPage').style.display === 'block' && ns.value === before, '11 面板开着时按返回键只关面板、不改');
  $('impBarClose').click();
  ok($('impPage').style.display === 'none' && $('impBar').style.display === 'none', '10 点「返回」关掉导入页、操作栏一起收起');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
