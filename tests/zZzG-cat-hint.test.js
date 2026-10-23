// 分类汇总（jsdom，记录全是虚构的）。node zZzG-cat-hint.test.js [index.html]
// 1019-H 原来是「框里能滑、右下角小圆钮提示」；1023-O 起分类汇总不在框里滑：全部铺开、固定从大到小、没有排序切换和滑动提示；
// 净额是支出的分类在上（「支出」一段）、收入的在下（「收入」一段），中间一道线，每段最后一行合计；一段超过 10 个先列 8 个 +「展开全部 N 个」；
// 两段合计相加 = 累计收入 − 累计支出（和总结余对得上）。设置里「滑动提示」开关照留。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const OUTS = ['吃饭', '购物', '出行', '日用', '娱乐', '房租', '医疗', '学习', '运动', '宠物'];
const CATS = ['未分类'].concat(OUTS, ['工资', '红包', '杂项', '转账']);
const R = (id, time, money, type, cat, extra) => Object.assign({ id, time, money, type, cat, remark: '虚构' }, extra || {});
const base = () => OUTS.map((c, i) => R('r' + i, `2026-10-${String(1 + i).padStart(2, '0')}T12:00`, 10 + i, 'expense', c))
  .concat([
    R('w', '2026-10-15T09:00', 1000, 'income', '工资'),
    R('h1', '2026-10-16T09:00', 50, 'income', '红包'), R('h2', '2026-10-17T09:00', 20, 'expense', '红包'),   // 红包有收有发：净额 +30
    R('s', '2026-10-18T09:00', 500, 'expense', '吃饭', { skip: true }),                                        // 不计的不进
    R('f', '2026-10-19T09:00', 300, 'expense', '转账', { flow: true }),                                        // 往来的不进
  ]);

(async () => {
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(base(), CATS) });
  const { $, w, d } = t;
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await t.idle();
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const box = $('catStats');
  const sec = k => box.querySelector(`.cs-sec[data-kind="${k}"]`);
  const rows = k => [...sec(k).querySelectorAll('.cs-row:not(.cs-total)')].map(r => [txt(r.querySelector('.cs-name')), txt(r.querySelector('.cs-amt'))]);
  const total = k => txt(sec(k).querySelector('.cs-total .cs-amt'));

  // 0. 没有滑动提示、排序切换，不在框里滑
  ok(!$('catStatsHint') && !$('catSortSeg'), '0 没有滑动提示圆钮、没有排序切换');
  ok(/\.cat-card \.cat-stats \{ max-height:none; overflow:visible; \}/.test(css), '0 框不限高、不在框里滑');

  // 1. 支出一段：10 个，从大到小，每个带 −
  ok(sec('out') && /^支出/.test(txt(sec('out').querySelector('.cs-sec-h'))), '1 支出一段在上');
  ok(rows('out').length === 10, '1 支出 10 个分类全列（不超过 10 个不折）');
  ok(rows('out')[0].join() === '宠物,−19.00' && rows('out')[9].join() === '吃饭,−10.00', '1 从大到小：' + rows('out').map(r => r[0]).join(''));
  ok(rows('out').every((r, i, a) => i === 0 || parseFloat(a[i - 1][1].slice(1)) >= parseFloat(r[1].slice(1))), '1 每一行都不比上一行大');
  ok(sec('out').querySelectorAll('.cs-amt.out').length === 11, '1 支出用正文色（out），合计也是');
  ok(total('out') === '−145.00', '1 支出合计 −145.00：' + total('out'));
  ok(!rows('out').some(r => r[0] === '转账'), '1 往来（转账）不进');
  ok(rows('out').find(r => r[0] === '吃饭')[1] === '−10.00', '1 不计的 500 不算进吃饭');
  ok(!box.querySelector('.cs-more'), '1 不超过 10 个：没有「展开全部」');

  // 2. 中间一道线；收入一段
  ok(box.querySelector('.cs-split') && box.querySelector('.cs-split').previousElementSibling === sec('out') && box.querySelector('.cs-split').nextElementSibling === sec('in'), '2 支出、收入中间一道线');
  ok(rows('in').map(r => r.join(':')).join() === '工资:+1000.00,红包:+30.00', '2 收入一段：工资、红包（有收有发先相减），从大到小');
  ok(sec('in').querySelectorAll('.cs-amt.pos').length === 3, '2 收入绿色带 +');
  ok(total('in') === '+1030.00', '2 收入合计 +1030.00：' + total('in'));
  ok(/相加一定等于「累计收入 − 累计支出」/.test(txt(box.querySelector('.cs-note'))), '2 下面一句说明两段合计相加等于累计收入 − 累计支出');

  // 3. 和总结余对得上
  $('statBalHead').click(); await t.idle();
  const bal = [...$('statBalRows').querySelectorAll('.st-bal-row')].map(r => txt(r.querySelector('b')));
  ok(bal[1] === '1050.00' && bal[2] === '165.00', '3 总结余：累计收入 1050、累计支出 165：' + bal.join('|'));
  ok(Math.abs((1030 - 145) - (parseFloat(bal[1]) - parseFloat(bal[2]))) < 0.001, '3 1030 − 145 = 1050 − 165');

  // 4. 两块挨在一起、在最下面，前面一行「全部记录」
  ok($('statAllHead').nextElementSibling === $('statBal') && $('statBal').nextElementSibling === $('catStatsCard'), '4 全部记录 → 总结余 → 分类汇总');
  ok($('statMonthCatList').compareDocumentPosition($('statAllHead')) & w.Node.DOCUMENT_POSITION_FOLLOWING, '4 在当月那几块后面');
  ok(/切月份不变/.test(txt($('statAllHead'))), '4 写明切月份不变');
  w.JiwenStats.stepMonth(-1); await t.idle();
  ok(total('out') === '−145.00', '4 翻到上个月：分类汇总不变');
  w.JiwenStats.stepMonth(1); await t.idle();

  // 5. 超过 10 个：先列 8 个 +「展开全部 11 个」，合计照全部算
  const t2 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(base().concat([R('z', '2026-10-20T12:00', 1, 'expense', '杂项')]), CATS) });
  t2.d.querySelector('.tab-btn[data-tab="stats"]').click(); await t2.idle();
  const s2 = () => t2.$('catStats').querySelector('.cs-sec[data-kind="out"]');
  ok(s2().querySelectorAll('.cs-row:not(.cs-total)').length === 8 && txt(s2().querySelector('.cs-more')) === '展开全部 11 个 ›', '5 11 个：先列 8 个 +「展开全部 11 个」');
  ok(txt(s2().querySelector('.cs-total .cs-amt')) === '−146.00', '5 合计照 11 个全算：−146.00');
  ok(s2().querySelector('.cs-more').tagName === 'BUTTON' && /button\.cs-more \{[^}]*min-height:var\(--ui-tap\)/.test(css), '5 「展开全部」是按钮、48 高');
  s2().querySelector('.cs-more').click(); await t2.idle();
  ok(s2().querySelectorAll('.cs-row:not(.cs-total)').length === 11 && !s2().querySelector('.cs-more'), '5 点了：11 个全列、按钮没了');
  ok(!t2.$('catStats').querySelector('.cs-sec[data-kind="in"] .cs-more'), '5 收入只有 2 个：不折');

  // 6. 设置里「滑动提示」开关照留
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  [...$('scrollHintSeg').children].find(b => b.dataset.v === 'off').click();
  ok(w.localStorage.getItem('app_scroll_hint') === 'off' && $('scrollHintSeg').querySelector('.on').dataset.v === 'off', '6 关掉：存在这台手机上');
  [...$('scrollHintSeg').children].find(b => b.dataset.v === 'on').click();
  ok(!w.localStorage.getItem('app_scroll_hint'), '6 打开：默认值（不存）');

  // 7. 空账本：卡片藏起来
  const t3 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf([], CATS) });
  t3.d.querySelector('.tab-btn[data-tab="stats"]').click(); await t3.idle();
  ok(t3.$('catStatsCard').style.display === 'none' && t3.$('statBal').style.display === 'none', '7 空账本：总结余、分类汇总都不显示');

  ok(!t.errs.length && !t2.errs.length && !t3.errs.length, '没有报错 ' + t.errs.concat(t2.errs, t3.errs).join('；'));
  console.log(`\n分类汇总（1023-O）：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
