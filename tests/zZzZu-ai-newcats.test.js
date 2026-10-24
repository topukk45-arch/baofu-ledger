// 1021-T15（实测 10-20 第 3 轮）AI 导出：编号按时间、回复第一行 v2（老的 v1 不认）、可以用这一批推荐新建的分类（选了先建好，
// 导入记录 catsAdded，撤销这次 AI 修改时没人用的一起删）、从结果页进来多两列「账单收支」「状态」。jsdom、真导真改真撤。
// node zZzZu-ai-newcats.test.js [index.html]。账单全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const AI = require(path.join(WWW, 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '交通出行', cp: '某虚构出行', desc: '车费', io: 'expense', fen: 1500, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const TX = [ali({ time: T(8, 9) }), ali({ time: T(3, 9) }), ali({ time: T(5, 9), cp: '某虚构出行二' }),
            ali({ time: T(6, 9), cp: '某虚构商店', kind: '退款', desc: '退款-车费', io: 'neutral', status: '退款成功', fen: 300 })];
const F = [['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]];
const CATS = ['未分类', '吃饭', '购物', '其他'];

(async () => {
  ok(/^记问修改建议 v2 批次 b1 导出 /.test(AI.replyHead('b1', '2026-10-20 10:00:00')), '0 回复第一行是 v2');
  const r1 = AI.parseReply('```记问\n记问修改建议 v1 批次 b1 导出 2026-10-20 10:00:00\n#1 | 分类 | 购物 | x\n```', { batch: 'b1', aiAt: ['2026-10-20 10:00:00'], cats: CATS, rows: [{ n: 1, id: 'a', cat: '未分类' }] });
  ok(!r1.ok && r1.why === 'nohead', '0 老的 v1 回复不认（号对不上了）');
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], CATS), now: '2026-10-20T10:00:00' });
  const { $ } = t;
  // 2b 起 3 笔「交通出行」默认就建了；这里要测「推荐新建、没建的」，确认页选「不建」
  await t.importFiles(F, S => { S.edits.newCats['交通出行'] = { on: false, into: null, picked: false }; }, { stay: true });
  $('impNextAi').click(); await t.until(() => $('impAiText'));
  const txt = $('impAiText').value, D = t.S().ai.data;
  ok(D.newCats.includes('交通出行') && /也可以用的新分类（这次推荐新建、还没建的，选了记问会先建好）：交通出行/.test(txt), '1 导出里写「也可以用的新分类：交通出行」');
  const ns = D.rows.filter(r => !r.gone && r.id).map(r => r.time);   // 没进账本的（跳过、待处理）照旧排在后面
  ok(ns.every((x, i) => !i || ns[i - 1] <= x || !x), '1 编号按时间排：' + ns.join(' / '));
  ok(/,账单收支,状态\n/.test(txt) && /,不计收支,退款成功/.test(txt) === false || /,支出,交易成功/.test(txt), '1 多两列「账单收支」「状态」');
  // AI 选了「交通出行」：先建分类再改
  const id1 = D.rows[0].id, at = t.S().ai.at;
  await t.st().aiExportMark(t.S().ai.batch, at);
  const pr = AI.parseReply('```记问\n' + AI.replyHead(t.S().ai.batch, at) + '\n#1 | 分类 | 交通出行 | 打车\n```', { batch: t.S().ai.batch, aiAt: [at], cats: D.cats, rows: D.rows, newCats: D.newCats });
  ok(pr.ok && pr.items.length === 1 && pr.items[0].newCat === true, '2 回复里用新分类：认，标 newCat');
  const prNo = AI.parseReply('```记问\n' + AI.replyHead(t.S().ai.batch, at) + '\n#1 | 分类 | 交通出行 | 打车\n```', { batch: t.S().ai.batch, aiAt: [at], cats: D.cats, rows: D.rows });
  ok(prNo.bad.length === 1 && /不在你的分类里/.test(prNo.bad[0].why), '2 不给新分类名单时照旧不认');
  const w = await t.st().aiApply({ of: t.S().ai.batch, changes: [{ id: id1, set: { cat: '交通出行' } }], newCats: D.newCats });
  ok(w.changed === 1 && t.arch().cats.includes('交通出行') && t.recs().find(r => r.id === id1).cat === '交通出行', '3 先建好「交通出行」再改那一笔');
  const logs = await t.st().importsRead(), aiLog = logs[logs.length - 1];
  ok(aiLog.kind === 'ai' && JSON.stringify(aiLog.catsAdded) === '["交通出行"]', '3 导入记录记下 catsAdded');
  const plan = await t.st().undoPlan(aiLog.b);
  await t.st().undo(plan);
  ok(!t.arch().cats.includes('交通出行') && t.recs().find(r => r.id === id1).cat !== '交通出行', '4 撤销这次 AI 修改：改回去，没人用的新分类一起删');
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
