// 1023-P 期初余额（jsdom）。node zZzZzH-opening-1023p.test.js [index.html]
// 记录上可有可无的 ob:1，只在「往来」的记录上算数；详情里只有往来的记录（退款不算、只看的不算）有一行开关「这笔是期初余额」；可以几笔都标，
// 总结余里期初余额是它们的合计、「往来」那一行不算它们；不看备注；列表里写「期初」小标签；导入结果页「补一笔期初余额」记下的那笔带标记；
// 修改成不是往来了标记去掉；导入备份文件照搬（只在往来的记录上）。记录全是虚构的。今天是 2026-10-23。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark }, extra || {});
const CATS = ['未分类', '吃饭', '转账', '其他', '工资'];

(async () => {
  const recs = [
    R('op1', '2026-10-01T08:00', 2000, 'income', '其他', '老钱包', { flow: true, ob: 1 }),
    R('op2', '2026-10-01T08:10', 500, 'income', '其他', '银行卡', { flow: true, ob: 1 }),
    R('fl', '2026-10-05T09:00', 300, 'expense', '转账', '还朋友', { flow: true }),
    R('rem', '2026-10-06T09:00', 100, 'income', '其他', '期初余额', { flow: true }),     // 备注写了「期初余额」但没标：照算往来（不自动认）
    R('nx', '2026-10-07T12:00', 40, 'expense', '吃饭', '午饭', { ob: 1 }),               // 不是往来却带着 ob：当没有
    R('wg', '2026-10-15T09:00', 800, 'income', '工资', ''),
  ];
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed: A.seedOf(recs, CATS) });
  const { $, d, w } = t;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const recOf = id => w.JiwenStore.getUserData().find(r => r.id === id);
  const balRows = () => { w.JiwenStats.renderStats(); if (!$('statBalRows')) $('statBalHead').click(); return [...$('statBalRows').querySelectorAll('.st-bal-row')].map(r => [...r.children].map(txt).join(' ')); };
  const rowTag = id => { const r = $('billList').querySelector(`.bl-row[data-id="${id}"]`); return r ? [...r.querySelectorAll('.io-skip, .io-flow')].map(txt).join() : null; };
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await tick();

  // 1. 总结余：期初余额是标了的几笔的合计，往来不算它们；不看备注；不是往来的 ob 不算
  ok(w.JiwenStore.isOpening(recOf('op1')) && !w.JiwenStore.isOpening(recOf('nx')) && !w.JiwenStore.isOpening(recOf('rem')), '1 isOpening：往来 + ob 才算');
  let rs = balRows();
  ok(rs[0] === '期初余额 2500.00', '1 期初余额 = 2000 + 500（两笔都标了）：' + rs[0]);
  ok(rs[3] === '− 往来（转账、存取钱、借还钱） 200.00', '1 往来 = −300 + 100（备注「期初余额」那笔没标，照算往来）：' + rs[3]);
  ok(rs[4] === '= 总结余 3060.00' && txt($('statBalNum')) === '3060.00', '1 总结余 2500 + 800 − 40 − 200 = 3060：' + rs[4]);

  // 2. 列表里「期初」小标签
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await tick();
  ok(rowTag('op1') === '期初' && rowTag('op2') === '期初', '2 标了的往来写「期初」');
  ok(rowTag('fl') === '往来' && rowTag('rem') === '往来', '2 没标的往来照写「往来」');
  ok(rowTag('nx') === '', '2 不是往来的（带着 ob）不写标签');

  // 3. 详情里的开关
  w.JiwenDetail.openDetail('fl'); await tick();
  ok($('detailObRow') && $('detailObRow').tagName === 'BUTTON' && txt($('detailObRow')) === '期初这笔是期初余额' && !$('detailObSw').classList.contains('on'), '3 往来的记录：一行「这笔是期初余额」，开关关着');
  $('detailObRow').click(); await tick();
  ok(recOf('fl').ob === 1 && $('detailObSw').classList.contains('on') && $('detailObRow').getAttribute('aria-pressed') === 'true', '3 点一下：记录上 ob:1，开关开着，详情还开着');
  ok(rowTag('fl') === '期初', '3 列表跟着写「期初」');
  rs = balRows();
  ok(rs[0] === '期初余额 2200.00' && rs[3] === '+ 往来（转账、存取钱、借还钱） 100.00', '3 总结余跟着变：期初 2500 − 300、往来只剩 +100：' + rs[0] + ' / ' + rs[3]);
  $('detailObRow').click(); await tick();
  ok(!('ob' in recOf('fl')) && !$('detailObSw').classList.contains('on'), '3 再点：标记去掉（字段删掉，不是写 0）');
  w.JiwenDetail.closeDetail(); await tick();
  w.JiwenDetail.openDetail('nx'); await tick();
  ok(!$('detailObRow'), '3 不是往来的记录：没有这一行');
  w.JiwenDetail.closeDetail(); await tick();
  w.JiwenDetail.openDetail('wg'); await tick();
  ok(!$('detailObRow'), '3 计入的收入：没有这一行');
  w.JiwenDetail.closeDetail(); await tick();
  w.JiwenDetail.openDetail('op1', { readonly: true }); await tick();
  ok(!$('detailObRow'), '3 只看的详情（批量清单里进来的）：没有这一行');
  w.JiwenDetail.closeDetail(); await tick();

  // 4. 修改成不是往来：标记去掉；还是往来：标记留着
  w.openEdit('op2'); await tick();
  $('editRemark').value = '银行卡（改了备注）'; $('saveEdit').click(); await tick();
  ok(recOf('op2').ob === 1 && recOf('op2').remark === '银行卡（改了备注）', '4 改备注、还是往来：标记留着');
  w.openEdit('op2'); await tick();
  w.JiwenForms.setModeChips($('editMode'), 'normal'); $('saveEdit').click(); await tick();
  ok(!('ob' in recOf('op2')) && !recOf('op2').flow, '4 改成计入：标记一起去掉');

  // 5. 导入结果页「补一笔期初余额」：记下的那笔带标记；平常记的往来不带
  w.JiwenImportNext.opening(); await tick();
  ok($('addMask').style.display === 'flex' && $('billMode').dataset.mode === 'flow' && $('billRemark').value === '期初余额', '5 打开记一笔：收入、往来、备注「期初余额」');
  $('billMoney').value = '1234'; w.JiwenForms.pickBillCat('其他'); $('addBill').click(); await tick();
  const nw = w.JiwenStore.getUserData().find(r => r.money === 1234);
  ok(nw && nw.flow === true && nw.ob === 1, '5 存下来的那笔：往来、ob:1');
  if ($('askMask').style.display !== 'none') $('askCancel').click(); await tick();
  w.JiwenForms.openAddModal(); await tick();
  ok($('billMode').dataset.mode === 'normal', '5 再打开记一笔：回到平常（标记不带过来）');
  [...$('billTypeChips').children].find(x => x.textContent === '收入').click();
  w.JiwenForms.setModeChips($('billMode'), 'flow');
  $('billMoney').value = '77'; w.JiwenForms.pickBillCat('其他'); $('addBill').click(); await tick();
  const n2 = w.JiwenStore.getUserData().find(r => r.money === 77);
  ok(n2 && n2.flow === true && !('ob' in n2), '5 平常记的往来：不带标记');
  if ($('askMask').style.display !== 'none') $('askCancel').click(); await tick();
  // 「补一笔期初余额」打开以后改成计入再存：不带
  w.JiwenImportNext.opening(); await tick();
  w.JiwenForms.setModeChips($('billMode'), 'normal');
  $('billMoney').value = '55'; w.JiwenForms.pickBillCat('其他'); $('addBill').click(); await tick();
  const n3 = w.JiwenStore.getUserData().find(r => r.money === 55);
  ok(n3 && !n3.flow && !('ob' in n3), '5 打开以后改成计入再存：不带标记');
  if ($('askMask').style.display !== 'none') $('askCancel').click(); await tick();

  // 6. 导入备份文件：往来的照搬，不是往来的不要
  w.JiwenStore.importArchiveFromText(JSON.stringify({ user: 'x', archive: '导入', cats: CATS,
    data: [R('a', '2026-07-01T00:00', 100, 'income', '其他', '期初', { flow: true, ob: 1 }), R('b', '2026-07-02T00:00', 9, 'expense', '吃饭', '', { ob: 1 }), R('c', '2026-07-03T00:00', 9, 'income', '其他', '', { flow: true, ob: 2 })] }), w.localStorage.getItem('app_logged_in_user'));
  const arc = JSON.parse(w.JiwenStore.ledgerGet(w.JiwenStore.storeKey())).archives['导入'].records;
  ok(arc.find(r => r.money === 100).ob === 1, '6 往来的期初余额：照搬');
  ok(!('ob' in arc.find(r => r.money === 9 && r.type === 'expense')) && !('ob' in arc.find(r => r.type === 'income' && r.money === 9)), '6 不是往来的、值不对的：不要');
  // 导出备份里带着
  const bk = w.JiwenStore.odBuildPayload();
  ok(bk.data.find(r => r.id === 'op1').ob === 1, '6 备份 / 云备份里原样带着 ob');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1023-P 期初余额：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
