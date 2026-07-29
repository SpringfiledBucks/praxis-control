[CmdletBinding()]
param(
    [string]$DotnetPath = $env:PRAXIS_DOTNET,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$packageTestRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'PraxisControlPackageTest'
$outputRoot = Join-Path $packageTestRoot ([guid]::NewGuid().ToString('N'))
$dataTestRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'PraxisControlE2E'
$dataDirectory = Join-Path $dataTestRoot ([guid]::NewGuid().ToString('N'))
$gui = $null
$serviceStarted = $false
$succeeded = $false
$previousDataDirectory = $env:PRAXIS_DATA_DIR
$previousPort = $env:APP_PORT

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
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
    New-Item -ItemType Directory -Path $outputRoot, $dataDirectory -Force | Out-Null
    & (Join-Path $projectRoot 'clients\windows\package-portable.ps1') `
        -OutputRoot $outputRoot -DotnetPath $DotnetPath -NoArchive
    if ($LASTEXITCODE -ne 0) { throw 'Portable package build failed.' }

    $packages = @(Get-ChildItem -LiteralPath $outputRoot -Directory)
    if ($packages.Count -ne 1) { throw 'Expected exactly one portable package directory.' }
    $packageDirectory = $packages[0].FullName
    $praxis = Join-Path $packageDirectory 'praxis.cmd'
    $client = Join-Path $packageDirectory 'client\PraxisControl.Windows.exe'
    foreach ($required in @($praxis, $client, (Join-Path $packageDirectory 'PraxisControl.cmd'), (Join-Path $packageDirectory 'PraxisControl-Stop.cmd'))) {
        if (-not (Test-Path -LiteralPath $required)) { throw "Required package entry is missing: $required" }
    }

    $port = Get-FreeTcpPort
    $env:PRAXIS_DATA_DIR = $dataDirectory
    $env:APP_PORT = [string]$port
    & $praxis start --no-open
    if ($LASTEXITCODE -ne 0) { throw 'Packaged service failed to start.' }
    $serviceStarted = $true

    $processInfo = [System.Diagnostics.ProcessStartInfo]::new($client)
    $processInfo.UseShellExecute = $false
    $processInfo.WorkingDirectory = Split-Path $client
    $processInfo.EnvironmentVariables['PRAXIS_DATA_DIR'] = $dataDirectory
    $processInfo.EnvironmentVariables['PRAXIS_WINDOWS_E2E_OPEN_CHECKIN'] = '1'
    $processInfo.EnvironmentVariables['PRAXIS_WINDOWS_E2E_AUTOSUBMIT'] = '1'
    $gui = [System.Diagnostics.Process]::Start($processInfo)

    $deadline = [DateTimeOffset]::Now.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $gui.Refresh()
        if ($gui.HasExited) { throw "Packaged Windows client exited with code $($gui.ExitCode)." }
        $windowTitle = $gui.MainWindowTitle
        if ($windowTitle -eq 'E2E FAILED - Praxis Control') { throw 'Packaged Windows client reported an E2E failure.' }
    } while ($windowTitle -ne 'E2E SAVED - Praxis Control' -and [DateTimeOffset]::Now -lt $deadline)
    if ($windowTitle -ne 'E2E SAVED - Praxis Control') { throw 'Packaged Windows check-in timed out.' }

    $dashboardJson = & $praxis dashboard | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Packaged dashboard command failed.' }
    $dashboard = $dashboardJson | ConvertFrom-Json
    if ($dashboard.latestCheckin.analysis_status -ne 'READY' -or $dashboard.awaitingReview -ne 1) {
        throw 'Packaged dashboard did not contain the saved check-in.'
    }

    $auditJson = & $praxis audit-verify | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Packaged audit command failed.' }
    $audit = $auditJson | ConvertFrom-Json
    if (-not $audit.valid -or $audit.totalEvents -ne 1) { throw 'Packaged audit chain is invalid.' }

    $succeeded = $true
    Write-Output "WINDOWS_PACKAGE: PASS (port=$port, files=$((Get-ChildItem -LiteralPath $packageDirectory -Recurse -File).Count), audit_events=$($audit.totalEvents))"
}
finally {
    if ($gui -and -not $gui.HasExited) {
        Stop-Process -Id $gui.Id -Force -ErrorAction SilentlyContinue
    }
    if ($serviceStarted) {
        try { & $praxis stop | Out-Host }
        catch { Write-Warning "Packaged service cleanup failed: $($_.Exception.Message)" }
    }
    $env:PRAXIS_DATA_DIR = $previousDataDirectory
    $env:APP_PORT = $previousPort

    if ($succeeded -and -not $KeepArtifacts) {
        Remove-VerifiedTestDirectory -Target $outputRoot -Root $packageTestRoot
        Remove-VerifiedTestDirectory -Target $dataDirectory -Root $dataTestRoot
    }
    else {
        if (Test-Path -LiteralPath $outputRoot) { Write-Warning "Package diagnostics retained at: $outputRoot" }
        if (Test-Path -LiteralPath $dataDirectory) { Write-Warning "Data diagnostics retained at: $dataDirectory" }
    }
}
