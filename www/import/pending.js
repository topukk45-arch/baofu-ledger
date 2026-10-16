// 记问 · 账单导入 · 待处理（纯计算，第一期 ⑧，1016-N）
// 待处理池里的条目（导入时拿不准、没进账本的账单行）怎么处理：和某条手记合并、挂到某笔原单当退款、作为新增入账、不要了。
// 处理一条算进它原来那批导入：新记录、改过的手记、登记的单号都带那批的批次号，写进那批的导入记录，撤销那批时一起撤。
// 这里只算「要写什么」；真正写进库由主页面 JiwenImportStore.pendingApply(动作) 做（一个事务）。不碰页面、存储。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportPending，Node 里直接 require。
//
// 待处理池的条目：{ app, no, t:'YYYY-MM-DDTHH:mm', amt:分, io, cp, d:商品说明, cand:[候选记录 id], b:批次号, why }
// 动作 act：{ key:'来源|单号', do:'merge', id }（和这条手记合并）| { key, do:'refund', id }（挂到这笔原单当退款）
//           | { key, do:'new', cat }（作为新增入账）| { key, do:'drop' }（不要了）
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportPending = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-N';
  // 候选是「原单」（挂退款）的：收入、原因是这几种（其余的候选都是手记，选了就合并）
  var REFUND_WHY = ['refundcands', 'fx', 'overrefund', 'multiinterp'];
  var WHY_TEXT = {
    near: '金额相近，可能是同一笔', days: '日期差 4–7 天，可能是同一笔', partial: '可能只付了一部分，其余用的别的方式',
    ambiguous: '金额一样的有几条，分不清是哪一条', mixed: '可能是同一笔', multisum: '几笔加起来可能是一条手记',
    refundcands: '退款没找到原单，账本里有几笔可能是', fx: '可能是跨境退款（汇率差）', overrefund: '退款加起来比原单多',
    multiinterp: '多次退款对不准', fullnorefund: '这笔已全额退款，退款不在当时的文件里',
    fpmaybe: '没有单号表，可能导入过', fpgroup: '没有单号表，分不清加过没有', error: '拿不准'
  };

  function keyOf(x) { return x.app + '|' + x.no; }
  function router() {
    if (typeof JiwenImportRoute !== 'undefined') return JiwenImportRoute;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./route.js');
    throw new Error('定去向模块没有载入');
  }
  function isRefund(x) { return x.io === 'income' && (REFUND_WHY.indexOf(x.why) >= 0 || (x.why === 'ambiguous' && !(x.cand || []).length)); }
  function whyText(x) { return WHY_TEXT[x.why] || '拿不准，留给你定'; }

  // 打开待处理页时看一遍候选还在不在（候选失效兜底）。recById：id → { id, time, money, type, cat, src }（主页面查好交进来）
  //   合并的候选：被删了（gone）、已经和别的账单合并了（taken：带了来源）、收支方向不一样了（dir）都算失效
  //   原单的候选：被删了算失效
  // 返回 [{ key, item, refund, why, cands:[{ id, ok, lost:'gone'|'taken'|'dir'|'', rec }], lostAll（原来有候选、现在一条都不在）}]
  function check(items, recById) {
    recById = recById || {};
    return (items || []).map(function (x) {
      var refund = isRefund(x);
      var cands = (x.cand || []).map(function (id) {
        var r = recById[id], lost = '';
        if (!r) lost = 'gone';
        else if (!refund && r.src) lost = 'taken';
        else if (!refund && r.type !== x.io) lost = 'dir';
        return { id: id, ok: !lost, lost: lost, rec: r || null };
      });
      return { key: keyOf(x), item: x, refund: refund, why: whyText(x), cands: cands,
               lostAll: cands.length > 0 && !cands.some(function (c) { return c.ok; }) };
    });
  }

  // 要写什么：state { items（整个池子）, recById（候选记录）, cps, logs（导入记录，旧的在前）}，acts：动作列表
  // → { records:[{ tmp, time, money, type, cat, remark, src:{app}, cp?, batch, refundOf?, flow? }],
  //     changes:[{ id, set:{ time, src, cp?, batch }, nos:[[来源, 单号]], b }], orders:[{ app, no, time, st, ref, batch }],
  //     drop:[键]（从池子里拿掉）, cps（名单，可能加了名字）, logs:{ 批次号: { add:[tmp], chg:[id], cpEnd? } }, errors:[{ key, why }] }
  //   出错的动作（条目不在池子里、候选失效）不做、列进 errors，其余照做
  function build(state, acts) {
    var items = state.items || [], byKey = {};
    items.forEach(function (x) { byKey[keyOf(x)] = x; });
    var recById = state.recById || {};
    var cps = (state.cps || []).slice(), cpAt = {};
    cps.forEach(function (n, i) { if (!(n in cpAt)) cpAt[n] = i; });
    var logs = state.logs || [], last = logs.length ? logs[logs.length - 1] : null;
    var out = { records: [], changes: [], orders: [], drop: [], cps: cps, logs: {}, errors: [] };
    var done = {}, usedRec = {}, n = 0;
    function logOf(b) { return out.logs[b] || (out.logs[b] = { add: [], chg: [] }); }
    // 名字：名单里有就用编号；没有时只在这批是现存最后一次导入时往后加（撤销最后一次是按长度截断的，加在别处会被别的批次截掉）
    function cpIdx(name, b) {
      if (!name) return undefined;
      if (name in cpAt) return cpAt[name];
      if (!last || last.b !== b) return undefined;
      cpAt[name] = cps.length; cps.push(name);
      logOf(b).cpEnd = cps.length;
      return cpAt[name];
    }
    (acts || []).forEach(function (a) {
      var x = a && byKey[a.key];
      if (!x) { out.errors.push({ key: a && a.key, why: 'nokey' }); return; }
      if (done[a.key]) { out.errors.push({ key: a.key, why: 'twice' }); return; }
      var b = x.b, r = a.id ? recById[a.id] : null;
      if (a.do === 'merge') {
        if (!r || r.src || r.type !== x.io || usedRec[a.id] || (x.cand || []).indexOf(a.id) < 0 || isRefund(x)) { out.errors.push({ key: a.key, why: 'candgone' }); return; }
        usedRec[a.id] = true;
        var set = { time: x.t, src: { app: x.app, merged: true }, batch: b };
        var ci = cpIdx(x.cp, b); if (ci !== undefined) set.cp = ci;
        out.changes.push({ id: a.id, set: set, nos: [[x.app, x.no]], b: b });
        logOf(b).chg.push(a.id);
        out.orders.push({ app: x.app, no: x.no, time: x.t, st: 0, ref: { id: a.id }, batch: b });
      } else if (a.do === 'refund') {
        if (!r || !isRefund(x) || (x.cand || []).indexOf(a.id) < 0) { out.errors.push({ key: a.key, why: 'candgone' }); return; }
        var o = { tmp: 'p' + (++n), time: x.t, money: x.amt / 100, type: 'income', cat: r.cat || '未分类', remark: x.d || '', src: { app: x.app }, batch: b, refundOf: a.id };
        var c1 = cpIdx(x.cp, b); if (c1 !== undefined) o.cp = c1;
        out.records.push(o); logOf(b).add.push(o.tmp);
        out.orders.push({ app: x.app, no: x.no, time: x.t, st: 0, ref: { tmp: o.tmp }, batch: b });
      } else if (a.do === 'new') {
        var nr = { tmp: 'p' + (++n), time: x.t, money: x.amt / 100, type: x.io === 'income' ? 'income' : 'expense', cat: a.cat || '未分类', remark: x.d || '', src: { app: x.app }, batch: b };
        if (isRefund(x)) nr.flow = true;          // 没挂原单的退款：只算结余（和导入时找不到原单一样）
        var c2 = cpIdx(x.cp, b); if (c2 !== undefined) nr.cp = c2;
        out.records.push(nr); logOf(b).add.push(nr.tmp);
        out.orders.push({ app: x.app, no: x.no, time: x.t, st: 0, ref: { tmp: nr.tmp }, batch: b });
      } else if (a.do === 'drop') {
        out.orders.push({ app: x.app, no: x.no, time: x.t, st: 1, ref: null, batch: b });
        // 已全额退款、退款不在当时文件里的微信原单：和确认页上「不要了」一样，再登记一个退款记号，以后退款行进来认得出来、跟着跳过
        if (x.why === 'fullnorefund' && x.app === 'wechat') {
          var mk = router().refundMarkKey('wechat', x.cp, x.amt, String(x.t).slice(0, 10)), i = mk.indexOf('|');
          out.orders.push({ app: 'wechat', no: mk.slice(i + 1), time: x.t, st: 1, ref: null, batch: b });
        }
      } else { out.errors.push({ key: a.key, why: 'badact' }); return; }
      done[a.key] = true;
      out.drop.push(a.key);
    });
    return out;
  }

  // 统计页横幅用：某个月（'YYYY-MM'）的待处理笔数和金额（分）
  function monthSum(items, month) {
    var n = 0, fen = 0;
    (items || []).forEach(function (x) { if (String(x.t || '').slice(0, 7) === month) { n++; fen += x.amt || 0; } });
    return { n: n, fen: fen };
  }

  return { VERSION: VERSION, check: check, build: build, isRefund: isRefund, whyText: whyText, monthSum: monthSum, keyOf: keyOf };
});
