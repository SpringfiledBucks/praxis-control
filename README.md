# Praxis Control / 实践控制台

Praxis Control 是一个本地优先的个人实践与决策系统，围绕以下闭环组织信息：

> 现实输入 → 可解释分析 → 人工确认 → 执行结果 → 复盘归因 → 审计留痕

当前版本为 **0.1.0 MVP**，适合个人试用和协作测试，不建议直接用于无人值守的生产环境。

## 下载与平台支持

请从 [GitHub Releases](https://github.com/SpringfiledBucks/praxis-control/releases/latest) 下载与系统匹配的文件。

| 平台 | 发布文件 | 状态 | 使用方式 |
| --- | --- | --- | --- |
| Windows 11 x64 | `PraxisControl-0.1.0-win-x64.zip` | 已验证、推荐 | 解压后双击 `PraxisControl.cmd` |
| Linux | `PraxisControl-0.1.0-linux.tar.gz` | 已验证 GTK 客户端；需系统依赖 | 解压后先运行 `./install-dependencies.sh`，再运行 `./praxis-control` |
| macOS | 无 | 暂不支持 | 尚未进入设计、构建或测试范围 |

Windows 包内置 Node.js 24、生产依赖和自包含 WinUI 3 客户端，不需要管理员权限。Linux 包不内置 Node.js 与桌面运行库，需要 Node.js 24+、GJS、GTK4、libadwaita 和 libsoup 3；具体发行版安装方式见包内 `README.zh-CN.txt`。

## 主要能力

- 记录日常现实输入并生成可解释分析；
- 将日常决策关联到活动项目，并按计划、执行、待复盘、闭环状态推进；
- 人工确认后保存决策、执行结果与复盘，修正结果时保留追加审计；
- 通过稳定节点和有向关系呈现关系图谱；
- 提供 Web、CLI 和 TUI 跨平台入口；
- 提供 Windows WinUI 3 与 Linux GTK4/libadwaita 原生客户端；
- 支持审计链校验、备份、恢复和便携数据导入导出；
- 轻量版使用嵌入式 PGlite，全量版可切换 PostgreSQL。

首次使用建议先阅读[使用教程](docs/user-guide.md)。应用内“教程”页面提供两分钟流程、0–10 点数锚点、风险硬门槛、结果评分和完整示例；三个贡献/证据分数彼此独立，不需要凑成固定总分。

## 启动与关闭

### Windows 11 x64

1. 解压 `PraxisControl-0.1.0-win-x64.zip`；
2. 双击 `PraxisControl.cmd` 启动本地服务和 Windows 原生客户端；
3. 使用 `PraxisControl-Web.cmd`、`PraxisControl-TUI.cmd` 或 `praxis.cmd` 进入其他客户端；
4. 双击 `PraxisControl-Stop.cmd` 安全关闭服务。

关闭浏览器标签页或 GUI 窗口不会停止后台服务，必须使用安全关闭入口。

### Linux

解压 Linux 发布包后：

```sh
./install-dependencies.sh
./praxis-control
```

也可以分别使用：

```sh
./praxis start
./praxis dashboard
./praxis tui
./praxis stop
```

Linux 原生 GUI 遵循 GNOME 桌面约定；Web、CLI 和 TUI 的功能契约与 Windows 共用。

## 数据与隐私

轻量版默认只监听 `127.0.0.1`，端口由操作系统动态分配并通过运行状态同步给各客户端；不依赖 NAS、Docker 或外部 PostgreSQL。事实数据与程序目录分离：

- Windows：`%LOCALAPPDATA%\PraxisControl`
- Linux：`$XDG_DATA_HOME/praxis-control`；未设置时为 `~/.local/share/praxis-control`

替换或删除程序目录不会主动删除事实数据。升级前仍建议先运行备份并安全关闭服务。

## 从源码运行

需要 Node.js 24+：

```sh
npm ci
npm run build
npm run praxis -- start
```

常用命令：

```text
npm run praxis -- start
npm run praxis -- stop
npm run praxis -- status
npm run praxis -- dashboard
npm run praxis -- checkin-get --id <决策 ID>
npm run praxis -- checkin-status --id <决策 ID> --status executing
npm run praxis -- outcome --id <决策 ID> --file docs/examples/outcome-input.json
npm run praxis -- tui
npm run praxis -- backup
npm run praxis -- restore --file <备份文件> --target <不存在的独立目录>
npm run praxis -- audit-verify
npm run praxis -- export --target <新建 JSON 文件>
npm run praxis -- import-portable --file <JSON 文件> --confirm-empty-postgres
npm run praxis -- doctor
```

## 构建与验证

```sh
npm test
npm run test:linux-client
npm run typecheck
npm run build
```

Windows 实机还应执行：

```powershell
npm run test:windows-gui-e2e
npm run test:windows-package
npm run package:windows-portable
```

Linux 发布包执行：

```sh
npm run package:linux
```

真实 PostgreSQL 合同测试必须显式提供一次性测试库并设置 `POSTGRES_TEST_URL`；默认测试不会连接外部数据库。

架构决策见 [`docs/adr`](docs/adr)，部署边界见 [`docs/deployment.md`](docs/deployment.md)，视觉与交互约束见 [`docs/design-system.md`](docs/design-system.md)。服务运行时可通过 `GET /api/openapi.json` 读取跨客户端 API 合同。

## 仓库与协作

此 GitHub 仓库是公开镜像和 Release 分发入口；权威 Git、CI/CD 与正式集成仍由项目 Gitea 管理。外部问题可以提交到 GitHub Issues，代码协作请先通过 Issue 确认集成方式，避免 GitHub 与 Gitea 形成双主写入。

项目许可证尚未确定。仓库公开用于查看、测试和协作评估，不代表已授予开放源代码许可证中的复制、修改或再分发权利。
