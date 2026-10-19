// 1017-H「AI 检查导入结果」导出。node zZu-ai-export.test.js [index.html]
// 纯计算（import/ai.js）：打码规则逐条、三个开关关掉后整列不出现、300 行分段、删掉的编号留空；
// jsdom 跑整个 App：结果页「交给 AI 再检查一遍」带上跳过 / 待处理的、导入记录「AI 检查」只带写进账本的、同一批两次导出编号一样、
// 复制时记下导出时间、返回键回到原来的页面。账单、手记全是虚构的。
const fs = require('fs'), path = require('path');
const A = require('./helpers/app');
const B = require('./helpers/bills');
const htmlFile = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');
const WWW = path.dirname(htmlFile);
const AI = require(path.join(WWW, 'import', 'ai.js'));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

(async () => {
  // ===== 1. 打码 =====
  ok(AI.mask('联系 13812345678 送餐') === '联系 138****5678 送餐', '1 11 位手机号留前 3 后 4');
  ok(AI.mask('电话13812345678') === '电话138****5678' && AI.mask('13812345678') === '138****5678', '1 手机号贴着字、单独一串都认');
  ok(AI.mask('单号 4200001234567890123456') === '单号 ****3456', '1 15 位以上数字只留后 4 位');
  ok(AI.mask('卡 622202123456789') === '卡 ****6789', '1 正好 15 位也打码');
  ok(AI.mask('编号 12345678901234') === '编号 12345678901234', '1 14 位、不是手机号的不动');
  ok(AI.mask('订单 123812345678') === '订单 123812345678', '1 12 位里含着像手机号的一段：不当手机号');
  ok(AI.mask('发票发到 xiaoming@example.com 谢谢') === '发票发到 x***@example.com 谢谢', '1 邮箱 @ 前面只留第一个字');
  ok(AI.mask('尾号1234') === '尾号1234' && AI.mask('尾号 1234 的卡') === '尾号 1234 的卡', '1 「尾号 1234」不动');
  ok(AI.personal('*小玲', '') && AI.personal('某某', '转账') && AI.personal('某某', '微信红包（单发）') && !AI.personal('某虚构面馆', '商户消费'), '1 个人对方：带 *、转账、红包');
  // ===== 2. 全文和开关 =====
  const D = { batch: 'b123', at: '2026-10-20 10:00:00', cats: ['未分类', '吃饭', '购物'], rows: [
    { n: 1, time: '2026-10-05T12:10', fen: 2800, type: 'expense', cat: '吃饭', mode: 'normal', dest: '和账单合并', cp: '某虚构面馆', desc: '', remark: '面，电话 13812345678', oc: '商户消费' },
    { n: 2, time: '2026-10-06T09:00', fen: 10000, type: 'expense', cat: '转账', mode: 'skip', dest: '新建', cp: '*小玲', desc: '', remark: '转账备注', oc: '转账' },
    { n: 3, gone: true },
    { n: 4, time: '2026-10-07T09:00', fen: 1990, type: 'expense', cat: '', mode: 'normal', dest: '跳过：交易关闭', cp: '某虚构商城', desc: '数据线, 两根', remark: '', oc: '' }] };
  const all = AI.exportText(D).parts[0].text;
  ok(/^记问 · 导入检查 v1\n批次：b123\n导出时间：2026-10-20 10:00:00/.test(all), '2 开头写批次号和导出时间');
  ok(all.indexOf('记问修改建议 v1 批次 b123 导出 2026-10-20 10:00:00') >= 0 && /```记问/.test(all), '2 写明回复格式（代码块、第一行原样抄批次和导出时间）');
  ok(/可选分类：未分类、吃饭、购物/.test(all), '2 列出可选分类');
  ok(/号,时间,金额,收支,分类,口径,去向,对方,商品说明,备注/.test(all), '2 表头十列');
  ok(/#1,2026-10-05 12:10,28\.00,支出,吃饭,计入,和账单合并,某虚构面馆,,"面，电话 138\*\*\*\*5678"/.test(all) || /#1,2026-10-05 12:10,28\.00,支出,吃饭,计入,和账单合并,某虚构面馆,,面，电话 138\*\*\*\*5678/.test(all), '2 一行一笔，备注里的手机号打码');
  ok(/#2,2026-10-06 09:00,100\.00,支出,,不计入,新建,个人,/.test(all), '2 个人对方写成「个人」，不计入的不写分类');
  ok(all.indexOf('#3,') < 0 && /#4,.*跳过：交易关闭,某虚构商城,"数据线, 两根"/.test(all), '2 删掉的 #3 不写（号留空），带逗号的加引号');
  const noCp = AI.exportText(D, { cp: false }).parts[0].text;
  ok(/号,时间,金额,收支,分类,口径,去向,商品说明,备注\n/.test(noCp) && noCp.indexOf('某虚构面馆') < 0 && noCp.indexOf('某虚构商城') < 0 && /没发对方名/.test(noCp), '2 不发对方名：「对方」整列不出现');
  const noRm = AI.exportText(D, { remark: false }).parts[0].text;
  ok(/号,时间,金额,收支,分类,口径,去向,对方\n/.test(noRm) && noRm.indexOf('数据线') < 0 && noRm.indexOf('转账备注') < 0 && /没发商品说明和备注/.test(noRm), '2 不发备注：「商品说明」「备注」两列整列不出现');
  const min = AI.exportText(D, { cp: false, remark: false }).parts[0].text;
  ok(/号,时间,金额,收支,分类,口径,去向\n#1,2026-10-05 12:10,28\.00,支出,吃饭,计入,和账单合并\n/.test(min) && /没发对方名、商品说明和备注/.test(min), '2 只发金额、分类、日期：三列都不出现');
  const raw = AI.exportText(D, { mask: false }).parts[0].text;
  ok(raw.indexOf('13812345678') >= 0 && raw.indexOf('*小玲') >= 0 && !/已经打码/.test(raw), '2 打码关掉：原样');
  // ===== 3. 300 行分段 =====
  const rows = []; for (let i = 1; i <= 650; i++) rows.push({ n: i, time: '2026-10-01T08:00', fen: i, type: 'expense', cat: '吃饭', mode: 'normal', dest: '新建', cp: '某虚构店', desc: '', remark: '' });
  const big = AI.exportText({ batch: 'b9', at: '2026-10-20 10:00:00', cats: ['吃饭'], rows });
  ok(AI.AI_MAX_ROWS === 300 && big.parts.length === 3 && big.parts.map(p => p.n).join() === '300,300,50' && big.total === 650, '3 650 笔分成 300 + 300 + 50');
  ok(big.parts[1].from === 301 && big.parts[1].to === 600 && /第 2 \/ 3 段，#301–#600，共 300 笔/.test(big.parts[1].text) && big.parts.every(p => p.text.indexOf('记问修改建议 v1 批次 b9 导出 2026-10-20 10:00:00') >= 0), '3 每段写第几段、编号范围，都带回复第一行');
  ok(big.parts[2].text.split('\n').filter(l => /^#\d+,/.test(l)).length === 50, '3 最后一段 50 行');

  // ===== 4. jsdom：结果页、导入记录、编号稳定、记下导出时间 =====
  const RANGE = { from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59' };
  let seq = 0;
  const T = (d, h) => ({ y: 2026, mo: 10, d, h, mi: 0, s: 0 });
  const wx = o => B.txn(Object.assign({ kind: '商户消费', cp: '某虚构店', desc: '虚构商品', io: 'expense', fen: 1000, pm: '零钱', status: '支付成功', mno: '', no: '4200000000' + String(++seq).padStart(19, '0') }, o));
  const MAN = [{ id: 'm1', time: '2026-10-05T12:20', money: 28, type: 'expense', cat: '吃饭', remark: '虚构午饭' }];
  const TX = [wx({ time: T(5, 12), cp: '某虚构面馆', fen: 2800, desc: '牛肉面' }), wx({ time: T(6, 9), cp: '某虚构书店', fen: 3600, desc: '书' }),
              wx({ time: T(7, 9), cp: '某虚构商城', fen: 1990, desc: '数据线', status: '交易关闭' }), wx({ time: T(8, 9), cp: '某虚构超市', fen: 5000, desc: '日用品' })];
  const F = [['微信.csv', B.bill('wechat', TX, { range: RANGE }).bytes]];
  const t = await A.boot({ html, www: WWW, seed: A.seedOf(MAN), now: '2026-10-20T10:00:00' });
  const { $ } = t;
  await t.importFiles(F, S => { const it = S.matched.items.find(x => x.src === 'row' && S.parsed.files[x.file].rows[x.row].no === TX[3].no); S.edits.rows[it.key] = { exclude: true }; }, { stay: true });
  ok($('impNextAi') && /交给 AI 再检查一遍/.test($('impNextAi').textContent), '4 结果页「接下来可以」有「交给 AI 再检查一遍」');
  $('impNextAi').click();
  await t.until(() => $('impAiText'));
  const txt = $('impAiText').value;
  const S = t.S();
  ok(S.phase === 'aiexport' && /批次：/.test(txt) && txt.indexOf('导出时间：' + S.ai.at) >= 0, '4 导出页：全文带批次号和导出时间');
  ok(/#1,2026-10-06 09:00,36\.00,支出,未分类,计入,新建,某虚构书店,,书\n/.test(txt) && /#2,2026-10-05 12:00,28\.00,支出,吃饭,计入,和账单合并,某虚构面馆,,虚构午饭\n/.test(txt), '4 写进账本的：按导入记录的顺序编号（新建的在前、合并的手记在后）');
  ok(/#3,2026-10-07 09:00,19\.90,支出,,计入,跳过：/.test(txt), '4 没进账本的分类留空');
  ok(/#2,.*和账单合并（金额差一点：账单 28\.00）/.test(txt) === false, '4 金额正好相等的合并不写「金额差一点」');
  ok(/#3,2026-10-07 09:00,19\.90,.*,跳过：/.test(txt) && /#4,2026-10-08 09:00,50\.00,.*,不导入：/.test(txt), '4 结果页那一刻：跳过、勾掉的也带上，排在后面');
  $('impAiCp').click();
  ok($('impAiText').value.indexOf('某虚构面馆') < 0 && $('impAiText').value.indexOf('导出时间：' + S.ai.at) >= 0, '4 关掉「发对方名」：全文里没有对方名，导出时间不变');
  $('impAiMinimal').click();
  ok(/号,时间,金额,收支,分类,口径,去向\n/.test($('impAiText').value) && !$('impAiRemark').checked && !$('impAiCp').checked, '4 「只发金额、分类、日期」：两个开关都关上');
  ok($('impAiCopy') && $('impAiShare') && $('impAiBack') && $('impBar').contains($('impAiCopy')), '4 底部：复制 / 分享 / 返回');
  $('impAiCopy').click();
  await t.until(() => t.ask()); await t.askOk();
  const [lg] = await t.st().importsRead();
  ok(lg.aiAt && lg.aiAt[lg.aiAt.length - 1] === S.ai.at, '4 复制时记下这次的导出时间（AI 回复要对得上）');
  t.back(); await t.until(() => $('impResult'));
  ok($('impResult') && t.S().phase === 'done', '4 返回键：回到结果页');
  // 编号稳定：再导一批别的、同一批再导出一次，编号一样
  const r1 = await t.st().aiExportRows(lg.b);
  const F2 = [['微信2.csv', B.bill('wechat', [wx({ time: T(9, 9), cp: '某虚构花店', fen: 2000 })], { range: RANGE }).bytes]];
  $('impBackToLedger').click(); await t.idle();
  await t.importFiles(F2);
  const r2 = await t.st().aiExportRows(lg.b);
  ok(r1.rows.length === 2 && JSON.stringify(r1.rows.map(r => [r.n, r.id])) === JSON.stringify(r2.rows.map(r => [r.n, r.id])), '4 同一批两次导出（中间又导了一批）：编号一样');
  // 导入记录「AI 检查」：只带写进账本的
  await t.w.eval('loadImportUI')();
  t.w.JiwenImportUI.openLogs();
  await t.until(() => t.d.querySelector('.imp-log-ai'));
  const row = Array.from(t.d.querySelectorAll('.imp-log')).find(x => x.dataset.batch === lg.b);
  ok(row && row.querySelector('.imp-log-ai') && row.querySelector('.imp-log-undo'), '4 导入记录每次右侧：「AI 检查」「撤销」');
  row.querySelector('.imp-log-ai').click();
  await t.until(() => $('impAiText'));
  const t2 = $('impAiText').value;
  ok(/#1,/.test(t2) && /#2,/.test(t2) && !/#3,/.test(t2) && t2.indexOf('跳过：') < 0, '4 从导入记录导出：只带写进账本的那 2 笔');
  $('impAiBack').click(); await t.until(() => t.d.querySelector('.imp-log'));
  ok(t.S().phase === 'logs', '4 「返回」回到导入记录');
  // 删掉一笔：编号留空
  { const st = t.w.JiwenStore.loadStore(A.ID), rs = st.archives['默认存档'].records; const i = rs.findIndex(r => r.id === r1.rows[1].id); rs.splice(i, 1); t.w.JiwenStore.saveStore(st); await t.idle(); }
  const r3 = await t.st().aiExportRows(lg.b);
  ok(r3.rows[1].gone && r3.rows[1].n === 2 && r3.rows[0].id === r1.rows[0].id, '4 删掉的那一笔：编号还占着（gone）');
  // 合并进去的账单比手记少：去向写「金额差一点：账单 x」
  {
    const tn = await A.boot({ html, www: WWW, seed: A.seedOf([{ id: 'n1', time: '2026-10-05T12:10', money: 30, type: 'expense', cat: '吃饭', remark: '虚构午饭', src: { app: 'wechat', merged: true }, batch: 'bn1' }]) });
    await tn.st().importsWrite(undefined, [{ b: 'bn1', at: '2026-10-09T10:00', apps: ['wechat'], from: '2026-10-01', to: '2026-10-08', add: [], h: [], cpLen: 0, pmLen: 0, cpEnd: 0, pmEnd: 0, catsAdded: [], rulesAdded: { cat: [], type: [] },
      chg: [{ id: 'n1', was: { time: '2026-10-05T12:20', src: null, batch: null }, now: { time: '2026-10-05T12:10', src: '{"app":"wechat","merged":true}', batch: 'bn1' }, nos: [['wechat', '42000000000000000000000000099']],
              bills: [{ app: 'wechat', no: '42000000000000000000000000099', fen: 2800, time: '2026-10-05T12:10', type: 'expense', remark: '牛肉面' }] }] }]);
    const rn = await tn.st().aiExportRows('bn1');
    ok(rn.rows.length === 1 && rn.rows[0].dest === '和账单合并（金额差一点：账单 28.00）', '4 合并进去的账单比手记少：去向写「金额差一点：账单 28.00」：' + (rn.rows[0] && rn.rows[0].dest));
  }
  ok(!t.errs.length, '无报错 ' + t.errs.join('|'));
  console.log(`${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('出错：' + (e && e.stack || e)); console.log(`${pass} 通过，${fail + 1} 失败`); process.exit(1); });
