// 1.1（1016-Z）异常金额提醒（纯计算 + jsdom）。node zK-import-amounts.test.js [index.html]
// 有历史：比这个分类平时大多数单笔（第 80 百分位）高 5 倍以上且超过 200 元 → 列进「金额要你看一眼」，写明理由；
// 没历史（新用户）：按内置大类的参考上限（餐饮 500、交通 1000）；不管哪类，单笔超过 2000 元或本次最大几笔（500 元以上）单列；
// 分类照常推荐、钱照常导入；点一行打开详情能改。参考值是常量（plan.js 的 AMOUNT），标「待真实数据调」。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const PL = require('../www/import/plan.js');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const T = (mo, d, h) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const bill = txns => [['微信.csv', B.bill('wechat', txns, { range: RANGE }).bytes]];
const p2 = n => String(n).padStart(2, '0');
const man = (id, mo, d, money, cat) => ({ id, time: `2026-${p2(mo)}-${p2(d)}T08:30`, money, type: 'expense', cat: cat || '吃饭', remark: '手记' });

(async () => {
  ok(PL.AMOUNT && PL.AMOUNT.RATIO === 5 && PL.AMOUNT.MIN_FEN === 20000 && PL.AMOUNT.NEW_CAPS['餐饮'] === 50000 && PL.AMOUNT.NEW_CAPS['交通出行'] === 100000 && PL.AMOUNT.BIG_FEN === 200000,
    '0 参考值是常量：5 倍且超过 200 元、餐饮 500、交通 1000、大额 2000');
  // ===== 1. 有历史：吃饭平时 20–40 元 =====
  {
    const hist = []; for (let i = 1; i <= 20; i++) hist.push(man('h' + i, 9, i, 20 + i));
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(hist) });
    const BL = [wx({ time: T(10, 1), cp: '某虚构面馆', desc: '午餐', fen: 30000 }),      // 300 元，平时 p80 = 37 元 → 高很多
                wx({ time: T(10, 2), cp: '某虚构面馆', desc: '午餐', fen: 15000 }),      // 150 元：5 倍以上但不到 200 元，不算
                wx({ time: T(10, 3), cp: '某虚构家电', desc: '冰箱', fen: 350000 }),     // 3500 元：大额
                wx({ time: T(10, 4), cp: '某虚构书店', fen: 6000 })];
    let p = null, card = '';
    await t.importFiles(bill(BL), S => { p = S.plan; card = t.$('impAmounts') ? t.$('impAmounts').textContent : ''; }, { noGo: true, stay: true });
    const ch = p.sections.amountChecks, k = x => 'wechat|' + x.no;
    const ab = ch.filter(x => x.kind === 'abnormal'), bg = ch.filter(x => x.kind === 'big');
    ok(ab.length === 1 && ab[0].key === k(BL[0]) && /比你平时吃饭单笔高很多/.test(ab[0].why), '1 300 元的面：比平时高很多 ' + JSON.stringify(ab));
    ok(!ch.some(x => x.key === k(BL[1]) && x.kind === 'abnormal'), '1 150 元：没超过 200 元，不算异常');
    ok(bg.some(x => x.key === k(BL[2]) && /超过 2,000\.00 元/.test(x.why)), '1 3500 元：大额单列，提醒看口径');
    ok(/金额要你看一眼/.test(card) && /某虚构面馆 · 300\.00 元 → 吃饭？/.test(card), '1 确认页一张卡，写「某虚构面馆 · 300.00 元 → 吃饭？理由：…」');
    const row = p.rows.find(d => d.key === k(BL[0]));
    ok(row.group === 'add' && row.cat === '吃饭' && row.tags.includes('abnormal'), '1 分类照常推荐、照常导入，只是打了「金额偏高」');
    t.d.querySelector('.imp-amount-row').click();
    await t.until(() => t.$('impSheetMask').style.display === 'flex');
    ok(t.$('impSheet').dataset.key === k(BL[0]), '1 点一行打开那笔的详情');
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }
  // ===== 2. 新用户没历史：按参考上限 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([], ['未分类', '餐饮', '交通出行', '购物', '其他']) });
    const BL = [wx({ time: T(10, 1), cp: '某虚构饭店', desc: '聚餐', fen: 60000 }), wx({ time: T(10, 2), cp: '某虚构饭店', desc: '午餐', fen: 4000 }),
                wx({ time: T(10, 3), cp: '滴滴出行', desc: '快车', fen: 120000 })];
    let p = null;
    await t.importFiles(bill(BL), S => { p = S.plan; }, { noGo: true });
    const ab = p.sections.amountChecks.filter(x => x.kind === 'abnormal').map(x => x.key).sort();
    ok(ab.length === 2 && ab.includes('wechat|' + BL[0].no) && ab.includes('wechat|' + BL[2].no), '2 新用户：餐饮 600 > 500、打车 1200 > 1000 算异常，40 元不算 ' + JSON.stringify(p.sections.amountChecks.map(x => [x.cat, x.fen, x.kind])));
    ok(!t.errs.length, '2 无报错 ' + t.errs.join('|'));
  }
  // ===== 3. 都正常时不出现 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    await t.importFiles(bill([wx({ time: T(10, 1), cp: '某虚构书店', fen: 3000 }), wx({ time: T(10, 2), cp: '某虚构书店', fen: 2000 })]), S => {
      ok(!t.$('impAmounts') && !S.plan.sections.amountChecks.length, '3 都是小钱：没有这张卡');
    }, { noGo: true });
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
