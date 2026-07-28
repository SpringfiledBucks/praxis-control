# ADR-0002：PGlite 与 PostgreSQL 双部署

状态：ACCEPTED WITH VALIDATION GATE

日期：2026-07-28

## 决策

轻量版默认使用 PGlite 文件系统持久化；全量版使用 PostgreSQL。两者共享逻辑 Schema 和数据库契约，但由不同适配器管理连接、事务和备份。

PGlite 必须通过 Windows/Linux 持久化、异常恢复、迁移、备份恢复、并发和 PostgreSQL 提升迁移验证，才能从候选变为正式轻量事实库。

## 保护对象

- 用户正式决策、结果和审计历史；
- 数据目录与备份的完整性；
- 从轻量版提升到全量版的可迁移性；
- 任何时刻只有一个正式事实源。
