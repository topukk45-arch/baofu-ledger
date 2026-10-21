// 1021-T20（实测 10-21 第 10 条）网咖、网吧是上网费：对方名里有就推文化休闲（拆开以后归「游戏」），不再落餐饮。
// node zZzZz-classify-netbar.test.js [index.html]。数据虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const one = (r, cats) => C.classify([r], { cats: cats || ['未分类', '餐饮', '娱乐', '其他'], merchants: M }).recs[0];
const a = one({ app: 'alipay', cp: '某虚构网咖', desc: '刷卡 订单 2026043100001234', kind: '餐饮美食', io: 'expense' });
ok(a.cat !== '餐饮' && a.conf === 'mid' && /网咖/.test(a.reason), '1 网咖（支付宝写的是餐饮美食）不落餐饮：' + a.cat + ' ' + a.reason);
const b = one({ app: 'wechat', cp: '某虚构网吧', desc: '', kind: '商户消费', io: 'expense' });
ok(b.cat !== '餐饮' && /网吧/.test(b.reason), '2 网吧：' + b.cat + ' ' + b.reason);
const c = one({ app: 'wechat', cp: '某虚构咖啡', desc: '', kind: '商户消费', io: 'expense' });
ok(c.cat === '餐饮', '3 咖啡店照旧餐饮');
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
