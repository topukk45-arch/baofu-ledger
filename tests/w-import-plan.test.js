// 1016-B 账单导入第一期 ⑥a 导入方案（plan.js，纯计算）。node w-import-plan.test.js [index.html]
// 解析 → 定去向 → 配对 → 方案，核对确认页上的各项数字：汇总和三步的结果一致、每个文件 × 收支的差额合计差 0 分、
// 改了东西以后汇总和差额跟着变、随机改动守恒照样成立。账单、手记全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js'));
const R = require(path.join(IMP, 'route.js'));
const M = require(path.join(IMP, 'match.js'));
const PL = require(path.join(IMP, 'plan.js'));
const W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h || 12, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '吃饭', '购物', '转账', '工资', '红包', '其他'];
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, fen, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, type: 'expense', fen, cat: '吃饭', mode: 'normal' }, o || {});

function run(bills, manual, opts) {
  opts = opts || {};
  const parsed = P.parseFiles(bills.map((b, i) => ({ name: b.name || '账单' + (i + 1), data: b.raw || B.ab(B.bill(b.app, b.txns, Object.assign({ range: RANGE }, b.opts || {})).bytes) })));
  const routed = R.route(parsed, { known: {}, rules: opts.typeRules || [] });
  const matched = M.match(routed, parsed, { manual: manual || [], cats: CATS, merchants: W, isNewUser: !!opts.isNewUser });
  const manualById = {}; (manual || []).forEach(m => { manualById[m.id] = m; });
  const input = { parsed, matched, info: { cats: CATS, isNewUser: !!opts.isNewUser }, manualById, overlaps: opts.overlaps || [] };
  return { parsed, routed, matched, input, plan: e => PL.plan(input, e) };
}
// 每个文件 × 收支：头部 = 各项之和 + 读不出来的；没有出错行时读不出来的必须是 0
function diffOk(p) {
  return p.files.every(f => f.fatal || ['expense', 'income', 'neutral'].every(io => {
    const d = f.diff[io]; if (!d.header) return true;
    return d.header.fen === d.sum + d.unreadable && (f.errors > 0 || d.unreadable === 0) && d.parts.reduce((s, x) => s + x.fen, 0) === d.sum;
  }));
}
const unitsOk = (p, parsed) => Object.values(p.counts).reduce((s, n) => s + n, 0) === parsed.files.reduce((s, f) => s + (f.fatal ? 0 : f.stats.parsed.total), 0);
const keyOf = (r, txn) => r.matched.items.find(it => it.src === 'row' && r.parsed.files[it.file].rows[it.row].no === txn.no).key;

(() => {
// ===== 1. 一批完整的账单：数字和三步的结果一致、差额差 0 分 =====
const bf = [1, 2, 3, 4, 5].map(d => wx({ time: T(3, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 }));
const grp = wx({ time: T(3, 6), cp: '某同学', kind: '群收款', io: 'income', fen: 3000, desc: '/' });
const wd = wx({ time: T(3, 7), cp: '零钱', kind: '零钱提现', io: 'neutral', fen: 20000, desc: '提现' });
const near = wx({ time: T(3, 8), cp: '某餐厅', fen: 2800 });
const odd = wx({ time: T(3, 9), cp: '某某', desc: '/', fen: 5000 });
const ref1 = wx({ time: T(3, 10), cp: '某超市', fen: 5000, status: '已退款¥10.00' }), ref2 = wx({ time: T(3, 11), cp: '某超市', kind: '某超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: '5030000000' + String(++seq).padStart(19, '0') });
const rail = [1, 2, 3, 4].map(i => ali({ time: T(3, 10 + i), cp: '某铁路' + i, kind: '交通出行', fen: 20000 + i }));
const closed = ali({ time: T(3, 20), status: '交易关闭', fen: 999 });
const manual = [man('m1', 3, 1, 1500), man('m2', 3, 2, 1500), man('m3', 3, 4, 1500), man('m4', 3, 5, 1500), man('m5', 3, 8, 3000), man('m6', 3, 7, 20000, { cat: '其他' })];
const r = run([{ app: 'wechat', txns: bf.concat([grp, wd, near, odd, ref1, ref2]) }, { app: 'alipay', txns: rail.concat([closed]) },
               { name: '坏的.csv', raw: B.ab(new Uint8Array(Buffer.from('交易时间,收/支,金额,说明\r\n2026-03-01 08:00:00,支出,1.00,虚构\r\n'))) }], manual);
const p = r.plan();
{
  const mc = r.matched.counts;
  ok(['add', 'merge', 'pending', 'refund', 'neutral', 'skip', 'error'].every(g => p.counts[g] === mc[g]) && p.counts.excluded === 0, '1 没改动时各组笔数和配对的结果一样：' + JSON.stringify(p.counts));
  ok(p.importN === mc.add + mc.neutral + mc.refund && p.mergeM === mc.merge, '1 按钮上的笔数：导入 ' + p.importN + '，合并 ' + p.mergeM);
  ok(diffOk(p), '1 每个文件 × 收支：各项加起来正好等于账单头部统计，合计差 0 分');
  ok(unitsOk(p, r.parsed), '1 各组笔数之和 = 文件笔数');
  const w = p.files[0].diff.expense;
  ok(w.parts.find(x => x.key === 'merge').fen === 6000 && w.parts.find(x => x.key === 'pending').fen === 2800, '1 微信支出里：和手记合并 60.00、待你确认 28.00');
  ok(p.files[0].diff.income.parts.find(x => x.key === 'refund').fen === 1000, '1 微信收入里：退款 10.00（部分退款，1016-C 起全额退款两条都跳过）');
  ok(p.files[2].fatal && p.files[2].fatal.header.join(',') === '交易时间,收/支,金额,说明', '1 认不出的文件：带上读到的表头');
  ok(p.canImport === true && p.blocking.length === 0, '1 有认不出的文件也能导入其它的（那一份不导入）');
  ok(p.sections.unknownTypes.length === 1 && p.sections.unknownTypes[0].type === '群收款', '1 没见过的交易类型：群收款');
  ok(p.sections.newCats.some(c => c.name === '交通出行' && c.count === 4 && c.on === false), '1 老用户：交通出行 4 笔，新建默认不勾');
  ok(p.sections.cpGroups.some(g => g.cp === '某某' && g.n === 1), '1 未分类按对方归组：某某');
  ok(p.sections.notes.neutralVsNormal.length === 1 && p.groups.neutral.some(d => d.tags.includes('neutralVsNormal')), '1 提现 200 和同一天 200 元的普通手记撞上了：提示一句，不合并');
  ok(p.groups.skip.some(d => d.why === 'status' && d.reason.includes('交易关闭')), '1 跳过的写明原因');
  const dev = PL.devText(p);
  ok(dev.includes('表头：交易时间 | 收/支 | 金额 | 说明') && dev.includes('群收款') && !/\d+\.\d\d|青禾|某超市|4200000|2026\d{10}|坏的/.test(dev), '1 复制给开发者：只有表头、类型、状态，没有金额、对方、单号、文件名');
}

// ===== 2. 改东西：汇总和差额跟着变，合计照样差 0 分 =====
{
  const kOdd = keyOf(r, odd), kNear = keyOf(r, near), kBf = keyOf(r, bf[0]), kWd = keyOf(r, wd);
  const p1 = r.plan({ rows: { [kOdd]: { exclude: true } } });
  ok(p1.counts.add === p.counts.add - 1 && p1.counts.excluded === 1 && p1.importN === p.importN - 1 && diffOk(p1), '2 勾掉一笔：新增 −1、你勾掉的 +1、按钮 −1，差额照样 0 分');
  ok(p1.files[0].diff.expense.parts.find(x => x.key === 'excluded').fen === 5000, '2 差额拆解里多出「你勾掉的 50.00」');
  const p2_ = r.plan({ rows: { [kNear]: { pick: { record: 'm5' } } } });
  ok(p2_.counts.pending === p.counts.pending - 1 && p2_.counts.merge === p.counts.merge + 1 && p2_.mergeM === p.mergeM + 1 && diffOk(p2_), '2 待确认里选了合并对象：待确认 −1、合并 +1');
  ok(p2_.files[0].diff.expense.mergeDelta === 200, '2 合并的手记比账单多记 2.00（手记 30、账单 28）');
  const p3 = r.plan({ rows: { [kBf]: { split: true } } });
  ok(p3.counts.merge === p.counts.merge - 1 && p3.counts.add === p.counts.add + 1 && p3.groups.add.some(d => d.key === kBf && d.cat === '吃饭'), '2 拆开合并：改为新增，分类沿用那条手记的');
  const p4 = r.plan({ rows: { [kOdd]: { cat: '购物' } } });
  ok(!p4.sections.cpGroups.some(g => g.cp === '某某') && p4.groups.add.find(d => d.key === kOdd).cat === '购物', '2 一行改了分类：不再出现在「按对方选分类」里');
  const p5 = r.plan({ cpCats: { '某某': '转账' } });
  ok(p5.groups.add.find(d => d.key === kOdd).cat === '转账' && p5.sections.cpGroups.find(g => g.cp === '某某').cat === '转账', '2 按对方一组选了分类：这组的行都跟着变');
  const p6 = r.plan({ rows: { [kWd]: { mode: 'normal' } } });
  const ne6 = p6.files[0].diff.neutral, ne0 = p.files[0].diff.neutral;
  ok(ne6.parts.find(x => x.key === 'newNormal').fen === 20000 && ne6.parts.find(x => x.key === 'neutral').fen === ne0.parts.find(x => x.key === 'neutral').fen - 20000 && diffOk(p6), '2 改口径（不计入 → 计入）：差额里从「不计入」挪到「新增（计入）」');
  const p7 = r.plan({ newCats: { '交通出行': { on: true } } });
  ok(p7.groups.add.filter(d => d.cat === '交通出行').length === 4, '2 勾上新建分类：那 4 笔分类变成交通出行');
  const p8 = r.plan({ newCats: { '交通出行': { on: false, into: '其他' } } });
  ok(p8.groups.add.filter(d => d.cat === '其他').length >= 4, '2 并到已有分类：那 4 笔分类变成其他');
  const p9 = r.plan({ rows: { [kNear]: { pick: 'new' } } }), p10 = r.plan({ rows: { [kNear]: { pick: 'drop' } } });
  ok(p9.counts.add === p.counts.add + 1 && p10.counts.excluded === 1 && p10.groups.excluded[0].canRestore && diffOk(p9) && diffOk(p10), '2 待确认里选「作为新增」「不要了」');
  // 原单勾掉：挂在它上面的退款也不导入
  const kRef1 = keyOf(r, ref1);
  const p11 = r.plan({ rows: { [kRef1]: { exclude: true } } });
  ok(p11.counts.excluded === 2 && p11.counts.refund === p.counts.refund - 1 && diffOk(p11), '2 原单勾掉了：挂在它上面的退款也不导入');
}

// ===== 3. 笔数对不上：不能导入 =====
{
  const r3 = run([{ app: 'alipay', txns: rail, opts: { statsOverride: { total: 9 } } }], []);
  const p3 = r3.plan();
  ok(p3.files[0].countOk === false && p3.canImport === false && p3.blocking.length === 1, '3 笔数和头部对不上：不能导入');
}

// ===== 4. 收款按天合并、零碎扣款、新建几条记录 =====
{
  const rc = []; for (let i = 0; i < 301; i++) rc.push(wx({ time: T(5, 1 + i % 28, 9 + i % 10, i % 60), kind: '二维码收款', cp: '某顾客', io: 'income', fen: 100 + i, status: '已存入零钱' }));
  const pk = []; for (let i = 0; i < 6; i++) pk.push(wx({ time: T(6, 1 + i), cp: '某停车场', fen: 50 }));
  const r4 = run([{ app: 'wechat', txns: rc.concat(pk) }], []);
  const p4 = r4.plan();
  ok(p4.sections.receipt && p4.sections.receipt.on && p4.sections.receipt.days === 28 && p4.records === 28 + 6, '4 收款按天合并：28 条，加上零碎扣款逐条 6 条，新建 34 条记录');
  const p5 = r4.plan({ receipt: false });
  ok(p5.records === 307 && p5.importN === p4.importN, '4 收款逐条导入：新建 307 条，按钮上的笔数不变');
  const pk2 = r4.plan({ petty: { [p4.sections.petty[0].key]: true } });
  ok(p4.sections.petty.length === 1 && !p4.sections.petty[0].on && pk2.records === 28 + 1, '4 疑似零碎扣款默认不合并；勾上以后合成一条');
}

// ===== 5. 标记：拼回的断行、单号带附加信息、时间重叠、不计入撞上普通手记 =====
{
  const a = [ali({ time: T(7, 1), desc: '早餐', fen: 650 }), ali({ time: T(7, 2), fen: 700, no: ano() + ' USD 1.00' }), ali({ time: T(7, 3), fen: 800 })];
  const wdx = wx({ time: T(7, 5), cp: '零钱', kind: '零钱提现', io: 'neutral', fen: 30000, desc: '提现' });
  const r5 = run([{ app: 'alipay', txns: a, opts: { edit: s => s.replace('早餐 ,', '早\r\n餐 ,') } }, { app: 'wechat', txns: [wdx] }],
    [man('z1', 7, 6, 30000, { cat: '其他' })], { overlaps: [{ apps: ['alipay'], from: '2026-07-03', to: '2026-07-10' }] });
  const p5 = r5.plan();
  ok(p5.sections.notes.joined.length === 1 && p5.sections.notes.noNote.length === 1 && p5.sections.notes.overlap.length === 1, '5 拼回的断行、单号带附加信息、时间重叠各 1 笔');
  ok(p5.sections.notes.neutralVsNormal.length === 1, '5 「不计入」的提现和同金额的普通手记撞上了：提示一句（没合并）');
  ok(p5.groups.neutral.length === 1 && p5.counts.merge === 0, '5 撞上了也不合并');
}

// ===== 6. 性质测试：随机改动若干次，守恒和差额 0 分始终成立 =====
{
  let s = 99;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const keys = r.matched.items.filter(it => it.src === 'row').map(it => it.key);
  let bad = 0, note = '';
  for (let k = 0; k < 300; k++) {
    const rows = {};
    keys.forEach(key => {
      const x = rnd();
      if (x < 0.1) rows[key] = { exclude: true };
      else if (x < 0.2) rows[key] = { cat: CATS[Math.floor(rnd() * CATS.length)] };
      else if (x < 0.3) rows[key] = { mode: ['normal', 'flow', 'skip'][Math.floor(rnd() * 3)] };
      else if (x < 0.35) rows[key] = { split: true };
      else if (x < 0.45) rows[key] = { pick: ['new', 'drop', { record: 'm5' }, { record: 'm1' }][Math.floor(rnd() * 4)] };
    });
    const q = r.plan({ rows, cpCats: rnd() < 0.5 ? { '某某': '购物' } : {}, receipt: rnd() < 0.5 });
    const into = q.rows.filter(d => d.group === 'merge').map(d => d.into);
    const good = diffOk(q) && unitsOk(q, r.parsed) && new Set(into).size === into.length
      && q.files.every((f, i) => f.fatal || ['expense', 'income', 'neutral'].every(io => f.diff[io].unreadable === p.files[i].diff[io].unreadable));
    if (!good) { bad++; note = JSON.stringify(rows).slice(0, 200); }
  }
  ok(bad === 0, '6 300 次随机改动：差额合计 0 分、各组笔数之和 = 文件笔数、一条手记不会被两笔合并、读不出来的不变 ' + note);
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})();
