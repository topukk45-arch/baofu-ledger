// 1020-E 自定义主色用 App 自己的选色面板（jsdom）。node -r ./tools/inline-hook.js zZzZb-color-picker.test.js [index.html]
// 外观设置里「自定义主色」不再是系统的选色框（安卓上白底，和 App 不搭），点了打开共用底部面板：一排常用色块 + 色相 / 深浅 / 鲜艳三条，
// 下面写现在选的色值、能直接输入；选的时候整个 App 实时预览，「应用」才存，「取消」、返回键、往下拉都恢复原来的；太浅太亮自动加深照旧。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t;
  const primary = () => w.document.documentElement.style.getPropertyValue('--c-primary').trim().toLowerCase();
  const saved = () => { try { return JSON.parse(w.localStorage.getItem('app_appearance') || '{}').primary || null; } catch (_) { return null; } };
  const open = async () => { $('customColorBtn').click(); await wait(60); };
  const sheetOpen = () => $('uiSheetMask') && $('uiSheetMask').style.display === 'flex' && $('uiSheetTitle').textContent === '自定义主色';
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('themeBtn').click(); await wait(50);
  const p0 = primary();
  ok(!d.querySelector('input[type="color"]'), '1 没有系统的选色框了');
  ok($('customColorBtn') && $('customColorVal').textContent === '#3f6f6b', '1 外观设置里「自定义主色」是一行（色块 + 色值）');

  // 2. 打开：色块、三条、色值
  await open();
  ok(sheetOpen(), '2 点开是共用底部面板「自定义主色」');
  ok(d.querySelectorAll('#cpSwatches .cp-sw').length === 12, '2 一排常用色块（12 个，两排）');
  ok(['H', 'L', 'S'].every(k => $('cpBar' + k) && $('cpBar' + k).hasAttribute('data-nodrag')), '2 色相、深浅、鲜艳三条（按在条上拖不算拉面板）');
  ok($('cpHex') && $('cpHex').value === '#3f6f6b', '2 下面写现在的色值、能输入');

  // 3. 点色块：整个 App 实时变，不存；取消恢复
  d.querySelector('.cp-sw[data-c="#1565c0"]').click(); await wait(50);
  ok(primary() !== p0 && $('cpHex').value === '#1565c0', '3 点色块：整个 App 实时换颜色 ' + primary());
  ok(saved() == null, '3 还没存');
  $('cpCancel').click(); await wait(50);
  ok(!sheetOpen() && primary() === p0 && saved() == null, '3 取消：恢复原来的颜色、没存');

  // 4. 输入色值 → 应用：存
  await open();
  const hex = $('cpHex'); hex.value = '2e7d32'; hex.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50);
  ok(primary() === '#2e7d32', '4 输色值（不带 # 也行）：实时预览 ' + primary());
  hex.value = '#12'; hex.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(30);
  ok(primary() === '#2e7d32', '4 没输完的色值不变');
  $('cpApply').click(); await wait(50);
  ok(!sheetOpen() && saved() === '#2e7d32' && primary() === '#2e7d32', '4 应用：存下来了');
  ok($('customColorVal').textContent === '#2e7d32', '4 外观设置那一行跟着变');

  // 5. 1027-UI：浅色不再压深，按钮就是选的颜色、配深字；字怎么配都不够清楚的（卡在中间）才挪一点，面板里写挪到哪个
  await open();
  const fill = () => w.document.documentElement.style.getPropertyValue('--c-fill').trim().toLowerCase();
  const onFill = () => w.document.documentElement.style.getPropertyValue('--c-on-fill').trim().toLowerCase();
  hex.value; const h2 = $('cpHex'); h2.value = '#ffff66'; h2.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50);
  ok(fill() === '#ffff66' && !/挪了一点/.test($('cpNote').textContent), '5 浅黄：按钮就是 #ffff66，不加深 ' + fill());
  ok(w.JiwenTheme.con(fill(), onFill()) >= 4.5 && w.JiwenTheme.con(onFill(), '#000000') < w.JiwenTheme.con(onFill(), '#ffffff'), '5 浅黄的按钮配深字、对比 ≥ 4.5 ' + onFill());
  ok($('cpName').textContent && $('cpVerdict').textContent.includes('按钮配深字'), '5 面板里写名字和短评：' + $('cpName').textContent + ' / ' + $('cpVerdict').textContent);
  h2.value = '#0077dd'; h2.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50);
  ok(/挪了一点的 #[0-9a-f]{6}/.test($('cpNote').textContent) && fill() !== '#0077dd', '5 卡在中间的蓝：写明按钮会用挪了一点的 ' + fill());

  // 6. 返回键：恢复（不存）
  await t.back(); await wait(50);
  ok(!sheetOpen() && primary() === '#2e7d32' && saved() === '#2e7d32', '6 返回键：恢复成打开前的颜色、没存');

  // 7. 拖色相条：按在哪里就是哪个色相
  await open();
  const trackH = $('cpBarH').querySelector('.cp-track');
  trackH.getBoundingClientRect = () => ({ left: 0, top: 0, right: 360, bottom: 24, width: 360, height: 24 });
  const pe = (el, type, x) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { clientX: x, clientY: 10, pointerId: 1, button: 0 }); el.dispatchEvent(e); };
  pe($('cpBarH'), 'pointerdown', 240); pe($('cpBarH'), 'pointermove', 250); pe($('cpBarH'), 'pointerup', 250); await wait(50);
  const v7 = $('cpHex').value;
  ok(/^#[0-9a-f]{6}$/.test(v7) && v7 !== '#2e7d32', '7 拖色相条：色值跟着变 ' + v7);
  ok(primary() !== '#2e7d32', '7 拖的时候整个 App 跟着变');
  // 在条上往下拖：不算拉面板
  const touch = (el, type, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = type === 'touchend' ? [] : [{ clientX: 100, clientY: y }]; el.dispatchEvent(e); return e; };
  touch($('cpBarL'), 'touchstart', 300); for (let i = 1; i <= 6; i++) touch($('cpBarL'), 'touchmove', 300 + i * 30); touch($('cpBarL'), 'touchend', 480);
  ok(!$('uiSheet').style.transform && sheetOpen(), '7 按在条上往下拖：面板不动、不关');
  $('cpCancel').click(); await wait(50);
  ok(primary() === '#2e7d32', '7 取消：回到存着的颜色');

  // 8. 恢复默认、预设照旧
  $('resetThemeBtn').click(); await wait(30);
  ok(saved() === '#3f6f6b' && $('customColorVal').textContent === '#3f6f6b', '8 恢复默认照旧，那一行跟着变');
  [...$('themePresets').querySelectorAll('.theme-swatch')][1].click(); await wait(30);
  ok(saved() === '#dcb1b3' && $('customColorVal').textContent === '#dcb1b3' && $('customColorName').textContent === '退红', '8 点预设（1027-UI 起第二个是退红）照旧，那一行跟着变、写名字');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
