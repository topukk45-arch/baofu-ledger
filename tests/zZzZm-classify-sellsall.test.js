// 1021-T7（实测 10-20 第 2 轮）分类推荐：「什么都卖」的综合商超 / 平台让位给商品说明和支付宝分类；
// 商品说明的词和支付宝分类一致 → 升到「中」；理由写落到了你的哪个分类。node zZzZm-classify-sellsall.test.js [index.html]。数据虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '餐饮', '购物', '出行', '其他', '红包', '工资'];
const one = (r, o) => C.classify([r], Object.assign({ cats: CATS, merchants: M }, o || {})).recs[0];

ok(['盒马', '永辉', '沃尔玛', '家乐福', '大润发', '山姆', '朴朴', '叮咚买菜', '美团', '淘宝闪购'].every(w => M.sellsAll.includes(w)), '0 「什么都卖」名单有这 10 个');
const a = one({ app: 'alipay', cp: '盒马', desc: '盒马工坊 酱猪耳', kind: '餐饮美食', io: 'expense' });
ok(a.cat === '餐饮' && a.layer === 'alipay' && a.conf === 'mid', '1 盒马的酱猪耳（支付宝餐饮美食）→ 餐饮，不再落购物：' + a.reason);
ok(/落到你的「餐饮」/.test(a.reason), '1 理由写落到了你的哪个分类');
const b = one({ app: 'wechat', cp: '盒马', desc: '', kind: '商户消费', io: 'expense' });
ok(b.cat === '购物' && b.conf === 'low' && /综合商超「盒马」/.test(b.reason), '2 只有对方（微信没有支付宝分类）：最后才用它，把握低：' + b.reason);
const c = one({ app: 'alipay', cp: '某虚构餐饮店铺', desc: '皮蛋瘦肉粥外卖', kind: '餐饮美食', io: 'expense' });
ok(c.cat === '餐饮' && c.conf === 'mid', '3 商品说明「外卖」和支付宝分类一致 → 把握中：' + c.reason);
const d = one({ app: 'wechat', cp: '某虚构商户', desc: '外卖', kind: '', io: 'expense' });
ok(d.conf === 'mid', '3 1024-W：只在商品说明里认出、对方是普通商户 → 把握中');
const d2 = one({ app: 'wechat', cp: '美团', desc: '外卖', kind: '', io: 'expense' });
ok(d2.conf === 'low', '3 1024-W：对方是平台的照旧低');
const d3 = one({ app: 'wechat', cp: '某虚构昵称', desc: '外卖', kind: '转账', io: 'expense' });
ok(d3.conf === 'low', '3 1024-W：和个人之间的照旧低');
const e = one({ app: 'wechat', cp: '美团外卖', desc: '', kind: '', io: 'expense' });
ok(e.cat === '餐饮' && e.conf === 'mid', '4 「美团外卖」整个词照旧中（「美团」按整个词认，不连累美团外卖）');
const f = one({ app: 'alipay', cp: '某虚构商户', desc: '', kind: '日用百货', io: 'expense' }, { cats: ['未分类', '日用百货'] });
ok(!/落到你的/.test(f.reason), '5 同名落地不写「落到」');

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
