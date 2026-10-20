// 1020-B 停下来就先存（jsdom，账单、手记全是虚构的）。node -r ./tools/inline-hook.js zZzY-idle-save.test.js [index.html]
// 手机上 localStorage 写进去以后要过几秒才真的落盘，切到后台马上被划掉，切后台那一下存的就丢了。
// 所以页面停下来（约 1.5 秒没有操作）先存一份首屏快照和「停在哪」，记一笔 / 修改填过东西、停下来 1 秒先存一份填到一半的；
// 这里模拟「切后台以后马上被杀」：切后台那一次什么都不存（不发 pagehide / visibilitychange），重开照样用上停下来时存的那份。
// 停下来存的时候照现在的条件判断（开着筛选就删掉），和上次一样的不重写；性能记录「启动」写快照怎么存的、没用上的写原因。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const NOW = '2026-10-20T10:00:00';
const recs = Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, time: `2026-10-${String(1 + i % 19).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}`, money: 10 + i, type: i % 9 ? 'expense' : 'income', cat: ['吃饭', '购物', '其他'][i % 3], remark: '虚构' + i }));
const KEY = 'app_snap_' + A.ID, FKEY = 'app_formdraft_' + A.ID, RKEY = 'app_resume_' + A.ID;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function bootWith(ls, phone) {
  return A.boot({ html, www: WWW, seed: ls, phone, now: NOW, before(w) {
    w.Capacitor.Plugins.Launch = { ready() { return Promise.resolve(); } };
    // 数一数每个键写了几次
    w.__writes = {};
    const set = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function (k, v) { w.__writes[k] = (w.__writes[k] || 0) + 1; return set.call(this, k, v); };
    let bs;
    Object.defineProperty(w, '__bootSnap', { configurable: true, get: () => bs, set(v) { bs = v; if (!w.__snapSeen) w.__snapSeen = Object.assign({}, v); } });
  } });
}
// 被杀：切后台那一下什么都没来得及存（不发 pagehide），手机里留下的就是停下来时存的
async function reopenKilled(t, tweak) {
  const ls = {}; for (let i = 0; i < t.w.localStorage.length; i++) { const k = t.w.localStorage.key(i); if (!/^store_/.test(k)) ls[k] = t.w.localStorage.getItem(k); }
  if (tweak) tweak(ls);
  t.w.close();
  const t2 = await bootWith(ls, t.phone);
  await wait(30); await t2.idle();
  return t2;
}
const tab = (t, n) => t.d.querySelector('.tab-btn[data-tab="' + n + '"]').click();
const poke = t => t.d.body.dispatchEvent(new t.w.Event('pointerdown', { bubbles: true }));
const snap = t => { try { return JSON.parse(t.w.localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
const perfLast = t => { try { const a = JSON.parse(t.w.localStorage.getItem('app_perf_log') || '[]'); return a.filter(e => e.kind === '启动').pop(); } catch (_) { return null; } };

(async () => {
  // 1. 停下来 1.5 秒：先存快照和「停在哪」（不用等切后台）
  let t = await bootWith(A.seedOf(recs, null, null), null);
  tab(t, 'ledger'); poke(t);
  await wait(600);
  ok(!snap(t), '1 刚点完、还没停够 1.5 秒：还没存');
  await wait(1200);
  const s1 = snap(t);
  ok(s1 && s1.src === 'idle' && s1.tab === 'ledger', '1 停下来 1.5 秒：存了快照（停下来时存的）');
  ok(!!t.w.localStorage.getItem(RKEY), '1 「停在哪」也存了');

  // 2. 和上次一样的不重写：再点几下、再停几次，快照只写过一次
  const n0 = t.w.__writes[KEY] || 0;
  for (let i = 0; i < 3; i++) { poke(t); await wait(1700); }
  ok((t.w.__writes[KEY] || 0) === n0 && n0 === 1, `2 页面没变：停了几次也只写过一次（写了 ${t.w.__writes[KEY]} 次）`);
  ok((t.w.__writes[RKEY] || 0) <= 2, `2 「停在哪」没变也不重写（写了 ${t.w.__writes[RKEY]} 次）`);

  // 3. 切后台以后马上被杀（切后台那次没存）：重开照样用上停下来时存的那份
  t = await reopenKilled(t);
  ok(t.w.__snapSeen && t.w.__snapSeen.src === 'idle', '3 被杀以后重开：用上了停下来时存的快照');
  const p3 = perfLast(t);
  ok(p3 && p3.snap != null && p3.snapSrc === 'idle' && p3.snapAge != null && !p3.snapMiss, '3 性能记录「启动」记下快照是停下来时存的、存了多久');

  // 4. 账本改了：快照删掉；停下来以后按新的样子再存（不用切后台）
  tab(t, 'ledger'); poke(t); await wait(1700);
  ok(snap(t), '4 有快照');
  t.$('fabAdd').click(); await wait(420); t.w.kpClose();
  t.$('billMoney').value = '12.5';
  [...t.$('billTypeChips').children].find(c => c.textContent === '支出').click();
  [...t.$('billCatChips').children].find(c => c.textContent === '吃饭').click();
  t.$('addBill').click(); await t.idle();
  ok(!snap(t), '4 记了一笔：快照删掉');
  await wait(1700);
  ok(snap(t) && snap(t).src === 'idle' && /共\s*(<[^>]*>)?\s*41\s*(<[^>]*>)?\s*条/.test(snap(t).html), '4 停下来：存的是新的（共 41 条），没切后台');

  // 5. 停下来时照现在的条件判断：开着筛选（打开时会清掉）→ 删掉
  t.$('filterFab').click(); t.$('searchKeyword').value = '虚构1'; t.$('sheetApply').click(); await t.idle();
  ok(t.w.__filterActive(), '5 筛选生效了');
  poke(t); await wait(1700);
  ok(!snap(t), '5 开着筛选停下来：快照删掉（不存错的）');
  t.$('clearFilterFab').click(); await t.idle(); poke(t); await wait(1700);
  ok(snap(t), '5 清掉筛选、停下来：又存上了');

  // 6. 记一笔填到一半、停下来 1 秒：先存一份；被杀以后重开接着填
  t.$('fabAdd').click(); await wait(420); t.w.kpClose();
  t.$('billMoney').value = '66.6'; t.$('billMoney').dispatchEvent(new t.w.Event('input', { bubbles: true }));
  [...t.$('billTypeChips').children].find(c => c.textContent === '支出').click();
  await wait(400);
  ok(!t.w.localStorage.getItem(FKEY), '6 刚填、还没停够 1 秒：还没存');
  await wait(900);
  let f = null; try { f = JSON.parse(t.w.localStorage.getItem(FKEY) || 'null'); } catch (_) {}
  ok(f && f.kind === 'add' && f.v.money === '66.6' && f.v.type === 'expense', '6 停下来 1 秒：填到一半的存了（66.6、支出）');
  const nf = t.w.__writes[FKEY] || 0;
  poke(t); await wait(1200);
  ok((t.w.__writes[FKEY] || 0) === nf, '6 没再改：不重写');
  t = await reopenKilled(t);
  ok(t.$('addMask').style.display === 'flex' && t.$('billMoney').value === '66.6', '6 被杀以后重开：记一笔重新打开、金额接着是 66.6');
  // 关掉（放弃）就删；再打开填一样的也照样存回来（关的时候别处删了它）
  t.$('addMask').querySelector('.rec-foot .ui-btn:not(.primary)') ? t.$('addMask').querySelector('.rec-foot .ui-btn:not(.primary)').click() : t.$('addMask').style.display = 'none';
  await t.idle(); await wait(50);
  ok(!t.w.localStorage.getItem(FKEY), '6 关掉记一笔：填到一半的删掉');

  // 7. 没用上快照：性能记录写原因
  tab(t, 'ledger'); poke(t); await wait(1700);
  const cases = [['不是今天存的', 'day', ls => { const o = JSON.parse(ls[KEY]); o.day = '2026-10-19'; ls[KEY] = JSON.stringify(o); }],
    ['版本不对', 'build', ls => { const o = JSON.parse(ls[KEY]); o.build = 'build 1019-A'; ls[KEY] = JSON.stringify(o); }],
    ['默认进入页面不一样', 'pref', ls => { ls.app_default_tab = 'stats'; }],
    ['屏幕宽度不一样', 'width', ls => { const o = JSON.parse(ls[KEY]); o.w = 123; ls[KEY] = JSON.stringify(o); }],
    ['没有快照', 'none', ls => { delete ls[KEY]; }]];
  for (const [name, k, fn] of cases) {
    if (!snap(t)) { tab(t, 'ledger'); poke(t); await wait(1700); }
    t = await reopenKilled(t, fn);
    const p = perfLast(t);
    ok(!t.w.__snapSeen && p && p.snapMiss === k, `7 ${name}：不画快照，性能记录写原因 ${p && p.snapMiss}`);
    t.w.openPerfPage(); await wait(20);
    const txt = t.d.body.textContent;
    ok(txt.indexOf('没用上快照：' + name) >= 0, `7 ${name}：性能记录页上写「没用上快照：${name}」`);
    t.w.JiwenSheet.close && t.w.JiwenSheet.close();
    if (k === 'pref') { tab(t, 'settings'); [...t.$('defaultTabSeg').children].find(b => b.dataset.v === 'ledger').click(); }
    tab(t, 'ledger'); poke(t); await wait(1700);
  }

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
