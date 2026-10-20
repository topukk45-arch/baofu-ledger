// 1017-I「AI 检查导入结果」读 AI 的回复（纯计算，import/ai.js 的 parseReply）。node zZv-ai-reply.test.js [index.html]
// 用一份虚构的 AI 回复：四种能认的（分类、备注、口径、标记带 / 不带说的是哪一笔）；不认的（号越界、没进账本的那几行、分类不存在、
// 改金额 / 时间 / 对方、新建、删除、格式乱的、和现在一样的、同一条提两次）列进「没看懂的几行」；代码块外面的废话不看；
// 批次号、导出时间对不上整份拒收；删掉了的那一笔照样列出来、标 gone。回复内容全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const AI = require(path.join(path.dirname(htmlFile), 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const CTX = { batch: 'b77', aiAt: ['2026-10-20 09:00:00', '2026-10-20 10:00:00'], cats: ['未分类', '吃饭', '购物', '零食', '出行'],
  rows: [{ n: 1, id: 'r1', cat: '吃饭', mode: 'normal', remark: '午饭' }, { n: 2, id: 'r2', cat: '购物', mode: 'normal', remark: '' },
         { n: 3, id: 'r3', cat: '吃饭', mode: 'normal', remark: '' }, { n: 4, id: 'r4', cat: '未分类', mode: 'normal', remark: '' },
         { n: 5, id: 'r5', gone: true }, { n: 6, id: 'r6', cat: '出行', mode: 'normal', remark: '' }] };
const REPLY = [
  '好的，我看了一下这批账单，下面是我的建议（这句是代码块外面的废话）：',
  '',
  '```记问',
  '记问修改建议 v2 批次 b77 导出 2026-10-20 10:00:00',
  '#2 | 分类 | 零食 | 便利店买饮料，比「购物」更贴切',
  '#1 | 备注 | 立减 2 元 | 手记 30、实付 28',
  '#6 | 口径 | 不计入 | 自己账户之间转钱',
  '#3 | 标记 | 可能重复 #1 | 同一分钟、同金额',
  '#4 ｜ 标记 ｜ 可能漏配 ｜ 加上配送费正好是你记的那条',
  '#5 | 分类 | 吃饭 | 这笔你已经删了',
  '#9 | 分类 | 吃饭 | 号越界',
  '#3 | 分类 | 奶茶 | 分类不存在',
  '#3 | 金额 | 25.00 | 想改金额',
  '#4 | 时间 | 2026-10-05 12:00 | 想改时间',
  '#4 | 对方 | 某虚构店 | 想改对方',
  '新建 | 购物 | 12.00 | 想新建一笔',
  '#6 | 删除 | - | 想删掉',
  '这一行格式乱了',
  '#1 | 分类 | 吃饭 | 和现在一样',
  '#2 | 分类 | 出行 | 同一条同一项第二次',
  '#6 | 口径 | 只算一半 | 口径不认',
  '#4 | 标记 | 可能有问题 | 标记不认',
  '#4 | 标记 | 可能重复 #4 | 说的是自己',
  '#2 | 标记 | 可能重复 #5 | 说的那笔删了',
  '```',
  '',
  '以上，希望对你有帮助！（也是废话）'
].join('\n');

const r = AI.parseReply(REPLY, CTX);
ok(r.ok, '1 批次号、导出时间对得上（导出时间是记下的最近几次之一）：认');
const it = n => r.items.filter(x => x.n === n);
ok(r.items.length === 6, '1 能认的 6 条：' + r.items.map(x => '#' + x.n + x.field).join(' '));
ok(it(2)[0].field === 'cat' && it(2)[0].value === '零食' && it(2)[0].cur === '购物' && it(2)[0].id === 'r2' && /便利店/.test(it(2)[0].why), '1 改分类：零食（原来购物），带理由');
ok(it(1)[0].field === 'remark' && it(1)[0].value === '立减 2 元' && it(1)[0].cur === '午饭', '1 改备注');
ok(it(6)[0].field === 'mode' && it(6)[0].value === 'skip' && it(6)[0].cur === 'normal', '1 改口径：不计入');
ok(it(3)[0].field === 'flag' && it(3)[0].value === 'dup' && it(3)[0].ref === 1 && it(3)[0].refId === 'r1', '1 标记可能重复，说的是 #1');
ok(it(4)[0].field === 'flag' && it(4)[0].value === 'miss' && !it(4)[0].ref, '1 标记可能漏配（全角竖线也认）');
ok(it(5)[0] && it(5)[0].gone && it(5)[0].field === 'cat', '1 删掉了的那一笔：照样列出来，标 gone');
const bad = l => (r.bad.find(x => x.line.indexOf(l) >= 0) || {}).why || '';
ok(/没有 #9 这一笔/.test(bad('#9 |')), '2 号越界：' + bad('#9 |'));
ok(/分类「奶茶」不在你的分类里/.test(bad('奶茶')), '2 分类不存在');
ok(bad('#3 | 金额') === '不能改金额' && bad('#4 | 时间') === '不能改时间' && bad('#4 | 对方') === '不能改对方', '2 改金额 / 时间 / 对方：不认');
ok(bad('新建 |') === '不能新建记录' && bad('#6 | 删除') === '不能删除记录', '2 新建、删除：不认');
ok(/格式不对/.test(bad('这一行格式乱了')), '2 格式乱的行');
ok(/已经是「吃饭」了/.test(bad('和现在一样')), '2 和现在一样的');
ok(/前面已经提过了/.test(bad('同一条同一项第二次')), '2 同一条同一项第二次：只认第一次');
ok(/统计只能是/.test(bad('只算一半')) && /标记只能是/.test(bad('可能有问题')) && /就是它自己/.test(bad('说的是自己')) && /不是账本里的记录/.test(bad('说的那笔删了')), '2 口径、标记的值不认的');
ok(r.bad.length === 14, '2 没看懂的 14 行：' + r.bad.length);
ok(r.outside === 2 && !r.bad.some(x => /废话/.test(x.line)), '3 代码块外面的废话不看（数了 2 行）');
// 整份拒收
ok(AI.parseReply(REPLY.replace('批次 b77', '批次 b78'), CTX).why === 'batch', '4 批次号对不上：整份拒收');
ok(AI.parseReply(REPLY.replace('10:00:00', '11:00:00'), CTX).why === 'time', '4 导出时间对不上：整份拒收');
ok(AI.parseReply(REPLY.replace('2026-10-20 10:00:00', '2026-10-20 09:00:00'), CTX).ok, '4 早一点那次导出的回复（还在最近 5 次里）：认');
ok(AI.parseReply('```记问\n#1 | 分类 | 吃饭 | x\n```', CTX).why === 'nohead', '4 没有第一行：整份拒收');
ok(AI.parseReply('我觉得都挺好的。\n#1 | 分类 | 吃饭 | x', CTX).why === 'noblock', '4 没有 ```记问 代码块：整份拒收（代码块外面的不看）');
// 分两段回复（两个代码块，第一行一样）
const two = '```记问\n记问修改建议 v2 批次 b77 导出 2026-10-20 10:00:00\n#2 | 分类 | 零食 | a\n```\n第二段：\n```记问\n记问修改建议 v2 批次 b77 导出 2026-10-20 10:00:00\n#6 | 口径 | 只算结余 | b\n```';
const r2 = AI.parseReply(two, CTX);
ok(r2.ok && r2.items.length === 2 && !r2.bad.length && r2.items[1].value === 'flow', '5 两个代码块（分段回复）：都认');
// 没关上的代码块（AI 截断了）也认已有的行；备注截到 200 字
const r3 = AI.parseReply('```记问\n记问修改建议 v2 批次 b77 导出 2026-10-20 10:00:00\n#1 | 备注 | ' + '长'.repeat(300) + ' | x', CTX);
ok(r3.ok && r3.items.length === 1 && r3.items[0].value.length === AI.REMARK_MAX, '5 代码块没关上也认已有的行；备注截到 200 字');
console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
