# 本地密钥目录

在部署主机本地创建以下四个权限为 `0600` 的单行随机密钥文件：

- `database-admin-password.txt`：仅用于初始化和数据库运维；
- `database-app-password.txt`：仅授予 Praxis Control 应用角色；
- `access-password.txt`：全量版单用户 Web 登录密码，至少 16 个字符；
- `session-secret.txt`：只用于签名浏览器会话，至少 32 个随机字符。

真实文件由仓库根 `.gitignore` 排除，不得提交、粘贴到对话或写入 Compose 环境变量。
