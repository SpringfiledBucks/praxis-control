# Praxis Control / 实践控制台

个人实践与决策系统的本地优先实现。当前优先打通：

> 现实输入 → 可解释分析 → 人工确认 → 执行结果 → 复盘归因 → 审计留痕

## 当前模式

- 轻量版默认使用 PGlite，无需安装 PostgreSQL、Docker 或配置 `.env`；
- 服务默认只监听 `127.0.0.1:4310`；
- Windows/Linux 共用 Web、CLI 与 TUI；
- Windows/Linux GUI 后续按平台特点分别实现；
- Windows WinUI 3 最小原生壳已通过构建、启动、刷新与安全关闭验收；
- Linux GTK4/libadwaita 原生壳已在 Gitea Linux runner 完成真实服务、可访问性、截图和安装后启动验收；
- 全量版 PostgreSQL 适配器和隔离容器栈已验收，真实域名、证书与数据库暴露治理仍保持待确认；
- Markdown 是内容和导出格式，不是实时事实库。

## 快速开始

```powershell
scripts\bootstrap.ps1
npm run praxis -- start
```

Windows x64 免安装交付可执行 `npm run package:windows-portable`；生成目录中的 `PraxisControl.cmd` 可双击启动服务和原生客户端，`PraxisControl-Stop.cmd` 负责安全关闭。程序目录与 `%LOCALAPPDATA%\PraxisControl` 事实数据相互独立。

常用命令：

```text
npm run praxis -- start
npm run praxis -- stop
npm run praxis -- status
npm run praxis -- dashboard
npm run praxis -- tui
npm run praxis -- backup
npm run praxis -- restore --file <备份文件> --target <不存在的独立目录>
npm run praxis -- audit-verify
npm run praxis -- export --target <新建 JSON 文件>
npm run praxis -- import-portable --file <JSON 文件> --confirm-empty-postgres
npm run praxis -- doctor
```

Linux 可以使用 `scripts/praxis.sh <命令>`。

轻量数据默认保存到：

- Windows：`%LOCALAPPDATA%\PraxisControl`
- Linux：`$XDG_DATA_HOME/praxis-control`，未设置时为 `~/.local/share/praxis-control`

## 质量门

```powershell
npm test
npm run test:linux-client
npm run typecheck
npm run build
npm run test:windows-gui-e2e
npm run test:windows-package
```

真实 PostgreSQL 合同测试需要一次性测试库，并显式设置 `POSTGRES_TEST_URL` 后执行 `npm run test:postgres`；默认本机测试不会连接 NAS 数据库。

当前权威交接见 `HANDOFF.md`，架构决策见 `docs/adr/`，前端视觉与交互约束见 `docs/design-system.md`。

跨客户端 API 合同可在服务运行时通过 `GET /api/openapi.json` 读取；原生 GUI 技术路线见 `docs/adr/ADR-0006-native-gui-platforms.md`。

本地开发机访问 NAS Gitea 时优先使用 Tailscale 地址 `ssh://git@<NAS_TAILSCALE_IP>:2222/<GITEA_OWNER>/praxis-control.git`；NAS 内部服务间调用仍可使用其受控内网地址。
