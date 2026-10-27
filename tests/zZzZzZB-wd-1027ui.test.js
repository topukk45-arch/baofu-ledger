// 1027-UI 一周 / 一天面板（jsdom 跑整个 App）。node zZzZzZB-wd-1027ui.test.js [index.html]
// 1. 定高：打开时面板带 wd-fixed、有定好的高；切天 / 切整周 / 换周以后高度不变（jsdom 不排版，只看定高的那套还在、没被换掉）；
//    换别的面板时定的高去掉
// 2. 「左右滑动看前一天、后一天」只在前 3 次打开时写，之后只留 ‹ ›；从单笔详情回来不算又打开一次
// 3. 0 笔的那一天、今天还没过完而且比日均少：支出那格不写「比本月日均少」；今天比日均多照写
// 4. 「当天净剩」在两格下面单独一行，收入那格不写它
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
const sp = e => [...e.children].map(txt).filter(Boolean).join(' ');

(async () => {
  const recs = [
    R('p1', '2026-10-13T12:00', 50, 'expense', '吃饭', '上周午饭'),
    R('w1', '2026-10-19T12:00', 30, 'expense', '吃饭', '周一午饭'),
    R('w2', '2026-10-22T08:00', 12, 'expense', '吃饭', '早饭'),
    R('w3', '2026-10-22T13:24', 197, 'expense', '购物', '礼物键盘'),
    R('w4', '2026-10-22T19:00', 200, 'income', '工资', ''),
    R('t1', '2026-10-23T08:00', 3, 'expense', '吃饭', '今天早饭'),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const sh = () => $('uiSheet');
  const navT = () => txt($('uiSheetBody').querySelector('.dw-nav-t'));
  const tabTo = async v => { $('uiSheetBody').querySelector(`.wd-tab[data-v="${v}"]`).click(); await tick(); };
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();

  // 1. 定高（jsdom 不排版：面板的内容高度按里面有几个元素假装，遮罩高 800）
  w.JiwenSheet.pick({ title: '先建好共用面板', options: [] }); w.JiwenSheet.close();
  Object.defineProperty($('uiSheetMask'), 'clientHeight', { configurable: true, get: () => 800 });
  Object.defineProperty(sh(), 'scrollHeight', { configurable: true, get() { return this.querySelectorAll('*').length * 3; } });
  w.JiwenDetail.openWeek('2026-10-19'); await tick();
  ok(sh().classList.contains('wd-fixed') && /px$/.test(sh().style.height), '1 打开就定了高：' + sh().style.height);
  const h0 = sh().style.height;
  await tabTo('2026-10-22'); await tabTo('2026-10-20'); await tabTo('week');
  ok(sh().style.height === h0 && sh().classList.contains('wd-fixed'), '1 切天、切整周：高度不变');
  $('weekPrev').click(); await tick();
  ok(sh().classList.contains('wd-fixed') && parseFloat(sh().style.height) >= parseFloat(h0), '1 换到上一周（内容少）：只会长高、不会变矮');
  ok(parseFloat(h0) <= 800 * 0.85, '1 不超过屏幕 85%：' + h0);
  ok(navT() === '左右滑动看上一周、下一周', '2 第 1 次打开：写着左右滑动的说明');
  w.JiwenSheet.pick({ title: '虚构的一个选择', options: [{ value: 'a', label: 'a' }] }); await tick();
  ok(!sh().classList.contains('wd-fixed') && !sh().style.height, '1 换成别的面板：定的高去掉');
  w.JiwenSheet.close();

  // 2. 说明只写前 3 次
  w.JiwenDetail.openDay('2026-10-22'); await tick();
  ok(navT() === '左右滑动看前一天、后一天', '2 第 2 次打开（一天）：写着');
  $('uiSheetBody').querySelector('.bl-row[data-id]').click(); await tick();
  $('detailClose').click(); await tick();
  ok($('uiSheetMask').style.display === 'flex' && navT() === '左右滑动看前一天、后一天', '2 从单笔详情回来：不算又打开了一次');
  w.JiwenSheet.close();
  w.JiwenDetail.openWeek('2026-10-19'); await tick();
  ok(navT() === '左右滑动看上一周、下一周', '2 第 3 次打开：还写着');
  w.JiwenSheet.close();
  w.JiwenDetail.openWeek('2026-10-19'); await tick();
  ok(navT() === '' && $('weekPrev') && $('weekNext'), '2 第 4 次打开：不写说明，只留 ‹ ›');
  ok(w.localStorage.getItem('app_wd_hint_n') === '4', '2 次数记在这台手机上：' + w.localStorage.getItem('app_wd_hint_n'));

  // 3. 比本月日均
  const cell0 = () => sp($('uiSheetBody').querySelector('.dd-cell'));
  await tabTo('2026-10-21');
  ok(cell0() === '支出 0.00', '3 0 笔的那天：不比日均：' + cell0());
  await tabTo('2026-10-23');
  ok(cell0() === '支出 3.00', '3 今天还没过完、比日均少：不写「比本月日均少」：' + cell0());
  await tabTo('2026-10-22');
  ok(/^支出 209\.00 比本月日均多 /.test(cell0()), '3 过完的日子照写：' + cell0());
  // 4. 当天净剩
  const cells = [...$('uiSheetBody').querySelectorAll('.dd-cell')].map(sp);
  ok(cells[1] === '收入 200.00' && sp($('uiSheetBody').querySelector('.dd-net')) === '当天净剩 −9.00', '4 收入那格只写收入，下面一行当天净剩：' + cells[1] + ' / ' + sp($('uiSheetBody').querySelector('.dd-net')));
  w.JiwenSheet.close();
  // 今天比日均多照写
  const t2 = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs.concat([R('t2', '2026-10-23T09:00', 500, 'expense', '购物', '虚构的大件')])) });
  t2.w.JiwenDetail.openDay('2026-10-23'); await tick();
  ok(/^支出 503\.00 比本月日均多 /.test(sp(t2.$('uiSheetBody').querySelector('.dd-cell'))), '3 今天已经比日均多：照写「比本月日均多」');

  ok(!t.errs.length && !t2.errs.length, '没有报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`1027-UI 一周 / 一天面板：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
