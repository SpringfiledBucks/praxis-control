# Praxis Control 当前交接基线

状态：轻量版 MVP、Windows 原生壳和安全迁移链已验证；Linux GUI、远端与全量 PostgreSQL 等待隔离环境验收

更新：2026-07-28

## 权威顺序

1. 本文件与 `docs/adr/` 中已接受的决策；
2. `docs/architecture.md`、`docs/deployment.md`、`docs/acceptance.md`；
3. 本地交接包和原始理论资料，仅在核对公式或模块含义时按需读取。

不得重新导入旧长会话。历史压缩资料与当前 ADR 冲突时，以当前 ADR 为准。

## 已确认产品边界

- 轻量版：Windows/Linux 本机服务，PGlite 嵌入式 PostgreSQL；
- 全量版：NAS/Linux 服务，正式 PostgreSQL；
- Web、CLI、TUI 均为 Windows/Linux 共通客户端；
- Web 是完整跨平台入口；CLI/TUI 同样具备跨平台契约；
- Windows/Linux GUI 按系统特点差异化，均不直接访问数据库；
- macOS 暂不设计、不打包、不进入 CI；
- Win11 小组件在核心稳定后作为轻入口；
- NAS 已恢复，但不作为轻量版运行依赖。
- NAS Gitea 是权威 Git 远端；Gitea 再同步到 GitHub，本机不直接维护双远端发布链路。

## 当前实现原则

- TypeScript + Express + EJS + 原生浏览器脚本；
- 所有客户端调用统一 API；
- 领域规则为纯函数；
- PGlite/PostgreSQL 实现统一数据库契约；
- 正式输入、分析快照、规则版本、结果和审计事件进入事实库；
- Markdown 用于长文本、报告与导出，不作为实时事实库；
- 关系图谱使用稳定节点和有向关系，专用图数据库不进入 MVP；
- 高风险外部动作只建议、阻断和留痕，不自动执行。

## 当前阶段完成标准

- 无 NAS、无本机数据库服务、无 `.env` 时可以启动；
- 空数据目录可迁移并自动写入基础规则；
- Web 可以完成日常输入、分析、保存、结果复盘和审计；
- CLI/TUI 能在 Windows/Linux 启停、诊断、读取工作台并调用 JSON API；
- 页面与快捷命令都能安全关闭服务；
- PGlite 数据重启后仍存在，并能生成非空备份；
- PGlite 备份可恢复到独立目录并完成迁移、项目和决策计数校验；
- 便携快照可在格式、计数、迁移版本和审计链校验后事务导入空库；
- Windows WinUI 3 原生壳可发现服务、读取 API v1、刷新并安全关闭；
- 测试、类型检查、构建和浏览器验收通过后才标记 VERIFIED。

## 当前外部状态

- 2026-07-28 已只读确认 NAS、Gitea Web/API 和 Git SSH 恢复；
- 目标仓库 `<GITEA_OWNER>/praxis-control` 尚不存在，本地没有 `origin`；
- GitHub 已连接的所有者为 `SpringfiledBucks`，尚无 `praxis-control` 仓库；Gitea/GitHub 建仓和镜像凭据等待用户在对应 UI 完成，见 `docs/status/2026-07-28-git-remote-readiness.md`；
- NAS 验收证据见 `docs/status/2026-07-28-nas-readiness.md`。
- Windows 轻量版已验证；Linux CI 运行环境尚未建立，见 `docs/status/2026-07-28-cross-platform-readiness.md`；
- Windows WinUI 3 原生壳已在 Win11 实机通过在线、离线、刷新和安全关闭验收；Linux GTK4/libadwaita 原生壳已通过纯逻辑与语法检查，真实 GUI 保持 PARTIAL；
- NAS PostgreSQL 当前对 LAN 与 Tailscale 暴露 5432，全量版生产接入保持 BLOCKED；安全迁移导入已在无卷、回环绑定的一次性 PostgreSQL 16 中通过真实合同验收，Gitea CI 的重复执行仍等待 runner，见 `docs/status/2026-07-28-full-profile-readiness.md`。
