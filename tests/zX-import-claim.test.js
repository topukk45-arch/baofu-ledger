// 1017-UI4 同一条手记两处抢、跨天的选法（jsdom 跑整个 App）。node zX-import-claim.test.js [index.html]
// 「几笔加起来」那组里跨天的选法排最后、默认收起；同一条手记在两处都是候选时两处都写「这条手记也可能是某某的」；
// 在一处亲手选了它，另一处再选先问一句「已经配给了某某，改配到这里吗？」，确认了才改，被让出的那边浮出提示。账单、手记全是虚构的。
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
const MANUAL = [r('a', 4, '12:30', 35), r('b', 5, '12:15', 30), r('c', 7, '12:00', 30)];
const X1 = wx({ time: T(4, 11, 58), cp: '某虚构食堂', desc: '套餐', fen: 3000 }), X2 = wx({ time: T(4, 11, 59), cp: '某虚构食堂', desc: '饮料', fen: 500 });
const Y = wx({ time: T(5, 12, 0), cp: '某虚构食堂', desc: '套餐', fen: 3000 }), Z = wx({ time: T(7, 18, 0), cp: '某虚构小铺', desc: '/', fen: 2950 });

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
  const raw = id => t.d.getElementById(id), q = s => t.d.querySelector(s);
  await pick(t, bill([X1, X2, Y, Z]));
  const S = () => t.S(), keyOf = x => S().plan.rows.find(d => d.src === 'row' && S().parsed.files[d.file].rows[d.row].no === x.no).key;
  t.w.JiwenImportUI._goStep('match');
  const g = S().plan.sections.sums.find(x => x.options.some(o => o.record === 'a'));
  const box = q('[data-sum="' + g.id + '"]');
  const tg = box.querySelector('.imp-far-toggle'), fb = box.querySelector('.imp-far-box');
  ok(tg && /还有 1 种跨天的选法/.test(tg.textContent) && fb && fb.style.display === 'none', '1 跨天的选法排最后、默认收起：' + (tg && tg.textContent));
  ok(box.querySelector('.imp-sum-none').compareDocumentPosition(fb) & 2, '1 「都不是」在跨天的选法下面（整组最下面）');
  tg.click();
  const box2 = q('[data-sum="' + g.id + '"]'), fo = box2.querySelector('.imp-far-opt');
  ok(box2.querySelector('.imp-far-box').style.display === '' && fo && /差 3 天/.test(fo.textContent), '1 点开看得到：X1 = c，差 3 天');
  ok(/这条手记也可能是 .*某虚构小铺.* 那笔的/.test(fo.textContent), '2 同一条手记在两处都是候选：这里写「这条手记也可能是 某虚构小铺 那笔的」');
  fo.querySelector('.imp-sum-pick').click();
  const fi = g.options.findIndex(o => o.kind === 'far');
  ok(S().edits.sums[g.id] === fi && !q('#uiSheetMask.open'), '2 c 没人选过：直接配，不问');
  // 另一处（Z 的待你确认）也选 c：先问一句
  const zk = keyOf(Z);
  q('.imp-pend-row[data-key="' + zk + '"]').click();
  const pb = Array.from(raw('impSheet').querySelectorAll('.imp-pick')).find(b => !b.disabled);
  ok(pb && /这条手记也可能是/.test(raw('impSheet').textContent), '2 Z 的详情里 c 能点（你亲手选的不会直接变灰），也写了也可能是别处的');
  pb.click(); raw('impSheetOk').click();      // 1017-UI10：详情里点「确定」才生效，要让出手记的这时候问
  ok(q('#uiSheetMask.open') && /这条手记已经配给了 .*那组，改配到这里吗？/.test(raw('impClaimMsg').textContent), '3 已经亲手配给了别处：先问「已经配给了某某，改配到这里吗？」：' + (raw('impClaimMsg') || {}).textContent);
  raw('impClaimNo').click();
  ok(S().edits.sums[g.id] === fi && !(S().edits.rows[zk] && S().edits.rows[zk].pick), '3 点「不改」：两边都不动');
  q('.imp-pend-row[data-key="' + zk + '"]').click();
  Array.from(raw('impSheet').querySelectorAll('.imp-pick')).find(b => !b.disabled).click(); raw('impSheetOk').click();
  raw('impClaimOk').click();
  const zr = S().plan.rows.find(d => d.key === zk), x1 = S().plan.rows.find(d => d.key === keyOf(X1));
  ok(S().edits.sums[g.id] === undefined && zr.group === 'merge' && zr.into === 'c' && x1.group === 'pending', '3 确认了才改：Z 配 c，那组让出来、回到待处理');
  ok(raw('impToast') && raw('impToast').style.display === 'flex' && /那组让出了这条手记，回到待你确认/.test(raw('impToast').textContent), '3 被让出的那边浮出提示：' + (raw('impToast') || {}).textContent);
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
