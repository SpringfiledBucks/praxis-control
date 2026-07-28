# 全量版容器与恢复验收

状态：VERIFIED（隔离容器范围） / BLOCKED（生产入口与现有数据库暴露面）

时间：2026-07-29

## 已验证

- 新增 `infra/full/Dockerfile` 与 `compose.yml`，应用镜像使用固定基础 digest，在 NAS 本地真实构建成功；
- 首次启动发现并修复运行镜像遗漏 `migrations/` 的问题；
- PostgreSQL 使用固定 TimescaleDB 镜像 digest，但关闭面向整机资源的自动调优，并在 Praxis Control 数据库初始化时明确移除不使用的 TimescaleDB 扩展，避免过量内存参数和低权限备份夹带系统目录；
- 应用密码从只读 secret 文件加载，未进入 `DATABASE_URL` 环境变量；管理角色与应用角色密码分离；
- 应用角色实测为 `NOSUPERUSER`、`NOCREATEDB`、`NOCREATEROLE`、`NOINHERIT`；
- 数据库容器无主机端口，应用容器仅绑定 NAS `127.0.0.1:4312`；应用连接内部数据库网络，同时通过独立 edge 网络发布回环端口；
- 应用容器实测只读根文件系统、无 Linux capabilities、`no-new-privileges`，运行状态仅写入隔离 tmpfs；
- `/health` 返回 PostgreSQL connected；无身份头和错误身份头访问数据均为 401，允许身份可读；
- 通过真实 API 写入 1 条日常决策，审计链验证 `valid=true`；
- 使用应用角色生成非空 custom-format dump，恢复到基于 `template0` 的独立数据库；恢复库记录数为 1，第二个真实应用实例重新读取后审计链仍有效；
- `infra/full/tests/smoke.sh` 已在 NAS 完整运行并输出 `Praxis Control full-profile smoke: PASS`；结束后临时容器、网络、卷、镜像、端口、密码和远端源码目录均清理为 0。
- 早期两轮测试因基础镜像声明 `/data` 产生 8 个无名卷；已通过创建时间、Docker volume 事件、dangling 状态和 `0 KiB` 内容逐一归属并删除。应用现以 tmpfs 覆盖 `/data` 且清理使用 `docker rm -v`；最终复测前后 dangling volume 数均为 22，未再泄漏无名卷。

## 真实环境阻塞

- NAS 现有 `timescaledb` 仍将 5432 发布到 `0.0.0.0` 和 `[::]`；本次未连接、修改或重启该容器；
- NAS 只有 `docker-compose 1.29.2`，其 Python 依赖已不兼容当前 requests/urllib3，运行命令报 `Not supported URL scheme http+docker`；配置解析可通过，但正式部署前需安装 Compose v2 或修复受控运维工具链；
- Nginx 当前只有 HTTP 监听，没有 443/certificate；
- 当前为 Headscale 控制平面，MagicDNS 未启用，`tailscale serve status --json` 为空，不能把官方 Tailscale Serve 的 HTTPS 与身份头能力视为现成可用；
- 因 TLS/认证代理和生产 5432 暴露面尚未收敛，正式多设备入口与生产数据迁移保持 BLOCKED，不降级为裸 HTTP 或直接复用现有业务数据库。

## 下一验收门槛

1. 建立可重复、受支持的 Compose v2 或等价部署工具；
2. 新建 Praxis Control 独立生产卷和数据库，不复用现有业务事实库；
3. 部署只监听回环的应用，并建立 TLS、认证、身份头清洗/注入的入口；
4. 通过 LAN 与 Tailscale 反向验证应用和 5432 均无非预期暴露；
5. 对正式备份执行独立恢复、逐表计数和审计链对账后，才允许轻量事实源切换。
