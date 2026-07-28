param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [Parameter(Mandatory = $true)]
    [string]$TargetDirectory
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $BackupFile).Path
npm run praxis -- restore --file $resolved --target $TargetDirectory
