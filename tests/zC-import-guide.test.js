// 1016-S 导出教程（jsdom 跑整个 App）。node zC-import-guide.test.js [index.html]
// 选文件页有「微信怎么导出」「支付宝怎么导出」，各一页文字步骤：写清点哪里、选「用于个人对账」、要等邮件、解压密码在哪，
// 截图位置先写「此处放截图：…」；提醒别用 Excel 另存；返回键和「‹ 回去选文件」回到选文件，不关页面。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const { $ } = t;
  $('devImportBtn').click();
  await t.until(() => $('impPick'));
  ok($('impGuideWx') && $('impGuideAli'), '1 选文件页有两家的导出教程按钮');
  for (const [b, app, file] of [['impGuideWx', 'wechat', '.xlsx'], ['impGuideAli', 'alipay', '.csv']]) {
    $(b).click();
    const g = $('impGuide'), tx = g ? g.textContent : '';
    ok(g && g.dataset.app === app && /用于个人对账/.test(tx) && /解压密码/.test(tx) && /邮件|邮箱/.test(tx) && tx.includes(file), '2 ' + app + '：步骤写了用途、邮件、解压密码、文件类型');
    ok(g.querySelectorAll('li').length >= 6 && g.querySelectorAll('.imp-shot').length >= 5 && [...g.querySelectorAll('.imp-shot')].every(x => /^此处放截图：/.test(x.textContent)), '2 ' + app + '：截图位置先占位');
    ok(/别用 Excel 打开再另存/.test(tx), '2 ' + app + '：提醒别用 Excel 另存');
    if (app === 'wechat') { await t.back(); } else { $('impGuideBack').click(); }
    ok($('impPick') && !$('impGuide') && $('impPage').style.display === 'block', '3 ' + (app === 'wechat' ? '返回键' : '「‹ 回去选文件」') + '回到选文件，页面还开着');
  }
  await t.back();
  ok($('impPage').style.display === 'none', '3 选文件页再按返回关掉导入页');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
