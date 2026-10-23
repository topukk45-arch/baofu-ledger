// 1019-H 分类汇总能滑但看不出来：框右下角的小圆钮（jsdom，记录全是虚构的）。node zZzG-cat-hint.test.js [index.html]
// 分类超过 6 个、框里装不下才有；卡片从屏幕外回到屏幕上冒一次（一直在屏幕上不冒）；在框里滑时出现；停 0.8 秒淡出（不改 1.5 秒的 FAB_IDLE）；
// 滑到框底换成 ↑、点了回框顶；中间点 ↓ 往下翻一屏；这次打开 App 滑到过底就不再做进屏幕提示；设置里「滑动提示」关掉就不出现。
// jsdom 没有布局：框的高度、IntersectionObserver 都在页面里装成假的（真浏览器里的样子见提交说明）。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const CATS = ['未分类', '吃饭', '购物', '出行', '日用', '娱乐', '房租', '医疗', '学习', '运动', '宠物'];
const recs = CATS.slice(1).map((c, i) => ({ id: 'r' + i, time: `2026-12-${String(1 + i).padStart(2, '0')}T12:00`, money: 10 + i, type: 'expense', cat: c, remark: '虚构' }));
const wait = ms => new Promise(r => setTimeout(r, ms));

async function bootHint(rs, cats, ls) {
  return A.boot({ html, www: WWW, seed: Object.assign(A.seedOf(rs, cats), ls || {}), before(w) {
    w.__io = [];
    w.IntersectionObserver = class { constructor(cb) { this.cb = cb; w.__io.push(this); } observe(el) { this.el = el; } disconnect() {} };
    // 框高 212、一行 36：装得下 5 行多一点；scrollTop 照常能设
    const P = w.HTMLElement.prototype, gh = Object.getOwnPropertyDescriptor(P, 'scrollHeight'), ch = Object.getOwnPropertyDescriptor(P, 'clientHeight');
    Object.defineProperty(P, 'scrollHeight', { configurable: true, get() { return this.id === 'catStats' ? this.querySelectorAll('.cs-row').length * 36 : (gh ? gh.get.call(this) : 0); } });
    Object.defineProperty(P, 'clientHeight', { configurable: true, get() { return this.id === 'catStats' ? 212 : (ch ? ch.get.call(this) : 0); } });
    let st = 0;
    w.__setBoxScroll = el => Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => st, set: v => { st = Math.max(0, Math.min(v, el.scrollHeight - el.clientHeight)); } });
    w.Element.prototype.scrollTo = function (o) { this.scrollTop = typeof o === 'object' ? o.top : arguments[1]; this.dispatchEvent(new w.Event('scroll')); };
  } });
}
const see = (t, on) => { const io = t.w.__io.find(x => x.el && x.el.id === 'catStatsCard'); io.cb([{ isIntersecting: on, intersectionRatio: on ? 1 : 0 }]); };

(async () => {
  const t = await bootHint(recs, CATS);
  const { $, w, d } = t, hint = $('catStatsHint'), box = $('catStats');
  w.__setBoxScroll(box);
  d.querySelector('.tab-btn[data-tab="stats"]').click(); await t.idle();   // 1023-A：分类汇总搬去统计页
  ok(box.querySelectorAll('.cs-row').length === 10, '0 分类汇总 10 行');
  ok(hint && hint.classList.contains('ui-hit'), '0 有小圆钮，点击区域撑到 48');

  // 1. 卡片进屏幕：冒一次，0.8 秒后淡出
  see(t, true);
  ok(hint.classList.contains('show') && hint.textContent === '↓', '1 卡片进屏幕：冒出 ↓');
  await wait(600);
  ok(hint.classList.contains('show'), '1 0.6 秒还在');
  await wait(400);
  ok(!hint.classList.contains('show'), '1 0.8 秒后淡出（不是 1.5 秒）');
  // 卡片一直在屏幕上、滑的是整页：再收到「在屏幕上」也不冒
  see(t, true);
  ok(!hint.classList.contains('show'), '1 一直在屏幕上：不再冒');
  // 离开再回来：再冒一次
  see(t, false); see(t, true);
  ok(hint.classList.contains('show'), '1 离开屏幕再回来：又冒一次');
  await wait(900);

  // 2. 在框里滑：出现；中间点 ↓ 往下翻一屏
  box.scrollTop = 40; box.dispatchEvent(new w.Event('scroll'));
  ok(hint.classList.contains('show') && hint.textContent === '↓', '2 在框里滑：出现 ↓');
  hint.click();
  ok(box.scrollTop === 148, '2 点 ↓：往下翻一屏（到不了一整屏就停在框底）' + box.scrollTop);
  ok(hint.textContent === '↑', '2 滑到框底：变成 ↑');
  hint.click();
  ok(box.scrollTop === 0 && hint.textContent === '↓', '2 点 ↑：回到框顶');
  // 3. 滑到过底：这次打开 App 不再做进屏幕的提示
  await wait(900);
  see(t, false); see(t, true);
  ok(!hint.classList.contains('show'), '3 滑到过底以后：卡片再进屏幕也不冒');
  box.scrollTop = 20; box.dispatchEvent(new w.Event('scroll'));
  ok(hint.classList.contains('show'), '3 在框里滑照样出现');
  // 手指按在圆钮上不淡出
  hint.dispatchEvent(new w.Event('pointerdown'));
  await wait(1000);
  ok(hint.classList.contains('show'), '3 手指按着不淡出');
  hint.dispatchEvent(new w.Event('pointerup'));
  await wait(900);
  ok(!hint.classList.contains('show'), '3 松开 0.8 秒后淡出');
  // 共用的 FAB_IDLE 还是 1.5 秒
  ok(/const FAB_IDLE=1500;/.test(html) && /const HINT_IDLE=800/.test(html), '3 FAB_IDLE 仍是 1500，提示用 HINT_IDLE 800');

  // 4. 设置里关掉「滑动提示」：不出现；打开又有
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  [...$('scrollHintSeg').children].find(b => b.dataset.v === 'off').click();
  ok(w.localStorage.getItem('app_scroll_hint') === 'off' && $('scrollHintSeg').querySelector('.on').dataset.v === 'off', '4 关掉：存在这台手机上');
  d.querySelector('.tab-btn[data-tab="stats"]').click();
  box.scrollTop = 60; box.dispatchEvent(new w.Event('scroll'));
  ok(!hint.classList.contains('show'), '4 关掉以后：在框里滑也不出现');
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  [...$('scrollHintSeg').children].find(b => b.dataset.v === 'on').click();
  ok(!w.localStorage.getItem('app_scroll_hint'), '4 打开：默认值（不存）');
  await wait(1700); t.w.close();   // 1023-A：在统计页滑过，等圆钮淡出的计时器走完再关

  // 5. 分类不超过 6 个：不出现
  const t5 = await bootHint(recs.slice(0, 5), CATS.slice(0, 6));
  t5.w.__setBoxScroll(t5.$('catStats'));
  t5.d.querySelector('.tab-btn[data-tab="stats"]').click(); await t5.idle();
  see(t5, true);
  t5.$('catStats').scrollTop = 10; t5.$('catStats').dispatchEvent(new t5.w.Event('scroll'));
  ok(!t5.$('catStatsHint').classList.contains('show'), '5 只有 5 个分类：不出现');
  ok(t.errs.length === 0 && t5.errs.length === 0, '没有报错 ' + t.errs.concat(t5.errs).join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
