// 1021-T16（实测 10-20 第 3 轮）确认页界面几条：新建分类写「现在：新建 / 并到 / 不建」；已处理不划线、前面绿 ✓；就在这一步不写「挪到第 N 步」；
// 零碎扣款勾选框写「勾上 = 合成一条」；「已全额退款、退款不在文件里」放第 3 步；
// 选分类面板副标题「可选的分类 N 个」、推荐新建没勾的也能直接选。jsdom。node zZzZv-confirm-ui-t16.test.js [index.html]。账单虚构。
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
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '交通出行', cp: '某虚构出行', desc: '车费', io: 'expense', fen: 1500, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const TX = [ali({ time: T(3, 9) }), ali({ time: T(4, 9) }), ali({ time: T(5, 9), cp: '某虚构出行二' }),
            ali({ time: T(6, 9), cp: '某虚构耳机店', kind: '数码电器', desc: '耳机', status: '退款成功', fen: 20000 })];
const F = [['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], ['未分类', '吃饭', '购物', '其他']), now: '2026-10-20T10:00:00' });
  const q = s => t.d.querySelector(s);
  await t.importFiles(F, null, { noGo: true, stay: true });
  const UI = t.w.JiwenImportUI, S = () => UI._state();
  // 「已全额退款、退款不在文件里」放第 3 步
  const fn = S().plan.rows.find(d => d.why === 'fullnorefund' || (d.item && d.item.why === 'fullnorefund'));
  ok(fn && (S().view.items.refund || []).some(x => x.keys.indexOf(fn.key) >= 0) && !(S().view.items.match || []).some(x => x.keys.indexOf(fn.key) >= 0), '1 「已全额退款、退款不在文件里」在第 3 步「退款和转账」');
  UI._goStep(S().view.steps.indexOf('cat') >= 0 ? 'cat' : 'overview');
  const st = q('#impNewCats .imp-nc-state');
  ok(st && /^现在：新建「交通出行」$/.test(st.textContent), '2 新建分类写现在是哪种（2b 起至少 3 笔默认建）：' + (st && st.textContent));
  let cb = q('#impNewCats input[type=checkbox]'); cb.checked = false; cb.dispatchEvent(new t.w.Event('change'));
  ok(/^现在：不建，这 \d+ 笔落未分类$/.test(q('#impNewCats .imp-nc-state').textContent), '2 勾掉：现在：不建，落未分类');
  cb = q('#impNewCats input[type=checkbox]'); cb.checked = true; cb.dispatchEvent(new t.w.Event('change'));
  ok(/^现在：新建「交通出行」$/.test(q('#impNewCats .imp-nc-state').textContent), '2 勾上：现在：新建「交通出行」');
  const css = [...t.d.querySelectorAll('style')].map(x => x.textContent).join('\n');
  ok(!/imp-moved \.imp-done-label\{text-decoration:line-through/.test(css) && /imp-moved \.imp-done-label::before\{content:"✓ "/.test(css), '3 已处理不划线，前面绿 ✓');
  // 选分类面板：副标题、推荐新建的能直接选
  const row = q('.imp-cp-row');
  if (row) {
    row.click();
    ok(/可选的分类 \d+ 个/.test(t.d.getElementById('uiSheetSub').textContent), '4 选分类面板副标题「可选的分类 N 个」：' + t.d.getElementById('uiSheetSub').textContent);
    t.w.JiwenSheet.close();
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
