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
- 最终关闭 GUI，未遗留 Praxis Control 服务或窗口。

## 已修正问题

首次启动暴露了当前运行时没有 `CardStrokeColorDefaultBrush` 资源的问题。已改为项目自有的淡雅中性色板，复测启动通过。启动期异常会写入 `%LOCALAPPDATA%\PraxisControl\logs\windows-client-startup.log`，便于无控制台的 WinExe 诊断。

## 剩余范围

日常决策原生录入、关系图原生导航、通知/托盘、MSIX、签名和 Windows 11 小组件不属于本次最小壳验收，将在共享 API 与核心流程继续稳定后增量实现。
