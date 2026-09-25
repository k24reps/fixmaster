# Pasang email FixMaster di server: Resend untuk (1) email backup mingguan ke owner
# toko dan (2) SMTP reset password GoTrue. Satu kunci Resend untuk keduanya.
#   powershell -ExecutionPolicy Bypass -File .\pasang-email.ps1
# Opsi:
#   -TanpaKunci        pasang semuanya kecuali kunci (email backup = dry run saja)
#   -UjiOrg <uuid>     setelah pasang, KIRIM SUNGGUHAN satu email backup ke owner org itu
#   -Root <path>       folder compose (default C:\fixmaster-server\docker)
# Aman diulang. Isi folder ini: pasang-email.ps1, 0085_backup_email.sql, backup-email\index.ts

param(
  [string]$Root = 'C:\fixmaster-server\docker',
  [switch]$TanpaKunci,
  [string]$UjiOrg = ''
)

$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) { $docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' }
$env:PATH = (Split-Path $docker) + ';' + $env:PATH

function Step($m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Native($what) { if ($LASTEXITCODE -ne 0) { throw "$what gagal (exit $LASTEXITCODE)" } }

$envPath = Join-Path $Root '.env'
if (-not (Test-Path $envPath)) { throw ".env tidak ada: $envPath" }
$raw = [IO.File]::ReadAllText($envPath)
if ($raw.Contains("`r")) { throw '.env mengandung CRLF - berhenti.' }
foreach ($f in '0085_backup_email.sql', 'backup-email\index.ts') {
  if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { throw "Berkas paket hilang: $f" }
}

function SetEnv([string]$key, [string]$value) {
  $pattern = "(?m)^$([regex]::Escape($key))=.*$"
  if ($script:raw -match $pattern) {
    $script:raw = [regex]::Replace($script:raw, $pattern, { param($m) "$key=$value" })
  } else {
    if (-not $script:raw.EndsWith("`n")) { $script:raw += "`n" }
    $script:raw += "$key=$value`n"
  }
}

Step '1/6 Kunci Resend'
$key = ''
if ($TanpaKunci) {
  if ($raw -match '(?m)^RESEND_API_KEY=re_') {
    Write-Host 'Dilewati (-TanpaKunci): kunci & SMTP yang sudah terpasang di .env tetap dipakai.'
  } else {
    Write-Host 'Dilewati (-TanpaKunci): email backup berjalan sebagai dry run, SMTP tidak diubah.'
  }
} else {
  $sec = Read-Host 'Tempel API key Resend (re_...)' -AsSecureString
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
  if ($key -notmatch '^re_[A-Za-z0-9_]{10,}$') { throw 'Bukan API key Resend (harus diawali re_).' }
}

Step '2/6 Isi .env (email backup + SMTP reset password)'
Copy-Item $envPath "$envPath.sebelum-email" -Force
if ($key) {
  SetEnv 'RESEND_API_KEY' $key
  # SMTP Resend: user selalu "resend", password = API key. Port 465 = TLS langsung.
  SetEnv 'SMTP_HOST' 'smtp.resend.com'
  SetEnv 'SMTP_PORT' '465'
  SetEnv 'SMTP_USER' 'resend'
  SetEnv 'SMTP_PASS' $key
  SetEnv 'SMTP_ADMIN_EMAIL' 'noreply@fixmaster.app'
  SetEnv 'SMTP_SENDER_NAME' 'FixMaster'
  Write-Host 'RESEND_API_KEY + SMTP_* diisi (nilai kunci tidak ditampilkan).'
} elseif ($raw -notmatch '(?m)^RESEND_API_KEY=') {
  SetEnv 'RESEND_API_KEY' ''
}
[IO.File]::WriteAllText($envPath, $raw, (New-Object Text.UTF8Encoding $false))

Step '3/6 Override compose + edge function'
$override = @'
# Tambahan khusus FixMaster di atas compose resmi Supabase (self-hosted/v0.8.1).
# Sengaja berkas terpisah: memperbarui Supabase ke rilis baru tidak menimpanya.
services:
  functions:
    environment:
      # Dicocokkan dengan header x-cron-secret yang dikirim run_auto_backup()
      # (0052) dan run_backup_email() (0085). Nilai yang sama ada di vault
      # sebagai `backup_cron_secret`.
      BACKUP_CRON_SECRET: ${BACKUP_CRON_SECRET}
      # Edge Function backup-email (0085). Kosong = dry run.
      RESEND_API_KEY: ${RESEND_API_KEY}
  auth:
    environment:
      # Email "Lupa password?" berbahasa Indonesia. Templat diambil GoTrue dari
      # situs (public/email/reset-password.html di repo FixMaster); gagal ambil =
      # GoTrue memakai templat bawaannya, jadi reset password tetap jalan.
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Atur ulang password FixMaster"
      GOTRUE_MAILER_TEMPLATES_RECOVERY: "https://fixmaster.app/email/reset-password.html"
      # Tautan reset berlaku 1 jam (bawaan GoTrue lebih panjang); teks email
      # menyebut angka ini - ubah keduanya bersamaan.
      GOTRUE_MAILER_OTP_EXP: "3600"
'@
[IO.File]::WriteAllText((Join-Path $Root 'docker-compose.override.yml'), ($override -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
$fnDir = Join-Path $Root 'volumes\functions\backup-email'
New-Item -ItemType Directory -Force $fnDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'backup-email\index.ts') $fnDir -Force
Write-Host "Fungsi disalin ke $fnDir"

Step '4/6 Migrasi 0085 (tabel jejak + jadwal Senin 07.00 WIB)'
Get-Content (Join-Path $PSScriptRoot '0085_backup_email.sql') -Raw | & $docker exec -i -e "PGOPTIONS=-c client_min_messages=warning" supabase-db psql -U postgres -v ON_ERROR_STOP=1 -1 -q | Out-Null
Native 'migrasi 0085'
& $docker exec supabase-db psql -U postgres -At -c "select 'jadwal: '||jobname||' '||schedule from cron.job where jobname='fixmaster-backup-email'"

Step '5/6 Nyalakan ulang layanan (auth + functions membaca .env baru)'
Set-Location $Root
& $docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { & $docker compose up -d --wait; Native 'docker compose up' }

Step '6/6 Uji'
$secret = ([regex]::Match($raw, '(?m)^BACKUP_CRON_SECRET=(.*)$')).Groups[1].Value
$bodyFile = Join-Path $env:TEMP 'fm-backup-email-body.json'
function CallFn([string]$json) {
  [IO.File]::WriteAllText($bodyFile, $json, (New-Object Text.UTF8Encoding $false))
  $out = curl.exe -s -X POST http://localhost:8000/functions/v1/backup-email -H "x-cron-secret: $secret" -H 'content-type: application/json' --data-binary "@$bodyFile"
  Remove-Item $bodyFile -Force
  return $out
}
Write-Host 'Dry run (tidak mengirim apa pun):'
CallFn '{"dryRun":true}'
Write-Host ''
if ($UjiOrg) {
  if (-not $key -and $raw -notmatch '(?m)^RESEND_API_KEY=re_') { throw '-UjiOrg butuh kunci Resend.' }
  Write-Host "Kirim SUNGGUHAN ke owner org $UjiOrg :"
  CallFn ('{"orgId":"' + $UjiOrg + '"}')
  Write-Host ''
}
Write-Host 'Selesai. Status tiap toko juga tampil di Pengaturan > Sistem > Backup & Restore.' -ForegroundColor Green
