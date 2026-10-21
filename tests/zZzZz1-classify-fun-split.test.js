// 1021-T21（实测 10-21 第 11 条）推出来是「文化休闲」的再拆：游戏词 / 游戏平台和渠道名 → 游戏，网盘、视频、音乐会员这类 → 会员订阅，剩下的才是文化休闲；
// 没有同名分类的落进原来的娱乐类分类，再没有就是新建分类建议（新用户默认建）。node zZzZz1-classify-fun-split.test.js [index.html]。数据虚构。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const C = require(path.join(IMP, 'classify.js'));
const M = require(path.join(IMP, 'merchants.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const ali = (cp, desc) => ({ app: 'alipay', cp, desc, kind: '文化休闲', io: 'expense' });
const rows = [ali('某虚构网络科技', 'Steam 钱包充值'), ali('网易', '某虚构游戏 首充'), ali('某虚构科技有限公司', '渠道测试 订单1'), ali('某虚构网咖', '刷卡'),
  ali('百度网盘', '超级会员 连续包月'), ali('哔哩哔哩', '大会员'), ali('某虚构视频', '自动续费'), ali('某虚构影城', '电影票'), ali('某虚构书店', '书')];
const r1 = C.classify(rows, { cats: ['未分类', '餐饮'], merchants: M, isNewUser: true });
const w = r1.recs.map(x => x.newCat || x.cat);
ok(w.slice(0, 4).every(x => x === '游戏'), '1 Steam、网易游戏、渠道测试、网咖 → 游戏：' + w.join(','));
ok(w.slice(4, 7).every(x => x === '会员订阅'), '1 网盘、B 站大会员、自动续费 → 会员订阅');
ok(w.slice(7).every(x => x === '文化休闲'), '1 电影、书店照旧文化休闲');
ok(['游戏', '会员订阅', '文化休闲'].every(n => r1.newCats.some(c => c.name === n)), '1 新建分类建议：游戏、会员订阅、文化休闲各一个：' + r1.newCats.map(c => c.name + c.count).join('、'));
const r2 = C.classify(rows, { cats: ['未分类', '娱乐'], merchants: M });
ok(r2.recs.every(x => x.cat === '娱乐'), '2 存档里只有「娱乐」：三类都落「娱乐」，不新建');
const r3 = C.classify(rows, { cats: ['未分类', '游戏'], merchants: M });
ok(r3.recs[0].cat === '游戏' && r3.recs[4].newCat === '会员订阅' && r3.recs[7].cat === '游戏', '3 存档里有「游戏」：游戏落游戏；会员订阅不落游戏（新建建议）；文化休闲照旧同义落游戏');
ok(/拆开文化休闲/.test(r1.recs[0].reason), '4 理由写怎么拆的：' + r1.recs[0].reason);
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
