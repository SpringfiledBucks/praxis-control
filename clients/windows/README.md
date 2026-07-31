# Windows 原生客户端

技术栈：C#、.NET 8、WinUI 3、Windows App SDK。原生客户端不写数据库，只调用 API v1。开发构建为框架依赖、非 MSIX；Windows x64 便携交付使用自包含发布，不要求目标机另装 .NET 或 Windows App SDK Runtime。除工作台外，已提供“先分析、再确认保存”的原生日常决策窗口。

## 构建

需要 .NET 8 SDK；Windows SDK 构建引用由 NuGet 包提供。

```powershell
dotnet restore clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj
dotnet build clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj -c Release -p:Platform=x64
```

原生表单的隔离端到端验收会使用随机本机端口和系统临时数据目录，完成真实分析、保存、工作台刷新与审计链校验；成功后自动停止服务并清理临时目录：

```powershell
npm run test:windows-gui-e2e
```

如需指定隔离 SDK，可设置 `PRAXIS_DOTNET` 为 `dotnet.exe` 的绝对路径。失败时脚本保留诊断目录；成功时可传递 `-KeepArtifacts` 供人工复核。

## Windows x64 便携版

构建免安装目录和 ZIP：

```powershell
npm run package:windows-portable
```

输出位于 `artifacts\windows`，内含 Node.js 24、生产依赖和自包含 WinUI 客户端。`PraxisControl.cmd` 会先启动本机服务，再打开原生窗口；另有 Web、TUI、CLI 和 `PraxisControl-Stop.cmd` 安全关闭入口。数据始终保存在 `%LOCALAPPDATA%\PraxisControl`，不随程序目录替换或删除。

包级验收会从零组装便携目录，使用随机回环端口和隔离事实库启动包内 Node 与 WinUI，完成真实分析、保存、CLI 查询和审计链校验：

```powershell
npm run test:windows-package
```

当前自包含 x64 目录约 343 MB，ZIP 约 130 MB；这是无需管理员权限的 MVP 便携交付，不等同于后续 MSIX、签名或自动更新。

Windows 运行和排障不得要求关闭 Defender、SmartScreen、防火墙或第三方安全软件，也不得要求添加程序目录、进程或文件类型排除项。当前测试版提供 SHA-256 校验但尚未签名；如果安全产品拦截，应停止运行并提交包版本、校验结果和不含私人数据的诊断信息，不要通过关闭保护或添加排除项绕过。稳定分发前必须完成可信代码签名方案和安全软件保持启用的真实验收。

运行前先从仓库根目录启动服务：

```powershell
npm run praxis -- start --no-open
dotnet run --project clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj -p:Platform=x64
```

关闭窗口只退出 GUI；“安全关闭服务”按钮才会请求服务落盘并退出。未运行服务时，界面会提示使用启动入口或 CLI。签名、MSIX 和自动更新仍留到后续处理。
