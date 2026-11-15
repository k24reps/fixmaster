#!/usr/bin/env bash
# Simulasi rilis migrasi di PostgreSQL lokal, untuk saat staging tidak tersedia.
#
# Membuat klaster sementara, memasang tiruan Supabase, menjalankan semua
# migrasi SEBELUM migrasi target, mengisi dua toko lewat RPC aplikasi, lalu
# menjalankan berkas uji (mis. scripts/selfhost/uji-0101.sql) persis seperti
# di VPS: jalur `\i /tmp/<migrasi>.sql` di berkas uji diarahkan ke repo.
#
#   bash scripts/selfhost/simulasi/jalankan.sh 0101_unit_pricing.sql scripts/selfhost/uji-0101.sql
#
# Butuh binari PostgreSQL 16 (PG_BIN, bawaan /usr/lib/postgresql/16/bin).
# pg_cron/pg_net tidak tersedia: barisnya dibuang dan fungsinya ditiru.
# Yang TIDAK teruji di sini: PostgREST, GoTrue, realtime, Edge Function.
set -euo pipefail
TARGET="${1:?nama berkas migrasi target, mis. 0101_unit_pricing.sql}"
UJI="${2:?berkas uji, mis. scripts/selfhost/uji-0101.sql}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$REPO/scripts/selfhost/simulasi"
WORK="$(mktemp -d)"
chmod 755 "$WORK"
PORT="${PORT:-55433}"
RUN_AS=()
[ "$(id -u)" = 0 ] && RUN_AS=(su postgres -c)
pgrun() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$WORK"
pgrun "$PG_BIN/initdb -D $WORK/data -A trust -U postgres" >/dev/null
pgrun "$PG_BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/server.log start" >/dev/null
trap 'pgrun "$PG_BIN/pg_ctl -D $WORK/data stop -m fast" >/dev/null 2>&1; rm -rf "$WORK"' EXIT
sleep 1
P=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -f "$HERE/tiruan-supabase.sql" >/dev/null 2>&1
for f in "$REPO"/supabase/migrations/0*.sql; do
  b="$(basename "$f")"
  [ "$b" \< "$TARGET" ] || break
  sed -E '/create extension if not exists (pg_cron|pg_net)/Id' "$f" > "$WORK/cur.sql"
  "${P[@]}" -1 -f "$WORK/cur.sql" >/dev/null 2>&1 || { echo "GAGAL di $b"; exit 1; }
done
"${P[@]}" -f "$HERE/dua-toko.sql" >/dev/null
echo "Basis data siap sampai sebelum $TARGET, dengan dua toko."
sed "s|\\\\i /tmp/$TARGET|\\\\i $REPO/supabase/migrations/$TARGET|" "$UJI" > "$WORK/uji.sql"
"${P[@]}" -f "$WORK/uji.sql" 2>&1 | grep -iE "error|lulus|gagal" || true
"${P[@]}" -1 -f "$REPO/supabase/migrations/$TARGET" >/dev/null 2>&1 && echo "Penerapan sungguhan $TARGET: OK"
"${P[@]}" -1 -f "$REPO/supabase/migrations/$TARGET" >/dev/null 2>&1 && echo "Penerapan ulang $TARGET: OK (idempoten)"
