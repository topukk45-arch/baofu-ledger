# 记问 App 图标

- 字形：篆书「記」，照古代篆书拓本描摹（不是字体文件里的字）。
- 比原来放大约 1.18 倍，笔画略加粗。
- `jiwen-icon.svg`：带底的完整图标；`jiwen-foreground.svg`：只有字、透明底（自适应图标的前景）。
- `android/app/src/main/res/mipmap-*/` 下的 15 个 PNG（`ic_launcher`、`ic_launcher_round`、`ic_launcher_foreground`）都是从这两个 SVG 导出的。
- 以后改图标先改 SVG，再按原来的尺寸重新导出 PNG；背景色（#F8F6F0）和 `ic_launcher.xml` 不在这里。
