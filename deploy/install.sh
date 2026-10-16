#!/usr/bin/env bash
# LRMsmm — one-command install / update on an Ubuntu/Debian VPS.
#
#   sudo bash install.sh lrmsmm.playgo.id            # first install or update
#   sudo bash install.sh lrmsmm.playgo.id --port 3077
#
# Safe to re-run: code is replaced, but /etc/lrmsmm.env (secrets) and /var/lib/lrmsmm (database + media) are kept,
# and the database is backed up before every update.
set -euo pipefail

DOMAIN="${1:-}"; shift || true
PORT=3077
while [[ $# -gt 0 ]]; do case "$1" in --port) PORT="$2"; shift 2;; *) echo "Unknown option $1"; exit 1;; esac; done
[[ -z "$DOMAIN" ]] && { echo "Usage: sudo bash install.sh <domain> [--port 3077]"; exit 1; }
[[ $EUID -ne 0 ]] && { echo "Jalankan dengan sudo/root."; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
TARBALL="$HERE/lrmsmm.tar.gz"
APP=/opt/lrmsmm
DATA=/var/lib/lrmsmm
ENVF=/etc/lrmsmm.env
SVC=lrmsmm
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

[[ -f "$TARBALL" ]] || { echo "lrmsmm.tar.gz tidak ditemukan di $HERE"; exit 1; }
command -v apt-get >/dev/null || { echo "Script ini untuk Ubuntu/Debian (apt)."; exit 1; }

# ---------- 1. system packages ----------
say "Cek Node.js, ffmpeg, dll"
need_node=1
if command -v node >/dev/null; then
  v=$(node -p 'process.versions.node'); maj=${v%%.*}; rest=${v#*.}; min=${rest%%.*}
  if (( maj > 22 || (maj == 22 && min >= 5) )); then need_node=0; else warn "Node $v terlalu lama (butuh >= 22.5)"; fi
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates ffmpeg tar openssl sqlite3 iproute2 >/dev/null
if (( need_node )); then
  say "Pasang Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "node $(node -v), ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"

# ---------- 2. user, folders ----------
id -u lrmsmm >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin lrmsmm
mkdir -p "$APP" "$DATA" "$DATA/backups"
chown -R lrmsmm:lrmsmm "$DATA"

# port check (only on first install)
if [[ ! -f "$ENVF" ]] && ss -ltn "( sport = :$PORT )" | grep -q LISTEN; then
  echo "Port $PORT sudah dipakai aplikasi lain. Jalankan ulang dengan --port <port lain>"; exit 1
fi

# ---------- 3. secrets (created once, never overwritten) ----------
if [[ ! -f "$ENVF" ]]; then
  say "Buat $ENVF (kunci enkripsi baru)"
  cat > "$ENVF" <<EOF
NODE_ENV=production
PUBLIC_URL=https://$DOMAIN
PORT=$PORT
DATA_DIR=$DATA
APP_TIMEZONE=Asia/Jakarta
ENCRYPTION_KEY=$(openssl rand -hex 32)
WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 16)
UNREPLIED_ALERT_SECONDS=300
ALLOW_SIGNUP=0
# ---- isi dari developers.facebook.com, lalu: sudo systemctl restart lrmsmm ----
IG_APP_ID=
IG_APP_SECRET=
THREADS_APP_ID=
THREADS_APP_SECRET=
# SMTP_URL=smtps://user:pass@smtp.gmail.com:465
# MAIL_FROM=LRMsmm <lrmsmm@playgo.id>
EOF
  chmod 600 "$ENVF"
else
  PORT=$(grep -E '^PORT=' "$ENVF" | cut -d= -f2)
  say "Pakai $ENVF yang sudah ada (port $PORT)"
fi

# ---------- 4. code ----------
if [[ -f "$DATA/lrmsmm.db" ]]; then
  ts=$(date +%Y%m%d-%H%M%S)
  say "Backup database → $DATA/backups/lrmsmm-$ts.db"
  if command -v sqlite3 >/dev/null; then sqlite3 "$DATA/lrmsmm.db" ".backup '$DATA/backups/lrmsmm-$ts.db'"; else cp "$DATA/lrmsmm.db" "$DATA/backups/lrmsmm-$ts.db"; fi
  ls -1t "$DATA"/backups/*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
fi
say "Pasang kode di $APP"
rm -rf "$APP.new" && mkdir -p "$APP.new"
tar -xzf "$TARBALL" -C "$APP.new"
(cd "$APP.new" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
rm -rf "$APP.old"; [[ -d "$APP" ]] && mv "$APP" "$APP.old"; mv "$APP.new" "$APP"
chown -R root:root "$APP"

# ---------- 5. systemd ----------
cat > /etc/systemd/system/$SVC.service <<EOF
[Unit]
Description=LRMsmm social publisher
After=network-online.target
Wants=network-online.target

[Service]
User=lrmsmm
Group=lrmsmm
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$(command -v node) --no-warnings src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now $SVC >/dev/null 2>&1 || true
systemctl restart $SVC

say "Tunggu aplikasi menyala"
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
if ! curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null; then
  journalctl -u $SVC -n 40 --no-pager
  if [[ -d "$APP.old" ]]; then warn "Gagal start — kembali ke versi sebelumnya"; rm -rf "$APP"; mv "$APP.old" "$APP"; systemctl restart $SVC; fi
  exit 1
fi
echo "OK: aplikasi jalan di 127.0.0.1:$PORT"

# ---------- 6. reverse proxy + HTTPS ----------
say "Pasang reverse proxy untuk $DOMAIN"
PUBIP=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || true)
DNSIP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
dns_ok=0; [[ -n "$PUBIP" && "$PUBIP" == "$DNSIP" ]] && dns_ok=1
(( dns_ok )) || warn "DNS $DOMAIN → '${DNSIP:-belum ada}', IP server ini '${PUBIP:-?}'. Tambahkan A record dulu agar HTTPS bisa dibuat."

if systemctl is-active --quiet nginx 2>/dev/null || command -v nginx >/dev/null; then
  CONF=/etc/nginx/sites-available/$DOMAIN
  [[ -d /etc/nginx/sites-available ]] || CONF=/etc/nginx/conf.d/$DOMAIN.conf
  if [[ ! -f "$CONF" ]] || grep -q "managed-by-lrmsmm" "$CONF"; then
    cat > "$CONF" <<EOF
# managed-by-lrmsmm
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 110m;

    location /v1/events {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_request_buffering off;
    }
}
EOF
    [[ -d /etc/nginx/sites-enabled ]] && ln -sf "$CONF" /etc/nginx/sites-enabled/$DOMAIN
    nginx -t && systemctl reload nginx
  else
    warn "$CONF sudah ada dan bukan buatan script ini — tidak diubah."
  fi
  if (( dns_ok )); then
    command -v certbot >/dev/null || apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || warn "certbot gagal — cek DNS/firewall port 80, lalu: sudo certbot --nginx -d $DOMAIN"
  fi
elif command -v caddy >/dev/null; then
  if ! grep -q "$DOMAIN" /etc/caddy/Caddyfile 2>/dev/null; then
    printf '\n%s {\n  reverse_proxy 127.0.0.1:%s {\n    flush_interval -1\n  }\n  request_body {\n    max_size 110MB\n  }\n}\n' "$DOMAIN" "$PORT" >> /etc/caddy/Caddyfile
  fi
  systemctl reload caddy
else
  say "Belum ada web server — pasang Caddy (HTTPS otomatis)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  printf '%s {\n  reverse_proxy 127.0.0.1:%s {\n    flush_interval -1\n  }\n  request_body {\n    max_size 110MB\n  }\n}\n' "$DOMAIN" "$PORT" > /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
fi

# ---------- 7. done ----------
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/healthz" || true)
say "Selesai"
echo "Aplikasi : http://127.0.0.1:$PORT (service: systemctl status $SVC)"
echo "HTTPS    : https://$DOMAIN/healthz → ${code:-000}"
echo "Secrets  : $ENVF   Data: $DATA   Log: journalctl -u $SVC -f"
echo "Webhook verify token: $(grep -E '^WEBHOOK_VERIFY_TOKEN=' "$ENVF" | cut -d= -f2)"
if ! grep -qE '^IG_APP_ID=.+' "$ENVF"; then
  warn "Kredensial Meta belum diisi. Edit: sudo nano $ENVF  lalu: sudo systemctl restart $SVC"
fi
echo "Buka https://$DOMAIN — user pertama yang daftar jadi Owner."
