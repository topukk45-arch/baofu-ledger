# 记问 · 安卓 APK 自动构建

这个仓库会用 GitHub 的服务器自动把记账本编译成安卓 APK，你本地**不需要**安装 Android Studio 或任何工具。

## 怎么拿到 APK

**最省事：**手机浏览器打开下面这个地址，直接下载 apk，不用登录、不用解压，签名不变可以覆盖升级：

https://github.com/topukk45-arch/baofu-ledger/releases/download/latest-build/jiwen-latest.apk

它指向 **main 上**最新一次打包（测试版）：只有 main 有新提交才会更新，别的分支上做的改动不在这个包里。下载前可以在 Releases 页面看「最新测试版」的标题，写着它是哪一版（比如「最新测试版 1024-X」）。正式版在仓库的 Releases 页面里，标着「Latest」的那个。

**体验版（还没合回 main 的改版）**：在分支上做的界面改版，每一版单独发一个预发布，标题是「版本号 体验版」，比 main 上的测试版新。现在最新的是 **1027-UI6 体验版**（界面收敛第一到第三轮都在里面），直接下载：

https://github.com/topukk45-arch/baofu-ledger/releases/download/1027-UI6/jiwen-1027-UI6.apk

体验版和测试版、正式版签名一样，可以互相覆盖安装，账本不动。装的是哪一版，看登录页标题下面（或设置页最底下）的版本号，比如 `build 1027-UI6`。

现在的正式版是 **记问 1021 β**（贝塔版，账单导入经过两轮真账单实测，入口还在开发开关里），直接下载：

https://github.com/topukk45-arch/baofu-ledger/releases/download/v1021-beta/jiwen-1021-beta.apk

上一个正式版 **记问 1016 α** 还留着：https://github.com/topukk45-arch/baofu-ledger/releases/download/v1016-alpha/jiwen-1016-alpha.apk

## 微信 / 支付宝账单导入（β，测试中）

把微信、支付宝导出的账单文件读进记问，一次补齐一段时间的记录，并且和你手记的账不重复。

- **怎么打开**：入口还藏在开发开关里。设置页最底下的版本号，2 秒内连点 5 次，打开「导入（开发中）」，设置页「导入存档」下面就多出一行「导入（开发中）」。
- **支持的文件**：支付宝 CSV、微信 xlsx，也可以直接选导出的压缩包，在 App 里输解压密码（密码不保存）。导入页里有两家的导出步骤。
- **一步一步确认**：选完文件分几步看：核对笔数 → 退款和转账 → 分类 → 金额要你看一眼 → 总览，没事的步骤不出现；点「导入」之前什么都不写。凡是写了「N 笔」的地方都能点开看是哪几笔，点一笔能看详情、单独改分类。
- **分类越用越准**：按对方一组选一次，选过的记成规则；也会从你以前的账里学；推荐理由写成一句话，标「有把握 / 拿不准」。拿不准的照推荐入账，账单页顶上「待确认分类」一点就能挑出来改。
- **退款不乱记**：退款自动挂到原来那笔；全额退款的一对两条都跳过；同一个人几天内转回来的一部分钱当作那笔的退款。
- **只对账**：存档里有手记时，可以只把漏记的几笔补进来，挂在上面的退款一起补。
- **导错了能撤**：导入前自动备份；「设置 → 导入记录」里每次导入都能整批撤销，也能恢复备份。
- **拿不准的不乱记**：金额差一点、几笔凑一笔、分不清是哪条手记的，进「待处理」，之后自己合并、新增或不要。
- **隐私**：账单文件只在一次导入没做完时临时存在这台手机上（方便接着来），做完或放弃就删，最多留 24 小时，不进备份；支付宝的对方账号不存。

β 版只在一台手机上用真实账单试过，**拿自己的账本试之前，先在「设置 → 导出存档」备份一份**，最好先在新存档里试导。

下面是从零开始自己搭的步骤：


1. 把本文件夹里的**所有文件和文件夹**上传到一个 GitHub 仓库（注意别漏掉 `.github` 文件夹，APK 就是靠它构建的）。
2. 上传完成后，GitHub 会自动开始构建。点仓库顶部的 **Actions** 标签，能看到一个正在跑的任务「构建安卓 APK」。
3. 等它跑完变成绿色对勾（约 3～5 分钟），点进这次运行，页面底部 **Artifacts** 区域有一个 `baofu-ledger-apk`，下载它。
4. 下载得到的是一个 zip，解压出 `app-debug.apk`，传到安卓手机上点击安装即可（首次安装系统会提示"允许安装未知来源应用"，同意即可）。

## 想改东西后重新出包

- 改记账本：页面在 `www/index.html`，脚本和样式在 `www/app/` 下（一个功能一个文件）；账单导入的代码在 `www/import/` 下（打开导入时才加载）。
- 改完把文件重新上传（覆盖），GitHub 会自动重新构建，再去 Actions 下载新 APK。
- 想手动触发构建：Actions 页面选「构建安卓 APK」→ 右侧 **Run workflow**。
- 每次构建前会先自动跑一遍测试（见下方「自动化测试」），**测试不通过就不会出包**，在 Actions 里点开失败的那一步能看到是哪条没过。

## 自动化测试

`tests/` 里是用 jsdom 在 Node 中跑完整页面的测试，共 140 多组、4100 多条，覆盖存档与云备份、统计口径、批量操作、筛选、预算、环比、常用模板、年度预算、退款、导入倒数日、账号迁移（含中途没搬完）、账本存储（IndexedDB、按月分块、搬家、12 万条耗时），以及账单导入（解析、去重、和手记配对、分类推荐、写入、撤销、待处理、压缩包解密、上千份随机账单的性质测试）等。测试数据全部是虚构的。

```bash
cd tests
npm install      # 首次
npm test         # 跑全部测试
node regress.js 旧版.html ../www/index.html   # 两个版本逐字节对比页面输出
```

详见 [tests/README.md](tests/README.md)。

## 说明

- 产出的是 **debug 版 APK**，用调试签名，适合自己装着用，不能上架 Google Play。
- 数据存在手机本地（应用内），卸载 app 会清空；app 里有「导出存档」可备份。
- 账单导入及相关的功能（导入记录、待处理、管理导入规则、存储用量、预算建议、月初导入提醒）目前都在开发开关里，不打开开关看不到，也不影响平时记账。
- 应用包名：`com.baofu.ledger`，应用名：记问。
- 包名沿用 `com.baofu.ledger` 未改，是为了让新版能直接覆盖旧版安装、不丢数据。

## 许可证 / License

© 2026 Yake（[topukk45-arch](https://github.com/topukk45-arch)）。

本项目以 [PolyForm Noncommercial 1.0.0](LICENSE) 授权：可以自由学习、个人使用和修改，**禁止任何商业用途**。如需商用，请先联系作者。

项目中引用的第三方字体、图标、库及其他素材，仍按其各自的许可证授权。

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use is not permitted.

### 致谢

- 底栏文字字体：[霞鹜文楷 LXGW WenKai](https://github.com/lxgw/LxgwWenKai)（SIL OFL 1.1）
- 图标：[Lucide](https://lucide.dev)（ISC）、[Tabler Icons](https://tabler.io/icons)（MIT）
- 读 xlsx 账单的解压：[tiny-inflate](https://github.com/foliojs/tiny-inflate)（MIT，Devon Govett），原样收录在 `www/import/vendor/tiny-inflate.js`（解开账单压缩包也用它；解密用的 AES、SHA-1 是自己写的，没有引入别的库）
