// 1019-Z2 数字键盘退格长按连续删（jsdom，记录全是虚构的）。node zZzT-kp-del-hold.test.js [index.html]
// 按下先删一个，停约 400 毫秒后开始连续删：先每 100 毫秒一个，按住超过 1 秒后每 50 毫秒一个，删到空为止；
// 松手立刻停；按住时有按下的样子；手指滑出按键范围也停；短按只删一个（后面那下 click 不再多删）。
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
  const del = () => $('kpDel');
  const pe = (type, x, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { button: 0, clientX: x, clientY: y }); del().dispatchEvent(e); };
  const press = () => pe('pointerdown', 5, 5);
  const release = () => { pe('pointerup', 5, 5); del().click(); };   // 松手以后浏览器还会补一下 click
  const keys = s => [...s].forEach(c => [...$('kpGrid').querySelectorAll('.kp-key')].find(b => b.dataset.k === c).click());
  d.querySelector('.tab-btn[data-tab="ledger"]').click();
  $('fabAdd').click(); await wait(420); await t.idle();
  const m = $('billMoney');

  // 1. 短按：只删一个
  keys('123456.78');
  ok(m.value === '123456.78', '1 先输入 123456.78');
  press(); ok(m.value === '123456.7', '1 按下就删一个');
  ok(del().classList.contains('kp-pressed'), '1 按住时是按下的样子');
  await wait(100); release();
  ok(m.value === '123456.7' && !del().classList.contains('kp-pressed'), '1 短按松手：只删了一个（后面那下 click 没多删）、恢复原样');
  await wait(500);
  ok(m.value === '123456.7', '1 松手以后不再删');

  // 2. 长按：停约 400 毫秒后开始连续删，删到空为止
  press();
  await wait(300);
  ok(m.value === '123456.', '2 按住 0.3 秒：还只删了按下那一个（停顿中）');
  await t.until(() => m.value.length < 7, 3000);
  ok(m.value.length < 7 && m.value.length > 0, '2 过了停顿：开始连续删 ' + m.value);
  await t.until(() => m.value === '', 5000);
  ok(m.value === '' && !del().classList.contains('kp-pressed'), '2 一直按着：删到空为止、自动停下');
  pe('pointerup', 5, 5);

  // 3. 越按越快：看代码排的下一次间隔（机器忙时真实间隔会拖长，排的间隔不会变）：先 400，再 100，按住超过 1 秒后 50
  keys('12345678.99');   // 11 个字
  const plan = [], st0 = w.setTimeout;
  w.setTimeout = function (fn, ms) { if (ms === 400 || ms === 100 || ms === 50) plan.push({ ms, at: w.performance.now() }); return st0.apply(this, arguments); };
  const t0 = w.performance.now();
  press();
  await t.until(() => m.value === '', 8000);
  w.setTimeout = st0;
  const seq = plan.map(x => x.ms);
  ok(seq[0] === 400, '3 按下以后先停 400 毫秒 ' + seq.slice(0, 4).join(','));
  ok(plan.filter(x => x.ms === 50).every(x => x.at - t0 >= 1000) && plan.filter(x => x.ms === 100).every(x => x.at - t0 < 1000 + 5), '3 按住不到 1 秒每 100 毫秒一个，超过 1 秒每 50 毫秒一个');
  ok(seq.includes(100) && seq.includes(50), '3 两档都用上了 ' + seq.join(','));
  pe('pointerup', 5, 5);
  ok(!del().classList.contains('kp-pressed'), '3 松手停下');

  // 4. 中途松手：停在对的位置，不再多删
  m.value = ''; keys('987654321');
  press(); await wait(650); pe('pointerup', 5, 5);
  const v4 = m.value;
  await wait(400);
  ok(v4.length >= 3 && v4.length <= 7 && m.value === v4 && '987654321'.indexOf(v4) === 0, '4 中途松手：停在 ' + v4 + '，之后不再删');
  del().click();   // 补的 click 不多删
  ok(m.value === v4, '4 松手补的那一下 click 不多删');

  // 5. 手指滑出按键：停
  m.value = ''; keys('55555555');
  del().getBoundingClientRect = () => ({ left: 0, top: 0, right: 60, bottom: 50, width: 60, height: 50 });
  press(); await wait(500);
  const before = m.value;
  pe('pointermove', 200, 200);   // 滑出去
  await wait(400);
  ok(m.value === before && !del().classList.contains('kp-pressed'), '5 手指滑出按键：立刻停（停在 ' + before + '）');
  pe('pointerup', 200, 200);

  // 6. 长按时键盘被关掉（返回键等）：停下
  m.value = ''; keys('77777777');
  press(); await wait(450);
  w.kpClose();
  const v6 = m.value; await wait(400);
  ok(m.value === v6, '6 长按中数字键盘关了：停下');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
