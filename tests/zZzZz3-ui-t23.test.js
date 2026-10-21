// 1021-T23（实测 10-21 其余几条，jsdom）：按钮「导入 N 条」、「新增」叫「支出和收入」、没有手记时不显示「合并 0 笔」和「只对账」「漏记」（第 6、14 条）；
// 「在 X 消费扫码付款」只留店名（第 7 条）；新建分类一行一个「现在：…」点开面板选（第 12 条）；只对账超过 20 笔按分类一类一行、组上全选（第 15 条）；
// 结果页「接下来可以」跳走以后返回键 / 左上角回到结果页，导入记录「看结果」（第 16 条）；按金额搜只比金额（第 17 条）。
// node zZzZz3-ui-t23.test.js [index.html]。账单虚构。
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
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '某虚构商店', desc: '虚构', io: 'expense', fen: 600, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const tx = [];
for (let i = 0; i < 24; i++) tx.push(ali({ time: T(5, 1 + i, 9), cp: '某虚构商店' + (i % 3), fen: 100 + i, kind: i % 2 ? '日用百货' : '餐饮美食' }));
tx.push(ali({ time: T(5, 26, 9), cp: '某虚构网咖', desc: '刷卡 订单 2026043100001234', fen: 9460, kind: '' }));
tx.push(ali({ time: T(5, 27, 9), cp: '某虚构票务', desc: '车票', fen: 43100, kind: '交通出行' }));
tx.push(ali({ time: T(5, 27, 10), cp: '在 某虚构麻辣拌店 消费扫码付款', desc: '', fen: 1500, kind: '' }));
tx.push(ali({ time: T(5, 28, 9), cp: '某虚构文化', desc: '', fen: 700, kind: '文化休闲' }));
tx.push(ali({ time: T(5, 28, 10), cp: '某虚构文化', desc: '', fen: 800, kind: '文化休闲' }));
const file = B.bill('alipay', tx, { range: RANGE }).bytes;
(async () => {
  const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
  // ===== 没有手记的存档 =====
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id), UI = () => t.w.JiwenImportUI;
  await t.importFiles([['a.csv', file]], () => {}, { noGo: true, stay: true });
  UI()._goStep('overview');
  ok(/^导入 \d+ 条$/.test($('impGo').textContent), '1 按钮「导入 N 条」，没有手记不写合并：' + $('impGo').textContent);
  ok(!$('impBar').contains($('impRecon')) || $('impRecon').style.display === 'none' || !$('impRecon').isConnected, '1 没有手记：没有「只对账」');
  ok(!$('impMissed') && !/和手记合并/.test($('impTiles').textContent), '1 没有手记：不写「漏记」、没有「和手记合并」那格');
  const chip = t.d.querySelector('#impSummary .imp-chip[data-group="add"]');
  ok(chip && /^支出和收入/.test(chip.textContent), '1 「新增」那组叫「支出和收入」：' + (chip && chip.textContent));
  // 套话
  const name = t.S().plan.rows.find(d => d.fen === 1500);
  chip.click();
  ok([...t.d.querySelectorAll('#impRows .imp-rs')].some(r => /某虚构麻辣拌店/.test(r.textContent) && !/在 某虚构|消费扫码付款/.test(r.textContent)), '2 「在 X 消费扫码付款」只留店名');
  $('impRowsClose').click();
  // 搜金额
  $('impSearchBtn').click();
  const inp = $('impSearchInput'); inp.value = '431'; inp.dispatchEvent(new t.w.Event('input'));
  const sr = [...t.d.querySelectorAll('#impSearchRes .imp-sr')];
  ok(sr.length === 1 && /票务/.test(sr[0].textContent), '3 搜 431 只出 431 元那笔，不出商品说明里带 431 的网咖：' + sr.map(x => x.textContent).join('|'));
  $('impSearchClose').click();
  // 新建分类那一行
  UI()._goStep('cat');
  const nr = t.d.querySelector('#impNewCats .imp-nc-row');
  const vis = n => [...n.querySelectorAll('*')].every(x => x.style.display !== 'none') ? n.textContent : [...n.childNodes].filter(x => !(x.style && x.style.display === 'none')).map(x => x.querySelector ? vis(x) : x.textContent).join('');
  ok(nr && /现在：/.test(vis(nr)) && !/并到已有…|input/.test(vis(nr)) && [...nr.querySelectorAll('input[type=checkbox]')].every(x => x.style.display === 'none') && nr.querySelector('.imp-into').closest('[style*="none"]'), '4 新建分类一行只写「现在：…」（勾选框、下拉藏起来）：' + (nr && vis(nr)));
  nr.click();
  const opts = [...t.d.querySelectorAll('#uiSheet .ui-pick-opt, #uiSheet button')].map(b => b.textContent);
  ok(opts.some(x => /^新建「/.test(x)) && opts.some(x => /^不建/.test(x)) && opts.some(x => /^并到「餐饮」/.test(x)), '4 点开面板：新建 / 不建 / 并到哪个：' + opts.slice(0, 6).join('、'));
  const into = [...t.d.querySelectorAll('#uiSheet button')].find(b => /^并到「其他」/.test(b.textContent));
  into.click();
  ok(/现在：并到「其他」/.test(t.d.querySelector('#impNewCats [data-cat="' + nr.dataset.cat + '"]').textContent) && t.S().edits.newCats[nr.dataset.cat].into === '其他', '4 选了「并到其他」，那一行写现在是并');
  // 导入，结果页跳去统计，返回键回来
  UI()._goStep('overview');
  $('impGo').click(); if ($('impConfirmOk')) $('impConfirmOk').click();
  await t.until(() => $('impResult'), 20000);
  $('impNextStats').click();
  ok($('impPage').style.display === 'none' && $('impReturn') && $('impReturn').style.display !== 'none', '5 去看统计：导入页关了，左上角有「‹ 回到导入结果」');
  await t.back();
  ok($('impPage').style.display === 'block' && $('impResult') && $('impReturn').style.display === 'none', '5 返回键回到结果页');
  $('impNextStats').click(); $('impReturn').click();
  ok($('impResult'), '5 点左上角也回到结果页');
  // 导入记录里「看结果」
  $('impNextStats').click();
  UI().openLogs();
  await t.until(() => t.d.querySelector('.imp-log-result'), 5000);
  t.d.querySelector('.imp-log-result').click();
  ok($('impResult'), '6 导入记录里「看结果」回到结果页');
  t.$('impBackToLedger').click();
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  // ===== 有手记、只对账超过 20 笔：按分类分组、组上全选 =====
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([{ id: 1, time: '2026-05-03T09:00', money: 99, type: 'expense', cat: '餐饮', remark: '虚构手记' }], CATS), now: '2026-10-21T10:00:00' });
  await t2.importFiles([['a.csv', file]], () => {}, { noGo: true, stay: true });
  t2.w.JiwenImportUI._goStep('overview');
  ok(t2.$('impBar').contains(t2.$('impRecon')) && t2.$('impMissed'), '7 有手记：有「只对账」和「漏记了 N 笔」');
  t2.$('impRecon').click();
  const cgs = [...t2.d.querySelectorAll('.imp-cgs[data-list="recon"] .imp-cg')];
  ok(cgs.length >= 2 && !t2.d.querySelector('.imp-recon-row'), '7 只对账超过 20 笔：一类一行、默认收起：' + cgs.map(x => x.textContent).join(' | '));
  const all = cgs[0].querySelector('.imp-cg-all'); all.checked = true; all.dispatchEvent(new t2.w.Event('change'));
  const n0 = +(/(\d+) 笔/.exec(cgs[0].textContent))[1];
  ok(t2.$('impGo').textContent === '补进 ' + n0 + ' 笔', '7 组上全选：补进 ' + n0 + ' 笔：' + t2.$('impGo').textContent);
  ok(!t2.errs.length, '无报错 ' + t2.errs.join('|'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
