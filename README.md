# 记问 · 安卓 APK 自动构建

这个仓库会用 GitHub 的服务器自动把记账本编译成安卓 APK，你本地**不需要**安装 Android Studio 或任何工具。

## 怎么拿到 APK

**最省事：**手机浏览器打开下面这个地址，直接下载 apk，不用登录、不用解压，签名不变可以覆盖升级：

https://github.com/topukk45-arch/baofu-ledger/releases/download/latest-build/jiwen-latest.apk

它永远指向最新一次打包（测试版）。正式版在仓库的 Releases 页面里，标着「Latest」的那个。

下面是从零开始自己搭的步骤：


1. 把本文件夹里的**所有文件和文件夹**上传到一个 GitHub 仓库（注意别漏掉 `.github` 文件夹，APK 就是靠它构建的）。
2. 上传完成后，GitHub 会自动开始构建。点仓库顶部的 **Actions** 标签，能看到一个正在跑的任务「构建安卓 APK」。
3. 等它跑完变成绿色对勾（约 3～5 分钟），点进这次运行，页面底部 **Artifacts** 区域有一个 `baofu-ledger-apk`，下载它。
4. 下载得到的是一个 zip，解压出 `app-debug.apk`，传到安卓手机上点击安装即可（首次安装系统会提示"允许安装未知来源应用"，同意即可）。

## 想改东西后重新出包

- 改记账本：编辑 `www/index.html`。
- 改完把文件重新上传（覆盖），GitHub 会自动重新构建，再去 Actions 下载新 APK。
- 想手动触发构建：Actions 页面选「构建安卓 APK」→ 右侧 **Run workflow**。
- 每次构建前会先自动跑一遍测试（见下方「自动化测试」），**测试不通过就不会出包**，在 Actions 里点开失败的那一步能看到是哪条没过。

## 自动化测试

`tests/` 里是用 jsdom 在 Node 中跑完整页面的测试，共 10 组、400 多条，覆盖存档与云备份、统计口径、批量操作、筛选、预算、环比、常用模板、年度预算、退款等。测试数据全部是虚构的。

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
