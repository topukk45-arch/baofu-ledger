// 导入简化第 13 版：单号表上云放出来（不藏在开发开关后面）。
//   ① 设置 → 云备份里「单号表也存一份到云盘」不写「开发中」，开发开关关着也有；
//   ② 导入过账单的存档连主云备份时，连好以后顺带问「单号表也存一份吗」（「再选一个文件存单号表」/「先不用」）；
//   ③ 导入一份备份文件（从云盘上的备份恢复）以后，那份备份导入过账单 → 问「要从云盘恢复单号表吗」，选了单号表文件就按记录内容认回来。
//   验收：从云备份恢复到新存档，再导以前的文件，全部被单号表拦下。假的云盘插件，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const BILL = [wx({ time: T(3), cp: '某虚构面馆', fen: 2800 }), wx({ time: T(5), cp: '某虚构书店', fen: 3600 }), wx({ time: T(6), cp: '某虚构花店', fen: 4100 }), wx({ time: T(6, 18), cp: '某虚构花店', fen: 4100 })];
const F = () => [['微信.csv', B.bill('wechat', BILL, { range: { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' } }).bytes]];
function cloud() {
  const c = { files: {}, last: null };
  c.plugin = {
    pickFile: async o => { if (o.mode === 'open') return { uri: c.openUri || c.last, name: '选的文件.json' }; const uri = 'content://虚构云盘/' + o.suggestedName; c.last = uri; return { uri, name: o.suggestedName }; },
    writeText: async o => { c.files[o.uri] = o.text; return {}; },
    readText: async o => { if (!(o.uri in c.files)) throw new Error('nofile'); return { text: c.files[o.uri] }; },
    forget: async () => ({}), checkAccess: async () => ({ ok: true })
  };
  return c;
}
(async () => {
  const C = cloud();
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([{ id: 'm1', time: '2026-10-03T12:10', money: 28, type: 'expense', cat: '吃饭', remark: '虚构面' }]), before: w => { w.Capacitor.Plugins.OneDriveLink = C.plugin; }, now: '2026-10-21T10:00:00' });
  const $ = t.$;
  await t.importFiles(F());
  // ===== 1. 开发开关关着也有那一行 =====
  t.w.localStorage.removeItem('app_dev_import'); t.w.JiwenStore.odRefreshStatusUI();
  ok($('odOrdersBar').style.display === 'flex' && $('odOrdersBtn').textContent === '单号表也存一份到云盘', '1 开发开关关着：「单号表也存一份到云盘」照样有，不写开发中');
  t.w.localStorage.setItem('app_dev_import', '1');
  // ===== 2. 连主云备份：导入过账单 → 顺带问单号表 =====
  $('odConnectBtn').click();
  await t.until(() => t.ask(), 5000); await t.idle();
  ok(/这个存档导入过微信 \/ 支付宝账单，单号表也存一份到云盘吗/.test(t.ask().msg) && $('askOk').textContent === '再选一个文件存单号表' && $('askCancel').textContent === '先不用', '2 连好主云备份：顺带问「单号表也存一份吗」');
  await t.askOk();
  await t.until(() => t.ask() && /单号表上云/.test(t.ask().title || ''), 5000);
  const ORD = Object.keys(C.files).find(k => /记问单号表_/.test(k)), MAIN = Object.keys(C.files).find(k => /记问存档_/.test(k));
  ok(ORD && JSON.parse(C.files[ORD]).kind === '单号表' && Object.keys(JSON.parse(C.files[ORD]).orders).length, '2 「再选一个文件存单号表」：单号表传上去了');
  await t.askOk(); await t.idle();
  await t.until(() => MAIN && C.files[MAIN] && /某虚构书店/.test(C.files[MAIN]), 5000);
  // ===== 3. 换手机：从云盘上的主备份恢复（导入备份文件）→ 问要不要恢复单号表 =====
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([]), before: w => { w.Capacitor.Plugins.OneDriveLink = C.plugin; }, now: '2026-10-22T10:00:00' });
  const input = t2.$('importFile');
  Object.defineProperty(input, 'files', { value: [new t2.w.File([C.files[MAIN]], '云备份.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new t2.w.Event('change'));
  await t2.until(() => t2.ask() && /导入成功/.test(t2.ask().title || ''), 5000);
  const name = t2.w.JiwenBase.currentArchive;
  await t2.askOk();
  await t2.until(() => t2.ask() && t2.ask().title === '恢复单号表', 5000);
  ok(t2.ask().msg.includes('存档「' + name + '」导入过微信 / 支付宝账单。云盘上存过它的单号表吗') && t2.$('askOk').textContent === '选云盘上的单号表文件', '3 导入备份以后：问「要从云盘恢复单号表吗」');
  C.openUri = ORD;
  await t2.askOk();
  await t2.until(() => t2.ask() && /恢复好了/.test(t2.ask().msg), 5000);
  ok(/认回 \d+ 个单号/.test(t2.ask().msg), '3 选了单号表文件：认回来了：' + t2.ask().msg);
  await t2.askOk(); await t2.idle();
  // ===== 验收：再导以前的文件，全部被单号表拦下 =====
  const r = await t2.importFiles(F(), null, { noGo: true, stay: true });
  const rows = r.plan.rows.filter(d => d.src === 'row');
  ok(rows.length === 4 && rows.every(d => d.group === 'skip' && d.why === 'imported'), '验收：恢复以后再导以前的文件，4 笔全部被单号表拦下（导入过）：' + rows.map(d => d.group + '/' + d.why).join(','));
  A.clickCancel(t2.w); await t2.idle();
  // 没导入过的备份：不问
  {
    const t3 = await A.boot({ html, www: WWW, seed: A.seedOf([{ id: 'x', time: '2026-10-01T09:00', money: 5, type: 'expense', cat: '吃饭', remark: '虚构' }]), before: w => { w.Capacitor.Plugins.OneDriveLink = C.plugin; } });
    t3.$('exportBtn').click(); await t3.until(() => t3.w.__files.length);
    const i3 = t3.$('importFile');
    Object.defineProperty(i3, 'files', { value: [new t3.w.File([t3.w.__files[0]], '备份.json', { type: 'application/json' })], configurable: true });
    i3.dispatchEvent(new t3.w.Event('change'));
    await t3.until(() => t3.ask() && /导入成功/.test(t3.ask().title || ''), 5000); await t3.askOk(); await tick(600);
    ok(!t3.ask(), '4 没导入过账单的备份：不问单号表');
  }
  ok(!t.errs.length && !t2.errs.length, '无报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`导入简化第 13 版：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
