// 1016-K 撤销方案（import/undo.js，纯计算）。node z3-import-undo-calc.test.js [index.html]
// 手搭的存档样子：依赖五种（同一条记录、退款、名单、分类、退款记号）和传递；名单截断 / 留在原位记到后一次；
// 一个字段一个字段还原（你改过的不动）；新增里你改过的照删并列出；你挂的退款；已删的跳过；规则从后往前删；分类删还是留；
// 旧批次（没有指纹）按没改过还原并写明；摘要文字。数据全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const U = require(path.join(IMP, 'undo.js'));
const W = require(path.join(IMP, 'write.js'));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const H = r => W.recHash(r);

// ---- 一个基本的存档：两条手记，导入 A 新增两条、合并一条手记 ----
function base() {
  const m1 = { id: 'm1', time: '2026-09-30T08:30', money: 15, type: 'expense', cat: '吃饭', remark: '手记早饭' };
  const m2 = { id: 'm2', time: '2026-09-10T12:00', money: 30, type: 'expense', cat: '吃饭', remark: '手记' };
  const a1 = { id: 'a1', time: '2026-10-02T09:00', money: 20, type: 'expense', cat: '杂项', remark: '', src: { app: 'wechat' }, oc: '商户消费', batch: 'bA', cp: 0, pm: 0 };
  const a2 = { id: 'a2', time: '2026-10-03T09:00', money: 0.15, type: 'expense', cat: '其他', remark: '', src: { app: 'wechat', sum: 'petty' }, batch: 'bA', cp: 1 };
  const m1x = Object.assign({}, m1, { time: '2026-10-01T07:40', src: { app: 'wechat', merged: true }, cp: 2, batch: 'bA' });
  const logA = { b: 'bA', at: '2026-10-05T10:00', apps: ['wechat'], from: '2026-10-01', to: '2026-10-15', add: ['a1', 'a2'], h: [H(a1), H(a2)],
    chg: [{ id: 'm1', was: { time: '2026-09-30T08:30', src: null, cp: null, batch: null }, now: { time: '2026-10-01T07:40', src: '{"app":"wechat","merged":true}', cp: 2, batch: 'bA' }, nos: [['wechat', 'W1']] }],
    cpLen: 0, pmLen: 0, cpEnd: 3, pmEnd: 1, catsAdded: ['杂项'], rulesAdded: { cat: [{ kw: '某虚构店', cat: '杂项' }], type: [], map: [{ from: '交通出行', cat: '杂项' }] } };
  return {
    records: [m1x, m2, a1, a2], cats: ['未分类', '吃饭', '其他', '杂项'], budgets: {}, tpls: [],
    importRules: { cat: [{ kw: '某虚构店', cat: '杂项' }], type: [], map: [{ from: '交通出行', cat: '杂项' }] },
    cps: ['某虚构店', '某虚构公益', '某虚构早点'], pms: ['零钱'],
    orders: { 'imp_u_a_o_wechat_2026-10': { app: 'wechat', list: [{ no: 'W1', id: 'm1', batch: 'bA', st: 0 }, { no: 'W2', id: 'a1', batch: 'bA', st: 0 }, { no: 'W3', id: 'a2', batch: 'bA', st: 0 }, { no: 'W4', id: '', batch: 'bA', st: 1 }] } },
    pending: [{ app: 'wechat', no: 'W9', b: 'bA' }], logs: [logA]
  };
}
const BEFORE = { records: [{ id: 'm1', time: '2026-09-30T08:30', money: 15, type: 'expense', cat: '吃饭', remark: '手记早饭' }, { id: 'm2', time: '2026-09-10T12:00', money: 30, type: 'expense', cat: '吃饭', remark: '手记' }],
  cats: ['未分类', '吃饭', '其他'], importRules: undefined, cps: undefined, pms: undefined, orders: {}, pending: [], logs: [] };
const pick = S => ({ records: S.records, cats: S.cats, importRules: S.importRules, cps: S.cps, pms: S.pms, orders: S.orders, pending: S.pending, logs: S.logs });

// ===== 1. 撤最近一次：回到导入前 =====
{
  const S = base(), p = U.plan(S, 'bA');
  ok(p.ok && same(p.chain, ['bA']), '1 只有一次：不用连着撤');
  ok(same(pick(p.after), BEFORE), '1 撤完：记录、分类、规则、名单、单号表、待处理、导入记录都回到导入前');
  const s = p.steps[0];
  ok(s.deleted === 2 && s.restored === 1 && s.changed.length === 0 && s.orders === 4 && s.pending === 1 && same(s.catsDropped, ['杂项']) && s.rulesRemoved === 1 && s.mapsRemoved === 1 && same(s.names, { cut: { cps: 3, pms: 1 } }),
    '1 摘要：删 2、还原 1、单号 4（含忽略）、待处理 1、分类 1、规则 1、对照 1、名单截掉 3 + 1 ' + JSON.stringify(s.names));
  ok(S.records.length === 4 && S.records[0].batch === 'bA' && S.logs.length === 1, '1 不改传进来的样子（纯计算）');
  ok(!s.legacy && !p.totals.legacy && U.describe(p).indexOf('旧版本') < 0, '1 新批次：不写「旧版本」那句');
}

// ===== 2. 导入后你改过 =====
{
  const S = base();
  S.records[2] = Object.assign({}, S.records[2], { cat: '购物' });                        // 改了新增的分类
  S.records[0] = Object.assign({}, S.records[0], { remark: '后来改的备注' });              // 改了合并手记的备注
  let p = U.plan(S, 'bA'), s = p.steps[0];
  ok(s.changed.length === 1 && s.changed[0].id === 'a1' && !p.after.records.some(r => r.id === 'a1'), '2 改了新增记录的分类：照删，列进「你改过」');
  const m1 = p.after.records.find(r => r.id === 'm1');
  ok(m1.remark === '后来改的备注' && m1.time === '2026-09-30T08:30' && !('src' in m1) && !('cp' in m1) && !('batch' in m1) && s.kept.length === 0, '2 改了合并手记的备注：备注保留，时间、来源、对方、批次还原');
  const S2 = base(); S2.records[0] = Object.assign({}, S2.records[0], { time: '2026-10-01T19:00' });
  p = U.plan(S2, 'bA'); s = p.steps[0];
  const m1b = p.after.records.find(r => r.id === 'm1');
  ok(m1b.time === '2026-10-01T19:00' && !('src' in m1b) && s.kept.length === 1 && s.kept[0].field === 'time', '2 改了合并手记的时间：时间不还原、列出来，其余字段照样还原');
  ok(/1 处你导入后改过/.test(U.describe(p)), '2 摘要写明改过几处');
  // 字段顺序变了不算改过
  const S3 = base(); const a = S3.records[2]; S3.records[2] = { cat: a.cat, id: a.id, money: a.money, type: a.type, time: a.time, remark: a.remark, src: { app: 'wechat' }, oc: a.oc, batch: a.batch, cp: a.cp, pm: a.pm };
  ok(U.plan(S3, 'bA').steps[0].changed.length === 0, '2 只是字段顺序变了：不算改过');
}

// ===== 3. 你挂的退款、你删掉的 =====
{
  const S = base();
  S.records.push({ id: 'u1', time: '2026-10-04T10:00', money: 5, type: 'income', cat: '杂项', remark: '退了一部分', refundOf: 'a1' });
  S.records = S.records.filter(r => r.id !== 'a2');                                       // 删了一条新增
  const p = U.plan(S, 'bA'), s = p.steps[0];
  ok(s.userRefunds.length === 1 && s.userRefunds[0].id === 'u1' && !p.after.records.some(r => r.id === 'u1'), '3 你挂在导入记录上的退款：一起删，单独列出');
  ok(s.gone === 1 && s.deleted === 1, '3 导入后你删掉的：跳过不报错');
  const S2 = base(); S2.records = S2.records.filter(r => r.id !== 'm1');
  ok(U.plan(S2, 'bA').steps[0].mergeGone === 1, '3 合并过的手记被你删了：跳过');
}

// ===== 4. 新建的分类：有人用就留下 =====
{
  const S = base(); S.budgets = { '杂项': 300 };
  let s = U.plan(S, 'bA').steps[0];
  ok(s.catsDropped.length === 0 && s.catsKept[0].cat === '杂项' && s.catsKept[0].budget, '4 预算里用了：留下并说明');
  const S2 = base(); S2.tpls = [{ name: '模板', cat: '杂项', money: 1 }];
  ok(U.plan(S2, 'bA').steps[0].catsKept[0].tpl, '4 模板里用了：留下');
  const S3 = base(); S3.records.push({ id: 'u2', time: '2026-10-09T10:00', money: 8, type: 'expense', cat: '杂项', remark: '手记' });
  s = U.plan(S3, 'bA').steps[0];
  ok(s.catsKept[0].records === 1 && U.plan(S3, 'bA').after.cats.indexOf('杂项') >= 0, '4 有手记用了：留下');
}

// ===== 5. 旧批次（1016-K 以前）：没有指纹和 now =====
{
  const S = base();
  delete S.logs[0].h; delete S.logs[0].chg[0].now; delete S.logs[0].cpEnd; delete S.logs[0].pmEnd;
  S.records[2] = Object.assign({}, S.records[2], { cat: '购物' });
  S.records[0] = Object.assign({}, S.records[0], { time: '2026-10-01T19:00' });
  const p = U.plan(S, 'bA');
  ok(p.steps[0].legacy && p.steps[0].changed.length === 0 && p.after.records.find(r => r.id === 'm1').time === '2026-09-30T08:30', '5 旧批次：看不出改没改，一律按导入前还原');
  ok(/这批是旧版本导入的，看不出你导入后改没改过，撤销会按导入前的样子还原/.test(U.describe(p)), '5 摘要写明是旧版本导入的');
  ok(same(p.after.cps, undefined), '5 旧批次没记导完的名单长度：最后一次照样截断');
}

// ---- 两次导入：A 之后 B ----
function two(bOpts) {
  const S = base();
  const b1 = Object.assign({ id: 'b1', time: '2026-11-02T09:00', money: 9, type: 'expense', cat: '吃饭', remark: '', src: { app: 'alipay' }, batch: 'bB', cp: 3, pm: 1 }, bOpts && bOpts.rec);
  S.records.push(b1);
  S.cps = S.cps.concat(['某虚构书店']); S.pms = S.pms.concat(['余额']);
  S.orders['imp_u_a_o_alipay_2026-11'] = { app: 'alipay', list: [{ no: 'A1', id: 'b1', batch: 'bB', st: 0 }] };
  const logB = Object.assign({ b: 'bB', at: '2026-11-05T10:00', apps: ['alipay'], from: '2026-11-01', to: '2026-11-15', add: ['b1'], h: [H(b1)], chg: [],
    cpLen: 3, pmLen: 1, cpEnd: 4, pmEnd: 2, catsAdded: [], rulesAdded: { cat: [], type: [] } }, bOpts && bOpts.log);
  S.logs.push(logB);
  return S;
}

// ===== 6. 依赖：五种，各自要先撤 B =====
{
  ok(same(U.plan(two(), 'bA').chain, ['bA']), '6 B 和 A 没关系：直接撤 A');
  const cases = [
    ['same', two({ log: { chg: [{ id: 'a2', was: { money: 0.15 }, now: { money: 0.31 }, nos: [] }] } })],
    ['refund', two({ rec: { type: 'income', refundOf: 'a1' } })],
    ['names', two({ rec: { cp: 1 } })],
    ['cat', two({ rec: { cat: '杂项' } })],
    ['cat', two({ log: { rulesAdded: { cat: [{ kw: '某虚构书店', cat: '杂项' }], type: [] } } })]
  ];
  cases.forEach(([why, S]) => {
    const p = U.plan(S, 'bA');
    ok(same(p.chain, ['bB', 'bA']) && p.why.bB.some(x => x.why === why && x.dep === 'bA'), '6 依赖（' + why + '）：要先撤 B ' + JSON.stringify(p.why));
  });
  // 退款记号：A 登记 RW，B 用了（RU）
  const S = two();
  S.orders['imp_u_a_o_wechat_2026-10'].list.push({ no: 'RW1000-某店-20261002', id: '', batch: 'bA', st: 1 });
  S.orders['imp_u_a_o_wechat_none'] = { app: 'wechat', list: [{ no: 'RU1000-某店-20261002', id: '', batch: 'bB', st: 1 }] };
  ok(same(U.plan(S, 'bA').chain, ['bB', 'bA']), '6 依赖（退款记号）：要先撤 B');
  // 合并了同一条手记：B 的 chg 改了 A 合并过的 m1
  ok(same(U.plan(two({ log: { chg: [{ id: 'm1', was: { remark: 'x' }, now: { remark: 'y' }, nos: [] }] } }), 'bA').chain, ['bB', 'bA']), '6 依赖（同一条手记）：要先撤 B');
  // 规则不算依赖：B 的记录正好命中 A 的规则
  ok(same(U.plan(two({ rec: { cat: '吃饭' } }), 'bA').chain, ['bA']), '6 规则不算依赖');
}

// ===== 7. 依赖传递：C 依赖 B、B 依赖 A，C 和 A 没直接关系 =====
{
  const S = two({ rec: { cp: 1 } });
  const c1 = { id: 'c1', time: '2026-12-02T09:00', money: 3, type: 'income', cat: '吃饭', remark: '', src: { app: 'alipay' }, batch: 'bC', refundOf: 'b1' };
  S.records.push(c1);
  S.logs.push({ b: 'bC', at: '2026-12-05T10:00', apps: ['alipay'], from: '2026-12-01', to: '2026-12-15', add: ['c1'], h: [H(c1)], chg: [], cpLen: 4, pmLen: 2, cpEnd: 4, pmEnd: 2, catsAdded: [], rulesAdded: { cat: [], type: [] } });
  const p = U.plan(S, 'bA');
  ok(same(p.chain, ['bC', 'bB', 'bA']) && p.why.bC[0].dep === 'bB', '7 传递：先撤 C、再撤 B、最后撤 A');
  ok(same(pick(p.after), BEFORE), '7 连着撤完：回到 A 之前');
  ok(/要先撤销之后的 2 次导入/.test(U.describe(p)), '7 摘要写明要先撤之后的 2 次');
}

// ===== 8. 名单：中间撤一次留在原位，长度记到后一次上 =====
{
  const S = two();
  const p = U.plan(S, 'bA'), A = p.after;
  ok(same(p.chain, ['bA']) && same(A.cps, ['某虚构店', '某虚构公益', '某虚构早点', '某虚构书店']) && same(A.pms, ['零钱', '余额']), '8 中间撤 A：名单不动（A 的名字留在原位）');
  ok(same(p.steps[0].names, { left: { cps: 3, pms: 1 } }), '8 摘要：留下 3 个对方名、1 个支付方式');
  ok(A.logs.length === 1 && A.logs[0].b === 'bB' && A.logs[0].cpLen === 0 && A.logs[0].pmLen === 0 && A.logs[0].cpEnd === 4, '8 B 的导入前长度改成 A 的');
  const p2 = U.plan(A, 'bB');
  ok(same(p2.after.cps, undefined) && same(p2.after.pms, undefined) && same(p2.steps[0].names, { cut: { cps: 4, pms: 2 } }), '8 再撤 B：连 A 留下的名字一起截掉');
  ok(same(pick(p2.after), BEFORE), '8 全部撤完：回到导入前');
  // 留下的名字后来被新的导入 C 用上：撤 B 要先撤 C
  const C = JSON.parse(JSON.stringify(A));
  const c1 = { id: 'c1', time: '2026-12-02T09:00', money: 3, type: 'expense', cat: '吃饭', remark: '', src: { app: 'wechat' }, batch: 'bC', cp: 1 };
  C.records.push(c1);
  C.logs.push({ b: 'bC', at: '2026-12-05T10:00', apps: ['wechat'], from: '2026-12-01', to: '2026-12-15', add: ['c1'], h: [H(c1)], chg: [], cpLen: 4, pmLen: 2, cpEnd: 4, pmEnd: 2, catsAdded: [], rulesAdded: { cat: [], type: [] } });
  const p3 = U.plan(C, 'bB');
  ok(same(p3.chain, ['bC', 'bB']) && p3.why.bC.some(x => x.why === 'names'), '8 A 留下的名字被后来的导入用上：撤 B 要先撤它');
  ok(same(pick(p3.after), BEFORE), '8 连着撤完：回到导入前');
}

// ===== 9. 规则：从后往前删一条；还有别的规则时留着 =====
{
  const S = base();
  S.importRules = { cat: [{ kw: '更早的', cat: '吃饭' }, { kw: '某虚构店', cat: '杂项' }], type: [{ app: 'wechat', type: '某类型', as: 'skip' }], map: [{ from: '交通出行', cat: '杂项' }] };
  const p = U.plan(S, 'bA');
  ok(same(p.after.importRules, { cat: [{ kw: '更早的', cat: '吃饭' }], type: [{ app: 'wechat', type: '某类型', as: 'skip' }] }), '9 只删这批加的，对照删光了不留空的 map：' + JSON.stringify(p.after.importRules));
  ok(p.after.cats.indexOf('杂项') < 0, '9 规则删了以后分类没人用，照删');
  const S2 = base(); S2.logs[0].rulesAdded.type = [{ app: 'wechat', type: '某类型', as: 'skip' }]; S2.importRules.type = [{ app: 'wechat', type: '某类型', as: 'skip' }];
  ok(U.plan(S2, 'bA').steps[0].typesRemoved === 1 && U.plan(S2, 'bA').after.importRules === undefined, '9 类型规则也按 rulesAdded 删');
}

// ===== 10. 合并记录追加：撤追加的那次回到追加前 =====
{
  const S = two({ log: { chg: [{ id: 'a2', was: { money: 0.15 }, now: { money: 0.31 }, nos: [['wechat', 'W5']] }] } });
  S.records = S.records.map(r => r.id === 'a2' ? Object.assign({}, r, { money: 0.31 }) : r);
  S.orders['imp_u_a_o_wechat_2026-10'].list.push({ no: 'W5', id: 'a2', batch: 'bB', st: 0 });
  const p = U.plan(S, 'bB'), a2 = p.after.records.find(r => r.id === 'a2');
  ok(a2.money === 0.15 && p.steps[0].sums === 1, '10 撤追加的那次：汇总回到 0.15');
  ok(same(p.after.orders['imp_u_a_o_wechat_2026-10'].list.map(x => x.batch), ['bA', 'bA', 'bA', 'bA']) && !p.after.orders['imp_u_a_o_alipay_2026-11'], '10 单号表只剩第 1 次的，空的块去掉');
  S.records = S.records.map(r => r.id === 'a2' ? Object.assign({}, r, { money: 1 }) : r);
  const p2 = U.plan(S, 'bB');
  ok(p2.after.records.find(r => r.id === 'a2').money === 1 && p2.steps[0].kept[0].field === 'money', '10 汇总金额你后来改过：不还原、列出来');
}

ok(!U.plan(base(), 'bX').ok, '找不到批次：ok=false');
console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
