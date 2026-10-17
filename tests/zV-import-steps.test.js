// 1017-UI2 分步确认页、导入确认、退出确认（jsdom 跑整个 App）。node zV-import-steps.test.js [index.html]
// 第 1 步核对 → 要你定的几步（和手记对不上的 / 退款和转账 / 分类 / 金额要你看一眼，没事的不出现）→ 总览；
// 上一步 / 下一步 / 返回键；回前一步改动不丢；重算后步数变了提示一句、人留在原地；只有 1 步、不超过 3 件时放进总览；
// 导入前先弹确认面板（数字和方案一致，「再看看」什么都不改，写入中不能重复点、返回键不关；只对账也弹）；
// 有方案时退出先问一句（顶上取消、第 1 步返回、算的时候返回），中间步骤返回、结果页、没选文件时不问；开发开关关着什么都不露。账单、手记全是虚构的。
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
const r = (id, d, h, money, cat) => ({ id, time: `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:30`, money, type: 'expense', cat: cat || '吃饭', remark: '午饭' });
const sheetOpen = t => !!t.d.getElementById('uiSheetMask') && t.d.getElementById('uiSheetMask').classList.contains('open');
const wait = ms => new Promise(res => setTimeout(res, ms));
// 打开导入页、选文件，停在第 1 步
async function pick(t, files) {
  const $ = id => t.d.getElementById(id);
  $('devImportBtn').click();
  await t.until(() => $('impPage') && $('impPage').style.display === 'block' && $('impPick'));
  const input = $('impFile');
  Object.defineProperty(input, 'files', { value: files.map(([name, bytes]) => new t.w.File([bytes], name)), configurable: true });
  input.dispatchEvent(new t.w.Event('change'));
  await t.until(() => t.S() && t.S().phase === 'confirm' && t.S().plan, 30000);
}
// 什么都要定一点：两条同金额的手记（待你确认）、一个没分类的对方（分类）、转账往来（退款和转账）、一笔大额（金额要你看一眼）
const MANUAL = [r('m1', 5, 11, 23), r('m2', 5, 13, 23)];
const MANY = () => [
  wx({ time: T(5, 12, 15), cp: '某虚构快餐', desc: '套餐', fen: 2300 }),
  wx({ time: T(8, 18), kind: '转账', cp: '*小玲', fen: 10000, desc: '转账备注:微信转账' }),
  wx({ time: T(9, 19), kind: '转账', io: 'income', cp: '*小玲', fen: 10000, desc: '转账备注:还你饭钱' }),
  wx({ time: T(12, 9), cp: '某虚构平台甲', fen: 1999 }), wx({ time: T(13, 9), cp: '某虚构平台甲', fen: 2999 }),
  wx({ time: T(20, 10), cp: '某虚构家电店', desc: '冰箱', fen: 459900 }),
];

(async () => {
  // ===== 1. 顺序、进度、上一步 / 下一步 / 返回键 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
    const { $ } = t, raw = id => t.d.getElementById(id);
    await pick(t, bill(MANY()));
    const S = t.S(), steps = S.view.steps;
    ok(steps[0] === 'check' && steps[steps.length - 1] === 'overview' && S.view.step === 'check', '1 第 1 步是「核对」，最后一步是「总览」，一打开停在第 1 步：' + steps.join(' → '));
    const order = ['check', 'match', 'refund', 'cat', 'amount', 'overview'];
    ok(steps.every((k, i) => i === 0 || order.indexOf(k) > order.indexOf(steps[i - 1])) && steps.includes('match') && steps.includes('refund') && steps.includes('cat') && steps.includes('amount'), '1 要你定的几步按顺序：和手记对不上的 → 退款和转账 → 分类 → 金额要你看一眼');
    ok(raw('impStepTitle').textContent === `第 1 步 / 共 ${steps.length} 步 · 核对` && raw('impSteps').querySelectorAll('.imp-steps-bar i').length === steps.length, '1 顶上写「第 1 步 / 共 N 步 · 核对」，进度条按实际步数');
    ok(raw('impCancel') && raw('impNext') && !raw('impPrev') && !raw('impGo'), '1 第 1 步底部「取消 / 下一步」，没有导入按钮');
    ok(/笔数和账单统计一致/.test(raw('impBody').textContent) && /这次大概/.test(raw('impBody').textContent), '1 第 1 步：笔数核对、这次大概');
    raw('impNext').click();
    ok(t.S().view.step === steps[1] && raw('impPrev') && raw('impNext') && raw('impStepTitle').textContent.startsWith('第 2 步'), '1 下一步：到第 2 步，底部「上一步 / 下一步」');
    ok(/还剩 \d+ 件没定/.test(raw('impIntro').textContent) && raw('impBody').querySelectorAll('.imp-mark').length > 0, '1 每步顶上一句话写有几件、还剩几件，每件标「没定 / 已定」');
    raw('impPrev').click();
    ok(t.S().view.step === 'check', '1 上一步：回第 1 步');
    while (t.S().view.step !== 'overview') raw('impNext').click();
    ok(raw('impGo') && raw('impGo').classList.contains('ui-full') && raw('impBar').firstElementChild === raw('impGo') && raw('impPrev') && raw('impRecon'), '1 总览：主按钮单独一行在上，「上一步 / 只对账」在下面');
    ok(raw('impTiles') && /新建/.test(raw('impTiles').textContent) && /留在待处理/.test(raw('impTiles').textContent), '1 总览：新建、合并、留在待处理、跳过四格');
    ok(raw('impPendNote') && new RegExp(t.S().plan.counts.pending + ' 笔').test(raw('impPendNote').textContent) && /以后在待处理页处理/.test(raw('impPendNote').textContent), '1 没定的待你确认：总览写明留在待处理、以后在待处理页处理');
    await t.back();
    ok(t.S().view.step === steps[steps.length - 2] && !sheetOpen(t), '1 返回键：回上一步，不问');
    while (t.S().view.step !== 'check') await t.back();
    ok(!sheetOpen(t) && t.S().view.step === 'check', '1 一直按返回回到第 1 步，中间都不问');
    ok(!t.errs.length, '1 无报错 ' + t.errs.join('|'));
  }

  // ===== 2. 改了东西回前一步不丢；分类面板单选；重算后步数变化 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
    const raw = id => t.d.getElementById(id);
    await pick(t, bill(MANY()));
    t.w.JiwenImportUI._goStep('cat');
    const row = t.d.querySelector('#impCpGroups .imp-cp-row');
    ok(row && /某虚构平台甲/.test(row.textContent) && /没定/.test(row.querySelector('.imp-mark').textContent), '2 按对方选分类：整行一块，标「没定」');
    row.click();
    ok(sheetOpen(t) && raw('uiPickList').classList.contains('filter-chips') && raw('uiPickList').firstElementChild.textContent === '未分类', '2 点整行弹选分类面板（分类块，「未分类」第一个）');
    [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent === '购物').click();
    ok(!sheetOpen(t) && t.S().edits.cpCats['某虚构平台甲'] === '购物', '2 点一下就选中、面板关掉，照旧记进 edits.cpCats');
    ok(/已定/.test(t.d.querySelector('#impCpGroups .imp-cp-row .imp-mark').textContent) && /购物/.test(t.d.querySelector('#impCpGroups .imp-cp-row').textContent), '2 那一行标「已定」，写着「购物」');
    raw('impPrev').click(); raw('impPrev').click(); raw('impNext').click(); raw('impNext').click();
    ok(t.S().view.step === 'cat' && t.S().edits.cpCats['某虚构平台甲'] === '购物' && /已定/.test(t.d.querySelector('#impCpGroups .imp-cp-row .imp-mark').textContent), '2 回前一步再回来：改动和「已定」都还在');
    // 重算后少了一步：把那笔大额勾掉（不导入），「金额要你看一眼」就没事了
    const big = t.S().plan.rows.find(d => d.cp === '某虚构家电店');
    const n0 = t.S().view.steps.length;
    t.S().edits.rows[big.key] = { exclude: true }; t.w.JiwenImportUI._replan();
    ok(t.S().view.steps.length === n0 - 1 && !t.S().view.steps.includes('amount') && t.S().view.step === 'cat', '2 重算后少了一步：进度条跟着变，人留在原来那一步');
    ok(raw('impStepNotice') && /少了一步：「金额要你看一眼」/.test(raw('impStepNotice').textContent), '2 提示一句「少了一步」');
    delete t.S().edits.rows[big.key]; t.w.JiwenImportUI._replan();
    ok(t.S().view.steps.includes('amount') && /多了一步：「金额要你看一眼」/.test(raw('impStepNotice').textContent) && t.S().view.step === 'cat', '2 改回去：多了一步，提示一句，人还在原地');
    // 当前这一步的事没了：先留着，离开以后才不出现
    t.w.JiwenImportUI._goStep('amount');
    t.S().edits.rows[big.key] = { exclude: true }; t.w.JiwenImportUI._replan();
    ok(t.S().view.step === 'amount' && t.S().view.steps.includes('amount') && /这一步没有要定的了/.test(raw('impIntro').textContent), '2 当前这一步没事了：不把人弹走，写「这一步没有要定的了」');
    raw('impNext').click();
    ok(t.S().view.step === 'overview' && !t.S().view.steps.includes('amount'), '2 离开以后这一步就不出现了');
    ok(!t.errs.length, '2 无报错 ' + t.errs.join('|'));
  }

  // ===== 3. 只有一两件要定：放进总览；什么都不用定：只有核对和总览 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    const raw = id => t.d.getElementById(id);
    await pick(t, bill([wx({ time: T(12, 9), cp: '某虚构平台乙', fen: 1999 })]));
    ok(t.S().view.steps.join() === 'check,overview' && t.S().view.inline === 'cat', '3 只有 1 步、1 件要定：总共 2 步（核对、总览）');
    ok(/放在最后一步一起看/.test(raw('impBody').textContent), '3 第 1 步写明要定的放在最后一步');
    raw('impNext').click();
    ok(raw('impCpGroups') && raw('impIntro') && /选分类/.test(raw('impIntro').textContent) && raw('impGo'), '3 总览最上面就是那一件（按对方选分类），下面照常能导入');
    A.clickCancel(t.w);
    const t2 = await A.boot({ html, www: WWW, seed: A.seedOf([r('n1', 3, 8, 15, '吃饭')]) });
    await pick(t2, bill([wx({ time: T(3, 8, 5), cp: '某虚构早餐', desc: '早餐', fen: 1500 })]));
    ok(t2.S().view.steps.join() === 'check,overview' && !t2.S().view.inline && /没有要你定的/.test(t2.d.getElementById('impBody').textContent), '3 什么都不用定：只有核对和总览，写明没有要你定的');
    ok(!t.errs.length && !t2.errs.length, '3 无报错');
  }

  // ===== 4. 导入确认面板 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
    const raw = id => t.d.getElementById(id);
    await pick(t, bill(MANY()));
    t.w.JiwenImportUI._goStep('overview');
    const p = t.S().plan, D0 = await t.dump();
    raw('impGo').click();
    const txt = raw('uiSheet').textContent;
    ok(sheetOpen(t) && raw('uiSheetTitle').textContent === '确认导入' && raw('uiSheet').querySelector('.sheet-grip .sheet-handle'), '4 点「新建 X 条记录…」：先弹确认面板（同一套底部面板，拖动条和标题）');
    ok(txt.includes('新建 ' + p.records + ' 条记录') && (!p.mergeM || txt.includes('账单 ' + p.mergeM + ' 笔')) && txt.includes(p.counts.pending + ' 笔留在待处理') && /导入前会自动备份/.test(txt), '4 面板里的数字和方案一致：' + [...t.d.querySelectorAll('#impConfirmList b')].map(x => x.textContent).join(' | '));
    const btns = [...raw('uiSheetFoot').querySelectorAll('button')];
    ok(btns[0] === raw('impConfirmOk') && btns[1] === raw('impConfirmBack') && raw('impConfirmOk').textContent === '确认导入', '4 「确认导入」在上、最显眼，「再看看」在最下面');
    raw('impConfirmBack').click();
    ok(!sheetOpen(t) && t.S().view.step === 'overview' && JSON.stringify(await t.dump()) === JSON.stringify(D0), '4 点「再看看」：回总览，账本一点没动');
    raw('impGo').click(); await t.back();
    ok(!sheetOpen(t) && t.S().phase === 'confirm' && JSON.stringify(await t.dump()) === JSON.stringify(D0), '4 面板开着按返回键：等于「再看看」');
    // 写入中不能重复点、返回键不关
    let calls = 0, release;
    const real = t.w.JiwenImportStore.commit;
    t.w.JiwenImportStore.commit = (...a) => { calls++; return new Promise(res => { release = () => res(real.apply(t.w.JiwenImportStore, a)); }); };
    raw('impGo').click(); raw('impConfirmOk').click();
    ok(raw('impConfirmOk').disabled && raw('impConfirmOk').textContent === '正在导入…' && raw('impConfirmBack').disabled, '4 点「确认导入」：按钮变成「正在导入…」，两个都点不动');
    raw('impConfirmOk').click(); raw('impConfirmOk').dispatchEvent(new t.w.Event('click'));
    await t.back();
    ok(calls === 1 && sheetOpen(t), '4 写入中再点不会写第二次，返回键也不关面板');
    release(); await t.until(() => raw('impResult'), 30000);
    t.w.JiwenImportStore.commit = real;
    ok(raw('impResult') && !sheetOpen(t) && t.recs().length > MANUAL.length, '4 写完：面板收起，到结果页');
    // 1017-UI3：成功页：大对勾 + 「已写进账本」、四格、都对上了、还有待处理单独一块；「回到账本」在上，「撤销这次导入」在最下面
    const rs = t.S().result, kids = [...raw('impBar').children];
    ok(raw('impResult').querySelector('.imp-res-ok') && /已写进账本/.test(raw('impResult').textContent) && raw('impResTiles') && raw('impResTiles').textContent.includes('新建' + rs.r.added + ' 条'), '4 成功页：大对勾、已写进账本、四格（新建 ' + rs.r.added + ' 条）');
    ok(/文件里共 \d+ 笔，都对上了/.test(raw('impResult').textContent) && raw('impResPending') && /还有 \d+ 笔待处理/.test(raw('impResPending').textContent), '4 成功页：写明都对上了，还有待处理单独一块');
    ok(kids[0] === raw('impBackToLedger') && kids[1] === raw('impUndoThis') && raw('impUndoThis').className.includes('danger'), '4 成功页底部：「回到账本」在上，「撤销这次导入」在最下面（提醒色）');
    // 结果页退出不问
    await t.back();
    ok(raw('impPage').style.display === 'none' && !sheetOpen(t), '4 结果页按返回：直接关，不问');
    ok(!t.errs.length, '4 无报错 ' + t.errs.join('|'));
  }

  // ===== 5. 只对账也弹确认 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf([]) });
    const raw = id => t.d.getElementById(id);
    await pick(t, bill([wx({ time: T(3, 9), cp: '某虚构书店', fen: 3600 }), wx({ time: T(4, 9), cp: '某虚构花店', fen: 1200 })]));
    t.w.JiwenImportUI._goStep('overview');
    raw('impRecon').click();
    t.d.querySelector('.imp-recon-row input').click();
    const D0 = await t.dump();
    raw('impGo').click();
    ok(sheetOpen(t) && raw('uiSheetTitle').textContent === '确认补进账本' && /新建 1 条记录/.test(raw('uiSheet').textContent) && /只写这 1 笔/.test(raw('uiSheet').textContent) && raw('impConfirmOk').textContent === '确认补进 1 笔', '5 只对账「补进 1 笔」：也先弹确认面板');
    raw('impConfirmBack').click();
    ok(!sheetOpen(t) && t.S().view.recon && JSON.stringify(await t.dump()) === JSON.stringify(D0), '5 「再看看」：回勾选清单，什么都没写');
    raw('impGo').click(); raw('impConfirmOk').click();
    await t.until(() => raw('impResult'), 30000);
    ok(t.recs().length === 1, '5 确认以后只补进勾的那 1 笔');
    ok(!t.errs.length, '5 无报错 ' + t.errs.join('|'));
  }

  // ===== 6. 退出确认 =====
  {
    const t = await A.boot({ html, www: WWW, seed: A.seedOf(MANUAL) });
    const raw = id => t.d.getElementById(id);
    // 没选文件：不问
    raw('devImportBtn').click(); await t.until(() => raw('impPick'));
    raw('impBack').click();
    ok(raw('impPage').style.display === 'none' && !sheetOpen(t), '6 还没选文件就退出：不问');
    await pick(t, bill(MANY()));
    // 第 1 步「取消」：问；没改过时只写几份账单
    raw('impCancel').click();
    ok(sheetOpen(t) && raw('uiSheetTitle').textContent === '退出这次导入？' && raw('impExitMsg').textContent === '选好的 1 份账单不会保存，账本没有任何改动。', '6 有方案时点「取消」：先问；一处没改过只写几份账单');
    const fb = [...raw('uiSheetFoot').querySelectorAll('button')];
    ok(fb[0] === raw('impExitStay') && fb[1] === raw('impExitOk') && raw('impExitOk').className.includes('danger'), '6 「继续导入」在上、最显眼，「退出」在最下面、提醒色');
    raw('impExitStay').click();
    ok(!sheetOpen(t) && t.S().phase === 'confirm' && t.S().view.step === 'check', '6 点「继续导入」：回到原来那一步');
    // 改两处再从中间步骤顶上「‹ 取消」
    t.w.JiwenImportUI._goStep('cat');
    t.d.querySelector('#impCpGroups .imp-cp-row').click();
    [...t.d.querySelectorAll('#uiPickList .cc')].find(x => x.textContent === '购物').click();
    t.w.JiwenImportUI._goStep('refund');
    t.d.querySelector('#impTransfers .imp-tr-all').click();
    const edits0 = JSON.stringify(t.S().edits);
    raw('impBack').click();
    ok(sheetOpen(t) && /选好的 1 份账单和你做的 3 处选择都不会保存/.test(raw('impExitMsg').textContent), '6 中间步骤顶上「‹ 取消」：也问，写明你做的几处选择：' + raw('impExitMsg').textContent);
    await t.back();
    ok(!sheetOpen(t) && t.S().view.step === 'refund' && JSON.stringify(t.S().edits) === edits0, '6 面板开着按返回键 = 继续导入：还在原来那一步，改动都在');
    // 中间步骤按返回：回上一步，不问
    await t.back();
    ok(!sheetOpen(t) && t.S().view.step === t.S().view.steps[t.S().view.steps.indexOf('refund') - 1], '6 中间步骤按返回：回上一步，不问');
    // 第 1 步按返回：问，点「退出」回选文件页
    while (t.S().view.step !== 'check') await t.back();
    await t.back();
    ok(sheetOpen(t) && t.S().phase === 'confirm', '6 第 1 步按返回：先问');
    raw('impExitOk').click();
    ok(!sheetOpen(t) && t.S().phase === 'pick' && raw('impPick') && raw('impPage').style.display === 'block', '6 点「退出」才退：回到选文件页');
    ok(!t.errs.length, '6 无报错 ' + t.errs.join('|'));
  }

  // ===== 7. 开发开关关着：什么都不露 =====
  {
    const seed = A.seedOf(MANUAL); delete seed.app_dev_import;
    const t = await A.boot({ html, www: WWW, seed });
    ok(!t.w.JiwenImportUI && !t.d.getElementById('impPage') && !t.d.getElementById('uiSheetMask') && t.d.getElementById('devImportBtn').style.display === 'none', '7 开关关着：导入页、底部面板都不存在，入口藏着');
    ok(!t.log.some(u => String(u).startsWith('import/') || /\/import\//.test(u)), '7 开关关着：一个 import/ 下的文件都没请求（请求：' + t.log.join(',') + '）');
  }

  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
