[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$port = 8090
$envFile = Join-Path $projectRoot '.env'

if (Test-Path -LiteralPath $envFile -PathType Leaf) {
    foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
        if ($line -match '^\s*PORT\s*=\s*(?:"([^"#]*)"|''([^''#]*)''|([^#]*?))\s*(?:#.*)?$') {
            $portText = @($Matches[1], $Matches[2], $Matches[3]) |
                Where-Object { $null -ne $_ -and $_ -ne '' } |
                Select-Object -First 1
            if ($null -eq $portText) { $portText = '' }
            $portText = $portText.Trim()
            $parsedPort = 0
            if (-not [int]::TryParse($portText, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
                Write-Error "Invalid PORT in .env: '$portText'. Expected an integer from 1 to 65535."
                exit 1
            }
            $port = $parsedPort
        }
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js was not found. Install Node.js 20 or newer and try again.'
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error 'npm was not found. Install npm and try again.'
    exit 1
}

Write-Host "Using port $port"
$connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)

foreach ($processId in $processIds) {
    $processName = '<unknown>'
    try { $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName } catch {}
    Write-Host "Stopping $processName (PID $processId) on port $port"
    Stop-Process -Id $processId -Force -ErrorAction Stop
}

if ($processIds.Count -gt 0) {
    $deadline = (Get-Date).AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 100
        $remaining = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)

    if ($remaining.Count -gt 0) {
        Write-Error "Port $port is still in use after waiting 5 seconds."
        exit 1
    }
}

Push-Location -LiteralPath $projectRoot
try {
    Write-Host 'Starting npm start...'
    & npm start
    $npmExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $npmExitCode
