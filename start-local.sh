#!/usr/bin/env bash
# LRMsmm — jalankan di komputer sendiri (localhost).
#   bash start-local.sh            # mode simulasi (Instagram/Threads tiruan, aman untuk coba-coba)
#   bash start-local.sh --reset    # hapus data lokal lalu mulai dari nol
# Stop: tekan Ctrl+C di jendela Terminal ini.
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*"; exit 1; }

# ---- Node.js >= 22.5 ----
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js belum terpasang. Pasang versi 22 atau lebih baru:
  • Homebrew : brew install node
  • Installer: https://nodejs.org (pilih LTS)
Lalu jalankan lagi script ini."
fi
NODE_OK=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a>22||(a===22&&b>=5)?1:0)')
[[ "$NODE_OK" == 1 ]] || fail "Node.js $(node -v) terlalu lama — butuh 22.5 atau lebih baru (brew upgrade node, atau unduh LTS di https://nodejs.org)."

if [[ "${1:-}" == "--reset" ]]; then
  read -r -p "Hapus semua data lokal (akun, post, media)? ketik ya: " ans
  [[ "$ans" == "ya" ]] && rm -rf data && echo "Data lokal dihapus."
fi

# ---- dependencies ----
if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
  bold "Memasang dependensi (sekali saja, ±1 menit)…"
  npm install --no-audit --no-fund --loglevel=error
fi

# ---- local settings (.env dibuat sekali) ----
if [[ ! -f .env ]]; then
  PORT=$(node -e '
    const net=require("net");
    (async()=>{for(let p=3000;p<3100;p++){const ok=await new Promise(r=>{const s=net.createServer().once("error",()=>r(false)).once("listening",()=>s.close(()=>r(true))).listen(p,"127.0.0.1")});if(ok){console.log(p);return}}console.log(3000)})()')
  cat > .env <<EOF
# Dibuat otomatis oleh start-local.sh — mode lokal
META_MOCK=1
PORT=$PORT
PUBLIC_URL=http://localhost:$PORT
ENCRYPTION_KEY=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
WORKER_INTERVAL_MS=5000
UNREPLIED_ALERT_SECONDS=300
APP_TIMEZONE=Asia/Jakarta
EOF
fi
PORT=$(grep -E '^PORT=' .env | cut -d= -f2)
URL=$(grep -E '^PUBLIC_URL=' .env | cut -d= -f2)

command -v ffmpeg >/dev/null 2>&1 || echo "Catatan: ffmpeg tidak ada — upload video tetap bisa, tapi durasi video tidak terbaca (opsional: brew install ffmpeg)."

# ---- open the browser once the server answers ----
(
  for _ in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
      { command -v open >/dev/null && open "$URL"; } || { command -v xdg-open >/dev/null && xdg-open "$URL"; } || true
      break
    fi
    sleep 0.5
  done
) &

echo
bold "LRMsmm lokal → $URL"
echo "Mode simulasi: login Instagram/Threads tiruan, tidak ada yang benar-benar terposting."
echo "Data tersimpan di folder ./data. Tekan Ctrl+C untuk berhenti."
echo
exec node --no-warnings src/server.js
