# Git 远端与镜像状态

状态：VERIFIED（Gitea 权威远端与 GitHub 单向镜像）

更新：2026-07-29

## 拓扑

- 权威仓库：NAS Gitea 私有仓库 `<GITEA_OWNER>/praxis-control`；
- 异地镜像：GitHub 私有仓库 `SpringfiledBucks/praxis-control`；
- 开发机仅保留 Gitea `origin`：`ssh://git@<NAS_LAN_IP>:2222/<GITEA_OWNER>/praxis-control.git`；
- GitHub 不作为双主写入端，不要求开发机双写。

## 镜像实现

- GitHub 使用名为 `Gitea Praxis Control mirror` 的 SSH Deploy Key，权限限定为该单一仓库并允许写入；
- 私钥只存在于 Gitea 容器 `/data/git/.ssh/praxis_control_mirror_ed25519`，权限为 `0600`，不进入仓库；
- SSH 通过 `ssh.github.com:443`，`known_hosts` 来自 GitHub 官方 Meta API；ED25519、ECDSA 和 RSA 指纹均经 `ssh-keygen` 与官方值核对；
- Gitea 1.26 不支持 SSH push mirror，因此使用官方文档给出的 `post-receive` 扩展点；
- hook 在后台执行，仅同步 `refs/heads/*` 和 `refs/tags/*`，不推送 Gitea 内部引用；
- 同步具备 `flock` 互斥、单次 120 秒超时、最多 3 次尝试、状态原子写入和 1 MiB 日志轮转；
- 状态与日志位于 `/data/git/.local/state/praxis-control-github-mirror/`；仓库内可审计源文件位于 `infra/git-mirror/`。

## 验收证据

- GitHub 仓库已在 UI 确认为 `Private`；
- Deploy Key 已在 UI 确认为 `Read/write`，指纹为 `SHA256:P0A9ALMhIZISVWYRJ7khClpXxAaA73naEEQA/hXrpuM`；
- Gitea 容器通过该密钥成功认证 GitHub，并可读取空仓库；
- 首次手动镜像后，本地 `HEAD`、Gitea `main` 与 GitHub `main` 均为 `69af26c4c19333ff78b83862ce4cc6ee12446736`；
- 安装 hook 后向 Gitea 推送提交 `b7e1ad7cc336880d37dd709e3fdb484cc3acba9d`，状态文件自动记录 `result=success`，源端和 GitHub 远端 SHA 完全一致；
- Gitea 内置 `push_mirror` 记录数保持为 0；当前同步由 SSH hook 管理，不保存 GitHub PAT；
- Gitea Actions run 69 在前一提交上完成 `verify`、`linux-gui-smoke` 和 `postgres-contract`，三项均成功。

## 安全事件与处置

- 初始尝试按 Gitea 官方 HTTPS push mirror 方式使用单仓库 GitHub fine-grained PAT；
- Gitea 1.26 会把带凭据的 HTTPS remote URL 传给 `git-remote-https` 进程参数，诊断输出因此暴露了该令牌；
- 发现后立即停止同步进程、在 GitHub 撤销令牌、删除 Gitea push mirror 及裸仓库中残留的 HTTPS remote，并复核 `push_mirror` 记录数和裸仓库 remote 数均为 0、相关 Git 进程不存在；
- 随后改用 SSH Deploy Key，当前运行路径和进程参数均不含访问令牌；
- 泄露令牌已失效且从 Gitea 配置移除，不得恢复或复用。

## CI/CD 边界

- GitHub 仅作为私有镜像，不承担 Actions 或发布任务；
- 早期四次镜像提交曾让 GitHub 识别 `quality` 工作流，runs `#1`–`#4` 均因账户状态在启动阶段失败，未执行任何代码；
- 明确镜像边界后已删除 `.github/workflows/ci.yml`，后续镜像提交不再触发 GitHub Actions；
- Gitea Actions 是项目唯一权威 CI/CD 入口，NAS runner 持续执行 `verify`、`linux-gui-smoke` 和 `postgres-contract`。
