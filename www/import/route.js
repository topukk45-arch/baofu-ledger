// 记问 · 账单导入 · 定去向（纯计算，第一期 ④）
// 接在 parse.js 的输出后面：给每一行定一个去向（桶），配退款，合并零碎扣款 / 收款。不碰账本、不碰单号表。
// 和 core.js 同样的写法：浏览器 / 后台线程里是全局变量 JiwenImportRoute，Node 里直接 require。
//
// 线程里拿不到单号表和账本，所以分两步：
//   1. 主页面先调 lookups(解析结果)，拿到这一批要查的键：
//        orders：每一行的完整单号键（来源|单号+后缀），加上支付宝退款行要找的原单键；
//        groups：要合并的分组键（分分捐按月、收款按天），主页面按 src.app + 原始分类 + 月份（日期）在账本里找已有的合并记录。
//   2. 主页面用单号表（JiwenImportStore.ordersRead）和账本把这些键查出来，拼成 known 交进线程：
//        known[单号键]  = { st: 0 已导入 | 1 忽略, id, rec: null（记录已经删了）| { type, fen, refunded, mode } }
//        known[分组键]  = { rec: { id, fen, n（已经合进去几笔）} }
//      route(解析结果, { known, rules }) 只看 known，查不到就当没有。
//
// 桶（每一行只进一个，各桶的笔数之和 = 文件笔数）：
//   add 新增候选 / skip 跳过 / neutral 不计入 / refund 退款 / pending 待处理 / error 出错
// 逐行的顺序（命中一条就停）：③ 的出错和重复 → 状态 → 单号表去重 → 类型规则 → 退款 → 不计收支 → 没见过的类型 → 合并。
// 找原单时在整批全部行里找（含已经因为状态跳过的），这样「原单交易关闭 → 两条都跳过」才找得到原单。
// 1016-C：
//   全额退款：本批里退款加起来正好等于原单的一对（两家都算），两条都跳过（「全额退款，等于没发生」），不参与配对。
//   原单「已全额退款」（微信）/「退款成功」（支付宝）但本批没有退款行：以前导入过退款就跳过（fullrefundold），
//     找不到就进待处理（fullnorefund，「这笔已全额退款，退款不在这次的文件里」）。永远不自动合并到手记。
//   微信信用卡还款、零钱提现 / 充值、零钱通、理财通：不管账单写的收 / 支，一律不计入（ownmove）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportRoute = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-C';
  var FX_RATE = 0.05;            // 跨境退款汇率差：差 5% 以内算汇率差
  var RECEIPT_MONTH_MAX = 300;   // 一个月收款超过这么多条，建议按天合并
  var PETTY_MIN = 5, PETTY_FEN = 100;   // 疑似零碎扣款：同一对方一个月 5 次以上，且这个对方所有交易都不超过 1 元

  // ---- 状态 ----
  var SKIP_STATUS = ['交易关闭', '等待付款', '失败', '交易失败', '支付失败', '已撤销'];
  var OK_STATUS = {
    alipay: ['交易成功', '支付成功', '充值成功', '还款成功', '退款成功'],
    wechat: ['支付成功', '已转账', '对方已收钱', '已存入零钱', '已到账', '提现已到账', '充值完成']
  };
  // 微信被退过的原单：照常导入（钱确实花出去过），由退款记录去抵
  var WX_FULL = ['已全额退款', '对方已退还'];
  var WX_PART_RE = /^已退款[（(]?[¥￥]?([0-9,，]+(?:\.\d{1,2})?)[）)]?$/;
  // ---- 微信交易类型 ----
  var WX_TYPES = ['商户消费', '扫二维码付款', '分分捐', '转账', '转账-退款', '微信红包', '微信红包（单发）', '微信红包（群红包）',
                  '企业微信红包', '零钱提现', '零钱充值', '二维码收款'];
  // 钱在自己的账户之间挪（还信用卡、零钱提现 / 充值、零钱通、理财通）：不管账单写的收 / 支，一律不计入（1016-C）
  var WX_NEUTRAL_RE = /信用卡还款|零钱提现|零钱充值|零钱通|理财通/;
  var PETTY_TYPES = { wechat: ['分分捐'] };            // 已知的零碎扣款：按月合并
  var RECEIPT_TYPES = { wechat: ['二维码收款'] };       // 收款：一个月太多时建议按天合并（支付宝的收款名称还没核对，先不认）

  function fenOf(s) { var t = String(s).replace(/[,，]/g, ''); var x = Math.round(Number(t) * 100); return isFinite(x) ? x : null; }
  function wxRefunded(status) {
    if (WX_FULL.indexOf(status) >= 0) return { full: true };
    var m = WX_PART_RE.exec(status || '');
    return m ? { full: false, x: fenOf(m[1]) } : null;
  }
  function isWxRefundType(kind) { return /-退款$/.test(kind || ''); }
  // 时间排序用：分钟 + 秒（没秒的按 0）
  function tkey(row) { return row.time + ':' + (row.sec === null || row.sec === undefined ? '00' : (row.sec < 10 ? '0' : '') + row.sec); }

  // ---- 键 ----
  // 简单的字符串哈希（只用来缩短指纹，不求加密强度）
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  // 一行的单号键：来源|完整单号（单号 + 后缀）。没有单号时用「来源 + 时间 + 金额 + 交易对方」拼指纹（不带逗号，能登记进单号表）
  function orderKey(app, row) {
    if (row.no) return app + '|' + row.no + (row.noRest || '');
    return app + '|FP' + row.time.replace(/[-T:]/g, '') + (row.sec === null || row.sec === undefined ? '' : 's' + row.sec) + '-' + row.fen + '-' + hash(row.cp || '');
  }
  function groupKey(app, kind, period) { return app + '|G:' + kind + ':' + period; }
  // 已全额退款、本批可能没有退款行的原单：主页面去查以前导入过没有（支付宝按单号开头查单号表，微信在账本里找退款记录）
  function fullRefundKey(key) { return 'FR:' + key; }
  function isFullStatus(it) { return it.app === 'wechat' ? WX_FULL.indexOf(it.r.status) >= 0 : (it.app === 'alipay' && !it.r.noRest && it.r.status === '退款成功'); }

  // 全部行展开成一张表（含 ③ 的出错和重复），每项记下在哪个文件第几行
  function flatten(parsed) {
    var items = [], rows = [];
    (parsed && parsed.files || []).forEach(function (f, fi) {
      if (f.fatal) return;
      f.rows.forEach(function (row, ri) {
        var it = { file: fi, row: ri, src: 'row', units: row.merged || 1, app: f.app, r: row, key: orderKey(f.app, row),
                   bucket: null, why: null, msg: '', io: row.io, mode: 'normal', refundTo: null, cands: null, group: null, flags: [] };
        items.push(it); rows.push(it);
      });
      f.errors.forEach(function (e, ei) {
        items.push({ file: fi, err: ei, src: 'error', units: 1, app: f.app, bucket: 'error', why: e.code, msg: e.msg, flags: [] });
      });
      f.dups.forEach(function (d, di) {
        items.push({ file: fi, dup: di, src: 'dup', units: 1, app: f.app, bucket: 'skip', why: d.why === 'otherfile' ? 'otherfile' : 'dupline',
                     msg: d.why === 'otherfile' ? '和「' + d.inFile + '」里的重复' : '同一份文件里重复的一行', flags: [] });
      });
    });
    return { items: items, rows: rows };
  }
  function isAliRefundRow(it) { return it.app === 'alipay' && it.r.noRest && it.r.noRest[0] === '_' && it.r.status === '退款成功'; }
  function monthOf(it) { return it.r.time.slice(0, 7); }
  function dayOf(it) { return it.r.time.slice(0, 10); }
  function inList(map, app, kind) { return !!(map[app] && map[app].indexOf(kind) >= 0); }

  // 收款：哪些「来源 + 月份」超过阈值
  function receiptMonths(rows) {
    var cnt = {};
    rows.forEach(function (it) {
      if (it.r.io === 'income' && inList(RECEIPT_TYPES, it.app, it.r.kind)) { var k = it.app + '|' + monthOf(it); cnt[k] = (cnt[k] || 0) + it.units; }
    });
    var out = {}; Object.keys(cnt).forEach(function (k) { if (cnt[k] > RECEIPT_MONTH_MAX) out[k] = cnt[k]; });
    return out;
  }

  // ---------- 1. 要查的键 ----------
  function lookups(parsed) {
    var fl = flatten(parsed), orders = {}, groups = {}, fulls = [];
    fl.rows.forEach(function (it) {
      orders[it.key] = true;
      if (isAliRefundRow(it)) orders['alipay|' + it.r.no] = true;
      if (it.r.io !== 'income' && isFullStatus(it)) fulls.push({ key: fullRefundKey(it.key), app: it.app, no: it.r.no || '', cp: it.r.cp || '', fen: it.r.fen, time: it.r.time });
      if (inList(PETTY_TYPES, it.app, it.r.kind)) {
        var gk = groupKey(it.app, 'petty', monthOf(it));
        groups[gk] = { key: gk, app: it.app, kind: 'petty', oc: it.r.kind, period: monthOf(it) };
      }
    });
    var rm = receiptMonths(fl.rows);
    fl.rows.forEach(function (it) {
      if (it.r.io === 'income' && inList(RECEIPT_TYPES, it.app, it.r.kind) && rm[it.app + '|' + monthOf(it)]) {
        var gk = groupKey(it.app, 'receipt', dayOf(it));
        groups[gk] = { key: gk, app: it.app, kind: 'receipt', oc: it.r.kind, period: dayOf(it) };
      }
    });
    return { orders: Object.keys(orders), groups: Object.keys(groups).map(function (k) { return groups[k]; }), fullRefunds: fulls };
  }

  // ---------- 2. 定去向 ----------
  function route(parsed, ctx) {
    ctx = ctx || {};
    var known = ctx.known || {}, rules = Array.isArray(ctx.rules) ? ctx.rules : [];
    var fl = flatten(parsed), rows = fl.rows;
    function put(it, bucket, why, msg) { it.bucket = bucket; it.why = why; it.msg = msg || ''; }
    function typeRule(it) { for (var i = 0; i < rules.length; i++) { var r = rules[i]; if (r && r.app === it.app && r.type !== undefined && r.type === it.r.kind) return r.as; } return null; }
    function statusRule(it) { for (var i = 0; i < rules.length; i++) { var r = rules[i]; if (r && r.app === it.app && r.status !== undefined && r.status === it.r.status) return r.as; } return null; }
    // 已经挂了多少退款（同一条原单不能被退超过原金额）
    var refundedRow = new Map(), refundedRec = {};

    // 支付宝原单索引：单号（不带后缀）→ 这一行（整批全部行，含跳过的）
    var aliOrig = {};
    rows.forEach(function (it) { if (it.app === 'alipay' && it.r.no && !it.r.noRest) aliOrig[it.r.no] = it; });

    // ---- 第一遍：状态 → 去重 → 类型规则 → 认出退款 → 不计收支 → 没见过的类型 ----
    rows.forEach(function (it) {
      var r = it.r, st = r.status;
      // 状态
      var sr = statusRule(it);
      if (sr === 'skip') { put(it, 'skip', 'statusrule', '按你定的规则跳过状态「' + st + '」'); return; }
      if (sr !== 'import') {
        if (SKIP_STATUS.indexOf(st) >= 0) { put(it, 'skip', 'status', '交易状态是「' + st + '」'); return; }
        var okSt = (OK_STATUS[it.app] || []).indexOf(st) >= 0 || (it.app === 'wechat' && !!wxRefunded(st)) || !st;
        if (!okSt) it.flags.push('otherStatus');
      }
      // 单号表去重
      var k = known[it.key];
      if (k && k.st === 1) { put(it, 'skip', 'ignored', '以前点过「不要了」'); return; }
      if (k && k.st === 0 && k.rec) { put(it, 'skip', 'imported', '以前导入过'); it.recId = k.id; return; }
      // 类型规则（用户的优先）
      var tr = typeRule(it);
      if (tr === 'skip') { put(it, 'skip', 'typerule', '按你定的规则跳过类型「' + r.kind + '」'); return; }
      if (tr === 'transfer') { put(it, 'neutral', 'typerule', '按你定的规则当转账（不计入）'); it.mode = 'skip'; return; }
      // 自己账户之间挪钱：不计入（用户定成「正常收支」的除外）
      if (it.app === 'wechat' && tr !== 'normal' && WX_NEUTRAL_RE.test(r.kind || '')) { put(it, 'neutral', 'ownmove', '「' + r.kind + '」是自己账户之间挪钱，不计入'); it.mode = 'skip'; return; }
      // 退款
      if (isAliRefundRow(it) || (it.app === 'wechat' && (tr === 'refund' || isWxRefundType(r.kind)))) { it.isRefund = true; return; }
      // 支付宝原单本身是「退款成功」：钱退回来了（有没有单独的退款行都跳过）
      //   本批有退款行 → 两条都跳过；没有 → 后面看以前导入过退款没有（见 1016-C「全额退款」）
      if (it.app === 'alipay' && st === '退款成功') { put(it, 'skip', 'refunded', '这笔已经全额退款'); it.aliFull = true; return; }
      // 不计收支
      if (r.io === 'neutral') { put(it, 'neutral', 'neutral', '账单里是不计收支'); it.mode = 'skip'; return; }
      // 没见过的微信交易类型：照收/支导入，放进「其他」
      if (it.app === 'wechat' && tr !== 'normal' && WX_TYPES.indexOf(r.kind) < 0 && !/^微信红包/.test(r.kind)) it.flags.push('otherType');
      put(it, 'add', 'new', '');
    });

    function attachRow(rf, orig) {
      var used = refundedRow.get(orig) || 0;
      var over = used + rf.r.fen - orig.r.fen;
      if (over > 0) {
        rf.cands = [{ row: ref(orig) }];
        if (over <= Math.round(orig.r.fen * FX_RATE)) { put(rf, 'pending', 'fx', '可能是跨境退款，比原单多退 ' + yuan(over) + ' 元（汇率差）'); rf.fx = over; }
        else put(rf, 'pending', 'overrefund', '退款加起来比原单多');
        return false;
      }
      refundedRow.set(orig, used + rf.r.fen);
      put(rf, 'refund', 'matched', '挂到原单上');
      rf.refundTo = { row: ref(orig) };
      return true;
    }
    function attachRec(rf, id, rec) {
      var used = (refundedRec[id] || 0) + (rec.refunded || 0);
      var over = used + rf.r.fen - rec.fen;
      if (over > 0) {
        rf.cands = [{ record: id }];
        if (over <= Math.round(rec.fen * FX_RATE)) { put(rf, 'pending', 'fx', '可能是跨境退款，比原单多退 ' + yuan(over) + ' 元（汇率差）'); rf.fx = over; }
        else put(rf, 'pending', 'overrefund', '退款加起来比原单多');
        return;
      }
      refundedRec[id] = (refundedRec[id] || 0) + rf.r.fen;
      put(rf, 'refund', 'matched', '挂到以前导入的原单上');
      rf.refundTo = { record: id };
    }
    function noOrig(rf, why, msg) { put(rf, 'refund', why, msg); rf.mode = 'flow'; }

    // ---- 支付宝退款：按单号开头配原单 ----
    rows.forEach(function (rf) {
      if (!rf.isRefund || rf.app !== 'alipay') return;
      rf.io = 'income';
      var o = aliOrig[rf.r.no];
      if (o) {
        if (o.why === 'status' || o.why === 'statusrule') { put(rf, 'skip', 'closedpair', '原单「' + o.r.status + '」，钱付了又全退回，两条都跳过'); return; }
        if (o.why === 'refunded') { put(rf, 'skip', 'refundedpair', '原单已经是「退款成功」，两条都跳过'); return; }
        if (o.why === 'imported' && o.r.io === 'expense') { var kk = known[o.key]; attachRec(rf, kk.id, kk.rec); return; }
        if (o.bucket === 'add' && o.r.io === 'expense') { attachRow(rf, o); return; }
        noOrig(rf, 'noorig', '原单不是一笔支出，按「只算结余」导入');
        return;
      }
      var k = known['alipay|' + rf.r.no];
      if (k && k.st === 0 && k.rec && k.rec.type === 'expense') { attachRec(rf, k.id, k.rec); return; }
      noOrig(rf, 'noorig', '没找到原单，按「只算结余」导入');
    });

    // ---- 微信退款：时间在前、同对方、金额对得上 ----
    var wxRefunds = rows.filter(function (it) { return it.isRefund && it.app === 'wechat'; });
    wxRefunds.forEach(function (rf) { rf.io = 'income'; });
    var wxOrigs = rows.filter(function (it) {
      return it.app === 'wechat' && !it.isRefund && it.r.io === 'expense' && wxRefunded(it.r.status) && (it.bucket === 'add' || it.why === 'imported');
    });
    function S(o) { var w = wxRefunded(o.r.status); return w.full ? o.r.fen : w.x; }
    function candsOf(rf, pool) { var t = tkey(rf.r); return pool.filter(function (o) { return o.r.cp === rf.r.cp && tkey(o.r) < t; }); }
    function attachWx(rf, o) {
      if (o.why === 'imported') { var kk = known[o.key]; attachRec(rf, kk.id, kk.rec); return; }
      if (attachRow(rf, o) && (o.r.kind === '转账' || o.r.status === '对方已退还') && rf.r.kind === '转账-退款') {
        // 转账被退回：两条一起标「不计入」
        put(o, 'neutral', 'transferback', '转账被对方退回，两条都不计入'); o.mode = 'skip';
        put(rf, 'neutral', 'transferback', '转账被对方退回，两条都不计入'); rf.mode = 'skip';
      }
    }
    var doneO = new Set();
    // 先看一笔原单多次退款：只可能属于这笔原单的退款有两条以上时，¥x 两种理解都试（累计 / 最后一次），只有一种对得上才挂。
    //   要放在一对一之前：否则「最后一次退款正好等于 ¥x」那条会先被一对一拿走，前面几次就落单了
    wxOrigs.forEach(function (o) {
      if (doneO.has(o)) return;
      var rs = wxRefunds.filter(function (rf) {
        if (rf.done) return false;
        var cs = candsOf(rf, wxOrigs).filter(function (x) { return !doneO.has(x); });
        return cs.length === 1 && cs[0] === o;
      }).sort(function (a, b) { return tkey(a.r) < tkey(b.r) ? -1 : 1; });
      if (rs.length < 2) return;
      var w = wxRefunded(o.r.status), sum = rs.reduce(function (s, x) { return s + x.r.fen; }, 0);
      var cum = sum === S(o), last = !w.full && rs[rs.length - 1].r.fen === w.x;
      if (cum !== last && sum <= o.r.fen) {
        rs.forEach(function (rf) { attachWx(rf, o); rf.done = true; rf.multi = cum ? 'cumulative' : 'last'; });
        doneO.add(o);
      } else if (cum && last) {
        rs.forEach(function (rf) { put(rf, 'pending', 'multiinterp', '几条退款加起来、最后一条都和「' + o.r.status + '」对得上，请你选'); rf.cands = [{ row: ref(o) }]; rf.done = true; });
      }
    });
    // 再一对一：退款金额 = 原单该退的钱，而且两边都只有这一个配对
    var exactOf = new Map(), exactBy = new Map();
    wxRefunds.forEach(function (rf) {
      if (rf.done) return;
      var es = candsOf(rf, wxOrigs).filter(function (o) { return !doneO.has(o) && rf.r.fen === S(o); });
      exactOf.set(rf, es);
      es.forEach(function (o) { var a = exactBy.get(o); if (!a) exactBy.set(o, a = []); a.push(rf); });
    });
    wxRefunds.forEach(function (rf) {
      if (rf.done) return;
      var es = exactOf.get(rf);
      if (es.length === 1 && exactBy.get(es[0]).length === 1 && !doneO.has(es[0])) { attachWx(rf, es[0]); doneO.add(es[0]); rf.done = true; }
    });
    // 剩下的：汇率差 / 候选不止一条 / 本批没配上（留给 ⑤ 在账本里找）
    wxRefunds.forEach(function (rf) {
      if (rf.done) return;
      var cs = candsOf(rf, wxOrigs).filter(function (o) { return !doneO.has(o); });
      var fx = cs.filter(function (o) { var s = S(o); return Math.abs(rf.r.fen - s) <= Math.round(s * FX_RATE); });
      if (fx.length === 1) {
        var d = rf.r.fen - S(fx[0]);
        rf.fx = d; rf.cands = [{ row: ref(fx[0]) }];
        put(rf, 'pending', 'fx', '可能是跨境退款，和原单差 ' + yuan(Math.abs(d)) + ' 元（汇率差）');
        return;
      }
      if (cs.length) { rf.cands = cs.map(function (o) { return { row: ref(o) }; }); put(rf, 'pending', 'ambiguous', '这一批里有 ' + cs.length + ' 笔可能是原单，请你选'); return; }
      noOrig(rf, 'unmatched', '这一批里没找到原单（下一步去账本里找）');
      rf.flags.push('needLedger');
    });

    // ---- 全额退款（1016-C）：本批里退款加起来正好等于原单的一对，两条都跳过，不参与配对 ----
    var byRef = new Map();
    var rowAt = {}; rows.forEach(function (x) { rowAt[x.file + ':' + x.row] = x; });
    rows.forEach(function (rf) {
      if (rf.bucket !== 'refund' || !rf.refundTo || !rf.refundTo.row) return;
      var o = rowAt[rf.refundTo.row.file + ':' + rf.refundTo.row.row];
      if (!o) return;
      var a = byRef.get(o); if (!a) byRef.set(o, a = []); a.push(rf);
    });
    byRef.forEach(function (rs, o) {
      if (o.bucket !== 'add' || o.r.io !== 'expense') return;
      if (rs.reduce(function (s, x) { return s + x.r.fen; }, 0) !== o.r.fen) return;
      put(o, 'skip', 'fullrefund', '全额退款，等于没发生'); o.fullPair = true;
      rs.forEach(function (rf) { put(rf, 'skip', 'fullrefund', '全额退款，等于没发生'); rf.refundTo = null; rf.fullOf = ref(o); });
    });
    // 原单状态已全额退款、本批却没有退款行：以前导入过退款 → 跳过；找不到 → 待处理（永远不自动合并到手记）
    var aliRefundNos = new Set(); rows.forEach(function (rf) { if (rf.isRefund && rf.app === 'alipay') aliRefundNos.add(rf.r.no); });
    rows.forEach(function (o) {
      var aliNoRefund = o.aliFull && !aliRefundNos.has(o.r.no);
      var wxNoRefund = o.app === 'wechat' && o.bucket === 'add' && o.r.io === 'expense' && WX_FULL.indexOf(o.r.status) >= 0 && !byRef.has(o);
      if (!aliNoRefund && !wxNoRefund) return;
      var f = known[fullRefundKey(o.key)];
      if (f && f.found) { put(o, 'skip', 'fullrefundold', '已全额退款，退款以前导入过了'); if (f.id) o.refundRec = f.id; }
      else { put(o, 'pending', 'fullnorefund', '这笔已全额退款，退款不在这次的文件里'); o.mode = 'normal'; }
    });

    // ---- 合并：分分捐按月；收款太多时建议按天 ----
    var summaries = [], gmap = {};
    function joinGroup(it, kind, period, suggest) {
      var gk = groupKey(it.app, kind, period), g = gmap[gk];
      if (!g) {
        var k = known[gk];
        g = gmap[gk] = { id: 'G' + summaries.length, key: gk, kind: kind, app: it.app, oc: it.r.kind, period: period, io: it.r.io,
                         fen: 0, count: 0, keys: [], items: [], time: '', suggest: !!suggest,
                         appendTo: k && k.rec ? k.rec.id : null, before: k && k.rec ? { fen: k.rec.fen, n: k.rec.n } : null };
        summaries.push(g);
      }
      g.fen += it.r.fen; g.count += it.units; g.keys.push(it.key); g.items.push(ref(it));
      if (it.r.time > g.time) g.time = it.r.time;
      it.group = g.id;
    }
    var rm = receiptMonths(rows);
    rows.forEach(function (it) {
      if (it.bucket !== 'add') return;
      if (inList(PETTY_TYPES, it.app, it.r.kind)) joinGroup(it, 'petty', monthOf(it), false);
      else if (it.r.io === 'income' && inList(RECEIPT_TYPES, it.app, it.r.kind) && rm[it.app + '|' + monthOf(it)]) joinGroup(it, 'receipt', dayOf(it), true);
    });
    // 疑似零碎扣款：只标出来，不合并
    var byCp = {};
    rows.forEach(function (it) { if (it.r.cp) { var k = it.app + '|' + it.r.cp; (byCp[k] = byCp[k] || []).push(it); } });
    var suspects = [];
    Object.keys(byCp).forEach(function (k) {
      var list = byCp[k];
      if (!list.every(function (it) { return it.r.fen <= PETTY_FEN; })) return;
      var byM = {};
      list.forEach(function (it) { if (it.bucket === 'add' && !it.group) (byM[monthOf(it)] = byM[monthOf(it)] || []).push(it); });
      Object.keys(byM).forEach(function (m) {
        var xs = byM[m], n = xs.reduce(function (s, it) { return s + it.units; }, 0);
        if (n < PETTY_MIN) return;
        xs.forEach(function (it) { it.flags.push('pettySuspect'); });
        suspects.push({ app: xs[0].app, cp: xs[0].r.cp, month: m, count: n, fen: xs.reduce(function (s, it) { return s + it.r.fen; }, 0), items: xs.map(ref) });
      });
    });

    // ---- 汇总 ----
    var counts = { add: 0, skip: 0, neutral: 0, refund: 0, pending: 0, error: 0 };
    var perFile = (parsed && parsed.files || []).map(function (f) {
      return { name: f.name, fatal: !!f.fatal, total: f.fatal ? 0 : f.stats.parsed.total, sum: 0, byBucket: { add: 0, skip: 0, neutral: 0, refund: 0, pending: 0, error: 0 } };
    });
    var out = fl.items.map(function (it) {
      counts[it.bucket] += it.units;
      perFile[it.file].sum += it.units; perFile[it.file].byBucket[it.bucket] += it.units;
      var o = { file: it.file, src: it.src, units: it.units, bucket: it.bucket, why: it.why, msg: it.msg, flags: it.flags };
      if (it.src === 'row') {
        o.row = it.row; o.key = it.key; o.io = it.io; o.mode = it.mode;
        if (it.refundTo) o.refundTo = it.refundTo;
        if (it.cands) o.cands = it.cands;
        if (it.group) o.group = it.group;
        if (it.fx !== undefined) o.fx = it.fx;
        if (it.multi) o.multi = it.multi;
        if (it.recId) o.recId = it.recId;
        if (it.fullOf) o.fullOf = it.fullOf;
        if (it.refundRec) o.refundRec = it.refundRec;
      } else if (it.src === 'error') o.err = it.err; else o.dup = it.dup;
      return o;
    });
    perFile.forEach(function (p) { p.ok = p.fatal || p.sum === p.total; });
    summaries.forEach(function (g) { delete g.key; });
    return { version: VERSION, items: out, summaries: summaries, suspects: suspects, counts: counts, perFile: perFile };
  }
  function ref(it) { return { file: it.file, row: it.row }; }
  function yuan(fen) { return (fen / 100).toFixed(2); }

  return { VERSION: VERSION, lookups: lookups, route: route, orderKey: orderKey, groupKey: groupKey, fullRefundKey: fullRefundKey, WX_NEUTRAL_RE: WX_NEUTRAL_RE,
           FX_RATE: FX_RATE, RECEIPT_MONTH_MAX: RECEIPT_MONTH_MAX };
});
