// 1.1（1016-Z1）未分类按对方归组的规律说明（纯计算 + jsdom）。node zL-import-pattern.test.js [index.html]
// 「某某 · 5 笔 · 共 53 元 · 工作日中午 12 点左右 · 每笔 12–14 元 → 选个分类」：至少 2 笔才说；八成以上在工作日 / 周末才说；
// 一半以上落在同一个钟点（或相邻两个）才说几点；只是提示，不自动分类。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const PL = require('../www/import/plan.js');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = (d, h, mi, fen, cp) => B.txn({ time: { y: 2026, mo: 10, d, h, mi, s: 0 }, kind: '扫二维码付款', cp, desc: '/', io: 'expense', fen, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') });

(async () => {
  // 纯计算
  ok(PL.patternHint(5, 5, 0, { 12: 4, 13: 1 }) === '工作日中午 12 点左右', '1 五笔都在工作日、多在 12 点：工作日中午 12 点左右');
  ok(PL.patternHint(4, 0, 4, { 19: 1, 20: 2, 9: 1 }) === '周末晚上 20 点左右', '1 都在周末、多在 19–20 点：周末晚上 20 点左右');
  ok(PL.patternHint(4, 2, 2, { 8: 1, 12: 1, 15: 1, 21: 1 }) === '', '1 没规律：不说');
  ok(PL.patternHint(1, 1, 0, { 12: 1 }) === '', '1 只有 1 笔：不说');
  // jsdom：确认页那张卡（2026-10-12 是周一）
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const BL = [12, 13, 14, 15, 16].map((d, i) => wx(d, 12, 5 + i, [1200, 1350, 1400, 1280, 1070][i], '小**'))
    .concat([wx(17, 20, 0, 3000, '某虚构夜宵摊'), wx(18, 20, 30, 2600, '某虚构夜宵摊')]);
  await t.importFiles([['微信.csv', B.bill('wechat', BL, { range: RANGE }).bytes]], S => {
    const tx = t.$('impCpGroups') ? t.$('impCpGroups').textContent : '';
    // 1021-T17：卡片上只写名字、笔数、金额（不写「→ 选个分类」）；规律、每笔多少收进「看这 N 笔」面板顶上
    ok(/小\*\* · 5 笔 · 共 63\.00 元/.test(tx) && !/→ 选个分类/.test(tx), '2 卡片「小** · 5 笔 · 共 63.00 元」：' + tx);
    const notesOf = cp => { [...t.d.querySelectorAll('.imp-cp-row')].find(r => r.dataset.cp === cp).nextElementSibling.click(); const n = [...t.d.querySelectorAll('.imp-rows-note')].map(x => x.textContent).join(' '); t.$('impRowsClose').click(); return n; };
    const n1 = notesOf('小**');
    ok(/工作日中午 12 点左右，每笔 10\.70–14\.00 元/.test(n1), '2 面板顶上写规律：「工作日中午 12 点左右，每笔 10.70–14.00 元」：' + n1);
    ok(/周末晚上 20 点左右/.test(notesOf('某虚构夜宵摊')), '2 两笔都在周末晚上 8 点：写周末晚上');
    ok(S.plan.sections.cpGroups.every(g => !g.cat), '2 只是提示，不自动分类');
  }, { noGo: true });
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
