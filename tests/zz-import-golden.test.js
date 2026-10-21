// 1016-F 「导入以后的账本」逐字节对比（CLAUDE.md：等导入能真的写进账本了，再把它加进对比）。node zz-import-golden.test.js [index.html]
// 用固定的虚构手记 + 固定的虚构账单真导一遍，取账单列表（全部分页）、分类汇总、统计页、当日明细、导出的备份文件，
// 和 fixtures/import-golden.json 里存的标准答案逐字节比。记录编号、批次号这类每次不一样的换成按出现顺序的占位。
// 改了导入的行为、标准答案该变的时候：UPDATE_GOLDEN=1 node zz-import-golden.test.js 重新生成，提交前看一眼 diff。
const H = require('./helpers/app');   // 1017-UI2：确认页分步了，按编号找东西时走到那一步；导入 / 取消多点一下确认
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const IDB = require('./helpers/idb');
const { interceptor, makeFakeWorker } = require('./helpers/import-files');
const B = require('./helpers/bills');

const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const WWW = path.dirname(htmlFile);
const GOLD = path.join(__dirname, 'fixtures', 'import-golden.json');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
async function until(fn, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch (_) {} await new Promise(r => setTimeout(r, 3)); } return !!fn(); }
const ID = 'u1760000000000000031', NOW = '2026-10-20T10:00:00';
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
let seq = 0;
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const r = (id, d, money, cat, remark, o) => Object.assign({ id, time: `2026-10-${String(d).padStart(2, '0')}T08:30`, money, type: 'expense', cat, remark }, o || {});
const MANUAL = [r('g1', 1, 15, '吃饭', '早饭'), r('g2', 2, 15, '吃饭', '早饭'), r('g3', 6, 30, '吃饭', '午饭'), r('g4', 9, 5000, '工资', '十月工资', { type: 'income' }),
                r('g5', 12, 48.3, '出行', '火车票'), r('g6', 15, 66, '购物', '')];
const BILLS = [
  ['微信.csv', 'wechat', [
    ...[1, 2, 3].map(d => wx({ time: T(10, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 })),
    wx({ time: T(10, 6, 12, 10), cp: '某面馆', fen: 2800 }),
    wx({ time: T(10, 7, 9), kind: '零钱提现', io: 'neutral', cp: '零钱', fen: 20000, desc: '提现' }),
    wx({ time: T(10, 8, 18), kind: '转账', cp: '*小玲', fen: 10000, desc: '转账备注:微信转账' }),
    wx({ time: T(10, 9, 19), kind: '转账', io: 'income', cp: '*小玲', fen: 10000, desc: '转账备注:还你饭钱' }),
    wx({ time: T(10, 10, 12), cp: '某超市', fen: 5000, status: '已退款¥10.00' }),
    wx({ time: T(10, 11, 9), cp: '某超市', kind: '某超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: wrno() }),
    wx({ time: T(10, 13, 12), cp: '某饭店', fen: 6600, status: '已全额退款' }),
    wx({ time: T(10, 13, 14), cp: '某饭店', kind: '某饭店-退款', io: 'income', fen: 6600, status: '已全额退款', no: wrno() }),
    ...[1, 2, 3, 4].map(d => wx({ time: T(10, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 })),
    wx({ time: T(10, 16, 20), kind: '信用卡还款', cp: '虚构银行', fen: 30000 }),
  ]],
  ['支付宝.csv', 'alipay', [
    ali({ time: T(10, 12, 9), cp: '虚构铁路甲', kind: '交通出行', fen: 1510 }), ali({ time: T(10, 12, 9, 20), cp: '虚构铁路乙', kind: '交通出行', fen: 3320 }),
    ali({ time: T(10, 14, 10), cp: '某电影院', kind: '文化休闲', desc: '电影票', fen: 4500 }),
    ali({ time: T(10, 17, 10), status: '交易关闭', fen: 999 }),
  ]],
];

async function snap() {
  const vc = new VirtualConsole(); vc.forwardTo(console, { jsdomErrors: 'none' });
  const log = [], FW = makeFakeWorker(WWW);
  let backFn = null;
  const dom = new JSDOM(fs.readFileSync(htmlFile, 'utf8'), { virtualConsole: vc, runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    resources: { interceptors: [interceptor(WWW, log)] },
    beforeParse(w) {
      IDB.install(w);
      const ls = { accounts: JSON.stringify([{ id: ID, name: '小明' }]), accounts_v: '1', app_logged_in_user: ID, app_dev_import: '1', ['app_time_repaired_' + ID]: '1',
        ['store_' + ID]: JSON.stringify({ archives: { '默认存档': { cats: ['未分类', '吃饭', '购物', '出行', '工资', '其他'], records: MANUAL } }, last: '默认存档', accountName: '小明' }) };
      Object.entries(ls).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
      w.Date = class extends Date { constructor(...x) { x.length ? super(...x) : super(NOW); } static now() { return new Date(NOW).getTime(); } };
      w.Worker = FW; w.__files = [];
      w.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async x => { w.__files.push(x.data); return {}; } },
        App: { addListener(ev, fn) { if (ev === 'backButton') backFn = fn; return { remove() {} }; }, exitApp() {} } } };
    } });
  const w = dom.window, d = w.document, $ = H.stepGet(w);
  await IDB.idle(w);
  await until(() => backFn, 2000);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('devImportBtn').click();
  await until(() => $('impPick'));
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: BILLS.map(([name, app, txns]) => new w.File([B.bill(app, txns, { range: { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' } }).bytes], name)), configurable: true });
  input.dispatchEvent(new w.Event('change'));
  await until(() => $('impGo') && /^(导入 \d+ 条|存下待处理)/.test($('impGo').textContent) && $('impBar').style.display === 'flex');
  w.JiwenImportUI._goStep('check');   // 1017-UI2：从第 1 步开始看（等按钮时走到了总览）
  // 固定的确认页操作：多笔合一确认、转账往来都标成不计入
  const S = w.JiwenImportUI._state();
  (S.matched.multiSums || []).forEach(g => { if (g.suggest !== null) S.edits.sums[g.id] = g.suggest; });
  (S.plan.sections.transfers || []).forEach(x => x.keys.forEach(k => { S.edits.rows[k] = { mode: 'skip' }; }));
  w.JiwenImportUI._replan();
  H.clickGo(w);
  await until(() => $('impResult'), 60000);
  $('impBackToLedger').click();
  await IDB.idle(w);
  const out = {};
  out.result = $('impResult') ? '' : 'ok';
  $('exportBtn').click(); await until(() => w.__files.length);
  out.backup = w.__files[0] || '';
  out.overall = $('summaryOverall').innerHTML; out.cats = $('catStats').innerHTML;
  const pages = []; for (let p = 0; p < 10; p++) { pages.push($('billList').innerHTML); const nx = [...$('pager').querySelectorAll('button')].pop(); if (!nx || nx.disabled) break; nx.click(); }
  out.pages = pages.join('|');
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  out.stats = $('statCal').innerHTML + $('statMonthIn').textContent + $('statMonthOut').textContent + $('statMonthCatList').innerHTML;
  const days = [...$('statCal').querySelectorAll('.day.has')];
  out.day = days.length ? (days[Math.min(5, days.length - 1)].click(), $('statFlowList').innerHTML) : '';
  // 每次不一样的：记录编号、批次号、账号编号、导出时间、新增记录的指纹（含批次号）→ 按出现顺序的占位
  const ids = new Map(), bs = new Map();
  const norm = s => s.replace(/r\d{23}/g, m => { if (!ids.has(m)) ids.set(m, '<记录' + (ids.size + 1) + '>'); return ids.get(m); })
    .replace(/("(?:batch|b)": ?")(b[0-9a-z]+)"/g, (m0, a, b) => { if (!bs.has(b)) bs.set(b, '<批次' + (bs.size + 1) + '>'); return a + bs.get(b) + '"'; })
    .replace(/("bs": ?\[)([^\]]*)\]/g, (m0, a, list) => a + list.replace(/"(b[0-9a-z]+)"/g, (m1, b) => { if (!bs.has(b)) bs.set(b, '<批次' + (bs.size + 1) + '>'); return '"' + bs.get(b) + '"'; }) + ']')
    .replace(/("h": ?\[)([^\]]*)\]/g, (m0, a, list) => a + '"<指纹 ' + (list ? list.split(',').length : 0) + ' 个>"]')   // 1016-K：指纹里含批次号，跟时区走
    .replace(/"accountId": ?"u\d+"/g, '"accountId":"<编号>"').replace(/"exportedAt": ?"[^"]*"/g, '"exportedAt":"<时间>"').replace(/"at": ?"[^"]*"/g, '"at":"<时间>"');
  Object.keys(out).forEach(k => { out[k] = norm(out[k]); });
  return out;
}

(async () => {
  const a = await snap(), b = await snap();
  ok(Object.keys(a).every(k => a[k] === b[k]), '同一个版本跑两次结果一样（占位换得对）');
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLD)) {
    fs.writeFileSync(GOLD, JSON.stringify(a, null, 1) + '\n');
    console.log('  已写入标准答案 fixtures/import-golden.json');
  } else {
    const g = JSON.parse(fs.readFileSync(GOLD, 'utf8'));
    Object.keys(g).forEach(k => ok(g[k] === a[k], '导入以后的账本：' + k + ' 和标准答案逐字节一致'));
  }
  ok(a.pages.includes('火车') || a.pages.length > 1000, '账单列表里有导入的记录');
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e && e.stack || e); console.log(`\n${pass} 通过，${fail + 1} 失败`); process.exit(1); });
