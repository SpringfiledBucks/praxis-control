# 跨平台验收状态

状态：VERIFIED（轻量版 MVP 范围）

更新时间：2026-07-29

## 已验证

- Windows 11：Node.js 24、PGlite、Web、CLI、TUI、启停、备份、恢复、导出和审计链校验；
- Windows WinUI 3 原生壳已完成在线、离线、刷新和安全关闭验收，原生日常决策表单已通过构建；
- Linux GTK4/libadwaita 原生壳已在隔离 Linux 环境连接真实 PGlite 服务，完成 API、AT-SPI、截图、刷新、安全关闭和 Meson 安装后启动验收；
- Gitea Actions run 68 已在 NAS Linux runner 完成 `verify`、`linux-gui-smoke` 和 `postgres-contract` 三个作业；
- Windows 原生构建工作流已保留在 GitHub Actions 配置中，待 GitHub 镜像建立后执行。

## 当前边界

- Windows 原生日常决策表单的端到端保存仍待主机无锁屏、无输入冲突时复验；
- 尚未在长期 Linux 桌面会话中做人工鼠标/键盘验收，也未制作 Flatpak；
- GitHub 镜像尚未建立，因此 Windows GitHub runner 尚未产生远端构建证据；
- macOS 不在当前设计、打包和 CI 范围内。

这些边界不阻断轻量版 Web、CLI、TUI 及 Windows/Linux 原生 GUI 的当前 MVP 结论；发行包和长期桌面人工验收在核心稳定后继续推进。
