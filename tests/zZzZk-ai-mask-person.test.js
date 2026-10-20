// 1021-T5（实测 10-20 第 1 轮，隐私）AI 导出打码多认几种个人：英文名、一个字、常见姓开头的两三个字，
// 支付宝原始分类「收入」「转账红包」、商品说明有收钱码 / 收款 / 转账的；商户名不变。名字全是虚构的。
// node zZzZk-ai-mask-person.test.js [index.html]
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const AI = require(path.join(path.dirname(htmlFile), 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

[['X. Y. ZZZ', ''], ['Lilyanne', ''], ['K', ''], ['秋', ''], ['云', ''], ['王某某', ''], ['李二', ''], ['某甲', '收入'], ['某乙', '转账红包'], ['某丙', '二维码收款']]
  .forEach(([cp, oc]) => ok(AI.personal(cp, oc, ''), '1 认成个人：' + cp + (oc ? '（' + oc + '）' : '')));
ok(AI.personal('某丁', '', '收钱码收款'), '1 商品说明有收钱码：个人');
[['盒马', ''], ['美团', ''], ['某虚构科技有限公司', ''], ['某虚构便利店', ''], ['铁路12306', ''], ['淘宝闪购', ''], ['中国联通', '']]
  .forEach(([cp, oc]) => ok(!AI.personal(cp, oc, ''), '2 商户不打码：' + cp));
ok(AI.personal('张三', '', '') && AI.personal('ab***@x', '', ''), '3 老规则照旧（带 *）');
// 导出文字里搜不到这些名字
const rows = ['X. Y. ZZZ', 'Lilyanne', '秋', '王某某'].map((cp, i) => ({ n: i + 1, time: '2026-03-31T10:00', fen: 175, type: 'income', cat: '未分类', mode: 'normal', dest: '新建', cp, desc: '收钱码收款', remark: '', oc: '收入' }))
  .concat([{ n: 5, time: '2026-03-31T11:00', fen: 6706, type: 'expense', cat: '餐饮', mode: 'normal', dest: '新建', cp: '盒马', desc: '酱猪耳', remark: '', oc: '餐饮美食' }]);
const txt = AI.exportText({ batch: 'b1', at: '2026-10-20 10:00:00', cats: ['未分类', '餐饮'], rows }, {}).parts.map(p => p.text).join('\n');
ok(!/X\. Y\. ZZZ|Lilyanne|秋|王某某/.test(txt) && /盒马/.test(txt) && (txt.match(/个人/g) || []).length >= 4, '4 打码开着：导出里搜不到这几个名字，商户名照留');
const raw = AI.exportText({ batch: 'b1', at: '2026-10-20 10:00:00', cats: ['未分类'], rows }, { mask: false }).parts.map(p => p.text).join('\n');
ok(/Lilyanne/.test(raw), '4 打码关掉：照原样');

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
