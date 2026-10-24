// 1017-E 搜索（jsdom 跑整个 App）。node zZq-import-search.test.js [index.html]
// 确认页标题栏右边的搜索按钮 → 共用底部面板，在这次导入的所有账单里搜（不分步骤），每行写现在的去处，点一下跳过去、那一行闪一下；
// 待处理页顶上、「当作退款，挂到某一笔」的候选列表也有搜索框；按金额（1.6 和 1.60 都认）、对方、商品说明、备注搜，只在页面上过滤。
// 账单、手记全是虚构的。
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
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '/', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const man = (id, d, hm, money, cat, remark) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${hm}`, money, type: 'expense', cat: cat || '吃饭', remark: remark || '' });
// 合并：a 10-04 30.00 ↔ 某虚构面馆 30.00；待你确认（金额差一点、推不出分类）4 笔 → 自己占「和手记对不上的」一步；跳过：交易关闭；收入一笔（挂退款用）
const MANUAL = [man('a', 4, '12:30', 30, '吃饭', '牛肉面'), man('p1', 9, '21:00', 1.8), man('p2', 10, '12:00', 5.5), man('p3', 11, '12:00', 8.5), man('p4', 12, '12:00', 12.5)];
const TX = [
  wx({ time: T(4, 12, 41), cp: '某虚构面馆', desc: '牛肉面', fen: 3000 }),
  wx({ time: T(9, 21, 5), cp: '某虚构便利店', desc: '饮料', fen: 160 }),
  wx({ time: T(10, 12, 5), cp: '某虚构小卖部', desc: '/', fen: 500 }),
  wx({ time: T(11, 12, 5), cp: '某虚构小卖部', desc: '/', fen: 800 }),
  wx({ time: T(12, 12, 5), cp: '某虚构小卖部', desc: '/', fen: 1200 }),
  wx({ time: T(13, 10, 0), cp: '某虚构商城', desc: '数据线', fen: 1990, status: '交易关闭' }),
  wx({ time: T(15, 9, 0), kind: '其他', io: 'income', cp: '某虚构公司', desc: '报销', fen: 1000 }),
];
const F = [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
  const $ = id => t.d.getElementById(id), q = s => t.d.querySelector(s), qa = s => Array.from(t.d.querySelectorAll(s));
  const S = () => t.S();
  $('devImportBtn').click();
  await t.until(() => $('impPick'));
  ok($('impSearchBtn') && $('impSearchBtn').style.display === 'none', '0 选文件页没有搜索按钮');
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: F.map(([n, b]) => new t.w.File([b], n)), configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => S() && S().phase === 'confirm' && S().plan, 30000);
  const btn = $('impSearchBtn');
  ok(btn && btn.style.display === 'flex' && btn.closest('.imp-head') && btn.querySelector('svg'), '1 确认页标题栏右边有搜索按钮');
  ok(S().view.steps[1] === 'match', '1 「和手记对不上的」是第 2 步：' + S().view.steps.join());
  const search = async v => { const i = $('impSearchInput'); i.value = v; i.dispatchEvent(new t.w.Event('input')); };
  const res = () => qa('#impSearchRes .imp-sr');
  btn.click();
  ok(q('#uiSheetMask.open') && /在这次导入里搜/.test($('uiSheetTitle').textContent) && $('impSearchInput') && $('impSearchClose').textContent === '关闭', '1 点开是共用底部面板：搜索框、底部「关闭」');
  // 2. 一笔在第 2 步的：1.6 和 1.60 都认
  await search('1.6');
  const r16 = res();
  ok(r16.length === 1 && /某虚构便利店/.test(r16[0].textContent) && /1\.60/.test(r16[0].textContent), '2 搜「1.6」找到 1.60 那笔');
  ok(/→ 第 2 步 · 和手记对不上的 · 待你确认/.test(r16[0].querySelector('.imp-sr-to').textContent), '2 去处写「第 2 步 · 和手记对不上的 · 待你确认」：' + r16[0].querySelector('.imp-sr-to').textContent);
  await search('1.60'); ok(res().length === 1, '2 搜「1.60」也找到');
  await search('¥1.60元'); ok(res().length === 1, '2 带 ¥、元也认');
  await search('饮料'); ok(res().length === 1 && res()[0].dataset.key === r16[0].dataset.key, '2 按商品说明搜');
  const k16 = r16[0].dataset.key;
  res()[0].click();
  ok(!q('#uiSheetMask.open') && S().view.step === 'match', '2 点一下：面板关掉，跳到第 2 步');
  const n16 = qa('[data-item],[data-key]').find(n => n.dataset.key === k16 || (n.dataset.item || '').endsWith(':' + k16) || (/^day:/.test(n.dataset.item || '') && n.classList.contains('imp-flash')));   // 7a：在「按天对账」里的是那一天闪
  ok(n16 && n16.classList.contains('imp-flash'), '2 那一行闪一下');
  // 3. 一笔已合并的：按对方、按手记备注
  btn.click(); await search('面馆');
  let r = res();
  ok(r.length === 1 && /→ 已和 10月4日 的手记合并/.test(r[0].textContent), '3 已合并的：「已和 10月4日 的手记合并」');
  await search('牛肉面'); ok(res().length === 1, '3 按商品说明 / 手记备注搜得到');
  const kM = res()[0].dataset.key; res()[0].click();
  ok(S().view.step === 'overview' && S().view.details && S().view.open.merge, '3 点一下：到总览，展开全部明细里「和手记合并」那一组');
  const nM = qa('.al-row').find(n => n.dataset.key === kM);
  ok(nM && nM.classList.contains('imp-flash'), '3 明细里那一行闪一下');
  // 4. 一笔已跳过的
  btn.click(); await search('19.9');
  r = res();
  ok(r.length === 1 && /→ 已跳过：/.test(r[0].textContent) && /交易关闭/.test(r[0].textContent), '4 已跳过的：「已跳过：……交易关闭……」：' + (r[0] && r[0].querySelector('.imp-sr-to').textContent));
  const kS = r[0].dataset.key; r[0].click();
  ok(S().view.step === 'overview' && S().view.open.skip && qa('.al-row').some(n => n.dataset.key === kS && n.classList.contains('imp-flash')), '4 点一下：明细里「跳过」那一组展开、那一行闪一下');
  // 5. 搜不到
  btn.click(); await search('不存在的东西');
  ok(!res().length && /这次导入里没有「不存在的东西」/.test($('impSearchRes').textContent), '5 搜不到时写一句');
  ok(S().view.searchQ === '不存在的东西', '5 记住上次搜的');
  $('impSearchClose').click();
  // 6. 只在页面上过滤，方案不变
  const before = JSON.stringify(S().edits);
  ok(before === JSON.stringify(S().edits) && !Object.keys(S().edits.rows).length, '6 搜索不改方案');
  // 7. 「当作退款，挂到某一笔」的候选列表有搜索框
  S().view.details = true; S().view.open.add = true; t.w.JiwenImportUI._goStep('overview');
  const inc = qa('.al-row').find(n => /某虚构公司|报销/.test(n.textContent)); 
  inc.click();
  await t.until(() => $('impAsRefund'));
  $('impAsRefund').click();
  await t.until(() => $('impRefundPickSearch'));
  await t.until(() => !/正在查账本/.test($('impRefundPick').textContent));
  const rp = () => qa('#impRefundPick .imp-rp-row, #impRefundPick .imp-rp-rec').filter(n => n.style.display !== 'none');
  const all = rp().length;
  const si = $('impRefundPickSearch'); si.value = '面馆'; si.dispatchEvent(new t.w.Event('input'));
  ok(all >= 2 && rp().length === 1 && /牛肉面 · 30\.00/.test(rp()[0].textContent) && /找到 1 笔/.test($('impRefundPickTip').textContent), '7 挂退款的候选：搜「面馆」只剩那一笔（原来 ' + all + ' 笔）');
  si.value = '30'; si.dispatchEvent(new t.w.Event('input'));
  ok(rp().length >= 1 && rp().every(n => /30\.00/.test(n.textContent)), '7 按金额搜（30 认 30.00）');
  si.value = '没有的'; si.dispatchEvent(new t.w.Event('input'));
  ok(!rp().length && /没有「没有的」/.test($('impRefundPickTip').textContent), '7 搜不到时写一句');
  // 8. 待处理页顶上有搜索框（导进去，留下 4 笔待处理）
  t.w.JiwenSheet && t.w.JiwenSheet.isOpen() && t.w.JiwenSheet.close();
  t.w.JiwenImportUI.close(); await t.idle();
  await t.importFiles(F, () => {}, {});
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  t.w.JiwenImportUI.openPending();
  await t.until(() => $('impPendSearch'));
  const pc = () => qa('.imp-pend').filter(n => n.style.display !== 'none');
  const pn = pc().length;
  const ps = $('impPendSearch'); ps.value = '1.6'; ps.dispatchEvent(new t.w.Event('input'));
  ok(pn === 4 && pc().length === 1 && /某虚构便利店/.test(pc()[0].textContent), '8 待处理页：搜「1.6」只剩那一笔（原来 ' + pn + ' 笔）');
  ps.value = '小卖部'; ps.dispatchEvent(new t.w.Event('input'));
  ok(pc().length === 3 && /找到 3 笔/.test($('impPendSearchTip').textContent), '8 按对方搜');
  ps.value = 'zzz'; ps.dispatchEvent(new t.w.Event('input'));
  ok(!pc().length && /没有「zzz」/.test($('impPendSearchTip').textContent), '8 搜不到时写一句');
  ps.value = ''; ps.dispatchEvent(new t.w.Event('input'));
  ok(pc().length === 4, '8 清空搜索框全回来');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
