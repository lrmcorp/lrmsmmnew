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
CF_V4=$(curl -fsS https://www.cloudflare.com/ips-v4 2>/dev/null || true)
CF_V6=$(curl -fsS https://www.cloudflare.com/ips-v6 2>/dev/null || true)
[[ -z "$CF_V4" ]] && CF_V4=$'173.245.48.0/20\n103.21.244.0/22\n103.22.200.0/22\n103.31.4.0/22\n141.101.64.0/18\n108.162.192.0/18\n190.93.240.0/20\n188.114.96.0/20\n197.234.240.0/22\n198.41.128.0/17\n162.158.0.0/15\n104.16.0.0/13\n104.24.0.0/14\n172.64.0.0/13\n131.0.72.0/22'
in_cf() { python3 -c 'import ipaddress,sys; ip=ipaddress.ip_address(sys.argv[1]); print(any(ip in ipaddress.ip_network(n.strip()) for n in sys.argv[2].split() if n.strip()))' "$1" "$CF_V4" 2>/dev/null; }
MODE=none
if [[ -n "$DNSIP" && "$(in_cf "$DNSIP")" == "True" ]]; then MODE=cloudflare
elif [[ -n "$PUBIP" && "$PUBIP" == "$DNSIP" ]]; then MODE=direct
fi
case $MODE in
  cloudflare) echo "DNS $DOMAIN lewat Cloudflare (proxied/awan oranye)";;
  direct) echo "DNS $DOMAIN langsung ke server ini ($PUBIP)";;
  *) warn "DNS $DOMAIN → '${DNSIP:-belum ada}', IP server ini '${PUBIP:-?}'. Tambahkan A record dulu, lalu jalankan ulang script ini.";;
esac

ACME=/var/www/lrmsmm-acme
SSLDIR=/etc/ssl/lrmsmm
mkdir -p "$ACME" "$SSLDIR"

if systemctl is-active --quiet nginx 2>/dev/null || command -v nginx >/dev/null; then
  CONF=/etc/nginx/sites-available/$DOMAIN
  [[ -d /etc/nginx/sites-available ]] || CONF=/etc/nginx/conf.d/$DOMAIN.conf
  if [[ -f "$CONF" ]] && ! grep -q "managed-by-lrmsmm" "$CONF"; then
    warn "$CONF sudah ada dan bukan buatan script ini — tidak diubah."
  else
    # Certificate: Let's Encrypt if we already have one, otherwise a temporary self-signed one.
    LE=/etc/letsencrypt/live/$DOMAIN
    if [[ -f "$LE/fullchain.pem" ]]; then CRT=$LE/fullchain.pem; KEY=$LE/privkey.pem
    else
      if [[ ! -f "$SSLDIR/self.crt" ]]; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$DOMAIN" -keyout "$SSLDIR/self.key" -out "$SSLDIR/self.crt" >/dev/null 2>&1
      fi
      CRT=$SSLDIR/self.crt; KEY=$SSLDIR/self.key
    fi
    # Cloudflare: restore the visitor's real IP from CF-Connecting-IP (only trusted from Cloudflare ranges).
    REALIP=""
    if [[ $MODE == cloudflare ]]; then
      for n in $CF_V4 $CF_V6; do REALIP+="    set_real_ip_from $n;"$'\n'; done
      REALIP+="    real_ip_header CF-Connecting-IP;"
    fi
    V6=""; [[ -s /proc/net/if_inet6 ]] && V6=1
    write_conf() {
      cat > "$CONF" <<EOF
# managed-by-lrmsmm — regenerated by install.sh
server {
    listen 80;
${V6:+    listen [::]:80;}
    server_name $DOMAIN;
$REALIP
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
${V6:+    listen [::]:443 ssl;}
    http2 on;
    server_name $DOMAIN;
    ssl_certificate $1;
    ssl_certificate_key $2;
    client_max_body_size 110m;
$REALIP
    location /.well-known/acme-challenge/ { root $ACME; }
    location /v1/events {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 1h;
    }
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_request_buffering off;
    }
}
EOF
    }
    # never leave nginx broken for the other sites on this server
    nginx_apply() {
      if [[ $(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1 | awk -F. '{print ($1*100+$2 < 125)}') == 1 ]]; then
        sed -i 's/^    http2 on;$//; s/listen 443 ssl;/listen 443 ssl http2;/; s/listen \[::\]:443 ssl;/listen [::]:443 ssl http2;/' "$CONF"
      fi
      if nginx -t >/dev/null 2>&1; then systemctl reload nginx; return 0; fi
      nginx -t || true
      if [[ -f "$CONF.bak" ]]; then mv "$CONF.bak" "$CONF"; else rm -f "$CONF" /etc/nginx/sites-enabled/$DOMAIN; fi
      warn "Konfigurasi nginx untuk $DOMAIN ditolak — dibatalkan, situs lain tidak terpengaruh. Kirim output di atas ke Claude."
      exit 1
    }
    [[ -f "$CONF" ]] && cp "$CONF" "$CONF.bak"
    write_conf "$CRT" "$KEY"
    [[ -d /etc/nginx/sites-enabled ]] && ln -sf "$CONF" /etc/nginx/sites-enabled/$DOMAIN
    nginx_apply
    rm -f "$CONF.bak"

    # Let's Encrypt via webroot — works for DNS-only and for Cloudflare-proxied records alike.
    if [[ $MODE != none && ! -f "$LE/fullchain.pem" ]]; then
      command -v certbot >/dev/null || apt-get install -y -qq certbot >/dev/null
      if certbot certonly --webroot -w "$ACME" -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email \
           --deploy-hook "systemctl reload nginx" >/dev/null 2>&1; then
        cp "$CONF" "$CONF.bak"; write_conf "$LE/fullchain.pem" "$LE/privkey.pem"; nginx_apply; rm -f "$CONF.bak"
        echo "Sertifikat Let's Encrypt terpasang (diperpanjang otomatis oleh certbot)."
      else
        warn "Let's Encrypt gagal; server memakai sertifikat self-signed sementara."
        [[ $MODE == cloudflare ]] && warn "Di Cloudflare → SSL/TLS, set mode ke 'Full' (bukan 'Full (strict)') agar tetap jalan, atau pasang Cloudflare Origin Certificate."
      fi
    fi
  fi
elif command -v caddy >/dev/null; then
  if ! grep -q "$DOMAIN" /etc/caddy/Caddyfile 2>/dev/null; then
    printf '\n%s {\n  reverse_proxy 127.0.0.1:%s {\n    flush_interval -1\n    header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}\n  }\n  request_body {\n    max_size 110MB\n  }\n}\n' "$DOMAIN" "$PORT" >> /etc/caddy/Caddyfile
  fi
  systemctl reload caddy
else
  say "Belum ada web server — pasang Caddy (HTTPS otomatis)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  printf '%s {\n  reverse_proxy 127.0.0.1:%s {\n    flush_interval -1\n    header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}\n  }\n  request_body {\n    max_size 110MB\n  }\n}\n' "$DOMAIN" "$PORT" > /etc/caddy/Caddyfile
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
if [[ $MODE == cloudflare ]]; then
  echo
  echo "Cloudflare — cek 3 hal ini di dashboard Cloudflare (playgo.id):"
  echo "  1. SSL/TLS → mode 'Full (strict)' kalau Let's Encrypt sukses di atas, kalau tidak 'Full'. Jangan 'Flexible'."
  echo "  2. Security → WAF → Custom rules → Skip (semua fitur keamanan) untuk:"
  echo "       (http.host eq \"$DOMAIN\" and (starts_with(http.request.uri.path, \"/m/\") or starts_with(http.request.uri.path, \"/webhooks/\") or starts_with(http.request.uri.path, \"/mcp\") or starts_with(http.request.uri.path, \"/oauth/\") or starts_with(http.request.uri.path, \"/.well-known/\") or starts_with(http.request.uri.path, \"/v1/\")))"
  echo "     Tanpa ini, Bot Fight Mode / challenge bisa memblokir Meta (ambil foto, webhook) dan Claude (MCP)."
  echo "  3. Upload lewat Cloudflare maks 100 MB per request — dashboard otomatis memotong video besar, aman."
fi
echo "Buka https://$DOMAIN — user pertama yang daftar jadi Owner."
