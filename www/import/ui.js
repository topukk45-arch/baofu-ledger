// 记问 · 账单导入 · 导入页（确认页，第一期 ⑥a：只看，不写）
// 整页盖在别的页面上面（不是小弹窗：要放核对、汇总、要你定的几块和几千行明细）。顶上「‹ 取消」、安卓返回键都等于取消。
// 流程：选文件（可多选）→ 线程里依次跑 parse、route、match（中间主页面按两步把单号表、手记、退款候选查好交进去）
//       → 进度 → 确认页。确认页上改的东西只改内存里的方案（plan.js），点「导入」这一版只提示「开发中」。
// 页面元素和样式都在打开时由这里生成，index.html 里只有入口；用户数据一律 textContent，不拼进 innerHTML。
// 只通过 window.JiwenImportStore 的只读函数拿账本数据，不碰账本内部。
// 1016-F：点「导入」真的写进去（write.js 出写入清单 → JiwenImportStore.commit 一个事务写入，写前自动备份），写完显示结果页。
// 1016-C：多笔合一、几笔抢一条手记、转账往来三块卡片；候选第一条标「最像」、其余收起；合并记录（分分捐等）明细里一行、点开看；
//   套话不当标题；存储那行改成「可用存储空间」。
// 1016-L：结果页「撤销这次导入」；openLogs() 是「设置 → 导入记录」（最近 10 次，每次右侧「撤销」），也画在这一页里；
//   撤销先弹确认框（undo.js 的摘要），撤完停在导入记录，顶上「已撤销，删了 x 条、还原了 y 条」；撤销中返回键不关页面。
// 1016-M：「没见过的交易类型 / 状态」选了处理方式的，导入时存成类型规则（write.js 的 typesAdd）；选过的行重算后照样留着能改。
(function () {
  'use strict';
  if (window.JiwenImportUI) return;
  var PAGE = 50;                    // 明细每次显示几行
  var APP = { alipay: '支付宝', wechat: '微信' };
  var Plan = window.JiwenImportPlan;
  var S = null;                     // 这一次导入的状态（关掉就清掉）
  var runId = 0;
  var dom = null;

  // ---------- 小工具 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function btn(text, cls, fn) { var b = el('button', cls || 'imp-btn', text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function yuan(f) { return Plan.yuan(f); }
  function alertMsg(msg, title) { if (typeof window.customAlert === 'function') window.customAlert(msg, title || '导入'); }
  function store() { return window.JiwenImportStore; }
  function J() { return window.JiwenImport; }
  function fmtTime(t) { return String(t || '').slice(5, 16).replace('T', ' '); }

  // ---------- 样式 ----------
  var CSS = [
    '#impPage{position:fixed;left:0;top:0;right:0;bottom:0;z-index:990;background:var(--c-bg);overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 84px;display:none;color:var(--c-text);}',
    '#impPage .imp-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 14px;background:var(--c-bg);border-bottom:1px solid var(--c-border);}',
    '#impPage .imp-back{background:none;border:none;color:var(--c-primary-deep);font-size:16px;padding:4px 6px;cursor:pointer;}',
    '#impPage .imp-title{flex:1;font-weight:bold;font-size:16px;color:var(--c-primary-deep);}',
    '#impPage .imp-sub{font-size:12px;color:var(--c-text-soft);}',
    '#impBody{padding:12px 14px;}',
    '.imp-card{background:linear-gradient(135deg,var(--c-card-1),var(--c-card-2));border:1px solid var(--c-border);border-radius:12px;padding:12px;margin-bottom:12px;}',
    '.imp-card h4{font-size:14px;margin-bottom:8px;color:var(--c-primary-deep);}',
    '.imp-line{font-size:13px;line-height:1.7;}',
    '.imp-soft{font-size:12px;color:var(--c-text-soft);line-height:1.6;}',
    '.imp-ok{color:var(--c-pos);}.imp-bad{color:var(--c-neg);font-weight:bold;}',
    '.imp-chips{display:flex;flex-wrap:wrap;gap:6px;}',
    '.imp-chip{border:1px solid var(--c-border-mid);background:var(--c-surface);color:var(--c-text);border-radius:14px;padding:4px 10px;font-size:13px;cursor:pointer;}',
    '.imp-chip b{color:var(--c-primary-deep);}',
    '.imp-btn{border:1px solid var(--c-border-mid);background:var(--c-surface);color:var(--c-text);border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer;}',
    '.imp-btn.gold{background:linear-gradient(135deg,var(--c-primary-mid),var(--c-primary));color:var(--c-on-primary);border:none;}',
    '.imp-btn[disabled]{opacity:.45;cursor:not-allowed;}',
    '.imp-row-opt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;border-bottom:1px dashed var(--c-border);font-size:13px;}',
    '.imp-row-opt:last-child{border-bottom:none;}',
    '.imp-row-opt .grow{flex:1 1 160px;min-width:0;}',
    '.imp-row-opt select{max-width:9em;}',
    '.imp-link{background:none;border:none;color:var(--c-primary-deep);text-decoration:underline;font-size:12px;padding:0;cursor:pointer;}',
    '.imp-gh{display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--c-border);cursor:pointer;font-size:14px;}',
    '.imp-list{background:var(--c-surface);border:1px solid var(--c-border);border-radius:8px;margin:6px 0 10px;}',
    '.imp-list .al-row{display:flex;align-items:center;gap:8px;padding:9px 10px 2px;cursor:pointer;}',
    '.imp-list .imp-why{font-size:11.5px;color:var(--c-text-soft);padding:0 10px 8px;border-bottom:1px solid var(--c-border);cursor:pointer;}',
    '.imp-tag{display:inline-block;font-size:11px;border:1px solid var(--c-border-mid);border-radius:8px;padding:0 5px;margin-left:4px;}',
    '#impBar{position:fixed;left:0;right:0;bottom:0;z-index:991;display:none;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:var(--c-bg);border-top:1px solid var(--c-border);}',
    '#impBar .imp-btn{flex:1;padding:10px;font-size:15px;}',
    '#impSheetMask{position:fixed;inset:0;z-index:995;background:rgba(0,0,0,.3);display:none;align-items:flex-end;justify-content:center;}',
    '#impSheet{background:var(--c-surface-2);width:100%;max-width:520px;max-height:85vh;overflow-y:auto;border-radius:14px 14px 0 0;padding:16px;}',
    '#impSheet h4{font-size:15px;margin-bottom:8px;color:var(--c-primary-deep);}',
    '#impSheet .kv{display:flex;gap:8px;font-size:13px;padding:3px 0;}#impSheet .kv span:first-child{flex:0 0 5em;color:var(--c-text-soft);}',
    '#impSheet .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}',
    '.imp-sub-row{display:flex;align-items:center;gap:8px;padding:4px 0 4px 8px;font-size:12.5px;}',
    '.imp-sub-row .grow{flex:1 1 140px;min-width:0;}',
    '.imp-best{display:inline-block;font-size:11px;background:var(--c-primary);color:var(--c-on-primary);border-radius:8px;padding:0 5px;margin-right:4px;}',
    '.imp-switch{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid var(--c-border-mid);border-radius:14px;padding:3px 10px 3px 4px;font-size:12px;background:var(--c-surface);color:var(--c-text);}',
    '.imp-switch i{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--c-border-mid);}',
    '.imp-switch.on{background:var(--c-primary);border-color:var(--c-primary);color:var(--c-on-primary);}.imp-switch.on i{background:var(--c-on-primary);}',
    '.imp-members{padding:0 10px 6px 18px;border-bottom:1px solid var(--c-border);}',
    '#impProg{position:fixed;inset:0;z-index:996;background:rgba(0,0,0,.3);display:none;align-items:center;justify-content:center;}',
    '#impProg .box{background:var(--c-surface-2);border-radius:12px;padding:18px;width:80%;max-width:320px;text-align:center;}',
    '#impProg .bar{height:6px;background:var(--c-chip);border-radius:3px;margin:12px 0;overflow:hidden;}#impProg .bar i{display:block;height:100%;width:0;background:var(--c-primary);}'
  ].join('\n');

  // ---------- 页面骨架 ----------
  function build() {
    if (dom) return dom;
    var st = el('style'); st.id = 'impStyle'; st.textContent = CSS; document.head.appendChild(st);
    var page = el('div'); page.id = 'impPage';
    var head = el('div', 'imp-head');
    var back = btn('‹ 取消', 'imp-back', function () { close(); }); back.id = 'impBack';
    var tt = el('div', 'imp-title', '导入账单'); tt.id = 'impTitle';
    var sub = el('div', 'imp-sub'); sub.id = 'impArchive';
    head.appendChild(back); head.appendChild(tt); head.appendChild(sub);
    var body = el('div'); body.id = 'impBody';
    page.appendChild(head); page.appendChild(body);
    var bar = el('div'); bar.id = 'impBar';
    var cancel = btn('取消', 'imp-btn', function () { close(); }); cancel.id = 'impCancel';
    var go = btn('导入', 'imp-btn gold', onImport); go.id = 'impGo';
    bar.appendChild(cancel); bar.appendChild(go);
    var file = el('input'); file.type = 'file'; file.id = 'impFile'; file.multiple = true; file.accept = '.csv,.xlsx,text/csv'; file.style.display = 'none';
    file.addEventListener('change', function () { var fs = [].slice.call(file.files || []); file.value = ''; if (fs.length) start(fs); });
    var sm = el('div'); sm.id = 'impSheetMask'; var sh = el('div'); sh.id = 'impSheet'; sm.appendChild(sh);
    sm.addEventListener('click', function (e) { if (e.target === sm) closeSheet(); });
    var pg = el('div'); pg.id = 'impProg';
    var box = el('div', 'box'); var pt = el('div', 'imp-line', ''); pt.id = 'impProgText';
    var pb = el('div', 'bar'); var pi = el('i'); pi.id = 'impProgBar'; pb.appendChild(pi);
    var pc = btn('取消', 'imp-btn', function () { close(); }); pc.id = 'impProgCancel';
    box.appendChild(pt); box.appendChild(pb); box.appendChild(pc);
    pg.appendChild(box);
    [page, bar, file, sm, pg].forEach(function (x) { document.body.appendChild(x); });
    dom = { page: page, body: body, bar: bar, go: go, file: file, sheetMask: sm, sheet: sh, prog: pg, progText: pt, progBar: pi, title: tt, archive: sub };
    return dom;
  }

  // ---------- 打开 / 关掉 ----------
  function open() {
    build();
    S = { phase: 'pick', edits: { rows: {}, cpCats: {}, newCats: {}, petty: {}, receipt: true, sums: {} }, types: {}, statuses: {},
          view: { details: false, open: {}, shown: {}, tag: null, sumOpen: {}, moreCands: {} } };
    try { dom.archive.textContent = '导入到存档「' + store().archiveInfo().name + '」'; } catch (_) { dom.archive.textContent = ''; }
    dom.title.textContent = '导入账单';
    dom.page.style.display = 'block'; dom.bar.style.display = 'none';
    renderPick();
  }
  function close() {
    if (S && (S.phase === 'writing' || S.phase === 'undoing')) return;
    runId++;
    if (J()) try { J().cancel(); } catch (_) {}
    if (!dom) return;
    dom.page.style.display = 'none'; dom.bar.style.display = 'none';
    dom.prog.style.display = 'none'; dom.sheetMask.style.display = 'none';
    dom.body.innerHTML = '';
    S = null;
  }
  function isOpen() { return !!dom && dom.page.style.display === 'block'; }
  // 返回键：先关最上面那一层（行详情 → 进度（停掉线程，整页也关掉）→ 整页）
  function canBack() { return isOpen(); }
  function back() {
    if (dom.sheetMask.style.display === 'flex') { closeSheet(); return; }
    if (S && (S.phase === 'writing' || S.phase === 'undoing')) return;   // 写入 / 撤销中不让退出（写完或失败会自己回来）
    close();
  }

  // ---------- 第一步：选文件 ----------
  function renderPick() {
    var b = dom.body; b.innerHTML = '';
    var c = el('div', 'imp-card');
    c.appendChild(el('h4', null, '导入微信 / 支付宝账单（开发中）'));
    c.appendChild(el('div', 'imp-soft', '先在微信或支付宝里导出账单（选「用于个人对账」），把压缩包解压出来，再选里面的 csv / xlsx 文件。可以一次选好几个。这一版只看导入方案，不会写进账本。'));
    var row = el('div', 'imp-chips'); row.style.marginTop = '12px';
    var pick = btn('选账单文件', 'imp-btn gold', function () { dom.file.click(); }); pick.id = 'impPick';
    row.appendChild(pick);
    if (typeof window.openDevImportCheck === 'function') { var chk = btn('通路自检', 'imp-btn', function () { window.openDevImportCheck(); }); chk.id = 'impSelfTest'; row.appendChild(chk); }
    c.appendChild(row);
    b.appendChild(c);
  }

  // ---------- 进度 ----------
  function progress(text, done, total) {
    dom.prog.style.display = 'flex';
    var pc = document.getElementById('impProgCancel'); if (pc) pc.style.display = S && (S.phase === 'writing' || S.phase === 'undoing') ? 'none' : '';
    dom.progText.textContent = text;
    dom.progBar.style.width = total ? Math.round(done / total * 100) + '%' : '0';
  }
  function readAll(files) {
    return Promise.all(files.map(function (f) {
      if (typeof f.arrayBuffer === 'function') return f.arrayBuffer().then(function (ab) { return { name: f.name, data: ab }; });
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res({ name: f.name, data: r.result }); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(f); });
    }));
  }
  // 这一次的类型 / 状态规则：存档里的规则，加上确认页上临时选的（只影响这次的方案）
  function typeRules() {
    var out = (S.info.typeRules || []).filter(function (r) {
      return !(r.type !== undefined && S.types[r.app + '|' + r.type]) && !(r.status !== undefined && S.statuses[r.app + '|' + r.status]);
    });
    Object.keys(S.types).forEach(function (k) { var i = k.indexOf('|'); out.push({ app: k.slice(0, i), type: k.slice(i + 1), as: S.types[k] }); });
    Object.keys(S.statuses).forEach(function (k) { var i = k.indexOf('|'); out.push({ app: k.slice(0, i), status: k.slice(i + 1), as: S.statuses[k] }); });
    return out;
  }
  function start(files) {
    var my = ++runId;
    S.phase = 'progress';
    progress('读文件…', 0, 1);
    var alive = function () { return my === runId && S; };
    readAll(files).then(function (fs) {
      if (!alive()) return;
      return J().run('parse', { files: fs }, { onProgress: function (d, t) { if (alive()) progress('读文件…', d, t); } }).then(function (r) {
        if (!alive()) return;
        S.parsed = r.result;
        S.info = store().archiveInfo();
        progress('查以前导入过的…', 0, 1);
        return J().run('lookups', { parsed: S.parsed });
      }).then(function (r) {
        if (!alive() || !r) return;
        return store().knownFor(r.result);
      }).then(function (known) {
        if (!alive() || !known) return;
        S.known = known;
        return compute(my);
      });
    }).catch(function (e) {
      if (!alive() || (e && e.cancelled)) return;
      dom.prog.style.display = 'none';
      alertMsg('导入出错了：' + (e && e.message || e));
      S.phase = 'pick'; renderPick();
    });
  }
  // 从 route 起算一遍（类型 / 状态选择变了也走这里，parse 的结果和单号表不重查）
  function compute(my) {
    var alive = function () { return my === runId && S; };
    progress('定去向…', 0, 1);
    return J().run('route', { parsed: S.parsed, known: S.known, rules: typeRules() }).then(function (r) {
      if (!alive()) return;
      S.routed = r.result;
      return J().run('ledgerQuery', { routed: S.routed, parsed: S.parsed });
    }).then(function (r) {
      if (!alive() || !r) return;
      S.ledger = store().ledgerFor(r.result);
      progress('和手记配对、推荐分类…', 0, 1);
      return J().run('match', { routed: S.routed, parsed: S.parsed, manual: S.ledger.manual, refundCands: S.ledger.refundCands,
                                cats: S.info.cats, rules: S.info.catRules, maps: S.info.catMaps || [], isNewUser: S.info.isNewUser, trace: true });
    }).then(function (r) {
      if (!alive() || !r) return;
      S.matched = r.result;
      S.manualById = {};
      S.ledger.manual.forEach(function (m) { S.manualById[m.id] = m; });
      S.ledger.refundCands.forEach(function (m) { S.manualById[m.id] = m; });
      return store().importsRead().catch(function () { return []; });
    }).then(function (logs) {
      if (!alive() || !logs) return;
      S.overlaps = logs.map(function (l) { return { apps: l.apps || [], from: l.from, to: l.to }; });
      // 重算以后，套不上的改动丢掉（那一行已经不在原来的组里了）
      var lost = 0, keys = {};
      S.matched.items.forEach(function (it) { if (it.key) keys[it.key] = it.bucket; });
      Object.keys(S.edits.rows).forEach(function (k) {
        var e = S.edits.rows[k], b = keys[k];
        var ok = b && !((e.split && b !== 'merge') || (e.pick && b !== 'pending'));
        if (!ok) { delete S.edits.rows[k]; lost++; }
      });
      var sids = {}; (S.matched.multiSums || []).forEach(function (g) { sids[g.id] = g.options.length; });
      Object.keys(S.edits.sums).forEach(function (k) { var v = S.edits.sums[k]; if (!(k in sids) || (typeof v === 'number' && v >= sids[k])) { delete S.edits.sums[k]; lost++; } });
      S.lost = lost;
      dom.prog.style.display = 'none';
      S.phase = 'confirm';
      replan();
    });
  }
  function rerun() {
    var my = ++runId;
    compute(my).catch(function (e) { if (my !== runId || (e && e.cancelled)) return; dom.prog.style.display = 'none'; alertMsg('重新计算出错了：' + (e && e.message || e)); });
  }

  // ---------- 方案 → 页面 ----------
  function replan() {
    S.plan = Plan.plan({ parsed: S.parsed, matched: S.matched, info: S.info, manualById: S.manualById, overlaps: S.overlaps }, S.edits);
    render();
  }
  function render() {
    var y = dom.page.scrollTop;
    var b = dom.body, p = S.plan; b.innerHTML = '';
    dom.title.textContent = '导入确认';
    b.appendChild(renderFiles(p));
    b.appendChild(renderSummary(p));
    renderDecide(p).forEach(function (c) { b.appendChild(c); });
    b.appendChild(renderStorage(p));
    b.appendChild(renderDetails(p));
    // 底部按钮
    dom.bar.style.display = 'flex';
    // 1016-G：写实际新建几条记录（分分捐、收款合并以后），和上面那行一致
    dom.go.textContent = (p.records + p.mergeM === 0 && p.counts.pending) ? '存下待处理 ' + p.counts.pending + ' 笔'
      : '新建 ' + p.records + ' 条记录，合并 ' + p.mergeM + ' 笔';
    dom.go.disabled = !p.canImport;
    dom.page.scrollTop = y;
  }

  function renderFiles(p) {
    var wrap = el('div'); wrap.id = 'impFiles';
    p.files.forEach(function (f, i) {
      var c = el('div', 'imp-card'); c.dataset.file = i;
      if (f.fatal) {
        c.appendChild(el('div', 'imp-line imp-bad', '✗ 认不出这个文件：' + f.fatal.msg));
        c.appendChild(el('div', 'imp-soft', f.name + '（这个文件不会导入）'));
        if (f.fatal.header) c.appendChild(el('div', 'imp-soft', '读到的表头：' + f.fatal.header.join('，')));
        var cp = btn('复制给开发者', 'imp-btn', function () { copyDev(); }); cp.className += ' imp-copy'; cp.style.marginTop = '8px';
        c.appendChild(cp);
        wrap.appendChild(c); return;
      }
      c.appendChild(el('div', 'imp-line', (APP[f.app] || f.app) + (f.range ? ' · ' + f.range.from.slice(0, 10) + ' 至 ' + f.range.to.slice(0, 10) : '') + ' · 共 ' + f.parsedTotal + ' 笔'));
      c.appendChild(el('div', 'imp-soft', f.name));
      var chk;
      if (f.countOk === true) chk = el('div', 'imp-line imp-ok imp-check', '✓ 笔数和账单统计一致');
      else if (f.countOk === false) chk = el('div', 'imp-line imp-bad imp-check', '✗ 笔数和账单统计对不上：账单写着 ' + f.headerTotal + ' 笔，读出来 ' + f.parsedTotal + ' 笔，可能读漏了，这一份不能直接导入');
      else chk = el('div', 'imp-line imp-soft imp-check', '账单里没写总笔数，没法核对');
      c.appendChild(chk);
      if (f.errors) c.appendChild(el('div', 'imp-soft', '有 ' + f.errors + ' 行读不出来，见下面「出错」'));
      // 差额拆开
      var tg = btn('差额拆开 ▸', 'imp-link'); tg.className += ' imp-diff-toggle';
      var box = el('div', 'imp-diff'); box.style.display = S.view['diff' + i] ? '' : 'none';
      tg.addEventListener('click', function () { S.view['diff' + i] = !S.view['diff' + i]; box.style.display = S.view['diff' + i] ? '' : 'none'; });
      ['expense', 'income', 'neutral'].forEach(function (io) {
        var d = f.diff[io];
        if (!d || (!d.header && !d.sum)) return;
        var parts = d.parts.filter(function (x) { return x.n && x.fen >= 0; }).map(function (x) { return x.label + ' ' + yuan(x.fen); });
        var minus = d.parts.filter(function (x) { return x.n && x.fen < 0; }).map(function (x) { return ' − ' + x.label + ' ' + yuan(-x.fen); }).join('');
        var head = d.header ? d.title + ' ' + yuan(d.header.fen) + '（' + d.header.n + ' 笔）' : d.title + '（账单没写）';
        var tail = '';
        if (d.header) {
          if (d.unreadable && f.errors) { parts.push('读不出来的 ' + yuan(d.unreadable)); tail = ' · 合计差 0.00'; }
          else tail = ' · 合计差 ' + yuan(d.unreadable || 0);
        }
        var line = el('div', 'imp-soft imp-diff-' + io, head + ' = ' + (parts.join(' + ') || '0.00') + minus + tail);
        if (d.header && d.ok === false) line.className += ' imp-bad';
        box.appendChild(line);
        if (d.mergeDelta) box.appendChild(el('div', 'imp-soft', '其中合并的手记比账单' + (d.mergeDelta > 0 ? '多记 ' : '少记 ') + yuan(Math.abs(d.mergeDelta)) + '（金额按手记的算）'));
      });
      c.appendChild(tg); c.appendChild(box);
      wrap.appendChild(c);
    });
    return wrap;
  }

  function renderSummary(p) {
    var c = el('div', 'imp-card'); c.id = 'impSummary';
    var chips = el('div', 'imp-chips');
    ['add', 'merge', 'pending', 'refund', 'neutral', 'skip', 'error', 'excluded'].forEach(function (g) {
      if (!p.counts[g] && (g === 'excluded' || g === 'error' || g === 'refund')) return;
      var ch = el('button', 'imp-chip'); ch.type = 'button'; ch.dataset.group = g;
      ch.appendChild(document.createTextNode(p.groupNames[g] + ' ')); ch.appendChild(el('b', null, String(p.counts[g])));
      ch.addEventListener('click', function () { S.view.details = true; S.view.open[g] = true; S.view.tag = null; render(); var h = document.getElementById('impG-' + g); if (h && h.scrollIntoView) h.scrollIntoView(); });
      chips.appendChild(ch);
    });
    c.appendChild(chips);
    if (p.records !== p.importN) c.appendChild(el('div', 'imp-soft', '导入 ' + p.importN + ' 笔，分分捐、收款这类合并以后，实际新建 ' + p.records + ' 条记录'));
    if (p.blocking.length) c.appendChild(el('div', 'imp-line imp-bad', '有账单笔数对不上，先不能导入'));
    if (S.lost) c.appendChild(el('div', 'imp-soft', '有 ' + S.lost + ' 处改动因为重新计算失效了'));
    var cs = p.sections.comboSkippedDays || [];
    if (cs.length) { var cn = el('div', 'imp-soft', '有 ' + cs.length + ' 天账单太多（一天超过 120 笔），没试「几家不同商家加起来等于一条手记」的配法，只看了同一商家的几笔'); cn.id = 'impComboNote'; c.appendChild(cn); }
    return c;
  }

  // 要你定的几块，哪块没内容就不出现
  function renderDecide(p) {
    var out = [], s = p.sections;
    var catOpts = function () {
      var list = ['未分类'].concat(S.info.cats.filter(function (c) { return c !== '未分类'; }));
      s.newCats.forEach(function (n) { if (n.on && list.indexOf(n.name) < 0) list.push(n.name); });
      return list;
    };
    function select(opts, val, fn, cls) {
      var se = el('select', cls || '');
      opts.forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; se.appendChild(op); });
      se.value = val; se.addEventListener('change', function () { fn(se.value); });
      return se;
    }
    // 1016-M：选过的那几行重算以后就不算「没见过」了，照样留在这里（能改回去）；记在 S.seenTypes / S.seenStatuses
    S.seenTypes = S.seenTypes || {}; S.seenStatuses = S.seenStatuses || {};
    s.unknownTypes.forEach(function (t) { S.seenTypes[t.app + '|' + t.type] = t; });
    s.unknownStatuses.forEach(function (t) { S.seenStatuses[t.app + '|' + t.status] = t; });
    var typeRows = Object.keys(S.seenTypes).filter(function (k) { return S.types[k] || s.unknownTypes.some(function (t) { return t.app + '|' + t.type === k; }); }).map(function (k) { return S.seenTypes[k]; });
    var statusRows = Object.keys(S.seenStatuses).filter(function (k) { return S.statuses[k] || s.unknownStatuses.some(function (t) { return t.app + '|' + t.status === k; }); }).map(function (k) { return S.seenStatuses[k]; });
    if (typeRows.length || statusRows.length) {
      var c = el('div', 'imp-card'); c.id = 'impTypes';
      c.appendChild(el('h4', null, '没见过的交易类型 / 状态'));
      typeRows.forEach(function (t) {
        var r = el('div', 'imp-row-opt'); var k = t.app + '|' + t.type;
        r.appendChild(el('span', 'grow', '「' + t.type + '」（' + APP[t.app] + '）' + t.n + ' 笔，共 ' + yuan(t.fen) + ' 元'));
        r.appendChild(select([['', '照收支导入（放进其他）'], ['normal', '照收支导入'], ['transfer', '当转账（不计入）'], ['skip', '跳过']], S.types[k] || '',
          function (v) { if (v) S.types[k] = v; else delete S.types[k]; rerun(); }, 'imp-type-sel'));
        c.appendChild(r);
      });
      statusRows.forEach(function (t) {
        var r = el('div', 'imp-row-opt'); var k = t.app + '|' + t.status;
        r.appendChild(el('span', 'grow', '状态「' + t.status + '」（' + APP[t.app] + '）' + t.n + ' 笔'));
        r.appendChild(select([['', '导入（放进其他）'], ['import', '导入'], ['skip', '跳过']], S.statuses[k] || '',
          function (v) { if (v) S.statuses[k] = v; else delete S.statuses[k]; rerun(); }, 'imp-status-sel'));
        c.appendChild(r);
      });
      c.appendChild(el('div', 'imp-soft', '选了处理方式的，导入时记成规则，下次直接照办；不选的照收支导入、放进「其他」，下次还会问。'));
      out.push(c);
    }
    if (s.receipt) {
      var rc = el('div', 'imp-card'); rc.id = 'impReceipt';
      rc.appendChild(el('h4', null, '收款按天合并'));
      rc.appendChild(el('div', 'imp-line', '收款 ' + s.receipt.n + ' 笔，共 ' + yuan(s.receipt.fen) + ' 元，看起来是收款账号。按天合成 ' + s.receipt.days + ' 条？'));
      var rr = el('div', 'imp-chips'); rr.style.marginTop = '8px';
      var yes = btn('按天合并', s.receipt.on ? 'imp-btn gold' : 'imp-btn', function () { S.edits.receipt = true; replan(); }); yes.dataset.v = 'on';
      var no = btn('逐条导入', s.receipt.on ? 'imp-btn' : 'imp-btn gold', function () { S.edits.receipt = false; replan(); }); no.dataset.v = 'off';
      rr.appendChild(yes); rr.appendChild(no); rc.appendChild(rr); out.push(rc);
    }
    if (s.petty.length) {
      var pc = el('div', 'imp-card'); pc.id = 'impPetty';
      pc.appendChild(el('h4', null, '疑似零碎扣款'));
      s.petty.forEach(function (x) {
        var r = el('label', 'imp-row-opt'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = x.on;
        cb.addEventListener('change', function () { S.edits.petty[x.key] = cb.checked; replan(); });
        r.appendChild(cb); r.appendChild(el('span', 'grow', x.cp + ' · ' + x.month + ' · ' + x.n + ' 笔 · 共 ' + yuan(x.fen) + ' 元 · 合成一条'));
        pc.appendChild(r);
      });
      out.push(pc);
    }
    if (s.newCats.length) {
      var nc = el('div', 'imp-card'); nc.id = 'impNewCats';
      nc.appendChild(el('h4', null, '新建分类（' + s.newCats.length + '）'));
      s.newCats.forEach(function (x) {
        var r = el('div', 'imp-row-opt'); r.dataset.cat = x.name;
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = x.on;
        cb.addEventListener('change', function () { S.edits.newCats[x.name] = { on: cb.checked, into: cb.checked ? null : (x.into || null), picked: !cb.checked && !!x.picked }; replan(); });
        r.appendChild(cb); r.appendChild(el('span', 'grow', '建「' + x.name + '」 ' + x.count + ' 笔'));
        var opts = [['', '并到已有…']].concat(S.info.cats.map(function (c) { return [c, '并到「' + c + '」']; }));
        r.appendChild(select(opts, x.into || '', function (v) { S.edits.newCats[x.name] = { on: false, into: v || null, picked: !!v }; replan(); }, 'imp-into'));
        nc.appendChild(r);
      });
      out.push(nc);
    }
    if (s.cpGroups.length) {
      var gc = el('div', 'imp-card'); gc.id = 'impCpGroups';
      gc.appendChild(el('h4', null, '还没有分类的，按对方一组选一次（' + s.cpGroups.length + ' 组）'));
      s.cpGroups.forEach(function (g) {
        var r = el('div', 'imp-row-opt'); r.dataset.cp = g.cp;
        var desc = g.cp + ' · ' + g.n + ' 笔 · 共 ' + yuan(g.fen) + ' 元' + (g.n > 1 ? ' · 每笔 ' + yuan(g.min) + '–' + yuan(g.max) + ' 元' : '') + (g.hour !== null ? ' · 多在 ' + g.hour + ' 点左右' : '');
        r.appendChild(el('span', 'grow', desc));
        r.appendChild(select(catOpts().map(function (c) { return [c, c]; }), g.cat || '未分类', function (v) {
          if (v === '未分类') delete S.edits.cpCats[g.cp]; else S.edits.cpCats[g.cp] = v; replan();
        }, 'imp-cp-sel'));
        gc.appendChild(r);
      });
      gc.appendChild(el('div', 'imp-soft', '这一版只改这次的推荐，不记成规则。'));
      out.push(gc);
    }
    // 多笔合一
    if (s.sums.length) {
      var sc = el('div', 'imp-card'); sc.id = 'impSums';
      sc.appendChild(el('h4', null, '几笔加起来正好是一条手记（' + s.sums.length + ' 组）'));
      s.sums.forEach(function (g) {
        var box = el('div', 'imp-row-opt'); box.dataset.sum = g.id; box.style.display = 'block';
        if (g.chosen !== null) {
          box.appendChild(el('div', 'imp-line', g.chosen === 'none' ? '已选「都不是」：这几笔作为新增' : '已合并：' + g.options[g.chosen].text));
          box.appendChild(btn('撤回', 'imp-link imp-sum-undo', function () { delete S.edits.sums[g.id]; replan(); }));
        } else {
          if (g.suggest === null) box.appendChild(el('div', 'imp-soft', '有 ' + g.options.length + ' 种凑法，请你选一种：'));
          g.options.forEach(function (o, i) {
            var r = el('div', 'imp-sub-row');
            r.appendChild(el('span', 'grow', o.text + '：' + o.keys.map(function (k) { var d = rowByKey(k); return d ? fmtTime(d.time) + ' ' + (d.title || '—') + ' ' + yuan(d.fen) : ''; }).join('；')));
            var b = btn(g.suggest === i ? '合并' : '就是这个', g.suggest === i ? 'imp-btn gold' : 'imp-btn', function () { S.edits.sums[g.id] = i; replan(); });
            b.className += ' imp-sum-pick'; b.dataset.i = i; r.appendChild(b); box.appendChild(r);
          });
          var nb = btn('都不是', 'imp-btn imp-sum-none', function () { S.edits.sums[g.id] = 'none'; replan(); }); box.appendChild(nb);
        }
        sc.appendChild(box);
      });
      sc.appendChild(el('div', 'imp-soft', '合并后这几笔的单号都登记到那条手记，手记金额不变；不选就一直留在待你确认里。'));
      out.push(sc);
    }
    // 几笔账单抢同一条手记（按手记归组）；几笔几条互相都可能的，也在这里一笔一笔选
    var pgs = s.pendGroups.filter(function (g) { return g.kind !== 'byBill'; });
    if (pgs.length) {
      var gc2 = el('div', 'imp-card'); gc2.id = 'impPendGroups';
      gc2.appendChild(el('h4', null, '待你确认：几笔可能是同一条手记（' + pgs.length + ' 组）'));
      pgs.forEach(function (g) {
        var box = el('div', 'imp-row-opt'); box.dataset.pg = g.id; box.style.display = 'block';
        box.appendChild(el('div', 'imp-line', g.text + (g.open ? '' : '（已定）')));
        g.keys.forEach(function (k) {
          var d = rowByKey(k); if (!d) return;
          var r = el('div', 'imp-sub-row'); r.dataset.key = k;
          r.appendChild(el('span', 'grow', fmtTime(d.time) + ' · ' + (d.title || '—') + ' · ' + yuan(d.fen) + ' · ' + S.plan.groupNames[d.group]));
          if (g.kind === 'byManual' && d.group === 'pending') {
            var b = btn('选这一笔', 'imp-btn imp-pg-pick', function () { setEdit(k, { pick: { record: g.records[0] } }); }); r.appendChild(b);
          } else if (d.group === 'pending') {
            r.appendChild(btn('选…', 'imp-btn imp-pg-open', function () { openSheet(k); }));
          }
          box.appendChild(r);
        });
        var edited = g.keys.some(function (k) { return S.edits.rows[k] && S.edits.rows[k].pick; });
        if (g.open && !edited) box.appendChild(btn('都不是（都作为新增）', 'imp-btn imp-pg-none', function () { g.keys.forEach(function (k) { var e = S.edits.rows[k] || (S.edits.rows[k] = {}); e.pick = 'new'; }); replan(); }));
        if (edited) box.appendChild(btn('重新选', 'imp-link imp-pg-undo', function () { g.keys.forEach(function (k) { if (S.edits.rows[k]) { delete S.edits.rows[k].pick; if (!Object.keys(S.edits.rows[k]).length) delete S.edits.rows[k]; } }); replan(); }));
        gc2.appendChild(box);
      });
      gc2.appendChild(el('div', 'imp-soft', '选了一笔就和手记合并，同组其余的自动作为新增；不选就一直待处理。'));
      out.push(gc2);
    }
    // 转账往来
    if (s.transfers.length) {
      var tc = el('div', 'imp-card'); tc.id = 'impTransfers';
      tc.appendChild(el('h4', null, '转账往来（' + s.transfers.length + ' 段）'));
      var md = function (t) { return (+t.slice(5, 7)) + ' 月 ' + (+t.slice(8, 10)) + ' 日'; };
      var sign = function (f) { return (f > 0 ? '+' : f < 0 ? '−' : '') + yuan(Math.abs(f)); };
      s.transfers.forEach(function (t) {
        var box = el('div', 'imp-row-opt'); box.dataset.tr = t.id; box.style.display = 'block';
        box.appendChild(el('div', 'imp-line', md(t.from) + (t.to !== t.from ? ' 到 ' + md(t.to) : '') + ' · ' + t.n + ' 笔 · 转出 ' + yuan(t.out) + ' · 转入 ' + yuan(t.in) + ' · 净额 ' + sign(t.net)));
        t.people.forEach(function (x) { box.appendChild(el('div', 'imp-soft', '　' + x.cp + '：转出 ' + yuan(x.out) + '，转入 ' + yuan(x.in) + '，净额 ' + sign(x.net))); });
        t.keys.forEach(function (k) {
          var d = rowByKey(k); if (!d) return;
          var r = el('label', 'imp-sub-row'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = d.mode === 'skip'; cb.className = 'imp-tr-cb'; cb.dataset.key = k;
          cb.style.position = 'absolute'; cb.style.opacity = '0'; cb.style.width = '1px'; cb.style.height = '1px';   // 1016-H：用右边的开关代替，点整行都能切换
          cb.addEventListener('change', function () { var e = S.edits.rows[k] || (S.edits.rows[k] = {}); if (cb.checked) e.mode = 'skip'; else e.mode = 'normal'; replan(); });
          r.appendChild(cb); r.appendChild(el('span', 'grow', fmtTime(d.time) + ' · ' + (d.cp || '—') + ' · ' + (d.type === 'expense' ? '转出 ' : '转入 ') + yuan(d.fen)));
          var sw = el('span', 'imp-switch imp-tr-state' + (cb.checked ? ' on' : ''));
          sw.appendChild(el('i')); sw.appendChild(document.createTextNode(cb.checked ? '不计入' : '计入'));
          r.style.cursor = 'pointer'; r.appendChild(sw);
          box.appendChild(r);
        });
        var all = btn(t.allSkip ? '都恢复计入' : '这几笔都标成不计入', t.allSkip ? 'imp-btn' : 'imp-btn gold', function () {
          t.keys.forEach(function (k) { var e = S.edits.rows[k] || (S.edits.rows[k] = {}); e.mode = t.allSkip ? 'normal' : 'skip'; });
          replan();
        });
        all.className += ' imp-tr-all'; box.appendChild(all);
        tc.appendChild(box);
      });
      tc.appendChild(el('div', 'imp-soft', '只收微信转账、微信红包、支付宝转账红包，相邻两笔隔不到 3 天的串成一段。随礼、还钱这类来回抵掉的，可以标成不计入。'));
      out.push(tc);
    }
    // 全额退款的弱提醒（不算待处理，不用选）
    if (s.refundHints.length) {
      var hc = el('div', 'imp-card'); hc.id = 'impRefundHints';
      hc.appendChild(el('h4', null, '待你确认 · 看一眼就行（不用选）'));
      s.refundHints.forEach(function (h) { var l = el('div', 'imp-line imp-hint', '· ' + h.text); l.dataset.key = h.key; hc.appendChild(l); });
      out.push(hc);
    }
    var nt = s.notes, items = [];
    if (nt.neutralVsNormal.length) items.push(['neutralVsNormal', nt.neutralVsNormal.length + ' 笔「不计入」的账单和同金额的普通手记撞上了，没合并，请看一眼是不是记重了']);
    if (nt.joined.length) items.push(['joined', nt.joined.length + ' 笔是被换行拆开、拼回来的']);
    if (nt.noNote.length) items.push(['noNote', nt.noNote.length + ' 笔单号带了附加信息，已按开头部分去重（附加信息挪进了备注）']);
    if (nt.overlap.length) items.push(['overlap', nt.overlap.length + ' 笔新增落在以前导入过的时间段里，可能是你删过的']);
    if (items.length) {
      var ncard = el('div', 'imp-card'); ncard.id = 'impNotes';
      ncard.appendChild(el('h4', null, '提个醒'));
      items.forEach(function (x) {
        var l = btn('· ' + x[1], 'imp-link'); l.dataset.tag = x[0]; l.style.display = 'block'; l.style.textAlign = 'left'; l.style.marginBottom = '4px';
        l.addEventListener('click', function () { S.view.details = true; S.view.tag = x[0]; render(); var d = document.getElementById('impDetails'); if (d && d.scrollIntoView) d.scrollIntoView(); });
        ncard.appendChild(l);
      });
      out.push(ncard);
    }
    return out;
  }

  function renderStorage(p) {
    var c = el('div', 'imp-card'); c.id = 'impStorage';
    var e = null;
    try { e = store().estimate({ records: p.records, orders: p.orders, names: 0 }); } catch (_) {}
    var mb = e ? (e.bytes / 1048576) : 0;
    c.appendChild(el('div', 'imp-line', '存储：预计多占约 ' + (mb < 0.1 ? '不到 0.1' : mb.toFixed(1)) + ' MB'));
    if (navigator.storage && navigator.storage.estimate) {
      var sp = el('div', 'imp-soft'); c.appendChild(sp);
      navigator.storage.estimate().then(function (q) { if (q && q.quota) sp.textContent = '本应用可用上限约 ' + (q.quota / 1073741824).toFixed(1) + ' GB（是系统给记问的上限，不是手机剩余空间）'; }).catch(function () {});
    }
    return c;
  }

  // ---------- 全部明细 ----------
  var TAGNAME = { joined: '拼回', noNote: '单号带附加信息', overlap: '以前导入过这段', otherType: '新类型', otherStatus: '新状态', neutralVsNormal: '撞上普通手记' };
  var MODENAME = { normal: '计入', flow: '只算结余', skip: '不计入' };
  function renderDetails(p) {
    var wrap = el('div'); wrap.id = 'impDetails';
    var tg = btn(S.view.details ? '收起全部明细' : '查看全部明细', 'imp-btn', function () { S.view.details = !S.view.details; render(); });
    tg.id = 'impDetailsToggle'; tg.style.width = '100%'; tg.style.marginBottom = '8px';
    wrap.appendChild(tg);
    if (!S.view.details) return wrap;
    if (S.view.tag) {
      var f = el('div', 'imp-soft');
      f.appendChild(document.createTextNode('只看「' + TAGNAME[S.view.tag] + '」的 '));
      var clr = btn('看全部', 'imp-link', function () { S.view.tag = null; render(); }); f.appendChild(clr);
      wrap.appendChild(f);
    }
    Plan.GROUPS.forEach(function (g) {
      var list = p.groups[g].filter(function (d) { return !S.view.tag || d.tags.indexOf(S.view.tag) >= 0; });
      if (!list.length) return;
      var n = list.reduce(function (s, d) { return s + d.units; }, 0), sum = list.reduce(function (s, d) { return s + (d.fen || 0); }, 0);
      var h = el('div', 'imp-gh'); h.id = 'impG-' + g; h.dataset.group = g;
      h.appendChild(el('span', null, p.groupNames[g] + ' ' + n + ' 笔'));
      h.appendChild(el('span', 'imp-soft', '共 ' + yuan(sum) + ' 元 ' + (S.view.open[g] ? '▾' : '▸')));
      h.addEventListener('click', function () { S.view.open[g] = !S.view.open[g]; render(); });
      wrap.appendChild(h);
      if (!S.view.open[g]) return;
      var box = el('div', 'imp-list'); box.dataset.group = g;
      var shown = S.view.shown[g] || PAGE;
      list.slice(0, shown).forEach(function (d) { renderRow(box, d); });
      wrap.appendChild(box);
      if (list.length > shown) {
        var more = btn('再显示 ' + Math.min(PAGE, list.length - shown) + ' 行（还有 ' + (list.length - shown) + ' 行）', 'imp-btn', function () { S.view.shown[g] = shown + PAGE; render(); });
        more.className += ' imp-more'; more.dataset.group = g; more.style.width = '100%';
        wrap.appendChild(more);
      }
    });
    return wrap;
  }
  function renderRow(box, d) {
    if (d.summary) { renderSumRow(box, d); return; }
    var row = el('div', 'al-row'); row.dataset.key = d.key || '';
    var open = function () { if (d.src === 'row') openSheet(d.key); };
    if (d.src !== 'row') {
      row.appendChild(el('span', 'al-time', d.line ? '第 ' + d.line + ' 行' : ''));
      row.appendChild(el('span', 'al-remark', d.src === 'error' ? (d.raw || []).filter(Boolean).slice(0, 2).join(' · ') || '—' : '重复的一行'));
      if (d.fen !== null) row.appendChild(el('span', 'al-amt', yuan(d.fen)));
    } else {
      row.appendChild(el('span', 'al-time', fmtTime(d.time)));
      // 1016-G：不计入的不显示分类，金额不带正负号
      var skipRow = d.group === 'neutral' || d.mode === 'skip';
      var c = el('span', 'al-cat'); if (!skipRow) c.appendChild(el('span', 'cat-tag', d.cat || '未分类')); row.appendChild(c);
      row.appendChild(el('span', 'al-remark', d.title || d.cp || '—'));
      var isExp = d.type === 'expense';
      row.appendChild(el('span', 'al-amt ' + (skipRow ? 'imp-skip-amt' : (isExp ? 'neg' : 'pos')), (skipRow ? '' : (isExp ? '−' : '+')) + yuan(d.fen)));
      row.appendChild(el('span', 'al-go', '›'));
    }
    row.addEventListener('click', open);
    box.appendChild(row);
    var why = el('div', 'imp-why');
    var bits = [];
    if (d.reason) bits.push(d.reason);
    if (d.src === 'row' && (d.group === 'add' || d.group === 'neutral') && d.mode !== 'normal') bits.push('口径：' + MODENAME[d.mode]);
    why.textContent = bits.join(' · ');
    d.tags.forEach(function (t) { if (TAGNAME[t]) why.appendChild(el('span', 'imp-tag', TAGNAME[t])); });
    why.addEventListener('click', open);
    box.appendChild(why);
  }

  // 合并记录：一行，点开看每一笔
  function renderSumRow(box, g) {
    var row = el('div', 'al-row imp-sum-row'); row.dataset.sum = g.id;
    row.appendChild(el('span', 'al-time', ''));
    var c = el('span', 'al-cat'); c.appendChild(el('span', 'cat-tag', g.cat || '未分类')); row.appendChild(c);
    row.appendChild(el('span', 'al-remark', g.title));
    row.appendChild(el('span', 'al-go', S.view.sumOpen[g.id] ? '▾' : '▸'));
    var toggle = function () { S.view.sumOpen[g.id] = !S.view.sumOpen[g.id]; render(); };
    row.addEventListener('click', toggle);
    box.appendChild(row);
    var why = el('div', 'imp-why', (g.appendTo ? '并进这个月已有的那条记录' : '合成一条记录') + (g.kind === 'petty' ? ' · 分类默认「' + (g.cat || '其他') + '」' : ''));
    why.addEventListener('click', toggle);
    box.appendChild(why);
    if (!S.view.sumOpen[g.id]) return;
    var mb = el('div', 'imp-members'); mb.dataset.sum = g.id;
    g.members.forEach(function (d) {
      var r = el('div', 'imp-sub-row'); r.dataset.key = d.key;
      r.appendChild(el('span', 'grow', fmtTime(d.time) + ' · ' + (d.title || '—')));
      r.appendChild(el('span', null, (d.type === 'expense' ? '−' : '+') + yuan(d.fen)));
      r.addEventListener('click', function () { openSheet(d.key); });
      mb.appendChild(r);
    });
    box.appendChild(mb);
  }

  // ---------- 一行的详情：在这里改 ----------
  function rowByKey(key) { var r = null; S.plan.rows.forEach(function (d) { if (d.key === key) r = d; }); return r; }
  function setEdit(key, patch) {
    var e = S.edits.rows[key] || {};
    Object.keys(patch).forEach(function (k) { if (patch[k] === null || patch[k] === undefined) delete e[k]; else e[k] = patch[k]; });
    if (Object.keys(e).length) S.edits.rows[key] = e; else delete S.edits.rows[key];
    replan();
    if (dom.sheetMask.style.display === 'flex') openSheet(key);
  }
  function openSheet(key) {
    var d = rowByKey(key); if (!d) return;
    var sh = dom.sheet; sh.innerHTML = '';
    sh.dataset.key = key;
    var skipRow = d.group === 'neutral' || d.mode === 'skip';
    sh.appendChild(el('h4', null, (skipRow ? '' : (d.type === 'expense' ? '−' : '+')) + yuan(d.fen) + ' · ' + (S.plan.groupNames[d.group])));
    var kv = function (k, v) { if (!v) return; var r = el('div', 'kv'); r.appendChild(el('span', null, k)); r.appendChild(el('span', null, v)); sh.appendChild(r); };
    kv('时间', d.time.replace('T', ' ')); kv('交易对方', d.cp); kv('商品', d.desc); kv('备注', d.remark);
    kv('支付方式', (S.parsed.files[d.file].rows[d.row] || {}).pm); kv(d.app === 'alipay' ? '交易分类' : '交易类型', d.kind); kv('状态', d.status);
    kv('来源', APP[d.app]); kv('去向', d.reason);
    if (d.rec && !skipRow) kv('分类推荐', d.rec.cat + '（' + d.rec.reason + (d.rec.conf ? '，把握' + { high: '高', mid: '中', low: '低' }[d.rec.conf] : '') + '）');
    if (d.into && S.manualById[d.into]) { var m = S.manualById[d.into]; kv('合并到', '手记 ' + fmtTime(m.time) + ' · ' + m.cat + ' · ' + yuan(m.fen)); }
    var acts = el('div', 'acts');
    if (d.canCat && !skipRow) {
      var se = el('select', 'imp-row-cat');
      var list = ['未分类'].concat(S.info.cats.filter(function (c) { return c !== '未分类'; }));
      S.plan.sections.newCats.forEach(function (n) { if (n.on && list.indexOf(n.name) < 0) list.push(n.name); });
      if (d.cat && list.indexOf(d.cat) < 0) list.push(d.cat);
      list.forEach(function (c) { var o = el('option', null, c); o.value = c; se.appendChild(o); });
      se.value = d.cat || '未分类';
      se.addEventListener('change', function () { setEdit(key, { cat: se.value }); });
      var l = el('label', 'imp-line', '分类 '); l.appendChild(se); acts.appendChild(l);
    }
    if (d.canMode) {
      ['normal', 'flow', 'skip'].forEach(function (m) {
        var b = btn(MODENAME[m], d.mode === m ? 'imp-btn gold' : 'imp-btn', function () { setEdit(key, { mode: m }); });
        b.className += ' imp-mode'; b.dataset.mode = m; acts.appendChild(b);
      });
    }
    if (d.canExclude) { var x = btn('勾掉（不导入）', 'imp-btn', function () { setEdit(key, { exclude: true }); }); x.id = 'impExclude'; acts.appendChild(x); }
    if (d.canRestore) { var rs = btn('恢复', 'imp-btn', function () { setEdit(key, { exclude: null, pick: null }); }); rs.id = 'impRestore'; acts.appendChild(rs); }
    if (d.canSplit) { var sp = btn('拆开（改为新增）', 'imp-btn', function () { setEdit(key, { split: true }); }); sp.id = 'impSplit'; acts.appendChild(sp); }
    if (d.bucket0 === 'merge' && !d.canSplit) { var un = btn('不拆了（照旧合并）', 'imp-btn', function () { setEdit(key, { split: null }); }); un.id = 'impUnsplit'; acts.appendChild(un); }
    sh.appendChild(acts);
    if (d.canPick && d.item.msum) {
      sh.appendChild(el('div', 'imp-soft', d.reason + '。在上面「几笔加起来正好是一条手记」里确认；这一笔也可以单独作为新增 / 不要了：'));
    } else if (d.canPick) {
      sh.appendChild(el('div', 'imp-soft', '可能是这几条（选一条，或者作为新增 / 不要了）：'));
      var used = {};
      S.plan.rows.forEach(function (r) { if (r.group === 'merge' && r.key !== key) used[r.into] = true; });
      var allC = d.cands || [], moreOpen = !!S.view.moreCands[key];
      allC.forEach(function (c, i) {
        if (i === 1 && allC.length > 1) {
          var mt = btn(moreOpen ? '收起其他 ' + (allC.length - 1) + ' 条' : '其他 ' + (allC.length - 1) + ' 条 ▸', 'imp-link imp-more-cands', function () { S.view.moreCands[key] = !moreOpen; openSheet(key); });
          sh.appendChild(mt);
        }
        if (i > 0 && !moreOpen) return;
        var r = el('div', 'imp-row-opt'); r.dataset.i = i;
        var label, pick;
        if (c.record) {
          var m = S.manualById[c.record];
          label = m ? fmtTime(m.time) + ' · ' + (m.cat || '') + ' · ' + yuan(m.fen) + (m.cp ? ' · ' + m.cp : '') : '账本里的一条记录';
          pick = { record: c.record };
        } else {
          var o = S.parsed.files[c.row.file].rows[c.row.row];
          label = '这一批里的 ' + fmtTime(o.time) + ' · ' + (o.cp || '') + ' · ' + yuan(o.fen);
          pick = { row: c.row };
        }
        var lb = el('span', 'grow');
        if (i === 0 && allC.length > 1) lb.appendChild(el('span', 'imp-best', '最像'));
        lb.appendChild(document.createTextNode(label));
        r.appendChild(lb);
        var chosen = d.item && S.edits.rows[key] && S.edits.rows[key].pick && JSON.stringify(S.edits.rows[key].pick) === JSON.stringify(pick);
        // 退款类的候选是「挂到这笔原单」，其余是「和这条手记合并」
        var isRefund = d.why === 'refundcands' || !!c.row;
        var b = btn(chosen ? '已选' : (isRefund ? '挂到这笔' : '和这条合并'), chosen ? 'imp-btn gold' : 'imp-btn', function () { setEdit(key, { pick: pick }); });
        b.className += ' imp-pick';
        if (!isRefund && used[c.record] && !chosen) b.disabled = true;      // 这条手记已经和别的账单合并了
        r.appendChild(b); sh.appendChild(r);
      });
    }
    if (d.canPick) {
      var a2 = el('div', 'acts');
      var nb = btn('作为新增', 'imp-btn', function () { setEdit(key, { pick: 'new' }); }); nb.id = 'impPickNew';
      var db = btn('不要了', 'imp-btn', function () { setEdit(key, { pick: 'drop' }); }); db.id = 'impPickDrop';
      var cb = btn('还是待确认', 'imp-btn', function () { setEdit(key, { pick: null }); }); cb.id = 'impPickClear';
      a2.appendChild(nb); a2.appendChild(db); a2.appendChild(cb); sh.appendChild(a2);
    }
    // 1016-G：为什么没配上（开发用：试过哪几条手记、每条卡在哪）
    if (d.item && d.item.trace && d.group !== 'merge') {
      var tb = el('div', 'imp-trace'); tb.id = 'impTrace'; tb.style.marginTop = '10px';
      tb.appendChild(el('div', 'imp-line', '为什么没配上（开发用）'));
      if (!d.item.trace.length) tb.appendChild(el('div', 'imp-soft', '当天没有金额相符的手记（前后 7 天、金额在三分之一到三倍之间的都没有）'));
      d.item.trace.forEach(function (x) {
        tb.appendChild(el('div', 'imp-soft imp-trace-row', fmtTime(x.time) + ' · ' + (x.cat || '未分类') + ' · ' + yuan(x.fen) + '：' + x.why));
      });
      sh.appendChild(tb);
    }
    var cl = btn('关闭', 'imp-btn', closeSheet); cl.id = 'impSheetClose'; cl.style.marginTop = '12px'; cl.style.width = '100%';
    sh.appendChild(cl);
    dom.sheetMask.style.display = 'flex';
  }
  function closeSheet() { if (dom) dom.sheetMask.style.display = 'none'; }

  // ---------- 底部按钮、复制 ----------
  var BUCKET_LINE = [['add', '新增'], ['merge', '和手记合并'], ['neutral', '不计入'], ['refund', '退款'], ['pending', '待处理'],
                     ['skip', '跳过'], ['error', '出错'], ['excluded', '你勾掉的']];
  function onImport() {
    if (!S || !S.plan || !S.plan.canImport || S.phase !== 'confirm') return;
    var p = S.plan, my = runId;
    var batch = 'b' + Date.now().toString(36);
    var now = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var at = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var ws;
    try {
      ws = window.JiwenImportWrite.build({ parsed: S.parsed, matched: S.matched, info: S.info, manualById: S.manualById }, p,
                                         { batch: batch, at: at, cpCats: S.edits.cpCats, types: S.types, statuses: S.statuses });
    } catch (e) { alertMsg('整理要写的内容时出错了，什么都没写：' + (e && e.message || e)); return; }
    S.phase = 'writing';
    var t0 = Date.now(), slowTimer = null;
    progress('准备写入…', 0, 1);
    var onProgress = function (stage, done, total) {
      if (my !== runId) return;
      if (stage === 'backup') {
        // 备份超过 2 秒才把这一段显示出来
        slowTimer = setTimeout(function () { progress('备份导入前的账本…（大账本要多等一会儿）', 0, 1); }, 2000);
      } else if (stage === 'build') { if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; } progress('整理记录…', done, total); }
      else if (stage === 'write') { if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; } progress('写入账本…', 1, 2); }
    };
    store().commit(ws, { ver: S.info.ver, onProgress: onProgress }).then(function (r) {
      if (slowTimer) clearTimeout(slowTimer);
      if (my !== runId || !S) return;
      dom.prog.style.display = 'none';
      S.phase = 'done'; S.result = { ws: ws, r: r, ms: Date.now() - t0 };
      renderResult();
    }, function (e) {
      if (slowTimer) clearTimeout(slowTimer);
      if (my !== runId || !S) return;
      dom.prog.style.display = 'none';
      S.phase = 'confirm';
      var code = e && (e.code || e.message);
      if (code === 'stale') { alertMsg('账本在这期间有改动，方案已经不是最新的，重新算一遍。什么都没写。'); rerun(); return; }
      if (code === 'nospace') { alertMsg('手机剩余空间放不下导入前的备份（大约要 ' + Math.ceil(e.need / 1048576) + ' MB，剩 ' + Math.floor(e.free / 1048576) + ' MB），这次没有导入，账本没动。'); return; }
      if (code === 'quota') { alertMsg('存储空间满了，没写进去，账本没动。'); return; }
      alertMsg('写入失败，账本没动：' + (code || e));
    });
  }
  // ---------- 结果页 ----------
  function renderResult() {
    var b = dom.body, res = S.result, c = res.ws.counts; b.innerHTML = '';
    dom.title.textContent = '导入完成';
    dom.bar.style.display = 'none';
    var card = el('div', 'imp-card'); card.id = 'impResult';
    card.appendChild(el('h4', null, '已写进账本'));
    var sum = 0;
    BUCKET_LINE.forEach(function (x) {
      var n = c[x[0]] || 0; sum += n;
      if (!n && ['error', 'excluded', 'refund'].indexOf(x[0]) >= 0) return;
      var l = el('div', 'imp-line imp-res-' + x[0], x[1] + ' ' + n + ' 笔'); l.dataset.group = x[0]; card.appendChild(l);
    });
    card.appendChild(el('div', 'imp-line imp-res-total', '合计 ' + sum + ' 笔，文件里共 ' + res.ws.total + ' 笔' + (sum === res.ws.total ? '' : '（对不上，请截图发给开发者）')));
    if (res.r.added !== undefined) card.appendChild(el('div', 'imp-soft', '新建 ' + res.r.added + ' 条记录，改了 ' + res.r.changed + ' 条以前的记录（合并的手记、追加的合并记录）'));
    if (c.pending) card.appendChild(el('div', 'imp-soft', '待处理的 ' + c.pending + ' 笔没进账本，存在待处理里，以后处理。'));
    card.appendChild(el('div', 'imp-soft imp-res-batch', '批次号 ' + res.ws.batch + ' · 写入用时 ' + (res.ms / 1000).toFixed(1) + ' 秒'));
    card.appendChild(el('div', 'imp-soft', '写之前自动备份了一份。导错了可以点下面「撤销这次导入」，以后也能在「设置 → 导入记录」里撤销。'));
    var go = btn('回到账本', 'imp-btn gold', function () {
      close();
      var tb = document.querySelector('.tab-btn[data-tab="ledger"]'); if (tb) tb.click();
    });
    go.id = 'impBackToLedger'; go.style.marginTop = '12px'; go.style.width = '100%';
    card.appendChild(go);
    var un = btn('撤销这次导入', 'imp-btn', function () { undoBatch(res.ws.batch); });
    un.id = 'impUndoThis'; un.style.marginTop = '8px'; un.style.width = '100%';
    card.appendChild(un);
    b.appendChild(card);
    dom.page.scrollTop = 0;
  }

  // ---------- 1016-L：导入记录、撤销（⑦b）----------
  // 「设置 → 导入记录」：最近 10 次（新的在上），每次右侧「撤销」。notice：顶上的一行提示（撤销成功后「已撤销，删了 x 条、还原了 y 条」）
  function appNames(apps) { return (apps || []).map(function (x) { return APP[x] || x; }).join(' + ') || '账单'; }
  function openLogs(notice) {
    build();
    var my = ++runId;
    S = { phase: 'logs', view: {} };
    try { dom.archive.textContent = '存档「' + store().archiveInfo().name + '」'; } catch (_) { dom.archive.textContent = ''; }
    dom.title.textContent = '导入记录';
    dom.page.style.display = 'block'; dom.bar.style.display = 'none';
    dom.prog.style.display = 'none'; dom.sheetMask.style.display = 'none';
    dom.body.innerHTML = '';
    if (notice) { var nt = el('div', 'imp-card imp-line imp-ok', notice); nt.id = 'impUndoNotice'; dom.body.appendChild(nt); }
    var loading = el('div', 'imp-soft', '正在读导入记录…'); dom.body.appendChild(loading);
    return store().importsRead().then(function (logs) {
      if (my !== runId || !S) return;
      loading.remove();
      renderLogs(logs.slice().reverse());
    }, function (e) {
      if (my !== runId || !S) return;
      loading.textContent = '读不出导入记录：' + (e && (e.code || e.message) || e);
    });
  }
  function renderLogs(logs) {
    var c = el('div', 'imp-card'); c.id = 'impLogs';
    c.appendChild(el('h4', null, '最近的导入（只保留 10 次）'));
    if (!logs.length) c.appendChild(el('div', 'imp-soft', '这个存档还没有导入记录。'));
    logs.forEach(function (l) {
      var r = el('div', 'imp-row-opt imp-log'); r.dataset.batch = l.b;
      var g = el('div', 'grow');
      g.appendChild(el('div', 'imp-line', String(l.at || '').replace('T', ' ') + ' · ' + appNames(l.apps)));
      var nAdd = (l.add || []).length, nChg = (l.chg || []).length;
      g.appendChild(el('div', 'imp-soft', '账单 ' + String(l.from || '').slice(0, 10) + ' 至 ' + String(l.to || '').slice(0, 10)
        + ' · 新建 ' + nAdd + ' 条' + (nChg ? ' · 改了 ' + nChg + ' 条以前的记录' : '')));
      r.appendChild(g);
      var u = btn('撤销', 'imp-btn imp-log-undo', function () { undoBatch(l.b); });
      r.appendChild(u);
      c.appendChild(r);
    });
    dom.body.appendChild(c);
  }
  // 撤销一批：算方案 → 确认框（⑦a 的摘要）→ 先备份「撤销前」再一个事务写 → 停在导入记录，顶上提示
  function undoBatch(b) {
    if (!S || S.phase === 'writing' || S.phase === 'undoing') return;
    var back0 = S.phase;
    var fail = function (e, what) {
      var c = e && (e.code || e.message);
      if (S) S.phase = back0;
      dom.prog.style.display = 'none';
      alertMsg(c === 'stale' ? '账本在这期间变了，没有撤销。请再点一次「撤销」重新算。'
        : c === 'quota' || c === 'nospace' ? '存储空间不够，放不下撤销前的备份，没有撤销，账本没动。'
        : what + '，账本没动：' + (c || e), '撤销导入');
    };
    store().undoPlan(b).then(function (p) {
      if (!S) return;
      if (!p || !p.ok) { alertMsg('找不到这次导入的记录（只保留最近 10 次），没法撤销。', '撤销导入'); return; }
      var msg = window.JiwenImportUndo.describe(p) + '\n\n撤销前会自动备份一份。确定撤销吗？';
      window.customConfirm(msg, function () {
        if (!S) return;
        S.phase = 'undoing';
        progress('撤销中…', 1, 2);
        store().undo(p).then(function (r) {
          dom.prog.style.display = 'none';
          if (S) S.phase = back0;
          var t = r.totals || {};
          var del = (t.deleted || 0) + (t.userRefunds || 0), rest = (t.restored || 0) + (t.sums || 0) + (t.links || 0);
          openLogs('已撤销' + (r.chain.length > 1 ? ' ' + r.chain.length + ' 次导入' : '') + '，删了 ' + del + ' 条、还原了 ' + rest + ' 条');
        }, function (e) { fail(e, '撤销失败'); });
      }, '撤销导入', { okText: '撤销' });
    }, function (e) { fail(e, '算撤销方案时出错'); });
  }
  function copyDev() {
    var text = Plan.devText(S.plan);
    UI._lastCopy = text;
    var done = function () { alertMsg('已复制。发给开发者时只有表头、交易类型和状态，没有金额、对方和单号。', '复制给开发者'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); }); return; }
    } catch (_) {}
    fallbackCopy(text); done();
  }
  function fallbackCopy(text) {
    try { var ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand && document.execCommand('copy'); ta.remove(); } catch (_) {}
  }

  var UI = { open: open, openLogs: openLogs, close: close, canBack: canBack, back: back, isOpen: isOpen,
             _state: function () { return S; }, _replan: function () { replan(); }, _lastCopy: null };
  window.JiwenImportUI = UI;
})();
