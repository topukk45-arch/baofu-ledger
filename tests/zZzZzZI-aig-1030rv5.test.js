// 1030-RV5：AI 按组整理的导出再改一轮。
//   1 没写用途的个人转账也编 G 号（文末那一段去掉）  2 对方名单里没有的用账单原文的对方；真没对方的写交易类型
//   3 群红包 / 发给某某 不交给 AI，导出前直接定（红包 / 转账；没有这个分类就新建）  4 0 元的不进导出
//   5 「隐藏真实姓名」默认关，打开时个人写成个人A / 个人B，读回来按组号对回原记录  6 写回后问要不要接着一键优化
//   jsdom，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

const CPS = ['发出群红包', '发给某虚构丙', '某虚构丁店', '某虚构*戊'];
const CATS = ['未分类', '吃饭', '购物', '转账'];
let n = 0;
const R = (o) => Object.assign({ id: 'r' + (++n), time: `2026-10-${String(1 + (n % 20)).padStart(2, '0')}T12:${String(n % 60).padStart(2, '0')}`, money: String(10 + n), type: 'expense', cat: '未分类', remark: '', rv: 1, src: { app: 'wechat' }, batch: 'bmh00001' }, o);
const RECS = [
  R({ cp: 0, oc: '微信红包' }), R({ cp: 0, oc: '微信红包' }),            // 群红包 → 红包（存档里没有，新建）
  R({ cp: 1, oc: '转账' }),                                               // 发给某某 → 转账
  R({ cp: 2 }), R({ cp: 2 }), R({ cp: 2 }),                              // 交给 AI
  R({ cp: 2, money: '0' }),                                               // 0 元：不进导出
  R({ raw: { app: 'wechat', cp: '某虚构庚店' } }), R({ raw: { app: 'wechat', cp: '某虚构庚店' } }),   // 名单里没有：用账单原文的对方
  R({ oc: '微信红包' }),                                                  // 真没对方：写交易类型
  R({ cp: 3, oc: '转账' }),                                               // 个人、没写用途、只有 1 笔：也编 G 号
];
const sheetOpen = t => t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, CATS, { cps: CPS }), now: '2026-10-25T10:00:00' });
  const $ = id => t.d.getElementById(id);
  const rec = id => t.recs().find(r => r.id === id);
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  $('rvChip').click(); await tick();
  $('rvAiBtn').click(); await A.until(() => sheetOpen(t) && $('impAiGrpText'), 8000);
  const tx = $('impAiGrpText').value, gsTx = tx.split('分组：')[1] || '';
  ok(/^4 组 · 7 笔/.test($('uiSheetSub').textContent), '0 交给 AI 的 4 组 7 笔：' + $('uiSheetSub').textContent);
  ok(/G1 \| 某虚构丁店 \| — \| 支出 \| 3笔/.test(gsTx), '4 0 元那笔不进导出（某虚构丁店 3 笔不是 4 笔）');
  ok(/G2 \| 某虚构庚店 \| — \| 支出 \| 2笔/.test(gsTx), '2 名单里没有的用账单原文里的对方');
  ok(/\| （没写对方，交易类型：微信红包） \| — \| 支出 \| 1笔/.test(gsTx), '2 真没对方的写交易类型');
  ok(/\| 某虚构\*戊 \| 个人转账 \| 支出 \| 1笔/.test(gsTx) && !/以下 .* 笔为个人转账/.test(tx), '1 一笔没写用途的个人转账也编 G 号，没有文末那一段');
  ok(!/群红包|某虚构丙/.test(gsTx) && /另有 3 笔看名字就知道/.test(t.d.querySelector('.imp-aig-pre').textContent), '3 群红包、发给某某不发给 AI，面板上写一句');
  ok($('impAiGrpAlias') && !$('impAiGrpAlias').checked && /某虚构\*戊/.test(tx), '5 「隐藏真实姓名」默认关');
  $('impAiGrpAlias').click(); await tick();
  const tx2 = $('impAiGrpText').value;
  ok(/\| 个人A \| 个人转账 \|/.test(tx2) && !/某虚构\*戊/.test(tx2) && /某虚构丁店/.test(tx2), '5 打开：个人写成「个人A」，商户不动');
  $('impAiGrpCopy').click(); await tick();
  ok(t.w.JiwenImportUI._lastCopy === tx2, '5 复制的是隐藏了名字的那份');
  const at = /导出 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(tx2)[1];
  const gOf = re => +(new RegExp('G(\\d+) \\| ' + re).exec(tx2) || [])[1];
  const gP = gOf('个人A'), gD = gOf('某虚构丁店');
  $('impAiGrpPaste').click(); await tick();
  $('impAiGrpReply').value = '```记问\n记问分组建议 v1 导出 ' + at + '\nG' + gD + ' | 吃饭 | 面馆\nG' + gP + ' | 转账 | 个人A 是给人转钱\n```';
  $('impAiGrpRead').click(); await tick();
  const rows = [...t.d.querySelectorAll('.imp-aig-row')], pre = [...t.d.querySelectorAll('.imp-aig-prerow')];
  const preOf = re => pre.find(p => re.test(p.querySelector('.imp-aig-nm').textContent)), bt = p => p && p.closest('.imp-aig-blk').querySelector('.imp-aig-bt').textContent;
  const pRed = preOf(/^发出群红包/), pTo = preOf(/^发给某虚构丙/);
  ok(rows.length === 4 && pre.length === 2 && pRed && /支出 · 2 笔/.test(pRed.textContent) && bt(pRed) === '未分类 → 红包（新建）' && pTo && /支出 · 1 笔/.test(pTo.textContent) && bt(pTo) === '未分类 → 转账' && pTo.closest('.imp-aig-blk').querySelectorAll('.imp-aig-row').length === 2, '3 读回来：AI 的 2 组 + 按名字定的 2 组（群红包 → 新建「红包」、发给某某 → 转账，和 AI 改成转账的那组在同一块）');
  ok(rows.some(r => /某虚构\*戊/.test(r.textContent)), '5 读回来的卡片上写真名（按组号对回）');
  ok($('impAiGrpGo').textContent === '改这 7 条的分类', '「改这 7 条的分类」：' + $('impAiGrpGo').textContent);
  $('impAiGrpGo').click();
  await A.until(() => t.ask(), 8000); await t.idle();
  ok(/已按 AI 的建议改了 7 条/.test(t.ask().msg) && /要接着「一键优化分类」吗/.test(t.ask().msg), '6 写完问要不要接着一键优化');
  ok(['r1', 'r2'].every(id => rec(id).cat === '红包' && rec(id).rv !== 1) && rec('r3').cat === '转账' && ['r4', 'r5', 'r6'].every(id => rec(id).cat === '吃饭') && rec('r11').cat === '转账' && rec('r7').rv === 1, '写回：群红包 → 红包、发给 → 转账、AI 的两组照改，0 元那笔没动');
  ok(t.arch().cats.includes('红包'), '3 存档里没有「红包」：新建了');
  await t.askOk();
  await A.until(() => sheetOpen(t) || t.ask(), 8000);
  ok(($('uiSheetTitle') && /一键优化/.test($('uiSheetTitle').textContent)) || (t.ask() && /一键优化/.test(t.ask().title || '')), '6 点「接着一键优化」进了一键优化');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`1030-RV5 AI 按组整理：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
