# Windows 原生客户端

技术栈：C#、.NET 8、WinUI 3、Windows App SDK。当前是框架依赖、非 MSIX 的开发期原生客户端，不写数据库，只调用 API v1。除工作台外，已提供“先分析、再确认保存”的原生日常决策窗口。

## 构建

需要 .NET 8 SDK；Windows SDK 构建引用由 NuGet 包提供。

```powershell
dotnet restore clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj
dotnet build clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj -c Release -p:Platform=x64
```

运行前先从仓库根目录启动服务：

```powershell
npm run praxis -- start --no-open
dotnet run --project clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj -p:Platform=x64
```

关闭窗口只退出 GUI；“安全关闭服务”按钮才会请求服务落盘并退出。未运行服务时，界面会显示可执行的启动命令。发布、签名和 MSIX 留到交互闭环验收后处理。
