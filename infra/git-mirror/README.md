# Gitea 到 GitHub 镜像

## 边界

- 非公开 Gitea 仓库是权威远端；
- GitHub `SpringfiledBucks/praxis-control` 是公开、只接受镜像写入的异地副本和 Release 分发入口；
- 本机仍只配置 Gitea `origin`，不直接双写；
- GitHub 不运行 Actions；CI/CD 统一由 Gitea Actions 执行；
- GitHub 使用只绑定该仓库、允许写入的 Deploy Key，不使用个人密码或通用访问令牌；
- 仅镜像分支和标签，不推送 Gitea 内部引用。

Gitea 1.26 不支持 SSH push mirror。这里使用 Gitea 官方文档给出的 `post-receive` 扩展点，并增加互斥锁、超时、有限重试、状态文件和日志轮转。

## NAS 安装位置

| 文件 | 位置 |
| --- | --- |
| 同步脚本 | `/data/git/.local/share/praxis-control-github-mirror/github-mirror-sync.sh` |
| Gitea hook | `<GITEA_REPOSITORY_DIR>/hooks/post-receive.d/github-mirror` |
| 私钥 | `/data/git/.ssh/praxis_control_mirror_ed25519` |
| SSH 配置 | `/data/git/.ssh/config` |
| GitHub 主机密钥 | `/data/git/.ssh/known_hosts` |
| 状态与日志 | `/data/git/.local/state/praxis-control-github-mirror/` |

私钥、GitHub 主机密钥和 SSH 配置属于 NAS 运行时配置，不进入本仓库。

## 运行语义

每次 Gitea 接收 push 后，hook 在后台启动同步：

1. `flock` 防止并发镜像；
2. 单次 push 最长 120 秒；
3. 最多尝试 3 次，重试间隔为 5 秒和 10 秒；
4. 强制同步 `refs/heads/*` 和 `refs/tags/*`，并清理 GitHub 上已从 Gitea 删除的同类引用；
5. `status` 原子记录源端 SHA、远端 SHA、时间和退出码；
6. `sync.log` 超过 1 MiB 时保留一份轮转日志。

失败不会回滚已经成功写入 Gitea 的提交；下一次 Gitea push 会再次尝试同步。也可以在 NAS 上以 `git` 用户手动执行同步脚本。

## 验收

```sh
docker exec -u git gitea /data/git/.local/share/praxis-control-github-mirror/github-mirror-sync.sh
docker exec gitea cat /data/git/.local/state/praxis-control-github-mirror/status
docker exec -u git gitea git ls-remote \
  ssh://git@github-praxis-control/SpringfiledBucks/praxis-control.git \
  refs/heads/main
```

验收时必须确认本地 `HEAD`、Gitea `main` 与 GitHub `main` 三个 SHA 一致，并检查 GitHub 仓库保持公开。
