<#
.SYNOPSIS
  Sync screenshot terbaru ke vault Obsidian attachments/.

.DESCRIPTION
  Membaca semua embed gambar gaya Obsidian (![[nama.png]]) dari catatan di
  docs/obsidian-vault, lalu menyalin file yang cocok dari scripts/shots/ ke
  docs/obsidian-vault/attachments/ HANYA bila sumbernya lebih baru (atau
  tujuan belum ada). Dengan begitu attachment selalu sinkron dengan apa pun
  yang dirujuk catatan — tanpa menyalin gambar yang tidak dipakai.

.USAGE
  Dari root proyek:
    pwsh ./scripts/sync-vault-attachments.ps1
  Pratinjau tanpa menyalin:
    pwsh ./scripts/sync-vault-attachments.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$VaultDir,
  [string]$ShotsDir
)

$ErrorActionPreference = 'Stop'

# Resolve the script's own folder robustly. $PSScriptRoot can be empty at
# param-binding time depending on how the script is invoked, so compute it
# here with a fallback to MyInvocation.
$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) { $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $VaultDir) { $VaultDir = Join-Path $scriptRoot '..\docs\obsidian-vault' }
if (-not $ShotsDir) { $ShotsDir = Join-Path $scriptRoot 'shots' }
$attachDir = Join-Path $VaultDir 'attachments'
New-Item -ItemType Directory -Force -Path $attachDir | Out-Null

# 1) Kumpulkan semua nama gambar yang di-embed di catatan vault.
$needed =
  Select-String -Path (Join-Path $VaultDir '*.md') -Pattern '!\[\[([^\]]+?\.png)\]\]' -AllMatches |
  ForEach-Object { $_.Matches } |
  ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique

if (-not $needed) {
  Write-Host 'Tidak ada embed gambar ditemukan di catatan. Tidak ada yang disinkronkan.'
  return
}

$copied = 0; $skipped = 0; $missing = 0
foreach ($name in $needed) {
  $src = Join-Path $ShotsDir $name
  $dst = Join-Path $attachDir $name

  if (-not (Test-Path $src)) {
    Write-Warning "SUMBER HILANG: $name (tidak ada di scripts/shots/)"
    $missing++
    continue
  }

  $srcItem = Get-Item $src
  $isNewer = -not (Test-Path $dst) -or ($srcItem.LastWriteTime -gt (Get-Item $dst).LastWriteTime)

  if ($isNewer) {
    if ($PSCmdlet.ShouldProcess($name, 'Copy to attachments')) {
      Copy-Item $src $dst -Force
    }
    Write-Host "SINKRON: $name"
    $copied++
  }
  else {
    $skipped++
  }
}

Write-Host ''
Write-Host "Selesai. Disinkron: $copied | Dilewati (sudah terbaru): $skipped | Sumber hilang: $missing"
if ($missing -gt 0) {
  Write-Host 'Tip: jalankan dulu skrip screenshot (mis. node scripts/shoot-batch.mjs) untuk membuat gambar yang hilang.'
}
