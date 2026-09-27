#!/usr/bin/env bash
# Bangun ulang server FixMaster di Linux dari SATU arsip backup-offsite (.7z).
# Padanan pulihkan-dari-backup.ps1 untuk VPS; jalankan siapkan-vps.sh dulu.
#   sudo bash pulihkan-dari-backup.sh /root/fixmaster-20260926-1300.7z
#
# Butuh pulihkan-dari-backup.ps1 di folder yang sama: langkah database diambil
# dari berkas itu apa adanya (satu sumber — urutan restore yang terbukti di
# Windows, lihat runbook Self-Hosting.md), bukan disalin ulang ke sini.
# Password arsip ditanyakan (tidak tampil). Hasil: /opt/fixmaster/docker berisi
# stack yang sama persis (kunci .env & vault lama), database terverifikasi.
set -euo pipefail

ARCHIVE="${1:?pakai: bash $0 /path/fixmaster-YYYYMMDD-HHMM.7z}"
TARGET="${TARGET:-/opt/fixmaster}"
WORK="${WORK:-/root/pulih}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$TARGET/docker"
SEVENZ="$(command -v 7zz || command -v 7z || true)"
step() { echo; echo "==> $*"; }
die() { echo "GAGAL: $*" >&2; exit 1; }

# ---------- 0. pemeriksaan: jangan pernah menimpa stack yang ada ----------
step "0/6 Pemeriksaan"
[ "$(id -u)" -eq 0 ] || die "jalankan sebagai root"
[ -f "$ARCHIVE" ] || die "arsip tidak ada: $ARCHIVE"
[ -n "$SEVENZ" ] || die "7-Zip belum terpasang (jalankan siapkan-vps.sh)"
[ -f "$HERE/pulihkan-dari-backup.ps1" ] || die "pulihkan-dari-backup.ps1 harus ada di $HERE"
docker info >/dev/null 2>&1 || die "Docker belum jalan"
[ ! -e "$DOCKER_DIR" ] || die "$DOCKER_DIR sudah ada. Skrip ini hanya untuk mesin kosong."
[ -z "$(docker ps -aq --filter 'name=^supabase-db$')" ] || die "kontainer supabase-db sudah ada. Skrip ini hanya untuk mesin kosong."
[ -z "$(docker volume ls -q --filter 'name=^supabase_db-config$')" ] || die "volume supabase_db-config sudah ada. Skrip ini hanya untuk mesin kosong."
[ ! -e "$WORK" ] || die "$WORK sudah ada - hapus dulu (sisa percobaan sebelumnya)."

mkdir -p "$TARGET"
LOG="$TARGET/pulihkan-$(date +%Y%m%d-%H%M).log"
# Salinan terbongkar berisi .env dan seluruh data tanpa enkripsi: selalu dibersihkan.
trap 'rm -rf "$WORK"' EXIT

read -rsp "Password arsip backup: " PW; echo
exec > >(tee -a "$LOG") 2>&1

# ---------- 1. bongkar ----------
step "1/6 Bongkar arsip ke $WORK"
mkdir -p "$WORK"
"$SEVENZ" x -p"$PW" "$ARCHIVE" -o"$WORK" -y >/dev/null || die "bongkar arsip (password salah?)"
unset PW
for f in full.dump public.dump db-config.tgz docker/docker-compose.yml docker/.env; do
  [ -f "$WORK/$f" ] || die "arsip tidak memuat $f. Arsip sebelum 24 Sep 2026 siang belum membawa folder docker/ - pakai yang lebih baru."
done
! grep -q $'\r' "$WORK/docker/.env" || die ".env di arsip mengandung CRLF - berhenti."
CRON_SECRET="$(grep -m1 '^BACKUP_CRON_SECRET=' "$WORK/docker/.env" | cut -d= -f2-)"
ANON="$(grep -m1 '^ANON_KEY=' "$WORK/docker/.env" | cut -d= -f2-)"
[ -n "$CRON_SECRET" ] || die "BACKUP_CRON_SECRET tidak ada di .env"

# ---------- 2. folder compose ----------
step "2/6 Pasang folder compose di $DOCKER_DIR"
cp -a "$WORK/docker" "$TARGET/"
[ -d "$WORK/storage" ] && cp -a "$WORK/storage" "$DOCKER_DIR/volumes/"
# Arsip dibuat di Windows: izin eksekusi hilang, sedangkan bind mount Docker
# Desktop dulu menampilkan semua berkas sebagai 777.
find "$DOCKER_DIR" -name '*.sh' -exec chmod +x {} +
chmod 600 "$DOCKER_DIR/.env"
cd "$DOCKER_DIR"
# Di Linux port Docker MELOMPATI ufw, dan "ip" di daemon.json hanya berlaku untuk
# jaringan bawaan — bukan jaringan milik compose. Gateway 8000 dan database
# 5432/6543 diikat ke localhost di sini; masuk hanya lewat Cloudflare Tunnel.
cat > docker-compose.vps.yml <<'YML'
# Dibuat pulihkan-dari-backup.sh (VPS): port hanya di localhost.
services:
  api-gw:
    ports: !override
      - 127.0.0.1:${API_GW_HTTP_PORT:-${KONG_HTTP_PORT:-8000}}:8000/tcp
  supavisor:
    ports: !override
      - 127.0.0.1:${POSTGRES_PORT}:5432
      - 127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543
YML
grep -q '^COMPOSE_FILE=.*docker-compose.vps.yml' .env ||
  sed -i 's/^COMPOSE_FILE=.*/&:docker-compose.vps.yml/' .env
grep -q '^COMPOSE_FILE=.*docker-compose.vps.yml' .env || die "COMPOSE_FILE di .env tidak bisa ditambah docker-compose.vps.yml"
IMAGE="$(grep -m1 -oE 'supabase/postgres:[^[:space:]"]+' docker-compose.yml)"
echo "image database: $IMAGE"

# ---------- 3. image + kunci vault SEBELUM start pertama ----------
step "3/6 Unduh image (sekitar 2 GB) + pulihkan kunci vault"
docker compose pull
# Harus ada sebelum Postgres menyala pertama kali; kalau tidak, ia membuat
# pgsodium_root.key baru dan rahasia vault lama tak terbaca.
docker volume create --label com.docker.compose.project=supabase \
  --label com.docker.compose.volume=db-config supabase_db-config >/dev/null
docker run --rm -v supabase_db-config:/dst -v "$WORK:/in" --entrypoint tar "$IMAGE" xzf /in/db-config.tgz -C /dst

# ---------- 4. nyalakan stack kosong ----------
step "4/6 Nyalakan stack (start pertama bisa beberapa menit)"
if ! docker compose up -d --wait; then
  echo "Belum semua healthy - mencoba sekali lagi (storage kadang lambat di start pertama)"
  docker compose up -d --wait
fi

# ---------- 5. pulihkan database (di dalam kontainer) ----------
step "5/6 Pulihkan database"
tr -d '\r' < "$HERE/pulihkan-dari-backup.ps1" |
  awk 'index($0, "$restoreDb = @'"'"'") == 1 {f=1; next} f && $0 == "'"'"'@" {exit} f' > "$WORK/restore-db.sh"
[ -s "$WORK/restore-db.sh" ] || die "blok restore-db tidak ditemukan di pulihkan-dari-backup.ps1"
docker exec supabase-db mkdir -p /tmp/pulih
for f in full.dump public.dump restore-db.sh; do docker cp "$WORK/$f" "supabase-db:/tmp/pulih/$f" >/dev/null; done
set +e
docker exec -e "BACKUP_CRON_SECRET=$CRON_SECRET" supabase-db bash /tmp/pulih/restore-db.sh
db_exit=$?
set -e
docker exec supabase-db rm -rf /tmp/pulih
[ "$db_exit" -eq 0 ] || die "pemulihan database gagal atau verifikasi tidak cocok (exit $db_exit) - lihat keluaran di atas"

# ---------- 6. uji jalur API ----------
step "6/6 Uji jalur API"
docker compose restart rest functions >/dev/null
sleep 5
health="$(curl -s http://localhost:8000/functions/v1/health || true)"
auth="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" http://localhost:8000/auth/v1/health || true)"
echo "functions/health : $health"
echo "auth/health      : HTTP $auth"
[[ "$health" == *'"db":"up"'* && "$auth" == 200 ]] || die "jalur API belum sehat"

echo
echo "PULIH. Log: $LOG"
echo "Berikutnya:"
echo "  1. Cloudflare > tunnel BARU > jalankan: cloudflared service install <token>"
echo "  2. bash pasang-backup.sh (password arsip yang sama + izin Google Drive)"
echo "  3. Login di fixmaster.app (semua pengguna login ulang sekali)"
