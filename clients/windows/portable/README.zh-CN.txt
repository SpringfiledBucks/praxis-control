Praxis Control Windows 便携版

入口：
- PraxisControl.cmd：启动本机服务并打开 Windows 原生客户端。
- PraxisControl-Web.cmd：启动本机服务并打开浏览器页面。
- PraxisControl-TUI.cmd：打开跨平台终端界面。
- praxis.cmd：CLI；例如 praxis.cmd status、praxis.cmd backup。
- PraxisControl-Stop.cmd：安全关闭服务并等待数据库落盘。

关闭原生窗口或浏览器不会停止服务。需要停止服务时，请使用
PraxisControl-Stop.cmd，或在原生客户端中点击“安全关闭服务”。

事实数据不放在便携包内，而是保存在：
%LOCALAPPDATA%\PraxisControl

升级：先安全关闭服务，备份数据，再用新版本便携包替换旧程序目录。
程序目录与事实数据分离，替换程序不会主动删除事实库。

卸载：先安全关闭服务，再删除便携包目录。除非明确需要清除全部事实，
不要删除 %LOCALAPPDATA%\PraxisControl。
