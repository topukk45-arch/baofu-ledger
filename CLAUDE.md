# 记问（baofu-ledger）协作约定

## 沟通与提交
- 和用户交流、提交说明（commit message）、Release 说明一律用**中文**，写大白话，不堆术语。
- 提交标题格式：`版本号：一句话说明改了什么`，例如 `1010-K5：修复退款弹窗被键盘挡住`。正文分条写改动点。
- 只改文档、测试、不需要出包时，标题末尾加 `[skip ci]`，避免白跑打包。

## 项目结构
- App 全部代码在 `www/index.html`（单文件，Capacitor 打包成安卓 APK）。
- 版本号写在登录页标题下方：`build 1010-K4` 这种格式，每发一版都要改。
- 推送到 main 会自动打包（`.github/workflows/build.yml`），APK 在 Actions 页面下载。

## 改代码的流程
1. 改之前先跑一遍测试：`cd tests && npm install && npm test`，确认起点是绿的。
2. 小步改，一个版本只做一件事。
3. 改完再跑 `npm test`；纯重构时再用 `node tests/regress.js 旧版.html www/index.html` 做逐字节对比，应当全部一致。
4. 新功能要补测试（见 `tests/README.md`）。
5. 全部通过才推送。打包流程里也会先跑测试，不通过不出包。

## 隐私（仓库是公开的）
- 测试数据、示例、截图一律用**虚构数据**，不能出现用户真实的金额、备注、地名、家人信息或真实姓名。
- 提交作者用 `yake <243927364+topukk45-arch@users.noreply.github.com>` 或协作者身份，不要写入任何真实邮箱。

## 许可证
- 本项目为 PolyForm Noncommercial 1.0.0（禁止商用）。第三方：霞鹜文楷（OFL）、Lucide（ISC）、Tabler（MIT），新增第三方素材要在 README 致谢里补上。
