// 记问 · 账单导入 · 写入清单（纯计算，第一期 ⑥b）
// 把确认页上的最终方案（plan.js 的结果）翻译成一张「写入清单」：要新建的记录、要改的记录（带改之前的值）、
// 要登记的单号、待处理池、这一批的导入记录、名单、新分类、新规则。只读方案，不重新配对。
// 真正写进库由主页面 JiwenImportStore.commit(清单) 做（一个事务）；这里不碰页面、存储。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportWrite，Node 里直接 require。
//
// 记录的写法：
//   新增 / 不计：{ time, money, type, cat, remark, 口径, src:{app}, cp, pm, oc, batch }（cp、pm 是名单里的编号）
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

  var VERSION = '1016-Z6';
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

    // ---- 新增、不计 ----
    rows.forEach(function (d) {
      if ((d.group !== 'add' && d.group !== 'neutral') || sumDone[d.key]) return;
      var o = base(d);
      setMode(o, d.mode);
      if (d.ob && d.mode === 'flow') o.ob = 1;     // 导入简化 2a：大额选了往来、标了期初余额
      // 1021-T13（实测 10-20）：待确认分类：推荐把握低或未分类、你没在确认页定过（还是推荐的）、不是不计的 → rv:1，
      //   到账单页「待确认分类」里慢慢改（改了分类就去掉）。指纹 recHash 不含它
      //   导入简化 2b：推荐的新分类不到 3 笔、并进了「其他」这类已有分类的也标（d.rec.newCat 和现在的分类不一样）
      if (d.group === 'add' && d.mode !== 'skip' && d.catFrom === 'rec' && (o.cat === '未分类' || (d.rec && d.rec.conf === 'low') || d.ncAuto)) o.rv = 1;
      var t = newRec(o);
      tmpOfKey[d.key] = t;
      order(d.key, d.time, 0, { tmp: t });
      // 1.1（1016-Z4）：零钱提现的服务费单独记一笔支出（计入），跟着这笔提现的批次；不另登记单号（提现那笔登记了，再导时一起跳过）
      if (d.feeFen > 0 && d.group === 'neutral') {
        var fo = base(d);
        fo.money = money(d.feeFen); fo.type = 'expense'; fo.cat = (p.sections && p.sections.feeCat) || '未分类'; fo.remark = '零钱提现服务费';
        newRec(fo);
      }
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
      // 1.1（1016-X）：金额相近自动合并的，确认页选了「改成实付」：手记金额改成账单的（原值记进导入记录，撤销时还原）
      if (d.why === 'near' && d.item && d.into === d.item.into && p.sections && p.sections.nearMerged && (p.sections.nearMerged.pays ? p.sections.nearMerged.pays[d.key] : p.sections.nearMerged.pay)) c.set.money = money(d.fen);   // 1017-D：一笔一笔定
      c.nos.push(noOf(d.key));
      // 第二期（1016-Z6）：合并进去的账单本身记一份（账单详情里「拆开」时用它新建记录）：来源、单号、金额、时间、收支、备注、对方、支付方式、原始分类
      var rw = rowOf(d), bl = { app: d.app, no: noOf(d.key)[1], fen: d.fen, time: d.time, type: d.type, remark: remarkOf(d) };
      var bc = cpIdx(rw.cp), bp = pmIdx(rw.pm);
      if (bc !== undefined) bl.cp = bc;
      if (bp !== undefined) bl.pm = bp;
      if (rw.kind) bl.oc = String(rw.kind).slice(0, 32);
      (c.bills = c.bills || []).push(bl);
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
      if (!o.refundOf) setMode(o, d.mode);     // 没挂原单的（往来）
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
    var rulesAdd = [], rulesChange = [], learnedN = 0;
    var okCat = function (c) { return c && c !== '未分类' && (cats.indexOf(c) >= 0 || catsAdded.indexOf(c) >= 0); };
    // 确认页「按对方选分类」选了的：记成你的规则（1016-Y：这个关键词已经有规则、分类不一样的，改那条规则，不再加一条一样的关键词）
    Object.keys(ctx.cpCats || {}).forEach(function (kw) {
      var cat = ctx.cpCats[kw];
      if (!kw || !cat || cat === '未分类' || have[kw] === cat || kw.indexOf('（') === 0 || kw.indexOf('品：') === 0) return;   // 1021-T14：按商品说明归的组不存规则（规则只认对方）
      if (have[kw] !== undefined) rulesChange.push({ kw: kw, from: have[kw], to: cat });
      else { rulesAdd.push({ kw: kw, cat: cat }); have[kw] = cat; }
    });
    // 1016-Y：你的规则归的分类被你在确认页改掉、选了「以后都改」：改那条规则
    Object.keys(ctx.ruleFix || {}).forEach(function (kw) {
      var cat = ctx.ruleFix[kw];
      if (!kw || !okCat(cat) || have[kw] === undefined || have[kw] === cat) return;
      if (rulesChange.some(function (x) { return x.kw === kw; })) return;
      rulesChange.push({ kw: kw, from: have[kw], to: cat });
    });
    // 1016-Y：从合并里学到的（同一对方至少合并上 2 次、分类一致、没矛盾）：存成你的规则；已经有这个关键词的规则就不存
    ((input.matched && input.matched.learned) || []).forEach(function (x) {
      if (!x || !x.kw || x.count < 2 || !okCat(x.cat) || have[x.kw] !== undefined) return;
      rulesAdd.push({ kw: x.kw, cat: x.cat }); have[x.kw] = x.cat; learnedN++;
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
    var TYPE_AS = ['normal', 'transfer', 'skip', 'refund'], STATUS_AS = ['import', 'skip'];   // 1016-Z2：加「当退款」
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

    // 导入简化第 3 版：大额的选法：核对页「大额，先定算不算收支」里你点过的那几笔，记成 importRules.big（同一对方、金额相近的下次照办）
    var bigAdd = [];
    ((p.sections && p.sections.bigAsks) || []).forEach(function (x) {
      if (!x.picked || !x.cpKey) return;
      var d = rows.filter(function (r) { return r.key === x.key; })[0]; if (!d || (d.group !== 'add' && d.group !== 'neutral')) return;
      var o = { cp: x.cpKey, fen: x.fen, mode: x.mode }; if (x.ob && x.mode === 'flow') o.ob = 1;
      if (!bigAdd.some(function (b) { return b.cp === o.cp && Math.abs(b.fen - o.fen) <= Math.round(b.fen * 0.2); })) bigAdd.push(o);
    });

    // ---- 这一批的导入记录（新记录的编号由主页面填进 add）----
    var apps = [], from = '', to = '', rng = {};
    parsed.files.forEach(function (f) {
      if (f.fatal) return;
      if (apps.indexOf(f.app) < 0) apps.push(f.app);
      var a = f.range ? f.range.from.slice(0, 10) : '', b = f.range ? f.range.to.slice(0, 10) : '';
      if (a && (!from || a < from)) from = a;
      if (b && (!to || b > to)) to = b;
      // 1016-U：每个来源各自的账单起止（记住上次导到哪天用）
      if (a && b) { var r0 = rng[f.app]; rng[f.app] = r0 ? [a < r0[0] ? a : r0[0], b > r0[1] ? b : r0[1]] : [a, b]; }
    });
    var total = parsed.files.reduce(function (s, f) { return s + (f.fatal ? 0 : f.stats.parsed.total); }, 0);
    var log = { b: batch, at: ctx.at || '', apps: apps, from: from, to: to, rng: rng, cpLen: cpLen, pmLen: pmLen, catsAdded: catsAdded,
                rulesAdded: mapsAdd.length ? { cat: rulesAdd, type: typesAdd, map: mapsAdd } : { cat: rulesAdd, type: typesAdd } };
    if (ctx.m && typeof ctx.m === 'object') log.m = ctx.m;     // 导入简化第 1 版：导入量度（plan.js 的 measure()，只有数字），没有就不写
    return {
      version: VERSION, batch: batch, at: ctx.at || '',
      records: recs, changes: chgList, orders: orders, pending: pending, pendTaken: pendTaken,
      cps: cps, pms: pms, cpLen: cpLen, pmLen: pmLen, catsAdded: catsAdded, rulesAdd: rulesAdd, mapsAdd: mapsAdd, typesAdd: typesAdd, rulesChange: rulesChange, learnedN: learnedN,
      bigAdd: bigAdd, log: log,
      counts: counts, total: total
    };
  }

  // 1016-Q：只对账。从完整的写入清单里只留你勾选的几笔（keys：单号键）要新建的记录和它们的单号登记；
  //   其余一律不动：不合并、不改以前的记录、不登记忽略、不进待处理池、不存规则 / 对照 / 类型规则。
  //   名单按留下的记录重新拼（只加用到的名字），新分类只留用到的。导入记录照记（能撤销）
  function onlyKeys(ws, keys, info) {
    info = info || {};
    var want = {}; (keys || []).forEach(function (k) { want[k] = true; });
    var orders = ws.orders.filter(function (o) { return want[o.app + '|' + o.no] && o.st === 0 && o.ref && o.ref.tmp; });
    var tmps = {}; orders.forEach(function (o) { tmps[o.ref.tmp] = true; });
    // 1021-T22（实测 10-21 第 13 条）：勾了原单，这一批里挂在它上面的退款一起补进（不然支出多算）；退款自己的单号也登记上
    var refTmp = {}, nRef = 0;
    ws.records.forEach(function (r) { if (r.refundOf && r.refundOf.tmp && tmps[r.refundOf.tmp] && !tmps[r.tmp]) { refTmp[r.tmp] = true; nRef++; } });
    ws.orders.forEach(function (o) { if (o.st === 0 && o.ref && o.ref.tmp && refTmp[o.ref.tmp] && orders.indexOf(o) < 0) orders.push(o); });
    Object.keys(refTmp).forEach(function (t) { tmps[t] = true; });
    var cps = (info.cps || []).slice(), pms = (info.pms || []).slice(), cpAt = {}, pmAt = {};
    cps.forEach(function (n, i) { if (!(n in cpAt)) cpAt[n] = i; });
    pms.forEach(function (n, i) { if (!(n in pmAt)) pmAt[n] = i; });
    var idx = function (list, at, name) { if (!(name in at)) { at[name] = list.length; list.push(name); } return at[name]; };
    var recs = ws.records.filter(function (r) { return tmps[r.tmp] && (!r.refundOf || refTmp[r.tmp]); }).map(function (r) {
      var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
      if (Number.isInteger(r.cp)) o.cp = idx(cps, cpAt, ws.cps[r.cp]);
      if (Number.isInteger(r.pm)) o.pm = idx(pms, pmAt, ws.pms[r.pm]);
      return o;
    });
    var keep = {}; recs.forEach(function (r) { keep[r.tmp] = true; });
    orders = orders.filter(function (o) { return keep[o.ref.tmp]; });
    var catsAdded = ws.catsAdded.filter(function (c) { return recs.some(function (r) { return r.cat === c; }); });
    var counts = {}; Object.keys(ws.counts).forEach(function (k) { counts[k] = 0; });
    counts.add = orders.length - nRef; if (nRef) counts.refund = nRef;
    var log = {}; Object.keys(ws.log).forEach(function (k) { log[k] = ws.log[k]; });
    log.catsAdded = catsAdded; log.rulesAdded = { cat: [], type: [] }; log.only = true;
    // 1017-X：补进去的这几笔原来在待处理池里的（以前导入时留下的），从池子里拿掉（不然待处理里还有一份，再作为新增就记了两遍）；
    //   拿掉的带原来的位置记进导入记录，撤销这次只对账时放回去
    var booked = {}; orders.forEach(function (o) { booked[o.app + '|' + o.no] = true; });
    var pendTaken = (ws.pendTaken || []).filter(function (k) { return booked[k]; });
    return { version: ws.version, batch: ws.batch, at: ws.at, records: recs, changes: [], orders: orders, pending: [], pendTaken: pendTaken,
             cps: cps, pms: pms, cpLen: ws.cpLen, pmLen: ws.pmLen, catsAdded: catsAdded, rulesAdd: [], mapsAdd: [], typesAdd: [], bigAdd: [],
             log: log, counts: counts, total: ws.total, only: true };
  }

  // 1016-K：记录的指纹（给 ⑦ 撤销认「导入后你改过没有」）。不含 id、refundOf（导入备份时会重新编号），
  //   字段按名字排序（编辑时字段顺序变了不算改过），对象字段同样排序。53 位哈希，36 进制
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function recHash(r) {
    var o = {}; Object.keys(r || {}).forEach(function (k) { if (k !== 'id' && k !== 'refundOf' && k !== 'rv' && r[k] !== undefined) o[k] = r[k]; });   // 1021-T13：待确认分类标记 rv 不算（去掉标记不算「导入后你改过」）
    var str = canon(o), h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) { var ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  return { VERSION: VERSION, build: build, onlyKeys: onlyKeys, FINAL_SKIP: FINAL_SKIP, recHash: recHash };
});
