// 第三期（1016-Z8）App 里解开账单压缩包（输入密码）。node zS-import-zip.test.js [index.html]
// 纯计算（unzip.js）：AES、SHA-1、PBKDF2 对上标准测试向量；夹具（tests/fixtures/zip，ZipCrypto 用 zip -P 做、WinZip AES 用
// helpers/make-aes-zip.py 另写一份做，内容是虚构账单）都能用对的密码解开、错的密码说「密码不对」、文件名中文不乱。
// 页面：选压缩包 → 问密码（写明密码在哪）→ 密码不对再问 → 对了照常算方案；没密码的直接解；点取消就不导这个压缩包；
// 一个压缩包里两份账单一起导。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const U = require('../www/import/unzip.js');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const Z = n => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'zip', n + '.zip')));
const hex = a => Buffer.from(a).toString('hex'), h = s => new Uint8Array(Buffer.from(s, 'hex')), te = s => new TextEncoder().encode(s);

(async () => {
  // ===== 1. 纯计算 =====
  ok(hex(U._aesBlock(h('000102030405060708090a0b0c0d0e0f'), h('00112233445566778899aabbccddeeff'))) === '69c4e0d86a7b0430d8cdb78070b4c55a'
    && hex(U._aesBlock(h('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), h('00112233445566778899aabbccddeeff'))) === '8ea2b7ca516745bfeafc49904b496089', '1 AES-128 / 256 对上 FIPS-197 的测试向量');
  ok(hex(U._sha1(te('abc'))) === 'a9993e364706816aba3e25717850c26c9cd0d89d', '1 SHA-1 对上标准向量');
  ok(hex(U._pbkdf2(te('password'), te('salt'), 2, 20)) === 'ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957', '1 PBKDF2-HMAC-SHA1 对上 RFC 6070');
  const CASES = [['zipcrypto-wechat', '135790', '微信支付账单(20261001-20261031).xlsx'], ['zipcrypto-alipay', '246801', '支付宝交易明细(20261001-20261031).csv'],
                 ['aes256-wechat', '864209', '微信支付账单(20261001-20261031).xlsx'], ['aes128-alipay', '112233', '支付宝交易明细(20261001-20261031).csv']];
  CASES.forEach(([f, pw, name]) => {
    const b = Z(f), i = U.inspect(b), r = U.extract(b, pw), bad = U.extract(b, '000000');
    ok(i.kind === 'zip' && i.encrypted && i.names[0] === name, '1 ' + f + '：认出是有密码的账单压缩包、文件名中文不乱');
    ok(r.ok && r.files.length === 1 && r.files[0].name === name && r.files[0].data.length > 100, '1 ' + f + '：对的密码解开');
    ok(!bad.ok && bad.why === 'password', '1 ' + f + '：错的密码说「密码不对」');
  });
  {
    const b = Z('plain-both'), r = U.extract(b, '');
    ok(U.inspect(b).encrypted === false && r.ok && r.files.length === 2, '1 没密码的压缩包：直接解出两份');
    const xl = Z('zipcrypto-wechat'); const inner = U.extract(xl, '135790').files[0].data;
    ok(U.inspect(inner).kind === 'xlsx' && U.inspect(new Uint8Array([1, 2, 3])).kind === 'none', '1 xlsx 本身不当压缩包，别的文件不认');
  }
  // ===== 2. 页面：有密码 =====
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
  const { $ } = t;
  const pick = async (files) => {
    $('devImportBtn').click();
    await t.until(() => $('impPick'));
    const input = $('impFile');
    Object.defineProperty(input, 'files', { value: files.map(([n, b]) => new t.w.File([b], n)), configurable: true });
    input.dispatchEvent(new t.w.Event('change'));
  };
  await pick([['微信支付账单.zip', Z('aes256-wechat')], ['支付宝.zip', Z('zipcrypto-alipay')]]);
  await t.until(() => t.ask());
  ok(/有密码/.test(t.ask().msg) && /微信支付/.test(t.ask().msg) && t.$('askTitle').textContent === '压缩包密码', '2 选了带密码的压缩包：问密码，写明密码在哪');
  $('askInput').value = '111111'; await t.askOk();
  await t.until(() => t.ask() && /密码不对/.test(t.ask().msg));
  ok(/密码不对，再试一次/.test(t.ask().msg), '2 密码不对：再问一次');
  $('askInput').value = '864209'; await t.askOk();
  await t.until(() => t.ask() && /支付宝/.test(t.ask().msg));
  $('askInput').value = '246801'; await t.askOk();
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().parsed && $('impBar').style.display === 'flex', 20000);
  ok(t.S().parsed.files.map(f => f.name).sort().join(',') === '微信支付账单(20261001-20261031).xlsx,支付宝交易明细(20261001-20261031).csv' && t.S().parsed.files.every(f => f.stats.countOk), '2 两个压缩包都解开了：照常读出两份账单、笔数核对一致');
  A.clickCancel(t.w); await t.idle();
  // ===== 3. 点取消：不导这个压缩包；没密码的直接解 =====
  await pick([['加密.zip', Z('aes128-alipay')], ['没密码.zip', Z('plain-both')]]);
  await t.until(() => t.ask());
  await t.askCancel();
  // 等这一次真算完（上一次关掉以后按钮上的字还在，不能只看字）
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().parsed && $('impBar').style.display === 'flex', 20000);
  ok(t.S().parsed.files.length === 2 && t.S().parsed.files.every(f => !f.fatal), '3 有密码的点了取消：不导它；没密码的直接解出两份照常算');
  A.clickCancel(t.w); await t.idle();
  await pick([['加密.zip', Z('aes128-alipay')]]);
  await t.until(() => t.ask());
  await t.askCancel();
  await t.until(() => $('impPick'));
  ok($('impPick') && $('impPage').style.display === 'block', '3 只选了一个、又点了取消：回到选文件');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
