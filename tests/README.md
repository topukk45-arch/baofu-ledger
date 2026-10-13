# 记问 · 自动化测试

用 [jsdom](https://github.com/jsdom/jsdom) 在 Node 里加载完整的 `www/index.html`，像真人一样点按钮、填表单，再检查页面和存档数据。不需要浏览器，也不需要手机。

1013-D 起账本存在 IndexedDB。jsdom 没有 IndexedDB，测试用 [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB)（纯 JS 实现，只在测试里用，不进 App）。

**所有测试数据都是虚构的**，不含任何真实账单。

## 运行

```bash
cd tests
npm install          # 首次
npm test             # 跑全部测试，任何一组失败退出码为 1
node j-refund.test.js            # 只跑某一组（默认测 ../www/index.html）
node j-refund.test.js 某个.html   # 测指定文件
```

GitHub Actions 每次打包前都会先跑 `npm test`，不通过就不出包。

## 各组测试

| 文件 | 覆盖内容 |
|---|---|
| `a-basics.test.js` | 存档改名 / 删除时云备份连接跟着走、改用户名、筛选无结果、脏金额 |
| `b-modes-batch.test.js` | 统计口径（计入 / 不计入）、记一笔、批量改分类与撤销、跨页筛选 |
| `c-flow-confirm.test.js` | 只算结余、批量确认清单、导入时保留口径 |
| `f-filter-sheet.test.js` | 筛选面板的口径筛选、下拉关闭手势 |
| `g-budget.test.js` | 分类月预算的设置、计算、导入导出 |
| `g-budget-tab.test.js` | 预算页签：分组、展开明细（可同时展开多个）、展开后就地改预算、未设预算的分类 |
| `h-month-over-month.test.js` | 分类占比的「较上月」环比 |
| `i-templates-overview.test.js` | 常用模板（点带金额的模板滚到「添加记录」）、预算外、标签选中前后大小不变 |
| `i3-year-budget-today.test.js` | 年度预算与每月进度、统计页「回到本月」按钮 |
| `j-refund.test.js` | 退款：部分 / 多次 / 全额 / 超额、修改与删除、批量、预算、AI 导出、导入清洗 |
| `k-remark-reveal.test.js` | 键盘弹起时点备注，弹窗自动上滚露出「添加记录 / 保存」；屏幕太矮时不把备注框滚没 |
| `l-import-days.test.js` | 导入存档时的倒数日：同账号自动带上；不同账号先问一句，选「一起导入」才合并；去重、旧文件、登录页和设置页两条路 |
| `m-accounts.test.js` | 账号改为内部编号：新建账号、老数据迁移（多账号、云备份连接、损坏备份、早期 billData）、迁移中途失败后续跑、账号列表损坏找回、移走与找回账号、改名不搬数据、重名拦截 |
| `n-migrate-partial.test.js` | 迁移没一次搬完时：搬完的账号马上能进、不被卡住的账号拖累；提示点名没整理完的账号；没整理完的账号不能往里导入；1013-A 时已经导进去的那份另存起来，老账本照样搬回来 |
| `o-name-input.test.js` | 名字输入：撞上「已移走」账号名字时提示可以找回；账号、存档、分类、日子名称的输入框按实际字数限长，8 个 emoji 也能打进去 |
| `p-idb-storage.test.js` | 账本搬到 IndexedDB：缓存给副本、先改内存再写库、切后台强制写、写到一半被杀、写失败提示与重试、新建账号 / 导入要确认写进去、搬家（中途失败续搬、读回对不上、旧的删不掉、两边内容不一样）、库里账本坏了、打不开库、1.7 万条进入账号的耗时 |

## 逐字节回归

```bash
git show HEAD~1:www/index.html > /tmp/old.html
node regress.js /tmp/old.html ../www/index.html
```

用 `fixtures/sample-records.js` 生成的同一份假账单（约 130 条），对比两个版本的账单列表、分类汇总、筛选、统计页、当日明细和 AI 导出。新旧版本都能比（老版本同步启动，新版本等它准备好再取）。

`p-idb-storage.test.js` 第 13 组会顺带和老版本比一下 1.7 万条进入账号的耗时：`OLD_HTML=/tmp/old.html node p-idb-storage.test.js`。

- 纯重构（不该改变行为）：应当「全部一致」；
- 有意的改动：只允许预期的那几项不一致。

## 写新测试的约定

- 测试数据一律虚构，**不要放真实金额、真实备注或真实姓名**（仓库是公开的）。
- 用固定的「今天」（覆盖 `Date`），不要依赖运行测试时的真实日期。
- 数据按账号编号存（1010-K7 起）。测试照旧可以用老格式（`store_小明`）预置数据，启动时会自动迁移；当前账号编号是 `localStorage.getItem('app_logged_in_user')`。
- 账本在 IndexedDB（1013-D 起），启动、进入账号、新建账号、导入都是异步的：
  - `boot()` 是 async，用 `const t=await boot(...)`，返回时页面已经准备好；
  - 点账号、新建账号、导入之后 `await t.idle()` 再检查（等页面里进行中的读写都结束，见 `helpers/idb.js`）；
  - 读当前账号的账本：`JSON.parse(t.w.ledgerGet(t.w.storeKey()))`（内存里那份）；要确认真写进库了用 `(await t.db())['store_'+编号]`；
  - 模拟「重开 App」要用同一台手机：`boot` 时传同一个 IndexedDB（各文件里的 `reboot(t, 快照)`）。
- 每组结尾输出 `N 通过，M 失败`，并在有失败时 `process.exit(1)`，`run-all.js` 靠这个汇总。
