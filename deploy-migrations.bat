@echo off
setlocal EnableExtensions
REM Pindah ke folder tempat script ini berada, bukan path absolut milik satu
REM mesin. Sebelumnya di-hardcode ke C:\Users\Administrator\... sehingga script
REM gagal di akun/mesin lain.
cd /d "%~dp0"
if not exist "supabase\config.toml" (
  echo [X] Tidak menemukan supabase\config.toml - jalankan dari folder fixmaster.
  exit /b 1
)

goto :main

REM Baca password TANPA menampilkannya di layar. `set /p` meng-echo
REM ketikan apa adanya -- pernah membuat password produksi ikut
REM ter-screenshot. PowerShell Read-Host -AsSecureString menutupinya.
:askpw
set "SUPABASE_DB_PASSWORD="
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "$s=Read-Host -AsSecureString '%~1'; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"`) do set "SUPABASE_DB_PASSWORD=%%p"
exit /b 0

:main
echo == 1/4  Login akun Supabase (browser terbuka; lewati bila sudah login) ==
supabase login
if errorlevel 1 goto :err

echo.
echo == 2/4  STAGING (fpwwswngqpftaixdlozo) ==
call :askpw "Masukkan DB password STAGING"
supabase link --project-ref fpwwswngqpftaixdlozo || goto :err
REM tampilkan migrasi yang pending sebelum apply (opsional)
supabase migration list
supabase db push || goto :err

echo.
echo == 3/4  Integration test ke staging (gate sebelum produksi) ==
call npm run test:integration
if errorlevel 1 (
  echo [X] Integration test GAGAL - PRODUKSI TIDAK dilanjutkan.
  goto :err
)

echo.
echo == 4/4  PRODUCTION (vmitplpvncfvyimgyxrn) ==
set /p "CONFIRM=Ketik YA untuk apply ke PRODUCTION: "
if /i not "%CONFIRM%"=="YA" ( echo Dibatalkan; staging sudah ter-apply. & goto :eof )
call :askpw "Masukkan DB password PRODUCTION"
supabase link --project-ref vmitplpvncfvyimgyxrn || goto :err
supabase db push || goto :err

echo.
echo == Relink balik ke STAGING (supaya push berikutnya tak nyasar ke produksi) ==
supabase link --project-ref fpwwswngqpftaixdlozo

echo.
echo == SELESAI: migrasi pending ter-apply ke staging + production ==
goto :eof
:err
echo. & echo *** GAGAL - periksa error di atas. Produksi mungkin belum ter-update. ***
exit /b 1