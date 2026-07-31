# Windows 11 PWA 小组件候选状态

状态：PARTIAL（代码与资产候选已验证） / NOT VERIFIED（公开 HTTPS、真机与分发）

日期：2026-08-01

## 当前结果

- 生产 `manifest.webmanifest` 仍不注册 `widgets`，避免未经过真机和可信分发验证的功能出现在普通 PWA 安装中。
- 独立候选清单包含微软当前要求的名称、描述、唯一 tag、informational template、自定义 Adaptive Card URL、认证数据 URL、截图、图标和单实例约束。
- 中型选择器预览为 300×304 PNG、RGBA 透明圆角，视觉采用低饱和米色、深绿、几何曲线和少量暖色结构，不依赖动画或高对比装饰。
- Service Worker 在安装、恢复、激活和可用时的周期同步中刷新摘要；API 请求强制 `no-store` 和同源 Cookie。401 与网络/服务失败会分别覆盖为“需登录”和“离线”，静态模板可从白名单缓存恢复。
- 两个 `Action.Execute` 只打开工作台和记录页；没有直接业务写入、系统命令、数据库访问或安全软件配置。
- 本地 57 项测试中 54 通过、3 项按环境跳过；类型检查、构建、Service Worker 语法、三份 JSON 解析、PNG 尺寸/透明通道与云部署静态契约均通过。

## 未完成门槛

- 尚无公开受信 HTTPS 测试入口，候选清单未注册；
- 尚未验证 Edge PWA 安装、Widgets Board 发现、Windows 11 缩放/主题/辅助功能；
- 尚未验证 Windows Widgets 主机对最后 payload 的保留行为是否满足自由文本隐私要求；
- 尚未通过 PWABuilder/Store 或等价受信签名分发，因此不得要求用户绕过 SmartScreen 或安全产品。

真机步骤、故障矩阵和启用条件见 `docs/operations/windows-widget-validation.md`。
