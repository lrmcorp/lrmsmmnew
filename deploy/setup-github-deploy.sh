#!/usr/bin/env bash
# One-time setup for GitHub Actions auto-deploy. Run on your Mac:
#   bash deploy/setup-github-deploy.sh root@IP_VPS [-p 22]
# It creates a dedicated SSH key, authorises it on the VPS, and (if the GitHub CLI is installed)
# stores the secrets in lrmcorp/lrmsmmnew. Nothing secret is printed.
set -euo pipefail
TARGET="${1:-}"; shift || true
[[ -z "$TARGET" || "$TARGET" != *@* ]] && { echo "Usage: bash deploy/setup-github-deploy.sh user@ip-vps [-p ssh-port]"; exit 1; }
PORT=22; [[ "${1:-}" == "-p" ]] && PORT="$2"
REPO="${REPO:-lrmcorp/lrmsmmnew}"
KEY="$HOME/.ssh/lrmsmm_deploy"
USER_PART="${TARGET%@*}"; HOST_PART="${TARGET#*@}"

mkdir -p "$HOME/.ssh"
[[ -f "$KEY" ]] || ssh-keygen -t ed25519 -N "" -C "github-actions-lrmsmm-deploy" -f "$KEY" -q
echo "==> Mendaftarkan kunci deploy di $TARGET (masukkan password/SSH seperti biasa)"
ssh -p "$PORT" "$TARGET" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && grep -qxF '$(cat "$KEY.pub")' ~/.ssh/authorized_keys || echo '$(cat "$KEY.pub")' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
ssh -i "$KEY" -p "$PORT" -o BatchMode=yes "$TARGET" true && echo "OK: login dengan kunci deploy berhasil"
if [[ "$USER_PART" != root ]]; then
  ssh -i "$KEY" -p "$PORT" -o BatchMode=yes "$TARGET" 'sudo -n true' 2>/dev/null \
    || echo "!! User $USER_PART butuh sudo tanpa password untuk install.sh (atau pakai root@)."
fi

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  echo "==> Menyimpan secrets di $REPO"
  gh secret set VPS_SSH_KEY --repo "$REPO" < "$KEY"
  gh secret set VPS_HOST --repo "$REPO" --body "$HOST_PART"
  gh secret set VPS_USER --repo "$REPO" --body "$USER_PART"
  gh secret set VPS_PORT --repo "$REPO" --body "$PORT"
  echo "Selesai. Push berikutnya ke main akan otomatis deploy. Jalankan manual: gh workflow run 'Test & Deploy' --repo $REPO"
else
  cat <<EOF

GitHub CLI belum terpasang/login. Tambahkan secrets manual di
https://github.com/$REPO/settings/secrets/actions  → New repository secret:
  VPS_HOST    = $HOST_PART
  VPS_USER    = $USER_PART
  VPS_PORT    = $PORT
  VPS_SSH_KEY = isi file $KEY   (salin dengan: pbcopy < $KEY)
EOF
fi
