// 1015-D 账单导入第一期 ④ 定去向。node u-import-route.test.js [index.html]
// 纯计算：解析（parse.js）→ 定去向（route.js），不用 jsdom。账单全是虚构的（helpers/bills.js 生成）。
// 单号表和账本用一个假的「主页面」代替：按 lookups 给的键查一张假单号表、一本假账本，拼出 known。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js'));
const R = require(path.join(IMP, 'route.js'));
const B = require('./helpers/bills');
const S = require('./fixtures/refund-samples');
const { makeFakeWorker } = require('./helpers/import-files');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi, s) => ({ y: 2026, mo, d, h, mi, s: s || 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const parse = (...bills) => P.parseFiles(bills.map((b, i) => ({ name: b.name || '账单' + (i + 1), data: B.ab(B.bill(b.app, b.txns, Object.assign({ range: RANGE }, b.opts || {})).bytes) })));
// 假的主页面：table = { 单号键: { st, id } }，ledger = { 记录 id: { type, fen, refunded, mode } }，groups = { 分组键: { id, fen, n } }
// 1016-C：已全额退款的原单查以前的退款——支付宝按「原单号_」开头查假单号表，微信在 oldRefunds（假账本里的退款记录 { cp, fen, time, id }）里找
function knownFor(parsed, table, ledger, groups, oldRefunds) {
  const lk = R.lookups(parsed), known = {};
  (lk.fullRefunds || []).forEach(f => {
    if (f.app === 'alipay') { const k = Object.keys(table || {}).find(x => x.startsWith('alipay|' + f.no + '_')); if (k) known[f.key] = { found: true, id: table[k].id }; }
    else { const r = (oldRefunds || []).find(x => x.cp === f.cp && x.fen === f.fen && x.time >= f.time); if (r) known[f.key] = { found: true, id: r.id }; }
  });
  lk.orders.forEach(k => { const e = table && table[k]; if (e) known[k] = { st: e.st, id: e.id, rec: e.st === 0 && ledger && ledger[e.id] ? ledger[e.id] : null }; });
  lk.groups.forEach(g => { const rec = groups && groups[g.key]; if (rec) known[g.key] = { rec }; });
  return known;
}
const run = (parsed, opts) => R.route(parsed, Object.assign({ known: knownFor(parsed, opts && opts.table, opts && opts.ledger, opts && opts.groups, opts && opts.oldRefunds), rules: opts && opts.rules }));
// 按单号找某一行的去向
function by(parsed, res) {
  const m = {};
  res.items.forEach(it => { if (it.src === 'row') { const row = parsed.files[it.file].rows[it.row]; m[row.no + row.noRest] = Object.assign({ r: row }, it); } });
  return m;
}
const refNo = (parsed, ref) => { const r = parsed.files[ref.file].rows[ref.row]; return r.no + r.noRest; };
const conserved = (res) => res.perFile.every(p => p.ok) && res.items.every(it => ['add', 'skip', 'neutral', 'refund', 'pending', 'error'].includes(it.bucket));
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');                          // 支付宝订单号（虚构，28 位）
const wno = () => '4200000000' + String(++seq).padStart(19, '0');                     // 微信交易单号（虚构）
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');                    // 微信退款单号（和原单无关）
const ali = (o) => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '' }, o));
const wx = (o) => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '' }, o));

(async () => {

// ===== 1. 两家退款样本（refund-samples.js 的预期配对）=====
{
  for (const [app, txns, opts] of [['alipay', S.alipay, { noPad: true }], ['alipay', S.alipay, { noPad: true, timeFmt: S.excelTime }], ['wechat', S.wechat, {}], ['wechat', S.wechat, { format: 'xlsx' }]]) {
    const parsed = parse({ app, txns, opts: Object.assign({ range: S.range }, opts) });
    const res = run(parsed), m = by(parsed, res);
    const pairs = S.pairs[app], full = S.full[app];
    Object.keys(pairs).forEach(rk => {
      const it = m[rk], tag = `${app}${opts.format ? ' xlsx' : ''}${opts.timeFmt ? '（Excel 时间）' : ''}`;
      if (full.includes(rk)) {
        ok(it && it.bucket === 'skip' && it.why === 'fullrefund' && !it.refundTo && refNo(parsed, it.fullOf) === pairs[rk] && m[pairs[rk]].bucket === 'skip' && m[pairs[rk]].why === 'fullrefund',
          `1 ${tag}：全额退款 ${rk.slice(0, 12)}… 和原单 ${pairs[rk].slice(0, 12)}… 两条都跳过`);
        return;
      }
      ok(it && it.bucket === 'refund' && it.why === 'matched' && it.refundTo && refNo(parsed, it.refundTo.row) === pairs[rk] && it.io === 'income',
        `1 ${tag}：部分退款 ${rk.slice(0, 12)}… 挂到原单 ${pairs[rk].slice(0, 12)}…`);
      ok(m[pairs[rk]].bucket === 'add', `1 ${app}：原单照常新增`);
    });
    const nPart = Object.keys(pairs).length - full.length;
    ok(conserved(res) && res.counts.refund === nPart && res.counts.skip === full.length * 2, `1 ${app}：守恒，退款 ${res.counts.refund} 笔、跳过 ${res.counts.skip} 笔`);
  }
}

// ===== 2. 支付宝：用虚构数据复现真实样本的数字 =====
{
  const tx = [], expect = { closed: [], ok: [], refunded: [], rpair: [] };
  for (let i = 0; i < 22; i++) {          // 交易关闭以后全额退：两条都跳过
    const no = ano(); tx.push(ali({ time: T(3, 1 + i % 28, 10, i), no, status: '交易关闭', fen: 500 + i }));
    tx.push(ali({ time: T(3, 1 + i % 28, 11, i), no: no + '_R' + i, status: '退款成功', io: 'neutral', fen: 500 + i, desc: '退款-虚构商品' })); expect.closed.push(no);
  }
  for (let i = 0; i < 5; i++) {           // 交易成功以后退款：部分退的挂到原单，全额退的两条都跳过（1016-C）
    const no = ano(); tx.push(ali({ time: T(4, 1 + i, 9, 0), no, fen: 10000 }));
    tx.push(ali({ time: T(4, 2 + i, 9, 0), no: no + '_M' + i, status: '退款成功', io: 'neutral', fen: i < 3 ? 10000 : 2500 })); expect.ok.push(no);
  }
  for (let i = 0; i < 11; i++) {          // 退款成功、没有单独的退款行：以前导入过退款的跳过，找不到的进待处理（1016-C）
    const no = ano(); tx.push(ali({ time: T(5, 1 + i, 9, 0), no, status: '退款成功', io: 'neutral', fen: 300 })); expect.refunded.push(no);
  }
  for (let i = 0; i < 3; i++) {           // 原单是「退款成功、不计收支」，又有退款行：两条都跳过
    const no = ano(); tx.push(ali({ time: T(6, 1 + i, 9, 0), no, status: '退款成功', io: 'neutral', fen: 800 }));
    tx.push(ali({ time: T(6, 2 + i, 9, 0), no: no + '_X' + i, status: '退款成功', io: 'neutral', fen: 800 })); expect.rpair.push(no);
  }
  const parsed = parse({ app: 'alipay', txns: tx });
  // 前 6 笔的退款以前导入过：假单号表里有「原单号_…」
  const table2 = {}; expect.refunded.slice(0, 6).forEach((no, i) => { table2['alipay|' + no + '_Q' + i] = { st: 0, id: 'old' + i }; });
  const res = run(parsed, { table: table2 }), m = by(parsed, res);
  ok(expect.closed.every(no => m[no].bucket === 'skip' && m[no].why === 'status' && Object.values(m).some(x => x.r.no === no && x.r.noRest && x.bucket === 'skip' && x.why === 'closedpair')),
    '2 交易关闭以后全退 22 笔：原单按状态跳过，退款行也找到了原单、一起跳过（原单虽然跳过了，照样找得到）');
  ok(expect.ok.slice(3).every(no => m[no].bucket === 'add' && Object.values(m).some(x => x.r.no === no && x.r.noRest && x.bucket === 'refund' && refNo(parsed, x.refundTo.row) === no)),
    '2 交易成功以后部分退 2 笔：退款挂到原单');
  ok(expect.ok.slice(0, 3).every(no => m[no].bucket === 'skip' && m[no].why === 'fullrefund' && Object.values(m).some(x => x.r.no === no && x.r.noRest && x.bucket === 'skip' && x.why === 'fullrefund')),
    '2 交易成功以后全额退 3 笔：原单和退款两条都跳过');
  ok(expect.refunded.slice(0, 6).every(no => m[no].bucket === 'add' && m[no].why === 'fullrefundold' && m[no].noMerge && m[no].io === 'expense'), '2 退款成功、没有退款行、单号表里有退款的 6 笔：照常新增（支出，不和手记合并），和以前的退款一出一进');
  ok(expect.refunded.slice(6).every(no => m[no].bucket === 'pending' && m[no].why === 'fullnorefund' && m[no].msg === '这笔已全额退款，退款不在这次的文件里'), '2 退款成功、没有退款行、哪都找不到退款的 5 笔：进待处理');
  ok(R.lookups(parsed).fullRefunds.filter(f => f.app === 'alipay').length === 11 + 3, '2 lookups 带上了要查退款的原单（11 笔没退款行的 + 3 笔原单退款成功又有退款行的）');
  ok(expect.rpair.every(no => m[no].why === 'refunded' && Object.values(m).some(x => x.r.no === no && x.r.noRest && x.why === 'refundedpair')), '2 原单退款成功、又有退款行：两条都跳过');
  ok(res.counts.skip === 44 + 6 + 6 && res.counts.refund === 2 && res.counts.add === 2 + 6 && res.counts.pending === 5 && conserved(res), '2 各桶笔数：跳过 56、退款 2、新增 8、待处理 5，守恒：' + JSON.stringify(res.counts));
  ok(R.lookups(parsed).orders.includes('alipay|' + expect.ok[0]), '2 lookups 里带上了退款行要找的原单键');
}

// ===== 3. 支付宝：原单在以前导入的、找不到、退多了 =====
{
  const o1 = ano(), o2 = ano(), o3 = ano(), o4 = ano(), o5 = ano();
  const tx = [
    ali({ time: T(7, 2, 9, 0), no: o1 + '_A', status: '退款成功', io: 'neutral', fen: 300 }),      // 原单上个月导入过、记录还在
    ali({ time: T(7, 2, 9, 1), no: o2 + '_A', status: '退款成功', io: 'neutral', fen: 300 }),      // 原单登记过，但记录已经删了
    ali({ time: T(7, 2, 9, 2), no: o3 + '_A', status: '退款成功', io: 'neutral', fen: 300 }),      // 原单哪都找不到
    ali({ time: T(7, 1, 9, 0), no: o4, fen: 10000 }),                                                 // 跨境：退得比原单多 3%
    ali({ time: T(7, 3, 9, 0), no: o4 + '_A', status: '退款成功', io: 'neutral', fen: 10300 }),
    ali({ time: T(7, 1, 9, 5), no: o5, fen: 1000 }),                                                  // 三次部分退款，第三次超了
    ali({ time: T(7, 3, 9, 1), no: o5 + '_A', status: '退款成功', io: 'neutral', fen: 400 }),
    ali({ time: T(7, 3, 9, 2), no: o5 + '_B', status: '退款成功', io: 'neutral', fen: 500 }),
    ali({ time: T(7, 3, 9, 3), no: o5 + '_C', status: '退款成功', io: 'neutral', fen: 300 }),
  ];
  const parsed = parse({ app: 'alipay', txns: tx });
  const res = run(parsed, { table: { ['alipay|' + o1]: { st: 0, id: 'rec1' }, ['alipay|' + o2]: { st: 0, id: 'rec2' } },
    ledger: { rec1: { type: 'expense', fen: 1000, refunded: 0, mode: 'normal' } } });
  const m = by(parsed, res);
  ok(m[o1 + '_A'].bucket === 'refund' && m[o1 + '_A'].refundTo.record === 'rec1', '3 原单以前导入过：退款挂到那条记录上');
  ok(m[o2 + '_A'].bucket === 'refund' && m[o2 + '_A'].why === 'noorig' && m[o2 + '_A'].mode === 'flow' && !m[o2 + '_A'].refundTo, '3 原单的记录已经删了：按只算结余、标没找到原单');
  ok(m[o3 + '_A'].why === 'noorig' && m[o3 + '_A'].mode === 'flow' && m[o3 + '_A'].io === 'income' && m[o3 + '_A'].msg.includes('没找到原单'), '3 哪都找不到原单：按收入、只算结余');
  ok(m[o4 + '_A'].bucket === 'pending' && m[o4 + '_A'].why === 'fx' && m[o4 + '_A'].fx === 300 && m[o4 + '_A'].msg.includes('3.00'), '3 退得比原单多 3%：进待处理，带汇率差 3.00 元');
  ok(m[o5 + '_A'].bucket === 'refund' && m[o5 + '_B'].bucket === 'refund' && m[o5 + '_C'].bucket === 'pending' && m[o5 + '_C'].why === 'overrefund', '3 几次退款加起来超过原单：超的那条进待处理');
  // 原单以前导入过，但已经被退过一部分：再退要算上
  const p2 = parse({ app: 'alipay', txns: [ali({ time: T(7, 2, 9, 0), no: o1 + '_Z', status: '退款成功', io: 'neutral', fen: 300 })] });
  const r2 = run(p2, { table: { ['alipay|' + o1]: { st: 0, id: 'rec1' } }, ledger: { rec1: { type: 'expense', fen: 1000, refunded: 800, mode: 'normal' } } });
  ok(r2.items[0].bucket === 'pending' && r2.items[0].why === 'overrefund', '3 以前那条已经退过 8 元，再退 3 元超了：进待处理');
  ok(conserved(res) && conserved(r2), '3 守恒');
}

// ===== 4. 微信：9 笔退款，8 笔唯一配上 =====
{
  const tx = [], E = {};
  const pair = (name, orig, refunds) => { const o = wx(Object.assign({ no: wno() }, orig)); tx.push(o); E[name] = { o: o.no, r: refunds.map(rf => { const x = wx(Object.assign({ no: wrno(), io: 'income', kind: (orig.cp || '虚构商户') + '-退款', cp: orig.cp || '虚构商户', status: orig.status }, rf)); tx.push(x); return x.no; }) }; };
  pair('meituan', { time: T(9, 28, 12, 3, 11), cp: '美团', fen: 2350, status: '已退款¥0.90' }, [{ time: T(9, 29, 0, 58, 43), fen: 90, kind: '美团-退款' }]);
  pair('bbq', { time: T(9, 28, 18, 40, 5), cp: '某某自助烤肉（示例万象天地店）', fen: 5000, status: '已全额退款' }, [{ time: T(9, 28, 20, 22, 23), fen: 5000 }]);
  pair('transfer', { time: T(9, 10, 8, 0), kind: '转账', cp: '某同事', fen: 20000, status: '对方已退还' }, [{ time: T(9, 11, 8, 0), kind: '转账-退款', fen: 20000 }]);
  pair('paren', { time: T(9, 12, 8, 0), cp: '某超市', fen: 3000, status: '已退款(¥5.00)' }, [{ time: T(9, 13, 8, 0), fen: 500 }]);
  pair('cum', { time: T(9, 14, 8, 0), cp: '某拼单', fen: 9000, status: '已退款¥30.00' }, [{ time: T(9, 15, 8, 0), fen: 1000 }, { time: T(9, 16, 8, 0), fen: 2000 }]);
  pair('last', { time: T(9, 17, 8, 0), cp: '某差价', fen: 5000, status: '已退款¥8.00' }, [{ time: T(9, 18, 8, 0), fen: 500 }, { time: T(9, 19, 8, 0), fen: 800 }]);
  const lone = wx({ time: T(9, 20, 8, 0), no: wrno(), io: 'income', kind: '某外卖-退款', cp: '某外卖', fen: 1200, status: '已全额退款' }); tx.push(lone);   // 原单不在这一批
  const parsed = parse({ app: 'wechat', txns: tx, opts: { format: 'xlsx' } });
  const res = run(parsed), m = by(parsed, res);
  const refunds = Object.values(m).filter(x => /-退款$/.test(x.r.kind));
  const matched = refunds.filter(x => (x.refundTo && x.refundTo.row) || x.fullOf);
  ok(refunds.length === 9 && matched.length === 8, '4 9 笔退款里 8 笔唯一配上：' + matched.length);
  Object.keys(E).forEach(name => ok(E[name].r.every(no => { const t = m[no].refundTo ? m[no].refundTo.row : m[no].fullOf; return t && refNo(parsed, t) === E[name].o; }), '4 「' + name + '」的退款配到对的原单'));
  ok(m[E.bbq.o].bucket === 'skip' && m[E.bbq.o].why === 'fullrefund' && m[E.bbq.r[0]].bucket === 'skip' && m[E.bbq.r[0]].msg === '全额退款，等于没发生', '4 全额退款（已全额退款 50 元，退款 50 元）：原单和退款两条都跳过');
  ok(m[E.meituan.r[0]].bucket === 'refund' && m[E.meituan.o].bucket === 'add', '4 部分退款（¥0.90）：退款挂上，原单照常新增（状态「已退款¥0.90」不当关闭）');
  ok(m[E.paren.r[0]].bucket === 'refund', '4 「已退款(¥5.00)」带括号的写法也认');
  ok(m[E.cum.r[0]].multi === 'cumulative' && m[E.last.r[1]].multi === 'last', '4 多次退款：一笔按「累计」对上，一笔按「最后一次」对上');
  ok(m[E.transfer.o].bucket === 'neutral' && m[E.transfer.r[0]].bucket === 'neutral' && m[E.transfer.o].why === 'transferback' && m[E.transfer.o].mode === 'skip', '4 转账被退回：两条都不计入');
  ok(m[lone.no].bucket === 'refund' && m[lone.no].why === 'unmatched' && m[lone.no].flags.includes('needLedger') && m[lone.no].mode === 'flow', '4 本批没配上的：标出来留给 ⑤ 去账本里找');
  ok(conserved(res), '4 守恒');
  // 原单以前导入过（这一批里它被当成已导入跳过），退款照样挂到那条记录
  const p2 = parse({ app: 'wechat', txns: [tx[0], tx[1]] });
  const r2 = run(p2, { table: { ['wechat|' + tx[0].no]: { st: 0, id: 'recM' } }, ledger: { recM: { type: 'expense', fen: 2350, refunded: 0 } } });
  const m2 = by(p2, r2);
  ok(m2[tx[0].no].why === 'imported' && m2[tx[1].no].bucket === 'refund' && m2[tx[1].no].refundTo.record === 'recM', '4 原单以前导入过：退款挂到那条记录');
}

// ===== 5. 微信：候选不止一条、汇率差、金额对不上 =====
{
  const a1 = wx({ time: T(8, 1, 9, 0), no: wno(), cp: '某店', fen: 3000, status: '已全额退款' });
  const a2 = wx({ time: T(8, 2, 9, 0), no: wno(), cp: '某店', fen: 3000, status: '已全额退款' });
  const ar = wx({ time: T(8, 3, 9, 0), no: wrno(), io: 'income', kind: '某店-退款', cp: '某店', fen: 3000, status: '已全额退款' });
  const f1 = wx({ time: T(8, 4, 9, 0), no: wno(), cp: '某海外店', fen: 10000, status: '已全额退款' });
  const fr = wx({ time: T(8, 9, 9, 0), no: wrno(), io: 'income', kind: '某海外店-退款', cp: '某海外店', fen: 10200, status: '已全额退款' });
  const b1 = wx({ time: T(8, 4, 9, 0), no: wno(), cp: '某书店', fen: 10000, status: '已全额退款' });
  const br = wx({ time: T(8, 9, 9, 0), no: wrno(), io: 'income', kind: '某书店-退款', cp: '某书店', fen: 3000, status: '已全额退款' });
  const later = wx({ time: T(8, 20, 9, 0), no: wno(), cp: '某店', fen: 3000, status: '已全额退款' });   // 时间在退款之后，不算
  const parsed = parse({ app: 'wechat', txns: [a1, a2, ar, f1, fr, b1, br, later] });
  const res = run(parsed), m = by(parsed, res);
  ok(m[ar.no].bucket === 'pending' && m[ar.no].why === 'ambiguous' && m[ar.no].cands.length === 2, '5 同对方同金额两笔原单：进待处理，两个候选（时间在退款之后的那笔不算）');
  ok(m[fr.no].bucket === 'pending' && m[fr.no].why === 'fx' && m[fr.no].fx === 200, '5 退款比原单多 2%：进待处理，汇率差 2.00 元');
  ok(m[br.no].bucket === 'pending' && m[br.no].why === 'ambiguous' && m[br.no].cands.length === 1, '5 有候选但金额对不上：进待处理让你选');
  ok(conserved(res), '5 守恒');
}

// ===== 6. 状态、去重、类型规则、不计收支、没见过的类型 =====
{
  const nos = {};
  const mk = (name, o, app) => { const t = (app === 'alipay' ? ali : wx)(Object.assign({ no: app === 'alipay' ? ano() : wno() }, o)); nos[name] = t.no; return t; };
  const aliTx = [
    mk('closed', { time: T(2, 1, 9, 0), status: '交易关闭' }, 'alipay'), mk('wait', { time: T(2, 1, 9, 1), status: '等待付款' }, 'alipay'),
    mk('fail', { time: T(2, 1, 9, 2), status: '失败' }, 'alipay'), mk('undo', { time: T(2, 1, 9, 3), status: '已撤销' }, 'alipay'),
    mk('newst', { time: T(2, 1, 9, 4), status: '等待确认收货' }, 'alipay'), mk('newst2', { time: T(2, 1, 9, 5), status: '神秘状态' }, 'alipay'),
    mk('neutral', { time: T(2, 1, 9, 6), status: '交易成功', io: 'neutral', kind: '投资理财' }, 'alipay'),
    mk('imported', { time: T(2, 1, 9, 7) }, 'alipay'), mk('ignored', { time: T(2, 1, 9, 8) }, 'alipay'), mk('deleted', { time: T(2, 1, 9, 9) }, 'alipay'),
  ];
  const wxTx = [
    mk('wxrefunded', { time: T(2, 2, 9, 0), status: '已全额退款' }, 'wechat'), mk('wxback', { time: T(2, 2, 9, 1), status: '对方已退还', kind: '转账' }, 'wechat'),
    mk('wxslash', { time: T(2, 2, 9, 2), io: 'neutral', kind: '零钱提现' }, 'wechat'),
    mk('group', { time: T(2, 2, 9, 3), io: 'income', kind: '群收款' }, 'wechat'), mk('ruled', { time: T(2, 2, 9, 4), io: 'income', kind: '亲属卡交易' }, 'wechat'),
    mk('ruleskip', { time: T(2, 2, 9, 5), kind: '某新类型' }, 'wechat'), mk('rulenormal', { time: T(2, 2, 9, 6), kind: '另一新类型' }, 'wechat'),
    mk('hongbao', { time: T(2, 2, 9, 7), kind: '微信红包（单发）', io: 'income' }, 'wechat'),
  ];
  const parsed = parse({ app: 'alipay', txns: aliTx }, { app: 'wechat', txns: wxTx });
  const rules = [{ app: 'alipay', status: '等待确认收货', as: 'skip' }, { app: 'wechat', type: '亲属卡交易', as: 'transfer' },
                 { app: 'wechat', type: '某新类型', as: 'skip' }, { app: 'wechat', type: '另一新类型', as: 'normal' }];
  const res = run(parsed, { rules, table: { ['alipay|' + nos.imported]: { st: 0, id: 'x1' }, ['alipay|' + nos.ignored]: { st: 1, id: '' }, ['alipay|' + nos.deleted]: { st: 0, id: 'x3' } },
    ledger: { x1: { type: 'expense', fen: 1000 } } });
  const m = by(parsed, res);
  ok(['closed', 'wait', 'fail', 'undo'].every(k => m[nos[k]].bucket === 'skip' && m[nos[k]].why === 'status'), '6 交易关闭、等待付款、失败、已撤销：跳过');
  ok(m[nos.newst].bucket === 'skip' && m[nos.newst].why === 'statusrule', '6 没见过的状态有规则（跳过）：照规则');
  ok(m[nos.newst2].bucket === 'add' && m[nos.newst2].flags.includes('otherStatus'), '6 没见过的状态没规则：照常新增、标「其他状态」');
  ok(m[nos.wxrefunded].bucket === 'pending' && m[nos.wxrefunded].why === 'fullnorefund' && m[nos.wxback].bucket === 'pending' && m[nos.wxback].why === 'fullnorefund',
    '6 微信「已全额退款」「对方已退还」、本批没有退款行、账本里也没有：进待处理（不当关闭，也不自动新增）');
  ok(m[nos.neutral].bucket === 'neutral' && m[nos.neutral].mode === 'skip' && m[nos.wxslash].bucket === 'neutral', '6 不计收支、微信「/」：不计入');
  ok(m[nos.imported].bucket === 'skip' && m[nos.imported].why === 'imported', '6 以前导入过、记录还在：跳过');
  ok(m[nos.ignored].bucket === 'skip' && m[nos.ignored].why === 'ignored', '6 点过「不要了」：跳过');
  ok(m[nos.deleted].bucket === 'add', '6 以前导入过、记录已经删了：当没导过，照常新增');
  ok(m[nos.group].bucket === 'add' && m[nos.group].flags.includes('otherType'), '6 没见过的微信类型（群收款）：照收/支新增、标「其他类型」');
  ok(m[nos.ruled].bucket === 'neutral' && m[nos.ruled].why === 'typerule', '6 类型规则「当转账」：不计入');
  ok(m[nos.ruleskip].bucket === 'skip' && m[nos.ruleskip].why === 'typerule', '6 类型规则「跳过」：跳过');
  ok(m[nos.rulenormal].bucket === 'add' && !m[nos.rulenormal].flags.includes('otherType'), '6 类型规则「照收/支」：新增，不再标其他');
  ok(m[nos.hongbao].bucket === 'add' && !m[nos.hongbao].flags.length, '6 认得的类型（微信红包（单发））不标');
  ok(conserved(res), '6 守恒');
  // 去重键用完整单号：原单导入过，同号带后缀的退款行不会被当成导入过
  const o = ano();
  const p2 = parse({ app: 'alipay', txns: [ali({ time: T(2, 3, 9, 0), no: o }), ali({ time: T(2, 4, 9, 0), no: o + '_R1', status: '退款成功', io: 'neutral', fen: 300 })] });
  const r2 = run(p2, { table: { ['alipay|' + o]: { st: 0, id: 'q1' } }, ledger: { q1: { type: 'expense', fen: 1000 } } });
  const m2 = by(p2, r2);
  ok(m2[o].why === 'imported' && m2[o + '_R1'].bucket === 'refund' && m2[o + '_R1'].refundTo.record === 'q1', '6 去重用完整单号：原单导入过，退款行（原单号_后缀）不受影响，挂到原单那条记录');
}

// ===== 7. 合并：分分捐按月、收款太多建议按天、疑似零碎扣款 =====
{
  const petty = (mo, d, k) => wx({ time: T(mo, d, 7, k % 60), no: wno(), kind: '分分捐', cp: '腾讯公益', desc: '分分捐', fen: 1 });
  const sep = []; for (let d = 1; d <= 30; d++) sep.push(petty(9, d, d));
  const oct = []; for (let d = 1; d <= 5; d++) oct.push(petty(10, d, d));
  const parsed = parse({ app: 'wechat', txns: sep.concat(oct) });
  const res = run(parsed);
  ok(res.summaries.length === 2 && res.summaries.every(g => g.kind === 'petty' && !g.appendTo), '7 分分捐按月合并：两个月两条');
  const g9 = res.summaries.find(g => g.period === '2026-09');
  ok(g9.count === 30 && g9.fen === 30 && g9.keys.length === 30 && g9.keys.every(k => k.startsWith('wechat|')) && g9.oc === '分分捐' && g9.time === '2026-09-30T07:30', '7 合并记录带上全部 30 个单号，金额 0.30 元，时间取当月最后一笔');
  ok(res.items.filter(it => it.group === g9.id).length === 30 && res.counts.add === 35, '7 合并进去的行都在「新增」桶，标着属于哪条合并记录');
  ok(R.lookups(parsed).groups.some(g => g.key === R.groupKey('wechat', 'petty', '2026-09') && g.oc === '分分捐' && g.app === 'wechat'), '7 lookups 带上了分组键（来源 + 合并种类 + 月份）');
  // 先导上半月，再导下半月：只有一条
  const first = parse({ app: 'wechat', txns: sep.slice(0, 15) });
  const r1 = run(first);
  ok(r1.summaries.length === 1 && r1.summaries[0].count === 15 && !r1.summaries[0].appendTo, '7 先导上半月：新建一条合并记录（15 笔）');
  // 假装第一次已经写进账本：单号登记到 sumA，账本里有一条合并记录 sumA
  const table = {}; r1.summaries[0].keys.forEach(k => { table[k] = { st: 0, id: 'sumA' }; });
  const ledger = { sumA: { type: 'expense', fen: 15, refunded: 0 } };
  const groups = { [R.groupKey('wechat', 'petty', '2026-09')]: { id: 'sumA', fen: 15, n: 15 } };
  const second = parse({ app: 'wechat', txns: sep.slice(15) });
  const r2 = run(second, { table, ledger, groups });
  ok(r2.summaries.length === 1 && r2.summaries[0].appendTo === 'sumA' && r2.summaries[0].count === 15 && JSON.stringify(r2.summaries[0].before) === '{"fen":15,"n":15}',
    '7 再导下半月：并进已有的那条（appendTo），带上追加前的原值（给 ⑦ 撤销用），不新建');
  // 再导一次整月：上半月的跳过，下半月的并进去
  const whole = parse({ app: 'wechat', txns: sep });
  const r3 = run(whole, { table, ledger, groups });
  ok(r3.counts.skip === 15 && r3.summaries.length === 1 && r3.summaries[0].appendTo === 'sumA' && r3.summaries[0].count === 15, '7 再导整月：导过的 15 笔跳过，新的 15 笔并进同一条');
  // 收款：一个月 301 条建议按天合并，300 条不建议
  const rc = n => { const a = []; for (let i = 0; i < n; i++) a.push(wx({ time: T(11, 1 + i % 28, 9 + (i % 10), i % 60), no: wno(), kind: '二维码收款', cp: '某顾客', io: 'income', fen: 100 + i, status: '已存入零钱' })); return a; };
  const p301 = parse({ app: 'wechat', txns: rc(301) }), r301 = run(p301);
  ok(r301.summaries.length === 28 && r301.summaries.every(g => g.kind === 'receipt' && g.suggest === true) && r301.summaries.reduce((s, g) => s + g.count, 0) === 301, '7 收款一个月 301 条：按天建议合并（28 天，每天一条，只是建议）');
  ok(R.lookups(p301).groups.filter(g => g.kind === 'receipt').length === 28, '7 lookups 带上收款的按天分组键');
  // 1021-T9：300 条不再整月合（不是 bulk）；但这里每天都有 5 笔以上 200 元以内的，按「一天够多的小额」建议合（默认不合，见 plan）
  const r300 = run(parse({ app: 'wechat', txns: rc(300) }));
  ok(r300.summaries.every(g => !g.bulk) && r301.summaries.every(g => g.bulk), '7 收款 300 条：不按整月合（不是 bulk），301 条是');
  // 疑似零碎扣款：某停车场一个月 6 次、每次 ≤ 1 元
  const pk = []; for (let i = 0; i < 6; i++) pk.push(wx({ time: T(3, 1 + i, 9, 0), no: wno(), cp: '某停车场', fen: 50 }));
  const rp = run(parse({ app: 'wechat', txns: pk }));
  ok(rp.suspects.length === 1 && rp.suspects[0].count === 6 && rp.items.every(it => it.flags.includes('pettySuspect')) && rp.summaries.length === 0, '7 疑似零碎扣款：标出来、不合并');
  const pk2 = pk.concat([wx({ time: T(3, 9, 9, 0), no: wno(), cp: '某停车场', fen: 500 })]);
  ok(run(parse({ app: 'wechat', txns: pk2 })).suspects.length === 0, '7 这个对方有一笔超过 1 元：不算零碎扣款');
}

// ===== 8. ③ 的出错和重复、多个文件、整份不认的文件 =====
{
  const a = [ali({ time: T(1, 2, 9, 0), no: ano() }), ali({ time: T(1, 3, 9, 0), no: ano() })];
  const parsed = P.parseFiles([
    { name: '一', data: B.ab(B.bill('alipay', a, { range: RANGE, edit: s => s.replace('10.00 ', '十块') }).bytes) },
    { name: '二', data: B.ab(B.bill('alipay', a.concat([a[0]]), { range: RANGE }).bytes) },
    { name: '坏的', data: B.ab(new Uint8Array(Buffer.from('随便什么'))) },
  ]);
  const res = run(parsed);
  ok(res.items.filter(it => it.src === 'error').every(it => it.bucket === 'error') && res.counts.error === 1, '8 ③ 的出错行进「出错」桶');
  ok(res.items.filter(it => it.src === 'dup').every(it => it.bucket === 'skip') && res.items.filter(it => it.src === 'dup').length === 2, '8 ③ 的重复行（同文件重复、和别的文件重复）进「跳过」桶');
  ok(res.perFile.length === 3 && res.perFile[2].fatal && res.perFile[2].sum === 0 && conserved(res), '8 每个文件各自守恒，整份不认的文件 0 笔');
  ok(res.perFile[0].sum === 2 && res.perFile[1].sum === 3, '8 第一份 2 笔、第二份 3 笔');
}

// ===== 9. 性质测试：几百份随机账单 =====
{
  let s = 4242;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const ri = n => Math.floor(rnd() * n);
  let bad = 0, notes = [];
  for (let k = 0; k < 400; k++) {
    const app = rnd() < 0.5 ? 'alipay' : 'wechat';
    const tx = [], n = ri(40);
    const cps = ['甲店', '乙店', '丙店', '某同事'];
    for (let i = 0; i < n; i++) {
      const t = T(1 + ri(12), 1 + ri(27), ri(23), ri(60), ri(60));
      const cp = cps[ri(cps.length)], fen = 1 + ri(20000);
      if (app === 'alipay') {
        const no = ano(), st = ['交易成功', '交易成功', '交易关闭', '退款成功', '等待付款', '某新状态'][ri(6)];
        tx.push(ali({ time: t, no, cp, fen, status: st, io: st === '退款成功' ? 'neutral' : (rnd() < 0.15 ? 'income' : 'expense') }));
        for (let j = ri(3); j > 0; j--) tx.push(ali({ time: Object.assign({}, t, { d: t.d + 1, s: j }), no: no + '_' + j, cp, fen: 1 + ri(fen), status: '退款成功', io: 'neutral' }));
      } else {
        const st = ['支付成功', '已全额退款', '已退款¥' + (ri(50) + 1) + '.00', '对方已退还', '已存入零钱'][ri(5)];
        const kind = ['商户消费', '转账', '分分捐', '二维码收款', '群收款'][ri(5)];
        tx.push(wx({ time: t, no: wno(), cp, fen, status: st, kind, io: kind === '二维码收款' ? 'income' : 'expense' }));
        for (let j = ri(3); j > 0; j--) tx.push(wx({ time: Object.assign({}, t, { d: t.d + 1, s: j }), no: wrno(), cp, io: 'income', kind: rnd() < 0.5 ? cp + '-退款' : '转账-退款', fen: rnd() < 0.5 ? fen : 1 + ri(fen), status: st }));
      }
    }
    const parsed = parse({ app, txns: tx });
    // 随机一些「以前导入过 / 点过不要了 / 记录删了」
    const table = {}, ledger = {};
    R.lookups(parsed).orders.forEach((key, i) => { const x = ri(10); if (x === 0) { table[key] = { st: 0, id: 'L' + i }; ledger['L' + i] = { type: 'expense', fen: 1 + ri(20000), refunded: ri(500) }; } else if (x === 1) table[key] = { st: 1, id: '' }; else if (x === 2) table[key] = { st: 0, id: 'gone' + i }; });
    const ctx = { table, ledger };
    const res = run(parsed, ctx), res2 = run(parsed, ctx);
    // 挂到同一条原单的退款加起来不超过原单
    const sumRow = new Map(), sumRec = {};
    let over = false;
    res.items.forEach(it => {
      if (it.bucket !== 'refund' && !(it.bucket === 'neutral' && it.why === 'transferback')) return;
      if (!it.refundTo) return;
      const fen = parsed.files[it.file].rows[it.row].fen;
      if (it.refundTo.row) { const o = parsed.files[it.refundTo.row.file].rows[it.refundTo.row.row]; const k = it.refundTo.row.file + ':' + it.refundTo.row.row; sumRow.set(k, (sumRow.get(k) || 0) + fen); if (sumRow.get(k) > o.fen) over = true; }
      else { const id = it.refundTo.record; sumRec[id] = (sumRec[id] || 0) + fen; if (sumRec[id] + (ledger[id].refunded || 0) > ledger[id].fen) over = true; }
    });
    const good = conserved(res) && !over && JSON.stringify(res) === JSON.stringify(res2) && res.perFile[0].total === tx.length;
    if (!good) { bad++; if (notes.length < 3) notes.push(`#${k} ${app} n=${tx.length} perFile=${JSON.stringify(res.perFile)} over=${over}`); }
  }
  ok(bad === 0, '9 400 份随机账单：每笔只进一个桶、各桶之和 = 文件笔数、退款不超过原单、两次结果一样 ' + notes.join(' | '));
}

// ===== 11. 1016-C：自己账户之间挪钱一律不计入；已全额退款、退款以前导入过 =====
{
  const nos = {};
  const mk = (name, o) => { const t = wx(Object.assign({ no: wno() }, o)); nos[name] = t.no; return t; };
  const tx = [
    mk('card', { time: T(3, 5, 0, 3), kind: '信用卡还款', cp: '虚构银行', fen: 220379, io: 'expense', status: '支付成功' }),   // 账单写的是「支出」也不计入
    mk('cardslash', { time: T(3, 5, 0, 4), kind: '信用卡还款', cp: '虚构银行', fen: 10000, io: 'neutral', status: '支付成功' }),
    mk('lqt', { time: T(3, 6, 9, 0), kind: '零钱通转入-来自零钱', cp: '零钱通', fen: 5000, io: 'expense' }),
    mk('lct', { time: T(3, 6, 9, 1), kind: '理财通-买入', cp: '理财通', fen: 5000, io: 'expense' }),
    mk('cash', { time: T(3, 6, 9, 2), kind: '零钱提现', cp: '虚构银行', fen: 5000, io: 'income' }),
    mk('topup', { time: T(3, 6, 9, 3), kind: '零钱充值', cp: '虚构银行', fen: 5000, io: 'income' }),
    mk('ruled', { time: T(3, 6, 9, 4), kind: '零钱充值', cp: '另一虚构银行', fen: 6000, io: 'income' }),
    mk('oldfull', { time: T(3, 7, 9, 0), cp: '某虚构饭店', fen: 5000, status: '已全额退款' }),     // 退款上个月导入过
    mk('nofull', { time: T(3, 8, 9, 0), cp: '某虚构饭店', fen: 5000, status: '已全额退款' }),      // 退款哪都找不到
  ];
  const parsed = parse({ app: 'wechat', txns: tx });
  const rules = [{ app: 'wechat', type: '零钱充值', as: 'normal' }];
  const lk = R.lookups(parsed);
  ok(lk.fullRefunds.length === 2 && lk.fullRefunds.every(f => f.key === R.fullRefundKey(R.orderKey('wechat', parsed.files[0].rows.find(r => r.no === f.no))) && f.fen === 5000 && f.cp === '某虚构饭店'),
    '11 lookups 带上已全额退款的原单（键、对方、金额、时间）');
  const noRule = run(parsed, { oldRefunds: [{ cp: '某虚构饭店', fen: 5000, time: '2026-03-07T09:30', id: 'oldR' }] }), m0 = by(parsed, noRule);
  ok(['card', 'cardslash', 'lqt', 'lct', 'cash', 'topup', 'ruled'].every(k => m0[nos[k]].bucket === 'neutral' && m0[nos[k]].mode === 'skip' && m0[nos[k]].why === 'ownmove'),
    '11 信用卡还款（不管写的收 / 支）、零钱通、理财通、零钱提现、零钱充值：一律不计入');
  const res = run(parsed, { rules, oldRefunds: [{ cp: '某虚构饭店', fen: 5000, time: '2026-03-07T09:30', id: 'oldR' }] }), m = by(parsed, res);
  ok(m[nos.ruled].bucket === 'add', '11 用户把类型定成「正常收支」的照规则');
  ok(m[nos.oldfull].bucket === 'add' && m[nos.oldfull].why === 'fullrefundold' && m[nos.oldfull].noMerge && m[nos.oldfull].refundRec === 'oldR', '11 已全额退款、退款以前导入过：照常新增、不和手记合并，记下那条退款记录');
  ok(m[nos.nofull].regIgnore.length === 2 && m[nos.nofull].regIgnore[1] === R.refundMarkKey('wechat', '某虚构饭店', 5000, '2026-03-08'), '11 退款不在文件里的原单：带上「不要了」时要登记的忽略键（原单 + 退款记号）');
  ok(m[nos.nofull].bucket === 'pending' && m[nos.nofull].why === 'fullnorefund', '11 已全额退款、退款时间早于原单的不算：进待处理');
  ok(conserved(res), '11 守恒');
}

// ===== 10. 在后台线程里跑 =====
{
  const FW = makeFakeWorker(path.dirname(htmlFile));
  const w = new FW('https://localhost/import/worker.js');
  const msgs = []; w.onmessage = e => msgs.push(e.data);
  for (let i = 0; i < 400 && !msgs.length; i++) await new Promise(r => setTimeout(r, 5));
  const parsed = parse({ app: 'wechat', txns: S.wechat, opts: { range: S.range } });
  const known = knownFor(parsed);
  w.postMessage({ id: 1, cmd: 'route', data: { parsed, known, rules: [] } });
  for (let i = 0; i < 400 && !msgs.some(m => m.id === 1 && m.type !== 'progress'); i++) await new Promise(r => setTimeout(r, 5));
  const done = msgs.find(m => m.id === 1 && m.type === 'done');
  ok(done && JSON.stringify(done.result) === JSON.stringify(R.route(parsed, { known, rules: [] })), '10 线程里定去向的结果和直接算一模一样');
  w.postMessage({ id: 2, cmd: 'info' });
  for (let i = 0; i < 400 && !msgs.some(m => m.id === 2); i++) await new Promise(r => setTimeout(r, 5));
  ok(msgs.find(m => m.id === 2).result.route === R.VERSION, '10 线程里载入了 route.js');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
