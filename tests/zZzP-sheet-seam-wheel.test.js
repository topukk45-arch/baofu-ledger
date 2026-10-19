// 1019-T 底部面板顶上和主体是一块、日期选择的时 / 分换成滚轮（jsdom，记录全是虚构的）。node zZzP-sheet-seam-wheel.test.js [index.html]
// 接缝：面板底色原来是斜着的渐变，顶上钉住的拖动条 / 标题是纯色，往右越来越对不上；现在面板、钉住的顶、贴底的按钮排都用同一个 --c-sheet。
//   真浏览器里量的接缝色差（金色、雾松青改前改后）见提交说明。
// 滚轮：时 / 分各一列，三格高、中间那格选中；滑停吸到格上写回藏着的 select；点一格直接选；打开、「此刻」都跟上。「此刻」和翻月按钮 48px。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(recs) });
  const { $, w, d } = t, shown = id => $(id).style.display === 'flex';
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const rule = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };

  // 1. 接缝：面板、钉住的顶、贴底的按钮排同一个底色，不再有渐变
  ok(/--c-sheet:\s*#[0-9a-f]{6}/i.test(css), '1 有面板底色 --c-sheet');
  ok(/background:var\(--c-sheet\)/.test(rule('        .sheet ')) || /background:var\(--c-sheet\)/.test(css.slice(css.indexOf('.sheet {'), css.indexOf('.sheet {') + 400)), '1 面板（.sheet）用 --c-sheet');
  ok(/background:var\(--c-sheet\)/.test(rule('.form-mask > .sheet')), '1 表单面板（记一笔、日期选择……）用 --c-sheet');
  ok(/background:var\(--c-sheet\)/.test(rule('.form-mask .sheet-grip')) && !/card-1/.test(rule('.form-mask .sheet-grip')), '1 钉住的拖动条 / 标题用同一个底色');
  for (const sel of ['.ui-sheet-foot', '.form-mask .rec-foot', '.ask-btns']) {
    const r = rule(sel);
    ok(/background:var\(--c-sheet\)/.test(r) && !/gradient/.test(r), `1 贴底的按钮排 ${sel} 用同一个底色、不是渐变`);
  }
  // 换主题：底色跟着换
  d.querySelector('.tab-btn[data-tab="settings"]').click();
  $('themeBtn').click(); await t.idle();
  const sw = [...$('themePresets').children].find(e => e.title === '雾松青');
  ok(sw, '1 有雾松青'); sw && sw.click();
  const v = d.documentElement.style.getPropertyValue('--c-sheet');
  ok(/^#[0-9a-f]{6}$/i.test(v.trim()) && v.trim().toLowerCase() !== '#fff5d4', '1 换成雾松青：面板底色跟着换 ' + v);
  $('themeClose') ? $('themeClose').click() : (d.getElementById('themeMask').style.display = 'none');

  // 2. 时 / 分滚轮
  w.setDtInput($('billTime'), '2026-10-03T14:37');
  w.openDtPicker($('billTime')); await t.idle();
  ok(shown('dtMask'), '2 打开日期选择');
  ok($('dtHour').hidden && $('dtMin').hidden && !$('dtTimeRow').querySelector('.cs-wrap'), '2 时 / 分不再是下拉（select 藏起来当取值）');
  const hw = $('dtHourWheel'), mw = $('dtMinWheel');
  const items = b => [...b.querySelectorAll('.dw-item')];
  ok(items(hw).length === 24 && items(mw).length === 60 && items(hw)[0].textContent === '00' && items(mw)[59].textContent === '59', '2 时 00–23、分 00–59');
  ok(hw.querySelector('.dw-item.sel').textContent === '14' && mw.querySelector('.dw-item.sel').textContent === '37', '2 打开时滚到原来的 14:37，中间那格选中');
  ok(rule('.dt-wheel .dw-item').includes('height:48px') && /scroll-snap-type:y mandatory/.test(rule('.dt-wheel')), '2 一格 48px、滑停吸到格上');
  // 点一格
  items(hw)[9].click(); await wait(10);
  ok($('dtHour').value === '9' && hw.querySelector('.dw-item.sel').textContent === '09' && /09:37$/.test($('dtPreview').textContent), '2 点「09」：选上，上面的预览变 09:37');
  // 滑停
  mw.scrollTop = 5 * 48 + 10; mw.dispatchEvent(new w.Event('scroll'));
  ok(mw.querySelector('.dw-item.sel').textContent === '05' && $('dtMin').value === '37', '2 滑的时候中间那格跟着亮，还没停不改值');
  await wait(180);
  ok($('dtMin').value === '5' && /09:05$/.test($('dtPreview').textContent), '2 滑停：吸到最近一格，写回 05');
  // 此刻
  $('dtNow').click(); await wait(10);
  const now = new w.Date();
  ok(+$('dtHour').value === now.getHours() && hw.querySelector('.dw-item.sel').textContent === String(now.getHours()).padStart(2, '0') && mw.querySelector('.dw-item.sel').textContent === String(now.getMinutes()).padStart(2, '0'), '2 「此刻」：两列滚轮跟着跳到现在');
  ok(/min-height:var\(--ui-tap\)/.test(rule('.dt-now')) && /min-width:var\(--ui-tap\)/.test(rule('.dt-now')), '2 「此刻」至少 48×48（原来约 50×34）');
  ok(/min-height:var\(--ui-tap\)/.test(rule('.dt-head .dt-nav')), '2 翻月 ‹ › 至少 48');
  // 确认写回
  items(hw)[8].click(); items(mw)[20].click(); await wait(10);
  $('dtConfirm').click(); await t.idle();
  ok(!shown('dtMask') && /T08:20$/.test($('billTime').dataset.value), '2 确认：记账时间变成 08:20 ' + $('billTime').dataset.value);

  ok(t.errs.length === 0, '没有报错 ' + t.errs.join('；'));
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
