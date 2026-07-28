# Linux 原生客户端

技术栈：GTK4、libadwaita、GJS JavaScript。它遵循 GNOME 应用和桌面入口约定，仅调用 Praxis Control API v1，不直接访问数据库。

开发运行需要 `gjs`、GTK4、libadwaita 和 libsoup 3 的 GObject Introspection 包：

```bash
gjs -m clients/linux/src/app.mjs
```

无桌面的 CI 冒烟测试：

```bash
node --test clients/linux/tests/core.test.mjs
node --check clients/linux/src/app.mjs
xvfb-run -a dbus-run-session -- gjs -m clients/linux/src/app.mjs --smoke-test
npm run test:linux-gui-connected
npm run build && npm run test:linux-gui-real-service
xvfb-run -a dbus-run-session -- npm run test:linux-gui-accessibility
```

连接型模拟验收命令会启动隔离的本机模拟 API，要求 GTK 窗口在 5 秒内完成 API v1、工作台与图谱读取；仅创建出窗口但未连接服务不会通过。

真实服务验收命令会使用临时 PGlite 数据目录启动编译后的 Praxis Control 服务，要求 GTK 客户端完成连接，再经服务关闭 API 安全退出并确认运行时状态文件已移除。

可访问性验收会在同一个 Xvfb/DBus 会话中启动真实服务和 GTK 窗口，检查关键控件及在线状态已经出现在 AT-SPI 树，并生成非空实际截图。

Meson 安装会生成 `praxis-control-linux` 启动器和 `io.praxiscontrol.App.desktop`。Windows 本机没有 GTK/libadwaita 运行环境；NAS 验收使用不保留运行依赖的一次性容器，常驻 Linux 桌面验收仍由后续 runner 或桌面环境承担。
