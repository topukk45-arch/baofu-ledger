// 导入简化 2b：新建分类新老用户统一：这次至少 3 笔落进去的直接建；不到 3 笔的并进「其他」这类已有分类（没有就未分类），导进去标「待确认分类」。
//   完成页写「新建了 N 个分类：…」，点一个能并到已有分类（改这次导入里这个分类的记录，能撤销）。
// 纯计算 + jsdom 真导。node zZzZzK-newcat-2b.test.js [index.html]。数据全是虚构的。
const fs = require('fs'), path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile), IMP = path.join(WWW, 'import');
const C = require(path.join(IMP, 'classify.js')), MER = require(path.join(IMP, 'merchants.js'));
const A = require('./helpers/app');
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const ali = o => B.txn(Object.assign({ kind: '酒店旅游', cp: '某虚构景区', desc: '门票', io: 'expense', fen: 6000, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };
const CATS = ['未分类', '吃饭', '购物', '转账', '其他', '杂项'];

(async () => {
  // ===== 1. 纯计算：至少 3 笔建、不到 3 笔并进「其他」，新老用户一样 =====
  const rows = [0, 1, 2].map(i => ({ app: 'alipay', cp: '某虚构景区' + i, desc: '门票', kind: '酒店旅游', io: 'expense' }))
    .concat([0, 1].map(i => ({ app: 'alipay', cp: '某虚构诊所' + i, desc: '诊费', kind: '医疗健康', io: 'expense' })));
  for (const isNewUser of [false, true]) {
    const r = C.classify(rows, { cats: CATS, merchants: MER, isNewUser });
    const nc = n => r.newCats.find(c => c.name === n);
    ok(nc('酒店旅游') && nc('酒店旅游').count === 3 && nc('酒店旅游').defaultOn === true && r.recs.slice(0, 3).every(x => x.cat === '酒店旅游' && x.newCat === '酒店旅游'),
      '1 ' + (isNewUser ? '新' : '老') + '用户：3 笔「酒店旅游」直接建');
    ok(nc('医疗健康') && nc('医疗健康').defaultOn === false && nc('医疗健康').mergeInto === '其他' && r.recs.slice(3).every(x => x.cat === '其他' && x.newCat === '医疗健康'),
      '1 ' + (isNewUser ? '新' : '老') + '用户：2 笔「医疗健康」不建，并进「其他」');
  }
  const r2 = C.classify(rows.slice(3), { cats: ['未分类', '吃饭'], merchants: MER, isNewUser: false });
  ok(r2.recs.every(x => x.cat === '未分类') && r2.newCats[0].mergeInto === '未分类', '1 存档里没有「其他」这类：不到 3 笔的落未分类');

  // ===== 2. 真导：老用户（记录多）也建；不到 3 笔的并进「其他」、标待确认；完成页列出新建的分类 =====
  const html = fs.readFileSync(htmlFile, 'utf8');
  const old = Array.from({ length: 40 }, (_, i) => ({ id: 'o' + i, time: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T12:00`, money: 10 + i, type: 'expense', cat: '吃饭', remark: '虚构的老记录' }));
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(old, CATS), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  const TX = [ali({ time: T(3) }), ali({ time: T(4), cp: '某虚构景区二' }), ali({ time: T(5), cp: '某虚构景区三' }),
    ali({ time: T(6), kind: '医疗健康', cp: '某虚构诊所', desc: '诊费', fen: 4000 }), ali({ time: T(7), kind: '医疗健康', cp: '某虚构药房', desc: '药', fen: 3000 })];
  let S0 = null;
  await t.importFiles([['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]], S => { S0 = S; }, { stay: true });
  ok(S0.info.isNewUser === false, '2 这是老用户（记录 40 条）');
  const a = t.arch(), lg = (await t.logs()).pop();
  ok(a.cats.includes('酒店旅游') && !a.cats.includes('医疗健康'), '2 老用户也建了「酒店旅游」（3 笔），「医疗健康」（2 笔）没建：' + a.cats.join());
  const mine = a.records.filter(r => r.batch === lg.b);
  ok(mine.filter(r => r.cat === '酒店旅游').length === 3 && mine.filter(r => r.cat === '酒店旅游').every(r => !r.rv), '2 建了的那 3 笔落「酒店旅游」，不标待确认');
  ok(mine.filter(r => r.cat === '其他').length === 2 && mine.filter(r => r.cat === '其他').every(r => r.rv === 1), '2 不到 3 笔的并进「其他」、标待确认分类');
  ok($('impResNewCats') && /新建了 1 个分类：酒店旅游/.test($('impResNewCats').textContent) && $('impResNewCats').querySelector('.imp-res-nc[data-cat="酒店旅游"]'), '2 完成页写「新建了 1 个分类：酒店旅游」，能点');
  // 确认页里选了「并到」：你定过了，不标待确认
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf(old, CATS), now: '2026-10-21T10:00:00' });
    await t2.importFiles([['支付宝.csv', B.bill('alipay', TX, { range: RANGE }).bytes]], S => { S.edits.newCats['医疗健康'] = { on: false, into: '杂项', picked: true }; });
    const m2 = t2.recs().filter(r => r.cat === '杂项');
    ok(m2.length === 2 && m2.every(r => !r.rv), '2 确认页里自己选了「并到杂项」：落杂项，不标待确认');
  }
  // ===== 3. 完成页「并到…」：这次的记录改成选的分类，能撤销 =====
  $('impResNewCats').querySelector('.imp-res-nc').click();
  await t.until(() => t.d.getElementById('uiPickList'));
  const opt = [...t.d.querySelectorAll('#uiPickList .cc, #uiPickList button')].find(x => x.textContent.trim() === '杂项');
  ok(opt, '3 弹出选分类（已有的分类）');
  opt.click();
  await t.until(() => t.ask(), 5000); await t.idle();
  const msg = t.ask() ? t.ask().msg : '';
  ok(/「酒店旅游」的 3 笔并到了「杂项」/.test(msg), '3 提示「并到了」：' + msg);
  await t.askOk();
  const after = t.recs().filter(r => r.batch === lg.b);
  ok(after.filter(r => r.cat === '杂项').length === 3 && !after.some(r => r.cat === '酒店旅游'), '3 这次的 3 笔改成「杂项」');
  const logs = await t.logs(), ai = logs[logs.length - 1];
  ok(ai.kind === 'ai' && ai.of === lg.b && ai.by === 'rec', '3 照「重新分类」那套写进导入记录（能撤销）');
  const up = await t.st().undoPlan(ai.b); await t.st().undo(up); await t.idle();
  ok(t.recs().filter(r => r.batch === lg.b && r.cat === '酒店旅游').length === 3, '3 撤销：改回「酒店旅游」');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));

  console.log(`导入简化 2b：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
