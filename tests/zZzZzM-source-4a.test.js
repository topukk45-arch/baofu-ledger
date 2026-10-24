// 导入简化 4a：导入后的来源标识和操作。账单页顶部横幅「刚导入微信账单 N 条（…）· 查看 · 撤销 ✕」（7 天、点掉就不再显示）；
//   列表第二行小字写来源（已对账 / 微信 / 支付宝 / 微信 · 几笔合成，自己记的不写）；搜一笔加「来源」条件（手记 / 微信 / 支付宝 / 已对账）和「那次导入」；
//   改导入的记录的金额 / 时间先提醒（能「以后不再提醒」），改分类、备注不提醒。都在开发开关后面。jsdom 真导，数据全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
let seq = 0;
const T = (d, h) => ({ y: 2026, mo: 10, d, h: h || 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '/', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const man = (id, d, money) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T12:00`, money, type: 'expense', cat: '吃饭', remark: '虚构手记' + id });
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([man('m1', 5, 28), man('m2', 15, 9)]), now: '2026-10-21T10:00:00' });
  const $ = id => t.d.getElementById(id);
  await t.importFiles([['微信.csv', B.bill('wechat', [wx({ time: T(5, 12), cp: '某虚构面馆', fen: 2800 }), wx({ time: T(8), cp: '某虚构书店', fen: 3600 }), wx({ time: T(10), cp: '某虚构花店', fen: 4100 })], { range: RANGE }).bytes]]);
  const lg = (await t.logs()).pop();
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle(); await tick(80);
  // ===== 1. 横幅 =====
  const bn = $('impBanner');
  ok(bn && /^刚导入微信账单 2 条（10月1日–20日）/.test(bn.textContent) && $('impBannerView') && $('impBannerUndo') && $('impBannerOff'), '1 账单页顶上横幅「刚导入微信账单 2 条（10月1日–20日）· 查看 · 撤销 ✕」：' + (bn && bn.textContent));
  // ===== 2. 列表来源小字 =====
  t.w.JiwenLedger.listFlush();
  const sub = id => { const r = t.d.querySelector(`#billList .bl-row[data-id="${id}"]`); return r ? r.querySelector('.bl-sub').textContent : null; };
  const recs = t.recs(), shu = recs.find(r => r.batch === lg.b && Number(r.money) === 36);
  ok(/ · 已对账$/.test(sub('m1')), '2 已和账单合并的手记：第二行写「已对账」：' + sub('m1'));
  ok(sub('m2') && !/已对账|微信|支付宝/.test(sub('m2')), '2 自己记的、没对上账单：不写：' + sub('m2'));
  ok(shu && / · 微信$/.test(sub(shu.id)), '2 导入的：写「微信」：' + (shu && sub(shu.id)));
  ok(!t.d.querySelector('#billList .bl-src img, #billList .bl-src svg'), '2 用文字，不用图标');
  // ===== 3. 查看：搜一笔，条件是这一批 =====
  $('impBannerView').click(); await tick();
  t.w.JiwenSearch.searchFlush();
  ok(t.w.JiwenSearch.isOpen() && t.w.JiwenSearch.searchNow().batch === lg.b && /那次导入/.test($('searchTags').textContent) && $('searchList').querySelectorAll('.bl-row').length === 3, '3 「查看」：打开搜一笔，只看这一批（新建 2 条 + 合并的 1 条）');
  // 来源条件：手记 / 微信 / 已对账
  t.w.JiwenSearch.closeSearch(); await tick(300);
  $('filterFab').click(); await tick();
  ok(t.w.JiwenSearch.searchNow().batch === lg.b, '3 回到账单再点「搜一笔」：条件还在（和别的条件一样）');
  $('sheetClear').click();
  ok(!$('filterSrcRow').hidden, '3 搜一笔的抽屉里有「来源」（开发开关开着）');
  $('filterSrcRow').click();
  [...$('filterSrcChips').querySelectorAll('[data-v]')].find(b => b.dataset.v === 'manual').click();
  const hitIds = () => { t.w.JiwenSearch.searchFlush(); return [...$('searchList').querySelectorAll('.bl-row')].map(r => r.dataset.id); };
  { const h = hitIds(); ok(h.join() === 'm2', '3 来源「手记」：只有没对上账单的手记：' + h.join() + JSON.stringify(t.w.JiwenSearch.searchNow())); }
  [...$('filterSrcChips').querySelectorAll('[data-v]')].find(b => b.dataset.v === 'merged').click();
  ok(hitIds().sort().join() === 'm1,m2', '3 再加「已对账」：手记两条都在');
  [...$('filterSrcChips').querySelectorAll('[data-v]')].find(b => b.dataset.v === 'manual').click();
  [...$('filterSrcChips').querySelectorAll('[data-v]')].find(b => b.dataset.v === 'wechat').click();
  ok(hitIds().length === 3 && /来源：微信/.test($('searchTags').textContent) && /来源：已对账/.test($('searchTags').textContent), '3 「微信」+「已对账」：3 笔，条件写在小标签里');
  t.w.closeFilterSheet(); await tick();
  t.w.JiwenSearch.openSheet();
  const hist = $('filterHist').textContent;
  ok(/微信/.test(hist) && /已对账/.test(hist), '3 最近搜过记下来源：' + hist);
  t.w.JiwenSearch.closeSearch(); await tick(300);
  // ===== 4. 改金额 / 时间提醒；改分类、备注不提醒 =====
  t.w.openEdit(shu.id); await tick();
  $('editRemark').value = '改了备注'; $('saveEdit').click(); await t.idle();
  ok(!t.ask() && t.recs().find(r => r.id === shu.id).remark === '改了备注', '4 只改备注：不提醒，直接存');
  t.w.openEdit(shu.id); await tick();
  $('editMoney').value = '40'; $('saveEdit').click(); await tick();
  const a1 = t.ask();
  ok(a1 && /这笔是微信账单导入的，改了金额以后和账单对不上/.test(a1.msg) && $('askExtra').style.display !== 'none' && /以后不再提醒/.test($('askExtra').textContent), '4 改金额：先提醒，可以继续，可勾「以后不再提醒」：' + (a1 && a1.msg));
  await t.askCancel();
  ok(Number(t.recs().find(r => r.id === shu.id).money) === 36, '4 不继续：没改');
  $('saveEdit').click(); await tick(); await t.askOk();
  ok(Number(t.recs().find(r => r.id === shu.id).money) === 40, '4 继续保存：改了');
  t.w.openEdit('m1'); await tick();
  const dt = $('editTime'); t.w.JiwenDate.setDtInput(dt, '2026-10-05T13:00'); $('saveEdit').click(); await tick();
  ok(t.ask() && /这笔已经和微信账单对过账，改了时间以后/.test(t.ask().msg), '4 已对账的手记改时间：也提醒：' + (t.ask() && t.ask().msg));
  $('askExtra').click(); await t.idle();
  ok(t.recs().find(r => r.id === 'm1').time === '2026-10-05T13:00' && t.w.localStorage.getItem('app_imp_edit_warn_off') === '1', '4 「继续保存，以后不再提醒」：改了，记住不再提醒');
  t.w.openEdit(shu.id); await tick();
  $('editMoney').value = '41'; $('saveEdit').click(); await t.idle();
  ok(!t.ask() && Number(t.recs().find(r => r.id === shu.id).money) === 41, '4 以后不再提醒了');
  // ===== 5. 横幅点掉、7 天后消失；撤销走同一个 =====
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle(); await tick(80);
  $('impBannerUndo').click();
  await t.until(() => t.ask(), 8000);
  ok(t.ask() && /撤销/.test(t.ask().title || '') && t.w.JiwenImportUI.isOpen(), '5 横幅「撤销」：和导入记录里同一个（先确认）');
  await t.askCancel();
  t.w.JiwenImportUI.close(); await tick();
  t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle(); await tick(80);
  $('impBannerOff').click(); await tick();
  t.w.JiwenLedger.renderBill(); await t.idle(); await tick(80);
  ok(!$('impBanner') && t.w.localStorage.getItem(`app_imp_banner_${A.ID}__默认存档`) === lg.b, '5 点 ✕：不再显示（只在这台手机上记住）');
  {
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
    await t2.importFiles([['微信.csv', B.bill('wechat', [wx({ time: T(9) })], { range: RANGE }).bytes]]);
    const L = (await t2.logs()).pop();
    t2.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t2.idle(); await tick(80);
    ok(t2.d.getElementById('impBanner'), '5 刚导完有横幅');
    // 把导入时间改到 8 天前（7 天后自动消失）
    const u = t2.w.JiwenImportStore; const list = await u.importsRead(); list[list.length - 1].at = '2026-10-12T09:00';
    const st = t2.w.JiwenStore, tt = st.impTarget();
    await st.idbBatch([['put', st.impLogKey(tt.e.id, tt.aid), JSON.stringify({ v: 1, list })]]);
    t2.w.JiwenLedger.renderBill(); await t2.idle(); await tick(80);
    ok(!t2.d.getElementById('impBanner'), '5 超过 7 天：横幅不显示');
    // 开发开关关掉：横幅、来源小字都没有
    t2.w.localStorage.setItem('app_dev_import', '0'); t2.w.JiwenLedger.renderBill(); await tick(80); t2.w.JiwenLedger.listFlush();
    ok(!t2.d.getElementById('impBanner') && !t2.d.querySelector('#billList .bl-src'), '5 开发开关关着：没有横幅、没有来源小字');
    ok(!t2.errs.length, '5 无报错 ' + t2.errs.join('|') + L.b.slice(0, 0));
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`导入简化 4a：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
