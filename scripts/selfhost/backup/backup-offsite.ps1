# Backup FixMaster ke luar mesin: dump database + berkas storage, dienkripsi
# 7-Zip AES-256 (nama berkas ikut dienkripsi), ditaruh di folder Google Drive.
# Dijalankan Task Scheduler 02:00 dan 13:00 (pasang-jadwal.ps1). Manual:
#   powershell -ExecutionPolicy Bypass -File C:\fixmaster-server\backup\backup-offsite.ps1
#
# Isi arsip (satu arsip cukup untuk membangun ulang server, lihat
# pulihkan-dari-backup.ps1):
#   full.dump      pg_dump -Fc --no-owner --no-privileges (auth, storage, public, ...)
#   public.dump    pg_dump -Fc -n public --no-owner        (public DENGAN hak akses)
#   db-config.tgz  volume /etc/postgresql-custom, berisi pgsodium_root.key (vault)
#   docker\        folder compose TANPA data: .env, override, edge function (<1 MB)
#   storage\       berkas bucket (logo, backup JSON per toko)
# Karena .env ikut, arsip + password yang bocor = server hidup ikut terancam;
# pakai password panjang. Skrip di folder ini juga disalin ke Drive\skrip\ agar
# pemulihan hanya butuh akun Google + password.

param(
  [string]$Dest = 'G:\My Drive\fixmaster-backup',
  [string]$Root = 'C:\fixmaster-server\docker',
  [int]$KeepRecent = 28,   # 14 hari x 2 per hari
  [int]$KeepMonths = 12    # plus satu salinan per bulan
)

$ErrorActionPreference = 'Stop'
$logFile = Join-Path $PSScriptRoot 'backup-offsite.log'
$pwFile = Join-Path $PSScriptRoot 'backup-pw.dat'
$sevenZip = 'C:\Program Files\7-Zip\7z.exe'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$work = Join-Path $env:TEMP "fixmaster-backup-$stamp"

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $logFile -Value $line -Encoding ascii
  Write-Host $line
}
function Native($what) {
  if ($LASTEXITCODE -ne 0) { throw "$what gagal (exit $LASTEXITCODE)" }
}

# Task Scheduler tidak selalu membawa PATH yang sama dengan jendela PowerShell.
$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) { $docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' }

try {
  if (-not (Test-Path $docker)) { throw "docker.exe tidak ditemukan ($docker)" }
  if (-not (Test-Path $sevenZip)) { throw "7-Zip tidak ada di $sevenZip" }
  if (-not (Test-Path $pwFile)) { throw 'Password belum disimpan - jalankan simpan-password.ps1' }
  if (-not (Test-Path $Dest)) { throw "Folder tujuan tidak ada: $Dest (Google Drive belum jalan / belum login?)" }
  $secure = Get-Content $pwFile | ConvertTo-SecureString
  $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

  New-Item -ItemType Directory -Force $work | Out-Null

  # Dump di DALAM kontainer lalu docker cp: menyalurkan stdout biner lewat pipa
  # PowerShell 5.1 merusak berkasnya (diperlakukan sebagai teks).
  & $docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc --no-owner --no-privileges -f /tmp/fm-full.dump
  Native 'pg_dump lengkap'
  & $docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc -n public --no-owner -f /tmp/fm-public.dump
  Native 'pg_dump public'
  & $docker cp supabase-db:/tmp/fm-full.dump (Join-Path $work 'full.dump') | Out-Null
  Native 'docker cp full'
  & $docker cp supabase-db:/tmp/fm-public.dump (Join-Path $work 'public.dump') | Out-Null
  Native 'docker cp public'
  # Volume db-config terpasang di /etc/postgresql-custom kontainer db.
  & $docker exec supabase-db tar czf /tmp/fm-db-config.tgz -C /etc/postgresql-custom .
  Native 'tar db-config'
  & $docker cp supabase-db:/tmp/fm-db-config.tgz (Join-Path $work 'db-config.tgz') | Out-Null
  Native 'docker cp db-config'
  & $docker exec supabase-db rm -f /tmp/fm-full.dump /tmp/fm-public.dump /tmp/fm-db-config.tgz | Out-Null
  if (-not (Test-Path (Join-Path $Root '.env'))) { throw ".env tidak ada di $Root" }

  foreach ($f in 'full.dump', 'public.dump') {
    $size = (Get-Item (Join-Path $work $f)).Length
    if ($size -lt 50KB) { throw "$f terlalu kecil ($size B) - dump mencurigakan" }
  }

  $archive = Join-Path $work "fixmaster-$stamp.7z"
  $storage = Join-Path $Root 'volumes\storage'
  $items = @('full.dump', 'public.dump', 'db-config.tgz' | ForEach-Object { Join-Path $work $_ })
  $items += $Root
  if (Test-Path $storage) { $items += $storage }
  # Folder compose ikut dengan nama 'docker\' tapi tanpa data Postgres & storage
  # (storage sudah masuk sebagai 'storage\', data Postgres diwakili dump).
  $rootName = Split-Path $Root -Leaf
  & $sevenZip a -t7z -mx=7 -mhe=on "-p$pw" $archive @items "-x!$rootName\volumes\db\data" "-x!$rootName\volumes\storage" | Out-Null
  Native '7-Zip buat arsip'
  & $sevenZip t "-p$pw" $archive | Out-Null
  Native '7-Zip uji arsip'

  Copy-Item $archive $Dest -Force
  # Skrip pemulihan ikut ke Drive (tidak rahasia) - saat bencana repo belum tentu ada.
  New-Item -ItemType Directory -Force (Join-Path $Dest 'skrip') | Out-Null
  Copy-Item (Join-Path $PSScriptRoot '*.ps1') (Join-Path $Dest 'skrip') -Force
  $kb = [math]::Round((Get-Item $archive).Length / 1KB)

  # Retensi: KeepRecent terbaru + salinan PERTAMA tiap bulan untuk KeepMonths bulan.
  $files = @(Get-ChildItem $Dest -Filter 'fixmaster-*.7z' | Sort-Object Name -Descending)
  $keep = @{}
  $files | Select-Object -First $KeepRecent | ForEach-Object { $keep[$_.Name] = $true }
  $files | Group-Object { $_.Name.Substring(10, 6) } | Sort-Object Name -Descending |
    Select-Object -First $KeepMonths |
    ForEach-Object { $keep[($_.Group | Sort-Object Name | Select-Object -First 1).Name] = $true }
  $removed = 0
  foreach ($f in $files) { if (-not $keep[$f.Name]) { Remove-Item $f.FullName; $removed++ } }

  $msg = "OK fixmaster-$stamp.7z $kb KB, $($files.Count - $removed) salinan tersimpan, $removed dihapus"
  Log $msg
  Set-Content -Path (Join-Path $Dest 'STATUS.txt') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm')  $msg" -Encoding ascii
} catch {
  $err = "GAGAL: $($_.Exception.Message)"
  Log $err
  if (Test-Path $Dest) {
    Set-Content -Path (Join-Path $Dest 'STATUS.txt') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm')  $err" -Encoding ascii
  }
  exit 1
} finally {
  if (Test-Path $work) { Remove-Item $work -Recurse -Force }
}
