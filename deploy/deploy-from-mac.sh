#!/usr/bin/env bash
# Run this on your Mac (Terminal), in the folder that contains lrmsmm.tar.gz + install.sh:
#   bash deploy-from-mac.sh root@IP_VPS            # or user@IP_VPS (needs sudo)
#   bash deploy-from-mac.sh root@IP_VPS -p 2222    # custom SSH port
set -euo pipefail
TARGET="${1:-}"; shift || true
[[ -z "$TARGET" ]] && { echo "Usage: bash deploy-from-mac.sh user@ip-vps [-p ssh-port]"; exit 1; }
SSHPORT=22
[[ "${1:-}" == "-p" ]] && SSHPORT="$2"
DOMAIN="${DOMAIN:-lrmsmm.playgo.id}"
cd "$(dirname "$0")"
echo "==> Upload ke $TARGET"
ssh -p "$SSHPORT" "$TARGET" 'mkdir -p ~/lrmsmm-deploy'
scp -P "$SSHPORT" lrmsmm.tar.gz install.sh "$TARGET":~/lrmsmm-deploy/
echo "==> Install / update di server (domain $DOMAIN)"
ssh -t -p "$SSHPORT" "$TARGET" "sudo bash ~/lrmsmm-deploy/install.sh $DOMAIN"
