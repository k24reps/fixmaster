# Simpan password enkripsi backup SEKALI, terlindungi Windows DPAPI.
#   powershell -ExecutionPolicy Bypass -File C:\fixmaster-server\backup\simpan-password.ps1
# Berkas hasilnya hanya bisa dibuka oleh akun Windows ini di laptop ini.
# CATAT password yang sama di tempat lain (pengelola password / kertas):
# untuk memulihkan di mesin lain, berkas DPAPI ini TIDAK bisa dipakai.

$ErrorActionPreference = 'Stop'
$pwFile = Join-Path $PSScriptRoot 'backup-pw.dat'

$a = Read-Host 'Password enkripsi backup (min. 16 karakter)' -AsSecureString
$b = Read-Host 'Ulangi password' -AsSecureString
$pa = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
$pb = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
if ($pa -ne $pb) { throw 'Password tidak sama. Ulangi.' }
if ($pa.Length -lt 16) { throw 'Terlalu pendek. Minimal 16 karakter.' }
if ($pa -match '"') { throw 'Jangan pakai tanda kutip ganda (").' }

$a | ConvertFrom-SecureString | Set-Content -Path $pwFile -Encoding ascii
Write-Host "Tersimpan di $pwFile" -ForegroundColor Green
Write-Host 'Pastikan password ini juga tercatat di tempat lain.' -ForegroundColor Yellow
