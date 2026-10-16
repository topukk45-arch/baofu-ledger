// 记问 · 账单导入 · 导入方案（纯计算，第一期 ⑥a）
// 方案 = 三步（parse → route → match）算出来的结果 + 你在确认页上的改动。确认页上的数字全从这里出：
// 汇总、每个文件 × 收支的差额拆解、按钮上的笔数、要你定的几块、明细分组。改了东西就再调一次 plan()，不重跑三步。
// 和 core.js 同样的写法：浏览器里是全局变量 JiwenImportPlan，Node 里直接 require。不碰页面、存储。
//
// 改动（edits），都按单号键（route 给每一行的 key）存：
//   rows[key]  = { exclude, cat, mode: 'normal'|'flow'|'skip', split, pick: 'new' | 'drop' | { record } | { row } }
//   cpCats[清洗后的对方] = 分类          未分类按对方归组，一组选一次
//   newCats[分类名] = { on, into }        新建分类：建不建、不建就并到哪个已有分类
//   receipt    收款按天合并（默认 true）
//   petty[键]  疑似零碎扣款合不合并（默认 false）
//   没见过的交易类型 / 状态怎么处理会牵连别的行，不在这里：由确认页带着临时规则重跑 route、match。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.JiwenImportPlan = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1016-B';
  var GROUPS = ['add', 'merge', 'pending', 'refund', 'neutral', 'skip', 'error', 'excluded'];
  var GROUP_NAME = { add: '新增', merge: '和手记合并', pending: '待你确认', refund: '退款', neutral: '不计入', skip: '跳过', error: '出错', excluded: '你勾掉的' };
  // 差额拆解的各项（按这个顺序列）
  var PARTS = [['newNormal', '新增（计入）'], ['newFlow', '新增（只算结余）'], ['neutral', '不计入'], ['merge', '和手记合并'],
               ['refund', '退款'], ['pending', '待你确认'], ['skip', '跳过'], ['excluded', '你勾掉的']];
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
  function refundish(it) { return it.why === 'refundcands' || !!(it.cands && it.cands[0] && it.cands[0].row); }

  // input = { parsed, matched, info: { cats, isNewUser }, manualById: { id: { time, fen, cat, type, mode } }, overlaps: [{ app, from, to }] }
  function plan(input, edits) {
    edits = edits || {};
    var E = edits.rows || {}, cpCats = edits.cpCats || {}, ncE = edits.newCats || {}, pettyE = edits.petty || {};
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
              refundTo: it.refundTo || null, item: it };
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
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      var e = E[d.key] || {};
      var it = d.item;
      if (d.group === 'merge') {
        if (e.split) { d.group = 'add'; d.into = null; d.reason = '拆开了，改为新增'; d.splitFrom = it.into; }
        else pickedRecords[d.into] = d.key;
      }
      if (d.group === 'pending' && e.pick) {
        if (e.pick === 'drop') { d.group = 'excluded'; d.reason = '待你确认里选了「不要了」'; }
        else if (e.pick === 'new') {
          if (refundish(it)) { d.group = 'refund'; d.mode = 'flow'; d.reason = '不挂原单，按只算结余导入'; }
          else { d.group = 'add'; d.reason = '待你确认里选了「作为新增」'; }
        } else if (e.pick.record && !refundish(it)) {
          if (!pickedRecords[e.pick.record]) { d.group = 'merge'; d.into = e.pick.record; d.reason = '待你确认里选了和这条手记合并'; pickedRecords[e.pick.record] = d.key; }
        } else if (e.pick.record || e.pick.row) { d.group = 'refund'; d.refundTo = e.pick; d.reason = '待你确认里选了挂到这笔原单'; }
      }
      if (e.exclude && (d.group === 'add' || d.group === 'neutral' || d.group === 'refund')) { d.group = 'excluded'; d.reason = '你勾掉了'; }
      if (e.mode && (d.group === 'add' || d.group === 'neutral')) d.mode = e.mode;
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
    });
    // 未分类按对方归组，一组选一次
    var cpg = {};
    rows.forEach(function (d) {
      if (d.src !== 'row' || d.catFrom !== 'rec' || d.cat !== '未分类') return;
      if (['add', 'neutral', 'pending', 'refund'].indexOf(d.group) < 0) return;
      var k = clean(d.cp) || '（没有交易对方）';
      var g = cpg[k] || (cpg[k] = { cp: k, n: 0, fen: 0, min: Infinity, max: -Infinity, hours: {}, keys: [] });
      g.n += d.units; g.fen += d.fen; g.min = Math.min(g.min, d.fen); g.max = Math.max(g.max, d.fen); g.keys.push(d.key);
      var h = +d.time.slice(11, 13); g.hours[h] = (g.hours[h] || 0) + 1;
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
      d.canPick = d.bucket0 === 'pending';
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
          else if (d.group === 'merge') { k = 'merge'; var m = manualById[d.into]; if (m) mergeDelta += m.fen - d.fen; }
          else k = d.group;
          parts[k].n += d.units; parts[k].fen += d.fen;
        });
        var h = f.stats.header[io], sum = 0;
        PARTS.forEach(function (p) { sum += parts[p[0]].fen; });
        var unreadable = h ? h.fen - sum : null;
        o.diff[io] = { title: IO_NAME[io], header: h, parts: PARTS.map(function (p) { return { key: p[0], label: p[1], n: parts[p[0]].n, fen: parts[p[0]].fen }; }),
                       sum: sum, unreadable: unreadable, ok: h ? (unreadable === 0 || (o.errors > 0 && unreadable >= 0)) : null, mergeDelta: mergeDelta };
      });
      return o;
    });
    var blocking = files.filter(function (f) { return f.countOk === false; });
    var good = files.filter(function (f) { return !f.fatal; });
    var canImport = !blocking.length && good.length > 0 && importN + mergeM > 0;

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
    sec.newCats = newCatsIn.map(function (c) { var p = ncPlan[c.name]; return { name: c.name, count: c.count, on: p.on, into: p.into, defaultOn: !!c.defaultOn }; });
    sec.cpGroups = Object.keys(cpg).map(function (k) {
      var g = cpg[k], hb = null, hn = 0;
      Object.keys(g.hours).forEach(function (h) { if (g.hours[h] > hn) { hn = g.hours[h]; hb = +h; } });
      return { cp: g.cp, n: g.n, fen: g.fen, min: g.min, max: g.max, hour: hn * 2 > g.keys.length ? hb : null, cat: cpCats[k] || null, keys: g.keys };
    }).sort(function (a, b) { return b.n - a.n || b.fen - a.fen; });
    var notes = { neutralVsNormal: [], joined: [], noNote: [], overlap: [] };
    rows.forEach(function (d) { d.tags.forEach(function (t) { if (notes[t] && d.key) notes[t].push(d.key); }); });
    sec.notes = notes;

    // ---- 要新建几条记录（分分捐、收款按天合并、勾上的零碎扣款合成一条）----
    var inGroup = {};
    (matched.summaries || []).forEach(function (g) {
      if (g.kind === 'receipt' && !receiptOn) return;
      g.items.forEach(function (r) { inGroup[r.file + ':' + r.row] = g; });
    });
    sec.petty.forEach(function (p, i) {
      if (!p.on) return;
      var x = matched.suspects[i];
      x.items.forEach(function (r) { if (!inGroup[r.file + ':' + r.row]) inGroup[r.file + ':' + r.row] = { id: 'S' + i, appendTo: null }; });
    });
    var records = 0, seenG = {};
    rows.forEach(function (d) {
      if (d.src !== 'row' || (d.group !== 'add' && d.group !== 'neutral' && d.group !== 'refund')) return;
      var g = inGroup[d.file + ':' + d.row];
      if (!g) { records++; return; }
      if (!seenG[g.id]) { seenG[g.id] = true; if (!g.appendTo) records++; }
    });
    // 要登记的单号：新增、不计入、退款、合并，加上按净额并进手记的退款行
    var orders = 0;
    rows.forEach(function (d) {
      if (d.src !== 'row') return;
      if (['add', 'neutral', 'refund', 'merge'].indexOf(d.group) >= 0 || (d.group === 'skip' && d.item.register)) orders += d.units;
    });

    // ---- 明细分组（按时间倒序，和账单列表一样）----
    var groups = {};
    GROUPS.forEach(function (g) { groups[g] = []; });
    rows.forEach(function (d) { groups[d.group].push(d); });
    GROUPS.forEach(function (g) { groups[g].sort(function (a, b) { return (b.time || '') < (a.time || '') ? -1 : (b.time || '') > (a.time || '') ? 1 : 0; }); });

    return { version: VERSION, files: files, counts: counts, sums: sums, importN: importN, mergeM: mergeM, records: records, orders: orders,
             canImport: canImport, blocking: blocking.map(function (f) { return f.name; }), sections: sec, groups: groups,
             groupNames: GROUP_NAME, rows: rows };
  }

  // 「复制给开发者」：只带表头、交易类型、交易状态，不带金额、对方、单号、文件名
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

  return { VERSION: VERSION, plan: plan, devText: devText, yuan: yuan, GROUPS: GROUPS, GROUP_NAME: GROUP_NAME };
});
