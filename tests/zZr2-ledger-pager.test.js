// @serial（第 10 段真等分批画完，并行跑时机器忙会超过 3 秒）
// 1023-C 账单页按月显示（原来是 1017-M 的翻页测试，1023-C 去掉了翻页，整个改成这一份）。node zZr2-ledger-pager.test.js [index.html]
//   顶上细条「10月 支出 x 收入 y 统计 ›」；这个月的全部记录一直往下排：每周开头一条周小计（截在这个月里、今天是周一时本周那条不显示）、
//   每天一张卡片（抬头日期 + 当天支出 / 收入）、每笔两行（备注或分类 / 「分类 · 时间」）；没记账的日子：今天单独一条「记一笔」，
//   过去连着没记的几天合成一条「补一笔」（按周断开，不早于账本第一笔）；月份浮条切月份；一个月很多笔时分批画。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const pad = n => String(n).padStart(2, '0');
const R = (id, day, hm, money, type, cat, remark) => ({ id, time: `${day}T${hm}`, money, type, cat, remark });
// 今天是 2026-10-23 周五。10 月：13–18 日、20–21 日、23 日（今天）没记；9 月：7–13 日整周没记；账本第一笔是 8 月 5 日
function recs() {
  const out = [];
  [1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 19, 22].forEach(d => out.push(R('o' + d, `2026-10-${pad(d)}`, '12:00', 10 + d, 'expense', '吃饭', d === 22 ? '' : '午饭' + d)));
  out.push(R('inc', '2026-10-12', '09:00', 5000, 'income', '工资', '十月工资'));
  out.push(R('o22b', '2026-10-22', '20:30', 4.5, 'expense', '购物', '绿茶'));
  for (let d = 1; d <= 30; d++) if (d < 7 || d > 13) out.push(R('s' + d, `2026-09-${pad(d)}`, '08:30', 3, 'expense', '出行', '地铁'));
  [5, 6, 20].forEach(d => out.push(R('a' + d, `2026-08-${pad(d)}`, '19:00', 30, 'expense', '吃饭', '晚饭')));
  return out;
}
const txt = e => e.textContent.replace(/\s+/g, ' ').trim();

(async () => {
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs()) });
  const w = t.w, d = t.d, $ = t.$;
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  const bar = $('billHead'), list = $('billList');
  // 0. 顶上细条
  ok(txt(bar).startsWith('10月') && bar.querySelector('.ov-out').textContent === (14 + [1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 19, 22].reduce((s, x) => s + 10 + x, 0) - 14 + 4.5).toFixed(2), '0 细条：10月 + 这个月支出 ' + txt(bar));
  ok(bar.querySelector('.ov-in').textContent === '5000.00' && txt(bar).endsWith('统计 ›'), '0 细条：收入、「统计 ›」');
  ok(!$('pagerBottom') && !$('summaryOverall') && !$('pager'), '0 没有翻页、没有大总览（1023-C）');
  ok(list.querySelectorAll('.bl-row').length === 14, '0 这个月的全部记录都列出来（14 笔，不分页）');
  // 1. 今天还没记
  const first = list.firstElementChild;
  ok(first.classList.contains('lg-wk') && first.classList.contains('cur') && txt(first).startsWith('本周10.19–25'), '1 第一条是本周的分隔线（1023-K）' + txt(first));
  const today = list.querySelector('.lg-gap-today');
  ok(today && first.nextElementSibling === today && txt(today) === '今天 · 10月23日 周五 · 还没记账记一笔' && today.dataset.add === '2026-10-23', '1 今天还没记：单独一条，点了记一笔（导入简化第 11 版：一行细字） ' + (today && txt(today)));
  // 2. 周小计
  const wks = [...list.querySelectorAll('.lg-wk')].map(txt);
  ok(wks.length === 4 && wks[1].startsWith('第 42 周10.12–18') && wks[2].startsWith('第 41 周10.5–11'), '2 本周 / 别的周写一年里的第几周（1023-K）' + wks.join(' | '));
  ok(wks[3].startsWith('第 40 周10.1–4'), '2 跨月的周截在这个月里：10.1–4 ' + wks[3]);
  ok(wks[1].endsWith('22.00') && !wks[1].includes('5000'), '2 周分隔线右边只写支出（有收入也不写，点开一周详情看）' + wks[1]);
  const wkEls = [...list.querySelectorAll('.lg-wk')];
  ok(wkEls.every(b => b.querySelectorAll('.lg-wk-bars i').length === 7) && !wkEls[1].classList.contains('cur'), '2 每条 7 根小柱子；只有本周那条是 cur（主色）');
  ok([...wkEls[0].querySelectorAll('.lg-wk-bars i')].map(i => i.classList.contains('lg-wk-dot') ? '.' : 'i').join('') === 'iiiii..', '2 本周：周六、周日还没到，是点');
  ok([...wkEls[3].querySelectorAll('.lg-wk-bars i')].map(i => i.classList.contains('lg-wk-dot') ? '.' : 'i').join('') === '...iiii', '2 10.1–4 那周：9 月那三天（不在这个月）是点');
  // 3. 没记账的日子
  const gaps = [...list.querySelectorAll('.lg-gap')].map(txt);
  ok(gaps.includes('10月20日–21日 · 2 天没记账') && gaps.includes('10月13日–18日 · 6 天没记账'), '3 连着没记的几天合成一行（第 11 版：一行细字，不装框） ' + gaps.join(' | '));
  ok(gaps.includes('10月7日 周三 · 没记账') && gaps.includes('10月4日 周日 · 没记账') && list.querySelector('.lg-gap[data-a="2026-10-07"]').tagName === 'BUTTON', '3 单独一天没记；整行是按钮');
  ok(list.querySelector('.lg-gap[data-a="2026-10-13"]').dataset.b === '2026-10-18', '3 那段的最后一天是 10月18日');
  // 4. 日卡片和每笔两行
  const dh = list.querySelector('.lg-dh[data-day="2026-10-22"]');
  ok(dh && txt(dh).startsWith('昨天 · 10月22日 周四') && txt(dh).includes('支出 36.50'), '4 日卡片抬头：日期 + 当天支出 ' + (dh && txt(dh)));
  const rows = [...dh.parentNode.querySelectorAll('.bl-row')];
  ok(rows.length === 2 && rows[0].dataset.id === 'o22b', '4 当天的记录新的在上');
  ok(txt(rows[0].querySelector('.bl-t')) === '绿茶' && txt(rows[0].querySelector('.bl-sub')) === '购物 · 20:30', '4 每笔两行：备注 / 分类 · 时间');
  ok(txt(rows[1].querySelector('.bl-t')) === '吃饭', '4 没备注的写分类');
  ok(txt(rows[1].querySelector('.bl-sub')) === '12:00' && !rows[1].querySelector('.bl-cat-t'), '4 没备注的：下面一行不再写一遍分类（1024-Y）' + txt(rows[1].querySelector('.bl-sub')));
  ok(rows[0].querySelector('.bl-amt').classList.contains('out') && rows[0].querySelector('.bl-amt').textContent === '−4.50', '4 支出：深色、带 −');
  const inc = list.querySelector('.bl-row[data-id="inc"] .bl-amt');
  ok(inc.classList.contains('pos') && inc.textContent === '+5000.00', '4 收入：绿色、带 +');
  // 5. 补一笔：打开记一笔，日子设成那天
  list.querySelector('.lg-gap[data-a="2026-10-13"]').click();
  ok(d.getElementById('uiSheetTitle').textContent === '10月13日–18日 · 6 天没记账' && /记在 10月18日/.test($('gapAdd').textContent), '5 点那一行：小面板「补一笔（记在 10月18日）」');
  $('gapAdd').click();
  ok($('addMask').style.display === 'flex' && ($('billTime').dataset.value || '').startsWith('2026-10-18T'), '5 补一笔：记一笔的日子是 10月18日 ' + $('billTime').dataset.value);
  $('closeAdd').click();
  // 6. 月份浮条：账本第一笔的月份到这个月；点 9 月切过去
  const strip = $('lgStrip');
  const ms = [...strip.querySelectorAll('.ms-item')];
  ok(ms.map(b => b.dataset.ym).join() === '2026-08,2026-09,2026-10' && ms[2].classList.contains('on'), '6 月份浮条：8 月到 10 月，选中 10 月');
  ms[1].click();
  ok(txt(bar).startsWith('9月') && list.querySelectorAll('.bl-row').length === 23, '6 点 9 月：列表换成 9 月 ' + txt(bar));
  ok(w.JiwenLedger.ovOff(), '6 看的不是这个月（首屏快照不存）');
  const sw = [...list.querySelectorAll('.lg-wk')].map(txt);
  ok(sw.some(x => x === '第 37 周9.7–13没记'), '6 一整周没记：分隔线右边写「没记」 ' + sw.join(' | '));
  ok([...list.querySelectorAll('.lg-gap')].map(txt).includes('9月7日–13日 · 7 天没记账') && !list.querySelector('.lg-gap-today'), '6 下面只一行合并的；过去的月份没有「今天」那条');
  ok(sw[0].startsWith('第 40 周9.28–30'), '6 月底那周截在 9 月里');
  // 7. 8 月：不早于账本第一笔（8月5日）
  w.JiwenLedger.setYM('2026-08');
  const ag = [...list.querySelectorAll('.lg-gap')].map(txt);
  ok(!ag.some(x => /8月[1-4]日/.test(x)) && ag.some(x => x.startsWith('8月21日–23日 · 3 天没记账')) && ag.some(x => x.startsWith('8月24日–30日 · 7 天没记账')), '7 账本第一笔之前的空白日子不显示 ' + ag.join(' | '));
  w.JiwenLedger.setYM(null);
  ok(txt(bar).startsWith('10月') && !w.JiwenLedger.ovOff(), '7 回到这个月');
  // 8. 搜一笔（1023-G 起是单独的结果页）：全部月份里命中的，同样的周小计 / 日卡片，不显示没记账的日子；账单页不动
  $('filterFab').click(); $('searchKeyword').value = '地铁'; $('sheetApply').click();
  w.JiwenSearch.searchFlush();
  const sl = $('searchList');
  ok(sl.querySelectorAll('.bl-row').length === 23 && !sl.querySelector('.lg-gap') && sl.querySelector('.lg-wk') && sl.querySelector('.lg-dc') && list.querySelector('.lg-gap-today'), '8 搜一笔：全部命中的、周小计 / 日卡片照样有、没有空白日子；账单页还是这个月');
  $('searchBack').click();
  ok(!w.JiwenSearch.isOpen() && bar.style.display === '' && list.querySelector('.lg-gap-today'), '8 回到账单');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));

  // 9. 今天是周一：本周那条不显示
  const t2 = await A.boot({ html, www: WWW, now: '2026-10-19T10:00:00', seed: A.seedOf(recs().filter(r => r.time < '2026-10-19')) });
  t2.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  const l2 = t2.$('billList');
  ok(l2.firstElementChild.classList.contains('lg-gap-today') && txt(l2.querySelector('.lg-wk')).startsWith('第 42 周'), '9 今天是周一：本周那条不显示，往前的周照旧');

  // 10. 一个月很多笔：分批画，先画一部分，接着画完
  const many = Array.from({ length: 900 }, (_, i) => R('m' + i, `2026-10-${pad(1 + i % 22)}`, `${pad(8 + i % 12)}:${pad(i % 60)}`, 1 + i % 50, 'expense', '吃饭', '虚构' + i));
  const t3 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(many) });
  t3.d.querySelector('.tab-btn[data-tab="ledger"]').click();
  t3.w.JiwenLedger.renderBill();
  const n0 = t3.$('billList').querySelectorAll('.bl-row').length;
  ok(n0 >= 300 && n0 < 900, '10 先画一部分（整张日卡片为单位） ' + n0);
  await t3.until(() => t3.$('billList').querySelectorAll('.bl-row').length === 900, 3000);
  ok(t3.$('billList').querySelectorAll('.bl-row').length === 900, '10 接着画完');
  t3.w.JiwenLedger.renderBill(); t3.w.JiwenLedger.listFlush();
  ok(t3.$('billList').querySelectorAll('.bl-row').length === 900 && new Set([...t3.$('billList').querySelectorAll('.bl-row')].map(r => r.dataset.id)).size === 900, '10 listFlush 一次画完，没有重复');

  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
