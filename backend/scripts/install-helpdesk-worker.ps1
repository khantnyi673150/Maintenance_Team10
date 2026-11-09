$ErrorActionPreference = 'Stop'
$taskName = 'Maintenance-Team10-Helpdesk-Delivery'
$runnerFile = Join-Path $PSScriptRoot 'run-helpdesk-worker.ps1'
$backendDirectory = Split-Path -Parent $PSScriptRoot
$modernPowerShell = Get-Command pwsh -CommandType Application -ErrorAction SilentlyContinue
$powerShellExecutable = if ($modernPowerShell) { $modernPowerShell.Source } else { Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
if (-not (Test-Path -LiteralPath (Join-Path $backendDirectory '.env.local'))) {
    throw 'Configure backend/.env.local before installing the delivery task.'
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    $existingRunner = @($existing.Actions | Where-Object { $_.Arguments -like "*$runnerFile*" })
    if ($existingRunner.Count -ne 1) {
        throw 'A different task already uses this name; it was not changed.'
    }
}
$action = New-ScheduledTaskAction -Execute $powerShellExecutable -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$runnerFile`"" -WorkingDirectory $backendDirectory
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Run the Maintenance Helpdesk delivery worker every minute while this user is signed in. Delivery pause is controlled by backend/.env.local.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
