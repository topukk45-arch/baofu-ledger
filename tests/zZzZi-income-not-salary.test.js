// 1021-T3（实测 10-20 第 1 轮）收入不再落「工资」：同义表里「收入」去掉「工资」；支付宝「收入」里收钱码 / 转账 / 闲鱼这类推「收款」。
// 工资只来自你的规则或你手动选。node zZzZi-income-not-salary.test.js [index.html]。数据全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const DEF = ['未分类', '餐饮', '购物', '出行', '其他', '红包', '工资'];   // 默认 7 个
const rows = [
  { app: 'alipay', cp: '某甲', desc: '收钱码收款', kind: '收入', io: 'income' },
  { app: 'alipay', cp: '闲鱼', desc: '二手手机转账', kind: '收入', io: 'income' },
  { app: 'alipay', cp: 'X. Y. ZZZ', desc: '转账', kind: '收入', io: 'income' },
  { app: 'alipay', cp: '某理财', desc: '收益发放', kind: '收入', io: 'income' },
];

// 1. 老用户、默认 7 个分类：一笔都不落「工资」
{
  const r = C.classify(rows, { cats: DEF, merchants: M, isNewUser: false });
  ok(r.recs.every(x => x.cat !== '工资'), '1 支付宝「收入」一笔都不落工资：' + r.recs.map(x => x.cat).join('、'));
  ok(r.recs.slice(0, 3).every(x => x.newCat === '收款' && x.cat === '收款'), '1 收钱码 / 闲鱼 / 转账 → 新建分类建议「收款」，3 笔直接建（2b 起新老用户一样）');
  ok(r.recs[3].newCat === '收入' && r.recs[3].cat === '其他', '1 其余收入 → 建议「收入」，只有 1 笔、并进「其他」');
  ok(/收钱码/.test(r.recs[0].reason), '1 理由写明收钱码 / 转账收款：' + r.recs[0].reason);
}
// 2. 新用户：3 笔以上的「收款」默认建
{
  const r = C.classify(rows, { cats: DEF, merchants: M, isNewUser: true });
  ok(r.recs.slice(0, 3).every(x => x.cat === '收款'), '2 新用户默认建「收款」');
  ok(r.recs.every(x => x.cat !== '工资'), '2 新用户也不落工资');
}
// 3. 存档里有「收入」「收款」就落进去；「工资」只来自你的规则
{
  const r = C.classify(rows, { cats: DEF.concat(['收入']), merchants: M });
  ok(r.recs.every(x => x.cat === '收入'), '3 有「收入」：收款也能落到「收入」');
  const r2 = C.classify(rows.slice(3), { cats: DEF, merchants: M, rules: [{ kw: '某理财', cat: '工资' }] });
  ok(r2.recs[0].cat === '工资' && r2.recs[0].layer === 'rule', '3 你的规则照样能归到工资');
  ok(C.land('收入', DEF) === null, '3 同义表：收入落不到工资');
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
