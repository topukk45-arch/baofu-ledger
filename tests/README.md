# 记问 · 自动化测试

用 [jsdom](https://github.com/jsdom/jsdom) 在 Node 里加载完整的 `www/index.html`，像真人一样点按钮、填表单，再检查页面和存档数据。不需要浏览器，也不需要手机。

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
| `g-budget-tab.test.js` | 预算页签：分组、展开明细、未设预算的分类 |
| `h-month-over-month.test.js` | 分类占比的「较上月」环比 |
| `i-templates-overview.test.js` | 常用模板、预算外 |
| `i3-year-budget-today.test.js` | 年度预算与每月进度、统计页「回到本月」按钮 |
| `j-refund.test.js` | 退款：部分 / 多次 / 全额 / 超额、修改与删除、批量、预算、AI 导出、导入清洗 |
| `k-remark-reveal.test.js` | 键盘弹起时点备注，弹窗自动上滚露出「添加记录 / 保存」；屏幕太矮时不把备注框滚没 |

## 逐字节回归

```bash
git show HEAD~1:www/index.html > /tmp/old.html
node regress.js /tmp/old.html ../www/index.html
```

用 `fixtures/sample-records.js` 生成的同一份假账单（约 130 条），对比两个版本的账单列表、分类汇总、筛选、统计页、当日明细和 AI 导出。

- 纯重构（不该改变行为）：应当「全部一致」；
- 有意的改动：只允许预期的那几项不一致。

## 写新测试的约定

- 测试数据一律虚构，**不要放真实金额、真实备注或真实姓名**（仓库是公开的）。
- 用固定的「今天」（覆盖 `Date`），不要依赖运行测试时的真实日期。
- 每组结尾输出 `N 通过，M 失败`，并在有失败时 `process.exit(1)`，`run-all.js` 靠这个汇总。
