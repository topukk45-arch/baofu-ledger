// 界面检查（1016-UI1 起）：用真的 Chromium（Playwright）按手机尺寸打开 www/index.html，过一遍各个页面，每页自动量：
//   1. 能点的东西（按钮、链接、可点的行、图标、勾选框所在的那一行、下拉框）的点击区域宽高，列出小于 48px 的，和相邻间距小于 8px 的；
//   2. 主按钮在屏幕上的位置（离底部多远），主按钮在屏幕上半部分的标出来；
//   3. 页面内容占了屏幕多高、下面空了多少。
// 不是自动测试（不进 run-all，打包机上没有浏览器），改界面前后手动跑一遍对比：
//   NODE_PATH=$(npm root -g) node tests/ui/audit.js 输出目录 [--only 配置名] [--shots]
//   配置：main（412×970 浅色）、narrow（360×780）、dark（412×970、系统深色）、big（412×970、字号 ×1.15）
// 结果：输出目录/audit-<配置>.json、summary.md；--shots 时每页一张截图 <配置>-<页面>.png。
// 数据全是虚构的（tests/helpers/bills.js 生成账单，手记、分类、对方名都是编的）。
// 字号放大用的是近似做法：页面里每个元素自己写了 px 字号的，按 1.15 倍改成行内字号（安卓 WebView 的「字体大小」是整体放大文字，效果接近）。
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const B = require('../helpers/bills');

const WWW = path.join(__dirname, '..', '..', 'www');
const FIX = path.join(__dirname, '..', 'fixtures');
const OUT = path.resolve(process.argv[2] || 'ui-audit-out');
const ONLY = (process.argv.indexOf('--only') > 0) ? process.argv[process.argv.indexOf('--only') + 1] : null;
const SHOTS = process.argv.includes('--shots');
const MIN = 48, GAP = 8;
const CONFIGS = [
  { name: 'main', w: 412, h: 970 },
  { name: 'narrow', w: 360, h: 780 },
  { name: 'dark', w: 412, h: 970, dark: true },
  { name: 'big', w: 412, h: 970, scale: 1.15 },
];
fs.mkdirSync(OUT, { recursive: true });

// ---------- 虚构数据 ----------
const ID = 'u1760000000000000077';
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const pad = n => String(n).padStart(2, '0');
const BASE_CATS = ['未分类', '吃饭', '购物', '出行', '工资', '红包', '其他', '日用', '水电燃气', '话费网费', '房租', '医疗', '学习', '娱乐', '运动', '宠物',
  '人情往来', '孩子', '父母', '旅行', '数码', '衣服', '美容', '水果', '零食', '咖啡奶茶', '外卖', '早餐', '午餐', '晚餐', '夜宵', '打车', '地铁公交',
  '加油', '停车', '保险', '理财', '捐赠', '维修', '家具'];
const REMARKS = ['早饭', '午饭', '晚饭', '地铁', '买菜', '水果', '充话费', '打车回家',
  '和同事一起在公司楼下那家新开的面馆吃了一碗很贵的牛肉面加了两个蛋和一份小菜，还买了杯奶茶', '给家里买的一大堆日用品：洗衣液、纸巾、牙膏、垃圾袋、洗洁精，凑满减'];
function oldRecords(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const mo = 6 + Math.floor(i / n * 5), d = 1 + Math.floor(rnd() * 28);
    const inc = rnd() < 0.08;
    out.push({ id: 'r' + i, time: `2026-${pad(Math.min(mo, 10))}-${pad(d)}T${pad(7 + Math.floor(rnd() * 14))}:${pad(Math.floor(rnd() * 60))}`,
      money: inc ? (rnd() < 0.5 ? 12345678.9 : 8000) : Math.round((5 + rnd() * (rnd() < 0.05 ? 99999 : 120)) * 100) / 100,
      type: inc ? 'income' : 'expense', cat: inc ? '工资' : pick(BASE_CATS.slice(1)), remark: pick(REMARKS) });
  }
  return out;
}
const seedOf = (o) => {
  const ls = { accounts_v: '1', app_time_repaired_x: '1' };
  if (o.dev) ls.app_dev_import = '1';
  if (o.recs) {
    ls.accounts = JSON.stringify([{ id: ID, name: '小明' }]); ls.app_logged_in_user = ID; ls['app_time_repaired_' + ID] = '1';
    ls['store_' + ID] = JSON.stringify({ archives: { '默认存档': Object.assign({ cats: o.cats || BASE_CATS.slice(0, 8), records: o.recs }, o.budgets ? { budgets: o.budgets } : {}) }, last: '默认存档', accountName: '小明' });
  } else ls.accounts = '[]';
  return ls;
};

// 导入用的账单：对方名很长、金额很大、几十笔拿不准（待处理）、没见过的交易类型、转账往来、几笔加起来是一条手记……
let seq = 0;
const resetData = () => { seed = 7; seq = 0; };
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const wno = () => '4200000000' + String(++seq).padStart(19, '0');
const wrno = () => '5030000000' + String(++seq).padStart(19, '0');
const ano = () => '2026' + String(++seq).padStart(24, '0');
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: wno() }, o));
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '余额', status: '交易成功', mno: '', no: ano() }, o));
const LONG_CP = '某某某某市某某区某某某某某某餐饮管理有限公司第一百二十三分店（虚构）';
function richManual() {
  const r = (id, mo, d, h, money, cat, remark, o) => Object.assign({ id, time: `2026-${pad(mo)}-${pad(d)}T${pad(h)}:30`, money, type: 'expense', cat, remark }, o || {});
  const out = [r('g1', 10, 1, 8, 15, '吃饭', '早饭'), r('g2', 10, 2, 8, 15, '吃饭', '早饭'), r('g3', 10, 6, 12, 30, '吃饭', '午饭'),
    r('g4', 10, 9, 9, 5000, '工资', '十月工资', { type: 'income' }), r('g5', 10, 12, 9, 48.3, '出行', '火车票'), r('g6', 10, 15, 10, 66, '购物', '')];
  // 每天两条同金额的手记 → 账单一笔对两条，拿不准，进待处理
  for (let d = 1; d <= 28; d++) { out.push(r('p' + d + 'a', 10, d, 11, 23, '吃饭', '午饭')); out.push(r('p' + d + 'b', 10, d, 13, 23, '吃饭', '午饭')); }
  return out.concat(oldRecords(160));
}
function richBills(mo) {
  mo = mo || 10;
  return [
    ['微信支付账单(20261001-20261031).csv', 'wechat', [
      ...[1, 2, 3].map(d => wx({ time: T(mo, d, 7, 40), cp: '青禾便利', desc: '早餐', fen: 1500 })),
      wx({ time: T(mo, 6, 12, 10), cp: '某面馆', fen: 2800 }),
      wx({ time: T(mo, 7, 9), kind: '零钱提现', io: 'neutral', cp: '零钱', fen: 20000, desc: '提现' }),
      wx({ time: T(mo, 8, 18), kind: '转账', cp: '*小玲', fen: 10000, desc: '转账备注:微信转账' }),
      wx({ time: T(mo, 9, 19), kind: '转账', io: 'income', cp: '*小玲', fen: 10000, desc: '转账备注:还你饭钱' }),
      wx({ time: T(mo, 10, 12), cp: '某超市', fen: 5000, status: '已退款¥10.00' }),
      wx({ time: T(mo, 11, 9), cp: '某超市', kind: '某超市-退款', io: 'income', fen: 1000, status: '已退款¥10.00', no: wrno() }),
      ...[1, 2, 3, 4].map(d => wx({ time: T(mo, d, 6), kind: '分分捐', cp: '某虚构公益', desc: '/', fen: 1 })),
      wx({ time: T(mo, 16, 20), kind: '信用卡还款', cp: '虚构银行', fen: 30000 }),
      wx({ time: T(mo, 18, 20), kind: '某个没见过的新类型', cp: '虚构平台', fen: 1999 }),
      wx({ time: T(mo, 19, 21), cp: LONG_CP, desc: '一份很长很长的商品说明：招牌套餐加大份另加饮料（虚构）', fen: 8888800 }),
      ...[1, 2, 3, 4, 5].map(d => wx({ time: T(mo, 20 + d, 12, 5), cp: '公司楼下某餐厅（虚构）', desc: '午餐', fen: 1200 + d * 50 })),
      ...Array.from({ length: 28 }, (_, i) => wx({ time: T(mo, i + 1, 12, 15), cp: '某快餐店' + (i % 4), desc: '套餐', fen: 2300 })),
    ]],
    ['支付宝交易明细(20261001-20261031).csv', 'alipay', [
      ali({ time: T(mo, 12, 9), cp: '虚构铁路甲', kind: '交通出行', fen: 1510 }), ali({ time: T(mo, 12, 9, 20), cp: '虚构铁路乙', kind: '交通出行', fen: 3320 }),
      ali({ time: T(mo, 14, 10), cp: '某电影院', kind: '文化休闲', desc: '电影票', fen: 4500 }),
      ali({ time: T(mo, 17, 10), status: '交易关闭', fen: 999 }),
      ali({ time: T(mo, 22, 10), cp: '某宠物医院（虚构）', kind: '爱车养车', desc: '体检', fen: 230000 }),
      ali({ time: T(mo, 23, 15), cp: '某数码旗舰店（虚构）', kind: '数码电器', desc: '耳机', fen: 129900 }),
    ]],
  ].map(([name, app, txns]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(B.bill(app, txns, { range: { from: `2026-${pad(mo)}-01 00:00:00`, to: `2026-${pad(mo)}-${mo === 9 ? 30 : 31} 23:59:59` } }).bytes) }));
}

// ---------- 量尺寸（在页面里跑）----------
// scope：只看这几个容器里的（选择器，逗号分开；不给就是整页去掉开着的弹窗以外的）；primary：主按钮选择器
function measureInPage(arg) {
  const { scope, primary, MIN, GAP } = arg;
  const H = innerHeight, W = innerWidth;
  const vis = e => e.checkVisibility ? e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!e.getClientRects().length;
  const roots = scope ? [...document.querySelectorAll(scope)].filter(vis) : [document.body];
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, label, [role=button], .cs-display, .cc, .dt-day, .dt-cell, .theme-swatch, [data-act]';
  const set = new Set();
  roots.forEach(r => {
    r.querySelectorAll(SEL).forEach(e => set.add(e));
    r.querySelectorAll('*').forEach(e => { if (getComputedStyle(e).cursor === 'pointer') set.add(e); });
  });
  // 不在 scope 里时，开着的弹窗（.mask）里的不算（它们单独量）
  const inOpenMask = e => { const m = e.closest('.mask, #impSheetMask, #impProg'); return m && !scope; };
  const isClick = e => set.has(e);
  let els = [...set].filter(e => vis(e) && !inOpenMask(e));
  // 不带输入框、也不指向输入框的 label 只是标题，不算能点的
  els = els.filter(e => !(e.tagName === 'LABEL' && !e.htmlFor && !e.querySelector('input, select, textarea') && getComputedStyle(e).cursor !== 'pointer'));
  els = els.filter(e => {
    if (e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) return false;   // 量外面那一行
    const r = e.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return false;                                                  // 藏起来的勾选框
    // 按钮里面的字、图标：量按钮本身
    let p = e.parentElement;
    while (p) { if (isClick(p) && ['BUTTON', 'A', 'LABEL', 'SELECT'].includes(p.tagName)) return false; if (isClick(p) && getComputedStyle(e).cursor === 'pointer' && getComputedStyle(p).cursor === 'pointer' && !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(e.tagName)) return false; p = p.parentElement; }
    return true;
  });
  // 所在的层：最近的固定定位祖先或可滚动祖先（不同层的不比间距）
  const layerOf = e => { let p = e; while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.position === 'fixed' || cs.position === 'sticky' || /(auto|scroll)/.test(cs.overflowY)) return p; p = p.parentElement; } return document.body; };
  const label = e => { const t = (e.getAttribute('aria-label') || e.textContent || e.value || e.placeholder || e.id || e.className || e.tagName).replace(/\s+/g, ' ').trim(); return (e.id ? '#' + e.id + ' ' : '') + t.slice(0, 40); };
  // 点击区域：元素本身，加上用 ::before / ::after 往外撑的那一圈（position:absolute、负的 top/left/right/bottom）
  const hitRect = e => {
    const r0 = e.getBoundingClientRect(); let r = { left: r0.left, top: r0.top, right: r0.right, bottom: r0.bottom };
    const ce = getComputedStyle(e), bl = parseFloat(ce.borderLeftWidth) || 0, bt = parseFloat(ce.borderTopWidth) || 0;
    ['::before', '::after'].forEach(ps => {
      const c = getComputedStyle(e, ps);
      if (!c || c.content === 'none' || c.content === 'normal' || c.position !== 'absolute' || c.pointerEvents === 'none') return;
      const px = v => (/px$/.test(v) ? parseFloat(v) : NaN);
      const w = px(c.width), h = px(c.height), L = px(c.left), T = px(c.top);
      if ([w, h, L, T].some(isNaN)) return;
      let tx = 0, ty = 0; const m = /matrix\(([^)]+)\)/.exec(c.transform || ''); if (m) { const v = m[1].split(',').map(Number); tx = v[4]; ty = v[5]; }
      const l = r0.left + bl + L + tx, t = r0.top + bt + T + ty;
      r = { left: Math.min(r.left, l), top: Math.min(r.top, t), right: Math.max(r.right, l + w), bottom: Math.max(r.bottom, t + h) };
    });
    r.width = r.right - r.left; r.height = r.bottom - r.top; return r;
  };
  // 分段按钮（.seg、底栏）几个挨着是一组，组内不算间距
  const groupOf = e => e.closest('.seg, .tab-bar, .ui-seg');
  const items = els.map(e => { const r = hitRect(e); return { e, r, layer: layerOf(e), name: label(e), grp: groupOf(e) }; });
  const small = [], tight = [];
  items.forEach(x => { if (x.r.height < MIN - 0.5 || x.r.width < MIN - 0.5) small.push({ name: x.name, w: Math.round(x.r.width), h: Math.round(x.r.height), top: Math.round(x.r.top) }); });
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.layer !== b.layer || a.e.contains(b.e) || b.e.contains(a.e)) continue;
    if (a.grp && a.grp === b.grp) continue;
    const dx = Math.max(0, a.r.left - b.r.right, b.r.left - a.r.right), dy = Math.max(0, a.r.top - b.r.bottom, b.r.top - a.r.bottom);
    if (dx > 0 && dy > 0) continue;                    // 斜对着的不算挨着
    const g = Math.max(dx, dy);
    if (g < GAP - 0.5) tight.push({ a: a.name, b: b.name, gap: Math.round(g * 10) / 10 });
  }
  // 主按钮
  const prim = [];
  (primary || []).forEach(s => document.querySelectorAll(s).forEach(e => {
    if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.width <= 2) return;
    prim.push({ sel: s, name: label(e), top: Math.round(r.top), bottom: Math.round(r.bottom), fromBottom: Math.round(H - r.bottom), upper: (r.top + r.bottom) / 2 < H / 2, offscreen: r.top > H, h: Math.round(r.height), w: Math.round(r.width) });
  }));
  // 内容占多高：scope 里看得见的最下面那个东西（固定在底部的操作栏不算内容）
  let bottom = 0;
  roots.forEach(r => r.querySelectorAll('*').forEach(e => {
    if (!vis(e) || !e.getClientRects().length) return; const cs = getComputedStyle(e);
    if (e.closest('#impBar, .tab-bar, .action-bar, .ui-bottom-bar')) return;
    if (!e.children.length || /^(BUTTON|INPUT|SELECT|IMG|svg)$/.test(e.tagName) || cs.backgroundImage !== 'none' || cs.borderBottomWidth !== '0px') { const b0 = e.getBoundingClientRect().bottom; if (b0 > bottom) bottom = b0; }
  }));
  // 横向溢出：超出屏幕右边的
  const over = [];
  roots.forEach(r => r.querySelectorAll('*').forEach(e => { if (!vis(e)) return; const b0 = e.getBoundingClientRect(); if (b0.right > W + 1 && b0.width > 0 && getComputedStyle(e).position !== 'fixed') over.push((e.id ? '#' + e.id : e.className || e.tagName) + ' 右边到 ' + Math.round(b0.right)); }));
  return { H, W, n: items.length, small, tight, prim, contentBottom: Math.round(bottom), blank: Math.max(0, Math.round(H - bottom)), hscroll: document.documentElement.scrollWidth > W + 1, over: over.slice(0, 8) };
}

// ---------- 页面驱动 ----------
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(WWW, p);
      if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, () => res(srv));
  });
}

async function run(cfg, port, browser) {
  resetData();
  const results = [];
  const shotsDir = OUT;
  async function newPage(o) {
    const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: cfg.dark ? 'dark' : 'light', locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.reqs = [];
    page.on('request', q => page.reqs.push(q.url()));
    page.errs = [];
    page.on('pageerror', e => page.errs.push(e.message));
    await page.clock.setFixedTime(new Date(o.now || '2026-10-20T10:00:00'));
    await page.addInitScript(([ls, scale, openFile]) => {
      if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.clear(); Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v)); }
      if (openFile) window.Capacitor = { isNativePlatform: () => false, Plugins: { OpenFile: { getPending: async () => { const f = window.__openOnce; window.__openOnce = null; return { file: f }; }, addListener() {} } } };
      if (openFile) window.__openOnce = openFile;
      if (scale && scale !== 1) {
        const orig = new WeakMap();
        const one = el => {
          if (orig.has(el)) return;
          const p = el.parentElement, fs0 = parseFloat(getComputedStyle(el).fontSize);
          if (p && orig.has(p) && Math.abs(fs0 - parseFloat(getComputedStyle(p).fontSize)) < 0.05) { orig.set(el, orig.get(p)); return; }
          orig.set(el, fs0); el.style.setProperty('font-size', (fs0 * scale).toFixed(2) + 'px');
        };
        const walk = root => { if (root.nodeType !== 1) return; one(root); root.querySelectorAll('*').forEach(one); };
        document.addEventListener('DOMContentLoaded', () => { walk(document.documentElement); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(walk))).observe(document.documentElement, { childList: true, subtree: true }); });
      }
    }, [o.ls, cfg.scale || 1, o.openFile || null]);
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(700);
    return page;
  }
  async function measure(page, name, o) {
    o = o || {};
    if (o.scrollTop !== false) await page.evaluate(() => { const p = document.getElementById('impPage'); if (p) p.scrollTop = 0; window.scrollTo(0, 0); });
    await page.waitForTimeout(150);
    const m = await page.evaluate(measureInPage, { scope: o.scope || null, primary: o.primary || [], MIN, GAP });
    m.name = name; m.cfg = cfg.name; m.note = o.note || '';
    results.push(m);
    if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `${cfg.name}-${name}.png`) });
    if (o.more && SHOTS) {          // 往下滑一屏再截一张
      await page.evaluate(() => { const p = document.getElementById('impPage'); if (p && p.style.display === 'block') p.scrollTop += innerHeight * 0.8; else window.scrollBy(0, innerHeight * 0.8); });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(shotsDir, `${cfg.name}-${name}-2.png`) });
    }
    return m;
  }
  const IMP = '#impPage, #impBar, #impSheetMask, #impProg';
  const ASK = '#askMask';
  const click = (page, sel) => page.click(sel, { timeout: 8000 });
  // 1017-UI2 起确认页分步：算完停在第 1 步「核对」
  const waitImpConfirm = page => page.waitForFunction(() => { const S = window.JiwenImportUI && window.JiwenImportUI._state(); return S && S.phase === 'confirm' && S.plan && document.getElementById('impBar').style.display === 'flex'; }, null, { timeout: 60000 });
  const goStep = (page, k) => page.evaluate(k => window.JiwenImportUI._goStep(k), k);
  // 导入：走到总览点主按钮，确认面板里点「确认导入」
  const doImport = async page => { await goStep(page, 'overview'); await click(page, '#impGo'); await page.waitForSelector('#impConfirmOk', { timeout: 15000 }); await click(page, '#impConfirmOk'); await page.waitForSelector('#impResult', { timeout: 60000 }); };
  const askOpen = page => page.waitForFunction(() => document.getElementById('askMask').style.display === 'flex', null, { timeout: 15000 });
  const askClose = async (page, ok) => { await click(page, ok ? '#askOk' : '#askCancel'); await page.waitForTimeout(250); };
  const tab = async (page, t) => { await click(page, `.tab-btn[data-tab="${t}"]`); await page.waitForTimeout(400); };

  // ===== 1. 新用户：登录页 → 新建账号 → 「怎么开始」→ 空账本小入口、记一笔、选文件页、教程 =====
  {
    const page = await newPage({ ls: seedOf({ dev: true }) });
    await measure(page, 'login', { primary: ['#newAccountBtn'] });
    await click(page, '#newAccountBtn'); await askOpen(page);
    await measure(page, 'new-account-name', { scope: ASK, primary: ['#askOk'] });
    await page.fill('#askInput', '小明'); await askClose(page, true);
    await askOpen(page);
    await measure(page, 'how-to-start', { scope: ASK, primary: ['#askOk', '#askCancel'], note: '新账号「怎么开始」' });
    await askClose(page, false);
    await tab(page, 'ledger');
    await measure(page, 'ledger-empty', { primary: ['#impEmptyEntry', '.act-add'], note: '空账本小入口' });
    await click(page, '.act-add'); await page.waitForTimeout(400);
    await measure(page, 'add-record', { scope: '#addMask', primary: ['#addBill'] });
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; }));
    await page.evaluate(() => document.getElementById('impEmptyEntry') && document.getElementById('impEmptyEntry').click());
    await page.waitForSelector('#impPick', { timeout: 15000 });
    await measure(page, 'imp-pick', { scope: IMP, primary: ['#impPick'] });
    await click(page, '#impGuideWx'); await page.waitForTimeout(200);
    await measure(page, 'imp-guide-wechat', { scope: IMP, primary: ['#impGuideBack', '#impGuidePick'], more: true });
    await click(page, '#impGuideBack'); await click(page, '#impGuideAli'); await page.waitForTimeout(200);
    await measure(page, 'imp-guide-alipay', { scope: IMP, primary: ['#impGuideBack'] });
    await click(page, '#impGuideBack');
    // 压缩包密码框
    await page.setInputFiles('#impFile', path.join(FIX, 'zip', 'zipcrypto-wechat.zip'));
    await askOpen(page);
    await measure(page, 'imp-zip-password', { scope: ASK, primary: ['#askOk'] });
    await askClose(page, false);
    // 进度（量的时候直接把进度框显示出来）
    await page.evaluate(() => { document.getElementById('impProg').style.display = 'flex'; document.getElementById('impProgText').textContent = '和手记配对、推荐分类…'; document.getElementById('impProgBar').style.width = '40%'; });
    await measure(page, 'imp-progress', { scope: '#impProg', primary: ['#impProgCancel'] });
    await page.evaluate(() => { document.getElementById('impProg').style.display = 'none'; });
    await page.close();
  }

  // ===== 2. 老用户：几百条、分类很多：账单、统计、预算、设置；导入全流程 =====
  {
    const page = await newPage({ ls: seedOf({ dev: true, recs: richManual(), cats: BASE_CATS }) });
    await tab(page, 'ledger');
    await measure(page, 'ledger-list', { primary: ['.act-add'], more: true });
    await tab(page, 'stats');
    await measure(page, 'stats', { primary: [] , more: true});
    await click(page, '#statTabSeg button[data-v="budget"]'); await page.waitForTimeout(300);
    await measure(page, 'budget', { primary: ['#bgSuggestBtn'] });
    await click(page, '#bgSuggestBtn'); await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('bgSuggestCard').scrollIntoView());
    await measure(page, 'budget-suggest', { primary: ['#bgSuggestApply'], scrollTop: false });
    await click(page, '#statTabSeg button[data-v="flow"]');
    await tab(page, 'settings');
    await page.waitForTimeout(300);
    await measure(page, 'settings', { primary: [], more: true });
    await page.evaluate(() => document.getElementById('storageUse') && document.getElementById('storageUse').scrollIntoView({ block: 'center' }));
    await measure(page, 'settings-storage', { primary: [], scrollTop: false, note: '存储用量那一块' });
    // 导入
    await click(page, '#devImportBtn'); await page.waitForSelector('#impPick');
    await page.setInputFiles('#impFile', richBills());
    await waitImpConfirm(page);
    // 每一步量一遍（第 1 步核对 → 要你定的几步 → 总览）
    const steps = await page.evaluate(() => window.JiwenImportUI._state().view.steps.slice());
    for (const k of steps) {
      await goStep(page, k); await page.waitForTimeout(200);
      await measure(page, 'imp-step-' + k, { scope: IMP, primary: ['#impNext', '#impGo', '#impPrev', '#impCancel', '#impRecon'], more: true, note: '第 ' + (steps.indexOf(k) + 1) + ' 步 / 共 ' + steps.length + ' 步' });
    }
    // 下拉框的选择面板（1016-UI7 起不弹系统自带的；1017-UI1 起是主程序的共用底部面板）：一个非分类的、一个选分类的
    await goStep(page, 'cat');
    for (const [sel, nm] of [['#impTypes .imp-sel', 'imp-picker'], ['#impCpGroups .imp-cp-row, #impNewCats .imp-sel', 'imp-picker-cat']]) {
      if (!(await page.$(sel))) continue;
      await page.evaluate(sel => { const w = document.querySelector(sel); w.scrollIntoView({ block: 'center' }); w.click(); }, sel);
      await page.waitForTimeout(400);
      await measure(page, nm, { scope: '#uiSheetMask', primary: ['#uiSheetCancel'], scrollTop: false });
      await page.evaluate(() => document.getElementById('uiSheetCancel').click());
      await page.waitForTimeout(200);
    }
    // 1017-UI9：改过以后——按对方选一个分类、勾上新建分类，展开「已处理」；总览「这次所有的改动」
    await goStep(page, 'cat');
    if (await page.$('#impCpGroups .imp-cp-row')) {
      await page.evaluate(() => document.querySelector('#impCpGroups .imp-cp-row').click()); await page.waitForTimeout(300);
      await page.evaluate(() => { const c = document.querySelectorAll('#uiPickList .cc'); (c[1] || c[0]).click(); }); await page.waitForTimeout(300);
    }
    await page.evaluate(() => { const cb = document.querySelector('#impNewCats input[type=checkbox]'); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); } });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('#impBody .imp-fold').forEach(f => f.click()));
    await page.waitForTimeout(300);
    await measure(page, 'imp-step-cat-done', { scope: IMP, primary: ['#impNext', '#impPrev'], more: true, note: '改过以后，展开「已处理」' });
    await goStep(page, 'overview'); await page.waitForTimeout(200);
    await page.evaluate(() => { const c = document.getElementById('impChanges'); if (c) c.scrollIntoView({ block: 'start' }); });
    await measure(page, 'imp-overview-changes', { scope: IMP, primary: ['#impGo'], scrollTop: false, note: '这次所有的改动' });
    // 退出确认（顶上「‹ 取消」）
    await click(page, '#impBack'); await page.waitForTimeout(400);
    await measure(page, 'imp-exit-sheet', { scope: '#uiSheetMask', primary: ['#impExitStay', '#impExitOk'], scrollTop: false });
    await click(page, '#impExitStay'); await page.waitForTimeout(300);
    // 导入确认面板（点「再看看」回总览）
    await goStep(page, 'overview'); await click(page, '#impGo'); await page.waitForTimeout(400);
    await measure(page, 'imp-confirm-sheet', { scope: '#uiSheetMask', primary: ['#impConfirmOk', '#impConfirmBack'], scrollTop: false });
    await click(page, '#impConfirmBack'); await page.waitForTimeout(300);
    // 明细展开
    await page.evaluate(() => document.getElementById('impDetailsToggle').click());
    await page.evaluate(() => { const h = document.querySelector('.imp-gh[data-group="pending"]') || document.querySelector('.imp-gh'); if (h) h.click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const d = document.getElementById('impDetails'); document.getElementById('impPage').scrollTop = d.offsetTop - 60; });
    await measure(page, 'imp-confirm-details', { scope: IMP, primary: ['#impGo'], scrollTop: false });
    // 行详情（一笔待处理的）
    const hasPend = await page.evaluate(() => { const r = document.querySelector('.imp-list[data-group="pending"] .al-row') || document.querySelector('.imp-list .al-row'); if (r) { r.click(); return true; } return false; });
    if (hasPend) { await page.waitForTimeout(300); await measure(page, 'imp-row-sheet', { scope: '#uiSheetMask', primary: ['#impSheetOk', '#impSheetClose'], scrollTop: false }); await click(page, '#impSheetClose'); }
    // 当作退款，挂到某一笔（找一笔收入）
    const hasInc = await page.evaluate(() => { const rows = window.JiwenImportUI._state().plan.rows.filter(r => r.pio === 'income' && (r.group === 'add' || r.group === 'neutral') && !r.summary); return rows.length ? rows[0].key : null; });
    if (hasInc) {
      await page.evaluate(k => { const S = window.JiwenImportUI._state(); S.view.details = true; window.JiwenImportUI._replan(); const r = document.querySelector(`.al-row[data-key="${k}"]`); if (r) r.click(); }, hasInc);
      await page.waitForTimeout(300);
      if (await page.$('#impAsRefund')) { await click(page, '#impAsRefund'); await page.waitForTimeout(500); await measure(page, 'imp-refund-pick', { scope: '#impSheetMask', primary: ['#impRefundPickBack'], scrollTop: false }); }
      await page.evaluate(() => { document.getElementById('impSheetMask').style.display = 'none'; });
    }
    // 只对账
    await goStep(page, 'overview');
    await click(page, '#impRecon'); await page.waitForTimeout(300);
    await page.evaluate(() => { const c = document.querySelector('.imp-recon-row input'); if (c) c.click(); });
    await measure(page, 'imp-recon', { scope: IMP, primary: ['#impGo', '#impRecon'] });
    await click(page, '#impGo'); await page.waitForTimeout(400);
    await measure(page, 'imp-recon-sheet', { scope: '#uiSheetMask', primary: ['#impConfirmOk', '#impConfirmBack'], scrollTop: false });
    await click(page, '#impConfirmBack'); await page.waitForTimeout(200);
    await click(page, '#impRecon'); await page.waitForTimeout(300);
    // 导入
    await doImport(page);
    await measure(page, 'imp-result', { scope: IMP, primary: ['#impBackToLedger', '#impUndoThis'], more: true });
    // 待处理页
    if (await page.$('#impResPending')) {
      await click(page, '#impResPending'); await page.waitForSelector('#impPendHead', { timeout: 15000 });
      await measure(page, 'imp-pending', { scope: IMP, primary: ['#impPendDropAll', '#impBarClose'], more: true });
      await click(page, '#impPendDropAll'); await askOpen(page);
      await measure(page, 'imp-pending-dropall-confirm', { scope: ASK, primary: ['#askOk'] });
      await askClose(page, false);
    }
    // 导入记录 + 撤销确认框
    await page.evaluate(() => window.JiwenImportUI.openLogs());
    await page.waitForSelector('#impLogs', { timeout: 15000 });
    await measure(page, 'imp-logs', { scope: IMP, primary: ['.imp-log-undo'] });
    await click(page, '.imp-log-undo'); await askOpen(page);
    await measure(page, 'imp-undo-confirm', { scope: ASK, primary: ['#askOk'] });
    await askClose(page, false);
    // 管理导入规则
    await page.evaluate(() => window.JiwenImportUI.openRules());
    await page.waitForSelector('#impRulesCat', { timeout: 15000 });
    await measure(page, 'imp-rules', { scope: IMP, primary: ['#impRuleAddBtn'], more: true });
    await page.evaluate(() => window.JiwenImportUI.close());
    // 统计页待处理横幅
    await tab(page, 'stats'); await page.waitForTimeout(400);
    await measure(page, 'stats-pend-banner', { primary: ['#statPendGo'] });
    // 账单详情里的来源一行、拆开：统计页点 10 月 6 日（合并过的午饭那天）
    await page.evaluate(() => { const ds = [...document.querySelectorAll('#statCal .day.has')]; const d = ds.find(x => (x.querySelector('.dn') || {}).textContent === '6') || ds[0]; d && d.click(); });
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => { const rows = [...document.querySelectorAll('#statFlowList [data-act="sfItem"]')]; for (const r of rows) { r.click(); if (document.getElementById('detailSplit')) return true; document.getElementById('detailMask').style.display = 'none'; } return !!rows.length && (rows[0].click(), false); });
    await page.waitForTimeout(300);
    await measure(page, 'detail-source', { scope: '#detailMask', primary: ['#detailSplit'], note: opened ? '合并过的手记，有「拆开」' : '没找到合并过的手记（只看了一条记录）' });
    await page.evaluate(() => { document.getElementById('detailMask').style.display = 'none'; });
    // 底栏
    await measure(page, 'tabbar', { scope: '.tab-bar', primary: [] });
    await page.close();
  }

  // ===== 3. 月初导入提醒（11 月 5 日，上次导到 9 月底）=====
  {
    const page = await newPage({ ls: seedOf({ dev: true, recs: oldRecords(40), cats: BASE_CATS.slice(0, 10) }), now: '2026-11-05T10:00:00' });
    await tab(page, 'settings');
    await click(page, '#devImportBtn'); await page.waitForSelector('#impPick');
    await page.setInputFiles('#impFile', richBills(9));
    await waitImpConfirm(page);
    await doImport(page);
    await click(page, '#impBackToLedger'); await page.waitForTimeout(600);
    await measure(page, 'ledger-remind', { primary: ['#impRemindGo', '#impRemindOff'], note: '月初导入提醒' });
    await page.close();
  }

  // ===== 4. 「用记问打开」：开发开关开着直接进导入页、关着只提示 =====
  {
    const csv = richBills()[1].buffer.toString('base64');
    const page = await newPage({ ls: seedOf({ dev: false, recs: oldRecords(20) }), openFile: { name: '支付宝交易明细.csv', data: csv } });
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => document.getElementById('askMask').style.display === 'flex');
    if (open) await measure(page, 'open-with-devoff', { scope: ASK, primary: ['#askOk'], note: '「用记问打开」开关关着' });
    await page.close();
  }

  // ===== 5. 开发开关关着：导入相关的东西一点都不能露出来 =====
  {
    const page = await newPage({ ls: seedOf({ dev: false, recs: oldRecords(3) }) });
    const leaks = [];
    const KW = /导入（开发中）|导入账单|导入记录|管理导入规则|待确认|可以导了|存储已用|账本和备份占用|预算建议|单号表|怎么开始|一次导进来|微信、支付宝/;
    for (const t of ['ledger', 'stats', 'settings']) {
      await tab(page, t);
      if (t === 'stats') { await click(page, '#statTabSeg button[data-v="budget"]'); await page.waitForTimeout(200); }
      const hit = await page.evaluate(src => { const re = new RegExp(src); const out = []; document.querySelectorAll('body *').forEach(e => { if (e.children.length) return; const v = e.checkVisibility ? e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true; if (v && re.test(e.textContent)) out.push(e.textContent.trim().slice(0, 40)); }); return out; }, KW.source);
      hit.forEach(x => leaks.push(t + '：' + x));
      if (t === 'stats') await click(page, '#statTabSeg button[data-v="flow"]');
    }
    const req = page.reqs.filter(u => /\/import\//.test(u));
    results.push({ name: 'devoff-leaks', cfg: cfg.name, leaks, importRequests: req, errs: page.errs });
    await page.close();
  }
  // ===== 6. 键盘弹起（1019-B）：记一笔、修改、日子三个弹窗，下沿贴着键盘、没有缝，标题看得见 =====
  //   安卓上键盘弹起是 WebView 整个变矮（adjustResize），这里把视口高度减掉 320 来模拟。
  {
    const page = await newPage({ ls: seedOf({ dev: true, recs: oldRecords(40), cats: BASE_CATS.slice(0, 10) }) });
    await tab(page, 'ledger');
    const KB = 320;
    // 1019-O 起点备注 / 日子名弹的是文字输入小面板（#txtMask），量它贴不贴键盘；下面那层（记一笔 / 修改 / 日子）不能跟着动
    const kbCheck = async (name, maskId, focusSel, lowerId) => {
      await page.click(focusSel).catch(() => {}); await page.waitForTimeout(400);
      const lowTop0 = lowerId ? await page.evaluate(id => Math.round(document.getElementById(id).querySelector('.sheet').getBoundingClientRect().top), lowerId) : null;
      await page.setViewportSize({ width: cfg.w, height: cfg.h - KB }); await page.waitForTimeout(450);
      const r = await page.evaluate(id => { const m = document.getElementById(id), sh = m.querySelector('.sheet'), b = sh.getBoundingClientRect(), g = m.querySelector('.sheet-grip').getBoundingClientRect();
        return { kbOpen: document.body.classList.contains('kb-open'), gap: Math.round((window.visualViewport ? visualViewport.height : innerHeight) - b.bottom), top: Math.round(b.top), gripTop: Math.round(g.top), H: innerHeight }; }, maskId);
      if (lowerId) r.lowerMoved = (await page.evaluate(id => Math.round(document.getElementById(id).querySelector('.sheet').getBoundingClientRect().top), lowerId)) - lowTop0;
      results.push(Object.assign({ name: 'kb-' + name, cfg: cfg.name, kb: true }, r));
      if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `${cfg.name}-kb-${name}.png`) });
      await page.setViewportSize({ width: cfg.w, height: cfg.h }); await page.waitForTimeout(450);
      await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; }));
      await page.waitForTimeout(300);
    };
    await click(page, '.act-add'); await page.waitForTimeout(400);
    await kbCheck('add-record', 'txtMask', '#billRemark', 'addMask');
    await page.evaluate(() => { const r = document.querySelector('#billList [data-act="edit"]'); if (r) window.openEdit(r.dataset.id); });
    await page.waitForTimeout(400);
    const editOpen = await page.evaluate(() => { if (document.getElementById('editMask').style.display !== 'flex') { const b = document.getElementById('detailEdit'); if (b && document.getElementById('detailMask').style.display === 'flex') b.click(); } return document.getElementById('editMask').style.display === 'flex'; });
    if (editOpen) await kbCheck('edit-record', 'txtMask', '#editRemark', 'editMask');
    await page.evaluate(() => { const b = document.getElementById('daysAdd') || document.querySelector('.days-add'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const dayOpen = await page.evaluate(() => document.getElementById('dayMask').style.display === 'flex');
    if (dayOpen) await kbCheck('day', 'txtMask', '#dayName', 'dayMask');
    await page.close();
  }
  // ===== 7. 分类管理按 1.3 倍字号（1019-C）：分类名完整、不贴边，预算那段先省略 =====
  if (cfg.name === 'main' || cfg.name === 'narrow') {
    const keep = cfg.scale; cfg.scale = 1.3;
    const cats = ['未分类', '购物', '红包', '水电燃气费', '人情往来', '咖啡奶茶', '地铁公交', '房租物业'];
    const page = await newPage({ ls: seedOf({ dev: true, recs: oldRecords(20), cats, budgets: { '购物': 1350, '红包': 2840, '水电燃气费': 12000, '人情往来': 800 } }) });
    cfg.scale = keep;
    await tab(page, 'settings');
    await click(page, '#manageCatSetting'); await page.waitForTimeout(400);
    const r = await page.evaluate(() => [...document.querySelectorAll('#catList .cat-item')].map(row => {
      const n = row.querySelector('.cat-name'), m = row.querySelector('.cat-more'), b = row.querySelector('.cat-budget');
      const last = (b || n).getBoundingClientRect();
      return { cat: row.dataset.cat, cut: n.scrollWidth > n.clientWidth + 1, gap: Math.round(m.getBoundingClientRect().left - Math.min(last.right, row.querySelector('.cat-left').getBoundingClientRect().right)), h: Math.round(row.getBoundingClientRect().height) };
    }));
    results.push({ name: 'cat-manager-x1.3', cfg: cfg.name, cat: true, rows: r });
    if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `${cfg.name}-cat-manager-x1.3.png`) });
    await page.close();
  }
  return results;
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const all = {};
  for (const cfg of CONFIGS) {
    if (ONLY && cfg.name !== ONLY) continue;
    const t0 = Date.now();
    try { all[cfg.name] = await run(cfg, port, browser); }
    catch (e) { console.log('配置 ' + cfg.name + ' 中途出错：' + (e && e.stack || e)); all[cfg.name] = all[cfg.name] || []; }
    fs.writeFileSync(path.join(OUT, `audit-${cfg.name}.json`), JSON.stringify(all[cfg.name], null, 1));
    console.log(`${cfg.name}：${all[cfg.name].length} 页，${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  }
  // 汇总
  const md = ['# 界面量尺寸汇总', '', `最小点击区域 ${MIN}px、相邻间距 ${GAP}px`, ''];
  Object.keys(all).forEach(c => {
    md.push(`## ${c}`, '', '| 页面 | 可点的 | 小于 48 | 间距小于 8 | 主按钮（离底 px） | 主按钮在上半屏 | 内容到 / 屏高 | 下面空着 |', '|---|---|---|---|---|---|---|---|');
    all[c].forEach(m => {
      if (m.name === 'devoff-leaks') return;
      if (m.cat) { const bad = m.rows.filter(x => x.cut || x.gap < 8 || x.h < 48); md.push(`| ${m.name} | ${m.rows.length} 行 | 分类名被截 ${m.rows.filter(x => x.cut).length} 行 | 离 › 不到 8px ${m.rows.filter(x => x.gap < 8).length} 行 | 行高 ${Math.min(...m.rows.map(x => x.h))}px 起 | ${bad.length ? '有问题' : ''} | | |`); return; }
      if (m.kb) { md.push(`| ${m.name} | 键盘弹起：${m.kbOpen ? '认出来了' : '没认出来'} | 小面板下沿离键盘 ${m.gap}px | 标题离顶 ${m.gripTop}px | 下面那层动了 ${m.lowerMoved == null ? '-' : m.lowerMoved}px | ${m.gap > 1 || m.gripTop < 0 || m.lowerMoved ? '有问题' : ''} | ${m.H} | |`); return; }
      const pr = m.prim.slice(0, 3).map(p => `${p.name.split(' ')[0]} ${p.offscreen ? '要往下滑' : p.fromBottom}`).join('；') || '—';
      md.push(`| ${m.name} | ${m.n} | ${m.small.length} | ${m.tight.length} | ${pr} | ${m.prim.some(p => p.upper) ? '是' : ''} | ${m.contentBottom} / ${m.H} | ${m.blank} |`);
    });
    const lk = all[c].find(m => m.name === 'devoff-leaks');
    if (lk) md.push('', `开关关着：露出来的 ${lk.leaks.length} 处${lk.leaks.length ? '（' + lk.leaks.join('；') + '）' : ''}；请求 import/ 下的文件 ${lk.importRequests.length} 个；页面报错 ${lk.errs.length} 个`);
    md.push('');
  });
  fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'));
  console.log(md.join('\n'));
  await browser.close(); srv.close();
})();
