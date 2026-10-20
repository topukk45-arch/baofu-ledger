// 1020-C（jsdom，记录全是虚构的）。node -r ./tools/inline-hook.js zZzZ-kp-hold-sheet-scroll.test.js [index.html]
// 一、数字键盘的数字键、小数点也能长按连续输入（照退格的写法）：按下先输一个，停约 400 毫秒后连续，越来越快；
//     输不进去了（整数 8 位、两位小数、小数点已经有了、开头的 0）自己停；松手、滑出按键就停；短按只输一个（后面那下 click 不多输）。
// 二、底部面板往下拉的规矩（bindSheetDrag）：手指按下的地方在能上下滚的框里（textarea、列表、overflow 能滚的块），
//     框没在最顶上时往下拉是滚框、不动面板；框和面板都在最顶上、手指还往下拉，才算拉面板；往上滑永远不动面板。
//     真手指滑动（滑到底、滑回顶、在顶上拉关面板）在真 Chromium 里量：tests/ui/audit.js 第 8 段。
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
  const key = k => [...$('kpGrid').querySelectorAll('.kp-key')].find(b => b.dataset.k === k);
  const pe = (el, type, x, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { button: 0, clientX: x, clientY: y }); el.dispatchEvent(e); };
  const press = k => pe(key(k), 'pointerdown', 5, 5);
  const release = k => { pe(key(k), 'pointerup', 5, 5); key(k).click(); };   // 松手以后浏览器还会补一下 click
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); await wait(420); await t.idle();
  const m = $('billMoney');
  const clear = () => { m.value = ''; };
  const tap = k => { press(k); release(k); };   // 真手指点一下：按下、松手、补一下 click

  // 1. 短按：只输一个
  clear(); press('5'); ok(m.value === '5', '1 按下就输一个');
  ok(key('5').classList.contains('kp-pressed'), '1 按住时是按下的样子');
  await wait(100); release('5');
  ok(m.value === '5' && !key('5').classList.contains('kp-pressed'), '1 短按松手：只输了一个（后面那下 click 没多输）、恢复原样');
  await wait(500); ok(m.value === '5', '1 松手以后不再输');
  key('6').click(); ok(m.value === '56', '1 没有按下、只有 click（比如读屏）照样输一个');

  // 2. 长按数字：停约 400 毫秒后连续输，到整数 8 位自己停
  clear(); press('9');
  await wait(300); ok(m.value === '9', '2 按住 0.3 秒：还只输了按下那一个（停顿中）');
  await t.until(() => m.value.length > 1, 3000); ok(m.value.length > 1, '2 过了停顿：开始连续输 ' + m.value);
  await t.until(() => m.value === '99999999', 5000);
  await wait(300);
  ok(m.value === '99999999', '2 一直按着：整数到 8 位就不再加 ' + m.value);
  ok(!key('9').classList.contains('kp-pressed'), '2 输不进去了：自己停下');
  pe(key('9'), 'pointerup', 5, 5);

  // 3. 越按越快：先 400，再 100，按住超过 1 秒后 50（看排的间隔）
  clear();
  const plan = [], st0 = w.setTimeout;
  w.setTimeout = function (fn, ms) { if (ms === 400 || ms === 100 || ms === 50) plan.push({ ms, at: w.performance.now() }); return st0.apply(this, arguments); };
  const t0 = w.performance.now();
  press('1'); await t.until(() => m.value === '11111111', 8000);
  w.setTimeout = st0; pe(key('1'), 'pointerup', 5, 5);
  const seq = plan.map(x => x.ms);
  ok(seq[0] === 400 && seq.includes(100), '3 先停 400 毫秒、再每 100 毫秒一个 ' + seq.join(','));
  ok(plan.filter(x => x.ms === 50).every(x => x.at - t0 >= 1000) && plan.filter(x => x.ms === 100).every(x => x.at - t0 < 1000 + 5), '3 超过 1 秒才换成每 50 毫秒一个');

  // 4. 小数：两位小数就停；小数点长按只有一个；开头的 0 长按只有一个 0
  clear(); tap('1'); tap('.'); press('3');
  await t.until(() => m.value === '1.33', 3000); await wait(400);
  ok(m.value === '1.33' && !key('3').classList.contains('kp-pressed'), '4 两位小数：输满就停 ' + m.value);
  pe(key('3'), 'pointerup', 5, 5);
  clear(); tap('2'); press('.'); await wait(900);
  ok(m.value === '2.', '4 长按小数点：只有一个 ' + m.value);
  pe(key('.'), 'pointerup', 5, 5);
  clear(); press('0'); await wait(900);
  ok(m.value === '0', '4 长按 0：开头只有一个 0 ' + m.value);
  pe(key('0'), 'pointerup', 5, 5);

  // 5. 中途松手、手指滑出按键：停
  clear(); press('7'); await wait(650); pe(key('7'), 'pointerup', 5, 5);
  const v5 = m.value; await wait(400);
  ok(v5.length >= 2 && v5.length <= 6 && m.value === v5, '5 中途松手：停在 ' + v5 + '，之后不再输');
  key('7').click(); ok(m.value === v5, '5 松手补的那一下 click 不多输');
  clear();
  key('8').getBoundingClientRect = () => ({ left: 0, top: 0, right: 60, bottom: 50, width: 60, height: 50 });
  press('8'); await wait(550);
  const b5 = m.value; pe(key('8'), 'pointermove', 200, 200); await wait(400);
  ok(m.value === b5 && !key('8').classList.contains('kp-pressed'), '5 手指滑出按键：立刻停（停在 ' + b5 + '）');
  pe(key('8'), 'pointerup', 200, 200);
  // 长按时键盘被关掉：停
  clear(); press('4'); await wait(500); w.kpClose(); const v6 = m.value; await wait(400);
  ok(m.value === v6 && !key('4').classList.contains('kp-pressed'), '5 长按时键盘关了：停下');
  // 退格照旧
  m.value = '123'; w.kpOpen(m); pe(key('del'), 'pointerdown', 5, 5); ok(m.value === '12', '5 退格照旧：按下删一个');
  pe(key('del'), 'pointerup', 5, 5); key('del').click(); ok(m.value === '12', '5 退格短按只删一个');
  w.kpClose();
  $('addMask').style.display = 'none'; await wait(400);

  // 二、往下拉的规矩：用 AI 导出（里面是能滚的文字框）
  w.JiwenAiExport.openAiExport('虚构\n'.repeat(50), '虚构');
  await wait(400);
  const mask = $('aiExpMask'), sheet = mask.querySelector('.sheet'), ta = $('aiExpText');
  let taTop = 300;
  Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => 1200 });
  Object.defineProperty(ta, 'clientHeight', { configurable: true, get: () => 200 });
  Object.defineProperty(ta, 'scrollTop', { configurable: true, get: () => taTop, set: v => { taTop = v; } });
  const touch = (el, type, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); const p = { clientX: 100, clientY: y }; e.touches = type === 'touchend' ? [] : [p]; el.dispatchEvent(e); return e; };
  const pull = (el, dy) => { touch(el, 'touchstart', 300); let last; for (let i = 1; i <= 6; i++) last = touch(el, 'touchmove', 300 + dy * i / 6); return last; };
  let e = pull(ta, 120);
  ok(!e.defaultPrevented && !sheet.style.transform, '二 文字框没在最顶上（滑到中间）：往下拉是滚框，面板不动');
  touch(ta, 'touchend', 420); await wait(50);
  ok(mask.style.display === 'flex', '二 面板还开着');
  e = pull(ta, -120);
  ok(!e.defaultPrevented && !sheet.style.transform, '二 往上滑：永远是滚框');
  touch(ta, 'touchend', 180);
  taTop = 0;
  e = pull(ta, 120);
  ok(e.defaultPrevented && /translateY\(\d/.test(sheet.style.transform), '二 文字框和面板都在最顶上，往下拉：拉面板 ' + sheet.style.transform);
  touch(ta, 'touchcancel', 420); sheet.style.transform = '';
  // 外面的框在最顶上、里面的框没在顶上：照样滚框
  const wrap = d.createElement('div'); ta.parentNode.insertBefore(wrap, ta); wrap.appendChild(ta);
  taTop = 50;
  e = pull(ta, 120);
  ok(!e.defaultPrevented && !sheet.style.transform, '二 按在里面那个框上、它没在顶上：照样滚框');
  touch(ta, 'touchend', 420);
  // 面板自己没在顶上（框在顶上）：滚面板
  taTop = 0; const st0b = Object.getOwnPropertyDescriptor(w.Element.prototype, 'scrollTop');
  Object.defineProperty(sheet, 'scrollTop', { configurable: true, get: () => 80, set() {} });
  e = pull(ta, 120);
  ok(!e.defaultPrevented && !sheet.style.transform, '二 面板自己没滚到顶：往下拉是滚面板');
  touch(ta, 'touchend', 420);
  delete sheet.scrollTop; void st0b;
  // 分类管理的列表里也能拉（原来 .cat-list 把触摸移动拦掉了，列表顶上往下拉关不掉面板）
  $('aiExpMask').style.display = 'none'; await wait(400);
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('manageCatSetting').click(); await wait(400);
  const cl = $('catList'), cs = $('catMask').querySelector('.sheet');
  e = pull(cl.firstElementChild || cl, 360);
  ok(e.defaultPrevented && /translateY\(\d/.test(cs.style.transform), '二 分类管理：列表在最顶上往下拉，拉的是面板 ' + cs.style.transform);
  touch(cl, 'touchend', 660); await wait(400);
  ok($('catMask').style.display !== 'flex', '二 分类管理：拉够了面板关掉');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
