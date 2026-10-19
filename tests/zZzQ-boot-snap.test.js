// 1019-U 首屏快照（jsdom，账单、手记全是虚构的）。node zZzQ-boot-snap.test.js [index.html]
// 切到后台时把打开 App 会看到的那一页存一份（这台手机的 localStorage app_snap_<账号>，不进备份）；
// 下次打开时大脚本还没跑，先把快照原样画出来、告诉原生层收启动画面；真的首屏画好就拿掉。快照和真的首屏一字不差。
// 账本一改（记一笔）、换存档、导入、撤销、恢复、换主题、改默认页都删快照；不是同一天 / 同一版 / 默认页变了就不用；
// 屏幕上的样子不是打开时会看到的（翻到第 2 页、开着筛选）就不存。快照不进导出的备份。
// 速度在真浏览器里量（CPU 调慢 4 倍，3000 / 17000 条），见提交说明。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const NOW = '2026-10-20T10:00:00';
const recs = Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 19).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: i % 9 ? 'expense' : 'income', cat: ['吃饭', '购物', '其他'][i % 3], remark: '虚构' + i }));
const KEY = 'app_snap_' + A.ID;
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
const wx = (o, n) => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(n).padStart(19, '0') }, o));
const FILE = [['微信.csv', B.bill('wechat', [wx({ time: { y: 2026, mo: 10, d: 5, h: 12, mi: 0, s: 0 }, cp: '某虚构便利店', fen: 600 }, 1), wx({ time: { y: 2026, mo: 10, d: 6, h: 9, mi: 0, s: 0 }, cp: '某虚构书店', fen: 3600 }, 2)], { range: RANGE }).bytes]];

async function bootWith(ls, phone) {
  return A.boot({ html, www: WWW, seed: ls, phone, now: NOW, before(w) {
    w.__ready = [];
    w.Capacitor.Plugins.Launch = { ready() { w.__ready.push({ main: !!w.JiwenPerf, snap: !!w.document.getElementById('bootSnap') }); return Promise.resolve(); } };
    // 快照一画出来就记下：那时大脚本跑了没有、快照里写的是什么（早期那一段最后会写 window.__bootSnap，这里拦住那一下，同步记）
    let bs;
    Object.defineProperty(w, '__bootSnap', { configurable: true, get: () => bs, set(v) { bs = v; const s = w.document.getElementById('bootSnap');
      if (s && !w.__snapSeen) w.__snapSeen = { main: !!w.JiwenPerf, html: s.innerHTML, page: (s.querySelector('.tab-page') || {}).id, text: (s.querySelector('.tab-page') || s).textContent.replace(/\s+/g, '') }; } });
    const mo = new w.MutationObserver(() => {
      const m = w.document.getElementById('mainBox');
      if (m && m.style.display === 'block' && !w.__real) { const pl = w.document.getElementById('pageLedger'); w.__real = { text: pl ? pl.textContent.replace(/\s+/g, '') : '' }; }
    });
    mo.observe(w.document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  } });
}
const hide = async t => { t.w.dispatchEvent(new t.w.Event('pagehide')); await t.idle(); };
async function reopen(t, tweak) {
  await hide(t);
  const ls = {}; for (let i = 0; i < t.w.localStorage.length; i++) { const k = t.w.localStorage.key(i); if (!/^store_/.test(k)) ls[k] = t.w.localStorage.getItem(k); }
  if (tweak) tweak(ls);
  t.w.close();
  const t2 = await bootWith(ls, t.phone);
  await new Promise(r => setTimeout(r, 30)); await t2.idle();
  return t2;
}
const tab = (t, n) => t.d.querySelector('.tab-btn[data-tab="' + n + '"]').click();
const snap = t => { try { return JSON.parse(t.w.localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };

(async () => {
  // 1. 切到后台：存快照（只有主界面那一页、底栏、操作栏，不带登录框和各个弹窗）
  let t = await bootWith(A.seedOf(recs, null, null), null);
  tab(t, 'ledger');
  ok(!snap(t), '1 刚打开：还没有快照');
  await hide(t);
  const s1 = snap(t);
  ok(s1 && s1.v === 1 && s1.tab === 'ledger' && s1.pref === 'ledger' && s1.build === t.$('loginBuild').textContent && s1.day === '2026-10-20', '1 切到后台：存了快照（记账页、这一版、今天）');
  const tmp = t.d.createElement('div'); tmp.innerHTML = s1.html;
  ok(tmp.querySelector('#mainBox') && tmp.querySelector('#pageLedger') && tmp.querySelector('#tabBar') && tmp.querySelector('#actionBar'), '1 快照里有主界面、记账页、底栏、底部操作栏');
  ok(!tmp.querySelector('#loginBox') && !tmp.querySelector('.mask') && !tmp.querySelector('#pageStats') && !tmp.querySelector('#pageSettings'), '1 不带登录框、弹窗、别的页');
  ok(s1.html.length < 400000, '1 大小有上限 ' + s1.html.length);

  // 2. 重新打开：大脚本跑之前就画出快照、告诉原生层收启动画面；真的画好以后拿掉；快照和真的一字不差
  t = await reopen(t);
  const seen = t.w.__snapSeen;
  ok(seen && seen.main === false && seen.page === 'pageLedger', '2 重新打开：大脚本还没跑，快照就画出来了');
  ok(t.w.__ready.length >= 1 && t.w.__ready[0].snap === true, '2 快照还在屏幕上时就告诉原生层收启动画面（真浏览器里是快照画出来那一帧，jsdom 的下一帧在大脚本之后）');
  ok(!t.$('bootSnap'), '2 真的首屏画好以后快照拿掉了');
  ok(seen && t.w.__real && seen.text === t.w.__real.text && seen.text.length > 50, '2 快照和真的首屏一字不差（结余、分类汇总、账单列表）');
  ok(!snap(t), '2 打开以后（进账号写了一次存档）旧快照删了，下次切后台再存');

  // 3. 改了账本（记一笔）：快照删掉；切后台再存的是新的
  tab(t, 'ledger');
  await hide(t);
  ok(snap(t), '3 切后台：又存上了');
  t.$('fabAdd').click(); await new Promise(r => setTimeout(r, 420)); t.w.kpClose();
  t.$('billMoney').value = '12.5';
  [...t.$('billTypeChips').children].find(c => c.textContent === '支出').click();
  [...t.$('billCatChips').children].find(c => c.textContent === '吃饭').click();
  t.$('addBill').click(); await t.idle();
  ok(!snap(t), '3 记了一笔：快照删掉');
  await hide(t);
  ok(snap(t) && /共\s*(<[^>]*>)?\s*41\s*(<[^>]*>)?\s*条/.test(snap(t).html), '3 再切后台：存的是新的（共 41 条）');
  t = await reopen(t);
  ok(t.w.__snapSeen && t.w.__real && t.w.__snapSeen.text === t.w.__real.text, '3 再打开：快照还是和真的一字不差（多了那一笔）');

  // 4. 换存档、改默认页、换主题：都删
  tab(t, 'ledger'); await hide(t); ok(snap(t), '4 有快照');
  t.$('newArchive').click(); t.$('askInput').value = '虚构存档二'; t.$('askOk').click(); await t.idle();
  ok(!snap(t), '4 新建并切到别的存档：快照删掉');
  const sel = t.$('archiveSelect'); sel.value = '默认存档'; sel.dispatchEvent(new t.w.Event('change')); await t.idle();
  tab(t, 'ledger'); await hide(t); ok(snap(t), '4 切回来、切后台：又有了');
  tab(t, 'settings');
  [...t.$('defaultTabSeg').children].find(b => b.dataset.v === 'stats').click();
  ok(!snap(t), '4 改默认进入页面：快照删掉');
  [...t.$('defaultTabSeg').children].find(b => b.dataset.v === 'ledger').click();
  await hide(t); ok(snap(t), '4 切后台：又有了');
  t.$('themeBtn').click(); await t.idle();
  [...t.$('themePresets').children][1].click();
  ok(!snap(t), '4 换主题：快照删掉');
  t.$('themeMask').style.display = 'none';

  // 5. 导入、撤销、恢复备份：都删（导入入口在开发开关里）
  await hide(t); ok(snap(t), '5 有快照');
  await t.importFiles(FILE);
  ok(!snap(t), '5 导入：快照删掉');
  await hide(t); ok(snap(t), '5 切后台：又有了');
  const lg = (await t.st().importsRead()).pop();
  await t.st().undo(await t.st().undoPlan(lg.b));
  ok(!snap(t), '5 撤销导入：快照删掉');
  await hide(t); ok(snap(t), '5 切后台：又有了');
  const L = await t.st().backupList(); const bk = L.list[0]; const d = await t.st().backupDiff(bk.key);
  await t.st().restoreBackup(bk.key, { ver: d.ver });
  ok(!snap(t), '5 恢复备份：快照删掉');

  // 6. 不用的情况：不是同一天、不是同一版、默认页变了、宽度变了
  tab(t, 'ledger'); await hide(t);
  const variants = [['第二天', ls => { const o = JSON.parse(ls[KEY]); o.day = '2026-10-19'; ls[KEY] = JSON.stringify(o); }],
    ['别的版本', ls => { const o = JSON.parse(ls[KEY]); o.build = 'build 1019-A'; ls[KEY] = JSON.stringify(o); }],
    ['默认页变了', ls => { ls.app_default_tab = 'stats'; }],
    ['屏幕宽度变了', ls => { const o = JSON.parse(ls[KEY]); o.w = 123; ls[KEY] = JSON.stringify(o); }]];
  for (const [name, fn] of variants) {
    const t3 = await reopen(t, fn);
    ok(!t3.w.__snapSeen && t3.w.__ready.length >= 1, `6 ${name}：不画快照（照常打开，首屏画好再收启动画面）`);
    t = t3; tab(t, 'ledger'); if (name === '默认页变了') { tab(t, 'settings'); [...t.$('defaultTabSeg').children].find(b => b.dataset.v === 'ledger').click(); tab(t, 'ledger'); }
    await hide(t);
  }

  // 7. 屏幕上的不是打开时会看到的：不存
  t.w.goPage(1, 'top'); await hide(t);
  ok(!snap(t), '7 翻到第 2 页（打开时是第 1 页）：不存');
  t.w.goPage(-1, 'top');
  t.$('filterFab').click(); t.$('searchKeyword').value = '虚构1'; t.$('sheetApply').click(); await t.idle();
  ok(t.w.__filterActive(), '7 筛选生效了');
  await hide(t);
  ok(!snap(t), '7 开着筛选（打开时会清掉）：不存');
  t.$('clearFilterFab').click(); await t.idle();
  ok(!t.w.__filterActive(), '7 清掉筛选');
  // 「上次停留」：照原来的页码和位置存
  t.w.localStorage.setItem('app_default_tab', 'last');
  t.w.goPage(1, 'top'); await hide(t);
  ok(snap(t) && snap(t).pref === 'last' && snap(t).page === 2, '7 选了「上次停留」：第 2 页也存（打开时回到这一页）');

  // 8. 快照不进导出的备份
  tab(t, 'ledger'); await hide(t); ok(snap(t), '8 有快照');
  tab(t, 'settings'); t.w.__files.length = 0;
  t.$('exportBtn').click(); await t.until(() => t.w.__files.length);
  const exp = String(t.w.__files[0] || '');
  ok(exp.length > 0 && !/app_snap_|boot-snap|bootSnap/.test(exp), '8 导出的备份里没有快照');
  ok(!/app_snap_|boot-snap/.test(JSON.stringify(t.w.odBuildPayload())), '8 云备份内容里没有快照');

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
