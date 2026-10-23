// 1021-T13（实测 10-20 第 3 轮）待确认分类 rv：导入时推荐把握低 / 未分类、确认页没定过的新增带 rv:1；账单页顶上「待确认分类 N 条」
// 胶囊点了只看它们；改分类（批量、修改、AI 修改）就去掉，批量撤销放回；详情「分类没问题」只去标记；// 指纹不含 rv（去掉标记不算「导入后你改过」）。jsdom。node zZzZs-rv-review.test.js [index.html]。数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const W = require(path.join(WWW, 'import', 'write.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '文化休闲', cp: '某虚构影院', desc: '电影票', io: 'expense', fen: 4500, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const TX = [ali({ time: T(3, 19) }), ali({ time: T(4, 19), cp: '某虚构影院二', desc: '电影票' }), ali({ time: T(5, 12), kind: '餐饮美食', cp: '某虚构饭店', desc: '午饭', fen: 3000 })];
const F = [['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]];
const CATS = ['未分类', '吃饭', '购物', '娱乐', '其他'];

(async () => {
  ok(W.recHash({ a: 1, cat: 'x' }) === W.recHash({ a: 1, cat: 'x', rv: 1 }), '0 指纹不含 rv');
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS.filter(c => c !== '娱乐')), now: '2026-10-20T10:00:00' });
  const { $, d } = t;
  await t.importFiles(F);
  const rvs = () => t.recs().filter(r => r.rv === 1);
  ok(rvs().length === 2 && rvs().every(r => r.cat === '未分类'), '1 两笔电影票（落不到已有分类、未分类）带 rv，午饭（吃饭，把握中）不带');
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  const chip = () => $('rvChip');
  ok(chip() && /待确认分类 2 条/.test(chip().textContent), '2 账单页顶上「待确认分类 2 条」');
  chip().click(); await t.idle();
  t.w.JiwenSearch.searchFlush();
  ok(t.w.JiwenSearch.isOpen() && $('filterSheetMask').style.display !== 'flex' && $('searchTags').textContent.includes('待确认分类') && $('searchList').querySelectorAll('.bl-row').length === 2 && /找到 2 笔/.test($('summaryFilter').textContent), '2 点了打开搜一笔的结果页、只看这 2 条（等于一个筛选）');
  // 批量改分类：去掉标记；撤销放回
  t.w.JiwenSearch.applyBatch(rvs().map(r => r.id), { cat: '其他' }); await t.idle();
  ok(rvs().length === 0 && t.recs().filter(r => r.cat === '其他').length === 2, '3 批量改分类：标记去掉');
  t.w.JiwenSearch.undoBatch(); await t.idle(); if (t.ask()) await t.askOk();
  ok(rvs().length === 2, '3 撤销这次批量：标记放回');
  // 详情「分类没问题」
  const id0 = rvs()[0].id;
  t.w.JiwenDetail.openDetail(id0); await t.idle();
  ok($('detailRvOk'), '4 详情里有「分类没问题」');
  $('detailRvOk').click(); await t.idle();
  ok(!t.recs().find(r => r.id === id0).rv && t.recs().find(r => r.id === id0).cat === '未分类', '4 只去掉标记、分类不动');
  try { t.w.JiwenDetail.closeDetail(); } catch (_) {}
  // 去掉标记不算「导入后你改过」
  const [lg] = await t.st().importsRead();
  const rows = (await t.st().aiExportRows(lg.b)).rows;
  ok(!rows.find(r => r.id === id0).edited, '5 去掉标记后撤销时不算「你改过」（指纹不含 rv）');
  // 修改账单改分类：去掉
  const id1 = rvs()[0].id;
  t.w.openEdit(id1); await t.idle();
  t.w.JiwenForms.pickEditCat ? t.w.JiwenForms.pickEditCat('其他') : null;
  $('saveEdit').click(); await t.idle(); if (t.ask()) await t.askOk();
  ok(!t.recs().find(r => r.id === id1).rv, '6 修改账单改了分类：标记去掉');
  ok(!chip() && t.w.JiwenSearch.isOpen() && $('searchCount').textContent === '0 笔' && $('searchTags').textContent.includes('待确认分类'), '6 都改完了：账单页的胶囊收掉；结果页条件还在、0 笔（1023-G）');
  $('searchTags').querySelector('.sp-tag').click(); await t.idle();
  ok(!$('searchTags').querySelector('.sp-tag'), '6 点 × 去掉「待确认分类」');

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
