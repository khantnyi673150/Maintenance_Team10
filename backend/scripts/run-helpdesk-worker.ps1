$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Parent $PSScriptRoot
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$environmentFile = Join-Path $backendDirectory '.env.local'
$workerFile = Join-Path $PSScriptRoot 'helpdesk-worker.mjs'
$logFile = Join-Path $backendDirectory '.helpdesk-worker.log'
if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 1MB) {
    $recentLines = @(Get-Content -LiteralPath $logFile -Tail 200)
    $recentLines | Set-Content -LiteralPath $logFile -Encoding UTF8
}
# Arguments contain file paths only. Credentials are loaded by Node from the ignored env file.
& $nodeExecutable "--env-file=$environmentFile" $workerFile --once 2>&1 | Out-File -LiteralPath $logFile -Append -Encoding UTF8
exit $LASTEXITCODE
