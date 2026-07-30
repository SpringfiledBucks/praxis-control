# 第一批业务逻辑：项目组合治理

状态：VERIFIED

日期：2026-07-30

## 范围

轻量版运行、数据、备份恢复、跨客户端发现和发布基线达到 VERIFIED 后，第一批业务逻辑聚焦项目组合事实、WIP 上限、项目状态机、日常分析上下文和周复盘审计聚合。

## 已实现

- WIP 上限来自规则版本参数；
- 项目创建与重新激活在事务内锁定策略并执行权威计数；
- 项目状态转换由纯领域状态机约束；
- 日常分析忽略客户端伪造的 WIP 数值，使用服务端事实；
- Web、CLI、Windows GUI、Linux GUI 与 API 合同显示同一动态上限；
- 周复盘更新继续使用原有数据库 ID，审计事件保持在同一聚合链。

## 验收门槛

- 单元与 PGlite 集成测试覆盖动态上限、伪造输入、HTTP 409、非法状态跳转、释放容量和周复盘审计连续性；
- TypeScript 类型检查、构建、共享测试、Linux 客户端和 Windows 端到端通过；
- Gitea `verify`、`linux-gui-smoke`、`postgres-contract` 全部通过后提升为 VERIFIED。

## 验证结果

- `npm run typecheck`、`npm run build`：通过；
- 共享测试：11 个测试文件通过、1 个 PostgreSQL 文件按本机环境跳过；39 项通过；
- Linux 客户端：3 项通过且相关脚本语法检查通过；
- Windows GUI E2E：通过，原生客户端连接动态端口并完成决策与审计闭环；
- Windows 便携包：通过，2462 个文件，动态端口启动和审计闭环成功；
- 隔离浏览器验收：连续创建 3 个项目后显示 `WIP 3 / 3`，第四个项目返回业务冲突且未写入；活动项目界面不提供非法的直接 `retired` 跳转；
- Gitea run 85：`verify`、`linux-gui-smoke`、`postgres-contract` 全部通过；真实 PostgreSQL 中两个并发准入请求只有一个成功，最终 WIP 保持 `3 / 3`。
