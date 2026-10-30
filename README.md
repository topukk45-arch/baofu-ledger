# 记问

一个安卓记账本：手记一笔很快，也能把微信、支付宝的账单整段导进来，再交给你自己用的 AI 按组分好类。数据只存在手机里，记问自己不联网（云备份是你自己连的 OneDrive）。

APK 由 GitHub 的服务器自动打包，你本地**不需要**装 Android Studio 或任何工具。

## 下载

手机浏览器打开链接直接下载 apk，不用登录、不用解压。几种版本签名一样，可以互相覆盖安装，账本不动。装的是哪一版，看登录页标题下面（或设置页最底下）的版本号，比如 `build 1030-RV5`。

| 版本 | 是什么 | 下载 |
|---|---|---|
| **体验版 1030-RV5**（最新） | 还没合回 main 的改版：待确认分类的成组确认、AI 按组整理新一版 | [jiwen-1030-RV5.apk](https://github.com/topukk45-arch/baofu-ledger/releases/download/1030-RV5/jiwen-1030-RV5.apk) |
| 最新测试版 | main 上最新一次打包（现在是 1029-D），只有 main 有新提交才更新 | [jiwen-latest.apk](https://github.com/topukk45-arch/baofu-ledger/releases/download/latest-build/jiwen-latest.apk) |
| 正式版 记问 1021 β | 账单导入经过两轮真账单实测 | [jiwen-1021-beta.apk](https://github.com/topukk45-arch/baofu-ledger/releases/download/v1021-beta/jiwen-1021-beta.apk) |
| 上一个正式版 记问 1016 α | 留着备用 | [jiwen-1016-alpha.apk](https://github.com/topukk45-arch/baofu-ledger/releases/download/v1016-alpha/jiwen-1016-alpha.apk) |

每一版改了什么，看仓库的 [Releases](https://github.com/topukk45-arch/baofu-ledger/releases) 页面。

## 账单导入 + AI 一键分类（测试中）

导入一年的账单，最费事的从来不是导进来，而是给几百上千笔分类。现在这一步基本交给 AI：实测下来，**绝大部分账单都能靠「AI 按组整理」一次分好**，剩下的几笔再手动看一眼就行。

**入口**：功能还藏在开发开关里。设置页最底下的版本号，2 秒内连点 5 次，打开「导入（开发中）」。

### 一般怎么用

1. **导进来**：选微信 xlsx / 支付宝 CSV（压缩包也行，解压密码在 App 里输、不保存），核对笔数，点「导入」。记问能认出的分类直接定；拿不准的照样入账，标成「待确认分类」。
2. **交给 AI**：账单页顶上「待确认分类 N 条 ›」→「交给 AI 按组整理 ›」→「复制全文」，贴给你自己用的 AI（豆包、Kimi、ChatGPT、Claude 都行）。
3. **粘回来**：把 AI 的回复整段粘贴回记问，每组一张卡、默认勾上，看一眼不对的勾掉，点「改这 N 条的分类」。
4. **收尾**：剩下的在「成组确认」里按分类一组一组点「没问题」，或者「逐条确认」。改错了能撤销。

### 交给 AI 的是什么

- **按组，不是逐笔**：同一个商户、同一种收支归成一组（平台按商品说明分，个人按对方加用途分），几百笔变成几十行，AI 一次看得完。
- **每组带规律**：笔数、合计、平均每笔、单笔范围、日期范围、大多在几点、多在工作日还是周末、疑似每月固定扣款。AI 能据此认出「每月 1 号 3000 元的个人转账多半是房租」这类。
- **一看就知道的不发**：群红包直接记成红包、「发给某某」直接记成转账；0 元的不进。
- **只能改分类**：AI 回的格式是固定的「G号 | 分类 | 理由」，分类必须是你存档里有的；读不懂的行单独列出来，不会乱改。改之前自动备份，「设置 → 导入记录」里能整批撤销。

### 隐私

- 记问不联网、不接任何 AI 接口，复制和粘贴都是你自己做的，发不发、发给谁由你定。
- 发出去之前打码：手机号留前 3 后 4、长串数字（卡号、单号）只留后 4 位、邮箱只留第一个字。
- 「隐藏真实姓名」开关（默认关）：打开后个人对方写成「个人A」「个人B」，同一个人同一个号；读回来按组号对回原来的记录，App 里照样显示真名。
- 账单文件只在一次导入没做完时临时存在这台手机上（方便接着来），做完或放弃就删，最多留 24 小时，不进备份；支付宝的对方账号不存。

### 导入本身还管这些

- **和手记不重复**：已经手记过的那笔，会和账单配成一条，不会记两遍；拿不准是哪条手记的，进「待处理」让你定。
- **退款不乱记**：退款自动挂到原来那笔；全额退款的一对两条都跳过；同一个人几天内转回来的一部分钱当作那笔的退款。
- **分类越用越准**：你选过的会记成规则（能撤销），也会从你以前的账里学。
- **只对账**：存档里有手记时，可以只把漏记的几笔补进来。
- **导错了能撤**：导入前自动备份；每次导入、每次 AI 修改都能在「导入记录」里撤销，也能恢复备份。

还在测试中，**拿自己的账本试之前，先在「设置 → 导出存档」备份一份**，最好先在新存档里试导。

## 自己打包

1. 把仓库里的**所有文件和文件夹**放进你自己的 GitHub 仓库（别漏掉 `.github` 文件夹，打包就靠它）。
2. 推到 main 后 GitHub 自动开始打包：仓库顶部 **Actions** →「构建安卓 APK」。也可以在那里点 **Run workflow** 手动触发。
3. 跑完变成绿色对勾（约 3～5 分钟），点进这次运行，底部 **Artifacts** 里下载 `baofu-ledger-apk`，解压出 `app-debug.apk` 传到手机安装（首次会提示「允许安装未知来源应用」）。

每次打包前会先跑一遍全部测试，**测试不通过就不出包**，在 Actions 里点开失败的那一步能看到是哪条没过。

## 改代码

- 页面在 `www/index.html`，脚本和样式在 `www/app/` 下（一个功能一个文件，分层见 `CLAUDE.md`「模块规矩」）。
- 账单导入在 `www/import/` 下，打开导入时才加载；分类推荐、配对、AI 导出这些纯计算的文件不碰页面和存储，Node 里能直接 `require`。
- 协作约定、每个功能的规则写在 [CLAUDE.md](CLAUDE.md)。

### 自动化测试

`tests/` 里用 jsdom 在 Node 中跑完整页面，现在 180 多组、6200 多条：存档与云备份、统计口径、搜索和批量改、预算、退款、日子、账本存储（IndexedDB、按月分块、12 万条耗时），以及账单导入（解析、去重、和手记配对、分类推荐、写入、撤销、待处理、压缩包解密、AI 导出和读回、上千份随机账单的性质测试）等。测试数据全部是虚构的。

```bash
cd tests
npm install      # 首次
npm test         # 跑全部测试
node regress.js 旧版.html ../www/index.html   # 两个版本逐字节对比页面输出
```

详见 [tests/README.md](tests/README.md)。

## 说明

- 产出的是 **debug 版 APK**，用调试签名，适合自己装着用，不能上架 Google Play。
- 数据存在手机本地，卸载会清空；App 里有「导出存档」可以备份，也能连自己的 OneDrive 自动备份。
- 账单导入及相关功能（导入记录、待处理、待确认分类、AI 按组整理、管理导入规则、预算建议、月初导入提醒）目前都在开发开关里，不打开看不到，也不影响平时记账。
- 应用名：记问；包名沿用 `com.baofu.ledger` 没改，为了让新版能直接覆盖旧版安装、不丢数据。

## 许可证 / License

© 2026 Yake（[topukk45-arch](https://github.com/topukk45-arch)）。

本项目以 [PolyForm Noncommercial 1.0.0](LICENSE) 授权：可以自由学习、个人使用和修改，**禁止任何商业用途**。如需商用，请先联系作者。

项目中引用的第三方字体、图标、库及其他素材，仍按其各自的许可证授权。

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use is not permitted.

### 致谢

- 底栏文字字体：[霞鹜文楷 LXGW WenKai](https://github.com/lxgw/LxgwWenKai)（SIL OFL 1.1）
- 图标：[Lucide](https://lucide.dev)（ISC）、[Tabler Icons](https://tabler.io/icons)（MIT）
- 读 xlsx 账单的解压：[tiny-inflate](https://github.com/foliojs/tiny-inflate)（MIT，Devon Govett），原样收录在 `www/import/vendor/tiny-inflate.js`（解开账单压缩包也用它；解密用的 AES、SHA-1 是自己写的，没有引入别的库）
