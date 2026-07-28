# 全量版基础设施只读评估

状态：BLOCKED

时间：2026-07-28

## 当前观察

- NAS 上已有 PostgreSQL 16 兼容的 TimescaleDB 容器，数据库报告 accepting connections；
- 5432 映射到主机所有接口，并且从 LAN 与 Tailscale 路径均可建立 TCP 连接；
- NAS 的 443 未监听，不能假设已具备 HTTPS 入口；
- 本次未读取数据库凭据、未连接业务数据库、未创建库或角色。

## 上线门槛

- 收敛 5432 暴露面：优先仅容器私网/本机访问，或使用主机防火墙做明确来源白名单；
- 为 Praxis Control 创建独立数据库和最低权限角色，不复用现有业务超级用户；
- 明确 TLS、Tailscale 与 Web 认证边界；
- 完成空库迁移、轻量数据导入、逐表计数与审计链对账；
- 完成独立备份恢复演练和失败回滚；
- 通过上述门槛前，不把现有 TimescaleDB 直接作为全量版事实库。

## 已完成的隔离验证

- 已增加只在 `POSTGRES_TEST_URL` 存在时执行的真实 PostgreSQL 合同测试；
- Gitea Actions 已定义一次性 PostgreSQL 16 service，覆盖迁移幂等、事务写入、追加式审计和可移植导出；
- 2026-07-28 使用 NAS 现有 `timescale/timescaledb:latest-pg16` 镜像启动无卷临时容器，仅绑定 NAS `127.0.0.1:55432`，通过 SSH 隧道运行真实合同；
- 真实 PostgreSQL 测试 2/2 通过：PGlite 快照导入、逐表计数、迁移幂等、后续事务写入、审计链和 PostgreSQL 导出均通过；
- 验收后临时容器因 `--rm` 被删除，SSH 隧道关闭，55432 无监听；现有 TimescaleDB 容器、数据卷、账号和 5432 服务均未连接或修改；
- Gitea Actions run 64 已使用一次性 PostgreSQL service 重复执行真实合同，`postgres-contract` 作业（task 55）成功；本机默认测试仍会在缺少 `POSTGRES_TEST_URL` 时明确跳过 PostgreSQL 文件，不把跳过报告为通过；
- 该测试只使用一次性 CI 数据库，不连接 NAS 现有 TimescaleDB，也不需要生产凭据。

## 便携迁移边界

- 已实现 PGlite/旧 PostgreSQL 快照到空 PostgreSQL 的事务导入；
- 导入前强制校验格式版本、逐集合计数和完整审计链；
- 目标业务表只要存在任何记录即拒绝，不提供隐式合并、覆盖或清空；
- CLI 还要求 `--confirm-empty-postgres`，迁移完成后重建审计头；
- PGlite 到独立 PGlite 及真实 PostgreSQL 16 的往返测试均已验证逐表计数和审计一致。
