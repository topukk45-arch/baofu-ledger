// 1017-J「AI 检查导入结果」导回来的界面（jsdom 跑整个 App）。node zZw-ai-review.test.js [index.html]
// 导出页「粘贴 AI 的回复」→ 共用底部面板里粘贴 → 读不出来的写原因、留在面板里；读出来进「AI 的修改建议」页：按分类 / 备注 / 口径 / 标记分块，
// 每条一张卡、默认不勾，块顶上「这一块全勾」；导入后你改过的写明，已删的灰掉不能勾；点卡片看详情，备注能改成「换掉原备注」（点「确定」才算）；
// 「没看懂的几行」放最后、默认收起；底部「改 X 条」先弹确认面板（数字从勾上的数）。返回键一层层退。账单、手记、AI 回复全是虚构的。
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
const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
const TX = [wx({ time: T(5, 12), cp: '某虚构便利店', fen: 600, desc: '饮料' }), wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' }),
            wx({ time: T(7, 9), cp: '某虚构超市', fen: 5000, desc: '日用品' }), wx({ time: T(8, 9), cp: '某虚构银行', fen: 20000, desc: '还款' })];
const F = [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];

(async () => {
  const t = await A.boot({ html, www: WWW, seed: A.seedOf([], ['未分类', '吃饭', '购物', '零食', '其他']), now: '2026-10-20T10:00:00' });
  const { $ } = t, q = s => t.d.querySelector(s), qa = s => Array.from(t.d.querySelectorAll(s));
  await t.importFiles(F);
  const [lg] = await t.st().importsRead();
  const rows = (await t.st().aiExportRows(lg.b)).rows;
  const idOf = cp => rows.find(r => r.cp === cp).id, nOf = cp => rows.find(r => r.cp === cp).n;
  // 导出一次（记下导出时间），再删一条、改一条
  await t.w.eval('JiwenImportEntry.loadImportUI')();
  t.w.JiwenImportUI.openLogs(); await t.until(() => q('.imp-log-ai'));
  q('.imp-log-ai').click(); await t.until(() => $('impAiText'));
  const at = t.S().ai.at;
  $('impAiCopy').click(); await t.until(() => t.ask()); await t.askOk();
  { const st = t.w.JiwenStore.loadStore(A.ID), rs = st.archives['默认存档'].records;
    rs.splice(rs.findIndex(r => r.id === idOf('某虚构银行')), 1);
    const i = rs.findIndex(r => r.id === idOf('某虚构超市')); rs[i] = Object.assign({}, rs[i], { remark: '我自己改的' });
    t.w.JiwenStore.saveStore(st); await t.idle(); }
  const n1 = nOf('某虚构便利店'), n2 = nOf('某虚构书店'), n3 = nOf('某虚构超市'), n4 = nOf('某虚构银行');
  const REPLY = ['看了一下，建议如下：', '```记问', '记问修改建议 v1 批次 ' + lg.b + ' 导出 ' + at,
    `#${n1} | 分类 | 零食 | 便利店买饮料`, `#${n2} | 分类 | 购物 | 买书`, `#${n3} | 备注 | 囤货 | 一次买了很多`, `#${n4} | 口径 | 不计入 | 信用卡还款`,
    `#${n3} | 标记 | 可能重复 #${n2} | 同一天`, `#${n2} | 金额 | 30.00 | 想改金额`, '这一行乱了', '```'].join('\n');
  // ===== 1. 粘贴：读不出来的写原因、留在面板里 =====
  ok($('impAiPasteBtn') && /粘贴 AI 的回复/.test($('impAiPasteBtn').textContent), '1 导出页有「粘贴 AI 的回复」');
  $('impAiPasteBtn').click();
  await t.until(() => $('impAiPaste'));
  ok(q('#uiSheetMask.open') && /粘贴 AI 的回复/.test($('uiSheetTitle').textContent) && $('impAiPasteGo') && $('impAiPasteCancel'), '1 共用底部面板：粘贴框、「读这份回复」在上、「取消」在下');
  $('impAiPaste').value = REPLY.replace('批次 ' + lg.b, '批次 bzzz');
  $('impAiPasteGo').click(); await t.until(() => $('impAiPasteMsg').textContent);
  ok(/另一次导入的/.test($('impAiPasteMsg').textContent) && q('#uiSheetMask.open'), '1 批次号对不上：写原因、整份不认、面板还开着');
  $('impAiPaste').value = '我觉得都挺好。'; $('impAiPasteGo').click(); await t.until(() => /没找到/.test($('impAiPasteMsg').textContent));
  ok(/没找到记问的修改建议，请把 AI 的整段回复复制过来/.test($('impAiPasteMsg').textContent), '1 没有代码块也没有开头那一行：写原因');
  $('impAiPaste').value = REPLY; $('impAiPasteGo').click();
  await t.until(() => $('impAiReviewHead'));
  ok(t.S().phase === 'aireview' && !q('#uiSheetMask.open'), '2 读出来了：进「AI 的修改建议」页');
  // ===== 2. 修改建议页 =====
  ok(/AI 提了 7 条，能用的 4 条，没看懂 2 行/.test($('impAiReviewHead').textContent), '2 顶上：提了几条、能用几条、没看懂几行：' + $('impAiReviewHead').textContent.slice(0, 40));
  ok($('impAi-cat') && $('impAi-remark') && $('impAi-mode') && $('impAi-flag'), '2 按分类 / 备注 / 口径 / 标记分块');
  ok(qa('.imp-ai-item input').every(x => !x.checked), '2 默认都不勾');
  ok($('impAiGo').disabled && /还没勾/.test($('impAiGo').textContent), '2 没勾的时候底部按钮点不了');
  const item = k => qa('.imp-ai-item').find(x => x.dataset.key === k);
  const gone = item(n4 + '|mode');
  ok(gone && gone.classList.contains('gone') && gone.querySelector('input').disabled && /已删，改不了/.test(gone.textContent), '2 已删的那一笔：灰掉、不能勾');
  ok(/导入后你改过这条/.test(item(n3 + '|remark').textContent) && !/导入后你改过这条/.test(item(n1 + '|cat').textContent), '2 导入后你改过的写明');
  ok(/分类：购物 → 零食/.test(item(n1 + '|cat').textContent) && /AI 的理由：便利店买饮料/.test(item(n1 + '|cat').textContent), '2 卡片：改什么、改成什么、AI 的理由');
  ok(/标记：可能重复（说的是 #/.test(item(n3 + '|flag').textContent), '2 标记写说的是哪一笔');
  // 这一块全勾
  q('.imp-ai-all[data-field="cat"]').click();
  ok(item(n1 + '|cat').querySelector('input').checked && item(n2 + '|cat').querySelector('input').checked && /改 2 条/.test($('impAiGo').textContent) && !$('impAiGo').disabled, '2 「这一块全勾」：这一块都勾上，底部「改 2 条」');
  ok(/这一块全不勾/.test(q('.imp-ai-all[data-field="cat"]').textContent), '2 再点一次就是「这一块全不勾」');
  // 备注：详情里改成「换掉原备注」，取消不算、确定才算
  item(n3 + '|remark').querySelector('.pc').click(); await t.until(() => $('impAiItemOk'));
  ok(/改动还没生效/.test($('uiSheetBody').textContent) && /AI 原话/.test($('uiSheetBody').textContent), '3 点备注那张卡：详情，写明改动还没生效');
  qa('input[name="impAiRm"]').find(x => x.value === 'replace').click(); $('impAiItemCancel').click();
  ok(/后面加上 囤货/.test(item(n3 + '|remark').textContent), '3 选了「换掉」但点「取消」：还是加在后面');
  item(n3 + '|remark').querySelector('.pc').click(); await t.until(() => $('impAiItemOk'));
  const rr = qa('input[name="impAiRm"]').find(x => x.value === 'replace'); rr.checked = true; rr.dispatchEvent(new t.w.Event('change')); $('impAiItemOk').click();
  ok(/换成 囤货/.test(item(n3 + '|remark').textContent), '3 选「换掉原备注」点「确定」：卡片写「换成」');
  // 没看懂的几行：默认收起
  ok($('impAiBad') && !q('.imp-ai-bad') && /没看懂的 2 行/.test($('impAiBad').textContent), '4 「没看懂的几行」放最后、默认收起');
  q('.imp-ai-badtg').click();
  ok(qa('.imp-ai-bad').length === 2 && /不能改金额/.test($('impAiBad').textContent) && /格式不对/.test($('impAiBad').textContent), '4 展开：每行写原因');
  // 确认面板
  item(n3 + '|flag').querySelector('input').click();
  ok(/改 3 条/.test($('impAiGo').textContent), '5 再勾一条标记：「改 3 条」');
  $('impAiGo').click(); await t.until(() => $('impAiConfirmOk'));
  ok(/确认修改/.test($('uiSheetTitle').textContent) && /改分类 2 条/.test($('uiSheetBody').textContent) && /打「AI 觉得可疑」的标记 1 条/.test($('uiSheetBody').textContent) && !/改口径/.test($('uiSheetBody').textContent) && /自动备份/.test($('uiSheetBody').textContent), '5 确认面板：数字从勾上的数，没有的项不写，写明自动备份、能撤销');
  ok($('impAiConfirmOk').compareDocumentPosition($('impAiConfirmCancel')) & 4, '5 「确认修改」在上、「再看看」在下');
  $('impAiConfirmCancel').click();
  ok(!q('#uiSheetMask.open') && /改 3 条/.test($('impAiGo').textContent), '5 「再看看」：什么都没改，勾的还在');
  // 返回键：修改建议页 → 导出页 → 导入记录
  t.back(); await t.until(() => $('impAiText'));
  ok(t.S().phase === 'aiexport', '6 返回键：回到导出页');
  t.back(); await t.until(() => q('.imp-log'));
  ok(t.S().phase === 'logs', '6 再按：回到导入记录');
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
