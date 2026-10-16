// 记问 · 账单导入 · 写入清单（纯计算，第一期 ⑥b）
// 把确认页上的最终方案（plan.js 的结果）翻译成一张「写入清单」：要新建的记录、要改的记录（带改之前的值）、
// 要登记的单号、待处理池、这一批的导入记录、名单、新分类、新规则。只读方案，不重新配对。
// 真正写进库由主页面 JiwenImportStore.commit(清单) 做（一个事务）；这里不碰页面、存储。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportWrite，Node 里直接 require。
//
// 记录的写法：
//   新增 / 不计入：{ time, money, type, cat, remark, 口径, src:{app}, cp, pm, oc, batch }（cp、pm 是名单里的编号）
//   退款：type income + refundOf（原单：这批新增的 → 临时编号；合进手记的 → 那条手记；以前导入的 → 那条记录），
//         分类、口径由主页面写入时照原单同步
//   合并：手记的时间改成账单时间（多笔合一取最早那笔），加 src:{app, merged:true}、cp、batch；分类、备注、口径、金额不动
//   合并记录（分分捐按月、收款按天、勾上的零碎扣款）：一条记录，src:{app, sum:'petty'|'receipt'|'suspect'}；
//         已有同月 / 同天的就把金额加上去
//   以前导入的退款 + 这批的原单（1016-D）：旧退款的 refundOf 改成新原单
// 改动 changes：{ id, kind:'merge'|'append'|'link', set:{ 字段: 新值 }, addFen（合并记录追加的金额）, nos:[[来源, 单号]] }；
//   主页面写入时按记录当时的样子记下原值，进导入记录的 chg：{ id, was:{ 字段: 原值（null = 原来没有）}, nos }，给 ⑦ 撤销用。
// 单号表：写成记录的 → 记录编号；合并的 → 手记编号；全额退款、你勾掉 / 不要了、定了的跳过状态、按类型规则跳过的 → 忽略；
//   退款记号（RW 未用 / RU 已用）→ 忽略；等待付款这类以后还会变的状态不登记；待处理的不登记（进待处理池）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportWrite = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-O';
  // 定了的跳过状态：以后不会再变成「交易成功」，登记成忽略；等待付款、等待确认收货这类不登记
  var FINAL_SKIP = ['交易关闭', '失败', '交易失败', '支付失败', '已撤销'];
  var IGNORE_WHY = ['fullrefund', 'refundedpair', 'closedpair', 'refunded', 'origignored', 'typerule'];

  function cleaner() {
    if (typeof JiwenImportPlan !== 'undefined') return JiwenImportPlan;   // eslint-disable-line no-undef
    if (typeof require === 'function') return require('./plan.js');
    throw new Error('方案模块没有载入');
  }
  function noOf(key) { var i = key.indexOf('|'); return [key.slice(0, i), key.slice(i + 1)]; }
  function money(fen) { return Math.round(fen) / 100; }

  // input：plan() 的输入（parsed、matched、info:{ cats, cps, pms, catRules }、manualById）
  // p：plan() 的结果；ctx：{ batch, at:'YYYY-MM-DDTHH:mm', cpCats, types, statuses }
  //   types / statuses（1016-M）：确认页「没见过的交易类型 / 状态」里选了的 { '来源|类型': 怎么处理 }，存成类型规则
  function build(input, p, ctx) {
    ctx = ctx || {};
    var PL = cleaner(), cleanDesc = PL.cleanDesc;
    var parsed = input.parsed, info = input.info || {}, manualById = input.manualById || {};
    var batch = ctx.batch;
    if (!/^[0-9a-z]{1,40}$/.test(batch || '')) throw new Error('批次号不对');
    var cats = (info.cats || []).slice();
    var cps = (info.cps || []).slice(), pms = (info.pms || []).slice();
    var cpAt = {}, pmAt = {};
    cps.forEach(function (n, i) { if (!(n in cpAt)) cpAt[n] = i; });
    pms.forEach(function (n, i) { if (!(n in pmAt)) pmAt[n] = i; });
    var cpLen = cps.length, pmLen = pms.length;
    function cpIdx(n) { if (!n) return undefined; if (!(n in cpAt)) { cpAt[n] = cps.length; cps.push(n); } return cpAt[n]; }
    function pmIdx(n) { if (!n) return undefined; if (!(n in pmAt)) { pmAt[n] = pms.length; pms.push(n); } return pmAt[n]; }

    var recs = [], changes = {}, chgList = [], orders = [], pending = [], seenOrder = {};
    var counts = {}; (PL.GROUPS || []).forEach(function (g) { counts[g] = 0; });
    var tmpOfKey = {};          // 单号键 → 这批新建记录的临时编号
    var n = 0;
    function newRec(o) { var t = 't' + (++n); o.tmp = t; recs.push(o); return t; }
    function setMode(o, mode) { if (mode === 'skip') o.skip = true; else if (mode === 'flow') o.flow = true; }
    function order(key, time, st, ref) {
      if (!key || seenOrder[key]) return;
      seenOrder[key] = true;
      var x = noOf(key);
      orders.push({ app: x[0], no: x[1], time: time || '', st: st, ref: ref || null });
    }
    function change(id, kind) {
      var c = changes[id];
      if (!c) { c = changes[id] = { id: id, kind: kind, set: {}, nos: [] }; chgList.push(c); }
      return c;
    }
    function rowOf(d) { return parsed.files[d.file].rows[d.row]; }
    function remarkOf(d) {
      var r = rowOf(d), t = cleanDesc(r.desc);
      if (t && t === r.cp) t = '';
      return [t, cleanDesc(r.remark)].filter(Boolean).join(' ').slice(0, 5000);
    }
    function base(d) {
      var r = rowOf(d);
      var o = { time: d.time, money: money(d.fen), type: d.type, cat: d.cat || '未分类', remark: remarkOf(d),
                src: { app: d.app }, oc: String(r.kind || '').slice(0, 32), batch: batch };
      var c = cpIdx(r.cp), m = pmIdx(r.pm);
      if (c !== undefined) o.cp = c;
      if (m !== undefined) o.pm = m;
      if (!o.oc) delete o.oc;
      return o;
    }

    var rows = p.rows.filter(function (d) { return d.src === 'row'; });
    var byRef = {}; rows.forEach(function (d) { byRef[d.file + ':' + d.row] = d; });
    p.rows.forEach(function (d) { counts[d.group] = (counts[d.group] || 0) + d.units; });

    // ---- 合并记录 ----
    var sumDone = {};
    (p.summaries || []).forEach(function (g) {
      var mem = rows.filter(function (d) { return d.summary === g.id && (d.group === 'add' || d.group === 'neutral'); });
      if (!mem.length) return;
      var fen = mem.reduce(function (s, d) { return s + d.fen; }, 0);
      var last = mem.reduce(function (t, d) { return d.time > t ? d.time : t; }, '');
      var ref;
      if (g.appendTo) {
        var c = change(g.appendTo, 'append');
        c.addFen = (c.addFen || 0) + fen;
        ref = { id: g.appendTo };
      } else {
        var o = base(mem[0]);
        o.time = last; o.money = money(fen); o.remark = '';
        o.src = { app: g.app || mem[0].app, sum: g.kind };
        var sameCp = mem.every(function (d) { return d.cp === mem[0].cp; });
        if (!sameCp) delete o.cp;
        delete o.pm;
        setMode(o, mem[0].mode);
        ref = { tmp: newRec(o) };
      }
      mem.forEach(function (d) { sumDone[d.key] = true; order(d.key, d.time, 0, ref); if (g.appendTo) change(g.appendTo).nos.push(noOf(d.key)); });
    });

    // ---- 新增、不计入 ----
    rows.forEach(function (d) {
      if ((d.group !== 'add' && d.group !== 'neutral') || sumDone[d.key]) return;
      var o = base(d);
      setMode(o, d.mode);
      var t = newRec(o);
      tmpOfKey[d.key] = t;
      order(d.key, d.time, 0, { tmp: t });
      // 以前导入的退款 + 这批的原单（1016-D）：旧退款挂到新原单上
      if (d.item && d.item.refundRec && d.type === 'expense') {
        var c = change(d.item.refundRec, 'link');
        c.set.refundOf = { tmp: t };
        c.linkTo = { tmp: t };
      }
    });

    // ---- 合并进手记 ----
    var mergeTime = {};
    rows.forEach(function (d) {
      if (d.group !== 'merge') return;
      var c = change(d.into, 'merge');
      if (!mergeTime[d.into] || d.time < mergeTime[d.into]) mergeTime[d.into] = d.time;
      c.set.time = mergeTime[d.into];
      c.set.src = { app: d.app, merged: true };
      var ci = cpIdx(rowOf(d).cp);
      if (ci !== undefined && c.set.cp === undefined) c.set.cp = ci;
      c.set.batch = batch;
      c.nos.push(noOf(d.key));
      order(d.key, d.time, 0, { id: d.into });
    });
    // 按净额并进手记的退款行：单号登记到那条手记
    rows.forEach(function (d) {
      if (d.group === 'skip' && d.item && d.item.register && d.item.nettedInto) {
        order(d.key, d.time, 0, { id: d.item.nettedInto });
        change(d.item.nettedInto, 'merge').nos.push(noOf(d.key));
      }
    });

    // ---- 退款 ----
    rows.forEach(function (d) {
      if (d.group !== 'refund') return;
      var o = base(d);
      o.type = 'income';
      var to = d.refundTo;
      if (to && to.record) o.refundOf = { id: to.record };
      else if (to && to.row) {
        var od = byRef[to.row.file + ':' + to.row.row];
        if (od && od.group === 'merge') o.refundOf = { id: od.into };
        else if (od && tmpOfKey[od.key]) o.refundOf = { tmp: tmpOfKey[od.key] };
      }
      if (!o.refundOf) setMode(o, d.mode);     // 没挂原单的（只算结余）
      var t = newRec(o);
      order(d.key, d.time, 0, { tmp: t });
    });

    // ---- 待处理：进待处理池，不登记单号 ----
    rows.forEach(function (d) {
      if (d.group !== 'pending') return;
      var x = noOf(d.key);
      pending.push({ app: x[0], no: x[1], t: d.time, amt: d.fen, io: d.type === 'income' ? 'income' : 'expense', cp: d.cp || '',
                     d: d.title || '', cand: (d.cands || []).filter(function (c) { return c.record; }).map(function (c) { return c.record; }),
                     b: batch, why: d.why || '' });
    });

    // 1016-O：原来就在待处理池里、这次有了结论的（不再是待处理、也不是「已经在待处理里了」），写入时从池子里拿掉
    var pendTaken = [];
    rows.forEach(function (d) {
      if (d.item && d.item.wasPend && d.group !== 'pending' && !(d.group === 'skip' && d.why === 'inpending')) pendTaken.push(d.key);
    });

    // ---- 登记成忽略 ----
    var kt = {}; rows.forEach(function (d) { ((d.item && d.item.regIgnore) || []).forEach(function (k) { kt[k] = d.time; }); });
    (p.ignoreOrders || []).forEach(function (k) { order(k, kt[k] || '', 1, null); });
    rows.forEach(function (d) {
      if (d.group === 'excluded') { order(d.key, d.time, 1, null); return; }
      if (d.group !== 'skip') return;
      if (IGNORE_WHY.indexOf(d.why) >= 0 || (d.why === 'status' && FINAL_SKIP.indexOf(d.status) >= 0)) order(d.key, d.time, 1, null);
    });

    // ---- 分类、规则 ----
    var catsAdded = [];
    recs.forEach(function (r) { if (r.cat && cats.indexOf(r.cat) < 0 && catsAdded.indexOf(r.cat) < 0) catsAdded.push(r.cat); });
    var have = {}; (info.catRules || []).forEach(function (r) { if (r && r.kw) have[r.kw] = r.cat; });
    var rulesAdd = [];
    Object.keys(ctx.cpCats || {}).forEach(function (kw) {
      var cat = ctx.cpCats[kw];
      if (!kw || !cat || cat === '未分类' || have[kw] === cat || kw.indexOf('（') === 0) return;
      rulesAdd.push({ kw: kw, cat: cat });
    });
    // 1016-J：分类对照。「新建分类」里手动选了「并到 X」的存「推荐分类 → X」；没动过的默认、选了新建的、落未分类的不存。
    // X 可以是这一批才新建的分类（在 catsAdded 里）：主页面先建分类再存对照
    var haveMap = {}; (info.catMaps || []).forEach(function (m) { if (m && m.from) haveMap[m.from] = m.cat; });
    var mapsAdd = [];
    ((p.sections && p.sections.newCats) || []).forEach(function (n) {
      if (!n.picked || n.on || !n.into || n.into === '未分类') return;
      if (cats.indexOf(n.into) < 0 && catsAdded.indexOf(n.into) < 0) return;
      if (n.name in haveMap) return;
      mapsAdd.push({ from: n.name, cat: n.into });
    });

    // 1016-M：类型规则。确认页上选了处理方式的没见过的交易类型 / 状态，存成 importRules.type，下次直接照办；
    //   没选的不存（下次还问）；存档里同一来源、同一类型（状态）已经有规则的不重复存
    var typesAdd = [];
    var haveType = {}; (info.typeRules || []).forEach(function (r) {
      if (!r || !r.app) return;
      if (r.type !== undefined) haveType['t|' + r.app + '|' + r.type] = 1;
      if (r.status !== undefined) haveType['s|' + r.app + '|' + r.status] = 1;
    });
    var TYPE_AS = ['normal', 'transfer', 'skip'], STATUS_AS = ['import', 'skip'];
    Object.keys(ctx.types || {}).sort().forEach(function (k) {
      var i = k.indexOf('|'), app = k.slice(0, i), type = k.slice(i + 1), as = ctx.types[k];
      if (i <= 0 || !type || TYPE_AS.indexOf(as) < 0 || haveType['t|' + k]) return;
      typesAdd.push({ app: app, type: type, as: as });
    });
    Object.keys(ctx.statuses || {}).sort().forEach(function (k) {
      var i = k.indexOf('|'), app = k.slice(0, i), status = k.slice(i + 1), as = ctx.statuses[k];
      if (i <= 0 || !status || STATUS_AS.indexOf(as) < 0 || haveType['s|' + k]) return;
      typesAdd.push({ app: app, status: status, as: as });
    });

    // ---- 这一批的导入记录（新记录的编号由主页面填进 add）----
    var apps = [], from = '', to = '';
    parsed.files.forEach(function (f) {
      if (f.fatal) return;
      if (apps.indexOf(f.app) < 0) apps.push(f.app);
      var a = f.range ? f.range.from.slice(0, 10) : '', b = f.range ? f.range.to.slice(0, 10) : '';
      if (a && (!from || a < from)) from = a;
      if (b && (!to || b > to)) to = b;
    });
    var total = parsed.files.reduce(function (s, f) { return s + (f.fatal ? 0 : f.stats.parsed.total); }, 0);
    return {
      version: VERSION, batch: batch, at: ctx.at || '',
      records: recs, changes: chgList, orders: orders, pending: pending, pendTaken: pendTaken,
      cps: cps, pms: pms, cpLen: cpLen, pmLen: pmLen, catsAdded: catsAdded, rulesAdd: rulesAdd, mapsAdd: mapsAdd, typesAdd: typesAdd,
      log: { b: batch, at: ctx.at || '', apps: apps, from: from, to: to, cpLen: cpLen, pmLen: pmLen, catsAdded: catsAdded,
             rulesAdded: mapsAdd.length ? { cat: rulesAdd, type: typesAdd, map: mapsAdd } : { cat: rulesAdd, type: typesAdd } },
      counts: counts, total: total
    };
  }

  // 1016-K：记录的指纹（给 ⑦ 撤销认「导入后你改过没有」）。不含 id、refundOf（导入备份时会重新编号），
  //   字段按名字排序（编辑时字段顺序变了不算改过），对象字段同样排序。53 位哈希，36 进制
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function recHash(r) {
    var o = {}; Object.keys(r || {}).forEach(function (k) { if (k !== 'id' && k !== 'refundOf' && r[k] !== undefined) o[k] = r[k]; });
    var str = canon(o), h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) { var ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  return { VERSION: VERSION, build: build, FINAL_SKIP: FINAL_SKIP, recHash: recHash };
});
