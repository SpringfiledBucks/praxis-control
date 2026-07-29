[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$DotnetPath = $env:PRAXIS_DOTNET,
    [switch]$NoArchive
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $projectRoot 'package.json'
$manifest = Get-Content -Raw -Encoding utf8 $manifestPath | ConvertFrom-Json
$packageName = "PraxisControl-$($manifest.version)-win-x64"
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $projectRoot 'artifacts\windows'
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$packageTarget = Join-Path $OutputRoot $packageName
$archiveTarget = "$packageTarget.zip"
$stagingBase = Join-Path ([System.IO.Path]::GetTempPath()) 'PraxisControlPackaging'
$stagingDirectory = Join-Path $stagingBase ([guid]::NewGuid().ToString('N'))
$packageDirectory = Join-Path $stagingDirectory $packageName
$appDirectory = Join-Path $packageDirectory 'app'
$runtimeDirectory = Join-Path $packageDirectory 'runtime'
$clientDirectory = Join-Path $packageDirectory 'client'
$succeeded = $false

function Resolve-DotnetExecutable {
    param([string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        return (Get-Item -LiteralPath $RequestedPath -ErrorAction Stop).FullName
    }

    $isolatedSdk = Join-Path $env:LOCALAPPDATA 'PraxisControl\tooling\dotnet-8.0.413\dotnet.exe'
    if (Test-Path -LiteralPath $isolatedSdk) {
        return $isolatedSdk
    }

    return (Get-Command dotnet -ErrorAction Stop).Source
}

function Write-AsciiLines {
    param([string]$Path, [string[]]$Lines)
    [System.IO.File]::WriteAllLines($Path, $Lines, [System.Text.Encoding]::ASCII)
}

try {
    if (Test-Path -LiteralPath $packageTarget) {
        throw "Package target already exists: $packageTarget"
    }
    if (-not $NoArchive -and (Test-Path -LiteralPath $archiveTarget)) {
        throw "Package archive already exists: $archiveTarget"
    }

    $node = (Get-Command node -ErrorAction Stop).Source
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $nodeVersion = & $node --version
    if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) {
        throw "Node.js 24 or newer is required to build the portable package. Found: $nodeVersion"
    }
    $dotnet = Resolve-DotnetExecutable $DotnetPath

    New-Item -ItemType Directory -Path $appDirectory, $runtimeDirectory, $clientDirectory -Force | Out-Null

    Push-Location $projectRoot
    try {
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
    }
    finally {
        Pop-Location
    }

    Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $appDirectory -Recurse
    Copy-Item -LiteralPath (Join-Path $projectRoot 'migrations') -Destination $appDirectory -Recurse
    Copy-Item -LiteralPath (Join-Path $projectRoot 'public') -Destination $appDirectory -Recurse
    Copy-Item -LiteralPath (Join-Path $projectRoot 'views') -Destination $appDirectory -Recurse
    Copy-Item -LiteralPath $manifestPath -Destination $appDirectory
    Copy-Item -LiteralPath (Join-Path $projectRoot 'package-lock.json') -Destination $appDirectory

    Push-Location $appDirectory
    try {
        & $npm ci --omit=dev --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
    }
    finally {
        Pop-Location
    }

    Copy-Item -LiteralPath $node -Destination (Join-Path $runtimeDirectory 'node.exe')

    $clientProject = Join-Path $projectRoot 'clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj'
    & $dotnet publish $clientProject -c Release -r win-x64 --self-contained true `
        -p:Platform=x64 -p:WindowsAppSDKSelfContained=true -p:EnableMsixTooling=true `
        -p:PublishTrimmed=false -o $clientDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Windows client publish failed.' }

    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable\README.zh-CN.txt') -Destination $packageDirectory

    Write-AsciiLines (Join-Path $packageDirectory 'praxis.cmd') @(
        '@echo off',
        'setlocal',
        'pushd "%~dp0app"',
        '"%~dp0runtime\node.exe" dist\cli\praxis.js %*',
        'set "PRAXIS_EXIT=%ERRORLEVEL%"',
        'popd',
        'exit /b %PRAXIS_EXIT%'
    )
    Write-AsciiLines (Join-Path $packageDirectory 'PraxisControl.cmd') @(
        '@echo off',
        'call "%~dp0praxis.cmd" start --no-open',
        'if errorlevel 1 (pause & exit /b 1)',
        'start "" "%~dp0client\PraxisControl.Windows.exe"'
    )
    Write-AsciiLines (Join-Path $packageDirectory 'PraxisControl-Web.cmd') @(
        '@echo off',
        'call "%~dp0praxis.cmd" start'
    )
    Write-AsciiLines (Join-Path $packageDirectory 'PraxisControl-TUI.cmd') @(
        '@echo off',
        'call "%~dp0praxis.cmd" tui'
    )
    Write-AsciiLines (Join-Path $packageDirectory 'PraxisControl-Stop.cmd') @(
        '@echo off',
        'call "%~dp0praxis.cmd" stop',
        'if errorlevel 1 pause'
    )

    [ordered]@{
        name = 'Praxis Control'
        version = [string]$manifest.version
        platform = 'win-x64'
        node = $nodeVersion
        selfContainedWindowsClient = $true
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $packageDirectory 'package-info.json') -Encoding utf8

    if (-not $NoArchive) {
        $stagingArchive = Join-Path $stagingDirectory "$packageName.zip"
        Compress-Archive -LiteralPath $packageDirectory -DestinationPath $stagingArchive -CompressionLevel Optimal
    }

    New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
    Move-Item -LiteralPath $packageDirectory -Destination $packageTarget
    if (-not $NoArchive) {
        Move-Item -LiteralPath $stagingArchive -Destination $archiveTarget
    }
    $succeeded = $true

    $files = Get-ChildItem -LiteralPath $packageTarget -Recurse -File
    [ordered]@{
        status = 'created'
        package = $packageTarget
        archive = if ($NoArchive) { $null } else { $archiveTarget }
        files = $files.Count
        bytes = ($files | Measure-Object -Property Length -Sum).Sum
    } | ConvertTo-Json -Compress
}
finally {
    if ($succeeded -and (Test-Path -LiteralPath $stagingDirectory)) {
        $resolvedStaging = (Resolve-Path -LiteralPath $stagingDirectory).Path
        $resolvedBase = [System.IO.Path]::GetFullPath($stagingBase) + [System.IO.Path]::DirectorySeparatorChar
        if (-not $resolvedStaging.StartsWith($resolvedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing cleanup outside the packaging root: $resolvedStaging"
        }
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
    elseif (-not $succeeded -and (Test-Path -LiteralPath $stagingDirectory)) {
        Write-Warning "Packaging diagnostics retained at: $stagingDirectory"
    }
}
