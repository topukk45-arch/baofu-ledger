// 1021-T4「按新规则重新推荐分类」（jsdom 跑整个 App，真导、真改、真撤）。node zZzZj-reclass.test.js [index.html]
// 导入记录每次那一行「重新分类」/ 结果页「接下来可以」：这一次新建、导入后没动过的记录按现在的规则再推荐一遍，
// 推不出的只把原来落在「工资」的改回未分类；先确认，写法、自动备份、撤销都和 AI 修改一样（导入记录里多一次「重新分类」）。
// 账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const TX = [ali({ time: T(5, 12), cp: '某甲', kind: '收入', io: 'income', desc: '收钱码收款', fen: 4000 }),
            ali({ time: T(6, 9), cp: '某乙', kind: '收入', io: 'income', desc: '收钱码收款', fen: 175 }),
            ali({ time: T(7, 9), cp: '某虚构便利店', kind: '餐饮美食', desc: '饮料', fen: 600 })];
const F = [['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]];
const CATS = ['未分类', '餐饮', '购物', '出行', '其他', '红包', '工资'];

(async () => {
  // 以前有一条「某 → 工资」的规则（模拟 1021-T3 以前收款落进工资）
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS, { importRules: { cat: [{ kw: '某甲', cat: '工资' }, { kw: '某乙', cat: '工资' }], type: [] } }), now: '2026-10-20T10:00:00' });
  const { $ } = t, qa = s => Array.from(t.d.querySelectorAll(s));
  await t.importFiles(F);
  const [lg] = await t.st().importsRead();
  const rec = cp => t.recs().find(r => (t.arch().cps || [])[r.cp] === cp);
  ok(rec('某甲').cat === '工资' && rec('某乙').cat === '工资', '0 准备：按老规则两笔收款落在工资');
  await t.st().rulesSave({ cat: [], type: [] });
  // 改过的那笔不动
  const b0 = rec('某乙'); await t.w.eval('JiwenImportEntry.loadImportUI')();
  const st = t.w.JiwenStore, u = st.loadStore(t.w.JiwenBase.currentUser), a = u.archives[t.w.JiwenBase.currentArchive];
  const ix = a.records.findIndex(r => r.id === b0.id); a.records[ix] = Object.assign({}, a.records[ix], { remark: '我改过备注' }); st.saveStore(u); await new Promise(r => setTimeout(r, 50));

  const c0 = rec('某虚构便利店').cat;
  t.w.JiwenImportUI.openLogs(); await t.until(() => qa('.imp-log-reclass').length);
  ok(qa('.imp-log').find(x => x.dataset.batch === lg.b).querySelector('.imp-log-reclass'), '1 导入记录每次那一行有「重新分类」');
  qa('.imp-log-reclass')[0].click(); await t.until(() => t.ask());
  const q = t.ask();
  ok(/1 条分类会变/.test(q.msg) && /工资 → 未分类/.test(q.msg), '1 先确认：列出 1 条「工资 → 未分类」：' + q.msg.replace(/\n/g, ' / '));
  ok(!/某乙/.test(q.msg), '1 导入后你改过的那笔不动');
  await t.askOk(); await t.until(() => $('impUndoNotice'));
  ok(/已按新规则重新分类了 1 条记录/.test($('impUndoNotice').textContent), '2 改完回导入记录，顶上写改了几条');
  ok(rec('某甲').cat === '未分类' && rec('某乙').cat === '工资' && rec('某虚构便利店').cat === c0, '2 只改了那一笔：' + ['某甲','某乙','某虚构便利店'].map(c => rec(c) && rec(c).cat).join('/'));
  const logs = await t.st().importsRead();
  ok(logs.length === 2 && logs[1].kind === 'ai' && logs[1].by === 'rec' && logs[1].of === lg.b, '2 导入记录多一次「重新分类」（kind ai、by rec）');
  const row = qa('.imp-log').find(x => x.dataset.batch === logs[1].b);
  ok(row && /重新分类/.test(row.textContent) && row.querySelector('.imp-log-undo') && !row.querySelector('.imp-log-reclass'), '2 那一行写「重新分类」、能撤销');
  ok((await t.st().backups()).some(x => x.kind === 'ai'), '2 改之前自动备份了：' + JSON.stringify(await t.st().backups()).slice(0, 300));
  // 撤销
  row.querySelector('.imp-log-undo').click(); await t.until(() => t.ask()); await t.askOk();
  await t.until(() => $('impUndoNotice') && /已撤销/.test($('impUndoNotice').textContent));
  ok(rec('某甲').cat === '工资', '3 撤销后改回工资：' + rec('某甲').cat + ' ' + $('impUndoNotice').textContent);
  // 再点一次：没有要改的（规则一样）→ 写一句
  await t.st().rulesSave({ cat: [{ kw: '某甲', cat: '工资' }], type: [] });
  t.w.JiwenImportUI.openLogs(); await t.until(() => qa('.imp-log-reclass').length);
  qa('.imp-log-reclass')[0].click(); await t.until(() => t.ask());
  ok(/没有要改的分类/.test(t.ask().msg), '4 规则一样时：没有要改的');
  await t.askOk();

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
