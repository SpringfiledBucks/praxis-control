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
- 新增不依赖 Compose 的 `manage.sh`，实测完成 `preflight → start → status → API 写入 → backup → stop → start`；生命周期重建前正常停止应用与 PostgreSQL，重启后原记录与 `valid=true` 审计链仍存在，停止后命名数据库卷保留；
- 重复启动后的 PostgreSQL 日志记录 `database system was shut down`，且未出现 `automatic recovery in progress`，确认生命周期工具走正常停库路径而非强制移除；
- 生命周期入口只管理带匹配 `io.praxiscontrol.stack` 标签的固定资源，名称碰撞时拒绝；数据库密码变化会在构建或容器重建前被指纹门禁拒绝，专用回归同时证明运行时密码副本未被改写、既有应用和数据库容器未被移除；
- `backup.sh` 已通过 Docker CLI 生命周期入口生成两份 27,058 字节的非空 custom-format 测试备份并完成目录校验；全部生命周期测试容器、网络、卷、镜像、备份和源码副本随后清理为 0。

## 真实环境阻塞

- NAS 现有 `timescaledb` 仍将 5432 发布到 `0.0.0.0` 和 `[::]`；本次未连接、修改或重启该容器；
- NAS 的 `docker-compose 1.29.2` 仍因 Python 依赖不兼容而无法运行，但 `manage.sh` 已提供经真实验收的等价 Docker CLI 生命周期，不再把 Compose 修复作为部署前置条件；
- Nginx 当前只有 HTTP 监听，没有 443/certificate；
- 当前为 Headscale 控制平面，MagicDNS 未启用，`tailscale serve status --json` 为空，不能把官方 Tailscale Serve 的 HTTPS 与身份头能力视为现成可用；
- 因 TLS/认证代理和生产 5432 暴露面尚未收敛，正式多设备入口与生产数据迁移保持 BLOCKED，不降级为裸 HTTP 或直接复用现有业务数据库。

应用原生密码认证与 Nginx HTTPS 模板的后续进展见 `2026-07-29-production-access.md`；它们已消除对 Headscale 身份头的强依赖，但真实证书安装和 5432 治理仍属于生产变更门槛。

## 下一验收门槛

1. 新建 Praxis Control 独立生产卷和数据库，不复用现有业务事实库；
2. 部署只监听回环的应用，并建立 TLS、认证、身份头清洗/注入的入口；
3. 通过 LAN 与 Tailscale 反向验证应用和 5432 均无非预期暴露；
4. 对正式备份执行独立恢复、逐表计数和审计链对账后，才允许轻量事实源切换。
