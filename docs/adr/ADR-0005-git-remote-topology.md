# ADR-0005：Gitea 主远端与 GitHub 镜像

状态：ACCEPTED

日期：2026-07-28

## 决策

- NAS Gitea 是项目的权威 Git 远端；
- 本地仓库恢复联网后，将 `origin` 配置为 NAS Gitea；
- GitHub 由 Gitea 侧执行镜像或同步，不要求开发机同时向两个远端推送；
- NAS 因停电风险停机期间，只保留本地提交，不探测、不唤醒、不临时改用 GitHub 作为权威远端；
- 同步机制启用前必须验证方向、分支保护、凭据权限、冲突处理和失败告警，避免形成双主写入。

## 结果

开发机只有一个明确的发布目标，GitHub 作为异地副本和外部协作入口。2026-07-29 已建立 Gitea 到 GitHub 的单向 SSH 镜像：Gitea 1.26 不支持 SSH push mirror，因此使用官方文档给出的 `post-receive` 扩展点，并通过单仓库 Deploy Key、固定 GitHub 主机密钥、互斥锁、超时、有限重试、状态文件和日志完成验收。GitHub 不作为双主写入端。
