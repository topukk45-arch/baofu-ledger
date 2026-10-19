// 第二期（1016-Z5）管理导入规则页（jsdom 跑整个 App）。node zP-import-rules-page.test.js [index.html]
// 设置 →「管理导入规则（开发中）」：分类规则（改分类、删、加；同一个词不重复加）、分类对照（改、删）、类型规则（删）；
// 每改一下就存，只改存档设置里的规则、不动记录；改了以后下一次导入照新规则推荐；开发开关关着时看不到入口。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const select = (t, sel, v) => { sel.value = v; sel.dispatchEvent(new t.w.Event('change')); };
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };

(async () => {
  const RULES = { cat: [{ kw: '某虚构书店', cat: '购物' }, { kw: '某虚构面馆', cat: '吃饭' }], type: [{ app: 'wechat', type: '群收款', as: 'transfer' }], map: [{ from: '交通出行', cat: '杂项' }] };
  const RECS = [{ id: 'k1', time: '2026-10-01T08:30', money: 10, type: 'expense', cat: '吃饭', remark: '手记' }];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(RECS, null, { importRules: RULES }) });
  const { $, d } = t;
  ok($('devRulesBtn') && $('devRulesBtn').style.display === '', '1 设置里有「管理导入规则（开发中）」');
  $('devRulesBtn').click();
  await t.until(() => $('impRulesCat'));
  ok(d.querySelectorAll('.imp-rule-row').length === 2 && d.querySelectorAll('.imp-map-row').length === 1 && d.querySelectorAll('.imp-type-row').length === 1, '1 列出 2 条分类规则、1 条对照、1 条类型规则');
  ok(/微信 · 类型「群收款」 → 当转账/.test($('impRulesType').textContent), '1 类型规则写成大白话');
  const recs0 = JSON.stringify(t.recs());
  // 改分类
  select(t, d.querySelector('.imp-rule-row[data-kw="某虚构书店"] .imp-rule-cat'), '杂项');
  await t.until(() => $('impRulesNotice') && /已改/.test($('impRulesNotice').textContent));
  ok(same(t.arch().importRules.cat[0], { kw: '某虚构书店', cat: '杂项' }), '2 改分类：存进去了');
  // 删
  d.querySelector('.imp-rule-row[data-kw="某虚构面馆"] .imp-rule-del').click();
  await t.until(() => $('impRulesNotice') && /已删/.test($('impRulesNotice').textContent));
  ok(t.arch().importRules.cat.length === 1, '2 删一条：没了');
  // 加
  $('impRuleKw').value = '某虚构花店'; select(t, $('impRuleNewCat'), '购物'); $('impRuleAddBtn').click();
  await t.until(() => $('impRulesNotice') && /已加/.test($('impRulesNotice').textContent));
  ok(same(t.arch().importRules.cat, [{ kw: '某虚构书店', cat: '杂项' }, { kw: '某虚构花店', cat: '购物' }]), '2 加一条：存进去了');
  $('impRuleKw').value = '某虚构花店'; $('impRuleAddBtn').click();
  await t.until(() => t.ask());
  ok(/已经有规则了/.test(t.ask().msg) && t.arch().importRules.cat.length === 2, '2 同一个词不重复加');
  await t.askOk();
  // 对照、类型规则
  select(t, d.querySelector('.imp-map-row .imp-map-cat'), '其他');
  await t.until(() => /已改：推荐/.test(($('impRulesNotice') || {}).textContent || ''));
  ok(same(t.arch().importRules.map, [{ from: '交通出行', cat: '其他' }]), '3 改对照');
  d.querySelector('.imp-type-del').click();
  await t.until(() => /类型规则/.test(($('impRulesNotice') || {}).textContent || ''));
  ok(same(t.arch().importRules.type, []), '3 删类型规则');
  ok(JSON.stringify(t.recs()) === recs0, '3 记录一条都没动');
  await t.back();
  // 下一次导入照新规则
  const bill = B.bill('wechat', [B.txn({ time: { y: 2026, mo: 10, d: 5, h: 12, mi: 0, s: 0 }, kind: '商户消费', cp: '某虚构书店', desc: '书', io: 'expense', fen: 3600, pm: '零钱', status: '支付成功', mno: '', no: '42000000000000000000000000091' })], { range: RANGE }).bytes;
  const r = await t.importFiles([['微信.csv', bill]], null, { noGo: true });
  ok(r.plan.rows.find(x => x.cp === '某虚构书店').cat === '杂项', '4 下一次导入：照改过的规则归到杂项');
  // 开关关着看不到
  t.w.localStorage.removeItem('app_dev_import'); t.w.eval('JiwenImportEntry.renderDevImport')();
  ok($('devRulesBtn').style.display === 'none', '5 开发开关关着：看不到入口');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
