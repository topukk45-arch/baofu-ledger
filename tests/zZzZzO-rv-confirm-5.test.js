// 导入简化第 5 版：待确认分类的确认 + 改分类时问一句。
//   详情：确认挪到列表卡第一行「分类是导入时推荐的 [没问题] [改分类]」；逐条确认（待确认 k / N，没问题 / 改成… / 跳过，处理完自动下一条）；
//   成组确认（按推荐分类分组、能勾掉个别的、能撤销）；批量里「确认分类（不改）」（能撤销）；确认不存规则，改了分类问「以后也这么记？」。
//   jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
// 6 笔推不出分类的（未分类，标 rv）：甲 3 笔、乙 2 笔、丙 1 笔
const TX = [1, 2, 3].map(d => wx({ time: T(d), cp: '某虚构甲店', fen: 1000 + d })).concat([4, 5].map(d => wx({ time: T(d), cp: '某虚构乙店', fen: 2000 + d }))).concat([wx({ time: T(6), cp: '某虚构丙店', fen: 3006 })]);
const sheetOpen = t => t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles([['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]]);
  const rvs = () => t.recs().filter(r => r.rv === 1);
  ok(rvs().length === 6, '0 导进来 6 笔待确认分类');
  // ===== 1. 详情：确认挪到分类旁边 =====
  const first = rvs().find(r => Number(r.money) === 30.06);
  t.w.JiwenDetail.openDetail(first.id); await tick();
  const f = $('detailRvField');
  ok(f && $('detailList').firstElementChild === f && /分类是导入时推荐的/.test(f.textContent) && f.contains($('detailRvOk')) && f.contains($('detailRvEdit')), '1 详情：列表卡第一行「分类是导入时推荐的 [没问题] [改分类]」');
  $('detailRvEdit').click(); await tick();
  ok(sheetOpen(t) && t.d.getElementById('uiPickList'), '1 「改分类」：拉出分类抽屉');
  [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '购物').click(); await t.idle();
  ok(t.recs().find(r => r.id === first.id).cat === '购物' && !t.recs().find(r => r.id === first.id).rv, '1 改成购物：分类改了、标记去掉');
  ok(t.ask() && /以后「某虚构丙店」的账单都记成「购物」吗/.test(t.ask().msg) && $('askOk').textContent === '以后都这样记' && $('askCancel').textContent === '只改这一条', '1 改了分类问一句「以后也这么记？」（以后都这样记 / 只改这一条）');
  await t.askOk(); await t.idle(); await tick(60);
  ok(((t.arch().importRules || {}).cat || []).some(r => r.kw === '某虚构丙店' && r.cat === '购物'), '1 「以后都这样记」：存了一条分类规则');
  try { t.w.JiwenDetail.closeDetail(); } catch (_) {}
  // ===== 2. 逐条确认 =====
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  $('rvChip').click(); await tick();
  ok($('rvOneBtn') && $('rvGroupBtn'), '2 待确认分类的结果页：「逐条确认 ›」「成组确认 ›」');
  $('rvOneBtn').click(); await tick();
  ok(sheetOpen(t) && $('uiSheetTitle').textContent === '待确认 1 / 5' && $('rvOneCard') && /某虚构/.test($('rvOneCard').textContent) && /推荐的分类/.test($('rvOneCard').textContent), '2 顶上「待确认 1 / 5」，写对方、推荐的分类：' + $('uiSheetTitle').textContent);
  await t.until(() => $('rvOneWhy') && $('rvOneWhy').textContent, 3000);
  ok($('rvOneWhy') && $('rvOneWhy').textContent.length > 0, '2 理由：' + ($('rvOneWhy') && $('rvOneWhy').textContent));
  const id1 = t.S ? null : null; void id1;
  $('rvOneOk').click(); await tick();
  ok(sheetOpen(t) && $('uiSheetTitle').textContent === '待确认 2 / 5' && rvs().length === 4, '2 「没问题」：去掉标记，自动到下一条');
  $('rvOneSkip').click(); await tick();
  ok($('uiSheetTitle').textContent === '待确认 3 / 5' && rvs().length === 4, '2 「跳过」：不动，到下一条');
  const chip = [...$('rvOneCats').querySelectorAll('.cc[data-cat]')].find(x => x.dataset.cat);
  ok(chip, '2 「改成…」有常用分类小标签');
  const n0 = rvs().length; chip.click(); await t.idle();
  ok(rvs().length === n0 - 1 && t.ask() && /以后「/.test(t.ask().msg), '2 点一个小标签就改，改了问以后也这么记吗');
  await t.askCancel(); await tick();
  ok(sheetOpen(t) && $('uiSheetTitle').textContent === '待确认 4 / 5', '2 「只改这一条」：接着下一条');
  $('rvOneClose').click(); await tick();
  ok(!sheetOpen(t), '2 「关闭」');
  // ===== 3. 成组确认（能勾掉个别的、能撤销）=====
  const left = rvs().length;
  $('rvGroupBtn').click(); await tick();
  const g = [...t.d.querySelectorAll('.rvg')];
  ok(sheetOpen(t) && g.length >= 1 && /未分类 · \d+ 笔/.test(g[0].textContent) && /某虚构/.test(g[0].querySelector('.rvg-s').textContent), '3 按推荐的分类分组：「未分类 · N 笔（某某 2、…）」');
  g[0].querySelector('[data-act="open"]').click(); await tick();
  const cbs = [...t.d.querySelectorAll('.rvg-row input')];
  ok(cbs.length === left && cbs.every(c => c.checked), '3 点开看每一笔，默认都勾着');
  cbs[0].click(); await tick();
  ok(/勾上的 \d+ 笔没问题/.test(t.d.querySelector('.rvg-ok').textContent), '3 勾掉一笔：按钮写「勾上的 N 笔没问题」');
  t.d.querySelector('.rvg-ok').click(); await t.idle();
  ok(rvs().length === 1 && t.ask() && /已确认 \d+ 条的分类/.test(t.ask().msg) && $('askExtra').textContent === '撤销这次操作', '3 确认：只剩勾掉的那 1 笔；能「撤销这次操作」');
  $('askExtra').click(); await t.idle(); if (t.ask()) await t.askOk();
  ok(rvs().length === left, '3 撤销：rv 回来');
  // ===== 4. 批量「确认分类（不改）」 =====
  $('batchBar').click(); await tick();
  const opt = [...$('askChoices').querySelectorAll('.cc')].find(x => /确认分类（不改）/.test(x.textContent));
  ok(opt, '4 批量改里有「确认分类（不改）」');
  opt.click(); await t.askOk(); await tick();
  ok(t.ask() && /只去掉「待确认分类」，分类不动/.test(t.ask().msg), '4 先确认一下');
  const cats0 = rvs().map(r => r.cat).join();
  await t.askOk(); await t.idle();
  ok(rvs().length === 0 && t.ask() && /撤销这次操作/.test($('askExtra').textContent), '4 确认了：标记都去掉');
  $('askExtra').click(); await t.idle(); if (t.ask()) await t.askOk();
  ok(rvs().length === left && rvs().map(r => r.cat).join() === cats0, '4 撤销：标记回来，分类没动');
  // 确认不存规则
  ok(((t.arch().importRules || {}).cat || []).length === 1, '4 确认不存规则（只有第 1 步那一条）');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化第 5 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
