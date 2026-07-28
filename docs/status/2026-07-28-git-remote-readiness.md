# Git 远端与镜像状态

状态：BLOCKED

时间：2026-07-28

## 已确认

- NAS Gitea 1.26.1 Web/API 与 Git SSH 均可达，SSH 身份为 `<GITEA_USER>`；
- 目标 Gitea 仓库 `<GITEA_OWNER>/praxis-control` 不存在；
- Gitea 配置没有启用 `ENABLE_PUSH_CREATE_USER`，其默认值为 `false`，因此现有 Git SSH 密钥不能通过首次推送自动建仓；
- 本机没有 Gitea API 令牌、已登录管理会话或 `tea` 配置，不通过修改全局配置、生成管理员令牌或直接修改 Gitea 数据库绕过该边界；
- 已连接的 GitHub 所有者为 `SpringfiledBucks`，当前没有 `SpringfiledBucks/praxis-control`；
- GitHub 连接器能管理已有仓库，但不提供创建仓库能力；本机也没有 `gh` CLI 或可供 Gitea 镜像使用的 GitHub 凭据；
- 本地仓库保持无 `origin`，避免将不存在的目标误报为已配置。

## 需要一次性人工完成

1. 在 Gitea UI 创建私有空仓库 `<GITEA_OWNER>/praxis-control`，不要初始化 README、License 或 `.gitignore`；
2. 在 GitHub UI 创建私有空仓库 `SpringfiledBucks/praxis-control`，同样不要初始化文件；
3. 在 Gitea 仓库设置中添加“推送镜像”到该 GitHub 仓库，并在 Gitea UI 内录入最小权限凭据；凭据不得发送到对话或写入本仓库；
4. 完成后由本机设置唯一 `origin` 为 Gitea、推送 `main`，再验收 Gitea Actions、镜像方向、GitHub commit SHA 和失败告警。

## 不采用的绕行

- 不临时开启整个实例的 push-to-create；
- 不利用 NAS Docker 权限生成 Gitea 管理员令牌；
- 不直接写 Gitea 数据库；
- 不让开发机同时向 Gitea 和 GitHub 双写。
