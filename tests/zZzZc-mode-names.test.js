// 1020-F 统计口径改叫法（jsdom + 纯计算，记录全是虚构的）。node zZzZc-mode-names.test.js [index.html]
// 「统计口径」改叫「统计」，三种叫「计入 / 不计 / 往来」（原来 计入 / 只算结余 / 不计入），全 App 按计入、不计、往来排；
// 存在记录里的值（normal / skip / flow）不变；导出给 AI 用新叫法，读 AI 回复新老叫法都认（「口径」「不计入」「只算结余」）。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const AI = require(path.join(WWW, 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const OLD = /统计口径|只算结余|不计入/;

// 1. 全 App 搜老叫法：只许留在读 AI 回复的兼容里（那一行写着「老叫法」）
const files = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'vendor') walk(p); }
    else if (/\.(js|html|css)$/.test(f)) files.push(p);
  });
})(WWW);
const left = [];
files.forEach(p => fs.readFileSync(p).toString('utf8').split('\n').forEach((l, i) => { if (OLD.test(l) && !/老叫法/.test(l)) left.push(path.relative(WWW, p) + ':' + (i + 1)); }));
ok(files.length > 30 && !left.length, '1 www 下没有老叫法（读 AI 回复的兼容除外）：' + left.slice(0, 8).join(' '));

// 2. 读 AI 回复：新老叫法都认
const CTX = { batch: 'b88', aiAt: ['2026-10-20 10:00:00'], cats: ['未分类', '吃饭'],
  rows: [1, 2, 3, 4, 5, 6].map(n => ({ n, id: 'r' + n, cat: '吃饭', mode: 'normal', remark: '' })) };
const reply = lines => '```记问\n记问修改建议 v2 批次 b88 导出 2026-10-20 10:00:00\n' + lines.join('\n') + '\n```';
const r = AI.parseReply(reply(['#1 | 统计 | 不计 | 新叫法', '#2 | 统计 | 往来 | 新叫法', '#3 | 口径 | 不计入 | 老叫法', '#4 | 口径 | 只算结余 | 老叫法', '#5 | 统计 | 不计入 | 新字段老值', '#6 | 口径 | 往来 | 老字段新值']), CTX);
const v = n => (r.items.filter(x => x.n === n)[0] || {}).value;
ok(r.ok && r.items.length === 6 && !r.bad.length, '2 六条都认：' + r.items.length + ' 条，没看懂 ' + (r.bad || []).length);
ok(v(1) === 'skip' && v(2) === 'flow' && v(3) === 'skip' && v(4) === 'flow' && v(5) === 'skip' && v(6) === 'flow', '2 不计 / 不计入 → skip，往来 / 只算结余 → flow');
ok(r.items.every(x => x.field === 'mode'), '2 「统计」「口径」都是改统计');
const rb = AI.parseReply(reply(['#1 | 统计 | 一半 | 不认的值']), CTX);
ok(!rb.items.length && /统计只能是计入、不计、往来/.test(rb.bad[0].why), '2 不认的值：写「统计只能是计入、不计、往来」');
ok(AI.MODE_NAME.normal === '计入' && AI.MODE_NAME.skip === '不计' && AI.MODE_NAME.flow === '往来', '2 导出用新叫法');
const ex = AI.exportText({ batch: 'b88', at: '2026-10-20 10:00:00', cats: ['吃饭'], rows: [{ n: 1, time: '2026-10-05 12:10', fen: 1000, type: 'expense', cat: '吃饭', mode: 'skip', dest: '新建' }, { n: 2, time: '2026-10-05 12:11', fen: 500, type: 'income', cat: '吃饭', mode: 'flow', dest: '新建' }] }, {}).parts[0].text;
ok(/分类,统计,去向/.test(ex) && /,不计,/.test(ex) && /,往来,/.test(ex) && /统计（计入 \/ 不计 \/ 往来）/.test(ex) && !OLD.test(ex), '2 导出的全文：表头「统计」、值「不计 / 往来」、规矩里按计入、不计、往来排');

(async () => {
  const recs = [
    { id: 'm1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' },
    { id: 'm2', time: '2026-12-01T13:00', money: 500, type: 'expense', cat: '其他', remark: '虚构还款', skip: true },
    { id: 'm3', time: '2026-12-01T14:00', money: 300, type: 'income', cat: '其他', remark: '虚构期初', flow: true },
  ];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t;
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await wait(50);
  // 3. 账单列表的标签
  const rowOf = id => d.querySelector(`tr[data-id="${id}"]`) || [...d.querySelectorAll('#billList tr')].filter(tr => tr.textContent.includes(recs.find(x => x.id === id).remark))[0];
  ok(rowOf('m2') && rowOf('m2').querySelector('.io-skip').textContent === '不计' && rowOf('m3').querySelector('.io-flow').textContent === '往来', '3 账单列表：不计 / 往来');
  { const cl = d.body.cloneNode(true); cl.querySelectorAll('script,style').forEach(x => x.remove()); const m = cl.textContent.match(/.{0,30}(统计口径|只算结余|不计入).{0,20}/); ok(!m, '3 页面上没有老叫法：' + (m && m[0])); }

  // 4. 记一笔的统计：计入、不计、往来，说明是新的
  $('fabAdd').click(); await wait(420); w.kpClose && w.kpClose();
  const box = $('billMode');
  box.click();
  ok([...d.querySelectorAll('#modePick .mode-pick-row')].map(c => c.dataset.v).join() === 'normal,skip,flow' && [...d.querySelectorAll('#modePick .mode-pick-row b')].map(b => b.textContent).join() === '计入,不计,往来', '4 统计面板按计入、不计、往来排（值不变）');
  w.JiwenSheet.back();
  const H = w.JiwenBase.MODE_HINT;
  ok(H.normal === '算进收入、支出和结余（平时都是这个）' && H.skip === '哪里都不算：信用卡还款、重复记录' && H.flow === '资金往来：转账、存取钱、借还钱，只动结余，不算进收支', '4 三句说明照新的写');

  // 5. 筛选：统计这一栏
  ok([...d.querySelectorAll('.search-label')].some(x => x.textContent === '统计'), '5 筛选里的标题是「统计」');

  // 6. 存的值不变：改成「不计」存进去是 skip:true
  const st = w.JiwenStore.loadStore();
  const all = [].concat(...Object.values(st.months || {}).map(m => m.records || m)).filter(Boolean);
  const m2 = (all.length ? all : (st.records || [])).find(x => x && x.id === 'm2');
  ok(!m2 || (m2.skip === true && !('mode' in m2)), '6 记录上照旧存 skip / flow，不存叫法');

  console.log(`1020-F 统计改叫法：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
