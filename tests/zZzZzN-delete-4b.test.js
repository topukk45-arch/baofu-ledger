// 导入简化 4b：删除导入的记录的两种选法。修改账单里「删除这条记录」对导入的（或已对账的）记录先问：
//   只删这条（下次导入同一段账单，这笔会再导进来）/ 删掉，以后也不导入（单号表里改成「不要了」st:1，反查单号）/ 改成不计 / 撤销整批导入。
//   验收：「只删这条」后重新导入，这笔回来；「删掉，以后也不导入」后重新导入，这笔被跳过。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const TX = [wx({ time: T(3), cp: '某虚构书店', fen: 3600 }), wx({ time: T(4), cp: '某虚构花店', fen: 4100 }), wx({ time: T(6), cp: '某虚构文具', fen: 1200 }), wx({ time: T(7), cp: '某虚构面馆', fen: 2800 }),
  wx({ time: T(9), cp: '某虚构超市', fen: 5000 }), wx({ time: T(10), cp: '某虚构超市', kind: '某虚构超市-退款', io: 'income', fen: 2000, status: '已退款¥20.00', no: '5030000000' + String(++seq).padStart(19, '0') })];
const FILE = () => [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];
const man = { id: 'm1', time: '2026-10-07T12:30', money: 28, type: 'expense', cat: '吃饭', remark: '虚构的面' };

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([man]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles(FILE());
  const byMoney = m => t.recs().find(r => Number(r.money) === m && !r.refundOf);
  const del = async (id, act) => {
    t.w.openEdit(id); await tick();
    $('deleteInEdit').click(); await tick();
    const cs = [...$('askChoices').querySelectorAll('.cc')];
    const labels = cs.map(c => c.querySelector('.cc-label') ? c.querySelector('.cc-label').textContent : c.textContent);
    const i = labels.indexOf(act);
    if (i >= 0) { cs[i].click(); await t.askOk(); await t.idle(); await tick(80); }
    return { labels, msg: t.ask() ? t.ask().msg : $('askMsg').textContent };
  };
  // ===== 1. 问的样子 =====
  const shu = byMoney(36);
  t.w.openEdit(shu.id); await tick(); $('deleteInEdit').click(); await tick();
  const labels = [...$('askChoices').querySelectorAll('.cc-label')].map(x => x.textContent);
  ok($('askTitle').textContent === '删除导入的记录' && labels.join() === '只删这条,删掉，以后也不导入,改成不计,撤销整批导入' && /这笔是微信账单导入的/.test($('askMsg').textContent), '1 导入的记录点删除：先问四种选法：' + labels.join());
  ok(/这笔会再导进来/.test($('askChoices').textContent) && !/不再提醒/.test($('askBox') ? $('askBox').textContent : t.d.body.textContent.slice(0, 0)), '1 「只删这条」写明下次会再导进来；没有「不再提醒」');
  await t.askCancel(); t.w.JiwenForms.closeEditModal();
  ok(byMoney(36), '1 取消：没删');
  // ===== 2. 只删这条 → 重新导入，这笔回来 =====
  await del(shu.id, '只删这条');
  ok(!byMoney(36), '2 「只删这条」：删了');
  // ===== 3. 删掉，以后也不导入 → 重新导入，被跳过 =====
  const hua = byMoney(41);
  await del(hua.id, '删掉，以后也不导入');
  ok(!byMoney(41), '3 「删掉，以后也不导入」：删了');
  // 有退款挂着的原单：退款一起删、一起不再导入
  const cs = byMoney(50);
  { const u = t.w.JiwenStore.loadStore(A.ID); u.archives['默认存档'].records.push({ id: 'rf1', time: '2026-10-11T09:00', money: 10, type: 'income', cat: cs.cat, remark: '退了一点', refundOf: cs.id }); t.w.JiwenStore.saveStore(u, A.ID); await t.idle(); }
  ok(t.recs().some(r => r.refundOf === cs.id), '3 超市那笔挂着一笔退款（你自己挂的）');
  await del(cs.id, '删掉，以后也不导入');
  ok(!byMoney(50) && !t.recs().some(r => r.refundOf === cs.id), '3 原单和挂着的退款一起删了');
  // 已对账的手记
  ok(t.recs().find(r => r.id === 'm1').src && t.recs().find(r => r.id === 'm1').src.merged, '3 手记 m1 和面馆那笔合并了');
  const r1 = await del('m1', '删掉，以后也不导入');
  ok(!t.recs().find(r => r.id === 'm1'), '3 已对账的手记也能「删掉，以后也不导入」：' + r1.labels.join());
  // ===== 4. 改成不计 =====
  const wj = byMoney(12);
  await del(wj.id, '改成不计');
  ok(byMoney(12) && byMoney(12).skip === true, '4 「改成不计」：记录留着，标成不计');
  // ===== 重新导入同一份 =====
  const r = await t.importFiles(FILE(), null, { noGo: true, stay: true });
  const rowOf = fen => r.plan.rows.filter(d => d.src === 'row' && d.fen === fen);
  ok(rowOf(3600).length === 1 && rowOf(3600)[0].group === 'add', '验收：「只删这条」以后重新导入，这笔回来了（新增）');
  ok(rowOf(4100).length === 1 && rowOf(4100)[0].group === 'skip' && rowOf(4100)[0].why === 'ignored', '验收：「删掉，以后也不导入」以后重新导入，这笔被跳过（以前点过「不要了」）');
  ok(rowOf(5000)[0].group === 'skip' && rowOf(5000)[0].why === 'ignored' && rowOf(2000)[0].group === 'skip', '验收：原单跳过（不要了），那笔退款收入照旧算导入过');
  ok(rowOf(2800)[0].group === 'skip', '验收：已对账的手记删掉以后，那笔账单也跳过');
  ok(rowOf(1200)[0].group === 'skip' && rowOf(1200)[0].why === 'imported', '验收：改成不计的，照旧算导入过');
  A.clickCancel(t.w); await t.idle();
  // ===== 5. 撤销整批导入：走同一个撤销（先确认）；撤了以后「不要了」的登记也拿掉 =====
  if (t.w.JiwenImportUI.isOpen()) t.w.JiwenImportUI.close();
  const ws = byMoney(12);
  t.w.openEdit(ws.id); await tick(); $('deleteInEdit').click(); await tick();
  [...$('askChoices').querySelectorAll('.cc')].find(c => /撤销整批导入/.test(c.textContent)).click(); await t.askOk();
  await t.until(() => t.ask() && /撤销/.test(t.ask().title), 8000);
  ok(t.ask() && t.w.JiwenImportUI.isOpen(), '5 「撤销整批导入」：打开导入记录，弹撤销确认');
  await t.askOk();
  await t.until(() => /已撤销/.test((t.d.getElementById('impUndoNotice') || {}).textContent || ''), 10000); await t.idle();
  ok(t.recs().length === 0, '5 撤完：这一批的记录都没了');
  t.w.JiwenImportUI.close();
  const r2 = await t.importFiles(FILE(), null, { noGo: true, stay: true });
  ok(r2.plan.rows.filter(d => d.src === 'row' && d.fen === 4100)[0].group === 'add', '5 撤销那次导入以后，「不要了」的登记跟着拿掉：再导照常新增');
  A.clickCancel(t.w); await t.idle();
  // ===== 6. 手记（没来源的）删除照旧 =====
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([man]), now: '2026-10-21T10:00:00' });
    t2.w.openEdit('m1'); await tick(); t2.$('deleteInEdit').click(); await tick();
    ok(t2.d.getElementById('askChoices').style.display !== 'flex' && t2.d.getElementById('askOk').textContent === '删除这条记录', '6 自己记的：照旧一个确认「删除这条记录」');
    await t2.askOk();
    ok(!t2.recs().length, '6 删了');
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化 4b：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
