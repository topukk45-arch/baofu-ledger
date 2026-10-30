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
//
// 1017-I 读回复：parseReply(回复全文, { batch, aiAt:[导出时间…], cats, rows:[aiExportRows 的行] }) →
//   { ok:true, items:[{ n, id, field:'cat'|'remark'|'mode'|'flag', value, ref, refId, why, line, gone, cur }], bad:[{ line, why }], outside }
//   或 { ok:false, why:'noblock'|'nohead'|'batch'|'time', ... }（整份拒收）。
//   只读 ```记问 开头的代码块（代码块外面的字一概不看，outside 数一下有几行）；代码块第一行要是「记问修改建议 v1 批次 X 导出 Y」，
//   批次号不是这一次、或导出时间不是这一批记下的导出时间之一 → 整份拒收。下面一行一条「#号 | 改什么 | 改成什么 | 理由」（全角竖线也认）：
//   改什么只认四种：分类（要是可选分类里的）、备注、统计（计入 / 不计 / 往来；老叫法「口径」「不计入」「只算结余」也认）、标记（可能重复 / 可能漏配，后面可以跟「#号」说的是哪一笔）；
//   号对不上（不在这次导出里、或是没进账本的那几行）、分类不在名单里、改金额 / 时间 / 对方、新建 / 删除、格式乱的、和现在一样的、
//   同一条同一项提了两次的（只认第一次）→ 一律不认，列进「没看懂的几行」（bad，带原因）。删掉了的那一笔照样列出来，标 gone（界面上灰掉、不能勾）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportAI = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1021-T15';
  var AI_MAX_ROWS = 300;          // 一段最多几行（太长有的 AI 会截断；以后好调）
  var HEAD = '记问修改建议 v2';    // AI 回复代码块的第一行要原样抄这几个字 + 批次 + 导出时间
  // 1021-T15：v2 起编号按时间排（以前按写入顺序），已经导出过、还没粘回来的 v1 回复一律不认（号对不上）
  var MODE_NAME = { normal: '计入', skip: '不计', flow: '往来' };

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
  //   1021-T5（实测 10-20，隐私）：宁可多打——打错了只是 AI 看到「个人」，漏打就是把别人的名字发出去了。多认几种：
  //   支付宝原始分类「收入」「转账红包」、微信「二维码收款」；商品说明有收钱码 / 收款 / 转账；
  //   对方名里没有商户字样（公司、店、有限、商行、中心、平台……）而且是英文名（「X. Y. ZZZ」「Adeline」这种）、
  //   一个字、或者两三个字且第一个字是常见的姓
  var SHOP_RE = /公司|店|有限|商行|中心|平台|超市|商城|银行|集团|医院|学校|大学|餐|酒店|宾馆|馆|厂|局|站|部|科技|网络|服务|铁路|航空|12306|支付宝|微信|美团|淘宝|天猫|京东|拼多多|抖音|饿了么|滴滴|闲鱼|财付通|基金|保险|证券|理财|余额宝|花呗|零钱|政府|委员会|协会|工作室|会所|俱乐部|药房|诊所|物业|电力|燃气|水务|移动|联通|电信/i;
  var SURNAME = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤常温康施文牛樊葛邢安齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿关兰焦俞左柳甘祝包宁尚符舒阮柯纪梅童凌毕单季裴霍涂成苗谷盛曲翁冉骆蓝路游辛靳管柴蒙鲍华喻祁蒲房滕屈饶解牟艾尤阳时穆农司卓古吉缪简车项连芦麦褚娄窦戚岑景党宫费卜冷晏席卫米柏宗瞿桂全佟应臧闵苟邬边卞姬师和仇栾隋商刁沙荣巫寇桑郎甄丛仲虞敖巩明佘池查麻苑迟邝';
  function personal(cp, oc, desc) {
    var c = String(cp || '').trim();
    if (c.indexOf('*') >= 0) return true;
    if (/转账|红包|扫二维码付款|二维码收款|^收入$/.test(String(oc || ''))) return true;
    if (/收钱码|收款|转账/.test(String(desc || ''))) return true;
    if (!c || SHOP_RE.test(c)) return false;
    if (/^[A-Za-z][A-Za-z.\s'’·-]*$/.test(c) && c.length <= 40) return true;          // 英文名：C. Q. WEN、Adeline
    var han = c.replace(/[\s·.]/g, '');
    if (/^[\u4e00-\u9fa5]+$/.test(han)) {
      if (han.length === 1) return true;                                               // 一个字：夏、雨
      if (han.length <= 3 && SURNAME.indexOf(han.charAt(0)) >= 0) return true;         // 两三个字、常见姓开头
    }
    return false;
  }

  // ---------- 全文 ----------
  function csvCell(v) {
    var s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');
    return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function yuan(fen) { return (fen / 100).toFixed(2); }
  function rowCells(r, o) {
    var cp = r.cp || '', desc = r.desc || '', rm = r.remark || '';
    if (o.mask) { if (personal(cp, r.oc, r.desc || r.remark)) cp = '个人'; cp = mask(cp); desc = mask(desc); rm = mask(rm); }
    var c = ['#' + r.n, String(r.time || '').replace('T', ' ').slice(0, 16), yuan(r.fen), r.type === 'income' ? '收入' : '支出',
             r.mode === 'skip' ? '' : (r.cat == null ? '未分类' : r.cat), MODE_NAME[r.mode] || '计入', r.dest || ''];
    if (o.cp) c.push(cp);
    if (o.remark) { c.push(desc); c.push(rm); }
    if (o.raw) { c.push(RAW_IO[r.pio] || ''); c.push(r.status || ''); }   // 1021-T15：账单里原来的收 / 支和交易状态
    return c.map(csvCell).join(',');
  }
  function header(o) {
    var h = ['号', '时间', '金额', '收支', '分类', '统计', '去向'];
    if (o.cp) h.push('对方');
    if (o.remark) { h.push('商品说明'); h.push('备注'); }
    if (o.raw) { h.push('账单收支'); h.push('状态'); }
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
    lines.push('- 只能改四样：分类、备注、统计（计入 / 不计 / 往来）、标记（可能重复 / 可能漏配）；');
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
    lines.push('- 改统计：#7 | 统计 | 不计 | 自己账户之间转钱');
    lines.push('- 标记：#3 | 标记 | 可能重复 #2 | 同一分钟、同金额、同对方（「可能重复」「可能漏配」后面可以写说的是哪一笔）');
    lines.push('代码块外面写什么都行，记问只读代码块里的。');
    lines.push('');
    lines.push('可选分类：' + (d.cats || []).join('、'));
    // 1021-T15：这一批推荐新建、还没建的分类也能用（写了记问会先建好分类再改）
    if (d.newCats && d.newCats.length) lines.push('也可以用的新分类（这次推荐新建、还没建的，选了记问会先建好）：' + d.newCats.join('、'));
    if (d.raw) lines.push('「账单收支」「状态」是账单里原来写的（比如退款原来写的是「不计收支」「退款成功」），帮你看收支方向对不对。');
    lines.push('');
    lines.push('明细（# 是这次导出临时编的号；金额单位是元）：');
    return lines;
  }
  // → { parts:[{ text, from, to, n }], total（要发的笔数）, head（回复第一行）}
  var RAW_IO = { income: '收入', expense: '支出', neutral: '不计收支' };
  function exportText(d, opts) {
    var o = { cp: !opts || opts.cp !== false, remark: !opts || opts.remark !== false, mask: !opts || opts.mask !== false };
    o.raw = !!d.raw && (o.cp || o.remark);   // 「只发金额、分类、日期」时不带账单里的收支和状态
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

  // ---------- 1017-I 读回复 ----------
  var FIELD = { '分类': 'cat', '备注': 'remark', '统计': 'mode', '口径': 'mode', '标记': 'flag' };   // 1020-F：「口径」是老叫法，照样认
  var MODE_OF = { '计入': 'normal', '不计': 'skip', '往来': 'flow', '不计入': 'skip', '只算结余': 'flow' };   // 1020-F：后两个是老叫法，照样认
  var FLAG_OF = { '可能重复': 'dup', '可能漏配': 'miss' };
  var NOT_ALLOWED = [[/金额|钱数|money/i, '不能改金额'], [/时间|日期|time|date/i, '不能改时间'], [/新建|新增|添加|增加/, '不能新建记录'], [/删除|删掉|删|去掉这笔|作废/, '不能删除记录'],
                     [/对方|商户|收款方/, '不能改对方'], [/收支|类型/, '不能改收支'], [/合并|配对|拆开/, '这一版不能改配对']];
  var REMARK_MAX = 200;
  function blocks(text) {
    var out = [], re = /```[ \t]*记问[^\n]*\n([\s\S]*?)(```|$)/g, m;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  }
  // 1017-P：一行的写法放宽：行首空格、「- 」「* 」「• 」列表符号、全角 ｜ ＃ 都认；开头那一行外面包了 ** 或 ` 也认
  function normLine(l) {
    return String(l).replace(/｜/g, '|').replace(/＃/g, '#').trim().replace(/^(?:[-*•·]\s+)+/, '').trim();
  }
  var HEAD_RE = /^记问修改建议\s*v2\s*批次\s*(\S+)\s*导出\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*$/;
  var ITEM_RE = /^#?\s*\d+\s*\|/;
  function headOf(l) { return HEAD_RE.exec(l.replace(/^[`*]+|[`*]+$/g, '').trim()); }
  // 只按前 3 个竖线切成 4 段：第 3 个竖线后面的全部算理由（理由里带 | 不会错位）
  function cellsOf(l) {
    var out = [], rest = l;
    for (var i = 0; i < 3; i++) { var k = rest.indexOf('|'); if (k < 0) break; out.push(rest.slice(0, k).trim()); rest = rest.slice(k + 1); }
    out.push(rest.trim());
    return out;
  }
  // 没有 ```记问 围栏（在 AI 客户端点「复制代码」只复制到里面那几行）：在整段文字里找开头那一行，
  //   从下一行起逐行读「#号 | 改什么 | 改成什么 | 理由」，遇到不是这种格式的行或 ``` 就停；空行跳过；一份里可以有几段
  function looseLines(text) {
    var out = [], reading = false;
    text.split('\n').forEach(function (raw) {
      var l = normLine(raw);
      if (headOf(l)) { out.push(l.replace(/^[`*]+|[`*]+$/g, '').trim()); reading = true; return; }
      if (!reading) return;
      if (!l) return;
      if (/^```/.test(l)) { reading = false; return; }
      if (ITEM_RE.test(l)) out.push(l); else reading = false;
    });
    return out;
  }
  function parseReply(text, ctx) {
    text = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    ctx = ctx || {};
    var bs = blocks(text), lines = [], total = text.split('\n').filter(function (l) { return l.trim(); }).length;
    if (bs.length) bs.forEach(function (b) { b.split('\n').forEach(function (l) { l = normLine(l); if (l) lines.push(l); }); });
    else lines = looseLines(text);
    if (!lines.length) return { ok: false, why: 'noblock' };
    var outside = Math.max(0, total - lines.length - (bs.length ? bs.length * 2 : 0));
    if (lines[0]) lines[0] = lines[0].replace(/^[`*]+|[`*]+$/g, '').trim();
    // 第一行：批次号、导出时间
    var hm = HEAD_RE.exec(lines[0] || '');
    if (!hm) return { ok: false, why: 'nohead', line: lines[0] || '' };
    if (hm[1] !== ctx.batch) return { ok: false, why: 'batch', got: hm[1], want: ctx.batch };
    if ((ctx.aiAt || []).indexOf(hm[2]) < 0) return { ok: false, why: 'time', got: hm[2], want: (ctx.aiAt || []).slice() };
    var byN = {}; (ctx.rows || []).forEach(function (r) { if (r && Number.isInteger(r.n)) byN[r.n] = r; });
    var newCats = (ctx.newCats || []).filter(function (c) { return (ctx.cats || []).indexOf(c) < 0; });
    var cats = (ctx.cats || []).concat(newCats), items = [], bad = [], seen = {};
    var badLine = function (l, why) { bad.push({ line: l, why: why }); };
    lines.slice(1).forEach(function (l) {
      if (/^记问修改建议/.test(l)) { if (l === lines[0]) return; badLine(l, '另一次导出的回复'); return; }   // 分几段回复的，每段开头那一行重复出现，跳过
      var cells = cellsOf(l);
      if (cells.length < 3) { badLine(l, '格式不对（要「#号 | 改什么 | 改成什么 | 理由」）'); return; }
      var nm = /^#?\s*(\d+)$/.exec(cells[0]);
      var fieldRaw = cells[1], value = cells[2], why = (cells[3] || '').trim();
      if (!nm) {
        var na0 = NOT_ALLOWED.filter(function (x) { return x[0].test(cells[0] + fieldRaw); })[0];
        badLine(l, na0 ? na0[1] : '开头不是「#号」'); return;
      }
      var n = +nm[1], row = byN[n];
      if (!row) { badLine(l, '没有 #' + n + ' 这一笔（不在这次导出里，或是没进账本的那几行）'); return; }
      var field = FIELD[fieldRaw];
      if (!field) { var na = NOT_ALLOWED.filter(function (x) { return x[0].test(fieldRaw); })[0]; badLine(l, na ? na[1] : '「' + fieldRaw + '」改不了（只能改分类、备注、统计、标记）'); return; }
      var it = { n: n, id: row.id, field: field, why: why, line: l, gone: !!row.gone };
      if (field === 'cat') {
        if (cats.indexOf(value) < 0) { badLine(l, '分类「' + value + '」不在你的分类里'); return; }
        if (row.refund) { badLine(l, '退款的分类跟着原来那笔走，不能单独改'); return; }
        if (row.hasRefunds) { badLine(l, '有退款挂在这笔上，分类要和退款一起改，去账单里改'); return; }
        if (!row.gone && row.cat === value) { badLine(l, '已经是「' + value + '」了'); return; }
        it.value = value; it.cur = row.cat;
        if (newCats.indexOf(value) >= 0) it.newCat = true;   // 1021-T15：要先新建的分类
      } else if (field === 'mode') {
        var m = MODE_OF[value];
        if (!m) { badLine(l, '统计只能是计入、不计、往来'); return; }
        if (row.refund) { badLine(l, '退款的统计跟着原来那笔走，不能单独改'); return; }
        if (row.hasRefunds) { badLine(l, '有退款挂在这笔上，统计要和退款一起改，去账单里改'); return; }
        if (!row.gone && row.mode === m) { badLine(l, '已经是「' + value + '」了'); return; }
        it.value = m; it.cur = row.mode;
      } else if (field === 'remark') {
        if (!value) { badLine(l, '备注是空的'); return; }
        it.value = value.slice(0, REMARK_MAX); it.cur = row.remark || '';
      } else {
        var fm = /^(可能重复|可能漏配)\s*(?:#\s*(\d+))?\s*$/.exec(value);
        if (!fm) { badLine(l, '标记只能是「可能重复」「可能漏配」（后面可以跟 #号）'); return; }
        it.value = FLAG_OF[fm[1]];
        if (fm[2]) {
          var rn = +fm[2], rr = byN[rn];
          if (!rr || rr.gone || rn === n) { badLine(l, rn === n ? '说的那一笔就是它自己' : '说的 #' + rn + ' 不是账本里的记录'); return; }
          it.ref = rn; it.refId = rr.id;
        }
      }
      var k = n + '|' + field;
      if (seen[k]) { badLine(l, '#' + n + ' 的' + fieldRaw + '前面已经提过了，只认第一次'); return; }
      seen[k] = true;
      items.push(it);
    });
    return { ok: true, items: items, bad: bad, outside: outside, head: lines[0] };
  }

  // ---------- 1017-K 勾上的几条 → 每条记录要改的字段 ----------
  //   items：parseReply 的 items 里勾上的（已删的不算）；rows：{ 号: aiExportRows 的行 }；remarkMode：{ 'n|remark': 'replace' }（默认加在后面）
  //   → [{ id, set:{ cat | remark | skip | flow | aiFlag（null = 去掉这个字段）} }]，同一条记录的几项并在一起
  function changesOf(items, rows, remarkMode) {
    var by = {}, order = [];
    (items || []).forEach(function (it) {
      if (!it || it.gone || !it.id) return;
      var row = rows[it.n] || {}, c = by[it.id];
      if (!c) { c = by[it.id] = { id: it.id, set: {} }; order.push(it.id); }
      if (it.field === 'cat') c.set.cat = it.value;
      else if (it.field === 'mode') { c.set.skip = it.value === 'skip' ? true : null; c.set.flow = it.value === 'flow' ? true : null; }
      else if (it.field === 'remark') {
        var cur = row.remark || '', rep0 = remarkMode && remarkMode[it.n + '|remark'] === 'replace';
        c.set.remark = rep0 || !cur ? it.value : cur + '；' + it.value;
      } else if (it.field === 'flag') {
        var f = { k: it.value, why: String(it.why || '').slice(0, 200) }; if (it.refId) f.ref = it.refId;
        c.set.aiFlag = f;
      }
    });
    return order.map(function (id) { return by[id]; });
  }

  // ---------- 导入简化第 14 版：AI 按组整理（原方案三-4）----------
  //   待确认分类的记录按收支 + 对方（平台按商品说明、个人按对方 + 商品说明）分成组，一组一行交给 AI（见下面 groupLine）；
  //   AI 回一行一组「G号 | 改成的分类 | 理由」，放在 ```记问 代码块里、第一行原样抄 groupHead(导出时间)。只能改分类，分类要在名单里。
  //   d = { at, cats, groups:[{ g, cp, desc, io, n, fen, cat, items:[{ time, fen }] }], rest:[{ time, cp, io, fen }] }，opts = { mask }
  //   1030-RV3：对方名原样发（不再把个人换成「个人」，AI 要靠名字判断），mask() 照旧打手机号、长串数字、邮箱；
  //   每组多给几样统计（均、单笔范围、日期范围、常见时段、常见日类型、疑似月固定扣款），时间都从 time 字符串里截、不用 Date；
  //   rest 是个人转账、没写用途、只有 1～2 笔的，列在最后、不带 G 号、AI 不用回
  var GROUP_HEAD = '记问分组建议 v1';
  // 泛化说明：等于没写用途的几种（trim 后整句比）
  var GENERIC_DESC = ['', '—', '/', '收钱码收款', '转账', '扫二维码付款', '扫码付款'];
  function isGenericDesc(s) { return GENERIC_DESC.indexOf(String(s == null ? '' : s).trim()) >= 0; }
  function groupHead(at) { return GROUP_HEAD + ' 导出 ' + at; }
  // 金额（分）→ 最多一位小数、去掉末尾 0：97800 → 978、2610 → 26.1
  function gYuan(fen) { var v = Math.round(fen / 10) / 10; return String(v); }
  function tParts(t) {
    var s = String(t || '');
    return { day: s.slice(0, 10), ym: s.slice(0, 7), y: +s.slice(0, 4), mo: +s.slice(5, 7), d: +s.slice(8, 10), h: +s.slice(11, 13) || 0, hm: s.slice(11, 16) };
  }
  // 星期几（0 = 周日），纯算术（Sakamoto）
  function wday(y, m, d) { var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]; if (m < 3) y -= 1; return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7; }
  var WNAME = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function whenText(p) { return p.day + ' ' + p.hm + '(' + WNAME[wday(p.y, p.mo, p.d)] + ')'; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // 常见时段：24 个钟点环形，先试连着的 2 个、再试 3 个，占比过半的窗口里取占比最高的（一样高取开头那个钟点有交易的、再取先出现的：都在 12 点写 12:00~14:00）
  function hourWindow(ps) {
    var b = []; for (var i = 0; i < 24; i++) b.push(0);
    ps.forEach(function (p) { b[((p.h % 24) + 24) % 24]++; });
    for (var k = 2; k <= 3; k++) {
      var best = -1, bh = 0;
      for (var h = 0; h < 24; h++) { var c = 0; for (var j = 0; j < k; j++) c += b[(h + j) % 24]; if (c * 2 > ps.length && (c > best || (c === best && !b[bh] && b[h]))) { best = c; bh = h; } }
      if (best >= 0) return '多在' + pad2(bh) + ':00~' + pad2((bh + k) % 24) + ':00';
    }
    return '分散';
  }
  function dayKind(ps) {
    var wk = 0; ps.forEach(function (p) { var w = wday(p.y, p.mo, p.d); if (w >= 1 && w <= 5) wk++; });
    if (wk >= ps.length * 0.8) return '多在工作日';
    if ((ps.length - wk) >= ps.length * 0.55) return '多在周末';
    return '都有';
  }
  // 疑似月固定扣款：落在 3 个以上不同的月、每个月正好 1 笔、日号（28 以后都算 28）最大最小差不超过 6
  function monthly(ps) {
    var ms = {}; ps.forEach(function (p) { ms[p.ym] = (ms[p.ym] || 0) + 1; });
    var keys = Object.keys(ms); if (keys.length < 3 || keys.some(function (k) { return ms[k] !== 1; })) return false;
    var ds = ps.map(function (p) { return Math.min(p.d, 28); });
    return Math.max.apply(null, ds) - Math.min.apply(null, ds) <= 6;
  }
  // 一组一行（缺的字段整段不写）
  function groupLine(g, mk) {
    var cp = mk ? mask(g.cp || '') : (g.cp || ''), ds = mk ? mask(g.desc || '') : (g.desc || '');
    var io = g.io === 'income' ? '收入' : '支出', items = (g.items || []).slice().sort(function (a, b) { return String(a.time) < String(b.time) ? -1 : String(a.time) > String(b.time) ? 1 : 0; });
    var ps = items.map(function (x) { return tParts(x.time); }), c = ['G' + g.g, cp || '—', ds || '—', io, g.n + '笔'];
    if (g.n === 1) { c.push(gYuan(g.fen) + '元'); if (ps[0] && ps[0].day) c.push(whenText(ps[0])); }
    else {
      c.push('共' + gYuan(g.fen) + '元'); c.push('均' + gYuan(g.fen / g.n) + '元');
      if (items.length) {
        // 按显示出来的比（10.01 和 10.03 都写 10，写成「单笔10~10元」没意思，算固定）
        var fs = items.map(function (x) { return x.fen; }), lo = Math.min.apply(null, fs), hi = Math.max.apply(null, fs);
        c.push(gYuan(lo) === gYuan(hi) ? '单笔固定' + gYuan(lo) + '元' : '单笔' + gYuan(lo) + '~' + gYuan(hi) + '元');
        var a = ps[0], z = ps[ps.length - 1];
        c.push(a.ym === z.ym ? a.ym : a.ym + '~' + z.ym);
        if (g.n === 2) c.push(ps.map(function (p) { return p.hm + '(' + WNAME[wday(p.y, p.mo, p.d)] + ')'; }).join('、'));
        else { c.push(hourWindow(ps)); c.push(dayKind(ps)); if (monthly(ps)) c.push('疑似月固定扣款'); }
      }
    }
    c.push(g.cat || '未分类');
    return c.join(' | ');
  }
  function groupText(d, opts) {
    opts = opts || {}; var mk = opts.mask !== false, rest = d.rest || [];
    var L = [];
    L.push('记问 · 待确认分类按组整理（导出 ' + d.at + '）');
    L.push('');
    L.push('下面是我账本里分类还没确认的记录，按收支和交易对方（平台按商品说明，个人按对方加商品说明）分成了 ' + d.groups.length + ' 组。请按组帮我挑一个分类，只能从「可选的分类」里选；拿不准的组不用写。');
    L.push('回复放在 ```记问 代码块里，第一行原样抄：' + groupHead(d.at));
    L.push('然后一行一组：G号 | 改成的分类 | 理由（一句话）');
    L.push('');
    L.push('可选的分类：' + (d.cats || []).filter(function (c) { return c !== '未分类'; }).join('、'));
    L.push('');
    L.push('字段说明：');
    L.push('- 每行依次是：G号 | 对方 | 商品说明 | 支出/收入 | 笔数 | 金额 | …… | 现在的分类；缺的字段直接不写');
    L.push('- 「均」是平均每笔；「单笔」是单笔金额的范围；日期范围写到月');
    L.push('- 「多在…」是大部分交易落在的时段或日子（工作日 / 周末），「分散」「都有」就是没有明显规律；只有 1～2 笔的直接写了每笔的时间和星期');
    L.push('- 「疑似月固定扣款」是每月一笔、日子差不多');
    L.push('- 「个人转账」是给个人转钱、账单里没写用途的，请结合对方名字、金额规律、时段判断（比如每月固定金额可能是房租、家里人）；拿不准就不写');
    if (rest.length) L.push('- 最后「以下 N 笔为个人转账且没有说明」那几行没有 G 号，不用回');
    L.push('');
    L.push('分组：');
    d.groups.forEach(function (g) { L.push(groupLine(g, mk)); });
    if (rest.length) {
      L.push('');
      L.push('--- 以下 ' + rest.length + ' 笔为个人转账且没有说明，AI 不用处理，建议在 App 里逐条确认 ---');
      rest.slice().sort(function (a, b) { return String(a.time) < String(b.time) ? -1 : String(a.time) > String(b.time) ? 1 : 0; }).forEach(function (r) {
        var p = tParts(r.time);
        L.push(p.day + ' ' + p.hm + ' | ' + ((mk ? mask(r.cp || '') : (r.cp || '')) || '—') + ' | ' + (r.io === 'income' ? '收入' : '支出') + ' | ' + gYuan(r.fen) + '元');
      });
    }
    return L.join('\n');
  }
  // ctx = { at, cats, n（几组）}：→ { ok, why, items:[{ g, cat, why }], bad:[{ line, why }] }
  var GROUP_HEAD_RE = /^记问分组建议\s*v1\s*导出\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*$/;
  function parseGroupReply(text, ctx) {
    text = String(text == null ? '' : text).replace(/\r\n?/g, '\n'); ctx = ctx || {};
    var bs = blocks(text), lines = [];
    if (bs.length) bs.forEach(function (b) { b.split('\n').forEach(function (l) { l = normLine(l); if (l) lines.push(l); }); });
    else {   // 没有围栏：从开头那一行往下读「G号 | …」
      var reading = false;
      text.split('\n').forEach(function (raw) { var l = normLine(raw).replace(/^[`*]+|[`*]+$/g, '').trim();
        if (GROUP_HEAD_RE.test(l)) { lines.push(l); reading = true; return; }
        if (reading && l && /^G\s*\d+\s*\|/i.test(l)) lines.push(l); else if (reading && l) reading = false; });
    }
    if (!lines.length) return { ok: false, why: 'noblock' };
    var hm = GROUP_HEAD_RE.exec((lines[0] || '').replace(/^[`*]+|[`*]+$/g, '').trim());
    if (!hm) return { ok: false, why: 'nohead', line: lines[0] || '' };
    if (hm[1] !== ctx.at) return { ok: false, why: 'time', got: hm[1], want: ctx.at };
    var items = [], bad = [], seen = {}, cats = (ctx.cats || []).filter(function (c) { return c !== '未分类'; });
    lines.slice(1).forEach(function (l) {
      var c = cellsOf(l), m = /^G\s*(\d+)$/i.exec(c[0] || '');
      if (!m || c.length < 2) { bad.push({ line: l, why: '格式不对（要「G号 | 分类 | 理由」）' }); return; }
      var g = +m[1], cat = String(c[1] || '').replace(/^改成[「“"]?|[」”"]$/g, '').replace(/^[「“"]|[」”"]$/g, '').trim();
      if (!(g >= 1 && g <= (ctx.n || 0))) { bad.push({ line: l, why: '没有 G' + g + ' 这一组' }); return; }
      if (cats.indexOf(cat) < 0) { bad.push({ line: l, why: '「' + cat + '」不在可选的分类里' }); return; }
      if (seen[g]) { bad.push({ line: l, why: 'G' + g + ' 第二次出现，只认第一次' }); return; }
      seen[g] = 1;
      items.push({ g: g, cat: cat, why: [c[2], c[3]].filter(Boolean).join(' | ').slice(0, REMARK_MAX) });
    });
    return { ok: true, items: items, bad: bad };
  }

  return { VERSION: VERSION, AI_MAX_ROWS: AI_MAX_ROWS, changesOf: changesOf, HEAD: HEAD, MODE_NAME: MODE_NAME, MODE_OF: MODE_OF, FLAG_OF: FLAG_OF, REMARK_MAX: REMARK_MAX,
           mask: mask, personal: personal, exportText: exportText, replyHead: replyHead, parseReply: parseReply,
           GROUP_HEAD: GROUP_HEAD, groupHead: groupHead, groupText: groupText, groupLine: groupLine, isGenericDesc: isGenericDesc, GENERIC_DESC: GENERIC_DESC, parseGroupReply: parseGroupReply };
});
