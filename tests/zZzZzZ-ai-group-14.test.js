// 导入简化第 14 版：AI 按组整理（原方案三-4）。待确认分类的结果页「交给 AI 按组整理 ›」：按对方归组拼成一段（默认打码）复制给 AI，
//   AI 回「G号 | 分类 | 理由」放在 ```记问 代码块里、第一行抄「记问分组建议 v1 导出 …」；读回来每组一张勾选卡，「改这 N 条」照 AI 修改那套写
//   （of '*'、by 'aigroup'），导入记录里一行「AI 按组整理」能撤销，撤销时待确认放回。纯计算那部分在 ai.js（groupText / parseGroupReply）。数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
const AI = require(path.join(WWW, 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
// ===== 1. ai.js =====
{
  const d = { at: '2026-10-21 10:00:00', cats: ['未分类', '吃饭', '购物'], groups: [{ g: 1, cp: '某虚构店 13812345678', desc: '果切', n: 3, fen: 4500, cat: '未分类' }, { g: 2, cp: '张*', desc: '转账', n: 2, fen: 2000, cat: '未分类', oc: '转账' }] };
  const tx = AI.groupText(d);
  ok(/第一行原样抄：记问分组建议 v1 导出 2026-10-21 10:00:00/.test(tx) && /可选的分类：吃饭、购物/.test(tx) && /G1 \| 某虚构店 138\*+5678 \| 果切 \| 3 笔 \| 共 45.00 元 \| 未分类/.test(tx) && /G2 \| 个人 \|/.test(tx), '1 groupText：开头那一行、可选的分类、一组一行（手机号打码、个人写「个人」）');
  const r = AI.parseGroupReply('好的\n```记问\n记问分组建议 v1 导出 2026-10-21 10:00:00\nG1 | 吃饭 | 水果\n- G2 | 旅游 | x\nG3 | 吃饭 | y\nG1 | 购物 | 又一次\n```', { at: d.at, cats: d.cats, n: 2 });
  ok(r.ok && r.items.length === 1 && r.items[0].g === 1 && r.items[0].cat === '吃饭' && r.bad.length === 3, '1 parseGroupReply：认 G1；分类不在名单、没有这一组、第二次出现的进「没看懂」');
  ok(AI.parseGroupReply('记问分组建议 v1 导出 2026-10-20 09:00:00\nG1 | 吃饭 | x', { at: d.at, cats: d.cats, n: 2 }).why === 'time', '1 导出时间对不上：整份不认');
  ok(AI.parseGroupReply('记问分组建议 v1 导出 2026-10-21 10:00:00\nG1 | 吃饭 | 没有围栏也认', { at: d.at, cats: d.cats, n: 2 }).items.length === 1, '1 没有 ``` 围栏也认');
}
let seq = 0;
const T = d => ({ y: 2026, mo: 10, d, h: 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const TX = [1, 2, 3].map(d => wx({ time: T(d), cp: '某虚构甲店', fen: 1000 + d })).concat([4, 5].map(d => wx({ time: T(d), cp: '某虚构乙店', fen: 2000 + d }))).concat([wx({ time: T(6), cp: '某虚构丙店', fen: 3006 })]);
const sheetOpen = t => t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles([['微信.csv', B.bill('wechat', TX, { range: { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' } }).bytes]]);
  const rvs = () => t.recs().filter(r => r.rv === 1);
  ok(rvs().length === 6, '2 导进来 6 笔待确认分类');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  $('rvChip').click(); await tick();
  ok($('rvAiBtn') && /交给 AI 按组整理/.test($('rvAiBtn').textContent), '2 待确认分类的结果页：「交给 AI 按组整理 ›」');
  $('rvAiBtn').click(); await t.until(() => sheetOpen(t) && $('impAiGrpText'), 5000);
  const text = $('impAiGrpText').value;
  ok($('uiSheetTitle').textContent === 'AI 按组整理' && /3 组 · 6 笔/.test($('uiSheetSub').textContent) && /G1 \| 某虚构甲店 \| — \| 3 笔/.test(text) && /G3 \| 某虚构丙店/.test(text), '2 按对方分了 3 组（多的在前）：' + $('uiSheetSub').textContent);
  $('impAiGrpCopy').click(); await tick();
  ok(t.w.JiwenImportUI._lastCopy === text, '2 「复制全文」');
  const at = /导出 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(text)[1];
  $('impAiGrpPaste').click(); await tick();
  $('impAiGrpReply').value = '记问分组建议 v1 导出 2020-01-01 00:00:00\nG1 | 吃饭 | x'; $('impAiGrpRead').click(); await tick();
  ok(/导出时间对不上/.test($('impAiGrpMsg').textContent) && sheetOpen(t), '3 导出时间对不上：面板里写原因、不关');
  $('impAiGrpReply').value = 'AI：好的\n```记问\n记问分组建议 v1 导出 ' + at + '\nG1 | 吃饭 | 甲店是面馆\nG2 | 购物 | 乙店卖日用品\nG3 | 不存在的分类 | x\n```';
  $('impAiGrpRead').click(); await tick();
  const rows = [...t.d.querySelectorAll('.imp-aig-row')];
  ok($('uiSheetTitle').textContent === 'AI 的分组建议' && rows.length === 2 && /G1 某虚构甲店 · 3 笔：未分类 → 吃饭/.test(rows[0].textContent) && /甲店是面馆/.test(rows[0].textContent) && /没看懂/.test(t.d.querySelector('.imp-aig-bad').textContent), '3 每组一张勾选卡（默认勾），没看懂的写在后面');
  ok($('impAiGrpGo').textContent === '改这 5 条的分类', '3 「改这 5 条的分类」');
  rows[1].querySelector('input').click(); await tick();
  ok($('impAiGrpGo').textContent === '改这 3 条的分类', '3 勾掉乙店那组：「改这 3 条的分类」');
  $('impAiGrpGo').click();
  await t.until(() => t.ask(), 5000); await t.idle();
  ok(/已按 AI 的建议改了 3 条/.test(t.ask().msg), '4 改完提示');
  await t.askOk();
  ok(t.recs().filter(r => r.cat === '吃饭').length === 3 && rvs().length === 3, '4 甲店 3 笔改成吃饭、不再待确认');
  const lg = (await t.logs()).pop();
  ok(lg.kind === 'ai' && lg.of === '*' && lg.by === 'aigroup' && lg.chg.length === 3 && lg.chg.every(c => c.was.rv === 1), '4 导入记录：kind ai、of *、by aigroup');
  $('devLogsBtn').click(); await t.until(() => t.d.querySelector('.imp-log-aimod'));
  ok(/AI 按组整理/.test(t.d.querySelector('.imp-log-aimod').textContent), '5 导入记录里一行「AI 按组整理」');
  t.d.querySelector('.imp-log-aimod .imp-log-undo').click();
  await t.until(() => t.ask(), 5000); await t.askOk();
  await t.until(() => /已撤销/.test(($('impUndoNotice') || {}).textContent || ''), 10000); await t.idle();
  ok(rvs().length === 6 && !t.recs().some(r => r.cat === '吃饭'), '5 撤销：分类改回去、待确认放回');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 14 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
