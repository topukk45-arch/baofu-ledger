// 1017-UI11 两个显示小毛病（jsdom 跑整个 App）。node zZz-import-display.test.js [index.html]
// 不计的行在「金额要你看一眼」里不写「→ 未分类」；对方名显示前去掉多余空格（含全角）和空括号（只改显示，存的原文不动）。账单全是虚构的。
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
const ODD = '某虚构店　　(　　　　)';
const TX = () => [
  wx({ time: T(6, 12), cp: ODD, desc: '/', fen: 1999 }),
  wx({ time: T(8, 12), cp: ODD, desc: '/', fen: 2999 }),   // 1021-T14：只有 2 笔以上的对方才列组
  wx({ time: T(7, 10), kind: '零钱提现', cp: '某虚构银行(尾号0000)', desc: '/', io: 'neutral', fen: 300000, status: '提现已到账' }),
];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const q = s => t.d.querySelector(s), raw = id => t.d.getElementById(id), S = () => t.S();
  await pick(t, bill(TX())); const UI = t.w.JiwenImportUI;
  // ===== 1. 金额要你看一眼：不计的行不写分类 =====
  const ac = S().plan.sections.amountChecks.find(x => /某虚构银行/.test(x.cp));
  ok(ac, '1 零钱提现 3000 元进了「金额要你看一眼」（大额）');
  // 导入简化 2a：大额在核对页「大额，先定算不算收支」里问（不写分类、默认选中「不计」），其余金额提醒在总览的「提醒」里
  UI._goStep('check');
  let ar = Array.from(t.d.querySelectorAll('.imp-big-row')).find(r => /某虚构银行|提现/.test(r.textContent));
  if (ar) ok(ar.querySelector('.imp-big-m.on').dataset.mode === 'skip' && !/→/.test(ar.textContent) && !/未分类/.test(ar.textContent), '1 不计的大额：在核对页问，默认「不计」，不写分类：' + ar.textContent);
  else {
    UI._goStep('overview');
    ar = Array.from(t.d.querySelectorAll('.imp-amount-row')).find(r => /某虚构银行/.test(r.textContent));
    ok(ar && /（不计）/.test(ar.textContent) && !/→ 未分类/.test(ar.textContent) && !/→/.test(ar.querySelector('.grow').textContent), '1 不计的行：写「（不计）」，不写「→ 未分类」：' + (ar ? ar.querySelector('.grow').textContent : ''));
  }
  // ===== 2. 对方名：多余空格、空括号显示前去掉；存的原文不动 =====
  ok(S().plan.rows.some(d => d.cp === ODD), '2 方案里这一行存的还是原文（带全角空格和空括号）');
  UI._goStep('cat');
  const cr = Array.from(t.d.querySelectorAll('.imp-cp-row')).find(r => /某虚构店/.test(r.dataset.cp));
  ok(cr && /^某虚构店 · 2 笔/.test(cr.querySelector('.grow').textContent) && !/[(（]/.test(cr.querySelector('.grow').textContent) && !/　/.test(cr.textContent), '2 按对方选分类：显示「某虚构店 · 1 笔…」：' + (cr ? cr.querySelector('.grow').textContent : ''));
  const S0 = S(); S0.view.details = true; Object.keys(S0.plan.groups).forEach(g => { S0.view.open[g] = true; }); UI._goStep('overview');
  const k = S().plan.rows.find(d => d.cp === ODD).key;
  const dr = Array.from(t.d.querySelectorAll('#impBody .al-row')).find(r => r.dataset.key === k);
  ok(dr && dr.querySelector('.al-remark').textContent === '某虚构店', '2 明细那一行：显示「某虚构店」');
  dr.click();
  const kv = Array.from(raw('impSheet').querySelectorAll('.kv')).find(r => r.firstChild.textContent === '交易对方');
  ok(kv && kv.lastChild.textContent === '某虚构店', '2 行详情：交易对方显示「某虚构店」');
  raw('impSheetClose').click();
  const kb = S().plan.rows.find(d => /某虚构银行/.test(d.cp));
  ok(kb && kb.cp === '某虚构银行(尾号0000)', '2 不空的括号照留：某虚构银行(尾号0000)');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
