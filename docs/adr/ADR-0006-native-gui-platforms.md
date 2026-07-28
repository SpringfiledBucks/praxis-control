# ADR-0006：Windows 与 Linux 原生 GUI 分轨

状态：ACCEPTED

日期：2026-07-28

## 决策

- Web 继续作为 Windows/Linux 共用且完整的跨平台入口；CLI 与 TUI 继续共用 TypeScript 核心和 HTTP API。
- Windows GUI 使用 C#、WinUI 3 与 Windows App SDK。首版只承担服务发现、工作台、日常决策、关系图谱和安全启停；通知、窗口管理、系统托盘及 Windows 11 小组件在核心稳定后按独立能力逐项接入。
- Linux GUI 使用 GTK4、libadwaita 与 GJS JavaScript，遵循 GNOME 应用生命周期、桌面入口、图标、GSettings 和自适应布局约定。Flatpak 是优先分发与隔离路径，不作为开发期唯一运行方式。
- 两套 GUI 都只调用版本化 JSON API，不打开 PGlite/PostgreSQL，不复制领域规则，不从 HTML 结构推断能力。
- API 的权威机器合同由 `src/contracts/openapi.ts` 提供，并通过 `GET /api/openapi.json` 暴露；`src/contracts/api.ts` 为 TypeScript 端提供运行时响应校验。
- 原生界面分别遵循 Windows 与 GNOME 的交互习惯，同时继承项目“淡雅、实用、克制的构成主义几何语言”。不强制两端像素级一致。

## 选择依据

- Microsoft 将 WinUI 3 + Windows App SDK 推荐为新建 Windows 原生桌面应用路线，支持 C#/C++ 与 XAML，并提供现代窗口和后续系统集成能力。
- GTK4 是 GNOME 的原生部件工具包；libadwaita 提供 GNOME 标准组件和自适应布局。GNOME 官方支持以 GJS JavaScript 编写应用，并提供对应的应用打包约定。
- Tauri、Electron、WebView 壳适合最大化 UI 复用，但会把两端差异主要压缩为宿主适配。本项目已经有完整 Web 回退入口，原生 GUI 的新增价值应当是系统习惯和系统能力，而不是复制一个浏览器窗口。
- 两个原生客户端都新增了运行时和发布链，因此必须由机器可读 API 合同隔离服务演进，不能共享数据库文件或隐式内部类型。

## 工具链与验收门槛

- 当前 Windows 主机只有 .NET/Windows Desktop 运行时，没有 .NET SDK、MSBuild 或 Visual Studio 构建工具；因此在安装受控工具链前，Windows GUI 只能完成架构和合同工作，不能声称可构建。
- 当前没有可用 Linux 桌面或 GTK4/libadwaita 构建环境；Linux GUI 必须在隔离的 Linux runner 或真实桌面环境中完成构建、启动和截图验收。
- 每套 GUI 的最小验收包括：API 主版本不兼容时拒绝运行、服务未启动时给出可执行操作、工作台可读、日常决策可提交、关系图可导航、安全退出语义明确、无数据库直连。

## 官方依据

- Microsoft Windows 应用开发文档：https://learn.microsoft.com/en-us/windows/apps/
- WinUI 3：https://learn.microsoft.com/en-us/windows/apps/winui/winui3/
- GTK4 入门：https://docs.gtk.org/gtk4/getting_started.html
- GNOME 语言支持：https://developer.gnome.org/documentation/introduction/languages.html
- libadwaita：https://gnome.pages.gitlab.gnome.org/libadwaita/
- GNOME HIG：https://developer.gnome.org/hig/
- GJS 应用打包约定：https://gjs.guide/guides/gtk/application-packaging.html

## 后果

原生 GUI 不会复用全部视图代码，初期交付速度低于统一 WebView 壳；换来的是清晰的系统集成边界、可独立演进的交互和对 Web 的可靠回退。Mac 仍不在当前范围。
