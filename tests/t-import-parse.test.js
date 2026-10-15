// 1015-C 账单导入第一期 ③ 解析。node t-import-parse.test.js [index.html]
// 纯计算：直接 require www/import/parse.js，不用 jsdom。测试账单全是虚构的（tests/helpers/bills.js 生成，表头结构照真实账单）。
const path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'parse.js'));
const B = require('./helpers/bills');
const { makeFakeWorker } = require('./helpers/import-files');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const ms = () => Number(process.hrtime.bigint() / 1000000n);
const one = (bytes, name) => P.parseFiles([{ name: name || '账单', data: B.ab(bytes) }]).files[0];
const units = f => f.rows.reduce((s, r) => s + r.merged, 0) + f.errors.length + f.dups.length;
const fenSum = f => f.rows.reduce((s, r) => s + r.fen, 0) + f.dups.reduce((s, d) => s + d.fen, 0);
const T = (d, h, mi, s, mo) => ({ y: 2026, mo: mo || 9, d, h, mi, s });
// 一组虚构交易：收入、支出、不计收支都有，商品说明里有逗号、引号
function sample(app) {
  const no = (k) => app === 'alipay' ? '20260901220014' + String(k).padStart(14, '0') : '4200001234' + '20260901' + String(k).padStart(14, '0');
  return [
    B.txn({ time: T(1, 8, 10, 22), kind: app === 'alipay' ? '餐饮美食' : '商户消费', cp: '青禾便利', desc: '早餐', fen: 650, no: no(1), mno: 'M0001' }),
    B.txn({ time: T(2, 9, 20, 11), kind: app === 'alipay' ? '餐饮美食' : '商户消费', cp: '云杉咖啡', desc: '拿铁, 大杯 "加浓"', fen: 1800, pm: '某银行储蓄卡', no: no(2) }),
    B.txn({ time: T(5, 12, 0, 0), kind: app === 'alipay' ? '转账红包' : '转账', cp: '某同事', desc: '饭钱', io: 'income', fen: 10000, no: no(3) }),
    B.txn({ time: T(6, 21, 5, 59), kind: app === 'alipay' ? '投资理财' : '零钱通', cp: '余额宝', desc: '转入', io: 'neutral', fen: 1000, no: no(4) }),
    B.txn({ time: T(30, 23, 59, 30), kind: app === 'alipay' ? '日用百货' : '商户消费', cp: '橘子超市', desc: '', fen: 123456, pm: '花呗', no: no(5), remark: '虚构备注' }),
  ];
}
const pick = r => ({ time: r.time, sec: r.sec, fen: r.fen, io: r.io, cp: r.cp, desc: r.desc, pm: r.pm, no: r.no, status: r.status, kind: r.kind, remark: r.remark });
const expectRows = (txns, app) => txns.map(t => ({ time: `2026-${String(t.time.mo).padStart(2, '0')}-${String(t.time.d).padStart(2, '0')}T${String(t.time.h).padStart(2, '0')}:${String(t.time.mi).padStart(2, '0')}`,
  sec: t.time.s, fen: t.fen, io: t.io, cp: t.cp, desc: t.desc, pm: t.pm, no: t.no, status: t.status, kind: t.kind, remark: t.remark }));

(async () => {

// ===== 1. 小零件 =====
{
  const s = P._splitCsv('a,"b,c",d\r\n"x\r\ny","说""好""",\r\n\r\n"没合上的引号\nlast');
  ok(JSON.stringify(s.map(r => r.f)) === JSON.stringify([['a', 'b,c', 'd'], ['x\r\ny', '说"好"', ''], [''], ['没合上的引号\nlast']]), '1 CSV：引号里的逗号、换行、两个引号、末尾逗号、引号没合上：' + JSON.stringify(s.map(r => r.f)));
  ok(JSON.stringify(s.map(r => r.line)) === '[1,2,4,5]', '1 每条记录从第几行开始算得对（引号里的换行也算行）');
  ok(P._splitCsv('a\rb\nc').length === 3 && P._splitCsv('').length === 0, '1 单独的 \\r 也算换行；空文本没有记录');
  const enc = s2 => new Uint8Array(Buffer.from(s2));
  ok(P._decodeText(enc('﻿交易时间')).text === '交易时间' && P._decodeText(enc('﻿交易时间')).encoding === 'utf-8', '1 UTF-8 去 BOM');
  ok(P._decodeText(require('./helpers/gbk').encode('交易时间,收/支')).encoding === 'gb18030', '1 不是合法 UTF-8 的按 GB18030 解');
  const tt = s2 => { const r = P._parseTimeText(s2); return r ? r.date + ' ' + r.hm + (r.sec === null ? '' : ':' + r.sec) : null; };
  ok(tt('2026-10-15 17:22:05') === '2026-10-15 17:22:5' && tt('2026-10-15 17:22') === '2026-10-15 17:22' && tt('2026/10/15 17:22') === '2026-10-15 17:22'
    && tt('2026/1/5 7:02') === '2026-01-05 07:02' && tt('2026-10-15T17:22:05') === '2026-10-15 17:22:5' && tt('2026.10.15 17:22') === '2026-10-15 17:22', '1 时间：几种写法都认');
  ok(tt('2026-02-30 10:00') === null && tt('2026-13-01 10:00') === null && tt('2026-10-15') === null && tt('10/15/2026 17:22') === null && tt('2026-10-15 24:00') === null && tt('abc') === null, '1 时间：不存在的日子、没有时分、美式写法、乱写都不认');
  const st = (v, d) => { const r = P._serialToTime(v, d); return r ? r.date + ' ' + r.hm + ':' + r.sec : null; };
  ok(st(46310.7236111111, false) === '2026-10-15 17:22:0' && st(44848.7236111111, true) === '2026-10-15 17:22:0', '1 Excel 日期序列号：1900 制、1904 制都换算成 2026-10-15 17:22');
  ok(st(46022.99999999, false) === '2026-01-01 00:00:0' && st(45351, false) === '2024-02-29 00:00:0', '1 序列号：差一点到整天的进到第二天；闰年 2 月 29 日对');
  ok(st(60, false) === null && st(-1, false) === null && st('x', false) === null, '1 序列号：Lotus 闰年错误那天以前、负数、不是数都不认');
  ok(P._parseFen('¥1,234.50') === 123450 && P._parseFen('￥0.29') === 29 && P._parseFen('12.300000000000001') === 1230 && P._parseFen('3') === 300 && P._parseFen('1，000.00') === 100000,
    '1 金额：去 ¥ / ￥ / 千分位（半角全角）转分，表格里的浮点尾巴去掉');
  ok(P._parseFen('1.234') === null && P._parseFen('-5.00') === null && P._parseFen('') === null && P._parseFen('abc') === null, '1 金额：三位小数、负数、空、乱写不认');
  const sn = P._splitNo;
  ok(JSON.stringify(sn('2026090122001400000000000001')) === JSON.stringify({ no: '2026090122001400000000000001', noRest: '', note: '' }), '1 单号：普通单号原样');
  ok(JSON.stringify(sn('2026090122001400000000000001_8812')) === JSON.stringify({ no: '2026090122001400000000000001', noRest: '_8812', note: '' }), '1 单号：后面接单号样的后缀（如退款号）算单号的一部分');
  ok(JSON.stringify(sn('4200001234 USD 12.30')) === JSON.stringify({ no: '4200001234', noRest: '', note: 'USD 12.30' }) && sn('4200001234（外币 12.30 美元）').note === '（外币 12.30 美元）', '1 单号：后面接外币说明一类的文字，挪进备注');
  ok(sn('').no === '' && sn('/').no === '' && sn('/').note === '/', '1 单号：没有单号');
}

// ===== 2. 正常账单：两家、CSV / xlsx、各种编码，读出来一样 =====
for (const app of ['alipay', 'wechat']) {
  const tx = sample(app), want = JSON.stringify(expectRows(tx, app));
  const variants = [['CSV UTF-8', {}], ['CSV 带 BOM', { encoding: 'bom' }], ['xlsx', { format: 'xlsx' }], ['xlsx 1904 日期制', { format: 'xlsx', d1904: true }], ['xlsx 时间是文字', { format: 'xlsx', timeAsText: true }]];
  if (app === 'alipay') variants.push(['CSV GBK', { encoding: 'gbk' }]);
  for (const [nm, opt] of variants) {
    const f = one(B.bill(app, tx, opt).bytes, nm);
    ok(!f.fatal, `2 ${app} ${nm}：认出来了 ${f.fatal ? f.fatal.msg : ''}`);
    if (f.fatal) continue;
    ok(f.app === app && f.format === (opt.format || 'csv'), `2 ${app} ${nm}：来源 ${f.app}、格式 ${f.format}`);
    ok(JSON.stringify(f.rows.map(pick)) === want, `2 ${app} ${nm}：5 行内容都对\n    读到 ${JSON.stringify(f.rows.map(pick))}\n    应为 ${want}`);
    ok(f.errors.length === 0 && f.dups.length === 0 && f.stats.countOk === true && units(f) === 5, `2 ${app} ${nm}：没有出错行，笔数和头部一致`);
    ok(f.stats.header.total === 5 && f.stats.header.income.n === 1 && f.stats.header.expense.fen === 650 + 1800 + 123456 && f.stats.header.neutral.n === 1, `2 ${app} ${nm}：头部统计读对`);
    ok(f.stats.parsed.expense.fen === f.stats.header.expense.fen && f.stats.parsed.income.fen === 10000, `2 ${app} ${nm}：明细合计和头部金额一致`);
    ok(f.range && f.range.from === '2026-09-01 00:00:00' && f.range.to === '2026-09-30 23:59:59', `2 ${app} ${nm}：起止时间`);
    ok(f.header[0] === '交易时间' && !f.rows.some(r => /\t|\s$/.test(r.no + r.cp + r.pm)), `2 ${app} ${nm}：字段末尾的制表符、空白去掉了`);
    ok(f.encoding === (opt.encoding === 'gbk' ? 'gb18030' : 'utf-8'), `2 ${app} ${nm}：编码 ${f.encoding}`);
  }
}
{
  // 1904 日期制：同一份账单两种日期制读出的时间完全一样（不会悄悄偏四年）
  const tx = sample('wechat');
  const a = one(B.bill('wechat', tx, { format: 'xlsx' }).bytes), b = one(B.bill('wechat', tx, { format: 'xlsx', d1904: true }).bytes);
  ok(JSON.stringify(a.rows.map(r => r.time + r.sec)) === JSON.stringify(b.rows.map(r => r.time + r.sec)) && b.rows[0].time === '2026-09-01T08:10', '2 1904 日期制的 xlsx 时间和 1900 制一样，没有偏四年');
  // 1904 制的文件如果被当成 1900 制读，会差 1462 天：拿它反证测试本身有效
  const wrong = P._serialToTime(B.serial(tx[0].time, true), false);
  ok(wrong && wrong.date === '2022-08-31', '2 （反证）1904 的序列号按 1900 制算会差四年：' + (wrong && wrong.date));
}

// ===== 3. 坏样本 =====
const tAli = sample('alipay'), tWx = sample('wechat');
const csvOf = (app, opt) => B.bill(app, app === 'alipay' ? tAli : tWx, opt);
{
  // Excel 另存过：时间变成 2026/9/1 8:10（没有秒）
  const f = one(csvOf('alipay', { encoding: 'gbk', timeFmt: t => `${t.y}/${t.mo}/${t.d} ${t.h}:${String(t.mi).padStart(2, '0')}` }).bytes);
  ok(!f.fatal && f.rows.length === 5 && f.rows[0].time === '2026-09-01T08:10' && f.rows[0].sec === null && f.stats.countOk, '3 Excel 改过的时间（斜杠、没秒）照样读');
  ok(f.rows[4].time === '2026-09-30T23:59' && f.errors.length === 0, '3 没有秒的时间按分钟和起止时间比（23:59 不算超出）');
  // 科学计数法
  for (const [col, edit] of [['交易订单号', s => s.replace('"2026090122001400000000000001\t"', '2.02609E+27')], ['商家订单号', s => s.replace('"M0001\t"', '1.2E+15')]]) {
    const g = one(csvOf('alipay', { edit }).bytes);
    ok(g.fatal && g.fatal.code === 'excel' && g.fatal.msg.includes('Excel') && g.fatal.header.length === 12, '3 ' + col + '出现科学计数法：整份报「被 Excel 另存过」');
  }
  const wsci = one(csvOf('wechat', { edit: s => s.replace(/4200001234202609010000000000000\d\t/, '4.20000E+27') }).bytes);
  ok(wsci.fatal && wsci.fatal.code === 'excel', '3 微信交易单号的科学计数法也拦');
  const rsci = one(csvOf('alipay', { edit: s => s.replace('虚构备注', '1.5E+3') }).bytes);
  ok(!rsci.fatal && rsci.rows[4].remark === '1.5E+3', '3 备注里像科学计数法的字不管（只查两列单号）');
  // 列顺序变
  const hdr = B.HDR.alipay.slice().reverse();
  const r1 = one(B.bill('alipay', tAli, { header: hdr }).bytes);
  ok(!r1.fatal && JSON.stringify(r1.rows.map(pick)) === JSON.stringify(expectRows(tAli)), '3 列顺序变了，按列名照样取对');
  // 少一列
  const r2 = one(B.bill('wechat', tWx, { header: B.HDR.wechat.filter(h => h !== '备注' && h !== '商户单号') }).bytes);
  ok(!r2.fatal && r2.rows.length === 5 && r2.rows[4].remark === '' && r2.stats.countOk, '3 少了「备注」「商户单号」照样读');
  const r3 = one(B.bill('wechat', tWx, { header: B.HDR.wechat.filter(h => h !== '金额(元)') }).bytes);
  ok(r3.fatal && r3.fatal.code === 'noheader', '3 少了金额：找不到表头');
  const r3b = one(B.bill('alipay', tAli, { header: B.HDR.alipay.map(h => h === '交易时间' ? '时间' : h) }).bytes);
  ok(r3b.fatal && r3b.fatal.msg.includes('不是能识别'), '3 「交易时间」改了名：不是能识别的账单');
  // 中间空行
  const r4 = one(csvOf('alipay', { edit: s => { const L = s.split('\r\n'); L.splice(25, 0, '', ',,,,,,,,,,,,'); return L.join('\r\n'); } }).bytes);
  ok(!r4.fatal && r4.rows.length === 5 && r4.errors.length === 0 && r4.stats.countOk, '3 中间的空行（含全是逗号的行）跳过');
  // 表头改名（换成常见的别名写法）
  const ren = { '金额(元)': '金额（元）', 商品: '商品名称', 当前状态: '交易状态', 支付方式: '收付款方式' };
  const r5 = one(B.bill('wechat', tWx, { rename: ren }).bytes);
  ok(!r5.fatal && r5.rows.length === 5 && r5.rows[1].desc === tWx[1].desc && r5.rows[1].pm === tWx[1].pm && r5.rows[0].status === '交易成功', '3 表头换成别名（全角括号、商品名称、交易状态、收付款方式）照样认');
  // 带引号的换行：原文保留（换成空格留到入账时做）
  const tq = tAli.map((t, i) => i === 1 ? Object.assign({}, t, { desc: '拿铁\r\n大杯', remark: '第一行\n第二行' }) : t);
  const r6 = one(B.bill('alipay', tq).bytes);
  ok(!r6.fatal && r6.rows.length === 5 && r6.rows[1].desc === '拿铁\r\n大杯' && r6.rows[1].remark === '第一行\n第二行' && r6.stats.countOk, '3 带引号的换行：不错行，换行原样保留');
  ok(r6.rows[2].line === r6.rows[1].line + 3, '3 带引号的换行：后面的行号跟着往后数');
}
{
  // 不带引号的换行：商家没加引号，一行被拆成两行 → 拼回
  const broken = s => s.replace('早餐 ,', '早\r\n餐 ,');                     // 断在商品说明（中间的列）
  const f = one(csvOf('alipay', { edit: broken }).bytes);
  ok(!f.fatal && f.rows.length === 5 && f.errors.length === 0 && f.stats.countOk, '3 不带引号的换行（断在中间列）：拼回，笔数对得上');
  const j = f.rows[0];
  ok(j.joined === true && j.lines.length === 2 && j.lines[1] === j.lines[0] + 1 && j.desc === '早\n餐' && j.fen === 650 && j.no === tAli[0].no, '3 拼回的行打了标记、记下两行行号，换行原样保留：' + JSON.stringify(j));
  const g = one(csvOf('alipay', { edit: s => s.replace('虚构备注 ,', '虚构\r\n备注 ,') }).bytes);     // 断在备注（最后几列）：上一半自己也能读通
  ok(!g.fatal && g.rows.length === 5 && g.errors.length === 0 && g.rows[4].joined && g.rows[4].remark === '虚构\n备注' && g.stats.countOk, '3 不带引号的换行（断在最后几列）：和上一行拼回');
  const w = one(csvOf('wechat', { edit: s => s.replace('早餐,', '早\n餐,') }).bytes);
  ok(!w.fatal && w.rows[0].joined && w.rows[0].desc === '早\n餐' && w.stats.countOk, '3 微信的不带引号换行也拼回');
  // 拼不通：断开的那一格里还多了一个逗号，两半加起来列数不对 → 进出错，笔数对不上 → 拦住
  const h = one(csvOf('alipay', { edit: s => s.replace('橘子超市 ,', '橘子,\r\n超市 ,') }).bytes);
  ok(!h.fatal && h.errors.length === 2 && h.rows.length === 4 && h.stats.countOk === false && h.blocking === true, '3 拼不通的进出错（两半各一条），笔数对不上，整份拦住');
  const h3 = one(csvOf('alipay', { edit: s => s.replace('早餐 ,', '早,\r\n餐 ,') }).bytes);
  ok(h3.fatal && h3.fatal.code === 'columns', '3 拼不通的出在前 3 行：整份报不是能识别的账单');
  ok(h.errors.every(e => e.msg && e.raw.length) && units(h) === 6, '3 出错行带原因和原始字段');
}
{
  // 同单号多行
  const tx = tAli.slice(0, 2).concat([Object.assign({}, tAli[1], { pm: '余额宝', fen: 200 })]).concat(tAli.slice(2));
  const f = one(B.bill('alipay', tx).bytes);
  const m = f.rows.find(r => r.no === tAli[1].no);
  ok(!f.fatal && f.rows.length === 5 && m.merged === 2 && m.fen === 2000 && m.pm === '某银行储蓄卡&余额宝' && m.lines.length === 2 && m.lines[1] === m.lines[0] + 1, '3 同单号两行、支付方式不同：合成一条，金额相加，支付方式用 & 连起来');
  ok(f.stats.countOk && units(f) === 6, '3 合成一条以后笔数照旧对得上（头部按两行算）');
  const d = one(B.bill('alipay', tAli.concat([tAli[0]])).bytes);
  ok(d.rows.length === 5 && d.dups.length === 1 && d.dups[0].why === 'same' && d.stats.countOk, '3 完全一样的两行：留一条，另一条算重复');
  // 退款：单号开头一样、后缀不同、收支不同 → 不合并
  const rf = tAli.concat([Object.assign({}, tAli[4], { io: 'income', kind: '退款', fen: 456, no: tAli[4].no + '_77', time: T(30, 23, 59, 50) })]);
  const r = one(B.bill('alipay', rf).bytes);
  ok(r.rows.length === 6 && r.rows[5].no === tAli[4].no && r.rows[5].noRest === '_77' && r.rows[5].io === 'income', '3 退款单号带后缀：单独一条，后缀留在 noRest');
  // 同单号但收支不同、或者不在同一分钟：都不合并
  const nm = one(B.bill('alipay', tAli.concat([Object.assign({}, tAli[0], { time: T(1, 8, 11, 0), pm: '花呗' })])).bytes);
  ok(nm.rows.length === 6 && nm.rows.every(x => x.merged === 1), '3 同单号但不在同一分钟：不合并');
}
{
  // 两份重叠的文件：9 月 1–20 日和 9 月 10–30 日
  const all = []; for (let d = 1; d <= 30; d++) all.push(B.txn({ time: T(d, 12, 0, 0), fen: 100 * d, no: '2026090122001400000000' + String(d).padStart(6, '0'), cp: '虚构商户' + d }));
  const a = B.bill('alipay', all.slice(0, 20), { range: { from: '2026-09-01 00:00:00', to: '2026-09-20 23:59:59' } });
  const b = B.bill('alipay', all.slice(9), { range: { from: '2026-09-10 00:00:00', to: '2026-09-30 23:59:59' } });
  const r = P.parseFiles([{ name: '9月上.csv', data: B.ab(a.bytes) }, { name: '9月下.csv', data: B.ab(b.bytes) }]).files;
  ok(r[0].rows.length === 20 && r[1].rows.length === 10 && r[1].dups.length === 11, '3 两份重叠：后一份里重复的 11 笔挪进 dups');
  ok(r[1].dups.every(d => d.inFile === '9月上.csv' && d.why === 'otherfile'), '3 记下是和哪份文件重复');
  ok(r[0].stats.countOk && r[1].stats.countOk && units(r[1]) === 21, '3 两份各自和自己的头部核笔数，都对得上');
  ok(r.reduce((s, f) => s + f.rows.reduce((x, y) => x + y.fen, 0), 0) === all.reduce((s, t) => s + t.fen, 0), '3 两份合起来金额正好是 30 天的总和');
  // 微信和支付宝同一个单号不算重复（来源不同）
  const w = B.bill('wechat', [B.txn({ time: T(1, 12, 0, 0), fen: 100, no: all[0].no })]);
  const rw = P.parseFiles([{ name: 'a', data: B.ab(a.bytes) }, { name: 'w', data: B.ab(w.bytes) }]).files;
  ok(rw[1].rows.length === 1 && rw[1].dups.length === 0, '3 不同来源的同号不算重复');
}
{
  // 认不出来的
  const unk = one(new Uint8Array(Buffer.from('交易时间,收/支,金额,说明\r\n2026-09-01 08:00:00,支出,1.00,虚构\r\n')));
  ok(unk.fatal && unk.fatal.code === 'unknown' && unk.fatal.msg.includes('不是能识别') && JSON.stringify(unk.fatal.header) === '["交易时间","收/支","金额","说明"]', '3 认不出来源：报不是能识别的账单，带上读到的表头');
  const noh = one(new Uint8Array(Buffer.from('姓名,电话\r\n张三,123\r\n')));
  ok(noh.fatal && noh.fatal.code === 'noheader', '3 找不到表头：报不是能识别的账单');
  const col = one(csvOf('alipay', { edit: s => s.replace('早餐 ,', '早餐 ,多,出,来,') }).bytes);
  ok(col.fatal && col.fatal.code === 'columns' && col.fatal.header.length === 12, '3 前 3 行有列数比表头多的：报不是能识别的账单');
  const late = tAli.concat(tAli.map((t, i) => Object.assign({}, t, { no: t.no + '9' + i })));
  const col2 = one(B.bill('alipay', late, { edit: s => s.replace(late[8].cp + ' ,', late[8].cp + ' ,多,出,') }).bytes);
  ok(!col2.fatal && col2.errors.length === 1 && col2.errors[0].code === 'columns' && col2.blocking === false && col2.stats.countOk, '3 第 3 行以后中间多出两列（末尾几列正好是空的）：只这一行进出错、报列数不对，笔数照样守恒：' + JSON.stringify(col2.errors.map(e => e.code + ' ' + e.msg)));
  // 压缩包
  const enc = one(B.zip([['账单.xlsx', 'xxx']], { encrypted: true }));
  ok(enc.fatal && enc.fatal.code === 'encrypted' && enc.fatal.msg.includes('密码'), '3 带密码的压缩包：提示先解压');
  const zipd = one(B.zip([['微信支付账单.xlsx', 'xxx']]));
  ok(zipd.fatal && zipd.fatal.code === 'zip' && zipd.fatal.msg.includes('解压'), '3 不是 xlsx 的压缩包：提示先解压');
  const bad = one(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]));
  ok(bad.fatal && bad.fatal.code === 'zip', '3 坏了的 xlsx：报读不出来');
  // 头部统计
  const cnt = one(csvOf('alipay', { statsOverride: { total: 6 } }).bytes);
  ok(cnt.stats.countOk === false && cnt.blocking === true && cnt.rows.length === 5, '3 笔数和头部对不上：标成不让直接导入，行照样给出来');
  const cat = one(csvOf('alipay', { statsOverride: { income: [2, 10000] } }).bytes);
  ok(cat.stats.countOk === true && cat.blocking === false && cat.stats.header.income.n === 2 && cat.stats.parsed.income.n === 1, '3 只有分类笔数对不上：不拦，只把两边的数给出来');
  const nost = one(csvOf('alipay', { edit: s => s.replace(/共\d+笔记录/, '') }).bytes);
  ok(nost.stats.countOk === null && nost.blocking === false, '3 头部没写总笔数：核不了，标成 null');
  // 逐行的错
  const er = one(csvOf('alipay', { edit: s => s.replace('6.50 ', '六块五').replace('1234.56 ', '').replace('收入 ', '收款 ').replace('2026-09-06 21:05:59', '2026-10-06 21:05:59') }).bytes);
  ok(JSON.stringify(er.errors.map(e => e.code)) === '["amount","io","range","amount"]', '3 金额读不出来、收支不认识、超出起止时间：各进出错：' + JSON.stringify(er.errors.map(e => e.code)));
  ok(er.errors[2].msg.includes('不在账单的起止时间里') && units(er) === 5 && er.stats.countOk, '3 出错的照样算笔数，守恒');
  // 5 万行上限
  const many = []; for (let i = 0; i < 50001; i++) many.push(B.txn({ time: T(1 + i % 28, 10, 0, 0), no: 'A' + i }));
  const big = one(B.bill('alipay', many).bytes);
  ok(big.fatal && big.fatal.code === 'toomany', '3 超过 5 万行：报太多');
  ok(one(new Uint8Array(8 * 1024 * 1024 + 1)).fatal.code === 'toolarge', '3 超过 8MB：报太大');
}

// ===== 4. 性质测试：上千份随机账单 =====
{
  let seed = 20261015;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const ri = n => Math.floor(rnd() * n);
  const CH = ['青禾', '云杉', '便利', '咖啡', ',', '"', ' ', '：', '（分店）', '早餐', 'A', '9', '¥', '\n', '\r\n', '/', '·'];
  const word = (utf8) => { let s = ''; const n = ri(6); for (let i = 0; i < n; i++) { const c = CH[ri(CH.length)]; if (!utf8 && c === '¥') continue; s += c; } return s.trim(); };
  let files = 0, bad = 0, notes = [];
  for (let k = 0; k < 1000; k++) {
    const app = rnd() < 0.5 ? 'alipay' : 'wechat';
    const fmt = rnd() < 0.3 ? 'xlsx' : 'csv';
    const encs = app === 'alipay' ? ['utf8', 'bom', 'gbk'] : ['utf8', 'bom'];
    const opt = fmt === 'xlsx' ? { format: 'xlsx', d1904: rnd() < 0.3 } : { encoding: encs[ri(encs.length)] };
    const utf8 = opt.encoding !== 'gbk';
    const n = ri(60), tx = [];
    for (let i = 0; i < n; i++) {
      const io = ['income', 'expense', 'expense', 'expense', 'neutral'][ri(5)];
      const t = { y: 2026, mo: 1 + ri(12), d: 1 + ri(28), h: ri(24), mi: ri(60), s: ri(60) };
      tx.push(B.txn({ time: t, io, fen: 1 + ri(rnd() < 0.1 ? 10000000 : 50000), cp: word(utf8) || '某商户', desc: word(utf8), remark: rnd() < 0.2 ? word(utf8) : '',
        pm: ['余额', '花呗', '某银行储蓄卡', ''][ri(4)], kind: ['餐饮美食', '日用百货', '转账红包'][ri(3)], status: '交易成功',
        no: (app === 'alipay' ? '2026' : '42000') + String(k).padStart(5, '0') + String(i).padStart(10, '0') + (rnd() < 0.05 ? '_' + ri(99) : '') }));
      // 偶尔来一笔同单号、同一分钟、另一种支付方式（组合支付）
      if (rnd() < 0.05) tx.push(Object.assign({}, tx[tx.length - 1], { pm: '红包', fen: 1 + ri(500) }));
    }
    const range = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
    const b = B.bill(app, tx, Object.assign({ range }, opt));
    const f = one(b.bytes, 'r' + k);
    files++;
    const totalFen = tx.reduce((s, t) => s + t.fen, 0);
    const good = !f.fatal && f.errors.length === 0 && units(f) === tx.length && fenSum(f) === totalFen && f.stats.countOk === true
      && ['income', 'expense', 'neutral'].every(io => f.stats.parsed[io].n === b.stats[io][0] && f.stats.parsed[io].fen === b.stats[io][1]);
    if (!good) { bad++; if (notes.length < 3) notes.push(`#${k} ${app} ${JSON.stringify(opt)} n=${tx.length} fatal=${f.fatal && f.fatal.msg} err=${JSON.stringify(f.errors.slice(0, 2))} units=${units(f)} fen=${fenSum(f)}/${totalFen}`); }
    // 再解析一遍结果一样
    if (k % 50 === 0) { const f2 = one(b.bytes, 'r' + k); if (JSON.stringify(f2) !== JSON.stringify(f)) { bad++; notes.push('#' + k + ' 两次解析结果不一样'); } }
  }
  ok(bad === 0, `4 ${files} 份随机账单：条数守恒、金额合计守恒、各类笔数和金额与头部一致 ${notes.join(' | ')}`);
}

// ===== 5. 5 万行耗时 =====
{
  const many = []; for (let i = 0; i < 50000; i++) many.push(B.txn({ time: T(1 + i % 28, i % 24, i % 60, i % 60), fen: 1 + i % 99999, cp: '虚构商户' + (i % 800), desc: i % 3 ? '虚构商品, 规格' + i : '', no: '2026090122001' + String(i).padStart(15, '0') }));
  const range = { from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59' };
  const cases = [['支付宝 CSV（GBK）', B.bill('alipay', many, { encoding: 'gbk', range })], ['微信 xlsx', B.bill('wechat', many, { format: 'xlsx', range })]];
  // 以前比的是毫秒（< 3 秒），机器忙时会偶发不过；改成数解码、解压了多少字节：每个文件 / 每个用到的压缩包成员只处理一遍
  const tinyPath = require.resolve(path.join(IMP, 'vendor', 'tiny-inflate.js'));
  require(tinyPath);
  const tinyOrig = require.cache[tinyPath].exports;
  let inflated = 0, decoded = 0;
  require.cache[tinyPath].exports = function (src, out) { const r = tinyOrig(src, out); inflated += r.length; return r; };
  const decOrig = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function (b) { const r = decOrig.apply(this, arguments); decoded += b ? b.byteLength : 0; return r; };   // 解码失败（抛错）的不算
  // 压缩包目录：各成员解压后的大小、名字长度
  const zipDir = u8 => { const b = Buffer.from(u8); let e = b.length - 22; while (b.readUInt32LE(e) !== 0x06054b50) e--;
    const n = b.readUInt16LE(e + 10); let off = b.readUInt32LE(e + 16); const out = [];
    for (let i = 0; i < n; i++) { const nl = b.readUInt16LE(off + 28); out.push({ name: b.slice(off + 46, off + 46 + nl).toString(), usize: b.readUInt32LE(off + 24), nl });
      off += 46 + nl + b.readUInt16LE(off + 30) + b.readUInt16LE(off + 32); } return out; };
  for (const [nm, b] of cases) {
    inflated = 0; decoded = 0;
    const t0 = ms(); const f = one(b.bytes); const el = ms() - t0;
    console.log(`    ${nm} 5 万行（${(b.bytes.length / 1048576).toFixed(1)}MB）解析 ${el}ms（只打印不比）`);
    ok(!f.fatal && f.rows.length === 50000 && f.stats.countOk, `5 ${nm} 5 万行都读出来了`);
    if (f.format === 'csv') ok(decoded === b.bytes.length && inflated === 0, `5 ${nm}：整份只解码一遍（解码 ${decoded} 字节，文件 ${b.bytes.length} 字节）`);
    else {
      const dir = zipDir(b.bytes), used = dir.filter(e => e.name !== '[Content_Types].xml');
      const want = used.reduce((s, e) => s + e.usize, 0), names = dir.reduce((s, e) => s + e.nl, 0);
      ok(inflated === want, `5 ${nm}：用到的压缩包成员各解压一遍（解压 ${inflated} 字节，应为 ${want}）`);
      ok(decoded === want + names, `5 ${nm}：解压出来的各解码一遍（解码 ${decoded} 字节，应为 ${want + names}，含成员名）`);
    }
  }
  require.cache[tinyPath].exports = tinyOrig;
  TextDecoder.prototype.decode = decOrig;
}

// ===== 7. 两家的退款样本（tests/fixtures/refund-samples.js，用户给的真实结构、虚构内容）=====
{
  const R = require('./fixtures/refund-samples');
  const ali = [['CSV', { noPad: true, range: R.range }], ['CSV GBK', { noPad: true, range: R.range, encoding: 'gbk' }],
               ['Excel 改过的时间', { noPad: true, range: R.range, timeFmt: R.excelTime }]];
  for (const [nm, opt] of ali) {
    const f = one(B.bill('alipay', R.alipay, opt).bytes);
    ok(!f.fatal && f.rows.length === 2 && f.errors.length === 0 && f.stats.countOk, '7 支付宝退款样本（' + nm + '）：两行都读出来，笔数对得上');
    const [o, r] = f.rows;
    ok(o.io === 'expense' && o.fen === 39600 && o.status === '交易成功' && o.no === '2026092922001400000000000001' && o.noRest === '', '7 支付宝（' + nm + '）：原单支出 396.00');
    ok(r.io === 'neutral' && r.fen === 39600 && r.status === '退款成功' && r.kind === '交通出行' && r.desc === '退款-火车票', '7 支付宝（' + nm + '）：退款行是不计收支、分类照旧是「交通出行」');
    ok(r.no === o.no && r.noRest === '_M20261004000000000001' && r.remark === '', '7 支付宝（' + nm + '）：退款单号开头就是原单号，后缀留在单号里（按开头能配原单、去重时和原单不撞）');
    ok(r.pm === '示例银行信用卡(1234)' && !/\t/.test(r.no + r.noRest + o.no), '7 支付宝（' + nm + '）：单号末尾的制表符去掉了');
    if (nm === 'Excel 改过的时间') ok(r.time === '2026-10-04T15:52' && r.sec === null && o.time === '2026-09-29T10:15', '7 支付宝 Excel 写法 2026/10/4 15:52（月日不补零、没秒）读对');
    else ok(r.time === '2026-10-04T15:52' && r.sec === 7, '7 支付宝（' + nm + '）：退款时间');
    ok(R.pairs.alipay[r.no + r.noRest] === o.no, '7 支付宝（' + nm + '）：读出的单号和第 ④ 版的预期配对对得上');
  }
  for (const fmt of ['csv', 'xlsx']) {
    const f = one(B.bill('wechat', R.wechat, { range: R.range, format: fmt }).bytes);
    ok(!f.fatal && f.rows.length === 4 && f.errors.length === 0 && f.stats.countOk, '7 微信退款样本（' + fmt + '）：四行都读出来，笔数对得上');
    const [o1, r1, o2, r2] = f.rows;
    ok(r1.io === 'income' && r1.fen === 90 && r1.status === '已退款¥0.90' && r1.kind === '美团-退款' && r1.remark === '', '7 微信（' + fmt + '）：美团退款收入 0.90，状态带金额原样');
    ok(o1.status === '已退款¥0.90' && o1.fen === 2350, '7 微信（' + fmt + '）：原单的状态也是「已退款¥0.90」');
    ok(r2.kind === '某某自助烤肉（示例万象天地店）-退款' && r2.cp === '某某自助烤肉（示例万象天地店）' && r2.status === '已全额退款' && r2.fen === 5000, '7 微信（' + fmt + '）：交易类型带商户全名、对方名全角括号原样');
    ok(r1.no === '50300000002026092900000000001' && r1.noRest === '' && r2.no === '50100000002026092800000000002', '7 微信（' + fmt + '）：退款单号读出来是它自己的（和原单无关）');
    ok(r2.time > o2.time && r1.time > o1.time, '7 微信（' + fmt + '）：退款时间在原单之后');
    ok(Object.keys(R.pairs.wechat).every(k => f.rows.some(x => x.no === k) && f.rows.some(x => x.no === R.pairs.wechat[k])), '7 微信（' + fmt + '）：第 ④ 版预期配对里的单号都读得到');
  }
}

// ===== 6. 在后台线程里跑（假 Worker 跑真的 worker.js）=====
{
  const FW = makeFakeWorker(path.dirname(htmlFile));
  const w = new FW('https://localhost/import/worker.js');
  const msgs = []; w.onmessage = e => msgs.push(e.data); let errs = []; w.onerror = e => errs.push(e.message);
  for (let i = 0; i < 400 && !msgs.length; i++) await new Promise(r => setTimeout(r, 5));
  ok(msgs[0] && msgs[0].type === 'ready', '6 线程准备好（载入了解压库和解析）');
  const a = B.bill('alipay', tAli, { encoding: 'gbk' }), x = B.bill('wechat', tWx, { format: 'xlsx' });
  const fa = B.ab(a.bytes), fx = B.ab(x.bytes);
  w.postMessage({ id: 1, cmd: 'parse', data: { files: [{ name: '支付宝.csv', data: fa }, { name: '微信.xlsx', data: fx }] } }, [fa, fx]);
  ok(fa.byteLength === 0 && fx.byteLength === 0, '6 两份文件的字节都交给了线程（没复制）');
  for (let i = 0; i < 400 && !msgs.some(m => m.id === 1 && m.type !== 'progress'); i++) await new Promise(r => setTimeout(r, 5));
  const done = msgs.find(m => m.id === 1 && m.type === 'done');
  const direct = P.parseFiles([{ name: '支付宝.csv', data: B.ab(a.bytes) }, { name: '微信.xlsx', data: B.ab(x.bytes) }]);
  ok(done && JSON.stringify(done.result) === JSON.stringify(direct), '6 线程里解析的结果和直接解析一模一样');
  const pr = msgs.filter(m => m.id === 1 && m.type === 'progress');
  ok(pr.length >= 2 && pr[pr.length - 1].done === pr[pr.length - 1].total && pr[pr.length - 1].total === a.bytes.length + x.bytes.length, '6 进度按字节报，最后一次 = 总字节');
  ok(!errs.length, '6 线程里没有没接住的错 ' + errs.join('|'));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
