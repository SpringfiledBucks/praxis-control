# NAS 与 Gitea 只读验收

状态：VERIFIED

时间：2026-07-28 22:51 CST

## 证据

- `nas` LAN 路径和 `<NAS_TAILSCALE_ALIAS>` Tailscale 路径均可达；
- NAS SSH 可执行只读命令，主机已连续运行约 7 小时 44 分；
- Gitea Web/API 在两条路径均返回 HTTP 200，版本为 1.26.1；
- Gitea Git SSH 端口在两条路径均完成密钥认证，身份为 `<GITEA_USER>`；
- 已有仓库可以通过 SSH 执行 `git ls-remote`；
- 预定项目仓库 `<GITEA_OWNER>/praxis-control` 当前不存在；本地尚未配置 `origin`，也未进行推送；
- 443 当前未监听，因此后续跨设备 Web 访问不能默认视为已具备 HTTPS。

## 边界

本次未启动、停止或修改 NAS 服务，未创建仓库，未更改 Gitea、GitHub、网络或凭据配置。远端仓库创建与 Gitea 到 GitHub 的同步方向需单独执行并验收。
