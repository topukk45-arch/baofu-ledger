// 记问 · 账单导入 · AI 检查导入结果（纯计算，1017-H 起）
// 导完一批以后，把这一批整理成一段文字交给你自己用的 AI（复制或分享，记问不联网、不接 AI 接口），AI 按固定格式回一段修改建议，
// 粘回记问以后逐条列出、你勾选、确认后一次写入（写入和撤销照导入那一套，见 index.html 的 JiwenImportStore）。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportAI，Node 里直接 require。不碰页面、存储、网络。
//
// 1017-H 导出：exportText(数据, 开关) → 一段或几段全文（每段最多 AI_MAX_ROWS 行）。
//   数据 { batch, at（导出时间 'YYYY-MM-DD HH:mm:ss'）, cats:[分类], rows:[{ n（临时编号）, time, fen, type, cat, mode, dest（去向）, cp, desc, remark, oc, gone }] }
//   临时编号由主页面按导入记录里的顺序编（新增的在前、改过的以前的记录在后；只在结果页那一刻能带上的跳过 / 待处理排在最后），
//   同一批每次导出编号一样；删掉了的那一笔编号留空（不写进全文）。
//   开关 { cp: 发对方名, remark: 发备注和商品说明, mask: 打码 }：cp / remark 关掉时那几列整列不出现。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportAI = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1017-H';
  var AI_MAX_ROWS = 300;          // 一段最多几行（太长有的 AI 会截断；以后好调）
  var HEAD = '记问修改建议 v1';    // AI 回复代码块的第一行要原样抄这几个字 + 批次 + 导出时间
  var MODE_NAME = { normal: '计入', flow: '只算结余', skip: '不计入' };

  // ---------- 打码 ----------
  //   11 位手机号（前后不连着别的数字）留前 3 后 4；15 位以上连续数字（卡号、身份证、单号）只留后 4 位；
  //   邮箱 @ 前面只留第一个字；「尾号 1234」这类短数字不动
  function mask(s) {
    s = String(s == null ? '' : s);
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, function (m) { var i = m.indexOf('@'); return m.charAt(0) + '***' + m.slice(i); });
    s = s.replace(/\d{15,}/g, function (m) { return '****' + m.slice(-4); });
    s = s.replace(/(^|\D)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g, function (m, a, p, mid, q) { return a + p + '****' + q; });
    return s;
  }
  // 对方像个人：带 *（微信、支付宝给个人打的码）、或者原始分类是转账 / 红包 / 扫二维码付款
  function personal(cp, oc) {
    var c = String(cp || '').trim();
    if (c.indexOf('*') >= 0) return true;
    return /转账|红包|扫二维码付款/.test(String(oc || ''));
  }

  // ---------- 全文 ----------
  function csvCell(v) {
    var s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');
    return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function yuan(fen) { return (fen / 100).toFixed(2); }
  function rowCells(r, o) {
    var cp = r.cp || '', desc = r.desc || '', rm = r.remark || '';
    if (o.mask) { if (personal(cp, r.oc)) cp = '个人'; cp = mask(cp); desc = mask(desc); rm = mask(rm); }
    var c = ['#' + r.n, String(r.time || '').replace('T', ' ').slice(0, 16), yuan(r.fen), r.type === 'income' ? '收入' : '支出',
             r.mode === 'skip' ? '' : (r.cat == null ? '未分类' : r.cat), MODE_NAME[r.mode] || '计入', r.dest || ''];
    if (o.cp) c.push(cp);
    if (o.remark) { c.push(desc); c.push(rm); }
    return c.map(csvCell).join(',');
  }
  function header(o) {
    var h = ['号', '时间', '金额', '收支', '分类', '口径', '去向'];
    if (o.cp) h.push('对方');
    if (o.remark) { h.push('商品说明'); h.push('备注'); }
    return h.join(',');
  }
  // 回复格式的第一行（导回来时按它认是哪一次导出）
  function replyHead(batch, at) { return HEAD + ' 批次 ' + batch + ' 导出 ' + at; }
  function prompt(d, o, part, parts, from, to, n) {
    var lines = [];
    lines.push('你是记账助手。下面是我用记账 App「记问」导入的一批微信 / 支付宝账单' + (parts > 1 ? '（第 ' + (part + 1) + ' / ' + parts + ' 段，#' + from + '–#' + to + '，共 ' + n + ' 笔）' : '（共 ' + n + ' 笔）') + '。请帮我找出可疑的地方：');
    lines.push('1. 分错的分类（只能从下面「可选分类」里挑）；');
    lines.push('2. 可能重复的（同一笔记了两次）；');
    lines.push('3. 可能漏配的（比如几笔加起来正好是我记的一条手记，或者金额差一点）；');
    lines.push('4. 金额差一点却被当成同一笔的（「去向」里写着「金额差一点」的那些）。');
    lines.push('');
    lines.push('规矩：');
    lines.push('- 只能提建议：不能新建、删除记录，不能改金额和时间，不能改配对；');
    lines.push('- 只能改四样：分类、备注、口径（计入 / 只算结余 / 不计入）、标记（可能重复 / 可能漏配）；');
    lines.push('- 只能改有「#号」的这几行，「去向」是跳过、待处理、不导入的那几行没进账本，只能看、不能改；');
    lines.push('- 拿不准的不要提，每条都写理由。');
    if (!o.cp || !o.remark) lines.push('- 这次' + (!o.cp && !o.remark ? '没发对方名、商品说明和备注' : !o.cp ? '没发对方名' : '没发商品说明和备注') + '，只看有的这几列。');
    if (o.mask) lines.push('- 手机号、长串数字、邮箱已经打码（*），个人对方写成「个人」。');
    lines.push('');
    lines.push('回复格式：把建议放在一个代码块里，代码块第一行写 ```记问，第二行原样抄下面这一行：');
    lines.push(replyHead(d.batch, d.at));
    lines.push('然后一行一条：#号 | 改什么 | 改成什么 | 理由');
    lines.push('- 改分类：#2 | 分类 | 零食 | 便利店买饮料');
    lines.push('- 改备注：#5 | 备注 | 夜宵配送费 | 和 #4 是同一单');
    lines.push('- 改口径：#7 | 口径 | 不计入 | 自己账户之间转钱');
    lines.push('- 标记：#3 | 标记 | 可能重复 #2 | 同一分钟、同金额、同对方（「可能重复」「可能漏配」后面可以写说的是哪一笔）');
    lines.push('代码块外面写什么都行，记问只读代码块里的。');
    lines.push('');
    lines.push('可选分类：' + (d.cats || []).join('、'));
    lines.push('');
    lines.push('明细（# 是这次导出临时编的号；金额单位是元）：');
    return lines;
  }
  // → { parts:[{ text, from, to, n }], total（要发的笔数）, head（回复第一行）}
  function exportText(d, opts) {
    var o = { cp: !opts || opts.cp !== false, remark: !opts || opts.remark !== false, mask: !opts || opts.mask !== false };
    var rows = (d.rows || []).filter(function (r) { return r && !r.gone; });
    var chunks = [];
    for (var i = 0; i < rows.length; i += AI_MAX_ROWS) chunks.push(rows.slice(i, i + AI_MAX_ROWS));
    if (!chunks.length) chunks.push([]);
    var parts = chunks.map(function (ch, k) {
      var from = ch.length ? ch[0].n : 0, to = ch.length ? ch[ch.length - 1].n : 0;
      var lines = ['记问 · 导入检查 v1', '批次：' + d.batch, '导出时间：' + d.at, ''].concat(prompt(d, o, k, chunks.length, from, to, ch.length));
      lines.push(header(o));
      ch.forEach(function (r) { lines.push(rowCells(r, o)); });
      return { text: lines.join('\n'), from: from, to: to, n: ch.length };
    });
    return { parts: parts, total: rows.length, head: replyHead(d.batch, d.at) };
  }

  return { VERSION: VERSION, AI_MAX_ROWS: AI_MAX_ROWS, HEAD: HEAD, MODE_NAME: MODE_NAME, mask: mask, personal: personal, exportText: exportText, replyHead: replyHead };
});
