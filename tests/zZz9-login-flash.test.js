// 1019-A 打开 App 不再闪一下登录页。node zZz9-login-flash.test.js [index.html]
// 记住账号（上次没退出）时，从 HTML 开始解析到进了账本，登录框一次都不能露出来；
// 退出了账号 / 记住的账号进不去时，登录页照常显示。记录全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const recs = [{ id: 'r1', time: '2026-12-01T12:00', money: 18, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];

// 登录框「露出来」= 在页面上、没被 visibility / display 藏住、主界面也还没出来
const shown = d => { const b = d.getElementById('loginBox'), m = d.getElementById('mainBox');
  return !!b && b.style.visibility !== 'hidden' && b.style.display !== 'none' && !(m && m.style.display === 'block'); };

async function bootWatch(seed) {
  const seen = [];
  const t = await A.boot({ html, www: WWW, seed, before(w) {
    // 从解析第一个节点起就盯着：每插一个节点、改一次样式都看一眼登录框
    new w.MutationObserver(() => { if (shown(w.document)) seen.push(1); })
      .observe(w.document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  } });
  return { t, seen };
}

(async () => {
  // 1. HTML 里登录框本身就藏着（不靠脚本，第一帧不画）
  ok(/id="loginBox" style="visibility:hidden"/.test(html), '1 登录框在 HTML 里就是 visibility:hidden');

  // 2. 记住账号冷启动 5 次：一次都没露登录框，最后在主界面
  for (let i = 0; i < 5; i++) {
    const { t, seen } = await bootWatch(A.seedOf(recs));
    ok(seen.length === 0, `2 第 ${i + 1} 次冷启动没露登录框（露了 ${seen.length} 次）`);
    ok(t.$('mainBox').style.display === 'block' && t.$('loginBox').style.display === 'none', `2 第 ${i + 1} 次进了主界面`);
    t.w.close();
  }

  // 3. 退出账号以后打开：登录页正常显示，账号在列表里
  {
    const seed = A.seedOf(recs); delete seed.app_logged_in_user;
    const { t } = await bootWatch(seed);
    ok(shown(t.d) && t.d.body.classList.contains('login-mode'), '3 退出后打开：登录页显示');
    ok(/小明/.test(t.$('loginBox').textContent), '3 账号列表里有「小明」');
    t.w.close();
  }

  // 4. 记住的账号已经不在了：照样放出登录页（不会一直空白）
  {
    const seed = A.seedOf(recs); seed.app_logged_in_user = 'u-not-here';
    const { t } = await bootWatch(seed);
    ok(shown(t.d), '4 记住的账号不在：登录页显示');
    t.w.close();
  }

  // 5. 在 App 里退出账号：登录页马上出来
  {
    const { t } = await bootWatch(A.seedOf(recs));
    t.$('logoutBtn').click();
    ok(shown(t.d), '5 退出账号：登录页显示');
    t.w.close();
  }

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
