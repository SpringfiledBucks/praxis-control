# 架构地图

状态：ACCEPTED

日期：2026-07-28

```text
共享 Web ─┐
共享 CLI ─┼─→ 本机或远端 JSON/HTML API
共享 TUI ─┤               ↓
Windows GUI / Linux GUI    应用用例与领域规则
                           ↓
                 Database 契约与追加式审计
                    ↓                 ↓
             PGlite 轻量版      PostgreSQL 全量版
```

## 分层

- `src/domain`：纯规则、Schema 和状态机；
- `src/application`：用例、事务边界和数据映射；
- `src/infrastructure`：PGlite、PostgreSQL、迁移、审计和备份；
- `src/web`：HTML/JSON 路由；
- `src/cli`：Windows/Linux 共通 CLI/TUI；
- `src/platform`：路径和平台适配；
- `src/runtime`：单实例与启停控制；
- `views` / `public`：共享 Web 客户端。

## 不变量

- 客户端不直接打开数据库；
- 轻量版无需 NAS 或外部数据库服务；
- 硬门槛先于评分；
- 正式分析绑定不可变输入、输出与规则版本；
- 历史通过追加事件纠正；
- 关系图谱节点使用稳定 ID；
- 生产、资金、权限和隐私类动作不自动执行。
