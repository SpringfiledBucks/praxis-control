# Windows 11 PWA 小组件验收

状态：NOT VERIFIED（候选清单已具备，尚未在公开 HTTPS 与真机上注册）

生产 PWA 清单仍不包含 `widgets`。候选清单位于 `public/manifest.windows-widget.candidate.webmanifest`，只有完成本清单后才允许替换生产清单。小组件是 Web 的只读薄入口，不复制业务规则、不持有数据库凭据，也不执行正式写入。

## 已准备的候选能力

- 一个 `auth: true`、不允许多实例的“今日摘要”小组件；
- 自定义 Adaptive Card 模板和 300×304、透明圆角的中型选择器预览；
- 数据源仅为 `GET /api/widgets/summary`，响应为 `private, no-store`；
- 安装、恢复、Service Worker 激活和可用时的周期同步会刷新摘要；
- 会话失效和离线时立即以通用状态覆盖摘要，不把 API 响应写入 Cache Storage；
- 两个操作只打开工作台或记录页，后续写入仍由完整 Web 页面校验和确认。

Windows Widgets 主机自身会保存最后一次卡片 payload 以便显示陈旧状态，因此摘要中的自由文本可能在系统界面短期留存。这一点必须在真机离线、注销和会话过期测试中确认；若不能满足隐私预期，应在启用前移除 `mainAction` 自由文本，只保留计数和通用状态。

## 前置条件

1. 使用受信 HTTPS 的公开测试入口，PWA 可由 Microsoft Edge 正常安装；`localhost` 不能作为 PWABuilder 分发入口。
2. 使用专门的 Windows 11 测试账户和测试数据，不使用生产 secret 或真实敏感正文。
3. 按微软开发测试要求安装所需 Windows App SDK，并只在测试设备启用 Developer Mode。
4. 保持 Microsoft Defender、SmartScreen、Windows 防火墙和第三方安全软件正常开启；不得添加目录、进程、端口或文件类型排除项，不降低全局 PowerShell 执行策略。
5. 记录 Windows 版本、Edge 版本、Widgets/Web Experience Pack 版本、安装来源和候选提交 SHA。

Developer Mode 是小组件开发测试的系统前置条件，不等于允许关闭安全软件。若组织策略禁止启用，应将真机开发测试标记为 BLOCKED，改用受信商店测试分发，不提供绕过策略。

## 候选发布

在隔离测试部署中，以候选清单内容替换生产清单，提升 Service Worker 静态缓存版本并重新部署。确认浏览器开发工具显示：

- 清单可解析且 `widgets[0]` 的模板、数据、截图和图标 URL 均为同源 HTTPS；
- Service Worker 安装成功，静态模板可用，API 响应不进入 Cache Storage；
- PWA 可卸载并重新安装，旧 Service Worker 与旧小组件定义不会残留。

候选发布不得修改现有桌面客户端，不创建入站防火墙规则，不安装未签名的 Win32 provider。若 PWA 路线无法稳定通过，再单独评审已打包、受信签名的 Win32 provider，而不是恢复完整 Windows GUI 开发。

## 真机矩阵

每项均保存截图、时间和结果：

- Widgets Board 能发现并添加唯一实例；选择器预览为 300×304，透明圆角正确；
- 中型卡片在 100%、125%、150% 缩放和明暗主题下不截断关键状态；
- 键盘、Windows+W、屏幕阅读器和高对比度模式可识别标题、状态与两个操作；
- 已登录时显示主行动、计划可分配时间、待复盘与 WIP，且与同一时刻 Web API 一致；
- 注销、Cookie 过期和密码轮换后显示“需登录”，不继续显示旧自由文本；
- 断网、DNS 失败、证书失效和服务不可用时显示“离线”或系统错误状态，并可通过打开 Web 恢复；
- 点击“打开工作台”和“记录决策”只打开同源 HTTPS 深链接，不自动提交表单；
- 恢复网络、重新登录、Service Worker 更新和系统重启后可重新刷新；
- 卸载 PWA 后小组件注册和周期同步一并移除；
- Defender、SmartScreen、防火墙和第三方安全软件全程保持启用且无排除项。

## 启用门槛

只有上述矩阵全部通过、公开 HTTPS 续期与回滚已验证、隐私留存行为可接受、分发包受信且能正常卸载时，才把候选 `widgets` 成员合入生产 manifest。失败项必须保持 PARTIAL 或 BLOCKED，不以“在一台机器上出现过小组件”标记 VERIFIED。

参考：

- [Microsoft Edge：在 Windows Widgets Board 中显示 PWA 小组件](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/widgets)
- [Microsoft：Windows Widgets 设计原则](https://learn.microsoft.com/en-us/windows/apps/design/widgets/)
- [Microsoft：小组件选择器截图要求](https://learn.microsoft.com/en-us/windows/apps/design/widgets/widgets-picker-integration)
