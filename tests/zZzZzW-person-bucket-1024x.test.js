// 1024-X（1024-W 的评审：先看准确率再改推荐）：
//   ① 撤回 1024-W 的两条推荐改动：只在商品说明里认出的照旧把握低；和个人之间的不默认推「转账」；
//   ② 和个人之间的按种类各成一组（转账 / 红包 / 扫个人收钱码 / 别的），工作日中午（11:00–13:30）付给个人的 10–30 元单独一组、建议「餐饮」（把握低）；
//   ③ 导入记录多存 bk（每条新记录的分类是哪一类依据给的，和 add 一一对应），导入量度按依据分桶算「导入后改了分类」的比例；
//      以前导入、没有 bk 的，量度页载入分类推荐后按账单原文重推一遍（近似）；
//   ④ 量度：每一笔去了哪（grp），「把握低的」合计把「和个人之间的」也算上（原来漏了）；「自动定了」显示时去掉跳过的。
//   数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile), IMP = path.join(WWW, 'import');
const C = require(path.join(IMP, 'classify.js')), W = require(path.join(IMP, 'merchants.js'));
const P = require(path.join(IMP, 'parse.js')), R = require(path.join(IMP, 'route.js')), M = require(path.join(IMP, 'match.js')), PL = require(path.join(IMP, 'plan.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const CATS = ['未分类', '餐饮', '购物', '转账', '工资', '红包', '其他'];
const one = r => C.classify([Object.assign({ app: 'wechat', desc: '', kind: '商户消费', io: 'expense' }, r)], { cats: CATS, merchants: W }).recs[0];
// 2026-10-12 是周一，10-17 是周六
// ===== 1. 撤回 1024-W =====
ok(one({ cp: '某虚构小铺', desc: '外卖' }).conf === 'low', '1 只在商品说明里认出：照旧把握低');
const p1 = one({ cp: '某虚构昵称', kind: '转账', time: '2026-10-12T18:00', fen: 5000 });
ok(p1.layer === 'none' && p1.cat === '未分类' && p1.person && p1.psub === 'transfer', '1 转账给个人：不推荐（不默认转账），标 person / transfer');
// ===== 2. 种类、午饭 =====
ok(one({ cp: '某虚构昵称', kind: '微信红包（单发）', io: 'income' }).psub === 'redpack', '2 红包 → redpack');
ok(one({ cp: '某虚构摊主', kind: '扫二维码付款', desc: '二维码收款', time: '2026-10-12T19:00', fen: 1500 }).psub === 'qr', '2 扫个人收钱码（晚上）→ qr');
ok(!one({ cp: '某虚构文具店', kind: '扫二维码付款', desc: '二维码收款' }).person, '2 带「店」的不算个人');
const lu = one({ cp: '某虚构摊主', kind: '扫二维码付款', desc: '二维码收款', time: '2026-10-12T12:10', fen: 1800 });
ok(lu.person && lu.psub === 'lunch' && lu.cat === '餐饮' && lu.conf === 'low' && /工作日中午付给个人的 18\.00 元，多半是午饭/.test(lu.reason), '2 工作日 12:10 付给个人 18 元 → 午饭那组、建议餐饮（把握低）：' + lu.reason);
ok(one({ cp: '某虚构昵称', kind: '转账', time: '2026-10-13T11:40', fen: 2500 }).psub === 'lunch', '2 转账也算（11:40、25 元）');
ok(one({ cp: '某虚构摊主', kind: '扫二维码付款', desc: '二维码收款', time: '2026-10-17T12:10', fen: 1800 }).psub === 'qr', '2 周末不算午饭');
ok(one({ cp: '某虚构摊主', kind: '扫二维码付款', desc: '二维码收款', time: '2026-10-12T12:10', fen: 3500 }).psub === 'qr', '2 35 元不算午饭');
ok(one({ cp: '某虚构摊主', kind: '扫二维码付款', desc: '二维码收款', time: '2026-10-12T14:00', fen: 1800 }).psub === 'qr', '2 14 点不算午饭');
// ===== 3. 确认页：各成一组 =====
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '扫二维码付款', cp: '某虚构甲', desc: '二维码收款', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const TX = [wx({ time: T(12, 12, 5), cp: '某虚构甲', fen: 1500 }), wx({ time: T(13, 12, 20), cp: '某虚构乙', fen: 2200 }), wx({ time: T(14, 11, 50), cp: '某虚构丙', fen: 1300 }),
  wx({ time: T(14, 20, 0), cp: '某虚构丁', kind: '转账', desc: '/', fen: 5000 }), wx({ time: T(15, 20, 0), cp: '某虚构戊', kind: '转账', desc: '/', fen: 6000 }),
  wx({ time: T(16, 9, 0), cp: '某虚构小铺', kind: '商户消费', desc: '/', fen: 900 }), wx({ time: T(16, 10, 0), cp: '某虚构小铺', kind: '商户消费', desc: '/', fen: 800 })];
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const parsed = P.parseFiles([{ name: 'w.csv', data: B.ab(B.bill('wechat', TX, { range: RANGE }).bytes) }]);
const matched = M.match(R.route(parsed, { known: {} }), parsed, { manual: [], cats: CATS, merchants: W });
const p = PL.plan({ parsed, matched, info: { cats: CATS }, manualById: {}, overlaps: [] }, {});
const gOf = cp => p.sections.cpGroups.find(g => g.cp === cp);
const glu = gOf('（工作日中午付给个人的 10–30 元）'), gtr = gOf('（和个人之间的转账）');
ok(glu && glu.n === 3 && glu.rec && glu.rec.cat === '餐饮' && !glu.kw, '3 工作日中午的三笔一组、建议餐饮、不存规则：' + JSON.stringify(p.sections.cpGroups.map(g => [g.cp, g.n, g.rec && g.rec.cat])));
ok(gtr && gtr.n === 2 && !gtr.rec && !gtr.kw, '3 两笔转账一组、不推荐');
ok(gOf('某虚构小铺') && gOf('某虚构小铺').n === 2, '3 商户照旧按对方归组');
// ===== 4. 量度：grp、bucketOf =====
const mm = PL.measure(p, { cat: p.sections.cpGroups.map(g => ({ id: 'cp:' + g.cp, keys: g.keys })) }, { total: 7, path: 'quick' });
ok(mm.grp && mm.grp.add === 7 && mm.grp.skip === 0, '4 grp：7 笔都是新增：' + JSON.stringify(mm.grp));
ok(mm.low.person === 3 && mm.none.person === 2 && mm.none.shop === 2, '4 午饭三笔算把握低里的「和个人之间的」，转账两笔算推不出（其中个人 2）：' + JSON.stringify({ low: mm.low, none: mm.none }));
ok(PL.bucketOf(lu) === 'person.l' && PL.bucketOf(one({ cp: '某虚构小铺', desc: '外卖' })) === 'desc.l' && PL.bucketOf({ layer: 'history', conf: 'mid', cat: '餐饮' }) === 'history.a' &&
   PL.bucketOf({ layer: 'alipay', conf: 'mid', cat: '餐饮' }) === 'ali.a' && PL.bucketOf({ layer: 'builtin', conf: 'mid', cat: '餐饮', reason: '内置：某 → 餐饮美食' }) === 'cp.a' && PL.bucketOf(null) === 'none.l' &&
   PL.bucketOf({ layer: 'builtin', conf: 'mid', cat: '其他', newCat: '游戏' }) === 'cp.l', '4 bucketOf：依据 + 自动 / 要你看');

// ===== 5. jsdom：导入记录存 bk、量度按依据算改了多少；没有 bk 的按账单原文重推 =====
(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-21T10:00:00' });
  const w = t.w;
  const F = [['w.csv', B.bill('wechat', [wx({ time: T(12, 12, 5), fen: 1500 }), wx({ time: T(13, 9, 0), cp: '某虚构甲乙铺', kind: '商户消费', desc: '奶茶', fen: 1600 }),
    wx({ time: T(14, 9, 0), cp: '某虚构小铺', kind: '商户消费', desc: '/', fen: 900 })], { range: RANGE }).bytes]];
  await t.importFiles(F);
  const lg = (await t.logs()).pop();
  ok(Array.isArray(lg.bk) && lg.bk.length === lg.add.length && lg.bk.slice().sort().join() === ['desc.l', 'none.l', 'person.l'].sort().join(), '5 导入记录 bk 和 add 一一对应：' + JSON.stringify(lg.bk));
  ok(!t.recs().some(r => 'bk' in r), '5 记录上不带 bk');
  // 把午饭那笔改成购物（算改了），奶茶那笔不动
  const lunchId = lg.add[lg.bk.indexOf('person.l')];
  const S = w.JiwenStore, u = S.loadStore(w.JiwenBase.currentUser), a2 = u.archives[w.JiwenBase.currentArchive];
  a2.records = a2.records.map(r => r.id === lunchId ? Object.assign({}, r, { cat: '购物' }) : r); S.saveStore(u); await tick(60); await t.idle();
  let ml = await t.st().measureList();
  const acc = ml[0].acc;
  ok(acc && acc.src === 'log' && acc.by.person[0] === 1 && acc.by.person[1] === 1 && acc.by.desc[0] === 1 && acc.by.desc[1] === 0 && acc.l[0] === 3 && acc.l[1] === 1, '5 按依据算：和个人之间的 1 笔改了 1、只靠商品说明 1 笔改了 0：' + JSON.stringify(acc));
  // 量度页文字
  w.localStorage.setItem('app_dev_import', '1');
  await w.eval('JiwenImportEntry.loadImportUI')();
  w.JiwenSettings && w.eval('JiwenImportEntry.renderDevImport')();
  t.d.getElementById('devMeasureBtn').click();
  await t.until(() => t.d.getElementById('measureList'));
  const txt = t.d.getElementById('measureList').textContent;
  ok(/导入后改了多少：自动定了的 改了 0 \/ 0；要你看的 改了 1 \/ 3（33%）/.test(txt) && /和个人之间的 改了 1 \/ 1（100%）/.test(txt) && /只靠商品说明 改了 0 \/ 1（0%）/.test(txt), '5 量度页写「导入后改了多少」：' + txt);
  ok(/分类来自（只数新建的 3 笔）/.test(txt), '5 分类来自写明只数新建的');
  t.d.getElementById('measureClose').click(); await tick();
  // 导入备份文件：bk 照带；去掉 bk 的按账单原文重推（量度页载入了分类推荐）
  const arch = t.arch(), logs = await t.logs();
  const mk = (strip) => JSON.stringify({ user: 'x', archive: strip ? '没依据' : '有依据', cats: arch.cats, cps: arch.cps, pms: arch.pms, data: arch.records,
    imports: logs.map(l => { const o = Object.assign({}, l); if (strip) delete o.bk; return o; }) });
  await S.importArchiveFromText(mk(false), w.localStorage.getItem('app_logged_in_user')); await t.idle();
  await S.importArchiveFromText(mk(true), w.localStorage.getItem('app_logged_in_user')); await t.idle();
  const has = (await w.JiwenImportStore.importsRead('有依据')).pop(), no = (await w.JiwenImportStore.importsRead('没依据')).pop();
  ok(Array.isArray(has.bk) && has.bk.length === has.add.length, '5 导入备份：bk 照带');
  ok(!('bk' in no), '5 去掉 bk 的备份：没有 bk');
  const g = (await t.st().measureList(10, '没依据'))[0].acc;
  ok(g && g.src === 'guess' && g.by.person && g.by.person[0] === 1 && g.by.person[1] === 1 && g.by.desc && g.by.desc[0] === 1, '5 没有 bk：按账单原文重推（近似），一样分得出桶：' + JSON.stringify(g));
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`1024-X：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
