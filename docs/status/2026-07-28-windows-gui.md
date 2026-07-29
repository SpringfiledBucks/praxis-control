# Windows 原生 GUI 验收

状态：VERIFIED

时间：2026-07-28

## 范围

首个 WinUI 3 原生壳：服务发现、API 主版本校验、工作台摘要、图谱计数、打开 Web、刷新和安全关闭服务。关闭 GUI 窗口不关闭服务。

## 可复现证据

- 使用隔离安装的 .NET SDK 8.0.413 完成 x64 Release 还原与构建；0 警告、0 错误；
- Windows App SDK 1.8 与 Windows SDK BuildTools 10.0.26100.4654 由 NuGet 锁定；
- 在 Windows 11 上真实启动 WinUI 窗口，读取 `GET /api/meta`、`GET /api/dashboard` 和 `GET /api/graph`；
- 界面显示 API v1、WIP、待复盘、近 7 日闭环、图谱点边计数和最近行动；
- 通过原生按钮刷新成功；
- 服务停止时再次真实启动客户端，界面正确禁用依赖服务的操作并显示可直接执行的启动命令；
- 通过原生按钮请求安全关闭后，CLI `praxis status` 验证 `running: false`；
- 原生日常决策窗口在隔离 PGlite 数据目录完成真实控件赋值、Bearer API 分析、确认保存和主窗口刷新；工作台显示 `READY`、待复盘 `1` 和最新行动“验证 Windows 原生表单闭环”；
- `audit-verify` 对保存结果返回 `valid: true`、`totalEvents: 1`、无失败项；
- `npm run test:windows-gui-e2e` 使用随机回环端口、系统临时数据目录和 Release WinUI 客户端连续两次返回 `WINDOWS_E2E: PASS`，成功后停止服务并清理测试目录；
- 最终关闭 GUI，未遗留 Praxis Control 服务或窗口。

## 已修正问题

首次启动暴露了当前运行时没有 `CardStrokeColorDefaultBrush` 资源的问题。已改为项目自有的淡雅中性色板，复测启动通过。

首次打开日常决策窗口时，Windows App SDK 因应用资源字典未合并 `XamlControlsResources` 而缺少 `TabViewButtonBackground`，导致 `Microsoft.UI.Xaml.dll` stowed exception。现在应用显式合并 WinUI 控件资源，二级窗口可稳定加载；入口同时捕获构造异常，应用级异常追加到当前 `PRAXIS_DATA_DIR\logs\windows-client.log`，不再只覆盖主窗口启动阶段。

自动提交测试仅在 `PRAXIS_WINDOWS_E2E_AUTOSUBMIT=1` 且数据目录位于系统临时目录 `PraxisControlE2E` 下时允许执行，不能写入默认用户事实库。

## 剩余范围

关系图原生导航、通知/托盘、MSIX、签名和 Windows 11 小组件仍属于后续范围。
