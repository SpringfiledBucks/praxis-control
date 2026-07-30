# 第二批业务能力：项目决策执行闭环与教程

状态：PARTIAL

日期：2026-07-30

## 范围

在服务端权威项目组合基础上，补齐“项目承接日常决策—实际执行—结果复盘”的纵向业务闭环，并同步交付可直接使用的评分教程。

## 已实现

- 日常决策可关联活动/维护项目，保存时同步创建 `advances` 图谱边；
- 决策执行状态机、非法跳转冲突、取消终态和结果写入门槛；
- 工作台“待复盘”指标改为只统计真实 `awaiting_review` 状态，取消记录仍保留在历史；
- 结果首次写入与修正使用不同审计事件；
- Web 详情页状态操作、结果门槛提示、可审计结果修正、历史项目标识与图谱关系；
- JSON API 与 OpenAPI 增加决策详情、状态推进和结果记录；
- CLI 增加 `checkin-get`、`checkin-status` 和 `outcome`；
- Windows 原生日常决策表单增加活动项目选择；
- PGlite/PostgreSQL 便携迁移携带 `project_id`；
- 应用内教程与仓库教程解释独立点数、评分锚点、风险硬门槛和结果复盘。

## 本地验证

- `npm run typecheck`、`npm run build`：通过；
- 共享测试：12 个测试文件通过、1 个 PostgreSQL 文件按本机环境跳过，41 项通过；
- Linux 客户端合同与语法检查：3 项通过；
- Windows WinUI 3 Release 构建：0 警告、0 错误；
- Windows GUI E2E：通过动态端口启动、原生表单分析/保存、工作台刷新和审计校验；
- Windows 便携包：通过，2468 个文件，动态端口启动和审计闭环成功；
- CLI 纵向闭环：`checkin-get`、两次状态推进、`outcome` 和审计校验通过，最终状态为 `reviewed`；
- 隔离浏览器：创建项目、关联决策、READY 分析、计划→执行→待复盘→闭环、结果展示和 3 节点/2 关系图谱均通过；
- 375px 页面宽度下教程无页面级横向溢出，浏览器控制台无错误。

## 待完成

- Gitea `verify`、`linux-gui-smoke`、`postgres-contract` 三作业通过后提升为 VERIFIED。
