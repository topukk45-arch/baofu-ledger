// 导入简化 7a：按天对账（以手记为准、逐笔看）。现有配对做完后还剩下的支出账单，这一天还有没配上的手记：按天对钱数。
//   差 0 的天直接按手记为准（不列出来）：手记不动，账单只登记单号、不入账；别的天在「和手记对不上的」那一步一天一行
//   「10月5日：你记了 1 笔 40.00，账单 1 笔 55.00，差 15.00」，选「以手记为准」/「逐笔看」，不选的这几笔留在待处理（不进账本）。
//   当天没有手记的、手记都配上了的照旧是新增（漏记）。完成页「N 天按手记为准」点开逐笔看。jsdom 真导，数据全是虚构的。
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
const man = (id, d, h, money) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`, money, type: 'expense', cat: '吃饭', remark: '虚构手记' + id });
// 3 日：两条手记 30 + 20 = 50，两笔账单 15 + 35 = 50（一笔都配不上，但钱数对得上）→ 按手记为准
// 5 日：手记 40，账单 55 → 差 15，要你选
// 7 日：没有手记，账单 18 → 漏记，照常新增
// 9 日：手记 12 和账单 12 正好配上，另有一笔 33 → 手记都配上了，33 照常新增
const MAN = [man('a1', 3, 9, 30), man('a2', 3, 19, 20), man('b1', 5, 12, 40), man('c1', 9, 12, 12)];
const TX = [wx({ time: T(3, 8), cp: '某虚构早点', fen: 1500 }), wx({ time: T(3, 21), cp: '某虚构夜宵', fen: 3500 }),
  wx({ time: T(5, 13), cp: '某虚构饭店', fen: 5500 }), wx({ time: T(7, 10), cp: '某虚构书店', fen: 1800 }),
  wx({ time: T(9, 12, 5), cp: '某虚构面馆', fen: 1200 }), wx({ time: T(9, 18), cp: '某虚构花店', fen: 3300 })];
const FILE = () => [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  let S = null;
  const r0 = await t.importFiles(FILE(), s => { S = s; }, { noGo: true, stay: true });
  const p = r0.plan, row = fen => p.rows.find(d => d.src === 'row' && d.fen === fen);
  const days = p.sections.days;
  // ===== 1. 方案 =====
  const d3 = days.find(x => x.day === '2026-10-03'), d5 = days.find(x => x.day === '2026-10-05');
  ok(d3 && d3.auto && d3.choice === 'manual' && d3.mN === 2 && d3.bN === 2 && d3.diff === 0, '1 3 日：你记了 2 笔 50，账单 2 笔 50，差 0：直接按手记为准');
  ok(row(1500).group === 'skip' && row(1500).why === 'daymanual' && row(3500).group === 'skip', '1 3 日的两笔账单：只登记、不入账');
  ok(d5 && !d5.auto && d5.choice === null && d5.diff === -1500, '1 5 日：差 15，要你选');
  ok(row(5500).group === 'pending' && row(5500).dayPend && (row(5500).cands || []).some(c => c.record === 'b1'), '1 5 日没选：账单留在待处理，候选是这天没配上的手记');
  ok(!days.some(x => x.day === '2026-10-07') && row(1800).group === 'add', '1 7 日没有手记：照常新增（漏记）');
  ok(!days.some(x => x.day === '2026-10-09') && row(1200).group === 'merge' && row(3300).group === 'add', '1 9 日手记都配上了：另一笔照常新增');
  // ===== 2. 界面：「和手记对不上的」那一步一天一行 =====
  t.w.JiwenImportUI._goStep('match');
  const dr = t.d.querySelector('#impDays .imp-day-row[data-day="2026-10-05"]');
  ok(dr && /10月5日：你记了 1 笔 40\.00，账单 1 笔 55\.00，差 15\.00/.test(dr.textContent) && !t.d.querySelector('#impDays .imp-day-row[data-day="2026-10-03"]'), '2 一天一行「10月5日：你记了 1 笔 40.00，账单 1 笔 55.00，差 15.00」；差 0 的天不列');
  ok(/另有 1 天手记和账单的钱数正好对得上/.test($('impDaysAuto').textContent), '2 写一句「另有 1 天……按手记为准」');
  ok(!t.d.querySelector('.imp-pend-row[data-key="' + row(5500).key + '"]'), '2 那笔不再单列在「待你确认」里');
  dr.querySelector('.imp-day-m[data-v="each"]').click();
  let p2 = t.S().plan;
  ok(p2.sections.days.find(x => x.day === '2026-10-05').choice === 'each' && p2.rows.find(d => d.fen === 5500).group === 'add', '2 「逐笔看」：照原来一笔一笔（这笔配不上任何手记，作为新增）');
  t.d.querySelector('#impDays .imp-day-row[data-day="2026-10-05"] .imp-day-m[data-v="manual"]').click();
  p2 = t.S().plan;
  ok(p2.rows.find(d => d.fen === 5500).group === 'skip' && p2.rows.find(d => d.fen === 5500).dayInto === 'b1', '2 「以手记为准」：只登记单号（指到 b1）');
  // ===== 3. 导入：只登记、不入账；完成页「2 天按手记为准」 =====
  A.clickGo(t.w);
  await t.until(() => $('impResult'), 30000); await t.idle();
  const recs = t.recs();
  ok(!recs.some(r => [15, 35, 55].includes(Number(r.money)) && r.src) && recs.some(r => Number(r.money) === 18 && r.src) && recs.some(r => Number(r.money) === 33 && r.src), '3 按手记为准的几笔没入账；漏记的照常新建');
  ok(recs.find(r => r.id === 'b1').money === 40 && !recs.find(r => r.id === 'b1').src && !recs.find(r => r.id === 'a1').src, '3 手记不动');
  ok($('impResDays') && /2 天按手记为准（3 笔账单只登记了单号，没入账）/.test($('impResDays').textContent), '3 完成页「2 天按手记为准」：' + ($('impResDays') && $('impResDays').textContent));
  $('impResDays').click(); await tick();
  ok(t.d.querySelectorAll('#impRows .imp-rs').length === 3, '3 点开能逐笔看');
  t.d.getElementById('impRowsClose').click();
  $('impBackToLedger').click(); await t.idle();
  // 再导同一份：都算导入过
  const r2 = await t.importFiles(FILE(), null, { noGo: true, stay: true });
  ok([1500, 3500, 5500].every(f => r2.plan.rows.filter(d => d.fen === f).every(d => d.group === 'skip' && d.why === 'imported')), '3 再导同一份：按手记为准的那几笔算导入过（单号登记了）');
  A.clickCancel(t.w); await t.idle();
  // ===== 4. 撤销：登记拿掉 =====
  const lg = (await t.logs()).pop();
  const up = await t.st().undoPlan(lg.b); await t.st().undo(up); await t.idle();
  const r3 = await t.importFiles(FILE(), null, { noGo: true, stay: true });
  ok(r3.plan.rows.find(d => d.fen === 5500).group === 'pending' && r3.plan.sections.days.some(x => x.day === '2026-10-03' && x.auto), '4 撤销以后再导：又按天对（5 日留在待处理、3 日按手记为准）');
  A.clickCancel(t.w); await t.idle();
  // ===== 5. 默认路径（核对页直接导入）：不选的天进待处理 =====
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(MAN), now: '2026-10-21T10:00:00' });
    await t2.importFiles(FILE());
    const pend = await t2.st().pendingRead();
    ok(pend.some(x => x.amt === 5500 && (x.cand || []).includes('b1')) && !t2.recs().some(r => Number(r.money) === 55), '5 不选：5 日那笔在待处理里（候选 b1），不进账本');
    const list = await t2.st().pendingCheck();
    ok(list.find(x => x.item.amt === 5500).cands.some(c => c.id === 'b1' && c.ok), '5 待处理页里能和 b1 合并');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化 7a：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
