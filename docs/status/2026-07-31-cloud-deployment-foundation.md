# 标准云部署代码基线验收

状态：代码基线 VERIFIED / 生产部署 PARTIAL

日期：2026-07-31

## 已验证

- 新增独立 `infra/cloud/` 档案，不修改现有 NAS `infra/full/` 运行栈；
- 使用官方 Node.js 基础镜像和非 root `node` 用户构建通用 OCI 应用镜像；
- PostgreSQL 不发布主机端口，应用只发布到主机回环地址；
- 数据库迁移由一次性 `migration` 服务完成，单应用副本以 `RUN_MIGRATIONS=false` 启动；
- `/health/live` 不访问数据库，`/health/ready` 验证连接、迁移缺失、校验和变化与未知迁移；`/health` 保持兼容；
- 应用与迁移容器使用只读根文件系统、移除 capabilities 并启用 `no-new-privileges`；
- 本地 `npm run typecheck`、`npm run build`、完整 `npm test`（44 passed，3 skipped）和云档案静态契约通过；
- Gitea Actions run 93 的 `verify`、`linux-gui-smoke`、`postgres-contract` 全部成功。

## 尚未完成

- 当前环境无法从公共镜像仓库取得官方 Node/PostgreSQL 镜像，尚未实际构建并启动本云档案；
- 正式镜像引用尚未固定为经测试的 digest；
- 真实域名、可信证书、完整 Nginx 配置测试和登录访问尚未验收；
- 备份脚本、异机保存和独立数据库恢复演练尚未形成实测证据；
- 登录限速仍为进程内状态，因此只允许单应用副本。

在上述门槛完成前，不得把“代码基线 VERIFIED”表述为“生产云部署可用”。
