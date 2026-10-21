// 1021-T24（实测 10-21，Adeline 那几笔）付给个人的钱（扫对方收钱码、转账；对方带 *、英文名）不照抄支付宝的「交易分类」
// （个人收钱码常写「商业服务」），推「转账红包」（落「转账」）、把握低；商户的收钱码、普通商户照旧。node zZzZz4-classify-pay-person.test.js [index.html]。数据虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '餐饮', '购物', '转账', '其他'];
const one = (cp, desc, kind, io) => C.classify([{ app: 'alipay', cp, desc, kind, io: io || 'expense' }], { cats: CATS, merchants: M }).recs[0];
const a = one('Adelina', '收钱码收款', '商业服务');
ok(a.cat === '转账' && a.conf === 'low' && !a.newCat, '1 扫英文名的收钱码付钱：不新建「商业服务」，推「转账」、把握低：' + a.cat + ' ' + a.reason);
ok(one('虚**', '收钱码收款', '商业服务').cat === '转账', '1 对方带 * 的收钱码：转账');
ok(one('Bob Lee', '某虚构商品', '商业服务').cat === '转账', '1 英文名对方：转账');
ok(one('某虚构科技有限公司', '收钱码收款', '餐饮美食').cat === '餐饮', '2 商户的收钱码照旧按支付宝分类');
ok(one('某虚构餐厅', '晚饭', '餐饮美食').cat === '餐饮', '2 普通商户照旧');
ok(one('Adelina', '收钱码收款', '收入', 'income').want === '收款', '3 收进来的照旧推「收款」');
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
