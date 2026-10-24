// 1020-J 这一轮的界面修改（jsdom，记录、模板、日子全是虚构的）。node -r ./tools/inline-hook.js zZzZg-ui-1020j.test.js [index.html]
// 一、记一笔 / 修改：常用模板收进列表卡（分类 / 统计 / 常用 / 备注四行），点「常用」拉出常用模板列表；
// 二、数字键盘：顶上不再重复写金额，键盘自己定高（顶边落在两排之间的空白里，按键 52～76px）——jsdom 不排版，这里拿假的位置算；
// 三、贴底按钮排下面不露内容；四、「计入」不被切；五、换主题根底色跟着变；六、日子管理的条数用数字键盘（整数模式）；
// 七、叠起来的两层面板顶边差不到 64px 的拉齐；八、选色面板拉到两头不变粉。真的样子在 ui/audit.js 第 11 段量。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const CATS = ['未分类', '吃饭', '购物', '出行', '工资', '红包', '其他', '日用', '水电', '房租'];
const recs = [
  { id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' },
  { id: 'r2', time: '2026-12-02T08:00', money: 4, type: 'expense', cat: '出行', remark: '' },
];
const TPLS = [
  { id: 'a', type: 'expense', cat: '吃饭', remark: '早餐', money: 8, mode: 'normal' },
  { id: 'b', type: 'expense', cat: '水电', remark: '', money: null, mode: 'skip', name: '电费' },
  { id: 'c', type: 'income', cat: '工资', remark: '虚构工资', money: 5000, mode: 'normal', name: '发工资' },
];
// 十六进制 → 色相（度）
function hueOf(hex) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null;
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

(async () => {
  const t = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(recs, CATS, { tpls: TPLS }), { ['days_' + A.ID]: JSON.stringify([{ name: '虚构的日子', date: '2026-12-25' }]) }) });
  const { $, w, d } = t;
  const shown = id => $(id) && $(id).style.display === 'flex';
  const after = (a, b) => !!($(a).compareDocumentPosition($(b)) & 4);
  const cssAll = [...d.querySelectorAll('style')].map(x => x.textContent).join('\n');
  d.querySelector('.tab-btn[data-tab="ledger"]').click();

  // ===== 一、列表卡四行；常用模板列表 =====
  $('fabAdd').click(); await wait(420); await t.idle(); w.kpClose();
  const k = id => $(id).querySelector('.rec-row-k').textContent;
  ok(after('billCatMore', 'billMode') && after('billMode', 'billTplRow') && after('billTplRow', 'billRemarkRow'), '一 列表卡四行：分类 → 统计 → 常用 → 备注');
  ok(k('billCatMore') === '分类' && k('billMode') === '统计' && k('billTplRow') === '常用' && k('billRemarkRow') === '备注', '一 左边两个字的名字：分类 / 统计 / 常用 / 备注（「更多」改叫「分类」）');
  ok($('billCatMoreVal').textContent === '' && $('billCatMoreVal').dataset.ph === '全部分类' && $('billTplVal').dataset.ph === '选择常用模板', '一 没值时右边是灰字提示：全部分类 / 选择常用模板');
  ok(/\.rec-row-v:empty::before \{[^}]*content:attr\(data-ph\)[^}]*color:var\(--c-text-soft\)/.test(cssAll), '一 灰字提示用 :empty::before 画（值本身还是空的）');
  ok(!$('billTplField') && !$('billTplChips') && !$('addSheet').querySelector('.tpl-chips'), '一 分类上面那两排「常用」胶囊没了');
  ok(!$('editTplRow') && !$('editSheet').querySelector('[id$="TplRow"]') && $('editCatMore').querySelector('.rec-row-k').textContent === '分类', '一 修改账单没有「常用」那一行，「更多」也改叫「分类」');
  ok($('tplEditCatMore').querySelector('.rec-row-k').textContent === '分类', '一 模板编辑里也叫「分类」');
  // 点「常用」
  $('billTplRow').click();
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '常用' && $('uiSheetSub').textContent === '点一个，金额、分类、备注一起填好', '一 点「常用」：标题「常用」+ 小字说明');
  const rows = [...d.querySelectorAll('#tplPick .tpl-pick-row')];
  const txt = (r, c) => (r.querySelector(c) || {}).textContent || '';
  ok(rows.length === 3 && txt(rows[0], '.tpl-pick-ic') === '吃' && txt(rows[0], '.tpl-pick-name') === '早餐' && txt(rows[0], '.tpl-pick-sub') === '吃饭 · 支出' && txt(rows[0], '.tpl-pick-amt') === '¥8',
    '一 一行一个：小圆标写分类第一个字、名字、「分类 · 收支」、右边固定金额 ' + rows.map(r => r.textContent).join('|'));
  ok(txt(rows[1], '.tpl-pick-name') === '电费' && txt(rows[1], '.tpl-pick-sub') === '水电 · 支出 · 不计' && !rows[1].querySelector('.tpl-pick-amt'), '一 不是计入的再写统计；没有固定金额的不写金额');
  ok(txt(rows[2], '.tpl-pick-sub') === '工资 · 收入 · 备注：虚构工资', '一 有备注的写备注');
  ok($('uiSheetCancel').textContent === '取消' && $('tplPickManage').textContent === '管理常用' && $('uiSheetCancel').parentElement.classList.contains('ui-pair') && $('uiSheetCancel').nextElementSibling === $('tplPickManage'), '一 底部「取消 | 管理常用」左右并排（左退右进）');
  ok(/\.tpl-pick-row \{[^}]*min-height:60px/.test(cssAll), '一 一行 60px 左右');
  rows[1].click();
  ok(!w.JiwenSheet.isOpen() && w.JiwenForms.billCatSel === '水电' && $('billTypeChips').querySelector('.sel-out') && $('billMode').dataset.mode === 'skip' && $('billTplVal').textContent === '电费', '一 点一个：照模板填好（分类、收支、统计）、关掉列表、那一行写它的名字');
  // 管理常用：打开常用模板管理，关了回到这个列表
  $('billTplRow').click(); $('tplPickManage').click();
  ok(shown('tplMask') && !w.JiwenSheet.isOpen(), '一 管理常用：打开常用模板管理');
  $('closeTpl').click(); await wait(10);
  ok(w.JiwenSheet.isOpen() && $('uiSheetTitle').textContent === '常用' && shown('addMask'), '一 关了管理常用：回到常用列表');
  w.JiwenSheet.back();
  ok(!w.JiwenSheet.isOpen() && shown('addMask'), '一 取消 / 返回：回到记一笔');
  // 重新开一笔：常用那一行回到灰字
  $('closeAdd').click(); if (t.ask()) await t.askOk();
  $('fabAdd').click(); await wait(420); w.kpClose();
  ok($('billTplVal').textContent === '', '一 重新开一笔：「常用」那一行回到灰字提示');
  $('closeAdd').click(); if (t.ask()) await t.askOk();

  // ===== 二、数字键盘：顶上不重复写金额；键盘自己定高（假的位置） =====
  ok(!$('kpVal') && !d.querySelector('.kp-show'), '二 键盘顶上那个重复的大字金额去掉了');
  ok(/grid-template-rows:repeat\(4, var\(--kp-key, 56px\)\)/.test(cssAll), '二 按键高度跟着 --kp-key 走');
  {
    // 记一笔：屏幕 800 高；键盘拖动条 + 上下内边距 52（键盘 300、按键那一格 248）；金额那一行到 200，下面收支、分类、列表卡四行、贴底的保存那排
    const R = (top, bottom) => ({ top, bottom, left: 0, right: 400, width: 400, height: bottom - top, x: 0, y: top });
    const orig = w.Element.prototype.getBoundingClientRect;
    let rects = new Map();
    w.Element.prototype.getBoundingClientRect = function () { return rects.get(this) || (this.id === 'kpSheet' ? R(500, 800) : this.id === 'kpGrid' ? R(544, 792) : this.id === 'kpMask' ? R(0, 800) : R(0, 0)); };
    $('fabAdd').click(); await wait(420); w.kpClose();
    const set = (el, a, b) => rects.set(el, R(a, b));
    set($('addSheet'), 100, 800);
    set($('billMoney').closest('.rec-money-row'), 150, 200); set($('billMoney'), 150, 200);
    $('billTypeChips').querySelectorAll('.cc').forEach(e => set(e, 216, 264));
    $('billCatChips').querySelectorAll('.cc').forEach(e => set(e, 280, 328));
    [['billCatMore', 342, 394], ['billMode', 394, 446], ['billTplRow', 446, 498], ['billRemarkRow', 498, 550]].forEach(([id, a, b]) => set($(id), a, b));
    $('addSheet').querySelectorAll('.rec-foot, .rec-foot *').forEach(e => set(e, 562, 800));
    w.kpOpen($('billMoney')); w.JiwenKeypad.kpFit();
    let f = w.JiwenKeypad.kpFitInfo;
    // 顶边最低能到 800-52-24-4*52 = 516；从下往上试：保存那排上面那条（550～562）放不下，再往上是「常用 / 备注」两行之间（498）
    ok(f && f.top === 498 && f.keyH === 56.5 && $('kpSheet').style.getPropertyValue('--kp-key') === '56.5px', '二 记一笔：键盘顶边落在能放下的最靠下那条空白（常用 / 备注两行之间），按键 56.5px ' + JSON.stringify(f));
    // 屏幕更高：列表卡下面那条空白也放得下了 → 落在它（离上面那排 8px），按键最高 76，多的垫在键盘顶上
    rects.set($('kpMask'), R(0, 1000));
    w.JiwenKeypad.kpFit(); f = w.JiwenKeypad.kpFitInfo;
    ok(f && f.top === 556 && f.keyH === 76 && $('kpSheet').style.getPropertyValue('--kp-extra') === String(1000 - 556 - 52 - 24 - 4 * 76) + 'px', '二 屏幕高：落在列表卡和保存那排之间，按键到 76 封顶、多的垫在顶上 ' + JSON.stringify(f));
    // 屏幕很矮：哪条都放不下 52 → 只要金额露在上面（金额下面那条），记一笔不滚
    rects.set($('kpMask'), R(0, 520));
    w.JiwenKeypad.kpFit(); f = w.JiwenKeypad.kpFitInfo;
    ok(f && f.top === 208 && f.keyH >= 52 && f.keyH <= 76 && !$('addSheet').classList.contains('kp-lift'), '二 屏幕矮：落在金额下面那条空白，金额一定露在键盘上面，记一笔不垫空白 ' + JSON.stringify(f));
    w.kpClose(); $('closeAdd').click(); if (t.ask()) await t.askOk();
    // 筛选（没有贴底的保存那排）：放不下就垫空白、往上滚，正在输的那一行下面那条空白对着键盘顶边
    rects = new Map();
    $('filterFab').click(); await wait(10);
    set($('filterSheet'), 600, 800);
    const minRow = $('searchMin').closest('.rec-row'); set(minRow, 700, 748); set($('searchMin'), 704, 744);
    set($('searchFrom').closest('.rec-row'), 748, 796);
    w.kpOpen($('searchMin')); w.JiwenKeypad.kpFit(); f = w.JiwenKeypad.kpFitInfo;
    ok($('filterSheet').classList.contains('kp-lift') && f && f.top === 800 - 52 - 24 - 4 * 56 && f.keyH === 56, '二 筛选：放不下时垫一块键盘高的空白再滚，按默认 56 ' + JSON.stringify(f));
    w.kpClose(); w.closeFilterSheet();
    w.Element.prototype.getBoundingClientRect = orig;
  }
  // 光标和数字之间留一点空
  ok(/KP_CARET_GAP=3/.test(fs.readFileSync(path.join(WWW, 'app', 'keypad.js'), 'utf8')), '二 闪动光标和数字之间留 3px');

  // ===== 六、数字键盘（整数模式）：导入简化 2a 去掉了日子管理的条数（dmCount），整数模式照旧留着，用 kpRegister 登记一个测试框来查 =====
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('daysManageBtn').click(); await wait(10); $('daysManage').click(); await wait(10);
  ok(!$('dmCount') && !$('dmSave'), '六 日子管理里没有「入口卡显示几条」了');
  const dmIn = d.createElement('input'); dmIn.type = 'text'; dmIn.id = 'kpIntTest'; $('dayMgrSheet').querySelector('.rec-list').appendChild(dmIn);
  ok(w.JiwenKeypad.kpRegister('kpIntTest', { int: { len: 2, lo: 3, hi: 99 } }) === true, '六 kpRegister 登记一个整数框');
  const dm = $('kpIntTest');
  ok(dm.readOnly && dm.getAttribute('inputmode') === 'none' && dm.classList.contains('kp-field'), '六 入口卡显示几条：不弹系统输入法');
  dm.click();
  const dot = $('kpGrid').querySelector('.kp-key[data-k="."]');
  ok(shown('kpMask') && dm.classList.contains('kp-on') && dot.disabled && dot.textContent === '' && dot.classList.contains('kp-off') && $('kpOk').textContent === '确定', '六 点了弹 App 的数字键盘：小数点那一格空着不能点，大按钮「确定」');
  const key = c => (c === '<' ? $('kpDel') : $('kpGrid').querySelector(`.kp-key[data-k="${c}"]`)).click();
  dm.value = ''; w.JiwenKeypad.kpOpen(dm);
  key('0'); ok(dm.value === '', '六 开头不能是 0');
  key('1'); key('2'); key('3'); ok(dm.value === '12', '六 最多 2 位：' + dm.value);
  key('<'); ok(dm.value === '1', '六 退格');
  $('kpOk').click();
  ok(!shown('kpMask') && dm.value === '3', '六 点「确定」：小于 3 的按 3');
  dm.click(); key('<'); key('9'); key('9'); w.kpClose();
  ok(dm.value === '99', '六 关掉键盘（不点确定）也照样收：99 留着');
  dm.click(); key('<'); key('<'); w.kpClose();
  ok(dm.value === '3', '六 删空了关掉：按 3');
  dm.click(); key('<'); key('8'); w.kpClose();
  ok(dm.value === '8', '六 改成 8：' + dm.value);
  $('dmClose').click(); await t.idle();
  // 设置里选了系统键盘：照旧弹系统的数字输入法
  w.localStorage.setItem('app_sys_money_kb', '1');
  d.querySelector('#sysMoneyKbSeg button[data-v="on"]').click();
  ok(!dm.readOnly && dm.getAttribute('inputmode') === 'numeric' && $('billMoney').getAttribute('inputmode') === 'decimal', '六 选了「用系统键盘」：条数弹系统的数字键盘（numeric），金额弹 decimal');
  d.querySelector('#sysMoneyKbSeg button[data-v="off"]').click();
  ok(dm.readOnly && dm.getAttribute('inputmode') === 'none', '六 改回来：又是 App 的键盘');
  // 页面上不许有点了会弹系统数字输入法的框（数字键盘开着时）
  const sysNum = [...d.querySelectorAll('input, textarea')].filter(e => /^(numeric|decimal|tel)$/.test(e.getAttribute('inputmode') || '') || e.type === 'number').filter(e => !e.readOnly).map(e => e.id);
  ok(!sysNum.length, '六 页面上没有点了会弹系统数字输入法的框：' + sysNum.join());

  // ===== 三、四、五：样式规则 =====
  ok(/\.form-mask > \.sheet\.rec-sheet \{ padding-bottom:0; \}/.test(cssAll), '三 记一笔 / 修改面板自己的下内边距是 0，贴底按钮排贴到面板最底边');
  const lastClip = cssAll.lastIndexOf('.rec-row-v { overflow:clip; overflow-clip-margin:8px; }'), lastHidden = cssAll.search(/\.rec-row-v \{ flex:1 1 auto;[^}]*overflow:hidden/);
  ok(lastClip > lastHidden && lastHidden > 0, '四 .rec-row-v 的 overflow:clip + 留边排在 overflow:hidden 后面（「计入」下半截不再被剪）');
  const rootBg = () => d.documentElement.style.getPropertyPriority('background-color');
  ok(/root\.style\.setProperty\('background-color', bg, 'important'\)/.test(fs.readFileSync(path.join(WWW, 'app', 'settings.js'), 'utf8')), '五 换主题时根底色带 !important（压过 index.html 开头防白闪钉的米黄）');

  // ===== 七、叠层顶边（假的高度） =====
  {
    const oh = Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, 'offsetHeight');
    const origR = w.Element.prototype.getBoundingClientRect;
    const H = new Map();
    Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return H.has(this) ? H.get(this) : 0; } });
    w.Element.prototype.getBoundingClientRect = function () { return this.classList && this.classList.contains('mask') ? { top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800 } : origR.call(this); };
    $('fabAdd').click(); await wait(420); w.kpClose();
    H.set($('addSheet'), 600);
    for (const [h, want] of [[580, '600px'], [537, '600px'], [536, ''], [400, ''], [640, '']]) {
      w.JiwenSheet.open({ title: '虚构' }); H.set(w.JiwenSheet._sheet(), h);
      $('uiSheetMask').style.zIndex = String(+$('uiSheetMask').style.zIndex + 0);   // 碰一下 style，触发重算
      await wait(5);
      ok(w.JiwenSheet._sheet().style.minHeight === want, `七 上面那层 ${h}px、下面那层 600px（顶边差 ${600 - h}）：${want ? '拉高到和下面那层对齐' : '不动'}（${w.JiwenSheet._sheet().style.minHeight || '没拉'}）`);
      w.JiwenSheet.close();
    }
    Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', oh);
    w.Element.prototype.getBoundingClientRect = origR;
    $('closeAdd').click(); if (t.ask()) await t.askOk();
  }

  // ===== 八、选色面板：色相记在面板里，拉到两头不变粉 =====
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('themeBtn').click(); await wait(20);
  $('customColorBtn').click(); await wait(30);
  ok(w.JiwenSheet._sheet().classList.contains('ui-sheet-tall') && /\.ui-sheet\.ui-sheet-tall \{ max-height:88vh; max-height:88dvh; \}/.test(cssAll), '八 选色面板能到 88% 屏幕高（原来 72% 装不下，色相条被「应用」挡住半截）');
  const bg = () => d.documentElement.style.getPropertyValue('--c-bg').trim();
  const prim = () => d.documentElement.style.getPropertyValue('--c-primary').trim();
  const drag = async (k, f) => {
    const bar = $('cpBar' + k), tr = bar.querySelector('.cp-track');
    tr.getBoundingClientRect = () => ({ left: 0, right: 300, width: 300, top: 0, bottom: 48, height: 48 });
    const ev = (type, x) => { const e = new w.MouseEvent(type, { bubbles: true, clientX: x }); e.pointerId = 1; bar.dispatchEvent(e); };
    ev('pointerdown', f * 300); ev('pointerup', f * 300);
    await new Promise(r => w.requestAnimationFrame(() => r())); await wait(5);
  };
  let pink = 0, worst = 0;
  for (const hf of [0.2, 0.35, 0.55, 0.75]) {          // 色相 72° 黄绿、126° 绿、198° 青蓝、270° 紫
    await drag('H', hf);
    const want = hf * 360;
    for (const [k, f] of [['L', 0], ['L', 1], ['S', 0], ['S', 1], ['L', 0.5]]) {
      await drag(k, f);
      const hb = hueOf(bg()); const dh = hb == null ? 999 : hueDiff(hb, want);
      worst = Math.max(worst, dh);
      if (hb != null && hueDiff(hb, 340) < 25 && hueDiff(want, 340) > 40) pink++;
    }
  }
  ok(worst <= 6, '八 色相放在几个位置，深浅 / 鲜艳各拉到两头：整个 App 底色的色相和选的一致（最多差 ' + Math.round(worst * 10) / 10 + '°）');
  ok(!pink, '八 不出现粉色');
  // 深浅条的两头就是 App 真正会用的最深 / 最浅：拉到最浅时没被加深（不写「实际会用深一点的」）
  await drag('H', 0.6); await drag('S', 0.5); await drag('L', 1);
  ok(!/实际会用深一点的/.test($('cpNote').textContent) && prim().toLowerCase() === $('cpHex').value.toLowerCase(), '八 深浅拉到最浅：就是实际用的颜色，不另说「实际会用深一点的」 ' + prim() + ' ' + $('cpHex').value);
  await drag('L', 0);
  ok(prim().toLowerCase() === $('cpHex').value.toLowerCase() && hueDiff(hueOf(prim()), 216) <= 6, '八 深浅拉到最深：也看得出色相（不是纯黑）' + prim());
  // 输入没有色相的（黑 / 白）：保留上一次的色相
  const hx = $('cpHex'); hx.value = '#000000'; hx.dispatchEvent(new w.Event('input', { bubbles: true }));
  await new Promise(r => w.requestAnimationFrame(() => r())); await wait(5);
  ok(hueDiff(hueOf(bg()), 216) <= 6, '八 输入 #000000：保留上一次的色相（底色不是粉的）' + bg());
  $('cpApply').click(); await wait(10);
  const ap = JSON.parse(w.localStorage.getItem('app_appearance') || '{}');
  ok(ap.primary === '#000000' && Math.abs(ap.hue - 216) < 1 && ap.hueOf === '#000000', '八 存照旧存一个色值，色相另存在 app_appearance 里：' + JSON.stringify(ap));
  ok(!/"hue"/.test(JSON.stringify((w.JiwenStore || w).odBuildPayload ? '' : '')), '八 色相只在这台手机的 app_appearance（不进备份）');
  ok(rootBg() === 'important', '五 根底色写成 !important');

  // 再开一次 App：存的是黑色，按存下的色相配色
  const t2 = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(recs, CATS), { app_appearance: JSON.stringify({ primary: '#000000', hue: 216, hueOf: '#000000' }) }) });
  const bg2 = t2.d.documentElement.style.getPropertyValue('--c-bg').trim();
  ok(hueDiff(hueOf(bg2), 216) <= 6, '八 重开 App：黑色按存下的色相配（' + bg2 + '）');
  const t3 = await A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(recs, CATS), { app_appearance: JSON.stringify({ primary: '#ffffff' }) }) });
  const bg3 = t3.d.documentElement.style.getPropertyValue('--c-bg').trim();
  ok(hueOf(bg3) != null && hueDiff(hueOf(bg3), 0) > 40, '八 老的白色（没存色相）：不再配成粉色（' + bg3 + '）');

  ok(t.errs.length === 0, '没有脚本错误 ' + t.errs.join(';'));
  console.log(`1020-J 界面：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ✗ 出错：' + (e && e.stack || e)); console.log(`1020-J 界面：${pass} 通过，${fail + 1} 失败`); process.exit(1); });
