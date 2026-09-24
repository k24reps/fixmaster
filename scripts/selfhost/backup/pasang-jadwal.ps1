# Pasang jadwal backup 02:00 dan 13:00 di Task Scheduler (akun yang sedang login).
#   powershell -ExecutionPolicy Bypass -File C:\fixmaster-server\backup\pasang-jadwal.ps1
# Berjalan sebagai akun ini saat login, karena Docker Desktop, Google Drive, dan
# password DPAPI semuanya terikat ke sesi akun ini. Jadwal yang terlewat (laptop
# mati) dijalankan begitu tersedia lagi.

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'backup-offsite.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At '02:00'),
  (New-ScheduledTaskTrigger -Daily -At '13:00')
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName 'FixMaster Backup Offsite' -Action $action -Trigger $triggers `
  -Settings $settings -Principal $principal -Force | Out-Null
Get-ScheduledTask -TaskName 'FixMaster Backup Offsite' | Get-ScheduledTaskInfo |
  Select-Object TaskName, NextRunTime | Format-List
