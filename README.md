# Praxis Control / 实践控制台

个人实践与决策系统的本地优先实现。当前优先打通：

> 现实输入 → 可解释分析 → 人工确认 → 执行结果 → 复盘归因 → 审计留痕

## 当前模式

- 轻量版默认使用 PGlite，无需安装 PostgreSQL、Docker 或配置 `.env`；
- 服务默认只监听 `127.0.0.1:4310`；
- Windows/Linux 共用 Web、CLI 与 TUI；
- Windows/Linux GUI 后续按平台特点分别实现；
- 全量版保留 PostgreSQL 适配器，NAS 恢复后再验收；
- Markdown 是内容和导出格式，不是实时事实库。

## 快速开始

```powershell
scripts\bootstrap.ps1
npm run praxis -- start
```

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
npm run praxis -- doctor
```

Linux 可以使用 `scripts/praxis.sh <命令>`。

轻量数据默认保存到：

- Windows：`%LOCALAPPDATA%\PraxisControl`
- Linux：`$XDG_DATA_HOME/praxis-control`，未设置时为 `~/.local/share/praxis-control`

## 质量门

```powershell
npm test
npm run typecheck
npm run build
```

当前权威交接见 `HANDOFF.md`，架构决策见 `docs/adr/`，前端视觉与交互约束见 `docs/design-system.md`。
