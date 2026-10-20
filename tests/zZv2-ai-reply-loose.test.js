// 1017-P 读 AI 的回复不再强依赖 ```记问 围栏（纯计算，import/ai.js 的 parseReply）。node zZv2-ai-reply-loose.test.js [index.html]
// 在 AI 客户端点「复制代码」只复制到代码块里面那几行：没有围栏时在整段文字里找「记问修改建议 v2 批次 … 导出 …」那一行，
// 从下一行起逐行读「#号 | 改什么 | 改成什么 | 理由」，遇到不是这种格式的行或 ``` 就停。每行只按前 3 个竖线切，后面都算理由；
// 全角 ｜ ＃、行首空格、「- 」「* 」列表符号、Windows 换行都认。回复内容全是虚构的。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const AI = require(path.join(path.dirname(htmlFile), 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CTX = { batch: 'b77', aiAt: ['2026-10-20 10:00:00'], cats: ['未分类', '吃饭', '购物', '零食', '出行'],
  rows: [{ n: 1, id: 'r1', cat: '吃饭', mode: 'normal', remark: '午饭' }, { n: 2, id: 'r2', cat: '购物', mode: 'normal', remark: '' },
         { n: 3, id: 'r3', cat: '吃饭', mode: 'normal', remark: '' }, { n: 6, id: 'r6', cat: '出行', mode: 'normal', remark: '' }] };
const HEAD = AI.replyHead('b77', '2026-10-20 10:00:00');
const ITEMS = ['#2 | 分类 | 零食 | 便利店买饮料', '#6 | 口径 | 不计入 | 自己账户之间转钱', '#3 | 标记 | 可能重复 #1 | 同一分钟、同金额'];
const sig = r => r.ok ? r.items.map(x => '#' + x.n + x.field + '=' + x.value).join(' ') : 'X:' + r.why;
const WANT = '#2cat=零食 #6mode=skip #3flag=dup';

ok(HEAD === '记问修改建议 v2 批次 b77 导出 2026-10-20 10:00:00', '0 开头那一行还是导出时让 AI 抄的那一行（不另起写法）');
// 1. 带围栏（老写法）
ok(sig(AI.parseReply(['好的：', '```记问', HEAD].concat(ITEMS, ['```', '以上。']).join('\n'), CTX)) === WANT, '1 带 ```记问 围栏：照旧认');
// 2. 不带围栏、前后有废话
const loose = ['好的，我看完了，建议如下：', '', HEAD].concat(ITEMS, ['', '以上就是全部建议，有问题再问我。', '#1 | 分类 | 出行 | 这一行在废话后面，不读']).join('\n');
const r2 = AI.parseReply(loose, CTX);
ok(sig(r2) === WANT && !r2.bad.length, '2 不带围栏：找开头那一行往下读，遇到废话就停（废话后面的不读）：' + sig(r2));
ok(r2.outside === 3, '2 外面的废话数了 3 行：' + r2.outside);
// 3. 只复制了代码块里面
ok(sig(AI.parseReply([HEAD].concat(ITEMS).join('\n'), CTX)) === WANT, '3 只复制了代码块里面那几行：认');
// 4. 理由里带 |
const r4 = AI.parseReply([HEAD, '#2 | 分类 | 零食 | 便利店 | 饮料，A|B 两种都像'].join('\n'), CTX);
ok(r4.ok && r4.items[0].value === '零食' && r4.items[0].why === '便利店 | 饮料，A|B 两种都像', '4 理由里带 |：只按前 3 个竖线切，后面原样算理由：' + (r4.items && r4.items[0] && r4.items[0].why));
// 5. 全角 ＃ ｜、行首空格、列表符号、Windows 换行
const r5 = AI.parseReply(['  ' + HEAD, '- ＃2 ｜ 分类 ｜ 零食 ｜ a', '* #6｜口径｜不计入｜b', '   #3 | 标记 | 可能重复 ＃1 | c'].join('\r\n'), CTX);
ok(sig(r5) === WANT && !r5.bad.length, '5 全角 ＃｜、行首空格、「- 」「* 」、Windows 换行：都认：' + sig(r5));
const r5b = AI.parseReply(['```记问', '- ' + HEAD, '- ＃2 ｜ 分类 ｜ 零食 ｜ a', '```'].join('\r\n'), CTX);
ok(r5b.ok && r5b.items.length === 1, '5 围栏里的列表符号、全角符号也认');
const r5c = AI.parseReply(['**' + HEAD + '**', '#2 | 分类 | 零食 | a'].join('\n'), CTX);
ok(r5c.ok && r5c.items.length === 1, '5 开头那一行被加粗（**…**）也认');
// 6. AI 在前后加废话、中间夹空行
const r6 = AI.parseReply(['下面是建议', HEAD, '', ITEMS[0], '', ITEMS[1], '', '', '祝记账愉快！'].join('\n'), CTX);
ok(r6.ok && r6.items.length === 2, '6 条目之间夹空行：照读，废话停');
// 7. 一份回复里有两段（没有围栏）
const r7 = AI.parseReply(['第一段：', HEAD, ITEMS[0], '第二段：', HEAD, ITEMS[1], ITEMS[2], '完'].join('\n'), CTX);
ok(sig(r7) === WANT && !r7.bad.length, '7 两段（各有开头那一行）：都认：' + sig(r7));
// 遇到 ``` 就停
const r7b = AI.parseReply([HEAD, ITEMS[0], '```', ITEMS[1]].join('\n'), CTX);
ok(r7b.ok && r7b.items.length === 1, '7 遇到 ``` 就停');
// 8. 找不到开头那一行 → noblock（界面上写「没找到记问的修改建议，请把 AI 的整段回复复制过来」）
ok(AI.parseReply(ITEMS.join('\n'), CTX).why === 'noblock', '8 只复制了条目、没有开头那一行：找不到，整份不认');
ok(AI.parseReply('我觉得都挺好的。', CTX).why === 'noblock', '8 没有任何建议：找不到');
// 9. 批次号、导出时间照旧要对得上
ok(AI.parseReply([HEAD.replace('b77', 'b78')].concat(ITEMS).join('\n'), CTX).why === 'batch', '9 没围栏时批次号对不上：整份拒收');
ok(AI.parseReply([HEAD.replace('10:00:00', '11:00:00')].concat(ITEMS).join('\n'), CTX).why === 'time', '9 没围栏时导出时间对不上：整份拒收');
console.log(`${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
