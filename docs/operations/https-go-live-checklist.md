# HTTPS 上线前检查清单

状态：NOT VERIFIED（尚未选择真实域名、证书和维护窗口）

本清单只定义上线门槛，不授权修改当前反向代理、证书、DNS、防火墙或现有数据库服务。首次上线仍采用单节点、单应用副本；应用只绑定主机回环地址，PostgreSQL 不发布主机端口。

## 1. 变更输入

上线前必须填写并由维护者确认：

- 域名及其 DNS 变更负责人；
- 证书签发与自动续期方式、证书链路径、私钥路径；
- 固定的应用 OCI digest 和 PostgreSQL digest；
- 回环上游端口、外部允许来源和预期网络路径；
- 维护窗口、观察窗口、回滚负责人和故障通知方式；
- 最近一次独立恢复演练的时间、备份哈希和审计链结果。

以上任一项缺失时，状态保持 BLOCKED，不以自签证书、临时端口公网暴露或关闭安全控制代替。

## 2. 只读预检

在安装配置前保存以下证据，不输出私钥、密码或会话密钥：

```sh
git rev-parse HEAD
docker compose --env-file .env config --images
docker compose --env-file .env ps
ss -ltnp
nginx -T > /secure/change-record/nginx-before.txt
openssl x509 -in "$CERTIFICATE" -noout -subject -issuer -dates -ext subjectAltName
openssl x509 -in "$CERTIFICATE" -noout -checkend 604800
openssl x509 -in "$CERTIFICATE" -noout -checkhost "$SERVER_NAME"
```

分别从证书和私钥导出公钥 DER 并比较 SHA-256，确认二者匹配；输出只保留公钥哈希，不复制私钥。确认 443 的现有监听者与归属，确认计划中的回环端口未被其他服务占用，并再次确认数据库服务没有意外的主机端口映射。

## 3. 暂存配置验证

只向新建的临时文件渲染配置：

```sh
PRAXIS_SERVER_NAME="$SERVER_NAME" \
PRAXIS_CERTIFICATE="$CERTIFICATE" \
PRAXIS_CERTIFICATE_KEY="$CERTIFICATE_KEY" \
PRAXIS_BIND_PORT="$APP_PORT" \
PRAXIS_HSTS_MAX_AGE=300 \
sh infra/cloud/render-nginx.sh /tmp/praxis-control.candidate.conf
```

候选配置必须满足：

- 只代理到 `127.0.0.1` 的固定上游端口；
- 覆盖客户端提供的转发地址，清空身份头和 Bearer 认证头；
- 证书和私钥使用绝对路径，私钥仅代理进程的必要账户可读；
- 完整 Nginx 配置执行 `nginx -t` 成功，而不只检查片段语法；
- 首次上线 HSTS 仅使用 300 秒，不启用 `includeSubDomains` 或 preload；
- 已记录原配置的精确恢复路径和 reload 命令。

## 4. 维护窗口验收

安装候选配置后先执行完整配置检查，成功后才允许平滑 reload，不重启主机、Docker 或无关服务。使用临时解析或受控 DNS 从每条预期路径验证：

- TLS 链受信、主机名匹配、证书有效期与续期任务正常；
- `/health/live` 和 `/health/ready` 经 HTTPS 返回成功；
- 未登录 Web 跳转登录页，未登录 API 返回 401；
- 登录 Cookie 包含 `Secure`、`HttpOnly` 和 `SameSite=Strict`；
- 伪造 `X-Forwarded-For`、身份头或 `Authorization` 不能越权；
- 受保护响应不被代理或浏览器公共缓存；
- HTTP 明确重定向到 HTTPS 或被明确拒绝，不存在第二个未受控入口；
- 应用仍只监听回环地址，数据库仍无主机端口；
- 日志不包含密码、令牌、Cookie、私钥或完整个人正文。

观察窗口内检查 4xx/5xx、登录失败、证书续期、磁盘空间、容器健康和备份任务。只有全部证据可复现时才标记 VERIFIED；随后可单独评审是否将 HSTS 提升至一年。

## 5. 回滚

代理配置失败时恢复变更前文件，执行完整 `nginx -t`，再平滑 reload；不删除数据库卷，不回退迁移，不改动无关虚拟主机。应用回滚只允许切换到与当前数据库迁移兼容的旧 digest。若迁移不兼容，先在隔离数据库恢复已验证备份并核对审计链，再安排事实源切换。

回滚后重新验证原有虚拟主机、证书、监听端口和 Praxis Control 的回环服务状态，并记录故障原因、影响时间与剩余客户端 HSTS 时间。
