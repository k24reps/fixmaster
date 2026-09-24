# Arahkan stack self-host ke alamat publik Cloudflare Tunnel.
#   powershell -ExecutionPolicy Bypass -File .\ubah-domain.ps1 -Api api.contoh.my.id
# Menulis .env TANPA mengubah akhir baris (LF). Set-Content biasa di PowerShell 5.1
# menulis CRLF dan menyelipkan \r tak terlihat ke setiap nilai - jangan dipakai.

param([Parameter(Mandatory = $true)][string]$Api)

$ErrorActionPreference = 'Stop'
$envPath = 'C:\fixmaster-server\docker\.env'
if ($Api -match '^https?://' -or $Api -match '/') { throw "Isi nama host saja, mis. api.contoh.my.id" }
$base = "https://$Api"

$raw = [IO.File]::ReadAllText($envPath)
if ($raw.Contains("`r")) { throw ".env mengandung CRLF - berhenti, kirim layar ini." }
Copy-Item $envPath "$envPath.sebelum-domain" -Force

$set = [ordered]@{
  'SUPABASE_PUBLIC_URL'      = $base
  'API_EXTERNAL_URL'         = "$base/auth/v1"
  'SITE_URL'                 = 'https://fixmaster.app'
  'ADDITIONAL_REDIRECT_URLS' = 'https://fixmaster.app/**'
}
foreach ($k in $set.Keys) {
  $pattern = "(?m)^$k=.*$"
  if ($raw -notmatch $pattern) { throw "$k tidak ditemukan di .env" }
  $raw = [regex]::Replace($raw, $pattern, "$k=$($set[$k])")
  Write-Host "$k=$($set[$k])"
}
[IO.File]::WriteAllText($envPath, $raw, (New-Object Text.UTF8Encoding $false))

Set-Location 'C:\fixmaster-server\docker'
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { Write-Host "Belum semua healthy - jalankan ulang skrip ini sekali lagi." -ForegroundColor Yellow; exit 1 }

Write-Host ""
Write-Host "Uji lewat internet:"
curl.exe -s "$base/functions/v1/health"
Write-Host ""
