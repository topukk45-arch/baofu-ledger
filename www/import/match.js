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
//      match(定去向结果, 解析结果, { manual, refundCands, cats, rules, isNewUser, merchants, maps })
//
// 配对（只配没有来源标记的手记；跨来源永远不按金额自动合并）：
//   第一轮 精确：相差 0、1、2、3 天一层一层配，只比日期不比时分。每一层里，同收支、金额相同（或等于净额）、
//     相差正好这么多天的账单和手记连成一组：两边条数相同、按时间先后一一对上，整组合并；
//     条数不同（或按时间对不上）整组进待处理，这几条手记留住，后面不再拿去自动合并。
//   分类：第一轮配完，先从合并里学「对方 → 分类」，再给没合并的行推荐分类（第二轮的「部分付款」要用）。
//   第二轮 拿不准的进待处理、不新增：金额相近（3 天内、差额不超过 5 元和 20% 中较小的那个、高低都算）、
//     部分付款（同一天、账单比手记少、推荐的分类和手记一样）、差 4–7 天金额相同。都没有 → 新增（漏记）。
//   「不计」的行只做第一轮精确配对，而且只和手记里同样「不计」的配；配不上照常导入，不进待处理。
// 新增的桶：merge（合并）。按净额配上的，那几条退款行改进「跳过」（已按净额并进手记），照样登记单号。
//
// 1017-UI4（第三轮真机试用）：整体按「最近的优先」——先找同一天「几笔加起来」的凑法，再配相差 0 天正好相等的单笔（和凑法不沾边的一对一合并，
//   沾边的和凑法一起列），再配跨天的；同一天有配法的不拿去配跨天的，跨天的选法排在那一组最后（kind 'far'）。下面 1016-G 那条「先看撞不撞」由这条代替。
// 1016-C（真机试用后的修改）：
//   多笔合一：第一轮配剩下的账单，先看几笔加起来是不是正好等于同一天的一条手记（按分精确相等，先于金额相近 / 部分付款）：
//     a. 同一天、同一对方（清洗后）的全部剩下的账单，笔数不限；
//     b. 同一天、2–3 笔不同对方的账单，推荐分类一样（未分类不算）或者都在 1 小时内。
//     c.（1017-C）同一天、同一对方的 2 笔，前后 1 小时内、小的那笔不超过金额相近的容差（差额正好是另一笔小钱，比如兑换券 + 配送费）。
//     命中的进待处理（why 'multisum'），手记留住；整组的说明放在 multiSums 里：只有一种凑法的带默认建议，几种凑法的不带默认。
//   转账、红包、扫码付给个人：只做精确配对（不做金额相近、部分付款、多笔合一）。个人 = 微信「转账」「扫二维码付款」各种「微信红包」、
//     支付宝「转账红包」，或者对方名带 *、清洗后不超过 5 个字、除了 * 只有汉字（像「*小玲」「张*」）。
//   候选排序：日期只用来筛；候选按时间差（分钟）再按金额差排，第一条是「最像」的（1017-UI5 起先看分类，见 sortCands）。
// 1017-A：金额相近（1016-X）的自动合并只限手记同一天或晚 1 天；晚 2–3 天的进待你确认（「金额差 x 元、晚 N 天记的」）。金额正好相等的跨天配对不变。
// 1017-B：金额相近的，同一天、手记比付款早超过 1 小时也不自动合并（「你记的比付款早 N 小时」）；手记正好 00:00 的当作没写具体时间，不拦。
//   金额正好相等的同一天配对照旧（先记后付、先付后记都算）。
// 1017-C：差额正好是另一笔小钱：同一对方的两笔、前后 1 小时内、小的那笔不超过金额相近的容差，加起来正好是同一天的一条手记 → 也当「几笔加起来」
//   （照旧只建议、点了才合并），不再拿大的那笔当金额相近；同一对方 / 同一平台的凑法排前面。
//   全额退款（④ 里两条都跳过的那对）：不参与配对；原单上记下 3 天内同金额的手记（hintCands），
//     确认页在所有配对（含你在确认页上选的合并）做完以后，这些手记没被别的账单合并掉的，才挂一句弱提醒，不占手记名额。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportMatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1017-C';
  var PARTIAL_MAX = 3;
  var PLATFORM_RE = /^(美团|淘宝|天猫|京东|拼多多|饿了么|支付宝|微信|抖音|唯品会|财付通)/;            // 部分付款：手记最多是账单的 3 倍
  var EXACT_DAYS = 3, PEND_DAYS = 7, NEAR_FEN = 500, NEAR_RATE = 0.2, REFUND_BACK_DAYS = 180;
  var FAR_MAX = 5;
  var NEAR_AUTO_DAYS = 1;   // 1017-A：金额相近的自动合并只认手记同一天或晚 1 天
  var NEAR_EARLY_MIN = 60;  // 1017-B：同一天、手记比付款早超过 60 分钟的不自动合并
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

  // 「不计」的行要知道方向：账单里写了收支就用；微信「/」、支付宝「不计收支」看类型和商品说明猜，猜不出就不配
  var OUT_WORDS = ['还款', '提现', '转入', '买入', '申购', '存入', '缴纳'], IN_WORDS = ['转出', '赎回', '卖出', '退回'];
  function neutralDir(item, row) {
    if (item.io === 'income' || item.io === 'expense') return item.io;
    var s = (row.kind || '') + ' ' + (row.desc || '');
    for (var i = 0; i < OUT_WORDS.length; i++) if (s.indexOf(OUT_WORDS[i]) >= 0) return 'expense';
    for (var j = 0; j < IN_WORDS.length; j++) if (s.indexOf(IN_WORDS[j]) >= 0) return 'income';
    return null;
  }
  function rowOf(parsed, it) { return parsed.files[it.file].rows[it.row]; }
  // 'YYYY-MM-DDTHH:mm' → 分钟数（只用来比远近）
  function minOf(t) { var h = +(t.slice(11, 13) || 0), mi = +(t.slice(14, 16) || 0); return dayNo(t) * 1440 + (isFinite(h) ? h : 0) * 60 + (isFinite(mi) ? mi : 0); }
  // 转账、红包、扫码付给个人（1016-C）
  var PERSON_KINDS = { wechat: ['转账', '扫二维码付款'], alipay: ['转账红包'] };
  function isPersonal(app, row, cleanCp) {
    var kind = row.kind || '';
    if ((PERSON_KINDS[app] || []).indexOf(kind) >= 0) return true;
    if (app === 'wechat' && /^微信红包/.test(kind)) return true;
    var c = cleanCp(row.cp || '');
    return c.indexOf('*') >= 0 && c.length <= 5 && /^[\u4e00-\u9fa5*]+$/.test(c);
  }

  // ---------- 1. 要从账本里取什么 ----------
  function ledgerQuery(routed, parsed) {
    var lo = Infinity, hi = -Infinity, refunds = [];
    (routed && routed.items || []).forEach(function (it) {
      if (it.src !== 'row') return;
      var r = rowOf(parsed, it), d = dayNo(r.time);
      if (it.bucket === 'add' || it.bucket === 'neutral' || it.why === 'fullrefund') { if (d < lo) lo = d; if (d > hi) hi = d; }
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
    var usedBy = {}, reservedBy = {};   // 1016-G：被哪笔账单合并了 / 留给了哪一组（「为什么没配上」用）
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
    var exactAmts = function (b) { return b.net !== b.fen && b.net > 0 ? [b.fen, b.net] : [b.fen]; };
    // 1017-UI6：账单推得出分类、和手记的不一样 = 分类冲突（推不出、未分类的不算冲突）
    var billCat = function (b) { var r = b.it.rec || b.preRec; return r && r.layer !== 'none' && !r.person && r.cat && r.cat !== '未分类' ? r.cat : null; };
    var catClash = function (b, m) { var c = billCat(b); return !!c && (m.cat || '未分类') !== c; };
    var preClassify = function () {
      var lc = new Map();
      merges.forEach(function (x) { if (x.b.neutral) return; var k = C.cleanCp(x.b.r.cp); if (!k || !x.m.cat) return; var o = lc.get(k); if (!o) lc.set(k, o = {}); o[x.m.cat] = (o[x.m.cat] || 0) + 1; });
      var lr = new Map();
      lc.forEach(function (o, k) { var ks = Object.keys(o); if (ks.length === 1) lr.set(k, ks[0]); });
      var bs = bills.filter(function (b) { return !b.done && !b.neutral; });
      if (!bs.length) return;
      var rs = C.classify(bs.map(function (b) { return { app: parsed.files[b.it.file].app, cp: b.r.cp, desc: b.r.desc, kind: b.r.kind, io: b.it.io }; }),
        { cats: cats, rules: ctx.rules, learned: lr, borrowRows: [], merchants: ctx.merchants, isNewUser: !!ctx.isNewUser, maps: ctx.maps, history: ctx.hist, remarks: ctx.rmk, aliHist: ctx.aliHist }).recs;
      bs.forEach(function (b, i) { b.preRec = rs[i]; });
    };

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
    // 要配的账单行：④ 的「新增」（合并成汇总记录的不配）和「不计」
    var bills = [];
    rowItems.forEach(function (it) {
      var r = rowOf(parsed, it);
      if (it.noMerge) return;                 // 已全额退款、退款以前导入过的原单：照常新增，不和手记配（1016-C）
      var normal = it.bucket === 'add' && !it.group;
      var neutral = it.bucket === 'neutral';
      if (!normal && !neutral) return;
      var type = normal ? it.io : neutralDir(it, r);
      if (neutral) it.dir = type;
      if (type !== 'income' && type !== 'expense') return;
      var rf = refundsOf.get(it), net = r.fen;
      if (rf) rf.forEach(function (x) { net -= rowOf(parsed, x).fen; });
      bills.push({ i: bills.length, it: it, r: r, type: type, fen: r.fen, net: net, day: dayNo(r.time), neutral: neutral, done: false,
                   personal: isPersonal(parsed.files[it.file].app, r, C.cleanCp) });
    });

    // ---------- 1017-UI4：同一天的先配（整体配对，最近的优先）----------
    //   先找出同一天「几笔加起来正好是一条手记」的凑法；再配相差 0 天、金额正好相等的单笔。
    //   单笔和凑法不沾边的照常（一对一就合并）；沾上同一笔账单或同一条手记的，凑法和同一天的单笔一起列出来让你选。
    //   跨天的单笔不和同一天的配法抢：这几笔账单、这条手记同一天有配法，就不拿去配跨天的（跨天的选法排最后、默认收起，见 farOptions）
    var cand0 = bills.filter(function (b) { return !b.neutral && !b.personal; });
    var combos0 = { combos: [], skipped: [] };
    if (cand0.length >= 2) {
      var recs0 = C.classify(cand0.map(function (b) { return { app: parsed.files[b.it.file].app, cp: b.r.cp, desc: b.r.desc, kind: b.r.kind, io: b.it.io }; }),
        { cats: cats, rules: ctx.rules, learned: new Map(), borrowRows: [], merchants: ctx.merchants, isNewUser: !!ctx.isNewUser, maps: ctx.maps, history: ctx.hist, remarks: ctx.rmk, aliHist: ctx.aliHist }).recs;
      combos0 = findCombos(cand0, idx, free, function (b) { var r = recs0[cand0.indexOf(b)]; return r && r.layer !== 'none' && !r.person && r.cat && r.cat !== '未分类' ? r.cat : null; });
    }
    var comboList = combos0.combos, comboBill = new Set(), comboM = new Set(), sameDay = [];
    comboList.forEach(function (c) { comboM.add(c.m.id); c.bs.forEach(function (b) { comboBill.add(b); }); });

    // ---------- 第一轮：精确配对，按天数一层一层，按组配 ----------
    var merges = [];
    var multiSums = [];
    for (var d = 0; d <= EXACT_DAYS; d++) {
      if (d === 1) multiSums = groupCombos(comboList.concat(sameDay), function (m) { mstate.set(m.id, 'reserved'); reservedBy[m.id] = 'multisum'; }, 0);
      // 1017-UI6：跨天的要看分类冲不冲突，先给剩下的账单推一次分类（用同一天合并里学到的；最后还会按全部合并重推一次）
      if (d === 1) preClassify();
      // 这一层的边：账单 ↔ 手记（同收支、金额相同或等于净额、相差正好 d 天、手记还没用、不计的只配不计的手记）
      var edges = [];
      bills.forEach(function (b) {
        if (b.done) return;
        var amts = b.net !== b.fen && b.net > 0 ? [b.fen, b.net] : [b.fen];
        var seen = new Set();
        amts.forEach(function (fen) {
          var f = function (m, dd) {
            if (Math.abs(dd) !== d || !free(m) || seen.has(m.id)) return;
            // 1017-UI6：跨天的只认「手记比账单晚」（事后补记），手记早的一律不自动合并；普通行分类冲突的也不自动合并（都进待你确认）
            if (dd < 0 || (!b.neutral && catClash(b, m))) return;
            // 不计的账单碰上同金额的普通手记：不合并，记下来让确认页提示一句
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
        // 1017-UI4：同一天、和凑法沾边（同一笔账单或同一条手记）：每一对都列成「一笔账单」选项，和凑法放一组
        if (d === 0 && (g.B.some(function (b) { return comboBill.has(b); }) || g.M.some(function (m) { return comboM.has(m.id); }))) {
          g.E.forEach(function (k) {
            var bi = +k.slice(0, k.indexOf('|')), mid = k.slice(k.indexOf('|') + 1);
            var b = bills[bi], m = g.M.filter(function (x) { return x.id === mid; })[0];
            sameDay.push({ m: m, bs: [b], kind: 'single' });
          });
          return;
        }
        var B = g.B.slice().sort(function (x, y) { return tkey(x.r) < tkey(y.r) ? -1 : tkey(x.r) > tkey(y.r) ? 1 : 0; });
        var M = g.M.slice().sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : (x.id < y.id ? -1 : 1); });
        var okPair = B.length === M.length && B.every(function (b, i) { return g.E.has(b.i + '|' + M[i].id); });
        if (okPair) {
          B.forEach(function (b, i) { var m = M[i]; mstate.set(m.id, 'used'); usedBy[m.id] = b; b.done = true; merges.push({ b: b, m: m, days: d }); });
          return;
        }
        // 拿不准：整组进待处理（不计的照常导入），手记留住
        M.forEach(function (m) { mstate.set(m.id, 'reserved'); reservedBy[m.id] = 'ambiguous'; });
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
    var cl = C.classify(toClass.map(function (it) { var r = rowOf(parsed, it); return { app: parsed.files[it.file].app, cp: r.cp, desc: r.desc, kind: r.kind, io: it.io, time: r.time, fen: r.fen }; }),   // 1024-X：带时间、金额（认工作日中午付给个人的午饭）
      { cats: cats, rules: ctx.rules, learned: learned, borrowRows: aliRows, merchants: ctx.merchants, isNewUser: !!ctx.isNewUser, maps: ctx.maps, history: ctx.hist, remarks: ctx.rmk, aliHist: ctx.aliHist });
    toClass.forEach(function (it, i) { it.rec = cl.recs[i]; });


    // ---------- 1.1（1016-X）：金额相近 + 分类对得上 → 默认当作已记过 ----------
    //   只认「账单不高于手记」（立减、红包抵扣：实付比你记的少），3 天内，差额不超过 5 元和 20% 中较小的那个，
    //   账单推荐的分类（推不出、未分类的不算）和手记的分类一样。账单比手记高的仍进待处理。
    //   为了不抢错：这笔账单只有这一条手记符合、这条手记也只被这一笔账单看中，才合并；不然照旧进待处理。
    //   合并时手记金额不改（确认页可一键改成实付）；差额进结果页「N 笔手记比实付多 x 元，多半是立减」
    //   1017-A：找还是 3 天内找（「只有这一条」也按 3 天算），但只有同一天或手记晚 1 天的才自动合并；晚 2–3 天的进待你确认
    //   1017-B：同一天的，手记比付款早超过 1 小时（正好 00:00 的不算）也进待你确认
    var nearOk = new Map(), nearBy = new Map();
    bills.forEach(function (b) {
      if (b.done || b.neutral || b.personal) return;
      var rc = b.it.rec && b.it.rec.layer !== 'none' && !b.it.rec.person ? b.it.rec.cat : null;
      if (!rc || rc === '未分类') return;
      var tol = Math.min(NEAR_FEN, Math.floor(b.fen * NEAR_RATE)), hits = [];
      if (tol <= 0) return;
      scan(b.type, b.day, 0, EXACT_DAYS, b.fen + 1, b.fen + tol, function (m) { if (free(m) && m.cat === rc) hits.push(m); });   // 1017-UI6：手记比账单早的不算
      if (hits.length !== 1) return;
      // 1017-A：金额相近的自动合并只限同一天或手记晚 1 天；晚 2–3 天的不合并，进待你确认（还是占着「只有这一条」的名额，不让别的账单抢）
      var lateD = dayNo(hits[0].time) - b.day;
      // 1017-B：同一天、手记比付款早 1 小时以上的也不合并（更可能是另一笔忘了记），进待你确认；手记正好 00:00 的当作没写具体时间，不拦
      var earlyMin = minOf(b.r.time) - minOf(hits[0].time);
      if (lateD > NEAR_AUTO_DAYS) b.nearLate = { m: hits[0], days: lateD };
      else if (lateD === 0 && earlyMin > NEAR_EARLY_MIN && hits[0].time.slice(11, 16) !== '00:00') b.nearEarly = { m: hits[0], hours: Math.floor(earlyMin / 60) };
      else nearOk.set(b, hits[0]);
      nearBy.set(hits[0].id, (nearBy.get(hits[0].id) || 0) + 1);
    });
    var nearMerged = [];
    nearOk.forEach(function (m, b) {
      if (nearBy.get(m.id) !== 1 || !free(m)) return;
      var it = b.it;
      mstate.set(m.id, 'used'); usedBy[m.id] = b; b.done = true;
      it.bucket = 'merge'; it.why = 'near'; it.into = m.id; it.via = 'near'; it.days = Math.abs(dayNo(m.time) - b.day);
      it.was = { time: m.time }; it.cat = m.cat; it.nearFen = m.fen - b.fen;
      it.msg = '金额差 ' + ((m.fen - b.fen) / 100).toFixed(2) + ' 元、分类一样，当作你记过的那条（多半是立减、红包）';
      nearMerged.push(it);
    });
    stats.nearMerged = nearMerged.length;

    // ---------- 第二轮：拿不准的进待处理（只有普通行；不计的配不上照常导入）----------
    bills.forEach(function (b) {
      if (b.done || b.neutral) return;
      var it = b.it, kinds = [], cands = [], seen = new Set();
      var push = function (kind, m) { if (seen.has(m.id)) return; seen.add(m.id); cands.push({ record: m.id, m: m }); if (kinds.indexOf(kind) < 0) kinds.push(kind); };
      var tol = Math.min(NEAR_FEN, Math.floor(b.fen * NEAR_RATE));
      if (!b.personal) {
        // 金额相近：3 天内，差额不超过 5 元和 20% 中较小的那个，高低都算
        if (tol > 0) scan(b.type, b.day, -EXACT_DAYS, EXACT_DAYS, b.fen - tol, b.fen + tol, function (m) { if (free(m) && m.fen !== b.fen && m.fen !== b.net) push('near', m); });
        // 部分付款：同一天，账单比手记少，推荐的分类和手记一样（推不出分类的不参与）
        var rc = it.rec && it.rec.layer !== 'none' && !it.rec.person ? it.rec.cat : null;
        // 1016-G：账单不到手记的三分之一不算（1 元配不上 29 元）
        if (rc && rc !== '未分类') scan(b.type, b.day, 0, 0, b.fen + tol + 1, b.fen * PARTIAL_MAX, function (m) { if (free(m) && m.cat === rc) push('partial', m); });
      }
      // 1017-UI6：3 天内金额相同、没能自动合并的——手记比账单早（early），或晚记但分类冲突（xcat）
      var amts = b.net !== b.fen && b.net > 0 ? [b.fen, b.net] : [b.fen];
      amts.forEach(function (fen) {
        scan(b.type, b.day, -EXACT_DAYS, -1, fen, fen, function (m) { if (free(m)) push('early', m); });
        scan(b.type, b.day, 1, EXACT_DAYS, fen, fen, function (m) { if (free(m) && catClash(b, m)) push('xcat', m); });
      });
      // 差 4–7 天、金额相同（或等于净额）；手记比账单早的算 early
      amts.forEach(function (fen) {
        scan(b.type, b.day, -PEND_DAYS, -EXACT_DAYS - 1, fen, fen, function (m) { if (free(m)) push('early', m); });
        scan(b.type, b.day, EXACT_DAYS + 1, PEND_DAYS, fen, fen, function (m) { if (free(m)) push('days', m); });
      });
      if (cands.length) {
        it.bucket = 'pending'; it.why = kinds.length === 1 ? kinds[0] : 'mixed';
        it.cands = sortCands(b, cands);
        it.msg = { near: '有一条手记金额差不多（可能是立减、红包），请你确认', partial: '可能只付了一部分，其余用的别的方式，请你确认',
                   days: '有一条手记金额一样，但差了 4 到 7 天（可能是先用后付），请你确认', mixed: '有几条手记都可能是它，请你确认' }[it.why];
        // 1017-UI6：手记比账单早的写明早几天；像延后扣款的（地铁、公交、先乘后付、免密、代扣这类词，或分类对得上）再说一句
        var ec = it.cands.filter(function (c) { return c.early; })[0];
        if (it.why === 'near' && b.nearLate && it.cands[0] && it.cands[0].record === b.nearLate.m.id)
          it.msg = '金额差 ' + ((b.nearLate.m.fen - b.fen) / 100).toFixed(2) + ' 元、晚 ' + b.nearLate.days + ' 天记的，请你确认';
        else if (it.why === 'near' && b.nearEarly && it.cands[0] && it.cands[0].record === b.nearEarly.m.id)
          it.msg = '你记的比付款早 ' + b.nearEarly.hours + ' 小时、金额差 ' + ((b.nearEarly.m.fen - b.fen) / 100).toFixed(2) + ' 元，请你确认';
        else if (it.why === 'early' && ec) it.msg = '你记的比账单早 ' + ec.early + ' 天' + (ec.delay ? '，可能是延后扣款' : '') + '，请你确认';
        else if (it.why === 'xcat') { var xm = cands[0].m; it.msg = '有一条手记金额一样、晚 ' + Math.abs(dayNo(xm.time) - b.day) + ' 天记的，但分类对不上（账单像「' + billCat(b) + '」，你记的是「' + (xm.cat || '未分类') + '」），请你确认'; }
      } else it.flags.push('missing');     // 漏记
    });
    // 第一轮里分不清的那几组：候选也按远近排
    var mById = new Map(); manual.forEach(function (m) { mById.set(m.id, m); });
    bills.forEach(function (b) {
      if (b.it.bucket === 'pending' && b.it.why === 'ambiguous') b.it.cands = sortCands(b, b.it.cands.map(function (c) { return { record: c.record, m: mById.get(c.record) }; }));
    });

    // ---------- 全额退款的原单：3 天内同金额的手记，留给确认页做弱提醒（不占名额）----------
    rowItems.forEach(function (it) {
      if (it.why !== 'fullrefund' || it.bucket !== 'skip' || it.io !== 'expense') return;
      var r = rowOf(parsed, it), hs = [];
      scan('expense', dayNo(r.time), -EXACT_DAYS, EXACT_DAYS, r.fen, r.fen, function (m) { if (m.mode !== 'skip') hs.push(m); });
      if (hs.length) it.hintCands = hs.sort(function (x, y) { return Math.abs(minOf(x.time) - minOf(r.time)) - Math.abs(minOf(y.time) - minOf(r.time)) || (x.id < y.id ? -1 : 1); })
        .map(function (m) { return { record: m.id, time: m.time, cat: m.cat, fen: m.fen }; });
    });

    // ---------- ④ 留下的「本批没配上」的微信退款：在账本里找原单（1016-E：先找真原单，找不到才用记号）----------
    //   同对方、在它之前、金额正好相等、还没被退过的以前导入的支出只有一笔 → 直接挂上；几笔 → 待处理让你选；
    //   一笔都没有：有记号（原单以前被忽略了）→ 退款也跳过，登记记号「已用」和退款自己的单号；
    //   还没有：账本里有金额更大的候选 → 待处理；什么都没有 → 往来
    var cands2 = Array.isArray(ctx.refundCands) ? ctx.refundCands : [];
    var claimedRec = {}, claimedMark = {};
    rowItems.filter(function (it) { return it.flags.indexOf('needLedger') >= 0 && it.bucket === 'refund'; })
      .sort(function (a, b) { var x = tkey(rowOf(parsed, a)), y = tkey(rowOf(parsed, b)); return x < y ? -1 : x > y ? 1 : 0; })
      .forEach(function (it) {
        var r = rowOf(parsed, it), cc = C.cleanCp(r.cp), t = r.time;
        var cs = cands2.filter(function (x) {
          return x && x.type === 'expense' && typeof x.time === 'string' && x.time < t && C.cleanCp(x.cp) === cc && (x.fen - (x.refunded || 0)) >= r.fen;
        });
        var exact = cs.filter(function (x) { return x.fen === r.fen && !(x.refunded > 0) && !claimedRec[x.id]; });
        if (exact.length === 1) {
          claimedRec[exact[0].id] = true;
          it.why = 'matchedledger'; it.mode = 'normal'; it.refundTo = { record: exact[0].id }; it.msg = '挂到以前导入的原单上'; it.toTime = exact[0].time;
          return;
        }
        if (exact.length > 1) {
          it.bucket = 'pending'; it.why = 'refundcands'; it.mode = 'normal';
          it.cands = exact.sort(function (x, y) { return x.time > y.time ? -1 : 1; }).map(function (x) { return { record: x.id }; });
          it.msg = '账本里有 ' + exact.length + ' 笔金额一样的可能是这笔退款的原单，请你选';
          return;
        }
        var mk = (it.markerCands || []).filter(function (x) { return !claimedMark[x.key]; })[0];
        if (mk) {
          claimedMark[mk.key] = true;
          it.bucket = 'skip'; it.why = 'origignored'; it.mode = 'normal'; it.markerHit = mk; it.regIgnore = [it.key, mk.used];
          it.msg = '原单（' + (+mk.day.slice(4, 6)) + ' 月 ' + (+mk.day.slice(6, 8)) + ' 日）以前跳过 / 忽略了，退款也跳过';
          return;
        }
        if (cs.length) {
          it.bucket = 'pending'; it.why = 'refundcands'; it.mode = 'normal';
          it.cands = cs.map(function (x) { return { record: x.id }; });
          it.msg = '账本里有 ' + cs.length + ' 笔可能是这笔退款的原单，请你选';
        } else { it.why = 'noorig'; it.msg = '这一批和账本里都没找到原单，按「往来」导入'; it.mode = 'flow'; }
      });

    // ---------- 1017-UI4：跨天的选法（排最后、默认收起）----------
    //   同一天有配法时不拿去配跨天的；但你否掉同一天的配法以后，跨天的也要看得到：
    //   组里每笔账单 3 天内金额正好相等、到最后也没被用掉的手记；组里那条手记 3 天内金额正好相等、没合并的账单。每组最多 FAR_MAX 种
    multiSums.forEach(function (g) {
      var far = [], seenF = {};
      var add = function (m, b, dd) { var k = m.id + '|' + b.i; if (seenF[k] || far.length >= FAR_MAX) return; seenF[k] = 1; far.push({ record: m.id, fen: m.fen, kind: 'far', days: dd, bills: [{ file: b.it.file, row: b.it.row }] }); };
      var inG = bills.filter(function (b) { return b.it.msum === g.id; });
      inG.forEach(function (b) {
        var got = [];
        exactAmts(b).forEach(function (f) { scan(b.type, b.day, -EXACT_DAYS, EXACT_DAYS, f, f, function (m, dd) { if (dd !== 0 && free(m) && m.mode !== 'skip' && got.indexOf(m) < 0) got.push(m); }); });
        got.sort(function (x, y) { return Math.abs(minOf(x.time) - minOf(b.r.time)) - Math.abs(minOf(y.time) - minOf(b.r.time)) || (x.id < y.id ? -1 : 1); })
          .forEach(function (m) { add(m, b, Math.abs(dayNo(m.time) - b.day)); });
      });
      g.options.forEach(function (o) {
        if (o.kind === 'far') return;
        var m = mById.get(o.record); if (!m) return;
        bills.forEach(function (b) {
          if (b.neutral || b.type !== m.type || b.it.msum === g.id || (b.it.bucket !== 'add' && b.it.bucket !== 'pending') || b.it.msum) return;
          var dd = Math.abs(dayNo(m.time) - b.day);
          if (dd === 0 || dd > EXACT_DAYS || exactAmts(b).indexOf(m.fen) < 0) return;
          add(m, b, dd);
        });
      });
      g.options = g.options.concat(far);
    });

    // ---------- 1016-G：「为什么没配上」（只在确认页要的时候算：ctx.trace）----------
    //   前后 7 天、金额在账单三分之一到三倍之间的手记（另一种收支只看金额正好相等的），按日期远近最多 8 条，每条写卡在哪
    if (ctx.trace) bills.forEach(function (b) {
      var it = b.it;
      if (it.bucket === 'merge') return;
      var got = [], tol = Math.min(NEAR_FEN, Math.floor(b.fen * NEAR_RATE));
      var look = function (type, lo, hi) {
        var t = idx[type]; if (!t) return;
        for (var d = b.day - PEND_DAYS; d <= b.day + PEND_DAYS; d++) {
          var a = t.get(d); if (!a) continue;
          for (var i = 0; i < a.length; i++) if (a[i].fen >= lo && a[i].fen <= hi && got.indexOf(a[i]) < 0) got.push(a[i]);
        }
      };
      look(b.type, Math.ceil(b.fen / PARTIAL_MAX), b.fen * PARTIAL_MAX);
      look(b.type === 'income' ? 'expense' : 'income', b.fen, b.fen);
      var tm = minOf(b.r.time);
      got.sort(function (x, y) { return Math.abs(minOf(x.time) - tm) - Math.abs(minOf(y.time) - tm) || Math.abs(x.fen - b.fen) - Math.abs(y.fen - b.fen); });
      var yuan = function (f) { return (f / 100).toFixed(2); };
      var md = function (t) { return (+t.slice(5, 7)) + ' 月 ' + (+t.slice(8, 10)) + ' 日'; };
      var fmtHm = function (t) { return t.slice(11, 16); };
      // 1016-I：当天能和别的账单凑成一条手记、却没凑成的，写明被谁打断了
      var broken = comboList.filter(function (c) { return c.bs.indexOf(b) >= 0 && it.why !== 'multisum'; }).slice(0, 2).map(function (c) {
        var others = c.bs.filter(function (x) { return x !== b; });
        var who = mstate.get(c.m.id) === 'used' ? '那条手记已经和 ' + (usedBy[c.m.id] ? md(usedBy[c.m.id].r.time) + ' ' + yuan(usedBy[c.m.id].fen) + ' 元那笔账单' : '别的账单') + '合并了'
          : others.map(function (o) {
              var oi = o.it;
              return oi.bucket === 'merge' ? fmtHm(o.r.time) + ' 那笔 ' + yuan(o.fen) + ' 元已经和别的手记合并了'
                : (oi.bucket === 'pending' && oi.why === 'ambiguous') ? fmtHm(o.r.time) + ' 那笔 ' + yuan(o.fen) + ' 元被「金额一样、分不清谁是谁」那一组拿走了'
                : fmtHm(o.r.time) + ' 那笔 ' + yuan(o.fen) + ' 元去了别处';
            }).join('；');
        return { record: c.m.id, time: c.m.time, fen: c.m.fen, cat: c.m.cat || '',
                 why: '和 ' + others.map(function (o) { return fmtHm(o.r.time) + ' 那笔 ' + yuan(o.fen) + ' 元'; }).join('、') + '加起来正好是这条，但' + who };
      });
      it.trace = broken.concat(got.filter(function (m) { return !broken.some(function (x) { return x.record === m.id; }); }).slice(0, 8 - broken.length).map(function (m) {
        var dd = Math.abs(dayNo(m.time) - b.day), diff = m.fen - b.fen, why;
        var rc = it.rec && it.rec.layer !== 'none' && !it.rec.person ? it.rec.cat : null;
        if (m.type !== b.type) why = '收支不一样（账单是' + (b.type === 'income' ? '收入' : '支出') + '，手记是' + (m.type === 'income' ? '收入' : '支出') + '）';
        else if (mstate.get(m.id) === 'used') { var u = usedBy[m.id]; why = '已经和 ' + (u ? md(u.r.time) + ' ' + yuan(u.fen) + ' 元那笔账单' : '别的账单') + '合并了'; }
        else if (mstate.get(m.id) === 'reserved' && (it.cands || []).every(function (c) { return c.record !== m.id; })) why = reservedBy[m.id] === 'multisum' ? '留给了「几笔加起来正好是一条手记」那一组' : '留给了「金额一样、分不清谁是谁」那一组';
        else if (b.neutral && m.mode !== 'skip') why = '不计的账单只和同样不计的手记配';
        else if ((m.fen === b.fen || m.fen === b.net) && dd >= 1 && dayNo(m.time) < b.day) why = '你记的比账单早 ' + dd + ' 天：手记比账单早的不自动合并' + (b.neutral ? '' : '，已列为候选');
        else if ((m.fen === b.fen || m.fen === b.net) && dd >= 1 && dd <= EXACT_DAYS && catClash(b, m)) why = '分类对不上（账单像「' + billCat(b) + '」，手记是「' + (m.cat || '未分类') + '」）：跨天的不自动合并，已列为候选';
        else if (m.fen === b.fen || m.fen === b.net) why = dd <= EXACT_DAYS ? '金额、日期都对得上，已列为候选' : '金额一样，但差了 ' + dd + ' 天（3 天内才自动合并，4–7 天的列为候选）';
        else if (b.personal) why = '转账、红包、扫码付给个人只做精确配对，金额差 ' + yuan(Math.abs(diff)) + ' 元不算';
        else if (Math.abs(diff) <= tol) why = dd <= EXACT_DAYS ? '金额差 ' + yuan(Math.abs(diff)) + ' 元，在容差内，已列为候选' : '金额差不多，但差了 ' + dd + ' 天（金额相近只看 3 天内）';
        else if (diff > 0) {
          if (dd !== 0) why = '比账单多 ' + yuan(diff) + ' 元，当作部分付款要同一天（差了 ' + dd + ' 天）';
          else if (m.fen > b.fen * PARTIAL_MAX) why = '账单不到手记的三分之一，不当部分付款';
          else if (!rc || rc === '未分类') why = '账单推不出分类，不能当部分付款';
          else if (rc !== m.cat) why = '当作部分付款要分类一样（账单推荐「' + rc + '」，手记是「' + (m.cat || '未分类') + '」）';
          else why = '可能是部分付款，已列为候选';
        } else why = '金额差 ' + yuan(-diff) + ' 元，超过容差 ' + yuan(tol) + ' 元';
        return { record: m.id, time: m.time, fen: m.fen, cat: m.cat || '', why: why };
      }));
    });

    // ---------- 1016-O：原来就在待处理池里的 ----------
    //   这次还是拿不准（进待处理）→ 跳过、不重复列出；有了结论（配上手记、挂上退款、按规则跳过……）→ 照常，写入时移出待处理池。
    //   和这次的新账单一起凑「几笔加起来是一条手记」的照旧留在待处理里（要你一起选）
    var pendResolved = 0;
    items.forEach(function (it) {
      if (!it.wasPend) return;
      if (it.bucket === 'pending' && !it.msum) { it.bucket = 'skip'; it.why = 'inpending'; it.msg = '已经在待处理里了'; it.cands = null; }
      else if (it.bucket !== 'pending') pendResolved += it.units;
    });
    stats.pendResolved = pendResolved;

    // ---------- 汇总 ----------
    var counts = {}; BUCKETS.forEach(function (k) { counts[k] = 0; });
    var perFile = (parsed && parsed.files || []).map(function (f) { var o = { name: f.name, fatal: !!f.fatal, total: f.fatal ? 0 : f.stats.parsed.total, sum: 0, byBucket: {} }; BUCKETS.forEach(function (k) { o.byBucket[k] = 0; }); return o; });
    items.forEach(function (it) { counts[it.bucket] += it.units; perFile[it.file].sum += it.units; perFile[it.file].byBucket[it.bucket] += it.units; });
    perFile.forEach(function (p) { p.ok = p.fatal || p.sum === p.total; });
    var used = 0; mstate.forEach(function (v) { if (v === 'used') used++; });
    stats.merged = merges.length; stats.manualUsed = used;
    stats.comboSkippedDays = combos0.skipped.slice();     // 一天剩下的账单超过 COMBO_DAY_MAX，没试不同对方的凑法
    return { version: VERSION, items: items, summaries: routed.summaries || [], suspects: routed.suspects || [],
             newCats: cl.newCats, learned: learnedRules, multiSums: multiSums, counts: counts, perFile: perFile, stats: stats };
  }

  // 候选排序（1017-UI5）：先看分类对不对得上（账单推荐的分类和手记一样），再看相差几天、金额差多少，最后看相差几分钟；第一条就是「最像」的。
  //   分类对不上、推不出分类的照样列，只是排后面
  function sortCands(b, cands) {
    var t = minOf(b.r.time), rc = b.it.rec && b.it.rec.layer !== 'none' && !b.it.rec.person && b.it.rec.cat && b.it.rec.cat !== '未分类' ? b.it.rec.cat : null;
    var catOk = function (m) { return rc && m.cat === rc ? 0 : 1; };
    // 1017-UI6：手记比账单早一天以上的不当「最像」，排在最后
    var early = function (m) { return dayNo(m.time) < b.day ? 1 : 0; };
    var delayWord = DELAY_RE.test((b.r.cp || '') + ' ' + (b.r.desc || '') + ' ' + (b.r.kind || ''));
    return cands.slice().sort(function (x, y) {
      return early(x.m) - early(y.m) || catOk(x.m) - catOk(y.m) || Math.abs(dayNo(x.m.time) - b.day) - Math.abs(dayNo(y.m.time) - b.day) || Math.abs(x.m.fen - b.fen) - Math.abs(y.m.fen - b.fen)
        || Math.abs(minOf(x.m.time) - t) - Math.abs(minOf(y.m.time) - t) || (x.record < y.record ? -1 : x.record > y.record ? 1 : 0);
    }).map(function (c) {
      if (!early(c.m)) return { record: c.record };
      return { record: c.record, early: b.day - dayNo(c.m.time), delay: delayWord || catOk(c.m) === 0 };
    });
  }
  var DELAY_RE = /地铁|公交|出行|先乘后付|免密|代扣|自动扣款/;

  // ---------- 多笔合一（1016-C）----------
  //   bills：第一轮配剩下的普通账单（不含个人转账）；同一天、同收支的手记里找金额正好等于几笔之和的。
  //   返回 [{ id, options: [{ record, bills: [账单在 items 里的引用], kind: 'samecp' | 'combo' }], suggest: 0 | null }]
  var COMBO_DAY_MAX = 120, HOUR = 60;   // 一天里剩下的账单超过 120 笔就不试 2–3 笔的凑法（只看同一对方的）
  function findCombos(bills, idx, free, catOf) {
    var C = classifier(), byDay = new Map(), skipped = [];
    bills.forEach(function (b) { var k = b.type + '|' + b.day, a = byDay.get(k); if (!a) byDay.set(k, a = []); a.push(b); });
    var combos = [];
    byDay.forEach(function (list) {
      var type = list[0].type, day = list[0].day, ms = (idx[type] && idx[type].get(day) || []).filter(function (m) { return free(m) && m.mode !== 'skip'; });
      if (!ms.length || list.length < 2) return;
      var byFen = new Map(); ms.forEach(function (m) { var a = byFen.get(m.fen); if (!a) byFen.set(m.fen, a = []); a.push(m); });
      // 1017-C：同一条手记、同一组账单的凑法只列一次（同一对方当天只有这两笔时，a 已经列过）
      var dupOf = function (x, bs) { return combos.some(function (c) { return c.m === x && c.bs.length === bs.length && bs.every(function (b) { return c.bs.indexOf(b) >= 0; }); }); };
      function hit(bs, kind, pri) { var sum = bs.reduce(function (s, b) { return s + b.fen; }, 0), m = byFen.get(sum); if (m) m.forEach(function (x) { if (dupOf(x, bs)) return; var c = { m: x, bs: bs, kind: kind }; if (pri !== undefined) c.pri = pri; combos.push(c); }); }
      // a. 同一对方的全部
      var byCp = new Map();
      // 1016-I：一个对方名是另一个的开头（至少 3 个字，平台名开头的不算）算同一对方：「某某排骨」和「某某排骨某某店」
      var keys = list.map(function (b) { return C.cleanCp(b.r.cp || ''); }).filter(Boolean)
        .filter(function (c, i, a) { return a.indexOf(c) === i; }).sort(function (x, y) { return x.length - y.length || (x < y ? -1 : 1); });
      var root = {};
      keys.forEach(function (c) {
        root[c] = c;
        if (PLATFORM_RE.test(c)) return;
        for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (k.length >= 3 && k.length < c.length && c.indexOf(k) === 0 && !PLATFORM_RE.test(k)) { root[c] = root[k]; break; } }
      });
      list.forEach(function (b) { var c0 = C.cleanCp(b.r.cp || ''); if (!c0) return; var c = root[c0] || c0; var a = byCp.get(c); if (!a) byCp.set(c, a = []); a.push(b); b.ccp = c; });
      byCp.forEach(function (a) { if (a.length >= 2) hit(a, 'samecp'); });
      // b. 2–3 笔不同对方：推荐分类一样（未分类不算），或者都在 1 小时内
      if (list.length > COMBO_DAY_MAX) { skipped.push(dayStr(day)); return; }
      var ok = function (bs) {
        for (var i = 0; i < bs.length; i++) for (var j = i + 1; j < bs.length; j++) if (!bs[i].ccp || bs[i].ccp === bs[j].ccp) return false;
        var c0 = catOf(bs[0]); if (c0 && bs.every(function (b) { return catOf(b) === c0; })) return true;
        var ts = bs.map(function (b) { return minOf(b.r.time); });
        return Math.max.apply(null, ts) - Math.min.apply(null, ts) <= HOUR;
      };
      // 1017-C：差额正好是另一笔小钱（兑换券 27 + 配送费 3 = 你记的 30）：同一对方的两笔、前后 1 小时内、小的那笔不超过金额相近的容差，
      //   也当「几笔加起来」（上面 ok() 不收同一对方的两笔，同一对方当天还有别的单子时 a 也凑不上）。同一对方 / 同一平台的排前面
      var smallAdd = function (bs) {
        var lo = bs[0].fen <= bs[1].fen ? bs[0] : bs[1], hi = lo === bs[0] ? bs[1] : bs[0];
        return Math.abs(minOf(bs[0].r.time) - minOf(bs[1].r.time)) <= HOUR && lo.fen > 0 && lo.fen <= Math.min(NEAR_FEN, Math.floor(hi.fen * NEAR_RATE));
      };
      var pfOf = function (b) { var x = PLATFORM_RE.exec(C.cleanCp(b.r.cp || '')); return x ? x[1] : null; };
      var sameSrc = function (bs) { return bs.every(function (b) { return b.ccp && b.ccp === bs[0].ccp; }) || (!!pfOf(bs[0]) && bs.every(function (b) { return pfOf(b) === pfOf(bs[0]); })); };
      var fenSet = new Set(ms.map(function (m) { return m.fen; }));
      var maxM = Math.max.apply(null, ms.map(function (m) { return m.fen; }));
      var sorted = list.slice().sort(function (x, y) { return x.fen - y.fen || x.i - y.i; });
      for (var i = 0; i < sorted.length; i++) {
        for (var j = i + 1; j < sorted.length; j++) {
          var s2 = sorted[i].fen + sorted[j].fen; if (s2 > maxM) break;
          if (fenSet.has(s2)) {
            var pr = [sorted[i], sorted[j]];
            if (ok(pr)) hit(pr, 'combo', sameSrc(pr) ? 0 : undefined);
            else if (smallAdd(pr)) hit(pr, 'combo', 0);
          }
          for (var k = j + 1; k < sorted.length; k++) {
            var s3 = s2 + sorted[k].fen; if (s3 > maxM) break;
            if (fenSet.has(s3) && ok([sorted[i], sorted[j], sorted[k]])) hit([sorted[i], sorted[j], sorted[k]], 'combo');
          }
        }
      }
    });
    return { combos: combos, skipped: skipped };
  }
  // 凑法连成组，组里的账单进待处理（why 'multisum'），手记留住。kind 'single'：一笔金额正好相等的账单（1016-G，和多笔合一撞上时）
  function groupCombos(combos, reserve, idStart) {
    if (!combos.length) return [];
    // 有共同账单或共同手记的凑法连成一组
    var parent = combos.map(function (_, i) { return i; });
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    var owner = new Map();
    combos.forEach(function (c, i) {
      ['m' + c.m.id].concat(c.bs.map(function (b) { return 'b' + b.i; })).forEach(function (k) {
        if (owner.has(k)) { var a = find(i), b = find(owner.get(k)); if (a !== b) parent[a] = b; } else owner.set(k, i);
      });
    });
    var groups = new Map();
    combos.forEach(function (c, i) { var r = find(i), g = groups.get(r); if (!g) groups.set(r, g = []); g.push(c); });
    var out = [];
    var rank = { samecp: 0, combo: 0, single: 1 };
    groups.forEach(function (cs) {
      cs = cs.slice().sort(function (x, y) { return rank[x.kind] - rank[y.kind] || (x.pri === undefined ? 1 : x.pri) - (y.pri === undefined ? 1 : y.pri); });   // 1017-C：同一对方 / 同一平台的凑法排前面   // 1017-UI4：几笔加起来的排前面，一笔账单的在后
      var id = 'S' + (idStart + out.length), bs = [];
      cs.forEach(function (c) { reserve(c.m); c.bs.forEach(function (b) { if (bs.indexOf(b) < 0) bs.push(b); }); });
      var one = cs.length === 1, single = cs.some(function (c) { return c.kind === 'single'; });
      bs.forEach(function (b) {
        b.done = true;
        var it = b.it; it.bucket = 'pending'; it.why = 'multisum'; it.msum = id;
        it.cands = cs.filter(function (c) { return c.bs.indexOf(b) >= 0; }).map(function (c) { return { record: c.m.id }; });
        it.msg = one ? '这 ' + cs[0].bs.length + ' 笔加起来正好是你记的 ' + (cs[0].m.fen / 100).toFixed(2) + ' 元，合并'
                     : single ? '有一笔金额正好等于你记的那条，另有几笔加起来也正好等于它，请你选是哪种'
                     : '这几笔加起来正好等于你记的某一条，有 ' + cs.length + ' 种凑法，请你选';
      });
      out.push({ id: id, suggest: one ? 0 : null, options: cs.map(function (c) {
        return { record: c.m.id, fen: c.m.fen, kind: c.kind, bills: c.bs.slice().sort(function (x, y) { return x.i - y.i; }).map(function (b) { return { file: b.it.file, row: b.it.row }; }) };
      }) });
    });
    return out;
  }

  return { VERSION: VERSION, ledgerQuery: ledgerQuery, match: match, isPersonal: isPersonal, COMBO_DAY_MAX: COMBO_DAY_MAX, EXACT_DAYS: EXACT_DAYS, PEND_DAYS: PEND_DAYS, REFUND_BACK_DAYS: REFUND_BACK_DAYS };
});
