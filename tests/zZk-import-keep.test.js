// 1017-UI9 页面上的记录不能凭空消失（jsdom 跑整个 App）。node zZk-import-keep.test.js [index.html]
// 每块标题「待选 x / 共 y」，底部「✓ 已处理 N 件 ▸」默认收起；挪走的行写去处、带改 / 撤回；改完浮出提示「… · 查看」；
// 新建分类写会归进去哪几组，勾上以后「按对方选分类」那一组留一行「→ 已归到新建的『充值缴费』」；总览「这次所有的改动（N 处）」；
// 自动检查：任何时候每一步「待选 + 已处理」= 这一步原来的件数，各步加起来找得到文件里的每一行。账单、手记全是虚构的。
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
const MANUAL = [{ id: 'a', time: '2026-10-04T12:30', money: 35, type: 'expense', cat: '吃饭', remark: '午饭' }];
const TX = () => [
  wx({ time: T(4, 11, 58), cp: '某虚构食堂', desc: '套餐', fen: 3000 }), wx({ time: T(4, 11, 59), cp: '某虚构食堂', desc: '饮料', fen: 500 }),
  wx({ time: T(8, 18), kind: '转账', cp: '*小玲', fen: 10000 }), wx({ time: T(9, 19), kind: '转账', io: 'income', cp: '*小玲', fen: 10000 }),
  wx({ time: T(12, 9), cp: '某省联通', desc: '手机充值', fen: 5000 }), wx({ time: T(13, 9), cp: '某省联通', desc: '手机充值', fen: 3000 }),
  wx({ time: T(14, 9), cp: '某虚构平台甲', fen: 1999 }), wx({ time: T(16, 9), cp: '某虚构平台甲', fen: 999 }),   // 1021-T14：2 笔才成组
  wx({ time: T(15, 9), cp: '某虚构平台乙', fen: 2999 }),
];
const MID = ['match', 'refund', 'cat', 'amount'];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
  const q = s => t.d.querySelector(s), raw = id => t.d.getElementById(id), S = () => t.S();
  await pick(t, bill(TX())); const UI = t.w.JiwenImportUI;
  // 各步原来的件数
  const base = {}; MID.forEach(st => { base[st] = (S().view.items[st] || []).length; });
  // 自动检查：每一步页面上「待选 + 已处理」= 原来的件数；文件里每一行都在总览明细里找得到
  const check = (when) => {
    let bad = [];
    MID.forEach(st => {
      if (!base[st] || S().view.steps.indexOf(st) < 0) return;
      UI._goStep(st);
      let left = 0, total = 0, done = 0;
      t.d.querySelectorAll('#impBody .imp-count').forEach(c => { left += +c.dataset.left; total += +c.dataset.total; });
      t.d.querySelectorAll('#impBody .imp-card').forEach(c => { const f = c.querySelector('.imp-fold-n'); if (f) done += +f.textContent.match(/\d+/)[0]; else { const n = c.querySelector('.imp-count'); if (n && +n.dataset.left === 0 && +n.dataset.total === 1) done += 1; } });
      if (total !== base[st] || left + done !== total) bad.push(st + ' 待选 ' + left + ' + 已处理 ' + done + ' / 共 ' + total + '（原来 ' + base[st] + '）');
    });
    const keys = new Set(); Object.values(S().plan.groups).forEach(g => g.forEach(d => d.key && keys.add(d.key)));
    const all = S().plan.rows.filter(d => d.key).map(d => d.key);
    if (!all.every(k => keys.has(k))) bad.push('有行在明细里找不到');
    ok(!bad.length, '自动检查（' + when + '）：每一步 待选 + 已处理 = 原来的件数，每一行都找得到 ' + bad.join('；'));
  };
  check('刚打开');
  // ===== 1. 新建分类写会归进去哪几组；勾上以后那一组不消失，留一行去处 =====
  UI._goStep('cat');
  const ncRow = () => q('#impNewCats [data-item="nc:充值缴费"]');
  ok(ncRow() && /勾上会归进去：某省联通（2 笔）/.test(ncRow().textContent), '1 新建分类写清勾上会归进去哪几组：' + (ncRow() || {}).textContent);
  ok(q('#impCpGroups .imp-cp-row[data-cp="某省联通"]'), '1 没勾的时候，某省联通在「按对方选分类」里');
  const h0 = q('#impCpGroups .imp-count');
  ok(h0 && /^待选 \d+ \/ 共 \d+$/.test(h0.textContent), '1 块标题写「待选 x / 共 y」：' + (h0 || {}).textContent);
  const cb = ncRow().querySelector('input[type=checkbox]'); cb.checked = true; cb.dispatchEvent(new t.w.Event('change'));
  ok(!S().plan.sections.cpGroups.some(g => g.cp === '某省联通'), '1 勾上新建「充值缴费」：方案里某省联通不在按对方选分类了');
  const fold = q('#impCpGroups .imp-fold'), fb = q('#impCpGroups .imp-fold-box');
  ok(fold && /✓ 已处理 1 件/.test(fold.textContent) && fb && fb.style.display === 'none', '1 底部「✓ 已处理 1 件 ▸」，默认收起：' + (fold && fold.textContent) + ' ' + (fb && fb.style.display));
  const mv = fb && fb.querySelector('.imp-moved[data-item="cp:某省联通"]');
  ok(mv && /某省联通 · 2 笔 · 80\.00/.test(mv.textContent) && /→ 已归到新建的『充值缴费』/.test(mv.textContent) && mv.querySelector('.imp-done-edit'), '1 那一组留一行：「→ 已归到新建的『充值缴费』」，带「改」');
  ok(/归进去的：某省联通（2 笔）/.test(ncRow() ? ncRow().textContent : (q('#impNewCats') || {}).textContent), '1 新建分类那项写归进去的是哪几组');
  const ts = raw('impToast');
  ok(ts && ts.style.display === 'flex' && /已归到新建的『充值缴费』/.test(ts.textContent) && raw('impToastView'), '1 底部浮出提示「… 已归到新建的『充值缴费』· 查看」：' + (ts || {}).textContent);
  raw('impToastView').click();
  ok(q('#impCpGroups .imp-fold-box').style.display === '' && q('#impCpGroups .imp-moved.imp-flash'), '1 点「查看」：展开「已处理」，那一行闪一下');
  check('勾上新建分类以后');
  // ===== 2. 按对方选一个：挪进已处理，写去处，能撤回 =====
  q('#impCpGroups .imp-cp-row[data-cp="某虚构平台甲"]').click();
  Array.from(t.d.querySelectorAll('#uiPickList .cc')).find(x => x.textContent === '购物').click();
  const fb2 = q('#impCpGroups .imp-fold-box');
  const dn = () => q('#impCpGroups .imp-fold-box .imp-done-row[data-item="cp:某虚构平台甲"]');
  ok(dn() && /→ 归到『购物』/.test(dn().textContent) && dn().querySelector('.imp-done-edit') && dn().querySelector('.imp-done-undo') && /✓ 已处理 2 件/.test(q('#impCpGroups .imp-fold').textContent), '2 选了分类的那组挪进「已处理」（2 件），写「→ 归到『购物』」，带改 / 撤回');
  check('按对方选了一个以后');
  // ===== 3. 转账标一笔、多笔合一选一种 =====
  UI._goStep('refund');
  const tcb = q('#impTransfers .imp-tr-cb'); tcb.checked = true; tcb.dispatchEvent(new t.w.Event('change'));
  check('转账标了一笔以后');
  UI._goStep('match');
  q('#impSums .imp-sum-pick').click();
  ok(q('#impSums .imp-fold') && q('#impSums .imp-fold-box [data-item^="sum:"]'), '3 多笔合一选了：挪进「已处理」');
  check('多笔合一选了以后');
  // ===== 4. 总览：这次所有的改动 =====
  UI._goStep('overview');
  const ch = raw('impChanges');
  ok(ch && /这次所有的改动（\d+ 处）/.test(ch.querySelector('h4').textContent) && /某省联通/.test(ch.textContent) && /已归到新建的『充值缴费』/.test(ch.textContent) && /某虚构平台甲/.test(ch.textContent) && /几笔加起来/.test(ch.textContent), '4 总览列出各步做过的选择和去处：' + (ch ? ch.querySelector('h4').textContent : ''));
  const ed = Array.from(ch.querySelectorAll('.imp-chg')).find(r => /某虚构平台甲/.test(r.textContent));
  ed.querySelector('.imp-chg-edit').click();
  ok(S().view.step === 'cat', '4 点「改」回到那一步');
  // ===== 5. 撤回 =====
  ok(!q('#impCpGroups .imp-moved[data-item="cp:某省联通"] .imp-done-undo'), '5 因为别处的选择挪走的那一行没有「撤回」（去改新建分类那项）');
  dn().querySelector('.imp-done-edit').click();
  ok(q('#uiSheetMask.open') && /这个对方归到哪个分类/.test(raw('uiSheetTitle').textContent), '5 「已处理」里点「改」：照旧打开选分类面板');
  raw('uiSheetCancel').click();
  dn().querySelector('.imp-done-undo').click();
  ok(q('#impCpGroups .imp-cp-row[data-cp="某虚构平台甲"] .imp-mark').dataset.st === 'pend' && !q('#impCpGroups .imp-fold-box .imp-cp-row[data-cp="某虚构平台甲"]'), '5 改动去掉：回到待选、离开「已处理」');
  check('撤回以后');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
