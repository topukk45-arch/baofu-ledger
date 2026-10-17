// 1.1（1016-Y）规则进化（jsdom 跑整个 App，真导真撤）。node zJ-import-rules.test.js [index.html]
// 从合并里学：同一对方合并上 2 次、分类一致 → 导入后存成你的规则，结果页写「学到了 N 条规则」，只合并上 1 次的不存；
// 确认页「按对方选分类」选了的存成规则；按你的规则归的那笔改分类时问「只改这一条 / 以后都改」：
// 以后都改 → 同一条规则归的几笔一起改、导入时改那条规则（撤销时改回去），只改这一条 → 规则不动。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (mo, d, h, mi) => ({ y: 2026, mo, d, h: h === undefined ? 12 : h, mi: mi || 0, s: 0 });
const RANGE = { from: '2026-01-01 00:00:00', to: '2026-12-31 23:59:59' };
let seq = 0;
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '虚构商户', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const bill = txns => [['微信.csv', B.bill('wechat', txns, { range: RANGE }).bytes]];
const p2 = n => String(n).padStart(2, '0');
const man = (id, d, money, o) => Object.assign({ id, time: `2026-10-${p2(d)}T08:30`, money, type: 'expense', cat: '吃饭', remark: '手记' }, o || {});
const select = (t, sel, v) => { sel.value = v; sel.dispatchEvent(new t.w.Event('change')); };

(async () => {
  // ===== 1. 从合并里学 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([man('a1', 1, 15), man('a2', 2, 15), man('a3', 3, 22, { cat: '杂项' })]) });
    const D0 = await t.dump();
    await t.importFiles(bill([wx({ time: T(10, 1, 7), cp: '某虚构早点', fen: 1500 }), wx({ time: T(10, 2, 7), cp: '某虚构早点', fen: 1500 }),
                              wx({ time: T(10, 3, 7), cp: '某虚构文具', fen: 2200 })]), null, { stay: true });
    ok(/从合并里学到了 1 条规则/.test(t.$('impResult').textContent), '1 结果页写「从合并里学到了 1 条规则」');
    t.$('impBackToLedger').click(); await t.idle();
    const ir = t.arch().importRules || {};
    ok(same(ir.cat, [{ kw: '某虚构早点', cat: '吃饭' }]), '1 合并上 2 次的「某虚构早点 → 吃饭」存成规则，只合并上 1 次的「某虚构文具」不存 ' + JSON.stringify(ir.cat));
    const [lg] = await t.logs();
    ok(same(lg.rulesAdded.cat, [{ kw: '某虚构早点', cat: '吃饭' }]), '1 导入记录里记了这条规则（撤销用）');
    await t.w.eval('loadImportUI')();
    const p = await t.st().undoPlan(lg.b); await t.st().undo(p); await t.idle();
    ok(!t.arch().importRules && same(await t.dump(), D0), '1 撤销：规则一起删，和导入前逐字节一样');
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }
  // ===== 2. 按对方选分类 → 存规则 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    await t.importFiles(bill([wx({ time: T(10, 4), cp: '某虚构小卖部', desc: '/', fen: 800 }), wx({ time: T(10, 5), cp: '某虚构小卖部', desc: '/', fen: 900 })]), S => {
      t.$('impCpGroups');   // 1017-UI2：走到「分类」那一步
      const row = t.d.querySelector('#impCpGroups .imp-row-opt[data-cp="某虚构小卖部"] select');
      ok(!!row && /记成你的规则/.test(t.$('impCpGroups').textContent), '2 按对方选分类那张卡写明选了会记成规则');
      select(t, row, '杂项');
    });
    ok(same((t.arch().importRules || {}).cat, [{ kw: '某虚构小卖部', cat: '杂项' }]), '2 选了的存成规则');
    ok(!t.errs.length, '2 无报错 ' + t.errs.join('|'));
  }
  // ===== 3. 规则和你冲突：以后都改 / 只改这一条 =====
  for (const choice of ['all', 'one']) {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([], null, { importRules: { cat: [{ kw: '某虚构书店', cat: '购物' }], type: [] } }) });
    const D0 = await t.dump();
    const BL = [wx({ time: T(10, 6), cp: '某虚构书店', fen: 3600 }), wx({ time: T(10, 7), cp: '某虚构书店', fen: 4200 })];
    let asked = '', cats = null;
    await t.importFiles(bill(BL), null, { noGo: true, stay: true });
    // 展开明细「新增」组，点开第一笔书店的详情
    {
      const S = t.S(), key = S.plan.rows.find(d => d.src === 'row' && d.cp === '某虚构书店').key;
      S.view.details = true; S.view.open.add = true; t.w.JiwenImportUI._goStep('overview');   // 1017-UI2：明细在最后一步「总览」
      const r = [...t.d.querySelectorAll('#impBody .al-row')].find(x => x.dataset.key === key);
      if (r) r.click();
    }
    await t.until(() => t.$('impSheetMask').style.display === 'flex');
    select(t, t.d.querySelector('#impSheet .imp-row-cat'), '杂项');
    await t.until(() => t.ask());
    asked = t.ask().msg;
    if (choice === 'all') await t.askOk(); else await t.askCancel();
    cats = t.S().plan.rows.filter(d => d.cp === '某虚构书店').map(d => d.cat).sort();
    ok(/按你的规则「某虚构书店 → 购物」归的/.test(asked) && t.$('askOk').textContent !== '' , '3 改按规则归的分类：先问一句 ' + choice);
    ok(choice === 'all' ? same(cats, ['杂项', '杂项']) : same(cats, ['杂项', '购物']), '3 ' + (choice === 'all' ? '以后都改：同一条规则归的两笔都改' : '只改这一条：另一笔还是规则的分类') + ' ' + JSON.stringify(cats));
    t.$('impSheetClose').click();
    A.clickGo(t.w);
    await t.until(() => t.$('impResult'));
    const rc = t.$('impResult').textContent;
    t.$('impBackToLedger').click(); await t.idle();
    const rule = (t.arch().importRules.cat || []).filter(r => r.kw === '某虚构书店');
    if (choice === 'all') {
      ok(same(rule, [{ kw: '某虚构书店', cat: '杂项' }]) && /改了你的 1 条规则/.test(rc), '3 以后都改：规则改成杂项（没多加一条），结果页写改了 1 条规则');
      const [lg] = await t.logs();
      ok(same(lg.rulesChanged, [{ kw: '某虚构书店', from: '购物', to: '杂项' }]), '3 导入记录记下规则原来的分类');
      await t.w.eval('loadImportUI')();
      const p = await t.st().undoPlan(lg.b); await t.st().undo(p); await t.idle();
      ok(same(t.arch().importRules.cat, [{ kw: '某虚构书店', cat: '购物' }]) && same(await t.dump(), D0), '3 撤销：规则改回购物，和导入前逐字节一样');
    } else {
      ok(same(rule, [{ kw: '某虚构书店', cat: '购物' }]), '3 只改这一条：规则不动');
    }
    ok(!t.errs.length, '3 无报错 ' + t.errs.join('|'));
  }
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
