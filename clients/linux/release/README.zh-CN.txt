Praxis Control Linux 发布包

当前 Linux 交付包含已编译的 TypeScript 服务、PGlite 数据迁移、Web 资源、CLI/TUI
以及 GTK4/libadwaita 原生客户端。它不内置 Node.js 或 Linux 桌面运行库。

运行要求：
- Node.js 24 或更高版本；
- npm；
- GJS；
- GTK4、libadwaita 与 libsoup 3 的 GObject Introspection 包。

不同发行版的包名存在差异。Debian/Ubuntu 系通常需要 gjs、gir1.2-gtk-4.0、
gir1.2-adw-1 和 gir1.2-soup-3.0；请以发行版当前软件源为准。

首次使用：
1. 运行 ./install-dependencies.sh 安装锁定的生产依赖；
2. 运行 ./praxis-control 启动本地服务和 GTK 原生客户端。

其他入口：
- ./praxis-control-web：启动服务并打开 Web 页面；
- ./praxis-control-tui：打开跨平台 TUI；
- ./praxis：CLI，例如 ./praxis status、./praxis backup；
- ./praxis-control-stop：安全关闭服务并等待数据库落盘。

关闭 GTK 窗口或浏览器不会停止服务。需要停止服务时，请运行
./praxis-control-stop。

事实数据保存到 $XDG_DATA_HOME/praxis-control；未设置 XDG_DATA_HOME 时为
~/.local/share/praxis-control。删除程序目录不会主动删除事实数据。
