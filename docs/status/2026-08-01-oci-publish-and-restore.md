# Gitea OCI 发布与 digest 部署验收

状态：VERIFIED（隔离发布与恢复链） / PARTIAL（真实 HTTPS 生产入口）

日期：2026-08-01

## 已验证

- Gitea `quality` run 41 的 `verify`、`linux-gui-smoke`、`postgres-contract` 和 `oci-image` 全部成功；OCI 发布任务只在主分支 push 且前三项质量任务成功后运行。
- 发布凭据为仓库 secret，令牌范围仅为 `write:package`；临时配置令牌已经撤销。明文 registry 认证只允许经同机回环地址，令牌通过标准输入交给 Docker 并在退出时注销。
- Buildx 对本地 `node:24-bookworm-slim` 的镜像 ID 和平台执行锁定校验，拒绝隐式替换基础镜像；应用使用完整提交 SHA 标签，并返回不可变 manifest digest。
- 本次 manifest digest 为 `sha256:b08c19070b7a36950c7858a7ec80fd0909beb1ed1e9b71d7571b4eaa82360494`。Gitea package 元数据记录 `linux/amd64`、公开源码地址和对应提交。
- 隔离 Compose 栈以该 digest 启动，未在部署主机重建应用镜像；一次性迁移、数据库健康、应用就绪、回环端口绑定、数据库无主机端口和未认证小组件 API 401 均通过。
- `backup.sh` 生成 custom-format 备份并通过 `pg_restore --list`；备份随后恢复到独立 PostgreSQL 容器和独立卷，五条迁移记录、就绪探针和追加式审计链验证通过。测试备份 SHA-256 为 `9b1401dea83f96493387419730d2a966482c01186dd0d8b04b49c9db0c56b22b`。
- 验收结束后，临时应用、数据库、恢复容器、网络、卷、回环端口、随机 secret 和测试目录均已清理。发布镜像与用户级 Compose/Buildx 工具保留，供后续受控部署使用。

## 已知边界

- 当前 Buildx 使用 Docker driver，不支持 attestation；流水线显式关闭自动 provenance，不能把 digest 误称为签名或来源证明。引入受支持 builder、签名身份和验证策略后才能增加可信 provenance。
- 真实域名、可信证书、自动续期、完整代理配置、监控与维护窗口尚未选择；当前结果不能表述为生产 HTTPS 已上线。
- GitHub 继续仅作为公开代码镜像和 Release 入口，不运行发布流水线；OCI 权威发布发生在 Gitea。

下一步按 `docs/operations/https-go-live-checklist.md` 收集域名、证书和回滚输入，在独立临时入口完成验证后再申请生产变更。
