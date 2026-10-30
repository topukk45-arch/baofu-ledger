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
  const it = (time, fen) => ({ time, fen });
  const d = { at: '2026-10-21 10:00:00', cats: ['未分类', '吃饭', '购物'], groups: [
    { g: 1, cp: '某虚构店 13812345678', desc: '果切', io: 'expense', n: 3, fen: 4500, cat: '未分类', items: [it('2026-10-05T12:00', 1500), it('2026-10-06T12:30', 1500), it('2026-10-07T12:10', 1500)] },
    { g: 2, cp: '张*', desc: '个人转账', io: 'income', n: 2, fen: 2610, cat: '未分类', oc: '转账', person: true, items: [it('2026-10-22T12:20', 1000), it('2026-10-25 13:05', 1610)] },
    { g: 3, cp: '李* 13900001111', desc: '个人转账', io: 'expense', n: 1, fen: 20000, cat: '未分类', oc: '转账', person: true, items: [it('2026-09-01T08:05', 20000)] },
    { g: 4, cp: '张*', desc: '房租', io: 'expense', n: 1, fen: 100000, cat: '未分类', oc: '转账', person: true, items: [it('2026-09-02T08:05', 100000)] },
    { g: 5, cp: '', desc: '—', io: 'expense', n: 1, fen: 500, cat: '未分类', oc: '微信红包', items: [it('2026-09-03T08:05', 500)] }] };
  const tx = AI.groupText(d);
  ok(/第一行原样抄：记问分组建议 v1 导出 2026-10-21 10:00:00/.test(tx) && /可选的分类：吃饭、购物/.test(tx), '1 groupText：开头那一行、可选的分类');
  ok(tx.includes('G1 | 某虚构店 138****5678 | 果切 | 支出 | 3笔 | 共45元 | 均15元 | 单笔固定15元 | 2026-10 | 多在12:00~14:00 | 多在工作日 | 未分类'), '1 ≥3 笔一行：手机号照样打码、统计字段齐');
  ok(tx.includes('G2 | 张* | 个人转账 | 收入 | 2笔 | 共26.1元 | 均13.1元 | 单笔10~16.1元 | 2026-10 | 12:20(周四)、13:05(周日) | 未分类') && !/\| 个人 \|/.test(tx), '1 2 笔一行；对方名原样发、不再换成「个人」');
  ok(tx.includes('G3 | 李* 139****1111 | 个人转账 | 支出 | 1笔 | 200元 | 2026-09-01 08:05(周二) | 未分类') && !/以下 .* 笔为个人转账|不用回/.test(tx), '1 1030-RV5：没说明的个人转账也编 G 号，文末那一段去掉了');
  ok(/「均」是平均每笔/.test(tx) && /疑似月固定扣款」是每月一笔/.test(tx) && /「个人转账」是给个人转钱.*拿不准就不写/.test(tx), '1 提示词补了字段说明、个人转账那条规则照留');
  ok(tx.includes('G5 | （没写对方，交易类型：微信红包） | — |'), '1 1030-RV5：没有对方的组写交易类型');
  const ta = AI.groupText(d, { alias: true });
  ok(ta.includes('G1 | 某虚构店 138****5678 |') && ta.includes('G2 | 个人A | 个人转账 | 收入') && ta.includes('G3 | 个人B | 个人转账 | 支出') && ta.includes('G4 | 个人A | 房租 |') && !/张\*|李\*/.test(ta) && /「个人A」「个人B」是我隐藏了真名的个人/.test(ta), '1 1030-RV5：隐藏真实姓名：个人写成个人A / 个人B，同一个人同一个号，商户不动');
  ok(!/个人A/.test(tx) && !/隐藏了真名/.test(tx), '1 默认不隐藏');
  ok(AI.namePre('发出群红包', '') === 'redpack' && AI.namePre('群红包', '') === 'redpack' && AI.namePre('收到群红包', '') === 'redpack' && AI.namePre('发给某虚构丙', '') === 'transfer'
     && AI.namePre('', '发出群红包') === 'redpack' && AI.namePre('某虚构店', '发给某某') === '' && AI.namePre('某虚构发给店', '') === '' && AI.namePre('发给', '') === '', '1 1030-RV5：namePre 认群红包、发给某某（对方名没有才看商品说明）');
  const L = g => AI.groupLine(Object.assign({ g: 9, cp: '某店', desc: '—', io: 'expense', cat: '未分类' }, g), true);
  ok(L({ n: 1, fen: 10700, items: [it('2026-08-01T17:45', 10700)] }) === 'G9 | 某店 | — | 支出 | 1笔 | 107元 | 2026-08-01 17:45(周六) | 未分类', '1 1 笔一行');
  ok(L({ n: 3, fen: 300, items: [it('2026-08-01T23:45', 100), it('2026-08-03T00:10', 100), it('2026-08-09T23:10', 100)] }).includes('| 多在23:00~01:00 |'), '1 时段环形：23 点、0 点 → 多在23:00~01:00');
  ok(L({ n: 4, fen: 400, items: [it('2026-08-01T02:00', 100), it('2026-08-01T08:00', 100), it('2026-08-01T14:00', 100), it('2026-08-01T20:00', 100)] }).includes('| 分散 | 多在周末 |'), '1 3 个钟点也过不了一半 → 分散；都在周六 → 多在周末');
  ok(L({ n: 3, fen: 300, items: [it('2026-08-01T12:00', 100), it('2026-08-03T12:00', 100), it('2026-08-04T12:00', 100)] }).includes('| 都有 |'), '1 工作日、周末都有 → 都有');
  const mon = L({ n: 4, fen: 40000, items: [it('2026-02-28T09:00', 10000), it('2026-03-31T09:00', 10000), it('2026-04-25T09:00', 10000), it('2026-05-30T09:00', 10000)] });
  ok(/2026-02~2026-05 \| .* \| 疑似月固定扣款 \| 未分类$/.test(mon), '1 每月一笔、日号 ≥28 当 28 → 疑似月固定扣款：' + mon);
  ok(!/疑似/.test(L({ n: 4, fen: 400, items: [it('2026-02-01T09:00', 100), it('2026-03-15T09:00', 100), it('2026-04-02T09:00', 100), it('2026-05-03T09:00', 100)] })), '1 日子差太多不写');
  ok(!/疑似/.test(L({ n: 3, fen: 300, items: [it('2026-02-01T09:00', 100), it('2026-02-02T09:00', 100), it('2026-03-02T09:00', 100)] })), '1 一个月两笔不写');
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
  ok($('impAiGrpText').classList.contains('imp-paste-ta'), '2 复制框用共用样式（1024-Y：原来没样式，只有两行高）');
  ok($('uiSheetTitle').textContent === 'AI 按组整理' && /3 组 · 6 笔/.test($('uiSheetSub').textContent) && /G1 \| 某虚构甲店 \| — \| 支出 \| 3笔 \| 共30.1元 \| 均10元 \| 单笔固定10元 \| 2026-10 \| 多在12:00~14:00 \| 都有 \| 未分类/.test(text) && /G3 \| 某虚构丙店 \| — \| 支出 \| 1笔 \| 30.1元 \| 2026-10-06 12:00\(周二\)/.test(text), '2 按对方分了 3 组（多的在前）：' + $('uiSheetSub').textContent);
  // 1030-RV3：aiGroupsOf 的分法（虚构的行）
  {
    let n = 0; const R = (o) => Object.assign({ id: 'x' + (++n), time: '2026-10-05T12:00', fen: 1000, type: 'expense', cat: '未分类', oc: '商户消费', remark: '', cp: '', skip: false }, o);
    const gs = t.w.JiwenImportUI.aiGroupsOf([
      R({ cp: '某虚构面馆', remark: '牛肉面', time: '2026-10-01T12:00' }), R({ cp: '某虚构面馆', remark: '牛肉面', time: '2026-10-02T12:00' }),
      R({ cp: '某虚构面馆', remark: '拉面', time: '2026-10-03T12:00' }), R({ cp: '某虚构面馆', remark: '拉面', time: '2026-10-09T12:00' }), R({ cp: '某虚构面馆', remark: '/' }), R({ cp: '某虚构面馆', remark: '/' }),
      R({ cp: '某虚构面馆', type: 'income', remark: '退押金' }),
      R({ cp: '某虚构便利店', remark: '/' }), R({ cp: '某虚构便利店', remark: '扫码付款' }),
      R({ cp: '美团', remark: '外卖订单' }), R({ cp: '美团', remark: '外卖订单' }), R({ cp: '美团', remark: '打车' }),
      R({ cp: '王*', oc: '转账', remark: '房租' }), R({ cp: '王*', oc: '转账', remark: '房租' }), R({ cp: '王*', oc: '转账', remark: '饭钱' }),
      R({ cp: '李*', oc: '转账', remark: '转账' }), R({ cp: '李*', oc: '转账', remark: '' }), R({ cp: '李*', oc: '转账', remark: '/' }),
      R({ cp: '赵*', oc: '转账', remark: '转账' }), R({ cp: '赵*', oc: '转账', remark: '转账', type: 'income' }),
    ]);
    const f = (cp, io, desc) => gs.filter(g => g.cp === cp && g.io === (io || 'expense') && (desc === undefined || g.desc === desc));
    ok(f('某虚构面馆').length === 1 && f('某虚构面馆')[0].n === 6 && f('某虚构面馆', 'income').length === 1, '2 同一对方收入、支出分两组');
    ok(f('某虚构面馆')[0].desc === '拉面', '2 商户：商品说明取出现最多的（一样多取最近一笔的；泛化说明不算）：' + f('某虚构面馆')[0].desc);
    ok(f('某虚构便利店').length === 1 && f('某虚构便利店')[0].desc === '—', '2 商户全是泛化说明 → 「—」');
    ok(f('美团', 'expense', '外卖订单').length === 1 && f('美团', 'expense', '外卖订单')[0].n === 2 && f('美团', 'expense', '打车').length === 1, '2 平台照旧按商品说明分');
    ok(f('王*', 'expense', '房租')[0].n === 2 && f('王*', 'expense', '饭钱')[0].n === 1, '2 个人按「对方 + 商品说明」分');
    const li = f('李*')[0], zh = gs.filter(g => g.cp === '赵*');
    ok(li && li.desc === '个人转账' && li.n === 3 && li.g > 0, '2 个人 + 泛化说明：只按对方分、写「个人转账」');
    ok(zh.length === 2 && zh.every(g => g.g > 0 && g.desc === '个人转账'), '2 1030-RV5：个人转账没说明、只有 1 笔的也编 G 号（收支分开各 1 组）');
    ok(gs.map(g => g.g).join() === gs.map((g, i) => i + 1).join(), '2 G 号从 1 连着编');
  }
  $('impAiGrpCopy').click(); await tick();
  ok(t.w.JiwenImportUI._lastCopy === text, '2 「复制全文」');
  const at = /导出 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(text)[1];
  $('impAiGrpPaste').click(); await tick();
  $('impAiGrpReply').value = '记问分组建议 v1 导出 2020-01-01 00:00:00\nG1 | 吃饭 | x'; $('impAiGrpRead').click(); await tick();
  ok(/导出时间对不上/.test($('impAiGrpMsg').textContent) && sheetOpen(t), '3 导出时间对不上：面板里写原因、不关');
  // 1024-Y：粘贴框共用样式、框下面数行数；报错一句短话 + 下一步按钮
  ok($('impAiGrpReply').classList.contains('imp-paste-ta') && t.d.getElementById('impPasteStyle'), '3 粘贴框用共用样式（至少 7 行，账单页进来也有样式）');
  ok($('impAiGrpMsg').textContent.length <= 20 && !$('impAiGrpReplyAct').hidden && /重新复制给 AI/.test($('impAiGrpReplyAct').textContent), '3 导出时间对不上：一句短话 + 「重新复制给 AI ›」' + $('impAiGrpMsg').textContent);
  ok($('impAiGrpReplyInfo').textContent === '已粘贴 2 行，识别到 1 条建议', '3 框下面：已粘贴 N 行，识别到 M 条建议 ' + $('impAiGrpReplyInfo').textContent);
  $('impAiGrpReply').value = 'abc'; $('impAiGrpRead').click(); await tick();
  ok(/清空，再贴一次/.test($('impAiGrpReplyAct').textContent), '3 没找到分组建议：按钮「清空，再贴一次」');
  $('impAiGrpReplyAct').click(); await tick();
  ok($('impAiGrpReply').value === '' && $('impAiGrpMsg').textContent === '' && $('impAiGrpReplyAct').hidden && $('impAiGrpReplyInfo').textContent === '还没粘贴', '3 点了清空：框空了、报错收起');
  $('impAiGrpReply').value = 'AI：好的\n```记问\n记问分组建议 v1 导出 ' + at + '\nG1 | 吃饭 | 甲店是面馆\nG2 | 购物 | 乙店卖日用品\nG3 | 不存在的分类 | x\n```';
  $('impAiGrpRead').click(); await tick();
  // 1030-E：块默认收起，一屏先看到全部改法
  const blks = () => [...t.d.querySelectorAll('.imp-aig-blk')];
  ok($('uiSheetTitle').textContent === 'AI 的分组建议' && blks().length === 2 && !t.d.querySelector('.imp-aig-row') && blks().every(b => !b.classList.contains('open')), '3 实测 10-30（1030-E）：两块「未分类 → 吃饭 / 购物」，默认收起、不列每一组');
  const b0 = blks().find(b => b.dataset.to === '吃饭');
  ok(/^未分类 → 吃饭$/.test(b0.querySelector('.imp-aig-bt').textContent) && /^1 组 · 3 笔$/.test(b0.querySelector('.imp-aig-bs').textContent) && /^\d/.test(b0.querySelector('.imp-aig-bamt').textContent), '3 块一行：「未分类 → 吃饭」「1 组 · 3 笔」+ 金额：' + b0.textContent);
  const openAll = async () => { for (let i = 0; i < 20; i++) { const g = t.d.querySelector('.imp-aig-blk:not(.open) .imp-aig-bgo'); if (!g) break; g.click(); await tick(); } };
  await openAll();
  const rows = [...t.d.querySelectorAll('.imp-aig-row')];
  const blkOf = r => r.closest('.imp-aig-blk');
  ok(rows.length === 2 && /^某虚构甲店/.test(rows[0].querySelector('.imp-aig-nm').textContent) && rows[0].querySelector('.imp-aig-n').textContent === '3 笔' && !rows[0].querySelector('.imp-aig-why') && /^未分类 → 吃饭$/.test(blkOf(rows[0]).querySelector('.imp-aig-bt').textContent) && rows.every(r => r.querySelector('input').checked) && /没看懂/.test(t.d.querySelector('.imp-aig-bad').textContent), '3 点开：一组一行（对方 · 笔数 · 金额，默认勾），理由先不显示，没看懂的写在后面');
  rows[0].querySelector('.imp-aig-l1').click(); await tick();
  ok(t.d.querySelector('.imp-aig-row .imp-aig-why') && t.d.querySelector('.imp-aig-row .imp-aig-why').textContent === 'AI：甲店是面馆' && !/G1/.test(t.d.querySelector('.imp-aig-row').textContent), '3 点一组：展开 AI 的理由（不写组号）');
  ok(t.d.querySelectorAll('.imp-aig-blk.open').length === 2, '3 重画以后展开的块照旧展开');
  ok($('impAiGrpGo').textContent === '改这 5 条的分类', '3 「改这 5 条的分类」');
  { const ball = () => [...t.d.querySelectorAll('.imp-aig-blk')].find(x => x.dataset.to === '购物').querySelector('.imp-aig-ball');
    ball().click(); await tick();
    ok($('impAiGrpGo').textContent === '改这 3 条的分类' && !ball().checked, '3 实测 10-30：块的标题上整块勾掉「未分类 → 购物」：「改这 3 条的分类」');
    ball().click(); await tick();
    ok($('impAiGrpGo').textContent === '改这 5 条的分类', '3 再点整块勾回来'); }
  [...t.d.querySelectorAll('.imp-aig-row')][1].querySelector('input').click(); await tick();
  ok($('impAiGrpGo').textContent === '改这 3 条的分类', '3 勾掉乙店那组：「改这 3 条的分类」');
  $('impAiGrpGo').click();
  await t.until(() => t.ask(), 5000); await t.idle();
  ok(/已按 AI 的建议改了 3 条/.test(t.ask().msg) && /还有 3 条待确认分类，要接着「一键优化分类」吗/.test(t.ask().msg) && t.d.getElementById('askOk').textContent === '接着一键优化', '4 改完提示；还有待确认的，问要不要接着一键优化（1030-RV5）');
  await t.askCancel();
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
