// 1017-UI8 配对卡（jsdom 跑整个 App）。node zZ-import-paircard.test.js [index.html]
// 上面「你记的」（时间、分类、金额、备注），下面「账单里的」一笔一行（时间、对方、金额；第二行商品说明、支付方式、来源），最下面一行结论
// （合计、差多少钱、差几天、分类对不对得上，对不上的红色）；整宽「选这个」，选中变实心加 ✓；「都不是，分开记」灰色带 ✕ 放最下面；
// 同一组手记相同的「你记的」只在组顶上写一次；点卡片看两边完整详情；行详情的候选、单独一笔待你确认、金额差一点的都用这种卡；
// 「为什么没配上」带手记备注。账单、手记全是虚构的。
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
  // 7a 起有手记的天按天对账、不选的留在待处理；这里测一笔一笔的配对，那几天先选「逐笔看」（照原来一笔一笔）
  const S0 = t.S(); (S0.plan.sections.days || []).forEach(x => { if (!x.auto) S0.edits.days[x.day] = 'each'; }); t.w.JiwenImportUI._replan();
}
const MANUAL = [{ id: 'a', time: '2026-10-04T12:30', money: 35, type: 'expense', cat: '吃饭', remark: '午饭和饮料' },
                { id: 'p', time: '2026-10-06T12:00', money: 20, type: 'expense', cat: '购物', remark: '文具' },
                { id: 'n', time: '2026-10-08T12:00', money: 30, type: 'expense', cat: '吃饭', remark: '食堂午饭' }];
const TX = () => [
  wx({ time: T(4, 11, 58), cp: '某虚构食堂', desc: '套餐', fen: 3000, pm: '零钱' }), wx({ time: T(4, 11, 59), cp: '某虚构食堂', desc: '饮料', fen: 500, pm: '零钱' }),
  wx({ time: T(6, 12, 10), cp: '某虚构快餐店', desc: '米饭套餐', fen: 2100 }),         // 和 p 金额差一点、分类不一样 → 待你确认
  wx({ time: T(8, 12, 5), cp: '某虚构快餐店', desc: '米饭套餐', fen: 2800 }),          // 和 n 金额差一点、分类一样 → 当作记过的
];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
  const q = s => t.d.querySelector(s), raw = id => t.d.getElementById(id), S = () => t.S();
  await pick(t, bill(TX())); const UI = t.w.JiwenImportUI;
  UI._goStep('match');
  // ===== 1. 几笔加起来：你记的在组顶上一次，选法卡里一笔一行，结论一行 =====
  const box = q('#impSums [data-sum]');
  const pcs = box.querySelectorAll('.pc');
  ok(box.querySelectorAll('.pc-me').length === 1 && /10月4日 12:30 · 吃饭/.test(box.querySelector('.pc-me').textContent) && /35\.00/.test(box.querySelector('.pc-me').textContent) && /备注：午饭和饮料/.test(box.querySelector('.pc-me').textContent), '1 手记相同：「你记的」只在组顶上写一次（时间、分类、金额、备注）');
  const c0 = pcs[0];
  ok(/选法 1 · 几笔加起来/.test(c0.querySelector('.pc-lab').textContent) && c0.querySelectorAll('.pc-bill').length === 2, '1 选法卡：「选法 1 · 几笔加起来」，账单一笔一行');
  ok(/10月4日 11:58 · 某虚构食堂/.test(c0.querySelector('.pc-bill').textContent) && /30\.00/.test(c0.querySelector('.pc-bill .amt').textContent) && /套餐 · 零钱 · 微信/.test(c0.querySelector('.pc-bill .pc-sub').textContent), '1 账单行：时间、对方、金额；第二行商品说明、支付方式、来源');
  const ver = c0.querySelector('.pc-ver').textContent;
  ok(/✓ 合计 35\.00/.test(ver) && /✓ 差 0\.00/.test(ver) && /✓ 同一天/.test(ver), '1 结论一行：合计、差多少、差几天：' + ver);
  ok(c0.querySelector('.pc-pick').textContent === '选这个' && box.querySelector('.pc-none') && box.querySelector('.pc-none svg') && /都不是，分开记/.test(box.querySelector('.pc-none').textContent), '1 按钮统一「选这个」；「都不是，分开记」灰色带 ✕');
  ok(box.lastElementChild.classList.contains('pc-none'), '1 「都不是」在整组最下面');
  // 点卡片看两边完整详情
  c0.querySelector('.pc-ver').click();
  ok(q('#uiSheetMask.open') && /两边的详情/.test(raw('uiSheetTitle').textContent) && /备注：午饭和饮料/.test(raw('uiSheetBody').textContent) && /交易对方：某虚构食堂/.test(raw('uiSheetBody').textContent), '1 点卡片：两边完整详情（只看）');
  ok(raw('impPairClose') && raw('impPairClose').textContent === '关闭', '1 只看的详情底部只有「关闭」');
  raw('impPairClose').click();
  // ===== 2. 单独一笔待你确认：账单 + 最像的手记一张卡；分类对不上红色；选了收成一行 =====
  const pr = q('.imp-pend-row');
  ok(pr && pr.querySelector('.pc') && /最像/.test(pr.querySelector('.pc-lab').textContent) && /备注：文具/.test(pr.textContent), '2 待你确认一笔：最像的那条手记一张配对卡（带备注）');
  const no = pr.querySelector('.pc-ver .no');
  ok(pr.querySelectorAll('.pc-ver .no').length === 2 && /✗ 分类对不上（账单像「吃饭」）/.test(pr.querySelector('.pc-ver').textContent) && /✗ 账单多 1\.00/.test(no.textContent), '2 对不上的用红色：分类对不上、账单多 1.00');
  const pk = pr.dataset.key;
  pr.querySelector('.pc-pick').click();
  const pr2 = q('.imp-pend-row[data-key="' + pk + '"]');
  ok(S().edits.rows[pk].pick.record === 'p' && pr2.closest('.imp-fold-box') && /→ 和 10月6日 12:00 购物 的手记合并/.test(pr2.textContent) && pr2.querySelector('.imp-mark').dataset.st === 'ok', '2 「选这个」：合并，挪进「已处理」写「→ 和 10月6日 12:00 购物 的手记合并」（1017-UI9）');
  // ===== 3. 行详情的候选也是配对卡：选中变实心加 ✓，其余变淡 =====
  pr2.click();
  const sh = raw('impSheet'), sc = sh.querySelector('.pc');
  ok(sc && sc.classList.contains('on') && sc.querySelector('.pc-pick').textContent === '✓ 已选这个' && /备注：文具/.test(sc.textContent) && sc.querySelector('.pc-ver'), '3 行详情的候选：配对卡，选中的实心加 ✓');
  raw('impSheetClose').click();
  // ===== 4. 金额差一点的：一笔一张卡（只看） =====
  const nc = raw('impNear');
  ok(nc && nc.querySelector('.pc.imp-near-pc') && !nc.querySelector('.pc .pc-pick') && /✓ 分类对得上/.test(nc.querySelector('.pc-ver').textContent) && /手记多 2\.00/.test(nc.querySelector('.pc-ver').textContent), '4 金额差一点的：配对卡、只看，写手记多 2.00、分类对得上');
  // ===== 5. 为什么没配上：带手记备注 =====
  UI._state().edits.rows = {}; UI._replan();
  q('.imp-pend-row[data-key="' + pk + '"]').click();
  const tr = raw('impTrace');
  ok(tr && Array.from(tr.querySelectorAll('.imp-trace-row')).some(x => /· 备注：/.test(x.textContent)), '5 「为什么没配上」每行带手记备注：' + (tr ? tr.textContent.slice(0, 120) : ''));
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
