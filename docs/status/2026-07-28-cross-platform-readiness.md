# 跨平台验收状态

状态：VERIFIED（轻量版 MVP 范围）

更新时间：2026-07-29

## 已验证

- Windows 11：Node.js 24、PGlite、Web、CLI、TUI、启停、备份、恢复、导出和审计链校验；
- Windows WinUI 3 原生壳已完成在线、离线、刷新和安全关闭验收，原生日常决策表单已完成隔离分析、保存、主窗口刷新和审计链端到端验收；
- Linux GTK4/libadwaita 原生壳已在隔离 Linux 环境连接真实 PGlite 服务，完成 API、AT-SPI、截图、刷新、安全关闭和 Meson 安装后启动验收；
- Gitea Actions run 73 已在 NAS Linux runner 完成 `verify`、`linux-gui-smoke` 和 `postgres-contract` 三个作业；
- Gitea Actions run 74 已在当前 CI 边界提交上再次完成三个作业；
- CI/CD 权威入口为 Gitea Actions；GitHub 作为公开镜像和 Release 分发入口，不运行 Actions。

## 当前边界

- 尚未在长期 Linux 桌面会话中做人工鼠标/键盘验收，也未制作 Flatpak；
- GitHub 镜像已建立并自动同步；NAS Gitea 当前只有 Linux runner，Windows 原生构建仍以 Win11 实机本地构建和验收为证据；Linux 上的 .NET 还原成功，但 WinUI 3 XAML 编译器是 Windows PE 程序，不能在 Linux 上完成完整构建；
- macOS 不在当前设计、打包和 CI 范围内。

这些边界不阻断轻量版 Web、CLI、TUI 及 Windows/Linux 原生 GUI 的当前 MVP 结论；发行包和长期桌面人工验收在核心稳定后继续推进。
