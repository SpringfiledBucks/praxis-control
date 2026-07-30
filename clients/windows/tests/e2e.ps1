[CmdletBinding()]
param(
    [string]$DotnetPath = $env:PRAXIS_DOTNET,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$clientProject = Join-Path $projectRoot 'clients\windows\PraxisControl.Windows\PraxisControl.Windows.csproj'
$clientDirectory = Split-Path $clientProject
$clientExe = Join-Path $clientDirectory 'bin\x64\Release\net8.0-windows10.0.19041.0\PraxisControl.Windows.exe'
$tsx = Join-Path $projectRoot 'node_modules\.bin\tsx.cmd'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'PraxisControlE2E'
$dataDirectory = Join-Path $testRoot ([guid]::NewGuid().ToString('N'))
$gui = $null
$serviceStarted = $false
$succeeded = $false
$previousDataDirectory = $env:PRAXIS_DATA_DIR
$previousPort = $env:APP_PORT

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

function Remove-VerifiedTestDirectory {
    param([string]$Target, [string]$Root)

    if (-not (Test-Path -LiteralPath $Target)) { return }
    $resolvedTarget = (Resolve-Path -LiteralPath $Target).Path
    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
    $rootPrefix = $resolvedRoot + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTarget.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing cleanup outside the test root: $resolvedTarget"
    }
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

try {
    if (-not (Test-Path -LiteralPath $tsx)) {
        throw 'node_modules is missing; run npm ci first.'
    }

    $dotnet = Resolve-DotnetExecutable $DotnetPath
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    $env:PRAXIS_DATA_DIR = $dataDirectory
    $env:APP_PORT = $null

    & $dotnet build $clientProject -c Release -p:Platform=x64
    if ($LASTEXITCODE -ne 0) { throw 'Windows client build failed.' }

    & $tsx (Join-Path $projectRoot 'src\cli\praxis.ts') start --no-open
    if ($LASTEXITCODE -ne 0) { throw 'Failed to start the isolated Praxis Control service.' }
    $serviceStarted = $true
    $runtimePath = Join-Path $dataDirectory 'runtime\service.json'
    $runtime = Get-Content -Raw -Encoding utf8 $runtimePath | ConvertFrom-Json
    $port = [int]$runtime.port

    $processInfo = [System.Diagnostics.ProcessStartInfo]::new($clientExe)
    $processInfo.UseShellExecute = $false
    $processInfo.WorkingDirectory = Split-Path $clientExe
    $processInfo.EnvironmentVariables['PRAXIS_DATA_DIR'] = $dataDirectory
    $processInfo.EnvironmentVariables['PRAXIS_WINDOWS_E2E_OPEN_CHECKIN'] = '1'
    $processInfo.EnvironmentVariables['PRAXIS_WINDOWS_E2E_AUTOSUBMIT'] = '1'
    $gui = [System.Diagnostics.Process]::Start($processInfo)

    $deadline = [DateTimeOffset]::Now.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $gui.Refresh()
        if ($gui.HasExited) {
            throw "Windows client exited before E2E completion with code $($gui.ExitCode)."
        }
        $windowTitle = $gui.MainWindowTitle
        if ($windowTitle -eq 'E2E FAILED - Praxis Control') {
            throw 'Windows client reported an E2E failure. Inspect the retained diagnostics directory.'
        }
    } while ($windowTitle -ne 'E2E SAVED - Praxis Control' -and [DateTimeOffset]::Now -lt $deadline)

    if ($windowTitle -ne 'E2E SAVED - Praxis Control') {
        throw "Windows check-in did not complete within 30 seconds. Current title: $windowTitle"
    }

    $headers = @{ Authorization = "Bearer $($runtime.apiToken)" }
    $dashboard = Invoke-RestMethod -Uri "$($runtime.url)/api/dashboard" -Headers $headers -Method Get
    if ([string]::IsNullOrWhiteSpace([string]$dashboard.latestCheckin.id)) {
        throw 'Dashboard did not return the check-in saved by the Windows client.'
    }
    if ($dashboard.latestCheckin.analysis_status -ne 'READY' -or $dashboard.awaitingReview -ne 0) {
        throw 'Unexpected analysis status or pending-review count after the Windows save.'
    }

    $auditJson = & $tsx (Join-Path $projectRoot 'src\cli\praxis.ts') audit-verify | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Audit verification command failed.' }
    $audit = $auditJson | ConvertFrom-Json
    if (-not $audit.valid -or $audit.totalEvents -ne 1) {
        throw 'Audit chain is invalid or has an unexpected event count.'
    }

    $succeeded = $true
    Write-Output "WINDOWS_E2E: PASS (port=$port, checkin=$($dashboard.latestCheckin.id), audit_events=$($audit.totalEvents))"
}
finally {
    if ($gui -and -not $gui.HasExited) {
        Stop-Process -Id $gui.Id -Force -ErrorAction SilentlyContinue
    }
    if ($serviceStarted) {
        try {
            & $tsx (Join-Path $projectRoot 'src\cli\praxis.ts') stop | Out-Host
        }
        catch {
            Write-Warning "Isolated service cleanup failed: $($_.Exception.Message)"
        }
    }
    $env:PRAXIS_DATA_DIR = $previousDataDirectory
    $env:APP_PORT = $previousPort

    if ($succeeded -and -not $KeepArtifacts) {
        Remove-VerifiedTestDirectory -Target $dataDirectory -Root $testRoot
    }
    elseif (Test-Path -LiteralPath $dataDirectory) {
        Write-Warning "Windows E2E diagnostics retained at: $dataDirectory"
    }
}
