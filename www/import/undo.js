// 记问 · 账单导入 · 撤销（纯计算，第一期 ⑦a，1016-K）
// 输入是存档现在的样子（主页面从库里读好交进来），输出是「撤销方案」和撤完以后的样子；不碰页面、存储。
// 真正写进库由主页面 JiwenImportStore.undo(方案) 做（一个事务，写前自动备份「撤销前」）。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportUndo，Node 里直接 require。
//
// 状态 state：
//   { records: [记录…]（顺序就是存的顺序）, cats, budgets, tpls, importRules（没有就 undefined）, cps, pms（没有就 undefined）,
//     orders: { 键: { app, list: [{ no, id, batch, st }] } }（单号表每一块）, pending: [待处理条目…], logs: [导入记录…]（旧的在前） }
// 导入记录（log）：{ b, at, apps, from, to, add:[id], h:[指纹]（1016-K 起，和 add 一一对应）, chg:[{ id, was, now（1016-K 起）, nos }],
//   cpLen, pmLen, cpEnd, pmEnd（1016-K 起）, catsAdded, rulesAdded:{ cat, type, map } }
//   1017-G 起还有 AI 修改：{ kind:'ai', of:原来那次导入, b, at, add:[], h:[], chg }（只改已有记录的分类 / 备注 / 口径 / aiFlag，名单长度不变）；
//   撤它和撤导入一样（按 chg 一个字段一个字段还原，你后来改过的不动）；撤原来那次导入要先撤它（依赖 why 'ai'）
//
// 撤销一批 = 把这批对账本做的事反过来：
//   新增的记录删掉（导入后改过的照删，列进 changed）；你挂在这些记录上的退款一起删（userRefunds）；已经被你删掉的跳过（gone）。
//   改过的已有记录（合并的手记、追加的汇总、改挂的旧退款）按 chg 一个字段一个字段还原：现在的值还是导入写进去的（now）才还原，
//     不一样就是你后来改过，这个字段不动，列进 kept；旧批次没有 now / 指纹（legacy），一律当没改过。
//   单号表删掉这批登记的全部条目；待处理池删掉这批带进来的；规则、类型规则、分类对照按 rulesAdded 删（同样的从后往前删一条）；
//   这批新建的分类：没有记录、预算、模板、规则在用才删，否则留下（catsKept）；导入记录去掉这一条。
//   名单：这批是现存最后一次导入 → 按导入前的长度截断；不是最后一次 → 名字留在原位（没人用），
//     把这批的「导入前长度」记到后一次导入上，以后撤后一次时一起截掉，全部倒序撤完照样逐字节一致。
// 按倒序撤：要撤的不是最近一次时，之后还在的导入有依赖的要先撤（依赖传递着算，见 depsOf）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportUndo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1017-K';
  var OBJ_KEYS = ['src', 'aiFlag'];   // chg 里这些字段的原值 / 新值存的是 JSON 文本（1017-G 加 AI 标记）

  function hasher() {
    if (typeof JiwenImportWrite !== 'undefined') return JiwenImportWrite.recHash;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./write.js').recHash;
    throw new Error('写入模块没有载入');
  }
  function curVal(rec, k) {
    if (!rec || !(k in rec) || rec[k] === undefined) return null;
    var v = rec[k];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  function brief(r) { return { id: r.id, time: r.time || '', money: r.money, cat: r.cat || '', type: r.type || '' }; }
  function isLegacy(log) {
    return !Array.isArray(log.h) || (log.chg || []).some(function (c) { return !c.now; });
  }
  function touched(log) {
    var s = new Set(log.add || []);
    (log.chg || []).forEach(function (c) { s.add(c.id); });
    return s;
  }
  // 名单长度：这批导完时多长。1016-K 以前的没记，用后一次的导入前长度，最后一次用现在的长度
  function endOf(S, i, field) {
    var log = S.logs[i], k = field === 'cps' ? 'cpEnd' : 'pmEnd', l0 = field === 'cps' ? 'cpLen' : 'pmLen';
    if (Number.isInteger(log[k])) return log[k];
    if (i + 1 < S.logs.length) return S.logs[i + 1][l0];
    return (S[field] || []).length;
  }

  // ---------- 依赖：之后的导入 L 依赖链里的 X 吗 ----------
  //   合并或追加了 X 碰过的记录（L 的 chg 改了 X 新增 / 改过的记录）；L 的记录挂退款在 X 碰过的记录上；
  //   L 的记录用了 X 新加的对方名 / 支付方式；L 的记录、规则、对照用了 X 新建的分类；L 用了 X 登记的退款记号（RU 对 RW）
  function depsOf(S, ti) {
    var byBatch = new Map();
    S.records.forEach(function (r) { if (r && r.batch) { var a = byBatch.get(r.batch); if (!a) byBatch.set(r.batch, a = []); a.push(r); } });
    var rwOf = new Map(), ruOf = new Map();
    Object.keys(S.orders || {}).forEach(function (k) {
      var blk = S.orders[k];
      blk.list.forEach(function (x) {
        if (!x.batch) return;
        var m = x.no.slice(0, 2) === 'RW' ? rwOf : x.no.slice(0, 2) === 'RU' ? ruOf : null;
        if (!m) return;
        var a = m.get(x.batch); if (!a) m.set(x.batch, a = new Set()); a.add(blk.app + '|' + x.no.slice(2));
      });
    });
    var chain = [ti], why = {};
    var info = function (i) {
      var log = S.logs[i];
      return { b: log.b, touched: touched(log), cp: [log.cpLen, endOf(S, i, 'cps')], pm: [log.pmLen, endOf(S, i, 'pms')],
               cats: new Set(log.catsAdded || []), rw: rwOf.get(log.b) || new Set() };
    };
    var inChain = [info(ti)];
    for (var i = ti + 1; i < S.logs.length; i++) {
      var L = S.logs[i], recs = byBatch.get(L.b) || [], reasons = [];
      inChain.forEach(function (X) {
        // 1017-G：AI 修改（kind 'ai'）改了 X 碰过的记录：撤 X 之前要先撤这次 AI 修改
        if ((L.chg || []).some(function (c) { return X.touched.has(c.id); })) reasons.push({ dep: X.b, why: L.kind === 'ai' ? 'ai' : 'same' });
        if (recs.some(function (r) { return r.refundOf && X.touched.has(r.refundOf); })) reasons.push({ dep: X.b, why: 'refund' });
        if (recs.some(function (r) { return (Number.isInteger(r.cp) && r.cp >= X.cp[0] && r.cp < X.cp[1]) || (Number.isInteger(r.pm) && r.pm >= X.pm[0] && r.pm < X.pm[1]); }))
          reasons.push({ dep: X.b, why: 'names' });
        var ra = L.rulesAdded || {};
        if (X.cats.size && (recs.some(function (r) { return X.cats.has(r.cat); }) || (ra.cat || []).some(function (r) { return X.cats.has(r.cat); })
            || (ra.map || []).some(function (m) { return X.cats.has(m.cat); }))) reasons.push({ dep: X.b, why: 'cat' });
        // 1016-O：L 再导时把 X 留下的待处理条目拿走了（有了结论）
        if ((L.pendTaken || []).some(function (p) { return p && p.x && p.x.b === X.b; })) reasons.push({ dep: X.b, why: 'pending' });
        var ru = ruOf.get(L.b);
        if (ru && X.rw.size) { var hit = false; ru.forEach(function (k) { if (X.rw.has(k)) hit = true; }); if (hit) reasons.push({ dep: X.b, why: 'marker' }); }
      });
      if (reasons.length) { chain.push(i); why[L.b] = reasons; inChain.push(info(i)); }
    }
    return { chain: chain, why: why };
  }

  // ---------- 撤一批（在 S 的拷贝上改）----------
  function undoOne(S, b) {
    var i = -1;
    for (var j = 0; j < S.logs.length; j++) if (S.logs[j].b === b) i = j;
    var log = S.logs[i], hash = hasher();
    var sum = { b: b, at: log.at || '', apps: (log.apps || []).slice(), from: log.from || '', to: log.to || '', legacy: isLegacy(log),
                added: (log.add || []).length, deleted: 0, gone: 0, changed: [], userRefunds: [],
                restored: 0, mergeGone: 0, kept: [], sums: 0, links: 0,
                catsDropped: [], catsKept: [], rulesRemoved: 0, typesRemoved: 0, mapsRemoved: 0,
                orders: 0, pending: 0, pendBack: 0, rulesRestored: 0, names: null, ai: log.kind === 'ai', aiRestored: 0 };
    var at = new Map(); S.records.forEach(function (r, k) { at.set(r.id, k); });
    var del = new Set();
    // 新增的
    var hs = Array.isArray(log.h) && log.h.length === (log.add || []).length ? log.h : null;
    (log.add || []).forEach(function (id, k) {
      if (!at.has(id)) { sum.gone++; return; }
      var r = S.records[at.get(id)];
      if (hs && hs[k] && hash(r) !== hs[k]) sum.changed.push(brief(r));
      del.add(id);
    });
    // 改过的已有记录：一个字段一个字段还原
    (log.chg || []).forEach(function (c) {
      if (!at.has(c.id)) { sum.mergeGone++; return; }
      var k0 = at.get(c.id), r = Object.assign({}, S.records[k0]), keptHere = [];
      Object.keys(c.was || {}).forEach(function (k) {
        if (c.now && (k in c.now) && curVal(r, k) !== c.now[k]) { keptHere.push(k); return; }
        var w = c.was[k];
        if (w === null) delete r[k];
        else if (OBJ_KEYS.indexOf(k) >= 0 && typeof w === 'string') { try { r[k] = JSON.parse(w); } catch (_) { r[k] = w; } }
        else r[k] = w;
      });
      S.records[k0] = r;
      keptHere.forEach(function (k) { sum.kept.push({ id: c.id, field: k, time: r.time || '', money: r.money, now: curVal(r, k) }); });
      var isSum = c.was && ('money' in c.was) && !('time' in c.was);
      var isLink = c.was && ('refundOf' in c.was);
      if (log.kind === 'ai') sum.aiRestored++;            // 1017-K：AI 改过的记录（分类、备注、口径、标记）改回去
      else if (isLink) sum.links++; else if (isSum) sum.sums++; else sum.restored++;
    });
    // 你挂在这批新增记录上的退款：一起删
    S.records.forEach(function (r) { if (!del.has(r.id) && r.refundOf && del.has(r.refundOf)) { sum.userRefunds.push(brief(r)); del.add(r.id); } });
    sum.deleted = (log.add || []).length - sum.gone;
    if (del.size) S.records = S.records.filter(function (r) { return !del.has(r.id); });

    // 规则、类型规则、分类对照：按 rulesAdded 从后往前删一条
    var ra = log.rulesAdded || {}, ir = S.importRules;
    if (ir) {
      var o = Object.assign({}, ir), cat = (o.cat || []).slice(), type = (o.type || []).slice(), map = (o.map || []).slice();
      var dropLast = function (arr, eq) { for (var x = arr.length - 1; x >= 0; x--) if (eq(arr[x])) { arr.splice(x, 1); return true; } return false; };
      (ra.cat || []).forEach(function (q) { if (dropLast(cat, function (r) { return r.kw === q.kw && r.cat === q.cat; })) sum.rulesRemoved++; });
      (ra.type || []).forEach(function (q) { if (dropLast(type, function (r) { return r.app === q.app && r.type === q.type && r.status === q.status && r.as === q.as; })) sum.typesRemoved++; });
      (ra.map || []).forEach(function (q) { if (dropLast(map, function (m) { return m.from === q.from && m.cat === q.cat; })) sum.mapsRemoved++; });
      // 1016-Y：这批改过的你的规则：现在还是改成的那个分类，就改回原来的（原来的分类已经没了就不动）
      (log.rulesChanged || []).slice().reverse().forEach(function (q) {
        for (var x = cat.length - 1; x >= 0; x--) if (cat[x].kw === q.kw && cat[x].cat === q.to) {
          if (S.cats.indexOf(q.from) >= 0) { cat[x] = { kw: q.kw, cat: q.from }; sum.rulesRestored++; }
          return;
        }
      });
      if (!cat.length && !type.length && !map.length) S.importRules = undefined;
      else { o.cat = cat; o.type = type; if (map.length) o.map = map; else delete o.map; S.importRules = o; }
    }
    // 这批新建的分类：没人用才删
    (log.catsAdded || []).forEach(function (c) {
      if (S.cats.indexOf(c) < 0 || c === '未分类') return;
      var n = S.records.filter(function (r) { return r.cat === c; }).length;
      var bud = !!(S.budgets && S.budgets[c] != null);
      var tpl = Array.isArray(S.tpls) && S.tpls.some(function (t) { return t && t.cat === c; });
      var rule = !!(S.importRules && ((S.importRules.cat || []).some(function (r) { return r.cat === c; }) || (S.importRules.map || []).some(function (m) { return m.cat === c; })));
      if (n || bud || tpl || rule) sum.catsKept.push({ cat: c, records: n, budget: bud, tpl: tpl, rule: rule });
      else { S.cats = S.cats.filter(function (x) { return x !== c; }); sum.catsDropped.push(c); }
    });
    // 名单
    var last = i === S.logs.length - 1;
    var cpEnd = endOf(S, i, 'cps'), pmEnd = endOf(S, i, 'pms');
    if (last) {
      var cut = { cps: 0, pms: 0 };
      if (S.cps && S.cps.length > log.cpLen) { cut.cps = S.cps.length - log.cpLen; S.cps = S.cps.slice(0, log.cpLen); }
      if (S.pms && S.pms.length > log.pmLen) { cut.pms = S.pms.length - log.pmLen; S.pms = S.pms.slice(0, log.pmLen); }
      if (S.cps && !S.cps.length) S.cps = undefined;
      if (S.pms && !S.pms.length) S.pms = undefined;
      sum.names = { cut: cut };
    } else {
      var nx = Object.assign({}, S.logs[i + 1]);
      if (!Number.isInteger(nx.cpEnd)) nx.cpEnd = endOf(S, i + 1, 'cps');
      if (!Number.isInteger(nx.pmEnd)) nx.pmEnd = endOf(S, i + 1, 'pms');
      nx.cpLen = log.cpLen; nx.pmLen = log.pmLen;
      S.logs = S.logs.slice(); S.logs[i + 1] = nx;
      sum.names = { left: { cps: Math.max(0, cpEnd - log.cpLen), pms: Math.max(0, pmEnd - log.pmLen) } };
    }
    // 单号表、待处理池、导入记录
    var ord = {};
    Object.keys(S.orders || {}).forEach(function (k) {
      var blk = S.orders[k], keep = blk.list.filter(function (x) { return x.batch !== b; });
      sum.orders += blk.list.length - keep.length;
      if (keep.length === blk.list.length) ord[k] = blk;
      else if (keep.length) ord[k] = { app: blk.app, list: keep };
    });
    S.orders = ord;
    var pend = (S.pending || []).filter(function (x) { return x.b !== b; });
    sum.pending = (S.pending || []).length - pend.length;
    // 1016-O：这批从待处理池里拿掉的（再导时有了结论），按原来的位置放回去
    (log.pendTaken || []).slice().sort(function (p, q) { return p.i - q.i; }).forEach(function (p) {
      pend.splice(Math.min(p.i, pend.length), 0, p.x); sum.pendBack++;
    });
    S.pending = pend;
    S.logs = S.logs.filter(function (x, k) { return k !== i; });
    return sum;
  }

  // 撤销方案：要撤哪一批 → { ok, target, chain（从新到旧）, why（每个连带的为什么要先撤）, steps, totals, after（撤完的样子）}
  function plan(state, b) {
    var ti = -1;
    (state.logs || []).forEach(function (l, k) { if (l.b === b) ti = k; });
    if (ti < 0) return { ok: false, why: 'nolog', target: b };
    var d = depsOf(state, ti);
    var S = { records: state.records.slice(), cats: (state.cats || []).slice(), budgets: state.budgets, tpls: state.tpls,
              importRules: state.importRules, cps: state.cps ? state.cps.slice() : undefined, pms: state.pms ? state.pms.slice() : undefined,
              orders: Object.assign({}, state.orders || {}), pending: (state.pending || []).slice(), logs: state.logs.slice() };
    var chain = d.chain.map(function (k) { return state.logs[k].b; }).reverse();
    var steps = chain.map(function (x) { return undoOne(S, x); });
    var totals = { deleted: 0, gone: 0, changed: 0, userRefunds: 0, restored: 0, aiRestored: 0, kept: 0, sums: 0, links: 0, catsDropped: 0, catsKept: 0,
                   rules: 0, orders: 0, pending: 0, pendBack: 0, legacy: false };
    steps.forEach(function (s) {
      totals.deleted += s.deleted; totals.gone += s.gone + s.mergeGone; totals.changed += s.changed.length; totals.userRefunds += s.userRefunds.length;
      totals.restored += s.restored; totals.aiRestored += s.aiRestored; totals.kept += s.kept.length; totals.sums += s.sums; totals.links += s.links;
      totals.catsDropped += s.catsDropped.length; totals.catsKept += s.catsKept.length;
      totals.rules += s.rulesRemoved + s.typesRemoved + s.mapsRemoved + s.rulesRestored; totals.orders += s.orders; totals.pending += s.pending; totals.pendBack += s.pendBack;
      if (s.legacy) totals.legacy = true;
    });
    return { ok: true, version: VERSION, target: b, chain: chain, why: d.why, steps: steps, totals: totals, after: S };
  }

  // 给确认框的大白话摘要（⑦b 的界面另做，这里先给开发开关里的临时按钮用）
  var FIELD_NAME = { cat: '分类', remark: '备注', skip: '口径', flow: '口径', aiFlag: '标记', time: '时间', money: '金额', src: '来源', cp: '对方', batch: '批次' };
  var WHY = { ai: 'AI 修改了这批的记录', same: '合并或追加了同一条记录', refund: '有退款挂在这批的记录上', names: '用到了这批新加的对方名或支付方式', cat: '用到了这批新建的分类', marker: '用到了这批登记的退款记号', pending: '处理了这批留下的待处理' };
  function describe(p) {
    if (!p || !p.ok) return '找不到这次导入的记录。';
    var t = p.totals, out = [];
    var isAi = function (b) { var s0 = p.steps.filter(function (x) { return x.b === b; })[0]; return !!(s0 && s0.ai); };
    if (p.chain.length > 1) {
      var aiN = p.chain.slice(0, -1).filter(isAi).length, impN = p.chain.length - 1 - aiN;
      out.push('要先撤销之后的 ' + (impN ? impN + ' 次导入' : '') + (impN && aiN ? '、' : '') + (aiN ? aiN + ' 次 AI 修改' : '') + '，从新到旧连着撤：');
      p.chain.slice(0, -1).forEach(function (b) {
        var s = p.steps.filter(function (x) { return x.b === b; })[0];
        var w = (p.why[b] || []).map(function (x) { return WHY[x.why]; }).filter(function (x, k, a) { return a.indexOf(x) === k; }).join('、');
        out.push('· ' + (s.at || b).replace('T', ' ') + '（' + w + '）');
      });
    }
    // 1017-K：只撤一次 AI 修改：只说改回几条
    if (isAi(p.target) && p.chain.length === 1) out.push('把 AI 改过的 ' + t.aiRestored + ' 条记录改回去（分类、备注、口径、标记）。');
    else {
      out.push('删掉 ' + t.deleted + ' 条导入的记录，还原 ' + t.restored + ' 条合并过的手记' + (t.sums ? '，汇总记录还原 ' + t.sums + ' 条' : '') + (t.links ? '，退款改挂还原 ' + t.links + ' 条' : '') + '。');
      if (t.aiRestored) out.push('AI 改过的 ' + t.aiRestored + ' 条记录改回去。');
    }
    if (t.changed) out.push('其中 ' + t.changed + ' 条你导入后改过，照样删掉。');
    if (t.userRefunds) out.push('你挂在这些记录上的退款 ' + t.userRefunds + ' 条一起删掉。');
    // 1017-K：撤 AI 修改时写「其中 N 处你后来又改过」并列出是哪几处；撤导入照旧
    if (t.kept && isAi(p.target) && p.chain.length === 1) out.push('其中 ' + t.kept + ' 处你后来又改过，保留你改的：' + p.steps.reduce(function (a, s0) { return a.concat(s0.kept); }, []).slice(0, 5).map(function (k) { return String(k.time || '').slice(5, 16).replace('T', ' ') + ' ' + (FIELD_NAME[k.field] || k.field); }).join('、') + (t.kept > 5 ? '……' : '') + '。');
    else if (t.kept) out.push('合并的手记里有 ' + t.kept + ' 处你导入后改过，保留你改的。');
    if (t.gone) out.push(t.gone + ' 条已经被你删掉了，跳过。');
    if (t.catsDropped || t.catsKept) out.push('新建的分类删 ' + t.catsDropped + ' 个' + (t.catsKept ? '，' + t.catsKept + ' 个还在用，留下' : '') + '。');
    if (t.rules) out.push('删掉（或改回）' + t.rules + ' 条规则和对照。');
    if (t.pending) out.push('待处理里这几次带进来的 ' + t.pending + ' 笔一起清掉。');
    if (t.pendBack) out.push('这几次处理掉的以前的待处理 ' + t.pendBack + ' 笔放回待处理。');
    if (t.legacy) out.push('这批是旧版本导入的，看不出你导入后改没改过，撤销会按导入前的样子还原。');
    return out.join('\n');
  }

  return { VERSION: VERSION, plan: plan, depsOf: depsOf, describe: describe, isLegacy: isLegacy };
});
