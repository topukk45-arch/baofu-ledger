// 1019-G 一列勾选框超过 3 个的地方，顶上加「全选」，全勾上了变「全不选」（jsdom，账单和记录全是虚构的）。node zZzF-select-all.test.js [index.html]
// 预算建议（bgSuggestCard）、导入的「只对账」清单、「金额差一点的」配对卡；不超过 3 个的不加。
// 预算建议里没设预算的那行写「现在没有预算」（和其他行的「现在 2840.00」对得上）。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const p2 = n => String(n).padStart(2, '0');
let k = 0;
const r = (mo, d, money, cat, o) => Object.assign({ id: 'r' + (++k), time: `2026-${p2(mo)}-${p2(d)}T12:00`, money, type: 'expense', cat, remark: '' }, o || {});
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构面馆', desc: '牛肉面', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));

(async () => {
  // ===== 1. 预算建议：5 个分类 → 有「全选」=====
  {
    const RECS = [];
    ['吃饭', '购物', '出行', '日用', '娱乐'].forEach((c, i) => [7, 8, 9, 10, 11].forEach(mo => RECS.push(r(mo, 3 + i, 100 + 50 * i, c))));
    const CATS = ['未分类', '吃饭', '购物', '出行', '日用', '娱乐', '其他'];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, CATS, { budgets: { '娱乐': 2840 } }) });
    const { $, d } = t;
    d.querySelector('.tab-btn[data-tab="stats"]').click();
    d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t.idle();
    $('bgSuggestBtn').click();
    const cbs = () => [...d.querySelectorAll('#bgSuggestList input[type=checkbox]')];
    ok(cbs().length === 5 && $('bgSuggestAll'), '1 预算建议 5 行：顶上有「全选」');
    ok($('bgSuggestAll').textContent === '全选' && cbs().filter(c => c.checked).length === 4, '1 默认没设预算的勾上（4 个），按钮写「全选」');
    ok([...d.querySelectorAll('.bg-suggest-row')].some(x => /现在没有预算/.test(x.textContent)) && ![...d.querySelectorAll('.bg-suggest-row')].some(x => /还没设/.test(x.textContent)), '1 没设预算的写「现在没有预算」');
    ok([...d.querySelectorAll('.bg-suggest-row')].some(x => /娱乐.*现在 2840\.00/.test(x.textContent)), '1 设了的写「现在 2840.00」');
    $('bgSuggestAll').click();
    ok(cbs().every(c => c.checked) && $('bgSuggestAll').textContent === '全不选', '1 点「全选」：全勾上，按钮变「全不选」');
    $('bgSuggestAll').click();
    ok(cbs().every(c => !c.checked) && $('bgSuggestAll').textContent === '全选', '1 点「全不选」：全不勾，按钮变回「全选」');
    cbs().forEach(c => { c.checked = true; c.dispatchEvent(new t.w.Event('change')); });
    ok($('bgSuggestAll').textContent === '全不选', '1 一个一个勾满：按钮也变「全不选」');
    t.w.close();
  }
  // 不超过 3 个：没有「全选」
  {
    const RECS = [];
    ['吃饭', '购物'].forEach((c, i) => [7, 8, 9, 10, 11].forEach(mo => RECS.push(r(mo, 3 + i, 200, c))));
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, ['未分类', '吃饭', '购物']) });
    t.d.querySelector('.tab-btn[data-tab="stats"]').click();
    t.d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t.idle();
    t.$('bgSuggestBtn').click();
    ok(t.d.querySelectorAll('.bg-suggest-row').length === 2 && !t.$('bgSuggestAll'), '1 只有 2 行：不加「全选」');
    t.w.close();
  }

  // ===== 2. 只对账清单：5 笔漏记 → 有「全选」=====
  {
    const F = [['微信.csv', B.bill('wechat', [1, 2, 3, 4, 5].map(i => wx({ time: T(i + 2, 12), cp: '某虚构店' + i, fen: 1000 + i * 100 })), { range: RANGE }).bytes]];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([r(9, 1, 5, '吃饭')]) });
    const { $ } = t;
    await t.importFiles(F, null, { noGo: true, stay: true });
    t.w.JiwenImportUI._goStep('overview');
    A.stepGet(t.w)('impRecon').click();
    const rows = () => [...t.d.querySelectorAll('#impReconList input[type=checkbox]')];
    ok(rows().length === 5 && $('impReconAll') && $('impReconAll').textContent === '全选', '2 只对账 5 笔：顶上有「全选」');
    $('impReconAll').click();
    ok(rows().every(c => c.checked) && $('impReconAll').textContent === '全不选' && /补进 5 笔/.test(A.stepGet(t.w)('impGo').textContent), '2 点「全选」：5 笔都勾上，「补进 5 笔」，按钮变「全不选」');
    $('impReconAll').click();
    ok(rows().every(c => !c.checked) && $('impReconAll').textContent === '全选' && A.stepGet(t.w)('impGo').disabled, '2 点「全不选」：都不勾，补进按钮点不了');
    t.w.close();
  }

  // ===== 3. 金额差一点的：4 对 → 多一个「全选」=====
  {
    const man = (id, d, money) => ({ id, time: `2026-10-${p2(d)}T12:20`, money, type: 'expense', cat: '吃饭', remark: '面' });
    const MAN = [man('n1', 5, 30), man('n2', 7, 20), man('n3', 9, 50), man('n4', 11, 40)];
    const F = [['微信.csv', B.bill('wechat', [wx({ time: T(5, 12, 10), fen: 2800 }), wx({ time: T(7, 12, 10), fen: 1850 }), wx({ time: T(9, 12, 10), fen: 4800 }), wx({ time: T(11, 12, 10), fen: 3800 })], { range: RANGE }).bytes]];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN) });
    const { $ } = t;
    const { S } = await t.importFiles(F, null, { noGo: true, stay: true });
    const UI = t.w.JiwenImportUI;
    UI._goStep(S.view.steps.indexOf('match') >= 0 ? 'match' : 'overview');
    const nm = S.plan.sections.nearMerged;
    ok(nm && nm.keys.length === 4 && $('impNearAll') && $('impNearAll').textContent === '全选', '3 金额差一点的 4 对：有「全选」');
    $('impNearAll').click();
    ok(Object.keys(S.view.nearSel).length === 4 && $('impNearAll').textContent === '全不选' && /已勾 4 对/.test($('impNearBulk').textContent), '3 点「全选」：4 对都勾上（收起的那对也算），按钮变「全不选」');
    $('impNearAll').click();
    ok(Object.keys(S.view.nearSel).length === 0 && $('impNearAll').textContent === '全选' && $('impNearBulkPay').disabled, '3 点「全不选」：都不勾');
    t.w.close();
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
