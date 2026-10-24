// 1021-T17（实测 10-21 第 1～4 条）：共用的「这几笔」面板（按时间排、每页 50、点一笔开详情、关了回到面板）用在零碎扣款、新建分类（含每个对方）、
//   按对方选分类的组、总览四格和分组、结果页四格（只看）；推荐理由写成一句人话（不出现「内置」「落到你的」「品：」）；组卡片只写名字、笔数、金额、推荐和把握；
//   导入页回到顶部 ↑。node zZzZu-rows-panel.test.js [index.html]。账单虚构。
const fs = require('fs'), path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const A = require('./helpers/app');
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
const CATS = ['未分类', '餐饮', '购物', '其他'];
let seq = 0;
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h || 10, mi: mi || 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '', cp: '某虚构科技有限公司', desc: '虚构', io: 'expense', fen: 600, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));

(async () => {
  const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-20T10:00:00' });
  const $ = id => t.d.getElementById(id), UI = () => t.w.JiwenImportUI;
  // 零碎扣款 10 笔、一个对方 3 笔（进组）、一类新建分类
  const tx = [];
  for (let i = 0; i < 10; i++) tx.push(ali({ time: T(5, 1 + i, 9), cp: '某虚构畅游网络', desc: '自动扣费', fen: 10 }));
  for (let i = 0; i < 3; i++) tx.push(ali({ time: T(5, 3 + i, 12), cp: '某虚构工作室', desc: '渠道测试 订单' + i, fen: 100 * (i + 1) }));
  for (let i = 0; i < 4; i++) tx.push(ali({ time: T(5, 6 + i, 8), cp: '某虚构地铁' + (i % 2), kind: '交通出行', desc: '地铁乘车', fen: 300 + i }));
  await t.importFiles([['a.csv', B.bill('alipay', tx, { range: RANGE }).bytes]], () => {}, { noGo: true, stay: true });
  // 理由人话
  const pr = r => UI()._plainReason({ reason: r });
  ok(pr('内置（「淘宝闪购」其他几笔的商品说明）→ 餐饮美食（落到你的「餐饮」）') === '「淘宝闪购」别的几笔看着像「餐饮美食」，你这里叫「餐饮」', '1 理由：同一对方别的几笔 + 落到你的分类 → 一句话：' + pr('内置（「淘宝闪购」其他几笔的商品说明）→ 餐饮美食（落到你的「餐饮」）'));
  ok(pr('内置（商品说明里的「奶茶」）→ 餐饮美食') === '商品说明里有「奶茶」，可能是「餐饮美食」', '1 理由：商品说明里的词');
  ok(pr('你的对照：交通出行 → 交通（内置：地铁 → 交通出行）') === '名字里有「地铁」，多半是「交通出行」，你以前把「交通出行」并到了「交通」', '1 理由：对照不嵌套括号：' + pr('你的对照：交通出行 → 交通（内置：地铁 → 交通出行）'));
  const bad = ['内置：滴滴 → 交通出行', '内置（平台「美团」，卖什么的都有）→ 餐饮美食', '支付宝分类：餐饮美食', '「品：果切」几笔的商品说明各指向不同分类，不推荐', '内置（「品：果切」其他几笔的商品说明）→ 餐饮美食'].map(pr);
  ok(bad.every(x => !/内置|落到你的|品：|（.*（/.test(x)), '1 理由里没有内部词、不嵌套括号：' + bad.join(' | '));

  UI()._goStep('overview');      // 导入简化 2a：零碎扣款收进总览的「提醒」
  const pl = t.d.querySelector('.imp-petty-rows');
  ok(pl && /看这 10 笔/.test(pl.textContent), '2 零碎扣款能点开「看这 10 笔」');
  pl.click();
  const rs = () => [...t.d.querySelectorAll('#impRows .imp-rs')];
  ok(rs().length === 10 && /10 笔 · 共 1\.00 元 · 按时间排/.test($('uiSheetSub').textContent), '2 面板里 10 笔、合计：' + $('uiSheetSub').textContent);
  rs()[3].click();
  ok($('impSheet') && /某虚构畅游网络/.test($('impSheet').textContent), '2 点一笔开完整详情');
  await t.back();
  ok($('impRows') && rs().length === 10, '2 返回键关了详情回到面板');
  $('impRowsClose').click();
  UI()._goStep('cat');
  const nl = t.d.querySelector('.imp-nc-rows'), ncp = t.d.querySelector('.imp-nc-cp');
  ok(nl && ncp && /看这 4 笔/.test(nl.textContent) && / 2 笔 ›/.test(ncp.textContent), '3 新建分类：「看这 4 笔」、每个对方「某某 2 笔 ›」都能点：' + (ncp && ncp.textContent));
  ncp.click();
  ok(rs().length === 2, '3 点一个对方：只列它那 2 笔');
  $('impRowsClose').click();
  const cr = [...t.d.querySelectorAll('.imp-cp-row')].find(r => r.dataset.cp === '某虚构工作室');
  ok(cr && !/→ 选个分类|内置|品：|每笔/.test(cr.textContent), '4 组卡片只写名字、笔数、金额、推荐：' + (cr && cr.textContent));
  // 总览四格能点
  UI()._goStep('overview');
  const tile = t.d.querySelector('#impTiles .imp-tile-go');
  ok(tile, '5 总览四格能点');
  tile.click();
  ok(t.d.getElementById('impRows') && rs().length > 0, '5 点「新建」打开面板');
  $('impRowsClose').click();
  // 回到顶部
  ok($('impToTop') && $('impToTop').classList.contains('to-top'), '6 导入页有回到顶部 ↑（和统计页同一个样式）');
  $('impPage').scrollTop = 900; $('impPage').dispatchEvent(new t.w.Event('scroll'));
  ok($('impToTop').classList.contains('show'), '6 往下滑过 400 出现');
  // 结果页四格：只看
  $('impGo').click(); if ($('impConfirmOk')) $('impConfirmOk').click();
  for (let i = 0; i < 200 && !$('impResult'); i++) await new Promise(r => setTimeout(r, 30));
  const rt = $('impResTiles') && $('impResTiles').querySelector('.imp-tile-go');
  ok(rt, '7 结果页四格能点');
  if (rt) { rt.click(); rs()[0].click(); ok($('impViewClose') && !$('impSheetOk'), '7 结果页点一笔只看、不能改'); $('impViewClose').click(); ok($('impRows'), '7 关了回到面板'); $('impRowsClose').click(); }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
