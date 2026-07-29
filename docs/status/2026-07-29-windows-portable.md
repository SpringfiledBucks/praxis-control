# Windows x64 便携交付验收

状态：VERIFIED（免安装、自包含 MVP；不含签名、MSIX 和自动更新）

日期：2026-07-29

## 范围

- `npm run package:windows-portable` 从生产构建组装 Windows x64 便携目录和 ZIP；
- 包内携带 Node.js 24、生产依赖、迁移、Web 静态资源和自包含 WinUI 3 客户端；
- `PraxisControl.cmd` 启动本机服务并打开原生 GUI；同时提供 Web、TUI、CLI 和安全关闭入口；
- 事实数据位于 `%LOCALAPPDATA%\PraxisControl`，不写入程序目录，因此替换或删除程序目录不会主动删除事实库。

## 验证证据

- 包级测试从空临时目录执行 TypeScript 生产构建和 `npm ci --omit=dev --ignore-scripts`；
- 自包含 WinUI 发布包含应用 `.pri` 资源索引；目录共 2457 个文件，约 343 MB；
- 默认发布命令生成的 ZIP 已检查 2469 个文件/目录项和全部关键入口，归档约 130 MB；
- ZIP 已完整解压为 2457 个文件，解压后 GUI 可执行文件哈希与源目录一致，包内 CLI `status` 可运行；
- 包内 Node 在随机回环端口启动真实 PGlite 服务；
- 包内 WinUI 客户端完成真实原生控件赋值、分析、确认保存和主窗口刷新；
- 包内 CLI 工作台返回 `READY`、待复盘 `1`；审计校验返回 `valid: true`、`totalEvents: 1`；
- 测试输出 `WINDOWS_PACKAGE: PASS` 后安全关闭服务，并清理成功用例的程序和事实数据临时目录。

## 已修正问题

首次自包含发布虽然携带 Windows App SDK DLL，但 `dotnet publish` 没有复制应用自身的 `.pri` XAML 资源索引，导致 MainWindow 启动时报 `XamlParseException`。发布命令现在显式启用 MSIX tooling 的资源复制并关闭裁剪；独立发布探针和完整便携包验收均通过。

## 当前边界

- 自包含目录体积较大，后续签名 MSIX 可改为框架依赖并复用系统运行时；
- 便携版不修改注册表、不创建系统级快捷方式，不需要管理员权限；
- 升级是“安全关闭、备份、替换程序目录”，尚无自动更新器；
- ARM64、签名信誉和安装/卸载界面尚未验收。
