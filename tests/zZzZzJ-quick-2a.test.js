// 导入简化 2a：核对页直接「导入」（点一下就导完）/「逐项看看（N 件）」、后果句、大额先问算不算收支、提醒收进总览折叠块和完成页、
//   完成页第一行「撤销这次导入」、选文件页写上次导到哪天、每步顶上「看了 N 件 / 共 M 件」、「只对账」挪进总览、日子管理去掉「入口卡显示几条」。
// 验收：默认路径和「逐项看看、每步不动点到底」写进账本的一样；后果句的数和导完后对得上；笔数对不上拦住；重复导入写「全部导过」；
//   和手记重叠的不重复入账；撤销回到导入前；上次导到哪天两个来源分别写、撤销后退回；提醒不丢。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h || 12, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '某虚构超市', desc: '日用品', io: 'expense', fen: 2000, pm: '余额', status: '交易成功', mno: '', no: '20261' + String(++seq).padStart(23, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const man = (id, d, money, cat) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T12:30`, money, type: 'expense', cat: cat || '吃饭', remark: '虚构手记' });
const MANUAL = [man('m1', 5, 23), man('m2', 5, 23)];
// 一份「每月例行」：手记重叠（两条 23 元手记、一笔 23 元账单 → 拿不准，进待处理）、新商家、一笔 2000 的转账（大额）、没见过的交易类型（提醒）
const MONTH = () => [
  wx({ time: T(10, 5, 12, 40), cp: '某虚构快餐', desc: '套餐', fen: 2300 }),
  wx({ time: T(10, 6), cp: '某虚构新商家', fen: 1999 }), wx({ time: T(10, 7), cp: '某虚构新商家', fen: 2999 }),
  wx({ time: T(10, 9), cp: '某虚构面馆', desc: '午餐', fen: 1800 }),
  wx({ time: T(10, 12, 20), kind: '转账', cp: '*小兰', fen: 200000, desc: '转账备注:房租' }),
  wx({ time: T(10, 15), kind: '某虚构类型', cp: '某虚构平台', fen: 800 }),
];
const wxFile = (txns, o) => [['微信.csv', B.bill('wechat', txns, Object.assign({ range: RANGE }, o || {})).bytes]];
async function pick(t, files) {
  const $ = id => t.d.getElementById(id);
  $('devImportBtn').click();
  await t.until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new t.w.File([bytes], name)), configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan && $('impQuick'), 30000);
}
async function quick(t) {
  const $ = id => t.d.getElementById(id);
  t.w.JiwenImportUI._goStep('check');
  $('impQuick').click();
  await t.until(() => $('impResult') || $('askMask').style.display === 'flex', 30000);
  await t.idle();
}
// 写进账本的东西（记录编号、批次号、导入时间不算：两次跑本来就不一样）
function norm(t) {
  const a = t.arch(), recs = a.records.map(r => { const o = Object.assign({}, r); delete o.id; delete o.batch; o.refundOf = r.refundOf ? 1 : 0; return JSON.stringify(Object.keys(o).sort().reduce((x, k) => (x[k] = o[k], x), {})); }).sort();
  return JSON.stringify({ recs, cats: a.cats, cps: a.cps, pms: a.pms, rules: a.importRules || null });
}

(async () => {
  // ===== 1. 核对页：「导入」/「逐项看看（N 件）」、后果句、大额先问 =====
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await pick(t, wxFile(MONTH()));
  const S = t.S(), p = S.plan;
  ok(S.view.step === 'check' && $('impQuick') && $('impBar').firstElementChild === $('impQuick') && $('impQuick').classList.contains('primary') && !$('impQuick').disabled, '1 核对页底部第一个就是主按钮「导入」');
  ok($('impNext') && /^逐项看看（\d+ 件）$/.test($('impNext').textContent) && $('impBar').contains($('impCancel')), '1 旁边「逐项看看（N 件）」和「取消」：' + $('impNext').textContent);
  const cq = $('impConseq').textContent;
  ok(new RegExp('^导入 ' + p.records + ' 条').test(cq) && new RegExp(p.counts.pending + ' 笔先放进待处理').test(cq) && /笔分类待确认，导完再整理/.test(cq) && !/ 0 笔/.test(cq), '1 后果句：导入 N 条；X 笔先放进待处理；Y 笔分类待确认（数为 0 的不写）：' + cq);
  ok($('impBigAsks') && /大额，先定算不算收支/.test($('impBigAsks').textContent), '1 核对页一小块「大额，先定算不算收支」');
  const big = p.sections.bigAsks.find(x => x.cp === '*小兰');
  const brow = big && $('impBigAsks').querySelector(`.imp-big-row[data-key="${big.key}"]`);
  ok(brow && [...brow.querySelectorAll('.imp-big-m')].map(b => b.dataset.mode).join() === 'normal,flow,skip' && /消费/.test(brow.textContent) && /往来/.test(brow.textContent) && /不计/.test(brow.textContent), '1 2000 的转账：一行「消费 / 往来 / 不计」');
  ok(brow && brow.querySelector('.imp-big-m.on').dataset.mode === big.def && /（推荐）/.test(brow.querySelector(`.imp-big-m[data-mode="${big.def}"]`).textContent), '1 默认选中推荐的：' + (big && big.def));
  ok(t.S().plan.rows.filter(d => d.cp === '某虚构面馆').length === 1 && !p.sections.bigAsks.some(x => x.cp === '某虚构面馆'), '1 小钱不问');
  // 选「消费」：写出影响；选「往来」：当月支出不变，多一个「这笔是期初余额」
  brow.querySelector('.imp-big-m[data-mode="normal"]').click();
  let bx = t.S().plan.sections.bigAsks.find(x => x.cp === '*小兰'), imp = $('impBigAsks').querySelector('.imp-big-impact').textContent;
  const base = bx.monthOut;
  ok(bx.mode === 'normal' && new RegExp('^算进支出，10月支出会从 ' + Math.round(base / 100) + ' 变成 ' + Math.round((base + 200000) / 100) + '$').test(imp), '1 选「消费」：写出影响「算进支出，10月支出会从 x 变成 y」：' + imp);
  $('impBigAsks').querySelector('.imp-big-m[data-mode="flow"]').click();
  bx = t.S().plan.sections.bigAsks.find(x => x.cp === '*小兰'); imp = $('impBigAsks').querySelector('.imp-big-impact').textContent;
  ok(bx.mode === 'flow' && bx.monthOut === base && /算往来，不算进支出，10月支出还是/.test(imp), '1 选「往来」：当月支出不变：' + imp);
  ok($('impBigAsks').querySelector('.imp-big-ob') && !bx.ob, '1 选了往来：旁边多一个「这笔是期初余额」开关（默认关）');
  $('impBigAsks').querySelector('.imp-big-ob').click();
  ok(t.S().plan.sections.bigAsks.find(x => x.cp === '*小兰').ob === true && $('impBigAsks').querySelector('.imp-big-ob.on'), '1 点开关：标成期初余额');
  $('impBigAsks').querySelector('.imp-big-m[data-mode="normal"]').click();
  ok(!t.S().plan.sections.bigAsks.find(x => x.cp === '*小兰').ob && !$('impBigAsks').querySelector('.imp-big-ob') && !(t.S().edits.rows[big.key] || {}).ob, '1 改回消费：期初余额那一项跟着去掉');
  $('impBigAsks').querySelector('.imp-big-m[data-mode="flow"]').click(); $('impBigAsks').querySelector('.imp-big-ob').click();
  // 逐项看看：每步顶上「看了 N 件 / 共 M 件」，提醒类不占一步
  const steps = t.S().view.steps;
  ok(!steps.includes('amount') && t.S().view.items.remind.some(x => /^ty:/.test(x.id)), '1 没见过的类型、金额提醒不单独撑出一步（收进提醒）：' + steps.join());
  $('impNext').click();
  ok(t.S().view.step === steps[1] && /看了 \d+ 件 \/ 共 \d+ 件，不看的按默认/.test($('impIntro').textContent) && !/还剩/.test($('impIntro').textContent), '1 逐项看看：顶上「看了 N 件 / 共 M 件，不看的按默认」：' + $('impIntro').textContent);
  t.w.JiwenImportUI._goStep('overview');
  ok($('impRemindFold') && /^提醒 \d+ 条/.test($('impRemindToggle').textContent) && $('impRemindFold').querySelector('.imp-remind-box').style.display === 'none', '1 总览：折叠块「提醒 N 条」，默认收起');
  ok($('impRemindFold').contains($('impTypes')), '1 没见过的交易类型在提醒里，照旧能选');
  $('impRemindToggle').click();
  ok($('impRemindFold').querySelector('.imp-remind-box').style.display === '', '1 点开看');
  ok($('impReconCard') && $('impReconCard').contains($('impRecon')) && !$('impBar').contains($('impRecon')), '1 有手记：「只对账」在总览里，不在底部');
  t.w.JiwenImportUI._goStep('check');
  ok(!$('impRecon') || !$('impRecon').isConnected, '1 核对页没有「只对账」');
  // 点「导入」：不弹确认面板，直接到完成页
  const want = t.S().plan, wantRv = (() => { let n = 0; want.rows.forEach(d => { if (d.src === 'row' && d.group === 'add' && !d.summary && d.mode !== 'skip' && d.catFrom === 'rec' && (d.cat === '未分类' || (d.rec && d.rec.conf === 'low') || d.ncAuto)) n += d.units || 1; }); return n; })();
  const cq2 = $('impConseq').textContent;
  const D0 = await t.dump();
  const pend0 = (await t.st().pendingRead()).length;
  $('impQuick').click();
  ok(!(t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open')), '1 点「导入」：不弹确认面板');
  await t.until(() => $('impResult'), 30000); await t.idle();
  ok($('impResult') && $('impResult').firstElementChild === $('impResUndo') && $('impResUndo').contains($('impUndoThis')), '1 完成页第一行就是「撤销这次导入」');
  // 后果句的数对得上
  const recs = t.recs(), logs = await t.logs(), last = logs[logs.length - 1];
  const added = last.add.length, rvN = recs.filter(r => r.rv === 1).length, pendN = (await t.st().pendingRead()).length - pend0;
  ok(new RegExp('导入 ' + added + ' 条').test(cq2) && new RegExp(pendN + ' 笔先放进待处理').test(cq2) && new RegExp(rvN + ' 笔分类待确认').test(cq2) && rvN === wantRv, '1 后果句和导完后的数一致（新建 ' + added + '、待处理 ' + pendN + '、待确认 ' + rvN + '）：' + cq2);
  ok(last.m && last.m.path === 'quick', '1 量度里记「导入」（quick）');
  const fz = recs.find(r => r.batch === last.b && Number(r.money) === 2000);
  ok(fz && fz.flow === true && fz.ob === 1, '1 大额选了往来、标了期初余额：写成往来 + ob:1');
  ok(!recs.some(r => r.batch === last.b && Number(r.money) === 23), '1 和手记重叠拿不准的那笔进了待处理，没重复入账');
  // 提醒不丢：完成页「有 N 条提醒 ›」，大额排第一
  ok($('impResRemind') && /^有 \d+ 条提醒 ›$/.test($('impResRemind').textContent), '1 完成页一行「有 N 条提醒 ›」');
  $('impResRemind').click();
  const rl = [...t.d.querySelectorAll('#impRemindList .imp-chg')];
  ok(rl.length && rl[0].dataset.k === 'big' && /房租|小兰/.test(rl[0].textContent) && /算往来/.test(rl[0].textContent) && rl.some(r => r.dataset.k === 'type' && /某虚构类型/.test(r.textContent)), '1 点开：大额排第一，没见过的类型也在：' + rl.map(r => r.textContent).join(' | '));
  $('impRemindClose').click();
  // 撤销：账本、待处理、单号表、新建分类全部回到导入前
  $('impUndoThis').click();
  await t.until(() => t.ask(), 5000);
  await t.askOk();
  await t.until(() => /已撤销/.test((t.d.getElementById('impUndoNotice') || {}).textContent || ''), 10000); await t.idle();
  const D1 = await t.dump();
  const strip = D => { const o = {}; Object.keys(D).forEach(k => { if (!/_p$|_i$/.test(k) || true) o[k] = D[k]; }); return o; };
  const diffKeys = Object.keys(Object.assign({}, D0, D1)).filter(k => JSON.stringify(D0[k]) !== JSON.stringify(D1[k]) && !/app_perf|_bk_M$/.test(k));
  ok(!diffKeys.filter(k => !/_i$/.test(k)).length, '1 撤销以后账本、待处理、单号表回到导入前：' + diffKeys.join());
  ok(JSON.stringify(t.arch().cats) === JSON.stringify(A.CATS), '1 撤销以后分类回到导入前');
  ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));

  // ===== 2. 默认路径和老流程结果一致 =====
  const runOnce = async how => {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL), now: '2026-10-21T10:00:00' });
    seq = 0;
    if (how === 'quick') { await pick(t2, wxFile(MONTH())); await quick(t2); t2.d.getElementById('impBackToLedger').click(); await t2.idle(); }
    else { seq = 0; await t2.importFiles(wxFile(MONTH())); }
    return { n: norm(t2), pend: (await t2.st().pendingRead()).map(x => { const o = Object.assign({}, x); delete o.b; delete o.at; return o; }), errs: t2.errs, log: (await t2.logs()).pop() };
  };
  const q = await runOnce('quick'), st = await runOnce('step');
  ok(q.n === st.n, '2 「导入」和「逐项看看、每步不动点到底」写进账本的记录一样');
  ok(JSON.stringify(q.pend) === JSON.stringify(st.pend) && q.pend.length > 0, '2 待处理一样（' + q.pend.length + ' 笔）');
  ok(q.log.m.path === 'quick' && st.log.m.path === 'step' && q.log.m.n === st.log.m.n && q.log.m.look === st.log.m.look, '2 量度只差走的哪条路');
  ok(!q.errs.length && !st.errs.length, '2 无报错');

  // ===== 3. 笔数对不上：两个按钮都不能点 =====
  {
    const t3 = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
    const txs = [wx({ time: T(10, 3) }), wx({ time: T(10, 4) })];
    await pick(t3, [['缺行.csv', B.bill('wechat', txs, { range: RANGE, statsOverride: { total: 3 } }).bytes]]);
    t3.w.JiwenImportUI._goStep('check');
    ok(t3.d.getElementById('impQuick').disabled && t3.d.getElementById('impNext').disabled && /先不能导入/.test(t3.d.getElementById('impBody').textContent), '3 缺行的文件：「导入」「逐项看看」都不能点，写明换文件');
    t3.d.getElementById('impQuick').click(); await tick(60);
    ok(t3.S().phase === 'confirm' && !t3.recs().length, '3 硬点也不导');
  }

  // ===== 4. 重复导入：第二次写「全部导过，0 条新增」，「导入」不能点；选文件页写上次导到哪天（两个来源分别写），撤销后退回 =====
  {
    const t4 = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
    const $4 = id => t4.d.getElementById(id);
    const W = [wx({ time: T(10, 3), cp: '某虚构书店' }), wx({ time: T(10, 18), cp: '某虚构书店' })];
    const AL = [ali({ time: T(10, 2) }), ali({ time: T(10, 9) })];
    const files = [['微信.csv', B.bill('wechat', W, { range: { from: '2026-10-01 00:00:00', to: '2026-10-18 23:59:59' } }).bytes], ['支付宝.csv', B.bill('alipay', AL, { range: { from: '2026-10-01 00:00:00', to: '2026-10-12 23:59:59' } }).bytes]];
    await pick(t4, files); await quick(t4);
    $4('impBackToLedger').click(); await t4.idle();
    $4('devImportBtn').click();
    await t4.until(() => $4('impPickLast'), 5000);
    const lines = [...$4('impPickLast').querySelectorAll('.imp-line')].map(x => x.textContent);
    ok(lines.length === 2 && /^上次微信导到 10月18日，这次在微信里从 10月18日 开始选。$/.test(lines.find(x => /微信/.test(x)) || '') && /^上次支付宝导到 10月12日/.test(lines.find(x => /支付宝/.test(x)) || '') && /导过的会自动跳过/.test($4('impPickLast').textContent), '4 选文件页：两个来源分别写上次导到哪天：' + lines.join(' | '));
    const input = $4('impFile');
    Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new t4.w.File([bytes], name)), configurable: true });
    input.dispatchEvent(new t4.w.Event('change'));
    await t4.until(() => t4.S() && t4.S().phase === 'confirm' && $4('impQuick'), 30000);
    ok($4('impConseq').textContent === '全部导过，0 条新增' && $4('impQuick').disabled, '4 同一份再导：「全部导过，0 条新增」，「导入」不能点：' + $4('impConseq').textContent);
    A.clickCancel(t4.w); await t4.idle();
    if ($4('impPage').style.display === 'block') t4.w.JiwenImportUI.close();
    // 撤销以后再看：微信、支付宝都退回去（只导过这一次 → 不写）
    const lg = (await t4.logs()).pop();
    await t4.w.eval('JiwenImportEntry.loadImportUI')();
    const up = await t4.st().undoPlan(lg.b); await t4.st().undo(up); await t4.idle();
    $4('devImportBtn').click(); await t4.until(() => $4('impPick')); await tick(80);
    ok(!$4('impPickLast'), '4 撤销以后：上次导到哪天跟着退回（只导过这一次，就不写了）');
    ok(!t4.errs.length, '4 无报错 ' + t4.errs.join('|'));
  }

  // ===== 5. 日子管理去掉了「入口卡显示几条」 =====
  {
    const src = fs.readFileSync(path.join(WWW, 'app', 'days.js'), 'utf8');
    ok(!/getDaysCardN|setDaysCardN|days_card_n_/.test(src) && !/id="dmCount"/.test(html) && !/id="dmSave"/.test(html), '5 days.js 里没有 getDaysCardN，日子管理里没有条数和「保存」');
  }

  console.log(`导入简化 2a：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
