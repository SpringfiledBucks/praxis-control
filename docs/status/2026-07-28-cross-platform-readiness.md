# 跨平台验收状态

状态：PARTIAL

时间：2026-07-28

## 已验证

- Windows 11：Node.js 24、PGlite、Web、CLI、TUI、启停、备份、恢复、导出和审计链校验；
- Gitea CI 已定义 Windows/Ubuntu + Node.js 24 矩阵。

## 未验证

- 当前 Windows 主机未安装 WSL 发行版；
- NAS 为 Ubuntu Linux，但主机 Node.js 为 18，不满足项目 `>=24` 运行条件；
- Gitea 目标仓库和 Actions runner 尚未建立，Linux CI 未实际执行。

不为一次测试临时修改 Windows 或 NAS 的系统运行时。优先在 Gitea 仓库和隔离的 Node.js 24 CI runner 建立后完成 Linux 验收。
