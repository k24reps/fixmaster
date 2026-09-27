#!/usr/bin/env bash
# Siapkan VPS Ubuntu 24.04 kosong untuk server FixMaster (Supabase self-host).
#   sudo bash siapkan-vps.sh
# Aman diulang. Sesudahnya: pulihkan-dari-backup.sh, lalu pasang-backup.sh.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root (sudo bash $0)"; exit 1; }
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
step() { echo; echo "==> $*"; }
# VPS baru menjalankan unattended-upgrades saat boot pertama dan memegang kunci
# dpkg beberapa menit — tunggu, jangan gagal (terjadi di VPS Tencent 27 Sep).
apt() { apt-get -o DPkg::Lock::Timeout=900 "$@"; }

step "1/6 Zona waktu WIB (jadwal backup & tanggal log)"
timedatectl set-timezone Asia/Jakarta

step "2/6 Paket: Docker, Compose, 7-Zip, rclone"
apt update -q
apt install -y -q docker.io docker-compose-v2 7zip rclone curl ca-certificates ufw

step "3/6 Docker: port hanya di localhost + batas ukuran log"
# Di Linux, port yang dipublikasikan Docker MELOMPATI ufw. "ip" hanya mengikat
# jaringan BAWAAN ke 127.0.0.1 (mis. `docker run -p` ad hoc); port stack Supabase
# (8000, 5432, 6543) diikat lewat docker-compose.vps.yml oleh pulihkan-dari-backup.sh
# — terukur: tanpa berkas itu port compose tetap 0.0.0.0 walau "ip" diset.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "ip": "127.0.0.1",
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl enable docker >/dev/null
systemctl restart docker

step "4/6 Swap 2 GB (cadangan saat restore/lonjakan RAM)"
if ! swapon --show | grep -q '^/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-fixmaster.conf
sysctl -q -p /etc/sysctl.d/90-fixmaster.conf

step "5/6 cloudflared (repo resmi Cloudflare)"
if ! command -v cloudflared >/dev/null; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list
  apt update -q
  apt install -y -q cloudflared
fi

step "6/6 Firewall: hanya SSH yang terbuka"
# Port SSH dibaca dari konfigurasi sshd, supaya port non-standar penyedia VPS tidak
# terkunci. Bukan $SSH_CONNECTION: `sudo` membuangnya (terjadi di VPS 27 Sep).
ssh_port="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2; exit}')"
ssh_port="${ssh_port:-22}"
ufw allow "${ssh_port}/tcp" >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,6p'

echo
echo "SIAP:"
echo "  $(docker --version)"
echo "  $(docker compose version)"
echo "  7-Zip: $(command -v 7zz || command -v 7z)"
echo "  $(rclone version | head -1)"
echo "  $(cloudflared --version)"
free -h | sed -n '1,3p'
echo
echo "Berikutnya: bash pulihkan-dari-backup.sh /root/fixmaster-YYYYMMDD-HHMM.7z"
