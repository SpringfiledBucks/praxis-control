# 全量版生产访问边界

状态：PARTIAL（应用认证与代理模板已验证；真实证书、域名和数据库暴露收敛尚未执行）

## 已完成

- 新增 `ACCESS_MODE=password` 单用户访问模式，访问密码和会话签名密钥只从单行 secret 文件读取；生产模式强制 `Secure` Cookie；
- 登录密码使用常量时间摘要比较，连续失败触发临时限速；会话由独立密钥签名，12 小时过期，带 `HttpOnly`、`SameSite=Strict` 和 `Secure`，密码或会话密钥轮换会使旧会话失效；
- `/health` 与静态资源保持无会话可用，其余 Web 请求重定向到登录页，未认证 API 返回 401；POST 登录和退出均受现有 CSRF 令牌保护；
- 非本机模式不再向页面暴露安全关闭令牌，避免容器化全量版被浏览器误停；
- 新增 Nginx HTTPS 模板与严格渲染器：只允许明确的 LAN、Tailscale IPv4/IPv6 CIDR，覆盖 `X-Forwarded-For`，清空客户端伪造的 `Tailscale-User-Login`，只代理到 `127.0.0.1:4310`；
- NAS 使用一次性自签证书对渲染结果执行真实 `nginx -t`，输出 `Praxis Control nginx config: PASS`；未改动系统 Nginx；
- NAS 一次性全量栈在 `127.0.0.1:4316` 通过默认密码模式的 preflight、构建、启动、未认证 API 401、登录页 200、真实密码登录、签名会话访问、健康状态和正常停库/重启；PostgreSQL 日志确认 `database system was shut down`；
- 验收后临时容器、网络、卷、镜像、端口、源码和随机 secret 全部清理为 0。

## 当前环境事实

- 现有 `timescaledb` 以独立 Docker 容器运行，`5432/tcp` 发布到所有 IPv4/IPv6 主机地址；从 Windows 经 LAN 与 Tailscale 路径均可连接，具体地址不进入公开记录；
- 本次检查时 5432 已建立连接数为 0；排除数据库数据目录、缓存和依赖目录后，NAS 用户目录未发现静态 `5432`/`timescaledb` 配置引用。以上只是观察快照，不能证明该数据库无消费者；
- Nginx 仅监听 80，没有 443、证书目录或有效 TLS server；
- Headscale tailnet 的 MagicDNS 未启用，`tailscale serve status --json` 为空，不能假设具备官方 Tailscale Serve 的证书或身份头能力；
- 本阶段未连接数据库、未读取数据库内容，未修改或重启现有 `timescaledb`、Nginx、Tailscale 和其他业务容器。

## 生产变更门槛

1. 明确 Praxis Control 使用的域名和可信证书来源；证书、私钥及续期链路必须先独立验证；
2. 渲染 Nginx 配置到临时文件，执行 `nginx -t`，记录现有配置备份与回滚命令后，才允许在维护窗口安装和 reload；
3. 对现有 5432 至少完成连接观察、消费者确认和可恢复备份；未确认前不得停止或重建该容器；
4. 若现有数据库确需远程访问，使用明确来源 CIDR 的主机防火墙白名单；若只需本机访问，则在维护窗口重建为 `127.0.0.1:5432:5432` 或取消主机端口；
5. 从 LAN、Tailscale 和非允许来源分别反向验证：HTTPS 可用、HTTP/伪造身份头无越权、应用仍只绑定回环、5432 不再非预期暴露；
6. 完成独立恢复与审计链对账后，才允许把轻量事实源切换到全量版。
