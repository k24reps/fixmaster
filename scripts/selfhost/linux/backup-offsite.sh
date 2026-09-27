#!/usr/bin/env bash
# Backup FixMaster (VPS) ke Google Drive lewat rclone: dump database + berkas
# storage, dienkripsi 7-Zip AES-256 (nama berkas ikut dienkripsi). Isi arsip
# sama persis dengan backup-offsite.ps1, jadi pulihkan-dari-backup.ps1/.sh bisa
# membukanya. Dijalankan cron 02:00 dan 13:00 WIB (pasang-backup.sh). Manual:
#   bash /opt/fixmaster/backup/backup-offsite.sh
#
# Tujuan default folder Drive `fixmaster-vps`, SENGAJA terpisah dari
# `fixmaster-backup` milik laptop rumah: kalau laptop hidup lagi dan jadwalnya
# ikut jalan, arsip "terbaru" di satu folder bisa berisi data basi laptop.
set -euo pipefail

DEST="${DEST:-gdrive:fixmaster-vps}"
ROOT="${ROOT:-/opt/fixmaster/docker}"
KEEP_RECENT="${KEEP_RECENT:-28}"   # 14 hari x 2 per hari
KEEP_MONTHS="${KEEP_MONTHS:-12}"   # plus salinan pertama tiap bulan
HERE="$(cd "$(dirname "$0")" && pwd)"
PW_FILE="${PW_FILE:-/root/.config/fixmaster/backup-pw}"
LOG_FILE="$HERE/backup-offsite.log"
SEVENZ="$(command -v 7zz || command -v 7z || true)"
STAMP="$(date +%Y%m%d-%H%M)"
WORK="$(mktemp -d /tmp/fixmaster-backup-XXXX)"
trap 'rm -rf "$WORK"' EXIT

log() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a "$LOG_FILE"; }
status() { echo "$(date '+%Y-%m-%d %H:%M')  $*" | rclone rcat "$DEST/STATUS.txt" 2>/dev/null || true; }
fail() { log "GAGAL: $*"; status "GAGAL: $*"; exit 1; }

[ -n "$SEVENZ" ] || fail "7-Zip tidak terpasang"
[ -s "$PW_FILE" ] || fail "password belum disimpan - jalankan pasang-backup.sh"
[ -f "$ROOT/.env" ] || fail ".env tidak ada di $ROOT"
PW="$(cat "$PW_FILE")"

docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc --no-owner --no-privileges -f /tmp/fm-full.dump || fail "pg_dump lengkap"
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc -n public --no-owner -f /tmp/fm-public.dump || fail "pg_dump public"
# Volume db-config terpasang di /etc/postgresql-custom: berisi pgsodium_root.key (vault).
docker exec supabase-db tar czf /tmp/fm-db-config.tgz -C /etc/postgresql-custom . || fail "tar db-config"
for f in full public db-config; do
  ext=dump; [ "$f" = db-config ] && ext=tgz
  docker cp "supabase-db:/tmp/fm-$f.$ext" "$WORK/$f.$ext" >/dev/null || fail "docker cp $f"
done
docker exec supabase-db rm -f /tmp/fm-full.dump /tmp/fm-public.dump /tmp/fm-db-config.tgz

for f in full.dump public.dump; do
  size=$(stat -c %s "$WORK/$f")
  [ "$size" -ge 51200 ] || fail "$f terlalu kecil ($size B) - dump mencurigakan"
done

archive="$WORK/fixmaster-$STAMP.7z"
items=("$WORK/full.dump" "$WORK/public.dump" "$WORK/db-config.tgz" "$ROOT")
[ -d "$ROOT/volumes/storage" ] && items+=("$ROOT/volumes/storage")
# Folder compose masuk sebagai 'docker/' tanpa data Postgres & storage (storage
# sudah masuk sebagai 'storage/', data Postgres diwakili dump).
name="$(basename "$ROOT")"
"$SEVENZ" a -t7z -mx=7 -mhe=on -p"$PW" "$archive" "${items[@]}" \
  "-x!$name/volumes/db/data" "-x!$name/volumes/storage" >/dev/null || fail "7-Zip buat arsip"
"$SEVENZ" t -p"$PW" "$archive" >/dev/null || fail "7-Zip uji arsip"

rclone copy "$archive" "$DEST/" || fail "unggah ke $DEST"
# Skrip pemulihan ikut ke Drive (tidak rahasia) - saat bencana repo belum tentu ada.
rclone copy "$HERE/" "$DEST/skrip/" --include '*.sh' --include '*.ps1' || fail "unggah skrip"
kb=$(( $(stat -c %s "$archive") / 1024 ))

# Retensi: KEEP_RECENT terbaru + salinan PERTAMA tiap bulan untuk KEEP_MONTHS bulan.
mapfile -t files < <(rclone lsf "$DEST" --files-only --include 'fixmaster-*.7z' | sort -r)
declare -A keep=()
for f in "${files[@]:0:$KEEP_RECENT}"; do keep[$f]=1; done
mapfile -t months < <(printf '%s\n' "${files[@]}" | cut -c11-16 | sort -ru | head -n "$KEEP_MONTHS")
for m in "${months[@]}"; do
  first="$(printf '%s\n' "${files[@]}" | grep "^fixmaster-$m" | sort | head -1)"
  [ -n "$first" ] && keep[$first]=1
done
removed=0
for f in "${files[@]}"; do
  if [ -z "${keep[$f]:-}" ]; then rclone deletefile "$DEST/$f"; removed=$((removed + 1)); fi
done

msg="OK fixmaster-$STAMP.7z $kb KB, $(( ${#files[@]} - removed )) salinan tersimpan, $removed dihapus"
log "$msg"
status "$msg"
