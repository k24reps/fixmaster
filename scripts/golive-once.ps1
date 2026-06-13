<#
.SYNOPSIS
  One-shot go-live: promote origin/staging -> origin/main (Vercel auto-deploys prod).
  Dijadwalkan via Windows Scheduled Task untuk 01:00 WIB 12 Jun 2026. SEKALI PAKAI.

.SAFETY
  - Fast-forward-only: jika staging BUKAN keturunan langsung main (sudah diverge),
    skrip BATAL dan tidak push apa pun. Mencegah menerbitkan sesuatu yang tak terduga.
  - Semua langkah dicatat ke scripts/golive-log.txt dengan timestamp.
  - Gerbang CI (lint/build/test) sudah dijalankan & hijau saat commit dibuat
    (commit a2c0fa3); GitHub Actions juga berjalan pada push staging.
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$log = Join-Path $PSScriptRoot 'golive-log.txt'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $log -Value $line
  Write-Host $line
}

try {
  Log '=== GO-LIVE START ==='
  git fetch origin 2>&1 | ForEach-Object { Log "fetch: $_" }

  $main    = (git rev-parse origin/main).Trim()
  $staging = (git rev-parse origin/staging).Trim()
  Log "origin/main    = $main"
  Log "origin/staging = $staging"

  if ($main -eq $staging) {
    Log 'NO-OP: main sudah sama dengan staging. Tidak ada yang dipromosikan.'
    Log '=== GO-LIVE END (no-op) ==='
    exit 0
  }

  # Fast-forward safety: main HARUS leluhur dari staging.
  git merge-base --is-ancestor $main $staging
  if ($LASTEXITCODE -ne 0) {
    Log 'ABORT: origin/main bukan leluhur origin/staging (sudah diverge). Tidak push. Tinjau manual.'
    Log '=== GO-LIVE END (aborted) ==='
    exit 1
  }

  Log "Promoting staging -> main (fast-forward) ..."
  $push = git push origin "origin/staging:main" 2>&1
  $push | ForEach-Object { Log "push: $_" }
  if ($LASTEXITCODE -ne 0) {
    Log 'ERROR: push ke main GAGAL. Production TIDAK berubah.'
    Log '=== GO-LIVE END (push failed) ==='
    exit 1
  }

  Log 'SUCCESS: main diperbarui. Vercel akan auto-deploy production.'
  Log '=== GO-LIVE END (deployed) ==='
  exit 0
}
catch {
  Log "EXCEPTION: $($_.Exception.Message)"
  Log '=== GO-LIVE END (exception) ==='
  exit 1
}
