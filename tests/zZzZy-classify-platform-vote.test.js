// 1021-T19（实测 10-21 第 9 条）只在商品说明里找到分类的行，按对方投票时平台（淘宝、美团……）和「什么都卖」名单里的对方不投票：
// 同一平台下是不同的店，超市不该因为同一平台别的几笔是外卖被带成餐饮。普通对方照旧投票。node zZzZy-classify-platform-vote.test.js [index.html]。数据虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '餐饮', '购物', '其他'];
const run = rows => C.classify(rows, { cats: CATS, merchants: M }).recs;
const r = (cp, desc) => ({ app: 'wechat', cp, desc, kind: '商户消费', io: 'expense' });
const a = run([r('淘宝闪购', '某虚构外卖 晚餐'), r('淘宝闪购', '某虚构外卖 午餐'), r('淘宝闪购', '某虚构外卖'), r('淘宝闪购', '某虚构超市')]);
ok(a[3].cat === '购物' && /超市/.test(a[3].reason), '1 闪购下的超市：按它自己的商品说明归购物，不被别的外卖带成餐饮：' + a[3].cat + ' ' + a[3].reason);
ok(a.slice(0, 3).every(x => x.cat === '餐饮'), '1 外卖照旧餐饮');
const b = run([r('美团', '某虚构超市'), r('美团', '某虚构外卖'), r('美团', '某虚构外卖')]);
ok(b[0].cat === '购物', '2 美团（什么都卖）也不投票：' + b[0].reason);
const c = run([r('某虚构小店', '外卖'), r('某虚构小店', '外卖'), r('某虚构小店', '超市')]);
ok(c[2].cat === '餐饮' && /其他几笔的商品说明/.test(c[2].reason), '3 普通对方照旧投票（同一家店多数是外卖）：' + c[2].reason);
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
