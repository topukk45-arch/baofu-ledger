// 1017-UI10 详情弹窗统一成筛选的样式、改动确认以后才改底下的页面（jsdom 跑整个 App）。node zZs-import-sheet.test.js [index.html]
// 行详情是共用底部面板（拖动条、标题）：改动先暂存，底部「确定 / 取消」，点「确定」才改、那一行闪一下；「取消」、返回键、往下拉都等于没改；
// 选分类在面板里展开分类块（不另弹一个）；只看不改的（待处理详情、导入记录详情、只能看的行）底部只有「关闭」。账单、手记全是虚构的。
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
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h: h || 12, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '/', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const bill = txns => [['微信.csv', B.bill('wechat', txns, { range: RANGE }).bytes]];
const r = (id, d, hm, money, cat) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${hm}`, money, type: 'expense', cat: cat || '吃饭', remark: '午饭' });
async function pick(t, files) {
  const $ = id => t.d.getElementById(id);
  $('devImportBtn').click();
  await t.until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new t.w.File([bytes], name)), configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan, 30000);
}
const MANUAL = [{ id: 'p', time: '2026-10-06T12:00', money: 20, type: 'expense', cat: '购物', remark: '文具' }, { id: 'q', time: '2026-10-08T12:00', money: 30, type: 'expense', cat: '购物', remark: '本子' }];
const TX = () => [
  wx({ time: T(6, 12, 10), cp: '某虚构快餐店', desc: '米饭套餐', fen: 2100 }),       // 待你确认（候选 p）
  wx({ time: T(12, 9), cp: '某虚构平台甲', fen: 1999 }),                          // 新增
  wx({ time: T(8, 12, 10), cp: '某虚构面馆', desc: '牛肉面', fen: 3100 }),          // 留在待处理（候选 q）
];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
  const q = s => t.d.querySelector(s), raw = id => t.d.getElementById(id), S = () => t.S();
  const open = () => !!raw('impSheet') && q('#uiSheetMask').classList.contains('open');
  await pick(t, bill(TX())); const UI = t.w.JiwenImportUI;
  const keyOf = cp => S().plan.rows.find(d => d.cp === cp).key;
  const kNew = keyOf('某虚构平台甲'), kPend = keyOf('某虚构快餐店');
  // 打开明细里那一行
  const openRow = k => { const S0 = S(); S0.view.details = true; Object.keys(S0.plan.groups).forEach(g => { S0.view.open[g] = true; }); UI._goStep('overview'); Array.from(t.d.querySelectorAll('#impBody .al-row')).find(r => r.dataset.key === k).click(); };
  // ===== 1. 共用底部面板：拖动条、标题；底部「确定」在上、「取消」在下 =====
  openRow(kNew);
  ok(open() && q('#uiSheet .sheet-handle') && raw('uiSheetTitle').textContent === '这笔账单', '1 行详情是共用底部面板（拖动条、标题「这笔账单」）');
  const foot = raw('uiSheetFoot');
  ok(raw('impSheetOk') && raw('impSheetClose') && raw('impSheetClose').textContent === '取消' && foot.contains(raw('impSheetOk')) && (raw('impSheetOk').compareDocumentPosition(raw('impSheetClose')) & 4), '1 底部「确定」在上、「取消」在最下面');
  // ===== 2. 改分类：面板里展开分类块；没点确定之前底下不变 =====
  const cat0 = S().plan.rows.find(d => d.key === kNew).cat;
  q('#impSheet .imp-cat-btn').click();
  ok(q('#impSheet .imp-cat-chips .cc') && !t.d.querySelector('#uiPickList'), '2 选分类：在面板里展开分类块，不另弹一个');
  Array.from(t.d.querySelectorAll('#impSheet .imp-cat-chips .cc')).find(x => x.textContent === '购物').click();
  ok(S().plan.rows.find(d => d.key === kNew).cat === cat0 && !S().edits.rows[kNew] && /改动还没生效/.test(raw('impSheet').textContent), '2 点了分类：底下的页面没变，面板里写「改动还没生效，点「确定」才改」');
  raw('impSheetClose').click();
  ok(!open() && !S().edits.rows[kNew] && S().plan.rows.find(d => d.key === kNew).cat === cat0, '2 「取消」：等于没改');
  // 返回键 = 取消
  openRow(kNew); q('#impSheet .imp-cat-btn').click(); Array.from(t.d.querySelectorAll('#impSheet .imp-cat-chips .cc')).find(x => x.textContent === '购物').click();
  t.w.JiwenSheet.back();
  ok(!open() && !S().edits.rows[kNew], '2 返回键 / 往下拉：等于没改');
  // 确定
  openRow(kNew); q('#impSheet .imp-cat-btn').click(); Array.from(t.d.querySelectorAll('#impSheet .imp-cat-chips .cc')).find(x => x.textContent === '购物').click();
  raw('impSheetOk').click();
  const row = Array.from(t.d.querySelectorAll('#impBody [data-key]')).find(n => n.dataset.key === kNew);
  ok(!open() && S().edits.rows[kNew].cat === '购物' && S().plan.rows.find(d => d.key === kNew).cat === '购物' && row && row.classList.contains('imp-flash'), '2 「确定」：才改，底下那一行闪一下');
  // ===== 3. 待你确认：选手记、作为新增都先暂存 =====
  openRow(kPend);
  q('#impSheet .imp-pick').click();
  ok(!S().edits.rows[kPend] && q('#impSheet .pc.on'), '3 选了候选：卡片变成已选，但改动还没生效');
  raw('impPickNew').click();
  ok(!S().edits.rows[kPend] && raw('impPickNew').className.includes('gold'), '3 改成「作为新增」：也只是暂存');
  raw('impSheetOk').click();
  ok(S().edits.rows[kPend].pick === 'new' && S().plan.rows.find(d => d.key === kPend).group === 'add', '3 「确定」：作为新增');
  // ===== 4. 配对卡在详情里点了不再弹两边详情（共用面板一次只开一个） =====
  openRow(kPend);
  q('#impSheet .pc .pc-ver').click();
  ok(open() && raw('uiSheetTitle').textContent === '这笔账单', '4 详情里的配对卡点了不换成别的面板');
  raw('impSheetClose').click();
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  // ===== 5. 只看的详情：待处理、导入记录，底部只有「关闭」 =====
  A.clickGo(t.w);
  await t.until(() => raw('impResult'));
  await t.until(() => raw('impResPending'));
  {
    raw('impResPending').click();
    await t.until(() => q('.imp-pend-info'));
    q('.imp-pend-info').click();
    ok(open() === false && q('#uiSheetMask').classList.contains('open') && raw('uiSheetTitle').textContent === '待处理的这一笔' && raw('impPendDetailClose') && raw('uiSheetFoot').querySelectorAll('button').length === 1, '5 待处理详情：同一套面板，底部只有「关闭」');
    raw('impPendDetailClose').click();
  }
  await t.w.JiwenImportUI.openLogs();
  await t.until(() => q('.imp-log-info'));
  q('.imp-log-info').click();
  ok(q('#uiSheetMask').classList.contains('open') && raw('uiSheetTitle').textContent === '这一次导入' && raw('impLogDetailClose') && [...raw('uiSheetFoot').querySelectorAll('button')].map(b => b.id).join() === 'impLogViewLedger,impLogDetailClose' && /新建/.test(raw('uiSheetBody').textContent), '5 导入记录详情：同一套面板，只看；底部「在账单里看这一批」（4a）在上、「关闭」在最下面');
  raw('impLogDetailClose').click();
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
