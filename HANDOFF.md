# Praxis Control 当前交接基线

状态：轻量版 MVP、Windows 原生壳、Linux GUI、安全迁移链、Gitea CI 及 GitHub 镜像已验证；全量 PostgreSQL 生产接入待完成

更新：2026-07-30

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
- 项目组合 WIP 与状态转换由服务端事务和领域状态机强制执行，客户端提交的组合计数不作为正式事实。

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

- NAS Gitea 私有仓库已建立，本地唯一 `origin` 通过受控网络连接该权威远端，`main` 已推送；内部地址、仓库路径和账号不进入公开文档；
- Gitea Actions run 73 与 run 74 的 `verify`、`linux-gui-smoke`、`postgres-contract` 三个作业全部通过，见 `docs/status/2026-07-29-gitea-ci.md`；
- GitHub 公开仓库 `SpringfiledBucks/praxis-control` 用于代码镜像、外部预览和 Release 分发；Gitea 使用单仓库 SSH Deploy Key 和 `post-receive` hook 单向镜像到 GitHub，自动同步已验证，见 `docs/status/2026-07-28-git-remote-readiness.md`；
- GitHub 不运行 Actions；CI/CD 权威入口为 Gitea Actions，仓库不保留 GitHub Actions 工作流；
- NAS 验收证据见 `docs/status/2026-07-28-nas-readiness.md`。
- Windows 轻量版已验证；Linux GTK 已在 NAS 一次性环境通过真实 PGlite 服务、原生按钮动作、AT-SPI、中文截图和 Meson 安装后启动验收，当前 MVP 范围为 VERIFIED，见 `docs/status/2026-07-28-linux-gui.md`；
- Windows WinUI 3 原生壳已在 Win11 实机通过在线、离线、刷新和安全关闭验收；原生日常决策窗口已完成隔离分析、保存、主窗口刷新与审计链端到端验收，可通过 `npm run test:windows-gui-e2e` 重复执行；NAS Linux 交叉还原成功，但 WinUI XAML 编译器不能在 Linux 执行，因此完整 Windows 构建必须保留在 Windows 环境，见 `docs/status/2026-07-29-windows-ci-boundary.md`；
- Windows x64 已提供免安装自包含便携交付：双击入口会拉起本机服务和原生 GUI，Web/TUI/CLI/安全关闭入口独立可见，事实数据与程序目录分离；包内 Node、PGlite、WinUI 表单和审计链已通过隔离验收，见 `docs/status/2026-07-29-windows-portable.md`；
- 轻量本机运行时已改为操作系统动态回环端口，CLI/TUI/Windows GUI/Linux GUI 统一从状态文件发现实际地址并携带运行时令牌；启动锁在打开 PGlite 前生效，后台失败写入用户日志并由 CLI 提前报告。Windows 动态端口端到端和便携包已通过，Linux 真实 GUI 仍需在 Gitea Linux 作业复核，见 `docs/status/2026-07-30-runtime-lifecycle-audit.md`；
- 全量版隔离容器已通过最低权限角色、secret、回环发布、真实写入、审计、备份、独立恢复及 Docker CLI 生命周期验收，见 `docs/status/2026-07-29-full-profile-container.md`；应用原生密码会话和 Nginx HTTPS 模板也已在 NAS 隔离验证，见 `docs/status/2026-07-29-production-access.md`。生产接入仍为 PARTIAL：真实域名/证书未定，现有 PostgreSQL 仍对 LAN/Tailscale 暴露 5432，未确认消费者前不得重建。
