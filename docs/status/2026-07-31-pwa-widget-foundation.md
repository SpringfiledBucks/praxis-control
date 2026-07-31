# PWA 与 Windows 小组件共同底座

状态：PWA 代码基线 VERIFIED / Windows 小组件 NOT VERIFIED

日期：2026-07-31

## 已实现

- Web 增加可安装清单、独立 SVG 图标、根作用域 Service Worker 与离线状态页；
- Service Worker 只缓存公开静态外壳，不缓存 HTML、API、登录态或决策数据；
- 新增受现有认证保护的 `GET /api/widgets/summary`，只返回今日主行动、计划可分配时间、待复盘数和 WIP 摘要；
- “计划可分配时间”由用户填写的可支配时间扣除储备比例计算，不冒充实时余额；
- 新增只读 Adaptive Card 模板；按钮只打开工作台或记录页，不执行正式写入；
- 会话失效时小组件工作线程准备显示“需登录”状态，不缓存敏感正文；
- PWA 清单当前故意不注册 `widgets` 成员，避免把未经 Windows 11、公开 HTTPS、截图和商店打包验收的候选能力伪装为可用小组件。

## 验收边界

代码测试覆盖清单结构、静态缓存白名单、禁止 API 缓存、只读动作和摘要计算。Windows 小组件仍须在可信 HTTPS 公共测试入口上完成 PWA 安装、Adaptive Card 尺寸、登录失效、恢复、深链、明暗主题、键盘/屏幕阅读器和 Microsoft Store/PWABuilder 打包验证。

本地证据：`npm run typecheck`、`npm run build`、完整 `npm test`（48 passed，3 skipped）、Linux 客户端合同、JavaScript 语法和两份 JSON 解析均通过；权威 Gitea CI 结果待本批提交后补记。

整个流程不得要求关闭 Defender、SmartScreen、防火墙或第三方安全软件，也不得要求添加排除项。被安全产品拦截时必须安全失败并从签名、来源、哈希和最小诊断证据处理。
