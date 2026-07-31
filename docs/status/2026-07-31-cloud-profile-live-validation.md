# 标准云部署实机隔离验收

状态：VERIFIED（隔离云栈） / PARTIAL（正式生产部署）

日期：2026-07-31

基线提交：`b7dcd22`

## 验收范围

本轮只在 Linux Docker 主机上创建带唯一前缀的临时项目、内部网络、
回环端口和数据卷。没有修改系统 Docker 配置，没有重启 Docker，也没有
连接、停止或重建既有业务容器和数据库。

构建输入为已校验的 Linux/amd64 官方基础镜像：

- `node:24-bookworm-slim`：平台摘要
  `sha256:a09aabc645e86e81e23dab78e0c0f2eaa233cab4277c7188232181a1a8bd5d39`；
- `postgres:16-bookworm`：平台摘要
  `sha256:c95fd5346040eba2de3c435e14874af18f5d681fb5848d4f081dbead0878af28`。

主机不能稳定连接公共镜像仓库，因此镜像由另一台可联网设备按平台摘要
获取，传输后再次核对字节数与 SHA-256，校验一致后才导入。Compose 使用
官方发布文件及其校验和，在项目专用临时 Docker 配置目录中加载，没有安装
到系统或用户常用插件目录。

## 可复现证据

- OCI 应用镜像在真实 Docker Engine 上完成两阶段构建；`npm ci`、
  TypeScript 编译和生产依赖裁剪成功，npm 审计报告 0 个已知漏洞；
- `preflight -> compose up` 成功，数据库健康，五个迁移按顺序完成，
  一次性迁移容器退出码为 0，应用容器进入健康状态；
- 存活与就绪探针、登录页、PWA manifest 和 service worker 返回成功；
  未认证的工作台与小组件 API 返回 401；真实密码登录返回 303，Cookie
  同时具有 `__Host-`、`HttpOnly`、`SameSite=Strict` 和 `Secure` 属性，
  签名会话可读取工作台；
- PostgreSQL 没有宿主机端口，后端网络为 internal；应用只绑定宿主机
  回环地址，并使用非 root 用户、只读根文件系统、`cap_drop: ALL` 和
  `no-new-privileges`，应用进程设置 `RUN_MIGRATIONS=false`；
- 仓库 `backup.sh` 生成非空 custom-format dump 并通过
  `pg_restore --list`；该 dump 随后恢复到独立 PostgreSQL 容器和独立卷，
  五个迁移记录、应用就绪探针与审计链校验均通过；临时恢复资源已删除。

## 实测发现与整改

Compose 的文件型 secret 在此 Linux 实现中保留宿主机文件权限。原说明把
secret 设置为 `0600`，导致 PostgreSQL 初始化阶段的非 root 用户无法读取
应用数据库密码。现改为：父目录必须为 `0700`，四个 secret 文件必须为
`0444`，Compose 继续以只读方式挂载。这样不同容器内的非 root UID 都能
读取，其他宿主机用户又无法穿越私有父目录。

`infra/cloud/preflight.sh` 已加入权限门槛，CI 测试覆盖以下情况：

- `0700` 目录与 `0444` 文件通过；
- `0600` 文件被拒绝；
- 可被其他宿主机用户穿越的 secret 目录被拒绝。

## 仍未完成的生产条件

隔离验收不等于正式上线。以下条件仍为 PARTIAL：

- 目标主机尚未正式安装和维护 Compose v2/Buildx；本轮只使用临时插件，
  镜像构建因缺少 Buildx 回退到即将淘汰的经典构建器；
- 应用镜像尚未由 Gitea CI 发布到受控 OCI 仓库并用不可变摘要部署；
- 尚未配置真实域名、可信 TLS 证书和经过整套配置校验的 HTTPS 反向代理；
- 尚未建立定时异机备份、保留策略、监控告警和周期性恢复演练；
- 尚未执行轻量数据导入、对账与权威事实源切换。

在上述条件完成前，不把本轮临时栈作为生产服务，也不对外开放回环端口。
