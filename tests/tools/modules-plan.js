// 模块设计（modules 分支第四步，1019-Z4-M3）：每个模块归哪一层、对外一个什么入口、包括原来哪几节、哪些名字单独挪过来。
// 搬的时候照这张表；每搬完一块，依赖检查测试按这张表锁住。
//   层：0 基础 → 1 存储 → 2 面板底座 → 3 业务 → 4 页面 → 5 启动；同一层里也排了先后。只许调排在自己前面的模块（下层、同层排前面的），
//   排在后面的一律不许调；暂时做不到的列进 CALLBACKS（回调口），测试锁住只减不增。
//   secs：原来的分节（按「// =====」标题认，1019-Z4 的写法）；names：不管在哪一节，这几个名字归这个模块。
//   已经搬进模块文件的语句，不管原来在哪一节，都算那个模块的。
//   顶层的事件绑定语句（给某个按钮 addEventListener 那种）跟着它服务的页面走，搬的时候按 binds 归，不跟着所在的节。
// 用法：node tests/tools/modules-plan.js   打印每个模块多大、往上调用（回调口）有哪些、同层互调有哪些
'use strict';
const MODULES = [
  { key: 'base', layer: 0, entry: 'JiwenBase', file: 'app/base.js', what: '性能记录（入口 JiwenPerf 不变）、$、常量、页面元素句柄、软键盘、金额输入过滤、dt-input 垫片、数字字号、时间解析、口径计算、四舍五入 / 转义 / 补零这些小工具',
    secs: ['1019-M：性能记录（开发开关里的「性能记录」页看、复制）', '软键盘处理（极简、稳健版）', '1010-K5：点「备注」后，把保存按钮也露出来', '金额输入过滤：只放行数字和一个小数点，小数最多两位', '.dt-input 的 value 垫片', '统计（1010-B）', '数字自适应字号', '记录时间的唯一解析口'], names: ['pad', 'nowDtValue', 'escapeHtml', 'safeNum', 'round2', 'normMoney', 'repairTime', 'MODE_HINT', 'fillSelect',
      'currentUser', 'currentArchive', 'currentTab', 'curPage'] },   // 后四个：全 App 共用的状态，先留在旧文件里，最后单独一步收进 JiwenBase.state
  { key: 'store', layer: 1, entry: 'JiwenStore', file: 'app/store.js', what: '账本存储（IndexedDB 分块、写入队列）、loadStore / saveStore、账号、老数据迁移、搬家、退款和预算的计算、分类 / 模板 / 日子的数据、导入数据和写入（入口 JiwenImportStore 不变）、云备份、单号表上云、备份文件导出 / 导入',
    secs: ['退款（1010-J）', '分类月预算（1010-G）', '账本存储（1013-G 起按月分块存在 IndexedDB）', '导入数据（1015-B，账单导入第一期 ② 数据结构）', '1016-F：写入（账单导入第一期 ⑥b）', '账本搬家（1013-G）：1013-D～F 的整段账本 store_<编号> → 按月分块', '账本搬家：localStorage → IndexedDB（只跑一次；没搬完下次打开接着搬）', '账号（1010-K7）', '老数据迁移：按名字存 → 按编号存（只跑一次，失败了下次启动接着跑）', '云备份：自动同步到 OneDrive（不走微软官方登录）', '1016-W：单号表上云（第一期 ⑨）'], names: ['getUserData', 'saveUserData', 'getCats', 'sanitizeTpls', 'tplName', 'TPL_MAX', 'TPL_NAME_MAX', 'tplSame', 'loadDays', 'isValidDay', 'daysKey', 'backupCorruptedDays', 'importArchiveFromText', 'sanitizeImportedDays', 'mergeImportedDays', 'sanitizeImportedRecords', 'MAX_IMPORT_DAYS'] },
  { key: 'select', layer: 2, entry: 'JiwenSelect', file: 'app/select.js', what: '金色下拉（包住原生 select）', secs: ['自定义金色下拉：包裹原生 select，保留全部 value/事件逻辑'], names: [] },
  { key: 'keypad', layer: 2, entry: 'JiwenKeypad', file: 'app/keypad.js', what: '数字键盘（老入口 window.kpOpen / kpClose 留着）', secs: ['1019-P：金额用 App 自己的数字键盘'], names: [] },
  { key: 'text', layer: 2, entry: 'JiwenText', file: 'app/text.js', what: '文字输入小面板（老入口 window.openTextPanel 留着）', secs: ['1019-O：文字输入的小面板'], names: [] },
  { key: 'sheet', layer: 2, entry: 'JiwenPanel', file: 'app/sheet.js', what: '共用底部面板的底座（入口 JiwenPanel；共用面板本身的老入口 window.JiwenSheet 不变）、往下拉关闭、收起动画、滚动锁、按下反馈', secs: ['底部浮层的「往下拉关闭」（1017-UI1 从筛选浮层里抽出来，筛选浮层和导入页的选择面板共用）', '1017-UI1：共用的底部面板（选分类 / 选一项 / 确认）', '弹窗打开时锁定背景滚动，防止滚动穿透到主页面', '点击按下反馈：用事件委托给可点元素加 .pressed（WebView 里 :active 不稳，故用 JS）', '1019-N：所有底部面板关闭都有收起动画', '1019-M：性能记录：点输入框到能输入、键盘弹起时面板动了几次、面板打开用了多久'], names: [] },
  { key: 'ask', layer: 2, entry: 'JiwenAsk', file: 'app/ask.js', what: '提示 / 确认 / 输入 / 选择框（customAlert…，老入口 window.customAlert / customConfirm / customPrompt 留着给 import/ 用）', secs: ['自定义 确认 / 输入 弹窗'], names: [] },
  { key: 'date', layer: 2, entry: 'JiwenDate', file: 'app/date.js', what: '日期时间选择（日 / 月 / 年三级、左右滑、时分滚轮）', secs: ['自定义时间选择器', '三级下钻：日 → 月 → 年', '网格内左右滑动翻页', '1019-T：时 / 分滚轮'], names: [] },
  { key: 'ai', layer: 3, entry: 'JiwenAiExport', file: 'app/ai-export.js', what: '导出账单给 AI 分析', secs: ['导出账单给 AI 分析'], names: [] },
  { key: 'impentry', layer: 3, entry: 'JiwenImportEntry', file: 'app/import-entry.js', what: '导入入口（开发开关、loadImportUI、用记问打开、空账本入口、月初提醒、待处理横幅、AI 标记列表的入口）', secs: ['1015-A：账单导入（开发中）'], names: [] },
  { key: 'forms', layer: 4, entry: 'JiwenForms', file: 'app/forms.js', what: '记一笔、修改账单、退款弹窗、口径选择、常用模板和模板面板', secs: ['悬浮按钮：打开/关闭记账弹窗', '统计选择：计入 / 不计 / 往来', '常用模板（1010-I）', '退款弹窗（1010-J）', '1019-K：模板面板（新建 / 编辑都用它）', '修改弹窗的分类/收支标签（与记账弹窗同款，但打开时预选记录原有值）'], names: ['refundLineHtml', 'formState', 'formSnaps'] },
  { key: 'ledger', layer: 4, entry: 'JiwenLedger', file: 'app/ledger.js', what: '账单页：总览（这个月支出、结余）、列表（按天分组）、翻页、搜索和筛选（含筛选浮层的控件）、批量操作（1023-A 起分类汇总搬去统计页）', secs: ['筛选浮层（bottom sheet）控件绑定', '搜索状态：记账页顶部的备注/金额/日期筛选，与分类标签筛选叠加', '批量操作（基于当前筛选结果）'], names: ['renderPager', 'scrollListTop', 'pagerPad', 'renderFilterChips', 'goPage'] },
  { key: 'cats', layer: 4, entry: 'JiwenCats', file: 'app/cats.js', what: '分类管理（列表、拖动排序、改名、删除、设预算）', secs: ['分类长按拖动排序（pointer/touch 手写，避免 WebView 原生 draggable 不稳）'], names: ['openCatManager', 'openCatActions', 'attachCatDrag', 'showCatErr'] },
  { key: 'stats', layer: 4, entry: 'JiwenStats', file: 'app/stats.js', what: '统计页、预算页、预算建议、年月选择、账单详情、分类汇总和滑动提示（1023-A 从账单页搬来）', secs: ['统计页：预算', '分类汇总卡片', '1019-H：分类汇总能滑但看不出来：右下角的小圆钮', '单独一版（1016-Z9）：按过去 3–6 个月的中位数给每月预算建议，一键写入', '统计模块（纯手写 SVG，跟随外观主题变量）', '年月选择器（统计页）'], names: [] },
  { key: 'days', layer: 4, entry: 'JiwenDays', file: 'app/days.js', what: '日子（入口卡、管理页、选择删除、编辑弹窗）', secs: ['日子（倒数日）', '入口卡显示条数（可配置）', '记账页的入口卡', '管理页', '日子管理弹窗', '选择模式（批量删除）', '编辑/添加弹窗'], names: [] },
  { key: 'settings', layer: 5, entry: 'JiwenSettings', file: 'app/settings.js', what: '设置页、外观、存储用量', secs: ['外观：主题色（全局，所有账号共用，存 localStorage）'], names: ['renderStorageUse', '__storageSeq', 'STORAGE_WARN', 'refreshArchiveSelect'] },
  { key: 'tabs', layer: 5, entry: 'JiwenTabs', file: 'app/tabs.js', what: '外壳：页签切换、进账号（enterAccount）、历史脏数据自检、进日子管理页 / 回来、刷新所有页面、被杀回来、首屏快照（老入口 window.snapSave / snapDrop 留着）', secs: ['底部标签切换', '1019-F：切到后台被系统杀掉，回来看不出来', '1019-U：首屏快照'], names: ['gotoDaysPage', 'backFromDaysPage', 'refreshAllViews', 'refreshCatSelectors', 'enterAccount', 'runTimeRepairOnce', 'scanAndRepairStore'] },
  { key: 'login', layer: 5, entry: 'JiwenLogin', file: 'app/login.js', what: '登录页：账号列表、新建账号、从文件导入存档、登录（login）', secs: ['登录页：从文件导入存档（先选文件，再指定要导入到哪个账号）', '登录页：账号列表'], names: ['promptNewAccount', 'login'] },
  { key: 'back', layer: 5, entry: 'JiwenBack', file: 'app/back.js', what: '系统返回键 / 侧滑返回的层级表、弹窗往下拉 / 返回键关闭表（FORM_CLOSE，要认得每一种弹窗，所以放最上面）', secs: ['1019-B：底部面板式的弹窗，往下拉 / 返回键关闭走同一个出口', '系统返回键 / 侧滑返回'], names: [] },
  { key: 'boot', layer: 5, entry: 'JiwenBoot', file: 'app/boot.js', what: '启动（initApp）、历史脏数据自检', secs: ['历史脏数据自检与修复：time 字面量 vs Date 解析不一致', '页面初始化：若上次已登录且未退出，自动进入主界面；否则显示登录页'], names: [] },
];
// 顶层的绑定语句（不定义名字的那种）跟着它服务的页面走：按语句开头的文字认，归到这里写的模块，不管原来在哪一节
const BIND = [
  ["billList.addEventListener('click', e => {", 'ledger'],                       // 账单表的点击委托
  ["window.addEventListener('resize', ()=>fitNums($('summaryOverall'))", 'ledger'],   // 总览数字字号
  ["(function(){\n            const PAIRS = [['billRemark','addBill']", 'forms'],   // 点备注后露出保存
  ["$('newAccountBtn').addEventListener('click'", 'login'],                       // 新建账号按钮
  ["if($('odConnectBtn')){", 'settings'],                                          // 云备份那几个按钮
  ["$('odOrdersBtn').addEventListener('click'", 'settings'],
  ["$('odOrdersRestoreBtn').addEventListener('click'", 'settings'],
  ["if($('odDisconnectBtn')){", 'settings'],
  ["askInput.addEventListener('click', ()=>{ if(askInput.dataset.kp", 'ask'],     // 提示框的输入框弹数字键盘
  ["askInput.addEventListener('focus', ()=>{ if(askInput.dataset.kp", 'ask'],
  ["$('askList').addEventListener('click', e=>{", 'stats'],                       // AI 标记列表点一行开详情
  ["(function(){\n            const kw=$('searchKeyword')", 'ledger'],           // 筛选浮层里的控件
  ["$('manageCatSetting').addEventListener('click', openCatManager);", 'settings'],   // 设置页「管理账单分类」
  ["$('daysManageBtn').addEventListener('click', gotoDaysPage);", 'tabs'],         // 进日子管理页 / 回来（外壳管页面切换）
  ["$('daysBack').addEventListener('click', backFromDaysPage);", 'tabs'],
  ["window.JiwenImportNext={", 'tabs'],
  ["$('setBuild').addEventListener('click', () => {", 'settings'],                // 版本号连点开开发开关
  ["$('importFile').addEventListener('change', e => {", 'settings'],              // 设置页「导入备份文件」
  ["$('newCatName').addEventListener('input', ()=>showCatErr(''));", 'cats'],      // 分类管理里新增分类
  ["$('addCatBtn').addEventListener('click', () => {", 'cats'],
  ["$('daysEntryRows').addEventListener('click', e=>{", 'tabs'],                   // 账单页的日子卡（点「添加」要进日子管理页）                                             // 导入结果页「接下来可以」：去统计 / 设预算 / 期初余额，跨几个页面
];

// 主程序以外直接用的老入口（import/、测试、原生层以外的页面代码按名字找），搬完也要留在 window 上
const LEGACY = ['JiwenPerf', 'JiwenSheet', 'JiwenImportStore', 'JiwenImportNext', 'customAlert', 'customConfirm', 'customPrompt', 'openDevImportCheck', 'kpOpen', 'kpClose', 'openTextPanel', 'snapSave', 'snapDrop', 'openEdit', 'viewRemark', 'syncFilterFab', 'closeFilterSheet', 'setDraftCat', 'getDraftCat', 'dtWheelsSync', 'openPerfPage', 'SHEET_MS',
  // 原来就挂在 window 上、几块之间互相打招呼用的小钩子（__ 开头），照旧
  '__kbHoldInfo', '__relayoutMasks', '__openModalAfterKeyboard', '__revealSave', '__impOpenedNow', '__perfRecs', '__autoLogin', '__impOpened', '__filterActive', '__catHintWake', '__formDirty', '__sheetGhosts'];

// 回调口：按上面的表算下来、暂时留着的往上调用（调用方模块 → 被调模块：名字）。只许减不许加（zZzW 锁住）
const CALLBACKS = {
  'store → tabs': ['snapDrop', 'refreshAllViews', 'refreshCatSelectors'],   // 后两个：JiwenImportStore 写完导入 / 撤销后刷新页面（1019-Z4-M5 搬存储时数出来的）
  'store → ask': ['customAlert'],
  'cats → tabs': ['refreshCatSelectors', 'refreshAllViews'],
  'cats → stats': ['renderStats'],   // 设好预算后刷新统计页（1019-Z4-M8 调先后时数出来的）
  'settings → tabs': ['snapDrop', 'refreshCatSelectors', 'refreshAllViews'],   // 换主题、改默认进入页面后删首屏快照（同上）
  'ledger → tabs': ['refreshAllViews'],
  'ledger → stats': ['openDetail'],   // 1023-A：账单一条一行，点整行进账单详情（详情在统计页模块里，修改从详情进）
  'forms → tabs': ['refreshAllViews'],
  'forms → cats': ['openCatManager'],   // 1020-G：分类抽屉底部「管理分类」打开分类管理（分类管理排在记一笔后面：它要调记一笔那边的刷新），关了回到抽屉
  'stats → tabs': ['refreshAllViews'],
};

function plan(www) {
  const D = require('./deps'), S = require('./scan');
  const R = D.analyze(www);
  const byTitle = {}, layer = {}, byFile = {};
  MODULES.forEach((m, i) => { layer[m.key] = i; byFile[m.file] = m.key; m.secs.forEach(t => { byTitle[t] = m.key; }); });   // 比的是排的先后
  const secMod = {}; R.secs.forEach(s => { secMod[s.id] = byTitle[s.title]; });
  const fileMod = pos => { const b = R.bounds.find(b => pos >= b.start && pos < b.end); return b && byFile[b.file]; };
  const nameMod = new Map();
  R.owner.forEach((sec, n) => nameMod.set(n, fileMod(R.decls.get(n).pos) || secMod[sec]));
  MODULES.forEach(m => m.names.forEach(n => { if (R.decls.has(n) && !fileMod(R.decls.get(n).pos)) nameMod.set(n, m.key); }));
  const ast = S.parse(R.code);
  const secAt = pos => { let i = 0; for (const s of R.secs) { if (s.pos <= pos) i = s.id; else break; } return i; };
  const up = new Map(), side = new Map(), size = {};
  ast.body.forEach(st => {
    const own = st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.map(d => d.id.name).filter(Boolean) : [];
    const m = own.length ? nameMod.get(own[0]) : (fileMod(st.start) || secMod[secAt(st.start)]);
    size[m] = (size[m] || 0) + (st.end - st.start);
    if (!own.length) return;   // 顶层绑定语句按页面归，搬的时候再定；这里只看定义的名字之间
    const r = D.freeRefs(st);
    new Set([...r.reads, ...r.writes]).forEach(n => {
      const o = nameMod.get(n); if (!o || o === m) return;
      const bag = layer[o] > layer[m] ? up : null; if (!bag) return;
      const k = m + ' → ' + o; if (!bag.has(k)) bag.set(k, new Set()); bag.get(k).add(n + '（' + own[0] + ' 里）');
    });
  });
  const unassigned = R.secs.filter(s => !secMod[s.id] && !fileMod(s.pos)).map(s => '#' + s.id + ' ' + s.title);
  const titles = new Set(R.secs.map(s => s.title));
  const lostTitles = MODULES.flatMap(m => m.secs.filter(t => !titles.has(t)).map(t => m.key + '：' + t));
  return { R, up, side, size, unassigned, lostTitles, nameMod, fileMod };
}

// 老入口里只在用到时才挂上的（打开导入、用记问打开以后），启动后还没有
const LEGACY_LAZY = ['__impOpenedNow', '__impOpened'];

module.exports = { MODULES, LEGACY, LEGACY_LAZY, CALLBACKS, BIND, plan };

if (require.main === module) {
  const path = require('path');
  const P = plan(process.argv[2] || path.join(__dirname, '..', '..', 'www'));
  if (P.unassigned.length) console.log('没归的节：' + P.unassigned.join('、'));
  MODULES.forEach(m => console.log(`${m.layer} ${m.key.padEnd(9)} ${String(m.entry).padEnd(17)} 约 ${Math.round((P.size[m.key] || 0) / 1024)} KB`));
  console.log('\n往上调用（回调口）：'); [...P.up].forEach(([k, v]) => console.log('  ' + k + '：' + [...v].join('、')));
}
