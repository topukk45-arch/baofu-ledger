// 1024-B 导入简化第 1 版：导入量度。导入记录里多存一个可有可无的 m（只有数字）：总笔数、自动定了、要人看（按原因分）、
// 每种里改了推荐的几件、分类是哪一层给的、从选文件到点导入几分钟、走的是「导入」还是「逐项看看」。
// 「导入后改了分类」不存，看的时候按导入记录里的指纹现算（JiwenImportStore.measureList）。
// 顺带锁住：手记和账单合并后手记带上对方编号；下次导入同一对方的新账单，推荐分类等于这几条手记的分类（账本历史要同一对方至少 3 条）。
// 纯计算 + jsdom 真导。node zZzZzI-measure-1024b.test.js [index.html]。数据全是虚构的。
const fs = require('fs'), path = require('path');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const IMP = path.join(path.dirname(htmlFile), 'import');
const P = require(path.join(IMP, 'plan.js'));
const A = require('./helpers/app');
const B = require('./helpers/bills');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. 纯计算：一笔只算一次（和手记对不上 → 退款没原单 → 金额提醒 → 没见过的类型 → 分类拿不准），提醒类不算要人看
  const row = (key, group, rec, o) => Object.assign({ src: 'row', key, group, rec, units: 1, tags: [] }, o || {});
  const p = { rows: [
    row('a', 'add', { layer: 'builtin', conf: 'mid', cat: '餐饮' }),
    row('b', 'add', { layer: 'none', conf: null, cat: '未分类' }),
    row('c', 'pending', null),
    row('d', 'add', { layer: 'builtin', conf: 'low', cat: '购物' }),
    row('e', 'add', { layer: 'alipay', conf: 'mid', cat: '出行' }, { tags: ['otherType'] }),
    row('f', 'pending', null),
    row('g', 'add', { layer: 'history', conf: 'mid', cat: '转账' }),
    row('h', 'add', { layer: 'rule', conf: 'mid', cat: '其他' }),
    row('i', 'add', { layer: 'learned', conf: 'mid', cat: '餐饮' }, { units: 3 }),
    { src: 'sum', key: 'S1', group: 'add', units: 4 }
  ], sections: { cpSingles: [{ cp: '某某', keys: ['h'] }] } };
  const items = {
    match: [{ id: 'ps:c', keys: ['c'], chg: true }, { id: 'sum:G1', keys: ['c'], chg: false }],
    refund: [{ id: 'ps:f', keys: ['f'] }, { id: 'tr:T0', keys: ['g'], chg: true }, { id: 'rh:g', keys: ['g'] }],
    cat: [{ id: 'ty:alipay|某类型', keys: [], chg: true }, { id: 'cp:某店', keys: ['b', 'd'], chg: true }, { id: 'nc:水果', keys: ['b'] }],
    amount: [{ id: 'am:d', keys: ['d'] }]
  };
  const m = P.measure(p, items, { total: 20, ms: 150000 });
  ok(m.v === 1 && m.n === 20 && m.path === 'step' && m.min === 2.5, '1 总笔数、几分钟（2.5）、没说就是逐项看看：' + JSON.stringify([m.n, m.min, m.path]));
  ok(JSON.stringify(m.why) === JSON.stringify({ match: 1, refund: 1, amount: 1, type: 1, cat: 2 }), '1 按原因分、一笔只算一次（d 算金额不算分类）：' + JSON.stringify(m.why));
  ok(m.look === 6 && m.auto === 14, '1 要你看 6、自动定了 14（转账往来、全额退款提醒不算要人看）');
  ok(JSON.stringify(m.chg) === JSON.stringify({ match: 1, refund: 0, amount: 0, type: 1, cat: 1 }), '1 每种里改了推荐的几件（转账往来改了不算）：' + JSON.stringify(m.chg));
  ok(JSON.stringify(m.layer) === JSON.stringify({ rule: 1, learned: 3, history: 1, borrow: 0, builtin: 2, alipay: 1, none: 1 }), '1 分类是哪一层给的（只数新增组，按笔数）：' + JSON.stringify(m.layer));
  ok(P.measure(p, {}, { path: 'quick' }).path === 'quick' && P.measure(p, {}, {}).n === 11, '1 走「导入」记 quick；没给总笔数按方案里的行数');
  // 1024-V：分类拿不准的新增拆开数：推不出的按交易类型、个人；把握低的按原因
  {
    const q = { rows: [
      row('n1', 'add', { layer: 'none', cat: '未分类' }, { kind: '商户消费', cp: '某虚构小店' }),
      row('n2', 'add', { layer: 'none', cat: '未分类' }, { kind: '转账', cp: '张*' }),
      row('n3', 'add', { layer: 'none', cat: '未分类' }, { kind: '扫二维码付款', cp: '某虚构摊', desc: '收钱码收款' }),
      row('n4', 'add', { layer: 'none', cat: '未分类' }, { kind: '微信红包', cp: '李*', units: 2 }),
      row('l1', 'add', { layer: 'builtin', conf: 'low', cat: '餐饮', descOnly: true, reason: '内置（商品说明里的「果切」）→ 餐饮美食' }),
      row('l2', 'add', { layer: 'builtin', conf: 'low', cat: '购物', reason: '内置（平台「淘宝」，卖什么的都有）→ 日用百货' }),
      row('l3', 'add', { layer: 'alipay', conf: 'low', cat: '转账', reason: '付给个人的（收钱码 / 转账），支付宝写的「商业服务」不算数 → 转账红包' }),
      row('l4', 'add', { layer: 'builtin', conf: 'mid', cat: '餐饮' }),
      row('l5', 'neutral', { layer: 'none', cat: '未分类' }, { kind: '转账' }),
      row('l6', 'add', { layer: 'none', cat: '未分类' }, { kind: '转账', mode: 'skip' })
    ], sections: {} };
    const mq = P.measure(q, {}, {});
    ok(JSON.stringify(mq.none) === JSON.stringify({ shop: 1, qr: 1, transfer: 1, redpack: 2, other: 0, person: 4 }), '1 推不出的按交易类型数、对方是个人的另数（不计的、不是新增的不算）：' + JSON.stringify(mq.none));
    ok(JSON.stringify(mq.low) === JSON.stringify({ desc: 1, plat: 1, person: 1, game: 0, other: 0 }), '1 把握低的按原因数：' + JSON.stringify(mq.low));
    // 1024-W：和个人之间的（rec.person）算 person；「要你看 · 分类」里其余的按新建分类 / 并进其他 / 别的数
    const q2 = { rows: [
      row('p1', 'add', { layer: 'builtin', conf: 'low', cat: '转账', person: true, reason: '个人转给你的（转账、红包）→ 转账红包' }),
      row('c1', 'add', { layer: 'builtin', conf: 'mid', cat: '游戏', newCat: '游戏' }),
      row('c2', 'add', { layer: 'builtin', conf: 'mid', cat: '游戏', newCat: '游戏' }),
      row('c3', 'add', { layer: 'builtin', conf: 'mid', cat: '其他', newCat: '会员订阅' })
    ], sections: {} };
    const mq2 = P.measure(q2, { cat: [{ id: 'nc:游戏', keys: ['c1', 'c2'] }, { id: 'cp:某虚构', keys: ['c3', 'p1'] }] }, {});
    ok(mq2.low.person === 1 && mq2.why.cat === 4 && JSON.stringify(mq2.rest) === JSON.stringify({ newcat: 2, merged: 1, other: 0 }), '1 1024-W：rest 数新建分类 2、并进其他 1（推不出 / 把握低的不重复数）：' + JSON.stringify(mq2.rest) + ' ' + JSON.stringify(mq2.low));
  }
  const flat = JSON.stringify(m);
  ok(!/某|餐饮|水果|[a-i]"/.test(flat.replace(/"(v|n|auto|look|why|chg|layer|min|path|match|refund|amount|type|cat|rule|learned|history|borrow|builtin|alipay|none|step|low|shop|qr|transfer|redpack|other|person|desc|plat|game|rest|newcat|merged|grp|add|merge|pending|neutral|skip|error|excluded)"/g, '')), '1 量度里只有数字，没有对方名、分类名、键（1024-V 起多 none / low 两组数，1024-W 起多 rest，1024-X 起多 grp）');

  // 2. 真导：手记合并后带上对方编号，下次同一对方推手记的分类；导入记录里有 m
  const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
  let seq = 0;
  const T = (mo, d, h) => ({ y: 2026, mo, d, h: h || 12, mi: 10, s: 0 });
  const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某面馆', desc: '虚构商品', io: 'expense', fen: 2500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
  const R = (id, d) => ({ id, time: `2026-09-${String(d).padStart(2, '0')}T12:00`, money: 25, type: 'expense', cat: '吃饭', remark: '午饭' });
  const F1 = [['九月.csv', B.bill('wechat', [3, 5, 7].map(d => wx({ time: T(9, d) })), { range: { from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59' } }).bytes]];
  const F2 = [['十月.csv', B.bill('wechat', [wx({ time: T(10, 2), fen: 3100 }), wx({ time: T(10, 3), cp: '某虚构书店', fen: 4200 })], { range: { from: '2026-10-01 00:00:00', to: '2026-10-15 23:59:59' } }).bytes]];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([R('g1', 3), R('g2', 5), R('g3', 7)]), now: '2026-10-20T10:00:00' });
  const w = t.w, $ = t.$;
  await t.importFiles(F1);
  const arch = t.arch(), g = id => arch.records.find(r => r.id === id);
  const cpOf = r => r && Number.isInteger(r.cp) ? arch.cps[r.cp] : null;
  ok(['g1', 'g2', 'g3'].every(id => g(id) && g(id).src && g(id).src.merged && cpOf(g(id)) === '某面馆'), '2 手记和账单合并后带上对方编号（某面馆）');
  ok(['g1', 'g2', 'g3'].every(id => g(id).cat === '吃饭'), '2 合并时手记的分类不动');
  let logs = await t.logs();
  const m1 = logs[logs.length - 1].m;
  ok(m1 && m1.v === 1 && m1.n === 3 && m1.auto + m1.look === m1.n && m1.path === 'step' && typeof m1.min === 'number', '2 第一次导入的量度：3 笔、自动 + 要人看 = 总数、逐项看看：' + JSON.stringify(m1));
  // 同一批 3 次合并、分类一致 → 「从合并里学」先存成了规则；把规则去掉，看手记上的对方编号单独也能让下次推对（账本历史）
  const info1 = t.st().archiveInfo();
  ok(info1.cpHist && info1.cpHist['某面馆'] && info1.cpHist['某面馆'].e['吃饭'] === 3, '2 账本历史按手记上的对方编号数到了 3 次吃饭');
  ok(((t.arch().importRules || {}).cat || []).some(r => r && r.kw === '某面馆' && r.cat === '吃饭'), '2 同一批合并 3 次、分类一致：存成了规则（某面馆 → 吃饭）');
  await t.st().rulesSave({ cat: [], type: [] }); await t.idle();
  let recs2 = null;
  await t.importFiles(F2, S => { recs2 = S.plan.rows.filter(d => d.src === 'row').map(d => ({ cp: d.cp, rec: d.rec || (d.item && d.item.rec) })); });
  const mian = recs2 && recs2.find(x => x.cp === '某面馆');
  ok(mian && mian.rec && mian.rec.cat === '吃饭' && mian.rec.layer === 'history', '2 下次导入同一对方：推荐分类 = 手记的分类（从账本历史里学）：' + JSON.stringify(mian && mian.rec));
  logs = await t.logs();
  const l2 = logs[logs.length - 1], m2 = l2.m;
  ok(m2 && m2.n === 2 && m2.layer.history === 1 && m2.layer.history + m2.layer.none + m2.layer.builtin + m2.layer.rule + m2.layer.learned + m2.layer.borrow + m2.layer.alipay === 2, '2 第二次导入：分类来自账本历史 1 笔：' + JSON.stringify(m2 && m2.layer));
  ok(m2.why.cat >= 1 && m2.look >= 1, '2 新对方推不出分类：算「分类拿不准」');

  // 3. 导入后改了几笔分类：按指纹现算
  let ml = await t.st().measureList();
  ok(ml.length === 2 && ml[0].b === l2.b && ml[0].catChg === 0 && ml[0].otherChg === 0 && ml[0].gone === 0 && ml[0].days === 0, '3 最近的在前，刚导完没改过');
  const u = w.JiwenStore.loadStore(w.JiwenBase.currentUser), a2 = u.archives[w.JiwenBase.currentArchive];
  const [x0, x1] = l2.add;
  a2.records = a2.records.map(r => r.id === x0 ? Object.assign({}, r, { cat: r.cat === '购物' ? '其他' : '购物' }) : r.id === x1 ? Object.assign({}, r, { remark: (r.remark || '') + '改过' }) : r);
  w.JiwenStore.saveStore(u); await tick(60);
  ml = await t.st().measureList();
  ok(ml[0].catChg === 1 && ml[0].otherChg === 1, '3 改了分类的 1 笔、改了别的 1 笔：' + JSON.stringify([ml[0].catChg, ml[0].otherChg]));
  ok(ml[1].catChg === 0 && ml[1].m && ml[1].m.n === 3, '3 第一次导入：合并的手记不算新建');

  // 4. 导入记录那一行点开写一句；开发开关里「导入量度」只有数字、能复制
  $('devLogsBtn').click();
  await t.until(() => t.d.querySelector('.imp-log-info'));
  t.d.querySelector('.imp-log-info').click(); await tick();
  const sb = t.d.getElementById('uiSheetBody');
  ok(sb && /笔数/.test(sb.textContent) && new RegExp('2 笔，自动定了 ' + m2.auto + '，要你看 ' + m2.look).test(sb.textContent), '4 导入记录详情：「2 笔，自动定了 x，要你看 y（分类 …）」：' + (sb && sb.textContent));
  const lc = t.d.getElementById('impLogDetailClose'); if (lc) lc.click(); await tick();
  await t.back(); await t.back(); await tick();
  if ($('impPage') && $('impPage').style.display === 'block') { w.JiwenImportUI.close && w.JiwenImportUI.close(); await tick(); }
  ok($('devMeasureBtn') && $('devMeasureBtn').style.display !== 'none', '4 开发开关开着：设置里有「导入量度」');
  $('devMeasureBtn').click();
  await t.until(() => t.d.getElementById('measureList'));
  const txt = t.d.getElementById('measureList').textContent;
  ok(/3 笔，自动定了/.test(txt) && /2 笔，自动定了/.test(txt) && /导入后改了分类 1 笔，改了别的 1 笔/.test(txt) && /分类来自（只数新建的 \d+ 笔）：.*账本历史 1/.test(txt) && /逐项看看/.test(txt), '4 列出最近几次的量度：' + txt);
  ok(!/某面馆|某虚构书店|25\.00|31\.00|42\.00|吃饭/.test(txt), '4 不带对方名、金额、分类名');
  ok(/推不出的 \d+：商户消费 \d+、扫码付款 \d+、转账 \d+、红包 \d+、别的 \d+；其中对方是个人 \d+/.test(txt) && /把握低的 \d+：只在商品说明里认出 \d+、平台或综合商超 \d+、和个人之间的 \d+、礼包 \d+、别的 \d+/.test(txt) && /分类里其余的 \d+：新建分类的 \d+、不到 3 笔并进「其他」的 \d+、别的 \d+/.test(txt), '4 1024-V：分类拿不准的拆开写（推不出的按类型、把握低的按原因；1024-W 其余的按新建分类 / 并进其他）');
  ok(t.d.getElementById('measureCopy') && t.d.getElementById('measureClose'), '4 有「复制全部」「关闭」');
  // 1024-T 后修（手机上「复制全部」弹出系统框、框里看不到字）：安卓 WebView 拒了剪贴板时不再退到系统 prompt
  {
    let prompted = 0, execd = null; const p0 = w.prompt, e0 = t.d.execCommand, c0 = w.navigator.clipboard;
    w.prompt = () => { prompted++; return null; };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('NotAllowed')) }, configurable: true });
    t.d.execCommand = () => false;
    t.d.getElementById('measureCopy').click(); await tick(60);
    ok(!prompted && /没复制上，长按上面的字选中复制/.test(t.d.getElementById('measureCopy').textContent), '4 剪贴板被拒：不弹系统框，按钮写「没复制上，长按上面的字选中复制」');
    t.d.execCommand = cmd => { execd = cmd; return true; };
    t.d.getElementById('measureCopy').click(); await tick(60);
    ok(execd === 'copy' && t.d.getElementById('measureCopy').textContent === '已复制' && !prompted, '4 先用藏着的文本框复制（WebView 里最稳）：「已复制」');
    const css = require('fs').readFileSync(require('path').join(WWW, 'app', 'app.css'), 'utf8');
    ok(/pre\.perf-list \{[^}]*user-select:text/.test(css), '4 量度那几行能长按选中');
    w.prompt = p0; t.d.execCommand = e0; Object.defineProperty(w.navigator, 'clipboard', { value: c0, configurable: true });
  }
  t.d.getElementById('measureClose').click(); await tick();

  // 5. 撤销跟着导入记录走：撤了第二次，量度那条一起没了
  await w.eval('JiwenImportEntry.loadImportUI')();
  const up = await t.st().undoPlan(l2.b); await t.st().undo(up); await t.idle();
  ml = await t.st().measureList();
  ok(ml.length === 1 && ml[0].m && ml[0].m.n === 3, '5 撤销第二次以后只剩第一次的量度');

  // 6. 导入备份文件：m 洗干净（不是数字的变 0、多的字段不要、形状不对整个不要），没有 m 的照旧没有
  const ex = await w.JiwenImportStore.importsRead();
  ok(JSON.stringify(ex[0].m) === JSON.stringify(m1), '6 存下来的和算出来的一样');
  await w.JiwenStore.importArchiveFromText(JSON.stringify({ user: 'x', archive: '量度', cats: ['未分类', '吃饭'],
    data: [{ id: 'r1', time: '2026-09-01T10:00', money: 9, type: 'expense', cat: '吃饭', remark: '' }],
    imports: [
      { b: 'bx1', at: '2026-09-02T10:00', apps: ['wechat'], from: '2026-09-01', to: '2026-09-01', add: ['r1'], chg: [],
        m: { v: 1, n: 5, auto: 'x', look: -1, why: { cat: 2, foo: 9 }, chg: [1], layer: 'bad', min: 2.345, path: 'other', name: '某某' } },
      { b: 'bx2', at: '2026-09-03T10:00', apps: ['wechat'], from: '2026-09-01', to: '2026-09-01', add: [], chg: [], m: [1, 2] },
      { b: 'bx3', at: '2026-09-04T10:00', apps: ['wechat'], from: '2026-09-01', to: '2026-09-01', add: [], chg: [] }
    ] }), w.localStorage.getItem('app_logged_in_user'));
  await t.idle();
  const il = await w.JiwenImportStore.importsRead('量度');
  const c1 = il.find(l => l.b === 'bx1').m;
  ok(c1 && c1.n === 5 && c1.auto === 0 && c1.look === 0 && c1.why.cat === 2 && !('foo' in c1.why) && c1.chg.cat === 0 && c1.layer.none === 0 && c1.min === 2.3 && c1.path === 'step' && !('name' in c1),
    '6 导入备份：m 里不对的洗成 0、多的不要：' + JSON.stringify(c1));
  ok(!('m' in il.find(l => l.b === 'bx2')) && !('m' in il.find(l => l.b === 'bx3')), '6 形状不对的、本来没有的：不带 m');

  ok(!t.errs.length, '没有报错 ' + t.errs.join('|'));
  console.log(`1024-B 导入量度：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
