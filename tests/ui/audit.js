// 界面检查（1016-UI1 起）：用真的 Chromium（Playwright）按手机尺寸打开 www/index.html，过一遍各个页面，每页自动量：
//   1. 能点的东西（按钮、链接、可点的行、图标、勾选框所在的那一行、下拉框）的点击区域宽高，列出小于 48px 的，和相邻间距小于 8px 的；
//   2. 主按钮在屏幕上的位置（离底部多远），主按钮在屏幕上半部分的标出来；
//   3. 页面内容占了屏幕多高、下面空了多少。
// 不是自动测试（不进 run-all，打包机上没有浏览器），改界面前后手动跑一遍对比：
//   NODE_PATH=$(npm root -g) node tests/ui/audit.js 输出目录 [--only 配置名] [--part 段号,段号] [--shots]
//   1020-J：第 11 段是这一轮新加的几项检查 + 截图总表（--only main --part 11 --shots，总表写到 tests/ui/out/<版本号>/sheet.png）
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
// --part 3,8：只跑这几段（不给就全跑）
const PARTS = (process.argv.indexOf('--part') > 0) ? process.argv[process.argv.indexOf('--part') + 1].split(',').map(Number) : null;
const want = n => !PARTS || PARTS.includes(n);
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
    ls['store_' + ID] = JSON.stringify({ archives: { '默认存档': Object.assign({ cats: o.cats || BASE_CATS.slice(0, 8), records: o.recs }, o.budgets ? { budgets: o.budgets } : {}, o.tpls ? { tpls: o.tpls } : {}) }, last: '默认存档', accountName: '小明' });
    if (o.extra) Object.assign(ls, o.extra(ID));
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
  // 分段按钮（.seg、底栏、1020-D 起记一笔的收支 .io-mini）几个挨着是一组，组内不算间距；1020-G 起列表卡（.rec-list、统计面板 .mode-pick）里的行挨着也不算（和设置页的列表一样，中间一道细线）
  const groupOf = e => e.closest('.seg, .tab-bar, .ui-seg, .io-mini, .rec-list, .mode-pick');
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
  if (want(1)) {
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
  if (want(2)) {
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
  if (want(3)) {
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
  if (want(4)) {
    const csv = richBills()[1].buffer.toString('base64');
    const page = await newPage({ ls: seedOf({ dev: false, recs: oldRecords(20) }), openFile: { name: '支付宝交易明细.csv', data: csv } });
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => document.getElementById('askMask').style.display === 'flex');
    if (open) await measure(page, 'open-with-devoff', { scope: ASK, primary: ['#askOk'], note: '「用记问打开」开关关着' });
    await page.close();
  }

  // ===== 5. 开发开关关着：导入相关的东西一点都不能露出来 =====
  if (want(5)) {
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
  if (want(6)) {
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
    await page.evaluate(() => window.kpClose && window.kpClose()); await page.waitForTimeout(100);   // 1020-G：数字键盘盖着下半屏，先收起来再点备注那一行
    await kbCheck('add-record', 'txtMask', '#billRemarkRow', 'addMask');   // 1020-G：备注是列表卡里一行
    await page.evaluate(() => { const r = document.querySelector('#billList [data-act="edit"]'); if (r) window.openEdit(r.dataset.id); });
    await page.waitForTimeout(400);
    const editOpen = await page.evaluate(() => { if (document.getElementById('editMask').style.display !== 'flex') { const b = document.getElementById('detailEdit'); if (b && document.getElementById('detailMask').style.display === 'flex') b.click(); } return document.getElementById('editMask').style.display === 'flex'; });
    if (editOpen) await kbCheck('edit-record', 'txtMask', '#editRemarkRow', 'editMask');
    await page.evaluate(() => { const b = document.getElementById('daysAdd') || document.querySelector('.days-add'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const dayOpen = await page.evaluate(() => document.getElementById('dayMask').style.display === 'flex');
    if (dayOpen) await kbCheck('day', 'txtMask', '#dayName', 'dayMask');
    await page.close();
  }
  // ===== 7. 分类管理按 1.3 倍字号（1019-C）：分类名完整、不贴边，预算那段先省略 =====
  if (want(7) && (cfg.name === 'main' || cfg.name === 'narrow')) {
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
  // ===== 8. 面板里能滚的地方（1020-C）：手指在能上下滚的框里，先滚框；框已经在最顶上还往下拉，才算拉面板 =====
  //   用 CDP 发真的触摸事件（和手指一样走浏览器自己的滚动），每处：往上滑到底 → 往下滑回顶（面板不能被关掉）→ 在顶上往下拉（面板关掉）。
  if (want(8)) {
    const tpls = Array.from({ length: 24 }, (_, i) => ({ id: 't' + i, name: '虚构模板' + i, type: 'expense', cat: BASE_CATS[1 + i % 6], remark: '', money: 10 + i, mode: 'normal' }));
    const days = Array.from({ length: 24 }, (_, i) => ({ id: 'd' + i, name: '虚构日子' + i, date: `2026-${pad(1 + i % 12)}-${pad(1 + i)}` }));
    const perf = Array.from({ length: 50 }, (_, i) => ({ at: '10-20 09:' + pad(i % 60) + ':00', ts: Date.parse('2026-10-20T09:00:00') + i * 60000, kind: '打开面板', ms: 100 + i, what: '虚构' + i }));
    const page = await newPage({ ls: seedOf({ dev: true, recs: oldRecords(60), cats: BASE_CATS, tpls,
      extra: id => ({ ['days_' + id]: JSON.stringify(days), app_perf_log: JSON.stringify(perf) }) }) });
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x, y0, y1, steps = 10) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / steps }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(350);
    };
    // 找面板里要滑的那个框：给了选择器就用它，不然找面板里能滚、最大的那个（面板自己也算）
    const info = (maskId, sel) => page.evaluate(([maskId, sel]) => {
      const m = maskId ? document.getElementById(maskId) : [...document.querySelectorAll('.mask')].filter(x => x.style.display === 'flex').pop();
      const open = !!m && m.style.display === 'flex';
      if (!open) return { open };
      const sh = m.querySelector('.sheet') || m.firstElementChild;
      const can = n => n.scrollHeight > n.clientHeight + 1 && (n === sh || n.tagName === 'TEXTAREA' || /auto|scroll/.test(getComputedStyle(n).overflowY));
      let el = sel ? m.querySelector(sel) : null;
      if (!el) el = [sh, ...sh.querySelectorAll('*')].filter(can).sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!el) return { open, none: true };
      document.querySelectorAll('[data-swipe-el]').forEach(x => x.removeAttribute('data-swipe-el')); el.setAttribute('data-swipe-el', '1');
      const r = el.getBoundingClientRect(), vb = Math.min(r.bottom, innerHeight), vt = Math.max(r.top, 0);
      return { open, x: Math.round(r.left + r.width / 2), top: vt, bottom: vb, st: el.scrollTop, max: el.scrollHeight - el.clientHeight, what: el.id || el.className || el.tagName };
    }, [maskId, sel || null]);
    const shown = id => page.evaluate(id => { const m = id ? document.getElementById(id) : [...document.querySelectorAll('.mask')].filter(x => x.style.display === 'flex').pop(); return !!m && m.style.display === 'flex'; }, id);
    const check = async (name, maskId, sel, opener) => {
      await opener(); await page.waitForTimeout(500);
      let i0 = await info(maskId, sel);
      const r = { name: 'swipe-' + name, cfg: cfg.name, swipe: true, what: i0.what, max: i0.max };
      if (!i0.open) { r.err = '面板没打开'; results.push(r); return; }
      if (i0.none) { r.err = '装得下，不用滚'; results.push(r); await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; })); await page.waitForTimeout(400); return; }
      const lo = i0.top + (i0.bottom - i0.top) * 0.8, hi = i0.top + (i0.bottom - i0.top) * 0.2;
      // 很长的框（AI 导出几千 px）一下一下滑太久：先真滑几下（要真的往下走），再直接放到离底一屏，最后几下再真滑到底；回去同样
      const jump = v => page.evaluate(v => { const el = document.querySelector('[data-swipe-el]'); el.scrollTop = v; }, v);
      const page1 = Math.max(80, i0.bottom - i0.top);
      for (let k = 0; k < 25; k++) { const s = await info(maskId, sel); if (!s.open || s.st >= s.max - 1) break; if (k === 4 && s.st > 0 && s.max - s.st > page1 * 2) await jump(s.max - page1); await swipe(i0.x, lo, hi); }
      let s = await info(maskId, sel); r.bottom = s.open && s.st >= s.max - 1; r.openAfterUp = s.open;
      if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `${cfg.name}-swipe-${name}.png`) });
      for (let k = 0; k < 25; k++) { s = await info(maskId, sel); if (!s.open || s.st <= 0) break; if (k === 4 && s.st < s.max && s.st > page1 * 2) await jump(page1); await swipe(i0.x, hi, lo); }
      s = await info(maskId, sel); r.top = s.open && s.st <= 0; r.openAfterDown = s.open;
      if (s.open) { await swipe(i0.x, i0.top + 20, Math.min(i0.top + 20 + 420, cfg.h - 10), 12); await page.waitForTimeout(400); }
      r.closed = !(await shown(maskId));
      r.ok = r.bottom && r.top && r.openAfterUp && r.openAfterDown && r.closed;
      results.push(r);
      await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; })); await page.waitForTimeout(400);
    };
    await tab(page, 'settings');
    await check('ai-export', 'aiExpMask', '#aiExpText', () => page.evaluate(() => window.JiwenAiExport.openAiExport(Array.from({ length: 300 }, (_, i) => `2026-10-${(i % 28) + 1} 虚构记录 ${i} 支出 ${i + 1}.00 元`).join('\n'), '虚构')));
    await check('cat-manager', null, null, () => click(page, '#manageCatSetting'));
    await check('templates', null, null, () => click(page, '#manageTplSetting'));
    await check('perf-log', null, null, () => page.evaluate(() => window.openPerfPage()));
    await check('sheet-long-list', null, null, () => page.evaluate(() => window.JiwenSheet.pick({ title: '虚构长列表', options: Array.from({ length: 60 }, (_, i) => ({ value: 'v' + i, label: '虚构选项 ' + i })), onPick() {} })));
    await check('sheet-cat-pick', null, null, () => page.evaluate(() => window.JiwenSheet.pick({ title: '选分类', chips: true, options: Array.from({ length: 120 }, (_, i) => ({ value: 'c' + i, label: '虚构分类' + i })), onPick() {} })));
    await check('sheet-body-text', null, null, () => page.evaluate(() => window.JiwenSheet.open({ title: '导入页那种面板', body: el => { const ta = document.createElement('textarea'); ta.readOnly = true; ta.style.cssText = 'width:100%;height:300px'; ta.value = Array.from({ length: 200 }, (_, i) => '虚构第 ' + i + ' 行').join('\n'); el.appendChild(ta); } })));
    // 日子管理是一页（不是面板）：整页上下滑，滑到底再滑回顶
    {
      await tab(page, 'ledger');
      await page.evaluate(() => { const b = document.getElementById('daysManageBtn'); if (b) b.click(); }); await page.waitForTimeout(500);
      const y = () => page.evaluate(() => ({ y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, on: document.getElementById('pageDays').style.display === 'block' }));
      let a = await y(); const r = { name: 'swipe-days-page', cfg: cfg.name, swipe: true, what: 'pageDays', max: a.max };
      for (let k = 0; k < 25 && a.y < a.max - 1; k++) { await swipe(cfg.w / 2, cfg.h * 0.7, cfg.h * 0.25); a = await y(); }
      r.bottom = a.y >= a.max - 1; r.openAfterUp = a.on;
      for (let k = 0; k < 25 && a.y > 0; k++) { await swipe(cfg.w / 2, cfg.h * 0.25, cfg.h * 0.7); a = await y(); }
      r.top = a.y <= 0; r.openAfterDown = a.on; r.closed = true; r.ok = r.bottom && r.top && a.on;
      if (r.max <= 0) { r.err = '装得下，不用滚'; r.ok = null; }
      results.push(r);
    }
    await page.close();
  }
  // ===== 9. 字上下居中（1020-D）：按钮、分段按钮、分类块、底栏里的字，字的上下中心和框的上下中心差多少，超过 1px 的列出来 =====
  //   字的中心按「字形」算（canvas measureText 的 actualBoundingBox），不按行高：中文字体的上下留白不一样，行高居中了字形不一定居中。
  //   框带图标的（底栏）按「图标 + 字」一起算。机器上要有和手机一样的中文字体（思源黑体 / Noto Sans SC，fontconfig 排第一）才准。
  if (want(9)) {
    const page = await newPage({ ls: seedOf({ dev: true, recs: oldRecords(40), cats: BASE_CATS.slice(0, 10), extra: id => ({ ['days_' + id]: JSON.stringify([{ id: 'd1', name: '虚构纪念日', date: '2026-11-01' }, { id: 'd2', name: '虚构生日', date: '2027-03-08' }]) }) }) });
    const centerIn = scopeSel => page.evaluate(scopeSel => {
      const SEL = 'button, .seg > *, .cc, .chip, .tab-btn, .ui-btn, .io-chips > *, .mode-chips > *, .cat-chip, [role="button"], .days-manage, .days-back, .cs-row, .set-item, .rec-row';   // 1020-H：加上列表行（分类汇总、设置、列表卡）
      const cv = document.createElement('canvas').getContext('2d');
      const vis = el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
      const out = [];
      const scope = scopeSel ? [...document.querySelectorAll(scopeSel)] : [document.body];
      const seen = new Set();
      scope.forEach(sc => sc.querySelectorAll(SEL).forEach(el => {
        if (seen.has(el) || !vis(el)) return; seen.add(el);
        if (el.closest('.sheet-ghost')) return;
        // 字：所有看得见的文字节点（一行的才量；两行以上的大卡片按钮不量）
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() && vis(n.parentElement) ? 1 : 2 });
        let top = Infinity, bot = -Infinity, lines = new Set(), txt = '', n;
        while ((n = tw.nextNode())) {
          const r = document.createRange(); r.selectNodeContents(n);
          const rs = [...r.getClientRects()].filter(x => x.width > 0); if (!rs.length) continue;
          rs.forEach(x => lines.add(Math.round(x.top)));
          const cs = getComputedStyle(n.parentElement); cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const t = n.nodeValue.trim(), m = cv.measureText(t);
          const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent, rect = rs[0];
          const base = rect.top + (rect.height - (fa + fd)) / 2 + fa;   // 文字盒子里的基线
          top = Math.min(top, base - m.actualBoundingBoxAscent); bot = Math.max(bot, base + m.actualBoundingBoxDescent); txt += t;
        }
        if (!txt || lines.size > 1) return;
        el.querySelectorAll('svg').forEach(sv => { if (!vis(sv)) return; const r = sv.getBoundingClientRect(); top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); });
        const b = el.getBoundingClientRect(), bs = getComputedStyle(el);
        // 框的上下中心：去掉上下边框（看着的框是边框以内）
        const bt = b.top + parseFloat(bs.borderTopWidth), bb = b.bottom - parseFloat(bs.borderBottomWidth);
        const d = Math.round(((top + bot) / 2 - (bt + bb) / 2) * 10) / 10;
        // 1020-H：再按截图上的像素量一次（字真画出来的上下边），这里先记下字的左右范围和框的上下
        let tl = Infinity, tr = -Infinity;
        { const tw2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() && vis(n.parentElement) ? 1 : 2 }); let m2;
          while ((m2 = tw2.nextNode())) { const r = document.createRange(); r.selectNodeContents(m2); [...r.getClientRects()].forEach(x => { if (x.width > 0) { tl = Math.min(tl, x.left); tr = Math.max(tr, x.right); } }); } }
        // 被别的东西盖住的（比如滚到贴底的按钮排下面）按像素量不准，不量像素（照旧按 canvas 算）
        const ex = (b.left + b.right) / 2, inEl = y => { const h = document.elementFromPoint(ex, y); return h && (el === h || el.contains(h)); };
        const covered = !inEl((bt + bb) / 2) || !inEl(bt + 2) || !inEl(bb - 2);   // 中间、上沿、下沿都得是它自己
        out.push({ text: txt.slice(0, 12), d, h: Math.round(b.height), covered, cls: (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()),
          box: { t: bt, b: bb, l: tl, r: tr } });
      }));
      return out;
    }, scopeSel || null);
    // 1020-H：按像素量：截一张图交回页面里解开（浏览器自己解 PNG），每个框只看字左右那一段：每一列拿框顶上（上内边距里）和框底下的颜色当底色，
    //   和底色差得多的算字，找出最上、最下一行，字的上下中心和框（边框以内）的上下中心比。canvas 的量法（d）留着对照，表里按像素的（px）算。
    const inkIn = async rows => {
      const shot = (await page.screenshot()).toString('base64');
      return page.evaluate(async ({ shot, rows }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + shot; await img.decode();
        const k = img.naturalWidth / innerWidth, c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0); const D = g.getImageData(0, 0, c.width, c.height).data, W = c.width;
        const px = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
        const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        return rows.map(r => {
          const B = r.box; if (!B || !(B.r > B.l) || r.covered) return null;
          const y0 = Math.ceil((B.t + 2) * k), y1 = Math.floor((B.b - 2) * k), x0 = Math.ceil(B.l * k), x1 = Math.floor(B.r * k);
          if (y1 - y0 < 6 || y0 < 0 || y1 >= c.height) return null;
          let top = -1, bot = -1;
          for (let y = y0 + 1; y < y1 - 1; y++) {
            for (let x = x0; x < x1; x++) { const p = px(x, y), m = Math.min(diff(p, px(x, y0)), diff(p, px(x, y1))); if (m > 90) { if (top < 0) top = y; bot = y; break; } }
          }
          if (top < 0) return null;
          return Math.round((((top + bot + 1) / 2) / k - (B.t + B.b) / 2) * 10) / 10;
        });
      }, { shot, rows });
    };
    const C = async (name, scopeSel) => { const rows = await centerIn(scopeSel); const ink = await inkIn(rows); rows.forEach((r, i) => { r.dc = r.d; r.px = ink[i]; if (ink[i] !== null && ink[i] !== undefined) r.d = ink[i]; delete r.box; });
      results.push({ name: 'center-' + name, cfg: cfg.name, center: true, rows }); if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `${cfg.name}-center-${name}.png`) }); };
    await tab(page, 'ledger');
    await C('ledger', '#pageLedger, #tabBar, #actionBar');
    await click(page, '.act-add'); await page.waitForTimeout(500); await page.evaluate(() => window.kpClose && window.kpClose()); await page.waitForTimeout(400);
    await C('add-record', '#addMask');
    // 1020-H：分类抽屉、统计面板
    await page.click('#billCatMore'); await page.waitForTimeout(500);
    await C('cat-drawer', '#uiSheetMask');
    await page.evaluate(() => window.JiwenSheet.back()); await page.waitForTimeout(400);
    await page.click('#billMode'); await page.waitForTimeout(500);
    await C('mode-sheet', '#uiSheetMask');
    await page.evaluate(() => window.JiwenSheet.back()); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; })); await page.waitForTimeout(400);
    await page.evaluate(() => { const r = document.querySelector('#billList [data-act="edit"]'); if (r) window.openEdit(r.dataset.id); }); await page.waitForTimeout(600);
    await page.evaluate(() => window.kpClose && window.kpClose()); await page.waitForTimeout(300);
    await C('edit-record', '#editMask');
    await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; })); await page.waitForTimeout(400);
    await tab(page, 'stats');
    await C('stats', '#pageStats');
    await tab(page, 'settings');
    await C('settings', '#pageSettings');
    await tab(page, 'ledger');
    await page.evaluate(() => { const b = document.getElementById('daysManageBtn'); if (b) b.click(); }); await page.waitForTimeout(500);
    await C('days', '#pageDays');
    await page.evaluate(() => window.customConfirm('虚构的确认框', () => {}, '确认一下')); await page.waitForTimeout(500);
    await C('ask', '#askMask');
    await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; })); await page.waitForTimeout(400);
    await page.evaluate(() => window.JiwenSheet.pick({ title: '选分类', chips: true, options: ['未分类', '吃饭', '购物', '出行', '水电燃气'].map(v => ({ value: v, label: v })), value: '吃饭', onPick() {} })); await page.waitForTimeout(500);
    await C('sheet-cat-pick', '.mask.sheet-mask');
    await page.evaluate(() => window.JiwenSheet.close && window.JiwenSheet.close()); await page.evaluate(() => document.querySelectorAll('.mask').forEach(m => { m.style.display = 'none'; })); await page.waitForTimeout(400);
    await tab(page, 'ledger');
    await page.evaluate(() => document.getElementById('filterFab').click()); await page.waitForTimeout(600);
    await C('filter', '#filterSheetMask');
    await page.close();
  }
  // ===== 10. 选色面板（1020-E）：外观设置 → 自定义主色，App 自己的底部面板（色块、色相 / 深浅 / 鲜艳条、色值），量点击区域、主按钮位置 =====
  if (want(10)) {
    const page = await newPage({ ls: seedOf({ dev: true, recs: oldRecords(20), cats: BASE_CATS.slice(0, 8) }) });
    await tab(page, 'settings');
    await click(page, '#themeBtn'); await page.waitForTimeout(400);
    await measure(page, 'theme', { scope: '#themeMask', primary: [] , scrollTop: false });
    await click(page, '#customColorBtn'); await page.waitForTimeout(500);
    await measure(page, 'color-picker', { scope: '#uiSheetMask', primary: ['#cpApply'], scrollTop: false });
    await page.close();
  }
  // ===== 11. 1020-J 这一轮新加的检查（只在 main 那一轮跑，屏幕大小在里面自己换）=====
  //   a 数字键盘：每个用数字键盘的地方打开一次，在 412×970、360×780、412×915、360×640 下量键盘顶边有没有压在按钮中间、
  //     正在输的框是不是完整露在键盘上面、按键多高；
  //   b 贴底按钮排下面不许露出任何滚动内容（内容超过一屏、滚到中间 / 最底）；
  //   c 字有没有被切（字的上下沿要在会裁东西的框里）；
  //   d 叠起来的两层面板，顶边差 1～63px 算错；
  //   e 页面上不许有点了会弹系统数字输入法的框；
  //   f 换主题以后根底色和页面底色一样（日子页下半截不露别的颜色）；
  //   截图：改到的页面在 412×915、412×970、360×780 下各一张（平时 / 键盘弹出来 / 叠层打开），拼成一页 sheet.png（--shots 时）。
  if (want(11) && cfg.name === 'main') {
    const SIZES = [[412, 970], [360, 780], [412, 915], [360, 640]];
    const SHEET_SIZES = ['412x915', '412x970', '360x780'];
    const sheetShots = [];   // [{ file, page, size, state }]
    const DAYS = [{ name: '虚构的纪念日', date: '2026-12-01', pin: true }, { name: '虚构的生日', date: '2026-11-11' }, { name: '虚构的考试', date: '2026-10-01' }];
    const TPLS = [{ id: 't1', type: 'expense', cat: '吃饭', remark: '早餐', money: 8, mode: 'normal' }, { id: 't2', type: 'expense', cat: '出行', remark: '地铁', money: 4, mode: 'normal' },
      { id: 't3', type: 'expense', cat: '吃饭', remark: '午饭', money: null, mode: 'normal' }, { id: 't4', type: 'expense', cat: '其他', remark: '信用卡还款', money: null, mode: 'skip' }];
    const ls11 = seedOf({ dev: true, recs: oldRecords(60), cats: BASE_CATS.slice(0, 16), tpls: TPLS, extra: id => ({ ['days_' + id]: JSON.stringify(DAYS) }) });
    async function page11(w, h, extraLs) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
      const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
      await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
      await page.addInitScript(l => { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.clear(); Object.entries(l).forEach(([k, v]) => localStorage.setItem(k, v)); } }, Object.assign({}, ls11, extraLs || {}));
      await page.goto(`http://localhost:${port}/index.html`); await page.waitForTimeout(700);
      return page;
    }
    const closeAll = page => page.evaluate(() => { window.kpClose && window.kpClose(); window.JiwenSheet && window.JiwenSheet.close(); document.querySelectorAll('.mask').forEach(m => { if (m.style.display === 'flex') m.style.display = 'none'; }); }).then(() => page.waitForTimeout(400));
    const shot = async (page, size, pg, state) => {
      if (!SHOTS) return;
      const file = `j-${size}-${String(sheetShots.length + 1).padStart(3, '0')}-${pg}-${state}.png`;   // 带编号：不会互相盖掉
      await page.screenshot({ path: path.join(shotsDir, file) });
      sheetShots.push({ file, page: pg, size, state, inSheet: SHEET_SIZES.includes(size) });
    };
    // a. 数字键盘
    const KP_PLACES = [
      ['记一笔', 'billMoney', async p => { await tab(p, 'ledger'); await click(p, '.act-add'); await p.waitForTimeout(800); }],
      ['修改账单', 'editMoney', async p => { await p.evaluate(() => window.openEdit('r3')); await p.waitForTimeout(600); await p.click('#editMoney'); }],
      ['筛选金额', 'searchMin', async p => { await tab(p, 'ledger'); await click(p, '#filterFab'); await p.waitForTimeout(500); await p.click('#searchMin'); }],
      ['模板固定金额', 'tplEditMoney', async p => { await tab(p, 'settings'); await click(p, '#manageTplSetting'); await p.waitForTimeout(400); await click(p, '#tplNew'); await p.waitForTimeout(500); await p.click('#tplEditMoney'); }],
      ['退款金额', 'refundMoney', async p => { await p.evaluate(() => window.openEdit(window.JiwenStore.getUserData().find(r => r.type === 'expense' && !r.refundOf).id)); await p.waitForTimeout(600); await p.evaluate(() => window.kpClose()); await p.click('#editRefundBtn'); await p.waitForTimeout(500);
        if (await p.evaluate(() => document.getElementById('askMask').style.display === 'flex')) { await p.evaluate(() => document.getElementById('askOk').click()); await p.waitForTimeout(500); }   // 问「修改还没保存，去退款吗」
        await p.click('#refundKind .cc[data-v="part"]'); }],
      ['设预算', 'askInput', async p => { await p.evaluate(() => window.customPrompt('给「吃饭」设每月预算（虚构）', '', () => {}, '设预算', null, { inputmode: 'decimal', kpOk: '保存' })); }],
      ['日子管理条数', 'dmCount', async p => { await tab(p, 'ledger'); await p.evaluate(() => document.getElementById('daysManageBtn').click()); await p.waitForTimeout(500); await click(p, '#daysManage'); await p.waitForTimeout(500); await p.click('#dmCount'); }],
    ];
    for (const [w, h] of SIZES) {
      const size = w + 'x' + h;
      const page = await page11(w, h);
      for (const [name, field, go] of KP_PLACES) {
        try {
          await go(page); await page.waitForTimeout(800);
          const r = await page.evaluate(f => {
            const k = document.getElementById('kpSheet').getBoundingClientRect(), el = document.getElementById(f);
            if (document.getElementById('kpMask').style.display !== 'flex' || !el) return { err: '数字键盘没打开' };
            const host = el.closest('.sheet'), hr = host.getBoundingClientRect();
            const cut = [...host.querySelectorAll('button, input, .cc, .rec-row, .ui-btn, .dt-input, [role="button"]')].filter(e => e.offsetParent && !e.closest('.rec-time-raw'))
              .map(e => { const b = e.getBoundingClientRect(); return { n: e.id || e.textContent.trim().slice(0, 8) || e.className.split(' ')[0], t: b.top, b: b.bottom }; })
              .filter(x => x.t < k.top - 1 && x.b > k.top + 1).map(x => x.n);
            const fr = el.getBoundingClientRect(), row = el.closest('.rec-row, .rec-money-row') || el, rr = row.getBoundingClientRect();
            const keyH = Math.round(document.querySelector('#kpGrid .kp-key').getBoundingClientRect().height * 10) / 10;
            return { kTop: Math.round(k.top), keyH, cut: [...new Set(cut)], fieldShown: fr.top >= Math.max(0, hr.top) - 0.5 && rr.bottom <= k.top + 0.5, fit: window.JiwenKeypad.kpFitInfo };
          }, field);
          results.push({ name: `kp-${name}`, cfg: size, kp: true, ...r, ok: !r.err && !r.cut.length && r.fieldShown && r.keyH >= 52 - 0.5 && r.keyH <= 76 + 0.5 });
          await shot(page, size, name, '数字键盘');
        } catch (e) { results.push({ name: `kp-${name}`, cfg: size, kp: true, err: String(e.message || e).slice(0, 160), ok: false }); if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `j-${size}-${name}-出错.png`) }).catch(() => {}); }
        await closeAll(page);
      }
      await page.close();
    }
    // b. 贴底按钮排；c. 字被切；d. 叠层顶边；e. 系统数字输入法；f. 主题底色 —— 412×970、360×780（截图另加 412×915）
    const FOOT = async (page, label) => results.push(Object.assign({ name: 'foot-' + label, cfg: page.__size, foot: true }, await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.mask').forEach(m => {
        if (m.id === 'kpMask' || getComputedStyle(m).display === 'none') return;
        const sh = m.querySelector(':scope > .sheet'); if (!sh) return;
        const ft = sh.querySelector(':scope > .rec-foot, :scope > .ui-sheet-foot, :scope > .ask-btns, :scope > .form-btns'); if (!ft || getComputedStyle(ft).position !== 'sticky') return;
        const mb = Math.min(m.getBoundingClientRect().bottom, innerHeight), sb = sh.getBoundingClientRect().bottom;
        for (const top of [Math.round(sh.scrollHeight / 2), 1e6]) {
          sh.scrollTop = top;
          const f = ft.getBoundingClientRect(); const gap = Math.round((Math.min(mb, sb) - f.bottom) * 10) / 10;
          out.push({ m: m.id, scroll: sh.scrollTop, gap });
        }
        sh.scrollTop = 0;
      });
      return { rows: out, ok: out.every(x => x.gap < 1) };   // 不到 1px 是滚到底时的小数取整（下面只有面板自己的底色）
    })));
    const CLIP = async (page, label, scope) => results.push(Object.assign({ name: 'clip-' + label, cfg: page.__size, clip: true }, await page.evaluate(sc => {
      const bad = [];
      const roots = sc ? [...document.querySelectorAll(sc)] : [document.body];
      roots.forEach(root => root.querySelectorAll('*').forEach(el => {
        const tn = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()); if (!tn.length) return;
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
        const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect(); if (!(t.width > 0)) return;
        // 字形大约是 em 框上下各收 0.1em；往上找会裁东西的框（overflow 不是 visible），带上 overflow-clip-margin
        const gTop = t.top + fs * 0.1, gBot = t.bottom - fs * 0.1;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a); if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
          if (cs.overflowY !== 'clip' && cs.overflowY !== 'hidden' && a !== el && !(cs.overflowX === 'hidden' || cs.overflowX === 'clip')) break;   // 滚动框：滚出去不算切
          const r = a.getBoundingClientRect(), cm = cs.overflowY === 'clip' ? (parseFloat(cs.overflowClipMargin) || 0) : 0;
          if (gTop < r.top - cm - 0.5 || gBot > r.bottom + cm + 0.5) { bad.push(`${(el.textContent || '').trim().slice(0, 8)}（${el.id || el.className.split(' ')[0]}，上 ${Math.round(r.top - cm - gTop)} / 下 ${Math.round(gBot - r.bottom - cm)}px）`); }
          break;
        }
      }));
      return { bad: [...new Set(bad)].slice(0, 20), ok: !bad.length };
    }, scope || null)));
    const STACK = async (page, label) => results.push(Object.assign({ name: 'stack-' + label, cfg: page.__size, stack: true }, await page.evaluate(() => {
      const all = [...document.querySelectorAll('.mask')];
      const on = all.filter(m => m.id !== 'kpMask' && getComputedStyle(m).display !== 'none').map(m => ({ m, z: parseInt(getComputedStyle(m).zIndex, 10) || 0, i: all.indexOf(m) })).sort((a, b) => (a.z - b.z) || (a.i - b.i));
      const tops = on.map(({ m }) => { const sh = m.querySelector(':scope > .sheet'); return sh ? { id: m.id, top: Math.round((m.getBoundingClientRect().bottom - sh.offsetHeight) * 10) / 10 } : null; }).filter(Boolean);
      const diffs = tops.slice(1).map((x, i) => Math.round((x.top - tops[i].top) * 10) / 10);
      return { tops, diffs, ok: tops.length >= 2 && diffs.every(d => d <= 0.5 || d >= 64) };
    })));
    for (const [w, h] of [[412, 970], [360, 780], [412, 915]]) {
      const size = w + 'x' + h;
      const page = await page11(w, h); page.__size = size;
      const meas = size !== '412x915';
      // 记一笔：平时 / 常用列表 / 分类抽屉 / 统计面板 / 文字小面板 / 日期选择
      await tab(page, 'ledger'); await click(page, '.act-add'); await page.waitForTimeout(800); await page.evaluate(() => window.kpClose()); await page.waitForTimeout(400);
      await shot(page, size, '记一笔', '平时');
      if (meas) { await FOOT(page, '记一笔'); await CLIP(page, '记一笔', '#addMask'); }
      for (const [sel, nm] of [['#billTplRow', '常用列表'], ['#billCatMore', '分类抽屉'], ['#billMode', '统计面板'], ['#billRemarkRow', '备注小面板'], ['#billTimeLine', '日期选择']]) {
        await page.click(sel); await page.waitForTimeout(700);
        await shot(page, size, '记一笔', nm);
        if (meas) { await STACK(page, '记一笔→' + nm); await FOOT(page, '记一笔→' + nm); await CLIP(page, '记一笔→' + nm, '.mask'); }
        await page.evaluate(() => { if (window.JiwenSheet.isOpen()) window.JiwenSheet.back(); ['txtMask', 'dtMask'].forEach(id => { const m = document.getElementById(id); if (m && m.style.display === 'flex') m.style.display = 'none'; }); }); await page.waitForTimeout(500);
      }
      await closeAll(page);
      // 修改账单、账单详情
      await page.evaluate(() => window.openEdit('r3')); await page.waitForTimeout(700); await page.evaluate(() => window.kpClose()); await page.waitForTimeout(300);
      await shot(page, size, '修改账单', '平时');
      if (meas) { await FOOT(page, '修改账单'); await CLIP(page, '修改账单', '#editMask'); }
      await page.click('#editCatMore'); await page.waitForTimeout(700); await shot(page, size, '修改账单', '分类抽屉'); if (meas) await STACK(page, '修改账单→分类抽屉');
      await closeAll(page);
      // 设置：外观 → 选色面板（叠层）；分类管理 → 一个分类的面板
      await tab(page, 'settings'); await click(page, '#themeBtn'); await page.waitForTimeout(500);
      await click(page, '#customColorBtn'); await page.waitForTimeout(700);
      await shot(page, size, '选色面板', '叠层'); if (meas) { await STACK(page, '外观→选色面板'); await FOOT(page, '选色面板'); }
      // 选色面板：三条都完整露在「应用」那排上面（原来 72% 高装不下，被挡住半截）
      results.push(Object.assign({ name: 'cp-bars', cfg: size, clip: true }, await page.evaluate(() => {
        const ft = document.getElementById('uiSheetFoot').getBoundingClientRect().top;
        const bad = ['H', 'L', 'S'].filter(k => document.getElementById('cpBar' + k).getBoundingClientRect().bottom > ft + 0.5).map(k => '条 ' + k + ' 被按钮挡住');
        return { bad, ok: !bad.length };
      })));
      await closeAll(page);
      // 日子页
      await tab(page, 'ledger'); await page.evaluate(() => document.getElementById('daysManageBtn').click()); await page.waitForTimeout(600);
      await shot(page, size, '日子页', '平时'); if (meas) await CLIP(page, '日子页', '#pageDays');
      await click(page, '#daysManage'); await page.waitForTimeout(600); await shot(page, size, '日子管理', '平时');
      await closeAll(page); await page.evaluate(() => document.querySelector('.tab-btn[data-tab="ledger"]').click()); await page.waitForTimeout(300);
      // 账单页、统计页、设置页：字被切
      if (meas) { await tab(page, 'ledger'); await CLIP(page, '账单页', '#pageLedger'); await tab(page, 'stats'); await CLIP(page, '统计页', '#pageStats'); await tab(page, 'settings'); await CLIP(page, '设置页', '#pageSettings'); }
      // e. 系统数字输入法（数字键盘开着的时候；提示框要金额的那种也打开看一眼）
      if (meas) {
        await page.evaluate(() => window.customPrompt('虚构的设预算', '', () => {}, '设预算', null, { inputmode: 'decimal' })); await page.waitForTimeout(500);
        results.push(Object.assign({ name: 'sysnum', cfg: size, sysnum: true }, await page.evaluate(() => {
          const bad = [...document.querySelectorAll('input, textarea')].filter(e => (/^(numeric|decimal|tel)$/.test(e.getAttribute('inputmode') || '') || e.type === 'number' || e.type === 'tel') && !e.readOnly && e.getAttribute('inputmode') !== 'none').map(e => e.id || e.className);
          return { bad, ok: !bad.length };
        })));
        await closeAll(page);
      }
      await page.close();
      // f. 主题：几种预设 + 黑 / 白（没有色相的）：根底色和页面底色一样，日子页截图
      if (meas) for (const col of ['#3f6f6b', '#6b7245', '#a8553f', '#000000', '#ffffff']) {
        const pg = await page11(w, h, { app_appearance: JSON.stringify({ primary: col }) });
        await tab(pg, 'ledger'); await pg.evaluate(() => document.getElementById('daysManageBtn').click()); await pg.waitForTimeout(600);
        results.push(Object.assign({ name: 'theme-' + col, cfg: size, theme: true }, await pg.evaluate(() => {
          const c = getComputedStyle(document.documentElement).backgroundColor, b = getComputedStyle(document.body).backgroundColor;
          return { html: c, body: b, ok: c === b };
        })));
        if (SHOTS) await pg.screenshot({ path: path.join(shotsDir, `j-${size}-日子页-主题${col.slice(1)}.png`) });
        await pg.close();
      }
    }
    // 截图总表：一页，按页面 × 状态排，每张标上页面名、屏幕、状态
    if (SHOTS && sheetShots.length) {
      const inSheet = sheetShots.filter(x => x.inSheet);
      const ver = (fs.readFileSync(path.join(WWW, 'index.html'), 'utf8').match(/build (\d{4}-[A-Z0-9]+)/) || [])[1] || 'dev';
      const dir = path.join(__dirname, 'out', ver); fs.mkdirSync(dir, { recursive: true });
      const keyOf = x => x.page + '｜' + x.state;
      const groups = [...new Set(inSheet.map(keyOf))];
      const cell = x => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(shotsDir, x.file)).toString('base64')}"><figcaption>${x.page} · ${x.size} · ${x.state}</figcaption></figure>`;
      const htmlSheet = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;font:14px sans-serif;background:#fff}h2{margin:18px 0 8px;font-size:16px}
        .row{display:flex;gap:12px;align-items:flex-start}figure{margin:0}img{width:206px;display:block;border:1px solid #ccc}figcaption{font-size:12px;margin-top:4px}</style>
        <h1 style="font-size:18px">${ver} 截图总表（412×915、412×970、360×780）</h1>` + groups.map(g => `<h2>${g}</h2><div class="row">${SHEET_SIZES.map(sz => inSheet.find(x => keyOf(x) === g && x.size === sz)).filter(Boolean).map(cell).join('')}</div>`).join('');
      const sp = await browser.newPage({ viewport: { width: 720, height: 800 } });
      await sp.setContent(htmlSheet); await sp.waitForTimeout(300);
      await sp.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true });
      await sp.close();
      console.log('截图总表：' + path.join(dir, 'sheet.png'));
    }
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
      if (m.center) { const bad = m.rows.filter(x => Math.abs(x.d) > 1); md.push(`| ${m.name} | ${m.rows.length} 个 | 差超过 1px 的 ${bad.length} 个 | ${bad.slice(0, 8).map(x => `${x.text}(${x.cls}) ${x.d > 0 ? '偏下' : '偏上'} ${Math.abs(x.d)}`).join('；')} | | ${bad.length ? '有问题' : ''} | | |`); return; }
      if (m.swipe) { md.push(`| ${m.name} | ${m.what} 能滚 ${m.max}px | ${m.err || ''}滑到底 ${m.bottom ? '✓' : '✗'} | 滑回顶 ${m.top ? '✓' : '✗'}${m.openAfterDown === false ? '（面板被关掉了）' : ''} | 顶上往下拉关面板 ${m.closed ? '✓' : '✗'} | ${m.ok === false ? '有问题' : ''} | | |`); return; }
      if (m.kp) { md.push(`| ${m.name}（${m.cfg}） | 键盘顶边 ${m.kTop ?? '-'} | 按键 ${m.keyH ?? '-'}px | 压到 ${m.cut ? m.cut.join('、') || '无' : '-'} | 正在输的露在上面 ${m.fieldShown ? '✓' : '✗'} | ${m.ok ? '' : '有问题 ' + (m.err || '')} | | |`); return; }
      if (m.foot) { md.push(`| ${m.name}（${m.cfg}） | 贴底按钮排 | ${m.rows.map(x => `${x.m} 滚到 ${x.scroll}：下面露 ${x.gap}px`).join('；') || '没有贴底的'} | | | ${m.ok ? '' : '有问题'} | | |`); return; }
      if (m.clip) { md.push(`| ${m.name}（${m.cfg}） | 字被切 | ${m.bad.length} 处 | ${m.bad.join('；')} | | ${m.ok ? '' : '有问题'} | | |`); return; }
      if (m.stack) { md.push(`| ${m.name}（${m.cfg}） | 叠层顶边 | ${m.tops.map(x => x.id + ' ' + x.top).join(' → ')} | 差 ${m.diffs.join(' / ')} | | ${m.ok ? '' : '有问题'} | | |`); return; }
      if (m.sysnum) { md.push(`| 系统数字输入法（${m.cfg}） | | ${m.bad.length} 个 | ${m.bad.join('、')} | | ${m.ok ? '' : '有问题'} | | |`); return; }
      if (m.theme) { md.push(`| ${m.name}（${m.cfg}） | 根底色 ${m.html} | 页面底色 ${m.body} | | | ${m.ok ? '' : '有问题'} | | |`); return; }
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
