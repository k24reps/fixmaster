#!/usr/bin/env bash
# Pasang backup offsite di VPS: simpan password arsip, hubungkan rclone ke Google
# Drive, jadwal cron 02:00 & 13:00 WIB, lalu jalankan backup pertama.
#   sudo bash pasang-backup.sh
# Aman diulang (password & remote yang sudah ada boleh dilewati).
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/fixmaster/backup
PW_FILE=/root/.config/fixmaster/backup-pw
step() { echo; echo "==> $*"; }

step "1/4 Salin skrip ke $DIR"
mkdir -p "$DIR"
# pulihkan-dari-backup.ps1 ikut: blok restore database dibaca dari berkas itu.
for f in backup-offsite.sh pulihkan-dari-backup.sh siapkan-vps.sh pasang-backup.sh pulihkan-dari-backup.ps1; do
  if [ -f "$HERE/$f" ] && [ "$HERE/$f" != "$DIR/$f" ]; then cp "$HERE/$f" "$DIR/"; fi
done
chmod 700 "$DIR"/*.sh

step "2/4 Password arsip (pakai password yang SAMA dengan arsip lama)"
if [ -s "$PW_FILE" ] && read -rp "Password sudah tersimpan. Ganti? [y/N] " a && [ "${a:-n}" != y ]; then
  echo "Dilewati."
else
  read -rsp "Password arsip: " p1; echo
  read -rsp "Ulangi: " p2; echo
  [ "$p1" = "$p2" ] || { echo "Tidak sama. Ulangi skrip."; exit 1; }
  [ "${#p1}" -ge 16 ] || { echo "Minimal 16 karakter (arsip berisi .env server)."; exit 1; }
  mkdir -p "$(dirname "$PW_FILE")"
  chmod 700 "$(dirname "$PW_FILE")"
  ( umask 077; printf '%s' "$p1" > "$PW_FILE" )
  unset p1 p2
fi

step "3/4 Google Drive (rclone remote 'gdrive')"
# scope=drive: perlu melihat & merapikan folder backup. rclone 1.60 (Ubuntu 24.04)
# membuat remote TANPA meminta izin saat `config create` — izinnya lewat
# `config reconnect`. VPS tanpa browser: jawab "n", lalu jalankan perintah
# `rclone authorize "drive" ...` yang dicetak di laptop ber-browser.
rclone listremotes | grep -qx 'gdrive:' ||
  rclone config create gdrive drive scope=drive config_is_local=false >/dev/null
if ! rclone lsd gdrive: >/dev/null 2>&1; then
  echo 'Izin Google Drive: jawab "n" (tanpa browser), jalankan perintah rclone authorize di laptop, tempel hasilnya di sini.'
  rclone config reconnect gdrive:
fi
rclone lsd gdrive: >/dev/null 2>&1 || { echo "GAGAL: belum terhubung ke Google Drive - ulangi skrip."; exit 1; }
echo "Terhubung ke Google Drive."

step "4/4 Jadwal cron 02:00 & 13:00 WIB + backup pertama"
cat > /etc/cron.d/fixmaster-backup <<CRON
# Backup offsite FixMaster (pasang-backup.sh). Log: $DIR/backup-offsite.log
0 2,13 * * * root $DIR/backup-offsite.sh >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/fixmaster-backup
# Zona waktu diubah siapkan-vps.sh; cron membaca TZ saat mulai.
systemctl restart cron
"$DIR/backup-offsite.sh"
echo
echo "Selesai. Cek folder Drive 'fixmaster-vps' (arsip + STATUS.txt)."
