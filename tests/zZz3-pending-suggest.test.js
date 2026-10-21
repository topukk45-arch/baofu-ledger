// 1017-Q「还要确认」里定下的两条（jsdom 跑整个 App）。node zZz3-pending-suggest.test.js [index.html]
// 1. 待处理「作为新增」：分类用分类推荐预选（你的规则、内置词表……推不出的落未分类），写明按什么选的，能改；
// 2. 拆开合并后账单那条：分类用手记的（原来落未分类）。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const bill = txns => B.bill('wechat', txns, { range: RANGE }).bytes;
const man = (id, d, money, cat) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T08:30`, money, type: 'expense', cat, remark: '手记' });

(async () => {
  // 同金额的手记比账单早 5 天 → 进待处理（相差 4–7 天的要你确认）
  const RECS = [man('m2', 1, 50, '吃饭'), man('m4', 1, 66, '购物')];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, ['未分类', '吃饭', '购物', '交通', '其他'], { importRules: { cat: [{ kw: '某虚构饭店', cat: '吃饭' }], type: [] } }) });
  const { $, d } = t;
  const a1 = wx({ time: T(10, 6), cp: '某虚构饭店', fen: 5000 }), a2 = wx({ time: T(10, 6, 15), cp: '某虚构杂货铺', fen: 6600, desc: '杂物' });
  const r = await t.importFiles([['微信.csv', bill([a1, a2])]]);
  ok(r.plan.counts.pending === 2, '0 两笔都拿不准、进待处理：' + JSON.stringify(r.plan.counts));
  t.w.JiwenImportUI.openPending();
  await t.until(() => d.querySelectorAll('.imp-pend').length === 2);
  const card = no => d.querySelector('.imp-pend[data-key="wechat|' + no + '"]');
  const c1 = card(a1.no), c2 = card(a2.no);
  ok(c1.querySelector('.imp-pend-cat').value === '吃饭' && /按推荐先选了「吃饭」：你定过规则，对方含「某虚构饭店」的归「吃饭」/.test(c1.querySelector('.imp-pend-sug').textContent), '1 按你的规则推得出：预选「吃饭」、写明按什么选的');
  ok(c2.querySelector('.imp-pend-cat').value === '未分类' && !c2.querySelector('.imp-pend-sug'), '1 推不出的：照旧未分类，不写推荐');
  ok(t.log.filter(p => /import\/(classify|merchants)\.js/.test(p)).length === 2, '1 分类推荐在打开待处理页时才载入主页面');
  c1.querySelector('.imp-pend-new').click();
  await t.until(() => d.querySelectorAll('.imp-pend').length === 1);
  const nr = t.recs().find(x => x.time === '2026-10-06T12:00' && x.money === 50);
  ok(nr && nr.cat === '吃饭', '1 作为新增：写进去的是预选的分类');
  const c2b = card(a2.no), se = c2b.querySelector('.imp-pend-cat');
  se.value = '其他'; se.dispatchEvent(new t.w.Event('change'));
  c2b.querySelector('.imp-pend-new').click();
  await t.until(() => d.querySelectorAll('.imp-pend').length === 0);
  ok(t.recs().find(x => x.money === 66 && x.time === '2026-10-06T15:00').cat === '其他', '1 改了下拉的：写进去的是改的');
  ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
