// 记问 · 账单导入 · 导入方案（纯计算，第一期 ⑥a）
// 方案 = 三步（parse → route → match）算出来的结果 + 你在确认页上的改动。确认页上的数字全从这里出：
// 汇总、每个文件 × 收支的差额拆解、按钮上的笔数、要你定的几块、明细分组。改了东西就再调一次 plan()，不重跑三步。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportPlan，Node 里直接 require。不碰页面、存储。
//
// 改动（edits），都按单号键（route 给每一行的 key）存：
//   rows[key]  = { exclude, cat, mode: 'normal'|'flow'|'skip', split, pay, pick: 'new' | 'drop' | { record } | { row }, asRefund: { record } | { row } }
//     asRefund（1.1，1016-Z2）：一笔收入「当作退款，挂到某一笔」（AA 收回的钱、跨月退款、换渠道赔付），挂到账本里的一条支出或这一批的一笔支出
//   cpCats[清洗后的对方] = 分类          未分类按对方归组，一组选一次
//   newCats[分类名] = { on, into, picked }  新建分类：建不建、不建就并到哪个已有分类；picked = 你在下拉里手动选过「并到」（1016-J：只有它存对照）
//   receipt    收款按天合并（默认 true）
//   petty[键]  疑似零碎扣款合不合并（默认 false）
//   没见过的交易类型 / 状态怎么处理会牵连别的行，不在这里：由确认页带着临时规则重跑 route、match。
//   sums[多笔合一的组 id] = 第几种凑法（数字）| 'none'    （1016-C）不改就一直待处理
//   ruleFix[关键词] = 新分类   （1.1，1016-Y）你的规则归的分类在确认页被改掉、选了「以后都改」：这条规则命中的行都改，写入时改规则
//   nearPay    （1.1，1016-X）金额相近、分类对得上自动合并的那几条手记，一键改成实付金额（默认 false：手记金额不动）
//              1017-D 起每一笔也能自己定：rows[key].pay = true（改成实付）/ false（按手记金额），没定的跟 nearPay 走；「分开记」就是 rows[key].split
//
// 1016-C：
//   待处理按手记 / 按账单归组（sections.pendGroups）：一组里一条手记被选走了，同组里只能配它的账单自动改成新增；
//     几条手记都被选完了，剩下的账单也自动新增。「都不是」= 这一组每笔都选「作为新增」。
//   多笔合一（sections.sums）：确认后这几笔都合并到那条手记（手记金额不变），同组没用上的账单自动新增。
//   转账往来（sections.transfers）：只认交易类型（微信转账、各种微信红包，支付宝转账红包），相邻两笔隔不到 3 天串成一段，
//     一段里有转出也有转入才列出来；「都标成不计」就是把这几笔的 mode 改成 'skip'，汇总和差额跟着变，合计照旧差 0 分。
//   合并记录（分分捐、收款按天、勾上的零碎扣款）在明细里显示成一行（groups 里的 { summary: true }），点开看每一笔；
//     分分捐默认分类：存档里有公益类分类就用它，没有用「其他」。合并记录不进「按对方选分类」，不计的行也不进。
//   全额退款的弱提醒（sections.refundHints）：所有配对做完以后，3 天内同金额的手记没被别的账单合并掉，才挂一句，不算待处理。
//   套话（「收款方备注:二维码收款」这类）不当标题、不写进备注：每行的 title / note 见 cleanDesc。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportPlan = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1021-T2';
  // 1021-T2：支付宝不带后缀的退款（商品说明以「退款」开头、收 / 支不是支出），和 route.js 的 isAliRefundDescRow 同一条（测试比对）
  function isAliRefundDesc(r) { return !(r.noRest && r.noRest[0] === '_') && r.io !== 'expense' && /^\s*退款/.test(r.desc || ''); }
  // 1.1（1016-Z）异常金额提醒的参考值。都是先拍的数，标「待真实数据调」：用真实账单跑过以后再定（目标是每次导入只提醒几笔）
  var AMOUNT = {
    RATIO: 5,              // 比这个分类平时大多数单笔（第 80 百分位）高 5 倍以上……（待真实数据调）
    MIN_FEN: 20000,        // ……而且超过 200 元，才算「高很多」（待真实数据调）
    HISTORY_MIN: 5,        // 这个分类至少有 5 笔以前的支出才算「有历史」（待真实数据调）
    NEW_CAPS: { '餐饮': 50000, '交通出行': 100000 },   // 没历史时用的单笔参考上限：餐饮 500、交通 1000（按内置大类名，待真实数据调）
    BIG_FEN: 200000,       // 不管哪类，单笔超过 2000 元单列出来（待真实数据调）
    BIG_TOP: 3,            // 本次最大的 3 笔也单列……（待真实数据调）
    BIG_TOP_MIN: 50000     // ……但不到 500 元的不算「大额」（免得小账单也列出来，待真实数据调）
  };
  var GROUPS = ['add', 'merge', 'pending', 'refund', 'neutral', 'skip', 'error', 'excluded'];
  var GROUP_NAME = { add: '新增', merge: '和手记合并', pending: '待你确认', refund: '退款', neutral: '不计', skip: '跳过', error: '出错', excluded: '你勾掉的' };
  // 差额拆解的各项（按这个顺序列）
  var PARTS = [['newNormal', '新增（计入）'], ['newFlow', '新增（往来）'], ['neutral', '不计'], ['merge', '和手记合并'],
               ['refund', '退款'], ['pending', '待你确认'], ['skip', '跳过'], ['excluded', '你勾掉的'],
               ['aliRefund', '支付宝统计里已扣掉的退款']];   // 1016-I：支付宝头部的「支出」是扣掉退款以后的，这一项是负数
  var IOS = ['expense', 'income', 'neutral'];
  var IO_NAME = { expense: '账单支出', income: '账单收入', neutral: '账单不计收支' };

  function cleaner() {
    if (typeof JiwenImportClassify !== 'undefined') return JiwenImportClassify.cleanCp;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./classify.js').cleanCp;
    // 页面上没载入 classify.js（只在线程里有）：用同样的规则的简化版，只用来归组显示
    return function (s) { var t = String(s || '').replace(/[（(【\[][^（()）【】\[\]]*[)）】\]]/g, '').trim(); return t.length >= 2 ? t : String(s || ''); };
  }
  function yuan(fen) {
    var neg = fen < 0, a = Math.abs(fen), y = Math.floor(a / 100), f = a % 100;
    return (neg ? '-' : '') + String(y).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + (f < 10 ? '0' : '') + f;
  }
  // 商品说明里的套话：「某某备注:」后面是二维码收款、微信转账这种，当没写；是付款人自己写的话，去掉前缀留下那句话
  var BOILER = ['二维码收款', '微信转账', '转账', '收款', '红包', '微信红包', '付款', '扫码付款', '转账给你', '/', '无', '-'];
  function cleanDesc(desc) {
    var s = String(desc == null ? '' : desc).trim();
    var m = /^[^:：]{0,8}备注[:：]\s*([\s\S]*)$/.exec(s);
    if (m) s = m[1].trim();
    return BOILER.indexOf(s) >= 0 ? '' : s;
  }
  function pettyCat(cats) {
    for (var i = 0; i < cats.length; i++) if (/公益|慈善|捐/.test(cats[i])) return cats[i];
    if (cats.indexOf('其他') >= 0) return '其他';
    if (cats.indexOf('其它') >= 0) return '其它';
    return '未分类';
  }
  function isTransferKind(app, kind) { kind = kind || ''; return app === 'wechat' ? (kind === '转账' || /微信红包/.test(kind)) : app === 'alipay' && kind === '转账红包'; }
  function minOf(t) { var d = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 60000; return d + (+t.slice(11, 13) || 0) * 60 + (+t.slice(14, 16) || 0); }
  function md(t) { return (+t.slice(5, 7)) + ' 月 ' + (+t.slice(8, 10)) + ' 日'; }
  var TRANSFER_GAP = 3 * 1440;
  function refundish(it) { return it.why === 'refundcands' || !!(it.cands && it.cands[0] && it.cands[0].row); }

  // input = { parsed, matched, info: { cats, isNewUser }, manualById: { id: { time, fen, cat, type, mode } }, overlaps: [{ app, from, to }] }
  function plan(input, edits) {
    edits = edits || {};
    var E = edits.rows || {}, cpCats = edits.cpCats || {}, ncE = edits.newCats || {}, pettyE = edits.petty || {}, sumsE = edits.sums || {};
    // 1017-D：金额差一点的，哪几笔改成实付：这一笔自己定过（rows[key].pay）就按它，没定过跟「全部改成实付」（edits.nearPay）走
    var payOf = function (d) { var e = E[d.key]; return e && e.pay !== undefined ? !!e.pay : !!edits.nearPay; };
    var ruleFixE = edits.ruleFix || {};
    var receiptOn = edits.receipt !== false;
    var parsed = input.parsed, matched = input.matched, info = input.info || {}, manualById = input.manualById || {};
    var clean = cleaner();
    var cats = info.cats || [];
    var newCatsIn = matched.newCats || [];
    var ncPlan = {};
    newCatsIn.forEach(function (c) {
      var e = ncE[c.name] || {};
      ncPlan[c.name] = { on: e.on !== undefined ? !!e.on : !!c.defaultOn,
                         into: e.into !== undefined ? e.into : (info.isNewUser ? c.mergeInto : null) };
      var np = ncPlan[c.name]; np.picked = !np.on && !!np.into && np.into !== '未分类' && e.into !== undefined && !!e.picked;
    });
    function recCat(rec) {
      if (!rec) return '未分类';
      if (rec.newCat && ncPlan[rec.newCat]) { var p = ncPlan[rec.newCat]; return p.on ? rec.newCat : (p.into || '未分类'); }
      return rec.cat || '未分类';
    }

    // ---- 每一项 → 一行（含出错、重复）----
    var byRef = {}, rows = [];
    matched.items.forEach(function (it) {
      var f = parsed.files[it.file], d;
      if (it.src === 'row') {
        var r = f.rows[it.row];
        d = { key: it.key, file: it.file, row: it.row, src: 'row', app: f.app, units: it.units, bucket0: it.bucket, group: it.bucket,
              time: r.time, sec: r.sec, fen: r.fen, pio: r.io, cp: r.cp, desc: r.desc, remark: r.remark, kind: r.kind, status: r.status,
              mode: it.mode || 'normal', reason: it.msg || '', why: it.why, tags: [], cands: it.cands || null, into: it.into || null,
              refundTo: it.refundTo || null, item: it, title: cleanDesc(r.desc) || r.cp || '', note: cleanDesc(r.desc) };
        if (r.joined) d.tags.push('joined');
        if (r.noNote) d.tags.push('noNote');
        if (it.flags && it.flags.indexOf('neutralVsNormal') >= 0) d.tags.push('neutralVsNormal');
        if (it.flags && it.flags.indexOf('otherType') >= 0) d.tags.push('otherType');
        if (it.flags && it.flags.indexOf('otherStatus') >= 0) d.tags.push('otherStatus');
        byRef[it.file + ':' + it.row] = d;
      } else if (it.src === 'dup') {
        var dp = f.dups[it.dup];
        d = { key: null, file: it.file, src: 'dup', app: f.app, units: 1, bucket0: 'skip', group: 'skip', fen: dp.fen, pio: dp.io, reason: it.msg, why: it.why, tags: [], time: '', line: dp.line };
      } else {
        var er = f.errors[it.err];
        d = { key: null, file: it.file, src: 'error', app: f.app, units: 1, bucket0: 'error', group: 'error', fen: null, pio: null, reason: er.msg, why: er.code, tags: [], time: '', line: er.line, raw: er.raw };
      }
      rows.push(d);
    });

    // ---- 套上改动 ----
    var pickedRecords = {};
    rows.forEach(function (d) { if (d.src === 'row' && d.group === 'merge' && !(E[d.key] || {}).split) pickedRecords[d.into] = d.key; });
    // 多笔合一：确认了某种凑法 → 这几笔合并到那条手记；同组没用上的、选了「都不是」的 → 新增
    var msums = matched.multiSums || [], byKeyRef = {};
    rows.forEach(function (d) { if (d.src === 'row') byKeyRef[d.file + ':' + d.row] = d; });
    var inGroup0 = {}; (matched.summaries || []).forEach(function (g) { (g.items || []).forEach(function (r) { inGroup0[r.file + ':' + r.row] = true; }); });
    msums.forEach(function (g) {
      var e = sumsE[g.id];
      if (e === undefined || e === null) return;
      var opt = typeof e === 'number' ? g.options[e] : null;
      if (opt && pickedRecords[opt.record]) opt = null;
      var inOpt = {};
      if (opt) opt.bills.forEach(function (b) { inOpt[b.file + ':' + b.row] = true; });
      rows.forEach(function (d) {
        if (d.src !== 'row' || d.item.msum !== g.id || d.group !== 'pending') return;
        if (opt && inOpt[d.file + ':' + d.row]) { d.group = 'merge'; d.into = opt.record; d.viaSum = g.id; d.reason = '这几笔加起来正好是这条手记，合并'; pickedRecords[opt.record] = d.key; }
        else if (opt || e === 'none') { d.group = 'add'; d.reason = e === 'none' ? '多笔合一选了「都不是」，作为新增' : '同组里别的几笔合并了，这笔作为新增'; d.autoNew = true; }
      });
      // 1017-UI4：跨天的选法里，账单可能不在这一组（这条手记 3 天内另一笔金额正好相等的账单）：选了就把它合并过来
      if (opt && opt.kind === 'far') opt.bills.forEach(function (b) {
        var x = byKeyRef[b.file + ':' + b.row];
        if (!x || x.item.msum === g.id || (x.group !== 'add' && x.group !== 'pending')) return;
        x.group = 'merge'; x.into = opt.record; x.viaSum = g.id; x.reason = '多笔合一那组里选了它，和这条手记合并'; pickedRecords[opt.record] = x.key;
      });
    });
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      var e = E[d.key] || {};
      var it = d.item;
      if (d.group === 'merge' && !d.viaSum) {
        if (e.split) { d.group = 'add'; d.into = null; d.reason = '拆开了，改为新增'; d.splitFrom = it.into; }
      }
      if (d.group === 'pending' && e.pick && !(it.msum && e.pick.record)) {
        if (e.pick === 'drop') { d.group = 'excluded'; d.reason = '待你确认里选了「不要了」'; }
        else if (e.pick === 'new') {
          if (refundish(it)) { d.group = 'refund'; d.mode = 'flow'; d.reason = '不挂原单，按往来导入'; }
          else { d.group = 'add'; d.reason = '待你确认里选了「作为新增」'; }
        } else if (e.pick.record && !refundish(it)) {
          if (!pickedRecords[e.pick.record] && (it.cands || []).some(function (c) { return c.record === e.pick.record; })) { d.group = 'merge'; d.into = e.pick.record; d.reason = '待你确认里选了和这条手记合并'; pickedRecords[e.pick.record] = d.key; }
        } else if (e.pick.record || e.pick.row) { d.group = 'refund'; d.refundTo = e.pick; d.reason = '待你确认里选了挂到这笔原单'; }
      }
      // 1.1（1016-Z2）：收入当作退款挂到某一笔（分类、口径跟原单走；退款总额不超过原单由页面上挑候选时管）
      if (e.asRefund && d.pio === 'income' && (d.group === 'add' || d.group === 'neutral') && !inGroup0[d.file + ':' + d.row]) {
        d.group = 'refund'; d.refundTo = e.asRefund.record ? { record: e.asRefund.record } : { row: e.asRefund.row }; d.mode = 'normal'; d.asRefund = true;
        d.reason = '你把它当作退款，挂到了一笔支出上';
      }
      if (e.exclude && (d.group === 'add' || d.group === 'neutral' || d.group === 'refund')) { d.group = 'excluded'; d.reason = '你勾掉了'; }
      if (e.mode && (d.group === 'add' || d.group === 'neutral')) d.mode = e.mode;
      // 1016-G：口径改成不计的挪进「不计」组，不计改回计入 / 往来的挪回「新增」，顶上的笔数跟着变
      if (d.group === 'add' && d.mode === 'skip') d.group = 'neutral';
      else if (d.group === 'neutral' && d.mode !== 'skip') d.group = 'add';
    });
    // 按手记 / 按账单归组：只能配手记的待处理账单，候选手记都被选走了 → 自动新增（同组里另一笔合并了）
    var pendRows = rows.filter(function (d) { return d.src === 'row' && d.bucket0 === 'pending' && !d.item.msum && d.cands && d.cands.length && !refundish(d.item); });
    rows.forEach(function (d) {
      if (pendRows.indexOf(d) < 0 || d.group !== 'pending') return;
      if (d.cands.every(function (c) { return pickedRecords[c.record]; })) { d.group = 'add'; d.reason = '同组里别的账单和手记合并了，这笔作为新增'; d.autoNew = true; }
    });
    // 退款挂到以前导入的那笔：写明是哪天的（1016-F）
    rows.forEach(function (d) {
      if (d.src === 'row' && d.group === 'refund' && d.refundTo && d.refundTo.record && d.item.toTime && !(E[d.key] && E[d.key].pick)) d.reason = '退款挂到 ' + md(d.item.toTime) + '那笔';
    });
    // 原单勾掉了：挂在它上面的退款也不导入
    rows.forEach(function (d) {
      if (d.group !== 'refund' || !d.refundTo || !d.refundTo.row) return;
      var o = byRef[d.refundTo.row.file + ':' + d.refundTo.row.row];
      if (o && o.group === 'excluded') { d.group = 'excluded'; d.reason = '原单没导入，这笔退款也不导入'; }
    });

    // ---- 分类（先不管「按对方选分类」，看哪些还是未分类）----
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      var it = d.item, e = E[d.key] || {};
      if (d.group === 'merge') { var m = manualById[d.into]; d.cat = m ? m.cat : '未分类'; d.catFrom = 'manual'; return; }
      if (d.group === 'refund' && d.refundTo && d.refundTo.row) { d.catFrom = 'orig'; return; }      // 下面跟着原单
      if (e.cat) { d.cat = e.cat; d.catFrom = 'edit'; return; }
      if (d.splitFrom) { var sm = manualById[d.splitFrom]; d.cat = sm ? sm.cat : '未分类'; d.catFrom = 'split'; return; }
      d.cat = recCat(it.rec); d.catFrom = 'rec'; d.rec = it.rec || null;
      if (it.rec && it.rec.layer === 'rule' && it.rec.kw && ruleFixE[it.rec.kw]) { d.cat = ruleFixE[it.rec.kw]; d.catFrom = 'rulefix'; }
    });
    // 合并记录（分分捐、收款按天、勾上的零碎扣款）：分分捐默认落公益类 / 其他；都不进「按对方选分类」
    var inGroup = {}, sumList = [];
    (matched.summaries || []).forEach(function (g) {
      if (g.kind === 'receipt' && !receiptOn) return;
      var o = { id: g.id, kind: g.kind, app: g.app, period: g.period, appendTo: g.appendTo || null, label: g.kind === 'petty' ? g.oc : '收款汇总', refs: g.items };
      sumList.push(o); g.items.forEach(function (r) { inGroup[r.file + ':' + r.row] = o; });
    });
    var pettyIn = (matched.suspects || []).map(function (x) { return x.app + '|' + x.cp + '|' + x.month; });
    (matched.suspects || []).forEach(function (x, i) {
      if (!pettyE[pettyIn[i]]) return;
      var o = { id: 'Z' + i, kind: 'suspect', app: x.app, period: x.month, appendTo: null, label: clean(x.cp), refs: [] };
      x.items.forEach(function (r) { if (!inGroup[r.file + ':' + r.row]) { inGroup[r.file + ':' + r.row] = o; o.refs.push(r); } });
      if (o.refs.length) sumList.push(o);
    });
    var pCat = pettyCat(cats);
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      var g = inGroup[d.file + ':' + d.row];
      if (!g || (d.group !== 'add' && d.group !== 'neutral')) return;
      d.summary = g.id;
      if (g.kind === 'petty' && d.catFrom === 'rec') { d.cat = pCat; d.catFrom = 'summary'; }
      else if (d.catFrom === 'rec') d.catFrom = 'summaryRec';
    });
    // 1016-G：转账往来段里的行（按交易类型认、相邻隔不到 3 天、有出有进）不进「按对方选分类」，免得要定两遍
    var trKeys = {};
    (function () {
      var dirOf = function (d) { var it = d.item; return (it.io === 'income' || it.io === 'expense') ? it.io : (it.dir || (d.pio === 'income' ? 'income' : 'expense')); };
      var tr = rows.filter(function (d) { return d.src === 'row' && (d.group === 'add' || d.group === 'neutral') && !d.summary && isTransferKind(d.app, d.kind); })
        .sort(function (a, b) { return minOf(a.time) - minOf(b.time) || (a.key < b.key ? -1 : 1); });
      var ps = [], cur = null;
      tr.forEach(function (d) { if (!cur || minOf(d.time) - minOf(cur.last.time) >= TRANSFER_GAP) ps.push(cur = { rows: [] }); cur.rows.push(d); cur.last = d; });
      ps.forEach(function (p) {
        if (p.rows.length >= 2 && p.rows.some(function (d) { return dirOf(d) === 'income'; }) && p.rows.some(function (d) { return dirOf(d) === 'expense'; }))
          p.rows.forEach(function (d) { trKeys[d.key] = true; });
      });
    })();
    // 未分类按对方归组，一组选一次
    var cpg = {};
    rows.forEach(function (d) {
      if (d.src !== 'row' || d.catFrom !== 'rec' || d.cat !== '未分类') return;
      // 1016-H：待你确认的不进，等选成新增（「都不是」或被自动作为新增）再进；不计的、转账往来里的也不用选
      if (['add', 'refund'].indexOf(d.group) < 0 || d.mode === 'skip' || trKeys[d.key]) return;
      var k = clean(d.cp) || '（没有交易对方）';
      var g = cpg[k] || (cpg[k] = { cp: k, n: 0, fen: 0, min: Infinity, max: -Infinity, hours: {}, keys: [], wd: 0, we: 0 });
      g.n += d.units; g.fen += d.fen; g.min = Math.min(g.min, d.fen); g.max = Math.max(g.max, d.fen); g.keys.push(d.key);
      var h = +d.time.slice(11, 13); g.hours[h] = (g.hours[h] || 0) + 1;
      var wk = new Date(Date.UTC(+d.time.slice(0, 4), +d.time.slice(5, 7) - 1, +d.time.slice(8, 10))).getUTCDay();
      if (wk === 0 || wk === 6) g.we++; else g.wd++;
      if (cpCats[k]) { d.cat = cpCats[k]; d.catFrom = 'cpgroup'; }
    });
    rows.forEach(function (d) {
      if (d.catFrom !== 'orig') return;
      var o = byRef[d.refundTo.row.file + ':' + d.refundTo.row.row];
      d.cat = o ? o.cat : '未分类';
    });

    // ---- 时间重叠：新增落在同一来源以前导入过的时间段里 ----
    (input.overlaps || []).forEach(function (ov) {
      rows.forEach(function (d) {
        if (d.src === 'row' && d.group === 'add' && d.app && ov.apps && ov.apps.indexOf(d.app) >= 0 && d.time.slice(0, 10) >= ov.from && d.time.slice(0, 10) <= ov.to && d.tags.indexOf('overlap') < 0) d.tags.push('overlap');
      });
    });

    // ---- 记录的方向（金额前面的正负号）----
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      var it = d.item;
      d.type = d.group === 'refund' ? 'income' : (it.io === 'income' || it.io === 'expense') ? it.io : (it.dir || (d.pio === 'income' ? 'income' : 'expense'));
      var g = d.group;
      d.canExclude = g === 'add' || g === 'neutral' || (g === 'refund' && !(d.refundTo && d.refundTo.row));
      d.canCat = (g === 'add' || g === 'neutral' || g === 'pending') && d.catFrom !== 'orig';
      d.canMode = g === 'add' || g === 'neutral';
      d.canSplit = g === 'merge' && d.bucket0 === 'merge';
      d.canPick = d.bucket0 === 'pending' && !(d.autoNew && d.item.msum) && !d.viaSum && !(d.item.msum && sumsE[d.item.msum] !== undefined && sumsE[d.item.msum] !== null);
      d.canRestore = g === 'excluded' && !!(E[d.key] && (E[d.key].exclude || E[d.key].pick === 'drop'));
    });

    // ---- 汇总 ----
    var counts = {}, sums = {};
    GROUPS.forEach(function (g) { counts[g] = 0; sums[g] = 0; });
    rows.forEach(function (d) { counts[d.group] += d.units; if (d.fen !== null) sums[d.group] += d.fen; });
    var importN = counts.add + counts.neutral + counts.refund, mergeM = counts.merge;

    // ---- 每个文件 × 收支的差额拆解 ----
    var files = parsed.files.map(function (f, fi) {
      var o = { name: f.name, app: f.app, format: f.format, range: f.range, fatal: f.fatal || null,
                countOk: f.fatal ? null : f.stats.countOk, headerTotal: f.fatal ? null : f.stats.header.total,
                parsedTotal: f.fatal ? 0 : f.stats.parsed.total, errors: f.fatal ? 0 : f.errors.length, diff: {} };
      if (f.fatal) return o;
      IOS.forEach(function (io) {
        var parts = {}; PARTS.forEach(function (p) { parts[p[0]] = { n: 0, fen: 0 }; });
        var mergeDelta = 0;
        rows.forEach(function (d) {
          if (d.file !== fi || d.pio !== io || d.fen === null) return;
          var k;
          if (d.group === 'add' || d.group === 'neutral') k = d.mode === 'skip' ? 'neutral' : d.mode === 'flow' ? 'newFlow' : 'newNormal';
          else if (d.group === 'merge') { k = 'merge'; var m = manualById[d.into]; if (m && !d.viaSum && !(d.why === 'near' && d.into === d.item.into && payOf(d))) mergeDelta += m.fen - d.fen; }
          else k = d.group;
          parts[k].n += d.units; parts[k].fen += d.fen;
        });
        // 支付宝：这份文件里所有退款行（状态退款成功、单号带后缀）的金额，支付宝已经从「支出」合计里扣掉了
        //   1021-T2：商品说明以「退款」开头、单号不带后缀的退款，头部扣不扣还没核对：几种算法都试，哪种对得上用哪种（aliMode），确认页写一句
        //     all = 带后缀的 + 不带后缀的全部；neutral = 带后缀的 + 不带后缀里收 / 支写不计收支的；suffix = 只有带后缀的（原来的算法）
        var aliMode = null;
        if (f.app === 'alipay' && io === 'expense') {
          var h0 = f.stats.header[io], base = 0;
          PARTS.forEach(function (p) { base += parts[p[0]].fen; });
          var A = { suffix: { n: 0, fen: 0 }, neutral: { n: 0, fen: 0 }, all: { n: 0, fen: 0 } }, anyDesc = false;
          f.rows.forEach(function (r) {
            var sfx = r.status === '退款成功' && r.noRest && r.noRest[0] === '_', dsc = !sfx && isAliRefundDesc(r);
            if (dsc) anyDesc = true;
            ['suffix', 'neutral', 'all'].forEach(function (m) {
              if (sfx || (dsc && (m === 'all' || (m === 'neutral' && r.io === 'neutral')))) { A[m].n += r.merged || 1; A[m].fen -= r.fen; }
            });
          });
          var order = anyDesc ? ['all', 'neutral', 'suffix'] : ['suffix'], pick = order[0];
          if (h0 && anyDesc) {
            var hit = order.filter(function (m) { return h0.fen - base - A[m].fen === 0; })[0];
            pick = hit || order.slice().sort(function (a, b) { return Math.abs(h0.fen - base - A[a].fen) - Math.abs(h0.fen - base - A[b].fen); })[0];
          }
          parts.aliRefund.n = A[pick].n; parts.aliRefund.fen = A[pick].fen;
          if (anyDesc) aliMode = pick;
        }
        var h = f.stats.header[io], sum = 0;
        PARTS.forEach(function (p) { sum += parts[p[0]].fen; });
        var unreadable = h ? h.fen - sum : null;
        o.diff[io] = { title: IO_NAME[io], header: h, parts: PARTS.map(function (p) { return { key: p[0], label: p[1], n: parts[p[0]].n, fen: parts[p[0]].fen }; }),
                       sum: sum, unreadable: unreadable, ok: h ? (unreadable === 0 || (o.errors > 0 && unreadable >= 0)) : null, mergeDelta: mergeDelta };
        if (aliMode) o.diff[io].aliMode = aliMode;
      });
      return o;
    });
    var blocking = files.filter(function (f) { return f.countOk === false; });
    var good = files.filter(function (f) { return !f.fatal; });
    var canImport = !blocking.length && good.length > 0 && (importN + mergeM > 0 || counts.pending > 0 || counts.excluded > 0);   // 1016-F：只有待处理 / 勾掉的也能「导入」（存进待处理池、登记忽略）

    // ---- 要你定的几块 ----
    var sec = {};
    var tmap = {}, smap = {};
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      if (d.tags.indexOf('otherType') >= 0) { var k = d.app + '|' + d.kind; (tmap[k] = tmap[k] || { app: d.app, type: d.kind, n: 0, fen: 0 }).n += d.units; tmap[k].fen += d.fen; }
      if (d.tags.indexOf('otherStatus') >= 0) { var s = d.app + '|' + d.status; (smap[s] = smap[s] || { app: d.app, status: d.status, n: 0, fen: 0 }).n += d.units; smap[s].fen += d.fen; }
    });
    sec.unknownTypes = Object.keys(tmap).map(function (k) { return tmap[k]; });
    sec.unknownStatuses = Object.keys(smap).map(function (k) { return smap[k]; });
    var rc = (matched.summaries || []).filter(function (g) { return g.kind === 'receipt'; });
    sec.receipt = rc.length ? { on: receiptOn, days: rc.length, n: rc.reduce(function (s, g) { return s + g.count; }, 0), fen: rc.reduce(function (s, g) { return s + g.fen; }, 0) } : null;
    sec.petty = (matched.suspects || []).map(function (x) { var k = x.app + '|' + x.cp + '|' + x.month; return { key: k, app: x.app, cp: x.cp, month: x.month, n: x.count, fen: x.fen, on: !!pettyE[k] }; });
    // 1.1（1016-X）：金额相近、分类对得上自动合并的（多半是立减、红包）：手记比实付多多少；确认页可一键改成实付
    var nm = rows.filter(function (d) { return d.src === 'row' && d.group === 'merge' && d.why === 'near' && d.into === d.item.into && manualById[d.into]; });
    //   1017-D：每一笔能自己定改不改成实付（pays[key]）；pay = 这几笔都改成实付；payFen = 改成实付的那几笔差多少
    var nmPays = {}; nm.forEach(function (d) { nmPays[d.key] = payOf(d); });
    sec.nearMerged = nm.length ? { n: nm.length, fen: nm.reduce(function (s0, d) { return s0 + (manualById[d.into].fen - d.fen); }, 0), pay: nm.every(payOf),
                                   pays: nmPays, payN: nm.filter(payOf).length, payFen: nm.filter(payOf).reduce(function (s0, d) { return s0 + (manualById[d.into].fen - d.fen); }, 0),
                                   keys: nm.map(function (d) { return d.key; }) } : null;
    sec.newCats = newCatsIn.map(function (c) { var p = ncPlan[c.name]; return { name: c.name, count: c.count, on: p.on, into: p.into, picked: p.picked, defaultOn: !!c.defaultOn }; });
    sec.cpGroups = Object.keys(cpg).map(function (k) {
      var g = cpg[k], hb = null, hn = 0;
      Object.keys(g.hours).forEach(function (h) { if (g.hours[h] > hn) { hn = g.hours[h]; hb = +h; } });
      var hour = hn * 2 > g.keys.length ? hb : null;
      return { cp: g.cp, n: g.n, fen: g.fen, min: g.min, max: g.max, hour: hour, cat: cpCats[k] || null, keys: g.keys,
               hint: patternHint(g.keys.length, g.wd, g.we, g.hours) };
    }).sort(function (a, b) { return b.n - a.n || b.fen - a.fen; });
    var notes = { neutralVsNormal: [], joined: [], noNote: [], overlap: [] };
    rows.forEach(function (d) { d.tags.forEach(function (t) { if (notes[t] && d.key) notes[t].push(d.key); }); });
    sec.notes = notes;

    // ---- 待处理按手记 / 按账单归组（1016-C）----
    var pg = [], seenP = {};
    pendRows.forEach(function (d) {
      if (seenP[d.key]) return;
      // 连通块：账单 ↔ 候选手记
      var B = [], M = [], qb = [d]; seenP[d.key] = true;
      while (qb.length) {
        var x = qb.shift(); B.push(x);
        x.cands.forEach(function (c) {
          if (M.indexOf(c.record) < 0) M.push(c.record);
          pendRows.forEach(function (y) { if (!seenP[y.key] && y.cands.some(function (cc) { return cc.record === c.record; })) { seenP[y.key] = true; qb.push(y); } });
        });
      }
      B.sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
      var kind = B.length === 1 ? 'byBill' : M.length === 1 ? 'byManual' : 'many';
      var open = B.filter(function (b) { return b.group === 'pending'; }).length;
      var used = M.filter(function (id) { return pickedRecords[id]; });
      pg.push({ id: 'P:' + B[0].key, kind: kind, keys: B.map(function (b) { return b.key; }), records: M, used: used, open: open,
                fen: kind === 'byManual' && manualById[M[0]] ? manualById[M[0]].fen : null,
                text: kind === 'byManual' ? '你记的 ' + (manualById[M[0]] ? yuan(manualById[M[0]].fen) : '') + ' 元，可能是下面 ' + B.length + ' 笔中的一笔'
                    : kind === 'byBill' ? null : B.length + ' 笔账单、' + M.length + ' 条手记互相都可能是，一笔一笔选；手记选完了，剩下的自动作为新增' });
    });
    sec.pendGroups = pg;
    // ---- 多笔合一 ----
    sec.sums = msums.map(function (g) {
      var e = sumsE[g.id];
      return { id: g.id, suggest: g.suggest, chosen: e === undefined ? null : e,
               keys: rows.filter(function (d) { return d.src === 'row' && d.item.msum === g.id; }).map(function (d) { return d.key; }),
               options: g.options.map(function (o) {
                 var m = manualById[o.record];
                 return { record: o.record, fen: o.fen, kind: o.kind, days: o.days || 0, keys: o.bills.map(function (b) { var x = byKeyRef[b.file + ':' + b.row]; return x ? x.key : null; }),
                          manual: m ? { time: m.time, cat: m.cat, fen: m.fen } : null,
                          text: (o.bills.length === 1 ? '这笔 ' + yuan(o.fen) + ' 元正好是你记的那条' : '这 ' + o.bills.length + ' 笔加起来正好是你记的 ' + yuan(o.fen) + ' 元')
                                + (m ? '（' + md(m.time) + ' ' + (m.cat || '未分类') + (o.bills.length === 1 ? ' · ' + yuan(m.fen) : '') + '）' : '') + (o.kind === 'far' ? '，差 ' + o.days + ' 天' : '') };
               }) };
    });
    // ---- 转账往来：只认交易类型；相邻两笔隔不到 3 天串成一段；一段里有转出也有转入才列 ----
    var tr = rows.filter(function (d) { return d.src === 'row' && (d.group === 'add' || d.group === 'neutral') && !d.summary && isTransferKind(d.app, d.kind) && (d.type === 'income' || d.type === 'expense'); })
      .sort(function (a, b) { return minOf(a.time) - minOf(b.time) || (a.key < b.key ? -1 : 1); });
    var periods = [], cur = null;
    tr.forEach(function (d) {
      if (!cur || minOf(d.time) - minOf(cur.last.time) >= TRANSFER_GAP) periods.push(cur = { rows: [] });
      cur.rows.push(d); cur.last = d;
    });
    sec.transfers = periods.filter(function (p) {
      return p.rows.length >= 2 && p.rows.some(function (d) { return d.type === 'income'; }) && p.rows.some(function (d) { return d.type === 'expense'; });
    }).map(function (p, i) {
      var people = {}, out = 0, inn = 0;
      p.rows.forEach(function (d) {
        var k = clean(d.cp) || '（没有交易对方）', x = people[k] || (people[k] = { cp: k, n: 0, out: 0, in: 0 });
        x.n++; if (d.type === 'income') { x.in += d.fen; inn += d.fen; } else { x.out += d.fen; out += d.fen; }
      });
      var ps = Object.keys(people).map(function (k) { var x = people[k]; x.net = x.in - x.out; return x; }).sort(function (a, b) { return (b.in + b.out) - (a.in + a.out) || (a.cp < b.cp ? -1 : 1); });
      return { id: 'T' + i, from: p.rows[0].time.slice(0, 10), to: p.rows[p.rows.length - 1].time.slice(0, 10), n: p.rows.length, out: out, in: inn, net: inn - out,
               people: ps, keys: p.rows.map(function (d) { return d.key; }),
               skipped: p.rows.filter(function (d) { return d.mode === 'skip'; }).map(function (d) { return d.key; }),
               allSkip: p.rows.every(function (d) { return d.mode === 'skip'; }) };
    });
    // ---- 全额退款的弱提醒：所有配对做完以后，手记没被别的账单合并掉才挂 ----
    sec.refundHints = [];
    rows.forEach(function (d) {
      if (d.src !== 'row' || d.why !== 'fullrefund' || !d.item.hintCands) return;
      var h = d.item.hintCands.filter(function (c) { return !pickedRecords[c.record]; })[0];
      if (!h) return;
      sec.refundHints.push({ key: d.key, record: h.record, fen: d.fen,
        text: '这笔 ' + yuan(d.fen) + ' 元已全额退款；你 ' + md(h.time) + '记的「' + (h.cat || '未分类') + ' · ' + yuan(h.fen) + '」如果就是它，那条手记可能要删掉或改成退款' });
    });

    // ---- 1.1（1016-Z）异常金额、大额：分类照常推荐、钱照常导入，只是列出来让你看一眼（理由写明）----
    //   info.catStats：{ 分类: { n: 以前的支出笔数, p80: 第 80 百分位（分）} }（主页面从账本里算好交进来）
    var cst = info.catStats || {}, checks = [], seenChk = {};
    var newRows = rows.filter(function (d) { return d.src === 'row' && (d.group === 'add' || d.group === 'neutral') && !inGroup[d.file + ':' + d.row]; });
    newRows.forEach(function (d) {
      if (d.group !== 'add' || d.mode !== 'normal' || d.pio !== 'expense' || !d.cat || d.cat === '未分类') return;
      var st = cst[d.cat], why = null;
      if (st && st.n >= AMOUNT.HISTORY_MIN && st.p80 > 0) {
        if (d.fen > AMOUNT.MIN_FEN && d.fen >= st.p80 * AMOUNT.RATIO) why = '比你平时' + d.cat + '单笔高很多（平时大多在 ' + yuan(st.p80) + ' 元以内）';
      } else {
        var want = d.rec && d.rec.want, cap = AMOUNT.NEW_CAPS[d.cat] || (want ? AMOUNT.NEW_CAPS[want] : 0);
        if (cap && d.fen > cap) why = '一般' + d.cat + '单笔不到 ' + yuan(cap) + ' 元';
      }
      if (why) { checks.push({ key: d.key, kind: 'abnormal', fen: d.fen, cat: d.cat, cp: d.cp, time: d.time, why: why }); seenChk[d.key] = true; if (d.tags.indexOf('abnormal') < 0) d.tags.push('abnormal'); }
    });
    var byFen = newRows.slice().sort(function (a, b) { return b.fen - a.fen; });
    byFen.forEach(function (d, i) {
      if (seenChk[d.key]) return;
      var big = d.fen > AMOUNT.BIG_FEN || (i < AMOUNT.BIG_TOP && d.fen >= AMOUNT.BIG_TOP_MIN);
      if (!big) return;
      checks.push({ key: d.key, kind: 'big', fen: d.fen, cat: d.cat, cp: d.cp, time: d.time, mode: d.mode,
                    why: (d.fen > AMOUNT.BIG_FEN ? '单笔超过 ' + yuan(AMOUNT.BIG_FEN) + ' 元' : '这次最大的几笔之一') + '，看看收支和「计入 / 不计」对不对' });
      if (d.tags.indexOf('big') < 0) d.tags.push('big');
    });
    sec.amountChecks = checks;

    // ---- 1.1（1016-Z4）提现服务费：微信「零钱提现」备注里写着「服务费¥2.20」的，零钱提现本身照旧不计，服务费单独记一笔支出 ----
    //   分类：存档里有「手续费」「服务费」就用，没有用「其他」，再没有就「未分类」。只在这笔提现这次真要写进去时记（再导时提现跳过，服务费也不会再记）
    var feeCat = ['手续费', '服务费', '其他', '其它'].filter(function (c) { return cats.indexOf(c) >= 0; })[0] || '未分类';
    sec.fees = [];
    rows.forEach(function (d) {
      if (d.src !== 'row' || d.group !== 'neutral' || d.app !== 'wechat' || !/零钱提现/.test(d.kind || '') || inGroup[d.file + ':' + d.row]) return;
      var m = /服务费\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/.exec(d.remark || '');
      var fen = m ? Math.round(parseFloat(m[1]) * 100) : 0;
      if (fen > 0) { d.feeFen = fen; sec.fees.push({ key: d.key, fen: fen, time: d.time }); }
    });
    sec.feeCat = feeCat;

    // ---- 要新建几条记录（分分捐、收款按天合并、勾上的零碎扣款合成一条）----
    var records = sec.fees.length, seenG = {};
    rows.forEach(function (d) {
      if (d.src !== 'row' || (d.group !== 'add' && d.group !== 'neutral' && d.group !== 'refund')) return;
      var g = inGroup[d.file + ':' + d.row];
      if (!g) { records++; return; }
      if (!seenG[g.id]) { seenG[g.id] = true; if (!g.appendTo) records++; }
    });
    // 要登记的单号：新增、不计、退款、合并，加上按净额并进手记的退款行
    var orders = 0;
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      if (['add', 'neutral', 'refund', 'merge'].indexOf(d.group) >= 0 || (d.group === 'skip' && d.item.register)) orders += d.units;
    });

    // ---- 要登记成「忽略」的单号（1016-C，⑥b 写入时用）：全额退款跳过的一对；已全额退款、退款不在文件里、你选了「不要了」的原单
    //      （微信再加一个退款记号键），以后退款行进来查到是忽略就跟着跳过，不会多出一笔收入
    var ignoreOrders = [];
    rows.forEach(function (d) {
      if (d.src !== 'row' || !d.item.regIgnore) return;
      if (d.group === 'skip' || (d.group === 'excluded' && d.why === 'fullnorefund')) d.item.regIgnore.forEach(function (k) { if (ignoreOrders.indexOf(k) < 0) ignoreOrders.push(k); });
    });
    sec.comboSkippedDays = (matched.stats && matched.stats.comboSkippedDays) || [];

    // ---- 明细分组（按时间倒序，和账单列表一样）----
    var groups = {};
    GROUPS.forEach(function (g) { groups[g] = []; });
    var sumRow = {};
    rows.forEach(function (d) {
      if (d.summary && (d.group === 'add' || d.group === 'neutral')) {
        var g = sumRow[d.summary];
        if (!g) {
          var sg = sumList.filter(function (x) { return x.id === d.summary; })[0];
          g = sumRow[d.summary] = { summary: true, id: d.summary, kind: sg.kind, app: sg.app, label: sg.label, period: sg.period, group: d.group, units: 0, fen: 0, time: '', members: [], cat: d.cat, appendTo: sg.appendTo, tags: [] };
          groups[d.group].push(g);
        }
        g.units += d.units; g.fen += d.fen; g.members.push(d); if (d.time > g.time) g.time = d.time;
        return;
      }
      groups[d.group].push(d);
    });
    Object.keys(sumRow).forEach(function (k) {
      var g = sumRow[k], per = g.kind === 'receipt' ? (+g.period.slice(5, 7)) + ' 月 ' + (+g.period.slice(8, 10)) + ' 日' : (+g.period.slice(5, 7)) + ' 月';
      g.title = g.label + ' · ' + per + ' · ' + g.units + ' 笔 · ' + yuan(g.fen) + ' 元';
      g.members.sort(function (a, b) { return b.time < a.time ? -1 : b.time > a.time ? 1 : 0; });
    });
    GROUPS.forEach(function (g) { groups[g].sort(function (a, b) { return (b.time || '') < (a.time || '') ? -1 : (b.time || '') > (a.time || '') ? 1 : 0; }); });

    return { version: VERSION, summaries: sumList, files: files, counts: counts, sums: sums, importN: importN, mergeM: mergeM, records: records, orders: orders,
             ignoreOrders: ignoreOrders, canImport: canImport, blocking: blocking.map(function (f) { return f.name; }), sections: sec, groups: groups,
             groupNames: GROUP_NAME, rows: rows };
  }

  // 「复制给开发者」：只带表头、交易类型、交易状态，不带金额、对方、单号、文件名
  // 1.1（1016-Z1）未分类按对方归组的规律说明：「工作日中午 12 点左右」「周末晚上」这类，只用来帮你认出是谁，不用来自动分类。
  //   至少 2 笔才说；八成以上在工作日 / 周末才说「工作日」「周末」；一半以上落在同一个钟点（或相邻两个钟点）才说几点
  function dayPart(h) { return h < 5 ? '深夜' : h < 11 ? '早上' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜'; }
  function patternHint(n, wd, we, hours) {
    if (n < 2) return '';
    var parts = [];
    if (wd >= n * 0.8) parts.push('工作日'); else if (we >= n * 0.8) parts.push('周末');
    var best = null, bn = 0;
    Object.keys(hours).forEach(function (h) { var c = (hours[h] || 0) + (hours[+h + 1] || 0); if (c > bn || (c === bn && best !== null && +h < best)) { bn = c; best = +h; } });
    if (best !== null && bn * 2 > n) {
      var one = (hours[best] || 0) * 2 > n, at = one ? best : ((hours[best + 1] || 0) > (hours[best] || 0) ? best + 1 : best);
      parts.push(dayPart(at) + ' ' + at + ' 点左右');
    }
    return parts.join('');
  }

  // 1016-Q：漏记报告 / 只对账。漏记 = 「新增」组（没和手记配上、要新建的），合并记录（分分捐等）算一项；
  //   往已有合并记录上追加的不算（只对账不改以前的记录）。→ { n:笔数, out:支出分, inc:收入分, items:[{ id, keys, title, time, fen, type, cat, units }] }
  function missed(p) {
    var out = { n: 0, out: 0, inc: 0, items: [] };
    ((p.groups && p.groups.add) || []).forEach(function (d) {
      if (d.summary) {
        if (d.appendTo) return;
        var t0 = d.members[0] || {};
        out.items.push({ id: 'S:' + d.id, keys: d.members.map(function (m) { return m.key; }), title: d.title, time: d.time, fen: d.fen, type: t0.type, cat: d.cat, units: d.units });
      } else {
        out.items.push({ id: d.key, keys: [d.key], title: d.title || d.cp || '', time: d.time, fen: d.fen, type: d.type, cat: d.cat, units: d.units });
      }
    });
    out.items.forEach(function (x) { out.n += x.units; if (x.type === 'income') out.inc += x.fen; else out.out += x.fen; });
    return out;
  }

  function devText(p) {
    var out = ['记问 · 账单导入 · 认不出来的情况（' + VERSION + '）'];
    p.files.forEach(function (f, i) {
      if (!f.fatal) return;
      out.push('文件 ' + (i + 1) + '：' + f.fatal.code + ' · ' + f.fatal.msg);
      if (f.fatal.header) out.push('表头：' + f.fatal.header.join(' | '));
    });
    p.sections.unknownTypes.forEach(function (t) { out.push('没见过的交易类型：' + (t.app === 'alipay' ? '支付宝' : '微信') + ' · ' + t.type + '（' + t.n + ' 笔）'); });
    p.sections.unknownStatuses.forEach(function (t) { out.push('没见过的交易状态：' + (t.app === 'alipay' ? '支付宝' : '微信') + ' · ' + t.status + '（' + t.n + ' 笔）'); });
    return out.join('\n');
  }

  return { VERSION: VERSION, isAliRefundDesc: isAliRefundDesc, AMOUNT: AMOUNT, patternHint: patternHint, plan: plan, devText: devText, missed: missed, yuan: yuan, cleanDesc: cleanDesc, pettyCat: pettyCat, isTransferKind: isTransferKind,
           GROUPS: GROUPS, GROUP_NAME: GROUP_NAME };
});
