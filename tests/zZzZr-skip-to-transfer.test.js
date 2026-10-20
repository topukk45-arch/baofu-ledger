// 1021-T12（实测 10-20 第 2 轮）不计的行（余额宝、花呗还款、提现……）推不出分类时：存档里有「转账」就落「转账」，
// 没有照旧未分类；推得出的、你改过的照旧。node zZzZr-skip-to-transfer.test.js [index.html]。账单虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js')), W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 5, d, h, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '投资理财', cp: '余额宝', desc: '转入', io: 'neutral', fen: 50000, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const tx = [ali({ time: T(1, 9) }), ali({ time: T(2, 9), kind: '信用借还', cp: '花呗', desc: '还款' }), ali({ time: T(3, 9), kind: '日用百货', cp: '某虚构商店', desc: '日用品', io: 'expense', fen: 1000 })];
const parsed = P.parseFiles([{ name: 'a.csv', data: B.ab(B.bill('alipay', tx, { range: RANGE }).bytes) }]);
const run = (cats, e) => { const routed = R.route(parsed, { known: {} }); const matched = M.match(routed, parsed, { manual: [], cats, merchants: W });
  return PL.plan({ parsed, matched, info: { cats }, manualById: {}, overlaps: [] }, e || {}).rows.filter(d => d.src === 'row'); };
const a = run(['未分类', '购物', '转账', '其他']);
ok(a.filter(d => d.mode === 'skip').length === 2 && a.filter(d => d.mode === 'skip').every(d => d.cat === '转账'), '1 有「转账」：余额宝、花呗还款落「转账」');
ok(a.find(d => d.mode !== 'skip').cat === '购物', '1 计入的照旧');
const b = run(['未分类', '购物', '其他']);
ok(b.filter(d => d.mode === 'skip').every(d => d.cat === '未分类'), '2 没有「转账」：照旧未分类');
const k = a.find(d => d.mode === 'skip').key;
ok(run(['未分类', '购物', '转账', '其他'], { rows: { [k]: { cat: '其他' } } }).find(d => d.key === k).cat === '其他', '3 你改过的照你改的');

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
