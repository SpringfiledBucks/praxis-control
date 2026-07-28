# ADR-0001：无头核心与多客户端架构

状态：ACCEPTED

日期：2026-07-28

## 决策

应用核心采用 TypeScript、Express、服务端页面和 JSON API。Web、CLI、TUI 是 Windows/Linux 共通客户端；Windows 与 Linux GUI 通过相同 API 提供差异化系统集成。macOS 不在当前范围。

客户端不得直接打开数据库。所有写入经过应用服务、领域规则、事务和审计边界。

## 原因

- 现有 TypeScript 领域和页面实现可复用；
- Web 可作为所有设备的完整回退入口；
- CLI/TUI 适合终端、自动化和受限环境；
- GUI 可按 WebView2、Linux 桌面门户、通知和服务管理等平台能力演进；
- 单一 API 避免四套客户端复制业务规则。

## 后果

首个纵向闭环先在 Web 验证。CLI/TUI 随后复用同一 API；原生 GUI 在接口稳定后分别设计。
