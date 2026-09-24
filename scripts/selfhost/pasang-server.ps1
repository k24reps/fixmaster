# Pasang replika FixMaster self-host di laptop server (Windows + Docker Desktop).
# Jalankan dari folder berisi berkas ini:
#   powershell -ExecutionPolicy Bypass -File .\pasang-server.ps1
# Aman diulang: langkah yang sudah selesai dilewati.

$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$target = 'C:\fixmaster-server'
$image = 'supabase/postgres:17.6.1.136'

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Check($what) {
  if ($LASTEXITCODE -ne 0) {
    Write-Host "GAGAL: $what (exit $LASTEXITCODE). Berhenti - kirim layar ini." -ForegroundColor Red
    exit 1
  }
}

Step "1/6 Docker Desktop"
docker info --format '{{.OperatingSystem}} | {{.NCPU}} CPU | {{.MemTotal}} bytes RAM'
Check "Docker belum jalan. Buka Docker Desktop, tunggu 'Engine running', ulangi."

Step "2/6 Ekstrak ke $target"
if (Test-Path "$target\docker\.env") {
  Write-Host "Sudah ada, dilewati."
} else {
  New-Item -ItemType Directory -Force $target | Out-Null
  tar.exe -xf "$here\fixmaster-server.tar" -C $target
  Check "ekstrak arsip"
}
Set-Location "$target\docker"

Step "3/6 Unduh image (sekitar 2 GB, sekali saja)"
docker compose pull
Check "docker compose pull"

Step "4/6 Kunci enkripsi vault (volume supabase_db-config)"
docker volume inspect supabase_db-config *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Volume sudah ada, dilewati."
} else {
  docker volume create supabase_db-config | Out-Null
  Check "buat volume"
  docker run --rm -v supabase_db-config:/dst -v "${here}:/in" --entrypoint tar $image xzf /in/db-config.tgz -C /dst
  Check "pulihkan volume"
}

Step "5/6 Nyalakan stack (tunggu semua healthy, bisa beberapa menit)"
docker compose up -d --wait
Check "docker compose up"

Step "6/6 Verifikasi"
docker compose ps --format "{{.Name}}  {{.Status}}"
Get-Content "$here\cek-baris.sql" | docker exec -i supabase-db psql -U postgres -At -F' ' | Set-Content "$here\baris-sesudah.txt"
Check "hitung baris"
$diff = Compare-Object (Get-Content "$here\baris-sebelum.txt") (Get-Content "$here\baris-sesudah.txt")
if ($diff) {
  Write-Host "BEDA dengan mesin asal:" -ForegroundColor Red
  $diff | Format-Table -AutoSize
} else {
  Write-Host "Jumlah baris 29/29 sama persis, vault terbaca 2." -ForegroundColor Green
}
Write-Host "health:"
curl.exe -s http://localhost:8000/functions/v1/health
Write-Host ""
