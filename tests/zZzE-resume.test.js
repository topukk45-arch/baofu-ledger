// 1019-F 切到后台被系统杀掉，回来看不出来（jsdom，记录全是虚构的）。node zZzE-resume.test.js [index.html]
// 切到后台时记下停在哪个页签、账单页第几页、滚到哪，和记一笔 / 修改账单填到一半的；
// 下次打开 App 自动登录、离开不到 2 小时就直接回去，填到一半的重新打开接着填。「被杀」= 同一个库、同一份 localStorage 重新起一个页面。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = Array.from({ length: 160 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 28).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: 'expense', cat: '吃饭', remark: '虚构' + i }));
const NOW = '2026-12-20T10:00:00';

async function bootWith(ls, phone) {
  return A.boot({ html, www: WWW, seed: ls, phone, now: NOW, before(w) {
    w.__y = 0; w.__calls = [];
    Object.defineProperty(w, 'scrollY', { get: () => w.__y, configurable: true });
    w.scrollTo = (x, y) => { const v = typeof x === 'object' ? x.top : y; w.__calls.push(v); w.__y = v; };
    // 测试工具起好页面以后会点一下「设置」页签，所以在主界面刚出来那一刻记下停在哪、滚到哪
    const mo = new w.MutationObserver(() => { const m = w.document.getElementById('mainBox'); if (m && m.style.display === 'block' && !w.__first) {
      const a = w.document.querySelector('.tab-btn.active'), pi = w.document.querySelector('#pagerBottom .page-info');
      w.__first = { tab: a && a.dataset.tab, page: pi ? pi.textContent : '', calls: w.__calls.slice() }; mo.disconnect(); } });
    mo.observe(w.document, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  } });
}
// 「切到后台被杀」：发 pagehide，把 localStorage 原样带到下一次启动（账本在同一个库里，不再从 localStorage 搬）
async function killAndReopen(t, tweak) {
  t.w.dispatchEvent(new t.w.Event('pagehide'));
  await t.idle();
  const ls = {}; for (let i = 0; i < t.w.localStorage.length; i++) { const k = t.w.localStorage.key(i); if (!/^store_/.test(k)) ls[k] = t.w.localStorage.getItem(k); }
  if (tweak) tweak(ls);
  t.w.close();
  const t2 = await bootWith(ls, t.phone);
  await new Promise(r => setTimeout(r, 20)); await t2.idle();
  return t2;
}
const activeTab = t => t.w.__first && t.w.__first.tab;
const tab = (t, n) => t.d.querySelector('.tab-btn[data-tab="' + n + '"]').click();

(async () => {
  // 1. 停在统计页 → 被杀 → 回来还是统计页（默认页是账单）
  // 1019-L 起要在设置里选「上次停留的页面」才回到上次的页签 / 页码 / 位置（这里先选好；别的选项见 zZzI-default-tab）
  let t = await bootWith(A.seedOf(recs, null, null), null);
  t.w.localStorage.setItem('app_default_tab', 'last');
  tab(t, 'stats');
  t = await killAndReopen(t);
  ok(activeTab(t) === 'stats', '1 回来还在统计页');

  // 2. 账单页第 3 页、滚到 1200 → 被杀 → 回来第 3 页、放回 1200
  tab(t, 'ledger');
  t.w.JiwenLedger.goPage(1, 'top'); t.w.JiwenLedger.goPage(1, 'top');
  const pg = t => t.$('pagerBottom').querySelector('.page-info').textContent;
  ok(/^第 ?3 ?页|^3 ?\//.test(pg(t)) || /3/.test(pg(t).split('/')[0]), '2 翻到第 3 页：' + pg(t));
  t.w.__y = 1200;
  t = await killAndReopen(t);
  ok(activeTab(t) === 'ledger', '2 回来在账单页');
  ok(/3/.test(pg(t).split('/')[0]), '2 还是第 3 页：' + pg(t));
  ok(t.w.__calls[0] === 1200, '2 滚动位置直接放回 1200，不先回顶上（后面的 0 是测试工具点了「设置」）' + JSON.stringify(t.w.__calls));

  // 3. 离开超过 2 小时：1019-L 起（选了「上次停留」）还是回到上次的页签，只是页码、位置从头开始
  tab(t, 'stats');
  t = await killAndReopen(t, ls => { const k = 'app_resume_' + A.ID; const r = JSON.parse(ls[k]); r.at = new Date(NOW).getTime() - 3 * 3600 * 1000; ls[k] = JSON.stringify(r); });
  ok(activeTab(t) === 'stats', '3 离开超过 2 小时：选了「上次停留」照样回到上次的页签（统计）');

  // 4. 记一笔填到一半 → 被杀 → 回来接着填，关的时候照样问「放弃这次填写？」
  tab(t, 'ledger');
  t.$('fabAdd').click(); await t.idle();
  t.$('billMoney').value = '36.5';
  [...t.$('billCatChips').children].find(c => c.textContent === '购物').click();
  [...t.$('billTypeChips').children].find(c => c.textContent === '支出').click();
  t.$('billRemark').value = '虚构的半截备注';
  t = await killAndReopen(t);
  ok(t.$('addMask').style.display === 'flex', '4 回来记一笔还开着');
  ok(t.$('billMoney').value === '36.5' && t.$('billRemark').value === '虚构的半截备注', '4 金额、备注都在');
  ok([...t.$('billCatChips').children].some(c => c.textContent === '购物' && c.classList.contains('sel')) && [...t.$('billTypeChips').children].some(c => c.textContent === '支出' && c.classList.contains('sel-out')), '4 分类、收支都选着');
  await t.back();
  ok(t.ask() && t.ask().title === '放弃这次填写？', '4 恢复出来的算填过：按返回先问');
  await t.askCancel();
  t.$('addBill').click(); await t.idle();
  ok(t.recs().some(r => r.remark === '虚构的半截备注' && r.money === 36.5 && r.cat === '购物'), '4 接着填完能存');
  if (t.ask()) await t.askCancel();
  ok(!t.w.localStorage.getItem('app_formdraft_' + A.ID), '4 存完草稿删掉');

  // 5. 没填过的记一笔：不留草稿，回来不重开
  t.$('fabAdd').click(); await t.idle();
  t = await killAndReopen(t);
  ok(t.$('addMask').style.display !== 'flex', '5 没填过：回来不重开记一笔');

  // 6. 修改账单改到一半 → 被杀 → 回来接着改
  t.w.openEdit('r5'); await t.idle();
  t.$('editRemark').value = '虚构5（改了一半）';
  t = await killAndReopen(t);
  ok(t.$('editMask').style.display === 'flex' && t.$('editRemark').value === '虚构5（改了一半）', '6 回来修改账单还开着、改的还在');
  t.$('cancelEdit').click(); await t.idle();
  ok(!t.w.localStorage.getItem('app_formdraft_' + A.ID) && t.recs().find(r => r.id === 'r5').remark === '虚构5', '6 点取消：草稿删掉、记录没改');

  // 7. 不进备份：两个键都在 localStorage，导出的备份里没有
  t.w.__files.length = 0; t.$('exportBtn').click(); await t.until(() => t.w.__files.length, 5000); await t.idle();
  const bk = String(t.w.__files[t.w.__files.length - 1] || '');
  ok(bk.length > 100 && !/app_resume_|app_formdraft_|改了一半/.test(bk), '7 导出的备份里没有它们（' + bk.length + ' 字）');
  if (t.ask()) await t.askOk();

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
