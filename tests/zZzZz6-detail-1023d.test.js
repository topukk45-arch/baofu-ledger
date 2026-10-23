// 1023-D 单笔 / 当日 / 一周三个详情抽屉（jsdom 跑整个 App）。node zZzZz6-detail-1023d.test.js [index.html]
// 1. 单笔：大金额、标题（备注，没备注写分类）、分类 + 日期时间；列表卡：统计、「这一天 · N 笔 · 支出 x ›」、这笔之后结余；
//    底部「修改 | 再记一笔」、下面一行小字「这笔要退款」（退过一部分写「再退一笔」、全退了不显示）；批量清单里进来的只看
// 2. 当日：支出（比本月日均多 / 少）、收入（当天净剩）、按分类的小横条、当天每一笔（点了进单笔，关了回到当日）；「关闭 | 给这天补一笔」
// 3. 一周：支出（比上一周多 / 少）、记了几笔（日均按过去了的天数算）、周一到周日 7 根柱子（今天深色、没到的日子虚线框）、
//    每天一行（点了进当日，关了回到一周；没记的「没记 · 补一笔」）
// 4. 账单页：点周小计开一周、点日期抬头开当日；再记一笔照这一笔填好（金额空着、时间是现在）
// 记录全是虚构的。今天是 2026-10-23 周五。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark: remark || '' }, extra || {});
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const sp = e => [...e.children].map(txt).filter(Boolean).join(' ');   // 一块里的几段，中间加空格

(async () => {
  const recs = [
    R('o0', '2026-10-01T09:00', 3000, 'income', '其他', '期初余额', { flow: true }),
    R('p1', '2026-10-13T12:00', 50, 'expense', '吃饭', '上周午饭'),
    R('w1', '2026-10-19T12:00', 30, 'expense', '吃饭', '周一午饭'),
    R('w2', '2026-10-22T08:00', 12, 'expense', '吃饭', '早饭'),
    R('w3', '2026-10-22T13:24', 197, 'expense', '购物', '礼物键盘'),
    R('w4', '2026-10-22T19:00', 200, 'income', '工资', ''),
    R('w5', '2026-10-22T21:00', 8, 'expense', '出行', ''),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const shown = id => $(id) && $(id).style.display === 'flex';
  const sheet = () => shown('uiSheetMask') ? { title: txt($('uiSheetTitle')), sub: txt($('uiSheetSub')), body: $('uiSheetBody'), foot: $('uiSheetFoot') } : null;
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();

  // 1. 单笔
  w.JiwenDetail.openDetail('w3');
  ok(shown('detailMask') && txt($('detailMoney')) === '−197.00' && $('detailMoney').querySelector('.out'), '1 大金额：支出正文色带 −');
  ok(txt($('detailRemark')) === '礼物键盘' && txt($('detailCat')) === '购物' && txt($('detailTime')) === '10月22日 周四 13:24', '1 标题是备注，下面分类 + 日期时间：' + txt($('detailTime')));
  ok(txt($('detailDay')) === '4 笔 · 支出 217.00' && txt($('detailBal')) === (3000 - 50 - 30 - 12 - 197).toFixed(2), '1 这一天 4 笔 · 支出 217；这笔之后结余：' + txt($('detailBal')));
  ok(txt($('detailRefund')) === '这笔要退款' && $('detailRefund').style.display === '' && $('detailAgain').style.display === '' && $('detailEdit').style.display === '', '1 「修改 | 再记一笔」+「这笔要退款」');
  w.JiwenDetail.openDetail('w5');
  ok(txt($('detailRemark')) === '出行' && $('detailRemark').classList.contains('dtl-nork'), '1 没备注：标题写分类（浅色）');
  w.JiwenDetail.openDetail('w4');
  ok($('detailRefund').style.display === 'none' && $('detailMoney').querySelector('.pos') && txt($('detailMoney')) === '+200.00', '1 收入：绿色带 +、没有退款');
  w.JiwenDetail.openDetail('w3', { readonly: true });
  ok($('detailEdit').style.display === 'none' && $('detailAgain').style.display === 'none' && $('detailRefund').style.display === 'none', '1 批量清单里进来：只看不改');
  // 再记一笔：照这一笔填好，金额空着、时间是现在
  w.JiwenDetail.openDetail('w3');
  $('detailAgain').click(); await tick();
  ok(!shown('detailMask') && shown('addMask') && w.JiwenForms.billCatSel === '购物' && w.JiwenForms.billTypeSel === 'expense' && $('billRemark').value === '礼物键盘' && $('billMoney').value === '' && ($('billTime').dataset.value || '').startsWith('2026-10-23T10:'), '1 再记一笔：分类、收支、备注照填，金额空、时间是现在');
  $('closeAdd').click(); await tick();

  // 2. 当日：从单笔「这一天」进
  w.JiwenDetail.openDetail('w3');
  $('detailDayRow').click(); await tick();
  let s = sheet();
  ok(!shown('detailMask') && s && s.title === '昨天 · 10月22日 周四' && s.sub === '4 笔', '2 这一天 → 当日详情：' + (s && s.title));
  const cells = [...s.body.querySelectorAll('.dd-cell')].map(sp);
  const avg = (50 + 30 + 217) / 23;
  ok(cells[0] === `支出 217.00 比本月日均多 ${(217 - avg).toFixed(2)}`, '2 支出 + 比本月日均多：' + cells[0]);
  ok(cells[1] === '收入 200.00 当天净剩 −17.00', '2 收入 + 当天净剩：' + cells[1]);
  const cats = [...s.body.querySelectorAll('.dd-cat')].map(sp);
  ok(cats.join('|') === '购物 197.00|吃饭 12.00|出行 8.00', '2 当天支出按分类、从大到小：' + cats.join('|'));
  const rows = [...s.body.querySelectorAll('.bl-row')].map(r => r.dataset.id);
  ok(rows.join() === 'w5,w4,w3,w2', '2 当天每一笔，新的在上：' + rows.join());
  ok([...s.foot.querySelectorAll('button')].map(txt).join() === '关闭,给这天补一笔' && $('dayAdd').classList.contains('primary'), '2 底部「关闭 | 给这天补一笔」');
  s.body.querySelector('.bl-row[data-id="w2"]').click(); await tick();
  ok(!sheet() && shown('detailMask') && txt($('detailRemark')) === '早饭', '2 点一笔进单笔详情');
  w.JiwenDetail.closeDetail(); await tick();
  s = sheet();
  ok(s && s.title === '昨天 · 10月22日 周四', '2 单笔关了回到当日');
  $('dayAdd').click(); await tick();
  ok(!sheet() && shown('addMask') && ($('billTime').dataset.value || '').startsWith('2026-10-22T'), '2 给这天补一笔：记一笔的日子是那天');
  $('closeAdd').click(); await tick();

  // 3. 一周：点账单页的周小计
  const wk = $('billList').querySelector('.lg-wk');
  ok(wk && wk.dataset.mon === '2026-10-19', '3 第一条周小计是本周');
  wk.click(); await tick();
  s = sheet();
  ok(s && s.title === '本周 · 10月19日–25日', '3 点周小计：一周详情 ' + (s && s.title));
  const wc = [...s.body.querySelectorAll('.dd-cell')].map(sp);
  ok(wc[0] === '支出 247.00 比上一周多 197.00', '3 支出 + 比上一周：' + wc[0]);
  ok(wc[1] === `记了 5 笔 日均 ${(247 / 5).toFixed(2)}（5 天）`, '3 记了几笔、日均按过去了的天数：' + wc[1]);
  const bars = [...s.body.querySelectorAll('.dw-bar')];
  ok(bars.length === 7 && bars[4].classList.contains('today') && bars[5].classList.contains('future') && bars[6].classList.contains('future') && txt(bars[3]) === '217' && txt(bars[5]) === '', '3 7 根柱子：今天深色、没到的日子虚线框、数取整');
  ok([...s.body.querySelectorAll('.dw-labs span')].map(txt).join('') === '一二三四五六日', '3 周一到周日');
  const days = [...s.body.querySelectorAll('.dw-day')].map(sp);
  ok(days.length === 5 && days[0] === '10月23日 周五 没记 补一笔' && days[1] === '10月22日 周四 4 笔 217.00' && days[4] === '10月19日 周一 1 笔 30.00', '3 每天一行（到今天为止，新的在上）：' + days.join(' | '));
  s.body.querySelector('.dw-day[data-day="2026-10-22"]').click(); await tick();
  s = sheet();
  ok(s && s.title === '昨天 · 10月22日 周四', '3 点一天进当日详情');
  $('dayClose').click(); await tick();
  s = sheet();
  ok(s && s.title === '本周 · 10月19日–25日', '3 当日关了回到一周');
  s.body.querySelector('.dw-day [data-add="2026-10-23"]').click(); await tick();
  ok(!sheet() && shown('addMask') && ($('billTime').dataset.value || '').startsWith('2026-10-23T'), '3 没记的那天「补一笔」');
  $('closeAdd').click(); await tick();

  // 4. 账单页点日期抬头：当日详情
  $('billList').querySelector('.lg-dh[data-day="2026-10-19"]').click(); await tick();
  s = sheet();
  ok(s && s.title === '10月19日 周一' && s.sub === '1 笔', '4 点日期抬头：当日详情 ' + (s && s.title));
  $('dayClose').click(); await tick();
  ok(!sheet(), '4 关闭');
  w.JiwenDetail.openWeek('2026-10-12'); await tick();
  ok(sheet().title === '第 42 周 · 10月12日–18日' && sp(sheet().body.querySelector('.dd-cell')) === '支出 50.00 上一周没有记录可比', '4 上一周没有记录：写「没有记录可比」');
  $('weekClose').click(); await tick();

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-D 详情抽屉：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
