// 1016-W 单号表上云（jsdom 跑整个 App，假的云盘插件 OneDriveLink）。node zG-import-orders-cloud.test.js [index.html]
// 主云备份的格式一点不改（和 1016-K 写出来的字段完全一样、照旧不带单号表）；单号表单独连一个云端文件，只在导入 / 撤销 /
// 处理待处理之后写，平时记一笔不写；只写这一个文件，云端别的文件不动、不删。
// 换手机：从主云备份恢复账本（记录重新编号）→ 从单号表文件恢复，按记录内容认回新编号 → 再导同一份账单一条不新增。
// 存档已经有单号表时不覆盖；不是单号表的文件不认。
// 兼容：1016-K（tests/fixtures/index-1016-K.html.gz，原样存的旧版）读新版写的主云备份照常能导入；新版读 1016-K 写的主云备份照常能导入。
// 账单、手记全是虚构的。
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const W = require('../www/import/write.js');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const OLD = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'index-1016-K.html.gz'))).toString('utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const bill = txns => B.bill('wechat', txns, { range: RANGE }).bytes;
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money) => ({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' });

// 假云盘：一个 uri 一个文件；记下每次写了哪个文件
function cloud() {
  const c = { files: {}, writes: [], picks: 0, deleted: 0 };
  c.plugin = {
    pickFile: async o => { const uri = 'content://虚构云盘/' + (o.suggestedName || ('打开的' + (++c.picks))); return { uri, name: o.suggestedName || '选的文件.json' }; },
    writeText: async o => { c.files[o.uri] = o.text; c.writes.push(o.uri); return {}; },
    readText: async o => { if (!(o.uri in c.files)) throw new Error('nofile'); return { text: c.files[o.uri] }; },
    forget: async () => { c.deleted++; return {}; },
    checkAccess: async () => ({ ok: true })
  };
  return c;
}
const withCloud = c => w => { w.Capacitor.Plugins.OneDriveLink = c.plugin; };
const pickBackup = async (t, text) => {
  const input = t.$('importFile');
  Object.defineProperty(input, 'files', { value: [new t.w.File([text], '云备份.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.ask(), 5000);
  await t.idle();
};

(async () => {
  // ===== 0. 指纹和 write.js 一样 =====
  const C = cloud();
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([man('m1', 10, 5, 30)]), before: withCloud(C) });
  {
    const rs = [{ id: 'a', time: '2026-10-01T08:00', money: 12.5, type: 'expense', cat: '吃饭', remark: '虚构', src: { app: 'wechat' }, cp: 2, batch: 'b1' },
                { id: 'b', refundOf: 'a', money: 1, type: 'income', cat: '吃饭', time: '2026-10-02T09:00' }, { id: 'c' }];
    ok(rs.every(r => t.w.impRecHash(r) === W.recHash(r)), '0 主页面的指纹和 write.js 的 recHash 一样');
  }
  const { $ } = t;
  // ===== 1. 连上主云备份和单号表文件 =====
  $('odConnectBtn').click();
  await t.until(() => t.ask()); await t.askOk(); await t.idle();
  const MAIN = Object.keys(C.files)[0];
  ok(MAIN && /记问存档_/.test(MAIN), '1 主云备份连上、写了一次');
  ok($('odOrdersBar').style.display === 'flex' && /单号表也存一份到云盘/.test($('odOrdersBtn').textContent), '1 开发开关开着：有「单号表也存一份到云盘」');
  $('odOrdersBtn').click();
  await t.until(() => t.ask()); await t.askOk();
  const ORD = Object.keys(C.files).find(k => /记问单号表_/.test(k));
  ok(ORD && JSON.parse(C.files[ORD]).kind === '单号表', '1 单号表连上一个单独的文件，先传了一次（现在是空的）');
  ok(/每次导入后更新/.test($('odOrdersStatus').textContent), '1 设置里写明单号表文件每次导入后更新');

  // ===== 2. 导入以后单号表文件更新；平时记一笔不写 =====
  const BILL = [wx({ time: T(10, 5, 12), cp: '某虚构面馆', fen: 3000 }), wx({ time: T(10, 6), cp: '某虚构书店', fen: 1200 }), wx({ time: T(10, 7), cp: '某虚构花店', fen: 2000, status: '交易关闭' }),
                wx({ time: T(10, 8), cp: '某虚构店', fen: 4500 })];
  const F = [['微信.csv', bill(BILL)]];
  const w0 = C.writes.filter(u => u === ORD).length;
  await t.importFiles(F, S => { S.edits.rows[S.matched.items.find(x => x.src === 'row' && S.parsed.files[x.file].rows[x.row].no === BILL[3].no).key] = { exclude: true }; });
  await t.until(() => C.writes.filter(u => u === ORD).length > w0);
  const ordFile = JSON.parse(C.files[ORD]);
  const T1 = await t.st().ordersRead();
  ok(ordFile.orders.wechat && Object.keys(ordFile.recs).length === 2 && T1.size === 4, '2 导入以后单号表文件更新：4 个单号（2 条记录 + 交易关闭、勾掉的两个忽略），带 2 条记录的指纹');
  await t.idle(); await new Promise(r => setTimeout(r, 1600)); await t.idle();          // 主云备份是 1.5 秒后写
  const mainNew = JSON.parse(C.files[MAIN]);
  ok(mainNew.orders === undefined && mainNew.data.length === 2 && Array.isArray(mainNew.imports), '2 主云备份照旧不带单号表');
  const wOrd = C.writes.filter(u => u === ORD).length;
  $('fabAdd').click(); $('billMoney').value = '9'; [...$('billTypeChips').children][0].click();
  [...$('billCatChips').children].find(x => x.textContent === '吃饭').click(); $('addBill').click(); await t.idle();
  await new Promise(r => setTimeout(r, 1600)); await t.idle();
  ok(t.recs().length === 3 && C.writes.filter(u => u === ORD).length === wOrd && JSON.parse(C.files[MAIN]).data.length === 3, '2 记一笔：主云备份更新，单号表文件不写');
  ok(Object.keys(C.files).length === 2 && C.deleted === 0, '2 云端只有这两个文件，没删任何东西');

  // ===== 3. 主云备份的字段和 1016-K 写的一模一样 =====
  const C0 = cloud();
  const tOld = await A.boot({ html: OLD, www: WWW, seed: A.seedOf([man('m1', 10, 5, 30)]), before: withCloud(C0) });
  tOld.$('odConnectBtn').click(); await tOld.until(() => tOld.ask()); await tOld.askOk(); await tOld.idle();
  const oldMain = JSON.parse(Object.values(C0.files)[0]);
  const newEmpty = JSON.parse(C.files[MAIN]);
  const baseKeys = o => Object.keys(o).filter(k => !['cps', 'pms', 'importRules', 'imports', 'pending'].includes(k)).sort();
  ok(same(baseKeys(oldMain), baseKeys(newEmpty)), '3 主云备份的固定字段和 1016-K 一样：' + baseKeys(newEmpty).join(','));
  ok(Object.keys(newEmpty).every(k => ['app', 'user', 'accountId', 'archive', 'cats', 'budgets', 'tpls', 'data', 'days', 'exportedAt', 'cps', 'pms', 'importRules', 'imports', 'pending'].includes(k)), '3 新版主云备份没有新字段（只有 1016-K 就有的那些）');

  // ===== 4. 1016-K 读新版的主云备份 / 新版读 1016-K 的主云备份 =====
  {
    const t4 = await A.boot({ html: OLD, www: WWW, seed: A.seedOf([]) });
    await pickBackup(t4, C.files[MAIN]);
    while (t4.ask()) await t4.askOk();
    await t4.idle();
    const st = t4.w.loadStore(A.ID), arcs = Object.values(st.archives), got = arcs.find(a => a.records.length === 3);
    ok(got && got.records.filter(r => r.src && r.src.app === 'wechat').length === 2 && got.records.some(r => r.id && r.money === 9), '4 1016-K 导入新版写的主云备份：3 条记录都在（合并的手记、导入的、后来记的）、导入的字段在');
    ok(!t4.errs.length, '4 1016-K 无报错 ' + t4.errs.join('|'));
  }
  {
    // 1016-K 那边也导一次账单，再让它写主云备份，新版来读
    await tOld.importFiles(F);
    await tOld.w.odSyncNow(); await tOld.idle();
    const oldText = Object.values(C0.files)[0];
    const t5 = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    await pickBackup(t5, oldText);
    while (t5.ask()) await t5.askOk();
    await t5.idle();
    const st = t5.w.loadStore(A.ID), got = Object.values(st.archives).find(a => a.records.length === JSON.parse(oldText).data.length && a.records.length > 1);
    ok(got && got.records.some(r => r.src && r.src.app === 'wechat') && Array.isArray(got.cps), '5 新版导入 1016-K 写的主云备份：记录、来源、对方名单都在');
    ok(!t5.errs.length, '5 新版无报错 ' + t5.errs.join('|'));
  }

  // ===== 6. 换手机：主云备份恢复账本 → 单号表文件恢复 → 再导同一份账单一条不新增 =====
  {
    const C2 = cloud();
    C2.files = Object.assign({}, C.files);
    const t6 = await A.boot({ html, www: WWW, seed: A.seedOf([], null), before: withCloud(C2) });
    await pickBackup(t6, C.files[MAIN]);
    while (t6.ask()) await t6.askOk();
    await t6.idle();
    const st = t6.w.loadStore(A.ID), name = Object.keys(st.archives).find(k => st.archives[k].records.length === 3);
    ok(name, '6 新手机：主云备份导进来了（' + name + '）');
    const before = await t6.st().ordersRead(name);
    ok(before.size === 0, '6 这时单号表是空的');
    let r = null;
    try { r = await t6.w.impOrdersRestoreFromCloud(C2.files[ORD], name); } catch (e) { console.log('    ' + (e.code || e.message)); }
    const T6 = await t6.st().ordersRead(name), a6 = t6.w.loadStore(A.ID).archives[name];
    const e0 = T6.get('wechat', BILL[0].no);
    ok(r && r.kept === 4 && r.dropped === 0 && e0 && a6.records.some(x => x.id === e0.id && x.money === 30), '6 单号表恢复了：4 个单号，记录换成了新编号 ' + JSON.stringify(r));
    // 切到这个存档再导同一份账单
    t6.w.eval('currentArchive = ' + JSON.stringify(name));
    const rr = await t6.importFiles(F, null, { noGo: true });
    ok(rr.plan.counts.add === 0 && rr.plan.counts.pending === 0 && rr.plan.counts.merge === 0, '6 再导同一份账单：一条不新增、没有待处理（不用按指纹猜）');
    let e2 = null;
    try { await t6.w.impOrdersRestoreFromCloud(C2.files[ORD], name); } catch (e) { e2 = e.code; }
    ok(e2 === 'notempty', '7 已经有单号表：不覆盖');
    let e3 = null;
    try { await t6.w.impOrdersRestoreFromCloud(C.files[MAIN], name); } catch (e) { e3 = e.code; }
    ok(e3 === 'badfile', '7 主云备份不是单号表文件：不认');
    ok(!t6.errs.length, '6 无报错 ' + t6.errs.join('|'));
  }
  // ===== 8. 开发开关关着：看不到单号表那一行 =====
  {
    t.w.localStorage.removeItem('app_dev_import'); t.w.odRefreshStatusUI();
    ok($('odOrdersBar').style.display === 'none' && $('odOrdersStatus').style.display === 'none', '8 开发开关关着：没有单号表那一行');
  }
  ok(!t.errs.length && !tOld.errs.length, '无报错 ' + t.errs.concat(tOld.errs).join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
