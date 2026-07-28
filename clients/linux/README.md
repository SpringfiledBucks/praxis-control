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
```

最后一条命令会启动隔离的本机模拟 API，要求 GTK 窗口在 5 秒内完成 API v1、工作台与图谱读取；仅创建出窗口但未连接服务不会通过。

Meson 安装会生成 `praxis-control-linux` 启动器和 `io.praxiscontrol.App.desktop`。当前 Windows 主机与 NAS 都没有 GTK/libadwaita 运行环境，因此本地只能验证纯逻辑和语法；真实 GTK 启动由 Linux CI/桌面验收承担。
