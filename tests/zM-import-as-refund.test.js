// 1.1（1016-Z2）「当作退款，挂到某一笔」（jsdom 跑整个 App，真导真撤）。node zM-import-as-refund.test.js [index.html]
// AA：请客 400、朋友转回 300 → 详情里「当作退款，挂到某一笔」挑这一批的那笔 400 → 写成挂在 400 上的退款（分类跟着原单），差额照样差 0 分；
// 跨月 / 换渠道赔付：挑账本里以前的支出（180 天内、更早、还没退完的够挂；不够的不列）；「不挂了」恢复；撤销一起删；
// 没见过的交易类型多一个「当退款挂到原单」。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const ali = o => B.txn(Object.assign({ kind: '转账红包', cp: '某虚构商家', desc: '赔付', io: 'income', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, cat) => ({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: cat || '吃饭', remark: '手记' + id });
const diffZero = p => p.files.filter(f => !f.fatal).every(f => ['expense', 'income', 'neutral'].every(io => !f.diff[io] || !f.diff[io].header || f.diff[io].unreadable === 0));
// 展开明细，点开某一行的详情
async function openRow(t, key) {
  const S = t.S(); S.view.details = true; ['add', 'neutral', 'refund'].forEach(g => { S.view.open[g] = true; }); t.w.JiwenImportUI._goStep('overview');   // 1017-UI2：明细在最后一步「总览」
  const r = [...t.d.querySelectorAll('#impBody .al-row')].find(x => x.dataset.key === key);
  if (r) r.click();
  await t.until(() => (t.d.getElementById('impSheet') && t.d.getElementById('uiSheetMask').classList.contains('open')) && t.$('impSheet').dataset.key === key);
}

(async () => {
  // ===== 1. AA：挂到这一批的那笔 400 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    const treat = wx({ time: T(10, 5, 19), cp: '某虚构饭店', desc: '聚餐', fen: 40000 });
    const back = wx({ time: T(10, 6, 9), kind: '转账', cp: '张*', desc: '转账备注:饭钱', io: 'income', fen: 30000 });
    const D0 = await t.dump();
    await t.importFiles([['微信.csv', B.bill('wechat', [treat, back], { range: RANGE }).bytes]], null, { noGo: true, stay: true });
    const kb = 'wechat|' + back.no;
    await openRow(t, kb);
    ok(!!t.$('impAsRefund'), '1 收入那笔的详情里有「当作退款，挂到某一笔」');
    t.$('impAsRefund').click();
    await t.until(() => t.d.querySelector('.imp-rp-row'));
    const rows = [...t.d.querySelectorAll('.imp-rp-row')];
    ok(rows.length === 1 && /某虚构饭店|聚餐/.test(rows[0].textContent) && /400\.00/.test(rows[0].textContent), '1 候选：这一批里那笔 400');
    rows[0].querySelector('.imp-rp-pick').click();
    ok(!!t.$('impAsRefundOff'), '1 详情里能「不挂了」');
    t.$('impSheetOk').click();      // 1017-UI10：详情里的改动点「确定」才生效
    const d = t.S().plan.rows.find(x => x.key === kb);
    ok(d.group === 'refund' && d.refundTo && d.refundTo.row && diffZero(t.S().plan), '1 挂上了：这笔进「退款」组，差额照样差 0 分');
    A.clickGo(t.w);
    await t.until(() => t.$('impResult'));
    t.$('impBackToLedger').click(); await t.idle();
    const o = t.recs().find(r => r.money === 400), rf = t.recs().find(r => r.money === 300);
    ok(rf && rf.refundOf === o.id && rf.cat === o.cat && rf.type === 'income', '1 写成挂在 400 那笔上的退款，分类跟着原单');
    await t.w.eval('loadImportUI')();
    const [lg] = await t.logs(); const p = await t.st().undoPlan(lg.b); await t.st().undo(p); await t.idle();
    ok(same(await t.dump(), D0), '1 撤销：和导入前逐字节一样');
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }
  // ===== 2. 换渠道赔付：挂到账本里以前的支出；不够挂的不列；「不挂了」恢复 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([man('e1', 9, 20, 200, '购物'), man('e2', 9, 25, 30, '购物'), man('e3', 3, 1, 500, '购物')]) });
    const pay = ali({ time: T(10, 8), fen: 5000 });
    await t.importFiles([['支付宝.csv', B.bill('alipay', [pay], { range: RANGE }).bytes]], null, { noGo: true, stay: true });
    const k = 'alipay|' + pay.no;
    await openRow(t, k);
    t.$('impAsRefund').click();
    await t.until(() => t.d.querySelector('.imp-rp-rec') || /没找到/.test(t.$('impRefundPick').textContent));
    const ids = [...t.d.querySelectorAll('.imp-rp-rec')].map(x => x.dataset.id);
    ok(same(ids, ['e1']), '2 账本里的候选：200 的那笔；30 的不够挂、3 月的超过 180 天，都不列 ' + JSON.stringify(ids));
    t.d.querySelector('.imp-rp-rec .imp-rp-pick').click(); t.$('impSheetOk').click();
    ok(t.S().plan.rows.find(x => x.key === k).group === 'refund', '2 挂上了');
    await openRow(t, k); t.$('impAsRefundOff').click(); t.$('impSheetOk').click();
    ok(t.S().plan.rows.find(x => x.key === k).group !== 'refund', '2 「不挂了」：恢复成收入');
    await openRow(t, k); t.$('impAsRefund').click();
    await t.until(() => t.d.querySelector('.imp-rp-rec'));
    t.d.querySelector('.imp-rp-rec .imp-rp-pick').click(); t.$('impSheetOk').click();
    A.clickGo(t.w);
    await t.until(() => t.$('impResult'));
    t.$('impBackToLedger').click(); await t.idle();
    const rf = t.recs().find(r => r.money === 50);
    ok(rf && rf.refundOf === 'e1' && rf.cat === '购物' && rf.src.app === 'alipay', '2 写成挂在以前那笔 200 上的退款（跨来源也能挂）');
    ok(!t.errs.length, '2 无报错 ' + t.errs.join('|'));
  }
  // ===== 3. 没见过的交易类型：多一个「当退款挂到原单」=====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    await t.importFiles([['微信.csv', B.bill('wechat', [wx({ time: T(10, 9), kind: '某虚构新退款类型', io: 'income', fen: 800 })], { range: RANGE }).bytes]], S => {
      t.$('impTypes');   // 1017-UI2：走到放「没见过的交易类型」的那一步
      const sel = t.d.querySelector('.imp-type-sel');
      ok(sel && [...sel.options].some(o => o.value === 'refund' && /当退款/.test(o.textContent)), '3 没见过的交易类型多一个「当退款挂到原单」');
    }, { noGo: true });
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
