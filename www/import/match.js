// 记问 · 账单导入 · 和手记配对 + 分类推荐（纯计算，第一期 ⑤）
// 接在 route.js（定去向）后面。和 core.js 同样的写法：浏览器 / 后台线程里是全局变量 JiwenImportMatch，Node 里直接 require。
//
// 和 ④ 一样分两步，整本账不交进线程：
//   1. 主页面先调 ledgerQuery(定去向结果, 解析结果)，拿到要从账本里取什么：
//        manual：{ from, to } 这一批的日期范围前后各加 7 天；要没有来源标记的记录，退款记录（refundOf）也不要
//        refunds：④ 留下的「本批没配上」的微信退款，每条 { cp, before, minFen }；主页面去账本里找同对方、
//                 时间更早（往前 180 天）、金额不小于退款的已导入记录
//   2. 主页面把这些记录挑几个字段交进来：
//        manual      [{ id, time, type, fen, cat, mode }]
//        refundCands [{ id, time, type, fen, refunded, cp, cat }]（cp 是对方名，不是编号）
//      match(定去向结果, 解析结果, { manual, refundCands, cats, rules, isNewUser, merchants })
//
// 配对（只配没有来源标记的手记；跨来源永远不按金额自动合并）：
//   第一轮 精确：相差 0、1、2、3 天一层一层配，只比日期不比时分。每一层里，同收支、金额相同（或等于净额）、
//     相差正好这么多天的账单和手记连成一组：两边条数相同、按时间先后一一对上，整组合并；
//     条数不同（或按时间对不上）整组进待处理，这几条手记留住，后面不再拿去自动合并。
//   分类：第一轮配完，先从合并里学「对方 → 分类」，再给没合并的行推荐分类（第二轮的「部分付款」要用）。
//   第二轮 拿不准的进待处理、不新增：金额相近（3 天内、差额不超过 5 元和 20% 中较小的那个、高低都算）、
//     部分付款（同一天、账单比手记少、推荐的分类和手记一样）、差 4–7 天金额相同。都没有 → 新增（漏记）。
//   「不计入」的行只做第一轮精确配对，而且只和手记里同样「不计入」的配；配不上照常导入，不进待处理。
// 新增的桶：merge（合并）。按净额配上的，那几条退款行改进「跳过」（已按净额并进手记），照样登记单号。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportMatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-A';
  var EXACT_DAYS = 3, PEND_DAYS = 7, NEAR_FEN = 500, NEAR_RATE = 0.2, REFUND_BACK_DAYS = 180;
  var BUCKETS = ['add', 'merge', 'skip', 'neutral', 'refund', 'pending', 'error'];

  function classifier() {
    if (typeof JiwenImportClassify !== 'undefined') return JiwenImportClassify;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./classify.js');
    throw new Error('分类模块没有载入');
  }
  // 'YYYY-MM-DD…' → 第几天（整数；用 UTC 只是为了算天数，不涉及时区）
  function dayNo(t) { var y = +t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10); return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function dayStr(n) { var x = new Date(n * 86400000); return x.toISOString().slice(0, 10); }
  function tkey(row) { return row.time + ':' + (row.sec === null || row.sec === undefined ? '00' : (row.sec < 10 ? '0' : '') + row.sec); }

  // 「不计入」的行要知道方向：账单里写了收支就用；微信「/」、支付宝「不计收支」看类型和商品说明猜，猜不出就不配
  var OUT_WORDS = ['还款', '提现', '转入', '买入', '申购', '存入', '缴纳'], IN_WORDS = ['转出', '赎回', '卖出', '退回'];
  function neutralDir(item, row) {
    if (item.io === 'income' || item.io === 'expense') return item.io;
    var s = (row.kind || '') + ' ' + (row.desc || '');
    for (var i = 0; i < OUT_WORDS.length; i++) if (s.indexOf(OUT_WORDS[i]) >= 0) return 'expense';
    for (var j = 0; j < IN_WORDS.length; j++) if (s.indexOf(IN_WORDS[j]) >= 0) return 'income';
    return null;
  }
  function rowOf(parsed, it) { return parsed.files[it.file].rows[it.row]; }

  // ---------- 1. 要从账本里取什么 ----------
  function ledgerQuery(routed, parsed) {
    var lo = Infinity, hi = -Infinity, refunds = [];
    (routed && routed.items || []).forEach(function (it) {
      if (it.src !== 'row') return;
      var r = rowOf(parsed, it), d = dayNo(r.time);
      if (it.bucket === 'add' || it.bucket === 'neutral') { if (d < lo) lo = d; if (d > hi) hi = d; }
      if (it.flags && it.flags.indexOf('needLedger') >= 0) refunds.push({ cp: r.cp, before: r.time, minFen: r.fen, from: dayStr(d - REFUND_BACK_DAYS) });
    });
    return { manual: lo === Infinity ? null : { from: dayStr(lo - PEND_DAYS), to: dayStr(hi + PEND_DAYS) }, refunds: refunds };
  }

  // ---------- 手记索引：收支 → 第几天 → 按金额排好的数组 ----------
  function buildIndex(manual) {
    var idx = { income: new Map(), expense: new Map() };
    manual.forEach(function (m) {
      var t = idx[m.type]; if (!t) return;
      var d = dayNo(m.time), a = t.get(d); if (!a) t.set(d, a = []); a.push(m);
    });
    [idx.income, idx.expense].forEach(function (t) { t.forEach(function (a) { a.sort(function (x, y) { return x.fen - y.fen || (x.time < y.time ? -1 : x.time > y.time ? 1 : 0); }); }); });
    return idx;
  }

  function match(routed, parsed, ctx) {
    ctx = ctx || {};
    var C = classifier();
    var cats = Array.isArray(ctx.cats) && ctx.cats.length ? ctx.cats : ['未分类'];
    var manual = (Array.isArray(ctx.manual) ? ctx.manual : []).filter(function (m) {
      return m && typeof m.id === 'string' && (m.type === 'income' || m.type === 'expense') && typeof m.time === 'string' && m.time.length >= 10 && Number.isInteger(m.fen);
    });
    var stats = { manualIn: manual.length, examined: 0 };
    var idx = buildIndex(manual);
    var mstate = new Map();          // 手记 id → 'used' | 'reserved'
    // 在 [day-span, day+span] 里找同收支、金额在 [lo, hi] 之间的手记（二分找起点）；examined 数看了几条
    function scan(type, day, dLo, dHi, fLo, fHi, fn) {
      var t = idx[type]; if (!t) return;
      for (var d = day + dLo; d <= day + dHi; d++) {
        var a = t.get(d); if (!a) continue;
        var lo = 0, hi = a.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid].fen < fLo) lo = mid + 1; else hi = mid; }
        for (var i = lo; i < a.length && a[i].fen <= fHi; i++) { stats.examined++; fn(a[i], d - day); }
      }
    }
    var free = function (m) { return !mstate.has(m.id); };

    // 拷一份 ④ 的结果，往上加字段
    var items = (routed && routed.items || []).map(function (it) { var o = {}; for (var k in it) o[k] = it[k]; o.flags = (it.flags || []).slice(); return o; });
    var rowItems = items.filter(function (it) { return it.src === 'row'; });
    var byRef = new Map(); rowItems.forEach(function (it) { byRef.set(it.file + ':' + it.row, it); });
    // 净额：本批里挂在这一行上的退款
    var refundsOf = new Map();
    rowItems.forEach(function (it) {
      if (it.bucket === 'refund' && it.refundTo && it.refundTo.row) {
        var o = byRef.get(it.refundTo.row.file + ':' + it.refundTo.row.row);
        if (o) { var a = refundsOf.get(o); if (!a) refundsOf.set(o, a = []); a.push(it); }
      }
    });
    // 要配的账单行：④ 的「新增」（合并成汇总记录的不配）和「不计入」
    var bills = [];
    rowItems.forEach(function (it) {
      var r = rowOf(parsed, it);
      var normal = it.bucket === 'add' && !it.group;
      var neutral = it.bucket === 'neutral';
      if (!normal && !neutral) return;
      var type = normal ? it.io : neutralDir(it, r);
      if (neutral) it.dir = type;
      if (type !== 'income' && type !== 'expense') return;
      var rf = refundsOf.get(it), net = r.fen;
      if (rf) rf.forEach(function (x) { net -= rowOf(parsed, x).fen; });
      bills.push({ i: bills.length, it: it, r: r, type: type, fen: r.fen, net: net, day: dayNo(r.time), neutral: neutral, done: false });
    });

    // ---------- 第一轮：精确配对，按天数一层一层，按组配 ----------
    var merges = [];
    for (var d = 0; d <= EXACT_DAYS; d++) {
      // 这一层的边：账单 ↔ 手记（同收支、金额相同或等于净额、相差正好 d 天、手记还没用、不计入的只配不计入的手记）
      var edges = [];
      bills.forEach(function (b) {
        if (b.done) return;
        var amts = b.net !== b.fen && b.net > 0 ? [b.fen, b.net] : [b.fen];
        var seen = new Set();
        amts.forEach(function (fen) {
          var f = function (m, dd) {
            if (Math.abs(dd) !== d || !free(m) || seen.has(m.id)) return;
            // 不计入的账单碰上同金额的普通手记：不合并，记下来让确认页提示一句
            if (b.neutral && m.mode !== 'skip') { (b.normalHits = b.normalHits || []).indexOf(m.id) < 0 && b.normalHits.push(m.id); return; }
            seen.add(m.id); edges.push([b, m]);
          };
          if (d === 0) scan(b.type, b.day, 0, 0, fen, fen, f);
          else { scan(b.type, b.day, -d, -d, fen, fen, f); scan(b.type, b.day, d, d, fen, fen, f); }
        });
      });
      if (!edges.length) continue;
      // 连成组（并查集）
      var parent = new Map();
      var find = function (x) { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      var add = function (x) { if (!parent.has(x)) parent.set(x, x); };
      edges.forEach(function (e) { var a = 'b' + e[0].i, m = 'm' + e[1].id; add(a); add(m); var ra = find(a), rm = find(m); if (ra !== rm) parent.set(ra, rm); });
      var groups = new Map();
      edges.forEach(function (e) {
        var g = find('m' + e[1].id), x = groups.get(g);
        if (!x) groups.set(g, x = { B: [], M: [], E: new Set() });
        if (x.B.indexOf(e[0]) < 0) x.B.push(e[0]);
        if (x.M.indexOf(e[1]) < 0) x.M.push(e[1]);
        x.E.add(e[0].i + '|' + e[1].id);
      });
      groups.forEach(function (g) {
        var B = g.B.slice().sort(function (x, y) { return tkey(x.r) < tkey(y.r) ? -1 : tkey(x.r) > tkey(y.r) ? 1 : 0; });
        var M = g.M.slice().sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : (x.id < y.id ? -1 : 1); });
        var okPair = B.length === M.length && B.every(function (b, i) { return g.E.has(b.i + '|' + M[i].id); });
        if (okPair) {
          B.forEach(function (b, i) { var m = M[i]; mstate.set(m.id, 'used'); b.done = true; merges.push({ b: b, m: m, days: d }); });
          return;
        }
        // 拿不准：整组进待处理（不计入的照常导入），手记留住
        M.forEach(function (m) { mstate.set(m.id, 'reserved'); });
        B.forEach(function (b) {
          b.done = true;
          if (b.neutral) return;
          var cs = M.filter(function (m) { return g.E.has(b.i + '|' + m.id); });
          b.it.bucket = 'pending'; b.it.why = 'ambiguous';
          b.it.msg = '同一天前后有 ' + B.length + ' 笔账单、' + M.length + ' 条手记金额一样，分不清谁是谁，请你确认';
          b.it.cands = cs.map(function (m) { return { record: m.id }; });
        });
      });
    }
    merges.forEach(function (x) {
      var it = x.b.it, via = x.m.fen === x.b.fen ? 'amount' : 'net';
      it.bucket = 'merge'; it.why = 'merged'; it.into = x.m.id; it.via = via; it.days = x.days;
      it.was = { time: x.m.time };
      it.msg = via === 'net' ? '和手记合并（按扣掉退款后的实付配上）' : '和手记合并';
      it.cat = x.m.cat;
      var rf = refundsOf.get(it);
      if (rf) {
        if (via === 'net') rf.forEach(function (r) { r.bucket = 'skip'; r.why = 'netted'; r.msg = '已按净额并进手记'; r.register = true; delete r.refundTo; r.nettedInto = x.m.id; });
        else it.refundsStay = true;     // 按原单金额配上：退款照常生成，挂到这条手记上（第 ⑥ 版处理）
      }
    });

    bills.forEach(function (b) {
      if (b.neutral && b.normalHits && b.it.bucket === 'neutral') { b.it.flags.push('neutralVsNormal'); b.it.normalHits = b.normalHits.slice(); }
    });
    // ---------- 从合并里学：清洗后的对方 → 手记的分类 ----------
    var learnCount = new Map();
    merges.forEach(function (x) {
      if (x.b.neutral) return;
      var k = C.cleanCp(x.b.r.cp); if (!k || !x.m.cat) return;
      var m = learnCount.get(k); if (!m) learnCount.set(k, m = {}); m[x.m.cat] = (m[x.m.cat] || 0) + 1;
    });
    var learned = new Map(), learnedRules = [];
    learnCount.forEach(function (m, k) {
      var keys = Object.keys(m), best = null, n = 0, tie = false;
      keys.forEach(function (c) { if (m[c] > n) { best = c; n = m[c]; tie = false; } else if (m[c] === n) tie = true; });
      if (!tie && best) learned.set(k, best);
      // 存成规则：至少合并上 2 次、分类一致、没有矛盾
      if (keys.length === 1 && n >= 2 && best !== '未分类') learnedRules.push({ kw: k, cat: best, count: n });
    });

    // ---------- 分类推荐：没合并、也没挂到原单上的行 ----------
    var toClass = rowItems.filter(function (it) {
      if (it.bucket === 'merge' || it.bucket === 'skip' || it.bucket === 'error') return false;
      if ((it.bucket === 'refund' || it.bucket === 'neutral') && it.refundTo) return false;
      return true;
    });
    var aliRows = [];
    rowItems.forEach(function (it) { if (it.bucket !== 'error') { var r = rowOf(parsed, it); if (parsed.files[it.file].app === 'alipay') aliRows.push({ cp: r.cp, kind: r.kind }); } });
    var cl = C.classify(toClass.map(function (it) { var r = rowOf(parsed, it); return { app: parsed.files[it.file].app, cp: r.cp, desc: r.desc, kind: r.kind, io: it.io }; }),
      { cats: cats, rules: ctx.rules, learned: learned, borrowRows: aliRows, merchants: ctx.merchants, isNewUser: !!ctx.isNewUser });
    toClass.forEach(function (it, i) { it.rec = cl.recs[i]; });

    // ---------- 第二轮：拿不准的进待处理（只有普通行；不计入的配不上照常导入）----------
    bills.forEach(function (b) {
      if (b.done || b.neutral) return;
      var it = b.it, kinds = [], cands = [], seen = new Set();
      var push = function (kind, m) { if (seen.has(m.id)) return; seen.add(m.id); cands.push({ record: m.id }); if (kinds.indexOf(kind) < 0) kinds.push(kind); };
      // 金额相近：3 天内，差额不超过 5 元和 20% 中较小的那个，高低都算
      var tol = Math.min(NEAR_FEN, Math.floor(b.fen * NEAR_RATE));
      if (tol > 0) scan(b.type, b.day, -EXACT_DAYS, EXACT_DAYS, b.fen - tol, b.fen + tol, function (m) { if (free(m) && m.fen !== b.fen && m.fen !== b.net) push('near', m); });
      // 部分付款：同一天，账单比手记少，推荐的分类和手记一样（推不出分类的不参与）
      var rc = it.rec && it.rec.layer !== 'none' ? it.rec.cat : null;
      if (rc && rc !== '未分类') scan(b.type, b.day, 0, 0, b.fen + tol + 1, Infinity, function (m) { if (free(m) && m.cat === rc) push('partial', m); });
      // 差 4–7 天、金额相同（或等于净额）
      var amts = b.net !== b.fen && b.net > 0 ? [b.fen, b.net] : [b.fen];
      amts.forEach(function (fen) {
        scan(b.type, b.day, -PEND_DAYS, -EXACT_DAYS - 1, fen, fen, function (m) { if (free(m)) push('days', m); });
        scan(b.type, b.day, EXACT_DAYS + 1, PEND_DAYS, fen, fen, function (m) { if (free(m)) push('days', m); });
      });
      if (cands.length) {
        it.bucket = 'pending'; it.cands = cands; it.why = kinds.length === 1 ? kinds[0] : 'mixed';
        it.msg = { near: '有一条手记金额差不多（可能是立减、红包），请你确认', partial: '可能只付了一部分，其余用的别的方式，请你确认',
                   days: '有一条手记金额一样，但差了 4 到 7 天（可能是先用后付），请你确认', mixed: '有几条手记都可能是它，请你确认' }[it.why];
      } else it.flags.push('missing');     // 漏记
    });

    // ---------- ④ 留下的「本批没配上」的微信退款：在账本里找候选 ----------
    var cands2 = Array.isArray(ctx.refundCands) ? ctx.refundCands : [];
    rowItems.forEach(function (it) {
      if (it.flags.indexOf('needLedger') < 0 || it.bucket !== 'refund') return;
      var r = rowOf(parsed, it), cc = C.cleanCp(r.cp), t = r.time;
      var cs = cands2.filter(function (x) {
        return x && x.type === 'expense' && typeof x.time === 'string' && x.time < t && C.cleanCp(x.cp) === cc && (x.fen - (x.refunded || 0)) >= r.fen;
      });
      if (cs.length) {
        it.bucket = 'pending'; it.why = 'refundcands'; it.mode = 'normal';
        it.cands = cs.map(function (x) { return { record: x.id }; });
        it.msg = '账本里有 ' + cs.length + ' 笔可能是这笔退款的原单，请你选';
      } else { it.why = 'noorig'; it.msg = '这一批和账本里都没找到原单，按「只算结余」导入'; it.mode = 'flow'; }
    });

    // ---------- 汇总 ----------
    var counts = {}; BUCKETS.forEach(function (k) { counts[k] = 0; });
    var perFile = (parsed && parsed.files || []).map(function (f) { var o = { name: f.name, fatal: !!f.fatal, total: f.fatal ? 0 : f.stats.parsed.total, sum: 0, byBucket: {} }; BUCKETS.forEach(function (k) { o.byBucket[k] = 0; }); return o; });
    items.forEach(function (it) { counts[it.bucket] += it.units; perFile[it.file].sum += it.units; perFile[it.file].byBucket[it.bucket] += it.units; });
    perFile.forEach(function (p) { p.ok = p.fatal || p.sum === p.total; });
    var used = 0; mstate.forEach(function (v) { if (v === 'used') used++; });
    stats.merged = merges.length; stats.manualUsed = used;
    return { version: VERSION, items: items, summaries: routed.summaries || [], suspects: routed.suspects || [],
             newCats: cl.newCats, learned: learnedRules, counts: counts, perFile: perFile, stats: stats };
  }

  return { VERSION: VERSION, ledgerQuery: ledgerQuery, match: match, EXACT_DAYS: EXACT_DAYS, PEND_DAYS: PEND_DAYS, REFUND_BACK_DAYS: REFUND_BACK_DAYS };
});
