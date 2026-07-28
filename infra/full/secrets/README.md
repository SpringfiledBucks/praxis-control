# 本地密钥目录

在部署主机本地创建以下两个权限为 `0600` 的单行随机密码文件：

- `database-admin-password.txt`：仅用于初始化和数据库运维；
- `database-app-password.txt`：仅授予 Praxis Control 应用角色。

真实文件由仓库根 `.gitignore` 排除，不得提交、粘贴到对话或写入 Compose 环境变量。
