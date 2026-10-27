// 1027-UI6 界面收敛第三轮（jsdom 跑整个 App）。node zZzZzZE-ui6-1027.test.js [index.html]
// 1. 长按一笔（账单列表、搜一笔结果、一天面板）弹底部菜单：顶上是这一笔，三项「修改 / 再记一笔 / 删除」；单点照旧进详情；
//    按住不到阈值松手、按住时手指挪了 / 页面滚了都不弹；长按以后紧跟的那一下 click 不进详情
// 2. 「再记一笔」：同分类、同金额、同备注、同收支，时间是现在，打开记一笔、不直接存
// 3. 手动记的账直接删、不问：底部「已删除「午饭 −15.00」 撤销」5 秒；撤销以后记录逐字段一致（id、时间、存的先后不变），挂着的退款一起回来；
//    5 秒内再删一条：前一条照删、提示换成新的；删和撤销都排了云备份
// 4. 导入的记录长按删除：照旧走 1024-G 的四选一
// 记录全是虚构的。今天是 2026-10-23 周五。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const R = (id, time, money, type, cat, remark, extra) => Object.assign({ id, time, money, type, cat, remark: remark || '' }, extra || {});
const wait = ms => new Promise(r => setTimeout(r, ms));
const ARCH = '默认存档';

(async () => {
  const recs = [
    R('m1', '2026-10-22T12:10', 15, 'expense', '吃饭', '午饭'),
    R('m2', '2026-10-22T12:10', 8, 'expense', '吃饭', '奶茶'),
    R('m3', '2026-10-21T19:00', 120, 'expense', '购物', '虚构的鞋', { mode: undefined }),
    R('f1', '2026-10-21T19:30', 20, 'income', '购物', '鞋退款', { refundOf: 'm3' }),
    R('i1', '2026-10-20T09:00', 33, 'expense', '其他', '', { src: { app: 'wechat' }, batch: 'b1', cp: 0 }),
    R('c1', '2026-10-15T09:00', 8000, 'income', '工资', ''),
  ];
  const writes = [];
  const seed = A.seedOf(recs, null, { cps: ['某虚构小店'] });
  seed['onedrive_link_' + A.ID + '__' + ARCH] = JSON.stringify({ uri: 'content://虚构', name: '虚构.json', lastCount: recs.length });
  const t = await A.boot({ html, www: WWW, now: '2026-10-23T10:00:00', seed,
    before(w) { w.Capacitor.Plugins.OneDriveLink = { writeText: async x => { writes.push(x); return {}; }, pickFile: async () => ({}), forget: async () => {} }; } });
  const { $, d, w } = t;
  d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle();
  const rowOf = (id, root) => (root || d).querySelector(`.bl-row[data-id="${id}"]`);
  const ev = (el, type, x, y) => el.dispatchEvent(new w.PointerEvent(type, { bubbles: true, clientX: x || 10, clientY: y || 10, pointerId: 1 }));
  async function hold(el, ms, o) {
    o = o || {};
    ev(el, 'pointerdown');
    if (o.move) { await wait(60); ev(el, 'pointermove', 10 + o.move, 10); }
    if (o.scroll) { await wait(60); d.dispatchEvent(new w.Event('scroll')); }
    await wait(ms);
    ev(el, 'pointerup'); el.click(); await t.idle();
  }
  const menuOpen = () => !!$('rowMenu') && $('uiSheetMask').style.display === 'flex';
  const detailOpen = () => $('detailMask') && $('detailMask').style.display === 'flex';

  // ===== 1. 长按弹菜单、单点进详情 =====
  await hold(rowOf('m1'), 600);
  ok(menuOpen(), '1 账单列表长按一笔弹菜单');
  ok(!detailOpen(), '1 长按以后那一下 click 不进详情');
  const mt = txt($('rowMenu'));
  ok(/午饭/.test(mt) && /−15\.00/.test(mt), '1 菜单顶上是这一笔：' + mt);
  const items = [...$('rowMenu').querySelectorAll('.rm-act')].map(b => txt(b));
  ok(items.join() === '修改,再记一笔,删除', '1 三项：' + items.join());
  ok($('rowMenu').querySelector('.rm-act[data-v="del"]').classList.contains('warn'), '1 删除用警示色');
  w.JiwenSheet.close(); await t.idle();
  rowOf('m1').click(); await t.idle();
  ok(detailOpen() && !menuOpen(), '1 单点照旧进详情');
  w.JiwenDetail.closeDetail(); await t.idle();
  await hold(rowOf('m1'), 200);
  ok(!menuOpen(), '1 按住不到阈值就松手：不弹菜单（进详情）');
  w.JiwenDetail.closeDetail(); await t.idle();
  await hold(rowOf('m1'), 600, { move: 20 });
  ok(!menuOpen(), '1 按住时手指挪了 20px：不弹');
  w.JiwenDetail.closeDetail && w.JiwenDetail.closeDetail(); await t.idle();
  await hold(rowOf('m1'), 600, { scroll: true });
  ok(!menuOpen(), '1 按住时页面滚了：不弹');
  w.JiwenDetail.closeDetail && w.JiwenDetail.closeDetail(); await t.idle();

  // 搜一笔结果里长按
  w.JiwenSearch.openSearch({ preset: { cats: ['吃饭'] } }); await t.idle();
  await hold(rowOf('m2', $('searchList')), 600);
  ok(menuOpen() && /奶茶/.test(txt($('rowMenu'))), '1 搜一笔结果里长按弹菜单');
  w.JiwenSheet.close(); await t.idle();
  w.JiwenSearch.closeSearch({ noBack: true }); await t.idle();

  // 一天面板里长按：菜单收起（取消）回到那一天
  w.JiwenDetail.openDay('2026-10-22'); await t.idle();
  await hold(rowOf('m2', $('uiSheetBody')), 600);
  ok(menuOpen() && /奶茶/.test(txt($('rowMenu'))), '1 一天面板里长按弹菜单');
  $('rmCancel').click(); await t.idle();
  ok(!menuOpen() && /10月22日/.test(txt($('uiSheetTitle'))), '1 一天面板里点「取消」回到那一天：' + txt($('uiSheetTitle')));
  w.JiwenSheet.close(); await t.idle();

  // 修改
  await hold(rowOf('m1'), 600);
  $('rowMenu').querySelector('.rm-act[data-v="edit"]').click(); await t.idle();
  ok($('editMask').style.display === 'flex' && w.JiwenForms.editId === 'm1', '1 「修改」打开修改账单');
  w.JiwenForms.closeEditModal(); await t.idle();

  // ===== 2. 再记一笔 =====
  const n0 = t.recs().length;
  await hold(rowOf('m1'), 600);
  $('rowMenu').querySelector('.rm-act[data-v="again"]').click(); await t.idle();
  ok($('addMask').style.display === 'flex', '2 「再记一笔」打开记一笔');
  ok(w.JiwenForms.billCatSel === '吃饭' && w.JiwenForms.billTypeSel === 'expense' && $('billMoney').value === '15' && $('billRemark').value === '午饭', '2 同分类、同收支、同金额、同备注：' + [w.JiwenForms.billCatSel, w.JiwenForms.billTypeSel, $('billMoney').value, $('billRemark').value].join('/'));
  ok(String(w.JiwenDate.getDtInput($('billTime'))).slice(0, 10) === '2026-10-23', '2 时间是现在：' + w.JiwenDate.getDtInput($('billTime')));
  ok(t.recs().length === n0, '2 不直接存');
  $('closeAdd').click(); await t.idle();
  await hold(rowOf('f1'), 600);
  ok(menuOpen() && !$('rowMenu').querySelector('.rm-act[data-v="again"]'), '2 退款那一笔没有「再记一笔」（分类跟着原账单走，和详情一样）');
  w.JiwenSheet.close(); await t.idle();

  // ===== 3. 手动记的直接删 + 撤销 =====
  const snap = () => JSON.stringify(t.recs());
  const before = snap(), w0 = writes.length;
  await hold(rowOf('m3'), 600);
  $('rowMenu').querySelector('.rm-act[data-v="del"]').click(); await t.idle();
  ok(!t.ask(), '3 手动记的：不问，直接删');
  ok(!t.recs().some(r => r.id === 'm3') && !t.recs().some(r => r.id === 'f1'), '3 删了这一笔，挂着的退款一起删');
  const sn = $('uiSnack');
  ok(sn && sn.classList.contains('show') && /已删除「虚构的鞋 −120\.00」/.test(txt(sn)) && $('snackUndo') && txt($('snackUndo')) === '撤销', '3 底部「已删除「虚构的鞋 −120.00」 撤销」：' + txt(sn));
  ok(/一起删了 1 笔退款/.test(txt(sn)), '3 小字写一起删了几笔退款：' + txt(sn));
  ok(!rowOf('m3'), '3 列表里没有了');
  await wait(1700);
  ok(writes.length > w0, '3 删了以后排了云备份');
  $('snackUndo').click(); await t.idle();
  ok(snap() === before, '3 撤销以后记录逐字段一致（id、时间、存的先后、退款都回来）');
  ok(rowOf('m3'), '3 列表里回来了');
  const w1 = writes.length; await wait(1700);
  ok(writes.length > w1, '3 撤销以后也排了云备份');

  // 5 秒内再删一条：前一条照删，提示换成新的
  await hold(rowOf('m1'), 600); $('rowMenu').querySelector('.rm-act[data-v="del"]').click(); await t.idle();
  await hold(rowOf('m2'), 600); $('rowMenu').querySelector('.rm-act[data-v="del"]').click(); await t.idle();
  ok(/已删除「奶茶 −8\.00」/.test(txt($('uiSnack'))), '3 再删一条：提示换成新的：' + txt($('uiSnack')));
  $('snackUndo').click(); await t.idle();
  ok(t.recs().some(r => r.id === 'm2') && !t.recs().some(r => r.id === 'm1'), '3 撤销只放回最后删的那条，前一条照删');
  // 5 秒自己收
  await hold(rowOf('m2'), 600); $('rowMenu').querySelector('.rm-act[data-v="del"]').click(); await t.idle();
  await wait(5300);
  ok(!$('uiSnack').classList.contains('show'), '3 5 秒后提示自己收起');
  ok(!t.recs().some(r => r.id === 'm2'), '3 收起以后就是删了');

  // ===== 4. 导入的记录：照旧四选一 =====
  await hold(rowOf('i1'), 600);
  $('rowMenu').querySelector('.rm-act[data-v="del"]').click(); await t.idle();
  const labels = [...$('askChoices').querySelectorAll('.cc-label')].map(x => x.textContent);
  ok(t.ask() && t.ask().title === '删除导入的记录' && labels.join() === '只删这条,删掉，以后也不导入,改成不计,撤销整批导入', '4 导入的记录长按删除：照旧四选一：' + labels.join());
  await t.askCancel();
  ok(t.recs().some(r => r.id === 'i1'), '4 取消了：记录还在');

  ok(!t.errs.length, '没有报错：' + t.errs.join(' | '));
  console.log(`1027-UI6 界面收敛第三轮：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
