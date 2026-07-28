# Git 远端与镜像状态

状态：PARTIAL（Gitea 已验证，GitHub 镜像待配置）

更新：2026-07-29

## 已完成

- NAS Gitea 1.26.1 私有仓库 `<GITEA_OWNER>/praxis-control` 已建立，默认分支为 `main`；
- 本地唯一 `origin` 已设置为 `ssh://git@<NAS_LAN_IP>:2222/<GITEA_OWNER>/praxis-control.git`，本机不直接向 GitHub 双写；
- 最近一次功能基线提交为 `72d0ecf9d03b080c51786d4a54b3a23213292686`，当次本地 `main`、`origin/main` 与 Gitea `refs/heads/main` 已对齐；
- Gitea Actions runner v0.2.11 已运行，标签为 `ubuntu-latest, linux`；
- Gitea Actions run 68 已在权威提交上完成，`verify`、`linux-gui-smoke`、`postgres-contract` 三个作业全部成功；
- CI 使用 NAS 本地镜像 `praxis-control-ci:node24-gtk4-v1`，固定基础镜像 digest，并包含 Node 24、GTK4/GJS、AT-SPI、Noto CJK、Meson 和桌面校验工具；镜像不包含仓库源码或凭据；
- 工作流按 `${{ github.sha }}` 检出权威提交，临时作业令牌只作为单条 Git 命令的请求头使用，不写入 remote URL 或 Git 配置；
- PostgreSQL 合同作业使用一次性 `timescale/timescaledb:latest-pg16` service，不连接现有 NAS 业务数据库。

详细证据见 `docs/status/2026-07-29-gitea-ci.md`。

## 尚未完成

- 已连接的 GitHub 所有者为 `SpringfiledBucks`，但 `SpringfiledBucks/praxis-control` 尚不存在；
- 当前 GitHub 连接器不提供创建仓库能力；应用内浏览器没有 GitHub 登录会话，本机也没有可用的 Chrome 或 `gh` CLI；
- 因目标仓库与最小权限凭据均不存在，Gitea 到 GitHub 的推送镜像尚未配置，镜像 commit SHA 和失败告警均为 NOT VERIFIED。
- NAS Gitea 数据库只读核验显示仓库 id 15 的 `push_mirror` 记录数为 0；未读取或输出任何凭据字段。

## 需要一次性人工完成

1. 在 GitHub UI 创建私有空仓库 `SpringfiledBucks/praxis-control`，不要初始化 README、License 或 `.gitignore`；
2. 在 Gitea 仓库设置中添加到该 GitHub 仓库的“推送镜像”，并仅在 Gitea UI 内录入最小权限凭据；凭据不得发送到对话或写入本仓库；
3. 完成后验收镜像方向、GitHub `main` commit SHA、后续推送同步和失败告警。

## 安全与审计记录

- 建仓使用了一次性、最小范围的 Gitea 临时令牌；API 自撤销未成功后，仅按令牌 id、用户 id、名称和 scope 四项条件删除对应数据库记录，并复核目标记录为 0、令牌总数恢复；未保留令牌，未改动其他令牌；
- 不开启实例级 push-to-create，不把凭据写入仓库，不让开发机承担双远端发布；
- 历史 run 59 因早期工作流包含当前 runner 不支持的 `windows-latest` 作业，界面仍显示等待；相关执行已停止且不占用 runner。保留该记录用于审计，不直接修改 Actions 数据表。
