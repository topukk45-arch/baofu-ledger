// 1017-X 随机组合的性质测试（jsdom 跑整个 App，虚构数据）。node zZz6-prop-ops.test.js [index.html]
// 随机按顺序做：导入（三份账单，有重叠、有合并、有待处理、有退款）、只对账、AI 修改、撤销最后一次 / 中间某次（连着撤）、
// 恢复任意一份备份（含恢复前）、处理待处理（作为新增 / 不要了 / 合并）、拆开合并、去掉 AI 标记；
// 每一步之后查：账本、单号表、待处理池、导入记录、规则、名单、AI 标记彼此对得上；
// 一轮做完：导出备份 → 导入成另一个存档 → 那个存档里也对得上、能全部撤完；原存档全部撤完以后和最开始逐字节一样。
// 第二种（mode 2）再掺进手动操作（记一笔、删一条、改分类名、删分类、改规则），只查对得上、撤销不报错。
// 步数：PROP_STEPS（每轮，默认 22）× PROP_SEEDS（几轮，默认 2）；本地可以调大跑几百步：PROP_STEPS=150 PROP_SEEDS=4。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0, eqN = 0;
const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const STEPS = +(process.env.PROP_STEPS || 22), SEEDS = +(process.env.PROP_SEEDS || 2);
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '某虚构杂货', desc: '虚构', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', no: '2026100122001400000000' + String(++seq).padStart(6, '0') }, o));
const shared = wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600, desc: '饮料' });
const shop = wx({ time: T(7, 9), cp: '某虚构超市', fen: 5000, desc: '日用品' });
const FA = [['微信1.csv', B.bill('wechat', [shared, wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' }), shop,
  wx({ time: T(6, 12), cp: '某虚构饭店', fen: 5000 }), wx({ time: T(8, 9), cp: '某虚构花店', fen: 2000, status: '交易关闭' })], { range: RANGE }).bytes]];
const FB = [['支付宝.csv', B.bill('alipay', [ali({ time: T(11, 10), cp: '某虚构菜场', fen: 4400 }), ali({ time: T(12, 10), cp: '某虚构理发', fen: 3800, pm: '某虚构银行卡' }),
  ali({ time: T(12, 18), cp: '某虚构饭馆', fen: 6600, kind: '餐饮美食' })], { range: RANGE }).bytes]];
const FC = [['微信2.csv', B.bill('wechat', [shared, wx({ time: T(14, 12), cp: '某虚构面馆', fen: 2800, desc: '牛肉面' }),
  wx({ time: T(15, 10), cp: '某虚构超市', kind: '某虚构超市-退款', io: 'income', fen: 2000, status: '已退款¥20.00', no: '5030000000' + String(++seq).padStart(19, '0') })], { range: RANGE }).bytes]];
const FILES = [FA, FB, FC];
const MAN = [{ id: 'm1', time: '2026-10-06T09:30', money: 36, type: 'expense', cat: '购物', remark: '买书' },
             { id: 'm2', time: '2026-10-01T08:30', money: 50, type: 'expense', cat: '吃饭', remark: '聚餐' },
             { id: 'm3', time: '2026-10-14T12:20', money: 28, type: 'expense', cat: '吃饭', remark: '面' }];
const CATS = ['未分类', '吃饭', '购物', '零食', '其他'];
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

// 账本、单号表、待处理、导入记录、名单、规则、AI 标记对得上。strict：没有手动删记录时，导入记录里写进去的记录都要在
async function check(t, arch, tag, strict, capped) {
  const a = t.w.JiwenStore.loadStore(A.ID).archives[arch], recs = a.records, ids = new Set(recs.map(r => r.id));
  const logs = await t.st().importsRead(arch), pend = await t.st().pendingRead(arch);
  const bad = [];
  const st0 = new Set();
  const db = await t.dump(), aid = t.w.JiwenStore.impTarget(arch).aid;
  Object.keys(db).filter(k => k.indexOf('imp_' + A.ID + '_' + aid + '_o_') === 0).forEach(k => {
    const app = /_o_(alipay|wechat)_/.exec(k)[1];
    (t.w.JiwenStore.impBlkDecode(db[k]) || []).forEach(x => { if (x.st === 0) { if (ids.has(x.id)) st0.add(app + '|' + x.no); if (strict && !ids.has(x.id)) bad.push('单号指向不存在的记录 ' + x.no); } if (x.batch && !logs.some(l => l.b === x.batch) && logs.length && !capped) bad.push('单号的批次不在导入记录里 ' + x.no); });
  });
  const bs = new Set(logs.map(l => l.b));
  logs.forEach(l => {
    if (l.kind === 'ai') { if (!capped && !logs.some(x => x.kind !== 'ai' && x.b === l.of)) bad.push('AI 修改指向不在的导入 ' + l.of); if (strict) (l.chg || []).forEach(c => { if (!ids.has(c.id)) bad.push('AI 修改的记录不在'); }); return; }
    if (strict) (l.add || []).forEach(id => { if (!ids.has(id)) bad.push('导入记录里新建的记录不在 ' + id); });
    if (strict) (l.chg || []).forEach(c => { if (!ids.has(c.id)) bad.push('导入记录里改过的记录不在 ' + c.id); });
    if (Array.isArray(l.h) && l.h.length !== (l.add || []).length) bad.push('指纹和新建条数对不上');
    if (l.cpEnd > (a.cps || []).length) bad.push('名单比导入记录里短');
  });
  pend.forEach(x => { if (st0.has(x.app + '|' + x.no)) bad.push('待处理里的已经入账 ' + x.no); if (x.b && !bs.has(x.b) && logs.length && !capped) bad.push('待处理的批次不在导入记录里 ' + x.b); });
  const keys = new Set(); pend.forEach(x => { const k = x.app + '|' + x.no; if (keys.has(k)) bad.push('待处理重复 ' + k); keys.add(k); });
  recs.forEach(r => {
    if (Number.isInteger(r.cp) && r.cp >= (a.cps || []).length) bad.push('对方编号越界 ' + r.id);
    if (Number.isInteger(r.pm) && r.pm >= (a.pms || []).length) bad.push('支付方式编号越界 ' + r.id);
    if (r.batch && !bs.has(r.batch) && !capped) bad.push('记录的批次不在导入记录里 ' + r.id);
    if (r.aiFlag && r.aiFlag.ref && !ids.has(r.aiFlag.ref) && strict) bad.push('AI 标记指向不在的记录 ' + r.id);
    if (r.refundOf && !ids.has(r.refundOf)) bad.push('退款挂的原单不在 ' + r.id);
    if (!a.cats.includes(r.cat || '未分类') && (r.cat || '未分类') !== '未分类') bad.push('分类不在分类列表里 ' + r.cat);
  });
  ((a.importRules || {}).cat || []).forEach(x => { if (!a.cats.includes(x.cat)) bad.push('规则指向不在的分类 ' + x.cat); });
  ((a.importRules || {}).map || []).forEach(x => { if (!a.cats.includes(x.cat)) bad.push('对照指向不在的分类 ' + x.cat); });
  if (new Set(recs.map(r => r.id)).size !== recs.length) bad.push('记录编号重复');
  ok(!bad.length, tag + '：对得上 ' + bad.slice(0, 3).join('；'));
  return !bad.length;
}
async function undoAll(t, arch, tag) {
  for (let i = 0; i < 30; i++) {
    const logs = await t.st().importsRead(arch);
    if (!logs.length) return true;
    const p = await t.st().undoPlan(logs[logs.length - 1].b, arch);
    if (!p.ok) { ok(false, tag + '：撤不了 ' + JSON.stringify(p.why || p.err || '')); return false; }
    try { await t.st().undo(p, { archive: arch }); } catch (e) { ok(false, tag + '：撤销报错 ' + (e.code || e.message)); return false; }
  }
  ok(false, tag + '：30 次还没撤完'); return false;
}

async function round(seed, mode) {
  const R = rng(seed * 7919 + mode), pick = a => a[Math.floor(R() * a.length)];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN, CATS), now: '2026-10-20T10:00:00' });
  const ARCH = '默认存档';
  await t.w.eval('JiwenImportEntry.loadImportUI')();      // 待处理、撤销、AI 修改要的几个文件（真人打开导入页时载入）
  const D0 = await t.dump();
  const trace = [];
  let manual = false, capped = false;    // capped：导入记录到过 10 次（最旧的被挤掉了，它写进去的记录撤不掉了）
  const ops = {
    async imp() { const i = Math.floor(R() * 3); trace.push('导入' + 'ABC'[i]); const r = await t.importFiles(FILES[i]); if (r.alert) trace.push('（' + r.alert.slice(0, 20) + '）'); },
    async only() {
      const r = await t.importFiles(pick(FILES), null, { noGo: true, stay: true });
      const rc = t.$('impRecon');
      if (!rc || rc.disabled) { A.clickCancel(t.w); await t.idle(); return; }
      rc.click();
      const rows = Array.from(t.d.querySelectorAll('.imp-recon-row input'));
      if (!rows.length) { A.clickCancel(t.w); await t.idle(); return; }
      rows.forEach(x => { if (R() < 0.5) x.click(); });
      if (t.$('impGo').disabled) { rows[0].click(); }
      trace.push('只对账');
      A.clickGo(t.w);
      await t.until(() => t.$('impResult') || t.ask(), 30000);
      if (t.ask()) await t.askOk();
      if (t.$('impResult')) t.$('impBackToLedger').click();
      await t.idle(); void r;
    },
    async ai() {
      const logs = (await t.st().importsRead()).filter(l => l.kind !== 'ai');
      const lg = logs.length ? pick(logs) : null; if (!lg) return;
      const recs = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records, ids = (lg.add || []).concat((lg.chg || []).map(c => c.id)).filter(id => recs.some(r => r.id === id && !r.refundOf));
      if (!ids.length) return;
      const id = pick(ids), other = pick(ids);
      const set = pick([{ cat: pick(['零食', '其他', '吃饭']) }, { remark: '虚构备注' + Math.floor(R() * 100) }, { skip: true }, { aiFlag: { k: 'dup', why: '虚构', ref: other !== id ? other : undefined } }]);
      trace.push('AI修改');
      try { await t.st().aiApply({ of: lg.b, changes: [{ id, set }] }, {}); } catch (e) { if (e.code !== 'nothing') throw e; }
    },
    async undoLast() { const logs = await t.st().importsRead(); if (!logs.length) return; trace.push('撤最后'); const p = await t.st().undoPlan(logs[logs.length - 1].b); if (p.ok) await t.st().undo(p); },
    async undoMid() { const logs = await t.st().importsRead(); if (!logs.length) return; const lg = pick(logs); trace.push('撤某次(连着)'); const p = await t.st().undoPlan(lg.b); if (p.ok) await t.st().undo(p); },
    async restore() {
      const L = await t.st().backupList(); if (!L.list.length) return;
      const x = pick(L.list); trace.push('恢复' + x.kind);
      const d = await t.st().backupDiff(x.key); await t.st().restoreBackup(x.key, { ver: d.ver });
    },
    async pend() {
      const list = await t.st().pendingCheck(); if (!list.length) return;
      const x = pick(list), okc = x.cands.filter(c => c.ok);
      const act = okc.length && R() < 0.4 ? { key: x.key, do: x.refund ? 'refund' : 'merge', id: pick(okc).id } : R() < 0.6 ? { key: x.key, do: 'new', cat: '其他' } : { key: x.key, do: 'drop' };
      trace.push('待处理' + act.do);
      try { await t.st().pendingApply([act]); } catch (e) { if (!/candgone|nothing/.test(e.code || e.message)) throw e; }
    },
    async split() {
      const r = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records.filter(x => x.src && x.src.merged); if (!r.length) return;
      trace.push('拆开');
      try { await t.st().splitMerge(pick(r).id); } catch (e) { if (!/nolog/.test(e.code || e.message)) throw e; }
    },
    async unflag() {
      const r = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records.filter(x => x.aiFlag); if (!r.length) return;
      const id = pick(r).id; trace.push('去掉标记');
      const s = t.w.JiwenStore.loadStore(A.ID), rs = s.archives[ARCH].records, i = rs.findIndex(x => x.id === id); const n = Object.assign({}, rs[i]); delete n.aiFlag; rs[i] = n; t.w.JiwenStore.saveStore(s, A.ID); await t.idle();
      manual = true;   // 去掉标记算你改了记录：撤销时那一项按「你后来改过」不动，撤完和最开始不一定逐字节一样
    },
    // ---- 只在 mode 2：手动操作 ----
    async add() { trace.push('记一笔'); manual = true; const s = t.w.JiwenStore.loadStore(A.ID); s.archives[ARCH].records = s.archives[ARCH].records.concat([{ id: 'x' + Math.floor(R() * 1e9), time: '2026-10-1' + Math.floor(R() * 9) + 'T10:00', money: 1 + Math.floor(R() * 90), type: 'expense', cat: pick(t.w.JiwenStore.loadStore(A.ID).archives[ARCH].cats), remark: '虚构' }]); t.w.JiwenStore.saveStore(s, A.ID); await t.idle(); },
    async del() { const rs = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records; if (!rs.length) return; trace.push('删一条'); manual = true; const r = pick(rs); t.w.openEdit(r.id); t.$('deleteInEdit').click(); t.$('askOk').click(); await t.idle(); },
    async ren() { const cs = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].cats.filter(c => c !== '未分类'); if (!cs.length) return; const c = pick(cs); trace.push('改分类名'); manual = true; t.w.JiwenCats.renameCat(c); t.$('askInput').value = c + 'X'; t.$('askOk').click(); await t.idle(); },
    async delCat() { const cs = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].cats.filter(c => c !== '未分类'); if (cs.length < 2) return; const c = pick(cs); trace.push('删分类'); manual = true; t.w.JiwenCats.deleteCat(c); if (t.ask()) t.$('askOk').click(); await t.idle(); },
    async rules() { const cs = t.w.JiwenStore.loadStore(A.ID).archives[ARCH].cats.filter(c => c !== '未分类'); trace.push('改规则'); manual = true; await t.st().rulesSave({ cat: [{ kw: '某虚构超市', cat: pick(cs) }], type: [] }); },
  };
  const W = mode === 1 ? { imp: 5, ai: 3, undoLast: 3, undoMid: 2, restore: 3, pend: 2, split: 2, only: 1 } : { imp: 4, ai: 2, undoLast: 2, undoMid: 1, restore: 2, pend: 2, split: 1, add: 2, del: 2, ren: 1, delCat: 1, rules: 1, unflag: 1 };
  const bag = []; Object.keys(W).forEach(k => { for (let i = 0; i < W[k]; i++) bag.push(k); });
  let good = true;
  for (let s = 0; s < STEPS && good; s++) {
    const op = pick(bag);
    if (process.env.PROP_DEBUG && s + 1 >= +process.env.PROP_DEBUG) console.log('—— 第 ' + (s + 1) + ' 步前', op, JSON.stringify((await t.st().importsRead()).map(l => ({ b: l.b, k: l.kind, of: l.of, add: l.add, cpLen: l.cpLen, cpEnd: l.cpEnd, chg: (l.chg || []).map(c => c.id) }))), 'cps', (t.w.JiwenStore.loadStore(A.ID).archives[ARCH].cps || []).length, JSON.stringify(t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records.filter(r => Number.isInteger(r.cp)).map(r => [r.id.slice(-6), r.cp, r.batch])));
    try { await ops[op](); }
    catch (e) { ok(false, `第 ${seed} 轮 mode${mode} 第 ${s + 1} 步 ${op} 报错：${e.code || e.message}（${trace.join(' → ')}）`); good = false; break; }
    if ((await t.st().importsRead()).length >= 10) capped = true;
    good = await check(t, ARCH, `第 ${seed} 轮 mode${mode} 第 ${s + 1} 步（${trace.join(' → ')}）`, !manual && !capped, capped);
  }
  if (!good) return;
  // 导出备份 → 导入成另一个存档：那边也对得上、能全部撤完（记录删光了的存档导出来是空文件，导入备份本来就不收，跳过）
  if (!t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records.length) { ok(await undoAll(t, ARCH, `第 ${seed} 轮 mode${mode} 全部撤完（账本是空的）`), `第 ${seed} 轮 mode${mode} 空账本也能撤完`); return; }
  t.$('exportBtn').click();
  await t.until(() => t.w.__files.length);
  const bk = JSON.parse(t.w.__files[t.w.__files.length - 1]);
  await t.w.JiwenStore.importArchiveFromText(JSON.stringify(bk), A.ID); await t.idle();
  const names = Object.keys(t.w.JiwenStore.loadStore(A.ID).archives), arch2 = names[names.length - 1];
  await check(t, arch2, `第 ${seed} 轮 mode${mode} 导入备份成「${arch2}」`, !manual && !capped, capped);
  const ok2 = await undoAll(t, arch2, `第 ${seed} 轮 mode${mode} 导入的备份存档全部撤完`);
  if (ok2) await check(t, arch2, `第 ${seed} 轮 mode${mode} 导入的备份存档撤完以后`, false, capped);
  // 原存档：全部撤完
  const ok1 = await undoAll(t, ARCH, `第 ${seed} 轮 mode${mode} 全部撤完`);
  if (ok1) {
    await check(t, ARCH, `第 ${seed} 轮 mode${mode} 全部撤完以后`, false, capped);
    if (mode === 1 && !manual && !capped) {
      const D1 = await t.dump(), only = d => Object.fromEntries(Object.entries(d).filter(([k]) => k.indexOf('imp_' + A.ID + '_' + t.w.JiwenStore.impTarget(arch2).aid) !== 0 && !/^led_/.test(k) || /^led_.+_m$/.test(k) && false));
      // 原存档的账本块、单号表、待处理、导入记录和最开始逐字节一样（另一个存档的不算）
      const aid1 = t.w.JiwenStore.impTarget(ARCH).aid, mine = d => Object.fromEntries(Object.entries(d).filter(([k]) => k.indexOf('_' + aid1 + '_') >= 0));
      eqN++;
      ok(same(mine(D1), mine(D0)) && same(t.w.JiwenStore.loadStore(A.ID).archives[ARCH].records, MAN), `第 ${seed} 轮 mode1 全部撤完：和最开始逐字节一样（${trace.join(' → ')}）`);
      void only;
    }
  }
  ok(!t.errs.length, `第 ${seed} 轮 mode${mode} 无报错 ` + t.errs.join('|'));
  if (process.env.PROP_TRACE) console.log(`第 ${seed} 轮 mode${mode}：${trace.join(' → ')}`);
}

(async () => {
  // 只跑某一轮：PROP_ONLY=9:1（第 9 轮 mode 1），查问题用
  if (process.env.PROP_ONLY) { const [sd, md] = process.env.PROP_ONLY.split(':').map(Number); await round(sd, md); }
  else for (let seed = 1; seed <= SEEDS; seed++) { await round(seed, 1); await round(seed, 2); }
  console.log(`\n共 ${SEEDS * 2} 轮，每轮 ${STEPS} 步；全部撤完后逐字节比过 ${eqN} 轮（导入记录到过 10 次、掺了手动操作的不比）`);
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
