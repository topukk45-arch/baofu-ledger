// 1016-A 账单导入第一期 ⑤ 配对与分类。node v-import-match.test.js [index.html]
// 纯计算：解析 → 定去向 → 配对与分类，不用 jsdom。账单、手记全是虚构的。
// 手记用一个假的「主页面」给：按 ledgerQuery 的日期范围筛好、挑出 { id, time, type, fen, cat, mode }。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js'));
const R = require(path.join(IMP, 'route.js'));
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'match.js'));
const W = require(path.join(IMP, 'merchants.js'));
const B = require('./helpers/bills');
const { makeFakeWorker } = require('./helpers/import-files');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h, mi, s) => ({ y: 2026, mo, d, h: h || 12, mi: mi || 0, s: s || 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const DEF = ['未分类', '餐饮', '购物', '转账', '工资', '红包', '其他'];      // App 的默认分类
let seq = 0;
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const p2 = n => String(n).padStart(2, '0');
// 手记（金额按分）
const man = (id, mo, d, fen, o) => Object.assign({ id, time: `2026-${p2(mo)}-${p2(d)}T${(o && o.hm) || '08:30'}`, type: 'expense', fen, cat: '餐饮', mode: 'normal' }, o || {});

function pipeline(bills, manual, opts) {
  opts = opts || {};
  const parsed = P.parseFiles(bills.map((b, i) => ({ name: '账单' + (i + 1), data: B.ab(B.bill(b.app, b.txns, Object.assign({ range: RANGE }, b.opts || {})).bytes) })));
  const routed = R.route(parsed, { known: opts.known || {}, rules: opts.typeRules || [] });
  const q = M.ledgerQuery(routed, parsed);
  // 假主页面：按日期范围筛手记
  const inRange = (manual || []).filter(m => q.manual && m.time.slice(0, 10) >= q.manual.from && m.time.slice(0, 10) <= q.manual.to);
  const res = M.match(routed, parsed, { manual: inRange, refundCands: opts.refundCands || [], cats: opts.cats || DEF, rules: opts.rules || [], isNewUser: !!opts.isNewUser, merchants: W });
  const by = {};
  res.items.forEach(it => { if (it.src === 'row') { const r = parsed.files[it.file].rows[it.row]; by[r.no + r.noRest] = Object.assign({ r }, it); } });
  return { parsed, routed, res, by, q };
}
const conserved = res => res.perFile.every(p => p.ok) && res.items.every(it => ['add', 'merge', 'skip', 'neutral', 'refund', 'pending', 'error'].includes(it.bucket));
const intoUnique = res => { const s = new Set(); return res.items.every(it => it.bucket !== 'merge' || (!s.has(it.into) && s.add(it.into))); };

(async () => {

// ===== 1. 交易对方清洗 =====
{
  const c = C.cleanCp;
  ok(c('某某自助烤肉（示例万象天地店）') === '某某自助烤肉' && c('某某自助烤肉(示例新街口店)') === '某某自助烤肉', '1 去掉括号里的分店名（全角、半角）');
  ok(c('美团平台商户-青禾便利') === '青禾便利' && c('平台商户-云杉咖啡') === '云杉咖啡', '1 去掉平台前缀');
  ok(c('青禾便利0231') === '青禾便利' && c('青禾便利 No.12') === '青禾便利' && c('青禾便利12号店') === '青禾便利', '1 去掉末尾编号');
  ok(c('张**') === '张**' && c('*三') === '*三' && c('A(1)') === 'A(1)' && c('12306') === '12306', '1 打码人名、清洗后不到两个字的保留原文');
  ok(c('某某【旗舰店】(二楼)') === '某某', '1 几层括号都去掉');
}

// ===== 2. 早饭天天 15 元，漏记一天 =====
{
  const bills = [1, 2, 3, 4, 5].map(d => wx({ time: T(3, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 }));
  const manual = [man('m1', 3, 1, 1500), man('m2', 3, 2, 1500), man('m4', 3, 4, 1500), man('m5', 3, 5, 1500)];
  const { res, by } = pipeline([{ app: 'wechat', txns: bills }], manual);
  ok([1, 2, 4, 5].every(d => { const it = by[bills[d - 1].no]; return it.bucket === 'merge' && it.into === 'm' + d && it.days === 0; }), '2 周一配周一、周二配周二、周四配周四、周五配周五');
  const wed = by[bills[2].no];
  ok(wed.bucket === 'add' && wed.flags.includes('missing'), '2 周三那笔作为漏记新增（不会去抢周二、周四的手记）');
  ok(by[bills[0].no].was.time === '2026-03-01T08:30' && by[bills[0].no].via === 'amount', '2 合并时记下手记原来的时间（给撤销用），按金额配上');
  ok(res.counts.merge === 4 && res.counts.add === 1 && conserved(res) && intoUnique(res), '2 守恒，手记不重复用');
}

// ===== 3. 同一天同金额：按组配 =====
{
  const a = [wx({ time: T(4, 1, 7, 10), fen: 1500 }), wx({ time: T(4, 1, 12, 5), fen: 1500 })];
  const r1 = pipeline([{ app: 'wechat', txns: a }], [man('x2', 4, 1, 1500, { hm: '13:00' }), man('x1', 4, 1, 1500, { hm: '07:00' })]);
  ok(r1.by[a[0].no].bucket === 'merge' && r1.by[a[1].no].bucket === 'merge' && r1.by[a[0].no].into === 'x1' && r1.by[a[1].no].into === 'x2', '3 同一天两笔 15 元 + 两条 15 元手记：全部合并，按时间先后一一对上');
  const r2 = pipeline([{ app: 'wechat', txns: a }], [man('y1', 4, 1, 1500)]);
  ok(r2.by[a[0].no].bucket === 'pending' && r2.by[a[1].no].bucket === 'pending' && r2.by[a[0].no].why === 'ambiguous' && r2.by[a[0].no].cands[0].record === 'y1', '3 两笔 15 元 + 一条手记：整组进待处理，候选是那条手记');
  // 留住：后面的层不再拿它去自动合并（第二天还有一笔 15 元，差 1 天本来能配上）
  const b = a.concat([wx({ time: T(4, 2, 9, 0), fen: 1500 })]);
  const r3 = pipeline([{ app: 'wechat', txns: b }], [man('y1', 4, 1, 1500)]);
  ok(r3.by[b[2].no].bucket === 'add' && r3.res.counts.merge === 0, '3 拿不准那组的手记留住：第二天那笔不会再拿它去合并');
  // 隔天：两笔在 1 号、3 号，手记在 2 号、4 号 → 差 1 天那层连成一组，2 对 2，按时间对上
  const c = [wx({ time: T(5, 1), fen: 800 }), wx({ time: T(5, 3), fen: 800 })];
  const r4 = pipeline([{ app: 'wechat', txns: c }], [man('z2', 5, 2, 800), man('z4', 5, 4, 800)]);
  ok(r4.by[c[0].no].into === 'z2' && r4.by[c[1].no].into === 'z4' && r4.by[c[0].no].days === 1, '3 差 1 天的一组：1 号配 2 号、3 号配 4 号');
  ok(conserved(r1.res) && conserved(r2.res) && conserved(r3.res), '3 守恒');
}

// ===== 4. 先乘后付差 4 天、差 8 天 =====
{
  const a = wx({ time: T(6, 10, 9, 0), cp: '某公交', fen: 300 }), b = wx({ time: T(6, 20, 9, 0), cp: '某公交', fen: 450 });
  const { res, by } = pipeline([{ app: 'wechat', txns: [a, b] }], [man('t1', 6, 6, 300, { cat: '其他' }), man('t2', 6, 12, 450, { cat: '其他' })]);
  ok(by[a.no].bucket === 'pending' && by[a.no].why === 'early' && by[a.no].cands[0].record === 't1' && by[a.no].cands[0].early === 4 && /你记的比账单早 4 天，可能是延后扣款/.test(by[a.no].msg), '4 先乘后付差 4 天（手记比账单早）：进待处理，不新增；写「你记的比账单早 4 天，可能是延后扣款」（1017-UI6 有意改：以前 why 是 days）');
  ok(by[b.no].bucket === 'add' && by[b.no].flags.includes('missing'), '4 差 8 天：算漏记新增');
  ok(conserved(res), '4 守恒');
}

// ===== 5. 金额相近：立减（账单低）、红包（账单高）=====
{
  const lo = wx({ time: T(7, 1), cp: '某餐厅', fen: 2800 }), hi = wx({ time: T(7, 2), cp: '某餐厅', fen: 3200 }), far = wx({ time: T(7, 3), cp: '某餐厅', fen: 2400 });
  const { res, by } = pipeline([{ app: 'wechat', txns: [lo, hi, far] }], [man('n1', 7, 1, 3000), man('n2', 7, 2, 3000), man('n3', 7, 3, 3000, { cat: '购物' })]);
  ok(by[lo.no].bucket === 'pending' && by[lo.no].why === 'near' && by[lo.no].cands.some(c => c.record === 'n1'), '5 立减：账单 28 元、手记 30 元，进待处理');
  ok(by[hi.no].bucket === 'pending' && by[hi.no].why === 'near' && by[hi.no].cands.some(c => c.record === 'n2'), '5 组合支付带红包：账单 32 元、手记 30 元（账单高），也进待处理');
  ok(by[far.no].bucket === 'add', '5 差 6 元（超过 5 元）、分类也对不上：不算相近也不算部分付款，作为新增');
  ok(res.counts.merge === 0 && conserved(res), '5 相近的一律不自动合并');
}

// ===== 6. 净额配对 =====
{
  const o1 = ano(), o2 = ano();
  const bills = [ali({ time: T(8, 1), no: o1, cp: '某商城', fen: 5000 }), ali({ time: T(8, 2), no: o1 + '_R', status: '退款成功', io: 'neutral', fen: 1000, cp: '某商城' }),
                 ali({ time: T(8, 5), no: o2, cp: '某书店', fen: 5000 }), ali({ time: T(8, 6), no: o2 + '_R', status: '退款成功', io: 'neutral', fen: 1000, cp: '某书店' })];
  const { res, by } = pipeline([{ app: 'alipay', txns: bills }], [man('q1', 8, 1, 4000, { cat: '购物' }), man('q2', 8, 5, 5000, { cat: '购物' })]);
  ok(by[o1].bucket === 'merge' && by[o1].into === 'q1' && by[o1].via === 'net', '6 手记 40 元，账单原单 50 + 退款 10：按净额合并');
  ok(by[o1 + '_R'].bucket === 'skip' && by[o1 + '_R'].why === 'netted' && by[o1 + '_R'].msg === '已按净额并进手记' && by[o1 + '_R'].register === true && !by[o1 + '_R'].refundTo,
    '6 那条退款行进「跳过」，原因「已按净额并进手记」，要登记单号，不再生成退款记录');
  ok(by[o2].bucket === 'merge' && by[o2].via === 'amount' && by[o2].refundsStay === true && by[o2 + '_R'].bucket === 'refund', '6 手记记的是原价 50：按原单金额合并，退款照常生成');
  ok(conserved(res), '6 守恒');
}

// ===== 7. 部分付款 =====
{
  const a = wx({ time: T(9, 1), cp: '某某餐厅', fen: 3000 }), b = wx({ time: T(9, 2), cp: '某某餐厅', fen: 3000 });
  const { res, by } = pipeline([{ app: 'wechat', txns: [a, b] }], [man('p1', 9, 1, 8000, { cat: '餐饮' }), man('p2', 9, 2, 8000, { cat: '购物' })]);
  ok(by[a.no].rec.cat === '餐饮' && by[a.no].bucket === 'pending' && by[a.no].why === 'partial' && by[a.no].cands[0].record === 'p1', '7 同一天、账单只有手记一部分、推荐的分类（餐饮）和手记一样：进待处理');
  ok(by[b.no].bucket === 'add', '7 分类对不上（手记是购物）：作为新增');
  ok(conserved(res), '7 守恒');
}

// ===== 8. 跨来源 =====
{
  const w = wx({ time: T(10, 1), fen: 2000 }), a = ali({ time: T(10, 1), fen: 2000 });
  const { res, by } = pipeline([{ app: 'wechat', txns: [w] }, { app: 'alipay', txns: [a] }], [man('c1', 10, 1, 2000)]);
  ok(by[w.no].bucket === 'pending' && by[a.no].bucket === 'pending' && res.counts.merge === 0, '8 微信、支付宝同金额同一天抢一条手记：都进待处理，不自动合并');
  // 以前导入过的支付宝记录（带来源）主页面不会当手记交进来：微信这笔照常新增
  const r2 = pipeline([{ app: 'wechat', txns: [w] }], []);
  ok(r2.by[w.no].bucket === 'add', '8 带来源的记录不参与配对：同金额也照常新增');
}

// ===== 9. 「不计入」的行只做精确配对 =====
{
  const a = ali({ time: T(11, 5), kind: '信用借还', desc: '信用卡还款', io: 'neutral', fen: 50000, cp: '某银行' });
  const b = ali({ time: T(11, 6), kind: '信用借还', desc: '信用卡还款', io: 'neutral', fen: 30000, cp: '某银行' });
  const c = ali({ time: T(11, 7), kind: '账户存取', desc: '余额宝-转入', io: 'neutral', fen: 20000, cp: '余额宝' });
  const d = ali({ time: T(11, 8), kind: '其他', desc: '某某', io: 'neutral', fen: 7000, cp: '某某' });
  const manual = [man('k1', 11, 7, 50000, { mode: 'skip', cat: '其他' }), man('k2', 11, 6, 30000, { cat: '购物' }), man('k3', 11, 7, 19900, { mode: 'skip' }), man('k4', 11, 8, 7000, { mode: 'skip' })];
  const { res, by } = pipeline([{ app: 'alipay', txns: [a, b, c, d] }], manual);
  ok(by[a.no].bucket === 'merge' && by[a.no].into === 'k1' && by[a.no].dir === 'expense', '9 信用卡还款 500 元、差 2 天有一条「不计入」的 500 元手记：合并（方向按「还款」认作支出）');
  ok(by[b.no].bucket === 'neutral', '9 同金额的手记是普通支出（不是不计入）：不合并，照常导入');
  ok(by[c.no].bucket === 'neutral' && !by[c.no].cands, '9 金额差一点（199 元）：不做近似、不进待处理，照常导入');
  ok(by[d.no].bucket === 'neutral' && by[d.no].dir === null, '9 看不出方向的不配（照常导入）');
  ok(conserved(res), '9 守恒');
}

// ===== 10. 分类：五层 =====
{
  const cats = DEF.concat(['吃饭', '午饭']).filter(c => c !== '餐饮');
  const rows = [
    wx({ time: T(12, 1), cp: '某某自助烤肉（示例万象天地店）', fen: 8800 }), wx({ time: T(12, 2), cp: '某某自助烤肉(示例新街口店)', fen: 9900 }),
    wx({ time: T(12, 3), cp: '某某自助烤肉（示例江宁店）', fen: 12000 }),
    wx({ time: T(12, 4), cp: '张记麻辣烫', fen: 2000 }), wx({ time: T(12, 5), cp: '路边小摊', desc: '奶茶', fen: 1500 }),
    wx({ time: T(12, 6), cp: '某咖啡馆', fen: 3500 }), wx({ time: T(12, 7), cp: '个人', desc: '/', fen: 5000 }),
  ];
  const alis = [ali({ time: T(12, 8), cp: '某咖啡馆', kind: '餐饮美食', fen: 3000 }), ali({ time: T(12, 9), cp: '某景点', kind: '酒店旅游', fen: 6000 })];
  const manual = [man('a1', 12, 1, 8800, { cat: '吃饭' }), man('a2', 12, 2, 9900, { cat: '吃饭' })];
  const { res, by } = pipeline([{ app: 'wechat', txns: rows }, { app: 'alipay', txns: alis }], manual, { cats, rules: [{ kw: '张记', cat: '午饭' }] });
  const r3 = by[rows[2].no].rec;
  ok(by[rows[0].no].bucket === 'merge' && by[rows[1].no].bucket === 'merge' && r3.layer === 'learned' && r3.cat === '吃饭' && r3.conf === 'high', '10 从合并里学：两家分店都记成吃饭，第三家分店推荐吃饭（同对方多分店归一组）');
  ok(res.learned.length === 1 && res.learned[0].kw === '某某自助烤肉' && res.learned[0].cat === '吃饭' && res.learned[0].count === 2, '10 合并上 2 次、分类一致：给出一条学到的规则');
  const r4 = by[rows[3].no].rec;
  ok(r4.layer === 'rule' && r4.cat === '午饭' && r4.reason.includes('你的规则'), '10 你的规则「张记 → 午饭」压过内置的「麻辣烫 → 餐饮」（层级优先，不比关键词长短）');
  const r5 = by[rows[4].no].rec;
  ok(r5.layer === 'builtin' && r5.conf === 'mid' && r5.cat === '吃饭' && r5.want === '餐饮美食', '10 只在商品说明里找到（奶茶）、对方是普通商户：把握中（1024-W，原来低）；餐饮美食按同义落到存档的「吃饭」');
  const r6 = by[rows[5].no].rec;
  ok(r6.layer === 'borrow' && r6.cat === '吃饭', '10 两家互借：支付宝里同一个对方是餐饮美食，微信跟着用');
  ok(by[rows[6].no].rec.layer === 'none' && by[rows[6].no].rec.cat === '未分类', '10 都没有依据：未分类');
  const ra = by[alis[1].no].rec;
  ok(ra.layer === 'alipay' && ra.newCat === '酒店旅游' && ra.cat === '其他', '10 支付宝分类「酒店旅游」，存档里没有同义的：只有 1 笔（不到 3 笔），并进「其他」，带上新建建议（2b 起新老用户一样）');
  ok(res.newCats.some(c => c.name === '酒店旅游' && c.defaultOn === false && c.mergeInto === '其他'), '10 不到 3 笔：新建分类默认不勾，并进「其他」');
  // 打平不学
  const t2 = [wx({ time: T(12, 10), cp: '某面馆', fen: 1000 }), wx({ time: T(12, 11), cp: '某面馆', fen: 1100 }), wx({ time: T(12, 12), cp: '某面馆', fen: 1200 })];
  const r2 = pipeline([{ app: 'wechat', txns: t2 }], [man('b1', 12, 10, 1000, { cat: '吃饭' }), man('b2', 12, 11, 1100, { cat: '午饭' })], { cats });
  ok(r2.by[t2[2].no].rec.layer === 'builtin' && r2.res.learned.length === 0, '10 同一个对方两次记成不同分类：打平不学，往下一层找（内置「面馆」）');
}

// ===== 11. 新用户的新建分类 =====
{
  const rows = []; for (let i = 0; i < 4; i++) rows.push(ali({ time: T(2, 1 + i), cp: '某铁路' + i, kind: '交通出行', fen: 10000 + i }));
  rows.push(ali({ time: T(2, 9), cp: '某药店', kind: '医疗健康', fen: 3000 }));
  const { res, by } = pipeline([{ app: 'alipay', txns: rows }], [], { isNewUser: true });
  const tr = res.newCats.find(c => c.name === '交通出行'), md = res.newCats.find(c => c.name === '医疗健康');
  ok(tr && tr.count === 4 && tr.defaultOn === true && by[rows[0].no].rec.cat === '交通出行', '11 新用户：交通出行 4 笔，默认新建，推荐就用它');
  ok(md && md.count === 1 && md.defaultOn === false && md.mergeInto === '其他' && by[rows[4].no].rec.cat === '其他', '11 新用户：医疗健康只有 1 笔（不到 3 笔），归「其他」');
}

// ===== 12. 本批没配上的微信退款：在账本里找候选 =====
{
  const r1 = wx({ time: T(3, 20, 10, 0), no: wrno(), io: 'income', kind: '某外卖-退款', cp: '某外卖（示例店）', fen: 1200, status: '已全额退款' });
  const r2 = wx({ time: T(3, 21, 10, 0), no: wrno(), io: 'income', kind: '某超市-退款', cp: '某超市', fen: 800, status: '已全额退款' });
  const refundCands = [{ id: 'L1', time: '2026-03-02T12:00', type: 'expense', fen: 1500, refunded: 0, cp: '某外卖(示例店)', cat: '餐饮' },
                       { id: 'L2', time: '2026-03-25T12:00', type: 'expense', fen: 1500, refunded: 0, cp: '某外卖', cat: '餐饮' },        // 在退款之后
                       { id: 'L3', time: '2026-03-01T12:00', type: 'expense', fen: 1500, refunded: 500, cp: '某外卖', cat: '餐饮' },       // 剩下的不够退
                       { id: 'L4', time: '2026-03-01T12:00', type: 'expense', fen: 600, refunded: 0, cp: '某超市', cat: '购物' }];         // 比退款少
  const { res, by, q } = pipeline([{ app: 'wechat', txns: [r1, r2] }], [], { refundCands });
  ok(q.refunds.length === 2 && q.refunds[0].minFen === 1200 && q.refunds[0].from === '2025-09-21', '12 ledgerQuery 列出要在账本里找候选的退款（往前 180 天）');
  ok(by[r1.no].bucket === 'pending' && by[r1.no].why === 'refundcands' && JSON.stringify(by[r1.no].cands) === '[{"record":"L1"}]', '12 找到候选：同对方（清洗后一样）、时间更早、剩下的够退');
  ok(by[r2.no].bucket === 'refund' && by[r2.no].mode === 'flow' && by[r2.no].why === 'noorig', '12 没有候选：按只算结余');
  ok(conserved(res), '12 守恒');
}

// ===== 13. ledgerQuery 的日期范围 =====
{
  const { q } = pipeline([{ app: 'wechat', txns: [wx({ time: T(6, 3) }), wx({ time: T(6, 28) })] }], []);
  ok(q.manual.from === '2026-05-27' && q.manual.to === '2026-07-05', '13 手记的范围：这一批前后各加 7 天');
}

// ===== 14. 性质测试 =====
{
  let s = 777;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const ri = n => Math.floor(rnd() * n);
  let bad = 0, notes = [];
  for (let k = 0; k < 300; k++) {
    const amts = [1500, 1500, 2000, 3000, 2800, 4500, 800];
    const cps = ['甲店', '乙店（一分店）', '乙店（二分店）', '某面馆', '某超市'];
    const tx = [], manual = [];
    const n = 1 + ri(30);
    for (let i = 0; i < n; i++) {
      const d = 1 + ri(20), fen = amts[ri(amts.length)];
      const app = rnd() < 0.5 ? 'wechat' : 'alipay';
      tx.push({ app, t: (app === 'wechat' ? wx : ali)({ time: T(5, d, ri(23), ri(59)), fen, cp: cps[ri(cps.length)], io: rnd() < 0.1 ? 'income' : 'expense' }) });
      if (rnd() < 0.6) manual.push(man('m' + k + '_' + i, 5, Math.max(1, Math.min(28, d + ri(9) - 4)), rnd() < 0.8 ? fen : fen + ri(600) - 300, { cat: ['餐饮', '购物', '其他'][ri(3)], type: rnd() < 0.1 ? 'income' : 'expense' }));
    }
    const bills = ['wechat', 'alipay'].map(app => ({ app, txns: tx.filter(x => x.app === app).map(x => x.t) })).filter(b => b.txns.length);
    const a = pipeline(bills, manual), b2 = pipeline(bills, manual);
    const ids = new Set(manual.map(m => m.id));
    const candsOk = a.res.items.every(it => !it.cands || it.cands.every(c => c.row || ids.has(c.record)));
    const intoOk = a.res.items.every(it => it.bucket !== 'merge' || ids.has(it.into));
    const usedNotCand = a.res.items.every(it => it.bucket !== 'pending' || !it.cands || it.cands.every(c => !a.res.items.some(x => x.bucket === 'merge' && x.into === c.record)));
    const good = conserved(a.res) && intoUnique(a.res) && candsOk && intoOk && usedNotCand && JSON.stringify(a.res) === JSON.stringify(b2.res);
    if (!good) { bad++; if (notes.length < 3) notes.push(`#${k} conserved=${conserved(a.res)} unique=${intoUnique(a.res)} cands=${candsOk} into=${intoOk} used=${usedNotCand}`); }
  }
  ok(bad === 0, '14 300 份随机账单配随机手记：每笔只进一个桶、桶之和 = 文件笔数、合并过的手记不重复用也不再当候选、两次结果一样 ' + notes.join(' | '));
}

// ===== 15. 3000 条账单 + 1.7 万条手记：按数据量断言 =====
{
  const tx = [], manual = [];
  const amts = [1200, 1500, 1800, 2000, 2500, 3000, 3500, 4200, 5000, 6800, 8800, 12000];
  for (let i = 0; i < 3000; i++) {
    const mo = 1 + i % 12, dd = 1 + Math.floor(i / 12) % 28;
    tx.push(wx({ time: T(mo, dd, 8 + i % 12, i % 60), fen: amts[i % amts.length] + (i % 97) * 10, cp: '虚构商户' + (i % 300) }));
  }
  // 1.7 万条手记：一半的账单照着记了一条（同一天、同金额），其余是随便的（2022–2026 年）
  tx.forEach((t, j) => { if (j % 2 === 0) manual.push({ id: 'h' + j, time: `2026-${p2(t.time.mo)}-${p2(t.time.d)}T07:00`, type: 'expense', fen: t.fen, cat: '餐饮', mode: 'normal' }); });
  for (let i = manual.length; i < 17000; i++) {
    const y = 2022 + i % 5, mo = 1 + i % 12, dd = 1 + (i * 7) % 28;
    manual.push({ id: 'h' + (3000 + i), time: `${y}-${p2(mo)}-${p2(dd)}T${p2(7 + i % 14)}:00`, type: 'expense', fen: 333 + (i * 37) % 20000, cat: '购物', mode: 'normal' });
  }
  const parsed = P.parseFiles([{ name: '一年', data: B.ab(B.bill('wechat', tx, { range: RANGE }).bytes) }]);
  const routed = R.route(parsed, { known: {}, rules: [] });
  const q = M.ledgerQuery(routed, parsed);
  const inRange = manual.filter(m => m.time.slice(0, 10) >= q.manual.from && m.time.slice(0, 10) <= q.manual.to);
  const res = M.match(routed, parsed, { manual: inRange, cats: DEF, merchants: W });
  // 上限：每笔账单「前后 7 天、同收支、金额差不超过 5 元」或「同一天」的手记数之和（三轮各看一遍，再乘 3）
  const day = t => Math.round(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 86400000);
  const rows = parsed.files[0].rows;
  let bound = 0;
  const md = inRange.map(m => [day(m.time), m.fen]);
  rows.forEach(r => { const bd = day(r.time); md.forEach(([d, f]) => { const dd = Math.abs(d - bd); if ((dd <= 7 && Math.abs(f - r.fen) <= 500) || dd === 0) bound++; }); });
  const all = rows.length * manual.length;
  console.log(`    3000 条账单 + ${manual.length} 条手记（按日期范围交进来 ${inRange.length} 条）：看了 ${res.stats.examined} 条手记，上限 ${bound * 3}，两边相乘 ${all}；合并 ${res.stats.merged} 笔`);
  ok(inRange.length < manual.length / 3, '15 主页面只交进这一批前后 7 天的手记（' + inRange.length + ' 条）');
  ok(res.stats.examined > 0 && res.stats.examined <= bound * 3, '15 配对时看的手记不超过「前后 7 天、金额相关」的那些（' + res.stats.examined + ' ≤ ' + bound * 3 + '）');
  ok(res.stats.examined < all / 100, '15 不到两边相乘的 1%（' + (res.stats.examined / all * 100).toFixed(3) + '%）');
  ok(res.stats.merged >= 1350 && conserved(res) && intoUnique(res), '15 照着记的 1500 条里配上了 ' + res.stats.merged + ' 条（至少九成），守恒，手记不重复用');
}

// ===== 16. 在后台线程里跑 =====
{
  const FW = makeFakeWorker(path.dirname(htmlFile));
  const w = new FW('https://localhost/import/worker.js');
  const msgs = []; w.onmessage = e => msgs.push(e.data);
  for (let i = 0; i < 400 && !msgs.length; i++) await new Promise(r => setTimeout(r, 5));
  const bills = [1, 2, 3].map(d => wx({ time: T(3, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 }));
  const parsed = P.parseFiles([{ name: 'x', data: B.ab(B.bill('wechat', bills, { range: RANGE }).bytes) }]);
  const routed = R.route(parsed, { known: {}, rules: [] });
  const manual = [man('m1', 3, 1, 1500)];
  w.postMessage({ id: 1, cmd: 'match', data: { routed, parsed, manual, refundCands: [], cats: DEF, rules: [], isNewUser: false } });
  for (let i = 0; i < 400 && !msgs.some(m => m.id === 1 && m.type !== 'progress'); i++) await new Promise(r => setTimeout(r, 5));
  const done = msgs.find(m => m.id === 1 && m.type === 'done');
  const direct = M.match(routed, parsed, { manual, refundCands: [], cats: DEF, rules: [], isNewUser: false, merchants: W });
  ok(done && JSON.stringify(done.result) === JSON.stringify(direct), '16 线程里配对的结果和直接算一模一样（线程里用自己载入的内置词表）');
  w.postMessage({ id: 2, cmd: 'info' });
  for (let i = 0; i < 400 && !msgs.some(m => m.id === 2); i++) await new Promise(r => setTimeout(r, 5));
  ok(msgs.find(m => m.id === 2).result.match === M.VERSION, '16 线程里载入了 match.js');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
