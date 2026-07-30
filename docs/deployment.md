# 部署说明

## 轻量版

```text
Windows/Linux Web、CLI、TUI
          → 127.0.0.1:操作系统动态端口
          → 本机 PGlite 数据目录
```

默认无需 `.env`。轻量本机服务直接监听端口 `0`，由操作系统从动态端口范围原子分配并立即占用端口，不扫描低端固定端口，也不存在“先探测再监听”的竞态。服务把实际地址写入运行状态文件，Web 启动器、CLI、TUI、Windows GUI 与 Linux GUI 均通过该文件发现服务。

同一数据目录在数据库初始化前取得启动锁，避免两个进程并发打开 PGlite。后台启动输出写入数据目录下的 `logs/service.log`；启动进程提前退出时，CLI 会直接报告退出码和日志路径。状态文件、启动锁和日志均位于当前用户的数据边界内。

显式设置 `APP_PORT` 时严格使用固定端口，被占用即失败，不静默切换。全量 PostgreSQL、反向代理及非本机访问模式必须显式配置固定端口。

关闭浏览器不会关闭服务。使用页面“安全关闭”、`praxis stop` 或平台快捷入口，服务会停止接收请求、关闭数据库并清理状态文件。

Windows x64 可通过 `npm run package:windows-portable` 生成免安装、自包含便携目录和 ZIP。便携目录中的入口分别承担原生 GUI、Web、TUI、CLI 和安全关闭；程序替换不触碰 `%LOCALAPPDATA%\PraxisControl`。升级前应先安全关闭并备份，卸载只删除程序目录，默认保留事实数据。当前便携版不提供签名、MSIX 或自动更新。

PGlite 备份只能恢复到不存在且与当前数据目录相互独立的目录：

```text
praxis restore --file <备份.tgz> --target <独立目录>
```

命令会打开恢复副本，验证迁移记录并统计项目和决策数量，不覆盖当前事实库。切换到恢复副本仍需单独确认。

`praxis export --target <新建 JSON 文件>` 通过统一 API 导出带格式版本、规则版本、表级计数和完整审计事件的可移植快照。命令拒绝覆盖已有文件；该格式当前用于核对和迁移准备，不承诺直接导入。

## 全量版

```text
多设备客户端
  → Tailscale/HTTPS + 认证
  → Linux/NAS 应用服务
  → 独立 PostgreSQL 数据库和低权限角色
```

NAS 已于 2026-07-28 完成主机、Gitea Web/API 与 Git SSH 的只读恢复确认。全量版应用、证书、认证、PostgreSQL、备份恢复和访问边界仍须分别验收，不直接把轻量数据切换过去。

隔离容器基线位于 `infra/full/`：PostgreSQL 不发布端口，应用仅发布到主机 `127.0.0.1:4310`，数据库和访问凭据均通过 secret 文件提供。默认由应用完成单用户密码会话认证；具备可信身份头代理时仍可切换到 Tailscale 身份模式。NAS 隔离验收已覆盖真实写入、审计、备份、独立恢复、密码登录及 Nginx 模板语法；真实证书和生产 5432 暴露面仍未满足上线门槛，详见 `docs/status/2026-07-29-full-profile-container.md` 与 `docs/status/2026-07-29-production-access.md`。

## Git 远端

本地仓库的权威远端是非公开 Gitea 仓库；GitHub 公开仓库 `SpringfiledBucks/praxis-control` 作为代码镜像、外部预览和 Release 分发入口，由 Gitea 侧通过专用 SSH Deploy Key 和 `post-receive` hook 单向同步。本地只保留 Gitea `origin`，不直接双写；GitHub 不运行 Actions。内部 Gitea 地址、仓库路径和网络拓扑不得写入公开文档或工作流常量。

## 提升迁移

轻量版升级全量版是一次受控迁移：备份 PGlite → 导出 → 空 PostgreSQL 迁移 → 导入 → 对账 → 切换事实源。MVP 不实现两个数据库长期双向复制。
