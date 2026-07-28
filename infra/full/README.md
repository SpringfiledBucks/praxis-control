# 全量版容器部署

本目录提供单机 NAS/Linux 全量版基线：应用只在主机回环地址发布，PostgreSQL 只存在于 Docker 内部网络；跨设备入口必须由经过认证的本机反向代理提供。

## 安全边界

- `database` 不发布 5432，应用角色固定为 `NOSUPERUSER`、`NOCREATEDB`、`NOCREATEROLE`、`NOINHERIT`；
- 复用 NAS 已缓存的 TimescaleDB PostgreSQL 16 镜像时关闭自动内存调优，并从应用库移除未使用的 TimescaleDB 扩展；
- 管理密码与应用密码使用两个 Docker secret 文件，不进入环境变量、镜像或仓库；
- 应用容器使用只读根文件系统、移除全部 capability、`no-new-privileges`，并以隔离 tmpfs 覆盖 `/tmp` 和基础镜像声明的 `/data`；
- 主机只发布 `127.0.0.1:4310`。不得改为 `0.0.0.0`；
- `ACCESS_MODE=tailscale` 默认拒绝缺少或不匹配 `Tailscale-User-Login` 的请求，仅 `/health` 例外；
- 只有会清除客户端伪造身份头并注入已验证身份的 Tailscale Serve，或具备等价行为的认证代理，才能放在应用前方；不得直接信任来自 LAN/Tailscale 的该请求头；
- 不使用 Funnel，不把应用或数据库直接暴露到公网。

## 准备

需要 Docker Engine、可工作的 Docker Compose，以及 `openssl`。创建部署主机本地密钥：

```sh
cd infra/full
install -d -m 0700 secrets
umask 077
openssl rand -hex 32 >secrets/database-admin-password.txt
openssl rand -hex 32 >secrets/database-app-password.txt
cp .env.example .env
```

编辑 `.env`，把 `TAILSCALE_ALLOWED_USER` 改为认证代理实际注入的登录名。两个密码文件保持 `0600`，不得提交。

## 启停

```sh
docker compose --project-name praxis-control-full -f compose.yml config --quiet
docker compose --project-name praxis-control-full -f compose.yml up --build -d
docker compose --project-name praxis-control-full -f compose.yml ps
curl --fail http://127.0.0.1:4310/health
```

停止应用而保留事实库：

```sh
docker compose --project-name praxis-control-full -f compose.yml down
```

不要对正式环境执行 `down --volumes`。数据库卷删除只允许在已验证备份、明确目标和恢复路径后单独审批。

## 跨设备入口

应用健康后再配置 HTTPS/认证入口。例如受官方 Tailscale Serve 支持的环境可将 HTTPS Serve 代理到 `127.0.0.1:4310`，并先验证实际 `Tailscale-User-Login` 与 `.env` 一致。若控制平面不支持 Serve/身份头，则保持应用仅回环可达，改用能完成 TLS、登录认证、身份头清洗与注入的反向代理；不得降级为裸 HTTP 网络监听。

## 备份

```sh
sh backup.sh /secure/backup/praxis-control
```

脚本以应用角色生成 custom-format dump，拒绝覆盖，检查非空并运行 `pg_restore --list`。正式切换前还必须在独立数据库完成恢复、逐表计数和审计链验证；只验证归档目录不等于完成恢复演练。

## 隔离验收

`tests/smoke.sh` 会创建随机密码、临时镜像、两个隔离网络、临时 PostgreSQL 卷和两个应用容器，验证：

- 镜像可构建并包含 migration；
- 数据库无主机端口，应用只绑定回环；
- 应用角色最低权限；
- Tailscale 身份缺失/错误时 401，允许身份可访问；
- PostgreSQL 写入、审计链、custom dump 和独立数据库恢复均有效；
- 恢复副本由真实应用重新读取并复核审计链。

结束时脚本删除全部临时容器、网络、卷、镜像、密码和 dump。它不会连接或修改现有业务 PostgreSQL。
