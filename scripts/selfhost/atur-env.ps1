# Ubah satu nilai di .env server TANPA mengubah akhir baris (LF), lalu nyalakan ulang.
#   powershell -ExecutionPolicy Bypass -File .\atur-env.ps1 -Key ENABLE_EMAIL_AUTOCONFIRM -Value true
param([Parameter(Mandatory = $true)][string]$Key, [Parameter(Mandatory = $true)][string]$Value)
$ErrorActionPreference = 'Stop'
$envPath = 'C:\fixmaster-server\docker\.env'
$raw = [IO.File]::ReadAllText($envPath)
if ($raw.Contains("`r")) { throw ".env mengandung CRLF - berhenti, kirim layar ini." }
$pattern = "(?m)^$([regex]::Escape($Key))=.*$"
if ($raw -notmatch $pattern) { throw "$Key tidak ditemukan di .env" }
Copy-Item $envPath "$envPath.sebelum-$Key" -Force
$raw = [regex]::Replace($raw, $pattern, "$Key=$Value")
[IO.File]::WriteAllText($envPath, $raw, (New-Object Text.UTF8Encoding $false))
Write-Host "$Key=$Value"
Set-Location 'C:\fixmaster-server\docker'
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { Write-Host "Belum semua healthy - jalankan ulang sekali lagi." -ForegroundColor Yellow; exit 1 }
