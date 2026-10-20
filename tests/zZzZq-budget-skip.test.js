// 1021-T11（实测 10-20 第 2 轮）预算建议：未分类、转账不给建议；一个都没勾时「写入勾上的」点不了，按钮写勾了几个。
// jsdom。node zZzZq-budget-skip.test.js [index.html]。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const p2 = n => String(n).padStart(2, '0');
let k = 0;
const r = (mo, d, money, cat, o) => Object.assign({ id: 'r' + (++k), time: `2026-${p2(mo)}-${p2(d)}T12:00`, money, type: 'expense', cat, remark: '' }, o || {});

(async () => {
  const RECS = [];
  [7, 8, 9, 10, 11].forEach(mo => { RECS.push(r(mo, 3, 870, '未分类'), r(mo, 4, 500, '转账'), r(mo, 5, 300, '吃饭')); });
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, ['未分类', '吃饭', '转账', '其他']) });
  const { $, d } = t;
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  d.querySelector('#statTabSeg button[data-v="budget"]').click(); await t.idle();
  $('bgSuggestBtn').click();
  const rows = [...d.querySelectorAll('.bg-suggest-row')].map(x => x.dataset.cat);
  ok(rows.length === 1 && rows[0] === '吃饭', '1 只建议吃饭；未分类（870）、转账不建议：' + rows.join('、'));
  const go = $('bgSuggestApply'), cb = d.querySelector('.bg-suggest-row input');
  ok(!go.disabled && /写入勾上的 1 个/.test(go.textContent), '2 勾了 1 个：按钮写「写入勾上的 1 个」、能点');
  cb.checked = false; cb.dispatchEvent(new t.w.Event('change'));
  ok(go.disabled && go.textContent === '写入勾上的', '2 一个都没勾：点不了');

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
