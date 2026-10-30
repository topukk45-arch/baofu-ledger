// 生成给 README「体验提示」用的两份虚构样例账单（一个月：2026 年 10 月），放进 docs/samples/。
//   微信 xlsx + 支付宝 CSV，表头、开头说明的结构照真实账单（tests/helpers/bills.js），内容全是编的：
//   个人对方的名字是编的，商户用的是全国性的公开品牌（演示分类推荐）。
//   用法：node tests/tools/make-demo-bills.js
const fs = require('fs'), path = require('path');
const B = require('../helpers/bills');

const OUT = path.join(__dirname, '..', '..', 'docs', 'samples');
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi, s: (seq * 7) % 60 });
const wxNo = () => '4200000' + String(1000 + (++seq)).padStart(4, '0') + '20261000000000' + String(seq).padStart(5, '0');
const aliNo = () => '2026100022001' + String(4000000 + (++seq)).padStart(9, '0') + String(seq).padStart(6, '0');

// ---------- 微信 ----------
const wx = o => B.txn(Object.assign({ kind: '商户消费', desc: '/', io: 'expense', pm: '零钱', status: '支付成功', mno: '', acct: '', remark: '/' }, o, { no: wxNo() }));
const W = [];
// 工作日中午的面馆（规律：工作日、12 点前后、每笔 15~25 元）
[1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27].forEach((d, i) =>
  W.push(wx({ time: T(d, 12, 5 + (i * 7) % 40), cp: '老街牛肉面馆', desc: '堂食', fen: 1500 + (i * 330) % 1000 })));
// 早餐便利店
[1, 2, 6, 8, 9, 13, 15, 20, 22, 27].forEach((d, i) => W.push(wx({ time: T(d, 8, 10 + i), cp: '晨光便利店', desc: '早餐', fen: 600 + (i * 90) % 500 })));
// 美团外卖、滴滴
[3, 10, 17, 24, 25].forEach((d, i) => W.push(wx({ time: T(d, 19, 20 + i), cp: '美团', desc: '美团外卖订单', fen: 3200 + i * 450 })));
[4, 11, 18, 26].forEach((d, i) => W.push(wx({ time: T(d, 22, 10 + i), cp: '滴滴出行', desc: '快车', fen: 2300 + i * 380 })));
// 话费（中国移动）、每月固定的会员
W.push(wx({ time: T(5, 9, 30), cp: '中国移动', desc: '话费充值', fen: 10000 }));
W.push(wx({ time: T(12, 0, 3), cp: '腾讯视频', desc: '腾讯视频VIP会员-自动续费', fen: 2500 }));
// 个人：房租（每月固定）、给朋友转账、AA 饭钱
W.push(wx({ time: T(1, 10, 0), kind: '转账', cp: '房东王*', desc: '/', fen: 280000, status: '对方已收钱' }));
W.push(wx({ time: T(9, 21, 15), kind: '转账', cp: '周*', desc: '/', fen: 5000, status: '对方已收钱' }));
W.push(wx({ time: T(17, 20, 40), kind: '转账', cp: '周*', desc: '/', io: 'income', fen: 8600, status: '已收钱' }));
// 群红包、发出的红包
W.push(wx({ time: T(6, 20, 0), kind: '微信红包', cp: '发出群红包', desc: '/', fen: 2000, status: '支付成功' }));
W.push(wx({ time: T(20, 18, 30), kind: '微信红包', cp: '发给小林', desc: '/', fen: 6600, status: '支付成功' }));
// 一笔退款：外卖退了一半
const meal = wx({ time: T(25, 12, 40), cp: '美团', desc: '美团外卖订单', fen: 4800, status: '已退款¥24.00' });
W.push(meal);
W.push(B.txn({ time: T(25, 13, 5), kind: '商户消费-退款', cp: '美团', desc: '美团外卖订单', io: 'income', fen: 2400, pm: '零钱', status: '已全额退款', no: meal.no + '_1', remark: '/' }));
// 0 元：会员试用
W.push(wx({ time: T(14, 9, 0), cp: '腾讯视频', desc: '腾讯视频VIP会员-试用', fen: 0 }));

// ---------- 支付宝 ----------
const ali = o => B.txn(Object.assign({ desc: '', io: 'expense', pm: '花呗', status: '交易成功', mno: '', acct: '', remark: '' }, o, { no: aliNo() }));
const A = [];
// 工资
A.push(ali({ time: T(10, 9, 0), kind: '收入', cp: '某某科技有限公司', desc: '工资', io: 'income', fen: 1200000, pm: '余额' }));
// 超市、淘宝
[4, 11, 18, 25].forEach((d, i) => A.push(ali({ time: T(d, 15, 30 + i), kind: '日用百货', cp: '盒马', desc: '盒马鲜生', fen: 8600 + i * 1270 })));
A.push(ali({ time: T(7, 21, 12), kind: '日用百货', cp: '淘宝', desc: '洗衣液 2kg 家庭装', fen: 3990 }));
A.push(ali({ time: T(16, 22, 30), kind: '服饰装扮', cp: '淘宝', desc: '秋季薄款外套', fen: 15900 }));
// 地铁（每天）、共享单车
[1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27].forEach((d, i) =>
  A.push(ali({ time: T(d, 8 + (i % 2), 40 + i % 15), kind: '交通出行', cp: '杭州地铁', desc: '地铁乘车', fen: 400 + (i % 3) * 100, pm: '余额' })));
[3, 17].forEach((d, i) => A.push(ali({ time: T(d, 18, 0 + i), kind: '交通出行', cp: '哈啰出行', desc: '单车骑行', fen: 150 })));
// 水电燃气
A.push(ali({ time: T(15, 10, 20), kind: '生活缴费', cp: '国网浙江省电力有限公司', desc: '电费', fen: 18630, pm: '余额' }));
// 个人收钱码
A.push(ali({ time: T(8, 7, 50), kind: '商业服务', cp: '陈*', desc: '收钱码收款', fen: 1200 }));
A.push(ali({ time: T(22, 7, 55), kind: '商业服务', cp: '陈*', desc: '收钱码收款', fen: 1200 }));
// 淘宝退款（外套退货）
const coat = A.find(t => t.desc === '秋季薄款外套');
A.push(B.txn({ time: T(19, 11, 0), kind: '服饰装扮', cp: '淘宝', desc: '退款-秋季薄款外套', io: 'neutral', fen: 15900, pm: '花呗', status: '退款成功', no: coat.no + '_1', remark: '' }));
coat.status = '退款成功';

fs.mkdirSync(OUT, { recursive: true });
const wxFile = B.bill('wechat', W, { format: 'xlsx', range: { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' } });
const aliFile = B.bill('alipay', A, { range: { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' } });
fs.writeFileSync(path.join(OUT, '微信支付账单（虚构样例）.xlsx'), wxFile.bytes);
fs.writeFileSync(path.join(OUT, '支付宝交易明细（虚构样例）.csv'), aliFile.bytes);
console.log('微信 ' + W.length + ' 笔，支付宝 ' + A.length + ' 笔 → ' + OUT);
module.exports = { W, A };
