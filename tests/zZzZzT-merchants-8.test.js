// 导入简化第 8 版：内置词表改成一条一个对象 { kw, cat, kind }（kind：brand 全国连锁品牌 / 平台，word 商品、行业词），推荐结果一点不变。
//   这里查：每条都是这个样子；按老格式 [关键词, 分类] 交给 classify 和按新格式交，每个词当对方、当商品说明推出来的结果逐字一样。
//   整条导入的结果由 zz-import-golden（导入标准答案）逐字节管着。纯 Node，不用 jsdom。
const path = require('path');
const IMP = path.join(__dirname, '..', 'www', 'import');
const W = require(path.join(IMP, 'merchants.js')), C = require(path.join(IMP, 'classify.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
ok(W.items.length > 200 && W.items.every(x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.kw === 'string' && x.kw && typeof x.cat === 'string' && x.cat && (x.kind === 'brand' || x.kind === 'word') && Object.keys(x).length === 3), '1 每条都是 { kw, cat, kind }（' + W.items.length + ' 条）');
ok(W.items.some(x => x.kind === 'brand' && x.kw === '星巴克') && W.items.some(x => x.kind === 'word' && x.kw === '早餐'), '1 品牌和商品词分开标');
const OLD = Object.assign({}, W, { items: W.items.map(x => [x.kw, x.cat]) });
const CATS = ['未分类', '吃饭', '购物', '交通', '娱乐', '游戏', '会员订阅', '其他', '医疗', '住房', '通讯'];
const rows = [];
W.items.forEach(x => { rows.push({ app: 'wechat', cp: '某虚构' + x.kw + '店', desc: '/', kind: '商户消费', io: 'expense' }); rows.push({ app: 'alipay', cp: '某虚构个体', desc: '买了' + x.kw, kind: '其他', io: 'expense' }); });
[true, false].forEach(nu => {
  const a = C.classify(rows, { cats: CATS, merchants: W, isNewUser: nu }), b = C.classify(rows, { cats: CATS, merchants: OLD, isNewUser: nu });
  ok(JSON.stringify(a) === JSON.stringify(b), '2 新老格式推出来一样（' + (nu ? '新用户' : '老用户') + '，' + rows.length + ' 行）');
});
ok(C.classify([{ app: 'wechat', cp: '星巴克某虚构店', desc: '/', kind: '商户消费', io: 'expense' }], { cats: CATS, merchants: W }).recs[0].cat === '吃饭', '3 星巴克 → 吃饭（落到存档里的分类）');
console.log(`导入简化第 8 版：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
