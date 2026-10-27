// 1025-UX 主题色：默认雾松青（和「恢复默认」、安卓启动底色一样）；登录页能换主题色（打开和设置里同一个外观弹窗），写着进去以后在哪改；
//   预设一格一个：色块 + 名字（jsdom 跑整个 App）。node zZzZzI-theme-1025ux.test.js [index.html]
// 记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
const tick = () => new Promise(r => setTimeout(r, 0));

(async () => {
  // 1. 新用户：登录页
  const t = await A.boot({ html, www: WWW, seed: { accounts: '[]', accounts_v: '1' } });
  const { $, d, w } = t;
  await A.until(() => $('loginBox').style.visibility !== 'hidden' && $('loginBox').style.display !== 'none', 3000);
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  ok(/:root \{[^}]*--c-primary:#3f6f6b;[^}]*--c-bg:#eafbf9;/.test(css), '1 样式表里默认主题是雾松青（#3f6f6b / 底色 #eafbf9，1027-UI 起页面底按拆色算），不再是金黄');
  ok(!/--c-primary:#d4af37/.test(css), '1 默认不是金黄 #d4af37');
  ok(/html \{ background-color:#eafbf9 !important;/.test(html), '1 防白闪钉的根底色跟着换成雾松青的底色');
  ok($('loginThemeBtn') && txt($('loginThemeCur')) === '雾松青', '1 登录页有「主题色 雾松青 换一个 ›」');
  ok(/设置 → 外观/.test(txt(d.querySelector('.login-theme-hint'))), '1 下面一句写进去以后在「设置 → 外观」也能改');
  $('loginThemeBtn').click(); await tick();
  ok($('themeMask').style.display === 'flex', '1 点了打开外观弹窗（和设置里同一个）');
  ok(!$('themeWhere').hidden && /设置 → 外观/.test(txt($('themeWhere'))), '1 从登录页打开：弹窗里也写以后在哪改');
  const sws = [...$('themePresets').querySelectorAll('.theme-swatch')];   // 1027-UI：24 个，分 4 组
  ok(sws.length === 24 && sws.every(b => b.tagName === 'BUTTON' && b.querySelector('.theme-swatch-dot') && txt(b.querySelector('.theme-swatch-name')) === b.title), '1 预设一格一个按钮：色块 + 写着名字');
  ok(sws.find(b => b.title === '雾松青').classList.contains('active'), '1 现在用的雾松青标着选中');
  sws.find(b => b.title === '赭石红').click(); await tick();
  ok(d.documentElement.style.getPropertyValue('--c-primary').trim() === '#a8553f' && JSON.parse(w.localStorage.getItem('app_appearance')).primary === '#a8553f', '1 点赭石红：整个 App 马上换、存下来');
  $('closeTheme').click(); await tick();
  ok(txt($('loginThemeCur')) === '赭石红', '1 关了弹窗：登录页那一行写赭石红');

  // 2. 进了账号以后，设置里打开不写那句
  const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  t2.d.querySelector('.tab-btn[data-tab="settings"]').click(); await tick();
  const groups = [...t2.d.querySelectorAll('#pageSettings .set-group-title')].map(txt);
  ok(groups.join() === '记账,外观和偏好,存档管理,云备份,账户', '2 设置页分组：记账 → 外观和偏好 → 存档管理 → 云备份 → 账户：' + groups.join());
  const g1 = t2.$('manageCatSetting').parentElement, g2 = t2.$('themeBtn').parentElement;
  ok(txt(g1.querySelector('.set-group-title')) === '记账' && t2.$('manageTplSetting').parentElement === g1, '2 管理分类、管理常用模板在最上面「记账」组');
  ok(txt(g2.querySelector('.set-group-title')) === '外观和偏好' && g2.querySelector('.set-item') === t2.$('themeBtn') && txt(t2.$('themeCur')) === '雾松青', '2 外观主题在「外观和偏好」第一行，右边写现在用的颜色');
  ok(t2.$('scrollHintRow').hidden && t2.$('scrollHintSeg'), '2 不起作用的「滑动提示」那一行藏起来（开关还在）');
  t2.$('themeBtn').click(); await tick();
  ok(t2.$('themeMask').style.display === 'flex' && t2.$('themeWhere').hidden, '2 设置里打开外观：不写「以后在哪改」那句');
  t2.$('resetThemeBtn').click(); await tick();
  ok(t2.d.documentElement.style.getPropertyValue('--c-primary').trim() === '#3f6f6b', '2 恢复默认：雾松青（和第一次打开的样子一样）');
  [...t2.$('themePresets').querySelectorAll('.theme-swatch')].find(b => b.title === '黛蓝').click(); await tick();
  ok(txt(t2.$('themeCur')) === '黛蓝', '2 换了颜色：设置页那一行跟着写黛蓝');

  ok(!t.errs.length && !t2.errs.length, '没有报错 ' + t.errs.concat(t2.errs).join('|'));
  console.log(`1025-UX 主题色：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
