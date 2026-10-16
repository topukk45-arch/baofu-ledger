// 第二期（1016-Z7）月初导入提醒（只在 App 里，jsdom）。node zR-import-remind.test.js [index.html]
// 每月前 10 天，这个存档导入过、最后一次导到的日子还没到上个月月底 → 账单上方「10 月的微信、支付宝账单可以导了」[去导入][这个月不提醒]；
// 点「这个月不提醒」这台手机上这个月不再出现；导到月底了、过了 10 号、从没导过、开发开关关着都不提醒。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
let seq = 0;
const file = (to) => [['微信.csv', B.bill('wechat', [B.txn({ time: { y: 2026, mo: 10, d: 3, h: 12, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构店', desc: '书', io: 'expense', fen: 1000 + (++seq), pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(seq).padStart(19, '0') })], { range: { from: '2026-10-01 00:00:00', to } }).bytes]];
const settle = async t => { await t.idle(); await new Promise(r => setTimeout(r, 20)); await t.idle(); };
const ledger = async t => { t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); t.w.eval('renderBill')(); await settle(t); };

(async () => {
  {
    const t = await A.boot({ html, www: WWW, now: '2026-11-03T10:00:00', seed: A.seedOf([]) });
    await ledger(t);
    ok(!t.$('impRemind'), '1 从没导过：不提醒');
    await t.importFiles(file('2026-10-20 23:59:59'));
    await ledger(t);
    ok(t.$('impRemind') && /10 月的微信、支付宝账单可以导了（上次导到 2026-10-20）/.test(t.$('impRemind').textContent) && t.$('impRemindGo') && t.$('impRemindOff'), '1 11 月 3 日、上次导到 10-20：提醒导 10 月的');
    t.$('impRemindGo').click();
    await t.until(() => t.$('impPage') && t.$('impPage').style.display === 'block' && t.$('impPick'));
    ok(t.$('impPage').style.display === 'block' && !!t.$('impPick'), '1 点「去导入」打开导入页');
    await t.back();
    await ledger(t);
    t.$('impRemindOff').click();
    ok(!t.$('impRemind'), '2 点「这个月不提醒」：没了');
    await ledger(t);
    ok(!t.$('impRemind') && t.w.localStorage.getItem('app_imp_remind_' + A.ID + '__默认存档') === '2026-11', '2 再画一遍也没有（这台手机上记住了这个月）');
    t.w.localStorage.removeItem('app_imp_remind_' + A.ID + '__默认存档');
    await t.importFiles(file('2026-10-31 23:59:59'));
    await ledger(t);
    ok(!t.$('impRemind'), '3 导到 10 月底了：不提醒');
    ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  }
  {
    const t = await A.boot({ html, www: WWW, now: '2026-11-15T10:00:00', seed: A.seedOf([]) });
    await t.importFiles(file('2026-10-20 23:59:59'));
    await ledger(t);
    ok(!t.$('impRemind'), '4 过了 10 号：不提醒');
  }
  {
    const t = await A.boot({ html, www: WWW, now: '2026-11-03T10:00:00', seed: A.seedOf([]) });
    await t.importFiles(file('2026-10-20 23:59:59'));
    t.w.localStorage.removeItem('app_dev_import');
    await ledger(t);
    ok(!t.$('impRemind'), '5 开发开关关着：不提醒');
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
