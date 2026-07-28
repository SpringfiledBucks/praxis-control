# Praxis Control 当前交接基线

状态：轻量版 MVP 实施中

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
- NAS 当前因停电风险主动停服，不作为轻量版阻塞项。

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
- 测试、类型检查、构建和浏览器验收通过后才标记 VERIFIED。
