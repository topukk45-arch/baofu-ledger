// 1017-D「金额差一点的，当作你记过的」一笔一笔处理（jsdom 跑整个 App，真导真撤）。node zZp-import-near-each.test.js [index.html]
// 每张配对卡左上角勾选框、底部「不是同一笔，分开记」「改成实付」；勾几对一起处理；原来的按钮改叫「全部改成实付」；
// 分开记的挪进「已处理」写去处、能撤回；差额用琥珀色（≈），不用红色。默认（什么都不点）的结果不变。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构面馆', desc: '牛肉面', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const man = (id, d, money) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T12:20`, money, type: 'expense', cat: '吃饭', remark: '面' });
const MANUAL = [man('n1', 5, 30), man('n2', 7, 20), man('n3', 9, 50)];
const BILL = [wx({ time: T(5, 12, 10), fen: 2800 }), wx({ time: T(7, 12, 10), fen: 1850 }), wx({ time: T(9, 12, 10), fen: 4800 })];
const F = [['微信.csv', B.bill('wechat', BILL, { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
  const { $ } = t;
  const D0 = await t.dump();
  const q = s => t.d.querySelector(s), qa = s => Array.from(t.d.querySelectorAll(s));
  const goMatch = () => { const UI = t.w.JiwenImportUI; if (UI._state().view.steps.indexOf('match') >= 0) UI._goStep('match'); else UI._goStep('overview'); };
  const item = k => qa('.imp-near-item').find(x => x.dataset.key === k);
  let keys = null, chk = {};
  // ===== 1–4 在确认页上点（不导入）=====
  await t.importFiles(F, S => {
    goMatch();
    const nm = S.plan.sections.nearMerged; keys = nm.keys.slice();
    chk.n = nm.n === 3 && keys.length === 3;
    const its = qa('.imp-near-item');
    chk.card = its.length === 3 && its.every(x => x.querySelector('.imp-near-ck input[type=checkbox]') && x.querySelector('.imp-near-split') && x.querySelector('.imp-near-pay'));
    chk.btnText = its.every(x => x.querySelector('.imp-near-split').textContent === '不是同一笔，分开记' && x.querySelector('.imp-near-pay').textContent === '改成实付');
    chk.all = $('impNearPay').textContent === '全部改成实付';
    const v = its[0].querySelector('.pc-ver');
    chk.amber = !!v.querySelector('.near') && /≈ 手记多 2\.00/.test(v.querySelector('.near').textContent) && !v.querySelector('.no');
    chk.bulkOff = $('impNearBulkPay').disabled && $('impNearBulkSplit').disabled;
    // 2. 「分开记」：手记不动、账单作为新增；挪进「已处理」写去处、能撤回
    item(keys[0]).querySelector('.imp-near-split').click();
    const d0 = S.plan.rows.find(d => d.key === keys[0]);
    chk.split = d0.group === 'add' && !item(keys[0]) && S.plan.sections.nearMerged.n === 2;
    const moved = qa('#impNear .imp-done-row.imp-moved').find(x => x.dataset.item === 'near:' + keys[0]);
    chk.moved = !!moved && /→ (作为新增|归到『吃饭』)/.test(moved.textContent) && !!moved.querySelector('.imp-done-undo');
    chk.count = /待选 2 \/ 共 3/.test(q('#impNear .imp-count').textContent);
    moved.querySelector('.imp-done-undo').click();
    chk.undo = S.plan.rows.find(d => d.key === keys[0]).group === 'merge' && !!item(keys[0]) && !S.edits.rows[keys[0]];
    // 3. 一笔「改成实付」：只改这一笔；按钮变「✓ 已改成实付」，再点改回
    item(keys[1]).querySelector('.imp-near-pay').click();
    let p = S.plan.sections.nearMerged;
    chk.pay1 = p.pays[keys[1]] === true && p.pays[keys[0]] === false && p.pays[keys[2]] === false && p.payN === 1 && !p.pay;
    const it1 = qa('.imp-near-item').find(x => x.dataset.key === keys[1]);
    chk.pay1Text = it1 && it1.querySelector('.imp-near-pay').textContent === '✓ 已改成实付' && !!it1.closest('.imp-fold-box');
    it1.querySelector('.imp-near-pay').click();
    chk.pay1Back = S.plan.sections.nearMerged.payN === 0 && !S.edits.rows[keys[1]];
    // 4. 勾两对，一起改成实付
    [keys[0], keys[2]].forEach(k => { const c = item(k).querySelector('.imp-near-ck input'); c.checked = true; c.dispatchEvent(new t.w.Event('change')); });
    chk.bulkOn = /已勾 2 对/.test($('impNearBulk').textContent) && !$('impNearBulkPay').disabled;
    $('impNearBulkPay').click();
    p = S.plan.sections.nearMerged;
    chk.bulk = p.pays[keys[0]] && p.pays[keys[2]] && !p.pays[keys[1]] && p.payN === 2;
    // 5. 「全部改成实付」：一笔改回「按手记金额」只改那一笔
    $('impNearPay').click();
    p = S.plan.sections.nearMerged;
    chk.all1 = p.pay && $('impNearPay').textContent === '全部按手记金额' && !S.edits.rows[keys[0]];
    qa('.imp-near-item').find(x => x.dataset.key === keys[2]).querySelector('.imp-near-pay').click();
    p = S.plan.sections.nearMerged;
    chk.all2 = !p.pay && p.payN === 2 && p.pays[keys[2]] === false && S.edits.rows[keys[2]].pay === false;
    // 改回默认
    $('impNearPay').click(); $('impNearPay').click();
    chk.reset = S.plan.sections.nearMerged.payN === 0 && !S.edits.nearPay;
  }, { noGo: true });
  ok(chk.n, '1 三对金额差一点的');
  ok(chk.card, '1 每张卡：左上角勾选框、底部两个按钮');
  ok(chk.btnText, '1 按钮写「不是同一笔，分开记」「改成实付」');
  ok(chk.all, '1 原来的按钮改叫「全部改成实付」');
  ok(chk.amber, '1 差额「≈ 手记多 2.00」用琥珀色，不是红色 ✗');
  ok(chk.bulkOff, '1 没勾的时候「勾上的…」点不了');
  ok(chk.split, '2 分开记：这笔账单作为新增，那块少一对');
  ok(chk.moved, '2 分开记的挪进「已处理」写去处、带「撤回」');
  ok(chk.count, '2 块标题「待选 2 / 共 3」');
  ok(chk.undo, '2 撤回：回到合并、卡片回来');
  ok(chk.pay1, '3 一笔改成实付：只改这一笔');
  ok(chk.pay1Text, '3 按钮变「✓ 已改成实付」、这一对挪进已处理');
  ok(chk.pay1Back, '3 再点改回，改动去掉');
  ok(chk.bulkOn, '4 勾两对：「已勾 2 对」');
  ok(chk.bulk, '4 勾上的改成实付：两笔都改');
  ok(chk.all1, '5 全部改成实付：按钮变「全部按手记金额」，一笔一笔的改动清掉');
  ok(chk.all2, '5 全部改成实付后单独一笔改回按手记金额');
  ok(chk.reset, '5 改回默认');

  // ===== 6. 真导：第 1 对分开记、第 2 对改成实付、第 3 对不动 =====
  await t.importFiles(F, S => {
    goMatch();
    const ks = S.plan.sections.nearMerged.keys;
    item(ks[0]).querySelector('.imp-near-split').click();
    item(ks[1]).querySelector('.imp-near-pay').click();
  }, { stay: true });
  ok(/1 笔手记比实付多 2\.00 元，多半是立减。另外 1 笔已改成实付金额。/.test($('impResult').textContent), '6 结果页：1 笔手记比实付多 2.00 元……另外 1 笔已改成实付金额');
  $('impBackToLedger').click(); await t.idle();
  const R = t.recs(), g = id => R.find(x => x.id === id);
  ok(g('n1').money === 30 && !g('n1').src && R.some(x => x.src && !x.src.merged && Math.round(x.money * 100) === 2800), '6 分开记：手记 n1 不动，28.00 另记一条');
  ok(g('n2').money === 18.5 && g('n2').src && g('n2').src.merged, '6 改成实付：n2 金额改成 18.50');
  ok(g('n3').money === 50 && g('n3').src && g('n3').src.merged, '6 不动的：n3 合并、金额按手记');
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  const [lg] = await t.logs(); const pl = await t.st().undoPlan(lg.b); await t.st().undo(pl); await t.idle();
  ok(same(await t.dump(), D0), '6 撤销：和导入前逐字节一样');
  // ===== 7. 什么都不点：和以前一样（手记金额都不动）=====
  await t.importFiles(F, S => {}, {});
  ok(['n1', 'n2', 'n3'].every(id => { const x = t.recs().find(y => y.id === id); return x.src && x.src.merged; }) && t.recs().find(x => x.id === 'n2').money === 20, '7 默认：三对都合并、手记金额都不动');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
