// 1017-L「AI 检查导入结果」标记的显示（jsdom 跑整个 App）。node zZy-ai-flag.test.js [index.html]
// 账单详情里一行「AI 觉得可能和 X 月 X 日那笔（金额）重复」+ 理由，「知道了，去掉标记」；没标记的不显示；
// 统计页横幅多一句「有 N 条 AI 标记待看 [去看]」（这个月的），点了列出来、点一条开详情；去掉以后横幅跟着变；开发开关关着时横幅不显示。
// 记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RECS = [
  { id: 'r1', time: '2026-10-05T12:30', money: 30, type: 'expense', cat: '吃饭', remark: '虚构午饭', aiFlag: { k: 'dup', why: '同一分钟、同金额', ref: 'r2' } },
  { id: 'r2', time: '2026-10-05T12:30', money: 30, type: 'expense', cat: '吃饭', remark: '虚构午饭', src: { app: 'wechat' }, batch: 'b1' },
  { id: 'r3', time: '2026-10-06T09:00', money: 3, type: 'expense', cat: '吃饭', remark: '', aiFlag: { k: 'miss', why: '加上兑换券正好是你记的那条' } },
  { id: 'r4', time: '2026-09-06T09:00', money: 8, type: 'expense', cat: '其他', remark: '', aiFlag: { k: 'dup', why: '上个月的' } },
];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS), now: '2026-10-20T10:00:00' });
  const { $, d } = t;
  const settle = async () => { await t.idle(); await new Promise(r => setTimeout(r, 20)); await t.idle(); };
  // ===== 1. 详情 =====
  t.w.JiwenDetail.openDetail('r1');
  ok($('detailAiFlag') && $('detailAiFlag').textContent === 'AI 觉得可能和 10 月 5 日那笔（30.00）重复' && /理由：同一分钟、同金额/.test($('detailAiWhy').textContent), '1 详情：「AI 觉得可能和 10 月 5 日那笔（30.00）重复」+ 理由');
  ok($('detailAiClear') && $('detailAiClear').textContent === '知道了，去掉标记', '1 有「知道了，去掉标记」');
  t.w.JiwenDetail.openDetail('r3');
  ok(/AI 觉得这笔可能漏配了/.test($('detailAiFlag').textContent), '1 漏配、没说哪一笔：「AI 觉得这笔可能漏配了」');
  t.w.JiwenDetail.openDetail('r2');
  ok(!$('detailAiField'), '1 没标记的：不显示');
  $('detailMask').style.display = 'none';
  // ===== 2. 统计页横幅 =====
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await settle();
  const banner = () => $('statPendBanner');
  ok(banner() && /有 2 条 AI 标记待看/.test(banner().textContent) && $('statAiFlagsGo') && !/待确认/.test(banner().textContent), '2 10 月：横幅「有 2 条 AI 标记待看 [去看]」（没有待处理时只写这一句）');
  $('statAiFlagsGo').click(); await t.until(() => d.querySelector('.ai-flag-row'));
  const rows = Array.from(d.querySelectorAll('.ai-flag-row'));
  ok(rows.length === 2 && /AI 标记待看（2 条）/.test($('uiSheetTitle').textContent) && /10-05 12:30 · 吃饭 · 30\.00/.test(rows[0].textContent) && /重复/.test(rows[0].textContent), '2 「去看」：底部面板列出这个月带标记的 2 条');
  rows[0].click(); await settle();
  ok($('detailMask').style.display === 'flex' && $('detailAiFlag'), '2 点一条：打开这条的详情');
  // ===== 3. 去掉标记 =====
  $('detailAiClear').click(); await settle();
  const r1 = t.recs().find(r => r.id === 'r1');
  ok(!('aiFlag' in r1) && r1.remark === '虚构午饭' && r1.cat === '吃饭', '3 去掉标记：只去掉标记，别的不动');
  ok(!$('detailAiField') && $('detailMask').style.display === 'flex', '3 详情里那一行没了');
  $('detailMask').style.display = 'none';
  t.w.JiwenStats.stepMonth(1); t.w.JiwenStats.stepMonth(-1); await settle();
  ok(banner() && /有 1 条 AI 标记待看/.test(banner().textContent), '3 横幅变成 1 条');
  t.w.JiwenStats.stepMonth(-1); await settle();
  ok(banner() && /有 1 条 AI 标记待看/.test(banner().textContent), '3 9 月那条：9 月的横幅里');
  // ===== 4. 开发开关关着：横幅不显示，详情照样显示 =====
  t.w.localStorage.removeItem('app_dev_import');
  t.w.JiwenStats.stepMonth(1); await settle();
  ok(!banner(), '4 开发开关关着：横幅不显示');
  t.w.JiwenDetail.openDetail('r3');
  ok($('detailAiFlag'), '4 详情照样显示（标记在记录上）');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
