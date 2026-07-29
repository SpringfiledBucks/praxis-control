# Windows 原生客户端 CI 平台边界

状态：VERIFIED（边界已实测；Windows Runner 尚未部署）

时间：2026-07-29

## 目标

判断现有 NAS Linux runner 能否直接承担 C#、WinUI 3 与 Windows App SDK 客户端的完整构建，从而避免为 Gitea Actions 部署 Windows 虚拟机。

## 环境与路径

- 开发机通过 Tailscale 直连 `<NAS_HOSTNAME>`（`<NAS_TAILSCALE_IP>`）；`tailscale ping` 为直连，Gitea Web API 与 Git SSH 均可访问；
- NAS：Ubuntu 24.04、x86_64、KVM 可用、32 个逻辑处理器、约 62 GiB 内存；
- 测试运行时：现有 `praxis-control-ci:node24-gtk4-v1` 隔离容器，临时安装 Alpine `dotnet8-sdk 8.0.129`；
- 目标项目：`clients/windows/PraxisControl.Windows/PraxisControl.Windows.csproj`，`net8.0-windows10.0.19041.0`、WinUI 3、Windows App SDK 1.8。

## 可复现结果

以下边界已在 NAS Linux 环境实测：

1. 使用 `EnableWindowsTargeting=true` 可以完成 NuGet 依赖还原；
2. MSBuild 进入 WinUI XAML 编译阶段后调用 Windows App SDK 自带的 `XamlCompiler.exe`；
3. Linux 将该 PE 可执行文件交给 shell 后失败，随后报告未生成 `output.json`；
4. 测试在一次性目录和容器中执行，失败后临时目录已清理并验证不存在。

核心错误：

```text
XamlCompiler.exe: syntax error: unexpected newline
error: XamlCompiler output file ".../output.json" was not created.
```

## 决策

- 不把 Linux 交叉编译任务接入 Gitea Actions，因为它会稳定失败且不能形成有效质量门；
- 共享 TypeScript、HTTP API、数据库合同与 Linux GTK 客户端继续由现有 Linux runner 验收；
- Windows 原生客户端当前继续使用 Win11 实机的本地构建和交互证据；
- 需要持续 Windows 构建、打包或 GUI 自动化时，再在隔离 Windows 主机或 NAS KVM Windows VM 内注册 `windows-x64:host` runner；
- 不使用 Linux 上的 Windows 容器替代 Windows 内核，也不把未经 Windows 运行验证的产物作为发布件。

## NAS 虚拟机可行性边界

NAS 硬件和内核具备部署 Windows VM 的条件，但当前未安装或启用 libvirt/QEMU。本次没有安装虚拟化组件、创建磁盘、下载 Windows 镜像、配置许可证或注册 Runner。
