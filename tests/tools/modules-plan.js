// 模块设计（modules 分支第四步，1019-Z4-M3）：每个模块归哪一层、对外一个什么入口、包括原来哪几节、哪些名字单独挪过来。
// 搬的时候照这张表；每搬完一块，依赖检查测试按这张表锁住。
//   层：0 基础 → 1 存储 → 2 面板底座 → 3 业务 → 4 页面 → 5 启动；同一层里也排了先后。只许调排在自己前面的模块（下层、同层排前面的），
//   排在后面的一律不许调；暂时做不到的列进 CALLBACKS（回调口），测试锁住只减不增。
//   secs：原来的分节号（tools/deps.js 打印的 #号，按 1019-Z4 的分节）；names：不管在哪一节，这几个名字归这个模块。
//   顶层的事件绑定语句（给某个按钮 addEventListener 那种）跟着它服务的页面走，搬的时候按 binds 归，不跟着所在的节。
// 用法：node tests/tools/modules-plan.js   打印每个模块多大、往上调用（回调口）有哪些、同层互调有哪些
'use strict';
const MODULES = [
  { key: 'base', layer: 0, entry: 'JiwenBase', file: 'app/base.js', what: '性能记录（入口 JiwenPerf 不变）、$、常量、页面元素句柄、软键盘、金额输入过滤、dt-input 垫片、数字字号、时间解析、口径计算、四舍五入 / 转义 / 补零这些小工具',
    secs: [0, 1, 2, 3, 4, 6, 32, 53], names: ['pad', 'nowDtValue', 'escapeHtml', 'safeNum', 'round2', 'normMoney', 'repairTime', 'MODE_HINT', 'fillSelect'] },
  { key: 'store', layer: 1, entry: 'JiwenStore', file: 'app/store.js', what: '账本存储（IndexedDB 分块、写入队列）、loadStore / saveStore、账号、老数据迁移、搬家、退款和预算的计算、分类 / 模板 / 日子的数据、导入数据和写入（入口 JiwenImportStore 不变）、云备份、单号表上云、备份文件导出 / 导入',
    secs: [7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19], names: ['getUserData', 'saveUserData', 'getCats', 'sanitizeTpls', 'tplName', 'TPL_MAX', 'TPL_NAME_MAX', 'tplSame', 'loadDays', 'isValidDay', 'daysKey', 'backupCorruptedDays', 'importArchiveFromText', 'sanitizeImportedDays', 'mergeImportedDays', 'sanitizeImportedRecords', 'MAX_IMPORT_DAYS'] },
  { key: 'select', layer: 2, entry: 'JiwenSelect', file: 'app/select.js', what: '金色下拉（包住原生 select）', secs: [43], names: [] },
  { key: 'keypad', layer: 2, entry: 'JiwenKeypad', file: 'app/keypad.js', what: '数字键盘（老入口 window.kpOpen / kpClose 留着）', secs: [59], names: [] },
  { key: 'text', layer: 2, entry: 'JiwenText', file: 'app/text.js', what: '文字输入小面板（老入口 window.openTextPanel 留着）', secs: [60], names: [] },
  { key: 'date', layer: 2, entry: 'JiwenDate', file: 'app/date.js', what: '日期时间选择（日 / 月 / 年三级、左右滑、时分滚轮）', secs: [23, 24, 25, 26], names: [] },
  { key: 'ask', layer: 2, entry: 'JiwenAsk', file: 'app/ask.js', what: '提示 / 确认 / 输入 / 选择框（customAlert…，老入口 window.customAlert / customConfirm / customPrompt 留着给 import/ 用）', secs: [5], names: [] },
  { key: 'sheet', layer: 2, entry: 'JiwenSheet', file: 'app/sheet.js', what: '共用底部面板（入口 JiwenSheet 不变）、往下拉关闭、收起动画、滚动锁、按下反馈、筛选浮层的拖动底座', secs: [27, 28, 29, 44, 46, 61, 62], names: [] },
  { key: 'ai', layer: 3, entry: 'JiwenAiExport', file: 'app/ai-export.js', what: '导出账单给 AI 分析', secs: [20], names: [] },
  { key: 'impentry', layer: 3, entry: 'JiwenImportEntry', file: 'app/import-entry.js', what: '导入入口（开发开关、loadImportUI、用记问打开、空账本入口、月初提醒、待处理横幅、AI 标记列表的入口）', secs: [21], names: [] },
  { key: 'forms', layer: 4, entry: 'JiwenForms', file: 'app/forms.js', what: '记一笔、修改账单、退款弹窗、口径选择、常用模板和模板面板', secs: [37, 38, 39, 40, 41, 42], names: ['refundLineHtml', 'formState', 'formSnaps'] },
  { key: 'ledger', layer: 4, entry: 'JiwenLedger', file: 'app/ledger.js', what: '账单页：列表、翻页、搜索和筛选、分类汇总和滑动提示、批量操作', secs: [30, 31, 33, 34], names: ['renderPager', 'scrollListTop', 'pagerPad', 'renderFilterChips', 'goPage'] },
  { key: 'stats', layer: 4, entry: 'JiwenStats', file: 'app/stats.js', what: '统计页、预算页、预算建议、年月选择、账单详情', secs: [35, 36, 50, 51], names: [] },
  { key: 'days', layer: 4, entry: 'JiwenDays', file: 'app/days.js', what: '日子（入口卡、管理页、选择删除、编辑弹窗）', secs: [54, 55, 56, 57, 64, 65, 66], names: [] },
  { key: 'cats', layer: 4, entry: 'JiwenCats', file: 'app/cats.js', what: '分类管理（列表、拖动排序、改名、删除、设预算）', secs: [22], names: ['openCatManager', 'openCatActions', 'attachCatDrag', 'showCatErr'] },
  { key: 'settings', layer: 5, entry: 'JiwenSettings', file: 'app/settings.js', what: '设置页、外观、存储用量', secs: [45], names: ['renderStorageUse', '__storageSeq', 'STORAGE_WARN', 'refreshArchiveSelect'] },
  { key: 'tabs', layer: 5, entry: 'JiwenTabs', file: 'app/tabs.js', what: '外壳：页签切换、进账号（enterAccount）、历史脏数据自检、进日子管理页 / 回来、刷新所有页面、被杀回来、首屏快照（老入口 window.snapSave / snapDrop 留着）', secs: [47, 48, 49], names: ['gotoDaysPage', 'backFromDaysPage', 'refreshAllViews', 'refreshCatSelectors', 'enterAccount', 'runTimeRepairOnce', 'scanAndRepairStore'] },
  { key: 'login', layer: 5, entry: 'JiwenLogin', file: 'app/login.js', what: '登录页：账号列表、新建账号、从文件导入存档、登录（login）', secs: [14, 17], names: ['promptNewAccount', 'login'] },
  { key: 'back', layer: 5, entry: 'JiwenBack', file: 'app/back.js', what: '系统返回键 / 侧滑返回的层级表、弹窗往下拉 / 返回键关闭表（FORM_CLOSE，要认得每一种弹窗，所以放最上面）', secs: [58, 63], names: [] },
  { key: 'boot', layer: 5, entry: null, file: 'app/boot.js', what: '启动（initApp）、历史脏数据自检', secs: [52, 67], names: [] },
];
// 主程序以外直接用的老入口（import/、测试、原生层以外的页面代码按名字找），搬完也要留在 window 上
const LEGACY = ['JiwenPerf', 'JiwenSheet', 'JiwenImportStore', 'JiwenImportNext', 'customAlert', 'customConfirm', 'customPrompt', 'openDevImportCheck', 'kpOpen', 'kpClose', 'openTextPanel', 'snapSave', 'snapDrop', 'openEdit', 'viewRemark', 'syncFilterFab', 'closeFilterSheet', 'setDraftCat', 'getDraftCat', 'dtWheelsSync', 'openPerfPage', 'SHEET_MS'];

// 回调口：按上面的表算下来、暂时留着的往上调用（调用方模块 → 被调模块：名字）。只许减不许加（zZzW 锁住）
const CALLBACKS = {
  'store → tabs': ['snapDrop'],
  'store → ask': ['customAlert'],
  'cats → tabs': ['refreshCatSelectors', 'refreshAllViews'],
  'ledger → tabs': ['refreshAllViews'],
  'forms → tabs': ['refreshAllViews'],
  'stats → tabs': ['refreshAllViews'],
};

function plan(www) {
  const D = require('./deps'), S = require('./scan');
  const R = D.analyze(www);
  const secMod = {}, layer = {};
  MODULES.forEach((m, i) => { layer[m.key] = i; m.secs.forEach(s => { secMod[s] = m.key; }); });   // 比的是排的先后
  const nameMod = new Map();
  R.owner.forEach((sec, n) => nameMod.set(n, secMod[sec]));
  MODULES.forEach(m => m.names.forEach(n => { if (R.decls.has(n)) nameMod.set(n, m.key); }));
  const ast = S.parse(R.code);
  const secAt = pos => { let i = 0; for (const s of R.secs) { if (s.pos <= pos) i = s.id; else break; } return i; };
  const up = new Map(), side = new Map(), size = {};
  ast.body.forEach(st => {
    const own = st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.map(d => d.id.name).filter(Boolean) : [];
    const m = own.length ? nameMod.get(own[0]) : secMod[secAt(st.start)];
    size[m] = (size[m] || 0) + (st.end - st.start);
    if (!own.length) return;   // 顶层绑定语句按页面归，搬的时候再定；这里只看定义的名字之间
    const r = D.freeRefs(st);
    new Set([...r.reads, ...r.writes]).forEach(n => {
      const o = nameMod.get(n); if (!o || o === m) return;
      const bag = layer[o] > layer[m] ? up : null; if (!bag) return;
      const k = m + ' → ' + o; if (!bag.has(k)) bag.set(k, new Set()); bag.get(k).add(n + '（' + own[0] + ' 里）');
    });
  });
  const unassigned = R.secs.filter(s => !secMod[s.id]).map(s => '#' + s.id + ' ' + s.title);
  return { R, up, side, size, unassigned, nameMod };
}

module.exports = { MODULES, LEGACY, CALLBACKS, plan };

if (require.main === module) {
  const path = require('path');
  const P = plan(process.argv[2] || path.join(__dirname, '..', '..', 'www'));
  if (P.unassigned.length) console.log('没归的节：' + P.unassigned.join('、'));
  MODULES.forEach(m => console.log(`${m.layer} ${m.key.padEnd(9)} ${String(m.entry).padEnd(17)} 约 ${Math.round((P.size[m.key] || 0) / 1024)} KB`));
  console.log('\n往上调用（回调口）：'); [...P.up].forEach(([k, v]) => console.log('  ' + k + '：' + [...v].join('、')));
}
