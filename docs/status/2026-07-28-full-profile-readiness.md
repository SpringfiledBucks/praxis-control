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

## 已补充的隔离验证

- 已增加只在 `POSTGRES_TEST_URL` 存在时执行的真实 PostgreSQL 合同测试；
- Gitea Actions 已定义一次性 PostgreSQL 16 service，覆盖迁移幂等、事务写入、追加式审计和可移植导出；
- 当前目标仓库与 runner 尚未建立，因此该真实 PostgreSQL CI 仍为 NOT VERIFIED；本机默认测试会明确跳过它，不把跳过报告为通过；
- 该测试只使用一次性 CI 数据库，不连接 NAS 现有 TimescaleDB，也不需要生产凭据。
