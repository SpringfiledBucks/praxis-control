$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
npm install
npm run build
Write-Host '轻量版依赖和构建已就绪；无需数据库服务或 .env。'
