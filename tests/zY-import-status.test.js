// 1017-UI7 起确认页的状态标签和颜色（jsdom 跑整个 App）。node zY-import-status.test.js [index.html]
// 标签「● 待选 / ◐ 部分已定 a/b / ✓ 已选」（图标是 Lucide 内嵌 SVG），卡片左边同色细竖条；「已定」跟着现在的状态走：撤回、改回默认就变回待选，
// 明确点了「还是待确认」也算定了；转账往来只标了几笔是「部分已定」，点「其余都保持计入」算定完；已选的组收成一行「✓ 已选：…… · 改」；
// 琥珀色按主色算（金色主题往橙红挪）。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
let seq = 0;
const T = (d, h, mi) => ({ y: 2026, mo: 10, d, h: h || 12, mi: mi || 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '/', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const bill = txns => [['微信.csv', B.bill('wechat', txns, { range: RANGE }).bytes]];
const r = (id, d, hm, money, cat) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${hm}`, money, type: 'expense', cat: cat || '吃饭', remark: '午饭' });
async function pick(t, files) {
  const $ = id => t.d.getElementById(id);
  $('devImportBtn').click();
  await t.until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new t.w.File([bytes], name)), configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan, 30000);
  // 7a 起有手记的天按天对账、不选的留在待处理；这里测一笔一笔的配对，那几天先选「逐笔看」（照原来一笔一笔）
  const S0 = t.S(); (S0.plan.sections.days || []).forEach(x => { if (!x.auto) S0.edits.days[x.day] = 'each'; }); t.w.JiwenImportUI._replan();
}
const MANUAL = [r('m1', 5, '11:30', 23, '购物'), r('m2', 5, '13:30', 23, '购物'), r('a', 4, '12:30', 35)];
const TX = () => [
  wx({ time: T(5, 12, 15), cp: '某虚构快餐', desc: '套餐', fen: 2300 }),
  wx({ time: T(4, 11, 58), cp: '某虚构食堂', desc: '套餐', fen: 3000 }), wx({ time: T(4, 11, 59), cp: '某虚构食堂', desc: '饮料', fen: 500 }),
  wx({ time: T(8, 18), kind: '转账', cp: '*小玲', fen: 10000 }), wx({ time: T(9, 19), kind: '转账', io: 'income', cp: '*小玲', fen: 10000 }), wx({ time: T(10, 9), kind: '转账', cp: '*小玲', fen: 2000 }),
  wx({ time: T(12, 9), cp: '某省联通', desc: '手机充值', fen: 5000 }),
];

(async () => {
  // 1029-B：没存过主题的启动也套用默认雾松青了，金色那次显式存成金色主题（app.css :root 的老金色 #d4af37）
  for (const theme of ['#d4af37', '#3f6f6b']) {
    const seed = A.seedOf(MANUAL); seed.app_appearance = JSON.stringify({ primary: theme });
    const t = await A.boot({ html, www: WWW, seed });
    const q = s => t.d.querySelector(s), raw = id => t.d.getElementById(id), S = () => t.S();
    await pick(t, bill(TX())); const UI = t.w.JiwenImportUI;
    const pend = t.d.documentElement.style.getPropertyValue('--st-pend');
    ok(theme === '#3f6f6b' ? pend === '#b4660e' : pend === '#b9520a', '0 琥珀按主色算：' + (theme === '#3f6f6b' ? '雾松青用 #b4660e' : '金色离琥珀太近，挪到 #b9520a') + '：' + pend);
    if (theme === '#3f6f6b') { ok(!t.errs.length, '0 雾松青主题无报错 ' + t.errs.join('|')); continue; }
    // ===== 1. 多笔合一：已选收成一行「✓ 已选：…… · 改」，点「改」变回待选 =====
    UI._goStep('match');
    const box = () => q('#impSums [data-sum]');
    const m0 = box().querySelector('.imp-mark');
    ok(m0 && m0.dataset.st === 'pend' && /待选/.test(m0.textContent) && m0.querySelector('svg circle'), '1 多笔合一一组：● 待选（Lucide circle）');
    ok(q('#impSums').classList.contains('st-pend'), '1 卡片左边琥珀竖条（st-pend）');
    box().querySelector('.imp-sum-pick').click();
    ok(box().querySelector('.imp-chosen') && /✓ 已选：这 2 笔加起来正好是你记的 35\.00 元/.test(box().querySelector('.imp-chosen').textContent) && box().querySelector('.imp-mark').dataset.st === 'ok' && box().querySelector('.imp-mark svg path'), '1 选了：收成一行「✓ 已选：……」，标签 ✓ 已选（Lucide check）');
    ok(q('#impSums').classList.contains('st-ok'), '1 卡片竖条变绿（st-ok）');
    box().querySelector('.imp-sum-undo').click();
    ok(box().querySelector('.imp-mark').dataset.st === 'pend' && S().edits.sums[Object.keys(S().edits.sums)[0]] === undefined, '1 点「改」：撤回，变回待选');
    // ===== 2. 待你确认：「还是待确认」也算定了；撤回变回待选 =====
    const pr = q('.imp-pend-row') || q('#impPendGroups .imp-sub-row');
    const pk = pr.dataset.key;
    ok(!!pk && q('.imp-pend-row'), '2 有单独一笔待你确认的行');
    q('.imp-pend-row').click(); raw('impPickClear').click(); raw('impSheetOk').click();      // 1017-UI10：点「确定」才生效
    const mk2 = () => q('.imp-pend-row[data-key="' + pk + '"] .imp-mark');
    ok(mk2().dataset.st === 'ok' && !(S().edits.rows[pk] && S().edits.rows[pk].pick), '2 明确点了「还是待确认」：也算定了（改动里不多东西）');
    q('.imp-pend-row[data-key="' + pk + '"]').click(); raw('impPickNew').click(); raw('impSheetOk').click();
    ok(mk2().dataset.st === 'ok' && S().edits.rows[pk].pick === 'new', '2 改成作为新增：已选');
    UI._state().edits.rows[pk] && delete UI._state().edits.rows[pk].pick; delete UI._state().edits.rows[pk]; UI._replan();
    ok(mk2().dataset.st === 'pend', '2 撤回（改动去掉）：变回待选，不会一直「已定」');
    // ===== 3. 转账往来：部分已定 1/3；其余都保持计入 → 已选；改回计入 → 改动去掉、变回待选 =====
    UI._goStep('refund');
    const tb = () => q('#impTransfers [data-tr]');
    const cb = () => tb().querySelector('.imp-tr-cb');
    ok(tb().querySelector('.imp-mark').dataset.st === 'pend', '3 转账往来一段：待选');
    cb().checked = true; cb().dispatchEvent(new t.w.Event('change'));
    const m3 = tb().querySelector('.imp-mark');
    ok(m3.dataset.st === 'part' && /部分已定 1\/3/.test(m3.textContent) && m3.querySelector('svg path'), '3 只标了 1 笔不计入：◐ 部分已定 1/3（Lucide contrast）：' + m3.textContent);
    ok(/看了 0 件 \/ 共 1 件/.test(raw('impIntro').textContent), '3 顶上计数：部分已定的还算没定：' + raw('impIntro').textContent);
    ok(q('#impTransfers').classList.contains('st-part'), '3 卡片竖条：部分（st-part）');
    tb().querySelector('.imp-tr-keep').click();
    ok(tb().querySelector('.imp-mark').dataset.st === 'ok' && /其余 2 笔保持计入/.test(tb().textContent) && /看了 1 件 \/ 共 1 件/.test(raw('impIntro').textContent), '3 点「其余都保持计入」：这段算定完，顶上「看了 1 件 / 共 1 件」');
    const k3 = cb().dataset.key;
    cb().checked = false; cb().dispatchEvent(new t.w.Event('change'));
    ok(!(S().edits.rows[k3] && S().edits.rows[k3].mode), '3 改回计入：改动去掉（不留一个「计入」的改动）');
    // ===== 4. 新建分类：勾掉再勾回 = 改回默认，变回待选 =====
    UI._goStep('cat');
    const nc = () => q('#impNewCats .imp-row-opt');
    if (nc()) {
      const c0 = nc().querySelector('input[type=checkbox]'), on0 = c0.checked;
      c0.checked = !on0; c0.dispatchEvent(new t.w.Event('change'));
      ok(nc().querySelector('.imp-mark').dataset.st === 'ok', '4 新建分类改了：已选');
      const c1 = nc().querySelector('input[type=checkbox]'); c1.checked = on0; c1.dispatchEvent(new t.w.Event('change'));
      ok(nc().querySelector('.imp-mark').dataset.st === 'pend' && Object.keys(S().edits.newCats).length === 0, '4 改回原来的勾法：改动去掉、变回待选');
    } else ok(false, '4 应当有新建分类（充值缴费）');
    ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  }
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
