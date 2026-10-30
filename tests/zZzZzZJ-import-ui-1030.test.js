// 实测 10-30（发正式版前要修的导入问题，第一版只改界面）：
//   2 账单原文能长按选字，「单号」那行右边「复制」（复制了底部小条说一声）；支付宝那一栏叫「交易分类」、微信叫「交易类型」
//   3 「这几笔」面板：跳过的那一行第二行写为什么跳过（不写分类），标题一行放不下省略、金额那一栏不被压；没对方、没商品说明的写交易类型
//   4 成组确认：分「要你定的」（未分类）/「推荐的分类，看一眼」两块；「这组都没问题」是描边次要按钮；抬头两行固定排法；转账那组排最后、写一句提醒
//   2b（1030-C）「复制全文」；AI 的分组建议 / 一键优化里的勾选框看得见
//   5 「以后也这么记？」：主按钮「只改这几笔 / 只改这一条」在上，「以后都这样记」在下、描边；往下拉 / 返回键 = 只改这几笔；像个人的不问
//   jsdom，账单、记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8'), WWW = path.dirname(htmlFile);
const AI = require(path.join(WWW, 'import', 'ai.js'));
const CSS = fs.readFileSync(path.join(WWW, 'app', 'app.css'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const sheetOpen = t => t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');
let seq = 0;
const T = d => ({ y: 2026, mo: 10, d, h: 12, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构小店', desc: '虚构商品', io: 'expense', fen: 1500, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const ali = o => B.txn(Object.assign({ kind: '日用百货', cp: '某虚构百货店', desc: '虚构的纸巾', io: 'expense', fen: 1200, pm: '余额', status: '交易成功', mno: '', no: '2026' + String(++seq).padStart(24, '0') }, o));
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-20 23:59:59' };

(async () => {
  // ===== 5a. personLike（纯计算） =====
  ok(AI.personLike('馬伍旺', '', '') && AI.personLike('某虚', '', '') && AI.personLike('某*甲', '', '') && AI.personLike('某虚构店主', '转账', ''), '5 像个人：两三个字没有商户字样、带 *、交易类型转账');
  ok(!AI.personLike('某虚构百货店', '商户消费', '') && !AI.personLike('某虚构超市', '', '') && !AI.personLike('某某有限公司', '', '') && !AI.personLike('', '', ''), '5 不像个人：带店 / 超市 / 公司、没有对方');

  // ===== 2. 账单原文 =====
  {
    const TX = [wx({ time: T(3), cp: '某虚构书店', desc: '虚构的书', fen: 3600 }),
      wx({ time: T(4), cp: '', desc: '', kind: '微信红包', fen: 888 }),              // 没对方、没商品说明 → 面板里写交易类型
      wx({ time: T(5), cp: '某虚构外卖平台', desc: '订单号' + '1234567890'.repeat(5), fen: 2300 }),   // 长标题
      wx({ time: T(6), cp: '某虚构花店', desc: '虚构的花', fen: 4100, status: '交易关闭' })];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
    const $ = id => t.d.getElementById(id), UI = () => t.w.JiwenImportUI;
    await t.importFiles([['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]], () => {}, { noGo: true, stay: true });
    // ===== 3. 「这几笔」面板 =====
    UI()._goStep('overview');
    const tile = name => [...t.d.querySelectorAll('#impTiles .imp-tile-go')].find(x => x.textContent.indexOf(name) === 0);
    const rs = () => [...t.d.querySelectorAll('#impRows .imp-rs')];
    const sk = tile('跳过');
    ok(sk, '3 总览「跳过」那一格能点');
    if (sk) {
      sk.click();
      const r0 = rs()[0], d0 = r0 && r0.querySelector('.imp-sr-d').textContent;
      ok(rs().length === 1 && /^交易状态是「交易关闭」/.test(d0) && !/未分类/.test(d0) && /零钱 · 微信/.test(d0), '3 跳过的那一行：第二行写为什么跳过，不写分类，后面照旧支付方式 · 来源：' + d0);
      $('impRowsClose').click();
    }
    tile('新建').click();
    const red = rs().find(r => /8\.88/.test(r.textContent)), long = rs().find(r => /23\.00/.test(r.textContent));
    ok(red && /微信红包/.test(red.querySelector('.imp-sr-t').textContent) && !/—/.test(red.querySelector('.imp-sr-t').textContent), '3 没对方、没商品说明：标题写交易类型：' + (red && red.querySelector('.imp-sr-t').textContent));
    ok(long && long.querySelector('.imp-sr-amt'), '3 长标题那一行有单独的金额栏');
    const st = [...t.d.querySelectorAll('style')].map(s => s.textContent).join('\n');
    ok(/\.imp-sr-t\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/.test(st) && /\.imp-sr-amt\{flex:none;/.test(st), '3 标题一行、放不下省略；金额栏 flex:none 不被压');
    $('impRowsClose').click();
    $('impGo').click(); if ($('impConfirmOk')) $('impConfirmOk').click();
    await t.until(() => $('impResult'), 30000); await t.idle();
    $('impBackToLedger').click(); await t.idle();
    // 账单原文
    const r1 = t.recs().find(r => Number(r.money) === 36);
    t.w.JiwenDetail.openDetail(r1.id); await tick();
    $('detailRawBtn').click();
    const raw = $('detailRaw');
    ok(/交易类型：商户消费/.test(raw.textContent) && raw.querySelector('.detail-raw-l.no .detail-raw-copy'), '2 微信：「交易类型」；「单号」那一行右边有「复制」');
    ok(/\.detail-raw, \.detail-raw \.detail-raw-t \{ -webkit-user-select:text; user-select:text; -webkit-touch-callout:default; \}/.test(CSS), '2 原文那块能长按选字（样式里单独放开）');
    let copied = null; t.w.document.execCommand = c => { if (c === 'copy') { const ta = [...t.d.querySelectorAll('body > textarea[readonly]')].pop(); copied = ta && ta.value; return true; } return false; };
    raw.querySelector('.detail-raw-copy').click(); await tick(60);
    ok(copied === TX[0].no && $('uiSnack') && /已复制单号/.test($('uiSnack').textContent) && $('uiSnack').classList.contains('over'), '2 点「复制」：复制了单号，底部小条「已复制单号」（浮在详情上）');
    copied = null; raw.querySelector('.detail-raw-all').click(); await tick(60);
    ok(raw.querySelector('.detail-raw-all').textContent === '复制全文' && copied && /^时间：2026-10-03 12:00\n金额：支出 36\.00\n交易类型：商户消费\n对方：某虚构书店\n/.test(copied) && copied.indexOf('单号：' + TX[0].no) > 0 && !/复制/.test(copied) && /已复制账单原文/.test($('uiSnack').textContent), '2 实测 10-30：「复制全文」把整份原文复制下来（一行一样，开头是时间、金额），小条「已复制账单原文」：' + JSON.stringify(copied));
    ok(/\.rvg-row input\[type=checkbox\], \.imp-aig-bh input\[type=checkbox\] \{ -webkit-appearance:checkbox; appearance:auto;/.test(CSS), '4 实测 10-30：AI 的分组建议、一键优化里的勾选框看得见（原来被全局 appearance:none 弄成透明）');
    try { t.w.JiwenDetail.closeDetail(); } catch (_) {}
    ok(!t.errs.length, '2/3 无报错 ' + t.errs.join('|'));
  }
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]), now: '2026-10-21T10:00:00' });
    const $ = id => t.d.getElementById(id);
    await t.importFiles([['支付宝.csv', B.bill('alipay', [ali({ time: T(3) })], { range: RANGE }).bytes]]);
    const r = t.recs().find(x => Number(x.money) === 12);
    t.w.JiwenDetail.openDetail(r.id); await tick();
    $('detailRawBtn').click();
    ok(/交易分类：日用百货/.test($('detailRaw').textContent) && !/交易类型/.test($('detailRaw').textContent), '2 支付宝：那一栏叫「交易分类」：' + $('detailRaw').textContent.split('\n')[0]);
    ok(!t.errs.length, '2 支付宝无报错 ' + t.errs.join('|'));
  }

  // ===== 4 / 5. 成组确认、以后也这么记 =====
  {
    const CPS = ['某虚构超市', '馬伍旺', '某虚构乙店', '某虚构面馆', '某虚构转账人店'];
    let n = 0;
    const R = o => Object.assign({ id: 'r' + (++n), time: `2026-10-${String(1 + (n % 20)).padStart(2, '0')}T12:${String(n % 60).padStart(2, '0')}`, money: String(10 + n), type: 'expense', cat: '未分类', remark: '', rv: 1, src: { app: 'wechat' }, batch: 'bmh00001' }, o);
    const RECS = [
      R({ cat: '转账', cp: 4 }), R({ cat: '转账', cp: 4 }), R({ cat: '转账', cp: 4 }), R({ cat: '转账', cp: 4 }),   // 转账笔数最多，也要排在有分类的最后
      R({ cat: '购物', cp: 0 }), R({ cat: '购物', cp: 0 }), R({ cat: '购物', cp: 0 }),
      R({ cp: 1 }), R({ cp: 1 }),
      R({ cp: 2 }), R({ cp: 2 }),
      R({ cat: '吃饭', cp: 2 }),                      // 同一个对方、还在待确认的另一笔（问的时候写「还有 1 笔」）
      R({ cat: '吃饭', cp: 1 }),
    ];
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, ['未分类', '吃饭', '购物', '转账', '其他'], { cps: CPS }), now: '2026-10-25T10:00:00' });
    const $ = id => t.d.getElementById(id), rec = id => t.recs().find(r => r.id === id);
    const groups = () => [...t.d.querySelectorAll('#rvgList .rvg')];
    const openGroups = async () => { t.d.querySelector('.tab-btn[data-tab="ledger"]').click(); await t.idle(); $('rvChip').click(); await tick(); $('rvGroupBtn').click(); await tick(); };
    await openGroups();
    const secs = [...t.d.querySelectorAll('#rvgList .rvg-sec')].map(x => x.textContent);
    ok(secs.join('|') === '要你定的|推荐的分类，看一眼', '4 两块小标题：' + secs.join('|'));
    const kids = [...$('rvgList').children];
    const at = sel => kids.findIndex(x => x.matches(sel));
    ok(at('.rvg-sec[data-sec="todo"]') === 0 && kids[1].dataset.cat === '未分类' && at('.rvg-sec[data-sec="look"]') > 1 && kids[at('.rvg-sec[data-sec="look"]') + 1].dataset.cat !== '未分类', '4 「要你定的」下面是未分类，「推荐的分类，看一眼」下面是有分类的');
    const last = groups()[groups().length - 1];
    ok(last.dataset.cat === '转账' && /转账里可能有付给个人的消费，建议先看每一笔/.test(last.textContent), '4 转账那组（4 笔、最多）排在最后，写一句提醒');
    const buy = groups().find(g => g.dataset.cat === '购物'), unc = groups().find(g => g.dataset.cat === '未分类');
    ok(buy.querySelector('.rvg-ok') && !buy.querySelector('.rvg-ok').classList.contains('primary') && /这组都没问题/.test(buy.querySelector('.rvg-ok').textContent), '4 「这组都没问题」不是深色主按钮（描边次要）');
    ok(unc.querySelector('.rvg-ai.primary'), '4 未分类那组主按钮「交给 AI 按组整理」');
    const h = buy.querySelector('.rvg-head');
    ok(h.children.length === 2 && h.children[0].className === 'rvg-t' && /^购物 · 支出 · 3 笔$/.test(h.children[0].textContent) && h.children[1].className === 'rvg-l2' && h.children[1].querySelector('.rvg-s') && h.children[1].lastElementChild.className === 'rvg-go',
      '4 抬头两行：「购物 · 支出 · 3 笔」/ 对方摘要 + 右边「看每一笔」');
    ok(/\.rvg-s \{[^}]*overflow:hidden; text-overflow:ellipsis; white-space:nowrap;/.test(CSS) && /\.rvg-go \{ flex:none;/.test(CSS), '4 对方摘要一行省略，「看每一笔」固定在右边');
    // 「这组都没问题」照旧能撤销
    buy.querySelector('[data-act="ok"]').click(); await t.idle();
    ok($('rvgUndo') && !groups().some(g => g.dataset.cat === '购物'), '4 「这组都没问题」：拿掉这组，小条能撤销');
    $('rvgUndo').click(); await t.idle();
    ok(groups().some(g => g.dataset.cat === '购物') && t.recs().filter(r => r.cat === '购物' && r.rv === 1).length === 3, '4 撤销：回来了');

    // 5 未分类里按对方改：馬伍旺（像个人）不问
    const uncG = () => groups().find(g => g.dataset.cat === '未分类');
    uncG().querySelector('[data-act="open"]').click(); await tick();
    await A.until(() => uncG().querySelectorAll('.rvg-cp').length === 2, 8000);
    const cpRow = re => [...uncG().querySelectorAll('.rvg-cp')].find(x => re.test(x.textContent));
    const maIds = ['r8', 'r9'];
    cpRow(/馬伍旺/).click(); await tick();
    [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '吃饭').click();
    await A.until(() => maIds.every(id => rec(id).cat === '吃饭') && $('uiSnack') && /已改成/.test($('uiSnack').textContent), 5000); await tick(80);
    ok(maIds.every(id => rec(id).cat === '吃饭') && !t.ask() && !((t.arch().importRules || {}).cat || []).some(r => r.kw === '馬伍旺'), '5 馬伍旺（两三个字、没有商户字样）：不问，只改这几笔');
    // 某虚构乙店：问；往下拉 / 返回键 = 只改这几笔
    await A.until(() => uncG() && cpRow(/某虚构乙店/), 5000);
    cpRow(/某虚构乙店/).click(); await tick();
    [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent.trim() === '购物').click();
    await A.until(() => t.ask(), 5000);
    const m = t.ask().msg;
    ok($('askOk').textContent === '只改这几笔' && $('askOk').classList.contains('primary') && $('askCancel').textContent === '以后都这样记' && $('askCancel').classList.contains('alt'), '5 主按钮「只改这几笔」在上，「以后都这样记」在下、描边');
    ok(/以后导入时，「某虚构乙店」的账单直接记成「购物」/.test(m) && /还有 1 笔「某虚构乙店」的分类在待确认/.test(m), '5 写清影响、还有几笔待确认：' + m.replace(/\n/g, ' '));
    await t.back(); await tick(120);
    ok(!t.ask() && !((t.arch().importRules || {}).cat || []).some(r => r.kw === '某虚构乙店') && rec('r10').cat === '购物', '5 返回键：只改这几笔，不存规则');
    // 关掉以后再开别的确认框：下面那颗还是普通「取消」
    t.w.customConfirm('虚构的确认', () => {}, '测试'); await tick();
    ok($('askCancel').textContent === '取消' && !$('askCancel').classList.contains('alt'), '5 下一个确认框不带上次的「以后都这样记」');
    await t.askCancel();
    ok(!t.errs.length, '4/5 无报错 ' + t.errs.join('|'));
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); process.exit(1); });
