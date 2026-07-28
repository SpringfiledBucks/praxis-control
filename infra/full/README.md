# 全量版容器部署

本目录提供单机 NAS/Linux 全量版基线：应用只在主机回环地址发布，PostgreSQL 只存在于 Docker 内部网络；跨设备入口必须由经过认证的本机反向代理提供。

## 安全边界

- `database` 不发布 5432，应用角色固定为 `NOSUPERUSER`、`NOCREATEDB`、`NOCREATEROLE`、`NOINHERIT`；
- 复用 NAS 已缓存的 TimescaleDB PostgreSQL 16 镜像时关闭自动内存调优，并从应用库移除未使用的 TimescaleDB 扩展；
- 数据库管理密码、应用密码、Web 访问密码与会话签名密钥均使用独立 secret 文件，不进入环境变量、镜像或仓库；
- 应用容器使用只读根文件系统、移除全部 capability、`no-new-privileges`，并以隔离 tmpfs 覆盖 `/tmp` 和基础镜像声明的 `/data`；
- 主机只发布 `127.0.0.1:4310`。不得改为 `0.0.0.0`；
- 默认 `ACCESS_MODE=password`：除 `/health` 和静态资源外均要求登录；访问密码使用常量时间比较，登录失败受限速保护，会话为 12 小时、`HttpOnly`、`SameSite=Strict`、`Secure` 的签名 Cookie，密码或会话密钥轮换会使旧会话失效；
- 可选 `ACCESS_MODE=tailscale` 拒绝缺少或不匹配 `Tailscale-User-Login` 的请求，仅 `/health` 和静态资源例外；
- 只有会清除客户端伪造身份头并注入已验证身份的 Tailscale Serve，或具备等价行为的认证代理，才能放在应用前方；不得直接信任来自 LAN/Tailscale 的该请求头；
- 不使用 Funnel，不把应用或数据库直接暴露到公网。

## 准备

需要 Docker Engine、`curl` 和 `openssl`；当前 NAS 不依赖已损坏的 Compose v1 运行时。创建部署主机本地密钥：

```sh
cd infra/full
install -d -m 0700 secrets
umask 077
openssl rand -hex 32 >secrets/database-admin-password.txt
openssl rand -hex 32 >secrets/database-app-password.txt
openssl rand -base64 24 >secrets/access-password.txt
openssl rand -hex 32 >secrets/session-secret.txt
cp .env.example .env
```

四个密钥文件保持 `0600`，不得提交。默认密码模式不要求填写身份；若后续已有可信身份代理，可显式切换到 `ACCESS_MODE=tailscale` 并配置实际登录名。

## 启停

```sh
sh manage.sh preflight
sh manage.sh start
sh manage.sh status
```

停止应用而保留事实库：

```sh
sh manage.sh stop
```

`manage.sh` 通过固定名称和 `io.praxiscontrol.stack` 标签确认资源所有权；名称冲突但标签不匹配时拒绝操作。重复 `start` 会先向应用和 PostgreSQL 发送正常停止信号，再重建容器并保留命名数据库卷；已有决策和审计必须仍可读取。脚本记录两份数据库密码的 SHA-256 指纹；密码变化时在容器变更前拒绝隐式轮换，不会覆盖正在使用的运行时密码副本，也不会停止或移除现有容器。

`compose.yml` 保留为声明式参考和 Compose v2 环境入口，但不是当前 NAS 的运行依赖。数据库卷删除没有封装成日常命令；只能在已验证备份、明确目标和恢复路径后单独审批。

## 跨设备入口

应用健康后再把 HTTPS 反向代理连接到 `127.0.0.1:4310`；密码认证由应用完成，代理必须覆盖客户端传入的转发头且不得缓存受保护内容。若受官方 Tailscale Serve 支持，也可改用身份模式，并先验证实际 `Tailscale-User-Login` 与 `.env` 一致。当前 Headscale 环境没有可直接复用的 HTTPS Serve，因此不得降级为裸 HTTP 网络监听。

仓库提供 `nginx/praxis-control.conf.template` 与只生成新文件、不覆盖目标的渲染器。只有在真实域名、证书路径和允许网段均已确认后才运行：

```sh
PRAXIS_SERVER_NAME=praxis.example.net \
PRAXIS_CERTIFICATE=/etc/letsencrypt/live/praxis.example.net/fullchain.pem \
PRAXIS_CERTIFICATE_KEY=/etc/letsencrypt/live/praxis.example.net/privkey.pem \
PRAXIS_ALLOWED_LAN_CIDR=192.0.2.0/24 \
sh render-nginx.sh /tmp/praxis-control.conf
```

先对包含该文件的完整 Nginx 配置执行 `nginx -t`，保存回滚路径后再人工安装和 reload。模板默认允许 Tailscale `100.64.0.0/10` 与 `fd7a:115c:a1e0::/48`，并拒绝其他来源；如实际地址规划不同必须显式覆盖。`tests/nginx-config.sh` 只做一次性渲染和语法验收，不接触系统配置。

## 备份

```sh
sh backup.sh /secure/backup/praxis-control
```

该入口委托给 `manage.sh backup`，以应用角色生成 custom-format dump，拒绝覆盖，检查非空并运行 `pg_restore --list`。正式切换前还必须在独立数据库完成恢复、逐表计数和审计链验证；只验证归档目录不等于完成恢复演练。

## 隔离验收

`tests/smoke.sh` 会创建随机密码、临时镜像、两个隔离网络、临时 PostgreSQL 卷和两个应用容器，验证：

- 镜像可构建并包含 migration；
- 数据库无主机端口，应用只绑定回环；
- 应用角色最低权限；
- Tailscale 身份缺失/错误时 401，允许身份可访问；
- 密码模式未登录时拒绝 API，成功登录签发安全 Cookie，篡改、过期和密钥轮换后的会话均失效；
- PostgreSQL 写入、审计链、custom dump 和独立数据库恢复均有效；
- 恢复副本由真实应用重新读取并复核审计链。
- 预存密码指纹与新密码不一致时，生命周期入口拒绝启动且不改写运行时密码副本。

结束时脚本删除全部临时容器、网络、卷、镜像、密码和 dump。它不会连接或修改现有业务 PostgreSQL。
