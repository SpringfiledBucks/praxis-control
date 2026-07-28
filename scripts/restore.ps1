param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $BackupFile).Path

Write-Host 'BLOCKED：恢复会覆盖或冲突现有数据，本脚本不会自动执行。'
Write-Host "已验证备份文件存在：$resolved"
Write-Host '请先创建全量备份、确认恢复目标和停机窗口，再由管理员执行 pg_restore。'
exit 2
