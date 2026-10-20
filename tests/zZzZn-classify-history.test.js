// 1021-T8（实测 10-20 第 2 轮）分类推荐「从账本历史里学」：同一个对方（清洗后）以前导进账本的、同收支的记录至少 3 条、
// 八成以上同一类 → 把握中，理由「你以前 5 次都记成「X」」；排在「从合并里学」后面、内置词表前面。只是计数，不存新东西。
// 纯计算 + jsdom 真导两次（第二次见效）。node zZzZn-classify-history.test.js [index.html]。数据全是虚构的。
const fs = require('fs'), path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));
const A = require('./helpers/app');
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '餐饮', '购物', '出行', '其他', '红包', '工资', '游戏'];
const one = (r, h, o) => C.classify([r], Object.assign({ cats: CATS, merchants: M, history: h }, o || {})).recs[0];

(async () => {
  const row = { app: 'alipay', cp: '某虚构科技有限公司', desc: '充值', kind: '文化休闲', io: 'expense' };
  const a = one(row, { '某虚构科技有限公司': { e: { '游戏': 5 }, i: {} } });
  ok(a.cat === '游戏' && a.layer === 'history' && a.conf === 'mid' && /你以前 5 次都记成「游戏」/.test(a.reason), '1 以前 5 次都是游戏 → 游戏（把握中）：' + a.reason);
  const b = one(row, { '某虚构科技有限公司': { e: { '游戏': 4, '购物': 1 }, i: {} } });
  ok(b.cat === '游戏' && /5 次里 4 次/.test(b.reason), '1 八成以上（4/5）也算');
  ok(one(row, { '某虚构科技有限公司': { e: { '游戏': 3, '购物': 2 }, i: {} } }).layer !== 'history', '2 不到八成不算');
  ok(one(row, { '某虚构科技有限公司': { e: { '游戏': 2 }, i: {} } }).layer !== 'history', '2 不到 3 条不算');
  ok(one(row, { '某虚构科技有限公司': { e: {}, i: { '游戏': 5 } } }).layer !== 'history', '2 收支不一样的不算');
  ok(one(row, { '某虚构科技有限公司': { e: { '旅行': 5 }, i: {} } }).layer !== 'history', '2 分类已经不在存档里的不算');
  ok(one(row, { '某虚构科技有限公司（示例分店）': { e: { '游戏': 3 }, i: {} } }).layer === 'history', '3 按清洗后的对方合起来');
  const r1 = one(row, { '某虚构科技有限公司': { e: { '游戏': 5 }, i: {} } }, { rules: [{ kw: '某虚构科技', cat: '购物' }] });
  ok(r1.layer === 'rule', '3 你的规则排在前面');

  // 真导两次：第一次导进来手动归成「游戏」，第二次同一个对方就推「游戏」
  const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
  let seq = 0;
  const T = (mo, d) => ({ y: 2026, mo, d, h: 10, mi: 0, s: 0 });
  const ali = o => B.txn(Object.assign({ kind: '文化休闲', cp: '某虚构科技有限公司', desc: '渠道测试', io: 'expense', fen: 600, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
  const F1 = [['一月.csv', B.bill('alipay', [1, 2, 3, 4].map(d => ali({ time: T(1, d) })), { range: { from: '2026-01-01 00:00:00', to: '2026-01-31 23:59:59' } }).bytes]];
  const F2 = [['二月.csv', B.bill('alipay', [ali({ time: T(2, 5) })], { range: { from: '2026-02-01 00:00:00', to: '2026-02-28 23:59:59' } }).bytes]];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-20T10:00:00' });
  await t.importFiles(F1);
  const st = t.w.JiwenStore, u = st.loadStore(t.w.JiwenBase.currentUser), arch = u.archives[t.w.JiwenBase.currentArchive];
  arch.records = arch.records.map(r => Object.assign({}, r, { cat: '游戏' })); st.saveStore(u); await new Promise(r => setTimeout(r, 50));
  ok(t.st().archiveInfo().cpHist['某虚构科技有限公司'].e['游戏'] === 4, '4 archiveInfo 按对方数了以前的分类');
  let seen = null;
  await t.importFiles(F2, S => { seen = S.plan.rows.filter(d => d.src === 'row').map(d => d.rec || d.item.rec); });
  ok(seen && seen[0] && seen[0].layer === 'history' && seen[0].cat === '游戏', '4 第二次导入：同一个对方推「游戏」（从账本历史里学）');
  ok(t.recs().filter(r => r.cat === '游戏').length === 5, '4 写进账本的也是游戏');

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
