// 1019-L 设置里「打开 App 默认进哪个页面」永远优先（jsdom，记录全是虚构的）。node zZzI-default-tab.test.js [index.html]
// 原来 1019-F 不管设置，离开 2 小时内都回到上次的页面，把设置盖掉了。现在：统计 / 记账 / 设置 照设置进；
// 多一个「上次停留」才回到上次的页签、页码、滚动位置；不管选哪个，填到一半的记一笔照旧接着来；老用户原来选的不变。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = Array.from({ length: 160 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 28).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: 'expense', cat: '吃饭', remark: '虚构' + i }));
const NOW = '2026-12-20T10:00:00';
const AT = new Date(NOW).getTime();

// 冷启动：localStorage 里放好「上次停在设置页第 1 页」「上次停在账单页第 3 页、滚到 900」这类记录，看主界面刚出来时在哪
async function coldBoot(extra) {
  const seed = Object.assign(A.seedOf(recs), extra);
  const t = await A.boot({ html, www: WWW, seed, now: NOW, before(w) {
    w.__y = 0; w.__calls = [];
    Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
    w.scrollTo = (x, y) => { const v = typeof x === 'object' ? x.top : y; w.__calls.push(v); w.__y = v; };
    const mo = new w.MutationObserver(() => { const m = w.document.getElementById('mainBox'); if (m && m.style.display === 'block' && !w.__first) {
      const a = w.document.querySelector('.tab-btn.active'), pi = w.document.querySelector('#pagerBottom .page-info');
      w.__first = { tab: a && a.dataset.tab, page: pi ? pi.textContent : '' }; mo.disconnect(); } });
    mo.observe(w.document, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  } });
  return t;
}
const resume = (tab, page, y, ageMs) => ({ ['app_resume_' + A.ID]: JSON.stringify({ tab, page, y, archive: '默认存档', at: AT - (ageMs || 0) }) });

(async () => {
  // 1. 选了统计 / 记账 / 设置：照设置进，上次停在别的页也不管
  for (const [pref, last] of [['stats', 'settings'], ['ledger', 'stats'], ['settings', 'ledger']]) {
    const t = await coldBoot(Object.assign({ app_default_tab: pref }, resume(last, 3, 900)));
    ok(t.w.__first.tab === pref, `1 默认页选「${pref}」、上次停在「${last}」：进「${pref}」`);
    ok(!(t.w.__calls[0] === 900), `1 选「${pref}」：不放回上次的滚动位置`);
    t.w.close();
  }
  // 2. 没设过：照旧进记账
  {
    const t = await coldBoot(resume('stats', 1, 0));
    ok(t.w.__first.tab === 'ledger', '2 没设过默认页：进记账（不回上次的统计页）');
    t.w.close();
  }
  // 3. 选「上次停留」：回到上次的页签、页码、滚动位置
  {
    const t = await coldBoot(Object.assign({ app_default_tab: 'last' }, resume('ledger', 3, 900)));
    ok(t.w.__first.tab === 'ledger' && t.w.__calls[0] === 900, '3 「上次停留」：账单页、滚到 900（1023-C 起没有页码，存的 page 不用了） ' + JSON.stringify(t.w.__calls));
    t.w.close();
    const t2 = await coldBoot(Object.assign({ app_default_tab: 'last' }, resume('stats', 1, 0)));
    ok(t2.w.__first.tab === 'stats', '3 「上次停留」：上次停在统计页就进统计页');
    t2.w.close();
    // 离开超过 2 小时：还是回到上次的页签，页码和位置从头开始
    const t3 = await coldBoot(Object.assign({ app_default_tab: 'last' }, resume('ledger', 3, 900, 3 * 3600 * 1000)));
    ok(t3.w.__first.tab === 'ledger' && t3.w.__calls[0] !== 900, '3 「上次停留」离开 3 小时：回到账单页、不放回位置');
    t3.w.close();
  }
  // 4. 设置页上：四个选项，选「上次停留」存 last
  {
    const t = await coldBoot({});
    const seg = t.$('defaultTabSeg');
    ok([...seg.children].map(b => b.dataset.v).join() === 'stats,ledger,settings,last' && /上次停留/.test(seg.textContent), '4 设置里四个选项，多了「上次停留」');
    [...seg.children].find(b => b.dataset.v === 'last').click();
    ok(t.w.localStorage.getItem('app_default_tab') === 'last' && seg.querySelector('.on').dataset.v === 'last', '4 点「上次停留」：存成 last、高亮');
    t.w.close();
  }
  // 5. 不管选哪个，填到一半的记一笔照旧接着来
  {
    const draft = { ['app_formdraft_' + A.ID]: JSON.stringify({ kind: 'add', archive: '默认存档', at: AT, v: { time: '2026-12-20T09:00', money: '42', cat: '吃饭', type: 'expense', mode: 'normal', remark: '虚构的半截' } }) };
    const t = await coldBoot(Object.assign({ app_default_tab: 'stats' }, resume('ledger', 2, 300), draft));
    await new Promise(r => setTimeout(r, 20)); await t.idle();
    ok(t.w.__first.tab === 'stats', '5 默认页统计：进统计');
    ok(t.$('addMask').style.display === 'flex' && t.$('billMoney').value === '42' && t.$('billRemark').value === '虚构的半截', '5 填到一半的记一笔照旧重新打开接着填');
    t.w.close();
  }
  // 6. 老用户：原来选的默认页（统计）升级后不变
  {
    const t = await coldBoot({ app_default_tab: 'stats' });
    ok(t.w.__first.tab === 'stats' && t.w.localStorage.getItem('app_default_tab') === 'stats', '6 老用户原来选的统计：照旧');
    t.w.close();
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
