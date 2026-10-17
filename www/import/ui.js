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
// 第三期（1016-Z8）：选的文件是账单压缩包时在 App 里解开（unzip.js；有密码问一句，密码不对再问，取消就不导它）。
// 第二期（1016-Z5）：openRules() 是「设置 → 管理导入规则」（分类规则、分类对照、类型规则：看、改、删、加分类规则）。
// 1016-Z4（1.1）：汇总里写零钱提现的服务费单独记成支出。
// 1016-Z3（1.1）：openWith(文件) 是「用记问打开」（安卓文件关联）进来的，直接拿这个文件算方案。
// 1016-Z2（1.1）：收入行详情里「当作退款，挂到某一笔」（这一批的支出或账本里的支出，JiwenImportStore.refundTargets 查），没见过的交易类型多一个「当退款挂到原单」。
// 1016-Z1（1.1）：按对方归组那张卡每组带一句规律说明「某某 · 5 笔 · 共 53 元 · 工作日中午 12 点左右 · 每笔 12–14 元 → 选个分类」。
// 1016-Z（1.1）：确认页「金额要你看一眼」：比这个分类平时高很多的、单笔特别大的列出来，点开改（参考值在 plan.js 的 AMOUNT，待真实数据调）。
// 1016-Y（1.1）：按你的规则归的那笔在详情里改分类时问「只改这一条 / 以后都改」；按对方选的分类、从合并里学到满 2 次的都存成规则，结果页写学到几条。
// 1016-X（1.1）：金额相近、分类对得上的自动合并，确认页一张卡（可一键改成实付），结果页写「N 笔手记比实付多 x 元，多半是立减」。
// 1016-U：文件卡上写「上次微信导到 YYYY-MM-DD，这之后的才是新的」（按导入记录算，每个来源各算各的）。
// 1016-T：结果页「接下来可以」：去看统计、按过去几个月设预算（现在先到预算页）、补一笔期初余额（主页面的 JiwenImportNext）。
// 1016-S：选文件页有「微信怎么导出」「支付宝怎么导出」两页文字教程（截图位置先占位），返回键回到选文件。
// 1016-Q：确认页写「这段时间漏记了 N 笔，共 x 元」；底部「只对账」进勾选清单，「补进 K 笔」只写勾选的（write.js 的 onlyKeys）。
// 1016-O：再导入时原来待处理的用新文件重新判断，有了结论的确认页提示「原来待处理的 N 笔有结论了」。
// 1016-N：openPending() 是待处理页（合并 / 挂退款 / 作为新增 / 不要了 / 全部不要了、候选失效提示），入口在结果页和导入记录页。
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
    // 1016-UI2：页面主按钮都在底部操作栏（#impBar，用主程序的共用样式 .ui-bar / .ui-btn）；能点的至少 48px 高、相邻至少 8px
    '#impPage{position:fixed;left:0;top:0;right:0;bottom:0;z-index:990;background:var(--c-bg);overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 calc(var(--imp-bar,0px) + 16px);display:none;color:var(--c-text);}',
    '#impPage .imp-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:4px;min-height:52px;padding:2px 14px 2px 4px;background:var(--c-bg);border-bottom:1px solid var(--c-border);}',
    '#impPage .imp-back{background:none;border:none;color:var(--c-primary-deep);font-size:16px;min-height:48px;min-width:64px;padding:0 10px;cursor:pointer;text-align:left;font-family:inherit;}',
    '#impPage .imp-title{flex:1;font-weight:bold;font-size:16px;color:var(--c-primary-deep);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#impPage .imp-sub{font-size:12px;color:var(--c-text-soft);max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#impBody{padding:12px 14px;display:flex;flex-direction:column;min-height:calc(100% - 53px - var(--imp-bar,0px) - 16px);}',
    '#impBody > *{flex:0 0 auto;}',
    '#impBody .imp-push{margin-top:auto;}',
    '.imp-card{background:linear-gradient(135deg,var(--c-card-1),var(--c-card-2));border:1px solid var(--c-border);border-radius:12px;padding:12px;margin-bottom:12px;}',
    '.imp-card h4{font-size:15px;margin-bottom:8px;color:var(--c-primary-deep);}',
    '.imp-line{font-size:14px;line-height:1.7;overflow-wrap:anywhere;}',
    '.imp-soft{font-size:12.5px;color:var(--c-text-soft);line-height:1.6;overflow-wrap:anywhere;}',
    '.imp-ok{color:var(--c-pos);}.imp-bad{color:var(--c-neg);font-weight:bold;}',
    '.imp-toast{position:fixed;left:16px;right:16px;bottom:calc(var(--imp-bar,80px) + 12px);z-index:40;display:none;align-items:center;min-height:48px;padding:8px 14px;border-radius:12px;background:var(--c-primary-deep);color:#fff;font-size:14px;box-shadow:0 6px 18px rgba(0,0,0,.18);}',
    '.imp-also{color:#b4660e;font-size:12px;margin-top:2px;}.imp-far-box{margin-top:6px;}',
    '.imp-chips{display:flex;flex-wrap:wrap;gap:8px;}',
    '.imp-chip{display:inline-flex;align-items:center;gap:4px;min-height:48px;border:1px solid var(--c-border-mid);background:var(--c-surface);color:var(--c-text);border-radius:24px;padding:4px 14px;font-size:14px;cursor:pointer;font-family:inherit;}',
    '.imp-chip b{color:var(--c-primary-deep);}',
    '.imp-btn{min-height:48px;border:1px solid var(--c-border-mid);background:var(--c-surface);color:var(--c-text);border-radius:10px;padding:8px 14px;font-size:14px;line-height:1.3;cursor:pointer;font-family:inherit;}',
    '.imp-btn.gold{background:linear-gradient(135deg,var(--c-primary-mid),var(--c-primary-dark));color:var(--c-on-primary);border-color:transparent;font-weight:bold;}',
    '.imp-btn[disabled]{opacity:.45;cursor:not-allowed;}',
    '.imp-row-opt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px dashed var(--c-border);font-size:14px;}',
    '.imp-row-opt:last-child{border-bottom:none;}',
    '.imp-row-opt .grow{flex:1 1 160px;min-width:0;overflow-wrap:anywhere;line-height:1.6;}',
    'label.imp-row-opt,.imp-row-opt.imp-tap{min-height:48px;cursor:pointer;}',
    '.imp-row-opt.imp-tap{border:1px solid var(--c-border);border-radius:10px;background:var(--c-surface);padding:8px 12px;margin:0 0 8px;}',
    '#impPage select,#impSheet select{min-height:48px;max-width:100%;padding:8px 30px 8px 12px;border:1px solid var(--c-primary);border-radius:10px;font-size:14px;font-family:inherit;color:var(--c-primary-deep);cursor:pointer;' +
      'background:var(--c-surface) url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27%3E%3Cpath d=%27M1 1l5 5 5-5%27 fill=%27none%27 stroke=%27%23888%27 stroke-width=%272%27/%3E%3C/svg%3E") no-repeat right 10px center;}',
    '.imp-row-opt .imp-sel{flex:0 1 auto;max-width:11em;}',
    // 1016-UI7：下拉框不弹系统自带的选择框（安卓上跟着系统主题配色，深色时白字配浅底看不清），点了从底部弹出记问自己的选择面板
    '.imp-sel{position:relative;display:inline-flex;min-width:0;cursor:pointer;}.imp-sel select{width:100%;max-width:none;pointer-events:none;}',
    '#impPage input[type=text]{min-height:48px;padding:8px 12px;border:1px solid var(--c-primary);border-radius:10px;font-size:15px;background:var(--c-surface);color:var(--c-text);}',
    '#impPage input[type=checkbox]{width:22px;height:22px;flex:0 0 22px;accent-color:var(--c-primary);-webkit-appearance:checkbox;appearance:auto;}',
    '.imp-link{display:inline-flex;align-items:center;min-height:48px;background:none;border:none;color:var(--c-primary-deep);text-decoration:underline;text-underline-offset:3px;font-size:13.5px;padding:0 2px;cursor:pointer;font-family:inherit;text-align:left;}',
    '.imp-gh{display:flex;justify-content:space-between;align-items:center;min-height:48px;padding:4px 4px;margin-bottom:8px;border-bottom:1px solid var(--c-border);cursor:pointer;font-size:14px;}',
    '.imp-list{display:flex;flex-direction:column;gap:8px;margin:0 0 12px;}',
    '.imp-item{background:var(--c-surface);border:1px solid var(--c-border);border-radius:10px;min-height:48px;cursor:pointer;}',
    '.imp-list .al-row{display:flex;align-items:center;gap:8px;padding:9px 10px 2px;}',
    '.imp-list .imp-why{font-size:12px;color:var(--c-text-soft);padding:0 10px 8px;}',
    '.imp-tag{display:inline-block;font-size:11px;border:1px solid var(--c-border-mid);border-radius:8px;padding:0 5px;margin-left:4px;}',
    '#impBar.ui-bar{z-index:991;}',
    '#impSheetMask{position:fixed;inset:0;z-index:995;background:rgba(0,0,0,.3);display:none;align-items:flex-end;justify-content:center;}',
    '#impSheet{background:var(--c-surface-2);width:100%;max-width:520px;max-height:88vh;max-height:88dvh;overflow-y:auto;border-radius:16px 16px 0 0;padding:16px 16px 0;}',
    '#impSheet h4{font-size:16px;margin-bottom:8px;color:var(--c-primary-deep);}',
    '#impSheet .kv{display:flex;gap:8px;font-size:14px;padding:3px 0;}#impSheet .kv span:first-child{flex:0 0 5em;color:var(--c-text-soft);}#impSheet .kv span:last-child{min-width:0;overflow-wrap:anywhere;}',
    '#impSheet .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}',
    '#impSheet .acts > .imp-cat-line{display:flex;align-items:center;gap:8px;flex:1 1 100%;}',
    '#impSheet .imp-sheet-foot{position:sticky;bottom:0;margin:12px -16px 0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--c-surface-2);border-top:1px solid var(--c-border);}',
    '.imp-sub-row{display:flex;align-items:center;gap:8px;padding:4px 0 4px 8px;min-height:48px;font-size:13.5px;}',
    '.imp-sub-row .grow{flex:1 1 140px;min-width:0;overflow-wrap:anywhere;}',
    '.imp-sub-row + .imp-sub-row{margin-top:8px;}',
    '.imp-best{display:inline-block;font-size:11px;background:var(--c-primary);color:var(--c-on-primary);border-radius:8px;padding:0 5px;margin-right:4px;}',
    '.imp-switch{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;min-height:36px;border:1px solid var(--c-border-mid);border-radius:18px;padding:3px 12px 3px 6px;font-size:13px;background:var(--c-surface);color:var(--c-text);}',
    '.imp-switch i{display:inline-block;width:18px;height:18px;border-radius:50%;background:var(--c-border-mid);}',
    '.imp-switch.on{background:var(--c-primary);border-color:var(--c-primary);color:var(--c-on-primary);}.imp-switch.on i{background:var(--c-on-primary);}',
    '.imp-members{padding:0 10px 8px 18px;}',
    '#impProg{position:fixed;inset:0;z-index:996;background:rgba(0,0,0,.3);display:none;align-items:flex-end;justify-content:center;padding:0 14px calc(24px + env(safe-area-inset-bottom));}',
    '#impProg .box{background:var(--c-surface-2);border-radius:14px;padding:18px;width:100%;max-width:420px;text-align:center;}',
    '#impProg .bar{height:6px;background:var(--c-chip);border-radius:3px;margin:12px 0 16px;overflow:hidden;}#impProg .bar i{display:block;height:100%;width:0;background:var(--c-primary);}',
    '.imp-trace-rows{display:none;}.imp-trace.open .imp-trace-rows{display:block;}',
    // 1017-UI2：分步进度、每步顶上一句话、已定 / 没定、总览四格
    '#impPage .imp-steps{position:sticky;top:52px;z-index:2;background:var(--c-bg);padding:8px 14px 10px;border-bottom:1px solid var(--c-border);}',
    '.imp-steps-t{font-size:14px;font-weight:bold;color:var(--c-primary-deep);margin-bottom:6px;}',
    '.imp-steps-bar{display:flex;gap:6px;}.imp-steps-bar i{flex:1;height:5px;border-radius:3px;background:var(--c-border);}.imp-steps-bar i.on{background:var(--c-primary);}',
    '.imp-intro{margin:2px 2px 12px;}.imp-intro-t{font-size:15.5px;font-weight:bold;color:var(--c-primary-deep);line-height:1.6;}',
    '.imp-notice{margin:0 0 12px;padding:8px 12px;border-radius:10px;background:var(--c-chip);border:1px solid var(--c-border-mid);font-size:13.5px;color:var(--c-text);}',
    // 1017-UI7：状态颜色。主色 = 确认 / 合并，绿 = 已选 / 对上，红 = 有出入（这两个用主题里的 --c-pos / --c-neg），琥珀 = 待选，灰 = 都不是 / 跳过；
    //   琥珀和灰打开导入页时按当前主色算（setTokens），离主色太近就挪开。标签：● 待选 / ◐ 部分已定 / ✓ 已选，卡片左边一条同色细竖条
    ':root{--st-pend:#b4660e;--st-skip:#86867f;--st-ok:var(--c-pos);--st-bad:var(--c-neg);--st-main:var(--c-primary-dark);}',
    '.imp-mark{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;font-size:12px;line-height:1;padding:5px 9px;border-radius:12px;font-weight:bold;white-space:nowrap;color:var(--st-pend);background:rgba(180,102,14,.12);background:color-mix(in srgb,var(--st-pend) 12%,transparent);}',
    '.imp-mark svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;}',
    '.imp-mark.pend svg{fill:currentColor;stroke:none;}',
    '.imp-mark.on{color:var(--st-ok);background:rgba(58,122,46,.12);background:color-mix(in srgb,var(--st-ok) 12%,transparent);}',
    '.imp-card.st-pend,.imp-card.st-part,.imp-card.st-ok{position:relative;padding-left:18px;}',
    '.imp-card.st-pend::before,.imp-card.st-part::before,.imp-card.st-ok::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:4px;border-radius:0 3px 3px 0;background:var(--st-pend);}',
    '.imp-card.st-ok::before{background:var(--st-ok);}',
    '.imp-chosen{display:flex;align-items:center;gap:8px;min-height:48px;color:var(--c-text);}.imp-chosen .grow{flex:1;min-width:0;}',
    '.imp-chosen .imp-ok-ico{color:var(--st-ok);font-weight:bold;}',
    '.imp-redo{flex:0 0 auto;min-height:48px;min-width:48px;padding:0 8px;border:none;background:none;color:var(--c-primary-dark);font-size:14px;font-weight:bold;font-family:inherit;text-decoration:underline;cursor:pointer;}',
    '.imp-keep{margin-top:8px;margin-left:8px;}',
    // 1017-UI9：记录不能凭空消失
    '.imp-count{font-size:13px;font-weight:normal;color:var(--c-text-soft);margin-left:6px;}',
    '.imp-fold{display:flex;align-items:center;gap:8px;width:100%;min-height:48px;margin-top:8px;padding:0 4px;border:none;border-top:1px solid var(--c-border);background:none;font-family:inherit;font-size:14px;color:var(--c-text);cursor:pointer;}.imp-fold .grow{flex:1;}',
    '.imp-fold-n{display:inline-flex;align-items:center;padding:5px 10px;border-radius:12px;font-weight:bold;color:var(--st-ok);background:rgba(58,122,46,.12);background:color-mix(in srgb,var(--st-ok) 12%,transparent);}',
    '.imp-fold-box{margin-top:8px;}',
    '.imp-done-row{display:flex;align-items:center;gap:8px;min-height:48px;padding:4px 0;border-bottom:1px dashed var(--c-border);}.imp-done-row .grow{flex:1;min-width:0;}',
    '.imp-done-label{color:var(--c-text-soft);}.imp-moved .imp-done-label{text-decoration:line-through;}.imp-done-go{color:var(--c-text);font-size:14px;}',
    '.imp-flash{animation:impFlash 1.5s ease;}@keyframes impFlash{0%,60%{background:var(--c-sel-bg);}100%{background:transparent;}}',
    '.imp-toast-t{flex:1;}.imp-toast-view{flex:0 0 auto;min-height:48px;min-width:48px;padding:0 12px;margin-left:8px;border:none;border-radius:8px;background:rgba(255,255,255,.2);color:#fff;font-weight:bold;font-family:inherit;font-size:14px;}',
    '.imp-chg{display:flex;gap:8px;align-items:center;min-height:48px;padding:6px 0;border-bottom:1px solid var(--c-border);}.imp-chg:last-child{border-bottom:none;}.imp-chg .grow{flex:1;min-width:0;}',
    '.imp-chg-k{flex:0 0 auto;font-size:12px;padding:3px 7px;border-radius:8px;background:var(--c-chip);color:var(--c-text-soft);}',
    // 1017-UI8：配对卡
    '.imp-pc-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}.imp-pc-title{font-weight:bold;color:var(--c-primary-deep);}',
    '.pc-me{background:var(--c-chip);border-radius:10px;padding:8px 10px;margin:6px 0 8px;}',
    '.pc-lab{font-size:12px;color:var(--c-text-soft);margin-bottom:2px;}.pc-sum{font-size:13px;color:var(--c-text);margin:0 0 4px;}',
    '.pc-main{display:flex;gap:8px;align-items:baseline;font-size:15px;color:var(--c-primary-deep);}.pc-main .grow{flex:1;min-width:0;}',
    '.pc-main .amt{flex:0 0 auto;font-weight:bold;font-variant-numeric:tabular-nums;}',
    '.pc-sub{font-size:12px;color:var(--c-text-soft);margin-top:1px;word-break:break-all;}',
    '.pc{border:1px solid var(--c-border);border-radius:12px;background:var(--c-surface);padding:8px 10px 10px;margin:8px 0;cursor:pointer;}',
    '.pc.on{border-color:var(--st-ok);box-shadow:0 0 0 1px var(--st-ok) inset;}.pc.dim{opacity:.5;}',
    '.pc-bill{padding:6px 0;border-bottom:1px dashed var(--c-border);}.pc-bill:last-child{border-bottom:none;}',
    '.pc-full{background:var(--c-surface);border:1px solid var(--c-border);border-radius:10px;padding:8px 10px;margin:6px 0;}',
    '.pc-ver{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;margin:6px 0 8px;color:var(--c-text-soft);}',
    '.pc-ver .ok{color:var(--st-ok);}.pc-ver .no{color:var(--st-bad);font-weight:bold;}',
    '.pc-pick{display:block;width:100%;min-height:48px;border-radius:10px;border:1.5px solid var(--st-main);background:transparent;color:var(--st-main);font-size:15px;font-weight:bold;font-family:inherit;cursor:pointer;}',
    '.pc.on .pc-pick{background:var(--st-ok);border-color:var(--st-ok);color:#fff;}.pc-pick:disabled{opacity:.45;}',
    '.pc-none{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:48px;margin-top:8px;border-radius:10px;border:1.5px solid var(--st-skip);background:transparent;color:var(--st-skip);font-size:15px;font-family:inherit;cursor:pointer;}',
    '.pc-none svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;}',
    '.imp-card h4 .imp-mark{margin-left:8px;font-weight:normal;vertical-align:2px;}',
    '.imp-val{flex:0 0 auto;font-weight:bold;color:var(--c-primary-deep);}',
    '.imp-sec-t{font-size:13px;color:var(--c-text-soft);margin:10px 2px 6px;}',
    '.imp-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}',
    '.imp-tile{background:var(--c-surface);border:1px solid var(--c-border);border-radius:10px;padding:8px 12px;}.imp-tile b{display:block;font-size:20px;color:var(--c-primary-deep);}',
    '.imp-pend-note{margin:4px 0 8px;padding:8px 10px;border-radius:8px;background:var(--c-chip);font-size:13.5px;line-height:1.6;}',
    '.imp-cf-list{display:flex;flex-direction:column;gap:10px;margin:2px 0 12px;}',
    '.imp-cf-item{display:flex;gap:10px;align-items:flex-start;}.imp-cf-item i{flex:0 0 8px;height:8px;border-radius:50%;background:var(--c-primary);margin-top:8px;}',
    '.imp-cf-item b{display:block;font-size:15px;color:var(--c-primary-deep);}',
    '.imp-res-hero{text-align:center;padding:16px 8px 12px;}',
    '.imp-res-ok{width:56px;height:56px;margin:0 auto 10px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--c-on-primary);background:linear-gradient(135deg,var(--c-primary-mid),var(--c-primary-dark));}',
    '.imp-res-title{font-size:20px;font-weight:bold;color:var(--c-primary-deep);margin-bottom:2px;}',
    '.imp-cf-bk{font-size:12.5px;color:var(--c-text-soft);padding:8px 10px;border-radius:8px;background:var(--c-surface);border:1px solid var(--c-border);line-height:1.6;}'
  ].join('\n');

  // ---------- 页面骨架 ----------
  function build() {
    if (dom) return dom;
    var st = el('style'); st.id = 'impStyle'; st.textContent = CSS; document.head.appendChild(st);
    var page = el('div'); page.id = 'impPage';
    var head = el('div', 'imp-head');
    var back = btn('‹ 取消', 'imp-back', function () { headBack(); }); back.id = 'impBack';
    var tt = el('div', 'imp-title', '导入账单'); tt.id = 'impTitle';
    var sub = el('div', 'imp-sub'); sub.id = 'impArchive';
    head.appendChild(back); head.appendChild(tt); head.appendChild(sub);
    var body = el('div'); body.id = 'impBody';
    var steps = el('div', 'imp-steps'); steps.id = 'impSteps'; steps.style.display = 'none';      // 1017-UI2：分步进度
    page.appendChild(head); page.appendChild(steps); page.appendChild(body);
    // 1016-UI2：底部操作栏，每一步放这一步的主按钮（barSet）；确认页的三个按钮一直是同一组元素
    var bar = el('div', 'ui-bar'); bar.id = 'impBar'; bar.style.display = 'none';
    var cancel = btn('取消', 'ui-btn', function () { if (hasWork()) askExit(function () { close(); }); else close(); }); cancel.id = 'impCancel';
    var go = btn('导入', 'ui-btn primary ui-full', function () { if (S && S.view && S.view.recon) onImport(reconKeys()); else onImport(); }); go.id = 'impGo';
    var rc = btn('只对账', 'ui-btn', function () { toggleRecon(); }); rc.id = 'impRecon';
    var file = el('input'); file.type = 'file'; file.id = 'impFile'; file.multiple = true; file.accept = '.csv,.xlsx,.zip,text/csv,application/zip'; file.style.display = 'none';
    file.addEventListener('change', function () { var fs = [].slice.call(file.files || []); file.value = ''; if (fs.length) start(fs); });
    var sm = el('div'); sm.id = 'impSheetMask'; var sh = el('div'); sh.id = 'impSheet'; sm.appendChild(sh);
    sm.addEventListener('click', function (e) { if (e.target === sm) closeSheet(); });
    var pg = el('div'); pg.id = 'impProg';
    var box = el('div', 'box'); var pt = el('div', 'imp-line', ''); pt.id = 'impProgText';
    var pb = el('div', 'bar'); var pi = el('i'); pi.id = 'impProgBar'; pb.appendChild(pi);
    var pc = btn('取消', 'ui-btn block', function () { close(); }); pc.id = 'impProgCancel';
    box.appendChild(pt); box.appendChild(pb); box.appendChild(pc);
    pg.appendChild(box);
    [page, bar, file, sm, pg].forEach(function (x) { document.body.appendChild(x); });
    dom = { page: page, body: body, bar: bar, go: go, recon: rc, cancel: cancel, file: file, sheetMask: sm, sheet: sh, prog: pg, progText: pt, progBar: pi, title: tt, archive: sub, back: back, steps: steps };
    if (window.ResizeObserver) try { new ResizeObserver(syncBar).observe(bar); } catch (_) {}
    return dom;
  }
  // 底部操作栏：换成这几个按钮（空就收起来）；页面底部让出操作栏的高度，最后一行不被挡住
  function barSet(btns) {
    var b = dom.bar; while (b.firstChild) b.removeChild(b.firstChild);
    (btns || []).forEach(function (x) { if (x) b.appendChild(x); });
    b.style.display = b.children.length ? 'flex' : 'none';
    syncBar();
  }
  function syncBar() {
    if (!dom) return;
    var h = dom.bar.style.display === 'none' ? 0 : dom.bar.offsetHeight;
    dom.page.style.setProperty('--imp-bar', h + 'px');
  }
  // 顶上的「‹ 取消 / ‹ 返回」：和返回键一样一层一层退（教程 → 选文件、只对账 → 确认页，其余关掉整页）
  // 1017-UI2：顶上「‹ 取消」= 退出这次导入（有方案时先问一句）；只对账清单里是「‹ 返回」回总览；教程里回选文件
  function headBack() {
    if (S && (S.phase === 'writing' || S.phase === 'undoing')) return;
    if (S && S.phase === 'confirm' && S.view && S.view.recon) { toggleRecon(); return; }
    if (S && S.phase === 'guide') { S.phase = 'pick'; renderPick(); return; }
    if (hasWork()) { askExit(function () { close(); }); return; }
    close();
  }
  // 有要丢掉的东西：选好了文件、正在算或算出了方案（结果页、选文件页没选文件时不算）
  function hasWork() { return !!S && (S.phase === 'confirm' || S.phase === 'progress'); }
  function setHead(title, backText) { dom.title.textContent = title; dom.back.textContent = backText || '‹ 返回'; }
  // 1016-UI7 / 1017-UI1：下拉框套一层，点了不弹系统自带的选择框，弹主程序的共用底部面板（JiwenSheet，和「筛选」同一套外观）；
  //   选分类的用筛选里那种分类块（「未分类」放第一个），别的选项一行一个；点一下就选中并关掉，选了照样给 select 赋值、发 change
  var CAT_SEL = { 'imp-into': 1, 'imp-cp-sel': 1, 'imp-row-cat': 1, 'imp-pend-cat': 1, 'imp-rule-cat': 1, 'imp-rule-newcat': 1, 'imp-map-cat': 1 };
  var SEL_TITLE = { 'imp-type-sel': '这类交易怎么处理', 'imp-status-sel': '这个状态怎么处理', 'imp-into': '并到哪个已有分类', 'imp-cp-sel': '这个对方归到哪个分类',
                    'imp-row-cat': '这一笔归到哪个分类', 'imp-pend-cat': '作为新增，归到哪个分类', 'imp-rule-cat': '归到哪个分类', 'imp-rule-newcat': '归到哪个分类', 'imp-map-cat': '归到哪个分类' };
  function wrapSel(se, sub) {
    var w = el('span', 'imp-sel');
    w.appendChild(se);
    if (sub) se.dataset.sub = sub;
    w.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openPicker(se); });
    return w;
  }
  function openPicker(se) {
    if (!window.JiwenSheet) return;
    var cls = se.className.split(' ')[0], isCat = !!CAT_SEL[cls];
    var opts = [].slice.call(se.options).map(function (o) { return { value: o.value, label: cls === 'imp-into' ? (o.value || '不并，照原样') : o.textContent }; });
    if (isCat) opts.sort(function (a, b) { return (b.value === '未分类') - (a.value === '未分类'); });
    window.JiwenSheet.pick({ title: SEL_TITLE[cls] || '选一个', sub: se.dataset.sub || '', options: opts, value: se.value, chips: isCat,
      onPick: function (v) { if (se.value !== v) { se.value = v; se.dispatchEvent(new Event('change', { bubbles: true })); } } });
  }
  function closePicker() { if (window.JiwenSheet && window.JiwenSheet.isOpen()) window.JiwenSheet.close(); }
  function sheetClose() { closePicker(); }
  function closeBtn(text) { var b = btn(text || '返回', 'ui-btn', function () { close(); }); b.id = 'impBarClose'; return b; }

  // ---------- 打开 / 关掉 ----------
  function open() {
    build(); setTokens();
    S = { phase: 'pick', edits: { rows: {}, cpCats: {}, newCats: {}, petty: {}, receipt: true, sums: {}, ruleFix: {} }, types: {}, statuses: {},
          view: { details: false, open: {}, shown: {}, tag: null, sumOpen: {}, moreCands: {}, seen: {}, more: {}, step: null } };
    try { dom.archive.textContent = '导入到存档「' + store().archiveInfo().name + '」'; } catch (_) { dom.archive.textContent = ''; }
    dom.page.style.display = 'block'; barSet([]);
    renderPick();
  }
  // 1016-Z3：「用记问打开」：带着文件直接进导入页（正在写入 / 撤销时不打断）
  function openWith(files) {
    if (S && (S.phase === 'writing' || S.phase === 'undoing')) { alertMsg('正在写入，等写完再打开这个文件。'); return; }
    if (isOpen()) close();
    open();
    start(files);
  }
  function close() {
    if (S && (S.phase === 'writing' || S.phase === 'undoing')) return;
    runId++;
    if (J()) try { J().cancel(); } catch (_) {}
    if (!dom) return;
    dom.page.style.display = 'none'; dom.bar.style.display = 'none'; hideSteps();
    dom.prog.style.display = 'none'; dom.sheetMask.style.display = 'none'; closePicker();
    dom.body.innerHTML = '';
    S = null;
  }
  function isOpen() { return !!dom && dom.page.style.display === 'block'; }
  // 返回键：先关最上面那一层（行详情 → 进度（停掉线程，整页也关掉）→ 整页）
  function canBack() { return isOpen(); }
  function back() {
    if (dom.sheetMask.style.display === 'flex') { closeSheet(); return; }
    if (S && (S.phase === 'writing' || S.phase === 'undoing')) return;   // 写入 / 撤销中不让退出（写完或失败会自己回来）
    if (S && S.phase === 'confirm' && S.view && S.view.recon) { toggleRecon(); return; }   // 只对账清单 → 回到总览
    if (S && S.phase === 'guide') { S.phase = 'pick'; renderPick(); return; }          // 教程 → 回到选文件
    // 1017-UI2：分步确认页：返回键回上一步；第 1 步再按才回选文件（先问一句）；还在算的时候按返回也先问一句
    if (S && S.phase === 'confirm') { var i = stepIndex(); if (i > 0) { goStep(S.view.steps[i - 1]); return; } askExit(backToPick); return; }
    if (S && S.phase === 'progress') { askExit(backToPick); return; }
    close();
  }
  // 退出这次导入、回到选文件页（停掉线程，这次的东西都不要了）
  function backToPick() {
    runId++;
    if (J()) try { J().cancel(); } catch (_) {}
    dom.prog.style.display = 'none'; closeSheet(); closePicker();
    S = { phase: 'pick', edits: { rows: {}, cpCats: {}, newCats: {}, petty: {}, receipt: true, sums: {}, ruleFix: {} }, types: {}, statuses: {},
          view: { details: false, open: {}, shown: {}, tag: null, sumOpen: {}, moreCands: {}, seen: {}, more: {}, step: null } };
    hideSteps();
    renderPick();
  }
  // 1017-UI2：退出确认面板（新画的，和选分类面板同一套外观）：「继续导入」在上、最显眼，「退出」在最下面、提醒色；下拉、返回键 = 继续导入
  function askExit(onExit) {
    if (!window.JiwenSheet) { onExit(); return; }      // 主程序是老版本（没有共用面板）：照以前直接退
    var n = (S && S.fileCount) || (S && S.parsed && S.parsed.files ? S.parsed.files.length : 0), m = editCount();
    window.JiwenSheet.open({ title: '退出这次导入？', onDismiss: function () {},
      body: function (box) {
        var t = el('div', 'imp-line imp-exit-msg', (n ? '选好的 ' + n + ' 份账单' : '选好的账单') + (m ? '和你做的 ' + m + ' 处选择都不会保存' : '不会保存') + '，账本没有任何改动。');
        t.id = 'impExitMsg'; t.style.fontSize = '15px'; box.appendChild(t);
      },
      foot: function (box, done) {
        var col = el('div', 'ui-stack');
        var stay = btn('继续导入', 'ui-btn primary block', function () { done(); }); stay.id = 'impExitStay';
        var quit = btn('退出', 'ui-btn danger block', function () { done(); onExit(); }); quit.id = 'impExitOk';
        col.appendChild(stay); col.appendChild(quit); box.appendChild(col);
      } });
  }
  // 你在确认页上动过几处（给退出确认写「你做的 M 处选择」）：每一处改动算一处，只点开看过的不算
  function editCount() {
    if (!S || !S.edits) return 0;
    var e = S.edits, n = 0;
    Object.keys(e.rows || {}).forEach(function (k) { n += Object.keys(e.rows[k]).length; });
    ['cpCats', 'newCats', 'petty', 'sums', 'ruleFix'].forEach(function (k) { n += Object.keys(e[k] || {}).length; });
    n += Object.keys(S.types || {}).length + Object.keys(S.statuses || {}).length;
    if (e.nearPay) n++;
    if (e.receipt === false) n++;
    if (S.view && S.view.reconPick) n += Object.keys(S.view.reconPick).length;
    return n;
  }

  // ---------- 第一步：选文件 ----------
  function renderPick() {
    hideSteps();
    var b = dom.body; b.innerHTML = '';
    setHead('导入账单', '‹ 取消');
    var c = el('div', 'imp-card');
    c.appendChild(el('h4', null, '导入微信 / 支付宝账单（开发中）'));
    c.appendChild(el('div', 'imp-soft', '先在微信或支付宝里导出账单（选「用于个人对账」），邮件里的压缩包可以直接选（会问解压密码），也可以先解压再选里面的 csv / xlsx 文件。可以一次选好几个。写进账本前会先给你看导入方案，导错了能撤销。'));
    // 1016-UI2：开发用的自检挪到说明下面、写成大白话，不和正经选项排在一起
    if (typeof window.openDevImportCheck === 'function') { var chk = btn('导入功能自己检查一下（出问题时给开发者看）', 'imp-link', function () { window.openDevImportCheck(); }); chk.id = 'impSelfTest'; c.appendChild(chk); }
    b.appendChild(c);
    // 两个教程是大卡片，放在下面（拇指够得着）；主按钮「选账单文件」在底部操作栏，最靠下
    var st = el('div', 'ui-stack imp-push'); st.id = 'impPickChoices';
    var choice = function (id, title, desc, fn) { var x = el('button', 'ui-choice'); x.type = 'button'; x.id = id; x.appendChild(el('b', null, title)); x.appendChild(el('span', null, desc)); x.addEventListener('click', fn); return x; };
    st.appendChild(choice('impGuideWx', '微信怎么导出', '一步一步教你在微信里导出账单、找解压密码', function () { renderGuide('wechat'); }));
    st.appendChild(choice('impGuideAli', '支付宝怎么导出', '一步一步教你在支付宝里导出账单、找解压密码', function () { renderGuide('alipay'); }));
    b.appendChild(st);
    var pick = btn('选账单文件', 'ui-btn primary ui-full', function () { dom.file.click(); }); pick.id = 'impPick';
    barSet([pick]);
    dom.page.scrollTop = 0;
  }

  // ---------- 1016-S：导出教程（先写文字步骤，图的位置用「此处放截图：…」占位）----------
  // 两家 App 改版会改菜单名，文案里写明「按你手机上的版本可能略有不同」
  var GUIDE = {
    wechat: { title: '微信账单怎么导出', steps: [
      ['打开微信，点右下角「我」→「服务」（有的版本叫「支付」）→「钱包」→「账单」。', '微信「我 → 服务 → 钱包」页面'],
      ['在账单页右上角点「…」（或「常见问题」），选「下载账单」。', '账单页右上角的菜单'],
      ['用途选「用于个人对账」，不要选「用于证明材料」（那种是 PDF，记问读不了）。', '「用于个人对账」选项'],
      ['选账单的时间范围（一次最多几个月，按页面上写的来），填上你的邮箱，按提示验证身份。', '选时间范围和填邮箱'],
      ['提交以后，「微信支付」会发一条消息，里面写着解压密码；记下来。', '「微信支付」消息里的解压密码'],
      ['等邮件：一般几分钟到一小时，邮箱里会收到一个压缩包（.zip）。', '邮箱里收到的账单邮件'],
      ['把压缩包下载到手机上。可以直接在记问里选这个压缩包（会问解压密码），也可以先用「文件管理」解压，得到一个 .xlsx 文件。', '文件管理里解压、输密码'],
      ['回到记问，点「选账单文件」，选这个压缩包或 .xlsx 文件。']
    ] },
    alipay: { title: '支付宝账单怎么导出', steps: [
      ['打开支付宝，点右下角「我的」→「账单」。', '支付宝「我的 → 账单」'],
      ['在账单页右上角点「…」，选「开具交易流水证明」。', '账单页右上角的菜单'],
      ['用途选「用于个人对账」，不要选「用于证明材料」（那种是 PDF，记问读不了）。', '「用于个人对账」选项'],
      ['选账单的时间范围，填上你的邮箱，提交。', '选时间范围和填邮箱'],
      ['解压密码会显示在提交成功的页面上（支付宝消息里也有），记下来。', '提交成功页面上的解压密码'],
      ['等邮件：邮箱里会收到一个压缩包（.zip）。', '邮箱里收到的账单邮件'],
      ['把压缩包下载到手机上。可以直接在记问里选这个压缩包（会问解压密码），也可以先用「文件管理」解压，得到一个 .csv 文件。', '文件管理里解压、输密码'],
      ['回到记问，点「选账单文件」，选这个压缩包或 .csv 文件。']
    ] }
  };
  function renderGuide(app) {
    var g = GUIDE[app]; if (!g || !S) return;
    hideSteps();
    S.phase = 'guide';
    var b = dom.body; b.innerHTML = '';
    setHead(g.title, '‹ 返回');
    var c = el('div', 'imp-card'); c.id = 'impGuide'; c.dataset.app = app;
    c.appendChild(el('h4', null, g.title));
    var ol = el('ol'); ol.style.paddingLeft = '20px';
    g.steps.forEach(function (x) {
      var li = el('li', 'imp-line'); li.style.marginBottom = '8px';
      li.appendChild(el('div', null, x[0]));
      if (x[1]) li.appendChild(el('div', 'imp-soft imp-shot', '此处放截图：' + x[1]));
      ol.appendChild(li);
    });
    c.appendChild(ol);
    c.appendChild(el('div', 'imp-soft', '提醒：导出的文件别用 Excel 打开再另存，会改编码，还会把长订单号变成科学计数法，记问就认不准了。菜单名按你手机上的版本可能略有不同。'));
    b.appendChild(c);
    // 1016-UI2：「回去选文件」和「选账单文件」都在底部操作栏
    var bk = btn('‹ 回去选文件', 'ui-btn', function () { S.phase = 'pick'; renderPick(); }); bk.id = 'impGuideBack';
    var gp = btn('选账单文件', 'ui-btn primary', function () { dom.file.click(); }); gp.id = 'impGuidePick';
    barSet([bk, gp]);
    dom.page.scrollTop = 0;
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
    S.fileCount = files.length;
    S.phase = 'progress';
    progress('读文件…', 0, 1);
    var alive = function () { return my === runId && S; };
    readAll(files).then(function (fs) {
      if (!alive()) return;
      return unzipAll(fs, alive);
    }).then(function (fs) {
      if (!alive() || !fs) return;
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
  // ---------- 第三期（1016-Z8）：账单压缩包在 App 里解开（带密码的问一句密码）----------
  // 选的文件是 .zip（不是 xlsx 本身）：没密码直接解；有密码就问，密码不对再问，点取消就不导这个压缩包；解出里面的 .csv / .xlsx 接着照常算。
  // 解压在这一侧算（纯 JS，unzip.js），解出来的字节再交给后台线程解析。密码只用这一次，不保存。
  function askPassword(name, again) {
    return new Promise(function (resolve) {
      if (typeof window.customPrompt !== 'function') { resolve(null); return; }
      window.customPrompt((again ? '密码不对，再试一次。\n\n' : '') + '「' + name + '」有密码。\n微信：密码在「微信支付」发给你的消息里；支付宝：在导出成功的页面上（支付宝消息里也有）。',
        '', function (v) { resolve(v); }, '压缩包密码', null, { placeholder: '解压密码', onCancel: function () { resolve(null); } });
    });
  }
  function unzipAll(fs, alive) {
    var U = window.JiwenImportUnzip;
    if (!U) return Promise.resolve(fs);
    var out = [];
    return fs.reduce(function (p, f) {
      return p.then(function () {
        if (!alive()) return;
        var u8 = new Uint8Array(f.data), info = U.inspect(u8);
        if (info.kind !== 'zip') { out.push(f); return; }
        var tryPw = function (pw) {
          var r = U.extract(u8, pw);
          if (r.ok) { r.files.forEach(function (x) { out.push({ name: x.name, data: x.data.buffer.slice(x.data.byteOffset, x.data.byteOffset + x.data.byteLength) }); }); return; }
          if (r.why === 'password') {
            dom.prog.style.display = 'none';
            return askPassword(f.name, pw !== '').then(function (v) {
              if (v === null || !alive()) { S && (S.skippedZip = (S.skippedZip || []).concat([f.name])); return; }
              progress('解压…', 0, 1);
              return tryPw(v);
            });
          }
          out.push(f);   // 解不开（坏了、不认识的压缩方式、里面没有账单）：原样交给解析，它会说「这是一个压缩包」
        };
        if (info.encrypted) { dom.prog.style.display = 'none'; return askPassword(f.name, false).then(function (v) { if (v === null || !alive()) { S && (S.skippedZip = (S.skippedZip || []).concat([f.name])); return; } progress('解压…', 0, 1); return tryPw(v); }); }
        return tryPw('');
      });
    }, Promise.resolve()).then(function () {
      if (!alive()) return null;
      if (!out.length) { dom.prog.style.display = 'none'; S.phase = 'pick'; renderPick(); return null; }
      progress('读文件…', 0, 1);
      return out;
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
      // 1016-U：每个来源上次导到哪天（导入记录里的；只对账的不算；撤销了自然就退回去）
      S.lastTo = {};
      logs.forEach(function (l) {
        if (l.only) return;
        (l.apps || []).forEach(function (app) {
          var to = l.rng && l.rng[app] ? l.rng[app][1] : l.to;
          if (to && (!S.lastTo[app] || to > S.lastTo[app])) S.lastTo[app] = to;
        });
      });
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
  // ---------- 1017-UI2：分步确认页 ----------
  // 第 1 步核对 → 要你定的几步（和手记对不上的 / 退款和转账 / 分类 / 金额要你看一眼，哪步没事就不出现）→ 总览（只对账、导入）。
  // 每一步都可以不动、直接下一步（按现在的默认）。确认页上的改动照旧记进 S.edits，照旧 replan()；这里只管放在哪一页。
  // 只有 1 步要定、而且不超过 3 件时，那几件直接放进总览，不单独分页。
  var STEP_NAME = { check: '核对', match: '和手记对不上的', refund: '退款和转账', cat: '分类', amount: '金额要你看一眼', overview: '总览' };
  var STEP_ORDER = ['check', 'match', 'refund', 'cat', 'amount', 'overview'];
  var MID = ['match', 'refund', 'cat', 'amount'];
  var MORE_N = 5;          // 待你确认、推荐看一眼这种多的，先列 5 个，其余收起
  var INLINE_MAX = 3;      // 只有 1 步要定、不超过 3 件：放进总览
  // ---------- 1017-UI8：配对卡 ----------
  //   上面「你记的」（时间、分类、金额、备注），下面「账单里的」一笔一行（时间、对方、金额，第二行小字写商品说明、支付方式、来源），
  //   最下面一行结论（合计、差多少钱、差几天、分类对不对得上，对不上的用红色）；底部整宽「选这个」，选中变实心加 ✓。点卡片看两边完整详情。
  //   几笔加起来、待你确认、金额差一点的、单笔候选、行详情里的候选都用这一份
  function dayNum(t) { return Math.round(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 86400000); }
  function mdhm(t) { return (+t.slice(5, 7)) + '月' + (+t.slice(8, 10)) + '日 ' + t.slice(11, 16); }
  function billRec(d) { var r = d && d.item && d.item.rec; return r && r.layer !== 'none' && r.cat && r.cat !== '未分类' ? r.cat : null; }
  function cut(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; }
  function meBlock(m, lab) {
    var x = el('div', 'pc-me'); x.appendChild(el('div', 'pc-lab', lab || '你记的'));
    var mm = el('div', 'pc-main'); mm.appendChild(el('span', 'grow', mdhm(m.time) + ' · ' + (m.cat || '未分类'))); mm.appendChild(el('span', 'amt', yuan(m.fen))); x.appendChild(mm);
    if (m.remark) x.appendChild(el('div', 'pc-sub', '备注：' + cut(m.remark, 30)));
    return x;
  }
  function billBlock(d) {
    var x = el('div', 'pc-bill'), row = S.parsed.files[d.file].rows[d.row] || {};
    var mm = el('div', 'pc-main'); mm.appendChild(el('span', 'grow', mdhm(d.time) + ' · ' + (cpShow(d.cp) || '—'))); mm.appendChild(el('span', 'amt', yuan(d.fen))); x.appendChild(mm);
    var sub = [Plan.cleanDesc ? Plan.cleanDesc(d.desc || '') : d.desc, row.pm, APP[d.app]].filter(function (v) { return v && v !== '/'; });
    if (sub.length) x.appendChild(el('div', 'pc-sub', sub.join(' · ')));
    return x;
  }
  function cpShow(cp) { return cp; }
  // 结论：[{ t, ok: true 对上 / false 有出入 / null 说不上 }]
  function verdict(m, ds) {
    var out = [], tot = ds.reduce(function (s0, d) { return s0 + d.fen; }, 0), diff = m.fen - tot;
    if (ds.length > 1) out.push({ t: '合计 ' + yuan(tot), ok: diff === 0 });
    out.push({ t: diff === 0 ? '差 0.00' : (diff > 0 ? '手记多 ' : '账单多 ') + yuan(Math.abs(diff)), ok: diff === 0 });
    var dd = ds.map(function (d) { return dayNum(m.time) - dayNum(d.time); }), early = Math.min.apply(null, dd), late = Math.max.apply(null, dd);
    if (early < 0) out.push({ t: '你记的比账单早 ' + (-early) + ' 天', ok: false });
    else out.push({ t: late === 0 ? '同一天' : '晚 ' + late + ' 天记的', ok: true });
    var rcs = ds.map(billRec), rc = rcs.every(function (c) { return c && c === rcs[0]; }) ? rcs[0] : null;
    if (!rc) out.push({ t: '账单推不出分类', ok: null });
    else if (rc === (m.cat || '未分类')) out.push({ t: '分类对得上', ok: true });
    else out.push({ t: '分类对不上（账单像「' + rc + '」）', ok: false });
    return out;
  }
  function verdictEl(list) {
    var v = el('div', 'pc-ver');
    list.forEach(function (x) { var sp = el('span', x.ok === true ? 'ok' : x.ok === false ? 'no' : ''); sp.textContent = (x.ok === true ? '✓ ' : x.ok === false ? '✗ ' : '') + x.t; v.appendChild(sp); });
    return v;
  }
  // o：{ lab, sum（一句话）, manual, showManual, bills:[行], picked, dim, also, early, cls, pickText, pickCls, i, onPick, noPick, verdict }
  function pairCard(o) {
    var c = el('div', 'pc' + (o.picked ? ' on' : '') + (o.dim ? ' dim' : '') + (o.cls ? ' ' + o.cls : ''));
    if (o.lab) c.appendChild(el('div', 'pc-lab', o.lab));
    if (o.sum) c.appendChild(el('div', 'pc-sum', o.sum));
    if (o.manual && o.showManual !== false) c.appendChild(meBlock(o.manual));
    if (o.bills && o.bills.length) { var bl = el('div', 'pc-bills'); if (o.showManual !== false && o.manual) bl.appendChild(el('div', 'pc-lab', '账单里的')); o.bills.forEach(function (d) { bl.appendChild(billBlock(d)); }); c.appendChild(bl); }
    if (o.manual && o.bills && o.bills.length) c.appendChild(verdictEl(o.verdict || verdict(o.manual, o.bills)));
    else if (o.verdict) c.appendChild(verdictEl(o.verdict));
    if (o.also) c.appendChild(el('div', 'imp-also', o.also));
    if (!o.noPick) {
      var b = btn(o.picked ? '✓ 已选这个' : (o.pickText || '选这个'), 'pc-pick ' + (o.pickCls || ''), function (e) { e.stopPropagation(); if (o.onPick) o.onPick(); });
      if (o.i !== undefined) b.dataset.i = o.i;
      if (o.disabled) b.disabled = true;
      c.appendChild(b);
    }
    c.addEventListener('click', function (e) { e.stopPropagation(); if (e.target.closest('button')) return; pairDetail(o); });
    return c;
  }
  function noneBtn(text, cls, fn) {
    var b = btn('', 'pc-none ' + (cls || ''), fn); b.innerHTML = ICON.x; b.appendChild(document.createTextNode(text)); return b;
  }
  // 点配对卡：看两边完整详情（只看，底部「关闭」）
  function pairDetail(o) {
    if (!window.JiwenSheet) return;
    window.JiwenSheet.open({ title: '两边的详情',
      body: function (box) {
        if (o.manual) {
          var m = o.manual, a = el('div', 'pc-me'); a.appendChild(el('div', 'pc-lab', '你记的'));
          [['时间', m.time.replace('T', ' ')], ['分类', m.cat || '未分类'], ['金额', yuan(m.fen)], ['备注', m.remark || '']].forEach(function (kv) { if (kv[1]) a.appendChild(el('div', 'pc-sub', kv[0] + '：' + kv[1])); });
          box.appendChild(a);
        }
        (o.bills || []).forEach(function (d) {
          var row = S.parsed.files[d.file].rows[d.row] || {}, x = el('div', 'pc-bill pc-full'); x.appendChild(el('div', 'pc-lab', '账单里的 · ' + (APP[d.app] || '')));
          [['时间', d.time.replace('T', ' ')], ['交易对方', d.cp], ['商品', d.desc], ['金额', yuan(d.fen)], ['支付方式', row.pm], [d.app === 'alipay' ? '交易分类' : '交易类型', d.kind], ['状态', d.status], ['备注', d.remark], ['推荐分类', billRec(d)]]
            .forEach(function (kv) { if (kv[1] && kv[1] !== '/') x.appendChild(el('div', 'pc-sub', kv[0] + '：' + kv[1])); });
          box.appendChild(x);
        });
        if (o.manual && o.bills && o.bills.length) box.appendChild(verdictEl(verdict(o.manual, o.bills)));
      },
      foot: function (box, done) { var cl = btn('关闭', 'ui-btn block', function () { done(); }); cl.id = 'impPairClose'; box.appendChild(cl); } });
  }
  // 1017-UI7：图标只用 App 已收录的 Lucide（ISC）：circle（待选）、contrast（部分已定）、check（已选）、x（都不是）
  var ICON = {
    pend: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>',
    part: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z" fill="currentColor"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
  };
  // 状态标签：done 已选（只看过就行的写「看过」）；part 是「1/8」这种（部分已定）；都没有是待选
  function mk(done, look, part) {
    var st = done ? 'ok' : part ? 'part' : 'pend';
    var x = el('span', 'imp-mark ' + st + (done ? ' on' : ''));
    x.innerHTML = ICON[st];
    x.appendChild(document.createTextNode(done ? (look ? '看过' : '已选') : part ? '部分已定 ' + part : (look ? '没看' : '待选')));
    x.dataset.st = st;
    return x;
  }
  // 卡片左边的竖条：卡片里的标签都是已选 → 绿；有已选或部分已定 → 琥珀（部分）；都没选 → 琥珀
  function cardState(c) {
    var ms = Array.prototype.slice.call(c.querySelectorAll('.imp-mark'));
    if (!ms.length) return;
    var ok = ms.filter(function (m) { return m.dataset.st === 'ok'; }).length;
    c.classList.remove('st-pend', 'st-part', 'st-ok');
    c.classList.add(ok === ms.length ? 'st-ok' : ok || ms.some(function (m) { return m.dataset.st === 'part'; }) ? 'st-part' : 'st-pend');
  }
  // 琥珀、灰按当前主色算：主色色相离琥珀太近（金色、橙色一类）就把琥珀往橙红挪、压暗一点，免得「待选」和主按钮分不开
  function setTokens() {
    try {
      var hex = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim().replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
      var r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, d = mx - mn;
      if (d) h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : mx === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
      var near = d && Math.abs(h - 34) < 26 && d / (1 - Math.abs(mx + mn - 1)) > 0.3;
      document.documentElement.style.setProperty('--st-pend', near ? '#b9520a' : '#b4660e');
    } catch (_) {}
  }
  function moreBtn(key, n, unit) {
    var open0 = !!S.view.more[key];
    var b = btn(open0 ? '收起' : '还有 ' + n + ' ' + unit + ' ▸', 'imp-link imp-more-' + key, function () { S.view.more[key] = !open0; render(); });
    return b;
  }
  // 待你确认里退款那几种（找不到原单、几笔可能是原单）：放在「退款和转账」；其余放在「和手记对不上的」
  function refundishRow(d) { var it = d.item || {}; return it.why === 'refundcands' || !!(it.cands && it.cands[0] && it.cands[0].row) || d.why === 'refundcands'; }
  // 单独一笔拿不准的（不在「几笔可能是同一条手记」那组里、不是多笔合一）：按原来的去向算，定了以后也留在这一步、标「已定」
  function pendSingles(p) {
    var inG = {};
    p.sections.pendGroups.forEach(function (g) { if (g.kind !== 'byBill') g.keys.forEach(function (k) { inG[k] = 1; }); });
    return p.rows.filter(function (d) { return d.src === 'row' && d.bucket0 === 'pending' && !inG[d.key] && !(d.item && d.item.msum); });
  }
  // 推荐要你看一眼：把握低的推荐（已经在「按对方选分类」里的不重复列）
  function lowConfRows(p) {
    var inCp = {}; p.sections.cpGroups.forEach(function (g) { (g.keys || []).forEach(function (k) { inCp[k] = 1; }); });
    return p.rows.filter(function (d) {
      var r = d.item && d.item.rec;
      return d.src === 'row' && d.group === 'add' && !d.summary && d.canCat && d.mode !== 'skip' && r && r.conf === 'low' && !inCp[d.key] && (d.catFrom === 'rec' || d.catFrom === 'edit');
    });
  }
  function typeKeys(s) {
    S.seenTypes = S.seenTypes || {}; S.seenStatuses = S.seenStatuses || {};
    s.unknownTypes.forEach(function (t) { S.seenTypes[t.app + '|' + t.type] = t; });
    s.unknownStatuses.forEach(function (t) { S.seenStatuses[t.app + '|' + t.status] = t; });
    return { t: Object.keys(S.seenTypes).filter(function (k) { return S.types[k] || s.unknownTypes.some(function (t) { return t.app + '|' + t.type === k; }); }),
             s: Object.keys(S.seenStatuses).filter(function (k) { return S.statuses[k] || s.unknownStatuses.some(function (t) { return t.app + '|' + t.status === k; }); }) };
  }
  // 每一步有几件、定了几件（只看方案和改动，不看页面）
  // 1017-UI9：每件带上名字（label）、它那几行（keys）和是不是「只看就行」（look）：挪走的、定了的能写明去处
  function stepItems(p) {
    var s = p.sections, E = S.edits, V = S.view.seen, it = { match: [], refund: [], cat: [], amount: [] };
    var picked = function (k) { return !!(E.rows[k] && E.rows[k].pick) || !!V['keep:' + k]; };     // 明确点了「还是待确认」也算定了
    var add = function (step, id, done, label, keys, o) { var x = { id: id, done: done, label: label, keys: keys || [] }; if (o) Object.keys(o).forEach(function (k) { x[k] = o[k]; }); it[step].push(x); };
    var rl = function (k) { return rowLabel(rowByKey(k)); };
    s.sums.forEach(function (g) { add('match', 'sum:' + g.id, g.chosen !== null, '几笔加起来：' + g.keys.map(rl).join('、'), g.keys); });
    if (s.nearMerged) add('match', 'near', !!V.near || !!E.nearPay, '金额差一点的 ' + s.nearMerged.n + ' 笔', s.nearMerged.keys, { look: !E.nearPay });
    s.pendGroups.forEach(function (g) { if (g.kind !== 'byBill') { var ps = pgState(g); add('match', 'pg:' + g.id, ps.done, g.text, g.keys, { part: ps.part }); } });
    pendSingles(p).forEach(function (d) { add(refundishRow(d) ? 'refund' : 'match', 'ps:' + d.key, picked(d.key) || d.group !== 'pending', rowLabel(d), [d.key]); });
    s.transfers.forEach(function (t) { var ts = trState(t); add('refund', 'tr:' + t.id, ts.done, '转账往来 ' + t.from.slice(5) + (t.to !== t.from ? '–' + t.to.slice(5) : '') + ' · ' + t.n + ' 笔', t.keys, { part: ts.part }); });
    s.refundHints.forEach(function (h) { add('refund', 'rh:' + h.key, !!V['rh:' + h.key], '全额退款提醒：' + rl(h.key), [h.key], { look: true }); });
    if (s.receipt) add('refund', 'receipt', !!V.receipt, '收款按天合并', [], {});
    s.petty.forEach(function (x) { add('refund', 'petty:' + x.key, x.key in E.petty, '零碎扣款：' + x.cp + ' · ' + x.month, []); });
    s.newCats.forEach(function (x) { add('cat', 'nc:' + x.name, x.name in E.newCats, '新建分类「' + x.name + '」', newCatKeys(p, x.name)); });
    s.cpGroups.forEach(function (g) { add('cat', 'cp:' + g.cp, g.cp in E.cpCats || !!V['cp:' + g.cp], cpShow(g.cp) + ' · ' + g.n + ' 笔 · ' + yuan(g.fen), g.keys); });
    lowConfRows(p).forEach(function (d) { add('cat', 'lc:' + d.key, !!(E.rows[d.key] && E.rows[d.key].cat) || !!V['lc:' + d.key], rowLabel(d), [d.key]); });
    var tk = typeKeys(s);
    tk.t.forEach(function (k) { add('cat', 'ty:' + k, !!S.types[k], '没见过的交易类型「' + k.split('|')[1] + '」', []); });
    tk.s.forEach(function (k) { add('cat', 'st:' + k, !!S.statuses[k], '没见过的状态「' + k.split('|')[1] + '」', []); });
    s.amountChecks.forEach(function (x) { add('amount', 'am:' + x.key, !!V['am:' + x.key] || !!E.rows[x.key], rl(x.key), [x.key], { look: !E.rows[x.key] }); });
    return it;
  }
  // ---------- 1017-UI9：页面上的记录不能凭空消失 ----------
  //   每一步记住出现过的每一件（S.view.ever）；重算以后不见了的照样留着，算进这一块的「已处理」，去处按它那几行现在的样子写。
  //   每一块标题写「待选 x / 共 y」，底部「✓ 已处理 N 件 ▸」默认收起；挪走的每一行写去处，带「改 / 撤回」，跨步的点了跳过去
  var CARD_OF = { sum: 'impSums', near: 'impNear', pg: 'impPendGroups', tr: 'impTransfers', rh: 'impRefundHints', receipt: 'impReceipt', petty: 'impPetty',
                  nc: 'impNewCats', cp: 'impCpGroups', lc: 'impLowConf', ty: 'impTypes', st: 'impTypes', am: 'impAmounts' };
  var TAP_KINDS = { cp: 1, lc: 1, am: 1, ps: 1, rh: 1 };
  function cardOf(id, step) { var k = id.slice(0, id.indexOf(':') < 0 ? id.length : id.indexOf(':')); return k === 'ps' ? (step === 'refund' ? 'impPendRefunds' : 'impPendSingles') : CARD_OF[k]; }
  function remember(items) {
    var ev = S.view.ever = S.view.ever || {};
    Object.keys(items).forEach(function (st) {
      var m = ev[st] = ev[st] || {};
      items[st].forEach(function (x) { m[x.id] = { id: x.id, label: x.label, keys: x.keys, look: !!x.look, step: st }; });
    });
  }
  // 这一步里不见了的（重算以后不在了）
  function gone(step, items) {
    var now = {}; (items[step] || []).forEach(function (x) { now[x.id] = 1; });
    var m = (S.view.ever || {})[step] || {};
    return Object.keys(m).filter(function (id) { return !now[id]; }).map(function (id) { return m[id]; });
  }
  // 一行现在去哪了：{ t: 「→ …」, step: 要跳去的那一步（没有就是 null） }
  function destOf(keys) {
    var d = keys && keys.length ? rowByKey(keys[0]) : null;
    if (!d) return { t: '→ 没有要定的了', step: null };
    var more = keys.length > 1 ? '（共 ' + keys.length + ' 笔）' : '', g = d.group, t;
    if (g === 'merge') { var m = S.manualById[d.into]; t = '→ 和 ' + (m ? mdhm(m.time) + ' ' + (m.cat || '') : '') + ' 的手记合并'; }
    else if (g === 'neutral') t = '→ 挪到不计入组';
    else if (g === 'excluded') t = '→ 不导入（勾掉了）';
    else if (g === 'refund') t = '→ 当作退款';
    else if (g === 'skip') t = '→ 跳过';
    else if (g === 'pending') t = '→ 留在待处理';
    else {
      var nc = (S.plan.sections.newCats || []).filter(function (x) { return x.on && x.name === d.cat; })[0];
      t = nc ? '→ 已归到新建的『' + d.cat + '』' : d.cat && d.cat !== '未分类' ? '→ 归到『' + d.cat + '』' : '→ 作为新增（未分类）';
    }
    // 跨步：这一行现在在哪一步要你定
    var at = null, its = S.view.items || {};
    MID.forEach(function (st) { if (!at && (its[st] || []).some(function (x) { return !x.done && x.keys.indexOf(d.key) >= 0; })) at = st; });
    if (at && (S.view.steps || []).indexOf(at) < 0) at = null;       // 那几件放在总览里了（只剩 1 步时）
    if (at) t += '，挪到第 ' + (S.view.steps.indexOf(at) + 1) + ' 步：' + STEP_NAME[at];
    return { t: t + more, step: at };
  }
  // 这一件能直接撤回的改动（没有就是 null）
  function undoOf(id) {
    var E = S.edits, k = id.slice(id.indexOf(':') + 1), kind = id.slice(0, id.indexOf(':'));
    if (kind === 'sum' && E.sums[k] !== undefined) return function () { delete E.sums[k]; };
    if (kind === 'cp' && E.cpCats[k]) return function () { delete E.cpCats[k]; delete S.view.seen['cp:' + k]; };
    if (kind === 'nc' && E.newCats[k]) return function () { delete E.newCats[k]; };
    if (kind === 'petty' && E.petty[k]) return function () { delete E.petty[k]; };
    if ((kind === 'ps' || kind === 'lc') && E.rows[k] && (E.rows[k].pick || E.rows[k].cat)) return function () { var e = E.rows[k]; delete e.pick; if (kind === 'lc') delete e.cat; if (!Object.keys(e).length) delete E.rows[k]; delete S.view.seen['keep:' + k]; };
    if (kind === 'ty' && S.types[k]) return function () { delete S.types[k]; S.needRerun = true; };
    if (kind === 'st' && S.statuses[k]) return function () { delete S.statuses[k]; S.needRerun = true; };
    return null;
  }
  function applyUndo(fn) { fn(); if (S.needRerun) { S.needRerun = false; rerun(); } else replan(); }
  // 一行「已处理」：名字 + 去处 + 改 / 撤回（跨步的「去看 ›」）
  function doneRow(x, isGone, onEdit) {
    var r = el('div', 'imp-done-row' + (isGone ? ' imp-moved' : '')); r.dataset.item = x.id;
    var g = el('div', 'grow'); g.appendChild(el('div', 'imp-done-label', x.label));
    var ds = destOf(x.keys); g.appendChild(el('div', 'imp-done-go', isGone ? ds.t : (x.look ? '→ 看过了' : ds.t)));
    r.appendChild(g);
    if (!isGone) r.appendChild(mk(true, x.look));
    if (ds.step && ds.step !== S.view.step) r.appendChild(btn('去看 ›', 'imp-redo imp-done-jump', function () { goStep(ds.step); }));
    else if (onEdit || x.keys.length) r.appendChild(btn('改', 'imp-redo imp-done-edit', function () { if (onEdit) onEdit(); else openSheet(x.keys[0]); }));
    var u = undoOf(x.id); if (u) r.appendChild(btn('撤回', 'imp-redo imp-done-undo', function () { applyUndo(u); }));
    return r;
  }
  // 卡片收尾：标题「待选 x / 共 y」；定了的挪进底部「已处理 N 件」（默认收起），不见了的也列在那里
  function foldCard(c, step) {
    var its = (S.view.items[step] || []).filter(function (x) { return cardOf(x.id, step) === c.id; });
    var gs = gone(step, S.view.items).filter(function (x) { return cardOf(x.id, step) === c.id; });
    var total = its.length + gs.length; if (!total) return;
    var left0 = its.filter(function (x) { return !x.done; }).length, doneN = total - left0;
    var h = c.querySelector('h4'); if (h) { var sp = el('span', 'imp-count', '待选 ' + left0 + ' / 共 ' + total); sp.dataset.left = left0; sp.dataset.total = total; h.appendChild(sp); }
    if (!doneN || (its.length === 1 && !gs.length && c.querySelectorAll('[data-item]').length === 0)) return;
    var open0 = !!(S.view.fold || {})[c.id];
    var fb = el('div', 'imp-fold-box'); fb.style.display = open0 ? '' : 'none';
    its.forEach(function (x) {
      if (!x.done) return;
      var node = Array.prototype.filter.call(c.querySelectorAll('[data-item]'), function (n) { return n.dataset.item === x.id; })[0];
      // 点一下就能改的那类行（按对方、推荐看一眼、金额、待你确认、提醒）：换成「名字 → 去处 · 改 / 撤回」一行，「改」照旧打开原来的选择
      if (node && TAP_KINDS[x.id.slice(0, x.id.indexOf(':'))]) {
        if (node.parentNode) node.parentNode.removeChild(node);
        var ed = function () { node.click(); }, dr = doneRow(x, false, ed);
        // 留着原来那行的类名和数据（整行点了照旧打开原来的选择）
        Array.prototype.forEach.call(node.classList, function (cn) { if (/^imp-(cp-row|pend-row|lowconf-row|amount-row|hint|tap)$/.test(cn)) dr.classList.add(cn); });
        Object.keys(node.dataset).forEach(function (k) { if (k !== 'item') dr.dataset[k] = node.dataset[k]; });
        dr.addEventListener('click', function (e) { if (e.target === dr || !e.target.closest('button')) ed(); });
        fb.appendChild(dr);
      }
      else if (node) fb.appendChild(node); else fb.appendChild(doneRow(x, false));
    });
    gs.forEach(function (x) { fb.appendChild(doneRow(x, true)); });
    var tg = btn('', 'imp-fold', function () { S.view.fold = S.view.fold || {}; S.view.fold[c.id] = !open0; render(); });
    tg.appendChild(el('span', 'imp-fold-n', '✓ 已处理 ' + doneN + ' 件')); tg.appendChild(el('span', 'grow', '')); tg.appendChild(el('span', null, open0 ? '收起 ▴' : '展开看 ▸'));
    var tail = c.lastElementChild && c.lastElementChild.classList.contains('imp-soft') ? c.lastElementChild : null;
    c.insertBefore(tg, tail); c.insertBefore(fb, tail);
  }
  // 重算以后：刚定下 / 刚挪走的那一件浮出提示「某某 已归到『X』· 查看」
  function changeToast(items) {
    var prev = S.view.prevDone; S.view.prevDone = {};
    var cur = {};
    MID.forEach(function (st) { (items[st] || []).forEach(function (x) { cur[st + '|' + x.id] = x; S.view.prevDone[st + '|' + x.id] = x.done; }); });
    if (!prev) return;
    var hit = null, hitDone = null;      // 挪走的优先（「某某 已归到『X』」），没有再说刚定下的那件
    Object.keys(prev).forEach(function (k) {
      if (prev[k]) return;
      var x = cur[k], st = k.slice(0, k.indexOf('|'));
      if (x && x.done && !x.look) { if (!hitDone) hitDone = { x: x, st: st, gone: false }; }
      else if (!x && !hit) { var e = ((S.view.ever || {})[st] || {})[k.slice(k.indexOf('|') + 1)]; if (e) hit = { x: e, st: st, gone: true }; }
    });
    hit = hit || hitDone;
    if (!hit) return;
    var ds = destOf(hit.x.keys);
    toast(cut(hit.x.label, 18) + ' ' + ds.t.replace(/^→ /, ''), null, function () { S.view.fold = S.view.fold || {}; S.view.fold[cardOf(hit.x.id, hit.st)] = true; if (S.view.step !== hit.st) goStep(hit.st); else render(); flashItem(hit.x.id); });
  }
  function flashItem(id) {
    var n = Array.prototype.filter.call(dom.body.querySelectorAll('[data-item]'), function (x) { return x.dataset.item === id; })[0]; if (!n) return;
    if (n.scrollIntoView) n.scrollIntoView({ block: 'center' });
    n.classList.add('imp-flash'); setTimeout(function () { n.classList.remove('imp-flash'); }, 1600);
  }
  // 总览「这次所有的改动（N 处）」：各步做过的每个选择（只看过的不算）和去处，加上在明细里单独改过的行
  function changeList() {
    var out = [], seenK = {};
    MID.forEach(function (st) {
      var m = (S.view.ever || {})[st] || {}, now = {};
      (S.view.items[st] || []).forEach(function (x) { now[x.id] = x; });
      Object.keys(m).forEach(function (id) {
        var x = now[id], e = m[id];
        if (x && (!x.done || x.look)) return;
        out.push({ st: st, x: x || e, gone: !x }); (e.keys || []).forEach(function (k) { seenK[k] = 1; });
      });
    });
    Object.keys(S.edits.rows).forEach(function (k) { if (!seenK[k] && rowByKey(k)) out.push({ st: null, x: { id: 'row:' + k, label: rowLabel(rowByKey(k)), keys: [k] } }); });
    return out;
  }
  // 推荐成这个新分类的那几行（给「新建分类」写会归进去哪几组、挪走以后写去处）
  function newCatKeys(p, name) {
    return p.rows.filter(function (d) { var r = d.item && d.item.rec; return d.src === 'row' && r && r.newCat === name; }).map(function (d) { return d.key; });
  }
  // 改回默认就把改动去掉（变回待选）：口径改回这一行原来的；新建分类改回原来的勾法
  function setModeEdit(k, m) {
    var d = rowByKey(k), e = S.edits.rows[k] || {};
    if (d && m === ((d.item && d.item.mode) || 'normal')) delete e.mode; else e.mode = m;
    if (Object.keys(e).length) S.edits.rows[k] = e; else delete S.edits.rows[k];
  }
  function setNewCat(x, v) {
    if (v.on === !!x.defaultOn && !v.into && !v.picked) delete S.edits.newCats[x.name]; else S.edits.newCats[x.name] = v;
  }
  // 1017-UI7：「已定」看这一件现在的状态（撤回、改回默认就变回待选）；几笔一组的写「部分已定 1/8」
  function pgState(g) {
    var E = S.edits, V = S.view.seen;
    var dec = g.keys.filter(function (k) { var d = rowByKey(k); return (E.rows[k] && E.rows[k].pick) || V['keep:' + k] || (d && d.group !== 'pending'); }).length;
    if (g.kind === 'byManual') return { done: !g.open || g.keys.some(function (k) { return E.rows[k] && E.rows[k].pick; }), part: null };
    return { done: dec === g.keys.length, part: dec && dec < g.keys.length ? dec + '/' + g.keys.length : null };
  }
  function trState(t) {
    var n = t.keys.filter(function (k) { var d = rowByKey(k); return d && d.mode === 'skip'; }).length;
    var done = !!S.view.seen['tr:' + t.id] || n === t.keys.length;
    return { done: done, part: !done && n ? n + '/' + t.keys.length : null, n: n };
  }
  function buildSteps(p) {
    var it = stepItems(p), mids = MID.filter(function (k) { return it[k].length; }), inline = null;
    if (mids.length === 1 && it[mids[0]].length <= INLINE_MAX) { inline = mids[0]; mids = []; }
    return { keys: ['check'].concat(mids, ['overview']), items: it, inline: inline };
  }
  function stepIndex() { return Math.max(0, (S.view.steps || []).indexOf(S.view.step)); }
  function goStep(key) {
    if (!S || S.phase !== 'confirm') return;
    S.view.step = key; S.view.notice = null;
    var tt = document.getElementById('impToast'); if (tt) tt.style.display = 'none';      // 换一步就把提示收掉
    dom.page.scrollTop = 0;
    render();
  }
  function nextStep() { var i = stepIndex(), k = S.view.steps[i + 1]; if (k) goStep(k); }
  function prevStep() { var i = stepIndex(); if (i > 0) goStep(S.view.steps[i - 1]); }
  function hideSteps() { if (dom && dom.steps) dom.steps.style.display = 'none'; }
  function paintSteps(keys, i) {
    var st = dom.steps; st.innerHTML = ''; st.style.display = '';
    var t = el('div', 'imp-steps-t', '第 ' + (i + 1) + ' 步 / 共 ' + keys.length + ' 步 · ' + STEP_NAME[keys[i]]); t.id = 'impStepTitle';
    var bar = el('div', 'imp-steps-bar');
    keys.forEach(function (k, j) { var d = el('i', j <= i ? 'on' : ''); bar.appendChild(d); });
    st.appendChild(t); st.appendChild(bar);
  }
  function render() {
    S.view.seen = S.view.seen || {}; S.view.more = S.view.more || {};
    if (S.view.recon) { renderRecon(); return; }
    var p = S.plan, info = buildSteps(p);
    S.view.items = info.items; S.view.inline = info.inline;
    remember(info.items);
    // 步数跟着方案变：多出 / 少了一步时提示一句，人留在当前这一步（当前这一步没事了也先留着，等你点下一步）
    var real = info.keys, prev = S.view.realKeys;
    if (prev && prev.join() !== real.join()) {
      var add = real.filter(function (k) { return prev.indexOf(k) < 0; }), gone = prev.filter(function (k) { return real.indexOf(k) < 0 && k !== S.view.step; });
      var msg = [];
      if (add.length) msg.push('多了一步：' + add.map(function (k) { return '「' + STEP_NAME[k] + '」'; }).join('、'));
      if (gone.length) msg.push('少了一步：' + gone.map(function (k) { return '「' + STEP_NAME[k] + '」'; }).join('、') + '（那一步没有要定的了）');
      if (msg.length) S.view.notice = msg.join('；');
    }
    S.view.realKeys = real;
    var keys = real.slice();
    if (!S.view.step) S.view.step = 'check';
    if (keys.indexOf(S.view.step) < 0) {          // 当前这一步没事了：留着它（排在原来的位置），离开以后就不出现了
      keys.push(S.view.step);
      keys.sort(function (a, b) { return STEP_ORDER.indexOf(a) - STEP_ORDER.indexOf(b); });
    }
    S.view.steps = keys;
    changeToast(info.items);
    var i = keys.indexOf(S.view.step);
    var y = dom.page.scrollTop;
    var b = dom.body; b.innerHTML = '';
    setHead('导入确认', '‹ 取消');
    paintSteps(keys, i);
    if (S.view.notice) { var nt = el('div', 'imp-notice', S.view.notice); nt.id = 'impStepNotice'; b.appendChild(nt); }
    var cards = renderDecide(p);
    var step = S.view.step;
    if (step === 'check') renderCheck(p, info);
    else if (step === 'overview') renderOverview(p, info, cards);
    else renderMid(step, p, info, cards);
    // 底部按钮：第 1 步「取消 / 下一步」，中间「上一步 / 下一步」，总览主按钮在上、「上一步 / 只对账」在最下面
    var next = btn('下一步 ›', 'ui-btn primary', function () { nextStep(); }); next.id = 'impNext';
    var prevB = btn('‹ 上一步', 'ui-btn', function () { prevStep(); }); prevB.id = 'impPrev';
    var cancel = dom.cancel; cancel.textContent = '取消';
    dom.recon.textContent = '只对账';
    if (step === 'overview') {
      dom.go.classList.add('ui-full');
      dom.go.textContent = (p.records + p.mergeM === 0 && p.counts.pending) ? '存下待处理 ' + p.counts.pending + ' 笔'
        : '新建 ' + p.records + ' 条记录，合并 ' + p.mergeM + ' 笔';      // 1016-G：写实际新建几条记录（分分捐、收款合并以后）
      dom.go.disabled = !p.canImport;
      dom.recon.disabled = !p.canImport || !Plan.missed(p).items.length;
      barSet(i > 0 ? [dom.go, prevB, dom.recon] : [dom.go, cancel, dom.recon]);
    } else {
      if (step === 'check' && p.blocking.length) next.disabled = true;
      barSet(i > 0 ? [prevB, next] : [cancel, next]);
    }
    dom.page.scrollTop = y;
  }
  function intro(main, sub) {
    var c = el('div', 'imp-intro'); c.id = 'impIntro';
    c.appendChild(el('div', 'imp-intro-t', main)); if (sub) c.appendChild(el('div', 'imp-soft', sub));
    dom.body.appendChild(c);
  }
  function left(list) { return list.filter(function (x) { return !x.done; }).length; }
  // 第 1 步：核对
  function renderCheck(p, info) {
    var b = dom.body;
    b.appendChild(renderFiles(p, 'check'));
    var c = el('div', 'imp-card'); c.id = 'impCheckSum';
    c.appendChild(el('h4', null, '这次大概'));
    var tot = p.files.reduce(function (s0, f) { return s0 + (f.fatal ? 0 : f.parsedTotal); }, 0);
    c.appendChild(el('div', 'imp-line', tot + ' 笔账单：新建约 ' + p.records + ' 条、和你记的合并 ' + p.mergeM + ' 笔' + (p.counts.skip ? '、跳过 ' + p.counts.skip + ' 笔' : '') + '。'));
    if (p.blocking.length) {
      c.appendChild(el('div', 'imp-line imp-bad', '有账单笔数对不上，先不能往下。换一份完整的账单再导，或者把有问题的那份去掉。'));
    } else {
      var mids = MID.filter(function (k) { return info.keys.indexOf(k) >= 0; });
      var n = mids.reduce(function (s0, k) { return s0 + info.items[k].length; }, 0);
      if (mids.length) {
        c.appendChild(el('div', 'imp-soft', '还有 ' + n + ' 件要你定，分 ' + mids.length + ' 步：'));
        mids.forEach(function (k) { var r = el('div', 'imp-row-opt'); r.appendChild(el('span', 'grow', '第 ' + (info.keys.indexOf(k) + 1) + ' 步 · ' + STEP_NAME[k])); r.appendChild(el('span', 'imp-soft', info.items[k].length + ' 件')); c.appendChild(r); });
      } else if (info.inline) {
        c.appendChild(el('div', 'imp-soft', '还有 ' + info.items[info.inline].length + ' 件要你定（' + STEP_NAME[info.inline] + '），放在最后一步一起看。'));
      } else c.appendChild(el('div', 'imp-soft', '没有要你定的，下一步看一眼就能导入。'));
      c.appendChild(el('div', 'imp-soft', '每一步都可以不动、直接下一步：不定的按默认（拿不准的先放进待处理，不进账本）。'));
    }
    b.appendChild(c);
  }
  // 中间几步：要你定的
  var STEP_INTRO = {
    match: function (n, l) { return ['有 ' + n + ' 件和你记的对不上' + (l ? '，还剩 ' + l + ' 件没定' : '，都定过了'), '选一笔就和手记合并；不选的先放进待处理，以后再定。']; },
    refund: function (n, l) { return ['退款和转账有 ' + n + ' 件' + (l ? '，还剩 ' + l + ' 件没定' : '，都定过了'), '转账往来可以标成不计入；找不到原单的退款先放进待处理，以后再挂。']; },
    cat: function (n, l) { return ['给 ' + n + ' 件选分类' + (l ? '，还剩 ' + l + ' 件没定' : '，都定过了'), '不选的照推荐导入；按对方选了的，以后同一个对方直接归过去。']; },
    amount: function (n, l) { return ['有 ' + n + ' 笔金额要你看一眼' + (l ? '，还剩 ' + l + ' 笔没看' : '，都看过了'), '分类照常推荐、钱照常导入，只是提醒你看一眼；不对就点开改。']; }
  };
  function stepCards(step, p, cards) {
    var out = [];
    var push = function (c) { if (c) out.push(c); };
    if (step === 'match') { push(cards.sums); push(cards.near); push(cards.pendGroups); push(pendCard(p, false)); }
    else if (step === 'refund') { push(cards.transfers); push(pendCard(p, true)); push(cards.refundHints); push(cards.receipt); push(cards.petty); push(incomeHint(p)); }
    else if (step === 'cat') { push(cards.newCats); push(cards.cpGroups); push(lowConfCard(p)); push(cards.types); }
    else if (step === 'amount') { push(cards.amounts); }
    return out;
  }
  function renderMid(step, p, info, cards) {
    var list = info.items[step] || [];
    if (!list.length) { intro('这一步没有要定的了', '点「下一步」接着看。'); return; }
    var t = STEP_INTRO[step](list.length, left(list)); intro(t[0], t[1]);
    stepCards(step, p, cards).forEach(function (c) { cardState(c); foldCard(c, step); dom.body.appendChild(c); });
  }
  // 单独一笔拿不准的（待你确认）：点一行打开详情选配哪条 / 作为新增 / 不要了
  function pendCard(p, refund) {
    var rows = pendSingles(p).filter(function (d) { return refundishRow(d) === refund; });
    if (!rows.length) return null;
    var key = refund ? 'pr' : 'ps';
    var c = el('div', 'imp-card'); c.id = refund ? 'impPendRefunds' : 'impPendSingles';
    c.appendChild(el('h4', null, (refund ? '没找到原单的退款' : '待你确认') + '（' + rows.length + ' 笔）'));
    var more = !!S.view.more[key];
    rows.forEach(function (d, i) {
      if (i >= MORE_N && !more) return;
      // 1017-UI8：一笔一块。还没定的：账单 + 最像的那条手记一张配对卡（「选这个」就合并），其他候选、作为新增、不要了点开详情；定了的收成一行
      var r = el('div', 'imp-row-opt imp-tap imp-pend-row'); r.dataset.key = d.key; r.dataset.item = 'ps:' + d.key; r.style.display = 'block';
      var e0 = S.edits.rows[d.key] || {}, done0 = !!e0.pick || !!S.view.seen['keep:' + d.key] || d.group !== 'pending';
      var hd = el('div', 'imp-pc-head'); hd.appendChild(el('span', 'grow imp-soft', d.reason || '')); hd.appendChild(mk(done0)); r.appendChild(hd);
      var c0 = (d.cands || [])[0], m0 = c0 && c0.record && !refund ? S.manualById[c0.record] : null;
      if (d.group !== 'pending' || done0) {
        var ch = el('div', 'imp-chosen'); var cg = el('span', 'grow');
        cg.appendChild(el('span', 'imp-ok-ico', '✓ 已选：')); cg.appendChild(document.createTextNode(fmtTime(d.time) + ' ' + (d.title || d.cp || '—') + ' ' + yuan(d.fen) + ' → ' + (e0.pick && e0.pick.record && S.manualById[e0.pick.record] ? '和 ' + mdhm(S.manualById[e0.pick.record].time) + ' 的手记合并' : S.plan.groupNames[d.group] + (d.autoNew ? '（候选被别处选走了）' : ''))));
        ch.appendChild(cg); ch.appendChild(btn('改', 'imp-redo imp-pend-redo', function (ev) { ev.stopPropagation(); openSheet(d.key); })); r.appendChild(ch);
      } else if (m0) {
        r.appendChild(pairCard({ lab: c0.early ? '可能是' : '最像', manual: m0, bills: [d], also: alsoOf(c0.record, { key: d.key }), pickCls: 'imp-pend-pick',
          onPick: function () { withClaim(c0.record, { key: d.key }, function () { setEdit(d.key, { pick: { record: c0.record } }); }); } }));
      } else r.appendChild(pairCard({ lab: '账单里的', bills: [d], noPick: true }));
      if (d.group === 'pending' && !done0) {
        var more0 = (d.cands || []).length - (m0 ? 1 : 0);
        var ob = btn((more0 > 0 ? '其他 ' + more0 + ' 条候选、' : '') + '作为新增 / 不要了 · 点开 ›', 'imp-link imp-pend-open', function (ev) { ev.stopPropagation(); openSheet(d.key); });
        r.appendChild(ob);
      }
      r.addEventListener('click', function (ev) { if (ev.target === r) openSheet(d.key); });
      c.appendChild(r);
    });
    if (rows.length > MORE_N) c.appendChild(moreBtn(key, rows.length - MORE_N, '笔'));
    c.appendChild(el('div', 'imp-soft', refund ? '点开挂到原单，或者作为新增 / 不要了；不选的先放进待处理。' : '点开选是哪一条手记，或者作为新增 / 不要了；不选的先放进待处理。'));
    return c;
  }
  // 推荐要你看一眼（把握低）：点一行直接选分类
  function lowConfCard(p) {
    var rows = lowConfRows(p);
    if (!rows.length) return null;
    var c = el('div', 'imp-card'); c.id = 'impLowConf';
    c.appendChild(el('h4', null, '推荐要你看一眼（把握低，' + rows.length + ' 笔）'));
    var more = !!S.view.more.lc;
    var cats = ['未分类'].concat(S.info.cats.filter(function (x) { return x !== '未分类'; }));
    p.sections.newCats.forEach(function (n) { if (n.on && cats.indexOf(n.name) < 0) cats.push(n.name); });
    rows.forEach(function (d, i) {
      if (i >= MORE_N && !more) return;
      var r = el('div', 'imp-row-opt imp-tap imp-lowconf-row'); r.dataset.key = d.key; r.dataset.item = 'lc:' + d.key;
      var g = el('div', 'grow'); g.appendChild(el('div', null, fmtTime(d.time) + ' · ' + (d.title || d.cp || '—') + ' · ' + yuan(d.fen) + ' 元'));
      g.appendChild(el('div', 'imp-soft', '推荐「' + (d.item.rec.cat || d.item.rec.want || '未分类') + '」：' + d.item.rec.reason)); r.appendChild(g);
      r.appendChild(el('span', 'imp-val', (d.cat || '未分类') + ' ›'));
      var done = !!(S.edits.rows[d.key] && S.edits.rows[d.key].cat) || !!S.view.seen['lc:' + d.key];
      r.appendChild(mk(done));
      r.addEventListener('click', function () {
        var list = cats.slice(); if (d.cat && list.indexOf(d.cat) < 0) list.push(d.cat);
        if (window.JiwenSheet) window.JiwenSheet.pick({ title: '这一笔归到哪个分类', sub: (d.title || d.cp || '') + ' · ' + yuan(d.fen) + ' 元', options: list.map(function (x) { return { value: x, label: x }; }), value: d.cat || '未分类', chips: true,
          onPick: function (v) { S.view.seen['lc:' + d.key] = true; if (v !== d.cat) setEdit(d.key, { cat: v }); else render(); } });
      });
      c.appendChild(r);
    });
    if (rows.length > MORE_N) c.appendChild(moreBtn('lc', rows.length - MORE_N, '笔'));
    c.appendChild(el('div', 'imp-soft', '只靠商品说明、或者对方是什么都卖的平台猜的分类。不改就照推荐导入。'));
    return c;
  }
  // 收入里有退款？（「当作退款，挂到某一笔」本来在每一笔收入的详情里；这一步出现时顺带提一句）
  function incomeHint(p) {
    var inc = p.rows.filter(function (d) { return d.src === 'row' && d.pio === 'income' && (d.group === 'add' || d.group === 'neutral') && !d.summary && !(d.item && d.item.group); });
    if (!inc.length) return null;
    var c = el('div', 'imp-card'); c.id = 'impIncomeHint';
    c.appendChild(el('div', 'imp-soft', '收入 ' + inc.length + ' 笔里要是有退款（AA 收回的钱、跨月退款），可以在总览「查看全部明细」里点那一笔，「当作退款，挂到某一笔」。'));
    return c;
  }
  // 最后一步：总览
  function renderOverview(p, info, cards) {
    var b = dom.body;
    if (info.inline) {
      var list = info.items[info.inline], t = STEP_INTRO[info.inline](list.length, left(list));
      intro(t[0], t[1]);
      stepCards(info.inline, p, cards).forEach(function (c) { cardState(c); foldCard(c, info.inline); b.appendChild(c); });
    } else intro('都看过了，确认一下就能导入');
    b.appendChild(renderSummary(p));
    // 1017-UI9：这次所有的改动（N 处）：各步做过的每个选择和去处，点「改」回那一步
    var cl = changeList();
    if (cl.length) {
      var cc = el('div', 'imp-card'); cc.id = 'impChanges';
      cc.appendChild(el('h4', null, '这次所有的改动（' + cl.length + ' 处）'));
      var cmore = !!S.view.more.chg;
      cl.forEach(function (c, i) {
        if (i >= MORE_N && !cmore) return;
        var r = el('div', 'imp-chg'); r.dataset.item = c.x.id;
        r.appendChild(el('span', 'imp-chg-k', c.st ? '第 ' + ((S.view.steps.indexOf(c.st) + 1) || S.view.steps.length) + ' 步' : '明细'));
        var g = el('div', 'grow'); g.appendChild(el('div', null, c.x.label)); g.appendChild(el('div', 'imp-soft', destOf(c.x.keys || []).t)); r.appendChild(g);
        r.appendChild(btn('改', 'imp-redo imp-chg-edit', function () { if (c.st && S.view.steps.indexOf(c.st) >= 0) goStep(c.st); else if (c.x.keys && c.x.keys[0]) openSheet(c.x.keys[0]); }));
        cc.appendChild(r);
      });
      if (cl.length > MORE_N) cc.appendChild(moreBtn('chg', cl.length - MORE_N, '处'));
      b.appendChild(cc);
    }
    b.appendChild(renderFiles(p, 'diff'));
    if (cards.notes) b.appendChild(cards.notes);
    b.appendChild(renderStorage(p));
    b.appendChild(renderDetails(p));
  }

  // ---------- 1016-Q：只对账 ----------
  // 只看漏记了哪些（「新增」组），勾几笔补进账本；其余一律不动（不合并、不登记、不标忽略、不进待处理），下次再导同一份文件结果不变
  function toggleRecon() {
    if (!S || S.phase !== 'confirm') return;
    S.view.recon = !S.view.recon;
    if (S.view.recon && !S.view.reconPick) S.view.reconPick = {};
    dom.page.scrollTop = 0;
    render();
  }
  function reconKeys() {
    var m = Plan.missed(S.plan), out = [];
    m.items.forEach(function (x) { if (S.view.reconPick[x.id]) out = out.concat(x.keys); });
    return out;
  }
  function renderRecon() {
    hideSteps();
    var b = dom.body, p = S.plan, m = Plan.missed(p); b.innerHTML = '';
    setHead('只对账', '‹ 返回');
    var c = el('div', 'imp-card'); c.id = 'impReconHead';
    c.appendChild(el('div', 'imp-line', '这段时间漏记了 ' + m.n + ' 笔，共 ' + yuan(m.out) + ' 元' + (m.inc ? '（另有收入 ' + yuan(m.inc) + ' 元）' : '') + '。'));
    c.appendChild(el('div', 'imp-soft', '勾上要补进账本的几笔，只写这几笔；其余什么都不改（不合并手记、不登记、不进待处理），下次再导同一份文件结果不变。'));
    b.appendChild(c);
    var list = el('div'); list.id = 'impReconList';
    var picked = 0, pickedFen = 0;
    m.items.forEach(function (x) {
      var r = el('label', 'imp-row-opt imp-tap imp-recon-row'); r.dataset.id = x.id;
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!S.view.reconPick[x.id];
      cb.addEventListener('change', function () { if (cb.checked) S.view.reconPick[x.id] = true; else delete S.view.reconPick[x.id]; render(); });
      r.appendChild(cb);
      r.appendChild(el('span', 'grow', fmtTime(x.time) + ' · ' + (x.cat || '未分类') + ' · ' + (x.title || '—')));
      r.appendChild(el('span', null, (x.type === 'income' ? '+' : '−') + yuan(x.fen)));
      list.appendChild(r);
      if (S.view.reconPick[x.id]) { picked += x.units; pickedFen += x.fen; }
    });
    if (!m.items.length) list.appendChild(el('div', 'imp-soft', '没有漏记的。'));
    b.appendChild(list);
    dom.go.classList.remove('ui-full');
    barSet([dom.recon, dom.go]);
    dom.recon.textContent = '‹ 返回';
    dom.recon.disabled = false;
    dom.go.textContent = '补进 ' + picked + ' 笔';
    dom.go.disabled = !picked;
  }

  // 1017-UI2：mode 'check'（第 1 步：来源、时间、上次导到哪天、笔数核对）/ 'diff'（总览：和账单统计的差额，默认收起）
  function renderFiles(p, mode) {
    var wrap = el('div'); wrap.id = 'impFiles';
    if (mode === 'diff') wrap.appendChild(el('div', 'imp-sec-t', '和账单统计的差额（点开看拆开的明细）'));
    p.files.forEach(function (f, i) {
      var c = el('div', 'imp-card'); c.dataset.file = i;
      if (f.fatal && mode === 'diff') return;
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
      if (mode !== 'diff') {
      var lt = S.lastTo && S.lastTo[f.app];
      if (lt) {
        var ln = el('div', 'imp-soft imp-last-to', f.range && f.range.to.slice(0, 10) <= lt
          ? '上次' + (APP[f.app] || '') + '导到 ' + lt + '，这份账单的时间都在那之前（导过的会自动跳过）'
          : '上次' + (APP[f.app] || '') + '导到 ' + lt + '，这之后的才是新的');
        c.appendChild(ln);
      }
      var chk;
      if (f.countOk === true) chk = el('div', 'imp-line imp-ok imp-check', '✓ 笔数和账单统计一致');
      else if (f.countOk === false) chk = el('div', 'imp-line imp-bad imp-check', '✗ 笔数和账单统计对不上：账单写着 ' + f.headerTotal + ' 笔，读出来 ' + f.parsedTotal + ' 笔，可能读漏了，这一份不能直接导入');
      else chk = el('div', 'imp-line imp-soft imp-check', '账单里没写总笔数，没法核对');
      c.appendChild(chk);
      if (f.errors) c.appendChild(el('div', 'imp-soft', '有 ' + f.errors + ' 行读不出来，在总览的明细里「出错」那一组'));
      wrap.appendChild(c); return;
      }
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
    // 1017-UI2：四格：新建、和手记合并、留在待处理、跳过；没定的待你确认写明留在待处理（不进账本）
    c.appendChild(el('h4', null, '这次会'));
    c.appendChild(tiles([['新建', p.records + ' 条'], ['和手记合并', p.mergeM + ' 笔'], ['留在待处理', (p.counts.pending || 0) + ' 笔'], ['跳过', (p.counts.skip || 0) + ' 笔']], 'impTiles'));
    if (p.counts.pending) { var pn = el('div', 'imp-pend-note', p.counts.pending + ' 笔拿不准的（待你确认里没定的）留在待处理、不进账本，以后在待处理页处理。'); pn.id = 'impPendNote'; c.appendChild(pn); }
    c.appendChild(el('div', 'imp-sec-t', '分组明细（点一个看是哪几笔）'));
    var chips = el('div', 'imp-chips');
    ['add', 'merge', 'pending', 'refund', 'neutral', 'skip', 'error', 'excluded'].forEach(function (g) {
      if (!p.counts[g] && (g === 'excluded' || g === 'error' || g === 'refund')) return;
      var ch = el('button', 'imp-chip'); ch.type = 'button'; ch.dataset.group = g;
      ch.appendChild(document.createTextNode(p.groupNames[g] + ' ')); ch.appendChild(el('b', null, String(p.counts[g])));
      ch.addEventListener('click', function () { S.view.details = true; S.view.open[g] = true; S.view.tag = null; render(); var h = document.getElementById('impG-' + g); if (h && h.scrollIntoView) h.scrollIntoView(); });
      chips.appendChild(ch);
    });
    c.appendChild(chips);
    if (p.sections.fees && p.sections.fees.length) { var fe = el('div', 'imp-soft', '零钱提现的服务费 ' + p.sections.fees.length + ' 笔，共 ' + yuan(p.sections.fees.reduce(function (s0, x) { return s0 + x.fen; }, 0)) + ' 元，单独记成支出（分类「' + p.sections.feeCat + '」；提现本身照旧不计入）'); fe.id = 'impFees'; c.appendChild(fe); }
    var ms = Plan.missed(p);
    if (ms.n) { var ml = el('div', 'imp-line', '这段时间漏记了 ' + ms.n + ' 笔，共 ' + yuan(ms.out) + ' 元' + (ms.inc ? '（另有收入 ' + yuan(ms.inc) + ' 元）' : '') + '（没和手记配上、要新建的）'); ml.id = 'impMissed'; c.appendChild(ml); }
    if (p.records !== p.importN) c.appendChild(el('div', 'imp-soft', '导入 ' + p.importN + ' 笔，分分捐、收款这类合并以后，实际新建 ' + p.records + ' 条记录'));
    if (p.blocking.length) c.appendChild(el('div', 'imp-line imp-bad', '有账单笔数对不上，先不能导入'));
    if (S.lost) c.appendChild(el('div', 'imp-soft', '有 ' + S.lost + ' 处改动因为重新计算失效了'));
    // 1016-O：原来在待处理里的，这次的文件给了结论
    var pr = S.matched && S.matched.stats && S.matched.stats.pendResolved;
    if (pr) { var prn = el('div', 'imp-line imp-ok', '原来待处理的 ' + pr + ' 笔有结论了，导入时从待处理里拿掉'); prn.id = 'impPendResolved'; c.appendChild(prn); }
    var cs = p.sections.comboSkippedDays || [];
    if (cs.length) { var cn = el('div', 'imp-soft', '有 ' + cs.length + ' 天账单太多（一天超过 120 笔），没试「几家不同商家加起来等于一条手记」的配法，只看了同一商家的几笔'); cn.id = 'impComboNote'; c.appendChild(cn); }
    return c;
  }

  function tiles(list, id) {
    var g = el('div', 'imp-tiles'); if (id) g.id = id;
    list.forEach(function (x) { var t = el('div', 'imp-tile'); t.appendChild(el('div', 'imp-soft', x[0])); t.appendChild(el('b', null, x[1])); g.appendChild(t); });
    return g;
  }

  // 要你定的几块，哪块没内容就不出现
  function renderDecide(p) {
    var out = {}, s = p.sections;   // 1017-UI2：按块名返回，分步页各取各的
    var catOpts = function () {
      var list = ['未分类'].concat(S.info.cats.filter(function (c) { return c !== '未分类'; }));
      s.newCats.forEach(function (n) { if (n.on && list.indexOf(n.name) < 0) list.push(n.name); });
      return list;
    };
    function select(opts, val, fn, cls, sub) {
      var se = el('select', cls || '');
      opts.forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; se.appendChild(op); });
      se.value = val; se.addEventListener('change', function () { fn(se.value); });
      return wrapSel(se, sub);
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
        var r = el('div', 'imp-row-opt'); var k = t.app + '|' + t.type; r.dataset.item = 'ty:' + k;
        r.appendChild(el('span', 'grow', '「' + t.type + '」（' + APP[t.app] + '）' + t.n + ' 笔，共 ' + yuan(t.fen) + ' 元'));
        r.appendChild(select([['', '照收支导入（放进其他）'], ['normal', '照收支导入'], ['transfer', '当转账（不计入）'], ['refund', '当退款挂到原单'], ['skip', '跳过']], S.types[k] || '',
          function (v) { if (v) S.types[k] = v; else delete S.types[k]; rerun(); }, 'imp-type-sel', '「' + t.type + '」（' + APP[t.app] + '）' + t.n + ' 笔'));
        r.appendChild(mk(!!S.types[k]));
        c.appendChild(r);
      });
      statusRows.forEach(function (t) {
        var r = el('div', 'imp-row-opt'); var k = t.app + '|' + t.status; r.dataset.item = 'st:' + k;
        r.appendChild(el('span', 'grow', '状态「' + t.status + '」（' + APP[t.app] + '）' + t.n + ' 笔'));
        r.appendChild(select([['', '导入（放进其他）'], ['import', '导入'], ['skip', '跳过']], S.statuses[k] || '',
          function (v) { if (v) S.statuses[k] = v; else delete S.statuses[k]; rerun(); }, 'imp-status-sel', '状态「' + t.status + '」（' + APP[t.app] + '）' + t.n + ' 笔'));
        r.appendChild(mk(!!S.statuses[k]));
        c.appendChild(r);
      });
      c.appendChild(el('div', 'imp-soft', '选了处理方式的，导入时记成规则，下次直接照办；不选的照收支导入、放进「其他」，下次还会问。'));
      out.types = c;
    }
    // 1.1（1016-Z）：金额要你看一眼（异常金额、大额）：点一行打开详情，在那里改分类 / 口径
    if (s.amountChecks && s.amountChecks.length) {
      var ac = el('div', 'imp-card'); ac.id = 'impAmounts';
      ac.appendChild(el('h4', null, '金额要你看一眼（' + s.amountChecks.length + ' 笔）'));
      s.amountChecks.forEach(function (x) {
        var r = el('div', 'imp-row-opt imp-tap imp-amount-row'); r.dataset.key = x.key; r.dataset.kind = x.kind; r.dataset.item = 'am:' + x.key;
        r.appendChild(el('span', 'grow', (x.cp || '—') + ' · ' + yuan(x.fen) + ' 元 → ' + (x.cat || '未分类') + (x.kind === 'abnormal' ? '？' : '') + ' 理由：' + x.why));
        r.appendChild(mk(!!S.view.seen['am:' + x.key] || !!S.edits.rows[x.key], true));
        r.addEventListener('click', function () { S.view.seen['am:' + x.key] = true; openSheet(x.key); });
        ac.appendChild(r);
      });
      ac.appendChild(el('div', 'imp-soft', '分类照常推荐、钱照常导入，只是提醒你看一眼；不对就点开改。'));
      out.amounts = ac;
    }
    // 1.1（1016-X）：金额相近、分类对得上，自动当作记过的
    if (s.nearMerged) {
      var nc0 = el('div', 'imp-card'); nc0.id = 'impNear';
      nc0.appendChild(el('h4', null, '金额差一点的，当作你记过的（' + s.nearMerged.n + ' 笔）'));
      nc0.appendChild(el('div', 'imp-line', s.nearMerged.n + ' 笔账单和手记日期挨着、分类一样，只是账单少一点（多半是立减、红包），已和手记合并。' +
        (s.nearMerged.pay ? '手记金额会改成实付。' : '手记比实付多 ' + yuan(s.nearMerged.fen) + ' 元，金额按手记的。')));
      nc0.querySelector('h4').appendChild(mk(!!S.view.seen.near || !!S.edits.nearPay, true));
      nc0.addEventListener('click', function () { if (!S.view.seen.near) { S.view.seen.near = true; render(); } });
      var nb0 = btn(s.nearMerged.pay ? '还是按手记金额' : '一键改成实付金额', 'imp-btn', function (e) { e.stopPropagation(); S.view.seen.near = true; S.edits.nearPay = !S.edits.nearPay; replan(); });
      nb0.id = 'impNearPay'; nb0.style.marginTop = '8px';
      // 1017-UI8：每一笔一张配对卡（只看）；多了先列 3 笔
      var nOpen = !!S.view.more.near;
      s.nearMerged.keys.forEach(function (k, i) {
        var d = rowByKey(k), m = d && S.manualById[d.into]; if (!m || (i >= 3 && !nOpen)) return;
        nc0.appendChild(pairCard({ manual: m, bills: [d], noPick: true, cls: 'imp-near-pc' }));
      });
      if (s.nearMerged.keys.length > 3) nc0.appendChild(moreBtn('near', s.nearMerged.keys.length - 3, '笔'));
      nc0.appendChild(nb0);
      out.near = nc0;
    }
    if (s.receipt) {
      var rc = el('div', 'imp-card'); rc.id = 'impReceipt';
      rc.appendChild(el('h4', null, '收款按天合并')); rc.lastChild.appendChild(mk(!!S.view.seen.receipt));
      rc.appendChild(el('div', 'imp-line', '收款 ' + s.receipt.n + ' 笔，共 ' + yuan(s.receipt.fen) + ' 元，看起来是收款账号。按天合成 ' + s.receipt.days + ' 条？'));
      var rr = el('div', 'imp-chips'); rr.style.marginTop = '8px';
      var yes = btn('按天合并', s.receipt.on ? 'imp-btn gold' : 'imp-btn', function () { S.view.seen.receipt = true; S.edits.receipt = true; replan(); }); yes.dataset.v = 'on';
      var no = btn('逐条导入', s.receipt.on ? 'imp-btn' : 'imp-btn gold', function () { S.view.seen.receipt = true; S.edits.receipt = false; replan(); }); no.dataset.v = 'off';
      rr.appendChild(yes); rr.appendChild(no); rc.appendChild(rr); out.receipt = rc;
    }
    if (s.petty.length) {
      var pc = el('div', 'imp-card'); pc.id = 'impPetty';
      pc.appendChild(el('h4', null, '疑似零碎扣款'));
      s.petty.forEach(function (x) {
        var r = el('label', 'imp-row-opt imp-tap'); r.dataset.item = 'petty:' + x.key; var cb = el('input'); cb.type = 'checkbox'; cb.checked = x.on;
        cb.addEventListener('change', function () { if (cb.checked) S.edits.petty[x.key] = true; else delete S.edits.petty[x.key]; replan(); });     // 改回默认（不合并）就变回待选
        r.appendChild(cb); r.appendChild(el('span', 'grow', x.cp + ' · ' + x.month + ' · ' + x.n + ' 笔 · 共 ' + yuan(x.fen) + ' 元 · 合成一条'));
        r.appendChild(mk(x.key in S.edits.petty));
        pc.appendChild(r);
      });
      out.petty = pc;
    }
    if (s.newCats.length) {
      var nc = el('div', 'imp-card'); nc.id = 'impNewCats';
      nc.appendChild(el('h4', null, '新建分类（' + s.newCats.length + '）'));
      s.newCats.forEach(function (x) {
        var r = el('div', 'imp-row-opt'); r.dataset.cat = x.name; r.dataset.item = 'nc:' + x.name;
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = x.on;
        cb.addEventListener('change', function () { setNewCat(x, { on: cb.checked, into: cb.checked ? null : (x.into || null), picked: !cb.checked && !!x.picked }); replan(); });
        var lb = el('label', 'grow imp-newcat-lb'); lb.style.display = 'flex'; lb.style.alignItems = 'center'; lb.style.gap = '8px'; lb.style.minHeight = '48px'; lb.style.cursor = 'pointer';
        lb.appendChild(cb);
        // 1017-UI9：写清会归进去哪几组（按对方）
        var into = {}; newCatKeys(p, x.name).forEach(function (k) { var d = rowByKey(k); if (!d) return; var cp0 = cpShow(d.cp) || '—'; into[cp0] = (into[cp0] || 0) + 1; });
        var lbt = el('span', null, '建「' + x.name + '」 ' + x.count + ' 笔'); var iw = Object.keys(into);
        var lbw = el('span'); lbw.appendChild(lbt); if (iw.length) lbw.appendChild(el('div', 'imp-soft imp-nc-into', (x.on ? '归进去的：' : '勾上会归进去：') + iw.slice(0, 4).map(function (k) { return k + '（' + into[k] + ' 笔）'; }).join('、') + (iw.length > 4 ? ' 等 ' + iw.length + ' 组' : '')));
        lb.appendChild(lbw); r.appendChild(lb);
        var opts = [['', '并到已有…']].concat(S.info.cats.map(function (c) { return [c, '并到「' + c + '」']; }));
        r.appendChild(select(opts, x.into || '', function (v) { setNewCat(x, v ? { on: false, into: v, picked: true } : { on: x.defaultOn, into: null, picked: false }); replan(); }, 'imp-into', '推荐的「' + x.name + '」你的存档里没有（' + x.count + ' 笔）'));
        r.appendChild(mk(x.name in S.edits.newCats));
        nc.appendChild(r);
      });
      out.newCats = nc;
    }
    if (s.cpGroups.length) {
      var gc = el('div', 'imp-card'); gc.id = 'impCpGroups';
      gc.appendChild(el('h4', null, '还没有分类的，按对方一组选一次（' + s.cpGroups.length + ' 组）'));
      s.cpGroups.forEach(function (g) {
        var r = el('div', 'imp-row-opt imp-tap imp-cp-row'); r.dataset.cp = g.cp; r.dataset.item = 'cp:' + g.cp;
        // 1016-Z1：规律说明「工作日中午 12 点左右」放在前面，帮你认出是谁（只是提示，不自动分类）
        var desc = g.cp + ' · ' + g.n + ' 笔 · 共 ' + yuan(g.fen) + ' 元' + (g.hint ? ' · ' + g.hint : '') + (g.n > 1 ? ' · 每笔 ' + (g.min === g.max ? yuan(g.min) : yuan(g.min) + '–' + yuan(g.max)) + ' 元' : '') + ' → 选个分类';
        r.appendChild(el('span', 'grow', desc));
        // 1017-UI2：整行都能点，点了弹选分类面板（选了同一个也算定过）；下拉框留在行里（藏着），照旧也能用它改
        var setCp = function (v) { S.view.seen['cp:' + g.cp] = true; if (v === '未分类') delete S.edits.cpCats[g.cp]; else S.edits.cpCats[g.cp] = v; replan(); };
        var sub0 = g.cp + ' · ' + g.n + ' 笔 · 共 ' + yuan(g.fen) + ' 元';
        var sw = select(catOpts().map(function (c) { return [c, c]; }), g.cat || '未分类', setCp, 'imp-cp-sel', sub0);
        sw.style.display = 'none'; r.appendChild(sw);
        r.appendChild(el('span', 'imp-val', (g.cat || '未分类') + ' ›'));
        r.appendChild(mk(g.cp in S.edits.cpCats || !!S.view.seen['cp:' + g.cp]));
        r.addEventListener('click', function () {
          if (window.JiwenSheet) window.JiwenSheet.pick({ title: SEL_TITLE['imp-cp-sel'], sub: sub0, options: catOpts().map(function (c) { return { value: c, label: c }; }), value: g.cat || '未分类', chips: true, onPick: setCp });
        });
        gc.appendChild(r);
      });
      gc.appendChild(el('div', 'imp-soft', '选了的导入时记成你的规则，以后同一个对方直接归过去（规则只管以后的导入，不改已经入账的）。'));
      out.cpGroups = gc;
    }
    // 多笔合一（1017-UI8：配对卡）。组里各种选法的手记一样时，「你记的」只在组顶上写一次；几笔加起来的、一笔账单的分开叫
    if (s.sums.length) {
      var sc = el('div', 'imp-card'); sc.id = 'impSums';
      sc.appendChild(el('h4', null, '几笔加起来正好是一条手记（' + s.sums.length + ' 组）'));
      s.sums.forEach(function (g) {
        var box = el('div', 'imp-row-opt imp-pc-group'); box.dataset.sum = g.id; box.dataset.item = 'sum:' + g.id; box.style.display = 'block';
        var same = g.options.every(function (o) { return o.record === g.options[0].record; }), m0 = S.manualById[g.options[0].record];
        var hd = el('div', 'imp-pc-head'); hd.appendChild(el('span', 'grow imp-pc-title', same ? '这条手记可能是哪几笔' : '这几笔账单配哪条手记'));
        hd.appendChild(mk(g.chosen !== null)); box.appendChild(hd);
        if (g.chosen !== null) {
          // 1017-UI7：已选的组收成一行「✓ 已选：…… · 改」
          var ch = el('div', 'imp-chosen'); var cg = el('span', 'grow');
          cg.appendChild(el('span', 'imp-ok-ico', '✓ 已选：')); cg.appendChild(document.createTextNode(g.chosen === 'none' ? '都不是，这几笔分开记（作为新增）' : g.options[g.chosen].text));
          ch.appendChild(cg); ch.appendChild(btn('改', 'imp-redo imp-sum-undo', function () { delete S.edits.sums[g.id]; replan(); }));
          box.appendChild(ch);
        } else {
          if (same && m0) box.appendChild(meBlock(m0));
          var nMain = g.options.filter(function (o) { return o.kind !== 'far'; }).length;
          if (g.suggest === null && nMain > 1) box.appendChild(el('div', 'imp-soft', '有 ' + nMain + ' 种选法，请你选一种：'));
          // 1017-UI4：跨天的选法排最后、默认收起（同一天的配法你不要时，跨天的也看得到）
          var farN = g.options.filter(function (o) { return o.kind === 'far'; }).length, farOpen = !!S.view.more['far:' + g.id], farBox = null, no = 0;
          g.options.forEach(function (o, i) {
            if (o.kind === 'far' && !farBox) {
              var ft = btn(farOpen ? '收起跨天的选法' : '还有 ' + farN + ' 种跨天的选法 ▸', 'imp-link imp-far-toggle', function () { S.view.more['far:' + g.id] = !farOpen; render(); });
              box.appendChild(ft);
              farBox = el('div', 'imp-far-box'); farBox.style.display = farOpen ? '' : 'none'; box.appendChild(farBox);
            }
            var ds = o.keys.map(rowByKey).filter(Boolean), m = S.manualById[o.record];
            var kindName = o.kind === 'far' ? '跨天 · 一笔账单' : o.keys.length > 1 ? '几笔加起来' : '一笔账单';
            var card = pairCard({ lab: (o.kind === 'far' ? '' : '选法 ' + (++no) + ' · ') + kindName + (g.suggest === i ? ' · 建议' : ''), sum: o.text,
              manual: m, showManual: !same, bills: ds, also: alsoOf(o.record, { sum: g.id }), cls: o.kind === 'far' ? 'imp-far-opt' : '',
              pickCls: 'imp-sum-pick', i: i, onPick: function () { withClaim(o.record, { sum: g.id }, function () { S.edits.sums[g.id] = i; replan(); }); } });
            (o.kind === 'far' ? farBox : box).appendChild(card);
          });
          box.appendChild(noneBtn('都不是，分开记', 'imp-sum-none', function () { S.edits.sums[g.id] = 'none'; replan(); }));
        }
        sc.appendChild(box);
      });
      sc.appendChild(el('div', 'imp-soft', '合并后这几笔的单号都登记到那条手记，手记金额不变；不选就一直留在待你确认里。'));
      out.sums = sc;
    }
    // 几笔账单抢同一条手记（按手记归组）；几笔几条互相都可能的，也在这里一笔一笔选
    var pgs = s.pendGroups.filter(function (g) { return g.kind !== 'byBill'; });
    if (pgs.length) {
      var gc2 = el('div', 'imp-card'); gc2.id = 'impPendGroups';
      gc2.appendChild(el('h4', null, '待你确认：几笔可能是同一条手记（' + pgs.length + ' 组）'));
      var pgMore = !!S.view.more.pg;
      pgs.forEach(function (g, gi) {
        if (gi >= MORE_N && !pgMore) return;
        var box = el('div', 'imp-row-opt'); box.dataset.pg = g.id; box.dataset.item = 'pg:' + g.id; box.style.display = 'block';
        var gst = pgState(g);
        box.appendChild(mk(gst.done, false, gst.part)); box.lastChild.style.float = 'right';
        box.appendChild(el('div', 'imp-line', g.text + (g.open ? '' : '（已定）')));
        // 1017-UI8：配对卡。按手记归组的「你记的」只在组顶上写一次，下面每笔账单一张卡；几笔几条互相都可能的，每笔点开在详情里选
        var gm = g.kind === 'byManual' ? S.manualById[g.records[0]] : null;
        if (gm) box.appendChild(meBlock(gm));
        g.keys.forEach(function (k) {
          var d = rowByKey(k); if (!d) return;
          var r = el('div', 'imp-sub-row imp-pc-row'); r.dataset.key = k; r.style.display = 'block';
          if (gm) {
            var mine = S.edits.rows[k] && S.edits.rows[k].pick && S.edits.rows[k].pick.record === g.records[0];
            r.appendChild(pairCard({ lab: d.group === 'pending' ? '一笔账单' : '一笔账单 · ' + S.plan.groupNames[d.group], manual: gm, showManual: false, bills: [d], picked: mine,
              dim: !mine && d.group !== 'pending', noPick: d.group !== 'pending' && !mine, pickCls: 'imp-pg-pick',
              onPick: function () { if (mine) return; withClaim(g.records[0], { key: k }, function () { setEdit(k, { pick: { record: g.records[0] } }); }); } }));
          } else {
            r.appendChild(pairCard({ lab: '一笔账单 · ' + S.plan.groupNames[d.group], bills: [d], noPick: d.group !== 'pending', pickText: '点开选是哪一条 ›', pickCls: 'imp-pg-open', onPick: function () { openSheet(k); } }));
          }
          box.appendChild(r);
        });
        var edited = g.keys.some(function (k) { return S.edits.rows[k] && S.edits.rows[k].pick; });
        if (g.open && !edited) box.appendChild(noneBtn('都不是，都作为新增', 'imp-pg-none', function () { g.keys.forEach(function (k) { var e = S.edits.rows[k] || (S.edits.rows[k] = {}); e.pick = 'new'; }); replan(); }));
        if (edited) box.appendChild(btn('重新选', 'imp-redo imp-pg-undo', function () { g.keys.forEach(function (k) { if (S.edits.rows[k]) { delete S.edits.rows[k].pick; if (!Object.keys(S.edits.rows[k]).length) delete S.edits.rows[k]; } }); replan(); }));
        gc2.appendChild(box);
      });
      if (pgs.length > MORE_N) gc2.appendChild(moreBtn('pg', pgs.length - MORE_N, '组'));
      gc2.appendChild(el('div', 'imp-soft', '选了一笔就和手记合并，同组其余的自动作为新增；不选就一直待处理。'));
      out.pendGroups = gc2;
    }
    // 转账往来
    if (s.transfers.length) {
      var tc = el('div', 'imp-card'); tc.id = 'impTransfers';
      tc.appendChild(el('h4', null, '转账往来（' + s.transfers.length + ' 段）'));
      var md = function (t) { return (+t.slice(5, 7)) + ' 月 ' + (+t.slice(8, 10)) + ' 日'; };
      var sign = function (f) { return (f > 0 ? '+' : f < 0 ? '−' : '') + yuan(Math.abs(f)); };
      s.transfers.forEach(function (t) {
        var box = el('div', 'imp-row-opt'); box.dataset.tr = t.id; box.dataset.item = 'tr:' + t.id; box.style.display = 'block';
        var ts = trState(t); box.appendChild(mk(ts.done, false, ts.part)); box.lastChild.style.float = 'right';
        box.appendChild(el('div', 'imp-line', md(t.from) + (t.to !== t.from ? ' 到 ' + md(t.to) : '') + ' · ' + t.n + ' 笔 · 转出 ' + yuan(t.out) + ' · 转入 ' + yuan(t.in) + ' · 净额 ' + sign(t.net)));
        t.people.forEach(function (x) { box.appendChild(el('div', 'imp-soft', '　' + x.cp + '：转出 ' + yuan(x.out) + '，转入 ' + yuan(x.in) + '，净额 ' + sign(x.net))); });
        t.keys.forEach(function (k) {
          var d = rowByKey(k); if (!d) return;
          var r = el('label', 'imp-sub-row'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = d.mode === 'skip'; cb.className = 'imp-tr-cb'; cb.dataset.key = k;
          cb.style.position = 'absolute'; cb.style.opacity = '0'; cb.style.width = '1px'; cb.style.height = '1px';   // 1016-H：用右边的开关代替，点整行都能切换
          cb.addEventListener('change', function () { setModeEdit(k, cb.checked ? 'skip' : 'normal'); replan(); });
          r.appendChild(cb); r.appendChild(el('span', 'grow', fmtTime(d.time) + ' · ' + (d.cp || '—') + ' · ' + (d.type === 'expense' ? '转出 ' : '转入 ') + yuan(d.fen)));
          var sw = el('span', 'imp-switch imp-tr-state' + (cb.checked ? ' on' : ''));
          sw.appendChild(el('i')); sw.appendChild(document.createTextNode(cb.checked ? '不计入' : '计入'));
          r.style.cursor = 'pointer'; r.appendChild(sw);
          box.appendChild(r);
        });
        var all = btn(t.allSkip ? '都恢复计入' : '这几笔都标成不计入', t.allSkip ? 'imp-btn' : 'imp-btn gold', function () {
          t.keys.forEach(function (k) { setModeEdit(k, t.allSkip ? 'normal' : 'skip'); });
          replan();
        });
        all.className += ' imp-tr-all'; all.style.marginTop = '8px'; box.appendChild(all);
        // 1017-UI7：只标了几笔的，点「其余都保持计入」这一段就算定完
        if (!ts.done && !t.allSkip) { var keep = btn('其余都保持计入', 'imp-btn imp-keep imp-tr-keep', function () { S.view.seen['tr:' + t.id] = true; render(); }); box.appendChild(keep); }
        else if (S.view.seen['tr:' + t.id] && ts.n < t.keys.length) box.appendChild(el('div', 'imp-soft', '其余 ' + (t.keys.length - ts.n) + ' 笔保持计入。'));
        tc.appendChild(box);
      });
      tc.appendChild(el('div', 'imp-soft', '只收微信转账、微信红包、支付宝转账红包，相邻两笔隔不到 3 天的串成一段。随礼、还钱这类来回抵掉的，可以标成不计入。'));
      out.transfers = tc;
    }
    // 全额退款的弱提醒（不算待处理，不用选）
    if (s.refundHints.length) {
      var hc = el('div', 'imp-card'); hc.id = 'impRefundHints';
      hc.appendChild(el('h4', null, '待你确认 · 看一眼就行（不用选）'));
      s.refundHints.forEach(function (h) {
        var l = el('div', 'imp-row-opt imp-tap imp-hint'); l.dataset.key = h.key; l.dataset.item = 'rh:' + h.key;
        l.appendChild(el('span', 'grow', h.text)); l.appendChild(mk(!!S.view.seen['rh:' + h.key], true));
        l.addEventListener('click', function () { S.view.seen['rh:' + h.key] = true; render(); });
        hc.appendChild(l);
      });
      out.refundHints = hc;
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
        var l = btn('· ' + x[1], 'imp-link'); l.dataset.tag = x[0]; l.style.display = 'flex'; l.style.width = '100%'; l.style.marginBottom = '8px';
        l.addEventListener('click', function () { S.view.details = true; S.view.tag = x[0]; render(); var d = document.getElementById('impDetails'); if (d && d.scrollIntoView) d.scrollIntoView(); });
        ncard.appendChild(l);
      });
      out.notes = ncard;
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
  var TAGNAME = { abnormal: '金额偏高', big: '大额', joined: '拼回', noNote: '单号带附加信息', overlap: '以前导入过这段', otherType: '新类型', otherStatus: '新状态', neutralVsNormal: '撞上普通手记' };
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
    // 1016-UI2：一行（时间、分类、标题、金额）和下面那行说明合成一块，整块都能点（至少 48px 高，块和块之间隔 8px）
    var item = el('div', 'imp-item'); box.appendChild(item);
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
    item.addEventListener('click', open);
    item.appendChild(row);
    var why = el('div', 'imp-why');
    var bits = [];
    if (d.reason) bits.push(d.reason);
    if (d.src === 'row' && (d.group === 'add' || d.group === 'neutral') && d.mode !== 'normal') bits.push('口径：' + MODENAME[d.mode]);
    why.textContent = bits.join(' · ');
    d.tags.forEach(function (t) { if (TAGNAME[t]) why.appendChild(el('span', 'imp-tag', TAGNAME[t])); });
    item.appendChild(why);
  }

  // 合并记录：一行，点开看每一笔
  function renderSumRow(box, g) {
    var item = el('div', 'imp-item'); box.appendChild(item);
    var row = el('div', 'al-row imp-sum-row'); row.dataset.sum = g.id;
    row.appendChild(el('span', 'al-time', ''));
    var c = el('span', 'al-cat'); c.appendChild(el('span', 'cat-tag', g.cat || '未分类')); row.appendChild(c);
    row.appendChild(el('span', 'al-remark', g.title));
    row.appendChild(el('span', 'al-go', S.view.sumOpen[g.id] ? '▾' : '▸'));
    var toggle = function () { S.view.sumOpen[g.id] = !S.view.sumOpen[g.id]; render(); };
    item.addEventListener('click', toggle);
    item.appendChild(row);
    var why = el('div', 'imp-why', (g.appendTo ? '并进这个月已有的那条记录' : '合成一条记录') + (g.kind === 'petty' ? ' · 分类默认「' + (g.cat || '其他') + '」' : ''));
    item.appendChild(why);
    if (!S.view.sumOpen[g.id]) return;
    var mb = el('div', 'imp-members'); mb.dataset.sum = g.id;
    g.members.forEach(function (d) {
      var r = el('div', 'imp-sub-row'); r.dataset.key = d.key;
      r.appendChild(el('span', 'grow', fmtTime(d.time) + ' · ' + (d.title || '—')));
      r.appendChild(el('span', null, (d.type === 'expense' ? '−' : '+') + yuan(d.fen)));
      r.style.cursor = 'pointer';
      r.addEventListener('click', function () { openSheet(d.key); });
      mb.appendChild(r);
    });
    box.appendChild(mb);
  }

  // ---------- 一行的详情：在这里改 ----------
  // ---------- 1017-UI4：一条手记只能配一笔 ----------
  //   这条手记你在别处亲手选过：先问一句「已经配给了某某，改配到这里吗？」，确认了才改，那边让出来；只是建议（没人选过）的直接配。
  //   被让出的那笔：回到待你确认，或者候选都被用了就自动作为新增，浮出提示一句
  function sumById(id) { return (S.matched.multiSums || []).filter(function (g) { return g.id === id; })[0] || null; }
  function rowLabel(d) { return d ? fmtTime(d.time) + ' ' + (d.title || d.cp || '—') + ' ' + yuan(d.fen) : ''; }
  function sumLabel(id) {
    var g = (S.plan.sections.sums || []).filter(function (x) { return x.id === id; })[0];
    return g ? g.keys.map(function (k) { return rowLabel(rowByKey(k)); }).join('、') : '';
  }
  function claimOf(record, here) {
    var E = S.edits, out = null;
    Object.keys(E.rows).forEach(function (k) { var p = E.rows[k].pick; if (!out && k !== here.key && p && p.record === record) out = { key: k }; });
    Object.keys(E.sums).forEach(function (id) {
      var i = E.sums[id], g = sumById(id);
      if (!out && id !== here.sum && typeof i === 'number' && g && g.options[i] && g.options[i].record === record) out = { sum: id };
    });
    return out;
  }
  // 这条手记还可能是哪几笔的（给「这条手记也可能是某某的」）
  function alsoOf(record, here) {
    var out = [];
    S.plan.rows.forEach(function (d) {
      if (d.key === here.key || d.src !== 'row' || d.bucket0 !== 'pending' || (d.item && d.item.msum) || !(d.cands || []).some(function (c) { return c.record === record; })) return;
      out.push(rowLabel(d) + ' 那笔');
    });
    (S.plan.sections.sums || []).forEach(function (g) {
      if (g.id === here.sum || !g.options.some(function (o) { return o.record === record; })) return;
      out.push('「' + sumLabel(g.id) + '」那组');
    });
    return out.length ? '这条手记也可能是 ' + out.slice(0, 2).join('、') + (out.length > 2 ? ' 等 ' + out.length + ' 处' : '') + '的' : '';
  }
  function withClaim(record, here, apply) {
    var o = claimOf(record, here);
    if (!o) { apply(); return; }
    var who = o.key ? rowLabel(rowByKey(o.key)) + ' 那笔' : '「' + sumLabel(o.sum) + '」那组';
    var go = function () {
      if (o.key) { var e = S.edits.rows[o.key]; delete e.pick; if (!Object.keys(e).length) delete S.edits.rows[o.key]; }
      else delete S.edits.sums[o.sum];
      apply();
      var keys = o.key ? [o.key] : ((S.plan.sections.sums || []).filter(function (x) { return x.id === o.sum; })[0] || { keys: [] }).keys;
      var toNew = keys.some(function (k) { var d = rowByKey(k); return d && d.group === 'add'; });
      toast(who + '让出了这条手记，' + (toNew ? '改成新增' : '回到待你确认'), keys[0]);
    };
    if (!window.JiwenSheet) { go(); return; }
    window.JiwenSheet.open({ title: '改配到这里？', onDismiss: function () {},
      body: function (box) { var t = el('div', 'imp-line', '这条手记已经配给了 ' + who + '，改配到这里吗？'); t.id = 'impClaimMsg'; t.style.fontSize = '15px'; box.appendChild(t); },
      foot: function (box, done) {
        var col = el('div', 'ui-stack');
        var yes = btn('改配到这里', 'ui-btn primary block', function () { done(); go(); }); yes.id = 'impClaimOk';
        var no = btn('不改', 'ui-btn block', function () { done(); }); no.id = 'impClaimNo';
        col.appendChild(yes); col.appendChild(no); box.appendChild(col);
      } });
  }
  // 底部浮出一句提示，几秒后消失
  var toastTimer = null;
  function toast(text, key, onView) {
    if (!dom) return;
    var t = document.getElementById('impToast');
    if (!t) { t = el('div', 'imp-toast'); t.id = 'impToast'; dom.page.appendChild(t); }
    t.innerHTML = ''; t.appendChild(el('span', 'grow imp-toast-t', text)); t.dataset.key = key || ''; t.style.display = 'flex';
    if (onView) { var v = btn('查看', 'imp-toast-view', function () { t.style.display = 'none'; onView(); }); v.id = 'impToastView'; t.appendChild(v); }
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, 4000);
  }
  function rowByKey(key) { var r = null; S.plan.rows.forEach(function (d) { if (d.key === key) r = d; }); return r; }
  function setEdit(key, patch) {
    if (patch.pick) delete S.view.seen['keep:' + key];
    var e = S.edits.rows[key] || {};
    Object.keys(patch).forEach(function (k) { if (patch[k] === null || patch[k] === undefined) delete e[k]; else e[k] = patch[k]; });
    if (Object.keys(e).length) S.edits.rows[key] = e; else delete S.edits.rows[key];
    replan();
    if (dom.sheetMask.style.display === 'flex') openSheet(key);
  }
  function openSheet(key) {
    var d = rowByKey(key); if (!d) return;
    var sh = dom.sheet; sh.innerHTML = '';
    sh.dataset.key = key; sh.dataset.mode = '';
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
      se.addEventListener('change', function () {
        var v = se.value;
        // 1016-Y：这一笔是按你的规则归的，改掉时问一句：只改这一条，还是以后都改（不默默覆盖，也不默默无视）
        if (d.catFrom === 'rec' && d.rec && d.rec.layer === 'rule' && d.rec.kw && v !== d.cat && v !== '未分类' && typeof window.customConfirm === 'function') {
          var kw = d.rec.kw;
          window.customConfirm('这笔是按你的规则「' + kw + ' → ' + d.cat + '」归的。\n\n只改这一条，还是以后「' + kw + '」都归到「' + v + '」？（选以后都改，这次同一条规则归的几笔也一起改）',
            function () { S.edits.ruleFix = S.edits.ruleFix || {}; S.edits.ruleFix[kw] = v; replan(); if (dom.sheetMask.style.display === 'flex') openSheet(key); },
            '改分类', { okText: '以后都改', cancelText: '只改这一条', onCancel: function () { setEdit(key, { cat: v }); } });
          return;
        }
        setEdit(key, { cat: v });
      });
      var l = el('div', 'imp-line imp-cat-line', '分类 '); var sw = wrapSel(se, (d.title || d.cp || '') + ' · ' + yuan(d.fen) + ' 元'); sw.style.flex = '1'; l.appendChild(sw); acts.appendChild(l);
    }
    if (d.canMode) {
      ['normal', 'flow', 'skip'].forEach(function (m) {
        var b = btn(MODENAME[m], d.mode === m ? 'imp-btn gold' : 'imp-btn', function () { setEdit(key, { mode: m }); });
        b.className += ' imp-mode'; b.dataset.mode = m; acts.appendChild(b);
      });
    }
    if (d.canExclude) { var x = btn('勾掉（不导入）', 'imp-btn', function () { setEdit(key, { exclude: true }); }); x.id = 'impExclude'; acts.appendChild(x); }
    if (d.canRestore) { var rs = btn('恢复', 'imp-btn', function () { setEdit(key, { exclude: null, pick: null }); }); rs.id = 'impRestore'; acts.appendChild(rs); }
    // 1.1（1016-Z2）：收入「当作退款，挂到某一笔」（AA 收回的钱、跨月退款、换渠道赔付，跨来源也能挂）
    var e0 = S.edits.rows[key] || {};
    if (d.pio === 'income' && (d.group === 'add' || d.group === 'neutral') && !d.summary && !(d.item && d.item.group)) {
      var ar = btn('当作退款，挂到某一笔', 'imp-btn', function () { openRefundPick(key); }); ar.id = 'impAsRefund'; acts.appendChild(ar);
    }
    if (d.asRefund && e0.asRefund) { var nr0 = btn('不挂了（照收入导入）', 'imp-btn', function () { setEdit(key, { asRefund: null }); }); nr0.id = 'impAsRefundOff'; acts.appendChild(nr0); }
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
        var pick, chosen, isRefund = d.why === 'refundcands' || !!c.row, card;
        if (c.record) pick = { record: c.record }; else pick = { row: c.row };
        chosen = d.item && S.edits.rows[key] && S.edits.rows[key].pick && JSON.stringify(S.edits.rows[key].pick) === JSON.stringify(pick);
        var onPick = function () { if (isRefund) setEdit(key, { pick: pick }); else withClaim(c.record, { key: key }, function () { setEdit(key, { pick: pick }); }); };
        var dis = !isRefund && used[c.record] && !chosen && !claimOf(c.record, { key: key });      // 这条手记已经和别的账单合并了（你亲手选的除外：点了先问）
        var bestLab = i === 0 && allC.length > 1 && !c.early;      // 1017-UI6：手记比账单早的不当「最像」
        if (c.record && S.manualById[c.record] && !isRefund) {
          // 1017-UI8：候选是手记 → 配对卡（这笔账单在详情顶上，卡里只写「你记的」和结论）
          card = pairCard({ manual: S.manualById[c.record], bills: [d], showManual: true, verdict: verdict(S.manualById[c.record], [d]), picked: chosen, dim: !!S.edits.rows[key] && !!S.edits.rows[key].pick && !chosen,
            also: alsoOf(c.record, { key: key }), pickCls: 'imp-pick', disabled: dis, onPick: onPick, lab: bestLab ? ' ' : '' });
          card.querySelector('.pc-bills') && card.querySelector('.pc-bills').remove();
        } else {
          var label;
          if (c.record) { var m = S.manualById[c.record]; label = m ? fmtTime(m.time) + ' · ' + (m.cat || '') + ' · ' + yuan(m.fen) + (m.cp ? ' · ' + m.cp : '') : '账本里的一条记录'; }
          else { var o = S.parsed.files[c.row.file].rows[c.row.row]; label = '这一批里的 ' + fmtTime(o.time) + ' · ' + (o.cp || '') + ' · ' + yuan(o.fen); }
          card = pairCard({ sum: label, noPick: false, picked: chosen, pickText: isRefund ? '挂到这笔' : '选这个', pickCls: 'imp-pick', disabled: dis, onPick: onPick, lab: bestLab ? ' ' : '' });
        }
        card.dataset.i = i;
        if (bestLab) { var lb0 = card.querySelector('.pc-lab'); lb0.textContent = ''; lb0.appendChild(el('span', 'imp-best', '最像')); }
        if (c.early && c.delay) card.insertBefore(el('div', 'imp-also imp-early', '可能是延后扣款（地铁、公交这类常常过几天才扣）'), card.querySelector('.pc-pick'));      // 早几天已经写在结论里
        sh.appendChild(card);
      });
    }
    if (d.canPick) {
      var a2 = el('div', 'acts');
      var nb = btn('作为新增', 'imp-btn', function () { setEdit(key, { pick: 'new' }); }); nb.id = 'impPickNew';
      var db = btn('不要了', 'imp-btn', function () { setEdit(key, { pick: 'drop' }); }); db.id = 'impPickDrop';
      var cb = btn('还是待确认', 'imp-btn', function () { S.view.seen['keep:' + key] = true; setEdit(key, { pick: null }); }); cb.id = 'impPickClear';     // 明确点了也算定了
      a2.appendChild(nb); a2.appendChild(db); a2.appendChild(cb); sh.appendChild(a2);
    }
    // 1016-G：为什么没配上（开发用：试过哪几条手记、每条卡在哪）
    if (d.item && d.item.trace && d.group !== 'merge') {
      // 1016-UI2：不再写「开发用」；默认收起，点开才看试过哪几条
      var tb = el('div', 'imp-trace'); tb.id = 'impTrace'; tb.style.marginTop = '8px';
      var tt = btn('为什么没配上手记 ▸', 'imp-link imp-trace-toggle', function () { var o = tb.classList.toggle('open'); tt.textContent = o ? '为什么没配上手记 ▾' : '为什么没配上手记 ▸'; });
      tb.appendChild(tt);
      var rows = el('div', 'imp-trace-rows'); tb.appendChild(rows);
      if (!d.item.trace.length) rows.appendChild(el('div', 'imp-soft', '当天没有金额相符的手记（前后 7 天、金额在三分之一到三倍之间的都没有）'));
      d.item.trace.forEach(function (x) {
        var rm = (S.manualById[x.record] || {}).remark;      // 1017-UI8：带上手记备注（太长截断）
        rows.appendChild(el('div', 'imp-soft imp-trace-row', fmtTime(x.time) + ' · ' + (x.cat || '未分类') + ' · ' + yuan(x.fen) + (rm ? ' · 备注：' + cut(rm, 16) : '') + '：' + x.why));
      });
      sh.appendChild(tb);
    }
    // 关闭按钮贴在详情底部（留出手势条），内容再长也不用滑到底才关得掉
    var ft = el('div', 'imp-sheet-foot'); var cl = btn('关闭', 'ui-btn block', closeSheet); cl.id = 'impSheetClose';
    ft.appendChild(cl); sh.appendChild(ft);
    dom.sheetMask.style.display = 'flex';
  }
  function closeSheet() { if (dom) dom.sheetMask.style.display = 'none'; }
  // 1016-Z2：挑一笔支出把这笔收入挂上去：这一批里的支出（时间更早、金额不小于它）+ 账本里的支出（主页面查：180 天内、时间更早、还没退完的够挂）
  function openRefundPick(key) {
    var d = rowByKey(key); if (!d) return;
    var sh = dom.sheet; sh.innerHTML = ''; sh.dataset.key = key; sh.dataset.mode = 'refundpick';
    sh.appendChild(el('h4', null, '把这笔 +' + yuan(d.fen) + ' 挂到哪一笔上？'));
    sh.appendChild(el('div', 'imp-soft', '挂上以后当作那笔的退款：分类、口径跟着那笔，那笔的支出减掉这些（比如 AA 收回的钱、跨月退款、换个渠道的赔付）。'));
    var list = el('div'); list.id = 'impRefundPick'; sh.appendChild(list);
    var pick = function (to) { S.edits.rows[key] = Object.assign({}, S.edits.rows[key] || {}, { asRefund: to }); replan(); openSheet(key); };
    var used = {};      // 这一批里已经挂了多少（分）
    S.plan.rows.forEach(function (r) { if (r.group === 'refund' && r.refundTo && r.refundTo.row && r.key !== key) { var k0 = r.refundTo.row.file + ':' + r.refundTo.row.row; used[k0] = (used[k0] || 0) + r.fen; } });
    var batch = S.plan.rows.filter(function (r) {
      return r.src === 'row' && r.pio === 'expense' && (r.group === 'add' || r.group === 'merge') && r.time <= d.time && r.fen - (used[r.file + ':' + r.row] || 0) >= d.fen;
    }).sort(function (a, b) { return a.time < b.time ? 1 : a.time > b.time ? -1 : 0; }).slice(0, 30);
    if (batch.length) list.appendChild(el('div', 'imp-line', '这一批里的'));
    batch.forEach(function (r) {
      var row = el('div', 'imp-row-opt imp-rp-row'); row.dataset.row = r.file + ':' + r.row;
      row.appendChild(el('span', 'grow', fmtTime(r.time) + ' · ' + (APP[r.app] || '') + ' · ' + (r.title || r.cp || '') + ' · ' + yuan(r.fen)));
      row.appendChild(btn('挂到这笔', 'imp-btn imp-rp-pick', function () { pick({ row: { file: r.file, row: r.row } }); }));
      list.appendChild(row);
    });
    var lw = el('div', 'imp-soft', '正在查账本里的…'); list.appendChild(lw);
    var my = runId;
    Promise.resolve().then(function () { return store().refundTargets({ time: d.time, fen: d.fen }); }).then(function (xs) {
      if (my !== runId || !S || sh.dataset.key !== key || sh.dataset.mode !== 'refundpick') return;
      lw.remove();
      if (xs.length) list.appendChild(el('div', 'imp-line', '账本里的'));
      xs.forEach(function (m) {
        var row = el('div', 'imp-row-opt imp-rp-rec'); row.dataset.id = m.id;
        row.appendChild(el('span', 'grow', fmtTime(m.time) + ' · ' + (m.cat || '未分类') + ' · ' + (m.remark || m.cp || '') + ' · ' + yuan(m.fen) + (m.left !== m.fen ? '（还能挂 ' + yuan(m.left) + '）' : '')));
        row.appendChild(btn('挂到这笔', 'imp-btn imp-rp-pick', function () { pick({ record: m.id }); }));
        list.appendChild(row);
      });
      if (!xs.length && !batch.length) list.appendChild(el('div', 'imp-soft', '没找到能挂的支出（要比这笔早、金额不少于它、180 天以内）。'));
    }, function () { lw.textContent = '查账本出错了'; });
    var ft = el('div', 'imp-sheet-foot'); var bk = btn('‹ 返回', 'ui-btn block', function () { openSheet(key); }); bk.id = 'impRefundPickBack';
    ft.appendChild(bk); sh.appendChild(ft);
    dom.sheetMask.style.display = 'flex';
  }

  // ---------- 底部按钮、复制 ----------
  var BUCKET_LINE = [['add', '新增'], ['merge', '和手记合并'], ['neutral', '不计入'], ['refund', '退款'], ['pending', '待处理'],
                     ['skip', '跳过'], ['error', '出错'], ['excluded', '你勾掉的']];
  function onImport(onlyKeys) {
    if (!S || !S.plan || !S.plan.canImport || S.phase !== 'confirm') return;
    if (!S.view.recon && S.view.step !== 'overview') return;      // 1017-UI2：只在总览（和只对账清单）能导入
    if (onlyKeys && !onlyKeys.length) return;
    var p = S.plan, my = runId;
    var batch = 'b' + Date.now().toString(36);
    var now = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var at = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var ws;
    try {
      ws = window.JiwenImportWrite.build({ parsed: S.parsed, matched: S.matched, info: S.info, manualById: S.manualById }, p,
                                         { batch: batch, at: at, cpCats: S.edits.cpCats, types: S.types, statuses: S.statuses, ruleFix: S.edits.ruleFix });
      if (onlyKeys) ws = window.JiwenImportWrite.onlyKeys(ws, onlyKeys, S.info);   // 1016-Q：只对账，只写勾选的几笔
    } catch (e) { alertMsg('整理要写的内容时出错了，什么都没写：' + (e && e.message || e)); return; }
    askImport(ws, p);     // 1017-UI2：先弹确认面板（写明这次会对账本做什么），再点一次「确认导入」才写
  }
  // 1017-UI2：导入确认面板：数字都从写入清单里数（和真正写进去的一样）；没有的项不显示
  function confirmLines(ws, p) {
    var L = [], n = function (f) { return Math.round(Number(f) * 100) || 0; };
    var exp = 0, inc = 0, nSkip = 0, nRef = 0, refFen = 0;
    ws.records.forEach(function (r) {
      var f = n(r.money);
      if (r.refundOf) { nRef++; refFen += f; return; }
      if (r.skip) { nSkip++; return; }
      if (r.type === 'income') inc += f; else exp += f;
    });
    var mp = [];
    if (exp) mp.push('支出 ' + yuan(exp) + ' 元'); if (inc) mp.push('收入 ' + yuan(inc) + ' 元'); if (nRef) mp.push('退款 ' + nRef + ' 笔 ' + yuan(refFen) + ' 元'); if (nSkip) mp.push(nSkip + ' 条不计入');
    if (ws.records.length) L.push(['新建 ' + ws.records.length + ' 条记录', mp.join('，')]);
    if (ws.only) {
      L.push(['只写这 ' + ws.records.length + ' 笔', '不合并手记、不登记其余的单号、不进待处理、不存规则；以后再导同一份账单，其余的照样会出现']);
      return L;
    }
    var merges = ws.changes.filter(function (c) { return c.kind === 'merge'; }), apps = ws.changes.filter(function (c) { return c.kind === 'append'; }), links = ws.changes.filter(function (c) { return c.kind === 'link'; });
    if (merges.length) {
      var money = merges.filter(function (c) { return c.set && c.set.money !== undefined; }).length;
      L.push(['和你记的 ' + merges.length + ' 条手记合并（账单 ' + p.mergeM + ' 笔）', '这几条手记的时间改成账单时间，分类、备注、金额不动' + (money ? '；其中 ' + money + ' 条的金额改成实付' : '')]);
    }
    if (apps.length) L.push(['往已有的汇总记录里追加 ' + apps.reduce(function (s0, c) { return s0 + (c.nos || []).length; }, 0) + ' 笔', '分分捐、收款这类，并进已有的那一条，金额跟着加']);
    if (links.length) L.push(['以前导入的 ' + links.length + ' 笔退款改挂到这次的原单上', '']);
    if (ws.catsAdded.length) L.push(['新建分类' + ws.catsAdded.map(function (c) { return '「' + c + '」'; }).join(''), '']);
    var rp = [];
    if (ws.rulesAdd.length) rp.push('存 ' + ws.rulesAdd.length + ' 条分类规则');
    if (ws.rulesChange && ws.rulesChange.length) rp.push('改 ' + ws.rulesChange.length + ' 条分类规则');
    if (ws.mapsAdd.length) rp.push('存 ' + ws.mapsAdd.length + ' 条分类对照');
    if (ws.typesAdd.length) rp.push('存 ' + ws.typesAdd.length + ' 条交易类型规则');
    if (rp.length) L.push([rp.join('、'), '以后导入时直接照办']);
    var pend = ws.pending.length, skip = (ws.counts && ws.counts.skip) || 0, excl = (ws.counts && ws.counts.excluded) || 0;
    var ps = [];
    if (pend) ps.push(pend + ' 笔留在待处理');
    if (skip) ps.push(skip + ' 笔跳过');
    if (excl) ps.push(excl + ' 笔你勾掉了');
    if (ps.length) L.push([ps.join('，'), pend ? '待处理的不进账本，以后在待处理页处理' : '跳过的不进账本']);
    if (ws.pendTaken && ws.pendTaken.length) L.push(['原来待处理的 ' + ws.pendTaken.length + ' 笔这次有了结论，从待处理里拿掉', '']);
    return L;
  }
  function askImport(ws, p) {
    if (!window.JiwenSheet) { commitWs(ws); return; }  // 主程序是老版本（没有共用面板）：照以前直接写
    window.JiwenSheet.open({ title: ws.only ? '确认补进账本' : '确认导入', onDismiss: function () {},
      busy: function () { return !!S && S.phase === 'writing'; },
      body: function (box) {
        var list = el('div', 'imp-cf-list'); list.id = 'impConfirmList';
        confirmLines(ws, p).forEach(function (x) {
          var r = el('div', 'imp-cf-item'); r.appendChild(el('i'));
          var t = el('div'); t.appendChild(el('b', null, x[0])); if (x[1]) t.appendChild(el('div', 'imp-soft', x[1]));
          r.appendChild(t); list.appendChild(r);
        });
        box.appendChild(list);
        var bk = el('div', 'imp-cf-bk', '导入前会自动备份，导错了可以在「导入记录」里整批撤销。'); box.appendChild(bk);
        var st = el('div', 'imp-soft'); st.id = 'impConfirmStatus'; st.style.marginTop = '8px'; box.appendChild(st);
      },
      foot: function (box, done) {
        var col = el('div', 'ui-stack');
        var ok = btn(ws.only ? '确认补进 ' + ws.records.length + ' 笔' : '确认导入', 'ui-btn primary block', function () {
          if (S.phase === 'writing') return;
          ok.disabled = true; back.disabled = true; ok.textContent = '正在导入…';
          commitWs(ws);
        }); ok.id = 'impConfirmOk';
        var back = btn('再看看', 'ui-btn block', function () { done(); }); back.id = 'impConfirmBack';
        col.appendChild(ok); col.appendChild(back); box.appendChild(col);
      } });
  }
  function commitWs(ws) {
    if (!S || S.phase !== 'confirm') return;
    var my = runId;
    S.phase = 'writing';
    var t0 = Date.now(), slowTimer = null;
    var status = function (text) { var e = document.getElementById('impConfirmStatus'); if (e) e.textContent = text; };
    status('准备写入…');
    var onProgress = function (stage, done, total) {
      if (my !== runId) return;
      if (stage === 'backup') {
        // 备份超过 2 秒才把这一段显示出来
        slowTimer = setTimeout(function () { status('备份导入前的账本…（大账本要多等一会儿）'); }, 2000);
      } else if (stage === 'build') { if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; } status('整理记录…' + (total ? ' ' + done + ' / ' + total : '')); }
      else if (stage === 'write') { if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; } status('写入账本…'); }
    };
    store().commit(ws, { ver: S.info.ver, onProgress: onProgress }).then(function (r) {
      if (slowTimer) clearTimeout(slowTimer);
      if (my !== runId || !S) return;
      S.phase = 'done'; S.result = { ws: ws, r: r, ms: Date.now() - t0 };
      sheetClose();
      dom.prog.style.display = 'none';
      renderResult();
    }, function (e) {
      if (slowTimer) clearTimeout(slowTimer);
      if (my !== runId || !S) return;
      S.phase = 'confirm';
      sheetClose();
      dom.prog.style.display = 'none';
      var code = e && (e.code || e.message);
      if (code === 'stale') { alertMsg('账本在这期间有改动，方案已经不是最新的，重新算一遍。什么都没写。'); rerun(); return; }
      if (code === 'nospace') { alertMsg('手机剩余空间放不下导入前的备份（大约要 ' + Math.ceil(e.need / 1048576) + ' MB，剩 ' + Math.floor(e.free / 1048576) + ' MB），这次没有导入，账本没动。'); return; }
      if (code === 'quota') { alertMsg('存储空间满了，没写进去，账本没动。'); return; }
      alertMsg('写入失败，账本没动：' + (code || e));
    });
  }
  // ---------- 结果页 ----------
  function renderResult() {
    hideSteps();
    var b = dom.body, res = S.result, c = res.ws.counts, only = !!res.ws.only; b.innerHTML = '';
    setHead('导入完成', '‹ 返回');
    // 1017-UI3：最上面一个大对勾 + 一句话；下面四格（和总览、确认面板一样）；还有待处理单独一块；接下来可以；撤销的说明放最后
    var wrap = el('div'); wrap.id = 'impResult';
    var hero = el('div', 'imp-res-hero');
    hero.appendChild(el('div', 'imp-res-ok', '✓'));
    hero.appendChild(el('div', 'imp-res-title', only ? '只对账：补进了 ' + res.r.added + ' 条记录' : '已写进账本'));
    var log = res.ws.log || {}, rng = log.from ? ' · ' + log.from + ' 至 ' + (log.to || '').slice(5) : '';
    hero.appendChild(el('div', 'imp-soft', appNames(log.apps) + rng + ' · 用时 ' + (res.ms / 1000).toFixed(1) + ' 秒'));
    wrap.appendChild(hero);
    var card = el('div', 'imp-card');
    if (only) {
      card.appendChild(el('div', 'imp-line imp-res-only', '只写了你勾选的 ' + c.add + ' 笔，其余什么都没改。'));
    } else {
      card.appendChild(tiles([['新建', (res.r.added !== undefined ? res.r.added : c.add) + ' 条'], ['和手记合并', (c.merge || 0) + ' 笔'], ['留在待处理', (c.pending || 0) + ' 笔'], ['跳过', (c.skip || 0) + ' 笔']], 'impResTiles'));
      var sum = 0, parts = [];
      BUCKET_LINE.forEach(function (x) { var n = c[x[0]] || 0; sum += n; if (n) parts.push(x[1] + ' ' + n); });
      var tl = el('div', 'imp-line imp-res-total' + (sum === res.ws.total ? '' : ' imp-bad'),
        sum === res.ws.total ? '文件里共 ' + res.ws.total + ' 笔，都对上了（' + parts.join('、') + '）。'
          : '合计 ' + sum + ' 笔，文件里共 ' + res.ws.total + ' 笔（对不上，请截图发给开发者）');
      card.appendChild(tl);
      if (res.r.changed) card.appendChild(el('div', 'imp-soft', '改了 ' + res.r.changed + ' 条以前的记录（合并的手记、追加的合并记录）。'));
      if (res.ws.learnedN) card.appendChild(el('div', 'imp-soft imp-res-learned', '从合并里学到了 ' + res.ws.learnedN + ' 条规则（同一个对方合并上 2 次以上、分类一致），以后直接用。'));
      if (res.ws.rulesChange && res.ws.rulesChange.length) card.appendChild(el('div', 'imp-soft imp-res-rulefix', '改了你的 ' + res.ws.rulesChange.length + ' 条规则：' + res.ws.rulesChange.map(function (x) { return x.kw + ' → ' + x.to; }).join('，')));
      var nmr = S.plan && S.plan.sections && S.plan.sections.nearMerged;
      if (nmr) card.appendChild(el('div', 'imp-soft imp-res-near', nmr.pay ? nmr.n + ' 笔金额差一点的手记已改成实付金额。' : nmr.n + ' 笔手记比实付多 ' + yuan(nmr.fen) + ' 元，多半是立减。'));
    }
    wrap.appendChild(card);
    if (c.pending) {
      var pc = el('div', 'imp-card'); pc.id = 'impResPend';
      pc.appendChild(el('div', 'imp-soft', '导入时拿不准的没进账本，存在待处理里，有空再定。'));
      var pl = btn('还有 ' + c.pending + ' 笔待处理，去处理 ›', 'ui-btn block', function () { openPending(); }); pl.id = 'impResPending'; pl.style.marginTop = '8px'; pc.appendChild(pl);
      wrap.appendChild(pc);
    }
    b.appendChild(wrap);
    // 1016-T：导完指下一步
    var nx = el('div', 'imp-card'); nx.id = 'impNext';
    nx.appendChild(el('h4', null, '接下来可以'));
    var nr = el('div', 'ui-stack');
    var goNext = function (k) { return function () { close(); var N = window.JiwenImportNext; if (N && N[k]) N[k](); }; };
    var n1 = btn('去看统计 ›', 'ui-btn block', goNext('stats')); n1.id = 'impNextStats';
    var n2 = btn('按过去几个月设预算 ›', 'ui-btn block', goNext('budget')); n2.id = 'impNextBudget';
    var n3 = btn('补一笔期初余额 ›', 'ui-btn block', goNext('opening')); n3.id = 'impNextOpening';
    nr.appendChild(n1); nr.appendChild(n2); nr.appendChild(n3); nx.appendChild(nr);
    nx.appendChild(el('div', 'imp-soft', '导进来的只是这段时间的收支差额，不等于钱包里的实际余额。想让结余对上，补一笔「只算结余」的期初余额（不算收入）。'));
    b.appendChild(nx);
    var bk = el('div', 'imp-card');
    bk.appendChild(el('div', 'imp-soft', '写之前自动备份了一份。导错了可以点下面「撤销这次导入」整批撤销，以后也能在「设置 → 导入记录」里撤销。'));
    bk.appendChild(el('div', 'imp-soft imp-res-batch', '这次导入的编号 ' + res.ws.batch + '（出问题时告诉开发者）'));   // 1016-UI5：「批次号」是开发用语
    b.appendChild(bk);
    // 底部：「回到账本」在上、最显眼；「撤销这次导入」放最下面（返回、撤销这类放最下面），提醒色
    var go = btn('回到账本', 'ui-btn primary ui-full', function () {
      close();
      var tb = document.querySelector('.tab-btn[data-tab="ledger"]'); if (tb) tb.click();
    });
    go.id = 'impBackToLedger';
    var un = btn('撤销这次导入', 'ui-btn danger ui-full', function () { undoBatch(res.ws.batch); });
    un.id = 'impUndoThis';
    barSet([go, un]);
    dom.page.scrollTop = 0;
  }

  // ---------- 1016-L：导入记录、撤销（⑦b）----------
  // 「设置 → 导入记录」：最近 10 次（新的在上），每次右侧「撤销」。notice：顶上的一行提示（撤销成功后「已撤销，删了 x 条、还原了 y 条」）
  function appNames(apps) { return (apps || []).map(function (x) { return APP[x] || x; }).join(' + ') || '账单'; }
  function openLogs(notice) {
    build();
    var my = ++runId;
    S = { phase: 'logs', view: {} };
    hideSteps(); closePicker();
    try { dom.archive.textContent = '存档「' + store().archiveInfo().name + '」'; } catch (_) { dom.archive.textContent = ''; }
    setHead('导入记录', '‹ 返回');
    dom.page.style.display = 'block'; barSet([closeBtn()]);
    dom.prog.style.display = 'none'; dom.sheetMask.style.display = 'none';
    dom.body.innerHTML = '';
    if (notice) { var nt = el('div', 'imp-card imp-line imp-ok', notice); nt.id = 'impUndoNotice'; dom.body.appendChild(nt); }
    var loading = el('div', 'imp-soft', '正在读导入记录…'); dom.body.appendChild(loading);
    return Promise.all([store().importsRead(), store().pendingRead().catch(function () { return []; })]).then(function (r) {
      if (my !== runId || !S) return;
      loading.remove();
      renderLogs(r[0].slice().reverse(), r[1]);
    }, function (e) {
      if (my !== runId || !S) return;
      loading.textContent = '读不出导入记录：' + (e && (e.code || e.message) || e);
    });
  }
  function renderLogs(logs, pend) {
    pend = pend || [];
    var nb = {}; pend.forEach(function (x) { nb[x.b] = (nb[x.b] || 0) + 1; });
    var c = el('div', 'imp-card imp-push'); c.id = 'impLogs';     // 1016-UI2：记录少时整块落到下面，「撤销」够得着
    c.appendChild(el('h4', null, '最近的导入（只保留 10 次）'));
    if (!logs.length) c.appendChild(el('div', 'imp-soft', '这个存档还没有导入记录。'));
    logs.forEach(function (l) {
      var r = el('div', 'imp-row-opt imp-log'); r.dataset.batch = l.b;
      var g = el('div', 'grow');
      g.appendChild(el('div', 'imp-line', String(l.at || '').replace('T', ' ') + ' · ' + appNames(l.apps) + (l.only ? ' · 只对账' : '')));
      var nAdd = (l.add || []).length, nChg = (l.chg || []).length;
      g.appendChild(el('div', 'imp-soft', '账单 ' + String(l.from || '').slice(0, 10) + ' 至 ' + String(l.to || '').slice(0, 10)
        + ' · 新建 ' + nAdd + ' 条' + (nChg ? ' · 改了 ' + nChg + ' 条以前的记录' : '') + (nb[l.b] ? ' · 待处理 ' + nb[l.b] + ' 笔' : '')));
      r.appendChild(g);
      var u = btn('撤销', 'imp-btn imp-log-undo', function () { undoBatch(l.b); }); u.style.minWidth = '64px';
      r.appendChild(u);
      c.appendChild(r);
    });
    dom.body.appendChild(c);
    // 待处理的入口放在记录下面（离拇指近）
    if (pend.length) {
      var pc = el('div', 'imp-card');
      pc.appendChild(el('div', 'imp-soft', '导入时拿不准、没进账本的'));
      var pb = btn('待处理 ' + pend.length + ' 笔，去处理 ›', 'ui-btn block', function () { openPending(); }); pb.id = 'impLogsPending'; pb.style.marginTop = '6px';
      pc.appendChild(pb); dom.body.appendChild(pc);
    }
  }
  // ---------- 第二期：管理导入规则 ----------
  // 你的分类规则（关键词 → 分类，关键词越长越先用）、分类对照（推荐分类 → 你的分类）、类型规则（没见过的交易类型 / 状态怎么处理）。
  // 每改一下就存一次（只改存档设置里的规则，不动已经入账的记录）。内置词表不在这里（看不到、改不了）。
  var TYPE_AS_NAME = { normal: '照收支导入', transfer: '当转账（不计入）', refund: '当退款挂到原单', skip: '跳过', import: '导入' };
  function openRules(notice) {
    build();
    runId++;
    S = { phase: 'rules', view: {} };
    hideSteps(); closePicker();
    var info; try { info = store().archiveInfo(); } catch (e) { alertMsg('读不出存档：' + (e && (e.code || e.message) || e)); return; }
    S.info = info;
    dom.archive.textContent = '存档「' + info.name + '」';
    setHead('管理导入规则', '‹ 返回');
    dom.page.style.display = 'block'; barSet([closeBtn()]); dom.prog.style.display = 'none'; dom.sheetMask.style.display = 'none';
    var b = dom.body; b.innerHTML = '';
    if (notice) { var nt = el('div', 'imp-card imp-line imp-ok', notice); nt.id = 'impRulesNotice'; b.appendChild(nt); }
    var rules = { cat: (info.catRules || []).slice(), type: (info.typeRules || []).slice(), map: (info.catMaps || []).slice() };
    var catSel = function (val, fn, cls) {
      var se = el('select', cls || '');
      info.cats.filter(function (c) { return c !== '未分类'; }).forEach(function (c) { var o = el('option', null, c); o.value = c; se.appendChild(o); });
      if (val) se.value = val;
      se.addEventListener('change', function () { fn(se.value); });
      return se;
    };
    var save = function (next, msg) {
      store().rulesSave(next).then(function () { openRules(msg); }, function (e) { alertMsg('没存上：' + (e && (e.code || e.message) || e), '管理导入规则'); });
    };
    // 分类规则
    var c1 = el('div', 'imp-card'); c1.id = 'impRulesCat';
    c1.appendChild(el('h4', null, '分类规则（' + rules.cat.length + '）'));
    c1.appendChild(el('div', 'imp-soft', '交易对方里有这个词，就归到这个分类。导入时你选过的、从合并里学到的都在这里；只管以后的导入。'));
    rules.cat.forEach(function (r, i) {
      var row = el('div', 'imp-row-opt imp-rule-row'); row.dataset.kw = r.kw;
      row.appendChild(el('span', 'grow', '「' + r.kw + '」→'));
      row.appendChild(wrapSel(catSel(r.cat, function (v) { var n = rules.cat.slice(); n[i] = { kw: r.kw, cat: v }; save(Object.assign({}, rules, { cat: n }), '已改：「' + r.kw + '」→ ' + v); }, 'imp-rule-cat'), '交易对方里有「' + r.kw + '」的'));
      row.appendChild(btn('删除', 'imp-btn imp-rule-del', function () { save(Object.assign({}, rules, { cat: rules.cat.filter(function (_, k) { return k !== i; }) }), '已删：「' + r.kw + '」'); }));
      c1.appendChild(row);
    });
    var add = el('div', 'imp-row-opt'); add.id = 'impRuleAdd';
    var kw = el('input'); kw.type = 'text'; kw.placeholder = '交易对方里的词'; kw.maxLength = 32; kw.id = 'impRuleKw'; kw.style.flex = '1 1 8em'; kw.style.minWidth = '0';
    var ac = catSel(null, function () {}, 'imp-rule-newcat'); ac.id = 'impRuleNewCat';
    add.appendChild(kw); add.appendChild(wrapSel(ac));
    var ab = btn('添加', 'imp-btn gold', function () {
      var k = kw.value.trim();
      if (!k) { alertMsg('先写一个词。', '管理导入规则'); return; }
      if (rules.cat.some(function (r) { return r.kw === k; })) { alertMsg('「' + k + '」已经有规则了，在上面改它的分类就行。', '管理导入规则'); return; }
      save(Object.assign({}, rules, { cat: rules.cat.concat([{ kw: k, cat: ac.value }]) }), '已加：「' + k + '」→ ' + ac.value);
    }); ab.id = 'impRuleAddBtn';
    add.appendChild(ab);
    b.appendChild(c1);
    // 分类对照
    var c2 = el('div', 'imp-card'); c2.id = 'impRulesMap';
    c2.appendChild(el('h4', null, '分类对照（' + rules.map.length + '）'));
    c2.appendChild(el('div', 'imp-soft', '推荐的分类在你的存档里没有时，归到哪个分类（导入时在「新建分类」里选过「并到」的）。'));
    if (!rules.map.length) c2.appendChild(el('div', 'imp-soft', '还没有。'));
    rules.map.forEach(function (m, i) {
      var row = el('div', 'imp-row-opt imp-map-row'); row.dataset.from = m.from;
      row.appendChild(el('span', 'grow', '推荐「' + m.from + '」→'));
      row.appendChild(wrapSel(catSel(m.cat, function (v) { var n = rules.map.slice(); n[i] = { from: m.from, cat: v }; save(Object.assign({}, rules, { map: n }), '已改：推荐「' + m.from + '」→ ' + v); }, 'imp-map-cat'), '推荐「' + m.from + '」落不到你的分类时'));
      row.appendChild(btn('删除', 'imp-btn imp-map-del', function () { save(Object.assign({}, rules, { map: rules.map.filter(function (_, k) { return k !== i; }) }), '已删：推荐「' + m.from + '」的对照'); }));
      c2.appendChild(row);
    });
    b.appendChild(c2);
    // 类型规则
    var c3 = el('div', 'imp-card'); c3.id = 'impRulesType';
    c3.appendChild(el('h4', null, '交易类型 / 状态规则（' + rules.type.length + '）'));
    if (!rules.type.length) c3.appendChild(el('div', 'imp-soft', '还没有。导入时「没见过的交易类型 / 状态」选过处理方式的会记在这里。'));
    rules.type.forEach(function (r, i) {
      var row = el('div', 'imp-row-opt imp-type-row');
      row.appendChild(el('span', 'grow', (APP[r.app] || r.app) + ' · ' + (r.type !== undefined ? '类型「' + r.type + '」' : '状态「' + r.status + '」') + ' → ' + (TYPE_AS_NAME[r.as] || r.as)));
      row.appendChild(btn('删除', 'imp-btn imp-type-del', function () { save(Object.assign({}, rules, { type: rules.type.filter(function (_, k) { return k !== i; }) }), '已删这条类型规则，下次遇到会再问'); }));
      c3.appendChild(row);
    });
    b.appendChild(c3);
    // 1016-UI2：「加一条分类规则」单独一块放在最下面（拇指够得着）
    var c4 = el('div', 'imp-card imp-push'); c4.id = 'impRuleAddCard';
    c4.appendChild(el('h4', null, '加一条分类规则')); c4.appendChild(add); b.appendChild(c4);
    dom.page.scrollTop = 0;
  }

  // ---------- 1016-N：待处理页（⑧）----------
  // 池子里的每一笔：和某条手记合并 / 挂到某笔原单 / 作为新增（选分类）/ 不要了；顶上「全部不要了」。
  // 候选手记被删了、已经和别的账单合并了的，标出来，全都不在时提示「原候选已不在，建议作为新增入账」。
  // 每点一下就写一次（一个事务），写完重画；处理的这笔算进它原来那批导入（撤销那批时一起撤）。
  var LOST = { gone: '已经删了', taken: '已经和别的账单合并了', dir: '收支不一样了' };
  function openPending(notice) {
    build();
    var my = ++runId;
    S = { phase: 'pending', view: {} };
    hideSteps(); closePicker();
    try { S.info = store().archiveInfo(); dom.archive.textContent = '存档「' + S.info.name + '」'; } catch (_) { dom.archive.textContent = ''; }
    setHead('待处理', '‹ 返回');
    dom.page.style.display = 'block'; barSet([closeBtn()]);
    dom.prog.style.display = 'none'; dom.sheetMask.style.display = 'none';
    dom.body.innerHTML = '';
    if (notice) { var nt = el('div', 'imp-card imp-line imp-ok', notice); nt.id = 'impPendNotice'; dom.body.appendChild(nt); }
    var loading = el('div', 'imp-soft', '正在读待处理…'); dom.body.appendChild(loading);
    return store().pendingCheck().then(function (list) {
      if (my !== runId || !S) return;
      loading.remove();
      S.pend = list;
      renderPending(list);
    }, function (e) {
      if (my !== runId || !S) return;
      loading.textContent = '读不出待处理：' + (e && (e.code || e.message) || e);
    });
  }
  function renderPending(list) {
    var head = el('div', 'imp-card'); head.id = 'impPendHead';
    if (!list.length) { head.appendChild(el('div', 'imp-line', '没有待处理的账单了。')); dom.body.appendChild(head); return; }
    var fen = list.reduce(function (s, x) { return s + (x.item.amt || 0); }, 0);
    head.appendChild(el('div', 'imp-line', '共 ' + list.length + ' 笔，' + yuan(fen) + ' 元。导入时拿不准，没进账本，在这里定。'));
    var all = btn('全部不要了', 'ui-btn danger', function () {
      window.customConfirm('这 ' + list.length + ' 笔都不要了：不进账本，以后再导同一份账单也不再出现。\n\n以后想要回来，可以撤销它们原来那次导入再重新导。确定吗？', function () {
        act(list.map(function (x) { return { key: x.key, do: 'drop' }; }), '已经都不要了');
      }, '待处理', { okText: '都不要了' });
    }); all.id = 'impPendDropAll';
    // 1016-UI2：「全部不要了」在底部操作栏（和「返回」一起），顶上只写共几笔
    head.appendChild(el('div', 'imp-soft', '每笔下面选：和哪条手记合并、作为新增，或者不要了。'));
    barSet([closeBtn(), all]);
    dom.body.appendChild(head);
    var cats = ['未分类'].concat(((S.info && S.info.cats) || []).filter(function (c) { return c !== '未分类'; }));
    list.slice().sort(function (a, b) { return a.item.t < b.item.t ? 1 : a.item.t > b.item.t ? -1 : 0; }).forEach(function (x) {
      var it = x.item, c = el('div', 'imp-card imp-pend'); c.dataset.key = x.key;
      c.appendChild(el('div', 'imp-line', fmtTime(it.t) + ' · ' + (APP[it.app] || it.app) + ' · ' + (it.cp || '—') + ' · ' + (it.io === 'income' ? '+' : '−') + yuan(it.amt)));
      c.appendChild(el('div', 'imp-soft', x.why + (it.d ? ' · ' + it.d : '')));
      if (x.lostAll) { var w = el('div', 'imp-soft imp-bad imp-pend-lost', '原候选已不在，建议作为新增入账'); c.appendChild(w); }
      x.cands.forEach(function (cd) {
        var r = el('div', 'imp-row-opt imp-pend-cand'); r.dataset.id = cd.id;
        var m = cd.rec;
        r.appendChild(el('span', 'grow', (m ? fmtTime(m.time) + ' · ' + (m.cat || '未分类') + ' · ' + yuan(Math.round(Number(m.money) * 100)) : '一条记录') + (cd.ok ? '' : '（' + LOST[cd.lost] + '）')));
        if (cd.ok) {
          var b = btn(x.refund ? '挂到这笔' : '和这条合并', 'imp-btn imp-pend-pick', function () {
            act([{ key: x.key, do: x.refund ? 'refund' : 'merge', id: cd.id }], x.refund ? '已挂到那笔原单上（当退款）' : '已和那条手记合并');
          });
          r.appendChild(b);
        }
        c.appendChild(r);
      });
      var acts = el('div', 'imp-row-opt');
      var se = null;
      if (!x.refund) {
        se = el('select', 'imp-pend-cat');
        cats.forEach(function (n) { var o = el('option', null, n); o.value = n; se.appendChild(o); });
        var lb = el('div', 'imp-soft', '分类 '); lb.style.display = 'flex'; lb.style.alignItems = 'center'; lb.style.gap = '6px'; lb.style.flex = '1 1 100%'; var sw = wrapSel(se, (it.cp || '—') + ' · ' + yuan(it.amt) + ' 元'); sw.style.flex = '1'; lb.appendChild(sw); acts.appendChild(lb);
      }
      var nb = btn(x.refund ? '作为新增（只算结余）' : '作为新增', 'imp-btn imp-pend-new', function () {
        act([{ key: x.key, do: 'new', cat: se ? se.value : '未分类' }], '已作为新增记进账本');
      });
      var db = btn('不要了', 'imp-btn imp-pend-drop', function () { act([{ key: x.key, do: 'drop' }], '这笔不要了'); });
      nb.style.flex = db.style.flex = '1 1 0';
      acts.appendChild(nb); acts.appendChild(db);
      c.appendChild(acts);
      dom.body.appendChild(c);
    });
  }
  function act(acts, okText) {
    if (!S || S.phase !== 'pending') return;
    S.phase = 'writing';
    store().pendingApply(acts).then(function () {
      if (S) S.phase = 'pending';
      openPending(okText);
    }, function (e) {
      if (S) S.phase = 'pending';
      var c = e && (e.code || e.message);
      alertMsg(c === 'candgone' ? '那条记录已经不在了（被删了或和别的账单合并了），没有改。重新看一下。'
        : c === 'quota' ? '存储空间满了，没写进去，账本没动。' : '没处理成，账本没动：' + (c || e), '待处理');
      openPending();
    });
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

  var UI = { open: open, openWith: openWith, openLogs: openLogs, openRules: openRules, openPending: openPending, close: close, canBack: canBack, back: back, isOpen: isOpen,
             _state: function () { return S; }, _replan: function () { replan(); }, _goStep: function (k) { goStep(k); }, _lastCopy: null };
  window.JiwenImportUI = UI;
})();
