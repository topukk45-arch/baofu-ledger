// 导入简化 7b：按天对账「以账单为准」。这天的账单照常新增，手记的分类和备注带到时间最近的那笔账单上；
//   这天没配上的手记不真删，标「已被账单替换」（rp:1）：列表、统计、结余、预算、搜一笔、AI 导出、最近常用分类、账本历史学习、退款挂靠
//   都看不到它（getUserData() 一处去掉；导入那边直接读缓存的几个查询各自跳过）；存别的记录时它留在原位；撤销导入时去掉标记、手记回来；
//   备份照带。另外把直接读账本（不走 getUserData）的地方数锁住：数变了要过一遍是不是要跳过 rp。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h: h || 12, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const man = (id, d, h, money, cat, remark) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`, money, type: 'expense', cat: cat || '吃饭', remark: remark || '' });
// 5 日：手记 b1 40（吃饭，「虚构的午饭」）、b2 12（购物，「虚构的纸巾」）；账单 13:00 某虚构饭店 55、18:00 某虚构便利店 6 → 差 9，选以账单为准
// 8 日：手记 c1 25；账单 26 → 逐笔看对不上 → 不动它（照 7a）
const MAN = [man('b1', 5, 12, 40, '吃饭', '虚构的午饭'), man('b2', 5, 19, 12, '购物', '虚构的纸巾'), man('k1', 1, 9, 9, '杂项', '虚构的地铁')];
const TX = [wx({ time: T(5, 13), cp: '某虚构饭店', fen: 5500 }), wx({ time: T(5, 18), cp: '某虚构便利店', fen: 600 }), wx({ time: T(7, 10), cp: '某虚构书店', fen: 1800 })];
const FILE = () => [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];

// ===== 0. 直接读账本、不走 getUserData() 的地方：数锁住（加了新的要过一遍是不是要跳过「已被账单替换」的）=====
{
  const cnt = (f, re) => (fs.readFileSync(path.join(WWW, f), 'utf8').match(re) || []).length;
  // 文件：[ .records 次数, .recs 次数 ]。store.js 里读的有：存储 / 备份 / 撤销 / 恢复（要原样带上 rp）、
  //   archiveInfo / ledgerFor / refundTargets / rvRows / aiExportRows / 待处理候选（用 liveRecs 跳过）；cats.js 数用着的记录（跳过 rp）
  const LOCK = { 'app/store.js': [62, 35],   // 第 10 版 archiveInfo 多两处（读的是已经去掉 rp 的 st.recs）
                'app/cats.js': [6, 0], 'app/tabs.js': [3, 0], 'app/login.js': [2, 0], 'app/import-entry.js': [3, 0] };
  const files = fs.readdirSync(path.join(WWW, 'app')).filter(f => f.endsWith('.js')).map(f => 'app/' + f);
  files.forEach(f => {
    const got = [cnt(f, /\.records\b/g), cnt(f, /\.recs\b/g)], want = LOCK[f] || [0, 0];
    ok(got[0] === want[0] && got[1] === want[1], '0 ' + f + ' 直接读账本的地方数没变（.records ' + got[0] + '、.recs ' + got[1] + '）');
  });
  const st = fs.readFileSync(path.join(WWW, 'app/store.js'), 'utf8');
  ok(/function getUserData\(\)\{[\s\S]{0,400}filter\(r=>!isReplaced\(r\)\)/.test(st), '0 getUserData() 统一去掉「已被账单替换」的');
  ['aiExportRows', 'rvRows', 'refundTargets', 'ledgerFor'].forEach(fn => {
    const i = st.search(new RegExp('\\n {12}(async )?' + fn + '\\(')), body = st.slice(i, i + 600);
    ok(i > 0 && /liveRecs\(/.test(body), '0 ' + fn + ' 跳过「已被账单替换」的');
  });
  { const i = st.indexOf('            archiveInfo('); ok(/liveRecs\(st0\.recs\)/.test(st.slice(i, i + 400)), '0 archiveInfo（分类历史、账本历史学习、月支出）跳过'); }
  { const i = st.indexOf('function impPendRecs'); ok(/!isReplaced\(r\)/.test(st.slice(i, i + 500)), '0 待处理的候选手记跳过'); }
}

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  const all = () => t.recs(), live = () => t.w.JiwenStore.getUserData();
  const r0 = await t.importFiles(FILE(), null, { noGo: true, stay: true });
  const d5 = r0.plan.sections.days.find(x => x.day === '2026-10-05');
  ok(d5 && d5.diff === -900 && d5.choice === null, '1 5 日：你记了 52，账单 61，差 9，要你选：' + JSON.stringify(d5 && { diff: d5.diff, c: d5.choice }));
  // ===== 1. 界面：三个选择 =====
  t.w.JiwenImportUI._goStep('match');
  const dr = t.d.querySelector('#impDays .imp-day-row[data-day="2026-10-05"]');
  ok(dr && [...dr.querySelectorAll('.imp-day-m')].map(b => b.textContent).join() === '以手记为准,以账单为准,逐笔看', '1 一天三个选择：以手记为准 / 以账单为准 / 逐笔看');
  dr.querySelector('.imp-day-m[data-v="bill"]').click();
  const p = t.S().plan, rowOf = fen => p.rows.find(d => d.src === 'row' && d.fen === fen);
  ok(rowOf(5500).group === 'add' && rowOf(600).group === 'add' && rowOf(5500).cat === '吃饭' && rowOf(600).cat === '购物', '1 以账单为准：两笔账单新增，分类接时间最近的那条手记（饭店 ← 午饭「吃饭」、便利店 ← 纸巾「购物」）');
  ok(/已被账单替换/.test(t.d.querySelector('#impDays .imp-day-row[data-day="2026-10-05"]').textContent), '1 写明手记那几条会标「已被账单替换」');
  A.clickGo(t.w);
  await t.until(() => $('impResult'), 30000); await t.idle();
  const lg = (await t.logs()).pop();
  const rf = id => all().find(r => r.id === id);
  ok(rf('b1') && rf('b1').rp === 1 && rf('b2').rp === 1 && !rf('k1').rp, '2 手记 b1、b2 不真删，标 rp:1；别的手记不动');
  const fan = all().find(r => Number(r.money) === 55), bian = all().find(r => Number(r.money) === 6);
  ok(fan && fan.cat === '吃饭' && /^虚构的午饭/.test(fan.remark) && !fan.rv && bian.cat === '购物' && /^虚构的纸巾/.test(bian.remark), '2 账单记录接上了手记的分类和备注（不算待确认）：' + (fan && fan.remark));
  ok(lg.chg.some(c => c.id === 'b1' && c.was.rp === null && c.now.rp === 1), '2 导入记录里记下 rp 的原值（撤销按逐字段还原）');
  $('impBackToLedger').click(); await t.idle();
  // ===== 3. 读账本的每个地方都看不到 =====
  ok(!live().some(r => r.id === 'b1' || r.id === 'b2') && all().length === live().length + 2, '3 getUserData() 去掉了这两条');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle(); t.w.JiwenLedger.listFlush();
  ok(!t.d.querySelector('#billList .bl-row[data-id="b1"]') && t.d.querySelector('#billList .bl-row[data-id="' + fan.id + '"]'), '3 账单列表：看不到');
  t.d.querySelector('.tab-btn[data-tab="stats"]').click(); await t.idle();
  ok($('statMonthOut').textContent === '88.00', '3 统计：当月支出 55 + 6 + 18 + 地铁 9 = 88（不算 40、12）：' + $('statMonthOut').textContent);
  ok(/−88\.00/.test($('statBalNum').textContent), '3 结余：−88.00：' + $('statBalNum').textContent);
  ok(t.w.JiwenStore.budgetSpentIn(live(), '吃饭', 2026, 9) === 55 && t.w.JiwenStore.budgetSpentIn(live(), '购物', 2026, 9) === 6, '3 预算：吃饭已花 55、购物已花 6');
  t.w.JiwenSearch.openSearch(); await tick();
  t.w.JiwenSearch.searchNow && null;
  $('searchKeyword').value = '虚构的午饭'; $('searchKeyword').dispatchEvent(new t.w.Event('input')); t.w.JiwenSearch.render(); t.w.JiwenSearch.searchFlush();
  ok($('searchList').querySelectorAll('.bl-row').length === 1 && $('searchList').querySelector('.bl-row').dataset.id === fan.id, '3 搜一笔：搜「虚构的午饭」只有那笔账单');
  t.w.closeFilterSheet(); t.w.JiwenSearch.closeSearch(); await tick(300);
  const ai = t.w.JiwenAiExport.buildAiText(live(), '2026年10月', '按月');
  ok(!/40\.00/.test(ai) && /55\.00/.test(ai), '3 AI 导出：没有那条 40 的手记');
  ok(t.w.JiwenStore.recentCats('expense', 4, new Date('2026-10-21T10:00:00')).indexOf('吃饭') >= 0, '3 最近常用分类：照常（吃饭来自账单那笔）');
  const info = t.st().archiveInfo();
  ok(info.manualN === 1 && info.monthIO['2026-10'].e === 8800, '3 账本历史 / 月支出（导入用）：不算这两条：' + info.manualN + ' ' + JSON.stringify(info.monthIO['2026-10']));
  ok(!t.st().ledgerFor({ manual: { from: '2026-10-01', to: '2026-10-31' } }).manual.some(m => m.id === 'b1'), '3 再导入时：这两条不拿去配对');
  ok(!t.st().refundTargets({ time: '2026-10-21T00:00', fen: 100 }).some(x => x.id === 'b1'), '3 退款挂靠：候选里没有');
  // ===== 4. 存别的记录：藏着的那两条留在原位 =====
  t.w.openEdit('k1'); await tick(); $('editRemark').value = '虚构的地铁（改）'; $('saveEdit').click(); await t.idle();
  const ids = all().map(r => r.id);
  ok(rf('b1') && rf('b1').rp === 1 && rf('k1').remark === '虚构的地铁（改）' && ids.indexOf('b1') >= 0 && ids.indexOf('b2') === ids.indexOf('b1') + 1, '4 改别的记录：藏着的两条还在、还挨着');
  // ===== 5. 备份照带，导成另一个存档也是藏着的 =====
  $('exportBtn').click(); await t.until(() => t.w.__files.length);
  await t.w.JiwenStore.importArchiveFromText(t.w.__files[t.w.__files.length - 1], A.ID); await t.idle();
  const names = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives), a2 = names[names.length - 1];
  ok(t.w.JiwenStore.loadStore(A.ID).archives[a2].records.filter(r => r.rp === 1).length === 2, '5 导入备份成另一个存档：rp 照带');
  // ===== 6. 撤销：标记去掉、手记回来 =====
  const up = await t.st().undoPlan(lg.b); await t.st().undo(up); await t.idle();
  ok(rf('b1') && !('rp' in rf('b1')) && live().some(r => r.id === 'b1') && live().some(r => r.id === 'b2') && !all().some(r => Number(r.money) === 55), '6 撤销那次导入：标记去掉，手记回来，账单那几笔没了');
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle(); t.w.JiwenLedger.listFlush();
  ok(t.d.querySelector('#billList .bl-row[data-id="b1"]'), '6 列表里又看得到');
  // ===== 7. 挂着退款的手记不按天对 =====
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(MAN.concat([{ id: 'rb', time: '2026-10-06T09:00', money: 5, type: 'income', cat: '吃饭', remark: '虚构退款', refundOf: 'b1' }])), now: '2026-10-21T10:00:00' });
    const r2 = await t2.importFiles(FILE(), null, { noGo: true, stay: true });
    const x = r2.plan.sections.days.find(y => y.day === '2026-10-05');
    ok(x && x.records.indexOf('b1') < 0 && x.records.indexOf('b2') >= 0, '7 挂着退款的手记 b1 不按天对（替换掉它退款就没了原单）');
    A.clickCancel(t2.w);
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化 7b：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
